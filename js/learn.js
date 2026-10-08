/**
 * js/learn.js — Learn screen wiring for index.html (the one and only site).
 *
 * Hosts the free-move curriculum (data/lessons.json) inside the homepage:
 * picker (grouped by piece, stars from dochess:v1) + level view. The level
 * view reuses the LESSONS screen anatomy verbatim — .lesson-detail-header,
 * .lesson-content(1fr/400px), .arena (goal card / speech bubble / board /
 * action row / player card) and a .lesson-dashboard — so both screens feel
 * like one product. Learn-only additions: goal markers on the board, a move
 * log, and the result card with stars.
 *
 * Coexists with the legacy app.js router: showing Learn hides the legacy
 * screens and highlights the Learn nav; any legacy nav click hides Learn
 * again (capture-phase hook, app.js handlers still run untouched).
 */

import { createBoard } from './board.js';
import { createLevel } from './engine.js';
import { loadProgress, saveProgress } from './storage.js';
import { bootFocusMode, applyFocusMode } from './focus.js';

const $ = (id) => document.getElementById(id);

let DATA = null;
let store = loadProgress();
let sess = null;
let board = null;
let pendingPromo = null;

const lang = () => (store.state.settings && store.state.settings.lang) || 'en';
const T = (obj, fb = '') => (obj && (obj[lang()] || obj.en)) || fb;
const inLearn = () => $('learn-screen') && $('learn-screen').classList.contains('active');
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function showLearn() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const scr = $('learn-screen');
    if (!scr) return;
    scr.classList.add('active');
    // Re-apply focus mode: it is width-gated, and this may follow a resize.
    applyFocusMode();
    document.querySelectorAll('.nav-btn').forEach((b) => {
        const key = (b.dataset.nav || b.textContent.trim()).toLowerCase();
        b.classList.toggle('active', key.startsWith('learn'));
    });
    try { document.body.dataset.screen = 'learn-screen'; } catch (_) {}
    window.scrollTo(0, 0);
    try { scr.focus({ preventScroll: true }); } catch (_) {}
}

function hideLearn() {
    $('learn-screen')?.classList.remove('active');
}

/* ── Stars ───────────────────────────────────────────────────────────────
   Row of 3 glyphs with the earned ones wrapped in .on, so CSS can pop each
   one individually instead of flashing a whole string. */
/** 3 star slots: earned ones filled ★ + gold, unearned hollow ☆ and dimmed.
    Both glyphs always carry an explicit colour (never "inherit") so the row
    is legible on any background. */
const starRow = (n) =>
    Array.from({ length: 3 }, (_, i) =>
        `<span class="${i < n ? 'on' : 'off'}">${i < n ? '★' : '☆'}</span>`).join('');

function starsOf(id) { return store.state.stars[id] || 0; }

/** Star burst on the picker button that just gained stars. */
function popStars(btn) {
    if (!btn || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    btn.classList.add('just-scored');
    setTimeout(() => btn.classList.remove('just-scored'), 900);
}

function renderPicker() {
    const pk = $('picker');
    if (!pk || !DATA) return;
    const groups = [];
    for (const lv of DATA.levels) {
        let g = groups.find((x) => x.name === (lv.group || 'misc'));
        if (!g) { g = { name: lv.group || 'misc', items: [] }; groups.push(g); }
        g.items.push(lv);
    }
    pk.innerHTML = groups.map((g, gi) =>
        `<div class="picker-group"><h2>${gi + 1}. ${esc(g.name)}</h2><div class="picker-row">` +
        g.items.map((lv, i) => {
            const n = starsOf(lv.id);
            // Stagger entrance per card; pure transform+opacity.
            const delay = Math.min(360, (gi * 4 + i) * 26);
            const cta = n ? (n === 3 ? 'Play again' : 'Improve') : 'Start';
            // Same three-part anatomy as a lesson card: header (title+meta),
            // body (the goal), footer (one CTA).
            return `<div class="lesson-card lvl-card${n ? ' solved' : ''}" style="animation-delay:${delay}ms">
                <div class="lesson-header">
                    <h3>${i + 1}. ${esc(T(lv.title))}</h3>
                    <div class="lesson-meta">
                        <span class="stars" aria-label="${n} of 3 stars">${starRow(n)}</span>
                        <span class="lvl-par">par ${lv.par}</span>
                    </div>
                </div>
                <div class="lesson-body"><p>${esc(T(lv.goalText))}</p></div>
                <div class="lesson-footer">
                    <button class="btn-primary lvl-open" data-lv="${esc(lv.id)}" type="button">${cta}</button>
                </div>
            </div>`;
        }).join('') + `</div></div>`
    ).join('');
    pk.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => openLevel(b.dataset.lv)));
}

function openLevel(id) {
    const lv = DATA.levels.find((l) => l.id === id);
    if (!lv) return;
    history.replaceState(null, '', 'index.html?level=' + id);
    showLearn();
    $('learn-heading').hidden = true;
    $('levelview').hidden = false;
    $('picker').hidden = true;

    // ── header (same slots as the Lessons screen header) ──
    const idx = DATA.levels.findIndex((l) => l.id === id);
    $('lv-num').textContent = String(idx + 1);
    $('lv-title').textContent = T(lv.title);
    $('lv-goal').textContent = T(lv.goalText);
    $('lv-group').textContent = lv.group || 'stage';
    $('lv-stars').innerHTML = starRow(starsOf(id));
    $('lv-explain').textContent = T(lv.explain);
    $('lv-brief').textContent = T(lv.goalText);
    $('par').textContent = lv.par;
    // Opening state of the achievement strip: stars already banked here.
    showAchievement(starsOf(id), '', '', false);

    // ── goal card: name the concrete objective + a pip per goal square ──
    const g = lv.goal || {};
    const pips = [];
    (g.collect || []).forEach((s) => pips.push({ sq: s, kind: '' }));
    (g.capture || []).forEach((s) => pips.push({ sq: s, kind: 'target' }));
    if (g.reach) pips.push({ sq: g.reach.square, kind: 'target' });
    $('lv-opp-name').textContent = g.reach && !g.collect && !g.capture
        ? `Reach ${g.reach.square}`
        : (g.capture && g.capture.length ? `Capture ${g.capture.join(', ')}` : `Visit ${(g.collect || []).join(', ')}`);
    $('lv-opp-sub').textContent = `${(lv.themes || []).join(' · ')}`;
    $('lv-goal-track').innerHTML = pips.map((x) => `<span class="pip ${x.kind}" data-sq="${x.sq}"></span>`).join('');

    $('result').hidden = true;
    $('result').classList.remove('show');
    $('solve-text').textContent = '';
    $('hint-text').textContent = '';
    // Speech bubble = the coach's voice (level intro). Feedback strip = status.
    say(lv.intro ? T(lv.intro) : (T(lv.goalText) || 'Pick your piece to begin.'));
    feedback('info', 'Pick your piece to begin.');

    sess = createLevel(lv, window.Chess, lang());
    pendingPromo = null;
    $('promo-row').hidden = true;
    logMoves = [];
    renderLog();
    buildCapturedTray();
    if (!board) {
        // Same image cache-buster as the Lessons board, so the 12 piece SVGs
        // app.js already decoded at boot are reused instead of re-fetched.
        const prefix = (window.app && typeof window.app._pieceFile === 'function' && window.app.constructor.assetV)
            ? window.app.constructor.assetV() : 'v24';
        board = createBoard($('play-board'), { onAction: onSquare, prefix });
    }
    paint();
    updateNextBtn();
    // Forced: on a freshly opened level the board does not hold focus yet, so
    // the first Tab must land on the piece the level expects.
    board.focusSquare(firstOwnSquare(), true);
}

function showPickerHome() {
    history.replaceState(null, '', 'index.html');
    showLearn();
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    renderPicker();
}

function firstOwnSquare() {
    const pieces = sess.pieces();
    const sqs = Object.keys(pieces).filter((s) => pieces[s].color === sess.state.player);
    const allow = new Set((sess.state.level.movePieces || []).map((s) => s.toLowerCase()));
    return sqs.find((s) => !allow.size || allow.has(pieces[s].type)) || sqs[0] || 'e2';
}

function say(msg) {
    const el = $('fb-text');
    if (el) el.textContent = msg;
}
/** Coloured status line under the board (mirrors .feedback in Lessons). */
function feedback(kind, msg) {
    const el = $('lv-feedback');
    if (!el) return;
    el.className = 'feedback ' + kind;
    el.textContent = msg;
}

/* Achievement strip above the board. Before solving it shows the stars
   already banked for this level (your "how brave" record); after solving it
   shows the stars just earned plus the score line and the coach's praise. */
function showAchievement(stars, score, praise, scored) {
    const bar = $('lv-achieve');
    const starWrap = $('lv-achieve-stars');
    const text = $('lv-achieve-text');
    if (!bar || !starWrap || !text) return;
    starWrap.innerHTML = starRow(stars);
    [...starWrap.children].forEach((c, i) => {
        if (c.classList.contains('on')) c.style.animationDelay = `${i * 120}ms`;
    });
    text.textContent = '';
    if (score) {
        // Highlight just the points, the way a score should read.
        const m = score.match(/\d+ pts/);
        if (m) {
            text.appendChild(document.createTextNode(score.slice(0, m.index)));
            const pts = document.createElement('span');
            pts.className = 'pts';
            pts.textContent = m[0];
            text.appendChild(pts);
            text.appendChild(document.createTextNode(score.slice(m.index + m[0].length)));
        } else {
            text.textContent = score;
        }
    }
    if (praise) {
        const em = document.createElement('em');
        em.textContent = ` — ${praise}`;
        text.appendChild(em);
    }
    bar.classList.toggle('scored', !!scored);
}

/* ── sound: reuse the site's SoundEngine (same clip + mute key cc_mute) ── */
function sound() { return (typeof window !== 'undefined' && window.app && window.app.snd) ? window.app.snd : null; }

function playLevelSound(captured, success) {
    const s = sound();
    if (s) {
        if (success && typeof s.playSuccess === 'function') s.playSuccess();
        else if (captured && typeof s.playCapture === 'function') s.playCapture();
        else if (typeof s.playMove === 'function') s.playMove();
        return;
    }
    // Fallback for pages without app.js: play the clip ourselves, honoring mute.
    try {
        if (localStorage.getItem('cc_mute') === '1') return;
        const a = new Audio('assets/sounds/move.mp3?v=1');
        a.play().catch(() => {});
    } catch (_) { /* audio unavailable */ }
}

/* ── next-level navigation (action row button + result button + N key) ── */
function currentIndex() {
    if (!DATA || !sess) return -1;
    return DATA.levels.findIndex((l) => l.id === sess.state.level.id);
}

function nextLevel() {
    const i = currentIndex();
    if (i >= 0 && i + 1 < DATA.levels.length) openLevel(DATA.levels[i + 1].id);
}

function updateNextBtn() {
    const btn = $('next-lvl-btn');
    if (!btn) return;
    const i = currentIndex();
    const last = i < 0 || i + 1 >= DATA.levels.length;
    btn.disabled = last;
    const nxt = last ? null : DATA.levels[i + 1];
    btn.textContent = last ? 'All levels cleared' : 'Next stage →';
    btn.title = nxt ? `${T(nxt.title)} (N)` : '';
    // Mirror the state onto the sticky bar button (phones) and label it.
    const sbtn = $('lv-sticky-next');
    if (sbtn) {
        sbtn.disabled = last;
        sbtn.textContent = last ? 'Cleared' : 'Next →';
        sbtn.title = btn.title;
    }
    // The bar sits above the board, so it must say WHAT the next level is.
    // "Next →" alone gives the player nothing to decide with.
    const label = $('lv-sticky-label');
    if (label && i >= 0) {
        const g = (sess.state.level.group || 'stage');
        label.textContent = nxt ? `Next · ${T(nxt.title)}` : `Level ${i + 1} · ${g}`;
        label.title = nxt ? `${T(nxt.title)} (N)` : '';
    }
}

function collectRemaining() {
    const g = (sess.state.level.goal && sess.state.level.goal.collect) || [];
    return g.filter((s) => !sess.state.collected.has(s));
}
function captureRemaining() {
    const g = (sess.state.level.goal && sess.state.level.goal.capture) || [];
    return g.filter((s) => !sess.state.captured.has(s));
}

/** Light up the goal pips + progress counters from live session state.
    The goal card counts GOALS collected; the player card counts MOVES against
    par. Keeping the two numbers on their own card avoids reading the same
    "0 / 3" twice on one screen. */
function syncGoalUI() {
    const s = sess.state;
    const track = $('lv-goal-track');
    let doneCount = 0;
    if (track) {
        track.querySelectorAll('.pip').forEach((p) => {
            const sq = p.dataset.sq;
            const done = p.classList.contains('target')
                ? s.captured.has(sq) || (s.level.goal && s.level.goal.reach && s.level.goal.reach.square === sq)
                : s.collected.has(sq);
            p.classList.toggle('done', !!done);
            if (done) doneCount++;
        });
    }
    const total = track ? track.children.length : 0;
    const prog = $('lv-opp-turn');
    if (prog) prog.textContent = `${doneCount} / ${total}`;
    $('lv-you-sub').textContent = `${s.player === 'b' ? 'Black' : 'White'} · move ${s.moves}`;
    $('mv').textContent = s.moves;
    // Mirror the counter into the sticky bar so phones always show it.
    $('lv-sticky-mv').textContent = s.moves;
    $('lv-sticky-par').textContent = s.level.par;
}

/* Move log. Append-only on a normal move (one row per move); a full rebuild
   happens only when the list shrinks (undo / restart), because re-serialising
   every row on each move showed up as the single most expensive thing in the
   click handler under CPU throttling. */
let logMoves = [];
const EMPTY_LOG = '<span style="color:var(--text-muted-dim)">No moves yet — select a white piece to begin.</span>';

/* Keep the newest row visible WITHOUT forcing a synchronous layout. Reading
   scrollHeight and writing scrollTop both flush layout, which — inside a click
   handler — was the single most expensive thing left in the move path. Do it
   after paint instead, and only when the list actually overflows. */
function autoscrollLog() {
    const el = $('lv-log');
    if (!el) return;
    const run = () => {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
}

function renderLog() {
    const el = $('lv-log');
    if (!el) return;
    if (!logMoves.length) {
        if (el.innerHTML !== EMPTY_LOG) el.innerHTML = EMPTY_LOG;
        return;
    }
    el.innerHTML = '';
    const frag = document.createDocumentFragment();
    logMoves.forEach((label, i) => frag.appendChild(logRow(label, i + 1)));
    el.appendChild(frag);
    autoscrollLog();
}

/** One "n. e2-e4" row. Built with createElement + textContent rather than
    innerHTML: parsing a markup string was the most expensive thing left in
    the click handler under CPU throttling. */
function logRow(label, n) {
    const row = document.createElement('div');
    row.className = 'move-pair';
    const num = document.createElement('span');
    num.className = 'move-num';
    num.textContent = `${n}.`;
    const mv = document.createElement('span');
    mv.className = 'move-item';
    mv.textContent = label;
    row.appendChild(num);
    row.appendChild(mv);
    return row;
}

/** Append a single row without touching the rest of the list. */
function appendLogRow(label, n) {
    const el = $('lv-log');
    if (!el) return;
    if (!logMoves.length) el.innerHTML = '';
    el.appendChild(logRow(label, n));
    autoscrollLog();
}

function pushLog(from, to, res) {
    const cap = res && res.captured ? 'x' : '-';
    const suf = res && res.promotion ? '=' + String(res.promotion).toUpperCase() : '';
    const label = `${from}${cap}${to}${suf}`;
    logMoves.push(label);
    appendLogRow(label, logMoves.length);
}

/* ── Captured-material tray (same visual language as the Lessons screen) ─
   Built ONCE per level: each goal capture square shows the piece that stood
   there (real artwork, not a placeholder pawn) plus its square name, and the
   item gets a "taken" treatment the moment it is captured. Nothing is
   re-serialised per move. */
const PIECE_FILE = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', k: 'king' };

function buildCapturedTray() {
    const el = $('lv-caps');
    if (!el) return;
    const targets = ((sess.state.level.goal && sess.state.level.goal.capture) || []);
    el.innerHTML = '';
    if (!targets.length) return;
    const pieces = sess.pieces();
    const frag = document.createDocumentFragment();
    for (const sq of targets) {
        const p = pieces[sq];
        const item = document.createElement('span');
        item.className = 'cap-item';
        item.dataset.capSq = sq;
        if (p && PIECE_FILE[p.type]) {
            const img = document.createElement('img');
            img.src = `assets/pieces/${p.color === 'w' ? 'white' : 'black'}-${PIECE_FILE[p.type]}.svg?v24`;
            img.width = 20; img.height = 20;
            img.alt = `${p.color === 'w' ? 'White' : 'Black'} ${p.type} on ${sq}`;
            item.appendChild(img);
        } else {
            const dot = document.createElement('span');
            dot.className = 'cap-unknown';
            dot.title = `Piece captured on ${sq}`;
            item.appendChild(dot);
        }
        const tag = document.createElement('em');
        tag.textContent = sq;
        item.appendChild(tag);
        frag.appendChild(item);
    }
    el.appendChild(frag);
}

function syncCapturedTray() {
    const el = $('lv-caps');
    if (!el || !el.children.length) return;
    const captured = sess.state.captured;
    el.querySelectorAll('.cap-item').forEach((item) => {
        const sq = item.dataset.capSq;
        item.classList.toggle('taken', captured.has(sq) || !sess.pieces()[sq]);
    });
}

function paint() {
    if (!sess || !board) return;
    const s = sess.state;
    const pieces = sess.pieces();
    const sel = s.selected;
    const legal = sel ? sess.legalFor(sel) : [];
    board.render({
        pieces,
        selected: sel,
        legalTos: new Set(legal.map((m) => m.to)),
        captureTos: new Set(legal.filter((m) => m.captured).map((m) => m.to)),
        lastFrom: s.lastMove ? s.lastMove.from : null,
        lastTo: s.lastMove ? s.lastMove.to : null,
        checkSq: sess.inCheck() ? sess.kingSquare() : null,
        stars: new Set(collectRemaining()),
        targets: new Set(captureRemaining()),
        obstacles: new Set(s.level.obstacles || []),
        reachSq: (s.level.goal && s.level.goal.reach && s.level.goal.reach.square) || null,
        rover: sel || s.rover || firstOwnSquare(),
    });
    syncGoalUI();
    syncCapturedTray();
}

function onSquare(sq) {
    if (!sess || sess.state.done) return;
    const s = sess.state;
    // Promotion picker is modal, but never a dead end: tapping anywhere
    // else (or Esc) cancels it instead of swallowing every future click.
    // Cancelling drops the stale selection too, so engine state and the
    // board always agree — otherwise the old piece stays "selected" with no
    // legal dots drawn and the next click lands on a half-finished selection.
    if (pendingPromo) {
        if (sq === pendingPromo.to) return; // stay pending; picker is open
        pendingPromo = null;
        $('promo-row').hidden = true;
        s.selected = null;
        say('');
        feedback('info', 'Promotion cancelled — pick your piece again.');
        paint();
        if (sess.pieces()[sq]) return onSquare(sq); // the tap that cancelled can also select
        return;
    }
    if (!s.selected) {
        const p = sess.pieces()[sq];
        if (!p) return;
        s.selected = sq;
        s.rover = sq;
        if (!sess.legalFor(sq).length) {
            const msg = T(s.level.failHint) || 'That piece has no moves here.';
            say(msg);
            feedback('error', msg);
            s.selected = null;
            paint();
            return;
        }
        paint();
        return;
    }
    if (sq === s.selected) { s.selected = null; paint(); return; }
    if (!sess.legalFor(s.selected).some((m) => m.to === sq)) {
        const p = sess.pieces()[sq];
        const allow = new Set((s.level.movePieces || []).map((x) => x.toLowerCase()));
        if (p && (!allow.size || allow.has(p.type))) { s.selected = sq; s.rover = sq; paint(); return; }
        const msg = T(s.level.failHint) || 'Not a legal move for that piece.';
        say(msg);
        feedback('error', msg);
        s.selected = null;
        paint();
        return;
    }
    const from = s.selected;
    if (sess.needsPromotion(from, sq)) {
        pendingPromo = { from, to: sq };
        $('promo-row').hidden = false;
        say('Choose your promotion piece.');
        feedback('info', 'Choose your promotion piece — or tap the square again to cancel.');
        return;
    }
    doMove(from, sq, null);
}

function doMove(from, to, promo) {
    const before = sess.state;
    const starsBefore = collectRemaining().length + captureRemaining().length;
    const r = sess.play(from, to, promo);
    pendingPromo = null;
    $('promo-row').hidden = true;
    if (!r.ok) {
        const msg = r.reason === 'illegal' ? (T(sess.state.level.failHint) || 'Not a legal move.') : 'Hmm.';
        say(msg);
        feedback('error', msg);
        return;
    }
    pushLog(from, to, r.move);
    sess.state.lastMove = { from, to };
    sess.state.rover = to;
    const captured = !!(r.move && r.move.captured);
    paint();

    // Goal feedback: celebrate whatever the move just scored.
    const starsAfter = collectRemaining().length + captureRemaining().length;
    if (starsAfter < starsBefore) {
        board.burst(to, collectedNow(to) ? 'star' : 'target');
    } else if (captured) {
        board.burst(to, 'target');
    }

    if (r.done) {
        showResult(r.result);
        playLevelSound(captured, true);
        say(T(sess.state.level.success));
        feedback('success', `${sess.state.moves} move(s) — solved!`);
    } else {
        // Speech bubble stays as the coach's voice; only the status strip moves.
        if (starsAfter < starsBefore) say(T(sess.state.level.success) || 'Nicely done.');
        board.focusSquare(to);
        playLevelSound(captured, false);
        feedback('info', starsAfter === 0 ? 'Goal reached — one more move to finish.' : 'Keep going — follow the stars.');
    }
}
function collectedNow(sq) { return sess.state.collected.has(sq); }

function showResult(res) {
    const s = sess.state;
    const id = s.level.id;
    const gained = res.stars > (store.state.stars[id] || 0);
    if (gained) {
        store.state.stars[id] = res.stars;
        saveProgress(store.state, store.backend);
    }
    const starsEl = $('r-stars');
    starsEl.innerHTML = starRow(res.stars);
    // Staggered pop so the stars land one after another (0/120/240ms).
    [...starsEl.children].forEach((c, i) => {
        if (c.classList.contains('on')) c.style.animationDelay = `${i * 120}ms`;
    });
    const scoreLine = `${res.moves} moves · par ${res.par} · ${res.points} pts` +
        (res.hintsUsed ? ` · ${res.hintsUsed} hint(s)` : '');
    const praise = T(s.level.success);
    $('r-text').textContent = `${scoreLine} — ${praise}`;
    // Same result above the board: on a phone the result card sits far below
    // the fold, so the stars + score must also live directly above the board.
    showAchievement(res.stars, scoreLine, praise, true);
    $('result').hidden = false;
    $('result').classList.add('show');
    // Navigation is bound once in bootLearn; only the enabled state is per-level.
    const idx = DATA.levels.findIndex((l) => l.id === id);
    const btn = $('next-btn');
    if (btn) btn.disabled = idx < 0 || idx + 1 >= DATA.levels.length;
    if (gained) popStars(document.querySelector(`[data-lv="${id}"]`));
}

function bind(id, fn) {
    const el = $(id);
    if (el && !el.dataset.learnBound) { el.dataset.learnBound = '1'; el.addEventListener('click', fn); }
}

/** Level restart: clears every piece of transient level state, incl. the
    promotion picker — a stuck picker used to freeze the board for good. */
function restartLevel(msg) {
    if (!sess) return;
    sess.restart();
    pendingPromo = null;
    $('promo-row').hidden = true;
    $('result').hidden = true;
    $('result').classList.remove('show');
    $('solve-text').textContent = '';
    logMoves = [];
    renderLog();
    say(msg || 'Fresh board — go!');
    feedback('info', msg || 'Fresh board — go!');
    paint();
    board.focusSquare(firstOwnSquare());
}

export async function bootLearn() {
    bootFocusMode();
    bind('nav-learn', () => {
        const id = new URLSearchParams(location.search).get('level');
        if (id && DATA && DATA.levels.some((l) => l.id === id)) openLevel(id);
        else showPickerHome();
    });
    bind('start-levels-btn', () => showPickerHome());
    bind('back-btn', showPickerHome);
    bind('next-lvl-btn', nextLevel);
    bind('next-btn', nextLevel);
    // Sticky-bar twins: same handlers, always reachable on a phone.
    bind('lv-sticky-next', nextLevel);
    bind('lv-sticky-undo', () => $('undo-btn').click());
    bind('lv-sticky-restart', () => $('restart-btn').click());
    bind('lv-sticky-back', () => $('back-btn').click());
    bind('lv-sticky-hint', () => $('hint-btn').click());
    bind('lv-sticky-solve', () => $('solve-btn').click());
    bind('retry-btn', () => restartLevel('Fresh board — go!'));
    bind('undo-btn', () => {
        if (!sess) return;
        // Undoing out of a pending promotion must drop the picker too.
        pendingPromo = null;
        $('promo-row').hidden = true;
        if (sess.undo()) {
            logMoves.pop();
            renderLog();
            say('Undone.');
            feedback('info', 'Undone.');
            paint();
        }
    });
    bind('restart-btn', () => restartLevel('Fresh board — go!'));
    bind('hint-btn', () => {
        if (!sess) return;
        const h = sess.hint();
        const msg = h || 'No more hints — the Solution button shows the shortest road.';
        $('hint-text').textContent = msg;
        feedback('info', msg);
    });
    bind('solve-btn', () => {
        if (!sess) return;
        const r = sess.solution();
        const msg = r.reachable
            ? `Shortest (${r.par}): ${r.lines[0].join(' ')}${r.lines[1] ? '  |  ' + r.lines[1].join(' ') : ''}`
            : 'No solution found?! ' + (r.failReason || '');
        $('solve-text').textContent = msg;
        feedback('info', msg);
    });
    const promoRow = $('promo-row');
    if (promoRow && !promoRow.dataset.learnBound) {
        promoRow.dataset.learnBound = '1';
        promoRow.addEventListener('click', (e) => {
            const b = e.target.closest('[data-promo]');
            if (!b || !pendingPromo) return;
            const { from, to } = pendingPromo;
            doMove(from, to, b.dataset.promo);
        });
    }
    document.addEventListener('keydown', (e) => {
        if (!sess || !inLearn() || $('levelview').hidden) return;
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        const k = e.key.toLowerCase();
        if (k === 'escape' && pendingPromo) {
            pendingPromo = null;
            $('promo-row').hidden = true;
            sess.state.selected = null;
            say('');
            feedback('info', 'Promotion cancelled — pick your piece again.');
            paint();
            return;
        }
        if (k === 'u') { if (sess.undo()) { pendingPromo = null; $('promo-row').hidden = true; logMoves.pop(); renderLog(); say('Undone.'); paint(); } }
        else if (k === 'r') { restartLevel('Fresh board — go!'); }
        else if (k === 'h') { $('hint-btn').click(); }
        else if (k === 'n') { nextLevel(); }
    });
    // Legacy nav clicks hide Learn (app.js handlers still run untouched).
    document.querySelectorAll('.nav-btn').forEach((b) => {
        if ((b.dataset.nav || '') === 'learn' || b.id === 'nav-learn') return;
        b.addEventListener('click', () => hideLearn());
    });

    try {
        // Bundle first: js/learn.bundle.js inlines the curriculum, so levels
        // load from file:// and behind the meta-CSP with no fetch at all.
        if (globalThis.__DOCHESS_LESSONS__) {
            DATA = globalThis.__DOCHESS_LESSONS__;
        } else {
            const res = await fetch('data/lessons.json');
            if (!res.ok) throw new Error('http ' + res.status);
            DATA = await res.json();
        }
        if (!DATA || !Array.isArray(DATA.levels) || !DATA.levels.length) {
            throw new Error('curriculum has no levels[]');
        }
    } catch (e) {
        const pk = $('picker');
        if (pk) {
            pk.innerHTML = `<div class="panel"><h2>Couldn't load levels</h2>` +
                `<p>${String((e && e.message) || e)}</p>` +
                `<p>Rebuild the bundle: <code>node tools/build-learn.mjs</code></p></div>`;
        }
        console.error('[DoChess] levels failed to load:', e);
        return;
    }
    const id = new URLSearchParams(location.search).get('level');
    if (id && DATA.levels.some((l) => l.id === id)) { logMoves = []; renderLog(); openLevel(id); }
    // play.html redirects here as index.html?level=x#learn — honor the marker
    // so the redirect actually lands on the picker instead of Home.
    else if (location.hash === '#learn') showPickerHome();
}