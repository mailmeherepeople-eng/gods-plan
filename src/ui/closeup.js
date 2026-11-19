// The close-up window (tickets T-0343, T-0808; the director chose option B of game/mock/fight-reads.html, then
// widened it, 2026-11-19: "i want the close up window for the raids. and i also want close up window when something
// happens in the game that can be game changing. like when the first people walk into the map, things which have the
// red indicator, the problem one, should have the window. and there should be an option in the settings for people
// to be able to turn the window on or off for all things.")
//
// One general thing: anything in the game may ask for the window on a place or on people (U.closeup.want, below);
// closeup-watch.js is where the raids, the first people and the red problem signs ask for it. The window:
//   - opens at the side of the screen away from what it shows, in the free space between the parts of the interface
//     there (never over a button, never over the thing it shows: when the thing comes under it, it moves across);
//   - shows the thing about 3.7 times nearer than the normal zoom, the same way up and tilted as the main view,
//     following it (the thickest knot of people when it is a crowd);
//   - closes by itself a few seconds after the thing is over; a tap on the picture glides the main view there and
//     closes it; its own cross (44 px) closes it;
//   - one at a time: the more serious thing wins, the other waits its turn (or is skipped when it waited too long);
//   - draws the land a second time, so its picture is drawn afresh only every EVERY frames and laid on the screen
//     every frame; closed or switched off it does no drawing at all;
//   - the name tags, markers and labels of the main view are not drawn over it (the layers that carry them get a
//     hole where it stands).
// Settings: one switch for all of it, `closeup`, on unless the player turns it off (menu.js).
// Console: game.modules.ui.dev.closeup (state, the numbers in T, want / drop by hand).
import * as THREE from '../../vendor/three.module.js';
import { Post } from '../engine/post.js';
import { SHADE } from '../world/shade.js';
import { h, icon, setText, setHidden } from './dom.js';
import { makeWatch } from './closeup-watch.js';

// every number a player could feel, named (none of these is the director's yet unless marked)
export const TUNE_CLOSEUP = {
  // ---- the window (the mock-up's option B, game/mock/fight-reads/stage.js) ----
  SHARE: 0.34,        // its width, a share of the screen's width ...
  MAX_W: 320,         // ... at most this many pixels
  ASPECT: 0.58,       // height / width
  MIN_H: 96,          // no room for a window this tall at the side: it waits (it is never squeezed smaller)
  PPM: 22,            // its zoom (pixels a metre): about 3.7 times the game's opening zoom of 6
  EDGE: 16,           // from the screen's side edge (plus the camera hole's strip), as every part of the interface
  GAP: 8,             // kept this far from every button and panel
  OPEN_S: 0.35,       // grows open and shrinks shut this fast (seconds)
  FOLLOW: 3,          // how quickly it follows the thing (a share of the way, per second)
  EVERY: 2,           // its picture is drawn afresh every this many frames (2: 30 a second when the game runs at 60)
  RES: 1,             // its picture's resolution, a share of the screen's own
  SKIP_R: 8,          // figures further than its edge by this many metres are not drawn in it at all (smoothness)
  KNOT_R: 6,          // a crowd: it follows the thickest knot of people this wide (metres)
  FLIP_PAD: 24,       // the thing this close to the window (pixels, plus half the knot's width on screen): it moves across
  NEAR_PPM: 17.6,     // the main view already this close in, with the thing on screen: no window (it would add nothing)
  TAP_PPM: 17.6,      // a tap on the window glides the main view to the thing at this zoom (or nearer if it is)
  LAYOUT_S: 0.25,     // where it fits is looked at again this often (seconds)
  // ---- which thing, and for how long ----
  RANK: { soon: 5, hunt: 5, raid: 4, died: 3, leaving: 3, first: 2 }, // two at once: the higher one wins
  PREEMPT: true,      // a more serious thing takes the window from a lesser one at once (that one waits its turn)
  WAIT_S: 20,         // one waiting longer than this for its turn is skipped
  AFTER_S: 3,         // the window stays this long after the thing is over (the mock-up: after the last blow)
  MAX_S: 60,          // no thing keeps the window longer than this
  // ---- where it does not show (the director has not decided; each false is the recommended answer) ----
  IN_BATTLE: false,   // on the separate battle screen
  WALKING: false,     // in the ground view
  READING: false,     // while a card is open and time is held for reading
  SLOW_TIME: false,   // true: time is held as for a moment while the window is open (recommended: no change to time)
  // ---- what opens it (closeup-watch.js) ----
  EARLY_R: 14,        // a raid: opens when the band is this close to where it halts (metres), so the charge is seen
  SOON_S: 10,         // a red warning counted in seconds: opens this many real seconds before it comes
  DIED_S: 6,          // a death that just happened under a red sign: the place is shown this long
  DIED_NEAR_R: 20,    // ... and another death this close (metres) ...
  DIED_NEAR_S: 30,    // ... within this many real seconds opens no second window (a sickness through a village)
  LEAVE_S: 15,        // a family leaving under a red sign: followed at most this long
  FIRST_S: 20,        // the first people: followed at most this long, or until they settle
};
const T = TUNE_CLOSEUP;
const BORDER = 3;      // the frame's width (pixels): the look, not a feel
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export default [{
  type: 'panel', id: 'closeup', region: 'root', order: 6,
  make(U) { const W = makeCloseup(U); const stub = h('span', 'closeup-stub'); stub.hidden = true; stub._w = W; return stub; },
  update(U, dt, el) { el._w.slow(dt); },
  frame(U, dt, el) { el._w.frame(dt); },
}];

function makeCloseup(U) {
  const { ctx } = U;
  const C = ctx.camera, R = ctx.renderer, clock = ctx.clock;
  if (U.settings.closeup == null) U.settings.closeup = true;
  const on = () => U.settings.closeup !== false;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!U.settings.reduceMotion;

  // ---------- the element ----------
  const el = h('div', 'cu');
  el.dataset.hudBlock = '';
  el.hidden = true;
  el.innerHTML = `<button class="cu-go" type="button"><span class="cu-tag"><b></b><span>Tap to go there</span></span></button>
    <button class="btn ico cu-x" type="button" aria-label="Close the close-up">${icon('close', 20)}</button>`;
  const goB = el.querySelector('.cu-go'), xB = el.querySelector('.cu-x'), tagB = el.querySelector('.cu-tag b');
  // under the interface (z order: the world's tags 60, this 80, the HUD 100), over the map
  ctx.dom.ui.insertBefore(el, U.root);
  goB.addEventListener('click', () => {
    const w = cur;
    if (!w) return;
    const c = { x: win.x, y: win.y, z: win.z };
    end(w);
    U.glide(c.x, c.z, { y: c.y, ppm: T.TAP_PPM, sheet: false });
    U.sfx('ui.open');
  });
  xB.addEventListener('click', () => { if (cur) end(cur); U.sfx('ui.close'); });

  // ---------- the things that want it ----------
  const wants = new Map();   // key -> want (waiting its turn)
  const done = new Set();    // keys shown, closed or skipped: never asked for again
  let cur = null;
  const real = () => performance.now();
  function remember(k) { done.add(k); if (done.size > 400) done.delete(done.values().next().value); }
  // w: { key, rank, label, focus() -> { x, y?, z } | null, live() -> bool, afterS?, maxS? }
  function want(w) {
    if (!on() || !w?.key || done.has(w.key) || wants.has(w.key) || cur?.key === w.key) return false;
    wants.set(w.key, { rank: 1, ...w, at: real(), endedAt: null });
    return true;
  }
  function drop(key) { wants.delete(key); if (cur?.key === key) end(cur); }
  function end(w) {
    remember(w.key);
    wants.delete(w.key);
    // (the picture stays where it was while the window shrinks shut)
    if (cur === w) cur = null;
  }
  // over, and its time after the end has run out
  function spent(w, t) {
    let live = false;
    try { live = !!w.live(); } catch { live = false; }
    if (live) w.endedAt = null; else if (w.endedAt == null) w.endedAt = t;
    return (w.endedAt != null && t - w.endedAt > (w.afterS ?? T.AFTER_S) * 1000) || t - (w.shownAt ?? w.at) > (w.maxS ?? T.MAX_S) * 1000;
  }
  function choose() {
    const t = real();
    for (const [k, w] of wants) if (spent(w, t) || t - w.at > T.WAIT_S * 1000) { wants.delete(k); remember(k); }
    if (cur && spent(cur, t)) end(cur);
    let best = null;
    for (const w of wants.values()) if (!best || w.rank > best.rank) best = w;
    if (!best) return;
    if (!cur || (T.PREEMPT && best.rank > cur.rank)) {
      if (cur) { cur.at = t; wants.set(cur.key, cur); }   // the lesser one waits its turn again
      wants.delete(best.key);
      cur = best; cur.shownAt = cur.shownAt ?? t;
      win.has = false;
      setText(tagB, cur.label ? `${cur.label}. ` : '');
      const words = `Close up${cur.label ? ` of ${cur.label.toLowerCase()}` : ''}: tap to go there`;
      goB.setAttribute('aria-label', words); goB.title = words;
    }
  }

  // ---------- where it may not show ----------
  function blocked() {
    if (clock.phase !== 'running') return true;
    if (U.walking && !T.WALKING) return true;
    if (document.documentElement.dataset.battle && !T.IN_BATTLE) return true;
    if (U.read?.held && !T.READING) return true;
    if (U.menu?.isOpen) return true;
    if (U.root.classList.contains('hud-hidden') || U.root.classList.contains('upright') || U.root.classList.contains('titled')) return true;
    if (U.get('sim', 'skip')?.running || U.skipNow) return true;
    return false;
  }

  // ---------- the window's state ----------
  const win = { open: 0, x: 0, y: 0, z: 0, has: false, side: null, rect: null, layT: 0, near: false, cam: null, post: null, k: 0, sized: '', drawn: false, drawMs: 0, calls: 0 };
  const ground = (x, z) => { try { return ctx.vox.standY(Math.floor(x), Math.floor(z)); } catch { return C.target.y; } };
  function focusNow() {
    let f = null;
    try { f = cur?.focus?.() ?? null; } catch { f = null; }
    if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.z)) return null;
    return { x: f.x, y: Number.isFinite(f.y) ? f.y : ground(f.x, f.z), z: f.z };
  }

  // ---------- the free space at the side ----------
  // the boxes of the interface it must keep clear of: islands, the parts marked for the god's buttons, the hint chip,
  // and the god's own tick and cross (they sit on the page itself)
  // (and the battle's own cards on the home map: "Raiders in 4 years", Skip to it, Visit the Marches; ui/battle.js)
  const SEL = '.hud .isl, .hud [data-hud-block], .hud .hchip, .hud .cchip, button[data-ghost], .bt-card:not(.bt-hide), .bt-barw';
  function obstacles() {
    const out = [];
    for (const e of document.querySelectorAll(SEL)) {
      if (e === el || el.contains(e) || e.closest('.cu')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) continue;
      out.push(r);
    }
    return out;
  }
  // the window's rectangle on one side, in the tallest free stretch there; null when there is no room
  function rectOn(side, obs) {
    const W = innerWidth, H = innerHeight, sa = U.safe?.() ?? { l: 0, r: 0, t: 0, b: 0 };
    let w = Math.round(Math.min(T.MAX_W, W * T.SHARE)), hh = Math.round(w * T.ASPECT);
    const edge = T.EDGE + (side === 'left' ? sa.l : sa.r);
    const xAt = (ww) => (side === 'left' ? edge : W - edge - ww);
    let x = xAt(w);
    // free stretches up and down that column (the frame and the gap round it count)
    let free = [[T.EDGE + sa.t, H - T.EDGE - sa.b]];
    const l = x - BORDER - T.GAP, r = x + w + BORDER + T.GAP;
    for (const o of obs) {
      if (o.right <= l || o.left >= r) continue;
      const a = o.top - T.GAP - BORDER, b = o.bottom + T.GAP + BORDER;
      const next = [];
      for (const [p, q] of free) { if (b <= p || a >= q) { next.push([p, q]); continue; } if (a > p) next.push([p, a]); if (b < q) next.push([b, q]); }
      free = next;
    }
    let best = null;
    for (const s of free) if (!best || s[1] - s[0] > best[1] - best[0]) best = s;
    if (!best || best[1] - best[0] < T.MIN_H) return null;
    if (hh > best[1] - best[0]) { hh = Math.floor(best[1] - best[0]); w = Math.round(hh / T.ASPECT); x = xAt(w); }
    return { x: Math.round(x), y: Math.round(best[0] + (best[1] - best[0] - hh) / 2), w, h: hh };
  }
  const covers = (r, s, pad) => !!s && s.x > r.x - pad && s.x < r.x + r.w + pad && s.y > r.y - pad && s.y < r.y + r.h + pad;
  function layout() {
    const s = C.toScreen(win.x, win.y, win.z);
    const seen = !s.behind && s.x >= 0 && s.y >= 0 && s.x <= innerWidth && s.y <= innerHeight;
    // the main view is already close in on it: the window would add nothing
    win.near = seen && C.ppm >= T.NEAR_PPM;
    const obs = obstacles();
    const pad = T.FLIP_PAD + T.KNOT_R * 0.5 * C.ppm;
    const away = !seen ? (win.side ?? 'right') : s.x > innerWidth / 2 ? 'left' : 'right';
    const other = (sd) => (sd === 'left' ? 'right' : 'left');
    // where it stands now is kept while it is still clear of every part and of the thing (no wobble as tokens come
    // and go above it)
    const old = win.rect;
    if (old && win.side && !covers(old, seen ? s : null, pad) && old.x + old.w <= innerWidth - T.EDGE && old.y + old.h <= innerHeight - T.EDGE) {
      const m = BORDER + T.GAP;
      const clear = obs.every((o) => o.right <= old.x - m || o.left >= old.x + old.w + m || o.bottom <= old.y - m || o.top >= old.y + old.h + m);
      if (clear) return;
    }
    let side = win.side ?? away;
    let r = rectOn(side, obs);
    // the thing came under it (or there is no room on this side): the other side, if the thing is clear of it there
    if (!r || covers(r, seen ? s : null, pad)) {
      const r2 = rectOn(other(side), obs);
      if (r2 && !covers(r2, seen ? s : null, pad)) { side = other(side); r = r2; }
      else if (r && covers(r, seen ? s : null, pad)) r = null;
    }
    win.side = side;
    win.rect = r;
  }

  // ---------- the hole in the layers drawn over the map ----------
  let holeAt = '';
  function hole(r) {
    const key = r ? `${r.x},${r.y},${r.w},${r.h}` : '';
    if (key === holeAt) return;
    holeAt = key;
    const v = r ? `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z")` : '';
    for (const layer of [U.world, ctx.dom.labels]) if (layer) layer.style.clipPath = v;
  }

  // ---------- every frame ----------
  let lastShown = '';
  function frame(dt) {
    // switched off: everything waiting is let go (not remembered as shown: switched on again, a thing still going opens it)
    if (!on()) { if (cur || wants.size || win.open) { wants.clear(); cur = null; win.open = 0; win.has = false; hide(); } return; }
    if (!cur && !wants.size && !win.open) return;   // nothing wants it: nothing runs
    choose();
    const stop = blocked();
    const f = cur ? focusNow() : null;
    if (f) {
      if (!win.has) { win.x = f.x; win.y = f.y; win.z = f.z; win.has = true; win.side = null; win.layT = 0; win.drawn = false; }
      const k = Math.min(1, dt * T.FOLLOW);
      win.x += (f.x - win.x) * k; win.y += (f.y - win.y) * k; win.z += (f.z - win.z) * k;
    }
    win.layT -= dt;
    if (win.has && (win.layT <= 0 || !win.rect)) { win.layT = T.LAYOUT_S; layout(); }
    const show = !!cur && win.has && !stop && !!win.rect && !win.near;
    win.open = reduce() ? (show ? 1 : 0) : Math.max(0, Math.min(1, win.open + (show ? 1 : -1) * dt / T.OPEN_S));
    if (!cur && !win.open) win.has = false;
    if (T.SLOW_TIME) { if (show && clock.hold && !clock.moments?.has?.('closeup')) clock.hold('closeup', { kind: 'closeup', text: cur?.label ?? '' }); else if (!show && clock.moments?.has?.('closeup')) clock.release?.('closeup'); }
    // where the near-detail figures are drawn (sim/index.js: people inside the window keep their full figure)
    ctx.closeup = win.open > 0 && win.has ? { x: win.x, z: win.z, r2: (T.MAX_W / T.PPM) ** 2 } : null;
    if (!(win.open > 0) || !win.rect) { hide(); return; }
    const r = shown();
    const tag = `${r.x},${r.y},${r.w},${r.h}`;
    if (tag !== lastShown) {
      lastShown = tag;
      Object.assign(el.style, { left: `${r.x - BORDER}px`, top: `${r.y - BORDER}px`, width: `${r.w + BORDER * 2}px`, height: `${r.h + BORDER * 2}px` });
      el.classList.toggle('left', win.side === 'left');
      hole({ x: r.x - BORDER, y: r.y - BORDER, w: r.w + BORDER * 2, h: r.h + BORDER * 2 });
    }
    el.classList.toggle('full', win.open >= 1);
    setHidden(el, false);
  }
  // the rectangle as drawn now (it grows from its middle as it opens)
  function shown() {
    const r0 = win.rect, s = reduce() ? 1 : ease(win.open);
    const w = Math.max(2, Math.round(r0.w * s)), hh = Math.max(2, Math.round(r0.h * s));
    return { x: Math.round(r0.x + (r0.w - w) / 2), y: Math.round(r0.y + (r0.h - hh) / 2), w, h: hh, s };
  }
  function hide() {
    if (!el.hidden) setHidden(el, true);
    lastShown = '';
    hole(null);
    if (!win.open) ctx.closeup = null;
  }

  // ---------- the picture: the land drawn a second time, after the main frame ----------
  const _v = new THREE.Vector3(), _size = new THREE.Vector2(), _lin = new THREE.Color(), _keep = new THREE.Vector3();
  const hid = [];
  function draw() {
    if (!(win.open > 0) || !win.has || !win.rect || el.hidden) return;
    const gl = R.gl, main = C.cam;
    const r = shown();
    if (!win.cam) win.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
    const cam = win.cam;
    // the same view as the main camera (turn and tilt), centred on the thing, nearer
    cam.quaternion.copy(main.quaternion);
    cam.up.copy(main.up);
    _v.copy(main.position).sub(C.target);
    cam.position.set(win.x, win.y, win.z).add(_v);
    const k = 1 / (T.PPM * r.s);
    cam.left = -r.w / 2 * k; cam.right = r.w / 2 * k; cam.top = r.h / 2 * k; cam.bottom = -r.h / 2 * k;
    cam.near = main.near; cam.far = main.far;
    cam.layers.mask = main.layers.mask;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // the picture is drawn into its own target (the costly part, only every EVERY frames) and laid on the screen every
    // frame with the same tone curve and colour the main view gets (engine/post.js: on the plain tier its grade is
    // left out, as the main view has none)
    if (!win.post) {
      win.post = new Post(gl);
      win.post.material.uniforms.uTexel.value.set(1, 1);
    }
    const P = win.post, u = P.material.uniforms;
    if (R.rich) { u.uSat.value = 1.12; u.uLift.value.set(0.01, 0.006, 0); u.uGain.value.set(1.06, 1.06, 1.095); }
    else { u.uSat.value = 1; u.uLift.value.set(0, 0, 0); u.uGain.value.set(1, 1, 1); }
    const pr = gl.getPixelRatio();
    P.setSize(r.w * pr, r.h * pr, T.RES);
    const sized = `${P.target.width}x${P.target.height}`;
    win.k = (win.k + 1) % Math.max(1, T.EVERY);
    if (win.k === 0 || win.open < 1 || sized !== win.sized || !win.drawn) {
      win.sized = sized; win.drawn = true;
      const scene = R.scene, auto = scene.matrixWorldAutoUpdate;
      // (the main frame has just brought every object's matrix up to date: not done twice)
      scene.matrixWorldAutoUpdate = false;
      // the plain tier mixes the edge mist after its colour encode; into a target it must be the linear colour, as
      // the rich tier has it (renderer.js _syncEdgeColor)
      const ec = SHADE.edgeColor.value;
      _keep.copy(ec);
      if (!R.rich) { _lin.setHex(R._mistHex ?? 0xcfd9dd); ec.set(_lin.r, _lin.g, _lin.b); }
      const t0 = performance.now();
      // the figures and things far outside it are not even looked at (most of the cost of a second draw is walking
      // through every object to see whether it is in view): those whose middle lies further than the window reaches
      // are hidden for this draw only
      const reach = (Math.hypot(r.w, r.h) / 2 / (T.PPM * r.s)) / Math.max(0.2, C.sinP?.() ?? 1) + T.SKIP_R;
      hid.length = 0;
      const R2 = reach * reach;
      for (const list of [U.get('sim', 'people'), U.get('sim', 'animals')]) {
        for (const e of list ?? []) {
          const o = e.F?.group;
          if (!o || !o.visible || !Number.isFinite(e.x)) continue;
          const dx = e.x - win.x, dz = e.z - win.z;
          if (dx * dx + dz * dz > R2) { o.visible = false; hid.push(o); }
        }
      }
      try {
        gl.setRenderTarget(P.target);
        gl.render(scene, cam);
        win.calls = gl.info.render.calls;
      } finally {
        for (const o of hid) o.visible = true;
        win.drawMs = win.drawMs * 0.9 + (performance.now() - t0) * 0.1;
        gl.setRenderTarget(null);
        ec.copy(_keep);
        scene.matrixWorldAutoUpdate = auto;
      }
    }
    gl.getSize(_size);
    const yb = _size.y - r.y - r.h; // GL counts from the bottom
    gl.setViewport(r.x, yb, r.w, r.h); gl.setScissor(r.x, yb, r.w, r.h); gl.setScissorTest(true);
    gl.render(P.scene, P.camera);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, _size.x, _size.y);
  }
  R.after.push(draw);
  // a new window size (the phone turned, the browser bar went): laid out afresh
  U.on('resize', () => { win.rect = null; win.side = null; win.layT = 0; });

  // the sources: raids, the first people, the red problem signs (closeup-watch.js)
  const watch = makeWatch(U, { want, drop, has: (k) => done.has(k) || wants.has(k) || cur?.key === k, T });

  U.closeup = {
    want, drop, T,
    get on() { return on(); },
    get open() { return win.open; },
    get current() { return cur ? { key: cur.key, label: cur.label, rank: cur.rank } : null; },
    get waiting() { return [...wants.values()].map((w) => ({ key: w.key, label: w.label, rank: w.rank })); },
    get rect() { return win.rect && !el.hidden ? shown() : null; },
    get side() { return win.side; },
    // console: what it is doing
    state: () => ({ on: on(), open: win.open, blocked: blocked(), near: win.near, current: cur?.key ?? null, label: cur?.label ?? null, waiting: [...wants.keys()], rect: win.rect, side: win.side, at: win.has ? { x: win.x, z: win.z } : null, done: done.size, drawMs: Math.round(win.drawMs * 100) / 100, calls: win.calls }),
    // the switch (menu.js): off drops everything at once
    set(v) { U.settings.closeup = !!v; U.saveSettings(); if (!v) frame(0); },
    watch,
  };
  return { frame, slow: (dt) => watch.slow(dt) };
}
