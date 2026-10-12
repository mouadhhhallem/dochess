import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSection, mergeSections, mergeForClient, SECTION_MODES } from '../lib/merge.mjs';

test('lww: newer incoming wins, older is ignored', () => {
    const stored = { updatedAt: 100, data: { xp: 10 } };
    assert.deepEqual(mergeSection('learn', stored, { updatedAt: 200, data: { xp: 99 } }), { updatedAt: 200, data: { xp: 99 } });
    assert.equal(mergeSection('learn', stored, { updatedAt: 50, data: { xp: 1 } }), stored);
    assert.equal(mergeSection('learn', stored, { updatedAt: 100, data: { xp: 2 } }), stored);
});

test('lww: equal timestamps never clobber (no flapping between devices)', () => {
    const stored = { updatedAt: 500, data: { a: 1 } };
    assert.equal(mergeSection('lessons', stored, { updatedAt: 500, data: { a: 2 } }), stored);
});

test('unknown sections are not stored', () => {
    const { changed, sections } = mergeSections({ sections: {} }, { evil: { updatedAt: 1, data: 1 } });
    assert.equal(changed, false);
    assert.ok(!('evil' in sections));
});

test('list: games merge by gameId, newest first, capped', () => {
    const stored = { updatedAt: 10, data: [{ gameId: 'g1', date: 1 }, { gameId: 'g2', date: 2 }] };
    const incoming = { updatedAt: 20, data: [{ gameId: 'g2', date: 5 }, { gameId: 'g3', date: 3 }] };
    const out = mergeSection('games', stored, incoming);
    assert.deepEqual(out.data.map((g) => g.gameId), ['g2', 'g3', 'g1']);
    assert.equal(out.data[0].date, 5, 'the newer record for the same gameId wins');
    assert.equal(out.updatedAt, 20);
});

test('list: identical content returns the stored reference (no write)', () => {
    const stored = { updatedAt: 10, data: [{ gameId: 'g1', date: 1 }] };
    const same = { updatedAt: 99, data: [{ gameId: 'g1', date: 1 }] };
    assert.equal(mergeSection('games', stored, same), stored);
});

test('keyed: leaderboard merges per player and per category', () => {
    const stored = { updatedAt: 1, data: { u1: { name: 'A', cats: { blitz: 1200, rapid: 1100 }, seen: 10 } } };
    const incoming = { updatedAt: 2, data: { u1: { name: 'A2', cats: { blitz: 1250 }, seen: 20 }, u2: { name: 'B', cats: { blitz: 900 }, seen: 5 } } };
    const out = mergeSection('leaderboard', stored, incoming);
    assert.equal(out.data.u1.cats.blitz, 1250);
    assert.equal(out.data.u1.cats.rapid, 1100, 'untouched categories survive');
    assert.equal(out.data.u1.name, 'A2');
    assert.equal(out.data.u2.cats.blitz, 900);
});

test('every declared section has a known mode', () => {
    for (const id of ['learn', 'lessons', 'achievements', 'ratings', 'puzzles', 'playtime', 'study', 'games', 'leaderboard', 'settings']) {
        assert.ok(SECTION_MODES[id], 'missing mode for ' + id);
    }
});

test('mergeForClient only ships sections the server knows better', () => {
    const server = { learn: { updatedAt: 200, data: { xp: 5 } }, games: { updatedAt: 5, data: [] } };
    const local = { learn: { updatedAt: 300, data: { xp: 9 } } };
    const out = mergeForClient(server, local);
    assert.ok(!out.learn, 'newer local learn stays local');
    assert.equal(out.games.updatedAt, 5);
});
