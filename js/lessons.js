/**
 * js/lessons.js — curriculum loader + validators for DoChess.
 *
 * Data lives in data/lessons.json. NOTHING level-specific may live in code:
 * adding a level = appending JSON. Two validation layers:
 *
 *  1. validateSchema(data) — pure structure/type checks, no chess needed.
 *     English text is required; fr/ar fall back to en at runtime, so a
 *     missing translation is a WARNING, never an error.
 *  2. validateEngine(data, api) — chess checks via an injected engine API,
 *     so the same runner works with chess.js in the browser and with the
 *     legacy engine in node. `api.load(fen)` must return a game object:
 *       {
 *         listMoves(): [{from:'e2', to:'e4', uci:'e2e4'}],  // side to move
 *         play(uci): boolean,                              // apply, false if illegal
 *         isCheckmate(): boolean,
 *       }
 *     Single-move types (tactics stages; `mode` omitted or "single-move"):
 *       reach-square {piece?, target}  — some legal (piece-filtered) move lands on target.
 *       best-move {moves:[uci]}        — every listed move is legal from the start FEN.
 *       mate-in-1 {moves:[uci], acceptAlso?:[uci]} — listed moves mate, and NO
 *         other legal move mates unless listed in acceptAlso.
 *       capture-all {targets:[sq]}    — each target holds an enemy piece that
 *         some legal move captures.
 *       defend / avoid-stalemate      — STRUCTURAL ONLY for now (honest skip,
 *         enforced properly when the opponent-reply runtime lands in engine.js).
 *     Free-move levels (`mode":"free-move"`, Lichess-learn style): the player
 *       moves repeatedly while the side to move is forced back to the player
 *       after every move. Goals mix freely:
 *         goal: {collect:[sq], capture:[sq], reach:{square, piece?}}
 *       Rules: `movePieces` allowlist (frozen pieces are obstacles), `obstacles`
 *       squares (never crossed nor landed on), `avoidAttacked` (landing on an
 *       enemy-attacked square is rejected), `par` (BFS-verified, never trusted),
 *       `maxMoves` safety cap. Stars/points come from move count vs par.
 *       `"opponent": true` adds a real enemy reply after every player move:
 *       a deterministic policy shared by the runtime (engine.js) and the BFS,
 *       so par is computed on exactly the chess the player will face.
 *
 * PAR IS COMPUTED, NOT TYPED: solveFreeMove() BFS-searches the shortest
 * player-move sequence satisfying the goal. Validation FAILS when the stored
 * par differs, when the goal is unreachable, or when a collect square is
 * blocked — and prints the optimal line(s). The same solver powers the
 * in-game "Show solution" button.
 *
 * Run in the browser console (after chess.js is vendored):
 *   const api = ChessJsAdapter(); // batch 2
 *   console.table(runAllTests(lessonsJson, api));
 */

export const CURRICULUM_VERSION = 2;
export const LEVEL_TYPES = [
    'reach-square', 'capture-all', 'best-move',
    'mate-in-n', 'defend', 'avoid-stalemate',
    'free-move', // Lichess-learn style: repeated moves toward a goal (mode:"free-move")
];

/** Global star rule (one rule for every level — not per-level data). */
export const STAR_RULES = {
    3: 'solved on the first try with no hints',
    2: 'solved within 2 tries or with 1 hint',
    1: 'solved',
};

/** Stars earned from an attempt. Pure function of tries/hints. */
export function starsForAttempt({ solved, tries, hintsUsed }) {
    if (!solved) return 0;
    if (tries <= 1 && hintsUsed <= 0) return 3;
    if (tries <= 2 || hintsUsed <= 1) return 2;
    return 1;
}

const FEN_RE = /^[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+ [wb] (-|[KQkq]+) (-|[a-h][36]) \d+ \d+$/;
const SQ_RE = /^[a-h][1-8]$/;
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function t(field, path, errors, warnings, what) {
    if (field === undefined) { errors.push(`${path}: missing ${what}`); return null; }
    if (typeof field === 'string') return { en: field };
    if (typeof field !== 'object' || Array.isArray(field)) { errors.push(`${path}: bad ${what}`); return null; }
    if (typeof field.en !== 'string' || !field.en.trim()) errors.push(`${path}: ${what}.en required`);
    for (const lang of ['fr', 'ar']) {
        if (typeof field[lang] !== 'string' || !field[lang].trim()) {
            warnings.push(`${path}: ${what}.${lang} missing (falls back to en)`);
        }
    }
    return field;
}

/** Validate one level's structure. Pushes into errors/warnings, returns void. */
function validateLevelSchema(lv, seen, errors, warnings) {
    const id = (lv && typeof lv.id === 'string') ? lv.id : '(missing id)';
    const path = `level ${id}`;
    if (!lv || typeof lv !== 'object') { errors.push(`${path}: not an object`); return; }
    if (typeof lv.id !== 'string' || !lv.id) { errors.push('level: id must be a non-empty string'); return; }
    if (seen.has(lv.id)) errors.push(`${path}: duplicate id`);
    seen.add(lv.id);
    if (!Number.isInteger(lv.stage)) errors.push(`${path}: stage must be an integer`);
    if (!Array.isArray(lv.themes) || lv.themes.length === 0) errors.push(`${path}: themes[] required`);
    // planned lessons are skeletons ("Coming soon"): type/mode may be omitted.
    if (lv.planned !== true && !LEVEL_TYPES.includes(lv.type)) {
        errors.push(`${path}: unknown type ${JSON.stringify(lv.type)}`);
    }
    t(lv.title, path, errors, warnings, 'title');
    if (lv.set !== undefined && (typeof lv.set !== 'string' || !lv.set)) {
        errors.push(`${path}: set must be a non-empty string`);
    }
    if (lv.difficulty !== undefined && !(lv.difficulty >= 1 && lv.difficulty <= 3)) {
        errors.push(`${path}: difficulty must be 1, 2 or 3`);
    }
    // planned lessons: skeleton only ("Coming soon" in the UI). No FEN, goal,
    // hints, par or xp — everything chess-specific is skipped; they are
    // excluded from progress totals and never validated against an engine.
    if (lv.planned === true) {
        t(lv.explain, path, errors, warnings, 'explain');
        if (lv.goalText !== undefined) t(lv.goalText, path, errors, warnings, 'goalText');
        return;
    }
    if (lv.mode === 'free-move') {
        t(lv.goalText, path, errors, warnings, 'goalText');
    } else {
        t(lv.goal, path, errors, warnings, 'goal');
    }
    t(lv.explain, path, errors, warnings, 'explain');
    t(lv.success, path, errors, warnings, 'success');
    t(lv.failHint, path, errors, warnings, 'failHint');
    if (typeof lv.fen !== 'string' || !FEN_RE.test(lv.fen.trim())) {
        errors.push(`${path}: bad FEN`);
    }
    if (!Array.isArray(lv.hints) || lv.hints.length < 3) {
        errors.push(`${path}: need at least 3 progressive hints`);
    } else {
        lv.hints.forEach((h, i) => t(h, `${path}.hints[${i}]`, errors, warnings, 'hint'));
    }
    if (typeof lv.xp !== 'number' || lv.xp < 0) errors.push(`${path}: xp must be a number >= 0`);
    if (lv.mode !== undefined && lv.mode !== 'free-move' && lv.mode !== 'single-move') {
        errors.push(`${path}: mode must be free-move or single-move`);
    }
    if (lv.group !== undefined && (typeof lv.group !== 'string' || !lv.group)) {
        errors.push(`${path}: group must be a non-empty string`);
    }
    if (lv.intro !== undefined) t(lv.intro, path, errors, warnings, 'intro');
    if (lv.mode === 'free-move') {
        const g = lv.goal && typeof lv.goal === 'object' && !Array.isArray(lv.goal) ? lv.goal : null;
        if (!g) errors.push(`${path}: goal object required for free-move ({collect,capture,reach,check,mate,stalemate})`);
        else {
            const hasCollect = Array.isArray(g.collect) && g.collect.length > 0;
            const hasCapture = Array.isArray(g.capture) && g.capture.length > 0;
            const hasReach = g.reach && typeof g.reach.square === 'string';
            const hasFlag = g.check === true || g.mate === true || g.stalemate === true;
            if (!hasCollect && !hasCapture && !hasReach && !hasFlag) {
                errors.push(`${path}: goal needs collect[], capture[], reach.square or check/mate/stalemate true`);
            }
            for (const s of [...(g.collect || []), ...(g.capture || [])]) {
                if (!SQ_RE.test(s)) errors.push(`${path}: bad goal square ${s}`);
            }
            if (g.reach) {
                if (!SQ_RE.test(g.reach.square)) errors.push(`${path}: bad reach.square`);
                if (g.reach.piece !== undefined && !/^[prnbqk]$/i.test(g.reach.piece)) {
                    errors.push(`${path}: bad reach.piece`);
                }
            }
            for (const flag of ['check', 'mate', 'stalemate']) {
                if (g[flag] !== undefined && typeof g[flag] !== 'boolean') {
                    errors.push(`${path}: goal.${flag} must be boolean`);
                }
            }
            if (g.mate === true && g.stalemate === true) {
                errors.push(`${path}: goal cannot demand both mate and stalemate`);
            }
        }
        if (lv.obstacles !== undefined && (!Array.isArray(lv.obstacles) || !lv.obstacles.every((s) => SQ_RE.test(s)))) {
            errors.push(`${path}: obstacles must be squares[]`);
        }
        if (lv.movePieces !== undefined && (!Array.isArray(lv.movePieces) || !lv.movePieces.every((p) => /^[prnbqk]$/i.test(p)))) {
            errors.push(`${path}: movePieces must be piece letters[]`);
        }
        if (lv.avoidAttacked !== undefined && typeof lv.avoidAttacked !== 'boolean') {
            errors.push(`${path}: avoidAttacked must be boolean`);
        }
        if (lv.opponent !== undefined && typeof lv.opponent !== 'boolean') {
            errors.push(`${path}: opponent must be boolean`);
        }
        if (!Number.isInteger(lv.par) || lv.par < 1) errors.push(`${path}: par (integer >= 1) required, BFS-verified`);
        if (lv.maxMoves !== undefined && (!Number.isInteger(lv.maxMoves) || lv.maxMoves < lv.par)) {
            errors.push(`${path}: maxMoves must be an integer >= par`);
        }
    }
    // Type-specific required fields.
    if (lv.type === 'reach-square') {
        if (typeof lv.target !== 'string' || !SQ_RE.test(lv.target)) errors.push(`${path}: target square required`);
        if (lv.piece !== undefined && !/^[prnbqk]$/i.test(lv.piece)) errors.push(`${path}: bad piece filter`);
    }
    if (lv.type === 'best-move' || lv.type === 'mate-in-n') {
        if (!lv.solution || !Array.isArray(lv.solution.moves) || lv.solution.moves.length === 0) {
            errors.push(`${path}: solution.moves[] required`);
        } else if (!lv.solution.moves.every((m) => typeof m === 'string' && UCI_RE.test(m))) {
            errors.push(`${path}: solution.moves must be UCI like e2e4`);
        }
        if (lv.solution && lv.solution.acceptAlso !== undefined &&
            (!Array.isArray(lv.solution.acceptAlso) || !lv.solution.acceptAlso.every((m) => UCI_RE.test(m)))) {
            errors.push(`${path}: solution.acceptAlso must be UCI list`);
        }
        if (lv.type === 'mate-in-n' && (!lv.solution || !Number.isInteger(lv.solution.mateIn) || lv.solution.mateIn < 1)) {
            errors.push(`${path}: solution.mateIn >= 1 required`);
        }
    }
    if (lv.type === 'capture-all') {
        if (!Array.isArray(lv.targets) || lv.targets.length === 0 || !lv.targets.every((s) => SQ_RE.test(s))) {
            errors.push(`${path}: targets[] squares required`);
        }
    }
}

/** Full schema pass over the curriculum file. */
export function validateSchema(data) {
    const errors = [], warnings = [];
    if (!data || typeof data !== 'object') return { errors: ['root: not an object'], warnings };
    if (data.version !== CURRICULUM_VERSION) errors.push(`root: version must be ${CURRICULUM_VERSION}`);
    if (!Array.isArray(data.stages) || data.stages.length === 0) errors.push('root: stages[] required');
    if (!Array.isArray(data.levels) || data.levels.length === 0) errors.push('root: levels[] required');
    if (!Array.isArray(data.sets) || data.sets.length === 0) errors.push('root: sets[] required');
    const stageNos = new Set((data.stages || []).map((s) => s.n));
    const setIds = new Set();
    for (const set of data.sets || []) {
        if (!set || typeof set.id !== 'string' || !set.id) { errors.push('sets[]: each set needs a string id'); continue; }
        if (setIds.has(set.id)) errors.push(`set ${set.id}: duplicate id`);
        setIds.add(set.id);
        if (!Number.isInteger(set.stage) || !stageNos.has(set.stage)) {
            errors.push(`set ${set.id}: stage ${set.stage} not in stages[]`);
        }
        t(set.title, `set ${set.id}`, errors, warnings, 'title');
        if (set.desc !== undefined) t(set.desc, `set ${set.id}`, errors, warnings, 'desc');
    }
    const seen = new Set();
    for (const lv of data.levels || []) {
        validateLevelSchema(lv, seen, errors, warnings);
        if (Number.isInteger(lv.stage) && !stageNos.has(lv.stage)) {
            errors.push(`level ${lv.id}: stage ${lv.stage} not in stages[]`);
        }
        if (lv.set !== undefined && !setIds.has(lv.set)) {
            errors.push(`level ${lv.id}: set ${JSON.stringify(lv.set)} not in sets[]`);
        }
    }
    // Every set must own at least one level (otherwise the UI shows an empty card).
    for (const set of data.sets || []) {
        if (set && set.id && !(data.levels || []).some((l) => l.set === set.id)) {
            errors.push(`set ${set.id}: no levels reference it`);
        }
    }
    return { errors, warnings };
}

/** Engine pass. Returns [{id, type, status:'pass'|'fail'|'skip', detail}]. */
export function validateEngine(data, api) {
    const out = [];
    for (const lv of data.levels || []) {
        try {
            out.push(checkLevel(lv, api));
        } catch (e) {
            out.push({ id: lv.id, type: lv.type, status: 'fail', detail: `exception: ${String(e && e.message || e).slice(0, 120)}` });
        }
    }
    return out;
}

/* ── free-move geometry (no engine needed) ───────────────────────────
   pathBetween(): squares strictly BETWEEN from and to on straight/diagonal
   lines (exclusive of endpoints). [] for adjacent steps, null for
   non-sliding geometry (knight jumps). Shared by solver and game runtime. */
function _fileRank(sq) {
    return { f: sq.charCodeAt(0) - 97, r: 8 - parseInt(sq[1], 10) };
}
function _sqOf(f, r) {
    return String.fromCharCode(97 + f) + (8 - r);
}
export function pathBetween(from, to) {
    const a = _fileRank(from), b = _fileRank(to);
    const df = b.f - a.f, dr = b.r - a.r;
    if (df === 0 && dr === 0) return [];
    if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null;
    const steps = Math.max(Math.abs(df), Math.abs(dr));
    const out = [];
    for (let i = 1; i < steps; i++) {
        out.push(_sqOf(a.f + Math.sign(df) * i, a.r + Math.sign(dr) * i));
    }
    return out;
}

/* ── deterministic defender ("opponent": true levels) ───────────────
   After every player move the enemy answers with ONE move chosen from the
   position. The same function runs in the runtime (engine.js) and inside
   solveFreeMove(), so par/stars are computed on exactly the chess the
   player will face.

   Pure function of the position - no randomness, no clock: candidates are
   scored with integer arithmetic and ties break on UCI order, so chess.js
   in the browser and the legacy engine in node always pick the same move.

   Hard rules (the coach plays back but never ruins the lesson):
     - never mates or stalemates the player
     - never captures the piece standing on goal.reach.square
     - never MOVES a piece standing on a goal.capture square (the target
       stays put until the player takes it)
     - never leaves the player with zero legal moves under the level's own
       rules (obstacles + movePieces allowlist - covers king-capture
       soft-locks and obstacle-blocked checks alike)
   Scoring, highest wins: captures, checks, promotions, central squares,
   minus hanging the piece it just moved. */
const DEF_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function defCenterBonus(sq) {
    const f = sq.charCodeAt(0) - 97;
    const r = parseInt(sq[1], 10) - 1;
    const df = Math.abs(f - 3.5), dr = Math.abs(r - 3.5);
    if (df <= 1 && dr <= 1) return 2;
    if (df <= 2.5 && dr <= 2.5) return 1;
    return 0;
}

function defLevelLegal(m, allowed, obstacles) {
    const mover = (m.piece || '').toLowerCase();
    if (allowed.size && !allowed.has(mover)) return false;
    if (m.to === m.from) return false;
    if (obstacles.has(m.to)) return false;
    const between = pathBetween(m.from, m.to);
    return !(between && between.some((s) => obstacles.has(s)));
}

/** Pick the defender's reply. `g` must be a full solver-surface game whose
 *  side to move is the defender (turn is set defensively here anyway).
 *  Returns a UCI string (promotion suffix included) or null. */
export function chooseDefenderMove(level, g, player) {
    const enemy = player === 'w' ? 'b' : 'w';
    const goal = level.goal || {};
    const obstacles = new Set(level.obstacles || []);
    const allowed = new Set((level.movePieces || []).map((s) => s.toLowerCase()));
    const reachSq = goal.reach ? goal.reach.square : null;
    const captureSquares = new Set(goal.capture || []);
    const lastRank = enemy === 'w' ? '8' : '1';

    let moves;
    try {
        g.setTurn(enemy);
        moves = g.listDetailed();
    } catch (_) { return null; }
    if (!moves || !moves.length) return null;

    const isPlayerLetter = (letter) => !!letter &&
        (player === 'w' ? letter === letter.toUpperCase() : letter === letter.toLowerCase());

    // Deterministic candidate list: UCI order, defender always queens.
    const cands = [];
    for (const m of moves) {
        const piece = (m.piece || '').toLowerCase();
        const promo = (piece === 'p' && m.to[1] === lastRank) ? 'q' : null;
        cands.push({ uci: m.from + m.to + (promo || ''), piece, from: m.from, to: m.to });
    }
    cands.sort((a, b) => (a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0));

    let best = null;
    for (const c of cands) {
        // Leave the lesson's targets alone.
        const victim = g.pieceOn(c.to);
        if (victim && isPlayerLetter(victim) && c.to === reachSq) continue;
        if (captureSquares.has(c.from)) continue;
        const snap = g.snapshot();
        let rec = null;
        try {
            g.setTurn(enemy);
            rec = g.playDetailed(c.uci.slice(0, 4), c.uci[4] || undefined);
        } catch (_) { rec = null; }
        if (!rec) { g.restore(snap); continue; }
        if (rec.mate || rec.stalemate) { g.restore(snap); continue; }
        // The player must always still have a move under the level's rules.
        try {
            g.setTurn(player);
            if (!g.listDetailed().some((m2) => defLevelLegal(m2, allowed, obstacles))) {
                g.restore(snap);
                continue;
            }
        } catch (_) { /* engine hiccup: keep the candidate */ }
        let hanging = false;
        try { hanging = g.attacked(c.to, player === 'w' ? 'white' : 'black'); } catch (_) { hanging = false; }
        let score = 0;
        if (rec.captured) score += 10 * (DEF_VALUES[String(rec.captured).toLowerCase()] || 1);
        if (rec.check) score += 4;
        if (rec.promotion) score += 3;
        score += defCenterBonus(c.to);
        if (hanging) score -= 6 * (DEF_VALUES[c.piece] || 1);
        g.restore(snap);
        // Strict > keeps the FIRST best, and candidates are UCI-ordered.
        if (!best || score > best.score) best = { uci: c.uci, score };
    }
    return best ? best.uci : null;
}

/* ── BFS solver for free-move levels ─────────────────────────────────
   Extra-turn rule: after every player move the side to move is forced back
   to the player (same rule the game runtime uses). Only the player's moves
   are searched; enemy pieces never move.
   api.load(fen) game must ALSO provide (beyond the base surface):
     setTurn('w'|'b'), boardKey(), attacked(sq, 'white'|'black'),
     pieceOn(sq), epSquare() (algebraic or null), snapshots via snapshot()/restore().
   Returns {reachable, par, lines:[[uci...]] (up to 3 optimal), expanded,
            failReason}. uci carries a promotion suffix (e7e8q) when promoted. */
const SOLVER_NODE_BUDGET = 200000;

export function solveFreeMove(level, api, maxDepth) {
    const goal = level.goal || {};
    const wantCollect = new Set(goal.collect || []);
    const wantCapture = new Set(goal.capture || []);
    const reach = goal.reach || null;
    const obstacles = new Set(level.obstacles || []);
    const avoidAttacked = !!level.avoidAttacked;
    const allowed = new Set((level.movePieces || []).map((s) => s.toLowerCase()));
    const cap = Math.min(maxDepth || level.maxMoves || 12, 15);

    for (const s of wantCollect) {
        if (obstacles.has(s)) {
            return { reachable: false, par: null, lines: [], expanded: 0, failReason: `collect square ${s} is blocked by obstacles` };
        }
    }

    const start = api.load(level.fen);
    if (!start) return { reachable: false, par: null, lines: [], expanded: 0, failReason: 'FEN did not load' };
    const player = start.turn() === 'b' ? 'b' : 'w';
    const enemyName = player === 'w' ? 'black' : 'white';
    const isPlayerPiece = (p) => !!p && (player === 'w' ? p === p.toUpperCase() : p === p.toLowerCase());

    const missing = [...wantCapture].filter((sq) => {
        const victim = start.pieceOn(sq);
        return !victim || isPlayerPiece(victim);
    });
    if (missing.length) {
        return { reachable: false, par: null, lines: [], expanded: 0, failReason: `capture target(s) hold no enemy piece: ${missing.join(',')}` };
    }

    // Squares already satisfied at start (own piece sitting on a star counts).
    const startColl = [...wantCollect].filter((sq) => isPlayerPiece(start.pieceOn(sq)));
    if (wantCollect.size > 0 && startColl.length === wantCollect.size && wantCapture.size === 0 && !reach) {
        return { reachable: true, par: 0, lines: [[]], expanded: 0, failReason: null };
    }

    const keyOf = (game, coll, cap) =>
        game.boardKey() + '|' + [...coll].sort().join(',') + '|' + [...cap].sort().join(',');

    const goalMet = (coll, cap, lastMove) => {
        for (const s of wantCollect) if (!coll.has(s)) return false;
        for (const s of wantCapture) if (!cap.has(s)) return false;
        if (reach) {
            if (!lastMove || lastMove.to !== reach.square) return false;
            if (reach.piece && lastMove.mover !== reach.piece.toLowerCase() &&
                lastMove.promoted !== reach.piece.toLowerCase()) return false;
        }
        // Opponent-state goals: flags captured right after the move, before the
        // turn rewrite — they describe the ENEMY king (check/mate/stalemate).
        if (goal.check === true && !(lastMove && lastMove.check)) return false;
        if (goal.mate === true && !(lastMove && lastMove.mate)) return false;
        if (goal.stalemate === true && !(lastMove && lastMove.stalemate)) return false;
        return true;
    };

    const visited = new Set();
    const queue = [{ snap: start.snapshot(), coll: new Set(startColl), cap: new Set(), path: [], last: null }];
    visited.add(keyOf(start, new Set(startColl), new Set()));
    let expanded = 0;
    const solutions = [];

    const g = api.load(level.fen); // scratch game, repositioned per node
    while (queue.length) {
        const node = queue.shift();
        if (node.path.length >= cap) continue;
        g.restore(node.snap);
        g.setTurn(player);
        let moves;
        try {
            moves = g.listDetailed();
        } catch (_) {
            continue;
        }
        for (const m of moves) {
            const mover = (m.piece || '').toLowerCase();
            if (allowed.size && !allowed.has(mover)) continue;
            if (m.to === m.from) continue;
            if (obstacles.has(m.to)) continue;
            const between = pathBetween(m.from, m.to);
            if (between && between.some((s) => obstacles.has(s))) continue;
            // Expand promotions (pawn reaching the last rank chooses a piece).
            const lastRank = (player === 'w' && m.to[1] === '8') || (player === 'b' && m.to[1] === '1');
            const promos = (mover === 'p' && lastRank) ? ['q', 'r', 'b', 'n'] : [null];
            for (const promo of promos) {
                g.restore(node.snap);
                g.setTurn(player);
                let rec;
                try {
                    rec = g.playDetailed(m.uci, promo);
                } catch (_) {
                    continue;
                }
                if (!rec) continue;
                const uci = m.uci + (promo || '');
                if (avoidAttacked) {
                    let bad = false;
                    try {
                        bad = g.attacked(m.to, enemyName);
                    } catch (_) {
                        bad = false;
                    }
                    if (bad) continue;
                }
                const coll = new Set(node.coll);
                const capSet = new Set(node.cap);
                if (wantCollect.has(m.to)) coll.add(m.to);
                if (rec.captured) {
                    const capSq = rec.epCapture || m.to;
                    if (wantCapture.has(capSq)) capSet.add(capSq);
                }
                const lastMove = {
                    to: m.to, mover, promoted: promo,
                    check: !!(rec && rec.check), mate: !!(rec && rec.mate), stalemate: !!(rec && rec.stalemate),
                };
                if (goalMet(coll, capSet, lastMove)) {
                    solutions.push([...node.path, uci]);
                    if (solutions.length >= 3) {
                        return {
                            reachable: true, par: node.path.length + 1, lines: solutions,
                            expanded, failReason: null,
                        };
                    }
                    continue; // keep BFS layer complete for par honesty
                }
                if (node.path.length + 1 >= cap) continue;
                // Opponent reply: the defender answers from the exact policy
                // the runtime uses, then the extra-turn rule hands the move
                // back to the player (mirrors engine.js). Only player moves
                // count toward par; the reply is part of the transition.
                if (level.opponent) {
                    const replyUci = chooseDefenderMove(level, g, player);
                    if (replyUci) {
                        try { g.playDetailed(replyUci.slice(0, 4), replyUci[4] || undefined); } catch (_) { /* keep position */ }
                    }
                    g.setTurn(player);
                }
                const key = keyOf(g, coll, capSet);
                if (visited.has(key)) continue;
                visited.add(key);
                queue.push({ snap: g.snapshot(), coll, cap: capSet, path: [...node.path, uci], last: lastMove });
                if (++expanded > SOLVER_NODE_BUDGET) {
                    return { reachable: false, par: null, lines: [], expanded, failReason: `search budget exceeded (${SOLVER_NODE_BUDGET} nodes)` };
                }
            }
        }
        if (solutions.length) {
            return {
                reachable: true, par: node.path.length + 1, lines: solutions,
                expanded, failReason: null,
            };
        }
    }
    return {
        reachable: solutions.length > 0, par: solutions.length ? solutions[0].length : null,
        lines: solutions, expanded,
        failReason: solutions.length ? null : `goal unreachable within ${cap} moves`,
    };
}

function checkLevel(lv, api) {
    const fail = (detail) => ({ id: lv.id, type: lv.type, status: 'fail', detail });
    const pass = (detail) => ({ id: lv.id, type: lv.type, status: 'pass', detail });
    const skip = (detail) => ({ id: lv.id, type: lv.type, status: 'skip', detail });
    if (lv.planned === true) return skip('planned lesson (Coming soon) — no engine check');
    if (lv.mode === 'free-move') {
        if (typeof api.load !== 'function' || typeof api.load(lv.fen)?.setTurn !== 'function') {
            return skip('needs full solver API (setTurn/attacked/snapshot) — chess.js adapter in batch 2');
        }
        const res = solveFreeMove(lv, api);
        if (!res.reachable) return fail(res.failReason || 'unreachable');
        const shown = res.lines.slice(0, 2).map((l) => l.join(' ')).join('  |  ');
        if (lv.par !== res.par) {
            return fail(`stored par ${lv.par} != BFS par ${res.par} — optimal: ${shown}`);
        }
        if (lv.maxMoves !== undefined && res.par > lv.maxMoves) {
            return fail(`par ${res.par} exceeds maxMoves ${lv.maxMoves}`);
        }
        return pass(`par ${res.par} (${res.expanded} nodes): ${shown}`);
    }
    const game = api.load(lv.fen);
    if (!game) return fail('FEN did not load');
    const legal = game.listMoves(); // uci strings, side to move

    if (lv.type === 'reach-square') {
        const piece = (lv.piece || '').toLowerCase();
        const hits = legal.filter((uci) => uci.slice(2, 4) === lv.target);
        if (hits.length === 0) return fail(`nothing reaches ${lv.target}`);
        if (piece) {
            // Piece filter check needs the mover: replay each hit on a clone.
            const byPiece = hits.filter((uci) => {
                const g2 = api.load(lv.fen);
                const mover = g2.pieceOn ? g2.pieceOn(uci.slice(0, 2)) : null;
                return mover && mover.toLowerCase() === piece;
            });
            if (byPiece.length === 0) return fail(`no ${piece} reaches ${lv.target}`);
            return pass(`${byPiece.length} ${piece}-move(s) reach ${lv.target}`);
        }
        return pass(`${hits.length} move(s) reach ${lv.target}`);
    }

    if (lv.type === 'best-move') {
        const illegal = lv.solution.moves.filter((m) => !legal.includes(m));
        if (illegal.length) return fail(`solution illegal: ${illegal.join(',')}`);
        return pass(`${lv.solution.moves.length}/${legal.length} listed moves legal`);
    }

    if (lv.type === 'mate-in-n') {
        if (lv.solution.mateIn !== 1) return skip('multi-move mates enforced with engine.js runtime (batch 2)');
        const allowed = new Set([...lv.solution.moves, ...(lv.solution.acceptAlso || [])]);
        const mating = [];
        for (const uci of legal) {
            const g2 = api.load(lv.fen);
            if (!g2.play(uci)) continue;
            if (g2.isCheckmate()) mating.push(uci);
        }
        const unlisted = mating.filter((m) => !allowed.has(m));
        if (unlisted.length) return fail(`unlisted mates exist: ${unlisted.join(',')}`);
        const listedMiss = lv.solution.moves.filter((m) => !mating.includes(m));
        if (listedMiss.length) return fail(`listed move does not mate: ${listedMiss.join(',')}`);
        return pass(`mate via ${mating.join(',') || '(none?)'} — unique as listed`);
    }

    if (lv.type === 'capture-all') {
        if (!api.load(lv.fen).pieceOn) return skip('needs pieceOn() (lands with chess.js adapter)');
        const g2 = api.load(lv.fen);
        const bad = lv.targets.filter((sq) => {
            const victim = g2.pieceOn(sq);
            if (!victim) return true;
            return !legal.some((uci) => uci.slice(2, 4) === sq);
        });
        if (bad.length) return fail(`uncapturable targets: ${bad.join(',')}`);
        return pass(`${lv.targets.length} targets capturable`);
    }

    return skip(`${lv.type}: enforced with engine.js runtime (batch 2)`);
}

/** Combined runner for the browser console. Returns {schema, engine}. */
export function runAllTests(data, api) {
    const schema = validateSchema(data);
    const engine = api ? validateEngine(data, api) : null;
    const fails = (engine || []).filter((r) => r.status === 'fail');
    if (typeof console !== 'undefined') {
        console.log(`[lessons] schema: ${schema.errors.length} error(s), ${schema.warnings.length} warning(s)`);
        schema.errors.forEach((e) => console.error('  schema ERROR: ' + e));
        if (engine) {
            const skipped = engine.filter((r) => r.status === 'skip').length;
            console.log(`[lessons] engine: ${engine.length - fails.length - skipped} pass, ${fails.length} fail, ${skipped} skip`);
            engine.forEach((r) => console.log(`  ${r.status.toUpperCase()} ${r.id}: ${r.detail}`));
        } else {
            console.log('[lessons] engine: skipped (no chess adapter — batch 2 wires chess.js)');
        }
    }
    return { schema, engine };
}

/** Fetch + schema-check the curriculum file. Throws on schema errors. */
export async function loadLessons(url = 'data/lessons.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`lessons fetch ${res.status} at ${url}`);
    const data = await res.json();
    const { errors } = validateSchema(data);
    if (errors.length) throw new Error(`lessons schema: ${errors[0]}`);
    return data;
}
