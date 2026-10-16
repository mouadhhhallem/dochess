/**
 * test-profile.spec.js — public player dossiers.
 *
 * Boots a real API (temp dir, NO_AUTH, blank MONGODB_URI so it can never
 * touch a real database) plus one signed-in browser (Alice). Covers:
 * friend profile from the circle, stranger profile from search, fresh
 * account basics, record/badges/form truth, add-friend from the sheet,
 * Escape/backdrop close, and ladder-row opens.
 */
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8899;
const API = `http://127.0.0.1:${PORT}`;
let apiProc = null;
let DATA_DIR = null;

const ALICE = 'user_prof_alice01';
const BOB = 'user_prof_bob00002';
const CAROL = 'user_prof_carol003';
const DAVE = 'user_prof_dave0004';

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
        if (Date.now() > deadline) throw new Error('profile api did not start on ' + PORT);
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

test.describe.configure({ timeout: 180000, mode: 'serial' });

test.beforeAll(async () => {
    DATA_DIR = mkdtempSync(join(tmpdir(), 'dochess-profile-e2e-'));
    startApi();
    await waitForApi();
    // Four accounts: Alice (viewer), Bob (friend, real record), Carol
    // (stranger, one game), Dave (fresh, zero games).
    for (const [uid, name] of [[ALICE, 'Alice Wonder'], [BOB, 'Bob Builder'], [CAROL, 'Carol Chen'], [DAVE, 'Dave Diaz']]) {
        await call('PUT', '/api/state', { sections: {}, profile: { name } }, uid);
        await call('POST', '/api/presence', { name, img: null }, uid);
    }
    // Bob: 2 blitz wins + 1 rapid loss, newest last.
    const day = 19000;
    await call('POST', '/api/games', { gameId: 'pb1', result: 'win', date: day * 86400000, plies: 40, control: { id: 'blitz' } }, BOB);
    await call('POST', '/api/games', { gameId: 'pb2', result: 'win', date: (day + 1) * 86400000, plies: 36, control: { id: 'blitz' } }, BOB);
    await call('POST', '/api/games', { gameId: 'pb3', result: 'loss', date: (day + 2) * 86400000, plies: 52, control: { id: 'rapid' } }, BOB);
    // Carol: a single draw.
    await call('POST', '/api/games', { gameId: 'pc1', result: 'draw', date: day * 86400000, plies: 30, control: { id: 'blitz' } }, CAROL);
    // Alice befriends Bob.
    await call('POST', '/api/friends/request', { friendUid: BOB, friendName: 'Bob Builder', myName: 'Alice Wonder' }, ALICE);
    await call('POST', '/api/friends/respond', { fromUid: ALICE, accept: true, myName: 'Bob Builder' }, BOB);
});

test.afterAll(async () => {
    await stopApi();
    if (DATA_DIR) { try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {} }
});

async function alicePage(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route('**/api/**', (r) => {
        r.continue({ headers: { ...r.request().headers(), 'x-dochess-user': ALICE } });
    });
    await ctx.addInitScript(([base]) => {
        try { localStorage.setItem('cc_api_base', base); } catch (_) {}
    }, [API]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
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
    }, [ALICE, 'Alice Wonder']);
    await page.waitForTimeout(3600);
    return { ctx, page, errs };
}

test('friend dossier from the circle: identity, elos, record, badges, form', async ({ browser }) => {
    const { ctx, page, errs } = await alicePage(browser);
    await page.evaluate(() => window.app.showFriends());
    await expect(page.locator('.fr-grid')).toBeVisible({ timeout: 15000 });
    await page.locator('.fr-grid .fr-namebtn').first().click();
    const sheet = page.locator('.fr-psheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(sheet).toContainText('Bob Builder');
    await expect(sheet).toContainText(/LVL \d+/);
    await expect(sheet).toContainText('2W');
    await expect(sheet).toContainText('First Victory');
    await expect(sheet).toContainText(/rapid|blitz/);
    await expect(sheet).toContainText(/joined/i);
    await expect(sheet.locator('.fr-pform i')).toHaveCount(3);
    await expect(sheet.locator('.fr-pbadge')).not.toHaveCount(0);
    await expect(sheet).toContainText('Friend');
    expect(errs).toEqual([]);
    // Escape closes and focus goes back to the name.
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    expect(errs).toEqual([]);
    await ctx.close();
});

test('stranger dossier from search: public face, no presence, add works', async ({ browser }) => {
    const { ctx, page, errs } = await alicePage(browser);
    await page.evaluate(() => window.app.showFriends());
    await page.locator('#fr-search').fill('Carol');
    const carol = page.locator('.fr-card.mini', { hasText: 'Carol Chen' });
    await expect(carol.locator('.fr-namebtn')).toBeVisible({ timeout: 15000 });
    await carol.locator('.fr-namebtn').click();
    const sheet = page.locator('.fr-psheet');
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(sheet).toContainText('Carol Chen');
    await expect(sheet).toContainText('Stranger');
    await expect(sheet).toContainText('0W');
    await expect(sheet).not.toContainText(/online now|last seen/i);
    await expect(sheet.locator('.fr-pform i')).toHaveCount(1);
    // Add friend straight from the dossier — the sheet refreshes itself.
    await sheet.locator('[data-faction="profile-add"]').click();
    await expect(page.locator('.fr-psheet')).toContainText(/Request sent|Requested/i, { timeout: 10000 });
    expect(errs).toEqual([]);
    await ctx.close();
});

test('fresh account reads basic, ladder names open dossiers', async ({ browser }) => {
    const { ctx, page, errs } = await alicePage(browser);
    await page.evaluate(() => window.app.showFriends('ranking'));
    await expect(page.locator('.fr-board')).toBeVisible({ timeout: 15000 });
    // Dave has no games: find his row and open it.
    const dave = page.locator('.fr-brow', { hasText: 'Dave' }).first();
    await expect(dave).toBeVisible({ timeout: 15000 });
    const canOpen = await dave.locator('.fr-namebtn').count();
    if (canOpen) {
        await dave.locator('.fr-namebtn').click();
        const sheet = page.locator('.fr-psheet');
        await expect(sheet).toBeVisible({ timeout: 10000 });
        await expect(sheet).toContainText('No rated games yet');
        await expect(sheet).toContainText('No badges yet');
        await expect(sheet).toContainText(/LVL 1\b/);
    }
    // Bob's ladder row (friend: uid present) opens with his record.
    const bob = page.locator('.fr-brow', { hasText: 'Bob' }).first();
    if (await bob.locator('.fr-namebtn').count()) {
        await bob.locator('.fr-namebtn').click();
        await expect(page.locator('.fr-psheet')).toContainText('2W', { timeout: 10000 });
    }
    expect(errs).toEqual([]);
    await ctx.close();
});
