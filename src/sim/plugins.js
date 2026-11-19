// The simulation's subsystems, loaded in this order by index.js (their hooks
// run in this order too). One line per subsystem; each agent adds lines ONLY in
// its own block, so merges never touch the same lines. A subsystem is a module
// whose default export is { id, tune?, init(R) } (docs/STAGE2-CONTRACTS.md).
export const PLUGINS = [
  // ---- stage 1, on the seam: the worked example ----
  () => import('./power-strike.js'),

  // ---- S. Seasons and weather: the season clock, the weather plan, what natural rain does (docs/SIM.md) ----
  () => import('./season.js'),
  // ---- W. The wind: one wind for the land, turning slowly, in gusts and lulls (docs/SIM.md "The wind") ----
  () => import('./wind.js'),

  // ---- A. Hardships and mercy: lines below, up to the next marker ----
  () => import('./hardship.js'),
  () => import('./powers-nature.js'),

  // ---- B. Minds: lines below, up to the next marker ----
  () => import('./science.js'),
  () => import('./thoughts-given.js'),
  () => import('./commandments.js'),

  // ---- E. Hunting and sleeping out: lines below, up to the next marker ----
  () => import('./hunting.js'),
  () => import('./camp.js'),

  // ---- K. Fish and fishing: fish in the water, people fishing from the bank (docs/SIM.md "Fish") ----
  () => import('./fish.js'),
  () => import('./fishing.js'),

  // ---- C. Clans: lines below, up to the end ----
  () => import('./clans.js'),
  () => import('./fights.js'),
  () => import('./clans-powers.js'),

  // ---- E. Faith: how far acts are seen, word spreading, upbringing, the fade (docs/FAITH.md) ----
  () => import('./faith.js'),

  // ---- Foresight (warnings with the time left, and what you could have done): its own line ----
  () => import('./foresight.js'),

  // ---- F. Caves: first homes carved by the god, shelter under trees for the homeless (docs/SIM.md) ----
  () => import('./caves.js'),
  () => import('./shelter.js'),

  // ---- G. The three forces: strength, the levels and states, great people, blessed lines, prayers (docs/FORCES.md) ----
  () => import('./forces.js'),
  () => import('./forces-great.js'),
  () => import('./forces-prayers.js'),

  // ---- H. Choices that matter: every bad thing has a use, turning points, both futures (docs/CHOICES.md) ----
  () => import('./ecology.js'),
  () => import('./turning.js'),
  () => import('./futures.js'),   // last: it reads every other forecast extender's lines
  () => import('./gods.js'),      // testing aid: the four scripted gods (idle unless a policy is set)

  // ---- I. Joining pass: graves, a lasting record per death for the screen (after foresight: it reads its account) ----
  () => import('./graves.js'),
  // ---- L. Raising the dead in the main game: the power 'resurrect', aimed at a grave (after graves: it reads them) ----
  () => import('./resurrect.js'),

  // ---- J. Battles: an enemy people every 125 years, with its own god (docs/BATTLES.md) ----
  () => import('./battle.js'),
];
