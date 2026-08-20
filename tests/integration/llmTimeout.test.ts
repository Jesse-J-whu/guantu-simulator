import { afterEach, describe, expect, it } from 'vitest';

/**
 * 上游超时的错误语义:AbortError 必须改写为含 timeout 的消息。
 * 真实 GLM 扫描实测:60s 超时的原始消息「This operation was aborted」
 * 匹配不到任何重试正则,瞬时超时被当成致命错误中断整局。
 */

process.env.LLM_MODE = 'real';
process.env.GLM_API_KEY = process.env.GLM_API_KEY || 'test-key';

// 服务端 CJS 模块无类型声明(与 tests/integration/server.test.ts 同款 require 方式)。
type LLMServiceLike = new () => { generate(prompt: string, params?: Record<string, unknown>): Promise<string> };
const { LLMService } = require('../../server/llm.js') as { LLMService: LLMServiceLike };

const realFetch = globalThis.fetch;

describe('LLM 代理上游超时语义', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('AbortError → 改写为 upstream … timeout(可被重试正则识别)', async () => {
    globalThis.fetch = (async () => {
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      throw err;
    }) as typeof fetch;
    const svc = new LLMService();
    await expect(svc.generate('测试提示词', {})).rejects.toThrow(/timeout/);
  });

  it('非 abort 的上游错误原样透传(语义不被吞掉)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('fetch failed: connection refused');
    }) as typeof fetch;
    const svc = new LLMService();
    await expect(svc.generate('测试提示词', {})).rejects.toThrow(/fetch failed/);
  });
});
