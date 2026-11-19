// The wind as a rain cloud feels it. Rain drifts with the wind (the director, 2026-11-17: "the rain needs to move with
// the wind. wind in one direction and rain in another direction is weird"). The wind is sim/wind.js's, the one the
// wind lines draw, asked at the season clock's time the drift is worked out for:
//   ask('windAtTime', { x, z, secs }) -> { dir, speed, gust }   dir: the heading the air moves TOWARD, atan2(dz, dx) in
//                                        world blocks; speed: blocks a game second for a thing it carries
// so a shower's path, worked out in steps (sim/season.js), meets the wind of each step's own time, in play and in a
// skip alike. With no wind at all (sim/wind.js left out) the air is still and rain stays where it formed.
export const STILL = { dir: 0, speed: 0, gust: 0 };

// ask: the simulation's ask (R.ask or sim.ask)
export function makeWindNow(ask) {
  return (x, z, secs) => {
    let w = null;
    try { w = ask?.('windAtTime', { x, z, secs }) ?? null; } catch { w = null; }
    return w && Number.isFinite(w.dir) && Number.isFinite(w.speed) ? w : STILL;
  };
}
