/**
 * @file 游戏引擎编排 — 状态机核心,串联生成/解析/修复/晋升/结局。
 *
 * 设计:引擎函数一律返回新状态(structuredClone),不修改入参,便于 React 与测试推理。
 */

import type {
  ApplyResult,
  Background,
  Difficulty,
  Ending,
  GameEvent,
  GameState,
  LLMClient,
} from './types.ts';
import { getDeptById } from './departments.ts';
import { MathRandom, type RNG } from './rng.ts';
import { parseEvent, parseBackground } from './parser.ts';
import { rebalanceEffects, netSum } from './effects.ts';
import { fixRankFacts } from './rankRules.ts';
import { checkEventFreshness } from './dedup.ts';
import { mergeNPCs, buildSummary, addThread } from './storyMemory.ts';
import {
  gainPromotionPoints,
  tryPromote,
  promotionProgress,
  isReviewStep,
} from './promotion.ts';
import {
  buildEventPrompt,
  buildBackgroundPrompt,
  NARRATIVE_DIRECTIVES,
} from './promptBuilder.ts';
import { computeEnding } from './ending.ts';
import type { RagRetriever } from './rag.ts';

/** 一局固定步数:足够体验完整晋升曲线(用户反馈旧版十几次选择反馈太弱)。 */
export const DEFAULT_MAX_STEPS = 24;

/** 预设开局兜底(LLM 失败时使用)。 */
const FALLBACK_BACKGROUNDS: Record<string, Background> = {
  weiban: {
    level: '省级',
    origin: '名校硕士研究生，省委统一遴选',
    background: '普通家庭',
    openingText:
      '你叫林若尘，中山大学政治学硕士，以笔试第一的成绩通过省委办公厅遴选，成为综合一处的一名年轻科员。报到的第一天，综合处长老王把你叫到办公室："小林，委办是全省最重要的大脑，也是最烧脑的地方。材料要快、要准、要稳。"窗外，省委大院的松柏在晨风中沉默地矗立。',
    rankTitle: '省委办公厅 综合一处 科员',
  },
  default: {
    level: '县级',
    origin: '公务员招考',
    background: '普通家庭',
    openingText:
      '你通过省统一公务员考试，以优秀的成绩成功上岸，从数千名竞争者中脱颖而出，踏入了体制的大门。报到那天，你望着眼前庄严的办公楼，心中既有期待，也有忐忑。这里将是你施展抱负的舞台，也将是你人生最重要的考场。',
    rankTitle: '科员',
  },
};

/** 创建新对局状态。 */
export function createGame(
  deptId: string,
  difficulty: Difficulty,
  rng: RNG = new MathRandom(),
): GameState {
  const dept = getDeptById(deptId);
  return {
    sessionId: `s_${Date.now().toString(36)}_${Math.floor(rng.next() * 1e9).toString(36)}`,
    deptId,
    dept,
    difficulty,
    attrs: { politics: 50, execute: 50, network: 50, integrity: 80 },
    rank: 0,
    promotionPoints: 0,
    promotionPointsSpent: 0,
    year: 2015,
    step: 0,
    maxSteps: DEFAULT_MAX_STEPS,
    background: null,
    currentEvent: null,
    timeline: [],
    npcs: [],
    summary: '（刚踏上官途）',
    threads: [],
    usedTitles: [],
    usedDirectives: [],
    directiveBag: rng.shuffle(NARRATIVE_DIRECTIVES.map((d) => d.text)),
    usedThemes: [],
    promotions: [],
    repairs: [],
    ended: false,
  };
}

/** 抽取叙事指令(袋空自动重洗,保证一局内不短期重复)。 */
function drawDirective(state: GameState, rng: RNG): { text: string; tag: (typeof NARRATIVE_DIRECTIVES)[number]['tag'] } {
  if (state.directiveBag.length === 0) {
    state.directiveBag = rng.shuffle(NARRATIVE_DIRECTIVES.map((d) => d.text));
  }
  const text = state.directiveBag.pop() as string;
  state.usedDirectives.push(text);
  const found = NARRATIVE_DIRECTIVES.find((d) => d.text === text);
  return { text, tag: found ? found.tag : 'daily' };
}

/** 生成开局背景(LLM 失败回退预设)。 */
export async function generateBackground(state: GameState, llm: LLMClient): Promise<GameState> {
  const next = structuredClone(state);
  const diffLabel =
    state.difficulty === 'easy' ? 'easy' : state.difficulty === 'hard' ? 'hard' : 'normal';
  let bg: Background | null = null;
  try {
    const content = await llm.generate(buildBackgroundPrompt(next.dept.name, diffLabel), {
      maxTokens: 1000,
      temperature: 0.75,
    });
    bg = parseBackground(content);
  } catch {
    bg = null;
  }
  next.background = bg || FALLBACK_BACKGROUNDS[next.deptId] || FALLBACK_BACKGROUNDS.default;
  return next;
}

/**
 * 生成下一个事件:构建提示词 → LLM → 解析 → 职级修正 → 去重检查(必要时重试一次)
 * → 效果再平衡 → 更新故事记忆。任何失败抛错,由 UI 层提示重试。
 */
export async function nextEvent(
  state: GameState,
  llm: LLMClient,
  rag: RagRetriever | null = null,
  rng: RNG = new MathRandom(),
): Promise<GameState> {
  const next = structuredClone(state);
  if (next.step >= next.maxSteps) throw new Error('对局已结束,不能再生成事件');

  const directive = drawDirective(next, rng);
  const progress = next.step / next.maxSteps;
  const ragSection = rag
    ? rag.buildPromptSection(next.deptId, next.dept.ranks[Math.min(next.rank, next.dept.ranks.length - 1)], directive.tag, progress)
    : '';
  const lastEvent = next.currentEvent;

  const promptParams = {
    state: next,
    directive: directive.text,
    lastEvent,
    ragSection,
  };

  let event: GameEvent | null = null;
  let avoidNote = '';
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const content = await llm.generate(buildEventPrompt({ ...promptParams, avoidNote: avoidNote || undefined }), {
      maxTokens: 1600,
      temperature: attempt === 0 ? 0.85 : 0.6,
    });
    let candidate: GameEvent;
    try {
      candidate = parseEvent(content, next.step);
    } catch (e) {
      // 格式违规(缺标记/零选项)在真实上游约7%概率出现:携带纠错说明重试。
      if (attempt < MAX_ATTEMPTS - 1) {
        avoidNote = `上次输出未按格式解析(${(e as Error).message}),必须严格按【】标记输出全部字段与四个选项`;
        continue;
      }
      throw e;
    }

    // 1) 职级事实修正。
    const { text: fixedDesc, fixes } = fixRankFacts(candidate.desc);
    candidate.desc = fixedDesc;
    for (const f of fixes) {
      candidate.repairs.push({ kind: 'rank-fix', detail: `${f.matched} → ${f.fixed}(${f.reason})` });
    }

    // 2) 去重检查。
    const freshness = checkEventFreshness(candidate, next.usedTitles);
    if (!freshness.fresh && attempt < MAX_ATTEMPTS - 1) {
      avoidNote = `与已有事件重复(${freshness.reasons.join(';')}),必须换一个完全不同的切入点`;
      continue;
    }
    if (!freshness.fresh) {
      candidate.repairs.push({ kind: 'dedup-retry', detail: `仍疑似重复:${avoidNote}` });
    }

    // 3) 效果再平衡。
    const { choices, notes } = rebalanceEffects(candidate.choices, rng);
    candidate.choices = choices;
    for (const n of notes) candidate.repairs.push({ kind: 'effect-rebalance', detail: n });

    event = candidate;
    break;
  }

  if (!event) throw new Error('事件生成失败');

  // 4) 更新故事记忆。
  next.usedTitles.push(event.title);
  mergeNPCs(next, event, next.step);
  next.currentEvent = event;
  next.repairs.push(...event.repairs);
  return next;
}

/**
 * 应用玩家选择:属性变化 → 绩效点 → (突出表现即时考核) → 年度考核 → 时间线与摘要。
 * 返回新状态 + 即时反馈数据。
 */
export function applyChoice(state: GameState, choiceIdx: number): ApplyResult {
  const next = structuredClone(state);
  const event = next.currentEvent;
  if (!event) throw new Error('当前没有事件');
  const choice = event.choices[choiceIdx];
  if (!choice) throw new Error(`无效选项:${choiceIdx}`);

  const attrsBefore = { ...next.attrs };
  const effect = choice.effect;

  // 1) 属性变化(0-100)。
  next.attrs.politics = clamp(next.attrs.politics + effect.politics);
  next.attrs.execute = clamp(next.attrs.execute + effect.execute);
  next.attrs.network = clamp(next.attrs.network + effect.network);
  next.attrs.integrity = clamp(next.attrs.integrity + effect.integrity);

  // 2) 晋升绩效点。
  const pointsGained = gainPromotionPoints(effect, event.tag, next.difficulty);
  next.promotionPoints += pointsGained;

  // 3) 突出表现选项(晋升:1)立即触发考核。
  let promotion = effect.promotion > 0 ? tryPromote(next, 'choice') : null;

  // 4) 推进步数与年份。
  next.step += 1;
  next.year += 1;

  // 5) 年度考核晋升。
  if (!promotion && isReviewStep(next.step)) {
    promotion = tryPromote(next, 'year-review');
  }

  // 6) 时间线与摘要。
  next.timeline.push({
    step: next.step,
    year: next.year,
    title: event.title,
    tagLabel: event.tagLabel,
    choice: choice.text,
    effects: { ...effect },
    attrsAfter: { ...next.attrs },
    rankAfter: next.rank,
    promoted: promotion !== null,
  });
  next.summary = buildSummary(next);

  // 7) 重大事件登记未决线索。
  if (
    (event.tag === 'temptation' || event.tag === 'politics' || event.tag === 'crisis') &&
    effect.integrity <= -3
  ) {
    addThread(next, `「${event.title}」中${choice.text.slice(0, 18)},留下隐患`);
  }

  next.ended = next.step >= next.maxSteps;

  return {
    state: next,
    effects: { ...effect },
    attrsBefore,
    attrsAfter: { ...next.attrs },
    promoted: promotion !== null,
    promotion,
    promotionProgress: promotionProgress(next),
    pointsGained,
  };
}

/** 计算结局(终局调用)。 */
export function finishGame(state: GameState): Ending {
  return computeEnding(state);
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

/** 导出给 UI/统计使用的工具。 */
export { netSum };
