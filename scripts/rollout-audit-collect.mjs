/**
 * 汇总 subagent 的轨迹审计结论 → rollout.db 的 audits 表 + summary JSON + 控制台报告。
 * 用法:NODE_OPTIONS=--experimental-sqlite node scripts/rollout-audit-collect.mjs
 * 可选环境变量(用于多套审计并存,如 E4 v4 定点审计):
 *   AUDIT_DIR  审计 JSON 目录(相对仓库根,默认 data/rollout-audit)
 *   OUT        summary JSON 输出路径(相对仓库根,默认 data/rollout-audit-summary.json)
 * 注意:audits 表是全量刷新语义(先清空再插入),后一次运行会覆盖前一次的表内容;
 * 多套审计请用不同 OUT,并在文档中注明 audits 表当前装的是哪一套。
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(import.meta.dirname, '..');
const AUDIT_DIR = resolve(ROOT, process.env.AUDIT_DIR || 'data/rollout-audit');
const OUT = resolve(ROOT, process.env.OUT || 'data/rollout-audit-summary.json');
const files = readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.json')).filter((f) => f !== 'summary.json').sort();

if (files.length === 0) {
  console.error(`${AUDIT_DIR} 下没有审计结论 JSON`);
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
// 全量刷新语义:重复运行不叠加旧行(表无主键,先清空)。
db.exec('DELETE FROM audits');

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
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, combos: `${rows.length} 条,详见 ${OUT}` }, null, 2));

// 失败组合明细直出,便于追查。
for (const r of rows.filter((x) => x[5] !== 'PASS')) {
  console.log(`\n✗ ${r[1]}: ${r[9].slice(0, 500)}`);
}
