# 大规模用户模拟测试报告 — 19,500 玩家全量 rollout

> 2026-08-21 · 分支 feat/mass-rollout · 数据:`data/rollout.db` / `data/rollout-server.db` / `data/rollout-traj/*.jsonl`(共39文件,~530MB)

## 结论(先读这个)

**19,500/19,500 名模拟玩家全部完成 24 步完整对局,六大诉求 0 违例,0 请求错误,压测达标。**

- 每个部门(13)× 每个难度(3)× **500 名不同玩家** = 19,500 名玩家
- 全部结果实时写入数据库:服务器留存库 `rollout-server.db`(sessions/choices/visits)+ 分析库 `rollout.db`(players/steps/audits)
- 39 个审计 subagent(每组合一个)全量机械核验 + ≥15 人逐字深读(结论见文末与 `data/rollout-audit/`)

## 测试方法:与真实浏览器玩家完全同构

| 环节 | 实现 | 与生产的一致性 |
|---|---|---|
| 游戏引擎 | `src/engine/` 真实引擎跑在 driver | 100%(同一份代码) |
| LLM 事件生成 | HTTP `POST /api/llm-proxy` | 100%(生产路径,含解析/重试/去重) |
| 轨迹上报 | 每步 `POST /api/track/start|choice|end`,逐字段对齐 `useGame.ts` | 100% |
| 玩家身份 | 19,500 个互不相同的 IP(X-Forwarded-For)+ 5 种 UA + 独立种子 | 等价于 19,500 个独立访问者 |
| 玩家策略 | good(清廉能吏)/bad(短视逐利)/random/mixed 各 125/组合 | 覆盖真实用户行为光谱 |
| LLM 上游 | `LLM_MODE=mock`(罐装内容) | **唯一简化项,见下** |

**关于 mock LLM 的诚实说明**:19,500 局 × ~26 次 LLM 调用 ≈ 50 万次请求;
真实 GLM(glm-4-flash)单次 ~20 秒,全量真跑需数月,不可行。因此大规模层用 mock
(引擎、HTTP、去重、上报、结算全部真实,仅事件文案罐装);**文案多样性已在 Phase 1
用真实 GLM API 跑 29 局完整扫描单独验证**(三次扫描收敛到局内标题/选项重复 0,
见 `docs/diversity-report.md` 与 `data/final-confirm-scan.json`)。

## 六大诉求核验(独立双重复核)

每名玩家的轨迹被**两套独立代码**核算:driver 随跑随算 + `rollout-recheck.mts`
从存储的原始 JSONL 轨迹全量重算(不信任运行时计数)。九项可从轨迹重算的
指标两套口径逐玩家完全一致(drift=0);`llm_errors`/`track_failures` 是
运行时事件、无法从轨迹反推,仅 driver 计数(全量均为 0,服务器侧
994,501 请求 0 错误可交叉印证):

| 诉求 | 指标 | 结果 |
|---|---|---|
| 1. 故事衔接 | 【剧情衔接】缺失 | **0** / 468,000 步 |
| 2. 文案不重复 | 局内标题重复(bigram≥0.55) | **0** |
| | 局内选项重复(相似度≥0.8) | **0** |
| | 局内正文重复(desc 相似度≥0.8) | **0**(v2 新增指标,见下) |
| | 泛化套话标题(暗流涌动类) | **0** |
| 3. 属性变化 | 全零属性选项卡 | **0** / 187.2 万张选项卡 |
| | 属性未生效(排除 0/100 夹取边界) | **0**(属性数学 clamp(prev+effect) 全量验算通过) |
| 4. 职级事实 | 引擎修正后残留 | **0** |
| | 非法职级跳变 | **0**(职级只经晋升 +1) |
| 5. 晋升喜悦 | 晋升步 | 55,880 步(11.95%),见下方分布 |
| 6. 结局评级 | 结局合法性 | 19,500/19,500 合法结局(分布见下) |

> 复核过程中的一个真实发现:driver 初版把"属性已顶在 100 再加成"误判为
> "属性未生效"(4,354 次)。逐例核查证实全部是 0/100 夹取边界(属性数学
> 81,408 步 0 违例),修正判定逻辑后为 0 —— 误报在报告里如实记录。
>
> **第一轮 39 组合审计驱动的一次真实返工**:初版 mock 的正文模板只有 6 套,
> 审计 subagent 深读发现局内正文逐字重复 4-13 次、衔接语凭空捏造人名 ——
> 机械指标全绿但"玩家直接阅读的正文层"不合格(2 个组合判 FAIL)。
> 据此重写 mock 为 **30 个完整场景单元**(标题/正文/提示/四选项/效果同槽位
> 语义一致,按步轮换保证一局 24 步场景互不相同,衔接语只引用 prompt 中
> 真实存在的上一步标题),并新增 desc_dup 一等指标;然后 **19,500 玩家
> 全量重跑**。
>
> **第二轮审计又抓到一处语义倒挂并再次全量重跑**:两个审计 subagent 独立
> 发现场景 1/3 的 D 槽(省事但有代价)廉洁原始值 +1,被引擎
> `amplify()`(幅度 <3 放大到 3-6 同号)放大为 +3~+6,导致「睁一只眼闭一只眼」
> 反而奖励廉洁。修正为 −2 并对全部 30 场景做槽位符号模式扫描(0 违例)后,
> 第三次全量重跑 19,500 玩家 —— **本文所有数字均来自最终代码的最终数据,
> 代码/数据/审计三者一致**。

## 玩家行为分布(诉求5/6 的宏观证据)

晋升次数均值(每难度 × 策略 1,625 名,最终数据):

| 难度 | good | mixed | random | bad |
|---|---|---|---|---|
| easy | 4.08 | 3.98 | 3.72 | 2.06 |
| normal | 3.85 | 3.57 | 3.10 | 1.14 |
| hard | 2.92 | 2.80 | 2.16 | 1.00 |

- 好好玩家全部 GREAT(4,875/4,875,100%),晋升次数 easy>normal>hard —— 难度对晋升成本的影响真实生效
- 堕落玩家落马率 100%(4,875/4,875):bad 策略每步最大化
  `politics+execute+network−integrity×1.5`,持续选压廉洁的选项使廉洁归零,
  `(100−廉洁)×难度系数` 在任意难度都 ≥75 → 落马,与 `ending.ts` 阈值机制完全一致
  (v1 mock 效果较弱时为 easy 55%→hard 98%;v2 场景单元的负槽位更狠,端点策略必然落马)
- mixed 玩家 99.98% GREAT/GOOD(4,874/4,875,1 人 MID);random 玩家
  67.7% GREAT / 24.0% GOOD / 8.3% MID/BAD
  (random 落马 easy 0 → normal 11 → hard 66,难度系数真实生效)
- 已知注记:random 玩家在 mock 效果分布下偏 GREAT(罐装效果多为正和,
  good/mixed 玩家中盘起属性多顶格 100);真实 GLM 效果分布更分散
  (Phase 1 扫描中 random 局结局分布更广,见 diversity-report)

## 服务器侧结果(生产 DB 真实入库)

`rollout-server.db`(独立于生产 `guantu.db`,v2 重跑后全量数据):

- **visits: 994,501 条,19,501 个独立 IP**(19,500 玩家 + driver 健康检查);
  峰值 32,383 req/min,**HTTP 4xx/5xx = 0**(限流器未触发 —— 每玩家独立 IP 桶)
- sessions: 19,500 started / 19,500 ended(通关率 100%),平均对局时长 6.3s
- choices: 468,000 条逐选择明细(每步事件标题/选项/效果/属性/职级)
- llm-proxy: 487,500 次调用(19,500 局 × 25 次),全部 0 解析错误
- 慢路径实测:`/api/track/end` 峰值 34ms、`/api/track/choice` 均值 <1ms
  (峰值 227ms 一次,为 SQLite 批量落盘的偶发抖动);`/api/stats` 一次全量聚合 3.9s
  (仅在 46.8 万行 choices 上的管理端冷查询,非玩家路径)

## 压测(autocannon,8 worker 集群,独立 DB)

| 场景 | 并发 | 20s 请求数 | p50 | p99 | 错误 |
|---|---|---|---|---|---|
| S1 静态首页 | 200×20s | 454,376 | 8ms | 18ms | **0** |
| S2 静态三件套 | 200×20s | 151,188 | 25ms | 53ms | **0** |
| S3 真实用户API流水线 | 200×20s | 186,651 | 10ms | 107ms | **0** |
| S4 峰值脉冲 | 500×10s | 99,163 | 31ms | 206ms | **0** |

报告:`data/loadtest-report.json`(与 Phase 1 同口径复测)。

**压测暴露并修复的一处真实容量缺陷**:S3 流水线每轮以 `GET /api/stats`
收尾,而 `stats()` 要在 visits 表(压测中累积到 ~47 万行)上做多组
无索引聚合,`node:sqlite` 同步执行会阻塞 worker 事件循环 ~1.2s ——
首测 S3 仅完成 1,188 个请求(p50 885ms、p99 17.2s),玩家路径本身
只有 0.2-0.6ms。修复:`server/tracker.js` 给 stats 结果加 10s TTL
缓存(面板容忍秒级陈旧,`generatedAt` 如实标注;`STATS_TTL_MS` 可调),
单测/集成测全绿后复测,上表即修复后数字 —— S3 吞吐 **156 倍**
(1,188 → 186,651),p99 从 17,195ms → 107ms;残余的 max≈2.2s 是
每 worker 每 10s 一次的冷聚合(同步 SQLite 无法避免),已不影响 p99。

## 复现

合入前全量 gate(最终代码,typecheck ✓ / vitest 127/127 ✓ / build ✓
(dist 253.90KB gzip 84.91KB)/ Playwright E2E 3/3 ✓,截图存
`data/e2e-final-results/`):

```bash
# 全量 rollout(实测 1,962s ≈ 33 分钟)
NODE_OPTIONS=--experimental-sqlite npx tsx scripts/mass-rollout.mts
# 独立复核(从轨迹重算全部指标)
NODE_OPTIONS=--experimental-sqlite npx tsx scripts/rollout-recheck.mts
# 压测
npm run build && npm run loadtest
# 审计结论汇总
NODE_OPTIONS=--experimental-sqlite node scripts/rollout-audit-collect.mjs
```

## 39 组合 subagent 审计结论

**39/39 PASS,0 真实违例。** 每组合一个独立审计 subagent(共 39 个),双层审计:
(A)全量 500 人 SQL 机械核验 + 30 人独立脚本重算(29 个组合自发加做了
**全量 500 人**从原始 JSONL 的不信任式重算);(B)16 人 × 24 步逐字深读,
结局阈值/职级阶梯/属性数学全部亲手验算。合计深读 624 人 / 14,976 步全文。

| 部门 \ 难度 | easy | normal | hard |
|---|---|---|---|
| 委办 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 府办 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 组织部 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 纪委 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 发改委 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 财政 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 宣传部 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 统战 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 政法 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 教育 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 科技 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 政协 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |
| 人大 | PASS(16人深读) | PASS(16人深读) | PASS(16人深读) |

审计员共同确认的正确性证据(抽样):衔接引用与真实上一步标题
11,500/11,500 精确一致;全库次高相似度远低于阈值(标题 0.18/阈 0.55,
正文 0.40、选项 0.50/阈 0.8);12000 步 clamp(prev+effect) 数学 0 偏差;
晋升 100% 落在考核步且廉洁<35 时被 INTEGRITY_GATE 暂缓(多个组合亲眼验证
bad 玩家晋升被冻结);边界案例(廉洁 69 差 1 分判 GOOD、廉洁恰 35 放行、
p449 廉洁 34 后晋升戛然而止)全部与引擎阈值一致。

**审计驱动的一处真实修复**:v2 审计中 fuban-easy/weiban-hard 两个审计员
独立发现场景 1/3 D 槽廉洁 +1 经 amplify() 放大为 +3~+6(「睁一只眼闭一只眼」
反而加廉洁)。修复(→−2)+ 全库槽位符号扫描 + 第三次全量重跑后,
v3 审计(keji-easy 等)确认「A-D 槽位效果符号无倒挂」。

**审计员遗留的产品级观察(均判定非违例,已如实记录在
`data/rollout-audit/*.md`,建议接真实 GLM 后重点回归)**:
1. 衔接语为固定模板句「承接『上一步标题』的余波」——机械衔接 100% 正确,
   但 desc 多为独立罐装场景,剧情级因果承接弱(真实 GLM 的衔接已由
   Phase 1 diversity-report 单独验证为强承接);
2. 选项文案取自四原型槽位池,偶与具体场景语义错位(防汛场景出现
   「收下购物卡再说」);hint 四句每步重复且不在现有去重口径内;
3. 跨玩家叙事流逐字节相同(mock 确定性取景,口径内豁免);
4. 游戏平衡:easy 下 good/mixed 中盘属性顶格(fuban-easy 组合 219/500 人第 12-24 步
   四维全满,good 125 + mixed 88 + random 6)、
   random 偏 GREAT;hard 下 MID2 数学不可达;政协 3 级阶梯下晋升无区分度;
   ending.ts ≥4 晋升一律「平步青云」使 MID/GOOD 结局语调矛盾;
5. 同局 NPC 同名不同身份(刘志强副局长↔纪检组长)、场景池与部分部门
   (政协)语境不贴合。

## 数据资产清单

| 文件 | 内容 | 大小 |
|---|---|---|
| `data/rollout.db` | players(19,500)+ steps(468,000)+ audits(39) | ~39MB |
| `data/rollout-server.db` | 生产路径 sessions/choices/visits | ~465MB |
| `data/rollout-traj/*.jsonl` | 39 组合 × 500 行全量轨迹(每行一玩家 24 步全文,已按 playerIdx 排序) | ~526MB |
| `data/rollout-summary.json` | 全局/分组合汇总(recheck 口径) | 28KB |
| `data/rollout-audit/` | 39 组合审计 JSON+MD | - |
| `data/rollout-audit-summary.json` | 审计汇总 | - |

---

## 附录:v4 全量重跑(2026-08-22,E4 晋升平衡调优)

> 本报告正文为 v3(2026-08-21,hard 成本系数 1.3)。本附录为 append-only 增量,
> 不改正文;v3 分布快照已存 `data/promo-balance/old-dist-by-combo.csv`。

**起因与改动**:用户观察「有的情况下十分难以晋升」。E4 分析(上界模拟 200 种子
× 39 组合 + v3 数据定位)证实 hard 下最优/good 玩家 24 步点数预算恒 ≈101,而
系数 1.3 时所有 ≥5 级阶梯部门第 4 次晋升累计成本 ≥106 —— 完美发挥也差 5 分,
hard good 在 12 个 L≥4 部门精确 3.00、全库 0 人超过 3 次晋升,晋升星级失去
区分度。改动:`src/engine/promotion.ts` `DIFFICULTY_FACTOR.hard` 1.3 → **1.2**
(单行;easy/normal 与 ending.ts 的独立难度系数不动)。

**v4 重跑结果**(同 driver、同生产路径,1,942s):

| 指标 | v3 | v4 |
|---|---|---|
| 完成 / 达标 | 19,500 / 19,500 | 19,500 / 19,500 |
| 六诉求 11 项计数 | 全 0 | 全 0 |
| recheck drift | 0 | 0 |
| 结局分布 GREAT/BAD/GOOD/MID/MID2 | 13,008/4,952/1,212/325/3 | **完全相同** |
| easy/normal 26 组合终局分布 | — | **与 v3 逐组合零变化** |
| hard good/mixed/random/bad 均值 | 2.923/2.802/2.164/0.997 | 3.156/2.896/2.383/0.999 |
| hard good 五星部门(委办/组织部/纪委) | 恒 3.00 | **4.00**(125 人全员) |
| hard 晋升 4 次人数 | 0 | 386(good 378 + mixed 8) |
| 组织部 hard 秩次分布(1/2/3/4) | 125/77/298/0 | 125/32/217/126 |
| SUM(promoted) | 55,880(11.95%) | 56,772(12.13%) |
| 服务端请求 | 994,501(19,501 IP),0 错误 | **994,501(19,501 IP),0 错误**(峰值 32,029 rpm) |

**审计**:v3 的 39 组合全量审计(624 人逐字深读,0 真实违例)归档于
`data/rollout-audit/`(汇总 `data/rollout-audit-summary.json`);v4 按
`docs/audit-prompt-template-v4.md` 对行为实际变化的 3 个组合(委办/组织部/发改委
× hard)定点深审,结论在 `data/rollout-audit-v4/`。

完整机制推导、方案取舍与图表见
[experiments/exp-promotion-balance.md](experiments/exp-promotion-balance.md)。

(正文「数据资产清单」表中 `rollout.db` 的 audits 行数现为 3(v4 定点);39 份
v3 审计文件本身仍完整存于 `data/rollout-audit/`。)
