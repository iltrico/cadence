// Plan outline: how a plan is written on the back of its card. It only changes how a plan
// is shown; the plan, the plan bar and the workout screens use the intervals as they are.
//
// 1. One row per run of identical pieces (same word, length and rate, and the same rest).
//    Different lengths or rates make separate rows, including each warm-up step.
// 2. A piece's rest stays on its row, as a second line. Rests between blocks (between
//    ladder climbs) get their own row.
// 3. Equal sets are written once, with their count; the break between sets joins the rest line.
// Every interval belongs to exactly one row.

const M = 60;
const NB = '\u00a0';

// Human durations: 30 s, 8 min, 3:30. Values never break across lines.
export function dur(s) {
  if (s < M) return `${s}${NB}s`;
  return s % M ? `${Math.floor(s / M)}:${String(s % M).padStart(2, '0')}` : `${s / M}${NB}min`;
}

// text(key, vars) translates; name(seg) gives a word's shown name.
export function outline(plan, type, text, name) {
  const rows = [];
  let at = 0;
  const push = (from, to, fields) => {
    const d = plan.slice(from, to).reduce((a, s) => a + s.dur, 0);
    rows.push({ start: at, dur: d, from, to, ...fields });
    at += d;
  };
  const rate = (s) => `${s.spm}${NB}${text('spm')}`;
  const end = plan.length - 1;
  let i = 0;

  // Equal sets: one row for every set, from the first sprint to the end of the last set.
  if (type.shape === 'sets') {
    while (i < end && plan[i].word !== type.word) { push(i, i + 1, { kind: plan[i].kind, name: name(plan[i]), len: dur(plan[i].dur), rate: rate(plan[i]) }); i++; }
    const work = plan.slice(i, end).filter((s) => s.word === type.word);
    const breaks = plan.slice(i, end).filter((s) => s.block);
    const sets = breaks.length + 1, per = work.length / sets;
    const inner = plan.slice(i, end).find((s) => s.word === 'recover' && !s.block);
    const restLine = breaks.length
      ? text('ol.setsRest', { rest: dur(inner.dur), brk: dur(breaks[0].dur) })
      : inner ? text('ol.restLine', { rest: dur(inner.dur) }) : null;
    push(i, end, {
      kind: work[0].kind, name: sets > 1 ? text('ol.sets', { s: sets, n: per, word: name(work[0]) }) : text('ol.times', { n: per, word: name(work[0]) }),
      rest: restLine, len: dur(work[0].dur), rate: rate(work[0]),
    });
    push(end, plan.length, { kind: plan[end].kind, name: name(plan[end]), len: dur(plan[end].dur), rate: rate(plan[end]) });
    return rows;
  }

  // Units: each piece with the rest that follows it, or a rest between blocks on its own.
  const units = [];
  for (let k = i; k < end;) {
    const piece = plan[k], next = plan[k + 1];
    if (piece.word === 'recover') { units.push({ from: k, to: k + 1, rest: piece, between: true }); k++; continue; }
    const rest = next && k + 1 < end && next.word === 'recover' && !next.block ? next : null;
    units.push({ from: k, to: k + (rest ? 2 : 1), piece, rest });
    k += rest ? 2 : 1;
  }
  // Rows: neighbouring units with the same piece (word, length, rate) and the same rest join.
  // The last unit of a run may have no rest: the run simply ends there.
  const same = (a, b) => a.piece && b.piece && a.piece.word === b.piece.word && a.piece.dur === b.piece.dur && a.piece.spm === b.piece.spm;
  for (let u = 0; u < units.length;) {
    const first = units[u];
    if (first.between) { push(first.from, first.to, { kind: 'rest', name: text('ol.rest'), len: dur(first.rest.dur) }); u++; continue; }
    let v = u + 1;
    while (v < units.length && units[v - 1].rest && same(first, units[v]) && (!units[v].rest || units[v].rest.dur === first.rest.dur)) v++;
    const n = v - u, last = units[v - 1];
    push(first.from, last.to, {
      kind: first.piece.kind, name: n > 1 ? text('ol.times', { n, word: name(first.piece) }) : name(first.piece),
      rest: first.rest ? text('ol.restLine', { rest: dur(first.rest.dur) }) : null, len: dur(first.piece.dur), rate: rate(first.piece),
    });
    u = v;
  }
  push(end, plan.length, { kind: plan[end].kind, name: name(plan[end]), len: dur(plan[end].dur), rate: rate(plan[end]) });
  return rows;
}
