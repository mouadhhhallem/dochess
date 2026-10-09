/**
 * study.js — DoChess Study workspace (classic script, file:// compatible).
 *
 * A local-first analysis workspace: study library (localStorage), move tree
 * with variations + comments + arrows, PGN/FEN import-export, keyboard
 * navigation, practice trainer, and a real engine layer:
 *   1. Stockfish 10 (official release, vendored WASM in vendor/stockfish/)
 *      over a same-origin Web Worker with a small UCI client, or
 *   2. a built-in depth-limited local search, clearly labelled, when the
 *      browser cannot start workers (e.g. file:// opaque origins) or the
 *      WASM binary fails to load. Evaluations are never fabricated: the UI
 *      shows a genuine loading state until measured numbers arrive.
 *
 * Chess rules/SAN/PGN come from the vendored chess.js 0.10.3 global `Chess`
 * (already shipped for the Learn curriculum). Board art reuses
 * assets/pieces/ and the global square/piece CSS classes.
 */
(function () {
'use strict';

/* ── tiny helpers (global esc()/app reused when present) ── */
function esc(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function algToRC(alg) {
    return [8 - parseInt(alg[1], 10), 'abcdefgh'.indexOf(alg[0])];
}
function rcToAlg(r, c) {
    return 'abcdefgh'[c] + String(8 - r);
}
function debounce(fn, ms) {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ══════════════════════════════════════════════════════════════
   ENGINE CLIENT — Stockfish 10 WASM over a same-origin Worker,
   with a labelled local-search fallback. No fabricated numbers:
   every displayed score comes from a measured search.
   Distribution: vendor/stockfish/ (SF 10 2019-08-15, single-threaded
   WASM + classic worker loader). See docs/STOCKFISH.md for version,
   source, license and why this build (no SharedArrayBuffer, so it
   runs without cross-origin isolation on GitHub Pages).
   Stockfish is GPLv3 — license text vendored alongside the binary.
   ══════════════════════════════════════════════════════════════ */
const SF_WORKER_URL = 'vendor/stockfish/stockfish.wasm.js';
const SF_BOOT_TIMEOUT = 25000;

function createEngineClient(callbacks) {
    // callbacks: onStatus(state, detail), onResult(token, result)
    const cb = callbacks || {};
    const client = {
        kind: 'none',           // 'stockfish' | 'local'
        status: 'idle',         // idle|booting|ready|busy|error|unavailable
        statusDetail: '',
        worker: null,
        token: 0,
        pending: null,          // { token, fen, depth, multipv, wantPV }
        depth: 16,
        multipv: 3,
        _ready: false,
        _gotUciok: false,
        _onmessage(e) {
            const line = String((e && e.data) == null ? '' : e.data);
            if (!line) return;
            if (!client._gotUciok) {
                if (/uciok/.test(line)) {
                    client._gotUciok = true;
                    client._send('isready');
                }
                return;
            }
            if (line === 'readyok') {
                client._ready = true;
                client._setStatus(client.pending ? 'busy' : 'ready', '');
                if (client.pending) client._launch();
                return;
            }
            client._onEngineLine(line);
        },
        _setStatus(s, detail) {
            client.status = s; client.statusDetail = detail || '';
            try { if (cb.onStatus) cb.onStatus(s, client.statusDetail); } catch (_) {}
        },
        _send(cmd) {
            try { client.worker.postMessage(cmd); }
            catch (e) { client._fail('postMessage failed: ' + String((e && e.message) || e).slice(0, 120)); }
        },
        _fail(reason) {
            try { client.worker.terminate(); } catch (_) {}
            client.worker = null; client._ready = false;
            client.kind = 'local';
            client._setStatus('unavailable', reason);
            // A search that was in flight falls back to the local engine so
            // the panel still answers honestly instead of hanging.
            const p = client.pending; client.pending = null;
            if (p) {
                const r = localAnalyze(p.fen, { depth: 2 });
                try { if (cb.onResult) cb.onResult(p.token, r); } catch (_) {}
            }
        },
        ensure() {
            if (client.worker || client.kind === 'local') return true;
            client._setStatus('booting', 'Starting Stockfish…');
            let w;
            try {
                w = new Worker(SF_WORKER_URL);
            } catch (e) {
                const why = String((e && e.message) || e);
                const fileHint = /null|opaque|file:/i.test(why) || location.protocol === 'file:'
                    ? 'Browsers cannot start engine workers from file:// pages. Serve the folder over http (e.g. `npx serve .`) or open the GitHub Pages URL for full Stockfish.'
                    : why.slice(0, 160);
                client.kind = 'local';
                client._setStatus('unavailable', fileHint);
                return false;
            }
            client.worker = w;
            client.kind = 'stockfish';
            let booted = false;
            w.onmessage = (e) => client._onmessage(e);
            w.onerror = (e) => {
                client._fail('Engine worker error: ' + String((e && e.message) || 'load failed — the vendored binary may be missing.').slice(0, 160));
            };
            client._bootTimer = setTimeout(() => {
                if (!booted && !client._gotUciok) client._fail('Engine timed out while starting (25s). The built-in local engine is used instead.');
            }, SF_BOOT_TIMEOUT);
            const watch = setInterval(() => {
                if (client._gotUciok || !client.worker) { clearInterval(watch); booted = true; clearTimeout(client._bootTimer); }
            }, 200);
            try { w.postMessage('uci'); } catch (e) { client._fail('Could not talk to the engine worker.'); }
            return true;
        },
        analyze(fen, opts) {
            const o = opts || {};
            const token = ++client.token;
            const depth = clamp(o.depth || client.depth || 16, 1, 30);
            if (!client.ensure()) {
                // Local fallback path (worker unavailable, e.g. file://).
                const r = localAnalyze(fen, { depth: 2 });
                setTimeout(() => { try { if (cb.onResult) cb.onResult(token, r); } catch (_) {} }, 0);
                return token;
            }
            // Serialize searches: lines from the previous search can still
            // be in flight after `stop`. Never mix them into the new
            // position's summary — wait for its bestmove, then launch.
            if (client.pending) {
                client._send('stop');
                client._draining = true;
                client._queued = { token, fen, depth };
                return token;
            }
            client.pending = { token, fen, depth, multipv: 3 };
            client._lines = [];
            if (client._ready) { client._setStatus('busy', ''); client._launch(); }
            return token;
        },
        _launch() {
            const p = client.pending;
            if (!p || !client._ready) return;
            client._send('stop');
            client._send('setoption name MultiPV value 3');
            client._send('position fen ' + p.fen);
            client._send('go depth ' + p.depth);
        },
        cancel() {
            client.token++;
            client.pending = null;
            client._draining = false; client._queued = null;
            if (client.worker && client._ready) { try { client.worker.postMessage('stop'); } catch (_) {} }
            if (client.status === 'busy') client._setStatus('ready', '');
        },
        _onEngineLine(line) {
            const p = client.pending;
            if (!p && !client._draining) return;
            if (line.indexOf('bestmove') === 0) {
                // Previous search draining after a superseding analyze():
                // discard its tail, then launch the queued position.
                if (client._draining) {
                    client._draining = false;
                    const q = client._queued; client._queued = null;
                    client.pending = null;
                    if (q) {
                        client.pending = { token: q.token, fen: q.fen, depth: q.depth, multipv: 3 };
                        client._lines = [];
                        if (client._ready) { client._setStatus('busy', ''); client._launch(); }
                    } else if (client._ready) client._setStatus('ready', '');
                    return;
                }
                if (!p) return;
                const m = /^bestmove\s+(\S+)/.exec(line);
                const best = (m && m[1] !== '(none)') ? m[1] : null;
                const result = summarizeSearch(p.fen, client._lines, best, p.depth, 'stockfish');
                client.pending = null;
                client._setStatus('ready', '');
                try { if (cb.onResult) cb.onResult(p.token, result); } catch (_) {}
                return;
            }
            if (line.indexOf('info depth') === 0) {
                if (client._draining) return; // old search's tail — never mix in
                client._lines.push(line);
                if (client._lines.length > 400) client._lines.splice(0, client._lines.length - 400);
                // Live intermediate update (throttled by sender depth growth).
                const last = client._lines[client._lines.length - 1];
                const dm = / depth (\d+)/.exec(last);
                if (dm && (+dm[1]) % 4 === 0) {
                    const partial = summarizeSearch(p.fen, client._lines, null, +dm[1], 'stockfish');
                    try { if (cb.onResult) cb.onResult(p.token, partial); } catch (_) {}
                }
            }
        }
    };
    return client;
}

/* Parse `info depth` lines (with MultiPV) + bestmove into one result.
   Scores stay side-to-move relative until display converts them. */
function summarizeSearch(fen, lines, bestUci, depth, engine) {
    const turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const byPv = {};
    let nodes = 0, nps = 0, seldepth = 0;
    lines.forEach(l => {
        const d = / depth (\d+)/.exec(l);
        const mp = / multipv (\d+)/.exec(l);
        const s = / score (cp|mate) (-?\d+)/.exec(l);
        const n = / nodes (\d+)/.exec(l);
        const np = / nps (\d+)/.exec(l);
        const sd = / seldepth (\d+)/.exec(l);
        const pv = / pv ([a-h1-8qrbn\+ ]+)/.exec(l);
        if (!d) return;
        const k = mp ? +mp[1] : 1;
        if (!byPv[k] || +d[1] >= byPv[k].depth) {
            byPv[k] = {
                depth: +d[1],
                score: s ? { type: s[1], v: +s[2] } : null,
                pv: pv ? pv[1].trim().split(/\s+/) : []
            };
        }
        if (n) nodes = Math.max(nodes, +n[1]);
        if (np) nps = Math.max(nps, +np[1]);
        if (sd) seldepth = Math.max(seldepth, +sd[1]);
    });
    const cands = Object.keys(byPv).map(Number).sort((a, b) => a - b)
        .filter(k => byPv[k].score)
        .map(k => ({ rank: k, score: byPv[k].score, pv: byPv[k].pv, depth: byPv[k].depth }));
    return { engine, turn, depth, seldepth, nodes, nps, candidates: cands, bestUci: bestUci || (cands[0] && cands[0].pv[0]) || null, complete: !!bestUci };
}

/* ── Built-in local fallback: depth-2 alpha-beta on material values.
   Weak (≈ casual club human at best) but genuine: every number shown
   under the "Local engine" badge is measured by this search. ── */
const LOCAL_MAT = { p: 100, n: 320, b: 330, r: 500, q: 950, k: 0 };
function localMaterial(ChessCtor, chess) {
    let score = 0;
    chess.board().forEach(row => row.forEach(sq => {
        if (!sq) return;
        const v = LOCAL_MAT[sq.type] || 0;
        score += sq.color === 'w' ? v : -v;
    }));
    return score; // white-relative centipawns
}
function localAnalyze(fen, opts) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const out = { engine: 'local', turn: 'w', depth: 2, seldepth: 2, nodes: 0, nps: 0, candidates: [], bestUci: null, complete: true };
    try {
        if (typeof Chess === 'undefined') return out;
        const c = new Chess(fen);
        out.turn = c.turn();
        const depth = (opts && opts.depth) || 2;
        out.depth = depth;
        let nodes = 0;
        const mat = (ch) => localMaterial(Chess, ch);
        function search(ch, d, alpha, beta, rootColor) {
            nodes++;
            if (ch.game_over()) {
                if (ch.in_checkmate()) return ch.turn() === rootColor ? -100000 - d : 100000 + d;
                return 0;
            }
            if (d === 0) {
                const m = mat(ch);
                return rootColor === 'w' ? m : -m;
            }
            const moves = ch.moves({ verbose: true });
            let best = -Infinity;
            for (const m of moves) {
                ch.move({ from: m.from, to: m.to, promotion: m.promotion });
                const v = -search(ch, d - 1, -beta, -alpha, rootColor === 'w' ? 'b' : 'w');
                ch.undo();
                if (v > best) best = v;
                if (best > alpha) alpha = best;
                if (alpha >= beta) break;
            }
            return best;
        }
        const rootColor = c.turn();
        const scored = c.moves({ verbose: true }).map(m => {
            c.move({ from: m.from, to: m.to, promotion: m.promotion });
            const v = -search(c, depth - 1, -Infinity, Infinity, rootColor === 'w' ? 'b' : 'w');
            c.undo();
            return { uci: m.from + m.to + (m.promotion || ''), scoreCpRoot: v };
        }).sort((a, b) => b.scoreCpRoot - a.scoreCpRoot);
        const toSideToMove = (v) => rootColor === c.turn() ? v : -v;
        out.candidates = scored.slice(0, 3).map((s, i) => ({
            rank: i + 1,
            score: { type: 'cp', v: toSideToMove(s.scoreCpRoot) },
            pv: [s.uci],
            depth
        }));
        out.bestUci = scored.length ? scored[0].uci : null;
        out.nodes = nodes;
        const dt = Math.max(1, ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
        out.nps = Math.round(nodes / (dt / 1000));
    } catch (_) {}
    return out;
}

/* ══════════════════════════════════════════════════════════════
   MOVE TREE — mainline + variations + comments + NAGs + arrows.
   SAN validation runs through the vendored Chess instance, so only
   legal moves ever enter the tree. FEN is stored per node, making
   navigation, engine queries and PGN export stateless replays.
   ══════════════════════════════════════════════════════════════ */
const NAG_GLYPH = { 1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!' };

function treeRoot(startFen) {
    return {
        san: null, uci: null, fen: startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        comment: '', nag: null, arrows: [], marks: [], children: [], parent: null
    };
}
function treeChild(parent, san, uci, fen) {
    const n = { san, uci, fen, comment: '', nag: null, arrows: [], marks: [], children: [], parent };
    parent.children.push(n);
    return n;
}
/* UCI string of a played move, for child matching + engine PV clicks. */
function moveUci(m) { return m.from + m.to + (m.promotion || ''); }
/* Walk from root to node, collecting UCI steps. */
function nodeLine(node) {
    const steps = [];
    let n = node;
    while (n && n.uci) { steps.unshift(n.uci); n = n.parent; }
    return steps;
}
/* Replay a UCI line on a fresh Chess instance; returns { chess, sans, ok }. */
function replayLine(startFen, ucis) {
    const out = { chess: null, sans: [], ok: true };
    try {
        if (typeof Chess === 'undefined') { out.ok = false; return out; }
        const c = new Chess(startFen);
        for (const u of ucis) {
            const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
            if (!m) { out.ok = false; break; }
            out.sans.push(m.san);
        }
        out.chess = c;
    } catch (_) { out.ok = false; }
    return out;
}
/* Legal moves from a FEN for board input (verbose). */
function legalFrom(fen, square) {
    try {
        if (typeof Chess === 'undefined') return [];
        const c = new Chess(fen);
        return c.moves({ square, verbose: true });
    } catch (_) { return []; }
}
/* Play a from/to(+promo) on top of a node: follow an existing child or
   grow one (a sibling already there makes the new child a variation). */
function playOn(node, from, to, promotion) {
    const promo = promotion || undefined;
    const uci = from + to + (promotion || '');
    const hit = node.children.find(ch => ch.uci === uci);
    if (hit) return { node: hit, isNew: false };
    let made = null;
    try {
        if (typeof Chess === 'undefined') return { node, isNew: false, illegal: true };
        const c = new Chess(node.fen);
        made = c.move({ from, to, promotion: promo });
        if (!made) return { node, isNew: false, illegal: true };
        return { node: treeChild(node, made.san, uci, c.fen()), isNew: true, san: made.san };
    } catch (_) { return { node, isNew: false, illegal: true }; }
}

/* ── Minimal PGN parser: tags, SAN moves, comments, NAGs, variations.
   The vendored load_pgn() drops variations and comments, so Study
   parses them itself and validates every SAN against a live position.
   Returns { tags, moves:[{san,comment,nag,variations:[...]}], result }
   or { error }. Variations recurse the same shape. ── */
function parsePgnText(src) {
    const text = String(src || '');
    if (!text.trim()) return { error: 'Nothing to import — paste PGN or FEN text first.' };
    // FEN pasted instead? Accept a bare FEN line gracefully.
    const firstLine = text.trim().split(/\r?\n/)[0].trim();
    if (/^([rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+\s+[wb]\s+/.test(firstLine) && text.trim().split(/\r?\n/).length === 1) {
        return { fenOnly: firstLine };
    }
    const tags = {};
    const tagRe = /\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/g;
    let tm;
    while ((tm = tagRe.exec(text)) !== null) tags[tm[1]] = tm[2];
    let movetext = text.replace(tagRe, ' ');
    // Tokenize: comments, variations, NAGs, results, move numbers, SANs.
    const tokens = [];
    const re = /(\{[^}]*\})|(\()|(\))|(\$[0-9]+)|(1-0|0-1|1\/2-1\/2|\*)|([0-9]+\s*\.(?:\.\.)?)/g;
    let last = 0, m;
    const pushWords = (s) => {
        s.split(/\s+/).forEach(w => { const t = w.trim(); if (t && t !== '...') tokens.push({ t: 'san', v: t }); });
    };
    while ((m = re.exec(movetext)) !== null) {
        pushWords(movetext.slice(last, m.index));
        if (m[1]) tokens.push({ t: 'comment', v: m[1].slice(1, -1).trim() });
        else if (m[2]) tokens.push({ t: 'open' });
        else if (m[3]) tokens.push({ t: 'close' });
        else if (m[4]) tokens.push({ t: 'nag', v: parseInt(m[4].slice(1), 10) });
        else if (m[5]) tokens.push({ t: 'result', v: m[5] });
        last = re.lastIndex;
    }
    pushWords(movetext.slice(last));
    // The token stream is consumed by buildTree() below.
    try {
        return buildTree(tokens, tags);
    } catch (e) {
        return { error: 'Could not parse that PGN: ' + String((e && e.message) || e).slice(0, 140) };
    }
}
function buildTree(tokens, tags) {
    if (typeof Chess === 'undefined') return { error: 'Chess rules unavailable — reload the page and try again.' };
    let startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (tags.SetUp === '1' && tags.FEN) {
        const probe = new Chess();
        if (!probe.load(tags.FEN)) return { error: 'The [FEN] tag in that PGN is not a legal position.' };
        startFen = tags.FEN;
    }
    const root = treeRoot(startFen);
    // Frames carry their own tail (last move played IN this frame), so
    // '(' always forks the move just played here, and ')' restores the
    // exact frame — including its tail — that was suspended.
    let frame = { node: root, chess: new Chess(startFen), tail: null, pending: '' };
    const stack = [];
    let result = null, count = 0;
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        if (tk.t === 'result') { result = tk.v; continue; }
        if (tk.t === 'comment') {
            if (frame.tail && !frame.tail.comment) frame.tail.comment = tk.v;
            else frame.pending = frame.pending ? frame.pending + '\n' + tk.v : tk.v;
            continue;
        }
        if (tk.t === 'nag') {
            if (frame.tail) frame.tail.nag = tk.v;
            continue;
        }
        if (tk.t === 'open') {
            if (!frame.tail) continue; // nothing to vary from in this frame
            stack.push(frame);
            const tail = frame.tail;
            frame = { node: tail.parent, chess: new Chess(tail.parent.fen), tail: null, pending: '' };
            continue;
        }
        if (tk.t === 'close') {
            const back = stack.pop();
            if (!back) continue;
            frame = back;
            continue;
        }
        // SAN
        const mv = frame.chess.move(tk.v);
        if (!mv) return { error: `Illegal move "${tk.v}" — import stopped after ${count} half-move${count === 1 ? '' : 's'}.`, partial: root, count };
        const uci = mv.from + mv.to + (mv.promotion || '');
        let child = frame.node.children.find(c => c.uci === uci);
        if (!child) {
            child = treeChild(frame.node, mv.san, uci, frame.chess.fen());
            if (frame.pending) { child.comment = frame.pending; frame.pending = ''; }
            // Trailing ?!/!?/!!/?? glyphs on the SAN become NAGs.
            const gl = /([?!]{1,2})$/.exec(tk.v);
            if (gl) child.nag = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 }[gl[1]] || null;
        }
        frame.node = child;
        frame.tail = child;
        count++;
    }
    if (!count) return { error: 'No legal moves found in that text.' };
    return { tags, root, result: result && result !== '*' ? result : null, count };
}

/* Serialize a tree back to PGN movetext (mainline first, variations in
   parentheses, comments in braces, NAGs as $n). */
function treeToPgn(study, chapter, node) {
    const tags = [
        '[Event "' + (study.title || 'DoChess Study') + '"]',
        '[Site "DoChess"]',
        '[White "' + ((chapter.whiteName) || 'White') + '"]',
        '[Black "' + ((chapter.blackName) || 'Black') + '"]',
        '[Result "' + (chapter.result || '*') + '"]'
    ];
    if (!chapter.root.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq')) {
        tags.push('[SetUp "1"]', '[FEN "' + chapter.root.fen + '"]');
    }
    const startBits = chapter.root.fen.split(' ');
    let moveNo = parseInt(startBits[5] || '1', 10) || 1;
    const blackToMove = (startBits[1] === 'b');
    // Flatten the mainline, splicing variations inline.
    const main = [];
    let n = chapter.root;
    while (n.children[0]) { n = n.children[0]; main.push(n); }
    let out = '';
    let white = !blackToMove, num = moveNo;
    main.forEach((m, i) => {
        if (white) out += num + '. ';
        else if (i === 0) out += num + '... ';
        out += m.san + ' ';
        if (m.nag) out += '$' + m.nag + ' ';
        if (m.comment) out += '{' + m.comment.replace(/[{}]/g, '') + '} ';
        m.children.slice(1).forEach(v => { out += '(' + renderVariation(v, white, white ? num : num + 1) + ') '; });
        if (!white) num++; // fullmove numbers advance after Black's move
        white = !white;
    });
    out += (chapter.result || '*');
    return tags.join('\n') + '\n\n' + out.trim() + '\n';
}
function renderVariation(n, parentWhite, num) {
    // n is the variation's first move; side to move is !parentWhite.
    let s = '';
    let white = !parentWhite, m = n, nn = num;
    while (m) {
        s += white ? nn + '. ' : (m === n ? nn + '... ' : '');
        s += m.san + ' ';
        if (m.nag) s += '$' + m.nag + ' ';
        if (m.comment) s += '{' + m.comment.replace(/[{}]/g, '') + '} ';
        m.children.slice(1).forEach(v => { s += '(' + renderVariation(v, white, white ? nn + 1 : nn) + ') '; });
        if (white) nn++;
        white = !white;
        m = m.children[0];
    }
    return s.trim();
}

/* ══════════════════════════════════════════════════════════════
   LIBRARY STORE — local-first studies + saved positions.
   Key namespaces per signed-in user like the rest of the app
   (` anon` keeps the legacy guest bucket). Shape is additive and
   versioned so a future cloud sync can adopt it without a rewrite.
   ══════════════════════════════════════════════════════════════ */
const STUDY_KEY_PREFIX = 'dcstudy_v1_';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function studyUserId() {
    try { return (window.app && window.app.userId) || 'anon'; } catch (_) { return 'anon'; }
}
function studyKey() { return STUDY_KEY_PREFIX + studyUserId(); }
function blankStudy(title) {
    const now = Date.now();
    return { id: uid('st'), title: title || 'Untitled study', desc: '', tags: [], chapters: [], createdAt: now, updatedAt: now, visited: [] };
}
function blankChapter(title, startFen) {
    return { id: uid('ch'), title: title || 'Chapter 1', whiteName: '', blackName: '', result: '*', notes: '', root: treeRoot(startFen), createdAt: Date.now() };
}
function reviveTree(raw, parent) {
    // Stored trees are plain JSON; re-link parents on load.
    const n = {
        san: raw.san ?? null, uci: raw.uci ?? null, fen: raw.fen,
        comment: raw.comment || '', nag: raw.nag ?? null,
        arrows: Array.isArray(raw.arrows) ? raw.arrows : [],
        marks: Array.isArray(raw.marks) ? raw.marks : [],
        eval: raw.eval && typeof raw.eval === 'object' ? raw.eval : null,
        cls: raw.cls || null,
        children: [], parent: parent || null
    };
    (raw.children || []).forEach(c => n.children.push(reviveTree(c, n)));
    return n;
}
function loadLibrary() {
    const lib = { studies: [], positions: [] };
    try {
        const raw = localStorage.getItem(studyKey());
        if (!raw) return lib;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return lib;
        if (Array.isArray(data.studies)) {
            data.studies.forEach(s => {
                if (!s || typeof s.title !== 'string') return;
                const st = {
                    id: String(s.id || uid('st')), title: s.title.slice(0, 80),
                    desc: typeof s.desc === 'string' ? s.desc.slice(0, 2000) : '',
                    tags: Array.isArray(s.tags) ? s.tags.filter(t => t === 'opening').slice(0, 4) : [],
                    chapters: [], createdAt: +s.createdAt || Date.now(), updatedAt: +s.updatedAt || Date.now(),
                    visited: Array.isArray(s.visited) ? s.visited.filter(x => typeof x === 'string') : [],
                    repertoire: Array.isArray(s.repertoire) ? s.repertoire.filter(r => r && typeof r.name === 'string' && Array.isArray(r.ucis)).slice(0, 200).map(r => ({ id: String(r.id || uid('rp')), name: r.name.slice(0, 80), ucis: r.ucis.filter(u => typeof u === 'string').slice(0, 300), note: typeof r.note === 'string' ? r.note.slice(0, 500) : '' })) : []
                };
                (s.chapters || []).forEach(ch => {
                    if (!ch || !ch.root || typeof ch.root.fen !== 'string') return;
                    st.chapters.push({
                        id: String(ch.id || uid('ch')), title: String(ch.title || 'Chapter').slice(0, 80),
                        whiteName: String(ch.whiteName || '').slice(0, 40), blackName: String(ch.blackName || '').slice(0, 40),
                        result: ['1-0', '0-1', '1/2-1/2', '*'].includes(ch.result) ? ch.result : '*',
                        notes: typeof ch.notes === 'string' ? ch.notes.slice(0, 8000) : '',
                        root: reviveTree(ch.root, null), createdAt: +ch.createdAt || Date.now()
                    });
                });
                lib.studies.push(st);
            });
        }
        if (Array.isArray(data.positions)) {
            data.positions.forEach(p => {
                if (!p || typeof p.fen !== 'string' || typeof p.name !== 'string') return;
                lib.positions.push({ id: String(p.id || uid('pos')), name: p.name.slice(0, 80), fen: p.fen.slice(0, 200), note: typeof p.note === 'string' ? p.note.slice(0, 500) : '', createdAt: +p.createdAt || Date.now() });
            });
            lib.positions = lib.positions.slice(0, 200);
        }
    } catch (_) {}
    return lib;
}
let saveTimer = 0;
function saveLibrary(lib) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            const plain = {
                v: 1,
                studies: lib.studies.map(s => ({
                    id: s.id, title: s.title, desc: s.desc, tags: s.tags,
                    createdAt: s.createdAt, updatedAt: s.updatedAt, visited: s.visited,
                    repertoire: s.repertoire,
                    chapters: s.chapters.map(c => ({ id: c.id, title: c.title, whiteName: c.whiteName, blackName: c.blackName, result: c.result, notes: c.notes, createdAt: c.createdAt, root: stripParents(c.root) }))
                })),
                positions: lib.positions
            };
            localStorage.setItem(studyKey(), JSON.stringify(plain));
        } catch (_) {}
    }, 250);
}
function stripParents(n) {
    return { san: n.san, uci: n.uci, fen: n.fen, comment: n.comment, nag: n.nag, arrows: n.arrows, marks: n.marks, eval: n.eval, cls: n.cls, children: n.children.map(stripParents) };
}

/* ══════════════════════════════════════════════════════════════
   STUDY CONTROLLER — state, shell, library, persistence glue.
   ══════════════════════════════════════════════════════════════ */
const S = {
    lib: null,
    studyId: null, chapterId: null, node: null,
    sel: null, flip: false, tab: 'board',
    leftOpen: true, rightOpen: true, mobileTab: 'board',
    search: '', dlg: null, // {kind:'import'|'study'|'confirm'..., ...}
    engOn: true, engDepth: 16, engine: null,
    anaCache: new Map(), lastToken: 0, lastFen: null,
    practice: null, explain: '',
    newTitle: '', renameId: null, renameText: '',
    toastTimer: 0
};
function curStudy() {
    if (!S.lib) return null;
    return S.lib.studies.find(s => s.id === S.studyId) || null;
}
function curChapter(st) {
    st = st || curStudy();
    if (!st) return null;
    return st.chapters.find(c => c.id === S.chapterId) || null;
}
function touch(st) {
    st = st || curStudy();
    if (!st) return;
    st.updatedAt = Date.now();
    saveLibrary(S.lib);
}
function openChapter(st, ch) {
    S.studyId = st.id; S.chapterId = ch.id; S.node = ch.root;
    S.sel = null; S.practice = null; S.explain = '';
    if (!st.visited.includes(ch.id)) { st.visited.push(ch.id); touch(st); }
    render();
    scheduleAnalyze();
}
function toast(msg) {
    const el = $('#st-toast');
    if (el) { el.textContent = msg; el.classList.add('show'); }
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => { const t = $('#st-toast'); if (t) t.classList.remove('show'); }, 2600);
}
function tileIcon(name) {
    try {
        if (window.app && typeof window.app._tileIcon === 'function') return window.app._tileIcon(name);
    } catch (_) {}
    return '';
}
function pieceImg(piece, size) {
    // piece: 'P'..'k' like the app's set; falls back to inline glyphs.
    const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
    const white = piece === piece.toUpperCase();
    const kind = names[piece.toLowerCase()] || 'pawn';
    const v = (window.ChessCourseApp && ChessCourseApp.assetV) ? ChessCourseApp.assetV() : 'v24';
    const label = (white ? 'White ' : 'Black ') + kind;
    return `<img src="assets/pieces/${white ? 'white' : 'black'}-${kind}.svg?${v}" class="st-piece" alt="${esc(label)}" width="${size || 45}" height="${size || 45}" draggable="false" data-fallback-piece="${piece}">`;
}
function confirmDlg({ title, body, okLabel }) {
    if (window.app && typeof window.app._confirmModal === 'function') {
        return window.app._confirmModal({ title, body, okLabel: okLabel || 'Confirm', cancelLabel: 'Cancel' });
    }
    return Promise.resolve(window.confirm(title + '\n' + body));
}

/* ── shell ── */
function render() {
    const box = $('#study-content');
    if (!box) return;
    const st = curStudy(), ch = curChapter(st);
    box.innerHTML = `
    <div class="st-wrap" data-mtab="${S.mobileTab}">
        <div class="st-mobiletabs" role="tablist" aria-label="Study sections">
            ${['library', 'board', 'engine'].map(t => `<button role="tab" aria-selected="${S.mobileTab === t}" class="st-mtab${S.mobileTab === t ? ' on' : ''}" data-st="mtab" data-t="${t}" type="button">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
        <aside class="st-left${S.leftOpen ? '' : ' closed'}" aria-label="Study library">
            ${renderLibrary(st)}
        </aside>
        <section class="st-center" aria-label="Board workspace">
            ${ch ? renderCenter(st, ch) : renderCenterEmpty()}
        </section>
        <aside class="st-right${S.rightOpen ? '' : ' closed'}" aria-label="Engine analysis">
            ${renderEnginePanel(st, ch)}
        </aside>
    </div>
    <div class="st-toast" id="st-toast" role="status" aria-live="polite"></div>
    ${renderDialog()}`;
    paintBoard();
    if (ch) paintMoves();
}

/* ── library panel ── */
function studyProgress(st) {
    if (!st.chapters.length) return 0;
    const v = st.chapters.filter(c => st.visited.includes(c.id)).length;
    return Math.round((v / st.chapters.length) * 100);
}
function libraryMatches(st, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return st.title.toLowerCase().includes(q) || st.chapters.some(c => c.title.toLowerCase().includes(q));
}
function renderLibrary(active) {
    const lib = S.lib;
    const q = S.search.trim();
    const studies = lib.studies.filter(s => libraryMatches(s, q));
    const opening = studies.filter(s => s.tags.includes('opening'));
    const recent = [...lib.studies].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const card = (s) => {
        const pct = studyProgress(s);
        const upd = new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const sel = active && active.id === s.id ? ' sel' : '';
        const renaming = S.renameId === s.id;
        return `<div class="st-card${sel}" data-study="${esc(s.id)}">
            <button class="st-card-main" data-st="open-study" data-id="${esc(s.id)}" type="button" title="Open ${esc(s.title)}">
                <span class="st-card-ic" aria-hidden="true">${tileIcon('book')}</span>
                <span class="st-card-tx">
                    ${renaming
                        ? `<input class="st-rename" data-rename-input value="${esc(S.renameText)}" aria-label="Study title" maxlength="80">`
                        : `<span class="st-card-title">${esc(s.title)}</span>`}
                    <span class="st-card-sub">${s.chapters.length} chapter${s.chapters.length === 1 ? '' : 's'} · ${upd} · ${pct}%</span>
                </span>
                <span class="st-card-go" aria-hidden="true">›</span>
            </button>
            <div class="st-card-acts">
                ${renaming
                    ? `<button class="linklike" data-st="rename-save" data-id="${esc(s.id)}" type="button">Save</button>
                       <button class="linklike" data-st="rename-cancel" type="button">Cancel</button>`
                    : `<button class="linklike" data-st="rename" data-id="${esc(s.id)}" type="button">Rename</button>
                       <button class="linklike" data-st="dupe" data-id="${esc(s.id)}" type="button">Duplicate</button>
                       <button class="linklike danger" data-st="del-study" data-id="${esc(s.id)}" type="button">Delete</button>`}
            </div>
        </div>`;
    };
    const studyList = (list) => list.length ? list.map(card).join('')
        : `<p class="st-empty">${q ? 'No studies match that search.' : 'No studies yet — create your first one above.'}</p>`;
    const posRows = lib.positions.length ? lib.positions.map(p =>
        `<li class="st-pos"><button class="st-pos-main" data-st="open-pos" data-id="${esc(p.id)}" type="button" title="Load ${esc(p.name)}">
            <span class="st-card-title">${esc(p.name)}</span><span class="st-card-sub">${esc((p.note || p.fen.split(' ')[0]).slice(0, 60))}</span>
        </button><span class="st-card-acts"><button class="linklike" data-st="save-pos-over" data-id="${esc(p.id)}" type="button">Overwrite</button><button class="linklike danger" data-st="del-pos" data-id="${esc(p.id)}" type="button">Delete</button></span></li>`
    ).join('') : '<li class="st-empty">No saved positions. Open any position on the board, then save it here.</li>';
    return `
        <div class="st-pane-head">
            <button class="icon-btn st-collapse" data-st="toggle-left" type="button" aria-label="${S.leftOpen ? 'Collapse library' : 'Expand library'}" title="Collapse library"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l-7 7 7 7"/></svg></button>
            <h3>Study library</h3>
        </div>
        <div class="st-pane-body">
            <button class="btn-primary st-new" data-st="new-study" type="button"><span aria-hidden="true">+ </span>New study</button>
            <label class="st-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input id="st-search" type="search" placeholder="Search your studies…" value="${esc(S.search)}" aria-label="Search studies" maxlength="60"></label>
            <div class="st-sec"><h4>My studies <span class="st-count">${lib.studies.length}</span></h4>${studyList(studies)}</div>
            <div class="st-sec"><h4>Opening preparation <span class="st-count">${opening.length}</span></h4>
                ${opening.length ? opening.map(card).join('') : '<p class="st-empty">Tag a study as opening preparation to pin it here.</p>'}</div>
            <div class="st-sec"><h4>Saved positions <span class="st-count">${lib.positions.length}</span></h4>
                <button class="btn-secondary sm st-wide" data-st="save-pos" type="button">Save current position</button>
                <ul class="st-pos-list">${posRows}</ul></div>
            <div class="st-sec"><h4>Recently analyzed</h4>
                ${recent.length ? `<ul class="st-recent">${recent.map(s => `<li><button class="linklike" data-st="open-study" data-id="${esc(s.id)}" type="button">${esc(s.title)}</button></li>`).join('')}</ul>` : '<p class="st-empty">Nothing analyzed yet.</p>'}</div>
        </div>`;
}

/* ══════════════════════════════════════════════════════════════
   CENTER — board workspace, move list, tabs, annotations.
   ══════════════════════════════════════════════════════════════ */
function renderCenterEmpty() {
    return `<div class="st-blank">
        <div class="st-blank-ic" aria-hidden="true">${tileIcon('book')}</div>
        <h3>No study open</h3>
        <p>Create a study in the library, then add chapters of games, openings or positions to analyze.</p>
        <button class="btn-primary" data-st="new-study" type="button">New study</button>
    </div>`;
}
function chapterIndex(st, ch) { return st.chapters.findIndex(c => c.id === ch.id); }
function renderCenter(st, ch) {
    const ci = chapterIndex(st, ch);
    const editingTitle = S.renameId === 'study:' + st.id;
    const editingCh = S.renameId === 'chapter:' + ch.id;
    return `
    <div class="st-chead">
        <div class="st-ctitle">
            ${editingTitle
                ? `<input class="st-rename" data-rename-input value="${esc(S.renameText)}" aria-label="Study title" maxlength="80">`
                : `<h3>${esc(st.title)}</h3>`}
            <button class="linklike" data-st="${editingTitle ? 'rename-save' : 'rename'}" data-id="study:${esc(st.id)}" type="button">${editingTitle ? 'Save' : 'Rename'}</button>
            <button class="linklike" data-st="tag-opening" data-id="${esc(st.id)}" type="button" title="Pin under Opening preparation">${st.tags.includes('opening') ? '★ Opening' : '☆ Tag opening'}</button>
        </div>
        <div class="st-chapnav" role="group" aria-label="Chapters">
            <button class="icon-btn" data-st="prev-ch" ${ci <= 0 ? 'disabled' : ''} type="button" title="Previous chapter" aria-label="Previous chapter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l-7 7 7 7"/></svg></button>
            <span class="st-chapcount">Chapter ${ci + 1} / ${st.chapters.length}</span>
            <button class="icon-btn" data-st="next-ch" ${ci >= st.chapters.length - 1 ? 'disabled' : ''} type="button" title="Next chapter" aria-label="Next chapter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5l7 7-7 7"/></svg></button>
            <button class="btn-secondary sm" data-st="new-chapter" type="button">+ Chapter</button>
            <button class="linklike danger" data-st="del-chapter" type="button">Delete</button>
        </div>
        <div class="st-ctabs" role="tablist" aria-label="Workspace tabs">
            ${['board', 'notes', 'repertoire'].map(t => `<button role="tab" aria-selected="${S.tab === t}" class="st-ctab${S.tab === t ? ' on' : ''}" data-st="ctab" data-t="${t}" type="button">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
    </div>
    <div class="st-cmain">
        <div class="st-boardcol">
            <div class="st-boardwrap"><div class="st-board" id="st-board" role="group" aria-label="Study chessboard"></div><svg class="st-arrows" id="st-arrows" aria-hidden="true"></svg>
                <div class="st-promo" id="st-promo" hidden></div>
            </div>
            <div class="st-controls">
                <div class="movenav" role="group" aria-label="Move navigation">
                    <button class="icon-btn" data-st="nav" data-where="start" type="button" title="First position" aria-label="First position"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M18 5l-8 7 8 7"/></svg></button>
                    <button class="icon-btn" data-st="nav" data-where="prev" type="button" title="Previous move (←)" aria-label="Previous move"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l-7 7 7 7"/></svg></button>
                    <span class="st-poscount" id="st-poscount" aria-live="polite"></span>
                    <button class="icon-btn" data-st="nav" data-where="next" type="button" title="Next move (→)" aria-label="Next move"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5l7 7-7 7"/></svg></button>
                    <button class="icon-btn" data-st="nav" data-where="end" type="button" title="Latest move" aria-label="Latest move"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M6 5l8 7-8 7"/></svg></button>
                </div>
                <div class="st-ctl2">
                    <button class="btn-secondary sm" data-st="flip" type="button" aria-pressed="${S.flip}">Flip</button>
                    <button class="btn-secondary sm" data-st="import-open" type="button">Import</button>
                    <button class="btn-secondary sm" data-st="shortcuts" type="button" title="Keyboard shortcuts">?</button>
                </div>
            </div>
            <div class="st-fenrow">
                <input id="st-fen" type="text" spellcheck="false" autocomplete="off" placeholder="Paste FEN…" aria-label="FEN position" value="">
                <button class="btn-secondary sm" data-st="fen-load" type="button">Load</button>
                <button class="btn-secondary sm" data-st="fen-copy" type="button">Copy FEN</button>
            </div>
        </div>
        <div class="st-sidecol">
            ${S.tab === 'board' ? `<div class="move-log st-moves" id="st-moves" role="log" aria-live="polite" aria-label="Moves">${renderMoveList(ch)}</div>
                <div class="st-lineacts">
                    <button class="btn-secondary sm" data-st="promote" type="button" title="Make this variation the main line">Promote line</button>
                    <button class="btn-secondary sm" data-st="del-line" type="button" title="Delete this line">Delete line</button>
                    <button class="btn-secondary sm" data-st="pgn-copy" type="button">Copy PGN</button>
                </div>` : ''}
            ${S.tab === 'notes' ? renderNotesTab(st, ch) : ''}
            ${S.tab === 'repertoire' ? renderRepTab(st, ch) : ''}
        </div>
    </div>
    ${S.practice ? renderPractice() : ''}`;
}
function renderNotesTab(st, ch) {
    const n = S.node || ch.root;
    const editingCh = S.renameId === 'chapter:' + ch.id;
    return `<div class="st-notes">
        <label class="st-lab">Chapter title
            ${editingCh
                ? `<span class="st-row"><input class="st-rename" data-rename-input value="${esc(S.renameText)}" aria-label="Chapter title" maxlength="80"><button class="btn-secondary sm" data-st="rename-save" type="button">Save</button></span>`
                : `<span class="st-row"><strong>${esc(ch.title)}</strong><button class="linklike" data-st="rename" data-id="chapter:${esc(ch.id)}" type="button">Rename</button></span>`}
        </label>
        <label class="st-lab">Players (for PGN export)
            <span class="st-row"><input id="st-white" value="${esc(ch.whiteName || '')}" maxlength="40" placeholder="White" aria-label="White player"><input id="st-black" value="${esc(ch.blackName || '')}" maxlength="40" placeholder="Black" aria-label="Black player"></span>
        </label>
        <label class="st-lab">Result
            <select id="st-result" aria-label="Game result">
                ${[['*', 'Unfinished'], ['1-0', '1-0 White wins'], ['0-1', '0-1 Black wins'], ['1/2-1/2', '½-½ Draw']].map(o => `<option value="${o[0]}"${ch.result === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}
            </select>
        </label>
        <label class="st-lab">Chapter notes<textarea id="st-chapnotes" rows="4" maxlength="8000" placeholder="Plans, ideas, things to remember…">${esc(ch.notes || '')}</textarea></label>
        <div class="st-lab">Current move${n.san ? ` — ${esc(n.san)}` : ' (starting position)'}
            <textarea id="st-movecomment" rows="3" maxlength="2000" placeholder="Comment on this move…">${esc(n.comment || '')}</textarea>
        </div>
        <label class="st-lab">Annotation symbol
            <select id="st-nag" aria-label="Annotation symbol">
                <option value="">None</option>
                ${[1, 2, 3, 4, 5, 6].map(v => `<option value="${v}"${n.nag === v ? ' selected' : ''}>$${v} ${(NAG_GLYPH[v] || '')}</option>`).join('')}
            </select>
        </label>
        <div class="st-lab">Board markers
            <div class="st-marks">${(n.arrows.map(a => `<span class="st-mark">→ ${esc(a.from)}${esc(a.to)}</span>`).join('') + n.marks.map(m => `<span class="st-mark">■ ${esc(m.sq)}</span>`).join('')) || '<span class="st-dim">None. Right-click a square to mark it; right-drag for an arrow (Alt = gold, Shift = red).</span>'}</div>
            ${(n.arrows.length || n.marks.length) ? '<button class="btn-secondary sm" data-st="marks-clear" type="button">Clear markers</button>' : ''}
        </div>
    </div>`;
}
function renderRepTab(st, ch) {
    const reps = st.repertoire || [];
    return `<div class="st-rep">
        <p class="st-dim">Named lines for your opening repertoire. Adding stores the current main line from this chapter.</p>
        <button class="btn-secondary sm st-wide" data-st="rep-add" type="button">Add current line</button>
        ${reps.length ? `<ul class="st-rep-list">${reps.map(r => `<li><button class="st-pos-main" data-st="rep-load" data-id="${esc(r.id)}" type="button" title="Load ${esc(r.name)}"><span class="st-card-title">${esc(r.name)}</span><span class="st-card-sub">${r.ucis.length} half-moves${r.note ? ' · ' + esc(r.note) : ''}</span></button><span class="st-card-acts"><button class="linklike danger" data-st="rep-del" data-id="${esc(r.id)}" type="button">Delete</button></span></li>`).join('')}</ul>` : '<p class="st-empty">No repertoire lines yet.</p>'}
    </div>`;
}

/* ── board paint + input ── */
function boardFen() {
    const st = curStudy(), ch = curChapter(st);
    return (S.node || (ch && ch.root) || { fen: START_FEN }).fen;
}
function paintBoard() {
    const board = $('#st-board');
    if (!board) return;
    const fen = boardFen();
    let chess = null;
    try { chess = new Chess(fen); } catch (_) { return; }
    const turn = chess.turn(); // 'w' | 'b'
    const flip = S.flip;
    board.innerHTML = '';
    const b = chess.board(); // rank8 first
    for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) {
        const r = flip ? 7 - dr : dr, c = flip ? 7 - dc : dc;
        const sq = b[r][c];
        const alg = rcToAlg(r, c);
        const d = document.createElement('div');
        d.className = 'chess-square ' + (((r + c) % 2 === 0) ? 'white' : 'black');
        d.dataset.square = alg; d.dataset.row = String(r); d.dataset.col = String(c);
        d.setAttribute('role', 'button'); d.setAttribute('tabindex', '0');
        let label = alg + ', ' + (!sq ? 'empty' : (sq.color === 'w' ? 'white ' : 'black ') + ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[sq.type] || 'piece'));
        if (S.node && S.node.uci) {
            const lf = S.node.uci.slice(0, 2), lt = S.node.uci.slice(2, 4);
            if (alg === lf || alg === lt) d.classList.add('last-move');
        }
        if (S.sel && S.sel[0] === r && S.sel[1] === c) d.classList.add('selected');
        if (sq) {
            const piece = (sq.color === 'w' ? sq.type.toUpperCase() : sq.type);
            const w = document.createElement('div');
            w.innerHTML = pieceImg(piece);
            d.prepend(w.firstChild);
            if (chess.in_check()) {
                // mark checked king
                try {
                    const ksq = findKing(b, chess.turn());
                    if (ksq && ksq[0] === r && ksq[1] === c) { d.classList.add('in-check'); label += ', check'; }
                } catch (_) {}
            }
        }
        if (S.sel) {
            const from = rcToAlg(S.sel[0], S.sel[1]);
            const legals = legalFrom(fen, from);
            if (legals.some(m => m.to === alg)) {
                const dot = document.createElement('div');
                dot.className = sq ? 'legal-ring' : 'legal-dot';
                dot.setAttribute('aria-hidden', 'true');
                d.appendChild(dot);
            }
        }
        if (dr === 7) { const f = document.createElement('span'); f.className = 'coord-file'; f.textContent = 'abcdefgh'[c]; d.appendChild(f); }
        if (dc === 0) { const rk = document.createElement('span'); rk.className = 'coord-rank'; rk.textContent = String(8 - r); d.appendChild(rk); }
        d.setAttribute('aria-label', label);
        board.appendChild(d);
    }
    paintArrows();
    updatePosCount();
}
function findKing(b, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const sq = b[r][c];
        if (sq && sq.type === 'k' && sq.color === color) return [r, c];
    }
    return null;
}
function updatePosCount() {
    const el = $('#st-poscount');
    if (!el || !S.node) { if (el) el.textContent = ''; return; }
    const line = nodeLine(S.node);
    el.textContent = line.length ? `Move ${Math.ceil(line.length / 2)} · ${line.length} half-move${line.length === 1 ? '' : 's'}` : 'Starting position';
}
function onSquareActivate(alg) {
    const st = curStudy(), ch = curChapter(st);
    if (!st || !ch || S.practice) return;
    const fen = boardFen();
    let chess;
    try { chess = new Chess(fen); } catch (_) { return; }
    const turn = chess.turn();
    const [r, c] = algToRC(alg);
    const sq = chess.get(alg);
    if (S.sel) {
        const from = rcToAlg(S.sel[0], S.sel[1]);
        if (from === alg) { S.sel = null; paintBoard(); return; }
        const opts = legalFrom(fen, from).filter(m => m.to === alg);
        if (opts.length) {
            if (opts.length > 1 && opts.some(m => m.promotion)) { showPromoPicker(from, alg, opts); return; }
            const promo = opts[0].promotion || undefined;
            doPlayMove(from, alg, promo);
            return;
        }
    }
    if (sq && sq.color === turn) { S.sel = [r, c]; paintBoard(); }
    else { S.sel = null; paintBoard(); }
}
function showPromoPicker(from, to, opts) {
    const box = $('#st-promo');
    if (!box) return;
    let chess;
    try { chess = new Chess(boardFen()); } catch (_) { return; }
    const white = chess.turn() === 'w';
    const seen = [];
    opts.forEach(m => { if (m.promotion && !seen.includes(m.promotion)) seen.push(m.promotion); });
    box.innerHTML = `<div class="promotion-label">Promote to…</div><div class="promotion-options">` +
        seen.map(p => `<button class="promotion-btn" data-st="promo" data-from="${from}" data-to="${to}" data-p="${p}" type="button" aria-label="Promote to ${p}">${pieceImg(white ? p.toUpperCase() : p)}<span>${p.toUpperCase()}</span></button>`).join('') +
        `</div>`;
    box.hidden = false;
    box.querySelector('button')?.focus();
}
function hidePromoPicker() { const box = $('#st-promo'); if (box) { box.hidden = true; box.innerHTML = ''; } }
function doPlayMove(from, to, promotion) {
    const st = curStudy(), ch = curChapter(st);
    if (!st || !ch) return;
    hidePromoPicker();
    const before = S.node || ch.root;
    const r = playOn(before, from, to, promotion);
    if (r.illegal) { toast('Illegal move.'); return; }
    S.node = r.node; S.sel = null;
    if (r.isNew) touch(st);
    render(); // re-render movelist + panels
    scheduleAnalyze();
    if (r.isNew) toast(r.node.parent.children.length > 1 ? `New variation: ${r.san}` : `Played ${r.san}`);
}
/* navigation */
function navTo(where) {
    const st = curStudy(), ch = curChapter(st);
    if (!st || !ch) return;
    const n = S.node || ch.root;
    if (where === 'start') S.node = ch.root;
    else if (where === 'prev' && n.parent) S.node = n.parent;
    else if (where === 'next' && n.children[0]) S.node = n.children[0];
    else if (where === 'end') { let m = n; while (m.children[0]) m = m.children[0]; S.node = m; }
    else if (where === 'upvar' || where === 'downvar') {
        if (n.parent) {
            const sibs = n.parent.children;
            const i = sibs.indexOf(n);
            const j = where === 'upvar' ? i - 1 : i + 1;
            if (sibs[j]) S.node = sibs[j];
        }
    }
    S.sel = null;
    render();
    scheduleAnalyze();
}
function gotoPath(pathStr) {
    const st = curStudy(), ch = curChapter(st);
    if (!st || !ch) return;
    const steps = (pathStr || '').split(',').filter(Boolean);
    let n = ch.root;
    for (const u of steps) {
        const nxt = n.children.find(c => c.uci === u);
        if (!nxt) break;
        n = nxt;
    }
    S.node = n; S.sel = null;
    render();
    scheduleAnalyze();
}

/* ── move list with inline variations ── */
function paintMoves() {
    // Moves render inside render(); this repaints highlight + scroll only.
    const box = $('#st-moves');
    if (!box || !S.node) return;
    const cur = nodeLine(S.node).join(',');
    $all('[data-path]', box).forEach(b => b.classList.toggle('cur', b.dataset.path === cur));
    const active = box.querySelector('.st-mv.cur, .st-varmv.cur');
    if (active) { try { box.scrollTop = active.offsetTop - box.offsetTop - 40; } catch (_) {} }
}
function renderMoveList(ch) {
    const cur = S.node ? nodeLine(S.node).join(',') : '';
    function escPath(n) { return esc(nodeLine(n).join(',')); }
    function mvBtn(n, cls) {
        const glyph = n.nag && NAG_GLYPH[n.nag] ? `<sup>${NAG_GLYPH[n.nag]}</sup>` : (n.nag ? `<sup>$${n.nag}</sup>` : '');
        const hasC = n.comment ? '<span class="st-cdot" aria-hidden="true" title="Has comment">◍</span>' : '';
        const clsChip = n.cls ? `<span class="st-cls st-cls-${esc(n.cls.label.toLowerCase().replace(/[^a-z]/g, ''))}" title="${esc(`Engine: ${n.cls.label} (${n.cls.loss >= 0 ? '+' : ''}${n.cls.loss} pawns lost)`)}">${esc(n.cls.label)}</span>` : '';
        return `<button class="${cls}${escPath(n) === cur ? ' cur' : ''}" data-st="goto" data-path="${escPath(n)}" type="button"><span class="st-san">${esc(n.san)}${glyph}</span>${hasC}${clsChip}</button>`;
    }
    /* One recursive renderer for the whole tree: a move plus its
       mainline continuation inline, sibling variations in parens.
       w = side of the first move (true = White), n = its number. */
    function seqRender(firstNode, w, n, depth, mainCls) {
        let out = '', cw = w, cn = n, c = firstNode, first = true;
        while (c) {
            out += cw ? `<span class="st-num">${cn}.</span>` : (first ? `<span class="st-num">${cn}…</span>` : '');
            out += mvBtn(c, (mainCls && first && depth === 0) ? 'st-mv' : 'st-varmv');
            c.children.slice(1).forEach(v => {
                const vw = !cw, vn = cw ? cn + 1 : cn;
                out += depth < 3
                    ? `<span class="st-var">( ${seqRender(v, vw, vn, depth + 1, false)} )</span>`
                    : `<span class="st-var">( … )</span>`;
            });
            if (cw) cn++;
            cw = !cw; first = false;
            c = c.children[0];
        }
        return out;
    }
    // Top-level: root's first child starts the mainline; extra root
    // children are alternative first moves.
    let s = '';
    if (ch.root.children[0]) {
        const w0 = !isBlackToMove(ch.root.fen), n0 = startMoveNo(ch.root.fen);
        s += seqRender(ch.root.children[0], w0, n0, 0, true);
        ch.root.children.slice(1).forEach(v => {
            s += `<span class="st-var">( ${seqRender(v, w0, n0, 1, false)} )</span>`;
        });
    } else {
        s = '<p class="st-empty">No moves yet — play on the board. Playing a different move creates a variation automatically.</p>';
    }
    return s;
}
function isBlackToMove(fen) { return (String(fen).split(' ')[1] === 'b'); }
function startMoveNo(fen) { const n = parseInt(String(fen).split(' ')[5] || '1', 10); return Number.isFinite(n) && n > 0 ? n : 1; }

/* ══════════════════════════════════════════════════════════════
   ENGINE PANEL + analysis orchestration + honest explanations.
   Every number shown comes from a measured search (Stockfish WASM
   when the worker runs, the labelled local search otherwise).
   ══════════════════════════════════════════════════════════════ */
const ENGINE_LABEL = 'Stockfish 10';
const TOKEN_FEN = new Map(); // engine token -> fen (for caching + staleness)

function ensureEngine() {
    if (!S.engine) {
        S.engine = createEngineClient({
            onStatus: () => paintEngine(),
            onResult: (token, result) => onEngineResult(token, result)
        });
    }
    return S.engine;
}
function scheduleAnalyze() {
    if (!S.engOn || S.practice) return;
    const st = curStudy(), ch = curChapter(st);
    if (!st || !ch || !S.node) return;
    const fen = S.node.fen;
    if (fen === S.lastFen) return;
    S.lastFen = fen;
    clearTimeout(scheduleAnalyze._t);
    scheduleAnalyze._t = setTimeout(() => {
        const hit = S.anaCache.get(fen);
        if (hit && hit.depth >= S.engDepth && hit.engine === (S.engine && S.engine.kind === 'stockfish' ? 'stockfish' : 'local')) {
            S.ana = { fen, result: hit };
            paintEngine();
            return;
        }
        const eng = ensureEngine();
        const token = eng.analyze(fen, { depth: S.engDepth });
        TOKEN_FEN.set(token, fen);
        S.lastToken = token;
        paintEngine();
    }, 300);
}
function onEngineResult(token, result) {
    if (token === S.practiceToken) { practiceOnResult(token, result); return; }
    const fen = TOKEN_FEN.get(token);
    if (fen && result && result.complete) {
        S.anaCache.set(fen, result);
        if (S.anaCache.size > 120) {
            const k = S.anaCache.keys().next().value;
            S.anaCache.delete(k);
        }
        TOKEN_FEN.delete(token);
    }
    const st = curStudy(), ch = curChapter(st);
    const curFen = S.node ? S.node.fen : (ch ? ch.root.fen : null);
    if (token !== S.lastToken || !st || !ch || fen !== curFen) { paintEngine(); return; }
    S.ana = { fen, result };
    // Persist the measured eval on the node (enables swings + classification)
    // — only for finished searches, never for intermediate depth lines.
    if (result && result.complete && result.candidates && result.candidates[0] && S.node) {
        const c0 = result.candidates[0];
        const w = whiteRel(c0.score, result.turn);
        S.node.eval = {
            cp: w.type === 'cp' ? w.v : null,
            mate: w.type === 'mate' ? w.v : null,
            depth: result.depth, engine: result.engine
        };
        tryClassifyCurrent(st);
        saveLibrary(S.lib);
        const mv = $('#st-moves');
        if (mv && !(document.activeElement && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName))) {
            mv.innerHTML = renderMoveList(ch);
            paintMoves();
        }
    }
    paintEngine();
}
/* Convert a side-to-move-relative score to White-relative. */
function whiteRel(score, turn) {
    if (!score) return { type: 'cp', v: 0 };
    const sgn = turn === 'w' ? 1 : -1;
    return { type: score.type, v: sgn * score.v };
}
/* Move classification — documented, tested thresholds on eval loss in
   pawns (cp/100) from the mover's perspective, plus explicit mate and
   game-ending rules. See docs/STUDY.md. */
const CLS_RULES = [
    [0.10, 'Best'], [0.35, 'Excellent'], [0.90, 'Good'],
    [1.80, 'Inaccuracy'], [3.50, 'Mistake'], [Infinity, 'Blunder']
];
function classifyMove(parentEval, childEval, ctx) {
    // ctx: { mover:'w'|'b', deliveredMate, drewFromWinning, parentMateFor, childMateFor }
    ctx = ctx || {};
    if (!parentEval || !childEval || parentEval.engine !== childEval.engine) return null;
    const sgn = ctx.mover === 'w' ? 1 : -1;
    const P = (e) => e == null ? null : sgn * e;
    if (ctx.deliveredMate) return { label: 'Best', loss: 0 };
    if (ctx.drewFromWinning) {
        return { label: ctx.drawIsStalemate ? 'Blunder' : 'Mistake', loss: 99 };
    }
    const pm = parentEval.mate != null ? P(parentEval.mate) : null; // + = mover mates
    const cm = childEval.mate != null ? P(childEval.mate) : null;
    if (pm != null && pm > 0) {
        if (cm != null && cm > 0) {
            const delay = cm - pm + 1;
            if (delay <= 0) return { label: 'Best', loss: 0 };
            if (delay <= 2) return { label: 'Excellent', loss: 0.2 };
            return { label: 'Inaccuracy', loss: 1.0 };
        }
        // Lost a forced mate.
        const childCp = childEval.cp != null ? P(childEval.cp) / 100 : -99;
        return childCp > 5 ? { label: 'Mistake', loss: 5 } : { label: 'Blunder', loss: 20 };
    }
    if (cm != null && cm < 0) return { label: 'Blunder', loss: 20 }; // allowed mate
    if (pm == null && cm == null && parentEval.cp != null && childEval.cp != null) {
        const loss = Math.max(0, (P(parentEval.cp) - P(childEval.cp)) / 100);
        for (const [lim, label] of CLS_RULES) {
            if (loss <= lim) return { label, loss: Math.round(loss * 100) / 100 };
        }
    }
    return null;
}
function tryClassifyCurrent(st) {
    const n = S.node;
    if (!n || !n.parent || !n.parent.eval || !n.eval) return;
    let mover = 'w';
    try {
        const bits = n.parent.fen.split(' ');
        mover = bits[1] === 'b' ? 'b' : 'w';
    } catch (_) {}
    let deliveredMate = false, drewFromWinning = false, drawIsStalemate = false;
    try {
        if (typeof Chess !== 'undefined') {
            const c = new Chess(n.fen);
            deliveredMate = c.in_checkmate();
            const drawn = c.game_over() && !c.in_checkmate();
            const pw = n.parent.eval;
            const parentCpP = pw.mate != null ? null : (mover === 'w' ? pw.cp : (pw.cp != null ? -pw.cp : null));
            drewFromWinning = drawn && parentCpP != null && parentCpP > 300;
            drawIsStalemate = drawn && !!c.in_stalemate();
        }
    } catch (_) {}
    const cls = classifyMove(n.parent.eval, n.eval, { mover, deliveredMate, drewFromWinning, drawIsStalemate });
    if (cls) { n.cls = cls; touch(st); }
}
/* Score formatting (White perspective). */
function fmtScore(w) {
    if (!w) return '–';
    if (w.type === 'mate') return w.v > 0 ? `+M${Math.abs(w.v)}` : `-M${Math.abs(w.v)}`;
    const p = w.v / 100;
    return (p > 0 ? '+' : '') + (Math.round(p * 10) / 10).toFixed(1);
}
function evalBarPct(cpW) {
    if (cpW == null) return 50;
    const p = 1 / (1 + Math.exp(-0.004 * cpW));
    return clamp(Math.round(p * 1000) / 10, 2, 98);
}
function evalWords(w, turn) {
    if (!w) return 'No evaluation yet';
    const side = w.type === 'mate' ? (w.v > 0 ? 'White' : 'Black') : null;
    if (w.type === 'mate') return `${side} mates in ${Math.abs(w.v)}`;
    const a = Math.abs(w.v) / 100;
    const who = w.v > 0 ? 'White' : w.v < 0 ? 'Black' : null;
    if (!who) return 'Dead equal';
    if (a < 0.15) return 'Dead equal';
    if (a < 0.7) return `${who} is slightly better`;
    if (a < 1.8) return `${who} is better`;
    if (a < 3.5) return `${who} is much better`;
    return `${who} is winning`;
}
function pvToSans(fen, pvUci, max) {
    const sans = [];
    try {
        if (typeof Chess === 'undefined') return sans;
        const c = new Chess(fen);
        (pvUci || []).slice(0, max || 10).forEach(u => {
            const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });
            if (!m) return;
            sans.push(m.san);
        });
    } catch (_) {}
    return sans;
}
function materialCount(fen) {
    // Returns { diffPawnsWhite, wMat, bMat } — genuine piece count.
    const vals = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let w = 0, b = 0;
    try {
        if (typeof Chess === 'undefined') return { diff: 0, w: 0, b: 0 };
        new Chess(fen).board().forEach(row => row.forEach(sq => {
            if (!sq) return;
            if (sq.color === 'w') w += vals[sq.type] || 0;
            else b += vals[sq.type] || 0;
        }));
    } catch (_) {}
    return { diff: w - b, w, b };
}
function renderEnginePanel(st, ch) {
    const eng = S.engine;
    const engKind = (eng && eng.kind === 'stockfish') ? 'stockfish' : (eng ? eng.kind : 'none');
    let badge, badgeCls;
    if (!S.engOn) { badge = 'Engine off'; badgeCls = 'off'; }
    else if (!eng || eng.status === 'idle') { badge = 'Engine idle'; badgeCls = 'off'; }
    else if (eng.status === 'booting' || eng.status === 'busy' && !S.ana) { badge = eng.status === 'booting' ? 'Starting engine…' : 'Analyzing…'; badgeCls = 'busy'; }
    else if (eng.status === 'unavailable') { badge = 'Local engine'; badgeCls = 'local'; }
    else { badge = engKind === 'stockfish' ? ENGINE_LABEL + ' · Connected' : 'Local engine'; badgeCls = engKind === 'stockfish' ? 'on' : 'local'; }
    const ana = S.ana && S.node && S.ana.fen === S.node.fen ? S.ana.result : (S.node && S.anaCache.get(S.node.fen)) || null;
    const turn = ana ? ana.turn : null;
    const c0 = ana && ana.candidates[0];
    const w = c0 ? whiteRel(c0.score, ana.turn) : null;
    const cpW = w && w.type === 'cp' ? w.v : null;
    const pct = evalBarPct(cpW);
    const pvSans = c0 ? pvToSans(S.node ? S.node.fen : START_FEN, c0.pv, 12) : [];
    const playable = st && ch && S.node && !S.practice;
    return `
        <div class="st-pane-head">
            <button class="icon-btn st-collapse" data-st="toggle-right" type="button" aria-label="${S.rightOpen ? 'Collapse engine panel' : 'Expand engine panel'}" title="Collapse panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5l7 7-7 7"/></svg></button>
            <h3>Engine analysis</h3>
            <button class="icon-btn" data-st="engine-settings" type="button" aria-label="Engine settings" title="Engine settings"><span aria-hidden="true">${tileIcon('sliders')}</span></button>
        </div>
        <div class="st-pane-body">
            <div class="st-engstatus"><span class="st-dot ${badgeCls}" aria-hidden="true"></span><span>${esc(badge)}</span>
                ${eng && eng.status === 'unavailable' && eng.statusDetail ? `<span class="st-engwhy" title="${esc(eng.statusDetail)}">why?</span>` : ''}
            </div>
            ${eng && eng.status === 'unavailable' && eng.statusDetail ? `<p class="st-note">${esc(eng.statusDetail)}</p>` : ''}
            <div class="st-evalrow">
                <div class="st-evalmain">
                    <div class="st-evalnum">${ana ? esc(fmtScore(w)) : '–'}</div>
                    <div class="st-evalwords">${ana ? esc(evalWords(w, turn)) : (S.engOn ? 'Analyzing position…' : 'Engine is off')}</div>
                    <div class="st-evalmeta">${ana ? `Depth ${ana.depth}${ana.seldepth ? '/' + ana.seldepth : ''} · ${fmtNodes(ana.nodes)} nodes · ${fmtNps(ana.nps)}${ana.engine === 'local' ? ' · local' : ''}` : ' '}</div>
                </div>
                <div class="st-evalbar" role="img" aria-label="${ana ? 'Evaluation ' + esc(fmtScore(w)) : 'No evaluation yet'}">
                    <div class="st-evalfill" style="height:${pct}%"></div>
                    <span class="st-evtick t">+3</span><span class="st-evtick m">0</span><span class="st-evtick b">−3</span>
                </div>
            </div>
            <div class="st-engcard">
                <div class="st-engcard-h">Best continuation ${pvSans.length > 1 ? `<button class="linklike" data-st="cand-line" type="button" ${playable ? '' : 'disabled'}>Play line</button>` : ''}</div>
                <div class="st-pv">${pvSans.length ? esc(pvSans.join(' ')) : '<span class="st-dim">—</span>'}</div>
            </div>
            <div class="st-engcard">
                <div class="st-engcard-h">Candidate moves</div>
                ${ana && ana.candidates.length ? ana.candidates.map(c => {
                    const ws = whiteRel(c.score, ana.turn);
                    const sans = pvToSans(S.node.fen, c.pv, 6);
                    return `<button class="st-cand" data-st="cand" data-uci="${esc(c.pv[0] || '')}" type="button" ${playable && c.pv[0] ? '' : 'disabled'} title="Explore ${esc(sans[0] || c.pv[0] || '')} on the board">
                        <span class="st-cand-mv">${esc(sans[0] || (c.pv[0] || '?'))}</span>
                        <span class="st-cand-ev ${ws.type === 'mate' ? (ws.v > 0 ? 'pos' : 'neg') : (ws.v >= 0 ? 'pos' : 'neg')}">${esc(fmtScore(ws))}</span>
                        <span class="st-cand-pv">${esc(sans.slice(1).join(' '))}</span>
                        <span aria-hidden="true">›</span>
                    </button>`;
                }).join('') : '<p class="st-dim">No candidates yet.</p>'}
            </div>
            <div class="st-engcard">
                <div class="st-engcard-h">Position insights</div>
                <div class="st-insights">${renderInsights(st, ch, ana)}</div>
            </div>
            <button class="btn-secondary st-wide" data-st="explain" type="button" ${ana ? '' : 'disabled'}>Explain this position</button>
            ${S.explain ? `<p class="st-explain">${esc(S.explain)}</p><p class="st-dim st-tiny">Rule-based summary from board facts and the numbers above — no AI involved.</p>` : ''}
            <button class="btn-secondary st-wide" data-st="practice-start" type="button" ${playable && ana && ana.bestUci ? '' : 'disabled'} title="Train: find the best move in this position">Practice this position</button>
            <div class="st-engrow">
                <label class="st-switch"><input type="checkbox" data-st-change="eng-toggle" ${S.engOn ? 'checked' : ''}> Engine</label>
                <label class="st-depth">Depth <select data-st-change="eng-depth" aria-label="Engine depth">
                    ${[10, 12, 14, 16, 18, 20].map(d => `<option value="${d}"${S.engDepth === d ? ' selected' : ''}>${d}</option>`).join('')}
                </select></label>
            </div>
            ${st ? `<div class="st-progress"><div class="st-progress-h"><span>Study progress</span><span>${studyProgress(st)}%</span></div><div class="dc-track"><span style="width:${studyProgress(st)}%"></span></div><span class="st-dim">${st.chapters.length} chapter${st.chapters.length === 1 ? '' : 's'}</span></div>` : ''}
        </div>`;
}
function fmtNodes(n) {
    n = +n || 0;
    if (n >= 1e6) return (Math.round(n / 1e5) / 10) + 'M';
    if (n >= 1e3) return (Math.round(n / 100) / 10) + 'k';
    return String(n);
}
function fmtNps(n) {
    n = +n || 0;
    if (n >= 1e6) return (Math.round(n / 1e5) / 10) + ' Mn/s';
    if (n >= 1e3) return (Math.round(n / 100) / 10) + ' kn/s';
    return n + ' n/s';
}
function renderInsights(st, ch, ana) {
    if (!st || !ch || !S.node) return '<p class="st-dim">Open a study to inspect a position.</p>';
    const facts = [];
    try {
        const c = new Chess(S.node.fen);
        const mat = materialCount(S.node.fen);
        if (mat.diff !== 0) facts.push(`${mat.diff > 0 ? 'White' : 'Black'} leads in material by ${Math.abs(mat.diff)} pawn${Math.abs(mat.diff) === 1 ? '' : 's'}.`);
        else facts.push('Material is level.');
        const mob = c.moves().length;
        facts.push(`${c.turn() === 'w' ? 'White' : 'Black'} to move with ${mob} legal move${mob === 1 ? '' : 's'}.`);
        if (c.in_check()) facts.push(`${c.turn() === 'w' ? 'White' : 'Black'} is in check.`);
        if (c.game_over()) facts.push(c.in_checkmate() ? 'The game is over: checkmate.' : 'The game is over: draw.');
        const parts = S.node.fen.split(' ');
        if (parts[2] && parts[2] !== '-') facts.push(`Castling rights: ${parts[2]}.`);
    } catch (_) {}
    if (ana && ana.candidates[0]) {
        const c0 = ana.candidates[0];
        facts.push(`Engine ${ana.engine === 'stockfish' ? 'Stockfish' : 'local'} (depth ${ana.depth}) rates this ${fmtScore(whiteRel(c0.score, ana.turn))} for White.`);
        if (S.node.parent && S.node.parent.eval && S.node.parent.eval.engine === ana.engine && S.node.eval) {
            const pe = S.node.parent.eval, ce = S.node.eval;
            if (pe.cp != null && ce.cp != null) {
                const moverWhite = S.node.parent.fen.split(' ')[1] !== 'b';
                const swing = ((moverWhite ? pe.cp : -pe.cp) - (moverWhite ? ce.cp : -ce.cp)) / 100;
                if (Math.abs(swing) >= 0.5) facts.push(`The last move shifted the evaluation by ${swing > 0 ? '+' : ''}${(Math.round(swing * 10) / 10).toFixed(1)} pawns ${swing > 0 ? 'for' : 'against'} the mover.`);
            }
        }
    } else {
        facts.push('Engine evaluation pending — the numbers above fill in once the search reports.');
    }
    return '<ul>' + facts.map(f => `<li>${esc(f)}</li>`).join('') + '</ul>';
}

/* ══════════════════════════════════════════════════════════════
   ACTIONS — one delegated click table, change/input handlers,
   dialogs, practice trainer, shortcuts, boot.
   ══════════════════════════════════════════════════════════════ */
function paintLibrary() {
    const aside = $('#study-content .st-left');
    if (!aside) return;
    const st = curStudy();
    aside.innerHTML = renderLibrary(st);
    if (document.activeElement && document.activeElement.id === 'st-search') return;
}
function paintEngine() {
    const aside = $('#study-content .st-right');
    if (!aside) return;
    const st = curStudy(), ch = curChapter(st);
    aside.innerHTML = renderEnginePanel(st, ch);
}
function needStudy() {
    const st = curStudy();
    if (!st) { toast('Create a study first.'); return null; }
    return st;
}
function needChapter(st) {
    st = st || curStudy();
    const ch = curChapter(st);
    if (!ch) { toast('Add a chapter first.'); return null; }
    return ch;
}
function doAction(a, el) {
    const st = curStudy();
    const id = el.dataset ? el.dataset.id : null;
    switch (a) {
        case 'mtab': S.mobileTab = el.dataset.t; render(); break;
        case 'ctab': S.tab = el.dataset.t; render(); break;
        case 'toggle-left': S.leftOpen = !S.leftOpen; render(); break;
        case 'toggle-right': S.rightOpen = !S.rightOpen; render(); break;
        case 'new-study': S.dlg = { kind: 'newstudy', text: '' }; render(); setTimeout(() => $('#st-dlg-input')?.focus(), 50); break;
        case 'study-create': {
            const inp = $('#st-dlg-input');
            const title = (inp ? inp.value : '').trim().slice(0, 80) || 'Untitled study';
            const nst = blankStudy(title);
            nst.chapters.push(blankChapter('Chapter 1', START_FEN));
            S.lib.studies.unshift(nst);
            S.dlg = null;
            touch(nst);
            openChapter(nst, nst.chapters[0]);
            toast(`Study "${title}" created.`);
            break;
        }
        case 'open-study': {
            const t = S.lib.studies.find(s => s.id === id);
            if (!t) break;
            if (!t.chapters.length) {
                S.studyId = t.id; S.chapterId = null; S.node = null; S.dlg = null;
                render();
            } else {
                const last = t.chapters.find(c => c.id === (t.visited[t.visited.length - 1])) || t.chapters[0];
                openChapter(t, last);
            }
            break;
        }
        case 'rename': {
            const [kind, rid] = String(id || '').split(/:(.+)/);
            if (kind === 'study') { const t = S.lib.studies.find(s => s.id === rid); S.renameId = id; S.renameText = t ? t.title : ''; }
            else { const ch = st && st.chapters.find(c => c.id === rid); S.renameId = id; S.renameText = ch ? ch.title : ''; }
            render();
            setTimeout(() => { const i = $('[data-rename-input]'); if (i) { i.focus(); i.select(); } }, 50);
            break;
        }
        case 'rename-cancel': S.renameId = null; render(); break;
        case 'rename-save': {
            const inp = $('[data-rename-input]');
            const v = (inp ? inp.value : S.renameText).trim().slice(0, 80);
            const [kind, rid] = String(S.renameId || '').split(/:(.+)/);
            if (kind === 'study') {
                if (id === undefined || id === null || String(id).startsWith('study:')) {
                    const t = S.lib.studies.find(s => s.id === (rid || (id || '').split(':')[1]));
                    if (t && v) { t.title = v; touch(t); }
                } else {
                    // called from the library card Save button (data-id is the study id)
                    const t = S.lib.studies.find(s => s.id === id);
                    if (t && v) { t.title = v; touch(t); }
                }
            } else if (kind === 'chapter') {
                const cs = st && st.chapters.find(c => c.id === rid);
                if (cs && v) { cs.title = v; touch(st); }
            }
            S.renameId = null;
            render();
            break;
        }
        case 'dupe': {
            const t = S.lib.studies.find(s => s.id === id);
            if (!t) break;
            const copy = JSON.parse(JSON.stringify({ title: t.title + ' (copy)', desc: t.desc, tags: t.tags, chapters: t.chapters.map(c => ({ title: c.title, whiteName: c.whiteName, blackName: c.blackName, result: c.result, notes: c.notes, root: stripParents(c.root) })) }));
            const nst = blankStudy(copy.title);
            nst.desc = copy.desc; nst.tags = copy.tags;
            copy.chapters.forEach(c => nst.chapters.push({ id: uid('ch'), title: c.title, whiteName: c.whiteName, blackName: c.blackName, result: c.result, notes: c.notes, createdAt: Date.now(), root: reviveTree(c.root, null) }));
            S.lib.studies.unshift(nst);
            touch(nst);
            render();
            toast('Study duplicated.');
            break;
        }
        case 'del-study': {
            const t = S.lib.studies.find(s => s.id === id);
            if (!t) break;
            confirmDlg({ title: 'Delete study?', body: `"${t.title}" and all its chapters will be removed from this device.`, okLabel: 'Delete' }).then(ok => {
                if (!ok) return;
                S.lib.studies = S.lib.studies.filter(s => s.id !== id);
                if (S.studyId === id) { S.studyId = null; S.chapterId = null; S.node = null; }
                saveLibrary(S.lib);
                render();
                toast('Study deleted.');
            });
            break;
        }
        case 'tag-opening': {
            const t = S.lib.studies.find(s => s.id === id);
            if (!t) break;
            t.tags = t.tags.includes('opening') ? [] : ['opening'];
            touch(t); render();
            break;
        }
        case 'prev-ch': case 'next-ch': {
            if (!st) break;
            const i = chapterIndex(st, curChapter(st));
            const j = a === 'prev-ch' ? i - 1 : i + 1;
            if (st.chapters[j]) openChapter(st, st.chapters[j]);
            break;
        }
        case 'new-chapter': {
            if (!needStudy()) break;
            const n = st.chapters.length + 1;
            const ch2 = blankChapter('Chapter ' + n, (S.node && S.node.fen) || START_FEN);
            st.chapters.push(ch2);
            touch(st);
            openChapter(st, ch2);
            toast(`Chapter ${n} created from the current position.`);
            break;
        }
        case 'del-chapter': {
            if (!st) break;
            const ch = curChapter(st);
            if (!ch) break;
            confirmDlg({ title: 'Delete chapter?', body: `"${ch.title}" will be removed.`, okLabel: 'Delete' }).then(ok => {
                if (!ok) return;
                st.chapters = st.chapters.filter(c => c.id !== ch.id);
                st.visited = st.visited.filter(v => v !== ch.id);
                if (st.chapters[0]) openChapter(st, st.chapters[0]);
                else { S.chapterId = null; S.node = null; touch(st); render(); }
                toast('Chapter deleted.');
            });
            break;
        }
        case 'nav': navTo(el.dataset.where); break;
        case 'goto': gotoPath(el.dataset.path); break;
        case 'flip': S.flip = !S.flip; render(); toast(S.flip ? 'Board flipped: Black at the bottom.' : 'Board flipped: White at the bottom.'); break;
        case 'promote': {
            const n = S.node;
            if (st && n && n.parent && n.parent.children[0] !== n) {
                const sibs = n.parent.children;
                const i = sibs.indexOf(n);
                sibs[0] = sibs.splice(i, 1, sibs[0])[0];
                touch(st); render(); scheduleAnalyze();
                toast('Variation promoted to main line.');
            } else toast(n && n.parent ? 'Already the main line.' : 'Nothing to promote.');
            break;
        }
        case 'del-line': {
            const n = S.node;
            if (st && n && n.parent) {
                confirmDlg({ title: 'Delete line?', body: `Remove "${n.san}" and everything after it in this line.`, okLabel: 'Delete' }).then(ok => {
                    if (!ok) return;
                    n.parent.children = n.parent.children.filter(c => c !== n);
                    S.node = n.parent;
                    touch(st); render(); scheduleAnalyze();
                });
            } else toast('Nothing to delete.');
            break;
        }
        case 'cand': {
            const u = el.dataset.uci;
            if (!u || !st || !needChapter(st)) break;
            S.tab = 'board';
            doPlayMove(u.slice(0, 2), u.slice(2, 4), u[4] || undefined);
            break;
        }
        case 'cand-line': {
            if (!st || !needChapter(st) || !S.ana || !S.ana.result || !S.ana.result.candidates[0]) break;
            const pv = S.ana.result.candidates[0].pv;
            if (!pv.length) break;
            S.tab = 'board';
            let n = S.node, played = 0;
            pv.forEach(u => {
                const r = playOn(n, u.slice(0, 2), u.slice(2, 4), u[4] || undefined);
                n = r.node;
                if (r.isNew) played++;
                else if (!r.illegal) played++;
                if (r.illegal) return;
            });
            S.node = n;
            touch(st); render(); scheduleAnalyze();
            toast(`Line played (${played} move${played === 1 ? '' : 's'}).`);
            break;
        }
        case 'fen-load': {
            const inp = $('#st-fen');
            const v = (inp ? inp.value : '').trim();
            if (!v) { toast('Paste a FEN first.'); break; }
            if (!st || !needChapter(st)) break;
            let ok = false;
            try { ok = typeof Chess !== 'undefined' && new Chess(v).fen() === v; } catch (_) { ok = false; }
            if (!ok) { toast('That FEN is not a legal position.'); break; }
            const ch = curChapter(st);
            ch.root = treeRoot(v);
            S.node = ch.root;
            touch(st); render(); scheduleAnalyze();
            toast('Position loaded as the chapter start.');
            break;
        }
        case 'fen-copy': {
            const ch = st && curChapter(st);
            copyText(boardFen(), ch ? 'FEN copied.' : 'Nothing to copy.');
            break;
        }
        case 'pgn-copy': {
            const ch = st && curChapter(st);
            if (!ch) { toast('Nothing to export.'); break; }
            copyText(treeToPgn(st, ch), 'PGN copied.');
            break;
        }
        case 'import-open': {
            if (!st && !S.lib.studies.length) {
                const nst = blankStudy('Imported games');
                nst.chapters.push(blankChapter('Chapter 1', START_FEN));
                S.lib.studies.unshift(nst);
                touch(nst);
                S.studyId = nst.id; S.chapterId = nst.chapters[0].id; S.node = nst.chapters[0].root;
            }
            S.dlg = { kind: 'import', text: '', error: '' };
            render();
            setTimeout(() => $('#st-import-text')?.focus(), 50);
            break;
        }
        case 'dlg-close': S.dlg = null; render(); break;
        case 'import-pgn': case 'import-fen': {
            const ta = $('#st-import-text');
            const text = ta ? ta.value : '';
            const parsed = parsePgnText(text);
            if (parsed.error && (!parsed.partial || !parsed.count)) { S.dlg = { kind: 'import', text, error: parsed.error }; render(); break; }
            let s2 = curStudy();
            if (!s2) { s2 = blankStudy('Imported games'); S.lib.studies.unshift(s2); }
            const title = (parsed.tags && (parsed.tags.White || parsed.tags.Black))
                ? `${parsed.tags.White || '?'} – ${parsed.tags.Black || '?'}${parsed.tags.Date && parsed.tags.Date !== '????.??.??' ? ' (' + parsed.tags.Date + ')' : ''}`.slice(0, 80)
                : `Imported game ${s2.chapters.length + 1}`;
            const ch2 = {
                id: uid('ch'), title,
                whiteName: (parsed.tags && parsed.tags.White) || '', blackName: (parsed.tags && parsed.tags.Black) || '',
                result: parsed.result || '*', notes: '', createdAt: Date.now(),
                root: parsed.fenOnly ? treeRoot(parsed.fenOnly) : reviveTree(stripParents(parsed.partial ? parsed.partial : parsed.root), null)
            };
            if (parsed.fenOnly) {
                const probe = new Chess();
                if (!probe.load(parsed.fenOnly)) { S.dlg = { kind: 'import', text, error: 'That FEN is not a legal position.' }; render(); break; }
            }
            s2.chapters.push(ch2);
            S.dlg = null;
            touch(s2);
            openChapter(s2, ch2);
            toast(parsed.error ? `Imported with a warning: ${parsed.count} moves kept.` : `Imported ${parsed.count} half-moves.`);
            break;
        }
        case 'marks-clear': {
            const n = S.node;
            if (n && st) { n.arrows = []; n.marks = []; touch(st); render(); }
            break;
        }
        case 'engine-settings': toast('Depth and engine switch live in the panel below.'); break;
        case 'explain': S.explain = buildExplain(); render(); break;
        case 'practice-start': practiceStart(); break;
        case 'practice-exit': S.practice = null; render(); scheduleAnalyze(); break;
        case 'practice-reveal': practiceReveal(); break;
        case 'rep-add': {
            if (!st || !needChapter(st)) break;
            const line = S.node ? nodeLine(S.node) : [];
            if (!line.length) { toast('Play some moves first.'); break; }
            st.repertoire = st.repertoire || [];
            st.repertoire.unshift({ id: uid('rp'), name: `${curChapter(st).title} · ${Math.ceil(line.length / 2)} moves`, ucis: line.slice(0, 300), note: '' });
            touch(st); render();
            toast('Line added to your repertoire.');
            break;
        }
        case 'rep-load': {
            const r = st && (st.repertoire || []).find(x => x.id === id);
            if (!r) break;
            const ch = needChapter(st);
            if (!ch) break;
            let n = ch.root, played = 0;
            r.ucis.forEach(u => {
                const res = playOn(n, u.slice(0, 2), u.slice(2, 4), u[4] || undefined);
                if (res.illegal) return;
                n = res.node; played++;
            });
            S.node = n; S.tab = 'board';
            touch(st); render(); scheduleAnalyze();
            toast(`Repertoire line loaded (${played} moves).`);
            break;
        }
        case 'rep-del': {
            if (!st) break;
            st.repertoire = (st.repertoire || []).filter(x => x.id !== id);
            touch(st); render();
            break;
        }
        case 'save-pos': {
            const fen = boardFen();
            S.lib.positions.unshift({ id: uid('pos'), name: `Position · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, fen, note: '', createdAt: Date.now() });
            S.lib.positions = S.lib.positions.slice(0, 200);
            saveLibrary(S.lib); render();
            toast('Position saved.');
            break;
        }
        case 'save-pos-over': {
            const p = S.lib.positions.find(x => x.id === id);
            if (!p) break;
            p.fen = boardFen(); p.createdAt = Date.now();
            saveLibrary(S.lib); render();
            toast('Position overwritten with the current board.');
            break;
        }
        case 'open-pos': {
            const p = S.lib.positions.find(x => x.id === id);
            if (!p) break;
            let s2 = curStudy();
            if (!s2) { s2 = blankStudy('Saved positions'); S.lib.studies.unshift(s2); }
            const ch2 = blankChapter(p.name, START_FEN);
            let ok = false;
            try { ok = typeof Chess !== 'undefined' && new Chess(p.fen).fen() === p.fen; } catch (_) {}
            if (!ok) { toast('That saved position is no longer legal.'); break; }
            ch2.root = treeRoot(p.fen);
            s2.chapters.push(ch2);
            touch(s2);
            openChapter(s2, ch2);
            break;
        }
        case 'del-pos': {
            S.lib.positions = S.lib.positions.filter(x => x.id !== id);
            saveLibrary(S.lib); render();
            break;
        }
        case 'shortcuts': S.dlg = { kind: 'shortcuts' }; render(); break;
    }
}
function copyText(text, okMsg) {
    const done = () => toast(okMsg || 'Copied.');
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
            return;
        }
        fallbackCopy(text, done);
    } catch (_) { fallbackCopy(text, done); }
}
function fallbackCopy(text, done) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        done();
    } catch (_) { toast('Copy failed — select the text manually.'); }
}

/* ══════════════════════════════════════════════════════════════
   DIALOGS, EXPLAIN, PRACTICE, INPUT WIRING, BOOT.
   ══════════════════════════════════════════════════════════════ */
function renderDialog() {
    if (!S.dlg) return '';
    if (S.dlg.kind === 'shortcuts') {
        const rows = [
            ['← / →', 'Previous / next move'], ['Home / End', 'Start / latest position'],
            ['↑ / ↓', 'Previous / next variation'], ['F', 'Flip board'], ['E', 'Engine on/off'],
            ['Esc', 'Close dialog / picker'], ['?', 'This guide']
        ];
        return `<div class="confirm-veil" data-st-veil><div class="confirm-card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <h3>Keyboard shortcuts</h3>
            <div class="st-keys">${rows.map(r => `<div><kbd>${esc(r[0])}</kbd><span>${esc(r[1])}</span></div>`).join('')}</div>
            <div class="confirm-actions"><button class="btn-secondary" data-st="dlg-close" type="button">Close</button></div>
        </div></div>`;
    }
    if (S.dlg.kind === 'newstudy') {
        return `<div class="confirm-veil" data-st-veil><div class="confirm-card" role="dialog" aria-modal="true" aria-label="New study">
            <h3>New study</h3>
            <p><input id="st-dlg-input" class="st-text" maxlength="80" placeholder="Study title — e.g. Caro-Kann prep" aria-label="Study title"></p>
            <div class="confirm-actions"><button class="btn-secondary" data-st="dlg-close" type="button">Cancel</button><button class="btn-primary" data-st="study-create" type="button">Create</button></div>
        </div></div>`;
    }
    if (S.dlg.kind === 'import') {
        return `<div class="confirm-veil" data-st-veil><div class="confirm-card st-dlg-wide" role="dialog" aria-modal="true" aria-label="Import game">
            <h3>Import game</h3>
            <p>Paste PGN (tags, comments, $NAGs and variations supported) or a single FEN line. Moves are validated — illegal ones stop the import with a message.</p>
            <p><textarea id="st-import-text" rows="7" class="st-text" spellcheck="false" placeholder="Paste PGN or FEN here…">${esc(S.dlg.text || '')}</textarea></p>
            ${S.dlg.error ? `<p class="feedback error" role="alert">${esc(S.dlg.error)}</p>` : ''}
            <div class="confirm-actions">
                <button class="btn-secondary" data-st="dlg-close" type="button">Cancel</button>
                <button class="btn-secondary" data-st="import-fen" type="button">FEN → new chapter</button>
                <button class="btn-primary" data-st="import-pgn" type="button">PGN → new chapter</button>
            </div>
        </div></div>`;
    }
    return '';
}
/* Explain: rule-based sentences from board facts + measured engine
   numbers. Explicitly not an AI — the UI labels it as such. */
function buildExplain() {
    const st = curStudy(), ch = curChapter(st);
    if (!st || !ch || !S.node) { toast('Open a study first.'); return ''; }
    const fen = S.node.fen;
    const ana = (S.ana && S.ana.fen === fen) ? S.ana.result : S.anaCache.get(fen);
    if (!ana || !ana.candidates[0]) { toast('Wait for the engine evaluation first.'); return ''; }
    const c0 = ana.candidates[0];
    const w = whiteRel(c0.score, ana.turn);
    const sans = pvToSans(fen, c0.pv, 6);
    const mat = materialCount(fen);
    const parts = [];
    parts.push(evalWords(w, ana.turn) + '.');
    if (sans[0]) parts.push(`The engine's top choice is ${sans[0]}${sans.length > 1 ? ' continuing ' + sans.slice(1, 4).join(' ') : ''}, evaluated at ${fmtScore(w)} for White.`);
    if (mat.diff !== 0) parts.push(`${mat.diff > 0 ? 'White' : 'Black'} owns ${Math.abs(mat.diff)} extra pawn${Math.abs(mat.diff) === 1 ? '' : 's'} of material.`);
    else parts.push('Material is level, so piece activity and king safety decide.');
    try {
        const c = new Chess(fen);
        if (c.in_check()) parts.push(`The side to move is in check and must answer it.`);
        const fparts = fen.split(' ');
        if (!fparts[2] || fparts[2] === '-') parts.push('Neither side can castle anymore, so both kings must be defended by pieces.');
    } catch (_) {}
    if (S.node.cls) parts.push(`Your last move was classified ${S.node.cls.label} by the engine comparison.`);
    return parts.join(' ');
}
/* ── Practice: find the engine's best move, attempts graded ── */
function practiceStart() {
    const st = curStudy(), ch = curChapter(st);
    if (!st || !ch || !S.node) return;
    const fen = S.node.fen;
    const eng = ensureEngine();
    S.practice = { fen, stage: 'thinking', solutionUci: null, solutionEval: null, side: null, attempts: [], solved: false, chess: null, sel: null };
    try {
        S.practice.chess = new Chess(fen);
        S.practice.side = S.practice.chess.turn();
    } catch (_) { S.practice = null; toast('Illegal position.'); return; }
    render();
    const token = eng.analyze(fen, { depth: 14 });
    S.practiceToken = token;
    TOKEN_FEN.set(token, fen);
}
function practiceOnResult(token, result) {
    const pr = S.practice;
    if (!pr || token !== S.practiceToken) return;
    if (pr.stage === 'thinking') {
        if (!result || !result.bestUci) { S.practice = null; render(); toast('Engine gave no move — practice unavailable here.'); return; }
        pr.solutionUci = result.bestUci;
        const c0 = result.candidates[0];
        pr.solutionEval = c0 ? { score: c0.score, turn: result.turn, engine: result.engine } : null;
        pr.stage = 'play';
        render(); practicePaint();
        toast(`Your move, ${pr.side === 'w' ? 'White' : 'Black'} to play. Find the best move.`);
        return;
    }
    if (pr.stage === 'grading' && pr.pendingAttempt) {
        const att = pr.pendingAttempt;
        pr.pendingAttempt = null;
        if (!result || !result.candidates[0] || !pr.solutionEval) { pr.stage = 'play'; render(); practicePaint(); toast('Could not grade that attempt — try again.'); return; }
        const a0 = result.candidates[0];
        const childEvalW = whiteRel(a0.score, result.turn);
        const solW = whiteRel(pr.solutionEval.score, pr.solutionEval.turn);
        const mover = pr.side;
        const sgn = mover === 'w' ? 1 : -1;
        const parentEval = { cp: pr.solutionEval.score.type === 'cp' ? sgn * pr.solutionEval.score.v : null, mate: pr.solutionEval.score.type === 'mate' ? sgn * pr.solutionEval.score.v : null, engine: pr.solutionEval.engine };
        const childEval = { cp: childEvalW.type === 'cp' ? sgn * childEvalW.v : null, mate: childEvalW.type === 'mate' ? sgn * childEvalW.v : null, engine: result.engine };
        const cls = classifyMove(parentEval, childEval, { mover }) || { label: 'Unclear', loss: 0 };
        pr.attempts.push({ san: att.san, label: cls.label });
        if (cls.label === 'Best' || cls.label === 'Excellent') {
            pr.solved = true;
            pr.stage = 'done';
            render(); practicePaint();
            toast(`Solved — ${att.san} is ${cls.label}!`);
        } else {
            pr.stage = 'play';
            render(); practicePaint();
            toast(`${att.san}: ${cls.label}. Try again${pr.attempts.length >= 2 ? ' or reveal the solution' : ''}.`);
        }
    }
}
function practiceAttempt(from, to, promotion) {
    const pr = S.practice;
    if (!pr || pr.stage !== 'play') return;
    pr.promoAsk = null;
    const uci = from + to + (promotion || '');
    if (uci === pr.solutionUci) {
        let san = uci;
        try { const c = new Chess(pr.fen); pr.attempts.forEach(a => c.move(a.uci)); const m = c.move({ from, to, promotion }); if (m) san = m.san; } catch (_) {}
        pr.attempts.push({ san, label: 'Best', uci });
        pr.solved = true; pr.stage = 'done';
        render(); practicePaint();
        toast(`Solved — ${san} is the engine move!`);
        return;
    }
    // Grade the attempt with a real search on the resulting position.
    let attFen = null, san = uci;
    try {
        const c = new Chess(pr.fen);
        pr.attempts.forEach(a => { if (a.uci) c.move({ from: a.uci.slice(0, 2), to: a.uci.slice(2, 4), promotion: a.uci[4] || undefined }); });
        const m = c.move({ from, to, promotion });
        if (!m) { toast('Illegal move.'); return; }
        san = m.san; attFen = c.fen();
    } catch (_) { toast('Illegal move.'); return; }
    pr.pendingAttempt = { san, uci };
    pr.stage = 'grading';
    render(); practicePaint();
    const token = ensureEngine().analyze(attFen, { depth: 12 });
    S.practiceToken = token;
    TOKEN_FEN.set(token, attFen);
}
function practiceReveal() {
    const pr = S.practice;
    if (!pr || !pr.solutionUci) return;
    try {
        const c = new Chess(pr.fen);
        const m = c.move({ from: pr.solutionUci.slice(0, 2), to: pr.solutionUci.slice(2, 4), promotion: pr.solutionUci[4] || undefined });
        pr.revealed = m ? m.san : pr.solutionUci;
    } catch (_) { pr.revealed = pr.solutionUci; }
    pr.stage = 'done';
    render(); practicePaint();
}
function renderPractice() {
    const pr = S.practice;
    if (!pr) return '';
    return `<div class="dc-panel st-practice" role="region" aria-label="Practice mode">
        <div class="dc-head"><h3>Practice: find the best move</h3><button class="btn-secondary sm" data-st="practice-exit" type="button">Exit</button></div>
        ${pr.stage === 'thinking' ? '<p class="st-dim">Engine is computing the solution…</p>' : `
        <div class="st-practice-grid">
            <div class="st-boardwrap"><div class="st-board" id="st-practice-board" role="group" aria-label="Practice board"></div></div>
            <div class="st-practice-side">
                <p>${pr.solved ? `<strong>Solved${pr.revealed ? ' — solution: ' + esc(pr.revealed) : ''}!</strong>` : `You play <strong>${pr.side === 'w' ? 'White' : 'Black'}</strong> to move. Attempts: <strong>${pr.attempts.length}</strong>`}</p>
                ${pr.attempts.length ? `<ul class="st-att">${pr.attempts.map(a => `<li>${esc(a.san)} — <strong>${esc(a.label)}</strong></li>`).join('')}</ul>` : ''}
                ${pr.promoAsk ? `<div class="st-promorow" role="group" aria-label="Choose promotion piece">${['q', 'r', 'b', 'n'].map(p => `<button class="btn-secondary sm" data-st="practice-promo" data-from="${pr.promoAsk.from}" data-to="${pr.promoAsk.to}" data-p="${p}" type="button">${p.toUpperCase()}</button>`).join('')}</div>` : ''}
                ${!pr.solved ? '<button class="btn-secondary sm" data-st="practice-reveal" type="button">Reveal solution</button>' : ''}
            </div>
        </div>`}
    </div>`;
}
function practicePaint() {
    const board = $('#st-practice-board');
    const pr = S.practice;
    if (!board || !pr || !pr.chess) return;
    const c = pr.chess;
    // replay attempts to show current practice position
    const pos = new Chess(pr.fen);
    pr.attempts.forEach(a => { if (a.uci) { try { pos.move({ from: a.uci.slice(0, 2), to: a.uci.slice(2, 4), promotion: a.uci[4] || undefined }); } catch (_) {} } });
    const flip = S.flip;
    board.innerHTML = '';
    const b = pos.board();
    for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) {
        const r = flip ? 7 - dr : dr, cl = flip ? 7 - dc : dc;
        const sq = b[r][cl];
        const alg = rcToAlg(r, cl);
        const d = document.createElement('div');
        d.className = 'chess-square ' + (((r + cl) % 2 === 0) ? 'white' : 'black');
        d.dataset.square = alg;
        d.setAttribute('role', 'button'); d.setAttribute('tabindex', '0');
        d.setAttribute('aria-label', alg);
        if (sq) {
            const w = document.createElement('div');
            w.innerHTML = pieceImg(sq.color === 'w' ? sq.type.toUpperCase() : sq.type);
            d.prepend(w.firstChild);
        }
        if (pr.sel && pr.sel === alg) d.classList.add('selected');
        if (dr === 7) { const f = document.createElement('span'); f.className = 'coord-file'; f.textContent = 'abcdefgh'[cl]; d.appendChild(f); }
        if (dc === 0) { const rk = document.createElement('span'); rk.className = 'coord-rank'; rk.textContent = String(8 - r); d.appendChild(rk); }
        board.appendChild(d);
    }
    // legal dots for selection
    if (pr.sel && pr.stage === 'play' && !pr.solved) {
        try {
            const legal = pos.moves({ square: pr.sel, verbose: true });
            legal.forEach(m => {
                const el = board.querySelector(`[data-square="${m.to}"]`);
                if (!el) return;
                const dot = document.createElement('div');
                dot.className = el.querySelector('.st-piece') ? 'legal-ring' : 'legal-dot';
                dot.setAttribute('aria-hidden', 'true');
                el.appendChild(dot);
            });
        } catch (_) {}
    }
}
function practiceActivate(alg) {
    const pr = S.practice;
    if (!pr || pr.stage !== 'play' || pr.solved || !pr.chess) return;
    const pos = new Chess(pr.fen);
    pr.attempts.forEach(a => { if (a.uci) { try { pos.move({ from: a.uci.slice(0, 2), to: a.uci.slice(2, 4), promotion: a.uci[4] || undefined }); } catch (_) {} } });
    if (pr.sel && pr.sel !== alg) {
        const from = pr.sel;
        const opts = pos.moves({ square: from, verbose: true }).filter(m => m.to === alg);
        pr.sel = null;
        if (opts.length) {
            // promotion choice: queen by default is dishonest-neutral? Ask only if ambiguous.
            if (opts.length > 1 && opts.some(m => m.promotion)) {
                pr.promoAsk = { from, to: alg, opts };
                render(); practicePaint();
                toast('Choose your promotion piece below the board.');
                return;
            }
            practiceAttempt(from, alg, opts[0].promotion);
            return;
        }
    }
    try {
        const sq = pos.get(alg);
        pr.sel = (sq && sq.color === pos.turn()) ? alg : null;
    } catch (_) { pr.sel = null; }
    practicePaint();
}

/* ── board markers overlay ── */
function paintArrows() {
    const svg = $('#st-arrows');
    const board = $('#st-board');
    if (!svg || !board) return;
    const n = S.node;
    svg.setAttribute('viewBox', '0 0 8 8');
    let s = `<defs>
        <marker id="st-ah-g" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#34d399"/></marker>
        <marker id="st-ah-y" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#fbbf24"/></marker>
        <marker id="st-ah-r" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f87171"/></marker>
    </defs>`;
    const col = (c) => c === 'gold' ? '#fbbf24' : c === 'red' ? '#f87171' : '#34d399';
    const mark = (c) => c === 'gold' ? 'y' : c === 'red' ? 'r' : 'g';
    const pt = (alg) => {
        const [r, c] = algToRC(alg);
        const dr = S.flip ? 7 - r : r, dc = S.flip ? 7 - c : c;
        return [dc + 0.5, dr + 0.5];
    };
    if (n) {
        n.marks.forEach(mk => {
            const [x, y] = pt(mk.sq);
            s += `<rect x="${x - 0.5}" y="${y - 0.5}" width="1" height="1" fill="none" stroke="${col(mk.color)}" stroke-width="0.09" rx="0.12"/>`;
        });
        n.arrows.forEach(a => {
            const [x1, y1] = pt(a.from), [x2, y2] = pt(a.to);
            const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
            const e2x = x2 - (dx / len) * 0.32, e2y = y2 - (dy / len) * 0.32;
            s += `<line x1="${x1}" y1="${y1}" x2="${e2x.toFixed(2)}" y2="${e2y.toFixed(2)}" stroke="${col(a.color)}" stroke-width="0.14" stroke-linecap="round" opacity="0.9" marker-end="url(#st-ah-${mark(a.color)})"/>`;
        });
    }
    svg.innerHTML = s;
}
/* ── pointer input: click, drag, right-click markers ── */
let dragState = null;
function squareFromPoint(x, y) {
    try {
        const el = document.elementFromPoint(x, y);
        const sq = el && el.closest ? el.closest('#st-board [data-square], #st-practice-board [data-square]') : null;
        return sq ? sq.dataset.square : null;
    } catch (_) { return null; }
}
function boardOf(el) {
    const p = el.closest ? el.closest('#st-practice-board') : null;
    if (p) return 'practice';
    const b = el.closest ? el.closest('#st-board') : null;
    return b ? 'main' : null;
}
function onBoardPointerDown(e) {
    const card = e.target.closest ? e.target.closest('#st-board, #st-practice-board') : null;
    if (!card) return;
    const sq = e.target.closest ? (e.target.closest('[data-square]') || {}).dataset?.square : null;
    if (!sq) return;
    if (e.button === 2) {
        dragState = { kind: 'draw', from: sq, board: boardOf(card) };
        e.preventDefault();
        return;
    }
    if (e.button !== 0) return;
    const which = boardOf(card);
    const fen = which === 'practice' ? practiceFen() : boardFen();
    let chess = null;
    try { chess = new Chess(fen); } catch (_) { return; }
    const piece = chess.get(sq);
    if (piece && piece.color === chess.turn() && ((which === 'main' && !S.practice) || (which === 'practice' && S.practice && S.practice.stage === 'play' && !S.practice.solved))) {
        dragState = { kind: 'move', from: sq, board: which, x: e.clientX, y: e.clientY, dragging: false, ghost: null };
        try { document.body.classList.add('st-dragging'); } catch (_) {}
    }
}
function practiceFen() {
    const pr = S.practice;
    if (!pr) return START_FEN;
    try {
        const c = new Chess(pr.fen);
        pr.attempts.forEach(a => { if (a.uci) c.move({ from: a.uci.slice(0, 2), to: a.uci.slice(2, 4), promotion: a.uci[4] || undefined }); });
        return c.fen();
    } catch (_) { return pr.fen; }
}
function onPointerMove(e) {
    if (!dragState || dragState.kind !== 'move') return;
    const dx = e.clientX - dragState.x, dy = e.clientY - dragState.y;
    if (!dragState.dragging && Math.hypot(dx, dy) > 8) {
        dragState.dragging = true;
        try {
            const src = document.querySelector(`#${dragState.board === 'practice' ? 'st-practice-board' : 'st-board'} [data-square="${dragState.from}"] img`);
            if (src) {
                const g = document.createElement('img');
                g.src = src.src; g.alt = ''; g.className = 'st-ghost';
                document.body.appendChild(g);
                dragState.ghost = g;
            }
        } catch (_) {}
    }
    if (dragState.dragging && dragState.ghost) {
        dragState.ghost.style.left = e.clientX + 'px';
        dragState.ghost.style.top = e.clientY + 'px';
        if (e.cancelable) e.preventDefault();
    }
}
function onPointerUp(e) {
    const d = dragState;
    dragState = null;
    try { document.body.classList.remove('st-dragging'); } catch (_) {}
    if (!d) {
        // Plain left-click that never armed a drag (empty/enemy square):
        // resolve the square under the pointer and run the click path.
        if (e.button !== 0) return;
        let sq = null, which = null;
        try {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const cell = el && el.closest ? el.closest('#st-board [data-square], #st-practice-board [data-square]') : null;
            if (cell) {
                sq = cell.dataset.square;
                which = cell.closest('#st-practice-board') ? 'practice' : 'main';
            }
        } catch (_) {}
        if (!sq) return;
        if (which === 'practice') practiceActivate(sq);
        else if (studyActive()) onSquareActivate(sq);
        return;
    }
    if (d.kind === 'draw' && e.button === 2) {
        const to = squareFromPoint(e.clientX, e.clientY);
        if (to && d.board === 'main' && S.node && !S.practice) {
            const color = e.altKey ? 'gold' : (e.shiftKey ? 'red' : 'green');
            if (to === d.from) {
                const i = S.node.marks.findIndex(m => m.sq === to);
                if (i >= 0) S.node.marks.splice(i, 1);
                else S.node.marks.push({ sq: to, color });
            } else {
                const i = S.node.arrows.findIndex(a => a.from === d.from && a.to === to);
                if (i >= 0) S.node.arrows.splice(i, 1);
                else S.node.arrows.push({ from: d.from, to, color });
            }
            const st = curStudy();
            if (st) touch(st);
            const svg = $('#st-arrows');
            if (svg) paintArrows();
        }
        return;
    }
    if (d.kind !== 'move') return;
    const cleanup = () => { if (d.ghost) { try { d.ghost.remove(); } catch (_) {} } };
    const to = squareFromPoint(e.clientX, e.clientY);
    if (d.dragging) {
        cleanup();
        if (to && to !== d.from) {
            if (d.board === 'practice') practiceDrop(d.from, to);
            else mainDrop(d.from, to);
        } else if (d.board === 'practice') practiceActivate(d.from);
        else onSquareActivate(d.from);
        return;
    }
    cleanup();
    if (d.board === 'practice') practiceActivate(d.from);
    else onSquareActivate(d.from);
}
function mainDrop(from, to) {
    const fen = boardFen();
    const opts = legalFrom(fen, from).filter(m => m.to === to);
    if (!opts.length) { onSquareActivate(from); return; }
    if (opts.length > 1 && opts.some(m => m.promotion)) { S.sel = algToRC(from); paintBoard(); showPromoPicker(from, to, opts); return; }
    doPlayMove(from, to, opts[0].promotion);
}
function practiceDrop(from, to) {
    const pr = S.practice;
    if (!pr || pr.stage !== 'play' || pr.solved) return;
    let opts = [];
    try {
        const c = new Chess(practiceFen());
        opts = c.moves({ square: from, verbose: true }).filter(m => m.to === to);
    } catch (_) {}
    if (!opts.length) { practiceActivate(from); return; }
    if (opts.length > 1 && opts.some(m => m.promotion)) {
        pr.sel = from; pr.promoAsk = { from, to, opts };
        render(); practicePaint();
        return;
    }
    practiceAttempt(from, to, opts[0].promotion);
}
/* ── document-level wiring (bound once) ── */
let wired = false;
function studyActive() {
    try { return document.getElementById('study-screen')?.classList.contains('active'); } catch (_) { return false; }
}
function typingIn(el) {
    if (!el || !el.tagName) return false;
    const t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
}
function wireOnce() {
    if (wired) return;
    wired = true;
    document.addEventListener('click', (e) => {
        const scope = e.target.closest ? e.target.closest('#study-content') : null;
        if (!scope) return;
        if (e.target.closest && e.target.closest('[data-square]')) return; // pointer path owns squares
        const veil = e.target.closest ? e.target.closest('[data-st-veil]') : null;
        if (veil && e.target === veil) { S.dlg = null; render(); return; }
        const t = e.target.closest ? e.target.closest('[data-st]') : null;
        if (!t) return;
        const a = t.dataset.st;
        if (a === 'promo') { doPlayMove(t.dataset.from, t.dataset.to, t.dataset.p); return; }
        if (a === 'practice-promo') { practiceAttempt(t.dataset.from, t.dataset.to, t.dataset.p); return; }
        doAction(a, t);
    });
    document.addEventListener('change', (e) => {
        if (!e.target.closest || !e.target.closest('#study-content')) return;
        const id = e.target.id;
        const st = curStudy(), ch = curChapter(st);
        if (e.target.dataset && e.target.dataset.stChange === 'eng-toggle') {
            S.engOn = e.target.checked;
            if (!S.engOn && S.engine) S.engine.cancel();
            paintEngine();
            if (S.engOn) scheduleAnalyze();
            return;
        }
        if (e.target.dataset && e.target.dataset.stChange === 'eng-depth') {
            S.engDepth = clamp(parseInt(e.target.value, 10) || 16, 8, 22);
            S.lastFen = null;
            scheduleAnalyze();
            return;
        }
        if (!st || !ch) return;
        if (id === 'st-nag' && S.node) { S.node.nag = e.target.value ? +e.target.value : null; touch(st); render(); }
        else if (id === 'st-movecomment' && S.node) { S.node.comment = e.target.value.slice(0, 2000); touch(st); }
        else if (id === 'st-chapnotes') { ch.notes = e.target.value.slice(0, 8000); touch(st); }
        else if (id === 'st-white') { ch.whiteName = e.target.value.slice(0, 40); touch(st); }
        else if (id === 'st-black') { ch.blackName = e.target.value.slice(0, 40); touch(st); }
        else if (id === 'st-result') { ch.result = e.target.value; touch(st); }
    });
    document.addEventListener('input', (e) => {
        if (!e.target.closest || !e.target.closest('#study-content')) return;
        if (e.target.id === 'st-search') {
            S.search = e.target.value.slice(0, 60);
            paintLibrary();
            const inp = $('#st-search');
            if (inp) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (_) {} }
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (S.dlg) { S.dlg = null; if (studyActive()) render(); return; }
            if (!$('#st-promo')?.hidden) { hidePromoPicker(); S.sel = null; paintBoard(); return; }
        }
        if (!studyActive()) return;
        const sq = e.target.closest ? e.target.closest('[data-square]') : null;
        if (sq && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            if (sq.closest('#st-practice-board')) practiceActivate(sq.dataset.square);
            else onSquareActivate(sq.dataset.square);
            return;
        }
        if (typingIn(e.target)) {
            if (e.key === 'Enter' && e.target.hasAttribute('data-rename-input')) {
                e.preventDefault();
                doAction('rename-save', e.target);
            }
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        switch (e.key) {
            case 'ArrowLeft': e.preventDefault(); navTo('prev'); break;
            case 'ArrowRight': e.preventDefault(); navTo('next'); break;
            case 'Home': e.preventDefault(); navTo('start'); break;
            case 'End': e.preventDefault(); navTo('end'); break;
            case 'ArrowUp': e.preventDefault(); navTo('upvar'); break;
            case 'ArrowDown': e.preventDefault(); navTo('downvar'); break;
            case 'f': case 'F': doAction('flip', document.body); break;
            case 'e': case 'E':
                S.engOn = !S.engOn;
                if (!S.engOn && S.engine) S.engine.cancel();
                render();
                if (S.engOn) scheduleAnalyze();
                break;
            case '?': S.dlg = { kind: 'shortcuts' }; render(); break;
        }
    });
    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest && e.target.closest('#st-board')) e.preventDefault();
    });
    document.addEventListener('pointerdown', (e) => {
        if (!studyActive()) return;
        onBoardPointerDown(e);
    });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
}
/* ── public surface ── */
function open() {
    wireOnce();
    if (!S.lib) S.lib = loadLibrary();
    if (!S.studyId && S.lib.studies.length) {
        const recent = [...S.lib.studies].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (recent) {
            S.studyId = recent.id;
            const last = recent.chapters.find(c => c.id === recent.visited[recent.visited.length - 1]) || recent.chapters[0];
            if (last) { S.chapterId = last.id; S.node = last.root; }
        }
    }
    render();
    if (S.engOn) ensureEngine();
    scheduleAnalyze();
}
/* Import a finished online game (from Profile history) as a chapter of
   the "My games" study. Only real stored data is used: moves replayed
   through the rules engine, names/dates from the saved record. */
function importGame(gameId) {
    wireOnce();
    if (!S.lib) S.lib = loadLibrary();
    let rec = null;
    try { if (typeof OnlineStore !== 'undefined') rec = OnlineStore.loadGame(gameId); } catch (_) {}
    if (!rec || !Array.isArray(rec.moves) || !rec.moves.length) {
        toast('No saved moves for that game — only its result was kept.');
        return false;
    }
    const opp = (rec.opp && rec.opp.name) || 'Opponent';
    let ctrlTxt = '';
    try { if (rec.control && rec.control.name) ctrlTxt = rec.control.name + (rec.control.label ? ' ' + rec.control.label : ''); } catch (_) {}
    let when = '';
    try {
        if (typeof OnlineRatings !== 'undefined') {
            const h = OnlineRatings.history(studyUserId()).find(x => x && x.gameId === gameId);
            if (h && h.date) when = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
    } catch (_) {}
    let st = S.lib.studies.find(s => s.title === 'My games');
    if (!st) { st = blankStudy('My games'); S.lib.studies.unshift(st); }
    const title = `vs ${opp}${ctrlTxt ? ' · ' + ctrlTxt : ''}${when ? ' · ' + when : ''}`.slice(0, 80);
    const ch = blankChapter(title, START_FEN);
    let n = ch.root, kept = 0;
    rec.moves.forEach(m => {
        if (!m || typeof m.from !== 'string' || typeof m.to !== 'string') return;
        const r = playOn(n, m.from, m.to, m.promo || undefined);
        if (r.illegal) return;
        n = r.node; kept++;
    });
    if (!kept) { toast('Those saved moves are no longer legal — import skipped.'); return false; }
    if (rec.result === 'win') ch.result = rec.myColor === 'black' ? '0-1' : '1-0';
    else if (rec.result === 'loss') ch.result = rec.myColor === 'black' ? '1-0' : '0-1';
    else if (rec.result === 'draw') ch.result = '1/2-1/2';
    st.chapters.push(ch);
    touch(st);
    openChapter(st, ch);
    try { if (window.app) window.app.showStudy(); } catch (_) {}
    toast(`Imported ${kept} half-moves vs ${opp}.`);
    return true;
}
window.DoChessStudy = {
    open, importGame,
    version: '1.0.0',
    _t: { parsePgnText, classifyMove, treeToPgn, treeRoot, studyKey, evalWords, fmtScore, currentPgn: () => { const st = curStudy(), ch = curChapter(st); return st && ch ? treeToPgn(st, ch) : ''; } }
};

/*__APPEND__*/
})();
