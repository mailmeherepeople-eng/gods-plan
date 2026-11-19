// Day, dusk, moonlit night and dawn, in the renderer (2026-11-13; the director: "i want night to have a
// moonlit look. instead of just dark", and still no haze: crisp and readable).
//
// How it works. One time-of-day value t (the sim's day fraction, 0 dawn .. 1) picks a look from the
// keyframes below: the sun's colour, strength and height, the sky and ground fill, how far the moon has
// taken over, the mist colour beyond the world and the amount of "night" (a grade plus firelight).
// The renderer writes those into its three lights and into shared uniforms in world/shade.js, once per
// frame, so every enhance()d material (terrain chunks, MERGED_MAT props and figures, fire, banners)
// follows with no recompile and no remesh:
//   sun   light 0, masked by the mesher's baked sun shadow; toward dusk (and at dawn) it moves low into the
//         west-south-west, where the moon's baked shadows fit it (long cool shadows), warms, then goes out
//   moon  light 1 (the day's faint cool fill, which turns into the moon): cool and silvery, from the
//         west-south-west (MOON_DIR in shade.js), masked at night by a second baked shadow term the
//         mesher marches toward the moon, so trees and huts throw long cool moon shadows
//   fill  the hemisphere light: by night a deep blue sky over a darker ground
//   night (shade.js) a partial desaturation toward a cool tint, firelight from the glow map below, and a
//         silver glint on water; all scaled by uNight, so by day nothing changes
// Firelight is a small world-space texture (one texel per ~1.2 m) the CPU stamps with a warm pool for
// each fire, camp fire, torch, burning cell and lived-in home, at most NIGHT.glow.budget of them (the nearest to
// the view's centre), every other frame and only while it is not full day. One texture fetch per
// fragment, however many fires.
import * as THREE from '../../vendor/three.module.js';
import { SHADE, MOON_DIR } from '../world/shade.js';

// ---------------------------------------------------------------------------
// Tunables: the whole night look in one block.
export const NIGHT = {
  moonColor: 0x9fb6ff,      // the moonlight: cool silver-blue
  moonIntensity: 1.3,       // its strength at full moon (the sun is 1.55 by day)
  moonShadow: 0.8,          // how much of the moon the baked moon shadow takes away (0 = no shadows)
  skyColor: 0x24439a,       // the hemisphere fill at night: deep blue from above
  groundColor: 0x141a2c,    //   and a darker blue-grey from below
  skyIntensity: 0.36,
  desat: 0.28,              // share of colour saturation the night takes away (0 = none, 1 = grey)
  tint: [0.72, 0.95, 1.38], // the cool cast given to what the desaturation takes (luminance stays)
  mist: 0x0f1729,           // the edge mist and page background at full night
  exposure: 1.0,            // tone-mapping exposure at full night (day 0.98)
  farLift: 0.6,             // zoomed right out (whole world) the night is drawn this much brighter (exposure x 1.6)
  warm: { keep: 0.8, lift: 0.07 }, // thatch and other strongly warm colours at night: share of colour kept, own warmth
  phases: { days: 8, dark: 0.7 }, // moon phases: a full cycle every `days` days; a new moon is `dark` x as bright
  glow: {
    color: 0xff9a4a,        // firelight
    gain: 1.35,             // how strongly it lights what it falls on
    budget: 160,            // most light sources stamped per update (nearest the view's centre first)
    res: 256,               // glow map texels across the world
    radius: { fire: 8, camp: 6, hut: 5.5, flame: 5, torch: 4 }, // where a pool fades out, in blocks (soft, most of it inside half)
    strength: { flame: 0.45 }, // brightness of one source (1 if not named); a burning wood has many flames side by side
  },
  glint: { color: 0xd4e0ff, amount: 1.0 }, // the moon on water
  figure: { keep: 0.6, lift: 0.45, color: 0xc4d2ff }, // people and animals: share of colour kept, extra moonlight
  ease: 0.35,               // seconds: the look follows the clock this smoothly (pops become fades)
};

// The look over the day. u runs 0 (full day) .. 1 (full night); dusk and dawn have their own keys.
//   sun    [colour, intensity, west 0..1]: west 1 puts the sun low in the west-south-west (MOON_DIR) with the
//          moon's baked shadows, so a low sun throws long shadows; the shadows cross-fade while it moves
//   hemi   [sky, ground, intensity]: the light in the shade
//   moon   0..1 of the moon's share of light 1
//   mist   hex beyond the world (null = the day colour); kept clean (never grey) and no brighter than the land
//   grade  0..1 of NIGHT.desat (the cool desaturation): 0 at sunset, so the land keeps its own colours
//   night  0..1: firelight, the water glint, the figure lift, the exposure and the far-zoom lift
//   sat    (optional) extra saturation, where night > 0
//   tint   (optional) the cast the grade gives, instead of NIGHT.tint (the blue hour's is a clearer blue)
// Dusk and dawn keep the land's own colours: a warm, strong, low sun on the lit faces and a clear blue sky in
// the shade, rather than one colour over everything. The blue hour is a clear, slightly luminous blue (a bright
// blue sky light, little desaturation), visibly lighter than the night.
const BLUE_HOUR = [0.55, 0.9, 1.7];
const DAY = { sun: [0xffe4b8, 1.55, 0], hemi: [0xc4d9ea, 0x7d6a48, 0.62], moon: 0, mist: null, grade: 0, night: 0 };
const NIGHT_KEY = () => ({ sun: [0xff8a5a, 0, 1], hemi: [NIGHT.skyColor, NIGHT.groundColor, NIGHT.skyIntensity], moon: 1, mist: NIGHT.mist, grade: 1, night: 1 });
// (exported as KEYS so they can be tried live from the console)
const DUSK = [
  [0.00, DAY],
  [0.12, { sun: [0xffe0b0, 1.6, 0], hemi: [0xbcd2ec, 0x7d6a48, 0.6], moon: 0, mist: 0xc6d4e2, grade: 0, night: 0 }],
  [0.30, { sun: [0xffdcb0, 1.75, 1], hemi: [0xa6c0ea, 0x766648, 0.56], moon: 0, mist: 0xa8bedc, grade: 0, night: 0 }],
  [0.44, { sun: [0xffc896, 1.55, 1], hemi: [0x7c9ee8, 0x4e4c58, 0.6], moon: 0.04, mist: 0x6380bc, grade: 0, night: 0.12, sat: 0.06 }],
  [0.56, { sun: [0xff9466, 0.25, 1], hemi: [0x5c8af2, 0x2e4070, 0.92], moon: 0.18, mist: 0x2f4f96, grade: 1.35, night: 0.5, tint: BLUE_HOUR }],
  [0.84, { sun: [0xff8a5a, 0, 1], hemi: [0x4a76e6, 0x26386c, 0.82], moon: 0.45, mist: 0x1e3470, grade: 1.45, night: 0.78, tint: BLUE_HOUR }],
  [1.00, null], // NIGHT_KEY
];
const DAWN = [
  [0.00, DAY],
  [0.14, { sun: [0xffe2c0, 1.6, 0], hemi: [0xbcd0ea, 0x7a6850, 0.6], moon: 0, mist: 0xc2d2e2, grade: 0, night: 0 }],
  [0.28, { sun: [0xffd4a8, 1.65, 1], hemi: [0xa4bee8, 0x6e6250, 0.56], moon: 0, mist: 0xa2b8dc, grade: 0, night: 0 }],
  [0.44, { sun: [0xffbe9c, 1.45, 1], hemi: [0x7a98e6, 0x4c4a60, 0.6], moon: 0.06, mist: 0x6280bc, grade: 0, night: 0.15, sat: 0.06 }],
  [0.56, { sun: [0xff9a7a, 0.25, 1], hemi: [0x5a86f0, 0x2e3e70, 0.92], moon: 0.2, mist: 0x2e4e94, grade: 1.35, night: 0.5, tint: BLUE_HOUR }],
  [0.84, { sun: [0xff8a5a, 0, 1], hemi: [0x4a74e4, 0x26366a, 0.82], moon: 0.45, mist: 0x1e336e, grade: 1.45, night: 0.78, tint: BLUE_HOUR }],
  [1.00, null],
];
export const KEYS = { dusk: DUSK, dawn: DAWN, day: DAY };
// where in the day these run (the sim's daylight falls over 0.6..0.7 and rises over 0..0.07, sim/tune.js):
// dusk starts warming before the light goes, the blue hour runs about t 0.68 to 0.76 and the moon is full at
// 0.8; dawn mirrors it (the blue before sunrise about t 0.97 to 0.0)
const DUSK_T = [0.52, 0.8], DAWN_T = [-0.06, 0.1];

const sstep = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };

// u (0 day .. 1 night) and which keys, for a day fraction t
export function phaseAt(t) {
  t = ((t % 1) + 1) % 1;
  if (t >= DUSK_T[0] && t <= DUSK_T[1]) return { u: (t - DUSK_T[0]) / (DUSK_T[1] - DUSK_T[0]), keys: DUSK };
  const td = t > 0.5 ? t - 1 : t;
  if (td >= DAWN_T[0] && td <= DAWN_T[1]) return { u: 1 - (td - DAWN_T[0]) / (DAWN_T[1] - DAWN_T[0]), keys: DAWN };
  return { u: t > DAWN_T[1] && t < DUSK_T[0] ? 0 : 1, keys: DUSK };
}

const _a = new THREE.Color(), _b = new THREE.Color();
function lerpHex(out, h0, h1, k) { _a.setHex(h0, THREE.SRGBColorSpace); _b.setHex(h1, THREE.SRGBColorSpace); return out.lerpColors(_a, _b, k); }
function hexLerp(h0, h1, k) {
  const c = (s) => Math.round(((h0 >> s) & 255) + (((h1 >> s) & 255) - ((h0 >> s) & 255)) * k);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

// the look for a day fraction: fills `L` (reused) and returns it
export function lookAt(t, dayMist, moonK, L) {
  const { u, keys } = phaseAt(t);
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [u0, k0r] = keys[i], [u1, k1r] = keys[i + 1];
  const k0 = k0r ?? NIGHT_KEY(), k1 = k1r ?? NIGHT_KEY();
  const f = sstep(0, 1, (u - u0) / (u1 - u0 || 1));
  lerpHex(L.sunColor, k0.sun[0], k1.sun[0], f);
  L.sunI = k0.sun[1] + (k1.sun[1] - k0.sun[1]) * f;
  L.west = k0.sun[2] + (k1.sun[2] - k0.sun[2]) * f;
  lerpHex(L.sky, k0.hemi[0], k1.hemi[0], f);
  lerpHex(L.ground, k0.hemi[1], k1.hemi[1], f);
  L.hemiI = k0.hemi[2] + (k1.hemi[2] - k0.hemi[2]) * f;
  L.moon = k0.moon + (k1.moon - k0.moon) * f;
  L.mist = hexLerp(k0.mist ?? dayMist, k1.mist ?? dayMist, f);
  L.night = k0.night + (k1.night - k0.night) * f;
  L.grade = k0.grade + (k1.grade - k0.grade) * f;
  const t0 = k0.tint ?? NIGHT.tint, t1 = k1.tint ?? NIGHT.tint;
  for (let j = 0; j < 3; j++) L.tint[j] = t0[j] + (t1[j] - t0[j]) * f;
  L.sat = (k0.sat ?? 0) + ((k1.sat ?? 0) - (k0.sat ?? 0)) * f;
  // a dark (new moon) night: less moon, a little less sky; never so dark that people are lost
  L.moonI = NIGHT.moonIntensity * moonK;
  L.hemiI *= 1 - (1 - moonK) * 0.35 * L.moon;
  L.exposure = 0.98 + (NIGHT.exposure - 0.98) * L.night;
  return L;
}

export const makeLook = () => ({ sunColor: new THREE.Color(), sunI: 0, west: 0, grade: 0, tint: [1, 1, 1], sky: new THREE.Color(), ground: new THREE.Color(),
  hemiI: 0, moon: 0, moonI: 0, mist: 0, night: 0, sat: 0, exposure: 0.98 });

// ---------------------------------------------------------------------------
// The glow map: warm pools of firelight on whatever is near a fire (ground, walls, people), any number of
// fires for one texture fetch. R: brightness, G: the height of the brightest source (/ 48), so a cliff top
// above a camp fire stays dark.
const EDGE = Math.exp(-4);
export class GlowMap {
  constructor(res = NIGHT.glow.res) {
    this.res = res;
    this.acc = new Float32Array(res * res);
    this.top = new Float32Array(res * res);
    this.hy = new Float32Array(res * res);
    this.bytes = new Uint8Array(res * res * 2);
    this.tex = new THREE.DataTexture(this.bytes, res, res, THREE.RGFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.box = { x: 0, z: 0, w: 300, d: 300 };
    this.lit = false; // anything stamped in the last upload
    this.list = []; // [x, y, z, r, k] flat, refilled each update
    this.n = 0;
  }
  setBox(x0, z0, x1, z1) {
    this.box = { x: x0, z: z0, w: Math.max(1, x1 - x0), d: Math.max(1, z1 - z0) };
    SHADE.glowBox.value.set(x0, z0, this.box.w, this.box.d);
  }
  begin() { this.n = 0; }
  push(x, y, z, r, k = 1) {
    const L = this.list, i = this.n * 5;
    L[i] = x; L[i + 1] = y; L[i + 2] = z; L[i + 3] = r; L[i + 4] = k;
    this.n++;
  }
  // stamp the `budget` sources nearest (cx, cz), flickering, and upload
  end(cx, cz, time) {
    const { res, acc, top, hy, bytes, list } = this;
    const budget = NIGHT.glow.budget;
    let order = null;
    if (this.n > budget) {
      order = Array.from({ length: this.n }, (_, i) => i);
      const d2 = (i) => (list[i * 5] - cx) ** 2 + (list[i * 5 + 2] - cz) ** 2;
      order.sort((a, b) => d2(a) - d2(b));
      order.length = budget;
    }
    const n = order ? budget : this.n;
    if (!n && !this.lit) return; // dark and still dark: nothing to upload
    acc.fill(0); top.fill(0);
    const sx = res / this.box.w, sz = res / this.box.d;
    for (let j = 0; j < n; j++) {
      const i = (order ? order[j] : j) * 5;
      const x = list[i], y = list[i + 1], z = list[i + 2], r = list[i + 3];
      const seed = x * 1.37 + z * 2.11;
      const k = list[i + 4] * (0.86 + 0.09 * Math.sin(time * 9.1 + seed) + 0.05 * Math.sin(time * 23.7 + seed * 1.9)); // flicker
      const gx = (x - this.box.x) * sx, gz = (z - this.box.z) * sz;
      const rx = r * sx, rz = r * sz;
      const x0 = Math.max(0, Math.floor(gx - rx)), x1 = Math.min(res - 1, Math.ceil(gx + rx));
      const z0 = Math.max(0, Math.floor(gz - rz)), z1 = Math.min(res - 1, Math.ceil(gz + rz));
      for (let tz = z0; tz <= z1; tz++) {
        const dz = (tz + 0.5 - gz) / rz;
        for (let tx = x0; tx <= x1; tx++) {
          const dx = (tx + 0.5 - gx) / rx;
          const q2 = dx * dx + dz * dz;
          if (q2 >= 1) continue;
          const v = k * (Math.exp(-4 * q2) - EDGE) / (1 - EDGE); // a soft round pool, no edge: light, not a disc
          const p = tz * res + tx;
          acc[p] += v;
          if (v > top[p]) { top[p] = v; hy[p] = y; }
        }
      }
    }
    for (let p = 0, b = 0; p < acc.length; p++, b += 2) {
      const v = acc[p];
      // soft knee: overlapping pools add up but ease toward full, never clip into a flat plateau
      bytes[b] = v > 0 ? Math.min(255, Math.round(255 * 1.35 * v / (1 + 0.35 * v))) : 0;
      bytes[b + 1] = v > 0 ? Math.max(0, Math.min(255, Math.round(hy[p] / 48 * 255))) : 0;
    }
    this.lit = n > 0;
    this.tex.needsUpdate = true;
  }
}
export { MOON_DIR };
