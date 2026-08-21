# 轨迹审计报告：fagaB/hard（发改委 · hard，combo_id=14）

- 结论：**PASS**（真实违规 0 例）
- 范围：500/500 玩家完成，`data/rollout-traj/fagaB-hard.jsonl`（本批行号==playerIdx，取样仍按行内 `playerIdx` 字段过滤）

## 机械核验（SQL，data/rollout.db，combo_id=14）

| 指标 | 值 |
|---|---|
| players / completed / meets / bgOk | 500 / 500 / 500 / 500 |
| continuity_missing / title_dup / choice_dup / desc_dup | 0 / 0 / 0 / 0 |
| generic_titles / attr_zero_offered / attr_not_applied | 0 / 0 / 0 |
| rank_residual / illegal_rank_change / llm_errors / track_failures | 0 / 0 / 0 / 0 |
| promotions 均值 / 最小 / 最大 | 2.278 / 1 / 3 |

steps 表 12,000 行（500×24），continuity_ok=0 与 attr_nonzero=0 均为 0 行，rank_fixes>0 为 0 行。

分布：good→GREAT 125；bad→BAD 125；mixed→GREAT 124 + GOOD 1（idx 183，廉洁 57<70 落 GOOD 档，手算正确）；
random→GREAT 81 / GOOD 35 / MID 5 / BAD 4。终职级：副处级 265、正科级 109、副科级 126（阶梯 `科员/副科级/正科级/副处级/正处级/副厅级`，起点科员）。
难度梯度：fagaB easy 4.042 > normal 3.098 > **hard 2.278**，与 promotion.ts `DIFFICULTY_FACTOR`（hard 1.3 成本 / 0.8 得分）方向一致。
1,139 次晋升全部落在考核步（step%3==0，直方图 6:319 / 9:314 / 12:111 / 15:91 / 18:176 / 21:87 / 24:41）。

## 独立重算（脱离 DB，直接读 JSONL + src/engine/dedup.ts）

- 模板 30 人抽样（idx 0-7、120-127、360-367、490-495，按行内字段取人）：标题/选项/正文重复、属性 clamp、职级跳变 **违规 0**
- 加做全 500 人逐条重算：policy 映射、24 步与年份序列（2016-2039）、192,000 张选项卡全零效果、
  effectsApplied==所选卡、clamp 数学、职级 +1 规则、finalRank 阶梯核对、endingType 按 ending.ts
  阈值（hard 系数 1.3）逐人重算 —— **全部 0 偏差**；continuity 引用上一步标题 0 错引
- 500 个 seed/session/ip 全唯一；属性无一越出 0..100

## 逐字深读 16 人（每人 24 步全读 + 结局手工验算）

idx 0/1/2/3（全文逐字）+ 100/101/102/103/250/251/252/253/448/449/498/499（逐线程全读，文案经程序校验与语料逐字节一致）。
覆盖 4 种策略 × 4 种结局（GREAT/GOOD/MID/BAD）× 1-3 次晋升。全部通过：局内 24 标题/正文/选项互不重复；
衔接语非空且均真实指向上一步标题；BAD（廉洁 0→risk 130）、GOOD（p102 廉洁 62/均分 70.8/risk 49.4）、
MID（p498 廉洁 49<50 且 ≥35、risk 66.3<75）均手工验算吻合。最弱衔接（代表性证据）：各玩家 step 13
「防汛值守第一夜」紧接 step 12「检查组明天到」，衔接语仅模板引用标题，desc 本身与检查组剧情无实际承接。

## 发现与观察（均非违规，属 mock 口径内）

1. 500 人共用同一条 24 场景固定序列（24 标题/24 正文/96 选项文案逐字节相同，效果向量按 seed 扰动，1,027 种）——mock 罐装场景预期行为；真实 LLM 多样性见 docs/diversity-report.md。
2. 衔接语为固定模板「承接「上一步标题」的余波，事情还没完」（全批仅 24 个不同字符串），引用 100% 正确但无实际剧情承接。
3. 选项 hint 仅 4 个值（稳妥但费工/程序优先/经营关系/省事但有代价）在每局内反复出现；去重口径只覆盖选项正文，hint 不在其列，接真实 LLM 前建议关注。
4. MID2 在 hard 难度数学上不可达：廉洁<35 ⟹ risk=(100-廉洁)×1.3 ≥ 84.7 > 75，BAD 档先命中 —— 本组合 MID2=0 是 ending.ts 阈值的设计后果，非数据缺陷。
5. good 玩家中期四维顶 100 后长期夹取不变（clamp 预期）；bad 玩家廉洁钉 0 后负值不再变化，同为夹取口径内。
