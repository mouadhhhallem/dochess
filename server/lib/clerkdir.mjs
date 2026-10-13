/**
 * server/lib/clerkdir.mjs — global player directory from Clerk.
 *
 * Clerk holds every registered DoChess user, friend or not. The Backend
 * API (secret key, server-side ONLY — never sent to any client) lists
 * users by query, so search can find ANY registered player by partial
 * username or display name. Only id + display name + photo ever leave
 * this module: no emails, no phones, nothing private.
 *
 * Results merge with the local directory (friends.mjs), local wins on
 * conflicts, 20 rows max. Failures and missing secret degrade to the
 * local directory — search never breaks because Clerk is unreachable.
 */
import { config } from './env.mjs';

const CACHE_TTL_MS = 45000;
const cache = new Map(); // normalized query -> {at, rows}

function displayName(u) {
    if (!u || typeof u !== 'object') return 'Player';
    const full = [u.first_name, u.last_name].filter((x) => typeof x === 'string' && x.trim()).join(' ').trim();
    if (full) return full.slice(0, 24);
    if (typeof u.username === 'string' && u.username.trim()) return u.username.trim().slice(0, 24);
    return 'Player';
}

function cleanImg(v) {
    if (typeof v === 'string' && /^https:/.test(v)) return v.slice(0, 2048);
    return null;
}

function cleanUid(v) {
    if (typeof v === 'string' && /^[\w-]{1,64}$/.test(v)) return v;
    return null;
}

export function clearClerkCache() { cache.clear(); }

export async function clerkSearch(q, { fetchImpl = fetch } = {}) {
    q = typeof q === 'string' ? q.trim().toLowerCase() : '';
    if (q.length < 3) return [];
    if (!config.clerkSecretKey) return [];
    const hit = cache.get(q);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
    let rows = [];
    try {
        const url = `https://api.clerk.com/v1/users?${new URLSearchParams({ query: q, limit: '10' })}`;
        const res = await fetchImpl(url, {
            headers: { Authorization: `Bearer ${config.clerkSecretKey}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return [];
        const body = await res.json().catch(() => null);
        const data = Array.isArray(body) ? body : (body && Array.isArray(body.data) ? body.data : []);
        rows = data.map((u) => ({ uid: cleanUid(u && u.id), name: displayName(u), img: cleanImg(u && u.image_url) }))
            .filter((r) => r.uid)
            .slice(0, 10);
        cache.set(q, { at: Date.now(), rows });
    } catch (_) {
        return [];
    }
    return rows;
}

/** Merge local + Clerk rows: local wins on uid conflicts, friends first. */
export function mergeDirectory(localRows, clerkRows, friendUids = []) {
    const friends = new Set(Array.isArray(friendUids) ? friendUids : []);
    const seen = new Set();
    const out = [];
    for (const r of [...(localRows || []), ...(clerkRows || [])]) {
        if (!r || !r.uid || seen.has(r.uid)) continue;
        seen.add(r.uid);
        out.push({ uid: r.uid, name: r.name || 'Player', img: r.img || null, friend: friends.has(r.uid) });
        if (out.length >= 20) break;
    }
    return out;
}
