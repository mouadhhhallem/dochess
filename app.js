/**
 * app.js — Chess Course Application  (fully fixed, no errors)
 *
 * ✓ Classic piece SVGs
 * ✓ Computer auto-plays after every player move (all lessons)
 * ✓ Promotion picker for player; auto-queen for computer
 * ✓ Lesson 10 = unlimited free game
 * ✓ Board locked after exercise done (lessons 1-9)
 * ✓ Check / checkmate / stalemate detection & display
 * ✓ Confetti on success (fixed const-reassignment bug)
 * ✓ Move log, speech bubble, turn indicators
 * ✓ Sound effects
 */

/* ── HTML escaping (Phase 1 security): every non-constant value placed
   into a template string goes through esc(). Peer data is additionally
   cleaned once at receipt (sanitizePeerUser in online.js). ── */
function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Tiny sound engine using Web Audio API ── */
class SoundEngine {
    constructor() {
        try { this.muted = localStorage.getItem('cc_mute') === '1'; } catch (_) { this.muted = false; }
    }
    toggleMute() {
        this.muted = !this.muted;
        try { localStorage.setItem('cc_mute', this.muted ? '1' : '0'); } catch (_) {}
        return this.muted;
    }
    _ctx() {
        if (!this._audioCtx) {
            const C = window.AudioContext || window.webkitAudioContext;
            if (C) this._audioCtx = new C();
        }
        if (this._audioCtx && this._audioCtx.state === 'suspended') this._audioCtx.resume();
        return this._audioCtx || null;
    }
    // Idle warmup: preload the move clip and create the (suspended)
    // AudioContext early. Autoplay policy keeps it suspended until a real
    // gesture; _ctx() resumes it then. Never plays here — no sound on load.
    warm() {
        try { this._clip(); } catch (_) {}
        try {
            if (!this._audioCtx) {
                const C = window.AudioContext || window.webkitAudioContext;
                if (C) this._audioCtx = new C();
            }
        } catch (_) {}
    }
    _beep(type, freqStart, freqEnd, dur, gain, delay = 0) {
        if (this.muted) return;
        const ctx = this._ctx(); if (!ctx) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        const start = ctx.currentTime + delay;
        o.frequency.setValueAtTime(freqStart, start);
        o.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(start); o.stop(start + dur);
    }
    // Real move recording (assets/sounds/move.mp3) — played on every move;
    // the classic beeps remain as the fallback if the clip cannot load.
    _clip() {
        if (this._clipBroken) return null;
        if (!this._clipEl) {
            try {
                const a = new Audio(`assets/sounds/move.mp3?v=${ChessCourseApp.APP_VERSION}`);
                a.preload = 'auto';
                a.addEventListener('error', () => { this._clipBroken = true; });
                this._clipEl = a;
            } catch (_) { this._clipBroken = true; }
        }
        return this._clipBroken ? null : this._clipEl;
    }
    _playClip() {
        if (this.muted) return false;
        const a = this._clip();
        if (!a) return false;
        try { a.currentTime = 0; } catch (_) {}
        try { const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (_) { return false; }
        return true;
    }
    playMove() {
        if (this._playClip()) return;
        this._beep('sine', 460, 240, 0.09, 0.085);
        this._beep('triangle', 220, 160, 0.06, 0.05, 0.03);
    }
    playCapture() {
        if (this._playClip()) return;
        this._beep('sine', 210, 110, 0.11, 0.10);
        this._beep('triangle', 140, 72, 0.08, 0.07, 0.02);
    }
    playCheck() {
        this._beep('triangle', 680, 420, 0.12, 0.09);
        this._beep('sine', 920, 640, 0.10, 0.05, 0.03);
    }
    playSuccess() {
        if (this.muted) return;
        const ctx = this._ctx(); if (!ctx) return;
        [523, 659, 784, 988].forEach((f, i) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            const t = ctx.currentTime + i * 0.12;
            o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.33);
            o.connect(g); g.connect(ctx.destination);
            o.start(t); o.stop(t + 0.34);
        });
    }
}

/* ── Main App ── */
class ChessCourseApp {
    constructor() {
        this.game             = new ChessGame();
        this.snd              = new SoundEngine();
        this.lessons          = this._buildLessons();
        this._validateLessons(this.lessons);
        this.teachers         = this._buildTeachers();
        this.theme            = 'night';
        this._themeBusy       = false;
        this.userId           = null;
        this._clerk           = null;
        this.online           = null; // active/lobby online session (see online.js)
        this._onlineTick      = null;
        this.currentLesson    = null;
        this.currentExercise  = null;
        this.exerciseDone     = false;   // locks board after correct move (non-free lessons)
        this.isFreeGame       = false;   // lesson 10
        this.cpuBusy          = false;   // prevents double-clicks while computer thinks
        this._cpuDifficulty   = 'easy';   // lesson-10 selector: easy (depth 2, blunders) or medium (depth 3)
        this.progress         = this._loadProgress();
        this._boot();
    }

    /* ══════════════════════════════════════════════════════════════
       BOOT
    ══════════════════════════════════════════════════════════════ */
    _boot() {
        window.showHome     = () => this.showHome();
        window.showLessons  = () => this.showLessons();
        window.showProgress = () => this.showProgress();
        window.showLesson   = () => this.showLesson();
        window.showOnline   = () => this.showOnline();
        window.showProfile  = () => this.showProfile();
        window.showStudy    = () => this.showStudy();
        window.toggleTheme  = (el) => this.toggleTheme(el);
        window.app          = this;
        this._applyTheme(this._resolveTheme(), false);
        this._initAuth();
        this._bindMenu();
        this._bindImgFallback();
        window.addEventListener('beforeunload', () => this._flushStudyTime());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this._flushStudyTime(); else this._studySince = Date.now(); });
        this._renderHome();
        this._bindNav();
        this._bindGlobalButtons();
        this._syncProgress();
        this._preloadPieces();
    }

    /* ── Piece preload: decode the 12 SVGs once at boot (idle) so the
       first _draw() never pays image-decode cost mid-interaction. Also warms
       the move sound (element + suspended AudioContext) so the first move
       doesn't pay audio-setup cost inside the interaction handler. ── */
    _preloadPieces() {
        const run = () => {
            ['K','Q','R','B','N','P','k','q','r','b','n','p'].forEach(p => {
                try {
                    const img = new Image();
                    img.decoding = 'async';
                    img.src = this._pieceFile(p);
                } catch (_) {}
            });
            try { this.snd.warm(); } catch (_) {}
        };
        try {
            if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
            else setTimeout(run, 800);
        } catch (_) {}
    }

    /* ── Accessible square names: "e4, white pawn" / "e4, empty" / check suffix.
       Screen-reader users get piece + state, not just coordinates. ── */
    _squareLabel(alg, piece, isCheckSquare) {
        let base = alg;
        if (piece) {
            const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
            const white = piece === piece.toUpperCase();
            base = `${alg}, ${white ? 'white' : 'black'} ${names[piece.toLowerCase()] || 'piece'}`;
        } else {
            base = `${alg}, empty`;
        }
        return isCheckSquare ? `${base}, check` : base;
    }

    // Redundant (non-inline) bindings so every button works even if
    // inline onclick attributes are blocked or the event target differs.
    _bindGlobalButtons() {
        const start = document.getElementById('start-learning-btn');
        if (start && !start.dataset.bound) {
            start.dataset.bound = '1';
            start.addEventListener('click', () => {
                // Home secondary CTA: fresh → lessons grid; returning →
                // straight into the up-next lesson; graduates → full game.
                const cur = this._currentLesson();
                if (!cur) { this.openLesson(10); return; }
                if (this.progress.done.length === 0) this.showLessons();
                else this.openLesson(cur.id);
            });
        }
        // Delegated handler for dynamically rendered lesson buttons
        // and any element with [data-open-lesson].
        if (!document.body.dataset.lessonDelegate) {
            document.body.dataset.lessonDelegate = '1';
            document.body.addEventListener('click', (e) => {
                const opener = e.target.closest('[data-open-lesson]');
                if (opener) {
                    const id = parseInt(opener.dataset.openLesson, 10);
                    if (!Number.isNaN(id)) this.openLesson(id);
                    return;
                }
                const action = e.target.closest('[data-action]');
                if (!action) return;
                const a = action.dataset.action;
                if (a === 'reset-board') this.resetBoard();
                else if (a === 'mark-complete') this.markComplete();
                else if (a === 'back-lessons') this.showLessons();
                else if (a === 'online-host') this._onlineHost();
                else if (a === 'online-host-code') this._onlineHost(action.dataset.code);
                else if (a === 'online-join') this._onlineJoin();
                else if (a === 'online-join-code') this._onlineJoin(action.dataset.code, true);
                else if (a === 'online-leave') this._onlineLeave();
                else if (a === 'online-resign-ask') this._onlineResignAsk();
                else if (a === 'online-leave-ask') this._onlineLeaveAsk();
                else if (a === 'online-rematch') this._onlineRematch();
                else if (a === 'online-review') this._onlineReview();
                else if (a === 'mute') this.toggleMute();
                else if (a === 'flip-board') this._flipLessonBoard();
                else if (a === 'flip-online') this._flipOnlineBoard();
                else if (a === 'gameover-hide') { document.getElementById('gameover-card').style.display = 'none'; }
                else if (a === 'online-draw-offer') this._onlineDrawOffer();
                else if (a === 'movenav') this._onlineNavGo(action.dataset.where);
                else if (a === 'next-lesson') this._nextLessonFromBoard();
                else if (a === 'profile-signin') this._profileSignIn();
                else if (a === 'manage-account') this.openUserProfile();
                else if (a === 'logout') this.signOut();
                else if (a === 'goto-online') this.showOnline();
                else if (a === 'hist-more') this._histPage(10);
                else if (a === 'hist-less') this._histPage(-10);
                else if (a === 'hist-open') this._histOpen(action.dataset.game);
                else if (a === 'hist-close') this._histClose();
                else if (a === 'hist-nav') this._histNav(action.dataset.where);
                else if (a === 'hist-goto') this._histGoto(parseInt(action.dataset.ply, 10));
                else if (a === 'hist-to-study') { if (window.DoChessStudy) window.DoChessStudy.importGame(action.dataset.game); }
            });
        }
    }

    /* ══════════════════════════════════════════════════════════════
       PIECE IMAGES — custom set in assets/pieces/ (SVG, transparent)
       Files: white-king.svg … black-pawn.svg  (viewBox 0 0 45 45)
       Falls back to inline SVG if an image is missing.
    ══════════════════════════════════════════════════════════════ */
    // Bump ASSET_V every release so edited artwork can never hide
    // behind the browser image cache. Same rule as the ?v= tags.
    static assetV() { return 'v24'; }
    // App release tag (?v= on scripts). Sent on identity messages so two
    // sides on different releases warn instead of silently misbehaving.
    static APP_VERSION = 'v39';
    _pieceFile(piece) {
        const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
        const white = piece === piece.toUpperCase();
        const kind = names[piece.toLowerCase()] || 'pawn';
        return `assets/pieces/${white ? 'white' : 'black'}-${kind}.svg?${ChessCourseApp.assetV()}`;
    }
    _svg(piece) {
        const white = piece === piece.toUpperCase();
        const src = this._pieceFile(piece);
        const label = `${white ? 'White' : 'Black'} ${src.split('-').pop().split('.')[0]}`;
        return `<img src="${src}" class="chess-piece ${white ? 'white' : 'black'}" alt="${label}" width="45" height="45"
            decoding="async" draggable="false" data-fallback-piece="${piece}">`;
    }
    // CSP-safe image fallback: one capture-phase listener swaps any broken
    // piece image for inline SVG (inline onerror= attributes are banned).
    _bindImgFallback() {
        if (document.body.dataset.imgFallback) return;
        document.body.dataset.imgFallback = '1';
        document.addEventListener('error', (e) => {
            const img = e.target;
            if (img && img.tagName === 'IMG' && img.dataset.fallbackPiece && !img.dataset.fbkDone) {
                img.dataset.fbkDone = '1';
                const tmp = document.createElement('div');
                tmp.innerHTML = this._svgFallback(img.dataset.fallbackPiece);
                img.replaceWith(tmp.firstChild);
            }
        }, true);
    }
    // Minimal inline fallback (used only if an image file is missing)
    _svgFallback(piece) {
        const white = piece === piece.toUpperCase();
        const t = piece.toLowerCase();
        const glyph = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }[t] || '♟';
        const color = white ? '#fff' : '#000';
        const stroke = white ? '#000' : '#fff';
        return `<svg viewBox="0 0 45 45" class="chess-piece ${white ? 'white' : 'black'}"><text x="22.5" y="34" text-anchor="middle" font-size="32" fill="${color}" stroke="${stroke}" stroke-width="1">${glyph}</text></svg>`;
    }

    getPieceSVG(p) { return this._svg(p); }

    // Small drawn stat icons, one consistent 24px stroke set.
    // Profile-only additions (check/sliders/bolt/cal/flag/up/down/lock/play/star)
    // follow the same stroke language so the dossier reads as one system.
    _tileIcon(name) {
        const paths = {
            book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/>',
            layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
            target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
            clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
            board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
            trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5M12 14v4M8 21h8"/>',
            medal: '<circle cx="12" cy="14" r="5"/><path d="M9 9L6 3h4l2 4 2-4h4l-3 6"/>',
            list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
            check: '<path d="M4 12.5l5 5L20 6.5"/>',
            sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
            bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>',
            cal: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10.5h16M8.5 3v5M15.5 3v5"/>',
            flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
            up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
            down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
            lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
            play: '<path d="M7 4l13 8-13 8z"/>',
            star: '<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2-5.6 3.2 1.3-6.2L3 9.5l6.3-.7z"/>'
        };
        return `<span class="stat-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.target}</svg></span>`;
    }

    /* ══════════════════════════════════════════════════════════════
       DATA
    ══════════════════════════════════════════════════════════════ */
    _buildTeachers() {
        // Lightweight 192px PNG exports of the full portraits in
        // teacher{1,2,3}.svg (kept as sources). ~40-60KB, not megabytes.
        const v = ChessCourseApp.assetV();
        return [
            { id:1, name:'Grandmaster Elena', title:'Chess Master & Strategist',  desc:'A calm and patient grandmaster who teaches the fundamentals with wisdom and precision.',         img:`assets/teacher1-192.png?${v}` },
            { id:2, name:'Coach Marcus',      title:'Tactical Specialist',         desc:'An energetic coach who focuses on tactics, patterns, and aggressive play.',                     img:`assets/teacher2-192.png?${v}` },
            { id:3, name:'Professor Aris',    title:'Historical Chess Expert',     desc:'A scholarly teacher who brings chess history to life while teaching essential concepts.',       img:`assets/teacher3-192.png?${v}` }
        ];
    }

    _buildLessons() {
        return [
            { id:1,  teacherId:1, title:'Meet the Chessboard',      type:'exercise',
              objective:'Learn the 8x8 grid, files and ranks.',
              desc:'The chessboard is an 8x8 grid. Vertical columns are called <em>files</em> (a-h) and horizontal rows are called <em>ranks</em> (1-8). The bottom-right square is always light.',
              exercise:{ instr:'Push any white pawn forward. Two squares on its first move — e2 to e4 is the classic!', freePiece:'p', fb:'Wonderful! Pawns control the center — the golden principle of chess openings.' },
              fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },

            { id:2,  teacherId:1, title:'Pawn Movement & Captures',  type:'exercise',
              objective:'Pawns push one or two squares, then capture diagonally.',
              desc:'Pawns march <em>straight ahead</em> one square — or <em>two squares</em> on their very first move. They <em>capture</em> one square diagonally, never straight ahead. This lesson has two steps on one board: first push, then take!',
              exercise:{ steps:[
                { instr:'Push the e-pawn one square, or two since it has not moved. E2 to e4 grabs space!', from:'e2', fb:'Good push! A pawn may march one square — or two on its very first move.' },
                { instr:'Now capture! Pawns take one square diagonally. Grab a black pawn!', freeCapture:true, fb:'Brilliant! That diagonal strike is how pawns fight.' }
              ] },
              fen:'4k3/8/8/3p4/3p4/8/4P3/4K3 w - - 0 1' },

            { id:3,  teacherId:1, title:"The Rook's Power",           type:'exercise',
              objective:'Rooks move horizontally or vertically.',
              desc:'The Rook moves any number of empty squares horizontally or vertically. It is most powerful on <em>open files</em> with no pawns blocking the way.',
              exercise:{ instr:'Move the white rook along any straight line. Sliding a1 to a4 is a great start!', freePiece:'r', fb:'Excellent! The rook dominates every open line it reaches.' },
              fen:'3k4/8/8/8/8/8/8/R3K3 w - - 0 1' },

            { id:4,  teacherId:1, title:"The Bishop's Diagonal",      type:'exercise',
              objective:'Bishops glide diagonally.',
              desc:'Bishops move diagonally any number of empty squares. Each bishop stays on its starting color forever. Use them to control long diagonals across the board.',
              exercise:{ instr:'Slide the white bishop along any diagonal. Sweeping c1 to f4 shows its power!', freePiece:'b', fb:'Fantastic! The bishop sweeps across the diagonal.' },
              fen:'b3k3/8/8/8/8/8/8/2B1K3 w - - 0 1' },

            { id:5,  teacherId:1, title:"The Knight's L-Shape",       type:'exercise',
              objective:'The knight jumps in an L-shape.',
              desc:'Knights move in an <em>L-shape</em>: two squares in one direction, then one square perpendicular. They are the only pieces that <em>jump over</em> other pieces.',
              exercise:{ instr:'Jump the white knight in any L-shape. Hopping g1 to f3 develops toward the center!', freePiece:'n', fb:"Outstanding! The knight's L-jump is completely unique." },
              fen:'n3k3/8/8/8/8/8/8/4K1N1 w - - 0 1' },

            { id:6,  teacherId:2, title:"The Queen's Dominion",       type:'exercise',
              objective:'The queen is the most powerful piece.',
              desc:'The Queen combines rook and bishop — she moves any number of squares horizontally, vertically, or diagonally. She is the most powerful piece on the board. <em>Protect her!</em>',
              exercise:{ instr:'Move the white queen to any square she reaches. Sending d1 to h5 eyes the kingside!', freePiece:'q', fb:'Magnificent! The queen commands the whole board.' },
              fen:'q7/7k/8/8/8/8/8/3QK3 w - - 0 1' },

            { id:7,  teacherId:2, title:"The King's Safety",          type:'exercise',
              objective:'The king moves one square in any direction.',
              desc:'The King moves exactly <em>one square</em> in any direction. Losing your king means losing the game. Never move it into danger — protect it above all else!',
              exercise:{ instr:'Step the white king to any neighboring square. E1 to e2 keeps it safe!', freePiece:'k', fb:'Good king move! Safety first.' },
              fen:'k7/8/8/8/8/8/8/4K3 w - - 0 1' },

            { id:8,  teacherId:2, title:'Castling',                   type:'exercise',
              objective:'Castle to protect your king.',
              desc:'Castling is a special two-piece move: the king slides <em>two squares</em> toward a rook, and the rook leaps to the other side. It is the best way to keep your king safe early in the game.',
              exercise:{ instr:'Castle kingside — move your king from e1 to g1!', move:['e1','g1'], fb:'Superb! Your king is now safely castled behind the rook.' },
              fen:'k7/8/8/8/8/8/8/4K2R w K - 0 1' },

            { id:9,  teacherId:3, title:'Pawn Promotion',             type:'exercise',
              objective:'A pawn reaching the 8th rank promotes.',
              desc:'When a pawn reaches the opponent\'s back rank (rank 8 for White) it <em>promotes</em> — you choose a queen, rook, bishop, or knight to replace it. Almost always choose the queen!',
              exercise:{ instr:'Push your pawn from a7 to a8, then choose your promotion piece!', move:['a7','a8'], fb:'Incredible! Now choose your promotion piece from the panel.' },
              fen:'7k/P7/8/8/8/8/8/4K3 w - - 0 1' },

            { id:10, teacherId:3, title:'Play a Full Game!',           type:'free-game',
              objective:'Apply everything in a real game against the computer.',
              desc:'You know all the pieces and rules — now play a <em>real game</em>! You are White, the computer plays Black. Try to checkmate the king. Control the center, develop your pieces, castle early, and attack!',
              fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }
        ];
    }

    /* ── Lesson validation (spec §25): fail loudly in dev, never silently
       break the course. Checks id/title/teacher/difficulty-ish/type/fen. ── */
    _validateLessons(lessons) {
        const issues = [];
        const ids = new Set();
        (lessons || []).forEach((l, i) => {
            const where = `lessons[${i}]`;
            if (!l || typeof l !== 'object') { issues.push(`${where}: not an object`); return; }
            if (!Number.isInteger(l.id)) issues.push(`${where}: missing numeric id`);
            else if (ids.has(l.id)) issues.push(`${where}: duplicate id ${l.id}`);
            else ids.add(l.id);
            if (!l.title) issues.push(`lesson ${l.id}: missing title`);
            if (!l.teacherId) issues.push(`lesson ${l.id}: missing teacher`);
            if (!['exercise', 'free-game'].includes(l.type)) issues.push(`lesson ${l.id}: bad type ${l.type}`);
            if (!l.fen || typeof l.fen !== 'string' || l.fen.split(' ').length < 2) issues.push(`lesson ${l.id}: bad FEN`);
            if (l.type === 'exercise' && !l.exercise) issues.push(`lesson ${l.id}: exercise lesson without exercise`);
        });
        if (issues.length && typeof console !== 'undefined' && console.warn) {
            console.warn('[dochess] lesson validation:\n' + issues.map(s => '  - ' + s).join('\n'));
        }
        return issues;
    }

    /* First open-but-incomplete lesson = "current". Null when all done. */
    _currentLesson() {
        return this.lessons.find(l => this.isOpen(l.id) && !this.isDone(l.id)) || null;
    }

    /* ══════════════════════════════════════════════════════════════
       PROGRESS
    ══════════════════════════════════════════════════════════════ */
    // Progress is namespaced per signed-in Clerk user id; anonymous
    // learners keep the legacy shared key, untouched by sign-in.
    _progressKey() { return 'ccp_v4' + (this.userId ? '_' + this.userId : ''); }
    _loadProgress() {
        // Safe parse + shape validation: malformed / old-version data must
        // never break the course. Unknown ids are dropped, order preserved.
        try {
            const s = localStorage.getItem(this._progressKey());
            if (s) {
                const p = JSON.parse(s);
                if (p && Array.isArray(p.done)) {
                    const valid = p.done.filter(n => Number.isInteger(n) && n >= 1 && n <= 10);
                    return { done: [...new Set(valid)] };
                }
            }
            // One-time best-effort migration from legacy unversioned key.
            const legacy = localStorage.getItem('ccp_v3' + (this.userId ? '_' + this.userId : ''));
            if (legacy) {
                const p = JSON.parse(legacy);
                if (p && Array.isArray(p.done)) {
                    const valid = p.done.filter(n => Number.isInteger(n) && n >= 1 && n <= 10);
                    const migrated = { done: [...new Set(valid)] };
                    try { localStorage.setItem(this._progressKey(), JSON.stringify(migrated)); } catch (_) {}
                    return migrated;
                }
            }
        } catch (_) {}
        return { done: [] };
    }
    _saveProgress() {
        try { localStorage.setItem(this._progressKey(), JSON.stringify(this.progress)); } catch (_) {}
    }
    _setUser(userId) {
        if (this.userId === (userId || null)) return;
        this._flushStudyTime();
        this._studySince = Date.now();
        this.userId = userId || null;
        this.progress = this._loadProgress();
        this._histShown = 10; // history paging is per player
        this._studyGameId = null; this._studyPly = null; // study viewer is per player
        this._syncProgress();
        if (document.getElementById('lessons-screen')?.classList.contains('active')) this._renderLessons();
        if (document.getElementById('profile-screen')?.classList.contains('active')) this._renderProfile();
        // Auth resolving (or signing out) mid-game: repaint my own photo
        // on the You-card without re-rendering the match.
        this._paintYouCard();
        // Late sign-in during a live game: the handshake may have gone out
        // before Clerk was ready (guest name, no photo). Push the real
        // profile so the peer sees who they're playing.
        const s = this.online;
        if (this.userId && s && (s.phase === 'play' || s.phase === 'over') && s.conn) {
            try { s.net.send(s.conn, { type: 'profile', v: ChessCourseApp.APP_VERSION, user: this._meTag(), epoch: s.epoch || 0 }); } catch (_) {}
        }
    }
    isDone(id)  { return this.progress.done.includes(id); }
    isOpen(id)  { return id === 1 || this.isDone(id - 1); }
    markDone(id) {
        if (!this.isDone(id)) { this.progress.done.push(id); this._saveProgress(); }
        this._syncProgress();
    }

    _syncProgress() {
        // Keep the Continue card truthful when progress changes while home
        // is visible (markDone → _syncProgress without a re-render).
        if (document.getElementById('home-screen')?.classList.contains('active')) {
            try { this._paintContinue(); } catch (_) {}
        }
        // Progress page reads the same real state (progress.js refresh).
        if (window.DoChessProgress) { try { window.DoChessProgress.refresh(); } catch (_) {} }
    }

    /* ══════════════════════════════════════════════════════════════
       SCREENS
    ══════════════════════════════════════════════════════════════ */
    _renderHome() {
        // Home markup + dynamics live in home.js (scoped #home-screen).
        if (window.DoChessHome) window.DoChessHome.render();
        this._paintContinue();
        this._syncProgress();
    }

    /* ── Home hero CTA: real progress only, never faked. Fresh learners see
       "Start Learning" (existing test + first-run copy); returning learners
       jump straight into their up-next lesson; graduates replay the game. ── */
    _paintContinue() {
        const heroBtn = document.getElementById('start-learning-btn');
        const cur = this._currentLesson();
        if (!cur) {
            if (heroBtn) heroBtn.textContent = 'Play Again →';
        } else if (heroBtn) {
            heroBtn.textContent = this.progress.done.length === 0
                ? 'Start Learning →'
                : `Continue Lesson ${cur.id} →`;
        }
        if (window.DoChessHome) window.DoChessHome.refresh();
    }

    _renderLessons() {
        const g = document.getElementById('lessons-grid');
        if (!g) return;
        g.innerHTML = '';
        const cur = this._currentLesson();
        const hasProgress = this.progress.done.length > 0;
        this.lessons.forEach(l => {
            const open = this.isOpen(l.id), done = this.isDone(l.id);
            const isCurrent = !!(cur && cur.id === l.id);
            const badge = done
                ? '<span class="completed-badge">Done ✓</span>'
                : isCurrent && hasProgress ? '<span class="current-badge">Up next</span>'
                : open ? '<span style="color:#34d399;font-size:.8rem">Unlocked</span>'
                       : '<span style="color:var(--text-muted-dim);font-size:.8rem">Locked</span>';
            const tag = l.type === 'free-game' ? ' <span class="free-game-tag">Full Game</span>' : '';
            const card = document.createElement('div');
            card.className = `lesson-card${open ? '' : ' locked'}${isCurrent && hasProgress ? ' current' : ''}${done ? ' done' : ''}`;
            // Fresh learners see "Start" (existing test + first-run copy);
            // returning learners see "Continue" on the up-next lesson.
            const cta = done ? 'Review' : (isCurrent && hasProgress ? 'Continue' : 'Start');
            card.innerHTML = `
                <div class="lesson-header"><h3>${esc(l.title)}${tag}</h3><div class="lesson-meta"><span>Lesson ${l.id}</span>${badge}</div></div>
                <div class="lesson-body"><p>${esc(l.desc.replace(/<[^>]+>/g, ''))}</p></div>
                <div class="lesson-footer"><button class="btn-primary" style="padding:.6rem 1.4rem;font-size:.92rem" data-open-lesson="${l.id}" ${open ? '' : 'disabled'}>${cta}</button></div>`;
            g.appendChild(card);
        });
    }

    openLesson(id) {
        const l = this.lessons.find(x => x.id === id);
        if (!l || !this.isOpen(id)) return;
        this.currentLesson = l;
        this._buildLessonUI(l);
        this._go('lesson-screen');
        requestAnimationFrame(() => {
            document.getElementById('chess-board-wrapper')?.scrollIntoView({ block: 'center' });
        });
    }

    _buildLessonUI(l) {
        const t    = this.teachers.find(x => x.id === l.teacherId);
        const free = l.type === 'free-game';
        const done = this.completedLessons ? this.completedLessons.has(l.id) : false;

        const exBox = l.exercise
            ? `<div class="exercise-instructions"><h4>Exercise</h4><p id="exercise-instruction">${this._stepText(l.exercise, 0)}</p></div>`
            : `<div class="exercise-instructions free-game-box"><h4>Free Game Mode</h4><p>You are White. The computer plays Black. Play a full game — good luck!</p></div>`;

        const btn = free
            ? `<button class="btn-primary btn-glow-strong" id="complete-btn" data-action="mark-complete">Mark Complete</button>`
            : `<button class="btn-primary btn-glow-strong" id="complete-btn" data-action="mark-complete" disabled title="Finish the exercise move first">Complete Lesson</button>`;

        document.getElementById('lesson-content').innerHTML = `
            <div class="lesson-detail-header" data-focus-hide>
                <div class="lesson-title">
                    <div class="lesson-number">${l.id}</div>
                    <div><h2>${esc(l.title)}</h2><p>${esc(l.objective)}</p></div>
                </div>
                <div class="teacher-info"><img src="${t.img}" width="32" height="32" loading="lazy"
                                                alt="${esc(t.name)}"><span>${esc(t.name)}</span></div>
            </div>
            <div class="lesson-content">
                <div class="arena">
                    <div class="profile-card opponent" id="profile-opp" data-focus-hide>
                        <img class="avatar" src="${t.img}" width="52" height="52" alt="${esc(t.name)}">
                        <div class="info">
                            <span class="name">${esc(t.name)}</span>
                            <span class="sub">${esc(t.title)} (Black)</span>
                            <div class="captured-row" data-cap="opp"></div>
                        </div>
                        <div class="turn-indicator" id="ti-opp">Waiting</div>
                    </div>
                    <div class="speech-bubble" id="speech" role="status" aria-live="polite" data-focus-hide>Think carefully about your move.</div>
                    <!-- Sticky twin of the advance CTA, placed ABOVE the board. On a phone
                         the action row lands ~1100px down an 844px viewport, so
                         "next lesson" was permanently off-screen. sticky +
                         bottom:0 pins it to the viewport bottom once the board
                         arrives, and it can never cover the board. -->
                    <div class="sticky-actions" id="lesson-sticky">
                        <span class="sticky-label" id="lesson-sticky-label">Lesson ${l.id}</span>
                        <span class="sticky-count"><span id="lesson-sticky-score">0</span> moves</span>
                        <button class="btn-secondary sm" data-action="reset-board" type="button" title="Reset board"><span class="btn-icon">↺</span> Reset</button>
                        <button class="btn-secondary sm" data-action="flip-board" type="button" title="Flip board"><span class="btn-icon">⇄</span> Flip</button>
                        ${done || free
                            ? `<button class="btn-primary sm btn-glow-strong" id="complete-btn-sticky" data-action="mark-complete" type="button"><span class="btn-icon">✓</span> Complete</button>`
                            : `<button class="btn-primary sm btn-glow-strong" id="complete-btn-sticky" data-action="mark-complete" type="button" disabled title="Finish the exercise move first"><span class="btn-icon">✓</span> Complete</button>`}
                        <button class="btn-cta sm" data-action="next-lesson" id="next-lesson-sticky" type="button">Next →</button>
                        <button class="icon-btn" id="lesson-focus-toggle" data-focus-toggle type="button"
                                aria-expanded="true" aria-controls="lesson-screen"
                                aria-label="Hide everything except the board" title="Focus mode">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v18M16 3v18"/></g></svg>
                        </button>
                    </div>

                    <div id="chess-board-wrapper"><div id="chess-board" role="group" aria-label="Chess board"></div></div>
                    <div id="promotion-picker" class="promotion-picker hidden"></div>
                    <div id="lesson-feedback" class="feedback info" role="status" aria-live="polite" data-focus-hide>
                        Welcome to <strong>${esc(l.title)}</strong>! ${free ? 'You are White — make your first move!' : 'Follow the exercise above.'}
                    </div>
                    <div class="lesson-actions" data-focus-hide>
                        <button class="btn-secondary" data-action="reset-board">Reset Board</button>
                        <button class="btn-secondary" data-action="flip-board" title="Flip board" aria-label="Flip board">Flip</button>
                        ${this._muteBtnHTML()}
                        ${free ? `<label class="diff-label">Computer:
                            <select id="cpu-diff" class="diff-select" aria-label="Computer difficulty">
                                <option value="easy" selected>Easy</option>
                                <option value="medium">Medium</option>
                            </select></label>` : ''}
                        ${btn}
                        <!-- Next stage right under the board: advancing to the
                             following lesson never needs a trip back to the grid.
                             Deliberately .btn-cta, NOT .btn-primary — the primary
                             action of a lesson stays uniquely "Complete Lesson". -->
                        <button class="btn-cta" data-action="next-lesson" id="next-lesson-btn" type="button"
                                title="Jump to the next lesson">Next lesson →</button>
                    </div>
                    
                    <div class="profile-card player" id="profile-you" data-focus-hide>
                        <img class="avatar" src="${this._pieceFile('P')}" width="52" height="52" alt="You (White)" style="background:var(--primary-surface);border-radius:50%;padding:6px;">
                        <div class="info">
                            <span class="name">You</span>
                            <span class="sub">White</span>
                            <div class="captured-row" data-cap="you"></div>
                        </div>
                        <div class="turn-indicator" id="ti-you">Your turn</div>
                    </div>
                </div>
                <div class="lesson-dashboard" data-focus-hide>
                    <div class="dashboard-section">
                        <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Lecture Notes</h4>
                        <div class="lesson-explanation"><h4>Explanation</h4><p>${l.desc}</p></div>
                        ${exBox}
                    </div>
                    <div class="dashboard-section">
                        <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Move Log</h4>
                        <div class="move-log" id="move-log" role="log" aria-live="polite" aria-label="Move log"><span style="color:var(--text-muted-dim)">No moves yet — select a white piece to begin.</span></div>
                    </div>
                    <div id="gameover-card" style="display:none" role="dialog" aria-modal="false" aria-labelledby="gameover-title"></div>
                </div>
            </div>`;

        this._initBoard(l);
        // Focus mode is a class on the screen, so a freshly rendered lesson
        // screen has to be told the current preference (it may be on).
        if (typeof window.DoChessLearn !== 'undefined'
            && window.DoChessLearn.focus && window.DoChessLearn.focus.applyFocusMode) {
            window.DoChessLearn.focus.applyFocusMode();
        }
        const diff = document.getElementById('cpu-diff');
        if (diff) {
            diff.value = this._cpuDifficulty || 'easy';
            diff.addEventListener('change', () => { this._cpuDifficulty = diff.value; });
        }
    }

    _initBoard(l) {
        this._searchEpoch = (this._searchEpoch || 0) + 1;
        this.exerciseDone    = false;
        this.isFreeGame      = l.type === 'free-game';
        this.cpuBusy         = false;
        this.currentExercise = l.exercise || null;
        this._stepIndex      = 0;
        this._loggedMoves    = 0;
        this._lessonRover    = null;
        this._statusCache    = null;
        this.game.reset();
        if (l.fen) this.game.loadFEN(l.fen);
        // New lesson = new position: drop the synced marker so squares are
        // rebuilt once for the fresh board, then synced in place after.
        const b = document.getElementById('chess-board');
        if (b) b.dataset.synced = '';
        this._draw();
        this._syncNextLessonBtn();
    }

    /* ══════════════════════════════════════════════════════════════
       BOARD RENDERING — incremental, no 64-node rebuild
       Squares are created ONCE per board element and then synced in place:
       only classes, piece <img>, indicators and labels change per move.
       This preserves focus, avoids image re-decode churn, and keeps the
       interaction at a few DOM writes instead of 64 createElement + innerHTML.
    ══════════════════════════════════════════════════════════════ */
    _ensureLessonSquares(board) {
        if (board.dataset.synced === 'lesson' && board.querySelectorAll(':scope > .chess-square').length === 64) return;
        board.innerHTML = '';
        for (let dr = 0; dr < 8; dr++) {
            for (let dc = 0; dc < 8; dc++) {
                const sq = document.createElement('div');
                sq.className = 'chess-square white';
                sq.dataset.dr = String(dr);
                sq.dataset.dc = String(dc);
                sq.setAttribute('role', 'button');
                sq.setAttribute('tabindex', '-1');
                board.appendChild(sq);
            }
        }
        board.dataset.synced = 'lesson';
        this._bindBoard(board, 'lesson');
    }
    _syncLessonSquares(board) {
        const sel      = this.game.selectedSquare;
        const legal    = this.game.legalMoves || [];
        const history  = this.game.moveHistory;
        const last     = history.length > 0 ? history[history.length - 1] : null;
        const lastFrom = last ? this.game.algebraicToCoords(last.from) : null;
        const lastTo   = last ? this.game.algebraicToCoords(last.to)   : null;
        const inCheck  = this.game._isKingInCheck(this.game.currentPlayer);
        const kingPos  = inCheck ? this.game.findKing(this.game.currentPlayer) : null;
        const flip = !!this.boardFlip;
        const at = (dr, dc) => [flip ? 7 - dr : dr, flip ? 7 - dc : dc];
        const legalSet = new Set(legal.map(m => m[0] + ',' + m[1]));
        // Roving tabindex: selected square is the tab stop, else the rover
        // (last move target, else e2, else first). All others are -1.
        let rover = this._lessonRover;
        if (sel) rover = this.game.coordsToAlgebraic(sel);
        else if (last) rover = last.to;
        if (!rover) rover = 'e2';
        // Scope to squares only: fly-piece <img> clones are transient direct
        // children of the board during the 240ms glide and must be skipped.
        const kids = board.querySelectorAll(':scope > .chess-square');
        for (let i = 0; i < kids.length; i++) {
            const sq = kids[i];
            const dr = +sq.dataset.dr, dc = +sq.dataset.dc;
            const [r, c] = at(dr, dc);
            const light = (r + c) % 2 === 0;
            sq.className = `chess-square ${light ? 'white' : 'black'}`;
            sq.dataset.row = String(r);
            sq.dataset.col = String(c);
            const alg = this.game.coordsToAlgebraic([r, c]);
            sq.dataset.square = alg;
            const piece = this.game.board[r][c];
            const isKingInCheck = !!(kingPos && kingPos[0] === r && kingPos[1] === c);
            sq.setAttribute('aria-label', this._squareLabel(alg, piece, isKingInCheck));
            if (sel && sel[0] === r && sel[1] === c) { sq.classList.add('selected'); sq.setAttribute('aria-selected', 'true'); }
            else sq.removeAttribute('aria-selected');
            if ((lastFrom && lastFrom[0] === r && lastFrom[1] === c) || (lastTo && lastTo[0] === r && lastTo[1] === c)) sq.classList.add('last-move');
            if (isKingInCheck) sq.classList.add('in-check');
            // Piece <img>: reuse the node, only swap src when the piece changed.
            let img = sq.querySelector('img.chess-piece, svg.chess-piece');
            if (piece) {
                const wantSrc = this._pieceFile(piece);
                if (img && img.tagName === 'IMG' && img.dataset.fallbackPiece === piece && img.getAttribute('src') === wantSrc) {
                    // unchanged — keep node (no re-decode)
                } else {
                    const w = document.createElement('div');
                    w.innerHTML = this._svg(piece);
                    const fresh = w.firstChild;
                    if (img) img.replaceWith(fresh);
                    else sq.prepend(fresh);
                }
            } else if (img) img.remove();
            // Legal indicators: single small node per square.
            const wantDot = !!(sel && legalSet.has(r + ',' + c));
            let dot = sq.querySelector('.legal-dot, .legal-ring');
            if (wantDot && !dot) {
                dot = document.createElement('div');
                dot.className = piece ? 'legal-ring' : 'legal-dot';
                dot.setAttribute('aria-hidden', 'true');
                sq.appendChild(dot);
            } else if (wantDot && dot) {
                const wantCls = piece ? 'legal-ring' : 'legal-dot';
                if (dot.className !== wantCls) dot.className = wantCls;
            } else if (!wantDot && dot) dot.remove();
            // Coordinates live on fixed display edges (dr==7 file, dc==0 rank).
            let fl = sq.querySelector('.coord-file');
            let rk = sq.querySelector('.coord-rank');
            if (dr === 7) {
                if (!fl) { fl = document.createElement('span'); fl.className = 'coord-file'; sq.appendChild(fl); }
                const want = String.fromCharCode(97 + c);
                if (fl.textContent !== want) fl.textContent = want;
            } else if (fl) fl.remove();
            if (dc === 0) {
                if (!rk) { rk = document.createElement('span'); rk.className = 'coord-rank'; sq.appendChild(rk); }
                const want = String(8 - r);
                if (rk.textContent !== want) rk.textContent = want;
            } else if (rk) rk.remove();
            // Roving tabindex.
            sq.setAttribute('tabindex', alg === rover ? '0' : '-1');
        }
        this._lessonRover = rover;
    }
    _draw(opts) {
        const light = !!(opts && opts.light);
        const board = document.getElementById('chess-board');
        if (!board) return;

        // Flyover animation: snapshot BEFORE the in-place sync (old DOM is
        // still live, so rects are valid), glide overlay clones after sync.
        // 240ms, transform-only, skipped under prefers-reduced-motion.
        const hlen = this.game.moveHistory.length;
        const isNewMove = hlen > (this._drawnMoves || 0);
        this._drawnMoves = hlen;
        const lastHist = hlen ? this.game.moveHistory[hlen - 1] : null;
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let flyers = [];
        if (isNewMove && !reduced && lastHist && board.isConnected && board.querySelectorAll(':scope > .chess-square').length === 64) {
            // One layout read for the board; piece rects come from the same
            // frame so no interleaved writes (no thrash by construction).
            const brect = board.getBoundingClientRect();
            const snap = (sqName) => {
                const el = board.querySelector(`[data-square="${sqName}"] img.chess-piece`);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                // Zero-area / non-finite rects (rapid successive draws, hidden
                // board) must not animate: fall back to the instant synced
                // state instead of gliding from a bogus origin.
                if (!(r.width > 0 && r.height > 0) || !isFinite(r.left + r.top + brect.left + brect.top)) return null;
                return { src: el.getAttribute('src'), cls: el.getAttribute('class') || 'chess-piece', x: r.left - brect.left, y: r.top - brect.top, size: r.width };
            };
            const push = (from, to) => { const s = snap(from); if (s) flyers.push({ ...s, to }); };
            push(lastHist.from, lastHist.to);
            if (lastHist.specialMove === 'castling') {
                const rank = lastHist.to[1];
                if (lastHist.to[0] === 'g') push('h' + rank, 'f' + rank);
                else if (lastHist.to[0] === 'c') push('a' + rank, 'd' + rank);
            }
        }

        this._ensureLessonSquares(board);
        this._bindBoard(board, 'lesson');
        this._syncLessonSquares(board);

        if (flyers.length) {
            const brect = board.getBoundingClientRect();
            flyers.forEach(f => {
                const dest = board.querySelector(`[data-square="${f.to}"]`);
                if (!dest) return;
                const dr = dest.getBoundingClientRect();
                if (!(dr.width > 0 && dr.height > 0) || !isFinite(dr.left + dr.top)) return;
                const cx = dr.left - brect.left + (dr.width - f.size) / 2;
                const cy = dr.top - brect.top + (dr.height - f.size) / 2;
                const ghost = dest.querySelector('img.chess-piece');
                if (ghost) ghost.style.visibility = 'hidden';
                const img = document.createElement('img');
                img.src = f.src;
                img.className = (f.cls + ' fly-piece').trim();
                img.alt = '';
                img.style.left = f.x + 'px';
                img.style.top = f.y + 'px';
                img.style.width = f.size + 'px';
                img.style.height = f.size + 'px';
                board.appendChild(img);
                const anim = img.animate(
                    [{ transform: 'translate(0, 0)' }, { transform: `translate(${cx - f.x}px, ${cy - f.y}px)` }],
                    { duration: 240, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
                );
                const land = () => { img.remove(); if (ghost) ghost.style.visibility = ''; };
                anim.onfinish = land;
                // Safety net: never leave a hidden piece or stray clone behind.
                setTimeout(land, 600);
            });
        }

        // Selection-only repaints skip the expensive extras: the move log,
        // turn speech/status scan and captured rows only change on moves.
        // Selection callers pass { light: true } (see _click).
        if (!light) {
            this._updateMoveLog();
            this._updateTurnUI();
            this._paintCaptured('lesson-content', this.game, 'white');
        }
        const sc = document.getElementById('lesson-sticky-score');
        if (sc) sc.textContent = this.game.moveHistory.length;
    }

    /* ── Drag-and-drop (pointer events, touch-friendly) ─────────────
       Dragging a piece glides a ghost under the pointer; dropping on a
       square runs the exact same path as click-click. A tap never moves
       enough to start a drag, so plain clicks are untouched. ─────── */
    /* ── Board events (delegated, bound once per board element) ─────
       Click, keyboard and drag all resolve the square from the event
       target. One listener set per board instead of 6 per square per
       redraw keeps every move allocation-free on the input path.
       Touch pointers implicitly capture to the pressed square, so
       drag move/up keep arriving exactly as the per-square version. ── */
    _bindBoard(board, kind) {
        if (board.dataset.bound === kind) return;
        board.dataset.bound = kind;
        const sqOf = (e) => {
            const el = e.target && e.target.closest ? e.target.closest('.chess-square') : null;
            return el && el.dataset.row !== undefined ? el : null;
        };
        const act = (r, c) => { if (kind === 'lesson') this._click(r, c); else this._onlineClick(r, c); };
        board.addEventListener('click', (e) => {
            const sq = sqOf(e); if (!sq) return;
            act(+sq.dataset.row, +sq.dataset.col);
        });
        // Keyboard: Enter/Space acts; arrows move the roving tab stop in
        // DISPLAY space (flip-aware via dr/dc), Home/End jump to corners.
        // The board exposes a single Tab stop (roving tabindex).
        board.addEventListener('keydown', (e) => {
            const sq = sqOf(e); if (!sq) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                act(+sq.dataset.row, +sq.dataset.col);
                return;
            }
            const moveKeys = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
            let target = null;
            if (moveKeys[e.key]) {
                e.preventDefault();
                const [ddr, ddc] = moveKeys[e.key];
                const dr = Math.max(0, Math.min(7, (+sq.dataset.dr) + ddr));
                const dc = Math.max(0, Math.min(7, (+sq.dataset.dc) + ddc));
                target = board.querySelector(`.chess-square[data-dr="${dr}"][data-dc="${dc}"]`);
            } else if (e.key === 'Home') {
                e.preventDefault();
                target = board.querySelector('.chess-square[data-dr="0"][data-dc="0"]');
            } else if (e.key === 'End') {
                e.preventDefault();
                target = board.querySelector('.chess-square[data-dr="7"][data-dc="7"]');
            } else return;
            if (target) {
                // Move the roving stop and focus without scrolling the page.
                board.querySelectorAll('.chess-square[tabindex="0"]').forEach(n => n.setAttribute('tabindex', '-1'));
                target.setAttribute('tabindex', '0');
                try { target.focus({ preventScroll: false }); } catch (_) { target.focus(); }
                if (kind === 'lesson') this._lessonRover = target.dataset.square;
                else this._onlineRover = target.dataset.square;
            }
        });
        board.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button > 0) return;
            const sq = sqOf(e); if (!sq) return;
            if (!sq.querySelector('img.chess-piece')) return;
            this._drag = { from: [+sq.dataset.row, +sq.dataset.col], sqEl: sq, x0: e.clientX, y0: e.clientY, ghost: null, kind };
        });
        board.addEventListener('pointermove', (e) => {
            const d = this._drag;
            if (!d || d.kind !== kind) return;
            if (!d.ghost) {
                if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) <= 10) return;
                const img = (d.sqEl && d.sqEl.isConnected) ? d.sqEl.querySelector('img.chess-piece') : null;
                if (!img) { this._drag = null; return; }
                const rect = img.getBoundingClientRect();
                const g = img.cloneNode();
                g.className += ' drag-ghost';
                g.style.width = rect.width + 'px';
                g.style.height = rect.height + 'px';
                // Position BEFORE append: a frame must never render the ghost
                // at the CSS default origin (top-left flash on fast drags).
                g.style.transform = `translate(${e.clientX - rect.width / 2}px, ${e.clientY - rect.height / 2}px)`;
                document.body.appendChild(g);
                d.ghost = g; d.w = rect.width; d.h = rect.height;
                const [r, c] = d.from;
                if (kind === 'lesson') { if (!this.game.selectedSquare) this._click(r, c); }
                else { const s = this.online; if (s && !s.sel) this._onlineClick(r, c); }
            }
            d.ghost.style.transform = `translate(${e.clientX - d.w / 2}px, ${e.clientY - d.h / 2}px)`;
        });
        const drop = (e) => {
            const d = this._drag;
            if (!d || d.kind !== kind) return;
            this._drag = null;
            if (!d.ghost) return;
            d.ghost.remove();
            // Perform the drop FIRST (the swallow flag below would block it),
            // then arm the flag so the trailing click of the same gesture dies.
            const t = (e.clientX !== undefined && document.elementFromPoint(e.clientX, e.clientY) || { closest: () => null }).closest('.chess-square');
            let acted = false;
            if (!t || t.dataset.row === undefined) {
                if (kind === 'lesson' && this.game.selectedSquare) { this.game.selectedSquare = null; this.game.legalMoves = []; this._draw({ light: true }); acted = true; }
            } else {
                const tr = +t.dataset.row, tc = +t.dataset.col;
                if (kind === 'lesson') {
                    const sel = this.game.selectedSquare;
                    if (sel && (sel[0] !== tr || sel[1] !== tc)) { this._click(tr, tc); acted = true; }
                    else if (!sel) { this.game.selectedSquare = null; this.game.legalMoves = []; this._draw({ light: true }); acted = true; }
                } else {
                    const s = this.online;
                    if (s && s.sel && (s.sel[0] !== tr || s.sel[1] !== tc)) { this._onlineClick(tr, tc); acted = true; }
                }
            }
            if (acted) {
                this._dragMoved = true;
                setTimeout(() => { this._dragMoved = false; }, 0);
            }
        };
        board.addEventListener('pointerup', drop);
        board.addEventListener('pointercancel', () => { if (this._drag?.ghost) this._drag.ghost.remove(); this._drag = null; });
    }

    /* ══════════════════════════════════════════════════════════════
       CLICK HANDLER
    ══════════════════════════════════════════════════════════════ */
    _click(r, c) {
        if (this._dragMoved) return;
        if (this.cpuBusy) return;
        if (this.game.pendingPromotion) return;
        if (!this.isFreeGame && this.exerciseDone) {
            this._fb('Exercise complete! Click "Complete Lesson" to continue.', 'success');
            return;
        }
        if (this.game.currentPlayer !== 'white') return;
        if (this.game.gameOver) return;

        const g = this.game;

        // Selection never changes log/turn/captured — light sync only.
        const paintSel = () => this._draw({ light: true });
        if (!g.selectedSquare) {
            if (g.board[r][c] && g.isColor(r, c, 'white')) {
                g.selectedSquare = [r, c];
                g.legalMoves     = g.getLegalMoves([r, c]);
                if (!g.legalMoves.length) {
                    this._fb('That piece has no legal moves right now.', 'info');
                    g.selectedSquare = null;
                }
                paintSel();
            }
        } else {
            const isLegal = g.legalMoves.some(m => m[0] === r && m[1] === c);
            if (isLegal) {
                const from = g.selectedSquare;
                g.selectedSquare = null; g.legalMoves = [];
                this._doPlayerMove(from, [r, c]);
            } else if (g.board[r][c] && g.isColor(r, c, 'white')) {
                g.selectedSquare = [r, c];
                g.legalMoves     = g.getLegalMoves([r, c]);
                paintSel();
            } else {
                g.selectedSquare = null; g.legalMoves = [];
                paintSel();
            }
        }
    }

    /* ══════════════════════════════════════════════════════════════
       EXECUTE PLAYER MOVE
    ══════════════════════════════════════════════════════════════ */
    _doPlayerMove(from, to) {
        const result = this.game.movePiece(from, to);
        if (result === 'promotion-needed') {
            this._draw();
            this._showPromotion(from, to, 'white');
            return;
        }
        this._playMoveSound(result);
        this._draw();
        if (!this.isFreeGame) this._checkExercise();
        this._afterMove();
    }

    _playMoveSound(move) {
        if (!move || typeof move !== 'object') return;
        if (move.captured) this.snd.playCapture();
        else this.snd.playMove();
    }

    /* ══════════════════════════════════════════════════════════════
       AFTER MOVE — check status, trigger CPU (free game only)
    ══════════════════════════════════════════════════════════════ */
    _afterMove() {
        // Exercise lessons (1-9): no computer opponent, no game-over
        // detection. The board simply locks after the correct move.
        // Only the free game (lesson 10) uses full win/draw/CPU logic.
        if (!this.isFreeGame) {
            this._updateTurnUI();
            return;
        }

        const status = this.game.getGameStatus();

        if (status.startsWith('checkmate')) {
            const winner = status.split('-')[1];
            const msg = winner === 'white'
                ? 'Checkmate! You win! Magnificent play!'
                : 'Checkmate! The computer wins. Study the position and try again!';
            this._fb(msg, winner === 'white' ? 'success' : 'error');
            this.game.gameOver = true;
            if (winner === 'white') { this.snd.playSuccess(); }
            if (winner === 'white') this.markDone(this.currentLesson.id);
            this._updateTurnUI();
            return;
        }
        if (status === 'stalemate') {
            this._fb("Stalemate! It's a draw — no legal moves.", 'info');
            this.game.gameOver = true; this._updateTurnUI(); return;
        }
        if (status.startsWith('draw-')) {
            const msgs = {
                'draw-insufficient': 'Draw — neither side can possibly checkmate.',
                'draw-repetition': 'Draw by threefold repetition — same position three times.',
                'draw-fifty': 'Draw by the fifty-move rule — 50 moves with no pawn move or capture.'
            };
            this._fb(msgs[status] || "It's a draw.", 'info');
            this.game.gameOver = true; this._updateTurnUI(); return;
        }
        if (status.startsWith('check-white')) {
            this._fb('Your king is in check! You must defend it.', 'error');
            this.snd.playCheck();
            this._updateTurnUI();
            return; // White is still to move — do NOT trigger CPU
        }
        if (status.startsWith('check-black')) {
            this._fb('Check! The black king is under attack.', 'info');
            this.snd.playCheck();
        }

        // Trigger CPU if it is now black's turn (free game only)
        if (this.game.currentPlayer === 'black' && !this.game.gameOver) {
            this.cpuBusy = true;
            this._updateTurnUI();
            this._setSpeech((this._cpuDifficulty || 'easy') === 'medium' ? 'Thinking a few moves deep…' : 'Playing a casual move…');
            setTimeout(() => this._cpuMove(), 650);
        }
    }

    /* ══════════════════════════════════════════════════════════════
       COMPUTER MOVE — alpha-beta over material + piece-square tables.
       Scores are centipawns from Black's (the computer's) perspective.
    ══════════════════════════════════════════════════════════════ */
    static _pst() {
        if (ChessCourseApp._pstCache) return ChessCourseApp._pstCache;
        const T = (rows) => rows;
        ChessCourseApp._pstCache = {
            p: T([[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]]),
            n: T([[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]]),
            b: T([[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]]),
            r: T([[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]]),
            q: T([[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]]),
            k: T([[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]])
        };
        return ChessCourseApp._pstCache;
    }
    static _mat() { return { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }; }

    _allMoves(g, color) {
        const out = [];
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            if (!g.isColor(r, c, color)) continue;
            const piece = g.board[r][c];
            g.getLegalMoves([r, c]).forEach(([tr, tc]) => {
                const promo = (piece.toLowerCase() === 'p' && (tr === 0 || tr === 7)) ? 'q' : null;
                const target = g.board[tr][tc];
                out.push({ from: [r, c], to: [tr, tc], promo, cap: target ? (ChessCourseApp._mat()[target.toLowerCase()] || 0) : 0 });
            });
        }
        return out;
    }
    _orderMoves(g, moves) {
        return moves.slice().sort((a, b) => b.cap - a.cap);
    }
    _evaluate(g) {
        const pst = ChessCourseApp._pst(), mat = ChessCourseApp._mat();
        let black = 0, white = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = g.board[r][c];
            if (!p) continue;
            const t = p.toLowerCase(), v = (mat[t] || 0) + ((pst[t] || [])[p === p.toUpperCase() ? r : 7 - r]?.[c] || 0);
            if (p === p.toUpperCase()) white += v; else black += v;
        }
        return black - white;
    }
    _search(g, depth, alpha, beta, maxBlack) {
        if (g._insufficientMaterial() || g.repetitionCount() >= 3 || (g.halfmoveClock || 0) >= 100) return 0;
        const color = maxBlack ? 'black' : 'white';
        const moves = this._orderMoves(g, this._allMoves(g, color));
        if (!moves.length) {
            if (!g.findKing(color)) return 0;
            return g._isKingInCheck(color) ? (maxBlack ? -100000 - depth : 100000 + depth) : 0;
        }
        if (depth === 0) return this._evaluate(g);
        if (maxBlack) {
            let best = -Infinity;
            for (const mv of moves) {
                const snap = g.snapshot();
                g.movePiece(mv.from, mv.to, mv.promo || null);
                const v = this._search(g, depth - 1, alpha, beta, false);
                g.restore(snap);
                if (v > best) best = v;
                if (best > alpha) alpha = best;
                if (alpha >= beta) break;
            }
            return best;
        }
        let best = Infinity;
        for (const mv of moves) {
            const snap = g.snapshot();
            g.movePiece(mv.from, mv.to, mv.promo || null);
            const v = this._search(g, depth - 1, alpha, beta, true);
            g.restore(snap);
            if (v < best) best = v;
            if (best < beta) beta = best;
            if (alpha >= beta) break;
        }
        return best;
    }
    _cpuMove() {
        if (this.game.gameOver) { this.cpuBusy = false; return; }
        const g = this.game;
        const moves = this._allMoves(g, 'black');

        if (!moves.length) {
            // No legal black moves — distinguish checkmate from stalemate
            const st = g.getGameStatus();
            if (st.startsWith('checkmate')) {
                this._fb('Checkmate! You win! Magnificent play!', 'success');
                this.snd.playSuccess();
                if (this.isFreeGame) this.markDone(this.currentLesson.id);
            } else {
                this._fb("Stalemate — it's a draw.", 'info');
            }
            g.gameOver = true;
            this.cpuBusy = false;
            this._draw();
            this._updateTurnUI();
            return;
        }

        const diff = this._cpuDifficulty || 'easy';
        const depth = diff === 'medium' ? 3 : 2;
        this._setSpeech(diff === 'medium' ? 'Thinking three moves deep…' : 'Playing a casual move…');
        // Chunked root search so the UI never freezes: a few root moves per
        // macrotask, best-so-far kept throughout. The epoch aborts a stale
        // search if the board was reset mid-think.
        const epoch = this._searchEpoch || 0;
        const ordered = this._orderMoves(g, moves);
        let i = 0, alpha = -Infinity, scored = [];
        const step = () => {
            if (this.game !== g || epoch !== this._searchEpoch || g.gameOver) { this.cpuBusy = false; this._updateTurnUI(); return; }
            const t0 = Date.now();
            // 20ms slices: long enough to make progress, short enough that
            // every frame still renders while the computer is thinking.
            while (i < ordered.length && Date.now() - t0 < 20) {
                const mv = ordered[i++];
                const snap = g.snapshot();
                g.movePiece(mv.from, mv.to, mv.promo || null);
                // _search scores from Black's perspective; after Black's
                // move it is White (minimizer) to move.
                const sc = this._search(g, depth - 1, alpha, Infinity, false);
                g.restore(snap);
                scored.push({ ...mv, score: sc });
                if (sc > alpha) alpha = sc;
            }
            if (i < ordered.length) { setTimeout(step, 0); return; }
            scored.sort((a, b) => b.score - a.score);
            let best = scored[0];
            if (diff !== 'medium' && scored.length > 1) {
                // Easy blunders like a beginner: mostly near-best, sometimes wild.
                if (Math.random() < 0.15) best = scored[Math.floor(Math.random() * scored.length)];
                else {
                    const pool = scored.filter(m => best.score - m.score <= 60);
                    best = pool[Math.floor(Math.random() * pool.length)];
                }
            }
            this._commitCpuMove(best);
        };
        setTimeout(step, 0);
        return; // commit happens async below
    }

    _commitCpuMove(best) {
        const g = this.game;
        // Computer always promotes to queen
        const piece = g.board[best.from[0]][best.from[1]];
        const isPromo = piece && piece.toLowerCase() === 'p' && (best.to[0] === 0 || best.to[0] === 7);
        const result = g.movePiece(best.from, best.to, isPromo ? 'q' : null);

        this._playMoveSound(result);
        this.cpuBusy = false;
        this._draw();

        const status = g.getGameStatus();
        if (status.startsWith('checkmate')) {
            const winner = status.split('-')[1];
            const msg = winner === 'black' ? 'Checkmate! Computer wins. Try again!' : 'You win!';
            this._fb(msg, winner === 'black' ? 'error' : 'success');
            if (winner === 'white') { this.snd.playSuccess(); }
            g.gameOver = true;
        } else if (status === 'stalemate') {
            this._fb("Stalemate — it's a draw.", 'info'); g.gameOver = true;
        } else if (status.startsWith('draw-')) {
            const msgs = {
                'draw-insufficient': 'Draw — neither side can possibly checkmate.',
                'draw-repetition': 'Draw by threefold repetition.',
                'draw-fifty': 'Draw by the fifty-move rule.'
            };
            this._fb(msgs[status] || "It's a draw.", 'info'); g.gameOver = true;
        } else if (status.startsWith('check-white')) {
            this._fb('Your king is in check! Defend it.', 'error'); this.snd.playCheck();
        } else {
            const num = Math.ceil(g.moveHistory.length / 2);
            this._fb(`Move ${num} — your turn (White)`, 'info');
        }
        this._updateTurnUI();
    }

    /* ══════════════════════════════════════════════════════════════
       PROMOTION PICKER
    ══════════════════════════════════════════════════════════════ */
    /* Promotion dialog a11y: focus moves in, Tab is trapped, Escape
       announces (promotion is mandatory — it cannot be cancelled, so Escape
       keeps the dialog open and re-focuses it), choosing returns focus to
       the promotion square. Native buttons give Enter/Space for free. */
    _trapPromotionKeys(picker) {
        if (picker.dataset.trapped) return;
        picker.dataset.trapped = '1';
        picker.addEventListener('keydown', (e) => {
            const btns = [...picker.querySelectorAll('button.promotion-btn')];
            if (!btns.length) return;
            if (e.key === 'Tab') {
                e.preventDefault();
                const i = btns.indexOf(document.activeElement);
                if (e.shiftKey) {
                    const prev = i <= 0 ? btns[btns.length - 1] : btns[i - 1];
                    prev.focus();
                } else {
                    const next = (i === -1 || i === btns.length - 1) ? btns[0] : btns[i + 1];
                    next.focus();
                }
            } else if (e.key === 'Escape') {
                // Mandatory choice: don't close, don't strand focus.
                e.preventDefault();
                e.stopPropagation();
                (btns[0] || picker).focus?.();
                this._fb?.('Choose a promotion piece to continue — queen, rook, bishop, or knight.', 'info');
            }
        });
    }
    _showPromotion(from, to, color) {
        const picker = document.getElementById('promotion-picker');
        if (!picker) return;
        picker.innerHTML = '';
        picker.classList.remove('hidden');
        picker.setAttribute('role', 'dialog');
        picker.setAttribute('aria-modal', 'true');
        picker.setAttribute('aria-label', 'Choose promotion piece');
        this._trapPromotionKeys(picker);

        const pieces = color === 'white' ? ['Q','R','B','N'] : ['q','r','b','n'];
        const names  = { Q:'Queen', R:'Rook', B:'Bishop', N:'Knight', q:'Queen', r:'Rook', b:'Bishop', n:'Knight' };

        const label = document.createElement('p');
        label.className = 'promotion-label';
        label.textContent = 'Choose your promotion piece:';
        picker.appendChild(label);

        const row = document.createElement('div');
        row.className = 'promotion-options';
        pieces.forEach((p, idx) => {
            const btn = document.createElement('button');
            btn.className = 'promotion-btn';
            btn.type = 'button';
            btn.setAttribute('aria-label', `Promote to ${names[p]}`);
            btn.innerHTML = `${this._svg(p)}<span>${names[p]}</span>`;
            btn.onclick = () => {
                picker.innerHTML = ''; picker.classList.add('hidden');
                const result = this.game.movePiece(from, to, p);
                this._playMoveSound(result);
                this._draw();
                if (!this.isFreeGame) this._checkExercise();
                this._afterMove();
                // Return focus to the promotion square (roving stop follows).
                this._lessonRover = this.game.coordsToAlgebraic(to);
                const back = document.querySelector(`#chess-board [data-square="${this._lessonRover}"]`);
                if (back) {
                    document.querySelectorAll('#chess-board .chess-square[tabindex="0"]').forEach(n => n.setAttribute('tabindex', '-1'));
                    back.setAttribute('tabindex', '0');
                    try { back.focus({ preventScroll: true }); } catch (_) {}
                }
            };
            row.appendChild(btn);
            if (idx === 0) {
                // Focus the default (queen) so keyboard users land in-dialog.
                setTimeout(() => { try { btn.focus({ preventScroll: true }); } catch (_) {} }, 0);
            }
        });
        picker.appendChild(row);
    }

    /* ══════════════════════════════════════════════════════════════
       EXERCISE CHECK
    ══════════════════════════════════════════════════════════════ */
    // Multi-step exercises (lesson 2: push, then capture) share one board:
    // each step is checked in turn, the turn stays with White between steps.
    _stepText(exercise, idx) {
        const steps = exercise.steps || [exercise];
        const i = Math.min(idx || 0, steps.length - 1);
        if (steps.length > 1) return `<strong>Step ${i + 1} of ${steps.length}:</strong> ${steps[i].instr}`;
        return steps[i].instr;
    }
    _renderStepInstruction() {
        const el = document.getElementById('exercise-instruction');
        if (el && this.currentExercise) {
            el.innerHTML = this._stepText(this.currentExercise, this._stepIndex || 0);
        }
    }
    _checkExercise() {
        if (!this.currentExercise || this.exerciseDone) return;
        const history = this.game.moveHistory;
        const last = history.length > 0 ? history[history.length - 1] : null;
        if (!last) return;

        // Course-friendly acceptance: movement lessons accept ANY legal
        // move by the featured piece, so exploration is rewarded instead
        // of punished. Precision steps (castling, promotion square, a
        // fixed from-square) still require their exact move.
        const ex = this.currentExercise;
        const steps = ex.steps || [ex];
        const idx = Math.min(this._stepIndex || 0, steps.length - 1);
        const step = steps[idx];
        const moved = last.piece.toLowerCase();
        let ok = false;
        if (step.move) ok = last.from === step.move[0] && last.to === step.move[1];
        else if (step.from) ok = last.from === step.from && moved === 'p';
        else if (step.freeCapture) ok = moved === 'p' && !!last.captured;
        else if (step.freePiece) ok = moved === step.freePiece;

        const isLast = idx === steps.length - 1;
        // Name the player's actual move: praise is never generic, so a
        // different-but-legal choice still feels recognized, not wrong.
        const played = `${last.from}→${last.to}`;
        const fbText = step.move ? (step.fb || ex.fb) : `Nice — ${played}! ${step.fb || ex.fb}`;

        if (ok) {
            if (!isLast) {
                // Advance on the same board; White to move again.
                this._stepIndex = idx + 1;
                this.game.currentPlayer = 'white';
                this.snd.playSuccess();
                this._renderStepInstruction();
                this._fb(`${step.fb} ${steps[idx + 1].instr}`, 'success');
                return;
            }
            this.exerciseDone = true;
            this.snd.playSuccess();
            const el = document.getElementById('exercise-instruction');
            if (el) {
                el.innerHTML = `<strong>Exercise Complete!</strong> ${fbText}`;
                el.style.color = 'var(--accent-bright)';
                const box = el.closest('.exercise-instructions');
                if (box) { box.style.background = 'rgba(16,185,129,0.12)'; box.style.borderColor = 'var(--accent)'; }
            }
            this._fb(fbText, 'success');
            document.querySelectorAll('#complete-btn, #complete-btn-sticky').forEach((btn) => {
                btn.disabled = false;
                btn.removeAttribute('title');
            });
        } else {
            const names = { p: 'pawn', r: 'rook', b: 'bishop', n: 'knight', q: 'queen', k: 'king' };
            const featured = step.freePiece || ((step.freeCapture || step.from) ? 'p' : null);
            let hint;
            if (step.from && last.from !== step.from) {
                hint = `Not quite — start from ${step.from}! Move the pawn on ${step.from}.`;
            } else if (featured && moved !== featured) {
                hint = `Good move — but this lesson is about the ${names[featured]}! Move your ${names[featured]} instead.`;
            } else if (step.freeCapture) {
                hint = 'Not quite — pawns capture one square diagonally. Take the black pawn!';
            } else {
                const moves = {
                    r: 'Rooks move straight — horizontally or vertically.',
                    b: 'Bishops glide diagonally.',
                    n: 'Knights jump in an L-shape.',
                    q: 'The queen moves like a rook or bishop.',
                    k: 'The king steps exactly one square.',
                    p: 'Pawns march straight ahead.'
                };
                hint = (moves[moved] || 'Not quite!') + ' Try another square with it!';
            }
            this._fb(hint + ' Click "Reset Board" and try again.', 'error');
        }
    }

    /* ══════════════════════════════════════════════════════════════
       TURN UI / SPEECH / MOVE LOG
    ══════════════════════════════════════════════════════════════ */
    _updateTurnUI() {
        // Exercise complete (lessons 1-9): board is locked, nobody's turn.
        // Never show "Thinking..." in that state — it confused users into
        // thinking a button was broken.
        const lockedDone = !this.isFreeGame && this.exerciseDone && !this.game.gameOver;
        const yourTurn = !lockedDone && this.game.currentPlayer === 'white' && !this.cpuBusy && !this.game.gameOver;
        const cpuTurn  = !lockedDone && !yourTurn && !this.game.gameOver && this.isFreeGame;

        const pYou  = document.getElementById('profile-you');
        const pOpp  = document.getElementById('profile-opp');
        const tiYou = document.getElementById('ti-you');
        const tiOpp = document.getElementById('ti-opp');

        if (pYou) pYou.classList.toggle('your-turn', yourTurn);
        if (pOpp) pOpp.classList.toggle('your-turn', cpuTurn);
        if (tiYou) tiYou.textContent = this.game.gameOver ? 'Game over' : lockedDone ? 'Done ✓' : yourTurn ? 'Your turn' : 'Waiting';
        if (tiOpp) tiOpp.textContent = this.game.gameOver ? 'Game over' : lockedDone ? 'Well played!' : cpuTurn ? 'Thinking...' : 'Waiting';

        // Speech bubble
        if (lockedDone) { this._setSpeech('Well done! Click "Complete Lesson" to continue.'); return; }
        if (this.cpuBusy) { this._setSpeech((this._cpuDifficulty || 'easy') === 'medium' ? 'Thinking a few moves deep…' : 'Playing a casual move…'); return; }
        if (this.game.gameOver) { this._refreshGameOverCard(); return; }
        // getGameStatus() scans the whole board (checkmate/stalemate walk
        // every piece), so cache it per position — _updateTurnUI runs twice
        // per move (draw + afterMove) and must stay off the select path.
        const sKey = this.game.moveHistory.length + '|' + this.game.currentPlayer + '|' + (this.game.moveHistory.length ? this.game.moveHistory[this.game.moveHistory.length - 1].from + this.game.moveHistory[this.game.moveHistory.length - 1].to : '');
        let status;
        if (this._statusCache && this._statusCache.key === sKey) status = this._statusCache.status;
        else { status = this.game.getGameStatus(); this._statusCache = { key: sKey, status }; }
        if (status.startsWith('check-white'))      this._setSpeech('Your king is in check — defend it!');
        else if (status.startsWith('check-black')) this._setSpeech('Check! The black king is under attack.');
        else if (this.exerciseDone)                this._setSpeech('Well done! Click "Complete Lesson" to continue.');
        else if (this.isFreeGame) {
            const num = Math.ceil(this.game.moveHistory.length / 2) + 1;
            this._setSpeech(`Move ${num}. ${yourTurn ? "Your turn." : "Computer is thinking..."}`);
        } else {
            this._setSpeech('Think carefully about your next move.');
        }
        this._refreshGameOverCard();
    }

    _setSpeech(msg) {
        const el = document.getElementById('speech');
        if (el) el.textContent = msg;
    }

    _fmtLogMove(m) {
        const cap = m.captured ? 'x' : '-';
        const suf = m.specialMove === 'castling' ? ' O-O'
                  : m.specialMove === 'enpassant' ? ' e.p.'
                  : m.promotion   ? ('=' + m.promotion.toUpperCase()) : '';
        return `<span class="move-item">${esc(m.from)}${cap}${esc(m.to)}${esc(suf)}</span>`;
    }
    _updateMoveLog() {
        // Append-only: only the newest pair is added. Full rebuild happens
        // solely on reset/undo (history shrank) — never on a normal move.
        const log = document.getElementById('move-log');
        if (!log) return;
        const moves = this.game.moveHistory;
        if (!moves.length) {
            log.innerHTML = '<span style="color:var(--text-muted-dim)">No moves yet — select a white piece to begin.</span>';
            this._loggedMoves = 0;
            return;
        }
        if ((this._loggedMoves || 0) > moves.length) {
            // History shrank (reset) — rebuild once.
            log.innerHTML = '';
            this._loggedMoves = 0;
        }
        const start = this._loggedMoves || 0;
        if (start === 0) log.innerHTML = '';
        // Append whole pairs; a trailing lone white move creates its own row
        // and the black reply fills it in (no rebuild).
        let i = start - (start % 2);
        if (start % 2 === 1) {
            // Odd start means the last pair row is missing its black move.
            const lastRow = log.lastElementChild;
            if (lastRow && moves[i + 1]) {
                const w = document.createElement('span');
                void w;
                lastRow.insertAdjacentHTML('beforeend', this._fmtLogMove(moves[i + 1]));
                this._loggedMoves = i + 2;
                i += 2;
            }
        }
        for (; i < moves.length; i += 2) {
            const w = moves[i], b = moves[i + 1];
            const num = Math.floor(i / 2) + 1;
            const row = document.createElement('div');
            row.className = 'move-pair';
            row.innerHTML = `<span class="move-num">${num}.</span>${this._fmtLogMove(w)}${b ? this._fmtLogMove(b) : ''}`;
            log.appendChild(row);
        }
        this._loggedMoves = moves.length;
        log.scrollTop = log.scrollHeight;
    }

    /* ══════════════════════════════════════════════════════════════
       ACTIONS
    ══════════════════════════════════════════════════════════════ */
    /* Keep both "next lesson" buttons honest: they are only usable once the
       following lesson is unlocked, and they say so when it is not. The sticky
       twin is what a phone user actually sees. */
    _syncNextLessonBtn() {
        const btn = document.getElementById('next-lesson-btn');
        const sbtn = document.getElementById('next-lesson-sticky');
        const label = document.getElementById('lesson-sticky-label');
        if (!this.currentLesson) return;
        const next = this.lessons.find((l) => l.id === this.currentLesson.id + 1);
        if (label) label.textContent = `Lesson ${this.currentLesson.id} · ${esc(this.currentLesson.title)}`;
        if (!btn && !sbtn) return;
        if (!next) {
            if (btn) { btn.disabled = true; btn.textContent = 'Last lesson ✓'; btn.title = 'Course complete'; }
            if (sbtn) { sbtn.disabled = true; sbtn.textContent = 'Cleared ✓'; }
            return;
        }
        const open = this.isOpen(next.id);
        const title = open ? `Next: ${next.title} →` : 'Finish this lesson to unlock it';
        if (btn) {
            btn.disabled = !open;
            btn.textContent = open ? title : title;
            btn.title = open ? `Jump to lesson ${next.id}` : 'Finish this lesson to unlock it';
        }
        if (sbtn) {
            sbtn.disabled = !open;
            sbtn.textContent = open ? 'Next →' : 'Locked';
            sbtn.title = title;
        }
    }

    resetBoard() {
        if (!this.currentLesson) return;
        this.cpuBusy = false;
        this.game.pendingPromotion = null;
        this._initBoard(this.currentLesson);
        const picker = document.getElementById('promotion-picker');
        if (picker) { picker.innerHTML = ''; picker.classList.add('hidden'); }
        const el = document.getElementById('exercise-instruction');
        const ex = this.currentLesson.exercise;
        if (el && ex) {
            el.innerHTML = this._stepText(ex, 0); el.style.color = '';
            const box = el.closest('.exercise-instructions');
            if (box) { box.style.background = ''; box.style.borderColor = ''; }
        }
        document.querySelectorAll('#complete-btn, #complete-btn-sticky').forEach((btn) => {
            if (!this.isFreeGame) {
                btn.disabled = true;
                btn.title = 'Finish the exercise move first';
            }
        });
        this._fb(this.isFreeGame ? 'Board reset. You are White — make your first move!' : 'Board reset. Start fresh!', 'info');
        this._updateTurnUI();
        this._syncNextLessonBtn();
    }

    /* Advance to the following lesson from the board itself. Enabled only
       when that lesson is already unlocked (isOpen), so it can never skip a
       locked step; on the last lesson it returns to the grid. */
    _nextLessonFromBoard() {
        if (!this.currentLesson) return;
        const next = this.lessons.find((l) => l.id === this.currentLesson.id + 1);
        if (!next || !this.isOpen(next.id)) {
            this._fb(next ? 'Finish this lesson first — then the next one unlocks.' : 'That was the last lesson!', 'info');
            return;
        }
        this.openLesson(next.id);
    }

    markComplete() {
        if (!this.currentLesson) return;
        // Exercise lessons (1-9) require the correct move first.
        // The button is disabled until then, but guard here too for
        // direct calls / keyboard / automation.
        if (!this.isFreeGame && !this.exerciseDone) {
            this._fb('Finish the exercise move first — then complete the lesson.', 'error');
            return;
        }
        this.markDone(this.currentLesson.id);
        this.snd.playSuccess();
        // Complete Lesson returns to the grid; the board's own "Next lesson"
        // button then lights up so continuing is one click from either place.
        this.showLessons();
    }

    /* ══════════════════════════════════════════════════════════════
       NAVIGATION
    ══════════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════════
       ONLINE PLAY — lobby, host-authoritative P2P sessions, ratings
       Playbook mapping (no backend here): host tab = pinned authority
       (§6-D2), ply-tagged wire moves (§4), host-owned lazy clocks with
       capped lag credit (§6-D3), idempotent per-game Elo writes (§6-D4).
    ══════════════════════════════════════════════════════════════ */
    static onlineControls() {
        return [
            { id: 'bullet', name: 'Bullet', label: '1+0', base: 60000, inc: 0 },
            { id: 'blitz',  name: 'Blitz',  label: '5+0', base: 300000, inc: 0 },
            { id: 'rapid',  name: 'Rapid',   label: '10+0', base: 600000, inc: 0 }
        ];
    }
    // Rating bucket from estimated duration: base + 40×increment.
    static _catFor(base, inc) {
        const dur = base / 60000 + 40 * (inc / 60000);
        return dur < 3 ? 'bullet' : dur < 8 ? 'blitz' : 'rapid';
    }
    static _classic(id) {
        return { bullet: { base: 60000, inc: 0 }, blitz: { base: 300000, inc: 0 }, rapid: { base: 600000, inc: 0 } }[id] || null;
    }
    // Sanitize any control (lobby wheels, wire, old saves): only listed
    // base/increment values survive; the category is always RECOMPUTED
    // from duration so a wrong bucket can never smuggle through.
    _cleanControl(o) {
        let base = 300000, inc = 0;
        if (typeof o === 'string') {
            const c = ChessCourseApp._classic(o);
            if (c) { base = c.base; inc = c.inc; }
        } else if (o && typeof o === 'object') {
            if ([60000, 120000, 180000, 300000, 600000, 900000, 1800000].includes(o.base)) base = o.base;
            if ([0, 1000, 2000, 3000, 5000, 10000].includes(o.inc)) inc = o.inc;
        }
        const id = ChessCourseApp._catFor(base, inc);
        return { id, name: id[0].toUpperCase() + id.slice(1), label: `${Math.round(base / 60000)}+${Math.round(inc / 1000)}`, base, inc };
    }
    _controlFor(minutes, sec) {
        const m = [1, 2, 3, 5, 10, 15, 30].includes(minutes) ? minutes : 5;
        const s = [0, 1, 2, 3, 5, 10].includes(sec) ? sec : 0;
        return { ...this._cleanControl({ base: m * 60000, inc: s * 1000 }), minutes: m, incSec: s };
    }
    _wheelSummaryHTML(cur, signed) {
        const rating = signed ? OnlineRatings.get(this.userId, cur.id) : '–';
        return `<span class="ws-cat">${cur.name}</span><span class="ws-label">${cur.label}</span><span class="ws-rating">${rating}</span>`;
    }
    _onlineControl() {
        let m = 5, s = 0;
        try { const c = JSON.parse(localStorage.getItem('cc_control') || 'null'); if (c) { m = c.m; s = c.s; } } catch (_) {}
        return this._controlFor(m, s);
    }

    showOnline() {
        this._go('online-screen');
        if (this.online && (this.online.phase === 'play' || this.online.phase === 'over')) this._renderOnlineGame();
        else this._renderOnlineLobby();
    }

    _meTag() {
        const u = this._clerk?.user;
        const cats = {};
        ChessCourseApp.onlineControls().forEach(c => { cats[c.id] = OnlineRatings.get(this.userId, c.id); });
        // The rating we advertise over the wire must be for THIS game's
        // control (a mid-game lobby-wheel change must not mislabel it).
        const cat = (this.online && this.online.control && this.online.control.id)
            ? this.online.control.id : this._onlineControl().id;
        return {
            id: this.userId || 'guest',
            name: u ? (u.fullName || u.username || 'Player') : 'Guest',
            img: (u && (u.imageUrl || u.profileImageUrl || u.avatar)) || null,
            ratings: cats,
            rating: cats[cat]
        };
    }
    // Opponent's rating for THIS game's control (never the lobby's).
    _oppRatingFor() {
        const s = this.online;
        const cat = s?.control.id || 'blitz';
        const o = s?.opp || {};
        if (o.ratings && typeof o.ratings[cat] === 'number') return o.ratings[cat];
        if (typeof o.rating === 'number' && isFinite(o.rating)) return o.rating;
        return OnlineRatings.START;
    }

    /* ── Lobby ── */
    _renderOnlineLobby() {
        const box = document.getElementById('online-content');
        if (!box) return;
        this._stopOnlineTick();
        if (typeof OnlineNet !== 'undefined' && !OnlineNet.available) {
            box.innerHTML = `<div class="feedback info">Loading real-time engine…</div>`;
            OnlineNet.ensure().then(
                () => { if (document.getElementById('online-content')) this._renderOnlineLobby(); },
                () => {
                    const b2 = document.getElementById('online-content');
                    if (b2) b2.innerHTML = `<div class="feedback error">Online play needs the network library, which did not load. Check your connection and reopen this tab.</div>`;
                }
            );
            return;
        }
        const signed = !!(this._clerk && this._clerk.user);
        let stored = { m: 5, s: 0 };
        try { const c = JSON.parse(localStorage.getItem('cc_control') || 'null'); if (c) stored = c; } catch (_) {}
        const cur = this._controlFor(stored.m, stored.s);
        const mins = [1, 2, 3, 5, 10, 15, 30], secs = [0, 1, 2, 3, 5, 10];
        const wheel = (kind, values, current, fmt) => `
            <div class="wheel-col">
                <span class="wheel-cap">${kind === 'min' ? 'Minutes' : 'Increment (sec)'}</span>
                <div class="wheel-frame">
                    <div class="wheel" id="wheel-${kind}" role="listbox" tabindex="0" aria-label="${kind === 'min' ? 'Base minutes' : 'Increment seconds'}">
                        ${values.map((v, i) => `<button role="option" id="w${kind}-${i}" data-wheel="${kind}" data-val="${v}" aria-selected="${v === current}">${fmt(v)}</button>`).join('')}
                    </div>
                    <div class="wheel-band" aria-hidden="true"></div>
                </div>
            </div>`;
        const board = OnlineRatings.board(cur.id).map((p, i) =>
            `<div class="board-row"><span class="board-rank">${i + 1}</span><span class="board-name">${esc(p.name)}</span><span class="board-rating">${p.rating ?? '–'}</span></div>`).join('')
            || '<p class="board-empty">No rated players on this device yet — finish an online game to open the board.</p>';
        box.innerHTML = `
            <div class="online-lobby">
                ${signed ? '' : `<div class="exercise-instructions"><h4>Sign in to play online</h4><p>Online games are rated, so every player needs an identity. <button class="linklike"
           data-action="profile-signin">Sign in / Join</button></p></div>`}
                <div class="dashboard-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Time control</h4>
                    <div class="wheel-wrap">
                        ${wheel('min', mins, cur.minutes ?? 5, (v) => v)}
                        ${wheel('inc', secs, cur.incSec ?? 0, (v) => v)}
                        <div class="wheel-summary" id="wheel-summary">${this._wheelSummaryHTML(cur, signed)}</div>
                    </div>
                </div>
                <div class="dashboard-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Play a friend</h4>
                    <p class="lobby-hint">Share a 6-letter code. Your tabs connect directly; the host's tab validates every move and owns both clocks. Dropped connections auto-rejoin with the same code, and every move is saved so a dead tab can resume.</p>
                    <div class="lobby-actions">
                        <button class="btn-primary" data-action="online-host" ${signed ? '' :
                'disabled'}>Create game code</button>
                        <div class="join-row">
                            <input id="join-code" class="join-input" maxlength="6" placeholder="CODE" autocomplete="off" spellcheck="false">
                            <button class="btn-secondary" data-action="online-join" ${signed ? '' :
                'disabled'}>Join</button>
                        </div>
                    </div>
                    ${(() => {
                        const lh = signed ? this._lastHosted() : null;
                        const lj = signed ? this._lastJoined() : null;
                        let h = '';
                        if (lh) h += `<div class="lobby-actions"><button class="btn-secondary" data-action="online-host-code" data-code="${lh.code}">Re-host ${esc(lh.code)} — restore where you left off</button></div>`;
                        if (lj && (!lh || lj !== lh.code)) h += `<div class="lobby-actions"><button class="btn-secondary" data-action="online-join-code" data-code="${lj}">Rejoin ${esc(lj)}</button></div>`;
                        return h;
                    })()}
                    <div id="online-lobby-status" class="feedback info" style="display:none"></div>
                </div>
                <div class="dashboard-section">
                    <h4 id="wheel-board-head" style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Device leaderboard — ${cur.name}</h4>
                    <div class="board-list" id="wheel-board-list">${board}</div>
                    <p class="lobby-hint">Every player this device has met, sorted by rating. A shared global board needs the backend from the system design; this one never leaves your browser.</p>
                </div>
                <p class="lobby-hint" style="text-align:center">DoChess ${ChessCourseApp.APP_VERSION} · both players need the same version — refresh if your opponent is told to.</p>
            </div>`;
        this._bindWheels();
    }

    /* ── iPhone-style wheel picker: two snap columns ── */
    _bindWheels() {
        ['min', 'inc'].forEach(kind => {
            const el = document.getElementById('wheel-' + kind);
            if (!el || el.dataset.bound) return;
            el.dataset.bound = '1';
            const values = kind === 'min' ? [1, 2, 3, 5, 10, 15, 30] : [0, 1, 2, 3, 5, 10];
            const opts = [...el.querySelectorAll('[role="option"]')];
            const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const centerOn = (opt, smooth) => {
                el.scrollTo({ top: opt.offsetTop - el.clientHeight / 2 + opt.clientHeight / 2, behavior: smooth && !reduced ? 'smooth' : 'auto' });
            };
            const paint = () => {
                const mid = el.scrollTop + el.clientHeight / 2;
                opts.forEach(o => {
                    const t = (o.offsetTop + o.clientHeight / 2 - mid) / el.clientHeight;
                    if (!reduced) o.style.transform = `rotateX(${(-t * 32).toFixed(1)}deg) scale(${(1 - Math.min(0.22, Math.abs(t) * 0.3)).toFixed(3)})`;
                    o.style.opacity = (1 - Math.min(0.55, Math.abs(t) * 0.9)).toFixed(2);
                });
            };
            const select = (val, fromUser) => {
                const cur = el.querySelector('[aria-selected="true"]');
                if (cur && cur.dataset.val === String(val)) { paint(); return; }
                opts.forEach(o => o.setAttribute('aria-selected', o.dataset.val === String(val) ? 'true' : 'false'));
                el.setAttribute('aria-activedescendant', `w${kind}-${values.indexOf(val)}`);
                this._saveWheelSelection();
                if (fromUser) { try { navigator.vibrate && navigator.vibrate(5); } catch (_) {} }
                paint();
            };
            // Init: center stored value instantly, then paint once.
            const init = opts.find(o => o.getAttribute('aria-selected') === 'true') || opts[0];
            el.scrollTop = init.offsetTop - el.clientHeight / 2 + init.clientHeight / 2;
            paint();
            let raf = 0;
            el.addEventListener('scroll', () => {
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    const mid = el.scrollTop + el.clientHeight / 2;
                    let best = opts[0], bd = Infinity;
                    opts.forEach(o => {
                        const d = Math.abs(o.offsetTop + o.clientHeight / 2 - mid);
                        if (d < bd) { bd = d; best = o; }
                    });
                    select(parseInt(best.dataset.val, 10), true);
                });
            }, { passive: true });
            el.addEventListener('click', (e) => {
                const o = e.target.closest('[role="option"]');
                if (o) { centerOn(o, true); select(parseInt(o.dataset.val, 10), true); }
            });
            el.addEventListener('keydown', (e) => {
                const cur = values.indexOf(parseInt((el.querySelector('[aria-selected="true"]') || {}).dataset?.val, 10));
                const at = cur < 0 ? 0 : cur;
                let to = null;
                if (e.key === 'ArrowUp') to = Math.max(0, at - 1);
                else if (e.key === 'ArrowDown') to = Math.min(values.length - 1, at + 1);
                else if (e.key === 'PageUp') to = Math.max(0, at - 3);
                else if (e.key === 'PageDown') to = Math.min(values.length - 1, at + 3);
                else if (e.key === 'Home') to = 0;
                else if (e.key === 'End') to = values.length - 1;
                if (to !== null) { e.preventDefault(); centerOn(opts[to], true); select(values[to], true); }
            });
            // Pointer drag-to-scroll for desktop mice. (No setPointerCapture:
            // capturing retargets the click to the wheel itself, which would
            // break option taps. Touch scrolling is native and needs no help.)
            let drag = null;
            el.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, top: el.scrollTop }; });
            el.addEventListener('pointermove', (e) => { if (drag) el.scrollTop = drag.top - (e.clientY - drag.y); });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => { drag = null; }));
        });
    }
    _saveWheelSelection() {
        const min = document.querySelector('#wheel-min [aria-selected="true"]');
        const inc = document.querySelector('#wheel-inc [aria-selected="true"]');
        if (!min || !inc) return;
        const m = parseInt(min.dataset.val, 10), s = parseInt(inc.dataset.val, 10);
        try { localStorage.setItem('cc_control', JSON.stringify({ m, s })); } catch (_) {}
        const cur = this._controlFor(m, s);
        const sum = document.getElementById('wheel-summary');
        if (sum) sum.innerHTML = this._wheelSummaryHTML(cur, !!(this._clerk && this._clerk.user));
        const head = document.getElementById('wheel-board-head');
        if (head) head.textContent = `Device leaderboard — ${cur.name}`;
        const list = document.getElementById('wheel-board-list');
        if (list) {
            const rows = OnlineRatings.board(cur.id).map((p, i) =>
                `<div class="board-row"><span class="board-rank">${i + 1}</span><span class="board-name">${esc(p.name)}</span><span class="board-rating">${p.rating ?? '–'}</span></div>`).join('')
                || '<p class="board-empty">No rated players on this device yet — finish an online game to open the board.</p>';
            list.innerHTML = rows;
        }
    }

    _lastHosted() {
        try {
            const c = JSON.parse(localStorage.getItem('cclast') || 'null');
            if (!c || !c.code || !c.gameId) return null;
            const rec = (typeof OnlineStore !== 'undefined') ? OnlineStore.loadGame(c.gameId) : null;
            if (rec && !rec.result && rec.moves) return { code: c.code, rec };
        } catch (_) {}
        return null;
    }

    async _onlineHost(fixedCode) {
        if (!this._clerk?.user) return;
        this._onlineCleanup();
        const control = this._onlineControl();
        // Re-hosting a code resumes its unfinished game (§6 recovery);
        // a fresh code starts epoch 1 via nextEpoch below.
        let resumeRec = null;
        if (fixedCode) {
            const lh = this._lastHosted();
            if (lh && lh.code === fixedCode) resumeRec = lh.rec;
        }
        const code = fixedCode || OnlineNet.makeCode();
        this.online = { phase: 'waiting', role: 'host', code, control, epoch: 0, resumed: false, net: new OnlineNet((t, m, c) => this._onNetMsg(t, m, c)) };
        this._renderOnlineWaiting(code, resumeRec ? 'Session found — waiting for your opponent to rejoin…' : 'Waiting for your friend to join with this code…');
        try {
            await this.online.net.host(code);
            this.online.epoch = OnlineStore.nextEpoch(code);
            if (resumeRec) this._resumeOnlineSession(resumeRec);
        } catch (e) {
            if (e && e.message === 'taken' && !fixedCode) { this._onlineHost(); return; }
            this._onlineLobbyMsg('Could not open a game. Check your connection and try again.', 'error');
            this.online.phase = 'lobby'; this.online.net.destroy(); this.online.net = null;
        }
    }

    // Rebuild a dead host tab from its durable log (§5/§6): replay moves,
    // restore clocks with turn-start reset to now (outage pauses the clock —
    // the documented fair policy), wait for the joiner on the same code.
    _resumeOnlineSession(rec) {
        const s = this.online;
        try {
            const control = this._cleanControl(rec.control && rec.control.base ? rec.control : rec.control);
            s.control = control;
            s.gameId = rec.gameId;
            s.myColor = rec.myColor || 'white';
            s.oppColor = s.myColor === 'white' ? 'black' : 'white';
            s.opp = rec.opp || { id: 'guest', name: 'Friend' };
            s.unrated = !!(this.userId && this.userId !== 'guest' && s.opp.id && s.opp.id !== 'guest' && s.opp.id === this.userId);
            s.engine = new ChessGame();
            (rec.moves || []).forEach(m => {
                s.engine.movePiece(s.engine.algebraicToCoords(m.from), s.engine.algebraicToCoords(m.to), m.promo || null);
            });
            s.ply = s.engine.moveHistory.length;
            s.sel = null; s.legal = []; s.pendingPromo = null;
            s.result = null; s.reason = null; s.phase = 'waiting';
            s.appliedMids = new Set(); s.pendingIntent = null;
            s.rematchMe = false; s.rematchOpp = false; s.peerGone = false;
            const c = rec.clocks || { w: control.base, b: control.base, side: s.engine.currentPlayer };
            s.clock = { w: c.w, b: c.b, side: c.side, turnStarted: performance.now() };
            s.resumed = true;
            this._startOnlineTick();
            this._startOnlinePing();
            this._renderOnlineWaiting(s.code, `Restored at move ${Math.ceil(s.ply / 2)} — waiting for your opponent to rejoin…`);
        } catch (_) { s.resumed = false; }
    }

    _waitFor(cond, ms) {
        return new Promise((resolve, reject) => {
            const t0 = Date.now();
            const poll = () => {
                let ok = false;
                try { ok = !!cond(); } catch (_) {}
                if (ok) return resolve(true);
                if (Date.now() - t0 > ms) return reject(new Error('timeout'));
                setTimeout(poll, 200);
            };
            poll();
        });
    }

    async _onlineJoin(codeOverride, isRejoin) {
        if (!this._clerk?.user) return;
        if (this.online && this.online.phase === 'joining') return; // no double sessions
        const code = codeOverride || OnlineNet.normalizeCode(document.getElementById('join-code')?.value);
        if (code.length !== 6) { this._onlineLobbyMsg('Enter the 6-letter code from your friend.', 'error'); return; }
        this._onlineCleanup();
        const control = this._onlineControl();
        this.online = { phase: 'joining', role: 'join', code, control, epoch: 0, net: new OnlineNet((t, m, c) => this._onNetMsg(t, m, c)) };
        // Retry loop: public rendezvous can be slow or throttle bursts;
        // each attempt gets a fresh peer, and the user sees the attempt.
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (!this.online || this.online.phase !== 'joining') return;
            this._renderOnlineWaiting(code, attempt === 1 ? 'Calling the host…' : `Calling the host… (attempt ${attempt} of 3)`);
            try {
                const conn = await this.online.net.join(code);
                if (!this.online || this.online.phase !== 'joining') return;
                this.online.conn = conn;
                this.online.net.send(conn, { type: 'hello', v: ChessCourseApp.APP_VERSION, code, rejoin: !!isRejoin, user: this._meTag() });
                await this._waitFor(() => this.online && this.online.phase === 'play', 10000);
                return; // welcome handler moved us into the game
            } catch (e) {
                // Unknown code: fail fast every time — no host will
                // ever appear for it, so retries only waste a minute.
                if (e && e.message === 'not-found') {
                    this._onlineLeave();
                    this._onlineLobbyMsg('No game with that code is online.', 'error');
                    return;
                }
            }
        }
        if (this.online && this.online.phase === 'joining') {
            this._onlineLeave();
            this._onlineLobbyMsg('Host is not answering. Check the code and your connection, then try again.', 'error');
        }
    }

    _lastJoined() {
        try {
            const c = JSON.parse(localStorage.getItem('ccjoin') || 'null');
            if (c && c.code && c.code.length === 6) return c.code;
        } catch (_) {}
        return null;
    }

    _renderOnlineWaiting(code, msg) {
        const box = document.getElementById('online-content');
        if (!box) return;
        box.innerHTML = `
            <div class="dashboard-section waiting-card">
                <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Game code</h4>
                <div class="game-code">${code}</div>
                <p class="lobby-hint">${msg}</p>
                <div class="lobby-actions"><button class="btn-secondary"
           data-action="online-leave">Cancel</button></div>
            </div>`;
    }

    _onlineLobbyMsg(msg, type = 'info') {
        const el = document.getElementById('online-lobby-status');
        if (el) { el.style.display = ''; el.textContent = msg; el.className = `feedback ${type}`; return; }
        this._renderOnlineLobby();
        const el2 = document.getElementById('online-lobby-status');
        if (el2) { el2.style.display = ''; el2.textContent = msg; el2.className = `feedback ${type}`; }
    }

    _onlineLeave() {
        const s = this.online;
        // Host leaving a live game warns the peer first so it aborts
        // cleanly instead of hanging on a dead session.
        if (s && s.role === 'host' && s.phase === 'play' && !s.result && s.conn) {
            try { s.net.send(s.conn, { type: 'host_left', epoch: s.epoch || 0 }); } catch (_) {}
        }
        this._clearRejoin();
        this._onlineCleanup();
        this.online = null;
        this._renderOnlineLobby();
    }

    _onlineCleanup() {
        this._stopOnlineTick();
        try { if (this.online?.net) this.online.net.destroy(); } catch (_) {}
        try { if (this.online?.pingTimer) clearInterval(this.online.pingTimer); } catch (_) {}
    }
    _stopOnlineTick() {
        try { if (this._onlineTick) clearInterval(this._onlineTick); } catch (_) {}
        this._onlineTick = null;
    }

    /* ── Clocks: host decides flags; everyone renders (§6-D3) ── */
    _startOnlineTick() {
        this._stopOnlineTick();
        this._onlineTick = setInterval(() => {
            const s = this.online;
            if (!s || s.phase !== 'play' || s.result) return;
            if (s.role === 'host') {
                const side = s.clock.side, key = side === 'white' ? 'w' : 'b';
                if (s.clock[key] - (performance.now() - s.clock.turnStarted) <= 0) {
                    const foe = side === 'white' ? 'black' : 'white';
                    if (this._onlyKing(s.engine, foe)) this._onlineFinish('draw', 'material');
                    else { s.clock[key] = 0; this._onlineFinish(foe === s.myColor ? 'win' : 'loss', 'timeout'); }
                    return;
                }
                // Forfeit: opponent gone past the grace window with the game
                // undecided — the survivor takes the win (unrated if <2 plies
                // via the abort rule in _onlineFinish).
                if (s.peerGone && s.dcSince && performance.now() - s.dcSince > 45000) {
                    this._onlineFinish('win', 'forfeit');
                    return;
                }
            }
            this._paintOnlineClocks();
        }, 100);
    }
    _onlyKing(engine, color) {
        const want = color === 'white' ? 'K' : 'k';
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
            const p = engine.board[r][c];
            if (p && p !== want && engine.colorOf(p) === color) return false;
        }
        return true;
    }
    _paintOnlineClocks() {
        const s = this.online;
        if (!s) return;
        const now = performance.now();
        const left = (color) => {
            const key = color === 'white' ? 'w' : 'b';
            let ms = s.clock[key];
            if (s.phase === 'play' && !s.result && s.clock.side === color) ms -= (now - s.clock.turnStarted);
            return Math.max(0, ms);
        };
        const fmt = (ms) => { const t = Math.ceil(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
        const top = document.getElementById('oclock-top'), bot = document.getElementById('oclock-bottom');
        const active = s.phase === 'play' && !s.result ? s.clock.side : null;
        if (top) { top.textContent = fmt(left(s.oppColor)); top.classList.toggle('low', left(s.oppColor) < 20000); top.classList.toggle('active-turn', active === s.oppColor); }
        if (bot) { bot.textContent = fmt(left(s.myColor)); bot.classList.toggle('low', left(s.myColor) < 20000); bot.classList.toggle('active-turn', active === s.myColor); }
    }
    _startOnlinePing() {
        const s = this.online;
        if (!s) return;
        try { if (s.pingTimer) clearInterval(s.pingTimer); } catch (_) {}
        const ping = () => {
            try {
                if (!s.conn) return;
                // Identity heartbeat: the photo/name may have been missing
                // at the handshake (auth still resolving) or a one-shot
                // profile push may have raced a reconnect. Both sides
                // resend every cycle; the peer repaints only on change.
                const prof = { type: 'profile', v: ChessCourseApp.APP_VERSION, user: this._meTag(), epoch: s.epoch || 0 };
                if (s.role === 'host') {
                    s.net.send(s.conn, { type: 'ping', t: performance.now() });
                    // Periodic clock sync: a lost or crawling 'move' echo can
                    // otherwise leave the joiner ticking the wrong side for a
                    // whole game. Host values only — never accepted from peer.
                    // ply rides along so the joiner can drop syncs from before
                    // its own optimistic move (they carry the old side).
                    if (s.phase === 'play' && !s.result) {
                        s.net.send(s.conn, { type: 'clocks', epoch: s.epoch || 0, ply: s.ply, clocks: this._clockSnapshot() });
                    }
                }
                s.net.send(s.conn, prof);
            } catch (_) {}
        };
        ping();
        s.pingTimer = setInterval(ping, 5000);
    }

    /* ── Wire protocol (skill §4, adapted) ── */
    _onNetMsg(type, msg, conn) {
        const s = this.online;
        if (!s) return;
        if (type === '__closed') { this._onPeerGone(conn); return; }
        if (type === 'ping') { s.net.send(conn, { type: 'pong', t: msg.t }); return; }
        if (type === 'pong') {
            if (s.role === 'host') s.rtt = Math.max(0, performance.now() - msg.t);
            return;
        }
        if (s.role === 'host') this._hostOnMsg(type, msg, conn);
        else this._joinOnMsg(type, msg, conn);
    }

    // Epoch fencing (§4): messages from a deposed (older-epoch) writer lose.
    _epochOk(msg) {
        const s = this.online;
        if (!msg || typeof msg.epoch !== 'number') return true;
        if (msg.epoch < (s.epoch || 0)) return false;
        if (msg.epoch > (s.epoch || 0)) s.epoch = msg.epoch;
        return true;
    }
    _hostOnMsg(type, msg, conn) {
        const s = this.online;
        if (type === 'hello') {
            if (msg.code !== s.code || (s.phase !== 'waiting' && s.phase !== 'play')) { try { conn.close(); } catch (_) {} return; }
            s.conn = conn;
            s.opp = sanitizePeerUser(msg.user);
            this._notePeerVersion(msg);
            if (s.resumed) {
                // Rejoining joiner meets the restored session: same game,
                // same colors, full snapshot. Epoch already bumped at re-host.
                s.resumed = false; s.peerGone = false;
                s.phase = 'play';
                this._clearRejoin();
                s.net.send(conn, { type: 'welcome', v: ChessCourseApp.APP_VERSION, epoch: s.epoch || 0, game_id: s.gameId, color: s.oppColor, control: { id: s.control.id, base: s.control.base, inc: s.control.inc }, rated: true, user: this._meTag(), state: this._buildOnlineState() });
                this._flushPending();
                this._startOnlineTick();
                this._startOnlinePing();
                this._renderOnlineGame();
                return;
            }
            // A hello during a LIVE game is a rejoin, not a new game —
            // but only from the same player (no spectators on this path).
            if (s.phase === 'play') {
                const same = msg.user && msg.user.id && s.opp && msg.user.id === s.opp.id;
                if (!same) { try { conn.close(); } catch (_) {} return; }
                s.conn = conn; s.peerGone = false;
                this._clearRejoin();
                s.net.send(conn, { type: 'welcome', v: ChessCourseApp.APP_VERSION, epoch: s.epoch || 0, game_id: s.gameId, color: s.oppColor, control: { id: s.control.id, base: s.control.base, inc: s.control.inc }, rated: true, user: this._meTag(), state: this._buildOnlineState() });
                this._flushPending();
                this._onlineStatus();
                this._drawOnline();
                return;
            }
            if (s.phase === 'over') {
                // Late hello after the game ended: converge the peer on the
                // final verdict instead of leaving them retrying forever.
                const pr = s.result === 'win' ? 'loss' : s.result === 'loss' ? 'win' : 'draw';
                s.net.send(conn, { type: 'game_over', result: pr, reason: s.reason, epoch: s.epoch || 0 });
                s.net.send(conn, { type: 'state', epoch: s.epoch || 0, state: this._buildOnlineState() });
                try { conn.close(); } catch (_) {}
                return;
            }
            if (s.phase !== 'waiting') { try { conn.close(); } catch (_) {} return; }
            const myColor = Math.random() < 0.5 ? 'white' : 'black';
            this._startOnlineGame(myColor, s.opp);
            try { localStorage.setItem('cclast', JSON.stringify({ code: s.code, gameId: s.gameId })); } catch (_) {}
            s.net.send(conn, { type: 'welcome', v: ChessCourseApp.APP_VERSION, epoch: s.epoch || 0, game_id: s.gameId, color: s.oppColor, control: { id: s.control.id, base: s.control.base, inc: s.control.inc }, rated: true, user: this._meTag(), state: this._buildOnlineState() });
            this._renderOnlineGame();
            return;
        }
        if (!s.conn || conn !== s.conn) return;
        if (type === 'profile') {
            if (msg.user) {
                s.opp = sanitizePeerUser(msg.user);
                this._notePeerVersion(msg);
                this._paintOppCard();
                // A post-game heartbeat carries the opponent's NEW rating
                // after their own Elo write — re-note it so the device
                // leaderboard refreshes instantly for both players.
                if (s.phase === 'over' && s.control && s.opp?.id) {
                    OnlineRatings.notePlayer(s.opp.id, s.opp.name, s.control.id, s.opp.rating);
                }
            }
            return;
        }
        if (type === 'sync_request') { s.net.send(conn, { type: 'state', epoch: s.epoch || 0, state: this._buildOnlineState() }); return; }
        if (type === 'resign') { this._onlineFinish('win', 'resignation'); return; }
        if (type === 'draw_offer') { this._onlineDrawPrompt(); return; }
        if (type === 'draw_accept') { this._onlineFinish('draw', 'agreement'); return; }
        if (type === 'draw_decline') { this._onlineStatus('Draw declined. Your move!'); return; }
        if (type === 'rematch_want') {
            s.rematchOpp = true;
            if (s.rematchMe) { this._rematchStart(); return; }
            this._rematchPrompt(s.opp?.name || 'Your opponent');
            this._drawOnline();
            return;
        }
        if (type === 'rematch_decline') {
            s.rematchMe = false; s.rematchOpp = false;
            this._onlineStatus('Rematch declined.');
            return;
        }
        if (type === 'move') this._hostApplyPeerMove(msg);
    }

    _joinOnMsg(type, msg) {
        const s = this.online;
        if (type === 'welcome') {
            // Fresh join, or a rejoin meeting a live (possibly resumed) session.
            if (s.phase !== 'joining' && !(s.phase === 'play' && s.peerGone)) return;
            if (typeof msg.epoch === 'number') s.epoch = msg.epoch;
            s.gameId = msg.game_id;
            s.opp = sanitizePeerUser(msg.user);
            this._notePeerVersion(msg);
            this._startOnlineGame(msg.color === 'white' ? 'white' : 'black', s.opp, this._cleanControl(msg.control), true);
            this._applyOnlineState(msg.state);
            s.peerGone = false;
            this._clearRejoin();
            this._flushPending();
            this._renderOnlineGame();
            return;
        }
        if (type === 'host_left') {
            if (s.phase === 'play' && !s.result) this._onlineAbort('Host left the game.');
            return;
        }
        if (!this._epochOk(msg)) return;
        if (s.phase !== 'play' && s.phase !== 'over') return;
        if (type === 'clocks') {
            // Host sync only; never accept clock values from anyone else,
            // and never touch the engine here — display convergence only.
            // A sync stamped with another ply is from the wrong side of a
            // move: one from before my move would revert my optimistic flip
            // and drain my own clock again; one from after a move I have
            // not applied yet would flip early. Skip both.
            if (typeof msg.ply === 'number' && msg.ply !== s.ply) return;
            if (s.phase === 'play' && !s.result && msg.clocks) this._snapOnlineClocks(msg.clocks);
            return;
        }
        if (type === 'profile') {
            if (msg.user) {
                s.opp = sanitizePeerUser(msg.user);
                this._notePeerVersion(msg);
                this._paintOppCard();
                // A post-game heartbeat carries the opponent's NEW rating
                // after their own Elo write — re-note it so the device
                // leaderboard refreshes instantly for both players.
                if (s.phase === 'over' && s.control && s.opp?.id) {
                    OnlineRatings.notePlayer(s.opp.id, s.opp.name, s.control.id, s.opp.rating);
                }
            }
            return;
        }
        if (type === 'move') {
            // My own move echoed back (ply === s.ply): already applied, but
            // the echo carries the host's authoritative clocks — snap them.
            // Without this the display sticks to the pre-move side until the
            // opponent's next move, so each device shows a different time.
            // Older echoes (ply < s.ply) carry stale values: never rewind.
            if (typeof msg.ply === 'number' && msg.ply <= s.ply) {
                if (msg.ply === s.ply && msg.clocks) this._snapOnlineClocks(msg.clocks);
                return; // idempotent: duplicate delivery = no-op
            }
            const ok = this._applyOnlineMove(msg.from, msg.to, msg.promo || null);
            if (!ok) { s.net.send(s.conn, { type: 'sync_request' }); return; }
            s.ply = msg.ply; s.viewPly = null;
            if (msg.clocks) this._snapOnlineClocks(msg.clocks);
            this._drawOnline();
            this._onlineAfterMove(false);
            return;
        }
        if (type === 'state') { this._applyOnlineState(msg.state); this._flushPending(); this._drawOnline(); this._onlineAfterMove(false); return; }
        if (type === 'rejected') { this._applyOnlineState(msg.state); this._drawOnline(); this._onlineStatus('Illegal move — board resynced with the host.'); return; }
        if (type === 'game_over') {
            if (msg.reason === 'aborted') { this._onlineAbort('Game aborted — too short to rate.'); return; }
            this._onlineFinish(msg.result, msg.reason, true); return;
        }
        if (type === 'draw_offer') { this._onlineDrawPrompt(); return; }
        if (type === 'draw_accept') { this._onlineFinish('draw', 'agreement', true); return; }
        if (type === 'draw_decline') { this._onlineStatus('Draw declined. Your move!'); return; }
        if (type === 'rematch_want') {
            s.rematchOpp = true;
            this._rematchPrompt(s.opp?.name || 'Your opponent');
            return;
        }
        if (type === 'rematch_decline') {
            s.rematchMe = false; s.rematchOpp = false;
            this._onlineStatus('Rematch declined.');
            return;
        }
        if (type === 'rematch_accept') {
            if (!this._epochOk(msg)) return;
            s.gameId = msg.game_id;
            try { localStorage.setItem('cclast', JSON.stringify({ code: s.code, gameId: s.gameId })); } catch (_) {}
            this._startOnlineGame(msg.color, s.opp, this._cleanControl(msg.control), true);
            this._applyOnlineState(msg.state);
            this._renderOnlineGame();
        }
    }

    _onPeerGone(conn) {
        const s = this.online;
        if (!s || (s.phase !== 'play' && s.phase !== 'over')) return;
        if (s.phase === 'over') return;
        // Stale duplicate connections dying must not disturb the live one.
        if (conn && s.conn && conn !== s.conn) return;
        s.peerGone = true;
        s.dcSince = performance.now();
        if (s.role === 'host') this._onlineStatus(`Your opponent disconnected — they can rejoin with code ${s.code}.`);
        else { this._onlineStatus('Connection lost — retrying…'); this._scheduleRejoin(); }
        this._drawOnline();
    }

    /* ── Session lifecycle (host = pinned authority, §6-D2) ── */
    _newGameId() { return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

    _startOnlineGame(myColor, opp, controlOrId, keepConn) {
        const s = this.online;
        const control = this._cleanControl(controlOrId !== undefined ? controlOrId : s.control);
        const selfPlay = !!(this.userId && this.userId !== 'guest' && opp && opp.id && opp.id !== 'guest' && opp.id === this.userId);
        Object.assign(s, {
            phase: 'play', myColor, oppColor: myColor === 'white' ? 'black' : 'white',
            control, opp, unrated: selfPlay,
            gameId: s.gameId && keepConn ? s.gameId : this._newGameId(),
            engine: new ChessGame(), ply: 0, sel: null, legal: [],
            pendingPromo: null, result: null, reason: null,
            rematchMe: false, rematchOpp: false, peerGone: false,
            _overShown: false, short: false, oppV: null,
            ratingDelta: null, ratingAfter: null,
            appliedMids: new Set(), pendingIntent: null,
            rtt: s.rtt || 0,
            clock: { w: control.base, b: control.base, side: 'white', turnStarted: performance.now() }
        });
        if (!keepConn && s.role === 'host' && s.control.id !== control.id) s.control = control;
        this._startOnlineTick();
        this._startOnlinePing();
    }

    _buildOnlineState() {
        const s = this.online;
        return {
            moves: s.engine.moveHistory.map(m => ({ from: m.from, to: m.to, promo: m.promotion || null })),
            clocks: this._clockSnapshot(),
            side: s.engine.currentPlayer, ply: s.ply,
            status: s.phase === 'over' ? 'over' : 'play', result: s.result, reason: s.reason
        };
    }

    _applyOnlineState(st) {
        const s = this.online;
        if (!st) return;
        s.engine.reset();
        (st.moves || []).forEach(m => {
            try {
                s.engine.movePiece(s.engine.algebraicToCoords(m.from), s.engine.algebraicToCoords(m.to), m.promo || null);
            } catch (_) {}
        });
        s.ply = st.moves ? st.moves.length : 0;
        s.sel = null; s.legal = []; s.pendingPromo = null; s.viewPly = null;
        if (st.clocks) this._snapOnlineClocks(st.clocks);
        if (st.side) s.engine.currentPlayer = st.side;
        if (st.status === 'over') { s.phase = 'over'; }
    }

    _snapOnlineClocks(c) {
        const s = this.online;
        s.clock.w = c.w; s.clock.b = c.b; s.clock.side = c.side;
        s.clock.turnStarted = performance.now();
    }

    // What each side shows RIGHT NOW (mid-turn aware). The raw stored
    // values are "remaining when the current turn started"; the peer snaps
    // them with turnStarted = now, so sending them mid-turn makes the peer
    // treat stale think-time as current and drift ahead of the host by the
    // whole turn length on every sync (seen: 0:49 vs 0:17).
    _clockSnapshot() {
        const s = this.online, c = s.clock;
        const running = s.phase === 'play' && !s.result && c;
        const el = running && c.turnStarted ? Math.max(0, performance.now() - c.turnStarted) : 0;
        const w = running && c.side === 'white' ? Math.max(0, c.w - el) : (c ? c.w : 0);
        const b = running && c.side === 'black' ? Math.max(0, c.b - el) : (c ? c.b : 0);
        return { w: Math.round(w), b: Math.round(b), side: c ? c.side : 'white' };
    }

    /* ── Moves: both sides validate with the shared engine; the host
       additionally owns clocks and broadcasts (single writer). ── */
    _applyOnlineMove(from, to, promo) {
        const s = this.online;
        try {
            // Callers pass board coords (local clicks) or algebraic (wire);
            // normalize before touching the engine.
            const fc = typeof from === 'string' ? s.engine.algebraicToCoords(from) : from;
            const tc = typeof to === 'string' ? s.engine.algebraicToCoords(to) : to;
            const legal = s.engine.getLegalMoves(fc);
            if (!legal.some(m => m[0] === tc[0] && m[1] === tc[1])) return false;
            s.engine.movePiece(fc, tc, promo || null);
            return true;
        } catch (_) { return false; }
    }

    _onlinePlayMove(from, to, promo = null) {
        const s = this.online;
        if (!s || s.phase !== 'play' || s.result) return;
        if (s.engine.currentPlayer !== s.myColor) return;
        if (!this._applyOnlineMove(from, to, promo)) return;
        const move = s.engine.moveHistory[s.engine.moveHistory.length - 1];
        s.ply = s.engine.moveHistory.length;
        s.sel = null; s.legal = []; s.viewPly = null;
        this.snd.playMove();
        this._drawOnline();
        // Client intent id (§5): retries reuse ply + move_id, so the host
        // can tell a retry from a new move. Durable append precedes any ack.
        const mid = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        if (s.role === 'host' && !s.appliedMids) s.appliedMids = new Set();
        if (s.role === 'host') s.appliedMids.add(mid);
        const msg = { type: 'move', ply: s.ply, from: move.from, to: move.to, promo: move.promotion || null, mid, epoch: s.epoch || 0 };
        this._saveOnlineSession();
        if (s.role === 'host') {
            this._hostChargeClock(s.myColor, 0);
            msg.clocks = this._clockSnapshot();
            s.net.send(s.conn, msg);
            this._onlineAfterMove(true);
        } else {
            if (!s.net.send(s.conn, msg)) s.pendingIntent = msg; // flushed on reconnect
            // Charge locally with the host's math so the frozen own-clock
            // does not keep showing pre-move time while the echo is in
            // flight (bad relay = seconds of stale time). The host's
            // authoritative values still overwrite on echo.
            if (s.clock && s.clock.side === s.myColor) {
                const el = Math.max(0, performance.now() - s.clock.turnStarted);
                const k = s.myColor === 'white' ? 'w' : 'b';
                s.clock[k] = Math.max(0, s.clock[k] - el) + s.control.inc;
            }
            // Optimistic display flip: the host authoritative echo can lag a
            // slow relay by seconds, during which the joiner would otherwise
            // watch its OWN clock drain after moving. Remaining values still
            // come only from the host snap on echo (never invented here).
            s.clock.side = s.myColor === 'white' ? 'black' : 'white';
            s.clock.turnStarted = performance.now();
            this._onlineAfterMove(false);
        }
    }

    _hostApplyPeerMove(msg) {
        const s = this.online;
        if (s.phase !== 'play' || s.result) return;
        if (!s.appliedMids) s.appliedMids = new Set();
        if (msg.mid && s.appliedMids.has(msg.mid)) {
            // Exact retry (§5): already applied — resend state, change nothing.
            s.net.send(s.conn, { type: 'state', state: this._buildOnlineState(), epoch: s.epoch || 0 });
            return;
        }
        if (typeof msg.ply === 'number' && msg.ply <= s.ply) {
            s.net.send(s.conn, { type: 'move', ply: s.ply, from: msg.from, to: msg.to, promo: msg.promo || null, clocks: this._clockSnapshot(), epoch: s.epoch || 0 });
            return; // idempotent duplicate: re-ack, change nothing
        }
        const mover = s.oppColor;
        if (s.engine.currentPlayer !== mover) {
            s.net.send(s.conn, { type: 'rejected', reason: 'not_your_turn', state: this._buildOnlineState() });
            return;
        }
        if (!this._applyOnlineMove(msg.from, msg.to, msg.promo || null)) {
            s.net.send(s.conn, { type: 'rejected', reason: 'illegal', state: this._buildOnlineState() });
            return;
        }
        s.ply = s.engine.moveHistory.length;
        if (msg.mid) s.appliedMids.add(msg.mid);
        this._saveOnlineSession();
        // Lag credit: refund measured one-way delay, capped so bad
        // connections cannot farm thinking time (§6-D3). Never raises clocks.
        const credit = Math.min((s.rtt || 0) / 2, 150);
        this._hostChargeClock(mover, credit);
        this.snd.playMove();
        s.net.send(s.conn, { type: 'move', ply: s.ply, from: msg.from, to: msg.to, promo: msg.promo || null, clocks: this._clockSnapshot() });
        this._drawOnline();
        this._onlineAfterMove(true);
    }

    // Host-only clock math: lazy remaining + turn start on the monotonic
    // clock (§6-D3). Charge = elapsed minus capped lag credit, floored at 0.
    _hostChargeClock(mover, credit) {
        const s = this.online;
        const now = performance.now();
        const elapsed = Math.max(0, now - s.clock.turnStarted);
        const key = mover === 'white' ? 'w' : 'b';
        const charge = Math.max(0, Math.min(elapsed - Math.min(credit, elapsed), s.clock[key]));
        s.clock[key] = Math.max(0, s.clock[key] - charge) + s.control.inc;
        s.clock.side = mover === 'white' ? 'black' : 'white';
        s.clock.turnStarted = now;
    }

    _onlineAfterMove(fromHost) {
        const s = this.online;
        if (!s || s.result) return;
        const status = s.engine.getGameStatus();
        if (status.startsWith('checkmate')) {
            const winner = status.split('-')[1];
            this._onlineFinish(winner === s.myColor ? 'win' : 'loss', 'checkmate', !fromHost);
        } else if (status === 'stalemate') {
            this._onlineFinish('draw', 'stalemate', !fromHost);
        } else if (status.startsWith('draw-')) {
            this._onlineFinish('draw', status, !fromHost);
        } else {
            if (status.startsWith('check-')) this.snd.playCheck();
            this._onlineStatus();
            this._drawOnline();
        }
    }

    _onlineFinish(result, reason, remote) {
        const s = this.online;
        if (!s || s.result) return; // first writer wins; duplicates are no-ops
        s.result = result; s.reason = reason; s.phase = 'over';
        s.engine.gameOver = true;
        // Short games (<2 plies) are never rated (§11), but a resignation,
        // timeout or forfeit is still somebody's decisive win/loss — only a
        // mutual non-result collapses to the aborted draw.
        const shortGame = s.engine.moveHistory.length < 2 && reason !== 'checkmate' && reason !== 'stalemate';
        s.short = shortGame;
        if (shortGame && reason !== 'resignation' && reason !== 'timeout' && reason !== 'forfeit') {
            reason = 'aborted'; // too short to rate — no rating change.
            s.reason = reason;
        }
        if (reason === 'aborted') {
            if (s.role === 'host' && !remote) {
                s.net.send(s.conn, { type: 'game_over', result: 'draw', reason: 'aborted', epoch: s.epoch || 0 });
            }
            this._onlineAbort('Game aborted — too short to rate. No rating change.');
            return;
        }
        if (s.role === 'host' && !remote) {
            s.net.send(s.conn, { type: 'game_over', result: result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw', reason, epoch: s.epoch || 0 });
        }
        // Idempotent Elo write: same game_id twice changes nothing (§6-D4).
        // Self-play is never rated: same account on both tabs. Short games
        // (<2 plies) are never rated either — the verdict still stands.
        let delta = null, rating = null;
        const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
        if (!s.unrated && !s.short) {
            const r = OnlineRatings.applyGame({ uid: this.userId, cat: s.control.id, score, oppRating: this._oppRatingFor(), gameId: s.gameId });
            if (r) { delta = r.delta; rating = r.rating; }
        }
        OnlineRatings.notePlayer(this.userId, this._meTag().name, s.control.id, OnlineRatings.get(this.userId, s.control.id));
        if (s.opp?.id) OnlineRatings.notePlayer(s.opp.id, s.opp.name, s.control.id, s.opp.rating);
        s.ratingDelta = delta; s.ratingAfter = rating;
        if (result !== 'aborted' && s.gameId) {
            OnlineRatings.pushHistory(this.userId, {
                gameId: s.gameId, control: { id: s.control.id, base: s.control.base, inc: s.control.inc }, opp: s.opp?.name || 'Opponent',
                result, plies: s.engine.moveHistory.length, delta
            });
        }
        if (result === 'win') { this.snd.playSuccess(); }
        else this.snd.playCheck();
        this._stopOnlineTick();
        s.pendingPromo = null;
        const firstOver = !s._overShown;
        s._overShown = true;
        this._renderOnlineGame();
        this._onlineStatus();
        // The result + Rematch/Review/Lobby live below the board: bring them
        // into view once per game-over or players never see the card.
        if (firstOver) {
            try {
                const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                document.getElementById('online-result')?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
            } catch (_) {}
        }
    }

    /* ── Online game view ── */
    _renderOnlineGame() {
        const s = this.online;
        const box = document.getElementById('online-content');
        if (!box || !s) return;
        const mine = s.myColor === 'white' ? 'White' : 'Black';
        const theirs = s.myColor === 'white' ? 'Black' : 'White';
        const over = s.phase === 'over';
        const rateBit = (s.ratingDelta !== null && s.ratingDelta !== undefined)
            ? ` <span class="rate-count" data-from="${s.ratingAfter - s.ratingDelta}" data-to="${s.ratingAfter}">Rating ${s.ratingDelta > 0 ? '+' : ''}${s.ratingDelta} → ${s.ratingAfter}</span>`
            : '';
        const unratedBit = (over && s.unrated) ? `<div class="feedback info">Unrated game — you are playing yourself.</div>` : '';
        const shortBit = (over && s.short && !s.unrated) ? `<div class="feedback info">Unrated game — too short to rate.</div>` : '';
        // After a rated game the You-card shows the whole change, e.g.
        // "Black · 857 → 831 (-26)" next to the result line's
        // "Rating -26 → 831".
        const youSub = (over && s.ratingDelta !== null && s.ratingDelta !== undefined)
            ? `${mine} · ${s.ratingAfter - s.ratingDelta} → ${s.ratingAfter} (${s.ratingDelta > 0 ? '+' : ''}${s.ratingDelta})`
            : `${mine} · ${OnlineRatings.get(this.userId, s.control.id)}`;
        const resultLine = !over ? '' : s.result === 'win'
            ? `<div class="feedback success">You win! ${this._reasonText(s.reason)}${rateBit}</div>${unratedBit}${shortBit}`
            : s.result === 'loss'
            ? `<div class="feedback error">You lose. ${this._reasonText(s.reason)}${rateBit}</div>${unratedBit}${shortBit}`
            : `<div class="feedback info">Draw. ${this._reasonText(s.reason)}${rateBit}</div>${unratedBit}${shortBit}`;
        box.innerHTML = `
            <div class="lesson-content">
                <div class="arena">
                    <div class="profile-card opponent" id="oprofile-opp">
                        ${this._oppCardAvatarHTML()}
                        <div class="info"><span class="name">${esc(s.opp?.name || 'Opponent')}</span><span class="sub">${theirs} · ${s.opp?.rating || ''}</span><div class="captured-row" data-cap="opp"></div></div>
                        <div class="clock" id="oclock-top" role="timer" aria-label="Opponent clock">--:--</div>
                    </div>
                    <div class="speech-bubble" id="online-status" role="status" aria-live="polite">Connecting…</div>
                    <div id="online-board-wrapper"><div id="online-board" role="group" aria-label="Online chess board"></div></div>
                    <div id="online-promo" class="promotion-picker hidden"></div>
                    <div id="online-result" role="status" aria-live="polite">${resultLine}</div>
                    <div class="profile-card player" id="oprofile-you">
                        ${this._myAvatarHTML()}
                        <div class="info"><span class="name">You</span><span class="sub">${youSub}</span><div class="captured-row" data-cap="you"></div></div>
                        <div class="clock" id="oclock-bottom" role="timer" aria-label="Your clock">--:--</div>
                    </div>
                </div>
                <div class="lesson-dashboard">
                    <div class="dashboard-section">
                        <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">${s.control.name} ${s.control.label} · Rated</h4>
                        <div class="movenav" role="group" aria-label="Step through moves">
                            <button class="icon-btn" id="mv-start" data-action="movenav" data-where="start" title="First move" aria-label="First move"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 5l-8 7 8 7"/></svg></button>
                            <button class="icon-btn" id="mv-prev" data-action="movenav" data-where="prev" title="Previous move" aria-label="Previous move"><svg viewBox="0 0 24 24"><path d="M14 5l-7 7 7 7"/></svg></button>
                            <button class="icon-btn live" id="mv-live" data-action="movenav" data-where="live" title="Back to live" aria-label="Back to live">Live</button>
                            <button class="icon-btn" id="mv-next" data-action="movenav" data-where="next" title="Next move" aria-label="Next move"><svg viewBox="0 0 24 24"><path d="M10 5l7 7-7 7"/></svg></button>
                            <button class="icon-btn" id="mv-end" data-action="movenav" data-where="end" title="Latest move" aria-label="Latest move"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 5l8 7-8 7"/></svg></button>
                            <button class="icon-btn" id="mv-flip" data-action="flip-online" title="Flip board" aria-label="Flip board"><svg viewBox="0 0 24 24"><path d="M7 4v13M7 20l-3-3M7 20l3-3M17 20V7M17 4l-3 3M17 4l3 3"/></svg></button>
                        </div>
                        <div class="move-log" id="online-log" role="log" aria-live="polite" aria-label="Online move log"><span style="color:var(--text-muted-dim)">No moves yet.</span></div>
                    </div>
                    <div class="lesson-actions" id="online-actions">
                        ${over
                            ? `<button class="btn-primary btn-glow-strong" data-action="online-rematch">Rematch</button>
                               <button class="btn-secondary" data-action="online-review">Review</button>
                               ${this._muteBtnHTML()}
                               <button class="btn-secondary" data-action="online-leave">Lobby</button>`
                            : `<button class="btn-secondary" data-action="online-draw-offer">Draw</button>
                               <button class="btn-secondary" data-action="online-resign-ask">Resign</button>
                               ${this._muteBtnHTML()}
                               <button class="btn-secondary" data-action="online-leave-ask">Leave</button>`}
                    </div>
                </div>
            </div>`;
        this._drawOnline();
        this._onlineStatus();
        this._paintOnlineClocks();
        this._bindAvatarFallback('#oprofile-opp img.avatar[data-opp-img]');
        this._bindAvatarFallback('#oprofile-you img.avatar[data-my-img]', 'you');
        this._paintVerWarn();
        this._animateRate();
        // Phones: land on the board at full size from the first paint. The
        // height-clamped board otherwise sits wherever the page happened to
        // be, looking small until the player scrolls around.
        try {
            if (s.phase === 'play' && !s.result && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
                document.getElementById('online-board-wrapper')?.scrollIntoView({ block: 'start' });
            }
        } catch (_) {}
    }

    _oppCardAvatarHTML() {
        const s = this.online;
        const name = s?.opp?.name || 'Opponent';
        if (s?.opp?.img) return this._oppImgHTML(name, s.opp.img);
        return `<div class="avatar-letter">${esc((name || 'F')[0].toUpperCase())}</div>`;
    }
    _oppImgHTML(name, src) {
        return `<img class="avatar" src="${esc(src)}" width="52" height="52" alt="${esc(name)}" data-opp-img="1">`;
    }
    // My own photo on the You-card — letter tile until auth resolves, and
    // again if the photo cannot load or the player signs out.
    _myAvatarHTML() {
        const u = this._meTag();
        if (u.img) return `<img class="avatar you" src="${esc(u.img)}" width="52" height="52" alt="${esc(u.name)}" data-my-img="1">`;
        return `<div class="avatar-letter you">${esc((u.name || 'Y')[0].toUpperCase())}</div>`;
    }
    // Targeted repaint of MY avatar (auth resolving late, sign-out mid-game)
    // without re-rendering the whole match view.
    _paintYouCard() {
        const card = document.getElementById('oprofile-you');
        if (!card) return;
        const cur = card.querySelector('img.avatar[data-my-img], .avatar-letter.you');
        const src = this._meTag().img;
        const isImg = !!cur && cur.tagName === 'IMG';
        if (!cur || !!src !== isImg || (src && cur.getAttribute('src') !== src)) {
            const fresh = this._myAvatarHTML();
            if (cur) cur.outerHTML = fresh;
            else card.insertAdjacentHTML('afterbegin', fresh);
        }
        this._bindAvatarFallback('#oprofile-you img.avatar[data-my-img]', 'you');
    }
    // Targeted repaint of the opponent card (avatar + name + color/rating).
    // Captured pieces and the clock are untouched.
    // Release skew guard: both sides stamp identity messages with the app
    // release. A missing or different tag means the peer runs older code
    // (stale cache) — say so loudly instead of misbehaving quietly.
    _notePeerVersion(msg) {
        const s = this.online;
        if (!s) return;
        const v = (msg && typeof msg.v === 'string' && msg.v) ? msg.v : 'older';
        if (s.oppV !== v) { s.oppV = v; this._paintVerWarn(); }
    }
    _paintVerWarn() {
        const s = this.online;
        const bad = !!(s && s.oppV && s.oppV !== ChessCourseApp.APP_VERSION);
        let el = document.getElementById('over-ver');
        if (!bad) { el?.remove(); return; }
        if (!el) {
            const anchor = document.getElementById('online-board-wrapper');
            if (!anchor || !anchor.isConnected) return;
            el = document.createElement('div');
            el.id = 'over-ver';
            el.className = 'feedback error';
            el.setAttribute('role', 'status');
            anchor.before(el);
        }
        el.textContent = `Version mismatch: opponent runs ${s.oppV}, you run ${ChessCourseApp.APP_VERSION} — both refresh the page for the latest fixes.`;
    }
    _paintOppCard() {
        const s = this.online;
        const card = document.getElementById('oprofile-opp');
        if (!card || !s) return;
        const theirs = s.myColor === 'white' ? 'Black' : 'White';
        const name = s.opp?.name || 'Opponent';
        const cur = card.querySelector('img.avatar, .avatar-letter');
        const wantImg = !!s.opp?.img;
        const isImg = !!cur && cur.tagName === 'IMG';
        if (wantImg !== isImg || (wantImg && cur.getAttribute('src') !== s.opp.img)) {
            const fresh = wantImg ? this._oppImgHTML(name, s.opp.img) : `<div class="avatar-letter">${esc((name || 'F')[0].toUpperCase())}</div>`;
            if (cur) cur.outerHTML = fresh;
            else card.insertAdjacentHTML('afterbegin', fresh);
        }
        const nEl = card.querySelector('.info .name'); if (nEl) nEl.textContent = name;
        const sEl = card.querySelector('.info .sub'); if (sEl) sEl.textContent = `${theirs} · ${s.opp?.rating || ''}`;
        this._bindAvatarFallback('#oprofile-opp img.avatar[data-opp-img]');
    }
    // CSP-safe broken-photo fallback: a photo that cannot load (offline,
    // blocked remote, dead URL) becomes the letter tile instead of a
    // broken-image icon. Inline onerror would violate the CSP.
    _bindAvatarFallback(sel, letterCls) {
        const img = document.querySelector(sel);
        if (!img || img.dataset.fbBound) return;
        img.dataset.fbBound = '1';
        img.addEventListener('error', () => {
            const letter = document.createElement('div');
            letter.className = 'avatar-letter' + (letterCls ? ' ' + letterCls : '');
            letter.textContent = (img.alt || 'F')[0].toUpperCase();
            img.replaceWith(letter);
        });
    }

    // Rating count-up: tween the displayed rating from old to new.
    toggleMute() {
        const muted = this.snd.toggleMute();
        const label = muted ? 'Unmute sounds' : 'Mute sounds';
        document.querySelectorAll('.mute-btn').forEach(b => {
            b.setAttribute('aria-pressed', muted ? 'true' : 'false');
            b.title = label;
            b.setAttribute('aria-label', label);
        });
        return muted;
    }
    _muteBtnHTML() {
        const m = this.snd.muted ? 'true' : 'false';
        const label = this.snd.muted ? 'Unmute sounds' : 'Mute sounds';
        return `<button class="icon-btn mute-btn" data-action="mute" aria-pressed="${m}" aria-label="${label}" title="${label}">
            <svg viewBox="0 0 24 24" class="spk-on"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13"/></svg>
            <svg viewBox="0 0 24 24" class="spk-off"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l6 6M22 9l-6 6"/></svg>
        </button>`;
    }
    _flipLessonBoard() { this.boardFlip = !this.boardFlip; this._draw(); }
    _flipOnlineBoard() { const s = this.online; if (!s) return; s.flipView = !s.flipView; this._drawOnline(); }

    _paintCaptured(rootId, engine, myColor) {
        const root = document.getElementById(rootId);
        if (!root || !engine) return;
        const vals = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        const takes = { white: [], black: [] };
        engine.moveHistory.forEach(m => {
            if (!m.captured) return;
            (m.piece === m.piece.toUpperCase() ? takes.white : takes.black).push(m.captured);
        });
        const score = (arr) => arr.reduce((a, p) => a + (vals[p.toLowerCase()] || 0), 0);
        const diff = score(takes.white) - score(takes.black);
        const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
        const render = (arr, edge) => arr.slice()
            .sort((a, b) => order[a.toLowerCase()] - order[b.toLowerCase()])
            .map(p => `<img src="${this._pieceFile(p)}" width="20" height="20" alt="" loading="lazy">`).join('')
            + (edge > 0 ? `<span class="mat-edge">+${edge}</span>` : '');
        root.querySelectorAll('[data-cap]').forEach(el => {
            const side = el.dataset.cap === 'you' ? myColor : (myColor === 'white' ? 'black' : 'white');
            el.innerHTML = render(side === 'white' ? takes.white : takes.black, side === 'white' ? diff : -diff);
        });
    }

    _refreshGameOverCard() {
        const card = document.getElementById('gameover-card');
        if (!card) return;
        if (!this.isFreeGame || !this.currentLesson || !this.game.gameOver) { card.style.display = 'none'; this._gameOverShown = false; return; }
        const status = this.game.getGameStatus();
        let title = 'Game over', body = '';
        if (status.startsWith('checkmate')) {
            const w = status.split('-')[1] === 'white';
            title = w ? 'You win!' : 'Computer wins';
            body = w ? 'Checkmate — magnificent play! Your lesson is complete.' : 'Checkmate — study the final position, then try again!';
        } else if (status === 'stalemate') { title = 'Draw'; body = 'Stalemate — neither side has a legal move.'; }
        else if (status.startsWith('draw-')) {
            title = 'Draw';
            body = { 'draw-insufficient': 'Neither side can possibly checkmate.', 'draw-repetition': 'Threefold repetition.', 'draw-fifty': 'Fifty-move rule.' }[status] || '';
        } else { card.style.display = 'none'; this._gameOverShown = false; return; }
        card.innerHTML = `<h3 id="gameover-title" tabindex="-1">${title}</h3><p>${body}</p>
            <div class="lesson-actions">
                <button class="btn-primary btn-glow-strong" data-action="reset-board">Rematch</button>
                <button class="btn-secondary" data-action="gameover-hide">Review board</button>
                <button class="btn-secondary" data-action="back-lessons">Lessons</button>
            </div>`;
        card.style.display = '';
        // Reveal once per game-over: the card sits below the move log and is
        // otherwise off-screen, so winners never saw it. Scroll (no motion
        // when reduced-motion is set) and land focus on the heading so screen
        // readers announce the result.
        if (!this._gameOverShown) {
            this._gameOverShown = true;
            try {
                const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
                card.querySelector('#gameover-title')?.focus({ preventScroll: true });
            } catch (_) {}
        }
    }
    _animateRate() {
        const el = document.querySelector('#online-result .rate-count');
        if (!el) return;
        const from = parseInt(el.dataset.from, 10), to = parseInt(el.dataset.to, 10);
        if (!isFinite(from) || !isFinite(to) || from === to) return;
        const sign = to >= from ? '+' : '';
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;
        const t0 = performance.now(), dur = 700;
        const step = (t) => {
            if (!el.isConnected) return;
            const k = Math.min(1, (t - t0) / dur);
            const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
            el.textContent = `Rating ${sign}${v - from} → ${v}`;
            if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    _reasonText(reason) {
        return { checkmate: 'Checkmate on the board.', resignation: 'by resignation.', stalemate: 'Stalemate.', agreement: 'by mutual agreement.', timeout: 'on time.', material: 'Neither side can mate.', aborted: 'Too short to rate — no rating change.', forfeit: 'by forfeit — opponent disconnected.', 'draw-insufficient': 'Neither side can mate.', 'draw-repetition': 'Threefold repetition.', 'draw-fifty': 'Fifty-move rule.' }[reason] || '';
    }

    // Small promise modal: {title, body, okLabel, cancelLabel} -> true/false.
    // Used before destructive acts (resign, leave) so a slip never ends a game.
    _confirmModal({ title, body, okLabel = 'Confirm', cancelLabel = 'Cancel' }) {
        document.getElementById('confirm-veil')?.remove();
        return new Promise((resolve) => {
            const veil = document.createElement('div');
            veil.id = 'confirm-veil';
            veil.className = 'confirm-veil';
            veil.innerHTML = `
                <div class="confirm-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                    <h3>${esc(title)}</h3>
                    <p>${esc(body)}</p>
                    <div class="confirm-actions">
                        <button class="btn-secondary" data-x="no">${esc(cancelLabel)}</button>
                        <button class="btn-primary" data-x="yes">${esc(okLabel)}</button>
                    </div>
                </div>`;
            const done = (v) => { veil.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
            const onKey = (e) => { if (e.key === 'Escape') done(false); };
            document.addEventListener('keydown', onKey, true);
            veil.addEventListener('click', (e) => {
                if (e.target === veil) return done(false);
                const b = e.target.closest('[data-x]');
                if (b) done(b.dataset.x === 'yes');
            });
            document.body.appendChild(veil);
            veil.querySelector('[data-x="yes"]')?.focus();
        });
    }

    // Durable append of moves + portable clock (§5/§6) on both tabs.
    _saveOnlineSession() {
        const s = this.online;
        if (!s || !s.gameId || typeof OnlineStore === 'undefined') return;
        OnlineStore.saveGame({
            gameId: s.gameId, code: s.code, control: { id: s.control.id, base: s.control.base, inc: s.control.inc },
            role: s.role, myColor: s.myColor, opp: s.opp,
            moves: s.engine.moveHistory.map(m => ({ from: m.from, to: m.to, promo: m.promotion || null })),
            clocks: { w: Math.round(s.clock.w), b: Math.round(s.clock.b), side: s.clock.side },
            result: s.result || null, reason: s.reason || null
        });
    }

    _flushPending() {
        const s = this.online;
        if (s?.pendingIntent && s.conn) {
            const p = s.pendingIntent; s.pendingIntent = null;
            s.net.send(s.conn, p);
        }
    }

    // Joiner auto-reconnect with backoff + jitter (§7); ~60s of trying,
    // then the joiner claims the forfeit win (unrated if <2 plies via the
    // abort rule — same as the host side).
    _scheduleRejoin() {
        const s = this.online;
        if (!s || s.role !== 'join') return;
        this._clearRejoin();
        const delays = [1000, 2000, 4000, 8000, 15000, 30000];
        let attempt = 0;
        const tick = () => {
            const cur = this.online;
            if (!cur || cur !== s || cur.phase !== 'play' || cur.result || !cur.peerGone) return;
            if (attempt >= delays.length) { this._onlineFinish('win', 'forfeit'); return; }
            const wait = delays[attempt++] * (0.8 + Math.random() * 0.4);
            s.rejoinTimer = setTimeout(async () => {
                const c2 = this.online;
                if (!c2 || c2 !== s || c2.phase !== 'play' || c2.result || !c2.peerGone) return;
                try {
                    const conn = await s.net.join(s.code);
                    s.conn = conn;
                    s.net.send(conn, { type: 'hello', v: ChessCourseApp.APP_VERSION, code: s.code, rejoin: true, lastPly: s.ply, user: this._meTag() });
                } catch (_) { tick(); }
            }, wait);
        };
        tick();
    }
    _clearRejoin() {
        try { if (this.online?.rejoinTimer) clearTimeout(this.online.rejoinTimer); } catch (_) {}
        if (this.online) this.online.rejoinTimer = null;
    }

    _onlineAbort(msg) {
        const s = this.online;
        if (!s) return;
        this._clearRejoin();
        s.result = 'draw'; s.reason = 'aborted'; s.phase = 'over';
        s.engine.gameOver = true;
        this._saveOnlineSession();
        this._stopOnlineTick();
        if (document.getElementById('online-content')) this._renderOnlineGame();
        else { this._drawOnline(); }
        this._onlineStatus(msg || 'Game aborted — no rating change.');
    }

    _onlineStatus(msg) {
        const el = document.getElementById('online-status');
        if (!el) return;
        const s = this.online;
        if (msg) { el.textContent = msg; return; }
        if (!s) return;
        if (s.phase === 'over') {
            if (s.unrated) { el.textContent = 'Unrated game — you are playing yourself. No rating change.'; return; }
            el.textContent = s.result === 'win' ? 'Victory! Start a rematch or head back.' : s.result === 'loss' ? 'Defeat. One more?' : 'Draw. Well fought!';
            return;
        }
        if (s.peerGone) { el.textContent = s.role === 'host' ? `Opponent disconnected — they can rejoin with code ${s.code}.` : 'Reconnecting…'; return; }
        el.textContent = s.engine.currentPlayer === s.myColor ? 'Your move!' : 'Opponent is thinking…';
    }

    /* ── Online board (orientation follows your color) — incremental sync,
       same no-rebuild contract as the lesson board. ── */
    _ensureOnlineSquares(board) {
        if (board.dataset.synced === 'online' && board.querySelectorAll(':scope > .chess-square').length === 64) return;
        board.innerHTML = '';
        for (let dr = 0; dr < 8; dr++) {
            for (let dc = 0; dc < 8; dc++) {
                const sq = document.createElement('div');
                sq.className = 'chess-square white';
                sq.dataset.dr = String(dr);
                sq.dataset.dc = String(dc);
                sq.setAttribute('role', 'button');
                sq.setAttribute('tabindex', '-1');
                board.appendChild(sq);
            }
        }
        board.dataset.synced = 'online';
        this._bindBoard(board, 'online');
    }
    _drawOnline() {
        const s = this.online;
        const board = document.getElementById('online-board');
        if (!board || !s) return;
        this._ensureOnlineSquares(board);
        this._bindBoard(board, 'online');
        const flip = (s.myColor === 'black') !== !!s.flipView;
        const at = (dr, dc) => [flip ? 7 - dr : dr, flip ? 7 - dc : dc];
        // History view: null = live head; otherwise replay the first N plies
        // into a scratch engine so ‹ › never touches the real game.
        const history = s.engine.moveHistory;
        const live = history.length;
        const view = (s.viewPly == null) ? live : Math.max(0, Math.min(s.viewPly, live));
        const viewing = view !== live;
        let eng = s.engine;
        let shown = history;
        if (viewing) {
            eng = new ChessGame();
            shown = s.engine.moveHistory.slice(0, view);
            shown.forEach(m => {
                try { eng.movePiece(eng.algebraicToCoords(m.from), eng.algebraicToCoords(m.to), m.promotion || null); } catch (_) {}
            });
        }
        const sel = viewing ? null : s.sel, legal = viewing ? [] : (s.legal || []);
        const last = shown.length ? shown[shown.length - 1] : null;
        const lastFrom = last ? eng.algebraicToCoords(last.from) : null;
        const lastTo = last ? eng.algebraicToCoords(last.to) : null;
        const inCheck = eng._isKingInCheck(eng.currentPlayer);
        const kingPos = inCheck ? eng.findKing(eng.currentPlayer) : null;
        const legalSet = new Set(legal.map(m => m[0] + ',' + m[1]));
        let rover = this._onlineRover;
        if (sel) rover = eng.coordsToAlgebraic(sel);
        else if (last) rover = last.to;
        if (!rover) rover = 'e2';
        const kids = board.querySelectorAll(':scope > .chess-square');
        for (let i = 0; i < kids.length; i++) {
            const sq = kids[i];
            const dr = +sq.dataset.dr, dc = +sq.dataset.dc;
            const [r, c] = at(dr, dc);
            sq.className = `chess-square ${(r + c) % 2 === 0 ? 'white' : 'black'}`;
            const alg = eng.coordsToAlgebraic([r, c]);
            sq.dataset.square = alg; sq.dataset.row = String(r); sq.dataset.col = String(c);
            const piece = eng.board[r][c];
            const isKingInCheck = !!(kingPos && kingPos[0] === r && kingPos[1] === c);
            sq.setAttribute('aria-label', this._squareLabel(alg, piece, isKingInCheck));
            if (sel && sel[0] === r && sel[1] === c) { sq.classList.add('selected'); sq.setAttribute('aria-selected', 'true'); }
            else sq.removeAttribute('aria-selected');
            if ((lastFrom && lastFrom[0] === r && lastFrom[1] === c) || (lastTo && lastTo[0] === r && lastTo[1] === c)) sq.classList.add('last-move');
            if (isKingInCheck) sq.classList.add('in-check');
            let img = sq.querySelector('img.chess-piece, svg.chess-piece');
            if (piece) {
                const wantSrc = this._pieceFile(piece);
                if (!(img && img.tagName === 'IMG' && img.dataset.fallbackPiece === piece && img.getAttribute('src') === wantSrc)) {
                    const w = document.createElement('div');
                    w.innerHTML = this._svg(piece);
                    const fresh = w.firstChild;
                    if (img) img.replaceWith(fresh);
                    else sq.prepend(fresh);
                }
            } else if (img) img.remove();
            const wantDot = !!(sel && legalSet.has(r + ',' + c));
            let dot = sq.querySelector('.legal-dot, .legal-ring');
            if (wantDot && !dot) {
                dot = document.createElement('div');
                dot.className = piece ? 'legal-ring' : 'legal-dot';
                dot.setAttribute('aria-hidden', 'true');
                sq.appendChild(dot);
            } else if (wantDot && dot) {
                const wantCls = piece ? 'legal-ring' : 'legal-dot';
                if (dot.className !== wantCls) dot.className = wantCls;
            } else if (!wantDot && dot) dot.remove();
            let fl = sq.querySelector('.coord-file');
            let rk = sq.querySelector('.coord-rank');
            if (dr === 7) {
                if (!fl) { fl = document.createElement('span'); fl.className = 'coord-file'; sq.appendChild(fl); }
                if (fl.textContent !== alg[0]) fl.textContent = alg[0];
            } else if (fl) fl.remove();
            if (dc === 0) {
                if (!rk) { rk = document.createElement('span'); rk.className = 'coord-rank'; sq.appendChild(rk); }
                if (rk.textContent !== alg[1]) rk.textContent = alg[1];
            } else if (rk) rk.remove();
            sq.setAttribute('tabindex', alg === rover ? '0' : '-1');
        }
        this._onlineRover = rover;
        // Focus is never destroyed now (no rebuild), so no restore needed.
        const log = document.getElementById('online-log');
        if (log) {
            if (!live) log.innerHTML = '<span style="color:var(--text-muted-dim)">No moves yet.</span>';
            else {
                const curPair = view === 0 ? -1 : Math.ceil(view / 2) - 1;
                let html = '';
                for (let i = 0; i < live; i += 2) {
                    const w = history[i], b = history[i + 1];
                    const pi = Math.floor(i / 2);
                    html += `<div class="move-pair${pi === curPair ? ' cur' : ''}" data-pi="${pi}"><span class="move-num">${pi + 1}.</span><span class="move-item">${w.from}-${w.to}${w.promotion ? '=' + w.promotion.toUpperCase() : ''}</span>${b ? `<span class="move-item">${b.from}-${b.to}${b.promotion ? '=' + b.promotion.toUpperCase() : ''}</span>` : ''}</div>`;
                }
                log.innerHTML = html;
                // Container-local scroll only: scrollIntoView() would also
                // yank the whole page on phones with every move.
                const cur = log.querySelector('.move-pair.cur');
                if (cur) {
                    const lr = log.getBoundingClientRect(), cr = cur.getBoundingClientRect();
                    log.scrollTop += (cr.top - lr.top) - (lr.height / 2);
                } else log.scrollTop = log.scrollHeight;
            }
        }
        this._paintOnlineNav(live, view, viewing);
        this._paintCaptured('online-content', s.engine, s.myColor);
    }

    /* ── Move navigator ‹ › : step through history, Live returns ── */
    _onlineNavGo(where) {
        const s = this.online;
        if (!s) return;
        const live = s.engine.moveHistory.length;
        const view = (s.viewPly == null) ? live : s.viewPly;
        if (where === 'start') s.viewPly = 0;
        else if (where === 'prev') s.viewPly = Math.max(0, view - 1);
        else if (where === 'next') s.viewPly = Math.min(live, view + 1);
        else if (where === 'flip') { this._flipOnlineBoard(); return; }
        else s.viewPly = null;
        this._drawOnline();
        if (s.viewPly == null) this._onlineStatus();
        else this._onlineStatus(`Viewing move ${s.viewPly} of ${live} — press Live to return.`);
    }

    _paintOnlineNav(live, view, viewing) {
        const set = (id, dis) => { const b = document.getElementById(id); if (b) { if (dis) b.setAttribute('disabled', ''); else b.removeAttribute('disabled'); } };
        set('mv-start', !live || view <= 0);
        set('mv-prev', !live || view <= 0);
        set('mv-next', !live || !viewing);
        set('mv-end', !live || !viewing);
        const liveBtn = document.getElementById('mv-live');
        if (liveBtn) liveBtn.classList.toggle('on', !!viewing);
    }

    _onlineClick(r, c) {
        const s = this.online;
        if (this._dragMoved) return;
        if (!s || s.phase !== 'play' || s.result || s.pendingPromo) return;
        if (s.viewPly != null && s.viewPly < s.engine.moveHistory.length) {
            s.viewPly = null; // first tap while reviewing returns to live
            this._drawOnline(); this._onlineStatus();
            return;
        }
        if (s.engine.currentPlayer !== s.myColor) return;
        const g = s.engine;
        const mine = (s.myColor === 'white');
        // _drawOnline() is an in-place sync (no rebuild), already cheap.
        const paintSelOnline = () => this._drawOnline();
        if (!g.selectedSquare && !s.sel) {
            if (g.board[r][c] && ((g.board[r][c] === g.board[r][c].toUpperCase()) === mine)) {
                s.sel = [r, c]; s.legal = g.getLegalMoves([r, c]);
                if (!s.legal.length) { s.sel = null; this._onlineStatus('That piece has no legal moves.'); }
                paintSelOnline();
            }
            return;
        }
        const from = s.sel;
        if (g.board[r][c] && ((g.board[r][c] === g.board[r][c].toUpperCase()) === mine) && !(from && from[0] === r && from[1] === c)) {
            s.sel = [r, c]; s.legal = g.getLegalMoves([r, c]);
            paintSelOnline();
            return;
        }
        if (from && s.legal.some(m => m[0] === r && m[1] === c)) {
            s.sel = null; s.legal = [];
            const piece = g.board[from[0]][from[1]];
            const needsPromo = piece && piece.toLowerCase() === 'p' && (r === 0 || r === 7);
            if (needsPromo) { s.pendingPromo = { from, to: [r, c] }; this._drawOnline(); this._showOnlinePromotion(); return; }
            this._onlinePlayMove(from, [r, c]);
        } else {
            s.sel = null; s.legal = [];
            this._drawOnline();
        }
    }

    _showOnlinePromotion() {
        const s = this.online;
        const picker = document.getElementById('online-promo');
        if (!picker || !s?.pendingPromo) return;
        picker.innerHTML = '';
        picker.classList.remove('hidden');
        picker.setAttribute('role', 'dialog');
        picker.setAttribute('aria-modal', 'true');
        picker.setAttribute('aria-label', 'Choose promotion piece');
        this._trapPromotionKeys(picker);
        const white = s.myColor === 'white';
        const pieces = white ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
        const names = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
        const label = document.createElement('p');
        label.className = 'promotion-label'; label.textContent = 'Promote to:';
        picker.appendChild(label);
        const row = document.createElement('div');
        row.className = 'promotion-options';
        pieces.forEach((p, idx) => {
            const btn = document.createElement('button');
            btn.className = 'promotion-btn';
            btn.type = 'button';
            btn.setAttribute('aria-label', `Promote to ${names[p]}`);
            btn.innerHTML = `${this._svg(p)}<span>${names[p]}</span>`;
            btn.onclick = () => {
                picker.innerHTML = ''; picker.classList.add('hidden');
                const mv = s.pendingPromo; s.pendingPromo = null;
                if (mv) this._onlinePlayMove(mv.from, mv.to, p);
                if (mv) {
                    this._onlineRover = s.engine.coordsToAlgebraic(mv.to);
                    const back = document.querySelector(`#online-board [data-square="${this._onlineRover}"]`);
                    if (back) {
                        document.querySelectorAll('#online-board .chess-square[tabindex="0"]').forEach(n => n.setAttribute('tabindex', '-1'));
                        back.setAttribute('tabindex', '0');
                        try { back.focus({ preventScroll: true }); } catch (_) {}
                    }
                }
            };
            if (idx === 0) setTimeout(() => { try { btn.focus({ preventScroll: true }); } catch (_) {} }, 0);
            row.appendChild(btn);
        });
        picker.appendChild(row);
    }

    /* ── Online actions ── */
    async _onlineResignAsk() {
        const s = this.online;
        if (!s || s.phase !== 'play' || s.result) return;
        const ok = await this._confirmModal({
            title: 'Resign this game?',
            body: `Your opponent takes the win${s.engine.moveHistory.length < 2 ? ' — and since barely anything was played, it will not be rated' : ''}.`,
            okLabel: 'Resign', cancelLabel: 'Keep playing'
        });
        if (ok) this._onlineResign();
    }
    async _onlineLeaveAsk() {
        const s = this.online;
        if (!s) { this._onlineLeave(); return; }
        if (s.phase !== 'play' || s.result) { this._onlineLeave(); return; }
        const ok = await this._confirmModal({
            title: 'Leave this game?',
            body: 'Leaving counts as resigning — your opponent wins. Stay and fight instead?',
            okLabel: 'Leave game', cancelLabel: 'Stay'
        });
        if (ok) { this._onlineResign(); this._onlineLeave(); }
    }
    _onlineReview() {
        const s = this.online;
        if (!s || s.phase !== 'over') return;
        s.viewPly = 0;
        this._drawOnline();
        this._onlineStatus('Reviewing the game — step with ‹ ›, or jump back with Live.');
    }
    _onlineResign() {
        const s = this.online;
        if (!s || s.phase !== 'play' || s.result) return;
        s.net.send(s.conn, { type: 'resign' });
        // Resigning is always your own loss, whatever color you are.
        this._onlineFinish('loss', 'resignation', s.role !== 'host');
    }
    _onlineDrawOffer() {
        const s = this.online;
        if (!s || s.phase !== 'play' || s.result) return;
        s.net.send(s.conn, { type: 'draw_offer' });
        this._onlineStatus('Draw offered. Waiting for your opponent…');
    }
    // Draw offers arrive as a popup (same as resign) so they are seen
    // even on a phone with the sidebar scrolled away.
    async _onlineDrawPrompt() {
        const s = this.online;
        if (!s || s.phase !== 'play' || s.result || s._drawOpen) return;
        s._drawOpen = true;
        this.snd.playCheck();
        const accept = await this._confirmModal({
            title: 'Draw offer',
            body: `${s.opp?.name || 'Your opponent'} offers a draw. Accept and split the point?`,
            okLabel: 'Accept draw', cancelLabel: 'Decline'
        });
        s._drawOpen = false;
        const cur = this.online;
        if (!cur || cur.phase !== 'play' || cur.result) return;
        cur.net.send(cur.conn, { type: accept ? 'draw_accept' : 'draw_decline' });
        if (accept) this._onlineFinish('draw', 'agreement', cur.role !== 'host');
        else this._onlineStatus();
    }
    _onlineDrawAnswer(accept) {
        const s = this.online;
        document.getElementById('draw-decide')?.remove();
        if (!s || s.phase !== 'play' || s.result) return;
        s.net.send(s.conn, { type: accept ? 'draw_accept' : 'draw_decline' });
        if (accept) this._onlineFinish('draw', 'agreement', s.role !== 'host');
        else this._onlineStatus();
    }
    // Rematch needs BOTH players: asking sends a request, and the new
    // game only starts after an explicit accept. Nobody is ever forced in.
    _onlineRematch() {
        const s = this.online;
        if (!s || s.phase !== 'over' || s._rematchBusy) return;
        s.rematchMe = true;
        if (s.rematchOpp) {
            if (s.role === 'host') { this._rematchStart(); return; }
            this._onlineStatus('Both agreed! Waiting for the host to deal…');
            return;
        }
        s.net.send(s.conn, { type: 'rematch_want', epoch: s.epoch || 0 });
        this._onlineStatus(s.role === 'host'
            ? 'Rematch offered — waiting for your opponent to accept…'
            : 'Rematch requested! Waiting for the host to deal…');
    }

    _rematchStart() {
        const s = this.online;
        if (!s || s.role !== 'host') return;
        const newColor = s.myColor === 'white' ? 'black' : 'white';
        s.gameId = this._newGameId();
        s.rematchMe = false; s.rematchOpp = false;
            this._startOnlineGame(newColor, s.opp, s.control, true);
        try { localStorage.setItem('cclast', JSON.stringify({ code: s.code, gameId: s.gameId })); } catch (_) {}
        s.net.send(s.conn, { type: 'rematch_accept', epoch: s.epoch || 0, game_id: s.gameId, color: newColor === 'white' ? 'black' : 'white', control: { id: s.control.id, base: s.control.base, inc: s.control.inc }, state: this._buildOnlineState() });
        this._renderOnlineGame();
    }

    async _rematchPrompt(who) {
        const s = this.online;
        if (!s || s.phase !== 'over' || s._rematchOpen) return;
        s._rematchOpen = true;
        const accept = await this._confirmModal({
            title: 'Rematch?',
            body: `${who} wants another game — colors swap. Accept?`,
            okLabel: 'Accept', cancelLabel: 'Decline'
        });
        const cur = this.online;
        s._rematchOpen = false;
        if (!cur || cur.phase !== 'over') return;
        if (accept) {
            cur.rematchMe = true;
            if (cur.role === 'host') {
                if (cur.rematchOpp) this._rematchStart();
            } else {
                cur.net.send(cur.conn, { type: 'rematch_want', epoch: cur.epoch || 0 });
                this._onlineStatus('Accepted! Waiting for the host to deal…');
            }
        } else {
            cur.rematchMe = false;
            cur.net.send(cur.conn, { type: 'rematch_decline', epoch: cur.epoch || 0 });
            this._onlineStatus('Rematch declined.');
        }
    }

    showHome() {
        // The Learn screen is module-owned (outside _go's screen list), so a
        // programmatic return home must hide it or the two pages stack. The
        // next nav-learn visit self-heals via showPickerHome().
        try { document.getElementById('learn-screen')?.classList.remove('active'); } catch (_) {}
        this._go('home-screen'); this._renderHome();
    }
    showLessons()  { this._go('lessons-screen');  this._renderLessons(); }
    showLesson()   { this._go('lesson-screen'); }
    showProgress() { this._go('progress-screen'); this._syncProgress(); }
    showProfile()  { this._go('profile-screen');  this._renderProfile(); }
    showStudy()    { this._go('study-screen'); if (window.DoChessStudy) window.DoChessStudy.open(); }

    openUserProfile() {
        if (this._clerk && this._clerk.user) {
            try { this._clerk.openUserProfile({}); return; } catch (_) {}
        }
        this._fb('Sign in first to manage your account.', 'error');
    }
    async signOut() {
        if (this._clerk) { try { await this._clerk.signOut(); } catch (_) {} }
    }

    /* ── Clerk authentication (optional, lazy, graceful without a key) ─
       The ~450KB SDK loads only when needed: silently in the background
       for returning sessions, otherwise on the first Sign-in tap. The
       course itself never pays for it. */
    _initAuth() {
        const key = window.CHESS_CLERK_KEY;
        if (!key || typeof key !== 'string' || !key.startsWith('pk_')) return; // no accounts configured
        document.getElementById('auth-slot')?.removeAttribute('hidden');
        document.getElementById('auth-btn')?.addEventListener('click', () => this._authSignIn());
        document.getElementById('logout-btn')?.addEventListener('click', async () => { try { await this._clerk?.signOut(); } catch (_) {} });
        // Returning session? Restore silently so the avatar is already there.
        let returning = false;
        try {
            returning = localStorage.getItem('cc_had_session') === '1' || /(^|;\s*)__session=/.test(document.cookie);
        } catch (_) {}
        if (returning) this._ensureClerk();
    }
    _clerkLoadP = null;
    async _ensureClerk() {
        if (this._clerk) return this._clerk;
        if (!this._clerkLoadP) {
            this._clerkLoadP = (async () => {
                const key = window.CHESS_CLERK_KEY;
                // Pinned versions + SRI hashes (a failed hash rejects the
                // script, and the course keeps working without accounts).
                const SRI = {
                    ui: 'sha384-4GUvezHdeeeXUl+biTEv1J5e48+PY6g69mc75RUZASJcYBS2ziMHnctpzk/vXwHQ',
                    js: 'sha384-cEAsa1TiyCAEmd4+EaWuF7yatGWPa1+FeHkoewWSl71xCJYSy5nyAOJ7TKzd5Rzo'
                };
                const loadScript = (src, integrity, keyAttr) => new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
                    if (integrity) s.integrity = integrity;
                    // The UMD bundle reads its key off its own script tag at
                    // evaluation time and aborts without it (per Clerk docs).
                    if (keyAttr) s.setAttribute('data-clerk-publishable-key', keyAttr);
                    s.onload = res; s.onerror = () => rej(new Error('auth unavailable'));
                    document.head.appendChild(s);
                });
                // Pinned CDN bundles (the per-instance /npm path 307-redirects
                // and never materializes window.Clerk under file://).
                await loadScript('https://cdn.jsdelivr.net/npm/@clerk/ui@1.39.0/dist/ui.browser.js', SRI.ui);
                await loadScript('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.36.0/dist/clerk.browser.js', SRI.js, key);
                if (!window.Clerk) throw new Error('auth unavailable');
                await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
                this._clerk = window.Clerk;
                this._clerk.addListener(({ user }) => {
                    try {
                        if (user) localStorage.setItem('cc_had_session', '1');
                        else localStorage.removeItem('cc_had_session');
                    } catch (_) {}
                    this._syncAuthUI();
                    this._setUser(user ? user.id : null);
                });
                this._syncAuthUI();
                this._setUser(this._clerk.user ? this._clerk.user.id : null);
                return this._clerk;
            })().catch(() => { this._clerkLoadP = null; return null; });
        }
        return this._clerkLoadP;
    }
    async _authSignIn() {
        const c = await this._ensureClerk();
        if (c) { try { c.openSignIn({}); } catch (_) {} }
    }
    _syncAuthUI() {
        const slot = document.getElementById('userbutton-slot');
        const cta = document.getElementById('auth-btn');
        const logout = document.getElementById('logout-btn');
        // Slow auth resolving after first paint must not leave the lobby
        // frozen signed-out: refresh it, but never clobber a live session view.
        if (!this.online && document.getElementById('online-content')
            && document.getElementById('online-screen')?.classList.contains('active')) {
            this._renderOnlineLobby();
        }
        if (!slot || !cta || !this._clerk) return;
        if (this._clerk.user) {
            cta.setAttribute('hidden', '');
            slot.removeAttribute('hidden');
            logout?.removeAttribute('hidden');
            if (!slot.dataset.mounted) {
                slot.dataset.mounted = '1';
                this._clerk.mountUserButton(slot);
            }
        } else {
            delete slot.dataset.mounted;
            slot.setAttribute('hidden', '');
            slot.innerHTML = '';
            logout?.setAttribute('hidden', '');
            cta.removeAttribute('hidden');
        }
    }

    /* ── Day / night mode ─────────────────────────────────────────── */
    _resolveTheme() {
        try {
            const saved = localStorage.getItem('ccp_theme');
            if (saved === 'day' || saved === 'night') return saved;
        } catch (_) {}
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
    }

    _applyTheme(theme, persist = true) {
        this.theme = theme === 'day' ? 'day' : 'night';
        document.body.dataset.theme = this.theme;
        // Theme-aware brand marks: white knight on dark chrome, black knight on light.
        const v = ChessCourseApp.assetV();
        const logo = document.getElementById('logo-img');
        if (logo) logo.src = this.theme === 'day' ? `assets/logos/logo-128-light.png?${v}` : `assets/logos/logo-128-dark.png?${v}`;
        const heroLogo = document.getElementById('hero-logo-img');
        if (heroLogo) heroLogo.src = this.theme === 'day' ? `assets/logos/logo-256-light.png?${v}` : `assets/logos/logo-256-dark.png?${v}`;
        if (persist) {
            try { localStorage.setItem('ccp_theme', this.theme); } catch (_) {}
        }
        this._syncThemeButton();
    }

    toggleTheme(fromEl) {
        if (this._themeBusy) return;
        const next = this.theme === 'day' ? 'night' : 'day';
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) { this._applyTheme(next); return; }
        // Creative wipe: a disc of the incoming sky blooms from the toggle,
        // the theme swaps under cover, then the veil lifts.
        let x = window.innerWidth - 120, y = 48;
        if (fromEl && fromEl.getBoundingClientRect) {
            const r = fromEl.getBoundingClientRect();
            x = r.left + r.width / 2; y = r.top + r.height / 2;
        }
        this._themeBusy = true;
        const veil = document.createElement('div');
        veil.className = 'theme-wipe';
        veil.style.setProperty('--wx', x + 'px');
        veil.style.setProperty('--wy', y + 'px');
        veil.dataset.incoming = next;
        document.body.appendChild(veil);
        requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('cover')));
        setTimeout(() => this._applyTheme(next), 200);
        setTimeout(() => {
            veil.classList.add('lift');
            setTimeout(() => { veil.remove(); this._themeBusy = false; }, 450);
        }, 420);
    }

    _syncThemeButton() {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        const isDay = this.theme === 'day';
        btn.querySelector('.theme-toggle-label').textContent = isDay ? 'Day' : 'Night';
        btn.setAttribute('aria-pressed', isDay ? 'true' : 'false');
        btn.title = isDay ? 'Switch to night mode' : 'Switch to day mode';
    }

    /* ══════════════════════════════════════════════════════════════
       PROFILE — DoChess command center (profile page only)
       One identity panel, one study band, a battle dossier with a
       ratings rail, an honest match history and a lesson timeline.
       Every number is real device data; nothing is mocked. Shared
       contracts kept: .profile-id h3 (xss test), .stat-value (elo
       test), [data-open-lesson], [data-action=profile-signin/
       manage-account/logout/goto-online].
    ══════════════════════════════════════════════════════════════ */
    _renderProfile() {
        const box = document.getElementById('profile-content');
        if (!box) return;
        const user = this._clerk?.user || null;
        if (!user) {
            box.innerHTML = `
            <div class="dc-profile">
                ${this._profileIdentityHTML(null)}
                ${this._profileStudyHTML()}
                ${this._profileLessonsHTML()}
            </div>`;
            return;
        }
        box.innerHTML = `
            <div class="dc-profile">
                ${this._profileIdentityHTML(user)}
                ${this._profileStudyHTML()}
                <div class="dc-split">
                    ${this._profileBattleHTML()}
                    ${this._profileRatingsHTML()}
                </div>
                ${this._profileGamesHTML()}
                ${this._profileLessonsHTML()}
                <div class="dc-actions">
                    <button class="btn-secondary" data-action="manage-account" type="button">Manage account</button>
                    <button class="btn-secondary" data-action="logout" type="button">Log out</button>
                </div>
            </div>`;
        this._bindHistPics();
        this._paintStudy();
    }

    /* Identity: avatar with presence, name, email, membership, live
       status, current Blitz chip with a genuine last-game trend, and
       earned-only distinctions. The side CTA is the real next action. */
    _profileIdentityHTML(user) {
        const seen = esc(this._lastSeenText());
        if (!user) {
            return `
            <section class="dc-panel dc-id" aria-label="Player identity">
                <div class="dc-avatar">
                    <img class="dc-avatar-img" src="assets/pieces/white-king.svg?${ChessCourseApp.assetV()}" width="88" height="88" alt="Guest learner">
                    <span class="dc-presence" title="${seen}"></span>
                </div>
                <div class="profile-id dc-id-main">
                    <h3>Guest learner</h3>
                    <p class="dc-line">Sign in to track this course across devices — progress stays on this browser until then.</p>
                    <p class="dc-meta"><span class="presence-dot" aria-hidden="true"></span>${seen}</p>
                </div>
                <div class="dc-id-side">
                    <button class="btn-primary" data-action="profile-signin" type="button">Sign in / Join</button>
                </div>
            </section>`;
        }
        const name = user.fullName || user.username || (user.primaryEmailAddress?.emailAddress) || 'Player';
        const email = user.primaryEmailAddress?.emailAddress || '';
        const rawImg = user.imageUrl;
        const img = (typeof rawImg === 'string' && /^https:/.test(rawImg)) ? rawImg : null;
        const av = img
            ? `<img class="dc-avatar-img" src="${esc(img)}" width="88" height="88" alt="${esc(name)}">`
            : `<span class="dc-avatar-letter" aria-hidden="true">${esc((name || 'P')[0].toUpperCase())}</span>`;
        let joined = '';
        try { if (user.createdAt) joined = new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }); } catch (_) {}
        const blitz = OnlineRatings.get(this.userId, 'blitz');
        const trend = this._blitzTrend();
        const trendChip = !trend || trend.d === 0 ? '' :
            `<span class="dc-trend ${trend.d > 0 ? 'up' : 'down'}" title="Last Blitz game: ${trend.d > 0 ? '+' : ''}${trend.d} vs ${trend.opp}">
                <svg viewBox="0 0 8 8" aria-hidden="true"><path d="${trend.d > 0 ? 'M4 1l3 5H1z' : 'M4 7L1 2h6z'}"/></svg>${trend.d > 0 ? '+' : ''}${trend.d}
            </span>`;
        return `
            <section class="dc-panel dc-id" aria-label="Player identity">
                <div class="dc-avatar">${av}<span class="dc-presence" title="${seen}"></span></div>
                <div class="profile-id dc-id-main">
                    <h3>${esc(name)}</h3>
                    ${email ? `<p class="dc-line">${esc(email)}</p>` : ''}
                    <p class="dc-meta">
                        ${joined ? `<span>Playing since ${esc(joined)}</span><span class="dc-sep" aria-hidden="true">·</span>` : ''}
                        <span><span class="presence-dot" aria-hidden="true"></span>${seen}</span>
                        <span class="dc-sep" aria-hidden="true">·</span>
                        <span class="dc-rate-chip" title="Current Blitz rating">Blitz <strong>${blitz}</strong>${trendChip}</span>
                    </p>
                    ${this._profileBadgesHTML()}
                </div>
                <div class="dc-id-side">${this._profileNextHTML()}</div>
            </section>`;
    }

    _profileSignIn() {
        if (this._clerk) { try { this._clerk.openSignIn({}); return; } catch (_) {} }
        this._fb('Sign-in is unavailable right now.', 'error');
    }

    /* Earned distinctions only: course completion and the rating
       system's own provisional/established state. No titles invented. */
    _profileBadgesHTML() {
        const out = [];
        if (this.lessons.length && this.progress.done.length === this.lessons.length) {
            out.push(`<span class="dc-badge gold">${this._tileIcon('star')}Course graduate</span>`);
        }
        try {
            const b = OnlineRatings.record(this.userId, 'blitz');
            if (b.games >= 10) out.push('<span class="dc-badge">Established · Blitz</span>');
            else if (b.games > 0) out.push(`<span class="dc-badge">Provisional · ${b.games}/10</span>`);
        } catch (_) {}
        return out.length ? `<div class="dc-badges">${out.join('')}</div>` : '';
    }

    /* Last rated Blitz delta, for the identity trend chip. Null when
       there is no genuine rated game to point at. */
    _blitzTrend() {
        try {
            const h = OnlineRatings.history(this.userId) || [];
            const g = h.find(x => this._histControlId(x) === 'blitz' && x.delta !== null && x.delta !== undefined);
            if (!g) return null;
            const d = Math.trunc(+g.delta);
            if (!Number.isFinite(d)) return null;
            return { d, opp: this._histOppName(g) };
        } catch (_) { return null; }
    }

    /* The real next step: first open-but-incomplete lesson, or the
       full game once the course is done. */
    _profileNextHTML() {
        const cur = this._currentLesson();
        if (!cur) return `<button class="btn-primary" data-open-lesson="10" type="button">Play a full game</button>`;
        const label = this.progress.done.length === 0 ? `Start Lesson ${cur.id}` : `Continue · Lesson ${cur.id}`;
        return `<button class="btn-primary" data-open-lesson="${cur.id}" type="button">${label}</button>
            <span class="dc-next-sub">${esc(cur.title)}</span>`;
    }

    /* Study band: one panel, three divider-separated facts. All four
       course metrics live here: done count, total, percent, time. */
    _profileStudyHTML() {
        const n = this.progress.done.length, total = this.lessons.length;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const cur = this._currentLesson();
        return `
            <section class="dc-panel dc-study" aria-label="Course progress">
                <div class="dc-cell dc-cell-main">
                    <div class="dc-cell-top">${this._tileIcon('book')}<span class="dc-label">Lessons completed</span></div>
                    <div class="dc-num"><span class="stat-value">${n}</span><span class="dc-of">of ${total}</span></div>
                    <div class="dc-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Course completion, ${pct} percent" title="${pct}% complete"><span style="width:${pct}%"></span></div>
                </div>
                <div class="dc-cell">
                    <div class="dc-cell-top">${this._tileIcon('target')}<span class="dc-label">Completion</span></div>
                    <div class="dc-num"><span class="stat-value">${pct}%</span></div>
                    <div class="dc-sub">${cur ? esc(`Up next · Lesson ${cur.id}`) : 'Course complete'}</div>
                </div>
                <div class="dc-cell">
                    <div class="dc-cell-top">${this._tileIcon('clock')}<span class="dc-label">Time studied</span></div>
                    <div class="dc-num"><span class="stat-value">${esc(this._fmtDuration(this._studyTotal()))}</span></div>
                    <div class="dc-sub">on this device</div>
                </div>
            </section>`;
    }

    /* Battle dossier: headline figures with distinct treatments plus
       a genuine W–D–L proportion bar. Blitz-scoped where the legacy
       metrics are Blitz-scoped; labelled so. */
    _profileBattleHTML() {
        const cats = ChessCourseApp.onlineControls();
        const recs = cats.map(c => ({ c, r: OnlineRatings.record(this.userId, c.id) }));
        const games = recs.reduce((a, x) => a + x.r.games, 0);
        const head = `<div class="dc-head"><h3>Battle record</h3>${games ? `<span class="dc-count">${games} rated game${games === 1 ? '' : 's'}</span>` : ''}</div>`;
        if (!games) {
            return `
            <section class="dc-panel dc-battle" aria-label="Battle record">${head}
                <div class="dc-empty"><p>No rated games yet — challenge a friend to open your battle record.</p>
                <button class="btn-secondary sm" data-action="goto-online" type="button">Play online</button></div>
            </section>`;
        }
        const blitz = recs.find(x => x.c.id === 'blitz').r;
        const wr = blitz.games ? `${blitz.winRate}%` : '—';
        const wrHint = blitz.games ? `${blitz.w}W · ${blitz.l}L · ${blitz.d}D across ${blitz.games} Blitz` : 'No Blitz games yet';
        const tot = Math.max(1, blitz.w + blitz.l + blitz.d);
        const seg = `<div class="dc-segbar" role="img" aria-label="Blitz record: ${blitz.w} wins, ${blitz.l} losses, ${blitz.d} draws">
                <span class="seg-w" style="width:${(blitz.w / tot * 100).toFixed(1)}%"></span><span class="seg-d" style="width:${(blitz.d / tot * 100).toFixed(1)}%"></span><span class="seg-l" style="width:${(blitz.l / tot * 100).toFixed(1)}%"></span>
            </div>`;
        const trend = this._blitzTrend();
        const bestChip = trend && trend.d !== 0
            ? `<span class="dc-trend ${trend.d > 0 ? 'up' : 'down'}" title="Last Blitz game ${trend.d > 0 ? '+' : ''}${trend.d} vs ${trend.opp}">${trend.d > 0 ? '+' : ''}${trend.d}</span>` : '';
        return `
            <section class="dc-panel dc-battle" aria-label="Battle record">${head}
                <div class="dc-battle-top">
                    <div class="dc-feat">
                        <span class="dc-feat-ic">${this._tileIcon('board')}</span>
                        <span class="stat-value dc-feat-num">${games}</span>
                        <span class="dc-label">Games played</span>
                    </div>
                    <div class="dc-feat">
                        <span class="dc-feat-ic">${this._tileIcon('trophy')}</span>
                        <span class="stat-value dc-feat-num">${wr}</span>
                        <span class="dc-label">Blitz win rate</span>
                        ${blitz.games ? `<span class="dc-meter" aria-hidden="true"><span style="width:${blitz.winRate}%"></span></span>` : ''}
                    </div>
                    <div class="dc-feat">
                        <span class="dc-feat-ic">${this._tileIcon('medal')}</span>
                        <span class="dc-feat-num"><span class="stat-value">${blitz.games ? blitz.best : '—'}</span>${bestChip}</span>
                        <span class="dc-label">Best Blitz</span>
                    </div>
                </div>
                ${seg}
                <p class="dc-legend" title="${esc(wrHint)}">${esc(wrHint)}</p>
            </section>`;
    }

    /* Ratings rail: one honest row per time control. */
    _profileRatingsHTML() {
        const rows = ChessCourseApp.onlineControls().map(c => {
            const r = OnlineRatings.get(this.userId, c.id);
            let gms = 0;
            try { gms = OnlineRatings.record(this.userId, c.id).games || 0; } catch (_) {}
            const sub = gms === 1 ? '1 game' : `${gms} games`;
            const ic = c.id === 'bullet' ? 'bolt' : c.id === 'blitz' ? 'flag' : 'clock';
            return `<li class="dc-rate-row" title="${c.name} ${c.label}: rated ${r} after ${sub}">
                <span class="dc-rate-id"><span class="dc-rate-ic">${this._tileIcon(ic)}</span>
                <span><span class="dc-rate-name">${c.name}</span> <span class="dc-rate-lab">${c.label}</span></span></span>
                <span class="dc-rate-games">${sub}</span>
                <span class="stat-value dc-rate-num">${r}</span>
            </li>`;
        }).join('');
        return `
            <section class="dc-panel dc-rates" aria-label="Online ratings">
                <div class="dc-head"><h3>Online ratings</h3></div>
                <ul class="dc-rate-list">${rows}</ul>
                <p class="dc-note">Elo per time control, updated after every rated online game. Ratings live on this device.</p>
            </section>`;
    }

    /* ── History field readers: stored shapes are mixed (control is an
       object {id,base,inc} in current writes, a string in legacy rows;
       opp is a name string today but an object in older rows). Reading
       them structurally is what fixes the "[object Object]" rows. ── */
    _histOppName(g) {
        const o = g ? g.opp : null;
        if (typeof o === 'string' && o.trim()) return o.trim().slice(0, 24);
        if (o && typeof o === 'object') {
            const nm = o.name || o.fullName || o.username;
            if (typeof nm === 'string' && nm.trim()) return nm.trim().slice(0, 24);
        }
        return 'Opponent';
    }
    _histControlId(g) {
        const c = g ? g.control : null;
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') {
            if (typeof c.id === 'string' && c.id) return c.id;
            if (typeof c.name === 'string' && c.name) return c.name.toLowerCase();
        }
        return '';
    }
    _histControlLabel(g, cats) {
        const id = this._histControlId(g);
        const meta = (cats || []).find(c => c.id === id);
        if (meta) return `${meta.name} ${meta.label}`;
        const c = g ? g.control : null;
        if (c && typeof c === 'object') {
            const nm = (typeof c.name === 'string' && c.name) ? c.name : (typeof c.id === 'string' ? c.id : '');
            const lb = (typeof c.label === 'string') ? c.label : '';
            const s = `${nm} ${lb}`.trim();
            if (s) return s;
        }
        if (id) return id.charAt(0).toUpperCase() + id.slice(1);
        return 'Casual game';
    }
    _histDate(g) {
        try {
            const t = new Date(g.date);
            if (!isNaN(t)) return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch (_) {}
        return '';
    }
    /* Zero delta renders "0", never a fake "+0" (see the draw test). */
    _deltaChip(d) {
        if (d === null || d === undefined) return '';
        const n = Math.trunc(+d);
        if (!Number.isFinite(n)) return '';
        const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
        const txt = n > 0 ? `+${n}` : `${n}`;
        const label = n > 0 ? `Rating gain ${txt}` : n < 0 ? `Rating change ${txt}` : 'Rating unchanged';
        return `<span class="delta ${cls}" title="${label}">${txt}</span>`;
    }

    /* Page the history by 10: first 10, "more" reveals 10 at a
       time, "less" collapses back to the first 10. */
    _histPage(step) {
        const cur = this._histShown || 10;
        this._histShown = step < 0 ? 10 : cur + step;
        if (document.getElementById('profile-screen')?.classList.contains('active')) this._renderProfile();
    }

    /* Match history as a grouped table: one band per game, with a
       time-control gutter, a You / opponent player column, mirrored
       scores (a win for you is a loss for them), your honest rating
       delta, move count and date. Columns without genuine data
       (engine accuracy, flags, favourites) are omitted, never faked.
       No replay button: the only review action in the app belongs to
       a live game, and a dead link would be worse than none. */
    _profileGamesHTML() {
        const cats = ChessCourseApp.onlineControls();
        let hist = [];
        try { hist = OnlineRatings.history(this.userId) || []; } catch (_) {}
        const head = `<div class="dc-head"><h3>Recent games</h3>${hist.length ? `<span class="dc-count">last ${hist.length}</span>` : ''}</div>`;
        if (!hist.length) {
            return `
            <section class="dc-panel dc-games" aria-label="Recent games">${head}
                <div class="dc-empty"><p>No rated games yet — challenge a friend to start your match history.</p>
                <button class="btn-secondary sm" data-action="goto-online" type="button">Play online</button></div>
            </section>`;
        }
        const rows = hist.slice(0, this._histShown || 10).map(g => {
            const opp = this._histOppName(g);
            const tc = this._histMinutes(g, cats);
            const plies = (g && Number.isFinite(+g.plies)) ? Math.max(0, Math.trunc(+g.plies)) : 0;
            const moves = Math.ceil(plies / 2);
            const movesTxt = `${moves} move${moves === 1 ? '' : 's'}`;
            const when = this._histDate(g);
            const meta = [tc.full, movesTxt, when].filter(Boolean).join(' · ');
            const res = g && g.result === 'win' ? 'win' : g && g.result === 'loss' ? 'loss' : g && g.result === 'draw' ? 'draw' : '';
            const youScore = res === 'win' ? '1' : res === 'loss' ? '0' : res === 'draw' ? '½' : '–';
            const oppScore = res === 'win' ? '0' : res === 'loss' ? '1' : res === 'draw' ? '½' : '–';
            const ind = res === 'win'
                ? '<span class="dc-hist-ind win" role="img" aria-label="Won"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10"/></svg></span>'
                : res === 'loss'
                ? '<span class="dc-hist-ind loss" role="img" aria-label="Lost"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10"/></svg></span>'
                : res === 'draw'
                ? '<span class="dc-hist-ind draw" role="img" aria-label="Drew"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 4h10M1 8h10"/></svg></span>' : '';
            const resWord = res === 'win' ? 'Win' : res === 'loss' ? 'Loss' : res === 'draw' ? 'Draw' : 'Game';
            const d = (g && g.delta !== null && g.delta !== undefined && Number.isFinite(Math.trunc(+g.delta))) ? Math.trunc(+g.delta) : null;
            const dTxt = d === null ? '–' : d > 0 ? `+${d}` : `${d}`;
            const dCls = d === null ? 'flat' : d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
            const rec = this._histRec(g ? g.gameId : null);
            const openLabel = `${resWord} against ${opp}, ${meta}. Open to study this game.`;
            return `<li class="dc-hist-li"><button type="button" class="dc-hist" data-action="hist-open" data-game="${esc(g && g.gameId ? g.gameId : '')}" title="${esc(`Open to study: ${resWord} vs ${opp} — ${meta}`)}" aria-label="${esc(openLabel)}">
                <span class="dc-hist-tc" title="${esc(tc.full)}" aria-hidden="true"><span class="dc-hist-clock">${this._tileIcon('clock')}</span><span>${esc(tc.min)}</span></span>
                <span class="dc-hist-players" aria-hidden="true">
                    <span class="dc-hist-p you">${this._histPicHTML('you', null, rec)}<span class="dc-hist-name">You</span></span>
                    <span class="dc-hist-p">${this._histPicHTML('opp', opp, rec)}<span class="dc-hist-name">${esc(opp)}</span></span>
                </span>
                <span class="dc-hist-scores" aria-hidden="true"><span class="dc-hist-score">${youScore}${ind}</span><span class="dc-hist-score dim">${oppScore}</span></span>
                <span class="dc-hist-rate" aria-hidden="true">${this._deltaChip(g ? g.delta : null)}</span>
                <span class="dc-hist-moves" aria-hidden="true">${moves}</span>
                <span class="dc-hist-date" aria-hidden="true">${esc(when || '–')}</span>
                <span class="dc-hist-meta" aria-hidden="true"><span class="delta ${dCls}">${dTxt}</span><span> · ${esc(movesTxt)} · ${esc(when || '–')}</span></span>
            </button></li>`;
        }).join('');
        const shown = Math.min(hist.length, this._histShown || 10);
        const rest = hist.length - shown;
        const foot = (rest > 0 || shown > 10)
            ? `<div class="dc-hist-foot">
                ${rest > 0 ? `<button class="btn-secondary sm" data-action="hist-more" type="button">Show more (${rest} more)</button>` : ''}
                ${shown > 10 ? `<button class="btn-secondary sm" data-action="hist-less" type="button">Show less</button>` : ''}
            </div>` : '';
        return `
            <section class="dc-panel dc-games" aria-label="Recent games">${head}
                <ul class="dc-hist-list" aria-live="polite">
                    <li class="dc-hist-head" aria-hidden="true"><span></span><span>Players</span><span>Result</span><span>Rating</span><span>Moves</span><span>Date</span></li>
                    ${rows}
                </ul>
                ${foot}
                ${this._histStudyHTML(hist)}
            </section>`;
    }

    /* ── Game study: a read-only replay of a stored old game ──
       Finished games on this device keep their full move list in
       OnlineStore (saved on every move), so stepping through one is
       genuine review, not reconstruction. Games whose moves were
       never stored (pruned, legacy, another device) say so plainly. */
    _histRec(gameId) {
        try {
            if (typeof OnlineStore === 'undefined' || !gameId) return null;
            const r = OnlineStore.loadGame(gameId);
            return (r && typeof r === 'object') ? r : null;
        } catch (_) { return null; }
    }
    /* Avatar tile for a history row: the real photo when one is on
       file (yours today, the opponent's as saved with that game),
       otherwise the initial-letter tile. Photos are https-only and
       fall back to the letter tile if they cannot load. */
    _histPicHTML(which, name, rec) {
        let src = null, nm = which === 'you' ? 'You' : (name || 'Opponent');
        try {
            if (which === 'you') {
                const me = this._meTag();
                src = me.img || null;
                if (me.name) nm = me.name;
            } else if (rec && rec.opp && typeof rec.opp.img === 'string' && /^https:/.test(rec.opp.img)) {
                src = rec.opp.img.slice(0, 2048);
            }
        } catch (_) { src = null; }
        const letter = esc((((nm || '?')[0] || '?')).toUpperCase());
        if (src) return `<img class="dc-opp-pic${which === 'you' ? ' you' : ''}" src="${esc(src)}" width="30" height="30" alt="" aria-hidden="true" data-pic="${which}" data-letter="${letter}">`;
        return `<span class="dc-opp-av${which === 'you' ? ' you-av' : ''}" aria-hidden="true">${letter}</span>`;
    }
    // CSP-safe broken-photo fallback for history tiles (same pattern
    // as the match avatar fallback; inline onerror is CSP-banned).
    _bindHistPics() {
        document.querySelectorAll('#profile-content img.dc-opp-pic[data-pic]').forEach(img => {
            if (img.dataset.picBound) return;
            img.dataset.picBound = '1';
            img.addEventListener('error', () => {
                const span = document.createElement('span');
                span.className = 'dc-opp-av' + (img.dataset.pic === 'you' ? ' you-av' : '');
                span.setAttribute('aria-hidden', 'true');
                span.textContent = img.dataset.letter || '?';
                img.replaceWith(span);
            });
        });
    }
    _histOpen(gameId) {
        this._studyGameId = gameId || null;
        this._studyPly = null;
        if (!document.getElementById('profile-screen')?.classList.contains('active')) return;
        this._renderProfile();
        this._bindHistPics();
        this._paintStudy();
        try {
            const el = document.getElementById('dc-review');
            if (el) {
                const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
            }
        } catch (_) {}
    }
    _histClose() {
        this._studyGameId = null; this._studyPly = null;
        if (document.getElementById('profile-screen')?.classList.contains('active')) {
            this._renderProfile();
            this._bindHistPics();
        }
    }
    _histNav(where) {
        const rec = this._histRec(this._studyGameId);
        const total = rec && Array.isArray(rec.moves) ? rec.moves.length : 0;
        if (!total) return;
        let v = (this._studyPly == null) ? total : this._studyPly;
        if (where === 'start') v = 0;
        else if (where === 'prev') v = Math.max(0, v - 1);
        else if (where === 'next') v = Math.min(total, v + 1);
        else v = total;
        this._studyPly = v;
        this._paintStudy();
    }
    _histGoto(ply) {
        const rec = this._histRec(this._studyGameId);
        const total = rec && Array.isArray(rec.moves) ? rec.moves.length : 0;
        if (!total || !Number.isFinite(+ply)) return;
        this._studyPly = Math.max(0, Math.min(total, Math.trunc(+ply)));
        this._paintStudy();
    }
    _studyMoves(rec) {
        if (!rec || !Array.isArray(rec.moves)) return [];
        return rec.moves.filter(m => m && typeof m.from === 'string' && typeof m.to === 'string');
    }
    _histStudyHTML(hist) {
        const id = this._studyGameId;
        if (!id) return '';
        const cats = ChessCourseApp.onlineControls();
        const g = (hist || []).find(x => x && x.gameId === id) || null;
        const rec = this._histRec(id);
        const opp = g ? this._histOppName(g) : ((rec && rec.opp && rec.opp.name) || 'Opponent');
        const moves = this._studyMoves(rec);
        const res = g && (g.result === 'win' || g.result === 'loss' || g.result === 'draw') ? g.result
            : rec && (rec.result === 'win' || rec.result === 'loss' || rec.result === 'draw') ? rec.result : '';
        const resWord = res === 'win' ? 'You win' : res === 'loss' ? 'You lose' : res === 'draw' ? 'Draw' : 'Game';
        const ctrlFull = g ? this._histControlLabel(g, cats)
            : rec && rec.control ? this._histControlLabel({ control: rec.control }, cats) : '';
        const when = g ? this._histDate(g) : '';
        let reason = '';
        try { reason = this._reasonText(rec && rec.reason) || ''; } catch (_) {}
        const d = g ? g.delta : null;
        const sub = [ctrlFull, when, reason].filter(Boolean).join(' · ');
        const head = `<div class="dc-head"><h3>Game study</h3><span class="dc-study-hbtns"><button class="btn-secondary sm" data-action="hist-to-study" data-game="${esc(id)}" type="button" title="Open this game in the Study workspace">Open in Study</button><button class="btn-secondary sm" data-action="hist-close" type="button">Close</button></span></div>
            <p class="dc-review-sub"><strong>${esc(resWord)}</strong> vs ${esc(opp)}${sub ? ` · ${esc(sub)}` : ''} ${this._deltaChip(d)}</p>`;
        if (!moves.length) {
            return `<div class="dc-panel dc-review" id="dc-review" role="region" aria-label="Game study">${head}
                <div class="dc-empty"><p>Only the result was saved for this game — its moves weren't stored on this device, so there is no board to step through.</p></div>
            </div>`;
        }
        const navBtn = (where, label, path) => `<button class="icon-btn" data-action="hist-nav" data-where="${where}" type="button" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`;
        return `<div class="dc-panel dc-review" id="dc-review" role="region" aria-label="Game study: ${esc(`${resWord} versus ${opp}`)}">${head}
            <div class="dc-review-grid">
                <div class="dc-review-board" id="dc-study-board" role="img" aria-label="Board position"></div>
                <div class="dc-review-side">
                    <div class="movenav" role="group" aria-label="Step through the game">
                        ${navBtn('start', 'First move', 'M6 5v14M18 5l-8 7 8 7')}
                        ${navBtn('prev', 'Previous move', 'M14 5l-7 7 7 7')}
                        ${navBtn('next', 'Next move', 'M10 5l7 7-7 7')}
                        ${navBtn('end', 'Latest move', 'M18 5v14M6 5l8 7-8 7')}
                    </div>
                    <div class="move-log dc-review-log" id="dc-study-log" role="log" aria-live="polite" aria-label="Game moves"></div>
                    <div class="dc-review-count" id="dc-study-count" aria-live="polite"></div>
                </div>
            </div>
        </div>`;
    }
    /* Repaint the study board + log in place (no full re-render, so
       stepping never steals focus from the navigation buttons). */
    _paintStudy() {
        const board = document.getElementById('dc-study-board');
        const rec = this._histRec(this._studyGameId);
        if (!board || !rec) return;
        const stored = this._studyMoves(rec);
        const total = stored.length;
        if (!total || typeof ChessGame === 'undefined') return;
        const view = this._studyPly == null ? total : Math.max(0, Math.min(total, this._studyPly));
        // Full-game engine for move text (captures, castling, promotion…)
        const full = new ChessGame();
        try { full.reset(); } catch (_) {}
        stored.forEach(m => { try { full.movePiece(full.algebraicToCoords(m.from), full.algebraicToCoords(m.to), m.promo || null); } catch (_) {} });
        const played = full.moveHistory.slice(0, view);
        // View engine for the board position.
        const eng = new ChessGame();
        try { eng.reset(); } catch (_) {}
        played.forEach(m => { try { eng.movePiece(eng.algebraicToCoords(m.from), eng.algebraicToCoords(m.to), m.promotion || null); } catch (_) {} });
        const flip = rec.myColor === 'black';
        if (!board.dataset.built) {
            board.innerHTML = '';
            for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) {
                const sq = document.createElement('div');
                sq.className = 'chess-square white';
                sq.dataset.dr = String(dr); sq.dataset.dc = String(dc);
                board.appendChild(sq);
            }
            board.dataset.built = '1';
        }
        const last = played.length ? played[played.length - 1] : null;
        const lastFrom = last ? eng.algebraicToCoords(last.from) : null;
        const lastTo = last ? eng.algebraicToCoords(last.to) : null;
        let inCheck = false, kingPos = null;
        try { inCheck = eng._isKingInCheck(eng.currentPlayer); kingPos = inCheck ? eng.findKing(eng.currentPlayer) : null; } catch (_) {}
        board.querySelectorAll(':scope > .chess-square').forEach(sq => {
            const dr = +sq.dataset.dr, dc = +sq.dataset.dc;
            const r = flip ? 7 - dr : dr, c = flip ? 7 - dc : dc;
            sq.className = `chess-square ${((r + c) % 2 === 0) ? 'white' : 'black'}`;
            const alg = eng.coordsToAlgebraic([r, c]);
            sq.dataset.square = alg;
            const piece = eng.board[r][c];
            try { sq.setAttribute('aria-label', this._squareLabel(alg, piece, !!(kingPos && kingPos[0] === r && kingPos[1] === c))); } catch (_) {}
            if ((lastFrom && lastFrom[0] === r && lastFrom[1] === c) || (lastTo && lastTo[0] === r && lastTo[1] === c)) sq.classList.add('last-move');
            if (kingPos && kingPos[0] === r && kingPos[1] === c) sq.classList.add('in-check');
            let img = sq.querySelector('img.chess-piece, svg.chess-piece');
            if (piece) {
                const wantSrc = this._pieceFile(piece);
                if (!(img && img.tagName === 'IMG' && img.dataset.fallbackPiece === piece && img.getAttribute('src') === wantSrc)) {
                    const w = document.createElement('div');
                    w.innerHTML = this._svg(piece);
                    const fresh = w.firstChild;
                    if (img) img.replaceWith(fresh); else sq.prepend(fresh);
                }
            } else if (img) img.remove();
            let fl = sq.querySelector('.coord-file'), rk = sq.querySelector('.coord-rank');
            if (dr === 7) {
                if (!fl) { fl = document.createElement('span'); fl.className = 'coord-file'; sq.appendChild(fl); }
                fl.textContent = String.fromCharCode(97 + c);
            } else if (fl) fl.remove();
            if (dc === 0) {
                if (!rk) { rk = document.createElement('span'); rk.className = 'coord-rank'; sq.appendChild(rk); }
                rk.textContent = String(8 - r);
            } else if (rk) rk.remove();
        });
        try { board.setAttribute('aria-label', view === 0 ? 'Starting position' : `Position after ${view} half-move${view === 1 ? '' : 's'}`); } catch (_) {}
        // Move log with the current pair highlighted; pairs jump on tap.
        const log = document.getElementById('dc-study-log');
        if (log) {
            const fm = full.moveHistory;
            let html = '';
            for (let i = 0; i < fm.length; i += 2) {
                const w = fm[i], b = fm[i + 1];
                const endPly = Math.min(total, i + 2);
                const cur = view > i && view <= endPly ? ' cur' : '';
                html += `<button type="button" class="move-pair${cur}" data-action="hist-goto" data-ply="${endPly}" title="Jump to move ${Math.floor(i / 2) + 1}"><span class="move-num">${Math.floor(i / 2) + 1}.</span>${this._fmtLogMove(w)}${b ? this._fmtLogMove(b) : ''}</button>`;
            }
            log.innerHTML = html || '<span style="color:var(--text-muted-dim)">No moves.</span>';
            const curEl = log.querySelector('.move-pair.cur');
            if (curEl) { try { log.scrollTop = curEl.offsetTop - log.offsetTop - 8; } catch (_) {} }
            else { try { log.scrollTop = view === 0 ? 0 : log.scrollHeight; } catch (_) {} }
        }
        const count = document.getElementById('dc-study-count');
        if (count) count.textContent = view === 0 ? `Start of game · ${total} half-moves`
            : view === total ? `Final position · move ${Math.ceil(total / 2)} of ${Math.ceil(total / 2)}`
            : `After ${view} half-move${view === 1 ? '' : 's'} · move ${Math.ceil(view / 2)} of ${Math.ceil(total / 2)}`;
        document.querySelectorAll('#dc-review [data-action="hist-nav"]').forEach(b => {
            const w = b.dataset.where;
            const dis = (w === 'start' || w === 'prev') ? view <= 0 : view >= total;
            if (dis) b.setAttribute('disabled', ''); else b.removeAttribute('disabled');
        });
    }

    /* Short ("5 min") + full ("Blitz 5+0") time-control labels, read
       structurally: current writes store {id,base,inc}, legacy rows a
       bare id string. Never falls back to "[object Object]". */
    _histMinutes(g, cats) {
        const list = cats || ChessCourseApp.onlineControls();
        const c = g ? g.control : null;
        const id = this._histControlId(g);
        const meta = list.find(x => x.id === id);
        if (meta) return { min: `${Math.round(meta.base / 60000)} min`, full: `${meta.name} ${meta.label}` };
        if (c && typeof c === 'object') {
            const mins = Number.isFinite(+c.base) ? Math.round(+c.base / 60000) : 0;
            const nm = (typeof c.name === 'string' && c.name) ? c.name : (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
            const lb = (typeof c.label === 'string') ? c.label : '';
            const full = `${nm} ${lb}`.trim() || 'Casual game';
            return { min: mins > 0 ? `${mins} min` : '–', full };
        }
        if (id) return { min: '–', full: id.charAt(0).toUpperCase() + id.slice(1) };
        return { min: '–', full: 'Casual game' };
    }

    /* Lesson timeline: a rail with one node per lesson. Completed
       lessons read complete, the up-next lesson is marked, locked
       lessons name their unlock condition. Review stays one tap away. */
    _profileLessonsHTML() {
        const n = this.progress.done.length, total = this.lessons.length;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const cur = this._currentLesson();
        const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
        const rows = this.lessons.map(l => {
            const done = this.isDone(l.id), open = this.isOpen(l.id);
            const isCur = !!(cur && cur.id === l.id);
            const state = done ? 'done' : isCur ? 'current' : 'locked';
            const pill = done ? '<span class="completed-badge">Done</span>'
                : isCur ? '<span class="current-badge">Up next</span>'
                : open ? '<span class="profile-open">Ready to play</span>'
                : '<span class="profile-locked">Locked</span>';
            const sub = done ? `Lesson ${l.id} · Completed`
                : isCur ? `Lesson ${l.id} · Continue here`
                : open ? `Lesson ${l.id} · Unlocked` : `Lesson ${l.id} · Finish Lesson ${l.id - 1} to unlock`;
            return `<li class="dc-les ${state}">
                <span class="dc-node" aria-hidden="true">${done ? check : l.id}</span>
                <span class="dc-les-main"><span class="dc-les-title">${esc(l.title)}</span><span class="dc-les-sub">${esc(sub)}</span></span>
                ${pill}
                <button class="btn-secondary sm" data-open-lesson="${l.id}" ${open ? '' : 'disabled'} type="button">${done ? 'Review' : 'Play'}</button>
            </li>`;
        }).join('');
        return `
            <section class="dc-panel dc-lessons" aria-label="Lesson record">
                <div class="dc-head"><h3>Lesson record</h3><span class="dc-count">${n} of ${total} · ${pct}%</span></div>
                <div class="dc-track slim" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Lessons complete, ${pct} percent" title="${pct}% complete"><span style="width:${pct}%"></span></div>
                <ol class="dc-les-list">${rows}</ol>
            </section>`;
    }

    _bindMenu() {
        const btn = document.getElementById('menu-btn');
        const nav = document.getElementById('main-nav');
        if (!btn || !nav || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        const close = () => this._closeMenu();
        btn.addEventListener('click', () => {
            const open = nav.classList.toggle('open');
            btn.classList.toggle('open', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        document.addEventListener('click', (e) => {
            if (nav.classList.contains('open') && !nav.contains(e.target) && !btn.contains(e.target)) close();
        });
        window.addEventListener('resize', () => { if (window.innerWidth > 1120) close(); });
    }
    _closeMenu() {
        const btn = document.getElementById('menu-btn');
        const nav = document.getElementById('main-nav');
        if (!btn || !nav) return;
        nav.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Open menu');
    }

    /* ── Study time + presence (real seconds on learning screens) ── */
    _trackScreen(id) {
        this._flushStudyTime();
        this._studyOn = (id === 'lesson-screen' || id === 'online-screen');
        this._studySince = Date.now();
        try { localStorage.setItem('cc_seen_' + (this.userId || 'anon'), String(Date.now())); } catch (_) {}
        try { if (this._studyTimer) clearInterval(this._studyTimer); } catch (_) {}
        this._studyTimer = null;
        if (this._studyOn) {
            this._studyTimer = setInterval(() => this._flushStudyTime(), 30000);
        }
    }
    _flushStudyTime() {
        if (!this._studyOn || !this._studySince) return;
        const secs = Math.round((Date.now() - this._studySince) / 1000);
        this._studySince = Date.now();
        if (secs <= 0) return;
        const k = 'cc_time_' + (this.userId || 'anon');
        try {
            const d = JSON.parse(localStorage.getItem(k) || '{"total":0}');
            d.total = (d.total || 0) + secs;
            localStorage.setItem(k, JSON.stringify(d));
        } catch (_) {}
    }
    _studyTotal() {
        try { return JSON.parse(localStorage.getItem('cc_time_' + (this.userId || 'anon')) || '{"total":0}').total || 0; } catch (_) { return 0; }
    }
    _fmtDuration(secs) {
        if (secs < 60) return '<1m';
        const m = Math.floor(secs / 60), h = Math.floor(m / 60);
        return h ? `${h}h ${m % 60}m` : `${m}m`;
    }
    _lastSeenText() {
        let t = 0;
        try { t = parseInt(localStorage.getItem('cc_seen_' + (this.userId || 'anon')) || '0', 10) || 0; } catch (_) {}
        if (!t) return 'new here';
        const mins = Math.floor((Date.now() - t) / 60000);
        if (mins < 1) return 'active now';
        if (mins < 60) return `active ${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `active ${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return days === 1 ? 'active yesterday' : `active ${days}d ago`;
    }

    _go(id) {
        this._trackScreen(id);
        try { document.body.dataset.screen = id; } catch (_) {}
        ['home-screen','lessons-screen','lesson-screen','progress-screen','profile-screen','online-screen','study-screen']
            .forEach(s => document.getElementById(s)?.classList.toggle('active', s === id));
        // A11y: move keyboard focus to the new screen so SR users land
        // on the heading instead of staying on a now-hidden control.
        try {
            const scr = document.getElementById(id);
            if (scr) { scr.focus({ preventScroll: true }); }
        } catch (_) {}
        // Keep nav highlighted so users always know where they are
        const navFor = { 'home-screen': 'home', 'lessons-screen': 'lessons', 'lesson-screen': 'lessons', 'progress-screen': 'progress', 'profile-screen': 'profile', 'online-screen': 'online', 'study-screen': 'study' };
        const active = navFor[id];
        document.querySelectorAll('.nav-btn').forEach(b => {
            const key = b.dataset.nav || b.textContent.trim().toLowerCase();
            b.classList.toggle('active', key === active);
        });
        window.scrollTo(0, 0);
    }

    _bindNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.navBound) return;
            btn.dataset.navBound = '1';
            btn.addEventListener('click', () => {
                const key = (btn.dataset.nav || btn.textContent.trim()).toLowerCase();
                if (key.startsWith('home')) this.showHome();
                else if (key.startsWith('lesson')) this.showLessons();
                else if (key.startsWith('theme')) this.toggleTheme(btn);
                else if (key.startsWith('online')) this.showOnline();
                else if (key.startsWith('profile')) this.showProfile();
                else if (key.startsWith('progress')) this.showProgress();
                else if (key.startsWith('study')) this.showStudy();
                this._closeMenu();
            });
        });
        this._go(document.querySelector('.screen.active')?.id || 'home-screen');
    }

    /* ══════════════════════════════════════════════════════════════
       FEEDBACK
    ══════════════════════════════════════════════════════════════ */
    _fb(msg, type = 'info') {
        const el = document.getElementById('lesson-feedback');
        if (!el) return;
        el.textContent = msg; el.className = `feedback ${type}`;
        el.style.animation = 'none';
        requestAnimationFrame(() => { el.style.animation = ''; });
    }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new ChessCourseApp(); });
