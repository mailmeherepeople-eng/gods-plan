// Shaping the land: brushes that raise, lower and flatten (2026-11-14: every
// hill, mountain, cliff, plateau, pit and slope is made with these three; the
// stamps, the cliff line and Smooth are gone); ground paint; water (paint, dry,
// river, lake); scatter and erase. Every write goes through the voxel writer
// it is given: the pending preview's (pending.js) while the player works, so
// nothing real changes until the tick, or the real one (ctx.vox) for the cave.
//
// Ported from the source repo's dev/planner/landtools.js, with its behaviour:
// per-dab accumulation, soft (dithered) paint, water painted at the
// height where the stroke began, the river made like the source game's own
// (or a plain channel), the lake filled to a level above the ground clicked
// and refused if it would spill, scatter by kind and density. Changed: the
// brush's edge comes from its strength (profile below); erase takes everything
// that stands on the ground.
// Changed: every column write asks `allow(x, z)` first (edge mist, protected
// ground); lowering under water lets the water in (the planner left air under
// the water); a water stroke begun on water paints at that water's level (the
// planner used the bed under it); a lake that reaches the mist counts as one
// that runs off the edge; trees are plain blocks (trees.js); the history
// game's surfaces, tree names and the valley water level are left behind.
import { B, BLOCK_DEFS, isCross } from '../world/blocks.js';
import { SX, SY, SZ, inXZ, col, X0, Z0, X1, Z1, TREE_IDS, STRUCT_IDS } from '../edit/vox.js';
import { noise2 } from '../world/noise.js';
import { makeTrees } from './trees.js';
import { PLANT_MIX } from './tools.js';

export const MAX_TOP = SY - 2; // one block of headroom for anything standing on it
const smooth = (t) => t * t * (3 - 2 * t);
const FILL = new Set([B.AIR, B.WATER]);
const TREE_SOIL = new Set([B.GRASS, B.GRASS_DRY, B.DIRT, B.SNOWGRASS, B.SAND]);
const PLANT_SOIL = new Set([B.GRASS, B.GRASS_DRY, B.DIRT, B.SNOWGRASS, B.SAND, B.PATH]);
const BARE = new Set([B.PATH, B.SAND, B.ROCK, B.ROCK_DARK, B.STONE, B.DIRT]); // painting these clears the plants on top
// the planner's mixed scatter: sal, sal, sal, peepal, babul, palm, banyan (by shape here)
const MIXED = ['tall', 'tall', 'tall', 'round', 'flat', 'palm', 'wide'];
export const hashf = (x, z, k) => { let h = (x * 374761393 + z * 668265263 + k * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// The brush's weight at distance d from its centre, for size r and strength s (1 to 10). Strength is the edge's
// hardness as well as the speed: a fraction h = (s - 1) / 9 of the radius is a flat core at full weight, and the
// rest falls away smoothly to nothing at the rim. Strength 1: no core, a soft rounded dome (gentle hills, slopes);
// strength 5: the inner 44 percent full, then a short slope (a hill with a shoulder); strength 10: full weight to
// the rim, so the ground moves as one block with sheer sides (cliffs, mesas, shafts, terraces).
export const hardness = (s) => Math.max(0, Math.min(1, (s - 1) / 9));
export function profile(d, r, s) {
  if (d > r) return 0;
  const core = r * hardness(s);
  if (d <= core || r - core < 1e-6) return 1;
  return 1 - smooth((d - core) / (r - core));
}
// blocks a dab moves at the centre: strength 1 about 0.17 (3 blocks a second held still), 10 about 0.62 (10 a second)
export const rate = (s) => 0.12 + 0.05 * s;

// what an erase takes back to plain grass: the ground paints (farmland and crops only before time runs: then they
// are the people's fields)
const PAINTS = new Set([B.DIRT, B.SAND, B.ROCK, B.ROCK_DARK, B.STONE, B.PATH, B.GRASS_DRY, B.SNOWGRASS, B.FARMLAND]);
const SOLID_PLANTS = new Set([B.BUSH, B.BUSH_BARE]);

// `allow(x, z)`: may this column be touched (counts refusals itself); allow.why(x, z) says why not
// `V`: the voxel writer (groundTop, set, W.get, W.maxY): the pending preview's, or the real one
export function makeLand(core, allow, V = core.V) {
  const W = V.W;
  const L = {};
  const top = (x, z) => V.groundTop(x, z);
  const why = allow.why ?? (() => null);
  const trees = makeTrees(V);
  L.trees = trees;
  const rockFace = (x, y, z) => ((y + Math.floor(noise2(x * 0.21, z * 0.21) * 4)) % 4 === 0 ? B.ROCK_DARK : B.ROCK);

  // move a column's ground to `nt`, keeping its surface block (or `surf`)
  // fill: what the risen blocks under the top are made of (rock for a hard brush, so a cliff face reads as rock)
  L.setGround = (x, z, nt, surf = null, fill = null) => {
    if (!inXZ(x, z) || !allow(x, z)) return false;
    const cur = top(x, z);
    // near the standing stone raised ground keeps a slope it can be seen over (allow.cap, god/index.js)
    const cap = nt > cur ? allow.cap?.(x, z) : null;
    if (cap != null && nt > cap) { nt = Math.max(cur, cap); allow.capped = true; }
    nt = Math.max(1, Math.min(MAX_TOP, nt)); // y 0 is bedrock: never dug
    if (nt === cur && surf === null) return false;
    const t0 = W.get(x, cur, z);
    let s = surf ?? (t0 === B.DIRT || t0 === B.STONE ? B.GRASS : t0);
    if (nt > cur) {
      for (let y = cur + 1; y <= nt; y++) {
        const id = W.get(x, y, z);
        if (!FILL.has(id) && !isCross(id)) { nt = y - 1; break; } // a tree or a house stands here: stop under it
      }
      if (nt <= cur) return false;
      for (let y = cur; y < nt; y++) V.set(x, y, z, typeof fill === 'function' ? fill(x, y, z) : fill ?? (y >= nt - 2 ? B.DIRT : B.STONE));
      V.set(x, nt, z, s);
      const above = W.get(x, nt + 1, z);
      if (isCross(above) && above !== B.ROOTS) V.set(x, nt + 1, z, B.AIR);
    } else if (nt < cur) {
      const wet = W.get(x, cur + 1, z) === B.WATER; // under water: the hole fills with water
      for (let y = cur; y > nt; y--) { const id = W.get(x, y, z); if (TREE_IDS.has(id) || STRUCT_IDS.has(id)) continue; V.set(x, y, z, wet ? B.WATER : B.AIR); }
      const up = W.get(x, cur + 1, z);
      if (isCross(up) && up !== B.ROOTS) V.set(x, cur + 1, z, B.AIR);
      if (wet && s === B.GRASS) s = B.SAND;
      V.set(x, nt, z, s);
    } else V.set(x, nt, z, s);
    return true;
  };

  // ---------- brushes (planner: beginStroke, dab, endStroke) ----------
  let acc = null, start = null;
  L.beginStroke = (o, g) => {
    acc = new Float32Array(SX * SZ);
    start = { h: top(Math.floor(g.x), Math.floor(g.z)), n: 0, wl: L.levelAt(Math.floor(g.x), Math.floor(g.z)) };
  };
  L.endStroke = () => { const s = start; acc = null; start = null; return s; };
  const weight = (d, r, soft) => (d > r ? 0 : soft ? smooth(1 - d / Math.max(0.5, r)) : 1);
  // one dab of Raise, Lower or Flatten: each column under the brush gathers profile x rate, and moves a block for
  // each whole one it has (at most 2 a dab); Flatten moves a column a block toward the height where the stroke
  // began each time it gathers one (it gathers faster: levelling should keep up with the hand)
  L.dab = (mode, o, g) => {
    const r = o.size, s = o.strength;
    start.n++;
    const x0 = Math.floor(g.x - r), x1 = Math.ceil(g.x + r), z0 = Math.floor(g.z - r), z1 = Math.ceil(g.z + r);
    const step = rate(s), fstep = 0.25 + 0.075 * s;
    // a hard brush (strength 8 to 10) makes sheer faces: built of the land's own rock in uneven layers (the darker
    // rock in thin seams), so a cliff reads as rock, not as one flat brown wall
    const fill = s >= 8 ? rockFace : null;
    let n = 0;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!inXZ(x, z)) continue;
      const w = profile(Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z), r, s);
      if (!w) continue;
      const k = col(x, z), h = top(x, z);
      if (mode === 'raise' || mode === 'lower') {
        acc[k] += w * step;
        const steps = Math.floor(acc[k]);
        if (steps >= 1) { acc[k] -= steps; if (L.setGround(x, z, h + (mode === 'raise' ? 1 : -1) * Math.min(steps, 2), null, fill)) n++; }
      } else if (mode === 'flatten') {
        if (h === start.h) continue;
        acc[k] += w * fstep;
        if (acc[k] >= 1) { acc[k] = 0; if (L.setGround(x, z, h + Math.sign(start.h - h), null, fill)) n++; }
      }
    }
    return n;
  };

  // ---------- paint ----------
  L.paint = (id, o, g) => {
    const r = o.size;
    let n = 0;
    for (let z = Math.floor(g.z - r); z <= Math.ceil(g.z + r); z++) for (let x = Math.floor(g.x - r); x <= Math.ceil(g.x + r); x++) {
      if (!inXZ(x, z)) continue;
      const w = weight(Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z), r, o.soft);
      if (!w || (o.soft && hashf(x, z, start?.n ?? 0) > w + 0.15)) continue;
      const h = top(x, z);
      if (W.get(x, h + 1, z) === B.WATER || !allow(x, z)) continue;
      if (id === -1) { // farmland with a crop on every other row
        V.set(x, h, z, B.FARMLAND);
        const up = W.get(x, h + 1, z);
        if (x % 2 === 0 && (up === B.AIR || isCross(up))) V.set(x, h + 1, z, B.CROP); else if (isCross(up) || up === B.CROP) V.set(x, h + 1, z, B.AIR);
      } else {
        V.set(x, h, z, id);
        const up = W.get(x, h + 1, z);
        if (up === B.CROP || (isCross(up) && up !== B.ROOTS && BARE.has(id))) V.set(x, h + 1, z, B.AIR);
      }
      n++;
    }
    return n;
  };

  // ---------- water ----------
  // Water takes what stands where it goes (the director, 2026-11-17: "when you draw water, everything there goes.
  // right now when we draw water, river, lake, the trees still remain. that is illogical and weird. water reshapes
  // the land completely"). Called before the water is made, with the columns that will be water (`wet`) and the
  // columns of its cut or sanded banks (`bank`). Where it will be water: every tree whose trunk stands there or
  // whose leaves hang over it (from above the leaves are all you see), every bush and every plant. On the banks:
  // the trees and bushes standing on them. Protected ground (the stone, homes, the mist) is left, as for any tool.
  const clearForWater = (wet, bank = []) => {
    const going = new Set(), trunks = [];
    const free = (x, z) => inXZ(x, z) && !why(x, z);
    const take = (t) => { if (!t) return; const k = `${t[0]},${t[2]}`; if (going.has(k) || !free(t[0], t[2])) return; going.add(k); trunks.push(t); };
    const plants = (x, z, all) => {
      const h = top(x, z);
      for (let y = h + 1; y <= Math.min(SY - 1, h + 3); y++) {
        const id = W.get(x, y, z);
        if (SOLID_PLANTS.has(id) || (all && isCross(id) && id !== B.ROOTS)) V.set(x, y, z, B.AIR);
      }
    };
    let n = 0;
    // leaves two trees share stay with the one left standing, so look again until nothing hangs over the water
    for (let pass = 0; pass < 4; pass++) {
      trunks.length = 0;
      for (const [x, z] of wet) {
        if (!free(x, z)) continue;
        const ty = trees.trunkAt(x, z);
        if (ty >= 0) take([x, ty, z]); else if (trees.canopyAt(x, z)) take(trees.ownerOf(x, z));
        if (!pass) plants(x, z, true);
      }
      if (!pass) for (const [x, z] of bank) {
        if (!free(x, z)) continue;
        const ty = trees.trunkAt(x, z);
        if (ty >= 0) take([x, ty, z]);
        plants(x, z, false);
      }
      if (!trunks.length) break;
      for (const [x, y, z] of trunks) n += trees.remove(x, y, z, going);
    }
    // and any leaf or branch still over the water after that is cut away
    for (const [x, z] of wet) {
      if (!free(x, z)) continue;
      for (let y = top(x, z) + 1; y <= Math.min(SY - 1, W.maxY); y++) if (TREE_IDS.has(W.get(x, y, z))) { V.set(x, y, z, B.AIR); n++; }
    }
    return n;
  };
  L.clearForWater = clearForWater;
  const waterCol = (x, z, level) => {
    if (!inXZ(x, z) || !allow(x, z)) return false;
    if (top(x, z) >= level) L.setGround(x, z, level - 1, B.SAND);
    const g2 = top(x, z);
    let n = 0;
    for (let y = g2 + 1; y <= level; y++) { const id = W.get(x, y, z); if (id === B.AIR || isCross(id)) { V.set(x, y, z, B.WATER); n++; } }
    for (let y = level + 1; y <= level + 2; y++) if (isCross(W.get(x, y, z))) V.set(x, y, z, B.AIR);
    return n > 0;
  };
  L.waterCol = waterCol;
  L.waterTop = (x, z) => { if (!inXZ(x, z)) return -1; for (let y = Math.min(SY - 1, W.maxY); y >= 1; y--) if (W.get(x, y, z) === B.WATER) return y; return -1; };
  L.levelAt = (x, z) => { const w = L.waterTop(x, z); return w >= 0 ? w : Math.max(2, top(x, z)); };
  L.water = (mode, o, g) => {
    const r = o.size;
    let n = 0;
    if (mode !== 'dry') {
      const wet = [];
      for (let z = Math.floor(g.z - r); z <= Math.ceil(g.z + r); z++) for (let x = Math.floor(g.x - r); x <= Math.ceil(g.x + r); x++) if (inXZ(x, z) && Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z) <= r) wet.push([x, z]);
      clearForWater(wet);
    }
    for (let z = Math.floor(g.z - r); z <= Math.ceil(g.z + r); z++) for (let x = Math.floor(g.x - r); x <= Math.ceil(g.x + r); x++) {
      if (!inXZ(x, z) || Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z) > r) continue;
      if (mode === 'dry') {
        const wt = L.waterTop(x, z);
        if (wt < 0 || !allow(x, z)) continue;
        for (let y = wt; y >= 1; y--) { if (W.get(x, y, z) !== B.WATER) continue; V.set(x, y, z, y === wt ? B.GRASS : B.DIRT); }
        n++;
      } else if (waterCol(x, z, start?.wl ?? L.levelAt(Math.floor(g.x), Math.floor(g.z)))) n++;
    }
    return n;
  };

  // samples every half metre along the points
  const sampleLine = (pts) => {
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
      for (let k = 0; k < n; k++) samples.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    samples.push(pts[pts.length - 1]);
    return samples;
  };
  // the lowest ground across the river's width at a sample (other water counts at its own level)
  const lowest = (x, z, hw) => {
    let lo = 99;
    for (let dz = -Math.ceil(hw); dz <= hw; dz++) for (let dx = -Math.ceil(hw); dx <= hw; dx++) {
      const cx = Math.floor(x + dx), cz = Math.floor(z + dz);
      if (!inXZ(cx, cz)) continue;
      const wt = L.waterTop(cx, cz);
      lo = Math.min(lo, wt >= 0 ? wt + 1 : top(cx, cz));
    }
    return lo;
  };
  // a river along points, its surface stepping down as it goes, never up. With banks: made as the source game
  // makes its own (world/terrain.js buildBase): a ragged edge, a sand bed a block shallower at its sides, sand
  // banks 2.5 wide one block above the water, the ground behind them no more than two above it, the water a block
  // below the lowest ground it runs through, reeds here and there. Without: a plain channel, as the planner's.
  // 2026-11-15: the river is painted with a finger, which may go up the slope as well as down: it is made from its
  // higher end, so its water steps down the way the land falls instead of cutting a trench uphill
  L.river = (pts, width, depth, banks = true) => (banks ? riverWithBanks(pts, width, depth) : plainRiver(pts, width, depth));
  const downhill = (samples, hw) => {
    if (samples.length > 1 && lowest(samples[samples.length - 1][0], samples[samples.length - 1][1], hw) > lowest(samples[0][0], samples[0][1], hw)) samples.reverse();
    return samples;
  };
  function plainRiver(pts, width, depth) {
    const hw = width / 2, samples = downhill(sampleLine(pts), hw);
    let level = 99;
    const levels = samples.map(([x, z]) => { level = Math.max(1 + depth, Math.min(level, lowest(x, z, hw))); return level; });
    const done = new Map();
    let n = 0;
    {
      const wetK = new Map(), bankK = new Map();
      for (const [x, z] of samples) for (let dz = -Math.ceil(hw + 2); dz <= hw + 2; dz++) for (let dx = -Math.ceil(hw + 2); dx <= hw + 2; dx++) {
        const cx = Math.floor(x + dx), cz = Math.floor(z + dz);
        if (!inXZ(cx, cz)) continue;
        const d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z), k = col(cx, cz);
        if (d <= hw) wetK.set(k, [cx, cz]); else if (d <= hw + 2) bankK.set(k, [cx, cz]);
      }
      for (const k of wetK.keys()) bankK.delete(k);
      clearForWater([...wetK.values()], [...bankK.values()]);
    }
    samples.forEach(([x, z], i) => {
      const lv = levels[i];
      for (let dz = -Math.ceil(hw + 2); dz <= hw + 2; dz++) for (let dx = -Math.ceil(hw + 2); dx <= hw + 2; dx++) {
        const cx = Math.floor(x + dx), cz = Math.floor(z + dz), d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z), k = col(cx, cz);
        if (!inXZ(cx, cz)) continue;
        const prev = done.get(k);
        if (d <= hw) {
          if (prev && prev.bed && prev.lv <= lv) continue;
          done.set(k, { bed: true, lv });
          L.setGround(cx, cz, Math.max(1, lv - depth), B.SAND);
          if (waterCol(cx, cz, lv)) n++;
        } else if (d <= hw + 2 && !prev) { done.set(k, { bed: false }); const h = top(cx, cz); if (h > lv + 1) L.setGround(cx, cz, lv + 1); }
      }
    });
    return { n, from: levels[0], to: levels[levels.length - 1] };
  }
  function riverWithBanks(pts, width, depth) {
    const hw = width / 2, samples = downhill(sampleLine(pts), hw), reach = Math.ceil(hw + 5.5);
    let level = 99;
    const levels = samples.map(([x, z]) => { level = Math.max(1 + depth, Math.min(level, lowest(x, z, hw) - 1)); return level; });
    const cells = new Map();
    samples.forEach(([x, z], i) => {
      for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
        const cx = Math.floor(x + dx), cz = Math.floor(z + dz);
        if (!inXZ(cx, cz)) continue;
        const d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z);
        if (d > hw + 5.3) continue;
        const k = col(cx, cz), c = cells.get(k);
        if (!c || d < c.d) cells.set(k, { x: cx, z: cz, d, lv: levels[i] });
      }
    });
    let n = 0;
    {
      const wet = [], bank = [];
      for (const c of cells.values()) {
        const edge = hw + (noise2(c.x * 0.2, c.z * 0.2) - 0.5) * 1.2;
        if (c.d < edge) wet.push([c.x, c.z]); else if (c.d < edge + 2.5 && L.waterTop(c.x, c.z) < 0) bank.push([c.x, c.z]);
      }
      clearForWater(wet, bank);
    }
    for (const c of cells.values()) {
      const edge = hw + (noise2(c.x * 0.2, c.z * 0.2) - 0.5) * 1.2;
      const h = top(c.x, c.z);
      if (c.d >= edge && L.waterTop(c.x, c.z) >= 0) continue; // a lake it runs into keeps its shore
      if (c.d < edge) {
        if (!allow(c.x, c.z)) continue;
        L.setGround(c.x, c.z, Math.max(1, c.lv - depth + (c.d > edge * 0.6 && depth > 1 ? 1 : 0)), B.SAND);
        for (let y = c.lv + 1; y < SY; y++) if (W.get(c.x, y, c.z) === B.WATER) V.set(c.x, y, c.z, B.AIR);
        if (waterCol(c.x, c.z, c.lv)) n++;
      } else if (c.d < edge + 2.5) {
        if (!L.setGround(c.x, c.z, Math.min(h, c.lv + 1), B.SAND)) continue;
        const t = top(c.x, c.z);
        if (W.get(c.x, t + 1, c.z) === B.AIR && hashf(c.x, c.z, 7) < 0.1) V.set(c.x, t + 1, c.z, B.REED);
      } else if (c.d < edge + 4.5) { if (h > c.lv + 2) L.setGround(c.x, c.z, c.lv + 2); }
    }
    return { n, from: levels[0], to: levels[levels.length - 1] };
  }

  // ---------- lake (planner: fill a basin to `level` from (x, z), refused if it would run off or flood too far) ----------
  L.lake = (x, z, level, cap = 4000) => {
    const seen = new Uint8Array(SX * SZ), list = [];
    const q = [[Math.floor(x), Math.floor(z)]];
    while (q.length) {
      const [cx, cz] = q.pop();
      if (!inXZ(cx, cz)) return { spill: 'edge' };
      const k = col(cx, cz);
      if (seen[k]) continue;
      seen[k] = 1;
      if (top(cx, cz) >= level) continue;
      const r = why(cx, cz);
      if (r === 'mist') return { spill: 'edge' };
      if (r) return { spill: r };
      list.push([cx, cz]);
      if (list.length > cap) return { spill: 'size', n: list.length };
      q.push([cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]);
    }
    clearForWater(list);
    for (const [cx, cz] of list) waterCol(cx, cz, level);
    return { n: list.length, level };
  };

  // ---------- lake, dug for the player (the director, 2026-11-15: "Selecting lake and putting it on the ground, the
  // depth should be cut for them and water filled") ----------
  // A bowl `size` across (a slightly ragged shore), `depth` deep in the middle and at least one block at the shore.
  // Its water is level, at the lowest ground round its rim, so nothing stands above the land; on a slope the higher
  // side is cut back to it in steps a person can climb (two blocks of sand a block above the water, then up one block
  // for every block out, up to EASE blocks behind the shore). Trees standing in it go. Refused only where the game refuses anything (allow.why: the mist, the
  // standing stone, homes): { refused, x, z }.
  const EASE = 8;    // how far behind the shore a high side is cut back (above that a steep hill keeps its face)
  L.bowl = (x, z, size, depth) => {
    const R = Math.max(1.5, size / 2), reach = Math.ceil(R + 1.5 + EASE);
    const all = new Map(), wet = new Map();
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
      const d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z);
      const edge = R + (R >= 4 ? (noise2(cx * 0.18, cz * 0.18) - 0.5) * 1.6 : 0);
      if (d > edge + 1.5 + EASE) continue;
      if (!inXZ(cx, cz)) { if (d < edge + 1.5) return { refused: 'mist', x: cx, z: cz }; continue; }
      const c = { x: cx, z: cz, d, edge, k: col(cx, cz) };
      all.set(c.k, c);
      if (d < edge) wet.set(c.k, c);
    }
    if (!wet.size) { const c = all.get(col(Math.floor(x), Math.floor(z))); if (c) wet.set(c.k, c); }
    // the rim: every cell beside the water (8 ways), not in it
    const rim = new Map();
    for (const c of wet.values()) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const k = col(c.x + dx, c.z + dz);
      if (!wet.has(k) && all.has(k)) rim.set(k, all.get(k));
    }
    for (const c of [...wet.values(), ...rim.values()]) { const r = why(c.x, c.z); if (r) return { refused: r, x: c.x, z: c.z }; }
    let level = 99;
    for (const c of rim.values()) { const wt = L.waterTop(c.x, c.z); level = Math.min(level, wt >= 0 ? wt : top(c.x, c.z)); }
    if (level === 99) level = top(Math.floor(x), Math.floor(z));
    level = Math.max(1 + depth, Math.min(MAX_TOP - 1, level));
    // trees standing in the water or on the cut banks go
    const going = new Set(), trunks = [];
    const clearTree = (c) => { const ty = trees.trunkAt(c.x, c.z); if (ty < 0) return; const k = `${c.x},${c.z}`; if (!going.has(k)) { going.add(k); trunks.push([c.x, ty, c.z]); } };
    // the banks to cut: a high side steps back from the shore
    const cuts = [];
    for (const c of all.values()) {
      if (wet.has(c.k)) continue;
      const out = Math.max(0, c.d - c.edge);
      const target = level + 1 + Math.max(0, Math.floor(out - 1));
      if (top(c.x, c.z) <= target) continue;
      clearTree(c);
      cuts.push([c, target, out < 2 ? B.SAND : null]);
    }
    for (const c of wet.values()) clearTree(c);
    for (const [tx, ty, tz] of trunks) trees.remove(tx, ty, tz, going);
    clearForWater([...wet.values()].map((c) => [c.x, c.z]), cuts.map(([c]) => [c.x, c.z])); // leaves over the water, bushes, plants
    let n = 0;
    for (const [c, target, surf] of cuts) if (L.setGround(c.x, c.z, target, surf)) n++;
    for (const c of wet.values()) {
      const t = Math.min(1, c.d / Math.max(1, c.edge));
      const bed = Math.max(1, level - Math.max(1, Math.round(depth * (1 - t * t))));
      if (top(c.x, c.z) > bed) L.setGround(c.x, c.z, bed, B.SAND);
      for (let y = level + 1; y < SY; y++) if (W.get(c.x, y, c.z) === B.WATER) V.set(c.x, y, c.z, B.AIR);
      if (waterCol(c.x, c.z, level)) n++;
    }
    return { n, level, cells: wet.size };
  };

  // ---------- scatter and erase ----------
  // what: 'trees' (mixed), 'tree.<kind>', or a plant mix name
  L.scatter = (what, o, g) => {
    const r = o.size, area = Math.PI * r * r;
    if (what === 'trees' || what.startsWith('tree.')) {
      const tries = Math.max(1, Math.round(area * o.density * 0.012));
      let made = 0;
      for (let i = 0; i < tries; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        const x = Math.floor(g.x + Math.cos(a) * d), z = Math.floor(g.z + Math.sin(a) * d);
        if (x < X0 + 2 || z < Z0 + 2 || x > X1 - 3 || z > Z1 - 3) continue;
        const h = top(x, z);
        if (!TREE_SOIL.has(W.get(x, h, z)) || W.get(x, h + 1, z) === B.WATER) continue;
        if (trees.near(x, z, 3) || !allow(x, z)) continue;
        const kind = what === 'trees' ? MIXED[Math.floor(Math.random() * MIXED.length)] : what.slice(5);
        if (trees.place(x, h + 1, z, 3, kind)) made++;
      }
      return made;
    }
    const ids = o.only ? [o.only] : PLANT_MIX[what] ?? PLANT_MIX.tallgrass;
    let n = 0;
    const sow = (x, z) => {
      const h = top(x, z), t = W.get(x, h, z);
      if (W.get(x, h + 1, z) !== B.AIR || BLOCK_DEFS[t]?.cross || !PLANT_SOIL.has(t) || !allow(x, z)) return;
      V.set(x, h + 1, z, ids[Math.floor(Math.random() * ids.length)]);
      n++;
    };
    // The director, 2026-11-12: no loose tufts on open ground ("if it is green it is grass"); tufts only
    // "clump together to make bushes". So everything but reeds is sown as tight clumps with clear ground between.
    if (what !== 'reeds') {
      const clumps = Math.random() < Math.min(1, r * r * o.density * 0.02) ? Math.max(1, Math.round(r * r * o.density * 0.012)) : 0;
      for (let c = 0; c < clumps; c++) {
        const a = Math.random() * 6.2832, d = Math.sqrt(Math.random()) * r;
        const cx = Math.floor(g.x + Math.cos(a) * d), cz = Math.floor(g.z + Math.sin(a) * d), cr = 1 + Math.random() * 0.9;
        for (let z = cz - 2; z <= cz + 2; z++) for (let x = cx - 2; x <= cx + 2; x++) {
          if (!inXZ(x, z) || Math.hypot(x - cx, z - cz) > cr || Math.random() > 0.85) continue;
          sow(x, z);
        }
      }
      return n;
    }
    for (let z = Math.floor(g.z - r); z <= Math.ceil(g.z + r); z++) for (let x = Math.floor(g.x - r); x <= Math.ceil(g.x + r); x++) {
      if (!inXZ(x, z) || Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z) > r || Math.random() > o.density * 0.35) continue;
      sow(x, z);
    }
    return n;
  };
  // Erase (2026-11-14: "erase anything that is on the screen and replace it with flat ground"): trees (by trunk or
  // canopy), bushes, reeds and every plant, and the ground paints back to plain grass; water dries to ground at its
  // surface (2026-11-15: Dry land left the Water tools); otherwise the land keeps its height. o.fields: farmland and crops go too (only before time runs: then they are the people's).
  // Animals and caves are the preview's to take (pending.js), not blocks.
  L.erase = (o, g) => {
    const r = o.size;
    let n = 0;
    const going = new Set(), trunks = [];
    // a tree goes when the brush touches its trunk OR any of its canopy (from above the leaves are all you see;
    // FAULTS 2026-11-13: dragging over the leaves did nothing)
    const take = (t) => { if (!t) return; const k = `${t[0]},${t[2]}`; if (going.has(k) || !allow(t[0], t[2])) return; going.add(k); trunks.push(t); };
    for (let z = Math.floor(g.z - r); z <= Math.ceil(g.z + r); z++) for (let x = Math.floor(g.x - r); x <= Math.ceil(g.x + r); x++) {
      if (!inXZ(x, z) || Math.hypot(x + 0.5 - g.x, z + 0.5 - g.z) > r || !allow(x, z)) continue;
      const ty = trees.trunkAt(x, z);
      if (ty >= 0) take([x, ty, z]); else if (trees.canopyAt(x, z)) take(trees.ownerOf(x, z));
      const h = top(x, z);
      for (let y = h + 1; y <= Math.min(SY - 1, h + 3); y++) {
        const id = W.get(x, y, z);
        if (((isCross(id) && id !== B.ROOTS) && (o.fields || id !== B.CROP)) || SOLID_PLANTS.has(id) || (id === B.CROP && o.fields)) { V.set(x, y, z, B.AIR); n++; }
      }
      const t = W.get(x, h, z);
      if (PAINTS.has(t) && (o.fields || t !== B.FARMLAND) && W.get(x, h + 1, z) !== B.WATER) {
        const up = W.get(x, h + 1, z);
        if (t !== B.FARMLAND || up !== B.CROP || o.fields) { V.set(x, h, z, B.GRASS); n++; }
      }
      // water goes too, back to dry ground at its surface (what Dry land did, 2026-11-15)
      const wt = L.waterTop(x, z);
      if (wt >= 0) { for (let y = wt; y >= 1; y--) { if (W.get(x, y, z) !== B.WATER) continue; V.set(x, y, z, y === wt ? B.GRASS : B.DIRT); } n++; }
    }
    for (const [x, y, z] of trunks) n += trees.remove(x, y, z, going);
    return n;
  };

  // things standing on changed ground step up or down with it (not people or
  // animals: the simulation moves those itself; not paths: they lie in the ground)
  L.resettle = (x0, z0, x1, z1) => {
    const moves = [];
    for (const e of core.list) {
      if (!e || e.cells || !e.objs?.length || e.deleted || e.removed) continue;
      if (e.cat === 'zone' || e.cat === 'person' || e.cat === 'animal' || e.cat === 'path') continue;
      if (e.x < x0 || e.x > x1 || e.z < z0 || e.z > z1) continue;
      const y = core.standY(e, e.x, e.z);
      if (Math.abs(y - e.y) > 0.01) moves.push({ e, x: e.x, z: e.z, y });
    }
    if (moves.length) core.moveMany(moves);
  };
  return L;
}
