/**
 * 汇总 39 个 subagent 的轨迹审计结论 → rollout.db 新增 audits 表 + 控制台报告。
 * 用法:NODE_OPTIONS=--experimental-sqlite node scripts/rollout-audit-collect.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..');
const AUDIT_DIR = resolve(ROOT, 'data', 'rollout-audit');
const files = readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.json')).sort();

if (files.length === 0) {
  console.error('data/rollout-audit/ 下没有审计结论 JSON');
  process.exit(1);
}

const db = new DatabaseSync(resolve(ROOT, 'data', 'rollout.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS audits (
    combo_id INTEGER, combo TEXT, dept_id TEXT, dept_name TEXT, difficulty TEXT,
    verdict TEXT, players_total INTEGER, players_deep_read INTEGER,
    violations INTEGER, violation_detail TEXT, summary TEXT
  );
`);

let pass = 0;
let fail = 0;
const rows = [];
for (const f of files) {
  let a;
  try {
    a = JSON.parse(readFileSync(resolve(AUDIT_DIR, f), 'utf8'));
  } catch (e) {
    console.error(`× ${f} 解析失败: ${String(e.message).slice(0, 80)}`);
    continue;
  }
  const comboId = a.comboId ?? null;
  const [deptId, difficulty] = String(a.combo || '').split('/');
  const violations = (a.violations ?? []).length;
  const verdict = String(a.verdict || 'FAIL').toUpperCase();
  if (verdict === 'PASS') pass++; else fail++;
  rows.push([
    comboId, a.combo ?? f, deptId ?? '', a.deptName ?? '', difficulty ?? '',
    verdict, a.playersTotal ?? 0, (a.playersDeepRead ?? []).length,
    violations, JSON.stringify(a.violations ?? []).slice(0, 8000), a.summary ?? '',
  ]);
}

db.exec('BEGIN');
for (const r of rows) {
  db.prepare('INSERT INTO audits VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...r);
}
db.exec('COMMIT');

const deepRead = rows.reduce((s, r) => s + (Number(r[7]) || 0), 0);
const totalViolations = rows.reduce((s, r) => s + (Number(r[8]) || 0), 0);
const report = {
  auditedCombos: rows.length,
  pass, fail,
  playersCovered: rows.reduce((s, r) => s + (Number(r[6]) || 0), 0),
  playersDeepRead: deepRead,
  totalViolations,
  verdict: fail === 0 ? 'ALL PASS' : `${fail} COMBO(S) FAILED`,
  combos: rows.map((r) => ({ combo: r[1], verdict: r[5], deepRead: r[7], violations: r[8], summary: r[10] })),
};
writeFileSync(resolve(ROOT, 'data', 'rollout-audit-summary.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, combos: `${rows.length} 条,详见 data/rollout-audit-summary.json` }, null, 2));

// 失败组合明细直出,便于追查。
for (const r of rows.filter((x) => x[5] !== 'PASS')) {
  console.log(`\n✗ ${r[1]}: ${r[9].slice(0, 500)}`);
}
