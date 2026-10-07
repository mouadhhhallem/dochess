/**
 * js/board.js — incremental SVG/image chessboard for DoChess lessons.
 *
 * Dumb view layer: squares are created ONCE, then synced in place from a
 * view object (no 64-node rebuilds, focus preserved). Game rules live in
 * engine.js; this file only renders + reports taps/keys.
 *
 * view = {
 *   pieces:  { e2: {type:'p', color:'w'}, ... },
 *   selected: 'e2' | null,
 *   legalTos: Set<string>,          // destination squares for the selection
 *   captureTos: Set<string>,        // subset that are captures (ring style)
 *   lastFrom, lastTo: square|null,
 *   checkSq: square|null,          // king to outline (non-color cue included)
 *   stars: Set<string>,            // uncollected goal stars
 *   targets: Set<string>,          // uncollected capture targets
 *   obstacles: Set<string>,        // lava squares
 *   reachSq: square|null,          // reach goal square
 *   rover: square,                 // roving-tabstop square
 *   prefix: string,                // image cache-buster, e.g. 'v1'
 * }
 *
 * onAction(sq) fires on tap / Enter / Space with the algebraic square.
 * Arrow keys / Home / End move the roving tab stop (flip-aware: no flip in
 * lessons — white is always at the bottom).
 */

const FILES = 'abcdefgh';
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function squareName(r, c) {
    return FILES[c] + (8 - r);
}

export function pieceImageSrc(type, color, prefix = 'v1') {
    const white = color === 'w';
    return `assets/pieces/${white ? 'white' : 'black'}-${PIECE_NAMES[type]}.svg?${prefix}`;
}

export function pieceLabel(type, color) {
    return `${color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[type]}`;
}

export function createBoard(el, { onAction, prefix = 'v1' } = {}) {
    el.innerHTML = '';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Chess board');
    const order = [];
    for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
            const sq = document.createElement('div');
            sq.className = 'chess-square white';
            sq.dataset.dr = String(dr);
            sq.dataset.dc = String(dc);
            sq.setAttribute('role', 'button');
            sq.setAttribute('tabindex', '-1');
            el.appendChild(sq);
            order.push(sq);
        }
    }

    const bySquare = (name) => el.querySelector(`.chess-square[data-square="${name}"]`);

    const sqOf = (e) => {
        const t = e.target && e.target.closest ? e.target.closest('.chess-square') : null;
        return t && t.dataset.square ? t : null;
    };

    el.addEventListener('click', (e) => {
        const sq = sqOf(e);
        if (sq && onAction) onAction(sq.dataset.square);
    });
    el.addEventListener('keydown', (e) => {
        const sq = sqOf(e);
        if (!sq) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onAction) onAction(sq.dataset.square);
            return;
        }
        const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        let target = null;
        if (dirs[e.key]) {
            e.preventDefault();
            const dr = Math.max(0, Math.min(7, +sq.dataset.dr + dirs[e.key][0]));
            const dc = Math.max(0, Math.min(7, +sq.dataset.dc + dirs[e.key][1]));
            target = el.querySelector(`.chess-square[data-dr="${dr}"][data-dc="${dc}"]`);
        } else if (e.key === 'Home') {
            e.preventDefault();
            target = el.querySelector('.chess-square[data-dr="0"][data-dc="0"]');
        } else if (e.key === 'End') {
            e.preventDefault();
            target = el.querySelector('.chess-square[data-dr="7"][data-dc="7"]');
        } else return;
        if (target) {
            el.querySelectorAll('.chess-square[tabindex="0"]').forEach((n) => n.setAttribute('tabindex', '-1'));
            target.setAttribute('tabindex', '0');
            try { target.focus(); } catch (_) { /* noop */ }
        }
    });

    function syncPiece(sq, piece) {
        let img = sq.querySelector('img.chess-piece');
        if (!piece) {
            if (img) img.remove();
            return;
        }
        const wantSrc = pieceImageSrc(piece.type, piece.color, prefix);
        const wantKey = `${piece.color}${piece.type}`;
        if (img && img.dataset.pk === wantKey && img.getAttribute('src') === wantSrc) return; // unchanged
        const fresh = document.createElement('img');
        fresh.src = wantSrc;
        fresh.className = `chess-piece ${piece.color === 'w' ? 'white' : 'black'}`;
        fresh.alt = pieceLabel(piece.type, piece.color);
        fresh.width = 45; fresh.height = 45;
        fresh.decoding = 'async';
        fresh.draggable = false;
        fresh.dataset.pk = wantKey;
        if (img) img.replaceWith(fresh);
        else sq.prepend(fresh);
    }

    function render(view) {
        const stars = view.stars || new Set();
        const targets = view.targets || new Set();
        const obstacles = view.obstacles || new Set();
        const legal = view.legalTos || new Set();
        const captures = view.captureTos || new Set();
        for (const sq of order) {
            const dr = +sq.dataset.dr, dc = +sq.dataset.dc;
            const r = dr, c = dc; // lessons: white at bottom, no flip
            const light = (r + c) % 2 === 0;
            const name = squareName(r, c);
            sq.className = `chess-square ${light ? 'white' : 'black'}`;
            sq.dataset.row = String(r);
            sq.dataset.col = String(c);
            sq.dataset.square = name;
            const piece = view.pieces ? view.pieces[name] : null;
            const isCheck = view.checkSq === name;
            let label = piece ? `${name}, ${pieceLabel(piece.type, piece.color)}` : `${name}, empty`;
            if (isCheck) label += ', check';
            if (stars.has(name)) label += ', star';
            if (targets.has(name)) label += ', target';
            sq.setAttribute('aria-label', label);
            if (view.selected === name) { sq.classList.add('selected'); sq.setAttribute('aria-selected', 'true'); }
            else sq.removeAttribute('aria-selected');
            if (view.lastFrom === name || view.lastTo === name) sq.classList.add('last-move');
            if (isCheck) sq.classList.add('in-check');
            if (obstacles.has(name)) sq.classList.add('is-obstacle');
            if (view.reachSq === name) sq.classList.add('is-reach');
            syncPiece(sq, piece);
            // legal indicators (single small node)
            const wantDot = legal.has(name);
            let dot = sq.querySelector('.legal-dot, .legal-ring');
            if (wantDot && !dot) {
                dot = document.createElement('div');
                dot.className = captures.has(name) ? 'legal-ring' : 'legal-dot';
                dot.setAttribute('aria-hidden', 'true');
                sq.appendChild(dot);
            } else if (wantDot && dot) {
                const cls = captures.has(name) ? 'legal-ring' : 'legal-dot';
                if (dot.className !== cls) dot.className = cls;
            } else if (!wantDot && dot) dot.remove();
            // goal markers (single small node)
            let mark = sq.querySelector('.goal-mark');
            const wantStar = stars.has(name), wantTarget = targets.has(name);
            if ((wantStar || wantTarget) && !mark) {
                mark = document.createElement('span');
                mark.className = 'goal-mark';
                mark.setAttribute('aria-hidden', 'true');
                sq.appendChild(mark);
            }
            if (mark) {
                if (wantStar) { mark.textContent = '★'; mark.dataset.kind = 'star'; }
                else if (wantTarget) { mark.textContent = '◎'; mark.dataset.kind = 'target'; }
                else mark.remove();
            }
            // coordinates on fixed display edges
            let fl = sq.querySelector('.coord-file');
            let rk = sq.querySelector('.coord-rank');
            if (dr === 7) {
                if (!fl) { fl = document.createElement('span'); fl.className = 'coord-file'; sq.appendChild(fl); }
                const t = FILES[c];
                if (fl.textContent !== t) fl.textContent = t;
            } else if (fl) fl.remove();
            if (dc === 0) {
                if (!rk) { rk = document.createElement('span'); rk.className = 'coord-rank'; sq.appendChild(rk); }
                const t = String(8 - r);
                if (rk.textContent !== t) rk.textContent = t;
            } else if (rk) rk.remove();
            sq.setAttribute('tabindex', view.rover === name ? '0' : '-1');
        }
    }

    return {
        render,
        squareEl: bySquare,
        focusSquare(name) {
            const sq = bySquare(name);
            if (sq) {
                el.querySelectorAll('.chess-square[tabindex="0"]').forEach((n) => n.setAttribute('tabindex', '-1'));
                sq.setAttribute('tabindex', '0');
                try { sq.focus({ preventScroll: true }); } catch (_) { /* noop */ }
            }
        },
        destroy() { el.innerHTML = ''; },
    };
}
