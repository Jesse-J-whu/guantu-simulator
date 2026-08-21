// 数据留存统计 — /api/track/* 上报与 /api/stats 聚合查询。
// 指标口径:
//  - IP计数/访问请求:visits 表按 ip / 总行数聚合;
//  - 1分钟留存率:近24h 内,同一访问者(ip+ua)活跃跨度 ≥60s 的占比;
//  - 完整通关率:有结局的 sessions / 已开始的 sessions;
//  - 平均时长:已结束对局 duration_ms 均值;
//  - 轨迹数据:sessions.timeline(JSON)与 choices 明细。

const DAY_MS = 24 * 60 * 60 * 1000;

/** 字符串字段截断(防超长 payload 撑爆 DB;留存统计不需要全文)。 */
const cap = (v, n = 200) => String(v ?? '').slice(0, n);

/** 创建追踪器(每个 worker 一份,持有自己的 db 连接)。 */
function createTracker(db) {
  const stmts = {
    upsertSession: db.prepare(`
      INSERT INTO sessions (session_id, created_at, updated_at, ip, ua, dept_id, dept_name, difficulty, steps_done, max_steps, ended)
      VALUES (@sessionId, @now, @now, @ip, @ua, @deptId, @deptName, @difficulty, 0, @maxSteps, 0)
      ON CONFLICT(session_id) DO NOTHING
    `),
    insertChoice: db.prepare(`
      INSERT INTO choices (session_id, step, year, event_title, event_tag, choice_text, effects, attrs_after, rank_after, promoted, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    finishSession: db.prepare(`
      UPDATE sessions SET updated_at = ?, steps_done = ?, final_rank = ?, ending_type = ?,
        promotions = ?, attrs_final = ?, timeline = ?, duration_ms = ?, ended = 1
      WHERE session_id = ?
    `),
    touchSession: db.prepare(`UPDATE sessions SET updated_at = ? WHERE session_id = ?`),
  };

  function trackStart(body, meta) {
    if (!body || typeof body.sessionId !== 'string' || !body.sessionId) {
      throw new Error('missing sessionId');
    }
    stmts.upsertSession.run({
      sessionId: cap(body.sessionId, 64),
      now: Date.now(),
      ip: meta.ip,
      ua: meta.ua,
      deptId: cap(body.deptId, 32),
      deptName: cap(body.deptName, 64),
      difficulty: cap(body.difficulty, 16),
      maxSteps: Number(body.maxSteps) || 24,
    });
    return { ok: true };
  }

  function trackChoice(body) {
    if (!body || typeof body.sessionId !== 'string' || !body.sessionId) {
      throw new Error('missing sessionId');
    }
    stmts.insertChoice.run(
      cap(body.sessionId, 64),
      Number(body.step) || 0,
      Number(body.year) || null,
      cap(body.eventTitle),
      cap(body.eventTag, 32),
      cap(body.choiceText),
      JSON.stringify(body.effects ?? {}),
      JSON.stringify(body.attrsAfter ?? {}),
      Number(body.rankAfter) || 0,
      body.promoted ? 1 : 0,
      Date.now(),
    );
    stmts.touchSession.run(Date.now(), cap(body.sessionId, 64));
    return { ok: true };
  }

  function trackEnd(body) {
    if (!body || typeof body.sessionId !== 'string' || !body.sessionId) {
      throw new Error('missing sessionId');
    }
    stmts.finishSession.run(
      Date.now(),
      Number(body.stepsDone) || 0,
      cap(body.finalRank, 64),
      cap(body.endingType, 16),
      Number(body.promotions) || 0,
      JSON.stringify(body.attrs ?? {}),
      // 时间线可能较大(24 步),放宽到 32KB,超出部分截断。
      JSON.stringify(body.timeline ?? []).slice(0, 32768),
      Number(body.durationMs) || 0,
      cap(body.sessionId, 64),
    );
    return { ok: true };
  }

  // /api/stats 结果的 TTL 缓存。stats() 要对 visits/sessions 做多组聚合,
  // 访问量到几十万行后单次现算 >1s,且 node:sqlite 同步执行会阻塞事件循环;
  // 管理页与监控高频轮询时,冷聚合会把同一 worker 上的玩家请求长尾一起拖垮
  // (压测 p99 从毫秒级恶化到秒级)。统计面板容忍秒级陈旧 —— generatedAt
  // 如实标注生成时间 —— 默认缓存 10s;STATS_TTL_MS 可调,设 0 关闭。
  let statsCache = null;
  const STATS_TTL_MS = Math.max(0, Number(process.env.STATS_TTL_MS ?? 10_000));

  /** 聚合统计。 */
  function stats() {
    const now = Date.now();
    if (statsCache && now - statsCache.at < STATS_TTL_MS) {
      return statsCache.data;
    }
    const dayAgo = now - DAY_MS;
    const hourAgo = now - 60 * 60 * 1000;

    const visitTotals = db
      .prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT ip) AS ips FROM visits')
      .get();
    const visitToday = db
      .prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT ip) AS ips FROM visits WHERE ts >= ?')
      .get(dayAgo);
    const rps = db
      .prepare(
        'SELECT COUNT(*) AS total, AVG(duration_ms) AS avgDur, MAX(ts) AS lastTs, MIN(ts) AS firstTs FROM visits WHERE ts >= ?',
      )
      .get(hourAgo);
    const slowest = db
      .prepare('SELECT path, AVG(duration_ms) AS avgDur, COUNT(*) AS hits FROM visits WHERE ts >= ? GROUP BY path ORDER BY avgDur DESC LIMIT 10')
      .all(dayAgo);

    // 1分钟留存:近24h 访问者中,活跃跨度>=60s 的占比(按 ip+ua 归一访问者)。
    const visitors = db
      .prepare(
        `SELECT ip, COALESCE(ua,'') AS ua, MIN(ts) AS firstTs, MAX(ts) AS lastTs
         FROM visits WHERE ts >= ? GROUP BY ip, COALESCE(ua,'')`,
      )
      .all(dayAgo);
    const totalVisitors = visitors.length;
    const retained = visitors.filter((v) => v.lastTs - v.firstTs >= 60 * 1000).length;

    const sessionAgg = db
      .prepare(
        `SELECT COUNT(*) AS started,
                SUM(ended) AS ended,
                AVG(CASE WHEN ended = 1 THEN duration_ms END) AS avgDuration,
                AVG(steps_done) AS avgSteps
         FROM sessions`,
      )
      .get();
    const byEnding = db
      .prepare(
        `SELECT ending_type AS type, COUNT(*) AS count FROM sessions WHERE ended = 1 GROUP BY ending_type`,
      )
      .all();
    const byDept = db
      .prepare(
        `SELECT dept_id AS dept, COUNT(*) AS count, SUM(ended) AS ended FROM sessions GROUP BY dept_id ORDER BY count DESC`,
      )
      .all();
    const recentSessions = db
      .prepare(
        `SELECT session_id, dept_name, difficulty, steps_done, ending_type, final_rank, promotions, duration_ms, ended, created_at
         FROM sessions ORDER BY created_at DESC LIMIT 20`,
      )
      .all();

    const started = sessionAgg.started || 0;
    const endedCount = sessionAgg.ended || 0;
    const windowMinutes = Math.max(1, (now - (rps.firstTs || now)) / 60000);

    const data = {
      generatedAt: new Date(now).toISOString(),
      visits: {
        total: visitTotals.total || 0,
        uniqueIps: visitTotals.ips || 0,
        last24h: visitToday.total || 0,
        last24hUniqueIps: visitToday.ips || 0,
      },
      requests: {
        total: visitTotals.total || 0,
        lastHour: rps.total || 0,
        perMinuteLastHour: Math.round((rps.total || 0) / windowMinutes),
        avgDurationMs: Math.round(rps.avgDur || 0),
        slowestPaths: slowest,
      },
      retention: {
        // 1分钟留存率:活跃跨度>=60s的访问者 / 近24h总访问者。
        oneMinute: totalVisitors > 0 ? Number((retained / totalVisitors).toFixed(4)) : 0,
        visitors24h: totalVisitors,
        retainedVisitors: retained,
      },
      sessions: {
        started,
        completed: endedCount,
        // 完整通关率:有结局的对局 / 开始的对局。
        completionRate: started > 0 ? Number((endedCount / started).toFixed(4)) : 0,
        avgDurationMs: Math.round(sessionAgg.avgDuration || 0),
        avgSteps: Math.round((sessionAgg.avgSteps || 0) * 10) / 10,
        byEnding,
        byDept,
        recent: recentSessions,
      },
    };
    statsCache = { at: now, data };
    return data;
  }

  return { trackStart, trackChoice, trackEnd, stats };
}

module.exports = { createTracker };
