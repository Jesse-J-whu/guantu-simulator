# 轨迹审计摘要:政协 · hard(combo_id=35)

**verdict: PASS** — 500/500 完成,六大诉求 0 真实违例。

## A. 全量机械核验(SQL,players WHERE combo_id=35)
- players=500, completed=500, meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors **全部 SUM=0**
- steps 表:12000 行,continuity_ok 全 1,choice_count 恒 4,attr_nonzero≥1,rank 0..2,rank_fixes=0
- 分布:good→GREAT×125(均2晋升);bad→BAD×125(均1晋升);mixed→GREAT×124+GOOD×1;random→GREAT×86/GOOD×31/MID×2/BAD×6。方向正确。
- 难度梯度:晋升均值 easy 2.0 > normal 1.778 > hard 1.748,符合 promotion.ts(hard×1.3、政协晋升2星 deptFactor=1.06;阶梯仅3级,晋升上限2次)。

## B. 独立重算(不信 DB,从原始 JSONL 重算)
- 模板脚本 30 人抽样(idx 0-7/120-127/360-367/490-495,按行内 playerIdx 取人):**checked=30, violations=0**(标题bigram≥0.55、选项/正文相似度≥0.8、属性 clamp(prev+effect)、职级跳变、步数=24、promotions 计数)
- 加做全 500 人重算:结局按 ending.ts 阈值逐人验算 500/500 一致;finalRank 对照 departments.ts 阶梯[委员,常委,副主席] 500/500 一致;policy=idx%4 映射 500/500;衔接语引用上一步标题 12000/12000 真实且逐字匹配;effectsApplied==所选选项 effect 500/500。
- evalText 数字与最终属性一致(自检脚本曾报 175 条,复核均为检查器误报:BAD 文案格式『廉洁度只剩X分』、MID 模板不含数值、GOOD 均分 x.5 时 JS Math.round 进位)。

## C. 逐字深读(16 人 × 24 步)
- 抽样 idx {0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499}(四策略×首/中/尾;0-3 全文含效果逐字读,其余 12 人标题/衔接/选项全文 + 正文与已读基准逐字 diff=0)。
- 每人:衔接 24/24、属性数学通过、职级通过、结局验算正确(如 idx1 BAD:廉洁0→风险130≥75;idx102 GOOD:廉洁66<70 未达 GREAT;idx250 GREAT:廉洁72 擦线过70)。
- 晋升步分布:s6/s12(净好)、s9/s15 或 s9/s18(含取巧);bad 一律 s9 后因廉洁<35 触发暂缓提拔,机制自洽。

## 发现(观察项,非违例)
1. **选项语义错位**:选项文案取自槽位原型池(hint 固定 稳妥但费工/程序优先/经营关系/省事但有代价),个别与场景不贴 —— 最弱一步 step 13「防汛值守第一夜」(水库防汛)出现「收下购物卡再说」「家宴款待关键人物」。一局内文案不重复、效果均非零,不构成违例;真实 LLM 接入前建议 mock 选项按场景裁剪。
2. **衔接语模板化**:每步固定「承接「上一步标题」的余波,事情还没完」,引用真实但无剧情级承接(如座次牌→扶贫村)。
3. **零多样性**:跨玩家 24 场景标题/正文/选项 100% 相同,bad 恒 1 晋升、good 恒 2 —— 确定性 MockLLM+argmax 策略所致,属口径说明预期(多样性已由 Phase 1 真 API 扫描覆盖,见 docs/diversity-report.md)。

## 结论
机械核验与独立重算数字全部归零,16 人深读无真实违例 → **PASS**。3 条观察项均为 mock 口径内已知限制,移交产品侧知悉即可。
