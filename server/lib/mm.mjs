/**
 * server/lib/mm.mjs — ELO matchmaking queue (quick match).
 *
 * Testing mode by design: the queue pairs the CLOSEST-ELO waiter in the
 * same time-control category, but there is NO distance gate — a far
 * opponent beats no opponent, and the gap is reported (not refused).
 *
 * Pure logic, no I/O: waiters and matches live in memory (single process
 * is enough to start, same as the rate-limit fallback). Tickets are
 * 128-bit capability secrets; polling proves nothing else.
 *
 *   join({uid, name, elo, cat}) -> {ticket} | {ticket, matched}
 *   poll(ticket) -> waiting | matched | expired | gone
 *   leave(ticket) -> true
 *   sweep(now) -> removes stale waiters (>waiterTtlMs) and matches
 *     (>matchTtlMs); a match dies only after BOTH sides ack or TTL.
 */
import { randomBytes } from 'node:crypto';

export const MM_START_ELO = 800;
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function cleanName(v) {
    if (typeof v !== 'string') return 'Player';
    return v.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 24) || 'Player';
}

function cleanCat(v) {
    if (typeof v === 'string' && /^[a-z0-9-]{1,16}$/.test(v)) return v;
    return 'blitz';
}

function cleanElo(v) {
    const n = typeof v === 'number' ? Math.round(v) : parseInt(v, 10);
    if (!Number.isFinite(n)) return MM_START_ELO;
    return Math.max(100, Math.min(4000, n));
}

function cleanUid(v) {
    if (typeof v === 'string' && /^[\w-]{1,64}$/.test(v)) return v;
    return 'guest';
}

function makeTicket() {
    return randomBytes(16).toString('hex');
}

function makeCode() {
    const b = randomBytes(6);
    let s = '';
    for (let i = 0; i < 6; i++) s += ABC[b[i] % ABC.length];
    return s;
}

export function createMatcher({ waiterTtlMs = 120000, matchTtlMs = 180000 } = {}) {
    const waiters = new Map(); // ticket -> {ticket, uid, name, elo, cat, joinedAt, lastPoll}
    const matches = new Map(); // id -> {id, code, cat, a, b, createdAt, ack:Set}

    function findPartner(forW) {
        let best = null;
        for (const w of waiters.values()) {
            if (w.ticket === forW.ticket || w.cat !== forW.cat) continue;
            const gap = Math.abs(w.elo - forW.elo);
            if (!best || gap < best.gap || (gap === best.gap && w.joinedAt < best.w.joinedAt)) {
                best = { w, gap };
            }
        }
        return best;
    }

    function pair(a, b) {
        // The longer-waiting side hosts (warm tab opens the room first).
        const [host, join] = a.joinedAt <= b.joinedAt ? [a, b] : [b, a];
        const id = makeTicket();
        const m = {
            id,
            code: makeCode(),
            cat: a.cat,
            a: { ticket: host.ticket, role: 'host', opp: { name: join.name, elo: join.elo, uid: join.uid } },
            b: { ticket: join.ticket, role: 'join', opp: { name: host.name, elo: host.elo, uid: host.uid } },
            gap: Math.abs(a.elo - b.elo),
            createdAt: Date.now(),
            ack: new Set(),
        };
        waiters.delete(a.ticket);
        waiters.delete(b.ticket);
        matches.set(id, m);
        return m;
    }

    function matchedView(m, ticket) {
        const side = m.a.ticket === ticket ? m.a : m.b;
        return { status: 'matched', code: m.code, role: side.role, opp: side.opp, cat: m.cat, gap: m.gap };
    }

    function join(who = {}) {
        const w = {
            ticket: makeTicket(),
            uid: cleanUid(who.uid),
            name: cleanName(who.name),
            elo: cleanElo(who.elo),
            cat: cleanCat(who.cat),
            joinedAt: Date.now(),
            lastPoll: Date.now(),
        };
        const partner = findPartner(w);
        if (!partner) {
            waiters.set(w.ticket, w);
            return { ticket: w.ticket };
        }
        const m = pair(partner.w, w);
        m.ack.add(w.ticket); // joiner-with-a-match already knows
        return { ticket: w.ticket, matched: matchedView(m, w.ticket) };
    }

    function poll(ticket) {
        if (typeof ticket !== 'string' || !ticket) return { status: 'gone' };
        const w = waiters.get(ticket);
        if (w) {
            w.lastPoll = Date.now();
            let position = 1, minGap = null;
            const ordered = [...waiters.values()]
                .filter((x) => x.cat === w.cat)
                .sort((x, y) => x.joinedAt - y.joinedAt);
            position = ordered.findIndex((x) => x.ticket === ticket) + 1;
            for (const x of ordered) {
                if (x.ticket === ticket) continue;
                const gap = Math.abs(x.elo - w.elo);
                if (minGap === null || gap < minGap) minGap = gap;
            }
            return { status: 'waiting', position, waiters: ordered.length, minGap };
        }
        for (const m of matches.values()) {
            if (m.a.ticket === ticket || m.b.ticket === ticket) {
                m.ack.add(ticket);
                const view = matchedView(m, ticket);
                if (m.ack.size >= 2) matches.delete(m.id);
                return view;
            }
        }
        return { status: 'gone' };
    }

    function leave(ticket) {
        if (typeof ticket !== 'string' || !ticket) return false;
        if (waiters.delete(ticket)) return true;
        for (const [id, m] of matches) {
            if (m.a.ticket === ticket || m.b.ticket === ticket) {
                // Partner still gets their matched view until TTL; the
                // leaver just stops polling. Drop only when both gone.
                m.ack.add(ticket + ':left');
                return true;
            }
        }
        return false;
    }

    function sweep(now = Date.now()) {
        let waitersOut = 0, matchesOut = 0;
        for (const [t, w] of waiters) {
            if (now - Math.max(w.joinedAt, w.lastPoll) > waiterTtlMs) { waiters.delete(t); waitersOut++; }
        }
        for (const [id, m] of matches) {
            if (now - m.createdAt > matchTtlMs) { matches.delete(id); matchesOut++; }
        }
        return { waiters: waitersOut, matches: matchesOut };
    }

    return { join, poll, leave, sweep, _waiters: waiters, _matches: matches };
}
