# 轨迹审计报告：fuban/hard（combo_id=5）

- 结论：**PASS**（真实违规 0 例）
- 范围：500/500 玩家完成，`data/rollout-traj/fuban-hard.jsonl`（行号==playerIdx，取样按行内字段过滤）

## 机械核验（SQL，data/rollout.db，combo_id=5）

| 指标 | 值 |
|---|---|
| players / completed / meets / bgOk | 500 / 500 / 500 / 500 |
| continuity_missing / title_dup / choice_dup / desc_dup | 0 / 0 / 0 / 0 |
| generic_titles / attr_zero_offered / attr_not_applied | 0 / 0 / 0 |
| rank_residual / illegal_rank_change / llm_errors / track_failures | 0 / 0 / 0 / 0 |
| promotions 均值 / 最小 / 最大 | 2.276 / 1 / 3 |

分布合理性：good→GREAT 125；bad→BAD 125；mixed→GREAT 123/GOOD 2；random→GREAT 91/GOOD 24/MID 6/BAD 4。
终职级：副处级 264、正科级 110、副科级 126。难度梯度：easy 3.5 > normal 3.09 > hard 2.276（与 DIFFICULTY_FACTOR=1.3 一致）。

## 独立重算（脱离 DB，直接读 JSONL + src/engine/dedup.ts）

- 取样 30 人：idx 0-7、120-127、360-367、490-495（按行内 playerIdx 字段过滤）
- 标题 bigram 重复 0；选项/正文相似度重复 0；属性 clamp(prev+effect) 0 错；职级 +1 规则 0 错；policy 与 idx%4 映射 0 错
- **违规 0**

## 加做：全 500 人逐条重算（超出模板要求）

- 结局按 ending.ts 阈值（hard=1.3）重算：0 偏差；finalRank 与晋升次数：0 偏差
- 48,000 个选项中"全零效果"0 个（净零交换型 950 个，属合规权衡）
- continuity 引用上一步标题：0 处引用错误

## 逐字深读 16 人（每人 24 步全读 + 结局手工验算）

idx 0/1/2/3/100/101/102/103/250/251/252/253/448/449/498/499，覆盖 4 种策略、4 种结局（GREAT/MID/BAD）、1-3 次晋升。
全部通过：24 标题/正文/选项局内互不重复；衔接语非空且均真实指向上一步标题；属性数学与夹取（0..100）正确；职级只按 departments.ts 阶梯 +1；BAD 判定（廉洁0→130≥75）与 MID 判定（p102：风险68.9<75、廉洁47≥35）手工验算吻合。

## 发现与观察（均非违规，属 mock 口径内）

1. 500 人共用同一条 24 场景固定序列（24 标题/24 正文/96 选项文案，标题序列全批唯一）——mock 罐装场景预期行为；真实 LLM 多样性见 docs/diversity-report.md。
2. 衔接语为固定模板「承接「上一步标题」的余波，事情还没完」，引用正确但无实际剧情承接（如 p0 第13步防汛值守紧接检查组到访）。
3. 选项文案取自 4 类原型池，与场景语义偶有错位（防汛夜值可选「收下购物卡再说」）；接入真实 LLM 前建议关注。
4. 考核步可在当步选负面选项时仍晋升（p3 第12步、p499 第21步）——符合 promotion.ts 累积点数设计。
