// Dev only: `?devland=1` in the address carves a lake, a pond, a few trees
// and a small hill, so the people have something to settle by while the land
// tools are not there. Does nothing without the flag. Works on any ground
// (heights are read per column), but is best with `?flat=1`. Raw world
// writes, not undoable; called once at init, in the creation phase.
import { B } from '../world/blocks.js';
import { X0, Z0, X1, Z1 } from '../edit/vox.js';

export function devLandWanted() {
  try { return new URLSearchParams(location.search).get('devland') === '1'; } catch { return false; }
}

export function devLand(ctx) {
  const W = ctx.world, top = (x, z) => ctx.vox.groundTop(x, z);
  const cx = Math.floor((X0 + X1) / 2), cz = Math.floor((Z0 + Z1) / 2);
  const clearAbove = (x, z, y) => { for (let k = y + 1; k <= Math.min(47, y + 12); k++) W.set(x, k, z, B.AIR); };
  // a lake east of the stone, a pond far to the south west: water one block under the rim, sandy shore
  const lake = (ox, oz, rx, rz, deep) => {
    const g = top(ox, oz);
    for (let z = oz - rz - 3; z <= oz + rz + 3; z++) for (let x = ox - rx - 3; x <= ox + rx + 3; x++) {
      const e = ((x - ox) / rx) ** 2 + ((z - oz) / rz) ** 2;
      if (e <= 1) {
        clearAbove(x, z, g - 1);
        W.set(x, g, z, B.AIR); W.set(x, g - 1, z, B.WATER);
        if (e < 0.45 && deep) { W.set(x, g - 2, z, B.WATER); W.set(x, g - 3, z, B.SAND); } else W.set(x, g - 2, z, B.SAND);
      } else if (e <= 1.35) { clearAbove(x, z, g); W.set(x, g, z, B.SAND); }
    }
  };
  lake(cx + 34, cz - 12, 12, 7, true);
  lake(cx - 62, cz + 48, 5, 4, false);
  // trees: trunk, then a leafy crown well above head height
  const tree = (x, z, h = 4) => {
    const G = top(x, z);
    for (let y = 1; y <= h; y++) W.set(x, G + y, z, B.WOOD);
    for (let dy = h; dy <= h + 2; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dy === h + 2 && (dx || dz)) continue;
      if (dx === 0 && dz === 0 && dy < h + 1) continue;
      W.set(x + dx, G + dy, z + dz, (dx + dz) % 2 ? B.LEAVES : B.LEAVES_DARK);
    }
  };
  for (const [x, z] of [[cx + 52, cz - 24], [cx + 56, cz - 18], [cx + 49, cz - 30], [cx + 20, cz - 30], [cx + 16, cz - 26],
    [cx - 30, cz - 40], [cx - 35, cz - 36], [cx - 27, cz - 46], [cx - 58, cz + 40], [cx - 70, cz + 52]]) tree(x, z, 4 + ((x + z) & 1));
  // a small hill (north of the stone)
  for (let z = cz - 60; z <= cz - 44; z++) for (let x = cx - 10; x <= cx + 10; x++) {
    const h = Math.max(0, Math.round(4 - Math.hypot(x - cx, (z - cz + 52) * 1.2) / 3));
    const G = top(x, z);
    for (let y = 1; y <= h; y++) { W.set(x, G + y - 1, z, B.DIRT); W.set(x, G + y, z, B.GRASS); }
  }
}
