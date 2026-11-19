// Blocky figures for people and animals, the fire, the strike bolt and the
// blob shadows. Ported from the source repo's npc/npc.js (the Npc and Animal
// constructors: part sizes, pivots, the hashed look mix, carried items, work
// poses, the four-beat gait). Changed: every part is built straight into one
// vertex-coloured geometry per moving part and cached by look, so two people
// with the same hair and dye share their geometry; everything draws with the
// shared MERGED_MAT (world/merge.js), an enhance()d material, so figures fade
// into the edge mist. Left behind: speech bubbles, named looks, modern dress,
// the player-as-obstacle, the act scripts.
import * as THREE from '../../vendor/three.module.js';
import { FIGURE_MAT } from '../world/merge.js';
import { enhance } from '../world/shade.js';
import { T } from './tune.js';

const SKIN = [0x8a5a3a, 0x74492e, 0x9c6b45, 0x684026];
// torso dyes: strong value contrast with the meadow (docs/research/03), never green or brown
export const DYES = [0x3e78b2, 0xc99c4e, 0xe5ae3c, 0xefe2c4, 0xa0563c, 0x8a5f9e, 0x4f8c8c, 0xd26a4a];
const HAIR = [0x241812, 0x14100c, 0x3d2414, 0x5a3a22];
const GREY = 0xd8d3c8;

export function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// ---- geometry building: boxes straight into one coloured geometry ----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
function part(list, w, h, d, color, x = 0, y = 0, z = 0, rx = 0, rz = 0, pivotTop = false) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) g.translate(0, -h / 2, 0);
  _e.set(rx, 0, rz); _q.setFromEuler(_e); _p.set(x, y, z);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  _c.setHex(color); // linear working space, as MERGED_MAT expects
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  list.push(g);
  return list;
}
function weld(list) {
  let verts = 0, ic = 0;
  for (const g of list) { verts += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const index = new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); col.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
const CACHE = new Map();
const cached = (key, build) => { let g = CACHE.get(key); if (!g) { g = weld(build([])); CACHE.set(key, g); } return g; };
const mesh = (geo) => { const m = new THREE.Mesh(geo, FIGURE_MAT); return m; }; // MERGED_MAT plus a night lift

// ---- a person ----
// look: { skin, dye, hair, hairC, dress, beard, child, elder }
export function lookFor(rand, dye, opts = {}) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const elder = !!opts.elder, child = !!opts.child;
  return {
    skin: opts.skin ?? pick(SKIN), dye,
    hair: child ? pick(['topknot', 'short', 'short']) : pick(['short', 'long', 'topknot', 'braids', 'short', 'shaved']),
    hairC: elder ? GREY : pick(HAIR),
    dress: child ? 'kilt' : pick(['kilt', 'long', 'apron', 'kilt']),
    beard: !child && opts.sex === 'm' && rand() < 0.4,
    band: rand() < 0.3 ? pick([0x7a5230, 0xc0532f, 0xe5ae3c]) : 0,
    child, elder,
  };
}
const lookKey = (l) => `${l.skin},${l.dye},${l.hair},${l.hairC},${l.dress},${l.beard ? 1 : 0},${l.band},${l.child ? 'c' : ''}`;

function torsoHead(list, l, s) {
  const k = s;
  part(list, 0.5 * k, 0.6 * s, 0.32 * s, l.dye, 0, 0.88 * s, 0);
  part(list, 0.54 * k, 0.09 * s, 0.36 * s, shade(l.dye, 0.62), 0, 0.62 * s, 0); // belt
  // a shoulder mantle wider than the head, so the family's dye reads from above
  part(list, 0.74 * k, 0.12 * s, 0.46 * s, l.dye, 0, 1.17 * s, 0);
  if (l.dress === 'kilt') part(list, 0.56 * k, 0.2 * s, 0.38 * s, 0x9a6a3c, 0, 0.5 * s, 0);
  else if (l.dress === 'long') { part(list, 0.56 * k, 0.4 * s, 0.38 * s, l.dye, 0, 0.42 * s, 0); part(list, 0.58 * k, 0.05 * s, 0.4 * s, shade(l.dye, 0.72), 0, 0.235 * s, 0); }
  else if (l.dress === 'apron') part(list, 0.36 * k, 0.42 * s, 0.03 * s, 0x6a4a30, 0, 0.62 * s, 0.175 * s);
  // head (big, kid-friendly, readable from above): box 0.42, faces at +-0.21
  const hy = 1.42 * s, hd = 0.21;
  const H = (w, h, d, c, x, y, z) => part(list, w * s, h * s, d * s, c, x * s, hy + y * s, z * s);
  part(list, 0.42 * s, 0.4 * s, 0.42 * s, l.skin, 0, hy, 0);
  for (const sx of [-1, 1]) {
    H(0.09, 0.075, 0.02, 0xf4efe6, sx * 0.1, 0.02, hd + 0.005);
    H(0.05, 0.065, 0.02, 0x1a120c, sx * 0.095, 0.015, hd + 0.015);
    H(0.1, 0.03, 0.02, l.hairC, sx * 0.1, 0.09, hd + 0.012);
  }
  H(0.05, 0.07, 0.05, shade(l.skin, 0.85), 0, -0.03, hd + 0.025);
  if (l.beard) H(0.36, 0.13, 0.06, l.hairC, 0, -0.145, hd + 0.02);
  else H(0.1, 0.022, 0.02, 0x4a2418, 0, -0.11, hd + 0.005);
  if (l.hair !== 'shaved') { H(0.45, 0.12, 0.45, l.hairC, 0, 0.23, 0); H(0.4, 0.05, 0.03, l.hairC, 0, 0.165, 0.24); }
  if (l.hair === 'long' || l.hair === 'braids') H(0.47, 0.4, 0.05, l.hairC, 0, -0.01, -0.247);
  if (l.hair === 'braids') for (const sx of [-1, 1]) H(0.08, 0.36, 0.08, l.hairC, sx * 0.185, -0.13, -0.2);
  if (l.hair === 'topknot') H(0.15, 0.13, 0.15, l.hairC, 0, 0.355, -0.04);
  if (l.band) H(0.47, 0.05, 0.47, l.band, 0, 0.18, 0);
  return list;
}
const legBoxes = (list, l, s) => { part(list, 0.17 * s, 0.5 * s, 0.2 * s, l.skin, 0, 0, 0, 0, 0, true); part(list, 0.19 * s, 0.09 * s, 0.27 * s, shade(l.skin, 0.78), 0, -0.47 * s, 0.04 * s); return list; };
const armBoxes = (list, l, s) => { part(list, 0.13 * s, 0.36 * s, 0.17 * s, l.dye, 0, 0, 0, 0, 0, true); part(list, 0.12 * s, 0.17 * s, 0.16 * s, l.skin, 0, -0.35 * s, 0, 0, 0, true); return list; };

// The figure: { group, fig, body, legL, legR, armL, armR, far, s }. `group`
// is what the entity's objs hold; `far` is a one-draw stand-in for far zoom.
export function makePerson(l) {
  const s = T.PERSON_SCALE * (l.child ? 0.62 : 1);
  const key = lookKey(l);
  const g = new THREE.Group();
  const fig = new THREE.Group();
  const body = mesh(cached(`pb:${key}`, (list) => torsoHead(list, l, s)));
  const legGeo = cached(`pl:${l.skin}:${l.child}`, (list) => legBoxes(list, l, s));
  const armGeo = cached(`pa:${l.skin}:${l.dye}:${l.child}`, (list) => armBoxes(list, l, s));
  const legL = mesh(legGeo), legR = mesh(legGeo), armL = mesh(armGeo), armR = mesh(armGeo);
  legL.position.set(-0.13 * s, 0.58 * s, 0); legR.position.set(0.13 * s, 0.58 * s, 0);
  armL.position.set(-0.33 * s, 1.16 * s, 0); armR.position.set(0.33 * s, 1.16 * s, 0);
  fig.add(body, legL, legR, armL, armR);
  const far = mesh(cached(`pf:${key}`, (list) => {
    torsoHead(list, l, s);
    for (const x of [-0.13, 0.13]) { const a = legBoxes([], l, s); for (const q of a) { q.translate(x * s, 0.58 * s, 0); list.push(q); } }
    for (const x of [-0.33, 0.33]) { const a = armBoxes([], l, s); for (const q of a) { q.translate(x * s, 1.16 * s, 0); list.push(q); } }
    return list;
  }));
  far.visible = false;
  g.add(fig, far);
  return { group: g, fig, body, legL, legR, armL, armR, far, s, carryCur: null, carryCache: {} };
}

// carried things hang from an arm (arm space: origin at the shoulder, the
// hand about 0.47 s below, +z the front)
export function setCarry(F, kind) {
  if (F.carryKind === kind) return;
  if (F.carryCur) { F.carryCur.removeFromParent(); F.carryCur = null; }
  F.carryKind = kind || null;
  if (!kind) return;
  let item = F.carryCache[kind];
  if (!item) {
    const s = F.s;
    const geo = cached(`carry:${kind}:${s}`, (list) => {
      if (kind === 'pot') { part(list, 0.26, 0.26, 0.26, 0xb5653a, 0, -0.06, 0); part(list, 0.16, 0.08, 0.16, 0x8f4c2b, 0, 0.1, 0); }
      else if (kind === 'basket') { part(list, 0.32, 0.18, 0.26, 0xc9a866, 0, 0, 0); part(list, 0.28, 0.06, 0.22, 0xe5c25a, 0, 0.11, 0); }
      else if (kind === 'wood') for (let i = 0; i < 3; i++) part(list, 0.5, 0.09, 0.09, i % 2 ? 0x4c3a1e : 0x6d5028, 0, -0.02 + i * 0.1, 0, 0, 0);
      else if (kind === 'meat') part(list, 0.28, 0.16, 0.18, 0x9c3b2e, 0, 0, 0);
      return list;
    });
    item = F.carryCache[kind] = mesh(geo);
    item.position.set(kind === 'wood' ? 0.16 : 0.12, -0.48 * s, 0.18);
    item.scale.setScalar(s);
  }
  (kind === 'pot' ? F.armR : F.armL).add(item);
  F.carryCur = item;
}

// work poses, applied while standing still (ported from Npc._applyPose, plus pray and sit)
export function applyPose(F, pose, t) {
  if (FIGHT_POSES.has(pose)) return fightPose(F, pose, t);
  const L = F.armL.rotation, R = F.armR.rotation;
  let lean = 0, figY = 0;
  F.legL.rotation.x = F.legR.rotation.x = 0;
  const more = POSE_MORE[pose]; if (more) return more(F, t); // hunting poses (below)
  if (pose === 'pick') { const s = Math.abs(Math.sin(t * 1.8)); L.x = -0.55 - s * 0.7; L.z = 0.2; R.x = -0.5 - s * 0.85; R.z = -0.2; lean = 0.25 + s * 0.14; }
  else if (pose === 'chop') { const s = Math.sin(t * 5.4); L.x = -0.7 + s * 0.5; L.z = 0.15; R.x = -1.1 + s * 1.0; R.z = -0.15; lean = 0.1 + Math.max(0, s) * 0.1; }
  else if (pose === 'tend') { const s = Math.sin(t * 1.4); L.x = -0.75 + s * 0.2; L.z = 0.3; R.x = -0.75 - s * 0.2; R.z = -0.3; lean = 0.3; }
  else if (pose === 'pray') { const s = Math.sin(t * 1.1) * 0.12; L.x = -2.7 + s; L.z = 0.35; R.x = -2.7 - s; R.z = -0.35; lean = -0.08; }
  else if (pose === 'sit') { L.x = -0.4; R.x = -0.4; L.z = 0.1; R.z = -0.1; F.legL.rotation.x = F.legR.rotation.x = -1.45; figY = -0.42 * F.s; }
  else if (pose === 'play') { const s = Math.sin(t * 6); L.x = -1.2 + s * 0.8; R.x = -1.2 - s * 0.8; L.z = 0.3; R.z = -0.3; figY = Math.abs(Math.sin(t * 6)) * 0.12; }
  return { lean, figY };
}

// ---- animals ----
const ANIMAL = {
  deer: { c: 0x9a7448, bw: 0.4, bh: 0.4, blen: 0.8, by: 0.68, hw: 0.26, hh: 0.28, hd: 0.3, hy: 0.88, legH: 0.48, legW: 0.09 },
  wolf: { c: 0x6f6a62, bw: 0.36, bh: 0.36, blen: 0.95, by: 0.62, hw: 0.28, hh: 0.26, hd: 0.34, hy: 0.78, legH: 0.44, legW: 0.1 },
  rabbit: { c: 0xa48a6c, bw: 0.26, bh: 0.24, blen: 0.36, by: 0.24, hw: 0.18, hh: 0.17, hd: 0.18, hy: 0.36, legH: 0.12, legW: 0.07 },
};
export function makeAnimal(kind) {
  if (kind === 'bird') return makeBird();
  const A = ANIMAL[kind], sc = kind === 'wolf' ? 1.35 : kind === 'rabbit' ? 1.15 : 1.25;
  const dark = shade(A.c, 0.7);
  const g = new THREE.Group(), fig = new THREE.Group();
  const body = mesh(cached(`ab:${kind}`, (list) => {
    part(list, A.bw, A.bh, A.blen, A.c, 0, A.by, 0);
    if (kind === 'deer') part(list, 0.13, 0.16, 0.05, 0xe8e2d4, 0, A.by + 0.08, -A.blen / 2 - 0.02);
    else if (kind === 'rabbit') { part(list, 0.11, 0.11, 0.08, 0xf2eee6, 0, A.by + 0.04, -A.blen / 2 - 0.03); part(list, A.bw * 0.8, 0.05, A.blen * 0.7, 0xd9cdb8, 0, A.by - A.bh / 2 - 0.01, 0); }
    else {
      part(list, A.bw * 1.1, 0.2, 0.4, shade(A.c, 1.12), 0, A.by + A.bh / 2 + 0.04, A.blen * 0.2); // ruff
      part(list, 0.1, 0.1, 0.5, dark, 0, A.by + 0.1, -A.blen / 2 - 0.2, 0.5, 0); // tail
      part(list, A.bw * 0.7, 0.06, A.blen * 0.7, 0xb9b2a6, 0, A.by - A.bh / 2 - 0.01, 0); // pale belly
    }
    return list;
  }));
  const head = mesh(cached(`ah:${kind}`, (list) => {
    part(list, A.hw, A.hh, A.hd, A.c, 0, 0, 0);
    part(list, 0.05, 0.06, 0.03, 0x171310, -(A.hw / 2 - 0.05), 0.03, A.hd / 2);
    part(list, 0.05, 0.06, 0.03, 0x171310, A.hw / 2 - 0.05, 0.03, A.hd / 2);
    if (kind === 'deer') { part(list, 0.05, 0.3, 0.05, 0x6d5028, -0.1, 0.26, -0.04); part(list, 0.05, 0.3, 0.05, 0x6d5028, 0.1, 0.26, -0.04); }
    else if (kind === 'rabbit') { part(list, 0.05, 0.24, 0.04, shade(A.c, 0.9), -0.05, 0.19, -0.03); part(list, 0.05, 0.24, 0.04, shade(A.c, 0.9), 0.05, 0.19, -0.03); part(list, 0.05, 0.04, 0.03, 0x2a1d14, 0, -0.03, A.hd / 2 + 0.01); }
    else {
      part(list, 0.16, 0.14, 0.22, shade(A.c, 0.85), 0, -0.05, A.hd / 2 + 0.1); // snout
      part(list, 0.07, 0.06, 0.06, 0x1a1512, 0, -0.01, A.hd / 2 + 0.22);         // nose
      part(list, 0.08, 0.14, 0.05, dark, -0.09, A.hh / 2 + 0.06, -0.06);         // ears
      part(list, 0.08, 0.14, 0.05, dark, 0.09, A.hh / 2 + 0.06, -0.06);
      part(list, 0.05, 0.04, 0.02, 0xe8d36a, -(A.hw / 2 - 0.05), 0.03, A.hd / 2 + 0.012); // eyes catch the light
      part(list, 0.05, 0.04, 0.02, 0xe8d36a, A.hw / 2 - 0.05, 0.03, A.hd / 2 + 0.012);
    }
    return list;
  }));
  head.position.set(0, A.hy, A.blen / 2 + A.hd / 2 - 0.02);
  const legGeo = cached(`al:${kind}`, (list) => part(list, A.legW, A.legH, A.legW, dark, 0, 0, 0, 0, 0, true));
  const legs = [];
  const off = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  let i = 0;
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    const l = mesh(legGeo);
    l.position.set(dx * (A.bw / 2 - A.legW / 2), A.legH, dz * (A.blen / 2 - 0.12));
    l._ph = off[i++];
    legs.push(l);
  }
  fig.add(body, head, ...legs);
  fig.scale.setScalar(sc);
  g.add(fig);
  return { group: g, fig, body, head, legs, headY: A.hy, bw: A.bw * sc, sc, dims: A };
}
function makeBird() {
  const g = new THREE.Group(), fig = new THREE.Group();
  const body = mesh(cached('bird:b', (list) => { part(list, 0.16, 0.14, 0.34, 0xf1ede4, 0, 0, 0); part(list, 0.1, 0.1, 0.12, 0xf1ede4, 0, 0.06, 0.2); part(list, 0.04, 0.03, 0.1, 0xe5ae3c, 0, 0.05, 0.3); part(list, 0.1, 0.04, 0.12, 0x2a2622, 0, 0.02, -0.2); return list; }));
  const wing = cached('bird:w', (list) => part(list, 0.42, 0.03, 0.2, 0xd9d3c6, 0.21, 0, 0));
  const wl = mesh(wing), wr = mesh(wing);
  wr.rotation.y = Math.PI;
  fig.add(body, wl, wr);
  fig.scale.setScalar(1.6);
  g.add(fig);
  return { group: g, fig, body, wl, wr };
}

// ---- fights: poses and weapons (sim/fights.js plays them; stage 3's battles can reuse them) ----
// The poses are read by applyPose above; t is the seconds since the pose began. The arms hang from the
// shoulder (rotation.x negative raises an arm forward, about -2.8 is straight up); the figure tips over at its
// feet by `lean` (negative leans back; -1.45 lies on its back).
export const FIGHT_POSES = new Set(['brace', 'swing', 'thrust', 'block', 'recoil', 'stagger', 'down', 'kneel', 'mourn', 'cheer', 'rally',
  'shout', 'gesture', 'shove', 'cower', 'lower', 'kindle']);
export function fightPose(F, pose, t) {
  const L = F.armL.rotation, R = F.armR.rotation, LL = F.legL.rotation, LR = F.legR.rotation;
  let lean = 0, figY = 0;
  LL.x = LR.x = 0; L.z = 0.12; R.z = -0.12;
  const s = F.s;
  if (pose === 'brace') { // weapon up and forward, feet apart, bobbing on the balls of the feet
    const b = Math.sin(t * 4.2);
    R.x = -1.05 + b * 0.12; L.x = -0.75 - b * 0.08; L.z = 0.35; LL.x = 0.32; LR.x = -0.28; lean = 0.14; figY = -0.04 * s + Math.abs(b) * 0.03;
  } else if (pose === 'swing') { // wind up overhead, bring it down hard, follow through (0.75 s a blow)
    const k = (t / 0.75) % 1;
    const a = k < 0.45 ? -1.0 - (k / 0.45) * 2.0 : k < 0.62 ? -3.0 + ((k - 0.45) / 0.17) * 2.6 : -0.4 - ((k - 0.62) / 0.38) * 0.6;
    R.x = a; L.x = -0.5 - (k < 0.45 ? k : 0.45) * 0.8; L.z = 0.3;
    lean = k < 0.45 ? -0.08 : k < 0.7 ? 0.32 : 0.18; LL.x = 0.35; LR.x = -0.3;
  } else if (pose === 'thrust') { // pull back, lunge forward with the spear, recover (0.7 s)
    const k = (t / 0.7) % 1;
    const lunge = k < 0.35 ? -k / 0.35 * 0.3 : k < 0.55 ? (k - 0.35) / 0.2 : 1 - (k - 0.55) / 0.45;
    R.x = -0.9 - Math.max(0, lunge) * 0.55; L.x = -0.9 - Math.max(0, lunge) * 0.4; L.z = 0.2;
    lean = 0.1 + Math.max(0, lunge) * 0.32; LL.x = 0.2 + Math.max(0, lunge) * 0.45; LR.x = -0.35;
  } else if (pose === 'block') { // both arms up across the face
    R.x = -2.1; R.z = 0.45; L.x = -2.0; L.z = -0.45; lean = -0.12 - Math.sin(Math.min(1, t * 3) * Math.PI) * 0.12; LL.x = -0.25; LR.x = 0.2;
  } else if (pose === 'recoil') { // knocked back: arms flung, leaning away, then catching balance
    const k = Math.min(1, t / 0.6);
    R.x = -0.6; R.z = -0.9 * (1 - k * 0.6); L.x = -0.6; L.z = 0.9 * (1 - k * 0.6); lean = -0.42 * (1 - k) - 0.05; LL.x = -0.3; LR.x = 0.35;
  } else if (pose === 'stagger') { // hurt: reeling, wobbling, a hand to the body
    const w = Math.sin(t * 7);
    R.x = -0.3; R.z = -0.6 + w * 0.2; L.x = -1.0; L.z = -0.25; lean = -0.32 + w * 0.12; figY = -0.06 * s; LL.x = 0.3 * w; LR.x = -0.3 * w;
  } else if (pose === 'down') { // on the ground, on the back, arms out
    const k = Math.min(1, t / 0.45);
    R.x = -0.4; R.z = -1.1 * k; L.x = -0.4; L.z = 1.1 * k; lean = -1.45 * k; figY = 0.12 * k; LL.x = -0.15 * k; LR.x = 0.1 * k;
  } else if (pose === 'kneel') { // kneeling to pray: knees down, hands raised to the sky
    const sw = Math.sin(t * 1.3) * 0.12;
    LL.x = LR.x = 1.35; figY = -0.42 * s; R.x = -2.75 + sw; R.z = -0.32; L.x = -2.75 - sw; L.z = 0.32; lean = -0.05;
  } else if (pose === 'mourn') { // kneeling over the dead, bowed, rocking
    LL.x = LR.x = 1.35; figY = -0.42 * s; R.x = -0.7; L.x = -0.7; R.z = 0.2; L.z = -0.2; lean = 0.5 + Math.sin(t * 1.6) * 0.08;
  } else if (pose === 'cheer') { // both arms (and the weapon) up, punching the air
    const b = Math.sin(t * 7);
    R.x = -2.8 + b * 0.35; L.x = -2.8 - b * 0.35; R.z = -0.35; L.z = 0.35; figY = Math.max(0, b) * 0.1; lean = -0.08;
  } else if (pose === 'rally') { // weapon held high and shaken: ready to march
    const b = Math.sin(t * 8.5);
    R.x = -2.55 + b * 0.3; L.x = -0.45; L.z = 0.3; figY = Math.abs(b) * 0.04; lean = 0.04;
  } else if (pose === 'shout') { // jabbing a finger, the other fist on the hip
    const b = Math.sin(t * 7.5);
    R.x = -1.45 + b * 0.35; R.z = -0.05; L.x = -0.25; L.z = 0.75; lean = 0.16 + Math.max(0, b) * 0.08; figY = Math.max(0, b) * 0.03;
  } else if (pose === 'gesture') { // arms flung wide: "what do you want from me?"
    const b = Math.sin(t * 3.2);
    R.x = -1.1; R.z = -1.0 - b * 0.35; L.x = -1.1; L.z = 1.0 + b * 0.35; lean = -0.1 + b * 0.05;
  } else if (pose === 'shove') { // both arms out, shoving
    const k = Math.min(1, t / 0.35);
    R.x = -1.5; L.x = -1.5; R.z = 0.1; L.z = -0.1; lean = 0.1 + k * 0.28; LL.x = 0.45 * k; LR.x = -0.35;
  } else if (pose === 'cower') { // arms over the head, crouched
    R.x = -2.5; R.z = 0.55; L.x = -2.5; L.z = -0.55; lean = 0.38; figY = -0.14 * s; LL.x = -0.5; LR.x = -0.5;
  } else if (pose === 'lower') { // the weapon lowered, head bowed: the anger has gone out of it
    R.x = 0.25; L.x = 0.08; lean = 0.2; R.z = -0.05;
  } else if (pose === 'kindle') { // crouched, the torch held to the crop
    const b = Math.sin(t * 5);
    R.x = -0.75 + b * 0.12; L.x = -0.5; lean = 0.48; figY = -0.16 * s; LL.x = -0.6; LR.x = 0.25;
  }
  return { lean, figY };
}

// A weapon (or a torch, a sack, a stick) in the right hand: its own slot, separate from setCarry's, so a fighter
// can carry loot in the other hand. kind: club, spear, axe, torch, sack, sackfull, or null to put it down; metal:
// stone, copper, bronze, iron (the weapon's head); blessed: the head glows. Geometry is cached by kind and metal.
const METAL = { stone: 0x8e8a80, wood: 0x5a3b20, copper: 0xc8703a, bronze: 0xd2a046, iron: 0x5c6068 };
const BLESS_MAT = enhance(new THREE.MeshLambertMaterial({ color: 0xfff1b0, emissive: 0xffd760, emissiveIntensity: 1.6 }));
const TORCH_MAT = enhance(new THREE.MeshLambertMaterial({ color: 0xffb040, emissive: 0xff8a20, emissiveIntensity: 1.8 }));
function weaponGeo(kind, metal) {
  return cached(`weapon:${kind}:${metal}`, (list) => {
    const head = METAL[metal] ?? METAL.stone, wood = 0x7a5230;
    if (kind === 'club') { part(list, 0.08, 0.08, 0.72, wood, 0, 0, 0.26); part(list, metal === 'stone' || metal === 'wood' ? 0.2 : 0.06, 0.2, 0.26, metal === 'stone' ? 0x5a3b20 : head, metal === 'stone' || metal === 'wood' ? 0 : 0.1, 0, 0.58); if (metal === 'stone') part(list, 0.24, 0.1, 0.1, METAL.stone, 0, 0, 0.6); }
    else if (kind === 'axe') { part(list, 0.07, 0.07, 0.8, wood, 0, 0, 0.28); part(list, 0.05, 0.34, 0.2, head, 0, 0.1, 0.6); }
    else if (kind === 'spear') { part(list, 0.06, 0.06, 2.1, wood, 0, 0, 0.5); part(list, 0.1, 0.1, 0.3, head, 0, 0, 1.68); }
    else if (kind === 'torch') { part(list, 0.08, 0.08, 0.7, wood, 0, 0, 0.26); part(list, 0.13, 0.13, 0.12, 0x3a2a1a, 0, 0, 0.6); }
    else if (kind === 'sack' || kind === 'sackfull') { const k = kind === 'sackfull' ? 1 : 0.65; part(list, 0.34 * k, 0.4 * k, 0.3 * k, 0xb89a68, 0, -0.18 * k, 0.05); part(list, 0.12, 0.1, 0.12, 0x8a6a40, 0, 0.04, 0.05); }
    return list;
  });
}
const GLOW_GEO_W = new THREE.BoxGeometry(0.42, 0.42, 0.52);
const FLAME_GEO_W = new THREE.BoxGeometry(0.2, 0.3, 0.2);
export function setWeapon(F, kind, metal = 'stone', blessed = false) {
  const key = kind ? `${kind}:${metal}:${blessed ? 1 : 0}` : null;
  if (F.weaponKey === key && (!F.weaponCur || F.weaponCur.parent === F.armR)) return;
  if (F.weaponCur) { F.weaponCur.removeFromParent(); F.weaponCur = null; }
  F.weaponKey = key;
  if (!kind) return;
  F.weaponCache ??= {};
  let item = F.weaponCache[key];
  if (!item) {
    item = F.weaponCache[key] = mesh(weaponGeo(kind, metal));
    item.userData.noPick = true;
    const s = F.s;
    item.position.set(0, -0.47 * s, 0.05);
    item.scale.setScalar(s);
    // a spear is held so that it points straight ahead when the arm is raised to about -0.9 (a thrust)
    if (kind === 'spear') item.rotation.x = 0.9;
    if (kind === 'sack' || kind === 'sackfull') item.rotation.x = 0;
    const tip = kind === 'spear' ? 1.68 : 0.6;
    if (blessed && kind !== 'torch' && kind !== 'sack' && kind !== 'sackfull') { const g = new THREE.Mesh(GLOW_GEO_W, BLESS_MAT); g.position.set(0, 0, tip); g.userData.noPick = true; item.add(g); }
    if (kind === 'torch') { const fl = new THREE.Mesh(FLAME_GEO_W, TORCH_MAT); fl.position.set(0, 0.04, 0.74); fl.rotation.x = -0.5; fl.userData.noPick = true; fl.userData.glow = 'torch'; item.add(fl); item.userData.flame = fl; }
  }
  F.armR.add(item);
  F.weaponCur = item;
}

// ---- the fire in the fire circle (flickers; glows at night) ----
const FIRE_MAT = enhance(new THREE.MeshLambertMaterial({ color: 0xff9a3a, emissive: 0xff7a1a, emissiveIntensity: 1.2 }));
const FIRE_MAT2 = enhance(new THREE.MeshLambertMaterial({ color: 0xffd25a, emissive: 0xffc23a, emissiveIntensity: 1.4 }));
export function makeFire() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), FIRE_MAT);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.28), FIRE_MAT2);
  a.position.y = 0.35; b.position.y = 0.5;
  a.userData.glow = 'fire'; // a warm pool of light round it at night (engine/lighting.js)
  g.add(a, b);
  return { group: g, a, b };
}

// ---- the strike: a bolt of light from the sky ----
const BOLT_MAT = enhance(new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0xffe9a0, emissiveIntensity: 2 }));
export function makeBolt() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 60, 0.5), BOLT_MAT);
  m.geometry.translate(0, 30, 0);
  return m;
}

// ---- blob shadows: one instanced draw for every figure ----
export function makeShadows(cap = 1024) {
  const geo = new THREE.CircleGeometry(1, 12);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0; m.frustumCulled = false; m.renderOrder = 1;
  m.userData.noPick = true;
  return m;
}

// =====================================================================
// Hunting, carrying and sleeping out (hunting.js, camp.js; 2026-11-13).
// Self-contained: new functions and new pose names only.
// =====================================================================
// boxes in figure units (times the figure's scale s), group space: origin at the feet, +z the front
const sp = (list, s, w, h, d, c, x, y, z, rx = 0, rz = 0) => part(list, w * s, h * s, d * s, c, x * s, y * s, z * s, rx, rz);
const DEER_C = 0x9a7448, DEER_LIGHT = 0xc08a50, DEER_DARK = 0x6b5032, RABBIT_C = 0xa48a6c;

// ---- loads: on the head or across the shoulders, on the group (so they also show at the far zoom), clear of
// the mantle that hides anything held at the hip. Each kind reads by shape and colour from above: water is a red
// pot with a blue top on the head, grain a yellow basket on the head, wood a bundle on the shoulder, a deer a brown
// carcass across both shoulders, rabbits a pair slung over one shoulder.
const LOADS = {
  pot: (l, s) => { sp(l, s, 0.4, 0.28, 0.4, 0xb5653a, 0, 1.85, 0); sp(l, s, 0.44, 0.06, 0.44, 0x8f4c2b, 0, 2.01, 0); sp(l, s, 0.3, 0.02, 0.3, 0x5aa6d8, 0, 2.045, 0); },
  basket: (l, s) => { sp(l, s, 0.6, 0.14, 0.48, 0xb08a4a, 0, 1.79, 0); sp(l, s, 0.52, 0.09, 0.4, 0xf0cf5a, 0, 1.9, 0); sp(l, s, 0.3, 0.07, 0.22, 0xf7df7a, 0, 1.97, 0); },
  wood: (l, s) => { for (let i = 0; i < 3; i++) sp(l, s, 0.11, 0.11, 0.95, i % 2 ? 0x4c3a1e : 0x6d5028, 0.3 + (i - 1) * 0.1, 1.33 + (i === 1 ? 0.09 : 0), -0.04); },
  meat: (l, s) => { sp(l, s, 0.36, 0.22, 0.32, 0x9c3b2e, 0.3, 1.36, 0); sp(l, s, 0.38, 0.06, 0.12, 0xd9c49a, 0.3, 1.4, 0); },
  deer: (l, s) => {
    // big on purpose: from the default zoom a deer across someone's shoulders should read at a glance
    sp(l, s, 1.5, 0.36, 0.46, DEER_LIGHT, 0, 1.4, -0.02);             // the body, across both shoulders, wider than the mantle
    sp(l, s, 0.9, 0.06, 0.28, 0xe8dcc0, 0.05, 1.6, -0.02);            // the pale belly turned up catches the eye
    sp(l, s, 0.2, 0.06, 0.16, 0x9a2e22, -0.25, 1.61, 0.04);           // where the spear went in
    sp(l, s, 0.3, 0.3, 0.36, DEER_LIGHT, -0.9, 1.28, 0.12);           // the head, hanging off the left shoulder
    sp(l, s, 0.06, 0.42, 0.06, DEER_DARK, -1.0, 1.52, 0.2, 0, 0.5);   // antlers
    sp(l, s, 0.06, 0.42, 0.06, DEER_DARK, -0.82, 1.54, 0.24, 0, -0.3);
    sp(l, s, 0.11, 0.5, 0.11, DEER_DARK, 0.8, 1.16, 0.12); sp(l, s, 0.11, 0.5, 0.11, DEER_DARK, 0.8, 1.16, -0.14); // the legs, held
    sp(l, s, 0.14, 0.12, 0.08, 0xf2eee6, 0.78, 1.48, -0.24);          // the white tail
  },
  rabbits: (l, s) => {
    sp(l, s, 0.06, 0.06, 0.8, 0x5a3e24, -0.38, 1.3, 0);              // the cord over the left shoulder
    for (const z of [0.32, -0.32]) {
      sp(l, s, 0.28, 0.36, 0.26, RABBIT_C, -0.52, 1.06, z);             // hanging by the hind legs, clear of the mantle
      sp(l, s, 0.2, 0.16, 0.2, RABBIT_C, -0.52, 0.82, z);
      sp(l, s, 0.14, 0.08, 0.14, 0xf2eee6, -0.52, 1.27, z);            // white tails up
    }
  },
};
export const LOAD_KINDS = Object.keys(LOADS);
// setLoad(F, kind): a load from LOADS; any other kind goes to setCarry (in hand), null takes everything off
export function setLoad(F, kind) {
  kind = kind || null;
  if (F.loadKind === kind && F.loadKind !== undefined) return;
  if (F.loadCur) { F.loadCur.removeFromParent(); F.loadCur = null; }
  F.loadKind = kind;
  if (!kind || !LOADS[kind]) { setCarry(F, kind); return; }
  setCarry(F, null);
  const cache = F.loadCache ?? (F.loadCache = {});
  let item = cache[kind];
  if (!item) item = cache[kind] = mesh(cached(`load:${kind}:${F.s}`, (list) => { LOADS[kind](list, F.s); return list; }));
  F.group.add(item);
  F.loadCur = item;
}

// ---- the spear: held in the right hand, tip forward and up, on the group (shows at the far zoom) ----
// (the shaft is peeled ash, paler than the grass and the earth it flies over, so it reads against them; 2026-11-16)
const spearGeo = (s) => cached(`spear:${s}`, (l) => {
  sp(l, s, 0.08, 0.08, 1.9, 0xd6b98a, 0, 0, 0);
  sp(l, s, 0.13, 0.1, 0.28, 0x3b3631, 0, 0, 1.08);  // a dark flint head
  sp(l, s, 0.12, 0.12, 0.09, 0xc0532f, 0, 0, 0.86); // a red binding below it
  return l;
});
// the spear's true thickness and the distance from its middle to its tip, in metres (hunting.js, hunt-look.js)
export const SPEAR_DIMS = (s = T.PERSON_SCALE) => ({ thick: 0.08 * s, tip: 1.22 * s, half: 1.1 * s });

// ---- the bow and its arrows (2026-11-16; the director: "the hunt: spear and bow. weapon we should be able to see
// fly and hit") ----
// An arrow: a pale shaft, a dark stone head, two fletching vanes (one red, so it reads), along +z with the tip in front.
const arrowGeo = (s) => cached(`arrow:${s}`, (l) => {
  sp(l, s, 0.025, 0.025, 0.74, 0xe6d6aa, 0, 0, 0);
  sp(l, s, 0.05, 0.03, 0.08, 0x3b3631, 0, 0, 0.4);    // the head
  sp(l, s, 0.005, 0.07, 0.13, 0xc0532f, 0, 0.02, -0.3); // the fletching
  sp(l, s, 0.07, 0.005, 0.13, 0xf2eee6, 0.02, 0, -0.3);
  return l;
});
export const ARROW_DIMS = (s = T.PERSON_SCALE) => ({ thick: 0.025 * s, tip: 0.44 * s, half: 0.4 * s });
export function makeArrow(s = T.PERSON_SCALE) { return mesh(arrowGeo(s)); }
// A short hunting bow, upright along y with its belly to +z and the string behind (toward the archer), as long as a
// grown-up's leg and trunk; it has a nocked arrow on it (shown while drawing).
const BOW_C = 0x6d4a26, STRING_C = 0xe8dcc0;
const bowGeo = (s) => cached(`bow:${s}`, (l) => {
  sp(l, s, 0.06, 0.26, 0.07, 0x4a3018, 0, 0, 0);                       // the grip, bound in dark hide
  sp(l, s, 0.045, 0.36, 0.05, BOW_C, 0, 0.3, -0.02, -0.12);            // the upper limb, bending back toward the archer
  sp(l, s, 0.035, 0.22, 0.04, BOW_C, 0, 0.56, -0.09, -0.42);
  sp(l, s, 0.045, 0.36, 0.05, BOW_C, 0, -0.3, -0.02, 0.12);            // the lower limb
  sp(l, s, 0.035, 0.22, 0.04, BOW_C, 0, -0.56, -0.09, 0.42);
  sp(l, s, 0.012, 1.32, 0.012, STRING_C, 0, 0, -0.14);                 // the string
  return l;
});
const quiverGeo = (s) => cached(`quiver:${s}`, (l) => {
  sp(l, s, 0.17, 0.52, 0.15, 0x7a5230, 0, 0, 0);                       // the leather quiver
  sp(l, s, 0.19, 0.05, 0.17, 0x4a3018, 0, 0.24, 0);                    // its rim
  sp(l, s, 0.05, 0.16, 0.05, 0xf2eee6, -0.04, 0.33, 0.02); sp(l, s, 0.05, 0.13, 0.05, 0xc0532f, 0.04, 0.31, -0.02); // fletchings showing
  return l;
});

export function setTool(F, kind) {
  kind = kind || null;
  if ((F.toolKind ?? null) === kind) return;
  if (F.tool) { F.tool.removeFromParent(); F.tool = null; }
  if (F.toolExtra) { F.toolExtra.removeFromParent(); F.toolExtra = null; }
  F.toolKind = kind;
  if (kind === 'spear') F.tool = mesh(spearGeo(F.s));
  else if (kind === 'bow') {
    F.tool = mesh(bowGeo(F.s));
    const nock = mesh(arrowGeo(F.s)); // the arrow on the string while drawing (bodies.js POSE_MORE.loose shows it)
    nock.position.set(0.03 * F.s, 0, -0.18 * F.s); nock.visible = false; nock.userData.noPick = true;
    F.tool.add(nock); F.tool.userData.nock = nock;
    // a quiver on the back, slung a little across, the fletchings showing above the shoulder
    F.toolExtra = mesh(quiverGeo(F.s));
    F.toolExtra.position.set(0.14 * F.s, 1.12 * F.s, -0.26 * F.s); F.toolExtra.rotation.set(-0.25, 0, -0.35);
    F.toolExtra.userData.noPick = true;
    F.group.add(F.toolExtra);
  } else return;
  F.tool.userData.noPick = true;
  toolHome(F);
  F.group.add(F.tool);
}
// the weapon's resting hold: a spear in the right hand, along the body, tip forward and up; a bow in the left
// hand, upright at the side
export function toolHome(F) {
  const t = F.tool;
  if (!t) return;
  if (F.toolKind === 'bow') {
    t.position.set(-0.43 * F.s, 0.86 * F.s, 0.1 * F.s);
    t.rotation.set(0.12, 0, 0.08);
    if (t.userData.nock) t.userData.nock.visible = false;
    return;
  }
  t.position.set(0.42 * F.s, 0.92 * F.s, 0.18 * F.s);
  t.rotation.set(-0.42, 0, 0);
}
// a spear in flight or on the ground (hunting.js moves it)
export function makeSpear(s = T.PERSON_SCALE) { return mesh(spearGeo(s)); }

// ---- hunting poses (applyPose looks here first) ----
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
const POSE_MORE = {
  // risen from the grave (resurrect.js): from lying on the side, as the dead lie (people.js), up onto the feet, slowly,
  // a hand to the ground, then the other; fully upright at RISE_S (1.6 s)
  rise(F, t) {
    const k = Math.max(0, Math.min(1, t / 1.6)), e = k * k * (3 - 2 * k), up = 1 - e;
    F.fig.rotation.z = up * Math.PI / 2;
    const L = F.armL.rotation, R = F.armR.rotation;
    L.x = -0.3 * up; L.z = 0.2 + 0.9 * up; R.x = -0.6 * up; R.z = -0.1;
    F.legL.rotation.x = -0.9 * up; F.legR.rotation.x = -0.4 * up;
    return { lean: 0.25 * Math.sin(e * Math.PI), figY: 0.25 * up };
  },
  // standing, bewildered: arms a little out, palms up, a slow sway (resurrect.js turns them to look about)
  wonder(F, t) {
    F.fig.rotation.z = 0;
    const L = F.armL.rotation, R = F.armR.rotation, s = Math.sin(t * 1.5);
    L.x = -0.35 + s * 0.1; L.z = 0.45; R.x = -0.35 - s * 0.1; R.z = -0.45;
    return { lean: -0.06, figY: 0 };
  },
  // a throw: arm back and up for half a second, then the whip forward (hunting.js lets go at THROW_AT)
  throw(F, t) {
    const L = F.armL.rotation, R = F.armR.rotation;
    const up = Math.min(1, t / 0.5), go = Math.max(0, Math.min(1, (t - 0.5) / 0.14));
    R.x = go > 0 ? lerp(-2.7, -0.9, go) : lerp(-0.5, -2.7, up); R.z = -0.18;
    L.x = -1.3; L.z = 0.15;
    F.legL.rotation.x = -0.45; F.legR.rotation.x = 0.3;
    if (F.tool) { F.tool.position.set(0.4 * F.s, lerp(0.92, 1.75, up) * F.s, lerp(0.18, -0.35, up) * F.s); F.tool.rotation.set(-0.12, 0, 0); }
    return { lean: go > 0 ? lerp(-0.18, 0.3, go) : -0.18 * up, figY: 0 };
  },
  // the bow: raised and drawn for half a second (the arrow on the string, the right hand back by the face), then
  // loosed (hunting.js lets the arrow go at THROW_AT, as a spear is let go): the string hand flies back and out,
  // the bow arm holds a moment and comes down
  loose(F, t) {
    const L = F.armL.rotation, R = F.armR.rotation, s = F.s;
    const up = Math.min(1, t / 0.5), gone = t >= 0.5, after = Math.max(0, Math.min(1, (t - 0.5) / 0.3)), down = Math.max(0, Math.min(1, (t - 0.85) / 0.2));
    L.x = lerp(lerp(-0.5, -1.57, up), -0.6, down); L.z = 0.06;
    if (!gone) { R.x = lerp(-0.4, -1.5, up); R.z = lerp(0, 0.85, up); }
    else { R.x = lerp(-1.45, -0.9, after); R.z = lerp(-0.55, -0.15, after); }
    F.legL.rotation.x = -0.32; F.legR.rotation.x = 0.26;
    const tool = F.tool;
    if (tool && F.toolKind === 'bow') {
      // the bow at arm's length in front of the left shoulder, upright, canted a little
      tool.position.set(lerp(-0.43, -0.3, up) * s, lerp(0.86, 1.2, up) * s, lerp(0.1, 0.58, up) * s);
      tool.rotation.set(lerp(0.12, 0, up), 0, lerp(0.08, 0.16, up));
      if (down > 0) { tool.position.y = lerp(1.2, 0.95, down) * s; tool.position.z = lerp(0.58, 0.3, down) * s; }
      const nock = tool.userData.nock;
      if (nock) { nock.visible = up > 0.25 && !gone; nock.position.z = lerp(-0.18, -0.36, up) * s; }
    }
    return { lean: gone ? lerp(0.08, 0.02, after) : 0.06 * up, figY: 0 };
  },
  // a short jab with the spear
  thrust(F, t) {
    const L = F.armL.rotation, R = F.armR.rotation, j = Math.max(0, Math.sin(t * 7));
    R.x = -1.2 - j * 0.4; L.x = -1.1 - j * 0.3; R.z = -0.1; L.z = 0.1;
    F.legL.rotation.x = -0.4;
    if (F.tool) { F.tool.position.set(0.25 * F.s, 1.0 * F.s, (0.4 + j * 0.5) * F.s); F.tool.rotation.set(-0.05, 0, 0); }
    return { lean: 0.2 + j * 0.15, figY: 0 };
  },
  // frozen low in the grass, watching
  crouch(F, t) {
    const L = F.armL.rotation, R = F.armR.rotation, s = Math.sin(t * 2) * 0.04;
    R.x = -0.7; L.x = -0.5 + s; R.z = -0.1; L.z = 0.15;
    F.legL.rotation.x = -0.9; F.legR.rotation.x = 0.4;
    return { lean: 0.5, figY: -0.22 * F.s };
  },
  // kneeling over a kill
  butcher(F, t) {
    const L = F.armL.rotation, R = F.armR.rotation, s = Math.sin(t * 4);
    L.x = -0.9 + s * 0.3; R.x = -1.0 - s * 0.35; L.z = 0.25; R.z = -0.25;
    F.legL.rotation.x = F.legR.rotation.x = -1.4;
    return { lean: 0.55, figY: -0.36 * F.s };
  },
  // the back end of a carcass on a pole, both hands up on it
  shoulder(F) {
    const L = F.armL.rotation, R = F.armR.rotation;
    L.x = R.x = -2.6; L.z = 0.2; R.z = -0.2;
    return { lean: 0.06, figY: 0 };
  },
};
export const POSE_NAMES_HUNT = Object.keys(POSE_MORE);

// ---- two people carrying a deer slung from a pole between their shoulders: one free mesh ----
export function makePoleCarry(s = T.PERSON_SCALE) {
  const g = new THREE.Group();
  const pole = mesh(cached(`pole:${s}`, (l) => { sp(l, s, 0.07, 0.07, 1, 0x7a5a32, 0, 0, 0); return l; }));
  const deer = mesh(cached(`poledeer:${s}`, (l) => {
    // hanging under the pole by its tied legs, belly up
    sp(l, s, 0.46, 0.38, 1.2, DEER_LIGHT, 0, -0.42, 0);
    sp(l, s, 0.26, 0.04, 0.9, 0xe8dcc0, 0, -0.22, 0);   // the pale belly, turned up to the sky
    for (const z of [0.42, -0.42]) for (const x of [0.09, -0.09]) sp(l, s, 0.07, 0.3, 0.07, DEER_DARK, x, -0.13, z);
    sp(l, s, 0.26, 0.28, 0.32, DEER_LIGHT, 0, -0.62, 0.74);  // the head hangs low at the front
    sp(l, s, 0.06, 0.3, 0.06, DEER_DARK, -0.09, -0.84, 0.82); sp(l, s, 0.06, 0.3, 0.06, DEER_DARK, 0.09, -0.84, 0.82);
    sp(l, s, 0.14, 0.05, 0.1, 0x9a2e22, 0.1, -0.22, -0.12);
    sp(l, s, 0.06, 0.06, 1.9, 0x8a6638, 0.12, 0.05, 0.1);   // the two spears ride along the pole
    sp(l, s, 0.1, 0.08, 0.24, 0x3b3631, 0.12, 0.05, 1.12);
    return l;
  }));
  g.add(pole, deer);
  return { group: g, pole, deer };
}

// ---- sleeping out: flat on the back on a hide mat, a blanket to the chest, breathing slowly ----
// (indoor sleepers are hidden; the dead fall on their side with no mat, so the two never look alike)
const bedGeo = (s, dye) => cached(`bed:${s}:${dye}`, (l) => {
  sp(l, s, 0.86, 0.05, 2.0, 0xb89468, 0, 0.025, 0.02);            // the hide mat
  sp(l, s, 0.92, 0.04, 0.12, 0x8d6c46, 0, 0.03, 1.0);             // its rolled foot end
  sp(l, s, 0.42, 0.1, 0.22, 0xe2d6bc, 0, 0.09, -0.66);            // a rolled pillow under the head
  return l;
});
const blanketGeo = (s, dye) => cached(`blanket:${s}:${dye}`, (l) => {
  sp(l, s, 0.84, 0.4, 1.1, shade(dye, 0.7), 0, 0.25, 0.44);       // a blanket in the family's colour, darker
  sp(l, s, 0.86, 0.06, 0.14, shade(dye, 0.5), 0, 0.42, -0.06);    // its turned-down edge at the chest
  return l;
});
const SLEEP_Y = 0.29, SLEEP_Z = 0.9; // the body's lift onto the mat, and how far the feet sit past the middle
export function sleepPose(F, on, t, dye) {
  const fig = F.fig, far = F.far;
  if (!on) {
    if (!F.sleeping) return null;
    F.sleeping = false;
    fig.rotation.z = 0; fig.position.z = 0;
    far.rotation.x = 0; far.position.set(0, 0, 0);
    F.body.scale.z = 1;
    if (F.bed) F.bed.visible = false;
    return null;
  }
  const s = F.s;
  if (!F.bed || F.bedDye !== dye) {
    if (F.bed) F.bed.removeFromParent();
    F.bed = new THREE.Group();
    F.bedDye = dye;
    F.blanket = mesh(blanketGeo(s, dye));
    F.bed.add(mesh(bedGeo(s, dye)), F.blanket);
    F.group.add(F.bed);
  }
  F.sleeping = true;
  F.bed.visible = true;
  const br = Math.sin(t * 1.15);
  F.blanket.scale.y = 1 + br * 0.06;
  F.body.scale.z = 1 + br * 0.05;
  F.legL.rotation.x = F.legR.rotation.x = 0;
  F.armL.rotation.x = F.armR.rotation.x = 0.06; F.armL.rotation.z = 0.08; F.armR.rotation.z = -0.08;
  fig.rotation.z = 0;
  fig.position.z = SLEEP_Z * s;
  far.rotation.x = -Math.PI / 2; far.position.set(0, SLEEP_Y * s, SLEEP_Z * s);
  return { lean: -Math.PI / 2, figY: SLEEP_Y * s };
}

// ---- a small camp fire for people sleeping out: a ring of stones, two logs, a low flame ----
export function makeCampfire() {
  const g = new THREE.Group();
  const base = mesh(cached('campfire', (l) => {
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; part(l, 0.24, 0.16, 0.24, k % 2 ? 0x8a8478 : 0x6f6a60, Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5); }
    part(l, 0.7, 0.1, 0.12, 0x4c3a1e, 0, 0.07, 0, 0, 0); part(l, 0.12, 0.1, 0.7, 0x5e4524, 0, 0.12, 0);
    part(l, 0.5, 0.03, 0.5, 0x2a2420, 0, 0.02, 0);
    return l;
  }));
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.4), FIRE_MAT);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.22), FIRE_MAT2);
  a.position.y = 0.32; b.position.y = 0.46;
  a.userData.glow = 'camp'; // its pool of light at night (engine/lighting.js)
  g.add(base, a, b);
  return { group: g, a, b };
}
