/**
 * @file 去重系统 — 解决"一局内重复出现相同文案和选项卡"。
 *
 * 三层防线:
 *  1. 供给端:叙事指令与部门主题用抽取袋(shuffle bag)不重复抽取;
 *  2. 生成端:提示词中给出全部已用标题,明确禁止相似;
 *  3. 校验端:生成结果与全部历史做字符 bigram 相似度检测,超阈值触发重试。
 */

import type { GameEvent } from './types.ts';

/** 标点清理(比较前去除)。 */
function cleanText(text: string): string {
  return text.replace(/[\s，。、；：？！（）()【】"'""]+/g, '');
}

/** 字符 bigram 集合。 */
function bigrams(text: string): Set<string> {
  const clean = cleanText(text);
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
  return set;
}

/** Jaccard 相似度(集合版)。 */
function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * 文本相似度(0-1):bigram Jaccard 与字符重叠系数(inter/min)取较大者。
 * 纯 bigram 对短标题不敏感(6字标题改2字仅 0.33),掺入字符级重叠
 * 才能抓住"拆迁户集体上访/拆迁户联名上访"这类换汤不换药重复。
 */
export function similarity(a: string, b: string): number {
  const bigramScore = jaccard(bigrams(a), bigrams(b));
  const ca = new Set(cleanText(a));
  const cb = new Set(cleanText(b));
  if (ca.size === 0 || cb.size === 0) return bigramScore;
  let inter = 0;
  for (const c of ca) if (cb.has(c)) inter++;
  return Math.max(bigramScore, inter / Math.min(ca.size, cb.size));
}

/** 标题重复判定阈值:0.45 ≈ 换了几个字仍算重复。 */
export const TITLE_DUP_THRESHOLD = 0.45;

/** 选项重复判定阈值。 */
export const CHOICE_DUP_THRESHOLD = 0.7;

/** 在历史标题里找最相似的一条。 */
export function findMostSimilarTitle(
  title: string,
  usedTitles: readonly string[],
): { title: string; score: number } | null {
  let best: { title: string; score: number } | null = null;
  for (const t of usedTitles) {
    const score = similarity(title, t);
    if (!best || score > best.score) best = { title: t, score };
  }
  return best;
}

/** 事件新鲜度检查:标题与历史重复 / 选项与历史事件选项重复 / 事件内部选项互相重复。 */
export function checkEventFreshness(
  event: Pick<GameEvent, 'title' | 'choices'>,
  usedTitles: readonly string[],
  usedChoiceTexts: readonly string[] = [],
): { fresh: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const dup = findMostSimilarTitle(event.title, usedTitles);
  if (dup && dup.score >= TITLE_DUP_THRESHOLD) {
    reasons.push(`标题与"${dup.title}"相似度 ${dup.score.toFixed(2)}`);
  }
  const texts = event.choices.map((c) => c.text);
  // 跨事件选项查重:新选项与历史选项两两比对(诉求:选项卡也不得重复)。
  for (let i = 0; i < texts.length; i++) {
    const hit = findMostSimilarTitle(texts[i], usedChoiceTexts);
    if (hit && hit.score >= CHOICE_DUP_THRESHOLD) {
      reasons.push(`选项${i + 1}与此前事件选项"${hit.title.slice(0, 12)}…"雷同(${hit.score.toFixed(2)})`);
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const s = similarity(texts[i], texts[j]);
      if (s >= CHOICE_DUP_THRESHOLD) {
        reasons.push(`选项${i + 1}与选项${j + 1}高度相似(${s.toFixed(2)})`);
      }
    }
  }
  return { fresh: reasons.length === 0, reasons };
}

/**
 * 抽取袋:袋中元素不重复抽尽,抽尽后重新洗牌。
 * 比纯随机(with replacement)能从根本上避免相邻两步撞主题。
 */
export class ShuffleBag<T> {
  private bag: T[];
  private readonly items: readonly T[];
  private readonly shuffleFn: (arr: readonly T[]) => T[];

  constructor(
    items: readonly T[],
    shuffleFn: (arr: readonly T[]) => T[],
  ) {
    if (items.length === 0) throw new Error('ShuffleBag requires at least one item');
    this.items = items;
    this.shuffleFn = shuffleFn;
    this.bag = shuffleFn(items);
  }

  /** 抽取下一个元素。 */
  draw(): T {
    if (this.bag.length === 0) this.bag = this.shuffleFn(this.items);
    return this.bag.pop() as T;
  }

  /** 当前袋中剩余数量(调试用)。 */
  get remaining(): number {
    return this.bag.length;
  }
}
