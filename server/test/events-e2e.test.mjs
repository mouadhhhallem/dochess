import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Full wire proof against a REAL API process:
//   ticket -> SSE stream -> friend request -> event arrives live
//
// The trigger is a friend request rather than a raw /api/notify call, because
// /api/notify is now relationship-gated (see lib/social.mjs): a signed-in
// account may no longer push inbox items at a stranger, and actionable kinds
// like game-invite must go through POST /api/invites.
const PORT = 8899;
const API = `http://127.0.0.1:${PORT}`;
let proc = null;
let DIR = null;

const ALICE = 'user_sse000000a1';
const BOB = 'user_sse000000b2';

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

/** Read from the SSE stream until `pred` matches an event, or time out. */
async function awaitEvent(events, pred, ms = 8000) {
    const deadline = Date.now() + ms;
    for (;;) {
        const lines = events.join('').split('\n').filter((l) => l.startsWith('data:'));
        for (const l of lines) {
            try {
                const msg = JSON.parse(l.slice(5).trim());
                if (pred(msg)) return msg;
            } catch (_) { /* partial frame */ }
        }
        if (Date.now() > deadline) throw new Error('no matching event arrived: ' + JSON.stringify(events.join('').slice(0, 200)));
        await new Promise((r) => setTimeout(r, 150));
    }
}

before(async () => {
    DIR = mkdtempSync(join(tmpdir(), 'dochess-sse-'));
    proc = spawn('node', ['server/index.mjs'], {
        cwd: process.cwd(),
        // Blank MONGODB_URI skips the Atlas dial (unreachable here) and
        // boots straight into the file store; dev-header auth replaces Clerk.
        env: {
            ...process.env, PORT: String(PORT), DOCHESS_DEV_NO_AUTH: '1',
            DOCHESS_DEV_FILE_STORE: '1', MONGODB_URI: '', DOCHESS_DATA_DIR: DIR,
        },
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
    if (DIR) { try { rmSync(DIR, { recursive: true, force: true }); } catch (_) {} }
});

test('sse: ticket auth, live fan-out of a friend request', async () => {
    // No ticket, no stream.
    const denied = await new Promise((resolve) => {
        http.get(`${API}/api/events?ticket=nope`, (r) => resolve(r.statusCode)).on('error', () => resolve(-1));
    });
    assert.equal(denied, 401);

    // Mint + open (dev-auth uids need 6+ chars after user_).
    const t = await call('POST', '/api/events/ticket', {}, ALICE);
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

    // BOB sends ALICE a friend request from a different account.
    const req = await call('POST', '/api/friends/request',
        { friendUid: ALICE, friendName: 'Bob Sender' }, BOB);
    assert.equal(req.status, 200);
    assert.equal(req.body.status, 'pending');

    const ev = await awaitEvent(events, (m) => m.kind === 'friend-request');
    assert.equal(ev.kind, 'friend-request');

    // The inbox item was composed by the server, and it is readable.
    const box = await call('GET', '/api/notify', undefined, ALICE);
    assert.equal(box.status, 200);
    assert.ok(box.body.items.some((m) => m.kind === 'note' && /Bob Sender/.test(m.title)),
        'the recipient has a server-composed notification');

    // And the recipient can act on it.
    const accept = await call('POST', '/api/friends/respond', { fromUid: BOB, accept: true }, ALICE);
    assert.equal(accept.status, 200);
    assert.equal(accept.body.status, 'accepted');

    stream.destroy();
});

test('notify is refused for a stranger and for actionable kinds', async () => {
    // Strangers cannot push inbox items at each other any more.
    const stranger = await call('POST', '/api/notify',
        { toUid: 'user_sse000000z9', kind: 'note', title: 'hi' }, BOB);
    assert.equal(stranger.status, 403);
    assert.equal(stranger.body.error, 'not-a-relationship');

    // Even between friends, `game-invite` is not caller-selectable. The note
    // is queued as a plain note and carries NO invitation payload: it cannot
    // render as an "Accept & Play" popup and it creates no match.
    const spoof = await call('POST', '/api/notify',
        { toUid: ALICE, kind: 'game-invite', title: 'join my room', body: 'code ABC123' }, BOB);
    assert.equal(spoof.status, 200, 'friends may still send notes to each other');

    const box = await call('GET', '/api/notify', undefined, ALICE);
    assert.ok(box.body.items.every((m) => m.kind !== 'game-invite'),
        'no caller-chosen actionable kind reaches the inbox');
    for (const m of box.body.items) {
        assert.equal(m.data, undefined, 'an inbox item never carries an invitation payload');
        assert.equal(m.matchId, undefined);
        assert.equal(m.code, undefined, 'no attacker-chosen room code is delivered');
    }

    // The room code in the note did not become a real invitation.
    const invites = await call('GET', '/api/invites', undefined, ALICE);
    assert.equal(invites.status, 200);
    assert.equal(invites.body.invites.length, 0, 'no match was created by the spoofed notify');

    // The only way to create one is POST /api/invites, which requires friendship.
    const forged = await call('POST', '/api/invites',
        { toUid: 'user_sse000000z9', minutes: 3, incSec: 0, code: 'ABC123' }, BOB);
    assert.equal(forged.status, 403);
    assert.equal(forged.body.error, 'not-friends');
});