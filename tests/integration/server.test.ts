import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// 服务端是 CJS,通过 createRequire 加载。
const require = createRequire(import.meta.url);
const { openDb } = require('../../server/db.js');
const { createApp } = require('../../server/app.js');

let db: ReturnType<typeof openDb>;
let server: ReturnType<typeof createServer>;
let baseUrl = '';
const tmpDirs: string[] = [];

function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, { headers }).then(async (r) => ({
    status: r.status,
    headers: r.headers,
    body: await r.json().catch(() => null),
  }));
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'guantu-test-'));
  tmpDirs.push(dir);
  db = openDb(join(dir, 'test.db'));
  const llm = {
    mode: 'mock',
    generate: async (prompt: string) => `【事件标题】测试标题\n【事件描述】${prompt.slice(0, 20)} 描述内容足够长。`,
  };
  const rootDir = join(__dirname, '../..');
  const handle = createApp({ db, llm, rootDir });
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  // 等批量写入器 flush 后再关库。
  const visits = (server as unknown as { _handle?: unknown });
  void visits;
  db.close();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe('服务端 API 集成测试', () => {
  it('GET /healthz 返回 ok 与模式', async () => {
    const r = await get('/healthz');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.mode).toBe('mock');
  });

  it('GET /admin 返回 HTML 仪表盘', async () => {
    const r = await fetch(`${baseUrl}/admin`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('<html');
  });

  it('POST /api/llm-proxy:缺 prompt → 400;正常调用 → 返回内容', async () => {
    expect((await post('/api/llm-proxy', {})).status).toBe(400);
    const r = await post('/api/llm-proxy', { prompt: '官途开局背景生成' });
    expect(r.status).toBe(200);
    expect(r.body.content).toContain('事件标题');
    expect(r.body.provider).toBe('mock');
  });

  it('POST /api/track/start → 登记 session 并回传 sessionId', async () => {
    const r = await post('/api/track/start', {
      sessionId: 'test-session-1',
      deptId: 'weiban',
      difficulty: 'normal',
    }, { 'x-forwarded-for': '1.2.3.4' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('POST /api/track/choice + /end → 轨迹落库', async () => {
    const sid = 'test-session-2';
    await post('/api/track/start', { sessionId: sid, deptId: 'jiwei', difficulty: 'hard' });
    const c = await post('/api/track/choice', {
      sessionId: sid,
      step: 1,
      choiceIdx: 0,
      choiceText: '严格按规定办',
      effects: { politics: 4, execute: 4, network: 2, integrity: 4 },
      attrsAfter: { politics: 54, execute: 54, network: 52, integrity: 84 },
      rankAfter: 0,
    });
    expect(c.status).toBe(200);
    const e = await post('/api/track/end', {
      sessionId: sid,
      endingType: 'GOOD',
      finalRank: '正科级',
      steps: 24,
      durationMs: 60000,
    });
    expect(e.status).toBe(200);
  });

  it('未知 track 端点 → 404', async () => {
    const r = await post('/api/track/unknown', {});
    expect(r.status).toBe(404);
  });

  it('GET /api/stats:汇聚访问/会话/通关率统计', async () => {
    // 访问日志由批量写入器每 2s 落库,等待一个 flush 周期。
    await new Promise((r) => setTimeout(r, 2300));
    const r = await get('/api/stats');
    expect(r.status).toBe(200);
    const s = r.body;
    expect(s.visits.total).toBeGreaterThan(0);
    expect(s.visits.uniqueIps).toBeGreaterThanOrEqual(1);
    expect(s.sessions.started).toBeGreaterThanOrEqual(2);
    expect(s.sessions.completed).toBeGreaterThanOrEqual(1);
    // 通关率在 0-1 之间。
    expect(s.sessions.completionRate).toBeGreaterThanOrEqual(0);
    expect(s.sessions.completionRate).toBeLessThanOrEqual(1);
    expect(Array.isArray(s.sessions.byEnding) || typeof s.sessions.byEnding === 'object').toBe(true);
  }, 15000);

  it('静态资源:GET / 返回 index.html(vite 入口)', async () => {
    const r = await fetch(`${baseUrl}/`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('id="root"');
  });

  it('路径穿越防护:原始套接字直发 /../etc/passwd 被 403 拒绝(不落入 SPA 回退)', async () => {
    // fetch/undici 会在客户端先把 /../ 归一化掉,测不到真实攻击面;
    // 用 node:http 原样发送字节流。
    const { address, port } = server.address() as { address: string; port: number };
    const rawGet = (rawPath: string) =>
      new Promise<{ status: number; body: string }>((resolve) => {
        const req = request(
          { host: address === '::' ? '127.0.0.1' : address, port, path: rawPath },
          (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
          },
        );
        req.end();
      });
    const r1 = await rawGet('/..%2f..%2fetc%2fpasswd');
    expect(r1.status).toBe(403);
    // %2e%2e 形式会被 URL 规范化在先,到达静态层时已无穿越段;
    // 允许 SPA 回退 200,但内容绝不能是系统文件。
    const r2 = await rawGet('/%2e%2e/%2e%2e/etc/passwd');
    if (r2.status === 200) {
      expect(r2.body).not.toContain('root:');
    } else {
      expect([400, 403, 404]).toContain(r2.status);
    }
    // 双重编码不会被二次解码,不得穿越(同上口径)。
    const r3 = await rawGet('/..%252f..%252fetc%252fpasswd');
    if (r3.status === 200) {
      expect(r3.body).not.toContain('root:');
    } else {
      expect([400, 403, 404]).toContain(r3.status);
    }
  });

  it('OPTIONS 预检返回 204(CORS)', async () => {
    const r = await fetch(`${baseUrl}/api/llm-proxy`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
});
