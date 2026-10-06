// Unit tests for OnlineRatings (node, no browser).
// Run: node test-elo.js
global.localStorage = (() => {
    let store = {};
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; },
        key: (i) => Object.keys(store)[i],
        get length() { return Object.keys(store).length; }
    };
})();

const { OnlineRatings } = require('./online.js');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; /* console.log('ok -', msg); */ }
    else { fail++; console.log('FAIL -', msg, '\n  actual:   ' + a + '\n  expected: ' + e); }
}

// 1. Win vs equal rating, provisional K=40 -> +20
localStorage.clear();
eq(OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 1, oppRating: 800, gameId: 'g1' }), { delta: 20, rating: 820 }, 'provisional win +20');

// 2. Loss vs equal rating -> -20
localStorage.clear();
eq(OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 0, oppRating: 800, gameId: 'g1' }), { delta: -20, rating: 780 }, 'provisional loss -20');

// 3. Draw vs equal rating -> 0
localStorage.clear();
eq(OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 0.5, oppRating: 800, gameId: 'g1' }), { delta: 0, rating: 800 }, 'draw 0');

// 4. Repeated gameId is a no-op (idempotency)
localStorage.clear();
OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 1, oppRating: 800, gameId: 'g1' });
eq(OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 1, oppRating: 800, gameId: 'g1' }), null, 'duplicate gameId null');
eq(OnlineRatings.get('u1', 'blitz'), 820, 'rating unchanged by duplicate');

// 5. Guest (null uid) is never rated
localStorage.clear();
eq(OnlineRatings.applyGame({ uid: null, cat: 'blitz', score: 1, oppRating: 800, gameId: 'g1' }), null, 'guest null');
eq(OnlineRatings.applyGame({ uid: '', cat: 'blitz', score: 1, oppRating: 800, gameId: 'g1' }), null, 'empty uid null');

// 6. Undefined opponent rating falls back to START (800)
localStorage.clear();
eq(OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 1, gameId: 'g1' }), { delta: 20, rating: 820 }, 'undefined opp -> START');

// 7. Sequence of wins must strictly increase
localStorage.clear();
let r = 800, increasing = true;
for (let i = 0; i < 5; i++) {
    const out = OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 1, oppRating: 800, gameId: 'w' + i });
    if (!(out.rating > r)) increasing = false;
    r = out.rating;
}
eq(increasing, true, 'win streak increases, ends at ' + r);

// 8. K drops to 20 after 10 games: 11th win vs equal = +10
localStorage.clear();
for (let i = 0; i < 10; i++) OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 0.5, oppRating: 800, gameId: 'd' + i });
const r11 = OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 1, oppRating: OnlineRatings.get('u1', 'blitz'), gameId: 'e1' });
eq(r11.delta, 10, 'established win +10, got ' + (r11 && r11.delta));

// 9. Rating floor at 100
localStorage.clear();
for (let i = 0; i < 30; i++) OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 0, oppRating: 2000, gameId: 'f' + i });
eq(OnlineRatings.get('u1', 'blitz') >= 100, true, 'floor 100');

// 10. Record tally + win rate + best
localStorage.clear();
OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 1, oppRating: 800, gameId: 'g1' });
OnlineRatings.applyGame({ uid: 'u1', cat: 'blitz', score: 0, oppRating: 800, gameId: 'g2' });
const rec = OnlineRatings.record('u1', 'blitz');
eq({ w: rec.w, l: rec.l, d: rec.d, games: rec.games, winRate: rec.winRate }, { w: 1, l: 1, d: 0, games: 2, winRate: 50 }, 'tally 1-1-0, 50%');
eq(rec.best >= 820, true, 'best tracks peak (' + rec.best + ')');

// 11. Categories are independent
localStorage.clear();
OnlineRatings.applyGame({ uid: 'u1', cat: 'bullet', score: 1, oppRating: 800, gameId: 'g1' });
eq(OnlineRatings.get('u1', 'rapid'), 800, 'untouched category stays START');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
