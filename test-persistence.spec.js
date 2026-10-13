import { test, expect } from '@playwright/test';

// Identity survival: guest progress, ratings, history, friends and learn
// XP must survive sign-in, sign-out and account switches. These regressed
// more than once (restore-then-migrate ordering, unmigrated shelves).
test.describe.configure({ timeout: 120000 });

async function boot(browser, vp) {
    const page = await browser.newPage({ viewport: vp || { width: 1280, height: 800 } });
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.app && !!window.DoChessFriends, null, { timeout: 15000 });
    return page;
}
async function signInAs(page, uid, name) {
    await page.evaluate(([id, nm]) => {
        window.app._clerk = { user: { id, fullName: nm }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser(id);
    }, [uid, name]);
    // friends.js swaps its shelf up to 3 s after an identity change.
    await page.waitForTimeout(3800);
}
async function signOut(page) {
    await page.evaluate(() => { window.app._clerk = null; window.app._setUser(null); });
    await page.waitForTimeout(3800);
}
const snap = () => ({
    elo: null, hist: 0, xp: null, friends: 0,
});

test('guest progress survives first sign-in: learn, elo, games, friends', async ({ browser }) => {
    const page = await boot(browser);
    // Live as guest: learn XP, a rating, a finished game, a friend.
    await page.evaluate(() => {
        localStorage.setItem('dochess:v1', JSON.stringify({ version: 1, stars: {}, attempts: {}, accuracy: {}, leitner: {}, heatmap: {}, xp: 320, level: 3, badges: [], streak: { count: 2, lastDay: null }, settings: {}, legacy: {} }));
        localStorage.setItem('ccr_guest', JSON.stringify({ cats: { blitz: { rating: 850, games: 3 } }, processed: [] }));
        localStorage.setItem('ccgh_guest', JSON.stringify([{ gameId: 'g1', result: 'win' }]));
        window.DoChessFriends.addFriend('gx', 'GuestPal', 'link');
    });
    await signInAs(page, 'u_new', 'Newbie');
    const st = await page.evaluate(() => ({
        learn: JSON.parse(localStorage.getItem('dochess:v1')).xp,
        elo: JSON.parse(localStorage.getItem('ccr_u_new')).cats.blitz.rating,
        hist: JSON.parse(localStorage.getItem('ccgh_u_new')).length,
        friends: window.DoChessFriends.list().map((f) => f.uid),
    }));
    expect(st.learn).toBe(320);
    expect(st.elo).toBe(850);
    expect(st.hist).toBe(1);
    expect(st.friends).toContain('gx');
    await page.close();
});

test('logout/login round-trip keeps everything', async ({ browser }) => {
    const page = await boot(browser);
    await signInAs(page, 'u1', 'U');
    await page.evaluate(() => {
        localStorage.setItem('ccr_u1', JSON.stringify({ cats: { blitz: { rating: 955, games: 5 } }, processed: [] }));
        localStorage.setItem('ccgh_u1', JSON.stringify([{ gameId: 'g1', result: 'win' }]));
        const lv = JSON.parse(localStorage.getItem('dochess:v1') || '{"xp":0}');
        lv.xp = 320; localStorage.setItem('dochess:v1', JSON.stringify(lv));
        window.DoChessFriends.addFriend('u2', 'Bob', 'link');
    });
    await signOut(page);
    // Signed out: per-account shelves show guest state, device keeps u1's.
    await signInAs(page, 'u1', 'U');
    const st = await page.evaluate(() => ({
        elo: JSON.parse(localStorage.getItem('ccr_u1')).cats.blitz.rating,
        hist: JSON.parse(localStorage.getItem('ccgh_u1')).length,
        learn: JSON.parse(localStorage.getItem('dochess:v1')).xp,
        friends: window.DoChessFriends.list().map((f) => f.uid),
    }));
    expect(st).toEqual({ elo: 955, hist: 1, learn: 320, friends: ['u2'] });
    // Profile actually displays the restored rating + history.
    await page.evaluate(() => window.app.showProfile());
    await expect(page.locator('#profile-content')).toContainText('955', { timeout: 10000 });
    await page.close();
});

test('two accounts stay isolated, neither loses data', async ({ browser }) => {
    const page = await boot(browser);
    await signInAs(page, 'uA', 'A');
    await page.evaluate(() => {
        localStorage.setItem('ccr_uA', JSON.stringify({ cats: { blitz: { rating: 1000, games: 1 } }, processed: [] }));
        window.DoChessFriends.addFriend('fa', 'FriendA', 'link');
    });
    await signInAs(page, 'uB', 'B');
    const bState = await page.evaluate(() => ({
        elo: (() => { try { return JSON.parse(localStorage.getItem('ccr_uB')).cats.blitz.rating; } catch (_) { return 'NONE'; } })(),
        friends: window.DoChessFriends.list().map((f) => f.uid),
    }));
    // B is fresh: no A data leaks in, B starts blank (not A's 1000).
    expect(bState.elo).toBe('NONE');
    expect(bState.friends).toEqual([]);
    await signInAs(page, 'uA', 'A');
    const aState = await page.evaluate(() => ({
        elo: JSON.parse(localStorage.getItem('ccr_uA')).cats.blitz.rating,
        friends: window.DoChessFriends.list().map((f) => f.uid),
    }));
    expect(aState).toEqual({ elo: 1000, friends: ['fa'] });
    await page.close();
});

test('modern pieces are the default; saved choice respected', async ({ browser }) => {
    const page = await boot(browser);
    expect(await page.evaluate(() => window.DoChessPieces.get())).toBe('modern');
    expect(await page.evaluate(() => window.app._pieceSet())).toBe('modern');
    await page.evaluate(() => window.DoChessPieces.set('classic'));
    await page.reload();
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    expect(await page.evaluate(() => window.DoChessPieces.get())).toBe('classic');
    await page.close();
});
