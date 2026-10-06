import { test, expect } from '@playwright/test';

test('Full UI flow of Chess Course', async ({ page }) => {
  // Open the index.html via file URL
  await page.goto('index.html');

  // Verify home screen active
  await expect(page.locator('#home-screen')).toBeVisible();

  // Click Start Learning button
  await page.click('text=Start Learning');

  // Lessons screen should appear
  await expect(page.locator('#lessons-screen')).toBeVisible();

  // Verify 10 lesson cards are rendered
  const lessonCards = page.locator('.lesson-card');
  await expect(lessonCards).toHaveCount(10);

  // First lesson should be unlocked (no .locked class)
  const firstCard = lessonCards.nth(0);
  await expect(firstCard).not.toHaveClass(/locked/);

  // Click the first lesson button (it has text 'Start' initially)
  await firstCard.locator('button', { hasText: 'Start' }).click();

  // Lesson screen should be visible
  await expect(page.locator('#lesson-screen')).toBeVisible();

  // Chess board should have 64 squares
  const squares = page.locator('#chess-board .chess-square');
  await expect(squares).toHaveCount(64);

  // Exercise instruction should be present
  await expect(page.locator('#exercise-instruction')).toBeVisible();

  // Board must be a real 8x8 grid (regression: missing CSS once made it a vertical stack)
  await expect(page.locator('#chess-board')).toHaveCSS('display', 'grid');
  const boardBox = await page.locator('#chess-board').boundingBox();
  // A healthy board is roughly square; the broken layout was >20k px tall
  expect(boardBox.height).toBeLessThan(boardBox.width * 1.5);

  // Complete the first exercise: any pawn move counts (e2 -> e4 here)
  const instruction = await page.textContent('#exercise-instruction');
  if (instruction.includes('white pawn')) {
    // Click on e2 square
    await page.click('.chess-square[data-row="6"][data-col="4"]'); // e2
    // Legal-move hints should appear
    await expect(page.locator('#chess-board .legal-dot, #chess-board .legal-ring').first()).toBeVisible();
    // Click on e4 square
    await page.click('.chess-square[data-row="4"][data-col="4"]'); // e4
    // Exercise auto-checks and shows success feedback
    await expect(page.locator('#lesson-feedback.success')).toContainText('Wonderful', { timeout: 5000 });
  }

  // Feedback must be visible
  const feedback = page.locator('#lesson-feedback');
  await expect(feedback).toBeVisible();

  // Complete lesson (button navigates back after ~1.5s)
  // NOTE: use a strict button selector — text=Complete Lesson would also
  // match the feedback banner ("Click Complete Lesson to continue").
  await page.locator('.lesson-actions .btn-primary').click();
  // Should return to lessons screen
  await expect(page.locator('#lessons-screen')).toBeVisible({ timeout: 10000 });
});
