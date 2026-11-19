// Battles (stage 3): the battleground, "the Marches". A place of its own, never the home land (the director,
// 2026-11-14: "battle has to take place in a different arena ... or else the battles will destroy the land
// we create"). It is a second voxel world (world/voxel.js VoxelWorld) with its own chunk mesher and its own
// scene group, in the same look as home: the screen shows it instead of the home land by flipping three
// visibilities (main.js ctx.homeLand, ctx.layers.entities and statics, against this group), keeping the camera to
// its area (view/camera.js setArea) and moving the edge mist to its edges (renderer.setEdgeMist). Nothing is
// rebuilt or freed on a switch.
//
// The land: 96 x 64 blocks from a seed. Your hearth and camp on the left (on a low rise), the raiders' camp
// on the right, a river down the middle with two fords, a wood at the north and south edges. One battleground
// for the whole run: earthworks, scorch and graves stay from one battle to the next, and between battles the
// earthworks weather down (by TUNE weather). TUNE freshGround makes a new one each time.
import * as THREE from '../../vendor/three.module.js';
import { VoxelWorld } from '../world/voxel.js';
import { ChunkMesher } from '../world/mesher.js';
import { B, isSolid } from '../world/blocks.js';
import { WORLD } from '../config.js';
import { rng } from './words.js';
import { makeCampfire } from './bodies.js';
import { enhance } from '../world/shade.js';

export const AX0 = 8, AZ0 = 8, AW = 96, AD = 64; // where the battleground sits inside its own world
const GY = 15;
const MOUNDS = 200;

export function makeGround(ctx, T) {
  const W = new VoxelWorld();
  const group = new THREE.Group(); group.name = 'battleground'; group.visible = false;
  ctx.scene.add(group);
  const land = new THREE.Group(); group.add(land);
  const things = new THREE.Group(); group.add(things); // figures, rings, fire: the battle's own entities
  const mesher = new ChunkMesher(W, land);
  const top = new Int16Array(AW * AD), deep = new Uint8Array(AW * AD), wetA = new Uint8Array(AW * AD);
  const ci = (x, z) => { const cx = Math.floor(x) - AX0, cz = Math.floor(z) - AZ0; return cx < 0 || cz < 0 || cx >= AW || cz >= AD ? -1 : cz * AW + cx; };
  const G = { W, group, things, mesher, bounds: { x0: AX0, z0: AZ0, x1: AX0 + AW, z1: AZ0 + AD }, works: new Map(), graves: [], scars: new Set(), seed: 0, built: false, shown: false, battles: 0 };
  const midZ = AZ0 + AD / 2;
  // the river's line and its fords (the field routes the raiders through these)
  const riverX = (z) => AX0 + 56 + 2.5 * Math.sin((z - AZ0) * 0.16 + G.seed % 7);
  G.riverX = riverX;
  G.fords = [{ z: midZ - 6, half: 2.5 }, { z: midZ + 6, half: 2.5 }];
  G.hearth = { x: AX0 + 12.5, z: midZ + 0.5 };
  G.camp = { x: AX0 + 88.5, z: midZ + 0.5 };

  // ---------- building it ----------
  function col(x, z, h, topId = B.GRASS) {
    W.setRaw(x, 0, z, B.ROCK);
    for (let y = 1; y <= h; y++) W.setRaw(x, y, z, y === h ? topId : y >= h - 3 ? B.DIRT : B.ROCK);
    for (let y = h + 1; y < WORLD.SIZE_Y; y++) if (W.get(x, y, z) !== B.AIR) W.setRaw(x, y, z, B.AIR);
  }
  function tree(x, z, r) {
    const t = top[ci(x, z)];
    const hgt = 4 + Math.floor(r() * 3);
    for (let y = t + 1; y <= t + hgt; y++) W.setRaw(x, y, z, B.WOOD);
    const leaf = r() < 0.5 ? B.LEAVES : B.LEAVES_DARK;
    for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) > 3) continue;
      const y = t + hgt + dy;
      if (W.get(x + dx, y, z + dz) === B.AIR) W.setRaw(x + dx, y, z + dz, leaf);
    }
  }
  function build(seed) {
    G.seed = seed;
    const r = rng(seed);
    G.works.clear(); G.graves.length = 0; G.scars.clear();
    for (let x = AX0 - 2; x < AX0 + AW + 2; x++) for (let z = AZ0 - 2; z < AZ0 + AD + 2; z++) for (let y = 0; y < WORLD.SIZE_Y; y++) W.setRaw(x, y, z, B.AIR);
    const ph = r() * 9, pz = r() * 9;
    for (let z = AZ0; z < AZ0 + AD; z++) for (let x = AX0; x < AX0 + AW; x++) {
      // gentle swells, a low rise behind your hearth, the ground falling a little toward the river
      const sw = Math.sin((x - AX0) * 0.11 + ph) * 0.7 + Math.sin((z - AZ0) * 0.13 + pz) * 0.7;
      const rise = 2.6 * Math.exp(-(((x - (AX0 + 9)) / 9) ** 2 + ((z - midZ) / 14) ** 2));
      const bank = -1.2 * Math.exp(-(((x - riverX(z)) / 7) ** 2));
      const h = GY + Math.round(sw + rise + bank);
      const i = ci(x, z);
      top[i] = h; deep[i] = 0; wetA[i] = 0;
      col(x, z, h, r() < 0.04 ? B.GRASS_DRY : B.GRASS);
    }
    // the river: 3 wide and 2 deep, except at the fords (gravel, dry underfoot)
    for (let z = AZ0; z < AZ0 + AD; z++) {
      const rx = riverX(z);
      const ford = G.fords.some((f) => Math.abs(z - f.z) <= f.half);
      for (let x = Math.floor(rx - 2); x <= Math.ceil(rx + 2); x++) {
        const i = ci(x, z); if (i < 0) continue;
        const d = Math.abs(x + 0.5 - rx);
        if (d > 2.2) continue;
        const bed = GY - 2;
        if (ford) { col(x, z, GY - 1, B.SAND); top[i] = GY - 1; continue; }
        col(x, z, bed, B.SAND);
        for (let y = bed + 1; y <= GY - 1; y++) W.setRaw(x, y, z, B.WATER);
        top[i] = bed; deep[i] = 1; wetA[i] = 1;
      }
    }
    // a wood at the north and the south edge, between the camps
    for (const [cx, cz, n] of [[AX0 + 32, AZ0 + 12, 10], [AX0 + 72, AZ0 + AD - 12, 10], [AX0 + 44, AZ0 + AD - 10, 5]]) {
      for (let k = 0; k < n; k++) { const x = Math.floor(cx + (r() - 0.5) * 14), z = Math.floor(cz + (r() - 0.5) * 7); if (ci(x, z) >= 0 && !deep[ci(x, z)]) tree(x, z, r); }
    }
    // your hearth: a ring of stones; their camp: three hides on poles
    const hx = Math.floor(G.hearth.x), hz = Math.floor(G.hearth.z);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, x = Math.round(hx + Math.cos(a) * 2.6), z = Math.round(hz + Math.sin(a) * 2.6); W.setRaw(x, top[ci(x, z)] + 1, z, B.STONE); }
    for (const dz of [-6, 0, 6]) {
      const x0 = Math.floor(G.camp.x) + 2, z0 = Math.floor(G.camp.z) + dz;
      for (let dy = 1; dy <= 3; dy++) for (let dx = -(3 - dy); dx <= 3 - dy; dx++) for (let k = -1; k <= 1; k++) W.setRaw(x0 + dx, top[ci(x0, z0)] + dy, z0 + k, dy === 3 ? B.WATTLE : B.THATCH);
    }
    W.maxY = Math.max(W.maxY, GY + 12);
    for (let cx = Math.floor((AX0 - 2) / 16); cx <= Math.floor((AX0 + AW + 2) / 16); cx++) for (let cz = Math.floor((AZ0 - 2) / 16); cz <= Math.floor((AZ0 + AD + 2) / 16); cz++) W.dirty.add(`${cx},${cz}`);
    // the hearth fire, a real one
    if (!G.fire) { G.fire = makeCampfire(); things.add(G.fire.group); }
    G.fire.group.position.set(G.hearth.x, top[ci(hx, hz)] + 1, G.hearth.z);
    G.fire.group.scale.setScalar(1.6);
    G.built = true;
    drawGraves();
  }
  G.build = build;
  G.ensure = (seed) => { if (!G.built) build(seed); };

  // ---------- reading it ----------
  G.inside = (x, z) => ci(x, z) >= 0;
  G.top = (x, z) => { const i = ci(x, z); return i < 0 ? GY : top[i]; };
  G.standY = (x, z) => G.top(x, z) + 1 + (wetA[ci(x, z)] && !deep[ci(x, z)] ? 0 : 0);
  G.isDeep = (x, z) => { const i = ci(x, z); return i < 0 || deep[i] === 1; };
  G.isWet = (x, z) => { const i = ci(x, z); return i >= 0 && wetA[i] === 1; };

  // ---------- changing it: one layer at a time (the field moves the ground over about a second) ----------
  const key = (x, z) => `${x},${z}`;
  function work(x, z) {
    const k = key(x, z);
    let w = G.works.get(k);
    if (!w) { const i = ci(x, z); w = { x, z, b: top[i], h: 0, pond: false }; G.works.set(k, w); }
    return w;
  }
  const blocked = (x, z) => { const i = ci(x, z); if (i < 0 || deep[i]) return true; if (Math.hypot(x + 0.5 - G.hearth.x, z + 0.5 - G.hearth.z) < 3.2) return true; for (let y = top[i] + 1; y <= top[i] + 2; y++) { const id = W.get(x, y, z); if (id === B.WOOD || id === B.THATCH || id === B.STONE || id === B.WATTLE) return true; } return false; };
  G.canWork = (x, z) => !blocked(x, z);
  function unPond(w) {
    if (!w.pond) return;
    for (let y = w.b + w.h + 1; y <= w.b; y++) if (W.get(w.x, y, w.z) === B.WATER) W.set(w.x, y, w.z, B.AIR);
    w.pond = false; wetA[ci(w.x, w.z)] = 0;
  }
  // +1: one layer of earth up; -1: one layer dug out; returns false if it cannot be done
  G.layer = (x, z, d, maxH = 3) => {
    if (blocked(x, z)) return false;
    const w = work(x, z), i = ci(x, z);
    if (d > 0) {
      if (w.h >= maxH) return false;
      unPond(w);
      const y = w.b + w.h + 1;
      // a raised bank: a dark earth face under a pale top edge, so it reads on the green at phone zoom
      const below = W.get(x, y - 1, z); if (below === B.GRASS || below === B.GRASS_DRY || below === B.SAND) W.set(x, y - 1, z, w.h > 0 ? B.ROCK_DARK : B.DIRT);
      W.set(x, y, z, B.SAND); w.h++;
      for (let yy = y + 1; yy <= y + 2; yy++) { const id = W.get(x, yy, z); if (id && !isSolid(id)) W.set(x, yy, z, B.AIR); }
    } else {
      if (w.h <= -maxH || w.b + w.h <= 4) return false;
      const y = w.b + w.h;
      W.set(x, y, z, B.AIR);
      if (W.get(x, y + 1, z) && !isSolid(W.get(x, y + 1, z))) W.set(x, y + 1, z, B.AIR);
      w.h--;
      W.set(x, y - 1, z, B.CHARCOAL); // a trench's floor is dark: a slot in the green
    }
    top[i] = w.b + w.h;
    if (w.h === 0 && !w.pond) G.works.delete(key(x, z));
    return true;
  };
  // a pond: dig a layer and let water stand to the old ground level (wading slows; wet ground will not burn)
  G.pond = (x, z) => {
    if (blocked(x, z)) return false;
    const w = work(x, z);
    if (w.h > 0) { while (w.h > 0) G.layer(x, z, -1); }
    if (w.h === 0) G.layer(x, z, -1);
    const ww = G.works.get(key(x, z)); if (!ww) return false;
    for (let y = ww.b + ww.h + 1; y <= ww.b; y++) W.set(x, y, z, B.WATER);
    ww.pond = true; wetA[ci(x, z)] = 1;
    return true;
  };
  // back to the ground as it was (the enemy god's flatten)
  G.flatten = (x, z) => {
    const w = G.works.get(key(x, z)); if (!w) return false;
    unPond(w);
    while (w.h > 0) G.layer(x, z, -1); while (w.h < 0) G.layer(x, z, +1);
    return true;
  };
  G.workAt = (x, z) => G.works.get(key(Math.floor(x), Math.floor(z))) ?? null;
  // lava cooled by rain: a rock ridge stands where it ran (one layer, rock on top)
  G.rock = (x, z) => {
    if (!G.layer(x, z, +1, 3)) return false;
    const w = G.works.get(key(x, z)); if (!w) return false;
    W.set(x, w.b + w.h, z, B.ROCK);
    return true;
  };
  // scorched ground stays a while (dry grass); weathered away between battles
  G.scar = (x, z) => {
    const i = ci(x, z); if (i < 0 || wetA[i]) return;
    const y = top[i];
    if (W.get(x, y, z) === B.GRASS) { W.set(x, y, z, B.GRASS_DRY); G.scars.add(key(x, z)); }
  };
  // between battles: earthworks sink by half (ridges become low banks, trenches silt up), ponds drain to mud,
  // scorch greens over in about half the cells
  G.weather = (keep) => {
    for (const w of [...G.works.values()]) {
      if (w.pond) { unPond(w); }
      const want = Math.trunc(w.h * keep);
      while (w.h > want) G.layer(w.x, w.z, -1);
      while (w.h < want) G.layer(w.x, w.z, +1);
    }
    for (const k of [...G.scars]) { if (Math.random() < 0.5) { const [x, z] = k.split(',').map(Number); const y = top[ci(x, z)]; if (W.get(x, y, z) === B.GRASS_DRY) W.set(x, y, z, B.GRASS); G.scars.delete(k); } }
  };

  // ---------- graves (they stay) ----------
  const MOUND = (() => {
    const parts = [[1.1, 0.28, 1.7, 0x6b5236, 0, 0.14, 0], [0.8, 0.12, 1.3, 0x7d6242, 0, 0.32, 0], [0.22, 0.5, 0.14, 0x9a958a, 0, 0.55, -0.7]];
    const geos = parts.map(([w, h, d, c, x, y, z]) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); const col = new THREE.Color(c); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; });
    return geos;
  })();
  const mounds = new THREE.Group(); things.add(mounds);
  const mat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const moundInst = MOUND.map((g) => { const m = new THREE.InstancedMesh(g, mat, MOUNDS); m.count = 0; m.frustumCulled = false; m.userData.noPick = true; mounds.add(m); return m; });
  function drawGraves() {
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
    const list = G.graves.slice(-MOUNDS);
    list.forEach((g, i) => { _e.set(0, g.yaw, 0); _q.setFromEuler(_e); _p.set(g.x, G.standY(g.x, g.z), g.z); for (const m of moundInst) m.setMatrixAt(i, _m.compose(_p, _q, _s)); });
    for (const m of moundInst) { m.count = list.length; m.instanceMatrix.needsUpdate = true; }
  }
  G.grave = (x, z, yaw, name) => { G.graves.push({ x, z, yaw, name }); drawGraves(); };

  // ---------- showing it instead of home, and back ----------
  const homeBounds = () => ctx.camera?.bounds?.() ?? { x0: 0, z0: 0, x1: 300, z1: 300 };
  G.show = (on) => {
    if (on === G.shown) return;
    G.shown = on;
    group.visible = on;
    if (ctx.homeLand) ctx.homeLand.visible = !on;
    ctx.layers.entities.visible = !on;
    ctx.layers.statics.visible = !on;
    if (on) {
      mesher.flush(Infinity);
      ctx.camera.setArea?.({ ...G.bounds, inset: 8, over: 4 });
      ctx.renderer.setEdgeMist(G.bounds, 3);
    } else {
      ctx.camera.setArea?.(null);
      ctx.renderer.setEdgeMist(homeBounds(), WORLD.EDGE_FADE);
    }
  };
  // the mist closing in on what is shown (k 0 open .. 1 closed onto (cx, cz)): the switch's transition
  G.mist = (b, k, cx, cz, width) => {
    const s = Math.max(0, 1 - k);
    const x0 = cx - (cx - b.x0) * s, x1 = cx + (b.x1 - cx) * s, z0 = cz - (cz - b.z0) * s, z1 = cz + (b.z1 - cz) * s;
    ctx.renderer.setEdgeMist({ x0, z0, x1: Math.max(x1, x0 + 0.5), z1: Math.max(z1, z0 + 0.5) }, width);
  };
  G.homeBounds = homeBounds;
  G.tick = () => { if (G.shown && W.dirty.size) mesher.flush(6); };
  return G;
}
