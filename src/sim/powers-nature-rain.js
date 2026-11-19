// A. What the god's rain looks like (powers-nature.js "rain"). One small pool
// of meshes that share a single geometry: every streak and splash is a quad
// placed entirely in the vertex shader (seeds tiled over the box round the
// view and kept inside the rain's disc, falling on real time, landing on the
// real ground read from a height texture), so a downpour over a quarter of the
// map is one draw call, as thick on screen as a small one, and nothing is
// allocated per frame. The ground under it is darkened by a cloud's shadow,
// goes dark and rich as it wets, and puddles gather in its hollows: that is the
// world's own shader (world/shade.js, the `wet` slots), fed from here. Never a
// haze: outside the ring nothing changes, inside it the land only gets less light.
// The rain follows its cloud (sim/season.js rainCloud: it drifts with the wind
// while it falls) and lives by the cloud's own age in game seconds, so it is
// where the rules say it is: it falls for cloud.fall, then its ground dries
// where it stopped until cloud.keep. The streaks lean with the cloud's wind
// (view/rain-look.js). Sound: the bus gets `sfx:play { name: 'rain.start' | 'rain.end', x, z, r }`.
import * as THREE from '../../vendor/three.module.js';
import { SHADE, WET_SLOTS } from '../world/shade.js';
import { SX, SZ, X0, Z0, X1, Z1 } from '../edit/vox.js';
import { leanFor, easeLean, viewBox, GLSL_TILE } from '../view/rain-look.js';

export const RAIN_FX = {
  FALL_S: 9,        // game seconds the rain falls, when its cloud does not say
  DRY_S: 32,        // then the ground dries over this long (puddles shrink first)
  STREAKS: 4000,    // streaks over the box round the view (those inside the rain show)
  SPLASHES: 1200,
  SPAN: 18,         // metres the streaks fall
  SLOTS: WET_SLOTS - 1, // the god's rains at once (the last wet slot is the seasons' shower's)
};

const VERT = /* glsl */ `
attribute vec4 seed;
uniform vec3 uC;          // x, z, radius
uniform float uT, uA, uSpan, uMpp;
uniform vec4 uBox;        // the box round the view the seeds tile over
uniform vec4 uB;          // the world's bounds x0 z0 x1 z1
uniform vec2 uLean;       // the wind's slant (view/rain-look.js)
uniform sampler2D uH;     // r: surface height, g: water
uniform vec4 uHBox;       // x0, z0, sx, sz
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
  vec2 xz = rainTile( seed.xy, uBox );
  vec2 o = xz - uC.xy;
  float rr = length( o ), an = atan( o.y, o.x );
  float rim = uC.z * ( 1.0 + 0.05 * sin( an * 3.0 + uC.z ) + 0.035 * sin( an * 7.0 - uC.z * 0.7 ) );
  float bd = min( min( xz.x - uB.x, uB.z - xz.x ), min( xz.y - uB.y, uB.w - xz.y ) );
  float edge = ( 1.0 - smoothstep( rim * 0.75, rim, rr ) * 0.7 ) * step( rr, rim ) * smoothstep( -8.0, 16.0, bd );
  if ( edge < 0.01 || uA < 0.002 ) { vAlpha = 0.0; gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  float g = groundAt( xz );
  vec3 p;
  if ( vKind < 0.5 ) {
    // a streak: falls from the cloud to the ground, leaning with the wind
    float speed = 19.0 + seed.w * 7.0;
    float h = mod( seed.w * uSpan * 13.0 - uT * speed, uSpan );
    vec3 fall = vec3( -uLean.x, 1.0, -uLean.y );
    p = vec3( xz.x, g, xz.y ) + fall * h;
    // sized in screen pixels (the god's camera is orthographic): a hairline, a short dash
    vec3 toCam = isOrthographic ? vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] ) : cameraPosition - p;
    vec3 side = normalize( cross( fall, toCam ) );
    float w = max( 0.025, uMpp * 0.75 ), len = 0.45 + seed.z * 0.3 + uMpp * ( 9.0 + seed.x * 6.0 );
    p += side * position.x * w + fall * position.y * len;
    vAlpha = uA * edge * smoothstep( uSpan, uSpan - 5.0, h ) * ( 0.55 + 0.45 * seed.y );
  } else {
    // a splash: a ring that opens on the ground and fades, over and over
    float ph = fract( uT * ( 1.1 + seed.w * 0.9 ) + seed.z * 7.3 );
    float s = max( 0.1 + ph * 0.32, uMpp * ( 2.0 + ph * 5.0 ) );
    p = vec3( xz.x + position.x * s, g + 0.03, xz.y + ( position.y * 2.0 - 1.0 ) * s );
    vAlpha = uA * edge * ( 1.0 - ph );
  }
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}`;
const FRAG = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
varying float vKind;
void main() {
  float a;
  if ( vKind < 0.5 ) a = vAlpha * 0.42 * ( 1.0 - abs( vUv.x ) * 0.6 ) * ( 0.35 + 0.65 * vUv.y );
  else { float d = length( vec2( vUv.x, vUv.y * 2.0 - 1.0 ) ); a = vAlpha * 0.7 * smoothstep( 0.55, 0.8, d ) * ( 1.0 - smoothstep( 0.82, 1.0, d ) ); }
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( vKind < 0.5 ? vec3( 0.80, 0.87, 0.94 ) : vec3( 0.86, 0.91, 0.96 ), a );
}`;

// one geometry for every downpour: streaks then splashes, each a quad of four corners
function makeGeometry() {
  const n = RAIN_FX.STREAKS + RAIN_FX.SPLASHES;
  const pos = new Float32Array(n * 12), seed = new Float32Array(n * 16), index = new Uint16Array(n * 6);
  const C = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  let r = 0x5bd1e995; // a fixed sequence (no randomness taken from the game's own)
  const rand = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return ((r >>> 0) % 100000) / 100000; };
  for (let q = 0; q < n; q++) {
    const kind = q < RAIN_FX.STREAKS ? 0 : 1;
    const s = [rand(), rand(), rand(), rand()];
    for (let v = 0; v < 4; v++) {
      const o = (q * 4 + v);
      pos[o * 3] = C[v][0]; pos[o * 3 + 1] = C[v][1]; pos[o * 3 + 2] = kind;
      seed.set(s, o * 4);
    }
    index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

export function makeRainFx(ctx, S) {
  const events = ctx.events;
  let geo = null, hTex = null, hData = null;
  const slots = [];         // { mesh, mat, cloud, live, born, lean, tLast }
  const box = new THREE.Vector4();
  const bounds = new THREE.Vector4(X0, Z0, X1, Z1);

  // the ground's height (and where water is), read by the streaks and the puddles; refreshed when a rain starts
  function heights() {
    const land = S.land, n = SX * SZ;
    if (!hData || hData.length !== n * 2) {
      hData = new Uint8Array(n * 2);
      hTex?.dispose();
      hTex = new THREE.DataTexture(hData, SX, SZ, THREE.RGFormat, THREE.UnsignedByteType);
      hTex.magFilter = hTex.minFilter = THREE.NearestFilter;
      hTex.unpackAlignment = 1;
      hTex.generateMipmaps = false;
    }
    for (let i = 0; i < n; i++) {
      const w = land.wet[i];
      hData[i * 2] = Math.max(0, Math.min(254, land.top[i] + w));
      hData[i * 2 + 1] = w ? 255 : 0;
    }
    hTex.needsUpdate = true;
    box.set(X0, Z0, SX, SZ);
    SHADE.wetTex.value = hTex;
    SHADE.wetBox.value.copy(box);
  }
  let seq = 0;
  function slot() {
    let s = slots.find((x) => !x.live);
    if (!s && slots.length < RAIN_FX.SLOTS) {
      geo ??= makeGeometry();
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        uniforms: { uC: { value: new THREE.Vector3() }, uT: { value: 0 }, uA: { value: 0 }, uSpan: { value: RAIN_FX.SPAN }, uMpp: { value: 0.1 },
          uBox: { value: new THREE.Vector4(0, 0, 300, 300) }, uB: { value: bounds }, uLean: { value: new THREE.Vector2(0.14, 0.05) }, uH: { value: null }, uHBox: { value: box } },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
      mesh.userData.noPick = true;
      s = { mesh, mat, i: slots.length, live: false, born: 0, n: 0, lean: { x: 0, y: 0 }, tLast: 0 };
      mesh.onBeforeRender = () => tick(s);
      ctx.layers.entities.add(mesh);
      slots.push(s);
    }
    // all in use: the oldest gives way
    if (!s) s = slots.reduce((a, b) => (a.n < b.n ? a : b));
    return s;
  }
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ageOf = (s) => (s.cloud.standalone ? (performance.now() - s.born) / 1000 : s.cloud.age ?? 0);
  // per rendered frame: the streaks' fall runs on real time (rain keeps falling while time is paused), its life on
  // the cloud's game seconds; it is drawn where the cloud is now. No allocation.
  function tick(s) {
    const c = s.cloud, now = performance.now();
    const t = ageOf(s), F = c.fall ?? RAIN_FX.FALL_S, D = (c.keep ?? F + RAIN_FX.DRY_S) - F;
    const fall = ss(0, 0.8, t) * (1 - ss(F - 1.6, F, t));
    const shadow = ss(0, 1.4, t) * (1 - ss(F - 0.5, F + 3, t));
    const wet = t < F ? ss(0.4, 4, t) : 1 - ss(F, F + D, t);
    const u = s.mat.uniforms;
    u.uT.value = ((now - s.born) / 1000) % 3600;
    u.uA.value = fall;
    u.uMpp.value = 1 / Math.max(0.5, ctx.camera?.ppm || 10);
    u.uC.value.set(c.x, c.z, c.r);
    viewBox(ctx.camera, RAIN_FX.SPAN, u.uBox.value);
    leanFor(c.dir ?? 0, c.speed ?? 0, s.lean);
    easeLean(u.uLean.value, s.lean, (now - s.tLast) / 1000);
    s.tLast = now;
    SHADE.wet.value[s.i].x = c.x; SHADE.wet.value[s.i].y = c.z;
    SHADE.wetAmt.value[s.i].set(shadow, wet, 0, 0);
    if (s.live && t > F && !s.ended) { s.ended = true; events?.emit('sfx:play', { name: 'rain.end', x: c.x, z: c.z, r: c.r }); }
    if (t > F + D) end(s);
  }
  function end(s) {
    s.live = false; s.mesh.visible = false;
    SHADE.wet.value[s.i].set(0, 0, 0, 0);
    SHADE.wetAmt.value[s.i].set(0, 0, 0, 0);
    // (the seasons' shower keeps the last slot on while it rains: view/seasons.js sets wetN every frame it needs)
    SHADE.wetN.value = slots.reduce((m, x) => (x.live ? Math.max(m, x.i + 1) : m), 0);
  }
  // a downpour from a cloud { x, z, r, fall, keep, age, dir, speed } (sim/season.js rainCloud moves it)
  function rain(cloud) {
    heights();
    const s = slot();
    s.live = true; s.ended = false; s.born = performance.now(); s.tLast = s.born; s.n = ++seq; s.cloud = cloud;
    s.mat.uniforms.uC.value.set(cloud.x, cloud.z, cloud.r);
    s.mat.uniforms.uH.value = hTex;
    leanFor(cloud.dir ?? 0, cloud.speed ?? 0, s.lean);
    s.mat.uniforms.uLean.value.set(s.lean.x, s.lean.y);
    s.mesh.visible = true;
    SHADE.wet.value[s.i].set(cloud.x, cloud.z, cloud.r, Math.random() * 50);
    SHADE.wetAmt.value[s.i].set(0, 0, 0, 0);
    SHADE.wetN.value = Math.max(SHADE.wetN.value, s.i + 1);
    events?.emit('sfx:play', { name: 'rain.start', x: cloud.x, z: cloud.z, r: cloud.r });
  }
  // the rains falling now (for the console and checks): where each cloud is now
  const falling = () => slots.filter((s) => s.live && ageOf(s) < (s.cloud.fall ?? RAIN_FX.FALL_S)).map((s) => ({ x: s.cloud.x, z: s.cloud.z, r: s.cloud.r }));
  return { rain, falling, slots };
}
