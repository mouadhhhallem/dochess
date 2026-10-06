// perft.js — move-generation correctness gate for chess.js (node, no browser).
// Standard positions/depths. Run: node perft.js
const ChessGame = require('./chess.js');

function perft(game, depth) {
    if (depth === 0) return 1;
    let nodes = 0;
    const mover = game.currentPlayer;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (!game.isColor(r, c, mover)) continue;
            const piece = game.board[r][c];
            const white = piece === piece.toUpperCase();
            for (const [tr, tc] of game.getLegalMoves([r, c])) {
                const promos = (piece.toLowerCase() === 'p' && (tr === 0 || tr === 7))
                    ? (white ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n']) : [null];
                for (const pr of promos) {
                    const snap = game.snapshot();
                    game.movePiece([r, c], [tr, tc], pr);
                    nodes += perft(game, depth - 1);
                    game.restore(snap);
                }
            }
        }
    }
    return nodes;
}

const cases = [
    ['startpos', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
    ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
    ['position3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
    ['position4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
    ['position5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
];

let fail = 0;
for (const [name, fen, depth, expected] of cases) {
    const g = new ChessGame();
    g.loadFEN(fen);
    const t0 = Date.now();
    const nodes = perft(g, depth);
    const ok = nodes === expected;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} depth ${depth}: ${nodes} (expected ${expected}) in ${Date.now() - t0}ms`);
}
process.exit(fail ? 1 : 0);
