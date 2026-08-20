/**
 * @file 故事连续性系统 — 解决"环节割裂、前后事实矛盾"。
 *
 * 机制:
 *  - NPC 名册:登记每个出场人物的姓名/职务/关系,要求 LLM 复用既有人物而非每次换新人;
 *  - 运行摘要:引擎自动从时间线压缩出剧情摘要(无需额外 LLM 调用);
 *  - 上一事件全文 + 玩家所选进入下一提示词,并要求 LLM 输出【剧情衔接】字段;
 *  - 未决线索(threads):重大事件后登记,提示 LLM 收束伏笔。
 */

import type { GameState, GameEvent, NPC } from './types.ts';

/** NPC 名册容量:超过则淘汰最久未出场者。 */
const NPC_CAPACITY = 12;

/** 提示词中展示的 NPC 数量上限。 */
const NPC_PROMPT_LIMIT = 6;

/** 从"出场人物"字段解析人物列表,元素格式如 "王建国(县政府办公室主任)"。 */
export function parseNPCField(raw: string): Array<{ name: string; title: string; relation: string }> {
  if (!raw) return [];
  const out: Array<{ name: string; title: string; relation: string }> = [];
  for (const line of raw.split(/[;；\n]/)) {
    const entry = line.trim();
    if (!entry) continue;
    const m = entry.match(/^([一-龥·]{2,4})[（(]([^）)]{2,30})[）)]/);
    if (m) {
      out.push({ name: m[1], title: m[2], relation: guessRelation(m[2]) });
    }
  }
  return out;
}

/** 从职务推断与玩家的关系(用于名册展示,不必精确)。 */
function guessRelation(title: string): string {
  if (/(书记|常委)/.test(title)) return '核心领导';
  if (/(长|主任|部长|主席)(?!助理)/.test(title) && /(副|常务)/.test(title)) return '上级';
  if (/(局长|主任|部长|书记|处长|科长)$/.test(title)) return '上级';
  if (/(科员|办事员|书记员|助手|秘书)$/.test(title)) return '同事/下属';
  return '关系人';
}

/** 将本次事件的出场人物合入名册(按姓名合并)。 */
export function mergeNPCs(state: GameState, event: GameEvent, step: number): void {
  for (const raw of event.npcs) {
    const parsed = parseNPCField(raw);
    for (const p of parsed) {
      const existing = state.npcs.find((n) => n.name === p.name);
      if (existing) {
        existing.lastStep = step;
        existing.appearances++;
        if (p.title && p.title !== existing.title) existing.title = p.title;
      } else {
        state.npcs.push({
          name: p.name,
          title: p.title,
          relation: p.relation,
          firstStep: step,
          lastStep: step,
          appearances: 1,
        });
      }
    }
  }
  // 淘汰最久未出场者,保持名册容量。
  if (state.npcs.length > NPC_CAPACITY) {
    state.npcs.sort((a, b) => b.lastStep - a.lastStep || b.appearances - a.appearances);
    state.npcs = state.npcs.slice(0, NPC_CAPACITY);
  }
}

/** 由时间线自动生成运行摘要(不调用 LLM)。 */
export function buildSummary(state: GameState): string {
  const tl = state.timeline;
  if (tl.length === 0) return '（刚踏上官途）';
  const lines: string[] = [];
  // 早期经历压缩为一行。
  if (tl.length > 6) {
    lines.push(`此前你经历了${tl.length - 5}次考验，从${tl[0].title}一路走到现在`);
  }
  for (const t of tl.slice(-5)) {
    const effect =
      t.effects.integrity < -3 ? '（廉洁受损）' : t.promoted ? '（获得晋升）' : '';
    lines.push(`${t.year}年「${t.title}」中你${t.choice}${effect}`);
  }
  return lines.join('；');
}

/** 登记一条未决线索(重大事件后调用,由 gameEngine 触发)。 */
export function addThread(state: GameState, thread: string): void {
  state.threads.push(thread);
  if (state.threads.length > 4) state.threads.shift();
}

/** 构建注入下一提示词的连续性上下文。 */
export function buildContinuityContext(state: GameState, lastEvent: GameEvent | null): string {
  const parts: string[] = [];

  parts.push('## 剧情摘要(必须保持一致的事实基线)');
  parts.push(state.summary || '（开局阶段）');

  if (state.npcs.length > 0) {
    const roster = state.npcs
      .slice()
      .sort((a, b) => b.lastStep - a.lastStep)
      .slice(0, NPC_PROMPT_LIMIT)
      .map((n: NPC) => `${n.name}(${n.title},${n.relation},出场${n.appearances}次)`)
      .join('；');
    parts.push('');
    parts.push('## 已出场人物名册(优先复用这些人物,不要凭空新增重复角色)');
    parts.push(roster);
  }

  if (lastEvent) {
    const lastChoice = state.timeline[state.timeline.length - 1];
    parts.push('');
    parts.push('## 上一事件全文(本事件必须自然承接它)');
    parts.push(`标题:${lastEvent.title}`);
    parts.push(lastEvent.desc);
    if (lastChoice) {
      parts.push(`玩家的选择:${lastChoice.choice}`);
    }
  }

  if (state.threads.length > 0) {
    parts.push('');
    parts.push('## 未决剧情线索(应择机呼应或收束)');
    parts.push(state.threads.map((t, i) => `${i + 1}. ${t}`).join('\n'));
  }

  return parts.join('\n');
}
