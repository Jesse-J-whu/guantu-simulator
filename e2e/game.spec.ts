/**
 * E2E:真实浏览器(Firefox)完整对局验证。
 * 服务端以 LLM_MODE=mock 启动(确定性,不消耗 API 配额),
 * 走完 选部门 → 背景 → 24 次选择(含晋升弹层) → 结局 → 仪表盘 全流程。
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('完整一局:部门选择 → 开局背景 → 24 步抉择 → 结局', async ({ page }) => {
  test.setTimeout(240_000);

  // 捕获浏览器侧错误,便于诊断。
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300));
  });

  // ---- 1. 部门选择屏 ----
  await page.goto('/');
  await expect(page.locator('#dept-grid')).toBeVisible();
  await expect(page.locator('.dept-card')).toHaveCount(13);
  await page.screenshot({ path: 'test-results/e2e-01-dept-select.png' });

  // 13 部门星级应渲染(星级组件存在)。
  await expect(page.locator('.dept-ratings').first()).toBeVisible();

  // 选择第一个部门(委办·推荐新手),标准难度,开始。
  await page.locator('.dept-card').first().click();
  await page.locator('#diff-group .diff-btn', { hasText: '标准' }).click();
  await page.locator('#btn-start').click();

  // ---- 2. 开局背景屏(打字机动画) ----
  await expect(page.locator('.story-text')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.story-text')).toContainText(/./, { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/e2e-02-background.png' });
  await page.locator('.skip-btn').click();
  await page.getByRole('button', { name: '开始你的官途' }).click();

  // ---- 3. 游戏主循环:24 步 ----
  let promotionShots = 0;
  let titleAtStep1 = '';
  const promo = page.locator('[data-testid="promo-overlay"]');
  const titleEl = page.locator('.event-title');

  /** 瞬时读取页面状态(直接查 DOM,不为缺失元素等待)。 */
  const pageState = () =>
    page.evaluate(() => ({
      error: !!document.querySelector('[data-testid="error-card"]'),
      promo: !!document.querySelector('[data-testid="promo-overlay"]'),
      result: !!document.querySelector('#screen-result'),
      title: (document.querySelector('.event-title')?.textContent || '').trim(),
    }));

  for (let step = 1; step <= 24; step++) {
    await expect(titleEl).toBeVisible({ timeout: 30_000 });
    const prevTitle = ((await titleEl.textContent()) || '').trim();
    if (step === 1) {
      titleAtStep1 = prevTitle;
      expect(titleAtStep1.length).toBeGreaterThan(0);
      // 每年界面必须常驻显示当前职级与官职(HUD 两项 + 事件卡徽标)。
      await expect(page.locator('#hud-rank')).toContainText('科员');
      await expect(page.locator('#hud-position')).toContainText('综合科科员');
      await expect(page.locator('[data-testid="event-position"]')).toContainText('科员');
      await page.screenshot({ path: 'test-results/e2e-03-first-event.png' });
    }

    // 轮换点击 4 个选项,覆盖不同行为分支。
    await page.locator(`[data-testid="choice-${(step - 1) % 4}"]`).click();

    // 属性变化 toast 必须出现(诉求:每次选择都有可感知反馈)。
    // 第 24 步(终局)直接转入结局屏,不经过 toast。
    if (step < 24) {
      await expect(page.locator('[data-testid="attr-toast"]')).toBeVisible({ timeout: 10_000 });
    }
    if (step === 1) {
      await page.screenshot({ path: 'test-results/e2e-04-attr-toast.png' });
    }

    // 等待本步推进:晋升弹层先于下一事件出现(Toast 关闭后弹出),
    // 否则事件标题变化(mock 标题库保证一局内标题唯一)或进入结局屏。
    let outcome = 'WAIT';
    await expect
      .poll(
        async () => {
          const s = await pageState();
          if (s.error) return (outcome = 'ERROR');
          if (s.promo) return (outcome = 'PROMO');
          if (s.result) return (outcome = 'RESULT');
          return (outcome = s.title && s.title !== prevTitle ? 'NEXT' : 'WAIT');
        },
        { timeout: 40_000 },
      )
      .not.toBe('WAIT');
    console.log(`[e2e] step=${step} outcome=${outcome}`);
    if (outcome === 'ERROR') {
      console.log(`[e2e] 第 ${step} 步推演中断,点击重试`);
      await page.screenshot({ path: `test-results/e2e-error-step${step}.png` });
      await page.locator('[data-testid="retry-btn"]').click();
      await expect
        .poll(
          async () => {
            const s = await pageState();
            if (s.result) return 'RESULT';
            return s.title && s.title !== prevTitle ? 'NEXT' : 'WAIT';
          },
          { timeout: 40_000 },
        )
        .not.toBe('WAIT');
    }

    if (outcome === 'PROMO') {
      // 文案带装饰空格("恭 喜 晋 升"),用正则断言。
      await expect(promo).toContainText(/晋\s*升/);
      // 晋升庆祝显示官职变迁行(如 综合科科员/秘书 → 综合科副科长/副主任科员)。
      await expect(page.locator('[data-testid="promo-position"]')).toContainText('→');
      if (promotionShots < 2) {
        await page.screenshot({ path: `test-results/e2e-05-promotion-${promotionShots + 1}.png` });
      }
      promotionShots++;
      await page.locator('[data-testid="promo-continue"]').click();
      // 庆祝关闭后等待下一事件/结局。
      await expect
        .poll(
          async () => {
            const s = await pageState();
            if (s.result) return 'RESULT';
            return s.title && s.title !== prevTitle ? 'NEXT' : 'WAIT';
          },
          { timeout: 40_000 },
        )
        .not.toBe('WAIT');
    }
  }

  // ---- 4. 结局屏 ----
  await expect(page.locator('#screen-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.result-title')).toBeVisible();
  await expect(page.locator('.result-hero')).toBeVisible();
  // 结算统计显示终局官职(与 rankPositions 对照表同源)。
  await expect(page.locator('[data-testid="final-position"]')).toContainText('官职');
  await page.screenshot({ path: 'test-results/e2e-06-result.png', fullPage: true });

  // 时间线应完整呈现本局轨迹。
  const timelineCount = await page.locator('.timeline-section li, .timeline-item, .timeline-section > *').count();
  expect(timelineCount).toBeGreaterThan(0);

  // ---- 5. 玩家轨迹已留存到服务端 ----
  const stats = await page.request.get('/api/stats');
  expect(stats.ok()).toBeTruthy();
  const data = (await stats.json()) as {
    sessions: { started: number; completed: number; completionRate: number; recent: unknown[] };
  };
  expect(data.sessions.started).toBeGreaterThanOrEqual(1);
  expect(data.sessions.completed).toBeGreaterThanOrEqual(1);
  expect(data.sessions.completionRate).toBeGreaterThan(0);
  console.log(`[e2e] 晋升弹层出现 ${promotionShots} 次;首个事件「${titleAtStep1}」`);
});

test('admin 数据仪表盘可访问且展示留存', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('body')).toContainText(/统计|留存|访问/i);
  await page.screenshot({ path: 'test-results/e2e-07-admin.png' });
});

test('健康检查与 LLM 代理(mock)可用', async ({ request }) => {
  const health = await request.get('/healthz');
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).mode).toBe('mock');

  const llm = await request.post('/api/llm-proxy', {
    data: { prompt: '官途开局背景:测试', max_tokens: 800, temperature: 0.8 },
  });
  expect(llm.ok()).toBeTruthy();
  const body = (await llm.json()) as { content: string; provider: string };
  expect(body.content.length).toBeGreaterThan(20);
  expect(body.provider).toBe('mock');
});
