/**
 * server/lib/redis.mjs — Upstash Redis over the REST interface.
 *
 * Used for rate limiting, short-lived caches and cross-instance
 * coordination. NEVER the permanent store for games, ratings or profiles
 * (that is MongoDB — see lib/db.mjs).
 *
 * Degrades to an in-memory limiter when Upstash is unreachable so a Redis
 * outage cannot take the API down; every degraded call is reported in
 * /api/health through `redis.ok`.
 */

import { config } from './env.mjs';

const BASE = config.redisUrl.replace(/\/+$/, '');
const TOKEN = config.redisToken;

let healthy = null; // null = unknown, true/false after first call
let lastError = null;

/** One REST command. Returns the parsed `result` field, or null on error. */
async function cmd(command, ttlSecFallback = null) {
    if (!BASE || !TOKEN) { healthy = false; return null; }
    try {
        const res = await fetch(BASE, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(command),
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) throw new Error('upstash ' + res.status);
        const body = await res.json();
        healthy = true;
        lastError = null;
        return body.result;
    } catch (e) {
        healthy = false;
        lastError = String((e && e.message) || e);
        if (ttlSecFallback != null) return ttlSecFallback; // caller's local fallback
        return null;
    }
}

export function redisStatus() {
    return { configured: !!(BASE && TOKEN), ok: healthy, error: lastError };
}

export async function get(key) {
    const v = await cmd(['GET', key]);
    return v == null ? null : v;
}

export async function set(key, value, ttlSec) {
    const args = ['SET', key, String(value)];
    if (ttlSec) args.push('EX', String(ttlSec));
    return cmd(args);
}

export async function del(key) { return cmd(['DEL', key]); }

/**
 * Fixed-window rate limit. Returns {allowed, remaining, resetAt}.
 * `limit` per `windowSec` for `key`. In-memory fallback keeps a local
 * window when Upstash is down (correct enough for a single instance).
 */
const memWindows = new Map();

export async function rateLimit(key, limit, windowSec) {
    const now = Date.now();
    const redisKey = `rl:${key}:${Math.floor(now / (windowSec * 1000))}`;
    const n = await cmd(['INCR', redisKey]);
    if (n != null) {
        if (n === 1) await cmd(['EXPIRE', redisKey, String(windowSec + 1)]);
        return { allowed: n <= limit, remaining: Math.max(0, limit - n), resetAt: null };
    }
    // In-memory fallback (per instance).
    const slot = Math.floor(now / (windowSec * 1000));
    const e = memWindows.get(redisKey) || { slot, n: 0 };
    if (e.slot !== slot) { e.slot = slot; e.n = 0; }
    e.n++;
    memWindows.set(redisKey, e);
    if (memWindows.size > 5000) memWindows.clear();
    return { allowed: e.n <= limit, remaining: Math.max(0, limit - e.n), resetAt: null };
}
