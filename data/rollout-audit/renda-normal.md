# 轨迹审计摘要 — 人大(renda) / normal 难度(combo_id=37)

**verdict: PASS** — 500 名玩家全部完成,六大诉求 0 违例;3 条非阻塞产品观察。

## A. 全量机械核验(SQL, players WHERE combo_id=37)
- players=500, completed=500, meets_requirements=500
- continuity_missing / title_dup / choice_dup / **desc_dup** / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change /
  llm_errors / track_failures = **全部 0**;steps 表 12000 行(500×24),rank_fixes=0
- 分布:good→GREAT 125/125(promotions 均 3);bad→BAD 125/125(均值 1.15);
  mixed→GREAT 124 + GOOD 1;random→GREAT 84 / GOOD 24 / MID 15 / BAD 2
- 难度梯度(renda 三组合):晋升均值 easy 2.746 > **normal 2.528** > hard 2.166,
  与 promotion.ts(DIFFICULTY_FACTOR 0.8/1.0/1.3 + 人大晋升★2→成本×1.06)一致
- 异常格逐一回溯并手工验算:idx303 mixed/GOOD(廉洁57/均分78.8→GOOD 正确)、
  idx142、idx198 random/BAD(廉洁24/17→风险76/83≥75 正确)

## B. 独立重算(npx tsx,原始 JSONL 按 playerIdx 字段取样,非行号)
- 30 人(idx 0-7、120-127、360-367、490-495):**checked 30, violations 0**
- 覆盖标题 bigram≥0.55、选项/正文相似度≥0.8、clamp(prev+effect) 属性数学、
  职级跳变,另加验 policy 匹配、步数=24、continuity 非空、每选项效果≥1 非零

## C. 逐字深读(16 人 × 24 步,playerIdx 0-3/100-103/250-253/448-449/498-499)
- 16/16:衔接字段 24/24 非空且引用的上一步标题真实存在;属性数学通过;
  职级仅 promoted 步 +1;结局分档全部按 ending.ts 阈值亲手验算正确
  (含边界样本:idx2 廉洁44→MID、idx498 廉洁36→MID、idx142 风险76→BAD)
- finalRank 与 departments.ts 人大阶梯(代表/委员/副主任/主任)一致

## 发现(非阻塞,均给出证据)
1. **选项池通用化**:全组合仅 96 条选项文案 + 4 条 hint,与场景语义脱节——
   step2 选记录员场景给出「睁一只眼闭一只眼」;step22 家属院水管爆裂给出
   「书面建议暂缓通过/按批次统一处理」。mock 口径不算违例,真实用户可感知。
2. **衔接语纯模板**:step2-24 全为「承接「上一步标题」的余波,事情还没完。」,
   desc 多为平行事件(最弱:座次牌→扶贫村)。机械合规,叙事承接薄。
3. **顶端同质**:good/mixed 几乎全 3 晋升到顶、四维 100、GREAT,step12-15 后
   无职级变化;缺 GOOD/MID 中间态。

## 结论
机械口径完全干净;问题集中在 mock LLM 的文案同构性与模板化衔接,真实 GLM 接入后需复验。
审计产物:data/rollout-audit/renda-normal.json(机器可读明细)
