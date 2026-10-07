/**
 * js/learn.js — Learn screen wiring for index.html (the one and only site).
 *
 * Hosts the free-move curriculum (data/lessons.json) inside the homepage:
 * picker (grouped by piece, stars from dochess:v1) + level view (board,
 * goal panel, counter/par, hints, undo/restart/solution, promotion picker,
 * result panel with Retry/Next). Same modules as the retired play.html.
 *
 * Coexists with the legacy app.js router: showing Learn hides the legacy
 * screens and highlights the Learn nav; any legacy nav click hides Learn
 * again (capture-phase hook, app.js handlers still run untouched).
 */

import { createBoard } from './board.js';
import { createLevel } from './engine.js';
import { loadProgress, saveProgress } from './storage.js';

const $ = (id) => document.getElementById(id);

let DATA = null;
let store = loadProgress();
let sess = null;
let board = null;
let pendingPromo = null;

const lang = () => (store.state.settings && store.state.settings.lang) || 'en';
const T = (obj, fb = '') => (obj && (obj[lang()] || obj.en)) || fb;
const inLearn = () => $('learn-screen') && $('learn-screen').classList.contains('active');

export function showLearn() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const scr = $('learn-screen');
    if (!scr) return;
    scr.classList.add('active');
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

function starsOf(id) { return store.state.stars[id] || 0; }
function starRow(id) {
    const n = starsOf(id);
    return n ? '★'.repeat(n) + '☆'.repeat(3 - n) : '☆☆☆';
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
        `<div class="picker-group"><h2>${gi + 1}. ${g.name}</h2><div class="picker-row">` +
        g.items.map((lv, i) =>
            `<button class="lvl-btn" data-lv="${lv.id}" type="button"><div>${i + 1}. ${T(lv.title)}</div><div class="stars">${starRow(lv.id)}</div></button>`
        ).join('') + `</div></div>`
    ).join('');
    pk.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => openLevel(b.dataset.lv)));
}

function openLevel(id) {
    const lv = DATA.levels.find((l) => l.id === id);
    if (!lv) return;
    history.replaceState(null, '', 'index.html?level=' + id);
    showLearn();
    $('levelview').hidden = false;
    $('picker').hidden = true;
    $('lv-title').textContent = T(lv.title);
    $('lv-goal').textContent = T(lv.goalText);
    $('par').textContent = lv.par;
    $('result').classList.remove('show');
    $('solve-text').textContent = '';
    $('hint-text').textContent = '';
    say(lv.intro ? T(lv.intro) : '');
    sess = createLevel(lv, window.Chess, lang());
    if (!board) board = createBoard($('play-board'), { onAction: onSquare });
    paint();
    updateNextBtn();
    board.focusSquare(firstOwnSquare());
}

function showPickerHome() {
    history.replaceState(null, '', 'index.html');
    showLearn();
    $('levelview').hidden = true;
    $('picker').hidden = false;
    renderPicker();
}

function firstOwnSquare() {
    const pieces = sess.pieces();
    const sqs = Object.keys(pieces).filter((s) => pieces[s].color === sess.state.player);
    const allow = new Set((sess.state.level.movePieces || []).map((s) => s.toLowerCase()));
    return sqs.find((s) => !allow.size || allow.has(pieces[s].type)) || sqs[0] || 'e2';
}

function say(msg) { const el = $('fb-text'); if (el) el.textContent = msg; }

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

/* ── next-level navigation (top bar button + result button + N key) ── */
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
    btn.textContent = last ? 'Last level' : 'Next →';
}

function collectRemaining() {
    const g = (sess.state.level.goal && sess.state.level.goal.collect) || [];
    return g.filter((s) => !sess.state.collected.has(s));
}
function captureRemaining() {
    const g = (sess.state.level.goal && sess.state.level.goal.capture) || [];
    return g.filter((s) => !sess.state.captured.has(s));
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
    $('mv').textContent = s.moves;
}

function onSquare(sq) {
    if (!sess || sess.state.done) return;
    const s = sess.state;
    if (pendingPromo) { say('Choose a promotion piece above first.'); return; }
    if (!s.selected) {
        const p = sess.pieces()[sq];
        if (!p) return;
        s.selected = sq;
        s.rover = sq;
        if (!sess.legalFor(sq).length) {
            say(T(s.level.failHint) || 'That piece has no moves here.');
            s.selected = null;
        }
        paint();
        return;
    }
    if (sq === s.selected) { s.selected = null; paint(); return; }
    if (!sess.legalFor(s.selected).some((m) => m.to === sq)) {
        const p = sess.pieces()[sq];
        const allow = new Set((s.level.movePieces || []).map((x) => x.toLowerCase()));
        if (p && (!allow.size || allow.has(p.type))) { s.selected = sq; s.rover = sq; paint(); return; }
        say(T(s.level.failHint));
        s.selected = null;
        paint();
        return;
    }
    const from = s.selected;
    if (sess.needsPromotion(from, sq)) {
        pendingPromo = { from, to: sq };
        $('promo-row').hidden = false;
        say('Choose your promotion piece:');
        return;
    }
    doMove(from, sq, null);
}

function doMove(from, to, promo) {
    const r = sess.play(from, to, promo);
    pendingPromo = null;
    $('promo-row').hidden = true;
    if (!r.ok) { say(r.reason === 'illegal' ? T(sess.state.level.failHint) : 'Hmm.'); return; }
    sess.state.lastMove = { from, to };
    sess.state.rover = to;
    const captured = !!(r.move && r.move.captured);
    paint();
    if (r.done) {
        showResult(r.result);
        playLevelSound(captured, true);
    } else {
        say('');
        board.focusSquare(to);
        playLevelSound(captured, false);
    }
}

function showResult(res) {
    const s = sess.state;
    const id = s.level.id;
    if (res.stars > (store.state.stars[id] || 0)) {
        store.state.stars[id] = res.stars;
        saveProgress(store.state, store.backend);
    }
    $('r-stars').textContent = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
    $('r-text').textContent = `${res.moves} moves · par ${res.par} · ${res.points} pts` +
        (res.hintsUsed ? ` · ${res.hintsUsed} hint(s)` : '') + ` — ${T(s.level.success)}`;
    $('result').classList.add('show');
    // Navigation is bound once in bootLearn; only the enabled state is per-level.
    const idx = DATA.levels.findIndex((l) => l.id === id);
    $('next-btn').disabled = idx < 0 || idx + 1 >= DATA.levels.length;
}

function bind(id, fn) {
    const el = $(id);
    if (el && !el.dataset.learnBound) { el.dataset.learnBound = '1'; el.addEventListener('click', fn); }
}

export async function bootLearn() {
    bind('nav-learn', () => {
        const id = new URLSearchParams(location.search).get('level');
        if (id && DATA && DATA.levels.some((l) => l.id === id)) openLevel(id);
        else showPickerHome();
    });
    bind('start-levels-btn', () => showPickerHome());
    bind('back-btn', showPickerHome);
    bind('next-lvl-btn', nextLevel);
    bind('next-btn', nextLevel);
    bind('retry-btn', () => { sess.restart(); $('result').classList.remove('show'); say(''); paint(); });
    bind('undo-btn', () => { if (sess && sess.undo()) { say('Undone.'); paint(); } });
    bind('restart-btn', () => {
        if (!sess) return;
        sess.restart();
        $('result').classList.remove('show');
        $('solve-text').textContent = '';
        say('Fresh board — go!');
        paint();
    });
    bind('hint-btn', () => {
        if (!sess) return;
        const h = sess.hint();
        $('hint-text').textContent = h || 'No more hints — the solution button shows the shortest road.';
    });
    bind('solve-btn', () => {
        if (!sess) return;
        const r = sess.solution();
        $('solve-text').textContent = r.reachable
            ? `Shortest (${r.par}): ${r.lines[0].join(' ')}${r.lines[1] ? '  |  ' + r.lines[1].join(' ') : ''}`
            : 'No solution found?! ' + (r.failReason || '');
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
        if (k === 'u') { if (sess.undo()) { say('Undone.'); paint(); } }
        else if (k === 'r') { sess.restart(); $('result').classList.remove('show'); say('Fresh board — go!'); paint(); }
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
    if (id && DATA.levels.some((l) => l.id === id)) openLevel(id);
    // play.html redirects here as index.html?level=x#learn — honor the marker
    // so the redirect actually lands on the picker instead of Home.
    else if (location.hash === '#learn') showPickerHome();
}
