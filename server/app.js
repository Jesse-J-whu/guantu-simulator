// HTTP 应用层 — 路由、访问留存、限流、请求体解析。
// 由 server/index.js 在 cluster worker 中实例化。

const { URL } = require('node:url');
const { createTracker } = require('./tracker.js');
const { VisitBatchWriter } = require('./db.js');
const { createStaticServer } = require('./static.js');
const { renderAdminPage } = require('./adminPage.js');

const BODY_LIMIT = 2 * 1024 * 1024; // 2MB:轨迹上报可能较大
const RATE_LIMIT_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '600', 10);
// 仅当部署在可信反代之后才信任 X-Forwarded-For,否则该头可被任意
// 客户端伪造绕过限流并污染 IP 计数统计。
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');

/** 从请求提取客户端 IP(直连或常见反代头)。
 * 取 XFF 最右侧一项:单层可信反代(nginx 默认 proxy_add_x_forwarded_for
 * 追加模式)写入的才是真实直连地址;取最左会被客户端自带伪造首段
 * 绕过限流(reviewer PoC:轮换首段 → 每次都是新桶)。 */
function clientIp(req, trustProxy = TRUST_PROXY) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',').pop().trim();
  }
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

/** 创建应用处理器。trustProxy/rateLimitPerMin 默认取环境变量,可注入覆盖(测试用)。 */
function createApp({ db, llm, rootDir, trustProxy = TRUST_PROXY, rateLimitPerMin = RATE_LIMIT_PER_MIN }) {
  const tracker = createTracker(db);
  const visits = new VisitBatchWriter(db);
  const staticServer = createStaticServer(rootDir);
  const limiter = new RateLimiter(rateLimitPerMin);

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

    /** 提前返回(429/400等):先排空请求体再响应。否则 Node 会因
     * 未消费的请求体销毁 keep-alive 连接,客户端后续管线请求全部报错。 */
    const early = (status, payload) => {
      req.resume();
      return json(res, status, payload);
    };

    let pathname = '/';
    try {
      pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    } catch {
      // 非法请求行 → 统一按 400 处理(也防外层未捕获的 promise 拒绝)
      return early(400, { error: 'bad request url' });
    }
    const ip = clientIp(req, trustProxy);
    const ua = req.headers['user-agent'] || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.on('finish', () => {
      // 只记录页面/API 访问;静态资源(/assets/*、favicon 等)与探活
      // 请求量级是页面访问的成百上千倍,逐条入库只会制造写放大。
      if (pathname.startsWith('/assets/') || pathname === '/healthz' || pathname === '/favicon.ico') {
        return;
      }
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
        if (!limiter.allow(ip)) return early(429, { error: 'too many requests' });
        const body = await readBody(req);
        const meta = { ip, ua: String(ua).slice(0, 250) };
        if (pathname === '/api/track/start') return json(res, 200, tracker.trackStart(body, meta));
        if (pathname === '/api/track/choice') return json(res, 200, tracker.trackChoice(body));
        if (pathname === '/api/track/end') return json(res, 200, tracker.trackEnd(body));
        return early(404, { error: 'unknown track endpoint' });
      }

      // ---- LLM 代理 ----
      if (pathname === '/api/llm-proxy' && req.method === 'POST') {
        if (!limiter.allow(ip)) return early(429, { error: 'too many requests' });
        const body = await readBody(req);
        if (!body.prompt || typeof body.prompt !== 'string') {
          return early(400, { error: 'Missing prompt' });
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

      return early(405, { error: 'method not allowed' });
    } catch (e) {
      console.error(`[app] ${req.method} ${pathname} error:`, e.message);
      return early(e.message === 'body too large' ? 413 : 500, { error: e.message });
    }
  };

  // 优雅关闭:把队列中的访问日志落库(由 index.js 在 SIGTERM 时调用)。
  handle.close = () => visits.close();
  return handle;
}

module.exports = { createApp };
