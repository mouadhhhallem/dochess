/**
 * tools/check-batch1.mjs — node verification for Batch 1.
 * Run:  node tools/check-batch1.mjs        (from the repo root)
 * Tests storage.js (mock backend), lessons.js schema, and engine validation
 * of data/lessons.json using the repo's current rules engine as the adapter
 * (browser batch 2 re-runs the same checks with chess.js).
 * Exit code 0 = all green.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
    defaultState, isValidState, loadProgress, saveProgress,
    exportProgress, importProgress, resetProgress, touchDay, addXp,
    starsForPar, pointsFor,
    SCHEMA_VERSION, STORAGE_KEY,
} from '../js/storage.js';
import {
    validateSchema, validateEngine, starsForAttempt, CURRICULUM_VERSION,
} from '../js/lessons.js';

const require = createRequire(import.meta.url);
const ChessGame = require('../chess.js'); // legacy engine as TEST adapter only

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// ── mock backend ──
const mock = () => {
    const m = new Map();
    return { blocked: false, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), del: (k) => m.delete(k), _map: m };
};

// ── storage tests ──
{
    const b = mock();
    const { state } = loadProgress(b);
    ok('storage: blank default on empty', state.version === SCHEMA_VERSION && state.xp === 0);
    state.stars['s1-rook'] = 3;
    ok('storage: save+reload round-trip', saveProgress(state, b) && loadProgress(b).state.stars['s1-rook'] === 3);
    b.set(STORAGE_KEY, '{corrupt json');
    ok('storage: corrupt falls back to default', loadProgress(b).state.stars['s1-rook'] === undefined);
    b.set(STORAGE_KEY, JSON.stringify({ version: 999, stars: {} }));
    ok('storage: wrong version rejected', !isValidState(JSON.parse(b.get(STORAGE_KEY))) && loadProgress(b).state.version === SCHEMA_VERSION);
    const b2 = mock();
    b2.set('ccp_v4', JSON.stringify({ done: [1, 2, 3] }));
    ok('storage: legacy v4 preserved', JSON.stringify(loadProgress(b2).state.legacy.v4done) === '[1,2,3]');
    const st = defaultState();
    ok('storage: export/import round-trip', importProgress(exportProgress(st)).ok === true);
    ok('storage: import refuses garbage', importProgress('nope').ok === false && importProgress('{"version":1}').ok === false);
    const st2 = defaultState(); st2.stars['x'] = 3;
    saveProgress(st2, b); const rst = resetProgress(b);
    ok('storage: reset clears stars, keeps settings', rst.stars['x'] === undefined && rst.settings.theme === 'night');
    const st3 = defaultState();
    touchDay(st3, '2026-10-01'); touchDay(st3, '2026-10-02'); touchDay(st3, '2026-10-02');
    ok('storage: streak 2 across consecutive days', st3.streak.count === 2 && st3.heatmap['2026-10-02'] === 2);
    touchDay(st3, '2026-10-05');
    ok('storage: streak resets after gap', st3.streak.count === 1);
    const st4 = defaultState();
    ok('storage: xp level math', addXp(st4, 150).level === 2 && addXp(st4, 0).level === 2);
}
ok('storage: par stars 3/par/par+2/rest',
    starsForPar(4, 4) === 3 && starsForPar(6, 4) === 2 && starsForPar(7, 4) === 1);
ok('storage: points 100 - 10/extra - 15/hint, floored',
    pointsFor({ moves: 4, par: 4, hintsUsed: 0 }) === 100 &&
    pointsFor({ moves: 6, par: 4, hintsUsed: 1 }) === 65 &&
    pointsFor({ moves: 99, par: 4, hintsUsed: 9 }) === 0);
ok('storage: stars rule 3/2/1/0 (single-move tactics)',
    starsForAttempt({ solved: true, tries: 1, hintsUsed: 0 }) === 3 &&
    starsForAttempt({ solved: true, tries: 2, hintsUsed: 1 }) === 2 &&
    starsForAttempt({ solved: true, tries: 9, hintsUsed: 9 }) === 1 &&
    starsForAttempt({ solved: false, tries: 1, hintsUsed: 0 }) === 0);

// ── engine adapter over the legacy rules engine ──
// Base surface (single-move validators) + full solver surface (free-move):
// turn/setTurn, boardKey, attacked, epSquare, listDetailed, playDetailed.
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
                // King captures are illegal in real chess: exclude them so
                // the solver can never "solve" by taking the enemy king.
                if (dest && dest.toLowerCase() === 'k' && !isOwn(dest)) continue;
                out.push({ from: alg(r, c), to: alg(tr, tc), piece: p, captured: dest || null });
            }
        }
        // En passant shows as a quiet diagonal pawn move: mark the victim.
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
        restore: (s) => g.restore(s),
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
            const epVictimSq = wasEp ? String.fromCharCode(97 + to[1]) + uci.slice(1, 2) : null;
            const res = g.movePiece(from, to, promo || uci[4] || null);
            if (res === null || res === 'promotion-needed') return null;
            return {
                captured: res.captured || null,
                specialMove: res.specialMove || null,
                promotion: res.promotion || null,
                epCapture: wasEp ? epVictimSq : null,
            };
        },
        isCheckmate: () => g.isCheckmate(),
    };
}
const adapter = {
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

// ── curriculum checks ──
const data = JSON.parse(readFileSync(new URL('../data/lessons.json', import.meta.url), 'utf8'));
ok('lessons: file version matches code', data.version === CURRICULUM_VERSION);
const schema = validateSchema(data);
ok('lessons: schema 0 errors', schema.errors.length === 0, JSON.stringify(schema.errors.slice(0, 3)));
console.log(`     schema warnings (missing fr/ar fall back to en): ${schema.warnings.length}`);
const eng = validateEngine(data, adapter);
for (const r of eng) ok(`engine: ${r.id} [${r.type}]`, r.status === 'pass', r.status === 'fail' ? r.detail : `(${r.status}: ${r.detail})`);
console.log('\n── BFS par table ──');
for (const r of eng) console.log(`  ${r.id}: ${r.detail}`);

// ── corrected schema-example mate-in-1 (was illegal Rf1-f8; now Re1-e8) ──
const EXAMPLE_MATE = {
    id: 'schema-example-mate-in-1', stage: 2, themes: ['mate', 'back-rank'],
    type: 'mate-in-n', title: 't', goal: 'g', explain: 'e', success: 's', failHint: 'f',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    solution: { moves: ['e1e8'], mateIn: 1 },
    hints: ['h1', 'h2', 'h3'], xp: 20,
};
{
    const { errors } = validateSchema({ version: 1, stages: [{ n: 2 }], levels: [EXAMPLE_MATE] });
    ok('example mate: schema clean', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    const [r] = validateEngine({ levels: [EXAMPLE_MATE] }, adapter);
    ok('example mate: Re1-e8 mates, unique as listed', r.status === 'pass', r.detail);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
