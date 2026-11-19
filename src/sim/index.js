// The people simulation (stage 1): settlers walk in from the mist, judge the
// land, settle by fresh water and flat grass, build huts and fields, fetch
// water, farm, pray at the standing stone in proportion to their faith, sleep
// at night, are born, age and die; deer, birds and wolves share the land.
// Owned by the people work. Contract: docs/STAGE1-CONTRACTS.md; rules as
// built and every number: docs/SIM.md (numbers in ./tune.js).
//
// Steps by ctx.clock.dt (game seconds), never by the real dt it is handed
// (that only fades the strike bolt). Does nothing in the creation phase except
// place the standing stone. Moving meshes live under ctx.layers.entities,
// unfolded, in the shared enhanced material, so they fade into the edge mist.
import * as THREE from '../../vendor/three.module.js';
import { T } from './tune.js';
import { makeLand, RES } from './land.js';
import { makeBuilder } from './build.js';
import { makePeople } from './people.js';
import { makeAnimals } from './animals.js';
import { makePowers } from './powers.js';
import { makeMind } from './mind.js';
import { devCave } from './devcave.js';
import { makeShadows, applyPose, sleepPose } from './bodies.js';
import { separateAll, groundTick, turn, snapToGround, LEAF_IDS } from './move.js';
import { devLand, devLandWanted } from './devland.js';
import { range, plural } from './words.js';
import { makeSkip, soak } from './skip.js';
import { makeSeam } from './seam.js';
import { PLUGINS } from './plugins.js';
import { X0, Z0, X1, Z1, SY } from '../edit/vox.js';
import { isSolid } from '../world/blocks.js';

export async function init(ctx) {
  const S = {
    ctx, people: [], animals: [], buildings: [], families: [], herds: [], flocks: [], predators: [], attacks: [], warrens: [],
    year: ctx.clock.year, startYear: ctx.clock.year, life: 0, clockT: 0, dayClock: 0, dayT: T.DAY_START, dayN: 0, daylight: 1,
    started: false, births: 0, deaths: 0, log: [], fire: null, deerCount: 0,
  };
  S.lifeNow = () => S.life;
  // the plugin seam (seam.js; docs/STAGE2-CONTRACTS.md): stage 2 subsystems register here, loaded from plugins.js
  S.seam = makeSeam(ctx, S);
  // real time in ms for the moment caps (animals.js); skip.js runs it on its own clock
  S.now = () => performance.now();
  // a skip's events carry skip: true (seam.js does the same for signals), so the screen can file them to the Log
  S.emit = (name, payload) => ctx.events.emit(name, S.skipAlerts && payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.assign(payload, { skip: true }) : payload);
  // `aside`: an optional dry remark for the narrator; the HUD decides whether to show it
  // `subject`: the person or animal the alert is about, so the HUD can select it
  S.alert = (severity, text, x, z, aside, subject) => {
    const a = { severity, text, x, z, year: S.year };
    if (aside) a.aside = aside;
    if (subject) a.subject = subject;
    S.log.push(a); if (S.log.length > 80) S.log.shift();
    if (S.skipAlerts) { S.skipAlerts.push(a); return; } // a skip ahead collects them for its summary (skip.js)
    ctx.events.emit('sim:alert', a);
  };
  // small news (births, old age, new households) is told one by one while the
  // settlement is small, then summed up every 10 calendar years
  const pending = {};
  const SUM = { born: (n) => `${plural(n, 'child', 'children')} ${n === 1 ? 'was' : 'were'} born.`, old: (n) => `${plural(n, 'person', 'people')} died of old age.`, pair: (n) => `${plural(n, 'young couple')} started households of their own.` };
  S.tally = (key, sev, text, x, z, subject) => {
    const settled = S.people.filter((p) => p.family.state === 'settled').length;
    if (!SUM[key] || settled < 40) { S.alert(sev, text, x, z, undefined, subject); return; }
    const p = pending[key] ?? (pending[key] = { n: 0, sev, since: S.year, x, z });
    p.n++;
  };
  const flushTally = () => {
    for (const k of Object.keys(pending)) {
      const p = pending[k];
      if (S.year - p.since < 10) continue;
      if (p.n) S.alert(p.sev, SUM[k](p.n), p.x, p.z);
      delete pending[k];
    }
  };

  // ---------- the land, the stone ----------
  const devland = devLandWanted();
  if (devland) devLand(ctx);
  S.land = makeLand(ctx);
  S.land.fullScan();
  S.build = makeBuilder(ctx, S);
  const scx = Math.floor((X0 + X1) / 2) - 1, scz = Math.floor((Z0 + Z1) / 2);
  S.stone = S.build.placeStone(scx, scz);
  S.isProtected = (x, z) => {
    x = Math.floor(x); z = Math.floor(z);
    const p = S.stone.protect;
    if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return true;
    if (!S.land.inside(x, z)) return false;
    const r = S.land.res[S.land.ci(x, z)];
    return r === RES.HUT || r === RES.FIRE || r === RES.STONE || r === RES.DOOR || r === RES.CAVE;
  };
  S.mind = makeMind(ctx, S);
  S.peopleApi = makePeople(ctx, S);
  S.animalsApi = makeAnimals(ctx, S);
  const P = makePowers(ctx, S);
  S.seam.useSight(P);
  const shadows = makeShadows(1024);
  ctx.layers.entities.add(shadows);

  // A god edit: the land map is scanned again in full on the next frame. The map as it was is kept until then, so
  // the frame can see which columns changed (afterEdit).
  let before = null;
  ctx.events.on('edit', () => {
    S.land.needFull = true;
    if (!before) before = { top: S.land.top.slice(), obst: S.land.obst.slice(), wet: S.land.wet.slice() };
  });
  // After a god edit: walks that cross a changed column are dropped (each walker looks for a new way), and anyone
  // the new ground has swallowed (raised under them, or built over them) is lifted onto it in one step, not hopped
  // up a block at a time.
  function afterEdit() {
    const L = S.land, W = ctx.world, b = before;
    before = null;
    const changed = new Uint8Array(L.top.length);
    let any = false;
    for (let i = 0; i < changed.length; i++) if (L.top[i] !== b.top[i] || L.obst[i] !== b.obst[i] || L.wet[i] !== b.wet[i]) { changed[i] = 1; any = true; }
    if (!any) return;
    const hit = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); return L.inside(cx, cz) && changed[L.ci(cx, cz)] === 1; };
    const crosses = (e) => {
      if (!e.path) return false;
      let ax = e.x, az = e.z;
      for (let k = e.pi ?? 0; k < e.path.length; k++) {
        const [bx, bz] = e.path[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
        for (let j = 1; j <= n; j++) if (hit(ax + (bx - ax) * j / n, az + (bz - az) * j / n)) return true;
        ax = bx; az = bz;
      }
      return false;
    };
    const settle = (e) => {
      if (e.dead || e.hidden) return;
      if (hit(e.x, e.z) || crosses(e)) e.path = null;
      const cx = Math.floor(e.x), cz = Math.floor(e.z);
      // ground at the feet (leaves are never ground, move.js): up to the top of it
      const ground = (yy) => { const id = W.get(cx, yy, cz); return isSolid(id) && !LEAF_IDS.has(id); };
      let y = Math.floor(e.y + 0.05);
      if (!ground(y)) return;
      while (y < SY - 2 && ground(y)) y++;
      e.y = e.groundY = y; e.jumpV = null; e.hop = null; e.fallV = 0;
    };
    for (const p of S.people) settle(p);
    for (const a of S.animals) if (a.species !== 'bird') settle(a);
  }

  // ---------- starting the clock ----------
  function start() {
    S.started = true;
    S.startYear = ctx.clock.year;
    S.year = ctx.clock.year;
    S.land.fullScan();
    for (let k = 0; k < T.DEER_HERDS; k++) S.animalsApi.spawnHerd();
    for (let k = 0; k < T.BIRD_FLOCKS; k++) S.animalsApi.spawnFlock();
    for (let k = 0; k < T.RABBIT_WARRENS; k++) S.animalsApi.spawnWarren();
    S.arriveNext = null;
    S.predNext = S.year + T.PRED_FIRST;
    S.alert('info', S.seam.ask('noHuts') ? 'Time has begun. Families will walk in from the mist. They stay only where they find fresh water and a home: a cave, until they learn to build huts.'
      : 'Time has begun. Families will walk in from the mist. They stay only where they find fresh water and flat grass to farm.');
    S.seam.started();
  }

  // ---------- drawing ----------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function drawPerson(p, dt, far) {
    const F = p.F, g = F.group;
    if (p.hidden) { if (g.visible) g.visible = false; return; }
    if (!g.visible) g.visible = true;
    if (!p.dead) turn(p, dt, 9);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.ry;
    if (F.far.visible !== far) { F.far.visible = far; F.fig.visible = !far; }
    if (p.dead) return;
    const fig = F.fig;
    p.t = (p.t ?? Math.random() * 9) + dt;
    let lean = 0, figY = 0;
    const w = p.work;
    if (p.moving) {
      p.walkPh = (p.walkPh ?? 0) + dt * (p.go?.speed ?? 2) * 3.8;
      const sw = Math.sin(p.walkPh) * 0.6;
      F.legL.rotation.x = sw; F.legR.rotation.x = -sw;
      F.armL.rotation.x = -sw * 0.55; F.armR.rotation.x = sw * 0.55;
      F.armL.rotation.z = F.armR.rotation.z = 0;
      figY = Math.abs(Math.sin(p.walkPh)) * 0.06; lean = 0.07 + (p.fleeing ? 0.12 : 0);
    } else if (w?.pose) {
      const r = applyPose(F, w.pose, w.t);
      lean = r.lean; figY = r.figY;
    } else if (!far) {
      const k = Math.min(1, 8 * dt);
      for (const l of [F.legL, F.legR, F.armL, F.armR]) l.rotation.x -= l.rotation.x * k;
      const sway = Math.sin(p.t * 1.3) * 0.04;
      F.armL.rotation.z = 0.05 + sway; F.armR.rotation.z = -0.05 + sway;
    }
    F.body.scale.y = 1 + Math.sin(p.t * 1.7) * 0.02;
    // asleep outdoors: on the back on a mat, under a blanket, breathing (bodies.js sleepPose)
    const sl = sleepPose(F, p.asleep && !p.hidden, p.t, p.family.dye);
    if (sl) { lean = sl.lean; figY = sl.figY; }
    fig.position.y = figY;
    fig.rotation.x = lean;
  }
  function drawAnimal(a, dt) {
    const F = a.F, g = F.group;
    if (!a.dead) turn(a, dt, a.state === 'flee' || a.state === 'sprint' ? 14 : 7);
    g.position.set(a.x, a.y, a.z);
    g.rotation.y = a.ry;
    if (a.dead) return;
    a.t += dt;
    if (a.species === 'bird') {
      const flap = a.flying ? Math.sin(a.t * 14 + a.slot) * 0.7 : 0;
      F.wl.rotation.z = flap; F.wr.rotation.z = -flap;
      return;
    }
    if (a.species === 'rabbit') {
      // a rabbit hops: the whole figure bounces while it moves, its head dips while it nibbles
      if (a.moving) a.phase += dt * (a.state === 'flee' ? 16 : 11);
      F.fig.position.y = a.moving ? Math.abs(Math.sin(a.phase)) * 0.22 : 0;
      a.graze = a.moving ? 0 : Math.min(1, (a.graze ?? 0) + dt * 3);
      F.head.position.y = F.headY - a.graze * 0.08;
      return;
    }
    if (a.moving) {
      a.phase += dt * (a.state === 'flee' || a.state === 'sprint' ? 15 : 8);
      const amp = a.state === 'flee' || a.state === 'sprint' ? 0.8 : 0.55;
      for (const l of F.legs) l.rotation.x = Math.sin(a.phase + l._ph) * amp;
      a.graze = Math.max(0, a.graze - dt * 4);
    } else {
      const k = Math.min(1, 8 * dt);
      for (const l of F.legs) l.rotation.x -= l.rotation.x * k;
      a.graze = a.grazeT > 0 && a.species === 'deer' ? Math.min(1, a.graze + dt * 3) : Math.max(0, a.graze - dt * 3);
    }
    F.head.position.y = F.headY - a.graze * 0.3;
    F.head.rotation.x = a.graze * 0.9 + (a.state === 'stalk' ? 0.25 : 0);
    F.fig.position.y = (a.state === 'stalk' ? -0.08 : 0) + (a.moving && a.state === 'flee' ? Math.abs(Math.sin(a.phase * 0.5)) * 0.1 : 0);
    F.body.scale.y = 1 + Math.sin(a.t * 1.9) * 0.02;
  }
  function drawShadows() {
    let n = 0;
    const put = (x, y, z, r) => {
      if (n >= 1024) return;
      const k = Math.max(0, Math.min(1, (ctx.edgeClear(x, z) - 0.1) / 0.5));
      if (k <= 0) return;
      _p.set(x, y + 0.04, z); _s.set(r * k, 1, r * k);
      shadows.setMatrixAt(n++, _m.compose(_p, _q, _s));
    };
    for (const p of S.people) if (!p.hidden) put(p.x, p.groundY ?? p.y, p.z, p.stage === 'child' ? 0.32 : 0.5);
    for (const a of S.animals) {
      if (a.species === 'bird') { if (a.flying) put(a.x, a.flock.ground ?? 16, a.z, 0.25); else put(a.x, a.y, a.z, 0.22); }
      else put(a.x, a.groundY ?? a.y, a.z, a.species === 'wolf' ? 0.75 : a.species === 'rabbit' ? 0.28 : 0.6);
    }
    shadows.count = n;
    shadows.instanceMatrix.needsUpdate = true;
  }
  function draw(gdt) {
    const far = ctx.camera.ppm < T.LOD_PPM;
    // walking (view/walk.js): the full figure near the eye, the one-mesh figure only beyond walk.near.r metres
    const near = ctx.walk?.near;
    if (near) {
      // ...and nobody past the walk's far plane (near.far2) is posed or drawn at all: they could not be seen
      // (drawPerson shows them again the frame they come back in range, or when walking ends)
      for (const p of S.people) {
        const d2 = (p.x - near.x) ** 2 + (p.z - near.z) ** 2;
        if (near.far2 && d2 > near.far2) { if (p.F.group.visible) p.F.group.visible = false; continue; }
        drawPerson(p, gdt, d2 > near.r2);
      }
      for (const a of S.animals) {
        if (near.far2 && (a.x - near.x) ** 2 + (a.z - near.z) ** 2 > near.far2) { a.F.group.position.set(a.x, a.y, a.z); continue; }
        drawAnimal(a, gdt);
      }
    } else if (far && ctx.closeup) {
      // the close-up window (ui/closeup.js) shows its part of the land near: the people in it keep their full figure
      const cu = ctx.closeup;
      for (const p of S.people) drawPerson(p, gdt, (p.x - cu.x) ** 2 + (p.z - cu.z) ** 2 > cu.r2);
      for (const a of S.animals) drawAnimal(a, gdt);
    } else {
      for (const p of S.people) drawPerson(p, gdt, far);
      for (const a of S.animals) drawAnimal(a, gdt);
    }
    // the fire flickers
    if (S.fire?.fireFx) {
      const f = S.fire.fireFx, t = performance.now() / 1000;
      f.a.scale.set(1, 0.8 + Math.sin(t * 9) * 0.15 + Math.sin(t * 23) * 0.08, 1);
      f.b.scale.set(1, 0.8 + Math.sin(t * 13 + 1) * 0.2, 1);
    }
    drawShadows();
  }
  // a lived-in home (a hut or a cave with a family) glows at its doorway at night, the hearth's light spilling
  // onto the ground in front, a little brighter with people inside (engine/lighting.js stamps it into the
  // firelight map; fires and torches carry userData.glow)
  const litHomes = new Map();
  ctx.renderer?.addGlowSource?.((push) => {
    litHomes.clear();
    for (const p of S.people) if (p.inside) litHomes.set(p.inside, (litHomes.get(p.inside) ?? 0) + 1);
    for (const h of S.buildings) {
      if ((h.kind !== 'hut' && h.kind !== 'cave') || !h.done || !h.door || !(h.family || h.households?.length || litHomes.has(h))) continue;
      const x = h.door.x, z = h.door.z;
      let y = h.y ?? 16;
      try { y = ctx.vox.standY(Math.floor(x), Math.floor(z)); } catch { /* the door's own height */ }
      push(x, y, z, 'hut', 1 + 0.1 * Math.min(3, litHomes.get(h) ?? 0));
    }
  });

  // ---------- the day ----------
  const daylightAt = (t) => {
    const s = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
    if (t < T.DAWN[1]) return s(T.DAWN[0], T.DAWN[1], t);
    if (t < T.DUSK[0]) return 1;
    return 1 - s(T.DUSK[0], T.DUSK[1], t);
  };
  let lastDaylight = -1;
  function tickDay(gdt) {
    S.dayClock += gdt;
    const d = S.dayClock / T.DAY_SECONDS + T.DAY_START;
    S.dayN = Math.floor(d); S.dayT = d - S.dayN;
    S.daylight = daylightAt(S.dayT);
    if (Math.abs(S.daylight - lastDaylight) >= T.DAYLIGHT_STEP || ((S.daylight === 0 || S.daylight === 1) && S.daylight !== lastDaylight)) {
      lastDaylight = S.daylight;
      S.emit('sim:daylight', { level: S.daylight });
    }
  }

  // ---------- arrivals and the shared fire circle ----------
  function tickArrivals() {
    const wandering = S.families.filter((f) => (f.state === 'wander' || f.state === 'settling') && !S.seam.ask('sheltering', f)).length; // a family camping under trees (shelter.js) does not hold back the next
    if (S.arriveNext == null) { if (S.clockT >= T.FIRST_ARRIVAL) { S.peopleApi.spawnFamily(); S.arriveNext = S.year + range((S.seam.ask('caveRoom') ?? []).length ? T.ARRIVE_ROOM : T.ARRIVE_EVERY); } return; }
    if (S.year < S.arriveNext || wandering >= T.MAX_WANDERING) return;
    S.peopleApi.spawnFamily();
    const settled = S.families.filter((f) => f.state === 'settled').length;
    // a steady trickle while there is room: a cave with room for a household, or huts known and the land not yet full
    const room = (S.seam.ask('caveRoom') ?? []).length > 0 || (S.seam.ask('hutsKnown') !== false && stats.settled < T.ROOM_PEOPLE);
    S.arriveNext = S.year + range(room ? T.ARRIVE_ROOM : T.ARRIVE_EVERY) * (settled > T.ARRIVE_SLOW_FAMILIES ? 2 : 1);
  }
  // buildings nobody will finish (their family died or left) are taken down;
  // abandoned fields go back to grass after a while unless someone adopts them
  let tidyT = 0;
  function tidy(gdt) {
    tidyT -= gdt;
    if (tidyT > 0) return;
    tidyT = 2;
    for (const b of [...S.buildings]) {
      if (b.family || b.kind === 'fire') { b.orphanSince = null; continue; }
      b.orphanSince = b.orphanSince ?? S.life;
      if (!b.done || (b.kind === 'field' && S.life - b.orphanSince > 20)) S.build.removeBuilding(b);
    }
  }
  let fireT = 0;
  function tickFire(gdt) {
    fireT -= gdt;
    if (fireT > 0 || S.fire) return;
    fireT = 2;
    const all = S.buildings.filter((b) => (b.kind === 'hut' || b.kind === 'cave') && b.done && b.family); // caves.js: a cave is a home
    // the biggest cluster of huts (those within 30 of the hut with most neighbours)
    let core = null, most = 0;
    for (const h of all) { const n = all.filter((o) => Math.hypot(o.cx - h.cx, o.cz - h.cz) < 30).length; if (n > most) { most = n; core = h; } }
    const huts = core ? all.filter((o) => Math.hypot(o.cx - core.cx, o.cz - core.cz) < 30) : [];
    if (huts.length < 3) return;
    let x = 0, z = 0;
    for (const h of huts) { x += h.cx; z += h.cz; }
    x = Math.round(x / huts.length); z = Math.round(z / huts.length);
    for (let r = 0; r <= 14 && !S.fire; r++) for (let k = 0; k < Math.max(1, r * 8) && !S.fire; k++) {
      const a = k / Math.max(1, r * 8) * Math.PI * 2, fx = Math.round(x + Math.cos(a) * r), fz = Math.round(z + Math.sin(a) * r);
      if (S.land.fireSite(fx, fz) && !S.isProtected(fx, fz)) S.fire = S.build.planFire(fx, fz);
    }
  }

  // ---------- rescue ----------
  // About once a second: anyone (people and animals that walk) whose feet are more than 1.5 above the real ground
  // of where they stand (the land map's ground, trees, roofs, bushes and crops left out, plus any water over it) is
  // stuck up on something (a trunk, a hut, a wall top) and is set down on the nearest good spot instead.
  let rescueT = 0;
  function rescue(gdt) {
    rescueT -= gdt;
    if (rescueT > 0) return;
    rescueT = 1;
    const L = S.land, W = ctx.world;
    const check = (e, mode) => {
      if (e.dead || e.hidden || e.jumpV != null || e.hop) return;
      let g = -Infinity;
      for (let cx = Math.floor(e.x - 0.15); cx <= Math.floor(e.x + 0.15); cx++)
        for (let cz = Math.floor(e.z - 0.15); cz <= Math.floor(e.z + 0.15); cz++)
          if (L.inside(cx, cz)) { const i = L.ci(cx, cz); g = Math.max(g, L.top[i] + 1 + L.wet[i]); }
      if (!(e.y - g > 1.5)) return;
      const s = L.nearestSpot(e.x, e.z, mode, 8) ?? L.nearestOpen(e.x, e.z, mode, 8);
      if (s) { e.x = s.x; e.z = s.z; }
      snapToGround(W, e);
      e.path = null;
    };
    for (const p of S.people) check(p, 'person');
    for (const a of S.animals) if (a.species !== 'bird') check(a, a.species === 'wolf' ? 'pred' : 'deer');
  }

  // ---------- one frame ----------
  const _ps = [], _as = [], _sep = [];
  const copyInto = (out, src) => { out.length = src.length; for (let i = 0; i < src.length; i++) out[i] = src[i]; return out; };
  function update(dt) {
    P.tickBolts(dt);
    const clk = ctx.clock;
    if (clk.phase !== 'running') return;
    if (!S.started) start();
    const gdt = clk.dt;
    if (!(gdt > 0)) { stats.daylight = S.daylight; return; }
    S.land.newFrame();
    S.land.tick();
    if (before && !S.land.needFull) afterEdit();
    S.year = clk.year;
    const dLife = clk.dYears * T.LIFE_RATE;
    // how fast the calendar runs against walking time: 1 normally, CLOCK.MOMENT_RATE while a decision is
    // open. Work that makes food or grows crops is measured in years, so it is scaled by this.
    S.timeK = clk.dYears * clk.secondsPerYear / gdt;
    S.life += dLife; S.clockT += gdt;
    tickDay(gdt);
    tickArrivals();
    S.peopleApi.tick(gdt, dLife);
    S.animalsApi.tick(gdt, dLife);
    for (const fl of S.flocks) S.animalsApi.flockStep(fl, gdt);
    for (const b of S.buildings) if (b.kind === 'field') S.build.growField(b, gdt);
    tickFire(gdt);
    tidy(gdt);
    flushTally();
    // the subsystems' step and year hooks, then the moment caps (seam.js; the same order in a skip)
    S.seam.tick(gdt, clk.dYears, dLife);
    const n = Math.max(1, Math.ceil(gdt / 0.06)), sdt = gdt / n;
    const W = ctx.world;
    // copies into reused arrays (a step may remove someone from the live list); no garbage per frame
    for (let k = 0; k < n; k++) {
      for (const p of copyInto(_ps, S.people)) { S.peopleApi.step(p, sdt); if (!p.hidden) groundTick(W, p, sdt); }
      for (const a of copyInto(_as, S.animals)) { S.animalsApi.step(a, sdt); if (a.species !== 'bird' && S.animals.includes(a)) groundTick(W, a, sdt); }
    }
    copyInto(_sep, S.people);
    for (const a of S.animals) if (a.species !== 'bird') _sep.push(a);
    separateAll(W, _sep, gdt);
    rescue(gdt);
    draw(gdt);
    updateStats();
  }

  // ---------- stats and inspect ----------
  // population and families count everyone living in the land (2026-11-14: the World door read 0 while newcomers
  // walked about); settled and wanderers split the people, settledFamilies and wanderingFamilies the families. A rule
  // that needs settled people asks for `settled` by name (the arrivals' room rule, the skip summary's settlers).
  const stats = { population: 0, settled: 0, wanderers: 0, families: 0, settledFamilies: 0, wanderingFamilies: 0, homes: 0, farms: 0, predators: 0,
    happiness: 0, faith: 0, skepticism: 0, daylight: 1, deer: 0, birds: 0, births: 0, deaths: 0, expectsHelp: 0, year: S.year };
  function updateStats() {
    const alive = S.people.filter((p) => !p.dead);
    const settled = alive.filter((p) => p.family.state === 'settled');
    const pool = settled.length ? settled : alive;
    const avg = (k) => (pool.length ? Math.round(pool.reduce((s, p) => s + p[k], 0) / pool.length) : 0);
    stats.population = alive.length;
    stats.settled = settled.length;
    stats.wanderers = alive.length - settled.length;
    const fams = S.families.filter((f) => f.members.some((p) => !p.dead));
    stats.families = fams.length;
    stats.settledFamilies = fams.filter((f) => f.state === 'settled').length;
    stats.wanderingFamilies = stats.families - stats.settledFamilies;
    stats.homes = S.buildings.filter((b) => (b.kind === 'hut' || b.kind === 'cave') && b.done && b.family).length;
    stats.farms = S.buildings.filter((b) => b.kind === 'field' && b.done && b.family).length;
    stats.predators = S.predators.filter((w) => !w.dead).length;
    stats.deer = S.animals.filter((a) => a.species === 'deer' && !a.dead).length;
    stats.birds = S.animals.filter((a) => a.species === 'bird' && !a.dead).length;
    stats.rabbits = S.animals.filter((a) => a.species === 'rabbit' && !a.dead).length;
    stats.happiness = avg('happy'); stats.faith = avg('faith'); stats.skepticism = avg('skep');
    stats.daylight = Math.round(S.daylight * 100) / 100;
    stats.births = S.births; stats.deaths = S.deaths;
    stats.expectsHelp = settled.filter((p) => p.expectsHelp).length;
    stats.year = Math.floor(S.year);
    S.seam.run('stats', stats);
  }

  // inspect extenders (seam 'inspect' hooks) add fields or named sections: R.section(out, { id, title, lines })
  function inspect(e) {
    const out = inspectCore(e);
    if (out && S.seam.has('inspect')) S.seam.run('inspect', typeof e === 'string' ? (ctx.core.byId.get(e) ?? S.people.find((p) => p.id === e)) : e, out);
    return out;
  }
  function inspectCore(e) {
    if (typeof e === 'string') e = ctx.core.byId.get(e) ?? S.people.find((p) => p.id === e);
    if (!e) return null;
    const r = (v) => Math.round(v);
    if (e.kind === 'person') {
      const f = e.family;
      const role = e.dead ? 'dead' : f.state !== 'settled' ? (f.state === 'leaving' ? 'leaving' : 'wanderer') : e.stage === 'child' ? 'child' : e.stage === 'elder' ? 'elder' : 'settler';
      const home = f.home ? `${f.home.done ? 'the hut' : 'a hut being built'} of the ${f.name} family` : f.state === 'settled' ? 'none yet' : 'none: on the move';
      return {
        name: `${e.name} of the ${f.name} family`, kind: 'person', age: Math.floor(e.age), role, doing: e.dead ? (e.cause ? `dead (${e.cause})` : 'dead') : e.doing,
        happiness: r(e.happy), faith: r(e.faith), skepticism: r(e.skep), home, story: [...e.story],
        thought: e.planted?.text ?? e.thought ?? '', thoughts: [...(e.thoughts ?? [])], fate: S.mind.fateOf(e),
        expectsHelp: e.expectsHelp, sex: e.sex, hunger: Math.round(e.hunger * 10) / 10, familyFood: Math.round(f.food * 10) / 10,
      };
    }
    if (e.kind === 'animal') {
      return {
        name: e.name, kind: e.species, age: Math.floor(e.age), role: e.species === 'wolf' ? 'predator' : 'wild animal', doing: e.dead ? 'dead' : e.doing,
        happiness: null, faith: null, skepticism: null, home: e.species === 'deer' ? 'the herd' : e.species === 'rabbit' ? 'the warren' : 'the wilds', story: e.placed ? ['Put here by your hand.'] : [],
        thought: e.species === 'wolf' ? (e.prey ? 'Meat. Close now.' : 'Hungry.') : e.species === 'deer' ? (e.state === 'flee' ? 'Danger!' : 'Grass.') : e.species === 'rabbit' ? (e.state === 'flee' ? 'Run run run.' : e.nibble ? 'Oh, lettuce. Well, grain.' : 'Clover.') : 'Up. Down. Up.',
        thoughts: [], fate: e.species === 'wolf' && e.prey?.kind === 'person' && e.outcome
          ? [e.outcome === 'kill' ? `Will kill ${e.prey.name}.` : e.outcome === 'wound' ? `Will bite ${e.prey.name}, who will live.` : `Will lose ${e.prey.name}, who will see it coming.`] : [],
      };
    }
    if (e.kind === 'stone') {
      const praying = S.people.filter((p) => p.work?.pose === 'pray').length;
      return { name: e.name, kind: 'stone', age: Math.floor(S.year - S.startYear), role: 'holy place', doing: praying ? `${plural(praying, 'person', 'people')} praying here` : 'standing', happiness: null, faith: null, skepticism: null, home: null, story: ['It was here before anyone came.'], thought: null, thoughts: [], fate: ['Will stand here long after everyone you can see is gone.'] };
    }
    if (e.cat === 'building') {
      // a field: bare (waiting to be sown), growing, or ripe (waiting to be cut), and the food standing in it
      const crop = Math.round((e.crop ?? 0) * 10) / 10;
      const field = () => (e.burnt ? 'burnt, growing back' : e.bare ? 'bare, waiting to be sown' : e.grow >= 1 ? `ripe, waiting to be harvested (${crop} food standing)` : `growing (${r(e.grow * 100)} percent ripe, care ${r(e.care * 100)} percent, ${crop} food so far)`);
      const doing = !e.done ? `being built (${r((e.progress ?? 0) * 100)} percent)` : e.kind === 'field' ? (e.family ? field() : 'abandoned') : e.family ? 'lived in' : 'empty';
      return { name: e.name, kind: e.kind, age: null, role: e.kind, doing, happiness: null, faith: null, skepticism: null, home: e.family ? `the ${e.family.name} family` : null, story: [], thought: null, thoughts: [], fate: [] };
    }
    return null;
  }

  // ---------- console helpers (testing; see docs/SIM.md) ----------
  const dev = {
    S, T,
    family: (side) => S.peopleApi.spawnFamily(side),
    wolf: () => S.animalsApi.spawnWolf(),
    herd: () => S.animalsApi.spawnHerd(),
    // n extra settled people for a load test: new families around the stone, or bigger households
    // A settled village lives in huts, so the Huts discovery is made with it (caves.js: before huts a new couple needs
    // a cave, and a crowd has none, so nobody could pair or have children): crowd(n, { huts: false }) keeps it unknown
    crowd(n = 100, o = {}) {
      const api = S.peopleApi;
      let made = 0;
      while (made < n) {
        const f = api.newFamily();
        const c = S.stone.centre;
        const { best } = S.land.bestHut(c.x + (Math.random() - 0.5) * 120, c.z + (Math.random() - 0.5) * 120, 30,
          { huts: S.buildings.filter((b) => b.kind === 'hut').map((b) => ({ x: b.cx, z: b.cz })), stone: c, protectedAt: S.isProtected });
        const at = best ?? { x: c.x + (Math.random() - 0.5) * 60, z: c.z + (Math.random() - 0.5) * 60 };
        const k = Math.min(n - made, 4);
        for (let i = 0; i < k; i++) api.newPerson(f, { x: at.x + Math.random() * 4, z: at.z + 4 + Math.random() * 2, age: i < 2 ? 25 : 8, sex: i === 0 ? 'f' : i === 1 ? 'm' : undefined });
        if (f.members[1]) { f.members[0].partner = f.members[1]; f.members[1].partner = f.members[0]; }
        f.food = 20;
        if (best) api.settle(f, best);
        else { f.state = 'settled'; f.settledLife = S.life; for (const m of f.members) api.register(m); }
        made += k;
      }
      if (o.huts !== false && S.seam.ask('noHuts')) {
        const who = S.people.find((p) => !p.dead && p.stage === 'adult' && p.family?.state === 'settled');
        if (who) S.seam.ask('thinkPush', who, 1.01); // the whole cost of the next discovery, which is Huts
      }
      return S.people.length;
    },
    cave: (o) => devCave(ctx, S, o), // a valid cave by the water nearest the stone (devcave.js), for tests
    time(t) { S.dayClock = ((t - T.DAY_START + 1) % 1) * T.DAY_SECONDS; },
    alerts: () => S.log.map((a) => `[${a.severity}] ${a.text}`),
    seam: S.seam,
  };
  // skip(years): the same simulation run ahead without drawing every step (skip.js)
  const skip = makeSkip(ctx, S, update, stats);
  dev.soak = (years, chunk, opts) => soak(S, skip, stats, years, chunk, opts); // unattended run for tuning (skip.js)

  // the subsystems (plugins.js), each registering on the seam; one that fails to load is logged and left out
  // dev only: ?off=clans,fights leaves out the subsystems whose file names contain those words (to compare runs)
  const off = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('off') : null)?.split(',').filter(Boolean) ?? [];
  await S.seam.load(off.length ? PLUGINS.filter((l) => !off.some((n) => String(l).includes(n))) : PLUGINS);

  return {
    get people() { return S.people; },
    get animals() { return S.animals; },
    get buildings() { return S.buildings; },
    get families() { return S.families; },
    stone: S.stone,
    stats,
    isProtected: S.isProtected,
    sightCircles: P.sightCircles,
    // how many would notice an act of this kind here at once (faith.js NOTICE: its reach), as the witness then counts
    seenAt: (x, z, r = 0, kind) => S.seam.noticeCount({ kind, x, z, r }),
    witness: P.witness,
    // powers by id (seam.js): forecast(power, target) and act(power, target); strike(target) = act('strike', target)
    forecast: (power, target) => S.seam.forecast(power, target),
    act: (power, target) => S.seam.act(power, target),
    strike: (target) => S.seam.act('strike', target),
    powers: () => S.seam.powers(),
    // clans (the clans subsystem answers these; until then a clan is a family): { id, name, dye, members }
    clanOf: (p) => S.seam.ask('clanOf', p),
    clanMembers: (c) => S.seam.ask('clanMembers', c) ?? [],
    clans: () => S.seam.ask('clans') ?? [],
    // any other named query a subsystem answers (docs/STAGE2-CONTRACTS.md), for god and ui
    ask: (name, ...args) => S.seam.ask(name, ...args),
    // tunables of every subsystem: tune() lists, tune(id) one block, tune(id, key, value) sets
    tune: (id, key, value) => S.seam.tuneConsole(id, key, value),
    seam: S.seam,
    // the god places and takes back animals (god/animals.js): { entity, reason, text }; fish go to fish.js
    spawnAnimal: (kind, x, z) => S.seam.ask('fishPlace', kind, x, z) ?? S.animalsApi.spawnAnimal(kind, x, z),
    removeAnimal: (a) => (a?.kind === 'fish' ? !!S.seam.ask('fishRemove', a) : S.animalsApi.despawn(a)),
    // what a body of water means to people: the families whose homes have it within reach
    waterUse(cells) {
      const set = new Set(cells.map(([x, z]) => `${x},${z}`));
      const homes = S.buildings.filter((b) => (b.kind === 'hut' || b.kind === 'cave') && b.family);
      const fams = [];
      for (const h of homes) {
        let near = false;
        for (let dz = -T.WATER_REACH; dz <= T.WATER_REACH && !near; dz++) for (let dx = -T.WATER_REACH; dx <= T.WATER_REACH && !near; dx++) {
          if (dx * dx + dz * dz <= T.WATER_REACH * T.WATER_REACH && set.has(`${h.cx + dx},${h.cz + dz}`)) near = true;
        }
        if (near) fams.push(h.family.name);
      }
      return { reach: T.WATER_REACH, families: [...new Set(fams)] };
    },
    inspect,
    update,
    get dayTime() { return S.dayT; },
    skip,
    dev,
  };
}
