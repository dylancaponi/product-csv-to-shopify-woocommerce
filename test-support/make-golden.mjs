// Regenerates golden/ from fixtures/. Only run after reviewing a diff of the
// output by hand: goldens are the reviewed, expected importer files.
// Run: node test-support/make-golden.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { convert } from '../index.js';
import { PAIRS } from './pairs.mjs';

for (const { fixture, to, options } of PAIRS) {
  const text = readFileSync(new URL(`../fixtures/${fixture}.csv`, import.meta.url), 'utf8');
  const r = convert(text, { to, ...options });
  writeFileSync(new URL(`../golden/${fixture}.to-${to}.csv`, import.meta.url), r.csv);
  writeFileSync(new URL(`../golden/${fixture}.to-${to}.issues.json`, import.meta.url), JSON.stringify(r.issues.map((i) => `${i.severity} ${i.code}`), null, 1) + '\n');
}
console.log(`wrote ${PAIRS.length} goldens`);
