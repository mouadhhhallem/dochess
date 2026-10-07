# DoChess Baseline — before optimization

Date: 2026-10-07
Browser: Not measured yet
Device: Not measured yet

## Static payload (measured 2026-10-07, node fs.stat)

```text
index.html: 10.1 KB
app.js:     183.4 KB (3389 lines, vanilla, no bundler)
chess.js:    19.0 KB (custom rules engine, no npm dep)
online.js:   15.4 KB (P2P WebRTC, PeerJS vendored 84.9 KB)
styles.css:   61.4 KB (2180 lines)
Total JS+CSS (blocking): ~279 KB
```

- All 4 scripts load as blocking classic `<script>` in index.html:178-181, no
  defer/async, no code splitting. Single 183KB app.js includes lessons +
  online + profile + ratings.
- Font: single self-hosted Inter woff2 (47.1KB), preload + font-display:swap — good.
- Pieces: 12 SVG files, 12.9–17.5KB each (~187KB total), correct transparent set.
- Teacher PNGs active (~40–60KB each, lazy). Teacher SVGs (2.76/3.01/7.09MB)
  and logo-for-*.png (1.7MB) are NOT loaded by code (sources only) — no runtime
  cost, only repo weight.
- preview-board.png (92KB) has no code reference — not loaded, no runtime cost.

## Correctness gates (measured)

```text
perft.js: PASS all 5 nodes
  startpos d4: 197281 in ~1712ms
  kiwipete d3: 97862 in ~679ms
  pos3 d4: 43238, pos4 d3: 9467, pos5 d3: 62379
```

Move generator is correct. Engine search is alpha-beta depth 2 (easy) / 3
(medium) with 20ms root chunking + 650ms post-move delay (app.js:1003-1038,
894). Leaf _search() is still synchronous. No Web Worker. Decision: NO worker
for now — file:// blocks workers, depth 2/3 + chunking keeps frames rendering,
player move is painted before search starts (_doPlayerMove → _draw → _afterMove).
Revisit only if profiling shows >50ms long tasks during medium search.

## Interaction architecture (audited, not yet timed)

- Board: full 64-div rebuild per select AND per move (_draw app.js:588,
  _drawOnline :2677). Delegated listeners bound once (fixed prior 6×64 bug).
  Still DOM churn + <img> re-decode + focus loss on every selection.
- Move flow is correct order: validate locally → update state → _draw player
  move → paint → setTimeout CPU. No network in local path. Good.
- Storage: lessons save only on markDone (good, not per-move). Online saves
  full-game JSON per move (acceptable, not per-frame). No debounce. Keys:
  ccp_v4[_userId], cc_mute, cc_control, cclast, ccr_*, ccgh_*, ccg_g_*.
  Safe-parse with try/catch, but no shape validation / no v3 migration.
- Animation: fly/drag use WAAPI transform (good). Ghost positioned via
  left/top then animated via transform (mixed). getBoundingClientRect per
  move/drag + scrollIntoView + log innerHTML rebuild per move.
- Board sizing: aspect-ratio 1/1 correct. Wrapper max 760px (lesson) / 560px
  (online). Mobile forces width:100% (fixes 100lvh URL-bar bug). Duplicate
  `width:100%` immediately overwritten by `width:min(...)` (styles.css:879-880,
  1666/1668) — harmless but lint noise.
- Board palette already matches spec: #F0D9B5 / #B58863 / last #E8A02E.
  Selected rgba(232,160,46,.45) kept intentionally — no arbitrary recolor.

## Known CSS defects (audited)

- `var(--radius-sm/md/lg)` used ~35× and `var(--transition)` ~20× but NEVER
  defined in :root — all radii/transitions silently fall back to initial
  (no rounding, no transitions). P0 fix.
- `.lessons-grid minmax(340px,1fr)` overflows at 320px viewport.
- `.join-row` no wrap + `.join-input width:10rem` + letter-spacing overflows narrow.
- `.chess-square touch-action` conflict: manipulation (:899) vs pan-y (:1723).
- `.join-input:focus { outline:none }` weakens visible focus.
- No `env(safe-area-inset-*)` anywhere; `#online-screen .lesson-actions`
  scroll-row sits under iOS home indicator.
- `body { overflow-x:hidden }` masks sins instead of fixing.

## Accessibility (audited)

- Squares: role=button, tabindex=0, Enter/Space operable, focus-visible ring,
  skip-link, aria-live speech/log, 44px targets, reduced-motion kill-switch.
  Gaps: 64 tab stops (no roving tabindex), aria-label bare `e2` (no piece info),
  in-check is color-only, focus destroyed on every _draw, promotion dialog no
  Escape/trap audit, contrast not axe-verified.
- Tests present: test-a11y (skip-link, labels, Enter, live, focus),
  test-mobile (390×844 board ≥0.90, no-x-scroll, 375×667 paint ≥0.88),
  test-ui (home→lessons→10 cards→e2e4). No axe, no FPS/long-task asserts.

## Not measured yet

```text
Initial load: Not measured yet
Route loading: Not measured yet
Chess move interaction: Not measured yet
Longest task: Not measured yet
Known issues: see above (CSS vars, overflow, focus loss, full rebuild per select)
```

Measure with DevTools Performance + Lighthouse on local server before claiming
any "performance fixed".
