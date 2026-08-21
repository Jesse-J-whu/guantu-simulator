/**
 * @file 晋升体系 — 绩效点数驱动,替代旧的纯随机晋升。
 *
 * 用户反馈:选了半天级别不变,体验不到升官的快乐。
 * 新机制:
 *  - 每次选择按表现获得晋升绩效点(表现好 3-6 分,差 0-2 分);
 *  - 每 3 步一次"年度考核",点数达标即晋升并清扣点数;
 *  - 标注"晋升:1"的突出选项立即触发考核;
 *  - 廉洁度过低会被"暂缓提拔";部门晋升星级影响成本。
 *  期望节奏:24 步一局,普通玩家升 2-3 级,优秀玩家升 4-5 级。
 */

import type { ChoiceEffect, EventTag, GameState, PromotionRecord } from './types.ts';

/** 各职级晋升所需基准点数(索引=当前职级)。 */
export const PROMOTION_COSTS = [12, 18, 26, 36, 48, 62, 78];

/** 考核间隔:每 N 步一次年度考核。 */
export const REVIEW_INTERVAL = 3;

/** 难度成本系数。 */
const DIFFICULTY_FACTOR = { easy: 0.8, normal: 1.0, hard: 1.3 };

/** 廉洁度低于此值暂缓提拔。 */
const INTEGRITY_GATE = 35;

/** 一次选择能获得的绩效点。 */
export function gainPromotionPoints(
  effect: ChoiceEffect,
  tag: EventTag,
  difficulty: GameState['difficulty'],
): number {
  const net = effect.politics + effect.execute + effect.network + effect.integrity;
  // 表现分:净效果 -20..+25 映射到 0..5。
  let points = Math.max(0, Math.min(5, 2 + net / 8));
  // 廉洁行为加分。
  if (effect.integrity > 0) points += 1;
  // 机遇类事件更可能带来提拔。
  if (tag === 'opportunity') points += 1;
  // 难度修正:hard 更难升,easy 更容易。
  points *= difficulty === 'easy' ? 1.2 : difficulty === 'hard' ? 0.8 : 1.0;
  return Math.max(0, Math.round(points * 2) / 2);
}

/** 晋升到下一级所需点数(含部门星级与难度修正);已到顶返回 Infinity。 */
export function promotionCost(state: GameState): number {
  const ladderLen = state.dept.ranks.length;
  if (state.rank >= ladderLen - 1) return Infinity;
  const base = PROMOTION_COSTS[Math.min(state.rank, PROMOTION_COSTS.length - 1)];
  const diff = DIFFICULTY_FACTOR[state.difficulty];
  // 部门晋升星级:5星便宜 12%,2星贵 6%。
  const deptFactor = 1 - (state.dept.ratings.promotion - 3) * 0.06;
  return Math.max(6, Math.round(base * diff * deptFactor));
}

/** 晋升进度 0-1(当前点数 / 下一级成本);已到顶为 1。 */
export function promotionProgress(state: GameState): number {
  const cost = promotionCost(state);
  if (!isFinite(cost)) return 1;
  return Math.max(0, Math.min(1, state.promotionPoints / cost));
}

/** 是否处于考核步(每 REVIEW_INTERVAL 步)。 */
export function isReviewStep(step: number): boolean {
  return step > 0 && step % REVIEW_INTERVAL === 0;
}

/**
 * 尝试晋升。返回晋升记录;未达标返回 null。
 * @param reason 触发原因:考核年度或突出表现选项。
 */
export function tryPromote(
  state: GameState,
  reason: PromotionRecord['reason'],
): PromotionRecord | null {
  const ladder = state.dept.ranks;
  if (state.rank >= ladder.length - 1) return null;
  const cost = promotionCost(state);
  if (state.promotionPoints < cost) return null;
  // 廉洁度不足,暂缓提拔(点数保留)。
  if (state.attrs.integrity < INTEGRITY_GATE) return null;

  const record: PromotionRecord = {
    step: state.step,
    year: state.year,
    fromRank: ladder[state.rank],
    toRank: ladder[state.rank + 1],
    reason,
  };
  state.rank += 1;
  state.promotionPoints -= cost;
  state.promotionPointsSpent += cost;
  state.promotions.push(record);
  return record;
}
