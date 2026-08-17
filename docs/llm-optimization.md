# 官途模拟器 - LLM API 速度优化方案

## 问题分析

当前实现中用户反馈 LLM API 响应较慢，影响用户体验。经过分析，发现以下性能瓶颈：

### 1. 无响应流式传输

当前实现等待完整响应后才返回结果，用户需要等待整个生成过程完成。

```javascript
const data = await response.json(); // 等待完整响应
res.end(JSON.stringify({ content: text })); // 一次性返回
```

### 2. 参数设置不够优化

```javascript
const { max_tokens = 2000, temperature = 0.9, top_p = 0.95 } = options;
```

- `max_tokens: 2000` - 过高，大多数响应只需要 1000-1500 tokens
- `temperature: 0.9` - 高随机性增加生成时间
- `top_p: 0.95` - 可以降低

### 3. 提示词过长

每次事件生成的提示词包含：
- 职级对照表
- 部门晋升序列
- 完整的 RAG 案例
- 故事阶段提示
- 历史事件记录

这导致每次请求的 prompt token 数量很高。

### 4. 无缓存机制

相同或类似的提示词每次都重新请求，没有利用缓存。

### 5. RAG 采样效率低

随机采样 RAG 案例，没有考虑相关性。

## 优化方案

### 1. 实现流式响应

```javascript
// 修改 server.js 支持流式响应
async function handleLLMProxy(req, res) {
  // ... 设置 headers 支持 SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 流式传输
  const response = await fetch(LLM_ENDPOINT, {
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: true,  // 启用流式传输
      temperature,
      max_tokens,
      top_p
    })
  });

  // 实时转发流式响应
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);  // 实时发送给客户端
  }
}
```

### 2. 优化参数设置

根据请求类型调整参数：

```javascript
const OPTIMIZED_PARAMS = {
  // 事件生成（需要创造力）
  event: {
    max_tokens: 1500,  // 降低到 1500
    temperature: 0.8,   // 降低随机性
    top_p: 0.90        // 降低采样范围
  },
  // 背景生成（可以更确定性）
  background: {
    max_tokens: 1000,
    temperature: 0.7,
    top_p: 0.85
  }
};
```

### 3. 精简提示词

```javascript
// 优化 RAG 案例 - 只包含最相关的 1-2 个案例
function buildRAGPromptSection(deptId, gameRank) {
  const cases = sampleRAGCases(deptId, gameRank, 2);  // 从 3 降到 2
  // 只包含最关键的信息
}
```

### 4. 实现缓存机制

```javascript
// 简单的 LRU 缓存
const promptCache = new Map();
const CACHE_SIZE = 50;

function getCachedResponse(prompt) {
  const hash = simpleHash(prompt);
  if (promptCache.has(hash)) {
    return promptCache.get(hash);
  }
  return null;
}

function setCachedResponse(prompt, response) {
  const hash = simpleHash(prompt);
  if (promptCache.size >= CACHE_SIZE) {
    const firstKey = promptCache.keys().next().value;
    promptCache.delete(firstKey);
  }
  promptCache.set(hash, response);
}
```

### 5. 并发控制

```javascript
// 限制并发请求数
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;
const requestQueue = [];

async function makeLLMRequest(prompt, options) {
  // 如果达到并发限制，加入队列
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return new Promise((resolve) => {
      requestQueue.push({ prompt, options, resolve });
    });
  }

  activeRequests++;
  try {
    const result = await callLLM(prompt, options);
    return result;
  } finally {
    activeRequests--;
    // 处理队列中的请求
    if (requestQueue.length > 0) {
      const next = requestQueue.shift();
      makeLLMRequest(next.prompt, next.options).then(next.resolve);
    }
  }
}
```

### 6. 使用更快的模型（可选）

对于简单的任务，可以考虑使用更小更快的模型：

```javascript
const MODEL_FOR_TASK = {
  event: 'deepseek-chat',      // 复杂事件生成
  background: 'deepseek-chat', // 背景生成
  simple: 'deepseek-coder'      // 简单任务（可选）
};
```

## 实施计划

1. **阶段 1**：实现流式响应（最大用户体验提升）
2. **阶段 2**：优化参数设置（简单但有效）
3. **阶段 3**：精简提示词（减少 token 使用）
4. **阶段 4**：实现缓存（减少重复请求）
5. **阶段 5**：并发控制（服务器稳定性）

## 预期效果

| 优化项 | 预期延迟减少 | 用户体验提升 |
|-------|-------------|-------------|
| 流式响应 | -70% 首字延迟 | ⭐⭐⭐⭐⭐ |
| 参数优化 | -15% 总延迟 | ⭐⭐⭐ |
| 精简提示词 | -20% 总延迟 | ⭐⭐⭐ |
| 缓存 | -80% 缓存命中延迟 | ⭐⭐⭐⭐ |
| 并发控制 | 稳定性提升 | ⭐⭐ |

## 相关文件

- `server.js` - API 代理服务器
- `index.html` - 客户端 LLM 调用
- `api/llm-proxy.js` - API 代理模块

---

优化日期: 2026-08-17
分支: dev/llm-optimization
