/**
 * js/engine.js — free-move level runtime on chess.js + solver adapter.
 *
 * Extra-turn rule (per spec): after every player move the FEN turn field is
 * rewritten back to the player, so one side moves repeatedly while chess.js
 * still enforces full legality (pins, check, pawn rules...). Own move counter
 * is kept separately because FEN reloads discard chess.js history.
 *
 * Also exports ChessJsAdapter(): the lessons.js solver surface
 * (turn/setTurn/boardKey/attacked/epSquare/listDetailed/playDetailed/
 * snapshot/restore/pieceOn) backed by chess.js 0.10.3 — used by "Show
 * solution" and by runAllTests() in the browser console.
 */

import { pathBetween, solveFreeMove } from './lessons.js';
import { starsForPar, pointsFor } from './storage.js';

const PROMO_PIECES = ['q', 'r', 'b', 'n'];
const EMPTY = [];

/* ── chess.js adapter for the BFS solver ─────────────────────────────── */
export function ChessJsAdapter(ChessCtor) {
    const enemyOf = (side) => (side === 'w' ? 'b' : 'w');
    const colorName = (side) => (side === 'w' ? 'white' : 'black');
    function wrap(fen) {
        const g = new ChessCtor(fen);
        const self = {
            turn() { return g.turn(); },
            setTurn(s) {
                const parts = g.fen().split(' ');
                parts[1] = s;
                g.load(parts.join(' '));
            },
            snapshot: () => g.fen(),
            restore: (snap) => { g.load(snap); },
            boardKey: () => g.fen(),
            pieceOn(sq) {
                const p = g.get(sq);
                return p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : null;
            },
            epSquare() {
                const ep = g.fen().split(' ')[3];
                return ep && ep !== '-' ? ep : null;
            },
            attacked(sq, byName) {
                const saved = g.fen();
                const want = byName === 'white' ? 'w' : 'b';
                try {
                    const parts = saved.split(' ');
                    parts[1] = want;
                    g.load(parts.join(' '));
                    return g.moves({ verbose: true }).some((m) => m.to === sq);
                } finally {
                    g.load(saved);
                }
            },
            listMoves() {
                return g.moves({ verbose: true })
                    .filter((m) => !(m.captured === 'k'))
                    .map((m) => m.from + m.to + (m.promotion || ''));
            },
            listDetailed() {
                return g.moves({ verbose: true })
                    .filter((m) => !(m.captured === 'k'))
                    .map((m) => ({
                        from: m.from, to: m.to, uci: m.from + m.to,
                        piece: m.piece, captured: m.captured || null,
                    }));
            },
            play(uci) {
                const res = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
                return !!res;
            },
            playDetailed(uci, promo) {
                const promotion = promo || uci[4] || undefined;
                let res;
                try {
                    res = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion });
                } catch (_) {
                    return null;
                }
                if (!res) return null;
                let epCapture = null;
                if (res.flags && res.flags.includes('e')) {
                    epCapture = res.to[0] + res.from[1];
                }
                return { captured: res.captured || null, specialMove: null, promotion: res.promotion || null, epCapture };
            },
            isCheckmate: () => g.in_checkmate(),
            _game: g,
        };
        return self;
    }
    return { load: (fen) => { try { return wrap(fen); } catch (_) { return null; } }, enemyOf, colorName };
}

/* ── free-move level session ─────────────────────────────────────────── */
export function createLevel(level, ChessCtor, lang = 'en') {
    const t = (obj, fb = '') => (obj && (obj[lang] || obj.en)) || fb;
    const player = (level.fen.split(' ')[1] === 'b') ? 'b' : 'w';
    const enemyName = player === 'w' ? 'black' : 'white';
    const adapter = ChessJsAdapter(ChessCtor);
    const game = new ChessCtor(level.fen);
    const obstacles = new Set(level.obstacles || []);
    const allowed = new Set((level.movePieces || []).map((s) => s.toLowerCase()));
    const goal = level.goal || {};
    const wantCollect = new Set(goal.collect || []);
    const wantCapture = new Set(goal.capture || []);
    const reach = goal.reach || null;

    const st = {
        level, game, adapter, player,
        collected: new Set(),
        captured: new Set(),
        moves: 0,
        hintsUsed: 0,
        hintIdx: 0,
        selected: null,
        done: false,
        result: null,
        undoStack: [], // {fen, collected:[], captured:[], moves}
        // Bumped on EVERY position/goal mutation. Derived reads (piece map,
        // legal move lists, check + king square) memoise against it, so the
        // click path — which asks for the same square up to four times per
        // move (select, target, play, paint) — pays chess.js for it once.
        version: 0,
    };

    // Derived-read cache. One generation per version; a bump invalidates all.
    const memo = { v: -1, pieces: null, legal: new Map(), check: false, king: null };

    function touch() {
        st.version++;
        memo.legal.clear();
    }
    // Stars already occupied at start count immediately.
    for (const sq of wantCollect) {
        const p = game.get(sq);
        if (p && p.color === player) st.collected.add(sq);
    }

    const isPlayerPiece = (p) => !!p && p.color === player;

    function attackedByEnemy(sq) {
        const saved = game.fen();
        try {
            const parts = saved.split(' ');
            parts[1] = player === 'w' ? 'b' : 'w';
            game.load(parts.join(' '));
            return game.moves({ verbose: true }).some((m) => m.to === sq);
        } finally {
            game.load(saved);
        }
    }

    /** Legal destinations for a selected square, with level rules applied. */
    function legalFor(sq) {
        if (memo.v !== st.version) { memo.v = st.version; memo.pieces = null; memo.check = null; memo.king = null; }
        const hit = memo.legal.get(sq);
        if (hit) return hit;
        const p = game.get(sq);
        if (!p || !isPlayerPiece(p)) return EMPTY;
        if (allowed.size && !allowed.has(p.type)) return EMPTY;
        const out = [];
        for (const m of game.moves({ square: sq, verbose: true })) {
            if (m.captured === 'k') continue;
            if (obstacles.has(m.to)) continue;
            const between = pathBetween(m.from, m.to);
            if (between && between.some((s) => obstacles.has(s))) continue;
            if (level.avoidAttacked && attackedByEnemy(m.to)) continue;
            out.push(m);
        }
        memo.legal.set(sq, out);
        return out;
    }

    function needsPromotion(from, to) {
        const p = game.get(from);
        if (!p || p.type !== 'p') return false;
        return (player === 'w' && to[1] === '8') || (player === 'b' && to[1] === '1');
    }

    function checkDone(lastTo, moverType, promoted) {
        for (const s of wantCollect) if (!st.collected.has(s)) return false;
        for (const s of wantCapture) if (!st.captured.has(s)) return false;
        if (reach) {
            if (lastTo !== reach.square) return false;
            if (reach.piece && moverType !== reach.piece.toLowerCase() &&
                (promoted || '').toLowerCase() !== reach.piece.toLowerCase()) return false;
        }
        return true;
    }

    function finish() {
        st.done = true;
        const stars = starsForPar(st.moves, level.par);
        const points = pointsFor({ moves: st.moves, par: level.par, hintsUsed: st.hintsUsed });
        st.result = { moves: st.moves, par: level.par, stars, points, hintsUsed: st.hintsUsed };
        return st.result;
    }

    return {
        state: st,
        text: (key) => t(level[key]),
        /** Attempt from→to (promotion piece like 'q' when required). */
        play(from, to, promotion) {
            if (st.done) return { ok: false, reason: 'done' };
            const legal = legalFor(from).filter((m) => m.to === to);
            if (!legal.length) return { ok: false, reason: 'illegal' };
            if (needsPromotion(from, to) && !PROMO_PIECES.includes((promotion || '').toLowerCase())) {
                return { ok: false, reason: 'promotion-needed' };
            }
            const mover = game.get(from);
            st.undoStack.push({
                fen: game.fen(),
                collected: [...st.collected], captured: [...st.captured], moves: st.moves,
            });
            const res = game.move({ from, to, promotion: promotion ? promotion.toLowerCase() : undefined });
            if (!res) return { ok: false, reason: 'illegal' };
            st.moves++;
            // Extra-turn rule: force the turn back to the player.
            const parts = game.fen().split(' ');
            parts[1] = player;
            game.load(parts.join(' '));
            if (wantCollect.has(to)) st.collected.add(to);
            if (res.captured) {
                const capSq = res.flags && res.flags.includes('e') ? to[0] + from[1] : to;
                if (wantCapture.has(capSq)) st.captured.add(capSq);
            }
            st.selected = null;
            touch();
            if (checkDone(to, mover.type, res.promotion)) finish();
            return { ok: true, move: res, done: st.done, result: st.result };
        },
        undo() {
            const prev = st.undoStack.pop();
            if (!prev) return false;
            game.load(prev.fen);
            // Re-apply the extra-turn rule (loaded fen carries opponent turn).
            const parts = game.fen().split(' ');
            parts[1] = player;
            game.load(parts.join(' '));
            st.collected = new Set(prev.collected);
            st.captured = new Set(prev.captured);
            st.moves = prev.moves;
            st.selected = null;
            st.done = false;
            st.result = null;
            touch();
            return true;
        },
        restart() {
            game.load(level.fen);
            st.collected = new Set();
            for (const sq of wantCollect) {
                const p = game.get(sq);
                if (p && p.color === player) st.collected.add(sq);
            }
            st.captured = new Set();
            st.moves = 0;
            st.hintsUsed = 0;
            st.hintIdx = 0;
            st.selected = null;
            st.done = false;
            st.result = null;
            st.undoStack = [];
            touch();
        },
        hint() {
            const hints = level.hints || [];
            if (st.hintIdx >= hints.length) return null;
            const h = t(hints[st.hintIdx], '');
            st.hintIdx++;
            st.hintsUsed++;
            return h;
        },
        /** Optimal line via the same BFS the validator uses. */
        solution() {
            return solveFreeMove(level, adapter);
        },
        legalFor,
        needsPromotion,
        pieces() {
            if (memo.v === st.version && memo.pieces) return memo.pieces;
            memo.v = st.version;
            // NOTE: chess.js 0.10.3 board() cells have no .square — derive it.
            const out = {};
            game.board().forEach((row, r) => {
                row.forEach((cell, c) => {
                    if (cell) out['abcdefgh'[c] + (8 - r)] = { type: cell.type, color: cell.color };
                });
            });
            memo.pieces = out;
            return out;
        },
        inCheck() {
            if (memo.v === st.version) return memo.check;
            memo.v = st.version;
            try {
                memo.check = game.in_check();
            } catch (_) {
                memo.check = false;
            }
            return memo.check;
        },
        kingSquare() {
            if (memo.v === st.version) return memo.king;
            memo.v = st.version;
            let found = null;
            game.board().forEach((row, r) => {
                row.forEach((cell, c) => {
                    if (cell && cell.type === 'k' && cell.color === player) {
                        found = 'abcdefgh'[c] + (8 - r);
                    }
                });
            });
            memo.king = found;
            return found;
        },
        enemyName,
    };
}

// Re-export for the console runner: runAllTests(data, ChessJsAdapter(Chess)).
export { solveFreeMove };
