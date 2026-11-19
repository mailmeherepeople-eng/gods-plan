// Hunting (2026-11-13; the director: "people should be hunters. they need to hunt and carry meat. it should be
// visible like age of empires"). Some grown-ups go out with a spear, most often before a family's fields feed it
// and in lean years: they track a deer or a rabbit, stalk it (creep, freeze, creep), throw, and either miss (the
// animal bolts, the spear is fetched, they try again or give up) or kill it, clean it and carry it home, slower
// under the load, where the family's food store really rises. Sometimes a second grown-up goes along; a deer
// they kill together goes home slung from a pole between their shoulders. Armed hunters fare a little better
// against a wolf. Deer and rabbits are really taken, so game near the settlement can be hunted out (the herds
// and warrens recover by their own rules, and the god's Animals tool can restock).
//
// A plugin on the seam (docs/STAGE2-CONTRACTS.md): the activity hook drives each hunter one step at a time (a
// short walk or a piece of work, then the hook is asked again), the step hook flies the spears and the pole
// carry, inspect / thoughts / stats / huntLog report it. Every number is in TUNE_HUNT (sim.tune('hunting')).
//
// How it looks (2026-11-16, hunt-look.js): a household hunts with spears or with bows (tune.js HUNT_BOW_SHARE); the
// spear or arrow is seen to fly (true size, a streak behind it, a glint) and to strike: it sticks in the animal,
// which flinches, runs a few steps and drops (animals.js wound), or it sticks in the ground or skitters on. Whether
// a throw kills is still rolled when it leaves the hand, and the animal still dies in every count the moment it is
// struck, so nothing that comes home changed; only where the body comes to rest moved a few steps.
import * as THREE from '../../vendor/three.module.js';
import { setTool, toolHome, makeSpear, makeArrow, makePoleCarry, SPEAR_DIMS, ARROW_DIMS } from './bodies.js';
import { yearLabel } from './words.js';
import { T as TT } from './tune.js';
import { HUNT_LOOK as LOOK, makeHuntFx } from './hunt-look.js';

export const TUNE_HUNT = {
  // ---- who goes, and when ----
  BASE: 0.3,     // chance a free grown-up starts a hunt each time they choose what to do next in the morning
                       // (a grown-up chooses only one to three times a morning: work lasts)
  LEAN_YEARS: 3,       // a store under this many years of the family's eating is a lean time ...
  LEAN_MULT: 2.5,      // ... and makes a hunt this much likelier
  NO_FIELD_MULT: 2,    // no field yet (or none that feeds them): this much likelier
  FED_YEARS: 4,        // a family with all the fields it wants and this much in store ...
  FED_MULT: 0.5,     // ... hunts this much less
  HABIT: 1,            // someone who has hunted before is up to (1 + this) times as likely (a hunter is made by hunting)
  SHARE: 0.15,         // at most this share of the settled grown-ups out hunting at once (at least one)
  CARE_FIRST: 0.8,   // a field cared for less than this is tended first
  START_BY: 0.3,// no hunt sets out after this part of the day (they must be back by dark)
  MAX_S: 60,           // game seconds a hunt may last before they give up and walk home
  DUSK_UNTIL: 0.74,   // a hunt with nothing killed yet goes on into the dusk until this part of the day
  RANGE: 45,           // game is looked for within this of home (further off, a hunt cannot be back by dark) ...
  RANGE_EARLY: 70,     // ... or this far, setting out early in the morning, for a family with no field yet
  EARLY_BY: 0.2,
  JOG_FROM: 25,        // game further than this: they jog out (JOG of a run)
  JOG: 0.8,
  PARTY: 0.35,         // chance a hunter brings a second grown-up along (from home or the next hut)
  // ---- the hunt ----
  STALK_AT: 15,        // closer than this they stop walking and start to stalk
  STALK_SPEED: 1.25,   // creeping speed (in short creeps, with a freeze of STALK_FREEZE seconds between)
  STALK_FREEZE: [0.3, 0.7],
  THROW_DEER: 9,       // a throw from this close (deer bolt from people within 6)
  THROW_RABBIT: 4.6,   // rabbits bolt within 4
  THROW_AT: 0.5,       // seconds into the throw that the spear leaves the hand (or the arrow the string)
  // (how fast a spear or an arrow flies is a look, in hunt-look.js HUNT_LOOK; it was SPEAR_SPEED 16 here)
  HIT_DEER: 0.5, HIT_RABBIT: 0.55, PARTY_HIT: 0.15, // chance a throw kills; a second hunter close by adds this
  TRIES: 3,            // throws before they give up
  BUTCHER_S: 2.5,      // seconds kneeling over a kill
  MORE_RABBITS: 0.5,   // after a rabbit, chance they look for another before going home (a brace)
  // ---- the meat (food units: an adult's eating for a life year) ----
  MEAT_DEER: 36, MEAT_RABBIT: 6, // a hunt takes the best part of a day (several life years at this clock), so a deer is a lot
  MATE_SHARE: 0.4,     // a hunter from another family takes this share home to their own
  LOAD_SLOW: 0.72,     // walking speed under a deer, of the normal walk (rabbits: 0.92)
  POLE_LEN: 1.9,       // two carrying a deer on a pole walk this far apart
  // ---- a hungry family and game near home (the god's way to feed them: drop a deer by the door) ----
  HUNGRY_YEARS: 1.5,   // a store under this many years of eating (or anyone hungry) and the family watches for game
  NOTICE_R: 45,        // game the god put this close to home is noticed: at once if someone awake can see it ...
  NOTICE_WILD: 40,    // wild game this close to a hungry home is gone after (a short walk there and back by day;
                       // was 16 until 2026-11-13, when unprompted hunting almost never happened: deer graze 20 to 150 off)
  WILD_FIND: 0.15,     // wild game out of everyone's sight is found with this chance a game second (they know where the herd grazes)
  STARVING_YEARS: 1,   // a store under this many years of eating (or anyone hungry) ...
  WILD_WITH_FIELDS: true, // ... and even a family with fields goes after wild game near home
  FIND_RATE: 0.4,      // ... else with this chance a game second (a deer placed out of sight is found in 2 or 3 s:
                       // a game second is a fifth of a life year, and a starving house has few of those)
  URGENT_LATE: 0.5,    // after this part of the day a hungry family goes only after game close to home
  HIT_PLACED: 0.85,   // a hunt for a freshly placed animal close by mostly succeeds (it has not learned to fear spears)
  PLACED_FRESH: 120,   // game seconds an animal counts as freshly placed
  FEAST_DEER: 5, FEAST_RABBIT: 1.2,
  URGENT_TRACK: 0.85,  // a hungry family's hunter jogs to the game at this share of a run,
  URGENT_CARRY: 0.9,   // carries it home at this share of a walk (hungry mouths are waiting),
  URGENT_BUTCHER: 0.5, // and cleans it in this share of the usual time // hunger eased at once for each hungry member when the meat comes in
  // ---- against a wolf ----
  WOLF_SAVE: 0.4,      // a wolf that was to kill an armed hunter only bites, with this chance (a bite becomes an escape the same way)
  // ---- the inspector ----
  ROLE_TRIPS: 3,       // this many hunts, the last within ROLE_YEARS life years, and the inspector calls them a hunter
  ROLE_YEARS: 25,
  HUNTED_OUT: 3,       // deer this few after there were HUNTED_FROM, with hunters about: a warning
  HUNTED_FROM: 7,
};
const K = TUNE_HUNT;

export default {
  id: 'hunting',
  tune: TUNE_HUNT,
  init(R) {
    const { S, ctx, T } = R;
    const rand = Math.random;
    const P = () => S.peopleApi, A = () => S.animalsApi, land = () => S.land;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const mid = (b) => ({ x: b.mx ?? b.x, z: b.mz ?? b.z });
    const he = (p) => (p.sex === 'f' ? 'she' : 'he'), his = (p) => (p.sex === 'f' ? 'her' : 'his');
    const hunts = new Map();   // person -> hunt (lead or mate)
    const flying = [];         // spears in the air or on the ground
    const log = { trips: 0, bowTrips: 0, deer: 0, rabbits: 0, failed: 0, food: 0, parties: 0, poles: 0, wolfSaves: 0, fed: 0, spotted: 0, fails: {}, throws: 0, hits: 0, firstDeer: false, peakDeer: 0, warnedAt: -1e9 };
    const fx = makeHuntFx(ctx, S);
    // a household hunts with the bow or the spear (tune.js HUNT_BOW_SHARE: the share of households with bows), the
    // same weapon every time, by a fixed hash of the household (it draws nothing from the game's dice)
    const weaponOf = (f) => {
      let hsh = 2166136261;
      for (const ch of `${f.id ?? ''}:${f.name ?? ''}`) hsh = Math.imul(hsh ^ ch.charCodeAt(0), 16777619);
      return ((hsh >>> 0) % 1000) / 1000 < (TT.HUNT_BOW_SHARE ?? 0) ? 'bow' : 'spear';
    };
    const weaponWord = (h) => (h.weapon === 'bow' ? 'arrow' : 'spear');
    const sfx = (name, x, z, o = {}) => { try { ctx.events?.emit('sfx:play', { name, x, z, at: true, ...o }); } catch { /* a sound never breaks the game */ } };
    const rec = (p) => R.data(p, 'hunt', () => ({ trips: 0, deer: 0, rabbits: 0, last: -1e9, lastWhat: null, lastAt: -1e9 }));
    const home = (p) => p.family.home;
    // where the meat goes: the home's door or drop point, whatever kind of home it is (a hut, a hut still being
    // built, later perhaps a cave), else its middle, else where the family's grown-up stands
    const doorOf = (f) => {
      const h = f.home;
      if (h) { const d = h.door ?? h.drop ?? h.entrance; if (d && d.x != null) return d; if (h.cx != null) return { x: h.cx + 0.5, z: h.cz + 0.5 }; const m = mid(h); if (m.x != null) return m; }
      const L = f.leader?.();
      return L ? { x: L.x, z: L.z } : null;
    };
    const placedAt = new WeakMap(); // animal -> S.clockT first seen as placed by the god
    const fresh = (a) => a.placed && S.clockT - (placedAt.get(a) ?? S.clockT) < K.PLACED_FRESH;
    const hungry = (f) => f.food < P().needOf(f) * K.HUNGRY_YEARS || f.members.some((m) => !m.dead && m.hunger > 0);
    const starving = (f) => f.food < P().needOf(f) * K.STARVING_YEARS || f.members.some((m) => !m.dead && m.hunger > 0);
    const animalName = (a) => (a.species === 'deer' ? 'a deer' : 'a rabbit');
    const carried = (h) => (h.kind === 'deer' ? (h.seed % 2 ? 'a buck' : 'a doe') : h.bag > 1 ? `${h.bag} rabbits` : 'a rabbit');

    // where something is, in a few plain words
    function where(x, z, p) {
      const L = land(), fx = Math.floor(x), fz = Math.floor(z);
      if (L.treesAround(fx, fz, 4) >= 3) return 'among the trees';
      if (L.wdistAt(fx, fz) <= 4) return 'by the water';
      const h = home(p);
      if (h && L.topAt(fx, fz) - L.topAt(h.cx ?? fx, h.cz ?? fz) >= 3) return 'up on the high ground';
      if (L.treesAround(fx, fz, 8) >= 2) return 'by the trees';
      return 'out on the open grass';
    }

    // ---------- choosing game ----------
    const taken = () => { const s = new Set(); for (const h of hunts.values()) if (h.prey) s.add(h.prey); return s; };
    function findPrey(from, centre, reach) {
      const busy = taken();
      let best = null, bs = Infinity;
      for (const a of S.animals) {
        if ((a.species !== 'deer' && a.species !== 'rabbit') || a.dead || busy.has(a)) continue;
        if (dist(a, centre) > reach || ctx.edgeClear(a.x, a.z) < 0.6) continue;
        const s = dist(a, from) - (a.species === 'deer' ? 12 : 0);
        if (s < bs) { bs = s; best = a; }
      }
      return best;
    }

    // ---------- who sets out ----------
    const isAdult = (q) => q && !q.dead && q.stage === 'adult' && q.family.state === 'settled';
    function leadsOut() { let n = 0; for (const h of hunts.values()) if (h.role === 'lead') n++; return n; }
    function settledAdults() { let n = 0; for (const q of S.people) if (isAdult(q)) n++; return n; }
    const why = {}; // testing: why grown-ups did not set out (huntLog().why)
    const no = (k) => { why[k] = (why[k] ?? 0) + 1; return false; };
    function wantsToHunt(p) {
      const f = p.family;
      if (!isAdult(p) || !doorOf(f) || p.asleep || p.hidden || p.fleeing || P().isNight()) return no('not free');
      if (S.dayT < T.WAKE + 0.01 || S.dayT > K.START_BY) return no('hour');
      // the fields come first: sowing, a ripe harvest, a field that wants tending. A hunt is what a grown-up does
      // with a morning the fields do not need (it takes the place of resting or gathering, not of farming)
      if (f.plans.some((b) => !b.done && (b.kind === 'field' || b.kind === 'hut'))) return no('building'); // a roof and a field first
      // a field wanting hands (ripe, or going to weeds) needs a grown-up of its own: only spare hands go hunting
      const wanting = f.fields.filter((fl) => fl.grow >= 1 || fl.care < K.CARE_FIRST).length;
      if (wanting) {
        const hands = f.members.filter((m) => !m.dead && m.stage === 'adult' && !hunts.has(m)).length;
        if (wanting >= hands) return no('fields');
      }
      const need0 = P().needOf(f);
      if (f.food < need0 * T.FOOD_PANIC) return no('panic'); // nothing in store: gathering is surer (game close by is still taken, see scan)
      for (const [q, h] of hunts) if (q.family === f && h.role === 'lead') return no('one out'); // one hunt out per household
      if (leadsOut() >= Math.max(1, Math.ceil(settledAdults() * K.SHARE))) return no('share');
      const need = P().needOf(f);
      const want = Math.max(1, Math.ceil(f.members.length / T.PEOPLE_PER_FIELD));
      let w = K.BASE;
      if (f.food < need * K.LEAN_YEARS) w *= K.LEAN_MULT;
      if (!f.fields.length) w *= K.NO_FIELD_MULT;
      else if (f.fields.length >= want && f.food >= need * K.FED_YEARS) w *= K.FED_MULT;
      if (p.expectsHelp) w *= T.DEPENDENT_WORK;
      w *= 1 + K.HABIT * Math.min(1, rec(p).trips / 4);
      return rand() < w || no('chance');
    }
    function startHunt(p, given = null) {
      const f = p.family, c = doorOf(f);
      const a = given ?? findPrey(p, c, !f.fields.length && S.dayT < K.EARLY_BY ? K.RANGE_EARLY : K.RANGE);
      if (!a) { rec(p).noGame = S.life; return no('no game'); }
      // (h.spear: a weapon in hand and ready, false while the spear or the arrow is out; the wolves read it)
      const h = { role: 'lead', prey: a, kind: a.species, phase: 'track', tries: 0, t0: S.clockT, seed: (a.seed ?? 0) + (p.seed ?? 0), bag: 0, spear: true, weapon: weaponOf(f), creep: false, urgent: !!given, wasHungry: hungry(f) };
      hunts.set(p, h);
      const r = rec(p);
      r.trips++; r.last = S.life; log.trips++;
      if (h.weapon === 'bow') log.bowTrips++;
      if (r.trips === 1) R.story(p, h.weapon === 'bow' ? 'Went out hunting with a bow for the first time.' : 'Went out hunting with a spear for the first time.');
      setTool(p.F, h.weapon);
      // a second pair of hands: someone free at home or at the next hut
      if (rand() < K.PARTY) {
        let mate = null, md = 30;
        for (const q of S.people) {
          if (q === p || !isAdult(q) || hunts.has(q) || q.asleep || q.hidden || q.fleeing || q.expectsHelp || q.carry) continue;
          if (!/rest|sitting|gather|waiting|walking$/.test(q.doing ?? '')) continue; // only someone with time on their hands
          const d = dist(q, p);
          if (d < md) { md = d; mate = q; }
        }
        if (mate) {
          const mw = weaponOf(mate.family);
          hunts.set(mate, { role: 'mate', lead: p, spear: true, weapon: mw });
          h.mate = mate; log.parties++;
          mate.go = null; mate.work = null; // they drop what they were doing; the activity hook picks them up next
          setTool(mate.F, mw);
          rec(mate).trips++; rec(mate).last = S.life;
        }
      }
      return lead(p, h);
    }

    // ---------- ending ----------
    function end(p, h) {
      if (!h) return;
      hunts.delete(p);
      if (p.F) setTool(p.F, null);
      if (h.pole) { h.pole.group.removeFromParent(); h.pole = null; }
      if (h.flight) dropFlight(h.flight);
      if (h.role === 'lead' && h.mate) {
        const m = h.mate, mh = hunts.get(m);
        h.mate = null;
        if (mh) { hunts.delete(m); if (m.F) setTool(m.F, null); if (!m.dead && !m.hidden) { m.go = null; m.work = null; } }
      }
      if (h.role === 'mate') { const lh = hunts.get(h.lead); if (lh && lh.mate === p) lh.mate = null; }
      if (h.prey && h.prey.dead && h.prey.keepBody > 20) h.prey.keepBody = 6; // a kill left lying is left to the crows
    }
    function giveUp(p, h, why) {
      const f = p.family;
      log.failed++; log.fails[why] = (log.fails[why] ?? 0) + 1;
      const r = rec(p); r.lastWhat = 'miss'; r.lastAt = S.life;
      if (h.mate) { const mr = rec(h.mate); mr.lastWhat = 'miss'; mr.lastAt = S.life; }
      if (why === 'dark') { end(p, h); return false; }
      h.phase = 'empty';
      const d = doorOf(f);
      if (!d) { end(p, h); return false; }
      P().goTo(p, d.x, d.z, { r: 1, doing: 'walking home empty-handed', then: () => end(p, h) });
      return true;
    }

    // ---------- the lead hunter, one step at a time ----------
    function lead(p, h) {
      const f = p.family;
      if (f.state !== 'settled' || !doorOf(f)) { end(p, h); return false; }
      if (h.phase === 'empty') { end(p, h); return false; }
      if (h.load) return goHomeWith(p, h);
      if (P().isNight()) {
        // a kill on the ground is cleaned and carried home in the dark; otherwise they hunt on into the dusk, then give up
        if (h.phase !== 'butcher' && h.phase !== 'throwing' && S.dayT >= K.DUSK_UNTIL) return giveUp(p, h, 'dark');
        p.nightBound = true;
      }
      if (S.clockT - h.t0 > K.MAX_S) return h.bag ? homeWithBag(p, h) : giveUp(p, h, 'long');
      if (h.phase === 'throwing') { P().work(p, 'crouch', 0.3, { face: h.prey ?? undefined, doing: `watching the ${weaponWord(h)} fly` }); return true; }
      if (h.phase === 'fetch') return fetch(p, h);
      if (h.phase === 'butcher') return butcher(p, h);
      let a = h.prey;
      if (!a || a.dead || !S.animals.includes(a)) {
        a = h.tries < K.TRIES ? findPrey(p, doorOf(f), K.RANGE * 1.2) : null;
        if (h.bag && (!a || a.species !== 'rabbit')) return homeWithBag(p, h);
        if (!a) return giveUp(p, h, 'none');
        h.prey = a; h.kind = a.species;
      }
      const d = dist(p, a), throwR = a.species === 'deer' ? K.THROW_DEER : K.THROW_RABBIT;
      const w = where(a.x, a.z, p), name = animalName(a);
      if (d <= throwR) return throwAt(p, h, a, d);
      if (d > K.STALK_AT) {
        h.phase = 'track';
        const k = (d - (K.STALK_AT - 3)) / d;
        P().goTo(p, p.x + (a.x - p.x) * k, p.z + (a.z - p.z) * k, { until: 4, r: 1.2, speed: h.urgent ? T.RUN * K.URGENT_TRACK : d > K.JOG_FROM ? T.RUN * K.JOG : T.WALK, doing: h.urgent ? `hurrying after ${name} ${w}` : `tracking ${name} ${w}` });
        return true;
      }
      h.phase = 'stalk';
      const tame = fresh(a); // an animal just put here has not learned to be wary: no need to creep
      h.creep = tame || !h.creep;
      if (h.creep) {
        const k = (d - (throwR - 1)) / d;
        P().goTo(p, p.x + (a.x - p.x) * k, p.z + (a.z - p.z) * k, { direct: true, until: 1.4, r: 0.5, speed: tame ? T.WALK : K.STALK_SPEED, doing: `stalking ${name} ${w}` });
      } else P().work(p, 'crouch', K.STALK_FREEZE[0] + rand() * (K.STALK_FREEZE[1] - K.STALK_FREEZE[0]), { face: a, doing: `stalking ${name} ${w}` });
      return true;
    }
    function throwAt(p, h, a, d) {
      h.phase = 'throwing';
      const bow = h.weapon === 'bow';
      P().work(p, bow ? 'loose' : 'throw', 1.05, {
        face: a, doing: bow ? `loosing an arrow at ${animalName(a)}` : `throwing a spear at ${animalName(a)}`,
        tick: (dt, w) => { if (!w.thrown && w.t >= K.THROW_AT) { w.thrown = true; release(p, h, a); } return false; },
      });
      return true;
    }
    // where a missed throw comes down: a spot near the animal a person can stand on and fetch it from (never in
    // the water, in a tree or on a roof)
    function missSpot(a) {
      const L = land();
      for (let k = 0; k < 6; k++) {
        const ang = rand() * 6.283, r = 1.4 + rand() * 1.6, x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
        if (L.spotOk(Math.floor(x), Math.floor(z), 'person') && ctx.edgeClear(x, z) >= 0.5) return { x, z };
      }
      return L.nearestSpot(a.x, a.z, 'person', 4) ?? { x: a.x, z: a.z };
    }
    function release(p, h, a) {
      if (a.dead) { h.phase = 'track'; return; }
      const mateNear = h.mate && dist(h.mate, p) < 6;
      const base = fresh(a) ? K.HIT_PLACED : a.species === 'deer' ? K.HIT_DEER : K.HIT_RABBIT;
      const hit = rand() < (base + (mateNear ? K.PARTY_HIT : 0)) * (R.ask('huntSkill', p) ?? 1); // forces.js: strength steadies the arm
      log.throws++; if (hit) log.hits++;
      const bow = h.weapon === 'bow';
      if (!bow) setTool(p.F, null); // the bow stays in hand; the spear has gone
      h.spear = false; h.pulled = false;
      const s = p.F.s ?? T.PERSON_SCALE;
      const fx0 = Math.sin(p.ry), fz0 = Math.cos(p.ry), rx = Math.cos(p.ry), rz = -Math.sin(p.ry); // the hunter's front and right
      // a spear leaves the raised right hand; an arrow the bow, at arm's length in front of the left shoulder
      const from = bow ? { x: p.x + fx0 * 0.6 * s - rx * 0.3 * s, y: p.y + 1.2 * s, z: p.z + fz0 * 0.6 * s - rz * 0.3 * s }
        : { x: p.x + rx * 0.4 * s, y: p.y + 1.7 * s, z: p.z + rz * 0.4 * s };
      const to = hit ? { x: a.x, z: a.z } : missSpot(a);
      const dims = bow ? ARROW_DIMS(s) : SPEAR_DIMS(s);
      const span = Math.hypot(to.x - from.x, to.z - from.z);
      const fl = { mesh: bow ? makeArrow(s) : makeSpear(s), from, to, t: 0, dur: Math.max(LOOK.MIN_FLIGHT, span / (bow ? LOOK.ARROW_FLY : LOOK.SPEAR_FLY)), hit, prey: a, h, p, landed: false,
        bow, thick: dims.thick, tipZ: dims.tip, half: dims.half, arc: Math.min(bow ? LOOK.ARROW_ARC_MAX : LOOK.SPEAR_ARC_MAX, span * (bow ? LOOK.ARROW_ARC : LOOK.SPEAR_ARC)) };
      fl.mesh.rotation.order = 'YXZ';
      fl.mesh.userData.noPick = true;
      ctx.layers.entities.add(fl.mesh);
      flying.push(fl); h.flight = fl;
      h.tries++;
      sfx('hunt.loose', p.x, p.z, { weapon: h.weapon });
    }
    function dropFlight(fl) {
      fl.mesh.removeFromParent();
      const i = flying.indexOf(fl); if (i >= 0) flying.splice(i, 1);
      if (fl.h.flight === fl) fl.h.flight = null;
    }
    // a spear or an arrow in the air: an arc to the target (it follows an animal it is to hit); on landing it
    // strikes and sticks in the animal, or comes down in the ground
    const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), ZF = new THREE.Vector3(0, 0, 1);
    function flyStep(fl, dt) {
      if (fl.landed) { restStep(fl, dt); return; }
      fl.t += dt;
      const k = Math.min(1, fl.t / fl.dur);
      if (fl.hit && !fl.prey.dead) { fl.to.x = fl.prey.x; fl.to.z = fl.prey.z; }
      const L = land();
      const gy = L.topAt(Math.floor(fl.to.x), Math.floor(fl.to.z)) + 1 + (fl.hit ? (fl.prey.species === 'deer' ? 0.85 : 0.3) : 0.1);
      const span = Math.hypot(fl.to.x - fl.from.x, fl.to.z - fl.from.z), arc = fl.arc;
      const y = fl.from.y + (gy - fl.from.y) * k + 4 * arc * k * (1 - k);
      const x = fl.from.x + (fl.to.x - fl.from.x) * k, z = fl.from.z + (fl.to.z - fl.from.z) * k;
      const vy = (gy - fl.from.y) + 4 * arc * (1 - 2 * k);
      fl.mesh.position.set(x, y, z);
      fl.mesh.rotation.set(-Math.atan2(vy, Math.max(0.1, span)), Math.atan2(fl.to.x - fl.from.x, fl.to.z - fl.from.z), 0);
      fx.shape(fl.mesh, fl.thick);
      if (k < 1) { fx.flight(fl); return; }
      fl.landed = true;
      const h = fl.h, p = fl.p, a = fl.prey;
      if (!hunts.has(p) || hunts.get(p) !== h) { dropFlight(fl); return; }
      const dir = { x: (fl.to.x - fl.from.x) / Math.max(0.1, span), z: (fl.to.z - fl.from.z) / Math.max(0.1, span) };
      if (fl.hit && !a.dead) {
        A().kill(a, 'hunt');
        a.keepBody = 200;
        // the body is not done yet: it flinches, runs a few steps and drops (animals.js wound); the weapon rides in it
        const run = A().wound?.(a, p.x, p.z);
        stickIn(fl, a, run?.side ?? 1);
        fx.burst(x, y, z, a.species, dir);
        sfx('hunt.hit', a.x, a.z, { weapon: h.weapon, kind: a.species });
        h.phase = 'butcher';
        const r = rec(p); r.lastWhat = a.species; r.lastAt = S.life;
        S.mind.push(p, a.species === 'deer' ? 'Got it. Got it! Now the heavy part.' : 'Got one. Supper.');
      } else {
        comeDown(fl, dir);
        h.phase = 'fetch'; h.spearAt = { x: fl.restAt.x, z: fl.restAt.z };
        if (!a.dead) startle(a, p);
        S.mind.push(p, a.species === 'deer' ? 'Missed. And now it knows I am here.' : 'Too slow. Rabbits are mostly legs.');
      }
    }
    // the weapon struck: it stays in the animal's flank, on the side it came from, and moves and falls with the body
    // (the body falls onto its other side, so the shaft stands up out of it where it lies)
    function stickIn(fl, a, side) {
      const F = a.F, D = F.dims ?? { bw: 0.4, by: 0.68, blen: 0.8 }, sc = F.sc ?? 1;
      const out = _v.set(side * 0.62, 0.55, -0.45).normalize();
      const inward = out.clone().negate();
      const bury = fl.bow ? 0.12 : 0.22; // metres of the head inside
      const ex = side * D.bw / 2 * 0.9, ey = D.by + 0.05, ez = -D.blen * 0.12;
      const back = (fl.tipZ - bury) / sc;
      fl.mesh.removeFromParent();
      fl.mesh.rotation.order = 'XYZ';
      fl.mesh.quaternion.copy(_q.setFromUnitVectors(ZF, inward));
      fl.mesh.position.set(ex - inward.x * back, ey - inward.y * back, ez - inward.z * back);
      fl.base = 1 / sc;
      fx.shape(fl.mesh, fl.thick, fl.base);
      F.fig.add(fl.mesh);
      fl.stuck = a;
    }
    // a miss comes down: it sticks in the ground at a slant, or skitters on a little and lies flat
    function comeDown(fl, dir) {
      const L = land(), m = fl.mesh;
      const at = { x: fl.to.x, z: fl.to.z };
      const g = L.topAt(Math.floor(at.x), Math.floor(at.z)) + 1;
      fx.burst(at.x, g + 0.05, at.z, 'dust', dir);
      sfx('hunt.miss', at.x, at.z, { weapon: fl.h.weapon });
      if (rand() < (fl.bow ? LOOK.STICK_ARROW : LOOK.STICK_SPEAR)) {
        m.rotation.x = Math.max(m.rotation.x, fl.bow ? 0.55 : 0.5);
        _v.set(0, 0, 1).applyQuaternion(m.quaternion);
        const back = fl.tipZ - (fl.bow ? 0.12 : 0.25);
        m.position.set(at.x - _v.x * back, g - _v.y * back, at.z - _v.z * back);
        fl.restAt = at;
        return;
      }
      // skitters on along the way it was going, on ground a person can walk, and lies flat
      const d = LOOK.SKITTER[0] + rand() * (LOOK.SKITTER[1] - LOOK.SKITTER[0]);
      let end = at;
      for (const f of [1, 0.5]) {
        const x = at.x + dir.x * d * f, z = at.z + dir.z * d * f;
        if (L.lineWalk(at.x, at.z, x, z, 'person') && L.spotOk(Math.floor(x), Math.floor(z), 'person')) { end = { x, z }; break; }
      }
      fl.slide = { x0: at.x, z0: at.z, x1: end.x, z1: end.z, t: 0, spin: (rand() - 0.5) * 1.2, ry0: m.rotation.y };
      fl.restAt = end;
      restStep(fl, 0);
    }
    // a weapon that has come down: a skitter plays out; whatever lies about keeps its honest width at this zoom
    function restStep(fl, dt) {
      const m = fl.mesh;
      if (fl.slide) {
        const sl = fl.slide;
        sl.t += dt;
        const k = Math.min(1, sl.t / LOOK.SKITTER_S), e = 1 - (1 - k) * (1 - k);
        const x = sl.x0 + (sl.x1 - sl.x0) * e, z = sl.z0 + (sl.z1 - sl.z0) * e;
        m.position.set(x, land().topAt(Math.floor(x), Math.floor(z)) + 1 + fl.thick * 0.6, z);
        m.rotation.set(0.03, sl.ry0 + sl.spin * e, 0);
        if (k >= 1) fl.slide = null;
      }
      fx.shape(m, fl.thick, fl.base ?? 1);
    }
    // the animal bolts away from the hunter (the same zigzag the animals' own bolt uses: animals.js reads a.flee)
    function startle(a, p) {
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz) || 1;
      // no path here: the animals' next step finds it none and starts the first leg, a checked walk (animals.js fleeLeg)
      a.flee = { ax: dx / d, az: dz / d, legs: 4, side: rand() < 0.5 ? -1 : 1 };
      a.state = 'flee'; a.doing = 'bolting'; a.path = null; a.pi = 0; a.grazeT = 0;
    }
    function fetch(p, h) {
      const at = h.spearAt;
      if (!at) { h.phase = 'track'; return lead(p, h); }
      P().goTo(p, at.x, at.z, {
        r: 0.8, doing: `fetching the ${weaponWord(h)}`,
        then: () => P().work(p, 'pick', 0.7, {
          doing: h.weapon === 'bow' ? 'picking up the arrow' : 'pulling the spear out of the ground',
          then: () => {
            if (h.flight) dropFlight(h.flight);
            h.spearAt = null; h.spear = true; setTool(p.F, h.weapon);
            h.phase = 'track';
            if (h.tries >= K.TRIES && !h.bag) giveUp(p, h, 'missed');
            else if (h.tries >= K.TRIES) homeWithBag(p, h);
          },
        }),
      });
      return true;
    }
    function butcher(p, h) {
      const a = h.prey;
      if (!a || !S.animals.includes(a)) { h.phase = 'track'; h.prey = null; if (h.flight) dropFlight(h.flight); h.spear = true; setTool(p.F, h.weapon); return lead(p, h); }
      const sp = a.species === 'deer' ? 'deer' : 'rabbit';
      // struck, it is still on its feet (animals.js wound): watch it stagger, then follow it to where it drops
      if (a.dying && !a.dying.done) {
        if (a.dying.t < 0.6 || dist(p, a) < 3) P().work(p, null, 0.3, { face: a, doing: `watching the wounded ${sp}` });
        else P().goTo(p, a.x, a.z, { until: 0.5, r: 2.5, doing: `going after the wounded ${sp}` });
        return true;
      }
      const w = where(a.x, a.z, p);
      // kneel beside it, not on it (on the hunter's side, where a person can stand; else as close as the land allows)
      const dd = dist(p, a) || 1, bx = a.x + (p.x - a.x) / dd * 1.1, bz = a.z + (p.z - a.z) / dd * 1.1;
      const beside = land().spotOk(Math.floor(bx), Math.floor(bz), 'person');
      P().goTo(p, beside ? bx : a.x, beside ? bz : a.z, {
        r: beside ? 0.5 : 1.2, doing: `going to the ${sp} ${w}`,
        then: () => P().work(p, 'butcher', (a.species === 'deer' ? K.BUTCHER_S : K.BUTCHER_S * 0.5) * (h.urgent ? K.URGENT_BUTCHER : 1), {
          face: a, doing: a.species === 'deer' ? `cleaning a deer ${w}` : 'tying the rabbit by its legs',
          // the weapon is pulled out of the body first thing, and is back in hand (or the arrow in the quiver)
          // (h.pulled shows it; h.spear, what the wolves read, comes back when the hunter stands up with the kill, as before)
          tick: (dt, wk) => { if (!wk.pulled && wk.t >= LOOK.PULL_AT) { wk.pulled = true; if (h.flight) dropFlight(h.flight); h.pulled = true; setTool(p.F, h.weapon); } return false; },
          then: () => pickUp(p, h, a),
        }),
      });
      return true;
    }
    function pickUp(p, h, a) {
      if (h.flight) dropFlight(h.flight);
      h.spear = true; setTool(p.F, h.weapon);
      a.keepBody = 0; // the body is lifted (animals.js takes it away)
      h.prey = null;
      if (a.species === 'rabbit') {
        h.bag++; log.rabbits++; rec(p).rabbits++;
        P().carry(p, 'rabbits');
        const another = h.bag < 3 && S.dayT < K.START_BY + 0.08 && rand() < K.MORE_RABBITS ? findPrey(p, p, 22) : null;
        if (another?.species === 'rabbit') { h.prey = another; h.kind = 'rabbit'; h.phase = 'track'; h.tries = Math.min(h.tries, K.TRIES - 1); return; }
        return homeWithBag(p, h);
      }
      log.deer++; rec(p).deer++;
      h.load = 'deer'; h.kind = 'deer'; h.meat = K.MEAT_DEER;
      // two together carry it on a pole between them
      if (h.mate && !h.mate.dead && dist(h.mate, p) < 8) {
        h.pole = makePoleCarry(p.F.s ?? T.PERSON_SCALE);
        ctx.layers.entities.add(h.pole.group);
        log.poles++;
        P().carry(p, null);
      } else P().carry(p, 'deer');
      goHomeWith(p, h);
    }
    function homeWithBag(p, h) {
      h.load = 'rabbits'; h.kind = 'rabbit'; h.meat = K.MEAT_RABBIT * Math.max(1, h.bag);
      return goHomeWith(p, h);
    }
    // home with the meat, whatever the hour
    function goHomeWith(p, h) {
      const f = p.family, d = doorOf(f);
      if (!d) { end(p, h); return false; }
      h.phase = 'home';
      if (P().isNight()) p.nightBound = true;
      const want = h.pole ? null : h.load === 'deer' ? 'deer' : 'rabbits';
      if (p.carry !== want) P().carry(p, want);
      const slow = h.urgent ? K.URGENT_CARRY : h.load === 'deer' ? K.LOAD_SLOW : 0.92;
      const what = carried(h);
      P().goTo(p, d.x, d.z, {
        r: 0.9, speed: T.WALK * slow,
        doing: h.pole ? `carrying ${what} home on a pole with ${h.mate?.name ?? 'a friend'}` : `carrying ${what} home`,
        then: () => deliver(p, h),
      });
      return true;
    }
    function deliver(p, h) {
      const f = p.family, what = carried(h);
      let meat = h.meat ?? 0;
      const m = h.mate;
      if (m && !m.dead && m.family !== f && m.family.state === 'settled') { const share = meat * K.MATE_SHARE; m.family.food += share; meat -= share; }
      const starving = f.members.filter((q) => !q.dead && q.hunger > 0);
      f.food += meat;
      log.food += h.meat ?? 0;
      // a hungry house eats at once: the hunger eases now, and the store carries them on
      const feast = h.kind === 'deer' ? K.FEAST_DEER : K.FEAST_RABBIT * Math.max(1, h.bag);
      for (const q of starving) { q.hunger = Math.max(0, q.hunger - feast); S.mind.push(q, h.kind === 'deer' ? 'Meat. Real meat. I had forgotten.' : 'Rabbit stew. Thin, but hot.'); }
      if (h.urgent && (h.wasHungry || starving.length)) {
        log.fed++; log.firstDeer = log.firstDeer || h.kind === 'deer'; // one alert for this one
        R.alert('good', `${R.cap1(P().famLabel(f))} ate well ${P().isNight() ? 'tonight' : 'today'}: ${p.name} brought ${what} home.${starving.length ? ` The hunger in the house has eased.` : ''}`, { x: p.x, z: p.z, subject: p });
      }
      P().carry(p, null);
      // the screen's moment: meat home (food in "years of eating for the household", as foodStore says it)
      R.signal('hunt:home', { hunter: p, family: f, kind: h.kind, meat: Math.round(meat * 10) / 10, years: Math.round(meat / Math.max(0.01, P().needOf(f)) / T.LIFE_RATE * 10) / 10, store: R.ask('foodStore', f), x: p.x, z: p.z });
      const r = rec(p);
      r.lastWhat = h.kind; r.lastAt = S.life;
      const n = r.deer + r.rabbits;
      if (n === 1) R.story(p, `Brought ${what} home to ${P().famLabel(f)}.`);
      else if (n % 5 === 0) R.story(p, `Has brought home ${r.deer ? `${r.deer} ${r.deer === 1 ? 'deer' : 'deer'}` : ''}${r.deer && r.rabbits ? ' and ' : ''}${r.rabbits ? `${r.rabbits} ${r.rabbits === 1 ? 'rabbit' : 'rabbits'}` : ''} by now.`);
      if (m) R.story(m, `Helped ${p.name} carry ${what} home.`);
      if (h.kind === 'deer' && !log.firstDeer) {
        log.firstDeer = true;
        R.alert('good', `${p.name} of ${P().famLabel(f)} brought a deer home${h.pole ? ` on a pole with ${m?.name}` : ` across ${his(p)} shoulders`}. There is meat in the house.`,
          { x: p.x, z: p.z, subject: p, aside: R.aside('hunting:first', ['Farming has competition.']) });
      }
      S.mind.push(p, h.kind === 'deer' ? 'Home, and my shoulders are mine again.' : 'Something for the pot.');
      end(p, h);
      const night = P().isNight(), hut = f.home;
      if (night) { if (hut?.done) P().enterHome(p, hut); else P().goHomeAndSleep(p); }
      else P().work(p, 'pick', 1, { doing: 'putting the meat by' });
    }

    // ---------- the second hunter ----------
    function mate(p, h) {
      const L = h.lead, lh = hunts.get(L);
      if (!lh || L.dead || lh.mate !== p) { end(p, h); return false; }
      const sp = (L.go?.speed ?? T.WALK);
      if (lh.pole) {
        if (P().isNight()) p.nightBound = true; // home with the deer before bed
        // the back end of the pole: keep POLE_LEN behind the lead
        const bx = L.x - Math.sin(L.ry) * K.POLE_LEN, bz = L.z - Math.cos(L.ry) * K.POLE_LEN;
        const d = Math.hypot(bx - p.x, bz - p.z);
        if (d < 0.3) { P().work(p, 'shoulder', 0.25, { face: L, doing: `carrying a deer home with ${L.name}` }); return true; }
        P().goTo(p, bx, bz, { direct: true, until: 0.35, r: 0.2, speed: Math.min(T.RUN, sp * (d > 1 ? 1.5 : 1.05)), doing: `carrying a deer home with ${L.name}` });
        return true;
      }
      if ((P().isNight() && S.dayT >= K.DUSK_UNTIL) || lh.phase === 'home' || lh.phase === 'empty') { end(p, h); return false; }
      if (P().isNight()) p.nightBound = true;
      const stalking = lh.phase === 'stalk' || lh.phase === 'throwing' || lh.phase === 'butcher';
      const side = (p.seed % 2 ? 1 : -1) * 1.4;
      const tx = L.x - Math.sin(L.ry) * 1.6 + Math.cos(L.ry) * side, tz = L.z - Math.cos(L.ry) * 1.6 - Math.sin(L.ry) * side;
      const d = Math.hypot(tx - p.x, tz - p.z);
      const doing = stalking ? `stalking ${lh.prey ? animalName(lh.prey) : 'game'} with ${L.name}` : `out hunting with ${L.name}`;
      if (d < 1.0) { P().work(p, stalking ? 'crouch' : null, 0.5, { face: lh.prey ?? L, doing }); return true; }
      P().goTo(p, tx, tz, { direct: d < 12, until: 1.2, r: 0.6, speed: stalking ? K.STALK_SPEED * 1.2 : Math.min(T.RUN, sp * (d > 4 ? 1.4 : 1.05)), doing });
      return true;
    }

    // ---------- hooks ----------
    R.on('activity', (p) => {
      const h = hunts.get(p);
      if (h) return h.role === 'lead' ? lead(p, h) : mate(p, h);
      if (!wantsToHunt(p)) return false;
      return startHunt(p);
    });

    // A hungry family watches for game near home: someone awake who can see it notices at once, and game out
    // of everyone's sight is found soon enough (FIND_RATE). A grown-up drops what they are doing and goes after
    // it, any hour they are awake, fields or no fields, hut or no hut. This is how the god feeds people early:
    // put a deer by the door (seen, an act like any other), or just out of sight (unseen, found by them).
    let scanT = 0;
    function scan(dt) {
      for (const a of S.animals) if (a.placed && !placedAt.has(a)) placedAt.set(a, S.clockT);
      if (P().isNight()) return;
      const busy = taken();
      for (const f of S.families) {
        if (f.state !== 'settled' || !hungry(f)) continue;
        let out = false;
        for (const [q, h] of hunts) if (q.family === f && h.role === 'lead') { out = true; break; }
        if (out) continue;
        const at = doorOf(f);
        if (!at) continue;
        const awake = f.members.filter((m) => !m.dead && !m.hidden && !m.asleep && m.age >= 4);
        let best = null, bd = Infinity;
        for (const a of S.animals) {
          if ((a.species !== 'deer' && a.species !== 'rabbit') || a.dead || busy.has(a)) continue;
          const d = dist(a, at) - (a.species === 'deer' ? 6 : 0);
          // with fields and a little in store, the field feeds a hungry house surer than wild game; a gift, or a house
          // already going hungry, is another matter
          if (!fresh(a) && f.fields.length && !(K.WILD_WITH_FIELDS && starving(f))) continue;
          if (d > (fresh(a) ? K.NOTICE_R : K.NOTICE_WILD) || d >= bd || ctx.edgeClear(a.x, a.z) < 0.6) continue;
          if (S.dayT > K.URGENT_LATE && d > 18) continue; // late in the day only game close by is worth the walk
          if (!fresh(a) && d > 18 && S.dayT > K.START_BY) continue; // wild game further off: only setting out in the morning (back by dark)
          const seen = awake.some((m) => dist(m, a) < T.SIGHT_DAY);
          if (!seen && rand() > (fresh(a) ? K.FIND_RATE : K.WILD_FIND) * dt) continue;
          bd = d; best = a;
        }
        if (!best) continue;
        // who goes: the nearest grown-up who is up and about (an elder if nobody else)
        const able = f.members.filter((m) => !m.dead && !m.hidden && !m.asleep && !m.fleeing && !hunts.has(m) && (m.stage === 'adult' || m.stage === 'elder'));
        if (!able.length) continue;
        // not the one raising the roof, if anyone else can go
        const cost = (m) => (m.stage === 'adult' ? 0 : 50) + (/build/.test(m.doing ?? '') ? 30 : 0) + dist(m, best);
        able.sort((m1, m2) => cost(m1) - cost(m2));
        const p = able[0];
        p.go = null; p.work = null; P().carry(p, null);
        if (!startHunt(p, best)) continue;
        busy.add(best);
        log.spotted++;
        const near = dist(best, at) < 16;
        const name = best.species === 'deer' ? 'a deer' : 'a rabbit';
        for (const m of f.members) if (!m.dead && !m.hidden && !m.asleep) S.mind.push(m, fresh(best) ? (near ? `${R.cap1(name)}, by the door. Nobody asks where from.` : `${R.cap1(name)}, just there. Where did that come from? Never mind. Quiet.`) : `${R.cap1(name)} near the ${f.home?.done ? 'hut' : 'camp'}. Somebody get the spear.`);
        R.story(p, `Went after ${name} that came near home when food was short.`);
        R.alert('info', `${R.cap1(P().famLabel(f))} ${f.food < 0.5 ? 'have nothing to eat' : 'are short of food'}. ${p.name} saw ${name} ${near ? 'by the door' : 'not far from home'} and went after it with a spear.`,
          { x: best.x, z: best.z, subject: p, aside: fresh(best) && near ? R.aside('hunting:gift', ['A deer, by the door. Nobody asks where from.']) : undefined });
      }
    }

    // spears in flight, the pole carry, spears in hand, the wolves
    const wolfSeen = new Map(); // wolf -> the hunter it was re-rolled for
    R.on('step', ({ dt }) => {
      fx.beginFrame();
      for (let i = flying.length - 1; i >= 0; i--) flyStep(flying[i], dt);
      fx.endFrame(dt);
      scanT -= dt;
      if (scanT <= 0) { scan(0.5 - scanT); scanT = 0.5; }
      for (const [p, h] of hunts) {
        if (p.dead) continue;
        // the weapon shows in hand (a rebuilt figure gets it back), except under a pole: then it rides on the load.
        // A bow stays in hand while its arrow is out; a thrown spear does not
        const poled = h.role === 'lead' ? !!h.pole : !!hunts.get(h.lead)?.pole;
        const kind = h.weapon ?? 'spear';
        if (p.F) { const want = poled ? null : kind === 'bow' ? 'bow' : h.spear || h.pulled ? 'spear' : null; if ((p.F.toolKind ?? null) !== want) setTool(p.F, want); }
        const pose = p.work?.pose;
        if (p.F?.tool && pose !== 'throw' && pose !== 'thrust' && pose !== 'loose') toolHome(p.F);
        if (h.role === 'lead' && h.pole) {
          const m = h.mate;
          if (!m || m.dead || dist(m, p) > 8) {
            // they got separated: the lead takes the whole deer on the shoulders
            h.pole.group.removeFromParent(); h.pole = null;
            P().carry(p, 'deer');
            if (m) { const mh = hunts.get(m); if (mh) end(m, mh); }
            continue;
          }
          const s = p.F.s ?? T.PERSON_SCALE, y = (p.y + m.y) / 2 + 1.36 * s;
          const g = h.pole.group;
          g.position.set((p.x + m.x) / 2, y, (p.z + m.z) / 2);
          g.rotation.y = Math.atan2(p.x - m.x, p.z - m.z);
          h.pole.pole.scale.z = dist(p, m) + 0.7;
        }
      }
      // a wolf on an armed hunter: they stand a better chance (the outcome was rolled when the hunt began)
      for (const w of S.predators) {
        const q = w.prey;
        if (w.dead || !q || q.kind !== 'person' || (w.state !== 'stalk' && w.state !== 'sprint')) { wolfSeen.delete(w); continue; }
        if (wolfSeen.get(w) === q) continue;
        wolfSeen.set(w, q);
        const h = hunts.get(q);
        if (!h || !h.spear) continue;
        if (w.outcome === 'kill' && rand() < K.WOLF_SAVE) { w.outcome = 'wound'; log.wolfSaves++; R.story(q, 'A wolf came for them while they had a spear in hand. It would only bite.'); }
        else if (w.outcome === 'wound' && rand() < K.WOLF_SAVE) { w.outcome = 'escape'; log.wolfSaves++; R.story(q, 'Saw a wolf coming, spear in hand.'); }
      }
    });

    // a deer count falling low with hunters about: say so, once a century
    R.on('year', () => {
      const deer = S.deerCount ?? 0;
      log.peakDeer = Math.max(log.peakDeer, deer);
      if (deer <= K.HUNTED_OUT && log.peakDeer >= K.HUNTED_FROM && log.deer >= 3 && S.year - log.warnedAt > 100) {
        log.warnedAt = S.year; log.peakDeer = deer;
        R.alert('warn', 'The deer near the settlement are nearly hunted out. Hunters will come home with rabbits, or nothing, until a herd comes back.', {});
      }
    });

    R.on('person:death', (p) => { const h = hunts.get(p); if (h) end(p, h); });
    R.on('family:leave', (f) => { for (const m of f.members) { const h = hunts.get(m); if (h) end(m, h); } });

    // thoughts while hunting, and after
    R.on('thoughts', (p) => {
      if (p.asleep) return null;
      const h = hunts.get(p), out = [];
      // a deer the god put by a hungry family's door
      if (p.family.state === 'settled' && hungry(p.family)) {
        const at = doorOf(p.family);
        if (at && S.animals.some((a) => !a.dead && a.species === 'deer' && fresh(a) && dist(a, at) < 20)) out.push([40, 'A deer, by the door. Nobody asks where from.']);
      }
      if (h) {
        if (h.load === 'deer' || hunts.get(h.lead)?.pole) out.push([14, 'Heavy. Worth every step.'], [14, 'They will eat well tonight.'], [12, 'My shoulders will remember this deer.']);
        else if (h.load || h.bag) out.push([12, 'Rabbits. Not a feast, but supper.'], [10, 'They swing as I walk. Dinner keeping time.']);
        else if (h.phase === 'stalk' || hunts.get(h.lead)?.phase === 'stalk') out.push([16, 'Slow. Slower. The wind is in my face, good.'], [16, 'Do not step on a stick. Do not step on a stick.'], [12, 'It has not seen me. It has not seen me yet.']);
        else out.push([10, 'Fresh tracks. Not far now.'], [9, 'A spear, quiet feet, and luck. Two out of three will do.'], [8, 'The field can tend itself for one morning.']);
        return out;
      }
      const r = p.ext?.hunt;
      if (!r) return out;
      if (S.life - r.lastAt < 6) {
        if (r.lastWhat === 'miss') out.push([9, 'It saw me first. Next time.'], [8, 'I came home with a spear and nothing on it.']);
        else if (r.lastWhat === 'deer') out.push([9, 'Meat in the house. The children were quiet for once.'], [7, 'I can still feel that deer on my shoulders.']);
        else if (r.lastWhat === 'rabbit') out.push([7, 'Rabbit again. Nobody complained. Much.']);
      }
      if (r.noGame && S.life - r.noGame < 8) out.push([8, 'The deer have gone. I walked half the day and saw only grass.']);
      return out;
    });

    // the inspector: a hunter, and their tally
    const isHunter = (e) => { const r = e.ext?.hunt; return hunts.has(e) || (r && r.trips >= K.ROLE_TRIPS && S.life - r.last < K.ROLE_YEARS); };
    R.on('inspect', (e, out) => {
      if (!e || e.kind !== 'person' || e.dead) return;
      const r = e.ext?.hunt;
      if (isHunter(e) && e.stage === 'adult') out.role = 'hunter';
      if (!r || !r.trips) return;
      const got = [r.deer ? `${r.deer} deer` : '', r.rabbits ? `${r.rabbits} ${r.rabbits === 1 ? 'rabbit' : 'rabbits'}` : ''].filter(Boolean).join(' and ') || 'nothing yet';
      R.section(out, { id: 'hunting', title: 'Hunting', order: 60, rows: [['Hunts', String(r.trips)], ['Brought home', got]] });
    });
    R.on('stats', (st) => { let n = 0; for (const h of hunts.values()) if (h.role === 'lead') n++; st.hunters = n; st.meat = Math.round(log.food); });
    R.answer('huntLog', () => ({ ...log, why: { ...why }, food: Math.round(log.food), out: [...hunts.entries()].map(([p, h]) => `${p.name}: ${h.role} ${h.phase ?? ''} ${h.prey?.species ?? ''}`) }));
    R.answer('isHunter', (p) => !!(p && isHunter(p)));
    // ---------- a deer for a hungry family: where it could stand, and whether it would feed them ----------
    // (foresight's "what you could do", the prayers' answer and the careful god all use these, so they agree)
    // placeable: the same rules sim.spawnAnimal('deer') refuses by (animals.js)
    function placeable(x, z) {
      const L = land(), cx = Math.floor(x), cz = Math.floor(z);
      if (!L.inside(cx, cz) || ctx.edgeClear(x, z) < 0.5 || S.isProtected(cx, cz) || L.waterAt(cx, cz) || !L.passable(cx, cz, 'deer')) return false;
      const h = L.topAt(cx, cz);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (L.passable(cx + dx, cz + dz, 'deer') && Math.abs(L.topAt(cx + dx, cz + dz) - h) <= 1) return true;
      return false;
    }
    // deerSpot(family, { unseen }): a spot 5 to 20 from their door where a deer can stand, the least watched one
    // (seenBy: how many would see it appear, faith.js's notice rule for an act of kind 'animal'); null if none
    R.answer('deerSpot', (f, o = {}) => {
      const d = f && doorOf(f);
      if (!d) return null;
      let best = null;
      for (const r of [5, 8, 12, 16, 20]) for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + r * 0.37, x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
        if (!placeable(x, z)) continue;
        const seenBy = R.noticeCount({ kind: 'animal', x, z, r: 0 });
        if (!best || seenBy < best.seenBy || (seenBy === best.seenBy && r < best.r)) best = { x, z, r, seenBy };
        if (best.seenBy === 0 && !o.unseen) return best;
      }
      return best;
    });
    // foodStore(family): the household's store in plain units: { food, need, years (calendar years it feeds them all),
    // full (0..1 of what the store can hold), hungry (how many are going hungry), text }
    R.answer('foodStore', (f) => {
      if (!f) return null;
      const need = Math.max(0.01, P().needOf(f));
      const capN = need * R.value('store', f, T.STORE_MAX_YEARS);
      const years = f.food / need / T.LIFE_RATE;
      const hungryN = f.members.filter((m) => !m.dead && m.hunger > 0).length;
      const y = Math.round(years);
      return { food: Math.round(f.food * 10) / 10, need: Math.round(need * 10) / 10, years: Math.round(years * 10) / 10, full: Math.round(Math.min(1, f.food / capN) * 100) / 100, hungry: hungryN,
        text: f.food < 0.05 ? 'Nothing in store.' : years < 1.5 ? 'Food for about a year.' : `Food for about ${y} years.` };
    });
    // deerFeeds(family): would a deer put by their door feed them? { works, why, hunter }
    R.answer('deerFeeds', (f) => {
      if (!f || f.state !== 'settled' || !doorOf(f)) return { works: false, why: 'They have no home to carry it to.' };
      const able = f.members.filter((m) => !m.dead && (m.stage === 'adult' || m.stage === 'elder') && !m.ext?.hardship?.sick);
      if (!able.length) return { works: false, why: 'Nobody in the house is able to hunt.' };
      if (!hungry(f)) return { works: false, why: 'They are not short of food: they would let it graze.' };
      const hunter = able.sort((a, b) => (a.stage === 'adult' ? 0 : 1) - (b.stage === 'adult' ? 0 : 1))[0];
      return { works: true, hunter, hit: Math.min(0.97, K.HIT_PLACED * (R.ask('huntSkill', hunter) ?? 1)), meat: K.MEAT_DEER };
    });
    // ---------- a deer the god just put down: can this hungry house get it, and when would the meat be home? ----------
    // The same rules the hungry family's watch (scan above) goes by, said in plain words: they must be short of food,
    // the deer must stand within NOTICE_R of their door and out of the mist, it must be day (by night they sleep), late
    // in the day only game close by is worth the walk, and someone in the house must be able to hunt. Foresight's
    // answer to an act (foresight.js answerAct) and its hunger look use these, so the words and the warning agree.
    const ableOf = (f) => f.members.filter((m) => !m.dead && (m.stage === 'adult' || m.stage === 'elder') && !m.ext?.hardship?.sick);
    const toLife = (gs) => gs * T.LIFE_RATE / Math.max(1e-6, ctx.clock.secondsPerYear || 2.4);
    // game seconds until a deer at `a` is cleaned and carried in at the door: found (at once if someone awake can see
    // it), the jog out, a throw or two, the cleaning, the carry home (the urgent paces a hungry house hunts at)
    function etaOf(f, a, hunter, phase = 'placed') {
      const d = doorOf(f);
      if (!d || !hunter) return Infinity;
      const carry = dist(a, d) / (T.WALK * K.URGENT_CARRY);
      if (phase === 'carrying') return dist(hunter, d) / (T.WALK * K.URGENT_CARRY);
      const awake = f.members.filter((m) => !m.dead && !m.hidden && !m.asleep && m.age >= 4);
      const find = phase === 'placed' && !awake.some((m) => dist(m, a) < T.SIGHT_DAY) ? 1 / K.FIND_RATE : 0;
      const jog = Math.max(0, dist(hunter, a) - K.THROW_DEER) / (T.RUN * K.URGENT_TRACK);
      return find + jog + 1.05 / K.HIT_PLACED + K.BUTCHER_S * K.URGENT_BUTCHER + carry;
    }
    function reachOf(f, a) {
      const name = f ? P().famLabel(f) : 'they';
      if (!f || f.state !== 'settled' || !doorOf(f)) return { ok: false, code: 'home', why: `${R.cap1(name)} has no home to carry it to.` };
      if (!a || a.dead || a.species !== 'deer') return { ok: false, code: 'gone', why: 'The deer is gone.' };
      if (!hungry(f)) return { ok: false, code: 'fed', why: `${R.cap1(name)} is not short of food yet, so they let it graze: a house goes after game only once its store runs low.` };
      const at = doorOf(f), steps = Math.round(dist(a, at)), d = dist(a, at) - 6;
      const reach = (fresh(a) ? K.NOTICE_R : K.NOTICE_WILD) + 6;
      if (d > (fresh(a) ? K.NOTICE_R : K.NOTICE_WILD)) return { ok: false, code: 'far', steps, reach, why: `Too far: ${name} cannot reach this deer. They look for game within about ${reach} steps of their door, and it stands ${steps} steps away.` };
      if (ctx.edgeClear(a.x, a.z) < 0.6) return { ok: false, code: 'mist', steps, why: `It stands in the mist at the edge of the world, where ${name} will not go.` };
      const able = ableOf(f);
      if (!able.length) return { ok: false, code: 'able', steps, why: `Nobody in ${name} is able to hunt: the deer will graze.` };
      if (P().isNight()) return { ok: false, code: 'night', steps, why: `It is night and ${name} is asleep. They look for it at first light, if it is still near.` };
      if (S.dayT > K.URGENT_LATE && d > 18) return { ok: false, code: 'late', steps, why: `It is late in the day: ${name} only goes after game within about 24 steps of their door now, and this deer is ${steps} steps away. Tomorrow, if it is still near.` };
      const hunter = able.slice().sort((m1, m2) => (m1.stage === 'adult' ? 0 : 50) + dist(m1, a) - ((m2.stage === 'adult' ? 0 : 50) + dist(m2, a)))[0];
      // what the meat adds: the store holds only so much (people.js caps it), the rest spoils
      const need = Math.max(0.01, P().needOf(f)), room = Math.max(0, need * R.value('store', f, T.STORE_MAX_YEARS) - Math.max(0, f.food));
      return { ok: true, code: 'ok', steps, hunter, hit: Math.min(0.97, K.HIT_PLACED * (R.ask('huntSkill', hunter) ?? 1)), years: Math.max(1, Math.round(Math.min(K.MEAT_DEER, room) / need / T.LIFE_RATE)),
        secs: etaOf(f, a, hunter), why: '' };
    }
    R.answer('deerReach', (f, a) => reachOf(f, a));
    // deerComing(family): meat from a deer the god put down on its way to this hungry house: a hunt of theirs after it
    // (or carrying it home), or such a deer within their reach that their watch will see or find. { deer, hunter,
    // how ('placed' | 'hunting' | 'carrying'), secs (game seconds until it is home), life (the same in life years) },
    // or null. Only the god's deer count: wild game is the ordinary run of hunting, and foresight already reads it.
    R.answer('deerComing', (f) => {
      if (!f || f.state !== 'settled') return null;
      for (const [q, h] of hunts) {
        if (q.family !== f || h.role !== 'lead' || !h.urgent || h.kind !== 'deer' || h.phase === 'empty') continue;
        if (h.load === 'deer') { const s = etaOf(f, q, q, 'carrying'); return { deer: null, hunter: q, how: 'carrying', secs: s, life: toLife(s) }; }
        if (h.prey && !h.prey.dead && h.prey.placed) { const s = etaOf(f, h.prey, q, 'hunting'); return { deer: h.prey, hunter: q, how: 'hunting', secs: s, life: toLife(s) }; }
        if (h.phase === 'butcher') { const s = etaOf(f, q, q, 'hunting'); return { deer: null, hunter: q, how: 'hunting', secs: s, life: toLife(s) }; }
      }
      const busy = taken();
      let best = null;
      for (const a of S.animals) {
        if (a.species !== 'deer' || a.dead || !a.placed || !fresh(a) || busy.has(a)) continue;
        const r = reachOf(f, a);
        if (r.ok && (!best || r.secs < best.secs)) best = { deer: a, hunter: r.hunter, how: 'placed', secs: r.secs, life: toLife(r.secs) };
      }
      return best;
    });
    // testing: send this grown-up hunting now (sim.ask('huntNow', person)), whatever the odds
    R.answer('huntNow', (p) => { if (!isAdult(p) || hunts.has(p) || !p.family.home) return false; p.go = null; p.work = null; return startHunt(p); });
    void yearLabel; void he;
  },
};
