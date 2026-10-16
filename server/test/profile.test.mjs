/**
 * server/test/profile.test.mjs — GET /api/profile's backing store call:
 * SOC.publicProfile(viewerUid, targetUid).
 *
 * Runs against the REAL dev file-store driver (same harness as
 * social.test.mjs): temp dir, no mocks, no network, no secrets.
 *
 * Contract under test:
 * - unknown uid -> { error: 'unknown-player' }; malformed -> 'bad-player'.
 * - self/friend/pending see uid; strangers do not. Presence is
 *   friends+self only.
 * - a fresh account reads BASIC: START_RATING everywhere, 0-0-0 record,
 *   null winRate, level 1, no badges, empty form.
 * - record/ranks/XP/badges derive from stored rows only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initDb, db, closeDb } from '../lib/db.mjs';
import { createSocialStore, START_RATING } from '../lib/social.mjs';

process.env.DOCHESS_DEV_FILE_STORE = '1';
process.env.DOCHESS_DEV_NO_AUTH = '0';
// Test quarantine: never touch a real database, even when MONGODB_URI is
// configured in .env (initDb reads this flag live). See db.mjs initDb.
process.env.DOCHESS_FORCE_FILE_STORE = '1';

let DIR;
let SOC;

const A = 'user_aaaaaaaaaaaaaaaa01';
const B = 'user_bbbbbbbbbbbbbbbb02';
const C = 'user_cccccccccccccccc03';

test.before(async () => {
    DIR = mkdtempSync(join(tmpdir(), 'dochess-profile-'));
    process.env.DOCHESS_DATA_DIR = DIR;
    await initDb();
    SOC = createSocialStore(() => db());
});

test.after(async () => {
    await closeDb();
    try { rmSync(DIR, { recursive: true, force: true }); } catch (_) {}
});

async function register(uid, name) {
    await db().updateUser(uid, { meta: { updatedAt: Date.now(), data: 1 } }, { name });
    await SOC.heartbeat(uid, name, null);
    return uid;
}

async function record(uid, result, cat, day, n) {
    for (let i = 0; i < n; i++) {
        const gid = `${uid.slice(-4)}-${result}-${cat}-${day}-${i}`;
        await db().insertGame({ userId: uid, gameId: gid, result, date: day * 86400000 + i, plies: 40, control: { id: cat } });
    }
    // Same as production's POST /api/games path: fresh ratings immediately.
    SOC.invalidateRatings();
}

test('unknown and malformed uids are rejected, never empty-shaped', async () => {
    assert.equal((await SOC.publicProfile(A, 'user_nonexistent999')).error, 'unknown-player');
    assert.equal((await SOC.publicProfile(A, '!!!')).error, 'bad-player');
    assert.equal((await SOC.publicProfile(A, '')).error, 'bad-player');
});

test('fresh account reads basic: default ratings, 0-0-0, level 1, no badges', async () => {
    await register(A, 'Alice Anderson');
    await register(B, 'Bob Brown');
    const r = await SOC.publicProfile(B, A);
    assert.equal(r.ok, true);
    const p = r.profile;
    assert.equal(p.name, 'Alice Anderson');
    assert.equal(p.self, false);
    assert.equal(p.friend, false);
    assert.equal(p.relation, 'stranger');
    assert.equal(p.uid, A, 'queried uid is echoed (caller already knew it)');
    assert.ok(!('presence' in p), 'strangers expose no presence');
    for (const cat of ['bullet', 'blitz', 'rapid']) {
        assert.equal(p.ratings[cat].rating, START_RATING);
        assert.equal(p.ratings[cat].games, 0);
    }
    assert.deepEqual([p.record.win, p.record.loss, p.record.draw, p.record.games], [0, 0, 0, 0]);
    assert.equal(p.record.winRate, null);
    assert.deepEqual(p.form, []);
    assert.equal(p.level, 1);
    assert.equal(p.xp.total, 0);
    assert.deepEqual(p.badges, []);
    assert.ok(typeof p.joined === 'number' && p.joined > 0);
});

test('record, ratings, form, level and badges derive from stored rows', async () => {
    // A: 3 blitz wins (days 10-12), 1 rapid loss (day 13), 1 blitz draw (day 14).
    await record(A, 'win', 'blitz', 10, 1);
    await record(A, 'win', 'blitz', 11, 1);
    await record(A, 'win', 'blitz', 12, 1);
    await record(A, 'loss', 'rapid', 13, 1);
    await record(A, 'draw', 'blitz', 14, 1);
    await SOC.onGameRecorded(A, { userId: A, gameId: 'x', result: 'win', date: Date.now(), control: { id: 'blitz' } }, false);
    const r = await SOC.publicProfile(B, A);
    const p = r.profile;
    assert.deepEqual([p.record.win, p.record.loss, p.record.draw, p.record.games], [3, 1, 1, 5]);
    assert.equal(p.record.winRate, 60);
    assert.equal(p.ratings.blitz.games, 4);
    assert.equal(p.ratings.rapid.games, 1);
    assert.equal(p.ratings.bullet.games, 0);
    assert.ok(p.ratings.blitz.rating > START_RATING, 'wins lift blitz');
    assert.ok(p.ratings.rapid.rating < START_RATING, 'loss drops rapid');
    assert.deepEqual(p.form, ['D', 'L', 'W', 'W', 'W'], 'newest-first form');
    assert.ok(p.level >= 1 && p.xp.total >= 0);
    const ids = p.badges.map((b) => b.id);
    assert.ok(ids.includes('first-victory'), 'first win badged, got: ' + ids.join(','));
    // Every badge carries the fields the client renders.
    for (const b of p.badges) {
        assert.ok(b.id && b.name && b.desc && b.glyph, 'badge shape: ' + JSON.stringify(b));
    }
    // No BANNED words may ever ship to a profile surface.
    const blob = JSON.stringify(p);
    assert.ok(!/stockfish|second look|deeper|depth|centipawn|\beval\b|calculation/i.test(blob));
});

test('self sees uid + presence; friends see uid + presence + since', async () => {
    await SOC.requestFriend(A, { toUid: B, name: 'Bob Brown' });
    await SOC.respondToRequest(B, A, true);
    const self = await SOC.publicProfile(A, A);
    assert.equal(self.profile.self, true);
    assert.equal(self.profile.uid, A);
    assert.equal(self.profile.relation, 'self');
    assert.ok(self.profile.presence && typeof self.profile.presence.online === 'boolean');
    const fr = await SOC.publicProfile(B, A);
    assert.equal(fr.profile.friend, true);
    assert.equal(fr.profile.uid, A);
    assert.equal(fr.profile.relation, 'friend');
    assert.ok(fr.profile.presence && typeof fr.profile.presence.online === 'boolean');
    assert.ok(typeof fr.profile.since === 'number');
    // C is a stranger to A: sees the player, not the plumbing.
    await register(C, 'Cara Cole');
    const st = await SOC.publicProfile(C, A);
    assert.equal(st.profile.relation, 'stranger');
    assert.equal(st.profile.uid, A, 'queried uid is echoed (caller already knew it)');
    assert.ok(!('presence' in st.profile));
    assert.equal(st.profile.name, 'Alice Anderson');
});

test('pending requests are labelled with direction', async () => {
    // C asks A: A sees pending-in, C sees pending-out.
    await SOC.requestFriend(C, { toUid: A, name: 'Alice Anderson' });
    const aSees = await SOC.publicProfile(A, C);
    assert.equal(aSees.profile.relation, 'pending-in');
    assert.equal(aSees.profile.uid, C);
    const cSees = await SOC.publicProfile(C, A);
    assert.equal(cSees.profile.relation, 'pending-out');
});
