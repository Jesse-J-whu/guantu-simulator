# 轨迹审计摘要:政法委(zhengfaB)· easy(combo_id=24)

**verdict: PASS**(500 玩家 · 0 违规)· 2026-08-21

## A. 全量机械核验(SQL, combo_id=24)
- players=500, completed=500, meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors **全部 = 0**
- 分布(诉求5/6):good 125 全 GREAT(晋升均值 5.0);bad 125 全 BAD(2.12);
  mixed GREAT 124 + GOOD 1;random GREAT 91 / GOOD 25 / MID 9
- 同部门晋升均值:easy 4.07 > normal 3.11 > hard 2.29,与 promotion.ts 难度系数方向一致

## 独立重算(不信 DB,从 JSONL 重算)
- 模板 30 人抽样(0-7/120-127/360-367/490-499,按行内 playerIdx 取人):**checked 30, violations 0**
- 追加全量:500 人 × 24 步 = 12000 步,attrsAfter == clamp(prev + 所选选项 effect) 0 偏差,
  effectsApplied == 所选选项 effect 0 偏差;500 人结局按 ending.ts 阈值逐人验算 0 不符;
  finalRank 对照 departments.ts 阶梯(科员→副科级→正科级→副处级→正处级→副厅级)0 不符;
  promotions 计数 == promoted 步数 0 不符;policy == playerIdx%4 全部吻合;500 seed/IP 全异

## B. 逐字深读(16 人 × 24 步全部读完)
抽样 idx {0,1,2,3, 100,101,102,103, 250,251,252,253, 448,449,498,499}(四策略 × 首/中/尾)
- 衔接:16 人全部 24/24 非空,衔接语引用的上一步标题均真实存在
- 文案:24 标题/24 正文/选项跨步肉眼复核无雷同,标题与正文同属一个场景单元
- 属性:每选项至少 1 项非零,所选效果全部真实落到 attrsAfter
- 职级:rankAfter 仅在 promoted=true 时 +1;finalRank 与阶梯一致(副厅级=RANKS[5])
- 晋升:2~5 次,非 0 非满;bad 玩家廉洁跌破 35 后晋升停止,与 INTEGRITY_GATE 一致
- 结局:16 人逐人验算全对(例:idx1 廉洁 0 → (100-0)×0.8=80≥75 → BAD 正确;
  idx2 廉洁 82/均分 90/rank4 → GREAT 正确)
- 衔接最弱一步(证据):step 15「扶贫村的第一周」承接「会议室的座次牌」,主题跳跃最大,
  衔接语是模板句「承接「X」的余波,事情还没完」——机械合规但语义承接偏弱

## 观察记录(非违规,按口径说明甄别)
1. 500 人共用逐字相同的 24 场景序列与开场白:mock 管线确定性抽取,跨玩家重复属预期;
   但场景顺序未按 seed 洗牌,建议记录
2. 罐装场景 step9「空缺的副科长职位」在玩家已是正科级/副处级时照常出现(叙事与职级不匹配,
   mock 产物,机械职级事实无恙)
3. effectsApplied 存原始 effect 而非夹取后增量:顶格/触底时数值不变属口径正常;
   审计脚本若误按增量比对会批量误报(本审计已甄别 495 条此类假告警为脚本假设错误)

**结论:zhengfaB/easy 500 条轨迹符合产品要求,verdict=PASS。**
