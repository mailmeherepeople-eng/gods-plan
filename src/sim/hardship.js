// A. Hardships and mercy (stage 2): sickness, drought, fire, flood and hunger
// arise from the simulation, each working through families and the shared
// modifiers, each opening ONE moment only while the god could still change
// the outcome, each resolving on its own if the god does nothing, each
// visible on the map (blocks, marks on bodies, flames). Survivors who came
// through unaided learn (the `hardship:survived` signal, for agent B, and a
// line in their story). People the god saves may cause trouble later
// (hardship-trouble.js). The god's side (heal, rain, send
// sickness, fire, flood) is powers-nature.js. Owned by agent A (files
// sim/hardship*.js, sim/powers-nature*.js, god/powers-nature.js).
// The seam and every shared name: docs/STAGE2-CONTRACTS.md; rules as built: docs/HARDSHIPS.md.
import { makeFx } from './hardship-fx.js';
import { makeSick } from './hardship-sick.js';
import { makeFire } from './hardship-fire.js';
import { makeWater } from './hardship-water.js';
import { makeTrouble } from './hardship-trouble.js';
import { yearLabel, number, pick } from './words.js';

// Every number of the hardships, in one place (console: sim.tune('hardship'), sim.tune('hardship', 'KEY', v)).
// Tuned so a 500 year run with no interference on a welcoming land sees a handful of each,
// hurting but not routinely wiping the settlement out (docs/HARDSHIPS.md has the numbers measured).
export const TUNE_HARDSHIP = {
  START_AFTER: 30,        // calendar years after the start before anything arises by itself
  MOMENT_CAP: 18,         // real seconds a hardship's one moment holds time at most (integration: was 25; a sickness
                          // runs for years, so the crawl is only the notice; the seam shortens it further at 2x and 4x)
  MARKS: false,           // also tint the sick and hurt on their bodies (the screen already draws a sign over them)
  // ---- sickness (life years unless said) ----
  SICK_CHANCE: 0.011,     // chance a calendar year that one breaks out, times (settled people / 45, 0.4 to 2.5)
  SICK_MIN_PEOPLE: 8,     // not in a settlement smaller than this
  SICK_LEN: [1.5, 3],     // how long a person is sick
  SICK_DIE: 0.2,          // chance a sick grown-up dies of it, times SICK_CHILD / SICK_ELDER, times the sickness and death stats
  SICK_CHILD: 1.3, SICK_ELDER: 2.2,
  SICK_HOUSE: 0.9,        // catching it from someone sick in the same hut, a life year
  SICK_NEAR: 0.45,        // from someone sick within SICK_NEAR_R, a life year
  SICK_NEAR_R: 6,
  SICK_IMMUNE: 25,        // a survivor cannot catch any sickness again for this long
  SICK_WORK: 0.4, SICK_HAPPY: -12, // the sick work at this fraction and are this much less happy
  SICK_CROWD: 2,          // a hut of 5 or more is this much likelier to start one
  SICK_FAR_WATER: 14, SICK_BAD_WATER: 1.6, // a hut this far from fresh water: stale water, likelier
  SICK_AFTER_FLOOD: 3,    // a family a flood went through, for 10 years after
  // ---- wounds (burns, a bad bite) ----
  WOUND_LEN: [1, 2.5], WOUND_DIE: 0.15, BURN_DIE: 0.25, BITE_DIE: 0.12,
  WOUND_WORK: 0.5, WOUND_HAPPY: -8,
  // ---- drought ----
  DROUGHT_CHANCE: 0.011,  // chance a calendar year
  DROUGHT_YEARS: [16, 34], // calendar years it lasts
  DROUGHT_R: [30, 46],    // blocks round a home
  DROUGHT_YIELD: 0.3,     // the share of food fields and foraging still give
  // ---- fire (game seconds: it plays out on walking time) ----
  LIGHTNING: 0.007,       // chance a calendar year of a lightning fire near the settlement
  LIGHTNING_DRY: 4,       // times this while a drought is on (and it strikes inside the drought)
  HEARTH: 0.00025,        // chance a calendar year, per lived-in hut, that its hearth sets it alight
  FIRE_SPREAD: 0.24,      // spread rate per second, times the neighbour's fuel
  FIRE_CELL_S: [2, 4],    // a column burns this long, then the land changes
  FIRE_MAX: 900,          // columns one fire may take at most
  FIRE_HARDSHIP: 12,      // a fire counts as a hardship once it takes this many columns (or a hut, or nears a home)
  FIRE_GRASS: 0.12, FIRE_DRY: 0.5, FIRE_TREE: 0.9, FIRE_HUT: 0.8, FIRE_CROP: 0.5, // fuel by what is there
  FIRE_DROUGHT: 3,        // green grass in a drought burns this much more
  HUT_BURN_S: 10,         // a hut that catches burns this long, then falls
  FIRE_TRAP: 0.15,        // chance someone indoors is trapped when it catches (times the death stat)
  FIRE_WOUND: 0.12,       // chance someone close to the flames is burned
  ASH_YEARS: 6, FIELD_REGROW: 2, // ash greens again, a burnt field grows again (life years)
  // ---- flood ----
  FLOOD_CHANCE: 0.01,     // chance a calendar year (only where low land lies beside water by the huts)
  FLOOD_RISE: 2,          // blocks the water rises
  FLOOD_R: [10, 18],      // how far along the shore
  FLOOD_YEARS: [6, 14],   // calendar years it stays
  FLOOD_MAX: 700, FLOOD_MIN_CELLS: 15,
  FLOOD_RISE_S: 8,        // game seconds it takes to rise
  FLOOD_SICK: 0.5,        // chance a sickness follows among the families it reached
  MUD_YEARS: 4,           // life years the ground stays mud
  TOPUP_YEARS: 8,         // calendar years a pond the god's rain topped up stays one block higher
  TOPUP_MAX: 260,         // columns one rain may top up at most
  // ---- hunger ----
  HUNGER_WARN: 3,         // life years before someone would starve: the family's hunger becomes a hardship
  // ---- saved people cause trouble later (hardship-trouble.js) ----
  TROUBLE_SHARE: 0.33,    // the share of saves that carry trouble
  TROUBLE_JOKE: 0.15,     // of those, the share dated far past any run (the joke)
  TROUBLE_JOKE_YEARS: [1500, 4800], // how far past, in calendar years
  TROUBLE_SELF: 0.55,     // of the rest, the share carried by the saved person themself (else a child or grandchild)
  PREACH_YEARS: 25,       // a preacher wins listeners for this long
};

let API = null;
// for powers-nature.js (loaded after this file): the hardships' own functions
export const hardshipApi = () => API;

const WHAT = { sickness: (h) => h.the ?? 'the sickness', drought: () => 'the drought', fire: () => 'the fire', flood: () => 'the flood', hunger: () => 'the hungry years' };
const THOUGHTS = {
  drought: ['Not a drop of rain in years. The grain is dust.', 'The sky has forgotten us.', 'I dig deeper every day and find only dry earth.'],
  flood: ['The water came right up to the door.', 'Everything smells of mud.', 'Will the lake ever give our field back?'],
  fire: ['Fire! Get the children out!', 'The thatch is burning!'],
  sick: ['My head burns. Everything aches.', 'I cannot keep anything down.', 'So tired. So cold.'],
  wound: ['The burns sting when I move.', 'It hurts to lift anything.'],
  fearSick: ['Half the hut is coughing. Who is next?', 'Keep the little ones away from the sick.'],
};

export default {
  id: 'hardship',
  tune: TUNE_HARDSHIP,
  init(R) {
    const { S } = R;
    const T = TUNE_HARDSHIP;
    const fx = makeFx(R.ctx, S);
    const all = new Map();   // id -> hardship (kept after it ends, for get())
    const active = [];
    const tally = {};        // kind -> { started, sent, deaths, killed, ended }
    let seq = 0;
    const tallyOf = (k) => tally[k] ?? (tally[k] = { started: 0, sent: 0, deaths: 0, ended: 0, outcomes: {} });
    const H = {
      R, S, T, fx,
      data: (p) => R.data(p, 'hardship', () => ({})),
      get: (id) => all.get(id) ?? null,
      active: (kind) => active.filter((h) => !kind || h.kind === kind),
      ready: () => S.year - S.startYear >= T.START_AFTER,
      tally: (what) => { tallyOf('_')[what] = (tallyOf('_')[what] ?? 0) + 1; },
    };

    // ---------- the registry: every hardship is one record ----------
    H.begin = (kind, o = {}) => {
      const h = { kind, startYear: S.year, deaths: 0, people: new Set(), families: new Set(), aided: new Set(), aidedAll: false, sent: false, mOpened: false, ...o, id: `${kind}-${++seq}` };
      h.momentId = `sim:hardship:${h.id}`;
      all.set(h.id, h); active.push(h);
      return h;
    };
    H.signalStart = (h) => {
      if (h.signalled) return;
      h.signalled = true;
      const t = tallyOf(h.kind); t.started++; if (h.sent) t.sent++;
      R.signal('hardship:start', { id: h.id, kind: h.kind, x: h.x, z: h.z, r: h.r ?? 0, families: [...h.families], people: [...h.people], sent: !!h.sent });
    };
    // one moment per hardship (contract: only while the god can still change the outcome)
    H.moment = (h, on, info, o = {}) => {
      if (!h) return;
      if (on) { if (!h.mOpened && !h.ended) h.mOpened = R.moment.open(h.momentId, info, { cap: T.MOMENT_CAP, quiet: 1e7, minor: !!o.minor }); }
      else if (R.moment.isOpen(h.momentId)) R.moment.close(h.momentId);
    };
    H.aid = (h, who) => { if (h) h.aided.add(who); };
    // an alert about a condition (starving, a drought, a flood) is withdrawn from the screen when the condition
    // ends: the HUD's feed drops a card with this exact text on 'sim:alert-end' (the Log keeps it)
    H.alertFor = (h, severity, text, o) => { h.alerts = [...(h.alerts ?? []), text]; R.alert(severity, text, o); };
    H.finish = (h, outcome, o = {}) => {
      if (h.ended) return;
      h.ended = true; h.outcome = outcome; h.endYear = S.year;
      const i = active.indexOf(h); if (i >= 0) active.splice(i, 1);
      if (R.moment.isOpen(h.momentId)) R.moment.close(h.momentId);
      for (const text of h.alerts ?? []) R.ctx.events.emit('sim:alert-end', { text, id: h.id, kind: h.kind, outcome });
      if (o.quiet || !h.signalled) { all.delete(h.id); return; }
      const t = tallyOf(h.kind); t.deaths += h.deaths; t.ended++; t.outcomes[outcome] = (t.outcomes[outcome] ?? 0) + 1;
      // the survivors: everyone it touched who is still alive; those who had no help learn from it
      const who = new Set([...h.people].filter((p) => !p.dead));
      if (h.kind !== 'sickness') for (const f of h.families) for (const m of f.members) if (!m.dead) who.add(m);
      const survivors = [...who];
      const what = WHAT[h.kind](h), when = yearLabel(h.startYear);
      for (const p of survivors) {
        const unaided = !h.aidedAll && !h.aided.has(p) && !h.aided.has(p.family);
        const d = H.data(p);
        if (unaided && p.age >= 4 && !(d.learned ?? (d.learned = [])).includes(h.id)) {
          d.learned.push(h.id);
          R.story(p, `Came through ${what} of ${when} with no help from above, and learned from it.`);
        }
        R.signal('hardship:survived', { person: p, id: h.id, kind: h.kind, unaided });
      }
      R.signal('hardship:end', { id: h.id, kind: h.kind, outcome, deaths: h.deaths, survivors });
      log.push({ id: h.id, kind: h.kind, sent: h.sent, start: Math.floor(h.startYear), end: Math.floor(S.year), outcome, deaths: h.deaths, people: survivors.length });
      if (log.length > 200) log.shift();
    };
    const log = [];
    // a hut burned or washed out: the family rebuilds it, from the first block, by the core's own building plan
    const rebuilding = new Map();
    H.ruin = (hut, cause) => {
      hut.done = false; hut.next = 0; hut.progress = 0; hut.work = 0;
      rebuilding.set(hut, cause);
      const f = hut.family;
      if (f && !f.plans.includes(hut)) f.plans.push(hut);
      for (const m of f?.members ?? []) R.story(m, cause === 'fire' ? 'The family hut burned down.' : 'The family hut was ruined by the flood.');
    };
    R.on('building:built', (b) => {
      const cause = rebuilding.get(b);
      if (!cause) return;
      rebuilding.delete(b);
      for (const m of b.family?.members ?? []) R.story(m, `Rebuilt the family hut after the ${cause}.`);
    });
    R.on('building:removed', (b) => { rebuilding.delete(b); });

    H.trouble = makeTrouble(H);
    H.sick = makeSick(H);
    H.fire = makeFire(H);
    H.water = makeWater(H);

    // ---------- hunger: a family about to lose someone ----------
    const hungerOf = new Map(); // family -> hardship
    // how fast a person's hunger is growing, a life year: measured from their hunger itself, because a family
    // living hand to mouth flips between fed and short from one frame to the next (f.shortRate flickers)
    const hungerRate = (m) => {
      if (S.peopleApi?.hungerRate && m.family?.hungerFrom != null) return Math.max(0, S.peopleApi.hungerRate(m.family)); // people.js: the pace over a day
      const d = H.data(m), now = S.life;
      const s = d.hs ?? (d.hs = { h: m.hunger, t: now, rate: m.family.shortRate > 0 ? m.family.shortRate : 0 });
      if (now - s.t >= 0.05) { s.rate = (m.hunger - s.h) / (now - s.t); s.h = m.hunger; s.t = now; }
      return Math.max(s.rate, m.family.shortRate > 0 ? m.family.shortRate : 0);
    };
    // life years until this person starves at the hunger's present pace (Infinity when it is not growing)
    H.hungerLeft = (m) => {
      if (m.dead || !(m.hunger > 0)) return Infinity;
      if (S.peopleApi?.hungerLeftOf) return S.peopleApi.hungerLeftOf(m); // people.js: the hunger played forward
      const rate = hungerRate(m);
      return rate > 0 ? (m.starveAt - m.hunger) / rate : Infinity;
    };
    // members who will starve within HUNGER_WARN life years
    H.hungerDanger = (f) => {
      if (!f || f.state !== 'settled') return [];
      return f.members.filter((m) => H.hungerLeft(m) < T.HUNGER_WARN);
    };
    let hT = 0;
    function hungerStep(dt) {
      hT += dt;
      if (hT < 0.5) return;
      hT = 0;
      for (const f of S.families) {
        if (f.state !== 'settled') continue;
        const danger = H.hungerDanger(f);
        let h = hungerOf.get(f);
        if (danger.length && !h) {
          const at = f.home ? { x: f.home.cx, z: f.home.cz } : { x: danger[0].x, z: danger[0].z };
          h = H.begin('hunger', { ...at, r: 6, family: f, text: 'Hunger' });
          h.families.add(f); for (const m of f.members) h.people.add(m);
          hungerOf.set(f, h);
          for (const m of danger) H.trouble.roll(m);
          H.alertFor(h, 'bad', `The ${f.name} family is starving. ${danger[0].name} will not last long without food.`, { x: at.x, z: at.z, subject: danger[0], aside: R.aside('hardship:hunger', H_ASIDES) });
          H.signalStart(h);
        }
        if (!h) continue;
        h.calm = danger.length ? 0 : (h.calm ?? 0) + 0.5;
        for (const m of danger) H.trouble.roll(m);
        if (danger.length) {
          const m = danger.reduce((a, b) => (H.hungerLeft(a) < H.hungerLeft(b) ? a : b));
          const yrs = Math.max(1, Math.round(H.hungerLeft(m) / R.T.LIFE_RATE));
          H.moment(h, true, () => ({ text: `${m.name} of the ${f.name} family will die of hunger ${yrs <= 1 ? 'within the year' : `in about ${number(yrs)} years`}, unless they are fed.`, x: m.x, z: m.z, kind: 'hunger', act: 'Rain: R, then click their fields.' }));
        } else H.moment(h, false);
      }
      for (const [f, h] of [...hungerOf]) {
        const gone = !S.families.includes(f) || f.state !== 'settled' || !f.members.length;
        // over when nobody is hungry any more, or nobody has been in danger for a good while (20 game seconds)
        const fed = f.members.every((m) => m.hunger < 0.5) || (h.calm ?? 0) > 20;
        if (gone || fed) { hungerOf.delete(f); H.finish(h, h.deaths ? 'killed' : 'passed'); }
      }
    }
    H.hungerOf = (f) => hungerOf.get(f) ?? null;

    // ---------- the wolf that was to kill someone (Strike's saves) ----------
    // Strike is not ours to edit: we watch for a wolf whose rolled hunt will kill, roll the prey's trouble
    // then (it shows in the prey's fate and the wolf's inspector before the strike), and carry it out when
    // the wolf is struck down while still on that hunt.
    const huntKill = new Map(); // wolf -> prey
    function wolves() {
      for (const w of S.predators) {
        if (!w.dead && w.prey?.kind === 'person' && !w.prey.dead && w.outcome === 'kill' && (w.state === 'stalk' || w.state === 'sprint')) {
          if (!huntKill.has(w)) { huntKill.set(w, w.prey); H.trouble.roll(w.prey); }
        } else if (!w.dead && huntKill.has(w)) { const p = huntKill.get(w); huntKill.delete(w); if (!p.dead && !otherDanger(p)) H.data(p).trouble = undefined; }
      }
      for (const w of [...huntKill.keys()]) if (!S.predators.includes(w)) huntKill.delete(w);
    }
    const otherDanger = (p) => !!(H.sick.endOf(p) || H.fire.endOf(p) || H.hungerDanger(p.family).includes(p));
    R.on('animal:death', (a, cause) => {
      const p = huntKill.get(a);
      huntKill.delete(a);
      if (!p || p.dead || cause !== 'strike') return;
      H.trouble.save(p, 'strike', `die at ${Math.floor(p.age)} by a wolf`, 'saved from a wolf');
    });
    H.wolfPrey = (w) => huntKill.get(w) ?? null;
    // Strike's card on a wolf whose hunt will kill: what saving its prey brings (the roll the animal:death hook carries out)
    R.on('forecast', ({ id, target, forecast }) => {
      if (id !== 'strike' || target?.kind !== 'animal') return;
      const p = huntKill.get(target.entity);
      const tr = p && !p.dead ? H.data(p).trouble : null;
      if (!tr) return;
      const l = H.trouble.lines(p, tr);
      forecast.fates.push(...l.fates.map((t) => (/^Saved, /.test(t) ? t : `Saving ${p.name}: ${t}`)));
      forecast.later.push(...l.later);
    });

    // ---------- hooks ----------
    R.on('step', ({ dt, dLife }) => {
      H.sick.step(dLife);
      H.fire.step(dt);
      H.water.step(dt);
      hungerStep(dt);
      wolves();
      fx.tick();
    });
    R.on('year', () => {
      H.sick.year();
      H.fire.year();
      H.water.year();
      H.trouble.year();
      // a roll lives only while its danger does: someone who came through without a save rolls afresh next time
      const hunted = new Set(huntKill.values());
      for (const p of S.people) { const d = p.ext?.hardship; if (d && d.trouble !== undefined && !hunted.has(p) && !otherDanger(p) && S.mind.endOf(p).how !== 'hunger') d.trouble = undefined; }
    });
    R.on('person:death', (p, cause) => {
      fx.unmark(p);
      if (cause === 'hunger') {
        const h = hungerOf.get(p.family) ?? [...hungerOf.values()].find((x) => x.people.has(p));
        if (h) h.deaths++;
        const d = H.water.droughtOf(p.family) ?? H.water.droughts().find((x) => x.people.has(p));
        if (d) d.deaths++;
        const fl = H.active('flood').find((x) => x.people.has(p));
        if (fl) fl.deaths++;
      }
    });
    // a wolf's bite may go bad (a wound Heal can cure)
    // (the event comes before the bite is dealt: looked at on the next step, when the person has lived or not)
    const bitten = [];
    R.ctx.events.on('sim:attack', (e) => { if (e?.person?.kind === 'person') bitten.push(e.person); });
    R.on('step', () => { while (bitten.length) { const p = bitten.pop(); if (!p.dead && Math.random() < 0.5) H.sick.wound(p, 'bite', { base: T.BITE_DIE }); } });
    // the end a hardship brings, if sooner than the core's
    R.on('end', (p) => {
      let e = null;
      for (const x of [H.sick.endOf(p), H.fire.endOf(p), hungerEnd(p)]) if (x && (!e || x.age < e.age)) e = x;
      return e;
    });
    // starving at the pace their hunger is really growing (the core's own line flickers with a hand-to-mouth store)
    const hungerEnd = (p) => {
      if (p.dead || !(p.hunger > 0) || p.family?.state !== 'settled') return null;
      const left = H.hungerLeft(p);
      if (!Number.isFinite(left)) return null;
      const age = Math.floor(p.age + left);
      return { age, how: 'hunger', words: `of hunger at ${age}`, line: `Dies of hunger at ${age}, unless the family finds food.` };
    };
    H.hungerAge = (p) => hungerEnd(p)?.age ?? null;
    R.on('fate', (p) => {
      const out = [...H.sick.fateLines(p), ...H.trouble.fateLines(p)];
      // fated to die of a hardship (or a wolf): what saving them would bring, already rolled
      const d = p.ext?.hardship;
      if (d?.trouble && (otherDanger(p) || [...huntKill.values()].includes(p))) {
        const l = H.trouble.lines(p, d.trouble);
        for (const t of l.fates) out.push(/^Saved, /.test(t) ? t.replace(/^Saved, /, 'If saved, ') : `If saved: ${t}`);
        for (const t of l.later) out.push(`If saved, later: ${t}`);
      }
      return out;
    });
    R.on('thoughts', (p) => {
      if (p.asleep) return null;
      const d = p.ext?.hardship, c = [];
      if (d?.sick) for (const t of THOUGHTS.sick) c.push([24, t]);
      if (d?.wound) for (const t of THOUGHTS.wound) c.push([18, t]);
      if (p.doing === 'running from the fire') for (const t of THOUGHTS.fire) c.push([45, t]);
      if (!d?.sick && p.family.members.some((m) => m.ext?.hardship?.sick)) for (const t of THOUGHTS.fearSick) c.push([12, t]);
      if (H.water.dryAt(p.x, p.z)) for (const t of THOUGHTS.drought) c.push([10, t]);
      if ((p.family.ext?.hardship?.floodedUntil ?? -1) > S.year && H.active('flood').some((h) => h.families.has(p.family))) for (const t of THOUGHTS.flood) c.push([10, t]);
      return c;
    });
    R.on('inspect', (e, out) => {
      if (e?.kind === 'person') {
        const d = e.ext?.hardship;
        const rows = [];
        if (d?.sick) rows.push(['Sick', `${d.sick.label}${d.sick.die ? ', will die of it' : ', will recover'}`]);
        if (d?.wound) rows.push(['Hurt', d.wound.cause === 'fire' ? 'burned' : 'a bad bite']);
        const h = H.active().find((x) => x.people.has(e) || x.families.has(e.family));
        if (h) rows.push(['Hardship', `${WHAT[h.kind](h)} (since ${yearLabel(h.startYear)})`]);
        if (rows.length) R.section(out, { id: 'hardship', title: 'Hardship', rows, order: 40 });
      } else if (e?.species === 'wolf') {
        const p = huntKill.get(e);
        const tr = p ? H.data(p).trouble : null;
        if (p && tr) { const l = H.trouble.lines(p, tr); R.section(out, { id: 'hardship', title: 'If struck down', lines: [...l.fates, ...l.later] }); }
      }
    });
    R.on('stats', (st) => {
      st.sick = H.sick.sick.size;
      st.hardships = active.length;
    });

    // ---------- queries ----------
    // { id, kind, x, z, r, people: [person], text } (what the screen draws), plus sent, since, deaths, families (names), moment
    const famText = (h) => (h.families.size ? H.water.namesOf([...h.families]) : 'nobody yet');
    const TEXT = {
      sickness: (h, n) => `${h.label ? h.label.charAt(0).toUpperCase() + h.label.slice(1) : 'A sickness'}: ${number(n)} sick${h.deaths ? `, ${number(h.deaths)} dead` : ''}.`,
      drought: (h) => `A drought around ${famText(h)}, until about ${yearLabel(h.until)}.`,
      fire: (h) => `A fire${h.huts?.size ? `: ${number(h.huts.size)} ${h.huts.size === 1 ? 'hut' : 'huts'} caught` : ''}${h.deaths ? `, ${number(h.deaths)} dead` : ''}.`,
      flood: (h) => `A flood over the land of ${famText(h)}, until about ${yearLabel(h.until)}.`,
      hunger: (h) => `The ${h.family?.name ?? ''} family is starving.`,
    };
    const summary = (h) => {
      const people = h.kind === 'sickness' ? [...h.people].filter((p) => !p.dead && p.ext?.hardship?.sick?.h === h.id) : [...h.people].filter((p) => !p.dead);
      return { id: h.id, kind: h.kind, x: h.x, z: h.z, r: h.r ?? 0, people, text: TEXT[h.kind]?.(h, people.length) ?? h.text ?? '',
        sent: !!h.sent, since: Math.floor(h.startYear), deaths: h.deaths, families: [...h.families].map((f) => f.name), moment: R.moment.isOpen(h.momentId),
        // a hunger: how many are about to starve, and whether a deer the god put down is on its way to them (the screen
        // shows no token for a hunger nobody is about to die of, or one the god has already answered)
        ...(h.kind === 'hunger' ? { danger: H.hungerDanger(h.family).length, coming: !!R.ask('deerComing', h.family) } : {}) };
    };
    R.answer('hardships', () => active.map(summary));
    R.answer('troubleLines', (p, tr) => H.trouble.lines(p, tr)); // turning.js lists the troubles with the turning points
    R.answer('hardshipLog', () => ({ tally: JSON.parse(JSON.stringify(tally)), log: [...log], active: active.map(summary), troubles: H.trouble.pending.map((t) => ({ name: t.name, kind: t.kind, gen: t.gen, year: t.year, joke: t.joke, done: t.done, carried: t.carried ?? null, text: t.text })) }));
    // 0 well fed .. 1 starving; also looks ahead: a family whose fields give less (a drought, a flood) is pressed sooner
    R.answer('foodPressure', (f) => {
      if (!f) return 0;
      const need = Math.max(0.01, S.peopleApi.needOf(f));
      const now = Math.max(0, Math.min(1, f.shortRate > 0 ? 0.5 + f.shortRate / 2 : 1 - f.food / need));
      const y = R.value('yield', f, 1);
      return y < 0.8 ? Math.max(now, Math.min(1, (1 - y) * 0.6)) : now;
    });
    API = H;
    void pick;
  },
};

const H_ASIDES = ['Food: the one thing nobody here can do without, and nobody has enough of.', 'Hunger makes everyone a philosopher, briefly.'];
