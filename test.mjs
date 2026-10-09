// Development check: every session, every length from 10 minutes to 2 hours,
// every fitness level, against the grammar. Run with: node test.mjs
import { buildPlan, TYPES, LEVELS } from './plan.js';
import { validatePlan } from './grammar.js';

let plans = 0, failed = 0;
const seen = new Map();
for (const L of LEVELS) for (const t of TYPES) for (let m = 10; m <= 120; m += 5) {
  plans++;
  const errs = validatePlan(buildPlan(t.id, m * 60, L), t.id, m * 60, L);
  if (errs.length) {
    failed++;
    for (const e of errs) {
      const key = `${t.id}: ${e.replace(/#\d+ /, '').replace(/\d+s/g, 'Ns').replace(/rate \d+/g, 'rate N')}`;
      if (!seen.has(key)) seen.set(key, `${L} ${m} min — ${e}`);
    }
  }
}
for (const [k, v] of seen) console.log(`FAIL ${k}\n     e.g. ${v}`);
console.log(`${plans - failed}/${plans} plans follow the grammar`);
process.exit(failed ? 1 : 0);
