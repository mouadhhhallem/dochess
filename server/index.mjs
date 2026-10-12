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
import { redisStatus, rateLimit, get as rget, set as rset } from './lib/redis.mjs';
import { sendJson, sendError, readJson, pathOf, query, cors, securityHeaders, header } from './lib/http.mjs';
import { SECTION_MODES } from './lib/merge.mjs';

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
    // Cache key is per database: several environments (dev, e2e, prod) may
    // share one Upstash instance, and a shared key would serve one env's
    // board to another.
    const key = 'lb:' + config.mongoDb + ':' + cat;
    const cached = await rget(key);
    if (cached) {
        try { sendJson(res, 200, JSON.parse(cached)); return; } catch (_) { /* refetch */ }
    }
    if (!LEADER_CATS.has(cat)) { sendError(res, 400, 'bad-category'); return; }

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

async function handleApi(req, res) {
    const p = pathOf(req);

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (p === '/api/health' && req.method === 'GET') { await handleHealth(req, res); return; }

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
