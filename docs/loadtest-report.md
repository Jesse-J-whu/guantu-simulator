# 压测报告 — 大规模并发压力测试

- 日期:2026-08-21
- 分支:`dev/v2-overhaul`
- 工具:autocannon 8.x(脚本 `npm run loadtest`,自包含:启动生产形态服务 → 跑 4 场景 → 落盘 `test-results/loadtest-report.json`)
- 服务形态:cluster 8 worker + dist 静态 + gzip/ETag 缓存 + SQLite(WAL)+ mock LLM
- 环境:Linux 5.15,Node 24,本机回环(压测客户端与服务端同机,数值偏保守)

## 场景与结果(全部 0 错误)

| 场景 | 并发 | 请求总数 | p50 | p99 | max | 错误 |
|---|---|---|---|---|---|---|
| S1 静态首页 `GET /` | 200 连接 × 20s | 473,418 | 7ms | 17ms | 171ms | **0** |
| S2 静态资源三件套(HTML+JS+CSS) | 200 连接 × 20s | 147,308 | 26ms | 57ms | 142ms | **0** |
| S3 真实用户 API 流水线(7 请求:track/start→llm-proxy×2→choice×2→end→stats) | 200 连接 × 20s | 8,435(1205 条流水线) | 57ms | 18.1s¹ | 19.9s | **0** |
| S4 峰值脉冲(同 S3 流水线) | 500 连接 × 10s | 19,152(2736 条流水线) | 56ms | 297ms | 9.4s | **0** |

¹ S3/S4 的 p99 尾延迟来自 LLM 并发闸门(`LLM_MAX_CONCURRENT=20`)的排队等待——这是保护真实上游 API 的**有意背压**,不是服务器故障;放开闸门实测反而使 p50 从 13ms 恶化到 877ms(mock 生成是同步 CPU 工作,闸门保护了事件循环)。

服务端全程:无 worker 崩溃、无 5xx、`visits` 表成功落库 526,793 条访问记录,压测结束后 `/api/stats` 正常返回。

## 吞吐量级

- S1 单静态首页:约 **23,700 rps**(8 worker);
- S4 五百并发脉冲:约 **1,915 条完整用户流水线/10s**(≈134 req/s 持续,含 SQLite 三表写入);
- 对比目标(几千同时在线玩家,人均每步一次 LLM 调用即 <1 rps):余量超过两个数量级。

## 压测过程中发现并修复的缺陷(3 个真 bug)

1. **多 worker 启动竞态导致崩溃循环**(`server/db.js`)
   - 现象:8 worker 同时冷启动,stderr 刷 `Error: database is locked`,`cluster` 反复重启 worker,压测期间间歇 5xx。
   - 根因:`openDb` 先执行 `PRAGMA journal_mode = WAL`(需写锁)后设置 `busy_timeout`,竞态窗口内直接抛错。
   - 修复:`busy_timeout=8000` 最先设置;`journal_mode` 与建表走 `execWithRetry`(最多 10 次退避重试);访问日志批量写入改 `BEGIN IMMEDIATE`(避免 deferred 事务并发升级死锁),失败整批重试 3 次后丢弃并记录。

2. **`maxRequestsPerSocket=1000` 触发 Node 自动 503**(`server/index.js`)
   - 现象:autocannon 20 连接恰好 20,000 个 2xx 后,后续请求全部 503;100 连接恰好 100,000 个 2xx 后 19,000 个 503(数字完全吻合 per-socket 上限),而服务端访问日志里没有任何非 200——503 是 Node 内核直接回复的。
   - 修复:`maxRequestsPerSocket = 0`(不限制)。keep-alive 复用由 `keepAliveTimeout=65s` 管理即可;长会话轮询(如 stats 轮询)不会再在第 1001 个请求被 503。

3. **提前响应不排空请求体 → keep-alive 连接被销毁**(`server/app.js`)
   - 现象:500 并发 POST 流水线下 1,800 个连接级错误。限流 429 在读取请求体之前返回,Node 因未消费的请求体销毁 socket,客户端同连接后续管线请求全部失败(真实浏览器 keep-alive 复用同样会踩中)。
   - 修复:新增 `early()` 辅助函数,429/400/404/405/413/500 等提前返回统一先 `req.resume()` 排空请求体再响应。

另:访问日志只记录页面与 API(`/assets/*`、`/healthz`、`/favicon.ico` 除外)——静态资源请求量是页面访问的数百倍,逐条入库只产生写放大(首轮压测单场 66 万行)。

## 复现方式

```bash
npm run build
DURATION=20 npm run loadtest   # 环境变量:WORKERS(默认8) DURATION(默认20s)
```

压测口径说明:压测从单一 IP 发压,故通过 `RATE_LIMIT_PER_MIN=10000000` 放宽每 IP 限流(默认 600/分,面向真实用户;限流器本身有集成测试覆盖)。
