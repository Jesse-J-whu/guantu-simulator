// 官途模拟器 - Node.js 服务器（用于阿里云ECS部署）
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 加载环境变量
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DEEPSEEK_API_KEY;
const LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';

// MIME类型映射
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// 创建服务器
const server = http.createServer(async (req, res) => {
  // 使用现代URL API替代已弃用的url.parse()
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API路由
  if (pathname === '/api/llm-proxy' && req.method === 'POST') {
    return handleLLMProxy(req, res);
  }

  // 静态文件服务
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // 文件不存在，返回index.html（支持前端路由）
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Server Error');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// 处理LLM代理请求（优化版：支持流式响应、参数优化、缓存）
const promptCache = new Map();
const CACHE_SIZE = 100;
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3;
const requestQueue = [];

async function handleLLMProxy(req, res) {
  if (!API_KEY) {
    console.error('[Proxy] DEEPSEEK_API_KEY not configured');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'LLM service not configured' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { prompt, max_tokens = 2000, temperature = 0.9, top_p = 0.95, stream = true } = JSON.parse(body);

      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing prompt' }));
        return;
      }

      // 优化后的参数
      const optimizedParams = {
        event: { max_tokens: 1500, temperature: 0.8, top_p: 0.90 },
        background: { max_tokens: 1000, temperature: 0.7, top_p: 0.85 }
      };

      // 检测请求类型并使用优化参数
      let requestType = 'event';
      if (prompt.includes('官途开局背景') || prompt.includes('生成一段官途开局背景')) {
        requestType = 'background';
      }

      const params = optimizedParams[requestType];
      const finalMaxTokens = max_tokens < 2000 ? max_tokens : params.max_tokens;
      const finalTemp = temperature === 0.9 ? params.temperature : temperature;
      const finalTopP = top_p === 0.95 ? params.top_p : top_p;

      // 检查缓存（仅对非流式请求）
      if (!stream) {
        const cacheKey = `${prompt.substring(0, 100)}_${finalMaxTokens}_${finalTemp}`;
        if (promptCache.has(cacheKey)) {
          console.log('[Proxy] Cache hit');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content: promptCache.get(cacheKey), cached: true }));
          return;
        }
      }

      // 并发控制
      if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
        console.log(`[Proxy] Queueing request (active: ${activeRequests})`);
        await new Promise(resolve => {
          requestQueue.push(resolve);
        });
      }

      activeRequests++;
      console.log(`[Proxy] Processing request (active: ${activeRequests}, type: ${requestType})`);

      try {
        // 调用DeepSeek API（支持流式响应）
        const response = await fetch(LLM_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
          },
          body: JSON.stringify({
            model: LLM_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: finalTemp,
            max_tokens: finalMaxTokens,
            top_p: finalTopP,
            stream: stream  // 启用流式传输
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Proxy] API error ${response.status}:`, errorText);
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: `LLM API error: ${response.status}`,
            details: errorText.substring(0, 200)
          }));
          return;
        }

        if (stream) {
          // 流式响应
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');  // 禁用 nginx 缓冲

          let fullText = '';
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;

            // 解析 SSE 格式
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  res.write('data: [DONE]\n\n');
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }

          // 清理推理标签
          fullText = fullText.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
          fullText = fullText.replace(/<think[\s\S]*$/gi, '').trim();

          if (fullText) {
            // 缓存结果
            const cacheKey = `${prompt.substring(0, 100)}_${finalMaxTokens}_${finalTemp}`;
            if (promptCache.size >= CACHE_SIZE) {
              const firstKey = promptCache.keys().next().value;
              promptCache.delete(firstKey);
            }
            promptCache.set(cacheKey, fullText);
          }

        } else {
          // 非流式响应（原有逻辑）
          const data = await response.json();
          const choice = data.choices?.[0]?.message;
          let text = choice?.content || choice?.reasoning_content || '';

          // 清理推理标签
          text = text.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
          text = text.replace(/<think[\s\S]*$/gi, '').trim();

          if (!text) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'LLM returned empty content' }));
            return;
          }

          // 缓存结果
          const cacheKey = `${prompt.substring(0, 100)}_${finalMaxTokens}_${finalTemp}`;
          if (promptCache.size >= CACHE_SIZE) {
            const firstKey = promptCache.keys().next().value;
            promptCache.delete(firstKey);
          }
          promptCache.set(cacheKey, text);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ content: text }));
        }

      } finally {
        activeRequests--;
        // 处理队列中的请求
        if (requestQueue.length > 0) {
          const nextResolve = requestQueue.shift();
          nextResolve();
        }
      }

    } catch (err) {
      console.error('[Proxy] Error:', err.message);
      activeRequests--;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    }
  });
}

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  官途模拟器服务器已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  访问: http://localhost:${PORT}`);
  console.log(`========================================`);
  
  if (!API_KEY) {
    console.warn('\n⚠️  警告: 未设置 DEEPSEEK_API_KEY 环境变量');
    console.warn('   请在 .env 文件中添加: DEEPSEEK_API_KEY=你的API密钥\n');
  }
});
