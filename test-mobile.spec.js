import { test, expect } from '@playwright/test';

// Phase 6: at 390px the online match board fills >= 90% of the viewport
// width and the page does not scroll vertically during a match.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mobile match: big board, no page scroll', async ({ browser }) => {
  const mk = async (uid, name) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(([id, nm]) => {
      window.app._clerk = { user: { id, fullName: nm }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
      window.app._setUser(id);
    }, [uid, name]);
    return page;
  };
  const A = await mk('u_a', 'Alpha');
  const B = await mk('u_b', 'Beta');
  for (const P of [A, B]) { await P.evaluate(() => window.app.showOnline()); }
  await A.click('text=Create game code');
  await A.waitForTimeout(7000);
  const code = await A.evaluate(() => window.app.online?.code);
  await B.fill('#join-code', code);
  await B.click('.join-row button');
  await B.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 90000 });

  const ratio = await B.evaluate(() => {
    const r = document.getElementById('online-board').getBoundingClientRect();
    return r.width / window.innerWidth;
  });
  expect(ratio).toBeGreaterThanOrEqual(0.9);

  const scrollable = await B.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight
  );
  expect(scrollable).toBeLessThanOrEqual(12);

  // Play two moves on the small screen; the page itself must not move.
  const white = (await B.evaluate(() => window.app.online.myColor)) === 'white' ? B : A;
  const black = white === B ? A : B;
  async function mv(P, f, t) {
    await P.click(`.chess-square[data-square="${f}"]`);
    await P.waitForTimeout(250);
    await P.click(`.chess-square[data-square="${t}"]`);
    await P.waitForTimeout(1500);
  }
  const y0 = await B.evaluate(() => window.scrollY);
  await mv(white, 'e2', 'e4');
  await mv(black, 'e7', 'e5');
  const y1 = await B.evaluate(() => window.scrollY);
  expect(Math.abs(y1 - y0)).toBeLessThanOrEqual(4);
  expect(await B.evaluate(() => window.app.online.engine.moveHistory.length)).toBe(2);
  await A.close();
  await B.close();
});

// Short phones (375×667): the board must be full width at the FIRST
// paint. The old height-derived width (max(270px, 100lvh − 430px)) shrank
// it to 270px until the first scroll reflow "grew" it to phone size.
test('short phone: board is full width at first paint', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
  await page.evaluate(() => window.app.showOnline());
  // The lobby first shows "Loading…" and re-renders itself when PeerJS
  // lands — inject only AFTER that, or the re-render wipes our markup.
  await page.waitForSelector('#join-code', { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById('online-content').innerHTML =
      '<div id="online-board-wrapper"><div id="online-board"></div></div>';
  });
  const ratio = await page.evaluate(() => {
    const r = document.getElementById('online-board').getBoundingClientRect();
    return r.width / window.innerWidth;
  });
  console.log('short-phone board/viewport ratio:', ratio);
  // Full width minus container/wrapper padding (~0.90); the old
  // height-derived sizing landed at 0.72 (a 270px board).
  expect(ratio).toBeGreaterThanOrEqual(0.88);
  await page.close();
});
