// The small spinning Earth in island A (the director, 2026-11-12: "a small
// globe earth that is spinning ... realistic, not the voxel style"). A real
// sphere in its own little WebGL canvas: a day surface, a drifting cloud
// layer, a soft blue atmosphere rim, a lit side and a dark side with a soft
// terminator, and the Earth's tilt. It turns with game time (faster when the
// years run fast, barely at all in slowed time, still when paused), drifts
// very slowly in creation, and its lit face carries day and night from
// sim.stats.daylight. It renders only when something changed, from the HUD's
// own frame hook (so it stops with a hidden tab).
// Texture: game/assets/earth/earth_day.jpg (NASA Blue Marble, equirectangular), with its dark seas
// lifted to a clear blue in the shader. If it fails, a procedural Earth is drawn instead. The clouds are
// procedural (with a faint shadow on the ground); CLOUD_MAP is the hook for a real cloud map later.

const TILT = 23.4 * Math.PI / 180;
const TURN_YEARS = 6;          // one full turn every 6 game years
const IDLE = (Math.PI * 2) / 150; // creation: one turn every 150 real seconds
const CLOUD_MAP = null;          // e.g. 'earth_clouds.jpg' once a real cloud map is in game/assets/earth/

const NOISE = `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  // cloud cover at a point of the cloud shell (unit vector u): swirling warped bands, densest near the
  // equator and at mid latitudes, thin over the poles' edges and the dry belts
  float cloudAt(vec3 u, float drift) {
    vec3 p = u * 2.6 + vec3(drift, 0.0, -drift * 0.5);
    vec3 w = vec3(fbm(p + vec3(4.2, 1.1, 0.0)), fbm(p + vec3(0.3, 7.9, 2.2)), fbm(p + vec3(6.1, 0.4, 3.3)));
    float c = fbm(p + 1.9 * w);
    float lat = abs(u.y);
    float band = 0.78 + 0.22 * exp(-lat * lat * 30.0) + 0.16 * exp(-pow((lat - 0.72) * 5.0, 2.0)) - 0.12 * exp(-pow((lat - 0.42) * 7.0, 2.0));
    return clamp(smoothstep(0.41, 0.64, c * band) * 0.92 + smoothstep(0.58, 0.80, fbm(p * 2.7 + w)) * 0.3, 0.0, 1.0);
  }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
`;
// the moon: a dim cool light from the front right, used only on the night side
const MOON = `
  const vec3 MOON_DIR = vec3(0.52, 0.30, 0.80);
  const vec3 MOON_TINT = vec3(0.42, 0.55, 0.95);
`;
const VERT = `
  varying vec3 vN; varying vec3 vP; varying vec2 vUv;
  void main() {
    vUv = uv; vP = position;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const EARTH_FRAG = `
  uniform sampler2D day; uniform float hasDay; uniform vec3 sun; uniform float cloudRot; uniform float drift; uniform float hasClouds; uniform float night;
  varying vec3 vN; varying vec3 vP; varying vec2 vUv;
  ${NOISE}
  ${MOON}
  vec3 procedural(vec3 p, out float water) {
    vec3 q = p * 1.5 + vec3(3.1, 0.0, 1.3);
    vec3 w = vec3(fbm(q + vec3(1.7, 9.2, 0.0)), fbm(q + vec3(8.3, 2.8, 4.1)), fbm(q + vec3(0.0, 5.5, 7.7)));
    float c = fbm(q + 1.6 * w);
    float land = smoothstep(0.515, 0.535, c);
    water = 1.0 - land;
    float lat = abs(p.y);
    vec3 deep = vec3(0.02, 0.10, 0.24), shallow = vec3(0.05, 0.25, 0.42);
    vec3 sea = mix(deep, shallow, smoothstep(0.40, 0.52, c));
    float dry = smoothstep(0.15, 0.35, lat) * (1.0 - smoothstep(0.42, 0.55, lat));
    float v = fbm(p * 6.0);
    vec3 green = mix(vec3(0.13, 0.27, 0.10), vec3(0.24, 0.36, 0.15), v);
    vec3 tan = mix(vec3(0.55, 0.45, 0.29), vec3(0.70, 0.60, 0.42), v);
    vec3 ground = mix(green, tan, clamp(dry * 1.3 + (c - 0.6) * 2.0, 0.0, 1.0));
    vec3 col = mix(sea, ground, land);
    float ice = smoothstep(0.80, 0.86, lat + (v - 0.5) * 0.08);
    return mix(col, vec3(0.92, 0.94, 0.96), ice);
  }
  void main() {
    vec3 n = normalize(vN);
    float water;
    vec3 base;
    if (hasDay > 0.5) {
      base = texture2D(day, vUv).rgb;
      // the Blue Marble's seas are a very dark navy: find them by that colour and lift them to a clear mid blue
      float lum = dot(base, vec3(0.3, 0.5, 0.2));
      water = smoothstep(0.02, 0.07, base.b - max(base.r, base.g * 0.9)) * (1.0 - smoothstep(0.22, 0.32, lum));
      vec3 sea = vec3(0.035, 0.17, 0.38) * (0.8 + 2.6 * base.b) + vec3(0.0, 0.06, 0.07) * smoothstep(0.10, 0.25, base.g);
      base = mix(base, sea, water);
    } else base = procedural(normalize(vP), water);
    float d = dot(n, sun);
    float lit = smoothstep(-0.18, 0.28, d);
    // the clouds' faint shadow, from the same cover the cloud shell draws (it turns cloudRot further than the ground)
    float shade = hasClouds > 0.5 ? 0.0 : cloudAt(rotY(normalize(vP) * 1.0 + vec3(0.012, 0.0, 0.0), -cloudRot), drift);
    base *= 1.0 - 0.28 * shade;
    // the dark side: by day nearly black (a clear day and night difference); by night a dim moonlit earth, cool and
    // soft, so the continents and the seas still read round the lit crescent
    vec3 dark = base * 0.09 + vec3(0.006, 0.012, 0.030);
    float md = max(dot(n, MOON_DIR), 0.0);
    vec3 moonlit = base * MOON_TINT * (0.16 + 0.30 * md) + vec3(0.008, 0.018, 0.050);
    vec3 col = mix(mix(dark, moonlit, night), base * (0.35 + 0.85 * max(d, 0.0)), lit);
    // a soft glint on the water toward the sun
    vec3 v = vec3(0.0, 0.0, 1.0);
    vec3 h = normalize(sun + v);
    float nh = max(dot(n, h), 0.0);
    col += water * lit * (pow(nh, 18.0) * 0.18 + pow(nh, 90.0) * 0.22) * vec3(0.80, 0.85, 0.90);
    // the air seen edge on
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    col = mix(col, vec3(0.35, 0.60, 1.0) * (0.25 + lit + 0.40 * night * (1.0 - lit)), rim * (0.55 + 0.15 * night));
    gl_FragColor = vec4(col, 1.0);
  }
`;
const CLOUD_FRAG = `
  uniform sampler2D clouds; uniform float hasClouds; uniform vec3 sun; uniform float drift; uniform float night;
  varying vec3 vN; varying vec3 vP; varying vec2 vUv;
  ${NOISE}
  ${MOON}
  void main() {
    vec3 n = normalize(vN);
    float a;
    if (hasClouds > 0.5) a = texture2D(clouds, vUv).r;
    else a = cloudAt(normalize(vP), drift);
    float d = dot(n, sun);
    float lit = smoothstep(-0.18, 0.28, d);
    vec3 col = vec3(1.0) * (0.06 + 0.94 * lit * (0.5 + 0.5 * max(d, 0.0)));
    // moonlit clouds at night, silver-blue, never black blots on the dim earth
    col += MOON_TINT * (0.14 + 0.26 * max(dot(n, MOON_DIR), 0.0)) * night * (1.0 - lit);
    gl_FragColor = vec4(col, a * (0.85 - 0.25 * night * (1.0 - lit)));
  }
`;
const AIR_FRAG = `
  uniform vec3 sun; uniform float night;
  varying vec3 vN; varying vec3 vP; varying vec2 vUv;
  void main() {
    vec3 n = normalize(vN);
    float f = pow(1.0 - abs(n.z), 3.0);
    float lit = smoothstep(-0.35, 0.4, dot(n, sun));
    // a soft blue rim all the way round at night
    gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * (0.15 + 0.85 * lit + 0.45 * night * (1.0 - lit)), f * 0.85);
  }
`;

export function makeGlobe(U, host) {
  const THREE = U.ctx.THREE;
  const canvas = document.createElement('canvas');
  canvas.className = 'globe-cv';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  } catch (err) {
    U.warnOnce('globe', err);
    host.classList.add('flat');
    return { update() {} };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the shaders work in the textures' own (sRGB) values
  const scene = new THREE.Scene();
  // a little room round the air so its glow never touches the edge of the canvas
  const cam = new THREE.OrthographicCamera(-1.13, 1.13, 1.13, -1.13, 0.1, 10);
  cam.position.set(0, 0, 4);
  cam.lookAt(0, 0, 0);

  const sun = new THREE.Vector3(-0.6, 0.25, 0.75).normalize();
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const night = { value: 0 }; // 0 by day, 1 at full night (from sim.stats.daylight)
  const U_cloud = { clouds: { value: blank }, hasClouds: { value: 0 }, sun: { value: sun }, drift: { value: 0 }, night };
  const U_earth = { day: { value: blank }, hasDay: { value: 0 }, sun: { value: sun }, cloudRot: { value: 0 }, drift: U_cloud.drift, hasClouds: U_cloud.hasClouds, night };
  const geo = new THREE.SphereGeometry(1, 72, 48);
  const tilt = new THREE.Group();
  tilt.rotation.z = TILT;
  tilt.rotation.x = 0.12;
  scene.add(tilt);
  const earth = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U_earth, vertexShader: VERT, fragmentShader: EARTH_FRAG }));
  const cloud = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U_cloud, vertexShader: VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false }));
  cloud.scale.setScalar(1.012);
  const air = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { sun: { value: sun }, night }, vertexShader: VERT, fragmentShader: AIR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide }));
  air.scale.setScalar(1.07);
  tilt.add(earth, cloud);
  scene.add(air);

  // the real images, when they are there
  const loader = new THREE.TextureLoader();
  const load = (file, apply) => {
    let url;
    try { url = new URL(`../../assets/earth/${file}`, import.meta.url).href; } catch { return; }
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      apply(tex);
      dirty = true;
    }, undefined, () => { /* not there yet: the procedural Earth stays */ });
  };
  load('earth_day.jpg', (t) => { U_earth.day.value = t; U_earth.hasDay.value = 1; });
  // the one hook for a real cloud map later: name the file here (none exists yet, so nothing is requested)
  if (CLOUD_MAP) load(CLOUD_MAP, (t) => { U_cloud.clouds.value = t; U_cloud.hasClouds.value = 1; });

  let size = 0, dpr = 0, dirty = true, spin = 4.1, cloudSpin = 0, lastSun = -1, rate = 0;
  function fit() {
    const r = host.getBoundingClientRect();
    const s = Math.round(r.width / (U.scale || 1));
    const d = Math.min(3, window.devicePixelRatio || 1) * (U.scale || 1);
    if (s === size && d === dpr) return;
    size = s; dpr = d;
    renderer.setPixelRatio(d);
    renderer.setSize(s, s, false);
    canvas.style.width = canvas.style.height = `${s}px`;
    dirty = true;
  }
  // the lit face carries the day: by day the sun is to the left and in front (a soft terminator on the
  // right), by night it is round behind, so most of the face is dark and only the left limb is lit
  function sunFor(daylight) {
    const a = (108 - 60 * daylight) * Math.PI / 180;
    sun.set(-Math.sin(a), 0.22, Math.cos(a)).normalize();
  }
  sunFor(1);

  // the host's size is read twice a second, not every frame (a layout read each frame showed in the walking profile)
  let fitT = 0;
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  function update(dt) {
    fitT -= dt || 0;
    if (!size || fitT <= 0) { fitT = 0.5; fit(); }
    if (!size) return;
    const clock = U.ctx.clock;
    let turn = 0;
    // The director, 2026-11-12: the spin is an at-a-glance sign of how fast time is running. Normal speed is
    // a slow spin, 2x visibly faster, 4x quite fast, and no spin at all when time is not passing (paused, or
    // stopped during creation). Slowed time (a decision, or the player's own slow) barely turns.
    // The delight pass (docs/research/08-delight.md K3): it eases to a stop on a pause in about 250 ms and spins
    // back up the same way on resume (never a jump), and starts from still over 800 ms when time begins.
    const SPIN = { 1: 0.35, 2: 1.0, 4: 2.6 }; // radians per real second: a turn every 18 s, 6.3 s, 2.4 s
    let want = 0;
    if (clock.phase === 'running' && !clock.paused) want = clock.moment ? 0.08 : (SPIN[clock.speed] ?? 0.35 * clock.speed);
    const reduce = mqReduce.matches;
    const tau = reduce ? 0.001 : want > rate ? (rate < 0.02 && clock.year - (U.ctx.config?.CLOCK?.START_YEAR ?? -5000) < 0.5 ? 0.3 : 0.09) : 0.08;
    rate += (want - rate) * Math.min(1, (dt || 0) / tau);
    if (Math.abs(want - rate) < 0.002) rate = want;
    if (rate > 0 && dt > 0) turn = rate * dt;
    if (turn) { spin += turn; cloudSpin += turn * 0.18 + 0.002 * dt; dirty = true; }
    const dl = clock.phase === 'running' ? (Number.isFinite(U.daylight) ? U.daylight : 1) : 1;
    if (Math.abs(dl - lastSun) > 0.01) { lastSun = dl; sunFor(dl); night.value = 1 - dl; dirty = true; }
    if (!dirty) return;
    dirty = false;
    earth.rotation.y = spin;
    cloud.rotation.y = spin + cloudSpin;
    U_cloud.drift.value = cloudSpin * 0.6;
    U_earth.cloudRot.value = cloudSpin;
    renderer.render(scene, cam);
  }
  U.on('resize', () => { size = 0; });
  return { update, get textured() { return U_earth.hasDay.value > 0.5; }, get spin() { return spin; } };
}
