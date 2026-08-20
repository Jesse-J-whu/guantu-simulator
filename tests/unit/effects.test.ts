import { describe, expect, it } from 'vitest';
import { rebalanceEffects, netSum } from '../../src/engine/effects.ts';
import { SeededRandom } from '../../src/engine/rng.ts';
import type { Choice } from '../../src/engine/types.ts';

function mkChoice(text: string, e: Partial<Choice['effect']>): Choice {
  return { text, hint: '', effect: { politics: 0, execute: 0, network: 0, integrity: 0, promotion: 0, ...e } };
}

describe('属性效果强制生效(用户反馈:每次选择都应有可感知增减,选对应有增益)', () => {
  it('全零选项被补齐为非零效果', () => {
    const choices = [mkChoice('A', {}), mkChoice('B', {}), mkChoice('C', {}), mkChoice('D', {})];
    const { choices: out } = rebalanceEffects(choices, new SeededRandom(42));
    for (const c of out) {
      const nonZero = ['politics', 'execute', 'network', 'integrity'].filter(
        (k) => c.effect[k as keyof Choice['effect']] !== 0,
      );
      expect(nonZero.length, `选项"${c.text}"仍为全零`).toBeGreaterThan(0);
    }
  });

  it('至少 2 个选项总效果为正(正确选项有奖励)', () => {
    // 构造全负输入,验证兜底增强。
    const choices = [
      mkChoice('A', { politics: -3, integrity: -4 }),
      mkChoice('B', { execute: -2, network: -3 }),
      mkChoice('C', { politics: -1, integrity: -6 }),
      mkChoice('D', { network: -4, execute: -1 }),
    ];
    const { choices: out } = rebalanceEffects(choices, new SeededRandom(7));
    const positives = out.filter((c) => netSum(c.effect) > 0);
    expect(positives.length).toBeGreaterThanOrEqual(2);
  });

  it('至少 1 个选项廉洁度为正(存在好选择)', () => {
    const choices = [
      mkChoice('A', { integrity: -5, politics: 2 }),
      mkChoice('B', { integrity: -3, execute: 3 }),
      mkChoice('C', { integrity: -7, network: 2 }),
      mkChoice('D', { politics: -2, execute: -2 }),
    ];
    const { choices: out } = rebalanceEffects(choices, new SeededRandom(9));
    expect(out.some((c) => c.effect.integrity > 0)).toBe(true);
  });

  it('微弱变化(1-2点)被放大到 3-6 点(可感知)', () => {
    const choices = [mkChoice('A', { politics: 1 }), mkChoice('B', { execute: -1, integrity: 2 })];
    const { choices: out } = rebalanceEffects(choices, new SeededRandom(3));
    const a = out[0].effect.politics;
    expect(Math.abs(a)).toBeGreaterThanOrEqual(3);
  });

  it('数值被限制在 [-10,10],promotion 只能是 0/1', () => {
    const choices = [
      mkChoice('A', { politics: 99, promotion: 5 }),
      mkChoice('B', { integrity: -99, promotion: 2 }),
    ];
    const { choices: out } = rebalanceEffects(choices, new SeededRandom(1));
    expect(out[0].effect.politics).toBeLessThanOrEqual(10);
    expect(out[1].effect.integrity).toBeGreaterThanOrEqual(-10);
    expect(out[0].effect.promotion).toBe(1);
  });

  it('不修改原始输入(纯函数)', () => {
    const choices = [mkChoice('A', {})];
    rebalanceEffects(choices, new SeededRandom(1));
    expect(choices[0].effect.politics).toBe(0);
  });

  it('100 组随机输入均满足全部硬性规则', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed);
      const n = rng.int(2, 4);
      const choices: Choice[] = [];
      for (let i = 0; i < n; i++) {
        choices.push(
          mkChoice(`选项${i}`, {
            politics: rng.int(-6, 6),
            execute: rng.int(-6, 6),
            network: rng.int(-6, 6),
            integrity: rng.int(-6, 6),
          }),
        );
      }
      const { choices: out } = rebalanceEffects(choices, new SeededRandom(seed + 1000));
      for (const c of out) {
        const vals = ['politics', 'execute', 'network', 'integrity'].map((k) => c.effect[k as 'politics']);
        // 每个选项至少一个非零。
        expect(vals.some((v) => v !== 0), `seed=${seed}`).toBe(true);
      }
      expect(out.filter((c) => netSum(c.effect) > 0).length, `seed=${seed}`).toBeGreaterThanOrEqual(2);
      expect(out.some((c) => c.effect.integrity > 0), `seed=${seed}`).toBe(true);
    }
  });
});
