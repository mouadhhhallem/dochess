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

    function decode(raw) {
        if (raw == null) return null;
        if (typeof raw !== 'string') return raw;
        try { return JSON.parse(raw); } catch (_) { return raw; }
    }

    function loadMeta() {
        try {
            var m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
            if (m && typeof m === 'object') {
                if (!m.sections) m.sections = {};
                if (!m.hash) m.hash = {};
                return m;
            }
        } catch (_) {}
        return { sections: {}, hash: {}, lastOkAt: 0, lastError: null };
    }

    function saveMeta(meta) {
        try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (_) {}
    }

    /* ── state ─────────────────────────────────────────────────────── */

    var S = {
        enabled: false,
        userId: null,
        getToken: null,
        meta: loadMeta(),
        status: 'idle',      // idle | syncing | saved | offline | error | disabled
        lastSyncAt: 0,
        lastError: null,
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
                dirty[sec.id] = { updatedAt: S.meta.sections[sec.id] || Date.now(), data: decode(raw), _raw: raw, _hash: h };
            }
        }
        return dirty;
    }

    /* ── pull / push ───────────────────────────────────────────────── */

    function pull() {
        if (!S.enabled) return Promise.resolve(null);
        return api('GET', '/state').then(function (doc) {
            S.lastSyncAt = Date.now();
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
        var sections = {};
        for (var i = 0; i < ids.length; i++) {
            var d = dirty[ids[i]];
            sections[ids[i]] = { updatedAt: d.updatedAt, data: d.data };
        }
        setStatus('syncing');
        return api('PUT', '/state', { sections: sections }).then(function (doc) {
            S.lastSyncAt = Date.now();
            // Adopt the server's timestamps so the next collect is clean.
            var srv = (doc && doc.sections) || {};
            var uid = S.userId || anon();
            for (var j = 0; j < ids.length; j++) {
                var id = ids[j];
                var sec = SECTIONS.find(function (x) { return x.id === id; });
                if (!sec) continue;
                var serverSec = srv[id];
                if (serverSec && Number.isFinite(serverSec.updatedAt)) {
                    // Server may have merged (games/leaderboard) — write back.
                    writeRaw(sec, uid, JSON.stringify(serverSec.data === undefined ? null : serverSec.data));
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
            setStatus('saved', null);
            return doc;
        });
    }

    function flush(reason) {
        if (!S.enabled || S.inFlight) { if (!S.enabled) return; S.pendingPush = true; return; }
        S.inFlight = true;
        pull()
            .catch(function () { /* pull failures are non-fatal */ })
            .then(function () { return push(); })
            .catch(function (e) {
                S.meta.lastError = String((e && e.message) || e);
                saveMeta(S.meta);
                setStatus(e && (e.code === 'NO_TOKEN' || e.code === 'UNAUTH') ? 'disabled' : 'offline', S.meta.lastError);
            })
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
        S.getToken = opts.getToken || null;
        S.userId = opts.userId || null;
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
        S.enabled = false;
        if (S.timer) { clearInterval(S.timer); S.timer = null; }
        S.serverProbed = false;
        S.serverMode = null;
        setStatus('disabled', 'stopped');
    }

    function setUser(userId) {
        var prev = S.userId;
        S.userId = userId || null;
        if (prev !== S.userId && S.enabled) {
            // Identity changed: forget per-user fingerprints so everything
            // re-syncs under the new account instead of silently skipping.
            S.meta = { sections: {}, hash: {}, lastOkAt: 0, lastError: null };
            saveMeta(S.meta);
            flush('user-change');
        }
    }

    window.DoChessSync = {
        start: start,
        stop: stop,
        setUser: setUser,
        pull: pull,
        push: push,
        notify: notify,
        flush: flush,
        status: function () {
            return { status: S.status, lastSyncAt: S.lastSyncAt, lastError: S.lastError, userId: S.userId, enabled: S.enabled, serverMode: S.serverMode };
        },
        SECTIONS: SECTIONS,
        version: '1.0.0'
    };
})();
