// The Cave tool (its own entry, key Y, since Land kept three modes; the director, 2026-11-13: "to do that, we need to raise land first and then
// make a cave so people can stay"). Point at a hillside: the simulation plans the mouth and the chamber
// (sim/caves.js 'cavePlan'), facing down the slope, snapped to the best face; the preview draws them through
// the hill (gold), or what is wrong (red: the columns that are too low, with a tick up to the height they
// need) and the card and chip say why in words. A click writes the blocks through the recorded writer (one
// undo step in creation), tells the simulation, then, while the clock runs, the one witness call and
// god:act (kind 'cave': faith.js gives each close eyewitness +50). Ctrl+click a cave closes it: the hill is
// put back as it was, those inside get out first (kind 'cave-close').
// Facing (the director, 2026-11-14: "while creating cave, we should be able to turn it to whatever direction"):
// the first click or tap leaves the ghost where it is, with three buttons beside it: turn (the mouth steps a
// quarter turn clockwise: north, east, south, west of the land), carve, cancel. On a keyboard R turns, Enter
// carves, Esc cancels, and a second click on the ghost carves. R also turns the ghost that follows the pointer.
// The default facing is still toward the nearest water (or down the slope). A facing that cannot be carved says
// why and the ghost stays. One undo step for the whole cave, as before.
import { B } from '../world/blocks.js';
import { inXZ } from '../edit/vox.js';
import { makeButtons, screenBox } from './buttons.js';

// Round 4 (the director: "eight clicks on a raised hill all said Raise the land first"): one click. When the spot
// does not fit, the tool raises a small rocky mound itself, just behind the pointer, and carves the cave into it,
// its mouth at the pointer facing the nearest water; the mound shows as a gold ghost before the click.
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const FACE = ['south', 'east', 'north', 'west'];
const CLOCKWISE = (di) => (di + 3) % 4;   // north, east, south, west, north (as seen from above, north up)
const MOUND_FOR = new Set(['low', 'roof', 'thin']);   // what a mound mends (not water, a home in the way, the edge)
const TRUNKS = new Set([B.WOOD, B.WOOD_BIRCH]);

export function makeCave(H, D) {
  const { ctx } = H;
  const { core, vox, clock, events, overlay, camera } = ctx;
  const lines = D.lines(64), tag = D.tag();
  // di: the facing the player chose (null: the default); pin: where the first click left the ghost
  const C = { plan: null, cave: null, mound: null, key: '', t: 0, ctrl: false, shown: false, forecast: null, di: null, pin: null, touch: false };
  const W = ctx.world;
  // the mound for a cave whose mouth is at (cx, cz): which way it faces (the nearest water; else down the slope),
  // the columns to raise and to what height, and its box for the ghost
  // want: the facing the player chose (0..3), or null for the default
  function moundFor(cx, cz, room, why, want = null) {
    if (!MOUND_FOR.has(why)) return null;
    const T = H.simCall('tune', 'caves') ?? {};
    const R0 = (T.ROOMS ?? [])[Math.round(room)] ?? { w: 6, d: 5 };
    const need = (T.HIGH ?? 3) + (T.CEIL ?? 2);
    if (H.L.waterTop(cx, cz) >= 0) return null;
    // the nearest water, in rings out to 64
    let di = want ?? -1;
    for (let r = 4; r <= 64 && di < 0; r += 3) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
        if (!inXZ(x, z) || H.L.waterTop(x, z) < 0) continue;
        const vx = x - cx, vz = z - cz;
        di = [0, 1, 2, 3].reduce((b, d) => (DIRS[d][0] * vx + DIRS[d][1] * vz > DIRS[b][0] * vx + DIRS[b][1] * vz ? d : b), 0);
        break;
      }
    }
    if (di < 0) { // no water near: face down the slope
      let gx = 0, gz = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const hh = vox.groundTop(cx + dx, cz + dz); gx += dx * hh; gz += dz * hh; }
      di = [0, 1, 2, 3].reduce((b, d) => (DIRS[d][0] * gx + DIRS[d][1] * gz < DIRS[b][0] * gx + DIRS[b][1] * gz ? d : b), 0);
    }
    const [dx, dz] = DIRS[di], ux = -dx, uz = -dz, lx = -uz, lz = ux;
    const at = (k, j) => [cx + ux * k + lx * j, cz + uz * k + lz * j];
    const F = vox.groundTop(cx, cz);
    const j0 = -(R0.w / 2) - 1, j1 = R0.w / 2 + 2, k1 = R0.d + 5;
    const cols = [];
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let k = 1; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const [x, z] = at(k, j);
      if (!inXZ(x, z)) return null;
      const rim = (k === k1 ? 1 : 0) + (j === j0 || j === j1 ? 1 : 0);
      const nt = F + need + 1 - (rim === 2 ? 4 : rim === 1 ? 2 : 0);
      if (vox.groundTop(x, z) >= nt) continue;
      cols.push([x, z, nt]);
      x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z);
    }
    if (!cols.length) return null;
    const [fx, fz] = at(1, 0);
    return { di, face: FACE[di], F, cols, box: { x0, z0, x1, z1, y0: F + 1, y1: F + need + 1 }, front: { x: fx + 0.5, z: fz + 0.5 }, x: (x0 + x1 + 1) / 2, z: (z0 + z1 + 1) / 2, r: Math.hypot(x1 - x0 + 1, z1 - z0 + 1) / 2 };
  }
  const ask = (name, ...a) => H.simCall('ask', name, ...a);
  const room = () => H.opts.cave?.room ?? 1;
  addEventListener('keydown', (e) => { if (e.key === 'Control') { C.ctrl = true; C.key = ''; } });
  addEventListener('keyup', (e) => { if (e.key === 'Control') { C.ctrl = false; C.key = ''; } });
  addEventListener('blur', () => { C.ctrl = false; });
  ctx.dom.canvas.addEventListener('pointermove', (e) => { if (C.ctrl !== e.ctrlKey) { C.ctrl = e.ctrlKey; C.key = ''; } });
  events.on('edit', () => { C.key = ''; });

  // ---------- the preview ----------
  const GOLD = 0xffd27a, RED = 0xff6b5a, DIM = 0xc9a24a;
  function box(x0, z0, x1, z1, y0, y1, c) {
    const X = [x0, x1 + 1], Z = [z0, z1 + 1];
    for (const y of [y0, y1]) { lines.seg([X[0], y, Z[0]], [X[1], y, Z[0]], c); lines.seg([X[1], y, Z[0]], [X[1], y, Z[1]], c); lines.seg([X[1], y, Z[1]], [X[0], y, Z[1]], c); lines.seg([X[0], y, Z[1]], [X[0], y, Z[0]], c); }
    for (const x of X) for (const z of Z) lines.seg([x, y0, z], [x, y1, z], c);
  }
  // an arrow on the ground out of the mouth: which way the cave will face
  function arrow(x, z, di, c) {
    const [dx, dz] = DIRS[di], y = vox.standY(Math.floor(x), Math.floor(z)) + 0.2;
    const ex = x + dx * 4, ez = z + dz * 4, lx = -dz, lz = dx;
    lines.seg([x, y, z], [ex, y, ez], c);
    lines.seg([ex, y, ez], [ex - dx * 1.4 + lx * 1.1, y, ez - dz * 1.4 + lz * 1.1], c);
    lines.seg([ex, y, ez], [ex - dx * 1.4 - lx * 1.1, y, ez - dz * 1.4 - lz * 1.1], c);
  }
  const turnWord = () => (C.touch ? '' : ' (R turns it)');
  function draw() {
    lines.begin();
    tag.hide();
    const p = C.plan, cave = C.cave, m = C.mound;
    if (cave) {
      const b = cave.box;
      box(b.x0, b.z0, b.x1, b.z1, cave.F + 1, cave.cutY, RED);
      tag.show(cave.x, cave.cutY + 2, cave.z, 'Close this cave');
    } else if (m) {
      // the mound the click will raise, in gold, and the mouth at its front
      const b = m.box;
      box(b.x0, b.z0, b.x1, b.z1, b.y0, b.y1, GOLD);
      const fx = Math.floor(m.front.x), fz = Math.floor(m.front.z);
      box(fx, fz, fx, fz, m.F + 1, m.F + 4, GOLD);
      arrow(m.front.x, m.front.z, m.di, GOLD);
      tag.show(m.x, b.y1 + 2, m.z, `A rocky mound, the cave facing ${m.face}${turnWord()}`);
    } else if (p && p.rects?.length) {
      const c = p.ok ? GOLD : RED;
      for (const r of p.rects) {
        if (r.kind === 'apron') box(r.x0, r.z0, r.x1, r.z1, r.y0 + 0.05, r.y0 + 0.05, p.ok ? DIM : c);
        else box(r.x0, r.z0, r.x1, r.z1, r.y0, r.y1, c);
      }
      const ap = p.rects.find((r) => r.kind === 'apron');
      if (ap && p.dir != null) arrow((ap.x0 + ap.x1 + 1) / 2, (ap.z0 + ap.z1 + 1) / 2, p.dir, c);
      // what is wrong, column by column: a tick from the ground up to the height it needs
      for (const [x, z, have, need, why] of (p.bad ?? []).slice(0, 160)) {
        if (why === 'roof' || why === 'thin') { lines.seg([x + 0.5, have + 1, z + 0.5], [x + 0.5, need + 1, z + 0.5], RED); lines.seg([x + 0.2, need + 1, z + 0.5], [x + 0.8, need + 1, z + 0.5], RED); }
        else box(x, z, x, z, vox.standY(x, z) + 0.05, vox.standY(x, z) + 0.05, RED);
      }
      const ch = p.rects.find((r) => r.kind === 'chamber');
      if (ch) tag.show((ch.x0 + ch.x1 + 1) / 2, (p.F ?? 15) + 7, (ch.z0 + ch.z1 + 1) / 2, p.ok ? `Cave, facing ${p.face}${turnWord()}` : `Not here, facing ${p.face ?? 'this way'}`);
    }
    lines.end();
    place();
  }
  // which way the ghost faces now (0..3), whatever chose it
  const facing = () => (C.mound ? C.mound.di : C.plan?.dir ?? null);
  // the card: the same one the powers use (ui/power.js), with what carving or closing does
  function emitAim(g) {
    const p = C.plan, cave = C.cave, m = C.mound;
    if (!p && !cave) { if (C.shown) events.emit('god:aim', null); C.shown = false; C.forecast = null; return; }
    const how = C.pin
      ? (C.touch ? 'Turn it with the turn button, then the tick carves it (or tap the ghost again); the cross drops it.' : 'Turn it with the turn button or R. The tick or Enter carves it (or click the ghost again); the cross or Esc drops it.')
      : (C.touch ? 'Tap where the mouth should be; then you can turn it before it is carved.' : 'Click where the mouth should be; then you can turn it before it is carved (R turns it now too).');
    const undo = clock.phase === 'creation' ? ' Ctrl+Z takes it back.' : '';
    if (m && !cave) {
      const n = room();
      const t = { kind: 'area', x: m.x, z: m.z, r: m.r };
      const f = { ok: true, gains: [`A small rocky mound rises here, and a cave is carved into it facing ${m.face}${n > 1 ? `, room for ${n} households` : ''}: a home in the hill.`], costs: ['The ground behind the mouth is raised by about six blocks.'], seenBy: 0, who: clock.phase === 'running' ? 'Whoever is near sees the hill rise.' : '' };
      C.forecast = f;
      events.emit('god:aim', { power: 'cave', target: t, aim: t, entity: null, targetKind: 'area', confirm: 'click', holdMs: 0, forecast: f, title: `Raise a mound and carve a cave facing ${m.face}`, sub: `${how}${undo}`, icon: 'land' });
      C.shown = true;
      return;
    }
    const f = ask('caveForecast', p, cave ? 'close' : 'carve', cave) ?? null;
    C.forecast = f;
    const x = cave?.x ?? p?.x ?? g?.x, z = cave?.z ?? p?.z ?? g?.z, r = cave?.spec?.r ?? p?.r ?? 4;
    const t = { kind: 'area', x, z, r };
    const n = room();
    const title = cave ? `Close the cave: ${cave.name}` : p.ok ? `Carve a cave facing ${p.face}${n > 1 ? `, room for ${n} households` : ''}` : `Cave facing ${p.face ?? 'this way'}: not here`;
    const sub = cave ? 'Click to close it. The hill is put back as it was.'
      : p.ok ? `${how}${undo}` : `${p.text}${C.pin ? ' Turn it, or put it somewhere else.' : ''}`;
    events.emit('god:aim', { power: 'cave', target: t, aim: t, entity: cave ?? null, targetKind: 'area', confirm: 'click', holdMs: 0, forecast: f, title, sub, icon: 'land' });
    C.shown = true;
  }
  // the plan at (x, z) with the chosen facing; a mound where the hill is missing
  function compute(x, z, cx, cz) {
    C.plan = ask('cavePlan', x, z, room(), C.di) ?? null;
    C.mound = C.plan && !C.plan.ok ? moundFor(cx, cz, room(), C.plan.reason, C.di) : null;
  }
  function refresh(dt, force) {
    if (C.pin) {
      const P = C.pin;
      C.t -= dt;
      const key = `pin,${P.x},${P.z},${room()},${C.di},${clock.phase}`;
      if (!force && key === C.key && (C.t > 0 || clock.phase !== 'running')) { place(); return; }
      C.key = key; C.t = 0.5;
      C.cave = null;
      compute(P.x, P.z, P.cx, P.cz);
      draw();
      emitAim(P);
      return;
    }
    const g = H.I.g;
    if (!g || g.off) { if (C.plan || C.cave) { C.plan = null; C.cave = null; draw(); emitAim(g); } return; }
    C.t -= dt;
    const key = `${g.cx},${g.cz},${room()},${C.ctrl},${clock.phase},${C.di}`;
    if (!force && key === C.key && (C.t > 0 || clock.phase !== 'running')) return;
    C.key = key; C.t = 0.5;
    C.cave = C.ctrl ? ask('caveAt', g.x, g.z) ?? null : null;
    if (C.cave) { C.plan = null; C.mound = null; } else compute(g.x, g.z, g.cx, g.cz);
    draw();
    emitAim(g);
  }
  C.off = () => {
    C.pin = null; C.tapCarve = false; C.before = undefined;
    hideButtons();
    if (!C.shown && !C.plan && !C.cave) return;
    lines.clear(); tag.hide();
    if (C.shown) events.emit('god:aim', null);
    C.shown = false; C.plan = null; C.cave = null; C.mound = null; C.key = '';
  };
  C.update = (dt) => {
    if (H.tool !== 'cave') { C.off(); C.di = null; return; }
    if (!C.pin && !H.I.over) { C.off(); return; }
    refresh(dt, !C.shown && !C.plan);
  };
  C.ring = () => {
    overlay.brush(null);
    const g = C.pin ?? H.I.g;
    if (!g || g.off) { H.cursor = null; return; }
    const p = C.plan;
    H.cursor = { x: g.x, z: g.z, top: vox.groundTop(g.cx, g.cz), size: 0, tool: 'cave', seenBy: Number(C.forecast?.seenBy) || 0,
      reason: C.cave || C.mound ? null : p && !p.ok ? p.reason : null };
  };

  // ---------- the three buttons beside the ghost: turn, the tick (carve), the cross (drop) ----------
  // the same buttons, words and keys as every Reshape preview (buttons.js): Enter is the tick, Esc the cross
  const btns = makeButtons(['turn', 'ok', 'no'], { turn: () => C.turn(), ok: () => C.confirm(), no: () => C.cancel() }, 'cave');
  function hideButtons() { btns.hide(); }
  // beside the ghost: under it if there is room, else above it, else at its side; always whole on the screen
  function place() {
    if (!C.pin || C.cave) { hideButtons(); return; }
    let b = null;
    const add = (r, y0, y1) => { const s = screenBox(camera, r.x0, y0, r.z0, r.x1 + 1, y1, r.z1 + 1); b = b ? { x0: Math.min(b.x0, s.x0), y0: Math.min(b.y0, s.y0), x1: Math.max(b.x1, s.x1), y1: Math.max(b.y1, s.y1) } : s; };
    const m = C.mound, p = C.plan;
    if (m) add(m.box, m.box.y0, m.box.y1);
    else if (p?.rects?.length) for (const r of p.rects) add(r, r.y0, r.y1);
    else { const y = vox.standY(C.pin.cx, C.pin.cz); add({ x0: C.pin.cx - 1, z0: C.pin.cz - 1, x1: C.pin.cx + 1, z1: C.pin.cz + 1 }, y, y + 2); }
    const I = H.I;
    btns.place(b, I?.lastTouch && performance.now() - I.lastTouch.t < 60000 ? I.lastTouch : null);
  }

  // ---------- turning, carving, cancelling ----------
  C.turn = () => {
    if (H.tool !== 'cave') return false;
    const now = facing();
    C.di = CLOCKWISE(now ?? 2);
    C.key = '';
    refresh(0, true);
    events.emit('sfx:play', { name: 'ui.click' });
    return FACE[C.di];
  };
  C.cancel = () => { if (!C.pin) return false; C.pin = null; C.tapCarve = false; hideButtons(); C.key = ''; refresh(0, true); if (!H.I.over) C.off(); return true; };
  // carve the ghost where it stands; if it cannot be carved, say why and keep it
  C.confirm = () => {
    if (!C.pin) return null;
    C.tapCarve = false;
    if (!H.sim()) { H.refuse('no-sim', C.pin.x, C.pin.z); return null; }
    C.key = ''; refresh(0, true);   // the land may have changed since the ghost was drawn
    const p = C.plan, m = C.mound;
    let r = null;
    if (p?.ok) r = carve(p);
    else if (m) r = moundAndCarve(m);
    else { H.refuse(`cave-${p?.reason ?? 'none'}`, C.pin.x, C.pin.z, p?.text ?? 'No cave fits here.'); return p ?? null; }
    if (r && r.ok !== false) { C.pin = null; C.di = null; hideButtons(); C.key = ''; }
    return r;
  };
  // is the ground point g on the ghost (a second click there carves)?
  function onGhost(g) {
    const m = C.mound, p = C.plan, k = 1;
    const inside = (b) => g.x >= b.x0 - k && g.x <= b.x1 + 1 + k && g.z >= b.z0 - k && g.z <= b.z1 + 1 + k;
    if (m) return inside(m.box) || Math.hypot(g.x - m.front.x, g.z - m.front.z) < 2.5;
    if (p?.rects?.length) return p.rects.some(inside);
    return Math.hypot(g.x - C.pin.x, g.z - C.pin.z) < 3;
  }

  // ---------- carving and closing ----------
  function carve(p) {
    core.begin('Carve a cave');
    for (const [x, y, z] of p.trees ?? []) H.L.trees.remove(x, y, z);
    for (const [x, y, z, id] of p.cells) vox.set(x, y, z, id);
    const cmd = core.end();
    if (!cmd) return null;
    const cave = ask('caveCarved', p) ?? null;
    const seen = H.act('cave', p.x, p.z, p.r, { target: cave, targetKind: 'building' });
    if (cave) { cave.seenBy = seen; if (cave.spec) cave.spec.seenBy = seen; }
    C.key = '';
    events.emit('sfx:play', { name: 'god.cave' });
    return cave ?? { carved: true };
  }
  function close(cave) {
    const cp = ask('caveClosePlan', cave);
    if (!cp?.ok) { H.refuse('cave-none', cave.x, cave.z, 'That cave cannot be closed.'); return null; }
    ask('caveClosing', cave);
    core.begin('Close a cave');
    for (const [x, y, z, id] of cp.cells) vox.set(x, y, z, id);
    core.end();
    H.act('cave-close', cp.x, cp.z, cp.r);
    C.key = '';
    return true;
  }
  // a press with the Cave tool: Ctrl closes a cave; on the ghost left by the first press it carves (a finger as it
  // lifts, so a pinch that starts there carves nothing); anywhere else it leaves the ghost there
  C.down = (g, ev) => {
    if (!H.sim()) { H.refuse('no-sim', g.x, g.z); return null; }
    if (ev?.ctrlKey) {
      const cave = ask('caveAt', g.x, g.z);
      if (!cave) { H.refuse('cave-none', g.x, g.z, 'No cave here to close. Ctrl+click a cave you carved.'); return null; }
      return close(cave);
    }
    C.touch = ev?.pointerType === 'touch';
    C.before = { pin: C.pin };
    if (C.pin && onGhost(g)) {
      if (C.touch) { C.tapCarve = true; return { carving: true }; }
      return C.confirm();
    }
    C.pin = { x: g.x, z: g.z, cx: g.cx ?? Math.floor(g.x), cz: g.cz ?? Math.floor(g.z) };
    C.key = '';
    refresh(0, true);
    return { placed: true, facing: FACE[facing()] ?? null };
  };
  C.up = () => { if (C.tapCarve) { C.tapCarve = false; C.before = undefined; C.confirm(); } };
  // a second finger came down: the first was the start of a pinch, so the ghost goes back to where it was
  C.untouch = () => {
    C.tapCarve = false;
    if (C.before === undefined) return false;
    C.pin = C.before.pin; C.before = undefined; C.key = '';
    if (!C.pin) hideButtons();
    return true;
  };
  // the mound and the cave in one step (one undo in creation): raise, plan at the mound's front facing the mound's
  // way, carve; if the plan still fails (a home or water under it), everything goes back and the reason is said
  function moundAndCarve(m) {
    core.begin('Raise a mound and carve a cave');
    for (const [x, z, nt] of m.cols) {
      const y = vox.groundTop(x, z) + 1;
      if (TRUNKS.has(W.get(x, y, z))) H.L.trees.remove(x, y, z);
      H.L.setGround(x, z, nt, B.ROCK);
      // under the rock cap, stone (a cave's walls stay rock, not crumbling earth)
      for (let yy = m.F + 1; yy < nt; yy++) if (W.get(x, yy, z) === B.DIRT) vox.set(x, yy, z, B.STONE);
    }
    const p = ask('cavePlan', m.front.x, m.front.z, room(), m.di);
    if (!p?.ok) { core.cancel(); H.refuse(`cave-${p?.reason ?? 'none'}`, m.front.x, m.front.z, `${p?.text ?? 'No cave fits here, even with a mound.'}${C.pin ? ' Turn it, or put it somewhere else.' : ''}`); return { ok: false, text: p?.text }; }
    for (const [x, y, z] of p.trees ?? []) H.L.trees.remove(x, y, z);
    for (const [x, y, z, id] of p.cells) vox.set(x, y, z, id);
    const cmd = core.end();
    if (!cmd) return null;
    const cave = ask('caveCarved', p) ?? null;
    const seen = H.act('cave', p.x, p.z, p.r, { target: cave, targetKind: 'building' });
    if (cave) { cave.seenBy = seen; if (cave.spec) cave.spec.seenBy = seen; }
    C.key = '';
    events.emit('sfx:play', { name: 'god.cave' });
    return cave ?? { carved: true };
  }
  // scripted (tests, the tutorial): carve at (x, z) with this room (and o.face: 'north', 'east', 'south' or
  // 'west'), or close the cave there
  C.at = (x, z, n = room(), o = {}) => {
    if (o.close) { const cave = ask('caveAt', x, z); return cave ? close(cave) : null; }
    const di = o.face ? FACE.indexOf(o.face) : -1;
    const want = di >= 0 ? di : null;
    const p = ask('cavePlan', x, z, n, want);
    if (!p?.ok) { const m = p && !o.noMound ? moundFor(Math.floor(x), Math.floor(z), n, p.reason, want) : null; return m ? moundAndCarve(m) : p; }
    return carve(p);
  };
  // what the ghost is doing (tests, the HUD)
  C.state = () => ({ pinned: !!C.pin, at: C.pin ? { x: C.pin.x, z: C.pin.z } : null, facing: FACE[facing()] ?? null, chosen: C.di != null, ok: !!(C.plan?.ok || C.mound), reason: C.plan && !C.plan.ok && !C.mound ? C.plan.reason : null, mound: !!C.mound });
  return C;
}
