import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { MongoClient } from 'mongodb';

// Secrets come from the project's gitignored .env (the API server reads the
// same file itself). Parsed locally: importing server/lib/env.mjs is not
// possible here because Playwright loads specs without ESM auto-detect.
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

// End-to-end authentication + match persistence against a REAL backend:
// MongoDB Atlas (isolated `dochess_e2e` database — the dev `dochess` DB is
// never touched) and the REAL Clerk dev instance (test users are created via
// the Backend API and deleted afterwards). Browsers sign in with single-use
// sign-in tickets redeemed through clerk-js — the same session-token path
// the production app uses, so a valid token here is a genuinely verified
// Clerk JWT, not a stub.
//
// Needs .env with MONGODB_URI + CLERK_SECRET_KEY. Without them the whole
// file skips with a clear message instead of faking results.

const API_PORT = 8799;
const API = `http://127.0.0.1:${API_PORT}`;
const E2E_DB = 'dochess_e2e';

let apiProc = null;
let clerkOk = false;
const testUsers = [];

function pw() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#';
  let s = 'T3st!';
  const buf = new Uint32Array(20);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * chars.length);
  for (const b of buf) s += chars[b];
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
  const email = `dochess-e2e-${tag}-${Date.now().toString(36)}@example.com`;
  const { status, doc } = await clerk('POST', '/users', { email_address: [email], password: pw(), skip_password_checks: true });
  if (status !== 200 || !doc || !doc.id) throw new Error('clerk create user failed: ' + status);
  testUsers.push(doc.id);
  return doc.id;
}

async function mintTicket(userId) {
  const { status, doc } = await clerk('POST', '/sign_in_tokens', { user_id: userId, expires_in_seconds: 600 });
  if (status !== 200 || !doc || !doc.token) throw new Error('clerk sign-in token failed: ' + status);
  return doc.token;
}

// Redeem a ticket inside the page's own Clerk instance and wait until the
// app has adopted the user (mirrors what openSignIn would produce).
async function signInAs(page, userId) {
  const ticket = await mintTicket(userId);
  const out = await page.evaluate(async (t) => {
    const c = await window.app._ensureClerk();
    if (!c) return 'no-clerk';
    const si = await c.client.signIn.create({ strategy: 'ticket', ticket: t });
    if (!si.createdSessionId) return 'no-session:' + si.status;
    await c.setActive({ session: si.createdSessionId });
    return 'ok';
  }, ticket);
  if (out !== 'ok') throw new Error('ticket redeem failed: ' + out);
  await expect.poll(async () => page.evaluate(() => window.app && window.app.userId), { timeout: 15000 }).toBe(userId);
  return userId;
}

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

test.beforeAll(async () => {
  if (!config.mongoUri || !config.clerkSecretKey) {
    test.skip(true, 'e2e auth needs MONGODB_URI + CLERK_SECRET_KEY in .env');
    return;
  }
  try {
    const probe = await clerk('GET', '/users?limit=1');
    clerkOk = probe.status === 200;
  } catch (_) { clerkOk = false; }
  if (!clerkOk) {
    test.skip(true, 'e2e auth needs a reachable Clerk Backend API');
    return;
  }
  apiProc = spawn('node', ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(API_PORT), MONGODB_DB: E2E_DB, CORS_ORIGIN: 'https://e2e-allowed.example' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 45000;
  for (;;) {
    try {
      const h = await (await fetch(API + '/api/health')).json();
      if (h && h.productionReady && h.auth && h.auth.mode === 'clerk' && h.db && h.db.kind === 'mongo') break;
    } catch (_) {}
    if (Date.now() > deadline) throw new Error('e2e api did not become ready on ' + API_PORT);
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
    } catch (e) { console.log('e2e db drop skipped:', String((e && e.message) || e).slice(0, 120)); }
  }
});

test('1: signed-out requests cannot touch private data', async ({ page }) => {
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  for (const [method, path] of [['GET', '/api/state'], ['PUT', '/api/state'], ['GET', '/api/games'], ['POST', '/api/games'], ['GET', '/api/leaderboard?cat=blitz']]) {
    const r = await apiFetch(page, method, path, null, method === 'PUT' || method === 'POST' ? {} : undefined);
    expect(r.status, `${method} ${path} without auth`).toBe(401);
  }
});

test('2: invalid, malformed and legacy dev-header credentials are rejected', async ({ page }) => {
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  const bad = await apiFetch(page, 'GET', '/api/state', 'not-a-jwt');
  expect(bad.status).toBe(401);
  const bad2 = await apiFetch(page, 'GET', '/api/state', 'eyJhbGciOiJSUzI1NiJ9.e30.c2ln');
  expect(bad2.status).toBe(401);
  // Legacy dev header alone, and a forged user id with no token, buy nothing.
  const dev = await page.evaluate(async (base) => {
    const r = await fetch(base + '/api/state', { headers: { 'x-doChess-user': 'user_forged00000001' } });
    return r.status;
  }, API);
  expect(dev).toBe(401);
});

test('3: a valid user saves, reloads, and keeps their data', async ({ page }) => {
  const uid = await makeUser('a');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);

  const put = await apiFetch(page, 'PUT', '/api/state', await page.evaluate(() => window.Clerk.session.getToken()), {
    sections: { learn: { updatedAt: Date.now(), data: { xp: 4321 } } },
    profile: { name: 'E2E Alice' },
  });
  expect(put.status).toBe(200);
  expect(put.doc.userId).toBe(uid);

  const get = await apiFetch(page, 'GET', '/api/state', await page.evaluate(() => window.Clerk.session.getToken()));
  expect(get.status).toBe(200);
  expect(get.doc.sections.learn.data.xp).toBe(4321);
  expect(get.doc.profile.name).toBe('E2E Alice');

  // Reload: the Clerk session cookie survives, the app re-adopts the user,
  // and the saved data is still there (save-and-reload, no stubs).
  await page.reload();
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await expect.poll(async () => page.evaluate(() => window.app && window.app.userId), { timeout: 20000 }).toBe(uid);
  const get2 = await apiFetch(page, 'GET', '/api/state', await page.evaluate(() => window.Clerk.session.getToken()));
  expect(get2.status).toBe(200);
  expect(get2.doc.sections.learn.data.xp).toBe(4321);

  // The sync chip honestly reports the cloud state (profile dossier).
  await page.evaluate(() => window.DoChessSync && window.DoChessSync.flush('e2e'));
  await page.evaluate(() => window.app.showProfile());
  await expect(page.locator('#profile-screen [data-sync-chip]').first()).toContainText('Saved to your account', { timeout: 20000 });
});

test('4: a second account cannot see or change the first account\u2019s data', async ({ browser }) => {
  const uidA = await makeUser('iso-a');
  const uidB = await makeUser('iso-b');
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();
  try {
    for (const p of [pa, pb]) {
      await p.goto(API + '/index.html');
      await p.waitForFunction(() => !!window.app, null, { timeout: 20000 });
    }
    await signInAs(pa, uidA);
    await signInAs(pb, uidB);
    const tokA = () => pa.evaluate(() => window.Clerk.session.getToken());
    const tokB = () => pb.evaluate(() => window.Clerk.session.getToken());

    await apiFetch(pa, 'PUT', '/api/state', await tokA(), { sections: { learn: { updatedAt: Date.now(), data: { xp: 111 } } } });
    // B sees an empty account, never A's xp.
    const bGet = await apiFetch(pb, 'GET', '/api/state', await tokB());
    expect(bGet.status).toBe(200);
    expect(bGet.doc.userId).toBe(uidB);
    expect((bGet.doc.sections.learn || {}).data).toBeUndefined();
    // B writes; A re-reads and still has exactly their own data.
    await apiFetch(pb, 'PUT', '/api/state', await tokB(), { sections: { learn: { updatedAt: Date.now(), data: { xp: 222 } } } });
    const aGet = await apiFetch(pa, 'GET', '/api/state', await tokA());
    expect(aGet.doc.sections.learn.data.xp).toBe(111);
    // Game history is per-account too.
    await apiFetch(pa, 'POST', '/api/games', await tokA(), { gameId: 'g_iso1', result: 'win', plies: 12 });
    const bGames = await apiFetch(pb, 'GET', '/api/games', await tokB());
    expect(bGames.doc.games).toEqual([]);
    const aGames = await apiFetch(pa, 'GET', '/api/games', await tokA());
    expect(aGames.doc.games.map(g => g.gameId)).toContain('g_iso1');
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('5: logout clears account state and stops syncing', async ({ page }) => {
  const uid = await makeUser('logout');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  expect(await page.evaluate(() => window.app.userId)).toBe(uid);

  await page.evaluate(() => window.Clerk.session.end());
  // The app's Clerk listener flips the user to null, which stops sync and
  // reverts the chip — the same path the logout button drives, minus
  // Clerk's own post-sign-out navigation (covered separately by reload).
  await expect.poll(async () => page.evaluate(() => window.app && window.app.userId), { timeout: 15000 }).toBe(null);
  const st = await page.evaluate(() => window.DoChessSync.status());
  expect(st.enabled).toBe(false);
  // The guest dossier carries no cloud chip at all — in particular no stale
  // "Saved to your account" from the previous session.
  await page.evaluate(() => window.app.showProfile());
  expect(await page.locator('#profile-screen [data-sync-chip]').count()).toBe(0);
  // Reload: with the session truly dead there is nothing to restore.
  await page.reload();
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await expect.poll(async () => page.evaluate(() => window.app && window.app.userId), { timeout: 20000 }).toBe(null);
});

test('6: no client-supplied id or legacy header can impersonate', async ({ browser }) => {
  const uidA = await makeUser('imp-a');
  const uidB = await makeUser('imp-b');
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await p.goto(API + '/index.html');
    await p.waitForFunction(() => !!window.app, null, { timeout: 20000 });
    await signInAs(p, uidB);
    const tokB = await p.evaluate(() => window.Clerk.session.getToken());
    // A forged dev header next to B's real token still identifies as B.
    const forged = await p.evaluate(async ({ base, tok, victim }) => {
      const r = await fetch(base + '/api/state', {
        headers: { Authorization: 'Bearer ' + tok, 'x-doChess-user': victim },
      });
      return { status: r.status, doc: await r.json() };
    }, { base: API, tok: tokB, victim: uidA });
    expect(forged.status).toBe(200);
    expect(forged.doc.userId).toBe(uidB);
    // B's writes land on B's account even when the caller claims otherwise.
    await apiFetch(p, 'PUT', '/api/state', tokB, { sections: { learn: { updatedAt: Date.now(), data: { xp: 777 } } }, profile: { name: 'Evil Bob' } });
    const bGet = await apiFetch(p, 'GET', '/api/state', tokB);
    expect(bGet.doc.userId).toBe(uidB);
    expect(bGet.doc.profile.name).toBe('Evil Bob');
  } finally {
    await ctx.close();
  }
});

test('7: finished games persist with moves, termination and ratings; retries stay idempotent', async ({ browser }) => {
  const uidA = await makeUser('g-a');
  const uidB = await makeUser('g-b');
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pa = await ctxA.newPage();
  const pb = await ctxB.newPage();
  try {
    for (const p of [pa, pb]) {
      await p.goto(API + '/index.html');
      await p.waitForFunction(() => !!window.app, null, { timeout: 20000 });
    }
    await signInAs(pa, uidA);
    await signInAs(pb, uidB);
    const tokA = () => pa.evaluate(() => window.Clerk.session.getToken());
    const tokB = () => pb.evaluate(() => window.Clerk.session.getToken());

    const rec = {
      gameId: 'g_e2e_' + Date.now().toString(36),
      result: 'win', termination: 'checkmate', plies: 4,
      moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6'],
      control: { id: 'blitz', base: 300, inc: 0 },
      opp: 'E2E Bob', delta: 20, ratingBefore: 800, ratingAfter: 820, endedAt: Date.now(),
    };
    const post1 = await apiFetch(pa, 'POST', '/api/games', await tokA(), rec);
    expect(post1.status).toBe(200);
    expect(post1.doc.ok).toBe(true);
    // Retry of the same finalize is absorbed, not duplicated.
    const post2 = await apiFetch(pa, 'POST', '/api/games', await tokA(), rec);
    expect(post2.doc).toMatchObject({ ok: true, duplicate: true });

    const list = await apiFetch(pa, 'GET', '/api/games?limit=1', await tokA());
    expect(list.doc.total).toBe(1);
    expect(list.doc.games).toHaveLength(1);
    const g = list.doc.games[0];
    expect(g).toMatchObject({
      gameId: rec.gameId, userId: uidA, result: 'win', termination: 'checkmate',
      plies: 4, ratingBefore: 800, ratingAfter: 820, opp: 'E2E Bob',
    });
    expect(g.moves).toEqual(rec.moves);

    // The other player posts the SAME shared game id: both copies coexist,
    // each owned by its own account (per-user gameId uniqueness).
    const postB = await apiFetch(pb, 'POST', '/api/games', await tokB(), { ...rec, result: 'loss', ratingBefore: 800, ratingAfter: 780 });
    expect(postB.doc.ok).toBe(true);
    expect(postB.doc.duplicate).toBeFalsy();
    const bList = await apiFetch(pb, 'GET', '/api/games', await tokB());
    expect(bList.doc.games.map(x => x.gameId)).toContain(rec.gameId);
    expect(bList.doc.games.find(x => x.gameId === rec.gameId).userId).toBe(uidB);
    const aList = await apiFetch(pa, 'GET', '/api/games', await tokA());
    expect(aList.doc.games.find(x => x.gameId === rec.gameId).userId).toBe(uidA);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('8: leaderboard reads real rating objects, not just bare numbers', async ({ page }) => {
  const uid = await makeUser('lb');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = () => page.evaluate(() => window.Clerk.session.getToken());
  // The exact shape the client syncs from ccr_<uid> (object per category).
  await apiFetch(page, 'PUT', '/api/state', await tok(), {
    profile: { name: 'E2E Leader' },
    sections: {
      ratings: {
        updatedAt: Date.now(),
        data: { cats: { blitz: { games: 3, w: 1, l: 2, d: 0, best: 1430, rating: 1400 } } },
      },
    },
  });
  const lb = await apiFetch(page, 'GET', '/api/leaderboard?cat=blitz', await tok());
  expect(lb.status).toBe(200);
  const row = lb.doc.players.find(r => r.uid === uid);
  expect(row, 'leaderboard must include the player with the real ccr_ shape').toBeTruthy();
  expect(row.rating).toBe(1400);
});

test('9: _onlineFinish records UCI moves through recordGame (file:// wiring, no server)', async ({ page }) => {
  // Drives the REAL game-over entry point on file:// (sync disabled there),
  // spying on recordGame to prove the finalize call site is wired.
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessSync, null, { timeout: 15000 });
  const out = await page.evaluate(() => {
    const uid = 'u_e2e_finish';
    window.app._clerk = { user: { id: uid, fullName: 'Finisher' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
    window.app._setUser(uid);
    const calls = [];
    const orig = window.DoChessSync.recordGame;
    window.DoChessSync.recordGame = function (rec) { calls.push(rec); return orig.call(this, rec); };
    const eng = new ChessGame();
    eng.movePiece(eng.algebraicToCoords('e2'), eng.algebraicToCoords('e4'), null);
    eng.movePiece(eng.algebraicToCoords('e7'), eng.algebraicToCoords('e5'), null);
    window.app.online = {
      gameId: 'test-game-e2e-1',
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
    window.DoChessSync.recordGame = orig;
    return { calls };
  });
  expect(out.calls).toHaveLength(1);
  expect(out.calls[0]).toMatchObject({
    gameId: 'test-game-e2e-1',
    result: 'win',
    termination: 'checkmate',
    plies: 2,
    opp: 'Bot',
  });
  expect(out.calls[0].moves).toEqual(['e2e4', 'e7e5']);
  expect(out.calls[0].ratingBefore).toBe(800);
  expect(out.calls[0].ratingAfter).toBeGreaterThan(800);
});

test('10: production boot refuses development authentication', async () => {
  // Spawns the real server with NODE_ENV=production + DOCHESS_DEV_NO_AUTH=1:
  // it must exit non-zero with the refusal message, never serve.
  const { spawn } = await import('node:child_process');
  const proc = spawn('node', ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '8801', NODE_ENV: 'production', DOCHESS_DEV_NO_AUTH: '1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  proc.stderr.on('data', (d) => { err += String(d); });
  const code = await new Promise((res) => {
    const t = setTimeout(() => { try { proc.kill(); } catch (_) {} res('timeout'); }, 20000);
    proc.on('exit', (c) => { clearTimeout(t); res(c); });
  });
  expect(code).toBe(1);
  expect(err).toMatch(/refusing to boot/);
});

test('11: oversized sections are rejected, health discloses nothing sensitive', async ({ page }) => {
  const uid = await makeUser('limits');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = await page.evaluate(() => window.Clerk.session.getToken());
  const big = await apiFetch(page, 'PUT', '/api/state', tok, {
    sections: { learn: { updatedAt: Date.now(), data: { pad: 'x'.repeat(700000) } } },
  });
  expect(big.status).toBe(413);
  const h = await (await fetch(API + '/api/health')).json();
  const dump = JSON.stringify(h);
  // No secret VALUES or user-DATA fields may appear (the public section
  // catalog key `sections` itself is fine — it names section ids only).
  for (const needle of ['sk_test', 'mongodb+srv', 'gQAAA', 'Bearer ']) {
    expect(dump.includes(needle), `health must not contain ${needle}`).toBe(false);
  }
  expect(h.userId, 'no per-user id in health').toBeUndefined();
  expect(h.profile, 'no profile in health').toBeUndefined();
  expect(h.sections, 'public section catalog still listed').toEqual(
    expect.arrayContaining(['learn', 'ratings', 'games', 'leaderboard']));
  expect(h.productionReady).toBe(true);
  // CORS fails closed: the configured origin is echoed, anything else gets
  // no cross-origin headers at all (no wildcard, no reflection). Browsers
  // strip a manually-set Origin header (forbidden header name), so these
  // probes go through page.request, which transmits headers verbatim.
  const corsCheck = await (async () => {
    const probe = async (origin) => {
      const r = await page.request.get(API + '/api/health', { headers: origin ? { Origin: origin } : {} });
      const h = r.headers();
      return { status: r.status(), acao: h['access-control-allow-origin'] || null, cred: h['access-control-allow-credentials'] || null };
    };
    return {
      allowed: await probe('https://e2e-allowed.example'),
      evil: await probe('https://evil.example'),
      none: await probe(null),
    };
  })();
  expect(corsCheck.allowed).toMatchObject({ status: 200, acao: 'https://e2e-allowed.example', cred: 'true' });
  expect(corsCheck.evil.acao).toBeNull();
  expect(corsCheck.none.acao).toBeNull();
});

test('12: the per-user PUT rate limit engages under burst', async ({ page }) => {
  const uid = await makeUser('ratelimit');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  await page.evaluate(() => window.DoChessSync.stop()); // isolate: no background PUTs
  const tok = await page.evaluate(() => window.Clerk.session.getToken());
  // 65 sequential PUTs complete in well under one minute, so they touch at
  // most two fixed 60 s windows — one window necessarily holds 31+ and trips
  // the 30/min budget. The sign-in flush consumed 1 unit, so the first 29 of
  // ours (30 total) must still pass.
  const codes = [];
  for (let i = 0; i < 65; i++) {
    const r = await apiFetch(page, 'PUT', '/api/state', tok, {
      sections: { playtime: { updatedAt: Date.now() + i, data: { sec: i } } },
    });
    codes.push(r.status);
  }
  expect(codes.slice(0, 29)).toEqual(Array(29).fill(200));
  expect(codes.filter(c => c === 429).length, 'at least one request must be rate-limited').toBeGreaterThan(0);
  expect(codes.filter(c => c !== 200 && c !== 429), 'nothing else may fail').toEqual([]);
});

test('13: host and joiner finalizing one game yields a single idempotent record', async ({ page }) => {
  const uid = await makeUser('bothends');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const tok = () => page.evaluate(() => window.Clerk.session.getToken());
  const gid = 'g_bothends_' + Date.now().toString(36);
  const drive = (role, myColor, result, remote) => page.evaluate(({ role, myColor, result, remote, gid }) => {
    window.app._clerk = window.app._clerk || { user: { id: window.app.userId } };
    const eng = new ChessGame();
    eng.movePiece(eng.algebraicToCoords('e2'), eng.algebraicToCoords('e4'), null);
    eng.movePiece(eng.algebraicToCoords('e7'), eng.algebraicToCoords('e5'), null);
    window.app.online = {
      gameId: gid,
      control: { id: 'blitz', base: 300, inc: 0, name: 'Blitz', label: '5+0' },
      opp: { name: 'Peer', rating: 800 },
      engine: eng, myColor, oppColor: myColor === 'white' ? 'black' : 'white', phase: 'play',
      role, conn: null, epoch: 1,
      net: { send() {} },
      clock: { w: 300000, b: 300000, side: 'white', turnStarted: performance.now() },
      unrated: false, result: null, reason: null,
      sel: null, legal: [], captured: { w: [], b: [] }
    };
    window.app._onlineFinish(result, 'checkmate', remote);
  }, { role, myColor, result, remote, gid });
  // Host finishes first (win), then the joiner's view of the same game.
  await drive('host', 'white', 'win', false);
  await expect.poll(async () => {
    const g = await apiFetch(page, 'GET', '/api/games', await tok());
    return g.status === 200 && g.doc.games.some(x => x.gameId === gid) ? 'YES' : 'no';
  }, { timeout: 20000 }).toBe('YES');
  await drive('joiner', 'black', 'loss', true);
  await new Promise(r => setTimeout(r, 3000)); // let the second POST land (or dedupe)
  const list = await apiFetch(page, 'GET', '/api/games', await tok());
  const rows = list.doc.games.filter(x => x.gameId === gid);
  expect(rows).toHaveLength(1); // second finalize absorbed, not duplicated
  expect(rows[0]).toMatchObject({ userId: uid, result: 'win' });
  expect(rows[0].moves).toEqual(['e2e4', 'e7e5']);
});

test('14: session token lifetime is short (informational)', async ({ page }) => {
  const uid = await makeUser('lifetime');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  // Decode the live session JWT and report its validity window.
  const win = await page.evaluate(async () => {
    const t = await window.Clerk.session.getToken();
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { lifetimeSec: payload.exp - payload.iat };
  });
  console.log('clerk session token lifetime (s):', JSON.stringify(win));
  expect(win.lifetimeSec).toBeGreaterThan(0);
  expect(win.lifetimeSec).toBeLessThanOrEqual(3600);
});

test('15: an expired session token is rejected, a fresh one still works', async ({ page }) => {
  test.setTimeout(180000); // the 95 s expiry wait is the point of this test
  // Session tokens live ~60 s (see test 14). Holding one past expiry plus
  // clock tolerance must fail closed; the live session mints working ones.
  const uid = await makeUser('expiry');
  await page.goto(API + '/index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 20000 });
  await signInAs(page, uid);
  const stale = await page.evaluate(() => window.Clerk.session.getToken());
  await new Promise(r => setTimeout(r, 95000));
  const gone = await apiFetch(page, 'GET', '/api/state', stale);
  expect(gone.status).toBe(401);
  const fresh = await page.evaluate(() => window.Clerk.session.getToken());
  expect(fresh).not.toBe(stale);
  const ok = await apiFetch(page, 'GET', '/api/state', fresh);
  expect(ok.status).toBe(200);
  expect(ok.doc.userId).toBe(uid);
});

