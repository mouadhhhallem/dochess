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

test('chess.com lookup adds real accounts; metPeer confirms', async ({ browser }) => {
    const page = await freshPage(browser, { width: 1280, height: 800 });
    await page.route('**/api.chess.com/**', (r) => {
        const url = r.request().url();
        if (url.endsWith('/stats')) r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chess_blitz: { last: { rating: 2912 } } }) });
        else r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'magnus', name: 'Magnus Carlsen', avatar: null, joined: 1200000000 }) });
    });
    await page.evaluate(() => window.app.showFriends());
    await page.locator('#fr-ccname').fill('magnus');
    await page.click('[data-faction="cc-lookup"]');
    await expect(page.locator('#fr-ccout')).toContainText('Magnus Carlsen');
    await expect(page.locator('#fr-ccout')).toContainText('2912');
    await page.click('[data-faction="cc-add"]');
    await expect(page.locator('#fr-grid')).toContainText('Magnus Carlsen');
    // P2P meeting confirms a pending outbound edge.
    await page.evaluate(() => {
        window.DoChessFriends.addFriend('live9', 'Liva', 'search');
        window.DoChessFriends.metPeer('live9', 'Liva');
    });
    const conf = await page.evaluate(() => window.DoChessFriends.list().find((x) => x.uid === 'live9').confirmed);
    expect(conf).toBe(true);
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
