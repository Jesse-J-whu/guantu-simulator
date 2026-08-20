/**
 * GLM 真实 API 大规模多样性验证。
 *
 * 用真实 GLM(用户提供的 Key,经环境变量 GLM_API_KEY 注入,不落盘)跑完整对局,
 * 量化六大诉求的修复效果:
 *   1. 故事衔接率     —— 【剧情衔接】字段出现率 + NPC 名册复用率
 *   2. 事件重复率     —— 局内疑似重复(dedup 判定) + 跨局标题重复
 *   3. 属性变化率     —— 每个选项至少 1 项属性非零(必须 100%)
 *   4. 职级事实错误率 —— 引擎自动修正次数 + 修正后残留(必须 0)
 *   5. 晋升分布       —— 好好玩家 vs 随机玩家的晋升次数分布
 *   6. 上游质量       —— 解析失败率/选项不足率/延迟分布
 *
 * 用法:GLM_API_KEY=xxx npx tsx scripts/diversity-scan.mts [GAMES=13] [CONCURRENCY=3]
 * 输出:test-results/diversity-scan.json + docs/diversity-report.md
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createGame, generateBackground, nextEvent, applyChoice, finishGame } from '../src/engine/gameEngine.ts';
import { fixRankFacts } from '../src/engine/rankRules.ts';
import { isGenericTitle, similarity, titleSimilarity, TITLE_DUP_THRESHOLD, CHOICE_DUP_THRESHOLD } from '../src/engine/dedup.ts';
import { DEPARTMENTS } from '../src/engine/departments.ts';
import type { LLMClient, LLMOptions } from '../src/engine/types.ts';
import type { RNG } from '../src/engine/rng.ts';
import { SeededRandom } from '../src/engine/rng.ts';

const ROOT = resolve(import.meta.dirname, '..');
const GAMES = parseInt(process.env.GAMES || '13', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10);
const MAX_STEPS = 24;
const PORT = parseInt(process.env.SCAN_PORT || '3393', 10);
const BASE = `http://127.0.0.1:${PORT}`;

if (!process.env.GLM_API_KEY) {
  console.error('缺少 GLM_API_KEY 环境变量');
  process.exit(1);
}

// ---- 走生产路径:本地服务 /api/llm-proxy(真实 GLM 上游+风控安全重试+故障切换) ----
const DB_PATH = resolve(ROOT, 'data', 'diversity.db');
for (const s of ['', '-shm', '-wal']) {
  try { rmSync(DB_PATH + s); } catch { /* 不存在则忽略 */ }
}
console.log(`[scan] 启动生产路径服务:PORT=${PORT} LLM=real(GLM)`);
const serverProc = spawn('node', ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), WORKERS: '1', LLM_MODE: 'real', DB_PATH },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
serverProc.stdout.on('data', (d) => { serverLog += d; });
serverProc.stderr.on('data', (d) => { serverLog += d; });

async function waitServer(tries = 60): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok && (await r.json()).mode === 'real') return true;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** 与浏览器 ProxyLLMClient 等价:走 /api/llm-proxy。 */
class ProxyHttpLLM implements LLMClient {
  async generate(prompt: string, opts: LLMOptions = {}): Promise<string> {
    const resp = await fetch(`${BASE}/api/llm-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: opts.maxTokens ?? 1600,
        temperature: opts.temperature ?? 0.85,
        top_p: opts.topP ?? 0.9,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}) as { error?: string });
      throw new Error(err.error || `Proxy error ${resp.status}`);
    }
    const data = (await resp.json()) as { content?: string };
    return data.content || '';
  }
}

/** 带 429/5xx 退避重试的 LLM 客户端包装(内容风控由服务端安全重试兜底)。 */
class RetryLLM implements LLMClient {
  private readonly inner: LLMClient;
  retries = 0;
  constructor(inner: LLMClient) {
    this.inner = inner;
  }
  async generate(prompt: string, opts: LLMOptions = {}): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.inner.generate(prompt, opts);
      } catch (e) {
        const msg = String((e as Error).message || e);
        const retriable = /429|5\d\d|408|fetch failed|ECONNRESET|timeout|terminated/i.test(msg);
        if (!retriable || attempt >= 4) throw e;
        this.retries++;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
      }
    }
  }
}

interface EventStat {
  parseOK: boolean;
  choiceCount: number;
  choiceTexts: string[]; // 选项文案(事后查重口径与引擎一致)
  titleGeneric: boolean; // 泛化套话标题(暗流涌动类,必须 0)
  continuityPresent: boolean; // 【剧情衔接】字段非空(第 1 步允许开局引入,同样要求非空)
  npcsNamed: number;
  rankFixes: number;
  rankResidual: number; // 修正后再次扫描仍发现的职级错误(必须 0)
  dedupSuspect: boolean;
  attrNonZeroChoices: number;
  attrZeroChoices: number;
  latencyMs: number;
  providerErrors: number;
  npcReuse: boolean; // 本事件出场人物中有此前已出场者
}

interface GameStat {
  gameId: number;
  deptId: string;
  deptName: string;
  difficulty: string;
  policy: 'good' | 'random';
  events: EventStat[];
  titles: string[];
  promotions: number;
  endingType: string;
  finalRank: string;
  totalNPCs: number;
  reusedNPCs: number; // 出场≥2次的人物数
  bgOk: boolean;
  llmRetries: number;
}

/** 选项策略:good = 净收益(含廉洁)最高;random = 确定性伪随机。 */
function pickChoice(
  policy: 'good' | 'random',
  effects: Array<{ effect: Record<'politics' | 'execute' | 'network' | 'integrity', number> }>,
  rng: RNG,
): number {
  if (policy === 'good') {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i].effect;
      const score = e.politics + e.execute + e.network + e.integrity * 1.5;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  return rng.int(0, effects.length - 1);
}

async function runGame(gameId: number): Promise<GameStat> {
  const dept = DEPARTMENTS[gameId % DEPARTMENTS.length];
  const difficulty = gameId % 3 === 2 ? 'hard' : gameId % 3 === 1 ? 'easy' : 'normal';
  const policy: 'good' | 'random' = gameId % 2 === 0 ? 'good' : 'random';
  const rng = new SeededRandom(20260821 * 1000 + gameId);
  const llm = new RetryLLM(new ProxyHttpLLM());

  let state = createGame(dept.id, difficulty, rng);
  const stat: GameStat = {
    gameId, deptId: dept.id, deptName: dept.name, difficulty, policy,
    events: [], titles: [], promotions: 0, endingType: '', finalRank: '',
    totalNPCs: 0, reusedNPCs: 0, bgOk: false, llmRetries: 0,
  };

  // 开局背景。
  try {
    state = await generateBackground(state, llm);
    stat.bgOk = (state.background?.openingText || '').length >= 30;
  } catch (e) {
    console.log(`[game ${gameId}] 背景生成失败(用兜底): ${String((e as Error).message).slice(0, 80)}`);
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const ev: EventStat = {
      parseOK: false, choiceCount: 0, choiceTexts: [], titleGeneric: false, continuityPresent: false,
      npcsNamed: 0, rankFixes: 0, rankResidual: 0, dedupSuspect: false,
      attrNonZeroChoices: 0, attrZeroChoices: 0, latencyMs: 0, providerErrors: 0, npcReuse: false,
    };
    const knownNames = new Set(state.npcs.map((n) => n.name));
    const t0 = Date.now();
    try {
      const next = await nextEvent(state, llm, null, rng);
      ev.latencyMs = Date.now() - t0;
      const event = next.currentEvent!;
      ev.parseOK = true;
      stat.titles.push(event.title);
      ev.choiceCount = event.choices.length;
      ev.choiceTexts = event.choices.map((c) => c.text);
      ev.titleGeneric = isGenericTitle(event.title);
      ev.continuityPresent = (event.continuity || '').trim().length > 0;
      ev.npcsNamed = event.npcs.length;
      ev.dedupSuspect = next.repairs.some((r) => r.kind === 'dedup-retry' && r.detail.includes('仍疑似重复'));
      ev.rankFixes = next.repairs.filter((r) => r.kind === 'rank-fix').length;
      // 修正后残留扫描:对修正后的描述再跑一次规则,必须为 0。
      ev.rankResidual = fixRankFacts(event.desc).fixes.length;
      for (const c of event.choices) {
        const nz = c.effect.politics !== 0 || c.effect.execute !== 0 || c.effect.network !== 0 || c.effect.integrity !== 0;
        if (nz) ev.attrNonZeroChoices++; else ev.attrZeroChoices++;
      }
      // NPC 复用:本事件出场人物与既有名册重合。
      ev.npcReuse = event.npcs.some((raw2) => {
        const names = raw2.match(/[一-龥·]{2,4}(?=[（(])/g) || [];
        return names.some((n) => knownNames.has(n));
      });
      state = next;
      const idx = pickChoice(policy, event.choices, rng);
      const result = applyChoice(state, idx);
      state = result.state;
      if (result.promotion) stat.promotions++;
    } catch (e) {
      ev.latencyMs = Date.now() - t0;
      ev.providerErrors = 1;
      console.log(`[game ${gameId} step ${step + 1}] 失败: ${String((e as Error).message).slice(0, 120)}`);
      // 中断本局(真实上游故障不应静默跳过——多样性统计要如实)。
      break;
    }
    stat.events.push(ev);
  }

  stat.totalNPCs = state.npcs.length;
  stat.reusedNPCs = state.npcs.filter((n) => n.appearances >= 2).length;
  if (state.step >= state.maxSteps) {
    const ending = finishGame(state);
    stat.endingType = ending.endingType;
    stat.finalRank = state.dept.ranks[Math.min(state.rank, state.dept.ranks.length - 1)];
  } else {
    stat.endingType = 'ABORTED';
  }
  stat.llmRetries = llm.retries;
  console.log(
    `[game ${gameId}] ${dept.name}/${difficulty}/${policy} → steps=${state.step} promos=${stat.promotions} ending=${stat.endingType} rank=${stat.finalRank} npcReuse=${stat.reusedNPCs}/${stat.totalNPCs} retries=${llm.retries}`,
  );
  return stat;
}

// ---- 汇总 ----
if (!(await waitServer())) {
  console.error('服务未能以 real 模式就绪。服务日志:\n' + serverLog.slice(-1500));
  serverProc.kill('SIGKILL');
  process.exit(1);
}
console.log('[scan] 服务就绪(LLM=real),开始模拟\n');

const t0 = Date.now();
const stats: GameStat[] = [];
const queue = Array.from({ length: GAMES }, (_, i) => i);
const workers = Array.from({ length: CONCURRENCY }, async () => {
  for (;;) {
    const id = queue.shift();
    if (id === undefined) return;
    stats.push(await runGame(id));
  }
});
await Promise.all(workers);
stats.sort((a, b) => a.gameId - b.gameId);

const events = stats.flatMap((g) => g.events);
const total = events.length || 1;
const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`;
const goodGames = stats.filter((g) => g.policy === 'good' && g.endingType !== 'ABORTED');
// 跨局标题重复:全部局的事件标题全等去重(局内重复由 dedup 系统单独统计)。
const allTitles = stats.flatMap((g) => g.titles);
const uniqueTitles = new Set(allTitles);

// 局内重复(用户诉求2的直接口径):同一局内标题/选项与此前步骤的
// 相似度 ≥ 引擎阈值仍被放行的数量,必须为 0。
let withinTitleDup = 0;
let withinChoiceDup = 0;
for (const g of stats) {
  const seenChoices: string[] = [];
  g.titles.forEach((title, i) => {
    // 此前标题比对(含本局全部更早事件,标题口径 bigram)。
    for (let j = 0; j < i; j++) {
      if (titleSimilarity(g.titles[j], title) >= TITLE_DUP_THRESHOLD) { withinTitleDup++; break; }
    }
    const ev = g.events[i];
    if (ev?.parseOK) {
      for (const ct of ev.choiceTexts) {
        if (seenChoices.some((c) => similarity(c, ct) >= CHOICE_DUP_THRESHOLD)) withinChoiceDup++;
        seenChoices.push(ct);
      }
    }
  });
}

const summary = {
  startedAt: new Date().toISOString(),
  provider: process.env.GLM_MODEL || 'glm-4-flash',
  games: stats.length,
  gamesCompleted: stats.filter((g) => g.endingType !== 'ABORTED').length,
  totalEvents: events.length,
  totalChoices: events.reduce((s, e) => s + e.choiceCount, 0),
  parseOKRate: pct(events.filter((e) => e.parseOK).length),
  providerErrorEvents: events.filter((e) => e.providerErrors).length,
  continuityRate: pct(events.filter((e) => e.parseOK && e.continuityPresent).length),
  npcReuseRate: pct(events.filter((e) => e.parseOK && e.npcReuse).length),
  avgNpcRosterSize: +(stats.reduce((s, g) => s + g.totalNPCs, 0) / stats.length).toFixed(1),
  npcReusedAvgPerGame: +(stats.reduce((s, g) => s + g.reusedNPCs, 0) / stats.length).toFixed(1),
  choice3PlusRate: pct(events.filter((e) => e.parseOK && e.choiceCount >= 3).length),
  attrNonZeroRate: (() => {
    let nz = 0; let z = 0;
    for (const e of events) { nz += e.attrNonZeroChoices; z += e.attrZeroChoices; }
    return `${((100 * nz) / (nz + z || 1)).toFixed(1)}% (${nz}/${nz + z})`;
  })(),
  rankFixTotal: events.reduce((s, e) => s + e.rankFixes, 0),
  rankResidualTotal: events.reduce((s, e) => s + e.rankResidual, 0),
  dedupSuspectEvents: events.filter((e) => e.dedupSuspect).length,
  // 诉求2硬指标:泛化套话标题与局内雷同(标题/选项)放行数,必须全 0。
  genericTitleEvents: events.filter((e) => e.titleGeneric).length,
  withinGameTitleDup: withinTitleDup,
  withinGameChoiceDup: withinChoiceDup,
  crossGameTitleDupRate: `${((100 * (allTitles.length - uniqueTitles.size)) / (allTitles.length || 1)).toFixed(1)}% (${allTitles.length - uniqueTitles.size}/${allTitles.length})`,
  latency: {
    p50: events.map((e) => e.latencyMs).sort((a, b) => a - b)[Math.floor(events.length * 0.5)] || 0,
    p95: events.map((e) => e.latencyMs).sort((a, b) => a - b)[Math.floor(events.length * 0.95)] || 0,
    max: Math.max(...events.map((e) => e.latencyMs), 0),
  },
  llmRetries: stats.reduce((s, g) => s + g.llmRetries, 0),
  promotions: {
    goodPolicy: goodGames.map((g) => g.promotions),
    randomPolicy: stats.filter((g) => g.policy === 'random' && g.endingType !== 'ABORTED').map((g) => g.promotions),
  },
  endings: stats.reduce<Record<string, number>>((acc, g) => { acc[g.endingType] = (acc[g.endingType] || 0) + 1; return acc; }, {}),
  wallClockSec: Math.round((Date.now() - t0) / 1000),
  perGame: stats.map((g) => ({
    id: g.gameId, dept: g.deptName, diff: g.difficulty, policy: g.policy,
    steps: g.events.length, promos: g.promotions, ending: g.endingType, rank: g.finalRank,
    continuity: `${g.events.filter((e) => e.continuityPresent).length}/${g.events.length}`,
    npcReuse: `${g.reusedNPCs}/${g.totalNPCs}`,
    rankFixes: g.events.reduce((s, e) => s + e.rankFixes, 0),
    dedupSuspects: g.events.filter((e) => e.dedupSuspect).length,
    bgOk: g.bgOk, retries: g.llmRetries,
  })),
};

mkdirSync(resolve(ROOT, 'test-results'), { recursive: true });
writeFileSync(resolve(ROOT, 'test-results', 'diversity-scan.json'), JSON.stringify({ summary, games: stats }, null, 2));
console.log('\n===== 多样性验证汇总 =====');
console.log(JSON.stringify({ ...summary, perGame: `(${summary.perGame.length}局,详见JSON)` }, null, 2));
serverProc.kill('SIGTERM');
process.exit(0);
