/**
 * server/lib/auth.mjs — server-side identity.
 *
 * Production: verify the Clerk session JWT the browser gets from
 * `Clerk.session.getToken()` against Clerk's JWKS (signed, exp-checked).
 * The client-supplied user id is NEVER trusted — it always comes from the
 * verified token's `sub` claim.
 *
 * Development: `DOCHESS_DEV_NO_AUTH=1` accepts an `x-doChess-user` header
 * (validated to Clerk's id shape) so the whole pipeline can be exercised
 * without a secret key. /api/health reports the mode; production refuses
 * to boot with it on (see server/index.mjs).
 */

import { createLocalJWKSet, jwtVerify } from 'jose';
import { config } from './env.mjs';

const JWKS_URL = 'https://api.clerk.com/v1/jwks';
const JWKS_TTL_MS = 60 * 60 * 1000;

let jwks = null;
let jwksAt = 0;
let jwksError = null;

async function loadJwks() {
    if (jwks && Date.now() - jwksAt < JWKS_TTL_MS) return jwks;
    if (!config.clerkSecretKey) throw new Error('CLERK_SECRET_KEY is not configured');
    const res = await fetch(JWKS_URL, {
        headers: { Authorization: `Bearer ${config.clerkSecretKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error('clerk jwks ' + res.status);
    const body = await res.json();
    if (!body || !Array.isArray(body.keys) || !body.keys.length) throw new Error('clerk jwks empty');
    jwks = createLocalJWKSet(body);
    jwksAt = Date.now();
    jwksError = null;
    return jwks;
}

/** Drop the cached JWKS (call after a signature failure to force a refetch). */
export function resetJwks() { jwks = null; jwksAt = 0; }

export function authMode() {
    if (config.devNoAuth) return 'dev-header';
    return config.clerkSecretKey ? 'clerk' : 'unconfigured';
}

export function authStatus() {
    return { mode: authMode(), jwksError };
}

const USER_ID_RE = /^user_[A-Za-z0-9_-]{6,64}$/;

/**
 * Resolve the caller's user id from the request headers.
 * Returns { ok:true, userId } or { ok:false, status, error }.
 */
export async function identify(req) {
    const token = bearerToken(req);

    if (token) {
        try {
            const set = await loadJwks();
            // Issuer is the instance's frontend API; accept either the
            // dashboard-style or the clerk.accounts.dev issuer form.
            const { payload } = await jwtVerify(token, set, {
                clockTolerance: 30
            });
            const sub = typeof payload.sub === 'string' ? payload.sub : '';
            if (!USER_ID_RE.test(sub)) return { ok: false, status: 401, error: 'bad-subject' };
            return { ok: true, userId: sub, via: 'clerk' };
        } catch (e) {
            jwksError = String((e && e.message) || e);
            // One forced JWKS refresh, then fail closed.
            try {
                resetJwks();
                const set = await loadJwks();
                const { payload } = await jwtVerify(token, set, { clockTolerance: 30 });
                const sub = typeof payload.sub === 'string' ? payload.sub : '';
                if (!USER_ID_RE.test(sub)) return { ok: false, status: 401, error: 'bad-subject' };
                return { ok: true, userId: sub, via: 'clerk' };
            } catch (e2) {
                return { ok: false, status: 401, error: 'invalid-token' };
            }
        }
    }

    if (config.devNoAuth) {
        const dev = header(req, 'x-dochess-user');
        if (dev && USER_ID_RE.test(dev)) return { ok: true, userId: dev, via: 'dev-header' };
        return { ok: false, status: 401, error: 'dev-header-missing' };
    }

    return { ok: false, status: 401, error: 'not-signed-in' };
}

export function bearerToken(req) {
    const h = header(req, 'authorization');
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h);
    return m ? m[1].trim() : null;
}

export function header(req, name) {
    const v = req.headers[name];
    if (Array.isArray(v)) return v[0] || null;
    return v || null;
}
