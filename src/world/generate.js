// The starting land. A seeded natural landscape (docs/WORLDGEN.md): gentle
// swells and a hill or two, a lake or ponds and perhaps a stream made by the
// same rules as the god's Lake and River tools, copses and lone trees, a few
// bushes, reed beds, boulders, and a level grassy clearing at the centre for the
// standing stone. Every number it uses is in GEN in config.js.
//   ?seed=<number>  replays one landscape (any text works too)
//   ?flat=1         the old blank flat world (grass at GROUND_Y, nothing on it)
//   ?scenario=welcoming|woodland|hollow  forces the kind of start (testing)
// Bulk raw writes, not recorded for undo: main.js calls mesher.remeshAll() after.
// The seed and a summary are left on world.gen (also window.game.worldgen).
import { WORLD, GEN } from '../config.js';
import { B } from './blocks.js';
import { makeRng, makeHash, makeNoise, textSeed } from './gennoise.js';
import { makeGenTrees } from './gentrees.js';

const { SIZE_X: SX, SIZE_Z: SZ, GROUND_Y: G, DIRT_DEPTH: DD } = WORLD;
const N = SX * SZ, S = SX * SZ; // columns; one y slice of world.data
const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const TREE_SOIL = new Set([B.GRASS, B.GRASS_DRY, B.DIRT, B.SAND]);

// ---------- the blank world (?flat=1) ----------
export function generateBlank(world) {
  const { SIZE_X, SIZE_Z } = WORLD;
  world.data.fill(B.AIR);
  world.fill(0, 0, 0, SIZE_X - 1, G - DD - 1, SIZE_Z - 1, B.STONE);
  world.fill(0, G - DD, 0, SIZE_X - 1, G - 1, SIZE_Z - 1, B.DIRT);
  world.fill(0, G, 0, SIZE_X - 1, G, SIZE_Z - 1, B.GRASS);
  return { seed: null, flat: true };
}

function readAddress() {
  const out = {};
  let q;
  try { q = new URLSearchParams(location.search); } catch { return out; }
  if (q.get('flat') === '1') out.flat = true;
  const s = q.get('seed');
  if (s != null && s.trim() !== '') out.seed = /^\d+$/.test(s.trim()) ? Number(s.trim()) >>> 0 : textSeed(s.trim());
  const sc = q.get('scenario');
  if (sc && GEN.SCENARIO[sc] !== undefined) out.scenario = sc;
  return out;
}

// world: a VoxelWorld. opts (all optional): { seed, flat, scenario, quiet }
// overrides the address. Returns the summary also left on world.gen.
export function generateWorld(world, opts = {}) {
  const t0 = performance.now();
  const q = readAddress();
  const flat = opts.flat ?? q.flat ?? false;
  let info;
  if (flat) info = generateBlank(world);
  else {
    const seed = (opts.seed ?? q.seed ?? (1 + Math.floor(Math.random() * 999999))) >>> 0;
    info = buildLandscape(world, seed, opts.scenario ?? q.scenario);
  }
  info.ms = Math.round((performance.now() - t0) * 10) / 10;
  info.maxY = world.maxY;
  world.gen = info;
  if (!opts.quiet) {
    try {
      window.worldgen = info;
      // main.js sets window.game right after this returns
      queueMicrotask(() => { if (window.game && window.game.world === world) window.game.worldgen = info; });
    } catch { /* no window */ }
    if (info.flat) console.info(`[worldgen] blank flat world in ${info.ms} ms`);
    else console.info(`[worldgen] seed ${info.seed} (${info.scenario}) in ${info.ms} ms. Replay: ?seed=${info.seed}`);
  }
  return info;
}

// main.js's call, kept by name: it now builds the natural landscape (or the
// blank world with ?flat=1)
export function generateFlat(world) { return generateWorld(world); }

// ---------- the landscape ----------
function edgeDist(px, pz) { // to the world's edge, with the edge mist's rounded corners (radius 40)
  const R = 40, dx = Math.min(px, SX - px), dz = Math.min(pz, SZ - pz);
  if (dx > R && dz > R) return Math.min(dx, dz);
  return R - Math.hypot(Math.max(R - dx, 0), Math.max(R - dz, 0));
}
// a Catmull-Rom curve through the points, sampled every `step` blocks: [[x, z, t]], t 0..1 along it
function spline(ctrl, step) {
  const raw = [], n = ctrl.length;
  for (let k = 0; k < n - 1; k++) {
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(n - 1, k + 2)];
    const m = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < m; j++) {
      const t = j / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      raw.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  raw.push([ctrl[n - 1][0], ctrl[n - 1][1]]);
  let len = 0;
  const acc = [0];
  for (let k = 1; k < raw.length; k++) { len += Math.hypot(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]); acc.push(len); }
  return raw.map((p, k) => [p[0], p[1], len ? acc[k] / len : 0]);
}

function buildLandscape(world, seed, forced) {
  const rng = makeRng(seed);
  const hash = makeHash(seed);
  const nz = makeNoise(seed);
  const rr = (a) => a[0] + rng() * (a[1] - a[0]);
  const ri = (a) => a[0] + Math.floor(rng() * (a[1] - a[0] + 1));
  const off = () => rng() * 2000 - 1000;
  const cx = SX / 2, cz = SZ / 2;
  // the value above which `share` of fn's samples lie (fn over random columns)
  const quantile = (fn, share) => {
    const v = [];
    for (let k = 0; k < 1500; k++) v.push(fn(Math.floor(rng() * SX), Math.floor(rng() * SZ)));
    v.sort((a, b) => a - b);
    return v[Math.max(0, Math.min(v.length - 1, Math.floor((1 - share) * v.length)))];
  };

  // ---- per-column maps ----
  const H = new Float32Array(N);    // height (float, blocks from GROUND_Y) while shaping
  const edge = new Float32Array(N); // distance to the world's edge
  const dc = new Float32Array(N);   // distance to the centre
  const hillT = new Float32Array(N);// 0..1, how far up a hill
  const open = new Float32Array(N); // 0..1, meadow (no woods)
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const i = x + z * SX;
    edge[i] = edgeDist(x + 0.5, z + 0.5);
    dc[i] = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
  }
  const at = (x, z) => Math.max(0, Math.min(SX - 1, Math.floor(x))) + Math.max(0, Math.min(SZ - 1, Math.floor(z))) * SX;
  const Hat = (x, z) => H[at(x, z)];

  // ---- the kind of start ----
  const SC = GEN.SCENARIO, tot = SC.welcoming + SC.woodland + SC.hollow;
  const roll = rng() * tot;
  const scenario = forced ?? (roll < SC.welcoming ? 'welcoming' : roll < SC.welcoming + SC.woodland ? 'woodland' : 'hollow');
  const wooded = scenario !== 'welcoming'; // thick woods around all water

  // ---- 1. relief: broad swells, ripples, a lean ----
  {
    const R = new Float32Array(N);
    const ox = off(), oz = off(), px = off(), pz = off();
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX;
      H[i] = nz.fbm(x / GEN.RELIEF_SCALE + ox, z / GEN.RELIEF_SCALE + oz, 3);
      R[i] = nz.fbm(x / GEN.RIPPLE_SCALE + px, z / GEN.RIPPLE_SCALE + pz, 2);
    }
    const norm = (A) => {
      let m = 0, v = 0;
      for (let i = 0; i < N; i++) m += A[i];
      m /= N;
      for (let i = 0; i < N; i++) v += (A[i] - m) ** 2;
      const sd = Math.sqrt(v / N) || 1;
      for (let i = 0; i < N; i++) A[i] = (A[i] - m) / sd;
    };
    norm(H); norm(R);
    const ta = rng() * Math.PI * 2, tc = Math.cos(ta), ts = Math.sin(ta);
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX;
      H[i] = H[i] * GEN.RELIEF * 0.5 + R[i] * GEN.RIPPLE * 0.5 + (((x - cx) * tc + (z - cz) * ts) / SX) * GEN.TILT;
    }
  }

  // ---- 2. where things go ----
  const bodies = []; // lakes and ponds
  const makeBody = (kind, x, z, r, depth) => ({ kind, x, z, r, depth, ang: rng() * Math.PI, asp: kind === 'lake' ? 0.68 + rng() * 0.3 : 0.8 + rng() * 0.2, ph: off(), level: 0 });
  // s < 1 inside the body's ragged outline; rl the outline's radius that way
  const shapeOf = (b, px, pz, out) => {
    const dx = px - b.x, dz = pz - b.z, c = Math.cos(b.ang), s = Math.sin(b.ang);
    const u = dx * c + dz * s, v = (-dx * s + dz * c) / b.asp;
    const rho = Math.hypot(u, v), th = Math.atan2(v, u);
    const amp = b.kind === 'lake' ? 0.24 : b.kind === 'hollow' ? 0.15 : 0.12;
    const wob = 1 + amp * nz.perlin(Math.cos(th) * 1.3 + b.ph, Math.sin(th) * 1.3 - b.ph) + amp * 0.35 * nz.perlin(Math.cos(th) * 3.1 - b.ph, Math.sin(th) * 3.1 + b.ph);
    out.rl = b.r * wob;
    out.s = rho / out.rl;
    return out;
  };
  const sh = { s: 0, rl: 0 };
  const centreKeep = wooded ? 50 : GEN.CENTRE_FLAT + GEN.CENTRE_BLEND + 6;

  // the lake: in a low spot at a fair distance from the centre
  let lake = null;
  if (scenario !== 'hollow') {
    const r = GEN.LAKE_RADIUS[0] + rng() * (GEN.LAKE_RADIUS[1] - GEN.LAKE_RADIUS[0]);
    const range = wooded ? GEN.WOODLAND_LAKE_DIST : GEN.LAKE_DIST;
    let best = null;
    for (let k = 0; k < 90; k++) {
      const a = rng() * Math.PI * 2, d = rr(range), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (edgeDist(x, z) < GEN.EDGE_BAND + r * 1.5 + 6) continue;
      if (d - r * 1.3 < centreKeep - 4) continue;
      const sc = Hat(x, z) + rng() * 0.8;
      if (!best || sc < best.sc) best = { x, z, sc };
    }
    if (best) { lake = makeBody('lake', best.x, best.z, r, rr(GEN.LAKE_DEPTH)); bodies.push(lake); }
  }
  // the dry hollow (hollow runs): where a lake could be
  let hollow = null;
  if (scenario === 'hollow') {
    const r = rr(GEN.HOLLOW_RADIUS);
    let best = null;
    for (let k = 0; k < 90; k++) {
      const a = rng() * Math.PI * 2, d = rr(GEN.LAKE_DIST), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (edgeDist(x, z) < GEN.EDGE_BAND + r * 1.6 + 10) continue;
      if (d - r * 1.4 < GEN.CENTRE_FLAT + GEN.CENTRE_BLEND) continue;
      const sc = Hat(x, z) + rng() * 0.8;
      if (!best || sc < best.sc) best = { x, z, sc };
    }
    if (best) hollow = makeBody('hollow', best.x, best.z, r, GEN.HOLLOW_DEPTH);
  }

  // hills: on higher ground, clear of the water and of each other
  const hills = [];
  for (let n = ri(GEN.HILLS), h = 0; h < n; h++) {
    let best = null;
    for (let k = 0; k < 60; k++) {
      const a = rng() * Math.PI * 2, d = rr(GEN.HILL_DIST), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const hh = rr(GEN.HILL_HEIGHT), asp = 0.75 + rng() * 0.25;
      const r = Math.max(rr(GEN.HILL_RADIUS), (hh * 1.9) / asp); // keeps the flanks under about 0.8 a block per block
      if (edgeDist(x, z) < GEN.EDGE_BAND + r * 0.9) continue;
      if (d - r < GEN.CENTRE_FLAT + GEN.CENTRE_BLEND - 4) continue;
      if ([...bodies, hollow].some((b) => b && Math.hypot(b.x - x, b.z - z) < b.r * 1.6 + r + 8)) continue;
      if (hills.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * 0.8 + r)) continue;
      const sc = Hat(x, z) + rng() * 1.5;
      if (!best || sc > best.sc) best = { x, z, r, hh, asp, ang: rng() * Math.PI, sc };
    }
    if (!best) continue;
    hills.push(best);
    const { x: hx, z: hz, r, hh, asp, ang } = best, c = Math.cos(ang), s = Math.sin(ang);
    for (let z = Math.max(0, Math.floor(hz - r)); z <= Math.min(SZ - 1, Math.ceil(hz + r)); z++)
      for (let x = Math.max(0, Math.floor(hx - r)); x <= Math.min(SX - 1, Math.ceil(hx + r)); x++) {
        const dx = x + 0.5 - hx, dz = z + 0.5 - hz, u = dx * c + dz * s, v = (-dx * s + dz * c) / asp;
        const q = Math.hypot(u, v) / r;
        if (q >= 1) continue;
        const t = 1 - q * q, i = x + z * SX;
        H[i] += hh * t * t * (0.9 + 0.2 * nz.perlin(x / 9 + 50, z / 9 - 50));
        hillT[i] = Math.max(hillT[i], t);
      }
  }

  // the stream: from the lake up into higher ground, at the lake's level all the way
  let stream = null;
  if (lake && rng() < GEN.STREAM_CHANCE) {
    let rim = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      rim = Math.min(rim, Hat(lake.x + Math.cos(a) * lake.r * 1.3, lake.z + Math.sin(a) * lake.r * 1.3));
    }
    let best = null;
    for (let k = 0; k < 28; k++) {
      const a = rng() * Math.PI * 2, len = rr(GEN.STREAM_LENGTH);
      const ux = Math.cos(a), uz = Math.sin(a), ph = rng() * 6.28, amp = GEN.STREAM_MEANDER * (0.5 + rng());
      const L0 = lake.r * 0.3, L1 = lake.r * 1.1 + len, ctrl = [];
      for (let j = 0; j <= 5; j++) {
        const t = j / 5, d = lerp(L0, L1, t), o = j === 0 ? 0 : amp * Math.sin(ph + t * Math.PI * 1.6) * Math.min(1, t * 2.5);
        ctrl.push([lake.x + ux * d - uz * o, lake.z + uz * d + ux * o]);
      }
      const pts = spline(ctrl, 0.5);
      let ok = true, maxRise = -99;
      for (const [x, z] of pts) {
        if (shapeOf(lake, x, z, sh).s < 1) continue;
        if (edgeDist(x, z) < GEN.EDGE_BAND + 6 || Math.hypot(x - cx, z - cz) < centreKeep) { ok = false; break; }
        if (hills.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * 0.45)) { ok = false; break; }
        maxRise = Math.max(maxRise, Hat(x, z) - rim);
      }
      if (!ok || maxRise > GEN.STREAM_RISE) continue;
      const end = pts[pts.length - 1], sc = -Math.abs(Hat(end[0], end[1]) - rim - 3.5) + rng();
      if (!best || sc > best.sc) best = { pts, sc, wm: rr(GEN.STREAM_WIDTH), ws: 2.2 };
    }
    stream = best;
  }

  // a body of water may go at (x, z) with radius r: clear of the others and the stream
  const waterFree = (x, z, r) => {
    for (const b of bodies) if (Math.hypot(b.x - x, b.z - z) < b.r * 1.35 + r + GEN.WATER_GAP) return false;
    if (stream) for (let k = 0; k < stream.pts.length; k += 4) if (Math.hypot(stream.pts[k][0] - x, stream.pts[k][1] - z) < r + GEN.WATER_GAP) return false;
    if (hollow && Math.hypot(hollow.x - x, hollow.z - z) < hollow.r * 1.6 + r + GEN.WATER_GAP) return false;
    return true;
  };
  // ponds
  {
    const n = scenario === 'hollow' ? (rng() < GEN.HOLLOW_POND ? 1 : 0) : ri(GEN.PONDS);
    for (let p = 0; p < n; p++) {
      const r = rr(scenario === 'hollow' ? GEN.HOLLOW_POND_RADIUS : GEN.POND_RADIUS);
      let best = null;
      for (let k = 0; k < 70; k++) {
        const x = 20 + rng() * (SX - 40), z = 20 + rng() * (SZ - 40);
        if (edgeDist(x, z) < GEN.EDGE_BAND + r * 1.5 + 8) continue;
        if (Math.hypot(x - cx, z - cz) - r * 1.4 < centreKeep) continue;
        if (!waterFree(x, z, r * 1.4) || hillT[at(x, z)] > 0.3) continue;
        const sc = Hat(x, z) + rng();
        if (!best || sc < best.sc) best = { x, z, sc };
      }
      if (best) bodies.push(makeBody('pond', best.x, best.z, r, 1 + Math.floor(rng() * 2)));
    }
  }

  // meadows: open, flattened, flowery. A welcoming run's first meadow lies
  // beside the lake on the side toward the centre; a hollow run's surrounds the hollow.
  const meadows = [];
  if (scenario === 'welcoming' && lake) {
    const base = Math.atan2(cz - lake.z, cx - lake.x);
    for (let k = 0; k < 10; k++) {
      const a = base + (rng() - 0.5) * 1.6, r = rr(GEN.MEADOW_RADIUS);
      const d = lake.r * 1.05 + r * 0.8, x = lake.x + Math.cos(a) * d, z = lake.z + Math.sin(a) * d;
      if (edgeDist(x, z) < GEN.EDGE_BAND + 4) continue;
      if (hills.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * 0.7 + r * 0.5)) continue;
      meadows.push({ x, z, r, by: 'lake' });
      break;
    }
  }
  if (hollow) meadows.push({ x: hollow.x, z: hollow.z, r: hollow.r + 14, by: 'hollow' });
  {
    const want = Math.max(0, ri(GEN.MEADOWS) - meadows.length);
    for (let m = 0, k = 0; m < want && k < 80; k++) {
      const r = rr(GEN.MEADOW_RADIUS), a = rng() * Math.PI * 2, d = 28 + rng() * 85;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (edgeDist(x, z) < GEN.EDGE_BAND + r * 0.3) continue;
      if (hills.some((o) => Math.hypot(o.x - x, o.z - z) < o.r * 0.8 + r * 0.5)) continue;
      if (meadows.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) continue;
      // woodland and hollow runs: meadows stay out of reach of the water
      const far = GEN.WOODLAND_RING + r * 0.7 + 4;
      if (wooded) {
        if (bodies.some((b) => Math.hypot(b.x - x, b.z - z) < b.r * 1.35 + far)) continue;
        if (stream && stream.pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < far)) continue;
      } else if (bodies.some((b) => Math.hypot(b.x - x, b.z - z) < b.r * 1.3 + r * 0.6)) continue;
      meadows.push({ x, z, r, by: 'open' });
      m++;
    }
  }
  for (const m of meadows) {
    let hm = 0, c = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { hm += Hat(m.x + dx, m.z + dz); c++; }
    hm /= c;
    for (let z = Math.max(0, Math.floor(m.z - m.r * 1.1)); z <= Math.min(SZ - 1, Math.ceil(m.z + m.r * 1.1)); z++)
      for (let x = Math.max(0, Math.floor(m.x - m.r * 1.1)); x <= Math.min(SX - 1, Math.ceil(m.x + m.r * 1.1)); x++) {
        const i = x + z * SX, d = Math.hypot(x + 0.5 - m.x, z + 0.5 - m.z);
        const w = smoothstep(m.r, m.r * 0.45, d);
        H[i] = lerp(H[i], hm, GEN.MEADOW_FLATTEN * w);
        open[i] = Math.max(open[i], smoothstep(m.r * 1.05, m.r * 0.6, d));
      }
  }

  // ---- 3. hollows for the water, the centre, the edge, whole blocks ----
  for (const b of [...bodies, hollow]) {
    if (!b) continue;
    const reach = b.r * 2.2 + 2, depth = b.kind === 'lake' ? GEN.LAKE_BOWL : b.kind === 'hollow' ? GEN.HOLLOW_DEPTH : 1;
    for (let z = Math.max(0, Math.floor(b.z - reach)); z <= Math.min(SZ - 1, Math.ceil(b.z + reach)); z++)
      for (let x = Math.max(0, Math.floor(b.x - reach)); x <= Math.min(SX - 1, Math.ceil(b.x + reach)); x++) {
        const { s } = shapeOf(b, x + 0.5, z + 0.5, sh);
        H[x + z * SX] -= depth * (b.kind === 'hollow' ? smoothstep(1.55, 0.25, s) : smoothstep(2.0, 0.5, s));
      }
  }
  const h = new Int16Array(N);
  const [lowH, highH] = GEN.HEIGHT_RANGE;
  for (let i = 0; i < N; i++) {
    let v = H[i] * smoothstep(GEN.CENTRE_FLAT, GEN.CENTRE_FLAT + GEN.CENTRE_BLEND, dc[i]);
    v *= 0.35 + 0.65 * smoothstep(0, GEN.EDGE_BAND, edge[i]);
    h[i] = G + Math.max(lowH, Math.min(highH, Math.round(v)));
  }

  // ---- 4. water, by the tools' rules ----
  const wl = new Int16Array(N);  // water surface y; 0 = dry
  const top = new Uint8Array(N); // surface block (0 = decided in step 6)
  const shore = new Uint8Array(N);
  const sandN = { ox: off(), oz: off() };
  let sandThr = null;
  const sandy = (x, z) => {
    if (sandThr === null) sandThr = quantile((a, b) => nz.perlin(a / 11 + sandN.ox, b / 11 + sandN.oz), GEN.SHORE_SAND);
    return nz.perlin(x / 11 + sandN.ox, z / 11 + sandN.oz) >= sandThr;
  };
  const carveBody = (b) => {
    const reach = b.r * 1.6 + 28; // far enough for the banks to stay at BANK_SLOPE where the land is high
    const x0 = Math.max(1, Math.floor(b.x - reach)), x1 = Math.min(SX - 2, Math.ceil(b.x + reach));
    const z0 = Math.max(1, Math.floor(b.z - reach)), z1 = Math.min(SZ - 2, Math.ceil(b.z + reach));
    let lo = 999;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const { s } = shapeOf(b, x + 0.5, z + 0.5, sh);
      if (s >= 1 && s < 1.5) lo = Math.min(lo, h[x + z * SX]);
    }
    const L = Math.max(b.depth + 3, lo - 1); // the water a block under its lowest rim, never near bedrock
    b.level = L;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = x + z * SX, { s, rl } = shapeOf(b, x + 0.5, z + 0.5, sh);
      if (s < 1) {
        const prof = Math.pow(1 - s * s, 0.7);
        const dep = Math.max(1, 1 + Math.round((b.depth - 1) * prof + nz.perlin(x / 5, z / 5) * 0.6));
        h[i] = Math.min(h[i], L - dep);
        wl[i] = L;
        top[i] = B.SAND; // as the Lake tool leaves it
      } else {
        const dd = (s - 1) * rl, sw = GEN.SHORE + nz.perlin(x / 6 + 40, z / 6 - 40) * 1.2;
        if (dd < sw) { h[i] = L + 1; top[i] = sandy(x, z) ? B.SAND : B.GRASS; shore[i] = 1; }
        else h[i] = Math.min(h[i], L + 1 + Math.floor((dd - sw) * GEN.BANK_SLOPE));
      }
    }
  };
  for (const b of bodies) carveBody(b);
  if (stream && lake) {
    const L = lake.level, pts = stream.pts, reach = 22;
    let x0 = SX, x1 = 0, z0 = SZ, z1 = 0;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    x0 = Math.max(1, Math.floor(x0 - reach)); x1 = Math.min(SX - 2, Math.ceil(x1 + reach));
    z0 = Math.max(1, Math.floor(z0 - reach)); z1 = Math.min(SZ - 2, Math.ceil(z1 + reach));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, pz = z + 0.5;
      let bd = Infinity, bt = 0;
      for (let k = 0; k < pts.length; k++) {
        const d2 = (pts[k][0] - px) ** 2 + (pts[k][1] - pz) ** 2;
        if (d2 < bd) { bd = d2; bt = pts[k][2]; }
      }
      const d = Math.sqrt(bd), i = x + z * SX;
      if (d > reach) continue;
      const hw = lerp(stream.wm, stream.ws, bt) / 2 + (nz.perlin(px * 0.2, pz * 0.2)) * 0.3;
      if (d < hw) {
        h[i] = Math.min(h[i], L - 1 - (d < hw * 0.45 && hw > 1.4 ? 1 : 0));
        wl[i] = L; top[i] = B.SAND; shore[i] = 0;
      } else if (wl[i]) continue; // the lake keeps its shape
      else if (d < hw + 2.2) { h[i] = L + 1; if (!shore[i]) top[i] = sandy(x, z) ? B.SAND : B.GRASS; shore[i] = 1; }
      else if (d < hw + 4.5) h[i] = Math.min(h[i], L + 2);
      else h[i] = Math.min(h[i], L + 2 + Math.floor((d - hw - 4.5) * GEN.BANK_SLOPE));
    }
  }

  // ---- 5. no cliffs: every land step at most MAX_SLOPE (lowering only; water stays) ----
  {
    const M = GEN.MAX_SLOPE;
    const eff = (j) => (wl[j] ? wl[j] : h[j]);
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX;
      if (wl[i]) continue;
      let v = h[i];
      if (x > 0) v = Math.min(v, eff(i - 1) + M);
      if (z > 0) v = Math.min(v, eff(i - SX) + M);
      h[i] = v;
    }
    for (let z = SZ - 1; z >= 0; z--) for (let x = SX - 1; x >= 0; x--) {
      const i = x + z * SX;
      if (wl[i]) continue;
      let v = h[i];
      if (x < SX - 1) v = Math.min(v, eff(i + 1) + M);
      if (z < SZ - 1) v = Math.min(v, eff(i + SX) + M);
      h[i] = v;
    }
  }
  // water never stands beside air: a low neighbour becomes a bank, and where two
  // levels meet the higher water gives way to bank
  for (let pass = 0; pass < 6; pass++) {
    let changed = 0;
    for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
      const i = x + z * SX, L = wl[i];
      if (!L) continue;
      for (const j of [i - 1, i + 1, i - SX, i + SX]) {
        if (!wl[j]) { if (h[j] < L) { h[j] = L + 1; top[j] = B.SAND; shore[j] = 1; changed++; } }
        else if (wl[j] < L) { wl[i] = 0; h[i] = L; top[i] = B.SAND; shore[i] = 1; changed++; break; }
      }
    }
    if (!changed) break;
  }

  // distance to the nearest water, in blocks (chamfer 3-4, as the people measure it)
  const wd = new Uint8Array(N);
  {
    const D = new Uint16Array(N);
    for (let i = 0; i < N; i++) D[i] = wl[i] ? 0 : 60000;
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
    for (let i = 0; i < N; i++) wd[i] = Math.min(250, Math.round(D[i] / 3));
  }

  // ---- woods: copses, wooded hill flanks, thick woods around water in wooded runs ----
  const woods = new Float32Array(N);
  const dense = new Uint8Array(N);
  {
    const ox = off(), oz = off();
    const copse = (x, z) => nz.fbm(x / GEN.WOODS_SCALE + ox, z / GEN.WOODS_SCALE + oz, 3);
    const thr = quantile(copse, GEN.WOODS);
    const rox = off(), roz = off();
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX;
      if (wl[i]) continue;
      let v = smoothstep(thr - 0.06, thr + 0.1, copse(x, z));
      const ht = hillT[i];
      if (ht > 0) v = Math.max(v, GEN.HILL_WOODS * smoothstep(0.05, 0.45, ht) * (1 - smoothstep(0.7, 0.95, ht) * 0.7));
      v *= 1 - open[i];
      v *= smoothstep(GEN.CENTRE_TREES, GEN.CENTRE_TREES + 22, dc[i]);
      v *= 0.35 + 0.65 * smoothstep(8, GEN.EDGE_BAND, edge[i]);
      if (wooded && wd[i] >= 2 && dc[i] >= GEN.CENTRE_TREES) {
        const ring = GEN.WOODLAND_RING + 6 * Math.max(0, nz.perlin(x / 14 + rox, z / 14 + roz));
        if (wd[i] <= ring) { v = 1; dense[i] = 1; }
      }
      woods[i] = v;
    }
  }

  // ---- 6. ground paint: grass, dry grass, bare earth, rock crowns ----
  {
    const dox = off(), doz = off(), box = off(), boz = off(), rox = off(), roz = off();
    const dryF = (x, z) => nz.fbm(x / 40 + dox, z / 40 + doz, 2) + (h[x + z * SX] - G) * 0.05;
    const bareF = (x, z) => nz.perlin(x / 9 + box, z / 9 + boz) * 0.6 + nz.perlin(x / 30 - box, z / 30 - boz);
    const rockF = (x, z) => nz.fbm(x / 7 + rox, z / 7 + roz, 2);
    const dryT = quantile(dryF, GEN.DRY_GRASS), bareT = quantile(bareF, GEN.BARE), rockT = quantile(rockF, GEN.ROCK_TOPS);
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX;
      if (top[i]) continue;
      let id = B.GRASS;
      if (dc[i] < GEN.CENTRE_FLAT + 3) id = B.GRASS;
      else if (hillT[i] > 0.66 && rockF(x, z) > rockT) id = B.ROCK;
      else if (woods[i] < 0.5 && open[i] < 0.6 && bareF(x, z) > bareT) id = B.DIRT;
      else if (dryF(x, z) > dryT) id = B.GRASS_DRY;
      top[i] = id;
    }
  }

  // ---- boulders: little clusters on hills, in woods, now and then in the open ----
  const boulder = new Uint8Array(N);
  {
    // only where no neighbour lies lower, so a boulder never makes a step of more than one
    const ok = (j) => !wl[j] && wd[j] >= 3 && !shore[j] && !boulder[j] && dc[j] > GEN.CENTRE_FLAT + 8 && edge[j] > 12 &&
      h[j - 1] >= h[j] && h[j + 1] >= h[j] && h[j - SX] >= h[j] && h[j + SX] >= h[j];
    let made = 0;
    for (let tries = 0; made < GEN.BOULDERS && tries < GEN.BOULDERS * 30; tries++) {
      let x = 8 + Math.floor(rng() * (SX - 16)), z = 8 + Math.floor(rng() * (SZ - 16));
      const i = x + z * SX;
      if (!ok(i) || rng() > 0.12 + hillT[i] * 1.2 + woods[i] * 0.5) continue;
      const n = 1 + Math.floor(rng() * 5);
      const cells = [];
      for (let k = 0; k < n; k++) {
        const j = x + z * SX;
        if (ok(j)) { boulder[j] = 1; h[j] += 1; top[j] = rng() < 0.3 ? B.ROCK_DARK : B.ROCK; cells.push(j); }
        const dir = Math.floor(rng() * 4);
        x += dir === 0 ? 1 : dir === 1 ? -1 : 0; z += dir === 2 ? 1 : dir === 3 ? -1 : 0;
      }
      if (cells.length >= 4 && rng() < 0.5) { const j = cells[0]; if (boulder[j - 1] + boulder[j + 1] + boulder[j - SX] + boulder[j + SX] >= 3) h[j] += 1; }
      if (cells.length) made++;
    }
  }

  // ---- 7. the blocks: stone, dirt, the surface, water ----
  const d = world.data;
  d.fill(B.AIR);
  let lo = 999, maxY = 0;
  for (let i = 0; i < N; i++) { lo = Math.min(lo, h[i]); maxY = Math.max(maxY, h[i], wl[i]); }
  const stoneTo = Math.max(1, lo - DD); // every column is stone below this
  d.fill(B.STONE, 0, stoneTo * S);
  for (let i = 0; i < N; i++) {
    const hh = h[i];
    for (let y = stoneTo; y < hh - DD; y++) d[i + y * S] = B.STONE;
    for (let y = Math.max(stoneTo, hh - DD); y < hh; y++) d[i + y * S] = B.DIRT;
    d[i + hh * S] = top[i] || B.GRASS;
    for (let y = hh + 1; y <= wl[i]; y++) d[i + y * S] = B.WATER;
  }

  // ---- 8. trees ----
  const trees = makeGenTrees(world);
  const trunk = new Uint8Array(N);
  let treeCount = 0;
  {
    const kox = off(), koz = off();
    const near = (x, z, r) => {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx >= 0 && zz >= 0 && xx < SX && zz < SZ && trunk[xx + zz * SX]) return true;
      }
      return false;
    };
    for (let gz = 0; gz < Math.floor(SZ / 3); gz++) for (let gx = 0; gx < Math.floor(SX / 3); gx++) {
      const jx = rng(), jz = rng(), r1 = rng(), r2 = rng(), r3 = rng();
      const x = gx * 3 + Math.floor(jx * 2), z = gz * 3 + Math.floor(jz * 2);
      if (x < 4 || z < 4 || x > SX - 5 || z > SZ - 5) continue;
      const i = x + z * SX, t = top[i];
      if (wl[i] || boulder[i] || !TREE_SOIL.has(t) || dc[i] < GEN.CENTRE_TREES) continue;
      if (wd[i] < 3) continue; // canopies stay off the water so it shows from above
      const dn = dense[i], v = woods[i];
      const lone = v < 0.15 && r1 < GEN.LONE_TREES * (open[i] > 0.5 ? 0.6 : 1) * (0.5 + 0.5 * smoothstep(8, GEN.EDGE_BAND, edge[i]));
      if (!dn && !lone && r1 >= v * GEN.TREE_FILL) continue;
      if (near(x, z, dn ? 1 : lone ? 4 : 2)) continue;
      let kind;
      const hn = h[i] - G, kf = nz.perlin(x / 35 + kox, z / 35 + koz);
      if (lone) kind = r2 < 0.4 ? 'round' : r2 < 0.62 ? 'wide' : r2 < 0.86 ? 'flat' : 'tall';
      else if (wd[i] <= 6 && r2 < 0.45) kind = 'palm';
      else if ((t === B.GRASS_DRY || hn >= 5) && r2 < 0.45) kind = 'flat';
      else if (r2 < 0.2) kind = 'young';
      else if (r2 < 0.22) kind = 'snag';
      else if (kf > 0.2) kind = r3 < 0.75 ? 'round' : 'tall';
      else if (kf < -0.25) kind = r3 < 0.8 ? 'tall' : 'flat';
      else kind = r3 < 0.5 ? 'tall' : r3 < 0.85 ? 'round' : 'wide';
      if (kind === 'wide' && near(x, z, 3)) kind = 'tall';
      if (kind !== 'palm' && wd[i] < 4) continue;
      const tl = 2 + Math.floor(r3 * 3);
      if (trees.place(x, h[i] + 1, z, kind, tl, rng)) { trunk[i] = 1; treeCount++; }
    }
    maxY = Math.max(maxY, trees.top);
  }

  // ---- 9. bushes, reeds and flowers ----
  // Director's rule: no single tufts scattered over open ground (green blocks
  // are the grass). Plant blocks appear only packed into small clumps that read
  // as one bush (ferns and berry shrubs) at wood edges, by water and as the odd
  // thicket, and as reed beds on the shore. Never the yellow tufts (crops are the people's).
  // 2026-11-16 ("flowers should be rampant ... flower fields"; "every world has berry bushes that the people can find"):
  // berry clumps are added until every place a family could settle has some in reach, and flowers come in drifts
  // and fields (clumps again, never single specks). All of it after the trees, so the land and its trees are the same.
  let plants = 0, bushes = 0, berryAdded = 0, flowers = 0, flowerFields = 0;
  const berryClumps = []; // { x, z, n }: berry clumps placed, for the reach rule below
  {
    const free = (i) => !wl[i] && !boulder[i] && dc[i] >= GEN.CENTRE_FLAT + 3 && edge[i] > 6 && d[i + (h[i] + 1) * S] === B.AIR;
    const put = (i, id) => { d[i + (h[i] + 1) * S] = id; plants++; maxY = Math.max(maxY, h[i] + 1); };
    const taken = new Uint8Array(N); // clumps keep clear ground around them
    const clear = (x, z, r) => {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= SX || zz >= SZ || taken[xx + zz * SX]) return false;
      }
      return true;
    };
    // bushes: 3 to 9 tufts in a 3 x 3 footprint on level ground, one kind of plant to a bush
    for (let tries = 0; bushes < GEN.BUSHES && tries < GEN.BUSHES * 60; tries++) {
      const x = 3 + Math.floor(rng() * (SX - 6)), z = 3 + Math.floor(rng() * (SZ - 6)), i = x + z * SX;
      if (!free(i) || top[i] === B.SAND || top[i] === B.ROCK || top[i] === B.ROCK_DARK) continue;
      const v = woods[i], w = wd[i];
      const edgeOfWood = v > 0.12 && v < 0.75 && !dense[i];
      const byWater = w >= 3 && w <= 9;
      const want = edgeOfWood ? 0.6 : byWater ? 0.35 : dense[i] ? 0.04 : 0.025;
      if (rng() > want || !clear(x, z, 3)) continue;
      const id = rng() < 0.6 ? B.FERN : B.SHRUB_BERRY;
      const cells = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = i + dx + dz * SX;
        if (!free(j) || h[j] !== h[i] || top[j] === B.SAND) continue;
        if ((dx || dz) && rng() < (dx && dz ? 0.3 : 0.05)) continue;
        cells.push(j);
      }
      if (cells.length < 5) continue;
      for (const j of cells) put(j, id);
      bushes++;
      if (id === B.SHRUB_BERRY) berryClumps.push({ x, z, n: cells.length });
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) taken[i + dx + dz * SX] = 1;
    }
    // berries within reach of every place a family could settle (GEN.BERRY_*): dry grass 3 to 22 blocks from
    // water, looked at every 5 blocks in a random order; short of BERRY_NEAR_MIN bushes within BERRY_NEAR, a clump
    // goes 8 to 24 blocks from it (wood edges and the water's side first), until it has enough or the world its cap
    {
      const R2 = GEN.BERRY_NEAR * GEN.BERRY_NEAR;
      const near = (x, z) => { let n = 0; for (const c of berryClumps) if ((c.x - x) ** 2 + (c.z - z) ** 2 <= R2) n += c.n; return n; };
      const spots = [];
      for (let z = 8; z < SZ - 8; z += 5) for (let x = 8; x < SX - 8; x += 5) {
        const i = x + z * SX;
        // (wooded ground counts too: a wooded start's glade, once the god clears it, should find berries at its edge)
        if (wl[i] || wd[i] < 3 || wd[i] > 22 || top[i] !== B.GRASS || edge[i] < GEN.EDGE_BAND * 0.5) continue;
        spots.push([x, z, rng()]);
      }
      spots.sort((a, b) => a[2] - b[2]);
      for (const [sx, sz] of spots) {
        for (let tries = 0; tries < 40 && near(sx, sz) < GEN.BERRY_NEAR_MIN && berryClumps.length < GEN.BERRY_CLUMPS_MAX; tries++) {
          const a = rng() * Math.PI * 2, r = 8 + rng() * 16;
          const x = Math.round(sx + Math.cos(a) * r), z = Math.round(sz + Math.sin(a) * r);
          if (x < 4 || z < 4 || x >= SX - 4 || z >= SZ - 4) continue;
          const i = x + z * SX;
          if (!free(i) || top[i] === B.SAND || top[i] === B.ROCK || top[i] === B.ROCK_DARK || !clear(x, z, 2)) continue;
          // wood edges and the water's side first: open middles of the grass (where fields go) only now and then
          const v = woods[i];
          if (!(v > 0.08 || (wd[i] >= 3 && wd[i] <= 8)) && rng() < 0.7) continue;
          const cells = [];
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const j = i + dx + dz * SX;
            if (!free(j) || h[j] !== h[i] || top[j] === B.SAND) continue;
            if ((dx || dz) && rng() < (dx && dz ? 0.3 : 0.05)) continue;
            cells.push(j);
          }
          if (cells.length < 5) continue;
          for (const j of cells) put(j, B.SHRUB_BERRY);
          bushes++; berryAdded++;
          berryClumps.push({ x, z, n: cells.length });
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) taken[i + dx + dz * SX] = 1;
        }
      }
    }
    // reed beds: dense patches along stretches of the shore
    const rbx = off(), rbz = off();
    for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) {
      const i = x + z * SX;
      if (wd[i] > 1 || !shore[i] || !free(i)) continue;
      if (nz.perlin(x / 6 + rbx, z / 6 + rbz) < GEN.REED_BEDS) continue;
      if (hash(x, z, 3) < GEN.REEDS) put(i, B.REED);
    }
    // flowers in drifts (GEN.MEADOW_DRIFTS, FLOWER_DRIFTS, FLOWER_FIELDS): one main colour and an accent, dense at the
    // middle and thinning to nothing at the edge, on open grass only (never the sand, the woods' floor or a clump)
    const KINDS = [B.FLOWER_YELLOW, B.FLOWER_RED, B.FLOWER_WHITE, B.FLOWER_BLUE, B.FLOWER_DAISY, B.FLOWER_LILAC];
    const fox = off(), foz = off();
    const drift = (cx0, cz0, r, dens) => {
      const main = KINDS[Math.floor(rng() * KINDS.length)];
      let accent = KINDS[Math.floor(rng() * KINDS.length)];
      if (accent === main) accent = KINDS[(KINDS.indexOf(main) + 3) % KINDS.length];
      let n = 0;
      for (let z = Math.floor(cz0 - r); z <= Math.ceil(cz0 + r); z++) for (let x = Math.floor(cx0 - r); x <= Math.ceil(cx0 + r); x++) {
        if (x < 2 || z < 2 || x >= SX - 2 || z >= SZ - 2) continue;
        const i = x + z * SX, dd = Math.hypot(x + 0.5 - cx0, z + 0.5 - cz0) / r;
        if (dd >= 1 || !free(i) || taken[i] || (top[i] !== B.GRASS && top[i] !== B.GRASS_DRY) || woods[i] > 0.6) continue;
        // a ragged edge: the drift's own noise eats into it
        const p = dens * Math.pow(1 - dd, 1.3) * (0.6 + 0.8 * nz.perlin(x / 4 + fox, z / 4 + foz));
        if (rng() >= p) continue;
        put(i, rng() < 0.8 ? main : accent);
        n++;
      }
      flowers += n;
      return n;
    };
    for (const m of meadows) {
      const k = ri(GEN.MEADOW_DRIFTS);
      for (let j = 0; j < k; j++) { const a = rng() * Math.PI * 2, d = rng() * m.r * 0.75; drift(m.x + Math.cos(a) * d, m.z + Math.sin(a) * d, rr(GEN.DRIFT_RADIUS), GEN.DRIFT_DENSITY); }
    }
    const openAt = (x, z) => { const i = Math.floor(x) + Math.floor(z) * SX; return !wl[i] && woods[i] < 0.3 && dc[i] > GEN.CENTRE_FLAT + 6 && edge[i] > GEN.EDGE_BAND * 0.6 && wd[i] >= 4; };
    for (let j = 0, want = ri(GEN.FLOWER_DRIFTS), tries = 0; j < want && tries < want * 30; tries++) {
      const x = 10 + rng() * (SX - 20), z = 10 + rng() * (SZ - 20);
      if (!openAt(x, z)) continue;
      if (drift(x, z, rr(GEN.DRIFT_RADIUS), GEN.DRIFT_DENSITY) > 3) j++;
    }
    // flower fields: big dense drifts in open country, kept off the grass by the water where families farm
    for (let j = 0, want = ri(GEN.FLOWER_FIELDS), tries = 0; j < want && tries < want * 60; tries++) {
      const x = 20 + rng() * (SX - 40), z = 20 + rng() * (SZ - 40), i = Math.floor(x) + Math.floor(z) * SX;
      if (!openAt(x, z) || wd[i] < 24) continue;
      if (drift(x, z, rr(GEN.FLOWER_FIELD_RADIUS), GEN.FLOWER_FIELD_DENSITY) > 40) { j++; flowerFields++; }
    }
  }
  world.maxY = Math.max(world.maxY, maxY);

  let waterCells = 0;
  for (let i = 0; i < N; i++) if (wl[i]) waterCells++;
  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    seed, flat: false, scenario,
    lakes: bodies.map((b) => ({ kind: b.kind, x: Math.round(b.x), z: Math.round(b.z), r: round1(b.r), level: b.level })),
    stream: stream ? { from: stream.pts[0].map(Math.round).slice(0, 2), to: stream.pts[stream.pts.length - 1].map(Math.round).slice(0, 2) } : null,
    hollow: hollow ? { x: Math.round(hollow.x), z: Math.round(hollow.z), r: round1(hollow.r) } : null,
    hills: hills.map((o) => ({ x: Math.round(o.x), z: Math.round(o.z), r: round1(o.r), height: round1(o.hh) })),
    meadows: meadows.map((m) => ({ x: Math.round(m.x), z: Math.round(m.z), r: round1(m.r), by: m.by })),
    waterCells, trees: treeCount, bushes, plants, berryClumps: berryClumps.length, berryAdded, flowers, flowerFields,
  };
}
