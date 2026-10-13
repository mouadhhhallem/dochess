import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

// Full wire proof: ticket -> SSE stream -> notify -> event arrives live.
const PORT = 8899;
const API = `http://127.0.0.1:${PORT}`;
let proc = null;

function call(method, path, body, uid) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : JSON.stringify(body);
        const req = http.request(`${API}${path}`, {
            method,
            headers: {
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(uid ? { 'x-dochess-user': uid } : {}),
            },
        }, (res) => {
            let s = '';
            res.on('data', (c) => { s += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: s ? JSON.parse(s) : null }));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

before(async () => {
    proc = spawn('node', ['server/index.mjs'], {
        cwd: process.cwd(),
        // Blank MONGODB_URI skips the Atlas dial (unreachable here) and
        // boots straight into the file store; dev-header auth replaces Clerk.
        env: { ...process.env, PORT: String(PORT), DOCHESS_DEV_NO_AUTH: '1', DOCHESS_DEV_FILE_STORE: '1', MONGODB_URI: '' },
        stdio: 'ignore',
    });
    const deadline = Date.now() + 20000;
    for (;;) {
        try {
            const h = await call('GET', '/api/health');
            if (h.status === 200 && h.body && h.body.ok) break;
        } catch (_) {}
        if (Date.now() > deadline) throw new Error('dev api did not start');
        await new Promise((r) => setTimeout(r, 300));
    }
});

after(() => {
    if (proc) { try { proc.kill(); } catch (_) {} proc = null; }
});

test('sse: ticket auth, live fan-out on notify', async () => {
    // No ticket, no stream.
    const denied = await new Promise((resolve) => {
        http.get(`${API}/api/events?ticket=nope`, (r) => resolve(r.statusCode)).on('error', () => resolve(-1));
    });
    assert.equal(denied, 401);
    // Mint + open (dev-auth uids need 6+ chars after user_).
    const t = await call('POST', '/api/events/ticket', {}, 'user_sse001');
    assert.ok(t.body && typeof t.body.ticket === 'string');
    const events = [];
    const stream = http.get(`${API}/api/events?ticket=${t.body.ticket}`);
    await new Promise((resolve, reject) => {
        stream.on('response', (res) => {
            assert.equal(res.statusCode, 200);
            assert.match(res.headers['content-type'] || '', /text\/event-stream/);
            res.on('data', (c) => events.push(c.toString()));
            resolve();
        });
        stream.on('error', reject);
        setTimeout(() => reject(new Error('stream never opened')), 8000);
    });
    // Trigger: notify the subscriber from another user.
    const n = await call('POST', '/api/notify', { toUid: 'user_sse001', kind: 'note', title: 'Hi', body: 'live?' }, 'user_sse002');
    assert.equal(n.status, 200);
    const deadline = Date.now() + 8000;
    for (;;) {
        const blob = events.join('');
        const line = blob.split('\n').find((l) => l.startsWith('data:'));
        if (line) {
            const msg = JSON.parse(line.slice(5).trim());
            assert.equal(msg.kind, 'notify');
            break;
        }
        if (Date.now() > deadline) throw new Error('no event arrived: ' + JSON.stringify(blob.slice(0, 200)));
        await new Promise((r) => setTimeout(r, 200));
    }
    stream.destroy();
});
