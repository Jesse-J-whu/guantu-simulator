// HTTP 应用层 — 路由、访问留存、限流、请求体解析。
// 由 server/index.js 在 cluster worker 中实例化。

const { URL } = require('node:url');
const { createTracker } = require('./tracker.js');
const { VisitBatchWriter } = require('./db.js');
const { createStaticServer } = require('./static.js');
const { renderAdminPage } = require('./adminPage.js');

const BODY_LIMIT = 2 * 1024 * 1024; // 2MB:轨迹上报可能较大
const RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '600', 10);

/** 从请求提取客户端 IP(直连或常见反代头)。 */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/** 每 IP 令牌桶限流(保护 API;静态资源不受限)。 */
class RateLimiter {
  constructor(limitPerMin) {
    this.limit = limitPerMin;
    this.buckets = new Map();
  }
  allow(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= 60000) {
      bucket = { windowStart: now, count: 0 };
      this.buckets.set(key, bucket);
      // 粗略清理过期桶,防内存增长。
      if (this.buckets.size > 10000) {
        for (const [k, b] of this.buckets) {
          if (now - b.windowStart >= 60000) this.buckets.delete(k);
        }
      }
    }
    bucket.count++;
    return bucket.count <= this.limit;
  }
}

/** 读取请求体(JSON),带大小上限。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

/** 创建应用处理器。 */
function createApp({ db, llm, rootDir }) {
  const tracker = createTracker(db);
  const visits = new VisitBatchWriter(db);
  const staticServer = createStaticServer(rootDir);
  const limiter = new RateLimiter(RATE_LIMIT_PER_MIN);

  function json(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  const handle = async function handle(req, res) {
    const start = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.on('finish', () => {
      visits.push({
        ts: Date.now(),
        ip,
        ua: String(ua).slice(0, 250),
        path: pathname,
        status: res.statusCode,
        durationMs: Date.now() - start,
      });
    });

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // ---- 健康检查 ----
      if (pathname === '/healthz') {
        return json(res, 200, { ok: true, mode: llm.mode, pid: process.pid });
      }

      // ---- 统计与管理 ----
      if (pathname === '/api/stats' && req.method === 'GET') {
        return json(res, 200, tracker.stats());
      }
      if (pathname === '/admin' && req.method === 'GET') {
        const html = renderAdminPage();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // ---- 留存上报 ----
      if (pathname.startsWith('/api/track/') && req.method === 'POST') {
        if (!limiter.allow(ip)) return json(res, 429, { error: 'too many requests' });
        const body = await readBody(req);
        const meta = { ip, ua: String(ua).slice(0, 250) };
        if (pathname === '/api/track/start') return json(res, 200, tracker.trackStart(body, meta));
        if (pathname === '/api/track/choice') return json(res, 200, tracker.trackChoice(body));
        if (pathname === '/api/track/end') return json(res, 200, tracker.trackEnd(body));
        return json(res, 404, { error: 'unknown track endpoint' });
      }

      // ---- LLM 代理 ----
      if (pathname === '/api/llm-proxy' && req.method === 'POST') {
        if (!limiter.allow(ip)) return json(res, 429, { error: 'too many requests' });
        const body = await readBody(req);
        if (!body.prompt || typeof body.prompt !== 'string') {
          return json(res, 400, { error: 'Missing prompt' });
        }
        const content = await llm.generate(body.prompt, {
          maxTokens: Math.min(4000, Number(body.max_tokens) || 1600),
          temperature: Number(body.temperature) || 0.85,
          topP: Number(body.top_p) || 0.9,
        });
        return json(res, 200, { content, provider: llm.mode });
      }

      // ---- 静态资源 ----
      if (req.method === 'GET' || req.method === 'HEAD') {
        return staticServer.serve(req, res, pathname);
      }

      return json(res, 405, { error: 'method not allowed' });
    } catch (e) {
      console.error(`[app] ${req.method} ${pathname} error:`, e.message);
      return json(res, e.message === 'body too large' ? 413 : 500, { error: e.message });
    }
  };

  // 优雅关闭:把队列中的访问日志落库(由 index.js 在 SIGTERM 时调用)。
  handle.close = () => visits.close();
  return handle;
}

module.exports = { createApp };
