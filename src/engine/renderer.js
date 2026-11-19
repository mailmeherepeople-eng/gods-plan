// Three.js setup: capped pixel ratio, two lights over a hemisphere fill, a
// frame limiter, WebGL context-loss recovery, the optional Rich tier (one post
// pass), the background / edge-mist colour, and the time of day (setDaylight:
// dusk, moonlit night, dawn and firelight; the look lives in engine/lighting.js).
//
// Ported from the source repo's engine/renderer.js. Removed: the sky dome, sun
// disc, haze and cloud billboards (the god view is a high orthographic camera,
// which never sees a sky), per-act sky colours, and the Rich tier's shadow map
// (it followed a first-person camera and covered 28 m; the mesher's baked sun
// shadows do the work here). Kept as they were: tone mapping, lights, the
// limiter loop and the hidden-tab heartbeat.
import * as THREE from '../../vendor/three.module.js';
import { PERF, QUALITY_TIER } from '../config.js';
import { SHADE, tickShade, setClouds, updateGlows } from '../world/shade.js';
import { Post } from './post.js';
import { NIGHT, GlowMap, lookAt, makeLook, MOON_DIR } from './lighting.js';

// the longest step one frame may take (game time is lost beyond it: a stall or a starved tab)
const MAX_STEP = 0.25;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    // a placeholder until main.js hands it the god camera (view/camera.js)
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.onFrame = null; // (dt) => void, called once per rendered frame
    this.onResize = null; // () => void
    this.after = []; // (dt) => void, each drawn over the finished frame (a picture in picture: ui/closeup.js)
    this.paused = false;
    this._last = 0;
    this._acc = 0;
    this._frameInterval = 1 / PERF.TARGET_FPS;
    // rough frame cost, for the ARCHITECTURE notes and a debug read-out
    this.stats = { frameMs: 0, cpuMs: 0, fps: 0 };
    this._fpsN = 0; this._fpsT = 0;

    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.MAX_PIXEL_RATIO));
    // filmic curve inside every material's fragment shader (no extra pass)
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 0.98;
    this.rich = false;
    this.post = null;

    // slightly golden key light over a cool sky fill and warm earth bounce
    this.sun = new THREE.DirectionalLight(0xffe4b8, 1.55);
    this.sun.position.set(40, 60, 20); // world/mesher.js bakes shadows for this direction
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xc4d9ea, 0x7d6a48, 0.62);
    this.scene.add(this.hemi);
    // weak cool fill from the opposite side, added AFTER the sun on purpose:
    // shade.js masks directional light index 0 with the baked shadow term
    this.fill = new THREE.DirectionalLight(0xbdd2ec, 0.22);
    this.fill.position.set(-30, 40, -25);
    this.scene.add(this.fill);
    SHADE.sunColor.value.copy(this.sun.color);
    this._mistHex = 0xcfd9dd;
    this._initNight();
    this.setBackground(this._mistHex);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.paused = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.paused = false;
      if (this.onContextRestored) this.onContextRestored();
    });

    requestAnimationFrame((t) => this._loop(t));

    // heartbeat: rAF starves in hidden tabs; keep LOGIC ticking at a low rate
    // so nothing waiting on a frame wedges (rendering can wait). onFrame is
    // told `true` as its second argument on these ticks.
    this._lastTick = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (now - this._lastTick > 600 && !this.paused) {
        if (this.onFrame) this.onFrame(0.1, true);
        this._render(0.1);
        if (this.onRendered) this.onRendered(true);
        this._lastTick = now;
      }
    }, 300);
  }

  // The colour beyond the world: the page background and the edge mist are
  // the same colour, so the land dissolves into it with no line.
  // At night the renderer darkens both toward NIGHT.mist itself (setDaylight); hex is the day's colour.
  setBackground(hex) {
    const N = this._night;
    N.dayMist = hex;
    this._applyMist(lookAt(N.cur ?? 0.3, hex, N.moonK, N.look).mist, true);
  }
  // the page behind the canvas follows too, so nothing lighter ever shows round it
  _applyMist(hex, force = false) {
    if (hex === this._mistShown && !force) return;
    this._mistShown = hex;
    this._mistHex = hex;
    if (!this.scene.background?.isColor) this.scene.background = new THREE.Color();
    this.scene.background.setHex(hex);
    this._syncEdgeColor();
    const css = '#' + hex.toString(16).padStart(6, '0');
    if (typeof document !== 'undefined') { document.documentElement.style.background = css; if (document.body) document.body.style.background = css; }
  }

  // ---------- time of day (engine/lighting.js: moonlit night, dusk and dawn) ----------
  // setDaylight(level, { t }): level is the sim's daylight 0..1; t its day fraction (0 dawn .. 1), which
  // tells dusk from dawn. Without t the look follows level alone (as a dusk). Called a few times a second
  // by the HUD's daylight listener; the renderer eases toward it every frame, so a jump fades.
  setDaylight(level = 1, opts = {}) {
    const N = this._night;
    const lv = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1;
    const t = Number.isFinite(opts.t) ? opts.t : lv >= 1 ? 0.3 : 0.6 + (1 - lv) * 0.1;
    // a day passes at noon (the moon's phase changes then, while it is down)
    if (N.target != null && N.target < 0.35 && t >= 0.35 && t - N.target < 0.5) N.day++;
    N.target = ((t % 1) + 1) % 1;
  }
  // Dev aid: hold the look at a day fraction (0 dawn, 0.3 noon, 0.6 dusk, 0.66 sunset, 0.7 blue hour,
  // 0.85 midnight, 0.98 before dawn) whatever the clock says; null lets go. moon 0..1 holds the moon's
  // phase too (0 new, 1 full). ?hour=0.85 (and &moon=0) in the address does the same from load. Only the
  // look: the people keep the sim's own time.
  holdHour(h = null, moon = null) {
    const N = this._night;
    N.hold = Number.isFinite(h) ? ((h % 1) + 1) % 1 : null;
    N.holdMoon = Number.isFinite(moon) ? Math.max(0, Math.min(1, moon)) : null;
    return N.hold;
  }
  // a light source the glow map should know about: fn(push) is called each update, push(x, y, z, r, k)
  addGlowSource(fn) {
    this._night.sources.push(fn);
    return () => { const a = this._night.sources; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
  }
  // what the look is now (for the console and tests)
  get daylightLook() {
    const N = this._night, L = N.look;
    return { t: N.cur, hold: N.hold, day: N.day, moonPhase: N.moonK, sunI: L.sunI, hemiI: L.hemiI, moon: L.moon, moonI: L.moonI, night: L.night,
      exposure: L.exposure, sunColor: '#' + L.sunColor.getHexString(), sky: '#' + L.sky.getHexString(), mist: '#' + L.mist.toString(16).padStart(6, '0'),
      glows: N.glow.n };
  }

  _initNight() {
    const N = this._night = { target: null, cur: null, hold: null, holdMoon: null, day: 0, moonK: 1, look: makeLook(), dayMist: 0xcfd9dd,
      sources: [], scan: [], frame: 0, glow: new GlowMap() };
    SHADE.glowTex.value = N.glow.tex;
    SHADE.fireColor.value.setHex(NIGHT.glow.color);
    this._sunHigh = this.sun.position.clone().normalize();
    // the low sun stands where the moon will (MOON_DIR, about 37 degrees up in the west-south-west), so it
    // can use the moon's baked shadows: long ones (shade.js uSunSwap cross-fades the two masks)
    this._sunLow = new THREE.Vector3(...MOON_DIR).normalize();
    this._fillDay = { color: this.fill.color.clone(), i: this.fill.intensity, dir: this.fill.position.clone().normalize() };
    this._moonDir = new THREE.Vector3(...MOON_DIR).normalize();
    this._moonColor = new THREE.Color(NIGHT.moonColor);
    // ?hour=0.85 (&moon=0..1) holds the look from load
    try {
      const q = new URLSearchParams(location.search);
      const h = parseFloat(q.get('hour')), m = parseFloat(q.get('moon'));
      if (Number.isFinite(h)) this.holdHour(h, m);
    } catch { /* no location */ }
  }

  // once per rendered frame: ease the time of day, write the lights and the shared night uniforms
  _tickNight(dt) {
    const N = this._night;
    const target = N.hold ?? N.target ?? 0.3;
    if (N.cur == null) N.cur = target;
    let d = target - N.cur;
    d -= Math.round(d); // the short way round the day
    N.cur = Math.abs(d) < 1e-4 ? target : (((N.cur + d * (1 - Math.exp(-dt / NIGHT.ease))) % 1) + 1) % 1;
    const P = NIGHT.phases;
    const ph = N.holdMoon ?? (0.5 + 0.5 * Math.cos(N.day / P.days * Math.PI * 2));
    N.moonK = P.dark + (1 - P.dark) * ph;
    const L = lookAt(N.cur, N.dayMist, N.moonK, N.look);
    // sun: light 0
    this.sun.color.copy(L.sunColor);
    this.sun.intensity = L.sunI;
    this.sun.position.copy(this._sunHigh).lerp(this._sunLow, L.west).normalize().multiplyScalar(74);
    SHADE.sunSwap.value = L.west;
    SHADE.sunColor.value.copy(L.sunColor).multiplyScalar(L.sunI / 1.55);
    // the day's faint fill becomes the moon: light 1
    const m = L.moon;
    this.fill.color.copy(this._fillDay.color).lerp(this._moonColor.setHex(NIGHT.moonColor), m);
    this.fill.intensity = this._fillDay.i + (L.moonI - this._fillDay.i) * m;
    this.fill.position.copy(this._fillDay.dir).lerp(this._moonDir, Math.min(1, m * 1.5)).normalize().multiplyScalar(60);
    // sky and ground fill
    this.hemi.color.copy(L.sky);
    this.hemi.groundColor.copy(L.ground);
    this.hemi.intensity = L.hemiI;
    // zoomed right out, the night is drawn a little brighter so the whole land still reads (none up close)
    const cam = this.camera, ppm = cam.isOrthographicCamera ? innerWidth * cam.zoom / Math.max(1e-6, cam.right - cam.left) : 8;
    const far = Math.max(0, Math.min(1, (6 - ppm) / 3.5));
    this.gl.toneMappingExposure = L.exposure * (1 + NIGHT.farLift * L.night * far * far * (3 - 2 * far));
    // the shader's night: grade, moon shadow, firelight, the moon on water
    const n = L.night;
    SHADE.night.value = n;
    SHADE.moonMask.value = NIGHT.moonShadow * Math.min(1, m * 1.4);
    SHADE.nightDesat.value = NIGHT.desat * L.grade - L.sat;
    SHADE.warmKeep.value = NIGHT.warm.keep;
    SHADE.warmLift.value = NIGHT.warm.lift * L.grade;
    SHADE.nightTint.value.set(...L.tint);
    SHADE.glowAmt.value = NIGHT.glow.gain * Math.min(1, n * 1.25);
    SHADE.glint.value.setHex(NIGHT.glint.color).multiplyScalar(NIGHT.glint.amount * n * (0.6 + 0.4 * N.moonK));
    SHADE.glintDir.value.set(this._moonDir.x * 0.08, 1, this._moonDir.z * 0.08).normalize();
    SHADE.figKeep.value = NIGHT.figure.keep;
    SHADE.figLift.value.setHex(NIGHT.figure.color).multiplyScalar(NIGHT.figure.lift * n);
    // the mist beyond the world and the page behind it, in step
    this._applyMist(L.mist);
    // firelight: refresh the list of lit things now and then, stamp the map every other frame
    if (n > 0.01) {
      N.frame++;
      if (N.frame % 12 === 1) this._scanGlows();
      if (N.frame % 2 === 0) this._stampGlows();
    } else if (N.glow.lit) { N.glow.begin(); N.glow.end(0, 0, 0); }
  }
  // meshes that give light carry userData.glow (a radius in blocks, or { r, k }); an instanced one lights
  // every instance. Hidden things (a person indoors with a torch) are skipped.
  _scanGlows() {
    const list = this._night.scan;
    list.length = 0;
    this.scene.traverseVisible((o) => { if (o.userData.glow) list.push(o); });
  }
  _stampGlows() {
    const N = this._night, G = N.glow;
    const e = SHADE.edge.value;
    if (e.z > e.x && (G.box.x !== e.x || G.box.w !== e.z - e.x)) G.setBox(e.x, e.y, e.z, e.w);
    G.begin();
    const _m = this._glowM ?? (this._glowM = new THREE.Matrix4()), _v = this._glowV ?? (this._glowV = new THREE.Vector3());
    for (const o of N.scan) {
      if (!o.parent || !o.visible) continue;
      const gl = o.userData.glow, r = typeof gl === 'string' ? NIGHT.glow.radius[gl] ?? 4 : gl.r ?? gl, k = gl.k ?? NIGHT.glow.strength[gl] ?? 1;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, _m);
          _v.setFromMatrixPosition(_m).applyMatrix4(o.matrixWorld);
          G.push(_v.x, _v.y, _v.z, r, k);
        }
      } else {
        _v.setFromMatrixPosition(o.matrixWorld);
        G.push(_v.x, _v.y, _v.z, r, k);
      }
    }
    const push = this._glowPush ?? (this._glowPush = (x, y, z, r, k) => G.push(x, y, z, typeof r === 'string' ? NIGHT.glow.radius[r] ?? 4 : r, k));
    for (const fn of N.sources) {
      try { fn(push); } catch (err) { if (!this._glowErr) { this._glowErr = true; console.error('glow source failed:', err); } }
    }
    // the budget goes to the sources nearest the middle of the view (where its ray meets the ground)
    const c = this.camera.position, f = this.camera.getWorldDirection(_v);
    const k = f.y < -0.05 ? (16 - c.y) / f.y : 0;
    G.end(c.x + f.x * k, c.z + f.z * k, SHADE.time.value);
  }

  // Edge mist over the world's bounds {x0, z0, x1, z1}; width in blocks (0 = off).
  setEdgeMist(bounds, width) {
    SHADE.edge.value.set(bounds.x0, bounds.z0, bounds.x1, bounds.z1);
    SHADE.edgeW.value = width;
    this._syncEdgeColor();
  }

  // The edge is mixed after the material's tone map and sRGB encode on the
  // Lite path (so it takes the raw hex), and before the post pass's on the
  // Rich path (so it takes linear values, which the post pass then encodes
  // exactly as it does the background).
  _syncEdgeColor() {
    const c = new THREE.Color(this._mistHex);
    if (this.rich) SHADE.edgeColor.value.set(c.r, c.g, c.b);
    else SHADE.edgeColor.value.set((this._mistHex >> 16 & 255) / 255, (this._mistHex >> 8 & 255) / 255, (this._mistHex & 255) / 255);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.camera.isPerspectiveCamera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.gl.setSize(w, h, false);
    if (this.post) {
      const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
      this.post.setSize(size.x, size.y);
    }
    if (this.onResize) this.onResize();
  }

  // ---------- ground mist (height fog, needs a scene fog to show) ----------
  setMist(density = 0, top = 12, floor = 6) {
    SHADE.mist.value.set(top, floor, density, 0.08);
  }

  // ---------- Rich tier: FXAA + colour grade post pass, cloud shadows ----------
  setRich(on) {
    on = !!on;
    if (on === this.rich) return;
    this.rich = on;
    if (on) {
      const phone = QUALITY_TIER === 'low' || matchMedia('(pointer: coarse)').matches;
      if (!this.post) this.post = new Post(this.gl);
      this.post.scale = phone ? 0.8 : 1;
      this.resize();
      setClouds(true);
    } else {
      setClouds(false);
    }
    this._syncEdgeColor();
    this.scene.traverse((o) => {
      if (!o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) m.needsUpdate = true;
    });
  }

  _render(dt) {
    tickShade(dt);
    this._tickNight(dt);
    updateGlows(this.camera.position);
    if (this.rich) this.post.render(this.scene, this.camera, SHADE.time.value);
    else this.gl.render(this.scene, this.camera);
    // drawn on top of the frame, after it (the close-up window, ui/closeup.js); an empty list costs nothing
    for (const fn of this.after) { try { fn(dt); } catch (err) { if (!this._afterErr) { this._afterErr = true; console.error('after-render failed:', err); } } }
  }

  // The display's refresh rate, from the first rAF intervals; then the limiter
  // renders every k-th refresh (k = refresh / TARGET_FPS, rounded), so frames
  // are evenly paced. Measured 2026-11-12 on a 144 Hz screen: a plain 60 fps
  // cap renders every 2nd, then 3rd refresh (13.9 and 20.8 ms frames), and at
  // speed 4 every walker visibly stutters with that 2-3 rhythm. Now 72 fps there.
  // The median of the last 120 intervals is taken again every 120 refreshes, so
  // moving the window to another screen is followed. 60 Hz renders every
  // refresh, 90 and 100 Hz too, 120 every 2nd (60), 144 every 2nd (72), 165 and
  // 180 every 3rd, 240 every 4th.
  _cadence(t) {
    const c = this._cad ?? (this._cad = { buf: new Float32Array(120), n: 0, last: 0, k: 0, hz: 0 });
    const d = t - c.last;
    c.last = t;
    if (d > 2 && d < 100) {
      c.buf[c.n++] = d;
      if (c.n === c.buf.length) {
        c.n = 0;
        const med = Float32Array.from(c.buf).sort()[c.buf.length >> 1];
        c.hz = Math.round(1000 / med);
        c.k = Math.max(1, Math.floor(c.hz / (this.targetFps ?? PERF.TARGET_FPS) + 0.25));
      }
    }
    return c.k;
  }
  // A different cap for a while (walking among the people draws at most 30 a second, as the source game did
  // everywhere: view/walk.js). fps = PERF.TARGET_FPS puts the usual cap back.
  setTargetFps(fps) {
    fps = Math.max(1, fps || PERF.TARGET_FPS);
    if (fps === this.targetFps) return;
    this.targetFps = fps;
    this._frameInterval = 1 / fps;
    const c = this._cad;
    if (c?.hz) c.k = Math.max(1, Math.floor(c.hz / fps + 0.25));
    this._tick = 0;
  }
  get refreshHz() { return this._cad?.hz ?? 0; }
  get frameEvery() { return this._cad?.k ?? 0; }

  _loop(t) {
    requestAnimationFrame((tt) => this._loop(tt));
    if (this.paused) { this._last = t; return; }
    // a frame steps the game by the real time since the last one, up to MAX_STEP (it was 0.1 s: a page
    // stalled for 150 ms out of every 400 then ran its clock at 87 percent; the sim sub-steps long frames)
    const dt = Math.min(MAX_STEP, (t - this._last) / 1000 || 0);
    this._last = t;
    this._acc += dt;
    this._simulationElapsed = (this._simulationElapsed ?? 0) + dt;
    const k = this._cadence(t);
    if (k) {
      // every k-th refresh, counting the refreshes that really passed: a slow frame makes the next callback come a
      // refresh late, and counting that as one put a whole extra refresh between frames (2026-11-15, walking at
      // 30 a second: on a 60 Hz phone any frame over 16.7 ms would have dropped it to 20; the source game's
      // limiter counts time, and so does this now, while keeping the even pacing)
      const n = Math.max(1, Math.round(dt * this._cad.hz));
      this._tick = (this._tick ?? 0) + n;
      if (this._tick < k) return;
      this._tick -= k;
      if (this._tick >= k) this._tick = 0; // after a long stall: start counting afresh, no burst of frames
    } else if (this._acc + 1e-9 < this._frameInterval) return; // refresh rate not known yet: at most TARGET_FPS
    const step = Math.min(this._simulationElapsed, MAX_STEP);
    this._simulationElapsed = 0;
    this._acc = Math.max(0, Math.min(this._acc - this._frameInterval, this._frameInterval));
    this._lastTick = t;
    const c0 = performance.now();
    if (this.onFrame) this.onFrame(step, false);
    this._render(step);
    if (this.onRendered) this.onRendered(false); // engine/perf.js closes the frame's timing
    // cpu time of this frame (update + draw submission); fps over each second
    const s = this.stats;
    s.cpuMs = s.cpuMs * 0.9 + (performance.now() - c0) * 0.1;
    s.frameMs = s.frameMs * 0.9 + step * 1000 * 0.1;
    // frames per second of wall time (it summed the clamped steps, so a page stalling 700 ms in 900 read 54)
    this._fpsN++;
    if (!this._fpsAt) this._fpsAt = t;
    if (t - this._fpsAt >= 1000) { s.fps = Math.round(this._fpsN * 1000 / (t - this._fpsAt)); this._fpsN = 0; this._fpsAt = t; }
  }
}
