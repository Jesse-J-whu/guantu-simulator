# 审计报告 combo26 政法委(zhengfaB)/hard — verdict: PASS(0 违规)

- 数据源:data/rollout.db(combo_id=26)+ data/rollout-traj/zhengfaB-hard.jsonl(500 行,行号==playerIdx,另按行内 playerIdx 字段过滤取样)
- SQL 全量:players=500 completed=500 meets_requirements=500;continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/llm_errors 全部 SUM=0
- 分布健全性:good→GREAT 125(均 3 晋升);bad→BAD 125(廉洁归零,(100-0)×1.3=130≥75,均仅 step9 晋升后止步);mixed→GREAT 125(2-3 晋升);random→GREAT82/GOOD33/MID6/BAD4。同部门晋升均值 easy 4.066 > normal 3.108 > hard 2.286,难度梯度正确
- 30 人独立重算(npx tsx,引用 src/engine/dedup.ts:titleSimilarity≥0.55 / isGenericTitle / similarity≥0.8;取样 0-7,120-127,360-367,490-495,good7/bad7/random8/mixed8):0 违规
- 全量 500 人不信任式重算:属性夹取 clamp(prev+effect) 12000 步 0 偏差;职级 promoted?+1:不变 0 违例;ending.ts 阈值重算 0 不符;finalRank 与 departments.ts 阶梯(科员→副科级→正科级→副处级→正处级→副厅级)0 不符;promotions 计数 0 不符;单局内 desc 全文重复 0;JSONL↔DB(ending/promotions/final_rank)0 不符
- 深读 16 人(0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499)× 全部 24 步逐字:衔接 24/24 非空且引用真实上一步标题;全部晋升均落 step%3==0;BAD 玩家廉洁跌破 35 后晋升被 INTEGRITY_GATE 拦截(p253 step10 恰为 35 时放行,边界正确);结局手算全部吻合(含 p2/p102 rank=2 压线 GREAT、p499 终步 clamp 至 {100,100,97,100})
- 审计方误报甄别:首轮 checker 60 条 STEP-GAP/YEAR-SKIP 系我方脚本 0-based 初始化错误(数据实为 step 1..24 / year 2016..2039),修正后 0;非数据缺陷
- 发现 1(设计观察,非违规):500 人共用逐字相同的 24 场景序列与开场白,场景未按 seed 洗牌——mock 管线确定性抽取,跨玩家重复按口径属预期;单局内 24 标题/24 desc 均无重复
- 发现 2(设计观察,非违规):选项文案为 CHOICE_BANK 四槽通用文本,个别选项与场景正文不贴(如「老科长退休托付」下的「如实上报数据口径」),四条 hint 每步原样重复;effect 绑定场景+槽位,未发现语义反转
- 结论:500/500 完成、六诉求 SQL 全 0、30 人独立重算 0、全量重算 0、16 人深读 0 → 0 真实违规,PASS
