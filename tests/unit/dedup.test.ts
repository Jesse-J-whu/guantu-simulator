import { describe, expect, it } from 'vitest';
import { similarity, findMostSimilarTitle, checkEventFreshness, ShuffleBag } from '../../src/engine/dedup.ts';
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

  it('checkEventFreshness:事件内部选项互相重复 → 不新鲜', () => {
    const r = checkEventFreshness(
      { title: '全新事件', choices: mkChoices(['收下这笔好处费', '收下那份好处费', '坚决拒绝']) },
      [],
    );
    expect(r.fresh).toBe(false);
    expect(r.reasons.join()).toContain('高度相似');
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
