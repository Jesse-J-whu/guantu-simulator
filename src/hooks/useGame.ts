/**
 * @file 游戏主 hook — 包装引擎状态机,桥接 React UI 与纯逻辑引擎。
 * 职责:屏幕流转、LLM 客户端注入、反馈数据(属性变化/晋升)、留存上报。
 */

import { useCallback, useRef, useState } from 'react';
import type { ApplyResult, Difficulty, Ending, GameState } from '../engine/types.ts';
import {
  createGame,
  generateBackground,
  nextEvent,
  applyChoice,
  finishGame,
} from '../engine/gameEngine.ts';
import { ProxyLLMClient } from '../engine/llm.ts';
import { RagRetriever, loadRagData, type RagData } from '../engine/rag.ts';
import { MathRandom } from '../engine/rng.ts';
import { trackStart, trackChoice, trackEnd } from '../services/tracking.ts';

/** 屏幕流转状态。 */
export type Screen = 'select' | 'loading' | 'background' | 'game' | 'result';

/** 反馈:属性变化弹层。 */
export interface Feedback {
  effects: ApplyResult['effects'];
  pointsGained: number;
  promoted: boolean;
}

export interface UseGame {
  screen: Screen;
  state: GameState | null;
  ending: Ending | null;
  loadingText: string;
  loadingSubtext: string;
  error: string | null;
  feedback: Feedback | null;
  lastApply: ApplyResult | null;
  pendingNext: GameState | null;
  dismissFeedback: () => void;
  selectedDeptId: string | null;
  selectDept: (id: string | null) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  startGame: () => Promise<void>;
  beginGame: () => Promise<void>;
  choose: (idx: number) => Promise<void>;
  retryEvent: () => Promise<void>;
  continueAfterPromotion: () => void;
  restart: () => void;
}

let ragInstance: RagRetriever | null = null;
let ragPromise: Promise<RagRetriever | null> | null = null;

async function ensureRag(): Promise<RagRetriever | null> {
  if (ragInstance) return ragInstance;
  if (!ragPromise) {
    ragPromise = loadRagData().then((data: RagData | null) => {
      ragInstance = new RagRetriever(data);
      return ragInstance;
    });
  }
  return ragPromise;
}

/** 游戏主 hook。 */
export function useGame(): UseGame {
  const [screen, setScreen] = useState<Screen>('select');
  const [state, setState] = useState<GameState | null>(null);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [loadingText, setLoadingText] = useState('');
  const [loadingSubtext, setLoadingSubtext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastApply, setLastApply] = useState<ApplyResult | null>(null);
  const [pendingNext, setPendingNext] = useState<GameState | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const llmRef = useRef(new ProxyLLMClient());
  const rngRef = useRef(new MathRandom());

  const dismissFeedback = useCallback(() => setFeedback(null), []);

  /** 生成下一个事件(首事件/选择后/重试共用)。 */
  const generateNext = useCallback(async (current: GameState) => {
    setError(null);
    setScreen('loading');
    setLoadingText('天机推演中…');
    setLoadingSubtext('组织正在考察你的表现');
    const rag = await ensureRag();
    try {
      const next = await nextEvent(current, llmRef.current, rag, rngRef.current);
      setState(next);
      setScreen('game');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // 保留原状态回游戏屏,展示重试按钮。
      setState({ ...current });
      setScreen('game');
    }
  }, []);

  /** 开局:创建状态 → 生成背景。 */
  const startGame = useCallback(async () => {
    if (!selectedDeptId) return;
    setError(null);
    setScreen('loading');
    setLoadingText('正在生成你的官途背景…');
    const game = createGame(selectedDeptId, difficulty, rngRef.current);
    setState(game);
    setLoadingSubtext(
      `${game.dept.name} · ${difficulty === 'easy' ? '轻松' : difficulty === 'hard' ? '硬核' : '标准'}模式`,
    );
    trackStart({
      sessionId: game.sessionId,
      deptId: game.deptId,
      deptName: game.dept.name,
      difficulty,
      maxSteps: game.maxSteps,
    });
    try {
      const withBg = await generateBackground(game, llmRef.current);
      setState(withBg);
      setScreen('background');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setScreen('select');
    }
  }, [selectedDeptId, difficulty]);

  /** 背景页 → 第一个事件。 */
  const beginGame = useCallback(async () => {
    if (!state) return;
    await generateNext(state);
  }, [state, generateNext]);

  /** 玩家选择:应用效果 → 反馈 → (晋升庆祝) → 下一事件/结局。 */
  const choose = useCallback(
    async (idx: number) => {
      if (!state || !state.currentEvent) return;
      const result = applyChoice(state, idx);
      setState(result.state);
      setLastApply(result);
      setFeedback({
        effects: result.effects,
        pointsGained: result.pointsGained,
        promoted: result.promoted,
      });

      const tl = result.state.timeline[result.state.timeline.length - 1];
      trackChoice({
        sessionId: result.state.sessionId,
        step: tl.step,
        year: tl.year,
        eventTitle: tl.title,
        eventTag: tl.tagLabel,
        choiceText: tl.choice,
        effects: tl.effects,
        attrsAfter: tl.attrsAfter,
        rankAfter: tl.rankAfter,
        promoted: tl.promoted,
      });

      if (result.state.ended) {
        const finalEnding = finishGame(result.state);
        setEnding(finalEnding);
        trackEnd({
          sessionId: result.state.sessionId,
          stepsDone: result.state.step,
          finalRank: finalEnding.finalRank,
          endingType: finalEnding.endingType,
          promotions: result.state.promotions.length,
          attrs: result.state.attrs,
          timeline: result.state.timeline,
        });
        setScreen('loading');
        setLoadingText('正在生成你的官途结局…');
        setLoadingSubtext('岁月沉淀，尘埃落定');
        setTimeout(() => setScreen('result'), 1200);
        return;
      }

      if (result.promoted) {
        // 先庆祝,弹层关闭后由 GameScreen 调 generateNext(pendingNext)。
        setPendingNext(result.state);
        return;
      }
      setTimeout(() => void generateNext(result.state), 900);
    },
    [state, generateNext],
  );

  const retryEvent = useCallback(async () => {
    if (state) await generateNext(state);
  }, [state, generateNext]);

  /** 晋升庆祝关闭后继续推演。 */
  const continueAfterPromotion = useCallback(() => {
    setFeedback(null);
    const pending = pendingNext;
    setPendingNext(null);
    if (pending) void generateNext(pending);
  }, [pendingNext, generateNext]);

  const restart = useCallback(() => {
    setScreen('select');
    setState(null);
    setEnding(null);
    setSelectedDeptId(null);
    setFeedback(null);
    setLastApply(null);
    setPendingNext(null);
    setError(null);
  }, []);

  return {
    screen,
    state,
    ending,
    loadingText,
    loadingSubtext,
    error,
    feedback,
    dismissFeedback,
    lastApply,
    pendingNext,
    selectedDeptId,
    selectDept: setSelectedDeptId,
    difficulty,
    setDifficulty,
    startGame,
    beginGame,
    choose,
    retryEvent,
    continueAfterPromotion,
    restart,
  };
}
