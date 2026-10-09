import { KIND, TYPES, WORDS, buildPlan, fmt, planTotal } from './plan.js';
import { t, LOCALE, translatePage } from './i18n.js';

// Shown names: plans keep English data; the interface translates words and sessions.
const wordName = (s) => (s.word ? t(`word.${s.word}`) : s.name);
const typeName = (id) => t(`type.${id}`);
const rateText = (r) => r.replace('spm', t('spm'));

const $ = (id) => document.getElementById(id);
const COUNTDOWN_STROKES = 4;

const LIMITS = {
  time: { min: 10, max: 120, step: 5, unit: 'minutes' },
  distance: { min: 2000, max: 30000, step: 500, unit: 'meters' },
};

// ---------- State ----------
const saved = (() => { try { return JSON.parse(localStorage.getItem('cadence') || '{}'); } catch { return {}; } })();
const state = {
  type: saved.type || 'steady',
  mode: saved.mode || 'time',
  minutes: saved.minutes || 30,
  meters: saved.meters || 6000,
  split: saved.split || '2:10',
};
let plan = [];

const persist = () => { try { localStorage.setItem('cadence', JSON.stringify(state)); } catch {} };

const parseSplit = (str) => {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(str).trim());
  if (!m) return null;
  const s = +m[1] * 60 + +m[2];
  return s >= 80 && s <= 300 ? s : null;
};

const targetSeconds = () => {
  if (state.mode === 'time') return state.minutes * 60;
  const split = parseSplit(state.split) ?? 130;
  // Easier strokes in warm-up, rest and cool-down are slower; ~6% buffer on top of the usual split.
  return Math.round((state.meters / 500) * split * 1.06 / 60) * 60;
};

// ---------- Setup screen ----------
// Program picker: horizontal snap carousel. The card that settles in the centre is the selection.
function buildTypes() {
  $('types').innerHTML = TYPES.map((ty) => `
    <button type="button" class="type" role="radio" data-id="${ty.id}"
      style="--cbg:${ty.cover.bg};--cfg:${ty.cover.ink}">
      <span class="t-top"><span class="t-rate">${rateText(ty.rate)}</span><span class="t-badge" aria-hidden="true">${t('bestFrom', { n: ty.xBelow })}</span></span>
      <span class="t-name">${typeName(ty.id)}</span>
      <span class="t-desc">${t(`desc.${ty.id}`)}</span>
    </button>`).join('');
  $('dots').innerHTML = TYPES.map(() => '<span></span>').join('');
}

function renderTypes() {
  const i = TYPES.findIndex((t) => t.id === state.type);
  document.querySelectorAll('.type').forEach((b, j) => {
    b.setAttribute('aria-checked', j === i);
    b.tabIndex = j === i ? 0 : -1;
    // Below its full format, a session says from which length it works best.
    const x = !!(allPlans[j] && allPlans[j].express);
    const hint = t('bestFrom', { n: TYPES[j].xBelow });
    // The badge always holds its place, so the row never shifts; it only fades in and out.
    b.querySelector('.t-badge').classList.toggle('on', x);
    b.setAttribute('aria-label', `${typeName(TYPES[j].id)}${x ? `, ${hint.toLowerCase()}` : ''}`);
  });
}

// Continuous, scroll-driven styling: every card's scale, fade and text parallax
// follow its live distance from the centre, so the picker tracks the finger 1:1.
let cardsRaf = 0;
function updateCards() {
  cardsRaf = 0;
  const box = $('types');
  const cards = box.querySelectorAll('.type');
  if (!cards.length) return;
  const mid = box.scrollLeft + box.offsetLeft + box.clientWidth / 2;
  const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 1;
  let pos = 0;
  cards.forEach((c, j) => {
    const off = (c.offsetLeft + c.offsetWidth / 2 - mid) / step; // signed, in cards
    const d = Math.min(1, Math.abs(off));
    c.style.transform = `scale(${1 - 0.08 * d}) rotateY(${Math.max(-1, Math.min(1, off)) * -8}deg)`;
    c.style.opacity = (1 - 0.55 * d).toFixed(3);
    c.style.setProperty('--shift', `${Math.max(-1, Math.min(1, off)) * 28}px`);
    if (Math.abs(off) < 0.5) pos = j - off;
  });
  // Plan bar follows the drag: blend between the two cards either side of centre.
  const p = Math.max(0, Math.min(cards.length - 1, pos));
  const a = Math.floor(p), b = Math.min(cards.length - 1, a + 1);
  drawBar(a, b, p - a);
  box.querySelectorAll('.type').length && document.querySelectorAll('#dots span').forEach((dot, j) => {
    const t = Math.max(0, 1 - Math.abs(pos - j));
    dot.style.width = `${0.45 + 0.95 * t}rem`;
    dot.style.background = `color-mix(in srgb, var(--ink) ${Math.round(t * 100)}%, var(--line))`;
  });
}
const queueCards = () => { if (!cardsRaf) cardsRaf = requestAnimationFrame(updateCards); };
window.addEventListener('resize', queueCards);

function centreCard(id, smooth = true) {
  const el = document.querySelector(`.type[data-id="${id}"]`);
  const box = $('types');
  // Layout offset relative to the scroller, unaffected by the cards' live transforms.
  const left = el.offsetLeft - box.offsetLeft;
  box.scrollTo({ left: left + el.offsetWidth / 2 - box.clientWidth / 2, behavior: smooth ? 'smooth' : 'instant' });
}

function pickCentred() {
  const box = $('types');
  const mid = box.scrollLeft + box.offsetLeft + box.clientWidth / 2;
  let best = null, dist = Infinity;
  document.querySelectorAll('.type').forEach((b) => {
    const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid);
    if (d < dist) { dist = d; best = b.dataset.id; }
  });
  if (best && best !== state.type) { state.type = best; refresh(); }
}

function renderLength() {
  const L = LIMITS[state.mode];
  const value = state.mode === 'time' ? state.minutes : state.meters;
  document.querySelectorAll('.toggle button').forEach((b) => b.setAttribute('aria-checked', b.dataset.mode === state.mode));
  const shown = state.mode === 'time' ? value : value.toLocaleString(LOCALE);
  $('amount').innerHTML = `${shown}<small>${t(L.unit)}</small>`;
  $('amount').classList.toggle('long', state.mode === 'distance');
  $('minus').disabled = value <= L.min;
  $('plus').disabled = value >= L.max;
  $('splitRow').hidden = state.mode !== 'distance';
  $('split').setAttribute('aria-invalid', parseSplit(state.split) === null);
}

function popEl(el) {
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)', offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
}

// Plans for every session at the chosen length, so the bar can morph between
// neighbouring cards while you swipe. Each plan is spread over the same number of
// slots; slots a plan doesn't use have zero width, so segments split and merge.
let allPlans = [], slotPlans = [];
const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));

function buildSlots() {
  const T = Math.max(600, targetSeconds());
  allPlans = TYPES.map((t) => buildPlan(t.id, T));
  const N = Math.max(...allPlans.map((p) => p.length));
  slotPlans = allPlans.map((p) => {
    const slots = Array.from({ length: N }, () => null);
    p.forEach((seg, j) => { slots[p.length === 1 ? 0 : Math.round((j * (N - 1)) / (p.length - 1))] = seg; });
    let kind = p[0].kind;
    return slots.map((seg) => {
      if (seg) kind = seg.kind;
      return { w: seg ? seg.dur : 0, c: hexRgb(KIND[kind].bg) };
    });
  });
  const strip = $('strip');
  if (strip.children.length !== N) strip.innerHTML = '<span></span>'.repeat(N);
}

function drawSlots(A, B, t) {
  [...$('strip').children].forEach((el, k) => {
    const w = A[k].w + (B[k].w - A[k].w) * t;
    el.style.flex = `${w} 0 0`;
    el.style.display = w < 0.5 ? 'none' : '';
    el.style.background = `rgb(${A[k].c.map((v, q) => Math.round(v + (B[k].c[q] - v) * t)).join(',')})`;
  });
}
function drawBar(a, b, t) {
  const A = slotPlans[a], B = slotPlans[b];
  if (!A || !B) return;
  cancelAnimationFrame(barTween); barTween = 0;   // a swipe takes over from any length tween
  drawSlots(A, B, t);
}

// Spread a slot list over N slots, keeping order, so two plans can blend even when
// the number of slots changed with the length.
function resample(slots, N) {
  if (slots.length === N) return slots;
  const out = Array.from({ length: N }, () => null);
  slots.forEach((sl, j) => { out[slots.length === 1 ? 0 : Math.round((j * (N - 1)) / (slots.length - 1))] = sl; });
  let c = slots[0].c;
  return out.map((sl) => { if (sl) { c = sl.c; return sl; } return { w: 0, c }; });
}

// Changing the length morphs the bar from the old plan to the new one, like a swipe.
let barTween = 0;
function tweenBar(from, to) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { drawSlots(to, to, 0); return; }
  const A = resample(from, to.length), t0 = performance.now(), D = 320;
  cancelAnimationFrame(barTween);
  const step = (now) => {
    const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
    drawSlots(A, to, e);
    barTween = k < 1 ? requestAnimationFrame(step) : 0;
  };
  barTween = requestAnimationFrame(step);
}

function renderPlan(animate = false) {
  const idx = TYPES.findIndex((t) => t.id === state.type);
  const before = slotPlans[idx];
  buildSlots();
  plan = allPlans[idx];
  const total = planTotal(plan);
  if (animate && before) tweenBar(before, slotPlans[idx]);
  else drawBar(idx, idx, 0);
  let at = 0;
  $('planList').innerHTML = plan.map((s) => {
    const row = `<li><span class="p-at">${fmt(at)}</span><span class="p-dot" style="background:${KIND[s.kind].bg}"></span>
      <span class="p-name">${wordName(s)}</span><span class="p-spm">${s.spm} ${t('spm')}</span><span class="p-dur">${fmt(s.dur)}</span></li>`;
    at += s.dur;
    return row;
  }).join('');
  $('start').textContent = t('start', { time: fmt(total) });
}

function refresh() { renderPlan(); renderTypes(); renderLength(); persist(); }

function setValue(v) {
  const L = LIMITS[state.mode];
  v = Math.min(L.max, Math.max(L.min, Math.round(v / L.step) * L.step));
  if (state.mode === 'time') state.minutes = v; else state.meters = v;
  renderPlan(true); renderTypes(); renderLength(); persist();
}

$('types').addEventListener('click', (e) => {
  const b = e.target.closest('.type'); if (!b) return;
  state.type = b.dataset.id; refresh(); centreCard(state.type);
});
let scrollTimer = 0;
$('types').addEventListener('scroll', () => {
  queueCards();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(pickCentred, 90);
}, { passive: true });
$('types').addEventListener('keydown', (e) => {
  if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  e.preventDefault();
  const i = TYPES.findIndex((t) => t.id === state.type);
  const n = Math.min(TYPES.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
  state.type = TYPES[n].id; refresh(); centreCard(state.type);
  document.querySelector(`.type[data-id="${state.type}"]`).focus({ preventScroll: true });
});
document.querySelector('.toggle').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.mode = b.dataset.mode; renderPlan(true); renderTypes(); renderLength(); persist();
});
$('minus').addEventListener('click', () => setValue((state.mode === 'time' ? state.minutes : state.meters) - LIMITS[state.mode].step));
$('plus').addEventListener('click', () => setValue((state.mode === 'time' ? state.minutes : state.meters) + LIMITS[state.mode].step));
$('planBtn').addEventListener('click', () => { $('planSheet').hidden = false; });
$('planClose').addEventListener('click', () => { $('planSheet').hidden = true; });
$('planSheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
$('split').addEventListener('input', (e) => {
  state.split = e.target.value;
  if (parseSplit(state.split) !== null) { renderPlan(true); renderTypes(); persist(); }
  renderLength();
});
$('split').value = state.split;

// ---------- Screens ----------
function show(id) {
  ['setup', 'row', 'done'].forEach((s) => { $(s).hidden = s !== id; });
  const meta = document.querySelector('meta[name="theme-color"]');
  meta.content = id === 'row' && run ? KIND[run.segs[run.idx]?.kind || 'warm'].bg : '#F4F6FB';
  document.documentElement.style.backgroundColor = id === 'row' && run ? KIND[run.segs[run.idx]?.kind || 'warm'].bg : '';
  window.scrollTo(0, 0);
}

// ---------- Keep the screen awake ----------
// Screen Wake Lock API only. Held from Start until the session ends, pauses included.
let wake = null, awake = false;

function holdWake() {
  awake = true;
  if (!('wakeLock' in navigator) || wake) return;
  navigator.wakeLock.request('screen').then((w) => {
    if (!awake) { w.release(); return; }
    wake = w;
    w.addEventListener('release', () => { wake = null; });
  }).catch(() => {});
}

function dropWake() {
  awake = false;
  try { wake?.release(); } catch {}
  wake = null;
}

// The system drops the lock when the app is hidden; take it back on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && awake) holdWake();
});

// ---------- Workout engine ----------
let run = null, raf = 0;

function resetCountdown() {
  $('centre').classList.remove('cd');
  const cd = $('countdown');
  cd.classList.remove('leaving');
  cd.setAttribute('aria-hidden', 'true');
  ['cdNum', 'cdName', 'cdRate', 'cdUnit'].forEach((id) => { $(id).textContent = ''; });
  $('cdNum').classList.remove('pop', 'go');
  $('cdFlash').classList.remove('on');
  $('cdBar').style.width = '0';
}
// Drop one-shot animation classes once they've played. A class left behind would replay
// its animation the next time the rowing screen is shown.
['spm', 'segLeft', 'cdNum', 'cdFlash', 'stageName'].forEach((id) => {
  $(id).addEventListener('animationend', (e) => e.currentTarget.classList.remove('pop', 'go', 'on'));
});
// Once the exit animation has played, drop the class so the panel is fully hidden again.
$('countdown').addEventListener('animationend', (e) => {
  if (e.animationName === 'cd-out') $('countdown').classList.remove('leaving');
});

function startRun() {
  const segs = plan.map((s) => ({ ...s }));
  const starts = []; let acc = 0;
  segs.forEach((s) => { starts.push(acc); acc += s.dur; });
  run = { segs, starts, total: acc, elapsed: 0, last: performance.now(), paused: false, phase: 0, idx: -1, txt: {}, cd: false, clockAnim: null, cueSpm: segs[0].spm,
    rowedBy: segs.map(() => 0), startedAt: new Date().toISOString(), type: state.type, mode: state.mode,
    target: state.mode === 'time' ? `${state.minutes} min` : `${state.meters} m` };
  $('ticks').innerHTML = starts.slice(1).map((t) => `<span style="left:${(t / acc) * 100}%"></span>`).join('');
  $('pause').textContent = t('pause');
  resetCountdown();
  shownRate = null;
  show('row');
  holdWake();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

const idxAt = (t) => {
  let i = run.starts.length - 1;
  while (i > 0 && run.starts[i] > t) i--;
  return i;
};

// Rate change between intervals: step one stroke at a time, then pop.
// The pop starts just before the last step so its swell peaks as the final number lands.
// Short enough that the rate, clock, colour and panel exit all land together.
const TICK_MS = 500, POP_LEAD_MS = 150;
let tickTimers = [], shownRate = null;
function tickRate(to) {
  const el = $('spm');
  tickTimers.forEach(clearTimeout); tickTimers = [];
  const from = shownRate;
  shownRate = to;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (from === null || from === to || reduce) { el.textContent = to; return; }
  const steps = Math.abs(to - from), dir = Math.sign(to - from), each = TICK_MS / steps;
  for (let k = 1; k <= steps; k++) tickTimers.push(setTimeout(() => { el.textContent = from + dir * k; }, k * each));
  tickTimers.push(setTimeout(() => {
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }, Math.max(0, TICK_MS - POP_LEAD_MS)));
}

// Interval clock: count up to the new interval's time in 15-second ticks, then pop.
// Starts on the switch, as the countdown panel bursts out.
function startClockTick() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  run.clockAnim = { t0: performance.now(), popped: false };
}

const MODULES = { rate: ['.rail', '.rate'], stages: ['.stage-bar', '.stage-text'] };
function swapModules(from, to) {
  const play = (sel, cls) => {
    const el = document.querySelector(`#row ${sel}`);
    el.classList.remove('mod-in', 'mod-out'); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  };
  (MODULES[from] || []).forEach((sel) => play(sel, 'mod-out'));
  (MODULES[to] || []).forEach((sel) => play(sel, 'mod-in'));
}

function enterSeg(i) {
  const first = run.idx < 0;
  run.idx = i;
  const s = run.segs[i], k = KIND[s.kind];
  if (!first) startClockTick();
  const row = $('row');
  row.style.setProperty('--bg', k.bg);
  row.style.setProperty('--fg', k.ink);
  document.querySelector('meta[name="theme-color"]').content = k.bg;
  document.documentElement.style.backgroundColor = k.bg;
  $('segName').textContent = wordName(s);
  // Each word shows its own modules: the rhythm cue and rate, or its drill stages.
  // A change of module swaps them with the countdown's shrink and grow.
  const mode = WORDS[s.word]?.detail || 'rate';
  if (row.dataset.mode !== mode) {
    const prev = row.dataset.mode;
    row.dataset.mode = mode;
    if (!first && !matchMedia('(prefers-reduced-motion: reduce)').matches) swapModules(prev, mode);
    if (mode === 'rate') shownRate = first ? null : shownRate;
  }
  if (mode === 'stages') {
    run.stage = -1;
    document.querySelectorAll('#stageBar i').forEach((el) => { el.style.width = '0'; });
  } else tickRate(s.spm);
  const next = run.segs[i + 1];
  $('nextName').textContent = next ? wordName(next) : t('finish');
}

// Drive takes about a third of the stroke at low rates, closer to 40% when racing.
const driveShare = (spm) => 0.33 + Math.min(1, Math.max(0, (spm - 20) / 12)) * 0.09;
const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

function setText(id, value) {
  if (run.txt[id] !== value) { run.txt[id] = value; $(id).textContent = value; }
}

function tick(now) {
  const dt = Math.min(5, (now - run.last) / 1000);
  // If the tab was frozen, catch the clock up with wall time but keep the stroke cue smooth.
  const wall = (now - run.last) / 1000;
  run.last = now;
  const seg = run.segs[Math.max(0, run.idx)];
  let caught = false;
  if (!run.paused) {
    if (run.idx >= 0) run.rowedBy[run.idx] += Math.min(wall, run.total - run.elapsed);
    run.elapsed += wall;
    const ph = run.phase + dt * run.cueSpm / 60;
    caught = ph >= 1;                     // a catch happened this frame
    run.phase = ph % 1;
    // The cue only changes pace on a catch, so a stroke is never stretched or cut.
    if (caught && seg) run.cueSpm = seg.spm;
  }
  if (run.elapsed >= run.total) { finish(true); return; }

  // Interval switches snap to the catch nearest the planned boundary, so every
  // new rate starts on a fresh stroke. The next interval absorbs the difference
  // (under half a stroke), so the session still ends on time.
  if (run.idx < 0) enterSeg(0);
  else {
    const cur = run.idx, last = run.segs.length - 1;
    const end = run.starts[cur + 1] ?? run.total;
    const P0 = 60 / run.segs[cur].spm;
    if (cur < last && caught && end - run.elapsed < P0 / 2) {
      run.starts[cur + 1] = run.elapsed;
      enterSeg(cur + 1);
      run.cueSpm = run.segs[cur + 1].spm;
    } else if (cur < last && run.elapsed - end > P0) {
      enterSeg(idxAt(run.elapsed));        // tab was frozen: catch up by time
    }
  }
  const i = run.idx;
  const s = run.segs[i];
  const segEnd = run.starts[i + 1] ?? run.total;
  const rem = segEnd - run.elapsed;

  // Drill stages: the bar fills with time; the stage name changes on a catch.
  if ($('row').dataset.mode === 'stages') {
    const stages = WORDS[s.word].stages;
    const t0 = run.starts[i], len = (segEnd - t0) / stages.length;
    const q = Math.min(stages.length - 1, Math.floor((run.elapsed - t0) / len));
    document.querySelectorAll('#stageBar i').forEach((el, k) => {
      const shown = run.stage < 0 ? 0 : run.stage;
      const w = k < shown ? 1 : k > shown ? 0 : Math.min(1, (run.elapsed - t0 - k * len) / len);
      el.style.width = `${Math.max(0, w) * 100}%`;
    });
    if (q !== run.stage && (caught || run.stage < 0)) {
      run.stage = q;
      $('stageName').textContent = t(`stage.${stages[q]}`);
      if (q > 0) { const el = $('stageName'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    }
  }

  // Stroke cue
  const d = driveShare(run.cueSpm), p = run.phase;
  const drive = p < d;
  const x = drive ? easeOut(p / d) : 1 - ease((p - d) / (1 - d));
  $('row').style.setProperty('--x', x.toFixed(4));

  // Metrics
  let clockShown = Math.ceil(rem);
  const ca = run.clockAnim;
  if (ca) {
    const t = now - ca.t0;
    if (!ca.popped && t >= TICK_MS - POP_LEAD_MS) {
      ca.popped = true;
      const el = $('segLeft'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
    if (t >= TICK_MS) run.clockAnim = null;
    else clockShown = Math.min(clockShown, Math.floor((t / TICK_MS) * Math.ceil(clockShown / 15)) * 15);
  }
  setText('segLeft', fmt(clockShown));
  setText('totalLeft', fmt(Math.ceil(run.total - run.elapsed)));
  setText('elapsed', fmt(run.elapsed));
  $('progFill').style.width = `${(run.elapsed / run.total) * 100}%`;

  // Countdown to next interval, in strokes: 4, 3, 2, 1, each dropping on a catch.
  // "1" holds until the interval switches. The panel then bursts out on the same frame
  // the colour, rate and clock change, so the move to the next interval is one beat.
  const P = 60 / s.spm;
  const toNextCatch = (1 - run.phase) * P;
  const cx = (rem - toNextCatch) / P;           // catches until the boundary
  const left = Math.max(1, Math.round(cx) + 1); // strokes left, current one included
  // Drills show their own progress in the stage bar, so they skip the countdown.
  const inCd = left <= COUNTDOWN_STROKES && $('row').dataset.mode !== 'stages';
  if (inCd !== run.cd) {
    run.cd = inCd;
    $('centre').classList.toggle('cd', inCd);
    $('countdown').classList.toggle('leaving', !inCd);
    $('countdown').setAttribute('aria-hidden', !inCd);
    if (inCd) {
      const next = run.segs[i + 1];
      const k = next ? KIND[next.kind] : { bg: '#F4F6FB', ink: '#12131A' };
      const cd = $('countdown');
      cd.style.setProperty('--nbg', k.bg);
      cd.style.setProperty('--nfg', k.ink);
      $('cdName').textContent = next ? wordName(next) : t('finish');
      $('cdRate').textContent = next ? t('nextRate', { spm: next.spm, time: fmt(next.dur) }) : t('lastStrokes');
    }
  }
  if (inCd) {
    const label = String(left);
    if (run.txt.cdNum !== label) {
      setText('cdNum', label);
      const n = $('cdNum');
      n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
      $('cdUnit').textContent = left === 1 ? t('stroke') : t('strokes');
    }
    // Strokes still to row as a continuous value; full once the boundary catch has passed.
    const remaining = cx < -0.5 ? 0 : left - run.phase;
    const done = 1 - remaining / COUNTDOWN_STROKES;
    $('cdBar').style.width = `${Math.min(1, Math.max(0, done)) * 100}%`;
  }

  raf = requestAnimationFrame(tick);
}

function setPaused(p) {
  if (!run) return;
  run.paused = p;
  run.last = performance.now();
  $('pausedSheet').hidden = !p;
  $('pause').textContent = p ? t('resume') : t('pause');
  if (!p) holdWake();
}

function finish(completed) {
  cancelAnimationFrame(raf);
  dropWake();
  const rec = sessionRecord(run, completed);
  if (rec.rowed >= 60) saveSession(rec);
  $('endSheet').hidden = true;
  $('pausedSheet').hidden = true;
  resetCountdown();
  run = null;
  show('done');
  playRecap(rec);
}

// Recap: title pops, then each row slides up and its value ticks up from zero and pops,
// one row after another; the buttons arrive as the last number lands.
const RECAP = { stagger: 70, tick: 350, lead: 120, slide: 12 };
let recapTimers = [];
function playRecap(rec) {
  recapTimers.forEach(clearTimeout); recapTimers = [];
  const rows = [
    ['dTime', Math.floor(rec.rowed / 60), (v) => fmt(v * 60), fmt(rec.rowed)],
    ['dCount', rec.intervalsDone, (v) => t('of', { a: v, b: rec.intervals }), t('of', { a: rec.intervalsDone, b: rec.intervals })],
    ['dHard', Math.floor(rec.hard / 60), (v) => fmt(v * 60), fmt(rec.hard)],
  ];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { rows.forEach(([id, , , fin]) => { $(id).textContent = fin; }); return; }
  const { stagger: G, tick: K, lead: L, slide: D } = RECAP;
  const ease = 'cubic-bezier(.25,1,.5,1)';
  document.querySelector('.done-title').animate(
    [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }],
    { duration: 320, easing: ease, fill: 'backwards' });
  const rowEls = document.querySelectorAll('.done-stats > div');
  rows.forEach(([id, n, f, fin], k) => {
    const el = $(id), delay = G * (k + 1);
    el.textContent = f(0);
    rowEls[k].animate([{ opacity: 0, transform: `translateY(${D}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 200, delay, easing: ease, fill: 'backwards' });
    recapTimers.push(setTimeout(() => {
      if (!n) { el.textContent = fin; popEl(el); return; }
      for (let q = 1; q <= n; q++) recapTimers.push(setTimeout(() => { el.textContent = q === n ? fin : f(q); }, (q * K) / n));
      recapTimers.push(setTimeout(() => popEl(el), Math.max(0, K - L)));
    }, delay));
  });
  document.querySelector('.done-actions').animate([{ opacity: 0, transform: `translateY(${D / 2}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 220, delay: G * 3 + K - L, easing: 'ease-out', fill: 'backwards' });
}

// ---------- History ----------
const HISTORY_KEY = 'cadence-history';

function sessionRecord(r, completed) {
  const segments = r.segs.map((sg, i) => ({
    name: sg.name, kind: sg.kind, spm: sg.spm, planned: sg.dur, rowed: Math.round(r.rowedBy[i]),
  }));
  const rowed = segments.reduce((a, x) => a + x.rowed, 0);
  const t = TYPES.find((x) => x.id === r.type);
  return {
    id: r.startedAt,
    startedAt: r.startedAt,
    type: r.type,
    session: t ? t.name : r.type,
    target: r.target,
    completed,
    planned: r.total,
    rowed,
    intervals: segments.length,
    intervalsDone: segments.filter((x) => x.rowed >= Math.min(x.planned, 5)).length,
    hard: segments.filter((x) => x.spm >= 24).reduce((a, x) => a + x.rowed, 0),
    strokes: Math.round(segments.reduce((a, x) => a + (x.rowed * x.spm) / 60, 0)),
    segments,
  };
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function storeHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
function saveSession(rec) {
  const list = loadHistory();
  list.unshift(rec);
  storeHistory(list);
  // Ask the browser not to evict saved sessions under storage pressure.
  try { navigator.storage?.persist?.(); } catch {}
}

const dayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

function renderHistory() {
  const list = loadHistory();
  const total = list.reduce((a, x) => a + x.rowed, 0);
  $('histMeta').textContent = list.length
    ? t(list.length === 1 ? 'historyOne' : 'historyMany', { n: list.length, time: fmt(total) })
    : t('noSessions');
  $('histList').innerHTML = list.map((x) => {
    const d = new Date(x.startedAt);
    const color = (TYPES.find((ty) => ty.id === x.type) || TYPES[0]).cover.bg;
    return `<li>
      <span class="h-dot" style="background:${color}"></span>
      <span class="h-main"><span class="h-name">${TYPES.some((ty) => ty.id === x.type) ? typeName(x.type) : x.session}</span>
        <span class="h-sub">${dayFmt.format(d)}, ${timeFmt.format(d)}${x.completed ? '' : `, ${t('endedEarly')}`}</span></span>
      <span class="h-dur">${fmt(x.rowed)}</span>
      <button type="button" class="h-del" data-id="${x.id}" aria-label="${t('deleteSession')}">×</button>
    </li>`;
  }).join('');
  $('exportCsv').disabled = $('exportJson').disabled = !list.length;
}

const csvCell = (v) => {
  const t = String(v ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

function historyCsv(list) {
  const head = ['date', 'start_time', 'session', 'target', 'completed', 'planned_min', 'rowed_min',
    'intervals_done', 'intervals', 'hard_min', 'avg_target_spm', 'est_strokes'];
  const min = (sec) => (sec / 60).toFixed(2);
  const rows = list.map((x) => {
    const d = new Date(x.startedAt);
    const avg = x.rowed ? (x.strokes * 60 / x.rowed).toFixed(1) : '';
    return [
      d.toISOString().slice(0, 10), d.toTimeString().slice(0, 5), x.session, x.target,
      x.completed ? 'yes' : 'no', min(x.planned), min(x.rowed),
      x.intervalsDone, x.intervals, min(x.hard), avg, x.strokes,
    ];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

async function exportFile(name, type, text) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);
$('exportCsv').addEventListener('click', () => exportFile(`cadence-${stamp()}.csv`, 'text/csv', historyCsv(loadHistory())));
$('exportJson').addEventListener('click', () => exportFile(`cadence-${stamp()}.json`, 'application/json', JSON.stringify(loadHistory(), null, 2)));

$('histList').addEventListener('click', (e) => {
  const b = e.target.closest('.h-del'); if (!b) return;
  if (b.dataset.confirm !== '1') {
    b.dataset.confirm = '1'; b.textContent = t('delete'); b.classList.add('arm');
    setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ''; b.textContent = '×'; b.classList.remove('arm'); } }, 2500);
    return;
  }
  storeHistory(loadHistory().filter((x) => x.id !== b.dataset.id));
  renderHistory();
});

const openHistory = () => { renderHistory(); $('histSheet').hidden = false; };
$('historyBtn').addEventListener('click', openHistory);
$('doneHistory').addEventListener('click', openHistory);
$('histClose').addEventListener('click', () => { $('histSheet').hidden = true; });
$('histSheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });

$('start').addEventListener('click', startRun);
$('pause').addEventListener('click', () => setPaused(!run.paused));
$('resume').addEventListener('click', () => setPaused(false));
$('skip').addEventListener('click', () => {
  if (!run) return;
  const nextStart = run.starts[run.idx + 1];
  if (nextStart === undefined) { run.elapsed = run.total; return; }
  run.elapsed = Math.max(run.elapsed, nextStart);
  enterSeg(run.idx + 1);
});
$('end').addEventListener('click', () => { $('endSheet').hidden = false; });
$('endNo').addEventListener('click', () => { $('endSheet').hidden = true; });
$('endYes').addEventListener('click', () => finish(false));
$('again').addEventListener('click', () => { show('setup'); refresh(); centreCard(state.type, false); updateCards(); });

document.addEventListener('keydown', (e) => {
  if (!run || e.target.matches('input')) return;
  if (e.code === 'Space') { e.preventDefault(); setPaused(!run.paused); }
  if (e.key === 'ArrowRight') $('skip').click();
});

window.addEventListener('beforeunload', (e) => { if (run) e.preventDefault(); });

// ---------- Boot ----------
translatePage();
buildTypes();
refresh();
requestAnimationFrame(() => { centreCard(state.type, false); updateCards(); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
