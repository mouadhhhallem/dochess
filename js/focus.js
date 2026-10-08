/**
 * js/focus.js — "focus mode" for the Learn + Lessons boards.
 *
 * On a phone the board shares the viewport with a header, a goal card, a
 * speech bubble, a status strip, a six-button action row, a player card and
 * a whole dashboard (Brief, Why, Goal, hints, Move Log, result). The board is
 * the task; everything else is commentary.
 *
 * This module flips one class on the screen wrapper. Everything tagged
 * `data-focus-hide` in the markup disappears, the grid collapses to one
 * column, and the board takes the whole viewport — while a compact bar keeps
 * undo, "next" and the restore button one tap away. Nothing is re-rendered,
 * re-bound or unmounted, so toggling costs one class write.
 *
 * Desktop keeps everything: there is room for it and hiding it would be a
 * downgrade. The preference is remembered per screen and shared between
 * Learn and Lessons, because a player who wants a bare board wants a bare
 * board everywhere.
 */

const KEY = 'cc:focus';
const screens = ['learn-screen', 'lesson-screen'];

/**
 * Screens narrower than this keep focus mode; wider ones ignore it.
 *
 * MUST match the CSS breakpoints exactly. When it was 860 while the toggle
 * bar only appeared below 700, any width in between (landscape phones, small
 * tablets) entered focus mode with NO WAY BACK: the bar was hidden, so the
 * toggle was unreachable and every panel stayed hidden. A one-way door.
 */
const NARROW = 700;

let bound = false;

function readPref() {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch (_) {
        return false;
    }
}

function writePref(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* blocked */ }
}

/** The toggle lives inside whichever screen is on show. */
function toggleFor(root) {
    return root.querySelector('[data-focus-toggle]');
}

/**
 * Keep the disclosure semantics honest: aria-expanded describes whether the
 * collapsible content is showing, so it is FALSE when focus mode has hidden
 * it (aria-expanded=true + nothing on screen is a lie to a screen reader).
 */
function label(on, root) {
    const btn = toggleFor(root);
    if (!btn) return;
    btn.setAttribute('aria-expanded', on ? 'false' : 'true');
    btn.setAttribute('aria-label', on ? 'Show the full panel' : 'Hide everything except the board');
    btn.title = on ? 'Show full panel' : 'Focus mode';
}

export function isFocusMode() {
    return readPref();
}

/** Apply the current preference to every screen (both share one setting). */
export function applyFocusMode() {
    const on = readPref();
    for (const id of screens) {
        const el = document.getElementById(id);
        if (!el) continue;
        // Only phones get the toggle, so never force the class on desktop.
        const wide = window.innerWidth > NARROW;
        el.classList.toggle('lv-focus', on && !wide);
        label(on, el);
    }
    // Belt and braces: if a screen somehow ended up collapsed with no visible
    // toggle (e.g. markup edited mid-session, or a very short viewport), open
    // it back up. Focus mode must never be a one-way door.
    for (const id of screens) {
        const el = document.getElementById(id);
        if (!el || !el.classList.contains('lv-focus')) continue;
        if (el.classList.contains('active') && !visibleToggle(el)) {
            el.classList.remove('lv-focus');
        }
    }
}

/** Is there a toggle the user can actually reach inside this screen? */
function visibleToggle(root) {
    const btn = toggleFor(root);
    if (!btn) return false;
    const cs = window.getComputedStyle(btn);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = btn.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

export function toggleFocusMode() {
    const next = readPref() ? '0' : '1';
    writePref(next === '1');
    applyFocusMode();
    const active = screens.map((id) => document.getElementById(id))
        .find((el) => el && el.classList.contains('active'));
    if (active) active.scrollIntoView({ block: 'nearest' });
    return next === '1';
}

/**
 * Wire the toggles. Delegated on the document so it works for markup that
 * app.js re-renders (the Lessons screen is rebuilt on every lesson open).
 */
export function bootFocusMode() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-focus-toggle]');
        if (!btn) return;
        e.preventDefault();
        toggleFocusMode();
    });
    applyFocusMode();
    // A rotate or a window resize crosses the phone/desktop boundary.
    window.addEventListener('resize', applyFocusMode);
    window.addEventListener('orientationchange', applyFocusMode);
}