/**
 * server/lib/env.mjs — process config for the DoChess API.
 *
 * Reads .env from the project root (no dotenv dependency) then exposes a
 * frozen, validated config. Missing values are reported, never invented:
 * `config.missing` lists exactly what the operator still has to provide.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');

function loadDotEnv() {
    const file = join(ROOT, '.env');
    if (!existsSync(file)) return;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
    }
}

loadDotEnv();

const num = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
};

export const config = Object.freeze({
    port: num(process.env.PORT, 8787),
    host: process.env.HOST || '127.0.0.1',

    // ── MongoDB (permanent store) ─────────────────────────────────────
    mongoUri: process.env.MONGODB_URI || '',
    mongoDb: process.env.MONGODB_DB || 'dochess',

    // ── Upstash Redis (rate limits, caches, coordination) ─────────────
    redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',

    // ── Clerk (identity) ──────────────────────────────────────────────
    clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',

    // Development escape hatches — must be set EXPLICITLY, and are
    // reported as such by /api/health so nobody mistakes them for prod.
    devNoAuth: process.env.DOCHESS_DEV_NO_AUTH === '1',
    devAllowFileStore: process.env.DOCHESS_DEV_FILE_STORE !== '0',

    // CORS for a separate front-end origin during local development.
    // Empty in production: the API is same-origin behind one host.
    corsOrigin: process.env.CORS_ORIGIN || '',

    maxBodyBytes: num(process.env.MAX_BODY_BYTES, 1_500_000),

    // Dev-only: relocate the file-store directory. Used by the test suites so
    // they never read or write server/.data. Ignored when MONGODB_URI works.
    dataDir: process.env.DOCHESS_DATA_DIR || ''
});

/** Everything the operator still has to fill in for a production deploy. */
export function missingConfig() {
    const missing = [];
    if (!config.mongoUri) missing.push('MONGODB_URI');
    if (!config.clerkSecretKey && !config.devNoAuth) missing.push('CLERK_SECRET_KEY');
    if (!config.redisUrl || !config.redisToken) missing.push('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
    return missing;
}

/** True when the process can serve production traffic as configured. */
export function isProductionReady() {
    return missingConfig().length === 0 && !config.devNoAuth;
}
