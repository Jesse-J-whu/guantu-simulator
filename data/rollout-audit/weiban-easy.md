# 审计报告 combo 0 · 委办(党委办公室) / easy

- **verdict: PASS**(违规 0;口径内已知限制见下)
- 范围:`data/rollout-traj/weiban-easy.jsonl` 500 人 × 24 步 + `data/rollout.db` combo_id=0

## 机械核验(SQL,全量 500)
- players 500 / completed 500 / meets_requirements 500 / bg_ok 500;steps 12,000 行(500×24)
- 违规计数全 0:continuity_missing、title_dup、choice_dup、desc_dup、generic_titles、attr_zero_offered、attr_not_applied、rank_residual、illegal_rank_change、llm_errors
- 晋升合计 2,059 次,全部落在考核步(step%3==0),非考核期晋升 0

## 独立重算(npx tsx,不信任 DB,按行内 playerIdx 过滤)
- 模板抽样 30 人(idx 0-7/120-127/360-367/490-495):0 违规
- 对向扩展全 500 人:policy==idx%4、24 步齐全、effectsApplied==所选效果、每选项≥1 非零效果、clamp(prev+effect)==attrsAfter、promoted⇒rank+1、finalRank 对照委办阶梯、结局按 ending.ts(easy ×0.8)重算——全部 0 违规
- 重算结局分布 {GREAT 328, BAD 125, GOOD 40, MID 6, MID2 1} 与 DB 逐人一致

## 分布
| policy | 结局 | 晋升 avg/min/max |
|---|---|---|
| good | GREAT 125 | 5.00 / 5 / 5 |
| bad | BAD 125 | 2.152 / 2 / 3 |
| mixed | GREAT 121, GOOD 4 | 4.944 / 4 / 5 |
| random | GREAT 82, GOOD 36, MID 6, MID2 1 | 4.376 / 2 / 5 |

## 逐字深读(16 人:0-3, 100-103, 250-253, 448-449, 498-499,每步全读)
- 16/16 通过:衔接 24/24、属性数学精确(含 0/100 夹取)、职级转移合法、结局阈值验算全部与引擎判定一致
- 代表:P499 mixed 5 晋升至顶 100/100/94/100→GREAT;P498 random 4 晋升 65/87/85/64→GOOD(廉洁 64<70 不入 GREAT,验算正确);P101 bad 2 晋升卡正科级、廉洁归 0→BAD((100-0)×0.8=80≥75)

## 发现(口径内,不计违规)
1. 500 人共用同一 24 场景罐装序列、同顺序、同开场白,差异仅剩数值抖动(±1~3, seed=77000000+idx)与策略——mock 口径已豁免跨玩家相同
2. 衔接语全部为模板「承接「上一步标题」的余波…」,desc 自包含、无实质剧情承接;最弱链在 S13→S14→S15 连续跳场(防汛→座次牌→扶贫村)
3. 选项提示语固定四原型槽(稳妥但费工/程序优先/经营关系/省事但有代价),选项文案与场景松散匹配(如「座次牌」配「引入审计专项核查」)
4. bad 策略 125 人晋升全部冻结在 2~3 次:廉洁跌破 INTEGRITY_GATE=35 后 promotion.ts 暂缓提拔,good 125/125 恰 5 次到顶——策略完全决定结局,无个体逃逸,与设计一致但离散度极小
