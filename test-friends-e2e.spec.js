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

test('11: the sender is taken to the board when the recipient accepts', async ({ browser }) => {
    const sender = await newAccount(browser, DAVE, 'Dave Diaz');
    const recip = await newAccount(browser, EVE, 'Eve Ellis');
    await call('POST', '/api/friends/request', { friendUid: EVE, friendName: 'Eve Ellis' }, DAVE);
    await call('POST', '/api/friends/respond', { fromUid: DAVE, accept: true }, EVE);

    // The sender drives the REAL flow: friends list → Invite to play →
    // time-control picker → Send invite (which also hosts the room).
    await expect.poll(() => relist(sender.page), { timeout: 25000 }).toContain(EVE);
    await sender.page.evaluate(() => window.app.showFriends('friends'));
    await sender.page.evaluate(() => window.DoChessFriends.pollNow());
    const playBtn = sender.page.locator(`[data-faction="play"][data-uid="${EVE}"]`);
    await expect(playBtn, 'sender can invite without visiting Online').toBeVisible({ timeout: 20000 });
    await playBtn.click();
    await expect(sender.page.locator('#tc-overlay')).toBeVisible({ timeout: 10000 });
    await sender.page.locator('#tc-overlay input[value="5:0"]').check();
    await sender.page.locator('#tc-overlay [data-tc="go"]').click();
    await sender.page.waitForFunction(() => {
        try { return !!JSON.parse(localStorage.getItem('cc_pending_invite') || 'null')?.matchId; }
        catch (_) { return false; }
    }, null, { timeout: 30000 });
    const matchId = await sender.page.evaluate(() => JSON.parse(localStorage.getItem('cc_pending_invite')).matchId);

    // The sender sees their own sent invite — and nobody else does.
    const asSender = await call('GET', '/api/invites', undefined, DAVE);
    const row = (asSender.body.sent || []).find((s) => s.matchId === matchId);
    expect(row?.status, 'sent invite visible to the sender').toBe('pending');
    const asStranger = await call('GET', '/api/invites', undefined, CAROL);
    expect((asStranger.body.sent || []).some((s) => s.matchId === matchId), 'sent invites never leak').toBe(false);

    // The recipient accepts exactly like the popup does.
    expect((await call('POST', '/api/invites/respond', { matchId, accept: true }, EVE)).body.status).toBe('accepted');

    // The sender must NOT still be parked on friends: within a couple of
    // poll cycles they land on the live board — same room they hosted.
    await sender.page.waitForFunction(
        () => document.getElementById('online-screen')?.classList.contains('active'),
        null, { timeout: 30000 });
    const code = await sender.page.evaluate(() => window.app.online?.code);
    expect(code, 'sender reaches their own waiting room').toBeTruthy();
    await expect.poll(async () => sender.page.evaluate(() => localStorage.getItem('cc_pending_invite')),
        { timeout: 15000 }).toBe(null);

    // Decline: the sender is NOT dragged anywhere; the wait just clears
    // (the server's inbox note carries the news).
    await sender.page.evaluate(() => window.app.showFriends('friends'));
    await sender.page.evaluate(() => window.DoChessFriends.pollNow());
    await expect(sender.page.locator(`[data-faction="play"][data-uid="${EVE}"]`)).toBeVisible({ timeout: 20000 });
    await sender.page.locator(`[data-faction="play"][data-uid="${EVE}"]`).click();
    await expect(sender.page.locator('#tc-overlay')).toBeVisible({ timeout: 10000 });
    await sender.page.locator('#tc-overlay [data-tc="go"]').click();
    await sender.page.waitForFunction(() => {
        try { return !!JSON.parse(localStorage.getItem('cc_pending_invite') || 'null')?.matchId; }
        catch (_) { return false; }
    }, null, { timeout: 30000 });
    const matchId2 = await sender.page.evaluate(() => JSON.parse(localStorage.getItem('cc_pending_invite')).matchId);
    expect(matchId2).not.toBe(matchId);
    expect((await call('POST', '/api/invites/respond', { matchId: matchId2, accept: false }, EVE)).body.status).toBe('declined');
    await expect.poll(async () => sender.page.evaluate(() => localStorage.getItem('cc_pending_invite')),
        { timeout: 20000 }).toBe(null);
    await expect(sender.page.locator('#online-screen')).not.toHaveClass(/active/);

    await sender.ctx.close(); await recip.ctx.close();
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

/* ── the three things the user reported, verified end to end ──────── */

// The reported bug: "Could not send request — the server refused the
// request". The real cause was that a 401 (no session token) was reported as
// a generic refusal AND the row the user had just created was deleted.
// Uses its OWN pair of accounts so it cannot be perturbed by the shared
// ALICE/BOB state the lifecycle test above leaves behind.
const RETRY_ME = 'user_retrysender01';
const RETRY_THEM = 'user_retrytarget01';

test('a failed send keeps the request, says why, and can be retried', async ({ browser }) => {
    for (const u of [RETRY_ME, RETRY_THEM]) {
        await call('PUT', '/api/state', { sections: {} }, u);
    }
    const p = await newAccount(browser, RETRY_ME, 'Retry Sender');
    // Refuse the send the way a signed-out session does.
    await p.page.route('**/api/friends/request', (r) =>
        r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'not-signed-in' }) }));

    await p.page.evaluate((u) => window.DoChessFriends.requestFriend(u, 'Retry Target', 'search'), RETRY_THEM);
    await p.page.waitForTimeout(1500);

    // The user's work is NOT thrown away.
    const stillThere = await p.page.evaluate((u) =>
        window.DoChessFriends.list().some((f) => f.uid === u && f.unsent), RETRY_THEM);
    expect(stillThere, 'the request is kept and flagged as not delivered').toBe(true);

    // And the message names the actual problem.
    const notes = await p.page.evaluate(() => window.DoChessFriends.inbox().map((m) => m.title + ' :: ' + m.body).join(' | '));
    expect(notes, 'the failure is explained specifically').toMatch(/Sign in/i);
    expect(notes, 'and it does not claim the server refused a request').not.toMatch(/server refused/i);

    // A retry that succeeds clears the flag.
    await p.page.unroute('**/api/friends/request');
    const retried = await p.page.evaluate((u) => window.DoChessFriends.requestFriend(u, 'Retry Target', 'search'), RETRY_THEM);
    await p.page.waitForTimeout(2500);
    const after = await p.page.evaluate((u) => ({
        unsent: window.DoChessFriends.list().find((f) => f.uid === u)?.unsent,
        why: window.DoChessFriends.list().find((f) => f.uid === u)?.unsentWhy,
        notes: window.DoChessFriends.inbox().map((m) => m.title).slice(0, 4),
    }), RETRY_THEM);
    after.gotRow = !!retried;
    expect(after.unsent, `retry should clear the undelivered flag (${JSON.stringify(after)})`).toBeUndefined();
    const snap = await call('GET', '/api/friends/snapshot', undefined, RETRY_ME);
    expect(snap.body.requests.outbound.map((r) => r.uid), 'the retry actually reached the server').toContain(RETRY_THEM);
    await p.ctx.close();
});

// The hall must list EVERY registered account from the database, with
// their picture AND their full name, out in the open — not just this
// device's friends, not blurred.
test('the hall of fame lists every registered account with their picture', async () => {
    const PHO = 'user_e2ehallphoto01';
    await call('PUT', '/api/state', {
        sections: {},
        profile: { name: 'Hall Photo', image: 'https://img.example/hall.png' },
    }, PHO);
    const r = await call('GET', '/api/hall?cat=blitz&limit=100&offset=0', undefined, EVE);
    expect(r.status).toBe(200);
    expect(r.body.naming, 'the hall contract is full names').toBe('full');
    expect(['all', 'synced'], 'the hall says honestly which registry it read').toContain(r.body.scope);
    const row = r.body.board.find((h) => h.name === 'Hall Photo');
    expect(row, 'a stranger from the database is in the hall by full name').toBeTruthy();
    expect(row.img, 'with their picture').toBe('https://img.example/hall.png');
    expect(r.body.total, 'the hall counts every registered account').toBeGreaterThanOrEqual(7);
    // Full name and photo — but still no uid, never an email.
    expect('uid' in row).toBe(false);
    expect('email' in row).toBe(false);
    expect(JSON.stringify(r.body.board)).not.toContain('@');
});

// "you and your friends and the rest", complete no matter which page is open.
test('the ladder shows you, every friend, and the rest of the database', async ({ browser }) => {
    const me = await newAccount(browser, CAROL, 'Carol Chen');
    const friend = await newAccount(browser, DAVE, 'Dave Diaz');
    await call('POST', '/api/friends/request', { friendUid: CAROL, friendName: 'Carol Chen' }, DAVE);
    await call('POST', '/api/friends/respond', { fromUid: DAVE, accept: true }, CAROL);
    await expect.poll(() => relist(me.page), { timeout: 20000 }).toContain(DAVE);

    // A stranger with a name, so the UI has something to blur.
    const STR = 'user_e2estranger42';
    await call('PUT', '/api/state', { sections: {} }, STR);

    await me.page.evaluate(() => window.app.showFriends('ranking'));
    await expect(me.page.locator('#fr-rankout')).toContainText('Global ladder', { timeout: 25000 });
    await expect(me.page.locator('.fr-brow.me')).toBeVisible();
    // The friend is listed by full name and is NOT blurred.
    const daveRow = me.page.locator('.fr-brow', { hasText: 'Dave Diaz' }).first();
    await expect(daveRow).toBeVisible();
    expect(await daveRow.evaluate((el) => el.classList.contains('blurry')),
        'a friend is never blurred').toBe(false);
    // Strangers from the database are blurred.
    expect(await me.page.locator('.fr-brow.blurry').count(), 'strangers are blurred').toBeGreaterThan(0);
    // And the board says it refreshes itself.
    await expect(me.page.locator('.fr-live')).toContainText(/refreshes every 30s/i);
    // Ranks run in order, top to bottom.
    const ranks = (await me.page.locator('.fr-rank').allInnerTexts()).map((t) => Number(t.trim())).filter(Number.isFinite);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks, 'the ladder is in rank order').toEqual(sorted);

    // The board refreshes on demand: register a new player and press Refresh.
    const NEW = 'user_efreshnew0001';
    await call('PUT', '/api/state', {
        sections: {}, profile: { name: 'Fresh Newcomer' },
    }, NEW);
    await me.page.click('[data-faction="rank-refresh"]');
    await expect(me.page.locator('.fr-bname').filter({ hasText: 'Fresh' }).first(),
        'a newly registered account appears without a page reload').toBeVisible({ timeout: 20000 });

    await me.ctx.close(); await friend.ctx.close();
});

test('15: with no backend the app says so and shows no fake global ladder', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    // file:// has no API origin at all — the production GitHub Pages case.
    await page.route('file://**/api/**', (r) => r.abort());
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 30000 });
    // Simulate "no backend configured" regardless of the committed
    // production default: this test proves the device-local fallback UI.
    await page.evaluate(() => { window.DOCHESS_API_BASE = ''; });
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
    // It must never claim a global board it does not have.
    await expect(page.locator('#fr-rankout')).not.toContainText('Global ladder');
    await expect(page.locator('#fr-rankout')).not.toContainText(/global ladder/i);
    await expect(page.locator('#fr-rankout')).toContainText('not connected to the ranking service');
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

test('16: friend streaks survive refresh; XP pays per result; presence leave works', async ({ browser }) => {
    const a = await newAccount(browser, ALICE, 'Alice Wonder');
    const b = await newAccount(browser, BOB, 'Bob Builder');
    await call('POST', '/api/friends/request', { friendUid: BOB, friendName: 'Bob Builder' }, ALICE);
    await call('POST', '/api/friends/respond', { fromUid: ALICE, accept: true }, BOB);
    await expect.poll(() => relist(a.page), { timeout: 25000 }).toContain(BOB);

    // Both players record the same shared rapid game, exactly like the app
    // does on game end (result + control + opponent id).
    const now = Date.now();
    const ra = await call('POST', '/api/games', {
        gameId: 'gstreak-e2e-1', result: 'win', date: now, plies: 40,
        control: { id: 'rapid' }, opp: 'Bob Builder', oppUid: BOB,
    }, ALICE);
    expect(ra.body.xp && ra.body.xp.gained, 'the record pays XP inline').toBe(20);
    await call('POST', '/api/games', {
        gameId: 'gstreak-e2e-1', result: 'loss', date: now, plies: 40,
        control: { id: 'rapid' }, opp: 'Alice Wonder', oppUid: ALICE,
    }, BOB);
    expect((await call('GET', '/api/xp', undefined, ALICE)).body.xp).toMatchObject({ total: 20, games: 20 });
    expect((await call('GET', '/api/xp', undefined, BOB)).body.xp).toMatchObject({ total: 5, games: 5 });

    // Per-category separation: rapid moved, blitz and bullet did not.
    const rapid = await call('GET', '/api/rank?cat=rapid&limit=100&offset=0', undefined, ALICE);
    expect(rapid.body.myRating, 'the rapid win replays into rapid').toBeGreaterThan(800);
    const blitz = await call('GET', '/api/rank?cat=blitz&limit=100&offset=0', undefined, ALICE);
    expect(blitz.body.myRating, 'blitz untouched by a rapid win').toBe(800);

    // Neither side ever reads their own name on the other's row (the old
    // mirror wrote the accepter's name under both keys). Presence is
    // heartbeated first so the fallback chain is deterministic.
    await call('POST', '/api/presence', { name: 'Alice Wonder', img: null }, ALICE);
    await call('POST', '/api/presence', { name: 'Bob Builder', img: null }, BOB);
    const snapA = await call('GET', '/api/friends/snapshot', undefined, ALICE);
    expect(snapA.body.friends.find((f) => f.uid === BOB).name, 'Alice sees Bob').toBe('Bob Builder');
    const snapB = await call('GET', '/api/friends/snapshot', undefined, BOB);
    expect(snapB.body.friends.find((f) => f.uid === ALICE).name, 'Bob sees Alice, not himself').toBe('Alice Wonder');

    // Simulate the reported refresh: wipe the in-memory/local days on both
    // sides, re-pull the authoritative snapshot, and the flame must be 1 —
    // on BOTH devices — instead of resetting to 0.
    const streakOf = (page, uid) => page.evaluate((u) => {
        const F = window.DoChessFriends;
        const all = F.list().map((x) => x.uid);
        const f = F.list().find((x) => x.uid === u);
        if (!f) return 'MISSING:' + JSON.stringify(all);
        delete f.days; delete f.streakCount; delete f.streakBest;
        return F.pollNow().then(() => F.streakOf(F.list().find((x) => x.uid === u)));
    }, uid);
    await expect.poll(() => streakOf(a.page, BOB), { timeout: 25000 }).toBe(1);
    await expect.poll(() => streakOf(b.page, ALICE), { timeout: 25000 }).toBe(1);

    // Presence: heartbeat shows online; an explicit leave clears at once
    // (no ghost "online now"), with last-seen back to zero.
    await call('POST', '/api/presence', { name: 'Alice Wonder', img: null }, ALICE);
    let st = await call('GET', `/api/friends/status?uids=${ALICE}`, undefined, BOB);
    expect(st.body.status[ALICE].online, 'heartbeat means online').toBe(true);
    await call('POST', '/api/presence/leave', {}, ALICE);
    st = await call('GET', `/api/friends/status?uids=${ALICE}`, undefined, BOB);
    expect(st.body.status[ALICE].online, 'leave means offline at once').toBe(false);

    await a.ctx.close(); await b.ctx.close();
});

test('17: presence flips on the friend screen within seconds, no reload', async ({ browser }) => {
    const a = await newAccount(browser, ALICE, 'Alice Wonder');
    const b = await newAccount(browser, BOB, 'Bob Builder');
    await call('POST', '/api/friends/request', { friendUid: BOB, friendName: 'Bob Builder' }, ALICE);
    await call('POST', '/api/friends/respond', { fromUid: ALICE, accept: true }, BOB);
    await expect.poll(() => relist(b.page), { timeout: 25000 }).toContain(ALICE);

    // Bob parks on the friends screen with Alice's row on display.
    await b.page.evaluate(() => window.app.showFriends('friends'));
    const row = b.page.locator(`article.fr-card[data-uid="${ALICE}"]`);
    await expect(row, 'friend row renders').toBeVisible({ timeout: 20000 });

    // Alice comes online: Bob's screen flips WITHOUT any reload or click.
    await call('POST', '/api/presence', { name: 'Alice Wonder', img: null }, ALICE);
    await expect(row, 'online push reaches the open screen').toContainText(/online now/i, { timeout: 25000 });

    // Alice leaves: Bob's screen flips to last-seen WITHOUT any reload.
    await call('POST', '/api/presence/leave', {}, ALICE);
    await expect(row, 'offline push reaches the open screen').toContainText(/last seen/i, { timeout: 25000 });

    // The tab-close path: firing pagehide must clear the server-side row
    // fast (proves the beacon fired — the TTL alone would take ~90 s).
    // Note: this dispatches the REAL pagehide handler on the live page. A
    // headless page.close() does not reliably run pagehide, and the
    // dev-header test identity lives in page routes that die with the page
    // — so a literal close cannot carry auth here the way production does
    // (cached Clerk token + keepalive fetch). Handler, fetch and server
    // path are exactly what a real close runs.
    await call('POST', '/api/presence', { name: 'Alice Wonder', img: null }, ALICE);
    await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(async () => (await call('GET', `/api/friends/status?uids=${ALICE}`, undefined, BOB))
        .body.status[ALICE].online, { timeout: 25000 }).toBe(false);

    await b.ctx.close(); await a.ctx.close();
});

test('18: remove, re-add and accept keeps every name on its owner', async ({ browser }) => {
    const a = await newAccount(browser, ALICE, 'Alice Wonder');
    const b = await newAccount(browser, BOB, 'Bob Builder');
    // Profiles make name resolution deterministic (no heartbeat timing).
    await call('PUT', '/api/state', { sections: {}, profile: { name: 'Alice Wonder' } }, ALICE);
    await call('PUT', '/api/state', { sections: {}, profile: { name: 'Bob Builder' } }, BOB);
    // Friend them the way the real client does (target name + live self-name).
    await call('POST', '/api/friends/request', { friendUid: BOB, friendName: 'Bob Builder', myName: 'Alice Wonder' }, ALICE);
    await call('POST', '/api/friends/respond', { fromUid: ALICE, accept: true, myName: 'Bob Builder' }, BOB);

    // The reported flow: A removes B, re-adds, B accepts — all in the app,
    // with NO refresh anywhere before the assertions.
    await a.page.evaluate(() => window.app.showFriends('friends'));
    await expect.poll(() => relist(a.page), { timeout: 25000 }).toContain(BOB);
    a.page.once('dialog', (d) => d.accept());
    await a.page.locator(`[data-faction="remove"][data-uid="${BOB}"]`).click();
    await expect.poll(() => relist(a.page), { timeout: 25000 }).not.toContain(BOB);
    // Server-confirmed (not just optimistic) before re-adding, or the
    // re-request 409s as already-friends and no accept button ever appears.
    await expect.poll(async () => (await call('GET', '/api/friends/snapshot', undefined, ALICE))
        .body.friends.map((f) => f.uid), { timeout: 25000 }).not.toContain(BOB);
    await call('POST', '/api/friends/request', { friendUid: BOB, friendName: 'Bob Builder', myName: 'Alice Wonder' }, ALICE);
    // B accepts with a real click, exercising the local accept path.
    await b.page.evaluate(() => window.app.showFriends('friends'));
    await b.page.evaluate(() => window.DoChessFriends.pollNow());
    const acceptBtn = b.page.locator(`[data-faction="accept"][data-uid="${ALICE}"]`);
    await expect(acceptBtn, 'request visible with sender identity').toBeVisible({ timeout: 25000 });
    await expect(b.page.locator('#friends-screen')).toContainText('Alice Wonder');
    await acceptBtn.click();
    // Both shelves, no refresh: each side reads the OTHER person's name.
    await expect.poll(async () => a.page.evaluate((u) =>
        (window.DoChessFriends.list().find((x) => x.uid === u) || {}).name, BOB),
        { timeout: 25000 }).toBe('Bob Builder');
    await expect.poll(async () => b.page.evaluate((u) =>
        (window.DoChessFriends.list().find((x) => x.uid === u) || {}).name, ALICE),
        { timeout: 25000 }).toBe('Alice Wonder');

    await a.ctx.close(); await b.ctx.close();
});

test('19: bell toggles back; profile shows LVL and database history', async ({ browser }) => {
    // Fresh account: earlier scenarios ledger XP and games onto the shared
    // ALICE/BOB identities, so exact-count assertions need isolation.
    const ME = 'user_e2eprof1901';
    await call('PUT', '/api/state', { sections: {}, profile: { name: 'Prof Pat' } }, ME);
    const a = await newAccount(browser, ME, 'Prof Pat');
    // Three recorded rapid wins: 3x20 game XP + the 3-win streak milestone
    // (+15) = 75 XP ledgered before the profile ever opens.
    for (let i = 1; i <= 3; i++) {
        await call('POST', '/api/games', {
            gameId: `gprof19-${i}`, result: 'win', date: i * 1000, plies: 40,
            control: { id: 'rapid' }, opp: 'Sparring Partner',
        }, ME);
    }
    await a.page.evaluate(() => window.app.showProfile());
    // LVL + combined XP on the dossier.
    await expect(a.page.locator('#profile-screen')).toContainText(/LVL 1/, { timeout: 20000 });
    await expect(a.page.locator('#profile-screen')).toContainText(/75 XP/);
    // History comes from the database (last-20 window over the archive).
    await expect(a.page.locator('.dc-hist-li')).toHaveCount(3, { timeout: 25000 });
    await expect(a.page.locator('#profile-screen')).toContainText(/last 3 of 3/);
    // The bell toggles like an app shade: profile -> activity -> profile.
    // (Header bell on desktop, side-nav bell on phone — click whichever
    // one is actually visible.)
    const ringBell = () => a.page.evaluate(() => {
        const bells = [...document.querySelectorAll('[data-action="friends-activity"]')];
        const vis = bells.find((b) => b && b.offsetParent !== null);
        if (!vis) return false;
        vis.click();
        return true;
    });
    expect(await ringBell(), 'a visible bell exists').toBe(true);
    await expect(a.page.locator('#friends-screen')).toHaveClass(/active/, { timeout: 15000 });
    await expect(a.page.locator('#friends-screen')).toContainText(/Notifications/);
    expect(await ringBell(), 'the bell toggles back').toBe(true);
    await expect(a.page.locator('#profile-screen')).toHaveClass(/active/, { timeout: 15000 });
    await a.ctx.close();
});