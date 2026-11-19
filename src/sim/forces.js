// The three forces (DESIGN.md "The heart of the game"): Faith, Skepticism and Strength, each 0 to 100 per
// person. Faith and skepticism are the faith subsystem's (faith.js); this file adds Strength, then reads all
// three for the whole people, each clan and each village: the average level of each, the shape (which corner
// sticks out, by how much), and the state, from the too much / too little table with real effects. It also
// decides which of the god's powers are quiet (they do not take on people without faith) and the battle reach.
// Great people and blessed lines: forces-great.js. Prayers: forces-prayers.js. The rules in words and every
// number: docs/FORCES.md. Every number here is in TUNE_FORCES (console: game.modules.sim.tune('forces')).
import { clamp, smooth, cap1, settled, pct } from './science-util.js';
import { number } from './words.js';

export const TUNE_FORCES = {
  // ---- strength, per person (rates are per LIFE year; a life year is two calendar years) ----
  START_ADULT: [35, 55],  // a grown newcomer from the mist (the walk in was hard)
  START_CHILD: [22, 34],  // a newcomer child without parents here
  BORN_BASE: 30, BORN_SHARE: 0.5, BORN_MID: 40, BORN_SPREAD: 3, // a child born here: BASE + SHARE x (the parents' average - MID), plus or minus SPREAD
  CHILD_GROW: 1,          // a child grows this much a life year until grown (tune.js CHILD_UNTIL 14: about +14)
  GAIN: {                 // one-off gains, strength points
    wolfEscape: 6,        // saw a hunting wolf in time and ran
    wolfBite: 8,          // bitten by a wolf, and lived
    hunger: 5, drought: 4, sickness: 6, fire: 5, flood: 4, // came through a hardship (times UNAIDED or AIDED)
    fightWon: 7, fightLost: 4, fightWound: 3, // came out of a raid or skirmish alive (a wound on top)
    hunt: 1.2, kill: 1,   // went hunting; brought something down
  },
  UNAIDED: 1.5, AIDED: 0.6, // a hardship come through with no help from above counts this much more; helped, this much
  TRAIN: 3,               // a life year of drilling (the Train fighters commandment), times how trained (0..1)
  PRIME: [16, 40], PRIME_FED: 0.3, FED_YEARS: 2, // eating well in the prime of life (store of FED_YEARS of eating, nobody hungry)
  AGE_FROM: 40, AGE_FADE: 0.25, ELDER_FADE: 0.6, // fades with age (an elder from tune.js ELDER_FROM)
  HUNGER_FADE: 2, SICK_FADE: 2, // while hungry, while sick
  EASE_AFTER: 12, EASE_FADE: 0.3, // long ease: no hardship, wolf or fight for this many life years, then this a life year
  HELP_FADE: 0.8,         // the lasting "expects help" trait
  SEEN_HELP: 1.5,         // seeing the sky help close by (heal, rain, a wolf struck, blessed weapons): "why bother"
  WARRIOR_TEACH: 0.3,     // a living great warrior in the clan: the grown gain this a life year (they learn from him)
  GREAT_LIFT: 10,         // a great person lifts their clan's level in that force by this (forces-great.js)
  // ---- what strength does (linear from strength 0 to 100; 50 is an ordinary grown-up) ----
  FIGHT: [0.55, 1.45],    // the 'strength' stat in fights (blessings multiply on top)
  DEATH: [1.3, 0.7],      // the 'death' stat: sickness, fire, a blow in a fight
  WOLF_SEE: [0.6, 1.4],   // the chance to see a hunting wolf in time (tune.js HUNT_ESCAPE times this, at most 0.95)
  WOLF_KILL: [1.4, 0.6],  // the chance a wolf's attack kills (tune.js PRED_KILL times this, at most 0.95)
  HUNT_HIT: [0.75, 1.25], // a hunter's spear (hunting.js HIT_* times this)
  TIERS: 20,              // the seam's modifiers are fixed numbers: a curve is split into this many steps
  // ---- the people's three levels ----
  GROWN: 14,              // levels are the average of the settled people of this age and up
  MIN_GROUP: 5,           // a clan or village with fewer grown than this follows the next larger group's state
  MEASURE_S: 1,           // game seconds between measures
  HIGH: { faith: 65, skepticism: 65, strength: 65 }, // too much at or above
  LOW: { faith: 20, skepticism: 20, strength: 25 },  // too little below (skepticism 20 is science.js DOUBT_FROM)
  HYST: 3,                // a state ends only this far back past its line (no flicker)
  EFFECTS: {
    muchFaith: { work: 0.85, yield: 0.9, fight: 0.6, strengthFade: 0.6, trainMul: 0.3, skepFade: 0.4 },
    littleFaith: { quietFaith: 20, obey: 0.5,        // quiet powers need faith 20; commandments half (commandments.js DOUBT_BAND_OBEY)
      heart: -8,          // (2026-11-13, joining pass) in hard times (hungry, sick, grieving) nothing to hope for: happiness target this,
                          // so a hungry or grieving family loses heart and leaves sooner (people.js: under 25 for 5 life years)
      grudge: 1.3 },      // no shared stone holds the clans together: grudges build this much faster
    muchSkep: { faithFade: 0.3 },
    littleSkep: { think: 0.3, sickness: 1.3, yield: 0.9 },
    muchStrength: { grudge: 1.6, fight: 0.2, think: 0.3, skepFade: 0.3 },
    littleStrength: { morale: -0.15, wolfKill: 1.3, death: 1.15 },
  },
  // ---- quiet powers: they do not take on people whose faith is under LOW.faith ----
  QUIET: ['whisper', 'give-thought', 'calm', 'provoke'], // always quiet; heal is quiet when nobody sees it
  // ---- battle reach (for stage 3): how strongly the god's powers work for them, how badly an enemy miracle shocks them ----
  REACH: [10, 70],        // faith: no reach at 10 or under, full at 70
  SHOCK: [60, 10],        // faith: no shock at 60 or over, full at 10
  // ---- too much strength: a chief, families leaving ----
  CHIEF_AT: 60,           // the strongest grown person of a too-strong village, if this strong, makes themself chief
  CHIEF_TAKE: 0.04,       // and takes this share of every other household's store a calendar year
  LEAVE_CHANCE: 0.008,    // a calendar year, each household of such a village weaker than its level by LEAVE_BELOW ...
  LEAVE_BELOW: 8,
  LEAVE_WARN: 10,         // ... decides to leave for a peaceful place, and goes this many calendar years later if nothing changes
  LOG_KEEP: 12,
};
const F = TUNE_FORCES;
export const FORCE_NAMES = { faith: 'faith', skepticism: 'skepticism', strength: 'strength' };
const BIT = { 'much-faith': 1, 'little-faith': 2, 'much-skepticism': 4, 'little-skepticism': 8, 'much-strength': 16, 'little-strength': 32 };
const ORDER = ['much-faith', 'little-faith', 'much-skepticism', 'little-skepticism', 'much-strength', 'little-strength'];
const lerp = (ab, k) => ab[0] + (ab[1] - ab[0]) * clamp(k);
const r1 = (v) => Math.round(v * 10) / 10;
const signed = (v) => `${v >= 0 ? '+' : ''}${Math.abs(v) >= 9.95 || Number.isInteger(v) ? Math.round(v) : r1(v)}`;
const per10 = (lifeRate) => r1(lifeRate * 5); // a life-year rate as points per 10 calendar years (LIFE_RATE 0.5)

// the states in words; each effect sentence carries its real numbers
function stateWords(id) {
  const E = F.EFFECTS;
  switch (id) {
    case 'much-faith': return { label: 'Too much faith', short: 'They wait on the god.', effects: [
      `They wait on the god: work at ${pct(E.muchFaith.work)}, and the fields neglected (food at ${pct(E.muchFaith.yield)}).`,
      `Nobody trains: strength fades ${per10(E.muchFaith.strengthFade)} more every 10 years, and drilling counts for ${pct(E.muchFaith.trainMul)}.`,
      `Nobody questions: skepticism fades ${per10(E.muchFaith.skepFade)} every 10 years.`,
      `In a fight they kneel and wait: willingness to fight at ${pct(E.muchFaith.fight)}.`] };
    case 'little-faith': return { label: 'Too little faith', short: 'Your quiet powers do not take.', effects: [
      `Your quiet powers do not take on anyone with faith under ${E.littleFaith.quietFaith}: Whisper, Give a thought, Calm, Provoke, and Heal where nobody sees it. Only what they can see works.`,
      `Commandments are obeyed at ${pct(E.littleFaith.obey)}.`,
      `In hard times they have nothing to hope for: a hungry, sick or grieving family is ${-E.littleFaith.heart} less happy, and loses heart and leaves sooner.`,
      `Nothing holds the clans together: grudges build ${E.littleFaith.grudge} times as fast.`,
      'In battle your powers would barely reach them, and an enemy god\'s miracle would shake them badly.'] };
    case 'much-skepticism': return { label: 'Too much skepticism', short: 'Belief dries up.', effects: [
      `Belief dries up: faith fades ${per10(E.muchSkep.faithFade)} more every 10 years, toward too little faith.`] };
    case 'little-skepticism': return { label: 'Too little skepticism', short: 'Nothing is invented.', effects: [
      `Nobody wonders: nobody under skepticism 20 thinks at all, and the few who do are not listened to (thinking at ${pct(E.littleSkep.think)}).`,
      `Sickness spreads and kills more (${E.littleSkep.sickness} times as likely).`,
      `The fields are worked the old way: food at ${pct(E.littleSkep.yield)}.`] };
    case 'much-strength': return { label: 'Too much strength', short: 'Warlords.', effects: [
      `Warlords: grudges build ${E.muchStrength.grudge} times as fast, and more are willing to raid (+${E.muchStrength.fight}).`,
      `The strongest in a village takes over as chief, and takes ${pct(F.CHIEF_TAKE)} of every other household's store each year.`,
      `Thinkers are pushed aside: thinking at ${pct(E.muchStrength.think)}, and skepticism fades ${per10(E.muchStrength.skepFade)} every 10 years.`,
      `The weaker families leave for peaceful places (about ${Math.round(F.LEAVE_CHANCE * 1000)} in 1000 a year each, with ${F.LEAVE_WARN} years' warning).`] };
    case 'little-strength': return { label: 'Too little strength', short: 'Soft.', effects: [
      `Soft: wolves kill ${E.littleStrength.wolfKill} times as often, and every blow, fever and fire kills ${E.littleStrength.death} times as often.`,
      `In a fight they break and run (morale ${E.littleStrength.morale}).`] };
    default: return { label: 'Even', short: 'Healthy.', effects: [] };
  }
}

export default {
  id: 'forces',
  tune: TUNE_FORCES,
  init(R) {
    const { S } = R;
    const T1 = R.T;
    const yearNow = () => Math.floor(S.year);
    const data = (p) => R.data(p, 'forces', () => ({ s: 40, eff: 40, st: 0, grp: 'people', start: null, log: [], drift: null, lastHard: S.life, hunts: 0, kills: 0 }));

    // ================= strength, per person =================
    const range = (ab) => ab[0] + Math.random() * (ab[1] - ab[0]);
    R.on('person:new', (p) => {
      const d = data(p);
      const m = p.mother, f = p.father;
      const ps = [m, f].filter((q) => q?.ext?.forces).map((q) => q.ext.forces.s);
      if (ps.length) {
        const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
        d.s = clamp(F.BORN_BASE + F.BORN_SHARE * (avg - F.BORN_MID) + (Math.random() * 2 - 1) * F.BORN_SPREAD, 0, 100);
        d.log.push({ y: yearNow(), y2: yearNow(), text: `Born to parents of strength ${Math.round(avg)}: began at ${Math.round(d.s)}`, d: 0, first: true });
      } else {
        d.s = p.age >= T1.CHILD_UNTIL ? range(F.START_ADULT) : range(F.START_CHILD);
        d.log.push({ y: yearNow(), y2: yearNow(), text: `Walked in from the mist at strength ${Math.round(d.s)}`, d: 0, first: true });
      }
      d.eff = d.s;
      d.start = { faith: p.faith, skepticism: p.skep, strength: d.s };
      d.lastHard = S.life;
    });

    // the ledger: why they are strong (events one by one; slow drifts summed into "quiet years" lines)
    function flushDrift(d) {
      const b = d.drift;
      if (!b) return;
      if (Math.abs(b.d) >= 1) d.log.push({ y: b.y, y2: yearNow(), quiet: true, d: b.d, text: [...b.why].join(', ') });
      d.drift = null;
      trim(d);
    }
    function trim(d) { while (d.log.length > F.LOG_KEEP) { const i = d.log.findIndex((x) => !x.first); d.log.splice(i < 0 ? 0 : i, 1); } }
    // a change for a reason: applied, written down, returned
    function gain(p, n, text, o = {}) {
      if (!p || p.dead || !n) return 0;
      const d = data(p);
      const s0 = d.s;
      d.s = clamp(d.s + n, 0, 100);
      const got = d.s - s0;
      if (o.hard) d.lastHard = S.life;
      if (text && Math.abs(got) >= 0.05) {
        flushDrift(d);
        const last = d.log[d.log.length - 1];
        if (o.key && last && last.key === o.key && yearNow() - last.y2 < 60) { last.d += got; last.y2 = yearNow(); last.n = (last.n ?? 1) + 1; }
        else d.log.push({ y: yearNow(), y2: yearNow(), text, d: got, key: o.key ?? null });
        trim(d);
      }
      d.eff = effOf(p);
      return got;
    }
    // the slow drifts of one person, a life year: { rate, why }
    function driftOf(p, d = data(p)) {
      let rate = 0;
      const why = [];
      const st = d.st, E = F.EFFECTS;
      if (p.age < T1.CHILD_UNTIL) { rate += F.CHILD_GROW; why.push('growing up'); }
      else if (p.age >= T1.ELDER_FROM) { rate -= F.ELDER_FADE; why.push('old age'); }
      else if (p.age >= F.AGE_FROM) { rate -= F.AGE_FADE; why.push('getting on'); }
      if (p.hunger > 0) { rate -= F.HUNGER_FADE * Math.min(1, p.hunger / 1.5); why.push('hunger'); }
      if (p.ext?.hardship?.sick) { rate -= F.SICK_FADE; why.push('sickness'); }
      if (p.age >= T1.CHILD_UNTIL && S.life - d.lastHard > F.EASE_AFTER) { rate -= F.EASE_FADE; why.push('easy years'); }
      if (p.expectsHelp) { rate -= F.HELP_FADE; why.push('waits for the sky'); }
      const much = st & BIT['much-faith'];
      if (much && p.age >= T1.CHILD_UNTIL) { rate -= E.muchFaith.strengthFade; why.push('nobody trains'); }
      const tr = p.ext?.cmd?.trained ?? 0;
      if (tr > 0.02) { rate += F.TRAIN * tr * (much ? E.muchFaith.trainMul : 1); why.push('drills with a spear'); }
      const f = p.family;
      if (p.age >= F.PRIME[0] && p.age < F.PRIME[1] && !(p.hunger > 0) && f?.state === 'settled' && f.food >= S.peopleApi.needOf(f) * F.FED_YEARS) { rate += F.PRIME_FED; why.push('eats well'); }
      if (p.age >= T1.CHILD_UNTIL && GA()?.hasGreat(p, 'strength', true)) { rate += F.WARRIOR_TEACH; why.push(`learns from ${GA().greatName(p, 'strength')}`); }
      return { rate, why };
    }
    const GA = () => R.ask('forces:great-api');
    // effective strength: their own, plus a great warrior's lift in the clan
    function effOf(p) {
      const d = p.ext?.forces;
      if (!d) return 50;
      return clamp(d.s + (GA()?.liftOf(p, 'strength') ?? 0), 0, 100);
    }

    // ----- the modifiers strength drives (fixed numbers, so each curve is TIERS steps) -----
    const effS = (p) => (p?.kind === 'person' ? p.ext?.forces?.eff ?? 50 : null);
    function curve(stat, key, ab, note) {
      R.mod(stat, `${key}:0`, { add: ab[0] - (stat === 'strength' || stat === 'death' ? 1 : 0), who: (p) => p?.kind === 'person', note });
      const step = (ab[1] - ab[0]) / F.TIERS;
      for (let i = 0; i < F.TIERS; i++) {
        const at = (i + 0.5) * 100 / F.TIERS;
        R.mod(stat, `${key}:${i + 1}`, { add: step, who: (p) => (effS(p) ?? -1) >= at, note });
      }
    }
    curve('strength', 'forces:strength', F.FIGHT, 'their strength');
    curve('death', 'forces:hardy', F.DEATH, 'their strength');
    const at = (ab, p) => lerp(ab, (effOf(p)) / 100);
    // wolves (animals.js asks): multipliers on seeing the wolf in time and on its attack killing
    R.answer('wolfOdds', (p) => {
      if (!p || p.kind !== 'person') return { see: 1, kill: 1 };
      const soft = (p.ext?.forces?.st ?? 0) & BIT['little-strength'];
      return { see: at(F.WOLF_SEE, p), kill: at(F.WOLF_KILL, p) * (soft ? F.EFFECTS.littleStrength.wolfKill : 1) };
    });
    // hunting (hunting.js asks): a multiplier on a throw killing
    R.answer('huntSkill', (p) => (p?.kind === 'person' ? at(F.HUNT_HIT, p) : 1));

    // ----- what raises it -----
    const facing = new Map(); // person -> the wolf they ran from
    const bitten = [];        // people a wolf bit, checked next step
    R.ctx.events.on('sim:attack', (e) => { if (e?.person) bitten.push(e.person); });
    const HARD = { hunger: 'hungry years', drought: 'the drought', sickness: 'a sickness', fire: 'the fire', flood: 'the flood' };
    const sent = new Set();
    R.on('hardship:start', (e) => {
      if (e?.sent) { sent.add(e.id); if (sent.size > 100) sent.delete(sent.values().next().value); }
      for (const p of e?.people ?? []) if (!p.dead) data(p).lastHard = S.life;
      for (const f of e?.families ?? []) for (const p of f.members) if (!p.dead) data(p).lastHard = S.life;
    });
    R.on('hardship:survived', (e) => {
      const p = e?.person;
      if (!p || p.dead) return;
      const g = F.GAIN[e.kind] ?? 4;
      const k = e.unaided ? F.UNAIDED : F.AIDED;
      gain(p, g * k, `Came through ${HARD[e.kind] ?? 'a hard time'}${e.unaided ? ' with no help from above' : ', with help'}`, { hard: true, key: `hard:${e.kind}` });
      if (sent.has(e.id)) R.signal('force:tested', { person: p, id: e.id, kind: e.kind }); // a hardship the god sent (lines)
    });
    R.on('fight:end', (e) => {
      const f = e?.fight;
      if (!f || (e.kind !== 'raid' && e.kind !== 'skirmish') || e.calledOff) return;
      const sides = [[f.attackers ?? [], e.a], [f.defenders ?? [], e.b]];
      for (const [list, g] of sides) {
        const won = e.winner && e.winner === g;
        for (const p of list) {
          if (!p || p.dead) continue;
          const w = R.ask('wounded', p) ? F.GAIN.fightWound : 0;
          gain(p, (won ? F.GAIN.fightWon : F.GAIN.fightLost) + w, `Came out of ${f.label ?? 'a fight'} alive${won ? ', on the winning side' : ''}${w ? ', wounded' : ''}`, { hard: true });
        }
      }
    });
    // seeing the sky do it for them: "why bother"
    const HELP_KINDS = () => R.tune('faith')?.HELP_KINDS ?? ['heal', 'bless-harvest', 'strike', 'bless-weapons'];
    R.on('witnessed', (info) => {
      if (!HELP_KINDS().includes(info?.act?.kind)) return;
      for (const m of info.moved ?? []) if (m.how === 'saw' && m.p.age >= T1.CHILD_UNTIL) gain(m.p, -F.SEEN_HELP * (m.w ?? 1), 'Saw the sky do it for them: why bother', { key: 'seenhelp' });
    });

    // ----- every update: the wolves, the slow drifts, the measure -----
    let acc = 0, accT = 0, measT = 0;
    R.on('step', ({ dt, dLife }) => {
      // wolves faced: someone who ran from a hunting wolf and lived; someone bitten who lived
      for (const p of S.people) if (p.fleeing && !p.dead && p.fleeing.species === 'wolf') facing.set(p, p.fleeing);
      for (const [p, w] of facing) {
        if (p.dead) { facing.delete(p); continue; }
        if (p.fleeing) continue;
        facing.delete(p);
        if (!w.dead && w.prey === p) continue;
        gain(p, F.GAIN.wolfEscape, 'Saw a wolf coming and got away', { hard: true });
      }
      while (bitten.length) { const p = bitten.pop(); if (!p.dead) { facing.delete(p); gain(p, F.GAIN.wolfBite, 'Was bitten by a wolf, and lived', { hard: true }); } }
      acc += dLife || 0; accT -= dt;
      if (accT <= 0 && acc > 0) {
        accT = 0.25;
        const dl = acc; acc = 0;
        for (const p of S.people) {
          if (p.dead) continue;
          const d = data(p);
          // hunting: each trip, and each kill
          const h = p.ext?.hunt;
          if (h) {
            const kills = (h.deer ?? 0) + (h.rabbits ?? 0);
            if (h.trips > d.hunts) { gain(p, (h.trips - d.hunts) * F.GAIN.hunt * ((d.st & BIT['much-faith']) ? F.EFFECTS.muchFaith.trainMul : 1), 'Went out hunting', { key: 'hunt' }); d.hunts = h.trips; }
            if (kills > d.kills) { gain(p, (kills - d.kills) * F.GAIN.kill, 'Brought down game', { key: 'kill' }); d.kills = kills; }
          }
          const { rate, why } = driftOf(p, d);
          if (rate) {
            const s0 = d.s;
            d.s = clamp(d.s + rate * dl, 0, 100);
            const b = d.drift ?? (d.drift = { y: yearNow(), d: 0, why: new Set() });
            b.d += d.s - s0;
            for (const w of why) b.why.add(w);
            if (yearNow() - b.y >= 40) flushDrift(d);
          }
          d.eff = effOf(p);
        }
      }
      measT -= dt;
      if (measT <= 0) { measT = F.MEASURE_S; measure(); }
    });

    // ================= the people's three levels, the shape and the state =================
    const groups = new Map(); // id -> { id, kind: 'people'|'clan'|'village', ref, n, faith, skepticism, strength, on: Set, bits }
    // 'people': the settled grown (their states and effects, the prayers, great people and foresight read it by
    // this name); everyone: every grown person in the land, settled or not (the forces query's levels)
    const people = { id: 'people', kind: 'people', ref: null, n: 0, faith: 0, skepticism: 0, strength: 0, on: new Set(), bits: 0 };
    const everyone = { n: 0, faith: 0, skepticism: 0, strength: 0 };
    groups.set('people', people);
    let started = false;
    function judge(g) {
      const on = g.on, H = F.HIGH, L = F.LOW, h = F.HYST;
      for (const f of ['faith', 'skepticism', 'strength']) {
        const v = g[f];
        const mk = `much-${f}`, lk = `little-${f}`;
        const much = on.has(mk) ? v >= H[f] - h : v >= H[f];
        const little = on.has(lk) ? v < L[f] + h : v < L[f];
        if (much) on.add(mk); else on.delete(mk);
        if (little) on.add(lk); else on.delete(lk);
      }
      let bits = 0;
      for (const k of on) bits |= BIT[k];
      g.bits = bits;
    }
    // a query always answers from a fresh measure: straight after a skip, a console crowd or anything else that
    // changed the people without a live frame (the step's measure runs once a game second)
    let measuredAt = -1, measuredN = -1;
    function fresh() {
      if (S.people.length !== measuredN || !(S.clockT >= measuredAt) || S.clockT - measuredAt >= F.MEASURE_S) measure();
    }
    function measure() {
      measuredAt = S.clockT ?? 0; measuredN = S.people.length;
      const sums = new Map();
      const add = (id, kind, ref, p, d) => {
        let s = sums.get(id);
        if (!s) sums.set(id, (s = { id, kind, ref, n: 0, f: 0, k: 0, s: 0, members: [] }));
        s.n++; s.f += p.faith; s.k += p.skep; s.s += d.s; s.members.push(p);
      };
      const clanOfP = new Map(), vilOfP = new Map();
      // everyone grown in the land, settled or not: what the forces query shows (the World door). The states and
      // their effects stay judged on the settled grown only (the 'people' group), as before.
      let an = 0, af = 0, ak = 0, as = 0;
      for (const p of S.people) {
        if (p.dead) continue;
        if (p.age >= F.GROWN) { const d0 = data(p); an++; af += p.faith; ak += p.skep; as += d0.s; }
        if (!settled(p)) continue;
        const d = data(p);
        const c = R.ask('clanOf', p), v = R.ask('villageOf', p);
        clanOfP.set(p, c); vilOfP.set(p, v);
        if (p.age < F.GROWN) continue;
        add('people', 'people', null, p, d);
        if (c) add(c.id, 'clan', c, p, d);
        if (v) add(v.id, 'village', v, p, d);
      }
      const seen = new Set(['people']);
      for (const s of sums.values()) {
        const g = groups.get(s.id) ?? (groups.set(s.id, { id: s.id, kind: s.kind, ref: s.ref, on: new Set(), bits: 0 }), groups.get(s.id));
        g.ref = s.ref; g.n = s.n; seen.add(s.id);
        g.faith = s.f / s.n; g.skepticism = s.k / s.n; g.strength = s.s / s.n;
        g.lift = { faith: 0, skepticism: 0, strength: 0 };
        if (s.kind !== 'people') for (const f of ['faith', 'skepticism', 'strength']) { const l = GA()?.groupLift(s.ref, f) ?? 0; g.lift[f] = l; g[f] = clamp(g[f] + l, 0, 100); }
        judge(g);
      }
      if (!sums.has('people')) { people.n = 0; }
      everyone.n = an; everyone.faith = an ? af / an : 0; everyone.skepticism = an ? ak / an : 0; everyone.strength = an ? as / an : 0;
      for (const [id, g] of groups) if (!seen.has(id)) groups.delete(id);
      // whose state each person lives under: their clan's if it is big enough, else their village's, else the people's
      for (const p of S.people) {
        if (p.dead) continue;
        const d = data(p);
        if (!settled(p)) { d.st = people.bits; d.grp = 'people'; continue; }
        const c = groups.get(clanOfP.get(p)?.id), v = groups.get(vilOfP.get(p)?.id);
        const g = c && c.n >= F.MIN_GROUP ? c : v && v.n >= F.MIN_GROUP ? v : people;
        d.st = g.bits; d.grp = g.id;
        d.eff = effOf(p);
      }
      for (const f of S.families) { const m = f.members.find((q) => !q.dead); R.data(f, 'forces', () => ({})).st = m ? (m.ext?.forces?.st ?? 0) : 0; }
      // the people's state changed: say so
      const was = new Set(lastPeople);
      lastPeople = [...people.on];
      if (started && people.n >= 6) {
        for (const k of people.on) if (!was.has(k)) { const w = stateWords(k); R.alert('warn', `${w.label}, across the people. ${w.effects.join(' ')}`, { x: S.stone.centre.x, z: S.stone.centre.z }); R.signal('force:state', { group: 'people', state: k, on: true }); }
        for (const k of was) if (!people.on.has(k)) { R.alert('info', `No longer ${stateWords(k).label.toLowerCase()} across the people.`, { x: S.stone.centre.x, z: S.stone.centre.z }); R.signal('force:state', { group: 'people', state: k, on: false }); }
      }
    }
    let lastPeople = [];
    R.on('phase:start', () => { started = true; measure(); });

    // ----- the shape: which corner sticks out, and by how much -----
    function shapeOf(g) {
      const v = { faith: g.faith, skepticism: g.skepticism, strength: g.strength };
      const mean = (v.faith + v.skepticism + v.strength) / 3;
      let lead = 'faith';
      for (const f of ['skepticism', 'strength']) if (v[f] > v[lead]) lead = f;
      return { lead, by: Math.round(v[lead] - mean), low: ['faith', 'skepticism', 'strength'].reduce((a, b) => (v[b] < v[a] ? b : a)), mean: Math.round(mean) };
    }
    function stateOf(g) {
      const ids = ORDER.filter((k) => g.on.has(k));
      if (!ids.length) {
        const sh = shapeOf(g);
        const text = sh.by >= 15 ? `Even enough, but ${sh.lead} sticks out (by ${sh.by}).` : 'Even: enough faith to listen, enough skepticism to think, enough strength to stand.';
        return { state: 'even', label: 'Even', states: [], text, effects: [] };
      }
      const words = ids.map(stateWords);
      return { state: ids[0], label: words.map((w) => w.label).join(', '), states: ids, text: words.map((w) => w.short).join(' '), effects: words.flatMap((w) => w.effects) };
    }
    function view(g) {
      if (!g) return null;
      const st = stateOf(g);
      const out = {
        id: g.id, kind: g.kind, name: g.kind === 'people' ? 'the people' : g.kind === 'clan' ? `the ${g.ref?.name} clan` : g.ref?.name ?? '',
        n: g.n, faith: Math.round(g.faith ?? 0), skepticism: Math.round(g.skepticism ?? 0), strength: Math.round(g.strength ?? 0),
        lift: g.lift ? { ...g.lift } : { faith: 0, skepticism: 0, strength: 0 },
        shape: (({ lead, by }) => ({ lead, by }))(shapeOf(g)), state: st.state, label: st.label, states: st.states, text: st.text, effects: st.effects,
        reach: reachOfGroup(g),
      };
      return out;
    }

    // ================= the modifiers of each state (who: the person's or family's state bits) =================
    const E = F.EFFECTS;
    // a subject may be a person, a family (its ext), or a clan or village record (never touch its scanning getters)
    const has = (b) => (s) => {
      if (!s) return false;
      const bits = s.kind === 'person' ? s.ext?.forces?.st : (s.type === 'clan' || s.type === 'village') ? groups.get(s.id)?.bits : s.ext?.forces?.st;
      return ((bits ?? 0) & b) !== 0;
    };
    R.mod('work', 'forces:much-faith', { mul: E.muchFaith.work, who: has(BIT['much-faith']), note: 'too much faith: they wait on the god' });
    R.mod('yield', 'forces:much-faith', { mul: E.muchFaith.yield, who: has(BIT['much-faith']), note: 'too much faith: the fields neglected' });
    R.mod('fight', 'forces:much-faith', { mul: E.muchFaith.fight, who: has(BIT['much-faith']), note: 'too much faith: they kneel instead' });
    R.mod('doubtDrift', 'forces:much-faith', { add: -E.muchFaith.skepFade, who: has(BIT['much-faith']), note: 'too much faith: nobody questions' });
    R.mod('faithDrift', 'forces:much-skepticism', { add: -E.muchSkep.faithFade, who: has(BIT['much-skepticism']), note: 'too much skepticism: belief dries up' });
    R.mod('think', 'forces:little-skepticism', { mul: E.littleSkep.think, who: has(BIT['little-skepticism']), note: 'too little skepticism: nobody listens to a thinker' });
    R.mod('sickness', 'forces:little-skepticism', { mul: E.littleSkep.sickness, who: has(BIT['little-skepticism']), note: 'too little skepticism: no remedies' });
    R.mod('yield', 'forces:little-skepticism', { mul: E.littleSkep.yield, who: has(BIT['little-skepticism']), note: 'too little skepticism: the old ways' });
    R.mod('grudge', 'forces:much-strength', { mul: E.muchStrength.grudge, who: has(BIT['much-strength']), note: 'too much strength: warlords' });
    R.mod('fight', 'forces:much-strength', { add: E.muchStrength.fight, who: has(BIT['much-strength']), note: 'too much strength: spoiling for it' });
    R.mod('think', 'forces:much-strength', { mul: E.muchStrength.think, who: has(BIT['much-strength']), note: 'too much strength: thinkers pushed aside' });
    R.mod('doubtDrift', 'forces:much-strength', { add: -E.muchStrength.skepFade, who: has(BIT['much-strength']), note: 'too much strength: nobody dares question' });
    R.mod('death', 'forces:little-strength', { mul: E.littleStrength.death, who: has(BIT['little-strength']), note: 'too little strength: soft' });
    // too little faith in peacetime (the battle costs wait for stage 3): hard times break them, the clans drift apart
    const hard = (p) => p?.kind === 'person' && (p.hunger > 0 || !!p.ext?.hardship?.sick || (p.grief ?? 0) > 0.4);
    const littleF = has(BIT['little-faith']);
    R.mod('happy', 'forces:little-faith', { add: E.littleFaith.heart, who: (p) => hard(p) && littleF(p), note: 'too little faith: nothing to hope for in hard times' });
    R.mod('grudge', 'forces:little-faith', { mul: E.littleFaith.grudge, who: littleF, note: 'too little faith: nothing holds the clans together' });
    // the words a family leaving under too little faith adds to its reason (people.js asks)
    R.answer('lostHeart', (f) => (f?.members?.some((m) => !m.dead && littleF(m) && hard(m)) ? ', and with nothing left to believe in, they lost heart' : ''));
    // in a fight (fights.js asks): a side's morale shift from its people's state and great warriors among them
    R.answer('moraleOf', (fighters) => {
      const list = (fighters ?? []).filter((p) => p?.kind === 'person' && !p.dead);
      if (!list.length) return 0;
      const soft = list.filter((p) => (p.ext?.forces?.st ?? 0) & BIT['little-strength']).length / list.length;
      const lead = GA()?.warriorMorale(list) ?? 0;
      return E.littleStrength.morale * soft + lead;
    });

    // ================= battle reach (for the battle system to come) =================
    function reachOfPerson(p) {
      const f = clamp((p.faith ?? 0) + (GA()?.liftOf(p, 'faith') ?? 0), 0, 100);
      return { reach: smooth(f, F.REACH[0], F.REACH[1]), shock: 1 - smooth(f, F.SHOCK[1], F.SHOCK[0]) };
    }
    function reachOfGroup(g) {
      const f = g.faith ?? 0;
      const reach = smooth(f, F.REACH[0], F.REACH[1]), shock = 1 - smooth(f, F.SHOCK[1], F.SHOCK[0]);
      return { reach: Math.round(reach * 100) / 100, shock: Math.round(shock * 100) / 100, text: reachText(reach, shock) };
    }
    const reachText = (reach, shock) => `Your powers would work at ${pct(reach)} for them in battle. An enemy god's miracle would ${shock > 0.66 ? 'shake them badly' : shock > 0.33 ? 'unsettle them' : 'hardly move them'} (shock ${pct(shock)}).`;
    R.answer('battleReach', (x) => {
      if (x?.kind === 'person') { const r = reachOfPerson(x); return { reach: Math.round(r.reach * 100) / 100, shock: Math.round(r.shock * 100) / 100, text: reachText(r.reach, r.shock) }; }
      const g = x?.id ? groups.get(x.id) : people;
      return g ? reachOfGroup(g) : null;
    });

    // ================= quiet powers: they do not take on people without faith =================
    const QF = () => E.littleFaith.quietFaith;
    function quietTargets(id, t) {
      if (!t) return null;
      if (id === 'whisper' || id === 'give-thought') return t.entity?.kind === 'person' ? { people: [t.entity], label: t.entity.name } : null;
      if (id === 'calm' || id === 'provoke') {
        let c = null;
        if (t.kind === 'clan' || t.kind === 'person') c = t.clan?.id ? R.ask('clan', t.clan.id) : t.entity?.kind === 'person' ? R.ask('clanOf', t.entity) : null;
        if (c) return { people: (c.members ?? []).filter((p) => p.stage !== 'child'), label: `the ${c.name} clan`, clan: c };
        if (t.kind === 'area') return { people: S.people.filter((p) => !p.dead && p.stage !== 'child' && p.family?.state === 'settled' && Math.hypot(p.x - t.x, p.z - t.z) <= (t.r ?? 6)), label: 'the people here' };
      }
      return null;
    }
    const faithFor = (p) => (p.faith ?? 0) + (GA()?.liftOf(p, 'faith') ?? 0);
    // the refusal text, or null if the power takes
    function quietRefusal(id, t, seenBy) {
      if (F.QUIET.includes(id)) {
        const q = quietTargets(id, t);
        if (!q || !q.people.length) return null;
        const avg = q.people.reduce((s, p) => s + faithFor(p), 0) / q.people.length;
        if (avg >= QF()) return null;
        const who = q.people.length === 1 ? `${q.label}'s faith is ${Math.round(avg)}` : `${q.label} have faith ${Math.round(avg)} on average`;
        const name = { whisper: 'A whisper', 'give-thought': 'A thought from you', calm: 'Calm', provoke: 'Provoke' }[id];
        return `${name} does not take: ${who}, under ${QF()}. Quiet powers work only on people who believe. They would feel nothing. Use something they can see.`;
      }
      if (id === 'heal' && seenBy === 0 && t) {
        const list = t.kind === 'person' ? [t.entity].filter(Boolean) : S.people.filter((p) => !p.dead && p.family?.state === 'settled' && Math.hypot(p.x - t.x, p.z - t.z) <= (t.r ?? 0) + 0.5 && (p.ext?.hardship?.sick || p.ext?.hardship?.wound || R.ask('wounded', p)));
        const low = list.filter((p) => faithFor(p) < QF());
        if (!low.length) return null;
        return `Healed where nobody sees, it does not take on ${low.slice(0, 3).map((p) => `${p.name} (faith ${Math.round(faithFor(p))})`).join(', ')}: under ${QF()}, they do not believe in such help. Heal where someone can see it (by day, out of doors), and it works.`;
      }
      return null;
    }
    const baseForecast = R.forecast, baseAct = R.act;
    R.forecast = (id, target) => {
      const t = R.target(target);
      const pre = F.QUIET.includes(id) ? quietRefusal(id, t) : null;
      if (pre) return R.refuse(pre);
      const f = baseForecast(id, target);
      if (id === 'heal' && f?.ok) { const no = quietRefusal('heal', t, f.seenBy); if (no) return R.refuse(no); }
      return f;
    };
    const healR = (t) => (t.kind === 'area' ? Math.max(1.5, t.r ?? 0) : 1.5);
    R.act = (id, target) => {
      const t = R.target(target);
      let no = F.QUIET.includes(id) ? quietRefusal(id, t) : null;
      if (!no && id === 'heal' && t) no = quietRefusal('heal', t, R.noticeCount({ kind: 'heal', x: t.x, z: t.z, r: healR(t) }));
      if (no) return { ok: false, text: no };
      // act:before / act:after (this file's own hooks, for the lines and the prayers): one object, so a hook may
      // note who was in need before the act changed it
      const ev = { id, target: t, result: null };
      R.run('act:before', ev);
      const r = baseAct(id, target);
      ev.result = r;
      if (r?.ok) R.run('act:after', ev);
      return r;
    };
    R.answer('quietTakes', (id, target) => !quietRefusal(id, R.target(target), id === 'heal' ? 0 : undefined));
    R.answer('quietPowers', () => ({ always: [...F.QUIET], unseen: ['heal'], faith: QF() }));

    // ================= too much strength: the chief, and families leaving for peaceful places =================
    const chiefs = new Map(); // village id -> person
    const leaving = new Map(); // family -> { year, village }
    R.on('year', () => {
      const vs = R.ask('villages') ?? [];
      for (const v of vs) {
        const g = groups.get(v.id);
        const warlike = g && g.n >= F.MIN_GROUP && g.on.has('much-strength');
        let chief = chiefs.get(v.id);
        if (chief && (chief.dead || !warlike || R.ask('villageOf', chief) !== v)) {
          R.trait(chief, 'tyrant', null);
          if (!chief.dead) { R.story(chief, `Stopped being chief of ${v.name}.`); R.alert('info', `${chief.name} is no longer chief of ${v.name}${warlike ? '' : ': the village has cooled'}.`, { x: v.x, z: v.z, subject: chief }); }
          chiefs.delete(v.id); chief = null;
        }
        if (warlike && !chief) {
          const best = v.members.filter((p) => p.age >= T1.CHILD_UNTIL && p.age < T1.ELDER_FROM).sort((a, b) => data(b).s - data(a).s)[0];
          if (best && data(best).s >= F.CHIEF_AT) {
            chiefs.set(v.id, best); chief = best;
            R.trait(best, 'tyrant', true);
            R.story(best, `Made ${best.sex === 'f' ? 'herself' : 'himself'} chief of ${v.name}, being the strongest.`);
            R.alert('warn', `${best.name} of the ${best.family.name} family, the strongest in ${v.name} (strength ${Math.round(data(best).s)}), has made ${best.sex === 'f' ? 'herself' : 'himself'} chief. ${best.sex === 'f' ? 'She' : 'He'} takes ${pct(F.CHIEF_TAKE)} of every other household's store each year.`, { x: v.x, z: v.z, subject: best, aside: R.aside('forces:chief', ['Nobody voted. Nobody was going to argue either.', 'Leadership, by the simplest measure.'], 120) });
            R.signal('force:chief', { person: best, village: v });
          }
        }
        if (chief) {
          let took = 0;
          for (const f of v.households) if (f !== chief.family && f.food > 0) { const k = f.food * F.CHIEF_TAKE; f.food -= k; took += k; }
          chief.family.food += took;
        }
        // families who want peace
        if (warlike) {
          for (const f of v.households) {
            if (leaving.has(f) || (chief && f === chief.family)) continue;
            const ms = f.members.filter((p) => !p.dead && p.age >= F.GROWN);
            if (!ms.length) continue;
            const s = ms.reduce((a, p) => a + data(p).s, 0) / ms.length;
            if (s > g.strength - F.LEAVE_BELOW || Math.random() >= F.LEAVE_CHANCE) continue;
            leaving.set(f, { year: S.year + F.LEAVE_WARN, village: v });
            for (const p of f.members) if (!p.dead) R.story(p, 'Tired of the raids and the strong taking what they like: talked of leaving for somewhere peaceful.');
            R.alert('warn', `The ${f.name} family are tired of the raids${chief ? ` and of ${chief.name}'s taking` : ''} in ${v.name}. They will leave for a peaceful place in about ${F.LEAVE_WARN} years, unless the village cools.`, { x: f.home?.cx, z: f.home?.cz, subject: f.leader?.() });
            R.signal('force:leaving', { family: f, village: v, year: S.year + F.LEAVE_WARN });
          }
        }
      }
      for (const [f, l] of leaving) {
        if (f.state !== 'settled' || !f.members.some((p) => !p.dead)) { leaving.delete(f); continue; }
        if (S.year < l.year) continue;
        leaving.delete(f);
        const g = groups.get(l.village.id);
        if (g && g.on.has('much-strength')) S.peopleApi.leave(f, `they left for a peaceful place, away from the raids of ${l.village.name}`, 'bad');
        else { R.alert('good', `The ${f.name} family stayed after all: ${l.village.name} has cooled.`, { x: f.home?.cx, z: f.home?.cz }); for (const p of f.members) if (!p.dead) R.story(p, 'Stayed: the village cooled.'); }
      }
    });
    R.on('fate', (p) => {
      const l = leaving.get(p.family);
      return l ? `The family means to leave for a peaceful place in about ${Math.max(1, Math.round(l.year - S.year))} years, unless ${l.village.name} cools.` : null;
    });

    // ================= queries =================
    // the levels are everyone grown in the land, settled or not (n: how many); `settled` holds the settled grown's
    // own levels, on which the state (label, text, effects) is judged. A rule that needs the settled reads
    // `.settled` by name (the scripted gods in gods.js).
    R.answer('forces', () => {
      fresh();
      const v = view(people);
      const settledView = { n: v.n, faith: v.faith, skepticism: v.skepticism, strength: v.strength, state: v.state, label: v.label };
      const out = { ...v, reach: undefined, battleReach: v.reach, chiefs: [...chiefs.values()].filter((p) => !p.dead).map((p) => ({ person: p, name: p.name, village: R.ask('villageOf', p)?.name ?? null })),
        n: everyone.n, faith: Math.round(everyone.faith), skepticism: Math.round(everyone.skepticism), strength: Math.round(everyone.strength), settled: settledView };
      if (!v.n) {
        const n = everyone.n;
        Object.assign(out, { state: 'unsettled', states: [], effects: [], label: 'No one has settled yet',
          text: n ? `No one has settled yet: ${n === 1 ? 'the one grown person here is' : `the ${n} grown people here are`} still looking for a home. These are their levels; the three forces start to shape the people once a family settles.`
            : 'No one lives here yet.' });
      }
      return out;
    });
    R.answer('forcesOf', (g) => {
      fresh();
      if (!g) return view(people);
      if (g.kind === 'person') { const c = R.ask('clanOf', g); return c ? view(groups.get(c.id)) : null; }
      return view(groups.get(g.id ?? g)) ?? null;
    });
    R.answer('forcesAll', () => { fresh(); return [...groups.values()].map(view); });
    R.answer('strengthOf', (p) => (p?.ext?.forces ? Math.round(p.ext.forces.s) : null));
    R.answer('strengthLog', (p) => {
      const d = p?.ext?.forces;
      if (!d) return null;
      const lines = d.log.map((x) => ({ ...x }));
      if (d.drift && Math.abs(d.drift.d) >= 0.5) lines.push({ y: d.drift.y, y2: yearNow(), quiet: true, d: d.drift.d, text: [...d.drift.why].join(', '), now: true });
      return { lines, drift: driftOf(p, d), strength: d.s, effective: d.eff };
    });
    R.answer('forceStateOf', (p) => { const d = p?.ext?.forces; return d ? { group: d.grp, states: ORDER.filter((k) => d.st & BIT[k]) } : null; });
    // the old faith and doubt balance's name, kept so readers of it see the new state (the bands and their effects are gone)
    R.answer('balance', () => {
      fresh();
      const v = view(people);
      const share = Math.round((people.faith + 0.5) / (people.faith + people.skepticism + 1) * 1000) / 1000;
      return { faith: v.faith, doubt: v.skepticism, skepticism: v.skepticism, strength: v.strength, net: v.faith - v.skepticism, share, lean: Math.round((share - 0.5) * 2 * 100) / 100,
        band: people.on.has('little-faith') ? 'doubt' : people.on.has('much-faith') ? 'faith' : 'even', label: v.label, text: `${v.label}. ${v.text}`, costs: v.effects, bands: [], aim: 0.5, n: v.n,
        causes: R.ask('faithCauses') ?? [], state: v.state, states: v.states };
    });
    R.answer('forces:api', () => api);

    // ================= stats, inspect =================
    R.on('stats', (st) => {
      fresh();
      let s = 0, n = 0;
      for (const p of S.people) if (!p.dead && p.family?.state === 'settled') { s += p.ext?.forces?.s ?? 0; n++; }
      st.strength = n ? Math.round(s / n) : 0;
      const b = R.ask('balance');
      st.balance = b; st.faithShare = b?.share ?? null;
      st.forces = { faith: Math.round(people.faith ?? 0), skepticism: Math.round(people.skepticism ?? 0), strength: Math.round(people.strength ?? 0), states: [...people.on], shape: shapeOf(people).lead };
    });
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const d = e.ext?.forces;
      if (!d) return;
      out.strength = Math.round(d.s);
      out.strengthEffective = Math.round(d.eff);
      const lg = R.ask('strengthLog', e), dr = lg.drift;
      const lines = [];
      const fightMul = Math.round(lerp(F.FIGHT, d.eff / 100) * 100) / 100;
      lines.push(`Now: strength ${Math.round(d.s)}${Math.round(d.eff) !== Math.round(d.s) ? ` (${Math.round(d.eff)} with ${GA()?.greatName(e, 'strength') ?? 'a great warrior'} in the clan)` : ''}: fights at ${fightMul} of an ordinary grown-up. With nothing new, about ${signed(per10(dr.rate))} every 10 years${dr.why.length ? ` (${dr.why.join(', ')})` : ''}.`);
      for (const x of [...lg.lines].reverse()) {
        const when = x.y2 && x.y2 !== x.y ? `${R.yearLabel(x.y)} to ${x.now ? 'now' : R.yearLabel(x.y2)}` : R.yearLabel(x.y);
        if (x.quiet) lines.push(`${when}, ${x.text || 'the years'}: strength ${signed(x.d)}`);
        else lines.push(`${String(x.text).replace(/\.$/, '')}${x.n > 1 ? ` (${x.n} times)` : ''}, ${when}${Math.abs(x.d) >= 0.05 ? `: strength ${signed(x.d)}` : ''}`);
      }
      out.strong = { lines: lg.lines, drift: dr };
      R.section(out, { id: 'strong', title: 'Why they are strong', lines: lines.slice(0, 11), order: 32 });
      const sv = R.ask('forceStateOf', e);
      if (sv?.states.length) out.forceStates = sv.states;
    });
    R.on('thoughts', (p) => {
      if (p.asleep || p.dead || p.age < T1.CHILD_UNTIL) return null;
      const d = p.ext?.forces;
      if (!d) return null;
      const out = [];
      if (d.s >= 75) out.push([2, 'Let the wolves come. Let anyone come.']);
      if (d.s <= 20 && !p.expectsHelp) out.push([2, 'I get tired just carrying water. When did that happen?']);
      if (d.st & BIT['much-strength'] && d.s < 45) out.push([3, 'The strong take what they like here. I dream of somewhere quiet.']);
      return out;
    });

    const api = { data, gain, effOf, driftOf, groups, people, view, stateOf, shapeOf, BIT, ORDER, stateWords, measure, chiefs, leaving, reachOfPerson, quietRefusal };
    R.forces = api;
  },
};
