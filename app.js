import { KIND, TYPES, WORDS, LENGTH, MODULE_TRANSITIONS, moduleOf, buildPlan, fmt, planTotal } from './plan.js';
import { t, LOCALE, translatePage } from './i18n.js';
import { loadSettings, saveSettings, loadHistory as readHistory, addSession, removeSession } from './storage.js';
import { outline } from './outline.js';

// Motion tokens live in styles.css; JS reads the same values so CSS and JS animations match.
const MOTION = (() => {
  const cs = getComputedStyle(document.documentElement);
  // Built-in values are a fallback: if the stylesheet ever can't be read, animations keep their
  // durations instead of collapsing to zero.
  const v = (n, fb) => cs.getPropertyValue(n).trim() || fb;
  const ms = (n, fb) => parseFloat(cs.getPropertyValue(n)) || fb;
  return {
    // Scale
    instant: ms('--dur-instant', 120), quick: ms('--dur-quick', 220), base: ms('--dur-base', 340), emphasis: ms('--dur-emphasis', 420),
    stagger: ms('--stagger', 70), rise: ms('--rise', 12),
    out: v('--ease-out', 'cubic-bezier(.2,.8,.2,1)'), in: v('--ease-in', 'cubic-bezier(.5,0,.75,0)'), settle: v('--ease-settle', 'cubic-bezier(.25,1,.5,1)'),
    pop: v('--ease-pop', 'cubic-bezier(.2,.9,.3,1.4)'), turn: v('--ease-turn', 'cubic-bezier(.6,0,.25,1)'),
    // Roles
    enter: ms('--t-enter', 340), exit: ms('--t-exit', 220), popDur: ms('--t-pop', 420), sheet: ms('--t-sheet', 420),
    counter: ms('--t-counter', 420), colour: ms('--t-colour', 340), flip: ms('--t-flip', 560),
  };
})();

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Shown names: plans keep English data; the interface translates words and sessions.
const wordName = (s) => (s.word ? t(`word.${s.word}`) : s.name);
const typeName = (id) => t(`type.${id}`);
const rateText = (r) => r.replace('spm', t('spm'));

const $ = (id) => document.getElementById(id);
const COUNTDOWN_STROKES = 4;

// Session length, in minutes, comes from the planner (LENGTH): 15 to 60 for every session.

// ---------- State ----------
const state = loadSettings(localStorage);
if (!TYPES.some((ty) => ty.id === state.type)) state.type = 'steady';
state.minutes = Math.min(LENGTH.max, Math.max(LENGTH.min, state.minutes));
let plan = [];

const persist = () => saveSettings(localStorage, state);

const targetSeconds = () => state.minutes * 60;

// ---------- Setup screen ----------
// Program picker: horizontal snap carousel. The card that settles in the centre is the selection.
function buildTypes() {
  $('types').innerHTML = TYPES.map((ty) => `
    <div class="type" role="radio" tabindex="-1" data-id="${ty.id}"
      style="--cbg:${ty.cover.bg};--cfg:${ty.cover.ink}">
      <div class="card-flip">
        <div class="face front">
          <span class="t-top"><span class="t-rate">${rateText(ty.rate)}</span></span>
          <span class="t-name">${typeName(ty.id)}</span>
          <span class="t-desc">${t(`desc.${ty.id}`)}</span>
          <div class="shade"></div>
        </div>
      </div>
    </div>`).join('');

  $('dots').innerHTML = TYPES.map(() => '<span></span>').join('');
}

function renderTypes() {
  const i = TYPES.findIndex((t) => t.id === state.type);
  document.querySelectorAll('.type').forEach((b, j) => {
    b.setAttribute('aria-checked', j === i);
    b.tabIndex = j === i ? 0 : -1;
    b.setAttribute('aria-label', typeName(TYPES[j].id));
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
  if (seated) seated.follow();
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
  const amount = $('amount');
  amount.replaceChildren(String(state.minutes), Object.assign(document.createElement('small'), { textContent: t('minutes') }));
  $('minus').disabled = state.minutes <= LENGTH.min;
  $('plus').disabled = state.minutes >= LENGTH.max;
}

function popEl(el) {
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)', offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: MOTION.popDur, easing: MOTION.pop });
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
  if (reduceMotion()) { drawSlots(to, to, 0); return; }
  const A = resample(from, to.length), t0 = performance.now(), D = MOTION.base;
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
  $('start').textContent = t('start', { time: fmt(total) });
}

function refresh() { renderPlan(); renderTypes(); renderLength(); persist(); }

// ---------- Card flip ----------
// Turning a card over lifts it into an overlay above the home screen. It flips with depth
// and grows down over the length selector, so the plan reads at full height without moving
// anything underneath. The back is a heading where the front's rate sits, then the intervals.
let flippedId = null, flipStage = null, seated = null;
const cardEl = (id) => document.querySelector(`.type[data-id="${id}"]`);

// The card's back shows the plan as an outline: one row per run of identical pieces, with
// the start time, a dotted line for the work and one for its rest, and duration over rate.
function intervalRows(segs) {
  const type = TYPES.find((ty) => ty.id === state.type);
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
  const line = (color, cls, text) => {
    const l = el('span', 'p-line'), dot = el('span', 'p-dot');
    dot.style.background = color; l.append(dot, el('span', cls, text)); return l;
  };
  return outline(segs, type, t, wordName).map((row) => {
    const li = el('li');
    const what = el('span', 'p-what');
    what.append(line(KIND[row.kind].bg, 'p-name', row.name));
    if (row.rest) what.append(line(KIND.rest.bg, 'p-rest', row.rest));
    const how = el('span', 'p-how');
    how.append(el('span', 'p-dur', row.len));
    if (row.rate) how.append(el('span', 'p-spm', row.rate));
    li.append(el('span', 'p-at', fmt(row.start)), what, how);
    return li;
  });
}
// Fade an edge of the list only when there is more content beyond it.
function listEdges(list) {
  const more = list.scrollHeight - list.clientHeight;
  list.style.setProperty('--top', list.scrollTop > 2 ? '28px' : '0px');
  list.style.setProperty('--bottom', more - list.scrollTop > 2 ? '40px' : '0px');
}

function flipKeyframes(on) {
  const from = on ? 0 : 180, to = on ? 180 : 0, over = on ? 6 : -6, mid = (from + to) / 2;
  // The card swings back in depth as it turns, as if pivoting behind itself, then comes forward.
  return [
    { transform: `translateZ(0) rotateY(${from}deg)` },
    { transform: `translateZ(-90px) rotateY(${mid}deg)`, offset: 0.4 },
    { transform: `translateZ(0) rotateY(${to + over}deg)`, offset: 0.78 },
    { transform: `translateZ(0) rotateY(${to}deg)` },
  ];
}

function openFlip() {
  const id = state.type, card = cardEl(id), setup = $('setup');
  if (!card || flipStage) return;
  const ty = TYPES.find((x) => x.id === id), segs = plan;
  const host = setup.getBoundingClientRect(), r = card.getBoundingClientRect();
  const bottom = $('planBtn').getBoundingClientRect().top - 16;
  const stage = document.createElement('div');
  stage.className = 'flip-stage';
  stage.style.cssText = `left:${r.left - host.left}px;top:${r.top - host.top}px;width:${r.width}px;height:${r.height}px;--cbg:${ty.cover.bg};--cfg:${ty.cover.ink}`;
  const front = card.querySelector('.face.front').cloneNode(true);
  front.setAttribute('aria-hidden', 'true');
  const back = document.createElement('div');
  back.className = 'face back';
  const head = document.createElement('div');
  head.className = 'b-head';
  head.append(Object.assign(document.createElement('span'), { className: 'b-name', textContent: typeName(id) }),
    Object.assign(document.createElement('span'), { className: 'b-total', textContent: fmt(planTotal(segs)) }));
  const list = Object.assign(document.createElement('ol'), { className: 'plan back-list' });
  list.append(...intervalRows(segs));
  list.addEventListener('scroll', () => listEdges(list), { passive: true });
  back.append(head, list, Object.assign(document.createElement('div'), { className: 'shade' }));
  const inner = Object.assign(document.createElement('div'), { className: 'card-flip' });
  inner.append(front, back);
  stage.append(inner);
  stage.setAttribute('role', 'button');
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('aria-label', `${typeName(id)}, ${t('close')}`);
  // A tap anywhere closes the card; a drag that scrolls the list doesn't.
  let press = null;
  stage.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY, top: list.scrollTop }; });
  stage.addEventListener('click', (e) => {
    const moved = press && (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8 || Math.abs(list.scrollTop - press.top) > 2);
    press = null;
    if (!moved) closeFlip();
  });
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); closeFlip(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const dir = e.key === 'ArrowRight' ? 1 : -1; closeFlip(true, () => moveBy(dir)); }
  });
  setup.append(stage);
  card.style.visibility = 'hidden';
  $('types').classList.add('locked');   // you can't spin the row while holding one of its cards (see below)
  flipStage = { el: stage, card, inner, front, back, list, head, h0: r.height, room: bottom - r.top };
  flippedId = id;
  inner.style.transform = 'rotateY(180deg)';
  const h1 = openHeight(head, list, r.height, bottom - r.top);
  if (reduceMotion()) {
    stage.style.height = `${h1}px`;
    stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.exit });
  } else {
    const opt = { duration: MOTION.flip, easing: MOTION.turn };
    inner.animate(flipKeyframes(true), opt);
    stage.animate([{ height: `${r.height}px` }, { height: `${h1}px` }], { duration: MOTION.flip, easing: MOTION.out, fill: 'forwards' })
      .onfinish = (e) => { stage.style.height = `${h1}px`; e.target.cancel(); listEdges(list); };
    front.querySelector('.shade').animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.45 }, { opacity: 0.5 }], opt);
    back.querySelector('.shade').animate([{ opacity: 0.5 }, { opacity: 0.5, offset: 0.45 }, { opacity: 0 }], opt);
  }
  listEdges(list);
  stage.focus({ preventScroll: true });
  syncGuard();
}

// Closing puts the card back first: it turns over and shrinks to its slot in place, and is
// fully lit and at slot size by SEAT_AT. Only then can the row carry it, so a move to another
// card (then) starts at SLIDE_AT, overlapping the end of the turn, and from that point the
// card follows its slot and fades with the carousel like any other card.
const SEAT_AT = 0.62, SLIDE_AT = 0.65;
// The open card grows only as much as its plan needs, up to just above the plan bar.
function openHeight(head, list, min, room) {
  const pad = parseFloat(getComputedStyle(list).paddingTop) + parseFloat(getComputedStyle(list).paddingBottom);
  const needed = head.offsetHeight + [...list.children].reduce((a, li) => a + li.offsetHeight, 0) + pad + 10;
  return Math.max(min, Math.min(room, Math.ceil(needed)));
}

// A length change while a card is open: its back shows the new plan and resizes to fit.
function refreshFlip() {
  const f = flipStage;
  if (!f || flippedId !== state.type) return;
  f.list.replaceChildren(...intervalRows(plan));
  f.head.querySelector('.b-total').textContent = fmt(planTotal(plan));
  const from = f.el.offsetHeight, to = openHeight(f.head, f.list, f.h0, f.room);
  f.el.getAnimations().forEach((a) => a.cancel());
  f.el.style.height = `${to}px`;
  if (from !== to && !reduceMotion()) f.el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: MOTION.enter, easing: MOTION.out });
  listEdges(f.list);
}

// While a card is open, swipes on the row are blocked. Scrolling stays on: switching it off
// and back on can leave Safari's snapping row frozen.
['touchmove', 'wheel'].forEach((ev) => $('types').addEventListener(ev, (e) => {
  if ($('types').classList.contains('locked')) e.preventDefault();
}, { passive: false }));

function closeFlip(animate = true, then = null) {
  const f = flipStage;
  if (!f) { then?.(); return; }
  flipStage = null; flippedId = null;
  $('types').classList.remove('locked');
  const done = () => { f.el.remove(); f.card.style.visibility = ''; syncGuard(); };
  if (!animate || reduceMotion()) { done(); then?.(); return; }
  f.el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  const D = MOTION.flip, opt = { duration: D, easing: MOTION.turn };
  f.inner.style.transform = 'rotateY(0deg)';
  f.inner.animate(flipKeyframes(false), opt);
  f.back.querySelector('.shade').animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.45 }, { opacity: 0.5 }], opt);
  f.front.querySelector('.shade').animate([{ opacity: 0.5 }, { opacity: 0.5, offset: 0.45 }, { opacity: 0, offset: SEAT_AT }, { opacity: 0 }], opt);
  const h1 = f.el.offsetHeight, t0 = performance.now(), host = () => $('setup').getBoundingClientRect();
  const slot = f.card.getBoundingClientRect();
  let sliding = false;
  // Once seated, the card is drawn by the carousel's own frame, in step with the row.
  const follow = () => {
    const r = f.card.getBoundingClientRect(), h = host();
    Object.assign(f.el.style, { left: `${r.left - h.left}px`, top: `${r.top - h.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      opacity: f.card.style.opacity || '1' });
  };
  if (then) setTimeout(() => { sliding = true; seated = { follow }; follow(); then(); }, D * SLIDE_AT);
  const step = (now) => {
    if (!f.el.isConnected) return;
    const k = Math.min(1, (now - t0) / D), seat = Math.min(1, k / SEAT_AT), e = 1 - Math.pow(1 - seat, 3);
    if (!sliding) f.el.style.height = `${h1 + (slot.height - h1) * e}px`;
    if (k < 1) requestAnimationFrame(step); else { if (seated?.follow === follow) seated = null; done(); }
  };
  requestAnimationFrame(step);
}
const toggleFlip = () => (flipStage ? closeFlip() : openFlip());
const unflipAll = (animate = false) => closeFlip(animate);

function setValue(v) {
  state.minutes = Math.min(LENGTH.max, Math.max(LENGTH.min, Math.round(v / LENGTH.step) * LENGTH.step));
  renderPlan(true); renderTypes(); renderLength(); persist();
  refreshFlip();
}

$('types').addEventListener('click', (e) => {
  const b = e.target.closest('.type'); if (!b) return;
  if (b.dataset.id === state.type) { openFlip(); return; }
  const go = () => { state.type = b.dataset.id; refresh(); centreCard(state.type); };
  if (flipStage) closeFlip(true, go); else go();
});
let scrollTimer = 0;
$('types').addEventListener('scroll', () => {
  queueCards();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(pickCentred, 90);
}, { passive: true });
$('types').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFlip(); return; }
  if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  e.preventDefault();
  moveBy(e.key === 'ArrowRight' ? 1 : -1);
});
function moveBy(dir) {
  const i = TYPES.findIndex((t) => t.id === state.type);
  const n = Math.min(TYPES.length - 1, Math.max(0, i + dir));
  if (n === i) return;
  state.type = TYPES[n].id; refresh(); centreCard(state.type);
  cardEl(state.type).focus({ preventScroll: true });
}
$('minus').addEventListener('click', () => setValue(state.minutes - LENGTH.step));
$('plus').addEventListener('click', () => setValue(state.minutes + LENGTH.step));
$('planBtn').addEventListener('click', toggleFlip);

// ---------- Screens ----------
function show(id, how = {}) {
  if (how.zoom && !$('setup').hidden) { $('done').hidden = true; zoomIntoRow(how.firstBg); }
  else ['setup', 'row', 'done'].forEach((s) => { $(s).hidden = s !== id; });
  const meta = document.querySelector('meta[name="theme-color"]');
  meta.content = id === 'row' && run ? KIND[run.segs[run.idx]?.kind || 'warm'].bg : '#F4F6FB';
  document.documentElement.style.backgroundColor = id === 'row' && run ? KIND[run.segs[run.idx]?.kind || 'warm'].bg : '';
  window.scrollTo(0, 0);
  syncGuard();
}

// ---------- Screen and sheet transitions ----------
const EASE_OUT = MOTION.out;

// Start: the session card zooms to fill the screen, turning into the first interval's colour.
// The workout's content rides the zoom, fading in with it (ease-in) so it lands with the card.
const ZOOM_MS = MOTION.enter;
function zoomIntoRow(firstBg) {
  const row = $('row'), setup = $('setup');
  const card = flipStage ? flipStage.el : document.querySelector(`.type[data-id="${state.type}"]`);
  const fromBack = !!flipStage;
  row.hidden = false;
  if (reduceMotion() || !card) { setup.hidden = true; return; }
  const r = card.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const cover = fromBack ? '#FFFFFF' : TYPES.find((ty) => ty.id === state.type).cover.bg;
  row.style.transformOrigin = '0 0';
  const zoom = row.animate([
    { transform: `translate(${r.left}px, ${r.top}px) scale(${r.width / W}, ${r.height / H})`, backgroundColor: cover, borderRadius: '48px' },
    { transform: 'none', backgroundColor: firstBg, borderRadius: '0px' },
  ], { duration: ZOOM_MS, easing: EASE_OUT });
  [...row.children].forEach((el) => {
    if (!el.classList.contains('sheet')) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ZOOM_MS, easing: MOTION.in });
  });
  card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZOOM_MS * 0.35, fill: 'forwards' });
  [...setup.children].forEach((el) => {
    if (el.id !== 'types') el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZOOM_MS * 0.5, fill: 'forwards' });
  });
  zoom.onfinish = () => {
    closeFlip(false);
    setup.hidden = true;
    setup.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    row.style.transformOrigin = '';
  };
}

// Sheets rise with a light spring over a fading backdrop and drop away faster than they came.
// Plan and History can also be dragged down to close.
const SHEETS = ['histSheet', 'pausedSheet', 'endSheet'];
const scrim = (f = 1) => `color-mix(in srgb, #12131A ${Math.round(55 * f)}%, transparent)`;
function openSheet(id) {
  const sh = $(id);
  if (!sh.hidden && !sh.dataset.closing) return;
  sh.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  delete sh.dataset.closing;
  sh.hidden = false;
  if (!reduceMotion()) {
    sh.animate([{ backgroundColor: scrim(0) }, { backgroundColor: scrim(1) }], { duration: MOTION.colour, easing: 'ease-out' });
    sh.querySelector('.sheet-card').animate([
      { transform: 'translateY(110%)' }, { transform: 'translateY(-8px)', offset: 0.7 }, { transform: 'translateY(0)' },
    ], { duration: MOTION.sheet, easing: MOTION.settle });
  }
  syncGuard();
}
function closeSheet(id, dragged = 0) {
  const sh = $(id), card = sh.querySelector('.sheet-card');
  if (sh.hidden || sh.dataset.closing) return;
  const done = () => {
    sh.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    sh.hidden = true; delete sh.dataset.closing; card.style.transform = '';
    syncGuard();
  };
  if (reduceMotion()) { done(); return; }
  sh.dataset.closing = '1';
  const f = 1 - dragged / Math.max(1, card.offsetHeight);
  sh.animate([{ backgroundColor: scrim(f) }, { backgroundColor: scrim(0) }], { duration: MOTION.quick, fill: 'forwards' });
  card.animate([{ transform: `translateY(${dragged}px)` }, { transform: 'translateY(110%)' }],
    { duration: MOTION.exit, easing: MOTION.in, fill: 'forwards' }).onfinish = done;
}
function closeSheetNow(id) { const sh = $(id); sh.getAnimations({ subtree: true }).forEach((a) => a.cancel()); sh.hidden = true; delete sh.dataset.closing; }

// Drag down from the top of a sheet to close it: past a third of its height, or with a flick.
function draggable(id) {
  const sh = $(id), card = sh.querySelector('.sheet-card'), grip = card.querySelector('.grip-zone');
  let d = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') && !e.target.closest('.grip')) return;
    delete card.querySelector('.grip')?.dataset.dragged;   // a new press starts fresh
    d = { y: e.clientY, t: performance.now(), h: card.offsetHeight, dy: 0, id: e.pointerId, moving: false };
  });
  grip.addEventListener('pointermove', (e) => {
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y);
    // Only a real drag captures the pointer, so a tap on the handle stays a tap.
    if (!d.moving) { if (d.dy <= 4) return; d.moving = true; grip.setPointerCapture(d.id); }
    card.style.transform = `translateY(${d.dy}px)`;
    sh.style.backgroundColor = scrim(1 - d.dy / d.h);
  });
  const up = () => {
    if (!d) return;
    const { dy, h, t, moving } = d; d = null;
    if (!moving) return;
    const handle = card.querySelector('.grip');
    if (handle) handle.dataset.dragged = '1';
    sh.style.backgroundColor = '';
    if (dy > h / 3 || dy / Math.max(1, performance.now() - t) > 0.6) { closeSheet(id, dy); return; }
    card.style.transform = '';
    card.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(-4px)', offset: 0.7 }, { transform: 'translateY(0)' }],
      { duration: MOTION.base, easing: MOTION.settle });
  };
  grip.addEventListener('pointerup', up);
  grip.addEventListener('pointercancel', up);
}

// The phone's back gesture: it closes a sheet, opens "End this session?" during a session,
// and returns from the recap to setup. It never leaves the app mid-session.
let guard = false, ignorePop = false;
function syncGuard() {
  const root = $('row').hidden && $('done').hidden && SHEETS.every((id) => $(id).hidden) && !flipStage;
  if (!root && !guard) { history.pushState({ cadence: 1 }, ''); guard = true; }
  else if (root && guard) { guard = false; ignorePop = true; history.back(); }
}
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  guard = false;
  const open = SHEETS.find((id) => !$(id).hidden && !$(id).dataset.closing);
  if (!open && flipStage) closeFlip();
  else if (open === 'pausedSheet') setPaused(false);
  else if (open) closeSheet(open);
  else if (!$('row').hidden) requestEnd();
  else if (!$('done').hidden) $('again').click();
  syncGuard();
});

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
  $('row').classList.remove('fusing');
  $('centre').classList.remove('cd');
  const cd = $('countdown');
  cd.classList.remove('leaving');
  cd.setAttribute('aria-hidden', 'true');
  ['cdNum', 'cdName', 'cdRate', 'cdUnit'].forEach((id) => { $(id).textContent = ''; });
  $('cdNum').classList.remove('pop');
  $('cdBar').style.width = '0';
}
// Drop one-shot animation classes once they've played. A class left behind would replay
// its animation the next time the rowing screen is shown.
['spm', 'segLeft', 'cdNum', 'stageName', 'segName'].forEach((id) => {
  $(id).addEventListener('animationend', (e) => e.currentTarget.classList.remove('pop'));
});
// Once the exit animation has played, drop the class so the panel is fully hidden again.
$('countdown').addEventListener('animationend', (e) => {
  if (e.animationName === 'cd-out') $('countdown').classList.remove('leaving');
});

function startRun() {
  const segs = plan.map((s) => ({ ...s }));
  const starts = []; let acc = 0;
  segs.forEach((s) => { starts.push(acc); acc += s.dur; });
  run = { segs, starts, total: acc, elapsed: 0, last: performance.now(), paused: false, phase: 0, idx: -1, txt: {}, cd: false, clockAnim: null, cueSpm: segs[0].spm, pre: null, fuse: null,
    rowedBy: segs.map(() => 0), startedAt: new Date().toISOString(), type: state.type,
    target: `${state.minutes} min` };
  $('ticks').innerHTML = starts.slice(1).map((t) => `<span style="left:${(t / acc) * 100}%"></span>`).join('');
  $('pause').textContent = t('pause');
  resetCountdown();
  shownRate = null;
  // The engine starts first, so the session runs even if the transition into it fails.
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
  holdWake();
  try { show('row', { zoom: true, firstBg: KIND[segs[0].kind].bg }); }
  catch (e) { window.cadenceError?.(e); ['setup', 'done'].forEach((id) => { $(id).hidden = true; }); $('row').hidden = false; }
}

const idxAt = (t) => {
  let i = run.starts.length - 1;
  while (i > 0 && run.starts[i] > t) i--;
  return i;
};

// Rate change between intervals: step one stroke at a time, then pop.
// The pop starts just before the last step so its swell peaks as the final number lands.
// Short enough that the rate, clock, colour and panel exit all land together.
const TICK_MS = MOTION.counter, POP_LEAD_MS = MOTION.instant;
let tickTimers = [], shownRate = null;
function tickRate(to) {
  const el = $('spm');
  tickTimers.forEach(clearTimeout); tickTimers = [];
  const from = shownRate;
  shownRate = to;
  const reduce = reduceMotion();
  if (from === null || from === to || reduce) { el.textContent = to; return; }
  el.textContent = from;   // start from the previous rate, never from a blank
  const steps = Math.abs(to - from), dir = Math.sign(to - from), each = TICK_MS / steps;
  for (let k = 1; k <= steps; k++) tickTimers.push(setTimeout(() => { el.textContent = from + dir * k; }, k * each));
  tickTimers.push(setTimeout(() => {
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }, Math.max(0, TICK_MS - POP_LEAD_MS)));
}

// Interval clock: count up to the new interval's time in 15-second ticks, then pop.
// Starts on the switch, as the countdown panel bursts out.
function startClockTick() {
  if (reduceMotion()) return;
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
  if (!first) startClockTick();
  // A transition that lands on the catch has already shown this interval.
  if (run.pre === i) { run.pre = null; return; }
  showSeg(i, { first });
}

// Everything the rowing screen shows for an interval: colour, names, modules and rate.
function showSeg(i, how = {}) {
  const s = run.segs[i], k = KIND[s.kind];
  const row = $('row');
  row.style.setProperty('--bg', k.bg);
  row.style.setProperty('--fg', k.ink);
  document.querySelector('meta[name="theme-color"]').content = k.bg;
  document.documentElement.style.backgroundColor = k.bg;
  $('segName').textContent = wordName(s);
  const mode = moduleOf(s.word);
  if (row.dataset.mode !== mode) {
    const prev = row.dataset.mode;
    row.dataset.mode = mode;
    if (!how.first) moduleTransition(prev, mode, how);
  }
  if (mode === 'stages') {
    run.stage = -1;
    layoutStages(WORDS[s.word].stages.length);
    shownRate = null;   // when the cue returns, its rate simply appears, with no count
  } else tickRate(s.spm);
  const next = run.segs[i + 1];
  $('nextName').textContent = next ? wordName(next) : t('finish');
}

// ---------- Module transitions ----------
// Keyed by module, never by word, so any future word using these modules gets them.
// Pairs without a designed transition fall back to the plain swap.
const FUSE_MS = MOTION.emphasis;
const TRANSITIONS = { 'stages>rate': fuseToRhythm };
MODULE_TRANSITIONS.forEach((key) => { if (!TRANSITIONS[key]) console.warn(`No animation for ${key}`); });

function moduleTransition(from, to, how) {
  if (reduceMotion()) return;
  const fn = TRANSITIONS[`${from}>${to}`];
  if (fn) fn(how); else swapModules(from, to);
}

// Stage pills, laid out absolutely so they can slide and fuse.
function layoutStages(n) {
  const bar = $('stageBar');
  if (bar.children.length !== n) bar.innerHTML = '<span><i></i></span>'.repeat(n);
  const W = bar.clientWidth, g = 8, w = (W - (n - 1) * g) / n;
  [...bar.children].forEach((sp, k) => {
    sp.classList.remove('bare');
    sp.style.left = `${k * (w + g)}px`; sp.style.width = `${w}px`;
    sp.firstChild.style.width = '0';
  });
}
window.addEventListener('resize', () => {
  if (run && !run.fuse && $('row').dataset.mode === 'stages') {
    const widths = [...$('stageBar').children].map((sp) => sp.firstChild.style.width);
    layoutStages(widths.length);
    [...$('stageBar').children].forEach((sp, k) => { sp.firstChild.style.width = widths[k]; });
  }
});

// Stages to rhythm: the pills fuse into the track while their fill flows into the cursor,
// which pops in at the fill's end and travels with it. At a natural end it lands on the
// catch where the next interval starts; on a skip it meets the stroke where it is.
function fuseToRhythm(how) {
  const row = $('row'), bar = $('stageBar'), spans = [...bar.children];
  const W = bar.clientWidth, P = $('puck').offsetWidth;
  const L0 = spans.map((sp) => parseFloat(sp.style.left) || 0), w = parseFloat(spans[0]?.style.width) || W;
  let fromX = W - P / 2;
  if (!how.landing) {
    fromX = P / 2;
    spans.forEach((sp, k) => { const f = parseFloat(sp.firstChild.style.width) || 0; if (f > 0) fromX = Math.max(fromX, L0[k] + (f / 100) * w); });
  }
  spans.forEach((sp) => sp.classList.add('bare'));
  row.classList.add('fusing');
  run.fuse = { t0: performance.now(), fromX, landing: !!how.landing, L0, w, W, P };
  const name = $('segName'); name.classList.remove('pop'); void name.offsetWidth; name.classList.add('pop');
  const rate = $('spm'); rate.classList.remove('pop'); void rate.offsetWidth; rate.classList.add('pop');
  const puck = $('puck'); puck.classList.remove('pop-in'); void puck.offsetWidth; puck.classList.add('pop-in');
}

// Advance a running fuse; returns the cursor position to draw, or null when done.
function stepFuse(now, liveX) {
  const F = run.fuse;
  if (!F) return null;
  const k = Math.min(1, (now - F.t0) / FUSE_MS), e = easeOut(k);
  const under = (xx) => xx * (F.W - F.P) + F.P / 2;
  const target = F.landing ? under(0) : under(liveX);
  const X = F.fromX + (target - F.fromX) * e;
  [...$('stageBar').children].forEach((sp, j) => {
    const l = F.L0[j] * (1 - e), ww = F.w + (F.W - F.w) * e;
    sp.style.left = `${l}px`; sp.style.width = `${ww}px`;
    sp.firstChild.style.width = `${Math.max(0, Math.min(1, (X - l) / ww)) * 100}%`;
  });
  if (k >= 1 && run.pre == null) { $('row').classList.remove('fusing'); run.fuse = null; return null; }
  return Math.max(0, Math.min(1, (X - F.P / 2) / (F.W - F.P)));
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);

// Stroke cue: the cursor follows the seat. Timings are in seconds, derived from the rate, because
// a drive takes about a second whatever the rate: slowing down only lengthens the slide.
//   Drive: 1.05 s at 18 spm, 0.012 s shorter per stroke per minute, never under 0.8 s.
//   Legs: the first 70% of the drive move the seat; body and arms finish it at the back stop.
//   Hold: the seat stays at the finish for body and arms, then hands away and body over
//   (up to 0.45 s of the recovery, never more than a quarter of it).
//   Slide: the rest of the recovery, back to the catch.
// Legs and slide share one smooth curve: it starts and ends at rest and is fastest a third of
// the way, so the cursor turns around smoothly at the catch and leaves the hold gently.
const seatCurve = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (6 - 8 * u + 3 * u * u); };
function strokeTiming(spm) {
  const T = 60 / spm, drive = Math.max(0.8, Math.min(1.05, 1.05 - (spm - 18) * 0.012));
  const recovery = T - drive;
  return { T, drive, legs: 0.7 * drive, hold: Math.min(0.45, 0.25 * recovery), recovery };
}
// Seat position for a phase of the stroke: 0 at the catch, 1 at the finish.
function seatPosition(spm, phase) {
  const k = strokeTiming(spm), t = phase * k.T;
  if (t < k.legs) return seatCurve(t / k.legs);
  if (t < k.drive + k.hold) return 1;
  return 1 - seatCurve((t - k.drive - k.hold) / (k.recovery - k.hold));
}

function setText(id, value) {
  if (run.txt[id] !== value) { run.txt[id] = value; $(id).textContent = value; }
}

// The frame loop: one bad frame is reported, and the loop carries on instead of stopping.
function tick(now) {
  try { frame(now); }
  catch (e) {
    if (!run) return;
    if (!run.errored) { run.errored = true; window.cadenceError?.(e); }
    run.last = now;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
}

function frame(now) {
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

  // A designed module transition that needs a lead starts just before the switch catch,
  // so it lands exactly as the next interval's first stroke begins.
  if (!run.fuse && run.pre == null && !run.paused && i < run.segs.length - 1 && !reduceMotion()) {
    const nxt = run.segs[i + 1];
    if (TRANSITIONS[`${moduleOf(s.word)}>${moduleOf(nxt.word)}`]) {
      const toNext = (1 - run.phase) * (60 / run.cueSpm);
      const isSwitch = segEnd - (run.elapsed + toNext) < (60 / s.spm) / 2;
      if (isSwitch && toNext * 1000 <= FUSE_MS) { run.pre = i + 1; showSeg(i + 1, { landing: true }); }
    }
  }

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
  const x = seatPosition(run.cueSpm, run.phase);
  const fx = stepFuse(now, x);
  $('row').style.setProperty('--x', (fx ?? x).toFixed(4));

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
  // Some words skip the countdown at their end: drills show progress in the stage bar,
  // and sprints are too short to share the screen with it.
  const inCd = left <= COUNTDOWN_STROKES && WORDS[s.word]?.countdown !== false;
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
  if (p) openSheet('pausedSheet'); else closeSheet('pausedSheet');
  $('pause').textContent = p ? t('resume') : t('pause');
  if (!p) holdWake();
}

function finish(completed) {
  cancelAnimationFrame(raf);
  dropWake();
  const rec = sessionRecord(run, completed);
  if (rec.rowed >= SAVE_AFTER) saveSession(rec);
  closeSheetNow('endSheet');
  closeSheetNow('pausedSheet');
  resetCountdown();
  run = null;
  show('done');
  playRecap(rec);
}

// Recap: title pops, then each row slides up and its value ticks up from zero and pops,
// one row after another; the buttons arrive as the last number lands.
const RECAP = { stagger: MOTION.stagger, tick: MOTION.base, lead: MOTION.instant, slide: MOTION.rise };
let recapTimers = [];
function playRecap(rec) {
  recapTimers.forEach(clearTimeout); recapTimers = [];
  const rows = [
    ['dTime', Math.floor(rec.rowed / 60), (v) => fmt(v * 60), fmt(rec.rowed)],
    ['dCount', rec.intervalsDone, (v) => t('of', { a: v, b: rec.intervals }), t('of', { a: rec.intervalsDone, b: rec.intervals })],
    ['dHard', Math.floor(rec.hard / 60), (v) => fmt(v * 60), fmt(rec.hard)],
  ];
  if (reduceMotion()) { rows.forEach(([id, , , fin]) => { $(id).textContent = fin; }); return; }
  const { stagger: G, tick: K, lead: L, slide: D } = RECAP;
  const ease = MOTION.settle;
  document.querySelector('.done-title').animate(
    [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }],
    { duration: MOTION.base, easing: ease, fill: 'backwards' });
  const rowEls = document.querySelectorAll('.done-stats > div');
  rows.forEach(([id, n, f, fin], k) => {
    const el = $(id), delay = G * (k + 1);
    el.textContent = f(0);
    rowEls[k].animate([{ opacity: 0, transform: `translateY(${D}px)` }, { opacity: 1, transform: 'none' }],
      { duration: MOTION.quick, delay, easing: ease, fill: 'backwards' });
    recapTimers.push(setTimeout(() => {
      if (!n) { el.textContent = fin; popEl(el); return; }
      for (let q = 1; q <= n; q++) recapTimers.push(setTimeout(() => { el.textContent = q === n ? fin : f(q); }, (q * K) / n));
      recapTimers.push(setTimeout(() => popEl(el), Math.max(0, K - L)));
    }, delay));
  });
  document.querySelector('.done-actions').animate([{ opacity: 0, transform: `translateY(${D / 2}px)` }, { opacity: 1, transform: 'none' }],
    { duration: MOTION.quick, delay: G * 3 + K - L, easing: MOTION.out, fill: 'backwards' });
}

// ---------- History ----------
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

const loadHistory = () => readHistory(localStorage);
function saveSession(rec) {
  addSession(localStorage, rec);
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
  // Rows are built as elements, never from HTML strings, so saved text can't become markup.
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
  $('histList').replaceChildren(...list.map((x) => {
    const d = new Date(x.startedAt);
    const known = TYPES.find((ty) => ty.id === x.type);
    const li = el('li');
    const dot = el('span', 'h-dot'); dot.style.background = (known || TYPES[0]).cover.bg;
    const main = el('span', 'h-main');
    main.append(el('span', 'h-name', known ? typeName(x.type) : String(x.session ?? '')),
      el('span', 'h-sub', `${dayFmt.format(d)}, ${timeFmt.format(d)}${x.completed ? '' : `, ${t('endedEarly')}`}`));
    const del = el('button', 'h-del', '×');
    Object.assign(del, { type: 'button' }); del.dataset.id = x.id; del.setAttribute('aria-label', t('deleteSession'));
    li.append(dot, main, el('span', 'h-dur', fmt(x.rowed)), del);
    return li;
  }));
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
  removeSession(localStorage, b.dataset.id);
  renderHistory();
});

const openHistory = () => { renderHistory(); openSheet('histSheet'); };
$('historyBtn').addEventListener('click', openHistory);
$('doneHistory').addEventListener('click', openHistory);
// The handle closes the sheet on a tap; a drag is handled by draggable() and never counts as a tap.
$('histGrip').addEventListener('click', (e) => { if (e.currentTarget.dataset.dragged) { delete e.currentTarget.dataset.dragged; return; } closeSheet('histSheet'); });
$('histSheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSheet('histSheet'); });
draggable('histSheet');

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
// Ending in the first 3 minutes discards the session: no confirmation, nothing saved,
// straight back to setup. Later, End asks first and the session is saved.
const SAVE_AFTER = 180;
function requestEnd() {
  if (run && run.elapsed < SAVE_AFTER) discardRun(); else openSheet('endSheet');
}
function discardRun() {
  cancelAnimationFrame(raf);
  dropWake();
  ['endSheet', 'pausedSheet'].forEach(closeSheetNow);
  resetCountdown();
  run = null;
  zoomOutToCard();
}

// The reverse of the start: the screen zooms back down into the session card, turning from
// the interval colour back to the cover colour as the workout fades out, and setup fades
// back in around it.
function zoomOutToCard() {
  const row = $('row'), setup = $('setup');
  setup.hidden = false;
  unflipAll();
  refresh(); centreCard(state.type, false); updateCards();
  const card = cardEl(state.type);
  if (reduceMotion() || !card) { show('setup'); return; }
  const r = card.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const cover = TYPES.find((ty) => ty.id === state.type).cover.bg;
  const fromBg = getComputedStyle(row).backgroundColor;
  // Setup's own background shows around the shrinking screen from the first frame.
  const html = document.documentElement;
  html.style.transition = 'none'; html.style.backgroundColor = '';
  requestAnimationFrame(() => { html.style.transition = ''; });
  document.querySelector('meta[name="theme-color"]').content = '#F4F6FB';
  row.style.transformOrigin = '0 0';
  const zoom = row.animate([
    { transform: 'none', backgroundColor: fromBg, borderRadius: '0px' },
    { transform: `translate(${r.left}px, ${r.top}px) scale(${r.width / W}, ${r.height / H})`, backgroundColor: cover, borderRadius: '48px' },
  ], { duration: ZOOM_MS, easing: EASE_OUT });
  [...row.children].forEach((el) => {
    if (!el.classList.contains('sheet')) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ZOOM_MS, easing: 'cubic-bezier(0,.55,.45,1)', fill: 'forwards' });
  });
  card.animate([{ opacity: 0 }, { opacity: 0, offset: 0.65 }, { opacity: 1 }], { duration: ZOOM_MS });
  [...setup.children].forEach((el) => {
    if (el.id !== 'types') el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: ZOOM_MS });
  });
  zoom.onfinish = () => {
    row.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    row.style.transformOrigin = '';
    show('setup');
  };
}
$('end').addEventListener('click', requestEnd);
$('endNo').addEventListener('click', () => closeSheet('endSheet'));
$('endYes').addEventListener('click', () => finish(false));
// Back to setup from the recap or a discarded session: the screen sinks and fades quickly
// while setup rises in underneath, with the session just rowed centred.
function returnToSetup(fromId) {
  const from = $(fromId), setup = $('setup');
  setup.hidden = false;
  unflipAll();
  refresh(); centreCard(state.type, false); updateCards();
  if (reduceMotion() || from.hidden) { show('setup'); return; }
  setup.animate([{ opacity: 0, transform: `translateY(${MOTION.rise}px)` }, { opacity: 1, transform: 'none' }],
    { duration: MOTION.enter, delay: MOTION.instant, easing: MOTION.out, fill: 'backwards' });
  from.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${MOTION.rise}px)` }],
    { duration: MOTION.exit, easing: MOTION.in, fill: 'forwards' }).onfinish = () => {
    from.getAnimations().forEach((a) => a.cancel());
    show('setup');
  };
}
$('again').addEventListener('click', () => returnToSetup('done'));

document.addEventListener('keydown', (e) => {
  // Escape closes an open sheet, the keyboard's version of the handle and the back gesture.
  if (e.key === 'Escape') {
    const open = SHEETS.find((id) => !$(id).hidden && !$(id).dataset.closing);
    if (open === 'pausedSheet') setPaused(false); else if (open) closeSheet(open);
    if (open) return;
  }
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
