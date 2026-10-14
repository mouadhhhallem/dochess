/**
 * server/test/social.test.mjs — the persistent social store.
 *
 * Runs against the REAL dev file-store driver (no mocks, no network, no
 * secrets) so the persistence contract is genuinely exercised: a store is
 * built, used, and then a SECOND store is built over the same directory to
 * prove the data survived.
 *
 * Every test here corresponds to a defect recorded in
 * docs/PRODUCTION_AUDIT.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initDb, db, closeDb } from '../lib/db.mjs';
import { createSocialStore, replayRating, resolveControl, TIME_CONTROLS, tierOf, START_RATING } from '../lib/social.mjs';

// A temp data dir so the suite never touches server/.data.
process.env.DOCHESS_DEV_FILE_STORE = '1';
process.env.DOCHESS_DEV_NO_AUTH = '0';

let DIR;
let SOC;

test.before(async () => {
    DIR = mkdtempSync(join(tmpdir(), 'dochess-social-'));
    // Point the dev file store at a temp dir so the suite never reads or
    // writes the developer's server/.data.
    process.env.DOCHESS_DATA_DIR = DIR;
    await initDb();
    SOC = createSocialStore(() => db());
});

test.after(async () => {
    await closeDb();
    try { rmSync(DIR, { recursive: true, force: true }); } catch (_) {}
});

const A = 'user_aaaaaaaa0001';
const B = 'user_bbbbbbbb0002';
const C = 'user_cccccccc0003';
const D = 'user_dddddddd0004';

/** "Registration" = the account has a document in the authoritative store. */
async function register(uid, name) {
    await db().updateUser(uid, { meta: { updatedAt: Date.now(), data: 1 } }, { name });
    await SOC.heartbeat(uid, name, null);
    return uid;
}

/* ── friendships ─────────────────────────────────────────────────── */

// S1-2: removal must be undirected. A removes B; B must not still list A,
// and B must not see a phantom inbound request from A.
test('removing a friend removes BOTH directions and is durable', async () => {
    await SOC.requestFriend(A, { toUid: B, name: 'Bob' });
    await SOC.respondToRequest(B, A, true);
    assert.equal((await SOC.listFriends(A)).length, 1);
    assert.equal((await SOC.listFriends(B)).length, 1);

    const removed = await SOC.removeFriend(A, B);
    assert.equal(removed, true, 'A had a friendship with B');

    assert.deepEqual(await SOC.listFriends(A), [], 'A has no friends');
    assert.deepEqual(await SOC.listFriends(B), [], 'B must not still list A');
    assert.equal(await SOC.areFriends(A, B), false);

    // And it must survive a fresh store instance over the same directory.
    const reopened = createSocialStore(() => db());
    assert.deepEqual(await reopened.listFriends(A), []);
    assert.deepEqual(await reopened.listFriends(B), []);
});

// S1-1: the graph is persisted, not process memory.
test('friendships survive a brand-new store instance (no process memory)', async () => {
    await SOC.requestFriend(A, { toUid: C, name: 'Cara' });
    await SOC.respondToRequest(C, A, true);
    const reopened = createSocialStore(() => db());
    const friends = await reopened.listFriends(A);
    assert.equal(friends.length, 1);
    assert.equal(friends[0].uid, C);
});

/* ── requests ────────────────────────────────────────────────────── */

// S1-3: a decline is terminal and must not reappear.
test('declining a request is permanent: it never comes back', async () => {
    await SOC.requestFriend(A, { toUid: D, name: 'Dee' });
    let snap = await SOC.listRequests(D);
    assert.equal(snap.inbound.length, 1, 'D has a pending request from A');

    const r = await SOC.respondToRequest(D, A, false);
    assert.equal(r.status, 'declined');

    snap = await SOC.listRequests(D);
    assert.equal(snap.inbound.length, 0, 'no pending request remains');
    assert.ok(snap.resolved.some((x) => x.uid === A && x.status === 'declined'),
        'the decline is reported in `resolved` so clients can reconcile');
    assert.deepEqual(await SOC.listFriends(D), [], 'declining creates no friendship');

    // Re-read repeatedly (what a poll loop does) — it must stay declined.
    for (let i = 0; i < 3; i++) {
        const again = await SOC.listRequests(D);
        assert.equal(again.inbound.length, 0, 'poll ' + i + ' resurrected a declined request');
    }
    assert.deepEqual(await SOC.listFriends(D), [], 'a declined request never becomes a friendship');
});

test('accepting creates the friendship and clears the pending request', async () => {
    const x = 'user_eeeeeeee0005', y = 'user_ffffffff0006';
    await SOC.requestFriend(x, { toUid: y, name: 'Yara' });
    const r = await SOC.respondToRequest(y, x, true);
    assert.equal(r.status, 'accepted');
    const snap = await SOC.listRequests(y);
    assert.equal(snap.inbound.length, 0);
    assert.equal(snap.outbound.length, 0);
    assert.equal((await SOC.listFriends(y)).length, 1);
    assert.equal((await SOC.listFriends(x)).length, 1);
});

test('accepting twice is idempotent; declining after accepting does not undo it', async () => {
    const x = 'user_111111111111', y = 'user_222222222222';
    await SOC.requestFriend(x, { toUid: y, name: 'Yan' });
    await SOC.respondToRequest(y, x, true);
    const again = await SOC.respondToRequest(y, x, true);
    assert.equal(again.idempotent, true, 'a duplicate accept reports success without duplicating');
    // A late decline racing the accept must not tear the friendship down.
    const late = await SOC.respondToRequest(y, x, false);
    assert.equal(late.error, 'already-resolved');
    assert.equal(await SOC.areFriends(x, y), true, 'the friendship survived the racing decline');
});

test('only the recipient may respond to a request', async () => {
    const x = 'user_333333333333', y = 'user_444444444444';
    await SOC.requestFriend(x, { toUid: y, name: 'Yin' });
    const r = await SOC.respondToRequest(x, y, true); // x is the SENDER
    assert.equal(r.error, 'not-recipient');
    assert.equal(await SOC.areFriends(x, y), false);
});

test('no duplicate or self requests, and re-asking after a decline is explicit', async () => {
    const x = 'user_555555555555', y = 'user_666666666666';
    assert.equal((await SOC.requestFriend(x, { toUid: x })).error, 'bad-recipient', 'self-request rejected');

    const first = await SOC.requestFriend(x, { toUid: y, name: 'Yok' });
    assert.equal(first.created, true);
    const dup = await SOC.requestFriend(x, { toUid: y, name: 'Yok' });
    assert.equal(dup.created, false, 'a duplicate send does not create a second row');
    assert.equal((await SOC.listRequests(y)).inbound.length, 1);

    await SOC.respondToRequest(y, x, false);
    const reask = await SOC.requestFriend(x, { toUid: y, name: 'Yok' });
    assert.equal(reask.created, true, 're-asking after a decline is a fresh, explicit request');
    assert.equal((await SOC.listRequests(y)).inbound.length, 1);
});

test('cancelling a sent request is durable', async () => {
    const x = 'user_777777777777', y = 'user_888888888888';
    await SOC.requestFriend(x, { toUid: y, name: 'Yul' });
    assert.equal(await SOC.cancelRequest(x, y), true);
    const snap = await SOC.listRequests(y);
    assert.equal(snap.inbound.length, 0);
    const late = await SOC.respondToRequest(y, x, true);
    assert.equal(late.error, 'already-resolved', 'a cancelled request can never be accepted later');
    assert.equal(await SOC.areFriends(x, y), false);
});

test('requesting someone you are already friends with is refused', async () => {
    const x = 'user_999999999991', y = 'user_999999999992';
    await SOC.requestFriend(x, { toUid: y });
    await SOC.respondToRequest(y, x, true);
    const again = await SOC.requestFriend(x, { toUid: y });
    assert.equal(again.error, 'already-friends');
});

test('hostile ids never reach the store', async () => {
    assert.equal((await SOC.requestFriend('user_ok00000001', { toUid: 'not a uid!' })).error, 'bad-recipient');
    assert.equal(await SOC.removeFriend('user_ok00000002', '../../etc/passwd'), false);
    assert.deepEqual(await SOC.listFriends('"; drop'), []);
});

/* ── invitations ─────────────────────────────────────────────────── */

// S1-10: an invitation is a real entity with an id, expiry and status.
test('an invitation carries a match id, time control, sender, recipient and expiry', async () => {
    const x = 'user_aaaaaaaa1001', y = 'user_bbbbbbbb1002';
    await SOC.requestFriend(x, { toUid: y });
    await SOC.respondToRequest(y, x, true);

    const r = await SOC.createInvite(x, { toUid: y, minutes: 3, incSec: 0, code: 'AB3XYZ' });
    assert.ok(r.invite, 'invite created');
    assert.match(r.invite.matchId, /^m_[0-9a-f]{16}$/);
    assert.equal(r.invite.code, 'AB3XYZ');
    assert.equal(r.invite.status, 'pending');
    assert.ok(r.invite.expiresAt > Date.now(), 'has a future expiry');
    assert.equal(r.invite.from, x);
    assert.equal(r.invite.to, y);
    assert.equal(r.invite.control.id, 'blitz');

    const listed = await SOC.listInvites(y);
    assert.equal(listed.length, 1, 'the recipient sees it on any screen');

    const reopened = createSocialStore(() => db());
    const still = await reopened.getInvite(r.invite.matchId);
    assert.equal(still.status, 'pending', 'the invitation is persisted, not in memory');
});

test('only friends can invite, and only the listed time controls are accepted', async () => {
    const x = 'user_aaaaaaaa2001', y = 'user_bbbbbbbb2002', stranger = 'user_cccccccc2003';
    assert.equal((await SOC.createInvite(x, { toUid: y, minutes: 3, code: 'AB3XYZ' })).error,
        'not-friends', 'a stranger cannot be invited');

    await SOC.requestFriend(x, { toUid: y });
    await SOC.respondToRequest(y, x, true);
    assert.equal((await SOC.createInvite(x, { toUid: y, minutes: 7, incSec: 3, code: 'AB3XYZ' })).error,
        'bad-time-control', '7+3 is not one of the six supported controls');
    assert.equal((await SOC.createInvite(x, { toUid: y, minutes: 3, code: 'not a code' })).error,
        'bad-code');
});

test('only the recipient may accept, and accepting twice yields one match', async () => {
    const x = 'user_aaaaaaaa3001', y = 'user_bbbbbbbb3002';
    await SOC.requestFriend(x, { toUid: y });
    await SOC.respondToRequest(y, x, true);
    const { invite } = await SOC.createInvite(x, { toUid: y, minutes: 5, incSec: 0, code: 'ZZ99ZZ' });

    const wrong = await SOC.respondToInvite(x, invite.matchId, true);
    assert.equal(wrong.error, 'not-recipient', 'the sender cannot accept their own invite');

    const ok = await SOC.respondToInvite(y, invite.matchId, true);
    assert.equal(ok.invite.status, 'accepted');
    const dup = await SOC.respondToInvite(y, invite.matchId, true);
    assert.equal(dup.idempotent, true, 'a double-click must not create a second match');
    assert.equal(dup.invite.matchId, invite.matchId);

    const declineAfter = await SOC.respondToInvite(y, invite.matchId, false);
    assert.equal(declineAfter.error, 'already-resolved');
});

test('expired, malformed and unknown invitations are rejected distinctly', async () => {
    const x = 'user_aaaaaaaa4001', y = 'user_bbbbbbbb4002';
    await SOC.requestFriend(x, { toUid: y });
    await SOC.respondToRequest(y, x, true);
    const { invite } = await SOC.createInvite(x, { toUid: y, minutes: 10, incSec: 0, code: 'QQ22QQ' });

    assert.equal((await SOC.respondToInvite(y, 'm_0000000000000000', true)).error, 'no-invite');
    assert.equal((await SOC.respondToInvite(y, '../../etc/passwd', true)).error, 'no-invite');
    assert.equal((await SOC.respondToInvite(y, invite.matchId, true)).invite.status, 'accepted');

    // A fresh invite forced past its expiry must read as expired, not pending.
    const { invite: soon } = await SOC.createInvite(x, { toUid: y, minutes: 1, incSec: 0, code: 'WW22WW' });
    const store = createSocialStore(() => db());
    const row = await db().getDoc('invites', soon.matchId);
    await db().putDoc('invites', soon.matchId, { ...row, expiresAt: Date.now() - 1 });
    const late = await store.respondToInvite(y, soon.matchId, true);
    assert.equal(late.error, 'expired', 'an expired invitation cannot be accepted');
});

test('declining an invitation removes it from the recipient list', async () => {
    const x = 'user_aaaaaaaa5001', y = 'user_bbbbbbbb5002';
    await SOC.requestFriend(x, { toUid: y });
    await SOC.respondToRequest(y, x, true);
    const { invite } = await SOC.createInvite(x, { toUid: y, minutes: 3, incSec: 2, code: 'EE44EE' });
    assert.equal((await SOC.listInvites(y)).length, 1);
    await SOC.respondToInvite(y, invite.matchId, false);
    assert.equal((await SOC.listInvites(y)).length, 0, 'declined invites leave the pending list');
});

/* ── presence ────────────────────────────────────────────────────── */

test('presence expires on its TTL and ghosts are swept', async () => {
    const u = 'user_aaaaaaaa6001';
    await SOC.heartbeat(u, 'Ghost', null);
    assert.equal((await SOC.status([u]))[u].online, true);
    // Age the record past the TTL and re-read.
    await db().putDoc('presence', u, { uid: u, name: 'Ghost', img: null, at: Date.now() - 600000 });
    assert.equal((await SOC.status([u]))[u].online, false, 'stale presence is not "online"');
    assert.ok(await SOC.sweepPresence() >= 1, 'the ghost row is swept');
    assert.equal((await SOC.status([u]))[u].online, false);
});

/* ── the global ladder ───────────────────────────────────────────── */

// S2-7: the ladder must contain EVERY registered account, from the
// authoritative users collection — including accounts that never played.
test('the ladder includes every registered account, rated or not', async () => {
    const before = (await SOC.rankPage({ cat: 'blitz', viewerUid: A, limit: 1, offset: 0 })).total;

    // Register two accounts that have never played a single game.
    await register('user_unrated00001', 'Una Rated');
    await register('user_unrated00002', 'Uno Rated');

    const board = await SOC.rankPage({ cat: 'blitz', viewerUid: A, limit: 100, offset: 0 });
    assert.equal(board.total, before + 2, 'a newly registered account appears immediately');

    // Unrated accounts are present at the floor rather than hidden.
    const atFloor = board.board.filter((r) => r.rating === START_RATING);
    assert.equal(atFloor.length, 2, 'both unrated accounts are listed at 800');

    // Pagination covers the whole set with no gaps or duplicates.
    const seen = new Set();
    for (let off = 0; off < board.total; off += 2) {
        const page = await SOC.rankPage({ cat: 'blitz', viewerUid: A, limit: 2, offset: off });
        for (const row of page.board) seen.add(row.rank);
    }
    assert.equal(seen.size, board.total, 'every rank appears exactly once across pages');
});

test('a newly registered account appears immediately at the default rating', async () => {
    const newbie = await register('user_aaaaaaaanew01', 'Nina Newbie');
    const board = await SOC.rankPage({ cat: 'blitz', viewerUid: newbie, limit: 100, offset: 0 });
    assert.equal(board.myRating, START_RATING, 'default rating is 800');
    assert.ok(Number.isInteger(board.myRank) && board.myRank >= 1, 'the new account has a real rank');
    const me = board.board.find((r) => r.self);
    assert.ok(me, 'the new account appears on the board');
    assert.equal(me.rating, START_RATING);
    assert.equal(me.tier, 'bronze');
});

test('ordering is by rating then uid, and is stable across requests', async () => {
    const cat = 'rapid';
    const mk = async (uid, name) => {
        await db().updateUser(uid, { x: { updatedAt: Date.now(), data: 1 } }, { name });
        await SOC.heartbeat(uid, name, null);
    };
    await mk('user_zzzstable001', 'Zoe');   // identical first names on purpose
    await mk('user_aaaastable002', 'Zoe');
    await mk('user_mmmstable003', 'Moe');

    const a = await SOC.rankPage({ cat, viewerUid: 'user_zzzstable001', limit: 100, offset: 0 });
    const b = await SOC.rankPage({ cat, viewerUid: 'user_zzzstable001', limit: 100, offset: 0 });
    const ranksA = a.board.map((r) => r.rank + ':' + r.rating);
    const ranksB = b.board.map((r) => r.rank + ':' + r.rating);
    assert.deepEqual(ranksA, ranksB, 'the same query twice gives the identical ordering');

    // Ratings must be non-increasing down the board.
    for (let i = 1; i < a.board.length; i++) {
        assert.ok(a.board[i - 1].rating >= a.board[i].rating,
            `rating must not increase at rank ${a.board[i].rank}`);
    }
});

// S2-8: ratings come from recorded games, never from a client-submitted number.
test('ratings are derived from recorded games, not client-published values', async () => {
    const u = 'user_elocheck0001';
    await db().updateUser(u, { s: { updatedAt: Date.now(), data: 1 } }, { name: 'Elo Check' });
    await db().insertGame({ userId: u, gameId: 'g1', result: 'win', date: 1, plies: 40, control: { id: 'blitz', base: 300000, inc: 0 } });
    await db().insertGame({ userId: u, gameId: 'g2', result: 'loss', date: 2, plies: 40, control: { id: 'blitz', base: 300000, inc: 0 } });
    SOC.invalidateRatings();

    const board = await SOC.rankPage({ cat: 'blitz', viewerUid: u, limit: 100, offset: 0 });
    const me = board.board.find((r) => r.self);
    const expected = replayRating([
        { gameId: 'g1', result: 'win', date: 1, control: { id: 'blitz' } },
        { gameId: 'g2', result: 'loss', date: 2, control: { id: 'blitz' } }
    ], 'blitz');
    assert.equal(me.rating, expected);
    assert.ok(me.rating !== START_RATING, 'a played account moved off the floor');
    // The client used to be able to self-assign any rating up to 4000 via
    // POST /api/rank/publish; there is no such path any more.
    assert.ok(me.rating < 900, 'a single win and a single loss does not produce a superhuman rating');
});

test('Elo replay is deterministic and honours the category', () => {
    const games = [
        { gameId: 'b', result: 'win', date: 2, control: { id: 'blitz' } },
        { gameId: 'a', result: 'win', date: 1, control: { id: 'rapid' } }
    ];
    assert.equal(replayRating(games, 'blitz'), replayRating([...games].reverse(), 'blitz'),
        'order of the input array does not matter');
    assert.equal(replayRating(games, 'blitz'), 816, 'one blitz win from 800');
    assert.equal(replayRating(games, 'rapid'), 816, 'one rapid win from 800');
    assert.equal(replayRating(games, 'bullet'), START_RATING, 'unrated categories stay at the floor');
});

/* ── privacy ─────────────────────────────────────────────────────── */

// S2-9: serialization happens on the server; the field is never selected.
test('a stranger row carries no uid, full name, photo or email', async () => {
    const me = 'user_viewerpriv001', stranger = 'user_strangerpriv002';
    await db().updateUser(stranger, { s: { updatedAt: Date.now(), data: 1 } }, { name: 'Secret Stranger', image: 'https://img.example/a.png' });
    await db().updateUser(me, { s: { updatedAt: Date.now(), data: 1 } }, { name: 'Me Myself' });

    const board = await SOC.rankPage({ cat: 'blitz', viewerUid: me, limit: 100, offset: 0 });
    const row = board.board.find((r) => r.rating >= 0 && !r.self && !r.friend && r.name === 'Secret');
    assert.ok(row, 'the stranger appears on the board');
    assert.equal(row.name, 'Secret', 'only the first name is disclosed');
    assert.ok(!('uid' in row), 'no uid in the serialized response');
    assert.ok(!('img' in row), 'no photo in the serialized response');
    assert.ok(!JSON.stringify(row).includes('Secret Stranger'), 'the full name never appears in the payload');
    assert.ok(!JSON.stringify(row).includes('img.example'), 'the photo URL never appears in the payload');
    assert.ok(!('email' in row));
    assert.ok(Number.isInteger(row.rank) && Number.isInteger(row.rating) && typeof row.tier === 'string');
});

test('a friend sees their friend-facing name and photo; the server decides who', async () => {
    const me = 'user_viewerpriv011', friend = 'user_friendpriv012', other = 'user_otherpriv013';
    for (const [uid, nm] of [[me, 'Me Myself'], [friend, 'Friend Fay'], [other, 'Other Otto']]) {
        await db().updateUser(uid, { s: { updatedAt: Date.now(), data: 1 } }, { name: nm });
    }
    await SOC.requestFriend(me, { toUid: friend, name: 'Friend Fay' });
    await SOC.respondToRequest(friend, me, true);

    const board = await SOC.rankPage({ cat: 'blitz', viewerUid: me, limit: 100, offset: 0 });
    const fr = board.board.find((r) => r.friend);
    assert.ok(fr, 'the friend is serialized as a friend');
    assert.equal(fr.name, 'Friend Fay', 'friends see the full display name');
    assert.equal(fr.uid, friend, 'friends may exchange the id they already share');
    const ot = board.board.find((r) => r.name === 'Other' && !r.self);
    assert.ok(ot && !('uid' in ot), 'a non-friend stays anonymous');
});

test('a caller cannot unlock a stranger by claiming them as a friend', async () => {
    const me = 'user_viewerpriv021', stranger = 'user_strangerpriv022';
    await db().updateUser(stranger, { s: { updatedAt: Date.now(), data: 1 } }, { name: 'Hidden Harold' });
    await db().updateUser(me, { s: { updatedAt: Date.now(), data: 1 } }, { name: 'Me Myself' });
    // A forged friend list is simply not a parameter any more: the server
    // derives friendship from its own rows. Extra keys are ignored.
    const board = await SOC.rankPage({
        cat: 'blitz', viewerUid: me, limit: 100, offset: 0,
        friends: [stranger], friendUids: [stranger]
    });
    const row = board.board.find((r) => r.name === 'Hidden');
    assert.ok(row, 'the stranger is on the board');
    assert.ok(!('uid' in row), 'the forged friend list did not unlock their uid');
    assert.ok(!JSON.stringify(board).includes('Hidden Harold'));
});

/* ── tiers + time controls ───────────────────────────────────────── */

/* ── the hall of fame ────────────────────────────────────────────── */

// The user-facing requirement: the hall lists EVERY registered account from
// the authoritative store, with their picture, not just this device's friends.
test('the hall lists every registered account, with avatars', async () => {
    const withPhoto = await register('user_hallphoto001', 'Hall Photo');
    await db().updateUser(withPhoto, { s: { updatedAt: Date.now(), data: 1 } },
        { name: 'Hall Photo', image: 'https://img.example/hall.png' });
    const viewer = await register('user_hallviewer01', 'Hall Viewer');

    const hall = await SOC.hallPage({ cat: 'blitz', viewerUid: viewer, limit: 100, offset: 0 });
    assert.ok(hall.total >= 3, `hall should list every registered account, got ${hall.total}`);
    assert.ok(hall.board.some((r) => r.name === 'Hall'), 'strangers appear by first name');
    const photo = hall.board.find((r) => r.name === 'Hall');
    assert.equal(photo.img, 'https://img.example/hall.png', 'the hall carries a profile picture');
    // Privacy is unchanged in the hall: still no uid, no full name for a stranger.
    assert.equal('uid' in photo, false);
    assert.ok(!JSON.stringify(hall.board).includes('Hall Photo'));

    // It is paginated, like the ladder.
    const seen = [];
    for (let off = 0; off < hall.total; off += 2) {
        const page = await SOC.hallPage({ cat: 'blitz', viewerUid: viewer, limit: 2, offset: off });
        for (const row of page.board) seen.push(row.rank);
    }
    assert.equal(new Set(seen).size, hall.total);
});

// "You and your friends" must be complete no matter which ladder page is open.
test('the ladder always returns every friend, even off-page', async () => {
    const viewer = await register('user_friendpage001', 'Viewer');
    const friend = await register('user_friendpage002', 'Far Friend');
    await SOC.requestFriend(friend, { toUid: viewer, name: 'Far Friend' });
    await SOC.respondToRequest(viewer, friend, true);

    // Put a lot of higher-rated accounts on the ladder so the friend falls
    // well outside page 1.
    for (let i = 0; i < 60; i++) {
        const u = `user_rich${String(i).padStart(6, '0')}`;
        await db().updateUser(u, { s: { updatedAt: Date.now(), data: 1 } }, { name: `Rich ${i}` });
        await db().insertGame({ userId: u, gameId: `g${i}`, result: 'win', date: i + 1, control: { id: 'blitz', base: 180000, inc: 0 } });
    }
    SOC.invalidateRatings();

    const page1 = await SOC.rankPage({ cat: 'blitz', viewerUid: viewer, limit: 50, offset: 0 });
    assert.ok(page1.friends.some((r) => r.uid === friend), 'the friend is returned even off-page');
    assert.equal(page1.friends.find((r) => r.uid === friend).name, 'Far Friend', 'friends see the full name');
    assert.equal(page1.board.some((r) => r.uid === friend), false, 'and is not on page 1');
    assert.ok(page1.friends.find((r) => r.uid === friend).rank > 50);
});

test('tiers are derived from the rating', () => {
    assert.equal(tierOf(800), 'bronze');
    assert.equal(tierOf(1000), 'silver');
    assert.equal(tierOf(1200), 'gold');
    assert.equal(tierOf(1600), 'platinum');
    assert.equal(tierOf(2000), 'diamond');
});

test('exactly six time controls resolve, each appearing once', () => {
    const seen = new Set();
    for (const c of TIME_CONTROLS) {
        const r = resolveControl(c.base, c.inc);
        assert.ok(r, `${c.label} must resolve`);
        assert.ok(!seen.has(r.label), `duplicate time control ${r.label}`);
        seen.add(r.label);
    }
    assert.equal(seen.size, 6);
    assert.deepEqual([...seen].sort(), ['1+0', '10+0', '15+10', '3+0', '3+2', '5+0']);
    assert.equal(resolveControl(7, 3), null, 'unsupported controls are rejected');
    assert.equal(resolveControl('x', null), null);
});