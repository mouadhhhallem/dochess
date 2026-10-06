import { test, expect } from '@playwright/test';

// Regression: same account on both tabs must NEVER silently swallow a result.
// Bug (before fix): both tabs share ccr_<uid> + the processed game-id list,
// so the second finisher's write is dropped as "already applied" — a win can
// vanish while a loss counts. Fixed behavior: self-play is detected and the
// game is marked unrated with a clear message, rating untouched.
test('self-play between two tabs of one account is unrated, never one-sided', async ({ browser }) => {
  const mk = async () => {
    const page = await browser.newPage();
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    // Let the real Clerk SDK settle first: its sign-in-state listener would
    // otherwise clobber the stub below mid-test.
    await page.waitForFunction(() => !!window.app._clerk, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.app._clerk = { user: { id: 'u_same', fullName: 'Same' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
      window.app._setUser('u_same');
    });
    return page;
  };
  const A = await mk();
  const B = await mk();
  for (const P of [A, B]) { await P.evaluate(() => window.app.showOnline()); }
  await A.click('text=Create game code');
  await A.waitForTimeout(7000);
  const code = await A.evaluate(() => window.app.online?.code);
  await B.fill('#join-code', code);
  await B.click('.join-row button');
  await B.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 60000 });
  // two plies so the game is ratable (1 ply would abort unrated), then B resigns
  const white = (await B.evaluate(() => window.app.online.myColor)) === 'white' ? B : A;
  const black = white === B ? A : B;
  async function mv(P, f, t) {
    await P.click(`.chess-square[data-square="${f}"]`);
    await P.waitForTimeout(250);
    await P.click(`.chess-square[data-square="${t}"]`);
    await P.waitForTimeout(1200);
  }
  await mv(white, 'e2', 'e4');
  await mv(black, 'e7', 'e5');
  await B.evaluate(() => window.app._onlineResign());
  await B.waitForTimeout(2000);
  const ratingB = await B.evaluate(() => OnlineRatings.get('u_same', 'blitz'));
  const ratingA = await A.evaluate(() => OnlineRatings.get('u_same', 'blitz'));
  const msgB = await B.evaluate(() => document.getElementById('online-status')?.textContent || '');
  const msgA = await A.evaluate(() => document.getElementById('online-status')?.textContent || '');
  // Fixed behavior: both tabs say unrated self-play, rating untouched at 800.
  expect(ratingB).toBe(800);
  expect(ratingA).toBe(800);
  expect(msgB + ' ' + msgA).toMatch(/playing yourself|not rated/i);
  await A.close();
  await B.close();
});
