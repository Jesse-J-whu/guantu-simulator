# 轨迹审计 subagent 提示词模板(v4 定点复审)

> 说明:E4 晋升平衡调优(`promotion.ts` hard 成本系数 1.3 → 1.2,2026-08-22)
> 触发 19,500 人全量重跑(v4)。本次只对**行为实际变化**的组合做定点深审:
> `weiban/hard`(combo 2,五星,预期 good 3.00→4.00)、`zuzhiB/hard`(combo 8,
> 五星+最长阶梯)、`fagaB/hard`(combo 14,四星,对照组,预期仍 3.00)。
> 其余 36 组合 v3 审计结论归档于 `data/rollout-audit/`(引擎行为未变:
> easy/normal 轨迹逐字节同构,hard 其余部门只可能因成本下降而多升不升反降)。
> 模板基于 `docs/audit-prompt-template.md`(v3,39 组合全量版),改动三处:
> 输出目录、hard 系数口径(1.2)、新增 C 节晋升专项核验。

---

你是官途模拟器 E4 晋升平衡调优重跑(v4)的**轨迹审计员**,负责组合
`{{DEPT_ID}}/hard`({{DEPT_NAME}} · hard 难度,combo_id={{COMBO_ID}})。
该组合 500 名模拟玩家已完成完整对局。**本次重跑的唯一引擎改动**:
`src/engine/promotion.ts` 的 `DIFFICULTY_FACTOR.hard` 由 1.3 调至 **1.2**
(easy/normal 不变;`ending.ts` 的难度系数是独立常量,未动)。
**你的任务是发现问题,不是背书** —— 凡有疑点追查到底。

仓库根目录:`/mnt/data2/sw/chenqa/guantu-simulator`

## 数据

1. **全量轨迹**:`data/rollout-traj/{{DEPT_ID}}-hard.jsonl` — 500 行,
   每行一名玩家完整轨迹(JSON),字段:
   - `playerIdx`(0..499)、`policy`(`= ['good','bad','random','mixed'][playerIdx%4]`)、`seed`、`ip`
   - `steps[24]`:每步 `{step, year, title, tagLabel, continuity, desc, choices:[{text,hint,effect}], chosenIdx, effectsApplied, attrsAfter, rankAfter, promoted}`
   - `endingType/endingTitle/finalRank/evalText/promotions/bgOk` 与合规计数字段
2. **分析库**:`data/rollout.db`(sqlite,v4 重跑后新建)。用
   `node --experimental-sqlite -e "..."` 只读查询(players/steps 表)。
3. **引擎事实来源**:`src/engine/departments.ts`(阶梯)、`src/engine/ending.ts`、
   `src/engine/promotion.ts`(**hard 系数 1.2,星级系数 = 1−(星−3)×0.06**)

**口径说明(先读懂,避免误报)**:本批 rollout 用 mock LLM(30 个罐装场景单元,
一局内场景互不相同)。**跨玩家**相同标题/文案是预期行为,不算违规;要求的是
**一局之内**不重复(标题/选项/正文三层)。属性夹取在 0..100,顶格后再加属正常。
**JSONL 行序是并发完成序,与 playerIdx 无关** —— 取样必须按行内 `playerIdx`
字段过滤,不能按行号索引。

## 审计任务

### A. 全量机械核验(500 名玩家,一个都不能少)

用 SQL 查 `players WHERE combo_id={{COMBO_ID}}`:

```sql
SELECT COUNT(*) players, SUM(completed) completed, SUM(meets_requirements) meets,
       SUM(continuity_missing), SUM(title_dup), SUM(choice_dup), SUM(desc_dup),
       SUM(generic_titles), SUM(attr_zero_offered), SUM(attr_not_applied),
       SUM(rank_residual), SUM(illegal_rank_change), SUM(llm_errors)
FROM players WHERE combo_id={{COMBO_ID}};
```

要求:players=500,completed=500,meets=500,其余 SUM 全部为 0。
任何非 0 → 逐一列出违规玩家并深入其轨迹 JSONL 定位(也可能是审计器误报,
如实区分,给出证据)。

### B. 独立重算(30 人抽样,不信 DB 数字)

用 `npx tsx` 从原始 JSONL 重算抽样(`playerIdx ∈ 0-7, 120-127, 360-367, 490-499`)
的标题重复(bigram≥0.55)/选项重复(≥0.8)/属性数学(clamp(prev+effect))/
职级跳变(仅 promoted 时 +1):

```bash
cd /mnt/data2/sw/chenqa/guantu-simulator && npx tsx -e "
import { readFileSync } from 'node:fs';
import { titleSimilarity, similarity, isGenericTitle } from './src/engine/dedup.ts';
const K=['politics','execute','network','integrity'];
const SAMPLE=[0,1,2,3,4,5,6,7,120,121,122,123,124,125,126,127,360,361,362,363,364,365,366,367,490,491,492,493,494,495];
const byIdx = new Map(readFileSync('data/rollout-traj/{{DEPT_ID}}-hard.jsonl','utf8').split('\n').filter(Boolean).map(l=>{const p=JSON.parse(l);return [p.playerIdx,p];}));
let bad=0, checked=0;
for (const idx of SAMPLE) {
  const p = byIdx.get(idx); if (!p) { console.log('MISSING', idx); bad++; continue; }
  checked++;
  const titles=[]; const descs=[]; const choices=[]; let prev={politics:50,execute:50,network:50,integrity:80}; let rank=0;
  for (const s of p.steps) {
    if (titles.some(t=>titleSimilarity(t,s.title)>=0.55)) { console.log('TITLE-DUP', idx, s.step); bad++; }
    if (isGenericTitle(s.title)) { console.log('GENERIC', idx, s.step); bad++; }
    if (descs.some(t=>similarity(t,s.desc)>=0.8)) { console.log('DESC-DUP', idx, s.step); bad++; }
    for (const c of s.choices) { if (choices.some(t=>similarity(t,c.text)>=0.8)) { console.log('CHOICE-DUP', idx, s.step); bad++; } choices.push(c.text); }
    for (const k of K) { const e=Math.max(0,Math.min(100,prev[k]+(s.effectsApplied[k]??0))); if (e!==s.attrsAfter[k]) { console.log('ATTR', idx, s.step, k); bad++; } }
    if (s.promoted ? s.rankAfter-rank!==1 : s.rankAfter!==rank) { console.log('RANK', idx, s.step); bad++; }
    titles.push(s.title); descs.push(s.desc); rank=s.rankAfter; prev=s.attrsAfter;
  }
}
console.log('checked', checked, 'violations', bad);
"
```

### C. 晋升专项核验(本次改动的直接对象,必做)

1. **分布对照**:
   ```sql
   SELECT policy, promotions, COUNT(*) n FROM players WHERE combo_id={{COMBO_ID}}
   GROUP BY policy, promotions ORDER BY policy, promotions;
   ```
   预期(v4,系数1.2):good 玩家 125 人应为 {{GOOD_EXPECT}} 次;bad ≈1;
   mixed/random 居中。与上界模拟(`data/promo-balance/ceiling-hard1.2.json`,
   200 种子)对照,偏差大要解释。
2. **点数数学抽验**:任取 3 名 good 玩家,从轨迹逐步重算绩效点
   (`gainPromotionPoints` 的口径:clamp(0..5, 2+净效果/8) + 廉洁正加1 +
   机遇加1,hard ×0.8,四舍五入到 0.5),对照每次 promoted=true 的步
   `step%3===0`(或 effect.promotion>0 的立即考核),验算晋升时点数 ≥
   该级成本(1.2 口径:`PROMOTION_COSTS[rank]×1.2×星级系数`,{{DEPT_ID}}
   星级系数 = {{STAR_FACTOR}},四级累计 = {{CUM4}})。给出三人的
   「步序 → 点数余额 → 成本 → 是否晋升」表。
3. **叙事合理性**:第 4 次晋升(若存在)前后的 continuity/desc 是否把
   「提拔」讲得通(不得出现未晋升却自称升职、晋升了却仍称原职的叙事错位)。
4. **廉洁闸门**:bad/mixed 中廉洁跌破 35 后是否存在「点数够却暂缓提拔、
   廉洁回血后补升」的实例,摘 1 例(步序+廉洁值)。

### D. 逐字深读(≥15 名玩家,每名 24 步全部读完)

抽样:`playerIdx ∈ {0,1,2,3, 100,101,102,103, 250,251,252,253, 448,449,498,499}`
(四策略 × 首/中/尾;good 玩家必须读满,本次改动的效果主要在 good 身上)。
通读开场白、每步 title/continuity/desc/全部选项文案、结局 evalText,核验:

1. **故事衔接**:每步 continuity 非空且 desc 有承接;摘录衔接最弱的一步。
2. **文案不重复**:24 标题/24 正文/选项不跨步雷同;标题与正文主题一致。
3. **属性变化**:每张选项卡 effect 至少 1 项非零;效果真实反映到 attrsAfter。
4. **职级事实**:rankAfter 仅 promoted 时 +1;finalRank 与 departments.ts 阶梯一致。
5. **晋升体验**:promotions 总数与 C 节分布一致;good 玩家第 4 次晋升(若有)
   出现的年份是否合理(不早于第 12 步为宜)、叙事是否成立。
6. **结局评级**:读 ending.ts 阈值(BAD: (100−廉洁)×难度系数≥75,难度系数
   是 ending 自己的常量 1.3,与本次改动无关;GREAT: 廉洁≥70 且均分≥60 且
   rank≥2),用最终 attrs 亲手验算判定是否正确。

每人记录:{playerIdx, policy, promotions, endingType, finalRank,
衔接:"24/24", 属性数学:"通过", 职级:"通过", 结局验算:"…", 最弱一步:"step N …", 备注}。

## 输出(必须写两个文件)

1. `data/rollout-audit-v4/{{DEPT_ID}}-hard.json`:
```json
{
  "combo": "{{DEPT_ID}}/hard", "comboId": {{COMBO_ID}},
  "deptName": "{{DEPT_NAME}}", "difficulty": "hard",
  "engineChange": "DIFFICULTY_FACTOR.hard 1.3→1.2 (E4)",
  "playersTotal": 500,
  "mechanicalChecks": { "sql": {…}, "independentRecheck": {"checked": 30, "violations": 0} },
  "promotionCheck": { "distByPolicy": {…}, "pointMath": [ …3 人表… ], "narrative": "…", "integrityGateCase": "…" },
  "violations": [ { "playerIdx": 0, "step": 0, "kind": "…", "detail": "…" } ],
  "playersDeepRead": [ {…每人一条…} ],
  "verdict": "PASS|FAIL",
  "summary": "一句话结论(含深读人数与发现)"
}
```
2. `data/rollout-audit-v4/{{DEPT_ID}}-hard.md`:≤40 行人读摘要。

**verdict 判定**:500 玩家全部完成且六大诉求 0 违例(或仅有已解释的审计器
误报,需给出证据)→ PASS;任何真实违例 → FAIL 并详细列出。

最终回复(纯文本,≤10 行):verdict、违规数、深读玩家数、独立重算数字、
good 玩家晋升分布实测 vs 预期、1-2 句最值得说的发现。
