/**
 * server/lib/http.mjs — tiny helpers around node:http.
 * No framework: the API is six routes and does not need one.
 */

import { config } from './env.mjs';

export const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

export function securityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
}

export function cors(req, res) {
    const origin = header(req, 'origin');
    if (!config.corsOrigin || !origin) return;
    if (origin !== config.corsOrigin) return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-dochess-user');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
    res.setHeader('Vary', 'Origin');
}

export function header(req, name) {
    const v = req.headers[name];
    return Array.isArray(v) ? (v[0] || null) : (v || null);
}

export function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { ...JSON_HEADERS, 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
}

export function sendError(res, status, error, extra = {}) {
    sendJson(res, status, { ok: false, error, ...extra });
}

/** Read and JSON-parse a request body with a hard size cap. */
export function readJson(req, maxBytes = config.maxBodyBytes) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > maxBytes) {
                reject(Object.assign(new Error('payload too large'), { code: 'TOO_LARGE' }));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            if (!chunks.length) { resolve({}); return; }
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (_) {
                reject(Object.assign(new Error('invalid json'), { code: 'BAD_JSON' }));
            }
        });
        req.on('error', reject);
    });
}

/** Parse `?limit=&before=` safely. */
export function query(req) {
    const url = new URL(req.url, 'http://localhost');
    const out = {};
    for (const [k, v] of url.searchParams) out[k] = v;
    return out;
}

export function pathOf(req) {
    return new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
}
