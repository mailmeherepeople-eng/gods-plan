// A. Drought and flood.
// Drought: the rains fail over a circle round one family's home for some
// years. Families living or farming there get DROUGHT_YIELD of their food
// (the shared `yield` stat), their crops wither (dead stalks on the field)
// and the grass goes dry and pale (real blocks, put back when it ends); fire
// catches easier there. Hunger follows by the core's own rules. One moment at
// its start. The god's rain ends it.
// Flood: a lake or river near the huts rises FLOOD_RISE blocks over the low
// land beside it (a flood fill from the water through dry columns lower than
// the new level, within a radius), creeping up over FLOOD_RISE_S game
// seconds, and stays for FLOOD_YEARS. Crops under it are lost (no food from
// those fields while it lasts), the bottom of any hut it reaches is washed
// out (the family sleeps outside and rebuilds when the water falls), and a
// sickness is likelier after. When it falls the ground it covered is mud for
// a while. One moment while it is rising.
import { B, isCross } from '../world/blocks.js';
import { RES } from './land.js';
import { SB } from './build.js';
import { HB } from './hardship-fx.js';
import { range, number, cap, yearLabel } from './words.js';

export function makeWater(H) {
  const { R, S } = H;
  const T = H.T;
  const W = R.ctx.world;
  const L = () => S.land;
  const put = (x, y, z, id) => S.build.put(x, y, z, id, null);
  const mid = (b) => ({ x: b.mx ?? b.cx ?? b.x, z: b.mz ?? b.cz ?? b.z });
  const mud = []; // { x, z, until (life) }

  // ================= drought =================
  const inCircle = (p, h) => Math.hypot(p.x - h.x, p.z - h.z) <= h.r;
  const famIn = (f, h) => !!f && ((f.home && inCircle(mid(f.home), h)) || f.fields.some((fl) => inCircle(mid(fl), h)));
  function droughts() { return H.active('drought'); }
  function dryAt(x, z) { for (const h of droughts()) if (Math.hypot(x - h.x, z - h.z) <= h.r) return true; return false; }
  function droughtOf(f) { return droughts().find((h) => famIn(f, h)) ?? null; }
  // o: { x, z, r, years, sent? }
  function startDrought(o) {
    const years = Math.round(o.years ?? range(T.DROUGHT_YEARS));
    const h = H.begin('drought', { x: o.x, z: o.z, r: o.r ?? range(T.DROUGHT_R), sent: !!o.sent, until: S.year + years, years, text: 'The rains failed', queue: [], dried: [], fields: new Set() });
    const land = L();
    for (let z = Math.floor(h.z - h.r); z <= Math.ceil(h.z + h.r); z++) for (let x = Math.floor(h.x - h.r); x <= Math.ceil(h.x + h.r); x++) {
      if (!land.inside(x, z) || Math.hypot(x + 0.5 - h.x, z + 0.5 - h.z) > h.r) continue;
      h.queue.push(x, z);
    }
    R.mod('yield', `hardship:drought:${h.id}`, { mul: T.DROUGHT_YIELD, who: (f) => famIn(f, h), note: 'drought' });
    const fams = S.families.filter((f) => f.state === 'settled' && famIn(f, h));
    for (const f of fams) { h.families.add(f); for (const m of f.members) { h.people.add(m); R.story(m, 'The rains failed. The grain withered in the field.'); } }
    const who = fams.length ? namesOf(fams) : 'nobody yet';
    H.alertFor(h, 'bad', `The rains have failed around ${who}. Their fields will give ${Math.round(T.DROUGHT_YIELD * 100)} percent of the food for about ${number(years)} years.`, { x: h.x, z: h.z, aside: R.aside('hardship:drought', D_ASIDES) });
    H.moment(h, true, () => ({ text: `A drought: the rains have failed around ${who}. Their fields will give little for about ${number(years)} years.`, x: h.x, z: h.z, kind: 'drought', act: 'Rain: R, then click the dry fields.' }));
    H.signalStart(h);
    return h;
  }
  const namesOf = (fams) => { const n = fams.map((f) => f.name); return n.length === 1 ? `the ${n[0]} family` : n.length === 2 ? `the ${n[0]} and ${n[1]} families` : `the ${n.slice(0, 2).join(', ')} and ${number(n.length - 2)} more families`; };
  function witherField(fl, h) {
    if (h.fields.has(fl)) return;
    h.fields.add(fl);
    for (const s of fl.steps) if (s.crop) { const id = W.get(s.x, s.y + 1, s.z); if (id === SB.SPROUT || id === SB.GRAIN) put(s.x, s.y + 1, s.z, B.DEADBUSH); }
    fl.grow = Math.min(fl.grow, 0.5); fl.ripe = 0;
  }
  function restoreField(fl) {
    if (!S.buildings.includes(fl)) return;
    // (a field left bare through the drought stays bare until someone sows it; a sown one keeps its growth, and its
    // sprouts turn to grain again as far as it has grown: build.js growField)
    for (const s of fl.steps) if (s.crop && W.get(s.x, s.y + 1, s.z) === B.DEADBUSH) put(s.x, s.y + 1, s.z, fl.bare ? B.AIR : SB.SPROUT);
    fl.ripe = 0; fl.cut = 0;
  }
  function endDrought(h, outcome) {
    R.unmod('yield', `hardship:drought:${h.id}`);
    for (let k = 0; k < h.dried.length; k += 2) {
      const x = h.dried[k], z = h.dried[k + 1], top = L().top[L().ci(x, z)];
      if (W.get(x, top, z) === B.GRASS_DRY) { put(x, top, z, B.GRASS); L().scanColumn(x, z); }
    }
    for (const fl of h.fields) restoreField(fl);
    h.queue.length = 0;
    H.finish(h, outcome);
    R.alert(outcome === 'ended' ? 'good' : 'info', outcome === 'ended' ? `Rain fell, and the drought around ${namesOf([...h.families]) || 'the fields'} is over.` : `The drought is over. The rains came back${h.deaths ? `, too late for ${number(h.deaths)}` : ''}.`, { x: h.x, z: h.z });
  }
  let dT = 0;
  function droughtStep(dt) {
    for (const h of droughts()) {
      // the land goes dry a slice at a time (and green again when it ends)
      const land = L();
      for (let n = 0; n < 500 && h.queue.length; n++) {
        const z = h.queue.pop(), x = h.queue.pop();
        const i = land.ci(x, z), top = land.top[i];
        if (land.wet[i] || land.res[i]) continue;
        if (W.get(x, top, z) === B.GRASS) { put(x, top, z, B.GRASS_DRY); h.dried.push(x, z); }
      }
      // (the drought's yield cut slows the crop's filling, build.js growField; the growth itself is set back once, as it
      // withers, and a crop sown during the drought may still ripen thin: the harvest comes, small)
      for (const fl of S.buildings) if (fl.kind === 'field' && fl.done && inCircle(mid(fl), h) && !h.fields.has(fl)) witherField(fl, h);
      for (const f of S.families) if (f.state === 'settled' && !h.families.has(f) && famIn(f, h)) { h.families.add(f); for (const m of f.members) h.people.add(m); }
    }
    dT += dt;
    if (dT > 2) { dT = 0; for (const h of droughts()) if (S.year >= h.until) endDrought(h, 'passed'); }
  }

  // ================= flood =================
  // the low land a body of water would cover if it rose FLOOD_RISE blocks: a flood fill from the water
  // within r of (cx, cz); { level, top, cells: [i...] in the order the water reaches them, dry, huts, fields, families }
  function planFlood(cx, cz, r, rise = T.FLOOD_RISE) {
    const land = L();
    const w = land.nearestWater(cx, cz, Math.ceil(r + 6));
    if (!w) return null;
    const wi = land.ci(w.x, w.z), level = land.top[wi] + land.wet[wi], top = level + rise;
    const ox = w.x + 0.5, oz = w.z + 0.5, rr = r + 2;
    const within = (x, z) => Math.hypot(x + 0.5 - ox, z + 0.5 - oz) <= rr && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r + 6;
    const surf = (i) => land.top[i] + land.wet[i];
    const seen = new Set([wi]), order = [], queue = [wi];
    let dry = 0;
    const huts = new Set(), fields = new Map();
    while (queue.length && order.length < T.FLOOD_MAX) {
      const i = queue.shift();
      order.push(i);
      if (!land.wet[i]) dry++;
      const x = land.cx(i), z = land.cz(i);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!land.inside(nx, nz) || !within(nx, nz)) continue;
        const ni = land.ci(nx, nz);
        if (seen.has(ni)) continue;
        seen.add(ni);
        const res = land.res[ni];
        if (res === RES.HUT || res === RES.DOOR) { const h = S.buildings.find((b) => b.i === land.resOwner[ni] && b.kind === 'hut'); if (h && h.done && Math.round(h.y) <= top) huts.add(h); continue; }
        if (res === RES.STONE || res === RES.FIRE) continue;
        if (land.wet[ni]) { if (surf(ni) <= level) queue.push(ni); continue; }
        if (land.top[ni] >= top || land.obst[ni] || land.tree[ni]) continue;
        if (R.ctx.edgeClear(nx + 0.5, nz + 0.5) < 0.5) continue;
        if (res === RES.FIELD) { const fl = S.buildings.find((b) => b.i === land.resOwner[ni] && b.kind === 'field'); if (fl) fields.set(fl, (fields.get(fl) ?? 0) + 1); }
        queue.push(ni);
      }
    }
    const families = new Set();
    for (const h of huts) if (h.family) families.add(h.family);
    for (const fl of fields.keys()) if (fl.family) families.add(fl.family);
    return { level, top, cells: order, dry, huts: [...huts], fields, families: [...families], x: ox, z: oz, r };
  }
  // ---------- rain tops a pond up (powers-nature.js, rain) ----------
  // The water under a rain rises one block over itself and its lowest shore, within the ring, for
  // TOPUP_YEARS; fields and huts are left dry (a flood is what drowns those). { plan, cells, dry, wet }
  const topUps = []; // { x, z, r, placed: [x, y, z...], under: [x, z...], until (year) }
  function planTopUp(cx, cz, r) {
    // one rain fills a pond once: it is full until that water falls again
    if (topUps.some((t) => Math.hypot(t.x - cx, t.z - cz) <= t.r + r)) return null;
    const P = planFlood(cx, cz, Math.min(r, 16), 1);
    if (!P) return null;
    const land = L();
    // the water itself, and only the first ring of shore round it
    const shore = (i) => { const x = land.cx(i), z = land.cz(i); return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => land.inside(x + dx, z + dz) && land.wet[land.ci(x + dx, z + dz)]); };
    const cells = P.cells.filter((i) => Math.hypot(land.cx(i) + 0.5 - cx, land.cz(i) + 0.5 - cz) <= r + 1 && land.res[i] !== RES.FIELD && (land.wet[i] || shore(i))).slice(0, T.TOPUP_MAX);
    const wet = cells.filter((i) => land.wet[i]).length;
    if (wet < 3) return null;
    return { plan: P, cells, wet, dry: cells.length - wet };
  }
  function topUp(U, r, cx = U.plan.x, cz = U.plan.z) {
    const land = L(), t = { x: cx, z: cz, r, placed: [], under: [], until: S.year + T.TOPUP_YEARS };
    for (const i of U.cells) {
      const x = land.cx(i), z = land.cz(i);
      for (let y = land.top[i] + land.wet[i] + 1; y <= U.plan.top; y++) {
        const id = W.get(x, y, z);
        if (id !== B.AIR && !isCross(id)) break;
        put(x, y, z, B.WATER); t.placed.push(x, y, z);
      }
      if (!land.wet[i]) t.under.push(x, z);
      land.scanColumn(x, z);
    }
    if (t.placed.length) topUps.push(t);
    return t;
  }
  function recedeTopUp(t) {
    for (let k = t.placed.length - 3; k >= 0; k -= 3) { const x = t.placed[k], y = t.placed[k + 1], z = t.placed[k + 2]; if (W.get(x, y, z) === B.WATER) put(x, y, z, B.AIR); }
    for (let k = 0; k < t.placed.length; k += 3) L().scanColumn(t.placed[k], t.placed[k + 2]);
  }

  // o: { plan, years?, sent?, cause? }
  function startFlood(o) {
    const P = o.plan, years = Math.round(o.years ?? range(T.FLOOD_YEARS));
    const h = H.begin('flood', { x: P.x, z: P.z, r: P.r, sent: !!o.sent, plan: P, until: S.year + years, years, rising: true, ri: 0, placed: [], under: [], text: 'The water rose', damaged: [] });
    // a pond the rain topped up here is part of this flood now: it falls with it
    for (let k = topUps.length - 1; k >= 0; k--) {
      const t = topUps[k];
      if (Math.hypot(t.x - P.x, t.z - P.z) > P.r + t.r + 4) continue;
      h.placed.push(...t.placed); h.under.push(...t.under); topUps.splice(k, 1);
    }
    for (const f of P.families) { h.families.add(f); for (const m of f.members) h.people.add(m); }
    // the crops under it are lost now; the families get none from those fields until it falls
    for (const f of P.families) {
      const lost = [...P.fields.keys()].filter((fl) => fl.family === f && P.fields.get(fl) >= 4).length;
      const n = f.fields.length || 1;
      if (lost) R.mod('yield', `hardship:flood:${h.id}:${f.id}`, { mul: Math.max(0.1, 1 - lost / n), who: f, note: 'fields under water' });
      f.ext.hardship = f.ext.hardship ?? {};
      f.ext.hardship.floodedUntil = S.year + years + 10;
    }
    // a sickness after it, among the families it reached (a sent flood brings its forecast roll)
    if (o.sickIn !== undefined) h.sickAt = o.sickIn == null || !P.families.length ? null : S.year + o.sickIn;
    else if (Math.random() < T.FLOOD_SICK && P.families.length) h.sickAt = S.year + range([1, Math.max(2, years * 0.6)]);
    const who = P.families.length ? namesOf(P.families) : 'the empty shore';
    H.alertFor(h, 'bad', `The water is rising over the low land by the shore${P.families.length ? `, toward ${who}` : ''}. It will stay for about ${number(years)} years.`, { x: P.x, z: P.z, aside: R.aside('hardship:flood', F_ASIDES) });
    H.signalStart(h);
    return h;
  }
  function riseCell(h, i) {
    const land = L(), x = land.cx(i), z = land.cz(i), top = h.plan.top;
    const g = land.top[i] + land.wet[i];
    for (let y = g + 1; y <= top; y++) {
      const id = W.get(x, y, z);
      if (id !== B.AIR && !isCross(id)) break;
      put(x, y, z, B.WATER);
      h.placed.push(x, y, z);
    }
    if (!land.wet[i]) h.under.push(x, z);
    land.scanColumn(x, z);
  }
  function floodStep(dt) {
    for (const h of H.active('flood')) {
      if (h.rising) {
        const P = h.plan, per = Math.max(1, Math.ceil(P.cells.length / (T.FLOOD_RISE_S / Math.max(dt, 1e-3))));
        for (let n = 0; n < per && h.ri < P.cells.length; n++) riseCell(h, P.cells[h.ri++]);
        const who = P.families.length ? namesOf(P.families) : null;
        H.moment(h, !!who, () => ({ text: `The water is rising over the land of ${who}.`, x: P.x, z: P.z, kind: 'flood', act: 'Nothing stops rising water. Rain would only add to it.' }));
        if (h.ri >= P.cells.length) { h.rising = false; H.moment(h, false); washOut(h); }
      }
      if (h.sickAt && S.year >= h.sickAt) { h.sickAt = null; const sk = H.sick.start({ families: h.plan.families }); if (sk) sk.after = 'flood'; }
    }
    dT2 += dt;
    if (dT2 > 2) { dT2 = 0; for (const h of H.active('flood')) if (!h.rising && S.year >= h.until) recede(h, 'passed'); }
  }
  let dT2 = 0;
  // the bottom of each hut it reached is washed out: the family sleeps outside until they rebuild
  function washOut(h) {
    for (const hut of h.plan.huts) {
      if (!hut.done) continue;
      for (const p of S.people) if (p.inside === hut && !p.dead) S.peopleApi.exitHome(p);
      const y0 = Math.round(hut.y);
      for (const [dx, dy, dz, id] of hut.cells) if (dy === 0 && id === B.WATTLE) S.build.put(hut.cx + dx, y0, hut.cz + dz, B.AIR, hut);
      hut.done = false; hut.progress = 0.5;
      h.damaged.push(hut);
      for (const m of hut.family?.members ?? []) R.story(m, 'The flood washed out the walls of the family hut.');
      R.alert('warn', `The flood washed out the walls of ${hut.family ? `the ${hut.family.name} family's hut` : 'an empty hut'}. They will sleep outside until the water falls and they rebuild.`, { x: hut.cx, z: hut.cz, subject: hut });
    }
    // the crops under the water are lost: the standing crop with them
    for (const fl of h.plan.fields.keys()) { fl.grow = 0; fl.ripe = 0; fl.cut = 0; fl.crop = 0; }
  }
  function recede(h, outcome) {
    for (let k = h.placed.length - 3; k >= 0; k -= 3) { const x = h.placed[k], y = h.placed[k + 1], z = h.placed[k + 2]; if (W.get(x, y, z) === B.WATER) put(x, y, z, B.AIR); }
    const land = L();
    for (let k = 0; k < h.under.length; k += 2) {
      const x = h.under[k], z = h.under[k + 1];
      land.scanColumn(x, z);
      const top = land.top[land.ci(x, z)];
      const g = W.get(x, top, z);
      if (g === B.GRASS || g === B.GRASS_DRY) { put(x, top, z, HB.MUD); mud.push({ x, z, until: S.life + T.MUD_YEARS }); land.scanColumn(x, z); }
    }
    for (let k = 0; k < h.placed.length; k += 3) land.scanColumn(h.placed[k], h.placed[k + 2]);
    // the water falls: the fields come back sown (grown from the silt), unless it is winter, when they wait bare
    for (const fl of h.plan.fields.keys()) if (S.buildings.includes(fl) && fl.done) {
      const sowNow = S.build.canSow?.() ?? true;
      for (const s of fl.steps) if (s.crop) { const id = W.get(s.x, s.y + 1, s.z); if (id === B.AIR || id === B.WATER) put(s.x, s.y + 1, s.z, sowNow ? SB.SPROUT : B.AIR); }
      fl.bare = !sowNow; fl.grow = 0; fl.crop = 0;
    }
    for (const f of h.plan.families) R.unmod('yield', `hardship:flood:${h.id}:${f.id}`);
    for (const hut of h.damaged) H.ruin(hut, 'flood', { keepProgress: true });
    H.finish(h, outcome);
    R.alert('info', `The flood has gone down.${h.damaged.length ? ` ${cap(number(h.damaged.length))} ${h.damaged.length === 1 ? 'family is' : 'families are'} rebuilding.` : ''}`, { x: h.x, z: h.z });
  }

  // ---------- each year: a drought or a flood may come by itself; mud dries ----------
  function year() {
    for (let k = topUps.length - 1; k >= 0; k--) if (S.year >= topUps[k].until) { recedeTopUp(topUps[k]); topUps.splice(k, 1); }
    for (let i = mud.length - 1; i >= 0; i--) {
      const m = mud[i];
      if (S.life < m.until) continue;
      mud.splice(i, 1);
      const top = L().top[L().ci(m.x, m.z)];
      if (W.get(m.x, top, m.z) === HB.MUD) { put(m.x, top, m.z, B.GRASS); L().scanColumn(m.x, m.z); }
    }
    if (!H.ready()) return;
    const homes = S.buildings.filter((b) => b.kind === 'hut' && b.done && b.family);
    if (!homes.length) return;
    if (!droughts().length && Math.random() < T.DROUGHT_CHANCE) {
      const hut = homes[Math.floor(Math.random() * homes.length)];
      startDrought({ x: hut.cx + range([-12, 12]), z: hut.cz + range([-12, 12]) });
    }
    if (!H.active('flood').length && Math.random() < T.FLOOD_CHANCE) {
      for (let k = 0; k < 6; k++) {
        const hut = homes[Math.floor(Math.random() * homes.length)];
        const P = planFlood(hut.cx, hut.cz, range(T.FLOOD_R));
        if (P && P.dry >= T.FLOOD_MIN_CELLS && (P.huts.length || P.fields.size)) { startFlood({ plan: P }); break; }
      }
    }
  }
  function step(dt) { droughtStep(dt); floodStep(dt); }
  const floodNear = (x, z, r) => H.active('flood').some((h) => Math.hypot(h.x - x, h.z - z) <= (h.r ?? 0) + r);
  return { startDrought, endDrought, planFlood, startFlood, step, year, dryAt, droughts, droughtOf, famIn, namesOf, yearLabel, planTopUp, topUp, topUps, floodNear };
}

const D_ASIDES = ['Nobody here has heard of a well. That comes later.', 'The sky, it turns out, can simply stop.', 'Everyone suddenly has opinions about clouds.'];
const F_ASIDES = ['Living by the water had one drawback. This one.', 'The lake wanted its shore back.', 'Wet feet for everyone, for years.'];
