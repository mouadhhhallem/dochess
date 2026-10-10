/**
 * home.js — DoChess home page (classic script, file:// compatible).
 *
 * Owns everything inside #home-screen: static shell (rendered once),
 * progress-driven regions (refreshed on every show/progress change),
 * and the interactive hero board (a real Italian-Game sandbox driven
 * by the vendored chess.js rules — every move is validated, nothing
 * is scripted). All destinations are existing working features.
 */
(function () {
'use strict';

function esc(v) {
    if (typeof window.esc === 'function') return window.esc(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function $(sel, root) { return (root || document).querySelector(sel); }
function tileIcon(name) {
    try {
        if (window.app && typeof window.app._tileIcon === 'function') return window.app._tileIcon(name);
    } catch (_) {}
    return '';
}

const app = () => window.app;
const START_MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];

const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

/* ── static shell (built once) ── */
let shellBuilt = false;
function shell() {
    const wrap = document.getElementById('hm-wrap');
    if (!wrap || shellBuilt) return;
    shellBuilt = true;
    wrap.innerHTML = `
    <section class="hm-hero" aria-label="Welcome to DoChess">
        <div class="hm-hero-copy">
            <p class="hm-eyebrow"><span class="hm-eyebrow-mark" aria-hidden="true"></span>Your next move starts here</p>
            <h2 class="hm-title">Think deeper.<br>Play <em>smarter.</em></h2>
            <p class="hm-sub">Ten hands-on lessons that teach chess the way it should be taught — one real move at a time, with instant feedback and a patient board.</p>
            <div class="hm-ctas">
                <button class="btn-primary btn-glow-strong" id="hm-play" type="button">Play Chess</button>
                <button class="btn-secondary" id="start-learning-btn" type="button">Start Learning →</button>
            </div>
            <p class="hm-nextline" id="hm-nextline"></p>
            <ul class="hm-facts" aria-label="Course facts">
                <li><strong>10</strong><span>guided lessons</span></li>
                <li><strong>36</strong><span>interactive levels</span></li>
                <li><strong>Real</strong><span>rules engine</span></li>
            </ul>
        </div>
        <div class="hm-hero-board">
            <div class="hm-boardframe">
                <div class="hm-boardtop">
                    <span class="hm-boardtag">${tileIcon('board')}Italian Game</span>
                    <span class="hm-tomove-wrap"><span class="hm-tomove-dot" aria-hidden="true"></span><span id="hm-tomove">White to move</span></span>
                </div>
                <div class="hm-board" id="hm-board" role="group" aria-label="Interactive chessboard: Italian Game, your move for both sides"></div>
                <div class="hm-boardfoot">
                    <span id="hm-count">Move 3</span>
                    <span id="hm-mat">Material level</span>
                    <button class="linklike" id="hm-reset" type="button">Reset position</button>
                </div>
            </div>
            <p class="hm-boardcap">A live board, not a picture — play either side.</p>
        </div>
    </section>

    <section class="hm-actions hm-reveal" aria-label="Choose your next move">
        <div class="hm-sechead">
            <p class="hm-kicker">Make a move</p>
            <h3>Choose your next move</h3>
        </div>
        <div class="hm-feature" id="hm-continue"></div>
        <div class="hm-tiles">
            <button class="hm-tile" id="hm-tile-online" type="button"><span class="hm-tile-ic" aria-hidden="true">${tileIcon('board')}</span><span class="hm-tile-tx"><strong>Play online</strong><em>Challenge a friend with a share code.</em></span><span class="hm-tile-go" aria-hidden="true">${CHEV}</span></button>
            <button class="hm-tile" id="hm-tile-study" type="button"><span class="hm-tile-ic" aria-hidden="true">${tileIcon('book')}</span><span class="hm-tile-tx"><strong>Open Study</strong><em>Analyze positions with Stockfish.</em></span><span class="hm-tile-go" aria-hidden="true">${CHEV}</span></button>
            <button class="hm-tile" id="start-levels-btn" type="button"><span class="hm-tile-ic" aria-hidden="true">${tileIcon('star')}</span><span class="hm-tile-tx"><strong>Interactive levels</strong><em>36 puzzles across six stages.</em></span><span class="hm-tile-go" aria-hidden="true">${CHEV}</span></button>
        </div>
    </section>

    <section class="hm-progress hm-reveal" aria-label="Your learning progress">
        <div class="hm-prog-left">
            <p class="hm-kicker">Your journey</p>
            <p class="hm-bignum"><span id="hm-prog-num">0</span><span class="hm-of">/ 10 lessons</span></p>
            <div class="hm-track" role="progressbar" aria-label="Course completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="hm-prog-bar"><span id="hm-prog-fill"></span></div>
            <p class="hm-mile" id="hm-mile"></p>
            <div class="hm-dots" id="hm-dots" role="group" aria-label="Lesson mastery map: one square per lesson"></div>
        </div>
        <div class="hm-prog-right" id="hm-next"></div>
    </section>

    <section class="hm-teachers hm-reveal" aria-label="Meet your teachers">
        <div class="hm-sechead">
            <p class="hm-kicker">The faculty</p>
            <h3>Meet your teachers</h3>
        </div>
        <div class="hm-teachgrid"><div class="hm-teach-feat" id="hm-teach-feat"></div><div class="hm-teach-list" id="hm-teach-list"></div></div>
    </section>`;
    // Static wiring (destinations are existing features).
    $('#hm-play').addEventListener('click', () => {
        if (!app()) return;
        if (app().isOpen(10)) app().openLesson(10);
        else app().showLessons();
    });
    $('#hm-reset').addEventListener('click', () => { heroReset(); });
    $('#hm-tile-online').addEventListener('click', () => app() && app().showOnline());
    $('#hm-tile-study').addEventListener('click', () => app() && app().showStudy());
    const lv = $('#start-levels-btn');
    if (lv) lv.addEventListener('click', () => document.getElementById('nav-learn')?.click());
    // One delegated opener for all home lesson buttons (data-hm-lesson).
    wrap.addEventListener('click', (e) => {
        const b = e.target.closest ? e.target.closest('[data-hm-lesson]') : null;
        if (!b || !app()) return;
        const id = parseInt(b.dataset.hmLesson, 10);
        if (!Number.isNaN(id)) app().openLesson(id);
    });
    heroInit();
    revealInit();
}

/* ── section reveal: one observer, opacity+translate only, reduced-motion safe ── */
function revealInit() {
    const secs = document.querySelectorAll('#hm-wrap .hm-reveal');
    if (!secs.length) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
        secs.forEach(s => s.classList.add('hm-revealed'));
        return;
    }
    const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (en.isIntersecting) {
                en.target.classList.add('hm-revealed');
                io.unobserve(en.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    secs.forEach(s => io.observe(s));
}

/* ── progress-driven regions (real state only) ── */
function lessonRange(tid) {
    if (!app()) return '';
    const ids = app().lessons.filter(l => l.teacherId === tid).map(l => l.id);
    if (!ids.length) return '';
    return ids.length === 1 ? `Lesson ${ids[0]}` : `Lessons ${Math.min(...ids)}–${Math.max(...ids)}`;
}
function specialty(title) {
    const t = String(title || '').toLowerCase();
    if (t.includes('strateg')) return 'Strategy';
    if (t.includes('tactic')) return 'Tactics';
    if (t.includes('histor')) return 'History';
    return 'Chess';
}
// Home-only portrait: optimized 560px cards cut from the full-res
// teacher{n}-hd.png sources (shared app.js img stays untouched for
// lessons/progress pages).
function teachImg(t) {
    return `assets/teacher${t.id}-card.jpg?${assetV()}`;
}
function milestone(n) {
    if (n >= 10) return 'Course complete — you learned every piece and rule.';
    if (n >= 7) return 'Endgame of the course: promotion and the full game await.';
    if (n >= 5) return 'Halfway there — the pieces are yours; now their power.';
    if (n >= 3) return 'Foundations set — the minor pieces are warming up.';
    if (n >= 1) return 'First moves played — momentum is everything.';
    return 'Ten lessons stand between you and your first real game.';
}
function refresh() {
    if (!app() || !document.getElementById('hm-wrap')) return;
    const a = app();
    const done = a.progress.done.length, total = a.lessons.length;
    const pct = Math.round((done / total) * 100);
    const cur = a._currentLesson();
    // Hero secondary CTA (keeps the exact fresh text the test suite clicks).
    const heroBtn = document.getElementById('start-learning-btn');
    if (heroBtn) {
        heroBtn.textContent = done === 0 ? 'Start Learning →' : (!cur ? 'Play Again →' : `Continue Lesson ${cur.id} →`);
    }
    // Real-data next line under the CTAs (never invented).
    const nl = document.getElementById('hm-nextline');
    if (nl) nl.textContent = cur ? `Up next · Lesson ${cur.id} — ${cur.title}` : (done >= total ? 'Course complete — the board is yours.' : '');
    // Featured continue panel. Buttons use data-hm-lesson (not the shared
    // data-open-lesson) so page-scoped test/automation selectors keep
    // resolving to the Lessons grid first.
    const feat = document.getElementById('hm-continue');
    if (feat) {
        if (!cur) {
            feat.innerHTML = `<div class="hm-feat-tx"><p class="hm-feat-k">Course complete</p><h4>Replay the full game, take it online, or open the Study.</h4></div>
                <span class="hm-feat-btns"><button class="btn-primary" data-hm-lesson="10" type="button">Play again</button>
                <button class="btn-secondary" data-hm-goto="online" type="button">Play online</button></span>`;
        } else if (done === 0) {
            feat.innerHTML = `<div class="hm-feat-tx"><p class="hm-feat-k">Start here</p><h4>Lesson 1 — ${esc(a.lessons[0].title)}</h4><p>${esc(a.lessons[0].objective || '')}</p></div>
                <button class="btn-primary" data-hm-lesson="1" type="button">Start Learning</button>`;
        } else {
            feat.innerHTML = `<div class="hm-feat-tx"><p class="hm-feat-k">Continue · Lesson ${cur.id} of ${total}</p><h4>${esc(cur.title)}</h4><p>${esc(cur.objective || '')}</p></div>
                <button class="btn-primary" data-hm-lesson="${cur.id}" type="button">Continue →</button>`;
        }
        feat.querySelectorAll('[data-hm-goto="online"]').forEach(b => b.addEventListener('click', () => app().showOnline()));
    }
    // Progress story.
    const num = document.getElementById('hm-prog-num');
    if (num) num.textContent = String(done);
    const fill = document.getElementById('hm-prog-fill');
    if (fill) fill.style.width = pct + '%';
    const bar = document.getElementById('hm-prog-bar');
    if (bar) { bar.setAttribute('aria-valuenow', String(pct)); }
    const mile = document.getElementById('hm-mile');
    if (mile) mile.textContent = milestone(done);
    // Mastery map: ten mini squares, one per lesson — done / current / locked.
    const dots = document.getElementById('hm-dots');
    if (dots) {
        dots.innerHTML = a.lessons.map((l) => {
            const isOpen = a.isDone(l.id) || l.id === 1 || a.isDone(l.id - 1);
            const isDone = a.isDone(l.id);
            const isCur = cur && cur.id === l.id;
            const state = isDone ? 'done' : (isCur ? 'current' : 'locked');
            const label = `Lesson ${l.id}, ${l.title} — ${isDone ? 'completed' : (isCur ? 'current — continue here' : 'locked')}`;
            if (isOpen) return `<button class="hm-dot ${state}" type="button" data-hm-lesson="${l.id}" aria-label="${esc(label)}" title="${esc(label)}">${l.id}</button>`;
            return `<span class="hm-dot ${state}" aria-disabled="true" aria-label="${esc(label)}">${l.id}</span>`;
        }).join('');
    }
    const next = document.getElementById('hm-next');
    if (next) {
        if (!cur) {
            next.innerHTML = `<p class="hm-next-k">What now?</p><h4>Every lesson done.</h4><p>Test yourself against the computer, challenge a friend, or analyze in Study.</p>
                <span class="hm-next-btns"><button class="btn-primary" data-hm-lesson="10" type="button">Full game</button>
                <button class="btn-secondary" data-hm-goto="study" type="button">Open Study</button></span>
                <button class="linklike" data-hm-goto="progress" type="button">View full progress →</button>`;
        } else {
            next.innerHTML = `<p class="hm-next-k">Pick up where you left off</p><h4>Lesson ${cur.id} — ${esc(cur.title)}</h4><p>${esc(cur.objective || '')}</p>
                <button class="btn-primary" data-hm-lesson="${cur.id}" type="button">${done === 0 ? 'Start →' : 'Continue →'}</button>
                <button class="linklike" data-hm-goto="progress" type="button">View full progress →</button>`;
        }
        next.querySelectorAll('[data-hm-goto]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.hmGoto;
            if (k === 'progress') app().showProgress();
            else if (k === 'study') app().showStudy();
            else if (k === 'online') app().showOnline();
        }));
    }
    // Teachers: feature the current lesson's teacher, list the rest.
    const featT = document.getElementById('hm-teach-feat');
    const listT = document.getElementById('hm-teach-list');
    if (featT && listT && a.teachers) {
        const mine = cur ? a.teachers.find(t => t.id === cur.teacherId) : null;
        const head = mine || a.teachers[0];
        const rest = a.teachers.filter(t => t !== head);
        featT.innerHTML = `<div class="hm-teach-photo"><img src="${teachImg(head)}" width="176" height="132" loading="lazy" decoding="async" alt="${esc(head.name)}"></div>
            <div class="hm-teach-tx"><p class="hm-feat-k">${mine ? 'Your current coach' : 'Head coach'}</p><h4>${esc(head.name)}</h4>
            <p class="hm-teach-role">${esc(head.title)} · ${esc(lessonRange(head.id))}</p><p>${esc(head.desc)}</p>
            <span class="hm-teach-tags"><span class="hm-teach-tag">${specialty(head.title)}</span><button class="btn-secondary sm" data-hm-goto="lessons" type="button">Browse lessons</button></span></div>`;
        listT.innerHTML = rest.map(t => `<div class="hm-teach-row"><img src="${teachImg(t)}" width="64" height="48" loading="lazy" decoding="async" alt="${esc(t.name)}">
            <div><h4>${esc(t.name)}</h4><p class="hm-teach-role">${esc(t.title)} · ${esc(lessonRange(t.id))}</p><p>${esc(t.desc)}</p></div>
            <span class="hm-teach-tag">${specialty(t.title)}</span></div>`).join('');
        featT.querySelectorAll('[data-hm-goto="lessons"]').forEach(b => b.addEventListener('click', () => app().showLessons()));
    }
}

/* ── interactive hero board: Italian Game sandbox, real rules ── */
const H = { chess: null, sel: null, rover: 'e2', last: null, over: '' };
function assetV() {
    try { if (window.ChessCourseApp && ChessCourseApp.assetV) return ChessCourseApp.assetV(); } catch (_) {}
    return 'v24';
}
function heroReset() {
    try {
        H.chess = new Chess();
        START_MOVES.forEach(u => H.chess.move({ from: u.slice(0, 2), to: u.slice(2, 4) }));
    } catch (_) {
        try { H.chess = new Chess(); } catch (_) { H.chess = null; }
    }
    H.sel = null; H.last = START_MOVES.length ? { from: 'f1', to: 'c4' } : null; H.over = '';
    // Keyboard rover must start on an actual piece of the side to move
    // (after the Italian moves it's Black to move and e2/e7 are wrong).
    H.rover = firstPieceSquare() || 'e2';
    heroPaint();
}
function firstPieceSquare() {
    if (!H.chess) return null;
    const turn = H.chess.turn();
    try {
        const b = H.chess.board();
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const sq = b[r][c];
            if (sq && sq.color === turn) return 'abcdefgh'[c] + String(8 - r);
        }
    } catch (_) {}
    return null;
}
function heroInit() {
    if (H.chess) return;
    heroReset();
}
function sqName(piece) {
    if (!piece) return 'empty';
    const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
    return (piece.color === 'w' ? 'white ' : 'black ') + (names[piece.type] || 'piece');
}
function heroPaint() {
    const board = document.getElementById('hm-board');
    if (!board || !H.chess) return;
    const turn = H.chess.turn();
    board.innerHTML = '';
    H.chess.board().forEach((row, r) => row.forEach((sq, c) => {
        const alg = 'abcdefgh'[c] + String(8 - r);
        const d = document.createElement('div');
        d.className = 'chess-square ' + (((r + c) % 2 === 0) ? 'white' : 'black');
        // data-hm-square (not data-square): shared board tests use unscoped
        // `.chess-square[data-square]` selectors that must resolve to the
        // lesson/online/study boards, never the hidden home hero.
        d.dataset.hmSquare = alg;
        d.setAttribute('role', 'button');
        d.setAttribute('tabindex', (H.sel && H.sel[0] === r && H.sel[1] === c) || (!H.sel && alg === H.rover) ? '0' : '-1');
        d.setAttribute('aria-label', `${alg}, ${sqName(sq)}`);
        if (H.last && (alg === H.last.from || alg === H.last.to)) d.classList.add('last-move');
        if (H.sel && H.sel[0] === r && H.sel[1] === c) d.classList.add('selected');
        if (sq) {
            const P = sq.color === 'w' ? sq.type.toUpperCase() : sq.type;
            const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
            const white = sq.color === 'w';
            d.innerHTML = `<img src="assets/pieces/${white ? 'white' : 'black'}-${names[sq.type]}.svg?${assetV()}" class="chess-piece" alt="" width="45" height="45" draggable="false" data-fallback-piece="${P}">`;
        }
        if (H.sel) {
            const from = 'abcdefgh'[H.sel[1]] + String(8 - H.sel[0]);
            try {
                if (H.chess.moves({ square: from, verbose: true }).some(m => m.to === alg)) {
                    const dot = document.createElement('div');
                    dot.className = sq ? 'legal-ring' : 'legal-dot';
                    dot.setAttribute('aria-hidden', 'true');
                    d.appendChild(dot);
                }
            } catch (_) {}
        }
        if (r === 7) { const f = document.createElement('span'); f.className = 'coord-file'; f.textContent = 'abcdefgh'[c]; d.appendChild(f); }
        if (c === 0) { const rk = document.createElement('span'); rk.className = 'coord-rank'; rk.textContent = String(8 - r); d.appendChild(rk); }
        d.addEventListener('click', () => heroActivate(alg));
        d.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); heroActivate(alg); return; }
            const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
            const dv = dirs[e.key];
            if (!dv) return;
            e.preventDefault();
            const nr = Math.min(7, Math.max(0, r + dv[0]));
            const nc = Math.min(7, Math.max(0, c + dv[1]));
            H.sel = null; // navigating away drops any active selection
            H.rover = 'abcdefgh'[nc] + String(8 - nr);
            heroPaint();
            const el2 = board.querySelector(`[data-hm-square="${H.rover}"]`);
            if (el2) el2.focus({ preventScroll: true });
        });
        board.appendChild(d);
    }));
    // Status line: side to move, move number, material — all computed.
    const to = document.getElementById('hm-tomove');
    const mat = document.getElementById('hm-mat');
    const cnt = document.getElementById('hm-count');
    const plies = H.chess.history().length;
    if (H.over) { if (to) to.textContent = H.over; }
    else if (to) to.textContent = (turn === 'w' ? 'White' : 'Black') + ' to move';
    if (cnt) {
        let lastSan = '';
        try {
            const hist = H.chess.history({ verbose: true });
            if (hist.length) lastSan = hist[hist.length - 1].san;
        } catch (_) {}
        cnt.textContent = `Move ${Math.floor(plies / 2) + 1}` + (lastSan ? ` · ${lastSan}` : '');
    }
    if (mat) {
        const vals = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        let w = 0, b = 0;
        try {
            H.chess.board().forEach(row => row.forEach(sq => {
                if (!sq || sq.type === 'k') return;
                if (sq.color === 'w') w += vals[sq.type] || 0; else b += vals[sq.type] || 0;
            }));
        } catch (_) {}
        mat.textContent = w === b ? 'Material level' : (w > b ? `White up ${w - b}` : `Black up ${b - w}`);
    }
}
function heroActivate(alg) {
    if (!H.chess || H.over) return;
    const turn = H.chess.turn();
    const sq = H.chess.get(alg);
    if (H.sel) {
        const from = 'abcdefgh'[H.sel[1]] + String(8 - H.sel[0]);
        if (from === alg) { H.sel = null; H.rover = alg; heroPaint(); return; }
        let opts = [];
        try { opts = H.chess.moves({ square: from, verbose: true }).filter(m => m.to === alg); } catch (_) {}
        if (opts.length) {
            // Sandbox promotion resolves to queen (noted in code; always legal).
            const m = H.chess.move({ from, to: alg, promotion: opts[0].promotion ? 'q' : undefined });
            if (m) {
                H.last = { from, to: alg }; H.rover = alg; H.sel = null;
                try {
                    if (H.chess.in_checkmate()) H.over = `Checkmate — ${(turn === 'w' ? 'White' : 'Black')} wins. Reset to play again.`;
                    else if (H.chess.in_stalemate()) H.over = 'Stalemate — drawn. Reset to play again.';
                    else if (H.chess.in_draw()) H.over = 'Drawn position. Reset to play again.';
                } catch (_) {}
                heroPaint();
                return;
            }
        }
    }
    if (sq && sq.color === turn) { H.sel = [8 - parseInt(alg[1], 10), 'abcdefgh'.indexOf(alg[0])]; H.rover = alg; }
    else H.sel = null;
    heroPaint();
    const el = document.querySelector(`#hm-board [data-hm-square="${CSS.escape(alg)}"]`);
    if (el) el.focus({ preventScroll: true });
}

/* ── public surface (wired from app.js) ── */
function render() { shell(); refresh(); heroPaint(); }
window.DoChessHome = { render, refresh, version: '2.1.0' };
// Self-init for whichever script order wins: if the home screen is already
// active when this file evaluates (app.js constructed first), render now;
// otherwise app.js _renderHome picks it up at boot.
try {
    if (document.getElementById('home-screen')?.classList.contains('active') && window.app && window.app.lessons) render();
} catch (_) {}
})();
