import { test, expect } from '@playwright/test';

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
    await page.route('https://api.stub/api/directory*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, players: [{ uid: 'srv_zed', name: 'Zelda', img: null }] }) }));
    await page.evaluate(() => window.app.showFriends());
    await page.locator('#fr-search').fill('zelda');
    await expect(page.locator('#fr-results')).toContainText('Zelda');
    await expect(page.locator('#fr-results')).toContainText('DoChess');
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
