// Wind you can see (DESIGN.md "Wind you can see (director, 2026-11-17)"; how it is built: docs/SIM.md "The wind";
// numbers: docs/NUMBERS.md 1.6). It only draws: the wind itself is the simulation's (sim/wind.js, sim.ask('wind:dev')),
// and nothing here writes the world or saved data.
//
// The director chose the look "By hand" (2026-11-17): small groups of white strokes, each group drawn one stroke after
// another, the width swelling and thinning like a pen, the head bright and the tail fading, faint and few. Then, having
// played it: "the wind needs to move at the same speed it is drawn... they get drawn and erased when they get drawn
// while also moving forward": a stroke is a short piece of line whose head runs along its path at the wind's speed
// while its tail is erased behind it at the same speed, so it lives a second or two. And "i want to be able to see
// wind till this height. but make it fainter as you go down": full far out (ZOOM_FULL and further), fainter as he
// comes down, gone at ZOOM_BEGIN and closer. On by default; `?wind=off` in the address builds nothing at all and the
// game looks exactly as it did before the wind. `?windzoom=<begin>,<full>` tries other distances (pixels a metre, as
// ctx.camera.ppm: bigger is closer in).
//
// The engine: every wind stroke on screen lives in ONE mesh drawn by our own shader in ONE draw call. A stroke's PATH
// is a thin ribbon of PTS points, laid out once when it is born and never rebuilt: traced through the wind where it is
// born (so it bends as the wind bends across the land), and, while the wind is swinging round, curved the way it
// turns (the start on the heading the wind is leaving, the end toward the one it is going to), with a gentle wave.
// Only a short PIECE of the path is ever drawn: the shader runs it along the path from the time (its head at the
// wind's speed, its tail the piece's length behind), so the line travels along the curve as the air does; it tapers
// both ends of the piece, keeps the head brighter than the tail (so the way it goes reads even in a still picture), keeps it a set width in SCREEN pixels whatever the zoom and tilt (never thinner than a
// floor in device pixels), and softens its edges itself (the game draws with screen smoothing off). Strokes float a
// little over the land and over everything on it (no depth test), so a tree never cuts one. A faint cool shadow under
// each stroke (the same mesh, drawn first) lets white read on snow. Births and deaths are counted in real seconds,
// never in frames. Nothing is allocated each frame: the buffers are made once, a birth writes its own slice and marks
// it for upload.
//
// Hidden on the battleground (the mesh lives in ctx.homeLand) and in the ground (walking) view (ctx.walk).
// Less motion (the game's setting or the phone's): nothing travels, fewer and fainter strokes that only fade in and out
// where they are; and the sway does not lean with the wind.
// Otherwise the trees' and the grass's sway leans with the wind and breathes with its gusts (world/shade.js
// SHADE.windDir); with ?wind=off it is the sway it always was.
import * as THREE from '../../vendor/three.module.js';
import { SHADE } from '../world/shade.js';
import { WORLD } from '../config.js';

const SX = WORLD.SIZE_X, SZ = WORLD.SIZE_Z, GY = WORLD.GROUND_Y + 1;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The engine's own numbers
export const WIND_VIEW = {
  // when the lines show (the director: "i want to be able to see wind till this height. but make it fainter as you go
  // down"): the zoom, in pixels a metre (ctx.camera.ppm; the game opens at 6, bigger is closer in), at which they begin
  // to appear (a little closer in than the height in his picture, about 8), and the zoom at which they are fully there
  // (about twice the land of the opening view in sight); fainter evenly between. Nothing closer in than BEGIN.
  ZOOM_BEGIN: 9.5,
  ZOOM_FULL: 4.2,
  MAX: 96,              // strokes alive at once at most (the buffers are made for this many)
  PTS: 32,              // points along one stroke
  LIFT: 2.5,            // blocks above the ground the strokes float
  PHONE: [822, 311],    // the director's phone held sideways (CSS px): counts are for this screen, and scale with its area
  AREA_EXP: 0.75,       // ... by the area's ratio to this power (a big screen gets more, not proportionally more)
  TRIES: 10,            // tries for where a new group is born (the first with room from the living ones)
  UPWIND: 0.2,          // new groups are born this share of their glide upwind, so they pass across the screen
  // the wind turning: strokes born while it swings round curve the way it turns (the director: "they can curve to show
  // wind turning"), by the turn rate times CURVE_S, at most CURVE_MAX degrees from tail to head
  CURVE_S: 20,
  CURVE_MAX: 55,
  // how a stroke travels (the director: "the wind needs to move at the same speed it is drawn"): its head runs along
  // its path at the wind's speed there (sim/wind.js, 0.6 to 4 blocks a game second) times HEAD_K, kept between HEAD_PX
  // screen pixels a second so it always reads as running air; its path is PATH_K times its piece's length
  HEAD_K: 10,
  HEAD_PX: [50, 110],
  PATH_K: [1.3, 1.8],
  EASE: 0.25,           // a soft start and end: the piece fades in over this share of its own length from the path's start
  COLOR: 0xf4eee0,      // warm white (the game's own, report 12)
  NIGHT_COLOR: 0xc9d6ee,// the white at night, cooled toward the moonlight
  NIGHT_FADE: 0.3,      // at full night the strokes are this much fainter
  SHADOW: 0x2e3d5c,     // the cool shadow under each stroke
  SHADOW_BASE: 0.05,    // its strength on green ground (all but invisible)
  SHADOW_SNOW: 0.5,     // and on lying snow, where white needs it to read
  RAIN_ALPHA: 0.9,      // under rain over the whole land
  SHADOW_PX: [0.5, 1.1],// the shadow's offset on screen, CSS px right and down
  REDUCE: { count: 0.5, alpha: 0.55, life: 1.6 }, // less motion: half as many, this faint, this much longer
};
const V = WIND_VIEW;

// ---------------------------------------------------------------------------
// The look, "By hand". Counts are groups on the phone's screen; lengths are shares of the screen's width (limited in
// blocks); widths, spacing and glide are CSS pixels.
export const WIND_LINES = {
  groups: [1.3, 4],        // groups on screen: in a calm, at a full gust (the director: "there is too much wind")
  breathe: 0.8,            // how much the count follows the gusts (1: only gusts; 0: only the steady strength)
  perGroup: [2, 4],        // strokes in a group
  lengthFrac: [0.07, 0.1], // a lead stroke's drawn piece, share of the screen's width (the sketch's "a tenth" at most)
  lengthBlocks: [2.5, 120],// never shorter or longer than this many blocks
  memberLen: [0.62, 1.0],  // the others in a group, times the lead's length (each a different length)
  spacePx: [5, 10],        // sideways spacing inside a group
  fanDeg: 2.5,             // each stroke up to this far off the group's heading
  beat: 0.3,               // the strokes of a group start one after another, this many seconds apart (give or take a third)
  staggerAlong: 0.12,      // and this share of the lead's length further back or forward
  widthPx: 2.5,            // the thickest, full width
  minDevPx: 1.6,           // never thinner than this many device pixels (a hairline floor)
  alpha: 0.52,             // the peak opacity over grass (the director: "more fainter": was 0.64; two thirds of it, 0.43, was lost on the busy land at the far zoom)
  memberAlpha: [0.66, 0.92], // the others in a group, times that
  tailAlpha: 0.5,          // the tail is this bright against the head, so a still picture shows the way it goes
  penVar: 0.3,             // the width swells and thins along the stroke by up to this share, as a pen under a changing hand
  life: [3.4, 4.4],        // seconds a stroke lives under Less motion (when it does not travel)
  wave: [0.03, 0.05],      // the gentle sideways wave, share of the length (a group shares its wave, each a little off)
  waves: [0.8, 1.3],       // waves along a stroke
  waveVary: 0.7,           // how far (radians) each stroke's wave is off its group's
  spread: 0.22,            // new groups need no more room than this share of the screen's width between them
  taper: [0.3, 0.26],      // the tail's taper and the head's, shares of the stroke
  body: 0.62,              // where it is thickest (0 tail .. 1 head)
};
const L = WIND_LINES;
export const WIND_ON = (() => { try { return new URLSearchParams(location.search).get('wind') !== 'off'; } catch { return true; } })();
// ?windzoom=<begin>,<full> (pixels a metre) to try other distances
const zoomPair = () => {
  try {
    const [b, f] = (new URLSearchParams(location.search).get('windzoom') || '').split(',').map(Number);
    if (Number.isFinite(b) && Number.isFinite(f) && b > 0 && f > 0) return [b, f];
  } catch { /* no address */ }
  return [V.ZOOM_BEGIN, V.ZOOM_FULL];
};

// ---------------------------------------------------------------------------
const VERT = /* glsl */ `
precision highp float;
attribute vec3 aPrev;
attribute vec3 aNext;
attribute vec3 aS;        // x side (-1 / +1), y along (0 tail .. 1 head), z layer (0 shadow, 1 the stroke)
attribute vec4 aT;        // x birth (s), y life (s), z width (times the look's), w opacity (times the look's)
attribute vec3 aD;        // x the path's length, y the drawn piece's length (blocks), z a random number
uniform float uTime;
uniform vec2 uRes;        // the drawing buffer, device px
uniform float uPR;        // device px a CSS px
uniform vec4 uW;          // x full width (CSS px), y floor (device px), z the body's place, w reduce (1: less motion)
uniform vec4 uPh;         // z the soft start and end (a share of the piece), w the tail's brightness against the head's
uniform vec3 uTaper;      // x the tail's taper, y the head's, z how much the width swells and thins along (the pen)
uniform vec2 uShOff;      // the shadow's offset, CSS px (x right, y down)
uniform vec3 uEdge;       // the land's size (x, z) and how wide the misty edge is: strokes fade out over it
varying float vA;
varying float vSide;
varying float vHalf;      // half the stroke's width here, device px
varying float vHalfG;     // half the drawn ribbon's width (a little wider, for the soft edge)
varying float vLayer;
void main() {
  float age = uTime - aT.x;
  float t = age / aT.y;
  if ( t <= 0.0 || t >= 1.0 || aT.y <= 0.0 ) { vA = 0.0; gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  float reduce = uW.w;
  mat4 pv = projectionMatrix * viewMatrix;
  vec4 c = pv * vec4( position, 1.0 );
  vec4 p = pv * vec4( aPrev, 1.0 );
  vec4 n = pv * vec4( aNext, 1.0 );
  vec2 half_ = uRes * 0.5;
  vec2 sp = p.xy / p.w * half_, sn = n.xy / n.w * half_;
  vec2 d = sn - sp;
  float dl = length( d );
  d = dl > 1e-5 ? d / dl : vec2( 1.0, 0.0 );
  vec2 nrm = vec2( -d.y, d.x );
  float along = aS.y;
  // the piece: its head runs along the path from its start to past its end over the stroke's life, its tail the
  // piece's length behind; s and the piece in blocks along the path (aD.x the path's length, aD.y the piece's)
  float P = aD.x, Lp = aD.y, s = along * P;
  float head = reduce > 0.5 ? 0.5 * ( P + Lp ) : t * ( P + Lp ), tl = head - Lp;
  float q = ( s - tl ) / max( Lp, 1e-3 );                  // 0 at the piece's tail .. 1 at its head
  if ( q < 0.0 || q > 1.0 ) { vA = 0.0; gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  // a soft start and end: the piece eases in from the path's start and out at its end
  float ends = smoothstep( 0.0, uPh.z * Lp, s ) * ( 1.0 - smoothstep( P - uPh.z * Lp, P, s ) );
  // the piece's own shape: tapered ends, thickest at the body, and a width that swells and thins like a pen
  float tt = smoothstep( 0.0, uTaper.x, q ) * ( 1.0 - smoothstep( 1.0 - uTaper.y, 1.0, q ) );
  float b = uW.z, qq = q < b ? ( b - q ) / max( b, 0.01 ) : ( q - b ) / max( 1.0 - b, 0.01 );
  float prof = tt * ( 0.72 + 0.28 * ( 1.0 - qq * qq ) );
  prof *= 1.0 + uTaper.z * ( 0.6 * sin( s / Lp * 10.0 + aD.z * 6.28 ) + 0.4 * sin( s / Lp * 23.0 + aD.z * 17.0 ) );
  float win = ends;
  float full = max( uW.x * aT.z * uPR, uW.y );           // device px, never under the floor
  float w = full * prof * sqrt( win );
  float hw = 0.5 * w + ( aS.z < 0.5 ? 0.35 * uPR : 0.0 ); // the shadow a little wider
  float hg = hw + 1.0;                                     // one device px more for the soft edge
  vec2 o = nrm * aS.x * hg;
  if ( aS.z < 0.5 ) o += vec2( uShOff.x, -uShOff.y ) * uPR;
  c.xy += o / half_ * c.w;
  gl_Position = c;
  float fade = reduce > 0.5 ? sin( 3.14159265 * t ) : 1.0;
  vec2 wp = position.xz;
  float ed = min( min( wp.x, uEdge.x - wp.x ), min( wp.y, uEdge.y - wp.y ) );
  fade *= smoothstep( uEdge.z * 0.3, uEdge.z * 1.1, ed );
  // the head brighter than the tail: the way it goes reads even in a still picture
  fade *= mix( uPh.w, 1.0, smoothstep( 0.0, 0.85, q ) );
  vA = aT.w * smoothstep( 0.0, 1.0, win ) * fade;
  vSide = aS.x; vHalf = hw; vHalfG = hg; vLayer = aS.z;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uCol;
uniform vec3 uShCol;
uniform vec2 uLook;       // x opacity (the zoom, the season, the night), y shadow strength
varying float vA;
varying float vSide;
varying float vHalf;
varying float vHalfG;
varying float vLayer;
void main() {
  float dist = abs( vSide ) * vHalfG;
  float cov = clamp( vHalf + 0.5 - dist, 0.0, 1.0 ) * clamp( vHalf * 1.6, 0.0, 1.0 );
  float a = vA * cov * uLook.x;
  if ( vLayer < 0.5 ) a *= uLook.y;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vLayer < 0.5 ? uShCol : uCol, a );
}`;

// ---------------------------------------------------------------------------
export function startWind(ctx) {
  if (!WIND_ON) return null;
  const cam = ctx.camera;
  const { MAX, PTS } = V;
  let [zBegin, zFull] = zoomPair();
  const VPS = PTS * 4;                       // vertices a stroke: two layers of two sides
  const NV = MAX * VPS;
  const pos = new Float32Array(NV * 3), prv = new Float32Array(NV * 3), nxt = new Float32Array(NV * 3);
  const aS = new Float32Array(NV * 3), aT = new Float32Array(NV * 4), aD = new Float32Array(NV * 3);
  for (let s = 0; s < MAX; s++) for (let l = 0; l < 2; l++) for (let p = 0; p < PTS; p++) for (let k = 0; k < 2; k++) {
    const v = s * VPS + l * PTS * 2 + p * 2 + k;
    aS[v * 3] = k ? 1 : -1; aS[v * 3 + 1] = p / (PTS - 1); aS[v * 3 + 2] = l;
  }
  // every shadow first, then every stroke, so no shadow falls over another stroke's white
  const idx = new Uint16Array(MAX * 2 * (PTS - 1) * 6);
  let ii = 0;
  for (let l = 0; l < 2; l++) for (let s = 0; s < MAX; s++) for (let p = 0; p < PTS - 1; p++) {
    const v = s * VPS + l * PTS * 2 + p * 2;
    idx[ii++] = v; idx[ii++] = v + 1; idx[ii++] = v + 2;
    idx[ii++] = v + 1; idx[ii++] = v + 3; idx[ii++] = v + 2;
  }
  const g = new THREE.BufferGeometry();
  const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
  const A = { position: dyn(pos, 3), aPrev: dyn(prv, 3), aNext: dyn(nxt, 3), aT: dyn(aT, 4), aD: dyn(aD, 3), aS: dyn(aS, 3) };
  for (const [k, a] of Object.entries(A)) g.setAttribute(k, a);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  // the upload ranges, one reused object per attribute (nothing made each frame)
  const ranges = Object.values(A).map((a) => ({ a, r: { start: 0, count: 0 }, k: a.itemSize }));
  let dirtyLo = Infinity, dirtyHi = -1;

  // (the colours are written as they are: a ShaderMaterial without the colour-space include leaves them in sRGB)
  const nightRGB = rgb(V.NIGHT_COLOR), dayRGB = rgb(V.COLOR);
  const U = {
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(822, 311) }, uPR: { value: 1 },
    uW: { value: new THREE.Vector4(L.widthPx, L.minDevPx, L.body, 0) }, uPh: { value: new THREE.Vector4(0, 0, V.EASE, L.tailAlpha) },
    uTaper: { value: new THREE.Vector3(L.taper[0], L.taper[1], L.penVar) }, uEdge: { value: new THREE.Vector3(SX, SZ, WORLD.EDGE_FADE) },
    uShOff: { value: new THREE.Vector2(V.SHADOW_PX[0], V.SHADOW_PX[1]) },
    uCol: { value: new THREE.Vector3(...dayRGB) }, uShCol: { value: new THREE.Vector3(...rgb(V.SHADOW)) },
    uLook: { value: new THREE.Vector2(1, V.SHADOW_BASE) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: U,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, // (a ribbon's winding follows its way on screen)
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 60; mesh.userData.noPick = true; mesh.name = 'wind-lines';
  (ctx.homeLand ?? ctx.layers.entities).add(mesh);
  try { ctx.renderer.gl.compile(mesh, ctx.renderer.camera, ctx.scene); } catch (err) { console.warn('[wind] compile', err); }

  // ---- the strokes on the CPU: only what a birth needs ----
  const ends = new Float64Array(MAX);     // when each slot's stroke ends (0: free)
  const gx = new Float32Array(MAX), gz = new Float32Array(MAX); // its group's centre, for spacing new groups
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  let seed = 0x9e3779b9;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const between = (r) => r[0] + (r[1] - r[0]) * rand();

  // where the land is (the sim's ground heights; the flat ground before it is there)
  const groundAt = (x, z) => {
    const land = ctx.modules.sim?.dev?.S?.land;
    const xi = Math.max(0, Math.min(SX - 1, Math.floor(x))), zi = Math.max(0, Math.min(SZ - 1, Math.floor(z)));
    return land?.top ? land.top[xi + zi * SX] + 1 : GY;
  };
  const smoothGround = (x, z) => (groundAt(x - 2, z - 2) + groundAt(x + 2, z - 2) + groundAt(x - 2, z + 2) + groundAt(x + 2, z + 2)) * 0.25;

  // ---- the screen and the ground (all with reused vectors) ----
  const v1 = new THREE.Vector3(), vd = new THREE.Vector3();
  // CSS px on screen of world (x, y, z) into out[0], out[1]
  function toScreen(x, y, z, out) {
    v1.set(x, y, z).project(cam.cam);
    out[0] = (v1.x + 1) / 2 * innerWidth; out[1] = (1 - v1.y) / 2 * innerHeight;
    return out;
  }
  // a screen point (CSS px) onto the plane y = h: into out { x, z }
  function onGround(px, py, h, out) {
    const c = cam.cam;
    v1.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1, -1).unproject(c);
    c.getWorldDirection(vd);
    if (Math.abs(vd.y) < 1e-6) return null;
    const t = (h - v1.y) / vd.y;
    out.x = v1.x + vd.x * t; out.z = v1.z + vd.z * t;
    return out;
  }
  // screen px a block of ground covers along the way (ux, uz), at (x, y, z)
  const s1 = [0, 0], s2 = [0, 0];
  function pxPerBlock(x, y, z, ux, uz) {
    toScreen(x, y, z, s1); toScreen(x + ux, y, z + uz, s2);
    return Math.max(0.05, Math.hypot(s2[0] - s1[0], s2[1] - s1[1]));
  }

  // ---- the wind, read from the simulation (into reused objects) ----
  const wMain = { dir: 0, speed: 1, gust: 0, strength: 0.5, mood: 0.5, turn: 0 }, wHere = { dir: 0, speed: 1, gust: 0, strength: 0.5 };
  let D = null;
  const dev = () => (D ??= ctx.modules.sim?.ask?.('wind:dev') ?? null);
  const readMain = () => { dev()?.main(wMain); return wMain; };
  const readAt = (x, z) => { if (dev()) D.at(x, z, wHere); else { wHere.dir = wMain.dir; wHere.gust = wMain.gust; wHere.strength = wMain.strength; } return wHere; };

  // ---- the path of one stroke ----
  const PX = new Float32Array(PTS), PZ = new Float32Array(PTS), PY = new Float32Array(PTS), HX = new Float32Array(PTS), HZ = new Float32Array(PTS), AL = new Float32Array(PTS);
  // trace PTS points from (x, z) through the wind for len blocks: the heading is the wind's where each point is, plus
  // fan, plus the turn's curve (curve radians from tail to head: the tail on the heading the wind is leaving)
  function trace(x, z, len, fan, curve) {
    const h = len / (PTS - 1);
    for (let i = 0; i < PTS; i++) {
      PX[i] = x; PZ[i] = z;
      const bendHere = fan + curve * (i / (PTS - 1) - 0.5);
      let a = readAt(x, z).dir + bendHere;
      HX[i] = Math.cos(a); HZ[i] = Math.sin(a);
      // a midpoint step, so the path follows the bends smoothly
      const mx = x + Math.cos(a) * h * 0.5, mz = z + Math.sin(a) * h * 0.5;
      a = readAt(mx, mz).dir + fan + curve * ((i + 0.5) / (PTS - 1) - 0.5);
      x += Math.cos(a) * h; z += Math.sin(a) * h;
    }
  }
  let pathLen = 0, lifeAvg = 1.8;
  function makePath(x, z, len, fan, curve, amp, nw, ph) {
    trace(x, z, len, fan, curve);
    // the gentle wave, sideways to the path, fading at its ends
    for (let i = 0; i < PTS; i++) {
      const s = i / (PTS - 1);
      const off = amp * len * Math.sin(ph + s * nw * Math.PI * 2) * Math.sin(Math.PI * Math.min(1, s * 1.15)) ** 0.5;
      PX[i] += -HZ[i] * off; PZ[i] += HX[i] * off;
    }
    // heights, and how far along each point is (by length, so the taper and the pen follow the true stroke)
    let total = 0;
    AL[0] = 0;
    for (let i = 1; i < PTS; i++) { total += Math.hypot(PX[i] - PX[i - 1], PZ[i] - PZ[i - 1]); AL[i] = total; }
    pathLen = total;
    const y0 = smoothGround(PX[0], PZ[0]), y1 = smoothGround(PX[PTS - 1], PZ[PTS - 1]), ym = smoothGround(PX[PTS >> 1], PZ[PTS >> 1]);
    for (let i = 0; i < PTS; i++) {
      const s = total > 0 ? AL[i] / total : i / (PTS - 1);
      AL[i] = s;
      // a smooth arc over the ground under its ends and middle: the stroke glides over the land, never bumps on it
      const y = s < 0.5 ? y0 + (ym - y0) * (s * 2) : ym + (y1 - ym) * ((s - 0.5) * 2);
      PY[i] = Math.max(y, Math.max(y0, y1, ym) - 3) + V.LIFT;
    }
  }
  // write the path into slot k's vertices
  function writeSlot(k, birth, life, wK, aK, pathL, piece, rnd) {
    const base = k * VPS;
    for (let l = 0; l < 2; l++) for (let p = 0; p < PTS; p++) {
      const pa = Math.max(0, p - 1), pb = Math.min(PTS - 1, p + 1);
      for (let s = 0; s < 2; s++) {
        const v = base + l * PTS * 2 + p * 2 + s, v3 = v * 3, v4 = v * 4;
        pos[v3] = PX[p]; pos[v3 + 1] = PY[p]; pos[v3 + 2] = PZ[p];
        prv[v3] = PX[pa]; prv[v3 + 1] = PY[pa]; prv[v3 + 2] = PZ[pa];
        nxt[v3] = PX[pb]; nxt[v3 + 1] = PY[pb]; nxt[v3 + 2] = PZ[pb];
        aT[v4] = birth; aT[v4 + 1] = life; aT[v4 + 2] = wK; aT[v4 + 3] = aK;
        aD[v3] = pathL; aD[v3 + 1] = piece; aD[v3 + 2] = rnd;
        aS[v3 + 1] = AL[p]; // how far along: fixed per point, but the path's true length is not
      }
    }
    dirtyLo = Math.min(dirtyLo, base); dirtyHi = Math.max(dirtyHi, base + VPS);
  }
  // the slots written this frame go up in one range per attribute
  function upload() {
    if (dirtyHi < 0) return;
    for (const R of ranges) {
      R.r.start = dirtyLo * R.k; R.r.count = (dirtyHi - dirtyLo) * R.k;
      R.a.updateRanges.length = 0; R.a.updateRanges.push(R.r); R.a.needsUpdate = true;
    }
    dirtyLo = Infinity; dirtyHi = -1;
  }
  const freeSlot = (t) => { for (let k = 0; k < MAX; k++) if (ends[k] <= t) return k; return -1; };

  // ---- where a new group is born: inside the screen, a little upwind, away from the living ones ----
  const cand = { x: 0, z: 0 };
  let reduce = false;
  function pickPlace(t, ux, uz) {
    let best = -1, bx = 0, bz = 0;
    const ppm = Math.max(0.3, cam.ppm || 6);
    // how far a group glides in its life, in CSS px; it is born a share of that upwind (on screen)
    toScreen(cam.target.x, GY, cam.target.z, s1); toScreen(cam.target.x + ux, GY, cam.target.z + uz, s2);
    const sdx = s2[0] - s1[0], sdy = s2[1] - s1[1], sl = Math.hypot(sdx, sdy) || 1;
    const glide = reduce ? 0 : innerWidth * between(L.lengthFrac) * 2 * V.UPWIND; // about a path's length, on screen
    for (let k = 0; k < V.TRIES; k++) {
      const px = Math.max(0.03, Math.min(0.97, 0.04 + 0.92 * rand() - (sdx / sl) * glide / innerWidth)) * innerWidth;
      const py = Math.max(0.05, Math.min(0.95, 0.06 + 0.88 * rand() - (sdy / sl) * glide / innerHeight)) * innerHeight;
      if (!onGround(px, py, GY, cand)) continue;
      const e = WORLD.EDGE_FADE;
      if (cand.x < e || cand.z < e || cand.x > SX - e || cand.z > SZ - e) continue; // never born in the misty edge
      let d = 1e9;
      for (let j = 0; j < MAX; j++) if (ends[j] > t) d = Math.min(d, Math.hypot(gx[j] - cand.x, gz[j] - cand.z));
      // enough room is enough: the first place with room will do (furthest-first would push the few groups to the
      // screen's edges); with no such place, the roomiest tried
      d *= ppm;
      if (d >= L.spread * innerWidth) { best = d; bx = cand.x; bz = cand.z; break; }
      if (d > best) { best = d; bx = cand.x; bz = cand.z; }
    }
    if (best < 0) return null;
    cand.x = bx; cand.z = bz;
    return cand;
  }

  // ---- one group of strokes, drawn one stroke after another ----
  const stats = { born: 0, groups: 0, live: 0, cpuMs: 0, skipped: 0, curved: 0, zoomFade: 0, headPx: 0, headBlocks: 0, get life() { return lifeAvg; } };
  const sides = new Float32Array(8);
  function spawnGroup(t) {
    const m = readMain();
    const at = pickPlace(t, Math.cos(m.dir), Math.sin(m.dir));
    if (!at) { stats.skipped++; return; }
    const cx = at.x, cz = at.z;
    const w = readAt(cx, cz);
    const dir = w.dir, dx = Math.cos(dir), dz = Math.sin(dir), px_ = -dz, pz_ = dx;
    const y = smoothGround(cx, cz) + V.LIFT;
    const kA = pxPerBlock(cx, y, cz, dx, dz), kP = pxPerBlock(cx, y, cz, px_, pz_);
    const n = Math.min(sides.length, Math.round(between([L.perGroup[0] - 0.49, L.perGroup[1] + 0.49])));
    let lead = between(L.lengthFrac) * innerWidth / kA;
    lead = Math.max(L.lengthBlocks[0], Math.min(L.lengthBlocks[1], lead));
    // the head runs at the wind's speed here, in blocks a second, kept within HEAD_PX on screen
    const vHead = Math.max(V.HEAD_PX[0] / kA, Math.min(V.HEAD_PX[1] / kA, w.speed * V.HEAD_K));
    stats.headPx = vHead * kA; stats.headBlocks = vHead;
    // the wind turning: the group curves the way it turns (none while it holds its heading)
    const curve = reduce ? 0 : Math.max(-V.CURVE_MAX, Math.min(V.CURVE_MAX, (m.turn || 0) * V.CURVE_S)) * DEG;
    if (Math.abs(curve) > 5 * DEG) stats.curved++;
    // the group's shared wave
    const amp = between(L.wave), nw = between(L.waves), gPh = rand() * Math.PI * 2;
    // sideways places: spread round the group's line, unevenly
    let side = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) side += (between(L.spacePx) / kP) * (i % 2 ? 1 : -1) * (i > 1 ? 2 : 1);
      sides[i] = side;
    }
    let beatT = 0;
    for (let i = 0; i < n; i++) {
      const k = freeSlot(t);
      if (k < 0) { stats.skipped++; break; }
      const piece = i === 0 ? lead : lead * between(L.memberLen);
      const path = piece * between(V.PATH_K);
      const back = i === 0 ? 0 : (rand() - 0.5) * 2 * L.staggerAlong * lead;
      const sx = cx + px_ * sides[i] - dx * (path / 2 + back), sz = cz + pz_ * sides[i] - dz * (path / 2 + back);
      makePath(sx, sz, path, (rand() - 0.5) * 2 * L.fanDeg * DEG, curve, amp, nw * (0.92 + 0.16 * rand()), gPh + (rand() - 0.5) * L.waveVary);
      // one after another, a beat apart
      if (i > 0) beatT += L.beat * (0.67 + 0.66 * rand());
      // its life: the head runs the path and the piece after it at the wind's speed (still, under Less motion)
      const life = reduce ? between(L.life) * V.REDUCE.life : (pathLen + piece) / vHead;
      lifeAvg = lifeAvg * 0.9 + life * 0.1;
      const aK = L.alpha * (i === 0 ? 1 : between(L.memberAlpha)) * (reduce ? V.REDUCE.alpha : 1);
      writeSlot(k, t + beatT, life, i === 0 ? 1 : 0.8 + 0.2 * rand(), aK, pathLen, piece, rand());
      ends[k] = t + beatT + life; gx[k] = cx; gz[k] = cz;
      stats.born++;
    }
    stats.groups++;
    lastGx = cx; lastGz = cz;
  }
  let lastGx = 0, lastGz = 0;

  // how much of the lines the zoom lets show: 0 at ZOOM_BEGIN and closer in, 1 at ZOOM_FULL and further out
  const zoomFade = () => {
    const ppm = cam.ppm || 6;
    if (zBegin <= zFull) return ppm <= zFull ? 1 : 0;
    // evenly fainter as he comes down (straight in the zoom, so it starts from nothing with no pop)
    return Math.max(0, Math.min(1, (zBegin - ppm) / (zBegin - zFull)));
  };

  // ---- each frame ----
  let acc = 0, visibleWas = false;
  const motion = () => {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches || !!ctx.modules.ui?.settings?.reduceMotion; } catch { return false; }
  };
  let motionT = 0;
  ctx.frame.push((dt) => {
    const c0 = performance.now();
    // (ctx.walk is the walker itself, view/walk.js, until the screen's walking part takes the name, ui/walk.js)
    const wk = ctx.walk, walking = !!(wk && (wk.active || wk.on || wk.walker?.active));
    const shown = ctx.homeLand.visible && !walking;
    mesh.visible = shown;
    if (!shown) { SHADE.windDir.value.w = 0; if (visibleWas) api.clear(); visibleWas = false; return; }
    visibleWas = true;
    const t = now();
    U.uTime.value = t;
    // less motion: asked twice a second (the setting can change while playing)
    if ((motionT -= dt) <= 0) {
      motionT = 0.5;
      const r = motion();
      if (r !== reduce) { reduce = r; U.uW.value.w = r ? 1 : 0; api.clear(); }
    }
    const m = readMain();
    // the sway leans with the wind and breathes with its gusts (not under Less motion: then it sways as it always did)
    SHADE.windDir.value.set(Math.cos(m.dir), Math.sin(m.dir), m.gust, reduce ? 0 : 1);
    // the zoom, the night, snow, rain
    const zk = zoomFade();
    stats.zoomFade = zk;
    const sim = ctx.modules.sim, wx = sim?.ask?.('weather');
    const night = SHADE.night.value || 0, snow = wx?.cover ?? 0, rain = wx?.kind === 'rain' && !wx.local ? wx.amount : 0;
    U.uLook.value.set(zk * (1 - V.NIGHT_FADE * night) * (1 - (1 - V.RAIN_ALPHA) * rain), (V.SHADOW_BASE + (V.SHADOW_SNOW - V.SHADOW_BASE) * snow) * (1 - night));
    const nk = Math.min(1, night * 0.8);
    U.uCol.value.set(dayRGB[0] + (nightRGB[0] - dayRGB[0]) * nk, dayRGB[1] + (nightRGB[1] - dayRGB[1]) * nk, dayRGB[2] + (nightRGB[2] - dayRGB[2]) * nk);
    // how many groups the screen wants now, and so how often one is born (none while zoomed in too close)
    if (zk > 0) {
      const drive = L.breathe * m.gust + (1 - L.breathe) * Math.min(1, m.strength / 0.85);
      const area = Math.max(0.5, Math.min(4, ((innerWidth * innerHeight) / (V.PHONE[0] * V.PHONE[1])) ** V.AREA_EXP));
      const want = (L.groups[0] + (L.groups[1] - L.groups[0]) * drive) * area * (reduce ? V.REDUCE.count : 1);
      const lifeMean = (reduce ? (L.life[0] + L.life[1]) / 2 * V.REDUCE.life : lifeAvg) + 0.3; // + the beat between strokes
      acc += Math.min(0.25, dt) * want / lifeMean;
      let n = 0;
      while (acc >= 1 && n < 3) { acc -= 1; spawnGroup(t); n++; }
      if (acc > 2) acc = 2;
    } else acc = 0;
    upload();
    U.uRes.value.set(ctx.renderer.gl.domElement.width, ctx.renderer.gl.domElement.height);
    U.uPR.value = ctx.renderer.gl.domElement.width / Math.max(1, innerWidth);
    let live = 0;
    for (let k = 0; k < MAX; k++) if (ends[k] > t) live++;
    stats.live = live;
    stats.cpuMs = stats.cpuMs * 0.95 + (performance.now() - c0) * 0.05;
  });

  const api = {
    stats, mesh,
    get zoom() { return [zBegin, zFull]; },
    // try other distances live (as ?windzoom=): begin, full in pixels a metre
    setZoom(begin, full) { if (begin > 0 && full > 0) { zBegin = begin; zFull = full; } return [zBegin, zFull]; },
    // where the living groups are on screen now (CSS px; for the look pictures)
    onScreen() {
      const t = now(), out = [];
      for (let k = 0; k < MAX; k++) if (ends[k] > t) { toScreen(gx[k], smoothGround(gx[k], gz[k]) + V.LIFT, gz[k], s1); out.push([Math.round(s1[0]), Math.round(s1[1])]); }
      return out;
    },
    // where the newest group was born, on screen now (CSS px; for the look pictures)
    lastGroup() { toScreen(lastGx, smoothGround(lastGx, lastGz) + V.LIFT, lastGz, s1); return [Math.round(s1[0]), Math.round(s1[1])]; },
    clear() { ends.fill(0); for (let i = 0; i < NV; i++) aT[i * 4 + 1] = 0; dirtyLo = 0; dirtyHi = NV; acc = 0; },
  };
  ctx.windLines = api;
  return api;
}

function rgb(h) { return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }
