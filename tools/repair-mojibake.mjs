/**
 * Repair UTF-8 text that was decoded as Windows-1252 and re-encoded as UTF-8
 * (the classic `â€”` mojibake).
 *
 * Only the three clusters that this repository actually contains are mapped,
 * so a legitimate em dash or arrow elsewhere in the file is never touched.
 * Run: node tools/repair-mojibake.mjs [files...]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MAP = [
    ['\u00e2\u20ac\u201d', '\u2014'], // â€” -> —  em dash
    ['\u00e2\u201d\u20ac', '\u2192'], // â”€ -> →  right arrow
    ['\u00e2\u2022', '\u2022'],       // â•  -> •  bullet
];

const files = process.argv.slice(2);
if (!files.length) {
    console.error('usage: node tools/repair-mojibake.mjs <file> [...]');
    process.exit(2);
}

for (const f of files) {
    let s = readFileSync(f, 'utf8');
    const before = s;
    let total = 0;
    for (const [bad, good] of MAP) {
        const n = s.split(bad).length - 1;
        if (n) { s = s.split(bad).join(good); total += n; }
    }
    if (s !== before) {
        writeFileSync(f, s, 'utf8');
        console.log(`  repaired ${f} (${total} sequences)`);
    } else {
        console.log(`  clean    ${f}`);
    }
}