# 实验 E3:压测与容量修复

> 执行:2026-08-21(修复后终版数据)· 分支 feat/mass-rollout 复测 · 工具 autocannon ^8.0.0
> 脚本:`scripts/loadtest.mjs`(`npm run loadtest`,自包含)· 数据:`data/loadtest-report.json`
> 配套代码:`server/tracker.js`(stats TTL 缓存)· 单测:`tests/unit/trackerStatsCache.test.ts`

**一句话结论:生产形态服务(8 worker + dist 静态 + mock LLM + 独立 SQLite)四场景共 891,378 次请求 0 错误;压测过程暴露出真实容量缺陷——`/api/stats` 同步聚合 ~47 万行 visits 阻塞事件循环约 1.2s,把 S3 流水线压到 20s 只完成 1,188 个请求(p99 17.2s)——加 10s TTL 缓存修复后 S3 吞吐提升约 156 倍(1,188 → 186,651),p99 17,195ms → 107ms。**

| 场景(修复后终版) | 并发 × 时长 | 请求数 | p50 | p99 | max | 错误 |
| --- | --- | --- | --- | --- | --- | --- |
| S1 静态首页 `GET /` | 200 × 20s | 454,376 | 8ms | 18ms | 214ms | **0** |
| S2 静态三件套(HTML+JS+CSS) | 200 × 20s | 151,188 | 25ms | 53ms | 122ms | **0** |
| S3 真实用户 API 流水线(7 请求) | 200 × 20s | 186,651 | 10ms | 107ms | 2,161ms | **0** |
| S4 峰值脉冲(同 S3 流水线) | 500 × 10s | 99,163 | 31ms | 206ms | 2,559ms | **0** |

## 目录

1. [实验目的](#一实验目的)
2. [实验设计](#二实验设计)
3. [实验方法](#三实验方法)
4. [结果](#四结果)
5. [容量缺陷发现与修复(完整故事)](#五容量缺陷发现与修复完整故事)
6. [如何查看(命令速查)](#六如何查看命令速查)
7. [局限与诚实声明](#七局限与诚实声明)
8. [完整复现与环境要求](#八完整复现与环境要求)

## 一、实验目的

回答两个问题:

1. **容量**:目标"几千同时在线玩家,人均每步一次 LLM 调用(<1 req/s)"下,单机生产形态服务的余量有多大?静态资源、玩家 API 流水线、峰值脉冲三类负载的 p50/p99 是否可接受、有无错误?
2. **缺陷**:压测是发现真 bug 的手段——本实验先后暴露并修复了 1 个容量缺陷(stats 冷聚合阻塞事件循环)与 3 个基础设施缺陷(见 5.1),全部修复后复测取得终版数字。

## 二、实验设计

### 被测对象与场景变量

| 项 | 值 |
| --- | --- |
| 服务形态 | `node server.js` cluster **8 worker** + `dist/` 静态资源(gzip/ETag)+ mock LLM + 独立 SQLite(WAL) |
| 端口 / DB | `LOADTEST_PORT=3398` · `DB_PATH=data/loadtest.db`(每次压测前清空,`loadtest.mjs:24-27`) |
| 压测客户端 | autocannon(`loadtest.mjs:46-65`),本机回环,客户端与服务同机(数值偏保守) |
| 限流 | `RATE_LIMIT_PER_MIN=10000000` 放宽(单 IP 发压,测服务器容量而非限流器,`loadtest.mjs:88`) |
| LLM 并发闸门 | 保持默认 20——mock 生成是同步 CPU 工作,闸门保护事件循环(代码注释:实测放开后 p50 13ms → 877ms) |
| 时长变量 | `DURATION=20` 秒(S4 取一半,最少 10s) |

S3/S4 的"真实用户 API 流水线"是 7 个请求的固定序列(`loadtest.mjs:35-43`),模拟一名玩家从开局到结账:

```
POST /api/track/start → POST /api/llm-proxy(背景,800 tokens)
→ POST /api/llm-proxy(事件,1600 tokens)→ POST /api/track/choice ×2
→ POST /api/track/end → GET /api/stats
```

注意**第 7 个请求是 `GET /api/stats`**——管理面板的常规轮询,也正是后面容量故事的主角。

### 控制变量(诚实口径)

- LLM 上游为 mock(压测目的是服务器容量,真 API 的 20s 级延迟会掩盖一切服务端问题;LLM 链路其余部分——代理、闸门、解析——全部真实)。
- 静态场景 S1/S2 只读不写库;S3/S4 真实写 sessions/choices/visits 三表。
- 压测从单一 IP 发压,visits 表 uniqueIps=1;真实用户场景的每 IP 限流行为由集成测试另行覆盖。

### 环境

Node v24.14.0 · Linux 5.15 · 8 worker · autocannon ^8.0.0(devDependencies)。

## 三、实验方法

```
npm run build(需 dist/index.html,loadtest.mjs:19 校验)
        │
        ▼
清空 data/loadtest.db → spawn 生产形态服务(8 worker, mock LLM)
        │  /healthz 就绪
        ▼
S1 静态首页(200×20s)──► S2 三件套(从首页 HTML 正则抽取真实 /assets/*.js|css)
        │
        ▼
S3 用户流水线(200×20s,7 请求/轮)──► S4 峰值脉冲(500×10s)
        │
        ▼
GET /api/stats 服务端统计快照 → 全部落盘 data/loadtest-report.json
```

场景实现要点(`scripts/loadtest.mjs`):

- S2 的资产路径不是写死的,而是先抓首页 HTML、正则抽出真实的 JS/CSS 资源路径(`loadtest.mjs:119-128`)——压的就是构建产物的真实形态;
- 每场景记录 `requests.total / latency.p50/p99/max / errors+non2xx`(`loadtest.mjs:67-77`);
- 服务端统计允许失败不阻断落盘(`loadtest.mjs:149-158`)。

## 四、结果

### 4.1 终版四场景(修复后,`data/loadtest-report.json`)

见文首表。补充两个推导量:S1 ≈ 2.3 万 req/s(454,376/20s);S3 相当于 20s 完成 186,651/7 ≈ 2.67 万条完整用户流水线。对照目标(人均 <1 req/s、几千在线):余量超过两个数量级。

服务端统计快照(`loadtest-report.json` 的 `serverStats`,快照时点 visits 已落库 693,485 条;排除 /assets、/healthz 不入库的请求,压测全部结束后 `data/loadtest.db` 实落 791,635 条)——修复后各路径平均耗时:

| 路径 | 平均耗时 | hits |
| --- | --- | --- |
| /api/stats | **1.16ms**(TTL 缓存命中为主) | 26,611 |
| /api/track/choice | 1.14ms | 53,523 |
| /api/track/start | 1.06ms | 27,280 |
| /api/track/end | 1.02ms | 26,637 |
| /(静态首页) | 0.63ms | 505,120 |
| /api/llm-proxy | 0.10ms(mock) | 54,314 |

![压测修复前后对比](../assets/global/g07-loadtest.png)

### 4.2 结果解读(机制层面)

- S2 的 p50(25ms)高于 S1(8ms)是三件套串行 + 大体积 JS 的传输成本,与预期一致;
- S3 p99=107ms、S4 p99=206ms 的长尾来自 LLM 并发闸门(20)的排队——这是保护上游的**有意背压**;
- S3 max=2,161ms / S4 max=2,559ms 的残余尖峰是每个 worker 每 10s 一次的 stats 冷聚合(同步 SQLite 无法避免),已不影响 p99;
- 全程无 worker 崩溃、无 5xx、无连接级错误。

## 五、容量缺陷发现与修复(完整故事)

### 5.1 前置:更早一轮(dev 分支)修掉的 3 个基础设施缺陷

首轮压测(`docs/loadtest-report.md`,dev/v2-overhaul 分支,S1 473,418 / S2 147,308 / S3 8,435 / S4 19,152,全 0 错误)先暴露了三个与容量模型无关但真实存在的 bug:

1. **多 worker 冷启动竞态**(`server/db.js`):8 worker 同时以 `PRAGMA journal_mode=WAL` 抢写锁先于 `busy_timeout` 生效,`database is locked` 崩溃循环。修复:`busy_timeout=8000` 最先设置,建表走 `execWithRetry`,`BEGIN IMMEDIATE` 批量写。
2. **`maxRequestsPerSocket=1000` 触发 Node 自动 503**(`server/index.js`):20 连接恰好 20,000 个 2xx 后全部 503,服务端日志却全是 200——503 是 Node 内核直接回的。修复:置 0 不限制。
3. **提前响应不排空请求体销毁 keep-alive 连接**(`server/app.js`):429 在读 body 前返回,未消费的 body 导致 socket 被销毁,同连接后续管线全挂。修复:统一 `early()` 辅助,先 `req.resume()` 再响应。

### 5.2 主角:stats() 冷聚合阻塞事件循环

**现象**(mass-rollout 阶段复测,S3 首测):20s 只完成 **1,188 个请求,p50 885ms、p99 17,195ms**;S4 首测 671 个请求、p50 960ms、p99 9,720ms(修复前基线记录于 `scripts/docs-gen/gen_global_charts.py:196-198`,即 g07 图的"修复前"柱)。而玩家路径本身只有 0.2-0.6ms。

**根因定位**:S3 流水线每轮以 `GET /api/stats` 收尾;`stats()` 要在 visits 表上做多组无索引聚合(总量/去重 IP/24h 窗口/慢路径 GROUP BY/留存扫描,`server/tracker.js:108-131`),压测中 visits 已累积到约 47 万行,`node:sqlite` **同步执行把 worker 事件循环阻塞约 1.2s**——期间该 worker 上排队的所有玩家请求一起被拖垮。

**修复**(`server/tracker.js:91-104`,feat/mass-rollout 分支唯一的生产代码改动):

```js
// server/tracker.js:96-104
let statsCache = null;
const STATS_TTL_MS = Math.max(0, Number(process.env.STATS_TTL_MS ?? 10_000));
function stats() {
  const now = Date.now();
  if (statsCache && now - statsCache.at < STATS_TTL_MS) {
    return statsCache.data;   // 命中缓存,直接返回同一份对象
  }
  // ……冷聚合(多组 SQL),完成后 statsCache = { at: now, data }
```

设计取舍:统计面板容忍秒级陈旧,`generatedAt` 字段如实标注生成时间;`STATS_TTL_MS` 可调,设 0 完全关闭。行为由 `tests/unit/trackerStatsCache.test.ts` 三个用例单独锁定(TTL 内同对象且不反映新写入 / TTL 过期后现算且可见新写入 / `STATS_TTL_MS=0` 关缓存)。

**复测**(单测/集成测全绿后):即文首终版表——

| 指标 | 修复前 | 修复后 | 变化 |
| --- | --- | --- | --- |
| S3 完成请求 | 1,188 | 186,651 | **≈156 倍** |
| S3 p50 / p99 | 885ms / 17,195ms | 10ms / 107ms | p99 ↓ 99.4% |
| S4 完成请求 | 671 | 99,163 | ≈148 倍 |
| S4 p50 / p99 | 960ms / 9,720ms | 31ms / 206ms | p99 ↓ 97.9% |
| 错误 | 0 | 0 | — |

残余的 max≈2.2s(S3)/2.6s(S4)即每 worker 每 10s 一次的冷聚合,属同步 SQLite 的可接受代价,不再进入 p99。

## 六、如何查看(命令速查)

### 6.1 读终版报告(一行命令,本人实测输出)

```bash
python3 -c "import json;r=json.load(open('data/loadtest-report.json'));[print(s['name'],'| reqs',s['reqs'],'| p50',s['p50'],'ms | p99',s['p99'],'ms | err',s['errors']) for s in r['scenarios']]"
# 预期:
# S1 静态首页 / | reqs 454376 | p50 8 ms | p99 18 ms | err 0
# S2 静态资源 3件套 | reqs 151188 | p50 25 ms | p99 53 ms | err 0
# S3 用户API流水线(7请求) | reqs 186651 | p50 10 ms | p99 107 ms | err 0
# S4 峰值脉冲500并发 | reqs 99163 | p50 31 ms | p99 206 ms | err 0
```

> 注意:同文件里的 `rps` 字段**不是** req/s——`loadtest.mjs:71` 误把 autocannon 的 `throughput.total`(字节)当请求速率,该字段实为 bytes/s,请勿引用;请求速率请自行用 `reqs / duration` 推导。

服务端统计快照:`python3 -c "import json;print(json.load(open('data/loadtest-report.json'))['serverStats']['slowestPaths'])"`(预期输出 6.1 节那张表的原始数据)。

### 6.2 重跑压测

```bash
npm run build && npm run loadtest        # 默认 WORKERS=8 DURATION=20
# 预期:控制台依次打印 4 个场景的 JSON(形如 {"rps":…,"reqs":454376,"p50":8,"p99":18,"errors":0}),
#       末尾 [loadtest] 完成,报告: test-results/loadtest-report.json
# 可调:DURATION=10 WORKERS=4 LOADTEST_PORT=3400 npm run loadtest
```

### 6.3 关闭缓存做对照实验(A/B 验证修复归因)

```bash
STATS_TTL_MS=0 npm run loadtest   # 环境变量经 loadtest.mjs 的 {...process.env} 透传给服务端
# 预期:S3/S4 请求量与 p99 显著恶化(回到冷聚合每次现算的形态,量级参考修复前 1,188/17,195ms;
#       具体数值取决于当时 visits 行数)。同一 DURATION 下与 6.2 的结果对照即为修复归因实验。
```

### 6.4 跑缓存行为单测

```bash
npx vitest run tests/unit/trackerStatsCache.test.ts
# 预期:3 个用例通过(TTL 内命中 / TTL 过期现算 / STATS_TTL_MS=0 关闭)
```

### 6.5 查压测落库数据

```bash
node --experimental-sqlite -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/loadtest.db', { readOnly: true });
console.log(db.prepare('SELECT COUNT(*) visits, COUNT(DISTINCT ip) ips FROM visits').get());
console.log(db.prepare('SELECT COUNT(*) sessions FROM sessions').get());
db.close();" 2>/dev/null
# 预期:{ visits: 791635, ips: 1 } / { sessions: 2 }(loadtest-1/loadtest-2 两条流水线会话;
#       791,635 = 全部四场景请求中除 /assets、/healthz 外的落库量)
```

### 6.6 看图

`docs/assets/global/g07-loadtest.png`:S3/S4 修复前后"完成请求数 / p50 / p99"三联柱状图(对数轴),由 `scripts/docs-gen/gen_global_charts.py:g07_loadtest()` 生成——"修复前"数据硬编码自实测基线(1,188/885/17,195;671/960/9,720),"修复后"读 `data/loadtest-report.json`。

## 七、局限与诚实声明

1. **mock LLM**:压测不含真实上游延迟与失败注入;真实 GLM 下玩家路径的端到端延迟由上游主导(E2 实测 p50 22-28s),服务器侧并非瓶颈。
2. **本机回环、客户端与服务同机**:带宽与 CPU 互抢,测得吞吐偏保守;不能直接外推为生产集群容量,只用于相对比较与缺陷暴露。
3. **单一 IP 发压 + 限流放宽**:每 IP 限流(默认 600/分)与真实多 IP 场景由集成测试覆盖,不在本实验口径内。
4. **`rps` 字段不可信**:见 6.1 的说明(脚本 bug,字段实为 bytes/s);本篇所有吞吐数字均由 reqs/时长推导并注明。
5. **stats 冷聚合未根治只做缓存**:同步 SQLite 每 worker 每 10s 仍有一次 ~秒级聚合(max 尖峰来源);若未来管理面板要求强实时,需将 stats 迁移到异步/增量方案,这是已知技术债。
6. **修复前基线的两套数字**:dev 分支首轮(S3 8,435,p99 18.1s,当时归因含 LLM 闸门排队)与 mass-rollout 首测(S3 1,188,p99 17,195ms)是不同两次运行,visits 行数与条件不同;本文 5.2 节的 before/after 采用后者(与 g07 图表一致),前者仅在 5.1 节作为基础设施缺陷阶段的记录。

## 八、完整复现与环境要求

环境:Node ≥ 24(实测 v24.14.0)、autocannon ^8.0.0(`npm install` 自带)、约 1GB 空闲内存、无需外网(mock 模式)。

```bash
npm run build                 # 产出 dist/(loadtest 前置校验)
npm run loadtest              # 四场景连跑,~70s,落盘 test-results/loadtest-report.json
STATS_TTL_MS=0 npm run loadtest   # 可选:关闭 stats 缓存的对照运行
npx vitest run tests/unit/trackerStatsCache.test.ts   # 缓存行为锁定
```

预期终态:四场景 `errors` 全 0;S3 ≥ 18 万请求、p99 三位数毫秒;`tests/unit/trackerStatsCache.test.ts` 3/3 通过。

相关阅读:[实验总览](./README.md) · [E1 19,500 玩家 rollout](./exp-rollout-19500.md)(其中 994,501 请求 0 错误是同一服务形态的"长跑"佐证)· 历史报告 `docs/loadtest-report.md`
