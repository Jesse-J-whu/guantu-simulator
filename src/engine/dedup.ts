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
 * 用于选项文案:字符包含(「提出解决方案」⊂「…等待他人提出解决方案。」)
 * 也算照抄,必须抓住。
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
 * 标题相似度:只用词组级 bigram Jaccard。字符重叠会把「老城区改造项目
 * 会议」(7字)判成任何提到该项目的长标题的 1.0 子串——但围绕同一项目
 * 展开正是连续性系统的设计,不是重复文案。bigram 级:「暗流涌动」vs
 * 「暗流涌动再现」=0.60(重复),「老城区改造项目会议」vs「2020年，老城
 * 区改造项目终于迎来了…」≈0.25(同弧不同事件,放行)。
 */
export function titleSimilarity(a: string, b: string): number {
  return jaccard(bigrams(a), bigrams(b));
}

/**
 * 标题重复判定阈值(bigram 口径)。0.55 ≈ 换尾缀仍算重复
 * (「暗流涌动」vs「暗流涌动再现」0.60、「深夜的抉择」vs「午夜的抉择」
 * 0.60);同弧不同事件(0.2-0.4)放行。
 */
export const TITLE_DUP_THRESHOLD = 0.55;

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

/** 在历史标题里找最相似的一条(标题口径:bigram-only)。 */
export function findMostSimilarTitle(
  title: string,
  usedTitles: readonly string[],
): { title: string; score: number } | null {
  let best: { title: string; score: number } | null = null;
  for (const t of usedTitles) {
    const score = titleSimilarity(title, t);
    if (!best || score > best.score) best = { title: t, score };
  }
  return best;
}

/** 在历史选项文案里找最相似的一条(选项口径:含字符包含)。 */
export function findMostSimilarChoice(
  text: string,
  usedChoices: readonly string[],
): { title: string; score: number } | null {
  let best: { title: string; score: number } | null = null;
  for (const t of usedChoices) {
    const score = similarity(text, t);
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
    // 标题长度截断:reasons 会被拼进下一轮提示词,不截断等于把任意长的
    // LLM 输出原样注入 prompt(注入面有界化)。
    reasons.push(`标题"${event.title.slice(0, 30)}"是可套用任何剧情的泛化套话`);
  }
  const texts = event.choices.map((c) => c.text);
  // 跨事件选项查重:新选项与历史选项两两比对(诉求:选项卡也不得重复)。
  for (let i = 0; i < texts.length; i++) {
    const hit = findMostSimilarChoice(texts[i], usedChoiceTexts);
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
 * 短句(仍是 LLM 原创内容,非模板拼凑);雷同选项直接剔除,退化输出
 * (全部撞车)时引擎合成一对互异选项顶上。step 用于极端同质化时的
 * 幕数去重——保证标题全字符串唯一;语义级差异仍依赖生成端供给。
 */
export function enforceFreshness(
  event: Pick<GameEvent, 'title' | 'desc' | 'tagLabel' | 'choices'>,
  usedTitles: readonly string[],
  usedChoiceTexts: readonly string[] = [],
  step = 0,
): void {
  // ---------- 标题 ----------
  const titleHit = findMostSimilarTitle(event.title, usedTitles);
  if ((titleHit && titleHit.score >= TITLE_DUP_THRESHOLD) || isGenericTitle(event.title)) {
    // 描述缺失占位符(parser 的兜底值)不是可摘的标题素材,否则占位符
    // 会原样成为玩家可见标题。
    const desc = event.desc === '（事件描述缺失）' ? '' : event.desc;
    const firstSentence = desc
      .split(/[。！？!?\n]/)
      .map((s) => s.trim())
      .find((s) => s.length >= 6);
    // 截断优先落在标点/连接词边界(含半角标点——mock 与真实输出的逗号
    // 全半角混用)。取窗口内最后一个边界做前缀(≥6 字才够标题);所有
    // 边界都太靠前时宁可取短前缀也不腰斩,避免「…把一个厚信」式截断;
    // 截完剥掉尾部悬挂标点。
    let headline = '';
    if (firstSentence) {
      const window = firstSentence.slice(0, 18);
      const boundaries = [...window.matchAll(/[，、：,;:]/g)].map((m) => m.index ?? 0);
      const cut = boundaries.filter((i) => i >= 6).pop() ?? -1;
      headline = (cut >= 0 ? window.slice(0, cut) : window)
        .replace(/[，、：,;:。！？“”「」（）()\s]+$/, '');
    }
    // 候选阶梯逐级验证:每个候选都要(a)非空非套话,(b)与全部历史标题
    // bigram 相似度 < 阈值。此前直接叠加后缀不回头验证,「·标签(第N幕)」
    // 拼完仍可能 ≥0.55,把自己定义的"必须为0"打穿;描述无可摘短句时还会
    // 把被封禁的原标题原样嵌进兜底标题。终极候选「第N幕」随步数严格
    // 递增,结构性唯一,绝不撞车。
    const acceptable = (t: string) =>
      !!t &&
      !isGenericTitle(t) &&
      (findMostSimilarTitle(t, usedTitles)?.score ?? 0) < TITLE_DUP_THRESHOLD;
    const candidates = [
      headline,
      `${event.tagLabel}·第${step + 1}幕`,
      `第${step + 1}幕`,
      `第${step + 1}幕·新局`,
      `第${step + 1}幕·转折`,
    ].filter(Boolean) as string[];
    // 终极兜底也过 acceptable 检查(幕数随步数唯一,只有历史里出现
    // 逐字「第N幕」才会失败,此时后缀变体仍可区分);全部失败时取
    // 碰撞最轻的一个,绝不无验证放行。
    const terminals = [`第${step + 1}幕`, `第${step + 1}幕·新局`, `第${step + 1}幕·转折`];
    event.title =
      candidates.find(acceptable) ??
      terminals.find(acceptable) ??
      terminals.map((t) => ({ t, s: findMostSimilarTitle(t, usedTitles)?.score ?? 0 })).sort((a, b) => a.s - b.s)[0].t;
  }
  // ---------- 选项 ----------
  // 事件内部查重:LLM 把同一文案写进两个选项槽(格式回声的常见形态)
  // 时保留首个,后续照抄槽位剔除。此前只查跨事件池,槽内互抄会原样
  // 放行两张一模一样的选项卡。
  const intraKept: GameEvent['choices'] = [];
  for (const c of event.choices) {
    const dup = intraKept.some((k) => similarity(k.text, c.text) >= CHOICE_DUP_THRESHOLD);
    if (!dup) intraKept.push(c);
  }
  const scored = intraKept
    .map((c) => ({
      c,
      score: findMostSimilarChoice(c.text, usedChoiceTexts)?.score ?? 0,
      // 全等 = 清理标点后与池中某条逐字相同(字符包含关系也会拿 1.0 分,
      // 但那不算全等)。
      exact: usedChoiceTexts.some((t) => cleanText(t) === cleanText(c.text)),
    }))
    .sort((a, b) => a.score - b.score || Number(a.exact) - Number(b.exact));
  const kept = scored.filter((s) => s.score < CHOICE_DUP_THRESHOLD);
  if (kept.length >= 2) {
    event.choices = kept.map((s) => s.c);
    return;
  }
  // 退化输出:干净选项不足 2 个。保留碰撞最轻的原选项绝无出路——旧逻辑
  // 因此逐字放行过历史重复。改为引擎合成选项文案,且与标题阶梯同款逐级
  // 验池:每个候选都要(a)与历史池相似度 <0.8,(b)与本事件已选文案
  // 相似度 <0.8 才放行——步数数字不构成字符级唯一(池里有「暂缓观察
  // 留待」时「暂缓观察留待第6幕再议(…)」相似度 1.00,reviewer PoC)。
  // 效果数值沿用碰撞最轻的选项,"每个选项都有属性变化"不破。
  const poolSafe = (text: string) =>
    (findMostSimilarChoice(text, usedChoiceTexts)?.score ?? 0) < CHOICE_DUP_THRESHOLD;
  // 风味词(选项提示/类型标签)本身可能撞池,撞了就弃用,避免包含式碰撞
  // 从风味词渗进合成文案。
  const flavor = (i: number) => {
    const hint = (scored[i]?.c.hint || '').replace(/\s+/g, '').slice(0, 8);
    return hint && poolSafe(hint) ? hint : event.tagLabel;
  };
  const base = (i: number) => scored[Math.min(i, scored.length - 1)].c;
  const n = step + 1;
  // 每槽 4 个候选:3 个带风味词的骨架 + 1 个无风味词保底(风味词或标签
  // 被池污染时的出路)。骨架两两结构互异,互检天然通过。
  const SKELETONS: ReadonlyArray<readonly string[]> = [
    [
      `第${n}幕从严处置:${flavor(0)}`,
      `当场拍板严办(${flavor(0)})`,
      `顶住压力按规矩办:${flavor(0)}`,
      '从严办理此案,不留情面',
    ],
    [
      `暂缓观察留待第${n}幕再议(${flavor(1)})`,
      `压后细议再作决断(${flavor(1)})`,
      `缓一缓另行专门研究(${flavor(1)})`,
      '暂且搁置,改日专题研究',
    ],
  ];
  const pickedTexts: string[] = kept.map((s) => s.c.text);
  const safe = (t: string) =>
    poolSafe(t) && pickedTexts.every((p) => similarity(p, t) < CHOICE_DUP_THRESHOLD);
  const slots = kept.length === 1 ? [1] : [0, 1];
  const finalChoices: GameEvent['choices'] = kept.map((s) => s.c);
  for (const slot of slots) {
    const candidates = SKELETONS[slot];
    let text = candidates.find(safe);
    if (text === undefined) {
      // 全部候选撞池(极端对抗):取碰撞最轻的一个,不无验证地硬放。
      text = candidates
        .map((t) => ({
          t,
          s: Math.max(
            findMostSimilarChoice(t, usedChoiceTexts)?.score ?? 0,
            ...pickedTexts.map((p) => similarity(p, t)),
          ),
        }))
        .sort((a, b) => a.s - b.s)[0].t;
    }
    pickedTexts.push(text);
    finalChoices.push({ ...base(slot), hint: '', text });
  }
  event.choices = finalChoices;
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
