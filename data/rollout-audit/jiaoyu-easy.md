# 轨迹审计摘要 — 教育部门 / easy(combo_id=27)

**verdict: PASS**(500 玩家全部完成,六大诉求 0 真实违例)

## A. 全量机械核验(SQL,data/rollout.db players WHERE combo_id=27)
- players=500, completed=500, meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors **全部 = 0**
- 分布(诉求5/6):good 125→全 GREAT(prom 3.0);bad 125→全 BAD(prom 均值 2.008,最低);
  mixed 124 GREAT+1 GOOD;random 87 GREAT+31 GOOD+7 MID。无 bad-全-GREAT 类异常,
  bad 晋升最少系廉洁门 35 拦截(与 promotion.ts 一致)。

## 独立重算(npx tsx,原始 JSONL,按行内 playerIdx 取样)
- 30 人(0-7/120-127/360-367/490-495):标题bigram≥0.55 重复 0、generic 0、desc≥0.8 重复 0、
  选项≥0.8 重复 0、全零效果选项 0、属性 clamp(prev+effect) 数学错 0、职级非法跳变 0、
  策略错配 0 → **checked 30, violations 0**
- 补充机械:16 名深读玩家 ending.ts 重算结局 16/16 一致;finalRank 与
  departments.ts 阶梯[科员,副科级,正科级,副处级] 16/16 一致;
  good/bad 选择按 pickChoice argmax 重放 0 不符;衔接语回引上一步标题缺失 0;
  500/500 玩家场景序列逐字节一致(mock (step-1)%30 取景设计)。

## B. 逐字深读(16 人 × 24 步:0-3, 100-103, 250-253, 448,449,498,499)
- 属性数学 16/16 通过;职级 16/16 通过;结局验算 16/16 正确
  (BAD=(100-廉洁)×0.8≥75,GREAT=廉洁≥70∧均分≥60∧rank≥2 等,逐人手验);
  24 标题/24 正文/选项局内零重复(肉眼复核与机械结论一致)。
- 结局验算示例:idx1 廉洁0→风险80≥75 BAD 正确;idx2 廉洁73/均分91/rank3→GREAT 正确;
  idx102 廉洁51<70 落 GOOD 正确;idx499 廉洁77/均分89/rank3→GREAT 正确。
- 衔接最弱证据:idx0 step4「两位领导方案之争」,衔接仅为
  『承接「验收现场的购物卡」的余波』一句套话,正文是新独立场景。

## 观察与建议(非违规)
1. 衔接语是单句模板,剧情层承接弱 —— mock 设计边界,建议真实 LLM 下增强。
2. 选项文案 CHOICE_BANK 按步轮换,少数选项与场景错配
   (如扶贫场景配「主动说明情况配合调查」);效果绑定 A/B/C/D 槽语义,无语义倒挂。
3. bad 策略 125/125 全 BAD、MID2 结构性不可达:easy 需廉洁≤6.25 才落马,
   而 bad 玩家廉洁必到底 0 —— 引擎数学必然,非数据违例。
4. 跨玩家场景/文案重复为 mock 罐装预期(口径说明),真实多样性见 docs/diversity-report.md。

详单:data/rollout-audit/jiaoyu-easy.json
