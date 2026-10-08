import { KIND, TYPES, buildPlan, fmt, planTotal } from './plan.js';

const $ = (id) => document.getElementById(id);
const COUNTDOWN_STROKES = 4;

const LIMITS = {
  time: { min: 10, max: 120, step: 5, unit: 'min' },
  distance: { min: 2000, max: 30000, step: 500, unit: 'm' },
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
  $('types').innerHTML = TYPES.map((t) => `
    <button type="button" class="type" role="radio" data-id="${t.id}"
      style="--cbg:${KIND[t.kind].bg};--cfg:${KIND[t.kind].ink}">
      <span class="t-rate">${t.rate}</span>
      <span class="t-name">${t.name}</span>
      <span class="t-desc">${t.desc}</span>
    </button>`).join('');
  $('dots').innerHTML = TYPES.map(() => '<span></span>').join('');
}

function renderTypes() {
  const i = TYPES.findIndex((t) => t.id === state.type);
  document.querySelectorAll('.type').forEach((b, j) => {
    b.setAttribute('aria-checked', j === i);
    b.tabIndex = j === i ? 0 : -1;
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
  const mid = box.scrollLeft + box.clientWidth / 2;
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
  box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'instant' });
}

function pickCentred() {
  const box = $('types');
  const mid = box.scrollLeft + box.clientWidth / 2;
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
  const shown = state.mode === 'time' ? value : value.toLocaleString('en-US');
  $('amount').innerHTML = `${shown}<small>${L.unit}</small>`;
  $('amount').classList.toggle('long', state.mode === 'distance');
  $('minus').disabled = value <= L.min;
  $('plus').disabled = value >= L.max;
  $('splitRow').hidden = state.mode !== 'distance';
  $('split').setAttribute('aria-invalid', parseSplit(state.split) === null);
  $('planMeta').textContent = state.mode === 'distance'
    ? `About ${fmt(planTotal(plan))}`
    : `${plan.length} intervals`;
}

function renderPlan() {
  plan = buildPlan(state.type, Math.max(600, targetSeconds()));
  const total = planTotal(plan);
  $('strip').innerHTML = plan.map((s) =>
    `<span style="flex:${s.dur};background:${KIND[s.kind].bg}"></span>`).join('');
  let at = 0;
  $('planList').innerHTML = plan.map((s) => {
    const row = `<li><span class="p-at">${fmt(at)}</span><span class="p-dot" style="background:${KIND[s.kind].bg}"></span>
      <span class="p-name">${s.name}</span><span class="p-spm">${s.spm} spm</span><span class="p-dur">${fmt(s.dur)}</span></li>`;
    at += s.dur;
    return row;
  }).join('');
  $('start').textContent = `Start ${fmt(total)}`;
}

function refresh() { renderTypes(); renderPlan(); renderLength(); persist(); }

function setValue(v) {
  const L = LIMITS[state.mode];
  v = Math.min(L.max, Math.max(L.min, Math.round(v / L.step) * L.step));
  if (state.mode === 'time') state.minutes = v; else state.meters = v;
  refresh();
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
  state.mode = b.dataset.mode; refresh();
});
$('minus').addEventListener('click', () => setValue((state.mode === 'time' ? state.minutes : state.meters) - LIMITS[state.mode].step));
$('plus').addEventListener('click', () => setValue((state.mode === 'time' ? state.minutes : state.meters) + LIMITS[state.mode].step));
$('planBtn').addEventListener('click', () => { $('planSheet').hidden = false; });
$('planClose').addEventListener('click', () => { $('planSheet').hidden = true; });
$('planSheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
$('split').addEventListener('input', (e) => {
  state.split = e.target.value;
  if (parseSplit(state.split) !== null) { renderPlan(); persist(); }
  renderLength();
});
$('split').value = state.split;

// ---------- Screens ----------
function show(id) {
  ['setup', 'row', 'done'].forEach((s) => { $(s).hidden = s !== id; });
  const meta = document.querySelector('meta[name="theme-color"]');
  meta.content = id === 'row' && run ? KIND[run.segs[run.idx]?.kind || 'warm'].bg : '#F4F6FB';
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

function startRun() {
  const segs = plan.map((s) => ({ ...s }));
  const starts = []; let acc = 0;
  segs.forEach((s) => { starts.push(acc); acc += s.dur; });
  run = { segs, starts, total: acc, elapsed: 0, last: performance.now(), paused: false, phase: 0, idx: -1, txt: {}, cd: false, goUntil: 0 };
  $('ticks').innerHTML = starts.slice(1).map((t) => `<span style="left:${(t / acc) * 100}%"></span>`).join('');
  $('pause').textContent = 'Pause';
  $('centre').classList.remove('cd');
  $('countdown').classList.remove('leaving');
  $('countdown').setAttribute('aria-hidden', 'true');
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

function enterSeg(i) {
  run.idx = i;
  const s = run.segs[i], k = KIND[s.kind];
  if (run.cd && run.goUntil <= run.elapsed) run.goUntil = run.elapsed + 0.9 * 60 / s.spm;
  const row = $('row');
  row.style.setProperty('--bg', k.bg);
  row.style.setProperty('--fg', k.ink);
  document.querySelector('meta[name="theme-color"]').content = k.bg;
  $('segName').textContent = s.name;
  $('spm').textContent = s.spm;
  $('rep').textContent = s.rep ? `${s.rep} of ${s.of}` : '\u00a0';
  const next = run.segs[i + 1];
  $('nextName').textContent = next ? `${next.name} at ${next.spm}` : 'Finish';
}

// Drive takes about a third of the stroke at low rates, closer to 40% when racing.
const driveShare = (spm) => 0.33 + Math.min(1, Math.max(0, (spm - 20) / 12)) * 0.09;
const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

function setText(id, value) {
  if (run.txt[id] !== value) { run.txt[id] = value; $(id).textContent = value; }
}

function tick(now) {
  const dt = Math.min(5, (now - run.last) / 1000);
  // If the tab was frozen, catch the clock up with wall time but keep the stroke cue smooth.
  const wall = (now - run.last) / 1000;
  run.last = now;
  const seg = run.segs[Math.max(0, run.idx)];
  if (!run.paused) {
    run.elapsed += wall;
    run.phase = (run.phase + dt * (seg?.spm || 20) / 60) % 1;
  }
  if (run.elapsed >= run.total) { finish(true); return; }

  const i = idxAt(run.elapsed);
  if (i !== run.idx) enterSeg(i);
  const s = run.segs[i];
  const segEnd = run.starts[i] + s.dur;
  const rem = segEnd - run.elapsed;

  // Stroke cue
  const d = driveShare(s.spm), p = run.phase;
  const drive = p < d;
  const x = drive ? ease(p / d) : 1 - ease((p - d) / (1 - d));
  $('row').style.setProperty('--x', x.toFixed(4));
  setText('phase', drive ? 'Drive' : 'Recover');

  // Metrics
  setText('segLeft', fmt(Math.ceil(rem)));
  setText('totalLeft', fmt(Math.ceil(run.total - run.elapsed)));
  setText('elapsed', fmt(run.elapsed));
  $('progFill').style.width = `${(run.elapsed / run.total) * 100}%`;

  // Countdown to next interval, in strokes. Each number drops on a catch.
  // The switch lands on the catch nearest the planned boundary, so the
  // first stroke of the next interval starts exactly when "Go" shows.
  const P = 60 / s.spm;
  const toNextCatch = (1 - run.phase) * P;
  const cx = (rem - toNextCatch) / P;         // catches until the boundary
  // "Go" holds for about one stroke after the boundary catch, whichever side of the
  // planned boundary that catch falls on.
  if (cx < -0.5 && run.goUntil <= run.elapsed) run.goUntil = run.elapsed + 0.9 * P;
  const go = run.elapsed < run.goUntil;
  const left = Math.max(1, Math.round(cx) + 1); // strokes left, current one included
  const inCd = go || (cx >= -0.5 && left <= COUNTDOWN_STROKES);
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
      $('cdName').textContent = next ? next.name : 'Finish';
      $('cdRate').textContent = next ? `${next.spm} spm for ${fmt(next.dur)}` : 'Last strokes, empty the tank';
    }
  }
  if (inCd) {
    const label = go ? 'Go' : String(left);
    if (run.txt.cdNum !== label) {
      setText('cdNum', label);
      const n = $('cdNum');
      n.classList.remove('pop', 'go'); void n.offsetWidth; n.classList.add(go ? 'go' : 'pop');
      if (go) { const f = $('cdFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
      $('cdUnit').textContent = go ? '' : left === 1 ? 'stroke' : 'strokes';
    }
    // Strokes still to row as a continuous value: whole strokes left minus how far
    // through the current stroke we are. It reaches 0 exactly on the boundary catch.
    const remaining = go ? 0 : left - run.phase;
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
  $('pause').textContent = p ? 'Resume' : 'Pause';
  if (!p) holdWake();
}

function finish(completed) {
  cancelAnimationFrame(raf);
  dropWake();
  const rowed = Math.min(run.elapsed, run.total);
  const done = run.segs.filter((_, i) => run.starts[i] < rowed);
  const hard = run.segs.reduce((a, s, i) => {
    if (s.spm < 24) return a;
    return a + Math.max(0, Math.min(s.dur, rowed - run.starts[i]));
  }, 0);
  $('dTime').textContent = fmt(rowed);
  $('dCount').textContent = `${completed ? run.segs.length : done.length} of ${run.segs.length}`;
  $('dHard').textContent = fmt(hard);
  $('endSheet').hidden = true;
  $('pausedSheet').hidden = true;
  run = null;
  show('done');
}

$('start').addEventListener('click', startRun);
$('pause').addEventListener('click', () => setPaused(!run.paused));
$('resume').addEventListener('click', () => setPaused(false));
$('skip').addEventListener('click', () => {
  if (!run) return;
  run.elapsed = run.starts[run.idx + 1] ?? run.total;
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
buildTypes();
refresh();
requestAnimationFrame(() => { centreCard(state.type, false); updateCards(); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
