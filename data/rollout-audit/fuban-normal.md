# 轨迹审计:fuban/normal(府办·normal,combo_id=4)

**verdict: PASS** — 500/500 完成,六大诉求 0 违例;深读 16 人全部通过。

## A. 全量机械核验(SQL,data/rollout.db)
- players=500, completed=500, meets_requirements=500;steps 12000 行(500×24);promoted 步数 1545 == SUM(promotions) 1545;bg_ok=0、track_failures>0 均 0 人
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles / attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors = **全 0**

## 分布(诉求5/6)
| policy | n | 结局 | 晋升均值 |
|---|---|---|---|
| good | 125 | GREAT×125 | 4.00 |
| bad | 125 | BAD×125 | 1.08 |
| mixed | 125 | GREAT×123 / GOOD×2 | 3.96 |
| random | 125 | GREAT×82 / GOOD×36 / MID×6 / BAD×1 | 3.32 |

跨难度晋升均值 easy 3.50 > normal 3.09 > hard 2.28,与 promotion.ts 难度系数 0.8/1.0/1.3 方向一致;bad 玩家廉洁单调归零触发落马,无"bad 全 GREAT"类异常。

## B. 独立重算(不信 DB,直接读 JSONL)
- 模板 30 人抽样(0-7/120-127/360-367/490-495,按行内 playerIdx 取样):**checked 30, violations 0**
- 加严为全量 500 人重算:**checked 500, violations 0**,覆盖:policy=idx%4 匹配、24 步、chosenIdx 合法、每卡 ≥1 非零效果、effectsApplied==所选卡片 effect、clamp(prev+effect)==attrsAfter(12000 步)、rank 仅 promoted 时 +1、finalRank 对照 departments.ts 阶梯[科员→副科级→正科级→副处级→正处级]、按 ending.ts 阈值重算 endingType 全部一致;标题/正文/选项重复与泛化套话标题全量 0 命中;衔接语引用的「上一步标题」0 幽灵引用。

## C. 逐字深读(16 人 × 24 步:0-3/100-103/250-253/448,449,498,499)
- 衔接 16/16 通过(最弱见下);属性数学、职级、结局手工验算 16/16 通过
- 验算示例:P2(廉洁60/均分83.5/rank3→GOOD)、P250(廉洁88/均分92.75/rank3→GREAT)、P1/P101/P253/P449(廉洁0,risk=100≥75→BAD)均与 ending.ts 吻合;bad 玩家廉洁跌破 35 后晋升即被暂缓(仅 step6 一次晋升),与 INTEGRITY_GATE 一致

## 发现(均为非违例观察)
1. **衔接语是罐装模板句**:第 2-24 步全部为「承接「上一步标题」的余波,事情还没完。」,引用的标题真实存在,但新事件与上一事件多为并列场景。证据:P0 step15「扶贫村的第一周」承接「会议室的座次牌」,无剧情因果。
2. **选项文案来自通用动作池**(server/mockLLM.js 的 CHOICE_BANK 按步轮换),常与场景脱节。证据:P0 step6「老科长退休托付」的选项是「如实上报数据口径/找纪检熟人通个气」等;效果已按槽位语义(A 正面/B 程序/C 关系/D 消极)绑定,无语义倒挂。
3. 跨玩家共用同一 30 单元罐装场景序列(distinct title=24/12000)属 mock 预期口径,不计违规。

**结论**:六大诉求在 fuban/normal 的 500 条轨迹上全部成立;两条观察建议真实 GLM 上线时重点回归(衔接剧情化、选项贴合场景)。
