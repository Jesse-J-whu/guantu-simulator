# 轨迹审计摘要 — fagaB/normal(发改委 · normal, combo_id=13)

**verdict: PASS** | 违规数: 0 | 深读玩家: 16 人 × 24 步 = 384 步逐字读完

## A. 全量机械核验(500 人)
- SQL(combo_id=13): players=500, completed=500, meets=500;
  continuity_missing/title_dup/choice_dup/desc_dup/generic_titles/attr_zero_offered/
  attr_not_applied/rank_residual/illegal_rank_change/llm_errors **全部为 0**。
- 独立重算(npx tsx 从 JSONL 按 playerIdx 字段取样, 非按行号):
  **checked 30, violations 0**(策略覆盖 good7/bad7/random8/mixed8)。
- JSONL 卫生检查: 500 行=500 个不同 playerIdx, 行号==playerIdx, policy==[good,bad,random,mixed][idx%4] 无错配。
- 分布(诉求5/6): good→GREAT×125(avg晋升4.01); bad→BAD×125(1.18, 廉洁全跌到0);
  mixed→GREAT×124+GOOD×1(3.94); random→GREAT×80/GOOD×37/MID×8(3.40)。
  跨难度晋升均值 easy 4.04 > normal 3.10 > hard 2.28, 与 promotion.ts 难度成本设计一致。

## B. 逐字深读(16 人: idx 0-3, 100-103, 250-253, 448-449, 498-499)
每人 24 步全部读完, 结论一致:
1. **衔接**: continuity 全非空; 衔接语引用的「上一步标题」在 16 人 384 步中 100% 真实存在(机械+肉眼双核)。
2. **不重复**: 每局 24 标题、24 段正文、全部选项文案局内零雷同(与机械结论互相印证); 标题与正文同属一个场景单元。
3. **属性**: 每张选项卡 effect 至少 1 项非零; attrsAfter==clamp(prev+effectsApplied) 逐帧吻合(含 0/100 顶格夹取)。
4. **职级**: rankAfter 仅在 promoted=true 时 +1; finalRank 与 departments.ts 阶梯
   [科员,副科级,正科级,副处级,正处级,副厅级] 逐人核对一致; promotions 计数与晋升步一致。
5. **晋升体验**: good 4-5 次 / mixed 3-4 次 / random 3-4 次 / bad 1-2 次, 节奏合理非 0 非满。
6. **结局**: 16 人结局按 ending.ts 阈值(normal 系数 1.0)手工验算全对,
   如 p250 GREAT(廉洁74/均分82.5/rank3, 贴着廉洁≥70 线)、p1 BAD((100-0)×1.0=100≥75)。

## 质量观察(非违例, mock LLM 固有, 建议真实接入时改进)
1. **衔接语模板化**: 第 2-24 步清一色「承接「X」的余波,事情还没完。」, 所引标题正确但 desc 是自足新场景,
   不实际延续上一步剧情。最弱一例: p0 S13「防汛值守第一夜」自称承接「检查组明天到」余波, 正文对检查组只字未提。
2. **人设漂移**: 王建国在 S1/S7/S13 是同事/领导、S21 变投标商; 刘志强在 S4/S9/S18 是副局长、S24 变纪检组长(16 人皆然)。
3. **选项贴合度**: 选项按四原型从通用池生成, 个别场景贴合松散, 如 S9「副科长职位空缺」配「先停职检查再定性/建议列入下期议程」。

## 结论
六大诉求(局内三层去重 / 属性数学 / 职级事实 / 晋升节奏 / 结局评级 / 完成度)500 人零违例, 判定 **PASS**。
