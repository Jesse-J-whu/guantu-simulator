# 轨迹审计摘要:财政部门(caizhi)· hard · combo_id=17

**verdict: PASS** — 500/500 完成,六大诉求 0 真实违例;16 名玩家逐字深读全部通过。

## A. 全量机械核验(500 人)
- SQL(combo_id=17):players=500, completed=500, meets=500;
  continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/
  attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/llm_errors **全部为 0**。
- 分布:good 125×GREAT(晋升 3)、bad 125×BAD(晋升 1)、mixed 125×GREAT(2-3 次)、
  random 分散(GREAT79/GOOD35/MID7/BAD4)——与 pickChoice 的
  argmax(clean)/argmax(corrupt)/seed-bias 策略语义吻合,bad 全 BAD、good 全 GREAT 属预期。
- 晋升难度梯度:caizhi 平均晋升 easy 3.500 > normal 2.994 > **hard 2.228**,符合 promotion.ts 难度系数 1.3。
- 独立重算(npx tsx 解析原始 JSONL,按行内 playerIdx 字段过滤;行号==playerIdx 500/500、
  策略映射 0 错配):模板抽样 **30 人 0 违例**;超额完成的全量 **500 人 0 违例**
  (含 desc/选项相似度、effectsApplied==所选卡 effect、clamp 属性数学、
  职级跳变、finalRank 对照 departments.ts 五级阶梯、endingType 按 ending.ts 系数 1.3 复算)。
- 附加:11,500 个非首步 continuity 全部正确引用真实上一步标题(0 错);
  500 个互异 seed/IP/session;同策略内选择轨迹签名 good 118/125、bad 102/125、
  random/mixed 125/125 互异;晋升只落在考核步 6/9/12/15/18/21/24。

## B. 逐字深读(16 人,每人 24 步全读)
抽样 idx {0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499}(四策略×首/中/尾)。
每人:衔接 24/24、属性数学通过(含 0/100 双向 clamp)、职级通过(仅 promoted 时 +1,
finalRank 与阶梯一致)、结局亲手验算全部正确。代表验算:
- idx2 random:廉洁50/均分77.25/rank2 → GOOD 正确(差 20 分廉洁未达 GREAT)。
- idx250 random:廉洁68/均分76.25 → GOOD 正确(廉洁差 2 分,边界判定准确)。
- idx101 bad:廉洁0,(100-0)×1.3=130≥75 → BAD 正确;均分 66.3 但 BAD 门槛优先,次序符合 ending.ts。
- idx498 random:廉洁57/均分55.0 → GOOD 正确(全批属性最低深读样本,无越界)。

## 观察项(非违例)
1. **衔接语 100% 模板化**:全部 11,500 步均为「承接「上一步标题」的余波,事情还没完。」,
   引用真实但零场景定制;desc 为罐装场景轮换,剧情级承接最弱处在硬切换步
   (如 step12「检查组明天到」←「饭局座次玄机」、step15「扶贫村的第一周」←「会议室的座次牌」)。
2. **选项文案槽位通用化**:4 个 hint 固定(稳妥但费工/程序优先/经营关系/省事但有代价),
   个别选项与场景语义脱节(信访围堵场景出现「与竞争者私下沟通」);
   effect 数学与"至少 1 项非零"不受影响。
3. **跨玩家完全同序**:全批仅 24 个场景、1 种标题序列(mock LLM 口径内的预期行为,
   真实 GLM 多样性已在 Phase 1 单独验证);一局之内标题/正文/选项三层零重复,不构成违例。

结论:本组合满足产品要求;上述 3 点是 mock LLM 的已知边界,切换真实 GLM 时建议重点回归。
