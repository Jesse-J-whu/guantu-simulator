# 轨迹审计摘要:人大 · hard(combo_id=38)

**verdict: PASS** — 500/500 完成,六大诉求 0 违例,无真实违规(违规清单为空)。

## A. 全量机械核验(500人)
- SQL(combo_id=38):players=500,completed=500,meets=500;
  continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/
  attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/llm_errors 全部 SUM=0;
  另 bg_ok=500、track_failures=0、steps 表 12000 行(500×24)。
- 分布:good 125/125 GREAT(均3.0晋升,阶梯封顶);bad 125/125 BAD(均0.98);
  random: GREAT85/GOOD33/BAD5/MID2;mixed: GREAT124/GOOD1。
  结局总量 GREAT334/BAD130/GOOD34/MID2;finalRank 主任211/副主任163/委员124/代表2。
- 难度对照(人大三档晋升均值):easy 2.746 > normal 2.528 > **hard 2.166**,
  符合 promotion.ts(点数×0.8、成本×1.3×人大2星1.06)。
- 独立重算(npx tsx,按行内 playerIdx 取样 30 人:0-7/120-127/360-367/490-495):
  **checked 30, violations 0**(标题bigram/泛化/desc/选项相似度/clamp数学/职级跳变)。
- 附加全量重算(500人):policy 映射、24步、衔接非空、每选项≥1项非零效果、
  按 ending.ts 重算结局 500/500 吻合、finalRank 对照 departments.ts 阶梯
  (代表→委员→副主任→主任)全对、promotions==promoted步数全对。

## B. 逐字深读(16人:0-3/100-103/250-253/448-499/498-499,4策略×首中尾)
- 衔接 16/16 玩家 24/24 步非空;属性数学、职级、结局验算全部通过。
- 结局验算示例:P498(random)廉洁41,(100-41)×1.3=76.7≥75 压线落马 BAD,判定正确;
  P0(good)廉洁100/均分100/rank3→GREAT;P101(bad)廉洁0→风险130→BAD。
- 最弱衔接(证据):step15→16『会议室的座次牌』→『扶贫村的第一周』,
  衔接语仅模板句"承接「…」的余波",desc 场景与人物全新,无因果承接。

## 非阻塞观察(如实记录,不构成违规)
1. 500 玩家共用**同一**24场景标题/正文/选项序列且顺序固定(mock LLM 罐装单元未按
   seed 洗牌;口径说明判定跨玩家相同为预期,一局内不重复仍成立:24标题/24正文/96选项全不雷同)。
2. 同局 NPC 同名不同身份:陈明理=信访代表(s5)/老同学(s10)/村支书(s15);
   张卫东=施工老板(s3)/财政干部(s19)/介绍人(s23);王建国=同事(s1)/投标商(s21)。
3. 部分选项文案与场景错配(选项按 hint 类型从模板库配):如 s9 竞聘副科长场景配
   "先停职检查再定性/建议列入下期议程"。
4. hard 难度下 MID2 结局数学不可达(BAD 阈值廉洁≤42 与 MID 阈值廉洁≥35 重叠),
   本批 MID2=0 属必然,非数据问题。
5. good 玩家 125/125 恰 3 晋升(4级阶梯封顶),策略内晋升数无方差。

## 结论
全量机械核验 + 独立重算 + 16人逐字深读三层审计均未发现真实违例,
判定 **PASS**。上述观察建议在接入真实 GLM 后复查(场景多样性、NPC一致性、
选项-场景贴合度)。
