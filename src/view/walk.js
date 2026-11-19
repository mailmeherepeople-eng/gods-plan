// Walking among the people (the director, 2026-11-15: "i want to add the ability to walk among them in FPS view";
// rebuilt the same day: "make it work like how it is in the ones who came before. same movement controls ... and
// make sure that there is no lag"). The god walks as an unseen presence: nobody sees it, nothing in the simulation
// changes. This file is the body and the camera: a pale figure seen from behind on a camera boom that follows it
// (the wheel or a pinch moves the camera from 2.2 to 7.5 m back; in past the closest is through the eyes), the walk
// with the other game's speed, acceleration, jump and gravity (solid ground, tree trunks and hut walls stop it; one
// block is stepped up; shallow water is waded, deep water and the edge mist stop it), the sky, the distance fade, the
// travel down from the god's view and back up again (nothing teleports), and the drawing limits that keep it light
// on a phone. The screen (the stick, the look, Jump, Leave, the names) is ui/walk.js. docs/WALK.md has every number
// and why; the numbers marked "reference" are the other game's (player/player.js, engine/input.js, constants.js).
//
// While walking, the god's own camera (view/camera.js, ctx.camera) is left exactly where it was: the renderer
// simply draws through this camera instead (renderer.camera), and is handed the god's camera back on leaving.
import * as THREE from '../../vendor/three.module.js';
import { WORLD, QUALITY_TIER, PERF } from '../config.js';
import { SHADE, MOON_DIR, edgeClear, enhance } from '../world/shade.js';
import { isSolid, isOpaque, isWater } from '../world/blocks.js';

const DEG = Math.PI / 180;
// ---------------------------------------------------------------------------
// Every number of the walk (docs/WALK.md says why each is what it is)
export const WALK = {
  // the pale figure you walk as. false: no figure is made or drawn, and the walk starts through the eyes (the wheel
  // or a pinch still moves the camera back). The director has not yet said whether he wants one.
  BODY: true,
  // the body. A grown person here (sim/bodies.js makePerson, PERSON_SCALE 1.18): the head box is centred at
  // 1.42 x 1.18 = 1.68 m, the eyes 0.02 x 1.18 above that: 1.70 m. The top of the hair is about 2.0 m.
  EYE: 1.70,
  BODY_H: 1.9,        // the body's height for collisions: under a hut's two-block roof and through its door
  RADIUS: 0.28,       // half the body's width: a one-block door gap (1 m) lets it through with room to spare
  STEP: 1,            // walking into a rise of one block steps up onto it (reference 1.05); two blocks stop you
  STEP_WET: 2,        // ...but out of water a bank two blocks above the bed is climbed (or a stream would trap you)
  STEP_SMOOTH: 9,     // reference: how fast the camera and the figure catch up after a step (the body snaps)
  // moving (reference PLAYER and Player.update)
  SPEED: 5.2,         // m/s, the stick pushed all the way or a key held (reference: valley crossing about 35 s)
  WADE: 0.55,         // in water the walk is this much of itself (reference, the same)
  ACCEL: 14,          // how quickly the walk reaches the wished speed, on the ground or in water (reference)
  AIR_ACCEL: 5,       // ...and in the air (reference)
  GRAVITY: 22,        // m/s2 (reference, the same)
  JUMP: 9.9,          // m/s up: clears a two-block rise (h = J*J / 2g = 2.2 m; reference)
  DEEP: 2,            // water this many blocks deep over the ground stops you (one block deep is waded)
  EDGE_MIN: 0.8,      // the edge mist: you may walk only where the land is at least this clear (world/shade.js edgeClear)
  // the camera (reference CAM)
  CAM_DIST: 4.6,      // metres behind the head at the start
  CAM_MIN: 2.2,       // the wheel or a pinch moves it between these; in past the closest is through the eyes
  CAM_MAX: 7.5,
  ZOOM_STEP: 0.6,     // metres a wheel notch or a pinch step moves it
  PIVOT: 1.58,        // the point the camera turns round, above the feet (reference 1.5 on a 1.62 m eye: here 1.70 - 0.12)
  PAD: 0.3,           // a wall behind you pulls the camera in to this far short of it
  HIDE_BELOW: 1.15,   // the camera this near the head (a wall behind you, or through the eyes) hides the figure
  FOLLOW_WAIT: 1.2,   // phone: seconds after the last look before the camera swings round behind the way you walk
  FOLLOW_RATE: 2.6,   // ...and how fast it swings (reference lockCamera, on by default on a touch screen)
  FOV: 70,            // degrees from the top of the view to the bottom (reference FOV_REST)
  FOV_RUN: 75,        // ...opening this far at full pace (reference FOV_RUN; none with Less motion)
  PITCH_UP: 1.2,      // radians you can look up and down (reference)
  PITCH_DOWN: 1.35,
  // drawing
  FPS: 30,            // while walking the game draws at most this many frames a second (reference TARGET_FPS)
  FAR: QUALITY_TIER === 'low' ? 64 : 96, // metres drawn; the land fades into the mist over the last part
  FADE_FROM: 0.45,    // the fade starts at this share of FAR and is complete at FADE_TO of it
  FADE_TO: 0.94,
  CROSS_FAR: QUALITY_TIER === 'low' ? 28 : 40, // grass, flowers and reeds are drawn only this near (they are the most triangles)
  FULL_FIGURE: 40,    // people within this many metres are the full figure with moving limbs; beyond, the one-mesh figure
  // the travel
  TRAVEL_S: 1.0,      // seconds from the god's view down to the walk, and back up
  FADE_S: 0.36,       // with Less motion: a cross-fade of this long instead
  START_FOV: 2.5,     // the travel starts from a perspective camera this narrow, far back: it looks the same as the god's view
  FOCUS: 4,           // the travel blends the camera's focus, this far in front of it
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function makeWalker(ctx) {
  const { renderer, camera: C, vox: V, scene } = ctx;
  const get = (x, y, z) => V.get(x, y, z);
  const cam = new THREE.PerspectiveCamera(WALK.FOV, innerWidth / innerHeight, 0.05, WALK.FAR);
  cam.rotation.order = 'YXZ';
  cam.name = 'walk-eye';

  // ---------- the sky: a dome that follows the camera, drawn first and behind everything ----------
  const sky = makeSky();
  sky.mesh.visible = false;
  scene.add(sky.mesh);

  // ---------- the figure ----------
  const fig = WALK.BODY ? makeFigure() : null;
  if (fig) { fig.group.visible = false; scene.add(fig.group); }

  // ---------- state ----------
  const P = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ground: true, wet: false };
  const W = {
    WALK, cam, P,
    mode: 'off',            // off | in (travelling down) | on | out (travelling up) | fade
    yaw: 0, pitch: 0,       // where the camera looks: yaw 0 is towards -z, pitch up is positive
    input: { x: 0, y: 0 },  // the wish to move: x right, y forward, each -1..1 (the stick or the keys)
    camDist: WALK.CAM_DIST, // the camera's distance behind the head, kept between walks
    eyeView: !WALK.BODY,    // through the eyes (the wheel or a pinch went all the way in)
    indoor: false,          // the body stands inside a home (ui/xray.js sets it): through the eyes until it steps out
    follow: false,          // the camera swings round behind the way you walk (ui/walk.js: on a touch screen)
    near: null,             // { x, z, r2 } while walking: sim/index.js draws the full figures within it
    reduce: () => false,    // Less motion (ui/walk.js sets it)
    onDone: null,           // (mode) => void when a travel ends
    get active() { return W.mode !== 'off'; },
    get walking() { return W.mode === 'on'; },
    get pos() { return P; },
    get body() { return fig?.group ?? null; },
  };
  ctx.walk = W;

  // ---------- the world as the body feels it ----------
  const R = WALK.RADIUS, H = WALK.BODY_H;
  // does a body with its feet at (x, y, z) overlap anything solid?
  function overlaps(x, y, z) {
    const x0 = Math.floor(x - R), x1 = Math.floor(x + R), z0 = Math.floor(z - R), z1 = Math.floor(z + R);
    const y0 = Math.floor(y + 0.01), y1 = Math.floor(y + H - 0.01);
    for (let cy = y0; cy <= y1; cy++) for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) if (isSolid(get(cx, cy, cz))) return true;
    return false;
  }
  // a column the body may not enter: deep water, or the edge mist (cached for the frame)
  const colCache = new Map();
  function colBlocked(cx, cz) {
    const key = cx * 1024 + cz;
    let v = colCache.get(key);
    if (v === undefined) {
      v = edgeClear(cx + 0.5, cz + 0.5) < WALK.EDGE_MIN;
      if (!v) v = waterDepth(cx, cz) >= WALK.DEEP;
      colCache.set(key, v);
    }
    return v;
  }
  // how many blocks of water stand on the ground of a column (a tree's crown over a stream does not hide it)
  function waterDepth(cx, cz) {
    const g = V.groundTop(cx, cz);
    let n = 0;
    while (n < 8 && isWater(get(cx, g + 1 + n, cz))) n++;
    return n;
  }
  function footBlocked(x, z) {
    for (let cz = Math.floor(z - R); cz <= Math.floor(z + R); cz++) for (let cx = Math.floor(x - R); cx <= Math.floor(x + R); cx++) if (colBlocked(cx, cz)) return true;
    return false;
  }
  // moving the footprint from (x, z) to (nx, nz): does it step into a blocked column it was not already in?
  // (a body already standing in one, say a flood rose round it, can still walk out)
  function newlyBlocked(nx, nz, x, z) {
    const x0 = Math.floor(nx - R), x1 = Math.floor(nx + R), z0 = Math.floor(nz - R), z1 = Math.floor(nz + R);
    const ox0 = Math.floor(x - R), ox1 = Math.floor(x + R), oz0 = Math.floor(z - R), oz1 = Math.floor(z + R);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      if (cx >= ox0 && cx <= ox1 && cz >= oz0 && cz <= oz1) continue;
      if (colBlocked(cx, cz)) return true;
    }
    return false;
  }
  let stepLift = 0; // how much of the last step up is still being eased out of the camera and the figure
  function tryMove(dx, dz) {
    const nx = P.x + dx, nz = P.z + dz;
    if (newlyBlocked(nx, nz, P.x, P.z)) return false;
    if (!overlaps(nx, P.y, nz)) { P.x = nx; P.z = nz; return true; }
    if (!P.ground) return false; // no climbing in mid-air
    // a step: the next whole block up, if the body fits there and has the headroom to rise where it stands.
    // Wading, a bank two blocks above the bed can be climbed (out of a stream whose banks stand two over its bed)
    const max = P.wet ? WALK.STEP_WET : WALK.STEP;
    for (let up = Math.floor(P.y + 0.01) + 1; up - P.y <= max + 0.01; up++) {
      if (overlaps(P.x, up, P.z)) return false;
      if (!overlaps(nx, up, nz)) { stepLift = Math.min(max, stepLift + (up - P.y)); P.y = up; P.x = nx; P.z = nz; return true; }
    }
    return false;
  }
  function inWater() { return isWater(get(Math.floor(P.x), Math.floor(P.y + 0.4), Math.floor(P.z))); }

  // a place to stand near (tx, tz): o = { min, max, prefer: {x, z} (a direction to favour), see: y (a height at
  // the target the eye should see), ty }. Returns { x, y, z } or null.
  // how shut in a place is: solid cells round the eye's height within 2 m (a spot pressed against a hut or under a
  // low crown makes a poor first view)
  function closeness(x, y, z) {
    let n = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (let dy = 1; dy <= 2; dy++) if (isSolid(get(Math.floor(x) + dx, Math.floor(y) + dy, Math.floor(z) + dz))) n++;
    return n;
  }
  function findSpot(tx, tz, o = {}) {
    const min = o.min ?? 2, max = o.max ?? 14;
    let best = null, bestS = Infinity;
    for (let r = min; r <= max; r += 0.75) {
      const n = Math.max(12, Math.round(r * 5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = tx + Math.sin(a) * r, z = tz + Math.cos(a) * r;
        const cx = Math.floor(x), cz = Math.floor(z);
        if (footBlocked(x, z) || edgeClear(x, z) < WALK.EDGE_MIN + 0.05) continue;
        let y = V.standY(cx, cz);
        // under a tree's crown or in a hut the ground is the floor; standing on something solid higher up is not wanted
        if (overlaps(x, y, z)) continue;
        if (!overlaps(x, y - 0.05, z)) continue; // something to stand on
        let s = r * 2;
        if (o.prefer) s += (1 - (Math.sin(a) * o.prefer.x + Math.cos(a) * o.prefer.z)) * 3;
        if (Number.isFinite(o.ty)) s += Math.max(0, Math.abs(y - o.ty) - 1) * 4;
        if (Number.isFinite(o.see) && !sees(x, y + WALK.EYE, z, tx, o.see, tz)) s += 40;
        s += closeness(x, y, z) * 0.8;
        if (s < bestS) { bestS = s; best = { x, y, z }; }
      }
      if (best && bestS < (r + 0.75) * 2 + 2) break; // nothing further out can beat it
    }
    return best;
  }
  // a clear line from one point to another through the voxels (opaque blocks stop it), for names and taps
  function sees(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return true;
    dx /= len; dy /= len; dz /= len;
    let x = Math.floor(ax), y = Math.floor(ay), z = Math.floor(az);
    const ex = Math.floor(bx), ey = Math.floor(by), ez = Math.floor(bz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
    let tx = sx > 0 ? (x + 1 - ax) * tdx : sx < 0 ? (ax - x) * tdx : Infinity;
    let ty = sy > 0 ? (y + 1 - ay) * tdy : sy < 0 ? (ay - y) * tdy : Infinity;
    let tz = sz > 0 ? (z + 1 - az) * tdz : sz < 0 ? (az - z) * tdz : Infinity;
    for (let k = 0; k < 200; k++) {
      if (x === ex && y === ey && z === ez) return true;
      if (k > 0 && isOpaque(get(x, y, z))) return false;
      if (tx < ty && tx < tz) { if (tx > len) return true; x += sx; tx += tdx; }
      else if (ty < tz) { if (ty > len) return true; y += sy; ty += tdy; }
      else { if (tz > len) return true; z += sz; tz += tdz; }
    }
    return true;
  }

  // ---------- the camera: a boom from a point over the head, backwards along the look ----------
  // (reference Player.syncCamera: the boom is marched back from the pivot in quarter metres and stops short of the
  // first solid block, so a wall or a crown never comes between the camera and you; it shrinks at once and eases
  // back out)
  const solidAt = (x, y, z) => isSolid(get(Math.floor(x), Math.floor(y), Math.floor(z)));
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _f = new THREE.Vector3();
  const _piv = new THREE.Vector3(), _dir = new THREE.Vector3(), _cp = new THREE.Vector3();
  let camD = WALK.CAM_DIST; // the boom's length now (after walls and easing)
  let fov = WALK.FOV;
  // the camera's place for the body's state now: into _cp (and _dir, the look); snap: no easing
  // inside a home (three blocks across, two high) the boom could only sit an arm's length behind the head, and the
  // figure would fill the view: there the camera is through the eyes, and eases back out on stepping outside
  const eyeNow = () => W.eyeView || (W.indoor && W.mode === 'on');
  function boom(dt, snap) {
    const eye = eyeNow();
    _piv.set(P.x, P.y - stepLift + (eye ? WALK.EYE : WALK.PIVOT), P.z);
    const cp = Math.cos(W.pitch);
    _dir.set(-Math.sin(W.yaw) * cp, Math.sin(W.pitch), -Math.cos(W.yaw) * cp);
    const want = eye ? 0 : W.camDist;
    let limit = want;
    for (let t = 0.25; t <= want; t += 0.25) {
      if (solidAt(_piv.x - _dir.x * t, _piv.y - _dir.y * t, _piv.z - _dir.z * t)) { limit = Math.max(0.5, t - WALK.PAD); break; }
    }
    if (eye) limit = 0;
    // the reference eased by 0.12 a frame at 30 frames a second; the same per second at any frame rate
    if (snap || limit < camD) camD = limit;
    else camD += (limit - camD) * (1 - Math.pow(0.88, dt * 30));
    _cp.copy(_piv).addScaledVector(_dir, -camD);
    // a corner the march missed: pull the camera forward along the look until it is in open air (reference _cameraUnclip)
    if (camD > 0 && solidAt(_cp.x, _cp.y, _cp.z)) {
      let ok = false;
      for (let f = 0.2; f <= camD; f += 0.2) {
        const x = _cp.x + _dir.x * f, y = _cp.y + _dir.y * f, z = _cp.z + _dir.z * f;
        if (!solidAt(x, y, z)) { _cp.set(x, y, z); camD = Math.max(0.5, camD - f); ok = true; break; }
      }
      if (!ok) { _cp.copy(_piv); camD = 0.5; }
    }
  }
  function placeCam(dt, snap = false) {
    boom(dt, snap);
    cam.position.copy(_cp);
    cam.rotation.set(W.pitch, W.yaw, 0, 'YXZ');
    cam.fov = fov; cam.near = 0.05; cam.far = WALK.FAR; cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    if (fig) fig.group.visible = !eyeNow() && camD > WALK.HIDE_BELOW;
  }
  // the walk's camera as a travel pose (focus, distance, turn, angle of view)
  function rigPose(out = {}) {
    boom(0, true);
    _e.set(W.pitch, W.yaw, 0, 'YXZ');
    out.q = (out.q ?? new THREE.Quaternion()).setFromEuler(_e);
    out.D = WALK.FOCUS;
    out.F = (out.F ?? new THREE.Vector3()).copy(_cp).addScaledVector(_dir, WALK.FOCUS);
    out.tan = Math.tan(fov / 2 * DEG);
    return out;
  }
  // the god's view as a far, narrow perspective camera that frames the same ground (the travel's other end)
  function godPose() {
    C.update();
    const oc = C.cam;
    const Hh = Math.max(1, oc.top - oc.bottom);
    const tan = Math.tan(WALK.START_FOV / 2 * DEG);
    const F = C.onPlane(innerWidth / 2, innerHeight / 2, C.target.y) ?? C.target.clone();
    return { q: oc.quaternion.clone(), D: (Hh / 2) / tan, F, tan };
  }
  let A = null, B = null, T = 0; // the travel: from pose A (god) to pose B (the walk's camera), T 0..1 along it
  function poseAt(s) {
    const F = _v.copy(A.F).lerp(B.F, s);
    const D = Math.exp(Math.log(A.D) + (Math.log(B.D) - Math.log(A.D)) * s);
    _q.copy(A.q).slerp(B.q, s);
    const tan = Math.exp(Math.log(A.tan) + (Math.log(B.tan) - Math.log(A.tan)) * s);
    _f.set(0, 0, -1).applyQuaternion(_q);
    cam.position.copy(F).addScaledVector(_f, -D);
    cam.quaternion.copy(_q);
    cam.fov = 2 * Math.atan(tan) / DEG;
    cam.near = Math.max(0.05, Math.min(60, D * 0.02));
    cam.far = Math.max(WALK.FAR, D * 1.5 + 420);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // the far fade and the sky come in over the last part of the way down
    const k = Math.max(0, Math.min(1, (s - 0.55) / 0.45));
    setFade(k * k * (3 - 2 * k));
  }
  function setFade(k) {
    SHADE.far.value.set(WALK.FAR * WALK.FADE_FROM, WALK.FAR * WALK.FADE_TO, k);
  }

  // ---------- drawing limits ----------
  // Every eighth frame, per chunk: land whose nearest edge is past the far plane is switched off, so the renderer
  // does not even test it (the reference's cullFar, which stopped drawing land past 140 blocks from a ground camera;
  // here the far plane is nearer, FAR), and grass, flowers and reeds only within CROSS_FAR.
  let cullT = 0;
  const vis = (m, v) => { if (m && m.visible !== v) m.visible = v; };
  function cull(force) {
    cullT -= 1;
    if (cullT > 0 && !force) return;
    cullT = 8;
    const c2 = WALK.CROSS_FAR * WALK.CROSS_FAR, f2 = (WALK.FAR + 4) ** 2, ex = cam.position.x, ez = cam.position.z, CH = WORLD.CHUNK;
    // during the travel the camera starts high above the land and sees all of it
    const all = cam.position.y > WORLD.GROUND_Y + 40;
    for (const e of ctx.mesher.chunks.values()) {
      const dx = Math.max(e.x0 - ex, 0, ex - (e.x0 + CH)), dz = Math.max(e.z0 - ez, 0, ez - (e.z0 + CH));
      const d2 = dx * dx + dz * dz, near = all || d2 < f2;
      vis(e.solid, near); vis(e.water, near); vis(e.tex, near);
      vis(e.cross, near && d2 < c2);
    }
  }
  function uncull() { for (const e of ctx.mesher.chunks.values()) { vis(e.solid, true); vis(e.water, true); vis(e.tex, true); vis(e.cross, true); } }
  // the frame cap while walking (reference: a deliberate 30 frames a second, which keeps a cheap phone smooth and cool)
  const capFps = (on) => renderer.setTargetFps?.(on ? WALK.FPS : PERF.TARGET_FPS);

  // ---------- going in and out ----------
  let saved = null, fade = null;
  // spot { x, y, z } (feet), yaw and pitch of the camera; face: () => { x, y, z } | null, someone who may move during
  // the travel down (the camera keeps turning to them, so they are in front of it on arrival)
  let faceFn = null;
  // seen from behind, someone straight ahead would stand behind the figure: the camera looks this far (radians, about
  // 24 degrees) to one side of them, so they stand clear of it, to the figure's right
  const faceAside = () => (W.eyeView || !fig ? 0 : 0.42);
  function faceTo(t, rate) {
    const wy = Math.atan2(-(t.x - P.x), -(t.z - P.z)) + faceAside();
    const wp = Math.max(-0.35, Math.min(0.3, Math.atan2(t.y - (P.y + WALK.EYE), Math.hypot(t.x - P.x, t.z - P.z)) - (W.eyeView ? 0 : 0.12)));
    if (rate >= 1) { W.yaw = wy; W.pitch = wp; return; }
    W.yaw += wrap(wy - W.yaw) * rate; W.pitch += (wp - W.pitch) * rate;
  }
  W.enter = (spot, yaw = 0, pitch = 0, face = null) => {
    faceFn = face;
    if (W.mode !== 'off' || !spot) return false;
    if (C.anim) { C.anim.t = 1; C.tick(0); }
    saved = C.state();
    P.x = spot.x; P.z = spot.z; P.y = spot.y ?? V.standY(Math.floor(spot.x), Math.floor(spot.z));
    P.vx = P.vy = P.vz = 0; P.ground = true; stepLift = 0;
    W.yaw = yaw + faceAside(); W.pitch = pitch - (W.eyeView ? 0 : 0.12);
    if (face) { const t = face(); if (t) faceTo(t, 1); }
    W.input.x = W.input.y = 0; jumpReq = false; lookIdle = 0;
    fov = WALK.FOV;
    if (fig) { fig.yaw = W.yaw + Math.PI; fig.group.rotation.y = fig.yaw; fig.group.position.set(P.x, P.y, P.z); }
    colCache.clear();
    W.near = { x: P.x, z: P.z, r2: WALK.FULL_FIGURE ** 2, far2: 0 };
    capFps(true);
    const show = () => { sky.mesh.visible = true; renderer.camera = cam; if (ctx.overlay?.group) ctx.overlay.group.visible = false; if (fig) fig.group.visible = true; };
    if (W.reduce()) { startFade(() => { show(); placeCam(0, true); setFade(1); cull(true); }, 'on'); return true; }
    A = godPose(); B = rigPose(); T = 0;
    W.mode = 'in';
    show();
    // every material the walk can see is made ready now, at the start of the travel, not the first time it comes
    // into view while turning round (that was a single frame of 80 ms on a slowed phone CPU)
    try { renderer.gl.compile(scene, cam); } catch { /* an older three: compiled when first drawn, as before */ }
    updateFigure(0);
    poseAt(0);
    cull(true);
    return true;
  };
  // o.keepGodView: the god's camera was moved on purpose while walking (a battle took over): do not put it back
  W.leave = (o = {}) => {
    if (W.mode === 'off' || W.mode === 'out' || (W.mode === 'fade' && fade?.to === 'off')) return false;
    if (saved && !o.keepGodView) C.restore(saved);
    if (o.instant) { finishLeave(); return true; }
    if (W.reduce() || W.mode === 'fade') { startFade(() => finishLeave(true), 'off'); return true; }
    // from where the camera is now (or where the travel down has got to) back up to the god's view
    if (W.mode === 'in') { /* go back the way it came, from the point reached */ W.mode = 'out'; A = godPose(); return true; }
    A = godPose(); B = rigPose(); T = 1;
    W.mode = 'out';
    return true;
  };
  function finishLeave(keepFade) {
    renderer.camera = C.cam;
    if (ctx.overlay?.group) ctx.overlay.group.visible = true;
    C.update();
    sky.mesh.visible = false;
    if (fig) fig.group.visible = false;
    setFade(0);
    uncull();
    capFps(false);
    W.near = null;
    W.mode = keepFade ? 'fade' : 'off';
    if (!keepFade) { saved = null; W.onDone?.('off'); }
  }
  // a quick cross-fade through the mist's colour: halfway, `mid` switches the view
  const fadeEl = document.createElement('div');
  fadeEl.className = 'walk-fade';
  fadeEl.setAttribute('aria-hidden', 'true');
  fadeEl.style.pointerEvents = 'none';
  (ctx.dom.ui ?? document.body).prepend(fadeEl);
  function startFade(mid, to) {
    fade = { t: 0, mid, to, swapped: false };
    W.mode = 'fade';
  }
  function tickFade(dt) {
    fade.t += dt / WALK.FADE_S;
    const t = Math.min(1, fade.t);
    if (!fade.swapped && t >= 0.5) { fade.swapped = true; fade.mid?.(); }
    const o = t < 0.5 ? t * 2 : (1 - t) * 2;
    fadeEl.style.background = '#' + (renderer._mistHex ?? WORLD.MIST_HEX).toString(16).padStart(6, '0');
    fadeEl.style.opacity = String(Math.max(0, Math.min(1, o)));
    if (t >= 1) {
      fadeEl.style.opacity = '0';
      const to = fade.to; fade = null;
      W.mode = to;
      if (to === 'off') { saved = null; W.onDone?.('off'); } else { gaze = !!faceFn; W.onDone?.('on'); }
    } else if (fade.swapped && fade.to === 'on') { updateFigure(dt); placeCam(dt); }
  }

  // ---------- what the screen asks for ----------
  let gaze = false, jumpReq = false, lookIdle = 9;
  W.look = (dyaw, dpitch) => {
    if (W.mode !== 'on') return;
    gaze = false; // the player has taken the camera: it no longer follows the one they came to see
    lookIdle = 0;
    W.yaw -= dyaw;
    W.pitch = Math.max(-WALK.PITCH_DOWN, Math.min(WALK.PITCH_UP, W.pitch - dpitch));
  };
  W.jump = () => { if (W.mode === 'on') jumpReq = true; };
  // n notches: + is further out, - is closer (reference: past the closest is through the eyes; one notch out leaves it)
  W.zoom = (n) => {
    if (W.mode !== 'on' || !n) return;
    if (W.eyeView) { if (n > 0) { W.eyeView = false; W.camDist = WALK.CAM_MIN; camD = 0.5; } }
    else if (n < 0 && W.camDist <= WALK.CAM_MIN + 0.01) { W.eyeView = true; }
    else W.camDist = Math.max(WALK.CAM_MIN, Math.min(WALK.CAM_MAX, W.camDist + n * WALK.ZOOM_STEP));
  };

  // ---------- each frame ----------
  W.update = (dt) => {
    if (W.mode === 'off') return;
    dt = Math.min(0.1, dt);
    colCache.clear();
    if (W.mode === 'fade') { tickFade(dt); }
    else if (W.mode === 'in' || W.mode === 'out') {
      if (W.mode === 'in' && faceFn) {
        const t = faceFn();
        if (t) { faceTo(t, 1); B = rigPose(B); }
      }
      T = W.mode === 'in' ? Math.min(1, T + dt / WALK.TRAVEL_S) : Math.max(0, T - dt / WALK.TRAVEL_S);
      poseAt(ease(T));
      if (W.mode === 'in' && T >= 1) { gaze = !!faceFn; W.mode = 'on'; placeCam(0, true); setFade(1); W.onDone?.('on'); }
      else if (W.mode === 'out' && T <= 0) finishLeave();
    } else if (W.mode === 'on') {
      // Arriving beside someone, the camera keeps following them (they walk on, often uphill) until the player
      // moves or looks for themselves. Found by the check of 2026-11-15: three seconds after arriving the person
      // had walked out of the view.
      if (gaze && faceFn) {
        const t = faceFn();
        if (!t || Math.hypot(W.input.x, W.input.y) > 0.1 || Math.hypot(t.x - P.x, t.z - P.z) > 30) gaze = false;
        else faceTo(t, 1 - Math.exp(-dt * 5));
      }
      walk(dt);
      updateFigure(dt);
      placeCam(dt);
    }
    if (W.mode !== 'off') {
      if (W.near) {
        W.near.x = cam.position.x; W.near.z = cam.position.z;
        // people and animals past the far plane are not drawn (sim/index.js); not during a travel, which sees far
        W.near.far2 = W.mode === 'on' || (fade?.swapped && fade.to === 'on') ? (WALK.FAR + 6) ** 2 : 0;
      }
      sky.update(cam, renderer);
      cull(false);
    }
  };
  function walk(dt) {
    const I = W.input;
    let ix = I.x, iy = I.y;
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    P.wet = inWater();
    lookIdle += dt;
    // On a phone the camera swings round to sit behind the way you walk, after a look has been left alone for a
    // moment (reference lockCamera). Walking forward is a fixed point, so it never spins; walking back towards the
    // camera never turns it round.
    const backing = iy < -0.3 && Math.abs(ix) < 0.6;
    const sp = Math.hypot(P.vx, P.vz);
    if (W.follow && !gaze && lookIdle > WALK.FOLLOW_WAIT && !backing && sp > 0.6) {
      W.yaw += wrap(Math.atan2(-P.vx, -P.vz) - W.yaw) * Math.min(1, WALK.FOLLOW_RATE * dt);
    }
    // forward is where the camera looks, flattened onto the ground; the walk eases towards the wished speed
    const speed = WALK.SPEED * (P.wet ? WALK.WADE : 1);
    const fx = -Math.sin(W.yaw), fz = -Math.cos(W.yaw), rx = Math.cos(W.yaw), rz = -Math.sin(W.yaw);
    const tvx = (fx * iy + rx * ix) * speed, tvz = (fz * iy + rz * ix) * speed;
    const k = Math.min(1, (P.ground || P.wet ? WALK.ACCEL : WALK.AIR_ACCEL) * dt);
    P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k;
    if (jumpReq) {
      if (P.ground) { P.vy = WALK.JUMP * (P.wet ? 0.95 : 1); P.ground = false; }
      jumpReq = false; // a press is for this frame only (reference)
    }
    const dist = Math.hypot(P.vx, P.vz) * dt + Math.abs(P.vy) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.2));
    for (let i = 0; i < n; i++) {
      const ax = P.vx * dt / n, az = P.vz * dt / n;
      // each axis on its own, so the body slides along a wall instead of sticking to it
      if (ax && !tryMove(ax, 0)) P.vx = 0;
      if (az && !tryMove(0, az)) P.vz = 0;
      vertical(dt / n);
    }
    if (stepLift > 0) stepLift = Math.max(0, stepLift - stepLift * Math.min(1, WALK.STEP_SMOOTH * dt) - 0.3 * dt);
    // the view opens a little at full pace (reference)
    const running = P.ground && !P.wet && Math.hypot(P.vx, P.vz) > WALK.SPEED * 0.6 && !W.reduce();
    fov += ((running ? WALK.FOV_RUN : WALK.FOV) - fov) * (1 - Math.exp(-dt * 6));
    W.speedNow = Math.hypot(P.vx, P.vz);
  }
  function vertical(dt) {
    if (P.vy <= 0 && overlaps(P.x, P.y - 0.05, P.z)) {
      // standing: the feet go onto the top of the block under them (a landing could stop up to 5 cm above it)
      if (!P.ground) { const top = Math.floor(P.y - 0.04) + 1; if (top <= P.y && !overlaps(P.x, top, P.z)) P.y = top; }
      P.ground = true; P.vy = 0; return;
    }
    P.ground = false;
    P.vy = Math.max(-30, P.vy - WALK.GRAVITY * dt);
    const dy = Math.max(-0.9, Math.min(0.9, P.vy * dt));
    const ny = P.y + dy;
    if (dy > 0) {
      // the head meets something: the rise stops just under it
      if (overlaps(P.x, ny, P.z)) { P.vy = 0; P.y = Math.max(P.y, Math.floor(ny + H - 0.01) - H); }
      else P.y = ny;
    } else if (overlaps(P.x, ny, P.z)) { P.y = Math.floor(ny) + 1; if (overlaps(P.x, P.y, P.z)) P.y -= 1; P.vy = 0; P.ground = true; }
    else P.y = ny;
    if (P.y < 0) { P.y = V.standY(Math.floor(P.x), Math.floor(P.z)); P.vy = 0; } // never through the bottom of the world
  }
  // the figure: stands where the body is (eased after a step), turns to the way it walks, swings its limbs
  // (reference Player._updateModel: the same turn rate, stride and settle)
  function updateFigure(dt) {
    if (!fig) return;
    const g = fig.group;
    g.position.set(P.x, P.y - stepLift, P.z);
    const hs = Math.hypot(P.vx, P.vz);
    if (hs > 0.6) {
      fig.yaw += wrap(Math.atan2(P.vx, P.vz) - fig.yaw) * Math.min(1, 12 * dt);
      fig.ph += hs * dt * 2.1;
      const sw = Math.sin(fig.ph) * Math.min(0.62, hs * 0.14);
      fig.legL.rotation.x = sw; fig.legR.rotation.x = -sw;
      fig.armL.rotation.x = -sw * 0.75; fig.armR.rotation.x = sw * 0.75;
      fig.body.rotation.x = 0.06 * Math.min(1, hs / WALK.SPEED);
    } else {
      const s = Math.max(0, 1 - 10 * dt);
      for (const m of [fig.legL, fig.legR, fig.armL, fig.armR, fig.body]) m.rotation.x *= s;
    }
    // in the air the legs tuck a little
    if (!P.ground && !P.wet) { fig.legL.rotation.x = -0.35; fig.legR.rotation.x = 0.2; }
    g.rotation.y = fig.yaw;
    // the soft shadow on the ground under the feet (fades as you rise)
    let y = Math.floor(P.y + 0.05) - 1;
    const sx = Math.floor(P.x), sz = Math.floor(P.z);
    while (y >= 0 && y > P.y - 5 && !isSolid(get(sx, y, sz))) y--;
    const hgt = P.y - (y + 1);
    fig.shadow.position.y = y + 1.03 - g.position.y;
    fig.shadow.visible = hgt < 3;
    fig.shadow.material.opacity = Math.max(0, 0.26 * (1 - hgt / 3));
  }
  // a point on screen (CSS px) for a world point, through the camera (behind: true when it is behind it)
  W.toScreen = (x, y, z) => {
    _v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    const behind = _v.z > -cam.near, depth = -_v.z;
    _v.applyMatrix4(cam.projectionMatrix);
    return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, behind, depth };
  };
  W.sees = (x, y, z) => sees(cam.position.x, cam.position.y, cam.position.z, x, y, z);
  W.findSpot = findSpot;
  W.overlaps = overlaps;
  W.colBlocked = colBlocked;
  W.waterDepth = waterDepth;
  W.camNow = () => camD;
  addEventListener('resize', () => { if (W.mode === 'on') placeCam(0, true); });
  return W;
}

// ---------------------------------------------------------------------------
// The figure you walk as: a plain, pale person with this game's proportions (sim/bodies.js makePerson at
// PERSON_SCALE 1.18), no face, no hair, no dye: an unseen presence, quiet on the land. One draw per moving part,
// the shared figure material (so it fades into the edge mist and lifts at night like everyone else), and a soft
// round shadow. Front is +z, like the people.
function makeFigure() {
  const s = 1.18;
  const PALE = 0xf7f3ea, PALE_LO = 0xe4ddcd, PALE_HI = 0xfffdf7;
  const col = new THREE.Color();
  const box = (list, w, h, d, c, x = 0, y = 0, z = 0, pivotTop = false) => {
    const g = new THREE.BoxGeometry(w * s, h * s, d * s);
    if (pivotTop) g.translate(0, -h * s / 2, 0);
    g.translate(x * s, y * s, z * s);
    col.setHex(c);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    list.push(g);
    return list;
  };
  const weld = (list) => {
    let verts = 0, ic = 0;
    for (const g of list) { verts += g.attributes.position.count; ic += g.index.count; }
    const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), cc = new Float32Array(verts * 3), index = new Uint16Array(ic);
    let vo = 0, io = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); cc.set(g.attributes.color.array, vo * 3);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
      vo += g.attributes.position.count; io += gi.length;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    out.setIndex(new THREE.BufferAttribute(index, 1));
    out.computeBoundingSphere();
    return out;
  };
  // the people's material with a little light of its own, so the side away from the sun stays pale, not grey
  const mat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3730 }), { linearColors: true, figure: true });
  const mesh = (geo) => { const m = new THREE.Mesh(geo, mat); m.userData.noPick = true; return m; };
  // torso, a shoulder mantle, a plain wrap below the belt, the head
  const body = mesh(weld([
    ...box([], 0.5, 0.6, 0.32, PALE, 0, 0.88, 0),
    ...box([], 0.54, 0.08, 0.36, PALE_LO, 0, 0.62, 0),
    ...box([], 0.7, 0.11, 0.44, PALE_HI, 0, 1.17, 0),
    ...box([], 0.56, 0.32, 0.38, PALE, 0, 0.46, 0),
    ...box([], 0.42, 0.42, 0.42, PALE_HI, 0, 1.43, 0),
  ]));
  // the body bends at the hips, so the torso turns round the belt
  body.position.y = 0;
  const leg = weld(box([], 0.17, 0.52, 0.2, PALE_LO, 0, 0, 0, true));
  const arm = weld(box([], 0.13, 0.5, 0.17, PALE, 0, 0, 0, true));
  const legL = mesh(leg), legR = mesh(leg), armL = mesh(arm), armR = mesh(arm);
  legL.position.set(-0.13 * s, 0.58 * s, 0); legR.position.set(0.13 * s, 0.58 * s, 0);
  armL.position.set(-0.33 * s, 1.16 * s, 0); armR.position.set(0.33 * s, 1.16 * s, 0);
  const sg = new THREE.CircleGeometry(0.42, 16);
  sg.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }));
  shadow.renderOrder = 1;
  shadow.userData.noPick = true;
  const group = new THREE.Group();
  group.name = 'walk-figure';
  group.add(body, legL, legR, armL, armR, shadow);
  return { group, body, legL, legR, armL, armR, shadow, yaw: 0, ph: 0 };
}

// ---------------------------------------------------------------------------
// The sky: a gradient from the mist's colour at the horizon (exactly the colour the land fades into, so there is no
// line) to a deeper colour overhead; by night a dark sky with stars and the moon where the game's moonlight comes
// from (MOON_DIR); by day a soft glow round the sun. Drawn first, never written to depth.
function makeSky() {
  const U = {
    uHorizon: { value: new THREE.Vector3(0.8, 0.85, 0.87) },
    uZenith: { value: new THREE.Vector3(0.4, 0.6, 0.85) },
    uNight: { value: 0 },
    uMoonK: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(...MOON_DIR).normalize() },
    uSunDir: { value: new THREE.Vector3(40, 60, 20).normalize() },
    uSunK: { value: 1 },
    uSunCol: { value: new THREE.Vector3(1, 0.9, 0.7) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    depthTest: false, depthWrite: false, fog: false, toneMapped: false,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * viewMatrix * vec4( cameraPosition + position, 1.0 );
        p.z = p.w * 0.99999; // never clipped by the near or far plane
        gl_Position = p;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uHorizon, uZenith, uMoonDir, uSunDir, uSunCol;
      uniform float uNight, uMoonK, uSunK;
      float hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        vec3 c = mix( uHorizon, uZenith, pow( smoothstep( 0.0, 0.6, h ), 0.75 ) );
        if ( uNight > 0.01 && h > 0.0 ) {
          // stars: one in a few hundred cells of a fine grid over the sky, a soft dot in its cell
          vec3 g = d * 150.0;
          vec3 cell = floor( g );
          float s = hash( cell );
          float on = step( 0.9965, s ) * smoothstep( 0.03, 0.3, h );
          float dd = length( fract( g ) - 0.5 );
          c += vec3( 0.82, 0.88, 1.0 ) * on * smoothstep( 0.42, 0.08, dd ) * uNight * ( 0.45 + 0.55 * hash( cell + 7.0 ) );
        }
        // the moon: a pale disc and a faint halo, brighter at full moon
        float md = dot( d, uMoonDir );
        float disc = smoothstep( 0.99962, 0.99978, md );
        c += vec3( 0.55, 0.65, 0.95 ) * ( pow( max( md, 0.0 ), 900.0 ) * 0.35 + pow( max( md, 0.0 ), 40.0 ) * 0.05 ) * uNight * uMoonK;
        c = mix( c, vec3( 0.92, 0.94, 0.98 ) * ( 0.75 + 0.25 * uMoonK ), disc * uNight );
        // the sun: a soft glow and a bright core, by day only
        float sd = max( dot( d, uSunDir ), 0.0 );
        c += uSunCol * ( pow( sd, 2400.0 ) * 1.6 + pow( sd, 60.0 ) * 0.12 + pow( sd, 6.0 ) * 0.05 ) * uSunK;
        gl_FragColor = vec4( c, 1.0 );
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'walk-sky';
  const col = new THREE.Color();
  const DAY_Z = new THREE.Color(0x5f93d4), DUSK_Z = new THREE.Color(0x2d4c94), NIGHT_Z = new THREE.Color(0x04070f);
  const z = new THREE.Color();
  return {
    mesh,
    update(cam, renderer) {
      const N = renderer._night, L = N?.look;
      const night = L?.night ?? 0;
      // the horizon is the edge mist's own colour, in the same space the shader mixes it in
      U.uHorizon.value.copy(SHADE.edgeColor.value);
      // overhead: day blue, through a deep dusk blue, to a near black night
      if (night < 0.5) z.copy(DAY_Z).lerp(DUSK_Z, night * 2); else z.copy(DUSK_Z).lerp(NIGHT_Z, (night - 0.5) * 2);
      if (renderer.rich) U.uZenith.value.set(z.r, z.g, z.b);
      else { col.copy(z).convertLinearToSRGB(); U.uZenith.value.set(col.r, col.g, col.b); }
      U.uNight.value = Math.max(0, Math.min(1, (night - 0.25) / 0.6));
      U.uMoonK.value = N?.moonK ?? 1;
      U.uSunDir.value.copy(renderer.sun.position).normalize();
      U.uSunK.value = Math.max(0, Math.min(1, (L?.sunI ?? 1.55) / 1.55)) * (1 - night);
      const sc = renderer.sun.color;
      U.uSunCol.value.set(sc.r, sc.g, sc.b);
    },
  };
}
