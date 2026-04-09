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
  const parsedUrl = url.parse(req.url, true);
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

// 处理LLM代理请求
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
      const { prompt, max_tokens = 2000, temperature = 0.9, top_p = 0.95 } = JSON.parse(body);

      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing prompt' }));
        return;
      }

      // 调用DeepSeek API
      const response = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens,
          top_p
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: text }));

    } catch (err) {
      console.error('[Proxy] Error:', err.message);
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
