/**
 * online.js — Real online play for the static build.
 *
 * Adapts the online-chess-system-design playbook where no backend exists:
 *  - §3 Player: the Clerk user id is the stable player_id (guests play offline only).
 *  - §5.2/§6-D2: the HOST tab is the pinned single authority per game —
 *    it validates every move with the shared engine and owns both clocks.
 *    PeerJS public cloud is rendezvous-only; game traffic is direct WebRTC.
 *  - §4 wire protocol: ply-tagged moves (idempotent retries), full state
 *    snapshots on join/reconnect, resign, draw offer/accept/decline,
 *    ping/pong, game_over. Never accept a clock value from the peer.
 *  - §6-D3 clocks: host-owned lazy clocks (remaining + turn_started_at on
 *    the monotonic clock), one flag timer, ping-measured lag credit capped
 *    at 150ms, never raising remaining time.
 *  - §6-D4 ratings: Elo per time control, written idempotently per game_id
 *    (processed-game set = the UNIQUE constraint), served from a
 *    device-local board. No global board exists without a backend.
 *  - Parked per §2: spectators, chat, tournaments, anti-cheat.
 */

class OnlineNet {
    constructor(onEvent) {
        this.onEvent = onEvent; // (type, payload, conn) => void
        this.peer = null;
        this.conns = new Map(); // peerId -> DataConnection
    }

    static get available() { return typeof window.Peer !== 'undefined'; }

    // Lazy-load the vendored PeerJS (~85KB) only when online play is used,
    // so the course itself never pays for it. Same-origin, no SRI needed.
    static _loadP = null;
    static ensure() {
        if (typeof window.Peer !== 'undefined') return Promise.resolve(true);
        if (!OnlineNet._loadP) {
            OnlineNet._loadP = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'vendor/peerjs.min.js?v=28';
                s.async = true;
                s.onload = () => (typeof window.Peer !== 'undefined' ? resolve(true) : reject(new Error('peerjs unavailable')));
                s.onerror = () => reject(new Error('peerjs unavailable'));
                document.head.appendChild(s);
            }).catch((e) => { OnlineNet._loadP = null; throw e; });
        }
        return OnlineNet._loadP;
    }

    static makeCode() {
        const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let s = '';
        const rnd = new Uint32Array(6);
        (window.crypto || {}).getRandomValues ? crypto.getRandomValues(rnd) : rnd.map(() => Math.floor(Math.random() * 4294967296));
        for (let i = 0; i < 6; i++) s += abc[rnd[i] % abc.length];
        return s;
    }

    static normalizeCode(s) { return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
    static hostIdFor(code) { return 'ccg-' + code; }

    async host(code) {
        await OnlineNet.ensure();
        return new Promise((resolve, reject) => {
            this.destroy();
            let peer;
            try { peer = new window.Peer(OnlineNet.hostIdFor(code)); }
            catch (e) { reject(e); return; }
            this.peer = peer;
            const timer = setTimeout(() => reject(new Error('host-timeout')), 20000);
            peer.on('open', () => { clearTimeout(timer); resolve(); });
            peer.on('connection', (conn) => this._adopt(conn));
            peer.on('error', (e) => {
                if (e && (e.type === 'unavailable-id' || e.type === 'peer-unreachable')) {
                    clearTimeout(timer);
                    reject(new Error('taken'));
                }
            });
        });
    }

    async join(code) {
        await OnlineNet.ensure();
        return new Promise((resolve, reject) => {
            this.destroy();
            let peer;
            try { peer = new window.Peer('ccj-' + Math.random().toString(36).slice(2, 10)); }
            catch (e) { reject(e); return; }
            this.peer = peer;
            const timer = setTimeout(() => reject(new Error('join-timeout')), 10000);
            const openConn = () => {
                let conn;
                try { conn = peer.connect(OnlineNet.hostIdFor(code), { reliable: true }); }
                catch (e) { clearTimeout(timer); reject(e); return; }
                this._adopt(conn);
                conn.on('open', () => { clearTimeout(timer); resolve(conn); });
            };
            peer.on('open', openConn);
            peer.on('error', (e) => {
                if (e && e.type === 'peer-unreachable') { clearTimeout(timer); reject(new Error('not-found')); }
            });
        });
    }

    // Message allowlist: known types + expected field shapes only.
    // Anything else is dropped silently before it reaches the app.
    static validMessage(msg) {
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return false;
        const isStr = (v) => typeof v === 'string';
        const isNum = (v) => typeof v === 'number' && isFinite(v);
        const isBool = (v) => typeof v === 'boolean';
        const sq = (v) => isStr(v) && /^[a-h][1-8]$/.test(v);
        const promo = (v) => v === null || v === undefined || (isStr(v) && /^[QRBNqrbn]$/.test(v));
        const user = (v) => v === undefined || (v && typeof v === 'object');
        const ctrl = (v) => v === undefined || (v && typeof v === 'object' && (v.id === undefined || isStr(v.id)) && (v.base === undefined || isNum(v.base)) && (v.inc === undefined || isNum(v.inc)));
        switch (msg.type) {
            case 'hello': return isStr(msg.code) && user(msg.user) && (msg.rejoin === undefined || isBool(msg.rejoin)) && (msg.lastPly === undefined || isNum(msg.lastPly));
            case 'welcome': return isStr(msg.game_id) && (msg.color === 'white' || msg.color === 'black') && ctrl(msg.control) && user(msg.user) && (!msg.state || typeof msg.state === 'object');
            case 'move': return sq(msg.from) && sq(msg.to) && promo(msg.promo) && (msg.ply === undefined || isNum(msg.ply)) && (msg.mid === undefined || isStr(msg.mid));
            case 'state': return !msg.state || typeof msg.state === 'object';
            case 'clocks': return !msg.clocks || typeof msg.clocks === 'object';
            case 'profile': return user(msg.user);
            case 'rejected': return true;
            case 'game_over': return isStr(msg.result) && (msg.reason === undefined || isStr(msg.reason));
            case 'resign': case 'draw_offer': case 'draw_accept': case 'draw_decline':
            case 'rematch_want': case 'rematch_decline': case 'sync_request':
                return true;
            case 'rematch_accept': return ctrl(msg.control);
            case 'host_left': return true;
            case 'ping': case 'pong': return true;
            default: return false;
        }
    }

    _adopt(conn) {
        this.conns.set(conn.peer, conn);
        conn.on('data', (msg) => {
            if (!OnlineNet.validMessage(msg)) return;
            try { this.onEvent(msg.type, msg, conn); } catch (_) {}
        });
        const drop = () => {
            if (this.conns.get(conn.peer) === conn) this.conns.delete(conn.peer);
            try { this.onEvent('__closed', {}, conn); } catch (_) {}
        };
        conn.on('close', drop);
        conn.on('error', drop);
    }

    send(conn, msg) {
        try {
            if (conn && conn.open) { conn.send(msg); return true; }
        } catch (_) {}
        return false;
    }

    destroy() {
        try {
            this.conns.forEach((c) => { try { c.close(); } catch (_) {} });
            this.conns.clear();
            if (this.peer) { try { this.peer.destroy(); } catch (_) {} }
            this.peer = null;
        } catch (_) {}
    }
}

/* ── Ratings: Elo per time control, idempotent per game ──
   K is provisional: 40 for a category's first 10 games (visible early
   progress), 20 after. Guests (null uid) are never rated — online play
   requires sign-in, so guest games stay unrated by construction. */
const OnlineRatings = {
    START: 800,
    K_PROVISIONAL: 40,
    K_ESTABLISHED: 20,
    PROVISIONAL_GAMES: 10,
    K: 32,
    key(uid) { return 'ccr_' + (uid || 'anon'); },
    _read(uid) {
        try { const s = localStorage.getItem(this.key(uid)); if (s) return JSON.parse(s); } catch (_) {}
        return { cats: {}, processed: [] };
    },
    _write(uid, data) {
        try { localStorage.setItem(this.key(uid), JSON.stringify(data)); } catch (_) {}
    },
    get(uid, cat) {
        const d = this._read(uid);
        return (d.cats[cat] && d.cats[cat].rating) || this.START;
    },
    games(uid, cat) {
        const d = this._read(uid);
        return (d.cats[cat] && d.cats[cat].games) || 0;
    },
    // score: 1 win, 0.5 draw, 0 loss. Returns {delta, rating} or null if already applied.
    applyGame({ uid, cat, score, oppRating, gameId }) {
        if (!uid || !gameId) return null;
        const d = this._read(uid);
        d.processed = d.processed || [];
        if (d.processed.includes(gameId)) return null; // idempotent: same game twice = no-op
        const prev = d.cats[cat] || { rating: this.START, games: 0, w: 0, l: 0, d: 0, best: this.START };
        const opp = (typeof oppRating === 'number' && isFinite(oppRating)) ? oppRating : this.START;
        const K = (prev.games || 0) < this.PROVISIONAL_GAMES ? this.K_PROVISIONAL : this.K_ESTABLISHED;
        const expected = 1 / (1 + Math.pow(10, (opp - prev.rating) / 400));
        const next = Math.max(100, Math.round(prev.rating + K * (score - expected)));
        d.cats[cat] = {
            rating: next, games: (prev.games || 0) + 1,
            w: (prev.w || 0) + (score === 1 ? 1 : 0),
            l: (prev.l || 0) + (score === 0 ? 1 : 0),
            d: (prev.d || 0) + (score === 0.5 ? 1 : 0),
            best: Math.max(prev.best || next, next)
        };
        d.processed.push(gameId);
        if (d.processed.length > 200) d.processed = d.processed.slice(-200);
        this._write(uid, d);
        return { delta: next - prev.rating, rating: next };
    },
    record(uid, cat) {
        const d = this._read(uid);
        const raw = d.cats[cat] || {};
        const c = { rating: raw.rating || this.START, games: raw.games || 0, w: raw.w || 0, l: raw.l || 0, d: raw.d || 0, best: raw.best || raw.rating || this.START };
        const rate = c.games ? Math.round(((c.w + c.d * 0.5) / c.games) * 100) : null;
        return { ...c, winRate: rate };
    },
    histKey(uid) { return 'ccgh_' + (uid || 'anon'); },
    pushHistory(uid, rec) {
        if (!uid) return;
        let h = [];
        try { h = JSON.parse(localStorage.getItem(this.histKey(uid)) || '[]'); } catch (_) {}
        h.unshift({ ...rec, date: Date.now() });
        h = h.slice(0, 20);
        try { localStorage.setItem(this.histKey(uid), JSON.stringify(h)); } catch (_) {}
    },
    history(uid) {
        try { return JSON.parse(localStorage.getItem(this.histKey(uid)) || '[]'); } catch (_) { return []; }
    },
    // Device-local leaderboard: everyone this device has met + self.
    // Ratings are stored PER TIME CONTROL per player, so switching the
    // board's control never hides anyone — unplayed controls show "–".
    boardKey() { return 'ccr_board'; },
    notePlayer(uid, name, cat, rating) {
        if (!uid) return;
        let b = {};
        try { b = JSON.parse(localStorage.getItem(this.boardKey()) || '{}'); } catch (_) {}
        const prev = b[uid] || { cats: {} };
        const cats = { ...(prev.cats || {}) };
        // Migrate the legacy single-category shape ({cat, rating}).
        if (typeof prev.rating === 'number' && prev.cat) cats[prev.cat] = prev.rating;
        if (typeof rating === 'number') cats[cat] = rating;
        b[uid] = { name: name || prev.name || 'Player', cats, seen: Date.now() };
        delete b[uid].cat; delete b[uid].rating;
        try { localStorage.setItem(this.boardKey(), JSON.stringify(b)); } catch (_) {}
    },
    board(cat) {
        let b = {};
        try { b = JSON.parse(localStorage.getItem(this.boardKey()) || '{}'); } catch (_) {}
        return Object.entries(b)
            .filter(([, v]) => v && (v.cats || (typeof v.rating === 'number' && v.cat === cat)))
            .map(([uid, v]) => {
                const cats = { ...(v.cats || {}) };
                if (typeof v.rating === 'number' && v.cat) cats[v.cat] = v.rating;
                const r = cats[cat];
                return { uid, name: v.name || 'Player', rating: typeof r === 'number' ? r : null, seen: v.seen || 0 };
            })
            .sort((a, b2) => (b2.rating ?? -1) - (a.rating ?? -1))
            .slice(0, 50);
    }
};

/* ── Peer input validation (Phase 1 security) ──
   Everything arriving over WebRTC is untrusted. sanitizePeerUser() is the
   SINGLE place peer identity is cleaned: name becomes plain text
   (max 24 chars, no control chars), img must be https: (else null),
   rating a finite int 100-4000 (else START), id ^[\w-]{1,64}$ (else guest).
   Renderers must still escape (defense in depth). */
function sanitizePeerUser(u) {
    const clean = { id: 'guest', name: 'Friend', img: null, rating: (typeof OnlineRatings !== 'undefined' ? OnlineRatings.START : 800) };
    if (!u || typeof u !== 'object') return clean;
    if (typeof u.id === 'string' && /^[\w-]{1,64}$/.test(u.id)) clean.id = u.id;
    if (typeof u.name === 'string') {
        clean.name = u.name.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 24) || 'Friend';
    }
    if (typeof u.img === 'string' && /^https:/.test(u.img)) clean.img = u.img.slice(0, 2048);
    if (Number.isInteger(u.rating) && u.rating >= 100 && u.rating <= 4000) clean.rating = u.rating;
    return clean;
}

/* ── Durable session store (launch-to-scale §5: history as an event log) ──
   Append-only move log per game_id + portable clock snapshot, so a dead
   host tab can rebuild the session on re-host. Epochs per code give the
   fencing token (§4): a stale host's writes lose to a newer epoch. */
const OnlineStore = {
    _ls(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    _ss(key, val) { try { localStorage.setItem(key, val); } catch (_) {} },
    _rm(key) { try { localStorage.removeItem(key); } catch (_) {} },
    gameKey(gameId) { return 'ccg_' + gameId; },
    epochKey(code) { return 'cco_' + code; },
    saveGame(rec) {
        if (!rec || !rec.gameId) return;
        rec.updatedAt = Date.now();
        this._ss(this.gameKey(rec.gameId), JSON.stringify(rec));
        this._prune();
    },
    loadGame(gameId) {
        try { const s = this._ls(this.gameKey(gameId)); return s ? JSON.parse(s) : null; } catch (_) { return null; }
    },
    clearGame(gameId) { if (gameId) this._rm(this.gameKey(gameId)); },
    _prune() {
        // Keep the store bounded: newest 20 finished/unfinished games.
        try {
            const out = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf('ccg_g_') === 0) {
                    try { out.push({ k, t: JSON.parse(localStorage.getItem(k)).updatedAt || 0 }); } catch (_) {}
                }
            }
            out.sort((a, b) => b.t - a.t).slice(20).forEach(e => this._rm(e.k));
        } catch (_) {}
    },
    nextEpoch(code) {
        let e = 0;
        try { e = parseInt(this._ls(this.epochKey(code)) || '0', 10) || 0; } catch (_) {}
        e += 1;
        this._ss(this.epochKey(code), String(e));
        return e;
    },
    readEpoch(code) {
        try { return parseInt(this._ls(this.epochKey(code)) || '0', 10) || 0; } catch (_) { return 0; }
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { OnlineNet, OnlineRatings, OnlineStore };
