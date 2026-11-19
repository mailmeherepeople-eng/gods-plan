// A. Fire. Started by lightning (more often in a drought) or a hearth (any
// lived-in hut, now and then), or by the god. It runs on walking time (dt), so
// it plays out in seconds on screen. Each burning column may set its eight
// neighbours alight, by how much they will burn: trees and thatch burn hard,
// dry grass well, green grass barely, crops in between; water and bare ground
// (dirt, sand, rock, paving, a burnt patch) stop it. When a column burns out
// the land changes for real: trees go to a charred stump, grass to ash, crops
// off the field, bushes and flowers gone. A hut that catches burns for
// HUT_BURN_S, then its thatch and walls are gone and the family rebuilds it
// (the core's own building plan, from the first block). Anyone indoors when
// their hut catches either gets out or, rolled at that moment (FIRE_TRAP x
// the death stat), is trapped and dies when it falls, unless rain puts it out
// first. People near the flames run; some are burned (a wound, see
// hardship-sick.js). Ash turns back to grass after ASH_YEARS, a burnt field
// grows again after FIELD_REGROW. One moment, while the fire threatens huts
// or someone is trapped. Flames: one instanced mesh (hardship-fx.js).
import { B, isCross } from '../world/blocks.js';
import { RES } from './land.js';
import { SB } from './build.js';
import { HB } from './hardship-fx.js';
import { TREE_IDS } from '../edit/vox.js';
import { range, number, cap, yearLabel } from './words.js';

const TICK = 0.25; // game seconds between fire steps
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const LEAVES = new Set([B.LEAVES, B.LEAVES_DARK, B.LEAVES_BRIGHT]);
const TRUNK = new Set([B.WOOD, B.WOOD_BIRCH]);

export function makeFire(H) {
  const { R, S, fx } = H;
  const T = H.T;
  R.words.fire = 'died in a fire';
  const W = R.ctx.world;
  const cells = new Map();     // column index -> { x, z, t, ttl, fire, seed }
  const huts = new Map();      // hut -> { fire, t, trapped: [people] }
  const burntFields = new Map(); // field -> { until (life), family }
  const ash = [];              // { x, z, until (life) }
  let acc = 0;
  const L = () => S.land;

  // ---------- what burns ----------
  const hutAt = (i) => { const o = L().resOwner[i]; return S.buildings.find((b) => b.i === o && b.kind === 'hut') ?? null; };
  // ground the god's rain soaked: nothing on it catches until it dries ({ x, z, r, until: S.clockT })
  const soaked = [];
  const wetAt = (x, z) => { for (const w of soaked) if (S.clockT < w.until && Math.hypot(x + 0.5 - w.x, z + 0.5 - w.z) <= w.r + 1) return w; return null; };
  function wetten(x, z, r, secs) { for (let k = soaked.length - 1; k >= 0; k--) if (S.clockT >= soaked[k].until) soaked.splice(k, 1); soaked.push({ x, z, r, until: S.clockT + secs }); }
  function fuel(x, z) {
    const land = L();
    if (!land.inside(x, z)) return 0;
    const i = land.ci(x, z);
    if (land.wet[i]) return 0;
    if (soaked.length && wetAt(x, z)) return 0;
    const res = land.res[i];
    if (res === RES.HUT) { const h = hutAt(i); return h && h.progress > 0.5 && !huts.has(h) ? T.FIRE_HUT : 0; }
    if (res === RES.STONE || res === RES.FIRE) return 0;
    if (land.tree[i]) return T.FIRE_TREE * (S.eco?.fuelMul(x, z) ?? 1); // a wood that has not burned for long is dense (ecology.js)
    const g = land.gid[i], top = land.top[i], up = W.get(x, top + 1, z);
    let f = 0;
    if (up === SB.GRAIN) f = T.FIRE_CROP * 1.3;
    else if (up === SB.SPROUT || up === B.DEADBUSH) f = up === B.DEADBUSH ? T.FIRE_DRY : T.FIRE_CROP * 0.6;
    else if (g === B.GRASS) f = T.FIRE_GRASS * (H.water?.dryAt(x, z) ? T.FIRE_DROUGHT : 1);
    else if (g === B.GRASS_DRY) f = T.FIRE_DRY;
    if (up === B.BUSH || up === B.BUSH_BARE || (isCross(up) && up !== SB.SPROUT && up !== SB.GRAIN)) f += 0.15;
    return f;
  }
  const flameY = (x, z, i) => { const land = L(); if (land.tree[i]) return land.top[i] + 3; return land.top[i] + 1; };

  // ---------- setting alight ----------
  function ignite(x, z, fire) {
    const land = L();
    if (!land.inside(x, z)) return false;
    const i = land.ci(x, z);
    if (cells.has(i) || fire.burned.has(i) || fire.count >= T.FIRE_MAX) return false;
    if (land.res[i] === RES.HUT) { const h = hutAt(i); if (h) catchHut(h, fire); return !!h; }
    if (fuel(x, z) <= 0) return false;
    cells.set(i, { x, z, i, t: 0, ttl: range(T.FIRE_CELL_S), fire, seed: Math.random() * 6.28, y: flameY(x, z, i), tree: !!land.tree[i] });
    fire.count++; fire.burned.add(i);
    return true;
  }
  // a hut catches: who is indoors gets out or is trapped (rolled now, or by the god's forecast)
  function catchHut(h, fire, pre) {
    if (huts.has(h) || !h.done || (soaked.length && wetAt(h.cx, h.cz))) return false;
    const trapped = [];
    for (const p of S.people) {
      if (p.dead || p.inside !== h) continue;
      const roll = pre?.get(p);
      const stuck = roll !== undefined ? roll : Math.random() < Math.min(0.9, T.FIRE_TRAP * R.value('death', p));
      if (stuck) { trapped.push(p); H.data(p).trapped = { fire: fire.id, hut: h }; H.trouble.roll(p); }
      else { S.peopleApi.exitHome(p); flee(p, h.cx, h.cz); }
    }
    huts.set(h, { fire, t: 0, trapped });
    fire.huts.add(h);
    const land = L();
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (land.inside(h.cx + dx, h.cz + dz)) fire.burned.add(land.ci(h.cx + dx, h.cz + dz));
    if (h.family) { fire.families.add(h.family); for (const m of h.family.members) fire.people.add(m); }
    R.alert('warn', `${hutName(h)} caught fire.${trapped.length ? ` ${names(trapped)} ${trapped.length === 1 ? 'is' : 'are'} trapped inside.` : ''}`, { x: h.cx, z: h.cz, subject: h });
    return true;
  }
  const hutName = (h) => (h.family ? `The hut of the ${h.family.name} family` : 'An empty hut');
  const names = (l) => (l.length <= 2 ? l.map((p) => p.name).join(' and ') : `${l.slice(0, 2).map((p) => p.name).join(', ')} and ${number(l.length - 2)} more`);

  // ---------- burning out: the land changes ----------
  const put = (x, y, z, id) => S.build.put(x, y, z, id, null);
  function burnOut(c) {
    const land = L(), { x, z, i } = c;
    const top = land.top[i];
    if (c.tree) {
      for (let y = top + 1; y <= Math.min(W.maxY, top + 16); y++) {
        const id = W.get(x, y, z);
        if (TRUNK.has(id)) put(x, y, z, y === top + 1 ? B.CHARCOAL : B.AIR);
        else if (LEAVES.has(id) || TREE_IDS.has(id)) put(x, y, z, B.AIR);
      }
      // the canopy around it goes too
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!land.inside(nx, nz)) continue;
        const t2 = land.top[land.ci(nx, nz)];
        for (let y = t2 + 2; y <= Math.min(W.maxY, t2 + 16); y++) if (LEAVES.has(W.get(nx, y, nz))) put(nx, y, nz, B.AIR);
      }
    } else {
      const up = W.get(x, top + 1, z);
      if (up === B.BUSH || up === B.BUSH_BARE || isCross(up)) put(x, top + 1, z, B.AIR);
      if (up === B.BUSH || up === B.BUSH_BARE) { for (let y = top + 2; y <= top + 3; y++) if (W.get(x, y, z) === B.BUSH || W.get(x, y, z) === B.BUSH_BARE) put(x, y, z, B.AIR); }
    }
    if (land.res[i] === RES.FIELD) {
      const fl = S.buildings.find((b) => b.i === land.resOwner[i] && b.kind === 'field');
      if (fl) burnField(fl, c.fire);
    } else {
      const g = W.get(x, top, z);
      if (g === B.GRASS || g === B.GRASS_DRY) { put(x, top, z, HB.ASH); ash.push({ x, z, until: S.life + T.ASH_YEARS }); }
    }
    land.scanColumn(x, z);
  }
  function burnField(fl, fire) {
    if (!burntFields.has(fl)) {
      for (const s of fl.steps) if (s.crop) { const id = W.get(s.x, s.y + 1, s.z); if (id === SB.SPROUT || id === SB.GRAIN || id === B.DEADBUSH) put(s.x, s.y + 1, s.z, B.AIR); }
      // the standing crop burns with it; the field lies burnt (not to be sown) until the ground grows back
      fl.grow = 0; fl.ripe = 0; fl.cut = 0; fl.crop = 0; fl.bare = false; fl.burnt = true;
      if (fl.family) { fire.families.add(fl.family); for (const m of fl.family.members) fire.people.add(m); }
    }
    burntFields.set(fl, { until: S.life + T.FIELD_REGROW, family: fl.family });
    fieldMods(fl.family);
  }
  // a family's food from its fields falls by the share that burned
  function fieldMods(f) {
    if (!f) return;
    const n = f.fields.length || 1;
    const burnt = f.fields.filter((fl) => burntFields.has(fl)).length;
    const key = `hardship:fire-fields:${f.id}`;
    if (!burnt) { R.unmod('yield', key); return; }
    R.mod('yield', key, { mul: Math.max(0.1, 1 - burnt / n), who: f, note: 'fields burned' });
  }
  function burnHut(h, st) {
    huts.delete(h);
    const y0 = Math.round(h.y);
    for (const [dx, dy, dz, id] of h.cells) {
      const x = h.cx + dx, y = y0 + dy, z = h.cz + dz;
      const cur = W.get(x, y, z);
      if (cur === B.AIR) continue;
      const keep = dy === 0 && (id === B.WOOD || (id === B.WATTLE && Math.random() < 0.5));
      S.build.put(x, y, z, keep ? B.CHARCOAL : B.AIR, h);
    }
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) L().scanColumn(h.cx + dx, h.cz + dz);
    for (const p of st.trapped) {
      if (p.dead) continue;
      H.data(p).trapped = null;
      S.peopleApi.die(p, 'fire', { where: `, trapped in the burning hut` });
      st.fire.deaths++;
    }
    H.ruin(h, 'fire');
    R.alert('bad', `${hutName(h)} burned down.${h.family ? ' They will have to build it again.' : ''}`, { x: h.cx, z: h.cz, subject: h });
  }

  // ---------- people near the flames run ----------
  function flee(p, fx0, fz0) {
    const d = H.data(p);
    d.flee = { x: fx0, z: fz0, until: S.clockT + 5 };
    p.go = null; p.work = null;
  }
  R.on('activity', (p) => {
    const f = p.ext?.hardship?.flee;
    if (!f) return false;
    if (S.clockT > f.until) { p.ext.hardship.flee = null; return false; }
    const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz) || 1;
    const s = S.peopleApi.spotNear(p.x + dx / d * 12, p.z + dz / d * 12, 0, 3);
    S.peopleApi.goTo(p, s.x, s.z, { speed: R.T.RUN, direct: true, until: 6, doing: 'running from the fire' });
    p.ext.hardship.flee = null;
    return true;
  });
  function nearFire(p) {
    const land = L(), x = Math.floor(p.x), z = Math.floor(p.z);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const c = land.inside(x + dx, z + dz) ? cells.get(land.ci(x + dx, z + dz)) : null; if (c) return c; }
    return null;
  }

  // ---------- starting one ----------
  // o: { x, z, r?, hut?, sent?, cause, pre? (Map person -> trapped), by? }
  function start(o) {
    const h = H.begin('fire', { x: o.x, z: o.z, r: 8, sent: !!o.sent, text: 'A fire broke out', cause: o.cause ?? 'lightning', count: 0, burned: new Set(), huts: new Set(), rolled: new Set() });
    let lit = 0;
    if (o.hut) { if (catchHut(o.hut, h, o.pre)) lit++; }
    const r = o.r ?? 1;
    for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dz * dz > r * r + 0.5) continue;
      const x = Math.floor(o.x) + dx, z = Math.floor(o.z) + dz;
      const land = L();
      if (land.inside(x, z) && land.res[land.ci(x, z)] === RES.HUT) { const hut = hutAt(land.ci(x, z)); if (hut && catchHut(hut, h, o.pre)) lit++; continue; }
      if (ignite(x, z, h)) lit++;
    }
    if (!lit) { H.finish(h, 'passed', { quiet: true }); return null; }
    // a fire becomes a hardship (alert, signal, tally) once it matters: a hut caught, FIRE_HARDSHIP columns
    // taken, or flames near a home; one sent or set in anger at once. A spark that dies in the grass is not one.
    h.announce = () => {
      if (h.signalled) return;
      const where = o.hut ? (o.hut.family ? `in the hut of the ${o.hut.family.name} family` : 'in an empty hut') : nearHuts(o.x, o.z);
      R.alert('warn', `${o.cause === 'a hearth' ? 'A hearth fire spread' : o.cause === 'a quarrel' ? 'A fire set in anger is burning' : o.sent ? 'Fire fell from the sky' : 'Lightning started a fire'} ${where}.`, { x: o.x, z: o.z, aside: R.aside('hardship:fire', ASIDES) });
      H.signalStart(h);
    };
    if (o.hut || o.sent || o.cause === 'a quarrel' || h.huts.size) h.announce();
    return h;
  }
  function nearHuts(x, z) {
    let best = null, bd = 1e9;
    for (const b of S.buildings) if (b.kind === 'hut' && b.family) { const d = Math.hypot(b.cx - x, b.cz - z); if (d < bd) { bd = d; best = b; } }
    return best && bd < 40 ? `near the ${best.family.name} family's hut` : 'out in the wilds';
  }

  // ---------- rain puts it out, and wet ground does not catch (powers-nature.js, rain) ----------
  function inR(x, z, cx, cz, r) { return Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r; }
  function preview(x, z, r) {
    const out = { cells: 0, huts: [], trapped: [] };
    for (const c of cells.values()) if (inR(c.x, c.z, x, z, r + 1)) out.cells++;
    for (const [h, st] of huts) if (Math.hypot(h.cx - x, h.cz - z) <= r + 3) { out.huts.push(h); out.trapped.push(...st.trapped.filter((p) => !p.dead)); }
    return out;
  }
  function douse(x, z, r) {
    const out = preview(x, z, r);
    for (const [i, c] of cells) if (inR(c.x, c.z, x, z, r + 1)) { cells.delete(i); c.fire.doused = true; c.fire.aidedAll = true; }
    for (const h of out.huts) {
      const st = huts.get(h);
      huts.delete(h);
      st.fire.doused = true; st.fire.aidedAll = true;
      for (const p of st.trapped) { if (p.dead) continue; H.data(p).trapped = null; if (p.inside) { S.peopleApi.exitHome(p); flee(p, h.cx, h.cz); } }
    }
    return out;
  }

  // ---------- each step ----------
  function step(dt) {
    acc += dt;
    if (acc < TICK) { draw(); return; }
    const k = acc; acc = 0;
    const land = L();
    // spread, then burn out
    for (const c of [...cells.values()]) {
      c.t += k;
      const f = c.fire;
      for (const [dx, dz] of N8) {
        const nx = c.x + dx, nz = c.z + dz;
        if (!land.inside(nx, nz)) continue;
        const ni = land.ci(nx, nz);
        if (cells.has(ni) || f.burned.has(ni)) continue;
        const fu = fuel(nx, nz);
        if (fu > 0 && Math.random() < 1 - Math.exp(-T.FIRE_SPREAD * fu * k * (dx && dz ? 0.7 : 1))) ignite(nx, nz, f);
      }
      if (c.t >= c.ttl) { cells.delete(c.i); burnOut(c); }
    }
    // huts burn, set their surroundings alight, and fall
    for (const [h, st] of [...huts]) {
      st.t += k;
      for (let j = 0; j < 3; j++) {
        const a = Math.random() * 6.283, rr = 3 + Math.random() * 1.5;
        const nx = Math.floor(h.cx + Math.cos(a) * rr), nz = Math.floor(h.cz + Math.sin(a) * rr);
        const fu = fuel(nx, nz);
        if (fu > 0 && Math.random() < 1 - Math.exp(-T.FIRE_SPREAD * fu * k * 2)) ignite(nx, nz, st.fire);
      }
      if (st.t >= T.HUT_BURN_S) burnHut(h, st);
    }
    // people close by run, and some are burned (once each per fire)
    if (cells.size) for (const p of S.people) {
      if (p.dead || p.hidden || p.family.state !== 'settled') continue;
      const c = nearFire(p);
      if (!c) continue;
      const d = H.data(p);
      if (!d.flee && p.doing !== 'running from the fire') flee(p, c.x + 0.5, c.z + 0.5);
      const f = c.fire;
      f.people.add(p); f.families.add(p.family);
      if (!f.rolled.has(p)) {
        f.rolled.add(p);
        if (Math.random() < T.FIRE_WOUND) H.sick.wound(p, 'fire', { h: f, base: T.BURN_DIE });
      }
    }
    // each fire: its moment while it threatens huts or someone is trapped, and its end
    for (const f of H.active('fire')) {
      const mine = [...huts].filter(([, st]) => st.fire === f);
      const trapped = mine.flatMap(([, st]) => st.trapped.filter((p) => !p.dead));
      let threat = mine.length > 0, at = null;
      if (!threat) {
        const homes = S.buildings.filter((b) => b.kind === 'hut' && b.family && b.done);
        outer: for (const c of cells.values()) {
          if (c.fire !== f) continue;
          for (const b of homes) if (Math.abs(b.cx - c.x) < 9 && Math.abs(b.cz - c.z) < 9) { threat = true; at = b; break outer; }
        }
      }
      if (threat || mine.length || f.count >= T.FIRE_HARDSHIP) f.announce?.();
      if (threat) {
        const h0 = mine[0]?.[0] ?? at;
        H.moment(f, true, () => ({
          text: trapped.length ? `${names(trapped)} ${trapped.length === 1 ? 'is' : 'are'} trapped in the burning hut of the ${h0.family?.name ?? 'empty'} family.` : mine.length ? `The hut of the ${h0.family?.name ?? 'empty'} family is burning.` : `A fire is burning toward the ${h0.family.name} family's hut.`,
          x: h0.cx, z: h0.cz, kind: 'fire', act: 'Rain: R, then click the fire.',
        }), { minor: !trapped.length }); // nobody trapped: a minor moment (short, never straight after another)
      } else H.moment(f, false);
      const alive = mine.length || [...cells.values()].some((c) => c.fire === f);
      if (!alive) {
        H.finish(f, f.doused ? 'ended' : f.deaths ? 'killed' : 'passed');
        if (f.count > 20 || f.huts.size) R.alert(f.deaths ? 'bad' : 'info', `The fire is out${f.doused ? ': rain put it out' : ''}. ${f.huts.size ? `${cap(number(f.huts.size))} ${f.huts.size === 1 ? 'hut' : 'huts'} caught. ` : ''}${f.deaths ? `${cap(number(f.deaths))} died.` : 'Nobody died.'}`, { x: f.x, z: f.z });
      }
    }
    draw();
  }
  function draw() {
    if (!cells.size && !huts.size) { if (drawn) { fx.drawFlames([]); drawn = false; } return; }
    const list = [];
    for (const c of cells.values()) list.push({ x: c.x + 0.5, y: c.y, z: c.z + 0.5, s: c.tree ? 1.3 : 0.8, seed: c.seed });
    for (const h of huts.keys()) for (const [dx, dz] of [[0, 0], [-1, -1], [1, 1], [1, -1], [-1, 1]]) list.push({ x: h.cx + 0.5 + dx, y: Math.round(h.y) + 2.6, z: h.cz + 0.5 + dz, s: 1.1, seed: dx * 3 + dz });
    fx.drawFlames(list);
    drawn = true;
  }
  let drawn = false;

  // ---------- each year: lightning, hearths, regrowth ----------
  function year() {
    // ash back to grass, burnt fields grow again
    for (let i = ash.length - 1; i >= 0; i--) {
      const a = ash[i];
      if (S.life < a.until) continue;
      ash.splice(i, 1);
      const top = L().top[L().ci(a.x, a.z)];
      if (W.get(a.x, top, a.z) === HB.ASH) { put(a.x, top, a.z, B.GRASS); L().scanColumn(a.x, a.z); }
    }
    for (const [fl, b] of [...burntFields]) {
      if (S.life < b.until && S.buildings.includes(fl)) continue;
      burntFields.delete(fl);
      // the burnt field grows back from the ash, sown by itself (in winter it waits bare for someone to sow it)
      const sowNow = S.build.canSow?.() ?? true;
      if (S.buildings.includes(fl) && fl.done) for (const s of fl.steps) if (s.crop && W.get(s.x, s.y + 1, s.z) === B.AIR && sowNow) put(s.x, s.y + 1, s.z, SB.SPROUT);
      fl.grow = 0; fl.ripe = 0; fl.cut = 0; fl.crop = 0; fl.burnt = false; fl.bare = !sowNow;
      fieldMods(b.family);
    }
    if (!H.ready() || H.active('fire').length) return;
    const homes = S.buildings.filter((b) => b.kind === 'hut' && b.done && b.family);
    if (!homes.length) return;
    // a hearth: one hut in so many catches
    if (Math.random() < T.HEARTH * homes.length) {
      const hut = homes[Math.floor(Math.random() * homes.length)];
      start({ x: hut.cx, z: hut.cz, r: 0, hut, cause: 'a hearth' });
      return;
    }
    // lightning: somewhere that will burn near the settlement, oftener in a drought (and there)
    const dry = H.water?.droughts() ?? [];
    if (Math.random() < T.LIGHTNING * (dry.length ? T.LIGHTNING_DRY : 1)) {
      const c = dry.length ? dry[0] : homes[Math.floor(Math.random() * homes.length)];
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * 6.283, d = Math.random() * (c.r ?? 40);
        const x = Math.floor((c.cx ?? c.x) + Math.cos(a) * d), z = Math.floor((c.cz ?? c.z) + Math.sin(a) * d);
        if (fuel(x, z) >= T.FIRE_GRASS * 2 && R.ctx.edgeClear(x + 0.5, z + 0.5) > 0.6) { R.bolt(x + 0.5, L().top[L().ci(x, z)] + 1, z + 0.5); start({ x, z, r: 1, cause: 'lightning' }); return; }
      }
    }
  }

  // ---------- for the fate panel and the forecasts ----------
  function endOf(p) {
    const t = p.ext?.hardship?.trapped;
    if (!t) return null;
    const st = huts.get(t.hut);
    if (!st) return null;
    return { age: Math.floor(p.age), how: 'fire', words: `in a fire at ${Math.floor(p.age)}`, line: `Dies in the burning hut at ${Math.floor(p.age)}, unless the fire is put out.` };
  }
  // what a fire started here would catch at once (for the god's forecast): { fuel cells, huts, inside }
  function whatBurns(x, z, r) {
    const land = L(), out = { cells: 0, huts: new Set(), fields: new Set(), trees: 0 };
    for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dz * dz > r * r + 0.5) continue;
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
      if (!land.inside(cx, cz)) continue;
      const i = land.ci(cx, cz);
      if (land.res[i] === RES.HUT) { const h = hutAt(i); if (h && h.done && !huts.has(h) && !(soaked.length && wetAt(h.cx, h.cz))) out.huts.add(h); continue; }
      if (fuel(cx, cz) > 0) { out.cells++; if (land.tree[i]) out.trees++; if (land.res[i] === RES.FIELD) { const fl = S.buildings.find((b) => b.i === land.resOwner[i]); if (fl) out.fields.add(fl); } }
    }
    return out;
  }
  const burningNear = (x, z, r) => [...cells.values()].some((c) => inR(c.x, c.z, x, z, r + 1)) || [...huts.keys()].some((h) => Math.hypot(h.cx - x, h.cz - z) <= r + 3);
  return { start, step, year, douse, preview, endOf, whatBurns, burningNear, fuel, huts, cells, catchHut, yearLabel, wetten, wetAt, soaked };
}

const ASIDES = ['Thatch: excellent roofing, until it is not.', 'Fire was a wonderful discovery. Mostly.', 'Somebody will now invent the bucket. Not yet, though.'];
