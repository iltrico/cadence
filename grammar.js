// Grammar check for Cadence plans.
// Every rule here restates the grammar the planner is meant to follow, independently of
// how the planner builds a plan, so a planner change that breaks a rule fails loudly.
// Used by test.mjs during development; the app itself doesn't need it.

import { WORDS, TYPES, LEVELS, MODULE_TRANSITIONS, moduleOf, coachStep } from './plan.js';

const M = 60;
const range = (w, L) => { const r = WORDS[w].rate?.[L]; return Array.isArray(r) ? [Math.min(...r), Math.max(...r)] : [r, r]; };

// Words that make up each session's main set.
const MAIN = {
  steady: ['steady'], tempo: ['tempo', 'recover'], threshold: ['threshold', 'recover'], vo2: ['race', 'recover'],
  power: ['sprint', 'recover'], pyramid: ['race', 'threshold', 'recover'], ladder: ['rung', 'recover'], recovery: ['easy'],
};
const WARM_WORDS = ['pick', 'easy', 'build', 'firm', 'steady'];
const ROUND = 20; // seconds of rounding tolerance on limits

export function validatePlan(plan, id, T, L = 'recreational') {
  const errors = [];
  const fail = (msg, i) => errors.push(i === undefined ? msg : `#${i + 1} ${plan[i]?.word}: ${msg}`);
  const type = TYPES.find((t) => t.id === id);
  if (!type) return [`unknown session ${id}`];

  // 1. Adds up exactly.
  const total = plan.reduce((a, s) => a + s.dur, 0);
  if (total !== T) fail(`total ${total}s, expected ${T}s`);

  // 2. Only known words, each within its length limits.
  plan.forEach((s, i) => {
    const w = WORDS[s.word];
    if (!w) { fail('not a word', i); return; }
    if (w.len && (s.dur < w.len[0] - ROUND || s.dur > w.len[1] + ROUND)) fail(`${s.dur}s outside ${w.len[0]}–${w.len[1]}s`, i);
  });

  // 3. Exactly one Cool-down, and it's last.
  const cools = plan.filter((s) => s.word === 'cool').length;
  if (cools !== 1) fail(`${cools} cool-downs, expected 1`);
  if (plan[plan.length - 1]?.word !== 'cool') fail('does not end with Cool-down');

  // 4. No identical intervals side by side (same word and rate), except repeats.
  for (let i = 1; i < plan.length; i++) {
    const a = plan[i - 1], b = plan[i];
    if (a.word === b.word && a.spm === b.spm && !a.rep && !b.rep) fail('same as the interval before', i);
  }

  // 5. Phrases in order: warm-up words, then main-set words, then the cool-down.
  const mainWords = MAIN[id];
  let firstMain = id === 'recovery' ? 1 : plan.findIndex((s) => mainWords.includes(s.word) && s.word !== 'recover' && !(s.word === 'steady' && id !== 'steady'));
  if (id === 'steady') firstMain = plan.findIndex((s) => s.word === 'steady');
  if (firstMain < 0) { fail('no main set'); return errors; }
  plan.slice(0, firstMain).forEach((s, k) => { if (!WARM_WORDS.includes(s.word)) fail('not a warm-up word', k); });
  plan.slice(firstMain, -1).forEach((s, k) => { if (!mainWords.includes(s.word)) fail('not a main-set word', firstMain + k); });

  // 6. Warm-up: Pick drill first (except Recovery); Pick, Build and Firm rates only rise
  //    and never pass the main set's rate; Firm strokes only before hard sessions, followed by Easy.
  const warm = plan.slice(0, firstMain);
  if (id !== 'recovery' && warm[0]?.word !== 'pick') fail('warm-up does not start with Pick drill');
  const mainRate = plan[firstMain].spm;
  let last = 0;
  warm.forEach((s, k) => {
    if (!['pick', 'build', 'firm'].includes(s.word)) return;
    if (s.spm < last) fail(`warm-up rate drops to ${s.spm}`, k);
    if (s.spm > mainRate) fail(`warm-up rate ${s.spm} above main ${mainRate}`, k);
    last = s.spm;
  });
  warm.forEach((s, k) => {
    if (s.word !== 'firm') return;
    if (type.warm !== 'firm') fail('Firm strokes in a session that does not use them', k);
    if (warm[k + 1]?.word !== 'easy') fail('Firm strokes not followed by Easy', k);
  });
  if (type.warm === 'firm' && !warm.some((s) => s.word === 'firm')) fail('hard session without Firm strokes');
  if (warm.some((s, k) => s.word === 'easy' && warm[k - 1]?.word === 'pick')) fail('Easy right after Pick drill');

  // 7. Every effort except the last is followed by Recover.
  const work = ['threshold', 'race', 'sprint'];
  const main = plan.slice(firstMain, -1);
  const lastWork = main.map((s) => work.includes(s.word)).lastIndexOf(true);
  main.forEach((s, k) => {
    if (work.includes(s.word) && k < lastWork && main[k + 1]?.word !== 'recover') fail('effort not followed by Recover', firstMain + k);
  });

  // 8. Caps on hard work.
  const sumOf = (w) => main.filter((s) => s.word === w).reduce((a, s) => a + s.dur, 0);
  ['threshold', 'race', 'tempo'].forEach((w) => {
    if (WORDS[w].cap && sumOf(w) > WORDS[w].cap + ROUND) fail(`${sumOf(w)}s of ${w}, cap ${WORDS[w].cap}s`);
  });
  const sprints = main.filter((s) => s.word === 'sprint').length;
  if (sprints > WORDS.sprint.max) fail(`${sprints} sprints, cap ${WORDS.sprint.max}`);

  // 9. Rates within each word's range for the level.
  plan.forEach((s, i) => {
    const w = s.word;
    if (w === 'build') { if (s.spm < WORDS.build.from || (s.spm - WORDS.build.from) % WORDS.build.step) fail(`build rate ${s.spm}`, i); return; }
    if (w === 'rung') return;
    if (w === 'cool') { if (s.spm < 16 || s.spm > range('cool', L)[1]) fail(`cool-down rate ${s.spm}`, i); return; }
    const [a, b] = range(w, L);
    const eased = WORDS[w].ease && s.dur > WORDS[w].ease.after;
    const lowest = eased ? a - WORDS[w].ease.by : a;
    if (eased && s.spm !== lowest) fail(`rate ${s.spm}, expected ${lowest} on a piece over ${WORDS[w].ease.after}s`, i);
    if (w === 'firm' ? s.spm > b : (s.spm < lowest || s.spm > b)) fail(`rate ${s.spm} outside ${lowest}–${b}`, i);
  });

  // 10. Every change of display module has a designed transition.
  for (let i = 1; i < plan.length; i++) {
    const a = moduleOf(plan[i - 1].word), b = moduleOf(plan[i].word);
    if (a !== b && !MODULE_TRANSITIONS.includes(`${a}>${b}`)) fail(`no designed transition from ${a} to ${b}`, i);
  }

  // 12. Coach numbers: every piece and rest is a round length (whole minutes from 5 minutes,
  //     half minutes below, tens of seconds under a minute). Easy and the cool-down absorb leftovers.
  plan.forEach((s, i) => {
    if (s.word === 'cool' || s.word === 'easy') return;
    if (s.dur % coachStep(s.dur)) fail(`${s.dur}s is not a coach number`, i);
  });

  // 13. Rests follow their piece: the word's value, or its set break after every set.
  if (['tempo', 'threshold', 'vo2', 'power'].includes(id)) {
    main.forEach((s, k) => {
      const prev = main[k - 1];
      if (s.word !== 'recover' || !prev) return;
      const W = WORDS[prev.word];
      const setBreak = !!s.block;
      if (setBreak) {
        if (s.dur < W.setRecover[0] || s.dur > W.setRecover[1]) fail(`set break ${s.dur}s outside ${W.setRecover[0]}-${W.setRecover[1]}s`, firstMain + k);
        return;
      }
      const want = W.recover(prev.dur);
      if (s.dur !== want) fail(`rest ${s.dur}s, expected ${want}s after ${prev.dur}s ${prev.word}`, firstMain + k);
    });
  }

  // 14. Pyramid: one effort (one word, one rate) and one fixed rest throughout.
  if (id === 'pyramid') {
    const efforts = main.filter((s) => s.word !== 'recover'), rests = main.filter((s) => s.word === 'recover');
    if (new Set(efforts.map((s) => `${s.word}@${s.spm}`)).size !== 1) fail('pyramid mixes efforts');
    if (new Set(rests.map((s) => s.dur)).size > 1) fail('pyramid rests vary');
    if (rests.length && rests[0].dur !== Math.max(60, Math.floor(efforts[0].dur / 60) * 60)) fail('pyramid rest is not one step');
  }

  // 16. Rests between ladder climbs stay within their range.
  if (id === 'ladder') main.filter((s) => s.word === 'recover').forEach((s) => {
    const [a, b] = WORDS.rung.climbRest;
    if (s.dur < a || s.dur > b) fail(`rest between climbs ${s.dur}s outside ${a}-${b}s`);
  });

  // 15. Ladder: within a climb, the rate rises and each rung is shorter than the last (or all equal when short).
  if (id === 'ladder') {
    const climbs = [[]];
    main.forEach((s) => { if (s.word === 'recover') climbs.push([]); else climbs[climbs.length - 1].push(s); });
    climbs.forEach((c) => {
      for (let k = 1; k < c.length; k++) {
        if (c[k].spm <= c[k - 1].spm) fail('ladder rate does not rise');
        if (c[k].dur > c[k - 1].dur) fail('ladder rung longer than the one before');
      }
    });
  }


  return errors;
}

export { LEVELS };
