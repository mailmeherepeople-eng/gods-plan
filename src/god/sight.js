// Being seen: while a tool is armed and the clock runs, a soft warm wash lies on
// the ground people can see right now (ctx.modules.sim.sightCircles()). It
// fades out toward the rim of each circle, so no outline or border ever shows
// (DESIGN.md: there is never a visible circle). With no simulation, no wash.
// New for this game (the source planner has nothing like it).
import { X0, Z0, X1, Z1 } from '../edit/vox.js';

const SEEN = [244, 227, 161].map((c) => (c / 255) ** 2.2); // UI-GUIDE --seen, as linear colour
const PEAK = 0.34;      // the wash at full strength
const FADE_IN = 0.16, FADE_OUT = 0.12; // seconds
const EVERY = 0.25;     // rebuilt at most 4 times a second
const MAX_CELLS = 60000;

export function makeSight(H) {
  const { THREE, vox, scene, events } = H.ctx;
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 25; mesh.frustumCulled = false; mesh.visible = false;
  mesh.name = 'god-sight';
  scene.add(mesh);
  const S = { on: false, alpha: 0, circles: [] };
  let t = 0, key = '', dirty = true;
  events.on('edit', () => { dirty = true; });

  const falloff = (px, pz, cs) => {
    let a = 0;
    for (const c of cs) {
      const d = Math.hypot(px - c.x, pz - c.z) / c.r;
      if (d >= 1) continue;
      const u = d <= 0.6 ? 1 : 1 - (d - 0.6) / 0.4;
      const v = u * u * (3 - 2 * u);
      if (v > a) a = v;
    }
    return a;
  };
  const surfaceTop = (x, z) => { const g = vox.groundTop(x, z), w = vox.waterTop(x, z); return Math.max(g, w); };

  function rebuild(cs) {
    const pos = [], col = [];
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (const c of cs) { bx0 = Math.min(bx0, c.x - c.r); bz0 = Math.min(bz0, c.z - c.r); bx1 = Math.max(bx1, c.x + c.r); bz1 = Math.max(bz1, c.z + c.r); }
    const x0 = Math.max(X0, Math.floor(bx0)), z0 = Math.max(Z0, Math.floor(bz0)), x1 = Math.min(X1 - 1, Math.ceil(bx1)), z1 = Math.min(Z1 - 1, Math.ceil(bz1));
    const step = (x1 - x0 + 1) * (z1 - z0 + 1) > MAX_CELLS ? 2 : 1;
    for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) {
      const a00 = falloff(x, z, cs), a10 = falloff(x + step, z, cs), a11 = falloff(x + step, z + step, cs), a01 = falloff(x, z + step, cs);
      if (a00 + a10 + a11 + a01 <= 0.001) continue;
      const y = surfaceTop(x, z) + 1.03, e = x + step, f = z + step;
      pos.push(x, y, z, e, y, f, e, y, z, x, y, z, x, y, f, e, y, f);
      for (const a of [a00, a11, a10, a00, a01, a11]) col.push(SEEN[0], SEEN[1], SEEN[2], a * PEAK);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.computeBoundingSphere();
  }

  // How far the ARMED act is seen from (FAULTS 2026-11-13: the wash still showed the old 22 block sight, so it
  // understated big acts: a hill is seen 30 blocks and more, a strike 60). The simulation's faith subsystem
  // decides who notices an act by its kind (docs/FAITH.md): first ask it (`noticeReach`, if it answers), else
  // read its own table (sim.tune('faith').NOTICE), else the person's plain sight. The circle round each person
  // is then the act's reach, scaled by the light as the simulation scales it (a lit act is seen as far by night),
  // plus the act's own radius. Returns null to keep the plain sight.
  const reachCache = { key: '', at: 0, fn: null };
  function reachFor() {
    const id = H.tool, T = H.toolDef?.();
    if (!id || !T) return null;
    const kind = T.power ? (T.power.witness ?? T.power.id) : id.startsWith('animal.') ? 'animals' : id;
    const fam = T.family;
    const size = Number(H.opts?.[fam]?.size ?? H.opts?.[fam]?.width ?? 0) || 0;
    const now = performance.now();
    const key = `${kind}|${size}`;
    if (reachCache.key === key && now - reachCache.at < 1000) return reachCache.fn;
    reachCache.key = key; reachCache.at = now; reachCache.fn = null;
    const asked = H.simCall('ask', 'noticeReach', kind, size);
    let reach = null, lit = false;
    if (asked && Number.isFinite(asked.reach)) { reach = asked.reach; lit = !!asked.lit; }
    else if (Number.isFinite(asked)) reach = asked;
    else {
      const F = H.simCall('tune', 'faith');
      const N = F?.NOTICE;
      if (N) {
        const g = F.KIND_GROUP?.[kind];
        const n = N[kind] ?? N[g] ?? (/^(tree|path)\./.test(kind) ? N.paint : N.default);
        if (n && !n.all && Number.isFinite(n.reach)) { reach = Math.min(n.cap ?? 1e9, n.reach + (n.perR ?? 0) * size); lit = !!n.lit; }
      }
    }
    if (!Number.isFinite(reach)) return null;
    const day = Number(H.simCall('tune', 'sim')?.SIGHT_DAY) || 22;
    // c.r is the person's sight now (night shortens it); an act that is not lit shortens the same way
    reachCache.fn = (c) => (lit ? reach : reach * (c.r / day)) + size;
    return reachCache.fn;
  }

  // want: a tool is armed and the clock runs
  S.update = (dt, want) => {
    let cs = [];
    if (want) {
      const r = H.simCall('sightCircles');
      if (Array.isArray(r)) cs = r.filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z) && c.r > 0);
      const fn = cs.length ? reachFor() : null;
      if (fn) cs = cs.map((c) => ({ x: c.x, z: c.z, r: fn(c) }));
    }
    const show = want && cs.length > 0;
    t -= dt;
    if (show && (t <= 0 || dirty)) {
      const k = cs.map((c) => `${c.x.toFixed(1)},${c.z.toFixed(1)},${c.r.toFixed(1)}`).join('|');
      if (k !== key || dirty) { rebuild(cs); key = k; dirty = false; }
      t = EVERY;
      S.circles = cs;
    }
    const target = show ? 1 : 0;
    const rate = dt / (target > S.alpha ? FADE_IN : FADE_OUT);
    S.alpha = target > S.alpha ? Math.min(target, S.alpha + rate) : Math.max(target, S.alpha - rate);
    mat.opacity = S.alpha;
    mesh.visible = S.alpha > 0.001 && key !== '';
    S.on = mesh.visible;
  };
  S.mesh = mesh;
  return S;
}
