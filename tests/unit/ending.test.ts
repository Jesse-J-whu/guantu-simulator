import { describe, expect, it } from 'vitest';
import { computeEnding } from '../../src/engine/ending.ts';
import { createGame } from '../../src/engine/gameEngine.ts';
import { SeededRandom } from '../../src/engine/rng.ts';
import type { GameState } from '../../src/engine/types.ts';

function stateWith(overrides: {
  attrs?: Partial<GameState['attrs']>;
  rank?: number;
  promotions?: number;
  difficulty?: GameState['difficulty'];
}): GameState {
  const s = createGame('weiban', 'normal', new SeededRandom(1));
  return {
    ...s,
    attrs: { ...s.attrs, ...overrides.attrs },
    rank: overrides.rank ?? 0,
    promotions: Array.from({ length: overrides.promotions ?? 0 }, (_, i) => ({
      step: i, year: 2016 + i, fromRank: '科员', toRank: '副科级', reason: 'year-review' as const,
    })),
    difficulty: overrides.difficulty ?? 'normal',
  };
}

describe('结局分档', () => {
  it('廉洁度崩盘 → BAD(落马)', () => {
    const s = stateWith({ attrs: { integrity: 20 }, promotions: 2 });
    const e = computeEnding(s);
    expect(e.endingType).toBe('BAD');
    expect(e.endingTitle).toContain('落马');
  });

  it('hard 难度风险放大:廉洁 45 也可能落马', () => {
    const s = stateWith({ attrs: { integrity: 42 }, difficulty: 'hard' });
    expect(computeEnding(s).endingType).toBe('BAD');
  });

  it('easy 难度风险缩小:同等廉洁度未必落马', () => {
    const s = stateWith({ attrs: { integrity: 42, politics: 55, execute: 55, network: 55 }, rank: 2, promotions: 2, difficulty: 'easy' });
    expect(computeEnding(s).endingType).not.toBe('BAD');
  });

  it('高属性+高廉洁+高职级 → GREAT(光荣退休)', () => {
    const s = stateWith({
      attrs: { politics: 75, execute: 75, network: 70, integrity: 85 },
      rank: 4,
      promotions: 4,
    });
    const e = computeEnding(s);
    expect(e.endingType).toBe('GREAT');
    expect(e.finalRank).toBe(s.dept.ranks[4]);
    expect(e.evalText).toContain('4次晋升');
  });

  it('中等均衡 → GOOD(平稳落幕)', () => {
    const s = stateWith({
      attrs: { politics: 55, execute: 55, network: 50, integrity: 60 },
      rank: 1,
      promotions: 1,
    });
    const e = computeEnding(s);
    expect(e.endingType).toBe('GOOD');
  });

  it('廉洁尚可但属性平平 → MID(调任闲职)', () => {
    const s = stateWith({
      attrs: { politics: 35, execute: 35, network: 30, integrity: 40 },
      rank: 0,
    });
    expect(computeEnding(s).endingType).toBe('MID');
  });

  it('低廉洁+低职级+低属性 → MID2(受到处分)', () => {
    const s = stateWith({
      attrs: { politics: 30, execute: 30, network: 30, integrity: 30 },
      rank: 0,
    });
    const e = computeEnding(s);
    expect(e.endingType).toBe('MID2');
  });

  it('评语中的晋升文案随次数变化', () => {
    expect(computeEnding(stateWith({ promotions: 0, attrs: { integrity: 40 } })).evalText).toContain('原地踏步');
    expect(computeEnding(stateWith({ promotions: 1, attrs: { integrity: 40 } })).evalText).toContain('仅有1次晋升');
    expect(computeEnding(stateWith({ promotions: 3, attrs: { integrity: 40 } })).evalText).toContain('3次晋升');
  });
});
