/* ══════════════════════════════════════════════════════════════════════
   DoChess — PUZZLES
   Unlimited tactic puzzles from the community chess-puzzle-api
   (https://github.com/mauricioulloa/chess-puzzle-api — Lichess data,
   no key, 30 req/min). Classic script, file:// compatible; board logic
   uses the vendored `Chess` global (js/vendor/chess.js).

   Contract with the API:
     GET /v1/puzzles/random?ratingMin&ratingMax&theme
        → { id, fen, initialMove, initialMoveSan, positionFen,
            solverColor, rating, pieces, themes, ... }
        ALWAYS play from `positionFen` (it already includes initialMove).
        `solverColor` = the side the learner plays.
     GET /v1/puzzles/{id}/solution
        → { solution: ["e6e7","b2b1",...], solutionSan: [...] }
        UCI list, alternating starting with the solver. Even indices are
        the learner's moves; odd indices are the opponent's replies
        (auto-played). Solution is fetched up-front and kept in memory
        only — never rendered until Hint or after the puzzle is solved.

   Offline / rate-limited fallback: a small built-in pool so the screen
   always works on file:// and during 429s. ────────────────────────── */
(function () {
    'use strict';

    const API = 'https://chess.mauriulloa.com';
    const STORE_KEY = 'dochess:puzzles:v1';

    /* ── Built-in fallback pool (mate-in-1s, a fork, a free queen) ────
       Verified against the vendored chess.js. Used when the network is
       unreachable or rate-limited. ─────────────────────────────────── */
    const BUILTIN = [
        { id: 'b1', positionFen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', solverColor: 'white',
          rating: 900, themes: ['mateIn1', 'backRank'], solution: ['a1a8'], solutionSan: ['Ra8#'] },
        { id: 'b2', positionFen: '4r1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', solverColor: 'black',
          rating: 950, themes: ['mateIn1', 'backRank'], solution: ['e8e1'], solutionSan: ['Re1#'] },
        { id: 'b3', positionFen: '7k/6pp/8/8/8/8/8/Q7 w - - 0 1', solverColor: 'white',
          rating: 850, themes: ['mateIn1'], solution: ['a1a8'], solutionSan: ['Qa8#'] },
        { id: 'b4', positionFen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1', solverColor: 'white',
          rating: 1250, themes: ['fork'], solution: ['d5c7'], solutionSan: ['Nc7+'] },
        { id: 'b5', positionFen: '4k3/8/8/3q4/8/2B5/8/4K3 w - - 0 1', solverColor: 'white',
          rating: 800, themes: ['hangingPiece'], solution: ['c3d5'], solutionSan: ['Bxd5'] },
        { id: 'b6', positionFen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', solverColor: 'white',
          rating: 900, themes: ['mateIn1', 'backRank'], solution: ['e1e8'], solutionSan: ['Re8#'] }
    ];

    /* Rating bands mirror the API docs' bands. */
    const BANDS = {
        any:          { label: 'Any strength' },
        beginner:     { label: 'Beginner (< 1000)',      ratingMax: 999 },
        novice:       { label: 'Novice (1000–1399)',     ratingMin: 1000, ratingMax: 1399 },
        intermediate: { label: 'Intermediate (1400–1799)', ratingMin: 1400, ratingMax: 1799 },
        advanced:     { label: 'Advanced (1800–2199)',   ratingMin: 1800, ratingMax: 2199 },
        expert:       { label: 'Expert (2200+)',         ratingMin: 2200 }
    };

    const THEME_OPTIONS = ['any', 'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer',
        'discoveredAttack', 'doubleCheck', 'sacrifice', 'endgame', 'middlegame', 'opening',
        'hangingPiece', 'crushing', 'defensiveMove', 'attraction', 'clearance', 'deflection'];

    const THEME_WORDS = {
        mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3',
        fork: 'Fork', pin: 'Pin', skewer: 'Skewer',
        discoveredAttack: 'Discovered attack', doubleCheck: 'Double check',
        sacrifice: 'Sacrifice', endgame: 'Endgame', middlegame: 'Middlegame',
        opening: 'Opening', hangingPiece: 'Hanging piece', crushing: 'Crushing attack',
        defensiveMove: 'Defensive move', attraction: 'Attraction', clearance: 'Clearance',
        deflection: 'Deflection', backRank: 'Back rank'
    };

    /* ── DOM helpers ────────────────────────────────────────────────── */
    const $ = (id) => document.getElementById(id);

    function assetV() {
        try { if (window.ChessCourseApp && ChessCourseApp.assetV) return ChessCourseApp.assetV(); } catch (_) {}
        return 'v24';
    }

    const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

    function pieceImg(piece) {
        const white = piece === piece.toUpperCase();
        const kind = PIECE_NAMES[piece.toLowerCase()];
        if (!kind) return '';
        const src = (window.DoChessPieces && window.DoChessPieces.url(piece, assetV())) ||
            `assets/pieces/${white ? 'white' : 'black'}-${kind}.svg?${assetV()}`;
        return `<img src="${src}" ` +
            `class="pz-piece" alt="" draggable="false" data-fallback-piece="${piece}">`;
    }

    function rcToAlg(row, col) { return 'abcdefgh'[col] + (8 - row); }
    function algToRc(alg) { return [8 - +alg[1], 'abcdefgh'.indexOf(alg[0])]; }

    /* ── State ──────────────────────────────────────────────────────── */
    const S = {
        chess: null,          // vendored Chess at the current position
        puzzle: null,         // current puzzle object
        solution: [],         // UCI moves (memory only until revealed)
        solutionSan: [],
        step: 0,              // index into solution[]
        sel: null,            // selected square 'e2' | null
        lastMove: null,       // ['e2','e4'] for highlight
        hintMove: null,       // ['e6','e7'] while hint shown
        flipped: false,       // manual flip (auto-orient may also flip)
        mistakes: 0,
        solved: false,
        busy: false,          // opponent reply animating / fetching
        fromApi: true,        // current puzzle came from the API
        builtinIdx: 0,
        band: 'any',
        theme: 'any',
        stats: null,
        loading: false
    };

    /* ── Stats persistence ──────────────────────────────────────────── */
    function loadStats() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) return Object.assign({ solved: 0, attempted: 0, streak: 0, bestStreak: 0, hints: 0 }, JSON.parse(raw));
        } catch (_) {}
        return { solved: 0, attempted: 0, streak: 0, bestStreak: 0, hints: 0 };
    }
    function saveStats() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(S.stats)); } catch (_) {}
    }

    /* ── API ────────────────────────────────────────────────────────── */
    async function apiGet(path, timeoutMs) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
        try {
            const res = await fetch(API + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
            if (res.status === 429) {
                const retry = parseInt(res.headers.get('Retry-After') || '10', 10);
                const err = new Error('rate'); err.rate = retry; throw err;
            }
            if (!res.ok) throw new Error('http' + res.status);
            return await res.json();
        } finally { clearTimeout(t); }
    }

    async function fetchPuzzle() {
        const band = BANDS[S.band] || BANDS.any;
        let qs = '';
        if (band.ratingMin != null) qs += '&ratingMin=' + band.ratingMin;
        if (band.ratingMax != null) qs += '&ratingMax=' + band.ratingMax;
        if (S.theme && S.theme !== 'any') qs += '&theme=' + encodeURIComponent(S.theme);
        const data = await apiGet('/v1/puzzles/random' + (qs ? '?' + qs.slice(1) : ''));
        // Defensive: the API returns a single object; tolerate an array too.
        const p = Array.isArray(data) ? data[0] : data;
        if (!p || !p.positionFen || !p.solverColor) throw new Error('shape');
        const sol = await apiGet('/v1/puzzles/' + encodeURIComponent(p.id) + '/solution');
        return { puzzle: p, solution: Array.isArray(sol.solution) ? sol.solution : [], solutionSan: Array.isArray(sol.solutionSan) ? sol.solutionSan : [] };
    }

    function nextBuiltin() {
        const p = BUILTIN[S.builtinIdx % BUILTIN.length];
        S.builtinIdx++;
        return { puzzle: Object.assign({}, p), solution: p.solution.slice(), solutionSan: p.solutionSan.slice() };
    }

    /* ── Board painting (same square anatomy as Study / Learn) ─────── */
    function paintBoard() {
        const board = $('pz-board');
        if (!board || !S.chess) return;
        const rows = S.chess.board();
        const flip = isFlipped();
        let html = '';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const rr = flip ? 7 - r : r;
                const cc = flip ? 7 - c : c;
                const sq = rows[rr][cc];
                const alg = rcToAlg(rr, cc);
                let cls = 'chess-square ' + ((rr + cc) % 2 === 0 ? 'white' : 'black');
                if (S.sel === alg) cls += ' selected';
                if (S.lastMove && (S.lastMove[0] === alg || S.lastMove[1] === alg)) cls += ' last-move';
                if (S.hintMove && (S.hintMove[0] === alg || S.hintMove[1] === alg)) cls += ' pz-hint';
                html += `<div class="${cls}" data-square="${alg}">`;
                if (sq) html += pieceImg(sq.color === 'w' ? sq.type.toUpperCase() : sq.type);
                if (isLegalTarget(alg)) {
                    // Occupied square = capture ring; empty square = centre dot.
                    html += sq ? '<span class="pz-ring"></span>' : '<span class="pz-dot"></span>';
                }
                if (isWrongTarget(alg)) html += '<span class="pz-x"></span>';
                html += '</div>';
            }
        }
        board.innerHTML = html;
        // "Your move" state drives the green frame glow (and the a11y label).
        board.classList.toggle('pz-yourturn', !S.busy && !S.solved && !S.loading && !S.chess.game_over());
    }

    function isFlipped() {
        if (S.flipped) return true;
        return S.puzzle && S.puzzle.solverColor === 'black';
    }

    function legalTargets(from) {
        try { return S.chess.moves({ square: from, verbose: true }); } catch (_) { return []; }
    }

    function isLegalTarget(alg) {
        if (!S.sel || S.solved || S.busy) return false;
        return legalTargets(S.sel).some(m => m.to === alg);
    }

    function isWrongTarget(alg) { return false; } // reserved: animated miss marker

    /* ── Puzzle lifecycle ───────────────────────────────────────────── */
    async function loadPuzzle() {
        if (S.loading) return;
        S.loading = true;
        setFeedback('Loading puzzle…', 'info');
        setControlsEnabled(false);
        let loaded = null;
        try {
            loaded = await fetchPuzzle();
            S.fromApi = true;
        } catch (e) {
            // Rate-limited, offline, file://, or API down → built-in pool.
            loaded = nextBuiltin();
            S.fromApi = false;
            if (e && e.rate) setFeedback(`API is rate-limited — showing a built-in puzzle. Try again in ~${e.rate}s.`, 'info');
            else setFeedback('Puzzle API unreachable — showing a built-in puzzle. The rest of the page still works.', 'info');
        }
        startPuzzle(loaded);
        S.loading = false;
        setControlsEnabled(true);
    }

    function startPuzzle(loaded) {
        S.puzzle = loaded.puzzle;
        S.solution = loaded.solution;
        S.solutionSan = loaded.solutionSan;
        S.step = 0;
        S.sel = null;
        S.hintMove = null;
        S.mistakes = 0;
        S.solved = false;
        S.busy = false;
        S.flipped = false;
        // Play from positionFen — the position the solver must actually solve.
        try { S.chess = new Chess(S.puzzle.positionFen); }
        catch (_) { S.chess = new Chess(); }
        // last-move highlight from the setup move, when provided.
        S.lastMove = S.puzzle.initialMove && S.puzzle.initialMove.length >= 4
            ? [S.puzzle.initialMove.slice(0, 2), S.puzzle.initialMove.slice(2, 4)] : null;
        S.stats.attempted++;
        saveStats();
        renderMeta();
        renderStats();
        hideSolution();
        paintBoard();
        if (!S.fromApi) setFeedback('Find the best move.', 'turn');
        else setFeedback(`Find the best move for ${S.puzzle.solverColor === 'white' ? 'White' : 'Black'}.`, 'turn');
    }

    /* ── Move flow ──────────────────────────────────────────────────── */
    function onSquareClick(alg) {
        if (!S.chess || S.solved || S.busy || S.loading) return;
        const expected = S.solution[S.step];
        if (!expected) return; // solution exhausted but not marked solved — defensive

        if (S.sel && S.sel !== alg) {
            const targets = legalTargets(S.sel);
            if (targets.some(m => m.to === alg)) { tryPlayerMove(S.sel, alg); return; }
        }
        const piece = S.chess.get(alg);
        const turn = S.chess.turn();
        if (piece && piece.color === turn) { S.sel = alg; paintBoard(); return; }
        S.sel = null; paintBoard();
    }

    function tryPlayerMove(from, to) {
        const expected = S.solution[S.step];
        const expFrom = expected.slice(0, 2), expTo = expected.slice(2, 4);
        S.sel = null;
        if (from !== expFrom || to !== expTo) {
            // Wrong move: do not apply; flash the square and keep position.
            S.mistakes++;
            S.stats.streak = 0;
            saveStats();
            renderStats();
            flashWrong(to);
            setFeedback('Not the best move — try again.', 'error');
            paintBoard();
            return;
        }
        // Right move: apply exactly the solution UCI (keeps its promotion).
        applyUci(expected);
        S.step++;
        S.lastMove = [expFrom, expTo];
        paintBoard();
        continueSequence();
    }

    function continueSequence() {
        if (S.step >= S.solution.length) { onSolved(); return; }
        // Odd indices are the opponent's reply — auto-play after a short beat.
        const next = S.solution[S.step];
        if (S.step % 2 === 1) {
            S.busy = true;
            setFeedback('Opponent replies…', 'info');
            setTimeout(() => {
                applyUci(next);
                S.step++;
                S.lastMove = [next.slice(0, 2), next.slice(2, 4)];
                S.busy = false;
                paintBoard();
                if (S.step >= S.solution.length) onSolved();
                else setFeedback('Your move.', 'turn');
            }, 550);
        } else {
            setFeedback('Your move.', 'turn');
        }
    }

    /* Sound: reuse the site SoundEngine (same move clip + cc_mute key). */
    function pzSnd(capture) {
        try {
            const snd = window.app && window.app.snd;
            if (!snd) return;
            if (capture) snd.playCapture(); else snd.playMove();
        } catch (_) {}
    }

    function applyUci(uci) {
        try {
            const isCap = !!S.chess.get(uci.slice(2, 4));
            const mv = S.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
            if (mv) pzSnd(isCap);
            return mv;
        } catch (_) { return null; }
    }

    /* Analysis: the puzzle opens in OUR Study screen — a "Puzzles" study
       chapter with this position and the full solution line, engine ready.
       No external site involved. */
    function openAnalysis() {
        const p = S.puzzle;
        if (!p) return;
        if (window.DoChessStudy && DoChessStudy.openPosition) {
            DoChessStudy.openPosition({
                fen: p.positionFen || undefined,
                moves: (S.solution || []).slice(),
                title: `Puzzle ${p.id || ''}${p.rating ? ` - ${p.rating}` : ''}`,
            });
        } else {
            setFeedback('Analysis is not ready yet - open Study from the nav.', 'info');
        }
    }

    function onSolved() {
        S.solved = true;
        S.stats.solved++;
        if (S.mistakes === 0) {
            S.stats.streak++;
            if (S.stats.streak > S.stats.bestStreak) S.stats.bestStreak = S.stats.streak;
        } else {
            S.stats.streak = 0;
        }
        saveStats();
        renderStats();
        paintBoard();
        setFeedback(S.mistakes === 0 ? 'Solved - perfect!' : 'Solved!', 'success');
        renderSolution();
        try { if (window.app && window.app.snd) window.app.snd.playSuccess(); } catch (_) {}
    }

    function flashWrong(alg) {
        const sq = document.querySelector(`#pz-board [data-square="${alg}"]`);
        if (!sq) return;
        sq.classList.add('pz-wrong');
        setTimeout(() => sq.classList.remove('pz-wrong'), 450);
    }

    /* ── Controls ───────────────────────────────────────────────────── */
    function showHint() {
        if (!S.solution[S.step] || S.solved || S.busy) return;
        const u = S.solution[S.step];
        S.hintMove = [u.slice(0, 2), u.slice(2, 4)];
        S.stats.hints++;
        saveStats();
        paintBoard();
        setFeedback('Hint: look at the highlighted squares.', 'info');
        setTimeout(() => { S.hintMove = null; paintBoard(); }, 2000);
    }

    function flipBoard() { S.flipped = !S.flipped; paintBoard(); }

    function renderSolution() {
        const el = $('pz-solution');
        if (!el) return;
        const sans = S.solutionSan && S.solutionSan.length
            ? S.solutionSan
            : S.solution.map(u => u);
        let html = '<h4>Solution</h4><ol class="pz-sollist">';
        for (let i = 0; i < sans.length; i++) {
            const who = i % 2 === 0 ? (S.puzzle.solverColor === 'white' ? 'White' : 'Black')
                                    : (S.puzzle.solverColor === 'white' ? 'Black' : 'White');
            html += `<li><span class="pz-solwho">${who}</span> ${escapeHtml(String(sans[i]))}</li>`;
        }
        html += '</ol>';
        if (S.puzzle) html += `<button type="button" class="pz-link" id="pz-analyse-btn">Open analysis in DoChess &#8594;</button>`;
        el.innerHTML = html;
        el.hidden = false;
        const ab = document.getElementById('pz-analyse-btn');
        if (ab) ab.addEventListener('click', openAnalysis);
    }

    function hideSolution() { const el = $('pz-solution'); if (el) { el.hidden = true; el.innerHTML = ''; } }

    function renderMeta() {
        const el = $('pz-meta');
        if (!el || !S.puzzle) return;
        const themes = (S.puzzle.themes || []).map(t =>
            `<span class="pz-chip">${escapeHtml(THEME_WORDS[t] || t)}</span>`).join('');
        el.innerHTML =
            `<div class="pz-metarow"><span class="pz-rating">Rating <strong>${escapeAttr(String(S.puzzle.rating || '—'))}</strong></span>` +
            `<span class="pz-you">You play <strong>${S.puzzle.solverColor === 'white' ? 'White' : 'Black'}</strong></span>` +
            (S.fromApi ? '' : '<span class="pz-chip pz-offline">built-in</span>') + '</div>' +
            (themes ? `<div class="pz-themes">${themes}</div>` : '');
    }

    function renderStats() {
        const el = $('pz-stats');
        if (!el || !S.stats) return;
        el.innerHTML =
            `<div class="pz-statgrid">` +
            `<div class="pz-stat"><span class="pz-statn">${S.stats.solved}</span><span class="pz-statl">Solved</span></div>` +
            `<div class="pz-stat"><span class="pz-statn">${S.stats.streak}</span><span class="pz-statl">Streak</span></div>` +
            `<div class="pz-stat"><span class="pz-statn">${S.stats.bestStreak}</span><span class="pz-statl">Best</span></div>` +
            `<div class="pz-stat"><span class="pz-statn">${S.stats.attempted}</span><span class="pz-statl">Seen</span></div>` +
            `</div>`;
    }

    function setFeedback(msg, kind) {
        const el = $('pz-feedback');
        if (!el) return;
        el.textContent = msg;
        el.className = 'pz-feedback' + (kind ? ' ' + kind : '');
    }

    function setControlsEnabled(on) {
        document.querySelectorAll('#puzzles-screen .pz-controls button, #puzzles-screen .pz-controls select')
            .forEach(b => { b.disabled = !on; });
    }

    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function escapeAttr(s) { return escapeHtml(s); }

    /* ── Screen HTML (text-heavy by design: the board plus a lot of
          explanatory copy — how puzzles work, a theme glossary, rating
          bands, and tips — so the page reads like a mini-lesson). ──── */
    function ensureMarkup() {
        const root = $('puzzles-content');
        if (!root || root.dataset.pzBuilt) return;
        root.dataset.pzBuilt = '1';
        root.innerHTML = `
<div class="pz-layout">
  <div class="pz-main">
    <div class="pz-boardframe"><div class="pz-board" id="pz-board" role="group" aria-label="Puzzle chessboard"></div></div>
    <div class="pz-feedback" id="pz-feedback" role="status" aria-live="polite">Loading puzzle…</div>
    <div class="pz-controls">
      <button class="btn-secondary" id="pz-hint" type="button">Hint</button>
      <button class="btn-secondary" id="pz-skip" type="button">Skip</button>
      <button class="btn-secondary" id="pz-flip" type="button">Flip</button>
      <button class="btn-primary" id="pz-next" type="button">Next puzzle →</button>
    </div>
    <div class="pz-filterrow">
      <label class="pz-label" for="pz-band">Strength</label>
      <select id="pz-band" class="pz-select">${Object.keys(BANDS).map(k => `<option value="${k}">${BANDS[k].label}</option>`).join('')}</select>
      <label class="pz-label" for="pz-theme">Theme</label>
      <select id="pz-theme" class="pz-select">${THEME_OPTIONS.map(k => `<option value="${k}">${k === 'any' ? 'Any theme' : (THEME_WORDS[k] || k)}</option>`).join('')}</select>
    </div>
    <div class="pz-meta" id="pz-meta"></div>
    <div class="pz-solution" id="pz-solution" hidden></div>
  </div>

  <aside class="pz-side">
    <section class="pz-card">
      <h3>Your session</h3>
      <div class="pz-stats" id="pz-stats"></div>
    </section>

    <section class="pz-card pz-text">
      <h3>How puzzles work</h3>
      <p>Every puzzle is a real position from a played game where one side had a
      concrete opportunity — a forced mate, a tactic that wins material, or a
      precise defensive resource. You take over at the critical moment and find
      the best continuation. The position is shown <em>after</em> the opponent's
      setup move, so it is always your turn.</p>
      <ol class="pz-steps">
        <li><strong>Look at checks first.</strong> Every check forces a reply, so
        candidate moves that give check are easy to enumerate. Ask what each one
        achieves after the only legal answers.</li>
        <li><strong>Then captures and threats.</strong> A capture that also defends,
        or a move that creates an unstoppable threat (usually mate or winning the
        queen), is often the solution.</li>
        <li><strong>Count material after the line.</strong> Tactics work because the
        arithmetic works out. If a sacrifice is followed by recaptures, tally the
        final material before you play it.</li>
        <li><strong>Check your opponent's best reply.</strong> A puzzle is solved
        only against the best defence — a move that works only if the opponent
        blunders is not the answer.</li>
      </ol>
      <p>If you get it wrong the board will tell you and the position stays put —
      nothing is lost. Try a different candidate, or press <strong>Hint</strong> to
      highlight the key squares.</p>
    </section>

    <section class="pz-card pz-text">
      <h3>Theme glossary</h3>
      <dl class="pz-glossary">
        <dt>Fork</dt><dd>A single piece attacks two or more enemy pieces at once —
        most often a knight forking king and queen.</dd>
        <dt>Pin</dt><dd>A piece cannot move off the line of attack because a more
        valuable piece (or the king) stands behind it.</dd>
        <dt>Skewer</dt><dd>The mirror of a pin: the valuable piece moves first and
        the piece behind it is captured.</dd>
        <dt>Discovered attack</dt><dd>Moving one piece reveals an attack from
        another piece that was hiding behind it.</dd>
        <dt>Double check</dt><dd>Two pieces check the king at once. The only legal
        reply is a king move — which is why so many double checks start mating nets.</dd>
        <dt>Sacrifice</dt><dd>Giving up material deliberately to open lines, drag a
        piece to a bad square, or force a mating net. Count the material again
        after the forced replies.</dd>
        <dt>Back rank</dt><dd>The king is trapped on its own first/eighth rank by
        its own pawns, so a rook or queen on the open file delivers mate.</dd>
        <dt>Hanging piece</dt><dd>An undefended piece the opponent simply left
        attackable. The most common “free material” puzzle.</dd>
        <dt>Attraction</dt><dd>A sacrifice that drags an enemy piece (usually the
        king) to a square where it can be forked, pinned, or mated.</dd>
        <dt>Deflection</dt><dd>Moving a defender away from the square or file it
        needed to hold.</dd>
        <dt>Clearance</dt><dd>Moving your own piece off a square or line so a
        colleague can use it.</dd>
        <dt>Defensive move</dt><dd>Not every puzzle attacks — some ask for the one
        move that parries a threat and keeps the game level.</dd>
      </dl>
    </section>

    <section class="pz-card pz-text">
      <h3>Strength bands</h3>
      <p>Puzzles are tagged with the rating band of the player who actually faced
      the position. Use the <strong>Strength</strong> filter to train where you
      are:</p>
      <ul class="pz-bands">
        <li><strong>Beginner (&lt; 1000)</strong> — hanging pieces, one-move mates,
        simple forks.</li>
        <li><strong>Novice (1000–1399)</strong> — two-move combinations, back-rank
        mates, basic pins.</li>
        <li><strong>Intermediate (1400–1799)</strong> — multi-move tactics, quiet
        moves inside a combination, defensive resources.</li>
        <li><strong>Advanced (1800–2199)</strong> — long calculating lines,
        positional sacrifices, endgame technique.</li>
        <li><strong>Expert (2200+)</strong> — grandmaster-level subtlety; many of
        these come from top-level classical games.</li>
      </ul>
    </section>

    <section class="pz-card pz-text">
      <h3>Tips</h3>
      <ul class="pz-tips">
        <li>Solve out loud: say the candidate move and the opponent's best reply
        before you touch the mouse.</li>
        <li>Streaks reward clean solves — a wrong try resets the streak, so it pays
        to calculate one move deeper.</li>
        <li>Rotate themes. Twenty forks in a row feels productive but trains one
        pattern; alternating fork → mate → endgame builds a broader pattern
        library.</li>
        <li>After a miss, play the correct line out in your head once more before
        pressing <strong>Next</strong>. Spaced repetition of the correction is what
        sticks.</li>
        <li>Puzzles are training, not rating. A dropped streak means nothing —
        the patterns you rebuild are what you keep.</li>
      </ul>
      <p class="pz-credit">Puzzle data is provided by the community
      <a href="https://github.com/mauricioulloa/chess-puzzle-api" target="_blank" rel="noopener">chess-puzzle-api</a>
      (Lichess open data). Built-in fallback puzzles ship with DoChess for offline use.</p>
    </section>
  </aside>
</div>`;
    }

    /* ── Wiring ─────────────────────────────────────────────────────── */
    let bound = false;
    function bind() {
        if (bound) return;
        bound = true;
        const board = $('pz-board');
        if (board) board.addEventListener('click', (e) => {
            const sq = e.target.closest ? e.target.closest('[data-square]') : null;
            if (sq) onSquareClick(sq.dataset.square);
        });
        $('pz-hint')?.addEventListener('click', showHint);
        $('pz-skip')?.addEventListener('click', () => loadPuzzle());
        $('pz-flip')?.addEventListener('click', flipBoard);
        $('pz-next')?.addEventListener('click', () => loadPuzzle());
        $('pz-band')?.addEventListener('change', (e) => { S.band = e.target.value; loadPuzzle(); });
        $('pz-theme')?.addEventListener('change', (e) => { S.theme = e.target.value; loadPuzzle(); });
    }

    function open() {
        ensureMarkup();
        if (!S.stats) S.stats = loadStats();
        renderStats();
        bind();
        if (!S.chess) loadPuzzle();
        else { paintBoard(); renderMeta(); }
    }

    window.DoChessPuzzles = { open, version: '1.0.0', _state: () => S };
})();
