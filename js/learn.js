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
import { loadProgress, saveProgress, addXp, touchDay } from './storage.js';
import { bootFocusMode, applyFocusMode } from './focus.js';

const $ = (id) => document.getElementById(id);

let DATA = null;
let store = loadProgress();
let sess = null;
let board = null;
let pendingPromo = null;
// View router: 'home' (stages + sets) → 'set' (lesson rows) → 'level'.
let view = 'home';
let currentSetId = null;

const lang = () => (store.state.settings && store.state.settings.lang) || 'en';
const T = (obj, fb = '') => (obj && (obj[lang()] || obj.en)) || fb;
const inLearn = () => $('learn-screen') && $('learn-screen').classList.contains('active');
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* ── curriculum index (sets, progress, states) ─────────────────────────
   Planned lessons are locked "Coming soon" skeletons — excluded from every
   progress total so percentages stay honest. */
const playableLevels = () => (DATA ? DATA.levels.filter((l) => !l.planned) : []);
const levelsOfSet = (setId) => (DATA ? DATA.levels.filter((l) => l.set === setId) : []);
const setById = (setId) => (DATA ? DATA.sets.find((s) => s.id === setId) : null);

function starsOf(id) { return (store.state.stars && store.state.stars[id]) || 0; }

/** 'planned' | 'done' | 'progress' | 'new' */
function stateOf(lv) {
    if (lv.planned) return 'planned';
    if (starsOf(lv.id)) return 'done';
    if (store.state.attempts && store.state.attempts[lv.id]) return 'progress';
    return 'new';
}

function setStats(setId) {
    const lvs = levelsOfSet(setId).filter((l) => !l.planned);
    const done = lvs.filter((l) => starsOf(l.id)).length;
    return { total: lvs.length, done };
}

function overallStats() {
    const lvs = playableLevels();
    const done = lvs.filter((l) => starsOf(l.id)).length;
    return { total: lvs.length, done };
}

/** First unsolved playable level — the Continue CTA target. */
function firstUnsolved() {
    return playableLevels().find((l) => !starsOf(l.id)) || null;
}

const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const diffChip = (d) => {
    const n = d === 2 ? 2 : d === 3 ? 3 : 1;
    return `<span class="diff-chip d${n}">${DIFF_LABEL[n]}</span>`;
};

/* Set icons: one visual system per STAGE.
   Stage 1 shows real piece artwork on a checker chip (so white pieces stay
   legible). Stages 2+ use bold monochrome line icons — no emoji, works
   offline. Each stage owns an accent so the grid reads as six chapters. */
const SET_PIECE = { rook: 'r', bishop: 'b', queen: 'q', king: 'k', knight: 'n', pawn: 'p' };
const STAGE_ACCENT = {
    1: '#fbbf24', // gold — the pieces themselves
    2: '#38bdf8', // sky — the special rules
    3: '#fb7185', // rose — check & mate
    4: '#a78bfa', // violet — attack & defence
    5: '#34d399', // emerald — the endgame
    6: '#f97316'  // orange — mastery
};
const ICON_SVG = {
    castle: '<path d="M4.5 20.5h15M6.5 20.5v-8.2l1.6-1.6V6.2h2.2v2.6h3.4V6.2h2.2v4.5l1.6 1.6v8.2M10 20.5v-4.2h4v4.2"/><path d="M15.2 4.4l2.1 2.1-2.1 2.1"/>',
    ep: '<path d="M7.5 20.5h9M9.2 17.2h5.6l-1-3.4a2.9 2.9 0 10-3.6 0z"/><path d="M12 3.2v3.4M10.2 4.8L12 3l1.8 1.8"/><path d="M17.6 12.4l3 3-3 3"/>',
    crown: '<path d="M3.6 8.6l4.2 3.6L12 4.6l4.2 7.6 4.2-3.6-1.6 10.3H5.2z"/><path d="M5.2 21.6h13.6"/><path d="M9.6 15.4h4.8"/>',
    target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><path d="M12 1.6v2.4M12 20v2.4M1.6 12H4M20 12h2.4"/>',
    mated: '<path d="M8.4 20.4h7.2"/><path d="M12 4.2l1.5 3.3 3.6.5-2.6 2.5.6 3.6-3.1-1.7-3.1 1.7.6-3.6-2.6-2.5 3.6-.5z"/><path d="M16.8 16.4l3.6 3.6M20.4 16.4l-3.6 3.6"/>',
    flag: '<path d="M6 21.4V3.2"/><path d="M6 4.4h11.4l-2.4 4 2.4 4H6"/><path d="M10 15.4h7.4l-2 3.4 2 3.4H10"/>',
    swords: '<path d="M3.4 3.4l8.6 8.6M20.6 3.4L12 12"/><path d="M14.2 12.8l2.6-2.6M9.8 12.8L7.2 10.2"/><path d="M4.2 19.8l3.4-3.4M19.8 19.8l-3.4-3.4"/><circle cx="12" cy="14.6" r="1.2" fill="currentColor" stroke="none"/>',
    shield: '<path d="M12 2.8l8 3v6.1c0 4.9-3.4 8.4-8 9.9-4.6-1.5-8-5-8-9.9V5.8z"/><path d="M8.6 12.2l2.6 2.6 4.2-4.6"/>',
    sunrise: '<path d="M3.2 19.4h17.6"/><path d="M6.2 15.6a5.8 5.8 0 1111.6 0"/><path d="M12 3.4v3.2M4.6 7.4l1.9 1.9M19.4 7.4l-1.9 1.9M2.4 12.4h2.4M19.2 12.4h2.4"/>'
};
function setIconHtml(set) {
    // PIECE_FILE (letter → artwork name) is defined once below with the
    // captured-material tray; stage-1 set icons are piece words ('rook'…).
    const letter = SET_PIECE[set.icon];
    if (letter) {
        const pieceChar = letter.toUpperCase();
        const src = (window.DoChessPieces && window.DoChessPieces.url(pieceChar, 'v24')) ||
            `assets/pieces/pieces-second/white-${PIECE_FILE[letter]}.svg?v24`;
        return `<img src="${src}" alt="" width="34" height="34" data-fallback-piece="${pieceChar}" draggable="false">`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_SVG[set.icon] || ICON_SVG.target}</svg>`;
}
function stageAccent(stage) { return STAGE_ACCENT[stage] || STAGE_ACCENT[1]; }

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
    // Leaving Learn must not leave ?level=/?set= in the address bar —
    // otherwise Home/Lessons keep a stale deep link.
    clearLearnUrl();
    // Reset to the home view WITHOUT re-showing: showLearn() re-adds .active
    // — stacking Learn under every legacy screen navigated to mid-level.
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    view = 'home';
    currentSetId = null;
    renderHome();
}

/** Keep shareable deep links while a set/level is open; strip them on home. */
function setLearnUrl({ level = null, set = null } = {}) {
    const url = new URL(location.href);
    if (level) url.searchParams.set('level', level);
    else url.searchParams.delete('level');
    if (set) url.searchParams.set('set', set);
    else url.searchParams.delete('set');
    history.replaceState(null, '', url.pathname + url.search);
}

function clearLearnUrl() {
    const p = new URLSearchParams(location.search);
    if (!p.get('level') && !p.get('set')) return;
    setLearnUrl();
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

/** Star burst on the picker button that just gained stars. */
function popStars(btn) {
    if (!btn || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    btn.classList.add('just-scored');
    setTimeout(() => btn.classList.remove('just-scored'), 900);
}

/* ── Home view: overall progress + stage sections of set cards ────────── */
function renderHome() {
    const pk = $('picker');
    if (!pk || !DATA) return;
    view = 'home';
    currentSetId = null;
    const { total, done } = overallStats();
    const pct = total ? Math.round((done / total) * 100) : 0;
    const next = firstUnsolved();
    const nextSet = next ? setById(next.set) : null;
    const ctaLabel = next
        ? (done === 0 ? 'Start learning' : `Continue · ${T(next.title)}`)
        : 'All lessons cleared!';
    let html = `<div class="learn-home">
        <div class="learn-progress-panel">
            <div class="lp-num">${done}/${total}</div>
            <div class="lp-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Course progress">
                <div class="lp-fill" style="width:${pct}%"></div>
            </div>
            <div class="lp-sub">${pct}% cleared${nextSet ? ` · next: ${esc(T(nextSet.title))}` : ''}</div>
            <button class="btn-cta" id="continue-btn" type="button"${next ? '' : ' disabled'}>${esc(ctaLabel)}</button>
        </div>`;
    let gi = 0;
    for (const stage of DATA.stages) {
        const sets = DATA.sets.filter((s) => s.stage === stage.n);
        if (!sets.length) continue;
        html += `<section class="stage-block" aria-labelledby="stage-h-${stage.n}">
            <div class="stage-head">
                <span class="stage-n">Stage ${stage.n}</span>
                <h3 id="stage-h-${stage.n}">${esc(T(stage.title))}</h3>
                <p>${esc(T(stage.desc))}</p>
            </div>
            <div class="set-grid">`;
        sets.forEach((set, si) => {
            const st = setStats(set.id);
            const spct = st.total ? Math.round((st.done / st.total) * 100) : 0;
            const delay = Math.min(300, (gi * 3 + si) * 24);
            const locked = st.total === 0;
            html += `<div class="set-card${locked ? ' locked' : ''}" data-set="${esc(set.id)}" role="button" tabindex="0"
                        style="animation-delay:${delay}ms" aria-label="${esc(T(set.title))}: ${st.done} of ${st.total} done">
                    <div class="set-icon-wrap" data-stage="${set.stage}" aria-hidden="true">${setIconHtml(set)}</div>
                    <div class="set-info">
                        <h3>${esc(T(set.title))}</h3>
                        <p>${esc(T(set.desc))}</p>
                        <div class="set-progress">
                            <div class="sp-bar"><div class="sp-fill" style="width:${spct}%"></div></div>
                            <span class="sp-num">${st.done}/${st.total}${locked ? ' · soon' : ''}</span>
                        </div>
                    </div>
                    <button class="btn-secondary set-open" type="button" data-set-open="${esc(set.id)}"${locked ? ' disabled' : ''}>${st.done ? 'Review' : (locked ? 'Soon' : 'Open')}</button>
                </div>`;
        });
        html += `</div></section>`;
        gi++;
    }
    html += `</div>`;
    pk.innerHTML = html;
    pk.querySelectorAll('[data-set]').forEach((card) => {
        const open = () => { if (!card.classList.contains('locked')) openSet(card.dataset.set); };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    });
    const cta = $('continue-btn');
    if (cta && next) cta.addEventListener('click', () => openLevel(next.id));
}

/* ── Set view: one row per lesson (number, title, goal, difficulty, stars) ─ */
function renderSetView(setId) {
    const pk = $('picker');
    const set = setById(setId);
    if (!pk || !DATA || !set) { renderHome(); return; }
    view = 'set';
    currentSetId = setId;
    const st = setStats(setId);
    const spct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    const lvs = levelsOfSet(setId);
    let html = `<div class="set-view">
        <button class="btn-secondary" id="set-back" type="button">← All stages</button>
        <div class="set-hero">
            <div class="set-icon-wrap big" data-stage="${set.stage}" aria-hidden="true">${setIconHtml(set)}</div>
            <div class="set-info">
                <span class="stage-n">Stage ${set.stage}</span>
                <h3>${esc(T(set.title))}</h3>
                <p>${esc(T(set.desc))}</p>
                <div class="set-progress">
                    <div class="sp-bar"><div class="sp-fill" style="width:${spct}%"></div></div>
                    <span class="sp-num">${st.done}/${st.total} cleared</span>
                </div>
            </div>
        </div>
        <ol class="lesson-rows">`;
    let n = 0;
    for (const lv of lvs) {
        const state = stateOf(lv);
        const isPlan = state === 'planned';
        if (!isPlan) n++;
        const stars = isPlan ? 0 : starsOf(lv.id);
        const cta = state === 'done' ? 'Replay' : state === 'progress' ? 'Improve' : 'Start';
        const delay = Math.min(320, n * 26);
        html += `<li class="lesson-row ${state}" data-lv-row="${esc(lv.id)}" style="animation-delay:${delay}ms">
            <span class="lr-num" aria-hidden="true">${isPlan ? '·' : n}</span>
            <div class="lr-main">
                <div class="lr-title">${esc(T(lv.title))}${isPlan ? '' : diffChip(lv.difficulty)}</div>
                <div class="lr-goal">${esc(T(lv.goalText || lv.explain))}</div>
            </div>
            ${isPlan ? '' : `<span class="stars" aria-label="${stars} of 3 stars">${starRow(stars)}</span>`}
            ${isPlan
                ? `<span class="lr-soon">Coming soon</span>`
                : `<button class="btn-primary lr-open" type="button" data-lv-open="${esc(lv.id)}">${cta}</button>`}
        </li>`;
    }
    html += `</ol></div>`;
    pk.innerHTML = html;
    $('set-back')?.addEventListener('click', showPickerHome);
    pk.querySelectorAll('[data-lv-open]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); openLevel(b.dataset.lvOpen); });
    });
}

function openSet(setId) {
    if (!setById(setId)) return;
    setLearnUrl({ set: setId });
    showLearn();
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    renderSetView(setId);
    window.scrollTo(0, 0);
}

function openLevel(id) {
    const lv = DATA.levels.find((l) => l.id === id);
    if (!lv || lv.planned) return;
    // Every entry counts as an attempt (tries), recorded additively.
    try {
        const a = store.state.attempts[id] || (store.state.attempts[id] = { tries: 0, hintsUsed: 0, solvedAt: null });
        a.tries += 1;
        saveProgress(store.state, store.backend);
    } catch (_) {}
    setLearnUrl({ level: id, set: lv.set });
    showLearn();
    view = 'level';
    currentSetId = lv.set || null;
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
    // Keep the screen on the board: snap to top so the sticky bar + board
    // appear immediately — no need to scroll down on mobile.
    // scrollIntoView({block:'center'}) was pulling the board below the sticky
    // bar on small phones; a plain scrollTo(0,0) is reliable and instant.
    requestAnimationFrame(() => {
        try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (_) {}
    });
    // Forced: on a freshly opened level the board does not hold focus yet, so
    // the first Tab must land on the piece the level expects.
    board.focusSquare(firstOwnSquare(), true);
}

function showPickerHome() {
    clearLearnUrl();
    showLearn();
    $('levelview').hidden = true;
    $('learn-heading').hidden = false;
    $('picker').hidden = false;
    renderHome();
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

function pushLog(from, to, res, reply) {
    const cap = res && res.captured ? 'x' : '-';
    const suf = res && res.promotion ? '=' + String(res.promotion).toUpperCase() : '';
    let label = `${from}${cap}${to}${suf}`;
    // Opponent levels: the enemy's answer rides on the same row, so undo
    // (one row = one engine snapshot) stays one click.
    if (reply) {
        const rcap = reply.captured ? 'x' : '-';
        label += ` ${reply.from}${rcap}${reply.to}`;
    }
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
            const pc = p.color === 'w' ? p.type.toUpperCase() : p.type;
            img.src = (window.DoChessPieces && window.DoChessPieces.url(pc, 'v24')) ||
                `assets/pieces/pieces-second/${p.color === 'w' ? 'white' : 'black'}-${PIECE_FILE[p.type]}.svg?v24`;
            img.dataset.fallbackPiece = pc;
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
    pushLog(from, to, r.move, r.reply);
    sess.state.lastMove = { from, to };
    sess.state.rover = to;
    const captured = !!(r.move && r.move.captured);
    paint();
    // The defender's capture lands after the player's: burst it too.
    if (r.reply && r.reply.captured) board.burst(r.reply.to, 'target');

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
        if (sess.inCheck()) {
            feedback('error', 'Check! Your king is attacked — get it to safety.');
        } else if (starsAfter === 0) {
            feedback('info', 'Goal reached — one more move to finish.');
        } else {
            feedback('info', 'Keep going — follow the stars.');
        }
    }
}
function collectedNow(sq) { return sess.state.collected.has(sq); }

function showResult(res) {
    const s = sess.state;
    const id = s.level.id;
    const gained = res.stars > (store.state.stars[id] || 0);
    const firstSolve = !store.state.attempts[id]?.solvedAt;
    if (gained) {
        store.state.stars[id] = res.stars;
    }
    // Attempts + XP are additive and truthful: tries counted per entry in
    // openLevel, hints/solve recorded here, XP only on the first solve.
    try {
        const a = store.state.attempts[id] || (store.state.attempts[id] = { tries: 0, hintsUsed: 0, solvedAt: null });
        a.hintsUsed = Math.max(a.hintsUsed || 0, res.hintsUsed || 0);
        if (firstSolve) {
            a.solvedAt = new Date().toISOString();
            if (s.level.xp) addXp(store.state, s.level.xp);
            try { touchDay(store.state); } catch (_) {}
        }
        saveProgress(store.state, store.backend);
    } catch (_) { try { saveProgress(store.state, store.backend); } catch (_) {} }
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
    // Every Learn entry (header, side rail, tab bar) opens the picker.
    // A leftover ?level= must not trap the player on one puzzle when they
    // tap Learn again from another screen.
    document.querySelectorAll('#nav-learn, [data-nav="learn"]').forEach((el) => {
        if (el.dataset.learnBound) return;
        el.dataset.learnBound = '1';
        el.addEventListener('click', showPickerHome);
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
    // Deep hint: optional cloud-engine assist (chess-api shapes). The button
    // only exists when an endpoint is configured; otherwise the local hint
    // above is the whole story and nothing ever touches the network.
    try {
        if (window.DoChessCloud && window.DoChessCloud.configured()) {
            const dh = $('deep-hint-btn');
            if (dh) {
                dh.hidden = false;
                dh.addEventListener('click', async () => {
                    if (!sess) return;
                    feedback('info', 'Asking the cloud engine…');
                    const fen = (sess.state && sess.state.fen) || null;
                    const mv = await window.DoChessCloud.hint(fen, []);
                    if (!mv) { feedback('error', 'Cloud engine unreachable — the local Hint still works.'); return; }
                    const msg = `Cloud suggests ${mv.slice(0, 2)}-${mv.slice(2, 4)}${mv[4] ? '=' + mv[4].toUpperCase() : ''}.`;
                    $('hint-text').textContent = msg;
                    say(msg);
                    feedback('info', msg);
                });
            }
        }
    } catch (_) {}
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
    // The More sheet is not navigation — opening it must not hide Learn.
    document.querySelectorAll('.nav-btn').forEach((b) => {
        const nv = b.dataset.nav || '';
        if (nv === 'learn' || nv === 'more' || b.id === 'nav-learn') return;
        b.addEventListener('click', () => hideLearn());
    });
    // Piece style switched in the Online lobby: the board pieces are swapped
    // in place by js/pieces.js, but the icon/tray artwork needs a re-render.
    window.addEventListener('dochess:pieces', () => {
        if (!inLearn()) return;
        if (view === 'home') renderHome();
        else if (view === 'set' && currentSetId) renderSetView(currentSetId);
        else if (sess) { buildCapturedTray(); syncCapturedTray(); }
    });
    // Cloud sync pulled newer learn progress for this account: reload the
    // module store so stars/XP on screen match the server, not the device.
    window.addEventListener('dochess:synced', (e) => {
        const w = (e && e.detail && e.detail.written) || {};
        if (!w.learn) return;
        store = loadProgress();
        if (!inLearn()) return;
        if (view === 'home') renderHome();
        else if (view === 'set' && currentSetId) renderSetView(currentSetId);
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
    const params = new URLSearchParams(location.search);
    const id = params.get('level');
    const set = params.get('set');
    if (id && DATA.levels.some((l) => l.id === id && !l.planned)) { logMoves = []; renderLog(); openLevel(id); }
    else if (set && setById(set)) { openSet(set); }
    // play.html redirects here as index.html?level=x#learn — honor the marker
    // so the redirect actually lands on the picker instead of Home.
    else if (location.hash === '#learn') showPickerHome();
}