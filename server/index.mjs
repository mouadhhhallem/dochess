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
 *   GET  /api/leaderboard?cat=    top players for one rating category
 *   POST /api/mm/join             quick-match queue: join (pairs closest ELO, any gap)
 *   GET  /api/mm/poll?ticket=     quick-match queue: waiting position or match
 *   POST /api/mm/leave            quick-match queue: leave
 *   POST /api/friends/add         friends: add edge (mutual edges = confirmed)
 *   POST /api/friends/remove      friends: remove edge
 *   GET  /api/friends/list        friends: my edges with confirmed flags
 *   GET  /api/friends/requests    friends: inbound requests (they list me, I don't list them)
 *   POST /api/presence            friends: heartbeat (90 s TTL)
 *   GET  /api/friends/status?uids= friends: online/recent map
 *   POST /api/notify              activity inbox: queue an event for a user
 *   GET  /api/notify              activity inbox: items + unread count
 *   POST /api/notify/ack          activity inbox: mark read
 *   POST /api/rank/publish        ranking: publish best rating per category
 *   GET  /api/rank?cat=&friends=  ranking: my rank + named friends, strangers anonymous
 *   POST /api/hall/join           hall of fame: claim a first-1000 seat
 *   GET  /api/hall                hall of fame: the registry
 *   *                             static files from the project root
 *
 * Identity is Clerk session JWTs (lib/auth.mjs). MongoDB is the permanent
 * store (lib/db.mjs); Upstash Redis only rate-limits and caches (lib/redis.mjs).
 */

import http from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve, sep } from 'node:path';

import { config, missingConfig, isProductionReady, ROOT } from './lib/env.mjs';
import { initDb, db, dbStatus, sanitizeGameRecord, extractCatRating } from './lib/db.mjs';
import { identify, authStatus, authMode } from './lib/auth.mjs';
import { redisStatus, rateLimit, get as rget, set as rset, del as rdel } from './lib/redis.mjs';
import { sendJson, sendError, readJson, pathOf, query, cors, securityHeaders, header } from './lib/http.mjs';
import { SECTION_MODES } from './lib/merge.mjs';
import { createMatcher } from './lib/mm.mjs';
import { createFriendStore } from './lib/friends.mjs';
import { clerkSearch, mergeDirectory } from './lib/clerkdir.mjs';
import { createBus } from './lib/events.mjs';

const STARTED = Date.now();
const VERSION = 'api-1';

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

    res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': st.size,
        ETag: etag,
        'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=300'
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
    // Every syncing user becomes searchable: name + photo feed the
    // directory (no enumeration — lookup needs 3+ letters, max 20).
    try {
        const prof = body.profile || {};
        if (prof.name || prof.image) FR.register(userId, prof.name, prof.image);
    } catch (_) {}
    // Ratings drive the leaderboard: a fresh ratings section must not wait
    // up to 30 s behind the cache. Bust every category key for this store.
    try {
        if (incoming && incoming.ratings) {
            let kind = 'none';
            try { kind = db().kind || 'none'; } catch (_) {}
            for (const c of LEADER_CATS) {
                try { await rdel('lb:' + config.mongoDb + ':' + kind + ':' + c); } catch (_) {}
                // Legacy key shape (pre-kind suffix): clear too so a stale
                // cross-env entry can never resurface after the upgrade.
                try { await rdel('lb:' + config.mongoDb + ':' + c); } catch (_) {}
            }
        }
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
    sendJson(res, 200, { ok: true, ...r, gameId: rec.gameId });
}

async function handleGetGames(req, res, userId) {
    const q = query(req);
    const limit = Math.max(1, Math.min(100, parseInt(q.limit, 10) || 20));
    const before = Number.isFinite(parseFloat(q.before)) ? parseFloat(q.before) : null;
    const games = await db().listGames(userId, { limit, before });
    const total = await db().countGames(userId);
    sendJson(res, 200, { ok: true, total, games });
}

const LEADER_CATS = new Set(['bullet', 'blitz', 'rapid', 'classical', 'correspondence']);

async function handleLeaderboard(req, res) {
    const cat = (query(req).cat || 'blitz').slice(0, 24);
    // Validate BEFORE touching the cache: a cached payload must never
    // satisfy a bad-category request, and a bad cat must never poison it.
    if (!LEADER_CATS.has(cat)) { sendError(res, 400, 'bad-category'); return; }
    // Cache key isolates both the database NAME and the live store KIND.
    // Several environments (dev file-store, e2e, prod mongo) share one
    // Upstash instance with the same DB name ("dochess"): without the kind
    // suffix one env's board was served to another (stale devsmoke rows).
    let kind = 'none';
    try { kind = db().kind || 'none'; } catch (_) {}
    const key = 'lb:' + config.mongoDb + ':' + kind + ':' + cat;
    const cached = await rget(key);
    if (cached) {
        try { sendJson(res, 200, JSON.parse(cached)); return; } catch (_) { /* refetch */ }
    }

    // Top-N per category. The ratings section stores the live ratings object
    // {rating, best, games, ...} per category (bare numbers on legacy dev
    // records) — extract the numeric rating first, then sort. The candidate
    // set is bounded (500) so the sort stays cheap; when the player base
    // outgrows that, normalize to a numeric field with a descending index.
    let rows = [];
    if (db().kind === 'mongo') {
        const docs = await db().users
            .find({ ['sections.ratings.data.cats.' + cat]: { $exists: true } })
            .project({ _id: 1, profile: 1, ['sections.ratings.data.cats.' + cat]: 1 })
            .limit(500)
            .toArray();
        rows = docs
            .map((d) => ({
                uid: d._id,
                name: (d.profile && d.profile.name) || 'Player',
                image: (d.profile && d.profile.image) || null,
                rating: extractCatRating(d.sections?.ratings?.data?.cats?.[cat])
            }))
            .filter((r) => r.rating != null)
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 50);
    } else {
        // Dev file store: no index — scan user docs (fine for local use).
        rows = db().fileScanLeaderboard ? db().fileScanLeaderboard(cat) : [];
    }

    const payload = { ok: true, cat, players: rows, generatedAt: Date.now() };
    await rset(key, JSON.stringify(payload), 30);
    sendJson(res, 200, payload);
}

/* ── router ─────────────────────────────────────────────────────────── */

/* ── quick match (server/lib/mm.mjs) ─────────────────────────────
   In-memory ELO queue shared by every searcher on this process. The uid
   comes from the Clerk session (same identity as the rest of the API);
   the ticket is the only capability the poller needs. */
const MM = createMatcher();
const FR = createFriendStore();
const EV = createBus();
setInterval(() => { try { MM.sweep(); FR.sweep(); EV.sweep(); } catch (_) {} }, 30000).unref?.();

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

/* ── friends / presence / inbox / rank / hall ─────────────────── */
async function readBody(req) {
    try { return await readJson(req); }
    catch (e) { return e && e.code === 'BAD_JSON' ? null : {}; }
}

async function handleFriendAdd(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    const r = FR.addEdge(userId, { uid: body.friendUid, name: body.friendName, img: body.friendImg });
    if (!r) { sendError(res, 400, 'bad-friend'); return; }
    // Heartbeat carries the requester's own photo so directory search and
    // inbound-request rows render avatars without a second lookup.
    try { FR.heartbeat(userId, body.myName, body.myImg || null); } catch (_) {}
    try { EV.publish(body.friendUid, { kind: 'friends' }); } catch (_) {}
    sendJson(res, 200, { ok: true, ...r });
}

async function handleDirectory(req, res, userId) {
    const q = query(req);
    const term = typeof q.q === 'string' ? q.q : '';
    // Local directory: everyone who touched friends/rank/presence/sync.
    const local = FR.lookup(term);
    let players = local.map((p) => ({ ...p, friend: false }));
    // Clerk directory: EVERY registered user, friend or not. Merged with
    // local wins; strangers stay name+photo only (no emails, ever).
    try {
        const remote = await clerkSearch(term);
        if (remote.length) {
            const mine = new Set((FR.listEdges(userId) || []).map((f) => f.uid));
            players = mergeDirectory(players, remote, [...mine]);
        }
    } catch (_) {}
    sendJson(res, 200, { ok: true, players });
}

async function handleFriendRemove(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    const ok = FR.removeEdge(userId, body.friendUid);
    try { if (body.friendUid) EV.publish(body.friendUid, { kind: 'friends' }); } catch (_) {}
    sendJson(res, 200, { ok });
}

async function handlePresence(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    FR.heartbeat(userId, body.name, body.img);
    sendJson(res, 200, { ok: true });
}

async function handleFriendStatus(req, res) {
    const q = query(req);
    const uids = typeof q.uids === 'string' ? q.uids.split(',') : [];
    sendJson(res, 200, { ok: true, status: FR.status(uids) });
}

async function handleNotify(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    const r = FR.notify(body.toUid, { kind: body.kind, title: body.title, body: body.body, from: userId, data: body.data });
    if (!r) { sendError(res, 400, 'bad-notify'); return; }
    // Generic inbox ping (poll fallback pulls the full item) PLUS a typed
    // game-invite ping so recipients can prioritize the actionable popup
    // without waiting for the inbox round-trip. Both are best-effort: the
    // 5 s poller covers missed/lost streams, restarts, and multi-instance.
    try { EV.publish(body.toUid, { kind: 'notify', id: r.id }); } catch (_) {}
    try {
        if (r.kind === 'game-invite' && r.data && r.data.code) {
            EV.publish(body.toUid, { kind: 'game-invite', id: r.id, code: r.data.code });
        } else if (r.kind === 'friend-request' || r.kind === 'friend-accept' || r.kind === 'friend-decline') {
            EV.publish(body.toUid, { kind: 'friends', id: r.id });
        }
    } catch (_) {}
    sendJson(res, 200, { ok: true, id: r.id });
}

async function handleNotifyAck(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    sendJson(res, 200, { ok: true, acked: FR.ack(userId, body.ids) });
}

async function handleRankPublish(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    const r = FR.publishRank(userId, body.name, body.cat, body.rating);
    if (!r) { sendError(res, 400, 'bad-rank'); return; }
    sendJson(res, 200, { ok: true, ...r });
}

async function handleRank(req, res, userId) {
    const q = query(req);
    const friends = typeof q.friends === 'string' && q.friends ? q.friends.split(',') : [];
    sendJson(res, 200, { ok: true, ...FR.rank(q.cat, userId, friends) });
}

async function handleHallJoin(req, res, userId) {
    const body = await readBody(req);
    if (body === null) { sendError(res, 400, 'bad-json'); return; }
    sendJson(res, 200, { ok: true, ...FR.hallJoin(userId, body.name) });
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
    if (p === '/api/leaderboard' && req.method === 'GET') { await handleLeaderboard(req, res); return; }
    if (p === '/api/mm/join' && req.method === 'POST') { await handleMmJoin(req, res, id.userId); return; }
    if (p === '/api/mm/poll' && req.method === 'GET') { await handleMmPoll(req, res); return; }
    if (p === '/api/mm/leave' && req.method === 'POST') { await handleMmLeave(req, res); return; }
    if (p === '/api/friends/add' && req.method === 'POST') { await handleFriendAdd(req, res, id.userId); return; }
    if (p === '/api/friends/remove' && req.method === 'POST') { await handleFriendRemove(req, res, id.userId); return; }
    if (p === '/api/friends/list' && req.method === 'GET') { sendJson(res, 200, { ok: true, friends: FR.listEdges(id.userId) }); return; }
    if (p === '/api/friends/requests' && req.method === 'GET') { sendJson(res, 200, { ok: true, requests: FR.inboundRequests(id.userId) }); return; }
    if (p === '/api/directory' && req.method === 'GET') { await handleDirectory(req, res, id.userId); return; }
    if (p === '/api/presence' && req.method === 'POST') { await handlePresence(req, res, id.userId); return; }
    if (p === '/api/friends/status' && req.method === 'GET') { await handleFriendStatus(req, res); return; }
    if (p === '/api/notify' && req.method === 'POST') { await handleNotify(req, res, id.userId); return; }
    if (p === '/api/notify' && req.method === 'GET') { sendJson(res, 200, { ok: true, ...FR.inbox(id.userId) }); return; }
    if (p === '/api/notify/ack' && req.method === 'POST') { await handleNotifyAck(req, res, id.userId); return; }
    if (p === '/api/rank/publish' && req.method === 'POST') { await handleRankPublish(req, res, id.userId); return; }
    if (p === '/api/rank' && req.method === 'GET') { await handleRank(req, res, id.userId); return; }
    if (p === '/api/hall/join' && req.method === 'POST') { await handleHallJoin(req, res, id.userId); return; }
    if (p === '/api/hall' && req.method === 'GET') { sendJson(res, 200, { ok: true, hall: FR.hall() }); return; }
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
        console.log(`[doches api] ${VERSION} listening on http://${config.host}:${config.port}`);
        console.log(`[doches api] auth=${authMode()} db=${dbStatus().kind} redis=${redisStatus().configured ? 'configured' : 'off'}`);
        const missing = missingConfig();
        if (missing.length) console.log(`[doches api] not production-ready, still missing: ${missing.join(', ')}`);
    });
}

if (process.env.NODE_ENV !== 'test') {
    main().catch((e) => { console.error('[doches api] failed to start:', e); process.exit(1); });
}

export { server };
