// C. Fights: what a fight looks like on the map, beyond the people themselves
// (their poses and weapons are in bodies.js). Cheap and shared: every effect is
// one instanced draw with a fixed cap and preallocated state, nothing is made or
// freed per frame, and nothing here is a core entity (so nothing can be picked).
//   banners   a war band's pole with its clan's cloth, carried by the leader or
//             planted at home; it topples when its side breaks
//   dust      puffs kicked up by a marching band and over the melee
//   sparks    a short burst of pale chips where a blow lands (no blood)
//   flames    a field on fire, cell by cell, with smoke
//   mounds    a fresh grave by a home, where the dead were carried and buried
// Stage 3's battles against outside armies can drive the same calls.
import * as THREE from '../../vendor/three.module.js';
import { enhance } from '../world/shade.js';

const BANNERS = 8, DUST = 160, SPARKS = 48, FLAMES = 160, MOUNDS = 48;
const _c = new THREE.Color();
function coloured(geo, hex) {
  _c.setHex(hex);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return geo;
}
function merge(parts) {
  let verts = 0, ic = 0;
  for (const g of parts) { verts += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3), index = new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of parts) {
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
const box = (w, h, d, hex, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return coloured(g, hex); };

// a pole 4.6 high with a cross bar; the cloth hangs from the bar (white: tinted per banner by the clan's dye),
// big enough to read at the normal zoom, where a person is a dozen pixels
const POLE_GEO = merge([box(0.16, 4.6, 0.16, 0x6a4526, 0, 2.3, 0), box(1.6, 0.12, 0.12, 0x6a4526, 0.72, 4.42, 0), box(0.26, 0.26, 0.26, 0xd9c9a0, 0, 4.72, 0)]);
const CLOTH_GEO = merge([box(1.45, 1.6, 0.06, 0xffffff, 0.8, 3.56, 0), box(1.45, 0.18, 0.07, 0xd8d0c0, 0.8, 2.68, 0)]);
const MOUND_GEO = merge([box(1.1, 0.28, 1.7, 0x6b5236, 0, 0.14, 0), box(0.8, 0.12, 1.3, 0x7d6242, 0, 0.32, 0), box(0.22, 0.5, 0.14, 0x9a958a, 0, 0.55, -0.7)]);
const FLAME_GEO = merge([box(0.8, 0.9, 0.8, 0xe8531c, 0, 0.45, 0), box(0.5, 0.7, 0.5, 0xffb230, 0.08, 0.95, -0.05), box(0.3, 0.5, 0.3, 0xfff07a, -0.1, 1.3, 0.1)]);
const CUBE = new THREE.BoxGeometry(1, 1, 1);

export function makeFightLook(ctx) {
  const layer = ctx.layers.entities;
  const inst = (geo, mat, cap) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; m.userData.noPick = true; layer.add(m); return m; };
  const poles = inst(POLE_GEO, enhance(new THREE.MeshLambertMaterial({ vertexColors: true })), BANNERS);
  const cloths = inst(CLOTH_GEO, enhance(new THREE.MeshLambertMaterial({ vertexColors: true })), BANNERS);
  const dust = inst(CUBE, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), DUST);
  const sparks = inst(CUBE, new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), SPARKS);
  const flames = inst(FLAME_GEO, new THREE.MeshBasicMaterial({ vertexColors: true }), FLAMES);
  flames.userData.glow = 'flame'; // a burning field lights the ground round it at night (engine/lighting.js)
  const mounds = inst(MOUND_GEO, enhance(new THREE.MeshLambertMaterial({ vertexColors: true })), MOUNDS);
  for (const m of [cloths, dust]) { m.setColorAt(0, _c.setHex(0xffffff)); }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
  const groundY = (x, z) => { try { return ctx.vox.standY(Math.floor(x), Math.floor(z)); } catch { return 16; } };

  // ---------- banners: callers own the banner objects (one per side of a fight, made when it starts) ----------
  // b: { on, x, y, z, dye, fall (0 standing .. 1 on the ground), yaw, t }
  const banners = [];
  function banner(dye) { const b = { on: false, x: 0, y: 0, z: 0, dye, fall: 0, falling: false, yaw: 0, t: Math.random() * 9 }; banners.push(b); return b; }
  function dropBanner(b) { const i = banners.indexOf(b); if (i >= 0) banners.splice(i, 1); }

  // ---------- particles: fixed arrays, a ring buffer each ----------
  const D = { x: new Float32Array(DUST), y: new Float32Array(DUST), z: new Float32Array(DUST), vx: new Float32Array(DUST), vy: new Float32Array(DUST), vz: new Float32Array(DUST), t: new Float32Array(DUST), life: new Float32Array(DUST), s: new Float32Array(DUST), c: new Uint32Array(DUST), n: 0 };
  const P = { x: new Float32Array(SPARKS), y: new Float32Array(SPARKS), z: new Float32Array(SPARKS), vx: new Float32Array(SPARKS), vy: new Float32Array(SPARKS), vz: new Float32Array(SPARKS), t: new Float32Array(SPARKS), life: new Float32Array(SPARKS), n: 0 };
  for (let i = 0; i < DUST; i++) D.life[i] = 0;
  for (let i = 0; i < SPARKS; i++) P.life[i] = 0;
  // a puff of dust (colour: dry earth by default; smoke is grey)
  function puff(x, y, z, size = 0.5, color = 0xc8b48a, up = 0.6, spread = 0.7, life = 1.1) {
    const i = D.n; D.n = (D.n + 1) % DUST;
    D.x[i] = x + (Math.random() - 0.5) * spread; D.y[i] = y + 0.15; D.z[i] = z + (Math.random() - 0.5) * spread;
    D.vx[i] = (Math.random() - 0.5) * 0.8; D.vy[i] = up * (0.6 + Math.random() * 0.6); D.vz[i] = (Math.random() - 0.5) * 0.8;
    D.t[i] = 0; D.life[i] = life * (0.8 + Math.random() * 0.4); D.s[i] = size * (0.7 + Math.random() * 0.6); D.c[i] = color;
    dust.setColorAt(i, _c.setHex(color));
    if (dust.instanceColor) dust.instanceColor.needsUpdate = true;
  }
  // chips flying off a blow: pale, quick, no blood
  function spark(x, y, z, n = 6) {
    for (let k = 0; k < n; k++) {
      const i = P.n; P.n = (P.n + 1) % SPARKS;
      const a = Math.random() * 6.283;
      P.x[i] = x; P.y[i] = y; P.z[i] = z;
      P.vx[i] = Math.cos(a) * (1.5 + Math.random() * 2); P.vy[i] = 2 + Math.random() * 2.5; P.vz[i] = Math.sin(a) * (1.5 + Math.random() * 2);
      P.t[i] = 0; P.life[i] = 0.35 + Math.random() * 0.2;
    }
  }

  // ---------- a field on fire ----------
  // { cells: [[x, y, z, seed]], t, dur, x, z }
  const fires = [];
  function burn(field, dur = 16) {
    const seen = new Set();
    const cells = [];
    for (const s of field.steps ?? []) {
      if (s.x == null || s.z == null || seen.has(s.x * 4096 + s.z) || cells.length >= 60) continue;
      seen.add(s.x * 4096 + s.z);
      cells.push([s.x + 0.5, groundY(s.x + 0.5, s.z + 0.5), s.z + 0.5, cells.length * 1.7 + Math.random()]);
    }
    if (!cells.length) cells.push([field.mx ?? field.x, groundY(field.mx ?? field.x, field.mz ?? field.z), field.mz ?? field.z, 0]);
    const f = { cells, t: 0, dur, x: field.mx ?? cells[0][0], z: field.mz ?? cells[0][2] };
    fires.push(f);
    return f;
  }
  // ---------- graves ----------
  const graves = []; // { x, y, z, yaw, t }
  const GRAVE_S = 240;
  function grave(x, z, yaw = 0) {
    if (graves.length >= MOUNDS) graves.shift();
    graves.push({ x, y: groundY(x, z), z, yaw, t: 0 });
  }

  // ---------- each step ----------
  function tick(dt) {
    // banners
    let n = 0;
    for (const b of banners) {
      if (!b.on || n >= BANNERS) continue;
      b.t += dt;
      if (b.falling) b.fall = Math.min(1, b.fall + dt * 1.6);
      const tip = b.fall * 1.45;
      _e.set(tip, b.yaw, Math.sin(b.t * 2.1) * 0.03 * (1 - b.fall), 'YXZ'); _q.setFromEuler(_e);
      _p.set(b.x, b.y, b.z); _s.set(1, 1, 1);
      poles.setMatrixAt(n, _m.compose(_p, _q, _s));
      _e.set(tip, b.yaw + Math.sin(b.t * 3.3) * 0.18 * (1 - b.fall), 0, 'YXZ'); _q.setFromEuler(_e);
      cloths.setMatrixAt(n, _m.compose(_p, _q, _s));
      cloths.setColorAt(n, _c.setHex(b.dye));
      n++;
    }
    poles.count = cloths.count = n;
    if (n) { poles.instanceMatrix.needsUpdate = true; cloths.instanceMatrix.needsUpdate = true; if (cloths.instanceColor) cloths.instanceColor.needsUpdate = true; }
    // fires: flames over the cells, smoke rising
    let fl = 0;
    const now = performance.now() / 1000;
    for (let k = fires.length - 1; k >= 0; k--) {
      const f = fires[k];
      f.t += dt;
      if (f.t >= f.dur) { fires.splice(k, 1); continue; }
      const grow = Math.min(1, f.t / 3), fade = Math.min(1, (f.dur - f.t) / 4);
      const shown = Math.ceil(f.cells.length * grow);
      for (let i = 0; i < shown && fl < FLAMES; i++) {
        const [x, y, z, seed] = f.cells[i];
        const s = (0.75 + 0.3 * Math.sin(seed * 3.1)) * fade;
        if (s < 0.05) continue;
        const h = s * (0.8 + Math.sin(now * 11 + seed) * 0.18 + Math.sin(now * 23 + seed * 2) * 0.08);
        _p.set(x, y, z); _s.set(s, h, s); _q.setFromAxisAngle(UP, seed);
        flames.setMatrixAt(fl++, _m.compose(_p, _q, _s));
      }
      if (Math.random() < dt * 9 * fade) { const c = f.cells[Math.floor(Math.random() * f.cells.length)]; puff(c[0], c[1] + 1.2, c[2], 0.7, 0x6e6a66, 1.8, 0.4, 2.4); }
    }
    flames.count = fl;
    if (fl) flames.instanceMatrix.needsUpdate = true;
    // dust and smoke
    let dn = 0;
    for (let i = 0; i < DUST; i++) {
      if (D.life[i] <= 0) { _s.set(0, 0, 0); dust.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      D.t[i] += dt;
      if (D.t[i] >= D.life[i]) { D.life[i] = 0; dust.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      D.x[i] += D.vx[i] * dt; D.y[i] += D.vy[i] * dt; D.z[i] += D.vz[i] * dt;
      D.vy[i] *= 1 - dt * 0.8;
      const k = D.t[i] / D.life[i], s = D.s[i] * (0.6 + k * 1.2) * (1 - k * k);
      _p.set(D.x[i], D.y[i], D.z[i]); _s.set(s, s * 0.8, s); _q.identity();
      dust.setMatrixAt(i, _m.compose(_p, _q, _s));
      dn++;
    }
    dust.count = DUST;
    dust.visible = dn > 0;
    dust.instanceMatrix.needsUpdate = true;
    // sparks
    let sn = 0;
    for (let i = 0; i < SPARKS; i++) {
      if (P.life[i] <= 0) { sparks.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      P.t[i] += dt;
      if (P.t[i] >= P.life[i]) { P.life[i] = 0; sparks.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      P.vy[i] -= 12 * dt;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      const s = 0.3 * (1 - P.t[i] / P.life[i]) + 0.06;
      _p.set(P.x[i], P.y[i], P.z[i]); _s.set(s, s, s); _q.identity();
      sparks.setMatrixAt(i, _m.compose(_p, _q, _s));
      sn++;
    }
    sparks.count = SPARKS;
    sparks.visible = sn > 0;
    sparks.instanceMatrix.needsUpdate = true;
    // graves: settle, then stay a while and sink away
    let gn = 0;
    for (let k = graves.length - 1; k >= 0; k--) { const g = graves[k]; g.t += dt; if (g.t > GRAVE_S) graves.splice(k, 1); }
    for (const g of graves) {
      const k = Math.min(1, g.t / 1.2), sink = g.t > GRAVE_S - 10 ? (g.t - (GRAVE_S - 10)) / 10 : 0;
      _e.set(0, g.yaw, 0); _q.setFromEuler(_e); _p.set(g.x, g.y - sink * 0.6, g.z); _s.set(1, k * (1 - sink * 0.5), 1);
      mounds.setMatrixAt(gn++, _m.compose(_p, _q, _s));
    }
    mounds.count = gn;
    if (gn) mounds.instanceMatrix.needsUpdate = true;
  }
  return { banner, dropBanner, puff, spark, burn, grave, tick, groundY, fires, graves };
}
