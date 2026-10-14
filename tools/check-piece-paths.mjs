/**
 * Guard: every piece path the source files build must point at a file that
 * actually exists. The artwork lives in SET folders
 * (assets/pieces/pieces-main, assets/pieces/pieces-second); a path without the
 * folder silently 404s. Run by `npm test`.
 */
import fs from 'node:fs';

const SOURCES = [
    'app.js', 'home.js', 'puzzles.js', 'study.js',
    'js/board.js', 'js/learn.js', 'js/learn.bundle.js', 'styles.css', 'js/pieces.js',
];
const DEFAULT_DIR = 'pieces-second';
// Matches assets/pieces/<literal or template> up to the end of the url.
const RE = /assets\/pieces\/[A-Za-z0-9_./-]+/g;

let checked = 0;
const missing = [];

for (const file of SOURCES) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    let m;
    RE.lastIndex = 0;
    while ((m = RE.exec(src))) {
        let p = m[0];
        if (p.endsWith('.svg')) {
            p = p.replace(/\$\{(?:set\.dir|k\.dir)\}/g, DEFAULT_DIR);
        } else {
            // A template continued past the match; assume the default dir.
            p = p.replace(/\/?$/, '/') + DEFAULT_DIR;
        }
        if (!p.endsWith('.svg') && !fs.existsSync(p) && !fs.existsSync(p + '/')) continue;
        checked++;
        if (!fs.existsSync(p)) missing.push(`${file} -> ${p}`);
    }
}

// The exact regression: a path that omits the set folder entirely.
for (const file of SOURCES) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const bad = src.match(/assets\/pieces\/(?:white|black)-[a-z]+\.svg/g);
    if (bad) missing.push(`${file} -> set folder omitted: ${[...new Set(bad)].join(', ')}`);
}

if (missing.length) {
    console.error('BROKEN piece paths:\n  ' + missing.join('\n  '));
    process.exit(1);
}
console.log(`piece paths checked: ${checked} — all resolve to a file on disk`);