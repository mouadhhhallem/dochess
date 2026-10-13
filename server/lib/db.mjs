/**
 * server/lib/db.mjs â€” the permanent store.
 *
 * MongoDB is the source of truth (users, games). Two drivers share one
 * interface so the API runs identically in production and in local
 * development:
 *   MongoStore  â€” used when MONGODB_URI is set (production).
 *   FileStore   â€” a clearly-flagged dev fallback under server/.data/,
 *                 used ONLY when Mongo is missing and DOCHESS_DEV_FILE_STORE
 *                 is not disabled. /api/health reports which one is live.
 *
 * Collections
 *   users  { _id, createdAt, updatedAt, profile, sections: {<id>:{updatedAt,data}} }
 *   games  { _id, userId, gameId, control, opp, result, plies, delta, date }
 *   friends / requests / invites / presence
 *          { _id, ... } â€” the social graph. See lib/social.mjs: these are
 *          the AUTHORITATIVE friendship, request, invitation and presence
 *          records. They used to live in process memory (server/lib/friends.mjs)
 *          and were lost on every restart.
 * Indexes: games{userId:1,date:-1}, unique games{userId:1,gameId:1},
 *          friends{a:1}, friends{b:1}, requests{to:1}, requests{from:1},
 *          invites{to:1}, invites{expiresAt:1}.
 *
 * Generic document access (getDoc/putDoc/delDoc/listDocs/findDocs) exists so
 * a feature store can run unchanged on MongoDB (production) and on the dev
 * file store (tests / offline development).
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { config, ROOT } from './env.mjs';
import { mergeSections } from './merge.mjs';

/* â”€â”€ shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const now = () => Date.now();
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/**
 * A rating-category value is either a bare number (legacy hand-written
 * records) or the live ratings object {rating, best, games, ...} that the
 * client syncs from `ccr_<uid>`. Accept both; prefer the current rating.
 */
export function extractCatRating(v) {
    if (Number.isFinite(v)) return v;
    if (v && typeof v === 'object') {
        if (Number.isFinite(v.rating)) return v.rating;
        if (Number.isFinite(v.best)) return v.best;
    }
    return null;
}

export function sanitizeProfile(raw) {
    if (!isObj(raw)) return {};
    const clean = {};
    if (typeof raw.name === 'string') clean.name = raw.name.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 64);
    if (typeof raw.image === 'string' && /^https:/.test(raw.image)) clean.image = raw.image.slice(0, 2048);
    if (typeof raw.email === 'string' && raw.email.length < 200) clean.email = raw.email;
    return clean;
}

export function sanitizeGameRecord(raw, userId) {
    if (!isObj(raw)) return null;
    const rec = {
        userId,
        gameId: typeof raw.gameId === 'string' ? raw.gameId.slice(0, 64) : null,
        result: typeof raw.result === 'string' ? raw.result.replace(/[^\w-]/g, '').slice(0, 16) : 'unknown',
        plies: Number.isInteger(raw.plies) ? Math.max(0, Math.min(800, raw.plies)) : 0,
        date: Number.isFinite(raw.date) ? raw.date : now()
    };
    if (isObj(raw.control)) {
        rec.control = {
            id: String(raw.control.id || '').replace(/[^\w-]/g, '').slice(0, 16),
            base: Number.isFinite(raw.control.base) ? raw.control.base : null,
            inc: Number.isFinite(raw.control.inc) ? raw.control.inc : null
        };
    }
    if (typeof raw.delta === 'number' && Number.isFinite(raw.delta)) rec.delta = Math.max(-500, Math.min(500, Math.round(raw.delta)));
    if (typeof raw.opp === 'string') rec.opp = raw.opp.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 48);
    // Ordered move history (UCI strings), final position, termination and
    // rating bookends â€” all optional, all bounded. Absent on legacy records.
    if (Array.isArray(raw.moves)) {
        rec.moves = raw.moves
            .filter((m) => typeof m === 'string')
            .map((m) => m.replace(/[^\w\-+=#]/g, '').slice(0, 16))
            .filter((m) => m.length >= 4)
            .slice(0, 600);
    }
    if (typeof raw.finalFen === 'string' && /^[rnbqkpRNBQKP1-8/\s w b\-0-9]+$/.test(raw.finalFen)) {
        rec.finalFen = raw.finalFen.trim().slice(0, 100);
    }
    if (typeof raw.termination === 'string') {
        rec.termination = raw.termination.replace(/[^\w-]/g, '').slice(0, 24) || 'unknown';
    }
    for (const k of ['ratingBefore', 'ratingAfter']) {
        if (Number.isInteger(raw[k])) rec[k] = Math.max(0, Math.min(4000, raw[k]));
    }
    if (Number.isFinite(raw.endedAt)) rec.endedAt = raw.endedAt;
    return rec;
}

/* â”€â”€ Mongo driver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class MongoStore {
    constructor(uri, dbName) {
        this.kind = 'mongo';
        this.client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10
        });
        this.db = this.client.db(dbName);
        this.users = this.db.collection('users');
        this.games = this.db.collection('games');
        this.social = {
            friends: this.db.collection('friends'),
            requests: this.db.collection('requests'),
            invites: this.db.collection('invites'),
            presence: this.db.collection('presence'),
            notify: this.db.collection('notify')
        };
        this.indexesReady = false;
    }

    async connect() {
        await this.client.connect();
        await this.db.command({ ping: 1 });
        if (!this.indexesReady) {
            await this.games.createIndex({ userId: 1, date: -1 });
            // Per-user game history: both players hold their own copy of a
            // shared game id, so uniqueness is (userId, gameId) â€” retries stay
            // idempotent per user without dropping the other player's copy.
            await this.games.createIndex({ userId: 1, gameId: 1 }, { unique: true });
            await this.games.createIndex({ date: -1 });
            await this.users.createIndex({ updatedAt: -1 });
            // Social graph indexes: every lookup in lib/social.mjs is by
            // "the rows where this uid appears in column X".
            await this.social.friends.createIndex({ a: 1 });
            await this.social.friends.createIndex({ b: 1 });
            await this.social.requests.createIndex({ to: 1 });
            await this.social.requests.createIndex({ from: 1 });
            await this.social.invites.createIndex({ to: 1 });
            await this.social.invites.createIndex({ expiresAt: 1 });
            await this.social.notify.createIndex({ to: 1, at: -1 });
            // Legacy global gameId uniqueness (pre per-user history): drop it
            // once so cross-player copies of one game id can coexist.
            try { await this.games.dropIndex('gameId_1'); } catch (_) { /* already gone */ }
            this.indexesReady = true;
        }
    }

    async close() { await this.client.close(); }

    async getUser(userId) {
        const doc = await this.users.findOne({ _id: userId });
        return doc || null;
    }

    /**
     * Create the account document if it does not exist yet, and nothing
     * else. Registration must be observable the moment it happens: the global
     * ladder is built from `users`, so an account whose first sync carries
     * no sections and no profile would otherwise stay invisible until it
     * happened to save something.
     */
    async ensureUser(userId, profile) {
        if (!userId) return null;
        const existing = await this.getUser(userId);
        if (existing) return existing;
        const doc = {
            _id: userId,
            createdAt: now(),
            updatedAt: now(),
            profile: sanitizeProfile(profile),
            sections: {},
        };
        await this.users.updateOne(
            { _id: userId },
            { $setOnInsert: doc },
            { upsert: true }
        );
        return this.getUser(userId);
    }

    /**
     * Read-merge-write with per-section atomicity. Concurrent PUTs from one
     * user (background sync + a manual save, two devices at once) must never
     * clobber each other's sections: only the sections this call merged are
     * $set, and each carries a freshness guard so an older writer cannot
     * overwrite a newer section that landed mid-merge (LWW holds per
     * section, not per document). Retries re-read and re-merge, staying
     * idempotent.
     */
    async updateUser(userId, incomingSections, profile) {
        // Up to 3 rounds: losing a same-section race re-reads and re-merges,
        // so the sections that still win get their write instead of being
        // dropped alongside the loser.
        for (let round = 0; round < 3; round++) {
            try {
                const doc = await this.getUser(userId) || { _id: userId, createdAt: now(), sections: {} };
                // Snapshot BEFORE mergeSections mutates doc.sections in place â€”
                // a live reference would compare equal to itself and skip
                // every write.
                const before = { ...((doc && isObj(doc.sections)) ? doc.sections : {}) };
                const { sections } = mergeSections(doc, incomingSections);
                const set = {};
                const guards = [];
                if (isObj(incomingSections)) {
                    for (const id of Object.keys(incomingSections)) {
                        // Section ids are server-known ([a-z]); never let a client
                        // key become a dotted Mongo field path.
                        if (!/^[a-z]+$/.test(id)) continue;
                        if (sections[id] === before[id]) continue; // nothing won â€” leave it
                        const upd = sections[id] && Number.isFinite(sections[id].updatedAt) ? sections[id].updatedAt : -1;
                        set['sections.' + id] = sections[id];
                        guards.push({ $or: [
                            { ['sections.' + id]: { $exists: false } },
                            { ['sections.' + id + '.updatedAt']: { $lt: upd } }
                        ] });
                    }
                }
                const nextProfile = profile ? { ...(doc.profile || {}), ...sanitizeProfile(profile) } : (doc.profile || {});
                const profChanged = profile ? (JSON.stringify(nextProfile) !== JSON.stringify(doc.profile || {})) : false;
                if (profChanged) set.profile = nextProfile;
                if (!Object.keys(set).length && doc.createdAt) return doc;
                set.updatedAt = now();
                const res = await this.users.updateOne(
                    guards.length ? { _id: userId, $and: guards } : { _id: userId },
                    { $set: set, $setOnInsert: { _id: userId, createdAt: doc.createdAt || now() } },
                    { upsert: true }
                );
                const won = ((res && res.modifiedCount) || 0) > 0 || ((res && res.upsertedCount) || 0) > 0 ||
                    ((res && res.matchedCount) || 0) > 0 || !guards.length;
                // Lost a same-section race on at least one section: loop
                // re-reads â€” the fresh document already holds the winner, and
                // our remaining sections merge against it instead of vanishing.
                if (won) return await this.getUser(userId);
            } catch (e) {
                // Upsert/insert race from a concurrent writer â€” retry while
                // rounds remain, then fail loudly (never silently drop).
                if (e && (e.code === 11000 || e.code === 11600) && round < 2) continue;
                throw e;
            }
        }
        return await this.getUser(userId);
    }

    async insertGame(rec) {
        if (!rec || !rec.gameId) return { ok: false, reason: 'no-gameId' };
        try {
            // Document id is per-user: both players keep their own copy of a
            // shared game id (matches the {userId, gameId} unique index).
            await this.games.insertOne({ ...rec, _id: rec.userId + ':' + rec.gameId });
            return { ok: true };
        } catch (e) {
            if (e && e.code === 11000) return { ok: true, duplicate: true }; // idempotent
            throw e;
        }
    }

    async listGames(userId, { limit = 20, before = null } = {}) {
        const q = { userId };
        if (Number.isFinite(before)) q.date = { $lt: before };
        return this.games.find(q).sort({ date: -1 }).limit(Math.max(1, Math.min(100, limit))).toArray();
    }

    async countGames(userId) { return this.games.countDocuments({ userId }); }

    /** Every recorded game (rating derivation reads this). */
    async listAllGames() { return this.games.find({}).toArray(); }

    /* â”€â”€ generic document access (used by lib/social.mjs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

    _coll(name) {
        const c = this.social && this.social[name];
        if (!c) throw new Error('unknown collection ' + name);
        return c;
    }

    async getDoc(name, id) {
        if (typeof id !== 'string' || !id) return null;
        const doc = await this._coll(name).findOne({ _id: id });
        return doc || null;
    }

    /**
     * Idempotent upsert. Returns the document as stored. A concurrent
     * double-write of the same id converges on one row (unique _id), which is
     * what makes accept/decline races safe.
     */
    async putDoc(name, id, doc) {
        if (typeof id !== 'string' || !id) throw new Error('bad doc id');
        await this._coll(name).updateOne(
            { _id: id },
            { $set: { ...doc, _id: id } },
            { upsert: true }
        );
        return this.getDoc(name, id);
    }

    /** Delete by id. Returns true when a row was actually removed. */
    async delDoc(name, id) {
        if (typeof id !== 'string' || !id) return false;
        const res = await this._coll(name).deleteOne({ _id: id });
        return !!((res && res.deletedCount) || 0);
    }

    async listDocs(name) {
        return this._coll(name).find({}).toArray();
    }

    /** Index-light scan with a server-side match stage; used for ranking. */
    async findDocs(name, query = {}, { limit = 0, projection = null } = {}) {
        let cur = this._coll(name).find(query);
        if (projection) cur = cur.project(projection);
        if (limit > 0) cur = cur.limit(limit);
        return cur.toArray();
    }

    /** Every registered account's id + public profile (ranking source). */
    async listUserIdentities() {
        return this.users.find({}, { projection: { _id: 1, profile: 1, createdAt: 1 } }).toArray();
    }
}

/* â”€â”€ File driver (development only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

// Resolved lazily on every call (not at module load) so a test suite can
// point the dev store at a temp directory after the module graph has
// already loaded, and so the two suites cannot pollute server/.data.
function FILE_DIR() {
    return process.env.DOCHESS_DATA_DIR || join(ROOT, 'server', '.data');
}

class FileStore {
    constructor() {
        this.kind = 'file(dev)';
        mkdirSync(FILE_DIR(), { recursive: true });
    }

    async connect() { /* nothing to dial */ }
    async close() { /* nothing to close */ }

    _read(name) {
        const f = join(FILE_DIR(), name);
        if (!existsSync(f)) return null;
        try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; }
    }

    _write(name, value) {
        const f = join(FILE_DIR(), name);
        const tmp = f + '.tmp';
        writeFileSync(tmp, JSON.stringify(value));
        renameSync(tmp, f); // atomic-ish: never leave a half-written doc
    }

    async getUser(userId) { return this._read('user_' + userId + '.json'); }

    async ensureUser(userId, profile) {
        if (!userId) return null;
        // `await` matters: getUser is async, and a bare Promise is always
        // truthy — which would make this method a no-op that never creates
        // the account.
        const existing = await this.getUser(userId);
        if (existing) return existing;
        const doc = { _id: userId, createdAt: now(), updatedAt: now(), profile: sanitizeProfile(profile), sections: {} };
        this._write('user_' + userId + '.json', doc);
        return doc;
    }

    async updateUser(userId, incomingSections, profile) {
        const doc = this._read('user_' + userId + '.json') || { _id: userId, createdAt: now(), sections: {} };
        const { changed, sections } = mergeSections(doc, incomingSections);
        const profChanged = profile ? (JSON.stringify({ ...(doc.profile || {}), ...sanitizeProfile(profile) }) !== JSON.stringify(doc.profile || {})) : false;
        if (!changed && !profChanged) return doc;
        const next = { ...doc, updatedAt: now(), sections, profile: profile ? { ...(doc.profile || {}), ...sanitizeProfile(profile) } : (doc.profile || {}) };
        this._write('user_' + userId + '.json', next);
        return next;
    }

    _gamesFile(userId) { return 'games_' + userId.replace(/[^\w-]/g, '_') + '.json'; }

    async insertGame(rec) {
        if (!rec || !rec.gameId) return { ok: false, reason: 'no-gameId' };
        const list = this._read(this._gamesFile(rec.userId)) || [];
        if (list.some((g) => g.gameId === rec.gameId)) return { ok: true, duplicate: true };
        list.unshift(rec);
        // Dev file store: keep up to 2000 games per user (aligned with
        // lib/merge.mjs MAX_GAMES) - history is never casually trimmed.
        this._write(this._gamesFile(rec.userId), list.slice(0, 2000));
        return { ok: true };
    }

    async listGames(userId, { limit = 20, before = null } = {}) {
        const list = this._read(this._gamesFile(userId)) || [];
        return list
            .filter((g) => !Number.isFinite(before) || g.date < before)
            .slice(0, Math.max(1, Math.min(100, limit)));
    }

    async countGames(userId) { return (this._read(this._gamesFile(userId)) || []).length; }

    /** Every recorded game (rating derivation reads this). */
    async listAllGames() {
        const out = [];
        for (const f of readdirSync(FILE_DIR())) {
            if (!f.startsWith('games_') || !f.endsWith('.json')) continue;
            const list = this._read(f);
            if (Array.isArray(list)) out.push(...list);
        }
        return out;
    }

    /** Dev-only leaderboard scan (no index on the file store). */
    fileScanLeaderboard(cat) {
        const out = [];
        for (const f of readdirSync(FILE_DIR())) {
            if (!f.startsWith('user_')) continue;
            const doc = this._read(f);
            if (!doc) continue;
            const rating = extractCatRating(doc.sections?.ratings?.data?.cats?.[cat]);
            if (rating == null) continue;
            out.push({
                uid: doc._id,
                name: (doc.profile && doc.profile.name) || 'Player',
                image: (doc.profile && doc.profile.image) || null,
                rating
            });
        }
        return out.sort((a, b) => b.rating - a.rating).slice(0, 50);
    }

    /* â”€â”€ generic document access (dev parity with MongoStore) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

    _collFile(name) { return 'coll_' + name.replace(/[^\w-]/g, '_') + '.json'; }

    _readColl(name) {
        const v = this._read(this._collFile(name));
        return Array.isArray(v) ? v : [];
    }

    /** Matches Mongo semantics for the operators this store supports. */
    static _matches(doc, q) {
        for (const [k, want] of Object.entries(q || {})) {
            if (k === '$or') {
                if (!Array.isArray(want) || !want.some((sub) => FileStore._matches(doc, sub))) return false;
                continue;
            }
            const have = doc[k];
            if (want && typeof want === 'object' && !Array.isArray(want)) {
                if ('$exists' in want) {
                    if (!!want.$exists !== (have !== undefined)) return false;
                    continue;
                }
                if ('$in' in want) {
                    const list = Array.isArray(want.$in) ? want.$in : [];
                    if (!list.includes(have)) return false;
                    continue;
                }
                if ('$lt' in want && !(Number.isFinite(have) && have < want.$lt)) return false;
                if ('$ne' in want && have === want.$ne) return false;
                continue;
            }
            if (have !== want) return false;
        }
        return true;
    }

    async getDoc(name, id) {
        if (typeof id !== 'string' || !id) return null;
        return this._readColl(name).find((d) => d && d._id === id) || null;
    }

    async putDoc(name, id, doc) {
        if (typeof id !== 'string' || !id) throw new Error('bad doc id');
        const rows = this._readColl(name);
        const next = { ...doc, _id: id };
        const ix = rows.findIndex((d) => d && d._id === id);
        if (ix >= 0) rows[ix] = next; else rows.push(next);
        this._write(this._collFile(name), rows);
        return next;
    }

    async delDoc(name, id) {
        if (typeof id !== 'string' || !id) return false;
        const rows = this._readColl(name);
        const ix = rows.findIndex((d) => d && d._id === id);
        if (ix < 0) return false;
        rows.splice(ix, 1);
        this._write(this._collFile(name), rows);
        return true;
    }

    async listDocs(name) { return this._readColl(name); }

    async findDocs(name, query = {}, { limit = 0, projection = null } = {}) {
        const rows = this._readColl(name).filter((d) => FileStore._matches(d, query));
        const out = limit > 0 ? rows.slice(0, limit) : rows;
        if (!projection) return out;
        return out.map((d) => {
            const o = {};
            for (const k of Object.keys(d)) {
                if (k in projection || projection[k] === 1) o[k] = d[k];
            }
            return o;
        });
    }

    async listUserIdentities() {
        const out = [];
        for (const f of readdirSync(FILE_DIR())) {
            if (!f.startsWith('user_') || !f.endsWith('.json')) continue;
            const doc = this._read(f);
            if (!doc || !doc._id) continue;
            out.push({ _id: doc._id, profile: doc.profile || {}, createdAt: doc.createdAt || 0 });
        }
        return out;
    }
}

/* â”€â”€ lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

let store = null;
let storeError = null;

export async function initDb() {
    if (store) return store;
    if (config.mongoUri) {
        try {
            const s = new MongoStore(config.mongoUri, config.mongoDb);
            await s.connect();
            store = s;
            storeError = null;
            return store;
        } catch (e) {
            storeError = 'mongo: ' + String((e && e.message) || e);
            if (!config.devAllowFileStore) throw e;
        }
    } else {
        storeError = config.devAllowFileStore ? 'MONGODB_URI not set' : 'MONGODB_URI not set and file store disabled';
        if (!config.devAllowFileStore) throw new Error(storeError);
    }
    store = new FileStore();
    await store.connect();
    return store;
}

export function db() {
    if (!store) throw new Error('database not initialised â€” call initDb() first');
    return store;
}

export function dbStatus() {
    return {
        kind: store ? store.kind : 'none',
        error: storeError,
        mongoConfigured: !!config.mongoUri
    };
}

export async function closeDb() {
    if (store && typeof store.close === 'function') await store.close();
    store = null;
}
