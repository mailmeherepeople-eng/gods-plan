// What people build, block by block: the standing stone (placed at init),
// huts, fields and one shared fire circle. Every write goes straight to
// ctx.world.set, never through a core transaction, so none of it is undoable
// (contract). Each building is an entity registered with the core (cat
// 'building' or 'holy') whose block cells are owned in core.owner as they go
// up, so the picker finds it.
import { B, registerBlock, isCross } from '../world/blocks.js';
import { idx, inB } from '../edit/vox.js';
import { RES } from './land.js';
import { makeFire } from './bodies.js';
import { T } from './tune.js';
import { isWinter, secsToWinter } from './food-season.js';

// new blocks: the stone's pale rock and two crop stages (walk-through flora)
export const SB = {
  HOLY: registerBlock({ name: 'SIM_HOLYSTONE', top: 0xd3d8d6, side: 0xb4bcbb, bottom: 0x9aa3a2 }),
  SPROUT: registerBlock({ name: 'SIM_SPROUT', cross: true, top: 0x6f9e3c, accent: 0x9cc75a, crossH: 0.45, crossTaper: 0.3 }),
  GRAIN: registerBlock({ name: 'SIM_GRAIN', cross: true, top: 0xb89236, accent: 0xf0cf5a, crossH: 0.95, crossTaper: 0.2 }),
};

const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // south, east, north, west

export function makeBuilder(ctx, S) {
  const W = ctx.world, core = ctx.core, land = S.land;
  let seq = 0;

  function put(x, y, z, id, owner) {
    if (!inB(x, y, z)) return;
    W.set(x, y, z, id);
    if (owner) core.owner[idx(x, y, z)] = id === B.AIR ? 0 : owner.i;
  }
  const ent = (kind, name, cx, cz, y, w, d, h, cat = 'building') => ({
    id: `${kind}${++seq}`, kind, cat, name, x: cx + 0.5, y, z: cz + 0.5, ry: 0, ry0: 0, fx: 0.5, fz: 0.5,
    foot: { w, d, h, cx: 0, cz: 0 }, objs: [], cells: [], added: true,
  });
  const register = (e) => { core.add(e); return e; };

  // ---------- the standing stone ----------
  // A pale slab, two blocks wide, its top stepped and pierced near the crown
  // (the eye), on a dark plinth, in a paved disc ringed by five small cairns.
  // An invented faith: no real religion's sign.
  function placeStone(cx, cz) {
    const g = land.topAt(cx, cz), y0 = g + 1;
    const e = ent('stone', 'The standing stone', cx, cz, y0, 4, 3, 6, 'holy');
    e.foot.cx = 0.5; // the plinth runs cx-1 .. cx+2
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 5; dx++) {
      const r = Math.hypot(dx - 0.5, dz);
      if (r <= 3.7) put(cx + dx, g, cz + dz, B.PATH);
    }
    const cells = [];
    const add = (dx, dy, dz, id) => { cells.push([dx, dy, dz, id]); };
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 2; dx++) add(dx, 0, dz, B.ROCK_DARK);
    for (let y = 1; y <= 5; y++) add(0, y, 0, SB.HOLY);
    for (let y = 1; y <= 4; y++) if (y !== 3) add(1, y, 0, SB.HOLY);
    for (const [ax, az] of [[3.5, 0.6], [-1.6, 3.1], [-2.8, -1.9], [1.4, -3.4], [3.1, 2.6]]) add(Math.round(ax), 0, Math.round(az), B.ROCK);
    // the plinth is cells dy 0, the stone above: write them
    e.cells = cells.map(([dx, dy, dz, id]) => [dx, dy, dz, id]);
    register(e);
    for (const [dx, dy, dz, id] of e.cells) put(cx + dx, y0 + dy, cz + dz, id, e);
    core.own(e, true);
    // reservation: the stone itself blocks walking; the box around it is protected
    const box = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 2; dx++) box.push([cx + dx, cz + dz]);
    land.reserve(box, RES.STONE, -1);
    e.protect = { x0: cx - 5, z0: cz - 5, x1: cx + 6, z1: cz + 5 };
    e.centre = { x: cx + 1, z: cz + 0.5 };
    land.scanRect(cx - 6, cz - 6, cx + 7, cz + 6);
    return e;
  }

  // ---------- a hut ----------
  // 5 x 5, wattle walls two high with a door gap, posts at the corners, a
  // rounded thatch roof stepping up to a peak. Readable from above as a
  // golden dome with a dark door notch.
  function planHut(family, cx, cz) {
    // door faces the stone if it is far, else the water
    let dir = 0, bestD = -Infinity;
    const st = S.stone.centre;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = DIRS[k];
      const dx = cx + ax * 3, dz = cz + az * 3;
      if (!land.passable(dx, dz, 'person')) continue;
      const toward = -Math.hypot(st.x - dx, st.z - dz) - land.wdistAt(dx, dz) * 0.4;
      if (toward > bestD) { bestD = toward; dir = k; }
    }
    let base = -1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) base = Math.max(base, land.topAt(cx + dx, cz + dz));
    const y0 = base + 1;
    const e = ent('hut', `Hut of the ${family.name} family`, cx, cz, y0, 5, 5, 5);
    e.family = family; e.dir = dir; e.progress = 0; e.done = false; e.work = 0;
    const [ax, az] = DIRS[dir];
    e.door = { x: cx + ax * 3 + 0.5, z: cz + az * 3 + 0.5, gx: cx + ax * 2, gz: cz + az * 2 };
    const steps = [];
    // level the floor first (grass on the low cells)
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const t = land.topAt(cx + dx, cz + dz);
      if (t < base) steps.push({ x: cx + dx, y: t + 1, z: cz + dz, id: B.GRASS, ground: true });
    }
    const ring = (dx, dz) => Math.max(Math.abs(dx), Math.abs(dz)) === 2;
    const corner = (dx, dz) => Math.abs(dx) === 2 && Math.abs(dz) === 2;
    const isDoor = (dx, dz) => dx === ax * 2 && dz === az * 2;
    for (let y = 0; y < 2; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (corner(dx, dz)) steps.push({ dx, dy: y, dz, id: B.WOOD });
    for (let y = 0; y < 2; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (ring(dx, dz) && !corner(dx, dz) && !isDoor(dx, dz)) steps.push({ dx, dy: y, dz, id: B.WATTLE });
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (!corner(dx, dz)) steps.push({ dx, dy: 2, dz, id: B.THATCH });
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) steps.push({ dx, dy: 3, dz, id: B.THATCH });
    steps.push({ dx: 0, dy: 4, dz: 0, id: B.THATCH });
    e.steps = steps; e.next = 0;
    e.cells = steps.filter((s) => !s.ground).map((s) => [s.dx, s.dy, s.dz, s.id]);
    register(e);
    const cells = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) cells.push([cx + dx, cz + dz]);
    land.reserve(cells, RES.HUT, e.i);
    land.reserve([[Math.floor(e.door.x), Math.floor(e.door.z)]], RES.DOOR, e.i);
    e.cx = cx; e.cz = cz;
    S.buildings.push(e);
    return e;
  }

  // ---------- a field ----------
  // Tilled earth with crops in rows and bare furrows between: stripes from above.
  function planField(family, site) {
    const { x0, z0, w, d } = site;
    let lo = 99;
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) lo = Math.min(lo, land.topAt(x, z));
    const e = ent('field', `Field of the ${family.name} family`, x0, z0, lo + 1, w, d, 1);
    e.x = x0 + w / 2; e.z = z0 + d / 2; e.fx = 0; e.fz = 0;
    e.family = family; e.done = false; e.work = 0; e.next = 0; e.grow = 0; e.care = 0.6; e.stage = 0;
    const steps = [];
    const along = w >= d; // rows run along the long side
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      const t = land.topAt(x, z);
      const row = along ? (z - z0) % 2 === 0 : (x - x0) % 2 === 0;
      steps.push({ x, y: t, z, id: B.FARMLAND, crop: row });
    }
    e.steps = steps; e.x0 = x0; e.z0 = z0; e.w = w; e.d = d; e.mx = x0 + w / 2; e.mz = z0 + d / 2;
    // template for picking: the tilled cells (dy -1 from the field's y)
    e.cells = steps.map((s) => [s.x - x0, s.y - (lo + 1), s.z - z0, B.FARMLAND, B.GRASS]); // cut away, it heals to grass
    e.fx = 0.5; e.fz = 0.5; e.x = x0 + 0.5; e.z = z0 + 0.5; // cellsAt: floor(x + dx) = x0 + dx
    e.foot = { w, d, h: 1, cx: w / 2 - 0.5, cz: d / 2 - 0.5 };
    register(e);
    const cells = steps.map((s) => [s.x, s.z]);
    land.reserve(cells, RES.FIELD, e.i);
    S.buildings.push(e);
    return e;
  }

  // ---------- the fire circle ----------
  function planFire(cx, cz) {
    const g = land.topAt(cx, cz);
    const e = ent('fire', 'The fire circle', cx, cz, g + 1, 5, 5, 1);
    e.done = false; e.work = 0; e.next = 0;
    const steps = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) steps.push({ x: cx + dx, y: land.topAt(cx + dx, cz + dz), z: cz + dz, id: dx || dz ? B.PATH : B.CHARCOAL, ground: true });
    for (const [dx, dz] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]) steps.push({ dx, dy: 0, dz, id: B.ROCK_DARK });
    e.steps = steps;
    e.cells = steps.filter((s) => !s.ground).map((s) => [s.dx, s.dy, s.dz, s.id]);
    register(e);
    const cells = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) cells.push([cx + dx, cz + dz]);
    land.reserve(cells, RES.FIRE, e.i);
    e.cx = cx; e.cz = cz;
    S.buildings.push(e);
    return e;
  }

  // place the next block of a building; returns true when it is finished
  function placeNext(e) {
    const s = e.steps[e.next++];
    if (!s) return true;
    if (e.kind === 'field') {
      put(s.x, s.y, s.z, B.FARMLAND, e);
      // breaking the ground sows it too, unless it is winter or too late to ripen (then it waits bare for spring)
      if (s.crop && canSow(e)) put(s.x, s.y + 1, s.z, SB.SPROUT, null);
      else if (isCross(W.get(s.x, s.y + 1, s.z))) put(s.x, s.y + 1, s.z, B.AIR, null); // flowers and tufts on the furrows go
      land.scanColumn(s.x, s.z);
    } else if (s.ground) {
      put(s.x, s.y, s.z, s.id, null);
      land.scanColumn(s.x, s.z);
    } else {
      put(e.cx + s.dx, Math.round(e.y) + s.dy, e.cz + s.dz, s.id, e);
      land.scanColumn(e.cx + s.dx, e.cz + s.dz);
    }
    e.progress = e.next / e.steps.length;
    if (e.next >= e.steps.length) { finish(e); return true; }
    return false;
  }
  function finish(e) {
    e.done = true; e.progress = 1;
    if (e.kind === 'fire') {
      const f = makeFire();
      f.group.position.set(e.cx + 0.5, Math.round(e.y) - 0.05, e.cz + 0.5);
      ctx.layers.entities.add(f.group);
      e.fireFx = f;
    }
    if (e.kind === 'field') {
      e.grow = 0; e.crop = 0; e.sownAt = S.clockT;
      e.bare = !cropsOf(e).some((s) => W.get(s.x, s.y + 1, s.z) === SB.SPROUT);
    }
  }
  // where a builder stands for the next block
  function standFor(e, k = 0) {
    if (e.kind === 'field') {
      const s = e.steps[Math.min(e.steps.length - 1, e.next + k)];
      return { x: s.x + 0.5, z: s.z + 0.5 };
    }
    const ring = [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 2], [-3, -2], [2, -3], [-2, 3]];
    for (let j = 0; j < ring.length; j++) {
      const [dx, dz] = ring[(j + k) % ring.length];
      if (land.passable(e.cx + dx, e.cz + dz, 'person')) return { x: e.cx + dx + 0.5, z: e.cz + dz + 0.5 };
    }
    return { x: e.cx + 3.5, z: e.cz + 0.5 };
  }

  // ---------- crops (docs/SIM.md "Crops") ----------
  // A field is sown (e.bare false), grows (e.grow 0 to 1), fills its standing crop (e.crop, food) while it grows, and
  // waits ripe until it is cut; the cut crop is the basket a person carries home (people.js farm). Other rules that
  // set e.grow = 0 (a drought ending, a fire's ground regrowing, a flood falling) mean "the crop starts again from
  // seed" and leave e.bare as it is. In winter nothing grows and a standing crop perishes a little at a time.
  const cropsOf = (e) => e.crops ?? (e.crops = e.steps.filter((s) => s.crop)); // every field, every frame: kept, not rebuilt
  const isCrop = (id) => id === SB.SPROUT || id === SB.GRAIN || id === B.DEADBUSH;
  // may a field be sown now? Not in winter, nor so late in autumn that the crop could not ripen before it. The time it
  // needs is at the pace it will grow (growField: 0.3 + 0.7 x care of full speed), from the care it is sown with
  // (SOW_CARE, or its own if higher); with no field given, at full care. (2026-11-16: measured with full care for
  // every field, a third of all the crop grown was sown too late and perished standing in winter.)
  const canSow = (e = null) => {
    if (isWinter(S)) return false;
    const care = e ? Math.max(e.care ?? 0, T.SOW_CARE) : 1;
    return secsToWinter(S) >= T.CROP_GROW / (0.3 + 0.7 * care) * T.SOW_LATE;
  };
  // the food of one harvest at full care, before any yield change (FIELD_YIELD over CROP_GROW game seconds)
  const fullHarvest = () => T.FIELD_YIELD * T.CROP_GROW * T.LIFE_RATE / (ctx.clock.secondsPerYear || 2.4);
  function growField(e, gdt) {
    if (!e.done || e.burnt) return; // (a burnt field waits for its ground to grow back: hardship-fire.js)
    const k = gdt * (S.timeK ?? 1);
    const crops = cropsOf(e);
    if (!e.bare) {
      if (isWinter(S)) {
        // the cold: the standing crop perishes over WINTER_PERISH game seconds, and the field shows it cell by cell
        if (e.perishFrom == null) e.perishFrom = Math.max(e.crop ?? 0, 0.01);
        e.crop = Math.max(0, (e.crop ?? 0) - e.perishFrom * k / T.WINTER_PERISH);
        const dead = Math.ceil((1 - e.crop / e.perishFrom) * crops.length);
        while ((e.dead ?? 0) < dead && (e.dead ?? 0) < crops.length) {
          const s = crops[crops.length - 1 - (e.dead ?? 0)];
          e.dead = (e.dead ?? 0) + 1;
          if (W.get(s.x, s.y + 1, s.z) === SB.SPROUT || W.get(s.x, s.y + 1, s.z) === SB.GRAIN) put(s.x, s.y + 1, s.z, B.DEADBUSH, null);
        }
        if (e.crop <= 0.001) { e.crop = 0; e.bare = true; e.grow = 0; e.ripe = 0; e.cut = 0; e.perishFrom = null; e.lost = (e.lost ?? 0) + 1; }
        return;
      }
      e.perishFrom = null; e.dead = 0;
      if (e.grow < 1) {
        e.grow = Math.min(1, e.grow + k / T.CROP_GROW * (0.3 + 0.7 * e.care));
        // the standing crop fills as it grows: FIELD_YIELD x care a life year, through every yield change of the family
        const base = T.FIELD_YIELD * e.care;
        e.crop = (e.crop ?? 0) + (e.family ? S.seam.value('yield', e.family, base) : base) * k * T.LIFE_RATE / (ctx.clock.secondsPerYear || 2.4);
      }
    }
    // the look: sprouts turn to grain as it ripens
    const want = !e.bare && e.grow >= 0.55 ? Math.min(1, (e.grow - 0.55) / 0.35) : 0;
    const target = Math.floor(want * crops.length);
    while ((e.ripe ?? 0) < target) {
      const s = crops[e.ripe ?? 0];
      e.ripe = (e.ripe ?? 0) + 1;
      if (W.get(s.x, s.y + 1, s.z) === SB.SPROUT) put(s.x, s.y + 1, s.z, SB.GRAIN, null);
    }
  }
  // one harvest step: the next three crop cells cut to bare earth; true when all are cut. The cut crop is left in
  // e.basket for whoever cut it (people.js farm carries it home; a raid that burns the field leaves it to be lost)
  function harvestStep(e) {
    const crops = cropsOf(e);
    e.cut = e.cut ?? 0;
    for (let k = 0; k < 3 && e.cut < crops.length; k++) {
      const s = crops[e.cut++];
      if (isCrop(W.get(s.x, s.y + 1, s.z))) put(s.x, s.y + 1, s.z, B.AIR, null);
    }
    if (e.cut >= crops.length) {
      e.basket = (e.basket ?? 0) + Math.max(0, e.crop ?? 0);
      e.crop = 0; e.cut = 0; e.ripe = 0; e.grow = 0; e.bare = true; e.perishFrom = null; e.dead = 0;
      return true;
    }
    return false;
  }
  // one sowing step: the next three crop rows' cells get sprouts; true when the whole field is sown (and growing)
  function sowStep(e) {
    const crops = cropsOf(e);
    e.sown = e.sown ?? 0;
    for (let k = 0; k < 3 && e.sown < crops.length; k++) {
      const s = crops[e.sown++];
      const id = W.get(s.x, s.y + 1, s.z);
      if (id === B.AIR || id === B.DEADBUSH || id === SB.GRAIN) put(s.x, s.y + 1, s.z, SB.SPROUT, null);
    }
    if (e.sown >= crops.length) {
      e.sown = 0; e.bare = false; e.grow = 0; e.ripe = 0; e.cut = 0; e.crop = 0; e.dead = 0; e.perishFrom = null; e.sownAt = S.clockT;
      e.care = Math.max(e.care ?? 0, T.SOW_CARE); // fresh-sown ground starts tended (care fell while it lay bare)
      return true;
    }
    return false;
  }
  // the standing crop gone without a harvest (eaten from the field to the last, burned): bare earth
  function clearCrop(e) {
    for (const s of cropsOf(e)) if (isCrop(W.get(s.x, s.y + 1, s.z))) put(s.x, s.y + 1, s.z, B.AIR, null);
    e.crop = 0; e.cut = 0; e.ripe = 0; e.grow = 0; e.bare = true; e.perishFrom = null; e.dead = 0;
  }
  // a deer trampling a field: a grain cell back to sprouts, and a little of the standing crop lost with it
  function trample(e) {
    const crops = cropsOf(e);
    const s = crops[Math.floor(Math.random() * crops.length)];
    if (s && W.get(s.x, s.y + 1, s.z) === SB.GRAIN) put(s.x, s.y + 1, s.z, SB.SPROUT, null);
    if (e.crop > 0) e.crop *= 1 - 1 / Math.max(1, crops.length);
  }
  // is a field still a field? (the god may have flooded or raised it)
  function fieldIntact(e) {
    let bad = 0;
    for (let k = 0; k < e.steps.length; k += 3) {
      const s = e.steps[k];
      if (W.get(s.x, s.y, s.z) !== B.FARMLAND) bad++;
    }
    return bad * 3 < e.steps.length * 0.5;
  }
  function removeBuilding(e) {
    S.seam?.run('building:removed', e);
    if (e.kind === 'field') for (const s of e.steps) if (s.crop && isCrop(W.get(s.x, s.y + 1, s.z))) put(s.x, s.y + 1, s.z, B.AIR, null);
    land.release(e.i);
    if (e.fireFx) e.fireFx.group.removeFromParent();
    core.removeMany([e]);
    S.buildings.splice(S.buildings.indexOf(e), 1);
  }
  return { placeStone, planHut, planField, planFire, placeNext, standFor, growField, harvestStep, sowStep, clearCrop, canSow, fullHarvest, trample, fieldIntact, removeBuilding, put };
}
