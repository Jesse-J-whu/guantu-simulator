/**
 * @file 提示词构建器 — 汇聚连续性、去重、职级红线、效果要求,生成事件/背景提示词。
 */

import type { GameState, GameEvent, EventTag } from './types.ts';
import { RANK_REFERENCE_TEXT } from './rankRules.ts';
import { buildContinuityContext } from './storyMemory.ts';

/** 叙事指令池(与事件类型映射,供 RAG 检索使用)。 */
export const NARRATIVE_DIRECTIVES: ReadonlyArray<{ text: string; tag: EventTag }> = [
  { text: '基层工作细节', tag: 'daily' },
  { text: '人际博弈', tag: 'interpersonal' },
  { text: '突发危机', tag: 'crisis' },
  { text: '家庭与事业的冲突', tag: 'interpersonal' },
  { text: '权力运作', tag: 'politics' },
  { text: '道德抉择', tag: 'temptation' },
  { text: '外部环境变化', tag: 'crisis' },
  { text: '历史遗留问题', tag: 'daily' },
  { text: '跨部门协调', tag: 'politics' },
  { text: '个人成长时刻', tag: 'opportunity' },
  { text: '派系政治', tag: 'politics' },
  { text: '信息战', tag: 'politics' },
  { text: '群众路线', tag: 'daily' },
  { text: '数字化改革', tag: 'daily' },
  { text: '纪检风险', tag: 'temptation' },
];

/** 故事弧:按进度给出阶段化叙事指令。 */
export function storyArcPrompt(step: number, maxSteps: number): string {
  const progress = step / maxSteps;
  if (progress < 0.25) {
    return `## 当前阶段：适应期（入职初期）
- 主题：熟悉环境、学习规则、小考验
- 事件风格：日常事务为主，冲突温和
- 道德灰度：低（黑白分明，正确选择明显）
- 晋升机会：低（主要是适应和学习）
- 事件描述长度：80-150字`;
  } else if (progress < 0.5) {
    return `## 当前阶段：成长期（崭露头角）
- 主题：能力展示、获得认可、小升迁
- 事件风格：机遇与挑战并存，开始有小诱惑
- 道德灰度：中低（开始出现灰色地带）
- 晋升机会：中（表现好可获得提拔）
- 事件描述长度：100-180字`;
  } else if (progress < 0.75) {
    return `## 当前阶段：博弈期（权力游戏）
- 主题：大诱惑、站队选择、人际冲突
- 事件风格：利益纠葛复杂，选择影响深远
- 道德灰度：高（没有标准答案，每个选择都有代价）
- 晋升机会：高（但也伴随高风险）
- 事件描述长度：120-200字`;
  }
  return `## 当前阶段：决战期（巅峰对决）
- 主题：重大危机、终极选择、命运转折
- 事件风格：生死存亡，一念天堂一念地狱
- 道德灰度：极高（可能需要在原则和生存之间选择）
- 晋升机会：极高（也可能断崖式下跌）
- 事件描述长度：150-220字`;
}

/** 事件生成提示词参数。 */
export interface EventPromptParams {
  state: GameState;
  directive: string;
  lastEvent: GameEvent | null;
  ragSection: string;
  /** 去重重试时附带的"避免重复"反馈。 */
  avoidNote?: string;
}

/** 构建事件生成提示词。 */
export function buildEventPrompt(params: EventPromptParams): string {
  const { state, directive, lastEvent, ragSection, avoidNote } = params;
  const dept = state.dept;
  const rankIdx = Math.min(state.rank, dept.ranks.length - 1);
  const currentRank = dept.ranks[rankIdx];
  const nextRank = rankIdx < dept.ranks.length - 1 ? dept.ranks[rankIdx + 1] : '已到顶峰';
  const currentPosition = dept.rankPositions[currentRank] || currentRank;
  const nextPosition = dept.rankPositions[nextRank] || nextRank;
  const currentScope = dept.rankScope[currentRank] || '';
  const diffLabel = state.difficulty === 'easy' ? '轻松' : state.difficulty === 'hard' ? '硬核' : '标准';
  const { attrs } = state;

  const attrHints: string[] = [];
  if (attrs.integrity < 40) {
    attrHints.push('廉洁度很低，应出现被调查风险升级或挽回廉洁度的机会，两类选项都要有');
  } else if (attrs.integrity > 80) {
    attrHints.push('廉洁度很高，可生成考验原则底线的道德两难事件');
  } else {
    attrHints.push('廉洁度中等，生成需要权衡利弊的复杂决策事件');
  }
  if (attrs.network > 70) attrHints.push('人脉资源丰富，可生成高层关系运作或被拉拢站队事件');
  if (attrs.politics > 70) attrHints.push('政治嗅觉敏锐，可生成需要政治判断力的复杂博弈事件');
  if (attrs.execute > 70) attrHints.push('执行力突出，可生成重大项目或危机处理事件');

  const usedTitlesBlock =
    state.usedTitles.length > 0
      ? state.usedTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : '（暂无）';

  return `你是一个精通中国公务员体制的官场模拟器事件生成器。你必须严格遵守中国公务员职级体系，任何职务安排都不能违背现实。

## 内容基调（最高优先级）
本作品是廉洁勤政主题的正能量教育模拟游戏：歌颂为民服务、清正廉洁的行为，腐败情节仅作警示教育且点到为止（不渲染具体受贿细节、权钱交易手法或奢靡享乐画面）。写诱惑事件时聚焦当事人的内心挣扎与正确抉择。

## 叙事要求（本次必须遵守）
本次事件侧重【${directive}】

${buildContinuityContext(state, lastEvent)}

## 玩家精确身份
- 部门：${dept.name}
- 职级：${currentRank}
- 担任职务：${currentPosition}
- 下一级职务：${nextRank}（${nextPosition}）
- 当前职责范围：${currentScope}
- 游戏年份：${state.year}年（第${state.step + 1}步/共${state.maxSteps}步）
- 难度：${diffLabel}
- 属性：政治嗅觉${attrs.politics} | 执行力${attrs.execute} | 人脉资源${attrs.network} | 廉洁度${attrs.integrity}
- 属性提示：${attrHints.join('；')}

## 【核心规则】职级-职务严格对照（生成后必须自检）
${RANK_REFERENCE_TEXT}

## ${dept.name}职务晋升序列
${dept.ranks.map((r) => `${r} → ${dept.rankPositions[r] || r}`).join('\n')}

## 部门特色
${dept.name}核心业务：${dept.themes.slice(0, 5).join('、')}
${dept.flavor}

${storyArcPrompt(state.step, state.maxSteps)}

## 已生成事件标题全集（严禁与其中任何一条主题或情节雷同）
${usedTitlesBlock}
${avoidNote ? `\n⚠ 上一次生成未通过系统校验：${avoidNote}。` : ''}

## 因果延续硬性要求
${lastEvent ? '本事件必须自然承接上一事件：引用其中至少一个人物或未决事项，体现玩家选择的后果。必须在【剧情衔接】字段用一句话说明承接关系。' : '这是玩家的第一个事件，侧重入职/到任的初始情景。'}

${ragSection ? `## 真实官员履历参考（增强事件真实感）\n${ragSection}\n` : ''}
## 职务自检清单（生成事件后逐条检查）
1. 事件中出现的所有人物职务，是否与职级对照表一致？
2. 你的上级领导必须是比你高至少半级的职务
3. 同级同事/竞争对手，职务应与你相当或高半级
4. 下级必须比你低至少半级
5. 涉及"提拔"时目标职务必须是 ${nextRank}（${nextPosition}），不能越级
6. 单位内设机构负责人不得与本单位同级（如县局是正科级，其办公室主任只能是股级）
7. 科级干部不能决策全市性重大事项

## 选项效果硬性要求（违反将被系统修正）
1. 四个选项中每个选项至少 1 个属性变化非零，数值幅度 3-8 点，让玩家能感知
2. 至少 2 个选项的总效果为正（做对事应当有奖励）
3. 至少 1 个选项廉洁度为正（存在守住底线的好选择），腐败选项廉洁度明显为负
4. 效果分布要平衡：有得有失，不同选项侧重不同属性
5. 表现突出的选项可将"晋升"设为 1（相当于重大立功），其余为 0

## 严格输出格式（用【】标记，不要输出JSON，不要任何解释文字）
【事件类型】daily/opportunity/temptation/politics/crisis/interpersonal 之一
【类型标签】中文标签（如"日常政务"）
【事件标题】8到15字的标题
【剧情衔接】一句话说明本事件如何承接上一事件（第一个事件则写开局引入）
【事件描述】有画面感有冲突的详细描述。可以写多行，直到下一个标记为止
【出场人物】以分号分隔的人物列表，格式：姓名(职务)，如：王建国(县住建局局长)；李芳(办公室主任)
【官场格言】一句暗示或格言
【选项A】选项文字描述
【选项A提示】这个选项的提示或暗示
【选项A效果】政治嗅觉:+5 执行力:+3 人脉资源:+2 廉洁度:0 晋升:0
【选项B】选项文字描述
【选项B提示】这个选项的提示或暗示
【选项B效果】政治嗅觉:0 执行力:-4 人脉资源:0 廉洁度:+5 晋升:0
【选项C】选项文字描述
【选项C提示】这个选项的提示或暗示
【选项C效果】政治嗅觉:+3 执行力:+5 人脉资源:+4 廉洁度:-5 晋升:0
【选项D】选项文字描述
【选项D提示】这个选项的提示或暗示
【选项D效果】政治嗅觉:-3 执行力:0 人脉资源:-4 廉洁度:+4 晋升:0

注意：必须使用具体数字；【事件描述】可多行直到下一个【】标记；只输出以上标记内容。`;
}

/** 构建开局背景提示词。 */
export function buildBackgroundPrompt(deptName: string, difficulty: string): string {
  return `你是一个中国官场文学作家。请为一个选择进入"${deptName}"的玩家生成一段官途开局背景。
这是廉洁勤政主题的正能量教育模拟游戏，基调积极向上。
要求：
1. 包含：姓名（中文名）、入职年份（2014-2016年间）、毕业院校、入职方式、家庭背景、初始职务全称
2. 用第二人称（"你"）写一段200-300字的沉浸式开场白，语言要有文学感和官场韵味，结尾留下一个即将发生的事件引子
3. 开场白必须与初始职务的职级相符（科员开局就是基层日常，不要出现越级情节）
4. 难度：${difficulty}（easy=家境好无风险/normal=普通背景/hard=困难重重）
5. 严格按照以下分隔符格式输出，不要输出JSON：

【行政级别】省级/市级/县级
【入职方式】入职方式描述
【家庭背景】家庭背景描述
【开场白】用第二人称写的200-300字沉浸式开场白，可多行，直到下一个标记为止
【初始职务】初始职务全称`;
}
