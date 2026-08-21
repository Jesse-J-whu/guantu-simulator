# 宣传部 · hard(combo_id=20)轨迹审计摘要

- 结论:**PASS** —— 500 名玩家全部完成,六大诉求 0 违例,无审计器误报需要豁免。

## A. 全量机械核验(SQL,data/rollout.db,combo_id=20)
- players=500,completed=500,meets_requirements=500,steps_done 全部 24,playerIdx 0..499 无缺失。
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered /
  attr_not_applied / rank_residual / illegal_rank_change / llm_errors —— **全部 SUM=0**。
- 结局×策略分布(诉求5/6):
  - good 125 → 全 GREAT,晋升恒 3 次(min=max=3)
  - bad 125 → 全 BAD,晋升恒 1 次
  - mixed 125 → 全 GREAT,晋升 2-3 次(均 2.888)
  - random 125 → GREAT 81 / GOOD 35 / MID 3 / BAD 6,晋升 0-3 次
- 难度梯度:宣传部平均晋升 easy 3.498 > normal 3.022 > hard 2.246,
  与 promotion.ts DIFFICULTY_FACTOR{0.8/1.0/1.3}方向一致,hard 明显更难升。
- 附注:players.final_rank 存的是职级名(字符串),对它做 AVG 得 0 是查询口径问题,非数据错误。

## B. 独立重算(不信 DB,直接啃 JSONL,按行内 playerIdx 字段取样)
- 模板 30 人抽样(0-7/120-127/360-367/490-495):checked 30,violations 0
  (标题 bigram≥0.55、泛化标题、正文≥0.8、选项≥0.8、clamp(prev+effect)、职级跳变)。
- 扩展到全量 500 人,再加六项检查,共 0 违例:结局按 ending.ts 阈值手工重算
  (hard:BAD=(100-廉)*1.3≥75;GREAT=廉≥70 且均分≥60 且 rank≥2)、每选项至少 1 项非零效果、
  policy==['good','bad','random','mixed'][idx%4]、promotions 计数、finalRank 对照
  departments.ts 阶梯「科员/副科级/正科级/副处级/正处级」、effectsApplied==所选选项 effect、
  衔接语引用的上一步标题真实存在、年份 2016-2039 连续。

## C. 逐字深读(16 人 × 24 步全读,四策略 × 首/中/尾)
抽样 idx {0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499}。
每人:衔接 24/24 非空、标题/正文/选项一局内零雷同、属性数学通过、
rankAfter 仅 promoted=true 时 +1、finalRank 与阶梯一致、结局逐人手工验算全部正确
(如 #1 bad 廉0→(100-0)*1.3=130≥75→BAD 正确;#250 random 廉67<70→GOOD 而非 GREAT 正确)。
晋升节奏 1-3 次/24 步,good 玩家稳定在 S6/S12/S18 前后晋升,非 0 非满,体验达标。

## 发现(产品质量观察,不计违规)
1. **衔接语是固定模板**:第 2-24 步全部为「承接「上一步标题」的余波,事情还没完」,
   引用的标题真实存在,但正文多为全新场景、无实际剧情承接。最弱证据:#0 step 6
   (称承接「信访群众围堵办公楼」,正文却是老科长泡茶托付场景,零承接)。属 mock 罐头文案,
   口径说明已豁免跨玩家雷同;建议真实 LLM 版把 desc 写成真承接。
2. **选项文案与场景语义错位**(约 1/3 步骤):如《空缺的副科长职位》配「先停职检查再定性/
   建议列入下期议程」,《老科长退休托付》配「如实上报数据口径」。标题与正文同属一个场景单元(合规),
   仅选项文案来自按 tag 的通用池。
3. bad 策略偶发选廉洁正分选项(#1 S18、#101 S7、#449 S11/S18),为策略启发式所致,
   结局分布不受影响(125 名 bad 全 BAD)。

## 产出
- 明细:data/rollout-audit/xuanchuanB-hard.json(verdict/violations/16 人深读记录)
- 本文件:data/rollout-audit/xuanchuanB-hard.md
