import test from 'node:test';
import assert from 'node:assert/strict';
import { createFriendStore } from '../lib/friends.mjs';

test('friends: one-sided edge is pending, mutual edges confirm', () => {
    const fr = createFriendStore();
    const r = fr.addEdge('u1', { uid: 'u2', name: 'Beta' });
    assert.equal(r.confirmed, false);
    assert.deepEqual(fr.listEdges('u1').map((f) => f.confirmed), [false]);
    assert.deepEqual(fr.listEdges('u2'), []);
    const r2 = fr.addEdge('u2', { uid: 'u1', name: 'Alpha' });
    assert.equal(r2.confirmed, true);
    assert.deepEqual(fr.listEdges('u1').map((f) => f.confirmed), [true]);
    assert.equal(fr.removeEdge('u1', 'u2'), true);
    assert.deepEqual(fr.listEdges('u1'), []);
    // Removing one side un-confirms the other.
    assert.deepEqual(fr.listEdges('u2').map((f) => f.confirmed), [false]);
});

test('friends: self-add and garbage are refused', () => {
    const fr = createFriendStore();
    assert.equal(fr.addEdge('u1', { uid: 'u1', name: 'Me' }), null);
    assert.equal(fr.addEdge('u1', { uid: '!!!', name: 'X' }), null);
    assert.equal(fr.addEdge(null, { uid: 'u2' }), null);
    const r = fr.addEdge('u1', { uid: 'u2', name: '\x00\x01' });
    assert.equal(r.friend.name, 'Player');
});

test('presence: heartbeat TTL, status map', () => {
    const fr = createFriendStore();
    assert.equal(fr.heartbeat('u1', 'Alpha'), true);
    assert.equal(fr.heartbeat(null), false);
    let s = fr.status(['u1', 'u9']);
    assert.equal(s.u1.online, true);
    assert.equal(s.u9.online, false);
    s = fr.status(['u1'], Date.now() + 3600_000);
    assert.equal(s.u1.online, false);
    assert.ok(s.u1.lastSeen > 0);
});

test('notify: inbox caps, unread counts, ack', () => {
    const fr = createFriendStore();
    const n = fr.notify('u2', { kind: 'friend-request', title: 'Hi', body: 'lets play', from: 'u1' });
    assert.ok(n.id);
    assert.equal(n.kind, 'friend-request');
    const bad = fr.notify('u2', { kind: 'evil', title: 'x'.repeat(200), body: 'y' });
    assert.equal(bad.kind, 'note');
    assert.ok(bad.title.length <= 60);
    let box = fr.inbox('u2');
    assert.equal(box.items.length, 2);
    assert.equal(box.unread, 2);
    assert.equal(fr.ack('u2', [n.id]), 1);
    box = fr.inbox('u2');
    assert.equal(box.unread, 1);
    assert.equal(fr.ack('u2', []), 1); // empty = mark all
    assert.equal(fr.inbox('u2').unread, 0);
    for (let i = 0; i < 60; i++) fr.notify('u2', { kind: 'note', title: 't' + i });
    assert.ok(fr.inbox('u2').items.length <= 50);
});

test('rank: publish keeps best, strangers anonymous, friends named', () => {
    const fr = createFriendStore();
    fr.publishRank('u1', 'Alpha', 'blitz', 900);
    fr.publishRank('u1', 'Alpha', 'blitz', 800); // best kept
    fr.publishRank('u2', 'Beta', 'blitz', 1200);
    fr.publishRank('u3', 'Gamma', 'blitz', 500);
    const r = fr.rank('blitz', 'u1', ['u2']);
    assert.equal(r.total, 3);
    assert.equal(r.myRank, 2);
    assert.equal(r.board[0].name, 'Beta'); // friend named
    assert.equal(r.board[0].rank, 1);
    assert.equal(r.board[1].name, 'Alpha'); // self named
    assert.equal(r.board[1].self, true);
    assert.equal(r.board[2].name, null); // stranger anonymous
    assert.equal(r.board[2].uid, null);
    assert.equal(r.board[2].rating, 500);
    const empty = fr.rank('blitz', 'nobody', []);
    assert.equal(empty.myRank, null);
});

test('hall: first-1000 registry in join order', () => {
    const fr = createFriendStore();
    const a = fr.hallJoin('u1', 'Alpha');
    assert.equal(a.position, 1);
    assert.equal(fr.hallJoin('u1', 'Alpha').position, 1); // idempotent
    fr.hallJoin('u2', 'Beta');
    const h = fr.hall();
    assert.deepEqual(h.map((x) => x.uid), ['u1', 'u2']);
    assert.deepEqual(h.map((x) => x.position), [1, 2]);
});
