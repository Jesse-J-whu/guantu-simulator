# 审计摘要 jiaoyu/hard(教育部门 · hard,combo_id=29)

**verdict: PASS** | 违规数: 0 | 深读玩家: 16 | 独立重算: 30人 0 违规 + 全量500人结构扫描 0 问题

## A. 全量机械核验(SQL, players WHERE combo_id=29)
- players=500, completed=500, meets_requirements=500
- continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change / llm_errors **全部 = 0**

## 分布合理性
- good 125人: 全 GREAT,晋升均值 3.0(顶格,阶梯共4级)
- bad 125人: 全 BAD,晋升均值 0.98(step9 后廉洁<35 触发 INTEGRITY_GATE 暂缓提拔,与 promotion.ts 一致)
- mixed 123 GREAT + 2 GOOD;random 87 GREAT / 25 GOOD / 8 MID / 5 BAD
- 教育部门三难度晋升均值: easy 2.75 > normal 2.53 > **hard 2.20**,符合 promotion.ts 难度系数设计

## 独立重算(不信 DB,直接读 JSONL)
1. 30人抽样(idx 0-7/120-127/360-367/490-495,按行内 playerIdx 过滤):
   标题 bigram、选项/desc 相似度、clamp(prev+effect)、职级跳变 → **checked 30, violations 0**
2. 全量500人结构扫描: comboId/policy映射/steps=24/字段非空/每选项effect非零/
   effectsApplied=所选effect/finalRank 对阶梯['科员','副科级','正科级','副处级']/
   promotions 计数 → **issues 0**
3. 按 ending.ts 阈值独立重算结局(hard 系数1.3) → **500/500 与记录一致**
4. DB↔JSONL 逐玩家交叉比对 → **0 不一致**

## B. 逐字深读(16人 × 24步,四策略 × 首/中/尾)
idx 0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499
- 衔接 24/24 全通过;属性数学全通过(含 0/100 顶格夹取);职级全通过;
  结局验算全部亲手复核正确(含 idx498 边界案例:廉洁38→risk 80.6≥75 判 BAD)
- 最弱衔接示例: idx0 step12「检查组明天到」→step13「防汛值守第一夜」,
  仅靠模板衔接语「承接「…」的余波」串联,无内容级承接

## 非阻塞质量观察(不构成违规,建议关注)
1. 衔接语为固定模板句,引用的上一步标题均真实存在,但信息量低
2. 选项文案取自四原型池(稳妥/程序/关系/省事),偶与场景语义错位
   (如「家属院的求助」场景配「书面建议暂缓通过」)
3. mock 选项池净收益偏正:random 玩家 70% GREAT、MID2 本组合 0 人触发,
   结局区分度偏低(调参观察)
