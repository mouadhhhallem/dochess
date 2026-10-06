import { test, expect } from '@playwright/test';

// Table-driven: every game end, from each color's perspective, must credit
// the correct score. Session is stubbed (real engine + real rating store),
// so this runs without any network.
const SETUP = `
  window.__results = [];
  const app = window.app;
  function session(myColor, gameId) {
    const engine = new ChessGame();
    engine.moveHistory = [{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }];
    app.online = {
      phase: 'play', role: 'host', code: 'TTTTTT', epoch: 1,
      myColor, oppColor: myColor === 'white' ? 'black' : 'white',
      control: { id: 'blitz', name: 'Blitz', label: '5+0', base: 300000, inc: 0 },
      opp: { id: 'u_opp', name: 'Opp', rating: 800 },
      gameId, engine, ply: 2, sel: null, legal: [],
      pendingPromo: null, result: null, reason: null,
      rematchMe: false, rematchOpp: false, peerGone: false,
      appliedMids: new Set(), pendingIntent: null, rtt: 0,
      clock: { w: 300000, b: 300000, side: 'white', turnStarted: performance.now() },
      net: { send() { return true; } },
      conn: {}
    };
    return app.online;
  }
  window.__finishAs = (myColor, gameId, status) => {
    const s = session(myColor, gameId);
    if (status === 'resign') { app._onlineFinish('loss', 'resignation', false); }
    else if (status === 'draw') { app._onlineFinish('draw', 'agreement', false); }
    else if (status === 'timeout-win') { app._onlineFinish('win', 'timeout', false); }
    else if (status === 'timeout-loss') { app._onlineFinish('loss', 'timeout', false); }
    else if (status === 'forfeit') { app._onlineFinish('win', 'forfeit', false); }
    else {
      s.engine.getGameStatus = () => status;
      app._onlineAfterMove(true);
    }
    return { result: s.result, rating: OnlineRatings.get('u_t', 'blitz') };
  };
`;

test('every ending credits the correct side', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.app._clerk = null;
    window.app._setUser('u_t');
  });
  await page.evaluate(SETUP);
  // NOTE: engine status 'checkmate-X' means X WON (enemy of the mated side).
  // [myColor, end, expected result, expected blitz rating from 800, K=40 provisional]
  const cases = [
    ['white', 'checkmate-white', 'win', 820],
    ['white', 'checkmate-black', 'loss', 780],
    ['white', 'stalemate', 'draw', 800],
    ['black', 'checkmate-black', 'win', 820],
    ['black', 'checkmate-white', 'loss', 780],
    ['black', 'stalemate', 'draw', 800],
    ['white', 'resign', 'loss', 780],
    ['black', 'resign', 'loss', 780],
    ['white', 'draw', 'draw', 800],
    ['white', 'timeout-win', 'win', 820],
    ['black', 'timeout-loss', 'loss', 780],
    ['white', 'forfeit', 'win', 820],
  ];
  for (let i = 0; i < cases.length; i++) {
    const [color, end, wantResult, wantRating] = cases[i];
    // fresh rating state per case so each starts at 800
    await page.evaluate(() => localStorage.removeItem('ccr_u_t'));
    const got = await page.evaluate(([c, e, gid]) => window.__finishAs(c, gid, e), [color, end, 'g_case_' + i]);
    expect(got, `${color} ${end}`).toEqual({ result: wantResult, rating: wantRating });
  }
});

test('unrated self-play never touches rating and says so', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
  await page.evaluate(() => {
    window.app._clerk = null;
    window.app._setUser('u_self');
    const app = window.app;
    const engine = new ChessGame();
    engine.moveHistory = [{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }];
    app.online = {
      phase: 'play', role: 'host', code: 'TTTTTT', epoch: 1,
      myColor: 'white', oppColor: 'black',
      control: { id: 'blitz', name: 'Blitz', label: '5+0', base: 300000, inc: 0 },
      opp: { id: 'u_self', name: 'Me', rating: 800 }, unrated: true,
      gameId: 'g_self', engine, ply: 2, sel: null, legal: [],
      pendingPromo: null, result: null, reason: null,
      rematchMe: false, rematchOpp: false, peerGone: false,
      appliedMids: new Set(), pendingIntent: null, rtt: 0,
      clock: { w: 300000, b: 300000, side: 'white', turnStarted: performance.now() },
      net: { send() { return true; } }, conn: {}
    };
    app._onlineFinish('win', 'checkmate', false);
    app._renderOnlineGame();
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => OnlineRatings.get('u_self', 'blitz'))).toBe(800);
  expect(await page.evaluate(() => document.getElementById('online-result').textContent)).toMatch(/playing yourself/i);
});
