// 压测:大规模并发压力测试(autocannon)。
// 自包含:启动生产形态服务(cluster 多 worker + dist 静态 + mock LLM + 独立 DB),
// 依次跑 静态资源 / 真实用户API流水线 / 峰值脉冲 三种场景,输出 p50/p95/p99 与吞吐。
//
// 用法:npm run loadtest   (需先 npm run build)
// 环境变量:LOADTEST_PORT(默认3398) WORKERS(默认8) DURATION(默认20秒)

import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import autocannon from 'autocannon';

const PORT = parseInt(process.env.LOADTEST_PORT || '3398', 10);
const WORKERS = parseInt(process.env.WORKERS || '8', 10);
const DURATION = parseInt(process.env.DURATION || '20', 10);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = resolve(import.meta.dirname, '..');

if (!existsSync(resolve(ROOT, 'dist/index.html'))) {
  console.error('缺少 dist/ 构建,请先运行 npm run build');
  process.exit(1);
}

const DB = resolve(ROOT, 'data', 'loadtest.db');
for (const suffix of ['', '-shm', '-wal']) {
  try { rmSync(DB + suffix); } catch { /* 不存在则忽略 */ }
}
mkdirSync(resolve(ROOT, 'data'), { recursive: true });

/** 会话流水线:模拟一名真实玩家的完整请求序列。 */
function userPipeline(i) {
  const sid = `loadtest-${i}`;
  const json = { 'content-type': 'application/json' };
  const eventPrompt = '你是一个精通中国公务员体制的官场模拟器事件生成器…第3步/共24步…【事件标题】压测事件';
  return [
    { method: 'POST', path: '/api/track/start', headers: json, body: JSON.stringify({ sessionId: sid, deptId: 'weiban', difficulty: 'normal' }) },
    { method: 'POST', path: '/api/llm-proxy', headers: json, body: JSON.stringify({ prompt: '官途开局背景:压测', max_tokens: 800 }) },
    { method: 'POST', path: '/api/llm-proxy', headers: json, body: JSON.stringify({ prompt: eventPrompt, max_tokens: 1600 }) },
    { method: 'POST', path: '/api/track/choice', headers: json, body: JSON.stringify({ sessionId: sid, step: 1, choiceIdx: 0, choiceText: '严格按规定办', effects: { politics: 4, execute: 4, network: 2, integrity: 4 }, attrsAfter: { politics: 54, execute: 54, network: 52, integrity: 84 }, rankAfter: 0 }) },
    { method: 'POST', path: '/api/track/choice', headers: json, body: JSON.stringify({ sessionId: sid, step: 2, choiceIdx: 1, choiceText: '逐项核对', effects: { politics: 3, execute: 5, network: -1, integrity: 4 }, attrsAfter: { politics: 57, execute: 59, network: 51, integrity: 88 }, rankAfter: 0 }) },
    { method: 'POST', path: '/api/track/end', headers: json, body: JSON.stringify({ sessionId: sid, stepsDone: 2, finalRank: '科员', endingType: 'MID', promotions: 0, attrs: { politics: 57, execute: 59, network: 51, integrity: 88 }, timeline: [] }) },
    { method: 'GET', path: '/api/stats' },
  ];
}

function runScenario({ title, connections, duration, requests }) {
  return new Promise((done) => {
    const inst = autocannon(
      {
        url: BASE,
        connections,
        duration,
        timeout: 30,
        requests,
        excludeErrorStats: false,
      },
      (err, result) => {
        if (err) { console.error(err); done(null); return; }
        done(result);
      },
    );
    autocannon.track(inst, { renderProgressBar: false, renderResultsTable: false, renderLatencyTable: false });
    console.log(`\n▶ ${title} — ${connections} 并发连接 × ${duration}s`);
  });
}

function fmt(r) {
  if (!r) return 'FAILED';
  const err = r.errors + r.non2xx;
  return {
    rps: Math.round(r.throughput.total / r.duration),
    reqs: r.requests.total,
    p50: r.latency.p50, p95: r.latency.p95, p99: r.latency.p99, max: r.latency.max,
    errors: err,
    readMB: Math.round(r.throughput.total * 0) + Math.round(r.rxBytes / 1e6),
  };
}

const report = { startedAt: new Date().toISOString(), port: PORT, workers: WORKERS, scenarios: [] };

// ---- 启动生产形态服务 ----
console.log(`[loadtest] 启动服务:WORKERS=${WORKERS} LLM_MODE=mock PORT=${PORT}`);
const server = spawn('node', ['server.js'], {
  cwd: ROOT,
  // 压测从单一 IP 打满带宽:放宽限流以测服务器容量而非限流器本身。
  // LLM 并发闸门保持默认(20)——mock 生成是同步 CPU 工作,闸门反而
  // 保护了事件循环(实测放开后 p50 从 13ms 恶化到 877ms)。
  env: { ...process.env, PORT: String(PORT), WORKERS: String(WORKERS), LLM_MODE: 'mock', DB_PATH: DB, RATE_LIMIT_PER_MIN: '10000000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

// 等健康检查就绪。
async function waitReady(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return true;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

try {
  if (!(await waitReady())) throw new Error('服务未能就绪');
  console.log('[loadtest] 服务就绪,开始压测\n');

  // 场景1:静态首页(HTML,无缓存路径)。
  const s1 = await runScenario({
    title: 'S1 静态首页', connections: 200, duration: DURATION,
    requests: [{ method: 'GET', path: '/' }],
  });
  report.scenarios.push({ name: 'S1 静态首页 /', connections: 200, ...fmt(s1) });
  console.log(JSON.stringify(fmt(s1)));

  // 场景2:静态资源包(首页+CSS+JS vendor,浏览器首次加载形态)。
  const indexHtml = await (await fetch(`${BASE}/`)).text();
  const asset = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/)?.[1] || '/';
  const cssAsset = indexHtml.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  const s2 = await runScenario({
    title: 'S2 静态资源(HTML+JS+CSS)', connections: 200, duration: DURATION,
    requests: [
      { method: 'GET', path: '/' },
      { method: 'GET', path: asset },
      ...(cssAsset ? [{ method: 'GET', path: cssAsset }] : []),
    ],
  });
  report.scenarios.push({ name: 'S2 静态资源 3件套', connections: 200, ...fmt(s2) });
  console.log(JSON.stringify(fmt(s2)));

  // 场景3:真实用户API流水线(track+llm-proxy+stats)。
  const s3 = await runScenario({
    title: 'S3 真实用户API流水线', connections: 200, duration: DURATION,
    requests: userPipeline(1),
  });
  report.scenarios.push({ name: 'S3 用户API流水线(7请求)', connections: 200, ...fmt(s3) });
  console.log(JSON.stringify(fmt(s3)));

  // 场景4:峰值脉冲(500 并发)。
  const s4 = await runScenario({
    title: 'S4 峰值脉冲', connections: 500, duration: Math.max(10, Math.floor(DURATION / 2)),
    requests: userPipeline(2),
  });
  report.scenarios.push({ name: 'S4 峰值脉冲500并发', connections: 500, ...fmt(s4) });
  console.log(JSON.stringify(fmt(s4)));

  // 服务端统计快照(允许失败,不阻断报告落盘)。
  try {
    const stats = await (await fetch(`${BASE}/api/stats`)).json();
    report.serverStats = stats;
    console.log('\n[loadtest] 服务端统计: visits.total=%s uniqueIps=%s sessions.started=%s',
      stats.visits.total, stats.visits.uniqueIps, stats.sessions.started);
  } catch (e) {
    report.serverStatsError = String(e);
    console.warn('[loadtest] 统计快照失败:', e.message);
  }
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  mkdirSync(resolve(ROOT, 'test-results'), { recursive: true });
  writeFileSync(resolve(ROOT, 'test-results', 'loadtest-report.json'), JSON.stringify(report, null, 2));
  console.log('\n[loadtest] 完成,报告: test-results/loadtest-report.json');
  process.exit(0);
}
