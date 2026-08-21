import { describe, expect, it } from 'vitest';
import {
  similarity, titleSimilarity, findMostSimilarTitle, findMostSimilarChoice, checkEventFreshness,
  enforceFreshness, isGenericTitle, TITLE_DUP_THRESHOLD, ShuffleBag,
} from '../../src/engine/dedup.ts';
import type { Choice } from '../../src/engine/types.ts';

function mkChoices(texts: string[]): Choice[] {
  return texts.map((text) => ({
    text,
    hint: '',
    effect: { politics: 1, execute: 1, network: 0, integrity: 0, promotion: 0 },
  }));
}

describe('文案去重(用户反馈:一局内重复出现相同文案和选项卡)', () => {
  it('相同标题相似度为 1,完全不同标题相似度低', () => {
    expect(titleSimilarity('土地审批风波', '土地审批风波')).toBe(1);
    expect(titleSimilarity('招商引资洽谈', '防汛抢险救灾')).toBeLessThan(0.2);
  });

  it('标题口径(bigram):换尾缀的重复被抓,同弧不同事件放行', () => {
    // 换尾缀仍算重复(用户投诉的「暗流涌动/暗流涌动再现」)。
    expect(titleSimilarity('暗流涌动', '暗流涌动再现')).toBeGreaterThanOrEqual(0.55);
    expect(titleSimilarity('深夜的抉择', '午夜的抉择')).toBeGreaterThanOrEqual(0.55);
    // 同一故事线的不同事件(围绕同一项目)不算重复——字符包含口径曾把
    // 这类判成 1.0,导致 18/24 事件被误判打入兜底改写。
    expect(titleSimilarity('老城区改造项目会议', '2020年，老城区改造项目终于迎来了转机')).toBeLessThan(0.4);
  });

  it('选项口径(含字符包含):短选项是长选项子串也算照抄', () => {
    expect(similarity('提出解决方案', '在会议中，保持沉默，等待他人提出解决方案。')).toBeGreaterThanOrEqual(0.8);
  });

  it('findMostSimilarTitle 命中最相近的历史标题', () => {
    const used = ['防汛救灾值班', '招商引资洽谈', '纪检谈话风波'];
    const best = findMostSimilarTitle('防汛救灾值守', used);
    expect(best?.title).toBe('防汛救灾值班');
    expect(best?.score).toBeGreaterThan(0.55);
  });

  it('findMostSimilarChoice 命中照抄的历史选项', () => {
    const hit = findMostSimilarChoice('将信息上报给领导，请求指示。', ['耐心倾听意见', '将信息上报给领导，请求指示。']);
    expect(hit?.score).toBeGreaterThanOrEqual(0.99);
  });

  it('checkEventFreshness:标题与历史重复 → 不新鲜并给出原因', () => {
    const r = checkEventFreshness(
      { title: '土地审批风波再起', choices: mkChoices(['依法驳回', '特事特办', '集体研究']) },
      ['土地审批风波'],
    );
    expect(r.fresh).toBe(false);
    expect(r.reasons.join()).toContain('土地审批风波');
  });

  it('checkEventFreshness:事件内部选项近乎照抄 → 不新鲜', () => {
    const r = checkEventFreshness(
      { title: '全新事件', choices: mkChoices(['收下这笔好处费', '收下这笔好处费再替他遮掩', '坚决拒绝']) },
      [],
    );
    expect(r.fresh).toBe(false);
    expect(r.reasons.join()).toContain('高度相似');
  });

  it('checkEventFreshness:选项措辞重叠但意思不同(0.7段) → 放行', () => {
    // 「这笔/那份」级措辞差异≈0.71,属于正常叙事多样性,不该触发重试
    // (首轮扫描曾因阈值过严把 18/24 事件打入兜底改写)。
    const r = checkEventFreshness(
      { title: '全新事件', choices: mkChoices(['收下这笔好处费', '收下那份好处费', '坚决拒绝']) },
      [],
    );
    expect(r.fresh).toBe(true);
  });

  it('checkEventFreshness:选项与此前事件的选项雷同 → 不新鲜(跨事件选项去重)', () => {
    const r = checkEventFreshness(
      { title: '全新标题事件', choices: mkChoices(['主动请缨，连夜准备调研背景材料', '另有新意的选择']) },
      [],
      ['主动请缨，连夜准备调研背景材料', '让给同事小刘'],
    );
    expect(r.fresh).toBe(false);
    expect(r.reasons.join()).toContain('雷同');
  });

  it('checkEventFreshness:选项与历史选项措辞不同 → 新鲜', () => {
    const r = checkEventFreshness(
      { title: '全新标题事件', choices: mkChoices(['牵头起草整改方案', '私下约谈施工方']) },
      [],
      ['主动请缨，连夜准备调研背景材料', '让给同事小刘'],
    );
    expect(r.fresh).toBe(true);
  });

  it('全新标题+互异选项 → 新鲜', () => {
    const r = checkEventFreshness(
      { title: '台风过境抢险', choices: mkChoices(['连夜驻守水库', '按预案转移群众', '向上级求援']) },
      ['招商引资洽谈', '纪检谈话风波'],
    );
    expect(r.fresh).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });
});

describe('泛化套话标题识别(真实扫描:暗流涌动在 9 部门复现 14 次)', () => {
  it('短套话标题被判泛化', () => {
    for (const t of ['暗流涌动', '深夜的抉择', '午夜的电话', '暗影下的抉择', '档案疑云再起']) {
      expect(isGenericTitle(t), t).toBe(true);
    }
  });

  it('含具体要素的标题不算泛化——即便带套话词', () => {
    for (const t of ['棚改资金审批的最后一关', '深夜赶写的防汛值班报告', '审计组进驻开发区的前夜']) {
      expect(isGenericTitle(t), t).toBe(false);
    }
  });

  it('checkEventFreshness:泛化标题即使与历史不相似也不新鲜', () => {
    const r = checkEventFreshness(
      { title: '暗流涌动', choices: mkChoices(['稳妥处理', '静观其变']) },
      ['招商引资洽谈'],
    );
    expect(r.fresh).toBe(false);
    expect(r.reasons.join()).toContain('泛化');
  });
});

describe('enforceFreshness 最终兜底(重试用尽后绝不原样放行重复)', () => {
  it('重复标题被改写为描述首句的具体化标题', () => {
    const event = {
      title: '暗流涌动',
      desc: '棚改办王主任把一份加急的验收材料放到你桌上。窗外的雨越下越大。',
      tagLabel: '日常政务',
      choices: mkChoices(['按流程办理', '先放一放']),
    };
    enforceFreshness(event, ['暗流涌动']);
    expect(event.title).not.toBe('暗流涌动');
    expect(event.title).toContain('棚改');
    expect(event.title.length).toBeLessThanOrEqual(18);
  });

  it('描述摘句仍撞车时拼类型标签兜底', () => {
    const event = {
      title: '深夜的抉择',
      desc: '审计组进驻开发区彻查账目。所有人都屏住了呼吸。',
      tagLabel: '危机应对',
      choices: mkChoices(['配合调查', '连夜补材料']),
    };
    // 历史标题恰好与摘句相似 → 追加类型标签区分。
    enforceFreshness(event, ['审计组进驻开发区彻查']);
    expect(event.title).toContain('危机应对');
  });

  it('标题兜底输出必须自验:绝不放行仍≥阈值或仍泛化的标题(reviewer PoC)', () => {
    // 对抗样本:历史标题与描述首句几乎相同(描述也同质化的极端情况),
    // 旧逻辑拼「·标签(第N幕)」后不回头验证,放行了 0.68 的撞车标题。
    const used = ['开发区的雨污分流工程验收材料出了纰漏'];
    const event = {
      title: '暗流涌动',
      desc: '开发区的雨污分流工程验收材料出了纰漏。施工方连夜送来补充说明。',
      tagLabel: '日常政务',
      choices: mkChoices(['按规范重新核验', '先签收再说']),
    };
    enforceFreshness(event, used, [], 4);
    // 自验硬保证:改写后的标题与全部历史标题 bigram 相似度 < 阈值。
    expect(findMostSimilarTitle(event.title, used)?.score ?? 0).toBeLessThan(TITLE_DUP_THRESHOLD);
    expect(isGenericTitle(event.title)).toBe(false);
  });

  it('描述首句本身是套话(深夜来电响起)→ 摘句被拒,换下一级候选', () => {
    const event = {
      title: '暗流涌动',
      desc: '深夜来电响起。你在办公室盯着那份材料犹豫要不要接。',
      tagLabel: '日常政务',
      choices: mkChoices(['接起电话', '按掉不理']),
    };
    enforceFreshness(event, []);
    expect(event.title).not.toBe('深夜来电响起');
    expect(isGenericTitle(event.title)).toBe(false);
  });

  it('描述无合格短句(雨夜。电话。)→ 绝不把被封禁的原标题嵌进兜底标题', () => {
    const event = {
      title: '暗流涌动',
      desc: '雨夜。电话。',
      tagLabel: '日常政务',
      choices: mkChoices(['接起电话', '按掉不理']),
    };
    enforceFreshness(event, []);
    expect(event.title).not.toContain('暗流涌动');
    expect(event.title.length).toBeGreaterThan(0);
  });

  it('半角标点的描述摘句在边界截断,尾部无悬挂标点', () => {
    const event = {
      title: '暗流涌动',
      desc: '项目验收现场,施工方老板临走时把一个厚信封塞进你口袋,当晚又发来饭局邀请。',
      tagLabel: '利益诱惑',
      choices: mkChoices(['上交纪检', '退还信封']),
    };
    enforceFreshness(event, []);
    // 旧逻辑只认全角标点,mock 的半角逗号导致 18 字腰斩(「…把一个」)。
    expect(event.title).not.toMatch(/[,，]$/);
    expect(event.title).not.toContain('把一个');
  });

  it('与历史雷同的选项被剔除,保底 2 个', () => {
    const event = {
      title: '全新且具体的标题',
      desc: '全新描述。',
      tagLabel: '日常政务',
      choices: mkChoices(['主动请缨，连夜准备调研背景材料', '完全不同的新选项甲', '截然不同的新选项乙', '再一个独立选项丙']),
    };
    enforceFreshness(event, [], ['主动请缨，连夜准备调研背景材料']);
    expect(event.choices).toHaveLength(3);
    expect(event.choices.map((c) => c.text)).not.toContain('主动请缨，连夜准备调研背景材料');
  });

  it('剔除后不足 2 个:保留碰撞最轻的 2 个,绝不整组原样放行逐字重复', () => {
    // 真实扫描回归:事件 4 个选项中 3 个与历史雷同时,旧逻辑为保可玩
    // 整组放行,导致「将信息上报给领导，请求指示。」逐字重复 3 次。
    const event = {
      title: '全新且具体的标题乙',
      desc: '全新描述乙。',
      tagLabel: '日常政务',
      choices: mkChoices([
        '将信息上报给领导，请求指示。',
        '与赵敏进行深入沟通，了解检查的具体内容和要求。',
        '将信息上报给领导，请求指示。并附上说明',
        '彻查台账并约谈经办人',
      ]),
    };
    enforceFreshness(event, [], ['将信息上报给领导，请求指示。', '与赵敏进行深入沟通，了解检查的具体内容和要求。']);
    expect(event.choices).toHaveLength(2);
    // 保留下的是碰撞分数最低的两个。
    expect(event.choices.map((c) => c.text).join('|')).toContain('彻查台账并约谈经办人');
    expect(event.choices.map((c) => c.text)).not.toContain('将信息上报给领导，请求指示。');
  });

  it('合成选项文案逐级验池:池中已有「暂缓观察留待」时,骨架候选被跳过(reviewer PoC)', () => {
    const pool = ['暂缓观察留待', '第6幕从严处置'];
    const event = {
      title: '全新且具体的标题己',
      desc: '全新描述己。',
      tagLabel: '日常政务',
      choices: mkChoices(['暂缓观察留待', '暂缓观察留待']),
    };
    enforceFreshness(event, [], pool, 5);
    expect(event.choices).toHaveLength(2);
    for (const c of event.choices) {
      expect(findMostSimilarChoice(c.text, pool)?.score ?? 0, `选项「${c.text}」与池碰撞`).toBeLessThan(0.8);
    }
  });

  it('连续两个退化事件(同标签风味):第二个事件的合成文案与第一个的合成文案零碰撞', () => {
    // 退化事件1:文案与既有池全等 → 引擎合成一对并入池。
    const seedPool = ['旧文案甲', '旧文案乙'];
    const ev1 = {
      title: '全新且具体的标题庚',
      desc: '全新描述庚。',
      tagLabel: '日常政务',
      choices: mkChoices(['旧文案甲', '旧文案乙']),
    };
    enforceFreshness(ev1, [], seedPool, 0);
    const pool = [...seedPool, ...ev1.choices.map((c) => c.text)];
    // 退化事件2:LLM 仍只给照抄 → 再合成。同标签风味下骨架必须轮换
    // (旧实现只靠步数数字,0.93 撞车,reviewer PoC)。
    const ev2 = {
      title: '全新且具体的标题辛',
      desc: '全新描述辛。',
      tagLabel: '日常政务',
      choices: mkChoices([...seedPool]),
    };
    enforceFreshness(ev2, [], pool, 1);
    expect(ev2.choices).toHaveLength(2);
    for (const c of ev2.choices) {
      expect(findMostSimilarChoice(c.text, pool)?.score ?? 0, `选项「${c.text}」与池碰撞`).toBeLessThan(0.8);
    }
    // 事件内两选项互不碰撞。
    expect(similarity(ev2.choices[0].text, ev2.choices[1].text)).toBeLessThan(0.8);
  });

  it('历史里出现逐字「第1幕」→ 终极兜底仍过验证,不放行 1.00 全等标题', () => {
    const event = {
      title: '暗流涌动',
      desc: '雨夜。电话。',
      tagLabel: '日常政务',
      choices: mkChoices(['接起电话', '按掉不理']),
    };
    enforceFreshness(event, ['第1幕'], [], 0);
    expect(findMostSimilarTitle(event.title, ['第1幕'])?.score ?? 0).toBeLessThan(TITLE_DUP_THRESHOLD);
  });

  it('描述缺失占位符不会成为玩家可见标题', () => {
    const event = {
      title: '暗流涌动',
      desc: '（事件描述缺失）',
      tagLabel: '日常政务',
      choices: mkChoices(['照抄文案丙', '照抄文案丁']),
    };
    enforceFreshness(event, []);
    expect(event.title).not.toBe('（事件描述缺失）');
    expect(event.title.length).toBeGreaterThan(0);
  });

  it('事件内部槽位互抄(LLM 把同一文案写进 A/B 槽)→ 照抄槽位被剔除', () => {
    // reviewer PoC 回归:旧兜底只查跨事件池,槽内互抄会原样放行两张
    // 一模一样的选项卡。
    const event = {
      title: '全新且具体的标题丙',
      desc: '全新描述丙。',
      tagLabel: '日常政务',
      choices: mkChoices(['收下这笔好处费', '收下这笔好处费', '坚决拒绝并上报']),
    };
    enforceFreshness(event, []);
    expect(event.choices).toHaveLength(2);
    expect(new Set(event.choices.map((c) => c.text)).size).toBe(2);
  });

  it('退化输出(两个选项全是池内全等重复)→ 引擎合成互异选项,绝不逐字放行', () => {
    const pool = ['将信息上报给领导，请求指示。', '立即组织人员核实相关情况'];
    const event = {
      title: '全新且具体的标题丁',
      desc: '全新描述丁。',
      tagLabel: '日常政务',
      choices: mkChoices(pool),
    };
    enforceFreshness(event, [], pool);
    expect(event.choices).toHaveLength(2);
    // 硬保证:任一放行选项与历史池的相似度都低于阈值(旧逻辑 1.0 全等放行)。
    for (const c of event.choices) {
      expect(findMostSimilarChoice(c.text, pool)?.score ?? 0, `选项「${c.text}」仍与历史雷同`).toBeLessThan(0.8);
    }
    expect(new Set(event.choices.map((c) => c.text)).size).toBe(2);
  });

  it('退化输出(4 个选项仅 1 个干净)→ 干净项保留,第二名绝不再是 1.0 全等', () => {
    const pool = ['将信息上报给领导，请求指示。', '与赵敏进行深入沟通，了解检查的具体内容和要求。'];
    const event = {
      title: '全新且具体的标题戊',
      desc: '全新描述戊。',
      tagLabel: '日常政务',
      choices: mkChoices([
        '将信息上报给领导，请求指示。',
        '与赵敏进行深入沟通，了解检查的具体内容和要求。',
        '将信息上报给领导，请求指示。并附上说明',
        '牵头成立专班排查整改',
      ]),
    };
    enforceFreshness(event, [], pool);
    expect(event.choices).toHaveLength(2);
    expect(event.choices.map((c) => c.text)).toContain('牵头成立专班排查整改');
    for (const c of event.choices) {
      expect(findMostSimilarChoice(c.text, pool)?.score ?? 0, `选项「${c.text}」仍与历史雷同`).toBeLessThan(0.8);
    }
  });
});

describe('ShuffleBag 抽取袋(供给端不重复)', () => {
  it('抽尽前元素不重复', () => {
    const bag = new ShuffleBag(['a', 'b', 'c', 'c'], (arr) => [...arr]);
    // 注意:两个 'c' 是不同元素副本,抽出的 4 次中 'c' 恰好出现 2 次。
    const drawn = [bag.draw(), bag.draw(), bag.draw(), bag.draw()].sort();
    expect(drawn).toEqual(['a', 'b', 'c', 'c']);
  });

  it('抽尽后自动重新装填,可无限抽取', () => {
    const bag = new ShuffleBag([1, 2, 3], (arr) => [...arr].reverse());
    // reverse 后 pop 从末尾取:顺序为 1,2,3;抽尽后重新 reverse 装填,循环往复。
    const drawn = Array.from({ length: 9 }, () => bag.draw());
    expect(drawn.slice(0, 3)).toEqual([1, 2, 3]);
    expect(drawn.slice(3, 6)).toEqual([1, 2, 3]);
    expect(drawn.slice(6, 9)).toEqual([1, 2, 3]);
  });

  it('洗牌函数被用于初始装填', () => {
    const bag = new ShuffleBag([1, 2, 3], (arr) => [...arr].reverse());
    expect(bag.remaining).toBe(3);
    expect(bag.draw()).toBe(1);
  });

  it('空袋抛错', () => {
    expect(() => new ShuffleBag([], (arr) => [...arr])).toThrow();
  });
});
