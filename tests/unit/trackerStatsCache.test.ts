// /api/stats 的 TTL 缓存边界(tracker.stats):
//  - TTL 窗口内重复调用返回同一份缓存(generatedAt 不变,新写入不可见);
//  - TTL 过期后重新现算(新鲜 generatedAt,新写入可见);
//  - STATS_TTL_MS=0 完全关闭缓存(每次现算)。
// 这是 feat/mass-rollout 分支唯一的生产代码改动,单独锁行为。

import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createTracker } = require('../../server/tracker.js');

const SCHEMA = `
CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ip TEXT NOT NULL,
  ua TEXT,
  path TEXT NOT NULL,
  status INTEGER,
  duration_ms INTEGER
);
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip TEXT,
  ua TEXT,
  dept_id TEXT,
  dept_name TEXT,
  difficulty TEXT,
  steps_done INTEGER DEFAULT 0,
  max_steps INTEGER,
  final_rank TEXT,
  ending_type TEXT,
  promotions INTEGER DEFAULT 0,
  attrs_final TEXT,
  timeline TEXT,
  duration_ms INTEGER,
  ended INTEGER DEFAULT 0
);
CREATE TABLE choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  year INTEGER,
  event_title TEXT,
  event_tag TEXT,
  choice_text TEXT,
  effects TEXT,
  attrs_after TEXT,
  rank_after INTEGER,
  promoted INTEGER,
  ts INTEGER NOT NULL
);
`;

const openMemDb = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return db;
};

const insertVisit = (db: DatabaseSync, ip: string) =>
  db
    .prepare('INSERT INTO visits (ts, ip, ua, path, status, duration_ms) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Date.now(), ip, 'test-ua', '/api/track/start', 200, 1);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const prevTtl = process.env.STATS_TTL_MS;
afterEach(() => {
  if (prevTtl === undefined) delete process.env.STATS_TTL_MS;
  else process.env.STATS_TTL_MS = prevTtl;
});

describe('tracker.stats TTL 缓存', () => {
  it('TTL 窗口内:第二次调用命中缓存,generatedAt 不变且不反映期间新写入', () => {
    process.env.STATS_TTL_MS = '60000';
    const db = openMemDb();
    insertVisit(db, '10.0.0.1');
    const t = createTracker(db);

    const first = t.stats();
    insertVisit(db, '10.0.0.2'); // 窗口内新访问不应出现在缓存结果里
    const second = t.stats();

    expect(second).toBe(first); // 同一份对象,非重算副本
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(second.visits.total).toBe(1);
    expect(second.visits.uniqueIps).toBe(1);
  });

  it('TTL 过期后:重新现算,反映期间新写入且 generatedAt 更新', async () => {
    process.env.STATS_TTL_MS = '25';
    const db = openMemDb();
    insertVisit(db, '10.0.0.1');
    const t = createTracker(db);

    const first = t.stats();
    insertVisit(db, '10.0.0.2');
    await sleep(40); // 越过 25ms TTL
    const second = t.stats();

    expect(second).not.toBe(first);
    expect(new Date(second.generatedAt).getTime()).toBeGreaterThan(new Date(first.generatedAt).getTime());
    expect(second.visits.total).toBe(2);
    expect(second.visits.uniqueIps).toBe(2);
  });

  it('STATS_TTL_MS=0:关闭缓存,连续两次调用都现算', () => {
    process.env.STATS_TTL_MS = '0';
    const db = openMemDb();
    const t = createTracker(db);

    expect(t.stats().visits.total).toBe(0);
    insertVisit(db, '10.0.0.1');
    const fresh = t.stats();
    expect(fresh.visits.total).toBe(1); // 无缓存,立即可见
  });
});
