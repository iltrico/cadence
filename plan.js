// Cadence planner, built on a small grammar.
//
// WORDS are the only intervals a plan can contain. Each has one purpose, a pressure,
// length limits and a rate per fitness level.
// PHRASES combine words by fixed rules: warm-up, main set, cool-down.
// SENTENCES are the sessions: which phrases, with which words.
//
// Spare time is always used in the same order:
//   1. stretch the work words within their limits
//   2. add repeats, up to the work word's cap
//   3. a Steady block of 5 minutes or more, placed before the warm-up's builds
//   4. lengthen Easy, Build and the cool-down within their limits

export const KIND = {
  warm:   { bg: '#FF9F1C', ink: '#231300' },
  drill:  { bg: '#B5E550', ink: '#172400' },
  steady: { bg: '#2EC4B6', ink: '#04201D' },
  work:   { bg: '#FF3B5C', ink: '#2A0008' },
  rest:   { bg: '#3A5BFF', ink: '#FFFFFF' },
  cool:   { bg: '#B9A6FF', ink: '#1B1433' },
};

export const LEVELS = ['recreational', 'club', 'competitive'];
const M = 60;

// ---------- Words ----------
// rate: spm per level, as a single value or [low, high] for words that alternate or progress.
// len: absolute limits in seconds. reps / express: preferred rep lengths for repeats.
export const WORDS = {
  pick:      { name: 'Pick drill',   kind: 'drill',   pressure: 'light',    len: [2 * M, 3 * M], detail: 'stages',
               stages: ['armsOnly', 'armsBody', 'halfSlide', 'fullSlide'],   rate: { recreational: 18, club: 18, competitive: 18 } },
  easy:      { name: 'Easy',         kind: 'warm',   pressure: 'light',    len: [M, 20 * M],      rate: { recreational: [18, 16], club: [18, 16], competitive: [18, 16] } },
  build:     { name: 'Build',        kind: 'warm',   pressure: 'light to moderate', len: [M, 3 * M], from: 20, step: 2 },
  firm:      { name: 'Firm strokes', kind: 'warm',   pressure: 'firm',     len: [M, 2 * M],       rate: { recreational: 24, club: 26, competitive: 28 } },
  steady:    { name: 'Steady',       kind: 'steady', pressure: 'light to moderate', len: [5 * M, 20 * M], rate: { recreational: [18, 20], club: [18, 20], competitive: [18, 22] } },
  tempo:     { name: 'Tempo',        kind: 'steady', pressure: 'moderate to hard', len: [4 * M, 10 * M], reps: [6 * M, 10 * M], express: [4 * M, 5 * M],
               rate: { recreational: [22, 24], club: [22, 24], competitive: [24, 26] }, cap: 40 * M },
  threshold: { name: 'Threshold',    kind: 'work',   pressure: 'hard',     len: [3 * M, 10 * M], reps: [6 * M, 10 * M], express: [3 * M, 5 * M],
               rate: { recreational: [24, 26], club: [26, 28], competitive: [28, 30] }, cap: 36 * M, max: 5,
               recover: (r, x) => (x ? 90 : r > 8 * M ? 3 * M : 2 * M) },
  race:      { name: 'Race pace',    kind: 'work',   pressure: 'very hard', len: [45, 5 * M], reps: [3 * M, 5 * M], express: [M, 90],
               rate: { recreational: [28, 28], club: [30, 32], competitive: [32, 34] }, cap: 20 * M, max: 6,
               recover: (r) => r },
  sprint:    { name: 'Sprint',       kind: 'work',   pressure: 'maximum',  len: [15, 30], reps: [20, 30], express: [20, 20],
               rate: { recreational: 32, club: 36, competitive: 40 }, max: 15, set: 5,
               recover: (r) => 4 * r, setRecover: 3 * M },
  rung:      { name: 'Rung',         kind: 'steady', pressure: 'moderate, held constant', len: [45, 4 * M], from: 'steady', step: 2, count: 5 },
  recover:   { name: 'Recover',      kind: 'rest',   pressure: 'light',    rate: { recreational: 18, club: 18, competitive: 18 } },
  cool:      { name: 'Cool-down',    kind: 'cool',   pressure: 'light',    len: [2 * M, 8 * M], rate: { recreational: 18, club: 18, competitive: 18 } },
};

const lo = (w, L) => { const r = WORDS[w].rate[L]; return Array.isArray(r) ? r[0] : r; };
const hi = (w, L) => { const r = WORDS[w].rate[L]; return Array.isArray(r) ? r[1] : r; };

// ---------- Sessions (sentences) ----------
// warm: 'short' (no Firm strokes), 'standard' (no Firm strokes), 'firm' (ends on Firm strokes), 'easy' (Easy only)
// xBelow: length in minutes under which the session uses its Express limits.
export const TYPES = [
  { id: 'steady',    kind: 'steady', name: 'Steady state',  desc: 'Long, easy aerobic base.',               warm: 'short',    xBelow: 0 },
  { id: 'tempo',     kind: 'steady', name: 'Tempo',         desc: 'Sustained and comfortably hard.',        warm: 'standard', xBelow: 20 },
  { id: 'threshold', kind: 'work',   name: 'Threshold',     desc: 'Long reps just under race effort.',      warm: 'firm',     xBelow: 30 },
  { id: 'vo2',       kind: 'work',   name: '2k pace',       desc: 'Race-rhythm reps with equal rest.',      warm: 'firm',     xBelow: 30 },
  { id: 'power',     kind: 'work',   name: 'Power sprints', desc: 'Short bursts with full recovery.',       warm: 'firm',     xBelow: 25 },
  { id: 'pyramid',   kind: 'work',   name: 'Pyramid',       desc: 'Pieces build up, then step down.',       warm: 'firm',     xBelow: 25 },
  { id: 'ladder',    kind: 'steady', name: 'Rate ladder',   desc: 'Same pressure, two strokes up each rung.', warm: 'standard', xBelow: 15 },
  { id: 'recovery',  kind: 'cool',   name: 'Recovery',      desc: 'Light paddle to flush the legs.',        warm: 'easy',     xBelow: 0 },
];

// Rate label for a session card at a fitness level.
export function rateLabel(id, L = 'recreational') {
  const span = (a, b) => (a === b ? `${a} spm` : `${a}–${b} spm`);
  switch (id) {
    case 'steady': return span(lo('steady', L), hi('steady', L));
    case 'tempo': return span(lo('tempo', L), hi('tempo', L));
    case 'threshold': return span(lo('threshold', L), hi('threshold', L));
    case 'vo2': return span(lo('race', L), hi('race', L));
    case 'power': return span(lo('sprint', L), hi('sprint', L));
    case 'pyramid': return span(lo('threshold', L), hi('race', L));
    case 'ladder': return span(hi('steady', L), hi('steady', L) + 8);
    default: return span(hi('easy', L), lo('easy', L));
  }
}

// Cards show the default level's rates until a level is chosen.
TYPES.forEach((t) => { t.rate = rateLabel(t.id); });

// ---------- Helpers ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r15 = (s) => Math.round(s / 15) * 15;
const down15 = (s) => Math.floor(s / 15) * 15;
const down30 = (s) => Math.floor(s / 30) * 30;
const sum = (arr) => arr.reduce((a, s) => a + s.dur, 0);
const seg = (w, spm, dur, extra = {}) => ({ word: w, name: WORDS[w].name, kind: WORDS[w].kind, spm, dur: Math.round(dur), ...extra });

export const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

// ---------- Warm-up and cool-down lengths ----------
// Harder main sets get a longer warm-up and cool-down, between fixed floors and ceilings.
function warmLength(style, T, x) {
  if (style === 'easy') return r15(clamp(T * 0.1, 2 * M, 5 * M));
  if (style === 'short') return r15(clamp(T * 0.1, 3 * M, 5 * M));
  if (style === 'standard') return x ? 3 * M : r15(clamp(T * 0.12, 4 * M, 8 * M));
  return x ? 4 * M : r15(clamp(T * 0.18, 8 * M, 12 * M));
}
function coolLength(style, T, x) {
  if (style === 'firm') return x ? 2 * M : r15(clamp(T * 0.11, 5 * M, 8 * M));
  if (style === 'standard') return x ? 2 * M : r15(clamp(T * 0.08, 3 * M, 5 * M));
  return r15(clamp(T * 0.06, 2 * M, 3 * M));
}

// ---------- Warm-up phrase ----------
// Pick drill, then Build steps rising by 2 spm while below the main set's rate.
// 'firm' style ends with Firm strokes and a minute of Easy before the main set.
// Rates only go up, and never pass the main set's rate.
function warmPhrase(style, total, mainRate, L) {
  if (style === 'easy') return { head: [], tail: [seg('easy', lo('easy', L), total)] };
  const firm = style === 'firm';
  const firmRate = Math.min(lo('firm', L), mainRate);
  const ceilRate = firm ? firmRate : mainRate;
  const builds = [];
  for (let r = WORDS.build.from; r < ceilRate; r += WORDS.build.step) builds.push(r);

  let pick = clamp(r15(total * 0.3), WORDS.pick.len[0], WORDS.pick.len[1]);
  let firmT = firm ? (total >= 6 * M ? 90 : WORDS.firm.len[0]) : 0;
  let settle = firm ? WORDS.easy.len[0] : 0;
  const avail = total - pick - firmT - settle;
  // Builds share the time that's left, each within its limits; the top steps go if it's short.
  let n = builds.length;
  const per = (k) => (k ? clamp(down15(avail / k), WORDS.build.len[0], WORDS.build.len[1]) : 0);
  while (n && n * per(n) > avail) n--;
  builds.length = n;
  let buildT = per(n);
  let left = avail - n * buildT;
  // Anything left lengthens the builds, then the pick drill, then the Firm strokes, all within limits.
  if (n) { const a = Math.min(down15(left / n), WORDS.build.len[1] - buildT); buildT += a; left -= a * n; }
  { const a = Math.min(left, WORDS.pick.len[1] - pick); pick += a; left -= a; }
  if (firm) { const a = Math.min(down15(left), WORDS.firm.len[1] - firmT); firmT += a; left -= a; }
  // Still more: the settle takes it before hard sessions; otherwise it moves to the
  // cool-down, so Easy never sits right next to the pick drill at the same rate.
  let spill = 0;
  if (firm) settle += left; else spill = left;
  const head = [seg('pick', lo('pick', L), pick)];
  const tail = builds.map((r) => seg('build', r, buildT));
  if (firm) tail.push(seg('firm', firmRate, firmT), seg('easy', lo('easy', L), settle));
  // A Steady block, when there is one, sits between the pick drill and the builds.
  return { head, tail, spill };
}

// ---------- Cool-down phrase ----------
// Easy rowing at 18, easing to 16 for the second half once it's 4 minutes or more.
// The cool-down never goes back up after a lower-rate finish, as in Recovery.
function coolPhrase(total, L, before) {
  const start = Math.min(lo('cool', L), before);
  if (total < 4 * M || start <= 16) return [seg('cool', start, total)];
  const a = r15(total / 2);
  return [seg('cool', start, a), seg('cool', 16, total - a)];
}

// ---------- Main phrases ----------
// Continuous: blocks of one word within its limits, alternating its low and high rate.
function continuous(w, main, L, x) {
  const max = x && WORDS[w].express ? WORDS[w].express[1] : WORDS[w].len[1];
  const nb = Math.max(1, Math.ceil(main / max));
  const len = main / nb;
  return Array.from({ length: nb }, (_, i) => seg(w, i % 2 ? hi(w, L) : lo(w, L), len));
}

// Repeats (and sets): a work word plus Recover, as many times as fits.
// Reps add first at their shortest preferred length, then stretch within the range.
function repeats(w, main, L, x) {
  const W = WORDS[w];
  const [rlo, rhi] = x ? W.express : W.reps;
  const rest = (r) => W.recover(r, x);
  const span = (n, r) => {
    let s = n * r + (n - 1) * rest(r);
    if (W.set && n > W.set) s += Math.floor((n - 1) / W.set) * (W.setRecover - rest(r));
    return s;
  };
  const cap = W.cap || Infinity;
  let n = 0;
  while (n < W.max && span(n + 1, rlo) <= main && (n + 1) * rlo <= cap) n++;
  n = Math.max(1, n);
  let r = rlo;
  while (r + 15 <= rhi && span(n, r + 15) <= main && n * (r + 15) <= cap) r += 15;
  if (r >= 120) r = Math.max(rlo, down30(r));
  const out = [];
  for (let i = 0; i < n; i++) {
    // Threshold progresses from its low to its high rate over the session.
    const spm = w === 'threshold' ? (i < n / 2 ? lo(w, L) : hi(w, L)) : w === 'race' && i === n - 1 ? hi(w, L) : lo(w, L);
    out.push(seg(w, spm, r, { rep: i + 1, of: n }));
    if (i === n - 1) break;
    const brk = W.set && (i + 1) % W.set === 0;
    out.push(seg('recover', lo('recover', L), brk ? W.setRecover : rest(r)));
  }
  return { set: out, spare: Math.max(0, main - span(n, r)) };
}

// Pyramid: pieces climb and step back down. Pieces up to 3 minutes are Race pace,
// longer ones Threshold. Recover is half a piece, lengthened to a full piece with spare time.
const SHAPES = [[1, 2, 3, 4, 3, 2, 1], [1, 2, 3, 2, 1], [1, 2, 1]];
function pyramid(main, L) {
  const cost = (sh) => sh.reduce((a, b) => a + b, 0) + 0.5 * sh.slice(0, -1).reduce((a, b) => a + b, 0);
  const work = (sh) => sh.reduce((a, b) => a + b, 0);
  const shape = SHAPES.find((sh) => cost(sh) * 45 <= main) || SHAPES[2];
  let u = Math.min(90, main / cost(shape), 25 * M / work(shape));
  u = Math.max(45, down15(u));
  const restBase = 0.5 * shape.slice(0, -1).reduce((a, b) => a + b, 0) * u;
  let spare = Math.max(0, main - cost(shape) * u);
  const scale = spare < 5 * M ? Math.min(2, 1 + spare / restBase) : 1;
  spare -= restBase * (scale - 1);
  const out = [];
  shape.forEach((k, i) => {
    const len = k * u;
    const w = len <= 3 * M ? 'race' : 'threshold';
    // Shorter pieces go faster: the shortest at Race pace high, the longest at Threshold low.
    const spm = w === 'race' ? (k === 1 ? hi('race', L) : lo('race', L)) : (k >= 4 ? lo('threshold', L) : hi('threshold', L));
    out.push(seg(w, spm, len, { rep: i + 1, of: shape.length }));
    if (i < shape.length - 1) out.push(seg('recover', lo('recover', L), Math.max(15, r15((len * scale) / 2))));
  });
  return { set: out, spare: Math.max(0, spare) };
}

// Ladder: Rung intervals rising by 2 spm from Steady's high rate, at constant pressure.
// Rungs run 45 seconds to 4 minutes. A second climb is added once its rungs would be
// 2:30 or more, with Recover between climbs.
function ladder(main, L) {
  const R = WORDS.rung, start = hi('steady', L);
  const rates = Array.from({ length: R.count }, (_, i) => start + i * R.step);
  const len = (c) => (main - (c - 1) * 2 * M) / (c * rates.length);
  const climbs = len(2) >= 150 ? 2 : 1;
  const r = clamp(down15(len(climbs)), R.len[0], R.len[1]);
  const out = [];
  for (let c = 0; c < climbs; c++) {
    if (c > 0) out.push(seg('recover', lo('recover', L), 2 * M));
    rates.forEach((spm, i) => out.push(seg('rung', spm, r, { rep: c * rates.length + i + 1, of: climbs * rates.length })));
  }
  return { set: out, spare: Math.max(0, main - climbs * rates.length * r - (climbs - 1) * 2 * M) };
}

// ---------- Composition ----------
export function buildPlan(id, T, L = 'recreational') {
  const type = TYPES.find((t) => t.id === id);
  const x = T < type.xBelow * M;
  const style = type.warm;
  const warmT = warmLength(style, T, x);
  const coolT = coolLength(style, T, x);
  let main = T - warmT - coolT;

  let set, spare = 0;
  if (id === 'steady') set = continuous('steady', main, L, x);
  else if (id === 'recovery') set = continuous('easy', main, L, x).map((s) => ({ ...s, kind: 'steady' }));
  else if (id === 'tempo') {
    const over = Math.max(0, main - WORDS.tempo.cap);
    set = continuous('tempo', main - over, L, x);
    spare = over;
  } else if (id === 'threshold') ({ set, spare } = repeats('threshold', main, L, x));
  else if (id === 'vo2') ({ set, spare } = repeats('race', main, L, x));
  else if (id === 'power') ({ set, spare } = repeats('sprint', main, L, x));
  else if (id === 'pyramid') ({ set, spare } = pyramid(main, L));
  else if (id === 'ladder') ({ set, spare } = ladder(main, L));

  // Spare time: a Steady block if it's 5 minutes or more, otherwise warm-up and cool-down.
  let steadyBlock = null, warmExtra = 0, coolExtra = 0;
  if (spare >= 5 * M && style !== 'easy') steadyBlock = seg('steady', lo('steady', L), spare);
  else if (spare > 0) { coolExtra = Math.min(spare / 2, WORDS.cool.len[1] - coolT); warmExtra = spare - coolExtra; }

  const mainRate = set[0].spm;
  const warm = warmPhrase(style, warmT + warmExtra, mainRate, L);
  const segs = [...warm.head, ...(steadyBlock ? [steadyBlock] : []), ...warm.tail, ...set, ...coolPhrase(coolT + coolExtra + (warm.spill || 0), L, set[set.length - 1].spm)];
  return fit(segs, T, x);
}

// Round each interval and absorb drift in the last one, so the plan adds up exactly.
function fit(segs, T, express) {
  for (let i = segs.length - 1; i > 0; i--) {
    const a = segs[i - 1], b = segs[i];
    if (a.word === b.word && a.spm === b.spm && !a.rep && !b.rep) { a.dur += b.dur; segs.splice(i, 1); }
  }
  segs.forEach((s) => { s.dur = Math.max(15, s.dur >= 120 ? r15(s.dur) : Math.round(s.dur / 5) * 5); });
  const last = segs[segs.length - 1];
  last.dur = Math.max(30, last.dur + (T - sum(segs)));
  segs.express = express;
  return segs;
}

export const isExpress = (id, T) => !!buildPlan(id, T).express;
export const planTotal = sum;
