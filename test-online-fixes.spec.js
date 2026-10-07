import { test, expect } from '@playwright/test';

// Online hardening: opponent-card repaint (+ broken-photo fallback) and the
// host clock-sync handler. No P2P needed — fabricated local state only.
test('opp card repaint and clock sync apply cleanly', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });

  // Minimal opponent card, as rendered by _renderOnlineGame.
  await page.evaluate(() => {
    document.getElementById('online-content').innerHTML =
      `<div class="profile-card opponent" id="oprofile-opp">` +
      `<div class="avatar-letter">Z</div>` +
      `<div class="info"><span class="name">Zed</span><span class="sub">Black · </span>` +
      `<div class="captured-row" data-cap="opp"></div></div>` +
      `<div class="clock" id="oclock-top">--:--</div></div>` +
      `<div id="online-board-wrapper"></div>`;
    window.app.online = { myColor: 'white', opp: { name: 'Zed', img: null, rating: null } };
  });

  // Photo arrives -> img tile replaces the letter.
  await page.evaluate(() => {
    window.app.online.opp = { name: 'Zed', img: 'https://example.com/z.png', rating: 900 };
    window.app._paintOppCard();
  });
  await expect(page.locator('#oprofile-opp img.avatar')).toHaveAttribute('src', 'https://example.com/z.png');
  await expect(page.locator('#oprofile-opp .info .sub')).toContainText('Black');

  // Dead photo URL -> letter tile again (no broken-image icon).
  await page.evaluate(() => {
    window.app.online.opp = { name: 'Zed', img: 'https://example.com.invalid/dead.png', rating: 900 };
    window.app._paintOppCard();
  });
  await expect(page.locator('#oprofile-opp .avatar-letter')).toContainText('Z', { timeout: 10000 });
  await expect(page.locator('#oprofile-opp img.avatar')).toHaveCount(0);

  // Profile message refreshes the card without P2P.
  await page.evaluate(() => {
    window.app.online = {
      phase: 'play', result: null, myColor: 'white',
      opp: { name: 'Zed', img: null, rating: null },
      clock: { w: 300000, b: 300000, side: 'white', turnStarted: performance.now() },
    };
    window.app._joinOnMsg('profile', { user: { id: 'u_n', name: 'Nina', img: 'https://example.com/n.png', rating: 810 } });
  });
  await expect(page.locator('#oprofile-opp .info .name')).toContainText('Nina');
  await expect(page.locator('#oprofile-opp img.avatar')).toHaveAttribute('src', 'https://example.com/n.png');

  // Host clock sync only moves the display clocks, never the engine.
  const before = await page.evaluate(() => window.app.online.clock.side);
  expect(before).toBe('white');
  await page.evaluate(() => {
    window.app._joinOnMsg('clocks', { clocks: { w: 299000, b: 300000, side: 'black' } });
  });
  const after = await page.evaluate(() => ({ side: window.app.online.clock.side, w: window.app.online.clock.w }));
  expect(after.side).toBe('black');
  expect(after.w).toBe(299000);

  // No captures -> no material badge (no phantom +1).
  await page.evaluate(() => {
    document.getElementById('online-content').innerHTML =
      `<div class="captured-row" data-cap="you"></div><div class="captured-row" data-cap="opp"></div>`;
    window.app._paintCaptured('online-content', new ChessGame(), 'white');
  });
  await expect(page.locator('#online-content .mat-edge')).toHaveCount(0);
  await expect(page.locator('#online-content [data-cap]').first()).toBeEmpty();

  // Release skew: a peer on an older build (no version tag) raises the
  // mismatch banner; a peer on the current build clears it.
  await page.evaluate(() => {
    document.getElementById('online-content').innerHTML = `<div id="online-board-wrapper"></div>`;
    window.app.online = {
      phase: 'play', result: null, myColor: 'white',
      opp: { name: 'Zed', img: null, rating: null },
      clock: { w: 300000, b: 300000, side: 'white', turnStarted: performance.now() },
    };
    window.app._joinOnMsg('profile', { user: { id: 'u_old', name: 'Old' } });
  });
  await expect(page.locator('#over-ver')).toContainText(/older|mismatch/i);
  await page.evaluate(() => {
    window.app._joinOnMsg('profile', { v: ChessCourseApp.APP_VERSION, user: { id: 'u_new', name: 'New' } });
  });
  await expect(page.locator('#over-ver')).toHaveCount(0);
});
