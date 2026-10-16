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
        window.showPuzzles  = () => this.showPuzzles();
        window.toggleTheme  = (el) => this.toggleTheme(el);
        window.app          = this;
        this._applyTheme(this._resolveTheme(), false);
        this._applyBoardSkin(this._boardSkin(), false);
        this._initAuth();
        this._bindMenu();
        this._bindMoreSheet();
        this._qm = null; // quick-match session (overlay, timers, ticket)
        this._bindImgFallback();
        window.addEventListener('beforeunload', () => this._flushStudyTime());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this._flushStudyTime(); else this._studySince = Date.now(); });
        this._renderHome();
        this._bindNav();
        this._bindGlobalButtons();
        this._syncProgress();
        this._preloadPieces();
        // Cloud pull landed fresh progress: reload the in-memory copies so
        // the screens reflect the account's data instead of this device's.
        window.addEventListener('dochess:synced', (e) => {
            const w = (e && e.detail && e.detail.written) || {};
            if (w.lessons || w.playtime) {
                this.progress = this._loadProgress();
                this._syncProgress();
                if (document.getElementById('lessons-screen')?.classList.contains('active')) this._renderLessons();
                if (document.getElementById('profile-screen')?.classList.contains('active')) this._renderProfile();
            }
            if (w.settings) this._applyBoardSkin(this._boardSkin(), false);
        });
        window.addEventListener('dochess:sync', () => {
            document.querySelectorAll('[data-sync-chip]').forEach((el) => {
                const tmp = document.createElement('span');
                tmp.innerHTML = this._syncChipHTML();
                el.replaceWith(tmp.firstChild);
            });
        });
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
                else if (a === 'swap-sides') this._swapBotSides();
                else if (a === 'mark-complete') this.markComplete();
                else if (a === 'back-lessons') this.showLessons();
                else if (a === 'back-bots') this.showVsBots();
                else if (a === 'online-host') this._onlineHost();
                else if (a === 'online-host-code') this._onlineHost(action.dataset.code);
                else if (a === 'online-join') this._onlineJoin();
                else if (a === 'online-join-code') this._onlineJoin(action.dataset.code, true);
                else if (a === 'online-leave') this._onlineLeave();
                else if (a === 'online-quick') this._quickMatch();
                else if (a === 'vs-bots') this.showVsBots();
                else if (a === 'vs-bot') this.startBotGame(action.dataset.bot);
                else if (a === 'qm-cancel') this._quickCancel();
                else if (a === 'qm-bot') this._qmSoloBot(action.dataset.bot);
                else if (a === 'qm-wait') {
                    document.getElementById('qm-solo')?.remove();
                    try { if (this._qm) this._qm.t0 = Date.now(); } catch (_) {}
                    this._qmSetStatus('Still looking…');
                }
                else if (a === 'online-copy-link') {
                    const inp = document.getElementById('invite-link');
                    const prev = action.textContent;
                    const done = () => {
                        try { action.textContent = 'Copied!'; } catch (_) {}
                        setTimeout(() => { try { action.textContent = prev; } catch (_) {} }, 1500);
                    };
                    if (inp && inp.value && navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(inp.value).then(done, () => { try { inp.select(); } catch (_) {} done(); });
                    } else if (inp) { try { inp.select(); } catch (_) {} done(); }
                }
                else if (a === 'online-invite-guest') this._onlineJoin(action.dataset.code);
                else if (a === 'online-resign-ask') this._onlineResignAsk();
                else if (a === 'online-leave-ask') this._onlineLeaveAsk();
                else if (a === 'online-rematch') this._onlineRematch();
                else if (a === 'online-result-close') this._onlineResultDismiss();
                else if (a === 'online-result-open') this._onlineResultOpen();
                else if (a === 'online-review') this._onlineReview();
                else if (a === 'bot-to-study') this._botToStudy();
                else if (a === 'mute') this.toggleMute();
                else if (a === 'flip-board') this._flipLessonBoard();
                else if (a === 'flip-online') this._flipOnlineBoard();
                else if (a === 'gameover-hide') { document.getElementById('gameover-card').style.display = 'none'; }
                else if (a === 'online-draw-offer') this._onlineDrawOffer();
                else if (a === 'movenav') this._onlineNavGo(action.dataset.where);
                else if (a === 'next-lesson') this._nextLessonFromBoard();
                else if (a === 'profile-signin') this._profileSignIn(a);
                else if (a === 'sn-auth') { if (this._clerk?.user) this.showProfile(); else this._authSignIn(); }
                else if (a === 'friends-activity') this._toggleFriendsActivity();
                else if (a === 'friend-copy-link') this._copyFriendLink(a);
                else if (a === 'manage-account') this.openUserProfile();
                else if (a === 'logout') this.signOut();
                else if (a === 'goto-online') this.showOnline();
                else if (a === 'hist-more') this._histPage(10);
                else if (a === 'hist-less') this._histPage(-10);                else if (a === 'hist-open') this._histOpen(action.dataset.game);
                else if (a === 'hist-close') this._histClose();
                else if (a === 'hist-nav') this._histNav(action.dataset.where);
                else if (a === 'hist-goto') this._histGoto(parseInt(action.dataset.ply, 10));
                else if (a === 'hist-to-study') { if (window.DoChessStudy) window.DoChessStudy.importGame(action.dataset.game); }
                else if (a === 'board-skin') this._setBoardSkin(action.dataset.skin);
                else if (a === 'piece-set') this._setPieceSet(action.dataset.set);
                else if (a === 'lobby-preset') this._lobbyPreset(parseInt(action.dataset.m, 10), parseInt(action.dataset.s, 10));
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
    static assetV() { return 'v25'; }
    // App release tag (?v= on scripts). Sent on identity messages so two
    // sides on different releases warn instead of silently misbehaving.
    static APP_VERSION = 'v40';
    _pieceFile(piece) {
        // Piece SET (folder) is chosen once in the Online lobby — see js/pieces.js.
        if (window.DoChessPieces) return DoChessPieces.url(piece, ChessCourseApp.assetV());
        const names = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
        const white = piece === piece.toUpperCase();
        const kind = names[piece.toLowerCase()] || 'pawn';
        return `assets/pieces/pieces-second/${white ? 'white' : 'black'}-${kind}.svg?${ChessCourseApp.assetV()}`;
    }
    _pieceLabel(piece) {
        const white = piece === piece.toUpperCase();
        const kind = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' }[piece.toLowerCase()] || 'Piece';
        return `${white ? 'White' : 'Black'} ${kind}`;
    }
    _svg(piece) {
        const white = piece === piece.toUpperCase();
        const src = this._pieceFile(piece);
        const label = this._pieceLabel(piece);
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
            { id:1, name:'Milo',  title:'Chess Master & Strategist',  desc:'A calm and patient grandmaster who teaches the fundamentals with wisdom and precision.',         img:`assets/teacher1-192.png?${v}` },
            { id:2, name:'Sara',  title:'Tactical Specialist',         desc:'An energetic coach who focuses on tactics, patterns, and aggressive play.',                     img:`assets/teacher2-192.png?${v}` },
            { id:3, name:'Leo',   title:'Historical Chess Expert',     desc:'A scholarly teacher who brings chess history to life while teaching essential concepts.',       img:`assets/teacher3-192.png?${v}` }
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
    /* One-time guest→account carry-over: if the account is brand-new on
       this device but the guest shelf has real data, copy it over so
       nothing (lessons, learn, studies, ratings, games, achievements)
       looks "reset" after logging in. Never overwrites real account data. */
    _adoptGuestData(uid) {
        try {
            const has = (k) => { try { const v = localStorage.getItem(k); return v !== null && v !== '[]' && v !== '{}' && v !== ''; } catch (_) { return false; } };
            const copy = (from, to) => {
                try {
                    if (!has(to) && has(from)) localStorage.setItem(to, localStorage.getItem(from));
                } catch (_) {}
            };
            copy('ccp_v4', 'ccp_v4_' + uid);
            copy('dochess:v1', 'dochess:v1');
            copy('dcstudy_v1_anon', 'dcstudy_v1_' + uid);
            copy('ccr_guest', 'ccr_' + uid);
            copy('ccr_anon', 'ccr_' + uid);
            copy('ccgh_guest', 'ccgh_' + uid);
            copy('ccgh_anon', 'ccgh_' + uid);
            copy('cca_v1_guest', 'cca_v1_' + uid);
            copy('cc_time_guest', 'cc_time_' + uid);
            copy('dochess:puzzles:v1', 'dochess:puzzles:v1');
        } catch (_) {}
    }
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
        // Cloud mirror: lessons must survive new logins/devices.
        try { if (window.DoChessSync && typeof window.DoChessSync.notify === 'function' && this.userId) window.DoChessSync.notify(); } catch (_) {}
    }
    /* Cloud persistence (js/sync.js): the Clerk session token is the ONLY
       credential — the server derives the user id from it, never from the
       request body. Anonymous learners simply stay local. */
    _startCloudSync() {
        if (!window.DoChessSync) return;
        if (!this.userId) { DoChessSync.stop(); return; }
        if (DoChessSync.status().enabled && DoChessSync.status().userId === this.userId) {
            DoChessSync.notify();
            return;
        }
        DoChessSync.start({
            userId: this.userId,
            getToken: () => {
                try {
                    const s = this._clerk && this._clerk.session;
                    if (s && typeof s.getToken === 'function') return s.getToken();
                } catch (_) {}
                return null;
            }
        });
    }

    _setUser(userId) {
        if (this.userId === (userId || null)) return;
        this._flushStudyTime();
        this._studySince = Date.now();
        // First sign-in on this device: carry the guest shelf over so
        // lessons / studies / ratings / games are not "lost" — the user
        // should never replay lessons just because they logged in.
        try { if (userId) this._adoptGuestData(userId); } catch (_) {}
        this.userId = userId || null;
        this.progress = this._loadProgress();
        this._histShown = 10; // history paging is per player
        this._studyGameId = null; this._studyPly = null; // study viewer is per player
        this._syncProgress();
        this._startCloudSync();
        // Fresh pull: the account's cloud copy wins over this device.
        try {
            if (userId && window.DoChessSync && typeof window.DoChessSync.pull === 'function') {
                window.DoChessSync.pull().then(() => {
                    try {
                        this.progress = this._loadProgress();
                        this._syncProgress();
                        if (document.getElementById('lessons-screen')?.classList.contains('active')) this._renderLessons();
                        if (document.getElementById('profile-screen')?.classList.contains('active')) this._renderProfile();
                    } catch (_) {}
                }).catch(() => {});
            }
        } catch (_) {}
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
        // Achievements: lesson- and Learn-derived badges re-evaluate here
        // (Pathfinder, Tactics Expert, Knowledge Seeker, …).
        try { if (typeof DoChessAchievements !== 'undefined') DoChessAchievements.evaluate(this.userId); } catch (_) {}
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
        // Normal lesson entry always leaves practice-bot mode behind.
        this._botGame = false; this._cpuBot = null; this._cpuBotParams = null;
        // Lessons are always taught White-bottom.
        this._playerColor = 'white'; this._botColor = 'black';
        this.boardFlip = false;
        this.currentLesson = l;        this._buildLessonUI(l);
        this._go('lesson-screen');
        requestAnimationFrame(() => {
            // If the game is already over, _refreshGameOverCard owns the
            // scroll (smooth reveal of the result card); an instant board
            // jump here would cancel that animation mid-flight.
            if (this.game && this.game.gameOver) return;
            document.getElementById('chess-board-wrapper')?.scrollIntoView({ block: 'center' });
        });
    }

    /* ── Vs Bots: practice games against the Elo ladder ──────────────
       Bots play on the lesson free-game board (the existing game
       component: legal moves, clocks chrome, promotion, game-over card)
       with Elo-mapped engine settings. Practice mode never locks behind
       course progress and never completes lesson 10. Colors are drawn
       per game (opts.color 'white'|'black'|'random', default random):
       the board, input, engine, coach and chrome all follow the draw. */
    startBotGame(botId, opts) {
        const bot = ChessCourseApp.BOTS.find(b => b && b.id === botId);
        if (!bot) return;
        try { document.body.classList.add('is-playing'); } catch (_) {}
        const l = this.lessons.find(x => x.id === 10);
        if (!l) return;
        const want = (opts && opts.color) || 'random';
        const playerColor = want === 'white' ? 'white' : want === 'black' ? 'black'
            : (Math.random() < 0.5 ? 'white' : 'black');
        this._cpuDifficulty = 'bot';
        this._cpuBot = bot;
        this._cpuBotParams = ChessCourseApp.botCpuParams(bot.elo);
        this._botGame = true;
        this._playerColor = playerColor;
        this._botColor = playerColor === 'white' ? 'black' : 'white';
        // Own perspective at the bottom, like every chess app: the board
        // auto-flips for Black players (manual Flip still toggles view).
        this.boardFlip = playerColor === 'black';
        this._botMood = 'straight';
        this._botSaid = [];
        // Game story: the dialogue system remembers what happened, so later
        // lines can callback ("again", "second gift", "still no castle").
        this._botStory = { blunders: 0, gifts: 0, checks: 0, taunts: 0, lastTauntMove: -99 };
        this._botLastPlayerDelta = null;
        this._botEvalBefore = null; this._botSnapBefore = null;
        this._botMoveInfo = null; this._botLastMove = null;
        this._botSfPrev = null; this._botSfPrevStamp = ''; this._botSfBusy = false;
        // Warm the Stockfish worker now so the first analysis (after the
        // player's first move) doesn't pay the WASM boot cost mid-game,
        // and bank the startpos baseline so move 1 already measures the
        // player's move alone.
        try { if (window.DoChessBotFish) { window.DoChessBotFish.warm(); } } catch (_) {}
        // Preload all three faces so mid-game swaps never flicker.
        try {
            for (const m of ['straight', 'happy', 'angry']) {
                const src = bot.moods && bot.moods[m];
                if (src) { const im = new Image(); im.src = src; }
            }
        } catch (_) {}
        this.currentLesson = l;
        this._buildLessonUI(l);
        // Startpos baseline for the Stockfish coach (move 1 measures clean).
        try { this._botSfBaseline(); } catch (_) {}
        this._go('lesson-screen');
        // Bot plays White: it moves first — same path as every bot reply.
        if (this._botColor === 'white') {
            this.cpuBusy = true;
            this._updateTurnUI();
            this._fb(`Move 1 · ${bot.name} opens…`, 'info');
            setTimeout(() => this._cpuMove(), 700);
        }
        requestAnimationFrame(() => {
            // Bot games open on the FOE, not the board center: the point of
            // the arena is seeing who you face (face, Elo, talk). Centering
            // the board instead buries the opponent above the fold on PC.
            try {
                const arena = document.querySelector('#lesson-screen .arena');
                if (arena) arena.scrollIntoView({ block: 'start' });
            } catch (_) {
                document.getElementById('chess-board-wrapper')?.scrollIntoView({ block: 'center' });
            }
        });
    }

    /* ── Bot dialogue system (chess.com-style) ───────────────────────
        Every bot is a CHARACTER: game events (blunder, brilliant, check,
        gift, win, loss...) route through js/bot-dialogue.js, which speaks
        in that bot's voice with memory of the game story. Talk NEVER names
        machinery (no Stockfish/engine/depth) — personas only. Falls back
        to a plain line if the module failed to load. */

    /** Speak one dialogue event: sets the face, renders the line. */
    _botTalk(event, slots, moveNo) {
        try {
            const bot = this._cpuBot;
            if (!bot) return;
            // Coherence guards: never speak game-over lines mid-game, never
            // celebrate the wrong side, never utter a line with an empty
            // slot ("on " / "100 pawns"). Falls back to a quiet line.
            if (this.game && this.game.gameOver && !/^end/.test(event)) return;
            if (!this.game && /^end/.test(event)) return;
            let ev = event;
            let sl = Object.assign({}, slots || {});
            // Greeting must match who moves first: the roster lines assume
            // the player is White. When the player is Black, say so plainly.
            if (ev === 'greeting' && this._sidePlayer && this._sidePlayer() === 'black') {
                this._botSetMood('straight');
                this._botSay(`Hey! I'm ${bot.name}. I open as White — good luck, defend well!`);
                return;
            }
            // Slots that need a square/piece: without one the sentence is
            // nonsense ("my piece on "). Fall back to a quiet remark.
            if ((ev === 'hanging' || ev === 'tip') && !sl.square) ev = 'quiet';
            if ((ev === 'captureWon' || ev === 'badTrade' || ev === 'evenTrade') && !sl.piece) sl.piece = 'piece';
            if (window.DoChessDialogue) {
                const n = Math.max(1, moveNo || Math.ceil(((this.game && this.game.moveHistory) || []).length / 2) || 1);
                const r = DoChessDialogue.say(bot.id, ev, sl, n);
                if (r && r.text) {
                    this._botSetMood(r.mood || 'straight');
                    this._botSay(r.text);
                    return;
                }
            }
            // Fallback (module missing): short neutral line, correct face.
            this._botSetMood((DoChessDialogue && DoChessDialogue.MOODS[ev]) || 'straight');
            this._botSay('Noted.');
        } catch (_) {}
    }

    /* ── Sides: who is who this game ───────────────────────────────
       Lessons and the classic free game are always player-White; bot
       games follow the per-game draw (_playerColor/_botColor). Every
       color-dependent path below goes through these two getters. */
    _sidePlayer() { return (this._botGame && this._playerColor) ? this._playerColor : 'white'; }
    _sideBot() { return (this._botGame && this._botColor) ? this._botColor : 'black'; }
    _sideName(color) { return color === 'white' ? 'White' : 'Black'; }

    _botSetMood(mood) {
        try {
            const bot = this._cpuBot;
            if (!bot || (mood !== 'straight' && mood !== 'happy' && mood !== 'angry')) return;
            if (this._botMood === mood) return;
            this._botMood = mood;
            const img = document.getElementById('bot-mood-img');
            const src = bot.moods && bot.moods[mood];
            if (img && img.tagName === 'IMG' && src) img.src = src;
            const talk = document.getElementById('bot-talk');
            if (talk) talk.dataset.mood = mood;
        } catch (_) {}
    }

    _botSay(text) {
        try {
            const box = document.getElementById('bot-talk');
            if (!box || !text) return;
            const nm = (this._cpuBot && this._cpuBot.name) || 'Coach';
            // Visible coach chip + message (name appears once), plus a
            // screen-reader speaker tag. Tests read innerText, which still
            // carries the message either way.
            box.dataset.mood = this._botMood || 'straight';
            box.innerHTML = `<span class="sr-only">${esc(nm)} says: </span><span class="coach-name" aria-hidden="true">${esc(nm)}</span><span class="coach-text">${esc(text)}</span>`;
        } catch (_) {}
    }

    /** Pieces of `color` attacked by the enemy and undefended, most
        valuable first (kings excluded). Runs on any game instance; uses
        only legal-move queries, never mutates. */
    _hangList(g, color) {
        const out = [];
        try {
            const foe = color === 'white' ? 'black' : 'white';
            const attacks = (r, c, by) => {
                for (let ar = 0; ar < 8; ar++) for (let ac = 0; ac < 8; ac++) {
                    if (!g.isColor(ar, ac, by)) continue;
                    const mv = g.getLegalMoves([ar, ac]);
                    for (let k = 0; k < mv.length; k++) {
                        if (mv[k][0] === r && mv[k][1] === c) return true;
                    }
                }
                return false;
            };
            const mat = ChessCourseApp._mat();
            for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
                const p = g.board[r][c];
                if (!p || g.colorOf(p) !== color || p.toLowerCase() === 'k') continue;
                if (attacks(r, c, foe) && !attacks(r, c, color)) {
                    out.push({ piece: p.toLowerCase(), sq: [r, c], val: mat[p.toLowerCase()] || 0 });
                }
            }
        } catch (_) {}
        out.sort((a, b) => b.val - a.val);
        return out;
    }

    static BOT_PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

    /** Pure move-quality classifier (centipawns, White's perspective).
        Shared by the live coach path and the test suite, so the thresholds
        below are asserted, not hoped for. */
    static classifyMoveQuality(deltaWhite) {
        const d = Number(deltaWhite) || 0;
        if (d >= 250) return { mood: 'happy', cat: 'brilliant' };
        if (d >= 100) return { mood: 'happy', cat: 'good' };
        if (d <= -250) return { mood: 'angry', cat: 'blunder' };
        if (d <= -100) return { mood: 'angry', cat: 'mistake' };
        return { mood: 'straight', cat: 'quiet' };
    }

    /* ── Post-game review (chess.com-style, beginner-friendly) ──────
       Replays the finished game through the built-in search and grades
       every ply from the mover's perspective:
         brilliant ≥ +250 · great ≥ +150 · good ≥ +60 ·
         inaccuracy ≤ -60 · mistake ≤ -150 · blunder ≤ -300.
       No engine jargon reaches the screen — only counts, icons and one
       plain-language line each. Used by the online result card AND the
       bot game-over card, with a one-tap "Open in Study" handoff. */
    _gradeGameMoves(moveHistory, myColor) {
        const out = { brilliant: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, total: 0, mine: null };
        try {
            const hist = Array.isArray(moveHistory) ? moveHistory : [];
            if (!hist.length || typeof ChessGame === 'undefined') return out;
            // Depth-1 + quiescence: sees hanging pieces and captures (the
            // blunders that matter) at a fraction of depth-2 cost, so the
            // result card never hangs the phone on a 60-move game.
            const score = (g) => { try { return this._botSearchPov(g, 'white', 1); } catch (_) { return 0; } };
            const g = new ChessGame();
            let prev = score(g);
            let started = true;
            const mine = { brilliant: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0, total: 0 };
            hist.forEach((m, i) => {
                try {
                    const mover = (i % 2 === 0) ? 'white' : 'black';
                    const from = g.algebraicToCoords(m.from);
                    const to = g.algebraicToCoords(m.to);
                    let promo = m.promotion || m.promo || null;
                    if (promo && mover === 'white') promo = String(promo).toUpperCase();
                    if (promo && mover === 'black') promo = String(promo).toLowerCase();
                    g.movePiece(from, to, promo);
                    let cur = prev;
                    try { cur = this._botSearchPov(g, 'white', 1); } catch (_) {}
                    const whiteDelta = cur - prev;
                    const delta = mover === 'white' ? whiteDelta : -whiteDelta;
                    prev = cur;
                    // Depth-1 scores run hotter than depth-2, so the review
                    // bands are wider than the live coach's (quiet beginners
                    // should not see "inaccuracy" on 1.e4). Mate-in-1 already
                    // scored is credited to the FINISHER, not the position:
                    // the move that delivers checkmate is always brilliant,
                    // and stalemating is always a mistake.
                    const st = g.getGameStatus();
                    let cat = null;
                    if (st === `checkmate-${mover}`) cat = 'brilliant';
                    else if (st === 'stalemate') cat = 'mistake';
                    else cat = delta >= 300 ? 'brilliant' : delta >= 180 ? 'great'
                        : delta >= 80 ? 'good' : delta <= -400 ? 'blunder'
                        : delta <= -200 ? 'mistake' : delta <= -100 ? 'inaccuracy' : null;
                    if (cat) {
                        out[cat]++;
                        if (!myColor || mover === myColor) mine[cat]++;
                    }
                    out.total++;
                    if (!myColor || mover === myColor) mine.total++;
                } catch (_) {}
            });
            if (started) out.mine = mine;
        } catch (_) {}
        return out;
    }

    _reviewHTML(review, opts) {
        const o = opts || {};
        const r = review && typeof review === 'object' ? review : null;
        const scope = (r && r.mine) || r || { brilliant: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
        const chip = (kind, icon, label) => `
            <div class="review-chip" data-kind="${kind}">
                <span class="review-ico" aria-hidden="true">${icon}</span>
                <div><strong>${scope[kind] || 0} ${label}</strong><span>${this._reviewHint(kind)}</span></div>
            </div>`;
        return `<div class="review-box" aria-label="Game review summary">
            <h4>📊 Game review ${o.titleSuffix ? `· ${esc(o.titleSuffix)}` : ''}</h4>
            <div class="review-grid">
                ${chip('brilliant', '✨', 'Brilliant')}
                ${chip('great', '🌟', 'Great')}
                ${chip('good', '👍', 'Good')}
                ${chip('inaccuracy', '🤔', 'Inaccuracy')}
                ${chip('mistake', '⚠️', 'Mistake')}
                ${chip('blunder', '💥', 'Blunder')}
            </div>
            <div class="review-cta">
                ${o.studyBtn ? `<button class="btn-primary sm" data-action="${esc(o.studyBtn.action)}" ${o.studyBtn.game ? `data-game="${esc(o.studyBtn.game)}"` : ''} type="button">🔍 ${esc(o.studyBtn.label || 'Open in Study')}</button>` : ''}
                ${o.rematchBtn ? `<button class="btn-secondary sm" data-action="online-rematch" type="button">↺ Rematch</button>` : ''}
            </div>
        </div>`;
    }

    _reviewHint(kind) {
        return {
            brilliant: 'Best move!',
            great: 'Excellent!',
            good: 'Solid play',
            inaccuracy: 'Slightly off',
            mistake: 'Lost ground',
            blunder: 'Costly error'
        }[kind] || '';
    }

    /** Rate the player's just-played move and react as a coach. Call only
        in bot mode, right after White's move, while the game continues.
        Two layers: an INSTANT verdict from our own engine and attack maps
        (facts + swing, always works, even on file://), then a Stockfish
        refinement that corrects the mood only when the real engine
        disagrees across a mood boundary. Numbers never reach the screen —
        only words. */
    _botCoachMove() {
        let ownDelta = 0;
        try {
            const bot = this._cpuBot;
            if (!bot || !this.game) return;
            const g = this.game;
            const names = ChessCourseApp.BOT_PIECE_NAMES;
            const me = this._sidePlayer();
            const foe = this._sideBot();
            const before = (typeof this._botEvalBefore === 'number') ? this._botEvalBefore : null;
            const after = this._botSearchPov(g, me, 2); // player's perspective
            // The player gained when their own search score rises.
            const delta = (before === null) ? 0 : (after - before);
            const moveNo = Math.max(1, Math.ceil(g.moveHistory.length / 2));
            const last = this._botLastMove || {};
            const info = this._botMoveInfo || {};
            const status = g.getGameStatus();
            const capName = (typeof last.captured === 'string' && last.captured)
                ? (names[last.captured.toLowerCase()] || 'piece') : '';
            // New hangs: the PLAYER's pieces hanging now that were safe before.
            let newHang = null;
            try {
                if (this._botSnapBefore) {
                    const gb = new ChessGame();
                    gb.restore(this._botSnapBefore);
                    const was = new Set(this._hangList(gb, me).map(h => h.sq.join(',')));
                    const now = this._hangList(g, me);
                    newHang = now.find(h => !was.has(h.sq.join(','))) || null;
                }
            } catch (_) { newHang = null; }
            const hangName = newHang ? (names[newHang.piece] || 'piece') : '';
            const movedPc = (info.piece || '').toLowerCase();
            const homeRow = me === 'white' ? 7 : 0;
            const from = info.from || null, to = info.to || null;
            const alg = (sq) => { try { return this.game.coordsToAlgebraic(sq); } catch (_) { return ''; } };
            const moveSq = (from && to) ? `${alg(from)}→${alg(to)}` : '';
            const hangSq = newHang ? alg(newHang.sq) : '';
            const pawns = (cp) => {
                const v = Math.abs(Math.round(cp / 10) / 10);
                return `≈${v} pawn${v === 1 ? '' : 's'}`;
            };
            const isCastle = movedPc === 'k' && from && to && from[0] === homeRow && to[0] === homeRow
                && Math.abs(to[1] - from[1]) === 2;
            const toCenter = to && ((to[0] === 3 || to[0] === 4) && (to[1] === 3 || to[1] === 4));
            const developed = (movedPc === 'n' || movedPc === 'b') && from && from[0] === homeRow && moveNo <= 10;
            let mood = 'straight', text = '';
            // Anti-repeat: the same sentence never comes twice in a row —
            // recent lines are filtered out before rotating by move number.
            const pick = (arr) => {
                try {
                    const said = this._botSaid || [];
                    const fresh = arr.filter(t => !said.includes(t));
                    const pool = fresh.length ? fresh : arr;
                    return pool[moveNo % pool.length];
                } catch (_) { return arr[moveNo % arr.length]; }
            };
            const remember = (t) => {
                try {
                    this._botSaid = (this._botSaid || []).concat([t]).slice(-6);
                } catch (_) {}
            };
            // Forward-looking plan, read off the LIVE position: a loose
            // black piece to win, an undeveloped minor with a real square,
            // a king that still needs castling, or a center break. Used
            // instead of judging the past move, so advice never repeats.
            const planTip = this._botPlanTip();
            // Quiet positions alternate between judging and advising, so two
            // calm moves in a row never lecture the same way twice.
            const advise = !!(planTip && ((moveNo + g.moveHistory.length) % 2 === 1));
            // Every line is a verdict on THIS move: what it did to the
            // position and why. Praise is earned by the eval swing, never
            // handed out — and mistakes are named (hanging piece + square,
            // material lost), never smoothed over.
            // Slots for the dialogue system: concrete facts, persona voice.
            // Mate-scale swings (|delta| >= 90000) are checkmates, not pawn
            // counts — they route to dedicated mate lines ("1000 pawns" is
            // never uttered) and the display value is capped regardless.
            const pawnStr = (cp) => {
                const v = Math.min(12, Math.abs(Math.round(cp / 10) / 10));
                return `${v} pawn${v === 1 ? '' : 's'}`;
            };
            const infoPc = (info.piece || '').toLowerCase();
            const pieceSlot = hangName || capName || (names[infoPc] || 'piece');
            const sqSlot = hangSq || (to ? alg(to) : '');
            const story = this._botStory || (this._botStory = { blunders: 0, gifts: 0, checks: 0, taunts: 0, lastTauntMove: -99 });
            const slots = () => ({
                piece: pieceSlot, square: sqSlot, move: moveSq || 'that move',
                pawns: pawnStr(delta), n: story.blunders || 0,
            });
            const evt = (e, extra) => this._botTalk(e, Object.assign(slots(), extra || {}), moveNo);
            // Position truth -> dialogue EVENT; each persona speaks it in
            // its own voice (js/bot-dialogue.js). Mistakes are always
            // called out; quiet spots alternate verdict and live plan tip.
            if (delta <= -90000) {
                story.blunders++;
                evt('mated');
            } else if (delta >= 90000) {
                evt('mateCall');
            } else if (newHang && newHang.val >= 300 && delta <= -80) {
                story.blunders++;
                evt('hanging');
            } else if (delta >= 250) {
                evt('brilliant');
            } else if (last.captured && delta <= -80) {
                story.blunders++;
                evt('badTrade');
            } else if (delta <= -350) {
                story.blunders++;
                evt('blunder');
            } else if (delta <= -150) {
                story.blunders++;
                evt('mistake');
            } else if (delta <= -80) {
                evt('inaccuracy');
            } else if (last.captured && delta >= 80) {
                evt('captureWon');
            } else if (last.captured) {
                evt('evenTrade');
            } else if (status.startsWith(`check-${foe}`)) {
                // The BOT is in check (player just gave check): celebrate the
                // player. The old code fired on check-black regardless of
                // sides, so it cheered when the PLAYER was mated-in-spirit.
                story.checks++;
                evt('checkGiven', { square: sqSlot });
            } else if (status.startsWith('check-') && !status.startsWith(`check-${foe}`)) {
                // Player is in check: own it as danger, not praise.
                evt('inaccuracy');
            } else if (isCastle) {
                evt('castle');
            } else if (developed && delta > -80) {
                evt('develop');
            } else if (toCenter && (movedPc === 'p' || movedPc === 'n') && delta > -80) {
                evt('center');
            } else if (delta >= 100) {
                evt('good');
            } else if (moveNo <= 3) {
                evt('opening');
            } else if (advise) {
                this._botSetMood('straight');
                this._botSay(planTip);
                remember(planTip);
            } else {
                evt('quiet');
            }

            ownDelta = delta;
            // Remember the player's swing: a decisive verdict (brilliant or
            // blunder) keeps the microphone — the bot's own-move reaction
            // must not stomp it one second later in _commitCpuMove.
            try { this._botLastPlayerDelta = delta; } catch (_) {}
        } catch (_) {}
        // Stockfish second opinion (async): corrects the mood only when
        // the real engine disagrees across a mood boundary. Silent when
        // Stockfish cannot run here — the instant verdict above stands.
        try { this._botSfJudge(ownDelta); } catch (_) {}
    }

    /** UCI move list for the Stockfish worker from a move history. */
    _botMovesUci(hist) {
        return (hist || []).map(m => {
            if (!m || !m.from || !m.to) return '';
            const pr = m.promotion ? String(m.promotion).toLowerCase().slice(-1) : '';
            return (m.from + m.to + pr).replace(/[^a-h1-8qrbn]/g, '');
        }).filter(Boolean);
    }

    /** Stockfish baseline: score of the position BEFORE the player's move.
        Taken once per White-to-move (game start = startpos, otherwise right
        after the bot replies), so the post-move analysis below measures the
        player's move ALONE — never the bot's reply folded in. */
    _botSfBaseline() {
        try {
            if (!this._botGame || !this._cpuBot || !this.game || this.game.gameOver) return;
            if (!window.DoChessBotFish) return;
            const movesUci = this._botMovesUci(this.game.moveHistory);
            const stamp = movesUci.join(',');
            window.DoChessBotFish.analyze(movesUci, { depth: 9, timeoutMs: 2200 }).then((r) => {
                try {
                    if (!r || !r.ok) return;
                    if (!this._botGame || !this.game) return;
                    this._botSfPrev = r.whiteCp;
                    this._botSfPrevStamp = stamp;
                } catch (_) {}
            }).catch(() => {});
        } catch (_) {}
    }

    /** Stockfish verdict on the player's just-played move — the PRIMARY
        judge, not a tiebreaker. The instant own-engine verdict is already
        showing; this replaces it with the real engine's truth whenever the
        baseline is fresh (and always explains WHY, like a teacher). Silent
        when Stockfish cannot run here — the instant verdict stands. */
    _botSfJudge(ownDelta) {
        try {
            if (!this._botGame || !this._cpuBot || !this.game || this.game.gameOver) return;
            if (!window.DoChessBotFish) return;
            const hist = this.game.moveHistory || [];
            if (!hist.length) return;
            const movesUci = this._botMovesUci(hist);
            if (!movesUci.length) return;
            const moveNo = Math.max(1, Math.ceil(hist.length / 2));
            const stamp = movesUci.join(',');
            // Position BEFORE this move = history minus the last move.
            const beforeStamp = movesUci.slice(0, -1).join(',');
            const facts = this._botMoveFacts();
            window.DoChessBotFish.analyze(movesUci, { depth: 11, timeoutMs: 4000 }).then((r) => {
                try {
                    if (!r || !r.ok) return; // fallback: instant verdict stands
                    if (!this._botGame || !this._cpuBot || !this.game || this.game.gameOver) return;
                    // Stale: the player already moved again.
                    const now = this._botMovesUci(this.game.moveHistory).join(',');
                    if (now !== stamp) return;
                    // Baseline must be the pre-move position; anything else
                    // would blame the player for the bot's own reply. The
                    // worker scores White's view; flip for Black players so
                    // the verdict reads in the PLAYER's perspective.
                    if (typeof this._botSfPrev === 'number' && this._botSfPrevStamp === beforeStamp) {
                        const whiteDelta = r.whiteCp - this._botSfPrev;
                        const sfDelta = this._sidePlayer() === 'white' ? whiteDelta : -whiteDelta;
                        this._botSfPrev = r.whiteCp;
                        this._botSfPrevStamp = stamp;
                        this._botApplySfVerdict(sfDelta, ownDelta, moveNo, facts);
                    } else {
                        // No trustworthy baseline yet (e.g. mid-game entry):
                        // bank this score so the NEXT move measures cleanly.
                        this._botSfPrev = r.whiteCp;
                        this._botSfPrevStamp = stamp;
                    }
                } catch (_) {}
            }).catch(() => {});
        } catch (_) {}
    }

    /** Concrete facts about the player's last move for teacher verdicts:
        hanging piece + square, bad/good trade, check, castle, development,
        center — shared by the instant and Stockfish paths so both speak
        about the same position. */
    _botMoveFacts() {
        const out = { hangName: '', hangSq: '', capName: '', checking: false, castle: false, developed: false, center: false, moveSq: '' };
        try {
            const g = this.game;
            if (!g) return out;
            const me = this._sidePlayer(), foe = this._sideBot();
            const homeRow = me === 'white' ? 7 : 0;
            const names = ChessCourseApp.BOT_PIECE_NAMES;
            const info = this._botMoveInfo || {};
            const last = this._botLastMove || {};
            if (this._botSnapBefore) {
                const gb = new ChessGame();
                gb.restore(this._botSnapBefore);
                const was = new Set(this._hangList(gb, me).map(h => h.sq.join(',')));
                const now = this._hangList(g, me);
                const nh = now.find(h => !was.has(h.sq.join(','))) || null;
                if (nh) {
                    out.hangName = names[nh.piece] || 'piece';
                    try { out.hangSq = g.coordsToAlgebraic(nh.sq); } catch (_) {}
                }
            }
            if (typeof last.captured === 'string' && last.captured) out.capName = names[last.captured.toLowerCase()] || 'piece';
            else if (last.captured) out.capName = 'piece';
            const movedPc = (info.piece || '').toLowerCase();
            const from = info.from || null, to = info.to || null;
            if (from && to) {
                try { out.moveSq = `${g.coordsToAlgebraic(from)}→${g.coordsToAlgebraic(to)}`; } catch (_) {}
            }
            out.checking = g.getGameStatus().startsWith(`check-${foe}`);
            out.castle = movedPc === 'k' && from && to && from[0] === homeRow && to[0] === homeRow && Math.abs(to[1] - from[1]) === 2;
            out.center = !!(to && ((to[0] === 3 || to[0] === 4) && (to[1] === 3 || to[1] === 4)) && (movedPc === 'p' || movedPc === 'n'));
            const moveNo = Math.max(1, Math.ceil((g.moveHistory || []).length / 2));
            out.developed = (movedPc === 'n' || movedPc === 'b') && from && from[0] === homeRow && moveNo <= 10;
        } catch (_) {}
        return out;
    }

    /** Forward-looking coaching read off the LIVE position (whoever just
        moved, it is the PLAYER's plan that matters — either army). Every
        tip names real squares and pieces, verified legal where a move is
        suggested. Returns null when nothing concrete applies. */
    _botPlanTip() {
        try {
            const g = this.game;
            if (!g || g.gameOver) return null;
            const me = this._sidePlayer(), foe = this._sideBot();
            const names = ChessCourseApp.BOT_PIECE_NAMES;
            const alg = (sq) => { try { return g.coordsToAlgebraic(sq); } catch (_) { return ''; } };
            const moveNo = Math.max(1, Math.ceil((g.moveHistory || []).length / 2));
            const myK = me === 'white' ? 'K' : 'k';
            const myN = me === 'white' ? 'N' : 'n';
            const myB = me === 'white' ? 'B' : 'b';
            const myP = me === 'white' ? 'P' : 'p';
            const eHome = me === 'white' ? 'e1' : 'e8';
            // 1) A loose FOE piece the player can win: name it and its square.
            try {
                const loose = this._hangList(g, foe);
                if (loose && loose.length) {
                    const t = loose[0];
                    const nm = names[t.piece] || 'piece';
                    return `My ${nm} on ${alg(t.sq)} has no defender — find the move that wins it. Free material decides games.`;
                }
            } catch (_) {}
            // 2) King still in the center past the opening: castle now.
            try {
                let kc = null;
                try { kc = g.algebraicToCoords(eHome); } catch (_) { kc = null; }
                if (moveNo >= 3 && kc && g.board[kc[0]][kc[1]] === myK) {
                    const km = g.getLegalMoves(kc) || [];
                    const homeRow = kc[0];
                    const castle = km.find(m => m[0] === homeRow && (m[1] === 6 || m[1] === 2));
                    if (castle) {
                        const side = castle[1] === 6 ? 'kingside' : 'queenside';
                        return `Castle ${side} (${alg(kc)} to ${alg(castle)}) while it is safe — a center king turns every tactic against you.`;
                    }
                    return 'Your king still sits in the center. Tuck it away behind pawns before you start anything ambitious.';
                }
            } catch (_) {}
            // 3) Undeveloped minor on its home square with a real destination.
            try {
                const dev = me === 'white'
                    ? { homes: ['g1', 'b1', 'c1', 'f1'], wants: { g1: ['f3', 'h3'], b1: ['c3', 'a3'], c1: ['f4', 'g5', 'e3'], f1: ['c4', 'b5', 'e2'] } }
                    : { homes: ['g8', 'b8', 'c8', 'f8'], wants: { g8: ['f6', 'h6'], b8: ['c6', 'a6'], c8: ['f5', 'g4', 'e6'], f8: ['c5', 'b4', 'e7'] } };
                for (const from of dev.homes) {
                    let fc = null;
                    try { fc = g.algebraicToCoords(from); } catch (_) { continue; }
                    const pc = g.board[fc[0]][fc[1]];
                    if (!pc || (pc !== myN && pc !== myB)) continue;
                    const legal = new Set((g.getLegalMoves(fc) || []).map(m => alg(m)));
                    const dest = (dev.wants[from] || []).find(s => legal.has(s)) || [...legal][0];
                    if (!dest) continue;
                    const pnm = pc === myN ? 'knight' : 'bishop';
                    return `Develop your ${pnm} from ${from} to ${dest} — it fights for the center and frees your back rank. Undeveloped pieces are just spectators.`;
                }
            } catch (_) {}
            // 4) Unclaimed center: push a center pawn if it can go.
            try {
                const pushes = me === 'white'
                    ? [['d2', 'd4'], ['e2', 'e4']] : [['d7', 'd5'], ['e7', 'e5']];
                for (const [from, dest] of pushes) {
                    let fc = null;
                    try { fc = g.algebraicToCoords(from); } catch (_) { continue; }
                    if (g.board[fc[0]][fc[1]] !== myP) continue;
                    const legal = new Set((g.getLegalMoves(fc) || []).map(m => alg(m)));
                    if (legal.has(dest)) return `Claim the middle with ${from} to ${dest} — central pawns back every plan you will ever make.`;
                }
            } catch (_) {}
            return null;
        } catch (_) { return null; }
    }

    /** Apply a Stockfish verdict if (and only if) it crosses a mood
        boundary versus the instant one AND disagrees by a real margin
        (engine noise near a threshold must never flip-flop the face).
        The message is always a teacher's explanation grounded in the
        move facts — never a bare grade. Returns true when applied —
        exposed for tests with synthetic deltas, no worker needed. */
    _botApplySfVerdict(sfDelta, ownDelta, moveNo, facts) {
        try {
            if (!Number.isFinite(sfDelta) || !Number.isFinite(ownDelta)) return false;
            if (Math.abs(sfDelta - ownDelta) <= 120) return false;
            const moodOf = (d) => ChessCourseApp.classifyMoveQuality(d).mood;
            const sfMood = moodOf(sfDelta);
            const ownMood = moodOf(ownDelta);
            if (sfMood === ownMood) return false;
            const n = Math.max(1, moveNo || 1);
            const f = facts || {};
            const v = Math.min(12, Math.abs(Math.round(sfDelta / 10) / 10));
            const pawnStr = `${v} pawn${v === 1 ? '' : 's'}`;
            // Mate-scale truth speaks as mate, never as pawn counts.
            let event = 'quiet';
            if (sfDelta <= -90000) event = 'mated';
            else if (sfDelta >= 90000) event = 'mateCall';
            else if (sfMood === 'happy') event = 'brilliant';
            else if (sfMood === 'angry') {
                event = 'blunder';
                try {
                    const st = this._botStory || (this._botStory = { blunders: 0, gifts: 0, checks: 0, taunts: 0, lastTauntMove: -99 });
                    st.blunders++;
                } catch (_) {}
            }
            this._botTalk(event, {
                piece: f.hangName || f.capName || 'piece',
                square: f.hangSq || '',
                move: f.moveSq || 'that move',
                pawns: pawnStr,
                n: (this._botStory && this._botStory.blunders) || 0,
            }, n);
            return true;
        } catch (_) { return false; }
    }

    /** The bot's own move, judged the same way: when a weak bot hangs
        something, it owns up IN CHARACTER (Alex panics, Atlas quakes) —
        that's when personas shine brightest, and it teaches spotting
        blunders. Strong moves get persona-scaled menace, not gloating. */
    _botReactToOwnMove() {
        try {
            const bot = this._cpuBot;
            if (!bot || !this.game || !this._botGame) return;
            const before = (typeof this._botEngineBefore === 'number') ? this._botEngineBefore : null;
            if (before === null) return;
            const after = this._botSearchPov(this.game, this._sidePlayer(), 2);
            const swing = after - before; // + = good for the player
            const deltaBlack = this._sideBot() === 'black' ? -swing : swing; // + = good for the bot
            const moveNo = Math.max(1, Math.ceil(this.game.moveHistory.length / 2));
            const story = this._botStory || (this._botStory = { blunders: 0, gifts: 0, checks: 0, taunts: 0, lastTauntMove: -99 });
            if (deltaBlack <= -200) {
                story.gifts++;
                // Name what was hung so the player learns to LOOK.
                let hung = '';
                try {
                    const hangs = this._hangList(this.game, this._sideBot());
                    if (hangs && hangs.length) {
                        const names = ChessCourseApp.BOT_PIECE_NAMES;
                        hung = names[hangs[0].piece] || 'piece';
                    }
                } catch (_) {}
                this._botTalk('botGift', { piece: hung || 'piece', n: story.gifts }, moveNo);
                return true;
            } else if (deltaBlack >= 250) {
                this._botTalk('botProud', { n: moveNo }, moveNo);
                return true;
            }
            return false;
        } catch (_) {}
    }

    _botGameEnd(kind) {
        try {
            if (!this._botGame || !this._cpuBot) return;
            // Endings in character: Alex begs for rematches, Atlas quakes.
            if (kind === 'win') this._botTalk('endLoss', {});
            else if (kind === 'loss') this._botTalk('endWin', {});
            else this._botTalk('endDraw', {});
        } catch (_) {}
    }

    /** Lead taunt: when the bot is clearly ahead (or behind) it says so IN
        CHARACTER — Max menaces, Alex marvels, Atlas thunders. Gated: only
        from move 8+, at most every 6 moves, and never twice in a row after
        a verdict (the coach just spoke). Skipped while the game is over. */
    _botLeadTaunt() {
        try {
            const bot = this._cpuBot;
            if (!bot || !this.game || !this._botGame || this.game.gameOver) return;
            const st = this._botStory || (this._botStory = { blunders: 0, gifts: 0, checks: 0, taunts: 0, lastTauntMove: -99 });
            const moveNo = Math.max(1, Math.ceil((this.game.moveHistory || []).length / 2));
            if (moveNo < 8 || moveNo - st.lastTauntMove < 6) return;
            let lead = 0; // + = bot ahead, either color
            try { lead = this._evaluate(this.game); } catch (_) { return; }
            if (this._sideBot() === 'white') lead = -lead;
            const trash = (window.DoChessDialogue && DoChessDialogue.PERSONAS[bot.id]
                && DoChessDialogue.PERSONAS[bot.id].trash) || 1;
            if (lead >= 200 && Math.random() < 0.25 + trash * 0.2) {
                st.taunts++; st.lastTauntMove = moveNo;
                this._botTalk('winning', { n: moveNo }, moveNo);
            } else if (lead <= -200 && Math.random() < 0.3) {
                st.taunts++; st.lastTauntMove = moveNo;
                this._botTalk('losing', { n: moveNo }, moveNo);
            }
        } catch (_) {}
    }

    showVsBots() {
        try { document.body.classList.remove('is-playing'); } catch (_) {}
        this._go('vs-bots-screen');
        this._renderVsBots();
    }

    _botAvatarHTML(bot, size, id) {
        const s = size || 52;
        const src = bot && typeof bot.avatar === 'string' && bot.avatar ? bot.avatar : null;
        const nm = (bot && bot.name) || 'Bot';
        const idAttr = id ? ` id="${id}"` : '';
        // width/height attrs reserve the square before CSS loads so the
        // tall portrait source can never stretch the layout; CSS
        // (object-fit: cover, rounded-rect) does the actual presentation.
        if (src) {
            return `<img class="avatar bot-avatar"${idAttr} src="${esc(src)}" width="${s}" height="${s}" loading="eager" fetchpriority="high" draggable="false" alt="${esc(nm)}" style="aspect-ratio:1/1" onerror="this.outerHTML='<span class=&quot;avatar bot-letter&quot; aria-hidden=&quot;true&quot;>${esc(nm[0].toUpperCase())}</span>'">`;
        }
        return `<span class="avatar bot-letter"${idAttr} aria-hidden="true">${esc(nm[0].toUpperCase())}</span>`;
    }

    /** One-line skill label so the ladder reads honestly at a glance. */
    static botSkill(elo) {
        const e = Number(elo) || 0;
        if (e <= 300) return 'Beginner';
        if (e <= 600) return 'Casual';
        if (e <= 1000) return 'Club';
        if (e <= 1400) return 'Strong club';
        if (e <= 1800) return 'Expert';
        return 'Master';
    }

    _renderVsBots() {
        const box = document.getElementById('vs-bots-content');
        if (!box) return;
        const cards = ChessCourseApp.BOTS.map(b => {
            // Roster shows the persona's revealed playstyle (chess.com-style:
            // you know WHO you face before move one), falling back to blurb.
            let flavor = b.blurb || '';
            try {
                if (window.DoChessDialogue) {
                    const st = DoChessDialogue.styleFor(b.id);
                    if (st) flavor = st;
                }
            } catch (_) {}
            return `
            <article class="bot-card" data-bot="${esc(b.id)}">
                <div class="bot-top">${this._botAvatarHTML(b, 72)}
                    <div class="bot-id"><strong>${esc(b.name)}</strong>
                    <span class="bot-elo">${b.elo} Elo · ${esc(ChessCourseApp.botSkill(b.elo))}</span></div>
                </div>
                <p class="bot-blurb">${esc(flavor)}</p>
                <button class="btn-primary sm" data-action="vs-bot" data-bot="${esc(b.id)}" type="button">Play ${esc(b.name)}</button>
            </article>`; }).join('');
        box.innerHTML = `
            <p class="lobby-hint">Practice against bots from 200 to 2000+ Elo. No account needed — pick your opponent and play a full game as White.</p>
            <div class="bot-grid">${cards}</div>`;
    }

    /* ── Bot arena: the same board component as lessons (same element
       ids, so all game logic just works), but its own shell — no lesson
       number, teacher, lecture notes, Complete or Next buttons. Practice
       games never touch course progress. ── */
    _buildBotArenaUI(l, bot) {
        const playerColor = this._sidePlayer(), botColor = this._sideBot();
        const PC = this._sideName(playerColor), BC = this._sideName(botColor);
        try {
            // The arena ships its own ← Bots navigation; the lesson back
            // button above it would double up, so it hides in bot mode
            // (and _buildLessonUI restores it for real lessons).
            const back = document.getElementById('lesson-back-btn');
            if (back) back.style.display = 'none';
        } catch (_) {}
        document.getElementById('lesson-content').innerHTML = `
            <div class="lesson-detail-header bot-header">
                <button class="btn-secondary sm" data-action="back-bots" type="button" aria-label="Back to all bots">← Bots</button>
                <div class="lesson-title">
                    <div><h2>Vs ${esc(bot.name)}</h2><p>${bot.elo} Elo · ${esc(ChessCourseApp.botSkill(bot.elo))} · practice game — you are ${PC}</p></div>
                </div>
            </div>
            <div class="lesson-content">
                <div class="arena bot-arena">
                    <div class="profile-card opponent" id="profile-opp">
                        ${this._botAvatarHTML(bot, 60, 'bot-mood-img')}
                        <div class="info">
                            <span class="name">${esc(bot.name)}</span>
                            <span class="sub">${bot.elo} Elo · ${BC}</span>
                            <div class="captured-row" data-cap="opp"></div>
                        </div>
                        <div class="turn-indicator" id="ti-opp">Waiting</div>
                    </div>
                    <div class="bot-talk" id="bot-talk" data-mood="straight" role="status" aria-live="polite"><span class="coach-name">${esc(bot.name)}</span><span class="coach-text">Hey! I'm ${esc(bot.name)}. You are ${PC} — ${playerColor === 'white' ? 'you start!' : 'I start — good luck!'}</span></div>
                    <div class="sticky-actions" id="lesson-sticky">
                        <span class="sticky-label" id="lesson-sticky-label">Vs ${esc(bot.name)}</span>
                        <span class="sticky-count"><span id="lesson-sticky-score">0</span> moves</span>
                        <button class="btn-secondary sm" data-action="reset-board" type="button" title="Rematch"><span class="btn-icon">↺</span> Rematch</button>
                        <button class="btn-secondary sm" data-action="flip-board" type="button" title="Flip board"><span class="btn-icon">⇄</span> Flip</button>
                        <button class="btn-secondary sm" data-action="swap-sides" type="button" title="New game with colors swapped"><span class="btn-icon">⇄</span> Swap sides</button>
                        <button class="btn-secondary sm" data-action="back-bots" type="button" title="Change bot">Change bot</button>
                        <button class="icon-btn" id="lesson-focus-toggle" data-focus-toggle type="button"
                                aria-expanded="true" aria-controls="lesson-screen"
                                aria-label="Hide everything except the board" title="Focus mode">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v18M16 3v18"/></g></svg>
                        </button>
                    </div>

                    <div id="chess-board-wrapper"><div id="chess-board" role="group" aria-label="Chess board"></div></div>
                    <div id="promotion-picker" class="promotion-picker hidden"></div>
                    <div id="lesson-feedback" class="feedback info" role="status" aria-live="polite">
                        Move 1 · ${playerColor === 'white' ? `Your move (${PC})` : `${esc(bot.name)} opens…`}
                    </div>

                    <div class="profile-card player" id="profile-you">
                        <img class="avatar" src="${this._pieceFile(playerColor === 'white' ? 'P' : 'p')}" width="52" height="52" alt="You (${PC})" style="background:var(--primary-surface);border-radius:50%;padding:6px;">
                        <div class="info">
                            <span class="name">You</span>
                            <span class="sub">${PC}</span>
                            <div class="captured-row" data-cap="you"></div>
                        </div>
                        <div class="turn-indicator" id="ti-you">${playerColor === 'white' ? 'Your turn' : 'Waiting'}</div>
                    </div>
                </div>
                <div class="lesson-dashboard">
                    <div class="dashboard-section">
                        <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Move Log</h4>
                        <div class="move-log" id="move-log" role="log" aria-live="polite" aria-label="Move log"><span style="color:var(--text-muted-dim)">No moves yet — select a ${playerColor === 'white' ? 'white' : 'black'} piece to begin.</span></div>
                    </div>
                    <div class="lesson-actions">
                        <button class="btn-secondary" data-action="reset-board">Rematch</button>
                        <button class="btn-secondary" data-action="flip-board" title="Flip board" aria-label="Flip board">Flip</button>
                        <button class="btn-secondary" data-action="swap-sides" title="New game with colors swapped">Swap sides</button>
                        ${this._muteBtnHTML()}
                        <button class="btn-secondary" data-action="back-bots" type="button">All bots</button>
                    </div>`;

        this._initBoard(l);
        // Persona greeting (chess.com bots introduce themselves in voice).
        try {
            if (window.DoChessDialogue) DoChessDialogue.reset(bot.id);
            this._botTalk('greeting', {}, 1);
        } catch (_) {}
    }

    _buildLessonUI(l) {
        try {
            const back = document.getElementById('lesson-back-btn');
            if (back) { back.style.display = ''; back.textContent = '← Back to Lessons'; back.dataset.action = 'back-lessons'; }
        } catch (_) {}
        const t    = this.teachers.find(x => x.id === l.teacherId);
        const free = l.type === 'free-game';
        const done = this.completedLessons ? this.completedLessons.has(l.id) : false;
        // Practice-bot games get their own arena shell (no lesson chrome).
        if (free && this._botGame && this._cpuBot) { this._buildBotArenaUI(l, this._cpuBot); return; }

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
                        <!-- Next stage sits with the controls under the Move Log.
                             Deliberately .btn-cta, NOT .btn-primary — the primary
                             action of a lesson stays uniquely "Complete Lesson". -->
                        <button class="btn-cta" data-action="next-lesson" id="next-lesson-btn" type="button"
                                title="Jump to the next lesson">Next lesson →</button>
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
        this._drawnMoves = 0; // fresh game: the first move glides again
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
            // Piece <img>: the node is FOREVER — only its pixels change.
            // Swapping src on the live node keeps the old bitmap painted
            // until the new one decodes (no blank frame); replacing the
            // node (replaceWith) flashes empty for a frame on every
            // capture, which reads as pieces blinking out and back.
            let img = sq.querySelector('img.chess-piece, svg.chess-piece');
            if (piece) {
                const wantSrc = this._pieceFile(piece);
                if (img && img.tagName === 'IMG' && img.dataset.fallbackPiece === piece && img.getAttribute('src') === wantSrc) {
                    // unchanged — keep node (no re-decode)
                } else if (img && img.tagName === 'IMG') {
                    img.setAttribute('src', wantSrc);
                    img.dataset.fallbackPiece = piece;
                    try { img.alt = this._pieceLabel(piece); } catch (_) {}
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
            // Promotion swaps the glyph mid-glide (a pawn clone gliding over
            // the fresh queen): skip the glide there, the piece just appears.
            if (!lastHist.promotion) push(lastHist.from, lastHist.to);
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
                // The arrived piece is ALREADY painted in place by the sync
                // above; the clone glides over it and is removed on landing.
                // (An older revision hid the destination piece for the
                // flight — any overlapping draw left it hidden, which read
                // as pieces blinking out and back. Never hide board state
                // for decoration.)
                const img = document.createElement('img');
                img.src = f.src;
                img.className = (f.cls + ' fly-piece').trim();
                img.alt = '';
                img.style.left = f.x + 'px';
                img.style.top = f.y + 'px';
                img.style.width = f.size + 'px';
                img.style.height = f.size + 'px';
                img.dataset.flyClone = '1';
                board.appendChild(img);
                const anim = img.animate(
                    [{ transform: 'translate(0, 0)' }, { transform: `translate(${cx - f.x}px, ${cy - f.y}px)` }],
                    { duration: 240, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
                );
                let landed = false;
                const land = () => { if (landed) return; landed = true; img.remove(); };
                try {
                    anim.onfinish = land;
                    if (anim.finished && anim.finished.catch) anim.finished.catch(() => land());
                } catch (_) {}
                // Safety net: never leave a stray clone behind.
                setTimeout(land, 600);
            });
        }

        // Selection-only repaints skip the expensive extras: the move log,
        // turn speech/status scan and captured rows only change on moves.
        // Selection callers pass { light: true } (see _click).
        if (!light) {
            this._updateMoveLog();
            this._updateTurnUI();
            this._paintCaptured('lesson-content', this.game, this._sidePlayer());
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
        if (this.game.currentPlayer !== this._sidePlayer()) return;
        if (this.game.gameOver) return;

        const g = this.game;

        // Selection never changes log/turn/captured — light sync only.
        const paintSel = () => this._draw({ light: true });
        if (!g.selectedSquare) {
            if (g.board[r][c] && g.isColor(r, c, this._sidePlayer())) {
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
            } else if (g.board[r][c] && g.isColor(r, c, this._sidePlayer())) {
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
        // Coach snapshot: search-scored BEFORE the move lands (in the
        // PLAYER's view, whichever army that is) so the swing can be
        // judged after it (bot games only). The pre-move snapshot powers
        // hang detection on a throwaway board.
        if (this._botGame && this._cpuBot && this.game && !this.game.gameOver) {
            try { this._botEvalBefore = this._botSearchPov(this.game, this._sidePlayer(), 2); } catch (_) { this._botEvalBefore = null; }
            try {
                const pc = this.game.board[from[0]][from[1]];
                this._botSnapBefore = this.game.snapshot();
                this._botMoveInfo = { piece: (pc || '').toLowerCase() || '', from: [from[0], from[1]], to: [to[0], to[1]] };
            } catch (_) { this._botSnapBefore = null; this._botMoveInfo = null; }
            this._botLastMove = { captured: false, promo: false };
        }
        const result = this.game.movePiece(from, to);
        if (result === 'promotion-needed') {
            this._draw();
            this._showPromotion(from, to, this._sidePlayer());
            return;
        }
        if (this._botGame && result && typeof result === 'object') {
            this._botLastMove = { captured: !!result.captured, promo: false };
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
            const mine = winner === this._sidePlayer();
            const bot = this._botGame ? this._cpuBot : null;
            const msg = mine
                ? 'Checkmate! You win! Magnificent play!'
                : `Checkmate! ${(bot && bot.name) || 'The computer'} wins. Study the position and try again!`;
            this._fb(msg, mine ? 'success' : 'error');
            this.game.gameOver = true;
            if (mine) { this.snd.playSuccess(); }
            if (mine && !this._botGame) this.markDone(this.currentLesson.id);
            if (this._botGame) this._botGameEnd(mine ? 'win' : 'loss');
            this._updateTurnUI();
            return;
        }
        if (status === 'stalemate') {
            this._fb("Stalemate! It's a draw — no legal moves.", 'info');
            this.game.gameOver = true;
            if (this._botGame) this._botGameEnd('draw');
            this._updateTurnUI(); return;
        }
        if (status.startsWith('draw-')) {
            const msgs = {
                'draw-insufficient': 'Draw — neither side can possibly checkmate.',
                'draw-repetition': 'Draw by threefold repetition — same position three times.',
                'draw-fifty': 'Draw by the fifty-move rule — 50 moves with no pawn move or capture.'
            };
            this._fb(msgs[status] || "It's a draw.", 'info');
            this.game.gameOver = true;
            if (this._botGame) this._botGameEnd('draw');
            this._updateTurnUI(); return;
        }
        const me = this._sidePlayer(), foe = this._sideBot();
        const bot = this._botGame ? this._cpuBot : null;
        if (status.startsWith(`check-${me}`)) {
            this._fb('Your king is in check! You must defend it.', 'error');
            this.snd.playCheck();
            this._updateTurnUI();
            return; // Still our move — do NOT trigger CPU
        }
        if (status.startsWith(`check-${foe}`)) {
            this._fb(bot ? `Check! ${bot.name}'s king is under attack.` : `Check! The ${this._sideName(foe)} king is under attack.`, 'info');
            this.snd.playCheck();
        }

        // Trigger CPU if it is now the bot's turn (free game only)
        if (this.game.currentPlayer === foe && !this.game.gameOver) {
            // Coach reacts to the player's move first (bot games only), then the
            // bot thinks. The feedback line is the single status source:
            // it names the move count and who is thinking — nothing else
            // echoes it.
            if (this._botGame && this._cpuBot) this._botCoachMove();
            this.cpuBusy = true;
            this._updateTurnUI();
            if (this._botGame && this._cpuBot) {
                const num = Math.ceil(this.game.moveHistory.length / 2);
                this._fb(`Move ${num} · ${this._cpuBot.name} is thinking…`, 'info');
            } else {
                this._setSpeech((this._cpuDifficulty || 'easy') === 'medium' ? 'Thinking three moves deep…' : 'Playing a casual move…');
            }
            setTimeout(() => this._cpuMove(), 650);
        }
    }

    /* ── Verdict search: judge moves with tactics, not vibes ───────
        _evaluate() is static material + tables: blind to sacrifices that
        work (condemned as "mistakes") and to pieces hung with no capture
        yet (praised as "quiet"). Verdicts therefore come from a real
        depth-2 search from the PLAYER's perspective, bounded
        quiescence so it stays instant (~10-100ms measured). Falls back to
        static eval if the search ever fails. */
    _botSearchPov(g, pov, depth) {
        try {
            const d = Math.max(1, Math.min(3, depth || 2));
            const sideToMove = g.currentPlayer || 'white';
            const prevQ = this._quiesceDepth;
            this._quiesceDepth = 3;
            let sc;
            try {
                // maxBlack = side to move maximizes black-minus-white, i.e.
                // side to move IS black. The recursion alternates by itself.
                sc = this._search(g, d, -Infinity, Infinity, sideToMove === 'black');
            } finally {
                this._quiesceDepth = (prevQ == null ? 6 : prevQ);
            }
            if (!Number.isFinite(sc)) throw new Error('no-score');
            return (pov || 'white') === 'white' ? -sc : sc;
        } catch (_) {
            try { const e = -this._evaluate(g); return (pov || 'white') === 'white' ? e : -e; }
            catch (_) { return 0; }
        }
    }
    // Legacy wrapper (tests + older paths read White's view).
    _botSearchWhite(g, depth) { return this._botSearchPov(g, 'white', depth); }

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
                // Promotion piece matches the mover's army (search sims
                // and commits share these entries — wrong case would
                // promote White to a black queen mid-search).
                const promo = (piece.toLowerCase() === 'p' && (tr === 0 || tr === 7))
                    ? (color === 'white' ? 'Q' : 'q') : null;
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
        // Quiescence: instead of stopping at a volatile position, extend
        // captures-only so hanging pieces are actually seen. The reach is
        // set per brain (_quiesceDepth): full for strong bots, withheld
        // from beginners who should genuinely miss tactics like one.
        if (depth === 0) return this._quiesce(g, alpha, beta, maxBlack, (this._quiesceDepth == null ? 6 : this._quiesceDepth));
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
    /* Quiescence search: stand-pat + captures only, so the engine never
       stops in the middle of a capture sequence grabbing thin air (or
       hanging a queen). Bounded to 6 capture plies — plenty to settle any
       real tactic, cheap enough to run at every leaf. Mate/stalemate with
       no legal moves scores exactly like the main search. */
    _quiesce(g, alpha, beta, maxBlack, qdepth) {
        if (g._insufficientMaterial() || g.repetitionCount() >= 3 || (g.halfmoveClock || 0) >= 100) return 0;
        const color = maxBlack ? 'black' : 'white';
        const stand = this._evaluate(g);
        if (maxBlack) {
            if (stand >= beta) return beta;
            if (stand > alpha) alpha = stand;
        } else {
            if (stand <= alpha) return alpha;
            if (stand < beta) beta = stand;
        }
        if (qdepth <= 0) return maxBlack ? alpha : beta;
        const caps = this._orderMoves(g, this._allMoves(g, color).filter(m => m.cap > 0));
        if (!caps.length) {
            // No captures: quiet — unless there are no legal moves at all.
            if (!this._allMoves(g, color).length) {
                if (!g.findKing(color)) return stand;
                if (g._isKingInCheck(color)) return maxBlack ? -100000 : 100000;
            }
            return maxBlack ? alpha : beta;
        }
        if (maxBlack) {
            for (const mv of caps) {
                const snap = g.snapshot();
                g.movePiece(mv.from, mv.to, mv.promo || null);
                const v = this._quiesce(g, alpha, beta, false, qdepth - 1);
                g.restore(snap);
                if (v > alpha) alpha = v;
                if (alpha >= beta) break;
            }
            return alpha;
        }
        for (const mv of caps) {
            const snap = g.snapshot();
            g.movePiece(mv.from, mv.to, mv.promo || null);
            const v = this._quiesce(g, alpha, beta, true, qdepth - 1);
            g.restore(snap);
            if (v < beta) beta = v;
            if (alpha >= beta) break;
        }
        return beta;
    }
    _cpuMove() {
        if (this.game.gameOver) { this.cpuBusy = false; return; }
        const g = this.game;
        // Either army can be the machine's now: bot games follow the draw,
        // the classic free game keeps computer-Black.
        const botColor = this._sideBot(), playerColor = this._sidePlayer();
        const moves = this._allMoves(g, botColor);
        // Coach baseline for the bot's OWN move (bot games only): judged
        // after it lands, in _commitCpuMove. Scored in the player's view.
        if (this._botGame && this._cpuBot) {
            try { this._botEngineBefore = this._botSearchPov(g, playerColor, 2); } catch (_) { this._botEngineBefore = null; }
        }

        if (!moves.length) {
            // No legal bot moves — the PLAYER mated or stalemated it.
            const st = g.getGameStatus();
            if (st.startsWith('checkmate')) {
                this._fb('Checkmate! You win! Magnificent play!', 'success');
                this.snd.playSuccess();
                // Practice bot games never complete the course: beating a
                // 200-Elo bot is not finishing lesson 10 the earned way.
                if (this.isFreeGame && !this._botGame) this.markDone(this.currentLesson.id);
                if (this._botGame) this._botGameEnd('win');
            } else {
                this._fb("Stalemate — it's a draw.", 'info');
                if (this._botGame) this._botGameEnd('draw');
            }
            g.gameOver = true;
            this.cpuBusy = false;
            this._draw();
            this._updateTurnUI();
            return;
        }

        const diff = this._cpuDifficulty || 'easy';
        // Bot games use Elo-mapped settings; easy/medium keep their legacy
        // selection mechanics (same blunder model), lifted by quiescence
        // like everything else.
        const P = (diff === 'bot' && this._cpuBotParams)
            ? this._cpuBotParams
            : diff === 'medium'
                ? { depth: 3, blunder: 0, pool: 0, wild: 0, capMs: 2500 }
                : { depth: 2, blunder: 0.15, pool: 60, wild: 0, capMs: 1500 };
        const depth = P.depth;
        // Per-brain search reach + judgement noise. Weak bots genuinely see
        // less (shallow quiescence) and misjudge quiet spots (noise), so a
        // 200 plays like a beginner and a 2100 punishes like one.
        this._quiesceDepth = (P.qdepth == null ? 6 : P.qdepth);
        const noise = (diff === 'bot' && P.noise) ? P.noise : 0;
        this._setSpeech(P.depth >= 4 ? `${(this._cpuBot && this._cpuBot.name) || 'Bot'} is thinking hard…` : P.depth === 3 ? 'Thinking three moves deep…' : 'Playing a casual move…');
        // Chunked root search so the UI never freezes: a few root moves per
        // macrotask, best-so-far kept throughout. The epoch aborts a stale
        // search if the board was reset mid-think. Deep bots additionally
        // stop scoring new root moves after capMs and play best-so-far.
        const epoch = this._searchEpoch || 0;
        const tStart = Date.now();
        // Every level thinks at most capMs per move (best-so-far wins):
        // deep bots stay usable instead of freezing the board.
        const capMs = P.capMs || 0;
        const ordered = this._orderMoves(g, moves);
        // Root node: the bot maximizes black-minus-white as Black and
        // minimizes it as White — the recursion below already alternates
        // by side to move, so only the root extremum flips.
        const botMax = botColor === 'black';
        const oppMaxBlack = playerColor === 'black'; // side to move after us
        let i = 0, alpha = -Infinity, beta = Infinity, scored = [];
        const step = () => {
            if (this.game !== g || epoch !== this._searchEpoch || g.gameOver) { this.cpuBusy = false; this._updateTurnUI(); return; }
            if (capMs && scored.length && Date.now() - tStart > capMs) { i = ordered.length; }
            const t0 = Date.now();
            // 12ms slices: long enough to make progress, short enough that
            // every frame still renders while the computer is thinking.
            while (i < ordered.length && Date.now() - t0 < 12) {
                const mv = ordered[i++];
                const snap = g.snapshot();
                g.movePiece(mv.from, mv.to, mv.promo || null);
                const sc = this._search(g, depth - 1, alpha, beta, oppMaxBlack);
                g.restore(snap);
                scored.push({ ...mv, score: sc });
                if (botMax) { if (sc > alpha) alpha = sc; }
                else { if (sc < beta) beta = sc; }
            }
            if (i < ordered.length) { setTimeout(step, 0); return; }
            const better = (a, b) => botMax ? b.score - a.score : a.score - b.score;
            scored.sort(better);
            // Weak-bot judgement noise: jitter each root score so quiet
            // misjudgements happen the human way (strong bots: noise 0,
            // untouched). Applied before selection, never to the search.
            let ranked = scored;
            if (noise > 0 && scored.length > 1) {
                ranked = scored.map(m => ({ ...m, score: m.score + (Math.random() * 2 - 1) * noise }));
                ranked.sort(better);
            }
            let best = ranked[0];
            if ((P.wild || 0) > 0 && Math.random() < P.wild && ordered.length) {
                // True beginner chaos: any legal move, however silly.
                best = ordered[Math.floor(Math.random() * ordered.length)];
            } else if (P.blunder > 0 && ranked.length > 1) {
                // Weaker bots blunder like a beginner: mostly near-best,
                // sometimes wild.
                if (Math.random() < P.blunder) best = ranked[Math.floor(Math.random() * ranked.length)];
                else {
                    const pool = ranked.filter(m => (m.score - best.score) * (botMax ? 1 : -1) <= P.pool);
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
        // Computer always promotes to queen — of its OWN army.
        const botColor = this._sideBot(), playerColor = this._sidePlayer();
        const piece = g.board[best.from[0]][best.from[1]];
        const promoRow = botColor === 'white' ? 7 : 0;
        const isPromo = piece && piece.toLowerCase() === 'p' && best.to[0] === promoRow;
        const result = g.movePiece(best.from, best.to, isPromo ? (botColor === 'white' ? 'Q' : 'q') : null);

        this._playMoveSound(result);
        this.cpuBusy = false;
        this._draw();

        const status = g.getGameStatus();
        if (status.startsWith('checkmate')) {
            const winner = status.split('-')[1];
            const mine = winner === playerColor;
            const bot = this._botGame ? this._cpuBot : null;
            const msg = mine ? 'You win!' : `Checkmate! ${(bot && bot.name) || 'Computer'} wins. Try again!`;
            this._fb(msg, mine ? 'success' : 'error');
            if (mine) { this.snd.playSuccess(); }
            g.gameOver = true;
            if (this._botGame) this._botGameEnd(mine ? 'win' : 'loss');
        } else if (status === 'stalemate') {
            this._fb("Stalemate — it's a draw.", 'info'); g.gameOver = true;
            if (this._botGame) this._botGameEnd('draw');
        } else if (status.startsWith('draw-')) {
            const msgs = {
                'draw-insufficient': 'Draw — neither side can possibly checkmate.',
                'draw-repetition': 'Draw by threefold repetition.',
                'draw-fifty': 'Draw by the fifty-move rule.'
            };
            this._fb(msgs[status] || "It's a draw.", 'info'); g.gameOver = true;
            if (this._botGame) this._botGameEnd('draw');
        } else if (status.startsWith(`check-${playerColor}`)) {
            this._fb('Your king is in check! Defend it.', 'error'); this.snd.playCheck();
        } else {
            const num = Math.ceil(g.moveHistory.length / 2);
            // Single status format everywhere in bot games (the coach talk
            // box above owns commentary; this line owns the move number).
            this._fb(this._botGame ? `Move ${num} · Your move (${this._sideName(playerColor)})` : `Move ${num} — your turn (White)`, 'info');
            // The bot judges its own move too (weak bots fess up) — unless
            // the player's verdict was decisive (|delta| >= 150): a called
            // blunder or brilliancy keeps the microphone, so a routine bot
            // reply can never overwrite it with unrelated talk.
            let reacted = false;
            if (this._botGame && this._cpuBot) {
                try {
                    const pd = this._botLastPlayerDelta;
                    this._botLastPlayerDelta = null;
                    if (!(typeof pd === 'number' && Math.abs(pd) >= 150)) {
                        reacted = !!this._botReactToOwnMove();
                    }
                } catch (_) {}
            }
            // Ahead/behind chirps (chess.com bots needle when winning and
            // squirm when losing): rare, cooldown-gated, persona-scaled —
            // and never stomping the own-move reaction that just spoke.
            if (this._botGame && this._cpuBot && !reacted) this._botLeadTaunt();
            // Fresh Stockfish baseline: the position BEFORE White's next
            // move, so the next verdict measures that move alone.
            if (this._botGame && this._cpuBot) { try { this._botSfBaseline(); } catch (_) {} }
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
                if (this._botGame && result && typeof result === 'object') {
                    this._botLastMove = { captured: !!result.captured, promo: true };
                }
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
                if (box) { box.style.background = 'rgba(212,164,75,0.12)'; box.style.borderColor = 'var(--accent)'; }
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
        const me = this._sidePlayer(), foe = this._sideBot();
        const yourTurn = !lockedDone && this.game.currentPlayer === me && !this.cpuBusy && !this.game.gameOver;
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
        if (status.startsWith(`check-${me}`))      this._setSpeech('Your king is in check — defend it!');
        else if (status.startsWith(`check-${foe}`)) {
            this._setSpeech(this._botGame && this._cpuBot
                ? `Check! ${this._cpuBot.name}'s king is under attack.`
                : `Check! The ${this._sideName(foe)} king is under attack.`);
        }
        else if (this.exerciseDone)                this._setSpeech('Well done! Click "Complete Lesson" to continue.');
        else if (this.isFreeGame) {
            const num = Math.ceil(this.game.moveHistory.length / 2) + 1;
            if (this._botGame && this._cpuBot) {
                // Bot games: feedback line is the single status source, so
                // keep the bubble silent (no element exists anyway).
                return;
            }
            this._setSpeech(`Move ${num}. ${yourTurn ? "Your turn." : "Computer is thinking..."}`);
        } else {
            this._setSpeech('Think carefully about your next move.');
        }
        this._refreshGameOverCard();
    }

    _setSpeech(msg) {
        const el = document.getElementById('speech');
        if (!el) return;
        // Bot arena has no speech bubble: the coach talk box narrates and
        // lesson-feedback carries game status — a third line only echoed
        // both. Any bot-mode chatter is dropped, never rendered twice.
        if (this._botGame && this._cpuBot) return;
        el.textContent = msg;
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

    /** Swap sides with the same bot: a fresh game with colors reversed
        (you played White → now Black, the bot takes White). */
    _swapBotSides() {
        try {
            if (!this._botGame || !this._cpuBot) return;
            const next = this._sidePlayer() === 'white' ? 'black' : 'white';
            this.startBotGame(this._cpuBot.id, { color: next });
        } catch (_) {}
    }

    resetBoard() {
        if (!this.currentLesson) return;
        // Bot rematch = brand-new game, same opponent, SAME colors.
        if (this._botGame && this._cpuBot) {
            try { this.startBotGame(this._cpuBot.id, { color: this._sidePlayer() }); } catch (_) {}
            return;
        }
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
        this._fb(this.isFreeGame ? `Board reset. You are ${this._sideName(this._sidePlayer())} — make your first move!` : 'Board reset. Start fresh!', 'info');
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
        let chip = '';
        try { if (signed && typeof DoChessAchievements !== 'undefined') chip = DoChessAchievements.rankChipHTML(this.userId); } catch (_) {}
        return `<span class="ws-cat">${cur.name}</span><span class="ws-label">${cur.label}</span><span class="ws-rating">${rating}</span>${chip}`;
    }
    _onlineControl() {
        let m = 5, s = 0;
        try { const c = JSON.parse(localStorage.getItem('cc_control') || 'null'); if (c) { m = c.m; s = c.s; } } catch (_) {}
        return this._controlFor(m, s);
    }

    showOnline() {
        this._go('online-screen');
        // Entering a game refreshes the ledger view: level/XP movement is
        // reported where play happens, not on unrelated screens.
        try { if (window.DoChessFriends && window.DoChessFriends.pullXp) window.DoChessFriends.pullXp(); } catch (_) {}
        if (this.online && (this.online.phase === 'play' || this.online.phase === 'over')) this._renderOnlineGame();
        else {
            this._renderOnlineLobby();
            this._consumeInviteLink();
        }
    }

    // Invite links (#play-CODE / ?play=CODE): the opener joins instantly —
    // rated when signed in, or consents to a guest (unrated) game first.
    _consumeInviteLink() {
        let code = null;
        try {
            const h = /^#play-([A-Za-z0-9]{6})$/i.exec(location.hash || '');
            let q = null;
            try { q = new URLSearchParams(location.search || '').get('play'); } catch (_) {}
            const raw = h ? h[1] : (/^[A-Za-z0-9]{6}$/i.test(q || '') ? q : null);
            if (raw) code = OnlineNet.normalizeCode(raw);
        } catch (_) {}
        if (!code || code.length !== 6) return;
        // Consume once: a reload must land on the lobby, not rejoin.
        try {
            const u = new URL(location.href);
            u.hash = '';
            u.searchParams.delete('play');
            history.replaceState(null, '', u.pathname + u.search + u.hash);
        } catch (_) {}
        if (this._clerk?.user) { this._pendingInvite = null; this._onlineJoin(code); return; }
        // Guests consent first; the prompt renders on the lobby (or on its
        // next render — the lobby may still be loading the net library).
        this._pendingInvite = code;
        this._renderInvitePrompt(code);
    }

    _renderInvitePrompt(code) {
        const box = document.querySelector('#online-screen .online-lobby');
        if (!box || box.querySelector('.invite-prompt')) return;
        const div = document.createElement('div');
        div.className = 'dashboard-section invite-prompt';
        div.innerHTML = `
            <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">You've been invited! Code ${esc(code)}</h4>
            <p class="lobby-hint">Sign in for a rated game, or play right now as a guest (unrated).</p>
            <div class="lobby-actions">
                <button class="btn-primary" data-action="online-invite-guest" data-code="${esc(code)}" type="button">Play as guest</button>
                <button class="btn-secondary" data-action="profile-signin" type="button">Sign in</button>
            </div>`;
        box.prepend(div);
    }

    _meTag() {
        const u = this._clerk?.user;
        const cats = {};
        ChessCourseApp.onlineControls().forEach(c => { cats[c.id] = OnlineRatings.get(this.userId, c.id); });
        // The rating we advertise over the wire must be for THIS game's
        // control (a mid-game lobby-wheel change must not mislabel it).
        const cat = (this.online && this.online.control && this.online.control.id)
            ? this.online.control.id : this._onlineControl().id;
        let img = (u && (u.imageUrl || u.profileImageUrl || u.avatar)) || null;
        // Only https photos ever render (http/data/blob avatars broke the
        // Carlos/result cards into broken-image icons).
        if (typeof img !== 'string' || !/^https:/.test(img)) img = null;
        else if (img.length > 2048) img = img.slice(0, 2048);
        let name = u ? (u.fullName || u.username || 'Player') : 'Guest';
        name = String(name).replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 24) || 'Guest';
        return {
            id: this.userId || 'guest',
            name,
            img,
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
        try { document.body.classList.remove('is-playing'); } catch (_) {}
        // Leaving any game view: the result modal state dies with it.
        try { document.getElementById('online-screen')?.classList.remove('or-open', 'or-over'); } catch (_) {}
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
        const crest = (rating) => {
            try { if (typeof DoChessAchievements !== 'undefined') return DoChessAchievements.crestMiniHTML(rating); } catch (_) {}
            return '';
        };
        const board = OnlineRatings.board(cur.id).map((p, i) =>
            `<div class="board-row"><span class="board-rank">${i + 1}</span>${crest(p.rating)}<span class="board-name">${esc(p.name)}</span><span class="board-rating">${p.rating ?? '-'}</span></div>`).join('')
            || '<p class="board-empty">No rated players on this device yet — finish an online game to open the board.</p>';
        // Phones AND desktop use the tappable preset grid; the scroll
        // wheels only appear on tablets (<=1024px). All stay in sync
        // through cc_control.
        const presets = [[1, 0], [3, 0], [5, 0], [3, 2], [10, 0], [15, 10]];
        const presetHTML = presets.map(([pm, ps]) => {
            const pc = this._controlFor(pm, ps);
            const on = (cur.minutes ?? 5) === pm && (cur.incSec ?? 0) === ps;
            return `<button type="button" class="tc-preset${on ? ' on' : ''}" data-action="lobby-preset" data-m="${pm}" data-s="${ps}" aria-pressed="${on}" title="${pc.name} ${pc.label}">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9.5v3.5l2.5 1.5M9 2h6"/></svg>
                <span class="tc-preset-time">${pm}+${ps}</span>
                <span class="tc-preset-cat">${pc.name}</span>
            </button>`;
        }).join('');
        box.innerHTML = `
            <div class="online-lobby">
                ${signed ? '' : `<div class="exercise-instructions"><h4>Sign in to play online</h4><p>Online games are rated, so every player needs an identity. <button class="linklike"
           data-action="profile-signin">Sign in / Join</button></p></div>`}
                <div class="dashboard-section qm-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Quick match</h4>
                    <p class="lobby-hint">Paired with a live player near your rating (<span class="qm-myelo">${signed ? OnlineRatings.get(this.userId, cur.id) : '–'}</span> ${esc(cur.name)}). No code needed — just search and play.</p>
                    <div class="lobby-actions">
                        <button class="btn-primary" data-action="online-quick" ${signed ? '' :
                'disabled'}>Find opponent</button>
                    </div>
                </div>
                <div class="dashboard-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Vs Bots</h4>
                    <p class="lobby-hint">Practice against bots from 200 to 2000+ Elo. No account needed — pick your opponent and play.</p>
                    <div class="lobby-actions">
                        <button class="btn-primary" data-action="vs-bots" type="button">Play bots</button>
                    </div>
                </div>
                <div class="dashboard-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Time control</h4>
                    <div class="tc-presets" role="group" aria-label="Quick time controls">${presetHTML}</div>
                    <div class="wheel-wrap">
                        ${wheel('min', mins, cur.minutes ?? 5, (v) => v)}
                        ${wheel('inc', secs, cur.incSec ?? 0, (v) => v)}
                        <div class="wheel-summary" id="wheel-summary">${this._wheelSummaryHTML(cur, signed)}</div>
                    </div>
                </div>
                <div class="dashboard-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Board style</h4>
                    <div class="skin-row" role="radiogroup" aria-label="Board style">
                        ${ChessCourseApp.BOARD_SKINS.map(k => `
                            <button type="button" class="skin-swatch${this._boardSkin() === k.id ? ' on' : ''}" data-action="board-skin" data-skin="${k.id}" role="radio" aria-checked="${this._boardSkin() === k.id}" title="${k.name} board">
                                <span class="skin-prev" aria-hidden="true"><i style="background:${k.light}"></i><i style="background:${k.dark}"></i><i style="background:${k.dark}"></i><i style="background:${k.light}"></i></span>
                                <span class="skin-name">${k.name}</span>
                            </button>`).join('')}
                    </div>
                    <p class="lobby-hint">Applies to every board — online games, Study and lessons.</p>
                </div>
                <div class="dashboard-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Piece style</h4>
                    <div class="skin-row" role="radiogroup" aria-label="Piece style">
                        ${ChessCourseApp.PIECE_SETS.map(k => `
                            <button type="button" class="skin-swatch piece-swatch${this._pieceSet() === k.id ? ' on' : ''}" data-action="piece-set" data-set="${k.id}" role="radio" aria-checked="${this._pieceSet() === k.id}" title="${k.name} pieces">
                                <span class="skin-prev piece-prev" aria-hidden="true">
                                    <img src="assets/pieces/${k.dir}/white-king.svg?${ChessCourseApp.assetV()}" alt="" width="26" height="26" loading="lazy" draggable="false">
                                    <img src="assets/pieces/${k.dir}/black-king.svg?${ChessCourseApp.assetV()}" alt="" width="26" height="26" loading="lazy" draggable="false">
                                </span>
                                <span class="skin-name">${k.name}</span>
                            </button>`).join('')}
                    </div>
                    <p class="lobby-hint">Applies to every board — online games, Study, lessons, Learn and puzzles.</p>
                </div>
                <div class="dashboard-section">
                    <h4 style="color:var(--accent-bright);font-family:'Inter',system-ui,sans-serif;margin-bottom:.75rem">Play a friend</h4>
                    <p class="lobby-hint">Share a 6-letter code. Your tabs connect directly; the host's tab validates every move and owns both clocks. Dropped connections auto-rejoin with
the same code, and every move is saved so a dead tab can resume. Got an invite link? Just open it — no account needed, guests play unrated.</p>
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
        // A pending invite (guest prompt) survives lobby re-renders.
        if (this._pendingInvite && !this._clerk?.user) this._renderInvitePrompt(this._pendingInvite);
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
            const crest = (rating) => {
                try { if (typeof DoChessAchievements !== 'undefined') return DoChessAchievements.crestMiniHTML(rating); } catch (_) {}
                return '';
            };
            const rows = OnlineRatings.board(cur.id).map((p, i) =>
                `<div class="board-row"><span class="board-rank">${i + 1}</span>${crest(p.rating)}<span class="board-name">${esc(p.name)}</span><span class="board-rating">${p.rating ?? '–'}</span></div>`).join('')
                || '<p class="board-empty">No rated players on this device yet — finish an online game to open the board.</p>';
            list.innerHTML = rows;
        }
    }

    // Phone preset tap: save the control, sync the (hidden) wheels so a
    // resize to desktop stays consistent, repaint summary + leaderboard.
    _lobbyPreset(m, s) {
        const val = this._controlFor(m, s);
        m = val.minutes; s = val.incSec;
        try { localStorage.setItem('cc_control', JSON.stringify({ m, s })); } catch (_) {}
        ['min', 'inc'].forEach(kind => {
            const el = document.getElementById('wheel-' + kind);
            if (!el) return;
            const v = kind === 'min' ? m : s;
            el.querySelectorAll('[role="option"]').forEach(o => o.setAttribute('aria-selected', o.dataset.val === String(v) ? 'true' : 'false'));
        });
        document.querySelectorAll('.tc-preset').forEach(b => {
            const on = parseInt(b.dataset.m, 10) === m && parseInt(b.dataset.s, 10) === s;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
        });
        try { navigator.vibrate && navigator.vibrate(5); } catch (_) {}
        const sum = document.getElementById('wheel-summary');
        if (sum) sum.innerHTML = this._wheelSummaryHTML(val, !!(this._clerk && this._clerk.user));
        const head = document.getElementById('wheel-board-head');
        if (head) head.textContent = `Device leaderboard — ${val.name}`;
        const list = document.getElementById('wheel-board-list');
        if (list) {
            const rows = OnlineRatings.board(val.id).map((p, i) =>
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
            s.unrated = this._onlineUnrated(s.opp);
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
        // Guests may join via invite links (unrated games); the lobby's own
        // Join button stays signed-in-only, quick match too.
        this._pendingInvite = null;
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

    /* ── Quick match: ELO-paired live opponents ──────────────────
       Two layers, one waiting room:
       1. Server queue (POST /api/mm/join + poll): the closest-ELO waiter
          in the same category pairs instantly. Testing mode: ANY gap
          pairs — a far opponent beats no opponent, and the gap is shown.
       2. P2P bucket rendezvous (no backend needed): both searchers derive
          the same 6-letter room from control + a 3-minute UTC window and
          host-or-join it — the host-race loser joins. This is what makes
          matching work on the static Pages build today; the server queue
          wins whenever it answers. */
    _apiBase() {
        try {
            const ov = localStorage.getItem('cc_api_base');
            if (ov) return String(ov).replace(/\/+$/, '');
        } catch (_) {}
        // Same-origin /api exists only when the node server serves the
        // page (local dev / Fly). GitHub Pages and file:// have none —
        // unless a production origin was configured on deploy.
        try {
            if (location.protocol.indexOf('http') === 0 && !/\.github\.io$/.test(location.hostname)) return '';
        } catch (_) {}
        try {
            const def = window.DOCHESS_API_BASE;
            if (def) return String(def).replace(/\/+$/, '');
        } catch (_) {}
        return null;
    }

    static quickBucketCode(catId, win) {
        // Deterministic 6-letter room both searchers derive independently.
        const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        const src = `${catId}:${win}:${ChessCourseApp.APP_VERSION}`;
        let h1 = 0x811c9dc5, h2 = 0x01000193;
        for (let i = 0; i < src.length; i++) {
            const c = src.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
            h2 = Math.imul(h2 + c, 31) >>> 0;
        }
        let h = (BigInt(h1) << 32n) | BigInt(h2);
        let out = '';
        for (let i = 0; i < 6; i++) { out += ABC[Number(h % 32n)]; h /= 32n; }
        return out;
    }

    async _quickMatch() {
        if (!this._clerk?.user) { this._onlineLobbyMsg('Sign in to find an opponent.', 'error'); return; }
        // A live search already running: don't stack another.
        if (this._qm && this._qm.active && !this._qm.done) return;
        // Stale search state (a finished or orphaned queue ticket) must
        // never make this a silent no-op.
        try { this._quickCloseOverlay(); } catch (_) {}
        this._qm = null;
        // Queueing from a finished game (e.g. the result card's New game):
        // drop the dead room silently so matchmaking starts clean — no
        // lobby flash, and the old clocks/sockets are truly gone.
        if (this.online && this.online.phase === 'over') {
            try { this._onlineLeave(false); } catch (_) {}
        }
        const control = this._onlineControl();
        const elo = OnlineRatings.get(this.userId, control.id);
        this._qm = { active: true, done: false, t0: Date.now(), ticket: null, base: null, mode: null, range: 100, timer: null, pollTimer: null };
        this._renderQuickOverlay(control, elo);
        // Server queue first; P2P rendezvous when it doesn't answer.
        const base = this._apiBase();
        if (base !== null) {
            try {
                const u = this._clerk.user;
                const joined = await this._mmJoin(base, {
                    name: (u.fullName || u.username || 'Player'), elo, cat: control.id,
                });
                if (!this._qm || !this._qm.active) return;
                if (joined && joined.ticket) {
                    this._qm.mode = 'api';
                    this._qm.base = base;
                    this._qm.ticket = joined.ticket;
                    if (joined.matched) { this._quickStartMatch(joined.matched.code, joined.matched.role, joined.matched.opp); return; }
                    this._qmSetStatus('In the queue — closest rating pairs first.');
                    this._qmPoll(base);
                    return;
                }
            } catch (_) { /* fall through to P2P rendezvous */ }
        }
        if (!this._qm || !this._qm.active) return;
        this._quickBucket(control);
    }

    _renderQuickOverlay(control, elo) {
        this._quickCloseOverlay();
        const div = document.createElement('div');
        div.id = 'qm-overlay';
        div.innerHTML = `
            <div class="qm-card" role="dialog" aria-label="Finding opponent" aria-live="polite">
                <div class="qm-radar"><span class="qm-clockwrap">${ChessCourseApp.quickClockSVG('lg')}</span></div>
                <div class="qm-title">Finding opponent<span class="qm-dots"></span></div>
                <div class="qm-sub" id="qm-status">Contacting matchmaking…</div>
                <div class="qm-range" id="qm-range">±100</div>
                <div class="qm-meta"><span>You <strong>${elo}</strong></span><span>${esc(control.label || control.name || '')}</span><span><strong id="qm-time">0:00</strong></span></div>
                <button class="btn-secondary qm-cancel" data-action="qm-cancel" type="button">Cancel search</button>
            </div>`;
        document.body.appendChild(div);
        const qm = this._qm;
        qm.timer = setInterval(() => {
            if (!qm.active) return;
            const s = Math.floor((Date.now() - qm.t0) / 1000);
            qm.range = 100 + Math.floor(s / 5) * 100;
            const t = document.getElementById('qm-time');
            if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
            const r = document.getElementById('qm-range');
            if (r) r.textContent = `±${qm.range}`;
            // Solo-queue rescue: nobody else searching means an infinite
            // spinner. After 45s offer the closest-Elo bot instead of
            // stranding the player — they can keep waiting if they want.
            if (s >= 45 && !qm.done && !document.getElementById('qm-solo')) {
                this._qmSoloOffer();
            }
        }, 500);
    }

    _qmSoloOffer() {
        const qm = this._qm;
        if (!qm || !qm.active || qm.done) return;
        const card = document.querySelector('#qm-overlay .qm-card');
        if (!card || document.getElementById('qm-solo')) return;
        const elo = OnlineRatings.get(this.userId, this._onlineControl().id);
        const bot = [...ChessCourseApp.BOTS].sort((a, b) => Math.abs(a.elo - elo) - Math.abs(b.elo - elo))[0];
        const row = document.createElement('div');
        row.id = 'qm-solo';
        row.className = 'qm-solo';
        row.innerHTML = `
            <p class="qm-solo-txt">No rivals searching right now. Warm up against <strong>${esc(bot.name)} (${bot.elo})</strong> while you wait?</p>
            <div class="qm-solo-btns">
                <button class="btn-primary sm" data-action="qm-bot" data-bot="${esc(bot.id)}" type="button">Play ${esc(bot.name)}</button>
                <button class="btn-secondary sm" data-action="qm-wait" type="button">Keep waiting</button>
            </div>`;
        card.appendChild(row);
        this._qmSetStatus('Still looking — no rivals in the queue yet.');
    }

    _qmSoloBot(botId) {
        try { this._quickCancel(); } catch (_) {}
        try { this.startBotGame(botId || 'nico'); } catch (_) {}
    }

    _qmSetStatus(txt) {
        const el = document.getElementById('qm-status');
        if (el) el.textContent = txt;
    }

    _quickCloseOverlay() {
        const qm = this._qm;
        if (qm) {
            try { if (qm.timer) clearInterval(qm.timer); } catch (_) {}
            try { if (qm.pollTimer) clearTimeout(qm.pollTimer); } catch (_) {}
            qm.timer = null; qm.pollTimer = null;
        }
        try { document.getElementById('qm-overlay')?.remove(); } catch (_) {}
    }

    _quickCancel() {
        const qm = this._qm;
        if (!qm || !qm.active || qm.done) return;
        qm.active = false;
        // Tell the server queue we're gone (fire-and-forget).
        // NOTE: base '' means same-origin — falsy but valid.
        try {
            if (qm.mode === 'api' && qm.ticket && qm.base !== null && qm.base !== undefined) {
                fetch(`${qm.base}/api/mm/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: qm.ticket }), keepalive: true }).catch(() => {});
            }
        } catch (_) {}
        this._quickCloseOverlay();
        this._onlineCleanup();
        this.online = null;
        this._qm = null;
        this._renderOnlineLobby();
    }

    async _mmFetch(base, path, body) {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 6000);
        try {
            // The server gates /api/mm/* behind Clerk JWTs (401 without
            // one). The old code sent no Authorization header, so the queue
            // ALWAYS 401'd and silently fell back to P2P — server
            // matchmaking never worked. Same token pattern as cloud sync.
            let token = null;
            try {
                const sess = this._clerk && this._clerk.session;
                if (sess && typeof sess.getToken === 'function') token = await sess.getToken();
            } catch (_) { token = null; }
            const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`${base}/api/mm/${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: ctrl.signal,
            });
            if (!res.ok) throw new Error('mm-http-' + res.status);
            return await res.json();
        } finally { clearTimeout(to); }
    }

    async _mmJoin(base, who) {
        const r = await this._mmFetch(base, 'join', who);
        if (!r || r.ok !== true) throw new Error('mm-join');
        return r;
    }

    _qmPoll(base) {
        const qm = this._qm;
        const loop = async () => {
            if (!qm.active) return;
            try {
                const r = await this._mmFetch(base, `poll?ticket=${encodeURIComponent(qm.ticket)}`);
                if (!qm.active) return;
                if (r && r.status === 'matched') { this._quickStartMatch(r.code, r.role, r.opp); return; }
                if (r && r.status === 'waiting') {
                    const bits = [];
                    if (typeof r.position === 'number') bits.push(`#${r.position} in queue`);
                    if (typeof r.minGap === 'number') bits.push(`closest ±${r.minGap}`);
                    this._qmSetStatus(bits.length ? bits.join(' · ') : 'In the queue — closest rating pairs first.');
                } else if (r && (r.status === 'expired' || r.status === 'gone')) {
                    // Lost our seat: drop to P2P rendezvous, no dead end.
                    qm.mode = 'bucket'; qm.ticket = null;
                    this._quickBucket(this._onlineControl());
                    return;
                }
            } catch (_) { /* one failed poll: next tick retries */ }
            qm.pollTimer = setTimeout(loop, 1500);
        };
        loop();
    }

    _quickStartMatch(code, role, opp) {
        const qm = this._qm;
        if (!qm || !qm.active) return;
        qm.done = true; // cancel becomes inert; overlay closes on play
        this._qmSetStatus(opp && opp.name ? `Opponent found: ${opp.name} (${typeof opp.elo === 'number' ? opp.elo : '?'})!` : 'Opponent found!');
        if (role === 'join') {
            // The host needs a head start opening the room (retry loop
            // covers the lag, so this stays short).
            setTimeout(() => { if (this._qm && this._qm.done) this._onlineJoin(code); }, 400);
        } else {
            this._onlineHost(code);
        }
        // If the handoff fails (lobby phase), don't strand the overlay.
        setTimeout(() => {
            const q2 = this._qm;
            if (q2 && q2.done && this.online && this.online.phase === 'lobby') {
                this._quickCloseOverlay();
                this._qm = null;
            }
        }, 25000);
    }

    _quickBucket(control) {
        const qm = this._qm;
        if (!qm || !qm.active) return;
        qm.mode = 'bucket';
        qm.ticket = null;
        this._qmSetStatus('Searching live rooms…');
        const W = Math.floor(Date.now() / 180000);
        const cur = ChessCourseApp.quickBucketCode(control.id, W);
        const prev = ChessCourseApp.quickBucketCode(control.id, W - 1);
        // Two legs, one winner: open our room AND knock on last window's
        // room at the same time (wall time ~= one peer handshake, not two).
        // Last window's room bridges searchers who pressed Find minutes apart.
        const race = { over: false, fails: 0 };
        const fail = () => {
            if (!qm.active || race.over) return;
            if (++race.fails >= 2) {
                race.over = true;
                this._quickCloseOverlay();
                this.online = null; this._qm = null;
                this._renderOnlineLobby();
                this._onlineLobbyMsg('Could not open a game. Check your connection and try again.', 'error');
            }
        };
        const win = () => { race.over = true; };
        this._quickHostLeg(cur, qm, race, win, fail);
        this._quickProbeLeg(prev, qm, race, win, fail);
    }

    // Leg 1: open the current room; a taken room means a rival holds it → join.
    async _quickHostLeg(code, qm, race, win, fail) {
        const net = new OnlineNet((t, m, c) => this._onNetMsg(t, m, c));
        const control = this._onlineControl();
        try {
            await net.host(code);
        } catch (e) {
            try { net.destroy(); } catch (_) {}
            if (!qm.active || race.over) return;
            if (e && e.message === 'taken') {
                this._qmSetStatus('Room found — joining…');
                win();
                this._onlineJoin(code);
                return;
            }
            fail();
            return;
        }
        if (!qm.active || race.over) { try { net.destroy(); } catch (_) {} return; }
        // We hold the room: adopt it and wait for the rival to knock.
        this._onlineCleanup();
        this.online = { phase: 'waiting', role: 'host', code, control, epoch: 0, resumed: false, quick: true, net };
        try { this.online.epoch = OnlineStore.nextEpoch(code); } catch (_) {}
        this._qmSetStatus('Room open — waiting for a rival…');
        win(); // probe leg stands down; its late failure is ignored
    }

    // Leg 2: one quiet knock on the previous window's room, adopted
    // directly as the game session (no second join round-trip).
    async _quickProbeLeg(code, qm, race, win, fail) {
        const net = new OnlineNet((t, m, c) => this._onNetMsg(t, m, c));
        const control = this._onlineControl();
        let timer = null;
        try {
            const attempt = net.join(code);
            attempt.catch(() => {}); // the race below may settle first
            const conn = await Promise.race([
                attempt,
                new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('probe-timeout')), 7000); }),
            ]);
            if (!qm.active || race.over) { try { net.destroy(); } catch (_) {} return; }
            this._onlineCleanup();
            this.online = { phase: 'joining', role: 'join', code, control, epoch: 0, net, conn };
            try { net.send(conn, { type: 'hello', v: ChessCourseApp.APP_VERSION, code, rejoin: false, user: this._meTag() }); } catch (_) {}
            win();
            this._qmSetStatus('Room found — joining…');
            try {
                await this._waitFor(() => this.online && this.online.phase === 'play', 10000);
            } catch (_) {
                if (qm.active && !race.over) {
                    this._onlineLeave();
                    this._onlineLobbyMsg('Host is not answering. Check the code and your connection, then try again.', 'error');
                }
            }
        } catch (_) {
            try { net.destroy(); } catch (_) {}
            fail();
        } finally {
            try { if (timer) clearTimeout(timer); } catch (_) {}
        }
    }

    // Shareable invite link for a hosted room: the opener joins
    // instantly (rated when signed in, guest-unrated otherwise).
    // Links ALWAYS target the live site: a localhost/file URL is useless
    // to a friend on another machine (override with cc_site_url).
    _inviteSiteBase() {
        try {
            const ov = localStorage.getItem('cc_site_url');
            if (ov) return String(ov).replace(/\/+$/, '');
        } catch (_) {}
        try {
            const h = location.hostname || '';
            if (h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:') {
                return 'https://mouadhhhallem.github.io/dochess/index.html';
            }
            let path = location.pathname || '/';
            if (path.endsWith('/')) path += 'index.html';
            return location.origin + path;
        } catch (_) {}
        return 'https://mouadhhhallem.github.io/dochess/index.html';
    }

    _inviteUrl(code) {
        return `${this._inviteSiteBase()}#play-${code}`;
    }

    // Shared waiting-room clock face (quick match + hosted rooms).
    static quickClockSVG(cls = '') {
        return `<svg class="qm-clock ${cls}" viewBox="0 0 64 64" aria-hidden="true">`
            + `<circle cx="32" cy="32" r="27" fill="#26201a" stroke="#D4A44B" stroke-width="3"/>`
            + `<circle cx="32" cy="32" r="21" fill="none" stroke="rgba(224,179,90,.35)" stroke-width="1"/>`
            + `<line class="qm-hour" x1="32" y1="32" x2="32" y2="19" stroke="#E0B35A" stroke-width="4" stroke-linecap="round"/>`
            + `<line class="qm-min" x1="32" y1="32" x2="32" y2="11" stroke="#F5C978" stroke-width="3" stroke-linecap="round"/>`
            + `<circle cx="32" cy="32" r="3.2" fill="#E0B35A"/></svg>`;
    }

    _renderOnlineWaiting(code, msg) {
        const box = document.getElementById('online-content');
        if (!box) return;
        // Hosts get a copyable invite link; joiners share the code itself.
        const inviteRow = (this.online && this.online.role === 'host') ? `
                <div class="invite-row">
                    <input id="invite-link" class="join-input" readonly value="${esc(this._inviteUrl(code))}" spellcheck="false">
                    <button class="btn-secondary" data-action="online-copy-link" type="button">Copy invite</button>
                </div>
                <p class="lobby-hint">Anyone opening the link joins instantly — signed-in players are rated, guests play unrated.</p>` : '';
        box.innerHTML = `
            <div class="dashboard-section waiting-card">
                <div class="qm-radar sm"><span class="qm-clockwrap">${ChessCourseApp.quickClockSVG()}</span></div>
                <div class="qm-title">Waiting for rival<span class="qm-dots"></span></div>
                <div class="game-code">${code}</div>
                <p class="lobby-hint">${msg}</p>
                ${inviteRow}
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

    _onlineLeave(renderLobby = true) {
        const s = this.online;
        // Host leaving a live game warns the peer first so it aborts
        // cleanly instead of hanging on a dead session.
        if (s && s.role === 'host' && s.phase === 'play' && !s.result && s.conn) {
            try { s.net.send(s.conn, { type: 'host_left', epoch: s.epoch || 0 }); } catch (_) {}
        }
        this._clearRejoin();
        this._onlineCleanup();
        this.online = null;
        this._pendingInvite = null;
        if (renderLobby) this._renderOnlineLobby();
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
            // One room, one rival: a second joiner mid-wait is turned away
            // instead of hijacking the seat (invite links travel in groups).
            if (s.phase === 'waiting' && s.conn && s.conn.open) {
                try { conn.send({ type: 'rejected', reason: 'full' }); } catch (_) {}
                setTimeout(() => { try { conn.close(); } catch (_) {} }, 400);
                return;
            }
            // A hello during a LIVE game is a rejoin, not a new game —
            // but only from the same player (no spectators on this path).
            if (s.phase === 'play') {
                const same = msg.user && msg.user.id && s.opp && msg.user.id === s.opp.id;
                // Strangers knocking mid-game learn it's full right away
                // instead of hanging through the join retry loop.
                if (!same) {
                    try { conn.send({ type: 'rejected', reason: 'full' }); } catch (_) {}
                    setTimeout(() => { try { conn.close(); } catch (_) {} }, 400);
                    return;
                }
                s.conn = conn; s.peerGone = false;
                this._clearRejoin();
                s.net.send(conn, { type: 'welcome', v: ChessCourseApp.APP_VERSION, epoch: s.epoch || 0, game_id: s.gameId, color: s.oppColor, control: { id: s.control.id, base: s.control.base, inc: s.control.inc }, rated: true, user: this._meTag(), state: this._buildOnlineState() });
                this._flushPending();
                this._onlineStatus();
                this._drawOnline();
                return;
            }
            // First contact on a waiting room (or a resumed rejoin): adopt
            // the seat. This MUST stay below the play-branch above: comparing
            // against s.opp only works while it still names the CURRENT rival.
            s.conn = conn;
            s.opp = sanitizePeerUser(msg.user);
            this._notePeerVersion(msg);
            try { if (window.DoChessFriends) window.DoChessFriends.metPeer(s.opp.id, s.opp.name, s.opp.img); } catch (_) {}
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
                try { if (window.DoChessFriends) window.DoChessFriends.metPeer(s.opp.id, s.opp.name, s.opp.img); } catch (_) {}
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
            try { if (window.DoChessFriends) window.DoChessFriends.metPeer(s.opp.id, s.opp.name, s.opp.img); } catch (_) {}
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
        // Turned away before the game (room full): back to the lobby
        // with words. This sits above the play/over gate below: a joiner
        // stuck in 'joining' must hear it too.
        if (type === 'rejected' && s.phase === 'joining') {
            this._onlineLeave();
            this._onlineLobbyMsg('That game is already full.', 'error');
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
                try { if (window.DoChessFriends) window.DoChessFriends.metPeer(s.opp.id, s.opp.name, s.opp.img); } catch (_) {}
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

    // A game is unrated when it's self-play (same account, both tabs),
    // when EITHER side is a guest (invite links), or when it's too short
    // (the abort rule in _onlineFinish). One helper, every entry point.
    _onlineUnrated(opp) {
        const o = opp || {};
        const selfPlay = !!(this.userId && this.userId !== 'guest' && o.id && o.id !== 'guest' && o.id === this.userId);
        const guestGame = !this.userId || !o.id || o.id === 'guest';
        return selfPlay || guestGame;
    }

    _startOnlineGame(myColor, opp, controlOrId, keepConn) {
        const s = this.online;
        const control = this._cleanControl(controlOrId !== undefined ? controlOrId : s.control);
        Object.assign(s, {
            phase: 'play', myColor, oppColor: myColor === 'white' ? 'black' : 'white',
            control, opp, unrated: this._onlineUnrated(opp),
            gameId: s.gameId && keepConn ? s.gameId : this._newGameId(),
            engine: new ChessGame(), ply: 0, sel: null, legal: [],
            pendingPromo: null, result: null, reason: null,
            rematchMe: false, rematchOpp: false, peerGone: false,
            _overShown: false, short: false, oppV: null,
            ratingDelta: null, ratingAfter: null, xpGained: 0,
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
        // Peak before the rating write — achievements promotion compares this
        // against the post-write peak (onGame's peakBefore).
        let peakBefore = null;
        try { if (typeof DoChessAchievements !== 'undefined') peakBefore = DoChessAchievements.myPeak(this.userId); } catch (_) {}
        if (!s.unrated && !s.short) {
            const r = OnlineRatings.applyGame({ uid: this.userId, cat: s.control.id, score, oppRating: this._oppRatingFor(), gameId: s.gameId });
            if (r) { delta = r.delta; rating = r.rating; }
        }
        OnlineRatings.notePlayer(this.userId || 'guest', this._meTag().name, s.control.id, OnlineRatings.get(this.userId, s.control.id));
        if (s.opp?.id) OnlineRatings.notePlayer(s.opp.id, s.opp.name, s.control.id, s.opp.rating);
        s.ratingDelta = delta; s.ratingAfter = rating;
        if (result !== 'aborted' && s.gameId) {
            // History is for everyone, including guests (device-local
            // 'guest' shelf; ratings above stay signed-in-only).
            OnlineRatings.pushHistory(this.userId || 'guest', {
                gameId: s.gameId, control: { id: s.control.id, base: s.control.base, inc: s.control.inc }, opp: s.opp?.name || 'Opponent',
                oppUid: (s.opp && s.opp.id) || null,
                result, plies: s.engine.moveHistory.length, delta
            });
            // Friends graph: streak stamps, head-to-head, rating publish.
            try {
                if (window.DoChessFriends) window.DoChessFriends.onGameEnd({
                    oppUid: (s.opp && s.opp.id) || null, oppName: (s.opp && s.opp.name) || 'Opponent',
                    result, cat: s.control.id,
                    myRating: (typeof rating === 'number') ? rating : OnlineRatings.get(this.userId, s.control.id),
                });
            } catch (_) {}
            // Durable match record: mirror the finished game to the API
            // (Mongo, idempotent on gameId). Best-effort — a failed POST
            // never disturbs the game-over flow; both players post their own
            // copy under the shared game id, moves as UCI strings.
            try {
                if (window.DoChessSync && typeof DoChessSync.recordGame === 'function') {
                    const mv = (s.engine && Array.isArray(s.engine.moveHistory)) ? s.engine.moveHistory : [];
                    DoChessSync.recordGame({
                        gameId: s.gameId,
                        result: result, termination: reason,
                        plies: mv.length,
                        moves: mv.map(m => (m && m.from && m.to)
                            ? (m.from + m.to + (m.promotion ? String(m.promotion).toLowerCase().slice(-1) : ''))
                            : '').filter(Boolean),
                        control: { id: s.control.id, base: s.control.base, inc: s.control.inc },
                        opp: (s.opp && s.opp.name) || 'Opponent',
                        // The opponent's account id lets the server stamp the
                        // shared friend streak for BOTH players from either
                        // player's record (honoured only between friends).
                        oppUid: (s.opp && s.opp.id) || undefined,
                        delta: (delta === null || delta === undefined) ? undefined : delta,
                        ratingBefore: (rating === null || rating === undefined || delta === null || delta === undefined) ? undefined : rating - delta,
                        ratingAfter: (rating === null || rating === undefined) ? undefined : rating,
                        date: Date.now(), endedAt: Date.now()
                    }).then((resp) => {
                        // Server-ledgered XP lands with the record: show it
                        // on the result card (win +20, draw +10, loss +5)
                        // and refresh the hero ledger behind it.
                        try {
                            const gained = resp && resp.xp && Number(resp.xp.gained);
                            if (gained > 0) {
                                s.xpGained = gained;
                                if (window.DoChessFriends && window.DoChessFriends.pullXp) window.DoChessFriends.pullXp();
                                if (s.phase === 'over') this._renderOnlineGame();
                            }
                        } catch (_) {}
                    });
                }
            } catch (_) {}
        }
        // Ranks + achievements: fold this game into the device-local record
        // (streak, speed-class flags, underdog comeback) and toast any new
        // badge or rank promotion — same event source as the rating write.
        try {
            // Achievements attribute to an account; guest games skip them.
            if (typeof DoChessAchievements !== 'undefined' && result !== 'aborted' && this.userId) {
                const ach = DoChessAchievements.onGame({
                    uid: this.userId, result, cat: s.control.id,
                    oppRating: this._oppRatingFor(),
                    myBefore: (rating !== null && delta !== null) ? rating - delta : null,
                    peakBefore
                });
                if (ach) DoChessAchievements.announceFresh(ach.fresh, ach.promoted);
            }
        } catch (_) {}
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
    _onlineResultDismiss() {
        try {
            if (this.online) this.online._resultDismissed = true;
            document.getElementById('online-screen')?.classList.remove('or-open');
        } catch (_) {}
    }
    _onlineResultOpen() {
        try {
            if (this.online) this.online._resultDismissed = false;
            document.getElementById('online-screen')?.classList.add('or-open');
            const h = document.querySelector('#online-result .or-card h3');
            if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (_) {} }
        } catch (_) {}
    }
    _renderOnlineGame() {
        // A quick-match game starting closes the searching room.
        if (this._qm && this.online && this.online.phase === 'play') {
            this._quickCloseOverlay();
            this._qm = null;
        }
        const s = this.online;
        const box = document.getElementById('online-content');
        if (!box || !s) return;
        // Tab bar hides only while a live game is on the board (lobby keeps it).
        try { document.body.classList.toggle('is-playing', s.phase === 'play'); } catch (_) {}
        const mine = s.myColor === 'white' ? 'White' : 'Black';
        const theirs = s.myColor === 'white' ? 'Black' : 'White';
        const over = s.phase === 'over';
        // Server-ledgered experience for THIS game (win +20, draw +10,
        // loss +5 — same ledger for friend games and quick-match). It lands
        // with the stored record, moments after the card first paints, and
        // the repaint above picks it up.
        const guestBit = !this.userId || !s.opp?.id || s.opp.id === 'guest';
        const unratedBit = (over && s.unrated) ? `<div class="feedback info">${guestBit ? 'Guest game — not rated. Sign in to play rated games.' : 'Unrated game — you are playing yourself.'}</div>` : '';
        const shortBit = (over && s.short && !s.unrated) ? `<div class="feedback info">Unrated game — too short to rate.</div>` : '';
        // After a rated game the You-card shows the whole change, e.g.
        // "Black · 857 → 831 (-26)" next to the result line's
        // "Rating -26 → 831".
        const youSub = (over && s.ratingDelta !== null && s.ratingDelta !== undefined)
            ? `${mine} · ${s.ratingAfter - s.ratingDelta} → ${s.ratingAfter} (${s.ratingDelta > 0 ? '+' : ''}${s.ratingDelta})`
            : `${mine} · ${OnlineRatings.get(this.userId, s.control.id)}`;
        // Profile-style score card: result hero, the two duelists with the
        // rating swing, game facts, and every next step (Rematch, New game,
        // Review, Leave) right where the eyes land. #online-result, the
        // .rate-count animation hook and all data-actions are preserved.
        const movesPlayed = (s.engine && s.engine.moveHistory) ? s.engine.moveHistory.length : 0;
        const hasDelta = over && s.ratingDelta !== null && s.ratingDelta !== undefined;
        const deltaPill = hasDelta
            ? `<span class="or-delta ${s.ratingDelta >= 0 ? 'up' : 'down'}">${s.ratingDelta > 0 ? '+' : ''}${s.ratingDelta}</span>`
            : `<span class="or-delta flat">unrated</span>`;
        const rateLine = hasDelta
            ? ` <span class="rate-count" data-from="${s.ratingAfter - s.ratingDelta}" data-to="${s.ratingAfter}">Rating ${s.ratingDelta > 0 ? '+' : ''}${s.ratingDelta} → ${s.ratingAfter}</span>`
            : '';
        const xpLine = (over && s.xpGained > 0) ? ` <span class="xp-count">+${s.xpGained} XP</span>` : '';
        const noteLine = (over && (s.unrated || s.short))
            ? `<p class="or-note">${s.unrated
                ? (guestBit ? 'Guest game — not rated. Sign in to play rated games.' : 'Unrated game — you were playing yourself.')
                : 'Unrated game — too short to rate.'}</p>`
            : '';
        const resultCard = (!over || !s.result) ? '' : (() => {
            const theme = s.result === 'win' ? 'or-win' : s.result === 'loss' ? 'or-loss' : 'or-draw';
            const glyph = s.result === 'win' ? '♛' : s.result === 'loss' ? '♟' : '½';
            const title = s.result === 'win' ? 'You Win!' : s.result === 'loss' ? 'You Lose' : 'Draw';
            // Move-quality review: graded from the finished position, cached
            // per game so reopening the card never re-searches.
            let reviewBlock = '';
            try {
                if (!s._review || s._reviewGame !== s.gameId) {
                    s._review = this._gradeGameMoves(s.engine ? s.engine.moveHistory : [], s.myColor);
                    s._reviewGame = s.gameId;
                }
                if (s._review && s._review.total > 0) {
                    reviewBlock = this._reviewHTML(s._review, {
                        titleSuffix: `${movesPlayed} moves`,
                        studyBtn: { action: 'online-review', label: 'Open in Study' }
                    });
                }
            } catch (_) {}
            return `<div class="or-card ${theme}" role="dialog" aria-modal="true" aria-label="Game result">
                <button class="or-close" data-action="online-result-close" type="button" aria-label="Close result and view board">×</button>
                <div class="or-hero"><span class="or-glyph" aria-hidden="true">${glyph}</span>
                    <div><h3>${title}</h3><p>${esc(this._reasonText(s.reason))} · ${esc(s.control.name)} ${esc(s.control.label)}</p></div>
                    ${deltaPill}
                </div>
                <div class="or-duel">
                    <div class="or-side you">${this._myAvatarHTML()}<div><strong>You</strong><span>${hasDelta ? `${s.ratingAfter - s.ratingDelta} → ${s.ratingAfter}` : esc(String(OnlineRatings.get(this.userId, s.control.id)))}</span></div></div>
                    <div class="or-vs" aria-hidden="true">vs</div>
                    <div class="or-side foe">${this._oppCardAvatarHTML()}<div><strong>${esc(s.opp?.name || 'Opponent')}</strong><span>${esc(String(s.opp?.rating ?? '')) || esc(theirs)}</span></div></div>
                </div>
                <p class="or-sub">${rateLine}${xpLine} <span class="or-moves">${movesPlayed} moves</span></p>
                ${noteLine}
                ${reviewBlock}
                <div class="or-actions">
                    <button class="btn-primary sm" data-action="online-rematch" type="button">${ChessCourseApp.ACT_ICONS.rematch}<span class="btn-act-tx">Rematch</span></button>
                    ${this._clerk?.user ? `<button class="btn-secondary sm" data-action="online-quick" type="button"><span class="btn-icon">▶</span><span class="btn-act-tx">New game</span></button>` : ''}
                    <button class="btn-secondary sm" data-action="online-review" type="button">${ChessCourseApp.ACT_ICONS.review}<span class="btn-act-tx">Review</span></button>
                    <button class="btn-secondary sm" data-action="online-leave" type="button">${ChessCourseApp.ACT_ICONS.lobby}<span class="btn-act-tx">Leave</span></button>
                </div>
            </div>`;
        })();
        const resultLine = !over ? '' : (resultCard
            || `<div class="feedback info">Draw. ${this._reasonText(s.reason)}${rateLine}${xpLine}</div>${unratedBit}${shortBit}`);
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
                    ${over ? `<button id="or-reopen" data-action="online-result-open" type="button"><span aria-hidden="true">♛</span> Result</button>` : ''}
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
                            ? `<button class="btn-primary btn-glow-strong" data-action="online-rematch" aria-label="Rematch">${ChessCourseApp.ACT_ICONS.rematch}<span class="btn-act-tx">Rematch</span></button>
                               <button class="btn-secondary" data-action="online-review" aria-label="Review game">${ChessCourseApp.ACT_ICONS.review}<span class="btn-act-tx">Review</span></button>
                               ${this._muteBtnHTML()}
                               <button class="btn-secondary" data-action="online-leave" aria-label="Back to lobby">${ChessCourseApp.ACT_ICONS.lobby}<span class="btn-act-tx">Lobby</span></button>`
                            : `<button class="btn-secondary" data-action="online-draw-offer" aria-label="Offer draw">${ChessCourseApp.ACT_ICONS.draw}<span class="btn-act-tx">Draw</span></button>
                               <button class="btn-secondary" data-action="online-resign-ask" aria-label="Resign">${ChessCourseApp.ACT_ICONS.resign}<span class="btn-act-tx">Resign</span></button>
                               ${this._muteBtnHTML()}
                               <button class="btn-secondary" data-action="online-leave-ask" aria-label="Leave game">${ChessCourseApp.ACT_ICONS.leave}<span class="btn-act-tx">Leave</span></button>`}
                    </div>
                </div>
            </div>`;
        this._drawOnline();
        this._onlineStatus();
        this._paintOnlineClocks();
        // Result modal state: popped over the board on game over, dismissed
        // to inspect the final position (reopen pill), gone otherwise.
        try {
            const scr = document.getElementById('online-screen');
            if (scr) {
                scr.classList.toggle('or-over', over);
                scr.classList.toggle('or-open', !!(over && !(s._resultDismissed)));
            }
            const orBox = document.getElementById('online-result');
            if (orBox && !orBox.dataset.veilBound) {
                orBox.dataset.veilBound = '1';
                orBox.addEventListener('click', (e) => {
                    if (e.target === orBox) { try { this._onlineResultDismiss(); } catch (_) {} }
                });
            }
        } catch (_) {}
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
        const img = s?.opp?.img;
        // Only https photos render; anything else becomes the letter tile
        // (http/blob/data URLs broke into broken-image icons in the cards).
        if (typeof img === 'string' && /^https:/.test(img)) return this._oppImgHTML(name, img.slice(0, 2048));
        return `<div class="avatar-letter">${esc((name || 'F')[0].toUpperCase())}</div>`;
    }
    _oppImgHTML(name, src) {
        return `<img class="avatar" src="${esc(src)}" width="52" height="52" alt="${esc(name)}" data-opp-img="1" loading="eager" decoding="async" referrerpolicy="no-referrer">`;
    }
    // My own photo on the You-card — letter tile until auth resolves, and
    // again if the photo cannot load or the player signs out.
    _myAvatarHTML() {
        const u = this._meTag();
        if (u.img) return `<img class="avatar you" src="${esc(u.img)}" width="52" height="52" alt="${esc(u.name)}" data-my-img="1" loading="eager" decoding="async" referrerpolicy="no-referrer">`;
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
        const wantImg = typeof s.opp?.img === 'string' && /^https:/.test(s.opp.img);
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
        const bot = this._botGame ? this._cpuBot : null;
        const mine = (status.split('-')[1] || 'white') === this._sidePlayer();
        let title = 'Game over', body = '';
        if (status.startsWith('checkmate')) {
            const w = mine;
            title = w ? 'You win!' : `${(bot && bot.name) || 'Computer'} wins`;
            body = w
                ? (bot ? `Checkmate — magnificent play! Rematch ${bot.name} or try a stronger bot.` : 'Checkmate — magnificent play! Your lesson is complete.')
                : 'Checkmate — study the final position, then try again!';
        } else if (status === 'stalemate') { title = 'Draw'; body = 'Stalemate — neither side has a legal move.'; }
        else if (status.startsWith('draw-')) {
            title = 'Draw';
            body = { 'draw-insufficient': 'Neither side can possibly checkmate.', 'draw-repetition': 'Threefold repetition.', 'draw-fifty': 'Fifty-move rule.' }[status] || '';
        } else if (status.startsWith('resign-') || status.startsWith('timeout-') || status === 'resigned' || status === 'aborted') {
            // Resign / timeout / abort still deserves the card (old code hid
            // it, so resigning with 0 moves showed nothing above the board).
            const winner = (status.split('-')[1] || (mine ? 'white' : 'black'));
            const w = winner === this._sidePlayer();
            title = w ? 'You win!' : `${(bot && bot.name) || 'Opponent'} wins`;
            body = status.includes('resign') ? 'by resignation. Every master has resigned — review, then run it back!'
                : status.includes('timeout') ? 'on time. Keep an eye on the clock next game!'
                : 'Game over — no rating change.';
        } else { card.style.display = 'none'; this._gameOverShown = false; return; }
        // Beginner-friendly review: same grader as online play.
        let reviewBlock = '';
        try {
            const hist = (this.game && this.game.moveHistory) || [];
            if (hist.length) {
                const norm = hist.map(m => ({ from: m.from, to: m.to, promotion: m.promotion || null }));
                const rv = this._gradeGameMoves(norm, this._sidePlayer());
                if (rv && rv.total > 0) reviewBlock = this._reviewHTML(rv, { titleSuffix: `${hist.length} plies` });
            }
        } catch (_) {}
        card.innerHTML = `<h3 id="gameover-title" tabindex="-1">${title}</h3><p>${body}</p>
            ${reviewBlock}
            <div class="lesson-actions">
                <button class="btn-primary btn-glow-strong" data-action="reset-board">Rematch</button>
                <button class="btn-secondary" data-action="gameover-hide">Review board</button>
                <button class="btn-secondary" data-action="bot-to-study" type="button">🔍 Study</button>
                ${bot
                    ? `<button class="btn-secondary" data-action="back-bots">Bots</button>`
                    : `<button class="btn-secondary" data-action="back-lessons">Lessons</button>`}
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
        // The Study board opens with THIS exact game: full engine analysis
        // on the moves just played (importGame reads the durable session).
        try {
            if (window.DoChessStudy && s.gameId && window.DoChessStudy.importGame(s.gameId)) return;
        } catch (_) {}
        // Fallback: step through on the game board itself.
        s.viewPly = 0;
        this._drawOnline();
        this._onlineStatus('Reviewing the game — step with …');
    }
    _botToStudy() {
        try {
            const hist = (this.game && this.game.moveHistory) || [];
            if (!hist.length) return;
            const moves = hist.map(m => ({ from: m.from, to: m.to, promotion: m.promotion || null }));
            const bot = this._botGame ? this._cpuBot : null;
            const title = bot ? `vs ${bot.name} · practice` : 'Practice game';
            if (window.DoChessStudy && typeof window.DoChessStudy.importMoves === 'function') {
                if (window.DoChessStudy.importMoves(moves, title)) return;
            }
            if (window.DoChessStudy && typeof window.DoChessStudy.openPosition === 'function') {
                const uci = moves.map(m => `${m.from}${m.to}${m.promotion ? String(m.promotion).toLowerCase().slice(-1) : ''}`);
                if (window.DoChessStudy.openPosition({ title, moves: uci })) return;
            }
            this.showStudy();
        } catch (_) { try { this.showStudy(); } catch (_) {} }
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
    showProfile()  { this._go('profile-screen');  this._renderProfile(); this._loadServerHist(); this._refreshProfileXp(); }
    showStudy()    { this._go('study-screen'); if (window.DoChessStudy) window.DoChessStudy.open(); }
    showPuzzles()  { this._go('puzzles-screen'); if (window.DoChessPuzzles) window.DoChessPuzzles.open(); }
    showFriends(tab) {
        this._go('friends-screen');
        try { if (window.DoChessFriends) window.DoChessFriends.open(tab || 'friends'); } catch (_) {}
        this._consumeFriendLink();
    }
    /**
     * The bell toggles like an app notification shade: pressing it while
     * already on Activity goes BACK to where you were (critical on phones,
     * where there is no other back gesture to the game you came from).
     * Otherwise it remembers the current screen and opens Activity.
     */
    _toggleFriendsActivity() {
        try {
            const F = window.DoChessFriends;
            const onAct = document.getElementById('friends-screen')?.classList.contains('active')
                && F && typeof F.tab === 'function' && F.tab() === 'activity';
            if (onAct) {
                const back = this._screenBeforeActivity;
                this._screenBeforeActivity = null;
                if (back === 'profile-screen') return void this.showProfile();
                if (back === 'progress-screen') return void this.showProgress();
                if (back === 'online-screen') return void this.showOnline();
                if (back === 'study-screen') return void this.showStudy();
                if (back === 'puzzles-screen') return void this.showPuzzles();
                if (back === 'lessons-screen') return void this.showLessons();
                if (back === 'learn-screen') {
                    try {
                        const nav = document.querySelector('[data-nav="learn"]');
                        if (nav) return void nav.click();
                    } catch (_) {}
                    return void this.showHome();
                }
                if (back === 'home-screen') return void this.showHome();
                // lesson-screen needs a lesson id to render — the safe
                // return is the lessons list, never a blank board.
                return void this.showLessons();
            }
            try {
                const cur = (document.body && document.body.dataset.screen) || 'home-screen';
                this._screenBeforeActivity = (cur && cur !== 'friends-screen') ? cur : (this._screenBeforeActivity || 'home-screen');
            } catch (_) { this._screenBeforeActivity = 'home-screen'; }
            this.showFriends('activity');
        } catch (_) { try { this.showFriends('activity'); } catch (_) {} }
    }

    // Friend invite links (#friend-<uid>-<slug>): the opener lands here and
    // can accept instantly — the slug carries the sender's display name.
    _consumeFriendLink() {
        let uid = null, name = null, img = null;
        try {
            const m = /^#friend-([^#]{1,400})$/i.exec(location.hash || '');
            if (m) {
                const parts = m[1].split('-');
                // Trailing photo segment: the longest suffix that decodes to an https URL.
                for (let i = parts.length - 1; i >= 2 && !img; i--) {
                    const cand = parts.slice(i).join('-');
                    if (/^[A-Za-z0-9\-_]{20,400}$/.test(cand)) {
                        try {
                            let b = cand.replace(/-/g, '+').replace(/_/g, '/');
                            while (b.length % 4) b += '=';
                            const dec = decodeURIComponent(escape(atob(b)));
                            if (/^https:\/\//.test(dec)) { img = dec.slice(0, 2048); parts.splice(i); }
                        } catch (_) {}
                    }
                }
                if (/^[\w-]{1,64}$/.test(parts[0] || '')) {
                    uid = parts[0];
                    try { name = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('-')) : null; } catch (_) { name = parts.slice(1).join('-') || null; }
                }
            }
        } catch (_) {}
        if (!uid || (this.userId && uid === this.userId)) return;
        try {
            const u = new URL(location.href);
            u.hash = '';
            history.replaceState(null, '', u.pathname + u.search + u.hash);
        } catch (_) {}
        try {
            if (window.DoChessFriends) window.DoChessFriends.inboundLink(uid, name, img);
        } catch (_) {}
    }

    _copyFriendLink(btn) {
        const inp = document.getElementById('friend-link');
        const prev = btn ? btn.textContent : '';
        const done = () => {
            if (!btn) return;
            try { btn.textContent = 'Copied!'; } catch (_) {}
            setTimeout(() => { try { btn.textContent = prev; } catch (_) {} }, 1500);
        };
        const show = (txt) => { if (inp) { inp.value = txt; } done(); };
        try {
            if (window.DoChessFriends) {
                const link = window.DoChessFriends.profileLink();
                if (!link) { this._fb('Sign in to get your friend link.', 'error'); return; }
                if (inp) inp.value = link;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(link).then(done, () => { try { inp && inp.select(); } catch (_) {} done(); });
                    return;
                }
                try { inp && inp.select(); } catch (_) {}
                done();
                return;
            }
        } catch (_) {}
    }

    openUserProfile() {
        if (this._clerk && this._clerk.user) {
            try { this._clerk.openUserProfile({}); return; } catch (_) {}
        }
        this._fb('Sign in first to manage your account.', 'error');
    }
    async signOut() {
        // Goodbye first, while the session token still works: friends stop
        // seeing a ghost "online now" the moment this lands.
        try { if (window.DoChessFriends) await window.DoChessFriends.presenceLeave(); } catch (_) {}
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
        document.getElementById('logout-btn')?.addEventListener('click', async () => { try { if (window.DoChessFriends) await window.DoChessFriends.presenceLeave(); } catch (_) {} try { await this._clerk?.signOut(); } catch (_) {} });
        // Returning session? Restore silently so the avatar is already there.
        // Also boot right after an OAuth/email redirect (Clerk lands back on
        // this page with ?__clerk_* params): without this the user had to
        // press Sign-in a SECOND time before the session appeared.
        let returning = false;
        try {
            const q = location.search || '';
            const returningRedirect = /__clerk|clerk_ticket|sign_in_callback|created_session/i.test(q);
            returning = localStorage.getItem('cc_had_session') === '1' || /(^|;\s*)__session=/.test(document.cookie) || returningRedirect;
        } catch (_) {}
        if (returning) this._ensureClerk();
        // Phones evict JS state when the tab sleeps: if we remembered a
        // session but Clerk isn't up when the tab wakes, reload it instead
        // of silently dropping to guest (the "logged out every time" bug).
        try {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) return;
                try {
                    if (localStorage.getItem('cc_had_session') === '1' && !this._clerk) this._ensureClerk();
                } catch (_) {}
            });
        } catch (_) {}
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
                const loadScript = (src, integrity, keyAttr, noSRI) => new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
                    if (integrity && !noSRI) s.integrity = integrity;
                    // The UMD bundle reads its key off its own script tag at
                    // evaluation time and aborts without it (per Clerk docs).
                    if (keyAttr) s.setAttribute('data-clerk-publishable-key', keyAttr);
                    s.onload = res;
                    s.onerror = () => {
                        // A stale SRI hash (CDN republish) must never kill
                        // sign-in outright: retry once without the hash over
                        // the same pinned HTTPS URL before giving up.
                        if (integrity && !noSRI) {
                            loadScript(src, null, keyAttr, true).then(res, rej);
                        } else rej(new Error('auth unavailable'));
                    };
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
        if (c) { try { c.openSignIn({}); } catch (_) {} return; }
        // Auth SDK failed to load (offline / blocked CDN): say so instead
        // of a dead button. Guest play + invite links keep working.
        try { this._fb('Sign-in is unreachable right now — check your connection and retry. Guests can still play via invite links.', 'error'); } catch (_) {}
        try { this._onlineLobbyMsg('Sign-in is unreachable right now — check your connection and retry.', 'error'); } catch (_) {}
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
        // Side rail auth button mirrors the header state (the header hides
        // on desktop, so this is the visible sign-in there).
        try {
            const snLabel = document.querySelector('#sn-auth .sn-auth-label');
            if (snLabel) {
                const u = this._clerk.user;
                snLabel.textContent = u ? ((u.fullName || u.username || 'Account').split(' ')[0]) : 'Sign in';
                document.getElementById('sn-auth')?.setAttribute('title', u ? 'Account' : 'Sign in');
            }
        } catch (_) {}
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
        // Side-rail brand mark follows the same rule (white knight on dark
        // chrome, black knight on light) — it has no id, so sync by class.
        try {
            document.querySelectorAll('.sn-logo-img').forEach((img) => {
                img.src = this.theme === 'day' ? `assets/logos/logo-128-light.png?${v}` : `assets/logos/logo-128-dark.png?${v}`;
            });
        } catch (_) {}
        const heroLogo = document.getElementById('hero-logo-img');
        if (heroLogo) heroLogo.src = this.theme === 'day' ? `assets/logos/logo-256-light.png?${v}` : `assets/logos/logo-256-dark.png?${v}`;
        if (persist) {
            try { localStorage.setItem('ccp_theme', this.theme); } catch (_) {}
        }
        this._syncThemeButton();
    }

    /* ── Board skins: square colors for every board, chosen in the
       Online lobby. CSS vars on body[data-board-skin] do the painting.
       ids are IMMUTABLE (stored in localStorage) — only add, never rename. */
    static BOARD_SKINS = [
        { id: 'brown',  name: 'Brown',  light: '#F0D9B5', dark: '#B58863' },
        { id: 'blue',   name: 'Blue',   light: '#DCE6EC', dark: '#7A99AD' },
        { id: 'green',  name: 'Green',  light: '#EDF2D7', dark: '#82A35F' },
        { id: 'gray',   name: 'Gray',   light: '#EAEAEA', dark: '#8A8A8A' },
        { id: 'wood',   name: 'Wood',   light: '#EBCD9D', dark: '#9C6B43' },
        { id: 'purple', name: 'Purple', light: '#E3D6EC', dark: '#8B5FA6' },
        { id: 'midnight', name: 'Midnight', light: '#46536E', dark: '#232A3D' },
        { id: 'emerald',  name: 'Emerald',  light: '#EEEED2', dark: '#769656' },
        { id: 'crimson',  name: 'Crimson',  light: '#F3E2DA', dark: '#9E3D34' },
        // Party boards: same readable contrast, loud personalities. The
        // artwork is pure CSS/SVG tilework (see styles.css) — no downloads.
        { id: 'lovely', name: 'Lovely', light: '#FBE3EC', dark: '#E75480' },
        { id: 'kitty',  name: 'Kitty',  light: '#FFF5F7', dark: '#FF9EBB' },
        { id: 'knight', name: 'Dark Knight', light: '#8E9AAF', dark: '#1B1E27' },
        { id: 'sixtyseven', name: '67', light: '#FFF3B0', dark: '#FFB700' },
        { id: 'galaxy', name: 'Galaxy', light: '#4A3B7A', dark: '#171233' },
        { id: 'candy',  name: 'Candy',  light: '#FFE0F0', dark: '#7B2FF7' }
    ];

    /* Piece SETS — the artwork folders under assets/pieces/. The list is
       mirrored in js/pieces.js (the resolver every screen uses); ids must
       match. Chosen next to Board style in the Online lobby. */
    static PIECE_SETS = (window.DoChessPieces && DoChessPieces.SETS) || [
        { id: 'classic', name: 'Classic', dir: 'pieces-main' }
    ];

    /* ── Vs Bots roster: data-driven so new bots are one array entry.
       Elo drives the engine (depth + blunder rate, see botCpuParams), so a
       200 plays like a beginner and a 2000+ punishes like one. Each bot has
       three portraits (straight/happy/angry) for live reactions. ── */
    static BOTS = [
        { id: 'alex',   name: 'Alex',          elo: 200,
          avatar: 'assets/DoChess_Bot_Avatars/straight/bot-1.png',
          moods: { straight: 'assets/DoChess_Bot_Avatars/straight/bot-1.png', happy: 'assets/DoChess_Bot_Avatars/happy/bot-1.png', angry: 'assets/DoChess_Bot_Avatars/angry/bot-1.png' },
          blurb: 'Just learned how the horsey moves. Be nice.' },
        { id: 'prima',  name: 'Prima',         elo: 400,
          avatar: 'assets/DoChess_Bot_Avatars/straight/bot-2.png',
          moods: { straight: 'assets/DoChess_Bot_Avatars/straight/bot-2.png', happy: 'assets/DoChess_Bot_Avatars/happy/bot-2.png', angry: 'assets/DoChess_Bot_Avatars/angry/bot-2.png' },
          blurb: 'Knows one opening trap and will absolutely try it.' },
        { id: 'nico',   name: 'Nico',          elo: 800,
          avatar: 'assets/DoChess_Bot_Avatars/straight/bot-3.png',
          moods: { straight: 'assets/DoChess_Bot_Avatars/straight/bot-3.png', happy: 'assets/DoChess_Bot_Avatars/happy/bot-3.png', angry: 'assets/DoChess_Bot_Avatars/angry/bot-3.png' },
          blurb: 'Solid club player. Punishes hanging pieces.' },
        { id: 'luna',   name: 'Luna',          elo: 1200,
          avatar: 'assets/DoChess_Bot_Avatars/straight/bot-4.png',
          moods: { straight: 'assets/DoChess_Bot_Avatars/straight/bot-4.png', happy: 'assets/DoChess_Bot_Avatars/happy/bot-4.png', angry: 'assets/DoChess_Bot_Avatars/angry/bot-4.png' },
          blurb: 'Sharp tactics. Double-check every trade.' },
        { id: 'max',    name: 'Max',           elo: 1600,
          avatar: 'assets/DoChess_Bot_Avatars/straight/bot-5.png',
          moods: { straight: 'assets/DoChess_Bot_Avatars/straight/bot-5.png', happy: 'assets/DoChess_Bot_Avatars/happy/bot-5.png', angry: 'assets/DoChess_Bot_Avatars/angry/bot-5.png' },
          blurb: 'Deep calculation. Bring your best game.' },
        { id: 'atlas',  name: 'Atlas',         elo: 2100,
          avatar: 'assets/DoChess_Bot_Avatars/straight/bot-6.png',
          moods: { straight: 'assets/DoChess_Bot_Avatars/straight/bot-6.png', happy: 'assets/DoChess_Bot_Avatars/happy/bot-6.png', angry: 'assets/DoChess_Bot_Avatars/angry/bot-6.png' },
          blurb: 'The final boss. Good luck.' }
    ];

    /** Engine settings per bot Elo: search depth, blunder rate, the
        score window a "casual" pick may fall inside, and `wild` — the
        chance of a FULLY random legal move (how real beginners actually
        play: sometimes the rook just goes for a walk). Easy/Medium below
        are exactly the legacy behaviours, so existing games play
        identically. Strengths are engineered estimates, not tournament
        ratings: every rung searches deeper or plays wilder-less than the
        one below, so the ladder order is strict by construction (verified
        by self-play gauntlet, see test-vs-bots). Quiescence search lifts
        the top rungs, but is withheld from beginners — a real 200-Elo
        player genuinely misses tactics, and `noise` (evaluation jitter)
        makes weak bots misjudge quiet positions the way humans do. */
    static botCpuParams(elo) {
        const e = Number(elo) || 800;
        if (e <= 300)  return { depth: 1, blunder: 0.30, pool: 200, wild: 0.25, capMs: 0, qdepth: 0, noise: 170 };
        if (e <= 600)  return { depth: 1, blunder: 0.12, pool: 80, wild: 0.08, capMs: 0, qdepth: 2, noise: 85 };
        if (e <= 1000) return { depth: 2, blunder: 0.10, pool: 50, wild: 0, capMs: 1200, qdepth: 3, noise: 40 };
        if (e <= 1400) return { depth: 3, blunder: 0.03, pool: 30, wild: 0, capMs: 2000, qdepth: 5, noise: 15 };
        if (e <= 1800) return { depth: 3, blunder: 0, pool: 0, wild: 0, capMs: 2000, qdepth: 6, noise: 0 };
        return { depth: 4, blunder: 0, pool: 0, wild: 0, capMs: 3000, qdepth: 6, noise: 0 };
    }

    // Line icons for the online action bar. Phones hide the text labels
    // (btn-act-tx) and keep only these; desktop shows icon + label.
    static ACT_ICONS = {
        rematch: '<svg viewBox="0 0 24 24" class="btn-act-ic" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.66-5.66L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.66 5.66L4 16M4 20v-4h4"/></svg>',
        review: '<svg viewBox="0 0 24 24" class="btn-act-ic" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16 16"/></svg>',
        lobby: '<svg viewBox="0 0 24 24" class="btn-act-ic" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z"/></svg>',
        draw: '<svg viewBox="0 0 24 24" class="btn-act-ic" aria-hidden="true"><path d="M8.5 15.5l-3-3a2 2 0 0 1 0-2.83l3.5-3.5a2 2 0 0 1 2.83 0l3.5 3.5M15.5 15.5l3-3a2 2 0 0 0 0-2.83l-3.5-3.5"/><path d="M4 14l3 3a2 2 0 0 0 2.83 0L14 12.8M10 17l1.2 1.2a2 2 0 0 0 2.83 0L20 12.2"/></svg>',
        resign: '<svg viewBox="0 0 24 24" class="btn-act-ic" aria-hidden="true"><path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/></svg>',
        leave: '<svg viewBox="0 0 24 24" class="btn-act-ic" aria-hidden="true"><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M9 8l-4 4 4 4M5 12h10"/></svg>'
    };

    _boardSkin() {
        try {
            const s = localStorage.getItem('cc_board_skin');
            if (s && ChessCourseApp.BOARD_SKINS.some(k => k.id === s)) return s;
        } catch (_) {}
        return 'brown';
    }

    _applyBoardSkin(id, persist = true) {
        const skin = ChessCourseApp.BOARD_SKINS.some(k => k.id === id) ? id : 'brown';
        this.boardSkin = skin;
        if (skin === 'brown') delete document.body.dataset.boardSkin;
        else document.body.dataset.boardSkin = skin;
        if (persist) {
            try { localStorage.setItem('cc_board_skin', skin); } catch (_) {}
            try { window.DoChessSync && DoChessSync.notify(); } catch (_) {}
        }
    }

    _setBoardSkin(id) {
        this._applyBoardSkin(id);
        if (document.getElementById('online-content') && (!this.online || this.online.phase === 'lobby')) {
            this._renderOnlineLobby();
        }
    }

    /* ── Piece sets: artwork folder for every board. Same lifecycle as
       board skins — read from storage, apply to <body>, re-render the
       lobby so the swatch state follows the click. ── */
    _pieceSet() {
        if (window.DoChessPieces) return DoChessPieces.get();
        return 'modern';
    }

    _setPieceSet(id) {
        if (window.DoChessPieces) DoChessPieces.set(id);
        try { window.DoChessSync && DoChessSync.notify(); } catch (_) {}
        if (document.getElementById('online-content') && (!this.online || this.online.phase === 'lobby')) {
            this._renderOnlineLobby();
        }
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
        // Every theme toggle (header, side rail) stays in sync.
        const isDay = this.theme === 'day';
        document.querySelectorAll('.theme-toggle').forEach((btn) => {
            btn.querySelector('.theme-toggle-label').textContent = isDay ? 'Day' : 'Night';
            btn.setAttribute('aria-pressed', isDay ? 'true' : 'false');
            btn.title = isDay ? 'Switch to night mode' : 'Switch to day mode';
        });
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
                ${this._profileAchievementsHTML()}
            </div>`;
            return;
        }
        box.innerHTML = `
            <div class="dc-profile">
                ${this._profileIdentityHTML(user)}
                ${this._profileAchievementsHTML()}
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
                    <img class="dc-avatar-img" src="${this._pieceFile('K')}" width="88" height="88" alt="Guest learner" data-fallback-piece="K">
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
        // Rapid leads: it is the game's main rating. The trend chip stays
        // Blitz-scoped (the only trend computed), so rapid shows unadorned.
        const rapid = OnlineRatings.get(this.userId, 'rapid');
        let lvlChip = '';
        try {
            if (window.DoChessFriends && typeof window.DoChessFriends.xpSummary === 'function') {
                const xs = window.DoChessFriends.xpSummary();
                if (xs && Number.isFinite(xs.xp)) {
                    lvlChip = `<span class="dc-lvl-chip" title="Level ${xs.lvl} — ${xs.xp} XP (Lessons ${xs.learn} · Games ${xs.games} · Puzzles ${xs.puzzles} · Streaks ${xs.streaks})">LVL ${xs.lvl} · ${xs.xp} XP</span>`;
                }
            }
        } catch (_) {}
        let rankChip = '';
        try { if (typeof DoChessAchievements !== 'undefined') rankChip = DoChessAchievements.rankChipHTML(this.userId); } catch (_) {}
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
                        <span class="dc-rate-chip" title="Main Rapid rating">Rapid <strong>${rapid}</strong></span>
                        ${lvlChip ? `<span class="dc-sep" aria-hidden="true">·</span>${lvlChip}` : ''}
                        ${rankChip ? `<span class="dc-sep" aria-hidden="true">·</span>${rankChip}` : ''}
                        <span class="dc-sep" aria-hidden="true">·</span>${this._syncChipHTML()}
                    </p>
                    ${this._profileBadgesHTML()}
                    <p class="dc-line" style="margin-top:.5rem">Friends play free, streaks grow daily:</p>
                    <div class="join-row"><input id="friend-link" class="join-input" readonly placeholder="Your friend link…" autocomplete="off" spellcheck="false"><button class="btn-secondary sm" data-action="friend-copy-link" type="button">Copy link</button></div>
                </div>
                <div class="dc-id-side">${this._profileNextHTML()}</div>
            </section>`;
    }

    /* Cloud-save state for the profile dossier. Kept as one tiny chip so
       a learner always knows whether this browser or their account holds
       the progress they are looking at. */
    _syncChipHTML() {
        let st = null;
        try { st = window.DoChessSync && DoChessSync.status(); } catch (_) {}
        if (!st || !st.enabled) {
            return `<span class="dc-sync off" data-sync-chip><span class="dc-sync-dot" aria-hidden="true"></span>Saved on this device</span>`;
        }
        const map = {
            saved: ['saved', 'Saved to your account'],
            syncing: ['busy', 'Syncing…'],
            offline: ['warn', 'Offline — will retry'],
            error: ['warn', 'Sync problem — will retry'],
            disabled: ['off', 'Local only']
        };
        const [kind, label] = map[st.status] || map.syncing;
        // Conflict notice: the last push lost a cross-device race on these
        // sections, so the newer cloud copy was kept and this browser updated
        // to match. Persistent until the next successful sync; the title says
        // exactly what was kept so nothing is silently dropped.
        if (st.status === 'saved' && st.conflict && st.conflict.length) {
            const ids = st.conflict.join(', ');
            return `<span class="dc-sync warn" data-sync-chip title="Newer progress from your other device was kept for: ${esc(ids)}. This browser now matches it."><span class="dc-sync-dot" aria-hidden="true"></span>Synced — newer progress kept</span>`;
        }
        return `<span class="dc-sync ${kind}" data-sync-chip title="Cloud progress for this DoChess account"><span class="dc-sync-dot" aria-hidden="true"></span>${label}</span>`;
    }

    async _profileSignIn(btn) {
        // Phone entry point: Clerk loads lazily, so ENSURE it here — the old
        // code only worked when Clerk was already loaded and otherwise wrote
        // to the (invisible from here) lesson feedback strip: "nothing appears".
        if (this._clerk) { try { this._clerk.openSignIn({}); return; } catch (_) {} }
        const prev = btn ? btn.textContent : '';
        if (btn) { try { btn.disabled = true; btn.textContent = 'Loading…'; } catch (_) {} }
        try {
            const c = await this._ensureClerk();
            if (c) { try { c.openSignIn({}); return; } finally { if (btn) { try { btn.disabled = false; btn.textContent = prev; } catch (_) {} } } }
        } catch (_) {}
        if (btn) { try { btn.disabled = false; btn.textContent = 'Retry sign in'; } catch (_) {} }
        this._fb('Sign-in is unavailable right now — check your connection and retry.', 'error');
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

    /* Rank card + full badge gallery, rendered by achievements.js from the
       device-local `cca_v1_` store. Guests see the same honest state. */
    _profileAchievementsHTML() {
        try {
            if (typeof DoChessAchievements !== 'undefined') return DoChessAchievements.profileHTML(this.userId);
        } catch (_) {}
        return '';
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
        // Rapid leads: it is the game's main rating. Each control keeps its
        // own Elo — a bullet win never touches the rapid number.
        const ordered = ChessCourseApp.onlineControls().slice().sort((a, b) =>
            (a.id === 'rapid' ? 0 : a.id === 'blitz' ? 1 : 2) - (b.id === 'rapid' ? 0 : b.id === 'blitz' ? 1 : 2));
        const rows = ordered.map(c => {
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
       time, "less" collapses back to the first 10. With a backend the
       pages are 20 from the database (see _histServerPage). */
    _histPage(step) {
        if (this._serverHist && this._serverHist.ok) { this._histServerPage(step); return; }
        const cur = this._histShown || 10;
        this._histShown = step < 0 ? 10 : cur + step;
        if (document.getElementById('profile-screen')?.classList.contains('active')) this._renderProfile();
    }
    /**
     * Pull the experience ledger when the dossier opens, then repaint if
     * it moved: the LVL chip must show ledgered XP, not a stale zero.
     */
    async _refreshProfileXp() {
        try {
            if (!window.DoChessFriends || typeof window.DoChessFriends.pullXp !== 'function'
                || typeof window.DoChessFriends.xpSummary !== 'function') return;
            const before = JSON.stringify(window.DoChessFriends.xpSummary());
            await window.DoChessFriends.pullXp();
            const after = JSON.stringify(window.DoChessFriends.xpSummary());
            if (before !== after && document.getElementById('profile-screen')?.classList.contains('active')) {
                this._renderProfile();
            }
        } catch (_) {}
    }
    /**
     * Pull the last-20 view window from the database. The archive itself
     * is never trimmed server-side; the profile only ever shows a window.
     * Re-renders the profile when fresher games land (guarded to the
     * profile screen so background tabs never repaint).
     */
    async _loadServerHist() {
        try {
            if (!this.userId || !window.DoChessFriends || typeof window.DoChessFriends.fetchGames !== 'function') return;
            const r = await window.DoChessFriends.fetchGames(20);
            if (!r || !r.ok) return;
            const before = JSON.stringify((this._serverHist && this._serverHist.games) || []);
            this._serverHist = { games: r.games || [], total: r.total || 0, ok: true };
            if (!this._histServerCount) this._histServerCount = 20;
            if (document.getElementById('profile-screen')?.classList.contains('active')
                && JSON.stringify(r.games || []) !== before) this._renderProfile();
        } catch (_) {}
    }
    async _histServerPage(step) {
        try {
            if (step < 0) this._histServerCount = 20;
            else {
                const held = (this._serverHist && this._serverHist.games) || [];
                const shown = this._histServerCount || 20;
                // Need more than we hold and the archive says more exists:
                // fetch the next page ending before our oldest game.
                if (held.length <= shown && held.length < (this._serverHist.total || 0)
                    && window.DoChessFriends && typeof window.DoChessFriends.fetchGames === 'function') {
                    const oldest = held.length ? held[held.length - 1].date : null;
                    const more = await window.DoChessFriends.fetchGames(20, oldest);
                    if (more && more.ok && more.games.length) this._serverHist.games = held.concat(more.games);
                }
                this._histServerCount = shown + 20;
            }
        } catch (_) {}
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
        // Database first: the last 20 as a view window over an archive
        // that is never trimmed. Device history is the honest fallback
        // (guests, offline, backend-less).
        const srv = (this._serverHist && this._serverHist.ok) ? this._serverHist : null;
        let hist = [];
        let total = 0;
        let shown = 0;
        let fromDb = false;
        if (srv) {
            fromDb = true;
            total = srv.total || 0;
            shown = Math.min(srv.games.length, this._histServerCount || 20);
            hist = srv.games.slice(0, shown);
        } else {
            try { hist = OnlineRatings.history(this.userId) || []; } catch (_) { hist = []; }
            total = hist.length;
            shown = Math.min(hist.length, this._histShown || 10);
            hist = hist.slice(0, this._histShown || 10);
        }
        const head = `<div class="dc-head"><h3>Recent games</h3>${total ? `<span class="dc-count">last ${shown} of ${total}${fromDb ? ' · saved' : ''}</span>` : ''}</div>`;
        if (!hist.length) {
            return `
            <section class="dc-panel dc-games" aria-label="Recent games">${head}
                <div class="dc-empty"><p>No rated games yet — challenge a friend to start your match history.</p>
                <button class="btn-secondary sm" data-action="goto-online" type="button">Play online</button></div>
            </section>`;
        }
        const rows = hist.map(g => {
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
        const rest = fromDb ? Math.max(0, total - shown) : Math.max(0, hist.length - shown);
        const foot = (rest > 0 || shown > (fromDb ? 20 : 10))
            ? `<div class="dc-hist-foot">
                ${rest > 0 ? `<button class="btn-secondary sm" data-action="hist-more" type="button">Show more (${rest} more)</button>` : ''}
                ${shown > (fromDb ? 20 : 10) ? `<button class="btn-secondary sm" data-action="hist-less" type="button">Show less</button>` : ''}
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

    // Phone "More" tab: bottom action sheet for the screens that don't fit
    // the tab bar. Sheet items are plain .nav-btns, so navigation +
    // highlight ride the existing handlers; this only opens/closes.
    _bindMoreSheet() {
        const trig = document.querySelector('#tab-bar [data-nav="more"]');
        const sheet = document.getElementById('more-sheet');
        const scrim = document.getElementById('more-scrim');
        if (!trig || !sheet || !scrim || trig.dataset.moreBound) return;
        trig.dataset.moreBound = '1';
        const close = () => {
            sheet.hidden = true; scrim.hidden = true;
            trig.setAttribute('aria-expanded', 'false');
        };
        trig.addEventListener('click', () => {
            const open = sheet.hidden;
            sheet.hidden = !open; scrim.hidden = !open;
            trig.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        sheet.addEventListener('click', (e) => { if (e.target.closest('[data-nav]')) close(); });
        scrim.addEventListener('click', close);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
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
        // Tab bar owns the chrome except while a game is live: hide it
        // during bot + online play (JS class, never a fragile :has rule, so
        // the bar cannot vanish in the lobby or linger over the board).
        try {
            const playing = (id === 'lesson-screen' && !!this._botGame)
                || (id === 'online-screen' && !!(this.online && this.online.phase === 'play'));
            document.body.classList.toggle('is-playing', !!playing);
        } catch (_) {}
        // Achievements: record section coverage (Explorer badge) + day touch.
        try { if (typeof DoChessAchievements !== 'undefined') DoChessAchievements.touch(this.userId, id); } catch (_) {}
        // learn-screen is module-owned (showLearn/showPickerHome) but must
        // still be toggled here: navigating Learn -> Puzzles used to leave it
        // active, stacking two pages (and, now that screens height-lock,
        // doubling the scroll height).
        ['home-screen','lessons-screen','lesson-screen','learn-screen','progress-screen','profile-screen','online-screen','vs-bots-screen','study-screen','puzzles-screen','friends-screen']
            .forEach(s => document.getElementById(s)?.classList.toggle('active', s === id));
        // A11y: move keyboard focus to the new screen so SR users land
        // on the heading instead of staying on a now-hidden control.
        try {
            const scr = document.getElementById(id);
            if (scr) { scr.focus({ preventScroll: true }); }
        } catch (_) {}
        // Keep nav highlighted so users always know where they are
        // (bot practice lives on the lesson screen but belongs to Play).
        const botPlay = id === 'lesson-screen' && this._botGame;
        const navFor = { 'home-screen': 'home', 'lessons-screen': 'lessons', 'lesson-screen': 'lessons', 'progress-screen': 'progress', 'profile-screen': 'profile', 'online-screen':
'online', 'vs-bots-screen': 'online', 'study-screen': 'study', 'puzzles-screen': 'puzzles', 'friends-screen': 'friends' };
        const active = botPlay ? 'online' : navFor[id];
        document.querySelectorAll('.nav-btn').forEach(b => {
            const key = b.dataset.nav || b.textContent.trim().toLowerCase();
            // Learn is module-owned (learn-screen): highlight its buttons too.
            b.classList.toggle('active', key === active || (id === 'learn-screen' && key === 'learn'));
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
                else if (key.startsWith('puzzles')) this.showPuzzles();
                else if (key.startsWith('friend')) this.showFriends();
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

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChessCourseApp();
    // Desktop screens height-lock to calc(100dvh - var(--app-header)); the
    // sticky header is 115px on wide desktops but 77px in the 1025-1199px
    // band, so publish the live height instead of hard-coding either value.
    const syncHeaderVar = () => {
        const hdr = document.querySelector('.header');
        if (hdr) document.documentElement.style.setProperty('--app-header', hdr.offsetHeight + 'px');
    };
    syncHeaderVar();
    window.addEventListener('resize', syncHeaderVar);
});
