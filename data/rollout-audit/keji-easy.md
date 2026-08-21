# 轨迹审计:科技部门 / easy(combo_id=30)

**verdict: PASS** — 500/500 玩家完成,六大诉求 0 违例(机械核验 + 独立重算 + 16 人逐字深读三层一致)。

## A. 全量机械核验(SQL,data/rollout.db,combo_id=30)

| 指标 | 值 |
|---|---|
| players / completed / meets_requirements | 500 / 500 / 500 |
| continuity_missing / title_dup / choice_dup / desc_dup | 0 / 0 / 0 / 0 |
| generic_titles / attr_zero_offered / attr_not_applied | 0 / 0 / 0 |
| rank_residual / illegal_rank_change / llm_errors | 0 / 0 / 0 |
| bg_ok / steps_done / seeds / ips | 500 / 全24 / 500个 / 500个 |

分布(policy×结局):good 125 全 GREAT(晋升恰4次,阶梯顶);bad 125 全 BAD
(廉洁必归零,(100−0)×0.8=80≥75);mixed 124 GREAT+1 GOOD;random 88 GREAT
/24 GOOD/13 MID。晋升均值 good 4.00 > random 3.96 > bad 2.03,与
promotion.ts(easy 系数0.8、keji 星级3无修正、廉洁<35 停升)完全吻合。
random/mixed 偏 GREAT 属 mock 正和效果分布的已知注记(docs/rollout-report.md)。

## B. 独立重算(不信 DB,从原始 JSONL 重算)

- 模板脚本 30 人抽样(0-7/120-127/360-367/490-495,按行内 playerIdx 取人):
  **checked 30, violations 0**(标题bigram/选项0.8/desc0.8/属性clamp/职级跳变)。
- 追加全 500 结构扫描:policy==playerIdx%4 全对、24步×500、continuity/desc
  非空、每张选项卡≥1项非零效果、chosenIdx 合法、finalRank 与 departments.ts
  阶梯(科员→副科级→正科级→副处级→正处级)一致、promotions==promoted步数 —— 0 违例。
- 追加全 500 结局重算(ending.ts 阈值手写复算):GREAT337/BAD125/MID13/GOOD25,
  **0 处与轨迹 endingType 不符**。

## C. 逐字深读(16 人 × 24 步:0-3,100-103,250-253,448,449,498,499)

四种策略×首/中/尾全覆盖,每人结局均亲手验算正确。例:
- idx0(good)GREAT:廉洁100/均分100/rank4,晋升步 3/6/9/12;
- idx1(bad)BAD:廉洁0→风险80,晋升步 6/9,step11 廉洁跌破35后停升(与
  INTEGRITY_GATE 一致);
- idx250(random)GREAT:人脉仅 52 但均分 83.5 达标 —— 单科短板不误伤评级。

**最弱环节(质量注记,非违例)**:
1. 衔接语为固定模板「承接「上一步标题」的余波,事情还没完。」,引用的标题
   真实存在,但 desc 是独立罐装场景、无实际剧情延续(如 step6「老科长退休托付」
   接 step5「信访群众围堵办公楼」);
2. 选项文案取自 CHOICE_BANK 按步轮换,偶与场景语义脱节(如 step6 的
   「如实上报数据口径」不属托付场景),但 A/B/C/D 槽位效果符号语义一致,
   无「婉拒却扣廉洁」式倒挂;
3. hint 固定 4 种(稳妥但费工/程序优先/经营关系/省事但有代价)。
以上均为 server/mockLLM.js 头注释明的罐装设计取舍,六大诉求不含此项,
真实多样性已由 Phase 1 真 API 扫描单独验证(docs/diversity-report.md)。

## 结论

代码(ending.ts/promotion.ts/departments.ts/mockLLM.js)、DB 指标、原始 JSONL
三方交叉一致,**keji/easy 组合 PASS,0 违例**。
