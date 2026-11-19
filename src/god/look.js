// What is under the pointer, as one whole thing, for the inspector (the
// director, 2026-11-12: "i should be able to select trees, water bodies etc as
// well"). Read-only: it never writes a block, is never an act and never
// witnessed. look(px, py) returns one of
//   { kind: 'tree', name, shape, height, blocks: [[x, y, z, id]], x, y, z }
//   { kind: 'water', name ('Pond' | 'Lake' | 'River'), area, depthMax, depthMean, cells: [[x, z]], level, big }
//   { kind: 'bushes' | 'reeds', name, count, blocks, x, y, z }
//   { kind: 'rock', name, area, cells, top }
//   { kind: 'ground', name, height, x, z, top, cells: [[x, z]] }
// The water body is found as the Area tool's double-click finds it (every
// water column joined to the one clicked, four ways); a tree as Erase takes it
// (every tree block joined to its trunk and nearer it than to another trunk).
import { B, isCross } from '../world/blocks.js';
import { voxelRay } from '../view/pick.js';
import { SY, idx, inXZ, TREE_IDS, GROUND_Y } from '../edit/vox.js';
import { SURFACES, TREE_KINDS } from './tools.js';

const BODY_MAX = 40000, PATCH_MAX = 1500;
const ROCKS = new Set([B.ROCK, B.ROCK_DARK, B.STONE]);
const BUSHES = new Set([B.BUSH, B.BUSH_BARE]);
const blockName = (id) => SURFACES.find(([, , b]) => b === id)?.[1] ?? Object.entries(B).find(([, v]) => v === id)?.[0].toLowerCase().replace(/_/g, ' ') ?? 'ground';

export function makeLook(H) {
  const { ctx, L } = H;
  const { camera: C, pick, vox: V } = ctx;
  const W = V.W;
  const waterTopAt = (x, z) => { if (!inXZ(x, z)) return -1; for (let y = SY - 1; y >= 1; y--) if (W.data[idx(x, y, z)] === B.WATER) return y; return -1; };
  const depthAt = (x, z, top) => { let d = 0; for (let y = top; y >= 1 && W.data[idx(x, y, z)] === B.WATER; y--) d++; return d; };

  function water(cx, cz) {
    const seen = new Set(), q = [[cx, cz]], cells = [];
    let big = false, dsum = 0, dmax = 0, level = -1;
    while (q.length) {
      const [x, z] = q.pop(), k = x + z * 4096;
      if (seen.has(k) || !inXZ(x, z)) continue;
      seen.add(k);
      const t = waterTopAt(x, z);
      if (t < 0) continue;
      if (cells.length >= BODY_MAX) { big = true; break; }
      const d = depthAt(x, z, t);
      cells.push([x, z]); dsum += d; dmax = Math.max(dmax, d); level = Math.max(level, t);
      q.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
    if (!cells.length) return null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const w = x1 - x0 + 1, d = z1 - z0 + 1, area = cells.length;
    // a river is long and thin (it fills little of its box); a pond is small; the rest are lakes
    const fill = area / (w * d), long = Math.max(w, d) / Math.max(1, Math.min(w, d));
    const name = area < 80 ? 'Pond' : (fill < 0.35 && Math.max(w, d) > 24) || long > 4 ? 'River' : 'Lake';
    return { kind: 'water', name, area, depthMax: dmax, depthMean: Math.round((dsum / area) * 10) / 10, cells, level, big, x: (x0 + x1 + 1) / 2, z: (z0 + z1 + 1) / 2, w, d };
  }
  function tree(hit) {
    let tx = null, tz = null, ty = -1;
    if (hit.id === B.WOOD || hit.id === B.WOOD_BIRCH) {
      // down the trunk to where it stands
      let y = hit.y;
      while (y > 1 && (W.get(hit.x, y - 1, hit.z) === B.WOOD || W.get(hit.x, y - 1, hit.z) === B.WOOD_BIRCH)) y--;
      if (L.trees.trunkAt(hit.x, hit.z) === y) { tx = hit.x; tz = hit.z; ty = y; }
    }
    if (tx == null) {
      // a leaf or a root: the nearest trunk that reaches it
      let bd = Infinity;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const y = L.trees.trunkAt(hit.x + dx, hit.z + dz);
        if (y < 0 || hit.y < y - 1 || hit.y > y + 14) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; tx = hit.x + dx; tz = hit.z + dz; ty = y; }
      }
    }
    if (tx == null) return null;
    const blocks = L.trees.blocksOf(tx, ty, tz);
    if (!blocks.length) return null;
    let top = ty, r = 0, leafLo = Infinity, leafHi = -Infinity;
    const has = new Set(blocks.map((b) => b[3]));
    for (const [x, y, z, id] of blocks) {
      top = Math.max(top, y); r = Math.max(r, Math.hypot(x - tx, z - tz));
      if (id === B.LEAVES || id === B.LEAVES_DARK || id === B.LEAVES_BRIGHT) { leafLo = Math.min(leafLo, y); leafHi = Math.max(leafHi, y); }
    }
    const shape = has.has(B.WOOD_BIRCH) ? 'palm' : has.has(B.ROOTS) || r >= 3.5 ? 'wide' : has.has(B.LEAVES_BRIGHT) ? 'round'
      : !Number.isFinite(leafLo) ? null : leafHi - leafLo <= 1 && r <= 2.9 ? 'flat' : 'tall';
    const name = shape ? TREE_KINDS[shape] : 'A dead tree';
    return { kind: 'tree', name, shape, height: top - ty + 1, blocks, x: tx + 0.5, y: ty, z: tz + 0.5, trunk: blocks.filter((b) => b[3] === B.WOOD || b[3] === B.WOOD_BIRCH).length };
  }
  // a clump of plants: plant columns joined (eight ways) to the one clicked
  function plants(hit) {
    const reeds = hit.id === B.REED;
    const want = (id) => (reeds ? id === B.REED : (isCross(id) && id !== B.REED && id !== B.ROOTS) || BUSHES.has(id));
    const colPlant = (x, z) => {
      const g = V.groundTop(x, z);
      const out = [];
      for (let y = g + 1; y <= g + 3; y++) { const id = W.get(x, y, z); if (want(id)) out.push([x, y, z, id]); }
      return out;
    };
    const seen = new Set(), q = [[hit.x, hit.z]], blocks = [];
    let cols = 0;
    while (q.length && cols < PATCH_MAX) {
      const [x, z] = q.pop(), k = x + z * 4096;
      if (seen.has(k) || !inXZ(x, z)) continue;
      seen.add(k);
      const b = colPlant(x, z);
      if (!b.length) continue;
      blocks.push(...b); cols++;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) q.push([x + dx, z + dz]);
    }
    if (!blocks.length) return null;
    return { kind: reeds ? 'reeds' : 'bushes', name: reeds ? 'Reeds' : cols > 1 ? 'A clump of bushes' : 'A bush', count: cols, blocks, x: hit.x + 0.5, y: hit.y, z: hit.z + 0.5 };
  }
  // the same kind of bare rock joined to the column clicked
  function rock(cx, cz, id) {
    const seen = new Set(), q = [[cx, cz]], cells = [];
    while (q.length && cells.length < PATCH_MAX) {
      const [x, z] = q.pop(), k = x + z * 4096;
      if (seen.has(k) || !inXZ(x, z)) continue;
      seen.add(k);
      const g = V.groundTop(x, z);
      if (W.get(x, g, z) !== id || waterTopAt(x, z) >= 0) continue;
      cells.push([x, z]);
      q.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
    }
    return { kind: 'rock', name: id === B.STONE ? 'Stone' : id === B.ROCK_DARK ? 'Dark rock' : 'Rock', area: cells.length, cells, top: V.groundTop(cx, cz), x: cx + 0.5, z: cz + 0.5 };
  }

  const LK = {};
  LK.look = (px, py) => {
    const hit = voxelRay(W, C.ray(px, py), (id) => id !== B.AIR);
    if (hit) {
      if (TREE_IDS.has(hit.id)) { const t = tree(hit); if (t) return t; }
      if (hit.id === B.REED || BUSHES.has(hit.id) || (isCross(hit.id) && hit.id !== B.ROOTS)) { const p = plants(hit); if (p) return p; }
      if (hit.id === B.WATER) return water(hit.x, hit.z);
    }
    const g = pick.ground(px, py);
    if (!g || g.off) return null;
    if (g.water) return water(g.cx, g.cz);
    if (ROCKS.has(g.id)) return rock(g.cx, g.cz, g.id);
    return { kind: 'ground', name: blockName(g.id), id: g.id, height: g.top - GROUND_Y, top: g.top, x: g.cx + 0.5, z: g.cz + 0.5, cells: [[g.cx, g.cz]] };
  };
  return LK;
}
