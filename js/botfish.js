/**
 * js/botfish.js — Stockfish analysis for the Vs Bots coach.
 *
 * A tiny UCI client over the SAME vendored Stockfish 10 WASM worker the
 * Study screen uses (vendor/stockfish/, no key, no account, no network —
 * it runs on-device). One job: score a position AFTER the player's move
 * so the coach's verdict comes from a real engine, not vibes.
 *
 * Contract (never numbers on screen — the coach turns these into words):
 *   DoChessBotFish.analyze(movesUci, { depth, timeoutMs })
 *     -> Promise<{ ok, whiteCp, mate, depth, partial }>
 *   - whiteCp: centipawns from White's (the player's) perspective.
 *   - mate: moves-to-mate signed like whiteCp (>0 white mates), else 0.
 *   - ok:false when the worker cannot run here (file://, blocked WASM)
 *     or the search times out — callers MUST fall back to the app engine.
 *
 * Latest-only: a newer analyze() supersedes a stale in-flight one.
 */
(function () {
    'use strict';

    const WORKER_URL = 'vendor/stockfish/stockfish.wasm.js';
    const BOOT_TIMEOUT_MS = 20000;

    const S = {
        worker: null,
        booted: false,
        booting: false,
        dead: false,
        token: 0,
        pending: null, // { token, resolve, timer, best: {cp|mate} | null }
    };

    function post(cmd) {
        try { S.worker.postMessage(cmd); return true; }
        catch (_) { return false; }
    }

    function failPending(reason) {
        const p = S.pending;
        S.pending = null;
        if (p) {
            try { clearTimeout(p.timer); } catch (_) {}
            try { p.resolve({ ok: false, reason }); } catch (_) {}
        }
    }

    function kill(reason) {
        S.dead = true; S.booted = false; S.booting = false;
        try { if (S.worker) S.worker.terminate(); } catch (_) {}
        S.worker = null;
        failPending(reason || 'unavailable');
    }

    function onMessage(e) {
        const line = String((e && e.data) == null ? '' : e.data);
        if (!line) return;
        if (!S.booted) {
            if (/uciok/.test(line)) { post('isready'); }
            else if (line === 'readyok') { S.booted = true; S.booting = false; pump(); }
            return;
        }
        const p = S.pending;
        if (!p) return;
        if (line.indexOf('bestmove') === 0) {
            const best = p.best;
            S.pending = null;
            try { clearTimeout(p.timer); } catch (_) {}
            if (best) p.resolve({ ok: true, whiteCp: best.whiteCp, mate: best.mate, depth: best.depth, partial: false });
            else p.resolve({ ok: false, reason: 'no-score' });
            return;
        }
        const s = parseScore(line, p.whiteToMove);
        if (s) p.best = s;
    }

    function pump() {
        const p = S.pending;
        if (!p || !S.booted || !S.worker) return;
        post('position startpos moves ' + p.moves);
        post('go depth ' + p.depth);
    }

    /**
     * Parse one UCI info line into White-perspective {whiteCp, mate}.
     * UCI scores are relative to the SIDE TO MOVE — the normalization is
     * the entire point of this helper, and it is unit-tested, because a
     * flipped sign would praise blunders and scold brilliancies.
     */
    function parseScore(line, whiteToMove) {
        // Depth precedes the score in real UCI lines
        // ("info depth 11 seldepth 20 ... score cp 150 ..."): two anchored
        // matches, because one optional-group regex would match empty at
        // position 0 and never see the depth.
        const dm = /\bdepth\s+(\d+)/.exec(line);
        const sm = /score\s+(cp|mate)\s+(-?\d+)/.exec(line);
        if (!sm) return null;
        const depth = dm ? parseInt(dm[1], 10) : 0;
        const kind = sm[1], v = parseInt(sm[2], 10);
        if (!isFinite(v)) return null;
        const sign = whiteToMove ? 1 : -1;
        if (kind === 'mate') {
            // Normalize FIRST: UCI mate is relative to the side to move
            // (+N = side to move mates). A flipped sign here would praise
            // blunders and scold brilliancies.
            if (v === 0) return { whiteCp: 0, mate: 0, depth };
            const wv = sign * v;
            return { whiteCp: wv > 0 ? 100000 : -100000, mate: wv, depth };
        }
        return { whiteCp: sign * v, mate: 0, depth };
    }

    function ensure() {
        if (S.worker) return true;
        if (S.dead) return false;
        if (S.booting) return true; // handshake in flight; pump on readyok
        S.booting = true;
        let w = null;
        try {
            w = new Worker(WORKER_URL);
        } catch (_) {
            S.booting = false; S.dead = true;
            return false;
        }
        S.worker = w;
        w.onmessage = onMessage;
        w.onerror = () => kill('worker-error');
        setTimeout(() => { if (!S.booted && S.worker) kill('boot-timeout'); }, BOOT_TIMEOUT_MS);
        try { w.postMessage('uci'); }
        catch (_) { kill('post-failed'); return false; }
        return true;
    }

    /**
     * Score a position given as UCI moves from the startpos.
     * Resolves {ok:true, whiteCp, mate, depth} or {ok:false, reason}.
     */
    function analyze(movesUci, opts) {
        const o = opts || {};
        const token = ++S.token;
        const depth = Math.max(1, Math.min(20, o.depth || 11));
        const timeoutMs = Math.max(500, Math.min(15000, o.timeoutMs || 4000));
        return new Promise((resolve) => {
            if (!ensure()) { resolve({ ok: false, reason: 'unavailable' }); return; }
            // Latest-only: supersede anything still searching.
            if (S.pending) { try { post('stop'); } catch (_) {} failPending('superseded'); }
            const moves = Array.isArray(movesUci) ? movesUci.filter((m) => typeof m === 'string' && m).join(' ') : '';
            // Side to move folds from the ply count (startpos: White first).
            const plies = Array.isArray(movesUci) ? movesUci.filter((m) => typeof m === 'string' && m).length : 0;
            const whiteToMove = (plies % 2) === 0;
            const timer = setTimeout(() => {
                // Timed out mid-search: stop the engine and settle for the
                // deepest complete score seen so far, flagged partial.
                try { post('stop'); } catch (_) {}
                const p = S.pending;
                S.pending = null;
                if (p && p.token === token && p.best) {
                    resolve({ ok: true, whiteCp: p.best.whiteCp, mate: p.best.mate, depth: p.best.depth, partial: true });
                } else if (p && p.token === token) {
                    resolve({ ok: false, reason: 'timeout' });
                }
            }, timeoutMs);
            S.pending = { token, resolve, timer, best: null, whiteToMove, moves, depth };
            if (S.booted) pump();
            // else: pump() runs on readyok; the boot timeout kills it if
            // the worker never answers (file://, blocked WASM).
        });
    }

    function warm() {
        try { ensure(); } catch (_) {}
    }

    window.DoChessBotFish = {
        analyze, warm, parseScore,
        available() { return !S.dead; },
    };
})();
