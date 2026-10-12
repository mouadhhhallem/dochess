/**
 * server/lib/db.mjs — the permanent store.
 *
 * MongoDB is the source of truth (users, games). Two drivers share one
 * interface so the API runs identically in production and in local
 * development:
 *   MongoStore  — used when MONGODB_URI is set (production).
 *   FileStore   — a clearly-flagged dev fallback under server/.data/,
 *                 used ONLY when Mongo is missing and DOCHESS_DEV_FILE_STORE
 *                 is not disabled. /api/health reports which one is live.
 *
 * Collections
 *   users  { _id, createdAt, updatedAt, profile, sections: {<id>:{updatedAt,data}} }
 *   games  { _id, userId, gameId, control, opp, result, plies, delta, date }
 * Indexes: games{userId:1,date:-1}, games{gameId:1} unique.
 */

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { config, ROOT } from './env.mjs';
import { mergeSections } from './merge.mjs';

/* ── shared helpers ─────────────────────────────────────────────────── */

const now = () => Date.now();
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

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
    return rec;
}

/* ── Mongo driver ───────────────────────────────────────────────────── */

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
        this.indexesReady = false;
    }

    async connect() {
        await this.client.connect();
        await this.db.command({ ping: 1 });
        if (!this.indexesReady) {
            await this.games.createIndex({ userId: 1, date: -1 });
            await this.games.createIndex({ gameId: 1 }, { unique: true, sparse: true });
            await this.games.createIndex({ date: -1 });
            await this.users.createIndex({ updatedAt: -1 });
            this.indexesReady = true;
        }
    }

    async close() { await this.client.close(); }

    async getUser(userId) {
        const doc = await this.users.findOne({ _id: userId });
        return doc || null;
    }

    /** Read-merge-write inside a single retrying critical section. */
    async updateUser(userId, incomingSections, profile) {
        const attempt = async () => {
            const doc = await this.getUser(userId) || { _id: userId, createdAt: now(), sections: {} };
            const { changed, sections } = mergeSections(doc, incomingSections);
            const profChanged = profile ? (JSON.stringify({ ...(doc.profile || {}), ...sanitizeProfile(profile) }) !== JSON.stringify(doc.profile || {})) : false;
            if (!changed && !profChanged && doc.createdAt) return doc;
            const next = {
                ...doc,
                updatedAt: now(),
                sections,
                profile: profile ? { ...(doc.profile || {}), ...sanitizeProfile(profile) } : (doc.profile || {})
            };
            await this.users.replaceOne({ _id: userId }, next, { upsert: true });
            return next;
        };
        try {
            return await attempt();
        } catch (e) {
            // Retry once on a duplicate-key race from a concurrent writer.
            if (e && (e.code === 11000 || e.code === 11600)) return await attempt();
            throw e;
        }
    }

    async insertGame(rec) {
        if (!rec || !rec.gameId) return { ok: false, reason: 'no-gameId' };
        try {
            await this.games.insertOne({ ...rec, _id: rec.gameId });
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
}

/* ── File driver (development only) ─────────────────────────────────── */

const FILE_DIR = join(ROOT, 'server', '.data');

class FileStore {
    constructor() {
        this.kind = 'file(dev)';
        mkdirSync(FILE_DIR, { recursive: true });
    }

    async connect() { /* nothing to dial */ }
    async close() { /* nothing to close */ }

    _read(name) {
        const f = join(FILE_DIR, name);
        if (!existsSync(f)) return null;
        try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; }
    }

    _write(name, value) {
        const f = join(FILE_DIR, name);
        const tmp = f + '.tmp';
        writeFileSync(tmp, JSON.stringify(value));
        renameSync(tmp, f); // atomic-ish: never leave a half-written doc
    }

    async getUser(userId) { return this._read('user_' + userId + '.json'); }

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
        this._write(this._gamesFile(rec.userId), list.slice(0, 500));
        return { ok: true };
    }

    async listGames(userId, { limit = 20, before = null } = {}) {
        const list = this._read(this._gamesFile(userId)) || [];
        return list
            .filter((g) => !Number.isFinite(before) || g.date < before)
            .slice(0, Math.max(1, Math.min(100, limit)));
    }

    async countGames(userId) { return (this._read(this._gamesFile(userId)) || []).length; }

    /** Dev-only leaderboard scan (no index on the file store). */
    fileScanLeaderboard(cat) {
        const out = [];
        for (const f of readdirSync(FILE_DIR)) {
            if (!f.startsWith('user_')) continue;
            const doc = this._read(f);
            if (!doc) continue;
            const rating = doc.sections?.ratings?.data?.cats?.[cat];
            if (!Number.isFinite(rating)) continue;
            out.push({
                uid: doc._id,
                name: (doc.profile && doc.profile.name) || 'Player',
                image: (doc.profile && doc.profile.image) || null,
                rating
            });
        }
        return out.sort((a, b) => b.rating - a.rating).slice(0, 50);
    }
}

/* ── lifecycle ──────────────────────────────────────────────────────── */

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
    if (!store) throw new Error('database not initialised — call initDb() first');
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
