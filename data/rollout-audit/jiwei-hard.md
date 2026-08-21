# 轨迹审计报告:jiwei/hard(纪委 · hard,combo_id=11)

**verdict: PASS** —— 500 玩家全部完成,六大诉求 0 违例,16 人逐字深读通过。

## A. 全量机械核验(SQL,players WHERE combo_id=11)
- players=500,completed=500,meets_requirements=500,bg_ok=500;playerIdx 0..499 去重恰 500,且 policy=idx%4 全对(取样按行内 playerIdx 字段过滤)
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors / track_failures —— **全部 SUM=0**,违规玩家行集为空
- steps 表交叉验证:12,000 行(500×24),rank_fixes 合计 0;1,173 次晋升全部落在考核步(step%3==0),非考核步晋升 0 次

## 独立重算(不信 DB,npx tsx 从原始 JSONL 重算)
- 30 人抽样(0-7/120-127/360-367/490-495,每策略 ≥7):**0 违规**;标题 bigram max 0.18(阈 0.55)、选项相似度 max 0.50(阈 0.8)、正文相似度 max 0.40(阈 0.8);衔接所引上一步标题全部真实存在
- 加验全量 500 人:**0 违规**;clamp(prev+effect)=attrsAfter 全对、所选效果=effectsApplied 全对、结局按 ending.ts(hard 1.3)独立验算 0 错、finalRank 对照纪委阶梯 0 错、年份逐年+1 全对

## 分布与晋升节奏(诉求 5/6)
- bad→BAD 125;good→GREAT 125;mixed→GREAT 125;random→GREAT 90 / GOOD 25 / MID 7 / BAD 3(good 全 GREAT、bad 全 BAD,符合)
- 晋升均值 good 3.00 / mixed 2.96 / random 2.42 / bad 1.00;同部门 easy > normal > hard(good 5.00/5.00/3.00、bad 2.19/1.18/1.00),与 promotion.ts hard 系数 1.3 一致
- bad 玩家第 9 步后廉洁跌破 35,INTEGRITY_GATE 暂缓其后全部考核步晋升(idx1/101/253/449 均 1 晋收场)
- 边界样本 idx102:廉洁 69(<70)正确判 GOOD 而非 GREAT,阈值执行无误

## B. 逐字深读(16 人 × 24 步全读:0-3/100-103/250-253/448/449/498/499)
每人核验:衔接非空且所引上一步标题真实存在;一局内标题/正文/选项无雷同;每选项 ≥1 项非零效果且真实入账;rank 仅 promoted 时 +1 且必在考核步;finalRank 与阶梯一致;结局亲手验算全部正确;evalText 数字与终态一致。**0 违规**。
**衔接最弱一步(全员同型)**:step13「防汛值守第一夜」紧接「检查组明天到」,仅靠模板语「承接「X」的余波」串联,desc 无实质剧情承接。

## 审计员假阳性说明(非数据问题)
- 重算脚本首版把数值 rank 与字符串 finalRank 直接比较,误报 30 条 FINALRANK;经 LADDER 映射后复跑为 0,属脚本缺陷。

## 观察与建议(不计违规,口径已豁免跨玩家重复)
1. **叙事流逐字节相同**:500 玩家的 24 标题/正文/选项序列完全一致(mock 30 单元池固定用前序 24 个、顺序不随机);玩家差异只来自效果种子抖动与策略。
2. **衔接语单一模板**:11,500 个非首步全为「承接「X」的余波,事情还没完。」。
3. **选项文案与场景松散匹配**:CHOICE_BANK 按步轮换,如 idx0 step5 信访围堵配「与竞争者私下沟通」、step13 防汛值守配「收下购物卡再说」;四槽 hint 固定复用。
4. **结局零方差**:good 125/125 恰 3 晋全 GREAT;bad 125/125 廉洁归零全 BAD——mock+策略的确定性行为,建议接真实 LLM 后复测多样性。

产物:data/rollout-audit/jiwei-hard.json(含 16 人逐条深读记录)
