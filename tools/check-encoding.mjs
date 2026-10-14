import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Detect classic UTF-8-read-as-cp1252/latin1 mojibake in tracked text files.
// These tools contain the mojibake sequences as DATA (they detect or repair
// them), so they are excluded from the scan on purpose.
const EXEMPT = new Set(['tools/check-encoding.mjs', 'tools/repair-mojibake.mjs']);

const files = execSync('git ls-files', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((f) => /\.(js|mjs|css|html|md|json|txt)$/.test(f) && fs.existsSync(f) && !EXEMPT.has(f.replace(/\\/g, '/')));

const SUSPECT = /[\u00c2\u00a2][\u0080-\u00bf\u2018\u2019\u201c\u201d\u20ac\u2013\u2014\u2022\u2026]|â˜|â€|\u00e2\u0080/g;
const bad = [];
for (const f of files) {
    const b = fs.readFileSync(f);
    const s = b.toString('utf8');
    const bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
    const m = s.match(new RegExp(SUSPECT.source, 'g'));
    if (bom || m) bad.push({ f, bom, n: m ? m.length : 0, sample: m ? [...new Set(m)].slice(0, 3).join('') : '' });
}
if (!bad.length) { console.log('no mojibake / BOM in tracked text files'); process.exit(0); }
console.log('MOJIBAKE / BOM found:');
for (const x of bad) console.log(`  ${x.f}  bom=${x.bom}  hits=${x.n}  ${x.sample}`);
process.exit(1);