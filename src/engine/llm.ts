/**
 * @file LLM 客户端 — 三种实现:
 *  - ProxyLLMClient:浏览器端,走 /api/llm-proxy(API Key 留在服务端);
 *  - DirectLLMClient:Node 脚本直连上游(多样性验证脚本用);
 *  - MockLLMClient:确定性事件生成器(单测/E2E/压测,不消耗 API 配额)。
 */

import type { LLMClient, LLMOptions } from './types.ts';
import type { RNG } from './rng.ts';
import { SeededRandom } from './rng.ts';

/** 浏览器端代理客户端。 */
export class ProxyLLMClient implements LLMClient {
  private readonly proxyUrl: string;

  constructor(proxyUrl = '/api/llm-proxy') {
    this.proxyUrl = proxyUrl;
  }

  async generate(prompt: string, opts: LLMOptions = {}): Promise<string> {
    const resp = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: opts.maxTokens ?? 1600,
        temperature: opts.temperature ?? 0.85,
        top_p: opts.topP ?? 0.9,
        stream: false,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({} as { error?: string }));
      throw new Error(err.error || `Proxy error ${resp.status}`);
    }
    const data = (await resp.json()) as { content?: string };
    return data.content || '';
  }
}

/** Node 直连客户端(仅服务端脚本使用,Key 不进前端)。 */
export class DirectLLMClient implements LLMClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(endpoint: string, apiKey: string, model: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(prompt: string, opts: LLMOptions = {}): Promise<string> {
    const resp = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts.temperature ?? 0.85,
        max_tokens: opts.maxTokens ?? 1600,
        top_p: opts.topP ?? 0.9,
      }),
    });
    if (!resp.ok) {
      throw new Error(`LLM ${this.model} error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/<think[\s\S]*?<\/think>/gi, '').replace(/<think[\s\S]*$/gi, '').trim();
    return text;
  }
}

/** mock 事件模板。 */
interface MockTemplate {
  tag: string;
  tagLabel: string;
  title: string;
  desc: string;
  hint: string;
  choices: Array<{ text: string; hint: string; effect: Record<string, number> }>;
}

/** 模板池:覆盖全部事件类型,参数化人物与部门主题。 */
const MOCK_TEMPLATES: MockTemplate[] = [
  {
    tag: 'daily', tagLabel: '日常政务',
    title: '一份急件引发的深夜加班',
    desc: '晚上九点，办公室只剩你一人。一份标注"明早八点前报领导"的急件摆在桌上，数据核对发现两处口径不一致。分管领导电话已关机，值班同事说"以前都是按旧口径报的"。你盯着屏幕，时钟一分一秒走过。',
    hint: '急件不急，口径事大。',
    choices: [
      { text: '按旧口径先报，明早再补说明', hint: '稳妥但可能掩盖问题', effect: { politics: -3, execute: 2, network: 3, integrity: -2 } },
      { text: '逐项重新核对，加班到凌晨修正后再报', hint: '辛苦但扎实', effect: { politics: 3, execute: 5, network: -1, integrity: 4 } },
      { text: '打电话叫醒分管领导请示', hint: '把责任上交', effect: { politics: 4, execute: -2, network: -3, integrity: 2 } },
      { text: '先睡一觉，明早提前到岗处理', hint: '赌一把明早来得及', effect: { politics: -2, execute: 1, network: 0, integrity: 1 } },
    ],
  },
  {
    tag: 'opportunity', tagLabel: '晋升机遇',
    title: '一把手点名将你随行调研',
    desc: '局长临时决定下周赴基层调研，办公室需要在科员中挑一名随行记录员。老科长在走廊拦住你："这次跟一把手出去，可是露脸的机会，但路上出任何岔子也是你兜着。"你的同事小刘也在争取这个名额。',
    hint: '机会与风险总是同行。',
    choices: [
      { text: '主动请缨，连夜准备调研背景材料', hint: '态度和能力都要拿出来', effect: { politics: 4, execute: 5, network: 3, integrity: 2 } },
      { text: '让给小刘，自己专心手头工作', hint: '以退为进？', effect: { politics: 1, execute: 2, network: 3, integrity: 3 } },
      { text: '找老科长说情确保自己入选', hint: '走门路', effect: { politics: 2, execute: 0, network: 5, integrity: -3 } },
      { text: '既不争取也不拒绝，等组织安排', hint: '随缘', effect: { politics: -1, execute: -2, network: -2, integrity: 1 } },
    ],
  },
  {
    tag: 'temptation', tagLabel: '利益诱惑',
    title: '验收现场的购物卡',
    desc: '你参与项目验收，施工方老板临走时握住你的手，一个信封顺势塞进你口袋："一点心意，验收标准弹性那么大，您多关照。"信封厚度可观。当晚，老板又发来饭局邀请，地点在城里最好的酒店。',
    hint: '吃了人家的嘴短，拿了人家的手软。',
    choices: [
      { text: '第二天把信封上交纪检并说明情况', hint: '干净彻底', effect: { politics: 3, execute: 2, network: -4, integrity: 7 } },
      { text: '退还信封，饭局婉拒但留了面子', hint: '守住底线不得罪人', effect: { politics: 4, execute: 1, network: 1, integrity: 5 } },
      { text: '收下信封，验收时"灵活掌握"', hint: '一步错步步错', effect: { politics: 2, execute: -2, network: 4, integrity: -8 } },
      { text: '信封退回，但饭局照去', hint: '自欺欺人的平衡', effect: { politics: 1, execute: 0, network: 3, integrity: -4 } },
    ],
  },
  {
    tag: 'politics', tagLabel: '政治站队',
    title: '两位领导的方案之争',
    desc: '分管副局长主张的方案甲与局长倾向的方案乙在会上正面相撞。散会后，副局长把你叫进办公室："小X，方案甲的数据支撑材料，还要靠你们科室出。"你手里握着双方都要的关键数据。',
    hint: '神仙打架，小鬼遭殃。',
    choices: [
      { text: '如实呈现两套方案各自的利弊', hint: '让数据说话', effect: { politics: 5, execute: 4, network: -2, integrity: 4 } },
      { text: '按副局长的意思调整数据口径', hint: '站队副局长', effect: { politics: 3, execute: -1, network: 5, integrity: -5 } },
      { text: '提前向局长汇报副局长动向', hint: '站队局长', effect: { politics: 4, execute: 0, network: 4, integrity: -3 } },
      { text: '称病请假，躲开这轮风波', hint: '躲得了一时', effect: { politics: -3, execute: -2, network: -3, integrity: 1 } },
    ],
  },
  {
    tag: 'crisis', tagLabel: '危机应对',
    title: '信访群众围住了办公楼',
    desc: '周一早晨，三十多名群众拉着横幅围在单位门口，反映拆迁补偿款拖欠问题。媒体记者闻讯赶来，直播镜头已经架起。上访代表情绪激动，要求"领导十分钟内出来对话"。值班电话此起彼伏。',
    hint: '群众的事，拖不得也躲不得。',
    choices: [
      { text: '主动下楼接待，倾听诉求并公开处理时限', hint: '直面问题', effect: { politics: 4, execute: 5, network: 2, integrity: 5 } },
      { text: '立即上报领导，按指示办理', hint: '程序正确', effect: { politics: 2, execute: 2, network: 0, integrity: 2 } },
      { text: '联系公安维持秩序先清场', hint: '激化矛盾', effect: { politics: -4, execute: 2, network: -4, integrity: -5 } },
      { text: '让保安挡驾，自己从后门离开', hint: '逃避', effect: { politics: -5, execute: -3, network: -3, integrity: -3 } },
    ],
  },
  {
    tag: 'interpersonal', tagLabel: '人际关系',
    title: '老科长的退休前托付',
    desc: '还有三个月退休的老科长把你叫到办公室，泡了杯好茶："我在这个岗位干了二十六年，有些经验和人脉，想传给你。不过我那套做法，年轻人可能看不上。"茶香里，你听出了另有深意。',
    hint: '姜还是老的辣。',
    choices: [
      { text: '虚心请教，主动帮老科长整理交接材料', hint: '尊师重道', effect: { politics: 3, execute: 3, network: 5, integrity: 3 } },
      { text: '客气应付，按自己节奏来', hint: '保持距离', effect: { politics: 0, execute: 1, network: -2, integrity: 1 } },
      { text: '借机打听科室的历史遗留问题', hint: '务实但功利', effect: { politics: 4, execute: 2, network: 2, integrity: -1 } },
      { text: '婉拒，新官不理旧账', hint: '切割', effect: { politics: -2, execute: 2, network: -4, integrity: 0 } },
    ],
  },
  {
    tag: 'daily', tagLabel: '日常政务',
    title: '材料改到第七稿',
    desc: '领导讲话稿改到第七稿，凌晨一点，处长发来消息："第三段高度不够，重写。"你重读那一段，其实写得并不差。窗外的路灯下，环卫工人已经开始清扫街道。明早八点，这份稿子要用。',
    hint: '文经我手无差错，事交我办请放心。',
    choices: [
      { text: '按"高度"要求重新立意，通宵重写', hint: '会吃苦', effect: { politics: 3, execute: 5, network: 2, integrity: 2 } },
      { text: '小修小改，换几个提法应付', hint: '赌他看不出', effect: { politics: 1, execute: -2, network: -1, integrity: -2 } },
      { text: '请教笔杆子老前辈一起打磨', hint: '善用资源', effect: { politics: 4, execute: 3, network: 4, integrity: 1 } },
      { text: '直接问处长"高度"具体指什么', hint: '看似笨拙实则聪明', effect: { politics: 5, execute: 2, network: 1, integrity: 2 } },
    ],
  },
  {
    tag: 'crisis', tagLabel: '危机应对',
    title: '网络舆情半夜爆了',
    desc: '凌晨两点，值班电话把你惊醒：本地论坛一篇《XX局办事难》的帖子火了，两小时三万点击，截图开始在微博扩散。帖子里的事一半属实一半夸大。宣传部要求早晨七点前拿出回应口径。',
    hint: '谣言止于透明。',
    choices: [
      { text: '连夜核查事实，早晨发布完整情况说明', hint: '公开透明', effect: { politics: 4, execute: 5, network: 1, integrity: 5 } },
      { text: '联系论坛删帖控制传播', hint: '掩耳盗铃', effect: { politics: -3, execute: 1, network: 2, integrity: -6 } },
      { text: '只回应属实部分，夸大部分保留追责权利', hint: '有理有节', effect: { politics: 5, execute: 3, network: -1, integrity: 3 } },
      { text: '等领导上班再说', hint: '错过黄金四小时', effect: { politics: -4, execute: -3, network: -2, integrity: -1 } },
    ],
  },
  {
    tag: 'opportunity', tagLabel: '晋升机遇',
    title: '空缺的副科长职位',
    desc: '副科长老周调走，职位空了出来。科长暗示你"资历还浅"，但局长在电梯里却问你"年轻人有什么想法"。同事老钱比你资历老，也在活动。民主推荐会下周召开。',
    hint: '机会面前，资历与人脉、能力与口碑都在天平上。',
    choices: [
      { text: '踏实做出一件拿得出手的实绩再去竞争', hint: '以实绩说话', effect: { politics: 3, execute: 5, network: 1, integrity: 4 } },
      { text: '逐个拜访科室同事争取推荐票', hint: '人气也是实力', effect: { politics: 2, execute: 0, network: 5, integrity: -2 } },
      { text: '向局长当面汇报个人想法与规划', hint: '毛遂自荐', effect: { politics: 5, execute: 2, network: 3, integrity: 0 } },
      { text: '主动退出，成全老钱', hint: '以退为进or真的退', effect: { politics: -1, execute: 1, network: 3, integrity: 3 } },
    ],
  },
  {
    tag: 'temptation', tagLabel: '利益诱惑',
    title: '审批窗口的老同学',
    desc: '来办事的企业的项目经办人，竟是你高中同桌。他把你拉到走廊："老同学，材料差一个章，通融一下，周末聚聚，你嫂子一直念叨你。"材料确实差一份前置证明，但"也不是不能变通"。',
    hint: '人情是债，公章是命。',
    choices: [
      { text: '按规定退回材料，周末自费赴约叙旧', hint: '公私分明', effect: { politics: 3, execute: 3, network: 2, integrity: 6 } },
      { text: '收下材料，让企业先补承诺书后补证明', hint: '变通的风险', effect: { politics: 1, execute: 2, network: 3, integrity: -4 } },
      { text: '直接盖章放行', hint: '违规', effect: { politics: -2, execute: -1, network: 4, integrity: -8 } },
      { text: '换同事接待，自己回避', hint: '回避制度', effect: { politics: 2, execute: 0, network: -1, integrity: 3 } },
    ],
  },
  {
    tag: 'politics', tagLabel: '政治站队',
    title: '饭局上的座次玄机',
    desc: '一场看似普通的聚餐，主位是常务副职，你的直接领导坐在下手。席间常务副职举杯到你这桌："年轻人是单位的未来。"所有人都在看你如何回应，你的领导端着杯子没说话。',
    hint: '饭局无小事，座次皆文章。',
    choices: [
      { text: '起身敬酒，先谢领导培养再表决心', hint: '滴水不漏', effect: { politics: 5, execute: 1, network: 4, integrity: 1 } },
      { text: '只回应常务副职的热情', hint: '踩了直属领导', effect: { politics: 2, execute: 0, network: 3, integrity: -1 } },
      { text: '低调应答，提前离席', hint: '不站队', effect: { politics: 1, execute: 0, network: -2, integrity: 2 } },
      { text: '借敬酒把话题引回工作成绩，归功领导', hint: '高情商', effect: { politics: 4, execute: 2, network: 5, integrity: 2 } },
    ],
  },
  {
    tag: 'daily', tagLabel: '日常政务',
    title: '检查组明天到',
    desc: '上级检查组明天上午到，重点查资金使用台账。科室台账有两笔支出原始凭证找不到，涉及金额不大，但"说不清就是问题"。老会计建议"先做个情况说明顶一下"。',
    hint: '小洞不补，大洞吃苦。',
    choices: [
      { text: '连夜翻找原始凭证，找银行调记录', hint: '笨办法最可靠', effect: { politics: 2, execute: 5, network: 0, integrity: 5 } },
      { text: '如实写情况说明，主动承认管理疏漏', hint: '诚实但有风险', effect: { politics: 3, execute: 2, network: -1, integrity: 6 } },
      { text: '按老会计意思先做个说明顶过去', hint: '埋雷', effect: { politics: 1, execute: -2, network: 2, integrity: -5 } },
      { text: '请示领导由单位层面统筹应对', hint: '上交矛盾', effect: { politics: 3, execute: 1, network: 1, integrity: 1 } },
    ],
  },
];

/** mock 用 NPC 姓名/职务池。 */
const MOCK_NAMES = ['王建国', '李淑芬', '张卫东', '刘志强', '陈明理', '赵亚男', '周正风', '吴天成'];
const MOCK_TITLES = ['分管副局长', '科室老科长', '办公室同事小刘', '对口企业经办人', '纪检组联络员'];

/** 从提示词中提取上下文(部门/职级/上一事件标题)。 */
function extractPromptContext(prompt: string): { deptName: string; rank: string; lastTitle: string | null } {
  const deptMatch = prompt.match(/部门：(.+)/);
  const rankMatch = prompt.match(/职级：(.+)/);
  const lastTitleMatch = prompt.match(/标题[:：](.+)/);
  return {
    deptName: deptMatch ? deptMatch[1].trim() : '单位',
    rank: rankMatch ? rankMatch[1].trim() : '科员',
    lastTitle: lastTitleMatch ? lastTitleMatch[1].trim() : null,
  };
}

/** 简单字符串哈希(生成确定性种子)。 */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 确定性 mock 客户端。
 * 相同提示词返回相同结果(便于断言);不同步数/历史产生不同事件(避免重复)。
 */
export class MockLLMClient implements LLMClient {
  private readonly templatePool: MockTemplate[];

  constructor(templatePool: MockTemplate[] = MOCK_TEMPLATES) {
    this.templatePool = templatePool;
  }

  async generate(prompt: string, _opts: LLMOptions = {}): Promise<string> {
    // 模拟真实延迟,压测时可注入更小值。
    await new Promise((r) => setTimeout(r, 2));
    if (prompt.includes('官途开局背景')) return this.mockBackground(prompt);
    return this.mockEvent(prompt);
  }

  private mockBackground(prompt: string): string {
    const rng = new SeededRandom(hashString(prompt));
    const name = rng.pick(['林若尘', '陈默', '王长松', '赵策', '沈清源']);
    return [
      `【行政级别】县级`,
      `【入职方式】省考招录（笔试第${rng.int(2, 9)}名）`,
      `【家庭背景】普通家庭，父母是教师`,
      `【开场白】你叫${name}，${rng.int(2014, 2016)}年秋天，你拖着行李箱站在单位门口。门卫大叔核对了三遍你的报到证，才笑着指了指三楼。科长老王递给你一杯浓茶："小伙子，先把近三年的文件档案看一遍。"窗外的梧桐叶落了一地，你的官途，就从这一摞泛黄的档案开始。`,
      `【初始职务】综合科科员`,
    ].join('\n');
  }

  private mockEvent(prompt: string): string {
    const rng: RNG = new SeededRandom(hashString(prompt));
    const ctx = extractPromptContext(prompt);
    // 尽量选取与提示词哈希不同的模板:取与步数相关的偏移。
    const stepMatch = prompt.match(/第(\d+)步/);
    const step = stepMatch ? parseInt(stepMatch[1], 10) : 0;
    const tmpl = this.templatePool[(step + hashString(prompt)) % this.templatePool.length];
    const npc1 = `${rng.pick(MOCK_NAMES)}(${ctx.deptName.split('（')[0]}${rng.pick(MOCK_TITLES)})`;
    const npc2 = `${rng.pick(MOCK_NAMES)}(${ctx.deptName.split('（')[0]}科员)`;

    const lines: string[] = [
      `【事件类型】${tmpl.tag}`,
      `【类型标签】${tmpl.tagLabel}`,
      `【事件标题】${tmpl.title}`,
      `【剧情衔接】${ctx.lastTitle ? `承接上一事件「${ctx.lastTitle}」的余波，${npc1.split('(')[0]}再次出现，事情有了新进展。` : '这是你入职后的第一件事，一切从这里开始。'}`,
      `【事件描述】${tmpl.desc}`,
      `【出场人物】${npc1}；${npc2}`,
      `【官场格言】${tmpl.hint}`,
    ];
    for (const letter of ['A', 'B', 'C', 'D']) {
      const c = tmpl.choices[['A', 'B', 'C', 'D'].indexOf(letter)];
      if (!c) continue;
      lines.push(`【选项${letter}】${c.text}`);
      lines.push(`【选项${letter}提示】${c.hint}`);
      lines.push(
        `【选项${letter}效果】政治嗅觉:${c.effect.politics} 执行力:${c.effect.execute} 人脉资源:${c.effect.network} 廉洁度:${c.effect.integrity} 晋升:0`,
      );
    }
    return lines.join('\n');
  }
}
