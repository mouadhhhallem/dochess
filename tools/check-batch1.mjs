/**
 * tools/check-batch1.mjs — node verification for Batch 1.
 * Run:  node tools/check-batch1.mjs        (from the repo root)
 * Tests storage.js (mock backend), lessons.js schema, and engine validation
 * of data/lessons.json using the legacy rules engine as the adapter
 * (browser re-runs the same checks with chess.js via engine.js).
 * Exit code 0 = all green.
 */
import { readFileSync } from 'node:fs';
import {
    defaultState, isValidState, loadProgress, saveProgress,
    exportProgress, importProgress, resetProgress, touchDay, addXp,
    starsForPar, pointsFor,
    SCHEMA_VERSION, STORAGE_KEY,
} from '../js/storage.js';
import {
    validateSchema, validateEngine, starsForAttempt, CURRICULUM_VERSION,
} from '../js/lessons.js';
import { legacyAdapter as adapter } from './legacy-adapter.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

// ── mock backend ──
const mock = () => {
    const m = new Map();
    return { blocked: false, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), del: (k) => m.delete(k), _map: m };
};

// ── storage tests ──
{
    const b = mock();
    const { state } = loadProgress(b);
    ok('storage: blank default on empty', state.version === SCHEMA_VERSION && state.xp === 0);
    state.stars['s1-rook'] = 3;
    ok('storage: save+reload round-trip', saveProgress(state, b) && loadProgress(b).state.stars['s1-rook'] === 3);
    b.set(STORAGE_KEY, '{corrupt json');
    ok('storage: corrupt falls back to default', loadProgress(b).state.stars['s1-rook'] === undefined);
    b.set(STORAGE_KEY, JSON.stringify({ version: 999, stars: {} }));
    ok('storage: wrong version rejected', !isValidState(JSON.parse(b.get(STORAGE_KEY))) && loadProgress(b).state.version === SCHEMA_VERSION);
    const b2 = mock();
    b2.set('ccp_v4', JSON.stringify({ done: [1, 2, 3] }));
    ok('storage: legacy v4 preserved', JSON.stringify(loadProgress(b2).state.legacy.v4done) === '[1,2,3]');
    const st = defaultState();
    ok('storage: export/import round-trip', importProgress(exportProgress(st)).ok === true);
    ok('storage: import refuses garbage', importProgress('nope').ok === false && importProgress('{"version":1}').ok === false);
    const st2 = defaultState(); st2.stars['x'] = 3;
    saveProgress(st2, b); const rst = resetProgress(b);
    ok('storage: reset clears stars, keeps settings', rst.stars['x'] === undefined && rst.settings.theme === 'night');
    const st3 = defaultState();
    touchDay(st3, '2026-10-01'); touchDay(st3, '2026-10-02'); touchDay(st3, '2026-10-02');
    ok('storage: streak 2 across consecutive days', st3.streak.count === 2 && st3.heatmap['2026-10-02'] === 2);
    touchDay(st3, '2026-10-05');
    ok('storage: streak resets after gap', st3.streak.count === 1);
    const st4 = defaultState();
    ok('storage: xp level math', addXp(st4, 150).level === 2 && addXp(st4, 0).level === 2);
}
ok('storage: par stars 3/par/par+2/rest',
    starsForPar(4, 4) === 3 && starsForPar(6, 4) === 2 && starsForPar(7, 4) === 1);
ok('storage: points 100 - 10/extra - 15/hint, floored',
    pointsFor({ moves: 4, par: 4, hintsUsed: 0 }) === 100 &&
    pointsFor({ moves: 6, par: 4, hintsUsed: 1 }) === 65 &&
    pointsFor({ moves: 99, par: 4, hintsUsed: 9 }) === 0);
ok('storage: stars rule 3/2/1/0 (single-move tactics)',
    starsForAttempt({ solved: true, tries: 1, hintsUsed: 0 }) === 3 &&
    starsForAttempt({ solved: true, tries: 2, hintsUsed: 1 }) === 2 &&
    starsForAttempt({ solved: true, tries: 9, hintsUsed: 9 }) === 1 &&
    starsForAttempt({ solved: false, tries: 1, hintsUsed: 0 }) === 0);

// ── curriculum checks ──
const data = JSON.parse(readFileSync(new URL('../data/lessons.json', import.meta.url), 'utf8'));
ok('lessons: file version matches code', data.version === CURRICULUM_VERSION);
const schema = validateSchema(data);
ok('lessons: schema 0 errors', schema.errors.length === 0, JSON.stringify(schema.errors.slice(0, 3)));
console.log(`     schema warnings (missing fr/ar fall back to en): ${schema.warnings.length}`);
const eng = validateEngine(data, adapter);
for (const r of eng) ok(`engine: ${r.id} [${r.type}]`, r.status !== 'fail', r.status === 'fail' ? r.detail : `(${r.status}: ${r.detail})`);
console.log('\n── BFS par table ──');
for (const r of eng) console.log(`  ${r.id}: ${r.detail}`);

// ── schema-example mate-in-1 (Re1-e8) — version-2 shape with sets[] ──
const EXAMPLE_MATE = {
    id: 'schema-example-mate-in-1', stage: 2, set: 'ex-mate', themes: ['mate', 'back-rank'],
    type: 'mate-in-n', title: 't', goal: 'g', explain: 'e', success: 's', failHint: 'f',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    solution: { moves: ['e1e8'], mateIn: 1 },
    hints: ['h1', 'h2', 'h3'], xp: 20,
};
{
    const { errors } = validateSchema({
        version: CURRICULUM_VERSION, stages: [{ n: 2 }],
        sets: [{ id: 'ex-mate', stage: 2, title: 't' }], levels: [EXAMPLE_MATE],
    });
    ok('example mate: schema clean', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    const [r] = validateEngine({ levels: [EXAMPLE_MATE] }, adapter);
    ok('example mate: Re1-e8 mates, unique as listed', r.status === 'pass', r.detail);
}

// ── goal.check / goal.mate / goal.stalemate (free-move opponent-state goals) ──
{
    const mk = (over) => ({
        id: 'g-' + (over.goal.mate ? 'mate' : over.goal.stalemate ? 'stale' : 'check'),
        stage: 3, set: 'ex', themes: ['t'], mode: 'free-move', type: 'free-move',
        title: 't', goalText: 'g', explain: 'e', success: 's', failHint: 'f',
        hints: ['h1', 'h2', 'h3'], xp: 10, par: 1, ...over,
    });
    const checkLv = mk({ goal: { check: true }, fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', movePieces: ['r'] });
    const mateLv = mk({ goal: { mate: true }, fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', movePieces: ['r'] });
    const staleLv = mk({ goal: { stalemate: true }, fen: '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', movePieces: ['q'] });
    const { errors } = validateSchema({
        version: CURRICULUM_VERSION, stages: [{ n: 3 }],
        sets: [{ id: 'ex', stage: 3, title: 't' }], levels: [checkLv, mateLv, staleLv],
    });
    ok('goal flags: schema clean', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    for (const lv of [checkLv, mateLv, staleLv]) {
        const [r] = validateEngine({ levels: [lv] }, adapter);
        ok(`goal flag: ${lv.id} par 1`, r.status === 'pass', r.detail);
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
