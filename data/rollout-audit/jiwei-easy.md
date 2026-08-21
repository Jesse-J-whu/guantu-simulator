# 轨迹审计报告:jiwei/easy(纪委 · easy,combo_id=9)

**verdict: PASS** —— 500 玩家全部完成,六大诉求 0 违例,16 人逐字深读通过。

## A. 全量机械核验(SQL,players WHERE combo_id=9)
- players=500,completed=500,meets_requirements=500,bg_ok=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors / track_failures —— **全部 SUM=0**,违规玩家行集为空
- steps 表交叉验证:12,000 行(500×24),rank_fixes 合计 0;2,062 次晋升全部落在考核步(step%3==0),非考核步晋升 0 次

## 独立重算(不信 DB,npx tsx 从原始 JSONL 按 playerIdx 字段取样)
- 30 人抽样(0-7/120-127/360-367/490-495,每策略 ≥7):**0 违规**;标题 bigram max 0.18(阈 0.55)、选项相似度 max 0.50(阈 0.8)、正文相似度 max 0.40(阈 0.8)
- 加验全量 500 人:**0 违规**;clamp(prev+effect)=attrsAfter 全对、所选效果=effectsApplied 全对、结局按 ending.ts 独立验算 0 错、finalRank 对照 departments.ts 阶梯 0 错、policy=idx%4 全对

## 分布与晋升节奏(诉求 5/6)
- bad→BAD 125;good→GREAT 125;mixed→GREAT 124 / GOOD 1;random→GREAT 79 / GOOD 31 / MID 15(good 以 GREAT 为主、bad 全 BAD,符合)
- 晋升均值 good 5.00 / mixed 4.94 / random 4.36 / bad 2.19;同部门 easy > normal > hard(如 mixed 4.94/3.99/2.96),与 promotion.ts 难度系数及纪委晋升 5 星一致
- bad 玩家中后期廉洁跌破 35 触发 INTEGRITY_GATE 暂缓提拔(如 idx1/101/253 卡在正科级),与引擎设计吻合

## B. 逐字深读(16 人 × 24 步全读:0-3/100-103/250-253/448/449/498/499)
每人核验:衔接非空且所引上一步标题真实存在;一局内标题/正文/选项无雷同;每选项 ≥1 项非零效果且真实入账;rank 仅 promoted 时 +1;finalRank 与阶梯一致;结局亲手验算全部正确;evalText 数字与终态一致。
**衔接最弱一步(全员同型)**:step6「老科长退休托付」——上一步是「信访群众围堵办公楼」,两景仅靠固定衔接语串联,desc 无实质剧情承接。

## 观察与建议(不计违规,口径已豁免跨玩家重复)
1. **叙事流逐字节相同**:500 玩家的 24 标题/正文/选项序列、顺序、开场白完全一致(30 单元池固定用 24 个、顺序不随机);玩家差异只来自效果抖动与策略。
2. **衔接语单一模板**:11,500 个非首步全为「承接「X」的余波,事情还没完。」。
3. **选项四槽原型固定**(稳妥但费工/程序优先/经营关系/省事但有代价),文案为通用动作池,与当步场景仅松散匹配(如「会议室的座次牌」配「引入审计专项核查」)。
4. **结局零方差**:good 125/125 恰好 5 晋到顶(副厅级)全 GREAT;bad 125/125 廉洁归零全 BAD。
5. 文案小瑕疵:MID 结局可出现「4次晋升,平步青云」与「调任闲职」语气冲突(idx498),建议 promotionText 按 endingType 调整。

产物:data/rollout-audit/jiwei-easy.json(含 16 人逐条深读记录)
