/** 诊断:复现 0 选项解析失败,转储 GLM 原始返回(不入库,不提交报告)。 */
import { createGame, nextEvent, applyChoice } from '../src/engine/gameEngine.ts';
import { buildEventPrompt, NARRATIVE_DIRECTIVES } from '../src/engine/promptBuilder.ts';
import { DEPARTMENTS } from '../src/engine/departments.ts';
import { SeededRandom } from '../src/engine/rng.ts';
import type { LLMClient } from '../src/engine/types.ts';

const KEY = process.env.GLM_API_KEY!;
const ENDPOINT = process.env.GLM_ENDPOINT || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = process.env.GLM_MODEL || 'glm-4-flash';

class DumpLLM implements LLMClient {
  n = 0;
  async generate(prompt: string, opts: { maxTokens?: number } = {}): Promise<string> {
    this.n++;
    const body = {
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.85,
      max_tokens: opts.maxTokens ?? 1600,
      top_p: 0.9,
      stream: false,
    };
    const t0 = Date.now();
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      error?: { code?: string; message?: string };
    };
    console.log(`\n===== call#${this.n} ${Date.now() - t0}ms http=${resp.status} finish_reason=${json.choices?.[0]?.finish_reason} =====`);
    if (json.error) console.log('API ERROR:', JSON.stringify(json.error).slice(0, 300));
    const content = json.choices?.[0]?.message?.content || '';
    console.log(`len=${content.length} 选项数=${(content.match(/【选项/g) || []).length}`);
    console.log('RAW<<<\n' + content + '\n>>>RAW');
    return content;
  }
}

const dept = DEPARTMENTS[2]; // 组织部(与失败局相同)
console.log(`dept=${dept.name} prompts走直连 ${MODEL}`);
let s = createGame(dept.id, 'hard', new SeededRandom(20260821002));
const llm = new DumpLLM();
for (let step = 0; step < 5; step++) {
  console.log(`\n########## step ${step + 1} ##########`);
  try {
    s = await nextEvent(s, llm, null, new SeededRandom(20260821000 + step));
    console.log(`OK title=${s.currentEvent!.title} choices=${s.currentEvent!.choices.length}`);
    s = applyChoice(s, 0).state;
  } catch (e) {
    console.log('FAILED:', (e as Error).message);
    break;
  }
}
console.log('\n--- 附:直接用第4步提示词(带错误注入格式说明)单发 ---');
const prompt = buildEventPrompt({
  state: s,
  directive: NARRATIVE_DIRECTIVES[5].text,
  lastEvent: s.currentEvent,
  ragSection: '',
  avoidNote: '上次输出未按格式解析(仅解析到 0 个选项),必须严格按【】标记输出全部字段与四个选项',
});
await llm.generate(prompt, { maxTokens: 1600 });
