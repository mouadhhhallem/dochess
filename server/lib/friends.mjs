/**
 * server/lib/friends.mjs — friends, presence, notifications, rank, hall.
 *
 * Single-process in-memory store (same deployment caveat as the rate-limit
 * fallback: one node process; scale-out needs shared state). Clients mirror
 * everything device-local, so the site works fully without the API.
 *
 * Friendship is mutual edges: A lists B AND B lists A => confirmed.
 * A one-sided edge is a pending request (inbound for the other side).
 * Names come from the edges themselves — no user enumeration exists.
 *
 *   addEdge(uid, {uid, name}) / removeEdge(uid, friendUid) / edges(uid)
 *   heartbeat(uid, name) / status(uids[]) — 90 s TTL presence
 *   notify(toUid, {kind, title, body}) / inbox(uid) / ack(uid, ids)
 *   publishRank(uid, name, cat, rating) / rank(cat, uid, friendUids)
 *   hallJoin(uid, name) / hall() — first-1000 registry
 */
import { randomBytes } from 'node:crypto';

const PRESENCE_TTL_MS = 90000;
const INBOX_CAP = 50;
const HALL_CAP = 1000;

function cleanUid(v) {
    if (typeof v === 'string' && /^[\w-]{1,64}$/.test(v)) return v;
    return null;
}

function cleanImg(v) {
    if (typeof v === 'string' && /^https:/.test(v)) return v.slice(0, 2048);
    return null;
}

function cleanName(v) {
    if (typeof v !== 'string') return 'Player';
    return v.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 24) || 'Player';
}

function cleanCat(v) {
    if (typeof v === 'string' && /^[a-z0-9-]{1,16}$/.test(v)) return v;
    return 'blitz';
}

function cleanElo(v) {
    const n = typeof v === 'number' ? Math.round(v) : parseInt(v, 10);
    if (!Number.isFinite(n)) return 800;
    return Math.max(100, Math.min(4000, n));
}

export function createFriendStore() {
    // uid -> Map<friendUid, {uid, name, since}>
    const edges = new Map();
    // uid -> {name, at}
    const presence = new Map();
    // Public directory: uid -> {name, img, at} (searchable, min 3 letters).
    const directory = new Map();
    function register(uid, name, img) {
        uid = cleanUid(uid);
        if (!uid) return;
        directory.set(uid, { name: cleanName(name), img: cleanImg(img), at: Date.now() });
    }
    // uid -> [{id, kind, title, body, from, at, read}]
    const inboxes = new Map();
    // `${uid}:${cat}` -> {uid, name, cat, rating, at}
    const ranks = new Map();
    // [{uid, name, at}] in join order
    const hallRows = [];
    const hallSeen = new Set();

    const of = (uid) => {
        let m = edges.get(uid);
        if (!m) { m = new Map(); edges.set(uid, m); }
        return m;
    };

    function addEdge(uid, friend) {
        uid = cleanUid(uid);
        const fuid = cleanUid(friend && friend.uid);
        if (!uid || !fuid || uid === fuid) return null;
        const rec = { uid: fuid, name: cleanName(friend.name), img: cleanImg(friend.img), since: Date.now() };
        const mine = of(uid);
        if (!mine.has(fuid)) mine.set(fuid, rec);
        else { mine.get(fuid).name = rec.name; if (rec.img) mine.get(fuid).img = rec.img; } // refresh display
        const theirs = of(fuid);
        const confirmed = theirs.has(uid);
        return { friend: mine.get(fuid), confirmed };
    }

    function removeEdge(uid, friendUid) {
        uid = cleanUid(uid); friendUid = cleanUid(friendUid);
        if (!uid || !friendUid) return false;
        const m = edges.get(uid);
        return m ? m.delete(friendUid) : false;
    }

    function listEdges(uid) {
        uid = cleanUid(uid);
        if (!uid) return [];
        const mine = edges.get(uid) || new Map();
        return [...mine.values()].map((f) => {
            const theirs = edges.get(f.uid);
            return { ...f, confirmed: !!(theirs && theirs.has(uid)) };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }

    function heartbeat(uid, name, img) {
        uid = cleanUid(uid);
        if (!uid) return false;
        presence.set(uid, { name: cleanName(name), at: Date.now() });
        register(uid, name, img);
        return true;
    }

    function status(uids, now = Date.now()) {
        const out = {};
        for (const u of (Array.isArray(uids) ? uids : []).slice(0, 100)) {
            const id = cleanUid(u);
            if (!id) continue;
            const p = presence.get(id);
            if (p && now - p.at <= PRESENCE_TTL_MS) out[id] = { online: true, lastSeen: p.at };
            else out[id] = { online: false, lastSeen: p ? p.at : 0 };
        }
        return out;
    }

    function notify(toUid, n = {}) {
        toUid = cleanUid(toUid);
        if (!toUid) return null;
        const kind = ['friend-request', 'friend-accept', 'game-invite', 'note', 'streak', 'rank'].includes(n.kind) ? n.kind : 'note';
        const rec = {
            id: randomBytes(8).toString('hex'),
            kind,
            title: cleanName(n.title).slice(0, 60),
            body: typeof n.body === 'string' ? n.body.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 140) : '',
            from: cleanUid(n.from) || null,
            at: Date.now(),
            read: false,
        };
        let box = inboxes.get(toUid);
        if (!box) { box = []; inboxes.set(toUid, box); }
        box.unshift(rec);
        while (box.length > INBOX_CAP) box.pop();
        return rec;
    }

    function inbox(uid) {
        uid = cleanUid(uid);
        if (!uid) return { items: [], unread: 0 };
        const box = inboxes.get(uid) || [];
        return { items: box.slice(0, INBOX_CAP), unread: box.filter((m) => !m.read).length };
    }

    function ack(uid, ids) {
        uid = cleanUid(uid);
        if (!uid) return 0;
        const box = inboxes.get(uid) || [];
        const set = new Set(Array.isArray(ids) ? ids : []);
        let n = 0;
        for (const m of box) {
            if ((set.size === 0 || set.has(m.id)) && !m.read) { m.read = true; n++; }
        }
        return n;
    }

    function publishRank(uid, name, cat, rating) {
        uid = cleanUid(uid);
        if (!uid) return null;
        cat = cleanCat(cat);
        rating = cleanElo(rating);
        const key = `${uid}:${cat}`;
        const prev = ranks.get(key);
        const rec = { uid, name: cleanName(name), cat, rating: prev ? Math.max(prev.rating, rating) : rating, at: Date.now() };
        register(uid, name, null);
        ranks.set(key, rec);
        return rec;
    }

    function rank(cat, uid, friendUids = []) {
        cat = cleanCat(cat);
        uid = cleanUid(uid);
        const rows = [...ranks.values()].filter((r) => r.cat === cat).sort((a, b) => b.rating - a.rating);
        const friends = new Set((Array.isArray(friendUids) ? friendUids : []).filter(Boolean));
        const at = rows.findIndex((r) => r.uid === uid);
        return {
            cat,
            total: rows.length,
            myRank: at >= 0 ? at + 1 : null,
            // Strangers stay anonymous: only rank + rating, no names —
            // except friends, who are named.
            board: rows.slice(0, 100).map((r, i) => friends.has(r.uid) || r.uid === uid
                ? { rank: i + 1, uid: r.uid, name: r.name, rating: r.rating, self: r.uid === uid }
                : { rank: i + 1, uid: null, name: null, rating: r.rating, self: false }),
        };
    }

    function hallJoin(uid, name) {
        uid = cleanUid(uid);
        if (!uid) return null;
        if (!hallSeen.has(uid)) {
            hallSeen.add(uid);
            if (hallRows.length < HALL_CAP) hallRows.push({ uid, name: cleanName(name), at: Date.now() });
        }
        return { member: hallSeen.has(uid), position: hallRows.findIndex((h) => h.uid === uid) + 1, total: hallRows.length };
    }

    function hall() {
        return hallRows.map((h, i) => ({ ...h, position: i + 1 }));
    }

    function lookup(q) {
        q = typeof q === 'string' ? q.trim().toLowerCase() : '';
        if (q.length < 3) return [];
        const out = [];
        for (const [uid, d] of directory) {
            if (d.name.toLowerCase().includes(q)) out.push({ uid, name: d.name, img: d.img });
            if (out.length >= 20) break;
        }
        return out;
    }

    function sweep(now = Date.now()) {
        let out = 0;
        for (const [uid, p] of presence) {
            if (now - p.at > PRESENCE_TTL_MS * 4) { presence.delete(uid); out++; }
        }
        return { presence: out };
    }

    return { addEdge, removeEdge, listEdges, heartbeat, status, notify, inbox, ack, publishRank, rank, hallJoin, hall, lookup, register, sweep };
}
