// LLM 代理核心 — 多上游故障切换(GLM 优先,DeepSeek 兜底)+ mock 模式 + 并发控制。
// 设计要点:
//  - 上游配置由环境变量驱动,新增供应商只需 push 到 providers;
//  - 每个上游独立熔断:连续失败后短暂冷却,恢复后自动回归;
//  - 压测模式 LLM_MODE=mock 直接返回本地生成,打满静态与 API 层。

const { mockGenerate } = require('./mockLLM.js');

const LLM_MODE = (process.env.LLM_MODE || 'real').toLowerCase();
const MAX_CONCURRENT = parseInt(process.env.LLM_MAX_CONCURRENT || '20', 10);
const UPSTREAM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10);

/** 依据环境变量构建上游列表(有序,越靠前越优先)。 */
function buildProviders() {
  const providers = [];
  if (process.env.GLM_API_KEY) {
    providers.push({
      name: 'glm',
      endpoint: process.env.GLM_ENDPOINT || 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKey: process.env.GLM_API_KEY,
      model: process.env.GLM_MODEL || 'glm-4-flash',
    });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    providers.push({
      name: 'deepseek',
      endpoint: process.env.LLM_ENDPOINT || 'https://api.deepseek.com/chat/completions',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.LLM_MODEL || 'deepseek-chat',
    });
  }
  return providers;
}

/** 识别上游内容风控拦截(GLM 1301 / contentFilter / 敏感内容提示)。 */
function isContentFilterError(message) {
  return /1301|contentFilter|内容可能|敏感|risk content|content filter/i.test(String(message || ''));
}

/** 简单熔断器:连续 N 次失败 → 冷却 M 秒。 */
class Breaker {
  constructor(failureThreshold = 3, cooldownMs = 30000) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.failures = 0;
    this.openUntil = 0;
  }
  get available() {
    return Date.now() >= this.openUntil;
  }
  recordSuccess() {
    this.failures = 0;
    this.openUntil = 0;
  }
  recordFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.openUntil = Date.now() + this.cooldownMs;
      this.failures = 0;
    }
  }
}

/** LLM 服务实例:每个 worker 一份。 */
class LLMService {
  constructor() {
    this.providers = buildProviders();
    this.breakers = new Map(this.providers.map((p) => [p.name, new Breaker()]));
    this.active = 0;
    this.queue = [];
    this.metrics = { total: 0, ok: 0, fail: 0, mock: 0, totalTimeMs: 0, lastError: '' };
  }

  get mode() {
    return LLM_MODE;
  }

  /** 并发闸门:超限请求排队,防止上游被打挂。 */
  async acquireSlot() {
    if (this.active < MAX_CONCURRENT) {
      this.active++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.active++;
  }

  releaseSlot() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  /** 单次上游调用(fetch + 超时控制)。 */
  async callProvider(provider, prompt, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const resp = await fetch(provider.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          top_p: params.topP,
          stream: false,
        }),
      });
      if (!resp.ok) {
        throw new Error(`upstream ${provider.name} ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
      }
      const data = await resp.json();
      let text = data.choices?.[0]?.message?.content || '';
      text = text.replace(/<think[\s\S]*?<\/think>/gi, '').replace(/<think[\s\S]*$/gi, '').trim();
      if (!text) throw new Error(`upstream ${provider.name} returned empty content`);
      return text;
    } catch (e) {
      // 60s 超时 abort 的原始消息是「This operation was aborted」,不含
      // timeout 字样,调用方的重试正则匹配不上,会把瞬时超时当成致命错误
      // 中断整局(8 局确认扫描实测)。统一改写成可识别的超时语义。
      if (e && typeof e === 'object' && e.name === 'AbortError') {
        throw new Error(`upstream ${provider.name} timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 对外主入口:按优先级尝试可用上游;mock 模式直接本地生成。
   * 上游内容风控拦截(GLM 1301 等)时,追加安全基调说明后原上游重试一次。
   * 全部失败时抛出最后一个错误。
   */
  async generate(prompt, params) {
    this.metrics.total++;
    const start = Date.now();

    if (LLM_MODE === 'mock') {
      this.metrics.mock++;
      const out = mockGenerate(prompt);
      this.metrics.totalTimeMs += 1;
      return out;
    }

    await this.acquireSlot();
    try {
      let lastError = null;
      for (const provider of this.providers) {
        const breaker = this.breakers.get(provider.name);
        if (!breaker.available) continue;
        try {
          const text = await this.callProvider(provider, prompt, params);
          breaker.recordSuccess();
          this.metrics.ok++;
          this.metrics.totalTimeMs += Date.now() - start;
          return text;
        } catch (e) {
          // 内容风控拦截:换正面基调重试一次(同一上游),多数可恢复。
          if (isContentFilterError(e.message)) {
            try {
              const safePrompt = `${prompt}\n\n（重试要求：请以廉洁勤政正面教育为基调重新生成本内容，严格保持原有输出格式，不渲染违规细节。）`;
              const text = await this.callProvider(provider, safePrompt, params);
              breaker.recordSuccess();
              this.metrics.ok++;
              this.metrics.totalTimeMs += Date.now() - start;
              return text;
            } catch (e2) {
              e = e2;
            }
          }
          breaker.recordFailure();
          lastError = e;
          console.error(`[llm] provider ${provider.name} failed: ${e.message}`);
        }
      }
      this.metrics.fail++;
      this.metrics.lastError = lastError ? lastError.message : 'no provider configured';
      throw new Error(this.metrics.lastError);
    } finally {
      this.releaseSlot();
    }
  }
}

module.exports = { LLMService };
