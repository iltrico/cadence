// Plan outline: how a plan is written on the back of its card, the way a coach writes a
// session on a whiteboard. It only changes how a plan is shown; the plan, the plan bar and
// the workout screens use the intervals as they are.
//
// Rows: the warm-up (one row, its parts named), one row per group of the main set (a run
// of identical pieces, a set of sprints, a ladder climb, a pyramid), a row for each rest
// between blocks, and the cool-down. Every interval belongs to exactly one row.

const WARM = ['pick', 'easy', 'build', 'firm'];
const M = 60;

// Values never break across lines: a no-break space before units, a word joiner after dashes.
const NB = '\u00a0', DASH = '–\u2060';
// Human durations: 30 s, 8 min, 3:30. Ranges: 9–10 min, 3:00–3:30.
export function dur(s) {
  if (s < M) return `${s}${NB}s`;
  return s % M ? `${Math.floor(s / M)}:${String(s % M).padStart(2, '0')}` : `${s / M}${NB}min`;
}
function durRange(values) {
  const lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) return dur(lo);
  if (lo % M === 0 && hi % M === 0) return `${lo / M}${DASH}${hi / M}${NB}min`;
  const mss = (v) => `${Math.floor(v / M)}:${String(v % M).padStart(2, '0')}`;
  return `${mss(lo)}${DASH}${mss(hi)}`;
}
const stepsText = (pieces) => pieces.map((d) => (d % M ? `${Math.floor(d / M)}:${String(d % M).padStart(2, '0')}` : d / M)).join('-\u2060');

// Rates: one value, a progression (24–26) or an alternation (22/24).
function rateText(segs) {
  const r = segs.map((s) => s.spm), uniq = [...new Set(r)];
  if (uniq.length === 1) return `${uniq[0]}`;
  // Alternation needs at least three values going back and forth (22, 24, 22); two rising
  // values are a progression.
  const alternating = r.length >= 3 && uniq.length === 2 && r.every((v, i) => i === 0 || v !== r[i - 1]);
  return alternating ? `${r[0]}/\u2060${r[1]}` : `${Math.min(...r)}${DASH}${Math.max(...r)}`;
}

// text(key, vars) translates; name(seg) gives a word's shown name.
export function outline(plan, type, text, name) {
  const rows = [];
  let at = 0, i = 0;
  const push = (kind, from, to, label) => {
    const segs = plan.slice(from, to), d = segs.reduce((a, s) => a + s.dur, 0);
    rows.push({ kind, start: at, dur: d, label, from, to });
    at += d;
  };
  // Warm-up: one row, its parts in order (Build with its rate range).
  const warmEnd = type.shape === 'block' ? plan.length - 2 : (() => { let k = 0; while (k < plan.length - 1 && WARM.includes(plan[k].word)) k++; return k; })();
  if (warmEnd > 0) {
    const parts = [], warm = plan.slice(0, warmEnd);
    for (const w of ['pick', 'build', 'firm']) {
      const ws = warm.filter((s) => s.word === w);
      if (!ws.length) continue;
      parts.push(w === 'build' ? `${name(ws[0])} ${rateText(ws)}` : name(ws[0]));
    }
    if (!parts.length) parts.push(name(warm[0]));
    push('warm', 0, warmEnd, text('ol.warm', { time: dur(warm.reduce((a, s) => a + s.dur, 0)), parts: parts.join(', ') }));
  }
  i = warmEnd;
  const end = plan.length - 1;
  // Main set, split at rests between blocks.
  while (i < end) {
    if (plan[i].word === 'recover' && plan[i].block) { push('rest', i, i + 1, text('ol.rest', { time: dur(plan[i].dur) })); i++; continue; }
    let j = i;
    while (j < end && !(plan[j].word === 'recover' && plan[j].block)) j++;
    const group = plan.slice(i, j), work = group.filter((s) => s.word !== 'recover'), rests = group.filter((s) => s.word === 'recover');
    if (type.shape === 'block') {
      push('work', i, j, text('ol.block', { len: dur(work[0].dur), word: name(work[0]), rate: rateText(work) }));
    } else if (type.shape === 'ladder') {
      const label = work.length === 1
        ? text('ol.block', { len: dur(work[0].dur), word: name(work[0]), rate: `${work[0].spm}` })
        : text('ol.climb', { steps: stepsText(work.map((s) => s.dur)), from: work[0].spm, to: work[work.length - 1].spm });
      push('work', i, j, label);
    } else if (type.shape === 'pyramid') {
      push('work', i, j, text('ol.steps', { steps: stepsText(work.map((s) => s.dur)), word: name(work[0]), rate: rateText(work), rest: durRange(rests.map((s) => s.dur)) }));
    } else {
      // Equal pieces: one row per run of the same rate when the word's rate eases with length
      // (2k then 5k pace), otherwise one row for the group.
      const runs = [];
      let k = i;
      while (k < j) {
        let m = k + 1;
        if (plan[k].word !== 'recover') {
          const eases = work.length && plan[k].word === 'race';
          while (m < j && (plan[m].word === 'recover' || !eases || plan[m].spm === plan[k].spm)) m++;
          // A run ends after its last piece; the rest that follows belongs to it unless it's the last.
          if (m < j && plan[m - 1].word !== 'recover') { /* m is a piece of a new run */ }
        }
        runs.push([k, m]); k = m;
      }
      for (const [a, b] of runs) {
        const rs = plan.slice(a, b), w = rs.filter((s) => s.word !== 'recover'), r = rs.filter((s) => s.word === 'recover');
        const vars = { n: w.length, len: durRange(w.map((s) => s.dur)), word: name(w[0]), rate: rateText(w) };
        push('work', a, b, r.length ? text('ol.repsRest', { ...vars, rest: durRange(r.map((s) => s.dur)) }) : text(w.length > 1 ? 'ol.reps' : 'ol.block', vars));
      }
    }
    i = j;
  }
  push('cool', end, plan.length, text('ol.cool', { time: dur(plan[end].dur) }));
  return rows;
}
