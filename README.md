# DoChess — Learn Chess Academy

Interactive chess course: 10 lessons (9 guided single-move exercises + 1 free game vs computer) plus 36 free-move **Learn** levels (6 pieces × 6, BFS-verified par), playable offline by double-clicking `index.html`. No server needed — progress persists in browser `localStorage`.

## Run

- Open `index.html` directly in a browser (`file://` works — this is the supported path). Both the lessons and the Learn levels work from `file://`.
- Optional local server: `npx serve .` or `python -m http.server`, then open the printed URL.

## Build

The Learn screen ships as one classic script, `js/learn.bundle.js` (committed and ready to use). ES modules are blocked on `file://` (CORS) and by the page's `script-src 'self'` CSP, which is why levels once loaded only in tests. After editing the sources, rebuild:

```sh
npm run build          # node tools/build-learn.mjs
```

`data/lessons.json` is the source of truth for levels and is inlined by the build, so no `fetch()` is needed at runtime. `npm test` fails if the bundle is stale.

## Test

```sh
npm install
npm test
```

`npm test` checks the bundle is current, runs the curriculum gate (`tools/check-batch1.mjs`: storage + schema + all 36 BFS pars), the unit gates (`test-elo.js`, `test-draws.js`, `perft.js`), plus the full Playwright suite (`test-levels`, `test-ui`, `test-a11y`, `test-mobile`, `test-wheel`, `test-elo-*`, `test-xss`).

Playwright uses the installed Edge/Chrome channel (`playwright.config.js`, 2 workers, 90s timeout — the P2P specs each drive two live pages and OOM with more workers).

## Project structure

- `index.html` — screens (home, learn/levels, lessons, lesson, progress, online, profile), script/style includes.
- `app.js` — course UI: lessons, board render, drag-and-drop, clocks, captured pieces, flip, mute, result card, move navigator.
- `js/` — Learn curriculum: `learn.js` (screen wiring), `engine.js` (level runtime + extra-turn rule), `board.js` (64-square incremental board), `lessons.js` (schema validator + BFS solver), `storage.js` (versioned progress), `vendor/chess.js` (chess.js 0.10.3), and the generated `learn.bundle.js`.
- `data/lessons.json` — 36 levels (grouped by piece: collect → directions → blocked → captures → obstacles → route) with en/fr/ar text. Adding a level means appending JSON, then `npm run build`.
- `chess.js` — rules engine (legal moves, castling/en-passant/promotion, check/checkmate/stalemate, fifty-move / repetition / insufficient-material draws).
- `online.js` — rated P2P friend games (PeerJS share codes, host authority/clocks, Elo per time control, reconnect/resume, unrated self-play).
- `perft.js` — move-generator correctness gate (startpos, kiwipete + positions 3–5).
- `styles.css` — dark navy + emerald theme, match layout (desktop split-pane, phone-compact), clocks/captured/drag/result-card, `prefers-reduced-motion` support.
- `assets/pieces/` — custom 12-piece SVG set. `assets/teacher*-192.png` — lightweight teacher portraits (full SVGs kept as sources).
- `vendor/` — self-hosted Inter + PeerJS (offline-capable, sub-500KB first paint).
- `tools/build-learn.mjs` — compiles `js/*.js` + `data/lessons.json` into `js/learn.bundle.js` (`--check` verifies freshness).

## Features

- Locked progression: one correct move unlocks the next step; Complete button stays disabled until the exercise checks out.
- Full rules: promotion picker, castling, en-passant, check/checkmate/stalemate, draw detection.
- Free game vs CPU (Easy/Medium alpha-beta) with result card (Rematch / Review / Lessons).
- Match chrome: active-turn + low-time clocks, captured pieces with material edge, board flip, pointer drag-and-drop (= click path), persisted mute.
- Online: 6-letter codes, arbitrary base/increment wheel picker, per-game Elo (K40/20) with count-up, move navigator, forfeit/draw flows.
- Optional Clerk sign-in (`clerk-config.js`, null by default): per-user progress namespace; fully offline without a key.

## Accessibility

- Skip-to-content link, `nav` landmark label, focus moved to the active screen on navigation.
- Board squares are `role="button"` named by algebraic square (`e2`), focusable, Enter/Space operable.
- Speech, feedback, results, and move logs are `role="status"`/`role="log"` with `aria-live="polite"`; clocks are `role="timer"` (live off); dialogs carry `role="dialog"` + labels.
- Global `:focus-visible` ring, 44px touch targets, icon-only controls expose `aria-label` + `aria-pressed` where stateful, `prefers-reduced-motion` disables animation/pulse.
- Covered by `test-a11y.spec.js`.

## Privacy / offline

Static files only, no backend, no secret keys. Clerk/PeerJS are client-side and optional; the 10-lesson course works fully offline.

## License

MIT — see `LICENSE`.
