/**
 * @file 选项效果强制生效与再平衡 — 解决"选项后属性几乎不变/只减不增"的问题。
 *
 * 用户反馈:每一次选项都应发生可感知的属性增减,选对应当有增加。
 * LLM 输出的效果数值经常全 0 或全负,这里做确定性后处理:
 *  1. 每个选项至少 1 个非零属性变化(否则按行为原型补齐);
 *  2. 非零变化幅度至少 3 点,至多 10 点(可感知);
 *  3. 至少 2 个选项总效果为正(正确选项有增益);
 *  4. 至少 1 个选项廉洁度为正(存在"好选择");
 *  5. 晋升奖励只允许 0 或 1。
 */

import type { Choice, ChoiceEffect } from './types.ts';
import type { RNG } from './rng.ts';

/** 四维属性键。 */
const ATTR_KEYS = ['politics', 'execute', 'network', 'integrity'] as const;

/** 行为原型池:全零选项的补齐来源(有代价有收益,各有侧重)。 */
const ARCHETYPES: Array<{ name: string; effect: ChoiceEffect }> = [
  { name: '实干', effect: { politics: 3, execute: 5, network: 2, integrity: 2, promotion: 0 } },
  { name: '经营关系', effect: { politics: 3, execute: 1, network: 5, integrity: -2, promotion: 0 } },
  { name: '坚守原则', effect: { politics: 2, execute: 2, network: -2, integrity: 6, promotion: 0 } },
  { name: '同流合污', effect: { politics: 2, execute: 2, network: 4, integrity: -6, promotion: 0 } },
  { name: '谨慎观望', effect: { politics: 4, execute: 1, network: 1, integrity: 1, promotion: 0 } },
  { name: '担当碰硬', effect: { politics: 1, execute: 6, network: -1, integrity: 4, promotion: 0 } },
];

/** 单个效果四维净和。 */
export function netSum(effect: ChoiceEffect): number {
  return ATTR_KEYS.reduce((s, k) => s + effect[k], 0);
}

/** 克隆效果。 */
function cloneEffect(e: ChoiceEffect): ChoiceEffect {
  return { ...e };
}

/**
 * 就地规范化单个效果:取整、限幅 [-10,10]、promotion∈{0,1}。
 * 返回是否发生修改。
 */
function normalizeEffect(effect: ChoiceEffect): boolean {
  let changed = false;
  for (const k of ATTR_KEYS) {
    const v = Math.round(effect[k] || 0);
    const clamped = Math.max(-10, Math.min(10, v));
    if (clamped !== effect[k]) {
      effect[k] = clamped;
      changed = true;
    }
  }
  const promo = effect.promotion > 0 ? 1 : 0;
  if (promo !== effect.promotion) {
    effect.promotion = promo;
    changed = true;
  }
  return changed;
}

/** 幅度增强:非零但 <3 的变化放大到 3-6(保持符号)。 */
function amplify(effect: ChoiceEffect, rng: RNG): boolean {
  let changed = false;
  for (const k of ATTR_KEYS) {
    const v = effect[k];
    if (v !== 0 && Math.abs(v) < 3) {
      const magnitude = rng.int(3, 6);
      effect[k] = v > 0 ? magnitude : -magnitude;
      changed = true;
    }
  }
  return changed;
}

/** 全零判断。 */
function isAllZero(effect: ChoiceEffect): boolean {
  return ATTR_KEYS.every((k) => effect[k] === 0);
}

/**
 * 效果再平衡主入口。
 * @param choices 待修复的选项列表(不会修改入参)
 * @param rng 随机源(测试可注入种子)
 * @returns 修复后的选项列表 + 修复说明(用于统计与调试)
 */
export function rebalanceEffects(
  choices: Choice[],
  rng: RNG,
): { choices: Choice[]; notes: string[] } {
  const notes: string[] = [];
  const result: Choice[] = choices.map((c) => ({
    ...c,
    effect: cloneEffect(c.effect),
  }));
  if (result.length === 0) return { choices: result, notes };

  // 1) 规范化 + 幅度增强。
  for (const c of result) {
    if (normalizeEffect(c.effect)) notes.push(`normalized:${c.text.slice(0, 12)}`);
    if (amplify(c.effect, rng)) notes.push(`amplified:${c.text.slice(0, 12)}`);
  }

  // 2) 全零选项按行为原型补齐(原型不重复使用)。
  const pool = rng.shuffle(ARCHETYPES);
  let poolIdx = 0;
  for (const c of result) {
    if (isAllZero(c.effect)) {
      const arch = pool[poolIdx % pool.length];
      poolIdx++;
      // 幅度加一点随机扰动,避免完全相同;下限 3 保住"可感知变化"契约。
      for (const k of ATTR_KEYS) {
        const base = arch.effect[k];
        if (base === 0) continue;
        const jitter = rng.int(-1, 1);
        const adjusted = base + jitter;
        c.effect[k] = base > 0 ? Math.max(3, Math.min(10, adjusted)) : Math.min(-3, Math.max(-10, adjusted));
      }
      c.effect.promotion = c.effect.promotion > 0 ? 1 : 0;
      notes.push(`filled-zero:${arch.name}`);
    }
  }

  // 3) 至少 2 个净正选项:不足时给"最有潜力"的选项逐属性注入增益,直到净和真正转正。
  //    (单次 +4~7 可能盖不住原有负值,须循环补足;三维非廉洁属性最多 +30,足以覆盖任何负值组合。)
  const order = [...result].sort((a, b) => netSum(b.effect) - netSum(a.effect));
  let positives = result.filter((c) => netSum(c.effect) > 0).length;
  for (const c of order) {
    if (positives >= 2) break;
    if (netSum(c.effect) > 0) continue;
    const boostKeys = rng.shuffle(['politics', 'execute', 'network'] as const);
    for (let i = 0; i < 15 && netSum(c.effect) <= 0; i++) {
      const key = boostKeys[i % boostKeys.length];
      c.effect[key] = Math.min(10, c.effect[key] + rng.int(4, 7));
    }
    if (netSum(c.effect) > 0) {
      positives++;
      notes.push(`boost-positive:${c.text.slice(0, 12)}`);
    }
  }

  // 4) 至少 1 个廉洁度为正的选项(存在"好选择")。
  if (!result.some((c) => c.effect.integrity > 0)) {
    // 选廉洁度最不负的选项,赋予正面廉洁度。
    const candidate = [...result].sort((a, b) => b.effect.integrity - a.effect.integrity)[0];
    candidate.effect.integrity = rng.int(4, 7);
    notes.push(`ensure-integrity-positive:${candidate.text.slice(0, 12)}`);
  }

  return { choices: result, notes };
}
