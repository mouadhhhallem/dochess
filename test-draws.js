// Draw-rule tests for chess.js (node, no browser). Run: node test-draws.js
const ChessGame = require('./chess.js');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
    if (actual === expected) { pass++; }
    else { fail++; console.log(`FAIL - ${msg}: got ${actual}, want ${expected}`); }
}

function play(g, moves) {
    for (const [f, t, p] of moves) {
        const r = g.movePiece(g.algebraicToCoords(f), g.algebraicToCoords(t), p || null);
        if (r === null || r === 'promotion-needed') throw new Error('illegal test move ' + f + t);
    }
}

// 1. Bare kings
let g = new ChessGame();
g.loadFEN('8/8/4k3/8/4K3/8/8/8 w - - 0 1');
eq(g.getGameStatus(), 'draw-insufficient', 'K vs K');
eq(g.isInsufficientMaterial(), true, 'bare kings flagged');

// 2. K+B vs K
g = new ChessGame();
g.loadFEN('8/8/4k3/8/4KB2/8/8/8 w - - 0 1');
eq(g.getGameStatus(), 'draw-insufficient', 'K+B vs K');

// 3. K+N vs K
g = new ChessGame();
g.loadFEN('8/8/4k3/8/4KN2/8/8/8 w - - 0 1');
eq(g.getGameStatus(), 'draw-insufficient', 'K+N vs K');

// 4. K+B vs K+B, same-colour bishops
g = new ChessGame();
g.loadFEN('8/8/4kb2/8/4KB2/8/8/8 w - - 0 1');
eq(g.getGameStatus(), 'draw-insufficient', 'same-colour bishops');

// 5. K+N vs K+N can still mate -> play on
g = new ChessGame();
g.loadFEN('8/8/4kn2/8/4KN2/8/8/8 w - - 0 1');
eq(g.getGameStatus() === 'draw-insufficient', false, 'K+N vs K+N not auto-draw');

// 6. Threefold repetition: knights shuffle out and back twice
g = new ChessGame();
play(g, [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'],
          ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]);
eq(g.getGameStatus(), 'draw-repetition', 'knight shuffle threefold');
eq(g.repetitionCount() >= 3, true, 'count reaches 3');

// 7. Fifty-move rule via FEN counter (extra knight so it is not
// also dead by insufficient material — either label would be truthful).
g = new ChessGame();
g.loadFEN('7k/8/8/8/8/5N2/8/R5K1 w - - 100 25');
eq(g.getGameStatus(), 'draw-fifty', 'halfmove 100');
eq(g.isFiftyMove(), true, 'fifty flag');

// 8. Counter resets on pawn moves and captures
g = new ChessGame();
play(g, [['e2', 'e4']]);
eq(g.halfmoveClock, 0, 'pawn resets clock');
play(g, [['e7', 'e5']]);
eq(g.halfmoveClock, 0, 'pawn resets clock again');
play(g, [['g1', 'f3']]);
eq(g.halfmoveClock, 1, 'quiet move ticks clock');

// 9. Real checkmate still reported (not swallowed by draw rules)
g = new ChessGame();
play(g, [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
eq(g.getGameStatus(), 'checkmate-black', 'fools mate intact');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
