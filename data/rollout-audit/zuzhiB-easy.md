# 轨迹审计摘要 — 组织部(zuzhiB)/ easy(combo_id=6)

**verdict: PASS** · 500/500 完成 · 六大诉求违例 **0** · 深读 16 人(0/1/2/3, 100-103, 250-253, 448/449/498/499)

## A. 全量机械核验
- SQL(players WHERE combo_id=6):players=500, completed=500, meets=500;continuity_missing/title_dup/
  choice_dup/desc_dup/generic_titles/attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/
  llm_errors/track_failures **全部=0**;steps 12000 行,continuity_ok=12000,rank_fixes=0;policy 与
  playerIdx%4 零错配;bgOk 500/500;seed/ip 各 500 个互异。
- 独立重算(不信 DB):① npx tsx 引擎 dedup 函数重算 30 人(0-7/120-127/360-367/490-495,按
  playerIdx 字段取样)violations **0**;② python 从原始 JSONL 全量重算 **500 人** violations **0**
  (effectsApplied==所选 effect、每选项≥1 非零、clamp 数学、职级跳变、promotions 对账、
  ending.ts 阈值重判、finalRank 对照 departments.ts 阶梯)。

## 分布(诉求5/6)
good→GREAT 125/125(晋升 6.00,6-6,全部触顶正厅级);bad→BAD 125/125(2.13,2-3,廉洁<35 暂缓提拔);
mixed→GREAT 124+GOOD 1(5.05,4-6);random→GREAT 79+GOOD 34+MID 12(4.37,3-5)。
难度方向 easy>normal>hard 全策略成立(good 6.0/5.0/3.0;bad 2.13/1.17/1.0;random 4.37/3.41/2.42),
符合 promotion.ts 难度系数与组织部晋升 5 星(成本×0.88)。

## B. 逐字深读(16 人×24 步)
衔接 24/24 非空且衔接语引用的上一步标题均真实存在;一局内 24 标题/24 正文/96 选项文本零重复
(肉眼复核与机械一致);每选项≥1 非零且与 attrsAfter 全对账;仅 promoted 步 +1,finalRank 与阶梯
['科员'…'正厅级']全对;16 人结局全部亲手验算正确,含非平凡分支 player 102(廉洁 29<35 但
rankRatio 4/6≥0.5→MID)与 player 2(GOOD 档均分 75.75,evalText「76 分」=round 一致)。

## 观察与发现(非违例)
1. mock 完全确定性:500 人拿到同一 24 场景序列(全批仅 24 个标题、1 种序列,文案逐字节相同)。
   根因 server/mockLLM.js 按 (step-1)%30 取景且不做种子偏移(偏移会破坏一局内唯一性);跨玩家
   雷同属口径豁免,一局内 24 单元互不重复。
2. 衔接模板化:第 2-24 步衔接语均为「承接「上一步标题」的余波,事情还没完。」,desc 为独立场景、
   无实质剧情承接(最弱例:player 0 step 13 防汛值守承接「检查组明天到」);真实 GLM 衔接已在
   docs/diversity-report.md 单独验证(覆盖 100%、NPC 复用 94.2%)。
3. 选项提示语固定:每步 hint 恒为「稳妥但费工/程序优先/经营关系/省事但有代价」4 种策略槽位标签,
   不在标题/正文/选项文本三层口径内。
4. 数值高度集中:good 全员恰好 6 晋升触顶、bad 全员廉洁归 0 落马 —— mock 确定性+槽位效果语义
   绑定的必然结果;promotion.ts 期望优秀玩家 4-5 次,easy 下触顶 6 属轻微调参观察。

## 结论
全量机械核验 + 双路独立重算(30 人引擎函数级 / 500 人全量)+ 16 人逐字深读均零违例,zuzhiB/easy 判定 **PASS**;4 条观察均源自 mock 罐装设计且被审计口径豁免。
