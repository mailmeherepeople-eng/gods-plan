// Trees made of blocks, and taking them away again.
// Ported from the source repo's world/terrain.js placeTree() and its five
// shapes (there: sal, banyan, peepal, date palm, babul, dead snag), which the
// planner's scatter used through palette.js. Changed: every block goes through
// the recorded writer (ctx.vox.set) so a scatter stroke is one undo step; the
// trunk only grows into air or flora (the source wrote it unconditionally);
// trees are plain blocks, not planner entities. Two rules kept from the
// source: the trunk is one block at exactly (x, z), and nothing solid sits
// lower than y + 2, so anyone can walk under a canopy.
import { B, isCross } from '../world/blocks.js';
import { TREE_IDS } from '../edit/vox.js';

// the source's terrain.js hash2 (deterministic per position)
export function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 1024) / 1024;
}
const TRUNKS = new Set([B.WOOD, B.WOOD_BIRCH]);

export function makeTrees(V) {
  const W = V.W;
  const free = (id) => id === B.AIR || (isCross(id) && id !== B.ROOTS);
  const leaf = (x, y, z, id) => { if (W.get(x, y, z) === B.AIR) V.set(x, y, z, id); };
  const wood = (x, y, z, id) => { if (free(W.get(x, y, z))) V.set(x, y, z, id); };

  function sal(x, y, z, trunk) {
    const h = trunk + 2;
    for (let i = 0; i < h; i++) wood(x, y + i, z, B.WOOD);
    const tint = hash2(x * 3, z * 5) < 0.6 ? B.LEAVES : B.LEAVES_DARK;
    const top = y + h;
    for (let dy = -2; dy <= 2; dy++) {
      const r = dy === -2 || dy === 2 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        if (r === 2 && Math.abs(dx) + Math.abs(dz) === 3 && hash2(x + dx * 7, z + dz * 3 + dy) > 0.7) continue;
        leaf(x + dx, top + dy, z + dz, tint);
      }
    }
    leaf(x, top + 3, z, tint);
  }
  function banyan(x, y, z, trunk) {
    const h = Math.max(3, trunk);
    for (let i = 0; i < h; i++) wood(x, y + i, z, B.WOOD);
    const base = y + h - 1;
    for (let dy = 0; dy <= 2; dy++) {
      const R = dy === 0 ? 3.6 : dy === 1 ? 3.2 : 2.1;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        if (dy === 0 && d > 2.6 && hash2(x + dx * 5, z + dz * 9) > 0.78) continue;
        leaf(x + dx, base + dy, z + dz, B.LEAVES_DARK);
      }
    }
    for (const [dx, dz] of [[3, 1], [-2, 3], [-3, -1], [1, -3], [2, 2]]) {
      if (hash2(x + dx * 11, z + dz * 13) < 0.35) continue;
      const rx = x + dx, rz = z + dz;
      for (let yy = base - 1; yy >= y; yy--) { if (W.get(rx, yy, rz) !== B.AIR) break; V.set(rx, yy, rz, B.ROOTS); }
    }
  }
  function peepal(x, y, z, trunk) {
    const h = trunk + 1;
    for (let i = 0; i < h; i++) wood(x, y + i, z, B.WOOD);
    const top = y + h;
    for (let dy = -1; dy <= 2; dy++) {
      const R = dy === -1 ? 2.4 : dy === 0 ? 2.9 : dy === 1 ? 2.3 : 1.2;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        if (d > R - 1 && hash2(x + dx * 3 + dy, z + dz * 7) > 0.66) continue;
        leaf(x + dx, top + dy, z + dz, B.LEAVES_BRIGHT);
      }
    }
  }
  function palm(x, y, z, trunk) {
    const h = trunk + 3 + Math.floor(hash2(x * 7, z * 3) * 2);
    for (let i = 0; i < h; i++) wood(x, y + i, z, B.WOOD_BIRCH);
    const top = y + h;
    leaf(x, top, z, B.LEAVES);
    leaf(x, top + 1, z, B.LEAVES_BRIGHT);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const diag = dx !== 0 && dz !== 0;
      leaf(x + dx, top, z + dz, B.LEAVES_BRIGHT);
      if (!diag) { leaf(x + dx * 2, top, z + dz * 2, B.LEAVES_BRIGHT); leaf(x + dx * 3, top - 1, z + dz * 3, B.LEAVES); }
      else if (hash2(x + dx * 5, z + dz * 5) > 0.4) leaf(x + dx * 2, top - 1, z + dz * 2, B.LEAVES);
    }
  }
  function acacia(x, y, z, trunk) {
    const h = trunk + 1;
    for (let i = 0; i < h; i++) wood(x, y + i, z, B.WOOD);
    const ty = y + h;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; leaf(x + dx, ty, z + dz, B.LEAVES_DARK); }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (Math.abs(dx) + Math.abs(dz) > 1) continue; leaf(x + dx, ty + 1, z + dz, B.LEAVES_DARK); }
  }
  function snag(x, y, z, trunk) {
    const h = trunk + 1;
    for (let i = 0; i < h; i++) wood(x, y + i, z, B.WOOD);
    leaf(x + (hash2(x, z) > 0.5 ? 1 : -1), y + h - 2, z, B.WOOD);
  }

  const T = {};
  // a tree whose first trunk block is (x, y, z); false if something is in the way.
  // kind: 'tall' (the source's sal), 'wide' (banyan), 'round' (peepal), 'palm'
  // (date palm), 'flat' (babul); none: chosen from the position, as placeTree does
  const SHAPES = { tall: sal, wide: banyan, round: peepal, palm, flat: acacia, snag };
  T.place = (x, y, z, trunk = 3, kind = null) => {
    for (let i = 0; i < trunk + 3; i++) if (!free(W.get(x, y + i, z))) return false;
    if (isCross(W.get(x, y, z))) V.set(x, y, z, B.AIR);
    if (SHAPES[kind]) { SHAPES[kind](x, y, z, trunk); return true; }
    const v = hash2(x * 5 + 1, z * 7 + 2);
    if (v < 0.30) sal(x, y, z, trunk);
    else if (v < 0.44) banyan(x, y, z, trunk);
    else if (v < 0.60) peepal(x, y, z, trunk);
    else if (v < 0.78) palm(x, y, z, trunk);
    else if (v < 0.95) acacia(x, y, z, trunk);
    else snag(x, y, z, trunk);
    return true;
  };
  // the shape a tree block belongs to, roughly (for Pick)
  T.kindOf = (id) => (id === B.WOOD_BIRCH ? 'palm' : id === B.LEAVES_BRIGHT ? 'round' : id === B.ROOTS ? 'wide' : null);
  // a trunk stands at (x, z): its lowest wood block sits on the ground
  T.trunkAt = (x, z) => {
    const y = V.groundTop(x, z) + 1;
    return TRUNKS.has(W.get(x, y, z)) ? y : -1;
  };
  // is any tree block (leaves, wood, roots) standing over the ground at (x, z)? (what you see from above)
  T.canopyAt = (x, z) => {
    const g = V.groundTop(x, z);
    for (let y = g + 1; y <= g + 18; y++) if (TREE_IDS.has(W.get(x, y, z))) return true;
    return false;
  };
  // the trunk a canopy column at (x, z) belongs to: the nearest trunk within the reach remove() takes
  // (4 columns each way), as [tx, ty, tz], or null
  T.ownerOf = (x, z) => {
    let best = null, bd = Infinity;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const ty = T.trunkAt(x + dx, z + dz);
      if (ty < 0) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = [x + dx, ty, z + dz]; }
    }
    return best;
  };
  // is there a trunk within `r` columns of (x, z)?
  T.near = (x, z, r) => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (T.trunkAt(x + dx, z + dz) >= 0) return true;
    return false;
  };
  // the blocks of the tree whose trunk stands at (x, y0, z), as remove() would take them, without
  // touching anything (for selecting a tree): [[x, y, z, id]]
  T.blocksOf = (x, y0, z) => {
    const others = [];
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) if ((dx || dz) && T.trunkAt(x + dx, z + dz) >= 0) others.push([x + dx, z + dz]);
    const mine = (bx, bz) => { const d = (bx - x) ** 2 + (bz - z) ** 2; return !others.some(([ox, oz]) => (bx - ox) ** 2 + (bz - oz) ** 2 < d); };
    const seen = new Set(), stack = [[x, y0, z]], out = [];
    while (stack.length && out.length < 2000) {
      const [bx, by, bz] = stack.pop();
      const k = `${bx},${by},${bz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (Math.abs(bx - x) > 4 || Math.abs(bz - z) > 4 || by < y0 || by > y0 + 14) continue;
      const id = W.get(bx, by, bz);
      if (!TREE_IDS.has(id)) continue;
      if ((bx !== x || bz !== z) && !mine(bx, bz)) continue;
      out.push([bx, by, bz, id]);
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) stack.push([bx + dx, by + dy, bz + dz]);
    }
    return out;
  };
  // take away the tree whose trunk stands at (x, y0, z): every tree block
  // joined to it (26 neighbours), within its reach, that is not nearer to
  // another trunk that stays
  T.remove = (x, y0, z, going) => {
    const others = [];
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      if (!dx && !dz) continue;
      const tx = x + dx, tz = z + dz;
      if (going?.has(`${tx},${tz}`)) continue;
      if (T.trunkAt(tx, tz) >= 0) others.push([tx, tz]);
    }
    const mine = (bx, bz) => {
      const d = (bx - x) ** 2 + (bz - z) ** 2;
      return !others.some(([ox, oz]) => (bx - ox) ** 2 + (bz - oz) ** 2 < d);
    };
    const seen = new Set(), stack = [[x, y0, z]];
    let n = 0;
    while (stack.length) {
      const [bx, by, bz] = stack.pop();
      const k = `${bx},${by},${bz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (Math.abs(bx - x) > 4 || Math.abs(bz - z) > 4 || by < y0 || by > y0 + 14) continue;
      if (!TREE_IDS.has(W.get(bx, by, bz))) continue;
      if ((bx !== x || bz !== z) && !mine(bx, bz)) continue;
      V.set(bx, by, bz, B.AIR);
      n++;
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) stack.push([bx + dx, by + dy, bz + dz]);
    }
    return n;
  };
  return T;
}
