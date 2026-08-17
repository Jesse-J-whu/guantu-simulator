# 官途模拟器 - LLM API速度优化任务报告

## 任务概述

**任务编号**: TASK-002  
**任务类型**: 性能优化  
**分支**: `dev/llm-optimization`  
**开始日期**: 2026-08-17  
**完成日期**: 2026-08-17

## 问题描述

用户反馈前后端从DeepSeek API请求LLM响应较慢，影响用户体验。需要分析瓶颈并提供优化方案。

## 性能分析

### 当前实现瓶颈

通过分析 `server.js` 和 `index.html` 发现以下问题：

1. **无流式响应**
   ```javascript
   const data = await response.json(); // 等待完整响应
   res.end(JSON.stringify({ content: text })); // 一次性返回
   ```

2. **参数设置不够优化**
   ```javascript
   const { max_tokens = 2000, temperature = 0.9, top_p = 0.95 } = options;
   ```
   - max_tokens=2000 过高
   - temperature=0.9 增加生成时间

3. **提示词过长**
   - RAG案例包含过多细节
   - 职级对照表完整包含
   - 腐败案例完整履历

4. **无缓存机制**
   - 相同请求每次重新调用API

5. **无并发控制**
   - 多用户同时请求可能导致服务过载

## 优化方案

### 1. 流式响应实现

**文件**: `server.js` 第81-154行

实现SSE流式传输：

```javascript
// 支持流式响应
if (stream) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // 实时发送给客户端
    res.write(value);
  }
}
```

### 2. 参数优化

**文件**: `server.js` 第96-117行

根据请求类型使用不同参数：

```javascript
const optimizedParams = {
  event: { max_tokens: 1500, temperature: 0.8, top_p: 0.90 },
  background: { max_tokens: 1000, temperature: 0.7, top_p: 0.85 }
};
```

### 3. RAG精简

**文件**: `index.html` buildRAGPromptSection函数

- 案例数量: 3→2
- 仅在进度>50%时添加腐败案例
- 简化案例描述

### 4. 缓存机制

**文件**: `server.js` 第7-10行

实现LRU缓存：

```javascript
const promptCache = new Map();
const CACHE_SIZE = 100;
```

### 5. 并发控制

**文件**: `server.js` 第11-13行

限制最大并发请求数：

```javascript
const MAX_CONCURRENT_REQUESTS = 3;
const requestQueue = [];
```

## 预期效果

| 优化项 | 预期延迟减少 | 用户体验提升 |
|-------|-------------|-------------|
| 流式响应 | -70% 首字延迟 | ⭐⭐⭐⭐⭐ |
| 参数优化 | -15% 总延迟 | ⭐⭐⭐ |
| RAG精简 | -20% 总延迟 | ⭐⭐⭐ |
| 缓存机制 | -80% 缓存命中延迟 | ⭐⭐⭐⭐ |
| 并发控制 | 稳定性提升 | ⭐⭐ |

## 测试验证

### 测试方法

创建 `tests/llm-optimization-test.js` 验证各优化模块。

### 测试结果

所有测试通过：
- ✅ 参数优化测试
- ✅ RAG优化测试  
- ✅ 缓存逻辑测试
- ✅ 并发控制测试

### 运行测试

```bash
node tests/llm-optimization-test.js
```

## 影响范围

### 修改文件

- `server.js` - 实现流式响应、缓存、并发控制
- `index.html` - 优化参数、精简RAG
- `tests/llm-optimization-test.js` - 新增测试
- `docs/llm-optimization.md` - 新增技术文档

### 兼容性

- 向后兼容：支持非流式响应
- API接口：新增 `stream` 参数（可选）

## 部署建议

1. ⚠️ **重要**: 流式响应需要服务器支持SSE
2. 建议先在测试环境验证
3. 监控缓存命中率和并发数
4. 根据实际使用情况调整参数

## 实际部署测试

由于需要实际API密钥，建议部署后进行真实测试：

```bash
# 部署到测试环境
# 配置 DEEPSEEK_API_KEY
# 运行服务器
# 测试流式响应功能
```

## 附录

### 相关链接

- 代码分支: `dev/llm-optimization`
- 测试文件: `tests/llm-optimization-test.js`
- 技术文档: `docs/llm-optimization.md`

### 性能指标

无法在离线环境中测试实际延迟，需要部署后使用真实API测试。预期：

- 首字响应时间: 3-5秒 → 1-2秒
- 完整响应时间: 8-12秒 → 6-9秒
- 缓存命中响应: 8-12秒 → <1秒

---

**报告人**: Claude Opus 5 (1M context)  
**审阅状态**: 待审查  
**最后更新**: 2026-08-17
