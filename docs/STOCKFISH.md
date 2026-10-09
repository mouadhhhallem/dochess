# Stockfish in DoChess Study

## Distribution used

- **Engine:** Stockfish 10, build `2019-08-15 64 POPCNT` (official Stockfish release).
- **Package:** `stockfish.js@10.0.2` (nmrugg packaging of the official sources).
- **Files vendored:** `vendor/stockfish/stockfish.wasm.js` (96,597-byte Emscripten
  classic-worker loader) + `vendor/stockfish/stockfish.wasm` (558,861-byte
  single-threaded WebAssembly build, NNUE-era classical evaluation).
- **Source of the engine:** https://github.com/official-stockfish/Stockfish
- **License:** GPLv3 — full text vendored at `vendor/stockfish/Copying.txt`
  (+ the wrapper's `LICENSE`). See "Licensing" below.
- **Integrity:** byte sizes above match the jsDelivr registry metadata for
  `stockfish.js@10.0.2` (`RYFrQ264wYCsssW5/aAUgQH0Ee2/pr+RmRjgo2Lq/Kg=`,
  `BkF1BC2LcuufuoMRtzD29c68/sc2SUaY1nXcQz870nU=`).

## Why this build (decision log, verified 2026-10-09)

1. `lila-stockfish-web@0.0.11/sf171-79` (official Stockfish 17.1 WASM) was tried
   first: it boots only with cross-origin isolation (its Emscripten runtime
   transfers SharedArrayBuffer-backed memory), which GitHub Pages cannot send
   headers for. Verified failure: `DataCloneError ... requires
   self.crossOriginIsolated`.
2. Cross-origin `new Worker(cdnUrl)` is additionally blocked from `file://`
   pages (opaque origin), which this project supports as a first-class path.
3. The vendored single-threaded SF10 build needs neither isolation nor
   SharedArrayBuffer: it boots over plain `http(s)` from the same origin,
   works on GitHub Pages, and at ~3400 Elo is vastly stronger than anything
   the course targets. Verified live: `uciok`, `readyok`, MultiPV 3 info
   lines, `bestmove` at depth 12 with nodes/nps/PV, zero console errors.

## Runtime architecture

- Same-origin classic Worker (`vendor/stockfish/stockfish.wasm.js`).
  The `.wasm` sibling is fetched by the Emscripten loader (same origin).
- UCI subset used: `uci`, `isready`, `setoption name MultiPV`,
  `ucinewgame`, `position fen ...`, `go depth N`, `stop`, `quit`
  (worker terminated instead).
- Searches are serialized: a superseding `analyze()` sends `stop` and the
  previous search's tail is discarded at its `bestmove`, so `info` lines
  from two positions can never mix (this exact contamination was observed
  and fixed during development).
- Only finished searches (`bestmove` received) populate the cache, stored
  node evals, and move classifications. Intermediate depth lines update the
  live display only.
- Scores are side-to-move relative on the wire and converted to
  White-relative for display. Mate scores never mix with centipawns.
- `file://` pages cannot construct Workers from opaque origins (platform
  limitation, verified). There the UI states the reason and uses the
  built-in local search instead — every number stays measured, nothing is
  fabricated. Open the app over `http://localhost:8080/` (or the GitHub
  Pages URL) for full Stockfish.

## Local fallback engine (honest, labelled "Local engine · depth 2")

Depth-2 alpha-beta over plain material values on the vendored chess.js
rules. Weak, but every displayed number is measured by that search.

## Licensing (GPLv3)

Stockfish is free software under GNU GPL version 3. Because DoChess
distributes the engine binary:

- The license text ships with the app (`vendor/stockfish/Copying.txt`,
  `vendor/stockfish/LICENSE`).
- Corresponding source: the official Stockfish repository
  (https://github.com/official-stockfish/Stockfish); the vendored build
  corresponds to the Stockfish 10 release sources packaged as
  `stockfish.js@10.0.2` (https://github.com/nmrugg/stockfish.js).
- No engine code was modified; no further notices were removed.
