// How fish look. The director, 2026-11-16: "the fishes look horrible... the model has to be improved". He has not said
// what is wrong, so there are four looks to choose from, picked by the address (?fish=a, ?fish=b, ?fish=c; none keeps
// today's):
//   today's: one small low-poly fish shape for every kind (a body, a narrower head, a dark line down the back so the
//     swimming direction reads from above, a tail fin), stretched and tinted per kind. One instanced mesh for every
//     fish and one for the soft shadow each casts on the water: two draw calls.
//   a, true shapes: each kind its own shape, a tapered body with a dark back and pale flanks, a forked tail, side
//     fins and its own marks (slim silver minnows that flash as they turn, a spotted trout, a long thin pike with pale
//     bars and a duck-bill snout, a wide-headed whiskered catfish with a round tail). Four instanced meshes (one a
//     kind) and the shadow: five draw calls.
//   b, seen from afar: a's shapes, never drawn smaller than a few screen pixels long (as the hunt's spear never
//     thinner than one, sim/hunt-look.js), a soft dark shape under each in the water, and rings on the water where a
//     fish turns near the surface. Six draw calls (the rings are one more).
//   c, blocky: chunky boxes like the game's people and animals (sim/bodies.js), bright and plain, a little bigger.
//     Five draw calls.
// Every look swims the same way: the tail and the back half of the body wag side to side (a bend in the vertex shader,
// fed one small number pair a fish: the tail's phase and swing), faster when darting. The white rings of a spear's
// splash are one more mesh, shown only while something splashes. Nothing here allocates per frame.
// Also the fish a fisher carries home on a cord over the shoulder (fishing.js), a small mesh of its own.
import * as THREE from '../../vendor/three.module.js';
import { FIGURE_MAT } from '../world/merge.js';
import { enhance } from '../world/shade.js';

// which look: the director chose look a, the true shapes, on 2026-11-17, so it is the game's fish. The others can
// still be seen with ?fish=b or ?fish=c, and the first box fish with ?fish=old
export const FISH_LOOK = (() => {
  try { const v = new URLSearchParams(location.search).get('fish'); return v === 'b' || v === 'c' ? v : v === 'old' ? '' : 'a'; } catch { return 'a'; }
})();

// the looks' own numbers (they are drawing, not the simulation: tune.js keeps the fish's sizes and colours)
const LK = {
  a: { scale: 1, under: 1 },
  // b: each kind at least this many screen pixels long where people are drawn in full (tune.js LOD_PPM and in), but
  // never more than GROW times its drawn size, the floor fading out by GONE_PPM (the far zoom: they are the size they are)
  b: { scale: 1, under: 0.7, minPx: { minnow: 9, trout: 12, pike: 17, catfish: 19 }, grow: 2.6, fullPpm: 3.2, gonePpm: 1.6,
    ring: { max: 64, life: 1.6, turn: 1.4, every: [2.5, 5], minnowEvery: [7, 14], drift: 8 } },
  c: { scale: 1.2, under: 0.5 },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);

// boxes straight into one vertex-coloured geometry (bodies.js does the same for people and animals); today's look
function boxes(list) {
  let verts = 0, ic = 0;
  const geos = list.map(([w, h, d, grey, x, y, z, ry = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    _e.set(0, ry, 0); _q.setFromEuler(_e); _p.set(x, y, z);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = grey; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    verts += n; ic += g.index.count;
    return g;
  });
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3), index = new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
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

// today's shape, one unit long (nose at +z), one unit wide at its widest, flat; the instance colour tints the greys
const FISH_SHAPE = [
  [1.0, 0.34, 0.56, 1.0, 0, 0, 0.06],      // the body
  [0.7, 0.28, 0.2, 0.86, 0, -0.01, 0.42],  // the head, narrower
  [0.34, 0.26, 0.1, 0.7, 0, -0.02, 0.55],  // the snout
  [0.22, 0.05, 0.62, 0.45, 0, 0.18, 0.04], // the dark line down the back
  [0.4, 0.22, 0.16, 0.9, 0, 0, -0.29],     // the tail stem
  [0.95, 0.06, 0.2, 0.8, 0, 0, -0.45],     // the tail fin, wide and thin
];

// ---------- a small shape builder for the new looks: flat-shaded, coloured triangles ----------
// Shapes are one unit long, nose at +z (+0.5), tail tip at -z (-0.5), and drawn at the fish's length.
function shapeBuilder(under, water) {
  const pos = [], col = [];
  const tint = (hex) => { _c.setHex(hex); return _c.lerp(water, under).clone(); };
  // a triangle, turned to face away from `inside`
  function tri(a, b, c, color, ix, iy, iz) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - ix, my = (a[1] + b[1] + c[1]) / 3 - iy, mz = (a[2] + b[2] + c[2]) / 3 - iz;
    const pts = nx * mx + ny * my + nz * mz < 0 ? [a, c, b] : [a, b, c];
    for (const p of pts) { pos.push(p[0], p[1], p[2]); col.push(color.r, color.g, color.b); }
  }
  const quad = (a, b, c, d, color, ix, iy, iz) => { tri(a, b, c, color, ix, iy, iz); tri(a, c, d, color, ix, iy, iz); };
  // a flat plate: a convex outline [[x, z], ...] from height y up t, top colour and the rest
  function plate(pts, y, t, hex, hexTop = hex) {
    const ct = tint(hexTop), cs = tint(hex);
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0]; cz += p[1]; }
    cx /= pts.length; cz /= pts.length;
    const iy = y + t / 2, n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      tri([cx, y + t, cz], [p[0], y + t, p[1]], [q[0], y + t, q[1]], ct, cx, iy, cz);
      tri([cx, y, cz], [p[0], y, p[1]], [q[0], y, q[1]], cs, cx, iy, cz);
      quad([p[0], y, p[1]], [q[0], y, q[1]], [q[0], y + t, q[1]], [p[0], y + t, p[1]], cs, cx, iy, cz);
    }
  }
  // an upright box (turned ry about the up axis); top colour optional
  function box(w, h, d, hex, x, y, z, ry = 0, hexTop = hex) {
    const c = Math.cos(ry), s = Math.sin(ry), pts = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lx = (a * w) / 2, lz = (b * d) / 2; pts.push([x + lx * c + lz * s, z - lx * s + lz * c]); }
    plate(pts, y - h / 2, h, hex, hexTop);
  }
  // a stick from (x0, z0) to (x1, z1): a whisker or a fin ray
  function stick(x0, z0, x1, z1, w, h, y, hex) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    box(w, h, len, hex, (x0 + x1) / 2, y, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0));
  }
  // a tapered body through stations [z, half width, height, bottom y]: a six-sided cross-section, its top in the back
  // colour, the upper flanks in the flank colour, the lower flanks and belly in the belly colour (from above: a dark
  // back with paler edges)
  function body(st, back, flank, belly) {
    const cb = tint(back), cf = tint(flank), cl = tint(belly);
    const ring = ([z, hw, h, y]) => [[-0.5 * hw, y + h, z], [0.5 * hw, y + h, z], [hw, y + 0.55 * h, z], [0.6 * hw, y, z], [-0.6 * hw, y, z], [-hw, y + 0.55 * h, z]];
    const band = [cb, cf, cl, cl, cl, cf];
    for (let i = 0; i + 1 < st.length; i++) {
      const A = ring(st[i]), B = ring(st[i + 1]), iy = (st[i][3] + st[i][2] * 0.5 + st[i + 1][3] + st[i + 1][2] * 0.5) / 2, iz = (st[i][0] + st[i + 1][0]) / 2;
      for (let j = 0; j < 6; j++) quad(A[j], A[(j + 1) % 6], B[(j + 1) % 6], B[j], band[j], 0, iy, iz);
    }
    // the two ends closed
    for (const [k, o] of [[0, 1], [st.length - 1, -1]]) {
      const R = ring(st[k]), cy = st[k][3] + st[k][2] * 0.5, z = st[k][0];
      for (let j = 0; j < 6; j++) tri([0, cy, z], R[j], R[(j + 1) % 6], band[j], 0, cy, z - o * 0.05);
    }
  }
  // the top of the body at z (for marks laid on the back): the station heights, straight between
  const topAt = (st, z) => {
    for (let i = 0; i + 1 < st.length; i++) {
      const a = st[i], b = st[i + 1];
      if ((z <= a[0] && z >= b[0]) || (z >= a[0] && z <= b[0])) { const t = (z - a[0]) / (b[0] - a[0] || 1); return { y: a[3] + a[2] + (b[3] + b[2] - a[3] - a[2]) * t, hw: a[1] + (b[1] - a[1]) * t }; }
    }
    return { y: 0, hw: 0 };
  };
  function geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  return { plate, box, stick, body, topAt, geometry };
}

// a forked tail: two lobes from the tail's root (z0) back to the tip (z -0.5); spread: how far out the lobes reach,
// notch: how deep the fork is cut (0: a square tail)
function tail(B, z0, spread, notch, y, hex, t = 0.025) {
  for (const s of [1, -1]) B.plate([[0, z0], [s * spread * 0.35, z0 - 0.03], [s * spread, -0.5], [s * spread * 0.45, -0.5 + notch * 0.6], [0, -0.5 + notch]].map(([x, z]) => [x, z]), y, t, hex);
}
// side fins: a pair of small flat triangles behind the head
function fins(B, z, x, reach, back, y, hex) {
  for (const s of [1, -1]) B.plate([[s * x, z], [s * (x + reach), z - back], [s * x, z - back * 0.9]], y, 0.015, hex);
}
// eyes: a dark dot each side of the head, on top
function eyes(B, z, x, y, size, hex = 0x101010) { for (const s of [1, -1]) B.box(size, 0.02, size, hex, s * x, y, z); }

// ---------- look a (and b): each kind its true shape ----------
function trueShape(k, under, water) {
  const B = shapeBuilder(under, water);
  if (k === 'minnow') {
    // slim and silver, an olive back with a dark line, a small deep fork
    const st = [[0.45, 0.025, 0.05, -0.03], [0.34, 0.075, 0.1, -0.05], [0.12, 0.095, 0.12, -0.06], [-0.12, 0.07, 0.1, -0.05], [-0.3, 0.03, 0.05, -0.025]];
    B.body(st, 0x5d7468, 0xdfe9ec, 0xf6f8f4);
    const t = B.topAt(st, 0);
    B.box(0.035, 0.012, 0.55, 0x2f3d36, 0, t.y + 0.004, -0.02);
    tail(B, -0.29, 0.14, 0.13, -0.02, 0xbcc8c8);
    fins(B, 0.24, 0.07, 0.08, 0.1, -0.03, 0xd8e2e2);
    eyes(B, 0.34, 0.045, B.topAt(st, 0.34).y - 0.005, 0.03);
  } else if (k === 'trout') {
    // a golden-brown flank, an olive back, dark spots all over the back and a few red ones on the flanks, a square tail
    const st = [[0.46, 0.03, 0.06, -0.03], [0.34, 0.09, 0.13, -0.06], [0.1, 0.12, 0.16, -0.07], [-0.14, 0.095, 0.13, -0.06], [-0.3, 0.045, 0.07, -0.03]];
    B.body(st, 0x5e5a2c, 0xc9a659, 0xf0e3b8);
    const spots = [[0.02, 0.22], [-0.04, 0.12], [0.03, 0.05], [-0.02, -0.02], [0.04, -0.1], [-0.05, -0.08], [0.0, 0.3], [-0.03, -0.18], [0.03, -0.2], [0.06, 0.15], [-0.07, 0.04]];
    for (const [x, z] of spots) { const t = B.topAt(st, z); B.box(0.032, 0.012, 0.032, 0x1f1a10, x * (t.hw / 0.1), t.y + 0.003, z); }
    for (const [x, z] of [[0.1, 0.06], [-0.1, -0.04], [0.085, -0.12], [-0.09, 0.14]]) { const t = B.topAt(st, z); B.box(0.03, 0.03, 0.03, 0xb8442a, Math.sign(x) * t.hw * 0.85, t.y - 0.05, z); }
    tail(B, -0.29, 0.13, 0.05, -0.03, 0x8a7a44);
    fins(B, 0.22, 0.1, 0.09, 0.11, -0.04, 0xb39a58);
    eyes(B, 0.35, 0.05, B.topAt(st, 0.35).y - 0.006, 0.032);
  } else if (k === 'pike') {
    // long and thin, a flat duck-bill snout, a dark green back, pale bars along the flanks, the back fin far back
    const st = [[0.5, 0.02, 0.025, -0.015], [0.4, 0.035, 0.04, -0.025], [0.3, 0.055, 0.07, -0.04], [0.08, 0.07, 0.09, -0.045], [-0.18, 0.065, 0.09, -0.045], [-0.34, 0.03, 0.05, -0.025]];
    B.body(st, 0x33451f, 0x7f9c42, 0xe2dea2);
    for (let i = 0; i < 9; i++) { const z = 0.24 - i * 0.055, t = B.topAt(st, z), s = i % 2 ? 1 : -1; B.box(0.03, 0.025, 0.045, 0xdcdc8c, s * t.hw * 0.75, t.y - 0.02, z); B.box(0.03, 0.025, 0.04, 0xdcdc8c, -s * t.hw * 0.7, t.y - 0.022, z - 0.025); }
    const t = B.topAt(st, -0.26);
    B.box(0.022, 0.03, 0.11, 0x2a3818, 0, t.y + 0.012, -0.26);
    B.box(0.02, 0.008, 0.16, 0x1d2612, 0, B.topAt(st, 0.4).y + 0.002, 0.4);
    tail(B, -0.33, 0.12, 0.12, -0.02, 0x5f6e2c);
    fins(B, 0.25, 0.05, 0.06, 0.08, -0.03, 0x9aa858);
    eyes(B, 0.33, 0.04, B.topAt(st, 0.33).y - 0.004, 0.026, 0xd9c45a);
  } else {
    // catfish: a wide flat head, a body narrowing to a round tail, dark above and paler below, long whiskers
    const st = [[0.46, 0.15, 0.07, -0.035], [0.36, 0.175, 0.1, -0.05], [0.16, 0.15, 0.12, -0.06], [-0.1, 0.1, 0.1, -0.05], [-0.3, 0.06, 0.07, -0.035], [-0.4, 0.04, 0.05, -0.025]];
    B.body(st, 0x4a3f2e, 0x7d6a4c, 0xcdbd98);
    // a mottled back
    for (const [x, z] of [[0.05, 0.2], [-0.07, 0.1], [0.04, -0.02], [-0.03, -0.14], [0.06, 0.32], [-0.06, 0.3], [0.0, 0.05]]) { const t = B.topAt(st, z); B.box(0.05, 0.01, 0.06, 0x2e261c, x * (t.hw / 0.12), t.y + 0.003, z); }
    // the round tail
    const tz = -0.39, rp = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI; rp.push([Math.sin(a) * 0.1, tz - 0.02 - Math.cos(a) * 0.1]); }
    B.plate([[0, tz + 0.02], ...rp], -0.02, 0.025, 0x5a4a36);
    // whiskers: two long pale ones from the corners of the mouth reaching forward and bending out (pale, and lying
    // along the head, so from above they read as whiskers and not as legs), two short ones under the chin
    for (const s of [1, -1]) {
      B.stick(s * 0.12, 0.45, s * 0.15, 0.6, 0.014, 0.012, 0.0, 0xc8b68e);
      B.stick(s * 0.15, 0.6, s * 0.22, 0.7, 0.012, 0.012, 0.0, 0xc8b68e);
      B.stick(s * 0.05, 0.46, s * 0.06, 0.54, 0.012, 0.012, -0.01, 0xb4a27a);
    }
    fins(B, 0.2, 0.13, 0.1, 0.1, -0.04, 0x6a5a42);
    eyes(B, 0.38, 0.1, B.topAt(st, 0.38).y - 0.003, 0.026, 0xe0d4a8);
  }
  return B.geometry();
}

// ---------- look c: blocky, like the game's box people and animals ----------
function blockShape(k, under, water) {
  const B = shapeBuilder(under, water);
  if (k === 'minnow') {
    B.box(0.22, 0.16, 0.5, 0xd9e4e8, 0, 0, 0.0, 0, 0x7d9790);
    B.box(0.17, 0.13, 0.18, 0xe6eef0, 0, -0.005, 0.32, 0, 0x6f8a82);
    B.box(0.07, 0.1, 0.12, 0xc4d0d0, 0, 0, -0.3);
    B.box(0.1, 0.05, 0.14, 0xb4c2c2, 0.07, 0, -0.42, -0.45); B.box(0.1, 0.05, 0.14, 0xb4c2c2, -0.07, 0, -0.42, 0.45);
    B.box(0.06, 0.02, 0.4, 0x2f3d36, 0, 0.085, 0.0);
    for (const s of [1, -1]) { B.box(0.04, 0.05, 0.04, 0xffffff, s * 0.085, 0.02, 0.36); B.box(0.025, 0.035, 0.03, 0x101010, s * 0.098, 0.022, 0.37); }
  } else if (k === 'trout') {
    B.box(0.26, 0.22, 0.56, 0xc8a24f, 0, 0, 0.0, 0, 0x6a6230);
    B.box(0.2, 0.18, 0.2, 0xd2b060, 0, -0.01, 0.36, 0, 0x6a6230);
    B.box(0.1, 0.14, 0.12, 0xb0903f, 0, 0, -0.32);
    B.box(0.28, 0.05, 0.12, 0x8a7a44, 0, 0, -0.43);
    for (const [x, z] of [[0.06, 0.18], [-0.05, 0.08], [0.04, -0.04], [-0.06, -0.15], [0.07, -0.2], [0.0, 0.0], [-0.02, 0.26]]) B.box(0.05, 0.02, 0.05, 0x1f1a10, x, 0.11, z);
    for (const [s, z] of [[1, 0.05], [-1, -0.1], [1, -0.16], [-1, 0.15]]) B.box(0.03, 0.05, 0.05, 0xc0482c, s * 0.13, 0.0, z);
    for (const s of [1, -1]) { B.box(0.04, 0.05, 0.04, 0xffffff, s * 0.1, 0.03, 0.4); B.box(0.025, 0.035, 0.03, 0x101010, s * 0.112, 0.032, 0.41); }
  } else if (k === 'pike') {
    B.box(0.14, 0.14, 0.62, 0x86a346, 0, 0, -0.02, 0, 0x34461f);
    B.box(0.12, 0.11, 0.16, 0x86a346, 0, -0.01, 0.36, 0, 0x34461f);
    B.box(0.09, 0.05, 0.12, 0x6f8a38, 0, -0.03, 0.48, 0, 0x2a3818);
    for (let i = 0; i < 6; i++) B.box(0.15, 0.04, 0.035, 0xdede90, 0, 0.0, 0.22 - i * 0.09);
    B.box(0.03, 0.06, 0.1, 0x2a3818, 0, 0.09, -0.24);
    B.box(0.06, 0.1, 0.08, 0x6f8a38, 0, 0, -0.36);
    B.box(0.09, 0.04, 0.16, 0x5f6e2c, 0.05, 0, -0.44, -0.4); B.box(0.09, 0.04, 0.16, 0x5f6e2c, -0.05, 0, -0.44, 0.4);
    for (const s of [1, -1]) { B.box(0.035, 0.04, 0.035, 0xf2e070, s * 0.058, 0.03, 0.38); B.box(0.02, 0.03, 0.025, 0x101010, s * 0.068, 0.032, 0.385); }
  } else {
    B.box(0.38, 0.16, 0.28, 0xa48c64, 0, 0, 0.3, 0, 0x6e5c40);
    B.box(0.28, 0.17, 0.4, 0xa48c64, 0, 0, -0.02, 0, 0x76623f);
    B.box(0.16, 0.12, 0.16, 0x94805a, 0, 0, -0.29, 0, 0x6e5c40);
    B.box(0.22, 0.04, 0.12, 0x7a6648, 0, 0, -0.43);
    for (const [x, z] of [[0.07, 0.05], [-0.06, -0.08], [0.05, 0.3], [-0.08, 0.24]]) B.box(0.06, 0.02, 0.06, 0x3e3324, x, 0.09, z);
    for (const s of [1, -1]) {
      B.stick(s * 0.14, 0.43, s * 0.19, 0.66, 0.03, 0.03, 0.0, 0xe4d4aa);
      B.stick(s * 0.06, 0.44, s * 0.07, 0.56, 0.026, 0.025, -0.02, 0xd0bf94);
      B.box(0.12, 0.03, 0.12, 0x8a7656, s * 0.22, -0.03, 0.12, s * 0.5);
      B.box(0.05, 0.04, 0.05, 0xf0e6c0, s * 0.13, 0.07, 0.36);
      B.box(0.028, 0.045, 0.028, 0x101010, s * 0.13, 0.075, 0.365);
    }
  }
  return B.geometry();
}

// the material every look shares: the figures' lighting (night lift, vivid, clouds, the mist at the edge) plus the
// tail's bend. aWag.x is the tail's phase, aWag.y how far the tail tip swings (in the shape's own sideways units); the
// back of the fish from WAG_PIVOT (nose +z) to the tail tip swings, more toward the tip, a wave running down it.
const WAG_PIVOT = 0.12, WAG_LEN = 0.62;
let WAG_MAT = null;
function wagMaterial() {
  if (WAG_MAT) return WAG_MAT;
  const mat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true }), { linearColors: true, figure: true });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aWag;')
      .replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
  {
    float wk = clamp( ( ${WAG_PIVOT.toFixed(3)} - transformed.z ) / ${WAG_LEN.toFixed(3)}, 0.0, 1.0 );
    transformed.x += sin( aWag.x - wk * 2.4 ) * aWag.y * wk * wk;
  }`);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + ':fishwag';
  WAG_MAT = mat;
  return mat;
}

// a soft disc, dark in the middle fading out at the rim (b's shape under the water)
function softDisc() {
  const g = new THREE.BufferGeometry(), pos = [0, 0, 0], col = [1, 1, 1, 1], idx = [];
  const rings = [[0.3, 0.85], [0.62, 0.45], [1, 0]], n = 14;
  for (const [r, a] of rings) for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; pos.push(Math.cos(t) * r * 0.5, 0, Math.sin(t) * r * 0.5); col.push(1, 1, 1, a); }
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = 1 + k * n + i, b = 1 + k * n + ((i + 1) % n), c = a + n, d = b + n;
    idx.push(a, b, d, a, d, c);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

// ---------- the meshes and the drawing ----------
// K: tune.js FISH; T: tune.js; camera: for b's floor (pixels a metre)
export function makeFishMeshes(cap, { K, T, camera, look = FISH_LOOK } = {}) {
  const kinds = Object.keys(K);
  const L = LK[look] ?? null;
  const water = new THREE.Color(T.FISH_WATER_TINT);
  const mat = wagMaterial();
  const layer = [];
  // one mesh for today's look; one a kind for the new ones
  const meshes = [], byKind = {};
  const addMesh = (geo) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    geo.setAttribute('aWag', new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.count = 0; m.frustumCulled = false; m.userData.noPick = true;
    meshes.push(m); layer.push(m);
    return m;
  };
  const TINTS = {};
  if (!L) {
    const m = addMesh(boxes(FISH_SHAPE));
    for (const k of kinds) { byKind[k] = m; TINTS[k] = new THREE.Color(K[k].color).lerp(water, K[k].under); }
  } else {
    for (const k of kinds) byKind[k] = addMesh(look === 'c' ? blockShape(k, K[k].under * L.under, water) : trueShape(k, K[k].under * L.under, water));
  }
  // the shadow on the water: a soft dark oval under each fish (drawn after the water, which is see-through); b's is
  // bigger, softer and darker: the fish's shape seen down in the water
  const soft = look === 'b';
  const sg = soft ? softDisc() : new THREE.CircleGeometry(0.5, 10);
  if (!soft) sg.rotateX(-Math.PI / 2);
  const shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0x0b1c24, transparent: true, opacity: soft ? 0.5 : 0.26, depthWrite: false, vertexColors: soft }), cap);
  shadow.count = 0; shadow.frustumCulled = false; shadow.renderOrder = 3;
  shadow.userData.noPick = true;
  layer.push(shadow);
  // splash rings: white, see-through, growing and fading (the fade is in the ring's scale and count, one opacity for all)
  const rg = new THREE.RingGeometry(0.38, 0.5, 14);
  rg.rotateX(-Math.PI / 2);
  const splash = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.7, depthWrite: false }), 32);
  splash.count = 0; splash.frustumCulled = false; splash.renderOrder = 4; splash.visible = false;
  splash.userData.noPick = true;
  layer.push(splash);
  // b: rings on the water where a fish turns near the surface (light added to the water, fading as they spread)
  let ring = null;
  const RG = L?.ring;
  if (RG) {
    const g = new THREE.RingGeometry(0.46, 0.5, 24);
    g.rotateX(-Math.PI / 2);
    ring = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), RG.max);
    ring.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RG.max * 3), 3);
    ring.count = 0; ring.frustumCulled = false; ring.renderOrder = 4; ring.userData.noPick = true;
    layer.push(ring);
  }
  const rings = RG ? new Float32Array(RG.max * 5) : null; // x, y, z, age, size (age < 0: unused)
  if (rings) for (let i = 0; i < RG.max; i++) rings[i * 5 + 3] = -1;
  let ringNext = 0;

  // b's floor: the smallest length, in metres, a kind may be drawn at this zoom
  const floorM = (px) => {
    const ppm = camera?.ppm ?? 7, k = Math.max(0, Math.min(1, (ppm - L.gonePpm) / (L.fullPpm - L.gonePpm)));
    return (px * k) / Math.max(0.1, ppm);
  };

  // ---- each frame: begin, put every fish, end ----
  function begin() { for (const m of meshes) m.count = 0; shadow.count = 0; }
  // f: the fish (x, z, yaw, k, v, wag, tr); y: the water's surface there; fade: 0..1 at the mist's edge
  function put(f, y, fade) {
    const P = K[f.k], m = byKind[f.k];
    if (m.count >= cap || shadow.count >= cap) return;
    let len = P.len * T.FISH_DRAW_SCALE * fade * (L ? L.scale : 1);
    if (look === 'b') len = Math.max(len, Math.min(len * L.grow, floorM(L.minPx[f.k]) * fade));
    // the tail swings wider when darting; the head swings a little the other way
    const sw = T.FISH_WAG_AMP[0] + (T.FISH_WAG_AMP[1] - T.FISH_WAG_AMP[0]) * Math.min(1, Math.max(0, (f.v - P.speed) / Math.max(0.1, P.dart - P.speed)));
    _q.setFromAxisAngle(_up, f.yaw - Math.sin(f.wag) * sw * 0.6);
    _p.set(f.x, y, f.z);
    if (L) _s.set(len, len, len); else _s.set(len * P.wide, len * P.wide * 0.9, len);
    const i = m.count++;
    m.setMatrixAt(i, _m.compose(_p, _q, _s));
    if (L) {
      // a minnow flashes silver as it turns
      const fl = f.k === 'minnow' ? 1 + Math.min(0.7, f.tr * 0.22) : 1;
      _c.setRGB(fl, fl, fl);
      m.setColorAt(i, _c);
    } else m.setColorAt(i, TINTS[f.k]);
    const wa = m.geometry.attributes.aWag.array;
    wa[i * 2] = f.wag; wa[i * 2 + 1] = L ? sw : sw / P.wide;
    // the shadow
    const j = shadow.count++;
    if (soft) { _p.set(f.x + 0.12 * len, y - 0.03, f.z + 0.16 * len); _s.set(len * Math.max(0.3, P.wide) * 1.9, 1, len * 1.25); }
    else { _p.set(f.x + 0.1 * len, y - 0.02, f.z + 0.14 * len); _s.set(len * P.wide * 1.5, 1, len * 1.15); }
    shadow.setMatrixAt(j, _m.compose(_p, _q, _s));
    f.dl = len; f.y = y;
  }
  function end(daylight = 1) {
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.geometry.attributes.aWag.needsUpdate = true;
    }
    shadow.instanceMatrix.needsUpdate = true;
    if (ring) {
      let n = 0;
      const day = 0.25 + 0.75 * daylight;
      _q.identity();
      for (let r = 0; r < RG.max; r++) {
        const a = rings[r * 5 + 3];
        if (a < 0) continue;
        const g = a / RG.life;
        if (g >= 1) { rings[r * 5 + 3] = -1; continue; }
        const sc = rings[r * 5 + 4] * (0.45 + g * 1.1);
        _p.set(rings[r * 5], rings[r * 5 + 1], rings[r * 5 + 2]); _s.set(sc, 1, sc);
        ring.setMatrixAt(n, _m.compose(_p, _q, _s));
        const b = (1 - g) * (1 - g) * 0.32 * day;
        _c.setRGB(b, b, b);
        ring.setColorAt(n, _c);
        n++;
      }
      ring.count = n; ring.visible = n > 0;
      if (n) { ring.instanceMatrix.needsUpdate = true; ring.instanceColor.needsUpdate = true; }
    }
  }
  // with the game's time (called from the simulation's step): the rings age, and a fish turning hard near the surface
  // (or, now and then, one cruising) rings the water where it is drawn
  function step(dt, list) {
    if (!rings) return;
    for (let r = 0; r < RG.max; r++) if (rings[r * 5 + 3] >= 0) rings[r * 5 + 3] += dt;
    for (const f of list) {
      f.ringT -= dt;
      if (f.ringT > 0 || !f.dl) continue;
      const hard = f.tr > RG.turn;
      if (!hard && Math.random() > dt / RG.drift) continue;
      const ev = f.k === 'minnow' ? RG.minnowEvery : RG.every;
      f.ringT = ev[0] + Math.random() * (ev[1] - ev[0]);
      const r = ringNext;
      ringNext = (ringNext + 1) % RG.max;
      rings[r * 5] = f.x; rings[r * 5 + 1] = f.y + 0.02; rings[r * 5 + 2] = f.z; rings[r * 5 + 3] = 0; rings[r * 5 + 4] = f.dl;
    }
  }
  const count = () => { let n = 0; for (const m of meshes) n += m.count; return n; };
  return { look: look || 'today', layer, meshes, shadow, splash, ring, begin, put, end, step, count, drawCalls: () => meshes.length + 1 + (ring ? 1 : 0) };
}

// a fish (or a few) hanging from a cord over the left shoulder, in the colours of the kinds caught; s is the
// figure's scale. One mesh, built for the catch it shows (catches are few: no cache needed beyond the kinds).
const CORD = new Map();
export function makeCordFish(colors, s) {
  const key = `${colors.join(',')}:${s}`;
  let g = CORD.get(key);
  if (!g) {
    const list = [[0.06 * s, 0.06 * s, 0.8 * s, 0.35, -0.38 * s, 1.3 * s, 0]]; // the cord
    const n = Math.min(3, colors.length);
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * 0.3 * s;
      list.push([0.16 * s, 0.5 * s, 0.2 * s, 1, -0.52 * s, 1.0 * s, z]);   // the fish, hanging head down
      list.push([0.24 * s, 0.08 * s, 0.24 * s, 0.85, -0.52 * s, 0.72 * s, z]); // its tail
    }
    g = boxes(list);
    // tint each fish its kind's colour (the cord stays dark)
    const col = g.attributes.color.array, per = 24; // 24 vertices a box
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setHex(colors[i]);
      for (let b = 1 + i * 2; b <= 2 + i * 2; b++) for (let v = b * per; v < (b + 1) * per; v++) { col[v * 3] *= c.r; col[v * 3 + 1] *= c.g; col[v * 3 + 2] *= c.b; }
    }
    g.attributes.color.needsUpdate = true;
    CORD.set(key, g);
  }
  return new THREE.Mesh(g, FIGURE_MAT);
}
