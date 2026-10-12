/**
 * server/lib/merge.mjs — pure section-merge rules for user state.
 *
 * A "section" is `{ updatedAt: number, data: any }`. Three modes:
 *   lww      — last writer wins wholesale (learn, lessons, achievements,
 *              ratings, puzzles, settings, study, playtime).
 *   list     — array merged by a key, newest first, capped (games).
 *   keyed    — object merged per key, newer record wins (leaderboard).
 *
 * Pure functions only: no I/O, no clock reads, so they are unit-testable.
 */

export const SECTION_MODES = {
    learn: 'lww',
    lessons: 'lww',
    achievements: 'lww',
    ratings: 'lww',
    puzzles: 'lww',
    settings: 'lww',
    study: 'lww',
    playtime: 'lww',
    games: 'list',
    leaderboard: 'keyed'
};

/* Games are user data that must never be casually dropped: the bound only
   exists to keep one user's Mongo document far below the 16 MB limit.
   2000 records at the per-record cap (600 half-moves) is well inside that. */
export const MAX_GAMES = 2000;
export const MAX_LIST_BYTES = 400_000;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (Number.isFinite(v) ? v : 0);

/** Deep-clone through JSON — payloads are plain data by contract. */
export function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function listKey(rec, i) {
    if (!isObj(rec)) return `i${i}`;
    return String(rec.gameId || rec.id || rec.code || rec.date || i);
}

function mergeList(stored, incoming, keyFn = listKey) {
    const byKey = new Map();
    for (const [i, rec] of (stored || []).entries()) {
        if (isObj(rec)) byKey.set(keyFn(rec, i), rec);
    }
    for (const [i, rec] of (incoming || []).entries()) {
        if (!isObj(rec)) continue;
        const k = keyFn(rec, i);
        const prev = byKey.get(k);
        if (!prev || num(rec.date || rec.updatedAt) >= num(prev.date || prev.updatedAt)) byKey.set(k, rec);
    }
    return [...byKey.values()]
        .sort((a, b) => num(b.date || b.updatedAt) - num(a.date || a.updatedAt))
        .slice(0, MAX_GAMES);
}

function mergeKeyed(stored, incoming) {
    const out = { ...(isObj(stored) ? stored : {}) };
    for (const [k, v] of Object.entries(isObj(incoming) ? incoming : {})) {
        if (!isObj(v)) continue;
        const prev = out[k];
        if (!isObj(prev)) { out[k] = v; continue; }
        // Per category keep the freshest rating; names/images follow it.
        const cats = { ...(isObj(prev.cats) ? prev.cats : {}) };
        let seen = num(prev.seen);
        for (const [cat, rating] of Object.entries(isObj(v.cats) ? v.cats : {})) {
            if (Number.isFinite(rating) && num(v.seen) >= seen) cats[cat] = rating;
            else if (Number.isFinite(rating) && cats[cat] === undefined) cats[cat] = rating;
        }
        const newer = num(v.seen) >= seen;
        out[k] = {
            name: (newer && v.name) || prev.name || v.name || 'Player',
            cats,
            seen: Math.max(seen, num(v.seen))
        };
    }
    return out;
}

/**
 * Merge one incoming section into the stored one.
 * Returns the stored section unchanged (same reference) when nothing wins,
 * so callers can skip the write.
 */
export function mergeSection(id, stored, incoming) {
    if (!isObj(incoming) || !Number.isFinite(incoming.updatedAt)) return stored || null;
    const mode = SECTION_MODES[id] || 'lww';
    const storedUpd = isObj(stored) && Number.isFinite(stored.updatedAt) ? stored.updatedAt : -1;

    if (mode === 'lww') {
        if (incoming.updatedAt < storedUpd) return stored || null;
        if (incoming.updatedAt === storedUpd) return stored || null;
        return { updatedAt: incoming.updatedAt, data: clone(incoming.data) };
    }

    // list / keyed: merge content, then keep the freshest updatedAt stamp.
    const mergedData = mode === 'list'
        ? mergeList(isObj(stored) ? stored.data : null, Array.isArray(incoming.data) ? incoming.data : null)
        : mergeKeyed(isObj(stored) ? stored.data : null, incoming.data);

    if (JSON.stringify(mergedData) === JSON.stringify(isObj(stored) ? stored.data : undefined)) {
        return stored || null; // no content change → no write
    }
    return { updatedAt: Math.max(storedUpd, incoming.updatedAt), data: mergedData };
}

/** Merge a whole `{section: {updatedAt, data}}` map. Mutates `doc.sections`. */
export function mergeSections(doc, incomingSections) {
    const sections = (doc && isObj(doc.sections)) ? doc.sections : {};
    let changed = false;
    for (const [id, inc] of Object.entries(isObj(incomingSections) ? incomingSections : {})) {
        if (!(id in SECTION_MODES)) continue; // unknown sections are ignored
        const before = sections[id];
        const after = mergeSection(id, before, inc);
        if (after && after !== before) {
            sections[id] = after;
            changed = true;
        }
    }
    return { changed, sections };
}

/** Client-side mirror: pick whichever side is newer per section. */
export function mergeForClient(serverSections, localSections) {
    const out = {};
    for (const [id, srv] of Object.entries(isObj(serverSections) ? serverSections : {})) {
        const loc = isObj(localSections) ? localSections[id] : null;
        if (!isObj(srv)) continue;
        if (!isObj(loc) || srv.updatedAt > (loc.updatedAt || 0)) {
            out[id] = srv;
        }
    }
    return out;
}
