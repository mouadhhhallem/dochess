/**
 * js/storage.js — versioned progress persistence for DoChess.
 *
 * Single source of truth: localStorage key "dochess:v1".
 * - Every read is try/catch + shape-checked. Blocked/corrupt storage falls
 *   back to an in-memory backend (with `backend.blocked === true`) so the
 *   course keeps working; the UI can offer JSON export so nothing is lost.
 * - Legacy `ccp_v4[_userId]` data ({done:[ids]}) is preserved verbatim under
 *   state.legacy.v4done on first load; id-to-level star mapping happens in
 *   a later batch once the full curriculum exists.
 * - Pure functions take an explicit `backend` ({get,set,del}) so tests can
 *   inject a mock. Default backend wraps window.localStorage safely.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'dochess:v1';
export const LEGACY_PREFIX = 'ccp_v4'; // legacy values: {done:[1..10]}

/** Blank progress state. Only plain JSON values (exportable as-is). */
export function defaultState() {
    return {
        version: SCHEMA_VERSION,
        stars: {},        // levelId -> 0..3
        attempts: {},     // levelId -> {tries,hintsUsed,solvedAt}
        accuracy: {},     // theme -> {ok,n}
        leitner: {},      // levelId -> {box:1..5,due:ISO,fails}
        streak: { count: 0, lastDay: null }, // lastDay: "YYYY-MM-DD"
        heatmap: {},      // "YYYY-MM-DD" -> solved count
        xp: 0,
        level: 1,
        badges: [],
        rushBest: 0,
        daily: { date: null, levelId: null, done: false },
        settings: {
            theme: 'night', pieces: 'classic', board: 'brown',
            coords: true, sound: false, lang: 'en',
        },
        legacy: {},       // migrated old keys, preserved verbatim
    };
}

/** Shape check: true only if `s` looks like a v1 state. Repairs nothing. */
export function isValidState(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    if (s.version !== SCHEMA_VERSION) return false;
    for (const k of ['stars', 'attempts', 'accuracy', 'leitner', 'heatmap']) {
        if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) return false;
    }
    if (!s.streak || typeof s.streak.count !== 'number') return false;
    if (!s.settings || typeof s.settings !== 'object') return false;
    if (typeof s.xp !== 'number' || typeof s.level !== 'number') return false;
    if (!Array.isArray(s.badges)) return false;
    return true;
}

/** Safe storage backend. Falls back to memory when localStorage is blocked. */
export function safeBackend() {
    const mem = new Map();
    try {
        const ls = window.localStorage;
        ls.getItem('__dochess_probe__'); // throws when blocked
        return {
            blocked: false,
            get: (k) => ls.getItem(k),
            set: (k, v) => { try { ls.setItem(k, v); } catch (_) {} },
            del: (k) => { try { ls.removeItem(k); } catch (_) {} },
        };
    } catch (_) {
        return {
            blocked: true,
            get: (k) => (mem.has(k) ? mem.get(k) : null),
            set: (k, v) => { mem.set(k, v); },
            del: (k) => { mem.delete(k); },
        };
    }
}

/** Load progress: stored v1 -> legacy migration -> blank default. Never throws. */
export function loadProgress(backend = safeBackend()) {
    try {
        const raw = backend.get(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (isValidState(parsed)) return { state: parsed, backend };
        }
    } catch (_) { /* fall through to migration/default */ }
    // One-time legacy migration (verbatim preserve, no star mapping yet).
    const migrated = defaultState();
    try {
        const legacyRaw = backend.get(LEGACY_PREFIX);
        if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            if (legacy && Array.isArray(legacy.done)) {
                migrated.legacy.v4done = legacy.done.filter((n) => Number.isInteger(n));
            }
        }
    } catch (_) {}
    return { state: migrated, backend };
}

/** Persist state. Never throws (quota/blocked writes are swallowed). */
export function saveProgress(state, backend = safeBackend()) {
    try {
        backend.set(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (_) {
        return false;
    }
}

/** Serialize for the Export button (download as dochess-progress.json). */
export function exportProgress(state) {
    return JSON.stringify(state, null, 2);
}

/**
 * Parse an imported file. Returns {ok:true, state} or {ok:false, error}.
 * Refuses wrong-version and malformed payloads instead of merging blindly.
 */
export function importProgress(jsonText) {
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (_) {
        return { ok: false, error: 'not-json' };
    }
    if (!isValidState(parsed)) return { ok: false, error: 'bad-schema' };
    return { ok: true, state: parsed };
}

/** Clear progress (call only after user confirms). Keeps settings. */
export function resetProgress(backend = safeBackend()) {
    let settings = null;
    try {
        const raw = backend.get(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && parsed.settings) settings = parsed.settings;
    } catch (_) {}
    const fresh = defaultState();
    if (settings) fresh.settings = { ...fresh.settings, ...settings };
    saveProgress(fresh, backend);
    return fresh;
}

// ── small helpers used by engine/review (thin, no policy inside) ──

export function todayKey(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Record a calendar day of activity; maintains streak across exactly-1-day gaps. */
export function touchDay(state, dayKey = todayKey()) {
    state.heatmap[dayKey] = (state.heatmap[dayKey] || 0) + 1;
    if (state.streak.lastDay === dayKey) return state.streak.count;
    const prev = state.streak.lastDay;
    let consecutive = false;
    if (prev) {
        const ms = Date.parse(dayKey) - Date.parse(prev);
        consecutive = ms === 86400000;
    }
    state.streak.count = consecutive ? state.streak.count + 1 : 1;
    state.streak.lastDay = dayKey;
    return state.streak.count;
}

/**
 * Free-move scoring (Lichess-learn style: fewer moves = more points).
 * Stars come ONLY from move count vs par; hints cost points, never stars.
 */
export const POINTS_BASE = 100;
export const POINTS_PER_EXTRA_MOVE = 10;
export const HINT_POINT_COST = 15;

export function starsForPar(moves, par) {
    if (!Number.isFinite(moves) || !Number.isFinite(par)) return 0;
    if (moves <= par) return 3;
    if (moves <= par + 2) return 2;
    return 1;
}

export function pointsFor({ moves, par, hintsUsed = 0 }) {
    const over = Math.max(0, moves - par);
    return Math.max(0, POINTS_BASE - POINTS_PER_EXTRA_MOVE * over - HINT_POINT_COST * Math.max(0, hintsUsed));
}

/** XP with level = 1 + floor(xp/150). Returns {xp, level, leveledUp}. */
export function addXp(state, amount) {
    const before = state.level;
    state.xp += Math.max(0, amount | 0);
    state.level = 1 + Math.floor(state.xp / 150);
    return { xp: state.xp, level: state.level, leveledUp: state.level > before };
}
