/**
 * js/sync.js — cloud persistence for everything the course already saves
 * in localStorage.
 *
 * The site keeps localStorage as the fast local source of truth (it works
 * on file:// with no account). This module mirrors a fixed set of sections
 * to the DoChess API, which stores them in MongoDB keyed by the verified
 * Clerk user id. Nothing here invents a second source of truth: on a
 * conflict the side with the newer per-section timestamp wins, and the
 * merged result is written back to localStorage on the next pull.
 *
 * Sections (see server/lib/merge.mjs for the server's matching table):
 *   learn         dochess:v1
 *   lessons       ccp_v4[_<uid>]
 *   achievements  cca_v1_<uid>
 *   ratings       ccr_<uid>
 *   puzzles       dochess:puzzles:v1
 *   playtime      cc_time_<uid>
 *   study         dcstudy_v1_<uid>
 *   games         ccgh_<uid>          (union merge, newest first)
 *   leaderboard   ccr_board           (union merge, per player)
 *   settings      theme/mute/board skin/time control/piece style
 *
 * Classic script, no build step, no dependency on any screen. File:// and
 * offline simply skip network calls — the course stays fully usable.
 */
(function () {
    'use strict';

    var META_KEY = 'dochess:sync:v1';
    var API = '/api';
    var PUSH_DEBOUNCE_MS = 4000;
    var HEARTBEAT_MS = 30000;

    /* ── section table ─────────────────────────────────────────────── */

    function profile() {
        try {
            var u = window.app && window.app._clerk && window.app._clerk.user;
            if (!u) return null;
            var p = {};
            var nm = u.fullName || u.username || '';
            if (nm) p.name = String(nm).slice(0, 64);
            var im = u.imageUrl || u.profileImageUrl || u.avatar || '';
            if (/^https:/.test(im)) p.image = String(im).slice(0, 2048);
            return Object.keys(p).length ? p : null;
        } catch (_) { return null; }
    }
    function anon() {
        try { return (window.app && window.app.userId) || 'anon'; } catch (_) { return 'anon'; }
    }

    var SECTIONS = [
        { id: 'learn', keys: function () { return ['dochess:v1']; } },
        { id: 'lessons', keys: function (u) { return ['ccp_v4' + (u && u !== 'anon' ? '_' + u : '')]; } },
        { id: 'achievements', keys: function (u) { return ['cca_v1_' + (u || 'anon')]; } },
        { id: 'ratings', keys: function (u) { return ['ccr_' + (u || 'anon')]; } },
        { id: 'puzzles', keys: function () { return ['dochess:puzzles:v1']; } },
        { id: 'playtime', keys: function (u) { return ['cc_time_' + (u || 'anon')]; } },
        { id: 'study', keys: function (u) { return ['dcstudy_v1_' + (u || 'anon')]; } },
        { id: 'games', keys: function (u) { return ['ccgh_' + (u || 'anon')]; } },
        { id: 'leaderboard', keys: function () { return ['ccr_board']; } },
        {
            id: 'settings',
            keys: function () { return ['ccp_theme', 'cc_mute', 'cc_board_skin', 'cc_control', 'cc_piece_set']; },
            pack: function () {
                var out = {};
                for (var i = 0; i < this.keys().length; i++) {
                    var k = this.keys()[i];
                    var v = null;
                    try { v = localStorage.getItem(k); } catch (_) {}
                    if (v !== null) out[k] = v;
                }
                return out;
            },
            unpack: function (data) {
                if (!data || typeof data !== 'object') return;
                for (var k in data) {
                    if (Object.prototype.hasOwnProperty.call(data, k) && typeof data[k] === 'string') {
                        try { localStorage.setItem(k, data[k]); } catch (_) {}
                    }
                }
            }
        }
    ];

    /* ── tiny helpers ──────────────────────────────────────────────── */

    function hash(s) {
        // djb2 — content fingerprint, not a security primitive.
        var h = 5381, i = 0;
        for (; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return h.toString(36) + ':' + s.length.toString(36);
    }

    function readRaw(sec, uid) {
        try {
            if (sec.pack) return JSON.stringify(sec.pack());
            var k = sec.keys(uid)[0];
            var v = localStorage.getItem(k);
            return v == null ? null : v;
        } catch (_) { return null; }
    }

    function writeRaw(sec, uid, raw) {
        try {
            if (sec.pack) {
                var parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                if (sec.unpack) sec.unpack(parsed);
                return;
            }
            var k = sec.keys(uid)[0];
            if (raw == null) localStorage.removeItem(k);
            else localStorage.setItem(k, (typeof raw === 'string') ? raw : JSON.stringify(raw));
        } catch (_) { /* blocked storage — nothing to mirror */ }
    }

    /* Union two game lists by gameId (newest date wins per key). The server
       merges the 'games' section the same way, so write-backs must ADD to the
       local history, never replace it - a trimmed push or another device's
       games must never delete what this device already holds. */
    function unionGames(localRaw, serverList) {
        var out = {}, keys = [];
        function add(rec) {
            if (!rec || typeof rec !== 'object') return;
            var k = rec.gameId || rec.id;
            if (!k) return;
            var prev = out[k];
            if (!prev) { out[k] = rec; keys.push(k); return; }
            if ((rec.date || 0) >= (prev.date || 0)) out[k] = rec;
        }
        var loc = null;
        try { loc = localRaw == null ? null : JSON.parse(localRaw); } catch (_) {}
        if (Array.isArray(loc)) loc.forEach(add);
        if (Array.isArray(serverList)) serverList.forEach(add);
        return keys.map(function (k) { return out[k]; })
            .sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    }

    function decode(raw) {
        if (raw == null) return null;
        if (typeof raw !== 'string') return raw;
        try { return JSON.parse(raw); } catch (_) { return raw; }
    }

    function metaKey(uid) { return META_KEY + ':' + (uid || 'anon'); }

    function normalizeMeta(m) {
        if (!m || typeof m !== 'object') return { sections: {}, hash: {}, lastOkAt: 0, lastError: null, pendingGames: [] };
        if (!m.sections) m.sections = {};
        if (!m.hash) m.hash = {};
        if (!Array.isArray(m.pendingGames)) m.pendingGames = [];
        return m;
    }

    // Sync fingerprints are PER ACCOUNT. A single shared meta record is what
    // used to make every local section look brand-new after an account
    // switch (stamping stale data with fresh timestamps over the incoming
    // account's cloud state). Each identity keeps its own last-sync map.
    function loadMeta(uid) {
        try {
            var m = JSON.parse(localStorage.getItem(metaKey(uid)) || 'null');
            return normalizeMeta(m);
        } catch (_) {}
        return normalizeMeta(null);
    }

    function saveMeta(meta) {
        try { localStorage.setItem(metaKey(S.userId), JSON.stringify(meta)); } catch (_) {}
    }

    /* ── state ─────────────────────────────────────────────────────── */

    var S = {
        enabled: false,
        userId: null,
        getToken: null,
        meta: loadMeta(null),
        status: 'idle',      // idle | syncing | saved | offline | error | disabled
        lastSyncAt: 0,
        lastError: null,
        lastConflict: null,  // {at, sections[]} — server held newer data on last push
        timer: null,
        pushTimer: null,
        inFlight: false,
        pendingPush: false,
        serverMode: null,     // 'clerk' | 'dev-header' | 'unavailable'
        serverProbed: false
    };

    function setStatus(st, err) {
        S.status = st;
        if (err !== undefined) S.lastError = err;
        try {
            window.dispatchEvent(new CustomEvent('dochess:sync', {
                detail: { status: st, lastSyncAt: S.lastSyncAt, error: S.lastError }
            }));
        } catch (_) {}
    }

    function available() {
        try {
            return typeof fetch === 'function' && location.protocol !== 'file:' && location.protocol !== 'data:';
        } catch (_) { return false; }
    }

    /* ── HTTP ──────────────────────────────────────────────────────── */

    function sessionToken() {
        return Promise.resolve().then(function () {
            var s = S.getToken ? S.getToken() : null;
            if (s && typeof s.then === 'function') return s;
            if (typeof s === 'string') return s;
            // Fallback path straight through clerk-js when the host app has
            // not wired a getToken yet.
            var clerk = window.Clerk;
            if (clerk && clerk.session && typeof clerk.session.getToken === 'function') {
                return clerk.session.getToken();
            }
            return null;
        }).catch(function () { return null; });
    }

    /**
     * Ask the API once how it authenticates. Only a server that EXPLICITLY
     * reports `dev-header` mode (DOCHESS_DEV_NO_AUTH=1, local development)
     * ever receives the x-doChess-user header; a Clerk-mode server always
     * gets a verified session token instead. A missing API (static hosting)
     * simply keeps the app local-only.
     */
    function ensureServerMode() {
        if (S.serverProbed) return Promise.resolve();
        S.serverProbed = true;
        return fetch(API + '/health', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (doc) {
                if (doc && doc.auth && doc.auth.mode) S.serverMode = doc.auth.mode;
                else S.serverMode = 'unknown';
            })
            .catch(function () { S.serverMode = 'unavailable'; });
    }

    function api(method, path, body) {
        return ensureServerMode().then(function () {
            return sessionToken();
        }).then(function (token) {
            var devUser = null;
            if (S.serverMode === 'dev-header' && S.userId) devUser = S.userId; // local development only
            if (!token && !devUser) {
                var err = new Error('no-session-token');
                err.code = 'NO_TOKEN';
                throw err;
            }
            var headers = { Accept: 'application/json' };
            if (token) headers.Authorization = 'Bearer ' + token;
            if (devUser) headers['x-doChess-user'] = devUser;
            if (body) headers['Content-Type'] = 'application/json';
            var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
            var t = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
            return fetch(API + path, {
                method: method,
                headers: headers,
                body: body ? JSON.stringify(body) : undefined,
                credentials: 'same-origin',
                signal: ctrl ? ctrl.signal : undefined
            }).then(function (res) {
                if (t) clearTimeout(t);
                if (res.status === 401) {
                    var e = new Error('unauthorised');
                    e.code = 'UNAUTH';
                    throw e;
                }
                if (res.status === 429) {
                    var r = new Error('rate-limited');
                    r.code = 'RATE';
                    throw r;
                }
                if (!res.ok) {
                    var q = new Error('http ' + res.status);
                    q.code = 'HTTP';
                    throw q;
                }
                return res.json();
            }, function (e) {
                if (t) clearTimeout(t);
                throw e;
            });
        });
    }

    /* ── identity: per-account device state ──────────────────────────
       Per-uid keys (`ccr_<uid>`, `cca_v1_<uid>`, …) are inherently isolated:
       each account reads only its own. Two global keys hold PER-LEARNER
       progress and must be swapped on identity change (SWAP_SECTIONS):
       without the swap, account B would inherit — and then upload — account
       A's local board. Everything else global stays device-scoped:
       - `ccr_board` is keyed per player already (the union merge resolves
         conflicts by freshness), so the device's met-players list correctly
         survives account switches;
       - settings are device preferences (theme, mute); LWW against the
         account's cloud copy handles divergence.
       On every identity change the swapped keys are stashed under the
       outgoing account and the incoming account's stash is restored (keys
       with no stash entry are cleared and refilled from the cloud). Guest
       continuity falls out of the same mechanism: signing out restores the
       anonymous stash. */

    // Sections whose global keys hold per-learner progress. Update this
    // table (not the machinery below) when adding a synced section.
    var SWAP_SECTIONS = ['learn', 'puzzles'];
    function swapsOnIdentity(sec) { return SWAP_SECTIONS.indexOf(sec.id) >= 0; }

    function sectionKeys(sec, uid) {
        try { return sec.keys(uid); } catch (_) { return []; }
    }

    function stashKey(uid, k) { return 'dochess:stash:' + (uid || 'anon') + ':' + k; }

    function stashGlobals(uid) {
        try {
            for (var i = 0; i < SECTIONS.length; i++) {
                if (!swapsOnIdentity(SECTIONS[i])) continue;
                var ks = sectionKeys(SECTIONS[i], uid);
                for (var j = 0; j < ks.length; j++) {
                    var v = null;
                    try { v = localStorage.getItem(ks[j]); } catch (_) {}
                    try {
                        if (v == null) localStorage.removeItem(stashKey(uid, ks[j]));
                        else localStorage.setItem(stashKey(uid, ks[j]), v);
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    function restoreGlobals(uid) {
        try {
            for (var i = 0; i < SECTIONS.length; i++) {
                if (!swapsOnIdentity(SECTIONS[i])) continue;
                var ks = sectionKeys(SECTIONS[i], uid);
                for (var j = 0; j < ks.length; j++) {
                    var sv = null;
                    try { sv = localStorage.getItem(stashKey(uid, ks[j])); } catch (_) {}
                    try {
                        // No stash entry: clear so nothing leaks in from the
                        // previous identity — the cloud pull refills it.
                        if (sv == null) localStorage.removeItem(ks[j]);
                        else localStorage.setItem(ks[j], sv);
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    // First sign-in adoption: a brand-new account (nothing on the server,
    // nothing under its own keys on this device) inherits the anonymous
    // device state instead of starting blank. Anything else — an existing
    // account, a returning device — is left strictly alone so guest data can
    // never contaminate a real account.
    //
    // The achievements record is deliberately EXCLUDED from both the gate
    // and the copy: the app derives it on sign-in (evaluate() runs inside
    // _setUser), so its key always exists by flush time, and its badges
    // recompute from the migrated underlying stores anyway.
    var MIGRATE_SECTIONS = ['lessons', 'ratings', 'playtime', 'study', 'games'];
    function maybeMigrateAnon(doc) {
        var uid = S.userId;
        if (!uid || uid === 'anon') return false;
        var srv = (doc && doc.sections) || {};
        if (Object.keys(srv).length) return false;
        var i, sec;
        for (i = 0; i < SECTIONS.length; i++) {
            sec = SECTIONS[i];
            if (MIGRATE_SECTIONS.indexOf(sec.id) < 0) continue;
            if (readRaw(sec, uid) != null) return false;
        }
        var copied = false;
        for (i = 0; i < SECTIONS.length; i++) {
            sec = SECTIONS[i];
            if (MIGRATE_SECTIONS.indexOf(sec.id) < 0) continue;
            var raw = null;
            try {
                raw = readRaw(sec, 'anon');
                if (raw == null) raw = localStorage.getItem(stashKey('anon', sectionKeys(sec, 'anon')[0]));
            } catch (_) { raw = null; }
            if (raw == null) continue;
            writeRaw(sec, uid, raw);
            delete S.meta.sections[sec.id];
            delete S.meta.hash[sec.id];
            copied = true;
        }
        // Shared keys were cleared by the swap when the new account had no
        // stash — bring the anonymous stash back so guest progress counts.
        // (A merely absent key stays absent; only real values are restored.)
        // Only swapped sections participate: device-scoped keys (board,
        // settings) are never cleared, so there is nothing to restore.
        for (i = 0; i < SECTIONS.length; i++) {
            sec = SECTIONS[i];
            if (!swapsOnIdentity(sec)) continue;
            var ks = sectionKeys(sec, uid);
            for (var j = 0; j < ks.length; j++) {
                var cur = null, sv2 = null;
                try { cur = localStorage.getItem(ks[j]); } catch (_) {}
                if (cur != null) continue;
                try { sv2 = localStorage.getItem(stashKey('anon', ks[j])); } catch (_) {}
                if (sv2 == null) continue;
                try { localStorage.setItem(ks[j], sv2); } catch (_) {}
                copied = true;
            }
        }
        if (copied) saveMeta(S.meta);
        return copied;
    }

    function dropForeignPendingGames(uid) {
        try {
            var keep = (S.meta.pendingGames || []).filter(function (p) { return p && p.uid === (uid || 'anon'); });
            if (keep.length !== (S.meta.pendingGames || []).length) {
                S.meta.pendingGames = keep;
                saveMeta(S.meta);
            }
        } catch (_) {}
    }

    function switchIdentity(nextUser) {
        var prev = S.userId || 'anon';
        var next = nextUser || 'anon';
        S.userId = nextUser || null;
        if (prev === next) return;
        stashGlobals(prev);
        restoreGlobals(next);
        S.meta = loadMeta(next);
        S.lastConflict = null;
        dropForeignPendingGames(next);
    }

    function announceConflict(ids) {
        S.lastConflict = { at: Date.now(), sections: ids.slice() };
        try {
            window.dispatchEvent(new CustomEvent('dochess:conflict', { detail: { sections: ids.slice() } }));
        } catch (_) {}
    }

    /* ── dirty detection ───────────────────────────────────────────── */

    function collectDirty() {
        var uid = S.userId || anon();
        var dirty = {};
        for (var i = 0; i < SECTIONS.length; i++) {
            var sec = SECTIONS[i];
            var raw = readRaw(sec, uid);
            if (raw == null && !S.meta.sections[sec.id]) continue;
            var h = raw == null ? 'null' : hash(raw);
            if (S.meta.hash[sec.id] !== h) {
                // Stamp with the detection time (now), never with the last
                // sync time: stamping the past is what used to make every
                // offline edit lose its push (equal timestamps keep the
                // stored copy). LWW on the server still protects genuinely
                // newer cloud data — and when it wins, we say so (conflict).
                dirty[sec.id] = { updatedAt: Date.now(), data: decode(raw), _raw: raw, _hash: h };
            }
        }
        return dirty;
    }

    /* ── pull / push ───────────────────────────────────────────────── */

    function pull() {
        if (!S.enabled) return Promise.resolve(null);
        return api('GET', '/state').then(function (doc) {
            S.lastSyncAt = Date.now();
            S.lastConflict = null; // a clean pull supersedes the previous notice
            var uid = S.userId || anon();
            var serverSections = (doc && doc.sections) || {};
            var toWrite = {};
            for (var i = 0; i < SECTIONS.length; i++) {
                var sec = SECTIONS[i];
                var srv = serverSections[sec.id];
                if (!srv || !Number.isFinite(srv.updatedAt)) continue;
                var localUpd = S.meta.sections[sec.id] || 0;
                if (srv.updatedAt <= localUpd) continue;
                writeRaw(sec, uid, JSON.stringify(srv.data === undefined ? null : srv.data));
                var raw = readRaw(sec, uid);
                S.meta.sections[sec.id] = srv.updatedAt;
                S.meta.hash[sec.id] = raw == null ? 'null' : hash(raw);
                toWrite[sec.id] = srv.updatedAt;
            }
            S.meta.lastOkAt = Date.now();
            S.meta.lastError = null;
            saveMeta(S.meta);
            setStatus('saved', null);
            if (Object.keys(toWrite).length) {
                try {
                    window.dispatchEvent(new CustomEvent('dochess:synced', { detail: { written: toWrite } }));
                } catch (_) {}
            }
            return doc;
        });
    }

    function push() {
        if (!S.enabled) return Promise.resolve(null);
        var dirty = collectDirty();
        var ids = Object.keys(dirty);
        if (!ids.length) return Promise.resolve(null);
        // The server rejects any section over 600 KB (413), which would
        // fail the WHOLE push, so one oversized section must never block
        // the rest. Lists get trimmed to fit (the server merges by union
        // and the remainder rides along with a later push); any other
        // oversized section simply stays dirty for a later attempt.
        var SECTION_PAYLOAD_CAP = 550000;
        var sections = {};
        var sent = [];
        for (var i = 0; i < ids.length; i++) {
            var id0 = ids[i];
            var d = dirty[id0];
            var payload = { updatedAt: d.updatedAt, data: d.data };
            if (JSON.stringify(payload).length > SECTION_PAYLOAD_CAP) {
                if (id0 === 'games' && Array.isArray(d.data)) {
                    var cut = d.data.length;
                    while (cut > 1 &&
                        JSON.stringify({ updatedAt: d.updatedAt, data: d.data.slice(0, cut) }).length > SECTION_PAYLOAD_CAP) {
                        cut = Math.max(1, Math.floor(cut * 0.8));
                    }
                    payload.data = d.data.slice(0, cut);
                } else {
                    continue;
                }
            }
            sections[id0] = payload;
            sent.push(id0);
        }
        if (!sent.length) return Promise.resolve(null);
        setStatus('syncing');
        var prof = profile();
        var body = prof ? { sections: sections, profile: prof } : { sections: sections };
        return api('PUT', '/state', body).then(function (doc) {
            S.lastSyncAt = Date.now();
            S.lastConflict = null; // replaced below if this very push loses a race
            // Adopt the server's timestamps so the next collect is clean.
            var srv = (doc && doc.sections) || {};
            var uid = S.userId || anon();
            var lost = [];
            for (var j = 0; j < sent.length; j++) {
                var id = sent[j];
                var sec = SECTIONS.find(function (x) { return x.id === id; });
                if (!sec) continue;
                var serverSec = srv[id];
                if (serverSec && Number.isFinite(serverSec.updatedAt)) {
                    var sdata = serverSec.data === undefined ? null : serverSec.data;
                    if (id === 'games') {
                        // Union-merged list: a write-back that differs from
                        // what we sent is normal (older games from another
                        // device, or a trimmed push). Merge both sides;
                        // never a lost edit.
                        writeRaw(sec, uid, JSON.stringify(unionGames(readRaw(sec, uid), sdata)));
                    } else {
                        // If the server kept something NEWER than we sent, our
                        // edit lost a cross-device race: adopt it and say so
                        // instead of silently dropping the user's work.
                        if (serverSec.updatedAt > dirty[id].updatedAt ||
                            (serverSec.updatedAt === dirty[id].updatedAt &&
                             JSON.stringify(sdata) !== JSON.stringify(dirty[id].data))) {
                            lost.push(id);
                        }
                        writeRaw(sec, uid, JSON.stringify(sdata));
                    }
                    S.meta.sections[id] = serverSec.updatedAt;
                } else {
                    S.meta.sections[id] = dirty[id].updatedAt;
                }
                var raw = readRaw(sec, uid);
                S.meta.hash[id] = raw == null ? 'null' : hash(raw);
            }
            S.meta.lastOkAt = Date.now();
            S.meta.lastError = null;
            saveMeta(S.meta);
            if (lost.length) announceConflict(lost);
            setStatus('saved', null);
            return doc;
        });
    }

    /* ── match finalize ────────────────────────────────────────────
       Best-effort POST of a finished game to /api/games (idempotent
       per-user+gameId server-side). Never throws: a failed record is queued
       with the recording account attached and retried on later flushes —
       and the device-local history stays the fallback underneath. */
    function queueGame(rec) {
        try {
            var q = S.meta.pendingGames || [];
            q.push({ rec: rec, uid: S.userId || 'anon', tries: 0, nextAt: Date.now() + 30000 });
            while (q.length > 50) q.shift();
            S.meta.pendingGames = q;
            saveMeta(S.meta);
        } catch (_) {}
    }

    function recordGame(rec) {
        if (!S.enabled) return Promise.resolve(null);
        return api('POST', '/games', rec || {}).catch(function (e) {
            S.meta.lastError = String((e && e.message) || e);
            queueGame(rec || {});
            try { saveMeta(S.meta); } catch (_) {}
            try { schedule(); } catch (_) {}
            return null;
        });
    }

    // Retry queued game posts whose account is still active (entries are
    // tagged at record time so a later sign-in can never attribute one
    // player's game to another account). Bounded backoff, max 3 per flush.
    function retryPendingGames() {
        if (!S.enabled) return Promise.resolve(null);
        var now = Date.now();
        var due = [];
        try {
            var q = S.meta.pendingGames || [];
            for (var i = 0; i < q.length && due.length < 3; i++) {
                var p = q[i];
                if (!p || p.uid !== (S.userId || 'anon') || (p.nextAt || 0) > now || (p.tries || 0) >= 10) continue;
                due.push(p);
            }
        } catch (_) { return Promise.resolve(null); }
        if (!due.length) return Promise.resolve(null);
        var chain = Promise.resolve(null);
        due.forEach(function (p) {
            chain = chain.then(function () {
                return api('POST', '/games', p.rec || {}).then(function () {
                    p.done = true;
                }, function () {
                    p.tries = (p.tries || 0) + 1;
                    p.nextAt = now + Math.min(24 * 3600 * 1000, 30000 * Math.pow(2, p.tries));
                });
            });
        });
        return chain.then(function () {
            try {
                S.meta.pendingGames = (S.meta.pendingGames || []).filter(function (p) { return p && !p.done; });
                saveMeta(S.meta);
            } catch (_) {}
            return null;
        }, function () { return null; });
    }

    function flush(reason) {
        if (!S.enabled || S.inFlight) { if (!S.enabled) return; S.pendingPush = true; return; }
        S.inFlight = true;
        pull()
            .catch(function () { /* pull failures are non-fatal */ return null; })
            .then(function (doc) {
                // First sign-in adoption happens here (needs the pull result
                // to know the account is new); the push below carries it.
                if (doc) { try { maybeMigrateAnon(doc); } catch (_) {} }
                return push();
            })
            .catch(function (e) {
                S.meta.lastError = String((e && e.message) || e);
                saveMeta(S.meta);
                setStatus(e && (e.code === 'NO_TOKEN' || e.code === 'UNAUTH') ? 'disabled' : 'offline', S.meta.lastError);
            })
            .then(function () { return retryPendingGames(); })
            .then(function () {
                S.inFlight = false;
                if (S.pendingPush) { S.pendingPush = false; schedule(); }
            });
        if (reason) { /* reserved for logging */ }
    }

    function schedule() {
        if (S.pushTimer) return;
        S.pushTimer = setTimeout(function () { S.pushTimer = null; flush('debounce'); }, PUSH_DEBOUNCE_MS);
    }

    /** Call after any local write the course already performs. */
    function notify() { if (S.enabled) schedule(); }

    /* ── lifecycle ─────────────────────────────────────────────────── */

    function start(opts) {
        opts = opts || {};
        var nextUser = (opts.userId === undefined) ? S.userId : (opts.userId || null);
        if (nextUser !== S.userId) switchIdentity(nextUser);
        S.getToken = opts.getToken || null;
        S.enabled = available() && !opts.disabled;
        if (!S.enabled) { setStatus('disabled', available() ? 'opt-out' : 'no-origin'); return false; }
        setStatus('idle');
        flush('start');
        if (!S.timer && typeof setInterval === 'function') {
            S.timer = setInterval(function () { flush('heartbeat'); }, HEARTBEAT_MS);
        }
        try {
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'hidden') { if (S.pushTimer) { clearTimeout(S.pushTimer); S.pushTimer = null; } flush('hidden'); }
            });
            window.addEventListener('pagehide', function () { flush('pagehide'); });
        } catch (_) {}
        return true;
    }

    function stop() {
        // Logout (the only production caller) must also drop the identity:
        // otherwise post-logout guest play would pile into the signed-out
        // account's leftover globals and ride along on the next sign-in.
        try { switchIdentity(null); } catch (_) { S.userId = null; }
        S.enabled = false;
        if (S.timer) { clearInterval(S.timer); S.timer = null; }
        S.serverProbed = false;
        S.serverMode = null;
        setStatus('disabled', 'stopped');
    }

    function setUser(userId) {
        var next = userId || null;
        if ((S.userId || null) === next) return;
        switchIdentity(next);
        if (S.enabled) flush('user-change');
    }

    window.DoChessSync = {
        start: start,
        stop: stop,
        setUser: setUser,
        pull: pull,
        push: push,
        recordGame: recordGame,
        notify: notify,
        flush: flush,
        status: function () {
            return { status: S.status, lastSyncAt: S.lastSyncAt, lastError: S.lastError, userId: S.userId, enabled: S.enabled, serverMode: S.serverMode,
                conflict: S.lastConflict ? S.lastConflict.sections.slice() : null,
                pendingGames: (S.meta.pendingGames || []).length };
        },
        SECTIONS: SECTIONS,
        version: '1.0.0'
    };
})();
