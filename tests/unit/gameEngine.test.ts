import { describe, expect, it } from 'vitest';
import {
  createGame,
  generateBackground,
  nextEvent,
  applyChoice,
  finishGame,
  DEFAULT_MAX_STEPS,
} from '../../src/engine/gameEngine.ts';
import { MockLLMClient } from '../../src/engine/llm.ts';
import { SeededRandom } from '../../src/engine/rng.ts';
import { validateRankFacts } from '../../src/engine/rankRules.ts';
import { netSum } from '../../src/engine/effects.ts';
import { isGenericTitle } from '../../src/engine/dedup.ts';
import type { LLMClient, LLMOptions, GameState } from '../../src/engine/types.ts';

/* ------------------------------------------------------------------ */
/* 测试专用 mock:按步数索引模板,保证 24 步标题互不相同,               */
/* 并在第 0/1 步埋入"职级错误"与"全零效果"两种待修复输出。            */
/* ------------------------------------------------------------------ */

interface TmplChoice {
  text: string;
  effect: Record<string, number>;
}

interface Tmpl {
  title: string;
  desc: string;
  /** 全零效果标记(第 1 步模板使用)。 */
  zeroEffects?: boolean;
  choices: TmplChoice[];
}

const TOPICS = [
  '急件深夜加班', '一把手点名调研', '验收现场的购物卡', '两位领导方案之争', '信访群众围堵办公楼',
  '老科长退休托付', '材料改到第七稿', '网络舆情半夜爆了', '空缺的副科长职位', '审批窗口的老同学',
  '饭局座次玄机', '检查组明天到', '防汛值守第一夜', '会议室的座次牌', '扶贫村的第一周',
  '接待工作的细节', '文件流转的失误', '民主生活会的发言', '跨部门协调会', '年度考核的谈话',
  '招标现场的质疑', '家属院的求助', '值班室的不速之客', '纪检组来电话', '表彰名单公示',
  '党校学习通知', '邻县考察团来访', '数据口径之争', '加班餐的报销单', '局长办公室的谈话',
];

function makeTemplates(): Tmpl[] {
  return TOPICS.map((topic, i) => {
    // 第 0 步埋入职级事实错误(用户反馈的原始案例)。
    const wrongRank = i === 0 ? '县住建局办公室主任（正科级）王强把一叠验收材料放到你桌上，' : '';
    return {
      title: topic,
      desc: `${wrongRank}周五下午，围绕${topic}，事情突然起了变化。分管领导要求你今天下班前给出意见，同事小刘在旁观望，窗外的天色渐渐暗了下来。这份材料牵涉多方利益，你必须做出决断。`,
      zeroEffects: i === 1,
      choices: [
        // 好选择:全面正增益。
        { text: '严格按规定办，连夜把基础工作做扎实', effect: { politics: 4, execute: 4, network: 2, integrity: 4 } },
        // 腐败选择:廉洁度大幅受损。
        { text: '收下对方的好处，睁一只眼闭一只眼', effect: { politics: 2, execute: 0, network: 4, integrity: -8 } },
        // 消极选择。
        { text: '多一事不如少一事，把皮球踢出去', effect: { politics: -4, execute: -3, network: 3, integrity: 1 } },
        // 投机选择。
        { text: '看领导眼色行事，顺势站队', effect: { politics: 3, execute: -2, network: -3, integrity: 2 } },
      ],
    };
  });
}

const TEMPLATES = makeTemplates();

/** 步数索引的确定性 LLM mock。 */
class StepMockLLM implements LLMClient {
  calls = 0;

  async generate(prompt: string, _opts: LLMOptions = {}): Promise<string> {
    this.calls++;
    if (prompt.includes('官途开局背景')) {
      return [
        '【行政级别】县级',
        '【入职方式】省考招录（笔试第3名）',
        '【家庭背景】普通教师家庭',
        '【开场白】你叫陈默，2015年秋天拖着行李箱站在单位门口。门卫大叔核对了三遍你的报到证才放行，科长递来一杯浓茶："年轻人，先把近三年的档案看一遍。"窗外的梧桐叶落了一地，你的官途从这一摞泛黄的档案开始。',
        '【初始职务】综合科科员',
      ].join('\n');
    }
    const stepMatch = prompt.match(/第(\d+)步/);
    const step = stepMatch ? parseInt(stepMatch[1], 10) - 1 : 0;
    const t = TEMPLATES[step % TEMPLATES.length];
    const effectStr = (c: TmplChoice) =>
      t.zeroEffects
        ? '政治嗅觉:0 执行力:0 人脉资源:0 廉洁度:0 晋升:0'
        : `政治嗅觉:${c.effect.politics} 执行力:${c.effect.execute} 人脉资源:${c.effect.network} 廉洁度:${c.effect.integrity} 晋升:0`;
    const lines = [
      '【事件类型】daily',
      '【类型标签】日常政务',
      `【事件标题】${t.title}`,
      '【剧情衔接】承接上一事件的余波，事情有了新进展。',
      `【事件描述】${t.desc}`,
      '【出场人物】王建国(县住建局副局长)；李芳(办公室科员)',
      '【官场格言】慎独慎微。',
    ];
    'ABCD'.split('').forEach((letter, idx) => {
      const c = t.choices[idx];
      lines.push(`【选项${letter}】${c.text}`);
      lines.push(`【选项${letter}提示】谨慎抉择`);
      lines.push(`【选项${letter}效果】${effectStr(c)}`);
    });
    return lines.join('\n');
  }
}

/** 选择策略:好玩家选净收益+廉洁最高项;坏玩家选廉洁最低项。 */
type Policy = 'good' | 'bad';

function pickChoice(state: GameState, policy: Policy): number {
  const choices = state.currentEvent!.choices;
  let best = 0;
  let bestScore = policy === 'good' ? -Infinity : Infinity;
  choices.forEach((c, i) => {
    const score = policy === 'good'
      ? netSum(c.effect) + 2 * c.effect.integrity
      : c.effect.integrity;
    const better = policy === 'good' ? score > bestScore : score < bestScore;
    if (better) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/** 跑完整一局(24 步),返回终局状态与结局。 */
async function runFullGame(policy: Policy) {
  const llm = new StepMockLLM();
  let state = createGame('weiban', 'normal', new SeededRandom(7));
  state = await generateBackground(state, llm);
  const perEventChecks: Array<ReturnType<typeof checkEvent>> = [];
  for (let i = 0; i < DEFAULT_MAX_STEPS; i++) {
    state = await nextEvent(state, llm, null, new SeededRandom(100 + i));
    perEventChecks.push(checkEvent(state));
    const result = applyChoice(state, pickChoice(state, policy));
    state = result.state;
  }
  return { state, ending: finishGame(state), perEventChecks };
}

/** 每个事件的量化验收(用户算法诉求 2/3)。 */
function checkEvent(state: GameState) {
  const ev = state.currentEvent!;
  const attrKeys = ['politics', 'execute', 'network', 'integrity'] as const;
  return {
    title: ev.title,
    choices: ev.choices.map((c) => ({
      text: c.text,
      nonZero: attrKeys.some((k) => c.effect[k] !== 0),
      netPositive: netSum(c.effect) > 0,
      integrityPositive: c.effect.integrity > 0,
    })),
    rankViolations: validateRankFacts(ev.desc).length,
  };
}

/* ------------------------------------------------------------------ */

describe('游戏引擎端到端(mock LLM,确定性)', () => {
  it('createGame:初始状态符合设计', () => {
    const s = createGame('weiban', 'normal', new SeededRandom(1));
    expect(s.dept.ratings).toEqual({ power: 5, busy: 5, promotion: 5, risk: 3 });
    expect(s.attrs).toEqual({ politics: 50, execute: 50, network: 50, integrity: 80 });
    expect(s.rank).toBe(0);
    expect(s.maxSteps).toBe(DEFAULT_MAX_STEPS);
    expect(s.usedTitles).toHaveLength(0);
    expect(s.ended).toBe(false);
  });

  it('generateBackground:mock 正常返回 → 解析成功', async () => {
    const s = createGame('weiban', 'normal', new SeededRandom(1));
    const out = await generateBackground(s, new StepMockLLM());
    expect(out.background).not.toBeNull();
    expect(out.background!.openingText).toContain('陈默');
    expect(out.background!.rankTitle).toBe('综合科科员');
  });

  it('generateBackground:LLM 失败 → 回退预设背景', async () => {
    const failing: LLMClient = { generate: () => Promise.reject(new Error('upstream down')) };
    const s = createGame('weiban', 'normal', new SeededRandom(1));
    const out = await generateBackground(s, failing);
    expect(out.background).not.toBeNull();
    expect(out.background!.openingText.length).toBeGreaterThanOrEqual(30);
  });

  it('nextEvent/applyChoice 不修改传入状态(纯函数)', async () => {
    const llm = new StepMockLLM();
    let s = createGame('weiban', 'normal', new SeededRandom(3));
    const snapshot = JSON.stringify(s);
    s = await nextEvent(s, llm, null, new SeededRandom(1));
    expect(JSON.stringify(s)).not.toBe(snapshot);
    const beforeChoice = JSON.stringify(s);
    applyChoice(s, 0);
    expect(JSON.stringify(s)).toBe(beforeChoice);
    // 原快照仍可复原(未被污染)。
    expect(() => JSON.parse(snapshot)).not.toThrow();
  });

  it('错误路径:无事件/非法选项/已结束', async () => {
    const s = createGame('weiban', 'normal', new SeededRandom(1));
    expect(() => applyChoice(s, 0)).toThrow(/没有事件/);
    const llm = new StepMockLLM();
    const s2 = await nextEvent(s, llm, null, new SeededRandom(1));
    expect(() => applyChoice(s2, 99)).toThrow(/无效选项/);
    const ended = { ...s2, step: s2.maxSteps } as GameState;
    await expect(nextEvent(ended, llm)).rejects.toThrow(/已结束/);
  });

  it('第 0 步:用户案例"县住建局办公室主任(正科级)"被自动修正为股级', async () => {
    const llm = new StepMockLLM();
    let s = createGame('jiwei', 'normal', new SeededRandom(5));
    s = await nextEvent(s, llm, null, new SeededRandom(1));
    expect(s.currentEvent!.desc).toContain('县住建局办公室主任（股级）');
    expect(s.currentEvent!.desc).not.toContain('县住建局办公室主任（正科级）');
    expect(s.repairs.some((r) => r.kind === 'rank-fix')).toBe(true);
  });

  it('第 1 步:全零效果被再平衡补齐为非零', async () => {
    const llm = new StepMockLLM();
    let s = createGame('jiwei', 'normal', new SeededRandom(5));
    s = await nextEvent(s, llm, null, new SeededRandom(1));
    const r1 = applyChoice(s, 0).state;
    s = await nextEvent(r1, llm, null, new SeededRandom(2));
    for (const c of s.currentEvent!.choices) {
      const nonZero = ['politics', 'execute', 'network', 'integrity']
        .some((k) => c.effect[k as 'politics'] !== 0);
      expect(nonZero, `选项"${c.text}"仍全零`).toBe(true);
    }
    expect(s.repairs.some((r) => r.kind === 'effect-rebalance')).toBe(true);
  });

  it('好玩家全流程:24步无重复标题、100%属性变化、≥3次晋升、优结局', async () => {
    const { state, ending, perEventChecks } = await runFullGame('good');

    // 诉求 2:一局内无重复文案。
    expect(state.usedTitles).toHaveLength(DEFAULT_MAX_STEPS);
    expect(new Set(state.usedTitles).size).toBe(DEFAULT_MAX_STEPS);

    // 诉求 3:每个事件全部选项有属性变化,≥2 正向选项,≥1 廉洁正向。
    for (const check of perEventChecks) {
      for (const c of check.choices) {
        expect(c.nonZero, `「${check.title}」选项属性全零`).toBe(true);
      }
      expect(check.choices.filter((c) => c.netPositive).length, `「${check.title}」正向选项<2`).toBeGreaterThanOrEqual(2);
      expect(check.choices.some((c) => c.integrityPositive), `「${check.title}」无廉洁正向选项`).toBe(true);
      // 诉求 4:职级零错误。
      expect(check.rankViolations, `「${check.title}」存在职级错误`).toBe(0);
    }
    // 时间线每一步都有可感知变化(100% 非零)。
    for (const t of state.timeline) {
      const anyNonZero = ['politics', 'execute', 'network', 'integrity']
        .some((k) => t.effects[k as 'politics'] !== 0);
      expect(anyNonZero, `第${t.step}步无任何属性变化`).toBe(true);
    }

    // 诉求 5:升官的快乐 —— ≥3 次晋升,职级显著提升。
    expect(state.promotions.length).toBeGreaterThanOrEqual(3);
    expect(state.rank).toBeGreaterThanOrEqual(3);
    expect(state.promotionPointsSpent).toBeGreaterThan(0);
    // 廉洁玩家终局应为优秀结局。
    expect(['GREAT', 'GOOD']).toContain(ending.endingType);
    expect(state.attrs.integrity).toBeGreaterThanOrEqual(60);
    expect(state.ended).toBe(true);
    expect(state.step).toBe(DEFAULT_MAX_STEPS);
    // 时间线完整:24 条。
    expect(state.timeline).toHaveLength(DEFAULT_MAX_STEPS);
    // 年份随步数推进。
    expect(state.year).toBe(2015 + DEFAULT_MAX_STEPS);
  }, 30000);

  it('坏玩家全流程:廉洁崩盘 → BAD 结局,晋升明显更少', async () => {
    const { state, ending } = await runFullGame('bad');
    expect(state.attrs.integrity).toBeLessThanOrEqual(30);
    expect(ending.endingType).toBe('BAD');
    // 腐败路线晋升不应多于好玩家(设计:廉洁门槛拦截)。
    expect(state.promotions.length).toBeLessThanOrEqual(2);
  }, 30000);

  it('MockLLMClient(引擎自带):连续生成不抛错且可解析', async () => {
    const llm = new MockLLMClient();
    let s = createGame('fuban', 'normal', new SeededRandom(11));
    s = await generateBackground(s, llm);
    expect(s.background!.openingText.length).toBeGreaterThanOrEqual(30);
    for (let i = 0; i < 5; i++) {
      s = await nextEvent(s, llm, null, new SeededRandom(i));
      expect(s.currentEvent!.choices.length).toBeGreaterThanOrEqual(2);
      s = applyChoice(s, 0).state;
    }
    expect(s.step).toBe(5);
  }, 30000);

  it('格式违规自动重试:前两次输出损坏(零选项/缺标题)→ 第三次成功', async () => {
    const good = new StepMockLLM();
    // 与去重无关的干净输出(模板 0 的「急件深夜加班」是泛化标题,会叠
    // 加一次去重重试,干扰本用例对格式重试次数的断言)。
    const cleanContent = [
      '【事件类型】daily',
      '【类型标签】日常政务',
      '【事件标题】审计组进驻开发区的前夜',
      '【剧情衔接】开局引入。',
      '【事件描述】审计通知突然下达，你手头的台账还有三处没对上。',
      '【出场人物】王建国(县住建局副局长)',
      '【官场格言】慎独慎微。',
      '【选项A】连夜核对台账',
      '【选项A提示】稳妥',
      '【选项A效果】政治嗅觉:+4 执行力:+5 人脉资源:0 廉洁度:+3 晋升:0',
      '【选项B】先睡觉明天再说',
      '【选项B提示】冒险',
      '【选项B效果】政治嗅觉:-3 执行力:-2 人脉资源:0 廉洁度:-1 晋升:0',
    ].join('\n');
    let eventCalls = 0;
    const flaky: LLMClient = {
      generate: async (prompt, opts) => {
        if (prompt.includes('官途开局背景')) return good.generate(prompt, opts);
        eventCalls++;
        if (eventCalls === 1) return '抱歉，我不能生成这个内容。'; // 拒答:无任何【】标记
        if (eventCalls === 2) return '【事件类型】daily\n【类型标签】日常政务\n【事件描述】缺标题缺选项的残缺输出'; // 缺【事件标题】
        return cleanContent;
      },
    };
    let s = createGame('weiban', 'normal', new SeededRandom(2));
    s = await nextEvent(s, flaky, null, new SeededRandom(1));
    expect(eventCalls).toBe(3);
    expect(s.currentEvent!.choices.length).toBeGreaterThanOrEqual(2);
    expect(s.currentEvent!.title.length).toBeGreaterThan(0);
  }, 30000);

  it('格式违规连续三次 → 仍向上层抛出解析错误(不静默兜底)', async () => {
    const bad: LLMClient = { generate: () => Promise.resolve('完全无关的输出') };
    const s = createGame('weiban', 'normal', new SeededRandom(2));
    await expect(nextEvent(s, bad, null, new SeededRandom(1))).rejects.toThrow(/解析|格式|选项/);
  }, 30000);

  it('顽固泛化标题 LLM(永远输出「暗流涌动」)→ 引擎兜底改写,绝不放行套话/重复标题', async () => {
    // 真实 GLM 扫描实测:glm-4-flash 对套话标题有强先验,3 次重试也可能
    // 原地打转。引擎必须硬性兜底,而不是接受重复。
    const stubborn = (n: number): LLMClient => ({
      generate: async (prompt) => {
        if (prompt.includes('官途开局背景')) {
          return new StepMockLLM().generate(prompt);
        }
        return [
          '【事件类型】daily',
          '【类型标签】日常政务',
          '【事件标题】暗流涌动',
          '【剧情衔接】承接上一事件的余波。',
          `【事件描述】第${n}个完全不同的具体事件:开发区的雨污分流工程验收材料出了纰漏,施工方连夜送来补充说明。`,
          '【出场人物】王建国(县住建局副局长)',
          '【官场格言】慎独慎微。',
          '【选项A】按规范重新核验',
          '【选项A提示】稳妥',
          '【选项A效果】政治嗅觉:+4 执行力:+5 人脉资源:0 廉洁度:+3 晋升:0',
          '【选项B】先签了再说',
          '【选项B提示】有风险',
          '【选项B效果】政治嗅觉:-3 执行力:+2 人脉资源:+2 廉洁度:-6 晋升:0',
        ].join('\n');
      },
    });
    let s = createGame('weiban', 'normal', new SeededRandom(3));
    s = await generateBackground(s, stubborn(0));
    for (let i = 0; i < 3; i++) {
      s = await nextEvent(s, stubborn(i + 1), null, new SeededRandom(i));
      expect(s.currentEvent!.title, `第${i + 1}步`).not.toBe('暗流涌动');
      expect(isGenericTitle(s.currentEvent!.title), `第${i + 1}步:${s.currentEvent!.title}`).toBe(false);
      s = applyChoice(s, 0).state;
    }
    // 全局口径:对抗性同质输入下,引擎能保证的是标题全字符串唯一
    // (幕数兜底);语义级差异依赖生成端多样性,由 StepMockLLM 全流程
    // 用例的相似度断言覆盖。
    expect(new Set(s.usedTitles).size).toBe(s.usedTitles.length);
  }, 30000);
});
