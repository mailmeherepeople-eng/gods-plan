// The voxel edit layer: every block a god tool writes goes through here, so it
// can be recorded for undo and remeshed at once. Also the block-template
// machinery that lets a tree, a hut or a standing stone move like an object
// (cut, heal the ground, paste).
// Ported from the source repo's dev/planner/vox.js. Removed: columnDiff (the
// blueprint's terrain summary). Changed: out-of-world ground is GROUND_Y (was
// the source's water level); STRUCT_IDS lists only blocks this game has.
import { WORLD } from '../config.js';
import { B, BLOCK_DEFS, isCross, isSolid } from '../world/blocks.js';

export const SY = WORLD.SIZE_Y, GROUND_Y = WORLD.GROUND_Y;
// Bounds x X0..X1-1, z Z0..Z1-1. They are live bindings so that a grown world
// (the source repo's worldsize.js, not ported yet) can move them with
// setLayout() and every module that imports them sees the new layout. Bounds
// may run below zero, so nothing already placed changes its coordinates. Every
// index goes through idx(), which knows the origin. Today: 0..WORLD_SIZE.
export let SX = WORLD.SIZE_X, SZ = WORLD.SIZE_Z, X0 = 0, Z0 = 0, X1 = SX, Z1 = SZ;
export const idx = (x, y, z) => (x - X0) + (z - Z0) * SX + y * SX * SZ;
export const inB = (x, y, z) => x >= X0 && x < X1 && y >= 0 && y < SY && z >= Z0 && z < Z1;
export const inXZ = (x, z) => x >= X0 && x < X1 && z >= Z0 && z < Z1;
export const col = (x, z) => (x - X0) + (z - Z0) * SX; // a column's slot in an SX * SZ array
export const ofIdx = (i) => { const y = Math.floor(i / (SX * SZ)), r = i - y * SX * SZ, z = Math.floor(r / SX); return [r - z * SX + X0, y, z + Z0]; };
export const bounds = () => ({ x0: X0, z0: Z0, x1: X1, z1: Z1 });
export function setLayout(b) { X0 = b.x0; Z0 = b.z0; X1 = b.x1; Z1 = b.z1; SX = X1 - X0; SZ = Z1 - Z0; }
// undo keys that do not depend on the layout (a resize must not scramble the history)
export const gkey = (x, y, z) => (x + 4096) + (z + 4096) * 8192 + y * 67108864;
export const ofG = (g) => { const y = Math.floor(g / 67108864), r = g - y * 67108864, z = Math.floor(r / 8192); return [r - z * 8192 - 4096, y, z - 4096]; };

// what a tree is made of
export const TREE_IDS = new Set([B.WOOD, B.WOOD_BIRCH, B.LEAVES, B.LEAVES_DARK, B.LEAVES_BRIGHT, B.ROOTS]);
// what people build with (a block of these above the ground is a structure)
export const STRUCT_IDS = new Set([B.WATTLE, B.THATCH, B.MUDBRICK, B.CHARCOAL, B.CONCRETE, B.BRICK]);
export const ROCK_IDS = new Set([B.ROCK, B.ROCK_DARK, B.STONE, B.STRATA_D]);
const NOT_GROUND = new Set([...TREE_IDS, ...STRUCT_IDS, B.BUSH, B.BUSH_BARE, B.WATER, B.CROP]);

export function makeVox(G) {
  const W = G.world;
  const data = () => W.data;
  let rec = null; // the open transaction: flat [idx, old, new, ...]

  const V = {
    W,
    get: (x, y, z) => W.get(x, y, z),
    // one write, recorded when a transaction is open
    set(x, y, z, id) {
      if (!inB(x, y, z)) return;
      const i = idx(x, y, z), old = W.data[i];
      if (old === id) return;
      if (rec) rec.push(gkey(x, y, z), old, id);
      W.set(x, y, z, id);
      V.onCell?.(i, old, id);
    },
    begin() { rec = []; },
    end() { const r = rec; rec = null; return r ?? []; },
    get recording() { return !!rec; },
    // undo / redo a recorded diff
    applyDiff(diff, forward) {
      const d = W.data;
      if (forward) for (let k = 0; k < diff.length; k += 3) setG(diff[k], diff[k + 2]);
      else for (let k = diff.length - 3; k >= 0; k -= 3) setG(diff[k], diff[k + 1]);
      void d;
    },
    flush() { G.mesher.flush(Infinity); },
    // the ground a thing stands on: the highest solid block that is not a
    // tree, a building, a bush or water (a thing under a canopy stands on the
    // grass, not the leaves). -1 if none.
    groundTop(x, z) {
      x = Math.floor(x); z = Math.floor(z);
      if (x < X0 || z < Z0 || x >= X1 || z >= Z1) return GROUND_Y;
      for (let y = Math.min(SY - 1, W.maxY); y >= 0; y--) {
        const id = W.data[idx(x, y, z)];
        if (id === B.AIR || isCross(id) || NOT_GROUND.has(id)) continue;
        if (isSolid(id)) return y;
      }
      return 0;
    },
    // where something stands at (x, z): one above the ground
    standY(x, z) { return V.groundTop(x, z) + 1; },
    // the top of the water column at (x, z), or -1
    waterTop(x, z) {
      x = Math.floor(x); z = Math.floor(z);
      for (let y = SY - 1; y >= 0; y--) { const id = W.get(x, y, z); if (id === B.WATER) return y; if (id !== B.AIR && !isCross(id)) return -1; }
      return -1;
    },
    surface(x, z) { // the visible top block (for colours, read-outs)
      x = Math.floor(x); z = Math.floor(z);
      for (let y = SY - 1; y >= 0; y--) { const id = W.get(x, y, z); if (id !== B.AIR) return { y, id }; }
      return { y: 0, id: B.AIR };
    },
    snapshot() { return W.data.slice(); },
  };
  function setG(g, id) { // a cell outside the world now (a resize undone later) is kept in the history, not written
    const [x, y, z] = ofG(g);
    if (!inB(x, y, z)) return;
    const i = idx(x, y, z), old = W.data[i];
    W.set(x, y, z, id);
    V.onCell?.(i, old, id);
  }
  void data;
  return V;
}

// ---------- the difference between two worlds, compactly ----------
// [[idx, id], ...] runs encoded as [start, id, count] where consecutive
// indices share an id. Kept for a future save format (not used yet).
export function diffWorld(base, cur) {
  const out = [];
  let start = -1, id = -1, n = 0;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] === base[i]) { if (n) { out.push(start, id, n); n = 0; } continue; }
    if (n && i === start + n && cur[i] === id) { n++; continue; }
    if (n) out.push(start, id, n);
    start = i; id = cur[i]; n = 1;
  }
  if (n) out.push(start, id, n);
  return out;
}
export function applyWorldDiff(world, runs) {
  for (let k = 0; k < runs.length; k += 3) {
    const s = runs[k], id = runs[k + 1], n = runs[k + 2];
    for (let i = s; i < s + n; i++) world.data[i] = id;
  }
}

export const blockName = (id) => Object.keys(B).find((k) => B[k] === id) ?? `#${id}`;
export const blockColor = (id, part = 'top') => {
  const c = BLOCK_DEFS[id]?.[part] ?? BLOCK_DEFS[id]?.top;
  if (!c) return [0.5, 0.5, 0.5];
  return BLOCK_DEFS[id]?.cross && BLOCK_DEFS[id].accent ? BLOCK_DEFS[id].accent : c;
};

// ---------- block templates ----------
// A template is [[dx, dy, dz, id, heal, force], ...] relative to an integer
// origin. heal: what the cell becomes when the thing is cut away (default
// air). force: the cell is written on paste whatever is there (a trench's air,
// a boulder's sunk foot); otherwise a paste only fills air and loose flora.
export function rotCell(dx, dz, q, fx, fz) {
  // rotate the cell centre about the anchor (fx, fz inside the origin cell)
  let cx = dx + 0.5 - fx, cz = dz + 0.5 - fz;
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) { const t = cx; cx = cz; cz = -t; } // +90 deg about +y (three.js)
  return [cx, cz];
}

// world cells of an entity's template at a given place and turn
export function cellsAt(e, x, y, z, q) {
  const out = [];
  const oy = Math.round(y) + (e.cellDy ?? 0);
  for (const c of e.cells) {
    const [rx, rz] = rotCell(c[0], c[2], q, e.fx, e.fz);
    out.push([Math.floor(x + rx), oy + c[1], Math.floor(z + rz), c[3], c[4] ?? B.AIR, !!c[5]]);
  }
  return out;
}

export function cutCells(V, cells, owner, ownerIdx) {
  for (const [x, y, z, id, heal] of cells) {
    if (!inB(x, y, z)) continue;
    const i = idx(x, y, z);
    if (owner && owner[i] !== ownerIdx) continue; // something else lives there now
    if (V.W.data[i] !== id) { if (owner) owner[i] = 0; continue; }
    V.set(x, y, z, heal);
    if (owner) owner[i] = 0;
  }
}
export function pasteCells(V, cells, owner, ownerIdx) {
  for (const [x, y, z, id, , force] of cells) {
    if (!inB(x, y, z)) continue;
    const cur = V.W.data[idx(x, y, z)];
    if (!force && cur !== B.AIR && !isCross(cur)) continue;
    V.set(x, y, z, id);
    if (owner) owner[idx(x, y, z)] = ownerIdx;
  }
}
