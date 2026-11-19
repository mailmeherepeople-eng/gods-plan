// What falling rain shares between its two looks: the seasons' showers (view/seasons.js makeWeather) and the god's
// rain (sim/powers-nature-rain.js). DESIGN.md "Rain of a proper size that moves" (the director, 2026-11-17).
//   lean   the streaks lean with the wind: their tops are upwind of where they land, more in a stronger wind (the
//          slant grows with the square of the speed, as weather usually reads), eased so a turn of the wind never snaps
//   box    streaks are scattered over the box round what the camera sees and tiled, so a rain of any size is as
//          thick on screen as any other and the cost never grows with its size; the rain's own disc then keeps the
//          streaks inside it (a quarter of the map does not look thin)
export const RAIN_LOOK = {
  LEAN_BASE: 0.08,       // tan of the slant in still air
  LEAN_PER_SPEED2: 0.012, // and this much more for each (blocks a second) squared of wind
  LEAN_MAX: 0.62,        // at most this (about 32 degrees)
  LEAN_HALF_S: 1.2,      // real seconds for a change of wind to show half way in the slant
  BOX_MARGIN: 1.12,      // the streak box is this much bigger than the view
};
const L = RAIN_LOOK;

// the slant a wind (dir: heading it blows toward, speed: blocks a second) gives a streak: out.x, out.y are the
// sideways world x and z a streak moves per block it falls (its top leans upwind)
export function leanFor(dir, speed, out) {
  const k = Math.min(L.LEAN_MAX, L.LEAN_BASE + L.LEAN_PER_SPEED2 * (speed || 0) * (speed || 0));
  out.x = Math.cos(dir || 0) * k; out.y = Math.sin(dir || 0) * k;
  return out;
}
// ease a Vector2 lean toward a target, frame rate independent (dt in real seconds)
export function easeLean(cur, target, dt) {
  const a = 1 - Math.exp(-Math.LN2 / L.LEAN_HALF_S * Math.max(0, dt));
  cur.x += (target.x - cur.x) * a; cur.y += (target.y - cur.y) * a;
  return cur;
}
// a few sizes, so zooming rarely re-tiles
const quant = (v) => Math.pow(2, Math.ceil(Math.log2(Math.max(16, v)) * 4) / 4);
// the box round the view the streaks are tiled over: out (Vector4) = x0, z0, width, depth
export function viewBox(cam, span, out) {
  const c = cam?.cam;
  if (!c) { out.set(0, 0, 300, 300); return out; }
  const w = (c.right - c.left), dep = (c.top - c.bottom) / (cam.sinP ? cam.sinP() : 1) + span * 1.2;
  const cy = Math.abs(Math.cos(cam.yaw || 0)), sy = Math.abs(Math.sin(cam.yaw || 0));
  const bw = quant((w * cy + dep * sy) * L.BOX_MARGIN + 6), bd = quant((w * sy + dep * cy) * L.BOX_MARGIN + 6);
  out.set(cam.target.x - bw / 2, cam.target.z - bd / 2, bw, bd);
  return out;
}
// the GLSL both shaders use: a seed's place in the tiled view box
export const GLSL_TILE = /* glsl */ `
vec2 rainTile( vec2 s, vec4 box ) {
  vec2 b = s * box.zw;
  return b + box.zw * ceil( ( box.xy - b ) / box.zw );
}`;
