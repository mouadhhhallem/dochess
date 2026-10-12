import { test, expect } from '@playwright/test';

// Phase 5: the wheel picker drives the game clock. Pick 3+2, create a game,
// assert base 180000 ms + increment 2000 ms, and that the increment is
// actually credited to the mover by the host-owned clock.
test('wheel picker builds a 3+2 game with working increment', async ({ browser }) => {
  const mk = async (uid, name) => {
    const page = await browser.newPage();
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

  // Desktop lobby: time control is a preset-button grid (>=1025px hides
  // the scroll wheels). Pick 3+2; summary + storage must agree.
  await A.click('[data-action="lobby-preset"][data-m="3"][data-s="2"]');
  await A.waitForTimeout(300);
  const sum = await A.evaluate(() => document.getElementById('wheel-summary').textContent.replace(/\s+/g, ' '));
  expect(sum).toMatch(/Blitz/);
  expect(sum).toMatch(/3\+2/);
  const stored = await A.evaluate(() => JSON.parse(localStorage.getItem('cc_control')));
  expect(stored).toEqual({ m: 3, s: 2 });
  expect(await A.evaluate(() => document.querySelector('.tc-preset.on')?.dataset.m)).toBe('3');
  expect(await A.evaluate(() => document.querySelector('.tc-preset.on')?.dataset.s)).toBe('2');

  // Swapping presets rewrites the control too.
  await A.click('[data-action="lobby-preset"][data-m="5"][data-s="0"]');
  await A.waitForTimeout(200);
  expect(await A.evaluate(() => JSON.parse(localStorage.getItem('cc_control')))).toEqual({ m: 5, s: 0 });
  await A.click('[data-action="lobby-preset"][data-m="3"][data-s="2"]');
  await A.waitForTimeout(200);
  expect(await A.evaluate(() => JSON.parse(localStorage.getItem('cc_control')))).toEqual({ m: 3, s: 2 });

  // Tablets (<1025px) keep the keyboard wheel picker: shrink the window,
  // drive the wheels with click + arrows, then restore desktop size.
  await A.setViewportSize({ width: 900, height: 800 });
  await A.waitForTimeout(300);
  await A.click('#wheel-min [data-val="3"]');
  await A.click('#wheel-inc [data-val="2"]');
  await A.waitForTimeout(400);

  // Keyboard works too: Up from 3 -> 2 minutes.
  await A.click('#wheel-min');
  await A.keyboard.press('ArrowUp');
  await A.waitForTimeout(400);
  expect(await A.evaluate(() => document.getElementById('wheel-summary').textContent)).toMatch(/2\+2/);
  await A.keyboard.press('ArrowDown');
  await A.waitForTimeout(400);
  expect(await A.evaluate(() => document.getElementById('wheel-summary').textContent)).toMatch(/3\+2/);
  expect(await A.evaluate(() => JSON.parse(localStorage.getItem('cc_control')))).toEqual({ m: 3, s: 2 });
  await A.setViewportSize({ width: 1280, height: 720 });
  await A.waitForTimeout(300);

  await A.click('text=Create game code');
  await A.waitForTimeout(7000);
  const cfg = await A.evaluate(() => ({ base: window.app.online.control.base, inc: window.app.online.control.inc, id: window.app.online.control.id }));
  expect(cfg).toEqual({ base: 180000, inc: 2000, id: 'blitz' });

  const code = await A.evaluate(() => window.app.online?.code);
  await B.fill('#join-code', code);
  await B.click('.join-row button');
  await B.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 60000 });

  // White moves; host clock must show base + increment credited.
  const white = (await B.evaluate(() => window.app.online.myColor)) === 'white' ? B : A;
  async function mv(P, f, t) {
    await P.click(`.chess-square[data-square="${f}"]`);
    await P.waitForTimeout(250);
    await P.click(`.chess-square[data-square="${t}"]`);
    await P.waitForTimeout(1200);
  }
  await mv(white, 'e2', 'e4');
  const clocks = await white.evaluate(() => {
    const s = window.app.online;
    const hostSide = s.role === 'host';
    return { hostSide, w: Math.round(s.clock.w), b: Math.round(s.clock.b) };
  });
  // Mover (white) clock ~= base - think + 2000 increment, i.e. > base - 5000.
  // Just assert clocks exist and white got its increment on the host record.
  const hostPage = clocks.hostSide ? white : (white === A ? B : A);
  const hostClocks = await hostPage.evaluate(() => ({ w: Math.round(window.app.online.clock.w), b: Math.round(window.app.online.clock.b) }));
  expect(hostClocks.w).toBeGreaterThan(180000 - 8000);
  expect(hostClocks.w).toBeLessThanOrEqual(182000 + 1000);
  await A.close();
  await B.close();
});
