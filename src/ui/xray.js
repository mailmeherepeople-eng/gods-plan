// X-ray on hover (the director, 2026-11-13: "i want the caves to be see through when we hover the mouse
// over it, so that we can see people inside. same with houses. only when we hover mouse. like mouse is XRay
// vision."). While the pointer is over a hut or a cave (no tool needed, a power may be armed), its roof, or
// the hill over the chamber, dissolves for a quick fade and the inside shows: who is in, asleep on their mats
// at night or resting by day, the hearth, the stored food. Moving off brings it back.
//   the cut    world/shade.js setCut: chunk fragments inside the building's box and above its cut plane are
//              discarded through a dither (no block changes, no remesh); where the cut runs through solid
//              ground (walls, the hill round a chamber) a cap of flat quads in the block's own colour closes it,
//              so the view is a clean section, not a hole into the void
//   the inside people indoors are hidden by the simulation; while x-rayed each is placed on a mat or by the
//              hearth and drawn, and flagged `xray` so the inspector and the powers can pick them
//   cost       nothing per frame while nothing is hovered: one ray against the buildings' boxes when the
//              pointer or the camera moves (at most 20 times a second)
//
// Walking (view/walk.js, ticket T-0432 "Inside a hut"): the same inside is laid out for the home the walker stands
// in or at the door of, with no cut (the roof stays): the hearth burning, the mats, the store, and the people the
// simulation has indoors, asleep on their mats. Its inside is lit by the hearth and by the day through the door
// (world/shade.js setRoom), and inside it the camera is through the eyes (walk.js `indoor`). Walking changes nothing
// in the simulation: the people are only drawn where they lie, their place in the simulation is not touched.
import { h } from './dom.js';
import { setCut, setRoom, enhance, SHADE } from '../world/shade.js';
import { BLOCK_DEFS, isOpaque, isSolid } from '../world/blocks.js';

const FADE_S = 0.14;       // seconds to dissolve or come back
const PICK_EVERY = 0.05;   // at most this often (seconds) the hover is looked for again

// the home you walk into (docs/WALK.md "Inside a home")
export const ROOM = {
  REACH: 2.5,              // metres: standing this near a home's walls (at its door, say) lays its inside out and lights it
  FADE_S: 0.3,             // seconds for its light to come up or go
  // the even light inside: the day coming in at the door, and what is left of it at night (linear rgb, times strength)
  FILL_DAY: [0.62, 0.6, 0.56],
  FILL_NIGHT: [0.16, 0.12, 0.1],
  // the hearth's warm light on what is near it: its colour by day and by night, and how far it reaches (metres)
  FIRE_DAY: [0.42, 0.24, 0.1],
  FIRE_NIGHT: [0.95, 0.5, 0.2],
  FIRE_REACH: 3.2,
  FLICKER: 0.12,           // the hearth's light wavers by this share
  // where the sleepers lie in a hut (roomPlaces): metres from the hearth's middle
  WALL: 1.08,              // a sleeper's middle this far toward their wall (the walls' inner faces are 1.5 out)
  END: 1.42,               // a wall's places run to this far either side of its middle (just short of the corner)
  SIDE_FROM: -0.85,        // the side walls' places start this far back, clear of the back wall's sleepers
  FLOOR_U: 0.6,            // a household too big for the walls: the rest lie across the floor this far toward the door
  GAP: 0.05,               // between two sleepers end to end
  // a sleeper curled on their side, knees and arms drawn up (radians): the curled body is CURL_LEN long (a child
  // CURL_LEN_CHILD, measured), its middle CURL_MID from where its feet stood (a grown person; a child in proportion)
  CURL_LEGS: -1.55,
  CURL_ARMS: -1.2,
  CURL_LEN: 1.6,
  CURL_LEN_CHILD: 1.1,
  CURL_MID: 1.25,
  BREATH: 0.04,            // a sleeper's chest rises and falls by this share...
  BREATH_RATE: 1.15,       // ...at this pace (radians a second: a breath every 5.5 s, as sleepers outdoors, bodies.js)
};

export default [{
  type: 'panel', id: 'xray', region: 'world', order: 1,
  make(U) { const el = h('div', 'xray-host'); el.hidden = true; el.setAttribute('aria-hidden', 'true'); X(U); return el; },
  frame(U, dt) { U.xray?.frame(dt); },
}];

function X(U) {
  const { ctx } = U;
  const THREE = ctx.THREE, W = ctx.world;
  const root = new THREE.Group();
  root.visible = false;
  ctx.scene.add(root);
  const capMat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1, side: THREE.DoubleSide }));
  const lam = (c, o = {}) => enhance(new THREE.MeshLambertMaterial({ color: c, ...o }));
  const M = {
    stone: lam(0x5d5650), ember: new THREE.MeshBasicMaterial({ color: 0xff7a2a }), flame: new THREE.MeshBasicMaterial({ color: 0xffd060 }), // the fire gives its own light
    mat: lam(0xc9a76a), mat2: lam(0xb8935a), pot: lam(0x9c5a35), grain: lam(0xe0b850), basket: lam(0x8a6a3c),
  };
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const POT = new THREE.CylinderGeometry(0.2, 0.15, 0.42, 8);
  let boxes = new WeakMap(); // building -> its x-ray box (a cave's hill top can change: cleared on every edit)
  let cur = null, a = 0, want = null, pickT = 0, lastKey = '', caps = null, props = null, shown = new Set(), flame = null;

  // ---------- what the pointer is over ----------
  const _ray = new THREE.Ray(), _box = new THREE.Box3(), _v = new THREE.Vector3();
  function boxOf(b) {
    if (b.kind === 'hut') { const y = Math.round(b.y); return { x0: b.cx - 2, z0: b.cz - 2, x1: b.cx + 3, z1: b.cz + 3, y0: y - 1, y1: y + 5, cutY: y + 2, floor: y, inner: { x0: b.cx - 1, z0: b.cz - 1, x1: b.cx + 1, z1: b.cz + 1 }, hearth: { x: b.cx + 0.5, z: b.cz + 0.5 } }; }
    if (b.kind === 'cave' && b.box) {
      const B0 = b.box;
      let hi = b.cutY;
      for (let z = B0.z0; z <= B0.z1; z++) for (let x = B0.x0; x <= B0.x1; x++) hi = Math.max(hi, ctx.vox.groundTop(x, z) + 1);
      return { x0: B0.x0, z0: B0.z0, x1: B0.x1 + 1, z1: B0.z1 + 1, y0: b.F, y1: hi + 1, cutY: b.cutY, floor: b.F + 1, inner: b.chamber, hearth: b.hearth };
    }
    return null;
  }
  function find() {
    const p = U.pointer;
    if (!p.overCanvas || p.overHud || ctx.controls?.down != null) return null;
    let r;
    try { r = ctx.camera.ray(p.x, p.y); } catch { return null; }
    _ray.origin.copy(r.origin); _ray.direction.copy(r.direction);
    let best = null, bd = Infinity;
    for (const b of U.get('sim', 'buildings') ?? []) {
      if ((b.kind !== 'hut' || !b.done) && b.kind !== 'cave') continue;
      let B0 = boxes.get(b); if (B0 === undefined) { B0 = boxOf(b); boxes.set(b, B0); }
      if (!B0) continue;
      _box.min.set(B0.x0, B0.y0, B0.z0); _box.max.set(B0.x1, B0.y1, B0.z1);
      if (!_ray.intersectBox(_box, _v)) continue;
      const d = _v.distanceToSquared(_ray.origin);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------- the section caps ----------
  const _c = new THREE.Color();
  function buildCaps(B0) {
    const pos = [], nor = [], col = [], idx = [];
    const quad = (pts, n, c) => {
      const o = pos.length / 3;
      for (const q of pts) { pos.push(q[0], q[1], q[2]); nor.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]); }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    const shade = (id, part, k) => { const d = BLOCK_DEFS[id]?.[part] ?? BLOCK_DEFS[id]?.top ?? [0.4, 0.35, 0.3]; return [d[0] * k, d[1] * k, d[2] * k]; };
    const y = B0.cutY + 0.003;
    for (let z = B0.z0; z < B0.z1; z++) for (let x = B0.x0; x < B0.x1; x++) {
      const below = W.get(x, B0.cutY - 1, z), at = W.get(x, B0.cutY, z);
      if (isSolid(below) && isOpaque(at)) quad([[x, y, z], [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z]], [0, 1, 0], shade(below, 'top', 0.78));
    }
    // the box's sides where the cut runs through solid ground on both sides of the edge
    const side = (x, z, nx, nz, ox, oz) => { // (x, z) inside cell, (ox, oz) the outside neighbour, n the inward normal
      const hi = ctx.vox.groundTop(ox, oz);
      for (let yy = B0.cutY; yy <= hi; yy++) {
        const out = W.get(ox, yy, oz), inn = W.get(x, yy, z);
        if (!isOpaque(out) || !isOpaque(inn)) continue;
        const c = shade(out, 'side', 0.62);
        if (nx) { const px = nx > 0 ? x : x + 1; quad([[px, yy, z], [px, yy + 1, z], [px, yy + 1, z + 1], [px, yy, z + 1]], [nx, 0, 0], c); }
        else { const pz = nz > 0 ? z : z + 1; quad([[x, yy, pz], [x + 1, yy, pz], [x + 1, yy + 1, pz], [x, yy + 1, pz]], [0, 0, nz], c); }
      }
    };
    for (let x = B0.x0; x < B0.x1; x++) { side(x, B0.z0, 0, 1, x, B0.z0 - 1); side(x, B0.z1 - 1, 0, -1, x, B0.z1); }
    for (let z = B0.z0; z < B0.z1; z++) { side(B0.x0, z, 1, 0, B0.x0 - 1, z); side(B0.x1 - 1, z, -1, 0, B0.x1, z); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, capMat);
    m.renderOrder = 2;
    return m;
  }

  // ---------- the inside: mats, the hearth, the food ----------
  // lying places along the inner walls (feet at f, the body toward the head h), and sitting places round the hearth
  function places(B0, b) {
    const R = B0.inner, H0 = B0.hearth;
    const hx = Math.floor(H0.x), hz = Math.floor(H0.z);
    const door = b.door ? [Math.floor(b.door.x), Math.floor(b.door.z)] : null;
    const nearDoor = (x, z) => door && Math.abs(x - door[0]) + Math.abs(z - door[1]) <= 2;
    const lie = [];
    const run = (cells, dx, dz) => { // consecutive cells along one wall, two at a time
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const [a1, b1] = cells[i], [a2, b2] = cells[i + 1];
        if ((a1 === hx && b1 === hz) || (a2 === hx && b2 === hz) || nearDoor(a1, b1) || nearDoor(a2, b2)) continue;
        lie.push({ fx: a1 + 0.5 - dx * 0.35, fz: b1 + 0.5 - dz * 0.35, hx: a2 + 0.5 + dx * 0.35, hz: b2 + 0.5 + dz * 0.35 });
      }
    };
    const col = (x) => { const c = []; for (let z = R.z0; z <= R.z1; z++) c.push([x, z]); return c; };
    const row = (z) => { const c = []; for (let x = R.x0; x <= R.x1; x++) c.push([x, z]); return c; };
    run(col(R.x0), 0, 1); run(col(R.x1), 0, 1); run(row(R.z0), 1, 0); run(row(R.z1), 1, 0);
    if (R.x1 - R.x0 >= 4) { run(col(R.x0 + 1), 0, 1); run(col(R.x1 - 1), 0, 1); }
    // a short hut: one long mat per wall (three cells, the body two of them)
    if (!lie.length || lie.length < 4) {
      for (const [x, z, dx, dz] of [[R.x0, R.z0, 0, 1], [R.x1, R.z0, 0, 1], [R.x0, R.z0, 1, 0], [R.x0, R.z1, 1, 0]]) {
        const fx = x + 0.5, fz = z + 0.5;
        if (lie.some((l) => Math.hypot(l.fx - fx, l.fz - fz) < 0.6)) continue;
        lie.push({ fx: fx - dx * 0.3, fz: fz - dz * 0.3, hx: fx + dx * 1.9, hz: fz + dz * 1.9 });
      }
    }
    const sit = [];
    for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + 0.4; sit.push({ x: H0.x + Math.cos(ang) * 1.05, z: H0.z + Math.sin(ang) * 1.05 }); }
    return { lie, sit };
  }
  // Walking into a hut (three blocks by three round the hearth): a grown person laid out straight is two metres long
  // and would lie through the next one, so everyone who lives here has a place curled on their side along a wall,
  // facing the fire, packed end to end: grown-ups first, the back wall, then the side walls (clear of the back wall's
  // sleepers in the corners), then, if a big household still has people over, across the floor between the fire and
  // the door. Each place is a mat from its feet end (fx, fz) to its head end (hx, hz); `who` gives each person theirs.
  function roomPlaces(B0, b) {
    const base = places(B0, b);
    if (b.kind !== 'hut' || !b.door) return base;
    const H0 = B0.hearth;
    let ux = b.door.x - H0.x, uz = b.door.z - H0.z; // toward the door
    if (Math.abs(ux) > Math.abs(uz)) { ux = Math.sign(ux); uz = 0; } else { ux = 0; uz = Math.sign(uz) || 1; }
    const vx = -uz, vz = ux; // across the hut
    const Wl = ROOM.WALL, E = ROOM.END;
    // each run: the line's middle [u, v], its way along [du, dv] from a0 to a1, and the way into the room [nu, nv]
    const runs = [
      { u: -Wl, v: 0, du: 0, dv: 1, a0: -E, a1: E, nu: 1, nv: 0 },
      { u: 0, v: -Wl, du: 1, dv: 0, a0: ROOM.SIDE_FROM, a1: E, nu: 0, nv: 1 },
      { u: 0, v: Wl, du: 1, dv: 0, a0: ROOM.SIDE_FROM, a1: E, nu: 0, nv: -1 },
      { u: ROOM.FLOOR_U, v: 0, du: 0, dv: 1, a0: -E, a1: E, nu: 1, nv: 0 },
    ].map((r) => ({ ...r, used: 0 }));
    const people = (b.households ?? (b.family ? [b.family] : [])).flatMap((f) => f.members.filter((m) => !m.dead))
      .sort((x, y) => ((x.stage === 'child') - (y.stage === 'child')) || ((x.seed ?? 0) - (y.seed ?? 0)));
    const lie = [], who = new Map();
    for (const p of people) {
      const L = p.stage === 'child' ? ROOM.CURL_LEN_CHILD : ROOM.CURL_LEN;
      const r = runs.find((q) => q.a1 - q.a0 - q.used >= L) ?? runs[runs.length - 1]; // over the room: on the floor anyway
      const at = r.a0 + Math.min(r.used, Math.max(0, r.a1 - r.a0 - L)) + L / 2;
      r.used += L + ROOM.GAP;
      const cu = r.u + r.du * at, cv = r.v + r.dv * at;
      const cx = H0.x + cu * ux + cv * vx, cz = H0.z + cu * uz + cv * vz;
      const nx = r.nu * ux + r.nv * vx, nz = r.nu * uz + r.nv * vz; // into the room
      // along the run, the head end chosen so the sleeper faces the room (a figure's front is its local +z: lying with
      // the head along (ax, az) it faces (az, -ax))
      let ax = r.du * ux + r.dv * vx, az = r.du * uz + r.dv * vz;
      if (az * nx - ax * nz < 0) { ax = -ax; az = -az; }
      const h = (L - 0.25) / 2; // the mat (drawn 0.2 longer than fx..hx) a little shorter than the body's place
      who.set(p, lie.length);
      lie.push({ fx: cx - ax * h, fz: cz - az * h, hx: cx + ax * h, hz: cz + az * h, curl: true });
    }
    return { lie, sit: base.sit, who };
  }
  function buildProps(B0, b, P) {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; g.add(m); return m; };
    const fy = B0.floor, H0 = B0.hearth;
    // the hearth: a ring of stones round the embers
    for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2; add(BOX, M.stone, H0.x + Math.cos(ang) * 0.36, fy + 0.07, H0.z + Math.sin(ang) * 0.36, 0.2, 0.14, 0.2, ang); }
    add(BOX, M.ember, H0.x, fy + 0.06, H0.z, 0.34, 0.1, 0.34);
    flame = add(BOX, M.flame, H0.x, fy + 0.25, H0.z, 0.14, 0.3, 0.14);
    // a mat for everyone who lives here
    const n = (b.households ?? (b.family ? [b.family] : [])).reduce((s, f) => s + f.members.filter((m) => !m.dead).length, 0);
    P.lie.slice(0, Math.max(n, 1)).forEach((l, i) => {
      const dx = l.hx - l.fx, dz = l.hz - l.fz, len = Math.hypot(dx, dz);
      add(BOX, i % 2 ? M.mat2 : M.mat, (l.fx + l.hx) / 2, fy + 0.03, (l.fz + l.hz) / 2, 0.72, 0.05, len + 0.2, Math.atan2(dx, dz));
    });
    // the store: pots and baskets by the back wall, one for every two years of eating in store
    const fams = b.households ?? (b.family ? [b.family] : []);
    const food = fams.reduce((s, f) => s + Math.max(0, f.food ?? 0), 0), need = fams.reduce((s, f) => s + (f.lastNeed ?? 2), 0) || 2;
    const pots = Math.max(food > 0.2 ? 1 : 0, Math.min(5, Math.round(food / need / 1.5)));
    const R = B0.inner, corner = { x: R.x1 + 0.7, z: R.z0 + 0.3 };
    for (let k = 0; k < pots; k++) {
      const x = corner.x - (k % 3) * 0.45, z = corner.z + Math.floor(k / 3) * 0.45;
      if (k % 2) { add(BOX, M.basket, x, fy + 0.14, z, 0.36, 0.28, 0.3); add(BOX, M.grain, x, fy + 0.3, z, 0.3, 0.06, 0.24); } else add(POT, M.pot, x, fy + 0.21, z);
    }
    return g;
  }

  // ---------- people inside ----------
  function show(b, B0, P, fade, room) {
    const now = new Set();
    const inside = (U.get('sim', 'people') ?? []).filter((p) => !p.dead && p.inside === b && p.hidden).sort((x, y) => (x.seed ?? 0) - (y.seed ?? 0));
    const night = (U.get('sim', 'stats')?.daylight ?? 1) < 0.35;
    let li = 0, si = 0;
    for (const p of inside) {
      const F = p.F;
      if (!F) continue;
      now.add(p);
      // walking: drawn only (the walk's taps and names read the simulation, where they are indoors and unseen)
      p.xray = !room && fade > 0.5;
      const g = F.group;
      g.visible = true;
      F.far.visible = false; F.fig.visible = true;
      // walking in, everyone is as the simulation has them: asleep lies down, resting (awake) sits by the fire
      const lying = room ? p.asleep || !P.sit.length : p.asleep || night || !P.sit.length;
      F.legL.rotation.x = F.legR.rotation.x = 0; F.armL.rotation.x = F.armR.rotation.x = 0;
      F.body.scale.z = 1;
      const l = lying && P.who && P.lie[P.who.get(p) ?? -1];
      if (l?.curl) {
        const dx = l.hx - l.fx, dz = l.hz - l.fz, len = Math.hypot(dx, dz) || 1, k = (F.s ?? 1.18) / 1.18;
        const ax = dx / len, az = dz / len, mx = (l.fx + l.hx) / 2, mz = (l.fz + l.hz) / 2;
        g.position.set(mx - ax * ROOM.CURL_MID * k, B0.floor, mz - az * ROOM.CURL_MID * k);
        g.rotation.y = Math.atan2(dz, -dx); // the lying figure's head runs along its local -x
        F.fig.rotation.set(0, 0, Math.PI / 2 * 0.92); F.fig.position.y = 0.22 * k;
        F.legL.rotation.x = F.legR.rotation.x = ROOM.CURL_LEGS; F.armL.rotation.x = F.armR.rotation.x = ROOM.CURL_ARMS;
        F.body.scale.z = 1 + Math.sin(performance.now() / 1000 * ROOM.BREATH_RATE + (p.seed ?? 0)) * ROOM.BREATH;
      } else if (lying) {
        const l = P.lie[li++ % Math.max(1, P.lie.length)] ?? { fx: B0.hearth.x + 1, fz: B0.hearth.z, hx: B0.hearth.x + 3, hz: B0.hearth.z };
        const dx = l.hx - l.fx, dz = l.hz - l.fz;
        g.position.set(l.fx, B0.floor, l.fz);
        g.rotation.y = Math.atan2(dz, -dx); // the lying figure's head runs along its local -x
        F.fig.rotation.set(0, 0, Math.PI / 2 * 0.92); F.fig.position.y = 0.22;
        if (!room) { p.x = l.fx + dx * 0.45; p.z = l.fz + dz * 0.45; }
      } else {
        const s = P.sit[si++ % P.sit.length];
        g.position.set(s.x, B0.floor, s.z);
        g.rotation.y = Math.atan2(B0.hearth.x - s.x, B0.hearth.z - s.z);
        F.fig.rotation.set(0, 0, 0);
        F.legL.rotation.x = F.legR.rotation.x = -1.45; F.armL.rotation.x = F.armR.rotation.x = -0.4;
        F.fig.position.y = -0.42 * (F.s ?? 1);
        if (!room) { p.x = s.x; p.z = s.z; }
      }
      if (!room) p.y = B0.floor;
    }
    for (const p of shown) if (!now.has(p)) unshow(p);
    shown = now;
  }
  function unshow(p) {
    p.xray = false;
    const F = p.F;
    if (!F) return;
    if (p.hidden) F.group.visible = false;
    F.fig.rotation.set(0, 0, 0); F.fig.position.y = 0;
    F.legL.rotation.x = F.legR.rotation.x = 0; F.armL.rotation.x = F.armR.rotation.x = 0;
    F.body.scale.z = 1;
  }

  // ---------- switching ----------
  function drop() {
    for (const p of shown) unshow(p);
    shown = new Set();
    if (caps) { caps.geometry.dispose(); root.remove(caps); caps = null; }
    if (props) { root.remove(props); props = null; }
    flame = null;
    root.visible = false;
    setCut(null);
    setRoom(null);
    const W = U.walk?.walker;
    if (W) W.indoor = false;
    cur = null; a = 0; curRoom = false;
  }
  let P = null, B0 = null, propsKey = '', curRoom = false;
  function take(b, room = false) {
    drop();
    cur = b; curRoom = room;
    B0 = boxOf(b); boxes.set(b, B0);
    P = room ? roomPlaces(B0, b) : places(B0, b);
    caps = room ? null : buildCaps(B0); // walking in, the roof stays: nothing is cut
    props = buildProps(B0, b, P);
    propsKey = keyOf(b);
    if (caps) root.add(caps);
    root.add(props);
    root.visible = true;
  }

  // ---------- walking: the home the walker is in or at the door of ----------
  let roomT = 0, roomWant = null;
  function roomPick() {
    const W = U.walk?.walker, Pw = W?.P;
    if (!Pw) return null;
    let best = null, bd = Infinity;
    for (const b of U.get('sim', 'buildings') ?? []) {
      if ((b.kind !== 'hut' || !b.done) && b.kind !== 'cave') continue;
      let B1 = boxes.get(b); if (B1 === undefined) { B1 = boxOf(b); boxes.set(b, B1); }
      if (!B1 || Math.abs(Pw.y - B1.floor) > 2.5) continue;
      const dx = Math.max(B1.x0 - Pw.x, 0, Pw.x - B1.x1), dz = Math.max(B1.z0 - Pw.z, 0, Pw.z - B1.z1);
      const d = Math.hypot(dx, dz);
      if (d <= ROOM.REACH && d < bd) { bd = d; best = b; }
    }
    return best;
  }
  // inside the home's floor (not its doorway), standing on it
  function standsIn(B1) {
    const Pw = U.walk?.walker?.P, R = B1?.inner;
    if (!Pw || !R) return false;
    return Pw.x >= R.x0 && Pw.x < R.x1 + 1 && Pw.z >= R.z0 && Pw.z < R.z1 + 1 && Pw.y > B1.floor - 0.5 && Pw.y < B1.floor + 1.2;
  }
  const _fill = [0, 0, 0], _fire = [0, 0, 0];
  function light(k) {
    const n = Math.max(0, Math.min(1, SHADE.night.value)), t = performance.now() / 1000;
    const fl = 1 - ROOM.FLICKER * (0.5 + 0.3 * Math.sin(t * 9.1) + 0.2 * Math.sin(t * 23.7));
    for (let i = 0; i < 3; i++) {
      _fill[i] = ROOM.FILL_DAY[i] + (ROOM.FILL_NIGHT[i] - ROOM.FILL_DAY[i]) * n;
      _fire[i] = (ROOM.FIRE_DAY[i] + (ROOM.FIRE_NIGHT[i] - ROOM.FIRE_DAY[i]) * n) * fl;
    }
    const R = B0.inner;
    setRoom({ x0: R.x0 - 0.02, z0: R.z0 - 0.02, x1: R.x1 + 1.02, z1: R.z1 + 1.02, y0: B0.floor - 0.02, y1: B0.cutY + 0.02 },
      { x: B0.hearth.x, y: B0.floor + 0.4, z: B0.hearth.z, r: ROOM.FIRE_REACH }, _fill, _fire, k);
  }
  const keyOf = (b) => `${(b.households ?? [b.family]).map((f) => `${f?.id}:${f?.members?.length}:${Math.round((f?.food ?? 0) / 2)}`).join('|')}`;

  U.xray = {
    get target() { return cur; },
    frame(dt) {
      pickT -= dt;
      const p = U.pointer, cam = ctx.camera;
      const key = `${p.x},${p.y},${p.overCanvas},${cam.target.x.toFixed(2)},${cam.target.z.toFixed(2)},${cam.ppm.toFixed(2)},${cam.yaw.toFixed(2)},${cam.pitch.toFixed(2)}`;
      if (key !== lastKey && pickT <= 0) { lastKey = key; pickT = PICK_EVERY; want = find(); }
      else if (!p.overCanvas) want = null;
      // the tap equivalent (phones have no hover): a hut or cave that is selected stays see-through while it is
      if (!want) { const s = U.inspect?.selected; if (s && s.cat === 'building') want = s; }
      if (want && !U.get('sim', 'buildings')?.includes(want)) want = null;
      // walking (walk.js): a roof never dissolves in front of the eye; the home the walker is in or at is laid out
      const room = !!U.walking;
      if (room) {
        roomT -= dt;
        if (roomT <= 0) { roomT = PICK_EVERY; roomWant = roomPick(); }
        want = roomWant;
      } else roomWant = null;
      const fadeS = room || curRoom ? ROOM.FADE_S : FADE_S;
      if (cur && (cur !== want || curRoom !== room)) { a -= dt / fadeS; if (a <= 0) drop(); }
      else if (!cur && want) take(want, room);
      else if (cur) a = Math.min(1, a + dt / fadeS);
      if (!cur) return;
      if (keyOf(cur) !== propsKey) { if (curRoom) P = roomPlaces(B0, cur); root.remove(props); props = buildProps(B0, cur, P); propsKey = keyOf(cur); root.add(props); }
      const k = Math.max(0, Math.min(1, a));
      if (curRoom) {
        light(k);
        const W = U.walk?.walker;
        if (W) W.indoor = room && cur === want && standsIn(B0);
        props.visible = true;
      } else {
        setCut({ x0: B0.x0 + 0.02, z0: B0.z0 + 0.02, x1: B0.x1 - 0.02, z1: B0.z1 - 0.02 }, B0.cutY, k);
        capMat.opacity = k;
        props.visible = k > 0.3;
      }
      if (flame) { const t = performance.now() / 1000; flame.scale.set(0.14, 0.24 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.03, 0.14); }
      show(cur, B0, P, k, curRoom);
    },
    drop,
  };
  // a building that changes under the cut (a hut taken down, a cave closed): let go of it
  U.on('edit', () => { if (cur) drop(); boxes = new WeakMap(); });
}
