# 实验总览

官途模拟器上线前的三组核心实验:大规模用户模拟、真实 LLM 多样性、压测与容量修复。
三篇实验报告按统一结构撰写——**用什么、怎么做的、结果如何、我如何查看**——
每个数字都可回溯到 `data/` 下的 JSON/SQLite,或按文中给出的命令自行复跑取数。

## 三个实验一览

| # | 实验 | 验证什么 | 规模 | 核心结论 | 报告 |
| --- | --- | --- | --- | --- | --- |
| E1 | 19,500 玩家大规模 rollout | 生产全链路(真实引擎 + 生产 HTTP + 双 SQLite)下,六大产品诉求是否每局每步成立 | 13 部门 × 3 难度 × 500 玩家 = 19,500 局 / 468,000 步 | 19,500/19,500 完成;11 项违例计数全 0;driver↔独立复核 drift=0;994,501 请求 0 错误;39/39 组合审计 PASS | [exp-rollout-19500.md](./exp-rollout-19500.md) |
| E2 | 真实 GLM 多样性验证 | 真模型(glm-4-flash)沿生产路径生成时,局内文案重复 / 衔接 / 属性 / 职级是否达标 | 三轮共 29 局真 API 全流程(13+8+8 局,约 1,300 次上游调用) | 局内标题 / 选项 / 正文重复收敛到 0(选项重复 17→3→0);解析、衔接、属性非零均 100%;职级残留 0 | [exp-diversity-realglm.md](./exp-diversity-realglm.md) |
| E3 | 压测与容量修复 | 单机生产形态服务的容量余量,以及压测能暴露的真实缺陷 | 4 场景共 891,378 请求(autocannon,200/500 并发,8 worker) | 全场景 0 错误;发现并修复 stats() 冷聚合阻塞事件循环(10s TTL 缓存,S3 吞吐 1,188 → 186,651,约 156 倍) | [exp-loadtest.md](./exp-loadtest.md) |

**三者的分工**(为什么缺一不可):

- E1 用 mock LLM 换取规模——真实 GLM 单次 ~20 秒,19,500 局约 48.75 万次调用不可行;
- E2 用真 GLM 换取文案层真实性——mock 的罐装场景无法证明模型行为的多样性;
- E3 用 mock LLM 隔离出服务器本身的容量——真 API 延迟会掩盖一切服务端问题。

任一实验的结论都在另两个的盲区里,合在一起才是完整证据链。

## 公共说明

### 脚本全部入库,可复现

| 脚本 | 作用 |
| --- | --- |
| `scripts/mass-rollout.mts` | E1 driver:19,500 玩家全流程,随跑随算合规 |
| `scripts/rollout-recheck.mts` | E1 独立复核:从 JSONL 轨迹重算全部指标(不信任 driver) |
| `scripts/rollout-audit-collect.mjs` | E1 审计汇总:39 组合结论 → audits 表 + summary JSON |
| `scripts/diversity-scan.mts` | E2 扫描:起真实服务(LLM=real)跑 N 局并汇总 |
| `scripts/loadtest.mjs` | E3 压测:自包含四场景(`npm run loadtest`) |
| `scripts/docs-gen/gen_global_charts.py` | 全部图表(g02-g10)生成,与文字同源 |

每篇报告末节给出完整复现命令与环境要求;报告"如何查看"一节的命令均经实测并注明预期输出。

### 数据分层:什么在 git 里,什么只在本地

- **不入 git**(`.gitignore:32-37` 排除 `data/*.db*` 与 `data/rollout-traj/`):
  E1 重数据约 1GB——`rollout.db`(38MB,players/steps/audits)、`rollout-server.db`(465MB,
  生产路径留存)、`rollout-traj/`(39 文件 526MB 全量轨迹)。**本文档写作时这些文件仍在
  本地 `data/` 下,可按 E1"如何查看"一节的 SQL/命令直接查询**;克隆仓库后若 data/ 为空,
  相应查询需先复跑实验。
- **已入库**:`data/rollout-summary.json`、`data/rollout-audit-summary.json`(E1)、
  `data/final-scan-13games.json`、`data/confirm-scan-8games.json`、`data/final-confirm-scan.json`(E2)、
  `data/loadtest-report.json`(E3),以及 39 组合审计结论 `data/rollout-audit/`(78 文件)。

### 数字一致性原则

1. 各篇报告中的每个数字,或直接抄自上述 data/*.json 的 summary 字段,
   或由撰写者对 SQLite 直查 / 命令实测得出(报告内注明口径与命令);
2. 与三份原始报告(`docs/rollout-report.md`、`docs/diversity-report.md`、
   `docs/loadtest-report.md`)一致;若有出入,以 `data/*.json` 为准;
3. 图表(PNG 位于 `docs/assets/global/`,各篇按相对路径 `../assets/global/…` 嵌入)
   由 `gen_global_charts.py` 从同一批 JSON 生成,与文字同源。

### 公共环境

- Node v24.14.0(`node:sqlite` 需 `--experimental-sqlite` 标志)、Linux 5.15;
- SQLite 三库均 WAL 模式;driver/压测客户端与服务同机、本机回环(延迟数字不含真实网络);
- LLM:E1/E3 用 `LLM_MODE=mock`,E2 用 `LLM_MODE=real`(glm-4-flash,Key 仅经 `.env`
  的 `GLM_API_KEY` 注入项目内使用,不入库、不出现在任何文档)。

### 快速入口(最常见的三个问题)

- "这次大规模测试到底过没过?" → E1 第 1 节关键数字表 + 第 4.1 节;
- "AI 生成的文案会不会翻来覆去那几句?" → E2 第 4.1 节三轮收敛表;
- "服务器扛得住多少人?" → E3 文首四场景表 + 第 5.2 节容量修复故事。
