// What is under the cursor: the ground (a voxel ray that looks through
// leaves and grass), and the entity (the first visible block's owner, or the
// nearest prop or character mesh the ray meets, with a little help for tiny
// things).
// Ported from the source repo's dev/planner/pick.js. Changed: the fallback
// plane (a ray that misses the world) is the ground height, not the source's 6.
import * as THREE from '../../vendor/three.module.js';
import { B, isCross } from '../world/blocks.js';
import { idx, inB, SY, X0, Z0, X1, Z1, TREE_IDS, STRUCT_IDS, GROUND_Y } from '../edit/vox.js';

// walk the grid along a ray; returns { x, y, z, id, t, nx, ny, nz } of the first cell `hit(id, i)` accepts
export function voxelRay(W, ray, hit, maxT = 3000) {
  const o = ray.origin, dvec = ray.direction;
  // clip to the world box
  let t0 = 0, t1 = maxT;
  for (const [oa, da, lo, hi] of [[o.x, dvec.x, X0, X1], [o.y, dvec.y, 0, SY], [o.z, dvec.z, Z0, Z1]]) {
    if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return null; continue; }
    let a = (lo - oa) / da, b = (hi - oa) / da;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t0 > t1) return null;
  const e = 1e-4;
  let x = Math.floor(o.x + dvec.x * (t0 + e)), y = Math.floor(o.y + dvec.y * (t0 + e)), z = Math.floor(o.z + dvec.z * (t0 + e));
  const sx = Math.sign(dvec.x), sy = Math.sign(dvec.y), sz = Math.sign(dvec.z);
  const next = (p, s, dd, oo) => (s > 0 ? (p + 1 - oo) / dd : s < 0 ? (p - oo) / dd : Infinity);
  let tx = next(x, sx, dvec.x, o.x), ty = next(y, sy, dvec.y, o.y), tz = next(z, sz, dvec.z, o.z);
  const dx = sx ? Math.abs(1 / dvec.x) : Infinity, dy = sy ? Math.abs(1 / dvec.y) : Infinity, dz = sz ? Math.abs(1 / dvec.z) : Infinity;
  let nx = 0, ny = 0, nz = 0, t = t0;
  for (let k = 0; k < 1200; k++) {
    if (inB(x, y, z)) {
      const i = idx(x, y, z), id = W.data[i];
      if (id !== B.AIR && hit(id, i)) return { x, y, z, id, i, t, nx, ny, nz };
    } else if (t > t1 + 1) return null;
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; nx = -sx; ny = 0; nz = 0; } else if (ty < tz) { y += sy; t = ty; ty += dy; nx = 0; ny = -sy; nz = 0; } else { z += sz; t = tz; tz += dz; nx = 0; ny = 0; nz = -sz; }
    if (t > t1 + 1) return null;
  }
  return null;
}

export function makePicker(P, C) {
  const W = P.V.W;
  const isGround = (id) => !isCross(id) && !TREE_IDS.has(id) && !STRUCT_IDS.has(id) && id !== B.BUSH && id !== B.BUSH_BARE;
  const visibleCell = (id, i) => {
    if (isCross(id)) return false;
    const o = P.owner[i];
    if (o) { const e = P.list[o]; if (e && P.filters[e.cat]?.hidden) return false; }
    return true;
  };
  const K = {};
  // the ground under the cursor: { x, z, y (top), id, cell } or a plane hit
  K.ground = (px, py) => {
    const r = C.ray(px, py);
    const h = voxelRay(W, r, (id) => isGround(id) || id === B.WATER);
    if (h) {
      const p = r.origin.clone().addScaledVector(r.direction, h.t);
      // a hit on a side face: the point is on the face; nudge into the cell for x, z
      return { x: Math.min(h.x + 0.999, Math.max(h.x, p.x)), z: Math.min(h.z + 0.999, Math.max(h.z, p.z)), y: h.y + 1, id: h.id, cx: h.x, cz: h.z, top: h.y, water: h.id === B.WATER };
    }
    const q = C.onPlane(px, py, GROUND_Y + 1);
    return q ? { x: q.x, z: q.z, y: GROUND_Y + 1, id: B.AIR, cx: Math.floor(q.x), cz: Math.floor(q.z), top: GROUND_Y, off: true } : null;
  };
  const rcHits = [];
  // the entity under the cursor
  K.entity = (px, py) => {
    const ray = C.ray(px, py);
    let best = null, bestT = Infinity;
    const v = voxelRay(W, ray, visibleCell);
    if (v) {
      const o = P.owner[v.i];
      const e = o ? P.list[o] : null;
      if (e && P.alive(e) && !e.removed) { best = e; bestT = v.t; } else bestT = v.t;
      if (!e) best = null;
    }
    const rc = C.raycaster(px, py);
    for (const e of P.list) {
      if (!e || !e.objs.length || !P.alive(e) || e.removed || P.filters[e.cat]?.hidden) continue;
      if (!aabbHit(ray, e)) continue;
      for (const o of e.objs) {
        if (!o.obj.visible) continue;
        rcHits.length = 0;
        rc.intersectObject(o.obj, true, rcHits);
        const hit = rcHits.find((h) => !h.object.userData.noPick);
        if (hit && hit.distance < bestT + 0.01) { bestT = hit.distance; best = e; }
      }
    }
    if (best) return best;
    // little things are hard to hit: anything small whose foot is within 14 px
    let near = null, nd = 14;
    for (const e of P.list) {
      if (!e || !P.alive(e) || e.removed || P.filters[e.cat]?.hidden) continue;
      if (e.foot.w * e.foot.d > 6 && e.cat !== 'person' && e.cat !== 'animal' && e.cat !== 'holy') continue;
      const s = C.toScreen(e.x, e.y + Math.min(1, e.foot.h / 2), e.z);
      const dd = Math.hypot(s.x - px, s.y - py);
      if (dd < nd) { nd = dd; near = e; }
    }
    return near;
  };
  // removed things leave a faint marker that can still be clicked
  K.removed = (px, py) => {
    let near = null, nd = 18;
    for (const e of P.list) {
      if (!e || !e.removed || e.deleted || P.filters[e.cat]?.hidden) continue;
      const s = C.toScreen(e.x, e.y, e.z);
      const dd = Math.hypot(s.x - px, s.y - py);
      if (dd < nd) { nd = dd; near = e; }
    }
    return near;
  };
  return K;
}

// a ray against an entity's rough world box (broad phase for mesh tests)
const _b = new THREE.Box3(), _v = new THREE.Vector3();
function aabbHit(ray, e) {
  const f = e.foot, r = Math.hypot(f.w, f.d) / 2 + 0.6;
  const cx = e.x + f.cx, cz = e.z + f.cz;
  _b.min.set(cx - r, e.y - 1, cz - r); _b.max.set(cx + r, e.y + f.h + 1, cz + r);
  return ray.intersectBox(_b, _v) !== null;
}
