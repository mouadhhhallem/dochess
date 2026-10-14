import test from 'node:test';
import assert from 'node:assert/strict';
import { clerkSearch, mergeDirectory, clerkListUsers, clearClerkCache } from '../lib/clerkdir.mjs';

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

function clerkUser(id, first, last) {
    return {
        id, username: null, first_name: first, last_name: last,
        image_url: 'https://x.test/p.png',
        email_addresses: [{ email_address: `${id}@x.test` }],
        phone_numbers: ['+10000000000'],
    };
}

test('clerkdir: clerkListUsers paginates the whole registry, public fields only', async () => {
    clearClerkCache();
    const p1 = Array.from({ length: 100 }, (_, i) => clerkUser(`user_regp1_${String(i).padStart(3, '0')}`, 'Mohamed', `J${i}`));
    const p2 = [clerkUser('user_regp2_000', 'Mossab', 'Hallem')];
    const stub = async (url) => {
        const u = new URL(url);
        const off = Number(u.searchParams.get('offset')) || 0;
        const rows = off === 0 ? p1 : off === 100 ? p2 : [];
        return { ok: true, json: async () => ({ data: rows, total_count: 101 }) };
    };
    const { list, complete } = await clerkListUsers({ fetchImpl: stub });
    assert.equal(complete, true, 'all pages fetched');
    assert.equal(list.length, 101, 'every registered account is listed');
    assert.deepEqual(Object.keys(list[0]).sort(), ['img', 'name', 'uid'], 'no emails, no phones, nothing private');
    assert.equal(list[0].name, 'Mohamed J0');
    assert.equal(list[100].name, 'Mossab Hallem');
});

test('clerkdir: clerkListUsers reports incomplete instead of a fake full board', async () => {
    clearClerkCache();
    let n = 0;
    const flaky = async () => {
        n++;
        if (n === 1) return { ok: true, json: async () => ({ data: Array.from({ length: 100 }, (_, i) => clerkUser(`user_flk_${i}`, 'A', 'B')) }) };
        throw new Error('clerk down');
    };
    const r = await clerkListUsers({ fetchImpl: flaky });
    assert.equal(r.complete, false, 'a failed page is reported, not hidden');
    assert.equal(r.list.length, 100, 'the pages that did arrive are kept');
});
