import { test, expect } from '@playwright/test';

// Phase 7 a11y: names, live regions, focus management, keyboard board.
test('a11y: skip link, live regions, named controls, keyboard board', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app, null, { timeout: 15000 });

  // Skip link targets the main content landmark.
  const skip = page.locator('.skip-link');
  await expect(skip).toHaveAttribute('href', '#main-content');
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('#main-nav')).toHaveAttribute('aria-label', 'Primary');

  // Go to lesson 1: board squares are named buttons, operable by keyboard.
  await page.click('text=Start Learning');
  await page.locator('.lesson-card button').first().click();
  await expect(page.locator('#lesson-screen')).toBeVisible();
  const squares = page.locator('#chess-board .chess-square');
  await expect(squares).toHaveCount(64);
  const first = squares.first();
  await expect(first).toHaveAttribute('role', 'button');
  // Roving tabindex: exactly one Tab stop on the board (not 64).
  const tabbed = page.locator('#chess-board .chess-square[tabindex="0"]');
  await expect(tabbed).toHaveCount(1);
  const label = await first.getAttribute('aria-label');
  // Square names carry piece info for screen readers: "a8, black rook".
  // Bare coordinates ("a8") are the legacy minimum — accept both.
  expect(label).toMatch(/^[a-h][1-8](,|$)/);

  // Keyboard: focus e2 and press Enter — legal hints appear, same as click.
  await page.focus('.chess-square[data-square="e2"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#chess-board .legal-dot, #chess-board .legal-ring').first()).toBeVisible();
  // Arrow keys move the roving Tab stop without rebuilding the board.
  const before = await page.evaluate(() => document.querySelectorAll('#chess-board .chess-square').length);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#chess-board .chess-square[tabindex="0"]')).toHaveCount(1);
  const after = await page.evaluate(() => document.querySelectorAll('#chess-board .chess-square').length);
  expect(after).toBe(before);
  const roverNow = await page.locator('#chess-board .chess-square[tabindex="0"]').getAttribute('data-square');
  expect(roverNow).toMatch(/^[a-h][1-8]$/);

  // Live regions announce feedback without moving focus.
  await expect(page.locator('#lesson-feedback')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#move-log')).toHaveAttribute('role', 'log');
  await expect(page.locator('#speech')).toHaveAttribute('aria-live', 'polite');

  // Mute + flip are icon-only buttons: they must expose accessible names.
  // Two Flip controls exist on a lesson (dashboard row + sticky phone bar);
  // the dashboard one is icon-only so it is the one that needs aria-label.
  const mute = page.locator('.mute-btn').first();
  await expect(mute).toHaveAttribute('aria-pressed', /true|false/);
  expect(await mute.getAttribute('aria-label')).toMatch(/mute/i);
  const flip = page.locator('.lesson-actions button[data-action="flip-board"]');
  await expect(flip).toHaveAttribute('aria-label', 'Flip board');
  // The sticky bar is display:none above 860px — drop to a phone width so the
  // control is actually in the accessibility tree before naming it.
  const stickyFlip = page.locator('#lesson-sticky button[data-action="flip-board"]');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(stickyFlip).toBeVisible();
  await expect(stickyFlip).toHaveAccessibleName(/flip/i);
  await page.setViewportSize({ width: 1280, height: 720 });

  // Screen switch moves focus to the new screen (no focus trap on hidden UI).
  await page.locator('#nav-progress').click();
  await expect(page.locator('#progress-screen')).toBeFocused();

  // Game-over card exposes a labelled dialog when a free game ends.
  // Lesson 10 is progression-locked: unlock 1-9 first (same rule as the UI).
  await page.evaluate(() => {
    const app = window.app;
    app.progress.done = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    app._saveProgress();
    app.showLessons();
  });
  await page.locator('.lesson-card button').last().click();
  await expect(page.locator('#lesson-screen')).toBeVisible();
  await page.evaluate(() => {
    const app = window.app;
    app.game.gameOver = true;
    app.game.getGameStatus = () => 'stalemate';
    app._refreshGameOverCard();
  });
  // Reveal scroll is smooth: let it land before measuring.
  await page.waitForTimeout(800);
  const dialogState = await page.evaluate(() => {
    const card = document.getElementById('gameover-card');
    if (!card || card.style.display === 'none') return { ok: false, why: 'hidden' };
    if (card.getAttribute('role') !== 'dialog') return { ok: false, why: 'role' };
    if (card.getAttribute('aria-labelledby') !== 'gameover-title') return { ok: false, why: 'labelledby' };
    // Reveal: card scrolled into view, focus on the heading (announces result).
    // 1px tolerance: fractional layout can land the bottom edge a sub-pixel
    // past the fold without the card actually being cut off.
    const r = card.getBoundingClientRect();
    const inView = r.top >= 0 && r.bottom <= window.innerHeight + 1;
    const focused = document.activeElement && document.activeElement.id === 'gameover-title';
    return { ok: inView && focused, top: r.top, bottom: r.bottom, innerH: window.innerHeight,
             scrollY: window.scrollY, activeId: document.activeElement && document.activeElement.id };
  });
  console.log('dialogState', JSON.stringify(dialogState));
  expect(dialogState.ok).toBe(true);
});
