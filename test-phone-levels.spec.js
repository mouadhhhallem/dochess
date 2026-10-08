import { test, expect } from '@playwright/test';

// Phone behaviour that regressed more than once and is invisible on desktop:
//   1. touch drag-and-drop on the Learn board (silently dead with a finger),
//   2. "next stage" reachable without scrolling,
//   3. the achievement stars visible above the board.
// Real touch input goes through CDP Input.dispatchTouchEvent — synthesised
// PointerEvents do NOT reproduce the browser's touch-action arbitration, so
// they would happily pass while a real finger still failed.

async function phonePage(browser) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const box = async (sq) => page.locator(`#play-board .chess-square[data-square="${sq}"]`).boundingBox();
    const touch = async (type, pts) => {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    };
    const drag = async (from, to) => {
        const a = await box(from), c = await box(to);
        const x0 = a.x + a.width / 2, y0 = a.y + a.height / 2;
        const x1 = c.x + c.width / 2, y1 = c.y + c.height / 2;
        await touch('touchStart', [{ x: x0, y: y0 }]);
        for (let i = 1; i <= 10; i++) {
            await touch('touchMove', [{ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10 }]);
            await page.waitForTimeout(16);
        }
        await touch('touchEnd', []);
        await page.waitForTimeout(300);
    };
    return { ctx, page, box, touch, drag };
}

test.describe.configure({ timeout: 120000 });

test('phone: a finger can drag a piece on the Learn board', async ({ browser }) => {
    const { ctx, page, box, touch, drag } = await phonePage(browser);
    await page.goto('index.html?level=s1r-1');
    await page.locator('#play-board-wrap').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);

    // A tap must still just select (no accidental move, no swallowed tap).
    const a1 = await box('a1');
    await touch('touchStart', [{ x: a1.x + a1.width / 2, y: a1.y + a1.height / 2 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(250);
    expect(await page.locator('#play-board .legal-dot, #play-board .legal-ring').count()).toBeGreaterThan(0);
    expect(await page.locator('#mv').textContent()).toBe('0');

    await drag('a1', 'a4');
    expect(await page.locator('#mv').textContent()).toBe('1');
    await drag('a4', 'b4');
    expect(await page.locator('#mv').textContent()).toBe('2');

    // No orphaned ghost, and the drag must not have eaten the level.
    expect(await page.evaluate(() => document.querySelectorAll('.drag-ghost').length)).toBe(0);
    await ctx.close();
});

test('phone: page still scrolls when a swipe starts on an empty square', async ({ browser }) => {
    const { ctx, page, box, touch } = await phonePage(browser);
    await page.goto('index.html?level=s1r-1');
    await page.locator('#play-board-wrap').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const before = await page.evaluate(() => window.scrollY);
    const e4 = await box('e4');
    await touch('touchStart', [{ x: e4.x + e4.width / 2, y: e4.y + e4.height / 2 }]);
    for (let i = 1; i <= 8; i++) {
        await touch('touchMove', [{ x: e4.x + e4.width / 2, y: e4.y + e4.height / 2 - 20 * i }]);
        await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).not.toBe(before);
    await ctx.close();
});

test('phone: next stage is on screen without scrolling (Learn)', async ({ browser }) => {
    const { ctx, page } = await phonePage(browser);
    await page.goto('index.html?level=s1r-1');
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);

    const next = page.locator('#lv-sticky-next');
    await expect(next).toBeVisible();
    const r = await next.boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    expect(r.y, 'sticky Next must be inside the first viewport').toBeGreaterThanOrEqual(0);
    expect(r.y + r.height).toBeLessThanOrEqual(vh);

    // And it must actually work from there.
    await next.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#lv-title')).toHaveText('Rook: change direction');
    await ctx.close();
});

test('phone: achievement stars sit above the board and stay visible', async ({ browser }) => {
    const { ctx, page } = await phonePage(browser);
    await page.goto('index.html?level=s1r-1');
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);

    const strip = page.locator('#lv-achieve');
    const board = page.locator('#play-board');
    const sr = await strip.boundingBox();
    const br = await board.boundingBox();
    expect(sr.y + sr.height, 'strip must be above the board').toBeLessThanOrEqual(br.y);
    // The board itself must be reachable without scrolling away.
    expect(br.y + br.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight) + 40);

    for (const [f, t] of [['a1', 'a4'], ['a4', 'a6'], ['a6', 'a8']]) {
        await page.click(`#play-board .chess-square[data-square="${f}"]`);
        await page.click(`#play-board .chess-square[data-square="${t}"]`);
        await page.waitForTimeout(150);
    }
    await expect(page.locator('#lv-achieve-stars')).toHaveText('★★★');
    await expect(strip).toHaveClass(/scored/);
    await expect(strip).toContainText('100 pts');
    await ctx.close();
});

test('phone: focus mode maximises the board and stays playable (Learn)', async ({ browser }) => {
    const { ctx, page } = await phonePage(browser);
    await page.goto('index.html?level=s1r-1');
    await page.waitForTimeout(900);

    const panel = page.locator('#lv-you');
    await expect(panel, 'panel must be visible before focusing').toBeVisible();

    await page.click('#lv-focus-toggle');
    await page.waitForTimeout(350);

    // Every panel is gone; the board, its bars and the toggle remain.
    for (const sel of ['.lesson-detail-header', '#lv-goalcard', '#fb-text',
        '#lv-feedback', '.lv-actions', '#lv-you', '.lesson-dashboard']) {
        await expect(page.locator(sel), `${sel} must be hidden in focus mode`).toBeHidden();
    }
    await expect(page.locator('#play-board')).toBeVisible();
    await expect(page.locator('#lv-focus-toggle')).toBeVisible();
    await expect(page.locator('#lv-sticky-next')).toBeVisible();

    // Board fills the viewport and is not clipped.
    const vw = await page.evaluate(() => window.innerWidth);
    const br = await page.locator('#play-board').boundingBox();
    expect(br.width).toBeGreaterThan(vw * 0.85);
    expect(br.y).toBeGreaterThanOrEqual(0);
    expect(br.y + br.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));

    // Still fully playable, and "next" still advances.
    await page.click('#play-board .chess-square[data-square="a1"]');
    await page.click('#play-board .chess-square[data-square="a4"]');
    await page.waitForTimeout(250);
    expect(await page.locator('#mv').textContent()).toBe('1');
    await page.click('#lv-sticky-next');
    await page.waitForTimeout(500);
    await expect(page.locator('#lv-title')).toHaveText('Rook: change direction');

    // Restoring brings the panels back.
    await page.click('#lv-focus-toggle');
    await page.waitForTimeout(350);
    await expect(page.locator('#lv-you')).toBeVisible();
    await expect(page.locator('.lesson-dashboard')).toBeVisible();
    await ctx.close();
});

test('focus mode leaves no dead scroll under the board', async ({ browser }) => {
    // Regression: .screen carries 40px/80px padding + a min-height. A
    // descendant selector (".lv-focus .screen") missed it because
    // .lv-focus is ON the .screen, so the page stayed ~115px taller than the
    // viewport and a scrollable strip survived under a "maximised" board.
    const { ctx, page } = await phonePage(browser);
    await page.goto('index.html?level=s1r-1');
    await page.waitForTimeout(900);
    const before = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(before, 'normal mode scrolls (dashboard present)').toBeGreaterThan(200);

    await page.click('#lv-focus-toggle');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(after, 'focus mode must not leave a scrollable strip').toBeLessThanOrEqual(2);
    await ctx.close();
});

test('focus mode is never a one-way door at any width', async ({ browser }) => {
    // The JS gate and the CSS breakpoints must agree. They disagreed once:
    // widths between the two media queries entered focus mode with the bar
    // hidden, so there was no toggle to restore with — panels gone, no way back.
    for (const vp of [{ width: 720, height: 900 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
        const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: vp.width < 800 });
        const page = await ctx.newPage();
        await page.addInitScript(() => { try { localStorage.setItem('cc:focus', '1'); } catch (e) {} });
        await page.goto('index.html?level=s1r-1');
        await page.waitForTimeout(800);
        const focused = await page.evaluate(() => document.getElementById('learn-screen').classList.contains('lv-focus'));
        if (focused) {
            // Collapsed ⇒ a visible restore control must exist.
            await expect(page.locator('#lv-focus-toggle'), `no way back at ${vp.width}px`).toBeVisible();
        } else {
            // Not collapsed ⇒ the panels are all there.
            await expect(page.locator('#lv-you')).toBeVisible();
        }
        await ctx.close();
    }
});

test('phone: focus mode is remembered and shared with Lessons', async ({ browser }) => {
    const { ctx, page } = await phonePage(browser);
    await page.goto('index.html?level=s1r-1');
    await page.waitForTimeout(900);
    await page.click('#lv-focus-toggle');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => localStorage.getItem('cc:focus'))).toBe('1');

    await page.reload();
    await page.waitForTimeout(1000);
    // aria-expanded must describe reality: collapsed content => false.
    await expect(page.locator('#lv-focus-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#lv-you')).toBeHidden();

    // Lessons honours the same preference.
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.click('#menu-btn');
    await page.click('#nav-lessons');
    await page.waitForTimeout(500);
    await page.click('[data-open-lesson="1"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('#lesson-screen')).toHaveClass(/lv-focus/);
    await expect(page.locator('#profile-you')).toBeHidden();
    await expect(page.locator('#chess-board')).toBeVisible();

    // Switching lessons must not drop the mode.
    await page.evaluate(() => window.app.openLesson(2));
    await page.waitForTimeout(1000);
    await expect(page.locator('#lesson-screen')).toHaveClass(/lv-focus/);
    await ctx.close();
});

test('desktop never collapses, even with the preference on', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('cc:focus', '1'); } catch (e) {} });
    await page.goto('index.html?level=s1r-1');
    await page.waitForTimeout(900);
    await expect(page.locator('#learn-screen')).not.toHaveClass(/lv-focus/);
    await expect(page.locator('#lv-you')).toBeVisible();
    // The toggle lives in the phone-only bar, so it must not be reachable.
    await expect(page.locator('#lv-focus-toggle')).toBeHidden();
    await ctx.close();
});

test('phone: next lesson is on screen without scrolling (Lessons)', async ({ browser }) => {
    const { ctx, page } = await phonePage(browser);
    await page.goto('index.html');
    await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });
    await page.evaluate(() => { window.app.markDone(1); window.app.markDone(2); });
    await page.click('#menu-btn');
    await page.click('#nav-lessons');
    await page.waitForTimeout(500);
    await page.click('[data-open-lesson="1"]');
    await page.waitForTimeout(1100);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);

    const next = page.locator('#next-lesson-sticky');
    await expect(next).toBeVisible();
    const r = await next.boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.height).toBeLessThanOrEqual(vh);

    await next.click();
    await page.waitForTimeout(800);
    await expect(page.locator('#lesson-content .lesson-title h2')).toHaveText('Pawn Movement & Captures');
    await ctx.close();
});