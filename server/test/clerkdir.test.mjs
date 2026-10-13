import test from 'node:test';
import assert from 'node:assert/strict';
import { clerkSearch, mergeDirectory, clearClerkCache } from '../lib/clerkdir.mjs';

const CLERK_PAGE = {
    data: [
        { id: 'user_aaa', username: 'mouadh', first_name: 'Mouadh', last_name: 'H', image_url: 'https://x.test/m.png', email_addresses: [{ email_address: 'm@x.test' }], phone_numbers: [] },
        { id: 'user_bbb', username: null, first_name: '', last_name: '', image_url: 'http://evil/x.png', email_addresses: [], phone_numbers: [] },
        { id: 'junk!!!', username: 'evil', first_name: 'E', last_name: 'V', image_url: null, email_addresses: [], phone_numbers: [] },
    ],
    total_count: 3,
};
const stubOk = async () => ({ ok: true, json: async () => CLERK_PAGE });

test('clerkdir: maps users to public rows only, drops junk ids', async () => {
    clearClerkCache();
    const rows = await clerkSearch('mou', { fetchImpl: stubOk });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { uid: 'user_aaa', name: 'Mouadh H', img: 'https://x.test/m.png' });
    assert.deepEqual(rows[1], { uid: 'user_bbb', name: 'Player', img: null });
});

test('clerkdir: gates short queries, caches, survives failures', async () => {
    clearClerkCache();
    let calls = 0;
    const counting = async (...a) => { calls++; return stubOk(...a); };
    assert.deepEqual(await clerkSearch('ab', { fetchImpl: counting }), []);
    assert.equal(calls, 0);
    await clerkSearch('mou', { fetchImpl: counting });
    await clerkSearch('mou', { fetchImpl: counting });
    assert.equal(calls, 1);
    clearClerkCache();
    assert.deepEqual(await clerkSearch('mou', { fetchImpl: async () => { throw new Error('down'); } }), []);
    assert.deepEqual(await clerkSearch('mou', { fetchImpl: async () => ({ ok: false, status: 500 }) }), []);
});

test('clerkdir: merge dedupes with local wins, friends flagged, cap 20', () => {
    const local = [{ uid: 'user_aaa', name: 'LocalName', img: null, friend: false }];
    const remote = [
        { uid: 'user_aaa', name: 'Mouadh H', img: 'https://x.test/m.png' },
        { uid: 'user_bbb', name: 'Beta', img: null },
    ];
    const out = mergeDirectory(local, remote, ['user_bbb']);
    assert.equal(out.length, 2);
    assert.equal(out[0].name, 'LocalName'); // local wins
    assert.equal(out[0].friend, false);
    assert.equal(out[1].friend, true);
    const many = Array.from({ length: 30 }, (_, i) => ({ uid: `user_${i}`, name: 'P' + i, img: null }));
    assert.equal(mergeDirectory(many, []).length, 20);
});

test('clerkdir: accepts the bare-array response shape too', async () => {
    clearClerkCache();
    const bare = async () => ({ ok: true, json: async () => CLERK_PAGE.data });
    const rows = await clerkSearch('mou', { fetchImpl: bare });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, 'Mouadh H');
});
