// The HUD and screens. docs/HUD.md is the manual; DESIGN.md "Phone first" and "Decisions after the mock-ups" the
// brief (2026-11-14: mock-up A, "two thumbs", game/mock2/a.html). One layout for PC and phone that reflows to fit
// the window: nothing is shrunk, no zoom, no transform on the interface; text never under 13 px, targets never
// under 44 x 44, 16 px plus the safe area from every edge.
//   tokens.css  colours, type, timings      screen.css  every part's look and place
//   dom.js      helpers and the drawn icons tooltip.js  tooltips
//   time.js     the time box (top left): pause, the date, Earth, the speeds, "Paused while reading"
//   slot.js     the side sheet on the right (a warning, a power's price, a person, World, the Log: one at a time)
//   doors.js    the door at the bottom left (Reshape, then Powers), the row it opens, the tool in hand
//   feed.js     the Log (a sheet) and its scroll button        inspect.js  selection and the person sheet
//   power.js    a power's price in the sheet, the landing      cursor.js   cursor chip, hint chip
//   menu.js     Log and Menu (top right); the menu              screens.js  the start button, its warning, night
//   title.js    the title and the Difficulty step
//   registry.js panels, readouts, inspector sections as data (plugins.js lists the files)
// Reads ctx.modules.god and ctx.modules.sim through guarded calls only, and listens to the bus. Runs alone
// (?skip=god,sim): values show as "-".
import { h } from './dom.js';
import { makeTips } from './tooltip.js';
import { makeTime } from './time.js';
import { makeSlot } from './slot.js';
import { makeDoors } from './doors.js';
import { makeFeed } from './feed.js';
import { makeInspect } from './inspect.js';
import { makePower } from './power.js';
import { makeCursor } from './cursor.js';
import { makeMenu } from './menu.js';
import { makeScreens } from './screens.js';
import { makeRegistry } from './registry.js';
import { PANELS } from './plugins.js';
import { makeS2 } from './s2.js';

const STORE = 'godgame.ui';
// how long the camera takes to travel to a thing before it opens (the director: "nothing teleports"; the same
// time whatever the distance, so the player learns distance from speed)
const GLIDE_S = 0.4;

function addFonts() {
  if (document.querySelector('link[data-hud-fonts]')) return;
  const add = (attrs) => { const l = document.createElement('link'); for (const [k, v] of Object.entries(attrs)) l.setAttribute(k, v); l.dataset.hudFonts = '1'; document.head.appendChild(l); };
  add({ rel: 'preconnect', href: 'https://fonts.googleapis.com' });
  add({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' });
  add({ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&family=Fraunces:opsz,wght@9..144,600..800&family=Patrick+Hand&display=swap' });
}

export async function init(ctx) {
  if (!new URLSearchParams(location.search).has('nofonts')) addFonts();
  ctx.addStyle(new URL('./tokens.css', import.meta.url));
  const style = ctx.addStyle(new URL('./screen.css', import.meta.url));

  const ui = ctx.dom.ui;
  const root = h('div', 'hud');
  root.setAttribute('aria-label', 'Game interface');
  const world = h('div', 'hud-layer hud-world');   // rings and markers on the world (client px)
  ui.append(world, root);
  const topbar = h('div', 'hud-tr');               // top right: the tokens, the Log, the Menu
  topbar.dataset.hudBlock = '';
  root.append(topbar);

  // ---------- shared ----------
  const warned = new Set();
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!U.settings?.reduceMotion;
  const U = {
    ctx, root, world, topbar, style,
    daylight: 1,
    pointer: { x: innerWidth / 2, y: innerHeight / 2, overCanvas: false, overHud: false },
    frame: [], slow: [],
    god: () => ctx.modules?.god ?? null,
    sim: () => ctx.modules?.sim ?? null,
    warnOnce(key, err) { if (warned.has(key)) return; warned.add(key); console.warn(`ui: ${key} failed`, err); },
    call(mod, name, ...args) {
      const m = mod === 'god' ? U.god() : U.sim();
      const f = m?.[name];
      if (typeof f !== 'function') return undefined;
      try { return f.apply(m, args); } catch (err) { U.warnOnce(`${mod}.${name}`, err); return undefined; }
    },
    get(mod, prop) {
      try { return (mod === 'god' ? U.god() : U.sim())?.[prop]; } catch (err) { U.warnOnce(`${mod}.${prop}`, err); return undefined; }
    },
    on(name, fn) {
      return ctx.events.on(name, (p) => { try { fn(p); } catch (err) { U.warnOnce(`on ${name}`, err); } });
    },
    sfx(name) { try { ctx.events.emit('sfx:play', { name }); } catch { /* nobody listens yet */ } },
  };

  // ---------- settings ----------
  U.settings = { edgePan: true, hints: true, seen: {} };
  try { Object.assign(U.settings, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch { /* private window */ }
  if (!U.settings.seen || typeof U.settings.seen !== 'object') U.settings.seen = {};
  delete U.settings.scale;   // (the old "Interface size": the interface is never shrunk now)
  U.saveSettings = () => { try { localStorage.setItem(STORE, JSON.stringify(U.settings)); } catch { /* no storage */ } };
  // the height really on show (100vh on a phone counts the space under the address bar, and cuts the bottom off)
  const fitHeight = () => document.documentElement.style.setProperty('--app-h', `${innerHeight}px`);
  fitHeight();
  // a phone held upright gets a "turn it sideways" screen (the director: "it should be sideways for phone. no need
  // for upright. fullscreen phone tilted")
  const turn = h('div', 'turnme');
  turn.innerHTML = '<div class="turnme-in"><div class="turnme-ph" aria-hidden="true"><i></i></div><p class="turnme-t">Turn your phone sideways</p><p class="turnme-s">The world is wide. So is this game.</p></div>';
  turn.hidden = true;
  ui.appendChild(turn);
  const upright = () => {
    const up = matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth;
    root.classList.toggle('upright', up);
    turn.hidden = !up;
  };
  upright();

  // ---------- the camera ----------
  const setView = () => { try { ctx.camera.setView({ x: 0, y: 0, w: innerWidth, h: innerHeight }); } catch (err) { U.warnOnce('camera.setView', err); } };
  setView();
  const relayout = () => { setView(); fitHeight(); upright(); };
  U.on('resize', relayout);
  addEventListener('orientationchange', () => setTimeout(relayout, 150));
  // the screen's unsafe edges (camera hole, rounded corners, home bar), as the browser reports them
  const probe = h('div', 'safe-probe');
  probe.setAttribute('aria-hidden', 'true');
  ui.appendChild(probe);
  U.safe = () => { const cs = getComputedStyle(probe); return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; };
  // the width the side sheet takes (screen.css --sheet) and so where the free map's middle is
  U.sheetW = () => { const W = innerWidth; return W >= 1200 && innerHeight >= 700 ? 420 : Math.max(276, Math.min(380, W * 0.38)); };
  // where on screen a thing being opened should come to rest: the middle of the map the sheet leaves free
  U.restAt = (sheet = true) => {
    const W = innerWidth, H = innerHeight;
    const r = sheet ? U.sheetW() + 24 : 0;
    return { x: (W - r) / 2, y: H / 2 };
  };
  // Nothing teleports: the camera travels to (x, z) in a fixed 400 ms, eased (instant under reduced motion), so the
  // thing comes to rest at `at` (screen px; the free map's middle by default); then `then` runs. A thing already
  // near its resting place opens at once. The view never moves when something closes.
  U.glide = (x, z, o = {}) => {
    const C = ctx.camera;
    const then = typeof o === 'function' ? o : o.then;
    if (!C || !Number.isFinite(x) || !Number.isFinite(z)) { then?.(); return false; }
    const at = o.at ?? U.restAt(o.sheet !== false);
    const ppm = Math.max(C.ppm, o.ppm ?? 5);
    const y = Number.isFinite(o.y) ? o.y : (ctx.vox?.standY?.(Math.floor(x), Math.floor(z)) ?? C.target.y);
    const s = C.toScreen(x, y, z);
    if (!s.behind && Math.hypot(s.x - at.x, s.y - at.y) < 48 && ppm === C.ppm) { then?.(); return false; }
    // the target that puts (x, y, z) at `at`: the point minus the screen offset turned into ground metres (a point
    // above the target's height shows higher up the screen, by more the lower the tilt)
    const ox = (at.x - innerWidth / 2) / ppm, oy = (at.y - innerHeight / 2) / ppm;
    const f = C.fwd(), r = C.right(), sp = C.sinP?.() ?? Math.sin(C.pitch);
    const along = (oy + (y - C.target.y) * Math.cos(C.pitch)) / sp;
    const tx = x - r.x * ox + f.x * along, tz = z - r.z * ox + f.z * along;
    const from = { x: C.target.x, y: C.target.y, z: C.target.z, ppm: C.ppm, yaw: C.yaw, pitch: C.pitch };
    const dur = reduce() ? 0 : GLIDE_S;
    C.anim = { from, to: { ...from, x: tx, z: tz, ppm }, t: 0, dur };
    if (!dur) { C.anim.t = 1; C.tick?.(0); }
    if (then) setTimeout(then, dur * 1000 + 20);
    return true;
  };

  // ---------- the parts ----------
  U.s2 = makeS2(U);
  makeTips(U);
  U.time = makeTime(U);
  U.slot = makeSlot(U);
  U.doors = makeDoors(U);
  U.feed = makeFeed(U);
  U.power = makePower(U);
  U.inspect = makeInspect(U);
  U.select = (e) => U.inspect.select(e);
  U.cursor = makeCursor(U);
  U.menu = makeMenu(U);
  U.screens = makeScreens(U);
  U.registry = makeRegistry(U);
  await U.registry.load(PANELS);

  // ---------- the pointer, and the edge pan near the HUD ----------
  const canvas = ctx.dom.canvas;
  addEventListener('pointermove', (ev) => {
    const p = U.pointer;
    p.x = ev.clientX; p.y = ev.clientY;
    p.overCanvas = ev.target === canvas;
    p.overHud = !!ev.target?.closest?.('.hud .isl, .scrim');
  }, { capture: true, passive: true });
  addEventListener('pointerout', (ev) => { if (!ev.relatedTarget) { U.pointer.overCanvas = false; U.pointer.overHud = false; } });
  // a mouse click on a HUD button gives focus back to the world, so Space and the keys keep working
  root.addEventListener('pointerup', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const b = ev.target.closest?.('button');
    if (b && !b.closest('.menu')) setTimeout(() => { if (document.activeElement === b) b.blur(); }, 0);
  });
  let rects = [];
  function measureIslands() {
    rects = [];
    for (const e of root.querySelectorAll('.isl')) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0.05) rects.push(r);
    }
  }
  function edgeGuard() {
    const K = ctx.controls;
    if (!K) return;
    let ok = !!U.settings.edgePan && !matchMedia('(pointer: coarse)').matches;
    const p = U.pointer, e = 10, pad = 56;
    if (ok && p.overHud) ok = false;
    if (ok && (p.x < e || p.y < e || p.x > innerWidth - e || p.y > innerHeight - e)) {
      for (const r of rects) if (p.x > r.left - pad && p.x < r.right + pad && p.y > r.top - pad && p.y < r.bottom + pad) { ok = false; break; }
    }
    if (K.edgePan !== ok) K.edgePan = ok;
  }

  // ---------- keys (the god owns the tool keys; it runs first and marks what it used) ----------
  const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  let hidden = false;
  function setHiddenHud(v) {
    hidden = v;
    root.classList.toggle('hud-hidden', hidden);
    if (hidden) setTimeout(() => U.hint?.('Interface hidden. Ctrl+H brings it back.', 3000), 0);
  }
  // Esc, a short right click: close the newest thing open (the sheet, then the door's row)
  function closeOne() {
    if (U.startWarn?.open) { U.startWarn.close(); return true; }
    if (U.slot.open && U.slot.shown !== 'trade') { U.closeSlot?.(); return true; }
    if (U.doors.cur) { U.doors.open(null); return true; }
    return false;
  }
  U.closeOne = closeOne;
  addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || typing()) return;
    const k = ev.code || ev.key;
    if (U.menu.isOpen) {
      if (k === 'Escape') { ev.preventDefault(); U.menu.close(); }
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && k === 'KeyH') { ev.preventDefault(); setHiddenHud(!hidden); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === '?') { ev.preventDefault(); U.menu.open('controls'); return; }
    if (ev.repeat && k !== 'Minus' && k !== 'Equal') return;
    const run = ctx.clock.phase === 'running';
    if (k === 'Space' && run) { ev.preventDefault(); U.time.togglePause(); }
    else if (k === 'Minus' || k === 'NumpadSubtract') { ev.preventDefault(); U.time.step(-1); }
    else if (k === 'Equal' || k === 'NumpadAdd') { ev.preventDefault(); U.time.step(1); }
    else if (k === 'KeyK' && run) { ev.preventDefault(); U.time.toggleSlow(); }
    else if (k === 'KeyL' && run) { ev.preventDefault(); U.feed.toggleLog(); }
    else if (k === 'KeyO' && U.world2 && run) { ev.preventDefault(); U.world2.toggle('people'); }
    else if (k === 'KeyJ' && U.world2 && run) { ev.preventDefault(); U.world2.toggle('discoveries'); }
    else if (k === 'KeyF' && U.inspect.selected) { ev.preventDefault(); U.inspect.toggleFollow(); }
    else if (k === 'Escape') { ev.preventDefault(); if (!closeOne()) U.menu.open(); }
  });
  U.on('rightclick', (p) => { if (p?.handled) return; if (closeOne() && p) p.handled = true; });

  // ---------- the frame ----------
  let acc = 0, mAcc = 0;
  const run = (fn, dt, i) => { try { fn(dt); } catch (err) { U.warnOnce(`frame ${i}`, err); } };
  function update(dt) {
    dt = Math.min(0.25, Number(dt) || 0);
    U.frame.forEach((fn, i) => run(fn, dt, i));
    acc += dt; mAcc += dt;
    if (acc >= 0.25) { const d = acc; acc = 0; U.slow.forEach((fn, i) => run(fn, d, `slow ${i}`)); }
    if (mAcc >= 0.25) { mAcc = 0; measureIslands(); }
    edgeGuard();
  }
  U.slow.forEach((fn, i) => run(fn, 0, `slow ${i}`));

  return {
    update,
    glide: U.glide,
    select: U.select,
    hint: (t, ms) => U.hint(t, ms),
    toast: (severity, text, x, z) => U.feed.push({ severity, text, x, z }),
    addIsland(el) { el.classList.add('isl'); root.appendChild(el); return el; },
    register: (def) => U.registry.add(def),
    settings: U.settings,
    dev: U,
  };
}
