// The delight pass (docs/research/08-delight.md, its top fifteen): small moments that each carry one fact, on
// RESULTS, not on every action; a modest cast; nothing over the world; transform and opacity only; a fade in place
// under reduced motion. This file holds the shared parts and the moments that live on the world:
//   sound    one AudioContext made on the first press (never before a gesture), every sound synthesised (oscillators,
//            noise, a filter, an envelope); slight random pitch on repeats; the same sound within 80 ms merges; at
//            most 6 voices; a key that follows the people's mood; Settings: Sound on or off. The bus's `sfx:play
//            { name }` drives it, so every module's sound hook now sounds.
//   haptics  12 ms on Android for main buttons and results; Settings: Haptics on or off. iOS has no Vibration API.
//   press    every HUD button shrinks on pointer down within a frame and springs back on release, with a tiny click (K1)
//   fly      an arced flight from a point to an element (blobs to the Log, motes to the World door), with three
//            trail dots; under reduced motion a fade in place and a pulse at the target
//   eyes     people who saw an act get an eye each (12 at most); each eye becomes a gold mote that flies to the World
//            door, which nudges; "+N faith" rises beside it (#15); nobody saw: one closed eye (#16)
//   births   a seed pops over the home (#38); deaths leave a small grave mound that stays (#39, the HUD's own: the
//            simulation has no grave object yet)
//   meat     a hunter home with a deer: the meat drops into the family's food pip, which fills (#42)
//   beads    a help that marks a family's line: a bead flies to them, the clicks climb (#30)
//   rumble   raising land rumbles upward, digging rumbles downward (R1)
//   hit stop a power landing holds the world still 70 to 100 ms (#14), when time is running
import { h, icon } from './dom.js';

const STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // a pentatonic ladder, in semitones

export default [{
  type: 'panel', id: 'delight', region: 'root', order: 0,
  make(U) {
    const D = makeDelight(U);
    U.fx = D;
    const s = h('span', 'delight-stub'); s.hidden = true; s._d = D; return s;
  },
  frame(U, dt, el) { el._d.frame(dt); },
}];

function makeDelight(U) {
  const { ctx } = U;
  if (U.settings.sound == null) U.settings.sound = true;
  if (U.settings.haptics == null) U.settings.haptics = true;
  if (U.settings.shake == null) U.settings.shake = 100;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!U.settings.reduceMotion;
  const layer = h('div', 'dl-layer');
  // (not aria-hidden: the graves in it are buttons that take focus; the glyphs mark themselves)
  U.world.appendChild(layer);

  // ---------- sound ----------
  let ac = null, master = null, noise = null, voices = 0;
  const last = new Map();
  function audio() {
    if (ac) return ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      const n = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise = n;
    } catch { ac = null; }
    return ac;
  }
  // only after a gesture: the first press makes (or wakes) the context
  addEventListener('pointerdown', () => { if (U.settings.sound) { audio(); if (ac?.state === 'suspended') ac.resume().catch(() => {}); } }, { capture: true, passive: true });
  addEventListener('keydown', () => { if (U.settings.sound && ac?.state === 'suspended') ac.resume().catch(() => {}); }, { capture: true, passive: true });
  // the key follows the people's mood: content is brighter, hungry lower (MEMORY: pentatonic)
  const root = () => { const hp = U.get('sim', 'stats')?.happiness; return 196 * (Number.isFinite(hp) ? 2 ** (((hp - 50) / 50) * 2 / 12) : 1); };
  const note = (i) => root() * 2 ** (STEPS[Math.max(0, Math.min(STEPS.length - 1, i))] / 12);
  const jit = () => 1 + (Math.random() - 0.5) * 0.04;
  function osc(type, f0, f1, t0, dur, gain, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest ?? master); o.start(t0); o.stop(t0 + dur + 0.02);
    voices++; o.onended = () => { voices--; };
  }
  function burst(t0, dur, gain, type, freq, q = 1) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
    voices++; s.onended = () => { voices--; };
  }
  // chains: a ladder that steps up one note per event and resets after a quiet gap
  const ladders = new Map();
  function step(kind, gapMs, cap) {
    const now = performance.now(), L = ladders.get(kind) ?? { i: -1, t: 0 };
    L.i = now - L.t > gapMs ? 0 : Math.min(cap, L.i + 1); L.t = now; ladders.set(kind, L);
    return L.i;
  }
  let prayStreak = { n: 0, t: -1e9 };
  // the recipes (section 1 "Hears"), by the names the modules already send
  const R = {
    'ui.press': (t) => burst(t, 0.008, 0.03, 'bandpass', 3000, 2),
    'token.tolog': (t) => osc('sine', 520 * jit(), 780, t, 0.09, 0.08),
    'token.land': (t) => { const i = step('land', 600, 5); burst(t, 0.012, 0.06, 'bandpass', 1800, 3); osc('sine', 196 * 2 ** (STEPS[i] / 12), 0, t, 0.05, 0.09); },
    'token.new': (t) => { osc('triangle', 330 * jit(), 0, t, 0.04, 0.07); burst(t, 0.01, 0.04, 'bandpass', 2400, 2); },
    'prayer.new': (t) => { osc('sine', note(4), 0, t, 0.09, 0.05); osc('sine', note(4) * 1.5, 0, t + 0.06, 0.12, 0.05); },
    'token.saved': (t) => osc('sine', 140, 90, t, 0.08, 0.14),
    'token.resolved': (t) => osc('sine', 140, 90, t, 0.08, 0.14),
    'clock.pause': (t) => osc('sine', 440, 330, t, 0.12, 0.05),
    'clock.resume': (t) => osc('sine', 330, 440, t, 0.12, 0.05),
    'prayer.answered': (t) => {
      const now = performance.now();
      prayStreak = now - prayStreak.t < 180000 ? { n: Math.min(3, prayStreak.n + 1), t: now } : { n: 0, t: now };
      for (let k = 0; k < 3; k++) osc('triangle', note(prayStreak.n + k * 1 + (k ? 1 : 0)), 0, t + k * 0.07, 0.16, 0.07);
    },
    'power.land': (t) => { osc('sine', 80, 50, t, 0.12, 0.2); burst(t, 0.03, 0.05, 'highpass', 2500); burst(t + 0.01, 0.3, 0.04, 'lowpass', 600); },
    'mote': (t) => osc('sine', note(5 + step('mote', 500, 7)) * 2, 0, t, 0.06, 0.03),
    'unseen': (t) => osc('sine', 196, 0, t, 0.06, 0.04),
    'birth': (t) => osc('sine', 1568 * jit(), 0, t, 0.06, 0.025),
    'death': (t) => { osc('triangle', 110, 0, t, 0.05, 0.07); burst(t, 0.06, 0.04, 'lowpass', 300); },
    'meat': (t) => { burst(t, 0.05, 0.06, 'lowpass', 400); osc('sine', note(6), note(8), t + 0.05, 0.08, 0.04); },
    'bead': (t, o) => osc('triangle', note(3 + (o?.n ?? 0)) * 2, 0, t, 0.06, 0.05),
    'shape.even': (t) => osc('sine', 330, 440, t, 0.2, 0.03),
    'shape.lop': (t) => osc('sine', 440, 330, t, 0.2, 0.03),
    'ring.last': (t) => osc('sine', 220, 0, t, 0.03, 0.05),
    'refuse': (t) => { osc('triangle', 330, 0, t, 0.07, 0.04); osc('triangle', 247, 0, t + 0.08, 0.07, 0.04); },
    'log.fill': (t) => { burst(t, 0.09, 0.025, 'bandpass', 1400, 1.5); osc('sine', note(7), note(9), t + 0.02, 0.12, 0.025); },
    'alert.crisis': (t) => { osc('triangle', 196, 0, t, 0.12, 0.08); osc('triangle', 196, 0, t + 0.16, 0.12, 0.07); },
    'ui.open': (t) => { burst(t, 0.02, 0.025, 'bandpass', 3000, 2); burst(t + 0.03, 0.02, 0.02, 'bandpass', 3000, 2); },
    // the hunt (sim/hunting.js): a soft whoosh for a spear let go, a low twang for a bow; a dull thud when it
    // strikes; a small tick of earth for a miss. Quiet on purpose: a hunt is a small thing at the edge of the view
    'hunt.loose': (t, o) => { if (o?.weapon === 'bow') { osc('triangle', 150 * jit(), 95, t, 0.09, 0.035); burst(t, 0.03, 0.015, 'bandpass', 1600, 2); } else burst(t, 0.2, 0.022, 'bandpass', 700 * jit(), 1.1); },
    'hunt.hit': (t) => { osc('sine', 120 * jit(), 62, t, 0.11, 0.07); burst(t, 0.07, 0.03, 'lowpass', 450); },
    'hunt.miss': (t) => burst(t, 0.04, 0.02, 'lowpass', 800),
  };
  const ALIAS = { 'power.strike': 'power.land', 'power.land.heavy': null, 'great.fell': null, 'god:refused': 'refuse' };
  function play(name, o) {
    if (!U.settings.sound || document.hidden || o?.skip || U.get('sim', 'skip')?.running) return;   // (a skip is silent)
    let n = name;
    if (!R[n] && n?.startsWith('power.') && n !== 'power.arm' && n !== 'power.hold' && n !== 'power.cancel' && n !== 'power.witnessed') n = 'power.land';
    if (ALIAS[n] !== undefined) n = ALIAS[n];
    if (!n || !R[n] || !audio() || ac.state !== 'running') return;
    const now = performance.now();
    if (now - (last.get(n) ?? -1e9) < 80 || voices > 12) return;   // the same within 80 ms merges; about 6 sounds at once at most
    last.set(n, now);
    try { R[n](ac.currentTime + 0.005, o); } catch { /* a sound never breaks the game */ }
  }
  // a sound from a place in the world (p.at, with x and z) is heard only while that place is on screen and near enough to see
  U.on('sfx:play', (p) => { if (p?.at && Number.isFinite(p.x) && (ctx.camera.ppm < 2.2 || !onScreen(scr(p.x, ctx.vox?.standY?.(Math.floor(p.x), Math.floor(p.z)) ?? 16, p.z)))) return; play(p?.name, p); });
  U.on('god:refused', () => play('refuse'));

  // ---------- haptics (Android; iOS Safari has none) ----------
  const buzz = (ms = 12) => { if (U.settings.haptics && navigator.vibrate && matchMedia('(pointer: coarse)').matches) { try { navigator.vibrate(ms); } catch { /* blocked */ } } };

  // ---------- press feel on every HUD button (K1) ----------
  const MAIN = '.door, .tok, .sd-b, .tc-act, .startbtn, .tb, .logb, .forcesb, .amk, .amk-arrow';
  addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest?.('#ui button, #ui .readbox');
    if (!b || b.disabled) return;
    // A thing placed on the map by an inline transform must not be scaled: the scale also scales its
    // translate, so it jumps out from under the pointer and the click is lost.
    const placed = !!b.style.transform;
    if (!placed) b.classList.add('dl-press');
    play('ui.press');
    if (b.matches(MAIN)) buzz(12);
    const up = () => { b.classList.remove('dl-press'); if (!reduce()) { b.classList.remove('dl-spring'); void b.offsetWidth; b.classList.add('dl-spring'); } removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); };
    addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  }, { capture: true, passive: true });
  addEventListener('animationend', (ev) => { if (ev.animationName === 'dlspring') ev.target.classList.remove('dl-spring'); }, true);

  // ---------- an arced flight from a point to an element ----------
  // from: client {x, y}; to: an element (its middle) or a client point; o: { cls, size, color, delay, onLand, html }
  function fly(from, to, o = {}) {
    const tr = to instanceof Element ? to.getBoundingClientRect() : null;
    const tx = tr ? tr.left + tr.width / 2 : to.x, ty = tr ? tr.top + tr.height / 2 : to.y;
    const size = o.size ?? 14;
    if (reduce() || !Number.isFinite(from?.x) || !Number.isFinite(from?.y) || !Number.isFinite(tx) || !Number.isFinite(ty)) {
      // a fade in place, and the target pulses once: the fact is kept, the travel is not
      setTimeout(() => { o.onLand?.(); }, (o.delay ?? 0) + 150);
      return;
    }
    const el = h('i', `dl-blob ${o.cls ?? ''}`, o.html ?? '');
    el.style.width = el.style.height = `${size}px`;
    if (o.color) el.style.background = o.color;
    layer.appendChild(el);
    const dist = Math.hypot(tx - from.x, ty - from.y);
    const dur = Math.min(420, 260 + dist * 0.12) * (matchMedia('(pointer: coarse)').matches ? 0.8 : 1);
    // a gentle arc: the middle bows up (and never off the top of the screen)
    const mx = (from.x + tx) / 2, my = Math.max(size, Math.min(from.y, ty) - Math.min(120, dist * 0.25));
    const at = (x, y, s = 1) => `translate(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px) scale(${s})`;
    const kf = [{ transform: at(from.x, from.y, 1), opacity: 1 }, { transform: at(mx, my, 1), opacity: 1, offset: 0.5 }, { transform: at(tx, ty, 0.6), opacity: 0.9 }];
    const opts = { duration: dur, delay: o.delay ?? 0, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' };
    el.animate(kf, opts).finished.then(() => { el.remove(); o.onLand?.(); }).catch(() => el.remove());
    // three trail dots, each a little behind and fading over 150 ms
    if (!o.noTrail) for (let i = 1; i <= 3; i++) {
      const d = h('i', `dl-trail ${o.cls ?? ''}`);
      if (o.color) d.style.background = o.color;
      layer.appendChild(d);
      const s2 = 6 - i;
      const at2 = (x, y) => `translate(${(x - s2 / 2).toFixed(1)}px, ${(y - s2 / 2).toFixed(1)}px)`;
      d.style.width = d.style.height = `${s2}px`;
      d.animate([{ transform: at2(from.x, from.y), opacity: 0.6 }, { transform: at2(mx, my), opacity: 0.4, offset: 0.5 }, { transform: at2(tx, ty), opacity: 0 }], { ...opts, delay: (o.delay ?? 0) + i * 30 }).finished.then(() => d.remove()).catch(() => d.remove());
    }
  }
  // a short pulse on an element (the Log gulps, the door nudges): scale only
  function pulse(el, cls = 'dl-gulp') { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  addEventListener('animationend', (ev) => { for (const c of ['dl-gulp', 'dl-nudge', 'dl-pop']) if (ev.animationName === c.replace('dl-', 'dl')) ev.target.classList.remove(c); }, true);
  // a glyph that pops at a client point and stays `ms`, rising a little (eyes, seeds, labels)
  function glyph(x, y, html, cls, ms = 900) {
    const el = h('span', `dl-glyph ${cls ?? ''}`, html);
    el.setAttribute('aria-hidden', 'true');
    // (placed with left and top, once: a transform would be scaled by the pop's `scale` and start in the corner)
    el.style.left = `${x.toFixed(1)}px`; el.style.top = `${y.toFixed(1)}px`;
    el.style.setProperty('--life', `${ms}ms`);
    layer.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  }
  const scr = (x, y, z) => ctx.camera.toScreen(x, y, z);
  const onScreen = (s) => !s.behind && s.x > 0 && s.y > 0 && s.x < innerWidth && s.y < innerHeight;
  const skipping = () => !!U.get('sim', 'skip')?.running;

  // ---------- #15 and #16: who saw it, and faith going to the World door ----------
  U.on('faith:witness', (e) => {
    if (skipping() || !e || e.found) return;
    const door = U.root.querySelector('.forcesb');
    const people = (e.people ?? []).filter((m) => m?.p && !m.p.hidden && (m.df ?? 0) > 0.4);
    if (!people.length) {
      if (Number.isFinite(e.x) && !e.seen) { const s = scr(e.x, (ctx.vox?.standY?.(Math.floor(e.x), Math.floor(e.z)) ?? 16) + 2, e.z); if (onScreen(s)) { glyph(s.x, s.y, icon('unseen', 18), 'dl-eye shut', 1200); play('unseen'); } }
      return;
    }
    const shown = people.slice(0, 12);
    shown.forEach((m, i) => {
      const s = scr(m.p.x, (m.p.y ?? 16) + 2.6, m.p.z);
      if (!onScreen(s)) return;
      setTimeout(() => {
        glyph(s.x, s.y, icon('seen', 16), 'dl-eye', 420);
        if (door) fly({ x: s.x, y: s.y }, door, { cls: 'mote', size: 8, delay: 380, noTrail: true, onLand: () => { pulse(door, 'dl-nudge'); play('mote'); } });
      }, i * 40);
    });
    if (door) {
      const avg = Number(e.avgF);
      const n = Number.isFinite(avg) ? Math.round(avg) : 0;
      if (n) setTimeout(() => { const r = door.getBoundingClientRect(); glyph(r.left + r.width / 2, r.top - 12, `+${n} faith${people.length > 12 ? `, ${people.length} saw` : ''}`, 'dl-label', 1100); }, 380 + Math.min(12, shown.length) * 40 + 300);
    }
  });

  // ---------- #22: an answered prayer: gold motes rise from the family to the World door ----------
  U.on('prayer:answered', (p) => {
    const who = p?.person;
    const door = U.root.querySelector('.forcesb');
    if (who && door && Number.isFinite(who.x)) { const s = scr(who.x, (who.y ?? 16) + 2.6, who.z); if (onScreen(s)) for (let i = 0; i < 3; i++) fly({ x: s.x + (i - 1) * 8, y: s.y }, door, { cls: 'mote', size: 8, delay: i * 50, noTrail: true, onLand: () => pulse(door, 'dl-nudge') }); }
    play('prayer.answered');
    buzz(12);
  });

  // ---------- #38 and #39: births pop; deaths leave a mound that stays ----------
  const graves = [];
  const GRAVES_MAX = 600; // every grave the simulation keeps (graves.js KEEP): any of them can be raised
  let gravesArmed = false;
  let birthT = 0, birthN = 0, birthAt = null;
  U.on('sim:born', (e) => {
    if (skipping()) return;
    const c = e?.person; if (!c || !Number.isFinite(c.x)) return;
    // at 2x and 4x births within a second merge into one pop with "+3"
    const now = performance.now();
    if (now - birthT < 1000 && birthAt) { birthN++; birthAt.innerHTML = `${icon('sprout', 14)}<b>+${birthN}</b>`; return; }
    birthT = now; birthN = 1;
    const s = scr(c.x, (c.y ?? 16) + 2.4, c.z);
    if (!onScreen(s)) { birthAt = null; return; }
    birthAt = glyph(s.x, s.y, icon('sprout', 14), 'dl-seed', 1100);
    play('birth');
  });
  // graves: the simulation's own (graves.js, Round 4): a mound for each, kept, and a click on one opens in the slot
  // who lies there, how they died, and what would have saved them
  const graveIds = new Set();
  // the grave to open for a press at (px, py) that landed on grave `hit`'s tap area
  const GRAVE_REACH = 24, GRAVE_SAME = 12, GRAVE_AGAIN_MS = 6000; // px from a mound that still counts; how much farther the next mound may be, and for how long, for a second press to step to it
  let graveLast = null, graveStep = 0;
  function graveNear(px, py, hit) {
    const near = [];
    for (const o of graves) {
      if (!o.el.isConnected || o.el.classList.contains('gone')) continue;
      const r = o.el.getBoundingClientRect();
      if (!r.width) continue;
      const d = Math.hypot(px - (r.left + r.width / 2), py - (r.bottom - 16)); // the mound sits at the foot of its tap area
      if (d <= GRAVE_REACH || o.g === hit) near.push({ g: o.g, d });
    }
    if (!near.length) return hit;
    near.sort((a, b) => a.d - b.d);
    const now = performance.now();
    let pick = near[0].g;
    // pressed again where the grave just opened is still the nearest (the view may have slid aside for its card, so
    // the test is the grave, not the spot): step to the next mound, if one is about as near
    if (graveLast && near.length > 1 && now - graveLast.t < GRAVE_AGAIN_MS && near[0].g.id === graveLast.id && near[1].d - near[0].d <= GRAVE_SAME) {
      const group = near.filter((n) => n.d - near[0].d <= GRAVE_SAME);
      graveStep = (graveStep + 1) % group.length;
      pick = group[graveStep].g;
      graveLast = { id: near[0].g.id, t: now };
      return pick;
    }
    graveStep = 0;
    graveLast = { id: pick.id, t: now };
    return pick;
  }
  function addGrave(g) {
    if (!g || graveIds.has(g.id) || !Number.isFinite(g.x)) return;
    graveIds.add(g.id);
    const el = h('button', `dl-grave${gravesArmed ? ' arm' : ''}`);
    el.type = 'button';
    el.innerHTML = '<i></i>';
    const words = `${g.name ?? 'Someone'}${Number.isFinite(g.age) ? `, ${g.age}` : ''}${g.causeText || g.cause ? `: ${g.causeText || g.cause}` : ''}`;
    el.title = words;
    el.setAttribute('aria-label', `The grave of ${words}. Open it.`);
    // Open on the press itself: the press-feel shrink moves a marker that is placed by transform, so a
    // click (down and up on the same element) never completes with a real mouse. Keyboard still uses click.
    // Graves dug side by side share the same patch of screen, and the newest mound's tap area lies over the older
    // ones (the phone run of 2026-11-17: the back grave could not be opened). So a press opens the grave whose mound
    // is nearest the finger, whichever tap area took the press; a second press on the same spot steps to the next.
    el.addEventListener('pointerdown', (ev) => { if (ev.button === 0) { ev.stopPropagation(); openGrave(graveNear(ev.clientX, ev.clientY, g)); } });
    el.addEventListener('click', (ev) => { if (ev.detail === 0) openGrave(g); });
    layer.appendChild(el);
    graves.push({ el, g, x: g.x, z: g.z, y: null, born: performance.now() });
    while (graves.length > GRAVES_MAX) { const o = graves.shift(); o.el.remove(); graveIds.delete(o.g.id); }
  }
  // The grave card (the director, 2026-11-16: "when i click on a grave, it should tell me that i could have saved it"):
  // who lies there, when and how they died, what would have saved them (graves.js words, for every cause), and the
  // Resurrect button (sim/resurrect.js): it aims the power at this grave, so its price shows first, over the card. When
  // the limit is not ready, the button says when, in seasons, and opens the same price card with the reason. The lines
  // and the button are read again each time the card is drawn (a raising elsewhere, the seasons turning).
  function openGrave(g) {
    const key = `grave:${g.id}`;
    const target = { kind: 'grave', grave: g.id, x: g.x, z: g.z, name: g.name };
    const state = () => U.call('sim', 'ask', 'resurrectState', g.id) ?? null;
    const src = {
      get what() { const r = U.call('sim', 'ask', 'grave', g.id)?.raised; return r ? `The grave of ${g.name ?? 'someone'} is empty: they rose from it in ${r.yearLabel}.` : `Here lies ${g.name ?? 'someone'}.`; },
      get lines() {
        const st = state();
        return [
          `${g.name ?? 'Someone'}${g.family ? ` of the ${g.family} family` : ''}${g.clan && g.clan !== g.family ? `, the ${g.clan} clan` : ''}, ${Number.isFinite(g.age) ? `aged ${g.age}` : ''}.`.replace(', .', '.'),
          `${g.causeText ? `${g.causeText.charAt(0).toUpperCase()}${g.causeText.slice(1)}` : 'Died'}${g.yearLabel ? `, ${g.yearLabel}` : ''}.`,
          g.saved ? (/^(You|Nothing)\b/.test(g.saved) ? g.saved : `What would have saved them: ${g.saved}`) : '',
          // (why it will not open, unless the words above already say it: a second death of old age)
          st && !st.ok && !st.raised && !/twice/.test(g.saved ?? '') ? `${st.wait ? 'Resurrect is not ready yet. ' : ''}${st.why}` : '',
        ].filter(Boolean);
      },
      get acts() {
        const st = state();
        if (!st || !(st.ok || st.wait)) return [];
        return [{ label: st.label, away: false, go: () => (U.attend?.arm ? U.attend.arm(key, 'resurrect', target) : U.call('god', 'aimAt', 'resurrect', target)) }];
      },
    };
    U.attend?.note(key, { kind: 'grave', rail: false, sev: 'info', icon: 'grave', title: `The grave of ${g.name ?? 'someone'}`, x: g.x, z: g.z, src }, 40);
    U.attend?.refresh?.();
    U.attend?.open?.(key, true);
  }
  U.on('grave:new', (g) => { addGrave(g); if (!g?.skip && !skipping()) play('death'); });
  // the dead rose (sim/resurrect.js): the mound goes, with a soft lift of light where it was
  U.on('grave:gone', (g) => {
    const i = graves.findIndex((o) => o.g.id === g?.id);
    if (i < 0) return;
    const o = graves[i];
    graves.splice(i, 1); graveIds.delete(o.g.id);
    if (!reduce() && !o.el.hidden) { o.el.classList.add('gone'); setTimeout(() => o.el.remove(), 700); } else o.el.remove();
    if (!g.skip && !skipping()) play('birth');
  });
  // (graves already dug before this screen came up)
  setTimeout(() => { for (const g of (U.call('sim', 'ask', 'graves') ?? []).slice(0, GRAVES_MAX).reverse()) addGrave(g); }, 0);

  // ---------- #42: meat home: it drops into the family's food pip (hunt:home, Round 4) ----------
  U.on('hunt:home', (e) => {
    if (!e || e.skip || skipping()) return;
    const p = e.hunter, f = e.family, home = f?.home;
    const hx = Number.isFinite(e.x) ? e.x : home?.mx ?? home?.cx ?? home?.x, hz = Number.isFinite(e.z) ? e.z : home?.mz ?? home?.cz ?? home?.z;
    if (!Number.isFinite(hx)) return;
    const sh = scr(hx, (ctx.vox?.standY?.(Math.floor(hx), Math.floor(hz)) ?? 16) + 4, hz);
    if (!onScreen(sh)) return;
    const sp = p && Number.isFinite(p.x) ? scr(p.x, (p.y ?? 16) + 2.2, p.z) : null;
    // the pip: how full the family's store is, in years of eating (eight is full); before and after the meat
    const store = e.store ?? U.call('sim', 'ask', 'foodStore', f) ?? null;
    const after = Math.max(0, Math.min(8, Number(store?.years) || 0));
    const add = Math.max(0, Number(e.years) || 0);
    const was = Math.max(0, after - add);
    const pip = glyph(sh.x, sh.y, `${icon('hunger', 14)}<span class="dl-pip"><i style="transform:scaleX(${Math.max(0.02, was / 8).toFixed(3)})"></i></span>`, 'dl-food', 2600);
    const fill = pip.querySelector('.dl-pip i');
    fly(sp && onScreen(sp) ? { x: sp.x, y: sp.y } : { x: sh.x, y: sh.y - 40 }, { x: sh.x, y: sh.y }, { cls: 'meat', size: 12, html: '', noTrail: true, onLand: () => { if (fill) fill.style.transform = `scaleX(${Math.max(0.02, after / 8).toFixed(3)})`; play('meat'); } });
  });

  // ---------- #30: beads toward a blessed line (line:marked, Round 4) ----------
  // each mark sends one bead to the person it counted on, and one click, the clicks climbing with the line's marks;
  // the row shows the marks made and those still needed
  U.on('line:marked', (e) => {
    if (!e || e.skip || skipping()) return;
    const p = e.person;
    const x = Number.isFinite(e.x) ? e.x : p?.x, z = Number.isFinite(e.z) ? e.z : p?.z;
    if (!Number.isFinite(x)) return;
    const to = scr(x, (p?.y ?? ctx.vox?.standY?.(Math.floor(x), Math.floor(z)) ?? 16) + 0.3, z);
    if (!onScreen(to)) return;
    const total = Math.max(0, Math.round(Number(e.total) || 0)), need = Math.max(total, Math.round(Number(e.need) || 0));
    fly({ x: to.x, y: to.y - 40 }, { x: to.x, y: to.y }, { cls: 'bead', size: 9, noTrail: true, onLand: () => { glyph(to.x, to.y - 18, `${'●'.repeat(Math.min(8, total))}${'○'.repeat(Math.max(0, Math.min(8, need) - Math.min(8, total)))}`, 'dl-beads', 1600); play('bead', { n: Math.min(7, total) }); } });
  });

  // ---------- #14: the world holds still 70 to 100 ms when a power lands (time running only) ----------
  U.on('god:act', (e) => {
    const big = /strike|send-|flood|fire/.test(String(e?.power ?? e?.kind ?? ''));
    const clock = ctx.clock;
    if (!e?.power && e?.kind !== 'strike') return;
    if (reduce() || clock.phase !== 'running' || clock.paused) return;
    // the sim's own hit-stop (engine/clock.js): dt is 0 for the hold, `paused` untouched, no event
    if (typeof clock.hitStop === 'function') { clock.hitStop(big ? 100 : 70); return; }
    U.hitStop = true; clock.paused = true;
    setTimeout(() => { if (U.hitStop) { clock.paused = false; U.hitStop = false; } }, big ? 100 : 70);
  });

  // ---------- R1: Reshape rumbles: up when raising, down when digging ----------
  const RAISE = new Set(['raise']), LOWER = new Set(['lower']);
  let rum = null, downOnCanvas = false;
  ctx.dom.canvas.addEventListener('pointerdown', (ev) => { if (ev.button === 0) downOnCanvas = true; });
  addEventListener('pointerup', () => { downOnCanvas = false; }, true);
  function rumble(on, dir, top) {
    if (!on || !U.settings.sound || !audio() || ac.state !== 'running') { if (rum) { const r = rum; rum = null; try { r.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.05); r.s.stop(ac.currentTime + 0.25); } catch { /* gone */ } } return; }
    const G = ctx.config?.WORLD?.GROUND_Y ?? 16;
    const h2 = Math.max(-8, Math.min(16, (Number(top) || G) - G));
    const f = Math.max(80, (dir > 0 ? 220 + h2 * 22 : 220 + h2 * 12));
    if (!rum) {
      const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noise; s.loop = true; fl.type = 'bandpass'; fl.Q.value = 3; fl.frequency.value = f;
      g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05, ac.currentTime, 0.08);
      s.connect(fl); fl.connect(g); g.connect(master); s.start();
      rum = { s, fl, g, f };
    }
    // the grain: the pitch follows the height, and keeps moving the way the hand moves the land
    rum.f += (f + dir * 4 - rum.f) * 0.2;
    rum.fl.frequency.setTargetAtTime(rum.f, ac.currentTime, 0.05);
  }

  return {
    play, buzz, fly, pulse, glyph, reduce,
    frame(dt) {
      const lm = !!U.settings.reduceMotion;
      if (document.documentElement.classList.contains('lessmotion') !== lm) document.documentElement.classList.toggle('lessmotion', lm);
      // graves stay where they were dug, drawn only near enough to tell; while Resurrect is in hand every one shows,
      // at any zoom, lit, and lets the finger through to the map (god/aim.js finds the grave within 30 px of it)
      const armed = U.get('god', 'tool') === 'resurrect';
      const near = armed || ctx.camera.ppm >= 2.2;
      if (armed !== gravesArmed) { gravesArmed = armed; for (const g of graves) g.el.classList.toggle('arm', armed); }
      for (const g of graves) {
        if (!near) { if (!g.el.hidden) g.el.hidden = true; continue; }
        if (g.y == null) { try { g.y = ctx.vox.standY(Math.floor(g.x), Math.floor(g.z)); } catch { g.y = 16; } }
        const s = scr(g.x, g.y, g.z);
        const on = onScreen(s);
        if (g.el.hidden === on) g.el.hidden = !on;
        if (on) g.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      }
      // the rumble while a Reshape stroke is held on the land
      const t = U.get('god', 'tool');
      const dir = RAISE.has(t) ? 1 : LOWER.has(t) ? -1 : 0;
      rumble(dir !== 0 && downOnCanvas && !reduce() && U.pointer.overCanvas, dir, U.get('god', 'cursor')?.top);
      void dt;
    },
  };
}
