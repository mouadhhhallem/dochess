# DoChess Study — architecture notes

`study.js` (classic script, `window.DoChessStudy`) implements the Study
screen. Routing: `showStudy()` in `app.js`, `#study-screen` section in
`index.html`, `st-`-prefixed styles in `styles.css`. Chess rules, SAN and
move validation come from the vendored chess.js 0.10.3 global `Chess`
(already shipped for the Learn curriculum); the Study move tree stores a
FEN per node so navigation, engine queries and PGN export are stateless.

## Move tree

Nodes `{ san, uci, fen, comment, nag, arrows, marks, eval, cls, children }`
with `children[0]` as the mainline. Playing a different move at a position
with existing children appends a variation automatically. Promotion,
variation promotion/deletion, and chapter navigation all preserve legality
because every node is validated through the rules engine.

## PGN

Import uses a purpose-built recursive parser (tags, SANs, `{comments}`,
`$NAG`s / `?!`-style glyphs, nested variations), because the vendored
`load_pgn()` silently drops variations and comments. Every SAN is
validated against the live position; illegal input stops the import with a
message and keeps whatever was legal (or nothing, if nothing was legal).
Export regenerates movetext from the tree (mainline, variations in
parentheses, comments, `$NAG`s, result, `SetUp`/`FEN` when needed).

## Evaluations and move classification

Evaluations are stored per node as White-relative `{ cp | mate, depth,
engine }`, measured only by finished searches. A move is classified only
when parent and child evals come from the **same** engine; mixed-engine
comparisons are skipped, never guessed.

Loss is measured in pawns from the mover's perspective:

| loss (pawns) | label      |
|--------------|------------|
| ≤ 0.10       | Best       |
| ≤ 0.35       | Excellent  |
| ≤ 0.90       | Good       |
| ≤ 1.80       | Inaccuracy |
| ≤ 3.50       | Mistake    |
| more         | Blunder    |

Mate and game-ending rules (checked in this order):

1. Delivered checkmate → Best.
2. Stalemate/draw from a clearly winning position (eval > +3.00) →
   Blunder (stalemate) or Mistake.
3. Had a forced mate and kept it with ≤ 2 extra plies of delay →
   Excellent (Best if no slower); lost the mate but still clearly
   winning (> +5.00) → Mistake, otherwise Blunder.
4. Allowed the opponent a forced mate → Blunder.

"Explain this position" is a rule-based summary of board facts (material,
mobility, check, castling rights) plus the measured engine numbers. It is
labelled as such in the UI — no language model is involved.

## Storage

`localStorage` key `dcstudy_v1_<userId|anon>`: `{ v, studies, positions }`.
Studies carry chapters (each an independent tree), tags, visit history and
a small repertoire list. Writes are debounced; malformed data falls back
to an empty library without touching anything else. Shape is additive and
namespaced per user so a future cloud sync can adopt it.

## Practice mode

"Practice this position" hides the engine's depth-14 best move; attempts
are graded by a real depth-12 search and the same loss table above.
Solved at Best/Excellent; the solution can be revealed at any time.

## Performance

One worker per session, created lazily on first Study visit. Searches are
debounced (300 ms), superseded searches are stopped and their tails
discarded, analysis results are cached per FEN (120 entries), and the
worker is never re-created per move.

## Limitations (honest)

- Engine workers cannot start from `file://` pages (opaque origin) — the
  labelled local engine is used there; use `http://localhost:8080/` or the
  GitHub Pages URL for Stockfish.
- No cloud sync: studies live in the browser (per signed-in user id when
  Clerk is configured, else the shared guest bucket).
- No opening database: repertoire stores your own lines only; there are no
  popularity percentages or master-game statistics.
- Engine strength is Stockfish 10 (2019): far beyond human course needs,
  but not the latest release (newer WASM builds require cross-origin
  isolation, which GitHub Pages cannot provide — see docs/STOCKFISH.md).
