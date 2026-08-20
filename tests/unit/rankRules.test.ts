import { describe, expect, it } from 'vitest';
import { validateRankFacts, fixRankFacts } from '../../src/engine/rankRules.ts';

describe('官职事实性校验(用户反馈:县住建局办公室主任不应是正科级)', () => {
  it('用户原始示例:县住建局办公室主任(正科级) → 修正为股级', () => {
    const text = '县住建局办公室主任（正科级）王强把文件递给你';
    const { text: fixed, fixes } = fixRankFacts(text);
    expect(fixed).toContain('县住建局办公室主任（股级）');
    expect(fixes).toHaveLength(1);
    expect(fixes[0].rule).toBe('county-bureau-internal-office');
  });

  it('县财政局办公室主任(正科级) 同样被修正', () => {
    const { text: fixed } = fixRankFacts('县财政局局长让你找县财政局办公室主任（正科级）签字');
    expect(fixed).toContain('县财政局办公室主任（股级）');
  });

  it('县教育局人事科科长(正科级) 被修正为股级', () => {
    const { text: fixed } = fixRankFacts('县教育局人事科科长（正科级）对你的档案提出疑问');
    expect(fixed).toContain('人事科科长（股级）');
  });

  it('县住建局副局长(正科级) 被修正为副科级', () => {
    const { text: fixed } = fixRankFacts('县住建局副局长（正科级）主持工作');
    expect(fixed).toContain('副局长（副科级）');
  });

  it('市局内设办公室主任(正处级) 被修正为正科级', () => {
    const { text: fixed } = fixRankFacts('市自然资源局办公室主任（正处级）安排接待');
    expect(fixed).toContain('市自然资源局办公室主任（正科级）');
  });

  it('省厅办公室主任(副厅级) 被修正为正处级', () => {
    const { text: fixed } = fixRankFacts('省财政厅办公室主任（副厅级）来电催报');
    expect(fixed).toContain('省财政厅办公室主任（正处级）');
  });

  it('乡镇长(副科级) 被修正为正科级;副镇长(正科级)被修正为副科级', () => {
    expect(fixRankFacts('镇长（副科级）陪同调研').text).toContain('镇长（正科级）');
    expect(fixRankFacts('副镇长（正科级）陪同调研').text).toContain('副镇长（副科级）');
  });

  it('合法表述不被误伤:县委办公室主任(正科级)、委办主任、副局长副科', () => {
    const legal = [
      '县委办公室主任（正科级）转达指示',
      '县政府办公室主任（正科级）参加会议',
      '县住建局副局长（副科级）分管审批',
      '市财政局局长（正处级）出席会议',
    ];
    for (const t of legal) {
      expect(fixRankFacts(t).fixes, t).toHaveLength(0);
      expect(validateRankFacts(t)).toHaveLength(0);
    }
  });

  it('validateRankFacts 不修改原文', () => {
    const text = '县住建局办公室主任（正科级）';
    const violations = validateRankFacts(text);
    expect(violations.length).toBeGreaterThan(0);
    expect(text).toBe('县住建局办公室主任（正科级）');
  });
});
