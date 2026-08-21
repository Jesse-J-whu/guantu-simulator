/**
 * @file 官途模拟器 — 核心类型定义。
 * 所有引擎模块共享的数据结构。纯类型,无副作用。
 */

/** 难度档位。 */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** 事件类型标签(决定事件风格与检索方向)。 */
export type EventTag =
  | 'daily'
  | 'opportunity'
  | 'temptation'
  | 'politics'
  | 'crisis'
  | 'interpersonal';

/** 玩家四维属性。 */
export interface Attrs {
  politics: number;
  execute: number;
  network: number;
  integrity: number;
}

export type AttrKey = keyof Attrs;

/** 选项效果:四维属性变化 + 晋升点奖励(0 或 1)。 */
export interface ChoiceEffect {
  politics: number;
  execute: number;
  network: number;
  integrity: number;
  promotion: number;
}

/** 单个选项。 */
export interface Choice {
  text: string;
  hint: string;
  effect: ChoiceEffect;
}

/** 一局中的一个事件(由 LLM 生成并经引擎修复)。 */
export interface GameEvent {
  id: string;
  tag: EventTag;
  tagLabel: string;
  title: string;
  desc: string;
  hint: string;
  /** 剧情衔接:本事件如何承接上一事件(展示给玩家,强化连续性)。 */
  continuity: string;
  /** 出场人物,格式如 "王建国(县政府办公室主任)"。 */
  npcs: string[];
  choices: Choice[];
  aiGenerated: boolean;
  /** 生成后的修复记录(用于统计与调试)。 */
  repairs: EventRepair[];
}

/** 引擎对生成结果的修复记录。 */
export interface EventRepair {
  kind: 'rank-fix' | 'effect-rebalance' | 'dedup-retry' | 'parse-fallback';
  detail: string;
}

/** 部门星级(用户校准后的数值)。 */
export interface DeptRatings {
  /** 权力。 */
  power: number;
  /** 繁忙。 */
  busy: number;
  /** 晋升。 */
  promotion: number;
  /** 风险。 */
  risk: number;
}

/** 部门定义。 */
export interface Dept {
  id: string;
  name: string;
  icon: string;
  desc: string;
  ratings: DeptRatings;
  /** 职级阶梯(索引即 gameState.rank)。 */
  ranks: string[];
  startRank: string;
  recommended: boolean;
  rankPositions: Record<string, string>;
  rankScope: Record<string, string>;
  /** 部门业务主题池(去重抽取)。 */
  themes: string[];
  flavor: string;
}

/** 开局背景。 */
export interface Background {
  level: string;
  origin: string;
  background: string;
  openingText: string;
  rankTitle: string;
}

/** 剧情人物名册条目。 */
export interface NPC {
  /** 姓名。 */
  name: string;
  /** 职务。 */
  title: string;
  /** 与玩家关系(如 良师/对手/靠山)。 */
  relation: string;
  firstStep: number;
  lastStep: number;
  appearances: number;
}

/** 时间线条目(完整轨迹,上报后端留存)。 */
export interface TimelineEntry {
  step: number;
  year: number;
  title: string;
  tagLabel: string;
  choice: string;
  effects: ChoiceEffect;
  attrsAfter: Attrs;
  rankAfter: number;
  promoted: boolean;
}

/** 晋升记录。 */
export interface PromotionRecord {
  step: number;
  year: number;
  fromRank: string;
  toRank: string;
  reason: 'merit' | 'choice' | 'year-review';
}

/** 游戏全量状态(不可变更新,由引擎函数返回新状态)。 */
export interface GameState {
  sessionId: string;
  deptId: string;
  dept: Dept;
  difficulty: Difficulty;
  attrs: Attrs;
  /** 当前职级索引(dept.ranks 下标)。 */
  rank: number;
  /** 晋升绩效点数。 */
  promotionPoints: number;
  /** 已消耗绩效点数(用于统计)。 */
  promotionPointsSpent: number;
  year: number;
  step: number;
  maxSteps: number;
  background: Background | null;
  currentEvent: GameEvent | null;
  timeline: TimelineEntry[];
  npcs: NPC[];
  /** 剧情摘要(引擎自动维护)。 */
  summary: string;
  /** 未决剧情线索。 */
  threads: string[];
  /** 已用事件标题(去重池)。 */
  usedTitles: string[];
  /** 已用选项文案(跨事件选项去重池,最近 N 条滚动)。 */
  usedChoiceTexts: string[];
  /** 已用叙事指令(去重池)。 */
  usedDirectives: string[];
  /** 剩余叙事指令抽取袋。 */
  directiveBag: string[];
  /** 已用部门主题。 */
  usedThemes: string[];
  promotions: PromotionRecord[];
  repairs: EventRepair[];
  ended: boolean;
}

/** applyChoice 的即时反馈(驱动 UI 动画)。 */
export interface ApplyResult {
  state: GameState;
  effects: ChoiceEffect;
  attrsBefore: Attrs;
  attrsAfter: Attrs;
  promoted: boolean;
  promotion: PromotionRecord | null;
  /** 晋升进度 0-1(当前点数 / 下一级所需)。 */
  promotionProgress: number;
  pointsGained: number;
}

/** LLM 客户端抽象(浏览器走代理,Node 脚本直连,测试用 mock)。 */
export interface LLMClient {
  /** 生成文本;prompt 为完整提示词。 */
  generate(prompt: string, opts?: LLMOptions): Promise<string>;
}

/** LLM 调用参数。 */
export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

/** 结局。 */
export interface Ending {
  endingType: 'GREAT' | 'GOOD' | 'MID' | 'MID2' | 'BAD';
  endingTitle: string;
  endingIcon: string;
  endingSummary: string;
  evalText: string;
  finalRank: string;
}
