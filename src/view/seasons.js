// The look of the seasons and the weather (DESIGN.md "Seasons and weather"; promoted from the look-only mock of
// 2026-11-16). It only draws: what season it is and what is falling come from the simulation (sim/season.js,
// sim.ask('season'), ask('seasonTime'), ask('weather')), and nothing here writes a world block or saved data.
//
// Pieces:
//   colours  the home land's mesher tags every face and tuft as it meshes it (world/mesher.js `look`): what kind
//            of thing it is (grass, dry grass, the three leaves, bushes, tufts, flowers), a key for when that spot
//            turns, the tree it belongs to, and whether snow can lie on it. The shader (the world material, wrapped
//            here) then paints the season's colours from uniforms: a change of season never remeshes the land.
//   trees    every tree is found at load (its trunk), so a whole crown turns one colour and each tree turns at its
//            own moment. A tree that goes bare has its leaf faces folded away in the shader and a small bundle of
//            wooden branches shown on its trunk (one instanced mesh for all trees). So the trunk and the trees
//            beside it are whole without the leaves, the mesher draws faces against leaves that may go (`keep`).
//   snow     lies on open tops (ground, roofs, evergreen crowns), from the sim's `cover`; whitens tuft tips; frosts
//            the sides of evergreen crowns. It settles as patches growing outward from several places and thaws as
//            holes growing from others (SNOW_FRONT): a small arrival map the land's fragment shader reads at each
//            pixel, so the fronts are smooth soft curves, never block by block. Shader only, nothing remeshed.
//   light    the daylight key (engine/lighting.js) and the mist colour per season, dulled under whole-map weather.
//   weather  one mesh of quads placed in the vertex shader (the god's rain's look, sim/powers-nature-rain.js):
//            whole-map weather tiles a box round the view, local weather fills its drifting disc; the land under
//            it gets the cloud shadow and wet ground through the world shader's last `wet` slot (world/shade.js).
//   prints   footprints in lying snow: people's and animals' positions are only read each frame; every stride a
//            dent goes into a fixed ring of instanced quads (one draw call, nothing allocated per frame).
// The change of season runs over TR season seconds either side of the turn (the label flips half way). The
// battleground (sim/battle-ground.js) has its own mesher and materials: none of this reaches it, and while it is
// shown the daylight key goes back to the game's own.
// Test switches (sim/season.js reads them): ?season=winter, ?seasonsecs=N, ?weather=rain|rain-local|snow|none.
import * as THREE from '../../vendor/three.module.js';
import { B, BLOCK_DEFS, isOpaque } from '../world/blocks.js';
import { noise2 } from '../world/noise.js';
import { SHADE, WET_SLOTS, enhance } from '../world/shade.js';
import { leanFor, easeLean, viewBox, GLSL_TILE } from './rain-look.js';
import { KEYS } from '../engine/lighting.js';
import { WORLD } from '../config.js';
import { T as SIM_T } from '../sim/tune.js';

const SX = WORLD.SIZE_X, SZ = WORLD.SIZE_Z, SY = WORLD.SIZE_Y, CH = WORLD.CHUNK;
const ORDER = ['spring', 'summer', 'autumn', 'winter'];

// ---------------------------------------------------------------------------
// colours (sRGB hex, as blocks.js writes them)
const rgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 1000) / 1000;
}

// What the shader tells apart. Two colours each: grass [one, other] mixed by broad patches; a bush [top, side];
// a tuft [stem, tip].
const C = { GRASS: 1, DRY: 2, LEAF: 3, LEAF_DARK: 4, LEAF_BRIGHT: 5, BUSH: 6, BUSH_SIDE: 7, BUSH_BARE: 8, TALL: 9, FERN: 10, REED: 11, DEAD: 12, FLOWER_R: 13, FLOWER_Y: 14, FLOWER_W: 15, BERRY: 16 };
const NC = 17;
const LEAF_CLASS = { [B.LEAVES]: C.LEAF, [B.LEAVES_DARK]: C.LEAF_DARK, [B.LEAVES_BRIGHT]: C.LEAF_BRIGHT };
const CROSS_CLASS = { [B.TALLGRASS]: C.TALL, [B.FERN]: C.FERN, [B.REED]: C.REED, [B.DEADBUSH]: C.DEAD, [B.FLOWER_RED]: C.FLOWER_R, [B.FLOWER_YELLOW]: C.FLOWER_Y, [B.FLOWER_WHITE]: C.FLOWER_W };
// flora drawn in its own shape (world/mesher.js emitBush, emitFlower; the food work): a berry bush's dome has its own
// class (BERRY: it stays green into autumn, when it fruits, and dulls in winter), and every flower's stem turns with
// the flowers (all flowers share one stem colour, so the three flower classes serve the six kinds). Not in
// CROSS_CLASS, which also sets each class's base colour.
const SHAPE_CLASS = { [B.SHRUB_BERRY]: C.BERRY, [B.BERRY_BARE]: C.BERRY, [B.FLOWER_BLUE]: C.FLOWER_R, [B.FLOWER_DAISY]: C.FLOWER_Y, [B.FLOWER_LILAC]: C.FLOWER_W };

// The season tables (the mock's, with winter's bare ground made a cool dull green rather than beige)
const FLOWER = (a, b) => ({ [C.FLOWER_R]: [a, b], [C.FLOWER_Y]: [a, b], [C.FLOWER_W]: [a, b] });
const PAL = {
  spring: {
    [C.GRASS]: [0x74ad42, 0x86b84a], [C.DRY]: [0x8aa851, 0x8aa851],
    [C.LEAF]: [0x5c9a34], [C.LEAF_DARK]: [0x467f2f], [C.LEAF_BRIGHT]: [0x84bc45],
    [C.BUSH]: [0x58993f], [C.BUSH_SIDE]: [0xe6dccb], [C.BERRY]: [0x55913c],
    [C.TALL]: [0x76ad44, 0xb6cf68], [C.FERN]: [0x4a8a36, 0x66a345], [C.REED]: [0x8db152, 0xeef0dc], [C.DEAD]: [0x8c8f4c, 0xa9b562],
    light: { sun: 0xfff1d6, sunI: 1.55, sky: 0xc6dcef, ground: 0x7e7050, hemiI: 0.64, mist: 0xd2dde0 },
  },
  summer: {
    [C.GRASS]: [0x5f9236, 0x6e9a3a], [C.DRY]: [0x93944e, 0x93944e],
    [C.LEAF]: [0x3b7427], [C.LEAF_DARK]: [0x2a5a24], [C.LEAF_BRIGHT]: [0x5a952f],
    [C.BUSH]: [0x3f7834], [C.BUSH_SIDE]: [0xa63d30], [C.BERRY]: [0x3f7434],
    [C.TALL]: [0x71923c, 0xb8b460], [C.FERN]: [0x35622c, 0x487a34],
    light: { sun: 0xffdba0, sunI: 1.66, sky: 0xbfd6ea, ground: 0x80683e, hemiI: 0.6, mist: 0xd5dbd2 },
  },
  autumn: {
    [C.GRASS]: [0x86934a, 0xa09a52], [C.DRY]: [0xa8995a, 0xa8995a],
    [C.LEAF]: [0xc98a2e], [C.LEAF_DARK]: [0x9a5a2c], [C.LEAF_BRIGHT]: [0xd6a234],
    [C.BUSH]: [0x8a6d36], [C.BUSH_SIDE]: [0x9c3528], [C.BERRY]: [0x5d7233],
    [C.TALL]: [0xa39b4e, 0xcbb76c], [C.FERN]: [0x9a6630, 0xb37a38], [C.REED]: [0xab9e5a, 0xe9e2c9], ...FLOWER(0x8a8a46, 0xb99a52),
    light: { sun: 0xffd8a8, sunI: 1.5, sky: 0xc9d1d9, ground: 0x84613c, hemiI: 0.6, mist: 0xd9d2c3 },
  },
  winter: {
    [C.GRASS]: [0x5f6f4c, 0x6c7656], [C.DRY]: [0x7f7a5c, 0x7f7a5c],
    [C.LEAF]: [0x35512f], [C.LEAF_DARK]: [0x2f4a2c], [C.LEAF_BRIGHT]: [0x3d5a33], // what is left green: evergreens, dark and dull
    [C.BUSH]: [0x5c6346], [C.BUSH_SIDE]: [0x525a3f], [C.BUSH_BARE]: [0x66654f], [C.BERRY]: [0x56603f],
    [C.TALL]: [0x76795a, 0x9a9b7c], [C.FERN]: [0x575b3c, 0x6a6a4a], [C.REED]: [0x958f68, 0xd8d6c6], [C.DEAD]: [0x766a4c, 0x948466], ...FLOWER(0x6f6d58, 0x8a8470),
    light: { sun: 0xf7f1e8, sunI: 1.4, sky: 0xd0daea, ground: 0x7e766a, hemiI: 0.66, mist: 0xdde3e7 },
  },
};
// autumn crowns: gold, orange, red, russet, olive brown, still green (weights 3 3 2 2 1.5 1, in the shader)
const TURN = [0xd49b2f, 0xcb6d29, 0xab412b, 0x985a2d, 0x8a7c3a, 0x6a8a36];
const BLOSSOM = [0xf0c9d2, 0xf4e4e6, 0xe8adbd];
// spring meadows: tall grass tips that bloom (the director: flowers "rampant in spring")
const MEADOW = [0xe0463a, 0xf2c94a, 0xf4f0e6, 0xb57ad6, 0x6f8fe0];
const BLOOM = 0.38;          // share of tall grass tufts in flower in spring
const SNOW_TOP = [0.91, 0.93, 0.95], SNOW_SHADE = [0.80, 0.85, 0.91];

// How snow settles and thaws (the director, 2026-11-16: "a smooth flow and not a rigid line, moving slowly across as
// outward ripples from several locations, for the thaw. and for the snow too as it covers"). As the sim's cover rises,
// white patches grow outward from SEEDS places at once until they meet; as it falls, bare ground opens from THAW_SEEDS
// other places and those holes grow until the snow is gone. Each front is a wobbly ring (the places are pushed about
// by three sizes of smooth noise, WARP), each patch grows at its own pace (SPEED), and the edge is decided per pixel
// with a soft blend SOFT blocks either side, so it crosses a block's face as a smooth curve, never block by block.
export const SNOW_FRONT = {
  SEEDS: 11,            // places the snow starts to settle from (placed from the land's seed: a land always looks the same)
  THAW_SEEDS: 9,        // places the ground starts to show through from as it thaws (other places)
  SPEED: [0.75, 1.3],   // each patch grows at its own pace, between these (1 = the average)
  WARP: [[42, 11], [14, 4], [5, 1.3]], // the wobble: [wavelength, how far it pushes] in blocks, broad to fine
  SOFT: 0.4,            // half the width of the soft edge, in blocks (the blend is twice this: a little under a block)
  UNDER_CROWN: 5,       // under an evergreen crown snow comes when the front is this many blocks past, and goes this much sooner
  RES: 2,               // the arrival map's points per block (it is drawn smoothly between them)
  BUILD_MS: 2,          // the map is worked out a little each frame after loading, this many milliseconds at most
};

const LEAFY = new Set([B.LEAVES, B.LEAVES_DARK, B.LEAVES_BRIGHT]);
const TRUNK = new Set([B.WOOD, B.WOOD_BIRCH]);
const isCross = (id) => !!BLOCK_DEFS[id]?.cross;

// the shader's base colour per class (what the mesher drew it from), so a season colour can replace it
function baseColours() {
  const out = new Array(NC * 2).fill(null).map(() => [1, 1, 1]);
  const d = (id) => BLOCK_DEFS[id] ?? {};
  const set = (c, a, b) => { out[c * 2] = a ?? [1, 1, 1]; out[c * 2 + 1] = b ?? a ?? [1, 1, 1]; };
  set(C.GRASS, d(B.GRASS).top, d(B.GRASS).top);
  set(C.DRY, d(B.GRASS_DRY).top);
  set(C.LEAF, d(B.LEAVES).top); set(C.LEAF_DARK, d(B.LEAVES_DARK).top); set(C.LEAF_BRIGHT, d(B.LEAVES_BRIGHT).top);
  set(C.BUSH, d(B.BUSH).top); set(C.BUSH_SIDE, d(B.BUSH).side ?? d(B.BUSH).top); set(C.BUSH_BARE, d(B.BUSH_BARE).top);
  set(C.BERRY, d(B.SHRUB_BERRY).top);
  for (const [id, c] of Object.entries(CROSS_CLASS)) {
    const def = d(Number(id)), top = def.top ?? [1, 1, 1];
    set(c, top, def.accent ?? top.map((v) => Math.min(1, v * 1.06)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// trees: found at load. owner[col] = the nearest trunk within 4 columns (or -1)
function findTrees(world) {
  const d = world.data, S = SX * SZ, top = Math.min(SY - 2, world.maxY);
  const trees = [];
  const owner = new Int32Array(S).fill(-1), best = new Float32Array(S).fill(1e9);
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    for (let y = 1; y <= top; y++) {
      const id = d[x + z * SX + y * S];
      if (!TRUNK.has(id)) continue;
      const below = d[x + z * SX + (y - 1) * S];
      if (TRUNK.has(below) || LEAFY.has(below) || below === B.AIR) continue;
      let leaf = 0, h = y;
      while (h < top && TRUNK.has(d[x + z * SX + h * S])) h++;
      for (let yy = h - 3; yy <= Math.min(top, h + 3) && !leaf; yy++) {
        for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ox, zz = z + oz;
          if (xx < 0 || zz < 0 || xx >= SX || zz >= SZ) continue;
          const v = d[xx + zz * SX + yy * S];
          if (LEAFY.has(v)) { leaf = v; break; }
        }
      }
      if (!leaf) continue; // a post or a dead snag: not a tree with a crown
      const h1 = hash3(x, 11, z), h2 = hash3(z, 23, x);
      // packed for the shader: 2 + h1 + 1000 h2 (each 0..999) + a million for a palm (birch wood); 0 = no tree
      const pack = 2 + Math.floor(h1 * 999) + 1000 * Math.floor(h2 * 999) + (id === B.WOOD_BIRCH ? 1e6 : 0);
      trees.push({ x, z, y0: y, top: h, wood: id, leaf, pack });
      break;
    }
  }
  trees.forEach((t, i) => {
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const x = t.x + dx, z = t.z + dz;
      if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
      const q2 = dx * dx + dz * dz;
      if (q2 > 20) continue;
      const c = x + z * SX;
      if (q2 < best[c]) { best[c] = q2; owner[c] = i; }
    }
  });
  return { trees, owner, best };
}

// ---------------------------------------------------------------------------
// The snow's arrival map (SNOW_FRONT): for every point of the land, how far (in blocks, along the warped ground) it is
// from the nearest place the snow settles from (r) and the nearest place the thaw opens from (g). Kept as a small
// half-float texture the shaders read at each pixel's world position, and as arrays for the footprints' test, so the
// two always agree. Worked out row by row (step) so loading is not held up; finish() completes it at once if snow is
// needed before then.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeSnowField(seed) {
  const F = SNOW_FRONT, RES = F.RES, W = SX * RES, H = SZ * RES, G = SX + 1;
  const r = rng((seed * 2246822519) ^ 0x51ed27);
  // the starting places: spread out (each the best of a dozen tries, the furthest from those already placed), kept
  // off the misty edge; each with its own pace
  const places = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      let best = null, bd = -1;
      for (let k = 0; k < 12; k++) {
        const x = SX * (0.1 + 0.8 * r()), z = SZ * (0.1 + 0.8 * r());
        let d = 1e9;
        for (const p of out) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
        if (d > bd) { bd = d; best = { x, z }; }
      }
      best.k = 1 / (F.SPEED[0] + (F.SPEED[1] - F.SPEED[0]) * r());
      out.push(best);
    }
    return out;
  };
  const sets = [places(F.SEEDS), places(F.THAW_SEEDS)];
  const offs = sets.map(() => F.WARP.map(() => [r() * 900, r() * 900, r() * 900, r() * 900]));
  const A = new Float32Array(W * H), Bf = new Float32Array(W * H), data = new Uint16Array(W * H * 2);
  const out = [A, Bf];
  // the warp at each block corner (both maps), filled a row ahead of the texels that need it
  const WX = [new Float32Array(G * (SZ + 1)), new Float32Array(G * (SZ + 1))], WZ = [new Float32Array(G * (SZ + 1)), new Float32Array(G * (SZ + 1))];
  const warpRow = (z) => {
    for (let s = 0; s < 2; s++) for (let x = 0; x < G; x++) {
      let qx = 0, qz = 0;
      F.WARP.forEach(([L, k], o) => {
        const of = offs[s][o];
        qx += k * (2 * noise2(x / L + of[0], z / L + of[1]) - 1);
        qz += k * (2 * noise2(x / L + of[2], z / L + of[3]) - 1);
      });
      WX[s][z * G + x] = qx; WZ[s][z * G + x] = qz;
    }
  };
  const half = THREE.DataUtils.toHalfFloat;
  const tex = new THREE.DataTexture(data, W, H, THREE.RGFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  const S = { tex, A, B: Bf, maxA: 1, maxB: 1, inA: 1, inB: 1, ready: false, row: 0 };
  let warped = 0;
  // one block row (RES rows of texels)
  const blockRow = (zb) => {
    while (warped <= zb + 1 && warped <= SZ) warpRow(warped++);
    for (let j = zb * RES; j < (zb + 1) * RES; j++) {
      const z = (j + 0.5) / RES, zi = Math.min(SZ - 1, Math.floor(z)), fz = z - zi;
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) / RES, xi = Math.min(SX - 1, Math.floor(x)), fx = x - xi, o = zi * G + xi;
        for (let s = 0; s < 2; s++) {
          const wx = WX[s], wz = WZ[s];
          const qx = x + (wx[o] * (1 - fx) + wx[o + 1] * fx) * (1 - fz) + (wx[o + G] * (1 - fx) + wx[o + G + 1] * fx) * fz;
          const qz = z + (wz[o] * (1 - fx) + wz[o + 1] * fx) * (1 - fz) + (wz[o + G] * (1 - fx) + wz[o + G + 1] * fx) * fz;
          let d = 1e9;
          for (const p of sets[s]) { const dx = qx - p.x, dz = qz - p.z, v = Math.sqrt(dx * dx + dz * dz) * p.k; if (v < d) d = v; }
          out[s][j * W + i] = d;
          data[(j * W + i) * 2 + s] = half(d);
        }
      }
    }
  };
  // the furthest any point is (max) and the furthest any point clear of the misty edge is (inA, inB): the fronts
  // pace themselves on the second, and sweep the far corners in the last moments
  const done = () => {
    let ma = 0, mb = 0, ia = 0, ib = 0;
    const e0 = WORLD.EDGE_FADE * RES;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const o = j * W + i, a = A[o], b = Bf[o];
      if (a > ma) ma = a;
      if (b > mb) mb = b;
      if (i >= e0 && j >= e0 && i < W - e0 && j < H - e0) { if (a > ia) ia = a; if (b > ib) ib = b; }
    }
    S.maxA = ma; S.maxB = mb; S.inA = ia; S.inB = ib; S.ready = true;
    tex.needsUpdate = true;
  };
  S.step = (ms) => {
    if (S.ready) return;
    const t0 = performance.now();
    while (S.row < SZ && performance.now() - t0 < ms) blockRow(S.row++);
    if (S.row >= SZ) done();
  };
  S.finish = () => S.step(1e9);
  // the two distances at a world point, smoothly between the map's points (as the texture is drawn)
  const at = (arr, x, z) => {
    const u = Math.max(0, Math.min(W - 1.001, x * RES - 0.5)), v = Math.max(0, Math.min(H - 1.001, z * RES - 0.5));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, o = j * W + i;
    return (arr[o] * (1 - fu) + arr[o + 1] * fu) * (1 - fv) + (arr[o + W] * (1 - fu) + arr[o + W + 1] * fu) * fv;
  };
  S.at = (x, z) => [at(A, x, z), at(Bf, x, z)];
  S.places = sets;
  return S;
}
// how much snow lies at a point (0..1): the shaders' rule (SNOW_FN), for the footprints. f the two distances, keep 1
// in the open or 1 + UNDER_CROWN under leaves (keep - 1: how many blocks behind the front snow comes there, and ahead
// of the thaw it goes), F the uniform's four numbers
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const snowAmount = (f, keep, F) => (F.w <= 0 ? 0 : (1 - smoothstep(F.x - F.z, F.x + F.z, f[0] + keep - 1)) * smoothstep(F.y - F.z, F.y + F.z, Math.max(0, f[1] - keep + 1)));
const SNOW_FN = /* glsl */ `
uniform sampler2D uSnowTex;
uniform vec4 uSnowF;     // x: settled out to (blocks of the settling map), y: thawed out to (the thaw map), z: soft half-width, w: 1 while any lies
uniform vec2 uSnowUV;    // world x, z to the map's 0..1
float seaSnow( vec2 xz, float keep ) {
  if ( uSnowF.w <= 0.0 ) return 0.0;
  vec2 f = max( texture2D( uSnowTex, xz * uSnowUV ).rg + vec2( keep - 1.0, 1.0 - keep ), 0.0 );
  return ( 1.0 - smoothstep( uSnowF.x - uSnowF.z, uSnowF.x + uSnowF.z, f.r ) ) * smoothstep( uSnowF.y - uSnowF.z, uSnowF.y + uSnowF.z, f.g );
}
`;

// ---------------------------------------------------------------------------
// the shader: the same few functions in the land's material and the branches'
const SEA_COMMON = /* glsl */ `
uniform vec3 uSeaA[ ${NC * 2} ];
uniform vec3 uSeaB[ ${NC * 2} ];
uniform vec3 uSeaBase[ ${NC * 2} ];
uniform vec3 uSeaTurn[ 6 ];
uniform vec3 uSeaBlos[ 3 ];
uniform vec3 uSeaMeadow[ 5 ];
uniform vec4 uSeaS;      // x: how far from season a to b (0..1), y: snow lying (0..1), z: season a, w: season b (0 spring .. 3 winter)
float seaH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float seaN( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( seaH( i ), seaH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( seaH( i + vec2( 0.0, 1.0 ) ), seaH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// a tree packed by the look (2 + h1 + 1000 h2 + a million for a palm): h1, h2, palm, h3 (its moment to turn)
vec4 seaUnpack( float w ) {
  float v = w - 2.0, palm = v >= 999999.5 ? 1.0 : 0.0;
  v -= palm * 1e6;
  float h2 = floor( v / 1000.0 + 0.0005 ), h1 = v - h2 * 1000.0;
  h1 /= 999.0; h2 /= 999.0;
  return vec4( h1, h2, palm, fract( sin( h1 * 91.7 + h2 * 47.3 ) * 43758.5453 ) );
}
// what a tree is in season s: rgb its crown colour (x < 0: the season's plain colour for its leaf), w 1 if bare
vec4 seaTree( int s, vec4 t, int kind, float bh ) {
  vec4 res = vec4( -1.0, 0.0, 0.0, 0.0 );
  if ( s == 0 ) {
    if ( t.z < 0.5 && t.x < 0.16 && fract( bh * 7.31 ) < 0.72 ) {
      float j = fract( bh * 3.97 );
      res = vec4( j < 0.333 ? uSeaBlos[ 0 ] : j < 0.667 ? uSeaBlos[ 1 ] : uSeaBlos[ 2 ], 0.0 );
    }
  } else if ( s == 2 ) {
    if ( t.z > 0.5 ) res = vec4( 0.416, 0.541, 0.212, 0.0 );
    else if ( t.x < 0.2 ) res = vec4( 0.659, 0.4, 0.18, 1.0 );
    else {
      float r = t.y * 12.5;
      vec3 c = r < 3.0 ? uSeaTurn[ 0 ] : r < 6.0 ? uSeaTurn[ 1 ] : r < 8.0 ? uSeaTurn[ 2 ] : r < 10.0 ? uSeaTurn[ 3 ] : r < 11.5 ? uSeaTurn[ 4 ] : uSeaTurn[ 5 ];
      res = vec4( c * ( 0.9 + 0.2 * fract( bh * 5.3 ) ), 0.0 );
    }
  } else if ( s == 3 ) {
    bool ever = t.z > 0.5 || ( kind == 1 && t.y < 0.8 ) || t.y < 0.12;
    if ( !ever ) res = vec4( 0.659, 0.4, 0.18, 1.0 );
  }
  return res;
}
// how far a tree has gone from season a to b: each tree has its own moment
float seaTreeK( vec4 t ) { return uSeaS.z == uSeaS.w ? 0.0 : clamp( ( uSeaS.x - t.w * 0.7 ) * 3.5, 0.0, 1.0 ); }
`;

const SEA_LAND = /* glsl */ `
attribute vec4 season;   // x: class + key * 0.98, y: 0 no snow, else 1 in the open or 1 + UNDER_CROWN under leaves, z: face shade * AO (a tuft: 0 root, 1 tip), w: tree (or a tuft's hash)
varying vec4 vSeaSnow;   // for the fragment stage: x what snow does here (0 nothing, 1 lies on it, 2 whitens a tuft's tip, 3 frosts a crown's side), y keep, z shade (a tuft: tip)
vec3 seaLand( vec3 col, out float hide ) {
  hide = 0.0;
  vSeaSnow = vec4( 0.0, 1.0, season.z, 0.0 );
  int c = int( floor( season.x + 0.001 ) );
  float key = fract( season.x ) / 0.98;
  int sa = int( uSeaS.z + 0.5 ), sb = int( uSeaS.w + 0.5 );
  float k = sa == sb ? 0.0 : clamp( ( uSeaS.x - 0.7 * key ) * 3.5, 0.0, 1.0 );
  vec3 outc = col;
  if ( c == 1 ) {
    float n = seaN( position.xz * 0.06 + vec2( 7.1, 3.3 ) );
    vec3 ta = mix( uSeaA[ 2 ], uSeaA[ 3 ], n ), tb = mix( uSeaB[ 2 ], uSeaB[ 3 ], n );
    if ( season.w > 1.5 ) {
      // fallen leaves under a tree in autumn, its own colour
      vec4 t = seaUnpack( season.w );
      float lit = 0.24 * ( 0.6 + 0.4 * seaH( floor( position.xz ) ) );
      if ( sa == 2 ) { vec4 r = seaTree( 2, t, 0, 0.5 ); if ( r.x >= 0.0 ) ta = mix( ta, r.rgb, lit * ( r.w > 0.5 ? 1.3 : 1.0 ) ); }
      if ( sb == 2 ) { vec4 r = seaTree( 2, t, 0, 0.5 ); if ( r.x >= 0.0 ) tb = mix( tb, r.rgb, lit * ( r.w > 0.5 ? 1.3 : 1.0 ) ); }
    } else if ( season.w < 1.0 && season.w < 0.03 + 0.1 * key ) {
      // spring meadows: flowers in the grass, thicker in some places than others
      vec3 m = uSeaMeadow[ int( fract( season.w * 37.0 ) * 4.999 ) ];
      if ( sa == 0 ) ta = mix( ta, m, 0.72 );
      if ( sb == 0 ) tb = mix( tb, m, 0.72 );
    }
    outc = col * mix( ta, tb, k ) / uSeaBase[ 2 ];
  } else if ( c == 2 || ( c >= 6 && c <= 8 ) || c == 16 ) {
    outc = col * mix( uSeaA[ c * 2 ], uSeaB[ c * 2 ], k ) / uSeaBase[ c * 2 ];
  } else if ( c >= 3 && c <= 5 ) {
    vec3 ca = uSeaA[ c * 2 ], cb = uSeaB[ c * 2 ];
    if ( season.w > 1.5 ) {
      vec4 t = seaUnpack( season.w );
      float kt = seaTreeK( t );
      vec4 ra = seaTree( sa, t, c - 3, key ), rb = seaTree( sb, t, c - 3, key );
      if ( ra.x >= 0.0 ) ca = ra.rgb;
      if ( rb.x >= 0.0 ) cb = rb.rgb;
      hide = ( kt >= 0.5 ? rb.w : ra.w );
      k = kt;
    }
    outc = col * mix( ca, cb, k ) / uSeaBase[ c * 2 ];
    // a little frost on the sides of a snowed-on crown (in the fragment stage, where the snow lies round it)
    if ( normal.y < 0.5 ) vSeaSnow.x = 3.0;
  } else if ( c >= 9 && c <= 15 ) {
    int i = c * 2 + ( season.z > 0.5 ? 1 : 0 );
    vec3 ta = uSeaA[ i ], tb = uSeaB[ i ];
    if ( c == 9 && season.z > 0.5 ) {
      vec3 m = uSeaMeadow[ int( fract( season.w * 13.7 ) * 4.999 ) ];
      if ( sa == 0 && season.w < ${BLOOM} ) ta = m;
      if ( sb == 0 && season.w < ${BLOOM} ) tb = m;
    }
    if ( c >= 13 && c <= 15 && season.w < 0.25 ) { if ( sa == 2 ) ta = uSeaBase[ i ]; if ( sb == 2 ) tb = uSeaBase[ i ]; } // a few flowers bloom on into autumn
    outc = col * mix( ta, tb, k ) / uSeaBase[ i ];
  }
  // snow: where it may lie (and how), for the fragment stage, which decides per pixel whether it lies there now
  if ( season.y > 0.5 ) vSeaSnow.xy = vec2( c >= 9 && c <= 15 ? 2.0 : 1.0, season.y );
  return outc;
}
`;

// The snow on the land, per pixel (after the vertex colour is in diffuseColor): the front's soft edge crosses a face
// as a smooth curve. Drifts: the snow's own light and shade in broad soft patches.
const SEA_FRAG_PARS = /* glsl */ `
varying vec4 vSeaSnow;
${SNOW_FN}
float seaFH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float seaFN( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( seaFH( i ), seaFH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( seaFH( i + vec2( 0.0, 1.0 ) ), seaFH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;
const SEA_FRAG_SNOW = /* glsl */ `
if ( vSeaSnow.x > 0.5 && uSnowF.w > 0.0 ) {
  float seaSn = seaSnow( vWPos.xz, vSeaSnow.y );
  if ( seaSn > 0.0 ) {
    vec3 seaTop = diffuse * vec3( ${SNOW_TOP.join(', ')} ), seaShade = diffuse * vec3( ${SNOW_SHADE.join(', ')} );
    if ( vSeaSnow.x < 1.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, mix( seaShade, seaTop, 0.55 + 0.45 * seaFN( vWPos.xz * 0.3 ) ) * vSeaSnow.z, seaSn );
    else if ( vSeaSnow.x < 2.5 ) diffuseColor.rgb = mix( diffuseColor.rgb, seaTop, 0.8 * vSeaSnow.z * seaSn );
    else diffuseColor.rgb = mix( diffuseColor.rgb, seaShade * vSeaSnow.z, 0.22 * seaSn );
  }
}
`;

// the branches of a bare tree: shown only while its tree is bare
const SEA_BRANCH = /* glsl */ `
attribute float tree;
`;

// Wrap one of the land's materials (already through shade.js enhance): its program gets the season attribute and
// uniforms; a vertex of a folded crown goes off screen.
function wrapLand(mat, U) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SEA_COMMON + SEA_LAND)
      .replace('#include <color_vertex>', '#include <color_vertex>\nfloat seaHide = 0.0;\nvColor.rgb = seaLand( vColor.rgb, seaHide );')
      .replace('#include <project_vertex>', '#include <project_vertex>\nif ( seaHide > 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );');
    // the snow per pixel: after the vertex colour (shade.js keeps its own lines round this include, and reads the
    // albedo after it, so night and wet ground see the snow)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SEA_FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SEA_FRAG_SNOW);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + ':sea';
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------------------
export function setupSeasons({ world, mesher, renderer }) {
  const T0 = performance.now();
  let { trees, owner, best } = findTrees(world);
  const ownerAt = (x, z) => (x >= 0 && z >= 0 && x < SX && z < SZ ? owner[x + z * SX] : -1);
  const packAt = (x, z) => { const i = ownerAt(x, z); return i >= 0 ? trees[i].pack : 0; };

  // where and when snow lies: the arrival map (SNOW_FRONT), worked out a little each frame from here on
  const field = makeSnowField((world.gen?.seed ?? 1) >>> 0);
  // what a face open to the sky carries for the snow (the season attribute's y): 0 under a roof (no snow), 1 in the
  // open, 1 + UNDER_CROWN under leaves (snow comes later and goes sooner there; bare crowns let it all through)
  const keepAt = (x, y, z) => {
    for (let k = 1; k <= 12; k++) {
      const v = world.get(x, y + k, z);
      if (v === B.AIR || isCross(v)) continue;
      return LEAFY.has(v) ? 1 + SNOW_FRONT.UNDER_CROWN : 0;
    }
    return 1;
  };
  const groundKey = (x, z) => noise2(x * 0.045 + 3.7, z * 0.045 + 9.1);
  const out3 = [0, 0, 0];
  const look = {
    tag(id, part, x, y, z) {
      let c = 0, key = 0, w = 0;
      if (LEAFY.has(id)) { c = LEAF_CLASS[id]; key = hash3(x, y, z); w = packAt(x, z); }
      else if (part === 'top' && id === B.GRASS) { c = C.GRASS; key = groundKey(x, z); w = best[x + z * SX] <= 10 ? packAt(x, z) : 0; if (!w) w = hash3(x, 7, z) * 0.999; }
      else if (part === 'top' && id === B.GRASS_DRY) { c = C.DRY; key = groundKey(x, z); }
      else if (id === B.BUSH) { c = part === 'side' ? C.BUSH_SIDE : C.BUSH; key = groundKey(x, z); }
      else if (id === B.BUSH_BARE) { c = C.BUSH_BARE; key = groundKey(x, z); }
      out3[0] = c + key * 0.98; out3[1] = part === 'top' ? keepAt(x, y, z) : 0; out3[2] = w;
      return out3;
    },
    cross(id, x, y, z) {
      const c = CROSS_CLASS[id] ?? SHAPE_CLASS[id] ?? 0;
      out3[0] = c + (c ? groundKey(x, z) * 0.98 : 0); out3[1] = keepAt(x, y, z); out3[2] = hash3(x, 9, z);
      return out3;
    },
    // a face against a leaf block of a tree that may go bare is drawn, so the trunk, and a crown beside it, are
    // whole when those leaves are folded away (faces inside one crown stay culled: they all go together)
    keep(id, nid, x, z, nx, nz) {
      if (!LEAFY.has(nid)) return false;
      const o = ownerAt(nx, nz);
      if (o < 0 || trees[o].wood === B.WOOD_BIRCH) return false; // no tree, or a palm: those leaves never go
      return !(LEAFY.has(id) && ownerAt(x, z) === o);
    },
  };
  mesher.look = look;

  // ---- the shader's uniforms ----
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const base = baseColours();
  const U = {
    uSeaA: { value: base.map(V) }, uSeaB: { value: base.map(V) }, uSeaBase: { value: base.map(V) },
    uSeaTurn: { value: TURN.map((h) => V(rgb(h))) }, uSeaBlos: { value: BLOSSOM.map((h) => V(rgb(h))) },
    uSeaMeadow: { value: MEADOW.map((h) => V(rgb(h))) },
    uSeaS: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSnowTex: { value: field.tex }, uSnowF: { value: new THREE.Vector4(0, 0, SNOW_FRONT.SOFT, 0) },
    uSnowUV: { value: new THREE.Vector2(1 / SX, 1 / SZ) },
  };
  wrapLand(mesher.solidMat, U);
  wrapLand(mesher.crossMat, U);
  // a season's colours into one of the two slots (class by class; what a season does not change keeps its base)
  const fill = (arr, s) => {
    const P = PAL[s];
    for (let c = 0; c < NC; c++) for (let k = 0; k < 2; k++) {
      const h = P?.[c]?.[k] ?? P?.[c]?.[0];
      const v = h != null ? rgb(h) : base[c * 2 + k];
      arr[c * 2 + k].set(v[0], v[1], v[2]);
    }
  };
  const D = { a: null, b: null, p: 0, snow: 0, peak: 0, thaw: 0 };
  function draw(a, b, p, snow) {
    if (a !== D.a) { fill(U.uSeaA.value, a); D.a = a; }
    if (b !== D.b) { fill(U.uSeaB.value, b); D.b = b; }
    D.p = p; D.snow = snow;
    U.uSeaS.value.set(p, snow, ORDER.indexOf(a), ORDER.indexOf(b));
    fronts(snow);
  }
  // Where the fronts stand, from the sim's cover. While it rises the settling patches grow (out to the highest cover
  // so far, `peak`); while it falls the thaw's holes open in what settled, by the share of it gone (1 - cover / peak).
  // Both follow the cover both ways, so nothing jumps if snow comes again in a thaw; the peak starts again once the
  // snow has all gone.
  function fronts(cover) {
    const on = cover > 0.0005;
    if (on && !field.ready) field.finish();
    D.peak = on ? Math.max(D.peak, cover) : 0;
    D.thaw = on ? clamp01(1 - cover / D.peak) : 1;
    // the fronts move at a steady pace across the land clear of the edge's mist, and in the last 5 percent also
    // reach the far corners under it
    const e = SNOW_FRONT.SOFT, out = (k, inner, max) => -e + k * (inner + 2 * e) + smoothstep(0.95, 1, k) * (max - inner);
    U.uSnowF.value.set(out(D.peak, field.inA, field.maxA + SNOW_FRONT.UNDER_CROWN), out(D.thaw, field.inB, field.maxB), e, on ? 1 : 0);
  }

  // ---- light: the daylight key and the mist colour ----
  const day = KEYS.day;
  const DAY0 = { sun: day.sun[0], sunI: day.sun[1], sky: day.hemi[0], ground: day.hemi[1], hemiI: day.hemi[2], mist: WORLD.MIST_HEX };
  const hmix = (a, b, t) => {
    const c = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
    return (c(16) << 16) | (c(8) << 8) | c(0);
  };
  const lmix = (A, Bk, t) => ({ sun: hmix(A.sun, Bk.sun, t), sunI: A.sunI + (Bk.sunI - A.sunI) * t, sky: hmix(A.sky, Bk.sky, t),
    ground: hmix(A.ground, Bk.ground, t), hemiI: A.hemiI + (Bk.hemiI - A.hemiI) * t, mist: hmix(A.mist, Bk.mist, t) });
  // a dull day under the clouds: weaker, whiter sun, more sky light, a greyer mist (never a haze over the land)
  const dull = (L, kind) => (kind === 'rain'
    ? { sun: hmix(L.sun, 0xe2e8ee, 0.6), sunI: L.sunI * 0.6, sky: hmix(L.sky, 0xb6c2ca, 0.5), ground: hmix(L.ground, 0x6c6a62, 0.4), hemiI: L.hemiI * 1.2, mist: hmix(L.mist, 0xb9c3c8, 0.55) }
    : { sun: hmix(L.sun, 0xeef2f6, 0.6), sunI: L.sunI * 0.72, sky: hmix(L.sky, 0xdde5ec, 0.5), ground: hmix(L.ground, 0x8a8a88, 0.4), hemiI: L.hemiI * 1.18, mist: hmix(L.mist, 0xdfe5ea, 0.6) });
  let mistNow = null;
  function setLight(L) {
    day.sun[0] = L.sun; day.sun[1] = L.sunI;
    day.hemi[0] = L.sky; day.hemi[1] = L.ground; day.hemi[2] = L.hemiI;
    if (L.mist !== mistNow) { mistNow = L.mist; renderer.setBackground(L.mist); }
  }
  function lightFor(a, b, p, kind, amount) {
    let L = PAL[a]?.light ?? DAY0;
    if (b !== a && p > 0) L = lmix(L, PAL[b]?.light ?? DAY0, p * p * (3 - 2 * p));
    if (kind && amount > 0) L = lmix(L, dull(L, kind), amount);
    return L;
  }

  // the first drawn state, before the sim is there to ask: the start season of the address, or spring
  const q = new URLSearchParams(location.search);
  const s0 = ORDER.includes(q.get('season')) ? q.get('season') : 'spring';
  draw(s0, s0, 0, q.get('weather') === 'snow' ? 1 : 0);
  bloomFor({ name: s0, t: 0 }, SHADE.bloom.value);
  setLight(lightFor(s0, s0, 0));

  // the snowy open ground at a column, or -1 where no snow is drawn there (the same test as the shader's)
  const scanTop = Math.min(SY - 2, world.maxY + 4);
  const bareNow = (i) => {
    // whether tree i is drawn bare now (the shader's rule, for footprints under it)
    if (i < 0) return false;
    const t = trees[i];
    const h1 = (((t.pack - 2) % 1e6) % 1000) / 999, h2 = Math.floor(((t.pack - 2) % 1e6) / 1000) / 999, palm = t.pack >= 1e6;
    const s = D.b !== D.a && D.p > 0.5 ? D.b : D.a;
    if (palm) return false;
    if (s === 'autumn') return h1 < 0.2;
    if (s === 'winter') return !(t.leaf === B.LEAVES_DARK && h2 < 0.8) && !(h2 < 0.12);
    return false;
  };
  // (x, z the print's own point; printTop.keep is left at that ground's keep, for the print's shader)
  const PRINT_MIN = 0.3; // a print is made where at least this much snow is drawn
  const printTop = (x, z) => {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= SX || cz >= SZ || D.snow <= 0 || !field.ready) return -1;
    for (let y = scanTop; y > 0; y--) {
      const id = world.get(cx, y, cz);
      if (id === B.AIR || isCross(id) || id === B.ROOTS) continue;
      if (LEAFY.has(id)) { if (bareNow(ownerAt(cx, cz))) continue; return -1; }
      if (id === B.WATER || TRUNK.has(id) || id === B.THATCH || !isOpaque(id)) return -1;
      const k = keepAt(cx, y, cz);
      printTop.keep = k;
      return k > 0 && snowAmount(field.at(x, z), k, U.uSnowF.value) >= PRINT_MIN ? y : -1;
    }
    return -1;
  };
  printTop.keep = 1;

  // a god's edit may plant or fell trees: find them again, and redraw the chunks whose trees changed
  let rescanT = null;
  function rescan() {
    rescanT = null;
    const t0 = performance.now();
    const was = owner, wasTrees = trees;
    ({ trees, owner, best } = findTrees(world));
    const dirty = new Set();
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      const i = x + z * SX, a = was[i], b = owner[i];
      if ((a < 0 ? 0 : wasTrees[a].pack) !== (b < 0 ? 0 : trees[b].pack)) dirty.add(`${Math.floor(x / CH)},${Math.floor(z / CH)}`);
    }
    for (const k of dirty) world.dirty.add(k);
    branches?.refresh();
    stats.rescanMs = performance.now() - t0;
  }

  let branches = null;
  const stats = { trees: trees.length, setupMs: 0, rescanMs: 0 };
  stats.setupMs = performance.now() - T0;
  console.info(`[seasons] ${trees.length} trees found in ${stats.setupMs.toFixed(1)} ms`);

  return {
    look, stats, printTop, drawn: D,
    start(ctx) {
      branches = makeBranches(ctx, () => trees, U);
      const wx = makeWeather(ctx, world);
      const prints = startPrints(ctx, printTop, U);
      ctx.events.on('edit', () => { if (rescanT == null) rescanT = setTimeout(rescan, 400); });
      let away = false;
      ctx.frame.push(() => {
        if (!field.ready) field.step(SNOW_FRONT.BUILD_MS);
        const sim = ctx.modules.sim;
        // the battleground is shown instead of the home land: the game's own daylight while it is
        if (!ctx.homeLand.visible) { if (!away) { away = true; setLight(DAY0); } return; }
        away = false;
        if (!sim?.ask) return;
        const se = sim.ask('season'), T = sim.ask('seasonTime'), w = sim.ask('weather');
        if (!se || !Number.isFinite(T)) return;
        const S = transition(T, se.secs);
        bloomFor(se, SHADE.bloom.value);
        const whole = w?.kind && !w.local;
        draw(S.a, S.b, S.p, w?.cover ?? 0);
        setLight(lightFor(S.a, S.b, S.p, whole ? w.kind : null, whole ? w.amount : 0));
        wx.set(w?.kind ? w : null);
        const pu = prints.mat.uniforms, falling = w?.kind === 'snow' && w.amount > 0.3;
        pu.uLife.value = falling ? PRINT_FILL_S : PRINT_KEEP_S; pu.uHold.value = falling ? 0 : 0.7;
        pu.uCover.value = w?.cover ?? 0; // 0: no prints are made (each print's shade follows the snow where it lies)
      });
      ctx.seasons = { stats, drawn: D, weather: wx, prints, branches, rescan, snowField: field };
    },
  };
}

// The season's flowers (the food work, 2026-11-16), for the shader (world/shade.js SHADE.bloom): x the share of
// flower heads and berry bush blossom shown, y the share of autumn seed heads, z 1 while flower stems show. Spring:
// rampant (all of them within its first eighth). Summer: down to BLOOM_SUMMER (sim/tune.js) over its first third.
// Autumn: the last heads go and seed heads come. Winter: the seed heads go, then the stems: nothing. Measured in
// the season's own share t, so it follows the length of a season.
export function bloomFor(se, out) {
  const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const sum = SIM_T.BLOOM_SUMMER ?? 0.35, t = se.t ?? 0;
  if (se.name === 'spring') out.set(0.6 + 0.4 * ramp(t, 0, 0.12), 0, 1);
  else if (se.name === 'summer') out.set(1 - (1 - sum) * ramp(t, 0, 0.33), 0, 1);
  else if (se.name === 'autumn') out.set(sum * (1 - ramp(t, 0, 0.25)), ramp(t, 0.05, 0.35), 1);
  else out.set(0, 1 - ramp(t, 0, 0.2), t < 0.22 ? 1 : 0);
  return out;
}

// season a easing to b by p at the season clock's T: the change runs over TR seconds either side of the turn.
// Time starts at the beginning of spring with no winter before it, so the first TR seconds are plain spring.
export function transition(T, L) {
  const TR = Math.min(10, L / 4);
  const k = Math.floor(T / L), i = k % 4, u = T - k * L;
  let a = ORDER[i], b = a, p = 0;
  if (u > L - TR) { b = ORDER[(i + 1) % 4]; p = (u - (L - TR)) / (2 * TR); }
  else if (u < TR && k > 0) { a = ORDER[(i + 3) % 4]; p = 0.5 + u / (2 * TR); }
  if (p >= 0.999) { a = b; p = 0; }
  return { a, b, p };
}

// ---------------------------------------------------------------------------
// branches on bare trees: one instanced mesh, a bundle of short wooden limbs per tree, shown while it is bare
function branchGeometry() {
  // limbs out from the trunk's top in the four directions and a leader up, a little thinner than a block,
  // like the mock's bare crowns (its leaf blocks drawn as wood)
  const boxes = [
    [0, 0.5, 0, 0.42, 1.6, 0.42],         // the leader
    [0.8, 0.1, 0, 1.3, 0.34, 0.34], [-0.75, -0.5, 0, 1.2, 0.34, 0.34],
    [0, -0.2, 0.8, 0.34, 0.34, 1.3], [0, 0.3, -0.75, 0.34, 0.34, 1.2],
    [1.55, 0.55, 0.3, 0.3, 0.7, 0.3], [-0.3, 0.5, -1.5, 0.3, 0.7, 0.3], [0.9, 0.9, 0.9, 0.28, 0.28, 0.28],
  ];
  const pos = [], col = [], nor = [], idx = [];
  const bark = { top: rgb(0x625a4e), side: rgb(0x4f483f), bottom: rgb(0x453f37) };
  for (const [cx, cy, cz, w, h, d] of boxes) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const faces = [
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], bark.top, 1],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], bark.bottom, 0.6],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], bark.side, 0.85],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], bark.side, 0.75],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], bark.side, 0.72],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], bark.side, 0.88],
    ];
    for (const [a, b, c, d2, n, cl, sh] of faces) {
      const vi = pos.length / 3;
      for (const v of [a, b, c, d2]) { pos.push(...v); nor.push(...n); col.push(cl[0] * sh, cl[1] * sh, cl[2] * sh); }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function makeBranches(ctx, getTrees, U) {
  const mat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true }), {});
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SEA_COMMON + SEA_BRANCH)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 t = seaUnpack( tree );
          int sa = int( uSeaS.z + 0.5 ), sb = int( uSeaS.w + 0.5 );
          float kt = seaTreeK( t );
          float bare = kt >= 0.5 ? seaTree( sb, t, 0, 0.5 ).w : seaTree( sa, t, 0, 0.5 ).w;
          if ( bare < 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
        }`);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + ':sea-branch';
  let mesh = null;
  function refresh() {
    const list = getTrees().filter((t) => t.wood !== B.WOOD_BIRCH);
    if (mesh) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); mesh.dispose?.(); }
    const g = branchGeometry();
    g.setAttribute('tree', new THREE.InstancedBufferAttribute(new Float32Array(list.map((t) => t.pack)), 1));
    mesh = new THREE.InstancedMesh(g, mat, Math.max(1, list.length));
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    list.forEach((t, i) => {
      qn.setFromAxisAngle(up, (Math.floor(hash3(t.x, 5, t.z) * 4)) * Math.PI / 2);
      const k = 0.85 + 0.3 * hash3(t.z, 6, t.x);
      s.set(k, k, k);
      p.set(t.x + 0.5, t.top - 0.3, t.z + 0.5);
      mesh.setMatrixAt(i, m.compose(p, qn, s));
    });
    mesh.count = list.length;
    mesh.frustumCulled = false; mesh.userData.noPick = true; mesh.name = 'season-branches';
    mesh.castShadow = false; mesh.receiveShadow = true;
    (ctx.homeLand ?? ctx.layers.entities).add(mesh);
  }
  refresh();
  return { refresh, get mesh() { return mesh; } };
}

// ---------------------------------------------------------------------------
// weather: falling rain or snow (the mock's, driven by the sim's weather)
const N_STREAK = 6000, N_SPLASH = 2000; // rain: streaks and splashes; snow uses every quad as a flake
const SPAN = 18; // metres the rain and snow fall

const VERT = /* glsl */ `
attribute vec4 seed;
uniform float uT, uMpp, uLocal, uSnow, uSpan, uDen, uA;  // uA: how much of it there is now (a shower building or easing off)
uniform vec4 uBox;        // the box round the view, x0 z0 w d (it tiles, so nothing swims as the view moves)
uniform vec3 uP;          // local: the patch x, z, radius (the streaks of the box that fall inside it show)
uniform vec4 uB;          // the world's bounds x0 z0 x1 z1 (weather fades out into the mist beyond)
uniform vec2 uLean;       // the wind's slant: world x, z a streak's top sits upwind per block of fall (view/rain-look.js)
uniform sampler2D uH;     // r: surface height, g: water
uniform vec4 uHBox;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
float groundAt( vec2 p ) {
  vec2 h = texture2D( uH, ( floor( p ) + 0.5 - uHBox.xy ) / uHBox.zw ).rg;
  return h.r * 255.0 + 1.0 - ( h.g > 0.5 ? 0.15 : 0.0 );
}
${GLSL_TILE}
void main() {
  vKind = position.z;
  vUv = position.xy;
  // every streak has its place in the tiled box round the view, so a shower of any size is as thick on screen
  vec2 xz = rainTile( seed.xy, uBox );
  float d = min( min( xz.x - uB.x, uB.z - xz.x ), min( xz.y - uB.y, uB.w - xz.y ) );
  float edge = smoothstep( -8.0, 16.0, d );
  if ( uLocal > 0.5 ) {
    // a shower: only inside its patch, thinning toward a soft, slightly ragged rim
    vec2 o = xz - uP.xy;
    float an = atan( o.y, o.x ), rim = uP.z * ( 1.0 + 0.05 * sin( an * 3.0 + uP.z ) + 0.035 * sin( an * 7.0 - uP.z * 0.7 ) );
    edge *= 1.0 - smoothstep( rim * 0.62, rim, length( o ) );
  }
  if ( step( seed.z, uDen ) < 0.5 || edge < 0.01 ) { vAlpha = 0.0; gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  float g = groundAt( xz );
  vec3 p;
  if ( uSnow > 0.5 ) {
    float speed = 1.4 + seed.w * 1.2;
    float h = mod( seed.w * uSpan * 13.0 + seed.z * 37.0 - uT * speed, uSpan );
    float ph = seed.z * 40.0 + seed.x * 17.0;
    vec2 sw = vec2( sin( uT * 0.9 + ph ) * 0.6 + ( h - uSpan ) * 0.1, cos( uT * 0.7 + ph * 1.3 ) * 0.45 ) - uLean * h * 0.5;
    p = vec3( xz.x + sw.x, g + h, xz.y + sw.y );
    vec3 rgt = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
    vec3 up = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
    float s = uMpp * ( 1.2 + seed.x * 1.4 + vKind * 0.6 );
    p += rgt * position.x * s + up * ( position.y * 2.0 - 1.0 ) * s;
    vAlpha = edge * smoothstep( 0.0, 0.6, h ) * smoothstep( uSpan, uSpan - 4.0, h ) * ( 0.75 + 0.25 * seed.y );
  } else if ( vKind < 0.5 ) {
    float speed = 19.0 + seed.w * 7.0;
    float h = mod( seed.w * uSpan * 13.0 - uT * speed, uSpan );
    vec3 fall = vec3( -uLean.x, 1.0, -uLean.y );
    p = vec3( xz.x, g, xz.y ) + fall * h;
    vec3 toCam = isOrthographic ? vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] ) : cameraPosition - p;
    vec3 side = normalize( cross( fall, toCam ) );
    float w = max( 0.025, uMpp * 0.75 ), len = 0.45 + seed.z * 0.3 + uMpp * ( 9.0 + seed.x * 6.0 );
    p += side * position.x * w + fall * position.y * len;
    vAlpha = edge * smoothstep( uSpan, uSpan - 5.0, h ) * ( 0.55 + 0.45 * seed.y );
  } else {
    float ph = fract( uT * ( 1.1 + seed.w * 0.9 ) + seed.z * 7.3 );
    float s = max( 0.1 + ph * 0.32, uMpp * ( 2.0 + ph * 5.0 ) );
    p = vec3( xz.x + position.x * s, g + 0.03, xz.y + ( position.y * 2.0 - 1.0 ) * s );
    vAlpha = edge * ( 1.0 - ph );
  }
  vAlpha *= uA;
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}`;
const FRAG = /* glsl */ `
uniform float uSnow;
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
void main() {
  float a; vec3 c;
  if ( uSnow > 0.5 ) {
    float d = length( vec2( vUv.x, vUv.y * 2.0 - 1.0 ) );
    a = vAlpha * ( 1.0 - smoothstep( 0.55, 1.0, d ) );
    c = mix( vec3( 0.66, 0.72, 0.80 ), vec3( 1.0 ), 1.0 - smoothstep( 0.35, 0.8, d ) );
  } else if ( vKind < 0.5 ) {
    a = vAlpha * 0.42 * ( 1.0 - abs( vUv.x ) * 0.6 ) * ( 0.35 + 0.65 * vUv.y );
    c = vec3( 0.80, 0.87, 0.94 );
  } else {
    float d = length( vec2( vUv.x, vUv.y * 2.0 - 1.0 ) );
    a = vAlpha * 0.7 * smoothstep( 0.55, 0.8, d ) * ( 1.0 - smoothstep( 0.82, 1.0, d ) );
    c = vec3( 0.86, 0.91, 0.96 );
  }
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( c, a );
}`;

function makeWeatherGeometry() {
  const n = N_STREAK + N_SPLASH;
  const pos = new Float32Array(n * 12), seed = new Float32Array(n * 16), index = new Uint16Array(n * 6);
  const CN = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  let r = 0x2545f491; // a fixed sequence: the same weather every load (no randomness taken from the game's own)
  const rand = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return ((r >>> 0) % 100000) / 100000; };
  for (let i = 0; i < n; i++) {
    const kind = i < N_STREAK ? 0 : 1;
    const k = kind ? (i - N_STREAK + rand()) / N_SPLASH : (i + rand()) / N_STREAK;
    const s = [rand(), rand(), k, rand()];
    for (let v = 0; v < 4; v++) {
      const o = i * 4 + v;
      pos[o * 3] = CN[v][0]; pos[o * 3 + 1] = CN[v][1]; pos[o * 3 + 2] = kind;
      seed.set(s, o * 4);
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

// The weather layer: set(null) or set({ kind: 'rain' | 'snow', local, x, z, r, amount 0..1 }) every frame
function makeWeather(ctx, world) {
  const cam = ctx.camera;
  const data = new Uint8Array(SX * SZ * 2);
  const hTex = new THREE.DataTexture(data, SX, SZ, THREE.RGFormat, THREE.UnsignedByteType);
  hTex.magFilter = hTex.minFilter = THREE.NearestFilter;
  hTex.unpackAlignment = 1; hTex.generateMipmaps = false;
  // the ground's height per column, for where streaks land and for puddles: from the sim's land map when it is
  // there (fast), else from the world. Refreshed when a new spell of weather begins.
  function heights() {
    const land = ctx.modules.sim?.dev?.S?.land;
    if (land?.top?.length === SX * SZ) {
      for (let i = 0; i < SX * SZ; i++) { const w = land.wet[i]; data[i * 2] = Math.max(0, Math.min(254, land.top[i] + w)); data[i * 2 + 1] = w ? 255 : 0; }
    } else {
      const d = world.data, S = SX * SZ, top = Math.min(SY - 1, world.maxY);
      for (let c = 0; c < S; c++) {
        let y = top;
        for (; y > 0; y--) { const id = d[c + y * S]; if (id === B.AIR || LEAFY.has(id) || TRUNK.has(id) || isCross(id) || id === B.ROOTS) continue; break; }
        data[c * 2] = Math.min(254, y); data[c * 2 + 1] = d[c + y * S] === B.WATER ? 255 : 0;
      }
    }
    hTex.needsUpdate = true;
  }
  heights();
  const hBox = new THREE.Vector4(0, 0, SX, SZ);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: {
      uT: { value: 0 }, uMpp: { value: 0.1 }, uLocal: { value: 0 }, uSnow: { value: 0 }, uA: { value: 1 },
      uSpan: { value: SPAN }, uDen: { value: 1 }, uBox: { value: new THREE.Vector4(0, 0, 200, 200) },
      uP: { value: new THREE.Vector3(0, 0, 1) }, uB: { value: new THREE.Vector4(0, 0, SX, SZ) },
      uH: { value: hTex }, uHBox: { value: hBox }, uLean: { value: new THREE.Vector2(0.14, 0.05) },
    },
  });
  const mesh = new THREE.Mesh(makeWeatherGeometry(), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  mesh.userData.noPick = true;
  mesh.name = 'season-weather';
  (ctx.homeLand ?? ctx.layers.entities).add(mesh);
  // compiled now, while the page is loading, so the first shower does not stall a frame
  try { ctx.renderer.gl.compile(mesh, ctx.renderer.camera, ctx.scene); } catch (err) { console.warn('[seasons] weather compile', err); }
  mesh.visible = false;
  // the land under the weather, through the world shader's last `wet` slot (the god's rain uses the others first):
  // local weather gets the cloud's shadow (and rain wets the ground and fills the hollows); whole-map rain wets
  // everything, its dull light comes from the daylight key instead
  const slot = WET_SLOTS - 1;
  let local = false, wetOn = false, spell = '';
  const off = () => { SHADE.wet.value[slot].set(0, 0, 0, 0); SHADE.wetAmt.value[slot].set(0, 0, 0, 0); };
  function set(w) {
    const u = mat.uniforms, amt = w ? clamp01(w.amount ?? 1) : 0;
    mesh.visible = amt > 0.005;
    if (!mesh.visible) { if (wetOn) off(); wetOn = false; spell = ''; return; }
    const snow = w.kind === 'snow';
    local = !!w.local;
    const id = `${w.kind}:${local}`;
    if (id !== spell) { spell = id; heights(); }
    wetOn = local || !snow;
    u.uSnow.value = snow ? 1 : 0; u.uLocal.value = local ? 1 : 0; u.uA.value = amt;
    u.uP.value.set(w.x, w.z, w.r);
    // the streaks fill the box round the view (local weather keeps those inside its patch): as thick on screen at
    // any size of shower; snow a little thinner
    u.uDen.value = snow ? 0.7 : 1;
    leanFor(w.dir, w.speed, leanWant);
    if (wetOn) {
      // the god's rain owns this texture while one of its rains is live; ours is used only when none is
      if (!SHADE.wetTex.value || SHADE.wetN.value <= slot) { SHADE.wetTex.value = hTex; SHADE.wetBox.value.copy(hBox); }
      SHADE.wet.value[slot].set(local ? w.x : SX / 2, local ? w.z : SZ / 2, local ? w.r : 1e5, 13.7);
      SHADE.wetAmt.value[slot].set((local ? (snow ? 0.8 : 1) : 0) * amt, (snow ? 0 : local ? 1 : 0.8) * amt, 0, 0);
      SHADE.wetN.value = WET_SLOTS;
    } else off();
  }
  const t0 = performance.now();
  let tLast = t0;
  const leanWant = { x: 0.14, y: 0.05 };
  mesh.onBeforeRender = () => {
    const u = mat.uniforms, now = performance.now();
    u.uT.value = ((now - t0) / 1000) % 3600;
    u.uMpp.value = 1 / Math.max(0.5, cam.ppm || 10);
    easeLean(u.uLean.value, leanWant, (now - tLast) / 1000);
    tLast = now;
    if (wetOn) SHADE.wetN.value = WET_SLOTS;
    viewBox(cam, SPAN, u.uBox.value);
  };
  return { set, mesh, quads: N_STREAK + N_SPLASH };
}

// ---------------------------------------------------------------------------
// footprints in lying snow (the director, 2026-11-16: "snow should settle as well as leave footprints if they walk
// in it"). Positions are only read; every stride a dent goes into a fixed ring of PRINTS instanced quads.
const PRINTS = 32768; // the ring: about three minutes of a 70-strong village walking at speed 1, then the oldest go
const PRINT_FILL_S = 60;   // while snow falls, a print fills in over this long (real seconds)
const PRINT_KEEP_S = 600;  // once snow has stopped, a print lasts this long (the last 30 percent fading)
// per walker kind: half width and half length in metres, the smallest half width in screen pixels (so a trail
// reads at the god's height: at the default zoom of 6 pixels a metre a person's trail is a line about 6 pixels
// wide), the stride, and how far left or right of the line a foot lands
const KINDS = [
  { w: 0.16, l: 0.24, px: 3.0, stride: 0.62, side: 0.15 },    // 0 a person: paired steps
  { w: 0.1, l: 0.13, px: 2.2, stride: 0.42, side: 0.1 },      // 1 deer, wolf: smaller, closer
  { w: 0.07, l: 0.08, px: 1.6, stride: 0.7, side: 0.08 },     // 2 a rabbit: tiny pairs, one pair a hop
];
const PRINT_VERT = /* glsl */ `
attribute vec4 iP;        // x, y (top of the snow), z, when it was made (0 = empty)
attribute vec2 iK;        // heading (radians, 0 = toward +z), kind (+ 4 under a crown)
uniform float uNow, uLife, uHold, uMpp;
uniform vec4 uSz[ 3 ];
varying vec2 vUv;
varying float vA;
${SNOW_FN}
void main() {
  float age = uNow - iP.w;
  if ( iP.w <= 0.0 || age < 0.0 || age > uLife ) { vA = 0.0; gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  float under = iK.y > 3.5 ? 1.0 : 0.0;
  // as deep as the snow drawn where it lies: a print fades with the thaw's front as it passes, never left on bare ground
  float sn = seaSnow( iP.xz, under > 0.5 ? ${(1 + SNOW_FRONT.UNDER_CROWN).toFixed(3)} : 1.0 );
  if ( sn <= 0.01 ) { vA = 0.0; gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  vec4 k = uSz[ int( iK.y - under * 4.0 + 0.5 ) ];
  vec2 s = max( k.xy, vec2( uMpp * k.z, uMpp * k.z * 1.3 ) );
  vec2 c = position.xy * s;
  float ca = cos( iK.x ), sa = sin( iK.x );
  vec3 p = vec3( iP.x + c.x * ca + c.y * sa, iP.y + 0.02, iP.z - c.x * sa + c.y * ca );
  vUv = position.xy;
  vA = ( 1.0 - smoothstep( uLife * uHold, uLife, age ) ) * sn;
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}`;
const PRINT_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vA;
void main() {
  float d = length( vUv );
  float a = vA * 0.9 * ( 1.0 - smoothstep( 0.6, 1.0, d ) );
  if ( a < 0.01 ) discard;
  // a dent in snow shows as its own shadow: a cool blue grey, never earth brown. Drawn with a "darkest wins" blend
  // (MinEquation), so where many feet have trodden the snow is trampled to one dent's shade, never a growing stain
  gl_FragColor = vec4( mix( vec3( 1.0 ), vec3( 0.30, 0.37, 0.52 ), a ), 1.0 );
}`;

function startPrints(ctx, printTop, SU) {
  const cam = ctx.camera;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  const P = new Float32Array(PRINTS * 4), K = new Float32Array(PRINTS * 2);
  const aP = new THREE.InstancedBufferAttribute(P, 4).setUsage(THREE.DynamicDrawUsage);
  const aK = new THREE.InstancedBufferAttribute(K, 2).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iP', aP); g.setAttribute('iK', aK);
  g.instanceCount = PRINTS;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    vertexShader: PRINT_VERT, fragmentShader: PRINT_FRAG, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.MinEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    uniforms: {
      uNow: { value: 1 }, uLife: { value: PRINT_KEEP_S }, uHold: { value: 0.7 }, uMpp: { value: 0.1 }, uCover: { value: 0 },
      uSz: { value: KINDS.map((k) => new THREE.Vector4(k.w, k.l, k.px, 0)) },
      uSnowTex: SU.uSnowTex, uSnowF: SU.uSnowF, uSnowUV: SU.uSnowUV, // the land's own: the same snow
    },
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.userData.noPick = true; mesh.name = 'season-footprints';
  (ctx.homeLand ?? ctx.layers.entities).add(mesh);

  let now = 1, head = 0, first = -1, count = 0, frame = 0, total = 0, cpu = 0;
  const track = new Map(); // walker -> { x, z, hx, hz, acc, side, seen }
  const MAX_PER_FRAME = 256;
  function stamp(x, z, a, kind) {
    if (count >= MAX_PER_FRAME) return;
    const y = printTop(x, z);
    if (y < 0) return;
    if (first < 0) first = head;
    P[head * 4] = x; P[head * 4 + 1] = y + 1; P[head * 4 + 2] = z; P[head * 4 + 3] = now;
    K[head * 2] = a; K[head * 2 + 1] = kind + (printTop.keep > 1 ? 4 : 0);
    head = (head + 1) % PRINTS; count++; total++;
  }
  function walk(list) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.dead || e.hidden || e.species === 'bird' || !Number.isFinite(e.x)) continue;
      let s = track.get(e);
      if (!s) { track.set(e, { x: e.x, z: e.z, hx: 0, hz: 1, acc: 0, side: 1, seen: now }); continue; }
      s.seen = now;
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz);
      s.x = e.x; s.z = e.z;
      if (d > 4) { s.acc = 0; continue; } // a jump (a skip, leaving a home): no trail across it
      if (d < 1e-5) continue;
      s.hx += (dx / d - s.hx) * 0.35; s.hz += (dz / d - s.hz) * 0.35;
      const kind = e.kind === 'person' ? 0 : e.species === 'rabbit' ? 2 : 1;
      const K0 = KINDS[kind], stride = kind === 0 && e.stage && e.stage !== 'adult' ? K0.stride * 0.75 : K0.stride;
      s.acc += d;
      if (s.acc < stride) continue;
      s.acc = Math.min(s.acc - stride, stride);
      const a = Math.atan2(s.hx, s.hz), rx = Math.cos(a), rz = -Math.sin(a);
      if (kind === 2) { stamp(e.x + rx * K0.side, e.z + rz * K0.side, a, 2); stamp(e.x - rx * K0.side, e.z - rz * K0.side, a, 2); }
      else { s.side = -s.side; stamp(e.x + rx * K0.side * s.side, e.z + rz * K0.side * s.side, a, kind); }
    }
  }
  ctx.frame.push((dt) => {
    now += dt;
    mat.uniforms.uNow.value = now;
    mat.uniforms.uMpp.value = 1 / Math.max(0.5, cam.ppm || 10);
    const sim = ctx.modules.sim;
    if (!sim || mat.uniforms.uCover.value <= 0) return;
    first = -1; count = 0;
    const c0 = performance.now();
    walk(sim.people); walk(sim.animals);
    cpu = cpu * 0.95 + (performance.now() - c0) * 0.05;
    if (count) {
      const n1 = Math.min(count, PRINTS - first);
      aP.addUpdateRange(first * 4, n1 * 4); aK.addUpdateRange(first * 2, n1 * 2);
      if (count > n1) { aP.addUpdateRange(0, (count - n1) * 4); aK.addUpdateRange(0, (count - n1) * 2); }
      aP.needsUpdate = true; aK.needsUpdate = true;
    }
    if (++frame % 300 === 0) for (const [e, s] of track) if (s.seen < now - 5 || e.dead) track.delete(e);
  });
  return { mesh, mat, get total() { return total; }, get walkers() { return track.size; }, get cpuMs() { return cpu; }, ring: PRINTS };
}
