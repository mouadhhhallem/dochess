// Playwright configuration to use system Chrome without downloading bundled browsers
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // dream-canvas-player is an unrelated Vite/Vitest subproject that happens
  // to live in the repo root — its *.test.ts files are not Playwright specs.
  testIgnore: ['**/dream-canvas-player/**', '**/node_modules/**'],
  timeout: 90000,
  // Two workers: the P2P specs each drive two live pages plus the real
  // Clerk/PeerJS CDNs, and four parallel Edge instances OOM the runner.
  workers: 2,
  use: {
    headless: true,
    // Use installed Chrome browser instead of bundled Chromium
    channel: 'msedge', // use Microsoft Edge as Chromium browser
    // For file URLs, we need to allow file access
    bypassCSP: true,
    baseURL: `file://${process.cwd()}/`,
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});