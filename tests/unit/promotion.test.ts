import { describe, expect, it } from 'vitest';
import {
  gainPromotionPoints,
  promotionCost,
  promotionProgress,
  isReviewStep,
  tryPromote,
  PROMOTION_COSTS,
  REVIEW_INTERVAL,
} from '../../src/engine/promotion.ts';
import { createGame } from '../../src/engine/gameEngine.ts';
import { SeededRandom } from '../../src/engine/rng.ts';
import type { ChoiceEffect, GameState } from '../../src/engine/types.ts';

function zeroEffect(e: Partial<ChoiceEffect> = {}): ChoiceEffect {
  return { politics: 0, execute: 0, network: 0, integrity: 0, promotion: 0, ...e };
}

/** 取一个可变游戏状态副本。 */
function freshState(overrides: Partial<GameState> = {}): GameState {
  const base = createGame('jiwei', 'normal', new SeededRandom(1));
  return { ...base, ...overrides } as GameState;
}

describe('晋升绩效点(用户反馈:选了半天级别不变)', () => {
  it('好表现(净正+廉洁)得分高于坏表现(净负)', () => {
    const good = gainPromotionPoints(zeroEffect({ politics: 4, execute: 3, integrity: 5 }), 'routine', 'normal');
    const bad = gainPromotionPoints(zeroEffect({ politics: -4, integrity: -5 }), 'crisis', 'normal');
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThanOrEqual(3);
    expect(bad).toBeLessThanOrEqual(1);
  });

  it('机遇类事件加分;hard 难度打折、easy 加成', () => {
    const eff = zeroEffect({ politics: 3, execute: 2 });
    const base = gainPromotionPoints(eff, 'routine', 'normal');
    expect(gainPromotionPoints(eff, 'opportunity', 'normal')).toBeGreaterThan(base);
    expect(gainPromotionPoints(eff, 'routine', 'easy')).toBeGreaterThan(base);
    expect(gainPromotionPoints(eff, 'routine', 'hard')).toBeLessThan(base);
  });

  it('得分非负且粒度为 0.5', () => {
    const p = gainPromotionPoints(zeroEffect({ integrity: -10, politics: -10 }), 'crisis', 'hard');
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p * 2).toBe(Math.round(p * 2));
  });
});

describe('晋升成本与进度', () => {
  it('成本随职级递增', () => {
    for (let i = 1; i < PROMOTION_COSTS.length; i++) {
      expect(PROMOTION_COSTS[i]).toBeGreaterThan(PROMOTION_COSTS[i - 1]);
    }
  });

  it('晋升星级高的部门成本更低(组织部5星 vs 政协1星)', () => {
    const zuzhi = freshState();
    zuzhi.dept = { ...zuzhi.dept, ratings: { ...zuzhi.dept.ratings, promotion: 5 } };
    const zhengxie = freshState();
    zhengxie.dept = { ...zhengxie.dept, ratings: { ...zhengxie.dept.ratings, promotion: 1 } };
    expect(promotionCost(zuzhi)).toBeLessThan(promotionCost(zhengxie));
  });

  it('easy 成本低于 normal 低于 hard', () => {
    const easy = freshState({ difficulty: 'easy' });
    const normal = freshState({ difficulty: 'normal' });
    const hard = freshState({ difficulty: 'hard' });
    expect(promotionCost(easy)).toBeLessThan(promotionCost(normal));
    expect(promotionCost(normal)).toBeLessThan(promotionCost(hard));
  });

  it('进度随点数增长,到顶为 1', () => {
    let s = freshState();
    const cost = promotionCost(s);
    s = { ...s, promotionPoints: cost / 2 };
    expect(promotionProgress(s)).toBeCloseTo(0.5, 5);
    // 登顶。
    s = { ...s, rank: s.dept.ranks.length - 1 };
    expect(promotionProgress(s)).toBe(1);
  });
});

describe('年度考核与晋升触发', () => {
  it(`每 ${REVIEW_INTERVAL} 步一次考核`, () => {
    expect(isReviewStep(0)).toBe(false);
    expect(isReviewStep(REVIEW_INTERVAL)).toBe(true);
    expect(isReviewStep(REVIEW_INTERVAL * 2)).toBe(true);
    expect(isReviewStep(REVIEW_INTERVAL + 1)).toBe(false);
  });

  it('点数不足 → 不晋升', () => {
    const s = freshState();
    s.promotionPoints = promotionCost(s) - 0.5;
    expect(tryPromote(s, 'year-review')).toBeNull();
    expect(s.rank).toBe(0);
  });

  it('点数充足且廉洁达标 → 晋升并扣点', () => {
    const s = freshState({ attrs: { politics: 50, execute: 50, network: 50, integrity: 60 } });
    const cost = promotionCost(s);
    s.promotionPoints = cost + 3;
    const rec = tryPromote(s, 'year-review');
    expect(rec).not.toBeNull();
    expect(rec?.fromRank).toBe(s.dept.ranks[0]);
    expect(s.rank).toBe(1);
    expect(s.promotionPoints).toBeCloseTo(3, 5);
    expect(s.promotions).toHaveLength(1);
  });

  it('廉洁度低于门槛 → 暂缓提拔且点数保留', () => {
    const s = freshState({ attrs: { politics: 50, execute: 50, network: 50, integrity: 10 } });
    s.promotionPoints = promotionCost(s) + 10;
    const before = s.promotionPoints;
    expect(tryPromote(s, 'year-review')).toBeNull();
    expect(s.rank).toBe(0);
    expect(s.promotionPoints).toBe(before);
  });

  it('已到顶级 → 不再晋升', () => {
    const s = freshState();
    s.rank = s.dept.ranks.length - 1;
    s.promotionPoints = 999;
    expect(tryPromote(s, 'merit')).toBeNull();
  });
});
