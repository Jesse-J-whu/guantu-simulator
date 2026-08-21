# 轨迹审计报告 — 宣传部 xuanchuanB / easy(combo_id=18)

**Verdict: PASS**(0 真实违规)

## 全量机械核验(SQL,combo_id=18)

- players=500,completed=500,meets_requirements=500
- 13 项违规 SUM 全 0:continuity_missing / title_dup / choice_dup / desc_dup /
  generic_titles / attr_zero_offered / attr_not_applied / rank_residual /
  illegal_rank_change / llm_errors 均为 0
- 分布:good→GREAT 125(4次晋升);bad→BAD 125(2-3次);mixed→GREAT 125(4次);
  random→GREAT 88 / GOOD 31 / MID 6(3-4次)
- bad 全 BAD 合理:廉洁度归 0,(100-0)×0.8=80≥75;廉洁<35 后晋升被
  promotion.ts INTEGRITY_GATE 暂缓,故止步 2-3 次、终职正科级

## 独立重算(npx tsx,原始 JSONL,按行内 playerIdx 取样)

- 30 人(idx 0-7 / 120-127 / 360-367 / 490-495,每策略≥7)
- 标题 bigram≥0.55 / 选项·正文相似度≥0.8 / 属性 clamp(prev+effect) /
  职级跳变 / policy==idx%4 / steps==24:**0 违例**

## 逐字深读(16 人 × 24 步,playerIdx 0-3 / 100-103 / 250-253 / 448-449 / 498-499)

- 衔接 24/24 非空,衔接语所引上一步标题全部真实存在
- 属性数学、职级阶梯(科员→…→正处级)、结局验算 16/16 亲手复核正确
  - bad(P1/101/253/449):(100-0)×0.8=80≥75 → BAD 正确
  - 压线案例 P102:廉洁 71/均分 74.5/rank4 → GREAT 正确(阈值顺序复核无误)
- 晋升节奏:good 踩点 3/6/9/12;bad 6/9 后冻结;random 3/6/12/21 等自然错位

## 备忘观察(按 mock 口径不算违规)

1. **hint 局内重复**:每步 4 个选项 hint 固定为「稳妥但费工/程序优先/
   经营关系/省事但有代价」,一局重复 24 次;选项文本与 desc 三层去重
   均干净,但 hint 层不在现有度量口径 —— 建议纳入真实 LLM 多样性检查
2. **声明式衔接**:衔接语是罐装模板「承接「上一步标题」的余波…」,
   标题引用真实但 desc 每步开新场景;最弱一步:step 4「两位领导方案之争」
   承接 step 3「验收现场的购物卡」
3. **easy 结局天花板偏松**:mixed(偏选 0/1 号)与 random 中 88/125 均达
   GREAT,与 good 无区分度;P499 mixed 开局选 3 号劣选仍全 100 退休

## 结论

六大诉求全量 0 违例 + 独立重算 0 违例 + 16 人深读全通过 → **PASS**。
上述 3 条观察供后续(真实 LLM 切换/难度调参)参考。
