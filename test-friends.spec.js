import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

// Full-stack proof (dev-auth API + file store, no mongo needed): two
// strangers register via heartbeat; one finds the other by name with
// photo, adds straight from results — no invite link, no prior contact.
const E2E_PORT = 8898;
const E2E_API = `http://127.0.0.1:${E2E_PORT}`;
let apiProc = null;
async function startDevApi() {
    if (apiProc) return;
    apiProc = spawn('node', ['server/index.mjs'], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(E2E_PORT), DOCHESS_DEV_NO_AUTH: '1', DOCHESS_DEV_FILE_STORE: '1' },
        stdio: 'ignore',
    });
    const deadline = Date.now() + 30000;
    for (;;) {
        try {
            const h = await (await fetch(`${E2E_API}/api/health`)).json();
            if (h && h.ok) break;
        } catch (_) {}
        if (Date.now() > deadline) throw new Error('dev api did not start');
        await new Promise((r) => setTimeout(r, 400));
    }
}
async function stopDevApi() {
    if (apiProc) { try { apiProc.kill(); } catch (_) {} apiProc = null; }
}

test('global search end-to-end: stranger found by name with photo, added', async ({ browser }) => {
    test.setTimeout(180000);
    await startDevApi();
    try {
        const mk = async (uid, name, img) => {
            const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
            await page.goto(`${E2E_API}/`);
            await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 20000 });
            await page.evaluate(() => localStorage.clear());
            await page.reload();
            await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 20000 });
            await page.evaluate(([id, nm, photo]) => {
                window.app._clerk = { user: { id, fullName: nm, imageUrl: photo || null }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
                window.app._setUser(id);
            }, [uid, name, img || null]);
            // Dev auth travels as a header (no Clerk session in tests).
            await page.route('**/api/**', (r) => {
                const headers = { ...r.request().headers(), 'x-dochess-user': uid };
                r.continue({ headers });
            });
            return page;
        };
        const A = await mk('user_e2ealice01', 'Alice Wonder', null);
        const B = await mk('user_e2ebob02', 'Bobby Tables', 'https://x.test/bob.png');
        // Both register through the boot heartbeat (friends screen unopened).
        // Gate on the server directory itself so the search below is stable.
        const t0 = Date.now();
        for (;;) {
            const r = await fetch(`${E2E_API}/api/directory?q=bobby`, { headers: { 'x-dochess-user': 'user_e2ealice01' } }).then((x) => x.json()).catch(() => null);
            if (r && r.players && r.players.some((p) => p.uid === 'user_e2ebob02')) break;
            if (Date.now() - t0 > 60000) throw new Error('bob never registered');
            await new Promise((x) => setTimeout(x, 1000));
        }
        await A.evaluate(() => window.app.showFriends());
        await A.locator('#fr-search').fill('bobby');
        await expect(A.locator('#fr-results')).toContainText('Bobby Tables', { timeout: 15000 });
        await expect(A.locator('#fr-results img.fr-avaimg[src="https://x.test/bob.png"]')).toBeVisible();
        // Strangers are addable straight from results — they land in Sent
        // (never posed as friends) until they accept.
        await A.click('#fr-results [data-faction="add"]');
        await expect(A.locator('.fr-reqs')).toContainText('Bobby Tables');
        await expect(A.locator('.fr-reqs')).toContainText('waiting for answer');
        await expect(A.locator('#fr-grid')).not.toContainText('Bobby Tables');
        const f = await A.evaluate(() => window.DoChessFriends.list().find((x) => x.uid === 'user_e2ebob02'));
        expect(f.img).toBe('https://x.test/bob.png');
        await A.close();
        await B.close();
    } finally {
        await stopDevApi();
    }
});

// Friends graph, streaks, notifications, ranking, hall, chess.com lookup,
// cloud-engine adapter — all local-first (file://, no backend).
test.describe.configure({ timeout: 120000 });

async function freshPage(browser, vp) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 15000 });
    await page.evaluate(() => {
        localStorage.clear();
        window.app._clerk = { user: { id: 'fr_u1', fullName: 'FriendOne' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser('fr_u1');
    });
    // friends.js swaps its storage shelf up to 3 s after an identity
    // change: wait it out so every assertion below sees the fr_u1 shelf.
    await page.waitForTimeout(3600);
    return page;
}

test('friends screen opens from rail (desktop) and More sheet (phone)', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.click('#side-nav [data-nav="friends"]');
    await expect(page.locator('#friends-screen')).toHaveClass(/active/);
    await expect(page.locator('#side-nav [data-nav="friends"]')).toHaveClass(/active/);
    for (const tab of ['Friends', 'Ranking', 'Hall of fame', 'Activity']) {
        await expect(page.locator('.fr-tabs')).toContainText(tab);
    }
    await page.close();
    const m = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await m.goto('index.html');
    await m.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 15000 });
    await m.click('[data-nav="more"]');
    await m.click('#more-sheet [data-nav="friends"]');
    await expect(m.locator('#friends-screen')).toHaveClass(/active/);
    await expect(m.locator('#more-sheet')).toBeHidden();
    await m.close();
});

test('search gates at 3 letters; link request, accept, bell badge', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => window.app.showFriends());
    await page.locator('#fr-search').fill('Al');
    await expect(page.locator('#fr-results')).toContainText(/3 letters/);
    // Inbound link from Bob#u2.
    await page.evaluate(() => window.DoChessFriends.inboundLink('u2', 'Bobby'));
    await expect(page.locator('.fr-reqs')).toContainText('Bobby');
    await expect(page.locator('#side-nav .bell-count:not([hidden])')).toBeVisible();
    await page.locator('#fr-search').fill('bob');
    await expect(page.locator('#fr-results')).toContainText('Bobby');
    // Accept: friend row appears, request clears.
    await page.click('[data-faction="accept"]');
    await expect(page.locator('#fr-grid')).toContainText('Bobby');
    await expect(page.locator('.fr-reqs')).toBeHidden();
    // Profile link format carries uid + slug.
    const link = await page.evaluate(() => window.DoChessFriends.profileLink());
    expect(link).toMatch(/#friend-fr_u1-FriendOne$/);
    await page.close();
});

test('streaks grow per day, warnings fire, versus counts real games', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => {
        window.DoChessFriends.addFriend('u9', 'Nina', 'link');
        window.DoChessFriends.acceptFriend('u9');
        window.DoChessFriends.onGameEnd({ oppUid: 'u9', oppName: 'Nina', result: 'win', cat: 'blitz', myRating: 820 });
        window.DoChessFriends.onGameEnd({ oppUid: 'u9', oppName: 'Nina', result: 'draw', cat: 'blitz', myRating: 822 });
    });
    expect(await page.evaluate(() => {
        const f = window.DoChessFriends.list().find((x) => x.uid === 'u9');
        return window.DoChessFriends.streakOf(f);
    })).toBe(1);
    // Versus from seeded history (oppUid match preferred, name fallback).
    await page.evaluate(() => {
        localStorage.setItem('ccgh_fr_u1', JSON.stringify([
            { gameId: 'g1', oppUid: 'u9', opp: 'Nina', result: 'win', date: Date.now() },
            { gameId: 'g2', oppUid: 'u9', opp: 'Nina', result: 'loss', date: Date.now() },
            { gameId: 'g3', opp: 'Stranger', result: 'win', date: Date.now() },
        ]));
    });
    expect(await page.evaluate(() => window.DoChessFriends.versus('u9'))).toEqual({ w: 1, l: 1, d: 0, games: 2 });
    // Yesterday-only streak triggers the fading warning on open.
    await page.evaluate(() => {
        const F = window.DoChessFriends;
        const y = new Date(Date.now() - 86400000);
        const key = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, '0')}-${String(y.getUTCDate()).padStart(2, '0')}`;
        F.addFriend('u8', 'Omar', 'link');
        F.acceptFriend('u8');
        const f = F.list().find((x) => x.uid === 'u8');
        f.days = { [key]: 1 };
        window.app.showFriends();
    });
    await expect(page.locator('.fr-feed, #fr-body')).toContainText(/fading|streak/i);
    await page.close();
});

test('ranking names friends, anonymizes strangers; hall lists join order', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => {
        localStorage.setItem('ccr_board', JSON.stringify({
            fr_u1: { name: 'FriendOne', cats: { blitz: 900 }, seen: Date.now() },
            u2: { name: 'Bobby', cats: { blitz: 1200 }, seen: Date.now() },
            ux: { name: 'Xenia', cats: { blitz: 1500 }, seen: Date.now() },
        }));
        window.DoChessFriends.addFriend('u2', 'Bobby', 'link');
        window.DoChessFriends.acceptFriend('u2');
    });
    await page.evaluate(() => window.app.showFriends('ranking'));
    await expect(page.locator('#fr-rankout')).toContainText('Bobby');
    await expect(page.locator('#fr-rankout')).toContainText('a quiet rival');
    await expect(page.locator('#fr-rankout')).not.toContainText('Xenia');
    await expect(page.locator('.fr-myrank')).toContainText(/#3/);
    await page.evaluate(() => window.app.showFriends('hall'));
    await expect(page.locator('#fr-hallout')).toContainText('Bobby');
    await page.close();
});

test('friend links carry photos; metPeer confirms and stores them', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    // Sender side: profile link embeds the avatar (fake Clerk photo here).
    await page.evaluate(() => {
        window.app._clerk.user.imageUrl = 'https://x.test/me.png';
    });
    const raw = await page.evaluate(() => window.DoChessFriends.profileLink());
    expect(raw).toMatch(/#friend-fr_u1-FriendOne-/);
    // Receiver side (a different account): parse + accept, photo on card.
    await page.evaluate((l) => {
        const link = l.replace('fr_u1', 'sender99');
        const m = /#friend-([^-]+)-([^-]+)-(.+)$/.exec(link);
        let img = null;
        try {
            let b = m[3].replace(/-/g, '+').replace(/_/g, '/');
            while (b.length % 4) b += '=';
            img = decodeURIComponent(escape(atob(b)));
        } catch (_) {}
        window.DoChessFriends.inboundLink(m[1], decodeURIComponent(m[2]), img);
    }, raw);
    await page.evaluate(() => window.app.showFriends());
    await expect(page.locator('.fr-req img.fr-avaimg[src="https://x.test/me.png"]')).toBeVisible();
    await page.click('[data-faction="accept"]');
    const acc = await page.evaluate(() => window.DoChessFriends.list().find((x) => x.uid === 'sender99'));
    expect(acc.img).toBe('https://x.test/me.png');
    // P2P meeting confirms a pending outbound edge + stores the photo.
    await page.evaluate(() => {
        window.DoChessFriends.addFriend('live9', 'Liva', 'search');
        window.DoChessFriends.metPeer('live9', 'Liva', 'https://x.test/liva.png');
    });
    const lv = await page.evaluate(() => window.DoChessFriends.list().find((x) => x.uid === 'live9'));
    expect(lv.confirmed).toBe(true);
    expect(lv.img).toBe('https://x.test/liva.png');
    await page.close();
});

test('ranking always shows self, even with zero other players', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => window.app.showFriends('ranking'));
    await expect(page.locator('.fr-myrank')).toContainText('#1');
    await expect(page.locator('.fr-myrank')).toContainText('1 rated player');
    await expect(page.locator('#fr-rankout')).toContainText('(you)');
    await expect(page.locator('#fr-rankout')).not.toContainText('No rated players yet');
    await page.close();
});

test('hero shows daily flame, XP bar and tier even with zero friends', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => {
        const st = { version: 1, stars: {}, attempts: {}, accuracy: {}, leitner: {}, heatmap: {}, xp: 320, level: 3, badges: [], streak: { count: 4, lastDay: '2026-10-12' }, settings: { theme: 'night' }, legacy: {} };
        const t = new Date();
        const p = (n) => String(n).padStart(2, '0');
        const today = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
        st.heatmap[today] = 2;
        localStorage.setItem('dochess:v1', JSON.stringify(st));
        window.app.showFriends();
    });
    await expect(page.locator('.fr-hero-flame strong')).toHaveText('4');
    await expect(page.locator('.fr-xp-top')).toContainText('320 XP');
    await expect(page.locator('.fr-xp-top')).toContainText('LVL 3');
    await expect(page.locator('.fr-hero')).toContainText('day streak');
    // Onboarding renders with zero friends.
    await expect(page.locator('.fr-onboard')).toContainText('Grow your first flame');
    await page.close();
});

test('photos show on friend rows; http: rejected', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1440, height: 900 });
    await page.evaluate(() => {
        window.DoChessFriends.addFriend('ph1', 'Pam', 'link');
        window.DoChessFriends.acceptFriend('ph1');
        window.DoChessFriends.metPeer('ph1', 'Pam', 'https://x.test/pam.png');
        window.app.showFriends();
    });
    await expect(page.locator('#fr-grid img.fr-avaimg[src="https://x.test/pam.png"]')).toBeVisible();
    // http: photo rejected, letter fallback kept.
    await page.evaluate(() => window.DoChessFriends.metPeer('ph1', 'Pam', 'http://evil/x.png'));
    expect(await page.evaluate(() => window.DoChessFriends.list().find((x) => x.uid === 'ph1').img)).toBe('https://x.test/pam.png');
    await page.close();
});

test('server directory finds strangers the device never met', async ({ browser }) => {
    // Page loads locally (file://); only the API base points at the stub.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 15000 });
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('cc_api_base', 'https://api.stub');
        window.app._clerk = { user: { id: 'fr_u1', fullName: 'FriendOne' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser('fr_u1');
    });
    await page.waitForTimeout(3600);
    await page.route('https://api.stub/api/directory*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, players: [{ uid: 'srv_zed', name: 'Zelda', img: 'https://x.test/zelda.png' }] }) }));
    await page.evaluate(() => window.app.showFriends());
    await page.locator('#fr-search').fill('zelda');
    await expect(page.locator('#fr-results')).toContainText('Zelda');
    await expect(page.locator('#fr-results')).toContainText('DoChess');
    await expect(page.locator('#fr-results img.fr-avaimg[src="https://x.test/zelda.png"]')).toBeVisible();
    await page.close();
});

test('outbound requests wait in Sent, never pose as friends', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => {
        window.DoChessFriends.addFriend('out1', 'Olivia', 'search');
        window.app.showFriends();
    });
    // Not in the friends grid…
    await expect(page.locator('#fr-grid')).not.toContainText('Olivia');
    // …but in Sent with a cancel action.
    await expect(page.locator('.fr-reqs')).toContainText('waiting for answer');
    await page.click('[data-faction="remove"]');
    await expect(page.locator('.fr-reqs')).toBeHidden();
    expect(await page.evaluate(() => window.DoChessFriends.list().length)).toBe(0);
    await page.close();
});

test('ranking privacy: neighbors and friends clear, strangers blurred', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.evaluate(() => {
        localStorage.setItem('ccr_board', JSON.stringify({
            fr_u1: { name: 'FriendOne', cats: { blitz: 1000 }, seen: Date.now() },
            a: { name: 'Amy', cats: { blitz: 1600 }, seen: Date.now() },
            b: { name: 'Ben', cats: { blitz: 1100 }, seen: Date.now() },
            c: { name: 'Cat', cats: { blitz: 900 }, seen: Date.now() },
            d: { name: 'Dan', cats: { blitz: 500 }, seen: Date.now() },
        }));
        window.DoChessFriends.addFriend('b', 'Ben', 'link');
        window.DoChessFriends.acceptFriend('b');
        window.app.showFriends('ranking');
    });
    // Self #3: #2 Ben (friend) and #4 Cat (below) clear; #1 Amy and #5 Dan blurred.
    const cls = await page.evaluate(() => [...document.querySelectorAll('.fr-brow')].map((el) => ({
        rank: el.querySelector('.fr-rank').textContent,
        blurry: el.classList.contains('blurry'),
    })));
    expect(cls).toEqual([
        { rank: '1', blurry: true },
        { rank: '2', blurry: false },
        { rank: '3', blurry: false },
        { rank: '4', blurry: false },
        { rank: '5', blurry: true },
    ]);
    await page.close();
});

test('request + accept notify both sides through the server inbox', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    const posts = [];
    await page.route('https://api.stub/api/**', (r) => {
        const url = r.request().url();
        if (url.includes('/notify') && r.request().method() === 'POST' && !url.includes('ack')) {
            posts.push(JSON.parse(r.request().postData() || '{}'));
        }
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], unread: 0, friends: [] }) });
    });
    await page.evaluate(() => {
        localStorage.setItem('cc_api_base', 'https://api.stub');
        window.app.showFriends();
        window.DoChessFriends.addFriend('nbx', 'Nina', 'search');
    });
    await page.waitForTimeout(500);
    expect(posts.some((p) => p.toUid === 'nbx' && p.kind === 'friend-request')).toBe(true);
    await page.evaluate(() => window.DoChessFriends.acceptFriend('nbx'));
    await page.waitForTimeout(500);
    expect(posts.some((p) => p.toUid === 'nbx' && p.kind === 'friend-accept')).toBe(true);
    await page.close();
});

test('game invite pops up anywhere and accepts into the room', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.route('https://api.stub/api/notify', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true,
        items: [{ id: 'gip1', kind: 'game-invite', title: 'Rival invites you', body: 'blitz game', from: 'u9', at: Date.now(), read: false, data: { code: 'INVITE', control: 'blitz', fromName: 'Rival', rating: 1100 } }],
        unread: 1,
    }) }));
    await page.route('https://api.stub/api/notify/ack', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, acked: 1 }) }));
    await page.evaluate(() => {
        localStorage.setItem('cc_api_base', 'https://api.stub');
        window.app.showHome();
    });
    await page.waitForTimeout(500);
    // Poll now (the 15 s interval would do it on its own).
    await page.evaluate(() => window.DoChessFriends.pollNow());
    await expect(page.locator('#gip-overlay')).toContainText('Rival invites you', { timeout: 15000 });
    await expect(page.locator('#gip-overlay .qm-clock')).toBeVisible();
    await page.click('#gip-overlay [data-gip="accept"]');
    await page.waitForFunction(() => window.app.online?.code === 'INVITE', null, { timeout: 30000 });
    expect(await page.evaluate(() => document.getElementById('gip-overlay'))).toBe(null);
    await page.close();
});

test('cloud engine dormant by default, answers when configured', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    expect(await page.evaluate(() => window.DoChessCloud.configured())).toBe(false);
    expect(await page.evaluate(() => window.DoChessCloud.hint('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', []))).toBe(null);
    await page.route('**/cloud.example/ai/move', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bestMove: 'e2e4' }) }));
    await page.evaluate(() => {
        localStorage.setItem('cc_cloud_api', 'https://cloud.example');
        localStorage.setItem('cc_cloud_route', '/ai/move');
    });
    expect(await page.evaluate(() => window.DoChessCloud.configured())).toBe(true);
    expect(await page.evaluate(() => window.DoChessCloud.hint('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', []))).toBe('e2e4');
    await page.close();
});
