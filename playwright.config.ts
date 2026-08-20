// Playwright 配置 — 真实浏览器(Firefox)E2E 验证。
// 独立端口 + 独立 SQLite + mock LLM,与开发环境完全隔离,可反复运行。
import { defineConfig, devices } from '@playwright/test';

const PORT = 3311;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
  },
  projects: [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }],
  webServer: {
    command: `npm run build --silent && rm -f data/e2e.db data/e2e.db-shm data/e2e.db-wal && LLM_MODE=mock PORT=${PORT} WORKERS=1 DB_PATH=data/e2e.db node server.js`,
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
});
