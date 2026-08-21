# 轨迹审计摘要 — zuzhiB/normal(组织部 · normal,combo_id=7)

**verdict: PASS**(500 玩家全部完成,六大诉求 0 违例;2 条体验观察非硬违例)

## A. 全量机械核验(SQL,players WHERE combo_id=7)
- players=500,completed=500,meets_requirements=500,steps_done 全 24,steps 表 12000 行,bgOk 全真,session_id 无重复
- continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/llm_errors **十项 SUM 全 0**
- 分布:good=125 全 GREAT(晋升均值 5.0,全副厅级);bad=125 全 BAD(均值 1.17,副科/正科);mixed=125 全 GREAT(3.98);random=GREAT87/GOOD23/MID13/BAD2(3.41)。无 bad 全 GREAT 类异常;`AVG(final_rank)=0` 是文本列类型问题,非异常

## 独立重算(不信 DB,直接读 JSONL;取样按行内 playerIdx 过滤)
- **30 人抽样**(idx 0-7/120-127/360-367/490-495):checked=30,violations=0;policy 与 idx%4 全匹配
- **升级为全量 500 人重算**:属性 clamp 数学(12000 步×4 属性)、职级跳变(promoted 才 +1)、finalRank 对 ladder ['科员'…'正厅级']、选项卡 effect==effectsApplied、每卡≥1 非零效果、continuity 非空、promotions 计数、晋升廉洁闸(<35 不得晋升)、**结局按 ending.ts 规则重算** —— 全部 **0 违例**

## B. 逐字深读(16 人 × 24 步全读,idx 0-3/100-103/250-253/448/449/498/499)
- 16 人结局手工验算全对,例:p0 GREAT(廉100/均分100/rank5)、p1 BAD(廉0→风险100≥75)、p498 GOOD(廉54/均分50/rank3,均分<60 故非 GREAT)、p449 BAD 2 晋升 rank2 正科级,evalText 晋升分档文案与实算一致
- 每人 24 标题/正文/选项互不重复(肉眼复核与机械结论一致),标题与正文同属一个场景单元,衔接语提及的上一步标题全部真实存在

## 发现(体验风险,非本批硬违例;均为 mock 罐装池既定产物,真实 GLM 前需复验)
1. **衔接模板化**:step2-24 continuity 全为同一句式「承接『X』的余波,事情还没完。」,desc 多为独立新场景,与上一步无实质剧情承接(如 p0 step4 方案之争→step5 信访围堵);仅人物复用与 step12/24 的档案暗线提供弱连续性
2. **选项文案与场景语义错位**:选项取自固定四原型池(提示语恒定),常与场景脱节 —— step9 副科长空缺给「先停职检查再定性」、step14 座次牌给「引入审计专项核查」、step15 扶贫村给「主动说明情况配合调查」、step23 送果篮给「先试点再推开」;NPC 角色漂移(陈明理=信访代表/老同学/村支书,张卫东=施工老板/财政干部/介绍人)

## 结论
硬性合规层面 500 人零违例,PASS;上述两条观察建议在接入真实 GLM 后作为验收重点(衔接承接与选项-场景匹配)。
