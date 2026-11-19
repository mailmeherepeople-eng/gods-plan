// Berry bushes: the wild food people walk to, pick and carry home (they replaced the old gathering that took food
// from any empty spot near home, 2026-11-16). A bush is a block on the ground (world/blocks.js): SHRUB_BERRY while it
// carries ripe berries, BERRY_BARE once picked or out of season (in spring a bare bush shows blossom, drawn by the
// mesher and shown by the season's bloom, view/seasons.js bloomFor). This file keeps the list of bushes, read from
// the world (again after every god edit), turns them ripe and bare by the season (sim/season.js, read through
// sim/food-season.js), and hands out picking trips.
// Its numbers are in tune.js (BERRY_*); docs/SIM.md "Berries".
import { B } from '../world/blocks.js';
import { T } from './tune.js';
import { seasonOf, berrySeason } from './food-season.js';

export function makeBerries(ctx, S) {
  const W = ctx.world, land = S.land;
  const bushes = new Map(); // land cell index -> { x, z, y, i, ripe, at (game seconds it changes next), by (claimed by), until }
  const stats = { picked: 0, food: 0, regrown: 0, stripped: 0 };
  let dirty = true, seasonName = null, tickT = 0;
  ctx.events?.on?.('edit', () => { dirty = true; });
  const rand = Math.random;
  const isBush = (id) => id === B.SHRUB_BERRY || id === B.BERRY_BARE;

  // the bushes as the world has them now: kept where they still stand (with their timers), new ones added
  function scan() {
    dirty = false;
    const seen = new Set();
    for (let i = 0; i < land.top.length; i++) {
      const x = land.cx(i), z = land.cz(i), y = land.top[i] + 1;
      const id = W.get(x, y, z);
      if (!isBush(id)) continue;
      seen.add(i);
      let b = bushes.get(i);
      if (!b) { b = { x, z, y, i, ripe: id === B.SHRUB_BERRY, at: S.clockT + rand() * T.BERRY_SPREAD, by: null, until: 0 }; bushes.set(i, b); }
      else { b.y = y; b.ripe = id === B.SHRUB_BERRY; }
    }
    for (const i of [...bushes.keys()]) if (!seen.has(i)) bushes.delete(i);
  }
  const setRipe = (b, ripe) => {
    if (b.ripe === ripe) return;
    b.ripe = ripe;
    if (isBush(W.get(b.x, b.y, b.z))) S.build.put(b.x, b.y, b.z, ripe ? B.SHRUB_BERRY : B.BERRY_BARE, null);
  };

  // twice a second: bushes ripen in a fruiting season (each on its own time), and lose their fruit out of one
  let rescanT = 20;
  function tick(gdt) {
    // (the sim's own writes do not send an edit: a field or hut built over a bush is found on the next look round)
    rescanT -= gdt;
    if (rescanT <= 0) { rescanT = 20; dirty = true; }
    if (dirty && !land.needFull) scan();
    tickT -= gdt;
    if (tickT > 0) return;
    tickT = 0.5;
    const s = seasonOf(S), fruit = berrySeason(S);
    if (s.name !== seasonName) {
      // a season turns: each bush changes over the next BERRY_SPREAD game seconds, not all in one moment
      const was = seasonName;
      seasonName = s.name;
      if (was !== null || !fruit) for (const b of bushes.values()) b.at = S.clockT + rand() * T.BERRY_SPREAD;
    }
    for (const b of bushes.values()) {
      if (S.clockT < b.at) continue;
      if (fruit && !b.ripe) { setRipe(b, true); stats.regrown++; }
      else if (!fruit && b.ripe) { setRipe(b, false); stats.stripped++; }
      b.at = Infinity;
    }
  }

  // a trip for a picker from home (x, z): the nearest ripe bush nobody else is going to, and up to BERRY_TRIP - 1
  // more ripe ones within 5 blocks of it; null if none lies within BERRY_REACH
  function trip(from, p) {
    if (dirty && !land.needFull) scan();
    const r2 = T.BERRY_REACH * T.BERRY_REACH;
    let best = null, bd = Infinity;
    for (const b of bushes.values()) {
      if (!b.ripe || (b.by && b.by !== p && b.until > S.clockT && !b.by.dead)) continue;
      const d = (b.x + 0.5 - from.x) ** 2 + (b.z + 0.5 - from.z) ** 2;
      if (d < bd && d <= r2) { bd = d; best = b; }
    }
    if (!best) return null;
    const out = [best];
    for (const b of bushes.values()) {
      if (out.length >= T.BERRY_TRIP) break;
      if (b === best || !b.ripe || (b.by && b.by !== p && b.until > S.clockT && !b.by.dead)) continue;
      if (Math.abs(b.x - best.x) <= 5 && Math.abs(b.z - best.z) <= 5) out.push(b);
    }
    for (const b of out) { b.by = p; b.until = S.clockT + 60; }
    return out;
  }
  // pick one bush: its berries (BERRY_FOOD), and it stands bare until it fruits again (BERRY_REGROW, in season)
  function pick(b, p) {
    if (b.by === p) b.by = null;
    if (!b.ripe || bushes.get(b.i) !== b || !isBush(W.get(b.x, b.y, b.z))) return 0;
    setRipe(b, false);
    b.at = S.clockT + T.BERRY_REGROW * (0.8 + rand() * 0.4);
    stats.picked++; stats.food += T.BERRY_FOOD;
    return T.BERRY_FOOD;
  }
  // ripe bushes within r of a point, and all bushes there (for the forecasts and the checks)
  function near(x, z, r) {
    if (dirty && !land.needFull) scan();
    let ripe = 0, all = 0;
    for (const b of bushes.values()) if ((b.x + 0.5 - x) ** 2 + (b.z + 0.5 - z) ** 2 <= r * r) { all++; if (b.ripe) ripe++; }
    return { ripe, all };
  }
  return { tick, trip, pick, near, scan, list: () => [...bushes.values()], stats: () => ({ ...stats, bushes: bushes.size, ripe: [...bushes.values()].filter((b) => b.ripe).length }) };
}
