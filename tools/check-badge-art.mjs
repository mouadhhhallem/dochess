/**
 * Guard: every achievement / rank artwork the code can request must exist.
 * A missing SVG is a silent 404 that only surfaces when a player reaches that
 * tier — exactly when the artwork matters most.
 */
import fs from 'node:fs';

const RANKS_DIR = 'assets/DoChess_SVGs/ranks';
const BADGES_DIR = 'assets/DoChess_SVGs/badges';
const SRC = 'achievements.js';

const src = fs.readFileSync(SRC, 'utf8');

/** Ids declared inside one top-level `const X = [ ... ];` block. */
function idsIn(constName) {
    const start = src.indexOf(`const ${constName} = [`);
    if (start < 0) throw new Error(`could not find ${constName} in ${SRC}`);
    // Walk braces/brackets from the opening '[' to its matching ']'.
    let depth = 0;
    for (let i = start + `const ${constName} `.length; i < src.length; i++) {
        const c = src[i];
        if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') {
            depth--;
            if (depth === 0) {
                return [...src.slice(start, i).matchAll(/\{\s*id:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
            }
        }
    }
    throw new Error(`unterminated ${constName} array`);
}

const rankIds = [...new Set(idsIn('RANKS'))];
const badgeIds = [...new Set(idsIn('BADGES'))];

const missing = [];
for (const id of rankIds) if (!fs.existsSync(`${RANKS_DIR}/rank-${id}.svg`)) missing.push(`rank-${id}.svg`);
for (const id of badgeIds) if (!fs.existsSync(`${BADGES_DIR}/badge-${id}.svg`)) missing.push(`badge-${id}.svg`);

if (missing.length) {
    console.error('MISSING achievement artwork:\n  ' + missing.join('\n  '));
    process.exit(1);
}
console.log(`achievement artwork: ${rankIds.length} tiers + ${badgeIds.length} badges — every file present`);