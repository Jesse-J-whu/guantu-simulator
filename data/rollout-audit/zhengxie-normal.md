# 轨迹审计:政协 / normal(combo_id=34)

verdict:**PASS** · 500 玩家 · 违例 0 · 深读 16 人 · 独立重算 30/30 通过(另做全量 500 人复算)

## A. 全量机械核验(SQL,data/rollout.db)
- players=500,completed=500,meets_requirements=500;continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/llm_errors/track_failures **全部 SUM=0**
- steps_done 全 24;steps 表 12000 行;bg_ok=500;session_id 500 个互异;policy 与 idx%4 映射 500/500 正确
- 分布:good→GREAT 125;bad→BAD 125;random→GREAT77/GOOD34/MID13/BAD1;mixed→GREAT122/GOOD2/MID1
- 晋升:good/random/mixed 均 2 次,bad 均 1.12(1-2);终职级 副主席389/常委111(阶梯仅 3 级,上限 2 次合理)

## B. 独立重算(npx tsx,按行内 playerIdx 字段取样,非行号)
- 模板 30 人样本(0-7/120-127/360-367/490-495):标题 bigram/选项与正文相似度/属性 clamp 数学/职级跳变,**0 违规**
- 额外全量 500 人去重重算:0 违规,continuity 空 0 条
- effectsApplied≡所选卡 effect(500×24×4 全等,夹取在 attrsAfter 生效);ending.ts 阈值重算 500/500 一致;finalRank 对照 departments.ts 阶梯(委员/常委/副主席)500/500 一致

## C. 逐字深读(16 人:0-3/100-103/250-253/448/449/498/499,每人 24 步全读)
- 属性数学、职级事实、结局验算 16/16 通过;结局边界案例 idx499:廉洁49 差 1 分未达 GOOD、按 ≥35 落 MID,判定正确
- 衔接:continuity 全非空且引用真实上一步标题,但为统一模板句"承接「X」的余波,事情还没完";desc 每步开启全新事件,承接是名义性的(最弱证据:idx0 step3,承接调研之名、实开购物卡新事)
- 文案不重复:一局内 24 标题/24 正文/选项文案肉眼复核无雷同(500 人同套罐装单元跨玩家重复,属口径豁免)

## 产品级观察(非六大诉求违例)
1. 选项文案取自四原型通用池,部分与场景脱节:防汛值守场景出现"收下购物卡再说"、老科长托付场景出现"如实上报数据口径"、扶贫村场景出现"主动说明情况配合调查"
2. good/mixed 玩家中局起属性饱和 100,后半局无可见成长(0..100 夹取正常)
3. bad 策略 125/125 全 BAD、无 MID2,结局分布对策略高度敏感

结论:本组合符合产品要求;上述观察建议反馈给文案/LLM 生成侧(场景化选项、衔接语多样化)。
