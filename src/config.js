// Every tunable number the engine shares lives here. Change the world's size
// with WORLD_SIZE alone: everything else (bounds, camera clamp, edge mist,
// chunk counts) is derived from it at load.

// The world is square, WORLD_SIZE blocks each way (1 block = 1 metre).
// DESIGN.md: 300 x 300 to begin, expected to grow as faith spreads later.
export const WORLD_SIZE = 300;

export const WORLD = {
  SIZE_X: WORLD_SIZE,
  SIZE_Z: WORLD_SIZE,
  // Height of the voxel volume. 48 leaves 15 blocks below the ground to dig
  // rivers, lakes and pits, and 32 above it for hills and mountains.
  SIZE_Y: 48,
  CHUNK: 16,
  // y of the top solid block (grass) of the blank world. Things stand at
  // GROUND_Y + 1. y 0 is bedrock: tools should never dig it out.
  GROUND_Y: 15,
  DIRT_DEPTH: 3, // dirt blocks under the grass, stone below that
  // Edge mist: over this many blocks in from each edge the land dissolves
  // into the background colour, so no border or cliff ever shows.
  EDGE_FADE: 22,
  // The colour of the mist beyond the world (also the page background).
  MIST_HEX: 0xcfd9dd,
};

// ---------------------------------------------------------------------------
// Quality tier (ported from the source repo's constants.js, trimmed to what
// this game reads). ?q=low or ?q=high forces a tier.
const TIERS = {
  high: { maxPixelRatio: 1.5, meshBudget: 4 },
  low: { maxPixelRatio: 1.25, meshBudget: 1 },
};

function pickTier() {
  let forced = null;
  try { forced = new URLSearchParams(location.search).get('q'); } catch { /* no location */ }
  if (forced === 'low' || forced === 'high') return forced;
  let coarse = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* older engines */ }
  if (!coarse) return 'high';
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  if (mem !== undefined && mem <= 4) return 'low';
  if (cores !== undefined && cores <= 4) return 'low';
  return mem === undefined && cores === undefined ? 'low' : 'high';
}

export const QUALITY_TIER = pickTier();
export const QUALITY = TIERS[QUALITY_TIER];

export const PERF = {
  MAX_PIXEL_RATIO: QUALITY.maxPixelRatio,
  TARGET_FPS: 60, // a desktop mouse game: smooth panning (the source game ran 30)
};

// The game clock (DESIGN.md: a run starts in 5000 BC, one year about every 2.4 s).
export const CLOCK = {
  START_YEAR: -5000,      // negative = BC
  SECONDS_PER_YEAR: 2.4,  // at speed 1
  MOMENT_RATE: 0.04,      // while a decision is open the calendar runs at this fraction (about 1 year a minute)
  SPEEDS: [1, 2, 4],
};

// ---------------------------------------------------------------------------
// The starting landscape (world/generate.js, docs/WORLDGEN.md). A new one every
// run; ?seed=<number> in the address replays one, ?flat=1 gives the old blank
// flat world. Heights are in blocks above (+) or below (-) WORLD.GROUND_Y.
// [a, b] pairs are a range: each run picks a value between them.
export const GEN = {
  // ---- what kind of start this run is (shares add up to 1) ----
  // welcoming: a lake with an open meadow beside it (families can settle as it stands)
  // woodland:  a lake and maybe a stream, ringed by thick woods (clear a glade, or bring water to a meadow)
  // hollow:    no lake, only a grassy hollow where one could be, and perhaps a pond deep in the woods
  SCENARIO: { welcoming: 0.37, woodland: 0.39, hollow: 0.24 },

  // ---- relief ----
  RELIEF: 3.2,          // broad swells and hollows: about this many blocks up or down at most
  RELIEF_SCALE: 95,     // their size: one rise or hollow every this many blocks, roughly
  RIPPLE: 1.0,          // small undulations on top of the swells (blocks)
  RIPPLE_SCALE: 32,
  TILT: 3,              // the whole land leans this many blocks from one side to the other
  HILLS: [1, 2],        // how many hills
  HILL_HEIGHT: [4, 7],  // blocks above the land around them
  HILL_RADIUS: [17, 28],
  HILL_DIST: [55, 100], // distance of a hill from the centre
  MAX_SLOPE: 1,         // no step between neighbouring land columns is taller than this
  HEIGHT_RANGE: [-6, 11], // the land never goes lower or higher than this (room left to dig and raise)

  // ---- water (made by the same rules as the Lake and River tools) ----
  LAKE_RADIUS: [11, 18],
  LAKE_DEPTH: [2, 4],   // deepest water at the middle (blocks)
  LAKE_DIST: [34, 72],  // distance from the centre; woodland lakes keep further out (WOODLAND_LAKE_DIST)
  WOODLAND_LAKE_DIST: [62, 92],
  LAKE_BOWL: 2,         // how far the land sinks toward a lake, so it lies in a hollow
  PONDS: [0, 2],        // extra small ponds (welcoming and woodland runs)
  POND_RADIUS: [2.5, 5],
  HOLLOW_POND: 0.8,     // chance a hollow run still has one pond, deep in the woods
  HOLLOW_POND_RADIUS: [5, 8],
  HOLLOW_RADIUS: [8, 12], // the dry hollow, ready for the Lake tool
  HOLLOW_DEPTH: 3,
  STREAM_CHANCE: 0.55,  // chance the lake is fed by a short stream
  STREAM_LENGTH: [26, 52],
  STREAM_WIDTH: [3, 4], // at the mouth; it narrows to about 2 at its spring
  STREAM_MEANDER: 5,    // how far it wanders off a straight line (blocks)
  STREAM_RISE: 4,       // the land along it is at most this far above the water (more cuts a gully)
  SHORE: 2.5,           // sandy beach or bank width, one block above the water
  SHORE_SAND: 0.7,      // share of the shore that is sand (the rest grassy bank)
  BANK_SLOPE: 0.5,      // beyond the shore the land climbs at most this many blocks per block
  WATER_GAP: 14,        // blocks kept between separate bodies of water
  REEDS: 0.75,          // how full a reed bed is (chance per shore cell inside one)
  REED_BEDS: 0.3,       // -1..1: higher means fewer, shorter reed beds along the shore

  // ---- open ground ----
  CENTRE_FLAT: 10,      // level grass at GROUND_Y within this radius of the centre (the standing stone)
  CENTRE_BLEND: 16,     // then the land eases into the landscape over this many blocks
  CENTRE_TREES: 18,     // no tree trunk within this radius of the centre
  EDGE_BAND: 30,        // the outer band that fades into mist: no water or hills, gentler relief
  MEADOWS: [1, 3],      // open meadows: no woods, flattened a little, flowers
  MEADOW_RADIUS: [16, 26],
  MEADOW_FLATTEN: 0.6,  // 0 leaves a meadow's ground as it was, 1 makes it level

  // ---- woods ----
  WOODS: 0.21,          // share of the land in copses and woods (before meadows and the centre are cleared)
  WOODS_SCALE: 48,      // copse size
  TREE_FILL: 0.75,      // how full a copse is (1 = a tree every 3 blocks)
  LONE_TREES: 0.01,     // chance of a lone tree per 3 x 3 cell in open country
  WOODLAND_RING: 26,    // woodland runs: thick woods this far around the water (people look 22 for water)
  HILL_WOODS: 0.55,     // how wooded hill slopes are

  // ---- ground and plants ----
  DRY_GRASS: 0.18,      // share of the open land in olive dry grass (more on high ground)
  BARE: 0.008,          // share of the open land in small bare earth patches
  ROCK_TOPS: 0.35,      // share of a hill's crown that is bare rock
  BOULDERS: 18,         // clusters of 1 to 5 boulders
  // No loose grass or flower tufts on open ground (the director's rule: green
  // blocks are the grass). Plant blocks only come packed into bushes.
  BUSHES: 70,           // bushes: fern or berry tufts packed in a 3 x 3 footprint, mostly at wood edges and by water
  // ---- food the land offers (the food work, 2026-11-16: "every world has berry bushes that the people can find and eat
  // out of") ----
  // Every place a family could settle (dry grass 3 to 22 blocks from water, open or wooded) gets berry bushes within reach: if
  // fewer than BERRY_NEAR_MIN bushes stand within BERRY_NEAR blocks of it, clumps are added 8 to 24 blocks from it
  // (at wood edges first), up to BERRY_CLUMPS_MAX clumps in the whole world (counting the ones BUSHES made).
  BERRY_NEAR: 26,       // blocks (people pick within 30 of home: sim/tune.js BERRY_REACH)
  BERRY_NEAR_MIN: 18,   // bushes (about three clumps)
  BERRY_CLUMPS_MAX: 90,
  // Flowers, in drifts, never scattered one by one (research 3.3; the director, 2026-11-16: "in spring, flowers should
  // be rampant ... flower fields"): each drift is one main colour with a second for accent, dense in the middle and
  // thinning to nothing at its edge. Meadows get MEADOW_DRIFTS each; the open land gets FLOWER_DRIFTS more here and
  // there, and FLOWER_FIELDS big dense ones. The season decides how many are in bloom (view/seasons.js bloomFor).
  // Raised 2026-11-16 (were 3 to 4, 10 to 16, 0.55, 0.8:
  // some 170 flower cells a world, too few to see).
  MEADOW_DRIFTS: [4, 6],
  FLOWER_DRIFTS: [20, 30],
  DRIFT_RADIUS: [3.5, 7],
  DRIFT_DENSITY: 1.1,   // how thick a drift is at its middle (about 0.6 to 1.4 of this share of the cells, by the drift's own noise)
  FLOWER_FIELDS: [1, 2],
  FLOWER_FIELD_RADIUS: [9, 13],
  FLOWER_FIELD_DENSITY: 1.6,
};
