/**
 * tools/build-learn.mjs — bundle the Learn curriculum into a classic script.
 *
 *   node tools/build-learn.mjs            write js/learn.bundle.js
 *   node tools/build-learn.mjs --check    fail if the bundle is stale
 *
 * WHY: the site is meant to run from file:// (double-click index.html) and
 * from http behind the strict meta-CSP in index.html. Both broke the raw ESM
 * build: file:// blocks module imports (CORS, origin "null") and the CSP
 * (`script-src 'self'`) blocks inline <script type="module"> — so bootLearn()
 * never ran and no level ever rendered. One external classic script is
 * allowed in both worlds, so the ESM sources are compiled down to it here.
 *
 * The transform is deliberately small and validated: every import/export in
 * js/*.js must be a plain top-level form (anything else throws), the output
 * must parse, and --check keeps the committed bundle in sync with the source.
 * data/lessons.json is inlined so no fetch() is needed at runtime either.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'js', 'learn.bundle.js');

// Dependency order: each module only requires ones listed before it.
const MODULES = [
    ['storage', 'js/storage.js'],
    ['lessons', 'js/lessons.js'],
    ['engine', 'js/engine.js'],
    ['board', 'js/board.js'],
    ['learn', 'js/learn.js'],
];

const IMPORT_RE = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const KEYWORD_RE = /^[ \t]*(?:import|export)\s/m;

/** Compile one ESM source into a factory body. Returns {code, exports}. */
function transform(id, file, src) {
    const exported = []; // [exportedName, localName]
    const note = (msg) => `${file}: ${msg}`;

    let code = src.replace(IMPORT_RE, (_m, names, spec) => {
        const dep = path.basename(spec).replace(/\.js$/, '');
        if (!MODULES.some(([mid]) => mid === dep)) throw new Error(note(`imports unknown module "${spec}"`));
        return `const {${names}} = __req(${JSON.stringify(dep)});`;
    });

    const push = (exp, local) => exported.push([exp, local]);

    code = code.replace(/^([ \t]*)export\s+async\s+function\s+([A-Za-z_$][\w$]*)/gm,
        (_m, w, n) => { push(n, n); return `${w}async function ${n}`; });
    code = code.replace(/^([ \t]*)export\s+function\s+([A-Za-z_$][\w$]*)/gm,
        (_m, w, n) => { push(n, n); return `${w}function ${n}`; });
    code = code.replace(/^([ \t]*)export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
        (_m, w, kind, n) => { push(n, n); return `${w}${kind} ${n}`; });
    code = code.replace(/^([ \t]*)export\s*\{([^}]*)\};?[ \t]*$/gm,
        (_m, w, names) => {
            for (const part of names.split(',')) {
                const t = part.trim();
                if (!t) continue;
                const [local, alias] = t.split(/\s+as\s+/).map((s) => s.trim());
                push(alias || local, local);
            }
            return '';
        });

    const leftover = code.match(KEYWORD_RE);
    if (leftover) {
        const at = code.slice(0, leftover.index).split('\n').length;
        throw new Error(note(`unsupported import/export at line ${at}: ${leftover[0].trim()}`));
    }
    if (!exported.length) throw new Error(note('exports nothing — wrong module list?'));
    if (id === 'learn' && !exported.some(([e]) => e === 'bootLearn')) {
        throw new Error(note('must export bootLearn'));
    }

    // Duplicate export names would silently clobber each other.
    const seen = new Set();
    for (const [exp] of exported) {
        if (seen.has(exp)) throw new Error(note(`duplicate export "${exp}"`));
        seen.add(exp);
    }

    const assigns = exported.map(([exp, local]) => `__exports.${exp} = ${local};`).join('\n');
    return `__def(${JSON.stringify(id)}, function () {\nconst __exports = {};\n${code}\n${assigns}\nreturn __exports;\n});`;
}

function build() {
    const dataRaw = readFileSync(path.join(ROOT, 'data', 'lessons.json'), 'utf8');
    const data = JSON.parse(dataRaw);
    if (!Array.isArray(data.levels) || !data.levels.length) {
        throw new Error('data/lessons.json has no levels[]');
    }

    const parts = [];
    parts.push(`/* GENERATED FILE — do not edit.
 * js/learn.bundle.js — Learn curriculum + level runtime as one classic script.
 * Source: js/{storage,lessons,engine,board,learn}.js + data/lessons.json
 * Rebuild: node tools/build-learn.mjs      Verify: node tools/build-learn.mjs --check
 * Classic (non-module) on purpose: runs from file:// and inside the meta-CSP. */
(function (global) {
'use strict';

const __mods = Object.create(null);
function __def(id, factory) { __mods[id] = { factory: factory, exports: null, inited: false }; }
function __req(id) {
    const m = __mods[id];
    if (!m) throw new Error('learn bundle: missing module "' + id + '"');
    if (!m.inited) { m.inited = true; m.exports = m.factory(); }
    return m.exports;
}

/* Curriculum inlined: file:// has no fetch(), and it removes a network round-trip. */
global.__DOCHESS_LESSONS__ = ${JSON.stringify(data)};
`);

    for (const [id, file] of MODULES) {
        const src = readFileSync(path.join(ROOT, file), 'utf8');
        parts.push(`\n/* ── ${file} ─────────────────────────────────────────────── */`);
        parts.push(transform(id, file, src));
    }

    parts.push(`
/* ── boot ──────────────────────────────────────────────────────────── */
const __learn = __req('learn');
global.DoChessLearn = {
    bootLearn: __learn.bootLearn,
    showLearn: __learn.showLearn,
    curriculum: global.__DOCHESS_LESSONS__,
    // Public surface for the browser console / harnesses (tests-batch1.html):
    // console.runAllTests(DoChessLearn.curriculum, ChessJsAdapter(Chess))
    storage: __req('storage'),
    lessons: __req('lessons'),
    engine: __req('engine'),
    board: __req('board'),
};
function __boot() {
    const p = __learn.bootLearn();
    if (p && typeof p.catch === 'function') {
        p.catch(function (e) { console.error('[DoChess] Learn failed to boot:', e); });
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __boot, { once: true });
} else {
    __boot();
}
})(typeof window !== 'undefined' ? window : this);
`);

    const out = parts.join('\n');
    // Syntax check before anything touches disk.
    new Function(out);
    return out;
}

const code = build();
if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(OUT, 'utf8'); } catch (_) { /* missing */ }
    if (current !== code) {
        console.error('STALE js/learn.bundle.js — run: node tools/build-learn.mjs');
        process.exit(1);
    }
    console.log('learn bundle up to date');
} else {
    writeFileSync(OUT, code);
    console.log(`wrote js/learn.bundle.js (${(code.length / 1024).toFixed(1)} KB)`);
}
