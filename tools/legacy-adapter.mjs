/**
 * tools/legacy-adapter.mjs — chess adapter over the legacy rules engine.
 *
 * Exposes the FULL lessons.js solver surface (base + free-move BFS):
 *   turn/setTurn/boardKey/attacked/epSquare/listDetailed/playDetailed/snapshot/
 *   restore/pieceOn/isCheckmate/isStalemate/inCheck.
 * Backed by the repo's root chess.js (used only in node tests/authoring —
 * the browser uses chess.js via engine.js ChessJsAdapter).
 *
 * playDetailed returns {captured, specialMove, promotion, epCapture,
 * check, mate, stalemate} — the last three describe the side NOW to move
 * (the opponent), captured right after the move flips the turn.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ChessGame = require('../chess.js');

const rc = (sq) => [8 - parseInt(sq[1], 10), sq.charCodeAt(0) - 97];
const alg = (r, c) => String.fromCharCode(97 + c) + (8 - r);
const colorName = (side) => (side === 'w' ? 'white' : 'black');

function wrapGame(g, fenTurn) {
    const ownSide = () => (g.currentPlayer === 'white' ? 'w' : 'b');
    const isOwn = (p) => !!p && ((ownSide() === 'w') === (p === p.toUpperCase()));
    function rawMoves() {
        const out = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = g.board[r][c];
            if (!p || !isOwn(p)) continue;
            for (const [tr, tc] of g.getLegalMoves([r, c])) {
                const dest = g.board[tr][tc];
                if (dest && dest.toLowerCase() === 'k' && !isOwn(dest)) continue;
                out.push({ from: alg(r, c), to: alg(tr, tc), piece: p, captured: dest || null });
            }
        }
        if (g.enPassantTarget) {
            const ep = alg(...g.enPassantTarget);
            for (const m of out) {
                if (!m.captured && m.piece.toLowerCase() === 'p' &&
                    m.from[0] !== m.to[0] && m.to === ep) {
                    m.captured = g.board[rc(m.from)[0]][rc(m.to)[1]] || 'p';
                    m.ep = true;
                }
            }
        }
        return out;
    }
    return {
        turn: () => ownSide(),
        setTurn: (s) => { g.currentPlayer = colorName(s); },
        snapshot: () => g.snapshot(),
        restore: (s) => { g.restore(s); },
        boardKey() {
            let b = '';
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) b += g.board[r][c] || '.';
            const cr = g.castlingRights;
            return b + '|' + (cr.K ? 'K' : '') + (cr.Q ? 'Q' : '') + (cr.k ? 'k' : '') + (cr.q ? 'q' : '') +
                '|' + (g.enPassantTarget ? alg(...g.enPassantTarget) : '-');
        },
        attacked(sq, byName) {
            const [r, c] = rc(sq);
            return g._attacked(r, c, byName);
        },
        epSquare: () => (g.enPassantTarget ? alg(...g.enPassantTarget) : null),
        pieceOn(sq) { const [r, c] = rc(sq); return (g.board[r] && g.board[r][c]) || null; },
        listMoves: () => rawMoves().map((m) => m.from + m.to),
        listDetailed: () => rawMoves().map((m) => ({ ...m, uci: m.from + m.to })),
        play(uci) {
            const res = g.movePiece(rc(uci.slice(0, 2)), rc(uci.slice(2, 4)), uci[4] || null);
            return res !== null && res !== 'promotion-needed';
        },
        playDetailed(uci, promo) {
            const from = rc(uci.slice(0, 2)), to = rc(uci.slice(2, 4));
            const wasEp = !!g.enPassantTarget &&
                uci.slice(2, 4) === alg(...g.enPassantTarget) &&
                g.board[from[0]][from[1]] &&
                g.board[from[0]][from[1]].toLowerCase() === 'p' && from[1] !== to[1];
            // En-passant victim sits on TO-file + FROM-rank (engine.js rule).
            const epVictimSq = wasEp ? uci[2] + uci[1] : null;
            const res = g.movePiece(from, to, promo || uci[4] || null);
            if (res === null || res === 'promotion-needed') return null;
            let check = false, mate = false, stalemate = false;
            try {
                check = g._isKingInCheck(g.currentPlayer);
                mate = g.isCheckmate();
                stalemate = g.isStalemate();
            } catch (_) { /* flags stay false */ }
            return {
                captured: res.captured || null,
                specialMove: res.specialMove || null,
                promotion: res.promotion || null,
                epCapture: wasEp ? epVictimSq : null,
                check, mate, stalemate,
            };
        },
        isCheckmate: () => g.isCheckmate(),
        isStalemate: () => g.isStalemate(),
        inCheck: () => g._isKingInCheck(g.currentPlayer),
    };
}

export const legacyAdapter = {
    load(fen) {
        const g = new ChessGame();
        try {
            g.loadFEN(fen);
        } catch {
            return null;
        }
        const turn = (fen.split(' ')[1] === 'b') ? 'b' : 'w';
        return wrapGame(g, turn);
    },
};
