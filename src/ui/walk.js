// Walking among the people: the screen (the director, 2026-11-15; rebuilt the same day to work like the ground view
// of his other game, "The Ones Who Came Before": "same movement controls ... i want jump to be there. move leave
// from there and add leave at the top right in a small button"). The body, the camera, the sky and the travel are
// view/walk.js; this file is how it is entered and left and what the screen does while walking:
//   entering   "Walk here" on the card of anything selected (inspect.js asks U.walk.enterAt), "Walk among them" in
//              the Menu (menu.js asks U.walk.enterStone): only once time runs, never in a battle
//   the screen nearly empty: the time box, the tokens with Leave, the Log and the Menu at the top right, the stick at
//              the bottom left, Jump at the bottom right. Everything else (the doors, the map's markers and rings,
//              the lesson strip) goes by one attribute, data-walk="1" on #ui and <html> (walk.css), as a battle does
//   phone      the stick at the bottom left walks (it stays where it is, as in the other game); a drag anywhere else
//              looks round, and the camera swings back behind the way you walk a moment after; two fingers pinch
//              the camera nearer or further (in past the closest is through the eyes); Jump jumps; a tap (no drag)
//              on someone opens their card
//   PC         W A S D or the arrow keys walk, Space jumps, the wheel moves the camera nearer or further; the first
//              click on the world hands it the mouse (Esc gives it back), or hold a button and drag to look; a click
//              on someone opens their card; Esc or Leave leaves
//   names      a person near and in sight has their name over their head
// The numbers marked "reference" are the other game's (engine/input.js). Nobody sees the god walk and nothing in the
// simulation changes: this only reads the people (their place, name, look).
import { h, icon, esc, markSvg } from './dom.js';
import { makeWalker, WALK } from '../view/walk.js';

const JOY_R = 59;            // the stick's ring, px (reference: 118 px across); the thumb at the ring is a full walk
const JOY_GRAB = 24;         // px round the ring a thumb may land and still take the stick
const JOY_DEAD = 0.16;       // each direction under this share of the ring is nothing (reference)
const JOY_TRAVEL = 34;       // px the knob follows the thumb (reference)
const TAP_PX = 12, TAP_MS = 350; // a touch that moved less than this (summed, reference), this quickly, is a tap
const LOOK_TOUCH_X = 0.0052, LOOK_TOUCH_Y = 0.0048; // radians a pixel a finger drags the view round (reference)
const LOOK_DRAG_X = 0.0032, LOOK_DRAG_Y = 0.003;    // ... the mouse with a button held (reference)
const LOOK_LOCK_X = 0.0024, LOOK_LOCK_Y = 0.0022;   // ... the mouse once it is handed to the view (reference)
const PINCH_PX = 24;         // px two fingers spread or close for one step of the camera (reference)
const NAME_R = 14;           // metres: a name shows over a person this near and in sight
const NAME_GREAT_R = 24;     // ... a great person (or one of a blessed line) from further off
const NAME_MAX = 5;          // at most this many names at once (the nearest)
const PICK_R = 900;          // metres squared: a tap reaches people this near of the camera (30 m)

export default [{
  type: 'panel', id: 'walk', region: 'root', order: 90,
  make(U) {
    const { ctx } = U;
    ctx.addStyle(new URL('./walk.css', import.meta.url));
    const W = makeWalker(ctx);
    const canvas = ctx.dom.canvas;
    // (the queries are made once: asking matchMedia afresh every frame showed in the profile)
    const mqReduce = matchMedia('(prefers-reduced-motion: reduce)'), mqCoarse = matchMedia('(pointer: coarse)');
    const reduce = () => mqReduce.matches || !!U.settings?.reduceMotion;
    const touchy = () => mqCoarse.matches || !!U.touchy;
    W.reduce = reduce;

    // ---------- the parts ----------
    // Leave: a small button in the top right row, beside the Log and the Menu (still a 44 px target)
    const leaveB = h('button', 'isl btn walk-leave', `${icon('close', 18)}<span>Leave</span>`);
    leaveB.type = 'button';
    leaveB.setAttribute('aria-label', 'Leave walking and go back up');
    leaveB.hidden = true;
    leaveB.addEventListener('click', () => leave());
    U.topbar.insertBefore(leaveB, U.topbar.querySelector('.logb') ?? null);
    // Jump: a round button under the right thumb (reference: the word, with a small arrow over it)
    const jumpB = h('button', 'isl btn walk-jump', `${icon('up', 18)}<span>Jump</span>`);
    jumpB.type = 'button';
    jumpB.setAttribute('aria-label', 'Jump');
    jumpB.hidden = true;
    // at once on the press, not on the release (a jump that waits for the finger to lift is late)
    jumpB.addEventListener('pointerdown', (ev) => { ev.preventDefault(); W.jump(); jumpB.classList.add('down'); });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) jumpB.addEventListener(t, () => jumpB.classList.remove('down'));
    jumpB.addEventListener('click', (ev) => { if (ev.detail === 0) W.jump(); }); // a keyboard press on the button
    jumpB.addEventListener('contextmenu', (ev) => ev.preventDefault());
    // the layer on the world: the stick and the names (never takes the pointer)
    const layer = h('div', 'walk-layer');
    layer.setAttribute('aria-hidden', 'true');
    layer.hidden = true;
    ctx.dom.ui.insertBefore(layer, ctx.dom.ui.firstChild?.nextSibling ?? null);
    const joy = h('div', 'walk-joy', '<i class="walk-nub"></i>');
    const nub = joy.firstChild;
    const dot = h('div', 'walk-dot');
    layer.append(joy, dot);
    dot.hidden = true;
    const names = [];

    // ---------- can we, and going in ----------
    const ask = (q) => U.call('sim', 'ask', q);
    const battle = () => !!ask('battleStage') || ctx.homeLand?.visible === false;
    function can() {
      return ctx.clock.phase === 'running' && !U.titleOn && !battle() && W.mode === 'off';
    }
    let prevEnabled = true;
    function begin(spot, yaw, pitch, face) {
      if (!can() || !spot) return false;
      U.menu?.isOpen && U.menu.close();
      U.inspect?.select(null);
      U.closeSlot?.();
      if (U.doors?.cur) U.doors.open(null);
      if (U.get('god', 'tool')) U.call('god', 'setTool', null);
      prevEnabled = ctx.controls.enabled;
      ctx.controls.enabled = false;
      ctx.controls.keys?.clear?.();
      U.pointer.overCanvas = false;
      W.follow = touchy(); // the camera follows behind you on a touch screen; on a computer the mouse is the camera
      if (!W.enter(spot, yaw, pitch, face)) { ctx.controls.enabled = prevEnabled; return false; }
      setOn(true);
      U.sfx('ui.open');
      setTimeout(() => U.hint?.(touchy() ? 'The stick walks, drag to look, Jump jumps. Pinch to bring the camera in. Tap someone to read them.'
        : 'W A S D walk, Space jumps, the wheel brings the camera in. Click to hand the view the mouse; Esc gives it back.', 5000), reduce() ? 300 : WALK.TRAVEL_S * 1000);
      return true;
    }
    const faceYaw = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
    const facePitch = (fx, fy, fz, tx, ty, tz) => Math.max(-0.2, Math.min(0.3, Math.atan2(ty - fy, Math.hypot(tx - fx, tz - fz))));
    // beside whatever is selected, facing it (a person: in front of them, so their face is seen)
    function enterAt(e) {
      if (!e || !can()) return false;
      let tx = e.x, tz = e.z, ty = Number.isFinite(e.y) ? e.y : ctx.vox.standY(Math.floor(e.x), Math.floor(e.z));
      let o = { min: 2.2, max: 12 }, lookY = ty + 1.2;
      if (e.kind === 'person' || e.cat === 'person') {
        const ry = e.ry ?? 0;
        // far enough that their head and body are in view
        o = { min: e.stage === 'child' ? 2.6 : 3.2, max: 10, prefer: { x: Math.sin(ry), z: Math.cos(ry) }, see: ty + 1.5, ty };
        lookY = ty + (e.stage === 'child' ? 0.8 : 1.2);
      } else if (e.cat === 'animal' || e.kind === 'animal') {
        o = { min: 3, max: 12, see: ty + 0.6, ty }; lookY = ty + 0.6;
      } else if (e.kind === 'stone') {
        const c = e.centre ?? { x: e.x, z: e.z };
        tx = c.x; tz = c.z; o = { min: 9, max: 16, ty, see: ty + 3 }; lookY = ty + 2.4;
      } else if (e.door && (e.cat === 'building' || e.kind === 'hut' || e.kind === 'cave')) {
        // a home: in front of its door, looking at it
        const cx = e.centre?.x ?? e.cx ?? e.x, cz = e.centre?.z ?? e.cz ?? e.z;
        let ox = e.door.x - cx, oz = e.door.z - cz;
        const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
        tx = e.door.x; tz = e.door.z; o = { min: 2.5, max: 12, prefer: { x: ox, z: oz }, ty, see: ty + 1 }; lookY = ty + 1;
      } else if (e.kind === 'thing') {
        const t = e.thing ?? {};
        if (t.kind === 'tree') { o = { min: 2.5, max: 12, ty }; lookY = ty + 2.5; }
        else if (t.kind === 'water') { o = { min: 0, max: 24 }; lookY = ty; }
        else o = { min: 1, max: 12, ty };
      }
      const spot = W.findSpot(tx, tz, o);
      if (!spot) { U.hint?.('There is nowhere to stand there.', 3000); return false; }
      // someone who walks on during the travel down stays in front of the camera
      const moves = e.kind === 'person' || e.cat === 'animal' || e.kind === 'animal';
      const dy = lookY - ty;
      const face = moves ? () => (e.hidden || e.dead || !Number.isFinite(e.x) ? null : { x: e.x, y: (e.y ?? ty) + dy, z: e.z }) : null;
      return begin(spot, faceYaw(spot.x, spot.z, tx, tz), facePitch(spot.x, spot.y + WALK.EYE, spot.z, tx, lookY, tz), face);
    }
    // by the standing stone (the Menu's "Walk among them")
    function enterStone() {
      const st = U.get('sim', 'stone');
      if (st) return enterAt(st);
      const b = ctx.camera.bounds(), x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
      const spot = W.findSpot(x, z, { min: 4, max: 20 });
      return spot ? begin(spot, 0, 0) : false;
    }
    function leave(o = {}) {
      if (W.mode === 'off') return;
      if (document.pointerLockElement) { try { document.exitPointerLock(); } catch { /* not locked */ } }
      releaseAll();
      leaveB.hidden = true; jumpB.hidden = true; joy.hidden = true;
      if (W.leave(o)) U.sfx('ui.close');
    }
    W.onDone = (m) => { if (m === 'off') setOn(false); else if (m === 'on') { leaveB.hidden = false; paintControls(); } };

    // the screen while walking: one attribute hides the home interface (walk.css)
    let on = false;
    function setOn(v) {
      on = v;
      U.walking = v;
      const ui = ctx.dom.ui;
      if (v) { ui.dataset.walk = '1'; document.documentElement.dataset.walk = '1'; U.root.dataset.walk = '1'; }
      else { delete ui.dataset.walk; delete document.documentElement.dataset.walk; delete U.root.dataset.walk; }
      layer.hidden = !v;
      leaveB.hidden = !v;
      if (!v) { ctx.controls.enabled = prevEnabled; for (const n of names) n.el.hidden = true; releaseAll(); }
      paintControls();
    }
    // the stick and Jump: on a touch screen, once the travel down has ended
    function paintControls() {
      const show = on && touchy() && W.mode === 'on';
      joy.hidden = !show; jumpB.hidden = !show;
    }
    U.walk = { can, enterAt, enterStone, leave, pick: (x, y) => pick(x, y), get on() { return on; }, get walker() { return W; } };
    ctx.walk = U.walk; // for checks from the console (game.walk.walker)

    // ---------- the pointer: claimed before anything else while walking (main.js ctx.claimPointer) ----------
    const touches = new Map(); // pointerId -> { role: 'stick' | 'look', x0, y0, x, y, t0, moved, travel }
    let mouse = null;          // a button held: { x0, y0, x, y, t0, moved, button }
    let stickId = null, pinchD = 0;
    function releaseAll() {
      touches.clear(); mouse = null; stickId = null; pinchD = 0;
      W.input.x = W.input.y = 0;
      nub.style.transform = 'translate(-50%, -50%)';
      keys.clear();
    }
    const prevClaim = ctx.claimPointer;
    ctx.claimPointer = (ev) => {
      if (!on) return prevClaim ? prevClaim(ev) : false;
      // a pointer that started on a button or a panel is theirs, and so is everything over the HUD
      const ours = touches.has(ev.pointerId) || (ev.pointerType === 'mouse' && (mouse || document.pointerLockElement === canvas));
      if (!ours && ev.target !== canvas) return false;
      if (W.mode !== 'on') return true; // during the travel the world takes no input
      if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return touchEv(ev);
      return mouseEv(ev);
    };
    // the stick's centre on screen (it moves only when the window does)
    let joyC = null;
    const joyCentre = () => {
      if (!joyC) { const r = joy.getBoundingClientRect(); if (r.width) joyC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
      return joyC;
    };
    addEventListener('resize', () => { joyC = null; });
    const looks = () => [...touches.values()].filter((t) => t.role === 'look');
    function touchEv(ev) {
      const t = touches.get(ev.pointerId);
      if (ev.type === 'pointerdown') {
        const c = !joy.hidden && joyCentre();
        const onStick = c && stickId == null && Math.hypot(ev.clientX - c.x, ev.clientY - c.y) <= JOY_R + JOY_GRAB;
        const n = { role: onStick ? 'stick' : 'look', x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, t0: performance.now(), moved: false, travel: 0 };
        touches.set(ev.pointerId, n);
        if (onStick) { stickId = ev.pointerId; stick(n); }
        else {
          // a second finger off the stick: the two pinch the camera nearer or further (reference: not a look)
          const lk = looks();
          if (lk.length === 2) { pinchD = Math.hypot(lk[0].x - lk[1].x, lk[0].y - lk[1].y); for (const q of lk) q.moved = true; }
        }
        try { canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
        ev.preventDefault();
        return true;
      }
      if (!t) return true;
      if (ev.type === 'pointermove') {
        const dx = ev.clientX - t.x, dy = ev.clientY - t.y;
        t.x = ev.clientX; t.y = ev.clientY;
        t.travel += Math.abs(dx) + Math.abs(dy);
        if (!t.moved && t.travel >= TAP_PX) t.moved = true;
        if (t.role === 'stick') stick(t);
        else {
          const lk = looks();
          if (lk.length >= 2 && pinchD) {
            const d = Math.hypot(lk[0].x - lk[1].x, lk[0].y - lk[1].y), delta = d - pinchD;
            if (Math.abs(delta) > PINCH_PX) { W.zoom(delta > 0 ? -1 : 1); pinchD = d; } // spread brings the camera in
          } else W.look(dx * LOOK_TOUCH_X, dy * LOOK_TOUCH_Y);
        }
        ev.preventDefault();
        return true;
      }
      // up or cancelled
      touches.delete(ev.pointerId);
      if (t.role === 'stick') { stickId = null; W.input.x = W.input.y = 0; nub.style.transform = 'translate(-50%, -50%)'; }
      else if (looks().length < 2) pinchD = 0;
      if (ev.type === 'pointerup' && t.role === 'look' && !t.moved && performance.now() - t.t0 < TAP_MS) tapAt(ev.clientX, ev.clientY);
      return true;
    }
    // the stick: the thumb's offset from the ring's centre, as a share of the ring (reference Input._joyMove)
    function stick(t) {
      const c = joyCentre();
      if (!c) return;
      let dx = (t.x - c.x) / JOY_R, dy = (t.y - c.y) / JOY_R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      W.input.x = Math.abs(dx) < JOY_DEAD ? 0 : dx;
      W.input.y = Math.abs(dy) < JOY_DEAD ? 0 : -dy;
      nub.style.transform = `translate(calc(-50% + ${(dx * JOY_TRAVEL).toFixed(1)}px), calc(-50% + ${(dy * JOY_TRAVEL).toFixed(1)}px))`;
    }
    function mouseEv(ev) {
      const locked = document.pointerLockElement === canvas;
      if (ev.type === 'pointerdown') {
        if (locked) { if (ev.button === 0) tapAt(innerWidth / 2, innerHeight / 2, true); return true; }
        if (ev.button !== 0 && ev.button !== 2) return true;
        mouse = { x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, t0: performance.now(), moved: false, button: ev.button };
        try { canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
        canvas.style.cursor = 'grabbing';
        return true;
      }
      if (ev.type === 'pointermove') {
        if (locked) { W.look((ev.movementX || 0) * LOOK_LOCK_X, (ev.movementY || 0) * LOOK_LOCK_Y); return true; }
        if (!mouse) return true;
        const dx = ev.clientX - mouse.x, dy = ev.clientY - mouse.y;
        mouse.x = ev.clientX; mouse.y = ev.clientY;
        if (!mouse.moved && Math.hypot(mouse.x - mouse.x0, mouse.y - mouse.y0) > 4) mouse.moved = true;
        if (mouse.moved) W.look(dx * LOOK_DRAG_X, dy * LOOK_DRAG_Y);
        return true;
      }
      if (ev.type === 'pointerup' || ev.type === 'pointercancel') {
        const m = mouse; mouse = null;
        canvas.style.cursor = '';
        if (!m || ev.type === 'pointercancel' || m.moved || m.button !== 0) return true;
        // a click: on someone, their card; anywhere else, the view takes the mouse (if the browser allows it)
        if (!tapAt(ev.clientX, ev.clientY)) { try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* not allowed here */ } }
        return true;
      }
      return true;
    }
    let lockAt = 0;
    document.addEventListener('pointerlockchange', () => { lockAt = performance.now(); dot.hidden = document.pointerLockElement !== canvas; });
    // the wheel brings the camera in or takes it back (reference: one notch, one step)
    canvas.addEventListener('wheel', (ev) => {
      if (!on || W.mode !== 'on') return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ev.deltaY) W.zoom(ev.deltaY > 0 ? 1 : -1);
    }, { passive: false, capture: true });
    canvas.addEventListener('contextmenu', (ev) => { if (on) ev.preventDefault(); }); // a right drag looks

    // ---------- a tap on someone ----------
    function pick(px, py) {
      const cam = W.cam.position;
      let best = null, bd = Infinity;
      const list = [...(U.get('sim', 'people') ?? []), ...(U.get('sim', 'animals') ?? [])];
      for (const e of list) {
        if (!e || e.hidden || e.dead || e.removed || !Number.isFinite(e.x)) continue;
        const d2 = (e.x - cam.x) ** 2 + (e.z - cam.z) ** 2;
        if (d2 > PICK_R) continue;
        const person = e.kind === 'person';
        const tall = person ? (e.stage === 'child' ? 1.25 : 2.0) : e.species === 'bird' ? 0.3 : 1.0;
        const y = e.y ?? 16;
        const a = W.toScreen(e.x, y + tall * 0.5, e.z), top = W.toScreen(e.x, y + tall, e.z), foot = W.toScreen(e.x, y, e.z);
        if (a.behind) continue;
        // the figure as a box on screen: its height, and half that across, at least 44 px to tap
        const hgt = Math.abs(foot.y - top.y), wid = Math.max(22, hgt * 0.35);
        const dx = Math.max(0, Math.abs(px - a.x) - wid), dy = Math.max(0, Math.abs(py - a.y) - Math.max(22, hgt / 2));
        const score = Math.hypot(dx, dy);
        if (score > 8) continue;
        // nearer people win a tie; one behind a wall cannot be tapped
        const s = score * 100 + a.depth;
        if (s < bd && W.sees(e.x, y + tall * 0.75, e.z)) { bd = s; best = e; }
      }
      return best;
    }
    function tapAt(px, py, fromLock = false) {
      const e = pick(px, py);
      if (!e) return false;
      if (fromLock && document.pointerLockElement) { try { document.exitPointerLock(); } catch { /* not locked */ } }
      U.inspect?.select(e);
      return true;
    }

    // ---------- keys (taken before the god's and the camera's while walking) ----------
    const keys = new Set();
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    // keys the home screen keeps while walking: the speeds, slow, the Log, the controls sheet (Space jumps here)
    const PASS = new Set(['Minus', 'Equal', 'NumpadAdd', 'NumpadSubtract', 'KeyK', 'KeyL', 'Slash', 'Tab', 'Enter']);
    const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
    addEventListener('keydown', (ev) => {
      if (!on || typing()) return;
      const k = ev.code;
      if (U.menu?.isOpen) return; // the menu has the keys (Esc closes it)
      if (k === 'Escape') {
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (performance.now() - lockAt < 150) return; // that Esc gave the mouse back
        if (document.pointerLockElement) { try { document.exitPointerLock(); } catch { /* not locked */ } return; } // the first Esc gives the mouse back
        if (!U.closeOne?.()) leave();
        return;
      }
      if (k === 'Space') {
        // Space jumps while walking (not pause, not a press of whichever button was clicked last: Enter still
        // presses a button that has the keyboard's focus)
        if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur();
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (!ev.repeat) W.jump();
        return;
      }
      if (MOVE.has(k)) { if (W.mode === 'on') keys.add(k); ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      if (PASS.has(k) || ev.ctrlKey || ev.metaKey) return;
      ev.stopImmediatePropagation(); // no tool or power keys while walking
    }, { capture: true });
    addEventListener('keyup', (ev) => { if ((keys.delete(ev.code) || ev.code === 'Space') && on) ev.stopImmediatePropagation(); }, { capture: true });
    addEventListener('blur', () => keys.clear());
    function keyInput() {
      // the stick wins whenever it is held (reference)
      if (stickId != null) return;
      if (!keys.size) { if (W.mode === 'on') { W.input.x = 0; W.input.y = 0; } return; }
      const has = (...a) => a.some((x) => keys.has(x));
      W.input.x = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
      W.input.y = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
    }

    // ---------- names over heads ----------
    let nameT = 0, nameList = [];
    function chooseNames() {
      const cam = W.cam.position, out = [];
      const me = W.pos;
      for (const p of U.get('sim', 'people') ?? []) {
        if (!p || p.hidden || p.dead || !Number.isFinite(p.x)) continue;
        const great = !!(p.great || p.line?.blessed);
        const r = great ? NAME_GREAT_R : NAME_R;
        // near the body (the camera may be a few metres behind it)
        const d2 = (p.x - me.x) ** 2 + (p.z - me.z) ** 2;
        if (d2 > r * r) continue;
        const tall = p.stage === 'child' ? 1.3 : 2.05;
        const s = W.toScreen(p.x, (p.y ?? 16) + tall, p.z);
        if (s.behind || s.x < -40 || s.x > innerWidth + 40 || s.y < -20 || s.y > innerHeight + 20) continue;
        if (!W.sees(p.x, (p.y ?? 16) + tall * 0.8, p.z)) continue;
        out.push({ p, d2: (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2, near2: d2, great, tall });
      }
      out.sort((a, b) => a.d2 - b.d2);
      nameList = out.slice(0, NAME_MAX);
    }
    function drawNames() {
      while (names.length < NAME_MAX) { const el = h('div', 'walk-name'); el.hidden = true; layer.appendChild(el); names.push({ el, p: null }); }
      const placed = [];
      for (let i = 0; i < NAME_MAX; i++) {
        const slot = names[i], it = nameList[i];
        if (!it || it.p.hidden || it.p.dead) { if (!slot.el.hidden) slot.el.hidden = true; slot.p = null; continue; }
        const p = it.p;
        if (slot.p !== p) {
          slot.p = p;
          const c = U.s2?.clanOf?.(p);
          slot.el.classList.toggle('great', it.great);
          slot.el.style.setProperty('--dye', c?.dye ?? 'transparent');
          slot.el.innerHTML = `${c ? `<i class="wn-sw"></i>${markSvg(c.mark, 14)}` : ''}<span>${esc(p.name ?? '')}</span>${it.great ? icon('great', 16) : ''}`;
          slot.w = 0; slot.h = 0; // measured again once shown (not every frame: a layout read each frame costs)
        }
        const s = W.toScreen(p.x, (p.y ?? 16) + it.tall, p.z);
        if (s.behind) { slot.el.hidden = true; continue; }
        // a name never sits on top of a nearer one: it moves up above it
        let y = s.y;
        if (!slot.w && !slot.el.hidden) { slot.w = slot.el.offsetWidth; slot.h = slot.el.offsetHeight; }
        const wHalf = (slot.w || 90) / 2, hgt = slot.h || 26;
        for (const q of placed) if (Math.abs(q.x - s.x) < q.w + wHalf && Math.abs(q.y - y) < hgt) y = q.y - hgt - 2;
        placed.push({ x: s.x, y, w: wHalf });
        const fadeK = Math.max(0.35, Math.min(1, 1.6 - Math.sqrt(it.near2) / (it.great ? NAME_GREAT_R : NAME_R)));
        slot.el.style.transform = `translate(${s.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        slot.el.style.opacity = fadeK.toFixed(2);
        if (slot.el.hidden) slot.el.hidden = false;
      }
    }

    // ---------- each frame ----------
    let lastBattleCheck = 0;
    return Object.assign(jumpB, {
      _walkFrame(dt) {
        if (!on) return;
        // a battle takes the screen at once: walking ends there and then, without moving the battle's camera
        if ((lastBattleCheck -= dt) <= 0) { lastBattleCheck = 0.2; if (battle()) { leave({ instant: true, keepGodView: true }); setOn(false); return; } }
        // no tools or powers while walking (a card's power button, a token's): put down at once
        if (U.get('god', 'tool')) { U.call('god', 'setTool', null); U.hint?.('Powers wait until you leave walking.', 2500); }
        keyInput();
        W.update(dt);
        if (W.mode === 'on') {
          if ((nameT -= dt) <= 0) { nameT = 0.25; chooseNames(); }
          drawNames();
        } else for (const n of names) if (!n.el.hidden) n.el.hidden = true;
      },
    });
  },
  frame(U, dt, el) { el._walkFrame?.(dt); },
}];
