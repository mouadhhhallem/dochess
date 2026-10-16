/**
 * test-render.spec.js — the lesson board renderer never blinks pieces.
 *
 * Regressions covered (all observed live in bot games):
 * - captures must mutate the destination <img> in place (src swap on the
 *   live node keeps the old bitmap painted until the new one decodes);
 *   replacing the node flashes one empty frame per capture.
 * - the move glide must never hide board state: no visibility:hidden tach,
 *   no stray fly clones left behind after landing.
 * - rematch resets the move counter so the first move glides again.
 */
import { test, expect } from '@playwright/test';

async function boot(browser, width) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto('file://' + process.cwd() + '/index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    return { ctx, page, errors };
}

test.describe.configure({ timeout: 120000 });

test('capture reuses the destination node (no blink), alt follows', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    await page.evaluate(() => window.app.startBotGame('nico', { color: 'white' }));
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
        const A = window.app;
        const g = A.game;
        const sq = (s) => document.querySelector(`#chess-board [data-square="${s}"]`);
        for (const [f, t] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['f8', 'c5']]) {
            g.movePiece(g.algebraicToCoords(f), g.algebraicToCoords(t));
        }
        A._draw();
        const dest = sq('f7');
        const before = dest.querySelector('img.chess-piece');
        const beforeSrc = before.getAttribute('src');
        g.movePiece(g.algebraicToCoords('c4'), g.algebraicToCoords('f7'));
        A._draw();
        const after = dest.querySelector('img.chess-piece');
        return {
            sameNode: before === after,
            srcChanged: beforeSrc !== after.getAttribute('src'),
            srcIsWhiteBishop: /white-bishop/.test(after.getAttribute('src')),
            alt: after.getAttribute('alt'),
            fromEmpty: sq('c4').querySelector('img.chess-piece') === null,
        };
    });
    expect(r.sameNode).toBe(true);
    expect(r.srcChanged).toBe(true);
    expect(r.srcIsWhiteBishop).toBe(true);
    expect(r.alt).toMatch(/white bishop/i);
    expect(r.fromEmpty).toBe(true);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('glide leaves no hidden pieces and no stray clones', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    await page.evaluate(() => window.app.startBotGame('nico', { color: 'white' }));
    await page.waitForTimeout(600);
    // A real UI move (animated), then let every timer/settle finish.
    await page.locator('#chess-board [data-square="e2"]').first().click();
    await page.waitForTimeout(250);
    await page.locator('#chess-board [data-square="e4"]').first().click();
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('#chess-board .chess-square img.chess-piece')];
        const clones = [...document.querySelectorAll('#chess-board [data-fly-clone]')];
        return {
            hidden: imgs.filter((i) => i.style.visibility === 'hidden').length,
            clones: clones.length,
            squares: document.querySelectorAll('#chess-board > .chess-square').length,
            pieces: imgs.length,
        };
    });
    expect(r.squares).toBe(64);
    expect(r.hidden).toBe(0);
    expect(r.clones).toBe(0);
    expect(r.pieces).toBeGreaterThan(20);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('rematch resets the glide counter', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    await page.evaluate(() => window.app.startBotGame('nico', { color: 'white' }));
    await page.waitForTimeout(600);
    await page.locator('#chess-board [data-square="e2"]').first().click();
    await page.waitForTimeout(250);
    await page.locator('#chess-board [data-square="e4"]').first().click();
    await page.waitForFunction(() => {
        try { return window.app.game.moveHistory.length >= 2; } catch (_) { return false; }
    }, null, { timeout: 30000 });
    const before = await page.evaluate(() => window.app._drawnMoves);
    expect(before).toBeGreaterThanOrEqual(2);
    await page.evaluate(() => window.app.startBotGame('nico', { color: 'white' }));
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.app._drawnMoves)).toBe(0);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});
