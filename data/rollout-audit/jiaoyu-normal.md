# 官途轨迹审计报告 — 教育部门 / normal (combo_id=28)

Verdict: **PASS** — 违规 0 / 500 人

## A. 全量机械核验 (SQL, data/rollout.db)
- players=500, completed=500, meets=500; steps 合计 12000, playerIdx 0-499 连续
- 违规求和全部为 0: continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors
- 结局分布: good→GREAT×125(3 晋升) | bad→BAD×125(晋升 1.12 均值, 1-2 次, integrity<35 后被 INTEGRITY_GATE 截停)
  mixed→GREAT×123+GOOD×2 | random→GREAT×85+GOOD×30+MID×10 — 与策略语义一致

## B. 独立重算 (npx tsx, 30 人: 0-7,120-127,360-367,490-495, 按行内 playerIdx 取样)
- title bigram≥0.55 / choice & desc ≥0.8 / 通用标题 / attr clamp(prev+effect,0..100) /
  rank 仅 +1 / policy==idx%4 / steps==24 → checked 30, violations 0

## C. 逐字深读 (16 人 × 24 步, 每步核对衔接/数值/选项/职级/晋升)
| idx | policy | 晋升@step | 结局 | 终属性(政/执/人/廉) | 验算 |
|----|--------|-----------|------|---------------------|------|
| 0 | good | 3,9,12 | GREAT 副处级 | 100/100/100/100 | ✓ |
| 1 | bad | 6 | BAD 副科级 | 100/66/100/0 | ✓(100≥75) |
| 2 | random | 3,9,18 | GREAT 副处级 | 75/67/53/80 | ✓ |
| 3 | mixed | 3,6,15 | GREAT 副处级 | 96/96/96/93 | ✓ |
| 100 | good | 3,9,12 | GREAT | 全100 | ✓ |
| 101 | bad | 6 | BAD | 100/64/100/0 | ✓ |
| 102 | random | 6,12,18 | GREAT | 100/98/100/99 | ✓ |
| 103 | mixed | 6,9,15 | GREAT | 100/100/100/88 | ✓ |
| 250 | random | 6,9,21 | GREAT | 100/79/86/96 | ✓ |
| 251 | mixed | 3,9,15 | GREAT | 全100 | ✓ |
| 252 | good | 3,9,12 | GREAT | 全100 | ✓ |
| 253 | bad | 6 | BAD | 100/48/100/0 | ✓ |
| 448 | good | 3,6,12 | GREAT | 全100 | ✓ |
| 449 | bad | 6 | BAD | 100/52/100/0 | ✓ |
| 498 | random | 6,12,21 | **GOOD** 副处级 | 81/72/86/69 | ✓(廉69<70 挡 GREAT, 边界生效) |
| 499 | mixed | 3,9,15 | GREAT | 96/96/96/93 | ✓ |

- 晋升全部落在评审步(3/6/9/12/15/18/21)且仅 +1；阶梯与 departments.ts 一致(科员→副科→正科→副处, 顶 3 次)
- 属性数学逐行验算通过，clamp 多次真实生效(97+4→100, 100-4→96, integrity 触底 0 保持)
- DB 与原始 JSONL 逐字段一致(playerIdx/policy/ending/promotions/finalRank)

## 软性发现 (不构成违规)
1. 承接句为固定模板「承接「X」的余波」，非空且指真实前步标题，但剧情实质承接弱
   (最弱: p0 step12「检查组明天到」←「饭局座次玄机」仅靠模板句)
2. 选项文案与场景偶有错位；四个 hint 恒定不变(稳妥但费工/程序优先/经营关系/省事但有代价) — mock LLM 罐头痕迹
3. 非 bad 玩家全部打到 4 级 ladder 顶(晋升封顶)，饱和但机制自洽
4. 罐头场景跨玩家复用属设计预期；局内 24 步查重(title/desc/choice)全部通过
