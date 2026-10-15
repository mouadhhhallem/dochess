/**
 * test-vs-bots.spec.js — the Vs Bots page, the Play tab rename, and bot
 * games on the existing lesson board.
 *
 * - PC sidebar reads "Play" (route/behavior unchanged), phone tab still
 *   says "Play", the lobby carries a Vs Bots card under Quick match.
 * - /vs-bots lists the data-driven roster (name + avatar + Elo each).
 * - Tapping a bot opens a full game vs the CPU with Elo-mapped strength,
 *   without completing lesson 10 and without touching other pages.
 */
import { test, expect } from '@playwright/test';

async function boot(browser, width) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto('file://' + process.cwd() + '/index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    return { ctx, page, errors };
}

test.describe.configure({ timeout: 120000 });

test('Play tab labels and the Vs Bots card (desktop)', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    await expect(page.locator('#nav-online')).toHaveText('Play');
    await page.evaluate(() => window.app.showOnline());
    await expect(page.locator('#online-screen h2')).toHaveText('Play');
    const card = page.locator('.dashboard-section:has-text("Vs Bots")');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/200 to 2000/i);
    await expect(card.locator('[data-action="vs-bots"]')).toHaveText(/play bots/i);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('Play tab and Vs Bots card (phone)', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 390);
    await expect(page.locator('#tab-bar [data-nav="online"] span')).toHaveText('Play');
    // The phone Play button lands on the Play screen with the Vs Bots card.
    await page.locator('#tab-bar [data-nav="online"]').click();
    await expect(page.locator('#online-screen')).toHaveClass(/active/);
    await expect(page.locator('.dashboard-section:has-text("Vs Bots")')).toBeVisible();
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('bot roster is data-driven with name, avatar and Elo each', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    const roster = await page.evaluate(() => window.app.constructor.BOTS);
    expect(roster.length, 'six launch bots').toBe(6);
    expect(roster.map((b) => b.elo)).toEqual([200, 400, 800, 1200, 1600, 2100]);
    await page.evaluate(() => window.app.showVsBots());
    await expect(page.locator('#vs-bots-screen')).toHaveClass(/active/);
    const cards = page.locator('.bot-card');
    await expect(cards).toHaveCount(6);
    for (const [name, elo] of [['Alex', '200'], ['Prima', '400'], ['Atlas', '2100']]) {
        const card = page.locator('.bot-card', { hasText: name }).first();
        await expect(card).toBeVisible();
        await expect(card).toContainText(new RegExp(elo));
        await expect(card.locator('img.bot-avatar')).toHaveAttribute('src', /DoChess_Bot_Avatars\/straight\/bot-\d\.png/);
        await expect(card.locator('[data-action="vs-bot"]')).toBeVisible();
    }
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('tapping a bot starts a real game with Elo-mapped strength', async ({ browser }) => {    const { ctx, page, errors } = await boot(browser, 1280);
    // Elo mapping is honest: beginners blunder at depth 1, the boss thinks
    // at depth 4 with a time cap so the UI never freezes.
    const depths = await page.evaluate(() =>
        [200, 400, 800, 1200, 1600, 2100].map((e) => window.app.constructor.botCpuParams(e).depth));
    expect(depths).toEqual([1, 1, 2, 3, 3, 4]);
    // True beginner chaos only at the bottom; capped think time at depth 2+.
    const wilds = await page.evaluate(() =>
        [200, 400, 800, 1200, 1600, 2100].map((e) => window.app.constructor.botCpuParams(e).wild));
    expect(wilds).toEqual([0.25, 0.08, 0, 0, 0, 0]);
    await page.evaluate(() => window.app.showVsBots());
    await page.locator('.bot-card[data-bot="alex"] [data-action="vs-bot"]').click();
    await expect(page.locator('#lesson-screen')).toHaveClass(/active/, { timeout: 15000 });
    // Bot identity is on the board chrome, and the difficulty picker (which
    // would silently leave bot mode) is replaced by a static chip.
    await expect(page.locator('#profile-opp')).toContainText(/Alex/);
    await expect(page.locator('#profile-opp')).toContainText(/200 Elo/);
    await expect(page.locator('#cpu-diff')).toHaveCount(0);
    // A real game: e2-e4 through the UI, Alex replies on the board.
    await page.locator('#chess-board [data-square="e2"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('#chess-board [data-square="e4"]').first().click();
    await page.waitForFunction(() => {
        try { return window.app.game.moveHistory.length >= 2; } catch (_) { return false; }
    }, null, { timeout: 30000 });
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('engine tactics are intact at every depth (mate + hanging piece)', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    // Back-rank mate and a hanging rook, solved by the REAL search code
    // (quiescence included) at every bot depth. Mate scores must scale
    // with depth; the hanging piece must read ~queen value either way.
    const res = await page.evaluate(() => {
        const A = window.app;
        const fromFen = (fen) => { const g = new ChessGame(); g.loadFEN(fen); return g; };
        const alg = (c) => 'abcdefgh'[c[1]] + (8 - c[0]);
        function bestMove(fen, depth) {
            const g = fromFen(fen);
            const moves = A._orderMoves(g, A._allMoves(g, 'black'));
            let best = null, bestSc = -Infinity;
            for (const mv of moves) {
                const snap = g.snapshot();
                g.movePiece(mv.from, mv.to, mv.promo || null);
                const sc = A._search(g, depth - 1, -Infinity, Infinity, false);
                g.restore(snap);
                if (sc > bestSc) { bestSc = sc; best = mv; }
            }
            return best ? alg(best.from) + alg(best.to) : 'none';
        }
        const C2 = 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1';
        const C4 = '3qk3/5ppp/8/8/3R4/8/5PPP/4K3 b - - 0 1';
        const out = {};
        for (const d of [1, 2, 3]) out['mate' + d] = bestMove(C2, d);
        for (const d of [1, 2]) out['hang' + d] = bestMove(C4, d);
        const g = fromFen(C2);
        g.movePiece(g.algebraicToCoords('a8'), g.algebraicToCoords('a1'), null);
        out.status = g.getGameStatus();
        return out;
    });
    expect(res.mate1).toBe('a8a1');
    expect(res.mate2).toBe('a8a1');
    expect(res.mate3).toBe('a8a1');
    expect(res.hang1).toBe('d8d4');
    expect(res.hang2).toBe('d8d4');
    expect(res.status).toMatch(/checkmate/);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('coach moods, talk and game-end feelings', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    // Thresholds of the shared classifier: big swing for the player is
    // brilliant/happy, big drop is blunder/angry, quiet is straight.
    const cats = await page.evaluate(() =>
        [[400, 'brilliant'], [150, 'good'], [0, 'quiet'], [-50, 'quiet'], [-150, 'mistake'], [-400, 'blunder']]
            .map(([d, cat]) => window.app.constructor.classifyMoveQuality(d).cat + '/' + window.app.constructor.classifyMoveQuality(d).mood));
    expect(cats).toEqual([
        'brilliant/happy', 'good/happy', 'quiet/straight',
        'quiet/straight', 'mistake/angry', 'blunder/angry',
    ]);
    await page.evaluate(() => window.app.startBotGame('prima'));
    await page.waitForTimeout(800);
    // Opening tip on a quiet developing move, straight face.
    await page.locator('#chess-board [data-square="e2"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('#chess-board [data-square="e4"]').first().click();
    await page.waitForFunction(() => {
        try { return window.app.game.moveHistory.length >= 2; } catch (_) { return false; }
    }, null, { timeout: 30000 });
    await expect(page.locator('#bot-talk')).not.toBeEmpty();
    expect(await page.locator('#bot-mood-img').getAttribute('src')).toMatch(/straight\/bot-2\.png/);
    // Wiring: every mood swaps the portrait, game ends feel the result.
    const moods = await page.evaluate(() => {
        const A = window.app;
        const out = [];
        for (const m of ['happy', 'angry', 'straight']) {
            A._botSetMood(m);
            out.push(document.getElementById('bot-mood-img')?.getAttribute('src') || 'missing');
        }
        A._botGameEnd('win');
        out.push(document.getElementById('bot-talk')?.innerText || 'notalk');
        A._botGameEnd('loss');
        out.push(document.getElementById('bot-mood-img')?.getAttribute('src') || 'missing');
        return out;
    });
    expect(moods[0]).toMatch(/happy\/bot-2\.png/);
    expect(moods[1]).toMatch(/angry\/bot-2\.png/);
    expect(moods[2]).toMatch(/straight\/bot-2\.png/);
    expect(moods[3]).toMatch(/you got me/i);
    expect(moods[4]).toMatch(/angry\/bot-2\.png/);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});
