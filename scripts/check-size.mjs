/**
 * Fails the build when the JavaScript a visitor downloads before the page can start goes over
 * the budget (master spec P-2, spec 09 PF-5): the entry script and everything it preloads,
 * gzipped. Lazy chunks (3D, admin, shop pages) don't count.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const BUDGET_KB = 200;
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const html = readFileSync(`${dist}index.html`, 'utf8');
const files = new Set(
  [...html.matchAll(/<(?:script[^>]*\bsrc|link[^>]*rel="modulepreload"[^>]*\bhref)="\/?([^"]+\.js)"/g)].map(
    (m) => m[1],
  ),
);
let total = 0;
const rows = [];
for (const f of files) {
  const size = gzipSync(readFileSync(`${dist}${f}`)).length;
  total += size;
  rows.push(`  ${(size / 1024).toFixed(1).padStart(7)} KB  ${f}`);
}
const kb = total / 1024;
console.log(`Initial JavaScript (gzipped): ${kb.toFixed(1)} KB of ${BUDGET_KB} KB\n${rows.join('\n')}`);
if (!files.size) {
  console.error('No entry script found in dist/index.html');
  process.exit(1);
}
if (kb > BUDGET_KB) {
  console.error(`Over the ${BUDGET_KB} KB budget by ${(kb - BUDGET_KB).toFixed(1)} KB (master spec P-2).`);
  process.exit(1);
}
