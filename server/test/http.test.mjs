import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { securityHeaders, cors, sendError, readJson } from '../lib/http.mjs';

// Security-boundary unit tests: hermetic (no network, no secrets). The
// positive CORS-allow branch (explicit CORS_ORIGIN) is covered by
// test-auth-e2e.spec.js against a spawned server instead.

function mockRes() {
    const headers = {};
    return {
        headers,
        setHeader(k, v) { headers[k.toLowerCase()] = v; },
        status: 0,
        payload: '',
        writeHead(s, h) { this.status = s; Object.assign(headers, Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))); },
        end(b) { this.payload = b || ''; },
    };
}

function mockReq({ headers = {}, chunks = [] } = {}) {
    const em = new EventEmitter();
    em.headers = headers;
    em.destroyed = false;
    em.destroy = () => { em.destroyed = true; };
    process.nextTick(() => {
        for (const c of chunks) em.emit('data', Buffer.from(c));
        em.emit('end');
    });
    return em;
}

test('security headers are always set', () => {
    const res = mockRes();
    securityHeaders(res);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'same-origin');
    assert.equal(res.headers['x-frame-options'], 'DENY');
});

test('cors fails closed for non-matching origins', () => {
    for (const origin of ['https://evil.example', 'https://definitely-not-configured-xyz.invalid', null]) {
        const res = mockRes();
        cors({ headers: origin ? { origin } : {} }, res);
        assert.equal(res.headers['access-control-allow-origin'], undefined, 'no ACAO for ' + origin);
    }
});

test('error responses never include stack traces', () => {
    const res = mockRes();
    sendError(res, 401, 'not-signed-in');
    assert.equal(res.status, 401);
    assert.deepEqual(JSON.parse(res.payload), { ok: false, error: 'not-signed-in' });
});

test('readJson parses bodies and caps size', async () => {
    assert.deepEqual(await readJson(mockReq({ chunks: ['{"a":1}'] })), { a: 1 });
    assert.deepEqual(await readJson(mockReq()), {});
    await assert.rejects(readJson(mockReq({ chunks: ['{nope'] })), (e) => e.code === 'BAD_JSON');
    const big = mockReq({ chunks: ['x'.repeat(100)] });
    await assert.rejects(readJson(big, 10), (e) => e.code === 'TOO_LARGE');
    assert.equal(big.destroyed, true);
});
