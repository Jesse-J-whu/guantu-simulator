# 轨迹审计摘要 — weiban/hard(委办·hard,combo_id=2)

**verdict: PASS** | 违规数 0 | 深读 16 人 | 独立重算 30/30 通过 + 全 500 人原始重算 0 违规

## A. 全量机械核验(500 人)
- SQL(combo_id=2):players=500, completed=500, meets=500, bgOk=500;
  continuity_missing / title_dup / choice_dup / desc_dup / generic_titles /
  attr_zero_offered / attr_not_applied / rank_residual / illegal_rank_change /
  llm_errors / track_failures **全部 SUM=0**。
- 独立重算(npx tsx,按 playerIdx 字段取样 0-7/120-127/360-367/490-495):
  checked 30, violations 0。
- 加强项(python3 原始 JSONL 全 500 人):属性 clamp 数学、职级跳变
  (仅 promoted +1)、promotions 计数、finalRank 对照 departments.ts 阶梯
  (科员→副科级→正科级→副处级→正处级→副厅级)、按 ending.ts 阈值
  (hard 系数 1.3)重算结局 —— 全部 0 违规;策略映射 idx%4 全部吻合。

## 分布合理性
| policy | 结局分布 | 晋升均值 |
|---|---|---|
| good | GREAT 125/125 | 3.00 |
| bad | BAD 125/125 | 1.00 |
| mixed | GREAT 125/125 | 2.98 |
| random | GREAT 82 / GOOD 31 / MID 3 / BAD 9 | 2.53 |

weiban 晋升均值:easy 4.12 > normal 3.40 > **hard 2.34**,与 promotion.ts
难度系数(0.8/1.0/1.3)方向一致。bad 玩家 s9 晋升后廉洁跌破 35 被
"暂缓提拔",INTEGRITY_GATE 生效,符合设计。

## B. 逐字深读(16 人:0-3,100-103,250-253,448,449,498,499)
- 衔接 24/24 非空;一局内 24 标题/24 正文/选项文案零重复(肉眼+机械双确认)。
- 每步 chosen 效果真实反映到 attrsAfter;每张卡 effect 至少 1 项非零。
- 结局验算全部正确,含两例边界:250(廉洁56→GOOD,risk 57.2)、
  498(廉洁74/均分74.75/rank2 压线 GREAT)。

## 观察项(非违例)
1. 衔接语是统一模板句「承接「上一步标题」的余波,事情还没完」:非空且引用
   标题真实存在,但 desc 常为全新场景、无实质承接细节
   (例:p0 step13《防汛值守第一夜》接《检查组明天到》)—— mock LLM 罐装单元预期。
2. 选项文案取自通用池,个别与场景不贴(如信访场景出现「与竞争者私下沟通」)。
3. bad 玩家偶选正向选项(如 p1 step18 [1])经核对是 argmax(corrupt) 最高分
   (10>7),为 pickChoice 正确行为,非策略错配。
4. random 策略 66% GREAT:正向选项在池中占多数,均匀随机天然偏正向,方向合理。

**结论**:500 条轨迹满足六大诉求,无真实违例;建议真实 LLM 接入后
重点复核"模板化衔接"与"选项-场景贴合度"两点。
