// Outcome checks. Plans are measured as they would be rowed (minutes per word, rests,
// structure) and judged against the principle table. Nothing here reads the planner's
// targets, only its plans, so a plan passes only if it really meets the principles.

import { TYPES, LENGTH, growth, coachStep, fmt } from './plan.js';
import { byId } from './principles.js';

const M = 60;
const WARM = ['pick', 'easy', 'build', 'firm'];
const HARD = ['tempo', 'threshold', 'race', 'sprint', 'rung'];

// Split a plan into warm-up, main set and cool-down.
export function parts(plan, type) {
  let i = 0;
  if (type.shape === 'block') return { warm: plan.slice(0, plan.length - 2), main: plan.slice(-2, -1), cool: plan.slice(-1) };
  while (i < plan.length && WARM.includes(plan[i].word)) i++;
  return { warm: plan.slice(0, i), main: plan.slice(i, -1), cool: plan.slice(-1) };
}

const total = (segs) => segs.reduce((a, s) => a + s.dur, 0);
const weight = (s) => { const w = byId.P9.threshold.weights[s.word]; return typeof w === 'object' ? w[s.spm] || 3 : w; };

export function measure(plan, type, T) {
  const { warm, main, cool } = parts(plan, type);
  const work = main.filter((s) => s.word !== 'recover'), rests = main.filter((s) => s.word === 'recover');
  const workT = total(work), restT = total(rests);
  return {
    T, hard: total(plan.filter((s) => HARD.includes(s.word))) / M,
    identity: total(main) / T, restPerWork: workT ? restT / workT : 0,
    load: Math.round(plan.reduce((a, s) => a + (s.dur / M) * weight(s), 0)),
    warm: total(warm), cool: total(cool), pieces: work.map((s) => s.dur), work, main,
  };
}

// Run every principle on every session and length. Returns failures and per-plan notes.
export function coachCheck(buildPlan, level = 'recreational') {
  const fails = [], rows = [];
  for (const type of TYPES) {
    let prevHard = -1;
    for (let m = LENGTH.min; m <= LENGTH.max; m += LENGTH.step) {
      const T = m * M, plan = buildPlan(type.id, T, level), x = measure(plan, type, T);
      const notes = [];
      const fail = (id, msg) => { fails.push(`${id} ${type.id} ${m} min: ${msg}`); notes.push(`${id} fail`); };
      // P1 Range
      if (m < byId.P1.threshold.min || m > byId.P1.threshold.max) fail('P1', 'outside the range');
      // P2 Shape
      const p = x.pieces;
      if (type.shape === 'equal' && p.length) {
        const lo = Math.min(...p), hi = Math.max(...p);
        if (hi > lo + coachStep(lo)) fail('P2', `pieces differ by more than one step (${fmt(lo)} to ${fmt(hi)})`);
      }
      if (type.shape === 'pyramid') {
        const L = (p.length + 1) / 2;
        if (p.some((v, i) => v !== p[p.length - 1 - i])) fail('P2', 'pyramid is not symmetric');
        if (p.slice(0, L).some((v, i) => i && v <= p[i - 1])) fail('P2', 'pyramid does not rise to its peak');
      }
      if (type.shape === 'ladder') {
        for (let i = 1; i < x.work.length; i++) {
          const a = x.work[i - 1], b = x.work[i];
          if (b.spm > a.spm && b.dur >= a.dur) fail('P2', 'ladder rung not shorter than the one below');
        }
      }
      // P3 Growth: the main set is one of the session's growth states
      if (type.shape !== 'block') {
        const key = p.join(',');
        if (!growth(type.id).some((g) => g.pieces.join(',') === key)) fail('P3', 'main set is not a step of the growth');
      }
      // P4 Dose
      if (x.hard < prevHard) fail('P4', `hard minutes drop from ${prevHard} to ${x.hard}`);
      prevHard = x.hard;
      // P6 Frame
      if (x.warm > byId.P6.threshold.warmMax * M) fail('P6', `warm-up ${fmt(x.warm)}`);
      const easyRun = Math.max(0, ...parts(plan, type).warm.filter((sg) => sg.word === 'easy').map((sg) => sg.dur));
      if (type.warm !== 'easy' && easyRun > byId.P6.threshold.warmEasyMax * M) fail('P6', `easy rowing in the warm-up ${fmt(easyRun)}`);
      if (x.cool > byId.P6.threshold.coolMax * M) fail('P6', `cool-down ${fmt(x.cool)}`);
      if (x.cool > byId.P6.threshold.coolNormal * M) notes.push(`P6 long cool-down ${fmt(x.cool)}`);
      // P7 Identity
      if (m >= byId.P7.threshold.from && x.identity < byId.P7.threshold.min) fail('P7', `identity ${Math.round(x.identity * 100)}%`);
      // P8 Rest character
      const r = byId.P8.threshold[type.id];
      if (r && x.work.length > 1 && (x.restPerWork < r[0] - 1e-9 || x.restPerWork > r[1] + 1e-9)) fail('P8', `rest/work ${x.restPerWork.toFixed(2)} outside ${r[0]}-${r[1]}`);
      rows.push({ type, m, plan, x, notes });
    }
    // P5 Steps (reported; exceptions are explained in the principle table)
    if (type.shape !== 'block') {
      const g = growth(type.id);
      for (let i = 1; i < g.length; i++) {
        const add = total(g[i].pieces.map((d) => ({ dur: d }))) - total(g[i - 1].pieces.map((d) => ({ dur: d })));
        if (add > byId.P5.threshold.max * M && !byId.P5.threshold.exceptions[type.id]) fails.push(`P5 ${type.id}: step ${i} (${g[i].op}) adds ${fmt(add)}`);
      }
    }
  }
  return { fails, rows };
}
