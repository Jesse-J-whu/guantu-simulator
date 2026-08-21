# 轨迹审计摘要:zuzhiB/hard(组织部 · hard,combo_id=8)

**verdict: PASS** | 违规数:0 | 深读玩家:16 | 独立重算:30人0违例(+全量500人0违例)

## A. 全量机械核验(SQL, data/rollout.db players WHERE combo_id=8)
- players=500, completed=500, meets=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors **全部 = 0**
- steps 表 12000 行(500×24),bad steps=0;promoted 步数 1173 == SUM(promotions) 1173,逐人无失配
- 分布:good 125 全 GREAT(均3.0晋升);bad 125 全 BAD(均1.0);mixed 123 GREAT+2 GOOD(均2.97);
  random 80 GREAT+42 GOOD+2 BAD+1 MID(均2.42)。策略→选项hint相关性符合设计
  (good 全选程序/稳妥类,bad 94%选经营关系类,random 四类均匀)
- 难度梯度:zuzhiB 晋升均值 easy 4.39 > normal 3.39 > hard 2.35,与 promotion.ts
  难度系数(0.8/1.0/1.3)及组织部晋升5星折价方向一致

## B. 独立重算(不信 DB,直接从 JSONL)
- 模板要求 30 人抽样(idx 0-7/120-127/360-367/490-495,按行内 playerIdx 字段过滤):
  checked=30, violations=0(标题bigram/选项与正文相似度/零效果选项/continuity/
  clamp属性数学/职级跳变/promotions计数/policy==idx%4)
- 加做全量 500 人重算:checked=500, violations=0,额外核对
  finalRank 对照 departments.ts 七级阶梯、按 ending.ts 阈值(hard系数1.3)重算结局分档
- 坏路径样本核验:bad 玩家廉洁度归零后 (100-0)×1.3=130≥75 → BAD 正确;
  random P250 廉洁68,风险41.6<75、68<70 差 2 分落 GOOD,分档边界行为正确

## C. 逐字深读(16 人 × 24 步全读)
- 抽样 idx {0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499}(4策略×首/中/尾)
- 每人:衔接 24/24、属性数学通过、职级通过(晋升只发生在考核步 6/9/12/15/18/21/24)、
  结局验算全部正确(含 4 个 BAD、3 个 GOOD、9 个 GREAT)
- 一局之内 24 标题/24 正文/96 选项文案零雷同(肉眼复核与机械结论一致)

## 观察(非违例,如实记录)
1. **衔接语是公式化模板**:每步均为「承接「上一步标题」的余波,事情还没完。」;
   约半数相邻事件实为新开场,上一步事件不收尾(例:P0 step13「防汛值守第一夜」
   声称承接「检查组明天到」,检查组剧情此后永久消失)。连续性靠固定句式+固定人物班底
   (王建国/李淑芬/赵亚男/张卫东/刘志强/陈明理)维持,因果连续性弱——
   mock LLM 罐装场景单元的已知局限,真实多样性已在 Phase 1 验证(docs/diversity-report.md)
2. 全 500 人共用同一套 24 场景、同一顺序(跨玩家重复=mock 预期口径,一局内不重复才是要求,已满足)
3. 选项文案为四类原型(稳妥/程序/经营/省事)套场景,个别场景贴合弱
   (如防汛场景出现「收下购物卡再说」),属罐装选项模板的通病

## 结论
500/500 完成且六大诉求 0 真实违例;审计器数字与两次独立重算三方一致。
verdict=PASS。建议:接入真实 GLM 后重点复查剧情因果连续性与选项-场景贴合度。
