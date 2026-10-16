// Cadence planner, built on a small grammar.
//
// 1. WORDS are the only intervals a plan can contain, each with a rate and length limits.
// 2. SHAPES: each session's main set has one shape it keeps at every length: one block,
//    equal pieces, a pyramid (1:2:3:4:3:2:1) or a ladder (climbs of 5:4:3:2:1 rungs).
// 3. GROWTH: a session starts from its 15-minute form and grows in two ways only:
//    lengthen the piece furthest below its share of the shape, by one coach step, or add a
//    piece at its share. It lengthens until pieces reach the session's preferred length,
//    then adds one. Growth is one sequence per session; every length is a step further on.
// 4. RESTS follow their piece, by a fixed value per word. Rests between blocks (between
//    ladder climbs, between sets of sprints) have a range, and stretch to absorb leftover time.
// 5. COACH NUMBERS: whole minutes from 5 minutes, half minutes below, tens of seconds under 1.
// 6. FRAME: every session runs 15 to 60 minutes. Warm-ups take 3 to 8 minutes and
//    cool-downs 2 to 5, by session style. Leftover time goes, in order, to the rests between
//    blocks (up to their range), to the warm-up's steps (as long as no stretch of easy rowing
//    in it passes 4 minutes), then to the cool-down.

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
// countdown: false for words too short or too focused to show the 4-stroke countdown at their end.
// len: absolute limits in seconds. reps / express: preferred rep lengths for repeats.
export const WORDS = {
  pick:      { name: 'Pick drill',   kind: 'drill',   pressure: 'light',    len: [2 * M, 3 * M], detail: 'stages', countdown: false,
               stages: ['armsOnly', 'armsBody', 'halfSlide', 'fullSlide'],   rate: { recreational: 18, club: 18, competitive: 18 } },
  easy:      { name: 'Easy',         kind: 'warm',   pressure: 'light',    len: [M, 60 * M],      rate: { recreational: [18, 16], club: [18, 16], competitive: [18, 16] } },
  build:     { name: 'Build',        kind: 'warm',   pressure: 'light to moderate', len: [M, 3 * M], from: 20, step: 2 },
  firm:      { name: 'Firm strokes', kind: 'warm',   pressure: 'firm',     len: [M, 2 * M],       rate: { recreational: 24, club: 26, competitive: 28 } },
  steady:    { name: 'Steady',       kind: 'steady', pressure: 'light to moderate', len: [5 * M, 60 * M], rate: { recreational: [18, 20], club: [18, 20], competitive: [18, 22] } },
  tempo:     { name: 'Tempo',        kind: 'steady', pressure: 'moderate to hard', len: [4 * M, 12 * M],
               rate: { recreational: [22, 24], club: [22, 24], competitive: [24, 26] }, recover: () => 2 * M },
  threshold: { name: 'Threshold',    kind: 'work',   pressure: 'hard',     len: [M, 10 * M],
               rate: { recreational: [24, 26], club: [26, 28], competitive: [28, 30] },
               recover: (r) => (r > 8 * M ? 3 * M : 2 * M) },                     // 2 min, 3 min after long pieces
  race:      { name: 'Race pace',    kind: 'work',   pressure: 'very hard', len: [M, 5 * M],
               rate: { recreational: [28, 28], club: [30, 32], competitive: [32, 34] },
               recover: (r) => Math.ceil(r / M) * M },                            // about equal to the piece, in whole minutes
  sprint:    { name: 'Sprint',       kind: 'work',   pressure: 'maximum',  len: [20, 30], countdown: false,
               rate: { recreational: 32, club: 36, competitive: 40 }, set: 5,
               recover: (r) => (r <= 20 ? 90 : 2 * M), setRecover: [3 * M, 5 * M] }, // 1:30, or 2 min after 30 s; 3-5 min between sets of 5
  rung:      { name: 'Rung',         kind: 'steady', pressure: 'moderate, held constant', len: [30, 5 * M], step: 2, count: 5,
               climbRest: [M, 3 * M] },                                           // 1-3 min between climbs
  recover:   { name: 'Recover',      kind: 'rest',   pressure: 'light',    rate: { recreational: 18, club: 18, competitive: 18 } },
  cool:      { name: 'Cool-down',    kind: 'cool',   pressure: 'light',    len: [2 * M, 8 * M], rate: { recreational: 18, club: 18, competitive: 18 } },
};

// Module transitions with a designed animation, as 'from>to'. Any other change of module
// falls back to a plain swap, and the grammar check flags plans that would need one.
export const MODULE_TRANSITIONS = ['stages>rate'];
export const moduleOf = (word) => WORDS[word]?.detail || 'rate';

const lo = (w, L) => { const r = WORDS[w].rate[L]; return Array.isArray(r) ? r[0] : r; };
const hi = (w, L) => { const r = WORDS[w].rate[L]; return Array.isArray(r) ? r[1] : r; };

// ---------- Sessions ----------
// Each session is four facts: its words, its shape, its 15-minute form (start) and the
// piece length it prefers (prefer) before growing by another piece. bestUpTo: past this
// length the session keeps scaling, getting more demanding, and says so on its card.
export const LENGTH = { min: 15, max: 60, step: 5 };
export const TYPES = [
  { id: 'recovery',  kind: 'cool',   name: 'Recovery',      desc: 'Light paddle to flush the legs.',          warm: 'easy',     effort: 1, bestUpTo: 45,
    shape: 'block', word: 'easy' },
  { id: 'steady',    kind: 'steady', name: 'Steady state',  desc: 'Long, easy aerobic base.',                 warm: 'short',    effort: 1, bestUpTo: 60,
    shape: 'block', word: 'steady' },
  { id: 'ladder',    kind: 'steady', name: 'Rate ladder',   desc: 'Same pressure, two strokes up each rung.', warm: 'standard', effort: 2, bestUpTo: 60,
    shape: 'ladder', word: 'rung', start: 30, prefer: M, most: 15 },                     // unit per share; up to 3 climbs
  { id: 'tempo',     kind: 'steady', name: 'Tempo',         desc: 'Sustained and comfortably hard.',          warm: 'standard', effort: 2, bestUpTo: 55,
    shape: 'equal', word: 'tempo', start: [4 * M, 4 * M], prefer: 8 * M, most: 4 },
  { id: 'threshold', kind: 'work',   name: 'Threshold',     desc: 'Long reps just under race effort.',        warm: 'firm',     effort: 3, bestUpTo: 60,
    shape: 'equal', word: 'threshold', start: [3.5 * M, 3.5 * M], prefer: 6 * M, most: 5 },
  { id: 'pyramid',   kind: 'work',   name: 'Pyramid',       desc: 'Pieces build up, then step down.',         warm: 'firm',     effort: 3, bestUpTo: 45,
    shape: 'pyramid', word: 'threshold', start: M, prefer: M, most: 4, unitMax: 2.5 * M },  // unit per share; up to 4 levels
  { id: 'power',     kind: 'work',   name: 'Power sprints', desc: 'Short bursts with full recovery.',         warm: 'firm',     effort: 4, bestUpTo: 45,
    shape: 'equal', word: 'sprint', start: [20, 20, 20, 20], prefer: 20, most: 30, fixed: true },
  { id: 'vo2',       kind: 'work',   name: '2k pace',       desc: 'Race-rhythm reps with equal rest.',        warm: 'firm',     effort: 4, bestUpTo: 55,
    shape: 'equal', word: 'race', start: [M, M, M], prefer: 2 * M, most: 8 },
];

// Cover colours show how hard a session is: four effort levels, cool to hot,
// using the app's original palette.
// Sessions are listed easiest first, so swiping right means harder.
export const EFFORT = {
  1: { bg: '#B9A6FF', ink: '#1B1433' },  // easy: lilac
  2: { bg: '#2EC4B6', ink: '#04201D' },  // moderate: teal
  3: { bg: '#FF9F1C', ink: '#231300' },  // hard: orange
  4: { bg: '#FF3B5C', ink: '#2A0008' },  // very hard: red
};
TYPES.forEach((t) => { t.cover = EFFORT[t.effort]; });

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
// A coach number at or below s: whole minutes from 5 minutes, half minutes below, tens under a minute.
export const coachStep = (s) => (s >= 5 * M ? M : s >= M ? 30 : 10);
const downCoach = (s) => Math.floor(s / coachStep(s)) * coachStep(s);
const sum = (arr) => arr.reduce((a, s) => a + s.dur, 0);
const seg = (w, spm, dur, extra = {}) => ({ word: w, name: WORDS[w].name, kind: WORDS[w].kind, spm, dur: Math.round(dur), ...extra });

export const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

// ---------- Warm-up and cool-down lengths ----------
// From the library: at most 8 minutes for hard sessions' warm-ups (they include drills and
// Firm strokes), 6 otherwise; cool-downs 2 to 5. [min, max, share of the session], in minutes.
const FRAME = {
  firm:     { warm: [4, 8, 0.15], cool: [2, 5, 0.08] },
  standard: { warm: [3, 6, 0.10], cool: [2, 5, 0.07] },
  short:    { warm: [3, 4, 0.07], cool: [2, 3, 0.05] },
  easy:     { warm: [3, 4, 0.07], cool: [2, 3, 0.05] },
};
const half = (s) => Math.round(s / 30) * 30;
const span3 = (r, T) => clamp(half(r[2] * T * M), r[0] * M, r[1] * M);   // T in minutes

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

  let pick = clamp(down30(total * 0.3), WORDS.pick.len[0], WORDS.pick.len[1]);
  let firmT = firm ? (total >= 6 * M ? 90 : WORDS.firm.len[0]) : 0;
  let settle = firm ? WORDS.easy.len[0] : 0;
  const avail = total - pick - firmT - settle;
  // Builds share the time that's left, each within its limits; the top steps go if it's short.
  let n = builds.length;
  const per = (k) => (k ? clamp(down30(avail / k), WORDS.build.len[0], WORDS.build.len[1]) : 0);
  while (n && n * per(n) > avail) n--;
  builds.length = n;
  let buildT = per(n);
  let left = avail - n * buildT;
  // Anything left lengthens the builds, then the pick drill, then the Firm strokes, all within limits.
  if (n) { const a = Math.min(down30(left / n), WORDS.build.len[1] - buildT); buildT += a; left -= a * n; }
  { const a = Math.min(down30(left), WORDS.pick.len[1] - pick); pick += a; left -= a; }
  if (firm) { const a = Math.min(down30(left), WORDS.firm.len[1] - firmT); firmT += a; left -= a; }
  // Still more: the settle takes it before hard sessions; otherwise it moves to the
  // cool-down, so Easy never sits right next to the pick drill at the same rate.
  let spill = 0;
  // The settle takes whole half minutes; any seconds left go to the cool-down.
  if (firm) { settle += down30(left); spill = left - down30(left); } else spill = left;
  const head = [seg('pick', lo('pick', L), pick)];
  const tail = builds.map((r) => seg('build', r, buildT));
  if (firm) tail.push(seg('firm', firmRate, firmT), seg('easy', lo('easy', L), settle));
  // A Steady block, when there is one, sits between the pick drill and the builds.
  return { head, tail, spill };
}

// ---------- Cool-down phrase ----------
function coolPhrase(total, L, before) {
  // One Cool-down interval; it never goes back up after a lower-rate finish, as in Recovery.
  return [seg('cool', Math.min(lo('cool', L), before), total)];
}

// The most a warm-up can hold with every word at its upper limit. A warm-up never
// gets more than this, so it never has to spill time into easy filler.
function warmCapacity(style, mainRate, L) {
  if (style === 'easy') return WORDS.easy.len[1];
  const firm = style === 'firm';
  const ceil = firm ? Math.min(lo('firm', L), mainRate) : mainRate;
  let builds = 0;
  for (let r = WORDS.build.from; r < ceil; r += WORDS.build.step) builds++;
  return WORDS.pick.len[1] + builds * WORDS.build.len[1] + (firm ? WORDS.firm.len[1] + 2 * M : 0);
}

// ---------- Growth ----------
// A shape is a list of pieces. Growth is one sequence of states, from the session's start,
// each one step: lengthen the piece furthest below its share, or add a piece at its share.
const shares = (ty, n) => {
  if (ty.shape === 'pyramid') { const L = (n + 1) / 2; return Array.from({ length: n }, (_, i) => (i < L ? i + 1 : n - i)); }
  if (ty.shape === 'ladder') { const k = WORDS.rung.count; return Array.from({ length: n }, (_, j) => k - (j % k)); }
  return Array(n).fill(1);
};
const lenMax = (ty) => WORDS[ty.word].len[1];

// The piece furthest below its share (the last such piece, so sets build towards the end;
// pyramids and ladders take the lowest level first). Lengthening it keeps the shape: mirror
// pieces in a pyramid and the same rung in every climb change together.
function lengthen(ty, p) {
  const sh = shares(ty, p.length);
  // Candidates, furthest below their share first (ties: the last piece for equal sets, so
  // they build towards the end; the lowest level for pyramids and ladders).
  const order = p.map((_, i) => i).sort((a, b) => (p[a] / sh[a] - p[b] / sh[b]) || (ty.shape === 'equal' ? b - a : a - b));
  for (const k of order) {
    const l = p[k] + coachStep(p[k]);
    if (l > lenMax(ty) || (ty.unitMax && l / sh[k] > ty.unitMax)) continue;
    const q = [...p];
    if (ty.shape === 'pyramid') { q[k] = l; q[p.length - 1 - k] = l; }
    else if (ty.shape === 'ladder') { const kk = WORDS.rung.count; for (let j = k % kk; j < q.length; j += kk) q[j] = l; }
    else q[k] = l;
    // Pyramids rise to the peak and ladders descend within a climb, strictly.
    const L = (q.length + 1) / 2;
    if (ty.shape === 'pyramid' && q.slice(0, L).some((v, j) => j && v <= q[j - 1])) continue;
    if (ty.shape === 'ladder' && q.slice(0, WORDS.rung.count).some((v, j) => j && v >= q[j - 1])) continue;
    return q;
  }
  return null;
}

// One more piece at its share: equal pieces share the existing work over one more piece
// (never less work); a pyramid gains a level; a ladder its next rung; sprints one sprint.
function add(ty, p) {
  if (ty.shape === 'equal') {
    const n = p.length + 1;
    if (n > ty.most) return null;
    if (ty.fixed) return [...p, ty.prefer];
    const W = p.reduce((a, b) => a + b, 0);
    let l = W / n; l = Math.floor(l / coachStep(l)) * coachStep(l);
    if (l < WORDS[ty.word].len[0] || l < ty.start[0]) return null;
    const q = Array(n).fill(l);
    for (let k = n - 1; q.reduce((a, b) => a + b, 0) < W; k = (k - 1 + n) % n) q[k] += coachStep(q[k]);
    return q;
  }
  if (ty.shape === 'pyramid') {
    const L = (p.length + 1) / 2;
    if (L + 1 > ty.most) return null;
    const up = p.slice(0, L);
    return [...up, half((L + 1) * p[0]), ...up.slice().reverse()];
  }
  if (p.length + 1 > ty.most) return null;
  return [...p, p[p.length % WORDS.rung.count]];
}

const unitOf = (ty, p) => (ty.shape === 'equal' ? Math.min(...p) : p[0] / shares(ty, p.length)[0]);
function startOf(ty) {
  if (ty.shape === 'pyramid') return [ty.start, 2 * ty.start, ty.start];
  if (ty.shape === 'ladder') return shares(ty, WORDS.rung.count).map((s) => s * ty.start);
  return [...ty.start];
}
// The session's whole growth: lengthen until pieces reach the preferred length, then add.
const GROWTH = {};
export function growth(id) {
  if (GROWTH[id]) return GROWTH[id];
  const ty = TYPES.find((t) => t.id === id);
  const out = [{ op: 'start', pieces: startOf(ty) }];
  for (let guard = 0; guard < 400; guard++) {
    const p = out[out.length - 1].pieces;
    const ready = unitOf(ty, p) >= ty.prefer;
    const tryOps = ready ? [['add', add], ['lengthen', lengthen]] : [['lengthen', lengthen], ['add', add]];
    let next = null, op = null;
    for (const [name, f] of tryOps) { next = f(ty, p); if (next) { op = name; break; } }
    if (!next) break;
    out.push({ op, pieces: next });
  }
  return (GROWTH[id] = out);
}

// ---------- Rendering a main set ----------
function mainSet(ty, p, L) {
  const W = WORDS[ty.word], n = p.length, out = [];
  p.forEach((d, i) => {
    let spm;
    if (ty.shape === 'ladder') spm = hi('steady', L) + (i % WORDS.rung.count) * WORDS.rung.step;
    else if (ty.id === 'pyramid') spm = hi('threshold', L);
    else if (ty.word === 'threshold') spm = i < n / 2 ? lo('threshold', L) : hi('threshold', L);   // progresses over the set
    else if (ty.word === 'race') spm = i === n - 1 ? hi('race', L) : lo('race', L);                 // the last one faster
    else if (ty.word === 'tempo') spm = i % 2 ? hi('tempo', L) : lo('tempo', L);                    // alternating
    else spm = lo(ty.word, L);
    out.push(seg(ty.word, spm, d, { rep: i + 1, of: n }));
    if (i === n - 1) return;
    let rest;
    let block = false;
    if (ty.shape === 'ladder') { if ((i + 1) % WORDS.rung.count) return; rest = WORDS.rung.climbRest[0]; block = true; }   // between climbs
    else if (ty.shape === 'pyramid') rest = Math.max(M, Math.floor(p[0] / M) * M);                   // one step, in whole minutes
    else if (W.set && (i + 1) % W.set === 0) { rest = W.setRecover[0]; block = true; }               // between sets of sprints
    else rest = W.recover(d);                                                                        // follows its piece
    out.push(seg('recover', lo('recover', L), rest, block ? { block: true } : {}));
  });
  return out;
}

// ---------- Composition ----------
export function buildPlan(id, T, L = 'recreational') {
  const ty = TYPES.find((t) => t.id === id);
  T = clamp(T, LENGTH.min * M, LENGTH.max * M);
  const f = FRAME[ty.warm], tm = T / M;
  let warmT = span3(f.warm, tm), coolT = span3(f.cool, tm);
  // A warm-up never starts longer than its steps can hold; the main set gets the difference.
  const firstRate = ty.shape === 'block' ? lo(ty.word, L) : mainSet(ty, growth(id)[0].pieces, L)[0].spm;
  warmT = Math.min(warmT, Math.max(f.warm[0] * M, warmCapacity(ty.warm, firstRate, L)));
  const main = T - warmT - coolT;
  let set;
  if (ty.shape === 'block') {
    const len = Math.floor(main / M) * M;
    set = [seg(ty.word, ty.word === 'easy' ? hi('easy', L) : lo(ty.word, L), len)];
  } else {
    let p = growth(id)[0].pieces;
    for (const g of growth(id)) { if (sum(mainSet(ty, g.pieces, L)) > main) break; p = g.pieces; }
    set = mainSet(ty, p, L);
  }
  // Leftover time, in order: rests between blocks, the warm-up's steps, the cool-down.
  let left = main - sum(set);
  const mainRate = set[0].spm;
  const blocks = set.filter((sg) => sg.block);
  if (blocks.length && left > 0) {
    const range = ty.shape === 'ladder' ? WORDS.rung.climbRest : WORDS[ty.word].setRecover;
    const add = Math.min(Math.floor(left / blocks.length / 30) * 30, range[1] - blocks[0].dur);
    if (add > 0) { blocks.forEach((sg) => { sg.dur += add; }); left -= add * blocks.length; }
  }
  const cap = Math.min(f.warm[1] * M, warmCapacity(ty.warm, mainRate, L));
  const easyRun = (w) => Math.max(0, ...[...w.head, ...w.tail].filter((sg) => sg.word === 'easy').map((sg) => sg.dur));
  let extra = 0;
  for (let a = 30; a <= left && warmT + a <= cap; a += 30) {
    const w = warmPhrase(ty.warm, warmT + a, mainRate, L);
    if (w.spill || (ty.warm !== 'easy' && easyRun(w) > 4 * M)) break;
    extra = a;
  }
  warmT += extra; left -= extra;
  coolT += left;
  const warm = warmPhrase(ty.warm, warmT, mainRate, L);
  const segs = [...warm.head, ...warm.tail, ...set, ...coolPhrase(coolT + (warm.spill || 0), L, set[set.length - 1].spm)];
  segs.beyond = T > ty.bestUpTo * M;
  return segs;
}

export const planTotal = sum;
