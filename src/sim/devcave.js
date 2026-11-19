// Testing aid: sim.dev.cave({ room = 3 }) puts a valid cave by the water nearest the standing stone, so a test never
// fails for want of a cave (the coordinator, 2026-11-13). It raises a rock mound beside the water (one recorded edit),
// carves the cave in its side facing the water through the god's Cave tool when it is loaded (same blocks, undo and
// witness as a click), and keeps it only if fresh water is within reach of the mouth and a field fits by it. Tries
// stricter places first (flat grass, water 12 to 18 off), then looser ones. Returns { cave, x, z, d, wd } or null.
import { B } from '../world/blocks.js';
import { T } from './tune.js';

export function devCave(ctx, S, o = {}) {
  const room = o.room ?? 3;
  const V = ctx.vox, L = S.land, c = S.stone.centre, god = ctx.modules?.god;
  const scan = () => { L.needFull = true; L.fullScan?.(); };
  if (L.needFull) L.fullScan();
  const why = {}; const no = (k) => { why[k] = (why[k] ?? 0) + 1; };
  const bands = [[12, 18, 120, 0.97], [9, 20, 80, 0.95], [6, 22, 30, 0.9], [4, 22, 0, 0.85]];
  for (const [w0, w1, grass, clear] of bands) {
    const needField = grass >= 80; // the looser places take a cave even with no field site by its mouth
    const cands = [];
    for (let x = 14; x < 286; x += 3) for (let z = 14; z < 286; z += 3) {
      if (!L.inside(x, z) || L.waterAt(x, z) || ctx.edgeClear(x, z) < clear || S.isProtected(x, z)) continue;
      const wd = L.wdistAt(x, z);
      if (wd < w0 || wd > w1) continue;
      if (grass && (L.grassAround?.(x, z, 12) ?? grass) < grass) continue;
      cands.push({ x, z, d: Math.hypot(x - c.x, z - c.z), wd });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const cd of cands.slice(0, 25)) {
      const F = V.groundTop(cd.x, cd.z);
      ctx.core.begin('A test hill');
      for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
        const x = cd.x + dx, z = cd.z + dz;
        if (!L.inside(x, z) || L.waterAt(x, z) || S.isProtected(x, z)) continue;
        const h = Math.round(F + 8 - Math.max(0, Math.hypot(dx, dz) - 4.5) * 2.2), t = V.groundTop(x, z);
        for (let y = t + 1; y <= h; y++) V.set(x, y, z, B.ROCK);
      }
      if (!ctx.core.end()) { no('mound'); continue; }
      scan();
      const pts = [];
      for (let k = 0; k < 16; k++) for (const dd of [4, 6, 8]) { const a = k * Math.PI / 8, x = cd.x + Math.cos(a) * dd, z = cd.z + Math.sin(a) * dd; pts.push({ x, z, w: L.wdistAt(Math.floor(x), Math.floor(z)) }); }
      pts.sort((a, b) => a.w - b.w);
      for (const q of pts) {
        const p = S.seam.ask('cavePlan', q.x, q.z, room);
        if (!p?.ok) { no('plan:' + p?.reason); continue; }
        let cave = null;
        if (god?.cave) cave = god.cave(q.x, q.z, room);
        else { ctx.core.begin('Carve a cave'); for (const [x, y, z, id] of p.cells) V.set(x, y, z, id); ctx.core.end(); cave = S.seam.ask('caveCarved', p); }
        if (!cave || !cave.cx) { no('carve'); continue; }
        scan();
        const wd = L.wdistAt(Math.floor(cave.door.x), Math.floor(cave.door.z));
        // people must be able to walk up to the mouth (trees or rock in front shut it: caves.js openMouth)
        const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]], [ddx, ddz] = DIRS[cave.spec?.dir ?? 0];
        let open = false;
        for (let k = 5; k <= 12 && !open; k++) {
          const ox = cave.door.x + ddx * ((cave.spec?.L ?? 2) + k), oz = cave.door.z + ddz * ((cave.spec?.L ?? 2) + k);
          if (!L.inside(Math.floor(ox), Math.floor(oz)) || !L.passable(Math.floor(ox), Math.floor(oz), 'person')) continue;
          L.newFrame(); open = L.findPath(ox, oz, cave.door.x, cave.door.z, 'person', 3000) !== null;
        }
        if (!open) { no('shut'); ctx.core.undo(); scan(); continue; }
        if (wd <= T.WATER_REACH && (!needField || L.bestField({ x: cave.cx, z: cave.cz }, T.FIELD_SIZE[0], T.FIELD_SIZE[1], []))) return { cave, x: cave.cx, z: cave.cz, d: Math.round(cd.d), wd };
        no(wd > T.WATER_REACH ? 'water' : 'field');
        ctx.core.undo();
        scan();
      }
      ctx.core.undo();
      scan();
    }
  }
  if (o.debug) return { why };
  return null;
}
