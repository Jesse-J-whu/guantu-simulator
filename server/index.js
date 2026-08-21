// 服务器启动入口 — cluster 多 worker + 优雅关闭。
// WORKERS 环境变量:0/未设置 = 自动(min(CPU,8)),>0 = 指定数量,1 = 单进程(调试)。

const cluster = require('node:cluster');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');

require('dotenv').config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const WORKERS_CFG = parseInt(process.env.WORKERS || '0', 10);
const ROOT_DIR = path.join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'guantu.db');

const numWorkers = WORKERS_CFG > 0 ? WORKERS_CFG : Math.min(os.cpus().length, 8);

if (cluster.isPrimary && numWorkers > 1) {
  console.log(`[server] master pid=${process.pid} workers=${numWorkers} port=${PORT}`);
  for (let i = 0; i < numWorkers; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.warn(`[server] worker ${worker.process.pid} exited (${code}), restarting...`);
    cluster.fork();
  });
  // 优雅关闭:通知 worker 自行退出。
  const shutdown = () => {
    console.log('[server] master shutting down');
    for (const id in cluster.workers) cluster.workers[id].kill('SIGTERM');
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  const { openDb } = require('./db.js');
  const { LLMService } = require('./llm.js');
  const { createApp } = require('./app.js');

  const db = openDb(DB_PATH);
  const llm = new LLMService();
  const handle = createApp({ db, llm, rootDir: ROOT_DIR });

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('[server] unhandled:', e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error' }));
      }
    });
  });

  // TCP 层抗压:keep-alive 与积压队列。
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 70000;
  server.requestTimeout = 120000;
  // 不限制单 socket 请求数:设 1000 时长连接压测/长会话轮询会在第 1001 个
  // 请求起收到 Node 自动回复的 503(实测 autocannon 20 连接恰好 20000 个 2xx
  // 后全部 503)。keep-alive 由 keepAliveTimeout 管理即可。
  server.maxRequestsPerSocket = 0;

  server.listen(PORT, () => {
    const hasDist = require('node:fs').existsSync(path.join(ROOT_DIR, 'dist', 'index.html'));
    console.log(
      `[server] 官途模拟器 pid=${process.pid} 端口=${PORT} LLM=${llm.mode} 静态=${hasDist ? 'dist' : 'root(未构建)'} DB=${DB_PATH}`,
    );
  });

  const shutdown = () => {
    console.log(`[server] worker ${process.pid} closing`);
    if (typeof handle.close === 'function') handle.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 4000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { PORT, DB_PATH };
