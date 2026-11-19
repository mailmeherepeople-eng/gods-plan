// Console and test helpers for the landscape generator, never loaded by the
// game itself. `assess(world)` checks the rules every generated land must keep
// and estimates whether families could settle as it stands (a copy of the
// people's home-site test in sim/land.js hutSite, without huts, the stone or
// reservations). `survey(from, count)` runs that over many seeds in a spare
// world. From the console:
//   const A = await import('/src/world/genassess.js'); A.assess(game.world)
//   A.survey(1, 40)
import { WORLD } from '../config.js';
import { B, isCross, isSolid } from './blocks.js';
import { VoxelWorld } from './voxel.js';
import { generateWorld } from './generate.js';

const { SIZE_X: SX, SIZE_Y: SY, SIZE_Z: SZ, GROUND_Y: G } = WORLD;
const N = SX * SZ, S = SX * SZ;
const NOT_GROUND = new Set([B.WOOD, B.WOOD_BIRCH, B.LEAVES, B.LEAVES_DARK, B.LEAVES_BRIGHT, B.ROOTS, B.BUSH, B.BUSH_BARE, B.CROP]);
const SOILS = new Set([B.GRASS, B.GRASS_DRY, B.DIRT]);
// the people's numbers (sim/tune.js), copied so this file stands alone
const WATER_REACH = 22, BANK_GAP = 3, FLAT_GRASS_MIN = 45, FARM_LOOK = 12;

export function assess(world) {
  const d = world.data, top = new Int16Array(N), gid = new Uint8Array(N), wet = new Uint8Array(N), obst = new Uint8Array(N);
  const errors = [];
  let waterAir = 0, waterCells = 0, bedrock = 0, tooHigh = 0, steps = 0, cliffs = 0;
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const i = x + z * SX;
    if (d[i] !== B.STONE) bedrock++;
    let ground = 0, water = 0, lowObj = 99, g = 0;
    for (let y = Math.min(SY - 1, world.maxY); y >= 0; y--) {
      const id = d[i + y * S];
      if (id === B.AIR || isCross(id)) continue;
      if (id === B.WATER) {
        water++; waterCells++;
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ax, nz = z + az;
          if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) { waterAir++; continue; }
          const nid = d[nx + nz * SX + y * S];
          if (nid === B.AIR || isCross(nid)) waterAir++;
        }
        continue;
      }
      if (NOT_GROUND.has(id)) { lowObj = y; continue; }
      if (isSolid(id)) { ground = y; g = id; break; }
    }
    top[i] = ground; gid[i] = g; wet[i] = water; obst[i] = lowObj <= ground + 2 ? 1 : 0;
    if (ground > SY - 6) tooHigh++;
  }
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX - 1; x++) {
    const i = x + z * SX;
    for (const j of [i + 1, z < SZ - 1 ? i + SX : -1]) {
      if (j < 0 || wet[i] || wet[j]) continue;
      const s = Math.abs(top[i] - top[j]);
      if (s >= 2) steps++;
      if (s >= 3) cliffs++;
    }
  }
  if (waterAir) errors.push(`${waterAir} water faces open to air`);
  if (bedrock) errors.push(`${bedrock} columns without stone at y 0`);
  if (tooHigh) errors.push(`${tooHigh} columns too high`);
  if (cliffs) errors.push(`${cliffs} land steps of 3 or more`);
  // the centre: level grass within 8
  const cx = SX / 2, cz = SZ / 2;
  let cLo = 99, cHi = -1, cBad = 0;
  for (let z = Math.floor(cz - 9); z <= cz + 9; z++) for (let x = Math.floor(cx - 9); x <= cx + 9; x++) {
    if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > 8) continue;
    const i = x + z * SX;
    cLo = Math.min(cLo, top[i]); cHi = Math.max(cHi, top[i]);
    if (gid[i] !== B.GRASS || wet[i] || obst[i] || d[i + (top[i] + 1) * S] !== B.AIR) cBad++;
    for (let y = top[i] + 1; y <= world.maxY; y++) if (d[i + y * S] !== B.AIR) { cBad++; break; }
  }
  if (cLo !== cHi || cBad) errors.push(`centre not clear (heights ${cLo}..${cHi}, ${cBad} cells not open grass)`);
  // edge band: no water within 30 of the edge
  let edgeWater = 0;
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    if (Math.min(x, z, SX - 1 - x, SZ - 1 - z) < 30 && wet[x + z * SX]) edgeWater++;
  }
  if (edgeWater) errors.push(`${edgeWater} water columns in the edge band`);

  // where could a family settle? (sim/land.js hutSite, without huts and reservations)
  const D = new Uint16Array(N);
  for (let i = 0; i < N; i++) D[i] = wet[i] ? 0 : 60000;
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const i = x + z * SX; let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + 3);
    if (z > 0) { v = Math.min(v, D[i - SX] + 3); if (x > 0) v = Math.min(v, D[i - SX - 1] + 4); if (x < SX - 1) v = Math.min(v, D[i - SX + 1] + 4); }
    D[i] = v;
  }
  for (let z = SZ - 1; z >= 0; z--) for (let x = SX - 1; x >= 0; x--) {
    const i = x + z * SX; let v = D[i];
    if (x < SX - 1) v = Math.min(v, D[i + 1] + 3);
    if (z < SZ - 1) { v = Math.min(v, D[i + SX] + 3); if (x < SX - 1) v = Math.min(v, D[i + SX + 1] + 4); if (x > 0) v = Math.min(v, D[i + SX - 1] + 4); }
    D[i] = v;
  }
  const wd = (i) => Math.min(250, Math.round(D[i] / 3));
  const slope = (x, z) => {
    const i = x + z * SX, h = top[i];
    let m = 0;
    if (x > 0) m = Math.max(m, Math.abs(top[i - 1] - h));
    if (x < SX - 1) m = Math.max(m, Math.abs(top[i + 1] - h));
    if (z > 0) m = Math.max(m, Math.abs(top[i - SX] - h));
    if (z < SZ - 1) m = Math.max(m, Math.abs(top[i + SX] - h));
    return m;
  };
  const good = new Uint8Array(N);
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const i = x + z * SX;
    good[i] = (gid[i] === B.GRASS || gid[i] === B.GRASS_DRY) && !wet[i] && !obst[i] && slope(x, z) <= 1 ? 1 : 0;
  }
  const grassAround = (x, z, r) => {
    let n = 0;
    for (let zz = Math.max(0, z - r); zz <= Math.min(SZ - 1, z + r); zz++) for (let xx = Math.max(0, x - r); xx <= Math.min(SX - 1, x + r); xx++) n += good[xx + zz * SX];
    return n;
  };
  const edgeOk = (x, z) => Math.min(x, z, SX - 1 - x, SZ - 1 - z) >= 28;
  const sites = [];
  for (let z = 3; z < SZ - 3; z += 3) for (let x = 3; x < SX - 3; x += 3) {
    if (!edgeOk(x, z)) continue;
    const w = wd(x + z * SX);
    if (w > WATER_REACH || w < BANK_GAP + 2) continue;
    let lo = 99, hi = -1, bad = false;
    for (let dz = -2; dz <= 2 && !bad; dz++) for (let dx = -2; dx <= 2; dx++) {
      const i = x + dx + (z + dz) * SX;
      if (wet[i] || obst[i] || !SOILS.has(gid[i])) { bad = true; break; }
      if (Math.abs(x + dx + 0.5 - cx) < 6 && Math.abs(z + dz + 0.5 - cz) < 6) { bad = true; break; } // the stone's ground
      lo = Math.min(lo, top[i]); hi = Math.max(hi, top[i]);
    }
    if (bad || hi - lo > 1) continue;
    const grass = grassAround(x, z, FARM_LOOK);
    if (grass < FLAT_GRASS_MIN) continue;
    let score = 2.2 * Math.max(-0.5, 1 - Math.abs(w - 7) / 15) + Math.min(1.4, grass / (FLAT_GRASS_MIN * 2.5));
    score += 0.6 * (1 - Math.min(1, Math.hypot(cx - x, cz - z) / 90));
    if (hi === lo) score += 0.25;
    if (score >= 1.6) sites.push([x, z]);
  }
  let land = 0, flatGood = 0;
  for (let i = 0; i < N; i++) if (!wet[i]) { land++; flatGood += good[i]; }
  return {
    ok: errors.length === 0, errors,
    sites: sites.length, firstSite: sites[0] ?? null,
    welcoming: sites.length >= 3,
    waterCells, steps2: steps, openGrass: Math.round((flatGood / land) * 100) / 100,
    heights: (() => { let a = 99, b = 0; for (let i = 0; i < N; i++) { a = Math.min(a, top[i]); b = Math.max(b, top[i]); } return [a - G, b - G]; })(),
    maxY: world.maxY,
  };
}

// many seeds in a spare world: the share that is welcoming as it stands, and any rule broken
export function survey(from = 1, count = 30) {
  const w = new VoxelWorld();
  const rows = [];
  for (let s = from; s < from + count; s++) {
    w.maxY = -1;
    const info = generateWorld(w, { seed: s, quiet: true, flat: false });
    const a = assess(w);
    rows.push({ seed: s, scenario: info.scenario, ms: info.ms, water: a.waterCells, sites: a.sites, welcoming: a.welcoming, trees: info.trees, maxY: a.maxY, heights: a.heights.join('..'), steps2: a.steps2, errors: a.errors.join('; ') });
  }
  const share = rows.filter((r) => r.welcoming).length / rows.length;
  const withWater = rows.filter((r) => r.water > 0).length / rows.length;
  const byScenario = {};
  for (const r of rows) { const o = (byScenario[r.scenario] ??= { n: 0, welcoming: 0 }); o.n++; if (r.welcoming) o.welcoming++; }
  return { share, withWater, byScenario, broken: rows.filter((r) => r.errors).length, avgMs: rows.reduce((a, r) => a + r.ms, 0) / rows.length, rows };
}
