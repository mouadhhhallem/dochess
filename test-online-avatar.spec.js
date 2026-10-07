import { test, expect } from '@playwright/test';

// The opponent photo must survive the full hello/welcome wire path when
// both peers are signed in with an https avatar.
test('opp photo travels the wire end-to-end', async ({ browser }) => {
  const mk = async (uid, name) => {
    const page = await browser.newPage();
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(([id, nm]) => {
      window.app._clerk = {
        user: { id, fullName: nm, imageUrl: `https://img.clerk.com/${id}.png` },
        openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {}
      };
      window.app._setUser(id);
    }, [uid, name]);
    return page;
  };
  const A = await mk('u_p1', 'PhotoA');
  const B = await mk('u_p2', 'PhotoB');
  for (const P of [A, B]) { await P.evaluate(() => window.app.showOnline()); }
  await A.click('text=Create game code');
  await A.waitForTimeout(7000);
  const code = await A.evaluate(() => window.app.online?.code);
  await B.fill('#join-code', code);
  await B.click('.join-row button');
  await B.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 90000 });
  await A.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 90000 });

  const srcA = await A.evaluate(() => document.querySelector('#oprofile-opp img.avatar')?.getAttribute('src') || null);
  const srcB = await B.evaluate(() => document.querySelector('#oprofile-opp img.avatar')?.getAttribute('src') || null);
  console.log('host opp img:', srcA, '| joiner opp img:', srcB);
  expect(srcA).toBe('https://img.clerk.com/u_p2.png');
  expect(srcB).toBe('https://img.clerk.com/u_p1.png');
  await A.close();
  await B.close();
});

// Self-healing: both roles re-send their identity on the ping heartbeat, so
// a photo missing at handshake (auth resolving late, raced reconnect) heals
// within one cycle instead of staying a letter tile all game.
test('ping heartbeat re-sends my profile on both roles', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });

  const run = (role) => page.evaluate((r) => {
    const app = window.app;
    window.__sent = [];
    app._clerk = {
      user: { id: 'u_hb', fullName: 'Heartbeat', imageUrl: 'https://img.clerk.com/hb.png' },
      openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {}
    };
    app.userId = 'u_hb';
    app.online = {
      role: r, phase: 'play', result: null, epoch: 1, ply: 2, conn: {},
      myColor: 'black', oppColor: 'white',
      clock: { w: 300000, b: 300000, side: 'white', turnStarted: performance.now() },
      net: { send: (c, m) => { window.__sent.push(m); return true; } }
    };
    app._startOnlinePing();
    clearInterval(app.online.pingTimer);
    const sent = window.__sent.slice();
    app.online = null; app.userId = null;
    return sent;
  }, role);

  const appVersion = await page.evaluate(() => ChessCourseApp.APP_VERSION);
  for (const role of ['host', 'join']) {
    const sent = await run(role);
    const prof = sent.find((m) => m.type === 'profile');
    console.log(role, 'heartbeat sent:', sent.map((m) => m.type).join(','));
    expect(prof).toBeTruthy();
    expect(prof.user.img).toBe('https://img.clerk.com/hb.png');
    expect(prof.user.name).toBe('Heartbeat');
    expect(prof.v).toBe(appVersion);
  }
  // Host also pings and syncs clocks; the joiner keeps the wire quiet.
  const hostSent = await run('host');
  expect(hostSent.some((m) => m.type === 'ping')).toBe(true);
  expect(hostSent.some((m) => m.type === 'clocks')).toBe(true);
  const joinSent = await run('join');
  expect(joinSent.some((m) => m.type === 'ping' || m.type === 'clocks')).toBe(false);
});
