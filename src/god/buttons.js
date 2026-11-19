// The small round buttons the god's hand puts on the map beside a ghost: the tick (apply), the cross (drop) and,
// for the cave, the turn. One look and one set of words for every Reshape tool (director, 2026-11-14, point 31:
// "they can select the tick mark to actually make the change"). Each is 44 px, works with a finger or a mouse,
// and the row is kept whole on the screen, inside the safe area, off the interface's panels, off the ghost itself
// and away from where the finger was, so the hand that drew is not over it.
import { signSvg } from '../ui/signs.js';
// the director's chosen signs (ui/signs.js): the tick (Apply), the cross (Close, also Drop), Turn
const ICON = { turn: signSvg('turn', 28), ok: signSvg('apply', 28), no: signSvg('close', 28) };
// the words, the same for every tool (a tooltip on a mouse, the name a screen reader says)
export const WORDS = { ok: 'Apply the change (Enter)', no: 'Drop the change (Esc)', turn: 'Turn it a quarter turn (R)' };
const LOOK = { turn: ['#EFE2C4', '#2A2118'], ok: ['#E5AE3C', '#2A2118'], no: ['#EFE2C4', '#5A3824'] };
const SIZE = 44, GAP = 8;

// kinds: which buttons, in order ('turn', 'ok', 'no'); on: { kind: fn }; name: a class for tests ('pending', 'cave')
export function makeButtons(kinds, on, name, words = {}) {
  let ui = null;
  const rw = SIZE * kinds.length + GAP * (kinds.length - 1), rh = SIZE;
  function make() {
    const row = document.createElement('div');
    row.className = `god-ghost-ctl god-ghost-${name}${name === 'cave' ? ' cave-ghost-ctl' : ''}`;
    Object.assign(row.style, { position: 'fixed', left: '0', top: '0', display: 'none', gap: `${GAP}px`, zIndex: '105', pointerEvents: 'auto' });
    const btns = {};
    for (const k of kinds) {
      const b = document.createElement('button');
      const label = words[k] ?? WORDS[k];
      b.type = 'button'; b.dataset.ghost = k; if (name === 'cave') b.dataset.cave = k;
      b.title = label; b.setAttribute('aria-label', label);
      b.innerHTML = ICON[k];
      Object.assign(b.style, { width: `${SIZE}px`, height: `${SIZE}px`, minWidth: `${SIZE}px`, padding: '0', display: 'grid', placeItems: 'center', borderRadius: '50%',
        border: '2px solid #8C5A3C', background: LOOK[k][0], color: LOOK[k][1], cursor: 'pointer', touchAction: 'manipulation', boxShadow: '0 2px 0 rgba(42,33,24,0.25), 0 6px 14px rgba(42,33,24,0.22)' });
      // a press here is never the world's (no stroke, no pan, no second ghost)
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); on[k]?.(); });
      row.appendChild(b);
      btns[k] = b;
    }
    document.body.appendChild(row);
    // the screen's unsafe edges (camera hole, rounded corners), as the browser reports them
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
    return { row, probe, btns, at: '' };
  }
  const R = {};
  R.hide = () => { if (ui && ui.row.style.display !== 'none') ui.row.style.display = 'none'; };
  R.shown = () => !!ui && ui.row.style.display !== 'none';
  R.el = () => ui?.row ?? null;
  // ghost: the ghost's box on the screen { x0, y0, x1, y1 }; finger: { x, y } where the hand was (or null)
  R.place = (ghost, finger = null) => {
    if (!ui) ui = make();
    // a sheet over the whole screen (the menu, Settings): the row steps out, so it never sits on the sheet's buttons
    if (document.querySelector('.scrim.on')) { R.hide(); ui.key = ''; return ui.box ?? { x: 0, y: 0, w: rw, h: rh }; }
    const cs = getComputedStyle(ui.probe);
    const sl = parseFloat(cs.paddingLeft) || 0, sr = parseFloat(cs.paddingRight) || 0, st = parseFloat(cs.paddingTop) || 0, sb = parseFloat(cs.paddingBottom) || 0;
    const W = innerWidth, Hh = innerHeight, gap = 12, pad = 12;
    const fit = (x, y) => [Math.max(sl + pad, Math.min(W - sr - pad - rw, x)), Math.max(st + pad, Math.min(Hh - sb - pad - rh, y))];
    const { x0: gx0, y0: gy0, x1: gx1, y1: gy1 } = ghost;
    const mx = (gx0 + gx1) / 2, my = (gy0 + gy1) / 2;
    // under, over, right of, left of the ghost (in that order of preference), then its corners, each kept whole on
    // the screen; the first that covers nothing wins, else the one that covers least
    const cands = [[mx - rw / 2, gy1 + gap], [mx - rw / 2, gy0 - gap - rh], [gx1 + gap, my - rh / 2], [gx0 - gap - rw, my - rh / 2],
      [gx1 + gap, gy1 + gap], [gx0 - gap - rw, gy1 + gap], [gx1 + gap, gy0 - gap - rh], [gx0 - gap - rw, gy0 - gap - rh]].map(([x, y]) => fit(x, y));
    // the same answer while nothing moved (the ghost, the finger): looked again at most ten times a second
    const key = `${Math.round(gx0 / 4)},${Math.round(gy0 / 4)},${Math.round(gx1 / 4)},${Math.round(gy1 / 4)},${finger ? `${Math.round(finger.x)},${Math.round(finger.y)}` : ''},${W},${Hh},${document.querySelector('.hud .hchip.on') ? 'hint' : ''}`;
    const now = performance.now();
    if (ui.key === key || (ui.at && now - ui.t < 100 && ui.key.endsWith('hint') === key.endsWith('hint'))) { if (ui.row.style.display !== 'flex') ui.row.style.display = 'flex'; return ui.box; }
    ui.key = key; ui.t = now;
    const huds = hudRects();
    const over = (x, y, r) => Math.max(0, Math.min(x + rw, r.right) - Math.max(x, r.left)) * Math.max(0, Math.min(y + rh, r.bottom) - Math.max(y, r.top));
    // whatever interface is on top there (any element that takes a finger, not the world's canvas): sampled
    const canvas = document.querySelector('canvas');
    ui.row.style.pointerEvents = 'none';
    const blocked = (x, y) => {
      let n = 0;
      for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.2, 0.8]) { const e = document.elementFromPoint(x + rw * fx, y + rh * fy); if (e && e !== canvas && e !== document.body && e !== document.documentElement) n++; }
      return n * (rw * rh / 6);
    };
    const cover = ([x, y]) => {
      let a = blocked(x, y);
      for (const r of huds) a += over(x, y, r);
      // sitting on the ghost hides what is being placed: half weight
      a += 0.5 * over(x, y, { left: gx0, right: gx1, top: gy0, bottom: gy1 });
      // the finger (and the hand behind it, below and to the side) must not be on the buttons: double weight
      if (finger) a += 2 * over(x, y, { left: finger.x - 56, right: finger.x + 56, top: finger.y - 56, bottom: finger.y + 90 });
      return a;
    };
    let best = cands[0], bc = Infinity;
    for (const c of cands) { const v = cover(c); if (v < bc - 1) { bc = v; best = c; } if (v === 0) break; }
    ui.row.style.pointerEvents = 'auto';
    const at = `translate(${Math.round(best[0])}px, ${Math.round(best[1])}px)`;
    if (ui.row.style.display !== 'flex') ui.row.style.display = 'flex';
    if (ui.at !== at) { ui.at = at; ui.row.style.transform = at; }
    ui.box = { x: Math.round(best[0]), y: Math.round(best[1]), w: rw, h: rh };
    return ui.box;
  };
  return R;
}

// the boxes of the interface that take a finger (looked up at most four times a second), shared by every row
let hudAt = 0, hudCache = [], hudHint = false;
function hudRects() {
  const now = performance.now();
  const hint = !!document.querySelector('.hud .hchip.on');
  if (now - hudAt < 250 && hint === hudHint) return hudCache;
  hudAt = now; hudHint = hint;
  // the hint card takes no finger, but its words must stay readable: it counts while it shows
  hudCache = [...document.querySelectorAll('.hud .isl, .hud .panel, .hud .actbar, .hud .startbtn, .hud .coach, .hud .teach, .hud .procl, [data-hud-block]')]
    .filter((e) => !e.closest('.god-ghost-ctl') && (getComputedStyle(e).pointerEvents !== 'none' || e.matches('.hchip.on')))
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  return hudCache;
}

// the screen box of a box of the world (8 corners through the camera)
export function screenBox(camera, x0, y0, z0, x1, y1, z1) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
    const s = camera.toScreen(x, y, z);
    if (s.x < a) a = s.x; if (s.y < b) b = s.y; if (s.x > c) c = s.x; if (s.y > d) d = s.y;
  }
  return { x0: a, y0: b, x1: c, y1: d };
}
