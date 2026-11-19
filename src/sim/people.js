// People and families: walking in from the mist, judging the land, settling,
// building, farming, fetching water, praying, sleeping, being born, ageing,
// starving, grieving, leaving and dying. One person is an entity registered
// with the core once their family settles (passers-by are not registered, to
// spare the 65,535 entity cap). Each person runs a tiny activity engine: a
// walk (`go`, A* via land.js), then a piece of work in a pose (`work`), then
// `think` picks the next thing by the hour of the day and the family's needs.
import { makePerson, lookFor, setLoad, DYES } from './bodies.js';
import { snapToGround, followPath } from './move.js';
import { T } from './tune.js';
import { familyName, givenName, yearLabel, range, pick, sideName, number, cap } from './words.js';
import { X0, Z0, X1, Z1 } from '../edit/vox.js';
import { makeBerries } from './berries.js';
import { seasonOf } from './food-season.js';

export function makePeople(ctx, S) {
  const W = ctx.world, core = ctx.core, land = S.land, BLD = S.build;
  // the berry bushes people pick (berries.js); S.berriesApi for the forecasts and the checks
  const BER = S.berriesApi = makeBerries(ctx, S);
  let pseq = 0, fseq = 0;
  const rand = Math.random;
  const clampIn = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mid = (b) => ({ x: b.mx ?? b.x, z: b.mz ?? b.z });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const isNight = () => S.dayT >= T.GO_HOME || S.dayT < T.WAKE;
  const stageOf = (age) => (age < T.CHILD_UNTIL ? 'child' : age < T.ELDER_FROM ? 'adult' : 'elder');

  // ---------- making people ----------
  function figureFor(p) {
    const look = lookFor(rand, p.family.dye, { child: p.stage === 'child', elder: p.stage === 'elder', sex: p.sex, skin: p.skin });
    if (p.F) p.F.group.removeFromParent();
    p.F = makePerson(look);
    p.skin = look.skin;
    p.objs = [{ obj: p.F.group, off: { x: 0, y: 0, z: 0 }, ry0: 0 }];
    p.foot.h = p.stage === 'child' ? 1.3 : 2.1;
    ctx.layers.entities.add(p.F.group);
    p.F.group.visible = !p.hidden;
    if (p.carry) { const c = p.carry; p.carry = null; carry(p, c); }
  }
  // stage 2: rebuild a standing figure (a household took its clan's colour), where it stands
  function refigure(p) {
    if (!p?.F || p.dead) return false;
    figureFor(p);
    p.F.group.position.set(p.x, p.y, p.z);
    p.F.group.rotation.y = p.ry ?? 0;
    return true;
  }
  function newPerson(family, o) {
    const age = o.age ?? 0;
    // put down on a checked spot (land.spotOk: passable, dry, no tree, the real ground under them), the nearest
    // one within 8 steps when the asked-for one is not (the mist's edge, a family's offsets, a doorway)
    if (!land.spotOk(Math.floor(o.x), Math.floor(o.z), 'person')) {
      const s = land.nearestSpot(o.x, o.z, 'person', 8);
      if (s) o = { ...o, x: s.x, z: s.z };
    }
    const p = {
      id: `p${++pseq}`, kind: 'person', cat: 'person', name: o.name ?? givenName(),
      x: o.x, y: 16, z: o.z, ry: rand() * 6.28, ry0: 0, added: true,
      foot: { w: 0.7, d: 0.7, h: 2.1, cx: 0, cz: 0 }, objs: [],
      sex: o.sex ?? (rand() < 0.5 ? 'f' : 'm'), age, stage: stageOf(age),
      lifespan: range(T.LIFESPAN), family, parents: o.parents ?? null, partner: null,
      mother: o.mother ?? null, father: o.father ?? null, motherlessCut: range(T.MOTHERLESS_CUT), dread: 0,
      happy: o.happy ?? range(T.START_HAPPY), faith: o.faith ?? range(T.START_FAITH), skep: o.skep ?? range(T.START_SKEP),
      expectsHelp: false, since: S.lifeNow(), born: S.year - age / T.LIFE_RATE, lastSaw: -1e9,
      hunger: 0, grief: 0, story: [], go: null, work: null, path: null, pi: 0,
      r: 0.26, seed: pseq, hidden: false, asleep: false, inside: null, dead: false, registered: false,
      noJump: false, carry: null, doing: 'walking', role: '',
      thought: '', thoughts: [], planted: null, // stage 2 may write p.planted = { text, source }
      ext: {}, // stage 2: each subsystem's own data under its id (seam.js R.data)
    };
    S.mind.rollLife(p);
    figureFor(p);
    snapToGround(W, p);
    S.people.push(p);
    family.members.push(p);
    S.seam.run('person:new', p);
    return p;
  }
  function register(p) { if (!p.registered) { core.add(p); p.registered = true; } }
  // a line of a person's life; the same line in the same year is told once (two births lost to the
  // same cause in one year used to read twice)
  function story(p, text) {
    const line = `${yearLabel(S.year)}: ${text}`;
    if (p.story.slice(-4).includes(line)) return;
    p.story.push(line);
    if (p.story.length > 14) p.story.splice(2, 1);
  }
  // loads ride on the head or the shoulders so they read from above (bodies.js setLoad; other kinds go in hand)
  function carry(p, kind) { p.carry = kind || null; setLoad(p.F, p.carry); }
  const famLabel = (f) => `the ${f.name} family`;

  // ---------- families ----------
  function newFamily(name) {
    const taken = new Set(S.families.map((f) => f.name));
    const f = {
      id: `f${++fseq}`, name: name ?? familyName(taken), dye: DYES[fseq % DYES.length],
      members: [], home: null, fields: [], plans: [], food: 0, state: 'wander',
      arrivedYear: S.year, route: [], ri: 0, sawWater: false, tally: {}, scoutT: 0,
      unhappy: 0, waterDay: -1, waterBy: null, noFieldSaid: false, settledLife: 0,
      ext: {}, // stage 2: each subsystem's own data under its id (seam.js R.data)
    };
    f.leader = () => f.members.find((m) => !m.dead && m.stage === 'adult') ?? f.members.find((m) => !m.dead);
    S.families.push(f);
    return f;
  }
  // a day (dawn to dawn) in life years: the span over which the hunger's pace is measured
  const dayLife = () => T.DAY_SECONDS / (ctx.clock.secondsPerYear || 2.4) * T.LIFE_RATE;
  // a hungry family's true pace of hunger, a life year (positive: growing): over the last day, or the hunger so far
  function hungerRate(f) {
    if (f.hungerFrom == null || !f.rateHist?.length) return f.shortRate > 0 ? f.shortRate : 0;
    const [l0, i0] = f.rateHist[0], span = S.life - l0;
    if (span < 1) return f.shortRate > 0 ? f.shortRate : 0; // too soon to know the pace
    return (f.rateInt - i0) / span;
  }
  // the hunger played forward, as the simulation will play it if nothing changes: the pace measured over the last day
  // for the mouths there are now, and after each death the same food shared by fewer (the rest may then pull through).
  // Returns a Map person -> life years until they starve (Infinity: they do not). Cached for the frame.
  function hungerFuture(f) {
    if (f._hf && f._hf.t === S.clockT) return f._hf.m;
    const out = new Map();
    const alive = f.members.filter((m) => !m.dead);
    const r0 = hungerRate(f), need0 = needOf(f);
    // the food coming in a life year, over the same window: what the store gained plus what was eaten
    // (the store and the standing crop together: a harvest only moves food from the field to the store)
    let income = null;
    const h = f.rateHist;
    if (f.hungerFrom != null && h?.length && S.life - h[0][0] >= 1) income = Math.max(0, ((stock(f) - h[0][3]) + (f.eatInt - h[0][2])) / (S.life - h[0][0]));
    const pace = (need) => (income == null || need === need0 ? r0 : r0 + 2 * (income / Math.max(0.01, need0) - income / Math.max(0.01, need)));
    let t = 0, need = need0;
    const hunger = new Map(alive.map((m) => [m, m.hunger]));
    for (let guard = 0; guard < alive.length + 1; guard++) {
      const r = pace(need);
      if (!(r > 0)) break;
      let next = null, dt = Infinity;
      for (const [m, hu] of hunger) { if (out.has(m)) continue; const left = Math.max(0, m.starveAt - hu) / r; if (left < dt) { dt = left; next = m; } }
      if (!next) break;
      t += dt;
      for (const [m, hu] of hunger) if (!out.has(m)) hunger.set(m, hu + r * dt);
      out.set(next, t);
      need -= next.stage === 'child' ? T.EAT_CHILD : T.EAT;
      if (need <= 0) break;
    }
    for (const m of alive) if (!out.has(m)) out.set(m, Infinity);
    f._hf = { t: S.clockT, m: out };
    return out;
  }
  // life years until this person starves if nothing changes (Infinity: never)
  // life years until an unhappy settled family gives up and leaves, if nothing changes (the rule in familyTick; the same
  // reckoning foresight's leave warning makes): Infinity if they are not on the way to it
  function leaveLeft(f) {
    if (f.state !== 'settled') return Infinity;
    if (f.hungerPlan && f.members.some((q) => !q.dead && q.hungerFate)) return f.hungerPlan.leaveAt != null ? Math.max(0, f.hungerPlan.leaveAt - S.life) : Infinity;
    const m = f.members.filter((q) => !q.dead);
    if (!m.length) return Infinity;
    const avg = m.reduce((s, q) => s + q.happy, 0) / m.length;
    if (f.unhappy > 0 && avg < T.LEAVE_HAPPY) return Math.max(0, T.LEAVE_YEARS - f.unhappy);
    const tgt = m.reduce((s, q) => s + (q.happyTarget ?? q.happy), 0) / m.length;
    if (tgt >= T.LEAVE_HAPPY - 0.5) return Infinity;
    const at = (t) => m.reduce((s, q) => { const g = q.happyTarget ?? q.happy; return s + (q.happy > g ? Math.max(g, q.happy - T.HAPPY_RATE * t) : Math.min(g, q.happy + T.HAPPY_RATE * t)); }, 0) / m.length;
    let t = 0;
    while (t < 12 && at(t) >= T.LEAVE_HAPPY) t += 0.1;
    return at(t) >= T.LEAVE_HAPPY ? Infinity : t + T.LEAVE_YEARS;
  }
  // a foretold hunger death only if it comes before the family would leave (starving families often give up and go)
  const hungerLeftOf = (p) => {
    if (p.dead || !(p.hunger > 0) || !p.hungerFate) return Infinity; // not foretold until fixed (HUNGER_WATCH)
    const left = Math.max(0, p.hungerFate.t1 - S.life);
    return left <= leaveLeft(p.family) ? left : Infinity;
  };
  const HUNGER_WATCH = 2;  // life years of hunger watched before its deaths are fixed
  const HUNGER_EASE = 0.2; // ... and undone when, over the last HUNGER_RECENT life years, the house was fed more than short
  const HUNGER_RECENT = 1.5; // (a field come in, a better store: the food the warning said would have to be found)
  function recentPace(f) {
    const h = f.rateHist;
    if (!h?.length) return 0;
    let a = null;
    for (let i = h.length - 1; i >= 0; i--) if (S.life - h[i][0] >= HUNGER_RECENT) { a = h[i]; break; }
    return a ? (f.rateInt - a[1]) / (S.life - a[0]) : 0;
  }
  const HUNGER_FED = 2;    // a store of this many life years of the household's eating cancels a foretold hunger death (a deer, rain:
                           // not the small lumps of a berry trip); a ripe crop standing in their fields counts, as it is theirs to cut
  // the family found food (a god's rain ripened their crop, a deer came home): the foretold hunger deaths are undone now, by the
  // very rule the family's own tick uses (HUNGER_FED), rather than on the next tick. Foresight's answer to an act calls this, so
  // the warning it re-reads at once already knows (the director: feedback within 100 ms, even with time held). The count undone.
  function foodFound(f) {
    if (!f || f.state !== 'settled') return 0;
    const need = needOf(f);
    if (!(f.food + ripeOf(f) >= need * HUNGER_FED)) return 0;
    let n = 0;
    for (const m of f.members) if (!m.dead && m.hungerFate) { m.hungerFate = null; story(m, 'Was to die of hunger. The family found food.'); n++; }
    return n;
  }
  const needOf = (f) => f.members.reduce((s, m) => s + (m.dead ? 0 : m.stage === 'child' ? T.EAT_CHILD : T.EAT), 0);
  // ---------- food coming in (docs/SIM.md "Crops", "Berries") ----------
  // the food standing in a family's fields (growing or ripe), the ripe part alone, and that plus the store
  const cropOf = (f) => { let s = 0; for (const fl of f.fields) if (fl.done && !fl.bare) s += fl.crop ?? 0; return s; };
  const ripeOf = (f) => { let s = 0; for (const fl of f.fields) if (fl.done && !fl.bare && fl.grow >= 1) s += fl.crop ?? 0; return s; };
  const stock = (f) => f.food + cropOf(f);
  // the one way food the family made comes into its store: a harvest or berries carried home (S.foodSrcNow names it
  // for the measures in tools/food-measure.mjs and the check tools/checks/food.mjs; S.foodIn adds it up)
  const foodIn = S.foodIn = { field: 0, berries: 0 };
  function bringHome(f, amount, src) {
    if (!(amount > 0) || !f) return;
    S.foodSrcNow = src;
    f.food += amount;
    S.foodSrcNow = null;
    foodIn[src] = (foodIn[src] ?? 0) + amount;
  }
  // a basket carried: into the store when its carrier reaches home (or lies down for the night, or has no hut to go to)
  function deliver(p) {
    if (!p.basket) return;
    const b = p.basket;
    p.basket = null;
    bringHome(p.family, b.food, b.src);
  }
  function carryHome(p, doing) {
    const d = p.family.home?.done ? p.family.home.door : null;
    if (!d) { carry(p, null); deliver(p); return; }
    carry(p, 'basket');
    goTo(p, d.x, d.z, { doing, r: 0.8, then: () => { carry(p, null); deliver(p); }, fail: () => { carry(p, null); deliver(p); } });
  }
  // somebody already on their way to this field (to cut it or to sow it), within the last 40 game seconds
  // (only while they are still about it: one called away to a hunt or a fight leaves it to the others)
  const claimed = (fl, p) => fl.claim && fl.claim.p !== p && !fl.claim.p.dead && fl.claim.until > S.clockT && /harvest|sow/.test(fl.claim.p.doing ?? '');
  const claim = (fl, p) => { fl.claim = { p, until: S.clockT + 40 }; };

  // a point on the world's edge, in the mist, where a person can stand
  function edgePoint(side) {
    for (let k = 0; k < 30; k++) {
      const u = 0.2 + rand() * 0.6, inset = 6 + rand() * 4;
      const x = side === 'west' ? X0 + inset : side === 'east' ? X1 - inset : X0 + (X1 - X0) * u;
      const z = side === 'north' ? Z0 + inset : side === 'south' ? Z1 - inset : Z0 + (Z1 - Z0) * u;
      if (land.spotOk(Math.floor(x), Math.floor(z), 'person')) return { x, z };
    }
    return land.nearestSpot((X0 + X1) / 2, Z0 + 8, 'person', 12) ?? { x: (X0 + X1) / 2, z: Z0 + 8 };
  }
  const OPP = { west: 'east', east: 'west', north: 'south', south: 'north' };

  // a family walks in from the mist
  function spawnFamily(sideOpt) {
    // a cave with room (caves.js): families come from the side of the world it is on and make for it first (a dark
    // mouth in a rock face is seen from the edge of the mist; the first family took 40 to 60 years to find one)
    const toward = T.ARRIVE_TOWARD_CAVE ? (S.seam.ask('caveRoom') ?? [])[0] ?? null : null;
    const sideOf = (c) => { const d = { west: c.cx - X0, east: X1 - c.cx, north: c.cz - Z0, south: Z1 - c.cz }; return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a)); };
    const side = sideOpt ?? (toward ? sideOf(toward) : pick(['west', 'east', 'north', 'south']));
    const f = newFamily();
    let at = edgePoint(side);
    if (toward && !sideOpt) {
      for (let k = 0; k < 12; k++) {
        const inset = 6 + rand() * 4, jit = (rand() - 0.5) * 24;
        const x = side === 'west' ? X0 + inset : side === 'east' ? X1 - inset : clampIn(toward.cx + jit, X0 + 20, X1 - 20);
        const z = side === 'north' ? Z0 + inset : side === 'south' ? Z1 - inset : clampIn(toward.cz + jit, Z0 + 20, Z1 - 20);
        if (land.spotOk(Math.floor(x), Math.floor(z), 'person') && ctx.edgeClear(x, z) < 0.6) { at = { x, z }; break; }
      }
    }
    const n = Math.round(range([T.FAMILY_SIZE[0], T.FAMILY_SIZE[1] + 0.99]));
    const mother = newPerson(f, { x: at.x, z: at.z, age: range([18, 28]), sex: 'f' });
    const father = n >= 2 ? newPerson(f, { x: at.x + 0.8, z: at.z + 0.5, age: range([19, 32]), sex: 'm' }) : null;
    for (let k = 2; k < n; k++) newPerson(f, { x: at.x + rand() * 2 - 1, z: at.z + rand() * 2 - 1, age: range([1, Math.min(12, mother.age - 16)]), parents: [mother.name, father?.name].filter(Boolean), mother, father });
    if (father) { mother.partner = father; father.partner = mother; }
    if (n >= 5 && rand() < 0.5) { const g = f.members[f.members.length - 1]; g.age = range([56, 64]); g.stage = 'elder'; g.parents = null; g.mother = null; g.father = null; g.lifespan = Math.max(g.lifespan, g.age + range([4, 12])); S.mind.rollLife(g); figureFor(g); }
    f.food = needOf(f) * T.START_FOOD_YEARS;
    // the route: in toward the middle, across, and out the far side
    const c = { x: S.stone.centre.x, z: S.stone.centre.z };
    const ex = edgePoint(OPP[side]);
    const lerp = (a, b, t, j) => ({ x: clampIn(a.x + (b.x - a.x) * t + (rand() - 0.5) * j, X0 + 25, X1 - 25), z: clampIn(a.z + (b.z - a.z) * t + (rand() - 0.5) * j, Z0 + 25, Z1 - 25) });
    const stops = Math.round(range(T.SCOUT_STOPS));
    f.route = [lerp(at, c, 0.4, 40), lerp(at, c, 0.85, 60)];
    if (stops >= 3) f.route.push(lerp(c, ex, 0.3, 60));
    if (stops >= 4) f.route.push(lerp(c, ex, 0.6, 40));
    if (toward && !sideOpt) { f.route.unshift({ x: toward.cx + 0.5, z: toward.cz + 0.5 }); f.toward = toward; } // the cave first
    f.exit = ex; f.side = side;
    for (const m of f.members) story(m, `Walked in from the mist with ${famLabel(f)}.`);
    S.seam.run('family:arrive', f);
    S.emit('sim:arrive', { family: f, x: at.x, z: at.z });
    S.alert('info', `A family of ${number(f.members.length)}, ${famLabel(f)}, walked in from the mist in the ${side}. They are looking for water and good land.`, at.x, at.z, undefined, f.leader());
    return f;
  }

  // the family looks around: a good home site, an empty hut, and what is wrong with the rest
  const siteInfo = () => ({
    huts: S.buildings.filter((b) => b.kind === 'hut').map((b) => ({ x: b.cx, z: b.cz })),
    stone: S.stone.centre, protectedAt: (x, z) => S.isProtected(x, z),
  });
  function scout(f) {
    const L = f.leader();
    if (!L) return;
    if (land.wdistAt(Math.floor(L.x), Math.floor(L.z)) <= T.SCOUT_RADIUS) f.sawWater = true;
    // an empty hut nearby with water still in reach
    for (const b of S.buildings) {
      if (b.kind !== 'hut' || !b.done || b.family || dist(b, L) > T.SCOUT_RADIUS) continue;
      if (land.wdistAt(b.cx, b.cz) > T.WATER_REACH) continue;
      f.state = 'settling'; f.site = { x: b.cx, z: b.cz, hut: b, wd: land.wdistAt(b.cx, b.cz) };
      L.go = null; L.work = null;
      return;
    }
    if (S.seam.ask('noHuts', f)) return; // caves.js: nobody knows how to build a hut yet (the Huts discovery)
    const { best, tally } = land.bestHut(L.x, L.z, T.SCOUT_RADIUS, siteInfo());
    for (const k in tally) f.tally[k] = (f.tally[k] ?? 0) + tally[k];
    if (!best) return;
    // a site at the far edge of reach: first walk over toward the water and look again from there
    if (best.wd > 12 && f.approachI != null && f.ri <= f.approachI) return; // still on the way to the water
    if (best.wd > 12 && f.approachI == null) {
      const w = land.nearestWater(best.x, best.z, T.WATER_REACH + 2); // the water that site is near
      if (w) {
        f.approachI = f.ri;
        f.route.splice(f.ri, 0, { x: w.sx + 0.5, z: w.sz + 0.5 });
        L.go = null; L.work = null;
        return;
      }
    }
    f.state = 'settling'; f.site = best; L.go = null; L.work = null;
  }
  const REASON = {
    grass: 'there was no flat grassy ground near the water to farm',
    steep: 'the ground by the water was too steep or rough to build on',
    taken: 'the good land by the water was already taken',
    sand: 'the land by the water was all sand',
    trees: 'trees crowded every spot by the water',
    rock: 'the ground by the water was bare rock',
    bank: 'the only dry ground was right on the bank',
    wet: 'the land by the water was flooded',
    poor: 'the land by the water was poor',
    edge: 'the water lay too far out in the mist',
  };
  function leaveReason(f) {
    if (!f.sawWater) return 'they found no fresh water anywhere they walked';
    let best = null, bn = 0;
    for (const k in f.tally) if (k !== 'dry' && f.tally[k] > bn) { bn = f.tally[k]; best = k; }
    return REASON[best] ?? 'they found nowhere by the water to build';
  }
  function leave(f, reason, sev = 'warn') {
    if (f.state === 'leaving') return;
    const settled = f.state === 'settled';
    f.state = 'leaving';
    const L = f.leader() ?? f.members[0];
    if (L) {
      // out by the nearest edge
      const sides = [['west', L.x - X0], ['east', X1 - L.x], ['north', L.z - Z0], ['south', Z1 - L.z]].sort((a, b) => a[1] - b[1]);
      f.exit = edgePoint(settled ? sides[0][0] : (OPP[f.side] ?? sides[0][0]));
    }
    for (const m of f.members) { m.go = null; m.work = null; if (m.inside) exitHome(m); story(m, settled ? `Left the land: ${reason}.` : `Walked on: ${reason}.`); }
    if (f.home) { f.home.family = null; f.home.name = 'An empty hut'; }
    for (const fl of f.fields) { fl.family = null; fl.name = 'An abandoned field'; }
    for (const b of f.plans) if (!b.done) b.family = null;
    S.seam.run('family:leave', f, reason);
    S.emit('sim:leave', { family: f, reason });
    S.alert(sev, `${cap(famLabel(f))} ${settled ? 'packed up and left' : 'walked on and left'}: ${reason}.`, L?.x, L?.z, undefined, L);
  }
  function despawnFamily(f) {
    for (const m of [...f.members]) removePerson(m);
    S.families.splice(S.families.indexOf(f), 1);
  }

  function settle(f, site) {
    f.state = 'settled'; f.settledYear = S.year; f.settledLife = S.lifeNow();
    for (const m of f.members) { register(m); m.since = S.lifeNow(); }
    let where;
    if (site.hut) {
      f.home = site.hut; site.hut.family = f; site.hut.name = `Hut of the ${f.name} family`;
      where = 'in an empty hut';
    } else {
      f.home = BLD.planHut(f, site.x, site.z);
      f.plans.push(f.home);
      where = `${sideName(site.x, site.z, S.stone.centre.x, S.stone.centre.z)} of the stone`;
    }
    const wd = Math.round(site.wd ?? land.wdistAt(site.x, site.z));
    for (const m of f.members) story(m, `Settled ${where}, by fresh water.`);
    S.seam.run('family:settle', f, site);
    S.emit('sim:settle', { family: f, x: site.x + 0.5, z: site.z + 0.5 });
    S.alert('good', `${cap(famLabel(f))} settled ${where}: fresh water ${wd} steps away and flat grass to farm.`, site.x + 0.5, site.z + 0.5, undefined, f.leader());
  }

  // ---------- activities ----------
  const speedOf = (p) => (p.stage === 'child' ? T.CHILD_WALK : p.stage === 'elder' ? T.ELDER_WALK : T.WALK);
  function goTo(p, x, z, o = {}) {
    // o.fail: called when the walk is given up (no way there, or stuck four times)
    p.go = { x, z, speed: o.speed ?? speedOf(p), r: o.r ?? 0.45, then: o.then, fail: o.fail, direct: !!o.direct, until: o.until ?? Infinity, tries: 0, t: 0 };
    p.path = null; p.pi = 0; p.work = null;
    if (o.doing) p.doing = o.doing;
  }
  function work(p, pose, dur, o = {}) {
    p.work = { pose, t: 0, dur, tick: o.tick, face: o.face, then: o.then };
    if (o.doing) p.doing = o.doing;
  }
  function effort(p) {
    let e = p.stage === 'elder' ? 0.5 : p.stage === 'child' ? 0.3 : 1;
    if (p.expectsHelp) e *= T.DEPENDENT_WORK;
    if (p.hunger > 1) e *= 0.85;
    return S.seam.value('work', p, e * (T.WORK_HAPPY_MIN + (1 - T.WORK_HAPPY_MIN) * p.happy / 100));
  }
  function moveGo(p, dt) {
    const g = p.go;
    g.t += dt;
    if (g.t > g.until) { p.go = null; p.path = null; return; }
    if (!p.path) {
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      if (d < g.r) { p.go = null; g.then?.(); return; }
      // a short direct walk goes straight only when the land allows it (land.lineWalk), else by a path
      if (g.direct && d < 14 && land.lineWalk(p.x, p.z, g.x, g.z, 'person')) { p.path = [[g.x, g.z]]; p.partial = false; }
      else {
        // after a stuck walk the retry takes the unsmoothed path, which keeps off the corners
        const r = land.findPath(p.x, p.z, g.x, g.z, 'person', T.PATH_MAX_NODES, { raw: g.tries > 0, partial: true });
        if (r === 'wait') return;
        // no way nearer to it from here. A walk from or to a spot the map shows no way through (inside a cave's
        // chamber, on a spot reserved for building) goes a short stretch straight, the body's own collision deciding.
        // Someone farther off on such a spot first steps to the nearest open cell, and looks for a way from there.
        const hereOk = land.passable(Math.floor(p.x), Math.floor(p.z), 'person');
        const out = r === null && !hereOk && g.tries < 2 ? land.nearestOpen(p.x, p.z, 'person', 5) : null;
        if (r === null && d < 14 && (!hereOk || !land.passable(Math.floor(g.x), Math.floor(g.z), 'person'))) { p.path = [[g.x, g.z]]; p.partial = false; }
        else if (out) { p.path = [[out.x, out.z]]; p.partial = true; g.tries++; }
        else if (r === null) { giveUp(p, g); return; }
        else if (r.partial) { p.path = r; p.partial = true; } // too far for one search: the way to the nearest point found, then look again
        else {
          p.path = r.length ? r : [[g.x, g.z]];
          p.path[p.path.length - 1] = [g.x, g.z];
          p.partial = false;
        }
      }
      p.pi = 0; p.stuckT = 0; p.stuckX = p.x; p.stuckZ = p.z;
    }
    p.arriveR = g.r;
    const st = followPath(W, p, g.speed, dt);
    p.moving = true;
    if (st === 'arrived') {
      if (p.partial) { p.path = null; p.partial = false; return; }
      p.go = null; p.path = null; g.then?.();
    } else if (st === 'stuck') {
      p.path = null;
      giveUp(p, g);
      // the second try starts with a sidestep to a free spot nearby, so the next way begins somewhere else
      if (p.go === g && g.tries === 2) { const s = sidestep(p); if (s) { p.path = [[s.x, s.z]]; p.partial = true; p.pi = 0; } }
    }
  }
  // one more failed try at a walk; after the fourth the walk is given up (its `fail`, if any, says what then)
  function giveUp(p, g) {
    g.tries++;
    if (g.tries > 3) { p.go = null; p.work = null; p.path = null; g.fail?.(); }
  }
  // a free cell two to four steps away that can be walked to in a straight line, or null
  function sidestep(p) {
    for (let k = 0; k < 10; k++) {
      const a = rand() * 6.283, r = 2 + rand() * 2;
      const x = Math.floor(p.x + Math.cos(a) * r) + 0.5, z = Math.floor(p.z + Math.sin(a) * r) + 0.5;
      if (land.lineWalk(p.x, p.z, x, z, 'person') && !land.waterAt(Math.floor(x), Math.floor(z))) return { x, z };
    }
    return null;
  }
  function tickWork(p, dt) {
    const w = p.work;
    w.t += dt;
    if (w.face) p.yawT = Math.atan2(w.face.x - p.x, w.face.z - p.z);
    const stop = w.tick?.(dt, w);
    if (stop || w.t >= w.dur) { p.work = null; w.then?.(); }
  }

  // somewhere free to stand near (x, z)
  function spotNear(x, z, r0, r1, tries = 8) {
    for (let k = 0; k < tries; k++) {
      const a = rand() * 6.283, r = r0 + rand() * (r1 - r0);
      const sx = Math.floor(x + Math.cos(a) * r), sz = Math.floor(z + Math.sin(a) * r);
      if (land.spotOk(sx, sz, 'person')) return { x: sx + 0.5, z: sz + 0.5 };
    }
    // none found at random: the nearest checked spot, and only then the place itself
    return land.nearestSpot(x, z, 'person', Math.ceil(r1) + 4) ?? { x, z };
  }

  function goHomeAndSleep(p) {
    const f = p.family, h = f.home;
    p.nightBound = true;
    if (p.basket && !h?.done) deliver(p); // no hut: the basket is the family's where they sleep
    if (h && h.done) {
      goTo(p, h.door.x, h.door.z, { doing: 'going home for the night', then: () => enterHome(p, h) });
    } else {
      const c = S.seam.ask('shelterFor', p) ?? (h ? h.door : { x: p.x, z: p.z }); // shelter.js: under the trees, never the open
      const s = spotNear(c.x, c.z, 1, 3);
      goTo(p, s.x, s.z, { doing: 'finding a place to sleep', then: () => { p.asleep = true; work(p, 'sit', 999, { doing: 'asleep under the sky' }); } });
    }
  }
  function enterHome(p, h) {
    p.hidden = true; p.inside = h; p.asleep = true; p.work = null; p.go = null;
    p.x = h.x; p.z = h.z; p.F.group.visible = false; carry(p, null);
    deliver(p);
    p.doing = 'asleep at home';
  }
  function exitHome(p) {
    const h = p.inside;
    p.hidden = false; p.inside = null; p.asleep = false;
    if (h) { p.x = h.door.x + (rand() - 0.5) * 0.6; p.z = h.door.z + (rand() - 0.5) * 0.6; }
    snapToGround(W, p);
    p.F.group.visible = true;
  }

  function fetchWater(p) {
    const f = p.family, h = f.home;
    f.waterBy = p;
    const from = h ? mid(h) : p;
    const w = land.nearestWater(from.x, from.z, 40);
    if (!w) { f.waterDay = S.dayN; f.waterBy = null; return false; }
    goTo(p, w.sx + 0.5, w.sz + 0.5, {
      doing: 'fetching water', r: 0.6,
      then: () => work(p, 'pick', 2.5, {
        face: { x: w.x + 0.5, z: w.z + 0.5 }, doing: 'drawing water',
        then: () => {
          carry(p, 'pot');
          const back = h ? h.door : from;
          goTo(p, back.x, back.z, { doing: 'carrying water home', r: 0.8, then: () => { carry(p, null); f.waterDay = S.dayN; f.waterBy = null; work(p, null, 0.6); } });
        },
      }),
    });
    return true;
  }
  function build(p, b) {
    const k = p.seed % 5;
    const st = BLD.standFor(b, k);
    carry(p, 'wood');
    const what = b.kind === 'hut' ? 'the family hut' : b.kind === 'field' ? 'a new field' : 'the fire circle';
    goTo(p, st.x, st.z, {
      doing: `going to build ${what}`, r: 0.7,
      then: () => {
        carry(p, null);
        work(p, b.kind === 'field' ? 'tend' : 'chop', 6 + rand() * 4, {
          doing: `building ${what}`,
          face: b.kind === 'field' ? null : mid(b),
          tick: (dt) => {
            if (b.done) return true;
            b.work += effort(p) * dt;
            let n = 0;
            while (b.work >= T.BUILD_WORK * (b.kind === 'field' ? 0.6 : 1) && n++ < 4) {
              b.work -= T.BUILD_WORK * (b.kind === 'field' ? 0.6 : 1);
              if (BLD.placeNext(b)) { built(b, p); return true; }
            }
            return false;
          },
        });
      },
    });
  }
  function built(b, p) {
    const f = b.family;
    if (f) f.plans = f.plans.filter((x) => x !== b);
    if (b.kind === 'field' && f) f.fields.push(b);
    S.seam.run('building:built', b, p);
    S.emit('sim:built', { building: b });
    const c = mid(b);
    if (b.kind === 'hut') {
      for (const m of f?.members ?? []) story(m, 'Helped raise the family hut.');
      S.alert('info', `${cap(famLabel(f))} finished their hut.`, c.x, c.z, undefined, p ?? f?.leader?.());
    } else if (b.kind === 'field') {
      if (f && f.fields.length === 1) S.alert('info', `${cap(famLabel(f))} sowed their first field.`, c.x, c.z, undefined, b);
      if (p) story(p, 'Broke ground for a new field.');
    } else if (b.kind === 'fire') {
      S.alert('good', 'The settlement built a fire circle. People will gather there in the evenings.', c.x, c.z, undefined, b);
      if (p) story(p, 'Laid the stones of the fire circle.');
    }
  }
  // to a field: cut it if it is ripe (the basket goes home: the food arrives with it), else tend it
  function farm(p, fl) {
    const s = fl.steps[Math.floor(rand() * fl.steps.length)];
    const ripe = !fl.bare && fl.grow >= 1;
    if (ripe) claim(fl, p);
    goTo(p, s.x + 0.5, s.z + 0.5, {
      doing: ripe ? 'going to bring in the harvest' : 'going to tend the field', r: 0.6,
      then: () => {
        if (!fl.bare && fl.grow >= 1) {
          claim(fl, p);
          work(p, 'pick', T.HARVEST_S, {
            doing: 'harvesting', tick: (dt, w) => { w.h = (w.h ?? 0) + dt; if (w.h > T.HARVEST_S / 16) { w.h = 0; if (BLD.harvestStep(fl)) return true; } return false; },
            then: () => {
              fl.claim = null;
              const food = fl.basket ?? 0;
              fl.basket = 0;
              if (!fl.bare) return; // left unfinished (night fell, a wolf): the next one carries on cutting
              p.basket = { food: (p.basket?.food ?? 0) + food, src: 'field' };
              story(p, 'Brought in the harvest.');
              carryHome(p, 'carrying the harvest home');
            },
          });
        } else if (!fl.bare) {
          work(p, 'tend', 5 + rand() * 5, {
            doing: 'tending the field',
            tick: (dt) => { fl.care = Math.min(1, fl.care + T.CARE_PER_S * effort(p) * dt * S.timeK); return false; },
          });
        }
      },
    });
  }
  // to a bare field to sow it (not in winter): sprouts go in row by row; when the last is in, it grows from now
  function sow(p, fl) {
    claim(fl, p);
    const s = fl.steps[Math.floor(rand() * fl.steps.length)];
    goTo(p, s.x + 0.5, s.z + 0.5, {
      doing: 'going to sow the field', r: 0.6,
      then: () => {
        if (!fl.bare || !BLD.canSow(fl)) { fl.claim = null; return; }
        work(p, 'tend', T.SOW_S * 1.5, {
          doing: 'sowing the field',
          tick: (dt, w) => { w.h = (w.h ?? 0) + dt * effort(p); if (w.h > T.SOW_S / 16) { w.h = 0; if (BLD.sowStep(fl)) return true; } return false; },
          then: () => { fl.claim = null; if (!fl.bare) story(p, 'Sowed the field.'); },
        });
      },
    });
  }
  // a berry trip: to the nearest ripe bush within BERRY_REACH of home, then any others close by it, picking each
  // (the bush goes bare), then the basket home. False if there is no ripe bush in reach.
  function pickBerries(p) {
    const f = p.family, from = f.home ? mid(f.home) : p;
    const trip = BER.trip(from, p);
    if (!trip) return false;
    let k = 0;
    const next = () => {
      const b = trip[k++];
      if (!b) { if (p.basket) carryHome(p, 'carrying berries home'); return; }
      const s = land.spotOk(b.x, b.z, 'person') ? { x: b.x + 0.5, z: b.z + 0.5 } : spotNear(b.x + 0.5, b.z + 0.5, 0.8, 1.6);
      goTo(p, s.x, s.z, {
        doing: 'going to pick berries', r: 0.9,
        fail: () => { if (b.by === p) b.by = null; next(); },
        then: () => work(p, 'pick', T.BERRY_PICK_S, {
          doing: 'picking berries', face: { x: b.x + 0.5, z: b.z + 0.5 },
          then: () => {
            const got = BER.pick(b, p);
            if (got > 0) { p.basket = { food: (p.basket?.food ?? 0) + got, src: 'berries' }; carry(p, 'basket'); }
            next();
          },
        }),
      });
    };
    next();
    return true;
  }
  // somewhere useful for spare hands: berries if any are ripe in reach, else rest
  const pickOrRest = (p) => pickBerries(p) || rest(p);
  function pray(p) {
    const c = S.stone.centre;
    const h = p.family.home;
    if (h && dist(mid(h), c) > T.PRAY_REACH) {
      // too far to walk to the stone: pray outside the hut, facing it
      const s = spotNear(h.door.x, h.door.z, 0.5, 2);
      goTo(p, s.x, s.z, { doing: 'going to pray', then: () => work(p, 'pray', 3 + rand() * 3, { face: c, doing: 'praying toward the stone' }) });
      return;
    }
    const a = rand() * 6.283, r = range(T.PRAY_RING);
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    goTo(p, x, z, {
      doing: 'walking to the stone to pray', r: 0.8,
      then: () => work(p, 'pray', Math.max(2, (T.PRAY_END - S.dayT) * T.DAY_SECONDS) + rand() * 2, { face: c, doing: 'praying at the stone' }),
    });
  }
  function rest(p) {
    const f = p.family;
    const fire = S.fire?.done && f.home && dist(mid(S.fire), mid(f.home)) < 40 && rand() < 0.5 ? S.fire : null;
    const c = fire ? mid(fire) : f.home ? (f.home.door ?? mid(f.home)) : p;
    const s = spotNear(c.x, c.z, fire ? 2.6 : 0.8, fire ? 3.6 : 3);
    goTo(p, s.x, s.z, { doing: fire ? 'sitting by the fire' : 'resting near home', then: () => work(p, 'sit', 4 + rand() * 5, { face: fire ? mid(fire) : null }) });
  }
  function play(p) {
    const f = p.family;
    const mother = f.members.find((m) => !m.dead && m !== p && m.stage !== 'child' && (p.parents ?? []).includes(m.name));
    if (p.age < 4 && mother && !mother.hidden) {
      const s = spotNear(mother.x, mother.z, 0.8, 2);
      goTo(p, s.x, s.z, { direct: true, until: 3, doing: 'staying close to mother', then: () => work(p, null, 0.8) });
      return;
    }
    const c = S.fire?.done && f.home && dist(mid(S.fire), mid(f.home)) < 30 && rand() < 0.4 ? mid(S.fire) : f.home ? f.home.door : p;
    const s = spotNear(c.x, c.z, 1.5, 6);
    goTo(p, s.x, s.z, { doing: 'playing', then: () => work(p, 'play', 2 + rand() * 3, { doing: 'playing' }) });
  }
  const prayChance = (p) => Math.min(1, p.faith / 100 * T.PRAY_SCALE + (p.expectsHelp ? T.PRAY_DEPENDENT : 0));
  const inPrayer = () => S.dayT >= T.PRAY_START && S.dayT < T.PRAY_END;

  // what a settled person does next
  function think(p) {
    const f = p.family;
    if (f.state !== 'settled') return S.seam.first('wander', p) || thinkWander(p); // shelter.js: camping under trees
    p.moving = false;
    // a subsystem may claim the next activity (a fight, a fire to flee, a commandment): seam 'activity' hooks
    if (S.seam.claim(p)) return;
    if (isNight()) return goHomeAndSleep(p);
    if (inPrayer() && p.prayDay !== S.dayN && p.age >= 4) {
      p.prayDay = S.dayN;
      if (rand() < prayChance(p)) return pray(p);
    }
    // a basket in hand goes home first (a harvest or berries cut short by the night or a wolf)
    if (p.basket) return carryHome(p, p.basket.src === 'field' ? 'carrying the harvest home' : 'carrying berries home');
    const short = f.food < needOf(f) * T.FOOD_PANIC;
    // the fields' work: a ripe one to cut, a bare one to sow (not in winter), nobody else already on the way
    const ripe = f.fields.find((fl) => fl.done && !fl.bare && fl.grow >= 1 && !claimed(fl, p));
    const bare = f.fields.find((fl) => fl.done && fl.bare && !claimed(fl, p) && BLD.canSow(fl));
    const growing = f.fields.filter((fl) => fl.done && !fl.bare && fl.grow < 1);
    const lowest = growing.length ? growing.reduce((a, b) => (a.care < b.care ? a : b)) : null;
    if (p.stage === 'child') {
      if (p.age >= 9 && f.waterDay !== S.dayN && !f.waterBy && rand() < 0.3 && fetchWater(p)) return;
      // older children help when food is short: the harvest, the sowing, the tending, then berries
      if (p.age >= 10 && short && rand() < 0.6) { if (ripe) return farm(p, ripe); if (bare) return sow(p, bare); if (lowest) return farm(p, lowest); if (pickBerries(p)) return; }
      return play(p);
    }
    if (p.stage === 'elder' && !short && rand() < 0.55) return rest(p);
    if (p.expectsHelp && rand() < 0.35) { p.doing = 'waiting for help from the stone'; return rand() < 0.5 ? rest(p) : work(p, 'sit', 4, { doing: 'waiting for help from the stone' }); }
    const need = needOf(f);
    const plan = f.plans.find((b) => !b.done);
    // a field is the way out of hunger: breaking one comes first
    if (plan?.kind === 'field') return build(p, plan);
    if (f.food < need * T.FOOD_PANIC) {
      // a hungry house cuts what is ripe, sows what is bare, tends what is poorly tended, and its spare hands pick
      // berries (2026-11-13: hungry families sat by fully tended fields while the wild was full of food)
      if (ripe) return farm(p, ripe);
      if (bare) return sow(p, bare);
      if (lowest && lowest.care < T.TEND_FIRST) return farm(p, lowest);
      // hungry with the hut unfinished: the eldest adult keeps building, the rest find food
      const builder = f.members.find((m) => m.stage === 'adult' && !m.dead);
      if (plan && builder === p && !f.fields.length) return build(p, plan);
      if (pickBerries(p)) return;
      return lowest ? farm(p, lowest) : plan ? build(p, plan) : rest(p);
    }
    if (f.waterDay !== S.dayN && !f.waterBy && fetchWater(p)) return;
    if (plan) return build(p, plan);
    if (S.fire && !S.fire.done && f.home && dist(mid(S.fire), mid(f.home)) < 40 && rand() < 0.6) return build(p, S.fire);
    if (ripe) return farm(p, ripe);
    if (bare) return sow(p, bare);
    if (lowest && (lowest.care < 0.95 || rand() < 0.5)) return farm(p, lowest);
    // berries while the store has room (a full store would only throw them away)
    const room = f.food < need * S.seam.value('store', f, T.STORE_MAX_YEARS) * 0.8;
    if (room && !f.fields.length && pickBerries(p)) return;
    if (S.dayT > 0.45 && S.fire?.done) return rest(p);
    return rand() < 0.5 || !room ? rest(p) : pickOrRest(p);
  }

  // wandering: the leader walks the route; the others keep close
  function thinkWander(p) {
    const f = p.family, L = f.leader();
    p.moving = false;
    if (p !== L) {
      if (!L) return;
      const slot = (f.members.indexOf(p) + 1) * 1.1;
      const bx = L.x - Math.sin(L.ry) * slot + Math.cos(L.ry) * ((p.seed % 3) - 1) * 0.9;
      const bz = L.z - Math.cos(L.ry) * slot - Math.sin(L.ry) * ((p.seed % 3) - 1) * 0.9;
      const d = Math.hypot(bx - p.x, bz - p.z);
      if (d < 0.8) { work(p, null, 0.3, { doing: L.doing }); return; }
      goTo(p, bx, bz, { direct: d < 12, until: 0.8, speed: d > 4 ? T.RUN * 0.8 : T.WANDER_WALK * 1.15, doing: L.doing });
      return;
    }
    if (f.state === 'wander') {
      const wp = f.route[f.ri];
      if (!wp) return leave(f, leaveReason(f));
      // a stop on the route they cannot get to is passed by, not walked at forever
      goTo(p, wp.x, wp.z, { speed: f.toward && f.ri === 0 ? T.CAVE_WALK : T.WANDER_WALK, r: 2, doing: f.toward && f.ri === 0 ? 'making for the cave they saw from afar' : 'looking for water and good land', then: () => { f.ri++; work(p, null, 1.2, { doing: 'looking around' }); }, fail: () => { f.ri++; } });
    } else if (f.state === 'settling') {
      const s = f.site;
      const at = s.hut ? s.hut.door : { x: s.x + 0.5, z: s.z + 3.5 };
      // a chosen place they cannot reach: settle if they are close, else walk on and look again
      const fail = () => { if (Math.hypot(at.x - p.x, at.z - p.z) < 10) settle(f, s); else { f.state = 'wander'; f.site = null; } };
      goTo(p, at.x, at.z, { speed: T.WANDER_WALK, r: 1.5, doing: 'walking to the place they chose', then: () => settle(f, s), fail });
    } else if (f.state === 'leaving') {
      // no way out on this side: another edge
      goTo(p, f.exit.x, f.exit.z, { speed: T.WANDER_WALK, r: 2, doing: 'leaving for good', then: () => { f.gone = true; }, fail: () => { f.exit = edgePoint(pick(['west', 'east', 'north', 'south'])); } });
    }
  }

  // ---------- fleeing ----------
  function startFlee(p, wolf) {
    if (p.fleeing) return;
    p.fleeing = wolf;
    const h = p.family.home;
    p.work = null; carry(p, null);
    if (h?.done && dist(h.door, p) < 30 && dist(h.door, wolf) > dist(h.door, p) * 0.6) {
      goTo(p, h.door.x, h.door.z, { speed: p.stage === 'adult' ? T.RUN : T.RUN * 0.75, doing: 'running home from a wolf', then: () => { p.fleeing = null; enterHome(p, h); } });
    } else {
      const dx = p.x - wolf.x, dz = p.z - wolf.z, d = Math.hypot(dx, dz) || 1;
      goTo(p, clampIn(p.x + dx / d * 14, X0 + 3, X1 - 3), clampIn(p.z + dz / d * 14, Z0 + 3, Z1 - 3), { direct: true, speed: p.stage === 'adult' ? T.RUN : T.RUN * 0.75, doing: 'running from a wolf', then: () => { p.fleeing = null; } });
    }
    p.go.until = 8;
  }

  // ---------- life and death ----------
  // who grieves a death: the household, plus living parents and children who live in another hut
  function kinOf(p) {
    const out = new Set(p.family.members.filter((m) => m !== p && !m.dead));
    for (const q of [p.mother, p.father, p.partner]) if (q && !q.dead) out.add(q);
    for (const q of S.people) if (!q.dead && q !== p && (q.mother === p || q.father === p)) out.add(q);
    return [...out];
  }
  // young children this death leaves without a mother, and the age old age now comes for them
  // (T.MOTHERLESS_*); the strike's forecast reads the same numbers
  function motherless(p) {
    if (p.sex !== 'f') return [];
    return S.people.filter((c) => !c.dead && c.mother === p && c.age < T.MOTHERLESS_AGE).map((c) => ({
      child: c, before: c.lifespan, after: Math.max(Math.floor(c.age) + 1.5, c.lifespan - c.motherlessCut),
    }));
  }
  const WORDS = { hunger: 'died of hunger', wolf: 'was killed by a wolf', strike: 'was struck down', 'struck down': 'was struck down from the sky' };
  function die(p, cause, extra = {}) {
    if (p.dead) return;
    const orphans = motherless(p), kin = kinOf(p);
    p.dead = true; p.deadT = 0; p.cause = cause;
    p.go = null; p.work = null;
    const f = p.family;
    const words = cause === 'old age' ? `died of old age at ${Math.floor(p.age)}` : WORDS[cause] ?? S.seam.deathWords(cause) ?? `died (${cause})`;
    story(p, extra.story ?? cap(words) + '.');
    for (const m of kin) {
      m.grief = 1; m.lost = p.name; m.thinkT = 0;
      story(m, extra.kinStory?.(m) ?? `Lost ${p.name} (${words}).`);
    }
    for (const o of orphans) {
      const c = o.child;
      c.lifespan = o.after;
      story(c, `Lost ${his(c)} mother at ${Math.floor(c.age)}. Was to live to ${Math.floor(o.before)}; growing up without her, will die at ${Math.floor(o.after)}.`);
    }
    f.members = f.members.filter((m) => m !== p);
    if (p.partner) p.partner.partner = null;
    S.deaths++;
    S.seam.run('person:death', p, cause, extra);
    S.emit('sim:death', { person: p, cause, x: p.x, z: p.z });
    const text = `${p.name} of ${famLabel(f)} ${words}${extra.where ?? ''}.`;
    if (cause === 'old age') { if (f.state === 'settled') S.tally('old', 'info', text, p.x, p.z, p); }
    else if (f.state === 'settled' || cause === 'struck down') S.alert('bad', text, p.x, p.z, extra.aside, p);
    if (p.hidden) p.deadT = 99;
    if (!f.members.length) endFamily(f);
  }
  const his = (p) => (p.sex === 'f' ? 'her' : 'his');
  function endFamily(f) {
    if (f.home && f.home.family === f) { f.home.family = null; f.home.name = 'An empty hut'; }
    for (const fl of f.fields) { fl.family = null; fl.name = 'An abandoned field'; }
    for (const b of f.plans) if (!b.done) b.family = null;
    const i = S.families.indexOf(f);
    if (i >= 0) S.families.splice(i, 1);
  }
  function removePerson(p) {
    if (p.registered && !p.removedFromCore) { core.removeMany([p]); p.removedFromCore = true; }
    p.F.group.removeFromParent();
    const i = S.people.indexOf(p);
    if (i >= 0) S.people.splice(i, 1);
    const f = p.family, j = f.members.indexOf(p);
    if (j >= 0) f.members.splice(j, 1);
  }
  function birth(f, mother) {
    const h = f.home;
    const father = mother.partner;
    // raised in it: the faith subsystem answers from the parents and their village (faith.js); else the parents' average
    const up = S.seam.ask('upbringing', mother, father, f);
    const child = newPerson(f, {
      x: h.door.x, z: h.door.z, age: 0, parents: [mother.name, father.name], mother, father,
      faith: up?.faith ?? clampIn((mother.faith + father.faith) / 2 + (rand() - 0.5) * 10, 0, 100),
      skep: up?.skep ?? clampIn((mother.skep + father.skep) / 2 + (rand() - 0.5) * 10, 0, 100), happy: 70,
    });
    register(child);
    story(child, `Born to ${mother.name} and ${father.name} of ${famLabel(f)}.`);
    story(mother, `Gave birth to ${child.name}.`);
    if (mother.inside || isNight()) { child.hidden = !!mother.inside; child.inside = mother.inside; child.asleep = true; child.F.group.visible = !child.hidden; }
    S.births++;
    S.emit('sim:born', { person: child });
    S.tally('born', 'good', `A child, ${child.name}, was born to ${famLabel(f)}.`, h.door.x, h.door.z, child);
  }
  // a grown child and a partner from another family start a household of their own
  function pairUp(p) {
    const f = p.family;
    if (!f.home?.done) return;
    const hasYoung = (m) => m.family.members.some((c) => c.stage === 'child' && (c.parents ?? []).includes(m.name));
    if (hasYoung(p)) return;
    const cands = S.people.filter((o) => !o.dead && o.family !== f && o.family.state === 'settled' && o.family.home?.done && o.sex !== p.sex && !o.partner &&
      o.stage === 'adult' && o.age >= T.PAIR_AGE && o.age <= 45 && dist(o, p) < 90 && !hasYoung(o));
    if (!cands.length) return;
    const q = cands[Math.floor(rand() * cands.length)];
    // somewhere to live: between the two homes
    const a = f.home ? mid(f.home) : p, b = q.family.home ? mid(q.family.home) : q;
    // caves.js: before huts are known, a cave (theirs if it has room, or a free one), or false: nowhere yet
    const alt = S.seam.ask('pairHome', p, q);
    if (alt === false) return;
    const { best } = alt ? { best: null } : land.bestHut((a.x + b.x) / 2, (a.z + b.z) / 2, T.PAIR_SITE_R, siteInfo());
    // no hut site near them: a cave of theirs, or a free one, with room (caves.js) before giving up (2026-11-13: grown
    // children of cave families never paired once huts were known and no hut site lay between the caves)
    const cave = !best && !alt ? S.seam.ask('pairCave', p, q) || null : null;
    if (!best && !alt && !cave) return;
    const qf = q.family;
    const nf = newFamily(rand() < 0.5 ? f.name : q.family.name);
    for (const m of [p, q]) {
      const of = m.family;
      of.members = of.members.filter((x) => x !== m);
      if (of.waterBy === m) of.waterBy = null;
      m.family = nf; nf.members.push(m);
      m.go = null; m.work = null;
      if (m.inside) exitHome(m);
      if (!of.members.length) endFamily(of);
    }
    p.partner = q; q.partner = p;
    nf.state = 'settled'; nf.settledYear = S.year; nf.settledLife = S.lifeNow();
    // each family sends them off with a share of its store
    nf.food = needOf(nf) * T.NEW_HOME_FOOD; // a young couple takes provisions from both homes
    for (const of of [f, qf]) { const k = of.food * 0.3; of.food -= k; nf.food += k; }
    nf.home = alt || cave || BLD.planHut(nf, best.x, best.z);
    if (!alt && !cave) nf.plans.push(nf.home);
    // stage 2: a household formed by two people already here (clans take it in before the figures are built)
    S.seam.run('family:new', nf, [p, q]);
    for (const m of [p, q]) { story(m, `Started a household with ${m === p ? q.name : p.name}.`); figureFor(m); }
    S.tally('pair', 'info', `${p.name} and ${q.name} started a household of their own and ${alt || cave ? 'moved into a cave' : 'are building a hut'}.`, best?.x ?? (alt ?? cave).cx, best?.z ?? (alt ?? cave).cz, p);
  }

  // ---------- the meters ----------
  function meters(p, dLife) {
    const f = p.family;
    let tgt = T.HAPPY_BASE;
    const settled = f.state === 'settled';
    if (settled) {
      if (f.home?.done) tgt += T.HAPPY_HOME;
      else if (S.lifeNow() - f.settledLife > 5) tgt += T.HAPPY_NO_HOME;
      const h = f.home ? mid(f.home) : p;
      const wd = land.wdistAt(Math.floor(h.x), Math.floor(h.z));
      tgt += wd <= 10 ? T.HAPPY_WATER_NEAR : wd > 16 ? T.HAPPY_WATER_FAR : 0;
      if (S.fire?.done && dist(mid(S.fire), h) < 45) tgt += T.HAPPY_FIRE;
      const n = f.members.length;
      if (n > 6) tgt += T.HAPPY_CROWDED;
    }
    tgt += p.hunger > 0 ? T.HAPPY_HUNGRY * Math.min(1, p.hunger / 1.5) : settled && f.food > 0 ? T.HAPPY_FED : 0;
    let fear = 0;
    for (const a of S.attacks) {
      const age = (S.year - a.year) / T.FEAR_YEARS / (1 / T.LIFE_RATE) ;
      if (age > 1) continue;
      if (Math.hypot(a.x - p.x, a.z - p.z) < T.FEAR_RADIUS) fear = Math.max(fear, 1 - age);
    }
    // fear: of the wolves (an attack nearby), or the dread of having seen a person struck from the sky
    p.wolfFear = fear;
    p.dread = Math.max(0, (p.dread ?? 0) - dLife / T.DREAD_YEARS);
    fear = Math.max(fear, p.dread);
    p.fear = fear;
    tgt += T.HAPPY_FEAR * fear + T.HAPPY_GRIEF * p.grief;
    p.happyTarget = clampIn(S.seam.value('happy', p, tgt), 0, 100);
    const step = T.HAPPY_RATE * dLife;
    p.happy = clampIn(p.happy + clampIn(p.happyTarget - p.happy, -step, step), 0, 100);
    p.grief = Math.max(0, p.grief - dLife / T.GRIEF_YEARS);
    // the slow fade: the faith subsystem answers by what this person practises (faith.js, docs/FAITH.md); else the
    // stage 1 drift while nothing is witnessed. Stage 2 pushes on it through the faithDrift and doubtDrift stats.
    const fade = S.seam.ask('fade', p);
    const quiet = S.lifeNow() - p.lastSaw > 2;
    const fd = S.seam.value('faithDrift', p, fade ? fade.faith : quiet ? T.FAITH_DRIFT : 0), sd = S.seam.value('doubtDrift', p, fade ? fade.doubt : quiet ? T.SKEP_DRIFT : 0);
    if (fd < 0) { if (p.faith > T.FAITH_FLOOR) p.faith = Math.max(T.FAITH_FLOOR, p.faith + fd * dLife); } else if (fd > 0) p.faith = Math.min(100, p.faith + fd * dLife);
    if (sd > 0) { if (p.skep < T.SKEP_CEIL) p.skep = Math.min(T.SKEP_CEIL, p.skep + sd * dLife); } else if (sd < 0) p.skep = Math.max(0, p.skep + sd * dLife);
  }

  // ---------- the families' year ----------
  function familyTick(f, dLife, gdt) {
    const need = needOf(f);
    if (f.state === 'settled') {
      // the fields grow their standing crop as they grow (build.js growField); the food comes home with the harvest
      for (const fl of f.fields) {
        if (!fl.done) continue;
        // care is lost only in daylight, when tending could happen (a night is several life years long)
        fl.care = Math.max(0, fl.care - T.CARE_DECAY * dLife * S.daylight);
      }
    }
    // families on the move live off the land as they walk; only settled ones eat from a store.
    // Hunger grows by the share of the eating that could not be met.
    if (f.state === 'settled' && dLife > 0) {
      const eat = need * dLife;
      // an empty store and a ripe crop standing: they eat from the field while the harvest comes in (T.EAT_FROM_FIELD)
      if (T.EAT_FROM_FIELD && f.food < eat) {
        for (const fl of f.fields) {
          if (f.food >= eat) break;
          if (!fl.done || fl.bare || fl.grow < 1 || !(fl.crop > 0)) continue;
          const take = Math.min(fl.crop, eat - f.food);
          fl.crop -= take;
          bringHome(f, take, 'field');
          if (fl.crop <= 1e-6) BLD.clearCrop(fl);
        }
      }
      const wasHungry = f.shortRate > 0;
      f.eatInt = (f.eatInt ?? 0) + Math.min(eat, Math.max(0, f.food)); // what was eaten (hungerFuture reads the food coming in)
      if (f.food >= eat) { f.food -= eat; f.shortRate = -2; }
      else {
        const short = 1 - Math.max(0, f.food) / eat;
        f.food = 0;
        f.shortRate = (short - 0.25) * 2; // a small shortfall is borne
      }
      for (const m of f.members) {
        // a hunger death once foretold comes when foretold, unless the family finds food (its store refills): the
        // god is told the truth (2026-11-13: foretold at 9 and 58, died at 17 and 66)
        const hf = m.hungerFate;
        if (hf && !m.dead) {
          if (f.food + ripeOf(f) >= need * HUNGER_FED || recentPace(f) < -HUNGER_EASE) { m.hungerFate = null; story(m, 'Was to die of hunger. The family found food.'); }
          else { m.hunger = Math.max(m.hunger, hf.h0 + (m.starveAt - hf.h0) * Math.min(1, (S.life - hf.t0) / Math.max(1e-6, hf.t1 - hf.t0))); continue; }
        }
        m.hunger = Math.max(0, m.hunger + dLife * f.shortRate);
      }
      if (!wasHungry && f.shortRate > 0) for (const m of f.members) story(m, 'Food ran short in the house.');
      // the hunger's true pace (hungerRate): the frame's rate flickers between short and fed as food trickles in, and
      // by day they gather while by night nothing comes; the fate line needs the pace over a whole day (2026-11-13: an
      // ignored prayer said "dies at 9", and she died at 17)
      if (f.members.some((m) => m.hunger > 0)) {
        if (f.hungerFrom == null) { f.hungerFrom = S.life; f.rateInt = 0; f.rateHist = [[S.life, 0, f.eatInt, stock(f)]]; }
        f.rateInt += dLife * f.shortRate;
        const h = f.rateHist;
        if (S.life - h[h.length - 1][0] >= 0.2) h.push([S.life, f.rateInt, f.eatInt, stock(f)]);
        while (h.length > 2 && S.life - h[1][0] > dayLife()) h.shift();
        // once the pace has been watched long enough, the deaths it leads to are fixed (hungerFuture), each to come then
        if (S.life - h[0][0] >= HUNGER_WATCH) {
          const fut = hungerFuture(f);
          let fixed = false;
          for (const m of f.members) {
            if (m.dead || m.hungerFate || !(m.hunger > 0)) continue;
            const left = fut.get(m);
            if (Number.isFinite(left)) { m.hungerFate = { t0: S.life, t1: S.life + left, h0: m.hunger }; fixed = true; }
          }
          // which comes first, the first death or giving up and leaving, is decided now and kept to
          if (fixed && !f.hungerPlan) {
            const first = Math.min(...f.members.filter((m) => !m.dead && m.hungerFate).map((m) => m.hungerFate.t1 - S.life));
            // too weak and too hungry to take to the road: a family under a foretold hunger stays to the end (2026-11-13;
            // deciding "leave first" from the happiness reckoning missed by a year or three, so the god was told wrong)
            f.hungerPlan = { leaveAt: null, first };
          }
        }
      } else f.hungerFrom = null;
    }
    f.lastNeed = need;
    f.food = Math.min(f.food, Math.max(need, 1) * S.seam.value('store', f, T.STORE_MAX_YEARS));
    // hunger kills at a threshold rolled for each person (so the fate panel can say when)
    for (const m of [...f.members]) if (m.hunger >= m.starveAt) die(m, 'hunger');
    if (f.state === 'wander' || f.state === 'settling') {
      f.scoutT -= gdt;
      if (f.state === 'wander' && f.scoutT <= 0) { f.scoutT = 1.5; scout(f); }
    }
    if (f.state === 'leaving' && (f.gone || (f.leader() && ctx.edgeClear(f.leader().x, f.leader().z) < 0.1))) { despawnFamily(f); return; }
    if (f.state !== 'settled') return;
    // more fields as the family grows
    const want = Math.max(1, Math.ceil(f.members.length / T.PEOPLE_PER_FIELD));
    if (f.home?.done && !f.plans.length && f.fields.length < want) {
      // an abandoned field close by is taken over before new ground is broken
      const old = S.buildings.find((b) => b.kind === 'field' && b.done && !b.family && Math.hypot(b.mx - f.home.cx, b.mz - f.home.cz) < T.FIELD_RADIUS && BLD.fieldIntact(b));
      if (old) { old.family = f; old.name = `Field of the ${f.name} family`; f.fields.push(old); return; }
      const site = land.bestField({ x: f.home.cx, z: f.home.cz }, T.FIELD_SIZE[0], T.FIELD_SIZE[1], f.fields.map(mid));
      if (site) f.plans.push(BLD.planField(f, site));
      else if (!f.noFieldSaid && !f.fields.length) { f.noFieldSaid = true; S.alert('warn', `${cap(famLabel(f))} can find no flat grass near their hut for a field. They will live on berries and what they can hunt.`, f.home.cx, f.home.cz, undefined, f.leader()); }
    }
    // fields the land took back (flooded, raised, planted over)
    for (const fl of [...f.fields]) if (!BLD.fieldIntact(fl)) { f.fields = f.fields.filter((x) => x !== fl); BLD.removeBuilding(fl); S.alert('warn', `${cap(famLabel(f))} lost a field: the land under it changed.`, fl.mx, fl.mz, undefined, f.leader()); }
    // births, at the ages rolled for each mother (mind.js), when the house can take a child
    for (const m of [...f.members]) {
      if (m.sex !== 'f' || !m.birthAges?.length || m.age < m.birthAges[0]) continue;
      if (!m.partner || m.partner.dead) { m.birthAges.shift(); continue; } // no partner: none was promised
      const why = !f.home?.done ? 'There was no finished home.' : f.food <= need * T.BIRTH_FOOD ? 'There was not enough food in store.'
        : f.members.length >= T.HOUSE_MAX ? 'The hut was already full.' : S.people.length >= T.MAX_PEOPLE ? 'The land was full.' : null;
      if (!why) { m.birthAges.shift(); birth(f, m); }
      else if (m.age >= m.birthAges[0] + T.BIRTH_WAIT) {
        const a = m.birthAges.shift();
        story(m, `Was to have a child at ${Math.floor(a)}. ${why}`);
        if (m.partner) story(m.partner, `Was to have a child with ${m.name}. ${why}`);
      }
    }
    // unhappy families leave
    const alive = f.members.filter((m) => !m.dead);
    const avg = alive.reduce((s, m) => s + m.happy, 0) / Math.max(1, alive.length);
    f.unhappy = avg < T.LEAVE_HAPPY ? f.unhappy + dLife : Math.max(0, f.unhappy - dLife);
    f.unhappyRate = avg < T.LEAVE_HAPPY ? 1 : -1;
    // a family under a foretold hunger keeps to what was foretold: it leaves at the fixed time if leaving was to come
    // first, and does not walk off before a foretold death (hungerPlan, set when the hunger deaths are fixed)
    const hp = f.hungerPlan && f.members.some((m) => !m.dead && m.hungerFate) ? f.hungerPlan : (f.hungerPlan = null);
    const goNow = hp ? hp.leaveAt != null && S.life >= hp.leaveAt : f.unhappy > T.LEAVE_YEARS;
    if (goNow && alive.length) {
      const hungry = alive.some((m) => m.hunger > 0), afraid = alive.some((m) => m.fear > 0.3), grieving = alive.some((m) => m.grief > 0.4);
      const sky = afraid && alive.some((m) => (m.dread ?? 0) > 0.3 && m.dread >= (m.wolfFear ?? 0));
      const why = hungry ? 'they had too little food' : sky ? 'they were afraid of what strikes from the sky' : afraid ? 'they were afraid of the wild animals' : grieving ? 'they could not bear their losses here' : !f.home?.done ? 'they never managed to build a home' : 'they were unhappy here';
      leave(f, why + (S.seam.ask('lostHeart', f) ?? ''), 'bad'); // forces.js: under too little faith, hard times break them
    }
  }

  // ---------- one frame ----------
  function tick(gdt, dLife) {
    BER.tick(gdt);
    for (const f of [...S.families]) familyTick(f, dLife, gdt);
    // ageing, old age, growing up, pairing
    for (const p of [...S.people]) {
      if (p.dead) continue;
      p.age += dLife;
      const st = stageOf(p.age);
      if (st !== p.stage) { p.stage = st; figureFor(p); if (st === 'adult') story(p, 'Came of age.'); }
      if (p.age >= p.lifespan) { die(p, 'old age'); continue; }
      meters(p, dLife);
      if (p.family.state === 'settled' && p.stage === 'adult' && !p.partner && p.age >= T.PAIR_AGE && p.age <= 45 && rand() < T.PAIR_RATE * dLife) pairUp(p);
    }
  }
  function step(p, dt) {
    p.moving = false;
    if (p.dead) {
      p.deadT += dt;
      const k = Math.min(1, p.deadT / 0.5);
      p.F.fig.rotation.z = k * Math.PI / 2; p.F.fig.position.y = k * 0.25;
      if (p.deadT > (p.keepBody ?? 4)) removePerson(p);
      return;
    }
    S.mind.think(p, dt);
    if (p.hidden) { if (!isNight() && !p.fleeing && p.family.state === 'settled' && !(p.restUntil > S.clockT)) { exitHome(p); p.work = null; } else return; } // restUntil: resting indoors by day (caves.js)
    if (p.asleep && !isNight()) { p.asleep = false; p.work = null; }
    // night falls: settled people drop what they are doing and head home
    if (isNight() && !p.asleep && !p.fleeing && !p.nightBound && p.family.state === 'settled' && (p.go || p.work)) { p.go = null; p.work = null; carry(p, null); }
    if (!isNight()) p.nightBound = false;
    // a hunting wolf close by: run
    if (!p.asleep && !p.fleeing) {
      for (const a of S.predators) {
        if (a.dead || (a.state !== 'stalk' && a.state !== 'sprint')) continue;
        const [r, chance] = a.state === 'sprint' ? T.NOTICE_SPRINT : T.NOTICE_STALK;
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (d >= r) continue;
        // the hunted person's outcome was rolled when the hunt began (fate): they notice only if they are to escape
        if (a.prey === p ? a.outcome === 'escape' : rand() < chance * dt * (p.work ? 0.6 : 1)) { startFlee(p, a); S.mind.push(p, 'A wolf! Run!'); break; }
      }
    }
    if (p.go) moveGo(p, dt);
    else if (p.work) tickWork(p, dt);
    else { p.fleeing = null; think(p); }
  }

  // goTo, work, carry, spotNear, goHomeAndSleep: for a subsystem's 'activity' hook to start its own walk or work
  return { hungerRate, hungerFuture, hungerLeftOf, foodFound, leaveLeft, spawnFamily, step, tick, die, register, story, settle, leave, exitHome, enterHome, effort, newFamily, newPerson, isNight, famLabel, kinOf, motherless, needOf,
    goTo, work, carry, spotNear, goHomeAndSleep, refigure, cropOf, ripeOf, bringHome, season: () => seasonOf(S) };
}
