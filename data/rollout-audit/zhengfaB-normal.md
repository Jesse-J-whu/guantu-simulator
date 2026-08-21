# 审计报告:政法委(zhengfaB) · normal · combo_id=25

- 对象:`data/rollout-traj/zhengfaB-normal.jsonl`(500 行,按行内 playerIdx 取样)
- 结论:**PASS**,真实违例 0;DB 六大诉求 11 项违规和全 0,500/500 完成,meets_requirements=500,bg_ok=500

## 一、全量机械核验
- players=500, completed=500, steps_done 全部 24;steps 表 12000 行 = 500×24,continuity_ok=12000,attr_nonzero=12000,rank_fixes=0
- 11 项违规和全 0:continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors / track_failures
- 策略×结局分布(policy=playerIdx%4):

| policy | GREAT | GOOD | MID | MID2 | BAD | 晋升均值 |
|---|---|---|---|---|---|---|
| good | 125 | 0 | 0 | 0 | 0 | 4.000 |
| bad | 0 | 0 | 0 | 0 | 125 | 1.152 |
| random | 91 | 28 | 3 | 2 | 1 | 3.440 |
| mixed | 124 | 1 | 0 | 0 | 0 | 3.984 |

- 分布解读:good 全 GREAT、bad 全 BAD、random 居中 —— 与策略语义一致,无"bad 全 GREAT"类异常;normal 难度系数 1.0、政法委晋升评分 4(成本×0.94),4 次晋升触顶正处级符合 24 步节奏。

## 二、30 人独立重算(npx tsx 直读 JSONL,不信 DB)
- 抽样 idx 0-7/120-127/360-367/490-495(good7/bad7/random8/mixed8),按行内 playerIdx 过滤
- 重算标题重复(bigram≥0.55)/选项重复(≥0.8)/generic 标题/clamp(prev+effect) 属性数学/职级跳变:**checked 30, violations 0**,与 DB 完全一致

## 三、16 人 × 24 步逐字深读(idx 0-3/100-103/250-253/448-449/498-499)
- 衔接:16 人全部 24/24 非空;全 500 人 continuity 引号内文字与上一步标题 11500/11500 次精确匹配,0 错位
- 文案:每人 24 标题互不雷同、24 段正文互不雷同、选项文案跨步无重复(肉眼复核与机械结论一致);无 generic 标题
- 属性数学/职级:16 人全通过(rankAfter 仅在 promoted=true 时 +1;finalRank 与 departments.ts 阶 ladder 一致:1次=副科级、2次=正科级、3次=副处级、4次=正处级)
- 结局验算(ending.ts 亲手重算)16/16 正确,例:idx1/101/253/449 廉洁 0→(100-0)×1.0≥75 判 BAD 正确;idx0/3/100 等 廉洁≥70 且均分≥60 且 rank≥2 判 GREAT 正确;idx498 廉洁 71 踩线过门槛,验算无误
- 最弱一步(step 3,全服同因):标题「验收现场的购物卡」而正文写"厚信封 + 饭局邀约" —— 同一收买场景单元,但标题道具未在正文出现,属措辞层面瑕疵,不构成规则违例

## 四、发现与建议
1. 全服 500 人共用同一套 24 幕场景/正文序列 —— mock 罐头预期口径,不计违例;换真 LLM 后需复测。
2. 晋升上限 4 次(正处级),副厅级在 24 步内不可达 —— 节奏设计使然,非 bug。
3. bad 策略廉洁单调归零致 125/125 BAD、good 恒 4 次晋升 GREAT,策略区分度清晰。

violations: []
verdict: **PASS**
