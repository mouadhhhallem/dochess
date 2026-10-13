/**
 * js/cloud-engine.js — optional cloud chess-engine assist.
 *
 * Shapes follow the anzemu/chess-api route style (game + AI-move endpoints
 * over HTTP), but the base URL and route are fully configurable because no
 * public deployment of that API exists: set localStorage `cc_cloud_api`
 * to the base (e.g. your own chess-api host) and optionally
 * `cc_cloud_route` (default `/ai/move`, `{fen}` placeholder supported).
 * Requests are POST {fen, moves?} or GET ?fen= (fallback), 6 s timeout,
 * answer parsed from bestMove|move|bestmove|uci (UCI string). Anything
 * fails => null, and callers ALWAYS fall back to the local engine, so the
 * course never depends on the network. Classic script, file:// safe.
 *
 * Also bundled: DoChessChessCom, a tiny client for the public chess.com
 * data API shapes (andyruwruw/chess-web-api wraps the same endpoints):
 * no key, CORS-open, live today. Used by Friends search + Profile import.
 */
(function () {
    'use strict';

    function base() {
        try {
            const v = localStorage.getItem('cc_cloud_api');
            if (v) return String(v).replace(/\/+$/, '');
        } catch (_) {}
        return null;
    }
    function route() {
        try {
            const v = localStorage.getItem('cc_cloud_route');
            if (v) return v;
        } catch (_) {}
        return '/ai/move';
    }
    function configured() { return base() !== null; }

    function pickMove(obj) {
        if (!obj || typeof obj !== 'object') return null;
        for (const k of ['bestMove', 'bestmove', 'move', 'uci', 'best_move']) {
            const v = obj[k];
            if (typeof v === 'string' && /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/.test(v.trim())) return v.trim();
        }
        return null;
    }

    // Best-move suggestion for a FEN. Resolves a UCI string or null.
    async function hint(fen, moves) {
        const b = base();
        if (!b || typeof fen !== 'string' || !fen) return null;
        const r = route().includes('{fen}') ? route().split('{fen}').join(encodeURIComponent(fen)) : route();
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 6000);
        try {
            // POST first (chess-api style JSON body)…
            try {
                const res = await fetch(b + (r.startsWith('/') ? r : '/' + r), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fen, moves: Array.isArray(moves) ? moves : [] }),
                    signal: ctrl.signal,
                });
                if (res.ok) {
                    const mv = pickMove(await res.json().catch(() => null));
                    if (mv) return mv;
                }
            } catch (_) { /* fall through to GET */ }
            // …then GET ?fen= (some deployments only serve reads).
            const res = await fetch(`${b}/ai/move?fen=${encodeURIComponent(fen)}`, { signal: ctrl.signal });
            if (!res.ok) return null;
            return pickMove(await res.json().catch(() => null));
        } catch (_) {
            return null;
        } finally { clearTimeout(to); }
    }

    // chess.com public data (no key, CORS-open). Shapes mirror
    // andyruwruw/chess-web-api (thin wrapper over api.chess.com/pub).
    async function chesscomPlayer(username, timeoutMs) {
        const u = String(username || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!u) throw new Error('empty');
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
        try {
            const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}`, { signal: ctrl.signal });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error('http-' + res.status);
            const p = await res.json();
            let stats = null;
            try {
                const sr = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/stats`, { signal: ctrl.signal });
                if (sr.ok) stats = await sr.json();
            } catch (_) {}
            const pick = (cat) => (stats && stats[cat] && stats[cat].last && stats[cat].last.rating) || null;
            return {
                username: p.username || u,
                name: p.name || p.username || u,
                avatar: p.avatar || null,
                joined: p.joined || 0,
                blitz: pick('chess_blitz'), rapid: pick('chess_rapid'), bullet: pick('chess_bullet'),
            };
        } finally { clearTimeout(to); }
    }

    window.DoChessCloud = { configured, hint, base, version: 1 };
    window.DoChessChessCom = { player: chesscomPlayer, version: 1 };
})();
