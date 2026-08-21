# 官途模拟器 · 最新版总览

> 活文档:代码变更时必须同步更新本文,维护规则见 [docs/README.md](../README.md)。基线:main@e4fa8f5(2026-08-21)

## 目录

- [1. 这是什么产品](#1-这是什么产品)
- [2. 玩法循环(一局 24 步)](#2-玩法循环一局-24-步)
- [3. 核心功能一览](#3-核心功能一览)
- [4. 系统架构](#4-系统架构)
- [5. 玩家旅程(真实浏览器截图)](#5-玩家旅程真实浏览器截图)
- [6. 快速开始](#6-快速开始)
- [7. 目录结构](#7-目录结构)
- [8. 文档导航](#8-文档导航)

## 1. 这是什么产品

**官途模拟器**是一个纯前端的中文官场生涯模拟游戏:玩家以年轻公务员身份入场,在 24 年仕途中一次次面对政务、诱惑、站队与危机事件并做出选择,四维属性随之演变,最终收获从「光荣退休」到「落马」的五档结局。全部事件文案由 LLM 实时生成,再经一套确定性引擎修复(去重、职级纠错、效果再平衡),保证「每局都不一样,但每一局都讲道理」。

- **运行形态**:React SPA(vite 构建)+ Node 集群服务端(静态资源、LLM 代理、轨迹留存),SQLite 单文件库,无其他外部依赖
- **LLM 上游二选一**:`LLM_MODE=real` 走 GLM(可故障转移到 DeepSeek);`LLM_MODE=mock` 走 `server/mockLLM.js` 的 30 场景罐头库(零成本自测/大规模测试)
- **引擎是纯函数**:`src/engine/*.ts` 不碰 DOM、不发请求,同一份代码跑在浏览器(玩家)与 Node(测试脚本)里,19,500 玩家大规模测试与线上玩家走的是完全相同的代码与 HTTP 路径

## 2. 玩法循环(一局 24 步)

```text
选部门(13 选 1) → 选难度(轻松/标准/硬核) → LLM 生成开场背景
   ↓
每年 1 步的事件循环 × 24 步(2016 → 2039 年):
   展示事件(标题/描述/四选项) → 玩家选择 → 四维属性变化(0-100)
   → 绩效点累积 →(条件满足时)晋升 → 生成下一事件(承接上一步)
   ↓
第 24 步结束 → 结局计算(五档) + 官途评语 + 全程时间线回顾
```

- **四维属性**:政治嗅觉 / 执行力 / 人脉资源 / 廉洁度,初始 `50 / 50 / 50 / 80`(`src/engine/gameEngine.ts:72`)
- **13 个部门 × 3 档难度**:从县委办(6 级阶梯、5 星晋升)到政协(3 级阶梯、2 星),每部门有独立职级阶梯、星级(权力/繁忙/晋升/风险)与业务主题池(`src/engine/departments.ts`)
- **每次选择都是一年**:开局年份 2015,`applyChoice` 内 `step+1、year+1`(`src/engine/gameEngine.ts:262-263`),24 步对应 2016-2039 年

数值速览(判定阈值均可在代码中逐行核对,详见 [latest/engine.md](engine.md)):

| 机制 | 关键数值 | 出处 |
|---|---|---|
| 属性区间 | 0-100,超出夹取 | `gameEngine.ts:249-252` |
| 效果幅度 | 非零且 \|v\|<3 放大为同号 3-6 | `effects.ts:62` |
| 晋升成本 | 基准 [12,18,26,36,48,62,78] × 难度系数 × 部门星级 | `promotion.ts:16-53` |
| 年度考核 | 每 3 步一次;廉洁 <35 暂缓提拔 | `promotion.ts:19,25` |
| 落马线 | (100−廉洁)×难度系数 ≥ 75 | `ending.ts:28` |
| 优秀线 | 廉洁 ≥70 且四维均值 ≥60 且升 ≥2 级 | `ending.ts:38` |

## 3. 核心功能一览

| 功能 | 入口 | 实现文件 |
|---|---|---|
| 部门/难度选择 | 首屏 | `src/components/screens/DeptSelectScreen.tsx` + `src/engine/departments.ts` |
| 开场背景生成 | 「开始仕途」按钮 | `src/engine/gameEngine.ts` `generateBackground()`(LLM 失败回退预设) |
| 事件生成(LLM) | 每步「天机推演中…」 | `src/engine/gameEngine.ts` `nextEvent()` + `src/engine/promptBuilder.ts` + `src/engine/llm.ts` |
| 文案防重复 | 引擎自动 | `src/engine/dedup.ts`(标题 bigram≥0.55 / 选项相似度≥0.8 触发重试或改写) |
| 职级事实校验 | 引擎自动 | `src/engine/rankRules.ts`(如「县住建局办公室主任(正科级)」自动纠正为股级) |
| 剧情连续性 | 引擎自动 | `src/engine/storyMemory.ts`(NPC 名册 / 运行摘要 / 未决线索注入提示词) |
| 属性效果与再平衡 | 引擎自动 | `src/engine/effects.ts`(amplify 放大、全零补齐、保证有升有降) |
| 晋升体系 | 每次选择后 | `src/engine/promotion.ts`(绩效点 + 年度考核 + 廉洁门槛 35) |
| 结局计算 | 第 24 步后 | `src/engine/ending.ts`(五档:GREAT/GOOD/MID/MID2/BAD) |
| RAG 案例检索 | 提示词组装 | `src/engine/rag.ts` + `public/rag_knowledge.json` |
| 属性反馈弹层/晋升庆祝 | 游戏屏 | `src/components/game/AttrChangeToast.tsx` + `PromotionOverlay.tsx` |
| 全流程状态机 | — | `src/hooks/useGame.ts`(select→loading→background→game→result) |
| 轨迹留存上报 | 每局自动 | `src/services/tracking.ts` → `server/tracker.js` → `server/db.js`(SQLite) |
| LLM 代理与故障转移 | `POST /api/llm-proxy` | `server/app.js` + `server/llm.js`(GLM→DeepSeek、熔断、内容过滤重试) |
| mock LLM(离线自测) | `LLM_MODE=mock` | `server/mockLLM.js`(30 场景 × 4 槽位选项库) |
| 管理后台 | `/admin` | `server/adminPage.js` + `server/tracker.js`(stats 带 10s TTL 缓存) |

## 4. 系统架构

![系统架构](../assets/global/g01-architecture.png)

自上而下四层:

1. **玩家浏览器(React SPA)** — vite 构建的静态页面。游戏引擎在浏览器里直接跑:拼提示词 → `POST /api/llm-proxy` 拿生成文本 → 本地解析、修复、结算,服务端只做代理与留存,玩家路径上没有业务态。
2. **Node.js 服务端集群(`server/index.js`)** — `cluster` 起 min(CPU, 8) 个 worker,提供五类能力:静态资源(`static.js`,gzip + ETag + 指纹强缓存)、轨迹上报(`/api/track/*`)、LLM 代理(`/api/llm-proxy`)、统计(`/api/stats`)与 `/admin` 后台页。每 worker 独立限流桶与 DB 连接。
3. **SQLite 留存库(`server/db.js`)** — `node:sqlite` + WAL + `busy_timeout=8000`,三张表 `visits / sessions / choices`;访问日志经 `VisitBatchWriter`(2 秒或 200 条一批)异步落盘,不阻塞请求。
4. **LLM 上游(二选一)** — `LLM_MODE=real` 时 GLM(glm-4-flash),失败故障转移到 DeepSeek,配熔断(3 次失败冷却 30 秒)与内容过滤重试;`LLM_MODE=mock` 时返回 `mockLLM.js` 罐头内容,供离线开发与大规模测试。

图下方两条支线(图中最底部两行)不属于线上链路:`scripts/mass-rollout.mts` 以 19,500 名模拟玩家走**同一生产 HTTP 路径**打真实引擎;`scripts/rollout-recheck.mts` 与 39 个审计 subagent 从落盘 JSONL 独立重算全部指标。详见 [experiments/](../experiments/exp-rollout-19500.md)。

## 5. 玩家旅程(真实浏览器截图)

以下截图来自 Playwright E2E(`e2e/game.spec.ts`)对真实页面的录屏,全流程见 [user-journey.md](../user-journey.md)。

**① 选部门** —— 13 张部门卡片展示星级与推荐标记(委办、教育标「推荐」),底部切换难度。

![选部门](../assets/user-journey/e2e-01-dept-select.png)

**② 开场背景** —— LLM 生成的个人档案与开场白:行政级别、入职方式、家庭背景、初始职务,点「开启仕途」进入第一年。

![开场背景](../assets/user-journey/e2e-02-background.png)

**③ 第一个事件** —— 事件卡:类型标签、标题、剧情衔接语、描述与四个选项(每个选项带提示语,如「稳妥但费工」「省事但有代价」)。

![第一个事件](../assets/user-journey/e2e-03-first-event.png)

**④ 属性变化反馈** —— 选择后弹出四维属性增减浮层,绿色上行 / 红色下行,玩家立刻看到这一年的代价与收益。

![属性变化](../assets/user-journey/e2e-04-attr-toast.png)

**⑤ 第一次晋升** —— 绩效点达标且廉洁度≥35 时触发晋升庆祝全屏弹层,展示从旧职级到新职级的跨越与触发原因(年度考核/突出表现)。

![第一次晋升](../assets/user-journey/e2e-05-promotion-1.png)

**⑥ 结局结算** —— 第 24 步后的结局页:结局图标与标题、官途评语、最终职级、四维属性终值与 24 年时间线回顾。

![结局结算](../assets/user-journey/e2e-06-result.png)

## 6. 快速开始

环境要求:Node.js ≥ 20(用了 `node:sqlite` 与 `cluster`;运行大规模脚本需 `--experimental-sqlite`)。

```bash
# 安装
npm install

# 开发(vite dev server + Node 服务端热重启)
npm run dev

# 生产构建 + 启动(默认 http://localhost:3000,后台在 /admin)
npm run build
GLM_API_KEY=你的key npm start        # 或 LLM_MODE=mock npm start 离线自测

# 测试
npm test                              # vitest 单测(引擎即规格,见 latest/engine.md)
npm run typecheck                     # 三份 tsconfig 全量类型检查
npx playwright test                   # E2E(产出上面 8 张用户旅程截图)
npm run loadtest                      # autocannon 压测(需先 build + 起服务)
```

### 环境变量(全部可选)

| 变量 | 默认值 | 作用 |
|---|---|---|
| `PORT` | `3000` | HTTP 监听端口 |
| `WORKERS` | `min(CPU, 8)` | cluster worker 数;设 1 即单进程 |
| `DB_PATH` | `data/guantu.db` | 留存库 SQLite 文件路径 |
| `LLM_MODE` | `real` | `real`=GLM/DeepSeek,`mock`=罐头场景库 |
| `GLM_API_KEY` | — | GLM 上游密钥(real 模式首选) |
| `DEEPSEEK_API_KEY` | — | DeepSeek 备用上游(GLM 失败时故障转移) |
| `GLM_MODEL` | `glm-4-flash` | GLM 模型名 |
| `LLM_MAX_CONCURRENT` | `20` | 每 worker 的 LLM 并发上限(超出排队) |
| `LLM_TIMEOUT_MS` | `60000` | 单次 LLM 请求超时 |
| `RATE_LIMIT_PER_MIN` | `600` | 每 IP 每分钟请求上限(令牌桶) |
| `TRUST_PROXY` | 关闭 | `1/true/yes` 时取 `X-Forwarded-For` 最右一段作为客户端 IP |
| `STATS_TTL_MS` | `10000` | `/api/stats` 聚合结果缓存时长(压测容量修复,详见 [latest/server.md](server.md)) |

## 7. 目录结构

```text
guantu-simulator/
├── src/
│   ├── engine/            ★ 纯函数游戏引擎(浏览器与 Node 共用,详见 latest/engine.md)
│   │   ├── gameEngine.ts    主流程:createGame/nextEvent/applyChoice/finishGame
│   │   ├── effects.ts       效果规范化 + amplify 放大 + 再平衡
│   │   ├── promotion.ts     绩效点/考核步/晋升成本/廉洁门槛
│   │   ├── ending.ts        五档结局判定
│   │   ├── dedup.ts         bigram 相似度去重 + 泛化标题黑名单 + 兜底改写
│   │   ├── storyMemory.ts   NPC 名册/运行摘要/未决线索
│   │   ├── rankRules.ts     职级事实规则库(校验+自动修正)
│   │   ├── promptBuilder.ts 15 条叙事指令 + 四幕剧情弧 + 输出格式约束
│   │   ├── parser.ts        【】标记格式解析(容错)
│   │   ├── llm.ts           三种 LLM 客户端(代理/直连/mock)
│   │   ├── rag.ts           案例检索(同职级 2 例 + 反面案例 1 例)
│   │   ├── departments.ts   13 部门定义(阶梯/星级/主题池)
│   │   ├── rng.ts           随机源抽象(MathRandom / mulberry32 种子)
│   │   └── types.ts         全部共享类型
│   ├── components/          React 组件(common/game/screens 三层)
│   ├── hooks/useGame.ts     游戏主状态机(屏幕流转/上报/反馈)
│   ├── services/tracking.ts 留存上报(失败静默降级)
│   └── App.tsx              根组件(按 screen 切换五个屏幕)
├── server/                 Node 服务端(index=cluster 入口/app=路由/llm=上游代理
│                           /db=SQLite+批量写/tracker=留存与stats/static=静态/adminPage)
├── server/mockLLM.js       mock 场景库(30 场景 × 4 槽位,按步轮换)
├── server.js               生产入口(npm start 兼容壳,转 require server/index.js)
├── api/llm-proxy.js        Vercel Serverless 版 LLM 代理(vercel.json 部署用)
├── tests/unit/             vitest 单测(gameEngine/storyMemory 等,以测试为规格)
├── e2e/                    Playwright 端到端(game.spec.ts)
├── scripts/                dev/构建产物扫描/mass-rollout/rollout-recheck/loadtest/
│                           diversity-scan + docs-gen(全部插图生成脚本)
├── data/                   运行产物:guantu.db、rollout*.db/jsonl、压测与审计数据
├── public/                 静态资源(favicon、rag_knowledge.json)
├── legacy/                 v1 时代文件存档(单文件 server/index.html 等,不参与构建)
└── docs/                   全部文档(见下节)
```

## 8. 文档导航

| 文档 | 内容 |
|---|---|
| [latest/engine.md](engine.md) | ★ 引擎与算法详解:效果/amplify/晋升/结局/去重/剧情记忆,写给要改算法的人 |
| [latest/server.md](server.md) | 服务端:集群、API、SQLite 留存库、LLM 代理与故障转移、stats 缓存 |
| [latest/frontend.md](frontend.md) | 前端:组件树、useGame 状态机、样式与交互 |
| [latest/data-assets.md](data-assets.md) | 数据资产:表结构、轨迹/统计口径、后台呈现与查看命令 |
| [demos/](../demos/README.md) | 13 部门玩家轨迹 Demo(每部门图文 + 24 步全表) |
| [experiments/](../experiments/README.md) | 可复现实验:19,500 玩家 rollout、真实 GLM 多样性扫描、压测 |
| [dev-history/](../dev-history/README.md) | 开发史:每个阶段 commit 的动机、改动与验证方式 |
| [user-journey.md](../user-journey.md) | 真实浏览器一局完整截图 walkthrough |
| [rollout-report.md](../rollout-report.md) | 19,500 玩家大规模测试终版报告(结论层) |

---

*本文基线为 `main@e4fa8f5`;若发现描述与代码不一致,以代码为准并按 [docs/README.md](../README.md) 的维护规则更新本文。*
