/**
 * 大规模用户模拟 rollout — 13 部门 × 3 难度 × 500 玩家 = 19,500 名模拟玩家。
 *
 * 与浏览器玩家完全同构的生产路径:
 *   - driver 内运行真实引擎(src/engine),LLM 调用经 HTTP /api/llm-proxy(服务端 mock/real);
 *   - 每步选择实时 POST /api/track/* 入服务器 DB(与 useGame.ts 逐字段一致);
 *   - 每位玩家独立 IP(X-Forwarded-For,需 TRUST_PROXY=1)/UA/策略/种子 →
 *     服务器留存统计(visits/sessions/choices)获得 19,500 个独立"真实"访问者。
 *
 * driver 侧合规审计(六大诉求)随跑随算,连同全轨迹写入:
 *   - data/rollout.db(players/steps 表,node:sqlite)
 *   - data/rollout-traj/<dept>-<diff>.jsonl(每行一名玩家的完整轨迹,供 subagent 阅读)
 *   - data/rollout-summary.json(全局与分组合汇总)
 *
 * 六大诉求口径(全部要求 0 违例 / 100% 达标):
 *   1. 故事衔接   continuity_missing = 0(每步【剧情衔接】非空)
 *   2. 文案不重复 title_dup / choice_dup / generic_titles = 0(与引擎同阈值同口径)
 *   3. 属性变化   attr_zero_offered = 0(所有选项卡至少 1 项非零)
 *                 attr_not_applied  = 0(非零效果必须真实改变属性)
 *   4. 职级事实   rank_residual = 0(引擎修正后再扫描无残留)
 *                 illegal_rank_change = 0(职级只允许经晋升 +1)
 *   5. 晋升喜悦   promotions 分布按 policy/difficulty 记录(promoByPolicy)
 *   6. 结局评级   每局 finishGame 产出合法结局(endingDist 分布)
 *
 * 用法:
 *   NODE_OPTIONS=--experimental-sqlite npx tsx scripts/mass-rollout.mts
 *   环境变量:PLAYERS(默认500) DEPT_FILTER DIFF_FILTER CONCURRENCY(默认64)
 *           ROLLOUT_PORT(默认3395) WORKERS(默认8) LLM_MODE(默认mock)
 */

import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import {
  createGame, generateBackground, nextEvent, applyChoice, finishGame,
} from '../src/engine/gameEngine.ts';
import { fixRankFacts } from '../src/engine/rankRules.ts';
import {
  isGenericTitle, similarity, titleSimilarity, TITLE_DUP_THRESHOLD, CHOICE_DUP_THRESHOLD,
} from '../src/engine/dedup.ts';
import { DEPARTMENTS, type Department } from '../src/engine/departments.ts';
import type { Attrs, Choice, ChoiceEffect, LLMClient, LLMOptions, TimelineEntry } from '../src/engine/types.ts';
import type { RNG } from '../src/engine/rng.ts';
import { SeededRandom } from '../src/engine/rng.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PLAYERS = parseInt(process.env.PLAYERS || '500', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '64', 10);
const PORT = parseInt(process.env.ROLLOUT_PORT || '3395', 10);
const WORKERS = process.env.WORKERS || '8';
const LLM_MODE = process.env.LLM_MODE || 'mock';
const MAX_STEPS = 24;
const BASE = `http://127.0.0.1:${PORT}`;
const DEPT_FILTER = process.env.DEPT_FILTER || '';
const DIFF_FILTER = process.env.DIFF_FILTER || '';

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
type Difficulty = (typeof DIFFICULTIES)[number];
type Policy = 'good' | 'bad' | 'random' | 'mixed';
const POLICIES: Policy[] = ['good', 'bad', 'random', 'mixed'];

interface Combo {
  id: number; // 0..38
  dept: Department;
  difficulty: Difficulty;
  file: string; // 轨迹 JSONL 路径
}

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
];

// ---- 生产服务(独立 DB,不污染 data/guantu.db) ----
const SERVER_DB = resolve(ROOT, 'data', 'rollout-server.db');
for (const s of ['', '-shm', '-wal']) {
  try { rmSync(SERVER_DB + s); } catch { /* 不存在则忽略 */ }
}
console.log(`[rollout] 启动生产服务:PORT=${PORT} WORKERS=${WORKERS} LLM=${LLM_MODE} TRUST_PROXY=1`);
const serverProc = spawn('node', ['server.js'], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(PORT),
    WORKERS,
    LLM_MODE,
    TRUST_PROXY: '1',
    DB_PATH: SERVER_DB,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
serverProc.stdout.on('data', (d) => { serverLog += d; });
serverProc.stderr.on('data', (d) => { serverLog += d; });

async function waitServer(tries = 100): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok && (await r.json()).mode === LLM_MODE) return true;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** 带玩家身份(XFF+UA)的 HTTP 客户端:LLM 代理 + 留存上报,429/5xx 退避重试。 */
class PlayerHttp {
  constructor(
    private readonly ip: string,
    private readonly ua: string,
  ) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        const resp = await fetch(`${BASE}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.ua,
            'X-Forwarded-For': this.ip,
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}) as { error?: string });
          throw new Error(err.error || `HTTP ${resp.status} ${path}`);
        }
        return resp.json();
      } catch (e) {
        const msg = String((e as Error).message || e);
        const retriable = /429|5\d\d|408|fetch failed|ECONNRESET|timeout|terminated|abort/i.test(msg);
        if (!retriable || attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  async llm(prompt: string, opts: LLMOptions = {}): Promise<string> {
    const d = (await this.post('/api/llm-proxy', {
      prompt,
      max_tokens: opts.maxTokens ?? 1600,
      temperature: opts.temperature ?? 0.85,
      top_p: opts.topP ?? 0.9,
    })) as { content?: string };
    return d.content || '';
  }

  trackStart(p: { sessionId: string; deptId: string; deptName: string; difficulty: string; maxSteps: number }) {
    return this.post('/api/track/start', p);
  }
  trackChoice(p: Record<string, unknown>) {
    return this.post('/api/track/choice', p);
  }
  trackEnd(p: Record<string, unknown>) {
    return this.post('/api/track/end', p);
  }
}

/** 走 /api/llm-proxy 的 LLM 客户端(与浏览器 ProxyLLMClient 等价)。 */
class ProxyHttpLLM implements LLMClient {
  constructor(private readonly http: PlayerHttp) {}
  generate(prompt: string, opts: LLMOptions = {}): Promise<string> {
    return this.http.llm(prompt, opts);
  }
}

/** 选项策略:good=清廉能吏;bad=短视逐利;random=均匀随机;mixed=按玩家种子偏置。 */
function pickChoice(policy: Policy, choices: Choice[], rng: RNG, bias: number): number {
  const clean = (c: Choice) => c.effect.politics + c.effect.execute + c.effect.network + c.effect.integrity * 1.5;
  const corrupt = (c: Choice) => c.effect.politics + c.effect.execute + c.effect.network - c.effect.integrity * 1.5;
  const argmax = (f: (c: Choice) => number) => {
    let best = 0;
    for (let i = 1; i < choices.length; i++) if (f(choices[i]) > f(choices[best])) best = i;
    return best;
  };
  if (policy === 'good') return argmax(clean);
  if (policy === 'bad') return argmax(corrupt);
  if (policy === 'mixed') return rng.next() < bias ? argmax(clean) : rng.int(0, choices.length - 1);
  return rng.int(0, choices.length - 1);
}

// ---- driver 侧分析库 ----
const ANALYSIS_DB = resolve(ROOT, 'data', 'rollout.db');
for (const s of ['', '-shm', '-wal']) {
  try { rmSync(ANALYSIS_DB + s); } catch { /* 不存在则忽略 */ }
}
mkdirSync(resolve(ROOT, 'data', 'rollout-traj'), { recursive: true });
const adb = new DatabaseSync(ANALYSIS_DB);
adb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE players (
    combo_id INTEGER, player_idx INTEGER, session_id TEXT, policy TEXT, seed INTEGER, ip TEXT,
    dept_id TEXT, dept_name TEXT, difficulty TEXT,
    steps_done INTEGER, completed INTEGER, ending_type TEXT, final_rank TEXT,
    promotions INTEGER, bg_ok INTEGER,
    continuity_missing INTEGER, title_dup INTEGER, choice_dup INTEGER, generic_titles INTEGER,
    attr_zero_offered INTEGER, attr_not_applied INTEGER, rank_residual INTEGER, illegal_rank_change INTEGER,
    llm_errors INTEGER, track_failures INTEGER, duration_ms INTEGER, meets_requirements INTEGER
  );
  CREATE TABLE steps (
    combo_id INTEGER, player_idx INTEGER, step INTEGER, year INTEGER,
    title TEXT, tag_label TEXT, continuity_ok INTEGER, desc_len INTEGER,
    choice_count INTEGER, chosen_idx INTEGER, attr_nonzero INTEGER, promoted INTEGER,
    rank_after INTEGER, rank_fixes INTEGER
  );
  CREATE INDEX idx_players_combo ON players(combo_id);
  CREATE INDEX idx_steps_combo ON steps(combo_id, player_idx);
`);
const insPlayer = adb.prepare(`INSERT INTO players VALUES (${Array.from({ length: 27 }, () => '?').join(', ')})`);
const insStep = adb.prepare(`INSERT INTO steps VALUES (${Array.from({ length: 14 }, () => '?').join(', ')})`);
const stepBuf: unknown[][] = [];
const playerBuf: unknown[][] = [];
function flushBuffers(force = false) {
  if (stepBuf.length >= 4000 || (force && stepBuf.length)) {
    adb.exec('BEGIN');
    for (const r of stepBuf) insStep.run(...r);
    adb.exec('COMMIT');
    stepBuf.length = 0;
  }
  if (playerBuf.length >= 200 || (force && playerBuf.length)) {
    adb.exec('BEGIN');
    for (const r of playerBuf) insPlayer.run(...r);
    adb.exec('COMMIT');
    playerBuf.length = 0;
  }
}

// ---- 单玩家模拟(镜像 useGame.ts 生命周期) ----
interface StepRec {
  step: number; year: number; title: string; tagLabel: string; continuity: string; desc: string;
  choices: Array<{ text: string; hint: string; effect: ChoiceEffect }>;
  chosenIdx: number; effectsApplied: ChoiceEffect; attrsAfter: Attrs; rankAfter: number; promoted: boolean;
  rankFixes: number;
}

interface PlayerResult {
  comboId: number; playerIdx: number; sessionId: string; policy: Policy; seed: number; ip: string;
  deptId: string; deptName: string; difficulty: Difficulty;
  steps: StepRec[]; bgOk: boolean; openingText: string;
  endingType: string; endingTitle: string; finalRank: string; evalText: string;
  promotions: number;
  continuityMissing: number; titleDup: number; choiceDup: number; genericTitles: number;
  attrZeroOffered: number; attrNotApplied: number; rankResidual: number; illegalRankChange: number;
  llmErrors: number; trackFailures: number; durationMs: number;
}

async function runPlayer(combo: Combo, playerIdx: number): Promise<PlayerResult> {
  const policy = POLICIES[playerIdx % POLICIES.length];
  const seed = 77_000_000 + combo.id * 10_000 + playerIdx;
  const rng = new SeededRandom(seed);
  // 每位玩家独立 IP:10.<combo>.<idx/200>.<idx%200+1> — 全局 19,500 个互不相同。
  const ip = `10.${combo.id}.${Math.floor(playerIdx / 200)}.${(playerIdx % 200) + 1}`;
  const ua = UAS[playerIdx % UAS.length];
  const http = new PlayerHttp(ip, ua);
  const llm = new ProxyHttpLLM(http);
  // mixed 玩家的清廉偏置(0.25~0.75,由种子决定)。
  const bias = policy === 'mixed' ? 0.25 + ((seed >> 3) % 51) / 100 : 0;
  const t0 = Date.now();

  const r: PlayerResult = {
    comboId: combo.id, playerIdx, sessionId: '', policy, seed, ip,
    deptId: combo.dept.id, deptName: combo.dept.name, difficulty: combo.difficulty,
    steps: [], bgOk: false, openingText: '',
    endingType: '', endingTitle: '', finalRank: '', evalText: '',
    promotions: 0,
    continuityMissing: 0, titleDup: 0, choiceDup: 0, genericTitles: 0,
    attrZeroOffered: 0, attrNotApplied: 0, rankResidual: 0, illegalRankChange: 0,
    llmErrors: 0, trackFailures: 0, durationMs: 0,
  };

  let state = createGame(combo.dept.id, combo.difficulty, rng);
  r.sessionId = state.sessionId;

  // 与 useGame.ts 一致:开局先 trackStart,再生成背景。
  try {
    await http.trackStart({
      sessionId: state.sessionId, deptId: state.deptId, deptName: state.dept.name,
      difficulty: combo.difficulty, maxSteps: state.maxSteps,
    });
  } catch { r.trackFailures++; }

  try {
    state = await generateBackground(state, llm);
    r.bgOk = (state.background?.openingText || '').length >= 30;
    r.openingText = (state.background?.openingText || '').slice(0, 160);
  } catch { r.llmErrors++; /* 引擎有兜底背景,继续 */ }

  const usedTitles: string[] = [];
  const usedChoiceTexts: string[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    try {
      const prevRepairs = state.repairs.length;
      const ts0 = Date.now();
      let next = await nextEvent(state, llm, null, rng);
      const latency = Date.now() - ts0;
      const event = next.currentEvent!;
      const newRepairs = next.repairs.slice(prevRepairs);
      const rankFixes = newRepairs.filter((x) => x.kind === 'rank-fix').length;

      // ---- 六大诉求合规(与引擎同口径) ----
      if (!(event.continuity || '').trim()) r.continuityMissing++;
      if (isGenericTitle(event.title)) r.genericTitles++;
      if (usedTitles.some((t) => titleSimilarity(t, event.title) >= TITLE_DUP_THRESHOLD)) r.titleDup++;
      for (const c of event.choices) {
        // 诉求3:任何选项卡至少 1 项属性非零。
        if (c.effect.politics === 0 && c.effect.execute === 0
          && c.effect.network === 0 && c.effect.integrity === 0) r.attrZeroOffered++;
        // 诉求2:跨事件选项文案不得与此前雷同。
        if (usedChoiceTexts.some((t) => similarity(t, c.text) >= CHOICE_DUP_THRESHOLD)) r.choiceDup++;
      }
      // 诉求4:引擎修正后的描述再跑一遍规则,残留必须为 0。
      r.rankResidual += fixRankFacts(event.desc).fixes.length;

      const rankBefore = next.rank;
      const attrsBefore = next.attrs;
      const idx = pickChoice(policy, event.choices, rng, bias);
      const result = applyChoice(next, idx);
      next = result.state;
      // 诉求3:非零效果必须真实改变属性。属性夹取在 0..100:
      // 已顶在边界的效果(+x 时已 100 / -x 时已 0)改变不了属性属正常,
      // 只有"本可改变却没变"才算违例。
      const chosen = event.choices[idx];
      const shouldChange = (['politics', 'execute', 'network', 'integrity'] as const).some(
        (k) => chosen.effect[k] !== 0
          && !((chosen.effect[k] > 0 && attrsBefore[k] === 100) || (chosen.effect[k] < 0 && attrsBefore[k] === 0)),
      );
      if (shouldChange && JSON.stringify(attrsBefore) === JSON.stringify(next.attrs)) r.attrNotApplied++;
      // 诉求4:职级变化只允许"经晋升 +1"一种形态。
      if (result.promoted) {
        r.promotions++;
        if (next.rank - rankBefore !== 1) r.illegalRankChange++;
      } else if (next.rank !== rankBefore) {
        r.illegalRankChange++;
      }

      usedTitles.push(event.title);
      for (const c of event.choices) usedChoiceTexts.push(c.text);

      const tl: TimelineEntry = next.timeline[next.timeline.length - 1];
      state = next;
      r.steps.push({
        step: step + 1, year: tl.year, title: event.title, tagLabel: event.tagLabel,
        continuity: event.continuity || '', desc: event.desc,
        choices: event.choices.map((c) => ({ text: c.text, hint: c.hint || '', effect: c.effect })),
        chosenIdx: idx, effectsApplied: result.effects, attrsAfter: next.attrs,
        rankAfter: next.rank, promoted: result.promoted, rankFixes,
      });
      void latency; // 单步延迟不入库(汇总口径在服务器 visits 表),保留变量便于临时排查。

      try {
        await http.trackChoice({
          sessionId: state.sessionId, step: tl.step, year: tl.year,
          eventTitle: tl.title, eventTag: tl.tagLabel, choiceText: tl.choice,
          effects: tl.effects, attrsAfter: tl.attrsAfter, rankAfter: tl.rankAfter, promoted: tl.promoted,
        });
      } catch { r.trackFailures++; }

      if (state.ended) break;
    } catch (e) {
      r.llmErrors++;
      console.log(`[combo ${combo.id} player ${playerIdx} step ${step + 1}] 失败: ${String((e as Error).message).slice(0, 100)}`);
      break;
    }
  }

  if (state.ended || state.step >= state.maxSteps) {
    const ending = finishGame(state);
    r.endingType = ending.endingType;
    r.endingTitle = ending.endingTitle;
    r.finalRank = ending.finalRank;
    r.evalText = ending.evalText.slice(0, 400);
    try {
      await http.trackEnd({
        sessionId: state.sessionId, stepsDone: state.step, finalRank: ending.finalRank,
        endingType: ending.endingType, promotions: state.promotions.length,
        attrs: state.attrs, timeline: state.timeline, durationMs: Date.now() - t0,
      });
    } catch { r.trackFailures++; }
  } else {
    r.endingType = 'ABORTED';
  }

  r.durationMs = Date.now() - t0;
  return r;
}

// ---- 组合枚举与调度 ----
const combos: Combo[] = [];
{
  let id = 0;
  for (const dept of DEPARTMENTS) {
    if (DEPT_FILTER && dept.id !== DEPT_FILTER) continue;
    for (const difficulty of DIFFICULTIES) {
      if (DIFF_FILTER && difficulty !== DIFF_FILTER) continue;
      combos.push({
        id: id++, dept, difficulty,
        file: resolve(ROOT, 'data', 'rollout-traj', `${dept.id}-${difficulty}.jsonl`),
      });
    }
  }
}
for (const c of combos) {
  try { rmSync(c.file); } catch { /* 不存在则忽略 */ }
}

if (!(await waitServer())) {
  console.error('服务未就绪。日志尾部:\n' + serverLog.slice(-1500));
  serverProc.kill('SIGKILL');
  process.exit(1);
}
console.log(`[rollout] 服务就绪。${combos.length} 个组合 × ${PLAYERS} 玩家 = ${combos.length * PLAYERS} 名玩家,并发 ${CONCURRENCY}\n`);

const t0 = Date.now();
let done = 0;
const totalPlayers = combos.length * PLAYERS;

const queue: Array<{ combo: Combo; playerIdx: number }> = [];
for (const combo of combos) {
  for (let k = 0; k < PLAYERS; k++) queue.push({ combo, playerIdx: k });
}

const worker = async () => {
  for (;;) {
    const task = queue.shift();
    if (!task) return;
    const res = await runPlayer(task.combo, task.playerIdx);
    // 轨迹 JSONL(每行一名玩家,供 subagent 阅读)。
    appendFileSync(task.combo.file, JSON.stringify(res) + '\n');
    // 合规入库。
    const meets = res.endingType !== 'ABORTED' && res.llmErrors === 0
      && res.continuityMissing === 0 && res.titleDup === 0 && res.choiceDup === 0
      && res.genericTitles === 0 && res.attrZeroOffered === 0 && res.attrNotApplied === 0
      && res.rankResidual === 0 && res.illegalRankChange === 0 && res.finalRank !== '';
    playerBuf.push([
      res.comboId, res.playerIdx, res.sessionId, res.policy, res.seed, res.ip,
      res.deptId, res.deptName, res.difficulty,
      res.steps.length, res.endingType !== 'ABORTED' ? 1 : 0, res.endingType, res.finalRank,
      res.promotions, res.bgOk ? 1 : 0,
      res.continuityMissing, res.titleDup, res.choiceDup, res.genericTitles,
      res.attrZeroOffered, res.attrNotApplied, res.rankResidual, res.illegalRankChange,
      res.llmErrors, res.trackFailures, res.durationMs, meets ? 1 : 0,
    ]);
    for (const s of res.steps) {
      stepBuf.push([
        res.comboId, res.playerIdx, s.step, s.year,
        s.title, s.tagLabel, s.continuity.trim() ? 1 : 0, s.desc.length,
        s.choices.length, s.chosenIdx,
        (s.effectsApplied.politics !== 0 || s.effectsApplied.execute !== 0
          || s.effectsApplied.network !== 0 || s.effectsApplied.integrity !== 0) ? 1 : 0,
        s.promoted ? 1 : 0, s.rankAfter, s.rankFixes,
      ]);
    }
    flushBuffers();
    done++;
    if (done % 500 === 0 || done === totalPlayers) {
      const el = Math.round((Date.now() - t0) / 1000);
      console.log(`[rollout] ${done}/${totalPlayers} 玩家完成(${el}s,${Math.round(done / Math.max(el, 1))}/s)`);
    }
  }
};
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
flushBuffers(true);

// ---- 汇总 ----
const players = adb.prepare('SELECT * FROM players').all() as Array<Record<string, unknown>>;
const total = players.length || 1;
const num = (k: string) => players.reduce((s, p) => s + (Number(p[k]) || 0), 0);
const byCombo = adb.prepare(`
  SELECT combo_id, dept_id, dept_name, difficulty,
         COUNT(*) AS players,
         SUM(completed) AS completed,
         SUM(meets_requirements) AS meets,
         SUM(continuity_missing) AS continuity_missing,
         SUM(title_dup) AS title_dup,
         SUM(choice_dup) AS choice_dup,
         SUM(generic_titles) AS generic_titles,
         SUM(attr_zero_offered) AS attr_zero_offered,
         SUM(attr_not_applied) AS attr_not_applied,
         SUM(rank_residual) AS rank_residual,
         SUM(illegal_rank_change) AS illegal_rank_change,
         SUM(llm_errors) AS llm_errors,
         AVG(promotions) AS avg_promotions,
         AVG(duration_ms) AS avg_duration_ms
  FROM players GROUP BY combo_id ORDER BY combo_id
`).all();

const endingDist = adb.prepare(
  'SELECT difficulty, policy, ending_type, COUNT(*) AS n FROM players GROUP BY difficulty, policy, ending_type',
).all();
const promoByPolicy = adb.prepare(
  'SELECT difficulty, policy, AVG(promotions) AS avg_promotions, MIN(promotions) AS min_p, MAX(promotions) AS max_p FROM players GROUP BY difficulty, policy',
).all();

const summary = {
  startedAt: new Date(t0).toISOString(),
  llmMode: LLM_MODE,
  combos: combos.length,
  playersPerCombo: PLAYERS,
  totalPlayers: players.length,
  completed: num('completed'),
  meetsRequirements: num('meets_requirements'),
  meetsRate: `${((100 * num('meets_requirements')) / total).toFixed(2)}%`,
  continuityMissing: num('continuity_missing'),
  titleDup: num('title_dup'),
  choiceDup: num('choice_dup'),
  genericTitles: num('generic_titles'),
  attrZeroOffered: num('attr_zero_offered'),
  attrNotApplied: num('attr_not_applied'),
  rankResidual: num('rank_residual'),
  illegalRankChange: num('illegal_rank_change'),
  llmErrors: num('llm_errors'),
  trackFailures: num('track_failures'),
  avgDurationMs: Math.round(players.reduce((s, p) => s + (Number(p.duration_ms) || 0), 0) / total),
  wallClockSec: Math.round((Date.now() - t0) / 1000),
  byCombo,
  endingDist,
  promoByPolicy,
};

writeFileSync(resolve(ROOT, 'data', 'rollout-summary.json'), JSON.stringify(summary, null, 2));
console.log('\n===== 大规模 rollout 汇总 =====');
console.log(JSON.stringify({ ...summary, byCombo: `(${byCombo.length}组合,详见JSON)`, endingDist: '详见JSON', promoByPolicy: '详见JSON' }, null, 2));

// 服务器侧留存统计(验证生产 DB 真实入库)。
try {
  const stats = await (await fetch(`${BASE}/api/stats`)).json();
  console.log('\n===== 服务器留存统计(/api/stats) =====');
  console.log(JSON.stringify({
    visits: stats.visits, requests: stats.requests, retention: stats.retention,
    sessions: {
      ...stats.sessions,
      recent: `(${stats.sessions.recent?.length ?? 0}条,略)`,
      byDept: `(${stats.sessions.byDept?.length ?? 0}条,略)`,
    },
  }, null, 2));
} catch (e) {
  console.log(`stats 拉取失败: ${String((e as Error).message).slice(0, 80)}`);
}

serverProc.kill('SIGTERM');
adb.close();
process.exit(0);
