// Walking on the voxel ground. Ported from the source repo's npc/npc.js
// (colGround, footTop, passable, tryMove, jumpWouldHelp, groundTick,
// separateTick): columns span [x, x+1) so lookups floor; ground is found by
// scanning DOWN from just above the feet so roofs never count, and leaves are
// never ground (they still block the body and the head); a one-block step is
// hopped, a two-block rise is jumped (step 1.05, jump 2.2, as in the source)
// and a jump stops rising at a ceiling; walls of more are never walked through. Changed: a character can
// refuse water and drops (predators, deer), separation uses a spatial hash
// instead of every pair, and a character follows an A* path (land.js) rather
// than wandering straight at a target. Left behind: the player as an
// obstacle, scripted beats, the far-sleep observer.
import { B, isSolid, isWater } from '../world/blocks.js';
import { SY, X0, Z0, X1, Z1 } from '../edit/vox.js';
import { T } from './tune.js';

const clampX = (v) => Math.min(X1 - 1.5, Math.max(X0 + 1.5, v));
const clampZ = (v) => Math.min(Z1 - 1.5, Math.max(Z0 + 1.5, v));

// Leaves are solid (nobody walks through a crown, and they count for headroom)
// but they are never ground to stand on: a character placed or falling under a
// tree comes down to the grass beneath it, not onto the crown. A placed
// character also ignores a roof (a hut's thatch) and comes down beside or under it.
export const LEAF_IDS = new Set([B.LEAVES, B.LEAVES_DARK, B.LEAVES_BRIGHT]);
const ROOF_IDS = new Set([B.THATCH]);
const footing = (id) => isSolid(id) && !LEAF_IDS.has(id);

function colGround(W, cx, cz, feetY) {
  let y = Math.min(SY - 1, Math.floor(feetY) + 1);
  while (y >= 0 && !footing(W.get(cx, y, cz))) y--;
  return y;
}
// the height a character placed at a column stands on: the highest block that
// is neither a leaf nor a roof, plus one (-1 + 1 when the column is empty)
export function standHeight(W, cx, cz) {
  let y = SY - 1;
  for (; y >= 0; y--) { const id = W.get(cx, y, cz); if (footing(id) && !ROOF_IDS.has(id)) break; }
  return y + 1;
}
function footTop(W, x, z, r, feetY) {
  let best = -1;
  for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
    for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) best = Math.max(best, colGround(W, cx, cz, feetY));
  return best;
}
// `here`: the cells the walker stands in now (keys cx * 4096 + cz), whose room
// overhead is not judged (a walker wedged under a low crown may walk out of it)
function passable(W, e, nx, nz, feetY, here = null) {
  const r = e.r;
  for (let cx = Math.floor(nx - r); cx <= Math.floor(nx + r); cx++)
    for (let cz = Math.floor(nz - r); cz <= Math.floor(nz + r); cz++) {
      const t = colGround(W, cx, cz, feetY);
      if (t < 0) return false;
      if (t + 1 - feetY > T.STEP) return false;            // wall or cliff face
      if (!here?.includes(cx * 4096 + cz) && (isSolid(W.get(cx, t + 1, cz)) || isSolid(W.get(cx, t + 2, cz)))) return false; // no room for the body (leaves count here)
      if (e.noWater && isWater(W.get(cx, t + 1, cz))) return false;
      if (e.maxDrop != null && feetY - (t + 1) > e.maxDrop + 0.2) return false;
    }
  return true;
}
const S45 = Math.SQRT1_2;
export function tryMove(W, e, dx, dz, dist) {
  // A body that already stands wedged (it stepped down beside a high step and
  // its width now overlaps it, or it stands under a crown too low for it) is
  // judged by its feet alone and without its own cell's ceiling, so it can walk
  // out instead of being held there.
  const free = passable(W, e, e.x, e.z, e.y);
  const body = free ? e : { ...e, r: GROUND_R };
  let here = null;
  if (!free) {
    here = [];
    for (let cx = Math.floor(e.x - GROUND_R); cx <= Math.floor(e.x + GROUND_R); cx++)
      for (let cz = Math.floor(e.z - GROUND_R); cz <= Math.floor(e.z + GROUND_R); cz++) here.push(cx * 4096 + cz);
  }
  const ok = (nx, nz) => passable(W, body, nx, nz, e.y, here);
  const rise = (nx, nz) => footTop(W, nx, nz, e.r, e.y + 0.1) + 1 - e.y;
  const level = (nx, nz) => ok(nx, nz) && rise(nx, nz) <= 0.35;
  const nx0 = clampX(e.x + dx * dist), nz0 = clampZ(e.z + dz * dist);
  if (ok(nx0, nz0)) { e.x = nx0; e.z = nz0; return true; }
  const sx1 = (dx - dz) * S45, sz1 = (dx + dz) * S45, sx2 = (dx + dz) * S45, sz2 = (dz - dx) * S45;
  const cands = [
    Math.abs(dx) > 1e-4 ? [e.x + dx * dist, e.z] : null,
    Math.abs(dz) > 1e-4 ? [e.x, e.z + dz * dist] : null,
    [e.x + sx1 * dist, e.z + sz1 * dist], [e.x + sx2 * dist, e.z + sz2 * dist],
  ];
  for (const test of [level, ok]) for (const c of cands) {
    if (!c) continue;
    const nx = clampX(c[0]), nz = clampZ(c[1]);
    if (test(nx, nz)) { e.x = nx; e.z = nz; return true; }
  }
  return false;
}

const JUMP_V0 = 9.9, JUMP_G = 22; // the source's player jump: clears about 2.2 blocks
// A jump is made only when it would land the character on the ledge ahead: a
// rise of more than a step and at most a jump, room for the body on top (and
// dry, for those who refuse water), and nothing overhead to stop the jump on
// the way up. Anything else (a wall, a trunk, a high bank) is not jumped at.
export function jumpWouldHelp(W, e, dx, dz) {
  if (e.noJump) return false;
  const nx = clampX(e.x + dx * (e.r + 0.75)), nz = clampZ(e.z + dz * (e.r + 0.75));
  const t = footTop(W, nx, nz, e.r, e.y + T.JUMP + 0.6);
  if (t < 0) return false;
  const rise = t + 1 - e.y;
  if (rise <= T.STEP || rise > T.JUMP) return false;
  const lx = Math.floor(nx), lz = Math.floor(nz);
  if (isSolid(W.get(lx, t + 1, lz)) || isSolid(W.get(lx, t + 2, lz))) return false;
  if (e.noWater && isWater(W.get(lx, t + 1, lz))) return false;
  const cx = Math.floor(e.x), cz = Math.floor(e.z);
  for (let y = Math.floor(e.y + headOf(e)); y <= Math.floor(t + 1 + headOf(e)); y++) if (isSolid(W.get(cx, y, cz))) return false;
  return true;
}

const GROUND_R = 0.15, FALL_V0 = 4, FALL_ACC = 30, FALL_MAX = 16;
// how far above the feet a body reaches, for ceilings (within the two blocks of room a walker needs)
const headOf = (e) => Math.min(1.7, e.foot?.h ?? 1.7);
// vertical: hop a step, jump arcs, fall with gravity, wade in water. Returns true when wading.
export function groundTick(W, e, dt) {
  const g = footTop(W, e.x, e.z, GROUND_R, e.y + 0.1);
  if (g < 0) return false;
  e.groundY = g + 1;
  let target = g + 1, wading = false;
  const cx = Math.floor(e.x), cz = Math.floor(e.z);
  if (isWater(W.get(cx, g + 1, cz))) {
    let w = g + 1;
    while (w + 1 < SY && isWater(W.get(cx, w + 1, cz))) w++;
    wading = true;
    target = Math.max(g + 1, w + 0.25 - (e.child ? 0 : 0.35));
  }
  if (e.jumpV != null) {
    e.jumpV -= JUMP_G * dt;
    const ny = e.y + e.jumpV * dt;
    // a rising jump stops at a ceiling: the head never goes into a solid block (a crown's leaves count)
    if (e.jumpV > 0 && isSolid(W.get(cx, Math.floor(ny + headOf(e)), cz))) e.jumpV = 0;
    else e.y = ny;
    if (e.jumpV <= 0 && e.y <= target) { e.y = target; e.jumpV = null; e.fallV = 0; }
    return wading;
  }
  const dy = target - e.y;
  if (!wading && !e.hop && dy > 0.55) e.hop = { from: e.y, t: 0 };
  if (e.hop) {
    const h = e.hop;
    h.t += dt;
    const k = Math.min(1, h.t / 0.36);
    e.y = h.from + (target - h.from) * k + Math.sin(Math.PI * k) * 0.26;
    if (k >= 1) { e.y = target; e.hop = null; }
    e.fallV = 0;
    return wading;
  }
  if (dy > 0.001) { e.fallV = 0; e.y = Math.min(target, e.y + Math.max(3 * dt, dy * Math.min(1, 14 * dt))); }
  else if (dy < -0.001) {
    e.fallV = Math.min(FALL_MAX, Math.max(FALL_V0, e.fallV || 0) + FALL_ACC * dt);
    e.y = Math.max(target, e.y - e.fallV * dt);
    if (e.y <= target) e.fallV = 0;
  } else e.fallV = 0;
  return wading;
}
export function snapToGround(W, e) {
  e.y = e.groundY = standHeight(W, Math.floor(e.x), Math.floor(e.z));
  e.jumpV = null; e.hop = null; e.fallV = 0;
}

// one step toward (tx, tz) at `speed`; returns true if the character moved
export function stepToward(W, e, tx, tz, speed, dt) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return false;
  const ux = dx / d, uz = dz / d;
  const moved = tryMove(W, e, ux, uz, Math.min(speed * dt, d));
  e.yawT = Math.atan2(dx, dz);
  if (e.jumpV == null && !e.hop) {
    e.noProgT = moved ? 0 : (e.noProgT || 0) + dt;
    if (moved) e.vainJumps = 0;
    e.jumpCool = Math.max(0, (e.jumpCool || 0) - dt);
    // jump only up a ledge the jump can clear; two jumps in a row that got nowhere and it stops trying
    if (!moved && e.jumpCool === 0 && !e.noJump && (e.vainJumps || 0) < 2 && jumpWouldHelp(W, e, ux, uz)) {
      e.jumpV = JUMP_V0; e.fallV = 0; e.hop = null; e.noProgT = 0; e.jumpCool = 0.65;
      e.vainJumps = (e.vainJumps || 0) + 1;
    }
  }
  return moved;
}

// Follow e.path (land.findPath output). Returns 'moving', 'arrived' or 'stuck'.
export function followPath(W, e, speed, dt) {
  const p = e.path;
  if (!p || e.pi >= p.length) return 'arrived';
  let wx, wz, last, d;
  // a waypoint reached turns to the next one in the same step: the walker does
  // not stand still for a step at every corner (at speed 4 that showed as a
  // hitch each time; measured 1 to 3 percent of walking frames)
  for (;;) {
    [wx, wz] = p[e.pi];
    last = e.pi === p.length - 1;
    d = Math.hypot(wx - e.x, wz - e.z);
    if (d >= (last ? (e.arriveR ?? 0.45) : 0.7)) break;
    e.pi++; e.stuckT = 0;
    if (e.pi >= p.length) return 'arrived';
  }
  // a new path starts with a clean slate
  if (e.stuckPath !== p) { e.stuckPath = p; e.noProgT = 0; e.stuckPi = -1; e.vainJumps = 0; }
  stepToward(W, e, wx, wz, speed, dt);
  if (e.jumpV != null || e.hop) return 'moving';
  // Stuck, reported at once so the walker's owner can choose another way:
  // blocked outright (no step taken for 0.6 s and no jump that would clear it),
  // or sliding along something without closing on the waypoint for 2 s. Stuck
  // within reach of the end of the walk counts as arriving.
  let stuck = e.noProgT > 0.6;
  if (e.stuckPi !== e.pi) { e.stuckPi = e.pi; e.stuckD = d; e.stuckT = 0; }
  e.stuckT += dt;
  if (!stuck && e.stuckT > 2) { stuck = e.stuckD - d < 0.3; e.stuckT = 0; e.stuckD = d; }
  if (!stuck) return 'moving';
  e.noProgT = 0; e.stuckT = 0; e.stuckPi = -1;
  if (last && d < (e.arriveR ?? 0.45) + 0.9) { e.pi = p.length; return 'arrived'; }
  return 'stuck';
}

// characters push gently apart (the source's separateTick, over a spatial hash)
const SEP_START = 0.55, SEP_HARD = 0.4, SEP_SPEED = 0.9, SEP_HARD_SPEED = 2.8;
const grid = new Map();
export function separateAll(W, list, dt) {
  grid.clear();
  for (const e of list) {
    if (e.hidden || e.dead) continue;
    const k = (Math.floor(e.x) >> 1) * 4096 + (Math.floor(e.z) >> 1);
    let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(e);
  }
  for (const e of list) {
    if (e.hidden || e.dead || e.still) continue;
    const gx = Math.floor(e.x) >> 1, gz = Math.floor(e.z) >> 1;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const b = grid.get((gx + ox) * 4096 + gz + oz);
      if (!b) continue;
      for (const o of b) {
        if (o === e) continue;
        let dx = e.x - o.x, dz = e.z - o.z;
        const d2 = dx * dx + dz * dz, need = SEP_START * Math.max(e.sepR ?? 1, o.sepR ?? 1);
        if (d2 >= need * need || Math.abs(e.y - o.y) > 2.4) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { const a = (e.seed ?? 1) * 2.399963; dx = Math.sin(a); dz = Math.cos(a); d = 0; } else { dx /= d; dz /= d; }
        const step = Math.min(need - d, (d < SEP_HARD ? SEP_HARD_SPEED : SEP_SPEED) * dt);
        if (step > 0) tryMove(W, e, dx, dz, step);
      }
    }
  }
}

export function angTo(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function turn(e, dt, rate = 9) {
  const d = angTo(e.ry, e.yawT ?? e.ry), m = rate * dt;
  e.ry += Math.abs(d) <= m ? d : Math.sign(d) * m;
}
