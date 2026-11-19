// How a hunt looks (2026-11-16; the director: "the hunt needs to look real. right now, hunting is one animal just
// falls down. there is no visual of the arrow hitting or spear hitting. this needs to look good." and "weapon we
// should be able to see fly and hit. but ofcourse this should depend on the ZOOM level. how much we have zoomed in.
// it should be logical. proportionate to the size of the weapon. if we are zoomed out too much, naturally we
// wouldnt be able to see it exactly and as thickly. the wounded animal also runs a few steps before dying and
// dropping."). Everything here is look only: no number in this file changes who hunts, what a throw kills or what
// comes home (those are in hunting.js TUNE_HUNT, for the director to decide).
//
// The rule for seeing a small fast thing, in plain words: the spear and the arrow are drawn at their true length
// and thickness, so they shrink as the view zooms out. While the people themselves are drawn in full (the zoom
// where their arms and legs move, T.LOD_PPM, 3.2 screen pixels a metre, and closer), the shaft is never drawn
// thinner than about one screen pixel, the thinnest line a screen can show, so it cannot flicker in and out of
// existence; its length is never stretched. Behind it, a pale streak marks where it was over the last eighth of a
// second, which is what an eye sees of anything that fast (a smear, not a sharp stick), and its stone head catches
// the light once or twice in flight. Zoomed out past the people's full drawing, that one-pixel floor fades away,
// and by 2 pixels a metre the weapon and its streak are their true sub-pixel width: you no longer see the weapon,
// only perhaps the hit, as you would not from that far.
import * as THREE from '../../vendor/three.module.js';
import { T } from './tune.js';

export const HUNT_LOOK = {
  // ---- seeing it fly ----
  MIN_PX: 1.1,          // the shaft and the streak are never thinner than this many screen pixels ...
  FULL_PPM: T.LOD_PPM,  // ... from this zoom in (pixels a metre: people drawn in full) ...
  GONE_PPM: 2.0,        // ... fading to their true width at this zoom out (the phone's farthest is about 2.3)
  TRAIL_S: 0.13,        // the streak: where the weapon was this many seconds ago
  TRAIL_OPACITY: 0.6,
  GLINT_PX: 2.2, GLINT_M: 0.16, // the head's flash: this many pixels across (where people are drawn in full), or its true size
  GLINT_AT: [0.22, 0.62], GLINT_S: 0.07, // when in the flight (share of it) and for how long
  // ---- the flight (how long it takes, not where it goes: the outcome is rolled at release, as before) ----
  SPEAR_FLY: 11,        // a spear's speed in blocks a second (was TUNE_HUNT.SPEAR_SPEED 16: too quick to see)
  SPEAR_ARC: 0.24, SPEAR_ARC_MAX: 3.4, // a spear is lobbed: the arc's height is this share of the throw, at most this
  ARROW_FLY: 19,        // an arrow's speed (a real one is faster; at the true speed it would cross 9 blocks in a fifth of a second)
  ARROW_ARC: 0.1, ARROW_ARC_MAX: 1.4,
  MIN_FLIGHT: 0.35,     // no flight shorter than this
  // ---- a miss ----
  STICK_SPEAR: 0.6, STICK_ARROW: 0.85, // chance a missed throw sticks in the ground (else it skitters on and lies flat)
  SKITTER: [0.8, 2.0], SKITTER_S: 0.32,
  // ---- the hit and the wounded run (animals.js wound) ----
  FLINCH_S: 0.28,       // the animal jerks and rears this long when struck ...
  RUN_DEER: [4.5, 8], RUN_RABBIT: [1.8, 3.4], // ... then runs this far away from the hunter (blocks), on a checked straight walk ...
  RUN_V_DEER: 3.6, RUN_V_RABBIT: 3.3,         // ... starting at its bolting speed ...
  RUN_SLOW_TO: 0.3,     // ... slowing to this share of it by the end, stumbling once or twice ...
  STUMBLE_S: 0.26,
  FALL_S: 0.4,          // ... and drops onto its side over this long (as every animal falls)
  // ---- the burst at the strike ----
  BURST_S: 0.5,
  PULL_AT: 0.45,        // seconds into the butcher pose that the weapon is pulled out of the body
};
const K = HUNT_LOOK;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// The streak, the glint and the bursts: three instanced draws for every hunt on the map.
export function makeHuntFx(ctx, S) {
  const layer = ctx.layers.entities;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const inst = (mat, cap) => {
    const m = new THREE.InstancedMesh(box, mat, cap);
    m.count = 0; m.frustumCulled = false; m.userData.noPick = true;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    layer.add(m);
    return m;
  };
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: K.TRAIL_OPACITY, depthWrite: false });
  const trails = inst(trailMat, 128);
  const glints = inst(new THREE.MeshBasicMaterial({ color: 0xffffff }), 16);
  const bits = inst(new THREE.MeshBasicMaterial({ color: 0xffffff }), 192);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const Z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();

  // the smallest width, in metres, that a thing may be drawn at this zoom: px screen pixels where people are drawn
  // in full, fading to nothing by GONE_PPM (see the rule above)
  function floorM(px) {
    const ppm = ctx.camera?.ppm ?? 4;
    return px * clamp01((ppm - K.GONE_PPM) / (K.FULL_PPM - K.GONE_PPM)) / Math.max(0.1, ppm);
  }
  // a weapon's cross-section: its true thickness, or the floor (base: the scale it carries for its parent)
  function shape(mesh, thick, base = 1) {
    const k = Math.max(1, floorM(K.MIN_PX) / thick);
    mesh.scale.set(base * k, base * k, base);
  }

  // ---- a flight's streak and glint: called each step for every weapon still in the air ----
  // fl: { mesh, hist: [{x, y, z, t}], t, dur, thick, half, glint }
  let nt = 0, ng = 0;
  function beginFrame() { nt = 0; ng = 0; }
  function flight(fl) {
    const now = fl.t, pos = fl.mesh.position;
    (fl.hist ??= []).push({ x: pos.x, y: pos.y, z: pos.z, t: now });
    while (fl.hist.length > 2 && now - fl.hist[1].t > K.TRAIL_S) fl.hist.shift();
    const w = Math.max(fl.thick, floorM(K.MIN_PX));
    const day = 0.35 + 0.65 * (S.daylight ?? 1);
    // the streak starts at the weapon's tail and runs back along the way it came, thinning and dimming
    _d.set(0, 0, 1).applyQuaternion(fl.mesh.quaternion);
    const tx = -_d.x * fl.half, ty = -_d.y * fl.half, tz = -_d.z * fl.half;
    const H = fl.hist, n = H.length;
    for (let i = n - 1; i > 0 && nt < 128; i--) {
      const a = H[i], b = H[i - 1];
      const ax = a.x + tx, ay = a.y + ty, az = a.z + tz, bx = b.x + tx, by = b.y + ty, bz = b.z + tz;
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      if (len < 1e-3) continue;
      const age = clamp01((now - (a.t + b.t) / 2) / K.TRAIL_S);
      _p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      _q.setFromUnitVectors(Z, _d.set((ax - bx) / len, (ay - by) / len, (az - bz) / len));
      const ww = w * (1 - 0.6 * age);
      _s.set(ww, ww, len);
      trails.setMatrixAt(nt, _m.compose(_p, _q, _s));
      const k = (1 - 0.75 * age) * day;
      trails.setColorAt(nt, _c.setRGB(0.97 * k, 0.93 * k, 0.84 * k));
      nt++;
    }
    // the stone head catches the light, once early and once late in the flight
    const u = fl.t / Math.max(1e-3, fl.dur), g = K.GLINT_S / Math.max(1e-3, fl.dur);
    for (const at of K.GLINT_AT) {
      const k = 1 - Math.abs(u - at) / g;
      if (k <= 0 || ng >= 16) continue;
      _d.set(0, 0, 1).applyQuaternion(fl.mesh.quaternion);
      _p.set(pos.x + _d.x * fl.tipZ, pos.y + _d.y * fl.tipZ, pos.z + _d.z * fl.tipZ);
      const sz = Math.max(K.GLINT_M, floorM(K.GLINT_PX)) * (0.4 + 0.6 * k);
      _q.identity(); _s.set(sz, sz, sz);
      glints.setMatrixAt(ng, _m.compose(_p, _q, _s));
      glints.setColorAt(ng, _c.setRGB(1, 0.97, 0.85));
      ng++;
    }
  }

  // ---- bursts: a puff of hair and a fleck or two of blood at a hit, a little dust at a miss ----
  const parts = [];
  // kind: 'deer' | 'rabbit' | 'dust'; dir: {x, z} the way the weapon was going
  function burst(x, y, z, kind, dir = { x: 0, z: 0 }) {
    const rnd = Math.random; // look only (it draws from the same stream as the game, as every look does)
    const n = kind === 'deer' ? 11 : kind === 'rabbit' ? 7 : 6;
    for (let i = 0; i < n && parts.length < 192; i++) {
      const blood = kind !== 'dust' && i % 4 === 3;
      const a = rnd() * 6.283, sp = kind === 'dust' ? 0.6 + rnd() * 0.8 : 1.2 + rnd() * 1.8;
      const col = kind === 'dust' ? 0xb8a07a : blood ? 0x7c1f16 : kind === 'deer' ? (rnd() < 0.5 ? 0xc08a50 : 0xe8dcc0) : (rnd() < 0.5 ? 0xa48a6c : 0xf2eee6);
      parts.push({
        x, y, z, vx: Math.cos(a) * sp * 0.6 + dir.x * 1.2, vy: (kind === 'dust' ? 0.6 : 1.4) + rnd() * 1.4, vz: Math.sin(a) * sp * 0.6 + dir.z * 1.2,
        t: 0, life: K.BURST_S * (0.6 + rnd() * 0.5), size: kind === 'dust' ? 0.14 + rnd() * 0.1 : blood ? 0.06 : 0.08 + rnd() * 0.06, col, dust: kind === 'dust',
      });
    }
  }
  function endFrame(dt) {
    let nb = 0;
    const ground = (x, z) => (S.land ? S.land.topAt(Math.floor(x), Math.floor(z)) + 1 : -1e9);
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.t += dt;
      if (q.t >= q.life) { parts.splice(i, 1); continue; }
      q.vy -= (q.dust ? 1.5 : 9) * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const gy = ground(q.x, q.z); if (q.y < gy + 0.03) { q.y = gy + 0.03; q.vx *= 0.5; q.vz *= 0.5; q.vy = 0; }
      const k = 1 - q.t / q.life;
      const sz = Math.max(q.size, floorM(1.3)) * (q.dust ? 0.6 + 0.8 * (1 - k) : 0.35 + 0.65 * k);
      _p.set(q.x, q.y, q.z); _q.identity(); _s.set(sz, sz, sz);
      bits.setMatrixAt(nb, _m.compose(_p, _q, _s));
      bits.setColorAt(nb, _c.setHex(q.col));
      nb++;
    }
    for (const [m, n] of [[trails, nt], [glints, ng], [bits, nb]]) {
      m.count = n;
      if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    }
  }
  return { floorM, shape, beginFrame, flight, burst, endFrame };
}
