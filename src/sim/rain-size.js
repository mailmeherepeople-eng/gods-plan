// How big a rain is (DESIGN.md "Rain of a proper size that moves", the director 2026-11-17: "every rain cloud has
// to be a minimum size of at least 1/8th of the screen, which is then randomised unless someone selects a
// particular size. the prayer rain is always 1/4th"). Read as a share of the whole MAP's area (his note and sketch
// divide the map in four), so a rain keeps its size when he zooms. Every rule still sees a rain as one circle
// { x, z, r }: r is the radius of a circle of that area. The numbers here are the only place a rain's size is set.
import { X0, X1, Z0, Z1 } from '../edit/vox.js';

export const RAIN_SIZE = {
  MIN: 1 / 8,               // no rain is smaller than this share of the map
  SHOWER: [1 / 8, 1 / 4],   // a natural shower: a random share between these (by area, every share as likely)
  PRAYER: 1 / 4,            // a rain sent to answer a prayer, always
  ANY: [1 / 8, 1 / 4],      // the god's Rain left at "Any": a random share between these, drawn before he sends it
  STEPS: [1 / 8, 1 / 4, 3 / 8, 1 / 2], // the god's Rain's size control, after "Any"
  STEP_NAMES: ['Any', '1/8', '1/4', '3/8', '1/2'],
  SUGGEST: 1 / 8,           // a rain the game suggests that is not a prayer's own (foresight's options, a drought or
                            // fire's "Bring rain there", the scripted test gods)
};

export const MAP_AREA = (X1 - X0) * (Z1 - Z0);
// the radius of a circle covering this share of the map, and back
export const rOfShare = (s) => Math.sqrt(Math.max(0, s) * MAP_AREA / Math.PI);
export const shareOfR = (r) => (Math.PI * r * r) / MAP_AREA;
// a random share between two, u in 0..1
export const shareBetween = (pair, u) => pair[0] + (pair[1] - pair[0]) * u;
export const PRAYER_R = rOfShare(RAIN_SIZE.PRAYER);
export const SUGGEST_R = rOfShare(RAIN_SIZE.SUGGEST);
export const MIN_R = rOfShare(RAIN_SIZE.MIN);
// the god's Rain's size control: step 0 is "Any" (the share drawn for him, u in 0..1), then the named steps
export const godRainR = (step, u) => {
  const k = Math.round(Number(step) || 0);
  return k <= 0 ? rOfShare(shareBetween(RAIN_SIZE.ANY, u)) : rOfShare(RAIN_SIZE.STEPS[Math.min(RAIN_SIZE.STEPS.length, k) - 1]);
};
