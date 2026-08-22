/**
 * 晋升理论上界分析 — 对每个 部门×难度×策略,用与 mass-rollout 完全同构的
 * mock 管线(场景轮换 → parseEvent → rebalanceEffects → gainPromotionPoints →
 * tryPromote,含 INTEGRITY_GATE 与考核步)模拟 24 步,回答:
 *   1) 最优点数玩法(optimal:每步选 gainPromotionPoints 最大的槽)的晋升上界是多少?
 *   2) good/bad/mixed/random 策略的均值/最大值(与 19,500 人实测对照)?
 *   3) 晋升被廉洁闸门(INTEGRITY_GATE=35)冻结多少次?
 *
 * 用法:NODE_OPTIONS=--experimental-sqlite npx tsx scripts/promotion-ceiling.mts [seeds]
 * 默认 200 个种子(覆盖 amplify 3-6 的随机放大)。输出 JSON 到 stdout,
 * 供文档与图表脚本复现;不写库。
 */
import { createRequire } from 'node:module';
import { DEPARTMENTS } from '../src/engine/departments.ts';
import { SeededRandom, type RNG } from '../src/engine/rng.ts';
import { parseEvent } from '../src/engine/parser.ts';
import { rebalanceEffects } from '../src/engine/effects.ts';
import {
  gainPromotionPoints,
  tryPromote,
  promotionCost,
  isReviewStep,
  PROMOTION_COSTS,
} from '../src/engine/promotion.ts';
import type { Choice, ChoiceEffect, Difficulty, GameState } from '../src/engine/types.ts';

const require = createRequire(import.meta.url);
const { mockGenerate } = require('../server/mockLLM.js') as { mockGenerate: (p: string) => string };

type Policy = 'optimal' | 'good' | 'bad' | 'random' | 'mixed';

const POLICIES: Policy[] = ['optimal', 'good', 'bad', 'mixed', 'random'];
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const MAX_STEPS = 24;

/** 与 mass-rollout.mts pickChoice 相同的打分(用于 good/bad 复刻)。 */
function driverScore(kind: 'good' | 'bad', c: Choice): number {
  const { politics: p, execute: e, network: n, integrity: i } = c.effect;
  return kind === 'good' ? p + e + n + i * 1.5 : p + e + n - i * 1.5;
}

function argmax<T>(arr: T[], f: (x: T) => number): number {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (f(arr[i]) > f(arr[best])) best = i;
  return best;
}

/** 基础状态(与 createGame 一致的属性/职级/点数初值)。 */
function baseState(deptId: string, difficulty: Difficulty): GameState {
  const dept = DEPARTMENTS.find((d) => d.id === deptId)!;
  return {
    sessionId: 'ceiling',
    deptId,
    dept,
    difficulty,
    attrs: { politics: 50, execute: 50, network: 50, integrity: 80 },
    rank: 0,
    promotionPoints: 0,
    promotionPointsSpent: 0,
    year: 2015,
    step: 0,
    maxSteps: MAX_STEPS,
    background: null,
    currentEvent: null,
    timeline: [],
    npcs: [],
    summary: '',
    threads: [],
    usedTitles: [],
    usedChoiceTexts: [],
    usedDirectives: [],
    directiveBag: [],
    usedThemes: [],
    promotions: [],
    repairs: [],
    ended: false,
  };
}

interface SimResult {
  promotions: number;
  finalRank: number;
  freezes: number;
  totalPoints: number;
  /** 每次考核步后的 (step, rank, points, frozen)。 */
  reviews: Array<{ step: number; rank: number; points: number; frozen: boolean }>;
}

/**
 * 模拟一局:与 gameEngine.nextEvent/applyChoice 在 mock 路径上逐步同构。
 * 事件生成按 step 构造 prompt(仅用于 mockGenerate 解析出 step),其余管线
 * (解析 → 再平衡 → 点数 → 考核晋升)与生产代码共用同一函数。
 */
function simulate(
  deptId: string,
  difficulty: Difficulty,
  policy: Policy,
  seed: number,
): SimResult {
  const rng: RNG = new SeededRandom(seed);
  const state = baseState(deptId, difficulty);
  const bias = 0.5; // mixed 取中性偏置(0.25~0.75 中值)
  let freezes = 0;
  let totalPoints = 0;
  const reviews: SimResult['reviews'] = [];

  for (let step = 1; step <= MAX_STEPS; step++) {
    // --- 事件生成(mock):场景按步轮换,效果经解析与再平衡。 ---
    const prompt = `…第${step}步…`;
    const raw = mockGenerate(prompt);
    const event = parseEvent(raw, step);
    const { choices } = rebalanceEffects(event.choices, rng);

    // --- 选择策略。 ---
    let idx: number;
    if (policy === 'optimal') {
      idx = argmax(choices, (c) => gainPromotionPoints(c.effect, event.tag, difficulty));
    } else if (policy === 'good' || policy === 'bad') {
      idx = argmax(choices, (c) => driverScore(policy, c));
    } else if (policy === 'mixed') {
      idx = rng.next() < bias
        ? argmax(choices, (c) => driverScore('good', c))
        : rng.int(0, choices.length - 1);
    } else {
      idx = rng.int(0, choices.length - 1);
    }
    const effect: ChoiceEffect = choices[idx].effect;

    // --- applyChoice 同构:属性 → 点数 → (mock 无 promotion:1) → 考核。 ---
    state.attrs.politics = clamp(state.attrs.politics + effect.politics);
    state.attrs.execute = clamp(state.attrs.execute + effect.execute);
    state.attrs.network = clamp(state.attrs.network + effect.network);
    state.attrs.integrity = clamp(state.attrs.integrity + effect.integrity);
    const gained = gainPromotionPoints(effect, event.tag, difficulty);
    state.promotionPoints += gained;
    totalPoints += gained;
    state.step = step;

    let frozen = false;
    if (isReviewStep(step)) {
      const cost = promotionCost(state);
      if (state.promotionPoints >= cost && state.attrs.integrity < 35) {
        // tryPromote 会因廉洁闸门返回 null:点数保留、晋升冻结。
        freezes++;
        frozen = true;
      }
      tryPromote(state, 'year-review');
      reviews.push({ step, rank: state.rank, points: state.promotionPoints, frozen });
    }
  }
  return { promotions: state.promotions.length, finalRank: state.rank, freezes, totalPoints, reviews };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

// ---- 主流程 ----
const seedCount = Number(process.argv[2] ?? 200);
const out = {
  generatedBy: 'scripts/promotion-ceiling.mts',
  seeds: seedCount,
  maxSteps: MAX_STEPS,
  reviewSteps: Array.from({ length: MAX_STEPS }, (_, i) => i + 1).filter(isReviewStep),
  promotionCosts: PROMOTION_COSTS,
  combos: [] as Array<Record<string, unknown>>,
};

for (const dept of DEPARTMENTS) {
  const ladderLen = dept.ranks.length;
  const starFactor = 1 - (dept.ratings.promotion - 3) * 0.06;
  for (const difficulty of DIFFS) {
    const diffFactor = difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.3 : 1.0;
    const costs = Array.from({ length: ladderLen - 1 }, (_, r) =>
      Math.max(6, Math.round(PROMOTION_COSTS[Math.min(r, PROMOTION_COSTS.length - 1)] * diffFactor * starFactor)),
    );
    const row: Record<string, unknown> = {
      deptId: dept.id,
      deptName: dept.name.split('（')[0],
      difficulty,
      ladderLen,
      promoStar: dept.ratings.promotion,
      starFactor: Number(starFactor.toFixed(3)),
      costs,
      cumCosts: costs.map((_, i) => costs.slice(0, i + 1).reduce((a, b) => a + b, 0)),
      ladderCap: ladderLen - 1,
    };
    for (const policy of POLICIES) {
      const results = Array.from({ length: seedCount }, (_, s) =>
        simulate(dept.id, difficulty, policy, 10_000 + s * 7919),
      );
      const promos = results.map((r) => r.promotions);
      row[`${policy}_mean`] = Number(mean(promos).toFixed(3));
      row[`${policy}_max`] = Math.max(...promos);
      row[`${policy}_min`] = Math.min(...promos);
      row[`${policy}_freeze`] = results.reduce((a, r) => a + r.freezes, 0);
      row[`${policy}_points`] = Number(mean(results.map((r) => r.totalPoints)).toFixed(1));
    }
    out.combos.push(row);
  }
}

console.log(JSON.stringify(out, null, 2));
