// Cadence planner.
// One shared algorithm turns each session's coaching rules into a plan for any length.
// Every plan is warm-up, main set and cool-down, and adds up exactly to the chosen length.
//
// Order for using time, the same for every session:
//   1. stretch reps within their range
//   2. add reps, up to the session's cap on hard work
//   3. leftover of 5 minutes or more becomes a steady block before the openers
//   4. smaller leftovers become pick-ups in the warm-up
// Below a session's Express length it switches to its short format, and the plan says so.

export const KIND = {
  warm:   { bg: '#FF9F1C', ink: '#231300' },
  steady: { bg: '#2EC4B6', ink: '#04201D' },
  work:   { bg: '#FF3B5C', ink: '#2A0008' },
  rest:   { bg: '#3A5BFF', ink: '#FFFFFF' },
  cool:   { bg: '#B9A6FF', ink: '#1B1433' },
};

export const TYPES = [
  { id: 'steady',    kind: 'steady', name: 'Steady state',  rate: '18–20 spm', desc: 'Long, easy aerobic base.' },
  { id: 'tempo',     kind: 'steady', name: 'Tempo',         rate: '22–24 spm', desc: 'Sustained and comfortably hard.' },
  { id: 'threshold', kind: 'work',   name: 'Threshold',     rate: '24–26 spm', desc: 'Long reps just under race effort.' },
  { id: 'vo2',       kind: 'work',   name: '2k pace',       rate: '28 spm',    desc: 'Race-rhythm reps with equal rest.' },
  { id: 'power',     kind: 'work',   name: 'Power sprints', rate: '32 spm',    desc: 'Short bursts with full recovery.' },
  { id: 'pyramid',   kind: 'work',   name: 'Pyramid',       rate: '22–28 spm', desc: 'Pieces build up, then step down.' },
  { id: 'ladder',    kind: 'steady', name: 'Rate ladder',   rate: '20–28 spm', desc: 'Continuous, two strokes up each rung.' },
  { id: 'recovery',  kind: 'cool',   name: 'Recovery',      rate: '16–18 spm', desc: 'Light paddle to flush the legs.' },
];

const M = 60;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r15 = (s) => Math.round(s / 15) * 15;
const down15 = (s) => Math.floor(s / 15) * 15;
const down30 = (s) => Math.floor(s / 30) * 30;
const sum = (arr) => arr.reduce((a, s) => a + s.dur, 0);
const S = (name, kind, spm, dur, extra = {}) => ({ name, kind, spm, dur: Math.round(dur), ...extra });

export const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

// ---------- Session rules ----------
// Interval sessions: rep range, rest rule, cap on hard work, and an Express format.
const INTERVALS = {
  threshold: {
    rep: [6 * M, 10 * M], rest: (r) => (r > 8 * M ? 3 * M : 2 * M), cap: 36 * M, max: 5,
    name: 'Threshold', restName: 'Easy paddle', rate: (i, n) => (i < n / 2 ? 24 : 26), opener: 26,
    express: { below: 30, rep: [3 * M, 5 * M], rest: () => 90 },
  },
  vo2: {
    rep: [3 * M, 5 * M], rest: (r) => r, cap: 20 * M, max: 6,
    name: 'Race pace', restName: 'Recover', rate: () => 28, opener: 28,
    express: { below: 30, rep: [60, 90], rest: (r) => r },
  },
  power: {
    rep: [20, 30], rest: (r) => 4 * r, cap: 6 * M, max: 15, set: 5, setBreak: 3 * M,
    name: 'Sprint', restName: 'Recover', rate: () => 32, opener: 30,
    express: { below: 25, rep: [20, 20], rest: (r) => 4 * r },
  },
};

// Warm-up and cool-down for hard sessions: they scale with the session, between a floor
// and a comfortable maximum. Express sessions use lower floors.
const hardWarm = (T, x) => (x ? 4 * M : r15(clamp(T * 0.18, 8 * M, 12 * M)));
const hardCool = (T, x) => (x ? 2.5 * M : r15(clamp(T * 0.11, 5 * M, 8 * M)));

// Warm-up for hard sessions: easy, build, optional pick-ups, then openers right before the
// main set. Openers are short bursts with easy rowing between them.
function hardWarmup(total, x, openerRate, pickups) {
  const bursts = x ? 2 : 3;
  const openers = [];
  for (let k = 0; k < bursts; k++) {
    openers.push(S('Opener', 'warm', openerRate, 20), S('Easy', 'warm', 18, 40));
  }
  const openTime = bursts * 60;
  const rest = total - openTime;
  const build = r15(rest * 0.35);
  const easy = rest - build;
  const out = [S('Warm-up', 'warm', 18, easy), S('Build', 'warm', 22, build)];
  if (pickups >= 30) out.push(S('Pick-ups', 'warm', 24, pickups));
  return { warm: out, openers };
}

// Leftover time after the main set: a steady block if it's worth one, otherwise pick-ups.
function leftover(left) {
  if (left >= 5 * M) return { block: S(left >= 8 * M ? 'Aerobic base' : 'Steady', 'steady', 20, left), pickups: 0 };
  return { block: null, pickups: left };
}

// ---------- Interval sessions ----------
function intervals(id, T) {
  const p = INTERVALS[id];
  const x = T < p.express.below * M;
  const [lo, hi] = x ? p.express.rep : p.rep;
  const rest = x ? p.express.rest : p.rest;
  const warmT = hardWarm(T, x), coolT = hardCool(T, x);
  const main = T - warmT - coolT;
  const span = (n, r) => {
    let s = n * r + (n - 1) * rest(r);
    if (p.set && n > p.set) s += Math.floor((n - 1) / p.set) * (p.setBreak - rest(r));
    return s;
  };
  // Add reps at the shortest length while they fit and stay under the cap.
  let n = 0;
  while (n < p.max && span(n + 1, lo) <= main && (n + 1) * lo <= p.cap) n++;
  n = Math.max(1, n);
  // Stretch reps within their range.
  let r = lo;
  while (r + 15 <= hi && span(n, r + 15) <= main && n * (r + 15) <= p.cap) r += 15;
  if (r >= 120) r = Math.max(lo, down30(r));
  const { block, pickups } = leftover(Math.max(0, main - span(n, r)));
  const { warm, openers } = hardWarmup(warmT, x, p.opener, pickups);

  const set = [];
  for (let i = 0; i < n; i++) {
    set.push(S(p.name, 'work', p.rate(i, n), r, { rep: i + 1, of: n }));
    if (i === n - 1) break;
    const brk = p.set && (i + 1) % p.set === 0;
    set.push(brk ? S('Set break', 'rest', 18, p.setBreak) : S(p.restName, 'rest', 18, rest(r)));
  }
  return fit([...warm, ...(block ? [block] : []), ...openers, ...set, S('Cool-down', 'cool', 18, coolT)], T, x);
}

// ---------- Pyramid ----------
// Pieces climb and step back down; shorter pieces go at a higher rate.
// Rest after each piece is half its length. The step unit runs from 45 seconds to 1:30.
const SHAPES = [[1, 2, 3, 4, 3, 2, 1], [1, 2, 3, 2, 1], [1, 2, 1]];
const PYR_RATE = { 1: 28, 2: 26, 3: 24, 4: 22 };
function pyramid(T) {
  const x = T < 25 * M;
  const warmT = hardWarm(T, x), coolT = hardCool(T, x);
  const main = T - warmT - coolT;
  const cost = (sh) => sh.reduce((a, b) => a + b, 0) + 0.5 * sh.slice(0, -1).reduce((a, b) => a + b, 0);
  const work = (sh) => sh.reduce((a, b) => a + b, 0);
  const cap = 25 * M;
  // Largest shape that fits at the smallest unit, then grow the unit up to 1:30.
  let shape = SHAPES.find((sh) => cost(sh) * 45 <= main) || SHAPES[2];
  let u = Math.min(90, main / cost(shape), cap / work(shape));
  u = Math.max(30, down15(u));
  // Spare time first lengthens the rests, from half a piece up to a full piece.
  const restBase = 0.5 * shape.slice(0, -1).reduce((a, b) => a + b, 0) * u;
  let spare = Math.max(0, main - cost(shape) * u);
  const restScale = spare < 5 * M ? Math.min(2, 1 + spare / restBase) : 1;
  spare -= restBase * (restScale - 1);
  const { block, pickups } = leftover(Math.max(0, spare));
  const { warm, openers } = hardWarmup(warmT, x, 26, pickups);
  const set = [];
  shape.forEach((k, i) => {
    set.push(S(`${fmt(k * u)} piece`, 'work', PYR_RATE[k], k * u, { rep: i + 1, of: shape.length }));
    if (i < shape.length - 1) set.push(S('Easy paddle', 'rest', 18, Math.max(15, r15((k * u * restScale) / 2))));
  });
  return fit([...warm, ...(block ? [block] : []), ...openers, ...set, S('Cool-down', 'cool', 18, coolT)], T, x);
}

// ---------- Continuous sessions ----------
// Steady state: easy aerobic throughout, rate changes every 5 to 10 minutes for focus.
function steady(T) {
  const warmT = r15(clamp(T * 0.1, 2 * M, 5 * M)), coolT = r15(clamp(T * 0.06, M, 3 * M));
  const main = T - warmT - coolT;
  const nb = Math.max(1, Math.ceil(main / (10 * M)));
  const len = main / nb;
  const blocks = Array.from({ length: nb }, (_, i) =>
    i === 0 ? S('Settle in', 'steady', 18, len) : i % 2 ? S('Lift', 'steady', 20, len) : S('Steady', 'steady', 18, len));
  return fit([S('Warm-up', 'warm', 18, warmT), ...blocks, S('Cool-down', 'cool', 18, coolT)], T, false);
}

// Tempo: blocks of 6 to 10 minutes alternating 22 and 24, up to 40 minutes of tempo.
// Beyond that, easy blocks go in first so the tempo work stays good quality.
function tempo(T) {
  const x = T < 20 * M;
  const warmT = x ? 3 * M : r15(clamp(T * 0.12, 5 * M, 8 * M));
  const coolT = x ? 2 * M : r15(clamp(T * 0.08, 3 * M, 5 * M));
  let main = T - warmT - coolT;
  const cap = 40 * M;
  let base = main > cap ? main - cap : 0;
  main -= base;
  let warmX = 0;
  if (base && base < 5 * M) { warmX = base; base = 0; }
  const nb = Math.max(1, Math.ceil(main / ((x ? 5 : 10) * M)));
  const len = main / nb;
  const blocks = Array.from({ length: nb }, (_, i) =>
    nb > 1 && i === nb - 1 ? S('Strong finish', 'steady', 24, len)
      : i % 2 ? S('Push', 'steady', 24, len) : S('Tempo', 'steady', 22, len));
  const warm = [S('Warm-up', 'warm', 18, warmT * 0.6 + warmX), S('Build', 'warm', 20, warmT * 0.4)];
  return fit([...warm, ...(base ? [S(base >= 8 * M ? 'Aerobic base' : 'Steady', 'steady', 20, base)] : []),
    ...blocks, S('Cool-down', 'cool', 18, coolT)], T, x);
}

// Rate ladder: climb from 20 to 28 in steps of 2. Rungs run from 1:15 to 4 minutes.
// A second climb is added once one climb would need rungs longer than 4 minutes.
function ladder(T) {
  const rates = [20, 22, 24, 26, 28];
  const warmT = r15(clamp(T * 0.1, 2 * M, 5 * M)), coolT = r15(clamp(T * 0.08, 90, 4 * M));
  const main = T - warmT - coolT;
  const rung = (c) => (main - (c - 1) * 2 * M) / (c * rates.length);
  const climbs = rung(2) >= 150 ? 2 : 1;
  const r = Math.max(75, Math.min(4 * M, down15(rung(climbs))));
  const used = climbs * rates.length * r + (climbs - 1) * 2 * M;
  const extra = Math.max(0, main - used);
  const out = [S('Warm-up', 'warm', 18, warmT + (extra < 5 * M ? extra : 0))];
  if (extra >= 5 * M) out.push(S(extra >= 8 * M ? 'Aerobic base' : 'Steady', 'steady', 20, extra));
  for (let c = 0; c < climbs; c++) {
    if (c > 0) out.push(S('Easy', 'rest', 18, 2 * M));
    rates.forEach((rt, i) => {
      const name = i === 0 ? 'Base' : i === rates.length - 1 ? 'Top rung' : 'Climb';
      out.push(S(name, rt >= 26 ? 'work' : 'steady', rt, r, { rep: c * 5 + i + 1, of: climbs * 5 }));
    });
  }
  out.push(S('Cool-down', 'cool', 18, coolT));
  return fit(out, T, false);
}

// Recovery: continuous and light.
function recovery(T) {
  const w = r15(clamp(T * 0.1, 2 * M, 5 * M)), c = r15(clamp(T * 0.1, 2 * M, 5 * M));
  const main = T - w - c;
  const nb = Math.max(1, Math.round(main / (15 * M))), len = main / nb;
  const mid = Array.from({ length: nb }, (_, i) =>
    S(i % 2 ? 'Long and light' : 'Easy flow', 'steady', i % 2 ? 17 : 18, len));
  return fit([S('Warm-up', 'warm', 18, w), ...mid, S('Cool-down', 'cool', 16, c)], T, false);
}

// Round every segment to whole seconds and absorb any drift in the cool-down,
// so the plan adds up exactly to the chosen length.
function fit(segs, T, express) {
  segs.forEach((s) => { s.dur = Math.max(15, s.dur >= 120 ? r15(s.dur) : Math.round(s.dur / 5) * 5); });
  const last = segs[segs.length - 1];
  last.dur = Math.max(60, last.dur + (T - sum(segs)));
  segs.express = express;
  return segs;
}

export function buildPlan(typeId, T) {
  if (INTERVALS[typeId]) return intervals(typeId, T);
  return { steady, tempo, pyramid, ladder, recovery }[typeId](T);
}

// Whether a session runs in its Express format at this length (in seconds).
export const isExpress = (typeId, T) => !!buildPlan(typeId, T).express;

export const planTotal = sum;
