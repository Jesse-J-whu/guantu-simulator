/**
 * @file 数据留存上报 — 对局生命周期与每步选择,POST 到后端入库。
 * 上报失败静默降级,不影响游戏流程。
 */

import type { Attrs, ChoiceEffect, TimelineEntry } from '../engine/types.ts';

interface TrackStartPayload {
  sessionId: string;
  deptId: string;
  deptName: string;
  difficulty: string;
  maxSteps: number;
}

interface TrackChoicePayload {
  sessionId: string;
  step: number;
  year: number;
  eventTitle: string;
  eventTag: string;
  choiceText: string;
  effects: ChoiceEffect;
  attrsAfter: Attrs;
  rankAfter: number;
  promoted: boolean;
}

interface TrackEndPayload {
  sessionId: string;
  stepsDone: number;
  finalRank: string;
  endingType: string;
  promotions: number;
  attrs: Attrs;
  timeline: TimelineEntry[];
  durationMs: number;
}

async function post(path: string, payload: unknown): Promise<void> {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // 留存失败不影响游戏体验。
  }
}

/** 会话开始时间(内存记录,用于对局时长)。 */
const sessionStartAt = new Map<string, number>();

export function trackStart(payload: TrackStartPayload): void {
  sessionStartAt.set(payload.sessionId, Date.now());
  void post('/api/track/start', payload);
}

export function trackChoice(payload: TrackChoicePayload): void {
  void post('/api/track/choice', payload);
}

export function trackEnd(payload: Omit<TrackEndPayload, 'durationMs'>): void {
  const start = sessionStartAt.get(payload.sessionId) ?? Date.now();
  sessionStartAt.delete(payload.sessionId);
  void post('/api/track/end', { ...payload, durationMs: Date.now() - start });
}
