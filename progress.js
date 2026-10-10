/**
 * progress.js — DoChess progress page (classic script, file:// compatible).
 *
 * Owns everything inside #progress-screen: a real completion ring, the
 * ten-step lesson journey (done / current / locked — click any open step
 * to jump straight into that lesson), an honest Practice record read
 * from the Learn store (never invented), and an editorial completed-
 * lessons ledger with teacher portraits. Every number on this page
 * comes from app progress or localStorage; nothing is decorative.
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
function assetV() {
    try { if (window.ChessCourseApp && ChessCourseApp.assetV) return ChessCourseApp.assetV(); } catch (_) {}
    return 'v24';
}
function teachImg(t) { return `assets/teacher${t.id}-card.jpg?${assetV()}`; }

const app = () => window.app;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';
const LOCK  = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const CHEV  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

/* ── static shell (built once) ── */
let shellBuilt = false;
function shell() {
    const wrap = document.getElementById('pg-wrap');
    if (!wrap || shellBuilt) return;
    shellBuilt = true;
    wrap.innerHTML = `
    <section class="pg-hero" aria-label="Course completion">
        <div class="pg-hero-copy">
            <p class="pg-eyebrow"><span class="pg-eyebrow-mark" aria-hidden="true"></span>Progress</p>
            <h2 class="pg-title">Your journey so far</h2>
            <p class="pg-mile" id="pg-mile"></p>
            <div class="pg-ctas" id="pg-ctas"></div>
        </div>
        <div class="pg-hero-ring" id="pg-ring"></div>
    </section>

    <section class="pg-journey pg-reveal" aria-label="Lesson journey">
        <div class="pg-sechead">
            <p class="pg-kicker">The course</p>
            <h3>Ten steps to your first real game</h3>
        </div>
        <div class="pg-rail" id="pg-rail"><span class="pg-rail-fill" id="pg-rail-fill" aria-hidden="true"></span></div>
        <div class="pg-current" id="pg-current"></div>
    </section>

    <section class="pg-stats pg-reveal" aria-label="Practice record">
        <div class="pg-sechead">
            <p class="pg-kicker">Practice record</p>
            <h3>Interactive levels</h3>
        </div>
        <div id="pg-stats-body"></div>
    </section>

    <section class="pg-done pg-reveal" aria-label="Completed lessons">
        <div class="pg-sechead">
            <p class="pg-kicker">Completed</p>
            <h3>Lessons you have finished</h3>
        </div>
        <div id="pg-done-list"></div>
    </section>`;
    // One delegated opener for every lesson button on this page.
    wrap.addEventListener('click', (e) => {
        if (!app()) return;
        const b = e.target.closest ? e.target.closest('[data-pg-lesson]') : null;
        if (b) {
            if (b.disabled) return;
            const id = parseInt(b.dataset.pgLesson, 10);
            if (!Number.isNaN(id) && app().isOpen(id)) app().openLesson(id);
            return;
        }
        const g = e.target.closest ? e.target.closest('[data-pg-goto]') : null;
        if (!g) return;
        const k = g.dataset.pgGoto;
        if (k === 'lessons') app().showLessons();
        else if (k === 'online') app().showOnline();
        else if (k === 'study') app().showStudy();
        else if (k === 'learn') { const n = document.getElementById('nav-learn'); if (n) n.click(); }
    });
    revealInit();
}

/* ── section reveal: same pattern as home, opacity+translate only ── */
function revealInit() {
    const secs = document.querySelectorAll('#pg-wrap .pg-reveal');
    if (!secs.length) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
        secs.forEach(s => s.classList.add('pg-revealed'));
        return;
    }
    const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (en.isIntersecting) {
                en.target.classList.add('pg-revealed');
                io.unobserve(en.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    secs.forEach(s => io.observe(s));
}

/* ── real-data helpers ── */
function milestone(n) {
    if (n >= 10) return 'Course complete — you learned every piece and rule.';
    if (n >= 7) return 'Endgame of the course: promotion and the full game await.';
    if (n >= 5) return 'Halfway there — the pieces are yours; now their power.';
    if (n >= 3) return 'Foundations set — the minor pieces are warming up.';
    if (n >= 1) return 'First moves played — momentum is everything.';
    return 'Ten lessons stand between you and your first real game.';
}
function ringHTML(pct, done, total) {
    const R = 54, C = 2 * Math.PI * R;
    const off = C * (1 - pct / 100);
    return `<svg class="pg-ring-svg" viewBox="0 0 128 128" role="img" aria-label="${done} of ${total} lessons complete, ${pct} percent">
        <circle class="pg-ring-bg" cx="64" cy="64" r="${R}"/>
        <circle class="pg-ring-fg" cx="64" cy="64" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 64 64)"/>
        <text class="pg-ring-num" x="64" y="62" text-anchor="middle">${done}</text>
        <text class="pg-ring-of" x="64" y="84" text-anchor="middle">/ ${total}</text>
    </svg>`;
}
// Read-only snapshot of the Learn store (js/storage.js "dochess:v1").
// Returns null when the learner has no practice record — the page then
// shows an honest invitation instead of fabricated numbers.
function learnStats() {
    try {
        const raw = localStorage.getItem('dochess:v1');
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || typeof s !== 'object') return null;
        const stars = (s.stars && typeof s.stars === 'object') ? s.stars : {};
        const starTotal = Object.values(stars).reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
        const attempts = (s.attempts && typeof s.attempts === 'object') ? s.attempts : {};
        const solved = Object.keys(attempts).length;
        const xp = typeof s.xp === 'number' ? s.xp : 0;
        const level = typeof s.level === 'number' ? s.level : 1;
        const streak = (s.streak && typeof s.streak.count === 'number') ? s.streak.count : 0;
        if (!starTotal && !solved && !xp) return null;
        return { starTotal, solved, xp, level, streak };
    } catch (_) { return null; }
}

/* ── progress-driven regions (real state only) ── */
function refresh() {
    shell();
    if (!app() || !document.getElementById('pg-wrap')) return;
    const a = app();
    const done = a.progress.done.length, total = a.lessons.length;
    const pct = Math.round((done / total) * 100);
    const cur = a._currentLesson();
    // Completion ring.
    const ring = document.getElementById('pg-ring');
    if (ring) ring.innerHTML = ringHTML(pct, done, total);
    // Milestone sentence (same voice as the home journey panel).
    const mile = document.getElementById('pg-mile');
    if (mile) mile.textContent = milestone(done);
    // Primary actions — the real next move, never faked.
    const ctas = document.getElementById('pg-ctas');
    if (ctas) {
        if (!cur) {
            ctas.innerHTML = `<button class="btn-primary btn-glow-strong" data-pg-lesson="10" type="button">Play the full game</button>
                <button class="btn-secondary" data-pg-goto="online" type="button">Play online</button>
                <button class="btn-secondary" data-pg-goto="study" type="button">Open Study</button>`;
        } else if (done === 0) {
            ctas.innerHTML = `<button class="btn-primary btn-glow-strong" data-pg-lesson="1" type="button">Start Lesson 1</button>
                <button class="btn-secondary" data-pg-goto="lessons" type="button">Browse all lessons</button>`;
        } else {
            ctas.innerHTML = `<button class="btn-primary btn-glow-strong" data-pg-lesson="${cur.id}" type="button">Continue Lesson ${cur.id} ${CHEV}</button>
                <button class="btn-secondary" data-pg-goto="lessons" type="button">Browse all lessons</button>`;
        }
    }
    // Journey rail: ten real steps, state-accurate.
    const rail = document.getElementById('pg-rail');
    if (rail) {
        const fill = '<span class="pg-rail-fill" id="pg-rail-fill" aria-hidden="true"></span>';
        rail.innerHTML = fill + a.lessons.map(l => {
            const isDone = a.isDone(l.id), isOpen = a.isOpen(l.id);
            const isCur = !!(cur && cur.id === l.id);
            const state = isDone ? 'done' : isCur ? 'current' : isOpen ? 'ready' : 'locked';
            const label = isDone ? 'Completed' : isCur ? 'Up next' : isOpen ? 'Ready to play' : 'Locked';
            const mark = isDone ? CHECK : isCur || isOpen ? String(l.id) : LOCK;
            const dis = isOpen ? '' : ' disabled';
            return `<button class="pg-node ${state}" data-pg-lesson="${l.id}" type="button"${dis}
                aria-label="Lesson ${l.id}, ${esc(l.title)} — ${label}" title="Lesson ${l.id} — ${esc(l.title)}">
                <span class="pg-node-dot" aria-hidden="true">${mark}</span>
                <span class="pg-node-n" aria-hidden="true">${l.id}</span>
            </button>`;
        }).join('');
        const f = document.getElementById('pg-rail-fill');
        if (f) {
            // Fill starts at left:5% (first node center) and spans to the
            // current node center — max width is 90% (the line's full run).
            let w = 0;
            if (!cur) w = 90;
            else if (done > 0) w = ((done + 0.5) / total - 0.05) * 100;
            f.style.width = Math.max(0, Math.min(90, w)) + '%';
        }
    }
    // Featured current step (or the graduate card).
    const feat = document.getElementById('pg-current');
    if (feat) {
        if (!cur) {
            feat.innerHTML = `<div class="pg-feat-tx"><p class="pg-feat-k">Course complete</p><h4>Every lesson done. The board is yours.</h4>
                <p>Replay the full game, take it online against a friend, or analyze your positions in Study.</p></div>
                <span class="pg-feat-btns"><button class="btn-primary" data-pg-lesson="10" type="button">Full game</button>
                <button class="btn-secondary" data-pg-goto="online" type="button">Play online</button></span>`;
        } else {
            const t = a.teachers.find(x => x.id === cur.teacherId);
            const img = t ? `<div class="pg-feat-photo"><img src="${teachImg(t)}" width="176" height="132" loading="lazy" decoding="async" alt="${esc(t.name)}"></div>` : '';
            feat.innerHTML = `${img}<div class="pg-feat-tx"><p class="pg-feat-k">Up next · Lesson ${cur.id} of ${total}</p>
                <h4>${esc(cur.title)}</h4><p>${esc(cur.objective || '')}</p>${t ? `<p class="pg-feat-teacher">with ${esc(t.name)} · ${esc(t.title)}</p>` : ''}
                <button class="btn-primary" data-pg-lesson="${cur.id}" type="button">${done === 0 ? 'Start' : 'Continue'} ${CHEV}</button></div>`;
        }
    }
    // Practice record: real Learn data, or an honest invitation.
    const stats = document.getElementById('pg-stats-body');
    if (stats) {
        const st = learnStats();
        if (!st) {
            stats.innerHTML = `<div class="pg-statempty">
                <p>Play the 36 interactive levels to earn stars, XP and streaks — your practice record will appear here.</p>
                <button class="btn-secondary" data-pg-goto="learn" type="button">Open interactive levels</button></div>`;
        } else {
            const rows = [
                { ic: 'star',  n: String(st.starTotal), l: st.starTotal === 1 ? 'Star earned' : 'Stars earned' },
                { ic: 'bolt',  n: String(st.xp),        l: `XP · Level ${st.level}` },
                { ic: 'board', n: String(st.solved),    l: st.solved === 1 ? 'Level solved' : 'Levels solved' }
            ];
            if (st.streak > 0) rows.push({ ic: 'cal', n: String(st.streak), l: st.streak === 1 ? 'Day streak' : 'Day streak' });
            stats.innerHTML = `<div class="pg-statgrid">${rows.map(r => `<div class="pg-stat"><span class="pg-stat-ic">${tileIcon(r.ic)}</span><strong>${r.n}</strong><em>${r.l}</em></div>`).join('')}</div>
                <div class="pg-stataction"><button class="btn-secondary" data-pg-goto="learn" type="button">Practice levels</button>
                <span class="pg-statanote">Recorded on this browser.</span></div>`;
        }
    }
    // Completed ledger with teacher portraits.
    const list = document.getElementById('pg-done-list');
    if (list) {
        if (!done) {
            list.innerHTML = `<div class="pg-empty"><p>No lessons completed yet. Your record starts with Lesson 1.</p>
                <button class="btn-primary" data-pg-lesson="1" type="button">Start Lesson 1</button></div>`;
        } else {
            list.innerHTML = a.progress.done.map(id => {
                const l = a.lessons.find(x => x.id === id);
                const t = l && a.teachers.find(x => x.id === l.teacherId);
                if (!l || !t) return '';
                return `<div class="pg-row">
                    <img src="${teachImg(t)}" width="72" height="54" loading="lazy" decoding="async" alt="${esc(t.name)}">
                    <div class="pg-row-tx"><p class="pg-row-k">Lesson ${l.id} · ${esc(t.name)}</p>
                    <h4>${esc(l.title)}</h4><p>${esc(l.objective || '')}</p></div>
                    <button class="btn-secondary sm" data-pg-lesson="${l.id}" type="button">Review</button>
                </div>`;
            }).join('');
        }
    }
}

/* ── public surface (wired from app.js) ── */
function render() { shell(); refresh(); }
window.DoChessProgress = { render, refresh, version: '1.0.0' };
// Self-init for whichever script order wins: if the progress screen is
// already active when this file evaluates, render now; otherwise
// app.js showProgress → _syncProgress picks it up.
try {
    if (document.getElementById('progress-screen')?.classList.contains('active') && window.app && window.app.lessons) render();
} catch (_) {}
})();
