// Mouse and keys for the camera only, as in the World Planner (the source
// repo's dev/planner/tools.js and planner.js, camera parts only):
//   right drag               pan; a right drag that STARTS steeply up or down
//                            tilts instead, for the whole of that drag (up looks
//                            further across, down looks more straight down;
//                            it stays where it is left)
//   middle drag              pan, always
//   Alt or Ctrl + middle drag  turn freely (snaps to a quarter on release)
//   wheel                    zoom toward the cursor
//   Q / E                    turn a quarter left / right
//   Page Up / Page Down      held: tilt toward straight down / toward level
//   T                        plan view (straight down), or back to the tilt it left
//   W A S D, arrow keys      pan
//   Home                     show the whole world
//   mouse at the screen edge pan (K.edgePan, on by default)
// The LEFT button is never used here: it belongs to the god's tools
// (src/god/). A right click that did not drag is announced on the bus as
// 'rightclick' {x, y} so tools can use it (cancel, a menu).
// Keys are ignored while an input, textarea, select or contenteditable has focus.
export function makeControls(C, canvas, bus) {
  const K = { edgePan: true, keys: new Set(), mouse: { x: 0, y: 0, in: false }, down: null, enabled: true };
  const DRAG_PX = 4;
  // a right drag tilts when its first few pixels of travel are at least this many times more up-and-down than
  // sideways (steeper than about 63 degrees from level); anything flatter pans as it always did
  const TILT_STEEP = 2;
  const TILT_PER_PX = 0.4 * Math.PI / 180;   // a mouse drag up or down: 0.4 degrees a pixel (the whole range in 195 px)
  const TILT_KEY = 60 * Math.PI / 180;       // Page Up / Page Down held: 60 degrees a second (the whole range in 1.3 s)

  const typing = () => {
    const a = document.activeElement;
    return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  };

  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('pointerdown', (ev) => {
    if (!K.enabled || (ev.button !== 1 && ev.button !== 2)) return;
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* a synthetic event (tests) */ }
    K.down = { btn: ev.button, x: ev.clientX, y: ev.clientY, moved: false, rotate: ev.button === 1 && (ev.altKey || ev.ctrlKey), tilt: false };
  });
  canvas.addEventListener('pointermove', (ev) => {
    const dx = ev.clientX - K.mouse.x, dy = ev.clientY - K.mouse.y;
    K.mouse.x = ev.clientX; K.mouse.y = ev.clientY; K.mouse.in = true;
    const d = K.down;
    if (!d) return;
    if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > DRAG_PX) {
      d.moved = true;
      // decided once, from the first few pixels, and kept for the whole drag
      const ax = Math.abs(ev.clientX - d.x), ay = Math.abs(ev.clientY - d.y);
      d.tilt = d.btn === 2 && ay >= TILT_STEEP * ax;
      if (d.tilt) { C.anim = null; C.tiltBy((ev.clientY - d.y) * TILT_PER_PX); canvas.style.cursor = 'ns-resize'; return; }
    }
    if (!d.moved) return;
    C.anim = null;
    if (d.tilt) { if (dy) C.tiltBy(dy * TILT_PER_PX); return; }
    if (d.rotate) { C.yaw -= dx * 0.008; C.clamp(); C.update(); } else C.panPx(dx, dy);
    canvas.style.cursor = 'grabbing';
  });
  const up = (ev) => {
    const d = K.down;
    if (!d || ev.button !== d.btn) return;
    K.down = null;
    canvas.style.cursor = '';
    if (d.rotate) C.snapYaw();
    if (d.btn === 2 && !d.moved) bus.emit('rightclick', { x: ev.clientX, y: ev.clientY });
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { K.down = null; canvas.style.cursor = ''; });
  canvas.addEventListener('pointerleave', () => { K.mouse.in = false; });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (!K.enabled) return;
    const f = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0016));
    C.anim = null;
    C.zoomAt(ev.clientX, ev.clientY, f);
  }, { passive: false });

  const HELD = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'PageUp', 'PageDown']);
  addEventListener('keydown', (ev) => {
    if (!K.enabled || typing() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.code;
    if (k.startsWith('Arrow') || HELD.has(k)) { K.keys.add(k); ev.preventDefault(); return; }
    if (ev.repeat) return;
    if (k === 'KeyQ') C.turn(-1);
    else if (k === 'KeyE') C.turn(1);
    else if (k === 'KeyT') { C.setMode(C.mode === 'plan' ? 'tilt' : 'plan'); bus.emit('camera-mode', { mode: C.mode }); }
    else if (k === 'Home') K.frameAll();
    else return;
    ev.preventDefault();
  });
  addEventListener('keyup', (ev) => { K.keys.delete(ev.code); });
  addEventListener('blur', () => { K.keys.clear(); K.mouse.in = false; });

  K.frameAll = () => {
    const { x0, z0, x1, z1 } = C.bounds();
    C.frame(x0, z0, x1, z1);
  };

  // per frame: held keys and the screen edge pan (and tilt) the view
  K.tick = (dt) => {
    if (!K.enabled) return;
    let px = 0, py = 0;
    const k = K.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) py += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) py -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) px += 1;
    if (k.has('KeyD') || k.has('ArrowRight')) px -= 1;
    if (K.edgePan && K.mouse.in && !K.down && document.hasFocus()) {
      const v = C.view, m = K.mouse, e = 10;
      if (m.x < v.x + e) px += 1; else if (m.x > v.x + v.w - e) px -= 1;
      if (m.y < v.y + e) py += 1; else if (m.y > v.y + v.h - e) py -= 1;
    }
    if (px || py) { C.anim = null; const sp = 640 * dt; C.panPx(px * sp, py * sp); }
    // Page Up tilts toward straight down, Page Down toward level
    const tilt = (k.has('PageUp') ? 1 : 0) - (k.has('PageDown') ? 1 : 0);
    if (tilt) C.tiltBy(tilt * TILT_KEY * Math.min(0.1, dt));
  };
  return K;
}
