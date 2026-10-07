import { test, expect } from '@playwright/test';

// Regression: the joiner must apply the host's clock echo for its own moves.
// Bug: the ply idempotency guard dropped the echo (ply === s.ply), so after
// every own move the joiner's display stuck to the pre-move side and each
// device showed a different time (seen: 0:49 vs 0:17 for the same clock).
test('joiner clock converges via own-move echo', async ({ browser }) => {
  const mk = async (uid, name) => {
    const page = await browser.newPage();
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.waitForFunction(() => !!window.app._clerk, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(([id, nm]) => {
      window.app._clerk = { user: { id, fullName: nm }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
      window.app._setUser(id);
    }, [uid, name]);
    return page;
  };
  const A = await mk('u_c1', 'C1');
  const B = await mk('u_c2', 'C2');
  for (const P of [A, B]) { await P.evaluate(() => window.app.showOnline()); }
  await A.click('text=Create game code');
  await A.waitForTimeout(7000);
  const code = await A.evaluate(() => window.app.online?.code);
  await B.fill('#join-code', code);
  await B.click('.join-row button');
  await B.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 90000 });
  await A.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 90000 });
  const host = (await A.evaluate(() => window.app.online.role)) === 'host' ? A : B;
  const joiner = host === A ? B : A;
  console.log('host is A:', host === A, '| joiner color:', await joiner.evaluate(() => window.app.online.myColor));

  // Get the joiner to move: if host is white, host plays first (fast).
  const hostIsWhite = (await host.evaluate(() => window.app.online.myColor)) === 'white';
  async function mv(P, f, t) {
    await P.click(`.chess-square[data-square="${f}"]`);
    await P.waitForTimeout(250);
    await P.click(`.chess-square[data-square="${t}"]`);
    await P.waitForTimeout(1200);
  }
  if (hostIsWhite) { await mv(host, 'e2', 'e4'); }

  // Isolate the echo path: stop the host 5s clock sync.
  await host.evaluate(() => { clearInterval(window.app.online.pingTimer); });

  // Joiner thinks 3s, then moves. Its remaining must drop by the charge.
  const key = (await joiner.evaluate(() => window.app.online.myColor)) === 'white' ? 'w' : 'b';
  const r0 = await joiner.evaluate((k) => window.app.online.clock[k], key);
  console.log('joiner remaining before think:', r0);
  await joiner.waitForTimeout(3000);
  if (key === 'w') { await mv(joiner, 'd2', 'd4'); } else { await mv(joiner, 'e7', 'e5'); }
  let r1 = r0;
  for (let i = 0; i < 20; i++) {
    await joiner.waitForTimeout(500);
    r1 = await joiner.evaluate((k) => window.app.online.clock[k], key);
    if (r0 - r1 >= 1500) break;
  }
  console.log('joiner remaining after echo:', r1, 'drop:', r0 - r1);
  expect(r0 - r1).toBeGreaterThanOrEqual(1500);
  await A.close();
  await B.close();
});
