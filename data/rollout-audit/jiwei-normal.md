# 轨迹审计报告:jiwei/normal(纪委 · normal,combo_id=10)

**verdict: PASS** — 500 玩家全部完成,六大诉求全量零违例,深读 16 人无真实违规。

## A. 全量机械核验(SQL,data/rollout.db players WHERE combo_id=10)
- players=500,completed=500,meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors **全部 SUM=0**
- 独立重算(原始 JSONL,按 playerIdx 字段过滤,30 人:0-7/120-127/360-367/490-495):
  **checked 30, violations 0**(标题 bigram≥0.55 / 选项·desc 相似度≥0.8 / clamp 属性数学 / 职级跳变)
- 追加全量 500 人补充重算(npx tsx + python3):policy=mod4 规则全对、每人恰 24 步、
  continuity 全非空、每张选项卡 effect 至少 1 项非零、所选 effect==effectsApplied、
  **结局阈值按 ending.ts 亲手验算 500/500 一致**、finalRank 与 departments.ts 纪委六级阶梯
  (科员→副厅级)全对、promotions 计数与 promoted 步数全对 —— issues=0

## 分布合理性
| policy | 结局分布 | 晋升均值 |
|---|---|---|
| good | GREAT 125 | 5.00(全封顶) |
| bad | BAD 125 | 1.18 |
| mixed | GREAT 123 / GOOD 2 | 4.00 |
| random | GREAT 92 / GOOD 24 / MID 8 / BAD 1 | 3.63 |

跨难度对照(同 DB):mixed/random/bad 晋升均值 easy 4.94/4.36/2.19 > normal 3.99/3.46/1.18 >
hard 2.96/2.42/1.00,符合 promotion.ts 难度系数(0.8/1.0/1.3)与纪委晋升 5 星 0.88 折扣。

## B. 逐字深读(16 人 × 24 步全读)
抽样 idx {0,1,2,3, 100,101,102,103, 250,251,252,253, 448,449,498,499}(四策略×首/中/尾)。
每人:衔接 24/24 非空且回引真实存在的前一步标题;24 标题/24 正文/选项文案肉眼复核一局内零雷同;
属性数学(含 100 顶夹取与贴 0)全通过;职级仅在 promoted=true 时 +1;结局亲手验算全正确
(含 idx250 MID 边缘档:廉洁49∈[35,50)、idx102/498 GOOD 档:廉洁 68/51)。
晋升节奏:good 5 次(步3/6/12/18/24)、bad 1-2 次(廉洁跌破 35 后晋升闸封死)、mixed 3-4、random 3-4。

## 非违规质量提示(均为 server/mockLLM.js 罐装替身的已知设计,非引擎缺陷)
1. **衔接模板化**:第 2-24 步衔接语均为「承接『上一步标题』的余波,事情还没完。」——回引标题
   真实存在,但 desc 开启全新剧情线,无实质情节承接。最弱一步:idx0 step9(衔接『网络舆情』
   实为副科长空缺新剧情)。真实 GLM 衔接能力已在 Phase 1 用 29 局真 API 单独验证。
2. **选项与场景解耦**:选项文案来自 4 槽×24 条 CHOICE_BANK 按步轮转,存在语义错配
   (『空缺的副科长职位』配"先停职检查再定性"、『防汛值守第一夜』配"收下购物卡再说")。
   标题与正文主题一致性完好,效果数值按场景槽位语义供给,代码注释已声明此替身设计。
3. NPC 姓名跨场景复用且职务漂移(陈明理=信访代表/老同学/村支书;张卫东=施工方老板/财政负责人/介绍人)。
4. good 策略全 5 晋升封顶、后期属性全 100 夹取无变化 —— normal 难度对最优玩法已饱和。

## 结论
六大诉求(完成度/衔接非空/一局内标题·选项·正文不重复/属性数学/职级与晋升/结局评级)
在 SQL 全量、30 人独立重算、500 人补充重算、16 人逐字深读四个层面交叉验证,均零违例 → **PASS**。
