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
 * Serialization is per-viewer and happens HERE, on the server. On the LADDER
 * a stranger's row never carries a uid, full name, photo, email or any
 * internal id — the field is not fetched-then-hidden, it is simply not
 * selected. The HALL OF FAME is the deliberate exception, by explicit owner
 * decision: its rows carry full display names + public avatars for every
 * signed-in viewer (no uid, no email). See hallRow.
 */

import { randomBytes } from 'node:crypto';

export const START_RATING = 800;
export const HALL_CAP = 1000; // the hall of fame lists the first 1000 accounts by rating
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
    // Rapid is the game's main rating: the default ladder, hall and profile
    // category everywhere. Bullet and blitz are one tap away, never mixed in.
    return RANK_CATS.includes(v) ? v : 'rapid';
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
        const nm = cleanName(name);
        const row = {
            _id: key, a: uid, b: friendUid,
            since: (prev && prev.since) || Date.now(),
            // Self-keyed, and never the 'Player' fallback: an unknown name
            // is an absent key, so resolution can fall through to fresher
            // sources instead of locking in a placeholder.
            names: { ...((prev && prev.names) || {}), ...((nm && nm !== 'Player') ? { [uid]: nm } : {}) }
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
            out.push({ uid: other, _names: (r.names && typeof r.names === 'object') ? r.names : {}, since: r.since || 0 });
        }
        // Photos ride along from the account profile (kept fresh by every
        // heartbeat) with presence as fallback, so a friend's face survives
        // refreshes and shows on every screen without a second request.
        // Bounded: two indexed reads per friend.
        //
        // Names resolve through the same documents, in order, skipping the
        // 'Player' placeholder everywhere:
        //   1. names[other] — the friend's own asserted name (self-keyed),
        //      UNLESS the row is mirror-damaged (see below);
        //   2. the friend's account profile (heartbeat-kept);
        //   3. the friend's live presence row.
        // There is deliberately NO names[uid] fallback: no flow ever stored
        // the requester's view there — the old mirror wrote the ACCEPTER's
        // name under both keys, which is exactly the "my friend shows as
        // me" bug. A damaged row is detectable (identical value under both
        // keys) and is distrusted in favour of profile/presence, which heals
        // it without a migration. Unknown names stay 'Player' instead of
        // locking in a wrong one.
        const db = getDb();
        const realName = (v) => {
            const n = cleanName(v || '');
            return (n && n !== 'Player') ? n : '';
        };
        for (const f of out) {
            const other = f.uid;
            const legacy = f._names || {};
            // Mirror damage is detectable: the old code wrote the accepter's
            // name under BOTH keys, so one distinct value across 2+ keys
            // means the map is untrustworthy (it shows each side their own
            // name). New rows have distinct values (or a single self-keyed
            // entry, which can only ever be read by the OTHER side).
            const distinct = [...new Set(Object.values(legacy).map(realName).filter(Boolean))];
            const damaged = Object.keys(legacy).length >= 2 && distinct.length <= 1;
            const asserted = damaged ? '' : realName(legacy[other]);
            try {
                const [u, p] = await Promise.all([
                    db.getUser(other).catch(() => null),
                    db.getDoc('presence', other).catch(() => null),
                ]);
                const fromProfile = realName(u && u.profile && u.profile.name);
                const fromPresence = realName(p && p.name);
                f.name = asserted || fromProfile || fromPresence || 'Player';
                f.img = cleanImg((u && u.profile && u.profile.image) || (p && p.img)) || null;
            } catch (_) { f.name = asserted || 'Player'; f.img = null; }
            delete f._names;
        }
        out.sort((x, y) => (x.name || '').localeCompare(y.name || ''));
        // Durable streak state rides along so every device converges on the
        // same flame (the client unions the day map with its optimistic
        // stamps and takes max(local run, server count)). Bounded: the last
        // 120 days per friend for the week dots; the exact count covers runs
        // longer than the window.
        const cutoff = dayKeyUTC(Date.now() - 120 * 86400000);
        for (const f of out) {
            try {
                const st = await pairStreak(uid, f.uid);
                if (st) {
                    const days = {};
                    for (const [k, v] of Object.entries(st.days || {})) {
                        if (k >= cutoff) days[k] = v;
                    }
                    f.days = days; f.streakCount = st.count; f.streakBest = st.best;
                }
            } catch (_) {}
        }
        return out;
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
     *
     * Names are stored SELF-keyed: names[X] is X's own display name. (An
     * older build mirrored the requester's VIEW of the accepter under the
     * requester's key, so the accepter's own list showed their own name —
     * the "my friend shows as me" bug. listFriends resolves with a
     * fallback chain that heals those rows without a migration.)
     */
    async function respondToRequest(uid, fromUid, accept, self = {}) {
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
        // Self-keyed names: the accepter's own name first (their live
        // assertion wins, the requester's stale view is the fallback), then
        // the requester's own name from their account profile or presence.
        const accepterName = cleanName((self && self.name) || (prev && prev.name) || '');
        let requesterName = '';
        try {
            const [udoc, pres] = await Promise.all([
                db.getUser(fromUid).catch(() => null),
                db.getDoc('presence', fromUid).catch(() => null),
            ]);
            requesterName = cleanName((udoc && udoc.profile && udoc.profile.name) || (pres && pres.name) || '');
        } catch (_) {}
        const names = {};
        if (accepterName && accepterName !== 'Player') names[uid] = accepterName;
        else if (prev && prev.name) names[uid] = cleanName(prev.name);
        if (requesterName && requesterName !== 'Player') names[fromUid] = requesterName;
        const row = await addFriend(uid, fromUid, '');
        const stored = await db.getDoc('friends', friendKey(uid, fromUid));
        if (stored) {
            await db.putDoc('friends', friendKey(uid, fromUid), {
                ...stored,
                names: { ...((stored && stored.names) || {}), ...names }
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

    /**
     * Invitations THIS account sent, newest first — pending AND recently
     * resolved. The sender polls these to learn the moment the recipient
     * accepts, declines or lets the invite expire, so both players can land
     * on the same board without the sender manually visiting the Online
     * page. Only the sender's own rows are ever returned.
     */
    async function listSentInvites(uid, now = Date.now()) {
        uid = cleanUid(uid);
        if (!uid) return [];
        const rows = await getDb().findDocs('invites', { from: uid });
        const out = [];
        for (const r of rows) {
            if (!r || !r.matchId) continue;
            const live = await getInvite(r.matchId, now);
            if (live) out.push(live);
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

    /* ── friend streaks (durable, shared) ─────────────────────────── */

    /**
     * WHY SERVER-SIDE: day stamps used to live only in each browser's shelf.
     * A refresh before the shelf reloaded, an account shelf swap, or a second
     * device meant "played yesterday, streak 0 today". The server now stamps
     * every recorded friend game for BOTH players from EITHER player's game
     * record, and the snapshot carries the day map back, so all devices
     * converge on the same flame.
     *
     * streaks: { _id: 's:min|max', a, b, days: { 'YYYY-MM-DD': games }, best }
     * One game together in a calendar day (UTC) = one streak day. A second
     * game the same day does not add a day — the streak can only ever grow
     * by one per day, which is what makes "1 game, still streak 1" hold.
     */
    const STREAK_XP = [[365, 1000], [100, 400], [30, 150], [7, 50]];
    const GAME_XP = { win: 20, draw: 10, loss: 5 };
    const WINSTREAK_XP = [[20, 250], [10, 100], [5, 40], [3, 15]];
    const PUZZLE_XP = 10;
    const PUZZLE_ID_CAP = 2000;

    function dayKeyUTC(t) {
        const d = new Date(t);
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
    }

    /** Current run length over a {dayKey: count} map (UTC, today-anchored). */
    function streakRun(days, now = Date.now()) {
        if (!days || typeof days !== 'object') return 0;
        const has = (back) => !!days[dayKeyUTC(now - back * 86400000)];
        let cursor = has(0) ? 0 : (has(1) ? 1 : -1);
        if (cursor < 0) return 0;
        let n = 0;
        for (let back = cursor; ; back++) {
            if (has(back)) n++;
            else break;
        }
        return n;
    }

    const streakKey = (a, b) => 's:' + (a < b ? a + '|' + b : b + '|' + a);

    /**
     * Stamp one shared day for a friend pair. Returns the new {count, best}
     * plus any milestone just crossed (each milestone pays once per streak:
     * `paid` tracks the highest milestone already awarded for the live run
     * and resets when the run breaks).
     */
    async function stampStreakDay(a, b, at = Date.now()) {
        a = cleanUid(a); b = cleanUid(b);
        if (!a || !b || a === b) return null;
        const db = getDb();
        const key = streakKey(a, b);
        const prev = (await db.getDoc('streaks', key)) || { _id: key, a, b, days: {}, best: 0, paid: 0 };
        const days = { ...(prev.days || {}) };
        const dk = dayKeyUTC(at);
        days[dk] = (days[dk] || 0) + 1;
        // Prune ancient days; the streak math only looks backwards day by day.
        const keys = Object.keys(days).sort();
        while (keys.length > 400) delete days[keys.shift()];
        let count = streakRun(days, at);
        // A stamp for an OLD day (late-arriving record) must not resurrect a
        // dead run: if the run ending today is 0 but history says otherwise,
        // keep the stored best, don't invent.
        const best = Math.max(prev.best || 0, count);
        let crossed = [];
        let paid = prev.paid || 0;
        if (count === 0) {
            paid = 0;
        } else {
            for (const [miles, amount] of STREAK_XP.slice().reverse()) {
                if (count >= miles && miles > paid) {
                    crossed.push({ miles, amount });
                    paid = Math.max(paid, miles);
                }
            }
        }
        await db.putDoc('streaks', key, { _id: key, a, b, days, best, paid, updatedAt: Date.now() });
        return { count, best, crossed };
    }

    async function pairStreak(a, b) {
        a = cleanUid(a); b = cleanUid(b);
        if (!a || !b) return null;
        const row = await getDb().getDoc('streaks', streakKey(a, b));
        if (!row) return null;
        return { days: row.days || {}, best: row.best || 0, count: streakRun(row.days || {}) };
    }

    /* ── experience points (one ledger, fixed amounts) ─────────────── */

    /**
     * xp: { _id: uid, total, games, puzzles, streaks }
     * Every amount is fixed server-side. Clients report EVENTS (a finished
     * game, a solved puzzle id), never numbers — so there is no knob to turn
     * for free XP. Game XP is granted only when the record is first stored
     * (retries are idempotent and pay nothing twice).
     */
    async function getXp(uid) {
        uid = cleanUid(uid);
        if (!uid) return { total: 0, games: 0, puzzles: 0, streaks: 0 };
        const row = await getDb().getDoc('xp', uid);
        if (!row) return { total: 0, games: 0, puzzles: 0, streaks: 0 };
        return {
            total: row.total || 0, games: row.games || 0,
            puzzles: row.puzzles || 0, streaks: row.streaks || 0,
        };
    }

    async function addXp(uid, bucket, amount) {
        uid = cleanUid(uid);
        amount = Math.max(0, Math.min(10000, Math.round(Number(amount) || 0)));
        if (!uid || !amount || !['games', 'puzzles', 'streaks'].includes(bucket)) return null;
        const db = getDb();
        const prev = (await db.getDoc('xp', uid)) || { _id: uid, total: 0, games: 0, puzzles: 0, streaks: 0 };
        const next = {
            ...prev, _id: uid,
            total: (prev.total || 0) + amount,
            [bucket]: (prev[bucket] || 0) + amount,
            updatedAt: Date.now(),
        };
        await db.putDoc('xp', uid, next);
        return { gained: amount, total: next.total };
    }

    /**
     * The single entry point for a freshly STORED game record. Stamps the
     * shared friend streak (either player's copy stamps both sides), pays
     * per-result game XP, and advances the winner's win streak with its own
     * milestones. Never pays twice: callers pass the insert result and only
     * fresh (non-duplicate) rated records reach the ledger.
     */
    async function onGameRecorded(userId, rec, inserted) {
        userId = cleanUid(userId);
        const out = { xpGained: 0, streak: null, winStreak: 0 };
        if (!userId || !rec || inserted === false) return out;
        const result = String(rec.result || '').toLowerCase();
        if (result !== 'win' && result !== 'loss' && result !== 'draw') return out;

        const g = await addXp(userId, 'games', GAME_XP[result] || 0);
        if (g) out.xpGained += g.gained;

        // Win streak: consecutive wins at the head of date-ordered history.
        // Paid milestones reset with the streak, so every new run can earn.
        try {
            const db = getDb();
            const xpd = (await db.getDoc('xp', userId)) || {};
            const hist = await db.listGames(userId, { limit: 200 });
            let run = 0;
            for (const h of hist) {
                const r = String((h && h.result) || '').toLowerCase();
                if (r === 'win') run++;
                else if (r === 'loss' || r === 'draw') break;
            }
            out.winStreak = run;
            const paid = xpd.winStreakPaid || 0;
            let payTo = paid;
            for (const [miles, amount] of WINSTREAK_XP.slice().reverse()) {
                if (run >= miles && miles > payTo) {
                    const a = await addXp(userId, 'streaks', amount);
                    if (a) { out.xpGained += a.gained; payTo = Math.max(payTo, miles); }
                }
            }
            await db.putDoc('xp', userId, {
                ...((await db.getDoc('xp', userId)) || { _id: userId, total: 0, games: 0, puzzles: 0, streaks: 0 }),
                winStreak: run, winStreakPaid: run === 0 ? 0 : payTo, updatedAt: Date.now(),
            });
        } catch (_) { /* XP must never fail a game record */ }

        // Shared friend streak, stamped from either player's copy.
        const opp = rec.oppUid && cleanUid(rec.oppUid);
        if (opp && opp !== userId && await areFriends(userId, opp)) {
            try {
                const st = await stampStreakDay(userId, opp, rec.date || Date.now());
                if (st) {
                    out.streak = { count: st.count, best: st.best };
                    for (const c of st.crossed) {
                        const a = await addXp(userId, 'streaks', c.amount);
                        if (a) out.xpGained += a.gained;
                    }
                }
            } catch (_) { /* streaks must never fail a game record */ }
        }
        return out;
    }

    /**
     * First-solve puzzle XP: +10 once per puzzle id, ever. Unknown or
     * over-long ids are rejected; past the id cap no more is paid (honest
     * stop, not silent growth).
     */
    async function solvePuzzle(uid, puzzleId) {
        uid = cleanUid(uid);
        const pid = typeof puzzleId === 'string' ? puzzleId.replace(/[^\w-]/g, '').slice(0, 64) : '';
        if (!uid || !pid) return { error: 'bad-puzzle' };
        const db = getDb();
        const prev = (await db.getDoc('xp', uid)) || { _id: uid, total: 0, games: 0, puzzles: 0, streaks: 0, solved: [] };
        const solved = Array.isArray(prev.solved) ? prev.solved : [];
        if (solved.includes(pid)) return { ok: true, duplicate: true, total: prev.total || 0 };
        if (solved.length >= PUZZLE_ID_CAP) return { ok: true, capped: true, total: prev.total || 0 };
        solved.push(pid);
        await db.putDoc('xp', uid, { ...prev, _id: uid, solved, updatedAt: Date.now() });
        const a = await addXp(uid, 'puzzles', PUZZLE_XP);
        return { ok: true, awarded: PUZZLE_XP, total: a ? a.total : prev.total || 0 };
    }

    /* ── presence ────────────────────────────────────────────────── */

    async function heartbeat(uid, name, img) {
        uid = cleanUid(uid);
        if (!uid) return { ok: false, becameOnline: false, freshReturn: false };
        const db = getDb();
        const prev = await db.getDoc('presence', uid).catch(() => null);
        const now = Date.now();
        const age = prev ? now - (prev.at || 0) : Infinity;
        await db.putDoc('presence', uid, { uid, name: cleanName(name), img: cleanImg(img), at: now });
        // becameOnline drives the read state; freshReturn gates the PUSH so
        // a throttled background tab (one late beat) doesn't spam friends —
        // only a real return after minutes away is announced.
        return { ok: true, becameOnline: age > PRESENCE_TTL_MS, freshReturn: age > 4 * PRESENCE_TTL_MS };
    }

    /**
     * Explicit goodbye: tab closed, signed out, or connection lost on
     * purpose. Without this a presence row lingers for the full TTL and
     * friends see a ghost "online now" for up to ~2 minutes after someone
     * leaves — the "offline but shows online" inversion.
     */
    async function leavePresence(uid) {
        uid = cleanUid(uid);
        if (!uid) return false;
        try { await getDb().delDoc('presence', uid); } catch (_) {}
        return true;
    }

    /**
     * Keep the account's display name + photo fresh from the heartbeat.
     * Presence rows carry the live Clerk photo every 45 s, but the ladder
     * reads the `users` profile — without this refresh a changed (or
     * first-synced) photo never reaches the ranking and friends see a
     * letter avatar instead of a face. Never CREATES an account from a
     * heartbeat: registration stays an explicit sync.
     */
    async function touchProfile(uid, name, img) {
        uid = cleanUid(uid);
        if (!uid) return false;
        const doc = await getDb().getUser(uid);
        if (!doc) return false;
        const profile = { ...(doc.profile || {}) };
        const n = typeof name === 'string' ? name.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 64) : '';
        const im = cleanImg(img);
        let changed = false;
        if (n && n !== 'Player' && n !== profile.name) { profile.name = n; changed = true; }
        if (im && im !== profile.image) { profile.image = im; changed = true; }
        if (!changed) return true;
        await getDb().updateUser(uid, {}, profile);
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

    /**
     * The ranked account universe, shared by the ladder and the hall.
     *
     * Source 1 — the `users` collection: every account that has synced at
     * least once (authoritative profile + ratings from recorded games).
     * Source 2 — `extraIdentities`: every registered account from the Clerk
     * Backend API (accounts that exist but never synced yet). Collection
     * rows win on uid conflicts; Clerk-only accounts enter at START_RATING
     * (or their replayed rating if games were somehow recorded for them).
     */
    function cleanExtraIdentities(list) {
        const out = [];
        if (!Array.isArray(list)) return out;
        for (const e of list) {
            const uid = e && cleanUid(e.uid);
            if (!uid) continue;
            out.push({ uid, name: cleanName(e.name), img: cleanImg(e.img) });
        }
        return out;
    }

    async function buildRankedRows(cat, extraIdentities) {
        const db = getDb();
        const [identities, ratings] = await Promise.all([
            db.listUserIdentities(),
            ratingTable()
        ]);
        const byUid = new Map();
        for (const id of identities) {
            const uid = id && id._id;
            if (!uid) continue;
            const profile = (id && id.profile) || {};
            byUid.set(uid, { uid, name: cleanName(profile.name), img: cleanImg(profile.image) });
        }
        for (const e of cleanExtraIdentities(extraIdentities)) {
            if (!byUid.has(e.uid)) byUid.set(e.uid, e);
        }
        const rows = [];
        for (const acc of byUid.values()) {
            const perCat = ratings.get(acc.uid);
            rows.push({
                uid: acc.uid,
                name: acc.name,
                img: acc.img,
                rating: (perCat && perCat.get(cat)) || START_RATING,
                games: 0
            });
        }
        rows.sort((a, b) => (b.rating - a.rating) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
        rows.forEach((r, i) => { r.rank = i + 1; });
        return rows;
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
     * @param {Array}  o.extraIdentities accounts known to the identity
     *      provider (Clerk) that never synced: {uid, name, img}. They enter
     *      at START_RATING so a registration is visible before its first sync.
     *
     * There is deliberately NO client-supplied friend list parameter. The
     * viewer's friends are derived from the stored friendship rows, so a
     * caller cannot ask the API to reveal an arbitrary stranger's full name
     * by passing their uid in a query string.
     */
    async function rankPage({ cat, viewerUid, limit = 50, offset = 0, extraIdentities = [] } = {}) {
        cat = cleanCat(cat);
        viewerUid = cleanUid(viewerUid);

        const [rows, friendRows] = await Promise.all([
            buildRankedRows(cat, extraIdentities),
            viewerUid ? listFriends(viewerUid) : Promise.resolve([])
        ]);
        const friends = new Set(friendRows.map((f) => f.uid));

        const total = rows.length;
        const myIndex = viewerUid ? rows.findIndex((r) => r.uid === viewerUid) : -1;
        const size = Math.max(1, Math.min(100, limit));
        const off = Math.max(0, offset);
        const page = rows.slice(off, off + size).map((r) => serializeRow(r, viewerUid, friends));

        // EVERY friend, with their real global rank, regardless of whether
        // they happen to fall inside the requested page. Without this the
        // "you and your friends" view silently truncates as soon as a friend
        // ranks outside the current page.
        const rankedFriends = rows
            .filter((r) => friends.has(r.uid))
            .map((r) => serializeRow(r, viewerUid, friends));

        return {
            cat,
            total,
            offset: off,
            limit: size,
            hasMore: off + size < total,
            myRank: myIndex >= 0 ? myIndex + 1 : null,
            myRating: myIndex >= 0 ? rows[myIndex].rating : null,
            friends: rankedFriends,
            board: page,
        };
    }

    /**
     * The hall of fame: the FIRST 1000 registered accounts by rating, with
     * FULL display names and avatars, out in the open for every signed-in
     * player. This is a deliberate product decision by the owner (a hall of
     * fame you cannot read is no hall of fame): unlike the ladder, hall rows
     * are never blurred or first-named. No uid, email or internal id is
     * included — names + public avatars only, which `/api/directory`
     * already serves per search to any signed-in account.
     */
    function hallRow(row, viewerUid, friends) {
        const out = {
            rank: row.rank, name: row.name,
            img: row.img || null, rating: row.rating, tier: tierOf(row.rating),
            self: !!(viewerUid && row.uid === viewerUid),
            friend: friends.has(row.uid),
        };
        // Friends keep their uid so the hall can link to profiles/invites;
        // everyone else is name + face only.
        if (out.self || out.friend) out.uid = row.uid;
        return out;
    }
    async function hallPage({ cat = 'blitz', viewerUid, limit = 50, offset = 0, extraIdentities = [] } = {}) {
        cat = cleanCat(cat);
        viewerUid = cleanUid(viewerUid);
        const [rows, friendRows] = await Promise.all([
            buildRankedRows(cat, extraIdentities),
            viewerUid ? listFriends(viewerUid) : Promise.resolve([])
        ]);
        const friends = new Set(friendRows.map((f) => f.uid));
        const capped = rows.slice(0, HALL_CAP);
        const size = Math.max(1, Math.min(100, limit));
        const off = Math.max(0, offset);
        return {
            cat,
            naming: 'full',
            total: capped.length,
            offset: off,
            limit: size,
            hasMore: off + size < capped.length,
            myRank: viewerUid ? (rows.findIndex((r) => r.uid === viewerUid) + 1 || null) : null,
            friends: capped.filter((r) => friends.has(r.uid)).map((r) => hallRow(r, viewerUid, friends)),
            board: capped.slice(off, off + size).map((r) => hallRow(r, viewerUid, friends)),
        };
    }

    /**
     * Per-viewer SERIALIZATION — the privacy boundary.
     *
     * self   : rank, own uid, own display name + photo, rating, tier
     * friend : rank, uid (friends already need it to invite each other),
     *          friend-facing display name + photo, rating, tier
     * stranger (ladder): rank, FIRST name, rating, tier. No uid, no full
     *          name, no photo, no email, no internal id — the field is never
     *          selected into the response, so it cannot leak through devtools
     *          either. (Photos of friends not showing on the ladder was a
     *          real bug: the photo never left the server. Friends' photos are
     *          already shared with each other everywhere else.)
     * stranger (hall, includeImg): full name + photo, still no uid/email —
     *          the explicit owner decision documented on hallPage.
     */
    function serializeRow(row, viewerUid, friends, includeImg) {
        const base = { rank: row.rank, rating: row.rating, tier: tierOf(row.rating) };
        if (viewerUid && row.uid === viewerUid) {
            return { ...base, uid: row.uid, name: row.name, img: row.img || null, self: true, friend: false };
        }
        if (friends.has(row.uid)) {
            return { ...base, uid: row.uid, name: row.name, img: row.img || null, self: false, friend: true };
        }
        const out = { ...base, name: firstName(row.name), self: false, friend: false };
        if (includeImg && row.img) out.img = row.img;
        return out;
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
        requestFriend, respondToRequest, cancelRequest, listRequests, touchProfile,        // invitations
        createInvite, respondToInvite, listInvites, listSentInvites, getInvite, sweepInvites,
        // friend streaks + experience
        stampStreakDay, pairStreak, getXp, addXp, onGameRecorded, solvePuzzle,
        // presence
        heartbeat, leavePresence, status, presenceCard, sweepPresence, searchDirectory,
        // inbox
        notify, notifyFriendEvent, inbox, ackInbox,
        // ranking
        rankPage, hallPage,
        // housekeeping
        invalidateRatings
    };
}