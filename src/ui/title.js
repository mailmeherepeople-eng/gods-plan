// The title (mock-up A; DESIGN.md "Phone first"): the name, Begin, and How to play, Settings, Credits. Nothing else:
// no tagline, no land number (each new game gets a random land; ?seed=N in the address still replays one for
// testing). The live generated world turns slowly behind it, blurred (a filter on the world canvas for the title
// only; screens.js composes it and it is gone once the game begins). Then Difficulty: the three foresight levels
// with their own words, as how much the god foresees, Standard already picked, "Standard is the way the game is
// meant to be played." Every piece is laid out from the window's edges and reflows; nothing is shrunk to fit.
// ?notitle=1 skips both.
import { h, icon, esc } from './dom.js';
import { TITLE } from './teach-words.js';

const DRIFT = 0.035;     // radians a second the world turns behind the title
const BLUR = 'blur(6px) saturate(1.1) brightness(1.02)';
const LEVELS = [
  { id: 'generous', label: 'Generous', words: 'Warnings come as early as the world can be read. Plenty of time to act.' },
  { id: 'standard', label: 'Standard', words: 'Warnings come with enough time to act, if you go at once.' },
  { id: 'scant', label: 'Scant', words: 'Warnings come late. You will often be too late.' },
];

export function makeTitle(U) {
  const { ctx } = U;
  const q = new URLSearchParams(location.search);
  if (q.get('notitle') === '1' || ctx.clock.phase !== 'creation') return null;
  const canvas = ctx.dom.canvas, cam = ctx.camera, K = ctx.controls;
  const el = h('div', 'ts');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', "God's Plan");
  el.innerHTML = `<div class="ts-vignette" aria-hidden="true"></div>
    <div class="ts-name"><span class="ts-mark">${icon('stone', 44)}</span><h1 class="ts-title">${esc(TITLE.title)}</h1></div>
    <div class="ts-links" role="group" aria-label="More">
      <button class="btn ts-l ts-how" type="button">${icon('book', 20)}<span>${esc(TITLE.howTo)}</span></button>
      <button class="btn ts-l ts-set" type="button">${icon('sliders', 20)}<span>${esc(TITLE.settings)}</span></button>
      <button class="btn ts-l ts-cred" type="button">${icon('quill', 20)}<span>${esc(TITLE.credits)}</span></button>
    </div>
    <button class="btn primary ts-begin" type="button">${esc(TITLE.begin)}</button>
    <div class="ts-diff panel" role="group" aria-label="Difficulty" hidden>
      <div class="dhw"><h2 class="dh">Difficulty</h2><p class="dsub">How much the god foresees.</p></div>
      <div class="rows" role="radiogroup" aria-label="Difficulty"></div>
      <div class="dfoot"><p class="note">Standard is the way the game is meant to be played.</p><div class="acts"><button class="btn ts-back" type="button">Back</button><button class="btn primary ts-go" type="button">Begin</button></div></div>
    </div>
    <div class="ts-credits panel" hidden><div class="ts-ch"><span>${esc(TITLE.credits)}</span><button class="btn chip ts-cback" type="button">Back</button></div>${TITLE.creditsText.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`;
  el.style.opacity = '0';
  U.root.style.visibility = 'hidden';
  const css = U.style;
  const ready = () => { el.style.opacity = ''; requestAnimationFrame(() => el.classList.add('on')); };
  if (css?.sheet) ready(); else if (css) { css.addEventListener('load', ready, { once: true }); css.addEventListener('error', ready, { once: true }); setTimeout(ready, 1500); } else ready();
  ctx.dom.ui.appendChild(el);
  try { document.title = "God's Plan"; } catch { /* no title */ }
  U.titleOn = true;
  U.root.classList.add('titled');
  ctx.dom.labels?.classList.add('titled');

  // ---------- the world behind: blurred, turning slowly ----------
  const camWas = cam.state?.();
  const prevEnabled = K.enabled;
  K.enabled = false;
  canvas.style.transition = 'none';
  U.worldBlur = BLUR;
  canvas.style.filter = BLUR;
  void canvas.offsetWidth;
  canvas.style.transition = 'filter 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
  try {
    cam.anim = null;
    cam.mode = 'tilt';
    cam.ppm = Math.max(cam.minPpm?.() ?? 2, Math.hypot(innerWidth, innerHeight) / 230);
    cam.target.x = (cam.bounds?.().x0 + cam.bounds?.().x1) / 2 || cam.target.x;
    cam.target.z = (cam.bounds?.().z0 + cam.bounds?.().z1) / 2 || cam.target.z;
    cam.update();
  } catch (err) { U.warnOnce('title camera', err); }
  let alive = true, leaving = false;
  const drift = (dt) => {
    if (!alive || leaving) return;
    cam.yaw += DRIFT * Math.min(0.1, dt);
    cam.clamp?.(); cam.update?.();
  };
  U.frame.push(drift);

  // ---------- Difficulty ----------
  const diff = el.querySelector('.ts-diff'), rows = diff.querySelector('.rows');
  // the simulation's own levels and words when it has them; Standard is the default (the director, 2026-11-14)
  const simLv = U.foresightLevel?.()?.levels;
  const levels = Array.isArray(simLv) && simLv.length ? LEVELS.map((L) => ({ ...L, ...(simLv.find((x) => x.id === L.id) ?? {}) })) : LEVELS;
  let pick = U.settings.foresightChosen ? (U.settings.foresight ?? 'standard') : 'standard';
  for (const L of levels) {
    const b = h('button', 'btn row', `<span class="rd"></span><span><span class="rn">${esc(L.label)}</span><span class="rw">${esc(L.words ?? '')}</span></span>`);
    b.type = 'button'; b.dataset.lv = L.id; b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { pick = L.id; paintDiff(); U.sfx('ui.toggle'); });
    rows.appendChild(b);
  }
  function paintDiff() { for (const b of rows.children) { const on = b.dataset.lv === pick; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } }
  paintDiff();
  let step = 'title';
  function showStep(s) {
    step = s;
    el.dataset.step = s;
    diff.hidden = s !== 'difficulty';
    for (const n of el.querySelectorAll('.ts-links, .ts-begin')) n.hidden = s !== 'title';
    if (s === 'difficulty') setTimeout(() => el.querySelector('.ts-go').focus({ preventScroll: true }), 30);
    else setTimeout(() => el.querySelector('.ts-begin').focus({ preventScroll: true }), 30);
  }
  showStep('title');

  // ---------- leaving for the world ----------
  function begin(withLesson) {
    if (leaving) return;
    leaving = true;
    U.sfx('ui.click');
    // the difficulty: the settings remember it, the simulation is told
    U.settings.foresightChosen = true;
    if (U.foresightLevel) U.foresightLevel(pick); else { U.settings.foresight = pick; U.saveSettings(); }
    el.classList.remove('on'); el.classList.add('out');
    U.worldBlur = '';
    canvas.style.filter = '';
    try {
      const yaw = Math.round(cam.yaw / (Math.PI * 2)) * Math.PI * 2;
      const to = camWas ?? { x: cam.target.x, z: cam.target.z, ppm: 6, yaw: 0 };
      cam.anim = { from: { x: cam.target.x, y: cam.target.y, z: cam.target.z, ppm: cam.ppm, yaw: cam.yaw, pitch: cam.pitch }, to: { x: to.x, y: cam.target.y, z: to.z, ppm: to.ppm ?? 6, yaw, pitch: cam.pitch }, t: 0, dur: 1.1 };
    } catch { /* no camera */ }
    setTimeout(() => {
      alive = false;
      el.remove();
      U.titleOn = false;
      U.root.classList.remove('titled');
      U.root.style.visibility = '';
      ctx.dom.labels?.classList.remove('titled');
      K.enabled = prevEnabled !== false;
      const i = U.frame.indexOf(drift); if (i >= 0) U.frame.splice(i, 1);
      if (canvas.style.filter.includes('blur')) canvas.style.filter = '';
      ctx.events.emit('title:begin', { lesson: !!withLesson });
      if (withLesson) U.tutorial?.start({ again: true }); else U.tutorial?.offer();
      try { canvas.focus({ preventScroll: true }); } catch { /* fine */ }
    }, 650);
  }
  let lesson = false;
  el.querySelector('.ts-begin').addEventListener('click', () => { lesson = false; showStep('difficulty'); });
  el.querySelector('.ts-how').addEventListener('click', () => { lesson = true; showStep('difficulty'); });
  el.querySelector('.ts-back').addEventListener('click', () => showStep('title'));
  el.querySelector('.ts-go').addEventListener('click', () => begin(lesson));
  el.querySelector('.ts-set').addEventListener('click', () => U.menu?.open('settings', { fromTitle: true }));
  const credits = el.querySelector('.ts-credits');
  el.querySelector('.ts-cred').addEventListener('click', () => { credits.hidden = false; el.classList.add('dim'); credits.querySelector('.ts-cback').focus({ preventScroll: true }); });
  el.querySelector('.ts-cback').addEventListener('click', () => { credits.hidden = true; el.classList.remove('dim'); el.querySelector('.ts-begin').focus({ preventScroll: true }); });
  // keys while the title is up: Enter goes on, Esc goes back; no other key reaches the HUD or the world
  const onKey = (ev) => {
    if (!U.titleOn || leaving || U.menu?.isOpen) return;
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); if (!credits.hidden) el.querySelector('.ts-cback').click(); else if (step === 'difficulty') showStep('title'); }
    else if (ev.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') { ev.preventDefault(); if (step === 'title') showStep('difficulty'); else begin(lesson); }
  };
  addEventListener('keydown', onKey, true);
  return { el, begin, showStep, get step() { return step; }, get on() { return alive && !leaving; } };
}
