/**
 * js/pieces.js — the one source of truth for piece artwork paths.
 *
 * Every screen (app / home / study / puzzles / learn) resolves piece images
 * through `window.DoChessPieces` so a single choice in the Online lobby
 * ("Piece style", under Board style) repaints every board in the product.
 *
 * Sets live in folders under assets/pieces/ and must each contain the 12
 * files `white-king.svg … black-pawn.svg` (viewBox 0 0 45 45).
 *
 * Classic script (no modules) so it runs before app.js on file:// and under
 * the page's `script-src 'self'` CSP. Falls back to the original set when
 * localStorage is blocked or the stored id is unknown.
 */
(function () {
    'use strict';

    var STORE_KEY = 'cc_piece_set';
    var DEFAULT_ID = 'classic';

    var SETS = [
        { id: 'classic', name: 'Classic', dir: 'pieces-main' },
        { id: 'modern', name: 'Modern', dir: 'pieces-second' }
    ];

    var KINDS = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

    function valid(id) {
        for (var i = 0; i < SETS.length; i++) if (SETS[i].id === id) return SETS[i].id;
        return DEFAULT_ID;
    }

    function current() {
        var id = DEFAULT_ID;
        try {
            var s = window.localStorage && localStorage.getItem(STORE_KEY);
            if (s) id = valid(s);
        } catch (_) { /* blocked storage → default set */ }
        for (var i = 0; i < SETS.length; i++) if (SETS[i].id === id) return SETS[i];
        return SETS[0];
    }

    function dir() { return current().dir; }

    /** URL for a piece letter ('p'..'k') or a full piece char ('P'/'n'). */
    function url(piece, ver) {
        var ch = String(piece || 'p');
        var white = ch === ch.toUpperCase();
        var kind = KINDS[ch.toLowerCase()] || 'pawn';
        var set = current();
        return 'assets/pieces/' + set.dir + '/' + (white ? 'white' : 'black') + '-' + kind + '.svg' +
            (ver ? '?' + ver : '');
    }

    /** URL from explicit colour + piece type (learn/board.js vocabulary). */
    function urlFor(color, type, ver) {
        return url(color === 'w' || color === 'white' ? String(type).toUpperCase() : String(type).toLowerCase(), ver);
    }

    function set(id) {
        var next = valid(id);
        try { window.localStorage && localStorage.setItem(STORE_KEY, next); } catch (_) { /* ignore */ }
        applyDom(next);
        repaint(next);
        try {
            window.dispatchEvent(new CustomEvent('dochess:pieces', { detail: { set: next } }));
        } catch (_) { /* ignore */ }
        return next;
    }

    /**
     * Swap every rendered piece image in place. Boards paint piece <img>s
     * with `data-fallback-piece` (the piece letter), so one pass restyles
     * all eight boards in the product without re-rendering any screen.
     */
    function repaint(id) {
        try {
            var ver = '';
            if (window.ChessCourseApp && typeof ChessCourseApp.assetV === 'function') ver = ChessCourseApp.assetV();
            else ver = 'v24';
            var imgs = document.querySelectorAll('img[data-fallback-piece]');
            for (var i = 0; i < imgs.length; i++) {
                var p = imgs[i].getAttribute('data-fallback-piece');
                if (!p) continue;
                var want = url(p, ver);
                if (imgs[i].getAttribute('src') !== want) imgs[i].setAttribute('src', want);
            }
        } catch (_) { /* ignore */ }
    }

    /** Paint body[data-piece-set] so CSS (watermarks, previews) can follow. */
    function applyDom(id) {
        try {
            if (!document.body) return;
            if (id === DEFAULT_ID) delete document.body.dataset.pieceSet;
            else document.body.dataset.pieceSet = id;
        } catch (_) { /* ignore */ }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { applyDom(current().id); });
    } else {
        applyDom(current().id);
    }

    window.DoChessPieces = {
        SETS: SETS,
        KINDS: KINDS,
        get: function () { return current().id; },
        set: set,
        url: url,
        urlFor: urlFor,
        dir: dir
    };
})();
