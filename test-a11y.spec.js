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
  await expect(first).toHaveAttribute('tabindex', '0');
  const label = await first.getAttribute('aria-label');
  expect(label).toMatch(/^[a-h][1-8]$/);

  // Keyboard: focus e2 and press Enter — legal hints appear, same as click.
  await page.focus('.chess-square[data-square="e2"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('#chess-board .legal-dot, #chess-board .legal-ring').first()).toBeVisible();

  // Live regions announce feedback without moving focus.
  await expect(page.locator('#lesson-feedback')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#move-log')).toHaveAttribute('role', 'log');
  await expect(page.locator('#speech')).toHaveAttribute('aria-live', 'polite');

  // Mute + flip are icon-only buttons: they must expose accessible names.
  const mute = page.locator('.mute-btn').first();
  await expect(mute).toHaveAttribute('aria-pressed', /true|false/);
  expect(await mute.getAttribute('aria-label')).toMatch(/mute/i);
  const flip = page.locator('button[data-action="flip-board"]');
  await expect(flip).toHaveAttribute('aria-label', 'Flip board');

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
  const dialogOk = await page.evaluate(() => {
    const card = document.getElementById('gameover-card');
    if (!card || card.style.display === 'none') return false;
    if (card.getAttribute('role') !== 'dialog') return false;
    if (card.getAttribute('aria-labelledby') !== 'gameover-title') return false;
    // Reveal: card scrolled into view, focus on the heading (announces result).
    const r = card.getBoundingClientRect();
    const inView = r.top >= 0 && r.bottom <= window.innerHeight;
    const focused = document.activeElement && document.activeElement.id === 'gameover-title';
    return inView && focused;
  });
  expect(dialogOk).toBe(true);
});
