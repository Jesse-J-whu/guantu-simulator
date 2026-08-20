import { describe, expect, it } from 'vitest';
import { parseMarkerFields, parseEffectString, parseEvent, parseBackground } from '../../src/engine/parser.ts';

describe('【】标记字段解析(抗语法错误的 LLM 输出格式)', () => {
  it('切分全部字段,容忍多行内容与多余空白', () => {
    const content = [
      '【事件类型】temptation',
      '【事件标题】验收现场的购物卡',
      '【事件描述】第一行\n第二行\n\n第三行',
      '【选项A】上交纪检',
      '【选项A效果】政治嗅觉:+3 廉洁度:+7',
    ].join('\n');
    const f = parseMarkerFields(content);
    expect(f['事件类型']).toBe('temptation');
    expect(f['事件标题']).toBe('验收现场的购物卡');
    expect(f['事件描述']).toContain('第二行');
    expect(f['选项A']).toBe('上交纪检');
  });

  it('无标记内容返回空对象', () => {
    expect(parseMarkerFields('随便一段没有标记的文字')).toEqual({});
  });
});

describe('效果串解析', () => {
  it('解析四维属性与晋升,支持负数与小数', () => {
    const e = parseEffectString('政治嗅觉:+5 执行力:-3 人脉资源:+2 廉洁度:0 晋升:1');
    expect(e).toEqual({ politics: 5, execute: -3, network: 2, integrity: 0, promotion: 1 });
  });

  it('全角冒号与空格容错', () => {
    const e = parseEffectString('政治嗅觉：+4  廉洁度：-2.6');
    expect(e.politics).toBe(4);
    expect(e.integrity).toBe(-3);
  });

  it('空串返回全零', () => {
    expect(parseEffectString('')).toEqual({ politics: 0, execute: 0, network: 0, integrity: 0, promotion: 0 });
  });
});

describe('事件解析', () => {
  function buildContent(opts: { title?: string; choices?: number } = {}): string {
    const lines = [
      '【事件类型】temptation',
      '【类型标签】利益诱惑',
      `【事件标题】${opts.title ?? '验收现场的购物卡'}`,
      '【剧情衔接】承接上文的余波',
      '【事件描述】施工方塞来一个厚信封。',
      '【出场人物】王建国(县住建局局长)；李芳(办公室主任)',
      '【官场格言】拿了手软。',
    ];
    const n = opts.choices ?? 3;
    for (let i = 0; i < n; i++) {
      const letter = 'ABCD'[i];
      lines.push(`【选项${letter}】选项${letter}内容`);
      lines.push(`【选项${letter}提示】提示${letter}`);
      lines.push(`【选项${letter}效果】政治嗅觉:+${i} 执行力:-1 人脉资源:0 廉洁度:+2 晋升:0`);
    }
    return lines.join('\n');
  }

  it('完整事件被正确解析(类型/标签/NPC/选项)', () => {
    const ev = parseEvent(buildContent(), 3);
    expect(ev.tag).toBe('temptation');
    expect(ev.tagLabel).toBe('利益诱惑');
    expect(ev.title).toBe('验收现场的购物卡');
    expect(ev.continuity).toContain('余波');
    expect(ev.npcs).toHaveLength(2);
    expect(ev.npcs[0]).toBe('王建国(县住建局局长)');
    expect(ev.choices).toHaveLength(3);
    expect(ev.choices[0].effect.politics).toBe(0);
    expect(ev.choices[0].hint).toBe('提示A');
    expect(ev.aiGenerated).toBe(true);
  });

  it('未知事件类型回退 daily', () => {
    const ev = parseEvent(buildContent().replace('temptation', 'unknown-tag'), 0);
    expect(ev.tag).toBe('daily');
  });

  it('选项不足 2 个 → 抛错', () => {
    expect(() => parseEvent(buildContent({ choices: 1 }), 0)).toThrow(/选项/);
    expect(() => parseEvent('没有选项的内容', 0)).toThrow();
  });

  it('键名变体容错:【选项 A】/全角Ａ 与 【选项A】 同键', () => {
    const content = buildContent({}).replace(/【选项([AB])】/g, (_m, l) => `【选项 ${l}】`);
    const evt = parseEvent(content, 0);
    expect(evt.choices.length).toBeGreaterThanOrEqual(2);
    const fullwidth = buildContent({}).replace(/【选项A】/, '【选项Ａ】');
    expect(parseEvent(fullwidth, 0).choices.length).toBeGreaterThanOrEqual(1);
  });

  it('真实样本(GLM风控安全重试输出):选项正文空、内容在提示字段 → 回退解析', () => {
    // 2026-08-21 生产路径实测抓取:【选项A】后直接跟【选项A提示】,正文为空。
    const sample = [
      '【事件类型】daily',
      '【类型标签】日常政务',
      '【事件标题】初识领导风格',
      '【剧情衔接】刚入职综合科，首次参与领导会议',
      '【事件描述】今天是我第一次参与领导的会议，会议中领导对工作的态度和要求让我印象深刻。',
      '【出场人物】张强（委办主任）',
      '【官场格言】“领导者的艺术在于倾听和选择。”',
      '【选项A】',
      '【选项A提示】提出自己的看法，争取领导认可',
      '【选项A效果】政治嗅觉:+5 执行力:+3 人脉资源:+2 廉洁度:0 晋升:0',
      '【选项B】',
      '【选项B提示】认真聆听，记录领导意见',
      '【选项B效果】政治嗅觉:0 执行力:-4 人脉资源:0 廉洁度:+5 晋升:0',
    ].join('\n');
    const evt = parseEvent(sample, 0);
    expect(evt.choices.length).toBe(2);
    expect(evt.choices[0].text).toBe('提出自己的看法，争取领导认可');
    expect(evt.choices[0].effect.politics).toBe(5);
  });

  it('解析错误携带内容摘录(线上诊断)', () => {
    expect(() => parseEvent('抱歉，我无法生成这个内容。', 0)).toThrow(/内容开头/);
  });

  it('缺少【事件标题】→ 抛错', () => {
    expect(() => parseEvent(buildContent({ title: '' }), 0)).toThrow(/事件标题/);
  });
});

describe('开局背景解析', () => {
  it('合法背景被解析', () => {
    const content = [
      '【行政级别】县级',
      '【入职方式】省考招录',
      '【家庭背景】教师家庭',
      '【开场白】你叫林若尘，2015年秋天拖着行李箱站在单位门口，门卫核对了三遍报到证。科长递来一杯浓茶，窗外的梧桐叶落了一地，你的官途从这一摞档案开始。',
      '【初始职务】综合科科员',
    ].join('\n');
    const bg = parseBackground(content);
    expect(bg.level).toBe('县级');
    expect(bg.rankTitle).toBe('综合科科员');
    expect(bg.openingText.length).toBeGreaterThanOrEqual(30);
  });

  it('开场白缺失或过短 → 抛错', () => {
    expect(() => parseBackground('【开场白】太短')).toThrow();
    expect(() => parseBackground('【初始职务】科员')).toThrow();
  });
});
