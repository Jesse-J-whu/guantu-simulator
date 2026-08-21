# 数据资产与后台数据呈现

> 活文档:代码/脚本变更时必须同步更新本文,维护规则见
> [docs/README.md](../README.md)。基线:main@e4fa8f5(2026-08-21)。

## 目录

1. [三层数据资产](#三层数据资产)
2. [表结构明细](#表结构明细)
3. [后台数据呈现:现状](#后台数据呈现现状)
4. [后台数据呈现:建议方案](#后台数据呈现建议方案)
5. [如何查看(命令速查)](#如何查看命令速查)
6. [图表资产的生成与复现](#图表资产的生成与复现)

---

## 三层数据资产

![数据资产流向](../assets/global/g02-data-assets.png)

| 层 | 文件 | 规模 | 写入者 | 角色 |
|---|---|---|---|---|
| 事实层 | `data/rollout-traj/<部门>-<难度>.jsonl` | 39 文件 × 500 行,共 ~526MB | rollout driver | 每行=一局完整 24 步(标题/正文/选项/效果/属性/职级全文),**不可变的原始事实** |
| 分析层 | `data/rollout.db` | players 19,500 / steps 468,000 / audits 39 | driver + `rollout-recheck.mts` 重算回写 | 结构化合规指标与聚合,审计与报告的查询层 |
| 生产层 | `data/rollout-server.db` | visits 994,501 / sessions 19,500 / choices 468,000 | 服务端 `/api/track/*` 生产路径 | 与线上 `guantu.db` 同构的留存库,rollout 期间独立建库 |

设计原则:**recheck 不信任 driver 的运行时计数**,从 JSONL 事实层独立重算后回写
分析层,两套口径逐玩家一致(drift=0)才算数;重资产(.db/.jsonl)不入 git,
入库的是结论 JSON、审计文档与全部生成脚本。

## 表结构明细

### rollout.db — players(每行一名玩家,29 字段)

| 字段组 | 字段 | 含义 |
|---|---|---|
| 身份 | `combo_id`(0-38) `player_idx`(0-499) `session_id` `policy` `seed` `ip` | 组合=部门×难度;策略=idx%4;独立种子与 IP |
| 对局 | `dept_id` `dept_name` `difficulty` `steps_done` `completed` `ending_type` `final_rank` `promotions` `bg_ok` `duration_ms` | 部门/难度/完成与结局/晋升次数/开场是否达标 |
| 合规计数(应全 0) | `continuity_missing` `title_dup` `choice_dup` `desc_dup` `generic_titles` `attr_zero_offered` `attr_not_applied` `rank_residual` `illegal_rank_change` | 六大诉求的机械核验计数(见下表) |
| 运行时事件 | `llm_errors` `track_failures` | 仅 driver 可观测(轨迹无法反推) |
| 总结论 | `meets_requirements` | 以上全 0 且完成 → 1 |

| 合规字段 | 对应诉求 | 判定口径 |
|---|---|---|
| `continuity_missing` | 1 故事衔接 | 某步衔接语为空 |
| `title_dup` / `choice_dup` / `desc_dup` | 2 文案不重复 | 局内标题 bigram 相似度 ≥0.55 / 选项、正文相似度 ≥0.8 |
| `generic_titles` | 2 套话治理 | 标题命中套话黑名单(如「暗流涌动」) |
| `attr_zero_offered` / `attr_not_applied` | 3 属性变化 | 全零效果选项卡 / clamp(前值+效果) ≠ 实际值(0/100 边界已豁免) |
| `rank_residual` / `illegal_rank_change` | 4 职级事实 | 引擎修正后仍有残留 / 职级非晋升 +1 跳变 |

### rollout.db — steps(468,000 行)与 audits(39 行)

`steps`:每步一行的轻量索引(`step/year/title/tag_label/continuity_ok/desc_len/
choice_count/chosen_idx/attr_nonzero/promoted/rank_after/rank_fixes`),
用于 SQL 快速聚合;完整原文在事实层 JSONL。
`audits`:39 个审计 subagent 的结论(`verdict/players_total/players_deep_read/
violations/violation_detail/summary`),由 `scripts/rollout-audit-collect.mjs`
从 `data/rollout-audit/*.json` 汇入(先清空再插,幂等)。

### rollout-server.db — 生产三表(与线上 guantu.db 同构)

| 表 | 字段 | 用途 |
|---|---|---|
| `visits` | ts/ip/ua/path/status/duration_ms | 每个请求一行(批量落库);独立 IP 统计、负载曲线、慢路径 |
| `sessions` | session_id/部门/难度/steps_done/final_rank/ending_type/promotions/attrs_final/timeline/ended/duration_ms | 一局一行;通关率、结局分布、最近对局 |
| `choices` | session_id/step/year/event_title/choice_text/effects/attrs_after/rank_after/promoted | 每步选择明细;还原任意对局 |

## 后台数据呈现:现状

线上已有两个呈现入口:

1. **`/admin` 后台页**(`server/adminPage.js`,截图见
   [user-journey.md](../user-journey.md#附管理后台)):无构建依赖的服务端
   HTML,每几秒轮询 `/api/stats`,展示访问/IP/留存/通关率/结局分布/部门热度/
   慢路径/最近 20 局;所有玩家可控字符串经 HTML 转义。
2. **`GET /api/stats`**:聚合 JSON(带 10s TTL 缓存,`generatedAt` 如实标注),
   供前端或外部监控消费。

## 后台数据呈现:建议方案

现有后台偏「总量看板」,建议按四类消费场景组织(全部可用现有三表直接支撑,
无需新采集):

| 面板 | 回答的问题 | 数据来源(现成 SQL/字段) | 已有可视化 |
|---|---|---|---|
| 玩家旅程漏斗 | 访问→开局→第 N 步→通关 各级留存 | `visits`(IP+UA 归一)× `sessions.steps_done` | `/api/stats` 的 1 分钟留存可扩展为分步漏斗 |
| 对局质量 | 结局分布是否健康、难度是否生效 | `sessions` GROUP BY difficulty,ending_type | 全局 g03 图、各部门 `<dept>-endings.png` ×13 |
| 内容健康度 | 事件重复/套话/职级修正率趋势 | `choices` + dedup 指标(rollout 已有全套口径) | g05/g06 图 |
| 单局回放 | 某玩家这一局发生了什么 | `choices` 按 session_id 还原;或 JSONL | 部门 Demo 文档的 24 步表(13 篇) |

**给「看数据」的三条路径**(按深入程度):

1. 看图:`docs/assets/`(10 张全局图 + 39 张部门图,全部可由脚本复现);
2. 看结构化数字:`data/rollout-summary.json`、`data/rollout-audit-summary.json`;
3. 自己查:下方命令速查。

## 如何查看(命令速查)

```bash
# ── 事实层:某一局全文(以委办简单难度第 1 名玩家为例)─────
head -1 data/rollout-traj/weiban-easy.jsonl | python3 -m json.tool | less
# 任意玩家:文件已按 playerIdx 排序,第 N 行 = playerIdx N-1
sed -n '251p' data/rollout-traj/zuzhiB-normal.jsonl | python3 -m json.tool

# ── 分析层:rollout.db 聚合 ───────────────────────────────
node --experimental-sqlite -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('data/rollout.db');
console.log(db.prepare('SELECT difficulty,policy,ending_type,COUNT(*) n,AVG(promotions) p FROM players GROUP BY 1,2,3').all());"

# ── 生产层:服务器留存(负载/慢路径/结局)─────────────────
node --experimental-sqlite -e "
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('data/rollout-server.db');
console.log(db.prepare('SELECT path,COUNT(*) n,AVG(duration_ms) avg_ms,MAX(duration_ms) max_ms FROM visits GROUP BY path ORDER BY n DESC').all());"

# ── 独立复核(从事实层重算全部指标,写回分析层)────────────
NODE_OPTIONS=--experimental-sqlite npx tsx scripts/rollout-recheck.mts
```

## 图表资产的生成与复现

所有文档图表由入库脚本生成(改了数据/脚本重跑即可,零手绘):

```bash
python3 scripts/docs-gen/gen_global_charts.py   # 10 张全局图 → docs/assets/global/
python3 scripts/docs-gen/gen_dept_demos.py      # 13 部门 Demo 文档+39 张图
# 前置:部门元数据导出(engine → /tmp/guantu-depts.json)
npx tsx -e "import {DEPARTMENTS} from './src/engine/departments.ts'; import {writeFileSync} from 'node:fs'; writeFileSync('/tmp/guantu-depts.json', JSON.stringify(DEPARTMENTS.map(d=>({id:d.id,name:d.name,icon:d.icon,desc:d.desc,ratings:d.ratings,ranks:d.ranks,rankPositions:d.rankPositions}))))"
# mock 场景库导出(槽位符号图用)
npx tsx -e "import {SCENE_BANK,CHOICE_BANK} from './server/mockLLM.js'; import {writeFileSync} from 'node:fs'; writeFileSync('/tmp/scenebank.json', JSON.stringify({scenes:SCENE_BANK,choices:CHOICE_BANK}))"
```

> 依赖:python3 + matplotlib(中文字体 Noto Sans CJK);图表中每个数字都来自
> 真实 DB/JSON 查询,脚本内可查证。
