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

  // Live check: with the host's 5s sync running mid-turn, both devices must
  // agree on BOTH clocks. The raw-stored sync used to re-widen the gap by
  // the full elapsed think time on every ping (host draining, joiner's view
  // jumping back to the turn-start value).
  await host.evaluate(() => window.app._startOnlinePing());
  const disp = (P) => P.evaluate(() => {
    const s = window.app.online, c = s.clock, now = performance.now();
    const f = (col) => {
      const k = col === 'white' ? 'w' : 'b';
      let ms = c[k];
      if (s.phase === 'play' && !s.result && c.side === col) ms -= now - c.turnStarted;
      return Math.max(0, ms);
    };
    return { w: f('white'), b: f('black') };
  });
  let worst = 0;
  for (let i = 0; i < 18; i++) {
    await host.waitForTimeout(400);
    const h = await disp(host), j = await disp(joiner);
    worst = Math.max(worst, Math.abs(h.w - j.w), Math.abs(h.b - j.b));
  }
  console.log('worst cross-device clock drift (ms):', worst);
  expect(worst).toBeLessThan(1200);

  // Rated finish: result line carries the delta and the You-card sub shows
  // new rating plus delta, e.g. "Black · 831 (-26)". Needs 2+ plies.
  const plies = await host.evaluate(() => window.app.online.engine.moveHistory.length);
  if (plies < 2) { await mv(host, 'e7', 'e5'); }
  await joiner.evaluate(() => window.app._onlineResign());
  await host.waitForTimeout(2500);
  const winSub = await host.evaluate(() => document.querySelector('#oprofile-you .info .sub')?.textContent || '');
  const winResult = await host.evaluate(() => (document.getElementById('online-result')?.textContent || '').replace(/\s+/g, ' '));
  console.log('winner sub:', JSON.stringify(winSub), '| result:', JSON.stringify(winResult.slice(0, 80)));
  // You-card carries the whole change: "Black · 800 → 820 (+20)".
  expect(winSub).toMatch(/· \d+ → \d+ \(\+\d+\)/);
  expect(winResult).toMatch(/Rating \+\d+ → \d+/);
  // The resigner (loser) sees the same arrow format with the minus delta.
  const loseSub = await joiner.evaluate(() => document.querySelector('#oprofile-you .info .sub')?.textContent || '');
  console.log('loser sub:', JSON.stringify(loseSub));
  expect(loseSub).toMatch(/· \d+ → \d+ \(-\d+\)/);
  await A.close();
  await B.close();
});

// Regression: the host's 5s 'clocks' sync and every state snapshot used to
// send the RAW stored remainders ("remaining when the turn started"), while
// the joiner snaps them with turnStarted = now — so mid-turn the joiner
// treated stale think-time as current and drifted ahead of the host by the
// whole elapsed turn on every sync (seen: 0:49 vs 0:17 for the same clock).
test('mid-turn clock sync carries displayed remainders', async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });

  const res = await page.evaluate(() => {
    const app = window.app;
    const mk = (role) => ({
      role, phase: 'play', result: null,
      myColor: role === 'host' ? 'white' : 'black',
      oppColor: role === 'host' ? 'black' : 'white',
      epoch: 1, ply: 3, control: { id: 'blitz', base: 180000, inc: 2000 },
      conn: {},
      clock: { w: 60000, b: 60000, side: 'white', turnStarted: performance.now() },
      net: { send: (c, m) => { (window.__sent = window.__sent || []).push(m); return true; } }
    });
    window.__sent = [];

    // Host is 3s into white's turn: displayed ~57000, stored still 60000.
    app.online = mk('host');
    app.online.clock.turnStarted = performance.now() - 3000;
    const hostSnap = app._clockSnapshot();
    app._startOnlinePing();
    clearInterval(app.online.pingTimer);
    const ping = (window.__sent || []).find((m) => m.type === 'clocks');
    if (!ping) return { err: 'host sent no clocks ping' };

    // Joiner applies the sync: its display must match the host's now.
    app.online = mk('joiner');
    app._joinOnMsg('clocks', ping);
    const drift = app._clockSnapshot().w - hostSnap.w;

    // A sync stamped with an older ply (pre-move side) must change nothing.
    const before = JSON.stringify(app.online.clock);
    app._joinOnMsg('clocks', { type: 'clocks', epoch: 1, ply: 2, clocks: { w: 1000, b: 1000, side: 'black' } });
    const dropped = JSON.stringify(app.online.clock) === before;
    app.online = null;
    return { pingPly: ping.ply, sentW: ping.clocks.w, drift, dropped };
  });

  console.log('clocks ping:', JSON.stringify(res));
  expect(res.err).toBeUndefined();
  expect(res.pingPly).toBe(3);
  // Raw stored would be 60000; the displayed mid-turn value is ~57000.
  expect(res.sentW).toBeLessThan(58000);
  expect(res.sentW).toBeGreaterThan(55500);
  // The joiner converges with the host (the raw sync left ~3000ms here).
  expect(Math.abs(res.drift)).toBeLessThan(400);
  // Wrong-ply syncs are dropped entirely.
  expect(res.dropped).toBe(true);
  await page.close();
});
