# 轨迹审计摘要 — 统战部 / hard(combo_id=23)

**verdict: PASS** · 500/500 完成 · 六大诉求 0 违例 · 深读 16 人

## A. 全量机械核验(500 人)
- SQL 聚合(combo_id=23):players=500, completed=500, meets=500;
  continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change /
  llm_errors **全部 = 0**;另 bg_ok=500, track_failures=0, steps_done 全 24,
  playerIdx 0..499 唯一覆盖。
- 分布(诉求5/6):good→GREAT 125/125(均晋升3);bad→BAD 125/125(均晋升1);
  mixed→GREAT 125/125(均2.66);random→GREAT 88 / GOOD 31 / MID 2 / BAD 4(均2.04)。
  hard 晋升均值 2.174 < normal 2.53 < easy 2.748,符合 promotion.ts
  (难度系数 1.3、统战部晋升2星 deptFactor≈1.06、廉洁<35 暂缓提拔)。
- **独立重算**(npx tsx,按行内 playerIdx 取样 30 人:0-7/120-127/360-367/490-495):
  标题 bigram≥0.55、选项/正文相似度≥0.8、泛化标题、clamp(prev+effect) 属性数学、
  职级跳变、策略匹配、24 步、衔接非空、每选项 effect 非全零 —— **checked 30, violations 0**。
- **全库加强重验**(python3,500 人):ending.ts 阈值逐人验算、finalRank 对照
  departments.ts 阶梯[科员,副科级,正科级,副处级]、promotions==promoted 步数、
  policy==[good,bad,random,mixed][idx%4] —— **0 错配**。

## B. 逐字深读(16 人 × 24 步全部读完)
抽样 idx {0,1,2,3, 100,101,102,103, 250,251,252,253, 448,449,498,499}。
- 衔接:16 人 × 23 个承接步全部非空,且「承接「X」」引用的标题与上一步真实标题一致。
- 不重复:每人 24 标题 / 24 正文 / 96 选项肉眼复核无雷同;标题与正文同属一个场景单元。
- 属性:所选 effect 均反映到 attrsAfter;0/100 夹取行为正常(bad 玩家廉洁后期恒 0,
  good 玩家四维后期恒 100)。
- 职级:晋升只发生在 promoted=true 步且恰 +1;good 晋升于 step 6/12/21 附近,
  bad 仅 step 9(opportunity),非 0 非满,节奏合理。
- 结局逐人验算:16/16 判定正确。含边界案例:idx 102 GOOD(廉洁66<70 差4分落档)、
  idx 498 GREAT(廉洁73,靠 step23/24 连续清廉选择从60拉回,逆转分档)。

## 发现(均为非违规质量备注)
1. **衔接语是模板句**:每步固定「承接「上一步标题」的余波,事情还没完」,引用真实但
   desc 本身是罐装场景,部分相邻步无剧情承接(最弱证据:idx0 step14「会议室的座次牌」
   承接「防汛值守第一夜」,水库值班→摆座次牌毫无关联)。属 mock LLM 预期行为,满足
   「衔接非空+引用真实存在」口径,但上线真 LLM 前值得改掉模板句。
2. **选项文案四原型化**:选项固定为 稳妥/程序/关系/省事 四类锅炉句,偶尔与场景语义
   错位(如「老科长退休托付」场景下出现「如实上报数据口径」);hint 四句每步重复。
   一局内选项文本不重复,不构成违规,但影响代入感。
3. mixed 策略 125/125 全 GREAT,该桶结局零多样性(random 桶四档齐全)。

**结论**:机械核验、独立重算、全库公式重验、逐字深读四层全部通过,未发现真实违例。
