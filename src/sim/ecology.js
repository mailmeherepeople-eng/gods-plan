// Everything has a use (DESIGN.md "The heart of the game: choices that matter"; docs/CHOICES.md).
// Each bad thing holds something up, so removing it costs something real, later, and traceably, and letting it
// run brings something real. All of it is carried out here by the simulation, never a tally of debt:
//   wolves     keep the deer and rabbits down (they take the weak first); without them the grazers multiply,
//              strip the fields and the wild food (the `yield` stat), bare the ground round the herds, and a
//              crowded herd sickens (and the sickness can pass to people). Too many wolves go hungry and turn
//              to people. Wolves follow the deer: a hands-off land settles into a balance.
//   fire       ash makes the fields it touched rich for years; a forest that never burns grows dense and then
//              burns far worse (hardship-fire.js asks S.eco.fuelMul for trees).
//   flood      silt makes the flooded fields rich for years, and the water brings fish and reeds; fields that are
//              never renewed slowly wear out.
//   sickness   survivors who came through it unaided are immune to that sickness for life and their children are
//              hardier; healed people never fought it; a people never exposed is hit far harder; newcomers bring it.
//   lean years a lean time come through unaided pushes toward the next discovery, teaches them to store more,
//              and may send a young household off to find land of its own (fewer mouths for those who stay).
//   old age    an old parent in the house holds the grown young back (they think slower); the death passes on
//              the hut, the field and the place at the fire.
//   feuds      a fight forges its survivors (hardship:survived kind 'feud') and weapons craft (a push toward the
//              next discovery), settles who leads, and sometimes ends in a promised marriage that cools the feud.
// Every number is in TUNE_ECOLOGY (sim.tune('ecology')). Query `ecology()`; the timeline `ecologyLog()`.
import { yearLabel, number, cap, pick, range } from './words.js';
import { B } from '../world/blocks.js';
import { RES } from './land.js';
let hardshipApi = () => null;
try { ({ hardshipApi } = await import('./hardship.js')); } catch { /* no hardships: fewer uses */ }

export const TUNE_ECOLOGY = {
  // ---- grazers (these replace T.DEER_BIRTH, T.DEER_MAX and T.DEER_RAID_AT while the ecology runs) ----
  DEER_BIRTH: 0.24,       // fawns per deer per life year, times the room left under DEER_CAP
  DEER_CAP: 58,           // what the wild browse can hold at most
  RAID_AT: 30,            // deer over this many: the extra ones go for the fields (visible raids)
  RABBIT_VALUE: 0.2,      // a rabbit is this much of a deer, to a wolf and to the browse
  BROWSE_OK: 26,          // grazers (deer + rabbits x RABBIT_VALUE) the land feeds without harm ...
  BROWSE_FULL: 52,        // ... and from this many the fields and wild food lose BROWSE_FIELD
  BROWSE_FIELD: 0.5,      // the share of the food fields and gathering give that grazers eat at full browse
  BROWSE_LUSH: 1.4,       // fields watered by the god's rain (still green) draw the grazers: this much more is eaten there
  STRIP_AT: 0.25,         // browse this high bares the ground round the herds (real blocks), a few cells a year
  STRIP_CELLS: 3,         // cells bared a year per herd ...
  STRIP_MAX: 240,         // ... and no more than this bare at once
  HERD_CROWD: 44,         // deer over this many: a crowded herd may sicken ...
  MURRAIN: 0.07,          // ... with this chance a calendar year
  MURRAIN_KILL: [0.35, 0.6], // the share of the deer it kills
  MURRAIN_PEOPLE: 0.45,   // chance it passes to people (a sickness among the families)
  // ---- wolves ----
  WOLF_DEER: 1.6,         // deer a wolf takes a life year at most (the old and the young first) ...
  WOLF_HALF: 8,           // ... half that when there are this many deer
  WOLF_RABBITS: 1,        // rabbits a wolf takes a life year at most ...
  WOLF_HALF_R: 8,         // ... half that at this many rabbits
  WOLF_NEED: 1,           // deer a life year a wolf needs to be fed (a rabbit is RABBIT_VALUE of one)
  PREY_PER_WOLF: 8,       // the land keeps a wolf for each this many grazers (deer + rabbits x RABBIT_VALUE)
  WOLF_MAX: 6,
  WOLF_ARRIVE: 0.1,       // no wolves and enough grazers for one: a wolf comes out of the mist with this chance a year
  WOLF_FIRST: 5,          // calendar years after the start before the first
  WOLF_PUP: 0.5,          // fed, and room for more: a pup grows up with this chance a life year
  WOLF_LEAVE: 0.35,       // hungry, or more than the land keeps: one leaves with this chance a life year
  WOLF_START: 2,          // resident wolves in the wilds when time starts (a land has its wolves)
  WOLF_LIFE: [10, 18],     // life years
  HUNGRY_AT: 0.75,        // fed below this share, a wolf turns to people ...
  HUNGRY_HUNT: 0.6,       // ... with this chance a life year (anyone at the edge)
  WEAK_HUNT: 0.05,        // a fed wolf goes for a weak person (a child, an elder, the sick or hurt) this often
  HUNT_MOOD: 2,           // life years such a mood lasts if no hunt comes of it
  DEN_FROM_HOMES: 40,     // a den lies at least this far from any home
  // ---- the ground: fire, flood, wear ----
  FIELD_WEAR: 0.002,      // a farmed field loses this much richness a life year ...
  FIELD_FLOOR: 0.9,       // ... down to this
  ASH_RICH: 0.25,         // a field the fire burned grows back this much richer
  SILT_RICH: 0.3,         // a field the flood covered is this much richer when the water falls
  RICH_CAP: 1.35,
  FISH: 1.15, FISH_YEARS: 20, FISH_R: 30, // families whose home is this close to a flood's water: this much more food (fish, reeds), for life years
  OVERGROWN_FROM: 80,     // calendar years without a fire before woods grow dense ...
  OVERGROWN_SPAN: 120,    // ... reaching OVERGROWN_FUEL after this many more
  OVERGROWN_FUEL: 1.9,    // how much better a dense old wood burns
  CELL: 10,               // the ground is remembered in squares of this many blocks
  // ---- sickness ----
  NEWCOMER_SICK: 0.1,     // chance a family settling after START_AFTER brings a sickness with them
  HARDY: 0.7,             // the sickness stat of a child of someone who came through one unaided
  UNEXPOSED: 1.35,        // ... of anyone neither immune nor hardy, while under UNEXPOSED_SHARE of the grown-ups have come through one
  UNEXPOSED_SHARE: 0.25,
  HEALED_COVER: 3,        // life years a healed person cannot catch it again (the body never fought it; unaided: for life)
  // ---- lean years ----
  LEAN_PUSH: 0.06,        // share of the next discovery a household's lean time come through unaided adds (once per hardship)
  LEAN_STORE: 1.25, LEAN_STORE_YEARS: 30, // they keep this much more in store for this many life years ...
  LEAN_YIELD: 1.15,       // ... and tend their fields this much better (they learned to break new ground and work it hard)
  BUD_CHANCE: 0.3,        // a lean time ending in a crowded village: a young household goes off to find land of its own
  BUD_CROWD: 3.2,         // mouths per field that counts as crowded
  // ---- old age ----
  ELDER_HOLD_AGE: 58,     // an old parent this old in the house ...
  ELDER_HOLD_THINK: 0.75, // ... holds the grown young back: they think at this share
  // ---- feuds ----
  FEUD_PUSH: 0.06,        // share of the next discovery a fight with deaths adds (weapons craft)
  FEUD_BIND: 0.25,        // chance a fight with deaths ends in a promised marriage ...
  FEUD_BIND_COOL: 0.7,    // ... that cools the grudge both ways by this share
};
const E = TUNE_ECOLOGY;

export default {
  id: 'ecology',
  tune: TUNE_ECOLOGY,
  init(R) {
    const { S } = R;
    const T = R.T;
    const H = () => hardshipApi();
    const rand = Math.random;
    const LR = () => T.LIFE_RATE;
    const alive = (p) => p && !p.dead;
    const live = (sp) => S.animals.filter((a) => a.species === sp && !a.dead);
    const homes = () => S.buildings.filter((b) => (b.kind === 'hut' || b.kind === 'cave') && b.family);
    const yl = yearLabel;
    const he = (p) => (p.sex === 'f' ? 'she' : 'he');
    const his = (p) => (p.sex === 'f' ? 'her' : 'his');
    const yrs = (n) => { n = Math.max(1, Math.round(n)); return `${number(n)} ${n === 1 ? 'year' : 'years'}`; };
    const mid = (b) => ({ x: b.mx ?? b.cx ?? b.x, z: b.mz ?? b.cz ?? b.z });

    // ---------- the book of what happened, so alerts can name the cause ----------
    const K = { lastWolf: null, noWolfSince: null, wolvesStruck: 0, arrivals: 0, pups: 0, left: 0, wolfDeer: 0, wolfRabbits: 0,
      murrains: 0, murrainDeer: 0, murrainPeople: 0, ashFields: 0, siltFields: 0, fishFamilies: 0, immune: 0, healedNoImmune: 0,
      newcomerSick: 0, leanPush: 0, leanStore: 0, buds: 0, inherits: 0, feudForged: 0, feudPush: 0, bound: 0, browseAlerts: 0, strippedCells: 0,
      bigFires: 0, peakDeer: 0 };
    const timeline = []; // { year, deer, rabbits, wolves, browse, harvest, pop }
    let arrivalRolled = false;
    let owed = 0, owedR = 0, visibleRabbits = 0, visibleKills = 0, browse = 0, harvest = 0, browseSaid = -1e9, lastBrowseFam = null;
    const myKills = new WeakSet();

    // ---------- the shared state animals.js and hardship-fire.js read (cheap, every frame) ----------
    const eco = S.eco = {
      deerBirth: E.DEER_BIRTH, deerCap: E.DEER_CAP, raidAt: E.RAID_AT,
      ownsWolves: true,
      // a resident wolf goes for a person only in a hungry mood, or for the weak in a weak mood
      guards: [], // hedged villages (turning.js, the wall): { x, z, r }
      mayHunt(a, p) { if (!a.resident) return true; for (const g of eco.guards) if (Math.hypot(p.x - g.x, p.z - g.z) < g.r) return false; if (a.manHunt) return true; if (a.weakHunt) return weak(p); return false; },
      denOf(a) { const d = a.den ?? (a.den = denSpot(a)); return d ? { x: d.x + (rand() - 0.5) * 16, z: d.z + (rand() - 0.5) * 16 } : null; },
      fuelMul: (x, z) => fuelMul(x, z),
    };
    const weak = (p) => p.stage !== 'adult' || !!p.ext?.hardship?.sick || !!p.ext?.hardship?.wound;

    // ================= wolves =================
    const wolves = () => S.predators.filter((w) => !w.dead && !w.gone);
    const residents = () => wolves().filter((w) => w.resident);
    function denSpot(near) {
      const hs = homes();
      const herds = S.herds.filter((h) => h.members.some((m) => !m.dead));
      for (let k = 0; k < 40; k++) {
        const base = herds.length && k < 25 ? pick(herds) : near ?? { x: S.stone.centre.x, z: S.stone.centre.z };
        const x = base.x + (rand() - 0.5) * 60, z = base.z + (rand() - 0.5) * 60;
        const fx = Math.floor(x), fz = Math.floor(z);
        if (!S.land.inside(fx, fz) || R.ctx.edgeClear(x, z) < 0.7 || !S.land.passable(fx, fz, 'pred')) continue;
        if (hs.some((b) => Math.hypot(b.cx - x, b.cz - z) < E.DEN_FROM_HOMES)) continue;
        return { x: fx + 0.5, z: fz + 0.5 };
      }
      return null;
    }
    function makeResident(w, age) {
      w.resident = true; w.placed = false;
      w.age = age ?? range([1, 4]); w.wlife = range(E.WOLF_LIFE);
      w.den = denSpot(w);
      w.doing = 'prowling';
      return w;
    }
    function arrive() {
      const w = S.animalsApi.spawnWolf({ quiet: true });
      if (!w) return null;
      makeResident(w);
      K.arrivals++;
      const deer = live('deer').length;
      R.alert('warn', `A wolf has come out of the mist in the ${w.side}, following the deer (${number(deer)} of them now). It will hunt deer and rabbits, and now and then a weak person alone at the edge.`, { x: w.x, z: w.z, subject: w,
        aside: R.aside('eco:wolf', ['Every land gets the wolves its deer deserve.', 'The deer will not thank it.']) });
      return w;
    }
    function pup(parent) {
      const r = S.animalsApi.spawnAnimal('wolf', parent.x + 1, parent.z + 1);
      const w = r?.entity;
      if (!w) return null;
      makeResident(w, 0.5);
      w.den = parent.den;
      K.pups++;
      return w;
    }
    // what one wolf takes a life year, and how well fed that leaves it
    function rates(D, Rb) {
      const deer = E.WOLF_DEER * D / (D + E.WOLF_HALF), rabbits = E.WOLF_RABBITS * Rb / (Rb + E.WOLF_HALF_R);
      const food = deer + E.RABBIT_VALUE * rabbits;
      return { deer, rabbits, food, fed: food / E.WOLF_NEED };
    }
    eco.rates = rates;
    // the wolves' year: what they eat, who is hungry, pups, leaving, old age
    function wolfYear(dl) {
      const deer = live('deer'), rabbits = live('rabbit');
      const P = deer.length + E.RABBIT_VALUE * rabbits.length;
      const W = residents();
      const R0 = rates(deer.length, rabbits.length);
      const per = R0.food, fed = R0.fed;
      // what the pack takes: kills seen on the map count, the rest are taken out of sight (found as carcasses)
      owed += W.length * R0.deer * dl - visibleKills;
      owedR += W.length * R0.rabbits * dl - visibleRabbits;
      visibleKills = 0; visibleRabbits = 0;
      const take = (list, isDeer) => {
        // the weak first: the oldest for their years, or the very young
        let best = null, bs = -1;
        // (one walking out by the mist is not taken out of sight: animals.js)
        for (const a of list) { if (a.leaving) continue; const sc = a.age / Math.max(1, a.lifespan) + (a.age < 1 ? 0.6 : 0) + rand() * 0.2; if (sc > bs) { bs = sc; best = a; } }
        if (!best) return false;
        list.splice(list.indexOf(best), 1);
        myKills.add(best);
        S.animalsApi.kill(best, 'wolf');
        best.keepBody = 8;
        if (isDeer) K.wolfDeer++; else K.wolfRabbits++;
        return true;
      };
      for (let n = 0; owed >= 1 && n < 6 && take(deer, true); n++) owed -= 1;
      for (let n = 0; owedR >= 1 && n < 6 && take(rabbits, false); n++) owedR -= 1;
      owedR = Math.max(-1, Math.min(owedR, 3));
      owed = Math.max(-1, Math.min(owed, 3));
      // moods, age
      for (const w of W) {
        if (w.prey?.kind === 'person') { w.manHunt = false; w.weakHunt = false; }
        if ((w.huntUntil ?? 0) < S.life) { w.manHunt = false; w.weakHunt = false; }
        if (!w.manHunt && !w.weakHunt) {
          if (fed < E.HUNGRY_AT && rand() < E.HUNGRY_HUNT * dl) { w.manHunt = true; w.huntUntil = S.life + E.HUNT_MOOD; }
          else if (rand() < E.WEAK_HUNT * dl) { w.weakHunt = true; w.huntUntil = S.life + E.HUNT_MOOD; }
        }
        w.age += dl;
        if (w.age > w.wlife) S.animalsApi.kill(w, 'old age');
        else if (rand() < 0.1) w.den = denSpot(w) ?? w.den; // the den follows the herds
      }
      const want = Math.min(E.WOLF_MAX, Math.floor(P / E.PREY_PER_WOLF));
      const run = S.year - S.startYear;
      const left = residents();
      if (!left.length) {
        // the next wolf's coming is rolled ahead (so foresight's "A wolf is coming" is exact): S.predNext
        if (run >= E.WOLF_FIRST && want >= 1) {
          if (!arrivalRolled) { arrivalRolled = true; S.predNext = S.year + Math.max(1, Math.round(-Math.log(1 - rand()) / E.WOLF_ARRIVE)); }
          if (S.year >= S.predNext) { arrivalRolled = false; arrive(); }
        } else { arrivalRolled = false; S.predNext = null; }
      } else if (left.length < want && fed >= 0.9 && rand() < E.WOLF_PUP * dl * left.length) pup(pick(left));
      // an old wolf's place is taken by a pup before it dies, while the pack is fed
      else if (left.length <= want && fed >= 0.9 && left.some((w) => w.wlife - w.age < 2) && rand() < E.WOLF_PUP * dl) pup(pick(left));
      else if ((left.length > Math.max(1, want) || fed < 0.5) && rand() < E.WOLF_LEAVE * dl) {
        const w = pick(left);
        w.resident = false; w.state = 'leave'; w.path = null; K.left++;
      }
      // the book: since when the land has had no wolves
      if (residents().length) { K.lastWolf = S.year; K.noWolfSince = null; } else if (K.noWolfSince == null && K.lastWolf != null) K.noWolfSince = S.year;
      return { P, fed, per, deerPer: R0.deer };
    }

    // ================= grazers: browse, bare ground, the crowded herd =================
    const stripped = []; // { x, z, y, was, year }
    // a family whose fields the god's rain has watered lately (powers-nature.js keeps it as a timed yield modifier)
    const lush = (f) => { if (!f?.members) return false; const k = `nature:bless:${f.id}`; return R.mods('yield').some((m) => m.key === k && (m.until == null || m.until > S.life)); };
    function noWolvesWords() {
      if (K.noWolfSince == null) return K.lastWolf == null ? 'There have never been wolves here to thin them.' : '';
      const n = Math.round(S.year - K.noWolfSince);
      const you = K.lastWolfCause === 'strike';
      return n >= 10 ? `The deer have had no wolves for ${n} years${you ? ' (you struck the last one down)' : ''}.` : `The last wolf is gone${you ? ' (you struck it down)' : ''}.`;
    }
    function grazeYear(dl) {
      const deer = live('deer'), rabbits = live('rabbit');
      K.peakDeer = Math.max(K.peakDeer, deer.length);
      const G = deer.length + E.RABBIT_VALUE * rabbits.length;
      browse = Math.max(0, Math.min(1, (G - E.BROWSE_OK) / (E.BROWSE_FULL - E.BROWSE_OK)));
      if (browse > 0.02) {
        R.mod('yield', 'eco:browse', { mul: 1 - E.BROWSE_FIELD * browse, who: (f) => !lush(f), note: `${number(deer.length)} deer and ${number(rabbits.length)} rabbits eat the crops` });
        // fields your rain greened draw the herds first
        R.mod('yield', 'eco:browse-lush', { mul: 1 - Math.min(0.65, E.BROWSE_FIELD * browse * E.BROWSE_LUSH), who: lush, note: `the green of the watered fields draws the ${number(deer.length)} deer` });
      } else { R.unmod('yield', 'eco:browse'); R.unmod('yield', 'eco:browse-lush'); }
      // an alert that names the cause, at most once in 25 years
      if (browse >= 0.3 && S.year - browseSaid >= 25) {
        browseSaid = S.year; K.browseAlerts++;
        const fams = S.families.filter((f) => f.state === 'settled' && f.fields.some((fl) => fl.done));
        let f = null, bd = 1e9;
        for (const x of fams) { const m = mid(x.fields[0]); for (const h of S.herds) { const d = Math.hypot(h.x - m.x, h.z - m.z); if (d < bd && x !== lastBrowseFam) { bd = d; f = x; } } }
        lastBrowseFam = f;
        const lost = Math.round(E.BROWSE_FIELD * browse * 100);
        R.alert('bad', `${noWolvesWords()} ${number(deer.length)} deer graze the land now${f ? `, and they ate the ${f.name} family's field to the ground` : ''}. Every family loses about ${lost} in a hundred of its food to them.`, { x: f ? mid(f.fields[0]).x : null, z: f ? mid(f.fields[0]).z : null, subject: f?.leader?.() ?? null,
          aside: R.aside('eco:browse', ['The deer are very grateful. They have said so with their mouths.', 'Nobody ever thanks the wolf.']) });
      }
      // the ground round the herds goes bare (real blocks), and comes back when they are few
      if (browse >= E.STRIP_AT && stripped.length < E.STRIP_MAX) {
        for (const h of S.herds) for (let k = 0; k < E.STRIP_CELLS; k++) {
          const x = Math.floor(h.x + (rand() - 0.5) * 24), z = Math.floor(h.z + (rand() - 0.5) * 24);
          if (!S.land.inside(x, z)) continue;
          const i = S.land.ci(x, z);
          if (S.land.res[i] !== RES.NONE || S.land.wet[i] || S.land.tree[i]) continue;
          const y = S.land.top[i], g = R.ctx.world.get(x, y, z), up = R.ctx.world.get(x, y + 1, z);
          if (up === B.BUSH) { S.build.put(x, y + 1, z, B.BUSH_BARE, null); stripped.push({ x, z, y: y + 1, was: B.BUSH, now: B.BUSH_BARE, year: S.year }); }
          else if (g === B.GRASS && up === B.AIR) { S.build.put(x, y, z, B.DIRT, null); stripped.push({ x, z, y, was: B.GRASS, now: B.DIRT, year: S.year }); }
          else continue;
          S.land.scanColumn(x, z); K.strippedCells++;
        }
      } else if (browse < 0.1 && stripped.length) {
        for (let k = 0; k < 8 && stripped.length; k++) {
          const s = stripped.shift();
          if (R.ctx.world.get(s.x, s.y, s.z) === s.now) { S.build.put(s.x, s.y, s.z, s.was, null); S.land.scanColumn(s.x, s.z); }
        }
      }
      // a crowded herd sickens
      if (deer.length > E.HERD_CROWD && rand() < E.MURRAIN) {
        const k = range(E.MURRAIN_KILL);
        const dead = deer.filter(() => rand() < k);
        for (const a of dead) { S.animalsApi.kill(a, 'sickness'); a.keepBody = 10; }
        K.murrains++; K.murrainDeer += dead.length;
        let toPeople = null;
        if (rand() < E.MURRAIN_PEOPLE && H()) {
          const near = S.families.filter((f) => f.state === 'settled' && f.home && S.herds.some((h) => Math.hypot(h.x - f.home.cx, h.z - f.home.cz) < 50));
          if (near.length && !H().active('sickness').length) { toPeople = H().sick.start({ families: near.slice(0, 3) }); if (toPeople) { toPeople.after = 'herd'; K.murrainPeople++; } }
        }
        const h0 = S.herds[0];
        R.alert('bad', `${noWolvesWords()} The herds grew too crowded and sickened: ${number(dead.length)} deer died.${toPeople ? ` The sickness passed to people: ${toPeople.first?.name ?? 'someone'} of the ${toPeople.first?.family?.name ?? ''} family is the first.` : ''}`, { x: h0?.x, z: h0?.z });
      }
    }

    // ================= the ground: fire, flood, wear =================
    const fert = new Map(); // field -> richness (1 is plain)
    const fertOf = (fl) => fert.get(fl) ?? 1;
    const lastBurn = new Map(); // coarse cell -> calendar year of the last fire there
    const cellOf = (x, z) => Math.floor(x / E.CELL) * 1000 + Math.floor(z / E.CELL);
    function fuelMul(x, z) {
      const y0 = lastBurn.get(cellOf(x, z)) ?? S.startYear;
      const age = S.year - y0 - E.OVERGROWN_FROM;
      return age <= 0 ? 1 : 1 + (E.OVERGROWN_FUEL - 1) * Math.min(1, age / E.OVERGROWN_SPAN);
    }
    eco.overgrownAt = (x, z) => fuelMul(x, z) > 1.3;
    const fish = new Map(); // family -> life time
    function soilYear(dl) {
      for (const f of S.families) {
        if (f.state !== 'settled') continue;
        let sum = 0, n = 0;
        for (const fl of f.fields) {
          if (!fl.done) continue;
          const v = Math.max(E.FIELD_FLOOR, Math.min(E.RICH_CAP, fertOf(fl) - E.FIELD_WEAR * dl * (fertOf(fl) > 1 ? 3 : 1)));
          fert.set(fl, v); sum += v; n++;
        }
        let mul = n ? sum / n : 1;
        if ((fish.get(f) ?? -1) > S.life) mul *= E.FISH;
        if (Math.abs(mul - 1) > 0.01) R.mod('yield', `eco:soil:${f.id}`, { mul, who: f, note: mul > 1 ? 'rich ground (ash, silt or fish)' : 'worn fields' });
        else R.unmod('yield', `eco:soil:${f.id}`);
      }
      // the harvest this year, per settled person (the yardstick of the four gods)
      let food = 0, people = 0;
      for (const f of S.families) if (f.state === 'settled') { people += f.members.length; for (const fl of f.fields) if (fl.done) food += R.value('yield', f, T.FIELD_YIELD * fl.care); }
      harvest = people ? food / people : 0;
    }
    R.on('hardship:end', (e) => {
      const h = H()?.get(e.id);
      if (!h) return;
      if (e.kind === 'fire') {
        // the woods it burned are young again; the fields it burned grow back richer
        for (const i of h.burned ?? []) lastBurn.set(cellOf(S.land.cx(i), S.land.cz(i)), S.year);
        const fams = new Map();
        for (const fl of S.buildings) if (fl.kind === 'field' && fl.done && fl.family && h.burned?.has(S.land.ci(Math.floor(mid(fl).x), Math.floor(mid(fl).z)))) {
          fert.set(fl, Math.min(E.RICH_CAP, fertOf(fl) + E.ASH_RICH)); K.ashFields++; fams.set(fl.family, (fams.get(fl.family) ?? 0) + 1);
        }
        if ((h.count ?? 0) > 300) K.bigFires++;
        if (fams.size) {
          const names = [...fams.keys()].map((f) => f.name);
          R.alert('good', `The ash of the fire of ${yl(h.startYear)} has made ${names.length === 1 ? `the ${names[0]} family's field` : `the fields of the ${names.join(' and ')} families`} rich: about ${Math.round(E.ASH_RICH * 100)} more in a hundred for years.`, { x: h.x, z: h.z });
          for (const f of fams.keys()) for (const m of f.members) R.story(m, `The fire of ${yl(h.startYear)} left ash on the family's field. It grows richer now.`);
        }
      } else if (e.kind === 'flood') {
        const fl0 = [...(h.plan?.fields?.keys() ?? [])].filter((fl) => S.buildings.includes(fl) && fl.done && fl.family);
        for (const fl of fl0) { fert.set(fl, Math.min(E.RICH_CAP, fertOf(fl) + E.SILT_RICH)); K.siltFields++; }
        const near = S.families.filter((f) => f.state === 'settled' && f.home && Math.hypot(f.home.cx - h.x, f.home.cz - h.z) < E.FISH_R);
        for (const f of near) { fish.set(f, S.life + E.FISH_YEARS); K.fishFamilies++; }
        const sf = [...new Set(fl0.map((fl) => fl.family.name))];
        if (sf.length || near.length) R.alert('good', `The flood of ${yl(h.startYear)} has gone down and left its silt: ${sf.length ? `${sf.length === 1 ? `the ${sf[0]} family's fields are` : `the fields of the ${sf.join(' and ')} families are`} richer for years` : 'the low ground is richer'}${near.length ? `, and ${number(near.length)} ${near.length === 1 ? 'family eats' : 'families eat'} fish and reeds from the water` : ''}.`, { x: h.x, z: h.z });
      }
    });

    // ================= sickness: immunity, hardiness, newcomers =================
    const sd = (p) => R.data(p, 'eco', () => ({}));
    R.answer('immuneTo', (p, kind) => !!p?.ext?.eco?.immune?.[kind]);
    // a recovery (hardship-sick.js signals it): unaided, immune to that sickness for life; healed, only a short cover
    R.on('sickness:recovered', ({ person: p, kind, how }) => {
      if (!p || p.dead) return;
      if (how === 'healed') {
        const d = p.ext?.hardship;
        if (d) d.immuneUntil = S.life + E.HEALED_COVER;
        K.healedNoImmune++;
        return;
      }
      const d = sd(p);
      (d.immune ?? (d.immune = {}))[kind] = true;
      K.immune++;
    });
    const exposed = (p) => !!p.ext?.eco?.immune && Object.keys(p.ext.eco.immune).length > 0;
    const hardy = (p) => [p.mother, p.father].some((q) => q && exposed(q));
    let unexposedPeople = true;
    R.mod('sickness', 'eco:hardy', { mul: E.HARDY, who: (p) => p?.kind === 'person' && !exposed(p) && hardy(p), note: 'a parent came through a sickness' });
    R.mod('sickness', 'eco:unexposed', { mul: E.UNEXPOSED, who: (p) => unexposedPeople && p?.kind === 'person' && !exposed(p) && !hardy(p), note: 'a people never touched by sickness' });
    function sickYear() {
      const grown = S.people.filter((p) => alive(p) && p.family.state === 'settled' && p.stage !== 'child');
      unexposedPeople = grown.length > 0 && grown.filter(exposed).length / grown.length < E.UNEXPOSED_SHARE;
    }
    R.on('family:settle', (f) => {
      if (!H() || S.year - S.startYear < (H().T.START_AFTER ?? 30) || rand() >= E.NEWCOMER_SICK) return;
      const p = f.members.find(alive);
      if (!p) return;
      setTimeout0(() => {
        if (!alive(p) || H().active('sickness').length) return;
        const h = H().sick.start({ person: p });
        if (h) { h.after = 'newcomers'; K.newcomerSick++; R.alert('warn', `The ${f.name} family brought ${h.label} with them from beyond the mist.${unexposedPeople ? ' Few here have ever had a sickness: it will go hard with them.' : ''}`, { x: p.x, z: p.z, subject: p }); }
      });
    });
    // later in the same step (settling is inside the family tick)
    const later = [];
    const setTimeout0 = (fn) => later.push(fn);
    R.on('step', () => { while (later.length) { try { later.shift()(); } catch (err) { console.warn('ecology: deferred', err); } } });

    // ================= lean years =================
    R.on('hardship:end', (e) => {
      if (e.kind !== 'hunger' && e.kind !== 'drought') return;
      const h = H()?.get(e.id);
      if (!h || h.aidedAll) return;
      const fams = [...h.families].filter((f) => S.families.includes(f) && f.state === 'settled' && !h.aided.has(f));
      for (const f of fams) {
        const lead = f.members.filter(alive).filter((m) => m.stage !== 'child').sort((a, b) => b.age - a.age)[0];
        if (!lead) continue;
        R.ask('thinkPush', lead, E.LEAN_PUSH);
        K.leanPush++;
        R.mod('store', `eco:lean:${f.id}`, { mul: E.LEAN_STORE, who: f, until: S.life + E.LEAN_STORE_YEARS, note: `they learned to keep more after the lean years of ${yl(h.startYear)}` });
        R.mod('yield', `eco:lean:${f.id}`, { mul: E.LEAN_YIELD, who: f, until: S.life + E.LEAN_STORE_YEARS, note: `they learned to work the ground harder after the lean years of ${yl(h.startYear)}` });
        K.leanStore++;
        R.story(lead, `The lean years of ${yl(h.startYear)} taught ${his(lead) === 'her' ? 'her' : 'him'} to keep more back, and to think harder about food.`);
      }
      if (fams.length) R.alert('info', `The ${fams.length === 1 ? `${fams[0].name} family` : `${number(fams.length)} families`} came through the lean years of ${yl(h.startYear)} with no help from above. They store more, work their fields harder, and think harder about food.`, { x: h.x, z: h.z });
      // a crowded village sends a young household off to find land of its own
      const settled = S.families.filter((f) => f.state === 'settled');
      const mouths = settled.reduce((s, f) => s + f.members.length, 0), fields = settled.reduce((s, f) => s + f.fields.filter((fl) => fl.done).length, 0);
      if (fields && mouths / fields > E.BUD_CROWD && rand() < E.BUD_CHANCE) {
        const young = settled.filter((f) => f.members.length === 2 && f.members.every((m) => alive(m) && m.stage === 'adult' && m.age < 32) && f.members[0].partner === f.members[1]);
        const f = young[0];
        if (f) {
          K.buds++;
          S.peopleApi.leave(f, `after the lean years of ${yl(h.startYear)} they went to find land of their own, so there would be more to go round for those who stayed`, 'info');
        }
      }
    });

    // ================= old age: the young held back, and what the death passes on =================
    const holdsBack = (p) => p?.kind === 'person' && p.stage === 'adult' && p.age < 40 && p.family?.members.some((m) => m !== p && !m.dead && m.stage === 'elder' && m.age >= E.ELDER_HOLD_AGE && (m === p.mother || m === p.father));
    R.mod('think', 'eco:elder', { mul: E.ELDER_HOLD_THINK, who: holdsBack, note: 'an old parent in the house: they defer to the old ways' });
    eco.heldBackBy = (elder) => elder.family.members.filter((m) => !m.dead && m !== elder && m.stage === 'adult' && m.age < 40 && (m.mother === elder || m.father === elder));
    R.on('person:death', (p, cause) => {
      if (cause !== 'old age') return;
      const heirs = p.family.members.filter((m) => !m.dead && m !== p && m.stage !== 'child');
      const heir = heirs.find((m) => m.mother === p || m.father === p) ?? heirs.sort((a, b) => b.age - a.age)[0];
      if (!heir) return;
      K.inherits++;
      R.story(heir, `Took over the hut and the field when ${p.name} died of old age, and ${p.sex === 'f' ? 'her' : 'his'} place at the fire.${p.age >= E.ELDER_HOLD_AGE ? ' Thinks freely now.' : ''}`);
    });

    // ================= feuds =================
    R.on('fight:end', (e) => {
      const f = e?.fight;
      if (!f || e.calledOff || !e.deaths) return;
      const fighters = [...(f.attackers ?? []), ...(f.defenders ?? [])].filter(alive);
      for (const p of fighters) R.signal('hardship:survived', { person: p, id: `feud-${e.id}`, kind: 'feud', unaided: true });
      K.feudForged += fighters.length;
      const smith = fighters.find((p) => p.stage === 'adult');
      if (smith) { R.ask('thinkPush', smith, E.FEUD_PUSH); K.feudPush++; R.story(smith, `Came out of ${f.label ?? 'the fight'} with ideas about better spears.`); }
      const C = R.ask('clans:api');
      const lead = (e.winner === e.a ? f.attackers : f.defenders)?.find(alive);
      if (lead) R.story(lead, `After ${f.label ?? 'the fight'}, ${he(lead)} is the one the clan looks to.`);
      // sometimes it ends in a promised marriage that cools the feud
      if (C && e.a && e.b && rand() < E.FEUD_BIND) {
        const A = C.groupMembers?.(e.a) ?? [], Bm = C.groupMembers?.(e.b) ?? [];
        const x = A.find((p) => alive(p) && p.stage !== 'elder' && !p.partner && p.age >= 12 && p.age < 30);
        const y = x && Bm.find((q) => alive(q) && q.sex !== x.sex && q.stage !== 'elder' && !q.partner && q.age >= 12 && q.age < 30);
        if (x && y) {
          C.cool(e.a, e.b, null, E.FEUD_BIND_COOL); C.cool(e.b, e.a, null, E.FEUD_BIND_COOL);
          K.bound++;
          R.story(x, `Was promised to ${y.name} to end the feud.`); R.story(y, `Was promised to ${x.name} to end the feud.`);
          R.alert('good', `After ${f.label ?? 'the fight'}, the two sides promised ${x.name} and ${y.name} to each other. The feud cooled.`, { x: f.x, z: f.z, subject: x });
        }
      }
    });

    // ================= the god's acts on the balance =================
    R.on('animal:death', (a, cause) => {
      if (cause === 'wolf' && !myKills.has(a)) { if (a.species === 'deer') visibleKills++; else if (a.species === 'rabbit') visibleRabbits++; }
      if (a.species === 'wolf' && a.resident) { if (cause === 'strike') K.wolvesStruck++; K.lastWolfCause = cause; }
    });

    // ================= each year =================
    let lastRec = -1e9;
    R.on('year', () => {
      if (!S.started) return;
      const dl = LR();
      wolfYear(dl);
      grazeYear(dl);
      soilYear(dl);
      sickYear();
      if (S.year - lastRec >= 5) {
        lastRec = S.year;
        timeline.push({ year: Math.floor(S.year), deer: live('deer').length, rabbits: live('rabbit').length, wolves: residents().length, browse: Math.round(browse * 100) / 100,
          harvest: Math.round(harvest * 100) / 100, pop: S.people.filter((p) => !p.dead && p.family.state === 'settled').length });
        if (timeline.length > 400) timeline.shift();
      }
    });
    // a land has its wolves: WOLF_START live in the wilds when time starts (the director's early danger, kept: they take the weak)
    R.on('phase:start', () => {
      for (const w of wolves()) if (!w.placed) makeResident(w);
      for (let k = 0; k < E.WOLF_START; k++) {
        const d = denSpot(null);
        const r = d ? S.animalsApi.spawnAnimal('wolf', d.x, d.z) : null;
        if (r?.entity) { makeResident(r.entity); r.entity.den = d; }
      }
    });

    // ================= what the god sees =================
    // the natural course for the futures (futures.js): grazers in n calendar years at the present wolves, and
    // with k fewer. A plain model of the very rates above, so the both-futures text stays in the same numbers.
    function project(years, wolvesDelta = 0) {
      let D = live('deer').length, Rb = live('rabbit').length, W = Math.max(0, residents().length + wolvesDelta);
      const dl = LR();
      let noneYears = 0;
      for (let y = 0; y < years; y++) {
        const r = rates(D, Rb);
        const births = E.DEER_BIRTH * D * Math.max(0, 1 - D / E.DEER_CAP) * dl, old = D / 18 * dl;
        D = Math.max(0, D + births - old - W * r.deer * dl);
        if (D > E.HERD_CROWD) D -= D * E.MURRAIN * 0.45;
        Rb = Math.min(T.RABBIT_MAX, Math.max(0, Rb + 0.3 * Rb * dl * Math.max(0, 1 - Rb / T.RABBIT_MAX) * 4 - W * r.rabbits * dl));
        const want = Math.min(E.WOLF_MAX, Math.floor((D + E.RABBIT_VALUE * Rb) / E.PREY_PER_WOLF));
        // wolves come back by themselves after about 1 / WOLF_ARRIVE years unless struck again (wolvesDelta < 0: the god keeps them out)
        if (W === 0) { noneYears++; if (wolvesDelta >= 0 && want >= 1 && noneYears >= Math.round(1 / E.WOLF_ARRIVE)) { W = 1; noneYears = 0; } }
        else if (W < want && r.fed >= 0.9 && y % 6 === 5) W += 1;
        else if (W > Math.max(1, want) && y % 6 === 5) W -= 1;
      }
      const G = D + E.RABBIT_VALUE * Rb;
      return { deer: Math.round(D), rabbits: Math.round(Rb), wolves: Math.round(W), browse: Math.max(0, Math.min(1, (G - E.BROWSE_OK) / (E.BROWSE_FULL - E.BROWSE_OK))) };
    }
    eco.project = project;
    eco.browse = () => browse;
    eco.noWolvesWords = noWolvesWords;
    eco.fertOf = fertOf;
    eco.weak = weak;
    eco.hardy = hardy; eco.exposed = exposed; eco.unexposed = () => unexposedPeople;
    eco.residents = residents;
    const state = () => {
      const deer = live('deer').length, rabbits = live('rabbit').length, W = residents();
      const P = deer + E.RABBIT_VALUE * rabbits, r = rates(deer, rabbits);
      return { year: Math.floor(S.year), deer, rabbits, wolves: W.length, wolvesAll: wolves().length, browse: Math.round(browse * 100) / 100, fed: Math.round(r.fed * 100) / 100,
        balance: Math.min(E.WOLF_MAX, Math.floor(P / E.PREY_PER_WOLF)), harvest: Math.round(harvest * 100) / 100, noWolvesFor: K.noWolfSince == null ? 0 : Math.round(S.year - K.noWolfSince),
        unexposed: unexposedPeople, stripped: stripped.length, book: { ...K }, words: words() };
    };
    function words() {
      const s = [];
      const W = residents().length, deer = live('deer').length;
      s.push(W ? `${cap(number(W))} ${W === 1 ? 'wolf keeps' : 'wolves keep'} the deer at ${number(deer)}.` : `${noWolvesWords() || 'No wolves.'} ${cap(number(deer))} deer.`);
      if (browse > 0.05) s.push(`The grazers eat about ${Math.round(E.BROWSE_FIELD * browse * 100)} in a hundred of the food.`);
      if (unexposedPeople) s.push('Few here have come through a sickness: the next one will go hard.');
      return s;
    }
    R.answer('ecology', state);
    R.answer('ecologyLog', () => timeline.slice());
    R.on('stats', (st) => { st.wolves = residents().length; st.browse = Math.round(browse * 100) / 100; });
    R.on('inspect', (e, out) => {
      if (e?.species === 'wolf' && e.resident) {
        const r = rates(live('deer').length, live('rabbit').length);
        R.section(out, { id: 'eco', title: 'Its use', order: 30, lines: [
          `Takes about ${Math.round(r.deer * 10) / 10} deer and ${Math.round(r.rabbits * 10) / 10} rabbits a life year, the old and the young first. ${residents().length === 1 ? 'The only wolf here.' : `One of ${number(residents().length)}.`}`,
          e.manHunt ? 'Hungry: it will go for a person alone at the edge.' : e.weakHunt ? 'It is watching for someone weak: a child, an elder, the sick.' : 'Fed: it leaves people alone.',
        ] });
      } else if (e?.species === 'deer') {
        R.section(out, { id: 'eco', title: 'The herds', order: 30, lines: words() });
      } else if (e?.kind === 'person') {
        const d = e.ext?.eco, rows = [];
        if (d?.immune) rows.push(['Immune to', Object.keys(d.immune).map((k) => R.deathWords(k)?.replace(/^died of /, '') ?? k).join(', ')]);
        else if (hardy(e)) rows.push(['Hardy', 'a parent came through a sickness']);
        if (holdsBack(e)) rows.push(['Held back', 'defers to an old parent: thinks slower']);
        if (rows.length) R.section(out, { id: 'eco', title: 'Body and house', order: 45, rows });
      }
    });
  },
};
