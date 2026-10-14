/**
 * friends.js — friend graph, TikTok-style streaks, notifications, ranking,
 * hall of fame. Classic script (file:// compatible), no build step.
 *
 * Local-first: the full system works on device (friends, streaks, inbox,
 * versus, device ranking). The API (server/lib/friends.mjs) enhances it
 * when reachable: presence, server inbox relay, global rank, hall registry.
 * Nothing is ever mocked: offline friends show honest last-seen, strangers
 * stay anonymous on the board, empty states say what to do.
 *
 * Friendship handshake (no server needed):
 *  - A shares a link `#friend-<uid>-<slug>` (slug = display name).
 *  - B opens it: inbound request appears (name marked unverified).
 *  - B accepts: B lists A. When A and B next meet over PeerJS (hello or
 *    profile heartbeat), both sides confirm each other automatically.
 * Streaks: one+ finished game together per UTC day extends the flame;
 * TikTok rules — miss a day and it resets, with a warning the day before.
 */
(function () {
    'use strict';

    /* ── tiny utils ─────────────────────────────────────────── */
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const dayKey = (t) => {
        const d = new Date(t);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    };
    const TODAY = () => dayKey(Date.now());
    const DAY_MS = 86400000;
    const keyDaysAgo = (n) => dayKey(Date.now() - n * DAY_MS);
    function ago(ts) {
        if (!ts) return 'never';
        const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (s < 5) return 'just now';
        if (s < 60) return `${s}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return m === 1 ? '1 min ago' : `${m} min ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
        const d = Math.floor(h / 24);
        if (d === 1) return 'yesterday';
        if (d < 7) return `${d} days ago`;
        const w = Math.floor(d / 7);
        if (w < 5) return w === 1 ? '1 week ago' : `${w} weeks ago`;
        const mo = Math.floor(d / 30);
        if (mo < 12) return mo === 1 ? '1 month ago' : `${mo} months ago`;
        const y = Math.floor(d / 365);
        return y === 1 ? '1 year ago' : `${y} years ago`;
    }
    const uidOf = () => { try { return (window.app && window.app.userId) || 'guest'; } catch (_) { return 'guest'; } };
    const myAvatar = () => { try {
        const u = window.app && window.app._clerk && window.app._clerk.user;
        const img = u && (u.imageUrl || u.profileImageUrl || u.avatar);
        if (typeof img === 'string' && /^https:/.test(img)) return img.slice(0, 2048);
    } catch (_) {} return null; };
    const meName = () => {
        try {
            const u = window.app && window.app._clerk && window.app._clerk.user;
            if (u) return u.fullName || u.username || 'Player';
        } catch (_) {}
        return 'Guest';
    };

    /* ── store ──────────────────────────────────────────────── */
    const storeKey = () => 'ccf_' + uidOf();
    function load() {
        try {
            const s = JSON.parse(localStorage.getItem(storeKey()) || 'null');
            if (s && typeof s === 'object') {
                s.friends = s.friends || {};
                s.pendingIn = Array.isArray(s.pendingIn) ? s.pendingIn : [];
                s.pendingOut = Array.isArray(s.pendingOut) ? s.pendingOut : [];
                s.inbox = Array.isArray(s.inbox) ? s.inbox : [];
                s.hallJoined = !!s.hallJoined;
                // Tombstones. A removal or a decline is a DELIBERATE user
                // decision: every re-add path must respect it. Without these
                // the shelf could be rebuilt by pullEdges, pullRequests,
                // pullInbox, metPeer or adoptGuestShelf and the "removal"
                // would silently undo itself.
                s.removed = (s.removed && typeof s.removed === 'object') ? s.removed : {};
                s.declined = (s.declined && typeof s.declined === 'object') ? s.declined : {};
                return s;
            }
        } catch (_) {}
        return { v: 2, friends: {}, pendingIn: [], pendingOut: [], inbox: [], hallJoined: false, removed: {}, declined: {} };
    }
    let S = load();
    function save() {
        try { localStorage.setItem(storeKey(), JSON.stringify(S)); } catch (_) {}
    }
    /** True when this account deliberately removed / declined this uid. */
    function isBlocked(uid) {
        return !!(uid && (S.removed[uid] || S.declined[uid]));
    }
    function tombstone(bucket, uid) {
        if (!uid) return;
        S[bucket] = S[bucket] || {};
        S[bucket][uid] = Date.now();
    }
    function clearTombstone(uid) {
        if (!uid) return;
        try { delete S.removed[uid]; } catch (_) {}
        try { delete S.declined[uid]; } catch (_) {}
    }

    // Identity switches (sign in/out) swap the shelf. Coming from a
    // guest shelf with content into an EMPTY account shelf adopts the guest
    // circle (friends, requests, streaks, inbox) instead of stranding it:
    // first sign-in must never look like deleted friends.
    //
    // FIX: the guest shelf is stamped as adopted, so it is imported AT MOST
    // ONCE per browser. Previously `ccf_guest` was never cleared, so signing
    // out and into any other fresh account re-imported the whole guest
    // circle — including friends the user had just deleted while signed in.
    const GUEST_ADOPTED_KEY = 'ccf_guest_adopted';
    function adoptGuestShelf() {
        try {
            const raw = localStorage.getItem('ccf_guest') || 'null';
            const g = JSON.parse(raw);
            if (!g || typeof g !== 'object') return;
            const guestFriends = (g.friends && typeof g.friends === 'object') ? g.friends : {};
            if (!Object.keys(guestFriends).length && !(Array.isArray(g.pendingIn) && g.pendingIn.length)) return;
            if (Object.keys(S.friends).length || S.pendingIn.length || S.inbox.length) return; // account shelf non-empty: hands off
            // Mark it adopted no matter what happens below, so a failure here
            // can never turn into an infinite re-import.
            try { localStorage.setItem(GUEST_ADOPTED_KEY, String(Date.now())); } catch (_) {}
            for (const [fid, f] of Object.entries(guestFriends)) {
                // Never resurrect someone THIS account deliberately removed.
                if (S.removed[fid] || S.declined[fid]) continue;
                if (!S.friends[fid]) S.friends[fid] = { ...f };
            }
            for (const p of (Array.isArray(g.pendingIn) ? g.pendingIn : [])) {
                if (p && p.uid && !S.declined[p.uid] && !S.pendingIn.some((x) => x.uid === p.uid)) S.pendingIn.push({ ...p });
            }
            for (const m of (Array.isArray(g.inbox) ? g.inbox : []).slice(0, 20)) {
                if (m && m.id && !S.inbox.some((x) => x.id === m.id)) S.inbox.push({ ...m });
            }
            S.inbox = S.inbox.slice(0, 50);
            save(); renderBell();
        } catch (_) {}
    }
    let shelfUid = uidOf();
    setInterval(() => {
        const u = uidOf();
        if (u !== shelfUid) {
            const wasGuest = shelfUid === 'guest';
            shelfUid = u; S = load(); renderBell();
            // Adopt the guest circle at most once per browser, and only when
            // signing in FROM a guest session for the first time.
            if (wasGuest && u !== 'guest' && !hasAdoptedGuest()) adoptGuestShelf();
            try { ensureP2PInbox(); } catch (_) {}
        }
    }, 3000);
    function hasAdoptedGuest() {
        try { return !!localStorage.getItem(GUEST_ADOPTED_KEY); } catch (_) { return false; }
    }

    /* ── API base (same rule as matchmaking) ────────────────── */
    function apiBase() {
        try {
            const ov = localStorage.getItem('cc_api_base');
            if (ov) return String(ov).replace(/\/+$/, '');
        } catch (_) {}
        try {
            if (location.protocol.indexOf('http') === 0 && !/\.github\.io$/.test(location.hostname)) return '';
        } catch (_) {}
        return null;
    }
    async function api(path, body) {
        const base = apiBase();
        if (base === null) throw new Error('no-api');
        const headers = body === undefined ? {} : { 'Content-Type': 'application/json' };
        try {
            const t = await sessionToken();
            if (t) headers['Authorization'] = 'Bearer ' + t;
        } catch (_) {}
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 7000);
        try {
            const res = await fetch(`${base}/api/${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers,
                credentials: 'same-origin',
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: ctrl.signal,
            });
            // Only 401 means "no valid session". A 403 is an authorization decision
            // (not a friend, wrong relationship) and must NOT latch the
            // account into a signed-out state.
            if (res.status === 401) authState = 'signed-out';
            else if (res.ok) authState = 'signed-in';
            if (!res.ok) throw new Error('http-' + res.status);
            return await res.json();
        } finally { clearTimeout(to); }
    }
    // Canonical site base for shareable links (localhost/file URLs are
    // useless to a friend on another machine).
    function siteBase() {
        try {
            const ov = localStorage.getItem('cc_site_url');
            if (ov) return String(ov).replace(/\/+$/, '');
        } catch (_) {}
        try {
            const h = location.hostname || '';
            if (h === 'localhost' || h === '127.0.0.1' || h === '' || location.protocol === 'file:') {
                return 'https://mouadhhhallem.github.io/dochess/index.html';
            }
            let p = location.pathname || '/';
            if (p.endsWith('/')) p += 'index.html';
            return location.origin + p;
        } catch (_) {}
        return 'https://mouadhhhallem.github.io/dochess/index.html';
    }

    function cleanImg(v) {
        if (typeof v === 'string' && /^https:/.test(v)) return v.slice(0, 2048);
        return null;
    }

    /* ── failure handling: say what actually went wrong ─────────────── */
    // The previous version collapsed every failure into "The server refused
    // the request — check your connection", DELETED the row the user had just
    // created, and moved on. A signed-out user, a real outage and a genuine
    // rejection produced identical (useless) feedback, and the user's work
    // was destroyed either way. These helpers classify the failure so the
    // message names the actual problem, and nothing is thrown away silently.
    const FAILURES = {
        signedOut: { title: 'Sign in to use friends', body: 'Friend requests, rankings and invitations need a DoChess account. Sign in and try again — nothing was sent.' },
        offline: { title: 'Cannot reach DoChess', body: 'We could not reach the server, so nothing was sent or changed. Check your connection and try again.' },
        alreadyFriends: { title: 'Already friends', body: 'You are already friends with them — there is nothing to send.' },
        badRecipient: { title: 'That player is not reachable', body: 'This entry is not a real DoChess account, so no request could be sent to them.' },
        notFound: { title: 'Nothing to act on', body: 'That request or invitation no longer exists — it may already have been resolved.' },
        expired: { title: 'That invitation expired', body: 'Invitations are short-lived. Ask for a fresh one and it will land instantly.' },
        forbidden: { title: 'Not allowed', body: 'You do not have permission for that action.' },
        generic: { title: 'That did not work', body: 'The server did not accept it, so nothing was changed. Please try again.' }
    };
    /** True when this browser has a signed-in Clerk identity. */
    function hasIdentity() {
        try {
            const u = window.app && window.app._clerk && window.app._clerk.user;
            return !!(u && u.id);
        } catch (_) { return false; }
    }
    /**
     * True when we genuinely have no identity.
     *
     * This must NOT be based on the cached `authState` alone: a single
     * transient 401 latches that flag to 'signed-out', which would then block
     * every later retry for a user who is in fact signed in — the request
     * could never be re-sent. A live Clerk user always wins over the flag.
     */
    function isSignedOut() {
        if (uidOf() === 'guest') return true;
        if (hasIdentity()) return false;
        return authState === 'signed-out';
    }
    /** Map a thrown error onto a specific, honest explanation. */
    function explainFailure(e) {
        const m = String((e && e.message) || '');
        if (m === 'no-api' || !m) return FAILURES.offline;
        if (/^http-40[13]$/.test(m)) {
            if (m === 'http-409') return FAILURES.alreadyFriends;
            return FAILURES.signedOut;
        }
        if (/^http-5/.test(m)) return FAILURES.offline;
        if (m === 'already-friends') return FAILURES.alreadyFriends;
        if (m === 'bad-recipient') return FAILURES.badRecipient;
        if (m === 'no-request' || m === 'no-invite') return FAILURES.notFound;
        if (m === 'expired') return FAILURES.expired;
        if (m === 'not-a-relationship' || m === 'not-friends' || m === 'not-recipient') return FAILURES.forbidden;
        // AbortError (7 s timeout), TypeError (DNS / offline / CORS).
        if (/abort|failed|network|load/i.test(m)) return FAILURES.offline;
        return FAILURES.generic;
    }
    function reportFailure(title, why) {
        notifyLocal('note', title || why.title, why.body);
    }

    /* ── friends ────────────────────────────────────────────── */
    function friends() { return S.friends; }
    function getF(uid) { return S.friends[uid] || null; }

    /**
     * Send (or re-send) a friend request.
     *
     * On failure the row is KEPT and flagged `unsent` rather than deleted:
     * the user keeps what they did, the UI shows it as "not delivered" with
     * a Retry action, and nothing claims to have been sent.
     */
    async function requestFriend(uid, name, source, img) {
        if (!uid || uid === uidOf()) return null;
        clearTombstone(uid);
        const f = addFriendLocal(uid, name, source, img);
        if (!f) return null;
        if (apiBase() === null) return f; // device-local mode: honest fallback
        if (isSignedOut()) {
            f.unsent = true; f.unsentWhy = 'signedOut';
            save(); renderBell();
            reportFailure(null, FAILURES.signedOut);
            return f;
        }
        try {
            const r = await api('friends/request', {
                friendUid: uid, friendName: f ? f.name : '',
                friendImg: (f && f.img) || null, myName: meName(), myImg: myAvatar()
            });
            if (r && r.error) throw new Error(r.error);
            delete f.unsent; delete f.unsentWhy;
            save(); renderBell();
            return f;
        } catch (e) {
            const why = explainFailure(e);
            f.unsent = true; f.unsentWhy = String((e && e.message) || '').slice(0, 24);
            save(); renderBell();
            reportFailure(null, why);
            return f;
        }
    }

    function addFriendLocal(uid, name, source, img) {
        if (!uid || uid === uidOf()) return null;
        let f = S.friends[uid];
        if (!f) {
            f = S.friends[uid] = {
                uid, name: String(name || 'Player').slice(0, 24),
                since: Date.now(), confirmed: false, source: source || 'link', img: cleanImg(img),
                // Outbound = I asked, they haven't answered. Never shown
                // as a friend (separate Sent section) until accepted.
                outbound: source === 'search',
                days: {}, best: 0, lastSeen: 0,
            };
        } else if (name) f.name = String(name).slice(0, 24);
        if (img) { const ci = cleanImg(img); if (ci) f.img = ci; }
        if (!S.pendingOut.includes(uid) && !f.confirmed) S.pendingOut.push(uid);
        save(); renderBell();
        return f;
    }
    // Backwards-compatible internal name (search + P2P paths).
    function addFriend(uid, name, source, img) { return requestFriend(uid, name, source, img); }

    /**
     * Accept an inbound request. The server decides; the local shelf is
     * reconciled from the response and then from the authoritative snapshot.
     */
    async function acceptFriend(uid) {
        if (!uid || uid === uidOf()) return null;
        clearTombstone(uid);
        const ix = S.pendingIn.findIndex((p) => p.uid === uid);
        const req = ix >= 0 ? S.pendingIn[ix] : null;
        if (ix >= 0) S.pendingIn.splice(ix, 1);
        try { delete S.declined[uid]; } catch (_) {}

        if (apiBase() === null) {
            // Device-local mode: accept locally, honestly labelled as such.
            const f = req ? addFriendLocal(uid, req.name, 'link', req.img || null)
                : (S.friends[uid] || addFriendLocal(uid, 'Player', 'link'));
            if (f) { f.outbound = false; const po = S.pendingOut.indexOf(uid); if (po >= 0) S.pendingOut.splice(po, 1); save(); renderBell(); }
            return f;
        }

        try {
            const r = await api('friends/respond', { fromUid: uid, accept: true, myName: meName(), myImg: myAvatar() });
            if (!r || r.error) throw new Error((r && r.error) || 'bad-response');
        } catch (e) {
            // Put the request back so the user can retry, and say why.
            if (req && !S.pendingIn.some((p) => p.uid === uid)) S.pendingIn.unshift(req);
            save(); renderBell();
            notifyLocal('note', 'Could not accept', explainFailure(e).body);
            return null;
        }
        const f = addFriendLocal(uid, (req && req.name) || 'Player', 'link', (req && req.img) || null);
        if (f) { f.confirmed = true; f.outbound = false; }
        const po = S.pendingOut.indexOf(uid);
        if (po >= 0) S.pendingOut.splice(po, 1);
        save(); renderBell();
        pullSnapshot();
        return f;
    }

    /**
     * Decline an inbound request. FIX: this now reaches the server, which
     * writes a TERMINAL status. Previously it only filtered a local array and
     * sent a notification, so the requester's edge survived and the next
     * pullRequests() re-created the request within one poll cycle — which is
     * exactly "I declined it and it came back".
     */
    async function declineFriend(uid) {
        if (!uid) return;
        S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
        tombstone('declined', uid);
        try { delete S.friends[uid]; } catch (_) {}
        S.pendingOut = S.pendingOut.filter((x) => x !== uid);
        save(); renderBell();
        if (apiBase() === null) return;
        try {
            const r = await api('friends/respond', { fromUid: uid, accept: false, myName: meName() });
            if (r && r.error) throw new Error(r.error);
        } catch (e) {
            // The local hide stays (the user asked for it), but say exactly
            // what happened. On a transport failure the request is still
            // alive server-side, so drop the tombstone rather than silently
            // swallowing a decline that never landed.
            reportFailure('Could not decline the request', explainFailure(e));
            if (/abort|failed|network|load|^http-5|no-api/.test(String((e && e.message) || ''))) {
                try { delete S.declined[uid]; } catch (_) {}
                save();
            }
        }
    }

    /**
     * Remove a friend. FIX: this is no longer fire-and-forget. When a server
     * is configured the UI updates optimistically, the mutation is awaited,
     * and on failure the row is restored and the user is told — instead of
     * pretending the removal succeeded. A tombstone stops every re-add path
     * (snapshot, P2P hello, guest adoption) from undoing it.
     */
    async function removeFriend(uid) {
        if (!uid) return;
        const backup = S.friends[uid];
        const wasOut = S.pendingOut.slice();
        const wasIn = S.pendingIn.slice();
        delete S.friends[uid];
        S.pendingOut = S.pendingOut.filter((x) => x !== uid);
        S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
        tombstone('removed', uid);
        save(); renderBell();
        if (apiBase() === null) return; // device-local mode
        try {
            const r = await api('friends/remove', { friendUid: uid });
            if (!r || r.ok !== true) throw new Error((r && r.error) || 'not-removed');
        } catch (e) {
            // Honest failure: restore and reconcile with the server.
            try { delete S.removed[uid]; } catch (_) {}
            if (backup) S.friends[uid] = backup;
            S.pendingOut = wasOut; S.pendingIn = wasIn;
            save(); renderBell();
            notifyLocal('note', 'Could not remove friend', explainFailure(e).body);
            return;
        }
        pullSnapshot();
    }

    /**
     * The AUTHORITATIVE reconcile. One server response replaces the whole
     * shelf: friends the server does not list are removed locally (so a
     * removal sticks), and resolved requests are recorded as tombstones (so
     * a decline sticks). This is the fix for pullEdges() being additive-only
     * and therefore able to re-create a deleted friend on every poll.
     */
    async function pullSnapshot() {
        try {
            if (apiBase() === null) return false;
            const r = await api('friends/snapshot');
            if (!r || !Array.isArray(r.friends)) return false;
            let changed = false;
            const serverUids = new Set();

            for (const e of r.friends) {
                if (!e || !e.uid || e.uid === uidOf()) continue;
                serverUids.add(e.uid);
                clearTombstone(e.uid); // confirmed friendship wins a stale tombstone
                let f = S.friends[e.uid];
                if (!f) {
                    f = S.friends[e.uid] = {
                        uid: e.uid, name: String(e.name || 'Player').slice(0, 24),
                        since: e.since || Date.now(), confirmed: true, source: 'server',
                        img: cleanImg(e.img), days: cleanDayMap(e.days), best: 0,
                        streakCount: Number(e.streakCount) || 0, streakBest: Number(e.streakBest) || 0,
                        lastSeen: 0, outbound: false,
                    };
                    changed = true;
                } else {
                    if (e.name) f.name = String(e.name).slice(0, 24);
                    if (e.img) { const ci = cleanImg(e.img); if (ci) f.img = ci; }
                    // Durable streak union: the server's day map merges into
                    // the local one (per-day max — a day both sides saw is
                    // still one day), so a flame earned on any device, or
                    // healed from the server after a refresh, never resets.
                    if (e.days && typeof e.days === 'object') {
                        f.days = f.days || {};
                        for (const [k, v] of Object.entries(cleanDayMap(e.days))) {
                            f.days[k] = Math.max(f.days[k] || 0, v);
                        }
                    }
                    if (Number.isFinite(e.streakCount)) f.streakCount = e.streakCount;
                    if (Number.isFinite(e.streakBest)) f.streakBest = Math.max(f.streakBest || 0, f.best || 0, e.streakBest);
                    if (!f.confirmed || f.outbound) { f.confirmed = true; f.outbound = false; changed = true; }
                }
                const po = S.pendingOut.indexOf(e.uid);
                if (po >= 0) { S.pendingOut.splice(po, 1); changed = true; }
                S.pendingIn = S.pendingIn.filter((p) => p.uid !== e.uid);
            }

            const reqs = r.requests || {};
            const inbound = Array.isArray(reqs.inbound) ? reqs.inbound : [];
            const outbound = Array.isArray(reqs.outbound) ? reqs.outbound : [];
            const resolved = Array.isArray(reqs.resolved) ? reqs.resolved : [];

            // A resolved request is terminal on BOTH sides.
            for (const q of resolved) {
                if (!q || !q.uid || q.uid === uidOf()) continue;
                if (q.status === 'declined' || q.status === 'cancelled') {
                    tombstone(q.status === 'declined' ? 'declined' : 'removed', q.uid);
                    if (S.friends[q.uid] && S.friends[q.uid].outbound) delete S.friends[q.uid];
                } else if (q.status === 'accepted') {
                    clearTombstone(q.uid);
                }
            }

            // Uids the server still considers in-flight. A locally optimistic
            // row is NOT deleted while its request is in this window — the
            // snapshot can land between the optimistic write and the server
            // write, and deleting there would make a sent request flicker out
            // of the Sent list.
            const pendingUids = new Set(
                [...inbound, ...outbound].filter((q) => q && q.uid).map((q) => q.uid)
            );
            // An explicit PENDING row from the server supersedes a local
            // tombstone: the user declined earlier, but the other player has
            // since asked again, and that new request must become visible.
            // (Without this, a decline tombstone would silently swallow every
            // future re-request from the same person.)
            for (const uid of pendingUids) clearTombstone(uid);

            // Authoritative deletion: a local friend the server no longer
            // lists, and which is not an in-flight request, was removed (here
            // or on another device) — drop it. Rows flagged `unsent` are kept:
            // they represent an attempt that never reached the server, and
            // deleting them would destroy the user's work before they could
            // retry it.
            for (const uid of Object.keys(S.friends)) {
                if (uid === uidOf() || serverUids.has(uid) || pendingUids.has(uid)) continue;
                const rec = S.friends[uid];
                if (rec && rec.unsent) continue;
                const wasTombstoned = !!S.removed[uid];
                delete S.friends[uid];
                S.pendingOut = S.pendingOut.filter((x) => x !== uid);
                S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
                if (!wasTombstoned) tombstone('removed', uid);
                changed = true;
            }

            const nextIn = [];
            for (const q of inbound) {
                if (!q || !q.uid || q.uid === uidOf()) continue;
                if (isBlocked(q.uid) || S.friends[q.uid]) continue;
                nextIn.push({ uid: q.uid, name: String(q.name || 'Player').slice(0, 24), img: cleanImg(q.img), at: q.at || Date.now() });
            }
            const nextOut = [];
            for (const q of outbound) {
                if (!q || !q.uid || q.uid === uidOf()) continue;
                if (isBlocked(q.uid) || S.friends[q.uid]) continue;
                nextOut.push(q.uid);
            }
            // An undelivered attempt stays listed so the user can retry or cancel it.
            for (const uid of S.pendingOut.slice()) {
                if (uid === uidOf()) continue;
                const rec = S.friends[uid];
                if (rec && rec.unsent && !nextOut.includes(uid)) nextOut.push(uid);
            }
            // The flag clears ONLY once the server actually lists the request
            // as pending — i.e. the send landed. (Inverting this condition
            // would wipe the flag on every poll and hide a failed send.)
            for (const uid of nextOut.slice()) {
                const rec = S.friends[uid];
                if (rec && rec.unsent && outbound.some((q) => q && q.uid === uid)) {
                    delete rec.unsent; delete rec.unsentWhy;
                }
            }
            const inSig = nextIn.map((p) => p.uid).join(',');
            if (inSig !== S.pendingIn.map((p) => p.uid).join(',')) changed = true;
            S.pendingIn = nextIn;
            if (nextOut.join(',') !== S.pendingOut.join(',')) changed = true;
            S.pendingOut = nextOut;

            if (changed) { save(); renderBell(); }
            return changed;
        } catch (_) { return false; }
    }

    // Legacy helper name kept for callers; now an alias of the authoritative
    // snapshot (it is no longer additive-only).
    async function pullEdges() { return pullSnapshot(); }

    /**
     * Inbound requests from the server (explicit `pending` rows only — never
     * derived from graph asymmetry, which is what made a decline undoable).
     */
    async function pullRequests() {
        return pullSnapshot();
    }
    // Called on every PeerJS hello/profile: confirms pending friendships
    // and refreshes last-seen. Writes throttled to one per 5 minutes.
    const lastTouchWrite = {};
    function metPeer(uid, name, img) {
        if (!uid || uid === uidOf()) return;
        // A deliberate removal or decline is never undone by meeting the
        // person peer-to-peer. (This path used to re-add anyone in pendingOut
        // on every PeerJS hello.)
        if (isBlocked(uid)) return;
        img = cleanImg(img);
        const now = Date.now();
        const f = S.friends[uid];
        if (f) {
            if (name) f.name = String(name).slice(0, 24);
            if (img) f.img = img;
            f.lastSeen = now;
            if (!lastTouchWrite[uid] || now - lastTouchWrite[uid] > 300000) {
                lastTouchWrite[uid] = now;
                save();
            }
            return;
        }
    }

    /* ── directory + search (3-letter minimum) ──────────────── */
    function directory() {
        const map = new Map();
        for (const [uid, f] of Object.entries(S.friends)) map.set(uid, { uid, name: f.name, friend: true, rating: null, img: f.img || null });
        for (const p of S.pendingIn) if (!map.has(p.uid)) map.set(p.uid, { uid: p.uid, name: p.name, friend: false, rating: null, pending: true, img: p.img || null });
        for (const uid of S.pendingOut) {
            const f = S.friends[uid];
            if (!map.has(uid)) map.set(uid, { uid, name: (f && f.name) || 'Player', friend: !!f, rating: null, pending: true });
        }
        try {
            if (typeof OnlineRatings !== 'undefined' && OnlineRatings.board) {
                for (const p of OnlineRatings.board('blitz')) {
                    if (p.uid && !map.has(p.uid)) map.set(p.uid, { uid: p.uid, name: p.name, friend: false, rating: p.rating });
                }
                const hist = OnlineRatings.history ? OnlineRatings.history(uidOf()) : [];
                const seen = new Set();
                for (const h of hist) {
                    const key = (h.oppUid || '') + '|' + (h.opp || '');
                    if (!key.replace(/\|/g, '') || seen.has(key)) continue;
                    seen.add(key);
                    if (h.oppUid && !map.has(h.oppUid)) map.set(h.oppUid, { uid: h.oppUid, name: h.opp || 'Player', friend: false, rating: null });
                }
            }
        } catch (_) {}
        return [...map.values()];
    }
    function search(q) {
        q = String(q || '').trim().toLowerCase();
        if (q.length < 3) return { gated: true, rows: [] };
        return { gated: false, rows: directory().filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20) };
    }

    /* ── streaks (TikTok rules) ─────────────────────────────── */
    /**
     * The flame over local + durable state. The local day map carries this
     * device's optimistic stamps; `streakCount` is the server's exact run
     * (exact even past the day-map window). max() of the two is right in
     * every case: a stamp this device made but hasn't synced yet, or a stamp
     * another device made that this one hasn't seen.
     */
    function localRun(f) {
        if (!f || !f.days) return 0;
        let n = 0;
        let cursor = f.days[TODAY()] ? 0 : (f.days[keyDaysAgo(1)] ? 1 : -1);
        if (cursor < 0) return 0;
        for (let back = cursor; ; back++) {
            if (f.days[keyDaysAgo(back)]) n++;
            else break;
        }
        return n;
    }
    function streakOf(f) {
        if (!f) return 0;
        return Math.max(localRun(f), Number(f.streakCount) || 0);
    }
    function cleanDayMap(days) {
        const out = {};
        if (!days || typeof days !== 'object') return out;
        for (const [k, v] of Object.entries(days)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v)) out[k] = v;
        }
        return out;
    }
    function stampGame(uid) {
        const f = S.friends[uid];
        if (!f) return null;
        const t = TODAY();
        f.days = f.days || {};
        f.days[t] = (f.days[t] || 0) + 1;
        // Prune ancient days (keeps the shelf small, streak math intact).
        const keys = Object.keys(f.days).sort();
        while (keys.length > 400) delete f.days[keys.shift()];
        const st = streakOf(f);
        if (st > Math.max(f.best || 0, f.streakBest || 0)) f.best = st;
        f.lastSeen = Date.now();
        save();
        if (st > 0 && (st === 7 || st === 30 || st === 100)) {
            notifyLocal('streak', `${st}-day streak with ${f.name}!`, st === 7 ? 'One week of chess together — keep it burning.' : 'Legendary consistency. One game a day keeps it alive.');
        }
        return st;
    }
    function atRisk() {
        const out = [];
        const t = TODAY(), y = keyDaysAgo(1);
        // Any listed friend counts (mutual or not): one game together
        // yesterday keeps today's flame alive from our side.
        for (const f of Object.values(S.friends)) {
            const st = streakOf(f);
            if (st > 0 && f.days[y] && !f.days[t]) out.push({ f, streak: st });
        }
        return out;
    }
    function warnStreaks() {
        const t = TODAY();
        for (const { f, streak } of atRisk()) {
            let warned = {};
            try { warned = JSON.parse(localStorage.getItem('ccf_warned') || '{}'); } catch (_) {}
            if (warned[f.uid] === t) continue;
            warned[f.uid] = t;
            try { localStorage.setItem('ccf_warned', JSON.stringify(warned)); } catch (_) {}
            notifyLocal('streak', `Streak with ${f.name} is fading`, `Play one game today or the ${streak}-day flame goes out.`);
        }
    }

/**
     * Relay a plain note to another player's server inbox.
     *
     * Friend-lifecycle announcements are NO LONGER sent from here: the server
     * composes them from the stored request/invitation rows, so a client can
     * never put words in another account's mouth. Invitations likewise go
     * through POST /api/invites, which mints a server-side match id and
     * requires friendship. This helper only carries 'note' / 'streak' / 'rank'.
     */
    function serverNotify(toUid, kind, title, body) {
        try {
            if (apiBase() === null || !toUid || toUid === uidOf()) return Promise.resolve(false);
            if (!['note', 'streak', 'rank'].includes(kind)) return Promise.resolve(false);
            return api('notify', { toUid, kind, title: String(title).slice(0, 60), body: String(body || '').slice(0, 140) })
                .then(() => true)
                .catch(() => false);
} catch (_) { return Promise.resolve(false); }
    }

    /* ── inbox ──────────────────────────────────────────────── */
    function notifyLocal(kind, title, body, from) {
        S.inbox.unshift({ id: 'l' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), kind, title: String(title).slice(0, 60), body: String(body || '').slice(0, 140), from: from || null, at: Date.now(), read: false, local: true });
        S.inbox = S.inbox.slice(0, 50);
        save(); renderBell();
        return true;
    }
    function unread() {
        return S.inbox.filter((m) => !m.read).length;
    }
    function renderBell() {
        const n = unread();
        document.querySelectorAll('.bell-count').forEach((el) => {
            el.hidden = n === 0;
            el.textContent = n > 99 ? '99+' : String(n);
        });
    }
    function ackIds(ids) {
        try {
            if (apiBase() === null || !ids || !ids.length) return;
            api('notify/ack', { ids }).catch(() => {});
        } catch (_) {}
    }
    async function pullInbox() {
        try {
            if (apiBase() === null) return false;
            const r = await api('notify');
            if (!r || !Array.isArray(r.items)) return false;
            const have = new Set(S.inbox.map((m) => m.id));
            let added = false;
let needSnapshot = false;
            for (const m of r.items) {
                if (!m || !m.id || have.has(m.id)) continue;
                // Server items carry no invitation payload any more (the
                // inbox is not an invitation channel), so `data` is always
                // null here and invites are read from /api/invites instead.
                S.inbox.unshift({
                    id: m.id, kind: m.kind || 'note',
                    title: String(m.title || '').slice(0, 60),
                    body: String(m.body || '').slice(0, 140),
                    from: m.from || null, at: m.at || Date.now(), read: !!m.read, local: false
                });
                added = true;
                // A friend-lifecycle announcement is a nudge only. The shelf
                // is reconciled from the authoritative snapshot, and a
                // tombstoned uid is never re-created from a notification —
                // this is what stops a declined request from coming back.
                try { needSnapshot = true; } catch (_) {}
            }
            if (added || needSnapshot) { S.inbox = S.inbox.slice(0, 50); save(); renderBell(); }
            try { if (needSnapshot) await pullSnapshot(); } catch (_) {}
            return added;
        } catch (_) { return false; }
    }

    /* ── presence ───────────────────────────────────────────── */
    /* ── Serverless P2P invite channel (live static site has no API) ──
       The server inbox is primary when configured, but GitHub Pages has
       no backend — so every signed-in tab also holds a personal PeerJS
       inbox (`cci-<uid>`) that friends dial directly. Same invite shape,
       same global popup, same Accept-joins-board flow; validated on
       receipt, deduped by invite id, expired by the same TTL. */
    let p2pInboxPeer = null;
    let p2pInboxUid = null;
    let p2pRetryTimer = null;
    const seenP2P = new Set();
    function p2pLater(ms) {
        try { if (p2pRetryTimer) clearTimeout(p2pRetryTimer); } catch (_) {}
        p2pRetryTimer = setTimeout(() => { p2pRetryTimer = null; try { ensureP2PInbox(); } catch (_) {} }, ms || 30000);
    }
    function receiveP2PInvite(msg) {
        if (!msg) { // inbox closed underneath us (network / second tab): reopen lazily
            p2pInboxPeer = null;
            p2pLater(10000);
            return;
        }
        try {
            if (msg.type === 'invite-decline') {
                try {
                    if (msg.fromUid && msg.fromUid !== uidOf()) {
                        const f = S.friends[msg.fromUid];
                        const nm = f ? f.name : String((msg.fromName || 'Your friend')).replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 24) || 'Your friend';
                        notifyLocal('note', `${nm} declined your invite`, 'The room is closed — invite someone else or share a new code.');
                    }
                } catch (_) {}
                return;
            }
            if (msg.type !== 'game-invite') return;
            if (!msg.fromUid || msg.fromUid === uidOf()) return;
            if (seenP2P.has(msg.inviteId)) return; // duplicate delivery
            seenP2P.add(msg.inviteId);
            while (seenP2P.size > 200) { try { seenP2P.delete(seenP2P.values().next().value); } catch (_) { break; } }
            const at = (typeof msg.at === 'number' && isFinite(msg.at)) ? msg.at : Date.now();
            if (Date.now() - at > INVITE_TTL_MS) return; // expired in flight
            if (S.inbox.some((m) => m.id === 'p' + msg.inviteId)) return;
            const nm = String(msg.fromName || 'Player').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 24) || 'Player';
            const photo = (typeof msg.img === 'string' && /^https:/.test(msg.img)) ? msg.img.slice(0, 2048) : null;
            S.inbox.unshift({ id: 'p' + msg.inviteId, kind: 'game-invite', title: `${nm} invites you to play`, body: `${controlLabel(msg.control)} game — tap Accept to join instantly.`, from: msg.fromUid, at, read: false, local: false, p2p: true, data: { code: msg.code, control: msg.control, fromName: nm, rating: msg.rating, img: photo } });
            S.inbox = S.inbox.slice(0, 50);
            save(); renderBell();
            checkInvitePopup(); // global: pops over whatever page is showing
        } catch (_) {}
    }
    async function ensureP2PInbox() {
        try {
            const me = uidOf();
            if (me === 'guest') return;
            if (typeof OnlineNet === 'undefined') return;
            if (p2pInboxPeer && p2pInboxUid === me) return;
            if (p2pInboxPeer) { try { OnlineNet.closeInbox(p2pInboxPeer); } catch (_) {} p2pInboxPeer = null; p2pInboxUid = null; }
            const peer = await OnlineNet.listenInbox(me, receiveP2PInvite);
            if (peer) { p2pInboxPeer = peer; p2pInboxUid = me; }
            else p2pLater(60000); // held by another tab: retry lazily
        } catch (_) { p2pLater(30000); }
    }
    function sendP2PInvite(toUid, code, control) {
        try {
            if (typeof OnlineNet === 'undefined') return Promise.resolve(false);
            const me = uidOf();
            if (me === 'guest' || !toUid || toUid === me) return Promise.resolve(false);
            const cid = String(control || 'blitz').slice(0, 16);
            const inv = {
                type: 'game-invite',
                code: OnlineNet.normalizeCode(code),
                control: (/^[a-z0-9-]{1,16}$/.test(cid) ? cid : 'blitz'),
                fromUid: me,
                fromName: String(meName()).slice(0, 24) || 'Player',
                rating: Math.max(100, Math.min(4000, Math.round(myRating(cid) || 800))),
                img: myAvatar(),
                at: Date.now(),
                inviteId: OnlineNet.makeInviteId(),
            };
            if (!OnlineNet.validInvite(inv)) return Promise.resolve(false);
            return OnlineNet.sendInvite(toUid, inv);
        } catch (_) { return Promise.resolve(false); }
    }
    function sendP2PDecline(toUid, invite) {
        try {
            if (typeof OnlineNet === 'undefined' || !toUid || toUid === uidOf() || uidOf() === 'guest') return;
            const id = invite && String(invite.id || '').replace(/^p/, '');
            if (!id || !/^[0-9a-f]{8,64}$/i.test(id)) return; // server item: sender learns via their own poll, no P2P channel
            OnlineNet.sendDecline(toUid, { type: 'invite-decline', inviteId: id, fromUid: uidOf(), fromName: String(meName()).slice(0, 24) || 'Player', at: Date.now() }).catch(() => {});
        } catch (_) {}
    }
    /* ── Game-invite popup (quick-match motion, anywhere on site) ── */
    // Expiry is now SERVER-side (POST /api/invites stamps expiresAt and
    // /api/invites/respond refuses an expired match). This client constant
    // remains only as the device-local fallback TTL used when there is no
    // backend, where the host's PeerJS room exists only while their tab is
    // open.
    const INVITE_TTL_MS = 3 * 60 * 1000;

    // The six supported time controls, each rendered exactly once, grouped by
    // the category the rating system uses. `minutes`/`incSec` are the values
    // the server validates against (server/lib/social.mjs TIME_CONTROLS).
    const INVITE_CONTROLS = [
        { minutes: 1, incSec: 0, label: '1+0', cat: 'Bullet' },
        { minutes: 3, incSec: 0, label: '3+0', cat: 'Blitz' },
        { minutes: 5, incSec: 0, label: '5+0', cat: 'Blitz' },
        { minutes: 3, incSec: 2, label: '3+2', cat: 'Blitz' },
        { minutes: 10, incSec: 0, label: '10+0', cat: 'Rapid' },
        { minutes: 15, incSec: 10, label: '15+10', cat: 'Rapid' }
    ];
    function catForControl(minutes, incSec) {
        const dur = minutes + 40 * ((incSec || 0) / 60);
        return dur < 3 ? 'Bullet' : dur < 8 ? 'Blitz' : 'Rapid';
    }
    function controlCatId(minutes, incSec) {
        return catForControl(minutes, incSec).toLowerCase();
    }

    /**
     * Time-control picker for the invite flow. Rating / rank information is
     * deliberately NOT shown here — it belongs to the lobby, not to the
     * control you are choosing — and each option appears exactly once.
     */
    function pickTimeControl(toUid) {
        return new Promise((resolve) => {
            const prev = document.getElementById('tc-overlay');
            if (prev) prev.remove();
            let selected = INVITE_CONTROLS[3];
            try {
                const saved = JSON.parse(localStorage.getItem('cc_invite_control') || 'null');
                const hit = saved && INVITE_CONTROLS.find((c) => c.minutes === saved.m && c.incSec === saved.s);
                if (hit) selected = hit;
            } catch (_) {}
            const ov = document.createElement('div');
            ov.id = 'tc-overlay';
            const rows = ['Bullet', 'Blitz', 'Rapid'].map((cat) => {
                const opts = INVITE_CONTROLS.filter((c) => c.cat === cat);
                return '<fieldset class="tc-group"><legend>' + esc(cat) + '</legend>'
                    + opts.map((c) => '<label class="tc-opt"><input type="radio" name="tc-pick" value="' + c.minutes + ':' + c.incSec + '"'
                        + ((c.minutes === selected.minutes && c.incSec === selected.incSec) ? ' checked' : '') + '>'
                        + '<span class="tc-time">' + esc(c.label) + '</span>'
                        + '<span class="tc-cat">' + esc(c.cat) + '</span></label>').join('')
                    + '</fieldset>';
            }).join('');
            ov.innerHTML = '<div class="qm-card" role="dialog" aria-modal="true" aria-label="Choose a time control">'
                + '<h3 class="qm-title">Choose a time control</h3>'
                + '<p class="qm-sub">How long should each side get on the clock?</p>'
                + '<div class="tc-list">' + rows + '</div>'
                + '<div class="fr-acts" style="justify-content:center">'
                + '<button class="btn-primary" data-tc="go" type="button">Send invite</button>'
                + '<button class="btn-secondary" data-tc="cancel" type="button">Cancel</button>'
                + '</div></div>';
            document.body.appendChild(ov);
            const finish = (val) => {
                try { ov.remove(); } catch (_) {}
                resolve(val);
            };
            ov.addEventListener('change', (e) => {
                const t = e.target;
                if (!t || t.name !== 'tc-pick') return;
                const parts = String(t.value).split(':');
                const hit = INVITE_CONTROLS.find((c) => c.minutes === Number(parts[0]) && c.incSec === Number(parts[1]));
                if (hit) selected = hit;
            });
            ov.addEventListener('click', (e) => {
                const b = e.target && e.target.closest ? e.target.closest('[data-tc]') : null;
                if (!b) return;
                if (b.dataset.tc === 'cancel') { finish(null); return; }
                try { localStorage.setItem('cc_invite_control', JSON.stringify({ m: selected.minutes, s: selected.incSec })); } catch (_) {}
                finish({ minutes: selected.minutes, incSec: selected.incSec, label: selected.label, cat: selected.cat });
            });
            try { ov.querySelector('[data-tc="go"]').focus(); } catch (_) {}
        });
    }

    /**
     * Create the invitation. When a backend exists this is a real entity:
     * POST /api/invites mints the match id, validates the time control,
     * enforces friendship and stamps the expiry. Only then do we claim the
     * invite was sent. Without a backend we fall back to the device-local
     * PeerJS dial and LABEL IT as such.
     */
    async function sendGameInvite(toUid, code, minutes, incSec) {
        if (!toUid || toUid === uidOf()) return { ok: false, reason: 'self' };
        const m = Number(minutes) || 3, s = Number(incSec) || 0;
        const known = INVITE_CONTROLS.find((c) => c.minutes === m && c.incSec === s);
        if (!known) return { ok: false, reason: 'bad-time-control' };

        if (apiBase() !== null) {
            try {
                const r = await api('invites', { toUid, minutes: m, incSec: s, code: String(code || '').toUpperCase() });
                if (!r || r.error) return { ok: false, reason: (r && r.error) || 'http-error' };
                return { ok: true, matchId: r.matchId, code: r.code, expiresAt: r.expiresAt, delivery: 'server' };
            } catch (e) {
                return { ok: false, reason: 'unreachable' };
            }
        }
        // Device-local fallback: no server, no durability, no delivery
        // guarantee. The caller must not present this as a confirmed invite.
        const sent = await sendP2PInvite(toUid, code, controlCatId(m, s));
        return sent ? { ok: true, delivery: 'device-local' } : { ok: false, reason: 'peer-unreachable' };
    }

    /** Pull pending invitations from the server into the local inbox. */
    async function pullInvites() {
        try {
            if (apiBase() === null) return false;
            const r = await api('invites');
            if (!r || !Array.isArray(r.invites)) return false;
            let added = false;
            for (const inv of r.invites) {
                if (!inv || !inv.matchId || !inv.code) continue;
                const id = 'i' + inv.matchId;
                if (S.inbox.some((m) => m.id === id)) continue;
                // A server invitation can only exist between friends, so the
                // sender's display identity is resolved from the friendship
                // row we already hold — never from a client-asserted field.
                const fr = S.friends[inv.from] || null;
                S.inbox.unshift({
                    id, kind: 'game-invite',
                    title: 'Match invitation',
                    body: `${(inv.control && inv.control.label) || ''} — tap Accept to join.`.trim(),
                    from: inv.from || null, at: inv.createdAt || Date.now(), read: false, local: false,
                    data: {
                        matchId: inv.matchId, code: inv.code,
                        control: (inv.control && inv.control.id) || 'blitz',
                        fromName: (fr && fr.name) || 'A friend',
                        img: (fr && fr.img) || null,
                        minutes: inv.minutes, incSec: inv.incSec, expiresAt: inv.expiresAt
                    }
                });
                added = true;
            }
            if (added) { S.inbox = S.inbox.slice(0, 50); save(); renderBell(); checkInvitePopup(); }
            return added;
        } catch (_) { return false; }
    }

    const shownInvites = new Set();
    // The invitation this account is currently waiting on, so the sender can
    // be told the moment the recipient accepts or declines.
    let pendingInvite = null;
    try { pendingInvite = JSON.parse(localStorage.getItem('cc_pending_invite') || 'null'); } catch (_) {}
    function clearPendingInvite() {
        pendingInvite = null;
        try { localStorage.removeItem('cc_pending_invite'); } catch (_) {}
    }
    /**
     * The SENDER side of the invitation lifecycle. While a sent invite is
     * outstanding, every inbox tick (5 s), every invite-accepted/declined
     * push, and every boot re-reads its server status:
     *
     * - accepted → clear the wait, announce it, and take the sender straight
     *   to the board. If their waiting room is still live, just show it; if
     *   the page reloaded and the room died, re-host the SAME code the
     *   recipient is dialling (same control, so clocks agree) and show that.
     *   Either way the sender never has to walk Friends → Online by hand.
     * - declined → clear the wait silently: the server already queued an
     *   "X declined" inbox note for the sender, so a second notice would nag.
     * - expired (or vanished past its lifetime) → clear the wait and say so
     *   honestly, so the sender is never stuck "waiting" on a dead invite.
     */
    async function watchSentInvite() {
        try {
            if (apiBase() === null || uidOf() === 'guest') return;
            if (!pendingInvite || !pendingInvite.matchId) return;
            let r = null;
            try { r = await api('invites'); } catch (_) { return; }
            const sent = (r && Array.isArray(r.sent)) ? r.sent : [];
            const row = sent.find((s) => s && s.matchId === pendingInvite.matchId);
            if (!row) {
                // Unknown to the server. A fresh wait may just be racing the
                // server write — keep waiting. An old one was swept long
                // after it died: stop, and say so.
                if (Date.now() - (pendingInvite.at || 0) > 24 * 3600 * 1000) clearPendingInvite();
                return;
            }
            if (!row.status || row.status === 'pending') {
                if (row.expiresAt && Date.now() > row.expiresAt) {
                    clearPendingInvite();
                    notifyLocal('note', 'Invite expired', 'They did not answer in time — send a fresh invite whenever you like.');
                }
                return;
            }
            if (row.status === 'accepted') {
                const code = row.code || pendingInvite.code;
                const name = row.toName || pendingInvite.toName || 'Your friend';
                const control = pendingInvite.control;
                clearPendingInvite();
                notifyLocal('note', `${String(name).slice(0, 24)} accepted!`, 'Taking you to the board…');
                joinAsSender(code, control);
                return;
            }
            // declined (or anything else terminal): the server's inbox note
            // already tells the sender — just stop watching.
            clearPendingInvite();
        } catch (_) {}
    }
    function joinAsSender(code, control) {
        try {
            if (!window.app || !code) return;
            const cur = window.app.online;
            if (cur && cur.phase === 'waiting' && cur.code === code && cur.net) {
                window.app.showOnline();
                return;
            }
            try {
                const c = control || {};
                if (Number.isFinite(c.minutes)) {
                    try { localStorage.setItem('cc_control', JSON.stringify({ m: c.minutes, s: c.incSec || 0 })); } catch (_) {}
                }
                const hosted = window.app._onlineHost(code);
                const go = () => { try { window.app.showOnline(); } catch (_) {} };
                if (hosted && typeof hosted.then === 'function') hosted.then(() => setTimeout(go, 600));
                else setTimeout(go, 900);
            } catch (_) { try { window.app.showOnline(); } catch (_) {} }
        } catch (_) {}
    }
    function controlLabel(id) {
        const map = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', correspondence: 'Correspondence' };
        return (id && map[id]) || id || 'chess';
    }
    function inviteExpired(m) {
        try {
            // A server invitation carries its own expiry, which is the
            // authoritative one. Only device-local invites fall back to the
            // client TTL.
            const exp = m && m.data && m.data.expiresAt;
            if (Number.isFinite(exp)) return Date.now() > exp;
            const at = (m && m.at) || 0;
            return !at || (Date.now() - at > INVITE_TTL_MS);
        } catch (_) { return false; }
    }
    function closeInvitePopup() { try { const o = document.getElementById('gip-overlay'); if (o) o.remove(); } catch (_) {} }
    function ackInvite(item) {
        if (!item) return;
        // Same-room duplicates (server + P2P delivery of one invite) act
        // as one: settling the popup settles every copy of the code.
        const code = item && item.data && item.data.code;
        const ids = [item.id];
        shownInvites.add(item.id);
        for (const m of S.inbox) {
            if (m.id === item.id) { m.read = true; continue; }
            if (code && !m.read && m.kind === 'game-invite' && m.data && m.data.code === code) {
                m.read = true;
                shownInvites.add(m.id);
                ids.push(m.id);
            }
        }
        save(); renderBell();
        try { ackIds(ids.filter((id) => String(id).charAt(0) !== 'p')); } catch (_) {}
        // Advance the queue: declining one invite reveals the next, if any.
        try { setTimeout(checkInvitePopup, 50); } catch (_) {}
    }
    async function acceptInvite(item, btn) {
        const code = item && item.data && item.data.code;
        const matchId = item && item.data && item.data.matchId;
        // Double-tap guard: joining twice opens two sessions.
        try {
            document.querySelectorAll('#gip-overlay [data-gip]').forEach((b) => { b.disabled = true; });
            if (btn) btn.textContent = 'Joining…';
        } catch (_) {}
        if (!code || (item && inviteExpired(item))) {
            closeInvitePopup();
            ackInvite(item);
            try { notifyLocal('note', 'Invite expired', 'That invitation is no longer valid — ask your friend to send a fresh one.'); } catch (_) {}
            return;
        }
        // Server-authoritative accept. Only the recipient may accept, an
        // expired or already-resolved match is refused, and a double-click is
        // idempotent — so this cannot produce two matches.
        if (matchId && apiBase() !== null) {
            try {
                const r = await api('invites/respond', { matchId, accept: true });
                if (!r || r.error) throw new Error((r && r.error) || 'http-error');
            } catch (e) {
                try { document.querySelectorAll('#gip-overlay [data-gip]').forEach((b) => { b.disabled = false; }); } catch (_) {}
                const why = (e && e.message) === 'expired' ? 'That invitation has expired.'
                    : (e && e.message) === 'already-resolved' ? 'That invitation was already handled.'
                        : 'The server did not confirm the match, so nothing was joined.';
                try { notifyLocal('note', 'Could not join', why); } catch (_) {}
                return;
            }
        }
        // Adopt the inviter's time control BEFORE joining so the lobby label,
        // the hello handshake and the rating bucket agree from the first tick.
        try {
            const d = item && item.data;
            const mins = Number.isFinite(d.minutes) ? d.minutes : null;
            const inc = Number.isFinite(d.incSec) ? d.incSec : null;
            if (mins !== null && inc !== null) localStorage.setItem('cc_control', JSON.stringify({ m: mins, s: inc }));
        } catch (_) {}
        closeInvitePopup();
        ackInvite(item);
        try {
            if (!window.app) return;
            // Straight to the board: the popup is global (it pops over Home,
            // Profile, Learn — anywhere), so the recipient never has to visit
            // the Online page themselves. showOnline() mounts the game
            // surface and _onlineJoin dials the room; the welcome handler
            // paints the live game. No code to type, no second tap.
            window.app.showOnline();
            setTimeout(() => { try { window.app._onlineJoin(code); } catch (_) {} }, 600);
        } catch (_) {}
    }
    function invitePopup(item) {
        closeInvitePopup();
        const d = (item && item.data) || {};
        // Trust tiers against impersonation (sender fields are self-
        // asserted on both channels): friends show our stored name+photo,
        // pending requests show their request name+photo, strangers show
        // the asserted name with a letter avatar (never their photo).
        const fromUid = item && item.from;
        const knownF = (fromUid && S.friends[fromUid]) || null;
        const knownP = (!knownF && fromUid && S.pendingIn.find((p) => p.uid === fromUid)) || null;
        const rawWho = (knownF && knownF.name) || (knownP && knownP.name) || d.fromName || (item && item.title) || 'A friend';
        const who = String(rawWho).replace(/ invites you.*$/, '').slice(0, 24) || 'A friend';
        const trustedImg = (knownF && knownF.img) || (knownP && knownP.img) || null;
        const ava = cleanImg(trustedImg)
            ? '<img class="fr-avaimg" src="' + esc(trustedImg) + '" alt="" width="54" height="54" loading="lazy" draggable="false">'
            : '<span class="fr-ava" aria-hidden="true">' + esc((who[0] || 'P').toUpperCase()) + '</span>';
        const eloTxt = (d.rating != null) ? String(d.rating) : null;
        // Server invitations carry their own control label; device-local ones
        // only carry the category.
        const ctrlTxt = (d.minutes != null && d.incSec != null)
            ? `${d.minutes}+${d.incSec} · ${controlLabel(d.control)}`
            : controlLabel(d.control);
        const ov = document.createElement('div');
        ov.id = 'gip-overlay';
        ov.innerHTML = '<div class="qm-card" role="dialog" aria-modal="true" aria-label="Game invitation">'
            + '<div class="qm-radar"><span class="qm-clockwrap">' + ((typeof ChessCourseApp !== 'undefined' && ChessCourseApp.quickClockSVG) ? ChessCourseApp.quickClockSVG('lg') : '') + '</span></div>'
            + '<div style="display:flex;align-items:center;gap:.7rem;justify-content:center;margin-bottom:.3rem">' + ava
            + '<div style="text-align:left"><div class="qm-title" style="margin:0">' + esc(who) + ' invites you</div>'
            + '<div class="qm-sub" style="margin:0">' + esc(ctrlTxt) + (eloTxt ? ' · ' + esc(eloTxt) : '') + '</div></div></div>'
            + '<div class="qm-sub">Tap Accept to join instantly — you go straight to the board.</div>'
            + '<div class="fr-acts" style="justify-content:center">'
            + '<button class="btn-primary" data-gip="accept" type="button">Accept &amp; play</button>'
            + '<button class="btn-secondary" data-gip="decline" type="button">Decline</button>'
            + '</div></div>';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            const bb = e.target && e.target.closest ? e.target.closest('[data-gip]') : null;
            if (!bb || bb.disabled) return;
            if (bb.dataset.gip === 'accept') acceptInvite(item, bb);
            else declineInvite(item);
        });
    }

    /** Decline an invitation: server-authoritative when one exists. */
    async function declineInvite(item) {
        try { closeInvitePopup(); } catch (_) {}
        ackInvite(item);
        const matchId = item && item.data && item.data.matchId;
        if (matchId && apiBase() !== null) {
            try { await api('invites/respond', { matchId, accept: false }); } catch (_) {}
            // The sender learns of the decline through their own poll / stream.
            return;
        }
        try { sendP2PDecline(item && item.from, item); } catch (_) {}
    }
    function checkInvitePopup() {
        try {
            if (document.getElementById('gip-overlay')) return;
            // Expire first: dead rooms never pop up, even after reconnects.
            let changed = false;
            for (const m of S.inbox) {
                if (!m.read && m.kind === 'game-invite' && inviteExpired(m)) {
                    m.read = true;
                    shownInvites.add(m.id);
                    changed = true;
                    try { ackIds([m.id]); } catch (_) {}
                }
            }
            if (changed) { save(); renderBell(); }
            // Duplicates: same room code twice shows once (oldest first).
            const seenCodes = new Set();
            const fresh = S.inbox.filter((m) => {
                if (m.read || m.kind !== 'game-invite' || !m.data || !m.data.code || shownInvites.has(m.id)) return false;
                if (inviteExpired(m)) return false;
                const c = m.data.code;
                if (seenCodes.has(c)) return false;
                seenCodes.add(c);
                return true;
            });
            // Oldest actionable first (invites queue, they don't stack).
            fresh.sort((a, b) => (a.at || 0) - (b.at || 0));
            if (fresh.length) invitePopup(fresh[0]);
        } catch (_) {}
    }
    async function watchInbox() {
        try {
            // Guests have no server inbox; signed-out has no session.
            // Poll even when hidden so a background tab has the invite
            // queued the moment it becomes visible (popup renders on top
            // of whatever page is showing — it is global by construction).
            if (apiBase() === null || uidOf() === 'guest') return;
            const hadPopup = !!document.getElementById('gip-overlay');
            await pullInbox();
            // Invitations are their own entity, polled on the same cadence so
            // the popup appears within one cycle of the sender's POST.
            try { await pullInvites(); } catch (_) {}
            // ...and invitations this account SENT, so the sender is taken
            // to the board the moment the recipient accepts.
            try { await watchSentInvite(); } catch (_) {}
            // ...and the experience ledger, so the hero XP is live.
            try { await pullXp(); } catch (_) {}
            // ...and presence itself: until the first heartbeat lands, this
            // device looks offline to its friends. Retry every tick while it
            // hasn't (Clerk sessions resolve seconds after boot).
            try { if (!heartbeatOk) await heartbeat(); } catch (_) {}
            try { await pullSnapshot(); } catch (_) {}
            // Presence repaint: the friends screen shows live dots, so a
            // player who comes online (or leaves) flips within ~30 s.
            try {
                if (gridRepaint && Date.now() - lastGridPaint > 30000
                    && document.getElementById('friends-screen')?.classList.contains('active')) {
                    await gridRepaint();
                    lastGridPaint = Date.now();
                }
            } catch (_) {}
            checkInvitePopup();
            // New actionable requests re-render the open Friends screen so
            // Accept/Decline appear instantly for both users.
            try {
                if (document.getElementById('friends-screen')?.classList.contains('active')) {
                    // open() already re-pulls; only re-render if something
                    // actually arrived to avoid clobbering typed search text.
                    // pullInbox/pullRequests saved + belled on change.
                }
            } catch (_) {}
        } catch (_) {}
    }
    let streamEs = null;
    let streamRetry = null;
    function closeStream() { try { if (streamEs) streamEs.close(); } catch (_) {} streamEs = null; }
    function scheduleStreamRetry(ms) {
        try { if (streamRetry) clearTimeout(streamRetry); } catch (_) {}
        streamRetry = setTimeout(() => { streamRetry = null; try { watchStream(); } catch (_) {} }, ms || 5000);
    }
    // Push stream on the existing server (EventSource auto-reconnects).
    // Polling stays as fallback: streams enhance, never replace.
    async function watchStream() {
        try {
            if (apiBase() === null || typeof EventSource === 'undefined') return;
            if (uidOf() === 'guest') return;
            if (streamEs) return; // one stream at a time
            let t = null;
            try { t = await api('events/ticket', {}); } catch (_) { scheduleStreamRetry(8000); return; }
            if (!t || !t.ticket) { scheduleStreamRetry(8000); return; }
            let es = null;
            try { es = new EventSource(apiBase() + '/api/events?ticket=' + encodeURIComponent(t.ticket)); } catch (_) { scheduleStreamRetry(8000); return; }
            streamEs = es;
            es.onmessage = (ev) => {
                let msg = null;
                try { msg = JSON.parse(ev.data); } catch (_) {}
                if (!msg || typeof msg.kind !== 'string') return;
                if (msg.kind === 'notify' || msg.kind === 'invite' || msg.kind === 'game-invite') {
                    // A push ping carries no payload — only "something
                    // changed for you". The authoritative reads are
                    // /api/invites (the invitation itself) and the inbox,
                    // so the popup is only ever rendered from real data.
                    pullInbox().then(() => {
                        pullInvites().then(() => {
                            if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
                            checkInvitePopup();
                        });
                    });
                } else if (msg.kind === 'friends' || msg.kind === 'friend-request'
                    || msg.kind === 'friend-accept' || msg.kind === 'friend-decline') {
                    pullSnapshot().then((ch) => {
                        if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
                        else if (ch) renderBell();
                    });
                } else if (msg.kind === 'invite-accepted' || msg.kind === 'invite-declined') {
                    pullInvites().then(() => checkInvitePopup());
                    // The SENDER learns here: an accept must take them to
                    // the board, a decline/expire must clear the wait.
                    try { watchSentInvite(); } catch (_) {}
                }
            };
            es.onerror = () => {
                if (streamEs === es) closeStream();
                // Reconnect with backoff: a dropped stream must not stay
                // dead until the next tab switch (missed invites).
                try { if (!document.hidden) scheduleStreamRetry(5000); } catch (_) {}
            };
        } catch (_) {}
    }
    setInterval(() => { try { watchInbox(); } catch (_) {} }, 5000);
    setTimeout(() => { try { watchStream(); } catch (_) {} }, 4000);
    // Immediate check on boot (a refresh must restore a live invite without
    // waiting a full poll interval) + on every foreground.
    setTimeout(() => { try { watchInbox(); } catch (_) {} }, 1500);
    // A reload while waiting must resume the wait: an accept that landed
    // while the page was dead still takes the sender to the (re-hosted)
    // board instead of stranding them on the friends panel.
    setTimeout(() => { try { watchSentInvite(); } catch (_) {} }, 2500);
    // The hero XP should be live on first paint, not one poll behind.
    setTimeout(() => { try { pullXp().then((ch) => { if (ch) { try { renderBell(); } catch (_) {} } }); } catch (_) {} }, 2500);
    // The P2P inbox is what pops invites on the static live site (no API):
    // open it shortly after boot and keep it held (cheap no-op when held).
    setTimeout(() => { try { ensureP2PInbox(); } catch (_) {} }, 6000);
    setInterval(() => { try { ensureP2PInbox(); } catch (_) {} }, 30000);
    document.addEventListener('visibilitychange', () => {
        try {
            if (!document.hidden) { closeStream(); watchStream(); watchInbox(); ensureP2PInbox(); heartbeat(); }
            else closeStream();
        } catch (_) {}
    });
    let presenceCache = { at: 0, map: {} };
    let gridRepaint = null;
    let lastGridPaint = 0;
    let tokenCache = { at: 0, token: null };
    // 'signed-in' | 'signed-out' | 'unknown' — drives search UI states.
    let authState = 'unknown';
    async function sessionToken() {
        try {
            if (Date.now() - tokenCache.at < 30000 && tokenCache.token) return tokenCache.token;
            const clerk = window.app && window.app._clerk;
            const sess = clerk && clerk.session;
            if (!sess || typeof sess.getToken !== 'function') { authState = (clerk && clerk.user) ? authState : 'signed-out'; return null; }
            const t = await sess.getToken();
            if (t) { tokenCache = { at: Date.now(), token: t }; authState = 'signed-in'; return t; }
        } catch (_) {}
        return null;
    }
    let heartbeatOk = false;
    async function heartbeat() {
        try {
            // No document.hidden skip: an open background tab is still an
            // online player. Skipping it was one half of the online/offline
            // inversion (friends showing "offline" for someone mid-game in
            // another tab).
            if (apiBase() === null || uidOf() === 'guest') return;
            await api('presence', { name: meName(), img: myAvatar() });
            heartbeatOk = true;
        } catch (_) {}
    }
    setInterval(heartbeat, 45000);
    /**
     * Explicit goodbye: sign-out or tab close deletes the presence row at
     * once instead of leaving a ghost "online now" for the rest of the TTL
     * — the other half of the inversion. Best-effort by design (a missed
     * beacon still decays within 90 s); the sign-out path awaits it while
     * the tab-close path fires a keepalive fetch it never waits for.
     */
    async function presenceLeave() {
        try {
            if (apiBase() === null || uidOf() === 'guest') return false;
            await api('presence/leave', {});
            return true;
        } catch (_) { return false; }
    }
    function presenceLeaveBeacon() {
        try {
            if (apiBase() === null || uidOf() === 'guest') return;
            // Synchronous fire with the CACHED token only: pagehide cannot
            // await a fresh token (the tab may die mid-promise and friends
            // would see a ghost "online" for minutes). The token cache is
            // 30 s fresh, so it is almost always present.
            const t = tokenCache.token;
            fetch(apiBase() + '/api/presence/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
                body: '{}',
                keepalive: true,
            }).catch(() => {});
        } catch (_) {}
    }
    document.addEventListener('pagehide', () => { try { presenceLeaveBeacon(); } catch (_) {} });

    /* ── rank + hall ────────────────────────────────────────── */
    // Rapid is the game's main rating and leads everywhere; bullet and
    // blitz are one tap away, never mixed into each other's boards.
    const RATING_CATS = ['rapid', 'blitz', 'bullet'];
    function tierOf(rating) {
        if (rating >= 2000) return { name: 'Diamond', cls: 't-dia' };
        if (rating >= 1600) return { name: 'Platinum', cls: 't-pla' };
        if (rating >= 1200) return { name: 'Gold', cls: 't-gld' };
        if (rating >= 1000) return { name: 'Silver', cls: 't-slv' };
        return { name: 'Bronze', cls: 't-brz' };
    }
    function myRating(cat) {
        try {
            if (typeof OnlineRatings !== 'undefined') return OnlineRatings.get(uidOf(), cat);
        } catch (_) {}
        return 800;
    }
    /**
     * The global ladder.
     *
     * Server-backed: ONE endpoint, GET /api/rank, which builds the board from
     * the authoritative account store (every registered account, 800 when a
     * player has no recorded game), derives ratings from recorded results,
     * orders deterministically and paginates. The server also decides which
     * fields each viewer may see, so a stranger's row has no uid/full
     * name/photo in the response at all — this code does not have to strip
     * them, because they were never sent.
     *
     * Device fallback: only when no backend is reachable, and it is labelled
     * as a device board so it is never mistaken for the global ladder.
     */
    let rankPageOffset = 0;
    async function rankBoard(cat, opts) {
        const offset = opts && Number.isFinite(opts.offset) ? Math.max(0, opts.offset | 0) : 0;
        rankPageOffset = offset;
        try {
            if (apiBase() === null) throw new Error('no-api');
            const r = await api(`rank?cat=${encodeURIComponent(cat)}&limit=100&offset=${offset}`);
            if (r && Array.isArray(r.board) && (r.total || 0) > 0) {
                const shape = (row) => ({
                    rank: row.rank,
                    uid: row.uid || null,          // strangers arrive WITHOUT a uid
                    name: row.name,
                    img: row.img || null,          // self + friends arrive WITH a photo
                    rating: row.rating,
                    tier: row.tier,
                    self: !!row.self,
                    friend: !!row.friend
                });
                const board = r.board.map(shape);
                // Every friend with their real global rank, regardless of the
                // page on screen, so "you and your friends" is never cut off
                // by whichever slice the ladder happens to be showing.
                const friendBoard = Array.isArray(r.friends) ? r.friends.map(shape) : [];
                const selfRow = board.find((b) => b.self) || friendBoard.find((b) => b.self);
                return {
                    server: true, total: r.total, offset: r.offset || 0,
                    hasMore: !!r.hasMore, myRank: r.myRank,
                    scope: r.scope || 'synced',
                    myRating: (selfRow ? selfRow.rating : r.myRating),
                    friends: friendBoard,
                    board
                };
            }
            throw new Error('empty-board');
        } catch (e) {
            // A live backend that errors must NOT silently degrade to the
            // device board: that would present a two-player local list as if
            // it were the global ladder. Say it is unavailable instead.
            const m = String((e && e.message) || '');
            if (m && !/no-api|empty-board/.test(m)) {
                return { server: true, error: 'unavailable', total: 0, offset: 0, hasMore: false, myRank: null, friends: [], board: [] };
            }
        }

        try {
            if (typeof OnlineRatings !== 'undefined' && OnlineRatings.board) {
                const rows = OnlineRatings.board(cat);
                if (!rows.some((p) => p && p.uid === uidOf())) {
                    rows.push({ uid: uidOf(), name: meName(), rating: myRating(cat), seen: Date.now() });
                    rows.sort((a, b) => {
                        const ra = (a && typeof a.rating === 'number') ? a.rating : -1;
                        const rb = (b && typeof b.rating === 'number') ? b.rating : -1;
                        return rb - ra;
                    });
                }
                const board = rows.map((p, i) => {
                    const isMe = p.uid === uidOf();
                    const isFriend = !!S.friends[p.uid];
                    if (isMe || isFriend || p.uid === 'guest') return { rank: i + 1, uid: p.uid, name: isMe ? meName() + ' (you)' : p.name, rating: p.rating, tier: tierOf(p.rating), self: isMe, friend: isFriend };
                    return { rank: i + 1, uid: null, name: firstNameOf(p.name), rating: p.rating, tier: tierOf(p.rating), self: false, friend: false };
                });
                const at = board.findIndex((b) => b.self);
                return { server: false, total: board.length, offset: 0, hasMore: false, myRank: at >= 0 ? at + 1 : null, friends: board.filter((b) => b.friend || b.self), board: board.slice(0, 50) };
            }
        } catch (_) {}
        return { server: false, total: 0, offset: 0, hasMore: false, myRank: null, friends: [], board: [] };
    }

    /**
     * The hall of fame.
     *
     * With a backend it is the FIRST 1000 registered accounts from the
     * authoritative store, with FULL names and avatars, paginated
     * (GET /api/hall, contract `naming: 'full'`). Without one it stays a
     * clearly-labelled local list.
     */
    async function hallList(opts) {
        const offset = opts && Number.isFinite(opts.offset) ? Math.max(0, opts.offset | 0) : 0;
        hallOffset = offset;
        const shape = (row) => ({
            position: row.rank, name: row.name, uid: row.uid || null,
            img: row.img || null, rating: row.rating, tier: row.tier,
            self: !!row.self, friend: !!row.friend,
        });
        try {
            if (apiBase() === null) throw new Error('no-api');
            const r = await api(`hall?cat=${encodeURIComponent(currentCat)}&limit=100&offset=${offset}`);
            if (r && Array.isArray(r.board) && r.total > 0) {
                return {
                    server: true, total: r.total, offset: r.offset || 0, hasMore: !!r.hasMore,
                    scope: r.scope || 'synced', naming: r.naming || 'private',
                    hall: r.board.map(shape),
                    friends: (Array.isArray(r.friends) ? r.friends : []).map(shape),
                };
            }
            throw new Error('empty-hall');
        } catch (e) {
            const m = String((e && e.message) || '');
            if (m && !/no-api|empty-hall/.test(m)) {
                return { server: true, error: 'unavailable', total: 0, offset: 0, hasMore: false, hall: [], friends: [] };
            }
        }
        const rows = Object.values(S.friends).sort((a, b) => (a.since || 0) - (b.since || 0))
            .map((f, i) => ({ position: i + 1, uid: f.uid, name: f.name, img: f.img || null, rating: null, self: false, friend: true }));
        return { server: false, total: rows.length, offset: 0, hasMore: false, hall: rows, friends: rows };
    }
    let hallOffset = 0;

    /* base64url (link-safe, no padding) for embedding photos in links */
    function b64urlEncode(str) {
        try {
            const b = btoa(unescape(encodeURIComponent(str)));
            return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (_) { return ''; }
    }
    function b64urlDecode(str) {
        try {
            let b = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b.length % 4) b += '=';
            return decodeURIComponent(escape(atob(b)));
        } catch (_) { return ''; }
    }

    /* ── profile links ──────────────────────────────────────── */
    function profileLink() {
        const me = uidOf();
        if (!me || me === 'guest') return null;
        const slug = encodeURIComponent(meName()).slice(0, 30);
        let link = `${siteBase()}#friend-${me}-${slug}`;
        const photo = myAvatar();
        if (photo) {
            const enc = b64urlEncode(photo);
            if (enc && enc.length <= 400) link += '-' + enc;
        }
        return link;
    }
    function inboundLink(uid, name, img) {
        if (!uid || uid === uidOf()) return;
        if (S.friends[uid]) { open('friends'); return; } // already friends
        img = cleanImg(img);
        const shown = String(name || 'Player').slice(0, 24);
        if (!S.pendingIn.some((p) => p.uid === uid)) {
            S.pendingIn.unshift({ uid, name: shown, img: img, at: Date.now() });
            save();
        } else if (img) {
            const rec = S.pendingIn.find((p) => p.uid === uid);
            if (rec && !rec.img) { rec.img = img; save(); }
        }
        notifyLocal('friend-request', `Friend request from ${shown}`, 'Accept to start growing a streak together.', uid);
        open('friends');
    }

    /* ── chess.com lookup (public data, no key) ─────────────── */
    

    /* ── daily hero (real learn activity: streak, XP, heat) ─────── */
    function localDayKey(back) {
        const d = new Date(Date.now() - (back || 0) * DAY_MS);
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${d.getDate()}`;
    }
    function dailyStats() {
        try {
            const raw = localStorage.getItem('dochess:v1');
            if (!raw) return null;
            const st = JSON.parse(raw);
            if (!st || st.version !== 1 || !st.streak || typeof st.streak.count !== 'number') return null;
            return {
                streak: st.streak.count,
                xp: typeof st.xp === 'number' ? st.xp : 0,
                level: typeof st.level === 'number' ? st.level : 1,
                heat: (st.heatmap && typeof st.heatmap === 'object') ? st.heatmap : {},
            };
        } catch (_) { return null; }
    }
    function heroHTML() {
        const d = dailyStats();
        const learnXp = d ? d.xp : 0;
        // Experience is one number from four honest sources: Learn lessons
        // (this device, synced) + server-ledgered games, puzzles and streaks
        // (fixed amounts, same on every device). Level uses Learn's own rule.
        const sxp = (typeof serverXp === 'object' && serverXp) || { total: 0, games: 0, puzzles: 0, streaks: 0 };
        const xp = learnXp + (sxp.total || 0);
        const lvl = 1 + Math.floor(xp / 150);
        const pct = Math.min(100, Math.round(((xp % 150) / 150) * 100));
        const st = Math.max(d ? d.streak : 0, loginDayStreak());
        const week = [];
        for (let back = 6; back >= 0; back--) week.push(d && d.heat[localDayKey(back)] ? 1 : 0);
        // Rapid is the game's main rating and leads the hero; bullet and
        // blitz live one tap away on the ranking tabs, never mixed in.
        const me = myRating('rapid');
        const parts = [`Lessons ${learnXp}`, `Games ${sxp.games || 0}`, `Puzzles ${sxp.puzzles || 0}`, `Streaks ${sxp.streaks || 0}`];
        return '<section class="fr-hero">'
            + '<div class="fr-hero-flame"><span class="fr-flame big">' + FLAME + '</span>'
            + '<div><strong>' + st + '</strong><span>day streak</span></div>'
            + '<span class="fr-week">' + week.map((x) => '<i class="' + (x ? 'on' : '') + '"></i>').join('') + '</span></div>'
            + '<div class="fr-hero-xp"><div class="fr-xp-top"><strong>LVL ' + lvl + '</strong><span>' + xp + ' XP</span></div>'
            + '<div class="fr-xpbar"><i style="width:' + pct + '%"></i></div>'
            + '<span class="fr-sub">' + (150 - (xp % 150)) + ' XP to level ' + (lvl + 1) + ' · ' + esc(parts.join(' · ')) + '</span></div>'
            + '<div class="fr-hero-rate"><strong>' + me + '</strong>' + tierChip(me) + '<span class="fr-sub">rapid · you</span></div>'
            + '</section>';
    }
    /**
     * Login/activity day streak over EVERYTHING this device knows: Learn
     * heatmap, achievements play-days (games push a day on every finish),
     * and the local game history. The hero used to read Learn's streak
     * only, so game-only players stared at a permanent 0.
     */
    function loginDayStreak() {
        try {
            const set = new Set();
            const uid = uidOf();
            try {
                const raw = localStorage.getItem('dochess:v1');
                const st = raw ? JSON.parse(raw) : null;
                if (st && st.heatmap && typeof st.heatmap === 'object') {
                    for (const k of Object.keys(st.heatmap)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) set.add(k);
                }
            } catch (_) {}
            try {
                const raw = localStorage.getItem('cca_v1_' + uid);
                const a = raw ? JSON.parse(raw) : null;
                if (a && Array.isArray(a.days)) for (const k of a.days) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) set.add(k);
            } catch (_) {}
            try {
                const raw = localStorage.getItem('ccgh_' + uid);
                const h = raw ? JSON.parse(raw) : null;
                if (Array.isArray(h)) for (const g of h) {
                    if (g && Number.isFinite(g.date)) {
                        const t = new Date(g.date);
                        const p = (n) => String(n).padStart(2, '0');
                        set.add(`${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`);
                    }
                }
            } catch (_) {}
            const has = (back) => set.has(localDayKey(back));
            const cursor = has(0) ? 0 : (has(1) ? 1 : -1);
            if (cursor < 0) return 0;
            let n = 0;
            for (let back = cursor; ; back++) { if (has(back)) n++; else break; }
            return n;
        } catch (_) { return 0; }
    }
    // Server-ledgered experience (games/puzzles/streaks at fixed amounts).
    let serverXp = { total: 0, games: 0, puzzles: 0, streaks: 0 };
    async function pullXp() {
        try {
            if (apiBase() === null || uidOf() === 'guest') return false;
            const r = await api('xp');
            if (r && r.xp && typeof r.xp === 'object') {
                serverXp = {
                    total: Math.max(0, r.xp.total | 0), games: Math.max(0, r.xp.games | 0),
                    puzzles: Math.max(0, r.xp.puzzles | 0), streaks: Math.max(0, r.xp.streaks | 0),
                };
                return true;
            }
        } catch (_) {}
        return false;
    }
    /**
     * Report a solved puzzle for +10 XP (first solve per puzzle, ever). The
     * client names the EVENT, never a number — the amount is fixed
     * server-side, so there is nothing to forge.
     */
    async function reportPuzzleSolve(puzzleId) {
        try {
            if (apiBase() === null || uidOf() === 'guest' || !puzzleId) return null;
            const r = await api('puzzles/solve', { puzzleId: String(puzzleId).slice(0, 64) });
            if (r && r.ok && r.awarded) {
                await pullXp();
                try { if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab); } catch (_) {}
            }
            return r;
        } catch (_) { return null; }
    }

    /* ── versus (head-to-head from real history) ────────────── */
    function historyAll() {
        try {
            if (typeof OnlineRatings !== 'undefined' && OnlineRatings.history) return OnlineRatings.history(uidOf()) || [];
        } catch (_) {}
        return [];
    }
    function versus(uid) {
        const f = S.friends[uid];
        const name = f ? f.name : null;
        let w = 0, l = 0, d = 0;
        for (const h of historyAll()) {
            if (h.oppUid ? h.oppUid !== uid : (name ? h.opp !== name : true)) continue;
            if (h.result === 'win') w++;
            else if (h.result === 'loss') l++;
            else if (h.result === 'draw') d++;
        }
        return { w, l, d, games: w + l + d };
    }
    function rivalOfWeek() {
        const since = Date.now() - 7 * DAY_MS;
        const counts = {};
        for (const h of historyAll()) {
            if (!h.date || h.date < since) continue;
            const key = h.oppUid || ('name:' + (h.opp || '?'));
            counts[key] = (counts[key] || 0) + 1;
        }
        let best = null, bestN = 0;
        for (const [key, n] of Object.entries(counts)) {
            if (n > bestN) { bestN = n; best = key; }
        }
        if (!best || bestN < 2) return null;
        const uid = best.startsWith('name:') ? null : best;
        const name = uid ? ((S.friends[uid] && S.friends[uid].name) || null) : best.slice(5);
        return { uid, name: name || 'Player', games: bestN };
    }

    /* ── lifecycle hooks (called by app.js) ─────────────────── */
    function onGameEnd({ oppUid, oppName, result, cat, myRating }) {
        if (oppUid && oppUid !== uidOf()) stampGame(oppUid);
        // No rating is published from here. The ladder rating is DERIVED
        // server-side from the recorded game result (POST /api/games), so a
        // client cannot hand itself a rating — the old /api/rank/publish took
        // the number straight from the browser.
        warnStreaks();
        if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
    }

    /* ── UI ─────────────────────────────────────────────────── */
    let currentTab = 'friends';
    let currentCat = 'rapid';
    let currentSearchQ = '';
    const FLAME = `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="flm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5C978"/><stop offset="1" stop-color="#D4722E"/></linearGradient></defs><path fill="url(#flm)" d="M12.9 1.5c.3 3.2-1.2 5.3-3.2 7C7.9 10 6.5 11.6 6.5 14a5.5 5.5 0 0011 0c0-1.2-.3-2.3-.9-3.3-.4 1-1 1.7-2 2.2.4-2.9-.5-6.4-1.7-8.6-.4 1-1 1.9-1.9 2.6.3-1.9.1-3.6-.1-5.4z"/><path fill="#FBE3B0" d="M12 21.5a3.2 3.2 0 01-3.2-3.2c0-1.5 1-2.4 1.9-3.3.7-.7 1.4-1.4 1.6-2.4 1 1.2 2.9 2.7 2.9 4.7a3.2 3.2 0 01-3.2 4.2z"/></svg>`;
    const SARCASTIC = [
        'Offline. Probably touching grass.',
        'Away. The pieces miss them already.',
        'Sleeping. Even knights need naps.',
        'Gone. Left the king hanging.',
        'AFK. Blaming lag, most likely.',
        'Out. Studying openings, allegedly.',
    ];
    const avatarHTML = (name, extra, img) => {
        const src = cleanImg(img);
        if (src) return '<img class="fr-avaimg" src="' + esc(src) + '" alt="" width="46" height="46" loading="lazy" draggable="false">';
        return '<span class="fr-ava' + (extra ? ' ' + extra : '') + '" aria-hidden="true">' + esc((name || 'P')[0].toUpperCase()) + '</span>';
    };

    function streakCard(f) {
        const st = streakOf(f);
        const week = [];
        for (let back = 6; back >= 0; back--) week.push(f.days && f.days[keyDaysAgo(back)] ? 1 : 0);
        return `<div class="fr-streak${st > 0 ? ' on' : ''}">
            <span class="fr-flame">${FLAME}</span>
            <span class="fr-streak-n">${st}</span>
            <span class="fr-streak-t">day streak</span>
            <span class="fr-week">${week.map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('')}</span>
        </div>`;
    }

    function friendRow(f, presence) {
        const st = streakOf(f);
        const v = versus(f.uid);
        const online = presence && presence[f.uid] && presence[f.uid].online;
        // No presence service on the static site (no API): reachability is
        // unknown, so the Invite button always shows — the direct P2P dial
        // probes reachability at send time and says honestly when they look
        // offline. With an API, presence gates the button as before.
        const canInvite = online || apiBase() === null;
        // "Last seen" prefers the server's heartbeat timestamp (the other
        // device's truth) over this device's local sightings, so offline
        // durations read 1 min / 30 min / 1 hour / 1 day / 1 week correctly
        // instead of freezing on a stale local guess.
        const srvSeen = presence && presence[f.uid] && presence[f.uid].lastSeen;
        const seenAt = srvSeen || f.lastSeen;
        const seenTxt = online ? 'online now' : (seenAt ? 'last seen ' + ago(seenAt) : (st > 0 ? 'streak alive' : 'all quiet'));
        const dotCls = online ? 'on' : (st > 0 ? 'warm' : '');
        const joke = SARCASTIC[f.uid.length % SARCASTIC.length];
        const gamesTxt = v.games ? `${v.w}W · ${v.l}L · ${v.d}D` : 'no games yet';
        return `<article class="fr-card${online ? '' : ' off'}${f.confirmed ? '' : ' pend'}">
            <div class="fr-top">
                ${avatarHTML(f.name, null, f.img)}
                <div class="fr-id">
                    <strong>${esc(f.name)}${f.confirmed ? '' : ' <span class="fr-unconf" title="Not yet mutual">· new</span>'}</strong>
                    <span class="fr-sub"><i class="fr-dot ${dotCls}"></i>${esc(seenTxt)} · ${esc(gamesTxt)}</span>
                </div>
                ${st > 0 ? `<span class="fr-flame-sm" title="${st}-day streak">${FLAME}<b>${st}</b></span>` : ''}
            </div>
            ${streakCard(f)}
            ${v.games ? `<div class="fr-vs"><span>vs you</span><div class="fr-bars"><i style="width:${Math.round((v.w / v.games) * 100)}%" class="w"></i><i style="width:${Math.round((v.d / v.games) * 100)}%" class="d"></i><i style="width:${Math.round((v.l / v.games) * 100)}%" class="l"></i></div><span>${esc(gamesTxt)}</span></div>` : ''}
            ${online ? '' : `<p class="fr-joke">${esc(joke)}</p>`}
            <div class="fr-acts">
                ${canInvite ? `<button class="btn-primary sm" data-faction="play" data-uid="${esc(f.uid)}" type="button">Invite to play</button>` : `<button class="btn-secondary sm" data-faction="nudge" data-uid="${esc(f.uid)}" type="button">Wake up</button>`}
                <button class="btn-secondary sm" data-faction="remove" data-uid="${esc(f.uid)}" type="button">Remove</button>
            </div>
        </article>`;
    }

    function renderFriends(box) {
        const rows = Object.values(S.friends).filter((f) => !f.outbound).sort((a, b) => streakOf(b) - streakOf(a) || (b.lastSeen || 0) - (a.lastSeen || 0));
        const sent = Object.values(S.friends).filter((f) => f.outbound && !f.confirmed).sort((a, b) => (b.since || 0) - (a.since || 0));
        const rival = rivalOfWeek();
        const reqs = S.pendingIn;
        box.innerHTML = `
            ${heroHTML()}
            <div class="fr-head">
                <div>
                    <p class="fr-kicker">Friends</p>
                    <h2>Your circle</h2>
                </div>
                <button class="btn-primary sm" data-faction="copy-link" type="button">Copy invite link</button>
            </div>
            <div class="fr-searchrow">
                <input id="fr-search" class="join-input" placeholder="Search by name (3+ letters)…" autocomplete="off" spellcheck="false" maxlength="24">
            </div>
            <div id="fr-results"></div>
            ${rival ? `<div class="fr-rival"><span class="fr-crown" aria-hidden="true">♛</span><div><strong>Rival of the week</strong><p>${esc(rival.name)} · ${rival.games} games together</p></div></div>` : ''}
            ${reqs.length ? `<div class="fr-reqs"><h3>Requests</h3>${reqs.map((p) => `
                <div class="fr-req">${avatarHTML(p.name, null, p.img)}<div class="fr-id"><strong>${esc(p.name)}</strong><span class="fr-sub">wants to be friends</span></div>
                <span class="fr-reqacts"><button class="btn-primary sm" data-faction="accept" data-uid="${esc(p.uid)}" type="button">Accept</button><button class="btn-secondary sm" data-faction="decline" data-uid="${esc(p.uid)}" type="button">Decline</button></span></div>`).join('')}</div>` : ''}
            ${sent.length ? `<div class="fr-reqs"><h3>Sent requests</h3>${sent.map((p) => `
                <div class="fr-req sent${p.unsent ? ' unsent' : ''}">${avatarHTML(p.name, null, p.img)}<div class="fr-id"><strong>${esc(p.name)}</strong><span class="fr-sub">${p.unsent ? 'not delivered — nothing was sent' : 'waiting for answer'}</span></div>
                <span class="fr-reqacts">${p.unsent ? `<button class="btn-primary sm" data-faction="retry-req" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}"${p.img ? ` data-img="${esc(p.img)}"` : ''} type="button">Retry</button>` : ''}<button class="btn-secondary sm" data-faction="remove" data-uid="${esc(p.uid)}" type="button">Cancel request</button></span></div>`).join('')}</div>` : ''}
            <div class="fr-grid" id="fr-grid"></div>
`;
        const grid = box.querySelector('#fr-grid');
        const paint = async () => {
            let pres = {};
            try {
                if (apiBase() !== null) {
                    const r = await api(`friends/status?uids=${encodeURIComponent(rows.map((f) => f.uid).join(','))}`);
                    pres = (r && r.status) || {};
                }
            } catch (_) {}
            grid.innerHTML = rows.length ? rows.map((f) => friendRow(f, pres)).join('') : `<div class="fr-onboard"><h3>Grow your first flame</h3><ol><li><strong>Copy your invite link</strong> — anyone, anywhere.</li><li><strong>Play one game together</strong> — any day, any control.</li><li><strong>+1 every day</strong> you both play. Miss a day and it resets.</li></ol><div class="fr-acts"><button class="btn-primary sm" data-faction="copy-link" type="button">Copy invite link</button><button class="btn-secondary sm" data-faction="goto-search" type="button">Search DoChess players</button></div></div>`;
        };
        paint();
        // Keep presence truthful while the screen sits open: re-paint the
        // grid (status dots + last-seen) at most every 30 s without touching
        // the search box, which lives outside the grid.
        gridRepaint = paint; lastGridPaint = Date.now();
        const input = box.querySelector('#fr-search');
        const out = box.querySelector('#fr-results');
        // The screen re-renders whenever the authoritative snapshot changes
        // (a poll finishing, a friend event arriving). Re-rendering used to
        // discard a half-typed search and leave the results pane empty, so
        // the query is kept in module state and re-applied on every render.
        if (currentSearchQ) input.value = currentSearchQ;
        const renderFound = (found, extra) => {
            const all = found.concat(extra || []);
            out.innerHTML = all.length ? '<div class="fr-grid">' + all.map((p) => {
                const tag = p.pending ? 'requested' : (p.friend ? (p.outbound ? 'requested' : 'friend') : (p.fromServer ? 'DoChess' : 'met over the board'));
                const hideAdd = p.friend || p.uid === uidOf() || p.outbound;
                return '<div class="fr-card mini">' + avatarHTML(p.name, null, p.img) + '<div class="fr-id"><strong>' + esc(p.name) + '</strong>'
                    + '<span class="fr-sub">' + tag + (p.rating ? ' · ' + p.rating : '') + '</span></div>'
                    + (hideAdd ? '' : '<button class="btn-secondary sm" data-faction="add" data-uid="' + esc(p.uid) + '" data-name="' + esc(p.name) + '"' + (p.img ? ' data-img="' + esc(p.img) + '"' : '') + ' type="button">Add</button>') + '</div>';
            }).join('') + '</div>'
                : (authState === 'signed-out'
                    ? '<div class="fr-empty">Sign in to search <strong>all</strong> DoChess players.<br><br><button class="btn-primary sm" data-action="profile-signin" type="button">Sign in / Join</button></div>'
                    : '<p class="fr-empty">Nobody by that name — yet. Share your invite link instead.</p>');
        };
        const serverMerge = async (q) => {
            try {
                if (apiBase() === null || q.trim().length < 3) return;
                const r = await api('directory?q=' + encodeURIComponent(q.trim()));
                if (!r || !Array.isArray(r.players) || !r.players.length) return;
                // Stale-response guard: the user may have typed on, or the
                // screen may have re-rendered, since this request went out.
                if (!document.body.contains(out) || input.value !== q) return;
                const have = new Set(search(q).rows.map((x) => x.uid));
                const extra = r.players.filter((p) => p && p.uid && !have.has(p.uid)).map((p) => ({ uid: p.uid, name: p.name, friend: !!(p.friend || S.friends[p.uid]), rating: null, img: p.img || null, fromServer: true }));
                if (extra.length) renderFound(search(q).rows, extra);
            } catch (_) {}
        };
        const runSearch = (q) => {
            currentSearchQ = q;
            if (q.trim().length < 3) { out.innerHTML = q.trim() ? '<p class="lobby-hint">Keep typing — search starts at 3 letters.</p>' : ''; return; }
            const found = search(q).rows;
            renderFound(found, []);
            serverMerge(q);
        };
        input.addEventListener('input', () => { runSearch(input.value); });
        // Re-apply the preserved query (local results immediately, server
        // merge follows) so a background re-render never loses the search.
        if (currentSearchQ && currentSearchQ.trim().length >= 3) {
            renderFound(search(currentSearchQ).rows, []);
            serverMerge(currentSearchQ);
        }
    }

    // Global ladder privacy: friends show full names + photos, everyone
    // else shows rank + FIRST name + rating (ghost avatar, no uid/photo).
    function firstNameOf(name) {
        const t = String(name || '').replace(/[\x00-\x1F\x7F]/g, '').trim().split(/\s+/)[0] || '';
        return t.slice(0, 24) || 'Player';
    }
    function podiumHTML(data) {
        const top = (data.board || []).slice(0, 3);
        if (top.length < 3) return '';
        const order = [[top[1], '2nd', 'p2'], [top[0], '1st', 'p1'], [top[2], '3rd', 'p3']];
        return '<div class="fr-podium">' + order.map(([r, place, cls]) => {
            const nm = r.name || 'a quiet rival';
            const img = r.self ? myAvatar() : ((r.uid && (S.friends[r.uid] || {}).img) || null);
            return '<div class="fr-pstep ' + cls + '"><span class="fr-pplace">' + place + '</span>'
                + avatarHTML(nm, null, img)
                + '<strong>' + esc(nm) + '</strong>' + tierChip(r.rating) + '<span>' + (r.rating != null ? r.rating : '') + '</span></div>';
        }).join('') + '</div>';
    }

    function tierChip(rating) {
        const t = tierOf(rating);
        return `<span class="fr-tier ${t.cls}">${t.name}</span>`;
    }

    /**
     * One ladder row. Strangers are blurred: their name is only ever a first
     * name (chosen server-side), so the blur is presentation, not concealment,
     * and the readable text stays in the accessibility tree so a screen reader
     * is never handed an unreadable string.
     */
    function boardRow(r) {
        const blur = !r.self && !r.friend;
        // Photos come from the server row first (self + friends), then the
        // local shelf — a friend's face must show even before this device
        // has met them peer-to-peer.
        const img = r.img || (r.self ? myAvatar() : ((r.uid && (S.friends[r.uid] || {}).img) || null));
        return `<div class="fr-brow${r.self ? ' me' : ''}${blur ? ' blurry' : ''}">`
            + `<span class="fr-rank">${r.rank}</span>`
            + (r.name ? avatarHTML(r.name, null, img) : '<span class="fr-ava ghost" aria-hidden="true">?</span>')
            + `<span class="fr-bname"${blur ? ' title="A stranger on DoChess"' : ''}>${r.name ? esc(r.name) : 'a quiet rival'}</span>`
            + (r.rating != null ? tierChip(r.rating) : '')
            + `<span class="fr-brating">${r.rating != null ? r.rating : '–'}</span></div>`;
    }

    let rankTimer = null;
    let rankLoading = false;
    let rankResumeHandler = null;
    function stopRankAutoRefresh() {
        try { if (rankTimer) { clearInterval(rankTimer); rankTimer = null; } } catch (_) {}
    }
    /**
     * Keep the ladder AND the hall fresh on their own: someone registers, or
     * finishes a game, at any moment — so the total player count is always
     * live. Polls every 30 s while the tab is visible, and immediately when
     * the user comes back to it.
     */
    function startRankAutoRefresh(box, render) {
        render = render || renderRanking;
        stopRankAutoRefresh();
        rankTimer = setInterval(() => {
            try {
                if (rankLoading || document.hidden) return;
                if (!document.body.contains(box)) { stopRankAutoRefresh(); return; }
                if (!document.getElementById('friends-screen')?.classList.contains('active')) return;
                render(box);
            } catch (_) {}
        }, 30000);
        try {
            if (rankResumeHandler) document.removeEventListener('visibilitychange', rankResumeHandler);
            rankResumeHandler = () => {
                try {
                    if (document.hidden) return;
                    if (document.getElementById('friends-screen')?.classList.contains('active')) render(box);
                } catch (_) {}
            };
            document.addEventListener('visibilitychange', rankResumeHandler);
        } catch (_) {}
    }

    async function renderRanking(box) {
        const offset = rankPageOffset || 0;
        rankLoading = true;
        box.innerHTML = `<div class="fr-head"><div><p class="fr-kicker">Ranking</p><h2>Where you stand</h2></div>
            <div class="fr-cats" role="group" aria-label="Rating category">${RATING_CATS.map((c) => `<button class="btn-secondary sm${c === currentCat ? ' on' : ''}" data-faction="cat" data-cat="${c}" type="button">${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div></div>
            <div id="fr-rankout"><p class="lobby-hint" role="status">Loading the board…</p></div>`;
        const out = box.querySelector('#fr-rankout');
        const data = await rankBoard(currentCat, { offset });
        rankLoading = false;
        if (data.error === 'unavailable') {
            stopRankAutoRefresh();
            out.innerHTML = `<p class="fr-empty" role="status">The ranking service is unreachable right now. Nothing is shown rather than a local list pretending to be the global ladder.</p>
                <div class="fr-pager"><button class="btn-secondary sm" data-faction="rank-refresh" type="button">Try again</button></div>`;
            return;
        }
        // Accurate Elo: prefer the server's own row for self (other-device
        // games move it); the device rating is the fallback, never a guess.
        const selfRow = (data.board || []).find((b) => b.self);
        const me = (selfRow && typeof selfRow.rating === 'number') ? selfRow.rating
            : (typeof data.myRating === 'number' ? data.myRating : myRating(currentCat));
        // Count the noun phrase as a whole so pluralisation is never wrong.
        const noun = data.server
            ? `registered player${data.total === 1 ? '' : 's'}`
            : `player${data.total === 1 ? '' : 's'} on this device`;
        const first = offset === 0;
        const friendRows = (data.friends || []).filter((f) => !f.self).sort((a, b) => a.rank - b.rank);
        // ONE ladder in true rank order. Friends who fall outside the current
        // page are listed separately, so nothing is duplicated and the board
        // never looks out of order.
        const onPage = new Set((data.board || []).map((r) => `${r.uid || r.name}:${r.rank}`));
        const offPageFriends = friendRows.filter((f) => !onPage.has(`${f.uid || f.name}:${f.rank}`));
        out.innerHTML = `
            ${first ? `
            <div class="fr-myrank">
                <span class="fr-bigrank">#${data.myRank != null ? data.myRank : '–'}</span>
                <div><strong>${esc(meName())}</strong><p>${data.total} ${noun} · ${currentCat} · you hold <strong>${me}</strong></p></div>
                ${tierChip(me)}
            </div>
            ${podiumHTML(data)}` : `<p class="lobby-hint">Showing ranks ${offset + 1}–${offset + (data.board || []).length} of ${data.total}</p>`}
            <div class="fr-livebar">
                <span class="fr-live" role="status">${data.server ? (data.scope === 'all' ? 'Live — refreshes every 30s, so a player who just registered shows up' : 'Live — refreshes every 30s · synced accounts only right now (full registry unreachable)') : 'Local list only — sign in on DoChess to see every registered player'}</span>
                <button class="btn-secondary sm" data-faction="rank-refresh" type="button">Refresh now</button>
            </div>
            ${data.server
                ? `<p class="lobby-hint">Global ladder — every registered DoChess account. Strangers show a first name only; friends show their full name.</p>`
                : `<p class="lobby-hint"><strong>Device board.</strong> This browser is not connected to the ranking service, so only players this device has met are listed.</p>`}
            ${offPageFriends.length ? `<h3 class="fr-subhead">Your friends, further down the ladder</h3><div class="fr-board">${offPageFriends.map(boardRow).join('')}</div>` : ''}
            <div class="fr-board">${(data.board || []).map(boardRow).join('')
                || `<p class="fr-empty">${data.server ? 'No other players on the board yet.' : 'No players on this device board yet — finish an online game to appear.'}</p>`}</div>
            ${data.server && data.total > (data.board || []).length ? `
            <div class="fr-pager">
                ${data.offset > 0 ? `<button class="btn-secondary sm" data-faction="rank-page" data-offset="${Math.max(0, data.offset - 100)}" type="button">Previous</button>` : ''}
                <span class="fr-sub">${data.offset + 1}–${data.offset + (data.board || []).length} of ${data.total}</span>
                ${data.hasMore ? `<button class="btn-secondary sm" data-faction="rank-page" data-offset="${data.offset + 100}" type="button">Next</button>` : ''}
            </div>` : ''}`;
        startRankAutoRefresh(box);
    }

async function renderHall(box) {
        const offset = hallOffset || 0;
        box.innerHTML = `<div class="fr-head"><div><p class="fr-kicker">Hall of fame</p><h2>Every player on DoChess</h2></div></div><div id="fr-hallout"><p class="lobby-hint" role="status">Loading the hall…</p></div>`;
        const out = box.querySelector('#fr-hallout');
        const data = await hallList({ offset });
        if (data.error === 'unavailable') {
            out.innerHTML = `<p class="fr-empty" role="status">The hall of fame is unreachable right now. Nothing is shown rather than a local list pretending to be global.</p>
                <div class="fr-pager"><button class="btn-secondary sm" data-faction="hall-refresh" type="button">Try again</button></div>`;
            return;
        }
        const friendUids = new Set((data.friends || []).map((f) => f.uid).filter(Boolean));
        // The hall of fame shows FULL names for everyone, by explicit owner
        // decision (server contract `naming: 'full'`) — no blurry strangers
        // here. That is what makes it a hall of fame.
        const hallRow = (h) => {
            const img = h.img || (h.uid && (S.friends[h.uid] || {}).img) || null;
            return `<div class="fr-hof${h.self ? ' me' : ''}">`
                + avatarHTML(h.name, null, img)
                + `<div class="fr-id"><strong>#${h.position} ${esc(h.name)}</strong>`
                + `<span class="fr-sub">${h.rating != null ? h.rating : '–'}${h.rating != null ? ' · ' + tierOf(h.rating).name : ''}</span></div></div>`;
        };
        out.innerHTML = `
            ${data.server
                ? (data.scope === 'all'
                    ? `<p class="lobby-hint">The first 1000 registered DoChess accounts — <strong>${data.total}</strong> in total. Full names, out in the open: that is what makes it a hall of fame.</p>`
                    : `<p class="lobby-hint">Synced accounts so far — <strong>${data.total}</strong> in total (full registry unreachable right now).</p>`)
                : `<p class="lobby-hint"><strong>This hall is local to this device.</strong> Connect to DoChess to see every registered player.</p>`}
            ${friendUids.size ? `<h3 class="fr-subhead">Your friends</h3><div class="fr-hall">${(data.friends || []).map(hallRow).join('')}</div>` : ''}
            <h3 class="fr-subhead">${friendUids.size ? 'Everyone else' : 'The hall'}</h3>
            <div class="fr-hall">${(data.hall || []).filter((h) => !friendUids.has(h.uid)).map(hallRow).join('')
                || `<p class="fr-empty">${data.server ? 'Nobody else is registered yet.' : 'Be early — your friends appear here.'}</p>`}</div>
            ${data.server && data.total > (data.hall || []).length ? `
            <div class="fr-pager">
                ${data.offset > 0 ? `<button class="btn-secondary sm" data-faction="hall-page" data-offset="${Math.max(0, data.offset - 100)}" type="button">Previous</button>` : ''}
                <span class="fr-sub">${data.offset + 1}–${data.offset + (data.hall || []).length} of ${data.total}</span>
                ${data.hasMore ? `<button class="btn-secondary sm" data-faction="hall-page" data-offset="${data.offset + 100}" type="button">Next</button>` : ''}
            </div>` : ''}`;
        startRankAutoRefresh(box, renderHall);
    }

    function renderActivity(box) {
        const items = S.inbox.slice(0, 30);
        box.innerHTML = `<div class="fr-head"><div><p class="fr-kicker">Activity</p><h2>Notifications</h2></div>
            ${items.some((m) => !m.read) ? `<button class="btn-secondary sm" data-faction="ack" type="button">Mark all read</button>` : ''}</div>
            <div class="fr-feed">${items.length ? items.map((m) => {
                // Actionable items keep their buttons HERE too — the feed
                // is not a dead notification list. Friend requests get
                // Accept/Decline (same handlers as the Requests section);
                // live game invites get Accept & play / Decline.
                let acts = '';
                if (m.kind === 'friend-request' && m.from && !S.friends[m.from]) {
                    acts = `<div class="fr-acts"><button class="btn-primary sm" data-faction="accept" data-uid="${esc(m.from)}" type="button">Accept</button>`
                        + `<button class="btn-secondary sm" data-faction="decline" data-uid="${esc(m.from)}" type="button">Decline</button></div>`;
                } else if (m.kind === 'game-invite' && m.data && m.data.code && !m.read && !inviteExpired(m)) {
                    acts = `<div class="fr-acts"><button class="btn-primary sm" data-gip-feed="accept" data-id="${esc(m.id)}" type="button">Accept &amp; play</button>`
                        + `<button class="btn-secondary sm" data-gip-feed="decline" data-id="${esc(m.id)}" type="button">Decline</button></div>`;
                } else if (m.kind === 'game-invite' && inviteExpired(m)) {
                    acts = `<div class="fr-acts"><span class="fr-sub">Expired — ask for a fresh invite.</span></div>`;
                }
                return `
                <div class="fr-note${m.read ? '' : ' new'}"><span class="fr-kind ${esc(m.kind)}">${esc(m.kind)}</span>
                <div><strong>${esc(m.title)}</strong><p>${esc(m.body)}</p><span class="fr-sub">${ago(m.at)}</span>${acts}</div></div>`;
            }).join('')
                : `<p class="fr-empty">All quiet. Streak warnings, friend news, and game invites land here.</p>`}</div>`;
        // Reading the feed marks it read (local + server so all devices
        // converge). Actionable items stay actionable until acted on:
        // marking read does NOT consume the pending request or invite —
        // Accept/Decline does. But the popup only fires on unread invites,
        // so viewing the feed intentionally settles the popup queue.
        const viewed = S.inbox.filter((m) => !m.read).map((m) => m.id);
        let changed = false;
        for (const m of S.inbox) if (!m.read) { m.read = true; changed = true; }
        if (changed) { save(); renderBell(); try { ackIds(viewed); } catch (_) {} }
    }

    function tabsHTML() {
        const t = (id, label) => `<button class="btn-secondary sm${currentTab === id ? ' on' : ''}" data-faction="tab" data-tab="${id}" type="button">${label}</button>`;
        return `<div class="fr-tabs" role="tablist">${t('friends', 'Friends')}${t('ranking', 'Ranking')}${t('hall', 'Hall of fame')}${t('activity', `Activity${unread() ? ` (${unread()})` : ''}`)}</div>`;
    }

    function open(tab) {
        currentTab = tab || currentTab || 'friends';
        const box = document.getElementById('friends-content');
        if (!box) return;
        box.innerHTML = `${tabsHTML()}<div id="fr-body"></div>`;
        const body = box.querySelector('#fr-body');
        warnStreaks();
        if (currentTab === 'friends') renderFriends(body);
        else if (currentTab === 'ranking') renderRanking(body);
        else if (currentTab === 'hall') { stopRankAutoRefresh(); renderHall(body); }
        else { stopRankAutoRefresh(); renderActivity(body); }
        // ONE authoritative reconcile on open (friends + requests + resolved),
        // plus the inbox and pending invitations.
        pullSnapshot().then((ch) => {
            if (ch && document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
        });
        pullInbox().then((ch) => {
            if (ch && document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
        });
        pullInvites().catch(() => {});
        try { if (apiBase() !== null) heartbeat(); } catch (_) {}
    }

    /* ── actions (delegated) ────────────────────────────────── */
    async function copyText(txt, btn) {
        const prev = btn ? btn.textContent : '';
        const done = () => {
            if (!btn) return;
            try { btn.textContent = 'Copied!'; } catch (_) {}
            setTimeout(() => { try { btn.textContent = prev; } catch (_) {} }, 1500);
        };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); done(); return; }
        } catch (_) {}
        done();
    }

    async function onFaction(e) {
        // Activity-feed game invites (Accept & play / Decline) live inside
        // the Friends screen but carry an inbox id, not a uid. Handle them
        // here so the feed is actionable, not notification-only.
        try {
            const gip = e.target && e.target.closest ? e.target.closest('[data-gip-feed]') : null;
            if (gip && document.getElementById('friends-screen')?.classList.contains('active')) {
                const item = S.inbox.find((m) => m.id === gip.dataset.id);
                if (gip.dataset.gipFeed === 'accept' && item) acceptInvite(item, gip);
                else if (item) declineInvite(item);
                else { try { ackIds([gip.dataset.id]); } catch (_) {} }
                setTimeout(() => { try { open(currentTab); } catch (_) {} }, 100);
                return;
            }
        } catch (_) {}
        const el = e.target && e.target.closest ? e.target.closest('[data-faction]') : null;
        if (!el || !document.getElementById('friends-screen')?.classList.contains('active')) return;
        const a = el.dataset.faction;
        const uid = el.dataset.uid;
        if (a === 'tab') { open(el.dataset.tab); return; }
        if (a === 'cat') { currentCat = el.dataset.cat || 'rapid'; rankPageOffset = 0; open('ranking'); return; }
        if (a === 'rank-page') { rankPageOffset = Math.max(0, parseInt(el.dataset.offset, 10) || 0); open('ranking'); return; }
        if (a === 'rank-refresh') { open('ranking'); return; }
        if (a === 'hall-page') { hallOffset = Math.max(0, parseInt(el.dataset.offset, 10) || 0); open('hall'); return; }
        if (a === 'hall-refresh') { open('hall'); return; }
        if (a === 'copy-link') {
            const link = profileLink();
            if (!link) { notifyLocal('note', 'Sign in first', 'Guest accounts have no friend link — sign in and try again.'); open(currentTab); return; }
            copyText(link, el);
            return;
        }
        if (a === 'add') {
            if (S.pendingIn.some((p) => p.uid === uid)) await acceptFriend(uid);
            else {
                // Do not fire a doomed request at the server when there is no
                // identity: name the missing step instead of surfacing a
                // generic refusal a few seconds later.
                if (apiBase() !== null && isSignedOut()) {
                    notifyLocal('note', FAILURES.signedOut.title, FAILURES.signedOut.body);
                    open(currentTab);
                    return;
                }
                await requestFriend(uid, el.dataset.name, 'search', el.dataset.img || null);
            }
            open(currentTab); return;
        }
        if (a === 'retry-req') {
            const rec = getF(uid);
            await requestFriend(uid, el.dataset.name || (rec && rec.name) || 'Player', 'search', el.dataset.img || (rec && rec.img) || null);
            open(currentTab); return;
        }
        if (a === 'accept') { await acceptFriend(uid); open(currentTab); return; }
        if (a === 'decline') { await declineFriend(uid); open(currentTab); return; }
        if (a === 'remove') {
            // Destructive and asymmetric: confirm before deleting, so an
            // accidental tap cannot silently drop a friendship.
            const fr = getF(uid);
            const nm = (fr && fr.name) || 'this player';
            if (el.dataset.confirmed !== '1') {
                if (!window.confirm(`Remove ${nm} from your friends?\n\nThis deletes the friendship for BOTH of you, along with your shared streak history. It cannot be undone.`)) return;
                el.dataset.confirmed = '1';
            }
            await removeFriend(uid);
            open(currentTab); return;
        }
        if (a === 'ack') {
            for (const m of S.inbox) m.read = true;
            save(); renderBell(); open(currentTab);
            try { if (apiBase() !== null) api('notify/ack', { ids: [] }).catch(() => {}); } catch (_) {}
            return;
        }
        if (a === 'play') {
            const f = getF(uid);
            // Step 3 of the sender flow: CHOOSE the time control. Previously
            // this silently reused whatever was in localStorage, so the
            // "choose the time control" step did not exist at all.
            const chosen = await pickTimeControl(uid);
            if (!chosen) { open(currentTab); return; }

            /**
             * Deliver, then REPORT. The old code printed "Invite sent"
             * *before* attempting delivery and never revised it, so a
             * recipient who was offline saw a success message for an invite
             * that was never delivered. Now the message matches the outcome.
             */
            const deliverInvite = async (toUid, fr, code) => {
                const r = await sendGameInvite(toUid, code, chosen.minutes, chosen.incSec);
                if (r.ok && r.delivery === 'server') {
                    notifyLocal('note', `Invite sent to ${fr ? fr.name : 'friend'}`,
                        `${chosen.label} ${chosen.cat} — waiting room ${code}. They get a popup and join straight to the board.`);
                    pendingInvite = { toUid, toName: (fr && fr.name) || 'Friend', matchId: r.matchId, code, control: chosen, at: Date.now() };
                    try { localStorage.setItem('cc_pending_invite', JSON.stringify(pendingInvite)); } catch (_) {}
                } else if (r.ok) {
                    // Device-local fallback: delivered peer-to-peer, but there
                    // is no server record of it. Say so honestly.
                    notifyLocal('note', `Invited ${fr ? fr.name : 'friend'} on this device`,
                        `${chosen.label} ${chosen.cat} — this works only while they keep the app open (no backend connected).`);
                } else if (r.reason === 'peer-unreachable') {
                    notifyLocal('note', `${fr ? fr.name : 'Friend'} is offline`,
                        `We could not reach them. Share the 6-letter code ${code} from the waiting room instead.`);
                } else if (r.reason === 'not-friends') {
                    notifyLocal('note', 'Cannot invite', 'You can only invite people who are your friends.');
                } else if (r.reason === 'bad-time-control') {
                    notifyLocal('note', 'Cannot invite', 'That time control is not supported.');
                } else {
                    notifyLocal('note', 'Invite not delivered',
                        'The server did not accept the invitation, so nothing was sent. Try again when you are online.');
                }
                try { if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab); } catch (_) {}
            };
            try {
                if (window.app) {
                    if (!window.app._clerk?.user) { notifyLocal('note', 'Sign in to host', 'Guests join games — only members can host them.'); open(currentTab); return; }
                    // Host with the CHOSEN control so the room and the
                    // invitation can never disagree about the clock.
                    const cur = window.app.online;
                    if (cur && cur.phase === 'waiting' && cur.code && cur.net) {
                        await deliverInvite(uid, f, cur.code);
                        return;
                    }
                    let hosted = null;
                    try {
                        localStorage.setItem('cc_control', JSON.stringify({ m: chosen.minutes, s: chosen.incSec }));
                        hosted = window.app._onlineHost();
                    } catch (_) {}
                    const after = async () => {
                        try {
                            const s = window.app.online;
                            // Only a LIVE waiting room is invitable: a failed
                            // host (lobby phase, dead net) must never send a
                            // dead code.
                            if (s && s.phase === 'waiting' && s.code && s.net && f) await deliverInvite(uid, f, s.code);
                            else notifyLocal('note', 'Could not open a game', 'Check your connection and try the invite again.');
                            try { open(currentTab); } catch (_) {}
                        } catch (_) {}
                    };
                    if (hosted && typeof hosted.then === 'function') hosted.then(() => setTimeout(after, 900));
                    else setTimeout(after, 1500);
                }
            } catch (_) {}
            return;
        }
        if (a === 'nudge') {
            const f = getF(uid);
            notifyLocal('note', f ? `You poked ${f.name}` : 'Poked', 'If they open the app today, the streak survives. Maybe.');
            try {
                if (apiBase() !== null && f) api('notify', { toUid: uid, kind: 'note', title: `${meName()} nudged you`, body: 'Your streak is on the line — one game today saves it.' }).catch(() => {});
            } catch (_) {}
            open(currentTab);
            return;
        }
        if (a === 'goto-search') {
            const si = document.getElementById('fr-search');
            if (si) { try { si.scrollIntoView({ block: 'center' }); } catch (_) {} try { si.focus({ preventScroll: true }); } catch (_) {} }
            return;
        }

    }
    document.addEventListener('click', (e) => { try { onFaction(e); } catch (_) {} });

    /* ── boot ───────────────────────────────────────────────── */
    try { renderBell(); } catch (_) {}
    try { warnStreaks(); } catch (_) {}
    setTimeout(() => { try { heartbeat(); } catch (_) {} }, 5000);
    setInterval(() => { try { warnStreaks(); } catch (_) {} }, 3600000);

    window.DoChessFriends = {
        open, renderBell, metPeer, onGameEnd, profileLink, inboundLink,
        requestFriend, acceptFriend, declineFriend, removeFriend, search, streakOf, versus, ago,
        // Backwards-compatible alias: adding is sending a request.
        addFriend: requestFriend,
        list: () => Object.values(S.friends),
        pendingIn: () => S.pendingIn.slice(),
        unread, inbox: () => S.inbox.slice(),
        tierOf, rankBoard, hallList,
        apiBase, pollNow: () => watchInbox(),
        // pullRequests / pullEdges are retained as aliases of the single
        // authoritative snapshot for any external caller.
        pullRequests, pullEdges, pullSnapshot, pullInbox, pullInvites,
        sendGameInvite, checkInvitePopup, watchSentInvite, clearPendingInvite, presenceLeave, pullXp, reportPuzzleSolve, p2pEnsure: ensureP2PInbox, version: 6,
        // Exposed for tests and for the retry UI.
        explainFailure, FAILURES, isSignedOut,
    };
})();
