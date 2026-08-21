// 数据留存 SQLite 层 — node:sqlite 内置模块,WAL 模式支持多 worker 并发写入。
// 访问留存在 visits,对局留存 sessions,逐步轨迹留存 choices。

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ip TEXT NOT NULL,
  ua TEXT,
  path TEXT NOT NULL,
  status INTEGER,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits(ts);
CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits(ip);

CREATE TABLE IF NOT EXISTS sessions (
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

CREATE TABLE IF NOT EXISTS choices (
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
CREATE INDEX IF NOT EXISTS idx_choices_session ON choices(session_id);
`;

/** 打开(或创建)数据库并建表。每个 worker 进程各持一个连接。 */
function openDb(dbPath) {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  // 顺序很重要:busy_timeout 必须最先设置——多 worker 同时启动时,
  // journal_mode=WAL 与建表都需要写锁,没有 busy_timeout 会立即抛
  // "database is locked" 导致 worker 启动崩溃循环。
  db.exec('PRAGMA busy_timeout = 8000;');
  execWithRetry(db, 'PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  execWithRetry(db, SCHEMA);
  return db;
}

/** 带退避重试的 exec(应对多 worker 并发建库时的瞬时锁)。 */
function execWithRetry(db, sql, attempts = 10) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      db.exec(sql);
      return;
    } catch (e) {
      lastErr = e;
      const wait = Math.min(200, 10 * (i + 1));
      const until = Date.now() + wait;
      while (Date.now() < until) { /* 同步退避 */ }
    }
  }
  throw lastErr;
}

/** 访问日志批量写入器:内存排队,按批次落库,压测下不阻塞请求线程。 */
class VisitBatchWriter {
  constructor(db, flushIntervalMs = 2000, batchSize = 200) {
    this.db = db;
    this.queue = [];
    this.batchSize = batchSize;
    this.timer = setInterval(() => this.flush(), flushIntervalMs);
    this.timer.unref();
    this.insert = db.prepare(
      'INSERT INTO visits (ts, ip, ua, path, status, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
    );
    // 立即落库一次确保表存在后,批量写入使用事务。
    this.flush();
  }

  push(row) {
    this.queue.push(row);
    if (this.queue.length >= this.batchSize) this.flush();
  }

  flush() {
    if (this.queue.length === 0) return;
    const rows = this.queue.splice(0, this.queue.length);
    // BEGIN IMMEDIATE:直接取写锁,避免 deferred 事务并发升级死锁。
    // 失败整批重试,多次失败则丢弃该批(访问日志允许有损,不能阻塞服务)。
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.db.exec('BEGIN IMMEDIATE');
        for (const r of rows) {
          this.insert.run(r.ts, r.ip, r.ua, r.path, r.status, r.durationMs);
        }
        this.db.exec('COMMIT');
        return;
      } catch (e) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* 事务可能未开启 */
        }
        if (attempt === 2) {
          console.error('[db] visit batch write failed (dropped):', e.message);
        }
      }
    }
  }

  close() {
    clearInterval(this.timer);
    this.flush();
  }
}

module.exports = { openDb, VisitBatchWriter };
