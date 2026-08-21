# 轨迹审计报告:科技部门 / normal(combo_id=31)

**verdict: PASS** · 500/500 完成 · 六大诉求机械核验 0 违例 · 独立重算 0 违例 · 深读 16 人 0 违例

## A. 全量机械核验(SQL,data/rollout.db)
players/completed/meets=500/500/500;continuity_missing、title_dup、choice_dup、desc_dup、generic_titles、attr_zero_offered、attr_not_applied、rank_residual、illegal_rank_change、llm_errors、track_failures 全部为 0;steps 表 12000 行 continuity_ok/attr_nonzero 均满额、选项恒 4、rank_fixes=0。晋升只出现在考核步 3/6/9/12/15/18/21/24(=REVIEW_INTERVAL 3)。DB↔JSONL 交叉核对 500↔500,ending/finalRank/promotions/policy 0 不一致。

**分布(诉求5/6)**:good 125→GREAT×125(晋升均值4.00);bad 125→BAD×125(1.12);random 125→GREAT79/GOOD31/MID15(3.10);mixed 125→GREAT×125(3.88)。科技部门跨难度晋升均值 easy 3.50 > normal 3.03 > hard 2.25,符合 promotion.ts 系数。mixed 全 GREAT:罐装效果幅度下 bias 0.25~0.75 触达不了差结局,分布偏乐观,非违规。

## B. 独立重算(从原始 JSONL,不信 DB)
30 人抽样(0-7/120-127/360-367/490-495,每策略≥7,按行内 playerIdx 字段取样):**checked 30, violations 0**(标题/正文/选项重复、generic、clamp 属性数学、职级跳变全 0)。附加全量 500 人重算(含 idx%4 策略映射、每卡效果≥1 非零、结局阈值手算、finalRank 对照 科员/副科级/正科级/副处级/正处级 阶梯):**violations 0**。

## C. 逐字深读 16 人(每人 24 步全部读完)
`0,1,2,3 / 100,101,102,103 / 250,251,252,253 / 448,449,498,499`(四策略×首/中/尾)。
每人衔接 24/24、属性数学通过、职级通过、结局手工验算正确。验算示例:
idx250 廉洁32/均分62.75/rank3 → 风险68<75 非 BAD、廉洁<50 非 GOOD、廉洁<35 但
rankRatio 3/4≥0.5 → MID 正确;idx1/101/253/449 廉洁 0 → 风险 100≥75 → BAD 正确。

## D. 质量观察(不构成六大诉求违规)
1. 衔接语模板化:第 2-24 步全是「承接「上一步标题」的余波,事情还没完。」同一句式,
   所引标题均真实存在,但 desc 多为新场景,剧情级承接弱(罐装 30 单元接缝)。
   最弱示例:idx0 step13(防汛值守)对 step12(检查组)无任何剧情承接。
2. 同局 NPC 角色漂移:王建国(领导↔投标商 s21)、张卫东(施工老板 s3↔财政 s19↔介绍人 s23)、
   陈明理(信访代表 s5↔老同学 s10↔村支书 s15)、刘志强(副局长 s4↔纪检组长 s24),
   同一玩家一局内同名人物身份矛盾。
3. 选项原型固定:每步 4 选项恒映射 稳妥/程序/关系/省事,hint 标签复用,最优解恒为 C1。
4. 500 人共用同一 24 单元序列与相同标题/正文/选项(mock LLM 预期,跨玩家雷同不算违规;
   真实多样性已由 Phase 1 的 29 局真 API 扫描单独验证,见 docs/diversity-report.md)。

## 结论
500 人全量机械核验、30 人独立重算(外加全量 500 人扩展重算)、16 人 384 步逐字深读均 0 违例;
结局/晋升/属性/职级全部与 departments.ts / promotion.ts / ending.ts 一致。判定 **PASS**。
观察项(NPC 角色一致性、衔接模板化)建议真实 LLM 接入后复查。
