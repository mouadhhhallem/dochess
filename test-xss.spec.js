import { test, expect } from '@playwright/test';

const EVIL = '<img src=x onerror="window.__xss=1">';

test('peer and profile names cannot execute scripts', async ({ page }) => {
  const csp = [];
  page.on('console', m => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text().slice(0, 120));
  });
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
  // Let the real Clerk SDK finish loading first: its sign-in-state
  // listener would otherwise clobber the stub below mid-assertions.
  await page.waitForFunction(() => !!window.app._clerk, null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(400);

  // 1. Profile path: hostile Clerk display name must render as literal text.
  await page.evaluate((evil) => {
    window.app._clerk = {
      user: {
        id: 'u_evil', fullName: evil, username: 'x',
        primaryEmailAddress: { emailAddress: 'a@b.c' },
        imageUrl: 'assets/pieces/white-knight.svg'
      },
      openSignIn() {}, openUserProfile() {}, signOut() {}, addListener() {}, mountUserButton() {}
    };
    window.app._setUser('u_evil');
    window.app.showProfile();
  }, EVIL);
  await page.waitForTimeout(400);
  await expect(page.locator('.profile-id h3')).toContainText(EVIL);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  // 2. Peer path: sanitizer unit checks (single cleaning point).
  const clean = await page.evaluate(() => sanitizePeerUser({
    id: 'a'.repeat(200),
    name: '<img src=x onerror="window.__xss=1">\x00\x1b  ',
    img: 'javascript:alert(1)',
    rating: 1e9
  }));
  expect(clean).toEqual({ id: 'guest', name: '<img src=x onerror="wind', img: null, rating: 800 });

  // 3. Peer render path: poisoned leaderboard entry renders inert.
  await page.evaluate((evil) => {
    let b = {};
    try { b = JSON.parse(localStorage.getItem('ccr_board') || '{}'); } catch (_) {}
    b.evil = { name: evil, cats: { blitz: 900 }, seen: Date.now() };
    localStorage.setItem('ccr_board', JSON.stringify(b));
    window.app.showOnline();
  }, EVIL);
  await page.waitForTimeout(400);
  await expect(page.locator('.board-name').first()).toContainText(EVIL);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();

  // 4. No CSP violations broke the app on this flow.
  expect(csp).toEqual([]);
});
