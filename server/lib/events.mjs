/**
 * server/lib/events.mjs — Server-Sent Events push on the existing server.
 *
 * No new infrastructure: plain node:http chunked responses, no packages.
 * Browsers hold one GET /api/events each with automatic reconnect; the
 * server fans out per-user JSON events (inbox arrivals, edge changes).
 * Auth rides a one-time ticket (EventSource cannot set headers):
 * POST /api/events/ticket (authed) -> GET /api/events?ticket= (consumed).
 * Everything else keeps polling as fallback — streams are enhancement.
 */
import { randomBytes } from 'node:crypto';

export function createBus() {
    const subs = new Map(); // uid -> Set<res>
    const tickets = new Map(); // ticket -> {uid, exp}

    function mintTicket(uid) {
        const t = randomBytes(16).toString('hex');
        tickets.set(t, { uid, exp: Date.now() + 60000 });
        if (tickets.size > 5000) {
            const now = Date.now();
            for (const [k, v] of tickets) if (v.exp < now) tickets.delete(k);
        }
        return t;
    }

    function claimTicket(t) {
        if (typeof t !== 'string' || !t) return null;
        const r = tickets.get(t);
        if (!r) return null;
        tickets.delete(t);
        if (r.exp < Date.now()) return null;
        return r.uid;
    }

    function subscribe(uid, res) {
        let set = subs.get(uid);
        if (!set) { set = new Set(); subs.set(uid, set); }
        set.add(res);
        const drop = () => {
            const s2 = subs.get(uid);
            if (s2) { s2.delete(res); if (!s2.size) subs.delete(uid); }
        };
        try {
            res.on('close', drop);
            res.on('finish', drop);
        } catch (_) {}
        return drop;
    }

    function publish(uid, event) {
        const set = subs.get(uid);
        if (!set || !set.size) return 0;
        let payload;
        try { payload = `data: ${JSON.stringify({ ...(event || {}), at: Date.now() })}\n\n`; }
        catch (_) { return 0; }
        let n = 0;
        for (const res of [...set]) {
            try { res.write(payload); n++; }
            catch (_) { try { set.delete(res); } catch (_) {} }
        }
        return n;
    }

    function sweep(now = Date.now()) {
        let ticketsOut = 0;
        for (const [k, v] of tickets) {
            if (v.exp < now) { tickets.delete(k); ticketsOut++; }
        }
        return { tickets: ticketsOut };
    }

    return { mintTicket, claimTicket, subscribe, publish, sweep, _subs: subs };
}
