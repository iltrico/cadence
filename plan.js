// Coach-style plan builder.
// Every session = warm-up + main set + cool-down, fitted exactly to the target length.
// Main sets scale the way a coach would: add reps first, then stretch reps within sane bounds.

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
  { id: 'vo2',       kind: 'work',   name: '2k pace',       rate: '28 spm',    desc: 'Four-minute reps at race rhythm.' },
  { id: 'power',     kind: 'work',   name: 'Power sprints', rate: '32 spm',    desc: 'Short bursts with full recovery.' },
  { id: 'pyramid',   kind: 'work',   name: 'Pyramid',       rate: '22–28 spm', desc: 'Pieces build up, then step down.' },
  { id: 'ladder',    kind: 'steady', name: 'Rate ladder',   rate: '20–28 spm', desc: 'Continuous, two strokes up each rung.' },
  { id: 'recovery',  kind: 'cool',   name: 'Recovery',      rate: '16–18 spm', desc: 'Light paddle to flush the legs.' },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r15 = (s) => Math.max(15, Math.round(s / 15) * 15);
const sum = (arr) => arr.reduce((a, s) => a + s.dur, 0);
const S = (name, kind, spm, dur, extra = {}) => ({ name, kind, spm, dur: Math.round(dur), ...extra });

export const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

function warmup(T, intense) {
  const w = r15(clamp(T * 0.13, 180, intense ? 720 : 480));
  if (!intense) {
    const easy = r15(w * 0.65);
    return [S('Warm-up', 'warm', 18, easy), S('Build', 'warm', 22, w - easy)];
  }
  const easy = r15(w * 0.55), build = r15(w * 0.3);
  return [
    S('Warm-up', 'warm', 18, easy),
    S('Build', 'warm', 22, build),
    S('Openers', 'warm', 26, Math.max(30, w - easy - build)),
  ];
}

const cooldown = (T) => [S('Cool-down', 'cool', 18, r15(clamp(T * 0.08, 120, 480)))];

// Fit n reps of work W with rest R into `main`. Coach logic: prefer the ideal rep length,
// add or drop reps to stay inside [minW, maxW], only then stretch or squeeze the rest.
function fitReps(main, W, R, minW, maxW, minN, maxN) {
  let n = clamp(Math.round((main + R) / (W + R)), minN, maxN);
  let w = (main - (n - 1) * R) / n;
  while (w < minW && n > minN) { n--; w = (main - (n - 1) * R) / n; }
  while (w > maxW && n < maxN) { n++; w = (main - (n - 1) * R) / n; }
  if (w < minW) { const k = R / W; w = main / (n + (n - 1) * k); R = w * k; }
  if (w > maxW) { w = maxW; R = (main - n * w) / (n - 1); }
  return { n, w: r15(w), R: r15(R) };
}

// Long sessions: a coach caps the hard set and fills the rest with aerobic base before it.
function withBase(main, cap, build) {
  if (main <= cap) return build(main);
  const extra = main - cap;
  const nb = Math.max(1, Math.round(extra / 900)), len = extra / nb;
  const base = Array.from({ length: nb }, () => S('Aerobic base', 'steady', 20, r15(len)));
  return [...base, ...build(cap)];
}

function repSet(main, cfg) {
  const { n, w, R } = fitReps(main, cfg.W, cfg.R, cfg.minW, cfg.maxW, cfg.minN, cfg.maxN);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(S(cfg.name, 'work', cfg.rate(i, n), w, { rep: i + 1, of: n }));
    if (i < n - 1) out.push(S(cfg.restName, 'rest', 18, R));
  }
  return out;
}

const builders = {
  steady(main) {
    const nb = Math.max(1, Math.round(main / 600)), len = main / nb;
    return Array.from({ length: nb }, (_, i) =>
      i === 0 ? S('Settle in', 'steady', 18, r15(len))
      : i % 2 ? S('Lift', 'steady', 20, r15(len))
      : S('Steady', 'steady', 18, r15(len)));
  },
  tempo(main) {
    const nb = Math.max(1, Math.round(main / 480)), len = main / nb;
    return Array.from({ length: nb }, (_, i) =>
      nb > 1 && i === nb - 1 ? S('Strong finish', 'steady', 24, r15(len))
      : i % 2 ? S('Push', 'steady', 24, r15(len))
      : S('Tempo', 'steady', 22, r15(len)));
  },
  threshold: (main) => withBase(main, 3600, (m) => repSet(m, {
    W: 480, R: 120, minW: 300, maxW: 720, minN: 2, maxN: 6,
    name: 'Threshold', restName: 'Easy paddle', rate: (i, n) => (i < n / 2 ? 24 : 26),
  })),
  vo2: (main) => withBase(main, 2700, (m) => repSet(m, {
    W: 240, R: 180, minW: 120, maxW: 300, minN: 2, maxN: 8,
    name: 'Race pace', restName: 'Recover', rate: () => 28,
  })),
  power: (main) => withBase(main, 2400, (main) => {
    // 45s sprints, 75s recovery, grouped in sets of five with a longer break between sets.
    let W = 45, R = 75; const B = 180;
    let n = Math.floor((main + R) / (W + R));
    let sets = Math.ceil(n / 5);
    n = Math.max(3, Math.floor((main - (sets - 1) * (B - R) + R) / (W + R)));
    sets = Math.ceil(n / 5);
    const gaps = n - 1;
    let used = n * W + (n - sets) * R + (sets - 1) * B;
    if (used > main) { const k = main / used; W *= k; R *= k; used = main; }
    const add = (main - used) / gaps;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(S('Sprint', 'work', 32, r15(W), { rep: i + 1, of: n }));
      if (i === n - 1) break;
      const setBreak = (i + 1) % 5 === 0;
      out.push(setBreak ? S('Set break', 'rest', 18, r15(B + add)) : S('Recover', 'rest', 18, r15(R + add)));
    }
    return out;
  }),
  pyramid: (main) => withBase(main, 2820, (main) => {
    const full = main / 23.5 >= 60;
    const steps = full ? [1, 2, 3, 4, 3, 2, 1] : [1, 2, 3, 2, 1];
    const units = steps.reduce((a, b) => a + b, 0) + 0.5 * steps.slice(0, -1).reduce((a, b) => a + b, 0);
    const u = main / units;
    const rate = { 1: 28, 2: 26, 3: 24, 4: 22 };
    const out = [];
    steps.forEach((k, i) => {
      const d = r15(k * u);
      out.push(S(`${fmt(d)} piece`, 'work', rate[k], d, { rep: i + 1, of: steps.length }));
      if (i < steps.length - 1) out.push(S('Easy paddle', 'rest', 18, r15(k * u * 0.5)));
    });
    return out;
  }),
  ladder(main) {
    const rates = [20, 22, 24, 26, 28];
    const cycles = Math.max(1, Math.round(main / 1200));
    const len = main / (cycles * rates.length);
    const out = [];
    for (let c = 0; c < cycles; c++) rates.forEach((r, i) => {
      const name = i === 0 ? 'Base' : i === rates.length - 1 ? 'Top rung' : 'Climb';
      out.push(S(name, r >= 26 ? 'work' : 'steady', r, r15(len), { rep: c * 5 + i + 1, of: cycles * 5 }));
    });
    return out;
  },
};

// Absorb rounding drift in the cool-down so the plan matches the target exactly.
function fit(segs, T) {
  const last = segs[segs.length - 1];
  last.dur = Math.max(60, last.dur + (T - sum(segs)));
  return segs;
}

export function buildPlan(typeId, T) {
  if (typeId === 'recovery') {
    const w = r15(clamp(T * 0.1, 120, 300)), c = r15(clamp(T * 0.1, 120, 300));
    const main = T - w - c;
    const nb = Math.max(1, Math.round(main / 900)), len = main / nb;
    const mid = Array.from({ length: nb }, (_, i) =>
      S(i % 2 ? 'Long and light' : 'Easy flow', 'steady', i % 2 ? 17 : 18, r15(len)));
    return fit([S('Warm-up', 'warm', 18, w), ...mid, S('Cool-down', 'cool', 16, c)], T);
  }
  const intense = ['threshold', 'vo2', 'power', 'pyramid'].includes(typeId);
  const w = warmup(T, intense), c = cooldown(T);
  const main = T - sum(w) - sum(c);
  return fit([...w, ...builders[typeId](main), ...c], T);
}

export const planTotal = sum;
