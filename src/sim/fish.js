// Fish (the director, 2026-11-16: "for right now, let us add fish. visible ones. we should also be able to place fish
// in the omnipotence and god form. sky, land and water. in water, we have fish types. maybe we add small fish").
// Four kinds live in the water (tune.js FISH; docs/SIM.md "Fish" says why these four): minnows in shoals in the
// shallows near the bank, trout in running water (streams and rivers), pike lurking by the reeds, catfish cruising
// slowly in deep water. Each body of water (a lake, a pond, a river: water cells joined side by side) holds as many of
// each kind as its own kind of water allows, counted from its cells (FISH_*), so a big lake with reeds and a stream
// holds all four and a shallow pond only minnows and perhaps a pike. They are born and die there, never leave the
// water, dart away from people wading or walking the bank close by and from a spear's splash, and are caught by
// fishers (fishing.js), which really takes them out of the water.
//
// When the water changes (the god paints a river, digs a lake, erases water, a flood rises or falls), the bodies are
// counted again: a fish whose water is gone swims to the nearest water within a few steps, or dies. Water that joins
// another is one body, and its fish swim into the new part by themselves. A body with none of a kind it could hold
// gets them back only from the god's hand, or (for water that runs into the mist at the map's edge) when some swim in
// from beyond, now and then; minnows also turn up in new still water in time. The world's water is stocked when the
// simulation starts.
//
// A plugin on the seam (docs/STAGE2-CONTRACTS.md). Fish are not walkers and not in sim.animals: they are light records
// in S.fishApi.list, moved by the step hook and drawn by a frame hook as two instanced meshes (fish-look.js). The god
// places them through sim.spawnAnimal (index.js sends the fish kinds here: fishPlace / fishRemove).
import * as THREE from '../../vendor/three.module.js';
import { T } from './tune.js';
import { makeFishMeshes } from './fish-look.js';
import { B } from '../world/blocks.js';
import { X0, Z0, SX, SZ } from '../edit/vox.js';

export const FISH_IDS = Object.keys(T.FISH);
const rand = Math.random;
const range = (r) => r[0] + rand() * (r[1] - r[0]);
const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export default {
  id: 'fish',
  init(R) {
    const { S, ctx } = R;
    const K = T.FISH;
    const W = ctx.world;
    const N = SX * SZ;
    const land = () => S.land;
    // ---------- the water, as fish see it ----------
    // comp: which body of water a cell belongs to (-1 dry); shore: steps to the nearest dry cell (1 = beside the bank);
    // chan: running water (a narrow channel, or water that steps down); reed: reeds within FISH_REED_NEAR
    const comp = new Int32Array(N).fill(-1), shore = new Uint8Array(N), chan = new Uint8Array(N), reed = new Uint8Array(N);
    const fwd = new Uint16Array(N), bwd = new Uint16Array(N), short = new Uint8Array(N), q = new Int32Array(N);
    let bodies = [];      // { id, cells, caps: {kind: n}, homes: {kind: [cell index]}, edge, any: [cell index] }
    let sig = -1, lastVersion = -1, reedT = 0;
    const ci = (x, z) => (x - X0) + (z - Z0) * SX;
    const inside = (x, z) => x >= X0 && z >= Z0 && x < X0 + SX && z < Z0 + SZ;
    const depthAt = (i) => land().wet[i];
    // the water's surface height at a cell (the top water block's face sits 0.15 under its top, world/mesher.js)
    const surfaceAt = (i) => land().top[i] + land().wet[i] + 0.85;
    function rebuild() {
      const L = land(), wet = L.wet, top = L.top;
      comp.fill(-1);
      bodies = [];
      // bodies: flood fill over wet cells, side by side
      for (let i = 0; i < N; i++) {
        if (!wet[i] || comp[i] >= 0) continue;
        const id = bodies.length, b = { id, cells: 0, caps: {}, homes: {}, any: [], edge: false };
        bodies.push(b);
        let h = 0, t = 0;
        q[t++] = i; comp[i] = id;
        while (h < t) {
          const c = q[h++], x = c % SX, z = (c / SX) | 0;
          b.cells++; b.any.push(c);
          if (ctx.edgeClear(x + X0 + 0.5, z + Z0 + 0.5) < 0.5) b.edge = true;
          if (x > 0 && wet[c - 1] && comp[c - 1] < 0) { comp[c - 1] = id; q[t++] = c - 1; }
          if (x < SX - 1 && wet[c + 1] && comp[c + 1] < 0) { comp[c + 1] = id; q[t++] = c + 1; }
          if (z > 0 && wet[c - SX] && comp[c - SX] < 0) { comp[c - SX] = id; q[t++] = c - SX; }
          if (z < SZ - 1 && wet[c + SX] && comp[c + SX] < 0) { comp[c + SX] = id; q[t++] = c + SX; }
        }
      }
      // shore distance: from the cells beside dry land, inward
      shore.fill(0);
      let h = 0, t = 0;
      for (let i = 0; i < N; i++) {
        if (!wet[i]) continue;
        const x = i % SX, z = (i / SX) | 0;
        if (x === 0 || z === 0 || x === SX - 1 || z === SZ - 1 || !wet[i - 1] || !wet[i + 1] || !wet[i - SX] || !wet[i + SX]) { shore[i] = 1; q[t++] = i; }
      }
      while (h < t) {
        const c = q[h++], d = shore[c];
        if (d >= 15) continue;
        for (const n of [c - 1, c + 1, c - SX, c + SX]) if (n >= 0 && n < N && wet[n] && !shore[n]) { shore[n] = d + 1; q[t++] = n; }
      }
      // running water: a cell whose water is narrow across in at least three of the four directions (a stream is
      // narrow every way but along itself; a lake's edge is narrow only along the shore), or that steps down
      short.fill(0);
      for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const zs = dz < 0 ? SZ - 1 : 0, ze = dz < 0 ? -1 : SZ, zd = dz < 0 ? -1 : 1;
        for (let z = zs; z !== ze; z += zd) for (let x = 0; x < SX; x++) {
          const i = x + z * SX, px = x - dx, pz = z - dz;
          fwd[i] = wet[i] ? (px >= 0 && px < SX && pz >= 0 && pz < SZ ? fwd[px + pz * SX] : 0) + 1 : 0;
        }
        for (let z = ze - zd; z !== zs - zd; z -= zd) for (let x = SX - 1; x >= 0; x--) {
          const i = x + z * SX, nx = x + dx, nz = z + dz;
          bwd[i] = wet[i] ? (nx >= 0 && nx < SX && nz >= 0 && nz < SZ ? bwd[nx + nz * SX] : 0) + 1 : 0;
        }
        for (let i = 0; i < N; i++) if (wet[i] && fwd[i] + bwd[i] - 1 <= T.FISH_CHANNEL_W) short[i]++;
      }
      for (let i = 0; i < N; i++) {
        chan[i] = 0;
        if (!wet[i]) continue;
        if (short[i] >= 3) { chan[i] = 1; continue; }
        const s = top[i] + wet[i], x = i % SX;
        for (const n of [x > 0 ? i - 1 : -1, x < SX - 1 ? i + 1 : -1, i - SX, i + SX]) if (n >= 0 && n < N && wet[n] && top[n] + wet[n] !== s) { chan[i] = 1; break; }
      }
      markReeds();
      // what each body can hold, kind by kind, and where each kind likes to be
      for (const b of bodies) {
        const score = { minnow: 0, trout: 0, pike: 0, catfish: 0 };
        for (const k of FISH_IDS) b.homes[k] = [];
        for (const c of b.any) {
          const d = wet[c], s = shore[c];
          if (s <= T.FISH_SHALLOWS) { score.minnow++; b.homes.minnow.push(c); }
          if (chan[c]) { score.trout++; b.homes.trout.push(c); }
          if (reed[c]) { score.pike++; b.homes.pike.push(c); } else if (s <= 2 && d <= 2) score.pike += T.FISH_PIKE_BARE;
          if (d >= K.catfish.minDepth && s >= 2) { score.catfish++; b.homes.catfish.push(c); }
        }
        for (const k of FISH_IDS) b.caps[k] = Math.min(K[k].max, Math.floor(score[k] / K[k].perCells));
        // pike with no reeds still keep to the shallows by the bank
        if (!b.homes.pike.length) for (const c of b.any) if (shore[c] <= 2 && wet[c] <= 2) b.homes.pike.push(c);
      }
    }
    // reeds stand on the shore or in the shallows: water within FISH_REED_NEAR of one counts as a reed bed
    function markReeds() {
      const L = land(), wet = L.wet, top = L.top;
      reed.fill(0);
      const r = T.FISH_REED_NEAR;
      for (let i = 0; i < N; i++) {
        if (!wet[i]) continue;
        const x = i % SX, z = (i / SX) | 0;
        let found = 0;
        for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r && !found; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
          const j = nx + nz * SX, y = top[j] + wet[j] + 1;
          if (W.get(nx + X0, y, nz + Z0) === B.REED) found = 1;
        }
        reed[i] = found;
      }
    }
    // the water's state in one number: which cells are wet and how deep (the land map's own hash leaves depth out)
    function waterSig() {
      const wet = land().wet;
      let s = 0;
      for (let i = 0; i < N; i++) if (wet[i]) s = (s * 31 + i * 7 + wet[i]) | 0;
      return s;
    }

    // ---------- the fish ----------
    const list = [];      // every fish: { kind: 'fish', k, x, z, yaw, v, body, state, st, tx, tz, age, life, school, t, placed }
    const schools = [];   // minnow shoals: { x, z, yaw, v, tx, tz, state, st, body, members, t }
    const splashes = [];  // { x, y, z, t }
    const log = { born: 0, died: 0, dried: 0, moved: 0, caught: 0, placed: 0, arrived: 0, crowded: 0, stocked: 0, how: {} };
    let seq = 0;
    const okAt = (k, x, z, body) => {
      const fx = Math.floor(x), fz = Math.floor(z);
      if (!inside(fx, fz)) return false;
      const i = ci(fx, fz);
      return comp[i] === body && depthAt(i) >= K[k].minDepth;
    };
    const cellXZ = (c) => ({ x: (c % SX) + X0 + 0.15 + rand() * 0.7, z: ((c / SX) | 0) + Z0 + 0.15 + rand() * 0.7 });
    // a place to swim to: one of its kind's favourite cells in its body, not too far; any water it can be in otherwise
    const lures = [];     // spots where a fisher waits still: { x, z, body } (fishing.js keeps them)
    // a fish (or the shoal it swims in) comes by a waiting fisher: it swims to a spot in the water in front of them
    function comeTo(f, l) {
      const o = f.school ?? f, k = f.k;
      for (let n = 0; n < 8; n++) {
        const a = rand() * TAU, r = 0.2 + rand() * 0.8, x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r;
        if (okAt(k, x, z, o.body)) { o.tx = x; o.tz = z; o.state = 'swim'; o.st = 0; o.coming = true; o.blk = 0; return true; }
      }
      return false;
    }
    function pickTarget(o, k, far = 10) {
      const b = bodies[o.body];
      if (!b) return;
      const homes = b.homes[k]?.length ? b.homes[k] : b.any;
      for (let n = 0; n < 10; n++) {
        const c = homes[(rand() * homes.length) | 0], p = cellXZ(c);
        if (Math.hypot(p.x - o.x, p.z - o.z) > far && n < 8) continue;
        if (!okAt(k, p.x, p.z, o.body)) continue;
        o.tx = p.x; o.tz = p.z; o.state = 'swim'; o.blk = 0;
        return;
      }
      cruise(o, k, 1);
    }
    // the swimming record every fish and shoal carries (made once, so nothing is allocated while they swim):
    // ax, az: the middle of the loop it cruises; R: the loop's size; lp: where along the loop it is; lw: which way round;
    // la: the loop's heading; eight: a figure-eight rather than a loop; ph: its own phase (the speed swells and eases,
    // a shoal member drifts round its place); wag: the tail's phase; blk: game seconds it has been pushing at the bank
    const swimRec = () => ({ ax: 0, az: 0, R: 1, lp: 0, lw: 1, la: 0, eight: false, ph: rand() * TAU, wag: rand() * TAU, blk: 0, coming: false, tight: false, slid: false, py: 0, tr: 0, ringT: rand() * 4, dl: 0 });
    function newFish(k, x, z, body, o = {}) {
      const f = Object.assign({ kind: 'fish', id: `fish${++seq}`, k, name: K[k].one, x, z, y: 0, yaw: rand() * TAU, v: K[k].speed * 0.5, body, state: 'cruise', st: rand() * 2, tx: x, tz: z,
        age: o.age ?? range(K[k].life) * rand(), life: range(K[k].life), school: null, t: rand() * 10, placed: !!o.placed, dead: false }, swimRec());
      f.py = f.yaw;
      cruise(f, k, f.st);
      list.push(f);
      return f;
    }
    function newSchool(x, z, body) {
      const s = Object.assign({ kind: 'fish', k: 'minnow', school: true, name: K.minnow.name, x, z, yaw: rand() * TAU, v: K.minnow.speed * 0.5, tx: x, tz: z, state: 'cruise', st: 1, body, members: [], t: 0 }, swimRec());
      s.py = s.yaw;
      cruise(s, 'minnow', 1);
      schools.push(s);
      return s;
    }
    function joinSchool(f, s) {
      f.school = s; s.members.push(f);
      const n = s.members.length, a = n * 2.4, r = 0.35 + Math.sqrt(n) * 0.32;
      f.ox = Math.cos(a) * r; f.oz = Math.sin(a) * r;
    }
    function removeFish(f, why) {
      if (f.dead) return;
      f.dead = true; f.cause = why;
      const i = list.indexOf(f);
      if (i >= 0) list.splice(i, 1);
      if (f.school) {
        const s = f.school;
        s.members.splice(s.members.indexOf(f), 1);
        if (!s.members.length) schools.splice(schools.indexOf(s), 1);
      }
      log.how[`${f.k} ${why}`] = (log.how[`${f.k} ${why}`] ?? 0) + 1;
      if (why === 'caught') log.caught++;
      else if (why === 'dry') log.dried++;
      else log.died++;
    }
    // a minnow, into a shoal in its body with room (or a new shoal there)
    function addMinnow(x, z, body, o) {
      const f = newFish('minnow', x, z, body, o);
      let s = null, bd = Infinity;
      for (const sc of schools) if (sc.body === body && sc.members.length < K.minnow.school[1]) { const d = Math.hypot(sc.x - x, sc.z - z); if (d < bd) { bd = d; s = sc; } }
      if (!s || bd > 14) s = newSchool(x, z, body);
      joinSchool(f, s);
      atShoal(f, s, 0.5);
      return f;
    }
    // a minnow put down at its place in the shoal, or at the shoal's middle when that place is over the bank
    function atShoal(f, s, spread) {
      const x = s.x + f.ox * spread, z = s.z + f.oz * spread;
      if (okAt('minnow', x, z, s.body)) { f.x = x; f.z = z; } else { f.x = s.x; f.z = s.z; }
    }
    const countIn = (body, k) => { let n = 0; for (const f of list) if (f.body === body && f.k === k) n++; return n; };
    // a kind put into a body, at one of its favourite cells (or anywhere it can swim)
    function stockOne(b, k, o = {}) {
      const homes = b.homes[k]?.length ? b.homes[k] : b.any;
      for (let n = 0; n < 8; n++) {
        const p = cellXZ(homes[(rand() * homes.length) | 0]);
        if (!okAt(k, p.x, p.z, b.id)) continue;
        return k === 'minnow' ? addMinnow(p.x, p.z, b.id, o) : newFish(k, p.x, p.z, b.id, o);
      }
      return null;
    }
    // the world's water at the start: each body filled to a share of what it can hold
    function stockAll(share = T.FISH_STOCK) {
      for (const b of bodies) for (const k of FISH_IDS) {
        const want = b.caps[k] ? Math.max(Math.min(2, b.caps[k]), Math.round(b.caps[k] * share)) : 0;
        for (let n = countIn(b.id, k); n < want; n++) if (stockOne(b, k)) log.stocked++;
      }
    }
    // after the water changed: every fish to the body under it, or the nearest water a few steps off, or it dies
    function reassign() {
      const near = (k, x, z) => {
        const fx = Math.floor(x), fz = Math.floor(z), r = T.FISH_SHIFT_R;
        let best = null, bd = Infinity;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const nx = fx + dx, nz = fz + dz;
          if (!inside(nx, nz)) continue;
          const i = ci(nx, nz);
          if (comp[i] < 0 || depthAt(i) < K[k].minDepth) continue;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = { x: nx + 0.5, z: nz + 0.5, body: comp[i] }; }
        }
        return best;
      };
      for (const s of [...schools]) {
        const fx = Math.floor(s.x), fz = Math.floor(s.z), i = inside(fx, fz) ? ci(fx, fz) : -1;
        if (i >= 0 && comp[i] >= 0) { s.body = comp[i]; continue; }
        const n = near('minnow', s.x, s.z);
        if (n) { s.x = n.x; s.z = n.z; s.body = n.body; s.tx = s.x; s.tz = s.z; }
        else for (const f of [...s.members]) removeFish(f, 'dry');
      }
      for (const f of [...list]) {
        const fx = Math.floor(f.x), fz = Math.floor(f.z), i = inside(fx, fz) ? ci(fx, fz) : -1;
        if (f.school) {
          if (f.school.dead || !schools.includes(f.school)) continue;
          f.body = f.school.body;
          if (i < 0 || comp[i] !== f.body) { f.x = f.school.x; f.z = f.school.z; }
          continue;
        }
        if (i >= 0 && comp[i] >= 0 && depthAt(i) >= K[f.k].minDepth) { f.body = comp[i]; continue; }
        const n = near(f.k, f.x, f.z);
        if (n) { f.x = n.x; f.z = n.z; f.body = n.body; f.tx = f.x; f.tz = f.z; cruise(f, f.k, 0.5); log.moved++; }
        else removeFish(f, 'dry');
      }
    }
    // the land map changed: count the water again if it really changed (cheap check first)
    function watchWater(gdt = 0) {
      const L = land();
      reedT -= gdt;
      if (L.version === lastVersion && reedT > 0) return;
      lastVersion = L.version;
      const s = waterSig();
      if (s !== sig) { sig = s; rebuild(); reassign(); reedT = T.FISH_REED_RESCAN; return; }
      if (reedT <= 0) {
        reedT = T.FISH_REED_RESCAN;
        // reeds grow or are cleared without the water changing: the pike's homes and caps follow
        rebuild();
      }
    }

    // ---------- swimming ----------
    // Fish never stop (the director, 2026-11-16: "they need to swim regardless"). A fish (or a shoal) is always doing
    // one of three things: swimming to a spot it likes (swim), cruising slow loops and figure-eights round that spot
    // (cruise: this was sitting still, 'hold', before), or darting from a fright (dart). Turns are eased at the kind's
    // rate, the speed swells and eases but never drops to nothing, and at the bank a fish slides round along the water
    // instead of stopping or flipping about.
    // the nose must stay in water too (a little ahead), so fish keep off the bank
    const clear = (o, k, sx, sz, dt) => {
      const nx = o.x + sx * o.v * dt, nz = o.z + sz * o.v * dt;
      return okAt(k, nx, nz, o.body) && okAt(k, nx + sx * 0.35, nz + sz * 0.35, o.body);
    };
    const AROUND = [0.35, 0.7, 1.05, 1.45, 1.9, 2.5, Math.PI];
    // turn toward a heading at the kind's rate, ease to a speed, move; with the bank ahead, slide along it
    function swim(o, k, want, speed, dt, turnK = 1) {
      const P = K[k];
      const d = wrap(want - o.yaw), mx = P.turn * turnK * dt;
      o.yaw = wrap(o.yaw + Math.max(-mx, Math.min(mx, d)));
      o.v += (speed - o.v) * Math.min(1, dt * 3);
      o.slid = false;
      let sx = Math.sin(o.yaw), sz = Math.cos(o.yaw);
      if (clear(o, k, sx, sz, dt)) { o.x += sx * o.v * dt; o.z += sz * o.v * dt; o.blk = Math.max(0, o.blk - dt); return true; }
      // the way ahead is the bank: the open water nearest that heading, on the side it wanted to turn first
      const side = d >= 0 ? 1 : -1;
      o.v -= o.v * Math.min(0.5, dt * 1.5);
      for (let j = 0; j < AROUND.length * 2; j++) {
        const da = AROUND[j >> 1] * (j & 1 ? -side : side), a = o.yaw + da;
        sx = Math.sin(a); sz = Math.cos(a);
        if (!clear(o, k, sx, sz, dt)) continue;
        // the body swings that way (up to three times its easy rate) and slides along meanwhile, a little slower
        const tm = P.turn * 3 * dt;
        o.yaw = wrap(o.yaw + Math.max(-tm, Math.min(tm, da)));
        o.x += sx * o.v * dt; o.z += sz * o.v * dt;
        o.blk += dt; o.slid = true;
        return true;
      }
      // boxed in (water no bigger than the fish): it turns round where it is
      o.yaw = wrap(o.yaw + P.turn * dt);
      o.blk += dt; o.slid = true;
      return false;
    }
    // the loop a fish cruises: a loop (an oval) or a figure-eight of size R round (ax, az), turned to la; it starts
    // where the fish is, along the way it is heading, so taking it up needs no turn
    const LP = { x: 0, z: 0 };
    function loopAt(o, th) {
      const R = o.R, u = o.eight ? R * Math.sin(th) : R * Math.cos(th), w = o.eight ? R * 0.55 * Math.sin(2 * th) : R * 0.7 * Math.sin(th);
      const su = Math.sin(o.la), cu = Math.cos(o.la);
      LP.x = o.ax + u * su + w * cu; LP.z = o.az + u * cu - w * su;
    }
    function setLoop(o, R) {
      o.R = R; o.lp = 0;
      // the way the path runs at its start (th 0), turned so that it is the fish's heading
      const du = o.eight ? R : 0, dw = o.eight ? R * 1.1 : R * 0.7;
      o.la = o.yaw - Math.atan2(o.lw * dw, o.lw * du);
      const u0 = o.eight ? 0 : R;
      o.ax = o.x - u0 * Math.sin(o.la); o.az = o.z - u0 * Math.cos(o.la);
    }
    // cruise round here for st game seconds; tight: the small slow circle of a fish lingering in front of a fisher
    function cruise(o, k, st, tight = false) {
      o.state = 'cruise'; o.st = st; o.blk = 0; o.tight = tight;
      o.lw = rand() < 0.5 ? 1 : -1;
      o.eight = !tight && rand() < 0.5;
      let R = tight ? T.FISH_LINGER_R : range(K[k].loop);
      // a loop that would run up the bank is drawn smaller, round the water it has
      for (let n = 0; n < 3; n++) {
        setLoop(o, R);
        let bad = 0;
        for (let j = 0; j < 8; j++) { loopAt(o, (j * TAU) / 8); if (!okAt(k, LP.x, LP.z, o.body)) bad++; }
        if (bad <= 1) break;
        R *= 0.5;
      }
    }
    // the cruising speed: a share of the kind's speed that swells and eases (a glide, never a stop)
    const pace = (o, k) => {
      const C = o.tight ? T.FISH_LINGER_PACE : T.FISH_CRUISE;
      return K[k].speed * (C[0] + (C[1] - C[0]) * (0.5 + 0.5 * Math.sin(o.t * 0.45 + o.ph)));
    };
    // what a fish (or a shoal) does next: swim to a spot, cruise round there a while, dart away from a fright
    function behave(o, k, dt) {
      const P = K[k];
      if (o.state === 'dart') {
        o.st -= dt;
        swim(o, k, o.dartYaw, P.dart, dt, 3);
        if (o.slid) o.dartYaw = o.yaw;
        if (o.st <= 0) cruise(o, k, range(P.hold) * 0.5);
        return;
      }
      if (o.state === 'cruise') {
        o.st -= dt;
        // the point it swims at runs along the loop a little ahead of it, moving on as the fish comes near
        const lead = Math.max(0.3, Math.min(1.2, o.R * 0.6)), step = Math.min(0.6, 0.2 / Math.max(0.1, o.R));
        loopAt(o, o.lp);
        for (let n = 0; n < 8 && Math.hypot(LP.x - o.x, LP.z - o.z) < lead; n++) { o.lp += o.lw * step; loopAt(o, o.lp); }
        if (o.lp > TAU * 4 || o.lp < -TAU * 4) o.lp %= TAU;
        swim(o, k, Math.atan2(LP.x - o.x, LP.z - o.z), pace(o, k), dt, T.FISH_CRUISE_TURN);
        // the loop keeps running into the bank: a smaller one from here
        if (o.blk > 1.2) { o.blk = 0; setLoop(o, Math.max(0.3, o.R * 0.6)); }
        if (o.st <= 0) pickTarget(o, k, k === 'catfish' ? 16 : k === 'pike' ? 6 : 10);
        return;
      }
      const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz);
      // arrived: a fish that came by a fisher lingers there a while, circling small and slow (the moment the spear
      // waits for); any other fish cruises round its new spot
      if (d < 0.5) {
        const came = o.coming;
        o.coming = false;
        cruise(o, k, came ? T.FISH_LINGER[0] + rand() * (T.FISH_LINGER[1] - T.FISH_LINGER[0]) : range(P.hold), came);
        return;
      }
      const sp = o.coming ? Math.max(P.speed, P.dart * T.FISH_COME_PACE) : P.speed;
      swim(o, k, Math.atan2(dx, dz), sp * (d < 2 ? 0.6 : 1), dt);
      if (o.blk > 2.5) { o.blk = 0; o.coming = false; pickTarget(o, k); }
    }
    function fright(o, k, fx, fz) {
      if (o.state === 'dart') return;
      o.coming = false;
      o.state = 'dart'; o.st = 0.5 + rand() * 0.5;
      o.dartYaw = Math.atan2(o.x - fx, o.z - fz) + (rand() - 0.5) * 0.9;
    }
    // people who frighten fish this step: anyone wading, and anyone walking the bank close by
    const scary = [];
    function gatherScary() {
      scary.length = 0;
      const L = land();
      for (const p of S.people) {
        if (p.dead || p.hidden) continue;
        const fx = Math.floor(p.x), fz = Math.floor(p.z);
        if (!inside(fx, fz)) continue;
        const i = ci(fx, fz), wading = L.wet[i] > 0;
        if (!wading && L.wdist[i] > 3) continue;
        // a fisher standing still, spear raised, frightens only what comes right under the spear
        const r = !p.moving ? T.FISH_FEAR_STILL : wading ? T.FISH_FEAR_WADE : T.FISH_FEAR_BANK;
        scary.push(p.x, p.z, r);
      }
    }
    const frightened = (o) => {
      for (let j = 0; j < scary.length; j += 3) if (Math.abs(o.x - scary[j]) < scary[j + 2] && Math.abs(o.z - scary[j + 1]) < scary[j + 2] && Math.hypot(o.x - scary[j], o.z - scary[j + 1]) < scary[j + 2]) return j;
      return -1;
    };
    let fearT = 0;
    function stepAll(dt) {
      fearT -= dt;
      const look = fearT <= 0;
      if (look) { fearT = 0.25; gatherScary(); }
      for (const s of schools) {
        s.t += dt;
        if (look && scary.length) { const j = frightened(s); if (j >= 0) fright(s, 'minnow', scary[j], scary[j + 1]); }
        behave(s, 'minnow', dt);
      }
      for (const f of list) {
        f.t += dt;
        if (f.school) {
          // a shoal: each minnow keeps its place round the shoal's middle, the places turning slowly, and drifts a
          // little about its place; it swims with the shoal and eases toward its place (one ahead of its place slows
          // rather than turning back), so the shoal turns together
          const s = f.school, a = s.t * 0.4, c = Math.cos(a), sn = Math.sin(a), dr = T.FISH_SHOAL_DRIFT;
          const ox = f.ox + Math.sin(f.t * 0.9 + f.ph) * dr, oz = f.oz + Math.cos(f.t * 0.7 + f.ph * 1.3) * dr;
          const tx = s.x + ox * c - oz * sn, tz = s.z + ox * sn + oz * c;
          const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
          const vx = Math.sin(s.yaw) * s.v + dx * 1.6, vz = Math.cos(s.yaw) * s.v + dz * 1.6;
          const sp = Math.max(K.minnow.speed * T.FISH_CRUISE[0], Math.min(K.minnow.dart * 1.2, Math.hypot(vx, vz)));
          swim(f, 'minnow', Math.atan2(vx, vz), sp, dt, d > 1 ? 2.5 : 1.2);
          if (d > 3) { f.x = s.x; f.z = s.z; } // left behind round a bend: back with the shoal
        } else {
          if (look && scary.length) { const j = frightened(f); if (j >= 0) fright(f, f.k, scary[j], scary[j + 1]); }
          behave(f, f.k, dt);
        }
        // the tail: its beat quickens with speed for the fish's size; and how fast the fish is turning (a minnow
        // flashes silver as it turns; the look may ring the water where a fish turns)
        const P = K[f.k], hz = Math.min(T.FISH_WAG_MAX, T.FISH_WAG_BASE + (T.FISH_WAG_PER * f.v) / P.len);
        f.wag += dt * TAU * hz;
        if (f.wag > TAU) f.wag -= TAU;
        if (dt > 0) { f.tr += (Math.abs(wrap(f.yaw - f.py)) / dt - f.tr) * Math.min(1, dt * 6); f.py = f.yaw; }
      }
      for (let i = splashes.length - 1; i >= 0; i--) { splashes[i].t += dt; if (splashes[i].t > T.FISH_SPLASH_S) splashes.splice(i, 1); }
      M.step(dt, list);
    }

    // ---------- births, deaths, arrivals ----------
    let popLife = 0, popYears = 0;
    function population(dLife, dYears) {
      popLife += dLife; popYears += dYears;
      if (popLife < 0.25) return;
      const dl = popLife, dy = popYears;
      popLife = 0; popYears = 0;
      for (const f of [...list]) { f.age += dl; if (f.age > f.life) removeFish(f, 'old age'); }
      const n = {};
      for (const f of list) { const key = f.body * 8 + FISH_IDS.indexOf(f.k); n[key] = (n[key] ?? 0) + 1; }
      for (const b of bodies) for (let ki = 0; ki < FISH_IDS.length; ki++) {
        const k = FISH_IDS[ki], have = n[b.id * 8 + ki] ?? 0, cap = b.caps[k];
        if (have > cap) {
          // more than the water can hold (it shrank, or the god put in too many): the extra ones die off
          if (rand() < (have - cap) * T.FISH_CROWD_DIE * dl) { const f = list.find((x) => x.body === b.id && x.k === k); if (f) { removeFish(f, 'crowded'); log.crowded++; } }
          continue;
        }
        // (one fish stands for a few nobody sees: a single fish breeds too, slower as the water fills)
        if (have >= 1) {
          const want = have * K[k].birth * (1 - have / Math.max(1, cap)) * dl;
          for (let m = Math.floor(want) + (rand() < want % 1 ? 1 : 0); m > 0; m--) { if (stockOne(b, k, { age: 0 })) log.born++; }
        } else if (cap > 0 && have === 0) {
          // none left of a kind this water could hold: minnows turn up in time (eggs carried on birds' feet, people say),
          // others swim in from beyond the mist (water that runs to the map's edge) or, more rarely, along ditches in a wet year
          const every = k === 'minnow' ? T.FISH_ARRIVE_YEARS : b.edge ? T.FISH_RETURN_YEARS : T.FISH_STRAY_YEARS;
          if (every && rand() < dy / every) { const c = k === 'minnow' ? 4 : 2; for (let m = 0; m < c; m++) if (stockOne(b, k)) log.arrived++; }
        }
      }
    }

    // ---------- drawing (a frame hook: also in creation, where time stands still) ----------
    // the look is chosen by the address (fish-look.js: ?fish=a, b or c; none is today's)
    const M = makeFishMeshes(T.FISH_DRAW_MAX, { K, T, camera: ctx.camera });
    for (const m of M.layer) ctx.layers.entities.add(m);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    let drawFrame = 0;
    function draw() {
      const L = land();
      M.begin();
      for (const f of list) {
        const fx = Math.floor(f.x), fz = Math.floor(f.z);
        if (!inside(fx, fz)) continue;
        const i = ci(fx, fz);
        if (!L.wet[i]) continue;
        const k = Math.max(0, Math.min(1, (ctx.edgeClear(f.x, f.z) - 0.1) / 0.5));
        if (k <= 0) continue;
        M.put(f, surfaceAt(i) + 0.03, k);
      }
      M.end(S.daylight ?? 1);
      let s = 0;
      _q.identity();
      for (const sp of splashes) {
        if (s >= 32) break;
        const a = sp.t / T.FISH_SPLASH_S;
        for (let r = 0; r < 2 && s < 32; r++) {
          const g = Math.max(0, a - r * 0.3);
          if (g <= 0) continue;
          const sc = (0.4 + g * 2.2) * (1 - g * 0.5);
          _p.set(sp.x, sp.y, sp.z); _s.set(sc, 1, sc);
          M.splash.setMatrixAt(s++, _m.compose(_p, _q, _s));
        }
      }
      M.splash.count = s; M.splash.visible = s > 0;
      if (s) M.splash.instanceMatrix.needsUpdate = true;
      drawFrame++;
    }
    if (Array.isArray(ctx.frame)) ctx.frame.push(() => {
      // in creation (and before the first running frame) the simulation does not scan the land: the god's water edits
      // reach the fish here
      if (ctx.clock.phase !== 'running' && land().needFull) { land().fullScan(); }
      if (ctx.clock.phase !== 'running') watchWater(0);
      draw();
    });

    // ---------- the god's hand: place a fish, take it back ----------
    const say = { dry: 'Fish need water. Put them in a river, a lake or a pond.', mist: 'Lost in the mist. What you cannot see, you cannot touch.' };
    function place(k, x, z) {
      const no = (reason, text) => ({ entity: null, reason, text });
      if (!K[k]) return no('kind', 'There is no such fish here.');
      const L = land();
      if (L.needFull) L.fullScan();
      watchWater(0);
      const cx = Math.floor(x), cz = Math.floor(z);
      if (!inside(cx, cz) || ctx.edgeClear(x, z) < 0.5) return no('mist', say.mist);
      const i = ci(cx, cz);
      if (comp[i] < 0) return no('dry', say.dry);
      if (depthAt(i) < K[k].minDepth) {
        // a step or two off there is deep enough water: it goes there
        let best = null, bd = Infinity;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const nx = cx + dx, nz = cz + dz; if (!inside(nx, nz)) continue; const j = ci(nx, nz); if (comp[j] === comp[i] && depthAt(j) >= K[k].minDepth && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = { x: nx + 0.5, z: nz + 0.5 }; } }
        if (!best) return no('shallow', `Too shallow for ${K[k].name.toLowerCase()} here: they need water at least ${K[k].minDepth} deep. Put them in deeper water.`);
        x = best.x; z = best.z;
      }
      log.placed++;
      if (k === 'minnow') {
        // minnows come as a small shoal
        const s = newSchool(x, z, comp[i]);
        const m = Math.round(range(K.minnow.school));
        for (let j = 0; j < m; j++) { const f = newFish('minnow', x, z, comp[i], { placed: true }); joinSchool(f, s); atShoal(f, s, 0.4); }
        s.placed = true;
        return { entity: s, reason: null, text: null };
      }
      const f = newFish(k, x, z, comp[i], { placed: true, age: 1 });
      return { entity: f, reason: null, text: null };
    }
    function remove(e) {
      if (!e) return false;
      if (e.school && e.members) { const had = e.members.length; for (const f of [...e.members]) removeFish(f, 'taken'); return had > 0; }
      if (!list.includes(e)) return false;
      removeFish(e, 'taken');
      return true;
    }

    // ---------- for the fishers (fishing.js) ----------
    // fish a fisher at (x, z) could strike: in the water, within r, a kind not fished down to its last few in its body
    function within(x, z, r, out = []) {
      out.length = 0;
      for (const f of list) if (Math.abs(f.x - x) < r && Math.abs(f.z - z) < r && Math.hypot(f.x - x, f.z - z) < r) out.push(f);
      return out;
    }
    const spare = (f) => countIn(f.body, f.k) > T.FISH_KEEP;
    const splash = (x, z) => {
      const fx = Math.floor(x), fz = Math.floor(z), y = inside(fx, fz) && land().wet[ci(fx, fz)] ? surfaceAt(ci(fx, fz)) + 0.04 : land().topAt(fx, fz) + 1.05;
      splashes.push({ x, y, z, t: 0 });
      if (splashes.length > 16) splashes.shift();
      for (const f of list) if (!f.school && Math.hypot(f.x - x, f.z - z) < T.FISH_SPLASH_R) fright(f, f.k, x, z);
      for (const s of schools) if (Math.hypot(s.x - x, s.z - z) < T.FISH_SPLASH_R + 1) fright(s, 'minnow', x, z);
    };
    S.fishApi = {
      list, schools, lures, comeTo, bodies: () => bodies, log, comp, shore, chan, reed, ci, inside, within, spare, splash, countIn, surfaceAt,
      take: (f) => { removeFish(f, 'caught'); return K[f.k].food; },
      place, remove, stockAll, rebuild: () => { sig = -1; lastVersion = -1; watchWater(0); },
      drawStats: () => ({ look: M.look, fish: M.count(), shadows: M.shadow.count, splash: M.splash.count, rings: M.ring?.count ?? 0, drawCalls: M.drawCalls(), frames: drawFrame }),
    };

    // ---------- the hooks ----------
    // the world's water is counted and stocked at once (creation shows its fish; the god can add more before time runs)
    watchWater(0);
    stockAll();
    R.on('step', ({ dt, dYears, dLife }) => {
      watchWater(dt);
      stepAll(dt);
      population(dLife, dYears);
    });
    R.answer('fishPlace', (k, x, z) => (K[k] ? place(k, x, z) : undefined));
    R.answer('fishRemove', (e) => remove(e));
    R.answer('fishCount', (k) => (k ? list.filter((f) => f.k === k).length : list.length));
    R.answer('fishLog', () => ({ ...log, now: list.length, byKind: Object.fromEntries(FISH_IDS.map((k) => [k, list.filter((f) => f.k === k).length])), bodies: bodies.length,
      caps: Object.fromEntries(FISH_IDS.map((k) => [k, bodies.reduce((a, b) => a + b.caps[k], 0)])) }));
    // the fish in the water of the body at (x, z), kind by kind, and what it can hold (for the screen and the checks)
    R.answer('fishWater', (x, z) => {
      const fx = Math.floor(x), fz = Math.floor(z);
      if (!inside(fx, fz)) return null;
      const b = bodies[comp[ci(fx, fz)]];
      if (!b) return null;
      return { cells: b.cells, caps: { ...b.caps }, fish: Object.fromEntries(FISH_IDS.map((k) => [k, countIn(b.id, k)])) };
    });
    R.on('stats', (st) => { st.fish = list.length; });
  },
};
