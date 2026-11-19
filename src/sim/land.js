// What the land offers, as the people see it: a per-column map of the ground
// (height, block, water depth, things in the way), refreshed a few rows every
// frame and all at once after a god edit; how far every column is from fresh
// water; how much flat grass lies around any spot; site scores for homes,
// fields and the fire circle; and grid A* pathing with a per-frame budget.
// Nothing here moves or draws anything.
import { B, isCross, isSolid } from '../world/blocks.js';
import { idx, inXZ, X0, Z0, SX, SZ, SY, TREE_IDS, STRUCT_IDS } from '../edit/vox.js';
import { T } from './tune.js';
import { standHeight } from './move.js';

// reservation codes (what the sim has built or planned on a column)
export const RES = { NONE: 0, HUT: 1, FIELD: 2, FIRE: 3, STONE: 4, DOOR: 5, CAVE: 6 }; // CAVE: the hill over a cave's chamber (not walked over, never built on; its cutting is DOOR)
const NOT_GROUND = new Set([...TREE_IDS, ...STRUCT_IDS, B.BUSH, B.BUSH_BARE, B.CROP]);
const SOILS = new Set([B.GRASS, B.GRASS_DRY, B.DIRT]);

export function makeLand(ctx) {
  const W = ctx.world;
  const perf = ctx.perf?.count ? ctx.perf : null; // engine/perf.js counters
  const N = SX * SZ;
  const L = {
    top: new Int16Array(N),     // y of the ground block (vox.groundTop)
    gid: new Uint8Array(N),     // the ground block's id
    wet: new Uint8Array(N),     // water depth above the ground (0 = dry)
    obst: new Uint8Array(N),    // 1: something solid in the body space (trunk, wall, bush, crop)
    tree: new Uint8Array(N),    // 1: a tree stands here
    res: new Uint8Array(N),     // RES code: what the sim has built or planned here
    resOwner: new Int32Array(N),// the building id holding the reservation
    wdist: new Uint8Array(N),   // distance to the nearest water column, in blocks (capped 250)
    good: new Uint8Array(N),    // 1: flat dry grass, free: farmable
    sat: new Int32Array((SX + 1) * (SZ + 1)), // summed-area table of `good`
    treeSat: new Int32Array((SX + 1) * (SZ + 1)),
    version: 0, waterCount: 0, scanRow: 0, needFull: true, waterHash: -1,
  };
  const ci = (x, z) => (x - X0) + (z - Z0) * SX;
  L.ci = ci;
  L.cx = (i) => (i % SX) + X0;
  L.cz = (i) => Math.floor(i / SX) + Z0;
  L.inside = (x, z) => inXZ(x, z);

  function scanColumn(x, z) {
    const d = W.data;
    let ground = 0, water = 0, lowObj = 99, tree = 0, gid = B.AIR;
    for (let y = Math.min(SY - 1, W.maxY); y >= 0; y--) {
      const id = d[idx(x, y, z)];
      if (id === B.AIR || isCross(id)) continue;
      if (id === B.WATER) { water++; continue; }
      if (NOT_GROUND.has(id)) { lowObj = y; if (id === B.WOOD || id === B.WOOD_BIRCH) tree = 1; continue; }
      if (isSolid(id)) { ground = y; gid = id; break; }
    }
    const i = ci(x, z);
    L.top[i] = ground; L.gid[i] = gid; L.wet[i] = Math.min(255, water);
    L.obst[i] = lowObj <= ground + 2 ? 1 : 0;
    L.tree[i] = tree;
  }
  L.scanColumn = scanColumn;
  L.scanRect = (x0, z0, x1, z1) => {
    for (let z = Math.max(Z0, z0); z <= Math.min(Z0 + SZ - 1, z1); z++)
      for (let x = Math.max(X0, x0); x <= Math.min(X0 + SX - 1, x1); x++) scanColumn(x, z);
    derive();
  };

  const slope = (i) => {
    const x = i % SX, z = (i / SX) | 0, h = L.top[i];
    let m = 0;
    if (x > 0) m = Math.max(m, Math.abs(L.top[i - 1] - h));
    if (x < SX - 1) m = Math.max(m, Math.abs(L.top[i + 1] - h));
    if (z > 0) m = Math.max(m, Math.abs(L.top[i - SX] - h));
    if (z < SZ - 1) m = Math.max(m, Math.abs(L.top[i + SX] - h));
    return m;
  };
  L.slope = slope;

  // the water distance field (two-pass chamfer 3-4) and the summed-area tables
  // (one buffer kept, not a new one each pass: every cell is written again below, so nothing changes but the
  // garbage it made about once a second)
  const DBUF = new Uint16Array(N);
  function derive() {
    const D = DBUF;
    let count = 0, hash = 0;
    for (let i = 0; i < N; i++) {
      if (L.wet[i]) { D[i] = 0; count++; hash = (hash * 31 + i) | 0; } else D[i] = 60000;
    }
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
    for (let i = 0; i < N; i++) L.wdist[i] = Math.min(250, Math.round(D[i] / 3));
    L.waterCount = count; L.waterHash = hash;
    for (let i = 0; i < N; i++) {
      L.good[i] = (L.gid[i] === B.GRASS || L.gid[i] === B.GRASS_DRY) && !L.wet[i] && !L.obst[i] && !L.tree[i] &&
        (L.res[i] === RES.NONE || L.res[i] === RES.FIELD) && slope(i) <= 1 ? 1 : 0;
    }
    const S = L.sat, TS = L.treeSat, w = SX + 1;
    for (let z = 0; z < SZ; z++) {
      let row = 0, trow = 0;
      for (let x = 0; x < SX; x++) {
        row += L.good[x + z * SX]; trow += L.tree[x + z * SX];
        S[(x + 1) + (z + 1) * w] = S[(x + 1) + z * w] + row;
        TS[(x + 1) + (z + 1) * w] = TS[(x + 1) + z * w] + trow;
      }
    }
    L.version++;
  }
  L.derive = derive;
  // flat grass (or trees) in the square of half-size r around (x, z)
  const box = (S, x, z, r) => {
    const w = SX + 1;
    const x0 = Math.max(0, x - X0 - r), z0 = Math.max(0, z - Z0 - r);
    const x1 = Math.min(SX, x - X0 + r + 1), z1 = Math.min(SZ, z - Z0 + r + 1);
    if (x1 <= x0 || z1 <= z0) return 0;
    return S[x1 + z1 * w] - S[x0 + z1 * w] - S[x1 + z0 * w] + S[x0 + z0 * w];
  };
  L.grassAround = (x, z, r) => box(L.sat, x, z, r);
  L.treesAround = (x, z, r) => box(L.treeSat, x, z, r);

  L.fullScan = () => {
    for (let z = Z0; z < Z0 + SZ; z++) for (let x = X0; x < X0 + SX; x++) scanColumn(x, z);
    derive(); L.needFull = false;
  };
  // a few rows a frame, so the map is never more than half a second stale
  L.tick = () => {
    if (L.needFull) { L.fullScan(); return; }
    for (let k = 0; k < 12; k++) {
      const z = Z0 + L.scanRow;
      for (let x = X0; x < X0 + SX; x++) scanColumn(x, z);
      L.scanRow = (L.scanRow + 1) % SZ;
      if (L.scanRow === 0) derive();
    }
  };
  L.waterAt = (x, z) => inXZ(x, z) && L.wet[ci(x, z)] > 0;
  L.wdistAt = (x, z) => (inXZ(x, z) ? L.wdist[ci(x, z)] : 250);
  L.topAt = (x, z) => (inXZ(x, z) ? L.top[ci(x, z)] : 15);

  // the nearest water column to (x, z) within r, and a dry cell beside it to stand on
  L.nearestWater = (x, z, r = 40) => {
    x = Math.floor(x); z = Math.floor(z);
    let best = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const wx = x + dx, wz = z + dz;
      if (!inXZ(wx, wz) || !L.wet[ci(wx, wz)]) continue;
      const d = dx * dx + dz * dz;
      if (d >= bd) continue;
      // a dry neighbour to stand on
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const sx = wx + ax, sz = wz + az;
        if (!inXZ(sx, sz)) continue;
        const j = ci(sx, sz);
        if (L.wet[j] || L.obst[j] || L.res[j] === RES.HUT) continue;
        bd = d; best = { x: wx, z: wz, sx, sz };
        break;
      }
    }
    return best;
  };

  // ---------- reservations ----------
  L.reserve = (cells, code, owner) => { for (const [x, z] of cells) if (inXZ(x, z)) { const i = ci(x, z); L.res[i] = code; L.resOwner[i] = owner; } };
  L.release = (owner) => { for (let i = 0; i < N; i++) if (L.resOwner[i] === owner && L.res[i]) { L.res[i] = 0; L.resOwner[i] = 0; } };
  const freeAround = (x0, z0, x1, z1, gap, allow) => {
    for (let z = z0 - gap; z <= z1 + gap; z++) for (let x = x0 - gap; x <= x1 + gap; x++) {
      if (!inXZ(x, z)) return false;
      const r = L.res[ci(x, z)];
      if (r && !(allow && allow.has(r))) return false;
    }
    return true;
  };

  // ---------- site scores ----------
  // A home: a 5 x 5 hut centred on (cx, cz). Returns { ok, score, why, wd }.
  // `ctxInfo` = { huts: [{x, z}], stone: {x, z}, protectedAt(x, z) }
  L.hutSite = (cx, cz, info) => {
    const why = (w) => ({ ok: false, score: 0, why: w });
    if (ctx.edgeClear(cx + 0.5, cz + 0.5) < 0.75) return why('edge');
    let lo = 99, hi = -1, sandy = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!inXZ(x, z)) return why('edge');
      const i = ci(x, z);
      if (L.wet[i]) return why('wet');
      if (L.obst[i] || L.tree[i]) return why('trees');
      if (L.res[i]) return why('taken');
      if (info.protectedAt?.(x, z)) return why('taken');
      if (!SOILS.has(L.gid[i])) { if (L.gid[i] === B.SAND) sandy++; else return why('rock'); }
      lo = Math.min(lo, L.top[i]); hi = Math.max(hi, L.top[i]);
    }
    if (sandy) return why('sand');
    if (hi - lo > 1) return why('steep');
    if (!freeAround(cx - 2, cz - 2, cx + 2, cz + 2, T.HUT_GAP, null)) return why('taken');
    const wd = L.wdist[ci(cx, cz)];
    if (wd > T.WATER_REACH) return why('dry');
    if (wd < T.BANK_GAP + 2) return why('bank');
    const grass = L.grassAround(cx, cz, T.FARM_LOOK);
    if (grass < T.FLAT_GRASS_MIN) return why('grass');
    let score = 2.2 * Math.max(-0.5, 1 - Math.abs(wd - 7) / 15); // best about 7 steps from the water
    score += Math.min(1.4, grass / (T.FLAT_GRASS_MIN * 2.5));
    let near = Infinity;
    for (const h of info.huts) near = Math.min(near, Math.hypot(h.x - cx, h.z - cz));
    if (near < T.NEIGHBOUR_NEAR) return why('taken');
    if (near <= T.NEIGHBOUR_FAR) score += 0.7;
    if (info.stone) score += 0.6 * (1 - Math.min(1, Math.hypot(info.stone.x - cx, info.stone.z - cz) / 90));
    if (hi === lo) score += 0.25;
    // ground around the hut should not be a slope either
    let steep = 0;
    for (let dz = -4; dz <= 4; dz += 2) for (let dx = -4; dx <= 4; dx += 2) if (inXZ(cx + dx, cz + dz) && slope(ci(cx + dx, cz + dz)) > 1) steep++;
    score -= steep * 0.08;
    return { ok: score >= T.SETTLE_SCORE, score, why: score >= T.SETTLE_SCORE ? null : 'poor', wd, grass };
  };

  // the best home site within r of (x, z): { best, tally } where tally counts why the others failed
  L.bestHut = (x, z, r, info, step = 3) => {
    x = Math.floor(x); z = Math.floor(z);
    let best = null;
    const tally = {};
    for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) {
      if (dx * dx + dz * dz > r * r || !inXZ(x + dx, z + dz)) continue;
      if (L.wdist[ci(x + dx, z + dz)] > T.WATER_REACH) { tally.dry = (tally.dry ?? 0) + 1; continue; }
      const s = L.hutSite(x + dx, z + dz, info);
      if (s.ok) { if (!best || s.score > best.score) best = { ...s, x: x + dx, z: z + dz }; } else tally[s.why] = (tally[s.why] ?? 0) + 1;
    }
    return { best, tally };
  };

  // A field: a w x d rectangle with its corner at (x0, z0). Every cell farmable.
  L.fieldSite = (x0, z0, w, d) => {
    let lo = 99, hi = -1;
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      if (!inXZ(x, z)) return false;
      const i = ci(x, z);
      if (!L.good[i] || L.res[i] || L.wdist[i] < 2) return false;
      if (ctx.edgeClear(x + 0.5, z + 0.5) < 0.75) return false;
      lo = Math.min(lo, L.top[i]); hi = Math.max(hi, L.top[i]);
    }
    if (hi - lo > 1) return false;
    return freeAround(x0, z0, x0 + w - 1, z0 + d - 1, 1, new Set([RES.FIELD]));
  };
  L.bestField = (home, w, d, mine) => {
    let best = null, bs = -Infinity;
    const R = T.FIELD_RADIUS;
    for (let dz = -R; dz <= R; dz += 2) for (let dx = -R; dx <= R; dx += 2) {
      const x0 = home.x + dx, z0 = home.z + dz;
      const cx = x0 + w / 2, cz = z0 + d / 2;
      const dist = Math.hypot(cx - home.x, cz - home.z);
      if (dist > R || dist < 5) continue;
      for (const [ww, dd] of [[w, d], [d, w]]) {
        if (!L.fieldSite(x0, z0, ww, dd)) continue;
        let s = -dist * 0.12 - L.wdist[ci(Math.floor(cx), Math.floor(cz))] * 0.03;
        for (const f of mine) if (Math.hypot(f.x - cx, f.z - cz) < 10) s += 0.6; // beside the family's other fields
        if (s > bs) { bs = s; best = { x0, z0, w: ww, d: dd }; }
      }
    }
    return best;
  };
  // A fire circle: 5 x 5 of dry, level ground, centred on (cx, cz)
  L.fireSite = (cx, cz) => {
    let lo = 99, hi = -1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!inXZ(x, z)) return false;
      const i = ci(x, z);
      if (L.wet[i] || L.obst[i] || L.tree[i] || L.res[i] || !SOILS.has(L.gid[i])) return false;
      lo = Math.min(lo, L.top[i]); hi = Math.max(hi, L.top[i]);
    }
    return hi - lo <= 1 && freeAround(cx - 2, cz - 2, cx + 2, cz + 2, 2, new Set([RES.FIELD]));
  };

  // ---------- pathing ----------
  // modes: 'person' wades water and jumps two blocks; 'pred' and 'deer' never
  // enter water and cross a step of at most PRED_MAX_STEP (a cliff stops them).
  const g = new Float32Array(N), from = new Int32Array(N), seen = new Uint32Array(N), shut = new Uint32Array(N);
  let stamp = 1;
  const heapI = new Int32Array(N * 2), heapF = new Float32Array(N * 2);
  let hn = 0;
  const push = (i, f) => {
    let k = hn++;
    while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; }
    heapI[k] = i; heapF[k] = f;
  };
  const pop = () => {
    const top = heapI[0];
    const li = heapI[--hn], lf = heapF[hn];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= hn) break;
      if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++;
      if (heapF[c] >= lf) break;
      heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c;
    }
    heapI[k] = li; heapF[k] = lf;
    return top;
  };
  let budget = T.PATH_FRAME_BUDGET;
  L.newFrame = () => { budget = T.PATH_FRAME_BUDGET; };
  L.budgetLeft = () => budget;

  // the cost of stepping from column a to column b, or -1 if not allowed
  function stepCost(a, b, mode, goal) {
    const rb = L.res[b];
    if ((L.obst[b] || rb === RES.HUT || rb === RES.STONE || rb === RES.CAVE) && b !== goal) return -1; // CAVE: nobody paths over a chamber (they would walk into it)
    const dy = L.top[b] - L.top[a];
    if (mode === 'person') {
      if (dy > 2 || dy < -T.DROP) return -1;
      let c = Math.abs(dy) * T.CLIMB_COST;
      if (L.wet[b]) c += L.wet[b] <= 2 ? T.WATER_COST : T.DEEP_COST;
      if (rb === RES.FIELD) c += 0.25;
      return c;
    }
    if (L.wet[b]) return -1;
    if (Math.abs(dy) > T.PRED_MAX_STEP) return -1;
    return Math.abs(dy) * 0.3;
  }
  L.stepCost = stepCost;
  L.passable = (x, z, mode) => {
    if (!inXZ(x, z)) return false;
    const i = ci(x, z);
    if (L.obst[i] || L.res[i] === RES.HUT || L.res[i] === RES.STONE || L.res[i] === RES.CAVE) return false;
    return mode === 'person' || !L.wet[i];
  };

  // the centre of the nearest cell to (x, z), within r, that passes test(cx, cz); ring by ring outward, or null
  L.nearestCell = (x, z, r, test) => {
    const fx = Math.floor(x), fz = Math.floor(z);
    let best = null, bd = Infinity;
    for (let k = 0; k <= r && !best; k++) {
      for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== k) continue;
        const cx = fx + dx, cz = fz + dz;
        if (!inXZ(cx, cz) || !test(cx, cz)) continue;
        const d = (cx + 0.5 - x) ** 2 + (cz + 0.5 - z) ** 2;
        if (d < bd) { bd = d; best = { x: cx + 0.5, z: cz + 0.5 }; }
      }
    }
    return best;
  };
  // the nearest cell a walker of this mode may stand in (see passable)
  L.nearestOpen = (x, z, mode, r = 5) => L.nearestCell(x, z, r, (cx, cz) => L.passable(cx, cz, mode));
  // Can a person or an animal be put down in this cell? Inside the land, passable
  // for the mode, dry, no tree in it, and what it would be set down on (move.js
  // standHeight: leaves and roofs passed through) is the real ground, not a
  // trunk, a wall, a bush or a crop.
  L.spotOk = (x, z, mode = 'deer') => {
    if (!inXZ(x, z) || !L.passable(x, z, mode)) return false;
    const i = ci(x, z);
    return !L.wet[i] && !L.tree[i] && standHeight(W, x, z) === L.top[i] + 1;
  };
  // the centre of the nearest such cell within r of (x, z), or null
  L.nearestSpot = (x, z, mode = 'deer', r = 8) => L.nearestCell(x, z, r, (cx, cz) => L.spotOk(cx, cz, mode));

  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  // Grid A*. Returns an array of [x, z] cell centres (start excluded), null if
  // there is no way, or 'wait' if this frame's budget is spent.
  // o.raw: the cell-by-cell path, not smoothed (a retry after a walker got stuck
  // on a smoothed corner). o.partial: when the goal cannot be reached within the
  // search, the way to the reached cell nearest it (the array is marked
  // .partial), or null if no cell nearer than the start was reached.
  L.findPath = (sx, sz, tx, tz, mode = 'person', maxNodes = T.PATH_MAX_NODES, o = {}) => {
    sx = Math.floor(sx); sz = Math.floor(sz); tx = Math.floor(tx); tz = Math.floor(tz);
    if (!inXZ(sx, sz) || !inXZ(tx, tz)) return null;
    if (budget < Math.min(maxNodes, 1500)) { perf?.count('pathWait'); return 'wait'; }
    const s = ci(sx, sz), t = ci(tx, tz);
    if (s === t) return [];
    stamp++; hn = 0;
    g[s] = 0; seen[s] = stamp; from[s] = -1;
    const h = (i) => { const dx = Math.abs((i % SX) - (t % SX)), dz = Math.abs(((i / SX) | 0) - ((t / SX) | 0)); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    push(s, h(s));
    let n = 0, found = false, bestI = s, bestH = h(s);
    while (hn > 0) {
      const a = pop();
      if (shut[a] === stamp) continue;
      shut[a] = stamp;
      if (a === t) { found = true; break; }
      if (++n > maxNodes) break;
      const ax = a % SX, az = (a / SX) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = ax + NB[k][0], nz = az + NB[k][1];
        if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
        const b = nx + nz * SX;
        if (shut[b] === stamp) continue;
        const c = stepCost(a, b, mode, t);
        if (c < 0) continue;
        if (k >= 4) { // no cutting corners
          if (stepCost(a, ax + NB[k][0] + az * SX, mode, -1) < 0 || stepCost(a, ax + (az + NB[k][1]) * SX, mode, -1) < 0) continue;
        }
        const ng = g[a] + NB[k][2] + c;
        if (seen[b] === stamp && ng >= g[b]) continue;
        seen[b] = stamp; g[b] = ng; from[b] = a;
        const hb = h(b);
        if (hb < bestH) { bestH = hb; bestI = b; }
        push(b, ng + hb * 1.05);
      }
    }
    budget -= n;
    if (perf) { perf.count('paths'); perf.count('pathNodes', n); }
    let end = t;
    if (!found) {
      if (!o.partial || bestI === s) return null;
      end = bestI;
    }
    const out = [];
    for (let i = end; i !== s && i >= 0; i = from[i]) out.push([(i % SX) + X0 + 0.5, ((i / SX) | 0) + Z0 + 0.5]);
    out.reverse();
    const path = o.raw ? out : smooth([sx + 0.5, sz + 0.5], out, mode);
    if (!found) path.partial = true;
    return path;
  };
  // drop waypoints that a straight walk can skip (same rules cell by cell). The
  // line is checked down its middle and a body's width to either side, so a
  // smoothed path never clips the corner of a trunk, a bush or a wall.
  const BODY = 0.3;
  function lineCells(ax, az, bx, bz, mode) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const n = Math.ceil(len * 2.5);
    let prev = ci(Math.floor(ax), Math.floor(az));
    for (let k = 1; k <= n; k++) {
      const x = Math.floor(ax + dx * k / n), z = Math.floor(az + dz * k / n);
      if (!inXZ(x, z)) return false;
      const c = ci(x, z);
      if (c === prev) continue;
      const cost = stepCost(prev, c, mode, -1);
      if (cost < 0 || cost > 0.7 || (mode === 'person' && L.wet[c] && !L.wet[prev])) return false;
      prev = c;
    }
    return true;
  }
  function lineOk(ax, az, bx, bz, mode) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) return true;
    const px = -(bz - az) / len * BODY, pz = (bx - ax) / len * BODY;
    return lineCells(ax, az, bx, bz, mode) && lineCells(ax + px, az + pz, bx + px, bz + pz, mode) && lineCells(ax - px, az - pz, bx - px, bz - pz, mode);
  }
  // Can a walker go straight from (ax, az) to (bx, bz)? The same rules as a
  // path: every cell on the way passable, no step too high or too low for the
  // mode, no wading in from the dry for a person, room for the body either side.
  L.lineWalk = (ax, az, bx, bz, mode = 'person') => inXZ(Math.floor(bx), Math.floor(bz)) && L.passable(Math.floor(bx), Math.floor(bz), mode) && lineOk(ax, az, bx, bz, mode);
  function smooth(start, pts, mode) {
    if (pts.length < 3) return pts;
    const out = [];
    let ax = start[0], az = start[1], k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = Math.min(pts.length - 1, k + 10); j > k; j--) if (lineOk(ax, az, pts[j][0], pts[j][1], mode)) { far = j; break; }
      out.push(pts[far]);
      ax = pts[far][0]; az = pts[far][1];
      k = far + 1;
    }
    return out;
  }
  return L;
}
