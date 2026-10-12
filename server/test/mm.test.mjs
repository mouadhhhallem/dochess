import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatcher, MM_START_ELO } from '../lib/mm.mjs';

test('mm: first searcher waits with a ticket', () => {
    const mm = createMatcher();
    const r = mm.join({ uid: 'u1', name: 'Alpha', elo: 812, cat: 'blitz' });
    assert.ok(r.ticket);
    assert.equal(r.matched, undefined);
    const p = mm.poll(r.ticket);
    assert.equal(p.status, 'waiting');
    assert.equal(p.position, 1);
    assert.equal(p.waiters, 1);
});

test('mm: closest ELO pairs instantly, testing mode pairs ANY gap', () => {
    const mm = createMatcher();
    const a = mm.join({ uid: 'u1', name: 'Alpha', elo: 800, cat: 'blitz' });
    const b = mm.join({ uid: 'u2', name: 'Beta', elo: 820, cat: 'blitz' });
    const c = mm.join({ uid: 'u3', name: 'Gamma', elo: 2400, cat: 'blitz' });
    // b pairs with a (gap 20); c waits alone.
    assert.ok(b.matched);
    assert.equal(b.matched.opp.name, 'Alpha');
    assert.equal(b.matched.gap, 20);
    assert.equal(c.matched, undefined);
    // The longer-waiting side hosts.
    assert.equal(b.matched.role, 'join');
    const pa = mm.poll(a.ticket);
    assert.equal(pa.status, 'matched');
    assert.equal(pa.role, 'host');
    assert.equal(pa.code, b.matched.code);
    assert.equal(pa.opp.name, 'Beta');
    // Far opponent still pairs (no distance gate): join a 4th player.
    const d = mm.join({ uid: 'u4', name: 'Delta', elo: 900, cat: 'blitz' });
    assert.ok(d.matched, 'far ELO must still pair in testing mode');
    assert.equal(d.matched.opp.name, 'Gamma');
    assert.ok(d.matched.gap > 1000);
});

test('mm: categories never cross-pair', () => {
    const mm = createMatcher();
    mm.join({ uid: 'u1', name: 'A', elo: 800, cat: 'blitz' });
    const r = mm.join({ uid: 'u2', name: 'B', elo: 800, cat: 'rapid' });
    assert.equal(r.matched, undefined);
});

test('mm: match dies after both sides ack; unknown tickets are gone', () => {
    const mm = createMatcher();
    const a = mm.join({ uid: 'u1', name: 'A', elo: 800, cat: 'blitz' });
    const b = mm.join({ uid: 'u2', name: 'B', elo: 800, cat: 'blitz' });
    mm.poll(a.ticket);
    mm.poll(b.ticket); // second ack reaps the match
    assert.equal(mm._matches.size, 0);
    assert.deepEqual(mm.poll('nope'), { status: 'gone' });
    assert.deepEqual(mm.poll(''), { status: 'gone' });
});

test('mm: leave drops the waiter; partner reaps via TTL path', () => {
    const mm = createMatcher();
    const a = mm.join({ uid: 'u1', name: 'A', elo: 800, cat: 'blitz' });
    assert.equal(mm.leave(a.ticket), true);
    assert.equal(mm.poll(a.ticket).status, 'gone');
    assert.equal(mm.leave('nope'), false);
});

test('mm: sweep drops stale waiters and matches', () => {
    const mm = createMatcher({ waiterTtlMs: 100, matchTtlMs: 100 });
    const a = mm.join({ uid: 'u1', name: 'A', elo: 800, cat: 'blitz' });
    mm.join({ uid: 'u2', name: 'B', elo: 800, cat: 'blitz' });
    const out = mm.sweep(Date.now() + 1000);
    assert.equal(out.matches, 1);
    assert.equal(mm.poll(a.ticket).status, 'gone');
    const c = mm.join({ uid: 'u3', name: 'C', elo: 800, cat: 'blitz' });
    const out2 = mm.sweep(Date.now() + 1000);
    assert.equal(out2.waiters, 1);
    assert.equal(mm.poll(c.ticket).status, 'gone');
});

test('mm: hostile input is sanitized, never throws', () => {
    const mm = createMatcher();
    const r = mm.join({ uid: '!!!', name: '\x00\x01', elo: 'junk', cat: '../../x' });
    assert.ok(r.ticket);
    const p = mm.poll(r.ticket);
    assert.equal(p.status, 'waiting');
    const w = mm._waiters.get(r.ticket);
    assert.equal(w.uid, 'guest');
    assert.equal(w.name, 'Player');
    assert.equal(w.elo, MM_START_ELO);
    assert.equal(w.cat, 'blitz');
    assert.doesNotThrow(() => mm.join());
    assert.doesNotThrow(() => mm.poll(null));
    assert.doesNotThrow(() => mm.leave(null));
});
