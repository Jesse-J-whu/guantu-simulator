/** 诊断:反复生成事件,LLM 返回当下即试解析,捕获首个失败样本完整转储。 */
import { createGame, nextEvent, applyChoice } from '../src/engine/gameEngine.ts';
import { parseEvent } from '../src/engine/parser.ts';
import { DEPARTMENTS } from '../src/engine/departments.ts';
import { SeededRandom } from '../src/engine/rng.ts';
import type { LLMClient } from '../src/engine/types.ts';

const KEY = process.env.GLM_API_KEY!;
const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = process.env.GLM_MODEL || 'glm-4-flash';

let calls = 0;
class ProbeLLM implements LLMClient {
  async generate(prompt: string, opts: { maxTokens?: number } = {}): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      calls++;
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: MODEL, messages: [{ role: 'user', content: prompt }],
          temperature: 0.85, max_tokens: opts.maxTokens ?? 1600, top_p: 0.9, stream: false,
        }),
      });
      const text = await resp.text();
      if (!resp.ok) {
        console.log(`call#${calls} http=${resp.status} body=${text.slice(0, 150)}`);
        if (attempt >= 4) throw new Error(`upstream ${resp.status}`);
        await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
        continue;
      }
      const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
      const content = json.choices?.[0]?.message?.content || '';
      console.log(`call#${calls} http=200 finish=${json.choices?.[0]?.finish_reason} len=${content.length}`);
      // 引擎内部会重试掩盖原始样本,这里在返回前先行解析,失败即抓现场。
      try {
        parseEvent(content, 0);
      } catch (e) {
        console.log(`\n!!!! 解析失败样本(${(e as Error).message.slice(0, 50)}…),完整原始内容:\n<<<<\n${content}\n>>>>`);
        process.exit(0);
      }
      return content;
    }
  }
}

const llm = new ProbeLLM();
let s = createGame(DEPARTMENTS[0].id, 'normal', new SeededRandom(99));
for (let i = 0; i < 24; i++) {
  s = await nextEvent(s, llm, null, new SeededRandom(100 + i));
  s = applyChoice(s, i % 4).state;
}
console.log(`完整24步无失败样本(共${calls}次调用)`);
