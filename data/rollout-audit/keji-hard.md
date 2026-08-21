# 审计摘要:科技部门 · hard(combo_id=32)

verdict: **PASS** · 违规 0 · 深读 16 人 · 独立重算 30 人(tsx)+ 500 人全量(python)

## A. 全量机械核验(SQL, players WHERE combo_id=32)
- players=500, completed=500, meets=500;十项违例 SUM 全 0
  (continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/
  attr_zero_offered/attr_not_applied/rank_residual/illegal_rank_change/llm_errors)
- bg_ok=500, steps_done 全 24,steps 表 12000 行=500×24,ip/seed 各 500 唯一
- 分布:good→GREAT 125(prom 3.0);bad→BAD 125(prom 0.992,廉洁全归 0);
  mixed→GREAT 125(prom 2.896);random→GREAT 81/GOOD 33/BAD 10/MID 1
- 难度梯度:keji 晋升均值 easy 3.498 < normal 3.026 < hard 2.248,
  符合 promotion.ts(hard 积分×0.8、成本×1.3;keji promotion 星 3 → deptFactor 1.0)

## 独立重算(不信 DB,从 JSONL 原始数据)
- npx tsx 模板脚本原样跑抽样 {0-7,120-127,360-367,490-495}(按行内 playerIdx 过滤):
  lines 500 policies ok true / checked 30 violations 0
- 追加 python 全量 500 人复算:属性夹取 clamp(prev+effect)、promoted↔rankAfter 联动、
  结局阈值(ending.ts)、promotions/finalRank 字段 → 违规 0、错配 0
- 行序核对:line==playerIdx 与 policy==[good,bad,random,mixed][idx%4] 全量成立

## B. 逐字深读 16 人(0,1,2,3,100,101,102,103,250,251,252,253,448,449,498,499)
| idx | policy | prom | ending | finalRank | 验算 |
|----|--------|------|--------|-----------|------|
| 0/100/252/448 | good | 3 | GREAT | 副处级 | 廉洁100·均分≥99·rank3 ✓ |
| 3/103/499 | mixed | 3 | GREAT | 副处级 | 廉洁88-97·均分≥92·rank3 ✓ |
| 2/102/250/498 | random | 2 | GREAT | 正科级 | 廉洁78-94·均分76-94·rank2 ✓ |
| 251 | mixed | 2 | GREAT | 正科级 | 廉洁87·均分92·rank2 ✓ |
| 1/101/253/449 | bad | 1 | BAD | 副科级 | (100-0)×1.3=130≥75 ✓ |

- 衔接:16 人×24 步 continuity 全非空,承接语引用的上一步标题均真实存在;
  finalRank 全部落在 departments.ts keji 阶梯(科员/副科级/正科级/副处级/正处级)
- 一局内 24 标题/24 正文/选项文案无雷同(bigram<0.55、相似度<0.8,肉眼复核一致)

## 发现(mock-LLM 质量观察,非规则违例)
1. 衔接语为固定模板「承接「上一步标题」的余波…」,desc 本身是独立罐头场景,
   剧情实质延续弱(最弱例:P0 step7「材料改到第七稿」接 step6「老科长退休托付」)
2. 选项池为四原型(稳妥/程序/关系/省事),与个别场景贴合度低
   (P100 step22 家属院水管爆裂 →「书面建议暂缓通过」)
3. bad 玩家中期廉洁夹 0 后选择不再改变结局;mixed 与 good 结局同档均 100% GREAT,
   hard 下区分度主要体现在晋升次数(2.9 vs 3.0)而非结局类型
