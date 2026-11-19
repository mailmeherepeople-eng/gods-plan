// A. Hardships: what they look like. Cheap and shared: no core entity per
// flame or puddle. A sick or hurt person wears a small tinted piece on their
// own figure (a sickly mantle, a bandage); flames are one instanced mesh for
// every burning column; rain and the glow of a healing are a handful of thin
// boxes that fade in a second or two. The land itself changes as real blocks
// (ash, mud, dry grass), written by the hardship files through S.build.put.
import * as THREE from '../../vendor/three.module.js';
import { MERGED_MAT } from '../world/merge.js';
import { registerBlock } from '../world/blocks.js';

// blocks of the hardships: burnt ground, and the mud a flood leaves
export const HB = {
  ASH: registerBlock({ name: 'SIM_ASH', top: 0x4a4440, side: 0x6e5340, bottom: 0x80492f }),
  MUD: registerBlock({ name: 'SIM_MUD', top: 0x6b5236, side: 0x7a5233, bottom: 0x6a442c }),
};

const _c = new THREE.Color();
function coloured(geo, hex) {
  _c.setHex(hex);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return geo;
}
function merge(parts) {
  let verts = 0, ic = 0;
  for (const g of parts) { verts += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3), index = new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); col.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
const box = (w, h, d, hex, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return coloured(g, hex); };

// the marks on a body, sized for a grown-up figure (PERSON_SCALE 1.18); a child's is scaled down
const S1 = 1.18;
const MARK_GEO = {
  // a sickly yellow-green mantle over the shoulders, readable from above, with pale sweat on the brow
  sick: () => merge([box(0.78 * S1, 0.14 * S1, 0.5 * S1, 0xa9b84a, 0, 1.18 * S1, 0), box(0.44 * S1, 0.05 * S1, 0.44 * S1, 0xd9dca0, 0, 1.6 * S1, 0)]),
  // a pale bandage round the head with a dark red mark, and a scorched mantle
  wound: () => merge([box(0.47 * S1, 0.08 * S1, 0.47 * S1, 0xefe8d6, 0, 1.58 * S1, 0), box(0.1 * S1, 0.08 * S1, 0.03 * S1, 0x8c2a1e, 0.08 * S1, 1.58 * S1, 0.24 * S1),
    box(0.76 * S1, 0.13 * S1, 0.48 * S1, 0x5a463a, 0, 1.17 * S1, 0)]),
};
const geoCache = {};
const markGeo = (kind) => geoCache[kind] ?? (geoCache[kind] = MARK_GEO[kind]());

// flames: two crossed tongues, orange under yellow
const FLAME_GEO = merge([box(0.8, 0.9, 0.8, 0xe8531c, 0, 0.45, 0), box(0.5, 0.7, 0.5, 0xffb230, 0.08, 0.95, -0.05), box(0.3, 0.5, 0.3, 0xfff07a, -0.1, 1.3, 0.1)]);
const FLAME_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });
const RAIN_MAT = new THREE.MeshBasicMaterial({ color: 0xbfd8e6, transparent: true, opacity: 0.55, depthWrite: false });
const GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xf4f1d0, transparent: true, opacity: 0.5, depthWrite: false });
const RAIN_GEO = new THREE.BoxGeometry(0.06, 1.6, 0.06);
const GLOW_GEO = new THREE.CylinderGeometry(0.7, 0.9, 5, 8, 1, true); GLOW_GEO.translate(0, 2.5, 0);

export function makeFx(ctx, S) {
  const layer = ctx.layers.entities;

  // ---------- marks on people ----------
  // the mark follows the figure (a person who grows up gets a new figure: it is put back on the next pass)
  function mark(p, kind) {
    const d = p.ext.hardshipFx ?? (p.ext.hardshipFx = {});
    if (d.kind === kind && d.mesh && d.mesh.parent === p.F?.group) return;
    unmark(p);
    if (!kind || !p.F) return;
    const m = new THREE.Mesh(markGeo(kind), MERGED_MAT);
    m.userData.noPick = true;
    const k = p.stage === 'child' ? 0.62 : 1;
    m.scale.setScalar(k);
    p.F.group.add(m); // the group, not the figure: the figure is hidden at far zoom
    d.kind = kind; d.mesh = m;
  }
  function unmark(p) {
    const d = p.ext?.hardshipFx;
    if (!d?.mesh) return;
    d.mesh.removeFromParent();
    d.mesh = null; d.kind = null;
  }
  // re-attach after a new figure (figureFor rebuilds p.F when a child grows up)
  function keepMark(p, kind) {
    const d = p.ext.hardshipFx;
    if (!kind) { if (d?.mesh) unmark(p); return; }
    if (!d?.mesh || d.kind !== kind || !p.F || d.mesh.parent !== p.F.group) mark(p, kind);
    const m = p.ext.hardshipFx?.mesh;
    if (m) m.visible = !p.asleep; // lying down asleep, an upright mantle would float
  }

  // ---------- flames: one instanced draw ----------
  const CAP = 320;
  const flames = new THREE.InstancedMesh(FLAME_GEO, FLAME_MAT, CAP);
  flames.count = 0; flames.frustumCulled = false; flames.userData.noPick = true;
  flames.userData.glow = 'flame'; // every burning column lights the ground round it at night (engine/lighting.js)
  layer.add(flames);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  // list: [{ x, y, z, s, seed }]
  function drawFlames(list) {
    const t = performance.now() / 1000;
    let n = 0;
    for (const f of list) {
      if (n >= CAP) break;
      const k = f.s * (0.8 + Math.sin(t * 11 + f.seed) * 0.15 + Math.sin(t * 23 + f.seed * 2) * 0.08);
      _p.set(f.x, f.y, f.z); _s.set(f.s, k, f.s);
      _q.setFromAxisAngle(UP, f.seed);
      flames.setMatrixAt(n++, _m.compose(_p, _q, _s));
    }
    flames.count = n;
    flames.instanceMatrix.needsUpdate = true;
  }

  // ---------- short-lived effects: rain over an area, a glow on the healed ----------
  const bursts = [];
  function rain(x, z, r, groundY) {
    const n = Math.min(90, Math.round(20 + r * 3));
    const g = new THREE.Group();
    const drops = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r;
      const m = new THREE.Mesh(RAIN_GEO, RAIN_MAT);
      m.position.set(x + Math.cos(a) * d, groundY + 6 + Math.random() * 10, z + Math.sin(a) * d);
      m.userData.noPick = true;
      drops.push({ m, y0: m.position.y, v: 14 + Math.random() * 6 });
      g.add(m);
    }
    layer.add(g);
    bursts.push({ g, t: 0, dur: 2.2, tick: (b, dt) => { for (const d of drops) { d.m.position.y -= d.v * dt; if (d.m.position.y < groundY) d.m.position.y = d.y0; } } });
  }
  function glow(x, y, z) {
    const m = new THREE.Mesh(GLOW_GEO, GLOW_MAT);
    m.position.set(x, y, z);
    m.userData.noPick = true;
    layer.add(m);
    bursts.push({ g: m, t: 0, dur: 1.2, tick: (b) => { const k = 1 - b.t / b.dur; m.scale.set(0.6 + k * 0.6, 0.4 + (1 - k) * 0.8, 0.6 + k * 0.6); } });
  }
  let last = performance.now();
  function tick() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const b of [...bursts]) {
      b.t += dt;
      b.tick?.(b, dt);
      if (b.t >= b.dur) { b.g.removeFromParent(); bursts.splice(bursts.indexOf(b), 1); }
    }
  }
  return { mark, unmark, keepMark, drawFlames, rain, glow, tick };
}
