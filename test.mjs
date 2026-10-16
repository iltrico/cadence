// Development checks. Run with: node test.mjs
import fs from 'fs';
import { buildPlan, TYPES, LEVELS } from './plan.js';
import { validatePlan } from './grammar.js';
import * as storage from './storage.js';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log(`FAIL ${msg}`); } };

// 1. Every session, every length from 10 minutes to 2 hours, every fitness level, against the grammar.
let plans = 0, bad = 0;
const seen = new Map();
for (const L of LEVELS) for (const t of TYPES) for (let m = 10; m <= 120; m += 5) {
  plans++;
  const errs = validatePlan(buildPlan(t.id, m * 60, L), t.id, m * 60, L);
  if (errs.length) {
    bad++;
    for (const e of errs) {
      const key = `${t.id}: ${e.replace(/#\d+ /, '').replace(/\d+s/g, 'Ns').replace(/rate \d+/g, 'rate N')}`;
      if (!seen.has(key)) seen.set(key, `${L} ${m} min — ${e}`);
    }
  }
}
for (const [k, v] of seen) console.log(`FAIL ${k}\n     e.g. ${v}`);
failures += bad;
console.log(`${plans - bad}/${plans} plans follow the grammar`);

// 2. Storage: upgrades old data, keeps detail only for recent sessions, survives a full store.
const memStore = (limit = Infinity) => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (v.length > limit) throw new Error('QuotaExceededError'); m.set(k, v); }, _m: m };
};
const rec = (i) => ({ id: `s${i}`, startedAt: new Date(2026, 0, 1 + i).toISOString(), type: 'tempo', rowed: 1800,
  segments: Array.from({ length: 12 }, (_, k) => ({ name: 'Tempo', kind: 'steady', spm: 22, planned: 150, rowed: 150 + k })) });
{
  const s = memStore();
  s.setItem(storage.HISTORY_KEY, JSON.stringify([rec(1), rec(2)]));             // v1: a bare list
  check(storage.loadHistory(s).length === 2, 'v1 history is read');
  check(JSON.parse(s.getItem(storage.HISTORY_KEY)).v === storage.HISTORY_VERSION, 'v1 history is upgraded in place');
  s.setItem(storage.SETTINGS_KEY, JSON.stringify({ type: 'tempo', mode: 'distance', minutes: 45, meters: 6000, split: '2:10' }));
  const st = storage.loadSettings(s);
  check(st.type === 'tempo' && st.minutes === 45 && !('meters' in st), 'v1 settings are read without distance fields');
  storage.saveSettings(s, st);
  check(JSON.parse(s.getItem(storage.SETTINGS_KEY)).v === storage.SETTINGS_VERSION, 'settings are saved with a version');
}
{
  const s = memStore();
  for (let i = 0; i < 150; i++) storage.addSession(s, rec(i));
  const h = storage.loadHistory(s);
  check(h.length === 150, 'all sessions kept');
  check(h.slice(0, storage.DETAILED_SESSIONS).every((x) => x.segments) && h.slice(storage.DETAILED_SESSIONS).every((x) => !x.segments),
    'only recent sessions keep interval detail');
  storage.removeSession(s, 's149');
  check(storage.loadHistory(s).length === 149 && storage.loadHistory(s)[0].id === 's148', 'delete removes one session');
}
{
  const s = memStore(60000);                                                     // a nearly full store
  let ok = true;
  for (let i = 0; i < 120; i++) ok = storage.addSession(s, rec(i));
  check(ok && storage.loadHistory(s).length === 120, 'a full store still saves, with less detail');
}
check(storage.loadHistory(memStore()).length === 0, 'empty store reads as no history');
{ const s = memStore(); s.setItem(storage.HISTORY_KEY, '{not json'); check(storage.loadHistory(s).length === 0, 'corrupt history reads as empty'); }

// 3. The offline cache lists every file the app loads.
const sw = fs.readFileSync('sw.js', 'utf8');
const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
for (const f of shell) check(fs.existsSync(f), `cached file ${f} exists`);
const imports = new Set();
for (const f of ['app.js', 'plan.js', 'i18n.js', 'storage.js']) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/from '\.\/([^']+)'/g)) imports.add(m[1]);
}
imports.add('app.js');
for (const f of imports) check(shell.includes(f), `${f} is in the offline cache`);

console.log(failures ? `${failures} check(s) failed` : 'All checks pass');
process.exit(failures ? 1 : 0);
