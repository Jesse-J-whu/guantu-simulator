# 轨迹审计摘要:政协(zhengxie)/easy,combo_id=33

**verdict: PASS**(0 真实违例;深读 16 人;独立重算 30 人 0 违规)

## A. 全量机械核验(SQL,data/rollout.db)
- players=500, completed=500, meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change /
  llm_errors / track_failures = **全部 0**
- 分布:good→GREAT 125/125;bad→BAD 125/125;random→GREAT 87/GOOD 27/MID 11;
  mixed→GREAT 124/GOOD 1。promotions 全员恰为 2,晋升步只落在考核步
  {3,6}×278、{6,9}×129、{3,9}×87、{6,12}×4、{3,12}×2(符合 REVIEW_INTERVAL=3)。

## 独立重算(npx tsx,原始 JSONL,按行内 playerIdx 取人)
- 30 人(0-7/120-127/360-367/490-495,good7/bad7/random8/mixed8):标题 bigram≥0.55、
  泛化套话、desc≥0.8、选项≥0.8、effect 全零、effectsApplied≠所选、clamp 属性数学、
  非法职级跳变 —— **checked 30, violations 0**;另重算 ending.ts 阈值与 finalRank
  (对照 departments.ts 委员→常委→副主席),30 人全对。
- python 全量 500 行:idx 0..499 唯一、policy=idx%4 全对、每人 24 标题/24 desc/
  96 选项文案局内全局唯一、seed/ip 各 500 唯一。

## B. 逐字深读(16 人 × 24 步 = 384 步全读)
抽样 idx {0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499}。
每人:衔接 24/24、属性数学通过、职级通过、结局验算正确、晋升 2/24 步(非 0 非满)。
示例:idx1 廉洁0→(100-0)×0.8=80≥75 判 BAD 正确;idx2 廉洁61/均分68.5→GOOD 正确;
idx498 廉洁100/均分85.75/rank2→GREAT 正确。

## 发现(mock 侧质量观察,非六大诉求违例)
1. 衔接语是逐字模板(500人×23步同为「承接「上一步标题」的余波…」),所引标题真实
   存在且顺序正确,但 desc 从不真承接上一步剧情;最弱:idx0 step6 老科长托付紧接群体信访。
2. 选项为 4 槽原型池复用,与场景语义错位:防汛场景出现「收下购物卡再说」、
   争副科长空缺出现「先停职检查再定性」。
3. 同局 NPC 同名不同角色:王建国=同事(s1)/领导(s7)/投标商(s21);张卫东=老板(s3)/
   财政干部(s19)/介绍人(s23);刘志强=副局长(s4)/纪检组长(s24)。
4. 场景池与部门无关:政协(委员→常委→副主席)事件全是科室/科员/副科长/局长语境,
   与 departments.ts 政协 themes 不符;与 zuzhiB/jiwei/renda 的 idx0 场景序列逐字相同。
5. 晋升无区分度:3 级阶梯+easy(成本 10/15)下含全部 bad 玩家在内 500 人都在
   step3-12 登顶副主席;廉洁<35 暂缓提拔只在 bad 堕落后期生效(已无级可升)。
6. good/mixed 中后期属性大面积夹在 100(口径说明内正常)。

## 结论
500 人全部完成,六大诉求 0 违例 → **PASS**。6 条为 mock 管线已知形态与设计后果,
建议真实 GLM 接入时重点回归第 1、4 条。
