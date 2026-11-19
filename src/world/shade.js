// Shared shader augmentation for every Lambert material in the game.
// Ported from the source repo's world/shade.js. Added for this game: `edge`,
// the mist that dissolves the land at the world's edge (see below).
//
// Nothing here adds a render pass. Each feature is a few lines spliced into
// the stock MeshLambertMaterial program through onBeforeCompile, so the cost
// is a handful of ALU per vertex or fragment on the same draw calls the game
// already makes. The features, and what switches each one on:
//
//   sun     per-vertex `sun` attribute (0 = in shadow, 1 = lit), baked by the
//           mesher by marching toward the sun through the voxel grid. It masks
//           the DIRECTIONAL light only, so a shadowed face keeps every bit of
//           its sky and ground bounce and never goes black. Chunk meshes only.
//   sway    per-vertex `sway` attribute (0..1): wind displacement in the
//           vertex stage. Tuft tips bend, canopies breathe, trunks stand still.
//   water   animated normal wobble + a single sun specular on the river.
//   mist    height fog, always compiled in, driven by a uniform; density 0 is
//           a no-op, so scenes that want no mist pay one multiply. Only runs
//           when the scene has a THREE.Fog (the god view has none).
//   edge    the world's edge dissolving into mist: within uEdgeW blocks of the
//           bounds the final colour is mixed toward uEdgeColor (which equals
//           the page background), with a slow wobble so the line is never
//           straight. Applied after tone mapping, so the colour is given in
//           output space (renderer.setEdgeMist handles that). uEdgeW 0 is off.
//   night   (engine/lighting.js) a second baked mask, `moon`, on light 1 (the moon at night), a cool
//           partial desaturation, firelight from a world-space glow map, silver glints on water, and
//           a lift for people and animals (FIGURE_MAT). All gated on uniforms that are 0 by day.
//   clouds  a scrolling noise texture darkening the direct light (moving cloud
//           shadows). Define-gated because it is a texture fetch per fragment:
//           only the Rich tier pays for it.
//   vivid   Settings style switch (setVivid): replaces the lit result with the
//           raw palette times a fixed per-face shade (top 1.0, bottom 0.55,
//           x sides 0.76, z sides 0.86), the flat storybook look. Driven by a
//           shared uniform so the toggle itself is free; the toggle also flips
//           material.toneMapped, because ACES compresses exactly the
//           saturation this style exists to show, and THAT flip is the reason
//           setVivid recompiles like setClouds does. Mist and scene fog still
//           apply on top, so depth reads the same in both styles.
//
// The mist, cloud and time uniforms are shared objects: the renderer writes
// them once per frame and every enhanced material reads them for free.
import * as THREE from '../../vendor/three.module.js';

// sin() arguments wrap cleanly when time wraps at 200 PI provided every
// frequency below is a multiple of 0.01: k * 200 PI is then an integer number
// of turns. Wrapping matters because a phone session can run for an hour and
// a mediump sin of a four-digit argument has no precision left to sway with.
export const TIME_WRAP = Math.PI * 200;

// rain rings the land shader keeps: the god's rains take all but the last, the seasons' shower the last, so neither
// can starve the other (DESIGN.md "Rain of a proper size that moves")
export const WET_SLOTS = 8;

export const SHADE = {
  time: { value: 0 },
  // x: top of the mist (fully clear above), y: floor (full density at and
  // below), z: strength 0..1, w: distance ramp (1/blocks)
  mist: { value: new THREE.Vector4(0, 0, 0, 0.08) },
  mistColor: { value: new THREE.Color(0xdde6ec) },
  cloudAmt: { value: 0 },
  cloudTex: { value: null },
  wind: { value: 1 },
  // the wind's way for the sway (view/wind.js writes it while a wind look is on, ?wind=): x, y the way the air moves on
  // the ground (world x, z, a unit length), z the gust blowing (0..1), w 1 while on. While off (w 0) the sway is
  // exactly as it always was.
  windDir: { value: new THREE.Vector4(1, 0, 0, 0) },
  // the season's flowers (the food work, 2026-11-16; view/seasons.js bloomFor writes it by the season): x the share of flower heads and spring
  // blossom shown, y the share of autumn seed heads shown, z 1 while flower stems show (0 in winter). The mesher marks
  // each head with its own share in the sway attribute (world/mesher.js emitFlower); shown all-year until set.
  bloom: { value: new THREE.Vector3(1, 0, 1) },
  sunDir: { value: new THREE.Vector3(40, 60, 20).normalize() },
  sunColor: { value: new THREE.Color(0xffe4b8) },
  vivid: { value: 0 },
  // ---- vivid's storybook light (only read while vivid is on) ----
  // Vivid paints the raw palette, so without these a cave is exactly as
  // bright as the meadow and "stepping out into the light" means nothing.
  //   vividShadow  floor of the baked sun shadow: a face the mesher marked
  //                as sunless renders at this fraction, never black
  //   darkLo/Hi    one world-space box (the training cave) that is dark
  //   darkAmt      how dark: 0 is off, 0.66 leaves a third of the colour
  //   glow         up to GLOW_MAX warm pools of light, xyz + radius, the
  //                nearest to the camera chosen each frame (updateGlows);
  //                glowN says how many slots are live, so with nothing near
  //                the loop exits at once
  //   vividSky     what the river reflects at a grazing angle
  vividShadow: { value: 0.7 },
  darkLo: { value: new THREE.Vector3() },
  darkHi: { value: new THREE.Vector3() },
  darkAmt: { value: 0 },
  glow: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
  glowN: { value: 0 },
  glowColor: { value: new THREE.Color(0xffb565) },
  vividSky: { value: new THREE.Color(0x9fd2ee) },
  // the scene's light colour for vivid, which has no lights: cold for the
  // ice age, warm for the title's golden hour, white otherwise (setSky sets it)
  vividTint: { value: new THREE.Color(0xffffff) },
  // ---- edge mist ----
  // x0, z0, x1, z1 of the world in world units; fade width in blocks (0 = off);
  // the mist colour as raw output-space rgb (not a THREE.Color: no conversion)
  edge: { value: new THREE.Vector4(0, 0, 0, 0) },
  edgeW: { value: 0 },
  edgeColor: { value: new THREE.Vector3(1, 1, 1) },
  // ---- the far fade (walking, view/walk.js) ----
  // x: where the land starts to fade (metres from the eye, along the ground), y: where it is gone, z: how much
  // (0 = off: the god view). The land fades into uEdgeColor, the same colour as the edge mist and the sky's horizon.
  far: { value: new THREE.Vector3(0, 0, 0) },
  // ---- rain (sim/powers-nature-rain.js) ----
  // up to WET_SLOTS rings of rain: x, z, radius, wobble seed; wetAmt x: the
  // cloud's shadow 0..1, y: how wet the ground is 0..1. wetN 0 is off (one
  // branch per fragment). wetTex: the ground's height (r) and water (g) per
  // column, for the puddles in the hollows; wetBox: its x0, z0, width, depth.
  wet: { value: Array.from({ length: WET_SLOTS }, () => new THREE.Vector4()) },
  wetAmt: { value: Array.from({ length: WET_SLOTS }, () => new THREE.Vector4()) },
  wetN: { value: 0 },
  wetTex: { value: null },
  wetBox: { value: new THREE.Vector4(0, 0, 1, 1) },
  // ---- night (engine/lighting.js writes these once per frame; all 0 by day, so the day look is untouched) ----
  // night: 0 day .. 1 full night (scales the grade, the firelight and the water glint); moonMask: how
  // much the baked moon shadow takes from light 1 (the moon); nightDesat / nightTint: the share of
  // saturation the night takes and the cool cast it leaves (luminance kept); glowTex / glowBox: the
  // firelight map (R brightness, G source height / 48) over x0, z0, width, depth; glowAmt: its gain
  // (night x NIGHT.glow.gain); fireColor: its colour; glintDir / glint: the moon on water.
  night: { value: 0 },
  moonMask: { value: 0 },
  nightDesat: { value: 0 },
  nightTint: { value: new THREE.Vector3(1, 1, 1) },
  glowTex: { value: null },
  glowBox: { value: new THREE.Vector4(0, 0, 300, 300) },
  glowAmt: { value: 0 },
  fireColor: { value: new THREE.Color(0xff9a4a) },
  glintDir: { value: new THREE.Vector3(0, 1, 0) },
  glint: { value: new THREE.Color(0x000000) },
  // people and animals at night (FIGURE_MAT): figKeep the share of the night's desaturation they are
  // spared, figLift the extra cool light they catch (black by day)
  figKeep: { value: 0 },
  figLift: { value: new THREE.Color(0x000000) },
  // sunSwap 0..1: the sun's baked shadow cross-fades to the moon's (a low dusk or dawn sun stands at MOON_DIR);
  // warmKeep / warmLift: strongly warm colours (thatch) keep this share of colour at night and a touch of warmth
  sunSwap: { value: 0 },
  warmKeep: { value: 0 },
  warmLift: { value: 0 },
  // ---- the x-ray cut (ui/xray.js): one world box x0, z0, x1, z1 above cutY whose terrain dissolves, cutA 0..1
  // (a dither, so the fade is quick and needs no sorting). Chunk materials only; cutA 0 costs one compare.
  cut: { value: new THREE.Vector4(0, 0, 0, 0) },
  cutY: { value: 0 },
  cutA: { value: 0 },
  // ---- the home you walk into (ui/xray.js, walking): one world box, its inside lit by its hearth and the day through
  // its door. room: x0, z0, x1, z1; roomY: x the floor, y the ceiling, z the amount 0..1 (0 is off: one compare);
  // roomFire: the hearth's x, y, z and the reach of its light (metres); roomFill / roomFireColor: the even light
  // (the day through the door) and the hearth's warm light, each already times its strength. Every enhanced material.
  room: { value: new THREE.Vector4(0, 0, 0, 0) },
  roomY: { value: new THREE.Vector3(0, 0, 0) },
  roomFire: { value: new THREE.Vector4(0, 0, 0, 1) },
  roomFill: { value: new THREE.Color(0x000000) },
  roomFireColor: { value: new THREE.Color(0x000000) },
};
// the lit inside of a home: box { x0, z0, x1, z1, y0, y1 } (world units), fire { x, y, z, r }, fill and fireColor
// [r, g, b] in linear light (already times their strength), a the fade 0..1; null is off
export function setRoom(box, fire, fill, fireColor, a = 1) {
  if (!box || !(a > 0)) { SHADE.roomY.value.z = 0; return; }
  SHADE.room.value.set(box.x0, box.z0, box.x1, box.z1);
  SHADE.roomY.value.set(box.y0, box.y1, Math.min(1, a));
  SHADE.roomFire.value.set(fire.x, fire.y, fire.z, fire.r);
  SHADE.roomFill.value.setRGB(fill[0], fill[1], fill[2]);
  SHADE.roomFireColor.value.setRGB(fireColor[0], fireColor[1], fireColor[2]);
}
// the x-ray cut: box { x0, z0, x1, z1 } in world units (exclusive edges), y the plane, a the fade; null is off
export function setCut(box, y = 0, a = 1) {
  if (!box || !(a > 0)) { SHADE.cutA.value = 0; return; }
  SHADE.cut.value.set(box.x0, box.z0, box.x1, box.z1);
  SHADE.cutY.value = y;
  SHADE.cutA.value = Math.min(1, a);
}
// The moon's direction (toward the moon), west-south-west and lower than the sun (40, 60, 20), so night
// models the land from another side with longer shadows. world/mesher.js bakes the moon shadow for it.
export const MOON_DIR = [-32, 28, 18];

// The edge's shape, shared by the shader below and edgeClear(): distance in
// from a rectangle with rounded corners (EDGE_R), pushed in and out by two
// octaves of value noise (EDGE_AMP blocks either way) that drift slowly.
const EDGE_R = 40, EDGE_AMP = 7;
const fract = (v) => v - Math.floor(v);
const ehash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function evn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = ehash(ix, iy), b = ehash(ix + 1, iy), c = ehash(ix, iy + 1), d = ehash(ix + 1, iy + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

// The same falloff as the shader, without its slow drift (so it is within a
// block or two of what is drawn): 0 = lost in the mist, 1 = fully clear.
// Tools can use it ("what you cannot see you cannot touch").
export function edgeClear(x, z) {
  const e = SHADE.edge.value, W = SHADE.edgeW.value;
  if (W <= 0) return 1;
  const dx = Math.min(x - e.x, e.z - x), dz = Math.min(z - e.y, e.w - z);
  const ox = Math.max(EDGE_R - dx, 0), oz = Math.max(EDGE_R - dz, 0);
  const d = dx > EDGE_R && dz > EDGE_R ? Math.min(dx, dz) : EDGE_R - Math.hypot(ox, oz);
  const wob = ((evn(x * 0.03, z * 0.03) * 0.65 + evn(x * 0.09 + 5.2, z * 0.09 + 1.3) * 0.35) - 0.5) * 2 * EDGE_AMP;
  const t = Math.max(0, Math.min(1, (d + wob - EDGE_AMP) / W));
  return t * t * (3 - 2 * t);
}

const ENHANCED = new Set();
let cloudsOn = false;
let vividOn = false;

// 128x128 tiling value-noise, three octaves, built once and only on demand.
function cloudTexture() {
  if (SHADE.cloudTex.value) return SHADE.cloudTex.value;
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const grid = (size, seed) => {
    const g = new Float32Array(size * size);
    let s = seed;
    for (let i = 0; i < g.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; g[i] = (s % 1000) / 1000; }
    return (x, y) => {
      const fx = x * size / N, fy = y * size / N;
      const x0 = Math.floor(fx) % size, y0 = Math.floor(fy) % size;
      const x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
      const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
      const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
      const a = g[y0 * size + x0], b = g[y0 * size + x1], c = g[y1 * size + x0], d = g[y1 * size + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  };
  const o1 = grid(4, 7), o2 = grid(8, 19), o3 = grid(16, 31);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let n = o1(x, y) * 0.6 + o2(x, y) * 0.28 + o3(x, y) * 0.12;
      // mostly clear sky with soft dark blotches: a cloud shadow, not a
      // checkerboard. 1.0 = full sun.
      n = 1 - Math.max(0, (n - 0.5) * 1.6) * 0.55;
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(n * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  SHADE.cloudTex.value = tex;
  return tex;
}

// Replace the stock directional-light loop so light 0 (the sun: it is added
// first and is the only shadow caster, and three sorts casters first) is
// masked by the baked sun term and the cloud term. The fill light at index 1
// is left alone: it is the faint opposite-side bounce that keeps faces that
// point away from the sun from dropping to pure ambient.
const LIGHT_LOOP = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  `getDirectionalLightInfo( directionalLight, directLight );
    #if UNROLLED_LOOP_INDEX == 0
      directLight.color *= towcbSunMask;
    #endif
    #if UNROLLED_LOOP_INDEX == 1
      directLight.color *= towcbMoonMask;
    #endif`
);

const VERT_PARS = /* glsl */ `
uniform float uTime;
uniform float uWind;
varying vec3 vWPos;
#ifdef USE_SUNMASK
  attribute float sun;
  varying float vSun;
  attribute float moon;
  varying float vMoon;
#endif
#ifdef USE_SWAY
  attribute float sway;
  uniform vec3 uBloom;
  uniform vec4 uWindDir;
#endif
`;

// sway 2 and over is a season code (world/mesher.js emitFlower): 2 + t a flower head or blossom, shown while
// uBloom.x > t; 4 + t a seed head, shown while uBloom.y > t; 6 / 7 a flower stem's root / tip, shown while uBloom.z
// is on. A part not shown sinks 0.9 into the ground, under the grass. Heads and seeds sway as a tip does.
const VERT_BEGIN = /* glsl */ `
#include <begin_vertex>
#ifdef USE_SWAY
  float swayK = sway;
  if ( sway >= 2.0 ) {
    float code = floor( sway * 0.5 ) * 2.0;
    float th = sway - code;
    float shown = code < 3.0 ? step( th, uBloom.x - 0.0005 ) : code < 5.0 ? step( th, uBloom.y - 0.0005 ) : step( 0.5, uBloom.z );
    transformed.y -= ( 1.0 - shown ) * 0.9;
    swayK = code > 5.0 ? th : 1.0;
  }
  if ( swayK > 0.0 && uWindDir.w > 0.5 ) {
    // with the wind (view/wind.js): everything leans a little downwind and rocks along the wind's way, the waves
    // rolling downwind across the grass and the crowns, stronger in a gust
    vec2 wd = uWindDir.xy;
    float g = uWindDir.z;
    float ph = dot( position.xz, wd ) * 0.35 + ( position.x * 0.13 - position.z * 0.11 );
    float w = sin( uTime * 1.6 - ph ) * 0.65 + sin( uTime * 2.7 - ph * 1.9 ) * 0.35;
    float lean = 0.03 + 0.05 * g;
    transformed.xz += wd * ( lean + w * ( 0.05 + 0.06 * g ) ) * swayK * uWind;
    transformed.xz += vec2( -wd.y, wd.x ) * sin( uTime * 1.2 + position.z * 0.8 - position.x * 0.4 ) * 0.025 * swayK * uWind;
  } else if ( swayK > 0.0 ) {
    float ph = position.x * 0.9 + position.z * 0.7;
    float w = sin( uTime * 1.6 + ph ) * 0.65 + sin( uTime * 2.7 + ph * 1.9 ) * 0.35;
    transformed.x += w * 0.09 * swayK * uWind;
    transformed.z += sin( uTime * 1.2 + position.z * 0.8 - position.x * 0.4 ) * 0.05 * swayK * uWind;
  }
#endif
`;

const VERT_WORLD = /* glsl */ `
#include <worldpos_vertex>
vec4 shadePosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  shadePosition = instanceMatrix * shadePosition;
#endif
vWPos = ( modelMatrix * shadePosition ).xyz;
#ifdef USE_SUNMASK
  vSun = sun;
  vMoon = moon;
#endif
`;

const FRAG_PARS = /* glsl */ `
uniform float uTime;
uniform vec4 uMist;
uniform vec3 uMistColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uVivid;
uniform float uVividShadow;
uniform vec3 uDarkLo;
uniform vec3 uDarkHi;
uniform float uDarkAmt;
uniform vec4 uGlow[ 8 ];
uniform int uGlowN;
uniform vec3 uGlowColor;
uniform vec3 uVividSky;
uniform vec3 uVividTint;
uniform vec4 uEdge;
uniform float uEdgeW;
uniform vec3 uEdgeColor;
uniform vec3 uFar;
uniform vec4 uWet[ ${WET_SLOTS} ];
uniform vec4 uWetAmt[ ${WET_SLOTS} ];
uniform int uWetN;
uniform sampler2D uWetTex;
uniform vec4 uWetBox;
uniform float uNight;
uniform float uMoonMask;
uniform float uNightDesat;
uniform vec3 uNightTint;
uniform sampler2D uGlowTex;
uniform vec4 uGlowBox;
uniform float uGlowAmt;
uniform vec3 uFireColor;
uniform vec3 uGlintDir;
uniform vec3 uGlint;
uniform float uFigKeep;
uniform vec3 uFigLift;
uniform float uSunSwap;
uniform float uWarmKeep;
uniform float uWarmLift;
uniform vec4 uCut;
uniform float uCutY;
uniform float uCutA;
uniform vec4 uRoom;
uniform vec3 uRoomY;
uniform vec4 uRoomFire;
uniform vec3 uRoomFill;
uniform vec3 uRoomFireColor;
varying vec3 vWPos;
float towcbEH( vec2 p ) { return fract( sin( p.x * 127.1 + p.y * 311.7 ) * 43758.5453 ); }
float towcbEN( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( towcbEH( i ), towcbEH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( towcbEH( i + vec2( 0.0, 1.0 ) ), towcbEH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
#ifdef USE_SUNMASK
  varying float vSun;
  varying float vMoon;
#endif
#ifdef USE_CLOUDS
  uniform sampler2D uCloudTex;
  uniform float uCloudAmt;
#endif
`;

// Rain on the land (sim/powers-nature-rain.js fills the `wet` slots). Inside a
// ring: the cloud above takes some light away (a shadow, never a colour
// wash, so the land stays as readable as on a dull day), what faces the sky
// goes darker and richer as it wets, and water gathers in the hollows (a
// column lower than the ground two blocks round it), shrinking as it dries.
// Outside every ring nothing changes. wetN 0 skips it all.
function FRAG_WET_SRC() {
  return /* glsl */ `
if ( uWetN > 0 ) {
  float towcbShd = 0.0, towcbWet = 0.0;
  for ( int i = 0; i < ${WET_SLOTS}; i ++ ) {
    if ( i >= uWetN ) break;
    vec4 towcbW = uWet[ i ];
    if ( towcbW.z <= 0.0 ) continue;
    // a ragged, soft rim that grows with the ring: a big rain's edge wanders a few blocks in broad lobes (at most
    // about 5 either way at a quarter of the map), never far from the ring the rules use
    float towcbBig = clamp( towcbW.z / 25.0, 1.0, 4.0 );
    float towcbWb = ( towcbEN( vWPos.xz * ( 0.14 / towcbBig ) + towcbW.w ) - 0.5 ) * ( 3.0 * min( towcbBig, 3.2 ) );
    float towcbSoft = 1.5 * towcbBig;
    float towcbK = 1.0 - smoothstep( towcbW.z - towcbSoft, towcbW.z + towcbSoft, distance( vWPos.xz, towcbW.xy ) + towcbWb );
    towcbShd = max( towcbShd, towcbK * uWetAmt[ i ].x );
    towcbWet = max( towcbWet, towcbK * uWetAmt[ i ].y );
  }
  if ( towcbShd + towcbWet > 0.002 ) {
    vec3 towcbWN2 = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
    float towcbSky = smoothstep( 0.55, 0.9, towcbWN2.y );
    float towcbLum = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
    vec3 towcbRich = max( mix( vec3( towcbLum ), outgoingLight, 1.2 ), 0.0 ) * 0.7;
    outgoingLight = mix( outgoingLight, towcbRich, towcbWet * ( 0.35 + 0.5 * towcbSky ) );
    #ifndef USE_WATER
    if ( towcbWet > 0.05 && towcbSky > 0.5 ) {
      vec2 towcbPx = 1.0 / uWetBox.zw;
      vec2 towcbUv = ( floor( vWPos.xz ) + 0.5 - uWetBox.xy ) * towcbPx;
      vec2 towcbH = texture2D( uWetTex, towcbUv ).rg;
      float towcbH0 = towcbH.r * 255.0 + 1.0;
      if ( towcbH.g < 0.5 && abs( vWPos.y - towcbH0 ) < 0.06 ) {
        // a hollow: lower than the ground two blocks away on every side (a slope is not one)
        float towcbA = texture2D( uWetTex, towcbUv + vec2( 2.0, 0.0 ) * towcbPx ).r, towcbB = texture2D( uWetTex, towcbUv - vec2( 2.0, 0.0 ) * towcbPx ).r;
        float towcbC = texture2D( uWetTex, towcbUv + vec2( 0.0, 2.0 ) * towcbPx ).r, towcbD = texture2D( uWetTex, towcbUv - vec2( 0.0, 2.0 ) * towcbPx ).r;
        float towcbDeep = min( min( towcbA, towcbB ), min( towcbC, towcbD ) ) * 255.0 + 1.0 - towcbH0;
        float towcbN = towcbEN( vWPos.xz * 0.8 ) * 0.6 + towcbEN( vWPos.xz * 2.6 + 3.1 ) * 0.4;
        float towcbP = smoothstep( 0.2, 0.45, clamp( towcbDeep, -1.0, 1.5 ) * 0.6 + ( towcbN - 0.58 ) * 0.9 - ( 1.0 - towcbWet ) * 0.9 );
        float towcbRip = 0.92 + 0.08 * sin( uTime * 9.0 + vWPos.x * 7.0 + vWPos.z * 5.0 );
        vec3 towcbPud = mix( vec3( 0.10, 0.14, 0.19 ), vec3( 0.36, 0.44, 0.52 ), towcbN ) * towcbRip;
        outgoingLight = mix( outgoingLight, towcbPud, towcbP * 0.8 );
      }
    }
    #endif
    outgoingLight *= 1.0 - 0.36 * towcbShd;
  }
}
`;
}

// the mask is computed once, before the light loop, so it is in scope for
// every directional light iteration
const FRAG_MASK = /* glsl */ `
float towcbSunMask = 1.0;
float towcbMoonMask = 1.0;
#ifdef USE_SUNMASK
  towcbSunMask *= smoothstep( 0.05, 0.95, mix( vSun, vMoon, uSunSwap ) );
  towcbMoonMask = mix( 1.0, smoothstep( 0.05, 0.95, vMoon ), uMoonMask );
#endif
towcbSunMask = max( towcbSunMask, towcbXray * 0.8 );
towcbMoonMask = max( towcbMoonMask, towcbXray * 0.8 );
#ifdef USE_CLOUDS
  towcbSunMask *= mix( 1.0, texture2D( uCloudTex, vWPos.xz * 0.011 + uTime * vec2( 0.00637, 0.00318 ) ).r, uCloudAmt );
#endif
`;

const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_begin>
#ifdef USE_WATER
  {
    vec2 wp = vWPos.xz;
    float nx = sin( wp.x * 2.3 + uTime * 1.7 ) * 0.5 + sin( wp.y * 1.7 - uTime * 1.1 + wp.x * 0.6 ) * 0.5;
    float nz = cos( wp.y * 2.1 + uTime * 1.3 ) * 0.5 + sin( wp.x * 1.9 + uTime * 0.9 ) * 0.5;
    vec3 nW = normalize( vec3( nx * 0.16, 1.0, nz * 0.16 ) );
    normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
  }
#endif
`;

const FRAG_COLOR = /* glsl */ `
float towcbXray = 0.0;
// the x-ray cut (ui/xray.js): terrain inside the hovered building's box and above its plane dissolves; what is
// left inside (the floor, the walls, the people and things in there) is lit as if a lamp were held to it
if ( uCutA > 0.0 && vWPos.x > uCut.x && vWPos.x < uCut.z && vWPos.z > uCut.y && vWPos.z < uCut.w ) {
  #if defined( USE_SUNMASK ) || defined( USE_WATER )
    if ( vWPos.y > uCutY ) {
      if ( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) < uCutA ) discard;
    } else towcbXray = uCutA;
  #else
    if ( vWPos.y < uCutY + 2.5 ) towcbXray = uCutA;
  #endif
}
#include <color_fragment>
#ifdef USE_WATER
  diffuseColor.rgb *= 0.93 + 0.07 * sin( uTime * 2.0 + vWPos.x * 2.1 + vWPos.z * 1.7 );
#endif
vec3 towcbAlbedo = diffuseColor.rgb;
`;

// Night (engine/lighting.js). Runs on the lit result before tone mapping, emissive light left out (a
// fire stays a fire): part of the colour's saturation goes, replaced by a cool cast of the same
// luminance, so the land reads blue and silver without going grey or losing its contrast; then the
// firelight map adds warm light to whatever stands in a pool (ground, walls, people), unaffected by
// the cool grade. Skipped entirely by day (uNight 0).
const FRAG_NIGHT = /* glsl */ `
if ( uNight > 0.001 ) {
  vec3 towcbLit = outgoingLight - totalEmissiveRadiance;
  float towcbLum = dot( towcbLit, vec3( 0.2126, 0.7152, 0.0722 ) );
  #ifdef USE_FIGURE
    // a person or animal: spared part of the grade, and a little extra moonlight, most on what faces up
    towcbLit = mix( towcbLit, towcbLum * uNightTint, uNightDesat * ( 1.0 - uFigKeep ) );
    vec3 towcbFN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
    towcbLit += towcbAlbedo * uFigLift * ( 0.6 + 0.4 * max( towcbFN.y, 0.0 ) );
  #else
    // thatch and the like (a strong straw-yellow hue: red well over blue, green close behind red) keep most of their colour and a touch of
    // their own warmth, so roofs stand out from the blue ground; greens, dirt and stone take the full grade
    float towcbMx = max( max( towcbAlbedo.r, towcbAlbedo.g ), max( towcbAlbedo.b, 0.001 ) );
    float towcbWarm = smoothstep( 0.5, 0.6, ( towcbAlbedo.r - towcbAlbedo.b ) / towcbMx ) * step( towcbAlbedo.g, towcbAlbedo.r )
      * smoothstep( 0.66, 0.74, towcbAlbedo.g / max( towcbAlbedo.r, 0.001 ) ); // straw yellow, not red earth
    towcbLit = mix( towcbLit, towcbLum * uNightTint, uNightDesat * ( 1.0 - towcbWarm * uWarmKeep ) );
    towcbLit += towcbAlbedo * vec3( 1.0, 0.72, 0.42 ) * ( towcbWarm * uWarmLift );
  #endif
  if ( uGlowAmt > 0.001 ) {
    vec2 towcbGv = texture2D( uGlowTex, ( vWPos.xz - uGlowBox.xy ) / uGlowBox.zw ).rg;
    float towcbGk = towcbGv.r * ( 1.0 - smoothstep( 1.5, 5.0, abs( vWPos.y - towcbGv.g * 48.0 ) ) );
    towcbLit += towcbAlbedo * uFireColor * ( towcbGk * uGlowAmt );
  }
  outgoingLight = towcbLit + totalEmissiveRadiance;
}
`;

// Vivid: discard the lit result and paint the palette with fixed face shades.
// `normal` (view space, water wobble included) and `outgoingLight` are both
// main()-scope locals and still live here; the transpose multiply undoes the
// view rotation. Runs before tonemapping/fog, so mist and scene fog stay.
//
// SRGBFIX: vertex colours are written by the mesher as raw hex/255 (sRGB
// numbers) but the shader treats attributes as linear, so the final sRGB
// encode would lift the palette. Decoding here (pow 2.2) makes the screen
// show the authored hex exactly, which is what the Godot reference build
// shows. Only vertex-coloured materials need it: THREE.Color uniforms are
// already converted to linear on the CPU.
const FRAG_VIVID = /* glsl */ `
if ( uVivid > 0.5 ) {
  vec3 towcbWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 towcbAN = abs( towcbWN );
  float towcbUp = towcbWN.y > 0.0 ? 1.0 : 0.55;
  float towcbShade = towcbAN.y * towcbUp + towcbAN.x * 0.76 + towcbAN.z * 0.86;
  #ifdef USE_VIVID_FULL
    towcbShade = 1.0;
  #endif
  #ifdef USE_VIVID_SRGBFIX
    towcbAlbedo = pow( towcbAlbedo, vec3( 2.2 ) );
  #endif
  // storybook light: the mesher's baked sun shadow (clouds included on the
  // Rich tier), the dark zone, then warm glows that only lift what is dark
  float towcbLit = 1.0;
  #ifdef USE_SUNMASK
    towcbLit = mix( uVividShadow, 1.0, towcbSunMask );
  #endif
  vec3 towcbZLo = smoothstep( uDarkLo - 0.75, uDarkLo, vWPos );
  vec3 towcbZHi = 1.0 - smoothstep( uDarkHi, uDarkHi + 0.75, vWPos );
  float towcbZone = towcbZLo.x * towcbZLo.y * towcbZLo.z * towcbZHi.x * towcbZHi.y * towcbZHi.z * uDarkAmt;
  #ifdef USE_SUNMASK
    towcbLit = min( towcbLit, mix( 1.0 - towcbZone, 1.0, towcbSunMask ) );
  #else
    towcbLit = min( towcbLit, 1.0 - towcbZone );
  #endif
  float towcbGlow = 0.0;
  for ( int i = 0; i < 8; i ++ ) {
    if ( i >= uGlowN ) break;
    vec4 towcbG = uGlow[ i ];
    towcbGlow += 1.0 - smoothstep( 0.0, towcbG.w, distance( vWPos, towcbG.xyz ) );
  }
  towcbGlow = min( towcbGlow, 1.0 );
  // fire light ADDS (it can push a face past its daylight colour): a torch
  // has to read as a light source on dark rock, not just as less shadow
  vec3 towcbLight = vec3( towcbLit ) + uGlowColor * ( towcbGlow * 1.25 );
  outgoingLight = towcbAlbedo * towcbShade * towcbLight;
  #ifdef USE_WATER
    // water that reads as water: the sky in it at a grazing angle, and a
    // tight sun glint riding the animated normal
    float towcbFres = pow( 1.0 - clamp( dot( normal, geometryViewDir ), 0.0, 1.0 ), 3.0 );
    outgoingLight = mix( outgoingLight, uVividSky, towcbFres * 0.6 );
    vec3 towcbSunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
    float towcbSp = pow( max( dot( normal, normalize( towcbSunV + geometryViewDir ) ), 0.0 ), 90.0 );
    outgoingLight += vec3( towcbSp * 0.8 );
  #endif
  outgoingLight *= uVividTint;
}
${FRAG_WET_SRC()}
${FRAG_NIGHT}
if ( towcbXray > 0.0 ) outgoingLight = max( outgoingLight, towcbAlbedo * vec3( 1.0, 0.92, 0.8 ) * 0.85 * towcbXray );
// the home you walk into (ui/xray.js): inside its box, at least the day through the door and the hearth's warm pool
// (never darker than it was: by night the firelight map may already light it more)
if ( uRoomY.z > 0.0 && vWPos.x > uRoom.x && vWPos.x < uRoom.z && vWPos.z > uRoom.y && vWPos.z < uRoom.w && vWPos.y > uRoomY.x && vWPos.y < uRoomY.y ) {
  float towcbRf = 1.0 - smoothstep( 0.0, uRoomFire.w, distance( vWPos, uRoomFire.xyz ) );
  outgoingLight = max( outgoingLight, towcbAlbedo * ( uRoomFill + uRoomFireColor * towcbRf ) * uRoomY.z );
}
#include <opaque_fragment>
`;

const FRAG_LIGHTS_END = /* glsl */ `
#include <lights_fragment_end>
#ifdef USE_WATER
  {
    vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
    vec3 h = normalize( sunV + geometryViewDir );
    float sp = pow( max( dot( normal, h ), 0.0 ), 42.0 );
    reflectedLight.directSpecular += sp * uSunColor * 0.45;
    // the moon on water: the camera is orthographic, so a true reflection of a moon behind it never
    // shows; instead each ripple whose animated normal leans toward uGlintDir catches a small silver
    // glint, over a faint broad sheen. uGlint is black by day.
    if ( uNight > 0.001 ) {
      vec3 towcbNW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
      float towcbGd = max( dot( towcbNW, uGlintDir ), 0.0 );
      // glitter gathers in slow drifting patches (a breath of wind on the water), sparse elsewhere
      float towcbGp = smoothstep( 0.4, 0.85, towcbEN( vWPos.xz * 0.05 + vec2( uTime * 0.013, uTime * 0.007 ) ) );
      float towcbGs = pow( towcbGd, 7000.0 ) * 2.2 * ( 0.2 + 0.8 * towcbGp ) + pow( towcbGd, 24.0 ) * 0.06 * towcbGp;
      // the water itself goes a deeper blue by night, so the silver reads against it; (Lambert's
      // output sums only the diffuse terms, so the glint goes there)
      reflectedLight.directDiffuse *= 1.0 - 0.4 * uNight;
      reflectedLight.indirectDiffuse *= 1.0 - 0.4 * uNight;
      reflectedLight.directDiffuse += uGlint * towcbGs;
    }
  }
#endif
`;

const FRAG_FOG = /* glsl */ `
#include <fog_fragment>
#ifdef USE_FOG
  if ( uMist.z > 0.0 ) {
    float mh = 1.0 - smoothstep( uMist.y, uMist.x, vWPos.y );
    float md = 1.0 - exp( - vFogDepth * uMist.w );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, uMistColor, uMist.z * mh * md );
  }
#endif
if ( uEdgeW > 0.0 ) {
  // keep in step with edgeClear() in this file (EDGE_R 40, EDGE_AMP 7)
  vec2 towcbP = vWPos.xz;
  // the god's view (orthographic): a thing standing up off the ground takes the mist of the GROUND seen behind it
  // along the line of sight, not of where it stands. Looking nearly level (the tilt, view/camera.js), a tree in the
  // near edge's mist stood up in front of clear land and showed as a white ghost (2026-11-15). Straight down this
  // changes nothing; at the usual tilt, under a block. 16.0 is the flat ground, WORLD.GROUND_Y + 1; the lift is
  // capped so a hill at the edge still fades. Walking (a perspective camera) keeps the mist where things stand.
  if ( isOrthographic ) {
    vec3 towcbV = - vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
    if ( towcbV.y < - 0.05 ) towcbP += towcbV.xz * ( clamp( vWPos.y - 16.0, 0.0, 10.0 ) / - towcbV.y );
  }
  vec2 towcbE = vec2( min( towcbP.x - uEdge.x, uEdge.z - towcbP.x ), min( towcbP.y - uEdge.y, uEdge.w - towcbP.y ) );
  float towcbD = ( towcbE.x > 40.0 && towcbE.y > 40.0 ) ? min( towcbE.x, towcbE.y ) : 40.0 - length( max( vec2( 40.0 ) - towcbE, 0.0 ) );
  vec2 towcbDrift = vec2( sin( uTime * 0.05 ), cos( uTime * 0.03 ) ) * 0.12;
  float towcbWob = ( ( towcbEN( towcbP * 0.03 + towcbDrift ) * 0.65 + towcbEN( towcbP * 0.09 + vec2( 5.2, 1.3 ) - towcbDrift ) * 0.35 ) - 0.5 ) * 14.0;
  gl_FragColor.rgb = mix( uEdgeColor, gl_FragColor.rgb, smoothstep( 0.0, uEdgeW, towcbD + towcbWob - 7.0 ) );
}
if ( uFar.z > 0.0 ) {
  // walking: the land fades into the mist with distance from the eye (view/walk.js), so the far edge of what is
  // drawn never shows
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uEdgeColor, uFar.z * smoothstep( uFar.x, uFar.y, length( vWPos.xz - cameraPosition.xz ) ) );
}
`;

/**
 * Splice the game's shading features into a Lambert material.
 * @param {THREE.Material} mat
 * @param {{sun?:boolean, sway?:boolean, water?:boolean, vividFull?:boolean, linearColors?:boolean, figure?:boolean}} opts
 * figure: a person or animal; at night it gets the small lift in FRAG_NIGHT (USE_FIGURE).
 * vividFull: in the vivid style this material skips face shading and renders
 * at full palette brightness (cross flora, which has no meaningful faces).
 * linearColors: its vertex colours are already linear (world/merge.js bakes
 * from THREE.Color), so vivid must not decode them again. Only the mesher
 * writes raw sRGB numbers; before this flag every folded prop and character
 * rendered too dark in vivid.
 */
export function enhance(mat, opts = {}) {
  if (!mat || mat.userData.towcb) return mat;
  mat.userData.towcb = { sun: !!opts.sun, sway: !!opts.sway, water: !!opts.water };
  mat.defines = mat.defines || {};
  if (opts.sun) mat.defines.USE_SUNMASK = '';
  if (opts.sway) mat.defines.USE_SWAY = '';
  if (opts.water) mat.defines.USE_WATER = '';
  if (opts.vividFull) mat.defines.USE_VIVID_FULL = '';
  if (opts.figure) mat.defines.USE_FIGURE = '';
  if (mat.vertexColors && !opts.linearColors) mat.defines.USE_VIVID_SRGBFIX = '';
  if (cloudsOn) mat.defines.USE_CLOUDS = '';
  mat.toneMapped = !vividOn; // materials born while vivid is on match the set
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHADE.time;
    shader.uniforms.uWind = SHADE.wind;
    shader.uniforms.uBloom = SHADE.bloom;
    shader.uniforms.uWindDir = SHADE.windDir;
    shader.uniforms.uMist = SHADE.mist;
    shader.uniforms.uMistColor = SHADE.mistColor;
    shader.uniforms.uSunDir = SHADE.sunDir;
    shader.uniforms.uSunColor = SHADE.sunColor;
    shader.uniforms.uCloudTex = SHADE.cloudTex;
    shader.uniforms.uCloudAmt = SHADE.cloudAmt;
    shader.uniforms.uVivid = SHADE.vivid;
    shader.uniforms.uVividShadow = SHADE.vividShadow;
    shader.uniforms.uDarkLo = SHADE.darkLo;
    shader.uniforms.uDarkHi = SHADE.darkHi;
    shader.uniforms.uDarkAmt = SHADE.darkAmt;
    shader.uniforms.uGlow = SHADE.glow;
    shader.uniforms.uGlowN = SHADE.glowN;
    shader.uniforms.uGlowColor = SHADE.glowColor;
    shader.uniforms.uVividSky = SHADE.vividSky;
    shader.uniforms.uVividTint = SHADE.vividTint;
    shader.uniforms.uEdge = SHADE.edge;
    shader.uniforms.uEdgeW = SHADE.edgeW;
    shader.uniforms.uEdgeColor = SHADE.edgeColor;
    shader.uniforms.uFar = SHADE.far;
    shader.uniforms.uWet = SHADE.wet;
    shader.uniforms.uWetAmt = SHADE.wetAmt;
    shader.uniforms.uWetN = SHADE.wetN;
    shader.uniforms.uWetTex = SHADE.wetTex;
    shader.uniforms.uWetBox = SHADE.wetBox;
    shader.uniforms.uNight = SHADE.night;
    shader.uniforms.uMoonMask = SHADE.moonMask;
    shader.uniforms.uNightDesat = SHADE.nightDesat;
    shader.uniforms.uNightTint = SHADE.nightTint;
    shader.uniforms.uGlowTex = SHADE.glowTex;
    shader.uniforms.uGlowBox = SHADE.glowBox;
    shader.uniforms.uGlowAmt = SHADE.glowAmt;
    shader.uniforms.uFireColor = SHADE.fireColor;
    shader.uniforms.uGlintDir = SHADE.glintDir;
    shader.uniforms.uGlint = SHADE.glint;
    shader.uniforms.uFigKeep = SHADE.figKeep;
    shader.uniforms.uFigLift = SHADE.figLift;
    shader.uniforms.uSunSwap = SHADE.sunSwap;
    shader.uniforms.uWarmKeep = SHADE.warmKeep;
    shader.uniforms.uWarmLift = SHADE.warmLift;
    shader.uniforms.uCut = SHADE.cut;
    shader.uniforms.uCutY = SHADE.cutY;
    shader.uniforms.uCutA = SHADE.cutA;
    shader.uniforms.uRoom = SHADE.room;
    shader.uniforms.uRoomY = SHADE.roomY;
    shader.uniforms.uRoomFire = SHADE.roomFire;
    shader.uniforms.uRoomFill = SHADE.roomFill;
    shader.uniforms.uRoomFireColor = SHADE.roomFireColor;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', VERT_BEGIN)
      .replace('#include <worldpos_vertex>', VERT_WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <normal_fragment_begin>', FRAG_NORMAL)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <lights_fragment_begin>', FRAG_MASK + LIGHT_LOOP)
      .replace('#include <lights_fragment_end>', FRAG_LIGHTS_END)
      .replace('#include <opaque_fragment>', FRAG_VIVID)
      .replace('#include <fog_fragment>', FRAG_FOG);
  };
  // three caches programs by this key; without it two materials with
  // different defines could be handed the same compiled program
  const tag = `towcb:${opts.sun ? 's' : ''}${opts.sway ? 'w' : ''}${opts.water ? 'a' : ''}${opts.vividFull ? 'f' : ''}${opts.figure ? 'g' : ''}${mat.vertexColors ? (opts.linearColors ? 'L' : 'v') : ''}`;
  mat.customProgramCacheKey = () => tag + (mat.defines.USE_CLOUDS !== undefined ? ':c' : '');
  ENHANCED.add(mat);
  return mat;
}

// Cloud shadows on or off for every enhanced material. Forces a recompile,
// so call it on a settings change, never per frame.
export function setClouds(on) {
  on = !!on;
  if (on === cloudsOn) return;
  cloudsOn = on;
  if (on) cloudTexture();
  SHADE.cloudAmt.value = on ? 0.85 : 0;
  for (const m of ENHANCED) {
    if (on) m.defines.USE_CLOUDS = '';
    else delete m.defines.USE_CLOUDS;
    m.needsUpdate = true;
  }
}

// Vivid style on or off for every enhanced material. The uniform alone would
// be free, but the toneMapped flip (ACES would mute the whole point of the
// style) needs a recompile, so call on a settings change, never per frame.
export function setVivid(on) {
  on = !!on;
  if (on === vividOn) return;
  vividOn = on;
  SHADE.vivid.value = on ? 1 : 0;
  for (const m of ENHANCED) {
    m.toneMapped = !on;
    m.needsUpdate = true;
  }
}

export const isVivid = () => vividOn;

// Vivid's dark zone: one world-space box that renders dark except where the
// mesher baked sunlight onto a face (a cave mouth, a shaft through the roof).
// Pass null to switch it off. Uniform writes only, so this is free per call.
export function setDarkZone(lo, hi, amount = 0.66) {
  if (!lo) { SHADE.darkAmt.value = 0; return; }
  SHADE.darkLo.value.set(lo.x, lo.y, lo.z);
  SHADE.darkHi.value.set(hi.x, hi.y, hi.z);
  SHADE.darkAmt.value = amount;
}

// Vivid's warm pools of light: any number of {x, y, z, r}, kept by reference
// so an owner can flicker r. Each frame updateGlows() hands the shader the
// GLOW_MAX nearest to the camera within GLOW_RANGE; an empty list is off.
const GLOW_MAX = 8, GLOW_RANGE = 40;
let glowList = [];
export function setGlows(list = []) {
  glowList = list.slice();
  if (!glowList.length) SHADE.glowN.value = 0;
}

// called once per rendered frame by the renderer
export function updateGlows(cam) {
  if (!glowList.length) { SHADE.glowN.value = 0; return; }
  const near = [];
  for (const g of glowList) {
    const d = (g.x - cam.x) ** 2 + (g.y - cam.y) ** 2 + (g.z - cam.z) ** 2;
    if (d < GLOW_RANGE * GLOW_RANGE) near.push([d, g]);
  }
  near.sort((a, b) => a[0] - b[0]);
  const n = Math.min(GLOW_MAX, near.length);
  for (let i = 0; i < n; i++) {
    const g = near[i][1];
    SHADE.glow.value[i].set(g.x, g.y, g.z, g.r);
  }
  SHADE.glowN.value = n;
}

// advance the shared clock; the renderer calls this once per rendered frame
export function tickShade(dt) {
  let t = SHADE.time.value + dt;
  if (t > TIME_WRAP) t -= TIME_WRAP;
  SHADE.time.value = t;
}
