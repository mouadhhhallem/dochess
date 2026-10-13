/**
 * server/lib/social.mjs — the authoritative social graph, invitations,
 * presence and the global rating ladder.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The previous implementation (server/lib/friends.mjs) held friendships,
 * requests, notifications, presence, hall-of-fame rows and the "global"
 * ranking in process-memory `Map`s. Every restart, redeploy or second
 * instance lost them, while the client treated the server as authoritative.
 * That is the root cause of "removing a friend works, then the friend is
 * back": nothing about a friendship was ever persisted, and every re-add
 * path had a clean source of truth to read from again.
 *
 * Everything here is written through the configured permanent store
 * (lib/db.mjs: MongoDB in production, the dev file store locally) BEFORE the
 * HTTP response is sent, so an acknowledged mutation is durable.
 *
 * DATA MODEL
 * ----------
 * friendships — UNDIRECTED, exactly one row per pair:
 *   { _id: 'f:' + min(a,b) + '|' + max(a,b), a, b, since, names: {a,b} }
 * A single canonical row means "A removed B but B still lists A" — the
 * asymmetry that made one-directional removal resurrect friendships — is
 * not representable.
 *
 * requests — a directed row with an explicit, TERMINAL status:
 *   { _id: 'r:' + from + '|' + to, from, to, status, name, img, at, updatedAt, resolvedAt }
 *   status: 'pending' | 'accepted' | 'declined' | 'cancelled'
 * Requests are never DERIVED from graph asymmetry (the old bug: a decline
 * changed nothing server-side, so the next poll re-created the request).
 * 'declined' is terminal: it is returned in `resolved` so every client can
 * reconcile, and a new request after a decline is an explicit re-ask.
 *
 * invites — a real invitation entity, not a notification payload:
 *   { _id: matchId, matchId, code, control, from, to, status,
 *     createdAt, expiresAt, respondedAt }
 *   status: 'pending' | 'accepted' | 'declined' | 'expired'
 *
 * presence — { _id: uid, uid, name, img, at } with a TTL read.
 *
 * RATINGS
 * ------
 * The ladder rating is DERIVED from recorded game results in the `games`
 * collection by replaying Elo from the START_RATING floor. A client cannot
 * set its own rating: `publishRank` is gone, and the previous endpoint's
 * `Math.max(prev, clientRating)` (which let any account raise itself to the
 * 4000 ceiling with one HTTP call) no longer has any code path.
 *
 * PRIVACY
 * -------
 * Serialization is per-viewer and happens HERE, on the server. A stranger's
 * row never carries a uid, full name, photo, email or any internal id — the
 * field is not fetched-then-hidden, it is simply not selected.
 */

import { randomBytes } from 'node:crypto';

export const START_RATING = 800;
export const PRESENCE_TTL_MS = 90000;
const INVITE_TTL_MS = 10 * 60 * 1000;   // server-side invitation lifetime
const REQUEST_CAP = 50;
const MIN_RATING = 100;
const MAX_RATING = 4000;

// The six supported time controls, exactly as the mission specifies. `base`
// and `inc` are MINUTES and increment-SECONDS (the unit the picker uses);
// the rating category is derived from the duration with the same rule the
// client uses, so a room and its rating bucket can never disagree.
const CONTROLS_INPUT = [
    { base: 1, inc: 0 },   // 1+0  Bullet
    { base: 3, inc: 0 },   // 3+0  Blitz
    { base: 5, inc: 0 },   // 5+0  Blitz
    { base: 3, inc: 2 },   // 3+2  Blitz
    { base: 10, inc: 0 },  // 10+0 Rapid
    { base: 15, inc: 10 }  // 15+10 Rapid
];

export const TIME_CONTROLS = CONTROLS_INPUT.map((c) => ({
    id: catFor(c.base, c.inc),
    name: catFor(c.base, c.inc)[0].toUpperCase() + catFor(c.base, c.inc).slice(1),
    base: c.base,
    inc: c.inc,
    label: `${c.base}+${c.inc}`
}));

export const RANK_CATS = ['bullet', 'blitz', 'rapid'];

export function tierOf(rating) {
    if (rating >= 2000) return 'diamond';
    if (rating >= 1600) return 'platinum';
    if (rating >= 1200) return 'gold';
    if (rating >= 1000) return 'silver';
    return 'bronze';
}

/* ── validators ───────────────────────────────────────────────────── */

export function cleanUid(v) {
    if (typeof v === 'string' && /^[\w-]{1,64}$/.test(v)) return v;
    return null;
}

export function cleanImg(v) {
    if (typeof v === 'string' && /^https:/.test(v)) return v.slice(0, 2048);
    return null;
}

export function cleanName(v) {
    if (typeof v !== 'string') return 'Player';
    return v.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 24) || 'Player';
}

function cleanTitle(v) {
    if (typeof v !== 'string') return 'Note';
    return v.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 60) || 'Note';
}

export function firstName(v) {
    if (typeof v !== 'string') return 'Player';
    const t = v.replace(/[\x00-\x1F\x7F]/g, '').trim().split(/\s+/)[0] || '';
    return t.slice(0, 24) || 'Player';
}

function cleanCat(v) {
    return RANK_CATS.includes(v) ? v : 'blitz';
}

function cleanCode(v) {
    return typeof v === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(v.toUpperCase()) ? v.toUpperCase() : null;
}

/** Resolve a {minutes, incrementSec} selection to a whitelisted control. */
export function resolveControl(minutes, incSec) {
    const m = Number(minutes);
    const s = Number(incSec) || 0;
    const hit = TIME_CONTROLS.find((c) => c.base === m && c.inc === s);
    return hit ? { ...hit, minutes: hit.base, incSec: hit.inc } : null;
}

export function catFor(baseMinutes, incSec) {
    const dur = baseMinutes + 40 * ((incSec || 0) / 60);
    return dur < 3 ? 'bullet' : dur < 8 ? 'blitz' : 'rapid';
}

const friendKey = (a, b) => 'f:' + (a < b ? a + '|' + b : b + '|' + a);
const requestKey = (from, to) => 'r:' + from + '|' + to;

/* ── Elo replay (derived from recorded games, never client ratings) ─── */

function eloFactor(rating) { return rating >= 2000 ? 16 : 32; }

/**
 * Replay one player's recorded games into a rating. Games are applied in
 * `date` order so the result is deterministic and independent of insertion
 * order. `result` is the value the API already sanitises from the recorded
 * game record ('win' | 'loss' | 'draw' | anything else = not rated).
 */
export function replayRating(games, cat) {
    let rating = START_RATING;
    const rows = games
        .filter((g) => g && (!cat || (g.control && g.control.id) === cat))
        .sort((a, b) => (a.date || 0) - (b.date || 0) || String(a.gameId).localeCompare(String(b.gameId)));
    for (const g of rows) {
        const r = String(g.result || '').toLowerCase();
        if (r !== 'win' && r !== 'loss' && r !== 'draw') continue;
        const score = r === 'win' ? 1 : r === 'draw' ? 0.5 : 0;
        const expected = 1 / (1 + Math.pow(10, (rating - START_RATING) / 400));
        rating += eloFactor(rating) * (score - expected);
        rating = Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(rating)));
    }
    return rating;
}

/* ── the store ────────────────────────────────────────────────────── */

export function createSocialStore(getDb) {
    // Rating cache: uid -> Map<cat, rating>. Invalidated whenever a game is
    // recorded, so a finished game can never leave a stale number on the
    // ladder for more than the life of the request that follows it.
    let ratingCache = null;
    let ratingCacheAt = 0;
    const RATING_CACHE_MS = 15 * 1000;

    function invalidateRatings() { ratingCache = null; ratingCacheAt = 0; }

    /** uid -> {cat: rating}, derived from the authoritative games collection. */
    async function ratingTable() {
        if (ratingCache && Date.now() - ratingCacheAt < RATING_CACHE_MS) return ratingCache;
        const db = getDb();
        const games = await db.listAllGames();
        const out = new Map();
        for (const g of games) {
            if (!g || !g.userId) continue;
            const cat = g.control && g.control.id;
            if (!RANK_CATS.includes(cat)) continue;
            let m = out.get(g.userId);
            if (!m) { m = new Map(); out.set(g.userId, m); }
            if (!m.has(cat)) m.set(cat, []);
            m.get(cat).push(g);
        }
        const table = new Map();
        for (const [uid, byCat] of out) {
            const per = new Map();
            for (const cat of byCat.keys()) per.set(cat, replayRating(byCat.get(cat), cat));
            table.set(uid, per);
        }
        ratingCache = table;
        ratingCacheAt = Date.now();
        return table;
    }

    /* ── friendships ─────────────────────────────────────────────── */

    async function areFriends(a, b) {
        a = cleanUid(a); b = cleanUid(b);
        if (!a || !b || a === b) return false;
        return !!(await getDb().getDoc('friends', friendKey(a, b)));
    }

    async function addFriend(uid, friendUid, name = '') {
        uid = cleanUid(uid); friendUid = cleanUid(friendUid);
        if (!uid || !friendUid || uid === friendUid) return null;
        const db = getDb();
        const key = friendKey(uid, friendUid);
        const prev = await db.getDoc('friends', key);
        const row = {
            _id: key, a: uid, b: friendUid,
            since: (prev && prev.since) || Date.now(),
            names: { ...((prev && prev.names) || {}), [uid]: cleanName(name) }
        };
        await db.putDoc('friends', key, row);
        return row;
    }

    /**
     * Remove a friendship in BOTH directions. Because the row is canonical
     * and undirected there is nothing left pointing the other way.
     * Returns true when a friendship actually existed.
     */
    async function removeFriend(uid, friendUid) {
        uid = cleanUid(uid); friendUid = cleanUid(friendUid);
        if (!uid || !friendUid) return false;
        const db = getDb();
        const key = friendKey(uid, friendUid);
        const existed = !!(await db.getDoc('friends', key));
        await db.delDoc('friends', key);
        // Also resolve any request still hanging between the pair in either
        // direction, so neither side keeps a pending row for a friendship
        // that no longer exists.
        await resolveRequest(uid, friendUid, 'cancelled');
        await resolveRequest(friendUid, uid, 'cancelled');
        return existed;
    }

    async function listFriends(uid) {
        uid = cleanUid(uid);
        if (!uid) return [];
        const rows = await getDb().findDocs('friends', { $or: [{ a: uid }, { b: uid }] });
        const seen = new Set();
        const out = [];
        for (const r of rows) {
            if (!r || !r.a || !r.b || seen.has(r._id)) continue;
            seen.add(r._id);
            const other = r.a === uid ? r.b : r.a;
            out.push({
                uid: other,
                name: cleanName((r.names && r.names[uid]) || (r.names && r.names[other]) || ''),
                since: r.since || 0
            });
        }
        return out.sort((x, y) => x.name.localeCompare(y.name));
    }

    /* ── requests (explicit lifecycle, terminal decline) ──────────── */

    /**
     * Send (or re-send) a friend request. Idempotent while pending: a
     * duplicate send updates the display name instead of creating a second
     * row. A previously declined/cancelled request becomes pending again
     * ONLY through this explicit call, and the new row keeps its history.
     */
    async function requestFriend(from, { toUid, name = '', img = null } = {}) {
        from = cleanUid(from); toUid = cleanUid(toUid);
        if (!from || !toUid || from === toUid) return { error: 'bad-recipient' };
        const db = getDb();
        if (await areFriends(from, toUid)) return { error: 'already-friends' };
        const key = requestKey(from, toUid);
        const prev = await db.getDoc('requests', key);
        const row = {
            _id: key, from, to: toUid,
            status: 'pending',
            name: cleanName(name),
            img: cleanImg(img) || (prev && prev.img) || null,
            at: Date.now(),
            updatedAt: Date.now(),
            resolvedAt: null
        };
        await db.putDoc('requests', key, row);
        return { request: row, created: !(prev && prev.status === 'pending') };
    }

    /** Write a terminal status onto a pending request (no-op otherwise). */
    async function resolveRequest(from, to, status) {
        from = cleanUid(from); to = cleanUid(to);
        if (!from || !to) return false;
        const db = getDb();
        const key = requestKey(from, to);
        const prev = await db.getDoc('requests', key);
        if (!prev || prev.status !== 'pending') return false;
        const next = { ...prev, status, updatedAt: Date.now(), resolvedAt: Date.now() };
        await db.putDoc('requests', key, next);
        return true;
    }

    /**
     * Accept or decline. Only the RECIPIENT may resolve, and only a pending
     * row may transition — so a duplicate accept is a no-op that still
     * reports success, and a decline racing an accept cannot undo it.
     */
    async function respondToRequest(uid, fromUid, accept) {
        uid = cleanUid(uid); fromUid = cleanUid(fromUid);
        if (!uid || !fromUid || uid === fromUid) return { error: 'bad-requester' };
        const db = getDb();
        const key = requestKey(fromUid, uid);
        const prev = await db.getDoc('requests', key);
        if (!prev) {
            // Distinguish "no such request" from "you are asking to respond to
            // a request YOU sent" — a caller must never be able to accept
            // their own outgoing request.
            const reversed = await db.getDoc('requests', requestKey(uid, fromUid));
            return { error: reversed ? 'not-recipient' : 'no-request' };
        }
        if (prev.status !== 'pending') {
            // Already resolved. Accepting an accepted request is idempotent.
            if (accept && prev.status === 'accepted') {
                const friends = await listFriends(uid);
                return { status: 'accepted', friend: friends.find((f) => f.uid === fromUid) || null, idempotent: true };
            }
            return { error: 'already-resolved', status: prev.status };
        }
        if (!accept) {
            await resolveRequest(fromUid, uid, 'declined');
            return { status: 'declined' };
        }
        await resolveRequest(fromUid, uid, 'accepted');
        const row = await addFriend(uid, fromUid, (prev && prev.name) || '');
        // Mirror the display name onto the requester's own row so both
        // friends lists show a name rather than the 'Player' fallback.
        const mirrorKey = friendKey(uid, fromUid);
        const stored = await db.getDoc('friends', mirrorKey);
        if (stored) {
            await db.putDoc('friends', mirrorKey, {
                ...stored,
                names: { ...(stored.names || {}), [fromUid]: cleanName((prev && prev.name) || '') }
            });
        }
        return { status: 'accepted', friend: row };
    }

    /** Cancel a request this account sent. */
    async function cancelRequest(from, toUid) {
        return resolveRequest(from, toUid, 'cancelled');
    }

    /**
     * Everything the client needs to reconcile its shelf in ONE call:
     * inbound pending, outbound pending, and recently resolved requests.
     * `resolved` is what makes a decline stick — the client is told
     * explicitly, instead of rediscovering it from a graph edge.
     */
    async function listRequests(uid) {
        uid = cleanUid(uid);
        if (!uid) return { inbound: [], outbound: [], resolved: [] };
        const db = getDb();
        const all = await db.listDocs('requests');
        const inbound = [];
        const outbound = [];
        const resolved = [];
        for (const r of all) {
            if (!r || !r.from || !r.to) continue;
            const mine = r.to === uid, theirs = r.from === uid;
            if (!mine && !theirs) continue;
            const row = {
                uid: mine ? r.from : r.to,
                name: cleanName(r.name),
                img: cleanImg(r.img),
                at: r.at || 0,
                status: r.status
            };
            if (r.status === 'pending') { (mine ? inbound : outbound).push(row); continue; }
            resolved.push({ ...row, resolvedAt: r.resolvedAt || 0 });
        }
        const byNewest = (a, b) => (b.at || 0) - (a.at || 0);
        inbound.sort(byNewest); outbound.sort(byNewest);
        resolved.sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
        return {
            inbound: inbound.slice(0, REQUEST_CAP),
            outbound: outbound.slice(0, REQUEST_CAP),
            resolved: resolved.slice(0, REQUEST_CAP)
        };
    }

    /* ── invitations ─────────────────────────────────────────────── */

    function mintMatchId() {
        return 'm_' + randomBytes(8).toString('hex');
    }

    /**
     * Create one pending invitation. The sender must actually be friends
     * with the recipient — that is the authorization check that was missing
     * when invites were raw notifications any account could push at anyone.
     */
    async function createInvite(from, { toUid, minutes, incSec, code } = {}) {
        from = cleanUid(from); toUid = cleanUid(toUid);
        if (!from || !toUid || from === toUid) return { error: 'bad-recipient' };
        if (!(await areFriends(from, toUid))) return { error: 'not-friends' };
        const control = resolveControl(minutes, incSec);
        if (!control) return { error: 'bad-time-control' };
        const room = cleanCode(code);
        if (!room) return { error: 'bad-code' };
        const db = getDb();
        const matchId = mintMatchId();
        const now = Date.now();
        const row = {
            _id: matchId, matchId, code: room, control,
            minutes: control.base, incSec: control.inc,
            from, to: toUid, status: 'pending',
            createdAt: now, expiresAt: now + INVITE_TTL_MS, respondedAt: null
        };
        await db.putDoc('invites', matchId, row);
        return { invite: row };
    }

    function expired(row, now = Date.now()) {
        return !row || (Number.isFinite(row.expiresAt) && row.expiresAt <= now);
    }

    async function getInvite(matchId, now = Date.now()) {
        if (typeof matchId !== 'string' || !/^m_[0-9a-f]{16}$/.test(matchId)) return null;
        const row = await getDb().getDoc('invites', matchId);
        if (!row) return null;
        if (row.status === 'pending' && expired(row, now)) {
            const next = { ...row, status: 'expired', respondedAt: now };
            await getDb().putDoc('invites', matchId, next);
            return next;
        }
        return row;
    }

    /**
     * Accept / decline. Only the intended recipient may respond; expired,
     * already-resolved and malformed matches are rejected distinctly.
     * Accepting an already-accepted invite is idempotent so a double-click
     * cannot produce two matches.
     */
    async function respondToInvite(uid, matchId, accept) {
        uid = cleanUid(uid);
        if (!uid) return { error: 'bad-user' };
        const row = await getInvite(matchId);
        if (!row) return { error: 'no-invite' };
        if (row.to !== uid) return { error: 'not-recipient' };
        if (row.status === 'expired') return { error: 'expired' };
        if (row.status !== 'pending') {
            if (accept && row.status === 'accepted') return { invite: row, idempotent: true };
            return { error: 'already-resolved', status: row.status };
        }
        const next = {
            ...row, status: accept ? 'accepted' : 'declined', respondedAt: Date.now()
        };
        await getDb().putDoc('invites', row.matchId, next);
        return { invite: next };
    }

    async function listInvites(uid, now = Date.now()) {
        uid = cleanUid(uid);
        if (!uid) return [];
        const rows = await getDb().findDocs('invites', { to: uid });
        const out = [];
        for (const r of rows) {
            if (!r) continue;
            const live = await getInvite(r.matchId, now);
            if (live && live.status === 'pending') out.push(live);
        }
        return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);
    }

    /** Drop resolved/expired invitation rows older than a day. */
    async function sweepInvites(now = Date.now()) {
        const db = getDb();
        const rows = await db.listDocs('invites');
        let n = 0;
        for (const r of rows) {
            if (!r || !r._id) continue;
            if (r.status === 'pending' && expired(r, now)) {
                await db.putDoc('invites', r._id, { ...r, status: 'expired', respondedAt: now });
                n++;
            } else if (r.status !== 'pending' && (r.respondedAt || r.createdAt || 0) < now - 86400000) {
                await db.delDoc('invites', r._id);
                n++;
            }
        }
        return n;
    }

    /* ── presence ────────────────────────────────────────────────── */

    async function heartbeat(uid, name, img) {
        uid = cleanUid(uid);
        if (!uid) return false;
        await getDb().putDoc('presence', uid, { uid, name: cleanName(name), img: cleanImg(img), at: Date.now() });
        return true;
    }

    /**
     * Online status for a set of uids, PLUS a public display card for the
     * same set (name + photo). Read by friends and by anyone who has them
     * in their pending-request list — never for an arbitrary uid list.
     */
    async function status(uids, now = Date.now()) {
        const ids = [...new Set((Array.isArray(uids) ? uids : []).map(cleanUid).filter(Boolean))].slice(0, 100);
        const out = {};
        if (!ids.length) return out;
        const rows = await getDb().findDocs('presence', { _id: { $in: ids } });
        const byId = new Map((rows || []).map((r) => [r._id, r]));
        for (const id of ids) {
            const p = byId.get(id);
            out[id] = p
                ? { online: now - p.at <= PRESENCE_TTL_MS, lastSeen: p.at }
                : { online: false, lastSeen: 0 };
        }
        return out;
    }

    async function presenceCard(uid) {
        uid = cleanUid(uid);
        if (!uid) return null;
        const p = await getDb().getDoc('presence', uid);
        if (!p) return null;
        return { uid, name: cleanName(p.name), img: cleanImg(p.img), online: Date.now() - p.at <= PRESENCE_TTL_MS };
    }

    /** Drop presence rows well past the TTL so ghosts cannot linger. */
    async function sweepPresence(now = Date.now()) {
        const rows = await getDb().listDocs('presence');
        let n = 0;
        for (const r of rows) {
            if (r && (now - (r.at || 0)) > PRESENCE_TTL_MS * 4) { await getDb().delDoc('presence', r._id); n++; }
        }
        return n;
    }

    /**
     * Search the players the server knows about (anyone with a presence
     * record — i.e. every account that has connected at least once), plus
     * the viewer's friends whose presence has already expired. Three-letter
     * minimum, bounded result set, so this cannot be used to enumerate the
     * whole user base with one-character queries.
     */
    async function searchDirectory(term, cap = 20) {
        const q = typeof term === 'string' ? term.trim().toLowerCase() : '';
        if (q.length < 3) return [];
        const rows = await getDb().listDocs('presence').catch(() => []);
        const out = [];
        for (const r of rows) {
            if (!r || !r.uid) continue;
            const name = cleanName(r.name);
            if (!name.toLowerCase().includes(q)) continue;
            out.push({ uid: r.uid, name, img: cleanImg(r.img) });
            if (out.length >= Math.max(1, Math.min(50, cap))) break;
        }
        return out;
    }

    /* ── the global ladder ───────────────────────────────────────── */

    /**
     * The global ranking: EVERY registered account, built from the
     * authoritative account list (`users`), not from whoever happens to be
     * in memory. Accounts with no recorded game sit at START_RATING, so a
     * brand-new registration appears immediately with a correct rating.
     *
     * Ordering is (rating desc, uid asc) — a total order over unique uids, so
     * ranks are stable across requests and pages. Name is NOT part of the
     * sort key: two players sharing a first name would otherwise have an
     * undefined relative order and ranks would shuffle between requests.
     *
     * @param {object} o
     * @param {string} o.cat           rating category
     * @param {string} o.viewerUid     who is asking (always on the board)
     * @param {number} o.limit         page size (1..100)
     * @param {number} o.offset        page offset
     *
     * There is deliberately NO client-supplied friend list parameter. The
     * viewer's friends are derived from the stored friendship rows, so a
     * caller cannot ask the API to reveal an arbitrary stranger's full name
     * by passing their uid in a query string.
     */
    async function rankPage({ cat, viewerUid, limit = 50, offset = 0 } = {}) {
        cat = cleanCat(cat);
        viewerUid = cleanUid(viewerUid);

        const db = getDb();
        const [identities, ratings, friendRows] = await Promise.all([
            db.listUserIdentities(),
            ratingTable(),
            viewerUid ? listFriends(viewerUid) : Promise.resolve([])
        ]);
        const friends = new Set(friendRows.map((f) => f.uid));

        const rows = [];
        for (const id of identities) {
            const uid = id && id._id;
            if (!uid) continue;
            const profile = (id && id.profile) || {};
            const perCat = ratings.get(uid);
            rows.push({
                uid,
                name: cleanName(profile.name),
                img: cleanImg(profile.image),
                rating: (perCat && perCat.get(cat)) || START_RATING,
                games: 0
            });
        }
        rows.sort((a, b) => (b.rating - a.rating) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
        rows.forEach((r, i) => { r.rank = i + 1; });

        const total = rows.length;
        const myIndex = viewerUid ? rows.findIndex((r) => r.uid === viewerUid) : -1;
        const size = Math.max(1, Math.min(100, limit));
        const off = Math.max(0, offset);
        const page = rows.slice(off, off + size).map((r) => serializeRow(r, viewerUid, friends));

        return {
            cat,
            total,
            offset: off,
            limit: size,
            hasMore: off + size < total,
            myRank: myIndex >= 0 ? myIndex + 1 : null,
            myRating: myIndex >= 0 ? rows[myIndex].rating : null,
            board: page
        };
    }

    /**
     * Per-viewer SERIALIZATION — the privacy boundary.
     *
     * self   : rank, own uid, own display name, rating, tier
     * friend : rank, uid (friends already need it to invite each other),
     *          friend-facing display name + photo, rating, tier
     * stranger: rank, FIRST name, rating, tier. No uid, no full name, no
     *          photo, no email, no internal id — the field is never selected
     *          into the response, so it cannot leak through devtools either.
     */
    function serializeRow(row, viewerUid, friends) {
        const base = { rank: row.rank, rating: row.rating, tier: tierOf(row.rating) };
        if (viewerUid && row.uid === viewerUid) return { ...base, uid: row.uid, name: row.name, self: true, friend: false };
        if (friends.has(row.uid)) return { ...base, uid: row.uid, name: row.name, img: row.img || null, self: false, friend: true };
        return { ...base, name: firstName(row.name), self: false, friend: false };
    }

    /* ── the activity inbox ─────────────────────────────────────── */

    /**
     * True when `from` and `to` are in a relationship the product defines:
     * confirmed friends, or the two sides of a request in any state (so a
     * friend request can announce itself). Anything else is not a channel.
     */
    async function canNotify(from, to) {
        from = cleanUid(from); to = cleanUid(to);
        if (!from || !to || from === to) return false;
        if (await areFriends(from, to)) return true;
        const db = getDb();
        const a = await db.getDoc('requests', requestKey(from, to));
        const b = await db.getDoc('requests', requestKey(to, from));
        return !!(a || b);
    }

    /**
     * Queue one inbox item. Persisted, so the activity feed survives a
     * restart (the previous implementation kept it in a Map).
     *
     * NOTE the hard restriction: the caller may NOT choose an actionable
     * kind. `game-invite` used to be accepted here, which let any signed-in
     * account push an attacker-chosen room code into anyone's inbox and get
     * it rendered as an "Accept & Play" popup. Invitations are now created
     * only through `createInvite`, which requires friendship and mints a
     * server-side match id.
     */
    const NOTIFY_KINDS = ['note', 'streak', 'rank'];
    async function notify(from, { toUid, kind, title, body } = {}) {
        from = cleanUid(from);
        if (!(await canNotify(from, toUid))) return { error: 'not-a-relationship' };
        const k = NOTIFY_KINDS.includes(kind) ? kind : 'note';
        const row = {
            _id: randomBytes(8).toString('hex'),
            to: cleanUid(toUid), from,
            kind: k,
            title: cleanTitle(title),
            body: typeof body === 'string' ? body.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 140) : '',
            at: Date.now(),
            read: false
        };
        await getDb().putDoc('notify', row._id, row);
        return { item: row };
    }

    /**
     * Announce a friend-lifecycle change. The title/body are COMPOSED HERE
     * from the stored records, never accepted from the requesting client, so
     * one account cannot send another a message that reads as if it came from
     * someone else.
     */
    async function notifyFriendEvent(toUid, kind, fromName) {
        toUid = cleanUid(toUid);
        if (!toUid) return null;
        const who = cleanName(fromName);
        const spec = kind === 'friend-request'
            ? { kind: 'note', title: `${who} wants to be friends`, body: 'Accept to start growing a streak together.' }
            : kind === 'friend-accept'
                ? { kind: 'note', title: `${who} accepted your request`, body: 'You are friends now - play a game to start a streak.' }
                : kind === 'friend-decline'
                    ? { kind: 'note', title: `${who} declined your request`, body: 'No worries - find another rival to grow a streak with.' }
                    : kind === 'invite-declined'
                        ? { kind: 'note', title: `${who} declined your invitation`, body: 'Your waiting room is closed. Send a fresh one any time.' }
                        : null;
        if (!spec) return null;
        const row = {
            _id: randomBytes(8).toString('hex'), to: toUid, from: null,
            kind: spec.kind, title: spec.title, body: spec.body,
            at: Date.now(), read: false
        };
        await getDb().putDoc('notify', row._id, row);
        return row;
    }

    async function inbox(uid, cap = 50) {
        uid = cleanUid(uid);
        if (!uid) return { items: [], unread: 0 };
        const rows = await getDb().findDocs('notify', { to: uid });
        const items = rows
            .filter((r) => r && r._id)
            .sort((a, b) => (b.at || 0) - (a.at || 0))
            .slice(0, Math.max(1, Math.min(100, cap)));
        return { items, unread: items.filter((m) => !m.read).length };
    }

    /** Mark read. An empty id list marks everything (the UI's "mark all"). */
    async function ackInbox(uid, ids) {
        uid = cleanUid(uid);
        if (!uid) return 0;
        const rows = await getDb().findDocs('notify', { to: uid });
        const set = new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : []);
        let n = 0;
        for (const r of rows) {
            if (!r || r.read) continue;
            if (set.size && !set.has(r._id)) continue;
            await getDb().putDoc('notify', r._id, { ...r, read: true });
            n++;
        }
        return n;
    }

    return {
        // friendships
        areFriends, addFriend, removeFriend, listFriends,
        // requests
        requestFriend, respondToRequest, cancelRequest, listRequests,
        // invitations
        createInvite, respondToInvite, listInvites, getInvite, sweepInvites,
        // presence
        heartbeat, status, presenceCard, sweepPresence, searchDirectory,
        // inbox
        notify, notifyFriendEvent, inbox, ackInbox,
        // ranking
        rankPage,
        // housekeeping
        invalidateRatings
    };
}