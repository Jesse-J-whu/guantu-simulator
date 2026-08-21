import { describe, expect, it } from 'vitest';
import {
  parseNPCField,
  mergeNPCs,
  buildSummary,
  addThread,
  buildContinuityContext,
} from '../../src/engine/storyMemory.ts';
import { createGame } from '../../src/engine/gameEngine.ts';
import { SeededRandom } from '../../src/engine/rng.ts';
import type { GameEvent, GameState, TimelineEntry } from '../../src/engine/types.ts';

function mkEvent(npcs: string[] = [], title = '测试事件'): GameEvent {
  return {
    id: 'evt_test', tag: 'daily', tagLabel: '日常政务', title, desc: '描述',
    hint: '', continuity: '', npcs, choices: [], aiGenerated: true, repairs: [],
  };
}

function freshState(): GameState {
  return createGame('jiwei', 'normal', new SeededRandom(1));
}

describe('NPC 名册(故事连续性:人物复用而非每次换新人)', () => {
  it('解析 "姓名(职务)" 格式并推断关系', () => {
    const list = parseNPCField('王建国(县住建局局长)；李芳(办公室科员)\n张三(县纪委书记)');
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ name: '王建国', title: '县住建局局长' });
    expect(list[0].relation).toBeTruthy();
  });

  it('格式不符的行被忽略', () => {
    expect(parseNPCField('路人甲；王建国(局长)；X(长)')).toHaveLength(1);
  });

  it('同名 NPC 合并并累计出场次数', () => {
    const s = freshState();
    mergeNPCs(s, mkEvent(['王建国(副局长)']), 1);
    mergeNPCs(s, mkEvent(['王建国(副局长)']), 2);
    expect(s.npcs).toHaveLength(1);
    expect(s.npcs[0].appearances).toBe(2);
    expect(s.npcs[0].lastStep).toBe(2);
  });

  it('名册超过 12 人时淘汰最久未出场者', () => {
    const s = freshState();
    // NPC 姓名须为 2-4 个汉字(解析规则),用中文数字编号。
    const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
    for (let i = 0; i < 15; i++) {
      mergeNPCs(s, mkEvent([`测${cn[i]}(科员)`]), i);
    }
    expect(s.npcs.length).toBeLessThanOrEqual(12);
    // 最后出场的人物必须在册。
    expect(s.npcs.some((n) => n.name === '测十五')).toBe(true);
    // 最早且未再出场的人物被淘汰。
    expect(s.npcs.some((n) => n.name === '测一')).toBe(false);
  });
});

describe('运行摘要与未决线索', () => {
  function tl(n: number): TimelineEntry[] {
    return Array.from({ length: n }, (_, i) => ({
      step: i + 1, year: 2015 + i, title: `事件${i + 1}`, tagLabel: '日常政务',
      choice: '稳妥处理', effects: { politics: 1, execute: 1, network: 0, integrity: 1, promotion: 0 },
      attrsAfter: { politics: 50, execute: 50, network: 50, integrity: 50 },
      rankAfter: 0, promoted: false,
    }));
  }

  it('空时间线 → 开局占位摘要', () => {
    expect(buildSummary(freshState())).toContain('刚踏上官途');
  });

  it('摘要包含最近 5 条且早期被压缩', () => {
    const s = freshState();
    s.timeline = tl(10);
    const summary = buildSummary(s);
    expect(summary).toContain('事件10');
    expect(summary).toContain('事件6');
    expect(summary).not.toContain('「事件1」');
    expect(summary).toContain('5次考验');
  });

  it('廉洁受损与晋升在摘要中有标注', () => {
    const s = freshState();
    s.timeline = tl(2);
    s.timeline[0].effects.integrity = -5;
    s.timeline[1].promoted = true;
    const summary = buildSummary(s);
    expect(summary).toContain('廉洁受损');
    expect(summary).toContain('获得晋升');
  });

  it('未决线索最多保留 4 条', () => {
    const s = freshState();
    for (let i = 0; i < 7; i++) addThread(s, `线索${i}`);
    expect(s.threads).toHaveLength(4);
    expect(s.threads[0]).toBe('线索3');
    expect(s.threads[3]).toBe('线索6');
  });
});

describe('连续性上下文注入(下一提示词)', () => {
  it('包含摘要、名册、上一事件与玩家选择', () => {
    const s = freshState();
    s.summary = '2015年「事件1」中你稳妥处理';
    mergeNPCs(s, mkEvent(['王建国(副局长)']), 1);
    const last = mkEvent([], '上一事件标题');
    last.desc = '上一事件的详细描述。';
    s.timeline = [{
      step: 1, year: 2015, title: '上一事件标题', tagLabel: '日常政务', choice: '依法办理',
      effects: { politics: 1, execute: 0, network: 0, integrity: 2, promotion: 0 },
      attrsAfter: { ...s.attrs }, rankAfter: 0, promoted: false,
    }];
    const ctx = buildContinuityContext(s, last);
    expect(ctx).toContain('剧情摘要');
    expect(ctx).toContain('王建国');
    expect(ctx).toContain('上一事件标题');
    expect(ctx).toContain('依法办理');
  });

  it('未决线索被列入上下文', () => {
    const s = freshState();
    addThread(s, '「验收风波」中收了信封，留下隐患');
    const ctx = buildContinuityContext(s, null);
    expect(ctx).toContain('未决剧情线索');
    expect(ctx).toContain('验收风波');
  });
});
