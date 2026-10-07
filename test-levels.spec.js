import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The Learn screen must work in BOTH shipping contexts:
//   1. file://   — double-clicking index.html (the way the site is used day to
//                  day). ES modules and fetch() are CORS-blocked here, which is
//                  exactly how the levels first went missing.
//   2. http + the real meta CSP (script-src 'self', no bypassCSP) — the inline
//                  <script type="module"> used to be rejected by that CSP, so
//                  levels loaded in tests (bypassCSP:true) but not for users.
// Both are covered here with no external server dependency.
const ROOT = process.cwd();
// Two full 36-level passes (file:// + http) need more than the 90s default.
test.describe.configure({ timeout: 240000 });
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

let server = null;
let origin = null;

test.beforeAll(async () => {
    server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://x');
            const file = path.join(ROOT, decodeURIComponent(url.pathname));
            if (!file.startsWith(ROOT)) throw new Error('outside root');
            const body = await readFile(file);
            res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(body);
        } catch {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('not found');
        }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
});

function watchErrors(page) {
    const pageErrors = [];
    const cspViolations = [];
    // Known and accepted: every file:// document has an opaque origin, and
    // Chrome/Edge refuse to fetch fonts cross-origin, so Inter falls back to
    // the system stack when index.html is double-clicked. Pre-existing, purely
    // cosmetic, and unrelated to the levels — the match is pinned to the font.
    const FILE_FONT_CORS = /Access to font at 'file:\/\/[^']*inter-latin\.woff2' from origin 'null'/;
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
    page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/Content Security Policy/i.test(text)) cspViolations.push(text.slice(0, 160));
        else if (FILE_FONT_CORS.test(text)) return;
        else if (!/ERR_FAILED|Failed to load resource|net::ERR/i.test(text)) pageErrors.push(text.slice(0, 160));
    });
    return { pageErrors, cspViolations };
}

/** Solve every level with the in-page BFS solver through real clicks. */
async function solveAllLevels(page, baseUrl) {
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-lv]')].map((b) => b.dataset.lv));
    expect(ids.length).toBe(36);

    for (const id of ids) {
        await page.goto(`${baseUrl}?level=${id}`);
        await expect(page.locator('#learn-screen')).toHaveClass(/active/);
        // Optimal line from the same BFS the validator uses (chess.js adapter),
        // read through the Solution button (module scope isn't reachable).
        const moves = await page.evaluate(() => {
            document.querySelector('#solve-btn').click();
            return document.querySelector('#solve-text').textContent;
        });
        const m = moves.match(/Shortest \(\d+\): ([a-h1-8qrnb ]+)/);
        expect(m, `${id}: solution text missing (${moves})`).toBeTruthy();
        const ucis = m[1].trim().split(/\s+/).filter((x) => /^[a-h][1-8][a-h][1-8][qrnb]?$/.test(x));
        expect(ucis.length).toBeGreaterThan(0);
        for (const uci of ucis) {
            const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci[4] || null;
            await page.click(`#play-board .chess-square[data-square="${from}"]`);
            await page.click(`#play-board .chess-square[data-square="${to}"]`);
            if (promo) {
                await expect(page.locator('#promo-row')).toBeVisible();
                await page.click(`#promo-row [data-promo="${promo}"]`);
            }
        }
        await expect(page.locator('#r-stars')).toHaveText('★★★', { timeout: 8000 });
        const txt = await page.locator('#r-text').textContent();
        expect(txt).toMatch(/100 pts/);
        console.log(`ok ${id}: ${ucis.join(' ')} — ${txt.split('—')[0].trim()}`);
    }
}

test('file:// — all 36 levels load and solve (double-click index.html)', async ({ page }) => {
    const watch = watchErrors(page);
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.click('#nav-learn');
    await page.waitForFunction(() => !!document.querySelector('[data-lv]'), null, { timeout: 15000 });
    // Unicode must survive the bundle (charset mistakes show as mojibake stars).
    await expect(page.locator('.stars').first()).toHaveText('☆☆☆');

    await solveAllLevels(page, 'index.html');
    expect(watch.cspViolations).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
});

test('http + real CSP — levels render without bypassCSP', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: origin, bypassCSP: false });
    const page = await ctx.newPage();
    const watch = watchErrors(page);

    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.click('#nav-learn');
    await page.waitForFunction(() => !!document.querySelector('[data-lv]'), null, { timeout: 15000 });
    expect(await page.locator('[data-lv]').count()).toBe(36);

    // Deep link straight into a level (what play.html and share links do).
    await page.goto('index.html?level=s1r-1');
    await expect(page.locator('#learn-screen')).toHaveClass(/active/);
    await expect(page.locator('#lv-title')).toHaveText('Rook: straight lines');
    expect(await page.locator('#play-board .chess-square').count()).toBe(64);

    // play.html redirects here; its #learn marker must land on the picker.
    await page.goto('play.html');
    await page.waitForURL(/index\.html/);
    await expect(page.locator('#learn-screen')).toHaveClass(/active/);
    await expect(page.locator('#picker')).toBeVisible();

    expect(watch.cspViolations).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
    await ctx.close();
});
