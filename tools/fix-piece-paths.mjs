/**
 * Repair the piece-path fallbacks.
 *
 * The artwork lives inside a SET folder (assets/pieces/pieces-main and
 * assets/pieces/pieces-second). Several fallback paths omitted the folder and
 * therefore could never resolve. These fallbacks only run when
 * `window.DoChessPieces` is missing, which is why the defect stayed hidden.
 *
 * Run from the repo root:  node tools/fix-piece-paths.mjs
 * (kept in the repo because it is the documented, repeatable form of the fix)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'pieces-second'; // must match DEFAULT_ID in js/pieces.js

const EDITS = [
    ['home.js',
        "`assets/pieces/${sq.color === 'w' ? 'white' : 'black'}-",
        "`assets/pieces/" + DIR + "/${sq.color === 'w' ? 'white' : 'black'}-"],
    ['puzzles.js',
        "`assets/pieces/${white ? 'white' : 'black'}-${kind}.svg?${assetV()}`",
        "`assets/pieces/" + DIR + "/${white ? 'white' : 'black'}-${kind}.svg?${assetV()}`"],
    ['study.js',
        "`assets/pieces/${white ? 'white' : 'black'}-${kind}.svg?${v}`",
        "`assets/pieces/" + DIR + "/${white ? 'white' : 'black'}-${kind}.svg?${v}`"],
    ['js/learn.js',
        "`assets/pieces/white-${PIECE_FILE[letter]}.svg?v24`",
        "`assets/pieces/" + DIR + "/white-${PIECE_FILE[letter]}.svg?v24`"],
    ['js/learn.js',
        "`assets/pieces/${p.color === 'w' ? 'white' : 'black'}-${PIECE_FILE[p.type]}.svg?v24`",
        "`assets/pieces/" + DIR + "/${p.color === 'w' ? 'white' : 'black'}-${PIECE_FILE[p.type]}.svg?v24`"],
];

let patched = 0;
for (const [file, from, to] of EDITS) {
    const src = readFileSync(file, 'utf8');       // Node decodes UTF-8 correctly
    if (!src.includes(from)) { console.log('  no match:', file, from.slice(0, 50)); continue; }
    writeFileSync(file, src.split(from).join(to), 'utf8'); // and re-encodes as UTF-8
    patched++;
    console.log('  patched', file);
}
console.log('patched call sites:', patched);
console.log('now run: npm run build   (regenerates js/learn.bundle.js)');