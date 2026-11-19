// The lessons (the director: a tutorial that teaches people how to shape the land; 2026-11-14: one line at the edge,
// never over the middle or over what it teaches). Inside the real creation phase, on the player's own world: one
// line of instruction in a slim strip at the top left edge, a gold ring standing on the control to use (8 px out
// on every side), a check that it was done, and Skip in one tap. Three short ones come once time runs, at their
// moment. The steps are data (tutorial-steps.js); progress is kept in localStorage (guarded).
import { h, icon, esc } from './dom.js';
import { STEPS, LATER } from './tutorial-steps.js';
import { LESSON } from './teach-words.js';

const STORE = 'godgame.tutorial';
const RING_PAD = 8;   // the ring's outer edge stands this far outside the control, on every side

export function makeTutorial(U) {
  const { ctx } = U;
  const clock = ctx.clock;
  let mem = {};
  const load = () => { try { mem = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* memory only */ } };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(mem)); } catch { /* memory only */ } };
  load();
  if (!mem.later || typeof mem.later !== 'object') mem.later = {};

  // ---------- the strip and the ring ----------
  const strip = h('div', 'isl lesson');
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  strip.dataset.hudBlock = '';
  U.root.appendChild(strip);
  const ring = h('div', 'ring8');
  ring.setAttribute('aria-hidden', 'true');
  ctx.dom.ui.appendChild(ring);

  let mode = null;          // null | 'offer' | 'creation' | 'later'
  let i = 0, step = null, base = null, count = 0, done = new Set(), laterStep = null, praiseT = 0;
  const optsNow = () => {
    const id = U.get('god', 'tool');
    const t = id ? (U.get('god', 'tools') ?? []).find((x) => x.id === id) : null;
    const o = {};
    for (const x of Array.isArray(t?.options) ? t.options : []) o[x.name] = { value: Number(x.value), min: Number(x.min), max: Number(x.max) };
    return o;
  };
  const famOf = (id) => U.doors?.families?.().find((f) => f.modes.includes(id))?.id ?? null;
  const g = () => { const tool = U.get('god', 'tool'); return { tool, family: tool ? famOf(tool) : null, phase: clock.phase, door: U.doors?.cur ?? null, group: U.doors?.group ?? null, nav: (f) => U.doors?.nextTap?.(f) ?? '.door', opts: optsNow(), done, selected: U.inspect?.selected ?? null }; };
  const camState = () => { const c = ctx.camera; return { x: c.target.x, z: c.target.z, ppm: c.ppm, yaw: c.yaw }; };

  function render() {
    strip.classList.toggle('late', clock.phase === 'running');
    if (!mode) { strip.classList.remove('on'); strip.innerHTML = ''; return; }
    if (mode === 'offer') {
      strip.innerHTML = `<span class="lw">${esc(LESSON.offer)}</span><button class="btn primary ls-yes" type="button">${esc(LESSON.offerYes)}</button><button class="btn quiet ls-no" type="button">${esc(LESSON.offerNo)}</button>`;
      strip.querySelector('.ls-yes').addEventListener('click', () => begin(Math.max(0, STEPS.findIndex((s) => s.id === mem.creation))));
      strip.querySelector('.ls-no').addEventListener('click', () => { mem.creation = 'declined'; save(); stop(); });
      strip.classList.add('on');
      return;
    }
    const list = mode === 'later' ? LATER : STEPS;
    const s = mode === 'later' ? laterStep : step;
    const n = list.indexOf(s);
    const dots = list.length > 1 ? `<span class="ls-n" aria-label="Lesson ${n + 1} of ${list.length}">${n + 1}/${list.length}</span>` : '';
    const praising = performance.now() < praiseT;
    strip.innerHTML = `${dots}<span class="lw">${praising ? `${icon('met', 18)} ` : ''}${esc(praising ? 'Done.' : s.text)}</span>${praising ? '' : `<button class="btn quiet ls-skip" type="button">${esc(LESSON.skip)}</button>`}<button class="btn ico quiet ls-stop" type="button" aria-label="${esc(LESSON.stop)}">${icon('close', 18)}</button>`;
    strip.querySelector('.ls-skip')?.addEventListener('click', () => advance());
    strip.querySelector('.ls-stop').addEventListener('click', () => { if (mode === 'later') { for (const l of LATER) mem.later[l.id] = true; } else mem.creation = mem.creation === 'done' ? 'done' : 'declined'; save(); stop(); });
    strip.classList.add('on');
  }
  function begin(at = 0) { mode = 'creation'; setStep(Math.max(0, at)); }
  function setStep(k) {
    i = k;
    step = STEPS[i] ?? null;
    if (!step) { mem.creation = 'done'; save(); stop(); return; }
    if (step.check.kind === 'phase' && clock.phase === 'running') { advance(); return; }
    mem.creation = step.id; save();
    base = camState(); count = 0; done = new Set(); praiseT = 0;
    render();
  }
  // done: a short "Done." where the line was, then the next one
  function pass() {
    const s = mode === 'later' ? laterStep : step;
    if (!s || performance.now() < praiseT) return;
    U.sfx('ui.toggle');
    praiseT = performance.now() + 900;
    render();
    setTimeout(() => { if ((mode === 'later' ? laterStep : step) === s) advance(); }, 900);
  }
  function advance() {
    praiseT = 0;
    if (mode === 'later') { mem.later[laterStep.id] = true; save(); laterStep = null; mode = null; render(); return; }
    if (mode === 'creation') setStep(i + 1);
  }
  function stop() { mode = null; step = null; laterStep = null; render(); }

  // ---------- the checks ----------
  // an Omnipotence stroke: every tool but the cave draws into the see-through preview first, so a stroke is the preview's
  // count going up (god:pending); the cave is carved at its tick (its edit, "Carve a cave"); the tick itself is
  // god:applied
  function stroke(toolId, label) {
    const s = mode === 'creation' ? step : null;
    if (!s || s.check.kind !== 'stroke' || performance.now() < praiseT) return;
    const c = s.check;
    const id = String(toolId ?? '').toLowerCase(), lab = String(label ?? '').toLowerCase();
    const modes = c.modes ?? [];
    const hit = modes.filter((m) => id === m);
    const famHit = c.family && famOf(toolId) === c.family;
    const labHit = c.labels && c.labels.test(lab);
    if (!hit.length && !famHit && !labHit) return;
    if (c.want && !c.want(optsNow())) { U.hint?.(c.nearly ?? 'Nearly. Check the Size and the Strength, then try again.', 3500); return; }
    for (const m of hit) done.add(m);
    count++;
    if (c.all ? modes.every((m) => done.has(m)) : count >= (c.count ?? 1)) pass();
  }
  let strokes = 0;
  U.on('god:pending', (p) => { const n = Number(p?.strokes) || 0; if (n > strokes) stroke(p?.tool ?? U.get('god', 'tool')); strokes = n; });
  U.on('god:applied', () => { strokes = 0; if (mode === 'creation' && step?.check.kind === 'applied' && performance.now() >= praiseT) pass(); });
  U.on('edit', (e) => { if (/cave/i.test(String(e?.label ?? ''))) stroke('cave', e?.label); });
  U.on('phase', () => {
    if (clock.phase !== 'running') return;
    if (mode === 'creation' && step?.check.kind === 'phase') pass();
    else if (mode === 'creation') { save(); stop(); }
    else if (mode === 'offer') stop();
    render();
  });
  // the lessons once time runs: their moment, then their check
  const startYear = { y: null };
  const due = new Set();
  U.on('sim:settle', () => due.add('settle'));
  U.on('foresight:new', () => due.add('warning'));
  U.on('prayer:new', () => due.add('warning'));
  U.on('year', () => { if (startYear.y == null) startYear.y = clock.year; if (clock.year - startYear.y >= 40) due.add('years40'); });
  let lastSel = null;
  U.slow.push(() => {
    if (clock.phase !== 'running' || U.titleOn) return;
    const sel = U.inspect?.selected;
    const k = laterStep?.check.kind;
    if (mode === 'later' && k === 'select' && sel && sel !== lastSel && sel.kind === 'person') pass();
    lastSel = sel ?? null;
    if (mode === 'later' && k === 'world' && U.world2?.isOpen) pass();
    if (mode === 'later' && k === 'aim' && U.attend?.openKey) pass();
    if (mode) return;
    if (mem.creation === 'declined' && !mem.laterWanted) return;
    for (const l of LATER) if (!mem.later[l.id] && due.has(l.when)) { mode = 'later'; laterStep = l; render(); break; }
  });
  // the camera check, and the ring on the control to use
  U.frame.push(() => {
    if (mode === 'creation' && step?.check.kind === 'camera' && base && performance.now() >= praiseT) {
      const c = camState();
      if (Math.hypot(c.x - base.x, c.z - base.z) > 18 || Math.abs(Math.log(c.ppm / base.ppm)) > 0.3 || Math.abs(c.yaw - base.yaw) > 0.5) { base = null; pass(); }
    }
    const s = mode === 'later' ? laterStep : mode === 'creation' ? step : null;
    // once time runs, a lesson waits while something is open (the line itself stays; the ring goes)
    const held = (clock.phase === 'running' && (U.read?.why?.size ?? 0) > 0) || !!U.startWarn?.open;
    let target = null;
    if (s?.point && performance.now() >= praiseT && !U.menu?.isOpen && !U.titleOn && !held) {
      const st = g();
      for (const [test, pick] of s.point) {
        if (!test(st)) continue;
        const sel = typeof pick === 'function' ? pick(st) : pick;
        if (!sel) continue;
        const el = U.root.querySelector(sel) ?? document.querySelector(sel);
        if (el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none') { target = el; break; }
      }
    }
    if (target) {
      // exactly round its box, 8 px out on every side; its border is inside its own box
      const r = target.getBoundingClientRect();
      const rad = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
      const box = `${Math.round(r.left - RING_PAD)}|${Math.round(r.top - RING_PAD)}|${Math.round(r.width + 2 * RING_PAD)}|${Math.round(r.height + 2 * RING_PAD)}`;
      if (ring._box !== box) {
        ring._box = box;
        Object.assign(ring.style, { left: `${r.left - RING_PAD}px`, top: `${r.top - RING_PAD}px`, width: `${r.width + 2 * RING_PAD}px`, height: `${r.height + 2 * RING_PAD}px`, borderRadius: `${rad + RING_PAD}px` });
      }
      ring.classList.add('on');
    } else ring.classList.remove('on');
  });

  return {
    // from the title's "How to play", the menu, or the console
    start(o = {}) {
      if (clock.phase === 'creation') { if (o.again) { mem.creation = null; save(); } begin(o.again ? 0 : Math.max(0, STEPS.findIndex((s) => s.id === mem.creation))); }
      else { mem.laterWanted = true; if (o.again) mem.later = {}; save(); mode = null; render(); }
    },
    // after the title, on a first visit (or a lesson left part way): ask once, in the strip
    offer() {
      if (clock.phase !== 'creation') return;
      if (mem.creation === 'done' || mem.creation === 'declined') return;
      mode = 'offer'; render();
    },
    stop,
    get mode() { return mode; },
    get step() { return (mode === 'later' ? laterStep : step)?.id ?? null; },
    state: () => ({ ...mem }),
    reset() { mem = { later: {} }; save(); },
  };
}

export default [{
  type: 'panel', id: 'tutorial', region: 'root', order: 7,
  make(U) {
    U.tutorial = makeTutorial(U);
    // with no title screen (?notitle=1), a first visit is offered the lesson at once
    if (!U.titleOn) setTimeout(() => U.tutorial.offer(), 600);
    const s = h('span', 'tutorial-stub'); s.hidden = true; return s;
  },
}];
