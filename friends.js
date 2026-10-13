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
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        const d = Math.floor(s / 86400);
        return d === 1 ? 'yesterday' : `${d}d ago`;
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
                return s;
            }
        } catch (_) {}
        return { v: 1, friends: {}, pendingIn: [], pendingOut: [], inbox: [], hallJoined: false };
    }
    let S = load();
    function save() {
        try { localStorage.setItem(storeKey(), JSON.stringify(S)); } catch (_) {}
    }
    // Identity switches (sign in/out) swap the shelf. Coming from a
    // guest shelf with content into an EMPTY account shelf adopts the guest
    // circle (friends, requests, streaks, inbox) instead of stranding it:
    // first sign-in must never look like deleted friends.
    function adoptGuestShelf() {
        try {
            const g = JSON.parse(localStorage.getItem('ccf_guest') || 'null');
            if (!g || typeof g !== 'object') return;
            const guestFriends = g.friends && typeof g.friends === 'object' ? g.friends : {};
            if (!Object.keys(guestFriends).length && !(Array.isArray(g.pendingIn) && g.pendingIn.length)) return;
            if (Object.keys(S.friends).length || S.pendingIn.length || S.inbox.length) return; // account shelf non-empty: hands off
            for (const [fid, f] of Object.entries(guestFriends)) {
                if (!S.friends[fid]) S.friends[fid] = { ...f };
            }
            for (const p of (Array.isArray(g.pendingIn) ? g.pendingIn : [])) {
                if (p && p.uid && !S.pendingIn.some((x) => x.uid === p.uid)) S.pendingIn.push({ ...p });
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
            if (wasGuest && u !== 'guest') adoptGuestShelf();
            // Signed-in identity arrived/changed: (re)open the P2P inbox so
            // friend invites pop even on the static site with no backend.
            try { ensureP2PInbox(); } catch (_) {}
        }
    }, 3000);

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
            if (res.status === 401 || res.status === 403) authState = 'signed-out';
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

    /* ── friends ────────────────────────────────────────────── */
    function friends() { return S.friends; }
    function getF(uid) { return S.friends[uid] || null; }
    function addFriend(uid, name, source, img) {
        if (!uid || uid === uidOf()) return null;
        let f = S.friends[uid];
        if (!f) {
            f = S.friends[uid] = {
                uid, name: String(name || 'Player').slice(0, 24),
                since: Date.now(), confirmed: false, source: source || 'link', img: cleanImg(img),
                // Outbound = I asked, they haven't answered. Never shown
                // as a friend (separate Sent section) until mutual/P2P.
                outbound: source === 'search',
                days: {}, best: 0, lastSeen: 0,
            };
        } else if (name) f.name = String(name).slice(0, 24);
        if (img) { const ci = cleanImg(img); if (ci) f.img = ci; }
        if (!S.pendingOut.includes(uid) && !f.confirmed) S.pendingOut.push(uid);
        save(); renderBell();
        // Actionable request: the inbox item carries who is asking (name +
        // photo) so the recipient can render Accept/Decline without a
        // second lookup. Friendship itself still needs mutual edges.
        if (f.outbound) serverNotify(uid, 'friend-request', meName() + ' wants to be friends', 'Accept to start growing a streak together.', { fromName: meName(), img: myAvatar() });
        try { if (apiBase() !== null) api('friends/add', { friendUid: uid, friendName: f.name, friendImg: f.img || null, myName: meName(), myImg: myAvatar() }).catch(() => {}); } catch (_) {}
        return f;
    }
    function acceptFriend(uid) {
        const ix = S.pendingIn.findIndex((p) => p.uid === uid);
        const req = ix >= 0 ? S.pendingIn[ix] : null;
        if (ix >= 0) S.pendingIn.splice(ix, 1);
        // Never clobber a known name with the fallback: only an inbound
        // request carries a (possibly newer) display name.
        let f = S.friends[uid] || null;
        if (req) f = addFriend(uid, req.name, 'link', req.img || null);
        else if (!f) f = addFriend(uid, 'Player', 'link');
        if (f) {
            // Confirmed flips true only through mutual edges (server list
            // or a P2P meeting) — accepting never un-confirms anyone.
            f.outbound = false;
            const po = S.pendingOut.indexOf(uid);
            if (po >= 0) S.pendingOut.splice(po, 1);
            serverNotify(uid, 'friend-accept', meName() + ' accepted your request', 'You are friends now - play a game to start a streak.', { fromName: meName(), img: myAvatar() });
        }
        save(); renderBell();
        try { if (apiBase() !== null) api('friends/add', { friendUid: uid, friendName: f ? f.name : '', friendImg: (f && f.img) || null, myName: meName(), myImg: myAvatar() }).catch(() => {}); } catch (_) {}
        pullEdges();
        pullRequests();
        return f;
    }
    function declineFriend(uid) {
        S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
        // Declining is local-only without this: the requester's Sent row
        // would wait forever. Tell them so they can clear it instantly
        // (stream) or on their next poll.
        try { serverNotify(uid, 'friend-decline', meName() + ' declined your request', 'No worries — find another rival to grow a streak with.', { fromName: meName(), img: myAvatar() }); } catch (_) {}
        save(); renderBell();
    }
    function removeFriend(uid) {
        delete S.friends[uid];
        S.pendingOut = S.pendingOut.filter((x) => x !== uid);
        S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
        save(); renderBell();
        try { if (apiBase() !== null) api('friends/remove', { friendUid: uid }).catch(() => {}); } catch (_) {}
    }
    async function pullEdges() {
        let changed = false;
        try {
            if (apiBase() === null) return false;
            const r = await api('friends/list');
            if (!r || !Array.isArray(r.friends)) return false;
            for (const e of r.friends) {
                if (!e || !e.uid || e.uid === uidOf()) continue;
                let f = S.friends[e.uid];
                if (!f) {
                    f = S.friends[e.uid] = { uid: e.uid, name: String(e.name || 'Player').slice(0, 24), since: e.since || Date.now(), confirmed: !!e.confirmed, source: 'server', img: cleanImg(e.img), days: {}, best: 0, lastSeen: 0 };
                    if (e.img) { const ci = cleanImg(e.img); if (ci) f.img = ci; }
                } else {
                    if (e.name) f.name = String(e.name).slice(0, 24);
                    if (e.img) { const ci = cleanImg(e.img); if (ci) f.img = ci; }
                    if (e.confirmed && !f.confirmed) {
                        f.confirmed = true;
                        f.outbound = false;
                        const po = S.pendingOut.indexOf(e.uid);
                        if (po >= 0) S.pendingOut.splice(po, 1);
                        notifyLocal('friend-accept', `${f.name} is now your friend`, 'You can now grow a streak together — play a game today.');
                        changed = true;
                    }
                }
            }
            save(); renderBell();
            return changed;
        } catch (_) { return false; }
    }
    // Inbound requests from the server edge graph (they list me, I don't
    // list them). Covers everything the inbox can miss: capped-out items,
    // acked-then-refreshed shelves, offline gaps, missed streams, and
    // reconnects. Idempotent: never duplicates pendingIn or friends.
    async function pullRequests() {
        try {
            if (apiBase() === null) return false;
            const r = await api('friends/requests');
            if (!r || !Array.isArray(r.requests)) return false;
            let added = false;
            for (const q of r.requests) {
                if (!q || !q.uid || q.uid === uidOf()) continue;
                if (S.friends[q.uid]) continue; // outbound or confirmed already
                if (S.pendingIn.some((p) => p.uid === q.uid)) {
                    const rec = S.pendingIn.find((p) => p.uid === q.uid);
                    if (rec && q.img && !rec.img) { rec.img = cleanImg(q.img); added = true; }
                    continue;
                }
                S.pendingIn.unshift({ uid: q.uid, name: String(q.name || 'Player').slice(0, 24), img: cleanImg(q.img), at: q.at || Date.now() });
                added = true;
            }
            if (added) { save(); renderBell(); }
            return added;
        } catch (_) { return false; }
    }
    // Called on every PeerJS hello/profile: confirms pending friendships
    // and refreshes last-seen. Writes throttled to one per 5 minutes.
    const lastTouchWrite = {};
    function metPeer(uid, name, img) {
        if (!uid || uid === uidOf()) return;
        img = cleanImg(img);
        const now = Date.now();
        const f = S.friends[uid];
        if (f) {
            if (name) f.name = String(name).slice(0, 24);
            if (img) f.img = img;
            f.lastSeen = now;
            if (!f.confirmed) {
                f.confirmed = true;
                f.outbound = false;
                const po = S.pendingOut.indexOf(uid);
                if (po >= 0) S.pendingOut.splice(po, 1);
                notifyLocal('friend-accept', `${f.name} is now your friend`, 'Play a game together to start a streak.');
            }
            if (!lastTouchWrite[uid] || now - lastTouchWrite[uid] > 300000) {
                lastTouchWrite[uid] = now;
                save();
            }
            return;
        }
        const po = S.pendingOut.indexOf(uid);
        if (po >= 0) {
            // They never used our link, but here they are live: adopt them.
            S.pendingOut.splice(po, 1);
            const nf = addFriend(uid, name, 'met', img);
            if (nf) { nf.confirmed = true; nf.outbound = false; }
            notifyLocal('friend-accept', `${name || 'A player'} is now your friend`, 'Play a game together to start a streak.');
            save();
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
    function streakOf(f) {
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
        if (st > (f.best || 0)) f.best = st;
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

    /* Relay one event to another player's server inbox (best effort). */
    function serverNotify(toUid, kind, title, body, data) {
        try {
            if (apiBase() === null || !toUid || toUid === uidOf()) return;
            const payload = { toUid, kind, title: String(title).slice(0, 60), body: String(body || '').slice(0, 140) };
            if (data && typeof data === 'object') {
                const d = {};
                if (typeof data.code === 'string') d.code = String(data.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                if (typeof data.control === 'string') d.control = data.control.slice(0, 16);
                if (typeof data.fromName === 'string') d.fromName = data.fromName.slice(0, 24);
                if (typeof data.rating === 'number') d.rating = Math.round(data.rating);
                if (typeof data.img === 'string' && /^https:/.test(data.img)) d.img = data.img.slice(0, 2048);
                if (Object.keys(d).length) payload.data = d;
            }
            api('notify', payload).catch(() => {});
        } catch (_) {}
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
            let needEdges = false;
            let needRequests = false;
            for (const m of r.items) {
                if (!m || !m.id || have.has(m.id)) continue;
                const dd = (m.data && typeof m.data === 'object') ? m.data : null;
                const data = dd ? {
                    code: (typeof dd.code === 'string' && /^[A-Z0-9]{6}$/.test(dd.code)) ? dd.code : null,
                    control: typeof dd.control === 'string' ? dd.control.slice(0, 16) : null,
                    fromName: typeof dd.fromName === 'string' ? dd.fromName.slice(0, 24) : null,
                    rating: (typeof dd.rating === 'number' && Number.isFinite(dd.rating)) ? Math.round(dd.rating) : null,
                    img: (typeof dd.img === 'string' && /^https:/.test(dd.img)) ? dd.img.slice(0, 2048) : null,
                } : null;
                // Server may report read (acked from another device); keep
                // the server flag so multi-device state converges, but a
                // locally-unknown actionable item still surfaces once.
                S.inbox.unshift({ id: m.id, kind: m.kind || 'note', title: String(m.title || '').slice(0, 60), body: String(m.body || '').slice(0, 140), from: m.from || null, at: m.at || Date.now(), read: !!m.read, local: false, data });
                added = true;
                // Materialize actionable requests immediately: the inbox is
                // the delivery channel, pendingIn is the UI model. Without
                // this the recipient only ever saw a notification.
                try {
                    if ((m.kind === 'friend-request') && m.from && m.from !== uidOf()) {
                        if (!S.friends[m.from] && !S.pendingIn.some((p) => p.uid === m.from)) {
                            const nm = (data && data.fromName) || String(m.title || '').replace(/ wants to be friends.*$/, '').slice(0, 24) || 'Player';
                            S.pendingIn.unshift({ uid: m.from, name: String(nm).slice(0, 24) || 'Player', img: (data && data.img) || null, at: m.at || Date.now() });
                        } else if (data && data.img && m.from) {
                            const rec = S.pendingIn.find((p) => p.uid === m.from);
                            if (rec && !rec.img) rec.img = data.img;
                        }
                        needRequests = true;
                    } else if (m.kind === 'friend-accept' && m.from) {
                        needEdges = true;
                    } else if (m.kind === 'friend-decline' && m.from) {
                        // They said no: drop my outbound Sent row so it does
                        // not wait forever. Keep it honest — no friendship.
                        if (S.friends[m.from] && S.friends[m.from].outbound) {
                            delete S.friends[m.from];
                        }
                        S.pendingOut = S.pendingOut.filter((x) => x !== m.from);
                        needEdges = true;
                    }
                } catch (_) {}
            }
            if (added || needEdges || needRequests) { S.inbox = S.inbox.slice(0, 50); save(); renderBell(); }
            // Follow-up sync (best effort, never blocks the inbox):
            // acceptance needs the edge graph, requests need the graph
            // fallback for anything the inbox missed.
            try { if (needEdges) pullEdges(); } catch (_) {}
            try { if (needRequests) pullRequests(); } catch (_) {}
            // NOTE: no auto-ack here. Server read flags converge only when
            // the user actually reads (Activity view) or acts (Accept /
            // Decline / popup buttons) — otherwise a second device would
            // inherit read=true and never show the actionable popup.
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
    // Invites expire: the host's PeerJS room lives only while their tab is
    // open, so a popup older than this is a dead room. Expired items are
    // acked away (never shown) instead of stranding the recipient.
    const INVITE_TTL_MS = 3 * 60 * 1000;
    const shownInvites = new Set();
    function controlLabel(id) {
        const map = { bullet: 'Bullet 1+0', blitz: 'Blitz 5+0', rapid: 'Rapid 10+0', classical: 'Classical', correspondence: 'Correspondence' };
        if (id && map[id]) return map[id];
        return id || 'chess';
    }
    function inviteExpired(m) {
        try {
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
    function acceptInvite(item, btn) {
        const code = item && item.data && item.data.code;
        // Double-tap guard: joining twice opens two sessions.
        try {
            document.querySelectorAll('#gip-overlay [data-gip]').forEach((b) => { b.disabled = true; });
            if (btn) btn.textContent = 'Joining…';
        } catch (_) {}
        if (!code || (item && inviteExpired(item))) {
            closeInvitePopup();
            ackInvite(item);
            try { notifyLocal('note', 'Invite expired', 'That game room is gone — ask your friend to send a fresh invite.'); } catch (_) {}
            return;
        }
        // Ranked context: adopt the inviter's time control BEFORE joining
        // so the lobby, the hello handshake and the Elo write all agree on
        // the category. (The host's welcome would heal it anyway, but the
        // advertised rating and lobby label must match from the first tick.)
        try {
            const cid = item && item.data && item.data.control;
            const preset = { bullet: { m: 1, s: 0 }, blitz: { m: 5, s: 0 }, rapid: { m: 10, s: 0 }, classical: { m: 15, s: 10 }, correspondence: { m: 30, s: 0 } }[cid];
            if (preset) localStorage.setItem('cc_control', JSON.stringify(preset));
        } catch (_) {}
        closeInvitePopup();
        ackInvite(item);
        try {
            if (!window.app) return;
            window.app.showOnline();
            // Lands straight on the board: showOnline renders the lobby,
            // _onlineJoin dials the room and the welcome handler paints the
            // live game — no code to type, no second tap. Failures (unknown
            // code, host gone) surface as lobby messages from _onlineJoin.
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
        const ov = document.createElement('div');
        ov.id = 'gip-overlay';
        ov.innerHTML = '<div class="qm-card" role="dialog" aria-modal="true" aria-label="Game invitation">'
            + '<div class="qm-radar"><span class="qm-clockwrap">' + ((typeof ChessCourseApp !== 'undefined' && ChessCourseApp.quickClockSVG) ? ChessCourseApp.quickClockSVG('lg') : '') + '</span></div>'
            + '<div style="display:flex;align-items:center;gap:.7rem;justify-content:center;margin-bottom:.3rem">' + ava
            + '<div style="text-align:left"><div class="qm-title" style="margin:0">' + esc(who) + ' invites you</div>'
            + '<div class="qm-sub" style="margin:0">' + esc(controlLabel(d.control)) + (eloTxt ? ' · ' + esc(eloTxt) : '') + '</div></div></div>'
            + '<div class="qm-sub">Tap Accept to join instantly — the room closes if they go offline.</div>'
            + '<div class="fr-acts" style="justify-content:center">'
            + '<button class="btn-primary" data-gip="accept" type="button">Accept &amp; play</button>'
            + '<button class="btn-secondary" data-gip="decline" type="button">Decline</button>'
            + '</div></div>';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            const bb = e.target && e.target.closest ? e.target.closest('[data-gip]') : null;
            if (!bb || bb.disabled) return;
            if (bb.dataset.gip === 'accept') acceptInvite(item, bb);
            else { try { sendP2PDecline(item.from, item); } catch (_) {} closeInvitePopup(); ackInvite(item); }
        });
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
            try { await pullRequests(); } catch (_) {}
            if (!hadPopup) checkInvitePopup();
            else checkInvitePopup(); // expires stale queue behind the popup too
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
                if (msg.kind === 'notify' || msg.kind === 'game-invite') {
                    // Typed invite pings skip straight to the popup path,
                    // but ALWAYS via pullInbox first: the event carries no
                    // room data, the inbox does (code, control, avatar).
                    pullInbox().then(() => {
                        pullRequests().then(() => {
                            if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
                            checkInvitePopup();
                        });
                        checkInvitePopup();
                    });
                } else if (msg.kind === 'friends') {
                    Promise.all([pullEdges(), pullRequests()]).then(([ch]) => {
                        if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
                        else if (ch) renderBell();
                    });
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
    // The P2P inbox is what pops invites on the static live site (no API):
    // open it shortly after boot and keep it held (cheap no-op when held).
    setTimeout(() => { try { ensureP2PInbox(); } catch (_) {} }, 6000);
    setInterval(() => { try { ensureP2PInbox(); } catch (_) {} }, 30000);
    document.addEventListener('visibilitychange', () => {
        try {
            if (!document.hidden) { closeStream(); watchStream(); watchInbox(); ensureP2PInbox(); }
            else closeStream();
        } catch (_) {}
    });
    let presenceCache = { at: 0, map: {} };
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
    async function heartbeat() {
        try {
            if (apiBase() === null || document.hidden || uidOf() === 'guest') return;
            await api('presence', { name: meName(), img: myAvatar() });
        } catch (_) {}
    }
    setInterval(heartbeat, 45000);

    /* ── rank + hall ────────────────────────────────────────── */
    const RATING_CATS = ['blitz', 'rapid', 'bullet'];
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
    async function publishRating(cat, rating) {
        try {
            if (apiBase() === null) return;
            await api('rank/publish', { name: meName(), cat, rating });
        } catch (_) {}
    }
    async function rankBoard(cat) {
        // 1) Server rank (ephemeral bests, privacy-preserving). Authoritative
        // when non-empty: accurate Elo, tier, rank ordering, strangers
        // anonymous (blur rules enforced by renderer).
        try {
            if (apiBase() !== null) {
                const friendUids = Object.keys(S.friends);
                const r = await api(`rank?cat=${encodeURIComponent(cat)}&friends=${encodeURIComponent(friendUids.join(','))}`);
                if (r && Array.isArray(r.board) && (r.total || 0) > 0) return { server: true, total: r.total || 0, myRank: r.myRank, board: r.board };
                // Empty rank store (fresh boot / restart): fall through to
                // the DURABLE leaderboard below instead of an empty page.
            }
        } catch (_) {}
        // 2) Durable leaderboard (Mongo ratings sections, same Elo source
        // the profile dossier reads). Mapped into the rank shape with the
        // SAME privacy rule: self + friends named, strangers anonymous.
        try {
            if (apiBase() !== null) {
                const lb = await api(`leaderboard?cat=${encodeURIComponent(cat)}`);
                if (lb && Array.isArray(lb.players) && lb.players.length) {
                    const rows = lb.players.slice(0, 100).map((p, i) => {
                        const isMe = p.uid === uidOf();
                        const isFriend = !!(p.uid && S.friends[p.uid]);
                        if (isMe) return { rank: i + 1, uid: p.uid, name: meName() + ' (you)', rating: p.rating, self: true, friend: false };
                        if (isFriend) return { rank: i + 1, uid: p.uid, name: p.name || 'Player', rating: p.rating, self: false, friend: true };
                        return { rank: i + 1, uid: null, name: firstNameOf(p.name), rating: p.rating, self: false, friend: false };
                    });
                    // Self may be unrated on the server: append honestly so
                    // the board still shows #N of M with the device Elo.
                    let myRank = rows.findIndex((b) => b.self) + 1 || null;
                    if (!myRank) {
                        const meR = myRating(cat);
                        let at = rows.findIndex((b) => (b.rating ?? -1) < meR);
                        if (at < 0) at = rows.length;
                        rows.splice(at, 0, { rank: 0, uid: uidOf(), name: meName() + ' (you)', rating: meR, self: true, friend: false });
                        rows.forEach((b, i) => { b.rank = i + 1; });
                        myRank = at + 1;
                    }
                    return { server: true, total: rows.length, myRank, board: rows.slice(0, 100) };
                }
            }
        } catch (_) {}
        // 3) Device board: everyone this device has met, friends named.
        // You are ALWAYS on your own board (800 START counts) so ranking
        // is never an empty page: rank #N of M is real from day one.
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
                    if (isMe || isFriend || p.uid === 'guest') return { rank: i + 1, uid: p.uid, name: isMe ? meName() + ' (you)' : p.name, rating: p.rating, self: isMe };
                    return { rank: i + 1, uid: null, name: firstNameOf(p.name), rating: p.rating, self: false };
                });
                const at = board.findIndex((b) => b.self);
                return { server: false, total: board.length, myRank: at >= 0 ? at + 1 : null, board: board.slice(0, 100) };
            }
        } catch (_) {}
        return { server: false, total: 0, myRank: null, board: [] };
    }
    async function hallJoinOnce() {
        try {
            if (S.hallJoined || apiBase() === null) return;
            const r = await api('hall/join', { name: meName() });
            if (r && r.ok) { S.hallJoined = true; save(); }
        } catch (_) {}
    }
    async function hallList() {
        try {
            if (apiBase() !== null) {
                const r = await api('hall');
                if (r && Array.isArray(r.hall)) return { server: true, hall: r.hall };
            }
        } catch (_) {}
        // Device fallback: friends in join order (honestly labeled).
        const rows = Object.values(S.friends).sort((a, b) => (a.since || 0) - (b.since || 0))
            .map((f, i) => ({ uid: f.uid, name: f.name, at: f.since, position: i + 1 }));
        return { server: false, hall: rows };
    }

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
        const st = d ? d.streak : 0;
        const xp = d ? d.xp : 0;
        const lvl = d ? d.level : 1;
        const pct = Math.min(100, Math.round(((xp % 150) / 150) * 100));
        const week = [];
        for (let back = 6; back >= 0; back--) week.push(d && d.heat[localDayKey(back)] ? 1 : 0);
        const me = myRating('blitz');
        return '<section class="fr-hero">'
            + '<div class="fr-hero-flame"><span class="fr-flame big">' + FLAME + '</span>'
            + '<div><strong>' + st + '</strong><span>day streak</span></div>'
            + '<span class="fr-week">' + week.map((x) => '<i class="' + (x ? 'on' : '') + '"></i>').join('') + '</span></div>'
            + '<div class="fr-hero-xp"><div class="fr-xp-top"><strong>LVL ' + lvl + '</strong><span>' + xp + ' XP</span></div>'
            + '<div class="fr-xpbar"><i style="width:' + pct + '%"></i></div>'
            + '<span class="fr-sub">' + (150 - (xp % 150)) + ' XP to level ' + (lvl + 1) + '</span></div>'
            + '<div class="fr-hero-rate"><strong>' + me + '</strong>' + tierChip(me) + '<span class="fr-sub">blitz · you</span></div>'
            + '</section>';
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
        if (typeof myRating === 'number') publishRating(cat, myRating);
        hallJoinOnce();
        warnStreaks();
        if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
    }

    /* ── UI ─────────────────────────────────────────────────── */
    let currentTab = 'friends';
    let currentCat = 'blitz';
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
        const seenTxt = online ? 'online now' : (f.lastSeen ? 'last seen ' + ago(f.lastSeen) : (st > 0 ? 'streak alive' : 'all quiet'));
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
        const sent = Object.values(S.friends).filter((f) => f.outbound).sort((a, b) => (b.since || 0) - (a.since || 0));
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
                <div class="fr-req sent">${avatarHTML(p.name, null, p.img)}<div class="fr-id"><strong>${esc(p.name)}</strong><span class="fr-sub">waiting for answer</span></div>
                <span class="fr-reqacts"><button class="btn-secondary sm" data-faction="remove" data-uid="${esc(p.uid)}" type="button">Cancel request</button></span></div>`).join('')}</div>` : ''}
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
        const input = box.querySelector('#fr-search');
        const out = box.querySelector('#fr-results');
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
                if (!document.body.contains(out) || input.value !== q) return;
                const have = new Set(search(q).rows.map((x) => x.uid));
                const extra = r.players.filter((p) => p && p.uid && !have.has(p.uid)).map((p) => ({ uid: p.uid, name: p.name, friend: !!(p.friend || S.friends[p.uid]), rating: null, img: p.img || null, fromServer: true }));
                if (extra.length) renderFound(search(q).rows, extra);
            } catch (_) {}
        };
        input.addEventListener('input', () => {
            const q = input.value;
            if (q.trim().length < 3) { out.innerHTML = q.trim() ? '<p class="lobby-hint">Keep typing — search starts at 3 letters.</p>' : ''; return; }
            const found = search(q).rows;
            renderFound(found, []);
            serverMerge(q);
        });
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

    async function renderRanking(box) {
        box.innerHTML = `<div class="fr-head"><div><p class="fr-kicker">Ranking</p><h2>Where you stand</h2></div>
            <div class="fr-cats" role="group" aria-label="Rating category">${RATING_CATS.map((c) => `<button class="btn-secondary sm${c === currentCat ? ' on' : ''}" data-faction="cat" data-cat="${c}" type="button">${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div></div>
            <div id="fr-rankout"><p class="lobby-hint">Loading the board…</p></div>`;
        const out = box.querySelector('#fr-rankout');
        const data = await rankBoard(currentCat);
        // Accurate Elo: prefer the server's own row for self (other-device
        // games move it); the device rating is the fallback, never a guess.
        const selfRow = (data.board || []).find((b) => b.self);
        const me = (selfRow && typeof selfRow.rating === 'number') ? selfRow.rating : myRating(currentCat);
        out.innerHTML = `
            <div class="fr-myrank">
                <span class="fr-bigrank">#${data.myRank != null ? data.myRank : '–'}</span>
                <div><strong>${esc(meName())}</strong><p>${data.total} rated player${data.total === 1 ? '' : 's'} · ${currentCat} · you hold <strong>${me}</strong></p></div>
                ${tierChip(me)}
            </div>
            ${podiumHTML(data)}
            ${data.server ? `<p class="lobby-hint">Global ladder — every DoChess player, friends named in full.</p>` : `<p class="lobby-hint">Device board — connect the API for the global ladder.</p>`}
            <div class="fr-board">${data.board.slice(0, 50).map((r) => {
                const img = r.self ? myAvatar() : ((r.uid && (S.friends[r.uid] || {}).img) || null);
                return `
                <div class="fr-brow${r.self ? ' me' : ''}">
                    <span class="fr-rank">${r.rank}</span>
                    ${r.name ? avatarHTML(r.name, null, img) : `<span class="fr-ava ghost" aria-hidden="true">?</span>`}
                    <span class="fr-bname">${r.name ? esc(r.name) : 'a quiet rival'}</span>
                    ${r.rating != null ? tierChip(r.rating) : ''}
                    <span class="fr-brating">${r.rating != null ? r.rating : '–'}</span>
                </div>`;
            }).join('') || `<p class="fr-empty">No rated players yet — finish an online game to open the board.</p>`}</div>`;
    }

    async function renderHall(box) {
        box.innerHTML = `<div class="fr-head"><div><p class="fr-kicker">Hall of fame</p><h2>First 1000 through the door</h2></div></div><div id="fr-hallout"><p class="lobby-hint">Polishing the plaques…</p></div>`;
        const out = box.querySelector('#fr-hallout');
        const data = await hallList();
        out.innerHTML = `
            ${data.server ? '' : `<p class="lobby-hint">Device hall — the global first-1000 needs the API.</p>`}
            <div class="fr-hall">${data.hall.slice(0, 100).map((h) => `
                <div class="fr-hof">${avatarHTML(h.name, null, (S.friends[h.uid] || {}).img || null)}<div class="fr-id"><strong>#${h.position} ${esc(h.name)}</strong><span class="fr-sub">${h.at ? new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</span></div></div>`).join('') || `<p class="fr-empty">Empty hall — be early.</p>`}</div>`;
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
        else if (currentTab === 'hall') renderHall(body);
        else renderActivity(body);
        pullEdges().then((ch) => {
            if (ch && document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
        });
        pullRequests().then((ch) => {
            if (ch && document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
        });
        pullInbox().then((ch) => {
            if (ch && document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab);
        });
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
                else if (item) { try { sendP2PDecline(item.from, item); } catch (_) {} ackInvite(item); }
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
        if (a === 'cat') { currentCat = el.dataset.cat || 'blitz'; open('ranking'); return; }
        if (a === 'copy-link') {
            const link = profileLink();
            if (!link) { notifyLocal('note', 'Sign in first', 'Guest accounts have no friend link — sign in and try again.'); open(currentTab); return; }
            copyText(link, el);
            return;
        }
        if (a === 'add') {
            if (S.pendingIn.some((p) => p.uid === uid)) acceptFriend(uid);
            else addFriend(uid, el.dataset.name, 'search', el.dataset.img || null);
            open(currentTab); return;
        }
        if (a === 'accept') { acceptFriend(uid); open(currentTab); return; }
        if (a === 'decline') { declineFriend(uid); open(currentTab); return; }
        if (a === 'remove') { removeFriend(uid); open(currentTab); return; }
        if (a === 'ack') {
            for (const m of S.inbox) m.read = true;
            save(); renderBell(); open(currentTab);
            try { if (apiBase() !== null) api('notify/ack', { ids: [] }).catch(() => {}); } catch (_) {}
            return;
        }
        if (a === 'play') {
            const f = getF(uid);
            // Dual delivery: the server inbox when an API is configured AND
            // a direct P2P dial to their inbox peer (works on the static
            // live site with no backend). Either one pops the same motion
            // card with Accept & play / Decline on their screen.
            const deliverInvite = (toUid, fr, code, cid) => {
                try { serverNotify(toUid, 'game-invite', `${meName()} invites you to play`, `${cid} game — tap Accept to join instantly.`, { code, control: cid, fromName: meName(), rating: myRating(cid), img: myAvatar() }); } catch (_) {}
                notifyLocal('note', `Invite sent to ${fr ? fr.name : 'friend'}`, `Waiting room ${code} is open — they get a motion popup with Accept & play.`);
                try {
                    sendP2PInvite(toUid, code, cid).then((ok) => {
                        if (ok) return; // the popup itself is the confirmation
                        try {
                            if (apiBase() !== null) notifyLocal('note', 'Direct popup unreachable', `They'll still get the invite on their next sync — or share code ${code} now.`);
                            else notifyLocal('note', `${fr ? fr.name : 'Friend'} looks offline`, `Share the 6-letter code ${code} or the invite link from the waiting room.`);
                        } catch (_) {}
                        try { if (document.getElementById('friends-screen')?.classList.contains('active')) open(currentTab); } catch (_) {}
                    });
                } catch (_) {}
            };
            try {
                if (window.app) {
                    if (!window.app._clerk?.user) { notifyLocal('note', 'Sign in to host', 'Guests join games — only members can host them.'); open(currentTab); return; }
                    // Reuse a live waiting room: spamming Invite must not
                    // orphan rooms (each new code kills the last host).
                    const cur = window.app.online;
                    if (cur && cur.phase === 'waiting' && cur.code && cur.net) {
                        deliverInvite(uid, f, cur.code, (cur.control && cur.control.id) || 'blitz');
                        return;
                    }
                    const hosted = window.app._onlineHost();
                    const after = () => {
                        try {
                            const s = window.app.online;
                            // Only a LIVE waiting room is invitable: a failed
                            // host (lobby phase, dead net) must never send a
                            // dead code (the old bug: s.code existed even on
                            // failure, so recipients joined a ghost room).
                            if (s && s.phase === 'waiting' && s.code && s.net && f) {
                                deliverInvite(uid, f, s.code, (s.control && s.control.id) || 'blitz');
                            } else {
                                notifyLocal('note', 'Could not open a game', 'Check your connection and try the invite again.');
                                try { open(currentTab); } catch (_) {}
                            }
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
        addFriend, acceptFriend, declineFriend, removeFriend, search, streakOf, versus,
        list: () => Object.values(S.friends),
        pendingIn: () => S.pendingIn.slice(),
        unread, inbox: () => S.inbox.slice(),
        tierOf, rankBoard, hallList,
        apiBase, pollNow: () => watchInbox(), pullRequests, pullEdges, pullInbox,
        checkInvitePopup, p2pEnsure: ensureP2PInbox, version: 3,
    };
})();
