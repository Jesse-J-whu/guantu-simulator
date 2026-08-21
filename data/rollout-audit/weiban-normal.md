# 轨迹审计报告:委办(党委办公室) · normal(combo_id=1)

**verdict: PASS** — 500 玩家全部完成,六大诉求 0 违例,深读 16 人无真实问题。

## A. 全量机械核验(SQL,players WHERE combo_id=1)
- players=500,completed=500,meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors / track_failures —— 全部 SUM=0
- steps 表:12000 行,continuity_ok=12000,attr_nonzero=12000,rank_fixes=0,promoted 步 1702;500 个不同 seed/sessionId/IP;时长 6218–8598ms(均值 6822)

### 策略×结局分布(梯度正确:good 全 GREAT、bad 全 BAD,中间策略居中)
| policy | ending | n | 晋升均值(区间) |
|---|---|---|---|
| good | GREAT | 125 | 5.0(5–5) |
| bad | BAD | 125 | 1.168(1–2) |
| mixed | GREAT/GOOD | 123/2 | 4.0(3–5) |
| random | GREAT/GOOD/MID | 85/27/13 | 3.5(3–4) |
- normal 无 random-BAD:随机策略最低廉洁 34,风险=(100−34)×1.0=66<75,合理
- 难度梯度符合 promotion.ts:weiban 晋升均值 easy 4.118 > normal 3.404 > hard 2.336

### 独立重算(npx tsx,按 playerIdx 字段取人,不依赖 DB)
- 抽样 idx 0-7/120-127/360-367/490-495 共 30 人:**0 违例**(标题 bigram≥0.55 / desc≥0.8 / 选项跨步+步内≥0.8 / clamp(prev+effect) / effectsApplied==所选 / 每选项≥1 非零 / 职级仅 promoted+1 / 晋升全程重放 / 结局重算)
- 样本内最大相似度:标题 0.182、正文 0.404、选项 0.500 —— 均远低于阈值
- 脚本实际重放重算全量 500 人同样 0 违例;DB↔JSONL 全字段比对 0 不一致

## B. 逐字深读(16 人 × 24 步,{0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499})
- 衔接 24/24:continuity 均非空且引用的上一步标题真实存在(开局句豁免);局内无重复:24 标题/24 正文/选项肉眼复核无雷同,标题-正文同场景单元
- 属性数学逐笔通过,含 0/100 夹取边界(如 p449 廉洁 6→2→0→0)
- 职级:仅 promoted=true 时 +1;finalRank 对阶梯(科员/副科级/正科级/副处级/正处级/副厅级)全部一致
- 结局手工验算 16/16 正确,含 p250(random/MID:风险 54<75、廉洁 46<50、≥35→MID)这一全局仅 13 例的中间档,分档无误

### 质量备注(非违规,mock LLM 罐头库局限,跨玩家重复按口径不计)
1. continuity 为固定句式「承接「X」的余波,事情还没完」——引用真实但模板化,desc 之间无因果承接,故事连续性弱
2. 个别选项文案与场景错位:座次牌场景配「引入审计专项核查」、果篮信封场景配「先试点再推开」等(选项库换洗所致)
3. good 策略 125 人全部恰好 5 次晋升封顶,分布高度聚拢(策略设计使然,供产品参考)

**结论**:数据一致、规则引擎(属性/晋升/结局)全部验算无误,本组合通过审计。
