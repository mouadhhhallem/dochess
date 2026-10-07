import { test, expect } from '@playwright/test';

// Guards the no-rebuild contract: the same 64 square nodes must survive
// selects AND moves on both boards; selection must be sub-frame-ish.
test('no-rebuild contract: node identity across select+move', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
  await page.click('text=Start Learning');
  await page.locator('.lesson-card button').first().click();
  await expect(page.locator('#lesson-screen')).toBeVisible();
  await page.waitForTimeout(800);

  const res = await page.evaluate(async () => {
    const ids = () => [...document.querySelectorAll('#chess-board .chess-square')];
    const before = new Set(ids());
    const countOk = before.size === 64;
    // select
    let t0 = performance.now();
    document.querySelector('.chess-square[data-square="e2"]').click();
    const handlerSelect = performance.now() - t0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterSelect = ids();
    const selStable = afterSelect.length === 64 && afterSelect.every((n) => before.has(n));
    // move
    t0 = performance.now();
    document.querySelector('.chess-square[data-square="e4"]').click();
    const handlerMove = performance.now() - t0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterMove = ids();
    const moveStable = afterMove.length === 64 && afterMove.every((n) => before.has(n));
    return {
      countOk, selStable, moveStable,
      handlerSelectMs: Math.round(handlerSelect * 10) / 10,
      handlerMoveMs: Math.round(handlerMove * 10) / 10,
    };
  });
  console.log(`nodestab=${JSON.stringify(res)}`);
  expect(res.countOk).toBe(true);
  expect(res.selStable).toBe(true);
  expect(res.moveStable).toBe(true);
  expect(res.handlerSelectMs).toBeLessThan(50);
  expect(res.handlerMoveMs).toBeLessThan(50);
  await expect(page.locator('#lesson-feedback.success')).toContainText('Wonderful', { timeout: 5000 });

  // Fast drag path: reset, then drag e2->e4. No ghost may be left behind,
  // and no ghost may ever sit at the viewport origin (top-left flash).
  await page.evaluate(() => window.app.resetBoard());
  const e2 = await page.locator('.chess-square[data-square="e2"]').boundingBox();
  const e4 = await page.locator('.chess-square[data-square="e4"]').boundingBox();
  await page.mouse.move(e2.x + e2.width / 2, e2.y + e2.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(e2.x + ((e4.x - e2.x) * i) / 4, e2.y + ((e4.y - e2.y) * i) / 4);
  }
  await page.mouse.up();
  await expect(page.locator('#lesson-feedback.success')).toContainText('Wonderful', { timeout: 5000 });
  const strays = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.drag-ghost, .fly-piece').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < 100 && r.top < 250) bad.push(`${el.className}@${Math.round(r.left)},${Math.round(r.top)}`);
    });
    return { leftover: document.querySelectorAll('.drag-ghost').length, originFlashes: bad };
  });
  expect(strays.leftover).toBe(0);
  expect(strays.originFlashes).toEqual([]);
});
