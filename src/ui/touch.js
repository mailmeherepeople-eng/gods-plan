// Fingers on the world (the director, 2026-11-13: "my goal is for this to be played super easy on the phone as
// well"; 2026-11-14: "pinch zoom should be zoom ... if a player actually wants to rotate, they should be able to
// rotate to whatever angle they want. but it should only happen when they try to rotate"). Only touch pointers;
// a mouse and a pen are left exactly as they were (view/controls.js):
//   one finger, nothing in hand     drag: move the view; tap: select (inspect.js already does it on a short tap)
//   one finger, a tool in hand      the tool, as the left mouse button (brush strokes, hills, river points...);
//                                   a power: the first tap aims and shows the price, a second tap acts (god/aim.js)
//   two fingers                     one recogniser (below, numbers in docs/TOUCH.md) decides: pinch = zoom,
//                                   twist = turn to any angle (the world turns with the fingers and stays there),
//                                   both moving together = pan; both dragged up or down together, side by side =
//                                   tilt (up looks further across, down looks more straight down; it stays). A tilt
//                                   is decided in the first few pixels and then owns the touch: no zoom, turn or pan
//                                   joins it, and a touch that began as a zoom, turn or pan never tilts.
//                                   A stroke the first finger had begun is taken back
//   a long press, nothing in hand   x-ray: a hut or cave under the finger is selected, and a selected one stays
//                                   see-through (xray.js)
//   the compass                     top right, only while the view is turned; a tap turns it back to north up
//   the tilt control                beside the compass, only while the tilt is not the usual one; a tap tilts it back.
//                                   The player's tilt is kept in the settings and is there again next time.
// Everything here listens on the window in the capture phase, before the world's own listeners, and stops only
// the events it uses itself.
import { signSvg, oldAsSign } from './signs.js';
import { tip } from './dom.js';

// ---------- the recogniser's numbers (docs/TOUCH.md says where each comes from) ----------
const ZOOM_LOG2 = 0.1;                      // zoom starts at a change of 0.1 in log2 of the finger spacing (about 7%)
const ZOOM_JOIN_LOG2 = Math.log2(1.15);     // after a twist was recognised, zoom joins only past a 15% change
const TURN = 12 * Math.PI / 180;            // a twist starts at 12 degrees, counted from the start of the touch
const TURN_JOIN = 25 * Math.PI / 180;       // after a zoom was recognised, a twist joins only past 25 degrees ...
// ... and only if it clearly dominates: the arc the fingers travelled round their middle is longer than the
// change in their spacing since the touch began
const PAN_PX = 6;                           // the middle of the two fingers moves this far before the view pans ...
const PAN_WAIT_PX = 24;                     // ... except a move mostly up or down, which may still be a tilt: it waits
                                            // for the tilt to be decided, and pans only past this if no tilt came
const TILT_PX = 8;                          // a tilt starts when BOTH fingers have moved 8 px up (or both down), each
                                            // more up-and-down than sideways, and that shared move is larger than the
                                            // change in their spacing and the arc they turned (Mapbox GL starts its
                                            // two-finger pitch on the first such move)
const TILT_PER_PX = 0.5 * Math.PI / 180;    // half a degree a pixel, as Mapbox GL: the whole range (78 degrees) in 156 px
const MIN_SPACING = 24;                    // fingers closer than this give no reliable angle or ratio
const MAX_PPM = 80;                         // as the wheel's zoom (view/camera.js)

const wrap = (a) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);

// ---------- the two-finger tilt, shared with the battleground's own two-finger handling (ui/battle.js) ----------
export const TILT_TOUCH = { PX: TILT_PX, PER_PX: TILT_PER_PX, PAN_PX, PAN_WAIT_PX, ZOOM_LOG2, MIN_SPACING };
// is this a tilt? a = the first finger's move since the touch began, b = the second's; spanChange = how much their
// spacing changed; arc = how far they turned round their middle (px). Both fingers the same way up or down, each at
// least TILT_PX and each more up-and-down than sideways, and that shared move larger than the pinch and the twist
export function tiltStarts(ax, ay, bx, by, spanChange, arc) {
  const shared = Math.min(Math.abs(ay), Math.abs(by));
  return Math.sign(ay) === Math.sign(by) && shared >= TILT_PX && Math.abs(ay) > Math.abs(ax) && Math.abs(by) > Math.abs(bx)
    && shared > Math.abs(spanChange) && shared > Math.abs(arc);
}
// the tilt follows the fingers' shared move up or down (my px since the touch began) from s.pitch0, within the
// camera's range; the ground s.ground that was under the screen point s.m0 stays under it
export function tiltView(C, s, my) {
  const want = s.pitch0 + my * TILT_PER_PX;
  const { min, max } = C.pitchRange(), got = Math.max(min, Math.min(max, want));
  C.pitch = got;
  if (got !== want) s.pitch0 = got - my * TILT_PER_PX;   // at a limit: moving back answers at once
  if (C.ppm < C.minPpm()) C.ppm = C.minPpm();
  C.update();
  if (s.ground) {
    const p = C.onPlane(s.m0.x, s.m0.y, s.ground.y);
    if (p) { C.target.x += s.ground.x - p.x; C.target.z += s.ground.z - p.z; }
  }
  C.clamp(); C.update();
}

export default [{
  type: 'panel', id: 'touch', region: 'root', order: 1,
  make(U) {
    const { ctx } = U;
    const canvas = ctx.dom.canvas;
    const stub = document.createElement('span');
    stub.hidden = true;
    if (!('PointerEvent' in window)) return stub;
    const C = ctx.camera;
    const pts = new Map();       // pointerId -> { x, y, x0, y0, t0 }, in the order the fingers came down
    let mode = 'idle';           // idle | one | pan | multi
    let G = null;                // the two-finger gesture (see begin)
    U.touchy = matchMedia('(pointer: coarse)').matches;
    U.touchGesture = () => (G ? { zoom: G.zoom, turn: G.turn, pan: G.pan, tilt: G.tilt, turnedDeg: G.acc * 180 / Math.PI } : null);
    // the last two-finger touch, for checks from the console (game.modules.ui ... U.lastGesture)
    U.lastGesture = null;
    const armed = () => !!U.get('god', 'tool');
    const stop = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
    // the first two fingers down are the gesture's; a third is ignored
    const pairIds = () => [...pts.keys()].slice(0, 2);
    const measure = (ids) => {
      const a = pts.get(ids[0]), b = pts.get(ids[1]);
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
    };

    // a new pair of fingers (the first two, or a finger put back, or a third taking over a lifted one): every
    // baseline is taken from the camera as it is now, so nothing jumps; what was recognised stays until all lift
    function begin(keep) {
      const ids = pairIds(), n = measure(ids);
      const ground = C.onPlane(n.cx, n.cy);
      const a = pts.get(ids[0]), b = pts.get(ids[1]);
      G = {
        key: ids.join(','), ids,
        d0: Math.max(MIN_SPACING, n.d), aLast: n.ang, acc: 0,    // the spacing at the start, the angle turned so far
        m0: { x: n.cx, y: n.cy }, ground,                         // the ground under the middle of the fingers
        yaw0: C.yaw, ppm0: C.ppm, zBase: 1, tBase: 0,
        sA: { x: a.x, y: a.y }, sB: { x: b.x, y: b.y },           // where each finger was at the start (the tilt)
        pitch0: C.pitch,
        // a tilt is two fingers side by side (more across than up and down from each other, as Mapbox GL asks):
        // fingers one above the other moving apart are a pinch
        side: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y),
        zoom: keep?.zoom ?? false, turn: keep?.turn ?? false, pan: keep?.pan ?? false, tilt: keep?.tilt ?? false,
      };
      C.anim = null;
    }
    // the tilt owns the touch: the fingers' shared move up or down tilts the view from where it was, and the ground
    // under the point where the fingers came down stays under that point
    const tiltMove = (my) => tiltView(C, G, my);
    function move() {
      const n = measure(G.ids);
      if (n.d >= MIN_SPACING) { G.acc += wrap(n.ang - G.aLast); G.aLast = n.ang; }
      const ratio = Math.max(MIN_SPACING, n.d) / G.d0, lr = Math.log2(ratio);
      // each finger's move since the start
      const A = pts.get(G.ids[0]), B = pts.get(G.ids[1]);
      const ax = A.x - G.sA.x, ay = A.y - G.sA.y, bx = B.x - G.sB.x, by = B.y - G.sB.y;
      // ---- the tilt is looked at first, and only while nothing else has been recognised ----
      const mayTilt = !G.tilt && G.side && !G.zoom && !G.turn && !G.pan;
      if (mayTilt && tiltStarts(ax, ay, bx, by, n.d - G.d0, G.acc * n.d / 2)) G.tilt = true;
      if (G.tilt) { tiltMove((ay + by) / 2); return; }
      // ---- recognise (a twist is looked at first, so a clean twist wins over the small spacing change it has) ----
      if (!G.turn) {
        const a = Math.abs(G.acc);
        if (!G.zoom ? a >= TURN : a >= TURN_JOIN && a * n.d / 2 > Math.abs(n.d - G.d0)) {
          G.turn = true;
          G.tBase = G.zoom ? G.acc : 0;   // the first gesture follows the fingers from the start; a joiner from now
        }
      }
      if (!G.zoom && Math.abs(lr) >= (G.turn ? ZOOM_JOIN_LOG2 : ZOOM_LOG2)) {
        G.zoom = true;
        G.zBase = G.turn ? ratio : 1;
      }
      if (!G.pan) {
        // a move mostly up or down may still become a tilt: it waits, and pans only if no tilt came by PAN_WAIT_PX
        const dx = n.cx - G.m0.x, dy = n.cy - G.m0.y, dd = Math.hypot(dx, dy);
        const couldTilt = G.side && !G.zoom && !G.turn;
        if (dd >= PAN_PX && (!couldTilt || Math.abs(dx) >= Math.abs(dy) || dd >= PAN_WAIT_PX)) G.pan = true;
      }
      // ---- apply: turn and zoom from the start of the touch, then put the ground back under the fingers ----
      // fingers turning clockwise on screen (the angle grows, y is down) turn the world clockwise: yaw grows
      C.yaw = G.yaw0 + (G.turn ? G.acc - G.tBase : 0);
      if (G.zoom) {
        const want = G.ppm0 * ratio / G.zBase;
        const lo = C.minPpm(), got = Math.max(lo, Math.min(MAX_PPM, want));
        C.ppm = got;
        if (got !== want) G.ppm0 = got * G.zBase / ratio; // at a limit: turning back answers at once
      }
      C.update();
      const m = G.pan ? { x: n.cx, y: n.cy } : G.m0;
      if (G.ground) {
        const p = C.onPlane(m.x, m.y, G.ground.y);
        if (p) { C.target.x += G.ground.x - p.x; C.target.z += G.ground.z - p.z; }
      }
      C.clamp(); C.update();
    }

    addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'touch') return;
      U.touchy = true;
      if (ev.target !== canvas) return;   // a finger that starts on a button or a panel is never the camera's
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, t0: performance.now() });
      if (pts.size === 1 && mode !== 'multi') { mode = 'one'; return; }       // let the world have it (a tool, a select)
      // a second finger: the camera's, and whatever the first began is undone
      if (mode !== 'multi') { U.call('god', 'cancelStroke'); mode = 'multi'; G = null; }
      if (pts.size >= 2 && (!G || G.key !== pairIds().join(','))) begin(G);
      stop(ev);
    }, { capture: true, passive: false });

    addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'touch' || !pts.has(ev.pointerId)) return;
      const p = pts.get(ev.pointerId);
      const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      p.x = ev.clientX; p.y = ev.clientY;
      if (mode === 'multi') {
        if (pts.size >= 2 && G && G.ids.includes(ev.pointerId)) move();
        stop(ev);
        return;
      }
      // one finger with nothing in hand: past a small slop it moves the view
      if (!armed() && (mode === 'one' || mode === 'pan')) {
        if (mode === 'one' && Math.hypot(ev.clientX - p.x0, ev.clientY - p.y0) > 10) { mode = 'pan'; C.anim = null; }
        if (mode === 'pan') { C.panPx(dx, dy); stop(ev); }
      }
    }, { capture: true, passive: false });

    const end = (ev) => {
      if (ev.pointerType !== 'touch' || !pts.has(ev.pointerId)) return;
      const p = pts.get(ev.pointerId);
      pts.delete(ev.pointerId);
      if (mode === 'multi') {
        stop(ev);
        if (pts.size === 0) {                                             // everything resets when all fingers lift
          if (G) {
            U.lastGesture = { zoom: G.zoom, turn: G.turn, pan: G.pan, tilt: G.tilt, turnedDeg: G.acc * 180 / Math.PI };
            if (G.tilt) C.tilted?.();                                     // the player's tilt: kept in the settings
          }
          mode = 'idle'; G = null;
        }
        else if (pts.size >= 2 && G && G.key !== pairIds().join(',')) begin(G);   // a third finger takes over
        else if (G) G.key = '';   // one left: the next finger down starts a fresh pair (even if it reuses an id)
        // one finger left: it does nothing until a second comes back (then the gesture goes on from where it is)
        return;
      }
      if (mode === 'pan') { stop(ev); mode = pts.size ? mode : 'idle'; return; }
      // a long press with nothing in hand: select what is there (a hut or cave stays see-through while selected)
      if (!armed() && ev.type === 'pointerup' && performance.now() - p.t0 > 550 && Math.hypot(ev.clientX - p.x0, ev.clientY - p.y0) < 10) {
        let e = null;
        try { e = ctx.pick?.entity?.(ev.clientX, ev.clientY) ?? null; } catch { e = null; }
        if (e && e.cat === 'building') { stop(ev); U.select?.(e); }
      }
      if (!pts.size) mode = 'idle';
    };
    addEventListener('pointerup', end, { capture: true, passive: false });
    addEventListener('pointercancel', end, { capture: true, passive: false });
    // no browser gestures over the game: no page zoom, no pull to refresh, no text picked up by a long press
    document.addEventListener('gesturestart', (ev) => ev.preventDefault());
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    return stub;
  },
}, {
  // the way back to north up after a twist: a compass in the top right row, at its left end, only while the view is
  // turned (its needle points to north); a tap turns the view back
  type: 'panel', id: 'compass', region: 'topbar', order: 2,
  make(U) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn round compass';
    b.hidden = true;
    b.setAttribute('aria-label', 'Turn the view back to north up');
    b.innerHTML = signSvg('compass', 28);   // the director's chosen sign; it turns with the view, so its needle points north
    b.addEventListener('click', () => U.ctx.camera.northUp?.());
    return b;
  },
  frame(U, dt, el) {
    if (el.parentNode && el.parentNode.firstChild !== el) el.parentNode.prepend(el);
    const t = U.ctx.camera.turned?.() ?? 0;
    const show = Math.abs(t) > 0.5 * Math.PI / 180 && !U.titleOn;
    if (el.hidden === show) el.hidden = !show;
    if (show) {
      const deg = Math.round(t * 1800 / Math.PI) / 10;
      if (el._deg !== deg) { el._deg = deg; el.firstChild.style.transform = `rotate(${deg}deg)`; }
    }
  },
}, {
  // the way back to the usual tilt, beside the compass: shown only while the tilt is not the usual one, a tap tilts
  // the view back (0.35 s). It also keeps the player's tilt: restored here at the start, saved when the player
  // changes it (view/camera.js C.onTilt), so the view comes back tilted the same way next time.
  type: 'panel', id: 'tilt', region: 'topbar', order: 3,
  make(U) {
    const C = U.ctx.camera;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn round tiltb';
    b.hidden = true;
    if (!C?.pitchRange) return b;
    const DEG = Math.PI / 180;
    const saved = Number(U.settings.tilt);
    if (U.settings.tilt != null && Number.isFinite(saved)) C.setPitch(saved * DEG, 0, true);
    let t = 0;
    C.onTilt = (p) => {
      clearTimeout(t);
      t = setTimeout(() => { U.settings.tilt = Math.round(p / DEG * 10) / 10; U.saveSettings(); }, 250);
    };
    // the sign: the line of sight coming down to the ground at a slant, pressed in like the other bare signs
    b.innerHTML = `<svg class="ic sg sg-tilt" width="28" height="28" viewBox="-1 -1 26 26" aria-hidden="true" focusable="false">${oldAsSign('<path d="M3 19.5h18"/><path d="M5 6.5 15.5 17"/><path d="M15.5 17v-5M15.5 17h-5"/><path d="M8.5 19.5a5 5 0 0 0-1.3-3.4"/>')}</svg>`;
    tip(b, 'Usual tilt', 'Tilt the view back to the usual angle. Two fingers up or down tilt it (on a PC: right drag up or down, or Page Up and Page Down).');
    b.setAttribute('aria-label', 'Tilt the view back to the usual angle');
    b.addEventListener('click', () => C.resetTilt());
    return b;
  },
  frame(U, dt, el) {
    const C = U.ctx.camera;
    if (!C?.pitchRange) return;
    // beside the compass (which keeps itself first in the row), else first in the row
    const row = el.parentNode;
    if (row) {
      const cmp = row.querySelector(':scope > .compass');
      if (cmp ? cmp.nextSibling !== el : row.firstChild !== el) { if (cmp) cmp.after(el); else row.prepend(el); }
    }
    const at = C.anim?.to?.pitch ?? C.pitch;
    const show = Math.abs(at - C.pitchRange().usual) > Math.PI / 180 && !U.titleOn && !U.walk?.on;
    if (el.hidden === show) el.hidden = !show;
  },
}];
