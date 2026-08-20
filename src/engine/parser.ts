/**
 * @file LLM 结构化输出解析器。
 *
 * 约定 LLM 用【字段】标记输出(比 JSON 更抗语法错误)。
 * 解析失败抛出带原因的 Error,由上层决定重试或降级。
 */

import type { Choice, ChoiceEffect, EventTag, GameEvent } from './types.ts';

/** 按【】标记切分字段。 */
export function parseMarkerFields(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const markerRegex = /【([^】]+)】/g;
  const keys: Array<{ key: string; start: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(content)) !== null) {
    keys.push({ key: match[1], start: match.index + match[0].length });
  }
  for (let i = 0; i < keys.length; i++) {
    const nextMarker = keys[i + 1]
      ? content.lastIndexOf(`【${keys[i + 1].key}】`, keys[i + 1].start)
      : content.length;
    const end = keys[i + 1] ? Math.max(keys[i].start, nextMarker) : content.length;
    fields[keys[i].key] = content.substring(keys[i].start, end).trim();
  }
  return fields;
}

/** 解析 "政治嗅觉:+5 执行力:-3 ..." 效果串。 */
export function parseEffectString(effectStr: string): ChoiceEffect {
  const effect: ChoiceEffect = { politics: 0, execute: 0, network: 0, integrity: 0, promotion: 0 };
  if (!effectStr) return effect;
  const patterns: Array<[keyof ChoiceEffect, RegExp]> = [
    ['politics', /政治嗅觉\s*[:：]\s*([-+]?\d+(?:\.\d+)?)/],
    ['execute', /执行力\s*[:：]\s*([-+]?\d+(?:\.\d+)?)/],
    ['network', /人脉资源\s*[:：]\s*([-+]?\d+(?:\.\d+)?)/],
    ['integrity', /廉洁度\s*[:：]\s*([-+]?\d+(?:\.\d+)?)/],
    ['promotion', /晋升\s*[:：]\s*([-+]?\d+(?:\.\d+)?)/],
  ];
  for (const [key, pattern] of patterns) {
    const m = effectStr.match(pattern);
    if (m) effect[key] = Math.round(parseFloat(m[1])) || 0;
  }
  return effect;
}

const TAG_MAP: Record<string, EventTag> = {
  daily: 'daily',
  opportunity: 'opportunity',
  temptation: 'temptation',
  politics: 'politics',
  crisis: 'crisis',
  interpersonal: 'interpersonal',
};

const TAG_LABELS: Record<EventTag, string> = {
  daily: '日常政务',
  opportunity: '晋升机遇',
  temptation: '利益诱惑',
  politics: '政治站队',
  crisis: '危机应对',
  interpersonal: '人际关系',
};

/** 解析事件生成结果;字段缺失/选项不足时抛错。 */
export function parseEvent(content: string, step: number): GameEvent {
  const fields = parseMarkerFields(content);

  const choices: Choice[] = [];
  for (const letter of ['A', 'B', 'C', 'D']) {
    const text = fields[`选项${letter}`];
    if (!text) continue;
    choices.push({
      text,
      hint: fields[`选项${letter}提示`] || '',
      effect: parseEffectString(fields[`选项${letter}效果`] || ''),
    });
  }
  if (choices.length < 2) {
    throw new Error(`事件解析失败:仅解析到 ${choices.length} 个选项`);
  }

  const rawTag = (fields['事件类型'] || 'daily').toLowerCase().trim();
  const tag = TAG_MAP[rawTag] || 'daily';
  const title = fields['事件标题'] || '';
  if (!title) throw new Error('事件解析失败:缺少【事件标题】');

  return {
    id: `evt_${step}_${Date.now().toString(36)}`,
    tag,
    tagLabel: fields['类型标签'] || TAG_LABELS[tag],
    title,
    desc: fields['事件描述'] || '（事件描述缺失）',
    hint: fields['官场格言'] || '',
    continuity: fields['剧情衔接'] || '',
    npcs: (fields['出场人物'] || '')
      .split(/[;；\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    choices: choices.slice(0, 4),
    aiGenerated: true,
    repairs: [],
  };
}

/** 解析开局背景。 */
export function parseBackground(content: string): {
  level: string;
  origin: string;
  background: string;
  openingText: string;
  rankTitle: string;
} {
  const fields = parseMarkerFields(content);
  const opening = fields['开场白'];
  if (!opening || opening.length < 30) {
    throw new Error('背景解析失败:开场白缺失或过短');
  }
  return {
    level: fields['行政级别'] || '县级',
    origin: fields['入职方式'] || '公务员招考',
    background: fields['家庭背景'] || '普通家庭',
    openingText: opening,
    rankTitle: fields['初始职务'] || '科员',
  };
}
