# 轨迹审计摘要:财政部门(caizhi)· normal · combo_id=16

**verdict: PASS** — 500 玩家,六大诉求 0 违例(2026-08-21)

## A. 全量机械核验(SQL,data/rollout.db)
- players=500,completed=500,meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors 全部 = 0
- 附加 sanity:playerIdx 0-499 无缺无重;policy 与 playerIdx%4 全部匹配;steps 12000 行(500×24);
  attr_nonzero=12000;rank_fixes=0;每步 4 选项;bg_ok=500

## 独立重算(npx tsx,原始 JSONL,按 playerIdx 字段取样)
- 抽样 30 人(idx 0-7、120-127、360-367、490-495,四策略各≥7)
- 标题 bigram≥0.55 / 选项相似度≥0.8 / desc 相似度≥0.8 / clamp(prev+effect) / promoted→rank+1
- **checked 30,violations 0** —— 与 DB 结论互相印证

## 分布(诉求5/6)
| policy | 结局分布 | 晋升均值 |
|---|---|---|
| good | GREAT 125 | 4.00 |
| bad | BAD 125 | 1.08 |
| mixed | GREAT 125 | 3.82 |
| random | GREAT 82 / GOOD 30 / MID 11 / BAD 2 | 3.16 |

- caizhi 跨难度晋升均值:easy 3.50 > normal 2.99 > hard 2.23,符合 promotion.ts(难度系数 0.8/1.0/1.3)
- 观察:random 玩家 65.6% GREAT(4 类选项中 C0/C1 净正向,对随机选择偏宽容);good/mixed 属性普遍封顶、结局同质

## B. 逐字深读(16 人 × 24 步 = 384 步,四策略 × 首/中/尾)
- idx 0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499
- 衔接 24/24(衔接语非空且引用的上一步标题真实存在);属性数学、职级跳变全部通过
- 结局逐人手工验算 16/16 正确,含两个边界样本:
  - idx 102(random):廉洁 69,差 1 分未达 GREAT 门槛 70 → GOOD 判定正确
  - idx 1/101/253/449(bad):(100-0)×1.0=100≥75 → BAD 正确;廉洁跌破 35 后晋升全被
    INTEGRITY_GATE 暂缓,与 promotion.ts 行为一致

## 质量观察(非违例,mock 设计使然)
1. 衔接语全部为固定模板"承接「上一步标题」的余波,事情还没完。"——机械项通过,但 desc 为
   独立罐装场景,不承接上一步选择的剧情后果(例:idx 0 step 12 检查组→step 13 防汛值守)。
2. 选项取自按 hint 分类的共享池(server/mockLLM.js),个别与场景语义错位:
   防汛值守场景出现"收下购物卡再说"(idx 102 step 13)等。一局内不重复达标,场景贴合度
   留待真 LLM 版本(Phase 1 已单独验证,docs/diversity-report.md)。

## 结论
全量 SQL 核验、30 人独立重算、16 人逐字深读三层证据一致:无任何真实违例。**PASS**。
