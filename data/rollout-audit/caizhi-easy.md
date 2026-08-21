# 审计报告:caizhi/easy(combo 15,财政部门,500 人)

Verdict: **PASS**(500/500 完成,六大诉求 0 违规)

## 机械核验(SQL,combo_id=15)
- players=500, completed=500, meets_requirements=500, bg_ok=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors / track_failures 全部 = **0**
- steps 表 12,000 行:choice_count 全 4、chosen_idx 全在界内、rank_fixes 合计 0、promoted 合计 1,750 且全部发生在 step%3==0 的考核步(非考核步晋升 0)、players.promotions 与步表 promoted 计数零错配
- 分布:bad→BAD 125(晋升 2.03±);good→GREAT 125(恰好 4 晋到顶);mixed→GREAT 124/GOOD 1;random→GREAT 91/GOOD 27/MID 7
- 难度梯度:晋升均值 easy 3.5 > normal 2.994 > hard 2.228,符合 promotion.ts(easy 系数 0.8)

## 独立重算(npx tsx,不信任 DB,按行内 playerIdx 取样)
- 模板 30 人样本 [0-7,120-127,360-367,490-495]:checked 30,violations **0**;最大相似度 title 0.18 / choice 0.5 / desc 0.4(阈值 0.55/0.8/0.8)
- 加做全 500 人:violations 0,结局重算错配 0,finalRank 错配 0,policy 错配 0
- 属性基线 50/50/50/80(easy 廉洁加成),clamp 逐卡复算一致;effectsApplied 与所选选项 effect 逐字段一致

## 逐字深读(16 人 × 24 步)
p0,p1,p2,p3,p100,p101,p102,p103,p250,p251,p252,p253,p448,p449,p498,p499 全部通过:
衔接 24/24、属性数学、职级阶梯、结局验算(手算对照 ending.ts)全部正确。
例:p1/p101/p253/p449 BAD(廉洁 0→风险 80≥75);p2 MID(廉洁 43,≥35 但 <50);p102/p498 GOOD(52/75、62/84.75);其余 12 人 GREAT。bad 玩家廉洁跌破 35 后被 INTEGRITY_GATE 停止晋升,卡在正科级,与 promotion.ts 一致。

## 质量观察(不计违规)
1. 衔接语为单一固定模板「承接「上一步标题」的余波,事情还没完。」,desc 本身多为自包含新场景:如 p0 step13「防汛值守第一夜」接「检查组明天到」,检查组线索未续写。机械口径(非空且引用真实标题)通过,剧情连续性弱。
2. 选项文案按四原型槽(稳妥/程序/关系/省事)取自通用池,偶与场景错位:「防汛值守第一夜」配「家宴款待关键人物」「收下购物卡再说」(p1/p2/p3/p498/p499 均如此选择);「空缺的副科长职位」配「先停职检查再定性」。hint/效果/策略自洽,仅文案答非所问。
3. 同局 NPC 名字跨角色漂移(张卫东:施工方老板→财政的人→饭局介绍人;王建国亦然)。
4. 跨玩家叙事逐字节相同(distinct 标题序列=1)、good/mixed 结局零方差——mock LLM 口径已豁免。
