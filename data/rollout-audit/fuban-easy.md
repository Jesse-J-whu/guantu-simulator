# 轨迹审计摘要 — 府办(政府办公室)/easy(combo_id=3)

**verdict: PASS** · 500/500 完成 · 0 真实违例 · 深读 16 人

## A. 全量机械核验(SQL,players WHERE combo_id=3)
- players=500, completed=500, meets=500, bgOk=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors / track_failures **全部 = 0**
- 分布:good→GREAT 125/125;bad→BAD 125/125(廉洁全部归零);mixed→GREAT 123+GOOD 2;random→GREAT 86+GOOD 26+MID 13
- 终职级:正处级 369 / 副处级 12 / 正科级 119(阶梯 5 级,departments.ts 一致)
- 晋升均值随难度单调下降:easy 3.50 > normal 3.09 > hard 2.28(符合 promotion.ts 的 1.2x/1.0x/0.8x 点数系数)

## B. 独立重算(不信 DB,从 JSONL 重算)
- 模板要求 30 人抽样(按行内 playerIdx 字段过滤,非行号):**checked 30, violations 0**
- 自加全量 500 人核验(python 复刻 dedup.ts 的 clean/bigram/Jaccard/字符包含口径):
  - 结构:playerIdx 0..499 连续唯一、policy==[good,bad,random,mixed][idx%4] 全对、seed/session/ip 各 500 个全唯一、
    每局 24 步且 step/year 连续、每步 4 选项且 chosenIdx 合法、effectsApplied==所选 effect、每卡 effect 至少 1 非零 → **0 错误**
  - 去重(含事件内选项互抄):**0 违例**;全库次高相似度 标题 0.182(阈0.55)/正文 0.404(阈0.8)/选项 0.50(阈0.8),无贴线侥幸
  - 衔接引用:11,500 条非首步衔接语的「标题」100% 真实存在;500/500 首步为开局式 → **0 悬空**
  - 结局重算:500 人按 ending.ts(easy 0.8)用最终属性+rank 亲手验算 → **0 不符**(含 MID 的 rankRatio 分支边界)

## C. 逐字深读(16 人 × 24 步)
idx 0,1,2,3 / 100-103 / 250-253 / 448,449,498,499(四策略 × 首/中/尾)。
叙事文本全库逐字同文(24 标题+24 正文+96 选项),即已 100% 通读玩家可见文案。
每人:衔接 24/24、属性数学通过、职级通过、结局验算全部正确。
代表性验算:P0 全100→GREAT;P1 廉洁0→risk80≥75→BAD;P102 廉洁34<35 且<50 但 rankRatio0.75≥0.5→MID(边界);P498 廉洁53→GOOD。
最弱一步(每人摘录见 JSON):集中在选项卡与正文场景的主题错配,如 step15『扶贫村的第一周』配『主动说明情况配合调查』。

## 非违例观察(4 项,均已溯源到代码与口径)
1. **衔接语为单一固定模板**:全部 11,500 条非首步均为『承接「<上一步标题>」的余波,事情还没完。』
   (server/mockLLM.js:259 有意为之,修复早前捏造人名的真实违例)。非空且只回引真实标题,满足机械要求;
   但 desc 之间无真实剧情承接。真实 GLM 承接质量由 docs/diversity-report.md 单独验证。
2. **选项文案按步轮换而非场景绑定**:个别选项卡与场景无关(mockLLM.js CHOICE_BANK 设计权衡);
   标题与正文仍同属一个场景单元,效果数值按场景槽位绑定,无语义倒挂。
3. **属性提前顶满**:219/500(good 全部 125 人)在第 12-24 步四维全 100,其后各步属性零变化——
   模板口径明示 clamp 属正常,但 easy+府办(晋升4星)供给过剩,good 玩家中局后失去成长反馈。
4. **晋升分布高度一致**:good 全员 promotions=4(阶梯封顶);bad 全员 BAD。与难度系数及封顶机制自洽,非异常。

## 结论
六大诉求(完成度/衔接非空/局内标题-选项-正文不重复/属性真实生效/职级只在晋升时+1/结局与属性一致)
在全量机械核验、独立重算与逐字深读三层均 **0 违例** → **PASS**。建议关注第 3 项游戏平衡问题(easy 供给过剩)。
