// Trees of blocks for the starting landscape (generate.js). Raw writes into
// world.data during the bulk build (no undo, no dirty marks: the caller
// remeshes everything). The shapes use the same block ids and the same rules
// as the god's Trees tool, so Clear, Pick and the people treat them alike:
//  - one trunk block column at exactly (x, z), WOOD (WOOD_BIRCH for palms),
//    its lowest block sitting on the ground
//  - nothing solid lower than y + 2 (y = the first trunk block), so anyone can
//    walk under a canopy
//  - every block within 4 columns of the trunk and 14 above its foot (Clear
//    takes a tree away by flooding that box from the trunk)
// Kinds: 'tall', 'round', 'wide', 'palm', 'flat' (as the tool names them),
// plus 'young' (a small tree) and 'snag' (a dead one).
import { WORLD } from '../config.js';
import { B } from './blocks.js';

const { SIZE_X: SX, SIZE_Y: SY, SIZE_Z: SZ } = WORLD;
const S = SX * SZ;
const LEAFY = new Set([B.LEAVES, B.LEAVES_DARK, B.LEAVES_BRIGHT]);

export function makeGenTrees(world) {
  const d = world.data;
  const T = { top: -1, blocks: 0 };
  const at = (x, y, z) => (x >= 0 && x < SX && z >= 0 && z < SZ && y > 0 && y < SY ? x + z * SX + y * S : -1);
  const leaf = (x, y, z, id) => {
    const i = at(x, y, z);
    if (i < 0 || d[i] !== B.AIR) return;
    d[i] = id; T.blocks++;
    if (y > T.top) T.top = y;
  };
  // a trunk may pass through a neighbour's canopy (dense woods), never through anything else
  const wood = (x, y, z, id) => {
    const i = at(x, y, z);
    if (i < 0 || (d[i] !== B.AIR && !LEAFY.has(d[i]))) return false;
    d[i] = id; T.blocks++;
    if (y > T.top) T.top = y;
    return true;
  };
  const trunkUp = (x, y, z, h, id) => { for (let k = 0; k < h; k++) wood(x, y + k, z, id); };
  // a layer of crown: cells within radius R, the outer ring thinned by `ragged`
  const disc = (x, y, z, R, id, r, ragged = 0.3) => {
    const n = Math.ceil(R);
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      const q = Math.hypot(dx, dz);
      if (q > R) continue;
      if (q > R - 1 && r() < ragged) continue;
      leaf(x + dx, y, z + dz, id);
    }
  };

  const shapes = {
    // a tall straight tree with a rounded crown (the tool's sal)
    tall(x, y, z, trunk, r) {
      const h = trunk + 2;
      trunkUp(x, y, z, h, B.WOOD);
      const id = r() < 0.6 ? B.LEAVES : B.LEAVES_DARK;
      const c = y + h; // lowest leaves at c - 2 = y + trunk
      disc(x, c - 2, z, 1.5, id, r, 0.2);
      disc(x, c - 1, z, 2.5, id, r, 0.35);
      disc(x, c, z, 2.5, id, r, 0.25);
      disc(x, c + 1, z, 1.9, id, r, 0.3);
      leaf(x, c + 2, z, id);
    },
    // a broad round crown in bright green (the tool's peepal)
    round(x, y, z, trunk, r) {
      const h = trunk + 1;
      trunkUp(x, y, z, h, B.WOOD);
      const c = y + h;
      disc(x, c - 1, z, 2.4, B.LEAVES_BRIGHT, r, 0.35);
      disc(x, c, z, 3.0, B.LEAVES_BRIGHT, r, 0.35);
      disc(x, c + 1, z, 2.4, B.LEAVES_BRIGHT, r, 0.3);
      disc(x, c + 2, z, 1.3, B.LEAVES_BRIGHT, r, 0.2);
    },
    // a low spreading giant with hanging roots (the tool's banyan)
    wide(x, y, z, trunk, r) {
      const h = Math.max(3, trunk);
      trunkUp(x, y, z, h, B.WOOD);
      const b = y + h - 1;
      disc(x, b, z, 3.7, B.LEAVES_DARK, r, 0.3);
      disc(x, b + 1, z, 3.2, B.LEAVES_DARK, r, 0.2);
      disc(x, b + 2, z, 2.1, B.LEAVES_DARK, r, 0.2);
      for (const [dx, dz] of [[3, 1], [-2, 3], [-3, -1], [1, -3], [2, 2]]) {
        if (r() < 0.4) continue;
        for (let yy = b - 1; yy >= y; yy--) {
          const i = at(x + dx, yy, z + dz);
          if (i < 0 || d[i] !== B.AIR) break;
          d[i] = B.ROOTS; T.blocks++;
        }
      }
    },
    // a ringed pale trunk with fronds (the tool's date palm)
    palm(x, y, z, trunk, r) {
      const h = trunk + 3 + (r() < 0.5 ? 1 : 0);
      trunkUp(x, y, z, h, B.WOOD_BIRCH);
      const t = y + h;
      leaf(x, t, z, B.LEAVES);
      leaf(x, t + 1, z, B.LEAVES_BRIGHT);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        leaf(x + dx, t, z + dz, B.LEAVES_BRIGHT);
        if (dx && dz) { if (r() < 0.6) leaf(x + dx * 2, t - 1, z + dz * 2, B.LEAVES); }
        else { leaf(x + dx * 2, t, z + dz * 2, B.LEAVES_BRIGHT); leaf(x + dx * 3, t - 1, z + dz * 3, B.LEAVES); }
      }
    },
    // a flat parasol crown, a little off the trunk (the tool's babul)
    flat(x, y, z, trunk, r) {
      const h = trunk + 1;
      trunkUp(x, y, z, h, B.WOOD);
      const ox = Math.floor(r() * 3) - 1, oz = Math.floor(r() * 3) - 1, t = y + h;
      if (ox || oz) leaf(x, t, z, B.LEAVES_DARK);
      disc(x + ox, t, z + oz, 2.6, B.LEAVES_DARK, r, 0.25);
      disc(x + ox, t + 1, z + oz, 1.5, B.LEAVES_DARK, r, 0.2);
    },
    // a small young tree, for scale beside the big ones
    young(x, y, z, trunk, r) {
      const h = 2 + (trunk > 3 ? 1 : 0);
      trunkUp(x, y, z, h, B.WOOD);
      const id = r() < 0.5 ? B.LEAVES_BRIGHT : B.LEAVES;
      const c = y + h;
      disc(x, c - 1, z, 1.5, id, r, 0.25);
      disc(x, c, z, 1.5, id, r, 0.15);
      leaf(x, c + 1, z, id);
    },
    // a dead tree with one stub branch
    snag(x, y, z, trunk, r) {
      const h = trunk + 2;
      trunkUp(x, y, z, h, B.WOOD);
      leaf(x + (r() < 0.5 ? 1 : -1), y + h - 2, z, B.WOOD);
    },
  };

  // a tree whose first trunk block is (x, y, z). false when the foot is taken.
  T.place = (x, y, z, kind, trunk, r) => {
    const i = at(x, y, z);
    if (i < 0 || (d[i] !== B.AIR && !LEAFY.has(d[i]))) return false;
    (shapes[kind] ?? shapes.tall)(x, y, z, trunk, r);
    return true;
  };
  T.kinds = Object.keys(shapes);
  return T;
}
