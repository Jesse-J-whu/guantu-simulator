/**
 * rollout 独立复核 — 不信任 driver 运行时的合规计数,从存储的全量轨迹
 * (data/rollout-traj/*.jsonl)逐玩家重算全部六大诉求指标,回写 players 表
 * 并重新生成 data/rollout-summary.json。双重复核:即使 driver 有 bug,
 * 最终数字也以本脚本对原始轨迹的独立重算为准。
 *
 * 用法:NODE_OPTIONS=--experimental-sqlite npx tsx scripts/rollout-recheck.mts
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixRankFacts } from '../src/engine/rankRules.ts';
import {
  isGenericTitle, similarity, titleSimilarity, TITLE_DUP_THRESHOLD, CHOICE_DUP_THRESHOLD,
} from '../src/engine/dedup.ts';

const ROOT = resolve(import.meta.dirname, '..');
const TRAJ_DIR = resolve(ROOT, 'data', 'rollout-traj');
const ATTR_KEYS = ['politics', 'execute', 'network', 'integrity'] as const;

const db = new DatabaseSync(resolve(ROOT, 'data', 'rollout.db'));
const files = readdirSync(TRAJ_DIR).filter((f) => f.endsWith('.jsonl')).sort();
if (files.length === 0) {
  console.error('data/rollout-traj/ 下没有轨迹文件');
  process.exit(1);
}

const upd = db.prepare(`
  UPDATE players SET steps_done=?, completed=?, ending_type=?, final_rank=?, promotions=?, bg_ok=?,
    continuity_missing=?, title_dup=?, choice_dup=?, desc_dup=?, generic_titles=?, attr_zero_offered=?,
    attr_not_applied=?, rank_residual=?, illegal_rank_change=?, meets_requirements=?
  WHERE combo_id=? AND player_idx=?
`);

let recomputed = 0;
const globalDrift: string[] = []; // 重算值与 driver 值不一致的玩家(应为空)

for (const f of files) {
  const comboTag = f.replace('.jsonl', '');
  for (const line of readFileSync(resolve(TRAJ_DIR, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const p = JSON.parse(line) as {
      comboId: number; playerIdx: number; bgOk: boolean;
      steps: Array<{
        title: string; continuity: string; desc: string; promoted: boolean; rankAfter: number;
        choices: Array<{ text: string; effect: Record<string, number> }>; chosenIdx: number;
        effectsApplied: Record<string, number>; attrsAfter: Record<string, number>;
      }>;
      endingType: string; finalRank: string; promotions: number;
    };

    let continuityMissing = 0;
    let titleDup = 0;
    let choiceDup = 0;
    let descDup = 0;
    let genericTitles = 0;
    let attrZeroOffered = 0;
    let attrNotApplied = 0;
    let rankResidual = 0;
    let illegalRankChange = 0;

    const usedTitles: string[] = [];
    const usedChoices: string[] = [];
    const usedDescs: string[] = [];
    let prevRank = 0;
    // 初始属性与 createGame 一致。
    let prevAttrs: Record<string, number> = { politics: 50, execute: 50, network: 50, integrity: 80 };

    for (const s of p.steps) {
      if (!(s.continuity || '').trim()) continuityMissing++;
      if (isGenericTitle(s.title)) genericTitles++;
      if (usedTitles.some((t) => titleSimilarity(t, s.title) >= TITLE_DUP_THRESHOLD)) titleDup++;
      if (usedDescs.some((t) => similarity(t, s.desc) >= CHOICE_DUP_THRESHOLD)) descDup++;
      for (const c of s.choices) {
        if (ATTR_KEYS.every((k) => (c.effect[k] ?? 0) === 0)) attrZeroOffered++;
        if (usedChoices.some((t) => similarity(t, c.text) >= CHOICE_DUP_THRESHOLD)) choiceDup++;
      }
      rankResidual += fixRankFacts(s.desc).fixes.length;

      // 属性数学:after == clamp(before + effect)(全量核对,非抽样)。
      const applied = s.effectsApplied ?? {};
      for (const k of ATTR_KEYS) {
        const expect = Math.max(0, Math.min(100, (prevAttrs[k] ?? 0) + (applied[k] ?? 0)));
        if (expect !== (s.attrsAfter[k] ?? -1)) attrNotApplied++;
      }
      // 供给选项全零也违例(与 driver 同口径,对 chosen 项计入一次即可——driver 对
      // 每张选项卡计一次,这里按选项卡口径保持一致,上面已计)。
      // 职级:promoted → +1;否则不变。
      if (s.promoted ? s.rankAfter - prevRank !== 1 : s.rankAfter !== prevRank) illegalRankChange++;
      prevRank = s.rankAfter;
      prevAttrs = s.attrsAfter;

      usedTitles.push(s.title);
      usedDescs.push(s.desc);
      for (const c of s.choices) usedChoices.push(c.text);
    }

    const completed = p.endingType !== 'ABORTED' && p.steps.length > 0;
    const meets = completed && continuityMissing === 0 && titleDup === 0 && choiceDup === 0
      && descDup === 0 && genericTitles === 0 && attrZeroOffered === 0 && attrNotApplied === 0
      && rankResidual === 0 && illegalRankChange === 0 && p.finalRank !== '';

    const old = db.prepare(
      'SELECT continuity_missing,title_dup,choice_dup,desc_dup,generic_titles,attr_zero_offered,attr_not_applied,rank_residual,illegal_rank_change FROM players WHERE combo_id=? AND player_idx=?',
    ).get(p.comboId, p.playerIdx) as Record<string, number> | undefined;
    upd.run(
      p.steps.length, completed ? 1 : 0, p.endingType, p.finalRank, p.promotions, p.bgOk ? 1 : 0,
      continuityMissing, titleDup, choiceDup, descDup, genericTitles, attrZeroOffered,
      attrNotApplied, rankResidual, illegalRankChange, meets ? 1 : 0,
      p.comboId, p.playerIdx,
    );
    if (old && (
      old.continuity_missing !== continuityMissing || old.title_dup !== titleDup
      || old.choice_dup !== choiceDup || old.desc_dup !== descDup || old.generic_titles !== genericTitles
      || old.attr_zero_offered !== attrZeroOffered || old.attr_not_applied !== attrNotApplied
      || old.rank_residual !== rankResidual || old.illegal_rank_change !== illegalRankChange
    )) {
      globalDrift.push(`${comboTag}#${p.playerIdx}: ${JSON.stringify(old)} → ${JSON.stringify({ continuityMissing, titleDup, choiceDup, descDup, genericTitles, attrZeroOffered, attrNotApplied, rankResidual, illegalRankChange })}`);
    }
    recomputed++;
  }
}

// ---- 轨迹文件按 playerIdx 排序回写 ----
// driver 并发完成导致 JSONL 行序≈完成序;排序后行号==playerIdx,
// 下游(审计 subagent/人工抽查)可直接按行索引,不再有错位陷阱。
for (const f of files) {
  const fp = resolve(TRAJ_DIR, f);
  const lines = readFileSync(fp, 'utf8').split('\n').filter((l) => l.trim());
  lines.sort((a, b) => (JSON.parse(a).playerIdx - JSON.parse(b).playerIdx));
  writeFileSync(fp, lines.map((l) => l + '\n').join(''));
}
console.log(`轨迹文件已按 playerIdx 排序回写(${files.length} 个)`);

// ---- 重新生成汇总(与 mass-rollout.mts 同口径) ----
const players = db.prepare('SELECT * FROM players').all() as Array<Record<string, unknown>>;
const total = players.length || 1;
const num = (k: string) => players.reduce((s, p) => s + (Number(p[k]) || 0), 0);
const byCombo = db.prepare(`
  SELECT combo_id, dept_id, dept_name, difficulty,
         COUNT(*) AS players, SUM(completed) AS completed, SUM(meets_requirements) AS meets,
         SUM(continuity_missing) AS continuity_missing, SUM(title_dup) AS title_dup,
         SUM(choice_dup) AS choice_dup,
         SUM(desc_dup) AS desc_dup, SUM(generic_titles) AS generic_titles,
         SUM(attr_zero_offered) AS attr_zero_offered, SUM(attr_not_applied) AS attr_not_applied,
         SUM(rank_residual) AS rank_residual, SUM(illegal_rank_change) AS illegal_rank_change,
         SUM(llm_errors) AS llm_errors, AVG(promotions) AS avg_promotions, AVG(duration_ms) AS avg_duration_ms
  FROM players GROUP BY combo_id ORDER BY combo_id
`).all();
const endingDist = db.prepare(
  'SELECT difficulty, policy, ending_type, COUNT(*) AS n FROM players GROUP BY difficulty, policy, ending_type',
).all();
const promoByPolicy = db.prepare(
  'SELECT difficulty, policy, AVG(promotions) AS avg_promotions, MIN(promotions) AS min_p, MAX(promotions) AS max_p FROM players GROUP BY difficulty, policy',
).all();

const summary = {
  source: 'recheck(从存储轨迹独立重算)',
  recomputedPlayers: recomputed,
  driftBetweenDriverAndRecheck: globalDrift.length,
  driftSamples: globalDrift.slice(0, 20),
  totalPlayers: players.length,
  completed: num('completed'),
  meetsRequirements: num('meets_requirements'),
  meetsRate: `${((100 * num('meets_requirements')) / total).toFixed(2)}%`,
  continuityMissing: num('continuity_missing'),
  titleDup: num('title_dup'),
  choiceDup: num('choice_dup'),
  descDup: num('desc_dup'),
  genericTitles: num('generic_titles'),
  attrZeroOffered: num('attr_zero_offered'),
  attrNotApplied: num('attr_not_applied'),
  rankResidual: num('rank_residual'),
  illegalRankChange: num('illegal_rank_change'),
  llmErrors: num('llm_errors'),
  trackFailures: num('track_failures'),
  avgDurationMs: Math.round(players.reduce((s, p) => s + (Number(p.duration_ms) || 0), 0) / total),
  byCombo,
  endingDist,
  promoByPolicy,
};
writeFileSync(resolve(ROOT, 'data', 'rollout-summary.json'), JSON.stringify(summary, null, 2));

console.log(`重算 ${recomputed} 名玩家;driver↔recheck 计数不一致 ${globalDrift.length} 名`);
if (globalDrift.length) console.log(globalDrift.slice(0, 10).join('\n'));
console.log(JSON.stringify({ ...summary, byCombo: `(${byCombo.length}组合)`, endingDist: '略', promoByPolicy: '略', driftSamples: '略' }, null, 2));
