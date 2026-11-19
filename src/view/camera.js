// The view from the air: an orthographic camera looking at a target on the
// ground, tilted anywhere from straight down ("plan", 90 degrees) to nearly
// level (PITCH_MIN), turned in 90 degree steps or freely, zoomed toward the
// cursor. The usual tilt is TILT; the player's own tilt is kept in the HUD's
// settings (ui/touch.js, the tilt panel). The canvas fills the window; `view` is
// the part of it the HUD leaves free, so the camera's frustum is shifted to
// centre the target in that part.
// Ported from the source repo's dev/planner/camera.js. Changed: the clamp keeps
// the target inside the world (was 20 m outside it) and a minimum zoom keeps
// the view from showing much more than the world, so the player can never
// scroll off into nothing; heights default to the ground (GROUND_Y + 1).
import * as THREE from '../../vendor/three.module.js';
import { WORLD } from '../config.js';
import { X0, Z0, X1, Z1 } from '../edit/vox.js';

const GY = WORLD.GROUND_Y + 1;
// how much of the view may be beyond the world when zoomed all the way out:
// the visible ground is at most this many times the world's size
const ZOOM_OUT_SLACK = 1.2;
// the target stays this far inside the edge (the outer band is mist anyway)
const EDGE_INSET = Math.round(WORLD.EDGE_FADE * 0.5);
const OVERSHOOT = WORLD.EDGE_FADE + 8;
const DEG = Math.PI / 180;
// the tilt: how far the view looks down from level. TILT is the usual one; straight down is a true plan view;
// PITCH_MIN is the lowest the player can tilt (the director's "almost straight"; DESIGN.md, "Tilting the overhead view")
export const TILT = 52 * DEG;
export const PITCH_MAX = 90 * DEG;
export const PITCH_MIN = 12 * DEG;
const PLAN_AT = 89.5 * DEG;          // from here up the view counts as the plan view (C.mode 'plan')
const clampPitch = (p) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, Number.isFinite(p) ? p : TILT));

// the area the view is kept to: the home world's bounds, unless another place (the battleground) set its own
let area = null;
const BX0 = () => (area ? area.x0 : X0), BZ0 = () => (area ? area.z0 : Z0), BX1 = () => (area ? area.x1 : X1), BZ1 = () => (area ? area.z1 : Z1);
export function makeCamera(G) {
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 2000);
  const C = {
    cam,
    target: new THREE.Vector3((X0 + X1) / 2, GY, (Z0 + Z1) / 2),
    ppm: 4,               // pixels per metre (the zoom)
    yaw: 0,               // 0: north is up
    pitch: TILT,
    mode: 'tilt',         // 'plan' when the tilt is (nearly) straight down, else 'tilt'; follows the pitch
    lastTilt: TILT,       // the tilt T goes back to from the plan view
    view: { x: 0, y: 0, w: innerWidth, h: innerHeight }, // the free map area, CSS px
    anim: null,
  };
  const D = 600;
  C.fwd = () => new THREE.Vector3(-Math.sin(C.yaw), 0, -Math.cos(C.yaw)); // screen-up on the ground
  C.right = () => new THREE.Vector3(Math.cos(C.yaw), 0, -Math.sin(C.yaw));
  // how much a metre of ground shrinks up the screen (1 straight down); the true sine, never below the lowest tilt's
  C.sinP = () => Math.max(Math.sin(PITCH_MIN), Math.sin(C.pitch));
  C.update = () => {
    C.mode = C.pitch >= PLAN_AT ? 'plan' : 'tilt';
    const f = C.fwd();
    const p = C.target.clone().addScaledVector(f, -Math.cos(C.pitch) * D);
    p.y += Math.sin(C.pitch) * D;
    cam.position.copy(p);
    cam.up.copy(f);
    cam.lookAt(C.target);
    // frustum: the whole canvas, with the view's centre on the target
    const W = innerWidth, H = innerHeight, v = C.view, k = 1 / C.ppm;
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    cam.left = -cx * k; cam.right = (W - cx) * k;
    cam.top = cy * k; cam.bottom = -(H - cy) * k;
    cam.near = 1; cam.far = D * 2.2;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  };
  // a ray from a point on screen (CSS px)
  const rc = new THREE.Raycaster();
  C.ray = (px, py) => {
    rc.setFromCamera(new THREE.Vector2((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1), cam);
    return rc.ray.clone();
  };
  C.raycaster = (px, py) => { rc.setFromCamera(new THREE.Vector2((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1), cam); return rc; };
  // where a ray meets the flat plane y = h
  C.onPlane = (px, py, h = C.target.y) => {
    const r = C.ray(px, py);
    if (Math.abs(r.direction.y) < 1e-6) return null;
    const t = (h - r.origin.y) / r.direction.y;
    return r.origin.clone().addScaledVector(r.direction, t);
  };
  const v3 = new THREE.Vector3();
  C.toScreen = (x, y, z) => {
    v3.set(x, y, z).project(cam);
    return { x: (v3.x + 1) / 2 * innerWidth, y: (1 - v3.y) / 2 * innerHeight, behind: v3.z > 1 || v3.z < -1 };
  };
  // the smallest zoom (pixels per metre) at which the visible ground is no more
  // than ZOOM_OUT_SLACK times the world, whichever way it is turned. Flatter
  // than the usual tilt, the ground seen up the screen is ALSO kept to that
  // (a view nearly level, zoomed out, would be a thin strip of land floating in
  // mist): the lower the tilt, the closer the farthest zoom.
  C.minPpm = () => {
    const v = C.view, span = Math.max(BX1() - BX0(), BZ1() - BZ0()) * ZOOM_OUT_SLACK;
    const c = Math.abs(Math.cos(C.yaw)), s = Math.abs(Math.sin(C.yaw));
    const across = span * (c + s), up = span * (c + s) * C.sinP();
    const loose = Math.min(v.w / across, v.h / up);
    return Math.max(0.8, C.pitch < TILT ? Math.max(loose, v.h / up) : loose);
  };
  C.zoomAt = (px, py, factor) => {
    const before = C.onPlane(px, py);
    C.ppm = Math.max(C.minPpm(), Math.min(80, C.ppm * factor));
    C.update();
    const after = C.onPlane(px, py);
    if (before && after) { C.target.x += before.x - after.x; C.target.z += before.z - after.z; }
    C.clamp(); C.update();
  };
  C.panPx = (dx, dy) => { // move the view by screen pixels
    const k = 1 / C.ppm;
    const f = C.fwd(), r = C.right();
    const sy = 1 / C.sinP(); // tilted: a screen pixel up covers more ground
    C.target.addScaledVector(r, -dx * k).addScaledVector(f, dy * k * sy);
    C.clamp(); C.update();
  };
  // the target stays far enough inside that the view never shows more than
  // OVERSHOOT metres past the edge (measured along the view's shorter half;
  // never less than EDGE_INSET from the edge, never past the middle). Flatter
  // than the usual tilt, the screen reaches further over the ground up and down
  // it; that extra reach is added to the inset along the way the view looks,
  // so the far edge never shows more mist beyond it than at the usual tilt
  // (at the usual tilt and steeper nothing changes)
  C.clamp = () => {
    C.pitch = clampPitch(C.pitch);
    if (C.ppm < C.minPpm()) C.ppm = C.minPpm();
    const v = C.view;
    const sUsual = Math.max(C.sinP(), Math.sin(TILT));
    const half = Math.min(v.w / 2 / C.ppm, v.h / 2 / C.ppm / sUsual);
    const extra = v.h / 2 / C.ppm * (1 / C.sinP() - 1 / sUsual);
    const inset = area?.inset ?? EDGE_INSET, over = area?.over ?? OVERSHOOT;
    const ix = Math.min((BX1() - BX0()) / 2, Math.max(inset, half - over) + extra * Math.abs(Math.sin(C.yaw)));
    const iz = Math.min((BZ1() - BZ0()) / 2, Math.max(inset, half - over) + extra * Math.abs(Math.cos(C.yaw)));
    C.target.x = Math.max(BX0() + ix, Math.min(BX1() - ix, C.target.x));
    C.target.z = Math.max(BZ0() + iz, Math.min(BZ1() - iz, C.target.z));
  };
  // ---- the player's tilt ----
  // Every change the PLAYER makes goes through setPitch / tiltBy / resetTilt / setMode (or, for the fingers, ends
  // with C.tilted()), and each calls C.onTilt(pitch it is going to) so the HUD can keep it in the settings. Things
  // the game does by itself (a battle opening, the title) set C.pitch directly and are never remembered.
  const told = () => { try { C.onTilt?.(C.anim?.to?.pitch ?? C.pitch); } catch { /* the HUD's business */ } };
  // 'plan': straight down (the tilt it leaves is kept for the way back); 'tilt': back to that kept tilt
  C.setMode = (m) => {
    if (m === 'plan') { const at = C.anim?.to?.pitch ?? C.pitch; if (at < PLAN_AT) C.lastTilt = at; animateTo({ pitch: PITCH_MAX }); }
    else animateTo({ pitch: C.lastTilt < PLAN_AT ? C.lastTilt : TILT });
    told();
  };
  // the tilt, freely: set it (radians, kept within the range; dur 0 = at once). quiet: not the player's doing
  C.setPitch = (p, dur = 0, quiet = false) => {
    p = clampPitch(p);
    if (p < PLAN_AT) C.lastTilt = p;
    if (dur) animateTo({ pitch: p }, dur);
    else {
      if (C.anim) C.anim.to.pitch = p;
      C.pitch = p;
      C.clamp(); C.update();
    }
    if (!quiet) told();
  };
  C.tiltBy = (d) => C.setPitch((C.anim ? C.anim.to.pitch : C.pitch) + d);
  // back to the usual tilt (the small control beside the compass, ui/touch.js)
  C.resetTilt = () => { C.lastTilt = TILT; animateTo({ pitch: TILT }, 0.35); told(); };
  // the fingers set C.pitch as they move and say when they are done
  C.tilted = () => { C.pitch = clampPitch(C.pitch); if (C.pitch < PLAN_AT) C.lastTilt = C.pitch; told(); };
  C.pitchRange = () => ({ min: PITCH_MIN, max: PITCH_MAX, usual: TILT });
  C.turn = (q) => animateTo({ yaw: (C.anim ? C.anim.to.yaw : C.yaw) + q * Math.PI / 2 });
  C.snapYaw = () => animateTo({ yaw: Math.round(C.yaw / (Math.PI / 2)) * Math.PI / 2 });
  // back to north up by the shorter way round (the compass a finger taps after a free turn)
  C.northUp = () => animateTo({ yaw: Math.round(C.yaw / (Math.PI * 2)) * Math.PI * 2 }, 0.35);
  // how far the view is turned from north up, -PI .. PI (0: north is up)
  C.turned = () => { const t = C.yaw % (Math.PI * 2); return t > Math.PI ? t - Math.PI * 2 : t < -Math.PI ? t + Math.PI * 2 : t; };
  // frame a box of the world [x0, z0, x1, z1]
  C.frame = (x0, z0, x1, z1, y = GY, instant = false) => {
    const w = Math.max(6, x1 - x0), d = Math.max(6, z1 - z0);
    const v = C.view;
    // the box turned into the view: its extent across and up the screen
    const c = Math.abs(Math.cos(C.yaw)), s = Math.abs(Math.sin(C.yaw));
    // (a little room for what stands on the ground: as before down to about 22 degrees, then less)
    const sp = C.sinP(), across = w * c + d * s, up = (w * s + d * c) * Math.max(sp, Math.min(0.6, sp * 1.6)) + 6;
    const ppm = Math.max(C.minPpm(), Math.min(40, Math.min(v.w * 0.86 / across, v.h * 0.86 / up)));
    animateTo({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, y, ppm }, instant ? 0 : 0.35);
  };
  function animateTo(to, dur = 0.3) {
    const from = { x: C.target.x, y: C.target.y, z: C.target.z, ppm: C.ppm, yaw: C.yaw, pitch: C.pitch };
    // a new animation keeps where a running one was going (T during a turn still finishes the turn)
    C.anim = { from, to: { ...(C.anim ? C.anim.to : from), ...to }, t: 0, dur };
    if (!dur) { C.anim.t = 1; C.tick(0); }
  }
  C.tick = (dt) => {
    const a = C.anim;
    if (!a) return false;
    a.t = a.dur ? Math.min(1, a.t + dt / a.dur) : 1;
    const k = a.t < 1 ? 1 - (1 - a.t) ** 3 : 1;
    const L = (p) => a.from[p] + (a.to[p] - a.from[p]) * k;
    C.target.set(L('x'), L('y'), L('z'));
    C.ppm = L('ppm'); C.yaw = L('yaw'); C.pitch = L('pitch');
    C.clamp();
    C.update();
    if (a.t >= 1) C.anim = null;
    return true;
  };
  // the ground footprint of the view (for the minimap): four corners
  C.footprint = (h = GY) => {
    const v = C.view;
    return [[v.x, v.y], [v.x + v.w, v.y], [v.x + v.w, v.y + v.h], [v.x, v.y + v.h]].map(([px, py]) => C.onPlane(px, py, h)).filter(Boolean);
  };
  C.bounds = () => ({ x0: BX0(), z0: BZ0(), x1: BX1(), z1: BZ1() });
  // keep the view to another area { x0, z0, x1, z1, inset?, over? } (the battleground), or null for the home world
  C.setArea = (b) => { area = b ? { ...b } : null; C.clamp(); C.update(); };
  C.area = () => area;
  // the free map area the HUD leaves (CSS px); null = the whole window. Kept
  // across window resizes (a null view follows the window).
  let customView = null;
  C.setView = (r) => {
    customView = r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
    C.view = customView ?? { x: 0, y: 0, w: innerWidth, h: innerHeight };
    C.clamp(); C.update();
  };
  C.onResize = () => C.setView(customView);
  C.state = () => ({ x: C.target.x, y: C.target.y, z: C.target.z, ppm: C.ppm, yaw: C.yaw, pitch: C.pitch, mode: C.mode });
  C.restore = (s) => {
    if (!s) return;
    C.target.set(s.x, s.y ?? GY, s.z); C.ppm = s.ppm; C.yaw = s.yaw ?? 0;
    // (a state saved before the tilt was free has only its mode)
    C.pitch = clampPitch(Number.isFinite(s.pitch) ? s.pitch : s.mode === 'plan' ? PITCH_MAX : TILT);
    C.update();
  };
  C.update();
  return C;
}
