// 复现 E2E 卡住:模拟引擎+服务端 mock 的 8 步序列,找出哪一步抛错。
import { createServer } from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'guantu-repro-'));
const db = openDb(join(dir, 't.db'));
const llm = {
  mode: 'mock',
  generate: async (prompt) => (await import('../server/mockLLM.js')).mockGenerate(prompt),
};
const server = createServer(createApp({ db, llm, rootDir: process.cwd() }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// 最小 LLMClient 走 HTTP(与浏览器路径一致)。
const llmClient = {
  async generate(prompt, opts = {}) {
    const resp = await fetch(`${base}/api/llm-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: opts.maxTokens ?? 1600, temperature: opts.temperature ?? 0.85 }),
    });
    if (!resp.ok) throw new Error(`proxy ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.content;
  },
};

const { createGame, generateBackground, nextEvent, applyChoice } = await import('../src/engine/gameEngine.ts');
const { SeededRandom } = await import('../src/engine/rng.ts');

let state = createGame('weiban', 'normal', new SeededRandom(12345));
state = await generateBackground(state, llmClient);
const rotation = [0, 1, 2, 3];
for (let i = 0; i < 8; i++) {
  try {
    state = await nextEvent(state, llmClient, null, new SeededRandom(100 + i));
    console.log(`step${i + 1} 事件「${state.currentEvent.title}」选项数=${state.currentEvent.choices.length} 修复=${state.currentEvent.repairs.length}`);
  } catch (e) {
    console.error(`step${i + 1} nextEvent 抛错:`, e.message);
    break;
  }
  state = applyChoice(state, rotation[i % 4]).state;
}
server.close();
db.close();
rmSync(dir, { recursive: true, force: true });
