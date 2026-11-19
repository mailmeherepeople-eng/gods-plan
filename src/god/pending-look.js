// How the preview's ghost looks (director, 2026-11-15: "i want height lines while raising. looks the best. also while
// lowering, it has to be height lines + shadow. and for trees and vegetation, use height lines version."). The change
// is drawn as a see-through copy of the real result in the colours the real blocks will have; pending.js builds it,
// this file holds the block colours, the shading of the faces and the material that colours a box's top apart from
// its sides, and how see-through the ghost is (Settings, "Land preview: how see-through").
import { BLOCK_DEFS } from '../world/blocks.js';
import { blockColor } from '../edit/vox.js';

// the real mesher's face shades (world/mesher.js FACES): top full, sides stepped, bottom deep
export function trueUnit(THREE) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0.5, 0.5, 0.5);
  const n = g.attributes.normal, c = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const s = y > 0.5 ? 1 : y < -0.5 ? 0.45 : x > 0.5 ? 0.78 : x < -0.5 ? 0.7 : z > 0.5 ? 0.68 : 0.84;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// a material that colours an instance's top face from the `iTop` attribute and its other faces from instanceColor
export function twoTone(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iTop;')
      .replace('#include <color_vertex>', 'vColor = vec4( 1.0 );\nvColor.rgb *= color;\nvColor.rgb *= normal.y > 0.5 ? iTop : instanceColor.rgb;');
  };
  mat.customProgramCacheKey = () => 'pending-two-tone';
  return mat;
}

// a block's colour as the mesher would draw that face, made linear like the renderer's vertex colours
export function makeColors(THREE) {
  const cache = new Map();
  const lin = (rgb) => new THREE.Color(rgb[0] ** 2.2, rgb[1] ** 2.2, rgb[2] ** 2.2);
  const part = (id, p) => {
    const k = id * 2 + (p === 'top' ? 0 : 1);
    let c = cache.get(k);
    if (!c) {
      const d = BLOCK_DEFS[id];
      if (!d?.top) c = lin([0.5, 0.5, 0.5]);
      else if (d.cross) c = lin(p === 'top' ? blockColor(id) : d.side); // plants: the bloom on top, the leaf below
      else c = lin(d[p] ?? d.top);
      cache.set(k, c);
    }
    return c;
  };
  const hexes = new Map();
  const hex = (h) => { let c = hexes.get(h); if (!c) { c = new THREE.Color(h); hexes.set(h, c); } return c; };
  // temporary colours, reused round a ring (each is copied into the instance buffers at once)
  const scratch = [];
  let si = 0;
  const tmp = () => { si = (si + 1) & 63; return scratch[si] ?? (scratch[si] = new THREE.Color()); };
  const PALE = new THREE.Color(0xf6efdc);
  return {
    top: (id) => part(id, 'top'),
    side: (id) => part(id, 'side'),
    hex,
    // toward the pale of the parchment by f (0..1): lighter; what will go fades
    pale: (c, f) => tmp().copy(c).lerp(PALE, f),
    // darker by f (0..1): a hole's shadow
    dark: (c, f) => tmp().copy(c).multiplyScalar(1 - f),
  };
}

// the lines: dark for height, pale for depth; what an erase takes (animals, caves) pale
export const INK = { up: 0x3a2918, down: 0xf4ecd6, gone: 0xfbf5e4 };

// how see-through, from Settings (U.settings.ghost, 0 faint to 100 solid; 50, the default, is the look the director
// chose). The ghost's layers scale together: half as opaque at the faint end, 1.3 times at the solid end (the raised
// ground then 0.78, so the land behind still shows a little); the lines and marks change less, so they stay readable.
export const GHOST_DEFAULT = 50;
export function ghostScale(v) {
  const s = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : GHOST_DEFAULT;
  const k = s <= 50 ? 0.5 + 0.5 * (s / 50) : 1 + 0.3 * ((s - 50) / 50);
  return { body: k, line: 0.75 + 0.25 * k };
}
