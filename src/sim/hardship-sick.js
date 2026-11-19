// A. Sickness and wounds. A sickness starts in one person (more likely in a
// crowded hut, far from fresh water, or after a flood), spreads to those who
// share their hut and to those who work close by, and passes. Whether each
// sick person dies, and when, is rolled when they fall sick (so their fate
// line is exact): base SICK_DIE times their age, times the shared `sickness`
// and `death` stats (agent B's health discoveries push on those). The sick
// work at SICK_WORK, are unhappier, lie down often, and wear a sickly mantle.
// Wounds (burns from a fire, a wolf's bite) work the same way, one person at a
// time. Heal cures both. A sickness opens one moment, while someone in it is
// fated to die and can still be healed.
import { range, pick, yearLabel, number, cap } from './words.js';

const SICKNESS = [
  { id: 'fever', label: 'a fever', the: 'the fever', words: 'died of a fever' },
  { id: 'cough', label: 'the coughing sickness', the: 'the coughing sickness', words: 'died of the coughing sickness' },
  { id: 'flux', label: 'the flux', the: 'the flux', words: 'died of the flux' },
];
const WOUND_WORDS = 'died of their wounds';

export function makeSick(H) {
  const { R, S, fx } = H;
  const T = H.T;
  for (const s of SICKNESS) R.words[s.id] = s.words;
  R.words.wounds = WOUND_WORDS;
  const sick = new Set(), hurt = new Set();
  const isSick = (p) => !!p?.ext?.hardship?.sick;
  const isHurt = (p) => !!p?.ext?.hardship?.wound;
  R.mod('work', 'hardship:sick', { mul: T.SICK_WORK, who: isSick, note: 'sick' });
  R.mod('happy', 'hardship:sick', { add: T.SICK_HAPPY, who: isSick, note: 'sick' });
  R.mod('work', 'hardship:wound', { mul: T.WOUND_WORK, who: isHurt, note: 'hurt' });
  R.mod('happy', 'hardship:wound', { add: T.WOUND_HAPPY, who: isHurt, note: 'hurt' });

  // the shared traits `sick` and `wounded` (the screen draws its signs from them), and this file's own
  // marks on the body when MARKS is on (off by default: the screen's signs say the same)
  function show(p) {
    const d = p.ext?.hardship ?? {};
    R.trait(p, 'sick', d.sick ? true : null);
    R.trait(p, 'wounded', d.wound || R.ask('wounded', p) ? true : null); // a fight's wound (C) keeps the sign too
    fx.keepMark(p, T.MARKS ? (d.sick ? 'sick' : d.wound ? 'wound' : null) : null);
  }
  const LR = () => R.T.LIFE_RATE;
  const ageAt = (p, life) => Math.floor(p.age + (life - S.life));
  // the chance this person dies of a sickness they catch (or of a wound): their age, times the shared stats
  function dieChance(p, base) {
    const a = p.stage === 'child' ? T.SICK_CHILD : p.stage === 'elder' ? T.SICK_ELDER : 1;
    return Math.min(0.92, base * a * R.value('sickness', p) * R.value('death', p));
  }
  // what falling sick will do to this person: { len, die, dieIn } in life years
  function rollSick(p) {
    const len = range(T.SICK_LEN);
    const die = Math.random() < dieChance(p, T.SICK_DIE);
    return { len, die, dieIn: die ? len * range([0.45, 0.9]) : null };
  }
  function rollWound(p, base = T.WOUND_DIE) {
    const len = range(T.WOUND_LEN);
    const die = Math.random() < dieChance(p, base);
    return { len, die, dieIn: die ? len * range([0.5, 0.9]) : null };
  }

  // ---------- falling sick ----------
  function infect(p, h, pre) {
    if (!p || p.dead) return false;
    const d = H.data(p);
    if (d.sick || (d.immuneUntil ?? -1) > S.life) return false;
    if (R.ask('immuneTo', p, h.cause)) return false; // came through this sickness unaided once: immune for life (ecology.js)
    const r = pre ?? rollSick(p);
    d.sick = { h: h.id, label: h.label, the: h.the, cause: h.cause, since: S.life, until: S.life + r.len, die: r.die, dieAt: r.die ? S.life + r.dieIn : null };
    sick.add(p);
    h.people.add(p); h.families.add(p.family); h.cases++;
    if (r.die) H.trouble.roll(p);
    R.story(p, `Fell sick with ${h.label}.`);
    S.mind.push(p, pick(['My head burns. Everything aches.', 'I cannot keep anything down.', 'So cold, and then so hot.']));
    p.thinkT = 6;
    show(p);
    return true;
  }
  function wound(p, cause, o = {}) {
    if (!p || p.dead) return false;
    const d = H.data(p);
    if (d.wound) return false;
    const r = o.pre ?? rollWound(p, o.base);
    d.wound = { cause, since: S.life, until: S.life + r.len, die: r.die, dieAt: r.die ? S.life + r.dieIn : null, h: o.h?.id ?? null };
    hurt.add(p);
    if (o.h) { o.h.people.add(p); o.h.families.add(p.family); }
    if (r.die) H.trouble.roll(p);
    R.story(p, cause === 'fire' ? 'Was badly burned in a fire.' : 'Was bitten by a wolf, and the wound went bad.');
    show(p);
    return true;
  }
  function recover(p, d, how) {
    if (d.sick) {
      const h = H.get(d.sick.h);
      d.immuneUntil = S.life + T.SICK_IMMUNE;
      if (how !== 'healed') R.story(p, `Got over ${d.sick.the}.`);
      const kind = d.sick.cause;
      d.sick = null; sick.delete(p);
      R.run('sickness:recovered', { person: p, kind, how }); // ecology.js: immunity (unaided) or a short cover (healed)
      if (h) h.recovered++;
    }
    show(p);
  }

  // ---------- starting one ----------
  // who is likeliest to fall sick first: crowded huts, water far off, a family a flood went through
  function weight(p) {
    const f = p.family;
    if (p.dead || f.state !== 'settled' || isSick(p)) return 0;
    if ((H.data(p).immuneUntil ?? -1) > S.life) return 0;
    let w = 1;
    const n = f.members.length;
    if (n >= 5) w *= T.SICK_CROWD;
    const h = f.home;
    if (h && S.land.wdistAt(h.cx, h.cz) > T.SICK_FAR_WATER) w *= T.SICK_BAD_WATER;
    if ((f.ext?.hardship?.floodedUntil ?? -1) > S.year) w *= T.SICK_AFTER_FLOOD;
    return w * R.value('sickness', p);
  }
  function start(o = {}) {
    let first = o.person ?? null;
    if (!first) {
      const pool = S.people.filter((p) => !o.families || o.families.includes(p.family));
      let sum = 0;
      const ws = pool.map((p) => { const w = weight(p); sum += w; return w; });
      if (sum <= 0) return null;
      let k = Math.random() * sum;
      for (let i = 0; i < pool.length; i++) { k -= ws[i]; if (k <= 0) { first = pool[i]; break; } }
      first = first ?? pool[pool.length - 1];
    }
    const kind = o.kind ?? pick(SICKNESS);
    const h = H.begin('sickness', { x: first.x, z: first.z, r: 12, sent: !!o.sent, name: kind.id, label: kind.label, the: kind.the, cause: kind.id, cases: 0, recovered: 0, text: `${cap(kind.label)} broke out` });
    if (!infect(first, h, o.pre?.get(first))) { H.finish(h, 'passed'); return null; }
    for (const p of o.more ?? []) infect(p, h, o.pre?.get(p));
    h.first = first;
    R.alert(o.sent ? 'warn' : 'warn', `${first.name} of the ${first.family.name} family has fallen sick with ${kind.label}.${o.sent ? '' : ' It may spread to those close by.'}`, { x: first.x, z: first.z, subject: first, aside: R.aside('hardship:sickness', ASIDES) });
    H.signalStart(h);
    return h;
  }

  // ---------- each step ----------
  let acc = 0;
  function step(dLife) {
    acc += dLife;
    // the course of each sickness and wound, as rolled
    for (const p of [...sick]) {
      const d = p.ext.hardship;
      if (p.dead || !d?.sick) { sick.delete(p); continue; }
      if (d.sick.die && S.life >= d.sick.dieAt) { const h = H.get(d.sick.h); d.sick.dying = true; S.peopleApi.die(p, d.sick.cause); if (h) h.deaths++; continue; }
      if (S.life >= d.sick.until) recover(p, d, 'time');
    }
    for (const p of [...hurt]) {
      const d = p.ext.hardship;
      if (p.dead || !d?.wound) { hurt.delete(p); continue; }
      if (d.wound.die && S.life >= d.wound.dieAt) { const h = H.get(d.wound.h); S.peopleApi.die(p, 'wounds'); if (h) h.deaths++; continue; }
      if (S.life >= d.wound.until) { R.story(p, d.wound.cause === 'fire' ? 'The burns healed.' : 'The wound healed.'); d.wound = null; hurt.delete(p); show(p); }
    }
    // marks follow new figures (a child grown up)
    for (const p of sick) show(p);
    for (const p of hurt) show(p);
    // spreading, a few times a life year: the hut, and anyone working close by
    if (acc >= 0.04 && sick.size) {
      const dl = acc; acc = 0;
      for (const p of [...sick]) {
        const d = p.ext.hardship, h = H.get(d.sick.h);
        if (!h) continue;
        for (const q of p.family.members) if (q !== p) catchFrom(q, h, T.SICK_HOUSE, dl);
        if (p.hidden) continue;
        for (const q of S.people) {
          if (q === p || q.family === p.family || q.hidden || q.dead) continue;
          const dx = q.x - p.x, dz = q.z - p.z;
          if (dx * dx + dz * dz <= T.SICK_NEAR_R * T.SICK_NEAR_R) catchFrom(q, h, T.SICK_NEAR, dl);
        }
      }
    } else if (!sick.size) acc = 0;
    // each outbreak: its one moment while someone in it is fated to die, and its end
    for (const h of H.active('sickness')) {
      const doomed = [...h.people].filter((p) => !p.dead && p.ext.hardship?.sick?.h === h.id && p.ext.hardship.sick.die);
      const still = [...h.people].some((p) => !p.dead && p.ext.hardship?.sick?.h === h.id);
      if (doomed.length) {
        const p = doomed.reduce((a, b) => (a.ext.hardship.sick.dieAt < b.ext.hardship.sick.dieAt ? a : b));
        const yrs = Math.max(1, Math.round((p.ext.hardship.sick.dieAt - S.life) / LR()));
        H.moment(h, true, () => ({ text: `${cap(h.label)} is spreading. ${p.name} of the ${p.family.name} family will die of it ${yrs <= 1 ? 'within the year' : `in about ${number(yrs)} years`}, unless healed${doomed.length > 1 ? `, and ${number(doomed.length - 1)} more after` : ''}.`, x: p.x, z: p.z, kind: 'sickness', act: `Heal: H, then click ${p.sex === 'f' ? 'her' : 'him'}.` }));
      } else H.moment(h, false);
      if (!still) {
        H.finish(h, h.deaths ? 'killed' : 'passed');
        R.alert(h.deaths ? 'bad' : 'info', `${cap(h.the)} has passed. ${cap(number(h.cases))} fell sick${h.deaths ? ` and ${number(h.deaths)} died` : ' and all of them lived'}.`, { x: h.x, z: h.z });
      }
    }
  }
  function catchFrom(q, h, rate, dl) {
    if (q.dead || q.family.state !== 'settled') return;
    const d = q.ext.hardship;
    if (d?.sick || (d?.immuneUntil ?? -1) > S.life) return;
    if (Math.random() < 1 - Math.exp(-rate * dl * R.value('sickness', q))) infect(q, h);
  }

  // ---------- each year: a sickness may break out by itself ----------
  function year() {
    if (H.active('sickness').length || !H.ready()) return;
    const settled = S.people.filter((p) => !p.dead && p.family.state === 'settled');
    if (settled.length < T.SICK_MIN_PEOPLE) return;
    const crowd = Math.min(2.5, Math.max(0.4, settled.length / 45));
    if (Math.random() < T.SICK_CHANCE * crowd) start();
  }

  // ---------- for the fate panel and the forecasts ----------
  function endOf(p) {
    const d = p.ext?.hardship;
    if (!d) return null;
    let best = null;
    if (d.sick?.die) { const age = ageAt(p, d.sick.dieAt); best = { age, how: 'sickness', words: `of ${d.sick.label} at ${age}`, line: `Dies of ${d.sick.label} at ${age}, unless healed.` }; }
    if (d.wound?.die) { const age = ageAt(p, d.wound.dieAt); if (!best || age < best.age) best = { age, how: 'wounds', words: `of ${p.sex === 'f' ? 'her' : 'his'} wounds at ${age}`, line: `Dies of ${p.sex === 'f' ? 'her' : 'his'} ${d.wound.cause === 'fire' ? 'burns' : 'wound'} at ${age}, unless healed.` }; }
    return best;
  }
  function fateLines(p) {
    const d = p.ext?.hardship, out = [];
    if (d?.sick && !d.sick.die) { const y = Math.max(1, Math.round((d.sick.until - S.life) / LR())); out.push(`Has ${d.sick.label}. Will be well again in about ${number(y)} ${y === 1 ? 'year' : 'years'}.`); }
    if (d?.wound && !d.wound.die) { const y = Math.max(1, Math.round((d.wound.until - S.life) / LR())); out.push(`${d.wound.cause === 'fire' ? 'Badly burned' : 'Wounded'}. Will heal in about ${number(y)} ${y === 1 ? 'year' : 'years'}.`); }
    return out;
  }
  // what Heal would do for this person: { sick, wound, fight, fatal, was } (fight: a wound from a fight, the clans')
  function healPlan(p) {
    const d = p.ext?.hardship;
    const fight = !!R.ask('wounded', p);
    if (!fight && (!d || (!d.sick && !d.wound))) return null;
    const e = d ? endOf(p) : null;
    const fatal = !!e;
    return { p, sick: d?.sick ?? null, wound: d?.wound ?? null, fight, fatal, was: e ? `die ${e.words}` : null, end: e };
  }
  function heal(p) {
    const plan = healPlan(p);
    if (!plan) return null;
    if (plan.fight) R.ask('heal-wound', p);
    const d = p.ext?.hardship;
    if (d) {
      for (const k of ['sick', 'wound']) if (d[k]?.h) H.aid(H.get(d[k].h), p);
      recover(p, d, 'healed');
      if (d.wound) { d.wound = null; hurt.delete(p); }
      show(p);
    }
    return plan;
  }
  return { start, infect, wound, rollSick, rollWound, step, year, endOf, fateLines, healPlan, heal, isSick, isHurt, sick, hurt, SICKNESS, dieChance };
}

const ASIDES = ['Nobody has thought of washing yet. Give it a few thousand years.', 'Sharing everything has its drawbacks.', 'The cure, for now, is lying down and hoping.'];
void yearLabel;
