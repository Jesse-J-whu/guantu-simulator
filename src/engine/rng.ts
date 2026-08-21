/**
 * @file 可注入的随机数接口 — 生产用 Math.random,测试/压测用可复现的种子实现。
 */

/** 随机源抽象。 */
export interface RNG {
  /** [0,1) 均匀随机。 */
  next(): number;
  /** [min,max] 整数(含端点)。 */
  int(min: number, max: number): number;
  /** 从数组中等概率取一个元素。 */
  pick<T>(arr: readonly T[]): T;
  /** 洗牌(返回新数组)。 */
  shuffle<T>(arr: readonly T[]): T[];
}

/** 生产随机源。 */
export class MathRandom implements RNG {
  next(): number {
    return Math.random();
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

/** 可复现随机源(mulberry32),用于单元测试与 mock 事件生成。 */
export class SeededRandom implements RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

/** 生成随机会话 id(无外部依赖)。 */
export function makeSessionId(rng: RNG = new MathRandom()): string {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 16; i++) id += hex[rng.int(0, 15)];
  return `s_${Date.now().toString(36)}_${id}`;
}
