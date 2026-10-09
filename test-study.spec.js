import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

// DoChess Study suite. UI/tree/persistence/parser tests run on file://
// (the supported offline path). Live-engine tests need http (browsers
// cannot construct Workers from file:// pages), so this file starts a
// tiny static server for them and skips those tests if it cannot.
const PORT = 8931;
let server = null;

async function httpUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
    return res.ok;
  } catch (_) { return false; }
}

test.beforeAll(async () => {
  if (await httpUp()) return;
  try {
    server = spawn('python', ['-m', 'http.server', String(PORT)], { cwd: process.cwd() });
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await httpUp()) return;
    }
    try { server.kill(); } catch (_) {}
    server = null;
  } catch (_) { server = null; }
});

test.afterAll(async () => {
  try { server && server.kill(); } catch (_) {}
});

const studyUrl = () => `http://127.0.0.1:${PORT}/index.html`;

test('study nav, library, board moves, variations, keyboard', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  await page.click('#nav-study');
  await expect(page.locator('#study-screen')).toBeVisible();
  await expect(page.locator('#nav-study')).toHaveClass(/active/);

  // Create a study + chapter via dialogs.
  await page.click('.st-new');
  await page.fill('#st-dlg-input', 'Suite Study');
  await page.click('[data-st="study-create"]');
  await expect(page.locator('.st-ctitle h3')).toContainText('Suite Study');
  await expect(page.locator('#st-board .chess-square')).toHaveCount(64);

  // Play 1.e4 e5 with real mouse clicks on square centers.
  async function sq(alg) {
    const box = await page.locator(`#st-board [data-square="${alg}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await sq('e2'); await sq('e4');
  await sq('e7'); await sq('e5');
  await expect(page.locator('#st-moves')).toContainText('e4');
  await expect(page.locator('#st-moves')).toContainText('e5');

  // Branch a variation: step back (Black to move) and answer 1...c5.
  await page.click('[data-st="nav"][data-where="prev"]');
  await sq('c7'); await sq('c5');
  await expect(page.locator('#st-moves')).toContainText('c5');

  // Keyboard: End jumps to latest, ArrowLeft steps back.
  await page.keyboard.press('End');
  await expect(page.locator('#st-poscount')).toContainText('half-moves');
  await page.keyboard.press('ArrowLeft');
  const count = await page.locator('#st-poscount').textContent();
  expect(count).toMatch(/Move 1/);

  // Flip rotates the board 180°: h1 lands top-left, a8 bottom-right.
  await page.click('[data-st="flip"]');
  expect(await page.locator('#st-board > div').first().getAttribute('data-square')).toBe('h1');
  expect(await page.locator('#st-board > div').last().getAttribute('data-square')).toBe('a8');
  await page.click('[data-st="flip"]');

  // PGN export copies real movetext (mainline + variation). The button is
  // exercised; content is asserted through the export function because
  // headless clipboard access is unreliable (the app falls back to
  // execCommand there, which is also covered by manual verification).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('[data-st="pgn-copy"]');
  const clip = await page.evaluate(() => window.DoChessStudy._t.currentPgn());
  expect(clip).toMatch(/1\. e4 \(1\.\.\. c5\) e5/); // variation spliced at the right spot
  expect(clip).toMatch(/\[Result "\*"\]/);
});

test('study PGN import/export round-trip with comments, NAGs, variations', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  await page.click('#nav-study');
  await page.click('.st-new');
  await page.fill('#st-dlg-input', 'Import');
  await page.click('[data-st="study-create"]');
  await page.click('[data-st="import-open"]');
  await page.fill('#st-import-text', '[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 {kings pawn} e5 2. Qh5?! (2. Nf3 Nc6) 2... Nc6 3. Bc4 Nf6?? 4. Qxf7# 1-0');
  await page.click('[data-st="import-pgn"]');
  const moves = await page.locator('#st-moves').textContent();
  expect(moves.replace(/\s+/g, ' ')).toMatch(/Qh5/);
  expect(moves).toMatch(/Nf3/); // variation preserved, not stripped
  // Illegal PGN is rejected with a message, nothing imported silently.
  await page.click('[data-st="import-open"]');
  await page.fill('#st-import-text', 'Kd3');
  await page.click('[data-st="import-pgn"]');
  await expect(page.locator('.st-dlg-wide .feedback.error')).toContainText(/No legal moves|Illegal move/);
  await page.click('[data-st="dlg-close"]'); // error keeps dialog open; close it
  // Invalid FEN is rejected honestly.
  await page.fill('#st-fen', 'bogus');
  await page.click('[data-st="fen-load"]');
  await expect(page.locator('#st-toast')).toContainText(/not a legal position/);
});

test('study persistence across reload', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  await page.click('#nav-study');
  await page.click('.st-new');
  await page.fill('#st-dlg-input', 'PersistMe');
  await page.click('[data-st="study-create"]');
  async function sq(alg) {
    const box = await page.locator(`#st-board [data-square="${alg}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await sq('e2'); await sq('e4');
  await page.waitForTimeout(600); // debounced save flush
  await page.reload();
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  await page.click('#nav-study');
  await expect(page.locator('.st-ctitle h3')).toContainText('PersistMe');
  await expect(page.locator('#st-moves')).toContainText('e4');
});

test('study parser + classifier units (no engine needed)', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.DoChessStudy, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const T = window.DoChessStudy._t;
    const parsed = T.parsePgnText('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 $1 1-0');
    const mainSans = parsed.root ? (function walk(n, acc) { if (n.san) acc.push(n.san); if (n.children[0]) walk(n.children[0], acc); return acc; })(parsed.root, []) : [];
    const cls = [
      T.classifyMove({ cp: 30, mate: null, engine: 'x' }, { cp: 25, mate: null, engine: 'x' }, { mover: 'w' }),
      T.classifyMove({ cp: 30, mate: null, engine: 'x' }, { cp: -400, mate: null, engine: 'x' }, { mover: 'w' }),
      T.classifyMove({ cp: null, mate: 3, engine: 'x' }, { cp: -50, mate: null, engine: 'x' }, { mover: 'w' }),
      T.classifyMove({ cp: 30, mate: null, engine: 'x' }, { cp: 25, mate: null, engine: 'y' }, { mover: 'w' }),
      T.evalWords({ type: 'mate', v: -4 }, 'b'),
      T.fmtScore({ type: 'cp', v: 135 })
    ];
    return {
      count: parsed.count,
      varSans: parsed.root && parsed.root.children[0] && parsed.root.children[0].children[1] ? parsed.root.children[0].children[1].san : null,
      nag: parsed.root && (function find(n) { if (n.nag) return n.nag; for (const c of n.children) { const r = find(c); if (r) return r; } return null; })(parsed.root),
      mainSans,
      cls: cls.map(c => c && c.label),
      mateWords: cls[4],
      score: cls[5]
    };
  });
  expect(r.count).toBe(5); // e4 e5 + variation c5/Nf3 + mainline Nf3
  expect(r.varSans).toBe('c5');
  expect(r.nag).toBe(1);
  expect(r.mainSans.join(' ')).toBe('e4 e5 Nf3');
  expect(r.cls[0]).toBe('Best');
  expect(r.cls[1]).toBe('Blunder');
  expect(r.cls[2]).toBe('Blunder'); // lost a forced mate
  expect(r.cls[3]).toBeNull(); // mixed engines never classify
  expect(r.mateWords).toBe('Black mates in 4');
  expect(r.score).toBe('+1.4');
});

test('profile history game opens in Study with exact moves', async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  // Seed one genuinely stored game (same save path live games use).
  await page.evaluate(() => {
    const eng = new ChessGame(); eng.reset();
    [['e2', 'e4'], ['e7', 'e6']].forEach(([f, t]) => eng.movePiece(eng.algebraicToCoords(f), eng.algebraicToCoords(t)));
    OnlineStore.saveGame({
      gameId: 'g_hist1', code: 'ABCDEF', control: { id: 'bullet', base: 60000, inc: 0 },
      role: 'host', myColor: 'white', opp: { id: 'u_m', name: 'Mouadh', img: null, rating: 700 },
      moves: eng.moveHistory.map(m => ({ from: m.from, to: m.to, promo: m.promotion || null })),
      clocks: { w: 59000, b: 60000, side: 'black' }, result: 'win', reason: 'timeout'
    });
    OnlineRatings.pushHistory('u_h', { gameId: 'g_hist1', control: { id: 'bullet', base: 60000, inc: 0 }, opp: 'Mouadh', result: 'win', plies: 2, delta: 20 });
    window.app._clerk = { user: { id: 'u_h', fullName: 'H', username: 'h', primaryEmailAddress: { emailAddress: 'h@x.io' }, imageUrl: null, createdAt: Date.now() } };
    window.app._setUser('u_h');
    window.app.showProfile();
  });
  await page.click('.dc-hist-list .dc-hist');
  await expect(page.locator('#dc-review')).toBeVisible();
  await page.click('[data-action="hist-to-study"]');
  await expect(page.locator('#study-screen')).toBeVisible();
  await expect(page.locator('.st-ctitle h3')).toContainText('My games');
  await expect(page.locator('#st-moves')).toContainText('e4');
  await expect(page.locator('#st-moves')).toContainText('e6');
});

test('live Stockfish analysis over http (skipped if no server)', async ({ page }) => {
  test.skip(!(await httpUp()), 'static server unavailable — Stockfish needs http, not file://');
  await page.goto(studyUrl());
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  await page.click('#nav-study');
  await page.click('.st-new');
  await page.fill('#st-dlg-input', 'EngineLive');
  await page.click('[data-st="study-create"]');
  // Genuine engine handshake: real depth line, real bestmove, real MultiPV.
  await page.waitForFunction(() => /Stockfish.*Connected/.test(document.querySelector('.st-engstatus')?.textContent || ''), null, { timeout: 90000 });
  await page.waitForFunction(() => /Depth (1[2-9]|20)\b/.test(document.querySelector('.st-evalmeta')?.textContent || ''), null, { timeout: 120000 });
  const meta = await page.locator('.st-evalmeta').textContent();
  expect(meta).toMatch(/Depth (1[2-9]|20)/); // finished search at configured depth
  expect(await page.locator('.st-evalnum').textContent()).toMatch(/([+-]\d+\.\d|M\d+|\+M\d+)/);
  expect(await page.locator('.st-cand').count()).toBeGreaterThanOrEqual(1);
  const pv = await page.locator('.st-pv').textContent();
  expect(pv.trim().length).toBeGreaterThan(2);
});

test('study falls back honestly on file:// (no fake engine)', async ({ page }) => {
  await page.goto('index.html'); // file://: workers cannot construct
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  await page.click('#nav-study');
  await page.click('.st-new');
  await page.fill('#st-dlg-input', 'Offline');
  await page.click('[data-st="study-create"]');
  await page.waitForFunction(() => /Local engine/.test(document.querySelector('.st-engstatus')?.textContent || ''), null, { timeout: 30000 });
  // Local fallback still measures: depth shown, score formatted, no fantasy.
  await page.waitForFunction(() => /Depth 2/.test(document.querySelector('.st-evalmeta')?.textContent || ''), null, { timeout: 30000 });
  expect(await page.locator('.st-evalnum').textContent()).toMatch(/([+-]?\d+\.\d|–)/);
});

test('study mobile layout has no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('index.html');
  await page.waitForFunction(() => !!window.app && !!window.DoChessStudy, null, { timeout: 15000 });
  await page.click('#menu-btn'); // hamburger on small screens
  await page.click('#nav-study');
  await expect(page.locator('.st-mobiletabs')).toBeVisible();
  await page.click('[data-st="mtab"][data-t="library"]');
  await expect(page.locator('.st-left')).toBeVisible();
  await page.click('[data-st="mtab"][data-t="engine"]');
  await expect(page.locator('.st-right')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
