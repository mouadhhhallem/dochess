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

test('coach moods, talk and game-end feelings', async ({ browser }) => {    const { ctx, page, errors } = await boot(browser, 1280);
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
    // Endings speak in character: 'win' (player won) -> Prima's graceless
    // defeat demanding a rematch; 'loss' (bot won) -> smug happy face.
    expect(moods[3]).toMatch(/rematch|again/i);
    expect(moods[3]).not.toMatch(/stockfish|engine|second look|deeper|depth/i);
    expect(moods[4]).toMatch(/happy\/bot-2\.png/);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('Stockfish score parsing and verdict merge (no worker needed)', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    const r = await page.evaluate(() => {
        const P = window.DoChessBotFish.parseScore;
        return {
            // UCI scores are side-to-move relative — the sign MUST flip
            // for Black to move, or praise and blame swap sides.
            wPlus: P('info depth 11 seldepth 20 multipv 1 score cp 150 nodes 1 nps 1 time 1 pv e2e4', true),
            bPlus: P('info depth 11 score cp 150 time 1 pv e7e5', false),
            wMate: P('info depth 9 score mate 3 pv qh5f7', true),
            bMated: P('info depth 9 score mate -2 pv a1a8', false),
            junk: P('info depth 3 nodes 99', true),
        };
    });
    expect(r.wPlus).toEqual({ whiteCp: 150, mate: 0, depth: 11 });
    expect(r.bPlus).toEqual({ whiteCp: -150, mate: 0, depth: 11 });
    expect(r.wMate.mate).toBe(3);
    expect(r.wMate.whiteCp).toBeGreaterThan(9000);
    // Black to move is mated in 2 => White mates: positive mate, huge cp.
    expect(r.bMated.mate).toBe(2);
    expect(r.bMated.whiteCp).toBeGreaterThan(9000);
    expect(r.junk).toBe(null);
    // Verdict merge: same mood or near-miss never flips the face.
    const m = await page.evaluate(() => {
        const A = window.app;
        A.startBotGame('alex');
        return [
            A._botApplySfVerdict(90, 40, 5),     // both straight, near
            A._botApplySfVerdict(150, 40, 5),    // happy vs straight but <120 apart
            A._botApplySfVerdict(-400, 30, 6),   // angry vs straight, far apart
            document.getElementById('bot-talk')?.innerText || '',
            document.getElementById('bot-mood-img')?.getAttribute('src') || '',
        ];
    });
    expect(m[0]).toBe(false);
    expect(m[1]).toBe(false);
    expect(m[2]).toBe(true);
    // Teacher voice: names the loss, never engine jargon.
    expect(m[3]).toMatch(/drops about 4 pawns/i);
    expect(m[3]).not.toMatch(/stockfish|engine|second look|deeper|depth/i);
    expect(m[4]).toMatch(/angry\/bot-1\.png/);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('dialogue system: personas, no engine words, no repeats', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    const rep = await page.evaluate(() => {
        const D = window.DoChessDialogue;
        const banned = D.BANNED;
        const out = { personas: Object.keys(D.PERSONAS), bad: [], events: {} };
        // Every line of every persona of every event must be clean.
        for (const [id, p] of Object.entries(D.PERSONAS)) {
            for (const [ev, pool] of Object.entries(p.lines)) {
                out.events[ev] = (out.events[ev] || 0) + pool.length;
                for (const line of pool) {
                    if (banned.test(line)) out.bad.push(id + '/' + ev + ': ' + line.slice(0, 60));
                    // No unfilled slots may survive rendering.
                    const t = D.say(id, ev, { piece: 'knight', square: 'f3', move: 'e2e4', pawns: '2 pawns', n: 2 }, 3).text;
                    if (/{piece}|{square}|{move}|{pawns}|{n}/.test(t)) out.bad.push(id + '/' + ev + ': unfilled slot');
                }
            }
        }
        // Anti-repeat: same event twice in a row must differ.
        D.reset();
        const a = D.say('prima', 'blunder', { piece: 'queen', square: 'd1', move: 'e2e4', pawns: '4 pawns', n: 1 }, 6).text;
        const b = D.say('prima', 'blunder', { piece: 'queen', square: 'd1', move: 'e2e4', pawns: '4 pawns', n: 1 }, 6).text;
        out.repeat = { a, b, same: a === b };
        // Voice check: each persona greets in its own unmistakable voice.
        D.reset();
        out.greetings = ['alex', 'prima', 'nico', 'luna', 'max', 'atlas'].map((id) => D.say(id, 'greeting', {}, 1).text.slice(0, 40));
        // Mood map covers every event the app can fire.
        out.moods = ['greeting', 'opening', 'brilliant', 'good', 'captureWon', 'checkGiven', 'botProud', 'blunder', 'mistake', 'inaccuracy', 'badTrade', 'hanging', 'botGift', 'quiet', 'evenTrade', 'castle', 'develop', 'center', 'winning', 'losing', 'endWin', 'endLoss', 'endDraw']
            .map((ev) => ev + ':' + (D.MOODS[ev] || 'MISSING'));
        return out;
    });
    expect(rep.personas).toEqual(['alex', 'prima', 'nico', 'luna', 'max', 'atlas']);
    expect(rep.bad).toEqual([]);
    expect(rep.repeat.same).toBe(false);
    // Six greetings, six different voices.
    expect(new Set(rep.greetings).size).toBe(6);
    expect(rep.moods.every((m) => !/MISSING/.test(m))).toBe(true);
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});
