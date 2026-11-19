// The preview (director, 2026-11-14, point 31: "even while shaping land, it should be see through, the changes
// we are making. Clear but still know that it has not been applied. Then they can select the tick mark to actually
// make the change."). Every Reshape tool but the cave (which has its own ghost) writes into a layer of pending
// blocks laid over the real world, never into the world itself:
//   - P.V is a voxel writer (get, set, groundTop, W.get, W.maxY) that reads the pending block where there is one
//     and the real world elsewhere, and writes only into the pending layer. land.js and trees.js run on it
//     unchanged (P.L), so a second stroke builds on the first (raise, then flatten the top: a plateau).
//   - each stroke, river, lake, animal placed or thing erased is one frame; undo steps frames back (in creation
//     and while time runs), redo puts them back.
//   - the ghost: the change drawn see-through over the world in the real blocks' own colours, a dark line at every
//     block of height, a hole darker the deeper with a pale broken line at every block of depth (see the ghost below);
//     rebuilt at most every 50 ms while drawing.
//   - the tick (Enter) writes it all as one transaction: one undo step in creation, and while time runs the one
//     witness call and god:act for the whole change, at that moment and not before. The cross (Esc) drops it.
//   - a block the simulation changed under a pending one since it was drawn (a hut went up there) is left as the
//     simulation made it.
import { B, isCross, isSolid } from '../world/blocks.js';
import { gkey, ofG, inB, SY, TREE_IDS, STRUCT_IDS } from '../edit/vox.js';
import { makeLand } from './land.js';
import { makeButtons, screenBox } from './buttons.js';
import { TOOL } from './tools.js';
import { INK, trueUnit, twoTone, makeColors, ghostScale } from './pending-look.js';

const NOT_GROUND = new Set([...TREE_IDS, ...STRUCT_IDS, B.BUSH, B.BUSH_BARE, B.WATER, B.CROP]);
const isGround = (id) => id !== B.AIR && !isCross(id) && !NOT_GROUND.has(id) && isSolid(id);
const ck = (x, z) => (x + 4096) + (z + 4096) * 8192;
const emptyBox = () => ({ x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity });
const grow = (b, x, y, z) => { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z; };
const union = (a, b) => { if (b.x0 <= b.x1) { grow(a, b.x0, b.y0, b.z0); grow(a, b.x1, b.y1, b.z1); } return a; };

const ANIMAL_COLOR = { deer: 0xc8945a, rabbit: 0xe6dccb, wolf: 0x8a929c, bird: 0xf2f2f2, minnow: 0xe2ecef, trout: 0xb59a5c, pike: 0x7c9a3c, catfish: 0x4a3e34 };
const KIND_WORD = { raise: 'Raise the land', lower: 'Lower the land', flatten: 'Flatten the land', water: 'Paint water', dry: 'Dry land', river: 'Paint a river', lake: 'Dig a lake', erase: 'Erase', animal: 'Place animals' };

export function makePending(H, D) {
  const { ctx } = H;
  const { core, vox, camera, events, clock, THREE, overlay } = ctx;
  const W = vox.W;
  const NEW = new Map(), ORIG = new Map(), colTop = new Map();
  let maxY = -1, frame = null, dirty = false, lastBuild = 0;
  const frames = [], undone = [];
  const P = { frames };

  // ---------- the pending world ----------
  const get = (x, y, z) => { if (!inB(x, y, z)) return W.get(x, y, z); const v = NEW.get(gkey(x, y, z)); return v === undefined ? W.get(x, y, z) : v; };
  const PW = { get, get maxY() { return Math.max(W.maxY, maxY); } };
  const PV = {
    W: PW, get,
    set(x, y, z, id) {
      if (!frame || !inB(x, y, z)) return;
      const k = gkey(x, y, z), had = NEW.get(k), cur = had === undefined ? W.get(x, y, z) : had;
      if (cur === id) return;
      if (!frame.seen.has(k)) { frame.seen.add(k); frame.prev.push(k, had === undefined ? -1 : had); }
      if (had === undefined) ORIG.set(k, cur);
      NEW.set(k, id);
      const c = ck(x, z);
      if ((colTop.get(c) ?? -1) < y) colTop.set(c, y);
      if (y > maxY) maxY = y;
      grow(frame.box, x, y, z);
      dirty = true;
    },
    groundTop(x, z) {
      x = Math.floor(x); z = Math.floor(z);
      const ct = colTop.get(ck(x, z));
      if (ct === undefined) return vox.groundTop(x, z);
      for (let y = Math.min(SY - 1, Math.max(W.maxY, ct)); y >= 0; y--) {
        const id = get(x, y, z);
        if (id === B.AIR || isCross(id) || NOT_GROUND.has(id)) continue;
        if (isSolid(id)) return y;
      }
      return 0;
    },
    standY(x, z) { return PV.groundTop(x, z) + 1; },
    flush() {},
  };
  P.V = PV;
  P.L = makeLand(core, H.allow, PV);
  P.get = get;

  // ---------- frames ----------
  const changed = () => {
    dirty = true;
    events.emit('god:pending', P.state());
    H.histChanged?.();
  };
  P.changed = changed;
  // tool: the tool id the frame belongs to (the act's kind at the tick); label: its words
  P.begin = (tool, label = TOOL[tool]?.name ?? tool) => {
    if (frame) P.end();
    frame = { tool, label, seen: new Set(), prev: [], next: null, ops: [], box: emptyBox() };
    return frame;
  };
  P.inFrame = () => !!frame;
  P.op = (op, x, z) => { if (!frame) return; frame.ops.push(op); grow(frame.box, Math.floor(x), op.y ?? vox.groundTop(x, z), Math.floor(z)); dirty = true; };
  P.end = () => {
    const f = frame;
    frame = null;
    if (!f) return null;
    if (!f.prev.length && !f.ops.length) return null;
    f.next = [];
    for (let i = 0; i < f.prev.length; i += 2) f.next.push(f.prev[i], NEW.get(f.prev[i]));
    frames.push(f);
    undone.length = 0;
    changed();
    return f;
  };
  function revert(f) {
    for (let i = f.prev.length - 2; i >= 0; i -= 2) {
      const k = f.prev[i], v = f.prev[i + 1];
      if (v === -1) { NEW.delete(k); ORIG.delete(k); } else NEW.set(k, v);
    }
  }
  // throw away the frame in progress (a second finger came down, Esc in mid-stroke)
  P.cancelFrame = () => { const f = frame; frame = null; if (!f) return false; revert(f); dirty = true; return true; };
  // undo the last frame (the frame in progress first); redo it again
  P.undo = () => {
    if (frame) { P.cancelFrame(); changed(); return true; }
    const f = frames.pop();
    if (!f) return false;
    revert(f);
    undone.push(f);
    changed();
    return f.label;
  };
  P.redo = () => {
    const f = undone.pop();
    if (!f) return false;
    for (let i = 0; i < f.next.length; i += 2) {
      const k = f.next[i];
      if (!NEW.has(k)) { const [x, y, z] = ofG(k); ORIG.set(k, W.get(x, y, z)); }
      NEW.set(k, f.next[i + 1]);
    }
    frames.push(f);
    changed();
    return f.label;
  };
  // the river being drawn is the last frame, made again whenever its points change
  P.top = () => frames[frames.length - 1] ?? null;
  P.popTop = () => { const f = frames.pop(); if (f) { revert(f); dirty = true; } return f ?? null; };
  P.has = () => frames.length > 0 || !!frame;
  P.canUndo = () => frames.length > 0 || !!frame;
  P.canRedo = () => undone.length > 0;
  P.count = () => frames.length;
  const ops = (type) => { const out = []; for (const f of frames) for (const o of f.ops) if (o.type === type) out.push(o); if (frame) for (const o of frame.ops) if (o.type === type) out.push(o); return out; };
  P.goneAnimals = () => new Set(ops('gone').map((o) => o.e));
  P.closingCaves = () => new Set(ops('cave').map((o) => o.cave));
  P.box = () => { const b = emptyBox(); for (const f of frames) union(b, f.box); if (frame) union(b, frame.box); return b; };
  P.state = () => ({ has: P.has(), strokes: frames.length, tool: frames[frames.length - 1]?.tool ?? null, canUndo: P.canUndo(), canRedo: P.canRedo() });

  const oldTops = new Map(); // the ghost: the ground's height before the change, per column (kept while it waits)
  function clear() {
    NEW.clear(); ORIG.clear(); colTop.clear(); oldTops.clear();
    frames.length = 0; undone.length = 0; frame = null; maxY = -1;
    dirty = true;
  }
  P.drop = () => {
    const had = P.has();
    clear();
    if (had) { changed(); events.emit('sfx:play', { name: 'ui.click' }); }
    return had;
  };

  // ---------- the tick: everything at once, one undo step, one act ----------
  // o.quiet: no act (the start of time takes what was drawn in creation as creation's work)
  P.apply = (o = {}) => {
    if (frame) P.end();
    if (!frames.length) return null;
    const count = {};
    for (const f of frames) count[f.tool] = (count[f.tool] ?? 0) + 1 + f.prev.length / 2 + f.ops.length;
    const kind = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
    const tools = new Set(frames.map((f) => f.tool));
    const label = tools.size === 1 ? (KIND_WORD[kind] ?? frames[0].label) : `${KIND_WORD[kind] ?? frames[0].label} and more`;
    const adds = ops('animal'), gone = [...P.goneAnimals()], caves = [...P.closingCaves()];
    const area = P.box(), strokes = frames.length;
    // a cave being closed lets go of the hill first (nobody lives in it: an erase never takes a lived-in one)
    for (const c of caves) H.simCall('ask', 'caveClosing', c);
    core.begin(label);
    let wrote = 0, clash = 0, height = false;
    const b = emptyBox();
    for (const [k, id] of NEW) {
      const was = ORIG.get(k);
      if (id === was) continue;
      const [x, y, z] = ofG(k);
      if (!inB(x, y, z)) continue;
      if (W.get(x, y, z) !== was) { clash++; continue; } // the simulation built here meanwhile: its block stays
      vox.set(x, y, z, id);
      wrote++;
      grow(b, x, y, z);
      if (isGround(id) !== isGround(was)) height = true;
    }
    if (wrote && height) H.L.resettle(b.x0 - 2, b.z0 - 2, b.x1 + 2, b.z1 + 2);
    const cmd = core.end();
    // animals: placed and taken through the simulation
    const born = [];
    for (const a of adds) {
      if (typeof H.sim()?.spawnAnimal !== 'function') { H.refuse('no-sim', a.x, a.z); break; }
      const r = H.simCall('spawnAnimal', a.kind, a.x, a.z);
      if (r?.entity) born.push({ e: r.entity, kind: a.kind, x: r.entity.x, z: r.entity.z });
      else H.refuse(`animal-${r?.reason ?? 'cliff'}`, a.x, a.z, r?.text);
    }
    const taken = [];
    for (const e of gone) { const kindOf = e.species, x = e.x, z = e.z; if (H.simCall('removeAnimal', e)) taken.push({ kind: kindOf, x, z, e }); }
    // in creation, animals placed or taken join the blocks in the same undo step
    if (clock.phase === 'creation' && (born.length || taken.length)) {
      const diff = cmd?.diff ?? [];
      if (cmd) core.history.undo.pop();
      core.pushCustom(label, {
        undo() { vox.applyDiff(diff, false); for (const it of born) H.simCall('removeAnimal', it.e); for (const it of taken) { const r = H.simCall('spawnAnimal', it.kind, it.x, it.z); if (r?.entity) it.e = r.entity; } },
        redo() { vox.applyDiff(diff, true); for (const it of born) { const r = H.simCall('spawnAnimal', it.kind, it.x, it.z); if (r?.entity) it.e = r.entity; } for (const it of taken) H.simCall('removeAnimal', it.e); },
      });
    }
    if (clash) H.refuse('changed', area.x0, area.z0, 'Something was built there while you were deciding: that part was left as it is.');
    const any = wrote > 0 || born.length > 0 || taken.length > 0 || caves.length > 0;
    let seenBy = 0;
    if (any && !o.quiet) {
      const x = (area.x0 + area.x1 + 1) / 2, z = (area.z0 + area.z1 + 1) / 2, r = Math.hypot(area.x1 - area.x0 + 1, area.z1 - area.z0 + 1) / 2;
      const actKind = caves.length && kind === 'erase' && !wrote ? 'cave-close' : kind;
      const extra = { strokes };
      if (kind === 'animal' && born.length) Object.assign(extra, { target: born[0].e, animal: born[0].kind, count: born.length });
      seenBy = H.act(actKind, x, z, Math.max(1.5, r), extra);
    }
    clear();
    changed();
    if (any) events.emit('sfx:play', { name: 'ui.click' });
    events.emit('god:applied', { kind, strokes, blocks: wrote, animals: born.length, taken: taken.length, caves: caves.length, seenBy });
    return { kind, strokes, blocks: wrote, animals: born.length, taken: taken.length, caves: caves.length, seenBy, label: cmd?.label ?? label };
  };


  // ---------- the ghost (director, 2026-11-15: height lines while raising; height lines and shadow while lowering) ----------
  // The change is drawn as a see-through copy of the real result, in the colours the real blocks will have (pending-look.js):
  //   - new ground (raised, dried water) in its own top and side colours, a dark line at every block of height: the foot,
  //     each step on a steep face, and each step's edge on top (rings round a hill from above, as on a map)
  //   - ground that goes fades pale over the world; the hole it leaves is drawn through the ground, its floor and walls in
  //     the ground's own colours, darker the deeper (a well), with a pale broken line at every block of depth and round
  //     its rim. Up and down are told apart by dark and pale, whole and broken, never by hue alone.
  //   - water, plants, painted ground in their own colours; things an erase takes fade pale; animals as small marks
  const group = new THREE.Group();
  group.renderOrder = 45;
  overlay.group.add(group);
  const unit = trueUnit(THREE);
  // a layer: a depth pass (so only the nearest face of the ghost is coloured, once) and a see-through colour pass, the
  // top face in its own colour (iTop); tint: drawn a hair toward the eye so it lies over the real blocks it covers (what
  // will go); xray: seen through the ground (the floor and walls of a hole still to be dug), no depth pass
  // line: a line layer (it changes less with the see-through setting, so it stays readable)
  function layer(order, opacity, tint, xray = false, line = false) {
    const off = tint ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 } : {};
    const depth = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, ...off });
    const paint = twoTone(xray ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, depthTest: false })
      : new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, depthFunc: THREE.LessEqualDepth, ...off }));
    const L = { cap: 0, a: null, b: null, top: null, geo: null, order, opacity };
    // the see-through setting: never quite solid, so the land behind still shows
    L.see = (g) => { paint.opacity = Math.min(0.96, opacity * (line ? g.line : g.body)); };
    L.make = (cap) => {
      for (const m of [L.a, L.b]) if (m) { group.remove(m); m.dispose?.(); }
      L.geo?.dispose();
      L.cap = cap;
      L.geo = unit.clone();
      L.top = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      L.geo.setAttribute('iTop', L.top);
      L.a = new THREE.InstancedMesh(L.geo, depth, cap);
      L.b = new THREE.InstancedMesh(L.geo, paint, cap);
      L.b.instanceMatrix = L.a.instanceMatrix;
      L.b.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      for (const m of [L.a, L.b]) { m.count = 0; m.frustumCulled = false; m.userData.noPick = true; m.matrixAutoUpdate = false; }
      L.a.renderOrder = order; L.b.renderOrder = order + 1;
      group.add(L.a); group.add(L.b);
    };
    L.make(512);
    L.n = 0;
    L.reset = () => { L.n = 0; };
    // a box from (x, y, z), sx by sy by sz: its sides in c, its top in top
    L.add = (x, y, z, sx, sy, sz, c, top = c) => {
      if (L.n >= L.cap) {
        const oldM = L.a.instanceMatrix.array, oldC = L.b.instanceColor.array, oldT = L.top.array, n = L.n;
        L.make(L.cap * 2);
        L.a.instanceMatrix.array.set(oldM.subarray(0, n * 16)); L.b.instanceColor.array.set(oldC.subarray(0, n * 3)); L.top.array.set(oldT.subarray(0, n * 3));
      }
      const m = L.a.instanceMatrix.array, o = L.n * 16;
      m[o] = sx; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sz; m[o + 11] = 0; m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
      const cc = L.b.instanceColor.array, tt = L.top.array, q = L.n * 3;
      cc[q] = c.r; cc[q + 1] = c.g; cc[q + 2] = c.b;
      tt[q] = top.r; tt[q + 1] = top.g; tt[q + 2] = top.b;
      L.n++;
    };
    L.done = () => {
      L.a.count = L.b.count = L.n;
      L.a.instanceMatrix.needsUpdate = true; L.b.instanceColor.needsUpdate = true; L.top.needsUpdate = true;
      L.a.visible = !xray && L.n > 0; L.b.visible = L.n > 0;
    };
    return L;
  }
  // what will appear, what will go, the hole, animals, the lines on the ground and the ghost, the lines in a hole
  const appear = layer(41, 0.6, false), tint = layer(43, 0.43, true), hole = layer(45, 0.91, false, true), marks = layer(47, 0.8, false, false, true);
  const ink = layer(49, 0.67, true, false, true), inkX = layer(51, 0.9, false, true, true);
  const LAYERS = [appear, tint, hole, marks, ink, inkX];
  let seeAt = null;
  // Settings, "Land preview: how see-through" (ui/menu.js writes U.settings.ghost); applied at once, to a change
  // already waiting too
  const see = () => {
    const v = ctx.modules?.ui?.settings?.ghost;
    if (v === seeAt) return;
    seeAt = v;
    const g = ghostScale(v);
    for (const L of LAYERS) L.see(g);
  };
  see();
  const TC = makeColors(THREE);
  const caveLines = D.lines(64);

  // which kind of change a block is, and which block's colours it wears
  function classify(was, now, x, y, z) {
    const g0 = isGround(was), g1 = isGround(now);
    if (g0 && now === B.WATER) return ['bed', B.WATER, tint];       // dug and filled: a river's bed, painted water
    if (g0 && !g1) return ['dug', was, tint];                         // ground that goes: it fades
    if (!g0 && g1) return ['raised', now, appear];                    // new ground (and dried water)
    if (now === B.WATER && was !== B.WATER) return ['water', B.WATER, appear];
    if (g0 && g1) { // a painted top (an inner block turned to dirt under a raise is not shown)
      const up = get(x, y + 1, z);
      return isGround(up) || up === B.WATER ? null : ['paint', now, appear];
    }
    if (now === B.AIR || (was === B.WATER && now !== B.WATER)) return ['gone', was, tint];
    return ['grow', now, appear];
  }
  let builtPpm = 0;
  function build() {
    lastBuild = performance.now();
    dirty = false;
    builtPpm = camera.ppm;
    appear.reset(); tint.reset(); hole.reset(); ink.reset(); inkX.reset();
    // per column: the changed blocks, then merged into runs of the same kind and block
    const cols = new Map();
    for (const [k, now] of NEW) {
      const was = ORIG.get(k);
      if (now === was) continue;
      const [x, y, z] = ofG(k);
      const c = classify(was, now, x, y, z);
      if (!c) continue;
      const key = ck(x, z);
      let col = cols.get(key);
      if (!col) { col = { x, z, list: [] }; cols.set(key, col); }
      col.list.push([y, c[0], c[1], c[2]]);
    }
    // heights before (o) and after (n): the new one looked for downward from the highest changed block, a few steps
    const ot = (x, z) => { const k = ck(x, z); let v = oldTops.get(k); if (v === undefined) { v = vox.groundTop(x, z); oldTops.set(k, v); } return v; };
    const nt = (x, z) => { const c = cols.get(ck(x, z)); return c && c.n !== undefined ? c.n : ot(x, z); };
    const newTopOf = (x, z, from) => { for (let y = from; y >= 0; y--) { if (isGround(get(x, y, z))) return y; } return 0; };
    const floors = new Map(); // a column being dug: its new floor and its old top (the hole, seen through the ground)
    for (const col of cols.values()) {
      const { x, z, list } = col;
      list.sort((a, b) => a[0] - b[0]);
      // a column that ends up holding water (a river's bed, a lake's shore cut down) shows as water all the way up
      if (list.some((e) => e[1] === 'bed' || e[1] === 'water')) for (const e of list) if (e[1] === 'dug') { e[1] = 'bed'; e[2] = B.WATER; }
      col.o = ot(x, z);
      col.n = newTopOf(x, z, Math.max(col.o, list[list.length - 1][0]));
      let i = 0;
      while (i < list.length) {
        const [y0, kind, id, L] = list[i];
        let j = i;
        while (j + 1 < list.length && list[j + 1][0] === list[j][0] + 1 && list[j + 1][1] === kind && list[j + 1][2] === id) j++;
        const y1 = list[j][0];
        let side = TC.side(id), top = TC.top(id);
        if (kind === 'dug' || kind === 'gone') { side = TC.pale(side, 0.55); top = TC.pale(top, 0.55); }
        else if (kind === 'water' || kind === 'bed') side = top = TC.pale(top, 0.1);
        else { side = TC.pale(side, 0.14); top = TC.pale(top, 0.14); } // a touch lighter than the real thing
        if (kind === 'paint') L.add(x, y1 + 1, z, 1, 0.14, 1, top, top);
        else if (kind === 'grow' && isCross(id)) L.add(x + 0.25, y0, z + 0.25, 0.5, y1 - y0 + 0.75, 0.5, side, top);
        else L.add(x, y0, z, 1, y1 - y0 + 1, 1, side, top);
        // (a column dug through grass, earth and rock is several runs: the floor is the lowest, the top the highest)
        if (kind === 'dug') { const f = floors.get(ck(x, z)); if (!f) floors.set(ck(x, z), { x, z, y: y0, top: y1 + 1 }); else { f.y = Math.min(f.y, y0); f.top = Math.max(f.top, y1 + 1); } }
        i = j + 1;
      }
    }
    // the hole: its floor, and a wall wherever the ground beside it stands higher, drawn through the ground, in the
    // ground's own colours (grass, earth, rock), darker the deeper
    if (floors.size) {
      const floorAt = (x, z) => floors.get(ck(x, z))?.y ?? nt(x, z) + 1;
      for (const f of floors.values()) {
        const fid = get(f.x, f.y - 1, f.z);
        const fc = TC.dark(TC.top(isGround(fid) ? fid : B.DIRT), Math.min(0.88, 0.3 + (f.top - f.y) * 0.085));
        hole.add(f.x, f.y, f.z, 1, 0.05, 1, fc, fc);
        for (const [dx, dz] of DIRS) {
          const top = Math.min(floorAt(f.x + dx, f.z + dz), f.top);
          if (top <= f.y) continue;
          const wx = dx > 0 ? f.x + 0.97 : f.x, wz = dz > 0 ? f.z + 0.97 : f.z;
          for (let y = f.y; y < top; y++) {
            const id = get(f.x + dx, y, f.z + dz);
            const wc = TC.dark(TC.side(isGround(id) ? id : B.DIRT), Math.min(0.9, 0.25 + (f.top - y - 0.5) * 0.09));
            hole.add(wx, y, wz, dx ? 0.03 : 1, 1, dz ? 0.03 : 1, wc, wc);
          }
        }
      }
    }
    lines(cols, nt);
    appear.done(); tint.done(); hole.done(); ink.done(); inkX.done();
    // caves an erase will close: their outline
    caveLines.begin();
    for (const cave of P.closingCaves()) {
      const b = cave.box, y0 = (cave.F ?? 10) + 1, y1 = cave.cutY ?? y0 + 4, X = [b.x0, b.x1 + 1], Z = [b.z0, b.z1 + 1], c = INK.gone;
      for (const y of [y0, y1]) { caveLines.seg([X[0], y, Z[0]], [X[1], y, Z[0]], c).seg([X[1], y, Z[0]], [X[1], y, Z[1]], c).seg([X[1], y, Z[1]], [X[0], y, Z[1]], c).seg([X[0], y, Z[1]], [X[0], y, Z[0]], c); }
      for (const x of X) for (const z of Z) caveLines.seg([x, y0, z], [x, y1, z], c);
    }
    caveLines.end();
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // a strip along one edge of column (x, z) at height h: t wide, standing out of the face by `out`, onto the top by
  // `inn`; dashed: two pieces with gaps
  function strip(L, x, z, dx, dz, h, t, out, inn, c, dashed) {
    const th = t * 0.55;
    const segs = dashed ? [[0.06, 0.38], [0.56, 0.88]] : [[-out, 1 + out]];
    for (const [s0, s1] of segs) {
      if (dx) { const px = dx > 0 ? x + 1 - inn : x - out; L.add(px, h - th / 2, z + s0, inn + out, th, s1 - s0, c, c); }
      else { const pz = dz > 0 ? z + 1 - inn : z - out; L.add(x + s0, h - th / 2, pz, s1 - s0, th, inn + out, c, c); }
    }
  }
  // a line at every block of height (dark, whole) and of depth (pale, broken), about 1 px wide on the screen
  function lines(cols, nt) {
    const t = Math.min(0.3, Math.max(0.08, 1.05 / camera.ppm));
    const cu = TC.hex(INK.up), cd = TC.hex(INK.down);
    for (const col of cols.values()) {
      const { x, z, o, n } = col;
      if (n > o) {
        for (const [dx, dz] of DIRS) {
          const nn = nt(x + dx, z + dz);
          if (nn >= n) continue;
          // the foot (where it meets ground left as it is), each step on a steep face, and the step's edge on top
          const from = nn <= o ? o + 1 : nn + 2;
          for (let h = from; h <= n + 1; h++) strip(ink, x, z, dx, dz, h, t, 0.03, h === n + 1 ? t : 0.02, cu, false);
        }
      } else if (n < o) {
        for (const [dx, dz] of DIRS) {
          const nn = nt(x + dx, z + dz);
          // the rim, on the ground as it is now, where the hole begins
          if (nn >= o) strip(ink, x, z, dx, dz, o + 1, t, 0.02, t, cd, true);
          // the walls, through the ground: a line at every block of depth
          const wallTop = Math.min(nn, o) + 1;
          for (let h = n + 1; h < wallTop; h++) strip(inkX, x, z, dx, dz, h, t, 0, t * 0.8, cd, true);
        }
      }
    }
  }
  // animals to come and animals to go: small marks, every frame (they move)
  function drawMarks() {
    marks.reset();
    for (const a of ops('animal')) marks.add(a.x - 0.6, PV.standY(a.x, a.z), a.z - 0.6, 1.2, a.kind === 'bird' ? 0.8 : 1.6, 1.2, TC.hex(ANIMAL_COLOR[a.kind] ?? 0xffffff));
    for (const e of P.goneAnimals()) if (!e.dead && e.x != null) marks.add(e.x - 0.5, (e.y ?? vox.standY(e.x, e.z)) - 0.1, e.z - 0.5, 1, 1.4, 1, TC.hex(INK.gone));
    marks.done();
  }

  // ---------- the tick and the cross on the map ----------
  const btn = makeButtons(['ok', 'no'], { ok: () => H.api.apply(), no: () => H.api.drop() }, 'pending');
  P.buttons = btn;
  P.place = () => {
    if (!P.has() || frame || !H.tool) { btn.hide(); return null; }
    const b = P.box();
    if (!(b.x0 <= b.x1)) { btn.hide(); return null; }
    const sb = screenBox(camera, b.x0, b.y0, b.z0, b.x1 + 1, b.y1 + 1, b.z1 + 1);
    const I = H.I;
    return btn.place(sb, I?.lastTouch && performance.now() - I.lastTouch.t < 60000 ? I.lastTouch : null);
  };

  P.update = () => {
    see();
    // the lines keep their width on the screen: drawn again when the zoom has changed by a fifth
    if (NEW.size && builtPpm && Math.abs(camera.ppm / builtPpm - 1) > 0.2) dirty = true;
    if (dirty && (performance.now() - lastBuild > 50 || !frame)) build();
    drawMarks();
    P.place();
  };
  // how many blocks the ghost draws (tests and the frame-time check)
  P.stats = () => ({ blocks: NEW.size, appear: appear.n, tint: tint.n, hole: hole.n, marks: marks.n, strokes: frames.length });
  return P;
}
