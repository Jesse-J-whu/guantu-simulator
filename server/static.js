// 静态资源服务 — gzip 压缩 + ETag 协商缓存 + 指纹资源强缓存。
// 只服务 dist/(vite 构建产物)。曾有的"回退仓库根"会连同 .env、
// server/ 源码与 SQLite 数据库一起暴露(reviewer PoC:GET /.env → 200),
// 而根 index.html 是 vite 入口,离开 vite 开发服务器本就跑不起来,故删除。

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);
const MIN_COMPRESS_SIZE = 1024;

/** 创建静态服务。dist 缺失时一律 503,绝不回退到仓库根(防源码/密钥泄漏)。 */
function createStaticServer(rootDir) {
  const serveFrom = path.join(rootDir, 'dist');
  if (!fs.existsSync(path.join(serveFrom, 'index.html'))) {
    console.error(`[static] ${serveFrom}/index.html 不存在:请先执行 npm run build。拒绝回退到仓库根。`);
    return {
      serveFrom,
      serve(_req, res) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('dist/ missing - run `npm run build` first');
      },
    };
  }

  /** 解析安全路径(阻止路径穿越)。 */
  function resolveSafe(urlPath) {
    let p;
    try {
      p = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
      return null; // 非法百分号编码(如 /%zz)按不存在处理
    }
    if (p.endsWith('/')) p += 'index.html';
    const abs = path.resolve(serveFrom, '.' + p);
    // 必须命中目录本身或其下带分隔符的子路径:裸 startsWith 会放行
    // 兄弟目录(serveFrom=/x/dist 时 /x/distX/secret 也会通过)。
    if (abs !== serveFrom && !abs.startsWith(serveFrom + path.sep)) return null;
    return abs;
  }

  /** ETag:内容长度+修改时间哈希,弱校验足够。 */
  function makeEtag(stat) {
    return `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  }

  function serve(req, res, pathname) {
    const abs = resolveSafe(pathname);
    if (!abs) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    let stat;
    try {
      stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        const indexAbs = path.join(abs, 'index.html');
        stat = fs.statSync(indexAbs);
        return sendFile(req, res, indexAbs, stat);
      }
    } catch {
      // 非文件或不存在 → SPA 回退 index.html(前端路由)。
      const indexAbs = path.join(serveFrom, 'index.html');
      try {
        const indexStat = fs.statSync(indexAbs);
        return sendFile(req, res, indexAbs, indexStat, { noCache: true });
      } catch {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }
    return sendFile(req, res, abs, stat);
  }

  function sendFile(req, res, abs, stat, opts = {}) {
    const ext = path.extname(abs).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = makeEtag(stat);
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return;
    }

    const headers = {
      'Content-Type': type,
      ETag: etag,
    };
    // 带 vite 内容哈希的静态资源可长缓存;HTML 与 opts.noCache 不缓存。
    const hashed = /\-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpg|svg)$/.test(path.basename(abs));
    if (opts.noCache || ext === '.html') {
      headers['Cache-Control'] = 'no-cache';
    } else if (hashed) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'public, max-age=300';
    }

    const accept = req.headers['accept-encoding'] || '';
    const useGzip = COMPRESSIBLE.has(ext) && stat.size >= MIN_COMPRESS_SIZE && accept.includes('gzip');
    if (useGzip) headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = stat.size; // 原始长度;gzip 分块传输时移除
    if (useGzip) delete headers['Content-Length'];

    res.writeHead(200, headers);
    const stream = fs.createReadStream(abs);
    if (useGzip) {
      stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    } else {
      stream.pipe(res);
    }
    stream.on('error', () => {
      res.destroy();
    });
  }

  return { serve, serveFrom };
}

module.exports = { createStaticServer };
