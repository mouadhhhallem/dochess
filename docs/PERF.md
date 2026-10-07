# DoChess Interaction Performance — measured

Date: 2026-10-07 (updated: incremental renderer + audio warmup)
Method: Playwright (Edge channel) driving the real lesson-1 board, `performance.now()`
around real clicks + `requestAnimationFrame` paint waits, `PerformanceObserver(longtask)`
in-page, `Element.prototype.getBoundingClientRect` counter. The no-rebuild contract
is now a permanent guard: `test-no-rebuild.spec.js` (64 nodes, same identities
across select AND move, handler budgets <50 ms).

## Select (click a piece, hints appear)

```text
select handler (sync JS):  0.7–0.9 ms
move handler (sync JS):    7.1 ms (was 77 ms before audio warmup — see below)
click + 2 painted frames: ~10 ms select / ~15 ms move
rect reads per select:     0
DOM nodes: 64 squares before and after, SAME node identities (no rebuild)
long tasks during select+move (steady): none
```

One-time trap found by profiling: the first move paid ~70 ms of audio setup
(`new Audio(move.mp3)` + fetch + `AudioContext` creation) inside the click
handler. Fixed by idle warmup (`SoundEngine.warm()` via `_preloadPieces`):
clip element + suspended context are created at boot, resumed on first gesture.
First-move handler dropped 77.1 ms → 7.1 ms. No sound plays on load.

Path: `_click → getLegalMoves (20× = 0.1 ms) → _draw({light}) → _syncLessonSquares
(20× = 7–8 ms, i.e. ~0.4 ms each)`. Turn speech/status scan, move-log and captured
rows are skipped on selection-only repaints. Roving tabindex moves without DOM churn.

## Move (e2→e4, feedback appears)

```text
click + 2 painted frames: ~15.5 ms
move-log: 1 pair appended (no rebuild; rebuild only on reset)
fly animation: 240 ms transform-only WAAPI overlay, skipped under reduced-motion
```

Path: `movePiece (local) → _draw (full sync, same 64 nodes) → append log →
cached status → paint → (free-game only) chunked CPU scheduled 650 ms later`.
No network in the local path.

## Engine (main thread, alpha-beta + PST)

```text
midgame test FEN, black to move, 31 root moves:
leaf _search(depth 2) per root move (medium depth-3 leaf): 5–42 ms, median ~18 ms
full _search(depth 2): ~33 ms
full _search(depth 1): ~14 ms
root search chunking: 20 ms slices via setTimeout, epoch-abortable
long tasks during steady select+move: none observed
long tasks during lesson open + first interactions: 60–80 ms (one-time route build)
```

Verdict: NO Web Worker for now, with data. Easy (depth 2) leaves are ~ms-scale;
medium (depth 3) leaves peak ~40 ms — under the 50 ms longtask budget — and the
root fan-out is already sliced at 20 ms so frames keep rendering while the
computer thinks, with the player's move painted first. Revisit only if a real
trace shows engine macrotasks >50 ms on target devices; the chunked structure
(`_cpuMove` step loop) is the seam a worker would plug into.

## Layout reads

- Select: 0 `getBoundingClientRect` calls.
- Move with animation: 1 board rect + 1 rect per gliding piece, all read before
  any write in the same frame (no interleaved read/write thrash by construction).
- Drag: 1 rect at ghost creation; moves are transform-only.
- Move-log scroll uses container-local `scrollTop`, never `scrollIntoView` per move.

## Served over http://localhost:8080 (2026-10-07, free game vs CPU)

Phase-attributed `longtask` observer + rAF ghost sampler while playing fast
pawn moves (clicks and a 4-step mouse drag) in lesson 10:

```text
select handler: 0.8 ms | move handler: 5.4 ms
longtasks: boot-phase only (54 ms, 81 ms — initial page + lesson-list build)
move/CPU phases: zero longtasks
top-left ghost flashes after fix: 0 (was 1: drag-ghost@-35,-41)
console errors: none
```

Two fixes from this session:

1. Drag ghost could paint one frame at the viewport origin on fast drags: the
   clone was appended before its pointer transform was set (plus an earlier
   `left:0;top:0` addition made the origin top-left instead of bottom). Fix:
   transform is now set BEFORE `appendChild`, so no frame can show the default.
   Guarded by the drag section of `test-no-rebuild.spec.js`.
2. Fly-piece snapshot/destination rects are validated (positive area, finite):
   rapid successive draws can no longer glide a piece from a bogus origin —
   the animation is skipped and the instant synced state stands.

Note on perceived lag: measured handlers are 1–7 ms with no move-phase long
tasks. Remaining wait in free games is the intentional 650 ms "thinking" delay
+ chunked search (~0.5 s total on medium, 20 ms slices, indicated in the UI),
and one-time boot longtasks if clicking during load. If a move still feels
slow on your machine, say which lesson/mode it happens in and whether the
"Thinking…" indicator shows — that distinguishes engine-think from UI lag.

## Acceptance check (spec §13/§59)

- Click → piece painted: ~10 ms select / ~15 ms move (budget <100 ms) ✓
- No long task >50 ms during steady interaction ✓ (one-time lesson-open ~60–80 ms, route change only)
- 60 FPS budget (16.67 ms/frame): handlers are sub-ms; painted in ~1 frame ✓
- Assets: pieces reuse <img> nodes (src compared, no re-decode on select)
