/**
 * server/index.mjs — DoChess API + static host.
 *
 *   node server/index.mjs        (or `npm run serve`)
 *
 * Routes
 *   GET  /api/health              config + dependency report (no auth)
 *   GET  /api/state               the signed-in user's saved sections
 *   PUT  /api/state               merge {sections:{...}, profile?} in, get merged out
 *   POST /api/games               append a finished game (idempotent on gameId)
 *   GET  /api/games?limit&before  paginated game history, newest first
 *   GET  /api/leaderboard?cat=&limit=&offset=
 *                                privacy-serialized global ladder (alias of /api/rank)
 *   POST /api/mm/join             quick-match queue: join (pairs closest ELO, any gap)
 *   GET  /api/mm/poll?ticket=     quick-match queue: waiting position or match
 *   POST /api/mm/leave            quick-match queue: leave
 *   POST /api/friends/request     send (or re-send) a friend request — pending
 *   POST /api/friends/respond     accept / decline an inbound request (terminal)
 *   POST /api/friends/cancel      cancel a request this account sent
 *   POST /api/friends/remove      remove a friendship in BOTH directions
 *   GET  /api/friends/snapshot    friends + inbound + outbound + resolved (authoritative)
 *   POST /api/presence            presence heartbeat (90 s TTL)
 *   POST /api/presence/leave      explicit goodbye (tab closed / signed out)
 *   GET  /api/xp                  experience ledger (games/puzzles/streaks)
 *   POST /api/puzzles/solve       first-solve puzzle XP (+10, once per puzzle)
 *   GET  /api/friends/status?uids=presence, restricted to known counterparties
 *   GET  /api/directory?q=        player directory search (name + photo only)
 *   POST /api/invites             create a match invitation (friends only)
 *   GET  /api/invites             my pending invitations
 *   POST /api/invites/respond     accept / decline (recipient only, idempotent)
 *   GET  /api/rank?cat=&limit=&offset=
 *                                global ladder: EVERY registered account at 800+,
 *                                strangers first-name only (server-side selection)
 *   *                             static files from the project root
 *
 * Identity is Clerk session JWTs (lib/auth.mjs). MongoDB is the permanent
 * store (lib/db.mjs) for EVERYTHING that must survive a restart — progress,
 * games, friendships, requests, invitations, presence. Upstash Redis only
 * rate-limits. The quick-match queue and the SSE bus are process-local by
 * design and documented as such.
 */

import http from 'node:http';
import { execSync } from 'node:child_process';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve, sep } from 'node:path';

import { config, missingConfig, isProductionReady, ROOT } from './lib/env.mjs';
import { initDb, db, dbStatus, sanitizeGameRecord } from './lib/db.mjs';
import { identify, authStatus, authMode } from './lib/auth.mjs';
import { redisStatus, rateLimit } from './lib/redis.mjs';
import { sendJson, sendError, readJson, pathOf, query, cors, securityHeaders, header } from './lib/http.mjs';
import { SECTION_MODES } from './lib/merge.mjs';
import { createMatcher } from './lib/mm.mjs';
import { createSocialStore, RANK_CATS } from './lib/social.mjs';
import { clerkSearch, mergeDirectory, clerkListUsers } from './lib/clerkdir.mjs';
import { createBus } from './lib/events.mjs';

const STARTED = Date.now();
const VERSION = 'api-1';
// The exact code this process booted from. A stale long-running server is
// otherwise indistinguishable from a fresh one until routes 404 — this makes
// it visible in the boot log and in GET /api/health.
let COMMIT = 'unknown';
try {
    COMMIT = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
} catch (_) { /* not a git checkout (release tarball): stay 'unknown' */ }

/* ── static files ───────────────────────────────────────────────────── */

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

const DENY_DIRS = new Set(['node_modules', 'server', '.git', 'skills', 'dream-canvas-player', 'test-results', 'shots', 'shots-l', 'shots2', 'baselines']);

function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { sendError(res, 405, 'method-not-allowed'); return; }

    let rel = decodeURIComponent(pathname);
    if (rel === '/') rel = '/index.html';
    const target = resolve(join(ROOT, normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '')));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) { sendError(res, 400, 'bad-path'); return; }

    const relParts = target.slice(ROOT.length + 1).split(sep);
    if (relParts.some((p) => DENY_DIRS.has(p) || p.startsWith('.'))) { sendError(res, 404, 'not-found'); return; }

    let file = target;
    if (!existsSync(file) || !statSync(file).isFile()) {
        // SPA-ish fallback only for extension-less paths.
        if (!extname(file) && existsSync(file + '.html')) file += '.html';
        else { sendError(res, 404, 'not-found'); return; }
    }

    const st = statSync(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    const etag = `W/"${st.size}-${Number(st.mtimeMs).toFixed(0)}"`;
    if (header(req, 'if-none-match') === etag) { res.writeHead(304, { ETag: etag }); res.end(); return; }

    // Cache policy. HTML must never be served stale: it carries the `?v=`
    // query keys that point every other asset at a version, so a stale
    // index.html pins the whole app to old scripts. Assets use a short
    // max-age WITH must-revalidate, so a deploy is picked up promptly and can
    // never be held indefinitely by a browser cache.
    const ext = extname(file).toLowerCase();
    const cache = ext === '.html'
        ? 'no-cache, must-revalidate'
        : 'public, max-age=300, must-revalidate';

    res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': st.size,
        ETag: etag,
        'Cache-Control': cache
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
}

/* ── API handlers ───────────────────────────────────────────────────── */

async function handleHealth(req, res) {
    const dbSt = dbStatus();
    sendJson(res, 200, {
        ok: true,
        version: VERSION,
        commit: COMMIT,
        uptimeMs: Date.now() - STARTED,
        productionReady: isProductionReady(),
        missing: missingConfig(),
        auth: { ...authStatus(), configured: !!config.clerkSecretKey },
        db: dbSt,
        redis: redisStatus(),
        sections: Object.keys(SECTION_MODES)
    });
}

async function handleGetState(req, res, userId) {
    const doc = await db().getUser(userId);
    sendJson(res, 200, {
        ok: true,
        userId,
        updatedAt: (doc && doc.updatedAt) || 0,
        profile: (doc && doc.profile) || {},
        sections: (doc && doc.sections) || {}
    });
}

async function handlePutState(req, res, userId) {
    const body = await readJson(req);
    if (!body || typeof body !== 'object') { sendError(res, 400, 'bad-body'); return; }
    // Registration is observable immediately: the account row must exist even
    // when this first sync carries no sections and no profile, otherwise a
    // brand-new user would not appear on the global ladder until they happened
    // to save something.
    await db().ensureUser(userId, body.profile);
    const incoming = (body.sections && typeof body.sections === 'object') ? body.sections : {};
    // Hard cap the payload per section so one client cannot bloat a doc.
    for (const [id, sec] of Object.entries(incoming)) {
        if (!sec || typeof sec !== 'object') { sendError(res, 400, 'bad-section', { section: id }); return; }
        if (!Number.isFinite(sec.updatedAt)) { sendError(res, 400, 'bad-timestamp', { section: id }); return; }
        const size = JSON.stringify(sec.data || null).length;
        if (size > 600_000) { sendError(res, 413, 'section-too-large', { section: id }); return; }
        if (!(id in SECTION_MODES)) delete incoming[id]; // unknown sections are dropped, not stored
    }
    const doc = await db().updateUser(userId, incoming, body.profile);
    // Every syncing user becomes a REAL ACCOUNT in the global ladder: the
    // ranking is built from the users collection, so a first sync (or a
    // brand-new registration) puts them on the board at 800 immediately.
    // Ratings are derived from recorded games, never from this payload.
    try {
        const prof = body.profile || {};
        if (prof.name || prof.image) await SOC.heartbeat(userId, prof.name, prof.image);
    } catch (_) {}
    sendJson(res, 200, {
        ok: true,
        userId,
        updatedAt: doc.updatedAt || 0,
        profile: doc.profile || {},
        sections: doc.sections || {}
    });
}

async function handlePostGames(req, res, userId) {
    const body = await readJson(req);
    const rec = sanitizeGameRecord(body, userId);
    if (!rec) { sendError(res, 400, 'bad-game'); return; }
    const r = await db().insertGame(rec);
    // A recorded result changes the ladder, so the derived-rating cache must
    // be dropped before the response — the next /api/rank must already show
    // the new rating.
    SOC.invalidateRatings();
    // Friend streaks + experience pay out from the stored record (idempotent:
    // a retried POST is a duplicate and pays nothing twice).
    let meta = null;
    try { meta = await SOC.onGameRecorded(userId, rec, r.ok && !r.duplicate); } catch (_) {}
    sendJson(res, 200, { ok: true, ...r, gameId: rec.gameId, xp: meta && meta.xpGained ? { gained: meta.xpGained, streak: meta.streak, winStreak: meta.winStreak } : undefined });
}

async function handleGetGames(req, res, userId) {
    const q = query(req);
    const limit = Math.max(1, Math.min(100, parseInt(q.limit, 10) || 20));
    const before = Number.isFinite(parseFloat(q.before)) ? parseFloat(q.before) : null;
    const games = await db().listGames(userId, { limit, before });
    const total = await db().countGames(userId);
    sendJson(res, 200, { ok: true, total, games });
}

const LEADER_CATS = RANK_CATS;

/**
 * GET /api/leaderboard?cat=&limit=&offset=
 *
 * The SAME global ladder the ranking tab uses, kept as an alias so older
 * clients keep working. Critically, the response is now the privacy-serialized
 * one: a stranger's row carries a first name, a rating and a tier, and no
 * uid / full name / photo / email. The previous version returned
 * `{uid, name, image, rating}` for every player to every caller and relied on
 * the browser to strip it, which put every account's identity in the network
 * response.
 */
async function handleLeaderboard(req, res, userId) {
    const q = query(req);
    // Rapid is the default category everywhere; explicit cats pass through.
    const cat = typeof q.cat === 'string' && q.cat ? q.cat.slice(0, 24) : 'rapid';
    // Validate BEFORE touching the cache: a cached payload must never
    // satisfy a bad-category request, and a bad cat must never poison it.
    if (!LEADER_CATS.includes(cat)) { sendError(res, 400, 'bad-category'); return; }
    const limit = Math.max(1, Math.min(100, parseInt(q.limit, 10) || 100));
    const offset = Math.max(0, parseInt(q.offset, 10) || 0);

    let friends = [];
    try { friends = (await SOC.listFriends(userId)).map((f) => f.uid); } catch (_) {}

    let payload;
    try {
        // Same full registry as /api/rank (users + every Clerk account).
        const registry = await clerkListUsers().catch(() => ({ list: [], complete: false }));
        payload = await SOC.rankPage({ cat, viewerUid: userId, friendUids: friends, limit, offset, extraIdentities: registry.list });
        payload = { scope: registry.complete && registry.list.length ? 'all' : 'synced', ...payload };
    } catch (e) {
        // Never serve a stale or empty ladder as if it were the real one.
        console.error('[doches api] leaderboard failed', e);
        sendError(res, 503, 'leaderboard-unavailable');
        return;
    }
    // The viewer-specific view must never be cached for other viewers.
    sendJson(res, 200, { ok: true, ...payload, players: payload.board, generatedAt: Date.now() });
}

/* ── router ─────────────────────────────────────────────────────────── */

/* ── quick match (server/lib/mm.mjs) ─────────────────────────────
   In-memory ELO queue shared by every searcher on this process. The uid
   comes from the Clerk session (same identity as the rest of the API);
   the ticket is the only capability the poller needs. */
const MM = createMatcher();
const EV = createBus();
// The authoritative social graph: persisted through the permanent store, not
// process memory. See server/lib/social.mjs for why the previous in-memory
// implementation lost every friendship on restart.
const SOC = createSocialStore(() => db());
setInterval(() => {
    try { MM.sweep(); EV.sweep(); } catch (_) {}
    Promise.all([SOC.sweepPresence(), SOC.sweepInvites()]).catch(() => {});
}, 30000).unref?.();

async function handleMmJoin(req, res, userId) {
    let body = {};
    try { body = await readJson(req); } catch (e) {
        if (e && e.code === 'BAD_JSON') { sendError(res, 400, 'bad-json'); return; }
        throw e;
    }
    const r = MM.join({ uid: userId, name: body.name, elo: body.elo, cat: body.cat });
    sendJson(res, 200, { ok: true, ...r });
}

async function handleMmPoll(req, res) {
    const q = query(req);
    const r = MM.poll(q.ticket);
    sendJson(res, 200, { ok: true, ...r });
}

async function handleMmLeave(req, res) {
    let body = {};
    try { body = await readJson(req); } catch (_) { body = {}; }
    sendJson(res, 200, { ok: MM.leave(body.ticket) });
}

/* ── friends / requests / invites / presence / rank ────────────── */
async function readBody(req) {
    try { return await readJson(req); }
    catch (e) { return e && e.code === 'BAD_JSON' ? null : {}; }
}

/** Any store failure must surface honestly, never as a fake success. */
function fail(res, where, e) {
    console.error('[doches api]', where, e);
    sendError(res, 503, 'store-unavailable');
}

/* --- friend requests (explicit lifecycle) --- */

async function handleFriendRequest(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        await SOC.heartbeat(userId, body.myName, body.myImg || null);
        const r = await SOC.requestFriend(userId, {
            toUid: body.friendUid, name: body.friendName, img: body.friendImg,
            fromName: body.myName, fromImg: body.myImg,
        });
        if (r.error) { sendError(res, r.error === 'already-friends' ? 409 : 400, r.error); return; }
        // The inbox item is COMPOSED BY THE SERVER from the stored request,
        // so the recipient never receives a message whose text was chosen by
        // the sender's client. The title names the REQUESTER as they assert
        // themselves (their live name, then their stored self-assertion) —
        // never r.request.name, which is the requester's VIEW of the target
        // and would read as the recipient's own name.
        try {
            const live = (typeof body.myName === 'string' && body.myName.trim()
                && body.myName.trim() !== 'Player') ? body.myName.trim().slice(0, 24) : '';
            const stored = r.request.fromName && r.request.fromName !== 'Player' ? r.request.fromName : '';
            const me = live || stored || (await SOC.counterpartyProfile(userId).catch(() => ({ name: 'Player' }))).name;
            const who = (me && me !== 'Player') ? me : 'A player';
            const item = await SOC.notifyFriendEvent(r.request.to, 'friend-request', who);
            try { EV.publish(r.request.to, { kind: 'friend-request', id: item && item._id }); } catch (_) {}
        } catch (_) {}
        sendJson(res, 200, { ok: true, status: 'pending', created: !!r.created });
    } catch (e) { fail(res, 'friends/request', e); }
}

async function handleFriendRespond(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        const accept = body.accept === true || body.accept === 'true' || body.accept === 1;
        // The accepter's live self-name travels too, so the friendship row
        // stores self-keyed names and neither side ever reads their own
        // name on the other's row.
        const r = await SOC.respondToRequest(userId, body.fromUid, accept, { name: body.myName, img: body.myImg });
        if (r.error) {
            const status = r.error === 'already-resolved' ? 409 : r.error === 'no-request' ? 404 : 400;
            sendError(res, status, r.error, r.status ? { status: r.status } : {});
            return;
        }
        // Both sides are told: the requester learns the outcome, the
        // responder's own shelf is already reconciled by this response.
        const other = cleanOther(userId, body.fromUid);
        const eventKind = accept ? 'friend-accept' : 'friend-decline';
        try {
            const item = await SOC.notifyFriendEvent(other, eventKind, body.myName || body.fromName);
            try { EV.publish(other, { kind: eventKind, id: item && item._id }); } catch (_) {}
        } catch (_) {}
        if (accept) try { EV.publish(other, { kind: 'friends' }); } catch (_) {}
        sendJson(res, 200, { ok: true, status: r.status, idempotent: !!r.idempotent, friend: r.friend || null });
    } catch (e) { fail(res, 'friends/respond', e); }
}

function cleanOther(me, other) {
    return typeof other === 'string' && /^[\w-]{1,64}$/.test(other) && other !== me ? other : null;
}

async function handleFriendCancel(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        const changed = await SOC.cancelRequest(userId, body.friendUid);
        const other = cleanOther(userId, body.friendUid);
        if (other) try { EV.publish(other, { kind: 'friend-decline' }); } catch (_) {}
        sendJson(res, 200, { ok: true, cancelled: changed });
    } catch (e) { fail(res, 'friends/cancel', e); }
}

async function handleFriendRemove(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        // Durable before we answer: the client is told `ok:false` (and rolls
        // its UI back) if this write did not land.
        const existed = await SOC.removeFriend(userId, body.friendUid);
        const other = cleanOther(userId, body.friendUid);
        try { if (other) EV.publish(other, { kind: 'friends' }); } catch (_) {}
        sendJson(res, 200, { ok: true, removed: existed });
    } catch (e) { fail(res, 'friends/remove', e); }
}

/**
 * The authoritative snapshot. The client reconciles its entire shelf from
 * this one response, so a friend the server does not list is removed locally
 * too — which is what makes a removal stick instead of being re-added by the
 * next poll.
 */
async function handleFriendsSnapshot(req, res, userId) {
    try {
        const [friends, requests] = await Promise.all([
            SOC.listFriends(userId),
            SOC.listRequests(userId)
        ]);
        sendJson(res, 200, { ok: true, friends, requests });
    } catch (e) { fail(res, 'friends/snapshot', e); }
}

/**
 * GET /api/directory?q=
 *
 * Player search must find ELIGIBLE REGISTERED USERS, not just friends.
 * Three sources, merged, strangers last:
 *   1. this viewer's confirmed friends (always match, friend: true)
 *   2. everyone else the server has a presence record for (any signed-in
 *      player who has connected at least once)
 *   3. a Clerk Backend-API search, so a brand-new account that has never
 *      synced is still findable by name
 *
 * Strangers are returned with a display name and photo only — never an
 * email, never a private field. The uid is included because the search
 * result has to be actionable (send them a request), and a request can only
 * be created for someone the caller names in a query anyway.
 */
async function handleDirectory(req, res, userId) {
    const q = query(req);
    const term = typeof q.q === 'string' ? q.q : '';
    try {
        const friends = await SOC.listFriends(userId);
        const friendUids = friends.map((f) => f.uid);
        const known = await SOC.searchDirectory(term, 20);
        const remote = await clerkSearch(term).catch(() => []);
        const merged = mergeDirectory(
            friendUids.map((uid) => ({ uid, name: '', img: null })),
            [...known, ...remote],
            friendUids
        );
        sendJson(res, 200, { ok: true, players: merged });
    } catch (e) { fail(res, 'directory', e); }
}

/* --- invitations --- */

async function handleInviteCreate(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        const r = await SOC.createInvite(userId, {
            toUid: body.toUid, minutes: body.minutes, incSec: body.incSec, code: body.code
        });
        if (r.error) {
            const status = r.error === 'not-friends' ? 403 : 400;
            sendError(res, status, r.error);
            return;
        }
        const inv = r.invite;
        try { EV.publish(inv.to, { kind: 'invite', matchId: inv.matchId, code: inv.code }); } catch (_) {}
        sendJson(res, 200, {
            ok: true,
            matchId: inv.matchId, code: inv.code,
            control: inv.control, expiresAt: inv.expiresAt,
            to: inv.to, status: inv.status
        });
    } catch (e) { fail(res, 'invites/create', e); }
}

async function handleInviteList(req, res, userId) {
    try {
        const [invites, sentRows, friendRows] = await Promise.all([
            SOC.listInvites(userId),
            SOC.listSentInvites(userId),
            SOC.listFriends(userId).catch(() => []),
        ]);
        // The sender already knows who they invited; resolving the
        // recipient's friend-facing name server-side (from the friendship
        // row, never from client input) lets the sender UI say "Mossab
        // accepted" instead of "someone accepted".
        const names = new Map((friendRows || []).map((f) => [f.uid, f.name]));
        const sent = (sentRows || []).map((inv) => ({
            ...publicInvite(inv), to: inv.to, toName: names.get(inv.to) || 'Friend',
        }));
        sendJson(res, 200, { ok: true, invites, sent });
    } catch (e) { fail(res, 'invites/list', e); }
}

async function handleInviteRespond(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        const accept = body.accept === true || body.accept === 'true' || body.accept === 1;
        const r = await SOC.respondToInvite(userId, body.matchId, accept);
        if (r.error) {
            const status = r.error === 'no-invite' ? 404
                : r.error === 'not-recipient' ? 403
                    : r.error === 'already-resolved' ? 409 : 400;
            sendError(res, status, r.error, r.status ? { status: r.status } : {});
            return;
        }
        const inv = r.invite;
        const other = accept ? inv.from : inv.to;
        if (!accept) {
            try {
                // Name the DECLINER (the recipient), resolved live — the
                // invite row carries no sender display fields at all.
                const who = await SOC.counterpartyProfile(userId).catch(() => ({ name: 'Player' }));
                const item = await SOC.notifyFriendEvent(inv.from, 'invite-declined', who.name);
                try { EV.publish(other, { kind: 'invite-declined', id: item && item._id }); } catch (_) {}
            } catch (_) {}
        } else {
            try { EV.publish(other, { kind: 'invite-accepted', matchId: inv.matchId }); } catch (_) {}
        }
        sendJson(res, 200, { ok: true, status: inv.status, idempotent: !!r.idempotent, invite: publicInvite(inv) });
    } catch (e) { fail(res, 'invites/respond', e); }
}

/**
 * The ONLY shape an invitation ever takes in a response. It never carries
 * the recipient's internal account id, an auth token or an email — the
 * sender's display fields are copied from the friendship row, not accepted
 * from the request body.
 */
function publicInvite(inv) {
    return {
        matchId: inv.matchId, code: inv.code, control: inv.control,
        minutes: inv.minutes, incSec: inv.incSec,
        status: inv.status, createdAt: inv.createdAt, expiresAt: inv.expiresAt
    };
}

/* --- presence --- */

async function handlePresence(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        const hb = await SOC.heartbeat(userId, body.name, body.img);
        // Keep the ladder photo fresh (durable before we answer).
        try { await SOC.touchProfile(userId, body.name, body.img); } catch (_) {}
        // Offline → online is PUSHED to friends at once: their screens flip
        // to "online now" in a second or two instead of waiting for the next
        // 30 s repaint. Repeat beats stay silent (no spam).
        if (hb && hb.freshReturn) {
            try { await fanoutPresence(userId, true); } catch (_) {}
        }
        sendJson(res, 200, { ok: true });
    } catch (e) { fail(res, 'presence', e); }
}

/**
 * POST /api/presence/leave — explicit goodbye (tab closed, signed out).
 * The row is deleted at once instead of lingering for the TTL, so friends
 * stop seeing a ghost "online now". Fire-and-forget safe: missing rows are
 * fine, and a later heartbeat simply re-creates the row.
 */
async function handlePresenceLeave(req, res, userId) {
    try {
        await SOC.leavePresence(userId);
        // The goodbye is PUSHED to friends at once: their screens flip to
        // "last seen just now" in a second or two instead of waiting for
        // the next 30 s repaint (or the 90 s TTL).
        try { await fanoutPresence(userId, false); } catch (_) {}
        sendJson(res, 200, { ok: true });
    } catch (e) { fail(res, 'presence/leave', e); }
}

/** Tell every friend of `userId` that their reachability just flipped. */
async function fanoutPresence(userId, online) {
    try {
        const friends = await SOC.listFriends(userId);
        const msg = { kind: 'presence', uid: userId, online: !!online, lastSeen: Date.now() };
        for (const f of friends) {
            if (!f || !f.uid) continue;
            try { EV.publish(f.uid, msg); } catch (_) {}
        }
    } catch (_) {}
}

/**
 * GET /api/xp — this account's experience ledger. Fixed server-side
 * amounts: rated game win +20 / draw +10 / loss +5, friend-streak
 * milestones (7d +50, 30d +150, 100d +400, 365d +1000), win-streak
 * milestones (3 +15, 5 +40, 10 +100, 20 +250), first puzzle solve +10.
 */
async function handleGetXp(req, res, userId) {
    try {
        sendJson(res, 200, { ok: true, xp: await SOC.getXp(userId) });
    } catch (e) { fail(res, 'xp', e); }
}

/**
 * POST /api/puzzles/solve {puzzleId} — +10 XP for a first solve, ever.
 * The client reports the EVENT, never a number; duplicates and unknown ids
 * pay nothing.
 */
async function handlePuzzleSolve(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        const r = await SOC.solvePuzzle(userId, body.puzzleId);
        if (r.error) { sendError(res, 400, r.error); return; }
        sendJson(res, 200, { ok: true, ...r });
    } catch (e) { fail(res, 'puzzles/solve', e); }
}

/**
 * Presence is user data and must not be enumerable. The requested uids are
 * intersected with the caller's own friends plus the counterparties of their
 * pending requests; anything else is simply absent from the response.
 */
async function handleFriendStatus(req, res, userId) {
    try {
        const q = query(req);
        const asked = typeof q.uids === 'string' ? q.uids.split(',') : [];
        const [friends, requests] = await Promise.all([
            SOC.listFriends(userId),
            SOC.listRequests(userId)
        ]);
        const allowed = new Set([
            ...friends.map((f) => f.uid),
            ...requests.inbound.map((r) => r.uid),
            ...requests.outbound.map((r) => r.uid)
        ]);
        const permitted = asked.filter((u) => allowed.has(u));
        const status = await SOC.status(permitted);
        sendJson(res, 200, { ok: true, status });
    } catch (e) { fail(res, 'friends/status', e); }
}

/* --- the activity inbox (relationship-gated, persistent) --- */

/**
 * POST /api/notify — a signed-in account may queue an item ONLY for someone
 * it is already in a relationship with (friend, or the other side of a
 * request). Actionable kinds are not caller-selectable: `game-invite` is
 * rejected here and must go through POST /api/invites.
 */
async function handleNotify(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        const r = await SOC.notify(userId, {
            toUid: body.toUid, kind: body.kind, title: body.title, body: body.body
        });
        if (r.error) { sendError(res, 403, r.error); return; }
        try { EV.publish(r.item.to, { kind: 'notify', id: r.item._id }); } catch (_) {}
        sendJson(res, 200, { ok: true, id: r.item._id });
    } catch (e) { fail(res, 'notify', e); }
}

async function handleNotifyGet(req, res, userId) {
    try {
        const items = await SOC.inbox(userId);
        sendJson(res, 200, { ok: true, ...items });
    } catch (e) { fail(res, 'notify/get', e); }
}

async function handleNotifyAck(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    try {
        sendJson(res, 200, { ok: true, acked: await SOC.ackInbox(userId, body.ids) });
    } catch (e) { fail(res, 'notify/ack', e); }
}

/**
 * GET /api/hall?cat=&limit=&offset=
 *
 * The hall of fame: the FIRST 1000 registered accounts by rating, with FULL
 * display names and avatars, out in the open — an explicit product decision
 * by the owner (see SOC.hallPage). No uid, email or internal id is included.
 * The account universe is the users collection PLUS every Clerk-registered
 * account (even never-synced ones); `scope` says honestly which it is.
 */
async function handleHall(req, res, userId) {
    try {
        const q = query(req);
        const cat = typeof q.cat === 'string' && q.cat ? q.cat.slice(0, 24) : 'rapid';
        if (!LEADER_CATS.includes(cat)) { sendError(res, 400, 'bad-category'); return; }
        const limit = Math.max(1, Math.min(100, parseInt(q.limit, 10) || 100));
        const offset = Math.max(0, parseInt(q.offset, 10) || 0);
        const registry = await clerkListUsers().catch(() => ({ list: [], complete: false }));
        sendJson(res, 200, {
            ok: true,
            scope: registry.complete && registry.list.length ? 'all' : 'synced',
            ...(await SOC.hallPage({ cat, viewerUid: userId, limit, offset, extraIdentities: registry.list })),
        });
    } catch (e) { fail(res, 'hall', e); }
}

/* --- ranking --- */

/**
 * GET /api/profile?uid= — one player's public dossier. Signed-in only
 * (router-enforced). See SOC.publicProfile for the privacy contract:
 * identity + ratings + record + level + badges for everyone, uid and
 * presence only for self/friends/pending. 400 on malformed uid, 404 on
 * users the server has never seen.
 */
async function handleProfile(req, res, userId) {
    try {
        const q = query(req);
        const r = await SOC.publicProfile(userId, typeof q.uid === 'string' ? q.uid : '');
        if (r && r.error === 'bad-player') { sendError(res, 400, 'bad-player'); return; }
        if (r && r.error === 'unknown-player') { sendError(res, 404, 'unknown-player'); return; }
        sendJson(res, 200, r);
    } catch (e) { fail(res, 'profile', e); }
}

async function handleRank(req, res, userId) {
    try {
        const q = query(req);
        // Pages of 100: a full registry must never be dumped in one
        // response (client memory, server memory, database load).
        const limit = Math.max(1, Math.min(100, parseInt(q.limit, 10) || 100));
        const offset = Math.max(0, parseInt(q.offset, 10) || 0);
        // The `friends=` hint is IGNORED for authorization purposes: the
        // server derives the viewer's friends from its own graph, so a
        // caller cannot ask "reveal the full name of this uid" by passing
        // it in the query string.
        // The account universe is the users collection PLUS every
        // Clerk-registered account (even never-synced ones); `scope` says
        // honestly which it is.
        const registry = await clerkListUsers().catch(() => ({ list: [], complete: false }));
        const r = await SOC.rankPage({ cat: q.cat, viewerUid: userId, limit, offset, extraIdentities: registry.list });
        sendJson(res, 200, { ok: true, scope: registry.complete && registry.list.length ? 'all' : 'synced', ...r });
    } catch (e) { fail(res, 'rank', e); }
}

/* ── push stream (server/lib/events.mjs) ──────────────────────── */
async function handleEvents(req, res) {
    const q = query(req);
    const uid = EV.claimTicket(q.ticket);
    if (!uid) { sendError(res, 401, 'bad-ticket'); return; }
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    try { res.write(': connected\n\n'); } catch (_) {}
    EV.subscribe(uid, res);
}

async function handleApi(req, res) {
    const p = pathOf(req);

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (p === '/api/health' && req.method === 'GET') { await handleHealth(req, res); return; }

    // Push stream authenticates by one-time ticket (EventSource cannot set
    // headers), so it lives outside the session-authenticated section.
    if (p === '/api/events' && req.method === 'GET') { await handleEvents(req, res); return; }

    // Everything below is per-user → authenticate first.
    const id = await identify(req);
    if (!id.ok) { sendError(res, id.status, id.error); return; }

    const rl = await rateLimit(`${id.userId}:${p}`, p === '/api/state' && req.method === 'PUT' ? 30 : 120, 60);
    if (!rl.allowed) { sendError(res, 429, 'rate-limited', { remaining: rl.remaining }); return; }

    if (p === '/api/state' && req.method === 'GET') { await handleGetState(req, res, id.userId); return; }
    if (p === '/api/state' && req.method === 'PUT') { await handlePutState(req, res, id.userId); return; }
    if (p === '/api/games' && req.method === 'POST') { await handlePostGames(req, res, id.userId); return; }
    if (p === '/api/games' && req.method === 'GET') { await handleGetGames(req, res, id.userId); return; }
    if (p === '/api/leaderboard' && req.method === 'GET') { await handleLeaderboard(req, res, id.userId); return; }
    if (p === '/api/mm/join' && req.method === 'POST') { await handleMmJoin(req, res, id.userId); return; }
    if (p === '/api/mm/poll' && req.method === 'GET') { await handleMmPoll(req, res); return; }
    if (p === '/api/mm/leave' && req.method === 'POST') { await handleMmLeave(req, res); return; }

    // Friend requests — an explicit lifecycle with a terminal status.
    if (p === '/api/friends/request' && req.method === 'POST') { await handleFriendRequest(req, res, id.userId); return; }
    if (p === '/api/friends/respond' && req.method === 'POST') { await handleFriendRespond(req, res, id.userId); return; }
    if (p === '/api/friends/cancel' && req.method === 'POST') { await handleFriendCancel(req, res, id.userId); return; }
    if (p === '/api/friends/remove' && req.method === 'POST') { await handleFriendRemove(req, res, id.userId); return; }
    // One authoritative snapshot: friends + inbound + outbound + resolved.
    if (p === '/api/friends/snapshot' && req.method === 'GET') { await handleFriendsSnapshot(req, res, id.userId); return; }
    if (p === '/api/directory' && req.method === 'GET') { await handleDirectory(req, res, id.userId); return; }
    if (p === '/api/presence' && req.method === 'POST') { await handlePresence(req, res, id.userId); return; }
    if (p === '/api/presence/leave' && req.method === 'POST') { await handlePresenceLeave(req, res, id.userId); return; }
    if (p === '/api/xp' && req.method === 'GET') { await handleGetXp(req, res, id.userId); return; }
    if (p === '/api/puzzles/solve' && req.method === 'POST') { await handlePuzzleSolve(req, res, id.userId); return; }
    if (p === '/api/friends/status' && req.method === 'GET') { await handleFriendStatus(req, res, id.userId); return; }
    if (p === '/api/notify' && req.method === 'POST') { await handleNotify(req, res, id.userId); return; }
    if (p === '/api/notify' && req.method === 'GET') { await handleNotifyGet(req, res, id.userId); return; }
    if (p === '/api/notify/ack' && req.method === 'POST') { await handleNotifyAck(req, res, id.userId); return; }

    // Match invitations — a real entity with an id, expiry and status.
    if (p === '/api/invites' && req.method === 'POST') { await handleInviteCreate(req, res, id.userId); return; }
    if (p === '/api/invites' && req.method === 'GET') { await handleInviteList(req, res, id.userId); return; }
    if (p === '/api/invites/respond' && req.method === 'POST') { await handleInviteRespond(req, res, id.userId); return; }

    if (p === '/api/rank' && req.method === 'GET') { await handleRank(req, res, id.userId); return; }
    if (p === '/api/hall' && req.method === 'GET') { await handleHall(req, res, id.userId); return; }
    if (p === '/api/profile' && req.method === 'GET') { await handleProfile(req, res, id.userId); return; }
    if (p === '/api/events/ticket' && req.method === 'POST') { sendJson(res, 200, { ok: true, ticket: EV.mintTicket(id.userId) }); return; }

    sendError(res, 404, 'not-found');
}

const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    cors(req, res);
    try {
        const p = pathOf(req);
        if (p.startsWith('/api/')) await handleApi(req, res);
        else serveStatic(req, res, p);
    } catch (e) {
        const code = e && e.code;
        if (code === 'TOO_LARGE') { sendError(res, 413, 'payload-too-large'); return; }
        if (code === 'BAD_JSON') { sendError(res, 400, 'invalid-json'); return; }
        console.error('[doches api]', req.method, req.url, e);
        sendError(res, 500, 'internal-error');
    }
});

/* ── boot ───────────────────────────────────────────────────────────── */

async function main() {
    if (config.devNoAuth && process.env.NODE_ENV === 'production') {
        console.error('[doches api] refusing to boot: DOCHESS_DEV_NO_AUTH=1 in production');
        process.exit(1);
    }
    await initDb();
    server.listen(config.port, config.host, () => {
        console.log(`[doches api] ${VERSION} commit=${COMMIT} listening on http://${config.host}:${config.port}`);
        console.log(`[doches api] auth=${authMode()} db=${dbStatus().kind} redis=${redisStatus().configured ? 'configured' : 'off'}`);
        const missing = missingConfig();
        if (missing.length) console.log(`[doches api] not production-ready, still missing: ${missing.join(', ')}`);
    });
}

if (process.env.NODE_ENV !== 'test') {
    main().catch((e) => { console.error('[doches api] failed to start:', e); process.exit(1); });
}

export { server };
