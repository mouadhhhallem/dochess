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
    for (const [name, elo] of [['Alex', '200'], ['Prima', '400'], ['King Crusher', '2100']]) {
        const card = page.locator('.bot-card', { hasText: name }).first();
        await expect(card).toBeVisible();
        await expect(card).toContainText(new RegExp(elo));
        await expect(card.locator('img.bot-avatar')).toHaveAttribute('src', /assets\/pieces\//);
        await expect(card.locator('[data-action="vs-bot"]')).toBeVisible();
    }
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
});

test('tapping a bot starts a real game with Elo-mapped strength', async ({ browser }) => {
    const { ctx, page, errors } = await boot(browser, 1280);
    // Elo mapping is honest: beginners blunder at depth 1, the boss thinks
    // at depth 4 with a time cap so the UI never freezes.
    const depths = await page.evaluate(() =>
        [200, 400, 800, 1200, 1600, 2100].map((e) => window.app.constructor.botCpuParams(e).depth));
    expect(depths).toEqual([1, 2, 2, 3, 4, 4]);
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
