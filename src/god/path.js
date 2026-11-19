// The Path tool (L): click along the way, double-click or Enter lays it,
// Backspace takes the last point off, Esc stops. A path is a thing (category
// 'path'): click a laid path with the tool to select it, Del takes it up and the
// ground under it comes back exactly. Every write goes through the recorded
// writer, so laying and taking up are one undo step each.
// Ported from the source repo's dev/planner/pathtool.js (stampCells, the laying
// record, cutSteps, heal, the entity, its outline, picking by line). Changed:
// the path kinds are this game's blocks (tools.js PATH_KINDS: trodden earth,
// a broken trail, bare dirt, sand, stone, a dry grass track), not the history
// game's buildPath/layTrails/lane rules (pathscan.js, left behind); no ford
// marking (that was a note for the planner's agent); no inspector (the HUD's);
// refused cells (mist, protected) are left as they are.
import { B, isCross } from '../world/blocks.js';
import { noise2 } from '../world/noise.js';
import { inB, SY } from '../edit/vox.js';
import { hash2 } from './trees.js';
import { PATH_KINDS } from './tools.js';

const OPEN = new Set([B.GRASS, B.GRASS_DRY, B.DIRT, B.PATH, B.SAND, B.SNOWGRASS, B.FARMLAND, B.STONE]);
const r1 = (v) => Math.round(v * 10) / 10;
export const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
const distSeg = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };

// which cells a line covers, by the kind's brush: [{ x, z, k }] in order (k: the step along the line)
export function stampCells(points, kind, width) {
  const K = PATH_KINDS[kind] ?? PATH_KINDS.earth, w = Math.max(1, Math.min(5, Math.round(width))), out = [], seen = new Set();
  const add = (x, z, k) => { const key = `${x},${z}`; if (seen.has(key)) return; seen.add(key); out.push({ x, z, k }); };
  let k = 0;
  const lo = -(Math.ceil(w / 2) - 1), hi = Math.floor(w / 2);
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (K.stamp === 'line') { // a block at a time, widened across the way
      const steps = Math.max(1, Math.ceil(L)), ew = Math.abs(dx) > Math.abs(dz);
      for (let s = 0; s <= steps; s++, k++) {
        const x = Math.round(ax - 0.5 + dx * s / steps), z = Math.round(az - 0.5 + dz * s / steps);
        for (let o = lo; o <= hi; o++) add(ew ? x : x + o, ew ? z + o : z, k);
      }
    } else if (K.stamp === 'square') { // every half metre, a width x width square
      const n = Math.max(1, Math.ceil(L * 2));
      for (let s = 0; s <= n; s++) {
        const x = ax + dx * s / n, z = az + dz * s / n;
        for (let ox = 0; ox < w; ox++) for (let oz = 0; oz < w; oz++) add(Math.floor(x - (w - 1) / 2 + ox), Math.floor(z - (w - 1) / 2 + oz), k + (s >> 1));
      }
      k += (n >> 1) + 1;
    } else { // a wobbling, gappy trail, the same every time
      const sx = ax - 0.5, sz = az - 0.5;
      for (let s = 0; s <= L; s += 0.5) {
        const wb = (noise2(sx + s * 0.12, sz * 0.3) - 0.5) * 3;
        const x = Math.round(sx + dx * s / L - dz / L * wb), z = Math.round(sz + dz * s / L + dx / L * wb);
        const offs = w <= 2 ? [[0, 0], [1, 0], [0, 1]] : [];
        if (w > 2) for (let ox = lo; ox <= hi; ox++) for (let oz = lo; oz <= hi; oz++) offs.push([ox, oz]);
        for (const [ox, oz] of offs) {
          if ((ox || oz) && hash2(x * 3 + ox, z * 5 + oz) < 0.6) continue;
          if (hash2(x + ox, z * 7 + oz) < 0.18) continue;
          add(x + ox, z + oz, k + Math.floor(s));
        }
      }
      k += Math.ceil(L) + 1;
    }
  }
  return out;
}

export function makePaths(H) {
  const { ctx, L } = H;
  const { core, vox: V } = ctx;
  core.addCat('path', 'Paths', '#e0cfa8');
  const PT = {};

  // every block written is kept as [x, y, z, was, now], so the path can be taken up again exactly
  function recordWrites(fn) {
    const rec = [], set = V.set;
    V.set = (x, y, z, id) => { if (inB(x, y, z)) { const old = V.get(x, y, z); if (old !== id) rec.push([x, y, z, old, id]); } set(x, y, z, id); };
    try { fn(); } finally { V.set = set; }
    return rec;
  }
  PT.plan = (params) => {
    const Kd = PATH_KINDS[params.pathKind] ?? PATH_KINDS.earth;
    const cells = stampCells(params.points, params.pathKind, params.width);
    const lay = [], water = [];
    for (const c of cells) { if (L.waterTop(c.x, c.z) >= 0) water.push(c); else lay.push(c); }
    return { Kd, cells, lay, water };
  };
  // the line, cut and filled so each step along it is at most one block
  function cutSteps(lay) {
    const byK = new Map();
    for (const c of lay) { const h = V.groundTop(c.x, c.z); if (!byK.has(c.k)) byK.set(c.k, []); byK.get(c.k).push([c, h]); }
    const ks = [...byK.keys()].sort((a, b) => a - b);
    const t = ks.map((k) => { const hs = byK.get(k).map((q) => q[1]).sort((a, b) => a - b); return hs[hs.length >> 1]; });
    for (let i = 1; i < t.length; i++) t[i] = Math.max(t[i - 1] - 1, Math.min(t[i - 1] + 1, t[i]));
    for (let i = t.length - 2; i >= 0; i--) t[i] = Math.max(t[i + 1] - 1, Math.min(t[i + 1] + 1, t[i]));
    const cut = new Set();
    ks.forEach((k, i) => { for (const [c, h] of byK.get(k)) if (h !== t[i] && L.setGround(c.x, c.z, t[i])) cut.add(`${c.x},${c.z}`); });
    return cut;
  }
  PT.lay = (e) => {
    if (e.params.down) PT.heal(e);
    const p = e.params, { Kd, lay, water } = PT.plan(p);
    let laid = 0;
    const rec = recordWrites(() => {
      const cut = p.steps ? cutSteps(lay) : new Set();
      for (const c of lay) {
        if (!H.allow(c.x, c.z)) continue;
        const h = V.groundTop(c.x, c.z), tp = V.get(c.x, h, c.z);
        if (tp !== Kd.block && !OPEN.has(tp) && !cut.has(`${c.x},${c.z}`)) continue;
        V.set(c.x, h, c.z, Kd.block);
        laid++;
        for (let y = h + 1; y <= Math.min(SY - 1, h + 2); y++) { const id = V.get(c.x, y, c.z); if ((isCross(id) && id !== B.ROOTS) || id === B.CROP) V.set(c.x, y, c.z, B.AIR); }
      }
    });
    p.laid = rec.map((r) => r.slice());
    p.down = true;
    return { cells: laid, water: water.length, written: rec.length };
  };
  PT.heal = (e) => {
    const p = e.params, rec = p.laid ?? [];
    for (let i = rec.length - 1; i >= 0; i--) { const [x, y, z, was, now] = rec[i]; if (V.get(x, y, z) === now) V.set(x, y, z, was); }
    p.laid = []; p.down = false;
  };
  function refresh(e) {
    const pts = e.params.points;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    e.x = r1((x0 + x1) / 2); e.z = r1((z0 + z1) / 2);
    const w = e.params.width;
    e.foot = { cx: (x0 + x1) / 2 - e.x, cz: (z0 + z1) / 2 - e.z, w: x1 - x0 + w, d: z1 - z0 + w, h: 0.3, a: 0 };
    e.y = V.standY(e.x, e.z);
    ctx.overlay.dirty = true;
  }
  PT.refresh = refresh;
  // the line on the ground and its two sides (the overlay draws it when the path is selected)
  function outlineOf(e, seg, col) {
    const pts = e.params.points, hw = e.params.width / 2;
    const y = (x, z) => V.standY(x, z) + 0.12;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L0 = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L0 * hw, nz = (bx - ax) / L0 * hw;
      const n = Math.max(1, Math.ceil(L0 / 2));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, px = ax + (bx - ax) * t0, pz = az + (bz - az) * t0, qx = ax + (bx - ax) * t1, qz = az + (bz - az) * t1;
        seg([px, y(px, pz), pz], [qx, y(qx, qz), qz], col);
        seg([px + nx, y(px + nx, pz + nz), pz + nz], [qx + nx, y(qx + nx, qz + nz), qz + nz], col);
        seg([px - nx, y(px - nx, pz - nz), pz - nz], [qx - nx, y(qx - nx, qz - nz), qz - nz], col);
      }
    }
  }
  PT.make = (params) => {
    const e = {
      id: core.newId('path.'), kind: 'path', cat: 'path', name: `${PATH_KINDS[params.pathKind]?.label ?? 'Path'}`,
      x: 0, z: 0, y: 0, ry: 0, ry0: 0, objs: [], cells: null, yAbove: 0,
      params: { pathKind: 'earth', width: 2, steps: false, points: [], laid: [], down: false, ...params },
      foot: { cx: 0, cz: 0, w: 1, d: 1, h: 0.3, a: 0 },
    };
    e.outline = (seg, col) => outlineOf(e, seg, col);
    e.lift = () => { if (e.params.down) { core.touch(e); PT.heal(e); } }; // the Area tool reads the land without it
    refresh(e);
    return e;
  };
  // a new path, laid (call inside a transaction)
  PT.create = (pts, kind, width, steps) => {
    const e = PT.make({ pathKind: kind, width, steps: !!steps, points: pts.map((q) => [r1(q[0]), r1(q[1])]) });
    core.create(e);
    const r = PT.lay(e);
    refresh(e);
    return { e, ...r };
  };
  // moved or resized by the Area tool: its points follow, then it is laid again (inside a transaction, lifted first)
  PT.relayAt = (e, fn) => {
    core.touch(e);
    e.params.points = e.params.points.map(([x, z]) => fn(x, z).map(r1));
    PT.lay(e);
    refresh(e);
  };
  PT.clone = (e, dx, dz) => {
    const n = PT.make({ ...JSON.parse(JSON.stringify(e.params)), laid: [], down: false, points: e.params.points.map(([x, z]) => [r1(x + dx), r1(z + dz)]) });
    core.create(n); PT.lay(n); refresh(n);
    return n;
  };
  PT.all = () => core.list.filter((e) => e && e.kind === 'path' && !e.deleted && !e.removed);
  // the path under a ground point, or null
  PT.at = (x, z, tolExtra = 0.4) => {
    let best = null, bd = Infinity;
    for (const e of PT.all()) {
      const pts = e.params.points, tol = e.params.width / 2 + tolExtra;
      for (let i = 0; i < pts.length - 1; i++) { const d = distSeg(x, z, pts[i], pts[i + 1]); if (d <= tol && d < bd) { bd = d; best = e; } }
    }
    return best;
  };
  return PT;
}
