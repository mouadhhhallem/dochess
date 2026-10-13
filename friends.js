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
    // Identity switches (sign in/out) swap the shelf.
    let shelfUid = uidOf();
    setInterval(() => {
        const u = uidOf();
        if (u !== shelfUid) { shelfUid = u; S = load(); renderBell(); }
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
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 7000);
        try {
            const res = await fetch(`${base}/api/${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: ctrl.signal,
            });
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
                days: {}, best: 0, lastSeen: 0,
            };
        } else if (name) f.name = String(name).slice(0, 24);
        if (img) { const ci = cleanImg(img); if (ci) f.img = ci; }
        if (!S.pendingOut.includes(uid) && !f.confirmed) S.pendingOut.push(uid);
        save(); renderBell();
        try { if (apiBase() !== null) api('friends/add', { friendUid: uid, friendName: f.name, friendImg: f.img || null, myName: meName() }).catch(() => {}); } catch (_) {}
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
            const po = S.pendingOut.indexOf(uid);
            if (po >= 0) S.pendingOut.splice(po, 1);
        }
        save(); renderBell();
        try { if (apiBase() !== null) api('friends/add', { friendUid: uid, friendName: f ? f.name : '', friendImg: (f && f.img) || null, myName: meName() }).catch(() => {}); } catch (_) {}
        pullEdges();
        return f;
    }
    function declineFriend(uid) {
        S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
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
            if (!r || !Array.isArray(r.friends)) return;
            for (const e of r.friends) {
                if (!e || !e.uid || e.uid === uidOf()) continue;
                let f = S.friends[e.uid];
                if (!f) {
                    f = S.friends[e.uid] = { uid: e.uid, name: String(e.name || 'Player').slice(0, 24), since: e.since || Date.now(), confirmed: !!e.confirmed, source: 'server', days: {}, best: 0, lastSeen: 0 };
                } else if (e.confirmed && !f.confirmed) {
                    f.confirmed = true;
                    notifyLocal('friend-accept', `${f.name} is now your friend`, 'You can now grow a streak together — play a game today.');
                    changed = true;
                }
            }
            save(); renderBell();
            return changed;
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
            if (nf) nf.confirmed = true;
            notifyLocal('friend-accept', `${name || 'A player'} is now your friend`, 'Play a game together to start a streak.');
            save();
        }
    }

    /* ── directory + search (3-letter minimum) ──────────────── */
    function directory() {
        const map = new Map();
        for (const [uid, f] of Object.entries(S.friends)) map.set(uid, { uid, name: f.name, friend: true, rating: null, img: f.img || null });
        for (const p of S.pendingIn) if (!map.has(p.uid)) map.set(p.uid, { uid: p.uid, name: p.name, friend: false, rating: null, pending: true });
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
    async function pullInbox() {
        try {
            if (apiBase() === null) return false;
            const r = await api('notify');
            if (!r || !Array.isArray(r.items)) return false;
            const have = new Set(S.inbox.map((m) => m.id));
            let added = false;
            for (const m of r.items) {
                if (!m || !m.id || have.has(m.id)) continue;
                S.inbox.unshift({ id: m.id, kind: m.kind || 'note', title: String(m.title || '').slice(0, 60), body: String(m.body || '').slice(0, 140), from: m.from || null, at: m.at || Date.now(), read: !!m.read, local: false });
                added = true;
            }
            if (added) { S.inbox = S.inbox.slice(0, 50); save(); renderBell(); }
            return added;
            const unreadIds = S.inbox.filter((m) => !m.read && !m.local).map((m) => m.id);
            if (unreadIds.length) api('notify/ack', { ids: unreadIds }).catch(() => {});
            return false;
        } catch (_) { return false; }
    }

    /* ── presence ───────────────────────────────────────────── */
    let presenceCache = { at: 0, map: {} };
    async function heartbeat() {
        try {
            if (apiBase() === null || document.hidden) return;
            await api('presence', { name: meName() });
        } catch (_) {}
    }
    setInterval(heartbeat, 45000);

    /* ── rank + hall ────────────────────────────────────────── */
    const RATING_CATS = ['blitz', 'rapid', 'bullet'];
    function tierOf(rating) {
        if (rating >= 2000) return { name: 'Diamond', cls: 't-dia' };
        if (rating >= 1600) return { name: 'Platinum', cls: 't-pla' };
        if (rating >= 1200) return { name: 'Gold', cls: 't-gld' };
        if (rating >= 800) return { name: 'Silver', cls: 't-slv' };
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
        try {
            if (apiBase() !== null) {
                const friendUids = Object.keys(S.friends);
                const r = await api(`rank?cat=${encodeURIComponent(cat)}&friends=${encodeURIComponent(friendUids.join(','))}`);
                if (r && Array.isArray(r.board)) return { server: true, total: r.total || 0, myRank: r.myRank, board: r.board };
            }
        } catch (_) {}
        // Device board: everyone this device has met, friends named.
        try {
            if (typeof OnlineRatings !== 'undefined' && OnlineRatings.board) {
                const rows = OnlineRatings.board(cat);
                const board = rows.map((p, i) => {
                    const isMe = p.uid === uidOf();
                    const isFriend = !!S.friends[p.uid];
                    if (isMe || isFriend || p.uid === 'guest') return { rank: i + 1, uid: p.uid, name: isMe ? meName() + ' (you)' : p.name, rating: p.rating, self: isMe };
                    return { rank: i + 1, uid: null, name: null, rating: p.rating, self: false };
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
                ${online ? `<button class="btn-primary sm" data-faction="play" data-uid="${esc(f.uid)}" type="button">Invite to play</button>` : `<button class="btn-secondary sm" data-faction="nudge" data-uid="${esc(f.uid)}" type="button">Wake up</button>`}
                <button class="btn-secondary sm" data-faction="remove" data-uid="${esc(f.uid)}" type="button">Remove</button>
            </div>
        </article>`;
    }

    function renderFriends(box) {
        const rows = Object.values(S.friends).sort((a, b) => streakOf(b) - streakOf(a) || (b.lastSeen || 0) - (a.lastSeen || 0));
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
                const tag = p.pending ? 'requested' : (p.friend ? 'friend' : (p.fromServer ? 'DoChess' : 'met over the board'));
                return '<div class="fr-card mini">' + avatarHTML(p.name, null, p.img) + '<div class="fr-id"><strong>' + esc(p.name) + '</strong>'
                + '<span class="fr-sub">' + tag + (p.rating ? ' · ' + p.rating : '') + '</span></div>'
                + ((p.friend || p.uid === uidOf()) ? '' : '<button class="btn-secondary sm" data-faction="add" data-uid="' + esc(p.uid) + '" data-name="' + esc(p.name) + '" type="button">Add</button>') + '</div>';
            }).join('') + '</div>'
                : '<p class="fr-empty">Nobody by that name — yet. Share your invite link instead.</p>';
        };
        const serverMerge = async (q) => {
            try {
                if (apiBase() === null || q.trim().length < 3) return;
                const r = await api('directory?q=' + encodeURIComponent(q.trim()));
                if (!r || !Array.isArray(r.players) || !r.players.length) return;
                if (!document.body.contains(out) || input.value !== q) return;
                const have = new Set(search(q).rows.map((x) => x.uid));
                const extra = r.players.filter((p) => p && p.uid && !have.has(p.uid)).map((p) => ({ uid: p.uid, name: p.name, friend: !!S.friends[p.uid], rating: null, img: p.img || null, fromServer: true }));
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

    function podiumHTML(data) {
        const top = (data.board || []).slice(0, 3);
        if (top.length < 3) return '';
        const order = [[top[1], '2nd', 'p2'], [top[0], '1st', 'p1'], [top[2], '3rd', 'p3']];
        return '<div class="fr-podium">' + order.map(([r, place, cls]) => {
            const known = r.self || (r.uid && S.friends[r.uid]);
            const nm = (known && r.name) ? r.name : 'a quiet rival';
            const img = known ? (r.self ? myAvatar() : ((S.friends[r.uid] || {}).img || null)) : null;
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
        const me = myRating(currentCat);
        out.innerHTML = `
            <div class="fr-myrank">
                <span class="fr-bigrank">#${data.myRank != null ? data.myRank : '–'}</span>
                <div><strong>${esc(meName())}</strong><p>${data.total} rated players · ${currentCat} · you hold <strong>${me}</strong></p></div>
                ${tierChip(me)}
            </div>
            ${podiumHTML(data)}
            ${data.server ? '' : `<p class="lobby-hint">Device board — connect the API for the global ladder.</p>`}
            <div class="fr-board">${data.board.slice(0, 50).map((r) => `
                <div class="fr-brow${r.self ? ' me' : ''}">
                    <span class="fr-rank">${r.rank}</span>
                    ${r.name ? avatarHTML(r.name, null, r.self ? myAvatar() : ((S.friends[r.uid] || {}).img || null)) : `<span class="fr-ava ghost" aria-hidden="true">?</span>`}
                    <span class="fr-bname">${r.name ? esc(r.name) : 'a quiet rival'}</span>
                    ${r.rating != null ? tierChip(r.rating) : ''}
                    <span class="fr-brating">${r.rating != null ? r.rating : '–'}</span>
                </div>`).join('') || `<p class="fr-empty">No rated players yet — finish an online game to open the board.</p>`}</div>`;
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
            <div class="fr-feed">${items.length ? items.map((m) => `
                <div class="fr-note${m.read ? '' : ' new'}"><span class="fr-kind ${esc(m.kind)}">${esc(m.kind)}</span>
                <div><strong>${esc(m.title)}</strong><p>${esc(m.body)}</p><span class="fr-sub">${ago(m.at)}</span></div></div>`).join('')
                : `<p class="fr-empty">All quiet. Streak warnings, friend news, and game invites land here.</p>`}</div>`;
        // Reading the feed marks it read.
        let changed = false;
        for (const m of S.inbox) if (!m.read) { m.read = true; changed = true; }
        if (changed) { save(); renderBell(); }
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
            else addFriend(uid, el.dataset.name, 'search');
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
            try {
                if (window.app) {
                    if (!window.app._clerk?.user) { notifyLocal('note', 'Sign in to host', 'Guests join games — only members can host them.'); open(currentTab); return; }
                    window.app._onlineHost();
                    const f = getF(uid);
                    if (f) notifyLocal('note', `Room open for ${f.name}`, 'Send them your invite link from the Online screen.');
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
    setInterval(() => { try { warnStreaks(); } catch (_) {} }, 3600000);

    window.DoChessFriends = {
        open, renderBell, metPeer, onGameEnd, profileLink, inboundLink,
        addFriend, acceptFriend, removeFriend, search, streakOf, versus,
        list: () => Object.values(S.friends),
        unread, inbox: () => S.inbox.slice(),
        tierOf, rankBoard, hallList,
        apiBase, version: 1,
    };
})();
