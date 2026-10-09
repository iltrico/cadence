import { KIND, TYPES, buildPlan, fmt, planTotal } from './plan.js';

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

function startRun() {
  const segs = plan.map((s) => ({ ...s }));
  const starts = []; let acc = 0;
  segs.forEach((s) => { starts.push(acc); acc += s.dur; });
  run = { segs, starts, total: acc, elapsed: 0, last: performance.now(), paused: false, phase: 0, idx: -1, txt: {}, cd: false, goUntil: 0,
    rowedBy: segs.map(() => 0), startedAt: new Date().toISOString(), type: state.type, mode: state.mode,
    target: state.mode === 'time' ? `${state.minutes} min` : `${state.meters} m` };
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
  document.documentElement.style.backgroundColor = k.bg;
  $('segName').textContent = s.name;
  $('spm').textContent = s.spm;
  const next = run.segs[i + 1];
  $('nextName').textContent = next ? next.name : 'Finish';
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
    if (run.idx >= 0) run.rowedBy[run.idx] += Math.min(wall, run.total - run.elapsed);
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
  const rec = sessionRecord(run, completed);
  if (rec.rowed >= 60) saveSession(rec);
  $('dTime').textContent = fmt(rec.rowed);
  $('dCount').textContent = `${rec.intervalsDone} of ${rec.intervals}`;
  $('dHard').textContent = fmt(rec.hard);
  $('endSheet').hidden = true;
  $('pausedSheet').hidden = true;
  run = null;
  show('done');
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

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

function renderHistory() {
  const list = loadHistory();
  const total = list.reduce((a, x) => a + x.rowed, 0);
  $('histMeta').textContent = list.length
    ? `${list.length} ${list.length === 1 ? 'session' : 'sessions'}, ${fmt(total)} rowed`
    : 'No sessions yet';
  $('histList').innerHTML = list.map((x) => {
    const d = new Date(x.startedAt);
    const color = KIND[(TYPES.find((t) => t.id === x.type) || { kind: 'steady' }).kind].bg;
    return `<li>
      <span class="h-dot" style="background:${color}"></span>
      <span class="h-main"><span class="h-name">${x.session}</span>
        <span class="h-sub">${dayFmt.format(d)}, ${timeFmt.format(d)}${x.completed ? '' : ', ended early'}</span></span>
      <span class="h-dur">${fmt(x.rowed)}</span>
      <button type="button" class="h-del" data-id="${x.id}" aria-label="Delete session">×</button>
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
    b.dataset.confirm = '1'; b.textContent = 'Delete'; b.classList.add('arm');
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
