// The powers the god can use, as data: one file of power data per line, each
// file's default export an array of powers (docs/STAGE2-CONTRACTS.md). They are
// registered in this order; the dock groups them by `group` in order of first
// appearance. Each agent adds lines ONLY in its own block.
export const POWERS = [
  // ---- stage 1, on the seam: the worked example ----
  () => import('./power-strike.js'),

  // ---- A. Hardships and mercy: lines below, up to the next marker ----
  () => import('./powers-nature.js'),

  // ---- B. Minds: lines below, up to the next marker ----
  () => import('./powers-minds.js'),

  // ---- C. Clans: lines below, up to the end ----
  () => import('./powers-clans.js'),

  // ---- L. Raising the dead: Resurrect, aimed at a grave (sim/resurrect.js) ----
  () => import('./powers-resurrect.js'),

];
