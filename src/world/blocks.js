// Block registry. Vertex-coloured voxels, no textures by default.
// Ported from the source repo's world/blocks.js. Ids are kept identical to the
// source so builders ported from there later (trees, huts) still line up; the
// gaps (19, 20, 40-43, 46-53) are the source's dig-site and present-day village
// blocks, removed here. New blocks: registerBlock() or a new id above 54.
// Each block: top / side / bottom RGB, plus flags.
//  - opaque: occludes neighbouring faces in the mesher
//  - solid:  blocks movement (collision). Decorative flora is NEVER solid.
//  - cross:  rendered as two crossed quads (walk-through flora), never a cube
//  - accent: second colour for cross flora (bloom / berries / seed heads)
//  - fleck:  accent is sprinkled per-vertex instead of a bottom to top gradient
//  - water:  rendered in the transparent water pass
export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  ICE: 6,
  ROCK: 7,
  WOOD: 8,
  LEAVES: 9,
  BUSH: 10,
  BUSH_BARE: 11,
  THATCH: 12,
  WATTLE: 13,
  PATH: 14,
  FARMLAND: 15,
  CROP: 16,
  MUDBRICK: 17,
  REED: 18,
  CHARCOAL: 21,
  SNOWGRASS: 22,
  TALLGRASS: 23,
  FLOWER_RED: 24,
  FLOWER_YELLOW: 25,
  FLOWER_WHITE: 26,
  FERN: 27,
  SHRUB_BERRY: 28,
  DEADBUSH: 29,
  SNOWTUFT: 30,
  LEAVES_DARK: 31,
  LEAVES_BRIGHT: 32,
  WOOD_BIRCH: 33,
  ROCK_DARK: 34,
  STRATA_A: 35,
  STRATA_B: 36,
  STRATA_C: 37,
  STRATA_D: 38,
  ROOTS: 39,
  CONCRETE: 44,
  BRICK: 45,
  GRASS_DRY: 54,
  // the food work, 2026-11-16 (taken from the end of the old gap): more flowers, and a berry bush without fruit
  FLOWER_BLUE: 50,
  FLOWER_DAISY: 51,
  FLOWER_LILAC: 52,
  BERRY_BARE: 53,
};

const C = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];

// cross-flora helper: walk-through, never occludes, two crossed quads.
// Optional extras read by the mesher:
//  - crossH:     nominal quad height in blocks (default 0.7; REED stays 1.0)
//  - crossTaper: how far the TOP verts pull toward the centre (0..1, default 0.5)
const flora = (base, accent, extra = {}) => ({
  top: C(base), side: C(base), bottom: C(base),
  accent: accent != null ? C(accent) : null,
  opaque: false, solid: false, cross: true, ...extra,
});

export const BLOCK_DEFS = {
  [B.AIR]: { opaque: false, solid: false },
  // monsoon green over red laterite soil, buff and rose sandstone (the World
  // Planner's palette, which the director likes)
  [B.GRASS]: { top: C(0x6d9c3d), side: C(0x955a3d), bottom: C(0x80492f), opaque: true, solid: true },
  [B.DIRT]: { top: C(0x9c5e40), side: C(0x8f5439), bottom: C(0x7f4830), opaque: true, solid: true },
  [B.STONE]: { top: C(0xab917b), side: C(0x9c836e), bottom: C(0x8c7562), opaque: true, solid: true },
  [B.SAND]: { top: C(0xe2cb98), side: C(0xd4ba84), bottom: C(0xc3a770), opaque: true, solid: true },
  [B.WATER]: { top: C(0x2b7a9c), side: C(0x256b88), bottom: C(0x1b526e), opaque: false, solid: false, water: true },
  [B.ICE]: { top: C(0xd6ecf6), side: C(0xb9d8ea), bottom: C(0xa3c6dc), opaque: true, solid: true },
  [B.ROCK]: { top: C(0xb3856a), side: C(0xa4775d), bottom: C(0x8f6650), opaque: true, solid: true },
  [B.WOOD]: { top: C(0x9a7247), side: C(0x6b4a2f), bottom: C(0x9a7247), opaque: true, solid: true },
  [B.LEAVES]: { top: C(0x46802b), side: C(0x3e7227), bottom: C(0x356222), opaque: true, solid: true },
  [B.BUSH]: { top: C(0x47823a), side: C(0xa63d30), bottom: C(0x38622c), opaque: true, solid: true },
  [B.BUSH_BARE]: { top: C(0x6b7448), side: C(0x5f6841), bottom: C(0x525a38), opaque: true, solid: true },
  [B.THATCH]: { top: C(0xd4a856), side: C(0xc29447), bottom: C(0xab803c), opaque: true, solid: true },
  [B.WATTLE]: { top: C(0xae7650), side: C(0x9e6846), bottom: C(0x88583b), opaque: true, solid: true },
  [B.PATH]: { top: C(0xc08452), side: C(0xa96f45), bottom: C(0x925e3b), opaque: true, solid: true },
  [B.FARMLAND]: { top: C(0x5f4527), side: C(0x6f5230), bottom: C(0x63482a), opaque: true, solid: true },
  [B.CROP]: { top: C(0xa8bf55), side: C(0x8ba847), bottom: C(0x5f4527), opaque: true, solid: true },
  [B.MUDBRICK]: { top: C(0xbe8656), side: C(0xae7749), bottom: C(0x99673e), opaque: true, solid: true },
  // tall riverbank grass with pale plumes; walk-through so it never walls off a bank
  [B.REED]: flora(0x93a352, 0xf3efe2, { crossH: 1.0, crossTaper: 0.25 }),
  [B.CONCRETE]: { top: C(0xcfc9bc), side: C(0xbdb7aa), bottom: C(0xaaa497), opaque: true, solid: true },
  [B.BRICK]: { top: C(0xa8553a), side: C(0x9c4d34), bottom: C(0x8a422c), opaque: true, solid: true },
  [B.GRASS_DRY]: { top: C(0x86904e), side: C(0x8f5c3f), bottom: C(0x80492f), opaque: true, solid: true },
  [B.CHARCOAL]: { top: C(0x2e2a26), side: C(0x282420), bottom: C(0x22201c), opaque: true, solid: true },
  [B.SNOWGRASS]: { top: C(0xeaeee2), side: C(0x8a6742), bottom: C(0x74542f), opaque: true, solid: true },
  // ---- decorative flora (all walk-through, all crossed quads) ----
  [B.TALLGRASS]: flora(0x6c963c, 0xa8b45c),
  // flowers face the sky (2026-11-16, docs/research/12-look-and-feel-our-game.md 3.2): a short stem with a flat head on top in
  // the petal colour (`head`) round a small centre (`eye`), drawn by the mesher's emitFlower so the colour shows from
  // above. Kept clear of the warning red (#C7442E) and the god's gold (#E5AE3C). `accent` is the petal colour for
  // the overview's colour pick. The season shows them (world/shade.js bloom): rampant in spring, fewer in summer,
  // seed heads in autumn, none in winter.
  [B.FLOWER_RED]: flora(0x5f8c44, 0xee6f57, { flower: true, head: C(0xee6f57), eye: C(0x3a2a2a) }),       // poppy
  [B.FLOWER_YELLOW]: flora(0x5f8c44, 0xf3d86b, { flower: true, head: C(0xf3d86b), eye: C(0xd99a2b) }),    // buttercup
  [B.FLOWER_WHITE]: flora(0x5f8c44, 0xee8fb4, { flower: true, head: C(0xee8fb4), eye: C(0xf7e27a) }),     // wild rose
  [B.FLOWER_BLUE]: flora(0x5f8c44, 0x5b8de0, { flower: true, head: C(0x5b8de0), eye: C(0x2c3f86) }),      // cornflower
  [B.FLOWER_DAISY]: flora(0x5f8c44, 0xf6f2e6, { flower: true, head: C(0xf6f2e6), eye: C(0xf2c230) }),     // daisy
  [B.FLOWER_LILAC]: flora(0x5f8c44, 0x9a7bd0, { flower: true, head: C(0x9a7bd0), eye: C(0xc9b5ee) }),     // lavender
  [B.FERN]: flora(0x39682f, 0x4d8038, { crossTaper: 0.4 }),
  // berry bushes (2026-11-16, research 3.1): a soft green dome (the mesher's emitBush), walk-through like all flora.
  // SHRUB_BERRY carries ripe berries, coloured by kind from where it grows (BERRY_KINDS); BERRY_BARE has none
  // (picked, or out of season), and in spring shows blossom instead (the season's bloom, world/shade.js).
  [B.SHRUB_BERRY]: flora(0x3f7434, 0xd4436a, { bush: true, berries: true }),
  [B.BERRY_BARE]: flora(0x4a7a3a, null, { bush: true, berries: false }),
  [B.DEADBUSH]: flora(0x9a7240, 0xc2a462, { crossTaper: 0.45 }),
  [B.SNOWTUFT]: flora(0xa2b183, 0xdce4cb, { crossH: 0.6, crossTaper: 0.62 }),
  // ---- tree / rock / strata variants (cube blocks) ----
  [B.LEAVES_DARK]: { top: C(0x30652a), side: C(0x2b5a25), bottom: C(0x244d20), opaque: true, solid: true },
  [B.LEAVES_BRIGHT]: { top: C(0x6aa037), side: C(0x5f9132), bottom: C(0x527e2c), opaque: true, solid: true },
  // ringed grey-brown trunk (the mesher bands this id)
  [B.WOOD_BIRCH]: { top: C(0x8e7a5c), side: C(0xa48d6a), bottom: C(0x8e7a5c), opaque: true, solid: true },
  [B.ROCK_DARK]: { top: C(0x6b4c3c), side: C(0x5f4335), bottom: C(0x523a2e), opaque: true, solid: true },
  // sedimentary bands, for cut cliff faces
  [B.STRATA_A]: { top: C(0x8a5138), side: C(0x8a5138), bottom: C(0x7c4832), opaque: true, solid: true },
  [B.STRATA_B]: { top: C(0xc9a468), side: C(0xc9a468), bottom: C(0xb8945c), opaque: true, solid: true },
  [B.STRATA_C]: { top: C(0x8b8b6d), side: C(0x8b8b6d), bottom: C(0x7d7d62), opaque: true, solid: true },
  [B.STRATA_D]: { top: C(0xd9bd85), side: C(0xd9bd85), bottom: C(0xc8ad77), opaque: true, solid: true },
  // hanging aerial roots of a big tree: walk-through like any flora
  [B.ROOTS]: flora(0x76563a, 0x8d6c4c, { crossH: 1.0, crossTaper: 0.05 }),
};

// Runtime block registration: add a type without a source edit. Returns the
// new id. `def` takes hex numbers: { name, top, side, bottom, solid, opaque,
// cross, accent, crossH, crossTaper, tex }.
let NEXT_ID = 64; // well clear of the ids above
export function registerBlock(def) {
  const key = String(def.name || `CUSTOM_${NEXT_ID}`).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const existing = B[key];
  const id = existing ?? NEXT_ID++;
  const C1 = (hex, fb) => (hex == null ? fb : [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255]);
  const top = C1(def.top, [0.7, 0.7, 0.7]);
  B[key] = id;
  BLOCK_DEFS[id] = {
    top, side: C1(def.side, top), bottom: C1(def.bottom, top),
    accent: def.accent != null ? C1(def.accent, null) : null,
    opaque: def.cross ? false : def.opaque !== false,
    solid: def.cross ? false : def.solid !== false,
    cross: !!def.cross,
    crossH: def.crossH, crossTaper: def.crossTaper, fleck: !!def.fleck,
    // painted faces: atlas tile indices (world/atlas.js). Absent = vertex colours.
    tex: def.tex ?? null,
  };
  return id;
}

export function blockIdOf(name) { return B[String(name).toUpperCase()]; }

// the kinds of berry, by colour (research 3.1): a bush's kind comes from where it grows (a slow noise in the mesher),
// so a clump shares one kind. Raspberry pink-red, blueberry, blackberry purple with a lilac shine, cloudberry apricot.
export const BERRY_KINDS = [
  { name: 'raspberry', berry: C(0xd4436a), shine: C(0xf08aa6) },
  { name: 'blueberry', berry: C(0x4a5fb8), shine: C(0x8fa2e8) },
  { name: 'blackberry', berry: C(0x4b2c5e), shine: C(0xa58cc8) },
  { name: 'cloudberry', berry: C(0xf29a4a), shine: C(0xffc98f) },
];
// blossom on a bare bush in spring
export const BLOSSOM = { petal: C(0xfbe7ef), eye: C(0xf4b6c8) };

export function isOpaque(id) { return BLOCK_DEFS[id]?.opaque === true; }
export function isSolid(id) { return BLOCK_DEFS[id]?.solid === true; }
export function isWater(id) { return BLOCK_DEFS[id]?.water === true; }
export function isCross(id) { return BLOCK_DEFS[id]?.cross === true; }
