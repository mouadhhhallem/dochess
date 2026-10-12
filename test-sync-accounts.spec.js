import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { MongoClient } from 'mongodb';

// Account isolation for cloud sync: per-account device state, first-sign-in
// adoption, cross-device conflict honesty, failed-game retry, and the
// concurrency proofs for per-section atomicity.
//
// Hermetic tests (H*) run on file:// with no server: identity swaps,
// stash/restore and guest continuity are pure localStorage mechanics.
// Server tests (S*) spawn their own API on 127.0.0.1:8800 with an isolated
// `dochess_e2e_sync` database and real Clerk users (created + deleted).
// Without .env secrets the server tests skip instead of faking results.

const API_PORT = 8800;
const API = `http://127.0.0.1:${API_PORT}`;
const E2E_DB = 'dochess_e2e_sync';

const config = (() => {
  const out = { mongoUri: '', clerkSecretKey: '' };
  try {
    const f = process.cwd() + '/.env';
    if (!existsSync(f)) return out;
    for (const raw of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k === 'MONGODB_URI') out.mongoUri = v;
      if (k === 'CLERK_SECRET_KEY') out.clerkSecretKey = v;
    }
  } catch (_) {}
  return out;
})();

let apiProc = null;
const testUsers = [];

function pw() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
  let s = 'T3st!';
  for (let i = 0; i < 20; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function clerk(method, path, body) {
  const r = await fetch('https://api.clerk.com/v1' + path, {
    method,
    headers: { Authorization: `Bearer ${config.clerkSecretKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let doc = null;
  try { doc = await r.json(); } catch (_) {}
  return { status: r.status, doc };
}

async function makeUser(tag) {
  const email = `dochess-sync-${tag}-${Date.now().toString(36)}@example.com`;
  const { status, doc } = await clerk('POST', '/users', { email_address: [email], password: pw(), skip_password_checks: true });
  if (status !== 200 || !doc || !doc.id) throw new Error('clerk create user failed: ' + status);
  testUsers.push(doc.id);
  return doc.id;
}

async function signInAs(page, userId) {
  const { status, doc } = await clerk('POST', '/sign_in_tokens', { user_id: userId, expires_in_seconds: 600 });
  if (status !== 200 || !doc || !doc.token) throw new Error('sign-in token failed: ' + status);
  const out = await page.evaluate(async (t) => {
    const c = await window.app._ensureClerk();
    if (!c) return 'no-clerk';
    const si = await c.client.signIn.create({ strategy: 'ticket', ticket: t });
    if (!si.createdSessionId) return 'no-session:' + si.status;
    await c.setActive({ session: si.createdSessionId });
    return 'ok';
  }, doc.token);
  if (out !== 'ok') throw new Error('ticket redeem failed: ' + out);
  await expect.poll(async () => page.evaluate(() => window.app && window.app.userId), { timeout: 15000 }).toBe(userId);
}

function serverTestsEnabled() {
  return !!(config.mongoUri && config.clerkSecretKey);
}

test.beforeAll(async () => {
  if (!serverTestsEnabled()) return;
  let clerkOk = false;
  try { clerkOk = (await clerk('GET', '/users?limit=1')).status === 200; } catch (_) {}
  if (!clerkOk) return;
  apiProc = spawn('node', ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(API_PORT), MONGODB_DB: E2E_DB },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 45000;
  for (;;) {
    try {
      const h = await (await fetch(API + '/api/health')).json();
      if (h && h.productionReady && h.auth && h.auth.mode === 'clerk' && h.db && h.db.kind === 'mongo') break;
    } catch (_) {}
    if (Date.now() > deadline) throw new Error('sync e2e api did not start on ' + API_PORT);
    await new Promise(r => setTimeout(r, 500));
  }
});

test.afterAll(async () => {
  for (const id of testUsers.splice(0)) {
    try { await clerk('DELETE', '/users/' + id); } catch (_) {}
  }
  if (apiProc) { try { apiProc.kill(); } catch (_) {} apiProc = null; }
  if (config.mongoUri) {
    try {
      const c = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
      await c.connect();
      await c.db(E2E_DB).dropDatabase();
      await c.close();
    } catch (e) { console.log('sync e2e db drop skipped:', String((e && e.message) || e).slice(0, 120)); }
  }
});

async function apiFetch(page, method, path, token, body) {
  return page.evaluate(async ({ method, path, token, body, base }) => {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let doc = null;
    try { doc = await r.json(); } catch (_) {}
    return { status: r.status, doc };
  }, { method, path, token, body, base: API });
}

// Settle sync: wait until a GET round-trip shows the expected predicate.
async function awaitSynced(page, token, pred, timeoutMs) {
  await expect.poll(async () => {
    const g = await apiFetch(page, 'GET', '/api/state', token);
    if (g.status !== 200) return 'http' + g.status;
    try { return pred(g.doc) ? 'YES' : 'no'; } catch (_) { return 'err'; }
  }, { timeout: timeoutMs || 20000 }).toBe('YES');
}

/* ── H1: account switch swaps shared keys, restores byte-identical ── */
test('H1: switching accounts swaps learner state, keeps device state', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessSync, null, { timeout: 15000 });
  await page.evaluate(() => {
    localStorage.clear();
    window.DoChessSync.start({ userId: 'u_A' });
    // Per-learner globals (swapped): learn progress + puzzle stats.
    localStorage.setItem('dochess:v1', JSON.stringify({ xp: 222, stars: { s1r1: 3 } }));
    localStorage.setItem('dochess:puzzles:v1', JSON.stringify({ solved: 4 }));
    // Device-scoped globals (NOT swapped): met-players board + preferences.
    localStorage.setItem('ccr_board', JSON.stringify({ u_X: { name: 'X' } }));
    localStorage.setItem('cc_mute', '1');
    localStorage.setItem('cca_v1_u_A', JSON.stringify({ v: 1, earned: { x: 1 }, days: [], screens: {}, counters: {}, flags: {} }));
    window.DoChessSync.start({ userId: 'u_B' });
  });
  const s = await page.evaluate(() => ({
    learnLive: localStorage.getItem('dochess:v1'),
    learnStashA: localStorage.getItem('dochess:stash:u_A:dochess:v1'),
    puzzLive: localStorage.getItem('dochess:puzzles:v1'),
    puzzStashA: localStorage.getItem('dochess:stash:u_A:dochess:puzzles:v1'),
    boardLive: localStorage.getItem('ccr_board'),
    boardStashA: localStorage.getItem('dochess:stash:u_A:ccr_board'),
    muteLive: localStorage.getItem('cc_mute'),
    muteStashA: localStorage.getItem('dochess:stash:u_A:cc_mute'),
    ccaA: localStorage.getItem('cca_v1_u_A'),
    ccaB: localStorage.getItem('cca_v1_u_B'),
  }));
  expect(s.learnLive).toBeNull();                  // B is fresh: A's progress hidden
  expect(JSON.parse(s.learnStashA).xp).toBe(222);  // …but stashed, not lost
  expect(s.puzzLive).toBeNull();
  expect(JSON.parse(s.puzzStashA).solved).toBe(4);
  expect(JSON.parse(s.boardLive).u_X.name).toBe('X'); // device board survives (regression: was wiped)
  expect(s.boardStashA).toBeNull();                // …and never stashed
  expect(s.muteLive).toBe('1');                    // device preference survives
  expect(s.muteStashA).toBeNull();
  expect(s.ccaA).toContain('"x":1');               // per-uid keys untouched
  expect(s.ccaB).toBeNull();
  await page.evaluate(() => window.DoChessSync.start({ userId: 'u_A' }));
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('dochess:v1'))).xp).toBe(222);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('dochess:puzzles:v1'))).solved).toBe(4);
});

/* ── H2: sign-out restores the guest's pre-sign-in state ── */
test('H2: logout restores guest continuity instead of stranding state', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessSync, null, { timeout: 15000 });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('dochess:v1', JSON.stringify({ xp: 50, stars: {} }));
    window.DoChessSync.start({ userId: 'u_X' });   // sign-in: guest stashed, live cleared
  });
  expect(await page.evaluate(() => localStorage.getItem('dochess:v1'))).toBeNull();
  await page.evaluate(() => {
    localStorage.setItem('dochess:v1', JSON.stringify({ xp: 9000, stars: {} })); // account X state
    window.DoChessSync.stop();                     // logout: stash X, restore guest
  });
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('dochess:v1'))).xp).toBe(50);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('dochess:stash:u_X:dochess:v1'))).xp).toBe(9000);
});

/* ── S1: an offline edit converges on push (detection-time stamps) ── */
test('S1: local edits made between syncs land on the server', async ({ page }) => {
  if (!serverTestsEnabled() || !apiProc) test.skip(true, 'needs .env + spawned api');
  const uid = await makeUser('dirty');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = () => page.evaluate(() => window.Clerk.session.getToken());
  // Let the initial flush settle so the server holds a timestamp for learn.
  await awaitSynced(page, await tok(), () => true);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('dochess:v1') || '{}');
    d.xp = 4242;
    localStorage.setItem('dochess:v1', JSON.stringify(d));
  });
  await page.evaluate(() => window.DoChessSync.flush('s1'));
  await awaitSynced(page, await tok(), doc => doc.sections.learn && doc.sections.learn.data && doc.sections.learn.data.xp === 4242);
});

/* ── S2: first sign-in adopts anonymous device work (vacuum only) ── */
test('S2: a brand-new account inherits guest progress; existing accounts never do', async ({ browser }) => {
  if (!serverTestsEnabled() || !apiProc) test.skip(true, 'needs .env + spawned api');
  const uidNew = await makeUser('vacuum');
  const uidOld = await makeUser('established');
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await p.goto(API + '/index.html');
    await p.waitForFunction(() => !!window.app, null, { timeout: 20000 });
    // Guest work first (per-uid anon keys + shared learn key).
    await p.evaluate(() => {
      localStorage.setItem('ccp_v4', JSON.stringify({ done: [1, 2] }));
      localStorage.setItem('dochess:v1', JSON.stringify({ xp: 777, stars: {} }));
    });
    // Existing account: seed the server directly, then sign in.
    await signInAs(p, uidOld);
    const tokOld = await p.evaluate(() => window.Clerk.session.getToken());
    await apiFetch(p, 'PUT', '/api/state', tokOld, {
      sections: {
        learn: { updatedAt: Date.now(), data: { xp: 5 } },
        lessons: { updatedAt: Date.now(), data: { done: [9] } },
      },
    });
    await p.evaluate(() => window.Clerk.session.end());
    await expect.poll(async () => p.evaluate(() => window.app && window.app.userId), { timeout: 15000 }).toBe(null);
    // New account on the same device state: guest work must be adopted.
    await signInAs(p, uidNew);
    const tokNew = await p.evaluate(() => window.Clerk.session.getToken());
    await awaitSynced(p, tokNew, doc => doc.sections.lessons && JSON.stringify(doc.sections.lessons.data).includes('1'));
    const got = await apiFetch(p, 'GET', '/api/state', tokNew);
    expect(JSON.stringify(got.doc.sections.lessons.data)).toContain('1');
    expect(got.doc.sections.learn.data.xp).toBe(777);
  } finally {
    await ctx.close();
  }
});

/* ── S3: when the server is newer, it wins and the client says so ── */
test('S3: newer cloud data wins a push race and raises a conflict notice', async ({ page }) => {
  if (!serverTestsEnabled() || !apiProc) test.skip(true, 'needs .env + spawned api');
  const uid = await makeUser('conflict');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = () => page.evaluate(() => window.Clerk.session.getToken());
  await awaitSynced(page, await tok(), () => true);
  await page.evaluate(() => {
    window.__conflicts = [];
    window.addEventListener('dochess:conflict', e => window.__conflicts.push(e.detail.sections));
    const d = JSON.parse(localStorage.getItem('dochess:v1') || '{}');
    d.xp = 111;
    localStorage.setItem('dochess:v1', JSON.stringify(d));
  });
  // Pull first (nothing newer yet), then the other device lands newer data,
  // then push: our edit deterministically loses the race it would otherwise
  // only rarely hit inside a full flush.
  await page.evaluate(() => window.DoChessSync.pull());
  await apiFetch(page, 'PUT', '/api/state', await tok(), {
    sections: { learn: { updatedAt: Date.now() + 3600000, data: { xp: 555 } } },
  });
  await page.evaluate(() => window.DoChessSync.push());
  await expect.poll(async () => page.evaluate(() => window.__conflicts), { timeout: 20000 }).toEqual([['learn']]);
  // Local adopted the winner; the server still holds it.
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('dochess:v1'))).xp).toBe(555);
  const g = await apiFetch(page, 'GET', '/api/state', await tok());
  expect(g.doc.sections.learn.data.xp).toBe(555);
  const chip = await page.evaluate(() => {
    window.app.showProfile();
    const el = document.querySelector('#profile-screen [data-sync-chip]');
    return el ? { text: el.textContent, title: el.getAttribute('title') } : null;
  });
  expect(chip.text).toMatch(/newer progress kept/i);
  expect(chip.title).toMatch(/learn/);
});

/* ── S4: failed game posts queue and retry after a server restart ── */
test('S4: match records survive a server outage and land on retry', async ({ page }) => {
  if (!serverTestsEnabled() || !apiProc) test.skip(true, 'needs .env + spawned api');
  const uid = await makeUser('outage');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = () => page.evaluate(() => window.Clerk.session.getToken());
  await awaitSynced(page, await tok(), () => true);
  // Baseline state proof (restart durability): this must survive below.
  await apiFetch(page, 'PUT', '/api/state', await tok(), { sections: { playtime: { updatedAt: Date.now(), data: { sec: 7 } } } });

  // Kill the API, then finish a game: the POST fails and must queue.
  apiProc.kill();
  await new Promise(r => setTimeout(r, 1200));
  const rec = { gameId: 'g_outage_1', result: 'win', termination: 'checkmate', plies: 4, moves: ['e2e4', 'e7e5'], control: { id: 'blitz' }, opp: 'Outage', delta: 10, ratingBefore: 800, ratingAfter: 810, endedAt: Date.now() };
  await page.evaluate((r) => window.DoChessSync.recordGame(r), rec);
  await expect.poll(async () => page.evaluate(() => window.DoChessSync.status().pendingGames), { timeout: 15000 }).toBe(1);

  // Respawn on the same port/db and flush: the queued game must land, and
  // the earlier state must still be in Mongo (restart durability).
  apiProc = spawn('node', ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(API_PORT), MONGODB_DB: E2E_DB },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 45000;
  for (;;) {
    try {
      const h = await (await fetch(API + '/api/health')).json();
      if (h && h.db && h.db.kind === 'mongo') break;
    } catch (_) {}
    if (Date.now() > deadline) throw new Error('respawn failed');
    await new Promise(r => setTimeout(r, 500));
  }
  await page.evaluate(() => window.DoChessSync.flush('s4-retry'));
  // The queued post backs off 30 s before its first retry; the heartbeat
  // flush plus the retry then land it. Poll long enough to ride that out —
  // the point is recovery without touching the game-over flow, not speed.
  await expect.poll(async () => {
    const g = await apiFetch(page, 'GET', '/api/games', await tok());
    return g.status === 200 && g.doc.games.some(x => x.gameId === 'g_outage_1') ? 'YES' : 'no';
  }, { timeout: 90000 }).toBe('YES');
  await expect.poll(async () => page.evaluate(() => window.DoChessSync.status().pendingGames), { timeout: 15000 }).toBe(0);
  const st = await apiFetch(page, 'GET', '/api/state', await tok());
  expect(st.doc.sections.playtime.data.sec).toBe(7);
});

/* ── S5: ten parallel PUTs keep all ten sections (atomicity proof) ── */
test('S5: concurrent writes to different sections all persist', async ({ page }) => {
  if (!serverTestsEnabled() || !apiProc) test.skip(true, 'needs .env + spawned api');
  const uid = await makeUser('par10');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = () => page.evaluate(() => window.Clerk.session.getToken());
  // Isolate from the app's background sync: these PUTs race the server
  // directly, and a heartbeat push of real device data would legitimately
  // win sections on timestamps (correct LWW, wrong for this assertion).
  await page.evaluate(() => window.DoChessSync.stop());
  const secs = ['learn', 'lessons', 'achievements', 'ratings', 'puzzles', 'settings', 'study', 'playtime', 'games', 'leaderboard'];
  const payload = (id, i) => {
    const data = id === 'games' ? [{ gameId: 'c' + i, date: Date.now() }]
      : id === 'leaderboard' ? { ['p' + i]: { name: 'P', cats: { blitz: 1000 + i }, seen: Date.now() } }
      : { marker: 's' + i };
    return { sections: { [id]: { updatedAt: Date.now() + i, data } } };
  };
  const rs = await Promise.all(secs.map(async (id, i) => {
    const t = await tok();
    return apiFetch(page, 'PUT', '/api/state', t, payload(id, i));
  }));
  expect(rs.map(r => r.status)).toEqual(Array(10).fill(200));
  const g = await apiFetch(page, 'GET', '/api/state', await tok());
  const missing = secs.filter((id, i) => {
    const d = g.doc.sections && g.doc.sections[id] && g.doc.sections[id].data;
    if (id === 'games') return !(Array.isArray(d) && d.some(x => x.gameId === 'c' + i));
    if (id === 'leaderboard') return !(d && d['p' + i]);
    return !(d && d.marker === 's' + i);
  });
  expect(missing).toEqual([]);
});

/* ── S6: same-section race keeps the newest timestamp ── */
test('S6: concurrent writes to one section resolve newest-wins', async ({ page }) => {
  if (!serverTestsEnabled() || !apiProc) test.skip(true, 'needs .env + spawned api');
  const uid = await makeUser('race');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = await page.evaluate(() => window.Clerk.session.getToken());
  await page.evaluate(() => window.DoChessSync.stop()); // isolate: app push must not join this race
  const base = Date.now() + 120000;
  const rs = await Promise.all([0, 1, 2, 3, 4].map(i =>
    apiFetch(page, 'PUT', '/api/state', tok, { sections: { playtime: { updatedAt: base + i * 1000, data: { round: i } } } })));
  expect(rs.map(r => r.status)).toEqual(Array(5).fill(200));
  const g = await apiFetch(page, 'GET', '/api/state', tok);
  expect(g.doc.sections.playtime.data).toEqual({ round: 4 });
});
