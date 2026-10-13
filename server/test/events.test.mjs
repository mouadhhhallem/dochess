import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createBus } from '../lib/events.mjs';

function mockRes() {
    const em = new EventEmitter();
    em.written = [];
    em.write = (s) => { em.written.push(s); return true; };
    return em;
}

test('events: ticket mint/claim single-use with expiry', () => {
    const bus = createBus();
    const t = bus.mintTicket('u1');
    assert.ok(typeof t === 'string' && t.length >= 16);
    assert.equal(bus.claimTicket(t), 'u1');
    assert.equal(bus.claimTicket(t), null); // consumed
    assert.equal(bus.claimTicket('nope'), null);
    assert.equal(bus.claimTicket(''), null);
});

test('events: publish fans out to subscribers, drops the dead', () => {
    const bus = createBus();
    const a = mockRes(), b = mockRes();
    bus.subscribe('u1', a);
    bus.subscribe('u1', b);
    bus.subscribe('u2', mockRes());
    assert.equal(bus.publish('u1', { kind: 'notify' }), 2);
    assert.equal(bus.publish('nobody', { kind: 'notify' }), 0);
    assert.match(a.written.join(''), /"kind":"notify"/);
    // Dead subscriber pruned on next publish.
    b.write = () => { throw new Error('gone'); };
    assert.equal(bus.publish('u1', { kind: 'x' }), 1);
    a.emit('close');
    assert.equal(bus.publish('u1', { kind: 'y' }), 0);
});

test('events: sweep expires tickets', () => {
    const bus = createBus();
    bus.mintTicket('u1');
    assert.equal(bus.sweep(Date.now() + 3600_000).tickets, 1);
    assert.equal(bus.sweep().tickets, 0);
});
