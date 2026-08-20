import { describe, expect, it } from 'vitest';
import {
  similarity, findMostSimilarTitle, checkEventFreshness, enforceFreshness, isGenericTitle, ShuffleBag,
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
    expect(similarity('土地审批风波', '土地审批风波')).toBe(1);
    expect(similarity('招商引资洽谈', '防汛抢险救灾')).toBeLessThan(0.2);
  });

  it('换几个字的"换汤不换药"标题被识别为高相似', () => {
    const s = similarity('拆迁户集体上访', '拆迁户联名上访');
    expect(s).toBeGreaterThan(0.5);
  });

  it('findMostSimilarTitle 命中最相近的历史标题', () => {
    const used = ['防汛救灾值班', '招商引资洽谈', '纪检谈话风波'];
    const best = findMostSimilarTitle('防汛救灾值守', used);
    expect(best?.title).toBe('防汛救灾值班');
    expect(best?.score).toBeGreaterThan(0.5);
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
