// The season, as the food rules read it: sowing, crops perishing in winter, berries fruiting. The one clock is the
// seasons work's (sim/season.js, sim.ask('season') -> { name, index, t, round, secs }, secs being a season's
// length); these are only readers of it, so every food rule asks the same way. (The food work first had its own
// stand-in clock here, written before the seasons were built; it is gone, 2026-11-16.)
// With the season subsystem left out (a ?off= switch, a check that loads no subsystems), or T.FOOD_SEASONS false
// (for measuring a world without winter), food sees an endless summer.
import { T } from './tune.js';

const SUMMER = { name: 'summer', index: 1, t: 0.5, round: 0, secs: Infinity, off: true };

export function seasonOf(S) {
  if (T.FOOD_SEASONS === false) return SUMMER;
  const s = S.seam?.ask?.('season');
  return s && s.name ? s : SUMMER;
}
// game seconds left in this season, and until winter begins (0 in winter); Infinity with no seasons
export function secsLeft(S) { const s = seasonOf(S); return s.off ? Infinity : (1 - s.t) * s.secs; }
export function secsToWinter(S) {
  const s = seasonOf(S);
  if (s.off) return Infinity;
  if (s.name === 'winter') return 0;
  return secsLeft(S) + (2 - s.index) * s.secs;
}
export const isWinter = (S) => seasonOf(S).name === 'winter';
// berries fruit in these seasons (T.BERRY_FRUIT)
export const berrySeason = (S) => (T.BERRY_FRUIT ?? ['summer', 'autumn']).includes(seasonOf(S).name);
