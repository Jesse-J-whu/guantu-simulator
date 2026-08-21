# 轨迹审计报告:renda/easy(人大 · easy,combo_id=36)

**verdict: PASS** —— 500 玩家全部完成,六大诉求 0 违例,16 人逐字深读通过。

## A. 全量机械核验(SQL,players WHERE combo_id=36)
- players=500,completed=500,meets_requirements=500,bg_ok=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors / track_failures —— **全部 SUM=0**,违规玩家行集为空
- steps 表交叉验证:12,000 行(500×24),rank_fixes 合计 0;1,373 次晋升全部落在考核步(step%3==0),非考核步晋升 0;continuity_ok / choice_count≥2 / attr_nonzero 全部干净

## 独立重算(不信 DB,npx tsx 从原始 JSONL 按 playerIdx 字段取样)
- 30 人抽样(0-7/120-127/360-367/490-495,good7/bad7/random8/mixed8):**0 违规**;标题 bigram max 0.18(阈 0.55)、选项相似度 max 0.50(阈 0.8)、正文相似度 max 0.40(阈 0.8)
- 加验全量 500 人:**0 违规**;clamp(prev+effect)=attrsAfter 全对、effectsApplied=所选卡 effect 全对、衔接语「」引用==上一步标题 11,500/11,500、policy=idx%4 全对、promotions 计数全对
- 结局按 ending.ts 独立验算(easy 系数 0.8):**0 错**,分布 GREAT 323 / BAD 125 / GOOD 39 / MID 13 与 DB 完全一致;finalRank 对照 departments.ts 阶梯(代表/委员/副主任/主任)0 错

## 分布与晋升节奏(诉求 5/6)
- bad→BAD 125;good→GREAT 125;mixed→GREAT 123 / GOOD 2;random→GREAT 75 / GOOD 37 / MID 13(good 以 GREAT 为主、bad 全 BAD,符合预期)
- 晋升均值 good 3.00 / mixed 3.00 / random 2.99 / bad 1.99(阶梯 4 级,easy 封顶 3 晋);人大三难度 2.746(easy)>2.528(normal)>2.166(hard),与 promotion.ts 难度系数及晋升 2 星一致
- bad 玩家中后期廉洁跌破 35 触发 INTEGRITY_GATE 暂缓提拔(全员止步副主任,唯一例外 idx369 仅 1 晋止步委员),与引擎设计吻合

## B. 逐字深读(16 人 × 24 步全读:0-3/100-103/250-253/448/449/498/499)
每人核验:衔接非空且所引上一步标题真实存在;一局内标题/正文/选项无雷同;每选项 ≥1 项非零效果且真实入账;rank 仅 promoted 时 +1;finalRank 与阶梯一致;结局亲手验算全部正确(含 idx1/101/253/449 风险 80≥75→BAD、idx102 int42→MID、idx498 均分 71.5→GOOD 且 evalText"72 分"=round 一致);evalText 数字与终态一致。
**衔接最弱一步(全员同型)**:step13「防汛值守第一夜」——上一步是「检查组明天到」,两景无剧情交集,仅靠固定衔接语与人物班底串联。

## 观察与建议(不计违规,口径已豁免跨玩家重复)
1. **叙事流逐字节相同**:500 玩家的 24 标题/正文/选项序列、顺序、开场白完全一致(distinct=1);玩家差异只来自效果抖动与策略。
2. **衔接语单一模板**:11,500 个非首步全为「承接「X」的余波,事情还没完。」(引用本身 100% 真实)。
3. **选项四槽原型固定**(稳妥但费工/程序优先/经营关系/省事但有代价),文案为通用动作池,与当步场景仅松散匹配(如「空缺的副科长职位」配「先停职检查再定性」)。
4. **结局零方差**:good 125/125 全 3 晋到顶 GREAT;bad 125/125 廉洁归 0 全 BAD;random 0/125 BAD(easy 门槛需 int≤6.25,随机策略不可达)。
5. easy 下 good/mixed 约 S13 起属性顶满 100,后续正效果被 clamp 吞没属口径内正常。

产物:data/rollout-audit/renda-easy.json(含 16 人逐条深读记录)
