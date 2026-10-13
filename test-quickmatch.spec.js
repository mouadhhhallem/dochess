import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Side rail (desktop) + tab bar (phone) + quick-match pairing.
const ROOT = process.cwd();
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
};
let server = null;
let origin = null;
test.beforeAll(async () => {
    server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://x');
            if (url.pathname.startsWith('/api/')) { res.writeHead(404); res.end('{}'); return; }
            const file = path.join(ROOT, decodeURIComponent(url.pathname));
            if (!file.startsWith(ROOT)) throw new Error('outside root');
            const target = (file === ROOT || file === ROOT + path.sep) ? path.join(ROOT, 'index.html') : file;
            const body = await readFile(target);
            res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' });
            res.end(body);
        } catch { res.writeHead(404); res.end('not found'); }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
});

async function mkPage(browser, vp, uid, name) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(([id, nm]) => {
        window.app._clerk = { user: { id, fullName: nm }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser(id);
    }, [uid, name]);
    return page;
}

test('desktop: side rail replaces header, navigates, highlights', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await expect(page.locator('#side-nav')).toBeVisible();
    await expect(page.locator('.header')).toBeHidden();
    await expect(page.locator('#tab-bar')).toBeHidden();
    await page.click('#side-nav [data-nav="online"]');
    await expect(page.locator('#online-screen')).toHaveClass(/active/);
    await expect(page.locator('#side-nav [data-nav="online"]')).toHaveClass(/active/);
    // Rail theme toggle mirrors the header one.
    await page.click('#side-nav [data-nav="theme"]');
    await page.waitForTimeout(700);
    expect(await page.locator('#side-nav [data-nav="theme"] .theme-toggle-label').textContent()).toMatch(/Day|Night/);
    await page.click('#side-nav [data-nav="home"]');
    await expect(page.locator('#home-screen')).toHaveClass(/active/);
});

test('phone: tab bar with central Play + More sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await expect(page.locator('#tab-bar')).toBeVisible();
    await expect(page.locator('#side-nav')).toBeHidden();
    await page.click('#tab-bar [data-nav="online"]');
    await expect(page.locator('#online-screen')).toHaveClass(/active/);
    await page.click('#tab-bar [data-nav="more"]');
    await expect(page.locator('#more-sheet')).toBeVisible();
    await page.click('#more-sheet [data-nav="study"]');
    await expect(page.locator('#study-screen')).toHaveClass(/active/);
    await expect(page.locator('#more-sheet')).toBeHidden();
});

test('quick match: two searchers pair over P2P bucket, opposite colors', async ({ browser }) => {
    test.setTimeout(180000);
    const vp = { width: 1280, height: 800 };
    const A = await mkPage(browser, vp, 'qm_a', 'QuickA');
    const B = await mkPage(browser, vp, 'qm_b', 'QuickB');
    for (const P of [A, B]) {
        await P.evaluate(() => window.app.showOnline());
        await P.waitForSelector('[data-action="online-quick"]', { timeout: 20000 });
    }
    await A.click('[data-action="online-quick"]');
    await B.click('[data-action="online-quick"]');
    await expect(A.locator('#qm-overlay')).toBeVisible();
    await expect(B.locator('#qm-overlay')).toBeVisible();
    await A.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 120000 });
    await B.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 120000 });
    const [ca, cb, cola, colb] = await Promise.all([
        A.evaluate(() => window.app.online.code), B.evaluate(() => window.app.online.code),
        A.evaluate(() => window.app.online.myColor), B.evaluate(() => window.app.online.myColor),
    ]);
    expect(ca).toBe(cb);
    expect(cola).not.toBe(colb);
    // Searching room is gone on both sides.
    expect(await A.locator('#qm-overlay').count()).toBe(0);
    expect(await B.locator('#qm-overlay').count()).toBe(0);
    await A.close();
    await B.close();
});

test('invite link: signed host pairs a guest, game unrated both sides', async ({ browser }) => {
    test.setTimeout(180000);
    const vp = { width: 1280, height: 800 };
    const host = await mkPage(browser, vp, 'inv_host', 'Host');
    await host.evaluate(() => window.app.showOnline());
    await host.waitForSelector('[data-action="online-host"]', { timeout: 20000 });
    await host.click('[data-action="online-host"]');
    await host.waitForFunction(() => window.app.online?.code, null, { timeout: 60000 });
    // Host waiting room carries a copyable invite link with the code.
    const link = await host.locator('#invite-link').inputValue();
    const code = await host.evaluate(() => window.app.online.code);
    expect(link).toContain(code);
    // Stranger with no account opens the link: guest prompt, instant unrated game.
    const guest = await browser.newPage({ viewport: vp });
    await guest.goto(`index.html#play-${code}`);
    await guest.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await guest.evaluate(() => window.app.showOnline());
    await guest.waitForSelector('[data-action="online-invite-guest"]', { timeout: 15000 });
    await guest.click('[data-action="online-invite-guest"]');
    await guest.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 120000 });
    await host.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 120000 });
    const gst = await guest.evaluate(() => ({
        uid: window.app.userId,
        oppId: window.app.online.opp?.id,
        unrated: window.app._onlineUnrated(window.app.online.opp),
        color: window.app.online.myColor,
    }));
    expect(gst.uid).toBe(null);
    expect(gst.oppId).toBe('inv_host');
    expect(gst.unrated).toBe(true);
    const hst = await host.evaluate(() => ({
        oppId: window.app.online.opp?.id,
        unrated: window.app._onlineUnrated(window.app.online.opp),
        color: window.app.online.myColor,
    }));
    expect(hst.oppId).toBe('guest');
    expect(hst.unrated).toBe(true);
    expect(gst.color).not.toBe(hst.color);
    await host.close();
    await guest.close();
});

test('invite link: second joiner is turned away, room stays 1v1', async ({ browser }) => {
    test.setTimeout(180000);
    const vp = { width: 1280, height: 800 };
    const host = await mkPage(browser, vp, 'full_h', 'FullH');
    const A = await mkPage(browser, vp, 'full_a', 'FullA');
    const B = await mkPage(browser, vp, 'full_b', 'FullB');
    await host.evaluate(() => window.app.showOnline());
    await host.waitForSelector('[data-action="online-host"]', { timeout: 20000 });
    await host.click('[data-action="online-host"]');
    await host.waitForFunction(() => window.app.online?.code, null, { timeout: 60000 });
    const code = await host.evaluate(() => window.app.online.code);
    for (const P of [A, B]) await P.evaluate(() => window.app.showOnline());
    await A.fill('#join-code', code);
    await A.click('.join-row button');
    await A.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 120000 });
    await B.fill('#join-code', code);
    await B.click('.join-row button');
    await expect(B.locator('#online-lobby-status')).toContainText(/already full/, { timeout: 30000 });
    // Host still plays A, not B.
    expect(await host.evaluate(() => window.app.online.opp?.id)).toBe('full_a');
    expect(await host.evaluate(() => window.app.online?.phase)).toBe('play');
    await host.close();
    await A.close();
    await B.close();
});

test('lobby polish: rail auth, quick-first order, waiting motion, overlay clock', async ({ browser }) => {
    test.setTimeout(120000);
    const page = await mkPage(browser, { width: 1440, height: 900 }, 'pol_a', 'PolishA');
    await page.evaluate(() => window.app.showOnline());
    await page.waitForSelector('[data-action="online-quick"]', { timeout: 20000 });
    // Rail carries a visible sign-in entry on desktop (header is hidden).
    await expect(page.locator('#sn-auth')).toBeVisible();
    expect(await page.locator('#sn-auth .sn-auth-label').textContent()).toMatch(/Sign in|PolishA/);
    // Quick match sits above Time control.
    const order = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.online-lobby > *')].map((e) => e.className);
      return [items.findIndex((c) => c.includes('qm-section')), items.findIndex((e, i, a) => document.querySelectorAll('.online-lobby > *')[i].textContent.includes('Time control'))];
    });
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[1]).toBeGreaterThan(order[0]);
    // Rail active tab keeps its pill (gradient bg + dark text) while hovered.
    await page.click('#side-nav [data-nav="online"]');
    await page.waitForTimeout(400);
    const pill = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('#side-nav [data-nav="online"]'));
      return { bg: cs.backgroundImage.slice(0, 30), color: cs.color };
    });
    expect(pill.bg).toContain('gradient');
    expect(pill.color).toBe('rgb(26, 26, 20)');
    // Overlay uses the clock visual with motion.
    await page.click('[data-action="online-quick"]');
    await expect(page.locator('#qm-overlay .qm-clock .qm-min')).toBeVisible();
    await page.click('#qm-overlay [data-action="qm-cancel"]');
    await page.waitForSelector('[data-action="online-quick"]', { timeout: 10000 });
    // Hosted waiting room shares the motion language + canonical link.
    await page.click('[data-action="online-host"]');
    await page.waitForSelector('#invite-link', { timeout: 60000 });
    await expect(page.locator('.waiting-card .qm-radar')).toBeVisible();
    expect(await page.locator('#invite-link').inputValue()).toMatch(/^https:\/\/mouadhhhallem\.github\.io\/dochess\/index\.html#play-[A-Z0-9]{6}$/);
    await page.close();
});

test('pc game: names and board all inside the viewport', async ({ browser }) => {
    test.setTimeout(180000);
    const vp = { width: 1440, height: 900 };
    const A = await mkPage(browser, vp, 'fit_a', 'FitA');
    const B = await mkPage(browser, vp, 'fit_b', 'FitB');
    for (const P of [A, B]) await P.evaluate(() => window.app.showOnline());
    await A.click('[data-action="online-quick"]');
    await B.click('[data-action="online-quick"]');
    await A.waitForFunction(() => window.app.online?.phase === 'play', null, { timeout: 120000 });
    await A.waitForTimeout(600);
    const g = await A.evaluate(() => {
      const r = (s) => { const el = document.querySelector(s); const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom) }; };
      return { opp: r('#oprofile-opp'), board: r('#online-board-wrapper'), you: r('#oprofile-you'), H: window.innerHeight };
    });
    expect(g.opp.t).toBeGreaterThanOrEqual(0);
    expect(g.board.b).toBeLessThanOrEqual(g.H);
    expect(g.you.b).toBeLessThanOrEqual(g.H);
    await A.close();
    await B.close();
});

test('quick match: server queue cancel leaves queue, back to lobby', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext({ baseURL: origin });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => {
        localStorage.clear();
        window.app._clerk = { user: { id: 'qm_api', fullName: 'Api' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser('qm_api');
    });
    let left = 0;
    await page.route('**/api/mm/join', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ticket: 'T1' }) }));
    await page.route('**/api/mm/poll*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'waiting', position: 1, waiters: 1, minGap: null }) }));
    await page.route('**/api/mm/leave', (r) => { left++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
    await page.evaluate(() => window.app.showOnline());
    await page.waitForSelector('[data-action="online-quick"]', { timeout: 20000 });
    await page.click('[data-action="online-quick"]');
    await expect(page.locator('#qm-overlay')).toBeVisible();
    await expect(page.locator('#qm-status')).toContainText(/queue/i, { timeout: 15000 });
    await page.click('#qm-overlay [data-action="qm-cancel"]');
    await page.waitForSelector('[data-action="online-quick"]', { timeout: 10000 });
    expect(await page.evaluate(() => window.app._qm)).toBe(null);
    expect(left).toBe(1);
    await ctx.close();
});

test('quick match: server queue match as host opens the room', async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext({ baseURL: origin });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => {
        localStorage.clear();
        window.app._clerk = { user: { id: 'qm_api2', fullName: 'Api2' }, openSignIn() {}, signOut() {}, addListener() {}, mountUserButton() {} };
        window.app._setUser('qm_api2');
    });
    let polls = 0;
    await page.route('**/api/mm/join', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ticket: 'T1' }) }));
    await page.route('**/api/mm/poll*', (r) => {
        polls++;
        const body = polls < 2
            ? { ok: true, status: 'waiting', position: 1, waiters: 1, minGap: null }
            : { ok: true, status: 'matched', code: 'QMKXQ1', role: 'host', opp: { name: 'Rival', elo: 900 }, cat: 'blitz', gap: 88 };
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.evaluate(() => window.app.showOnline());
    await page.waitForSelector('[data-action="online-quick"]', { timeout: 20000 });
    await page.click('[data-action="online-quick"]');
    await expect(page.locator('#qm-overlay')).toBeVisible();
    // Host role opens the assigned room on the real broker.
    await page.waitForFunction(() => window.app.online?.code === 'QMKXQ1' && window.app.online?.role === 'host', null, { timeout: 60000 });
    expect(await page.locator('#qm-status').textContent()).toMatch(/Rival/);
    await ctx.close();
});
