/**
 * js/board.js — incremental SVG/image chessboard for DoChess levels.
 *
 * Dumb view layer: squares are created ONCE, then synced in place from a
 * view object (no 64-node rebuilds, focus preserved). Game rules live in
 * engine.js; this file only renders + reports taps/keys/drags.
 *
 * Latency budget (moves must feel instant):
 *   - every write is diffed against the last painted state, so a move that
 *     changes 3 squares touches 3 squares instead of 64;
 *   - a piece node is REUSED (only its src swaps) so the browser never
 *     re-decodes a 15 KB SVG mid-move;
 *   - the glide overlay is transform-only and never blocks input.
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
 *   glide: boolean,                // animate the moved piece (default true)
 * }
 *
 * onAction(sq) fires on tap / Enter / Space with the algebraic square.
 * Arrow keys / Home / End move the roving tab stop (flip-aware: no flip in
 * levels — white is always at the bottom).
 */

const FILES = 'abcdefgh';
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

const reduceMotion = () => {
    try { return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
};

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
    const sqIndex = {}; // "dr,dc" -> square element (no querySelector on the hot path)
    for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
            const sq = document.createElement('div');
            sq.className = 'chess-square white';
            sq.dataset.dr = String(dr);
            sq.dataset.dc = String(dc);
            sq.setAttribute('role', 'button');
            sq.setAttribute('tabindex', '-1');
            // Fixed identity (levels never flip): set once, never rewritten.
            sq.dataset.square = squareName(dr, dc);
            sq.dataset.row = String(dr);
            sq.dataset.col = String(dc);
            el.appendChild(sq);
            order.push(sq);
            sqIndex[dr + ',' + dc] = sq;
        }
    }
    const byIndex = (dr, dc) => sqIndex[dr + ',' + dc];

    // Last painted state per square. Everything the renderer writes is
    // diffed against this, so a move is O(changed squares), not O(64).
    const prev = order.map(() => ({
        cls: '', label: '', sel: false, dot: '', mark: '', file: '', rank: '', tab: '', pk: '', src: '',
    }));

    /* ── Decode every piece image once, before the first move ─────────
       A piece whose bitmap is not decoded yet paints one frame late, which
       reads as a stutter on the very first move of a level. Decoding all
       twelve up front (at idle) removes that class of lag entirely. ─────── */
    function preloadPieces() {
        const run = () => {
            for (const color of ['w', 'b']) {
                for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
                    try {
                        const img = new Image();
                        img.decoding = 'async';
                        img.src = pieceImageSrc(type, color, prefix);
                        if (typeof img.decode === 'function') img.decode().catch(() => {});
                    } catch (_) {}
                }
            }
        };
        try {
            if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
            else setTimeout(run, 300);
        } catch (_) { setTimeout(run, 300); }
    }
    let roverEl = null;

    const bySquare = (name) => el.querySelector(`.chess-square[data-square="${name}"]`);

    const sqOf = (e) => {
        const t = e.target && e.target.closest ? e.target.closest('.chess-square') : null;
        return t && t.dataset.square ? t : null;
    };

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
            target = byIndex(dr, dc);
        } else if (e.key === 'Home') {
            e.preventDefault();
            target = byIndex(0, 0);
        } else if (e.key === 'End') {
            e.preventDefault();
            target = byIndex(7, 7);
        } else return;
        if (target) {
            // Synchronous focus is correct here: the keydown IS the user's
            // focus intent, and no paint can happen before it anyway.
            setRover(target);
            try { target.focus({ preventScroll: true }); } catch (_) { /* noop */ }
        }
    });

    function setRover(next) {
        if (roverEl && roverEl !== next) roverEl.setAttribute('tabindex', '-1');
        next.setAttribute('tabindex', '0');
        roverEl = next;
    }

    /* ── Drag-and-drop: same action path as click-click ─────────────
       A ghost follows the pointer once it clears the 10px slop; the drop
       square resolves to the same onAction(sq) call, so rules, undo and
       scoring are identical whichever gesture was used. A tap never
       travels far enough to start a drag, so click-click is untouched. ── */
    let drag = null;
    let swallowClick = false;
    el.addEventListener('click', (e) => {
        if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
        const sq = sqOf(e);
        if (sq && onAction) onAction(sq.dataset.square);
    });
    // A pointer gesture means the user is done with the roving stop: drop real
    // focus so no later focus() flush can be charged to a move.
    el.addEventListener('pointerdown', () => { keyboardUser = false; }, true);
    el.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button > 0) return;
        // Touch is handled by the touch* listeners below: under
        // `touch-action: manipulation` a finger drag gets claimed for
        // scrolling and the browser fires pointercancel mid-gesture, so a
        // pointer-based drag dies silently on phones.
        if (e.pointerType === 'touch') return;
        const sq = sqOf(e);
        if (!sq) return;
        const img = sq.querySelector('img.chess-piece');
        if (!img) return;
        drag = { sq, img, x0: e.clientX, y0: e.clientY, ghost: null, moved: false, id: e.pointerId, touch: false };
        noteDragStart();
    });
    /** Spawn the ghost under the pointer (pointer + touch share it). */
    function beginGhost(d, cx, cy) {
        const rect = d.img.getBoundingClientRect();
        const g = d.img.cloneNode();
        g.classList.add('drag-ghost');
        g.style.width = rect.width + 'px';
        g.style.height = rect.height + 'px';
        g.style.left = '0px';
        g.style.top = '0px';
        // Transform BEFORE append: no frame may render it at the CSS origin.
        g.style.transform = `translate(${cx - rect.width / 2}px, ${cy - rect.height / 2}px)`;
        document.body.appendChild(g);
        d.ghost = g;
        d.w = rect.width;
        d.h = rect.height;
        d.img.classList.add('is-dragging');
    }
    /** Follow the pointer (transform only — no layout per move). */
    function moveGhost(d, cx, cy) {
        if (!d.ghost) return;
        d.ghost.style.transform = `translate(${cx - d.w / 2}px, ${cy - d.h / 2}px)`;
    }

    el.addEventListener('pointermove', (e) => {
        const d = drag;
        if (!d || d.moved) return;
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) <= 10) return;
        d.moved = true;
        beginGhost(d, e.clientX, e.clientY);
        moveGhost(d, e.clientX, e.clientY);
        // Drag-start selects the piece — the same effect as the first click of
        // click-click — but ONLY when it is not selected yet. Calling it on an
        // already-selected square would toggle the selection back off.
        if (!d.sq.classList.contains('selected') && onAction) onAction(d.sq.dataset.square);
    });
    /* Keep the ghost under the pointer on every move (transform only). */
    el.addEventListener('pointermove', (e) => {
        const d = drag;
        if (d && d.moved) moveGhost(d, e.clientX, e.clientY);
    });
    /** Square under a client point, computed from the board box (immune to
        whatever element is painted on top, e.g. the drag ghost). */
    function squareAt(clientX, clientY) {
        const b = el.getBoundingClientRect();
        if (!(b.width > 0 && b.height > 0)) return null;
        const cell = b.width / 8;
        const dc = Math.floor((clientX - b.left) / cell);
        const dr = Math.floor((clientY - b.top) / cell);
        if (dc < 0 || dc > 7 || dr < 0 || dr > 7) return null;
        return byIndex(dr, dc);
    }
    // A drag also changes the board's page offset if the user auto-scrolls,
    // so the cached geometry must not survive one.
    const noteDragStart = () => invalidateGeometry();
    /* ── Touch drag ────────────────────────────────────────────────────
       Handled with raw touch events, NOT pointer events. Under
       `touch-action: manipulation` (needed so a tap can still scroll) the
       browser claims the gesture for panning and fires pointercancel as soon
       as the finger moves — which silently killed every finger drag while the
       mouse path worked fine. preventDefault() on touchmove once the finger
       has clearly left the start square (10px slop) keeps the gesture ours;
       below that slop we never preventDefault, so taps and page scrolling are
       unaffected. ──────────────────────────────────────────────────────── */
    let touchDrag = null;
    const SLOP = 10;

    el.addEventListener('touchstart', (e) => {
        if (touchDrag || e.touches.length !== 1) return;
        const t = e.touches[0];
        const sq = sqOf({ target: e.target });
        if (!sq) return;
        const img = sq.querySelector('img.chess-piece');
        if (!img) return;
        touchDrag = { sq, img, x0: t.clientX, y0: t.clientY, ghost: null, moved: false };
        noteDragStart();
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        const d = touchDrag;
        if (!d || e.touches.length !== 1) return;
        const t = e.touches[0];
        if (!d.moved) {
            if (Math.hypot(t.clientX - d.x0, t.clientY - d.y0) <= SLOP) return; // still a tap/scroll
            d.moved = true;
            beginGhost(d, t.clientX, t.clientY);
            // Select on drag-start, exactly like the first click of click-click.
            if (!d.sq.classList.contains('selected') && onAction) onAction(d.sq.dataset.square);
        }
        // From here the gesture is unambiguously ours.
        if (e.cancelable) e.preventDefault();
        moveGhost(d, t.clientX, t.clientY);
    }, { passive: false });

    const endTouch = (e) => {
        const d = touchDrag;
        touchDrag = null;
        if (!d) return;
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!d.moved || !t) { if (d.ghost) d.ghost.remove(); return; }
        if (d.ghost) d.ghost.remove();
        d.img.classList.remove('is-dragging');
        swallowClick = true;
        const sq = squareAt(t.clientX, t.clientY);
        if (sq && onAction) onAction(sq.dataset.square);
    };
    el.addEventListener('touchend', endTouch);
    el.addEventListener('touchcancel', (e) => {
        const d = touchDrag;
        touchDrag = null;
        if (!d) return;
        if (d.ghost) d.ghost.remove();
        d.img.classList.remove('is-dragging');
    });

    const teardownDrag = () => {
        const d = drag;
        drag = null;
        if (!d) return null;
        if (d.ghost) d.ghost.remove();
        d.img.classList.remove('is-dragging');
        return d;
    };
    const endDrag = (e) => {
        const d = teardownDrag();
        if (!d) return;
        if (!d.moved) return; // a tap: the click handler already fired
        // pointerup is followed by a click on the drag origin — eat it.
        swallowClick = true;
        const sq = squareAt(e.clientX, e.clientY);
        if (sq && onAction) onAction(sq.dataset.square);
    };
    // Bound on the WINDOW, not the board: a pointerup whose cursor left the
    // board must still tear the drag down, or the ghost stays on screen and
    // the piece never drops.
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', teardownDrag);

    /* ── Piece nodes ─────────────────────────────────────────────────────
       The single biggest source of first-move jank: creating a NEW <img>
       per piece makes the browser decode a ~15 KB SVG during the click.
       Instead every piece identity keeps a small pool of <img> nodes, and
       moving a piece RELOCATES the node that already holds its decoded
       bitmap. appendChild of an existing node never re-decodes. ──────── */
    const pool = new Map(); // "wP" -> img[]
    function acquirePiece(key, type, color, src) {
        const free = pool.get(key);
        const node = (free && free.length) ? free.pop() : document.createElement('img');
        node.width = 45; node.height = 45;
        node.decoding = 'async';
        node.draggable = false;
        node.className = `chess-piece ${color === 'w' ? 'white' : 'black'}`;
        node.alt = pieceLabel(type, color);
        node.dataset.pk = key;
        // Only assign when it actually differs: a redundant src write can
        // invalidate the decoded bitmap.
        if (node.getAttribute('src') !== src) node.src = src;
        return node;
    }
    function releasePiece(node, key) {
        node.remove();
        let free = pool.get(key);
        if (!free) { free = []; pool.set(key, free); }
        if (free.length < 3) free.push(node);
    }

    /** Place the right piece on a square, moving/reusing nodes. */
    function syncPiece(i, sq, piece) {
        const st = prev[i];
        const img = sq.firstElementChild && sq.firstElementChild.classList.contains('chess-piece')
            ? sq.firstElementChild : null;
        if (!piece) {
            if (img) releasePiece(img, st.pk || '?');
            st.pk = ''; st.src = '';
            return;
        }
        const wantSrc = pieceImageSrc(piece.type, piece.color, prefix);
        const wantKey = `${piece.color}${piece.type}`;
        if (st.pk === wantKey && st.src === wantSrc && img) return; // unchanged
        if (img && st.pk === wantKey) {
            // Same piece identity, different square: relocate the node so the
            // decoded bitmap comes along for free.
            sq.prepend(img);
        } else {
            if (img) releasePiece(img, st.pk || '?');
            sq.prepend(acquirePiece(wantKey, piece.type, piece.color, wantSrc));
        }
        st.pk = wantKey;
        st.src = wantSrc;
    }

    /* ── Geometry cache ──────────────────────────────────────────────────
       getBoundingClientRect() inside a click handler forces a synchronous
       layout. The board is a fixed square grid, so ONE measurement plus the
       cell size derives every square box; it is re-read only when something
       can actually have changed (resize, scroll, orientation). ───────── */
    let geo = null;
    function invalidateGeometry() { geo = null; }
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', invalidateGeometry);
        window.addEventListener('scroll', invalidateGeometry, true);
        window.addEventListener('orientationchange', invalidateGeometry);
    }
    /** Centre of a square in board-relative px, or null if not measurable.
        Geometry is only needed for the burst, so measuring is deferred until
        the first burst — the move path itself stays layout-read free. */
    function centreOf(name) {
        const f = FILES.indexOf(name[0]);
        const r = 8 - Number(name[1]);
        if (f < 0 || !(r >= 0 && r <= 7)) return null;
        if (!geo) {
            const b = el.getBoundingClientRect();
            geo = { cell: b.width / 8, ok: b.width > 0 && b.height > 0 };
        }
        if (!geo.ok) return null;
        return { x: f * geo.cell + geo.cell / 2, y: r * geo.cell + geo.cell / 2, cell: geo.cell };
    }

    /* ── Focus management ────────────────────────────────────────────────
       Following the roving tab stop with real DOM focus on every move is
       expensive: focus() forces a style+layout flush, and it is charged to
       the click that triggered it — which is exactly the "the board lags one
       move behind" feeling. Clicking a square DOES focus it, so "does the
       board hold focus?" is not a usable test.

       Instead: focus follows the piece only once the user has actually
       touched the keyboard, or when a caller asks for it explicitly
       (opening a level, so the first Tab lands in the right place). ───── */
    let keyboardUser = false;
    let focusQueued = false;
    let focusForced = false;
    el.addEventListener('keydown', () => { keyboardUser = true; }, true);

    function queueFocus(name, force) {
        if (force) focusForced = true;
        if (!force && !keyboardUser) { setRover(bySquare(name)); return; }
        if (focusQueued) return;
        focusQueued = true;
        const run = () => {
            focusQueued = false;
            const forced = focusForced;
            focusForced = false;
            const sq = bySquare(name);
            if (!sq || !el.contains(sq)) return;
            setRover(sq);
            const active = document.activeElement;
            if (!forced && (!active || !el.contains(active))) return;
            try { sq.focus({ preventScroll: true }); } catch (_) { /* noop */ }
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    /* ── Glide overlay: the moved piece flies from→to while the synced
       DOM is already correct, so the board is usable the whole time.
       Geometry comes from the cache above — no forced layout here. ── */
    function glide(from, to) {
        if (reduceMotion() || !from || !to || from === to) return;
        if (!el.isConnected) return;
        const dstEl = bySquare(to);
        if (!dstEl) return;
        const flying = dstEl.querySelector('img.chess-piece');
        if (!flying) return;
        const a = centreOf(from), c = centreOf(to);
        if (!a || !c) return;
        const size = a.cell * 0.85;
        const ghost = flying.cloneNode();
        ghost.classList.add('fly-piece');
        ghost.style.width = size + 'px';
        ghost.style.height = size + 'px';
        ghost.style.left = (c.x - size / 2) + 'px';
        ghost.style.top = (c.y - size / 2) + 'px';
        el.appendChild(ghost);
        const anim = ghost.animate(
            [
                { transform: `translate(${(a.x - c.x).toFixed(1)}px, ${(a.y - c.y).toFixed(1)}px)` },
                { transform: 'translate(0, 0)' },
            ],
            { duration: 190, easing: 'cubic-bezier(0.22, 0.68, 0.24, 1)', fill: 'both' }
        );
        const done = () => ghost.remove();
        anim.onfinish = done;
        setTimeout(done, 460);
    }

    /** One-shot celebration burst on a square (goal collected / captured).
        Fires right after a move, so it uses the cached geometry rather than
        forcing a layout read in the middle of the interaction. */
    function burst(sq, kind) {
        if (reduceMotion() || !sq) return;
        const host = bySquare(sq);
        if (!host) return;
        const c = centreOf(sq);
        if (!c) return;
        const wrap = document.createElement('span');
        wrap.className = 'goal-burst';
        wrap.dataset.kind = kind || 'star';
        const glyph = document.createElement('span');
        glyph.className = 'goal-burst-glyph';
        glyph.textContent = kind === 'target' ? '◎' : '★';
        wrap.appendChild(glyph);
        for (let i = 0; i < 8; i++) {
            const sp = document.createElement('i');
            const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
            const d = 30 + Math.random() * 26;
            sp.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`);
            sp.style.setProperty('--dy', `${(Math.sin(a) * d).toFixed(1)}px`);
            sp.style.setProperty('--sd', `${(Math.random() * 60).toFixed(0)}ms`);
            wrap.appendChild(sp);
        }
        host.appendChild(wrap);
        setTimeout(() => wrap.remove(), 1000);
        host.classList.add('goal-hit');
        setTimeout(() => host.classList.remove('goal-hit'), 620);
    }

    const idxOf = (name) => {
        const f = FILES.indexOf(name[0]);
        const r = 8 - Number(name[1]);
        if (f < 0 || !(r >= 0 && r <= 7)) return -1;
        return r * 8 + f;
    };
    /** Piece that was painted on a square BEFORE this pass, as "wP" style key. */
    const pkOf = (name) => { const i = idxOf(name); return i < 0 ? '' : prev[i].pk; };

    function render(view) {
        const stars = view.stars || new Set();
        const targets = view.targets || new Set();
        const obstacles = view.obstacles || new Set();
        const legal = view.legalTos || new Set();
        const captures = view.captureTos || new Set();
        const glideMove = view.glide === false ? null
            : (view.lastFrom && view.lastTo && view.lastFrom !== view.lastTo ? { from: view.lastFrom, to: view.lastTo } : null);
        // A real move empties the from-square; undo/reset repaints do not.
        const hadPiece = glideMove ? !!pkOf(glideMove.from) : false;

        for (let i = 0; i < 64; i++) {
            const sq = order[i];
            const st = prev[i];
            const dr = +sq.dataset.dr, dc = +sq.dataset.dc;
            const r = dr, c = dc; // levels: white at bottom, no flip
            const name = squareName(r, c);

            // ── class list, diffed ──
            let cls = (r + c) % 2 === 0 ? 'chess-square white' : 'chess-square black';
            if (view.selected === name) cls += ' selected';
            if (view.lastFrom === name || view.lastTo === name) cls += ' last-move';
            if (view.checkSq === name) cls += ' in-check';
            if (obstacles.has(name)) cls += ' is-obstacle';
            if (view.reachSq === name) cls += ' is-reach';
            if (stars.has(name)) cls += ' has-star';
            if (targets.has(name)) cls += ' has-target';
            if (cls !== st.cls) { sq.className = cls; st.cls = cls; }

            // ── a11y, diffed ──
            const piece = view.pieces ? view.pieces[name] : null;
            const isCheck = view.checkSq === name;
            let label = piece ? `${name}, ${pieceLabel(piece.type, piece.color)}` : `${name}, empty`;
            if (isCheck) label += ', check';
            if (stars.has(name)) label += ', star';
            if (targets.has(name)) label += ', target';
            if (label !== st.label) { sq.setAttribute('aria-label', label); st.label = label; }

            if (view.selected === name) {
                if (!st.sel) { sq.setAttribute('aria-selected', 'true'); st.sel = true; }
            } else if (st.sel) {
                sq.removeAttribute('aria-selected');
                st.sel = false;
            }

            syncPiece(i, sq, piece);

            // legal indicators (single small node)
            const wantDot = legal.has(name);
            const wantDotCls = wantDot ? (captures.has(name) ? 'legal-ring' : 'legal-dot') : '';
            if (wantDotCls !== st.dot) {
                let dot = sq.querySelector('.legal-dot, .legal-ring');
                if (wantDotCls) {
                    if (!dot) {
                        dot = document.createElement('div');
                        dot.className = wantDotCls;
                        dot.setAttribute('aria-hidden', 'true');
                        sq.appendChild(dot);
                    } else if (dot.className !== wantDotCls) {
                        dot.className = wantDotCls;
                    }
                } else if (dot) dot.remove();
                st.dot = wantDotCls;
            }

            // goal markers (single small node)
            const wantStar = stars.has(name), wantTarget = targets.has(name);
            const wantMark = wantStar ? '★' : (wantTarget ? '◎' : '');
            if (wantMark !== st.mark) {
                let mark = sq.querySelector('.goal-mark');
                if (wantMark) {
                    if (!mark) {
                        mark = document.createElement('span');
                        mark.className = 'goal-mark';
                        mark.setAttribute('aria-hidden', 'true');
                        sq.appendChild(mark);
                    }
                    mark.textContent = wantMark;
                    mark.dataset.kind = wantStar ? 'star' : 'target';
                } else if (mark) mark.remove();
                st.mark = wantMark;
            }

            // coordinates on fixed display edges
            const wantFile = dr === 7 ? FILES[c] : '';
            if (wantFile !== st.file) {
                let fl = sq.querySelector('.coord-file');
                if (wantFile) {
                    if (!fl) { fl = document.createElement('span'); fl.className = 'coord-file'; sq.appendChild(fl); }
                    if (fl.textContent !== wantFile) fl.textContent = wantFile;
                } else if (fl) fl.remove();
                st.file = wantFile;
            }
            const wantRank = dc === 0 ? String(8 - r) : '';
            if (wantRank !== st.rank) {
                let rk = sq.querySelector('.coord-rank');
                if (wantRank) {
                    if (!rk) { rk = document.createElement('span'); rk.className = 'coord-rank'; sq.appendChild(rk); }
                    if (rk.textContent !== wantRank) rk.textContent = wantRank;
                } else if (rk) rk.remove();
                st.rank = wantRank;
            }

            // Roving tabindex (kept in sync by hand, no querySelectorAll).
            const tab = view.rover === name ? '0' : '-1';
            if (tab !== st.tab) { sq.setAttribute('tabindex', tab); st.tab = tab; }
            if (tab === '0') roverEl = sq;
        }

        // Glide only on a genuine move (the from-square actually emptied during
        // this pass), so undo/restart/level-switch repaints never animate.
        if (glideMove && hadPiece && !pkOf(glideMove.from)) glide(glideMove.from, glideMove.to);
    }

    preloadPieces();

    return {
        render,
        squareEl: bySquare,
        burst,
        focusSquare(name, force) { queueFocus(name, force); },
        destroy() { el.innerHTML = ''; },
    };
}