import { test, expect } from '@playwright/test';

// Ranks + achievements (achievements.js + app.js wiring). Runs on file://
// — pure localStorage + DOM, no network. Guards the honest-derivation rule:
// every rank comes from real peak ratings, every badge from real stores.

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessAchievements, null, { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!window.app && !!window.DoChessAchievements, null, { timeout: 15000 });
});

test('rank math: thresholds, progress bar, maxed legend', async ({ page }) => {
  const r = await page.evaluate(() => {
    const A = DoChessAchievements;
    return {
      b800: A.rankFor(800), b999: A.rankFor(999), s1000: A.rankFor(1000),
      g1200: A.rankFor(1200), d1600: A.rankFor(1600), m1850: A.rankFor(1850),
      gm2100: A.rankFor(2100), l2400: A.rankFor(2400), l2600: A.rankFor(2600),
      nan: A.rankFor(NaN)
    };
  });
  expect(r.b800.id).toBe('bronze');
  expect(r.b999.id).toBe('bronze');
  expect(r.s1000.id).toBe('silver');
  expect(r.g1200.id).toBe('gold');
  expect(r.d1600.id).toBe('diamond');
  expect(r.m1850.id).toBe('master');
  expect(r.gm2100.id).toBe('grandmaster');
  expect(r.l2400.id).toBe('legend');
  expect(r.l2400.next).toBeNull();
  expect(r.l2400.pct).toBe(100);
  expect(r.l2600.id).toBe('legend');
  expect(r.nan.id).toBe('bronze');
  // Gold halfway to platinum: 1300 → 50%, 100 to next.
  const mid = await page.evaluate(() => DoChessAchievements.rankFor(1300));
  expect(mid.id).toBe('gold');
  expect(mid.pct).toBe(50);
  expect(mid.toNext).toBe(100);
});

test('badges derive from real stores; founding grant on legacy data', async ({ page }) => {
  const out = await page.evaluate(() => {
    const uid = 'u_ach';
    // Real ratings record: peak 1450 blitz → rising-star + blitz-champion.
    // All three speeds played → chess-lover.
    localStorage.setItem('ccr_' + uid, JSON.stringify({
      cats: {
        bullet: { games: 1, w: 0, l: 1, d: 0, best: 800, rating: 780 },
        blitz:  { games: 4, w: 2, l: 2, d: 0, best: 1450, rating: 1420 },
        rapid:  { games: 1, w: 0, l: 0, d: 1, best: 810, rating: 810 }
      },
      processed: []
    }));
    // Learn store: 3-star on 3 levels + full knight run + xp.
    const stars = {};
    ['s1n-1', 's1n-2', 's1n-3', 's1n-4', 's1n-5', 's1n-6', 's1r-1', 's1b-1', 's1q-1'].forEach(id => { stars[id] = 3; });
    localStorage.setItem('dochess:v1', JSON.stringify({ stars, xp: 620, rushBest: 12, daily: { done: true }, streak: { count: 0, lastDay: '' }, attempts: 20, accuracy: 80, level: 1, badges: [], heatmap: {} }));
    // Lessons done (ccp_v4_<uid>).
    localStorage.setItem('ccp_v4_' + uid, JSON.stringify({ done: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }));
    const res = DoChessAchievements.evaluate(uid);
    const d = JSON.parse(localStorage.getItem('cca_v1_' + uid));
    const got = Object.keys(d.earned);
    return {
      freshIds: res.fresh.map(b => b.id),
      got,
      peak: res.rank.peak,
      rankId: res.rank.id,
      founding: !!d.flags.founding
    };
  });
  expect(out.rankId).toBe('platinum');          // peak 1450 ≥ 1400
  expect(out.founding).toBe(true);            // ccr_ predates the record
  for (const id of ['first-win', 'blitz-champion', 'rising-star',
    'perfect-game', 'sharp-eye', 'knight-fan', 'knowledge-seeker',
    'tactics-expert', 'endgame-expert',
    'pathfinder', 'chess-lover', 'early-access', 'beta-tester', 'collector']) {
    expect(out.got, `badge ${id} should be earned`).toContain(id);
  }
  expect(out.freshIds).toContain('first-win'); // fresh list is real
  // Rush mode and Daily challenges do not exist in the product: even with
  // seeded rushBest/daily flags the badges stay honestly locked (community).
  for (const id of ['speed-runner', 'daily-puzzle', 'tournament-winner']) {
    expect(out.got, `badge ${id} must stay locked`).not.toContain(id);
  }
});

test('puzzle-master tracks the real curriculum, not a frozen count', async ({ page }) => {
  const out = await page.evaluate(() => {
    const ids = window.DoChessLearn.curriculum.levels.filter(l => !l.planned).map(l => l.id);
    const seed = (uid, n) => {
      const stars = {};
      ids.slice(0, n).forEach(id => { stars[id] = 3; });
      localStorage.setItem('dochess:v1', JSON.stringify({ stars }));
      const res = DoChessAchievements.evaluate(uid);
      const d = JSON.parse(localStorage.getItem('cca_v1_' + uid));
      return { earned: Object.keys(d.earned), total: ids.length };
    };
    const almost = seed('u_pm1', ids.length - 1);
    localStorage.clear();
    const all = seed('u_pm2', ids.length);
    return { almost, all };
  });
  expect(out.almost.total).toBeGreaterThan(36); // curriculum outgrew the old frozen 36
  expect(out.almost.earned).not.toContain('puzzle-master'); // one short: locked
  expect(out.all.earned).toContain('puzzle-master');        // every playable level: earned
});

test('profile renders rank card + full badge gallery, honest states', async ({ page }) => {
  await page.evaluate(() => {
    const uid = 'u_prof';
    localStorage.setItem('ccr_' + uid, JSON.stringify({
      cats: { blitz: { games: 2, w: 1, l: 1, d: 0, best: 1180, rating: 1160 } },
      processed: []
    }));
    window.app._clerk = { user: { id: uid, fullName: 'Tester' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
    window.app._setUser(uid);
    window.app.showProfile();
  });
  await expect(page.locator('#profile-screen .dc-ach')).toBeVisible();
  await expect(page.locator('#profile-screen .dc-rank-main h4')).toHaveText('Silver'); // 1180 → silver
  await expect(page.locator('#profile-screen .dc-rank-crest')).toHaveAttribute('src', /rank-silver\.svg/);
  await expect(page.locator('#profile-screen .dc-rank-bar')).toBeVisible();
  // Full gallery: one item per catalog badge, earned vs locked states.
  const badgeCount = await page.evaluate(() => DoChessAchievements.BADGES.length);
  await expect(page.locator('#profile-screen .dc-ach-item')).toHaveCount(badgeCount);
  await expect(page.locator('#profile-screen .dc-ach-item.on').first()).toBeVisible(); // first-win at least
  const locked = await page.locator('#profile-screen .dc-ach-item.locked').count();
  expect(locked).toBeGreaterThan(0);
  // Every badge img points at the real asset folder.
  const badSrcs = await page.evaluate(() =>
    [...document.querySelectorAll('#profile-screen .dc-ach-item img')]
      .map(i => i.getAttribute('src'))
      .filter(s => !s || !s.startsWith('assets/DoChess_SVGs/badges/badge-')));
  expect(badSrcs).toEqual([]);
  // No console errors introduced by the new section.
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.reload();
  await page.waitForFunction(() => !!window.app && !!window.DoChessAchievements, null, { timeout: 15000 });
  expect(errs).toEqual([]);
});

test('game-end hook: onGame updates flags, grants badges, detects promotion', async ({ page }) => {
  const out = await page.evaluate(() => {
    const uid = 'u_game';
    const first = DoChessAchievements.onGame({ uid, result: 'win', cat: 'bullet', oppRating: 900, myBefore: 800, peakBefore: 800 });
    // Seed a big peak so the NEXT game promotes Bronze → Gold. peakBefore is
    // captured by the app BEFORE applyGame writes the new rating.
    localStorage.setItem('ccr_' + uid, JSON.stringify({
      cats: { blitz: { games: 6, w: 5, l: 1, d: 0, best: 1280, rating: 1280 } },
      processed: []
    }));
    const second = DoChessAchievements.onGame({ uid, result: 'win', cat: 'blitz', oppRating: 1300, myBefore: 1000, peakBefore: 800 });
    const d = JSON.parse(localStorage.getItem('cca_v1_' + uid));
    return {
      firstFresh: first.fresh.map(b => b.id),
      secondFresh: second.fresh.map(b => b.id),
      promoted: second.promoted && second.promoted.id,
      demoted: second.demoted && second.demoted.id,
      streak: d.counters.streak,
      bulletWin: !!d.flags.bulletWin,
      comeback: !!d.flags.comeback,
      daysLen: d.days.length
    };
  });
  expect(out.firstFresh).toContain('coffee-break');   // finished a bullet game
  expect(out.firstFresh).toContain('speed-demon');    // won it
  expect(out.firstFresh).toContain('comeback');       // opp 900 vs my 800 — no: diff 100 ≥ 50
  expect(out.bulletWin).toBe(true);
  expect(out.comeback).toBe(true);
  expect(out.streak).toBe(2);                          // two wins in a row
  expect(out.daysLen).toBe(1);                         // same day, no duplicates
  expect(out.secondFresh).toContain('first-win');
  expect(out.promoted).toBe('gold');                   // peak 1280 crosses 1200
  expect(out.demoted).toBe(null);
});

test('explorer via screen touches; study sessions counted', async ({ page }) => {
  const out = await page.evaluate(() => {
    const uid = 'u_nav';
    const screens = ['home-screen', 'lessons-screen', 'learn-screen', 'progress-screen', 'profile-screen', 'online-screen', 'study-screen'];
    const results = [];
    screens.forEach(s => results.push(DoChessAchievements.touch(uid, s)));
    const d = JSON.parse(localStorage.getItem('cca_v1_' + uid));
    return {
      freshAny: results.some(r => Array.isArray(r) && r.some(b => b.id === 'explorer')),
      explorer: !!d.earned.explorer,
      screensSeen: Object.keys(d.screens).length,
      studyOpens: d.counters.studyOpens
    };
  });
  expect(out.freshAny).toBe(true);
  expect(out.explorer).toBe(true);
  expect(out.screensSeen).toBe(7);
  expect(out.studyOpens).toBe(1);
});

test('game-end toast surface: role=status, badge + rank content', async ({ page }) => {
  await page.evaluate(() => {
    const uid = 'u_toast';
    localStorage.setItem('ccr_' + uid, JSON.stringify({
      cats: { blitz: { games: 1, w: 1, l: 0, d: 0, best: 1050, rating: 1050 } },
      processed: []
    }));
    // peakBefore is what the app captures BEFORE applyGame: 800 → 1050 is a
    // Bronze→Silver promotion, which must surface as a rank toast.
    const ach = DoChessAchievements.onGame({ uid, result: 'win', cat: 'blitz', oppRating: 900, myBefore: 800, peakBefore: 800 });
    DoChessAchievements.announceFresh(ach.fresh, ach.promoted);
  });
  const box = page.locator('.dc-ach-toasts');
  await expect(box).toHaveAttribute('role', 'status');
  await expect(box).toHaveAttribute('aria-live', 'polite');
  await expect(box).toContainText('First Win', { timeout: 5000 });
  await expect(box).toContainText('Badge unlocked');
  // A badge toast carries its own artwork (badge-*).svg.
  await expect(box.locator('img[src*="badge-"]').first()).toBeVisible();
  await expect(box).toContainText('Silver rank', { timeout: 8000 }); // 1050 → silver promotion toast
});

test('lobby chip + leaderboard crests render from real ratings', async ({ page }) => {
  await page.evaluate(() => {
    const uid = 'u_lobby';
    localStorage.setItem('ccr_' + uid, JSON.stringify({
      cats: { blitz: { games: 3, w: 1, l: 2, d: 0, best: 1430, rating: 1400 } },
      processed: []
    }));
    localStorage.setItem('ccr_board', JSON.stringify({
      u_lobby: { name: 'Tester', cats: { blitz: 1430 } },
      u_rival: { name: 'Rival', cats: { blitz: 980 } }
    }));
    window.app._clerk = { user: { id: uid, fullName: 'Tester' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
    window.app._setUser(uid);
    window.app.showOnline();
  });
  await expect(page.locator('#wheel-summary .dc-rank-chip')).toBeVisible();
  await expect(page.locator('#wheel-summary .dc-rank-chip')).toContainText('Platinum'); // 1430
  await expect(page.locator('#wheel-summary .dc-rank-chip img')).toHaveAttribute('src', /rank-platinum\.svg/);
  await expect(page.locator('.board-row .dc-rank-mini').first()).toBeVisible();
  const minis = await page.evaluate(() =>
    [...document.querySelectorAll('.board-row .dc-rank-mini')].map(i => i.getAttribute('src')));
  expect(minis.some(s => s && s.includes('rank-platinum.svg'))).toBe(true);
  expect(minis.some(s => s && s.includes('rank-bronze.svg'))).toBe(true);
});

test('every rank and badge SVG asset exists', async ({ page }) => {
  const missing = await page.evaluate(async () => {
    const ids = [
      ...DoChessAchievements.RANKS.map(r => `assets/DoChess_SVGs/ranks/rank-${r.id}.svg`),
      ...DoChessAchievements.BADGES.map(b => `assets/DoChess_SVGs/badges/badge-${b.id}.svg`)
    ];
    const out = [];
    for (const src of ids) {
      const ok = await new Promise(res => {
        const img = new Image();
        img.onload = () => res(img.naturalWidth > 0);
        img.onerror = () => res(false);
        img.src = src;
      });
      if (!ok) out.push(src);
    }
    return { total: ids.length, missing: out };
  });
  expect(missing.total).toBe(58); // 8 ranks + 50 badges
  expect(missing.missing).toEqual([]);
});

test('game-end path through app wiring: _onlineFinish announces achievements', async ({ page }) => {
  // Drive the REAL _onlineFinish (the production game-over entry point) with
  // a minimal-but-real online state: real ChessGame engine, two plies so the
  // game is ratable, host role with a stub net so no peer is needed.
  const out = await page.evaluate(() => {
    const uid = 'u_finish';
    window.app._clerk = { user: { id: uid, fullName: 'Finisher' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
    window.app._setUser(uid);
    const eng = new ChessGame();
    eng.movePiece(eng.algebraicToCoords('e2'), eng.algebraicToCoords('e4'), null);
    eng.movePiece(eng.algebraicToCoords('e7'), eng.algebraicToCoords('e5'), null);
    window.app.online = {
      gameId: 'test-game-ach-1',
      control: { id: 'blitz', base: 300, inc: 0, name: 'Blitz', label: '5+0' },
      opp: { name: 'Bot', rating: 850 },
      engine: eng, myColor: 'white', oppColor: 'black', phase: 'play',
      role: 'host', conn: null, epoch: 1,
      net: { send() {} },
      clock: { w: 300000, b: 300000, side: 'white', turnStarted: performance.now() },
      unrated: false, result: null, reason: null,
      sel: null, legal: [], captured: { w: [], b: [] }
    };
    window.app._onlineFinish('win', 'checkmate', false);
    const s = window.app.online;
    const store = JSON.parse(localStorage.getItem('cca_v1_' + uid) || '{}');
    return {
      result: s.result, reason: s.reason, phase: s.phase,
      delta: s.ratingDelta, ratingAfter: s.ratingAfter,
      earned: Object.keys(store.earned || {}),
      streak: (store.counters || {}).streak
    };
  });
  expect(out.result).toBe('win');
  expect(out.phase).toBe('over');
  expect(out.ratingAfter).toBeGreaterThan(800);   // real Elo write happened
  expect(out.earned).toContain('first-win');      // badge from the same event
  expect(out.streak).toBe(1);
  // The toast surface fired through the real announce path.
  await expect(page.locator('.dc-ach-toasts')).toContainText('First Win', { timeout: 5000 });
  await expect(page.locator('#online-result')).toContainText('You win!', { timeout: 5000 });
});
