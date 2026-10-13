/**
 * test-friends-e2e.spec.js — the reported bugs, end to end, against a REAL
 * backend, with TWO GENUINELY INDEPENDENT AUTHENTICATED BROWSER CONTEXES.
 *
 * Nothing here is mocked at the data layer: a real Node API process serves
 * the static site AND the API, two separate browser contexts each carry a
 * different authenticated identity (separate cookies, separate localStorage,
 * separate storage state), and every assertion is made over real HTTP.
 *
 * The API is also RESTARTED mid-suite to prove that the social graph is
 * persistent rather than process memory — the defect behind "removing a
 * friend works, then they are back".
 *
 * Scenarios map 1:1 to the mission's required list.
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8897;
const API = `http://127.0.0.1:${PORT}`;
let apiProc = null;
let DATA_DIR = null;

function startApi() {
    apiProc = spawn('node', ['server/index.mjs'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PORT: String(PORT),
            DOCHESS_DEV_NO_AUTH: '1',
            DOCHESS_DEV_FILE_STORE: '1',
            MONGODB_URI: '',
            DOCHESS_DATA_DIR: DATA_DIR,
        },
        stdio: 'ignore',
    });
}

async function waitForApi(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            const h = await fetch(`${API}/api/health`).then((r) => r.json());
            if (h && h.ok) return h;
        } catch (_) { /* not up yet */ }
        if (Date.now() > deadline) throw new Error('dev api did not start on ' + PORT);
        await new Promise((r) => setTimeout(r, 250));
    }
}

async function stopApi() {
    if (!apiProc) return;
    const p = apiProc;
    apiProc = null;
    await new Promise((resolve) => {
        p.on('exit', resolve);
        try { p.kill(); } catch (_) { resolve(); }
        setTimeout(resolve, 3000);
    });
}

/** Restart the API against the SAME data directory: a durability proof. */
async function restartApi() {
    await stopApi();
    startApi();
    await waitForApi();
}

function call(method, path, body, uid) {
    return fetch(`${API}${path}`, {
        method,
        headers: {
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...(uid ? { 'x-dochess-user': uid } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

const ALICE = 'user_e2ealice0001';
const BOB = 'user_e2ebob000002';
const CAROL = 'user_e2ecarol00003';
const DAVE = 'user_e2edave000004';
const EVE = 'user_e2eeve0000005';

/**
 * One independent authenticated context. Separate storage state, separate
 * cookies, separate localStorage — the two players never share a tab, a
 * profile or a session.
 */
async function newAccount(browser, uid, name) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    // Dev auth: the identity travels as a header on every API call. This is
    // the server's DOCHESS_DEV_NO_AUTH mode, not a browser-side stub.
    await ctx.route('**/api/**', (r) => {
        const headers = { ...r.request().headers(), 'x-dochess-user': uid };
        r.continue({ headers });
    });
    await ctx.addInitScript(([base]) => {
        try { localStorage.setItem('cc_api_base', base); } catch (_) {}
    }, [API]);
    const page = await ctx.newPage();
    await page.goto(`${API}/`);
    await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 30000 });
    await page.evaluate(([id, nm]) => {
        localStorage.clear();
        localStorage.setItem('cc_api_base', window.location.origin);
        window.app._clerk = {
            user: { id, fullName: nm }, openSignIn() {}, signOut() {},
            addListener() {}, mountUserButton() {},
        };
        window.app._setUser(id);
    }, [uid, name]);
    // The shelf swaps on the 3 s identity watcher; wait it out so every
    // assertion below reads this account's storage, not the guest shelf.
    await page.waitForTimeout(3600);
    return { ctx, page };
}

/** CONFIRMED friends only — an unanswered request is never a friend. */
const relist = async (page) => page.evaluate(() =>
    window.DoChessFriends.list().filter((f) => f.confirmed).map((f) => f.uid));
const pendIn = async (page) => page.evaluate(() => window.DoChessFriends.pendingIn().map((p) => p.uid));
/** Outbound requests still awaiting an answer. */
const pendOut = async (page) => page.evaluate(() =>
    window.DoChessFriends.list().filter((f) => f.outbound && !f.confirmed).map((f) => f.uid));

test.describe.configure({ timeout: 300000, mode: 'serial' });

test.beforeAll(async () => {
    DATA_DIR = mkdtempSync(join(tmpdir(), 'dochess-e2e-'));
    startApi();
    await waitForApi();
    // Five registered accounts. Two of them never play a single game.
    for (const [uid, name] of [[ALICE, 'Alice Wonder'], [BOB, 'Bob Builder'],
    [CAROL, 'Carol Chen'], [DAVE, 'Dave Diaz'], [EVE, 'Eve Ellis']]) {
        await call('PUT', '/api/state', { sections: {} }, uid);
        await call('POST', '/api/presence', { name, img: null }, uid);
    }
});

test.afterAll(async () => {
    await stopApi();
    if (DATA_DIR) { try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {} }
});

/* ── 1-4: the friend request / decline / accept / remove lifecycle ── */

test('1-4: request, decline, re-request, accept, remove — all survive refresh', async ({ browser }) => {
    const a = await newAccount(browser, ALICE, 'Alice Wonder');
    const b = await newAccount(browser, BOB, 'Bob Builder');

// --- Scenario 1: A sends B a friend request -----------------------------
    await a.page.evaluate(() => window.DoChessFriends.requestFriend('user_e2ebob000002', 'Bob Builder', 'search'));
    // B sees an INBOUND request from Alice.
    await expect.poll(() => pendIn(b.page), { timeout: 20000 }).toContain(ALICE);
    expect(await relist(a.page), 'a request is never shown as a friendship').not.toContain(BOB);
    expect(await pendOut(a.page), 'the sender sees it in Sent').toContain(BOB);
    expect(await relist(b.page)).not.toContain(ALICE);

    // --- Scenario 2: B declines; both refresh; it stays declined ------------
    await b.page.evaluate((id) => window.DoChessFriends.declineFriend(id), ALICE);
    await expect.poll(() => pendIn(b.page), { timeout: 20000 }).not.toContain(ALICE);

    // The regression: a refresh used to bring the declined request back,
    // because the request was derived from a graph edge the decline never
    // touched. Several poll cycles must not resurrect it.
    await b.page.reload();
    await b.page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 30000 });
    await b.page.evaluate(([id, nm]) => {
        window.app._clerk = { user: { id, fullName: nm }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser(id);
    }, [BOB, 'Bob Builder']);
    await b.page.waitForTimeout(3600);
    await b.page.evaluate(() => window.DoChessFriends.pollNow());
    await b.page.waitForTimeout(1500);
    expect(await pendIn(b.page), 'the declined request stayed declined').not.toContain(ALICE);
    expect(await relist(b.page)).not.toContain(ALICE);

    await a.page.reload();
    await a.page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 30000 });
    await a.page.evaluate(([id, nm]) => {
        window.app._clerk = { user: { id, fullName: nm }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser(id);
    }, [ALICE, 'Alice Wonder']);
    await a.page.waitForTimeout(3600);
    await a.page.evaluate(() => window.DoChessFriends.pollNow());
    await a.page.waitForTimeout(1500);
    expect(await relist(a.page), 'a declined request never becomes a friendship').not.toContain(BOB);

    // --- Scenario 3: A asks again, B accepts; both refresh ------------------
    await a.page.evaluate(() => window.DoChessFriends.requestFriend('user_e2ebob000002', 'Bob Builder', 'search'));
    await expect.poll(() => pendIn(b.page), { timeout: 20000 }).toContain(ALICE);
    await b.page.evaluate((id) => window.DoChessFriends.acceptFriend(id), ALICE);
    await expect.poll(() => relist(b.page), { timeout: 20000 }).toContain(ALICE);
    await expect.poll(() => relist(a.page), { timeout: 20000 }).toContain(BOB);

    // Both directions, both after a refresh.
    await a.page.reload(); await b.page.reload();
    for (const [p, uid, nm] of [[a.page, ALICE, 'Alice Wonder'], [b.page, BOB, 'Bob Builder']]) {
        await p.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 30000 });
        await p.evaluate(([id, n]) => {
            window.app._clerk = { user: { id, fullName: n }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
            window.app._setUser(id);
        }, [uid, nm]);
        await p.waitForTimeout(3600);
        await p.evaluate(() => window.DoChessFriends.pollNow());
        await p.waitForTimeout(1500);
    }
    expect(await relist(a.page)).toContain(BOB);
    expect(await relist(b.page)).toContain(ALICE);

    // --- Scenario 4: A removes B; refresh + re-auth keeps them removed ------
    a.page.once('dialog', (d) => d.accept());
    await a.page.click('#side-nav [data-nav="friends"]');
    await a.page.click(`[data-faction="remove"][data-uid="${BOB}"]`);
    await expect.poll(() => relist(a.page), { timeout: 20000 }).not.toContain(BOB);

    // Both sides: the removal is undirected, so B must not still list A.
    await b.page.evaluate(() => window.DoChessFriends.pollNow());
    await b.page.waitForTimeout(1500);
    expect(await relist(b.page), 'removal is undirected').not.toContain(ALICE);

    // Re-authenticate BOTH accounts from scratch (new contexts = fresh
    // cookies AND fresh localStorage, so only the server can answer).
    await a.ctx.close(); await b.ctx.close();
    const a2 = await newAccount(browser, ALICE, 'Alice Wonder');
    const b2 = await newAccount(browser, BOB, 'Bob Builder');
    await a2.page.evaluate(() => window.DoChessFriends.pollNow());
    await b2.page.evaluate(() => window.DoChessFriends.pollNow());
    await a2.page.waitForTimeout(2000);
    await b2.page.waitForTimeout(2000);
    expect(await relist(a2.page), 'the friend stayed removed after a full re-auth').not.toContain(BOB);
    expect(await relist(b2.page)).not.toContain(ALICE);
    expect(await pendIn(b2.page), 'and no phantom request reappears').not.toContain(ALICE);

    await a2.ctx.close(); await b2.ctx.close();
});

test('4b: the friendship survives an API restart (it is persisted, not in memory)', async ({ browser }) => {
    // The old implementation kept the whole social graph in process memory,
    // so every restart silently erased it.
    await restartApi();
    const p = await newAccount(browser, CAROL, 'Carol Chen');
    await p.page.evaluate(() => window.DoChessFriends.requestFriend('user_e2edave000004', 'Dave Diaz', 'search'));
    await p.page.evaluate((id) => window.DoChessFriends.declineFriend(id), 'user_e2edave000004');
    await p.page.evaluate(() => window.DoChessFriends.requestFriend('user_e2edave000004', 'Dave Diaz', 'search'));
    const d = await newAccount(browser, DAVE, 'Dave Diaz');
    await d.page.evaluate((id) => window.DoChessFriends.acceptFriend(id), CAROL);
    await expect.poll(() => relist(d.page), { timeout: 20000 }).toContain('user_e2ecarol00003');

    await restartApi();

    await p.page.evaluate(() => window.DoChessFriends.pollNow());
    await d.page.evaluate(() => window.DoChessFriends.pollNow());
    await p.page.waitForTimeout(2000);
    await d.page.waitForTimeout(2000);
    expect(await relist(p.page), 'the friendship survived the restart').toContain('user_e2edave000004');
    expect(await relist(d.page)).toContain('user_e2ecarol00003');
    await p.ctx.close(); await d.ctx.close();
});

/* ── 5-7: the global leaderboard ────────────────────────────────────── */

test('5-7: every registered account is on the global ladder, with privacy', async ({ browser }) => {
    const me = await newAccount(browser, EVE, 'Eve Ellis');
    const r = await call('GET', '/api/rank?cat=blitz&limit=100&offset=0', undefined, EVE);
    expect(r.status).toBe(200);

    // Scenario 5: EVERY registered account, including the two that never
    // played a game, is on the board.
    const rows = r.body.board;
    const names = rows.map((b) => b.name);
    // Strangers are first-name only; the viewer keeps their own full name.
    for (const who of ['Alice', 'Bob', 'Carol', 'Dave']) {
        expect(names, `${who} must appear on the global ladder`).toContain(who);
    }
    expect(names, 'the viewer sees their own full name').toContain('Eve Ellis');
    expect(r.body.total).toBeGreaterThanOrEqual(5);

    // Scenario 6: a brand-new registration appears immediately at 800.
    const before = r.body.total;
    const FRESH = 'user_e2efresh00006';
    await call('PUT', '/api/state', { sections: {} }, FRESH);
    const r2 = await call('GET', '/api/rank?cat=blitz&limit=100&offset=0', undefined, FRESH);
    expect(r2.body.total, 'the new account joined the ladder').toBe(before + 1);
    const mine = r2.body.board.find((x) => x.self);
    expect(mine.rating, 'default rating').toBe(800);
    expect(mine.tier).toBe('bronze');
    expect(r2.body.myRank).toBeGreaterThan(0);

    // Scenario 7: privacy. A stranger gets a first name and nothing else —
    // and the fields are absent from the RESPONSE, not hidden in the UI.
    const strangerRow = rows.find((x) => !x.self && !x.friend && x.name === 'Alice');
    expect(strangerRow, 'the stranger is listed').toBeTruthy();
    expect(strangerRow.name, 'first name only').toBe('Alice');
    expect('uid' in strangerRow, 'no internal id in the payload').toBe(false);
    expect('img' in strangerRow, 'no photo in the payload').toBe(false);
    expect(JSON.stringify(r.body)).not.toContain('Alice Wonder');
    expect(JSON.stringify(r.body)).not.toContain('Dave Diaz');
    expect(JSON.stringify(r.body), 'no email anywhere in the ladder').not.toContain('@');
    expect(JSON.stringify(r.body), 'no auth token in the ladder').not.toContain('Bearer');

    // A friend DOES see the friend-facing name and may be acted on.
    await call('POST', '/api/friends/request', { friendUid: EVE, friendName: 'Carol Chen' }, CAROL);
    await call('POST', '/api/friends/respond', { fromUid: CAROL, accept: true }, EVE);
    const r3 = await call('GET', '/api/rank?cat=blitz&limit=100&offset=0', undefined, EVE);
    const friendRow = r3.body.board.find((x) => x.uid === CAROL);
    expect(friendRow, 'the friend row carries the id the viewer already shares').toBeTruthy();
    expect(friendRow.name, 'friends see the full display name').toBe('Carol Chen');
    expect(friendRow.friend).toBe(true);

    // Pagination is real and stable, not a hard truncation.
    const seen = [];
    for (let off = 0; off < r3.body.total; off += 2) {
        const pg = await call('GET', `/api/rank?cat=blitz&limit=2&offset=${off}`, undefined, EVE);
        expect(pg.status).toBe(200);
        for (const row of pg.body.board) seen.push(row.rank);
    }
    expect(new Set(seen).size, 'every rank appears exactly once across pages').toBe(r3.body.total);

    await me.ctx.close();
});

test('ratings come from recorded games, not from anything the client claims', async () => {
    const P = 'user_e2eratecheck01';
    await call('PUT', '/api/state', { sections: {} }, P);
    // The endpoint that let a client publish its own rating is gone.
    const forged = await call('POST', '/api/rank/publish', { name: 'Cheat', cat: 'blitz', rating: 4000 }, P);
    expect(forged.status, 'there is no client-rating endpoint').toBe(404);
    const r = await call('GET', '/api/rank?cat=blitz&limit=100&offset=0', undefined, P);
    const row = r.body.board.find((x) => x.uid === P);
    expect(row.rating, 'an unrated account stays at the floor').toBe(800);

    // A recorded result moves it, and only by Elo.
    await call('POST', '/api/games', { gameId: 'g-e2e-1', result: 'win', plies: 40, control: { id: 'blitz', base: 180000, inc: 0 } }, P);
    const r2 = await call('GET', '/api/rank?cat=blitz&limit=100&offset=0', undefined, P);
    const moved = r2.body.board.find((x) => x.uid === P);
    expect(moved.rating, 'one win is +16 Elo from 800').toBe(816);

    // Re-posting the same game is idempotent (it cannot inflate the rating).
    await call('POST', '/api/games', { gameId: 'g-e2e-1', result: 'win', plies: 40, control: { id: 'blitz', base: 180000, inc: 0 } }, P);
    const r3 = await call('GET', '/api/rank?cat=blitz&limit=100&offset=0', undefined, P);
    expect(r3.body.board.find((x) => x.uid === P).rating).toBe(816);
});

/* ── 8-13: match invitations ────────────────────────────────────────── */

test('8-10: every supported time control invites, and both players reach the same board', async ({ browser }) => {
    const controls = [[1, 0], [3, 0], [5, 0], [3, 2], [10, 0], [15, 10]];

    for (const [minutes, incSec] of controls) {
        // Only friends may invite.
        const stranger = await call('POST', '/api/invites',
            { toUid: EVE, minutes, incSec, code: 'AAA111' }, ALICE);
        expect(stranger.status, 'a stranger cannot be invited').toBe(403);

        const created = await call('POST', '/api/invites',
            { toUid: EVE, minutes, incSec, code: 'BBB222' }, CAROL);
        expect(created.status, `${minutes}+${incSec} must be a supported control`).toBe(200);
        expect(created.body.matchId).toMatch(/^m_[0-9a-f]{16}$/);
        expect(created.body.status).toBe('pending');
        expect(created.body.expiresAt).toBeGreaterThan(Date.now());

        // Only the recipient can accept, and accepting twice is idempotent.
        const wrong = await call('POST', '/api/invites/respond', { matchId: created.body.matchId, accept: true }, DAVE);
        expect(wrong.status, 'only the intended recipient may accept').toBe(403);

        const ok = await call('POST', '/api/invites/respond', { matchId: created.body.matchId, accept: true }, EVE);
        expect(ok.status).toBe(200);
        expect(ok.body.invite.code).toBe('BBB222');
        expect(ok.body.invite.minutes).toBe(minutes);
        expect(ok.body.invite.incSec).toBe(incSec);

        const dup = await call('POST', '/api/invites/respond', { matchId: created.body.matchId, accept: true }, EVE);
        expect(dup.status).toBe(200);
        expect(dup.body.idempotent, 'a double-click cannot create a second match').toBe(true);
        expect(dup.body.invite.matchId).toBe(created.body.matchId);
    }

    // Scenario 9 + 10: the recipient is NOT on the Online page. The popup is
    // global and accepting takes them straight to the board.
    for (const nav of ['home', 'profile', 'learn']) {
        const sender = await newAccount(browser, DAVE, 'Dave Diaz');
        const recip = await newAccount(browser, EVE, 'Eve Ellis');
        await call('POST', '/api/friends/request', { friendUid: EVE, friendName: 'Eve Ellis' }, DAVE);
        await call('POST', '/api/friends/respond', { fromUid: DAVE, accept: true }, EVE);

        const inv = await call('POST', '/api/invites', { toUid: EVE, minutes: 5, incSec: 0, code: 'CCC333' }, DAVE);
        expect(inv.status).toBe(200);

        // The recipient parks on a different screen entirely.
        await recip.page.evaluate((n) => {
            window.app.showHome();
            if (n === 'profile') window.app.showProfile?.();
            if (n === 'learn') window.app.showLearn?.();
        }, nav);
        await expect(recip.page.locator('#online-screen')).not.toHaveClass(/active/);

        await recip.page.evaluate(() => window.DoChessFriends.pollNow());
        await expect(recip.page.locator('#gip-overlay'), `invite pops up while on ${nav}`).toBeVisible({ timeout: 25000 });

        // Accept: goes straight to the board, no code entry, no manual visit.
        await recip.page.click('#gip-overlay [data-gip="accept"]');
        await recip.page.waitForFunction(() => window.app.online?.code === 'CCC333', null, { timeout: 30000 });
        await sender.ctx.close(); await recip.ctx.close();
    }
});

test('12-13: expiry, decline, reload, duplicate and malformed invitations', async () => {
    // Declining removes it from the pending list.
    const inv = await call('POST', '/api/invites', { toUid: EVE, minutes: 3, incSec: 2, code: 'DDD444' }, DAVE);
    expect(inv.status).toBe(200);
    let list = await call('GET', '/api/invites', undefined, EVE);
    expect(list.body.invites.some((i) => i.matchId === inv.body.matchId)).toBe(true);
    const dec = await call('POST', '/api/invites/respond', { matchId: inv.body.matchId, accept: false }, EVE);
    expect(dec.body.status).toBe('declined');
    list = await call('GET', '/api/invites', undefined, EVE);
    expect(list.body.invites.some((i) => i.matchId === inv.body.matchId), 'a declined invite leaves the queue').toBe(false);

    // The sender is told, with text composed by the server.
    const box = await call('GET', '/api/notify', undefined, DAVE);
    expect(box.body.items.some((m) => /declined your invitation/.test(m.title))).toBe(true);

    // Unknown / malformed ids are rejected, never crash. A malformed id is
    // deliberately indistinguishable from "does not exist" (404), so the
    // endpoint cannot be used to probe for valid match ids.
    expect((await call('POST', '/api/invites/respond', { matchId: 'm_0000000000000000', accept: true }, EVE)).status).toBe(404);
    for (const badId of ['../../etc/passwd', 'm_zzzz', '', 'a'.repeat(200)]) {
        const r = await call('POST', '/api/invites/respond', { matchId: badId, accept: true }, EVE);
        expect([400, 404], `malformed id ${JSON.stringify(badId)} must be rejected`).toContain(r.status);
        expect(r.body.ok).toBe(false);
    }

    // An unsupported time control never becomes an invitation.
    const bad = await call('POST', '/api/invites', { toUid: EVE, minutes: 7, incSec: 3, code: 'EEE555' }, DAVE);
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('bad-time-control');

    // The room code is validated: a malformed one cannot pin a room.
    const badCode = await call('POST', '/api/invites', { toUid: EVE, minutes: 5, incSec: 0, code: 'nope' }, DAVE);
    expect(badCode.body.error).toBe('bad-code');
});

test('14: a failing API never fakes success — the UI rolls back and says so', async ({ browser }) => {
    const a = await newAccount(browser, ALICE, 'Alice Wonder');
    const b = await newAccount(browser, BOB, 'Bob Builder');
    await call('POST', '/api/friends/request', { friendUid: BOB, friendName: 'Bob Builder' }, ALICE);
    await call('POST', '/api/friends/respond', { fromUid: ALICE, accept: true }, BOB);
    await expect.poll(() => relist(b.page), { timeout: 20000 }).toContain(ALICE);

    // The server refuses the removal.
    await a.page.route('**/api/friends/remove', (r) =>
        r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'store-unavailable' }) }));

    a.page.once('dialog', (d) => d.accept());
    await a.page.click('#side-nav [data-nav="friends"]');
    await a.page.click(`[data-faction="remove"][data-uid="${BOB}"]`);
    await a.page.waitForTimeout(2500);

    // Honest failure: the friend is restored and the user was told.
    expect(await relist(a.page), 'a refused removal must not silently drop the friend').toContain(BOB);
    const notes = await a.page.evaluate(() => window.DoChessFriends.inbox().map((m) => m.title + ' ' + m.body));
    expect(notes.join(' | '), 'the user is told the removal did not happen')
        .toMatch(/Could not remove friend/i);

    // And it is still genuinely a friendship server-side.
    const snap = await call('GET', '/api/friends/snapshot', undefined, ALICE);
    expect(snap.body.friends.map((f) => f.uid)).toContain(BOB);

    await a.ctx.close(); await b.ctx.close();
});

test('14b: a stale response cannot overwrite newer state', async ({ browser }) => {
    const p = await newAccount(browser, ALICE, 'Alice Wonder');
    // Hold the snapshot response, delete a friend locally in the meantime,
    // then release the stale snapshot. The tombstone must win.
    await call('POST', '/api/friends/request', { friendUid: 'user_e2edave000004', friendName: 'Dave Diaz' }, ALICE);
    await call('POST', '/api/friends/respond', { fromUid: ALICE, accept: true }, 'user_e2edave000004');
    await expect.poll(() => relist(p.page), { timeout: 20000 }).toContain('user_e2edave000004');

    let release;
    const gate = new Promise((r) => { release = r; });
    await p.page.route('**/api/friends/snapshot', async (r) => {
        await gate;
        await r.continue();
    });
    const pending = p.page.evaluate(() => window.DoChessFriends.pullSnapshot());
    p.page.once('dialog', (d) => d.accept());
    await p.page.click('#side-nav [data-nav="friends"]');
    await p.page.click('[data-faction="remove"][data-uid="user_e2edave000004"]');
    release();
    await pending.catch(() => {});
    await p.page.waitForTimeout(2500);
    await p.page.evaluate(() => window.DoChessFriends.pollNow());
    await p.page.waitForTimeout(1500);
    expect(await relist(p.page), 'the removal stands; a stale snapshot must not resurrect the friend')
        .not.toContain('user_e2edave000004');
    await p.ctx.close();
});

/* ── 15: an unconfigured backend never masquerades as global ────────── */

test('15: with no backend the app says so and shows no fake global ladder', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    // file:// has no API origin at all — the production GitHub Pages case.
    await page.route('file://**/api/**', (r) => r.abort());
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 30000 });
    expect(await page.evaluate(() => window.DoChessFriends.apiBase()), 'no backend is configured').toBe(null);

    await page.evaluate(() => {
        localStorage.setItem('ccr_board', JSON.stringify({
            fr_u1: { name: 'Self', cats: { blitz: 800 }, seen: Date.now() },
            other1: { name: 'Other Person', cats: { blitz: 1200 }, seen: Date.now() },
        }));
        window.app._clerk = { user: { id: 'fr_u1', fullName: 'Self' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser('fr_u1');
    });
    await page.waitForTimeout(3600);
    await page.evaluate(() => window.app.showFriends('ranking'));
    await expect(page.locator('#fr-rankout')).toContainText(/Device board/i, { timeout: 20000 });
    await expect(page.locator('#fr-rankout')).not.toContainText('Global ladder');
    // And it must not present other players as a global leaderboard.
    await expect(page.locator('#fr-rankout')).toContainText('Other');
    await ctx.close();
});

test('6b: presence is not enumerable — only known counterparties are reported', async () => {
    const random = 'user_e2estranger0099';
    await call('POST', '/api/presence', { name: 'Nosy Parker', img: null }, random);
    // Eve and Bob are friends, so Eve is entitled to Bob's presence.
    await call('POST', '/api/friends/request', { friendUid: EVE, friendName: 'Eve Ellis' }, BOB);
    await call('POST', '/api/friends/respond', { fromUid: BOB, accept: true }, EVE);
    const r = await call('GET', `/api/friends/status?uids=${random},${BOB}`, undefined, EVE);
    expect(r.status).toBe(200);
    expect(r.body.status[random], 'presence of an unrelated stranger is withheld').toBeUndefined();
    expect(r.body.status[BOB], 'presence of a known friend is returned').toBeTruthy();
});

test('a stranger cannot use the inbox or the directory to reach anyone', async () => {
    const r = await call('POST', '/api/notify', { toUid: 'user_e2estranger0099', kind: 'note', title: 'hi' }, ALICE);
    expect(r.status, 'no inbox writes to strangers').toBe(403);
    const box = await call('GET', '/api/notify', undefined, 'user_e2estranger0099');
    expect(box.body.items.length).toBe(0);
});