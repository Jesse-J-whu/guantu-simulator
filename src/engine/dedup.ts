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

/**
 * 标题重复判定阈值。0.72 ≈ 换几个字仍算重复(实测「拆迁户集体上访/
 * 拆迁户联名上访」0.71)。低于此的 0.45-0.7 段是同一故事线的不同事件
 * (连续性系统本来就要求反复围绕同一项目/人物展开),不算重复——
 * 首轮真实扫描用 0.45 时 18/24 事件被误判,标题被兜底改写得面目全非。
 */
export const TITLE_DUP_THRESHOLD = 0.72;

/**
 * 选项重复判定阈值。0.8 = 只拦截近乎照抄(字符包含/全等);叙述性
 * 措辞重叠(「向李明汇报这个问题」vs「主动向李明汇报核实情况」约
 * 0.6-0.7)是正常叙事,放行。真实扫描曾放行过逐字重复
 * (「将信息上报给领导，请求指示。」3 次全等),那才是要拦的。
 */
export const CHOICE_DUP_THRESHOLD = 0.8;

/**
 * 泛化套话标题模式:真实 GLM 大规模扫描(312 事件)实测,glm-4-flash 对
 * 短抽象标题有强先验——「暗流涌动」在 9 个不同部门复现 14 次。短标题
 * (≤6字)一旦命中这些词,几乎必然是可套用任何剧情的套话,直接判不新鲜。
 */
const GENERIC_TITLE_WORDS =
  /暗流|暗影|暗夜|深夜|午夜|抉择|邀约|来电|电话|诱惑|风波|疑云|博弈|考验|阴影/i;
const GENERIC_TITLE_MAX_LEN = 6;

/** 短且含套话词的标题(如「暗流涌动」「深夜的抉择」)。 */
export function isGenericTitle(title: string): boolean {
  const clean = cleanText(title);
  return clean.length <= GENERIC_TITLE_MAX_LEN && GENERIC_TITLE_WORDS.test(clean);
}

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
  if (isGenericTitle(event.title)) {
    reasons.push(`标题"${event.title}"是可套用任何剧情的泛化套话`);
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
 * 最终兜底:重试用尽后仍撞车时,系统直接改写,绝不原样放行重复
 * 标题/选项(诉求2的硬保证)。标题改写为从事件描述摘出的具体场景
 * 短句(仍是 LLM 原创内容,非模板拼凑);雷同选项直接剔除。
 * step 用于极端同质化(LLM 对反馈完全免疫)时的幕数去重——保证标题
 * 全字符串唯一;语义级差异仍依赖生成端供给。
 */
export function enforceFreshness(
  event: Pick<GameEvent, 'title' | 'desc' | 'tagLabel' | 'choices'>,
  usedTitles: readonly string[],
  usedChoiceTexts: readonly string[] = [],
  step = 0,
): void {
  // 标题:与历史雷同或泛化套话 → 用描述首句做具体化标题。
  const titleHit = findMostSimilarTitle(event.title, usedTitles);
  if ((titleHit && titleHit.score >= TITLE_DUP_THRESHOLD) || isGenericTitle(event.title)) {
    const firstSentence = event.desc
      .split(/[。！？!?\n]/)
      .map((s) => s.trim())
      .find((s) => s.length >= 6);
    // 截断优先落在标点/连接词边界,避免「…老旧小·日常政务」式腰斩。
    let headline = '';
    if (firstSentence) {
      const window = firstSentence.slice(0, 18);
      const cut = Math.max(window.lastIndexOf('，'), window.lastIndexOf('、'), window.lastIndexOf('：'));
      headline = cut >= 8 ? window.slice(0, cut) : window;
    }
    // 摘句仍撞车(描述也同质化的极端情况)→ 依次叠加类型标签与幕数,
    // 幕数随步数严格递增,兜底保证全字符串唯一。
    const collides = (t: string) => {
      const hit = findMostSimilarTitle(t, usedTitles);
      return !t || (hit && hit.score >= TITLE_DUP_THRESHOLD);
    };
    if (collides(headline)) headline = `${headline || event.title}·${event.tagLabel}`;
    if (collides(headline)) headline = `${headline}(第${step + 1}幕)`;
    event.title = headline;
  }
  // 选项:近乎照抄的直接剔除。若剔除后不足 2 个(退化输出),保留
  // 碰撞最轻的 2 个——绝不整组原样放行逐字重复(真实扫描曾因此 3 次
  // 放行「将信息上报给领导，请求指示。」)。全等重复排最后,平分时
  // 优先保住非全等的那个。
  const scored = event.choices
    .map((c) => ({
      c,
      score: findMostSimilarTitle(c.text, usedChoiceTexts)?.score ?? 0,
      // 全等 = 清理标点后与池中某条逐字相同(字符包含关系也会拿 1.0 分,
      // 但那不算全等)。
      exact: usedChoiceTexts.some((t) => cleanText(t) === cleanText(c.text)),
    }))
    .sort((a, b) => a.score - b.score || Number(a.exact) - Number(b.exact));
  const kept = scored.filter((s) => s.score < CHOICE_DUP_THRESHOLD);
  event.choices = (kept.length >= 2 ? kept : scored.slice(0, 2)).map((s) => s.c);
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
