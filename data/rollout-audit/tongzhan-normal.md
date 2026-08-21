# 轨迹审计摘要:tongzhan/normal(统战部·normal,combo_id=22)

**verdict: PASS** —— 500 玩家全部完成,六大诉求 0 违例。深读 16 人(4 策略 × 首/中/尾),独立重算 30 人(模板抽样)+ 500 人(自扩展)均 0 违例。

## A. 全量机械核验(SQL,data/rollout.db)
- players=500,completed=500,meets_requirements=500,500 个不同 session,idx 0..499,steps_done 全部 24。
- 11 个违规列(continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/llm_errors/track_failures)SUM 全部 = 0,无任何 >0 的玩家行。
- policy=idx%4 无一错配(good/bad/random/mixed 各 125)。
- 分布:good→GREAT 125/125(晋升均 3.0);bad→BAD 125/125(晋升均 1.14,min1 max2);mixed→GREAT 124+GOOD 1;random→GREAT 85/GOOD 28/MID 12。总 GREAT 334/BAD 125/GOOD 29/MID 12;晋升直方图 1:108、2:19、3:373,均值 2.53。
- 难度趋势:统战部 easy 2.748 > normal 2.53 > hard 2.174,符合 promotion.ts(难度系数 0.8/1.0/1.3,晋升 2 星 → 成本 ×1.06)。

## B. 独立重算(不信 DB,直接啃 JSONL)
- 模板 30 人抽样(0-7/120-127/360-367/490-495,按行内 playerIdx 取人):checked 30,violations 0。
- 自扩展全 500 人重算:checked 500,violations 0 —— 12000 步 continuity 非空;每张选项卡 ≥1 项非零效果;attrsAfter==clamp(prev+所选卡原始 effect)共 48000 次属性校验全过;effectsApplied 与所选卡一致;rank 仅 promoted 时 +1;finalRank 与统战部阶梯[科员,副科级,正科级,副处级]一致;promotions 计数吻合;按 ending.ts 阈值重算结局,500/500 与存储 endingType 一致;衔接语引用的上一步标题 100% 真实存在。
- 过程备注:重算脚本首版曾爆出 CONT 12000 / EFFECT-MISMATCH 14576,查实为**审计脚本自身 bug**(属性名拼成 contuity;把 effectsApplied 误当夹取后增量——实际记录卡片原始值,夹取发生在 attrsAfter),修正后归零,非产品问题。

## C. 逐字深读(16 人 × 24 步)
抽样 idx {0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499}。每人 24 标题互不雷同(bigram ≤0.18 < 0.55)、24 段正文互不雷同(≤0.40 < 0.8)、96 张选项卡文案不跨步重复;结局全部亲手验算正确。亮点:
- p250(random)廉洁恰好 35:风险 65<75 非 BAD、<70 非 GREAT、<50 非 GOOD、=35 命中 MID —— 边界值分档教科书级精准。
- 廉洁 <35 暂缓提拔(INTEGRITY_GATE)可见生效:p1/p253/p449 晋升停在 step6(副科级),p101 停在 step12(正科级),p449 在 step12 廉洁 34 恰好跌破门槛后戛然而止。

## 发现(非违规,mock 批次口径内瑕疵,建议接真 GLM 前处理)
1. **衔接语 100% 模板**:全部 11500 条 step2-24 均为同一句式『承接「<上一步标题>」的余波,事情还没完。』,标题引用真实,但 desc 多为全新罐装场景,剧情实质承接弱(最弱:p0 step13『防汛值守第一夜』承接『检查组明天到』,内容零关联)。
2. **跨玩家内容多样性为 0**:全 500 玩家看到完全相同的 24 个标题与 24 段正文、相同顺序(12000 步仅 24 distinct),差异只剩数值抖动与选择 —— 属模板口径明示的 mock 罐装单元(多样性已在 Phase 1 真 API 扫描单独验证),不算违规,但本批内容层面无可读差异。
3. 选项 hint 恒为『稳妥但费工/程序优先/经营关系/省事但有代价』四个固定标签且选项固定占位同一原型槽位,公式化明显。
4. good 125 人全 GREAT 且恰好 3 次晋升、mixed 124/125 GREAT:策略→结局映射高度确定,系 pickChoice argmax 设计的自然结果。

## 结论
机械层(完成度/去重/属性数学/职级/结局)500 人全绿,独立重算与 DB 双向印证;叙事层存在 mock 固有的模板化衔接与零内容多样性,按批次口径不判违规。**PASS**。
