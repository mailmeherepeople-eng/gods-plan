// A. Saved people cause trouble later (DESIGN.md: "people you save cause
// trouble later"; "one survivor's descendant causes trouble 150 years on";
// "a few are shown as centuries past it, as a joke").
//
// The roll is made once, when a person first becomes fated to die of a
// hardship (a fatal sickness or wound, trapped in a burning hut, about to
// starve, a wolf's hunt that will kill), and kept on them while the danger
// lasts, so every forecast shows the same roll and the act carries out that
// very roll. TROUBLE_SHARE of the rolls carry trouble (start near one in
// three); of those, TROUBLE_JOKE are dated millennia past any run and never
// come (the card's "Later" row, the wry joke). The rest come inside the run:
//   gen 0   the saved person themself, at a year inside the life the save gives back
//   gen 1-2 a child or grandchild, "if the line lasts" (the forecast says so; if it dies out the
//           trouble never comes and an alert says so)
// Kinds: hoarder (empties the family store in the first lean year from the
// date), raider (steals from the nearest neighbours: trait `raider` for the
// clans subsystem to turn into a feud), preacher (trait `preacher`: spreads
// "expects help" to listeners for PREACH_YEARS), firebrand (burns a
// neighbour's field in a quarrel). When it comes, the alert names the act
// that caused it ("Her great-grandmother Asha was the one you healed in 4962 BC.").
import { yearLabel, pick, range, number, cap } from './words.js';

const KINDS = ['hoarder', 'raider', 'preacher', 'firebrand'];
const PHRASE = {
  hoarder: (y) => `turns hoarder: in the first lean year from ${y}, hides the family store and eats alone while the rest go hungry`,
  raider: (y) => `turns raider in ${y}: steals the neighbours' grain and starts a feud`,
  preacher: (y) => `starts preaching in ${y} that the stone will provide; those who listen stop working`,
  firebrand: (y) => `burns a neighbour's field in a quarrel in ${y}`,
};
const JOKE = {
  hoarder: 'opens the first shop and charges for water',
  raider: 'starts a feud over a fence that outlives the fence',
  preacher: 'insists the stone answers letters, and charges for each reply',
  firebrand: 'burns down a hall of records to win an argument about soup',
};
const REL = ['', 'child', 'grandchild', 'great-grandchild', 'great-great-grandchild'];
const his = (p) => (p.sex === 'f' ? 'her' : 'his');
const him = (p) => (p.sex === 'f' ? 'her' : 'him');
const ancestor = (sex, g) => (g <= 0 ? '' : `${'great-'.repeat(Math.max(0, g - 2))}${g >= 2 ? 'grand' : ''}${sex === 'f' ? 'mother' : 'father'}`);

export function makeTrouble(H) {
  const { R, S } = H;
  const T = H.T;
  const pending = [];
  let seq = 0;

  // ---------- the roll (cached on the person while the danger lasts) ----------
  function roll(p) {
    const d = H.data(p);
    if (d.trouble !== undefined) return d.trouble;
    d.trouble = rollNew(p);
    return d.trouble;
  }
  function rollNew(p) {
    // one system of consequences (turning.js): a turning point may be fixed on this life now instead
    if (R.ask('turning:danger', p) === 'fixed') return null;
    if (Math.random() >= T.TROUBLE_SHARE) return null;
    const kind = pick(KINDS);
    const LR = R.T.LIFE_RATE;
    if (Math.random() < T.TROUBLE_JOKE) {
      const year = Math.round(S.year + range(T.TROUBLE_JOKE_YEARS));
      return { kind, joke: true, gen: Math.round((year - S.year) * LR / 28), year };
    }
    // gen 0 needs a few grown years still ahead; a line needs children now or to come
    const canSelf = p.lifespan - Math.max(p.age, 16) >= 6;
    const hasKids = S.people.some((q) => !q.dead && (q.mother === p || q.father === p));
    const canLine = hasKids || p.age < 40;
    if (!canSelf && !canLine) return null;
    // a line of 2 or 3 generations rarely lasts in a settlement of a few dozen: children and grandchildren only
    const gen = canSelf && (!canLine || Math.random() < T.TROUBLE_SELF) ? 0 : 1 + Math.floor(Math.random() * 2);
    let year;
    if (gen === 0) {
      const a0 = Math.max(p.age + 2, 16), a1 = Math.max(a0 + 1, p.lifespan - 2);
      year = S.year + (range([a0, a1]) - p.age) / LR;
    } else year = S.year + (gen * 30 + range([-3, 8])) / LR;
    return { kind, joke: false, gen, year: Math.round(year) };
  }

  // the words for a roll, said before the act: { fates: [in-run lines], later: [past the run], troubles: [structured] }
  function lines(p, tr = roll(p)) {
    const out = { fates: [], later: [], troubles: [] };
    if (!tr) return out;
    const y = yearLabel(tr.year);
    if (tr.joke) {
      const t = `Around ${y}, one of ${his(p)} descendants, ${number(tr.gen)} generations on, ${JOKE[tr.kind]}. Not on your watch.`;
      out.later.push(t);
      out.troubles.push({ who: p.name, id: p.id, kind: tr.kind, year: tr.year, gen: tr.gen, joke: true, text: t });
      return out;
    }
    const t = tr.gen === 0 ? `Saved, ${p.name} ${PHRASE[tr.kind](y)}.` : `If ${his(p)} line lasts, ${his(p)} ${REL[tr.gen]} ${PHRASE[tr.kind](y)}.`;
    out.fates.push(t);
    out.troubles.push({ who: p.name, id: p.id, kind: tr.kind, year: tr.year, gen: tr.gen, joke: false, text: t });
    return out;
  }

  // ---------- the god saved someone fated to die ----------
  // power: the power id; was: "die of a fever at 34"; act: "healed" (for "was the one you healed in 4962 BC")
  function save(p, power, was, act) {
    const d = H.data(p);
    const tr = roll(p);
    d.trouble = undefined; // a later danger rolls afresh
    H.tally('saved');
    R.signal('hardship:saved', { person: p, power, was });
    if (!tr) return null;
    const t = { id: ++seq, saved: p, name: p.name, sex: p.sex, fam: p.family?.name, ...tr, act, actYear: S.year, power, done: false, carrier: null, text: lines(p, tr).troubles[0].text };
    pending.push(t);
    (d.troubles ?? (d.troubles = [])).push(t);
    H.tally('troubles');
    return t;
  }

  // ---------- when its time comes ----------
  // living descendants of `a`, by generation (walks up each living person's mother and father)
  function depthTo(q, a, max) {
    let level = [q];
    for (let g = 1; g <= max; g++) {
      const next = [];
      for (const x of level) for (const y of [x.mother, x.father]) { if (!y) continue; if (y === a) return g; next.push(y); }
      level = next;
      if (!level.length) return 0;
    }
    return 0;
  }
  function carrierFor(t) {
    if (t.gen === 0) return t.saved.dead ? null : t.saved;
    if (t.carrier && !t.carrier.dead) return t.carrier;
    const all = S.people.filter((q) => !q.dead && q.family?.state === 'settled' && q.age >= 15).map((q) => ({ q, g: depthTo(q, t.saved, 5) })).filter((x) => x.g > 0);
    if (!all.length) return null;
    all.sort((a, b) => Math.abs(a.g - t.gen) - Math.abs(b.g - t.gen) || b.q.age - a.q.age);
    t.carrier = all[0].q; t.carrierGen = all[0].g;
    return t.carrier;
  }
  const anyLineAlive = (t) => S.people.some((q) => !q.dead && depthTo(q, t.saved, 5) > 0);
  // integration: the wrong enters the clans' grudge ledger (C), the same size as C's own theft or burning,
  // so the alert's "There will be a feud" is what happens
  function feud(victimFam, by, size, what) {
    const C = R.ask('clans:api');
    if (!C?.add || !victimFam) return;
    const a = C.clanOfFamily(victimFam), b = C.clanOf(by);
    if (!a || !b || a === b) return;
    C.add(a, b, R.tune('fights')?.[size] ?? 22, 'wrong', `${by.name} ${what} in ${yearLabel(S.year)}`);
  }
  function causeLine(t, c) {
    const when = yearLabel(t.actYear);
    if (c === t.saved) return `${c.name} was the one you ${t.act} in ${when}.`;
    const g = t.carrierGen ?? t.gen;
    return `${cap(his(c))} ${ancestor(t.sex, g)} ${t.name} was the one you ${t.act} in ${when}.`;
  }
  const lean = (f) => f.shortRate > 0 || (R.ask('foodPressure', f) ?? 0) >= 0.4;

  function carry(t) {
    const c = carrierFor(t);
    if (!c) {
      if (t.gen === 0 || !anyLineAlive(t)) {
        t.done = true;
        R.alert('info', t.gen === 0 ? `The trouble foretold for ${t.name} never came: ${t.sex === 'f' ? 'she' : 'he'} died first.` : `The trouble foretold for ${t.name}'s line never came: the line died out.`);
      }
      return; // a line still growing up: wait for a grown descendant
    }
    const f = c.family, why = causeLine(t, c);
    if (t.kind === 'hoarder') {
      if (!lean(f)) return; // waits for a lean year
      const take = f.food * 0.85;
      f.food -= take;
      R.trait(c, 'hoarder', true);
      R.story(c, 'Hid the family grain in a lean year and ate it alone.');
      for (const m of f.members) if (m !== c) R.story(m, `Found the store empty. ${c.name} had hidden the grain.`);
      R.alert('bad', `${c.name} of the ${f.name} family hid the family grain in a lean year. Their store is nearly empty. ${why}`, { x: c.x, z: c.z, subject: c, aside: R.aside('hardship:trouble', ASIDES) });
    } else if (t.kind === 'raider') {
      const victims = S.families.filter((o) => o !== f && o.state === 'settled' && o.home && o.food > 0.5);
      victims.sort((a, b) => dist(a.home, c) - dist(b.home, c));
      const v = victims[0];
      R.trait(c, 'raider', true);
      if (v) {
        const take = v.food * 0.5;
        v.food -= take; f.food += take;
        feud(v, c, 'THEFT', 'stole half their grain');
        for (const m of v.members) R.story(m, `${c.name} of the ${f.name} family stole half our grain.`);
      }
      R.story(c, v ? `Raided the ${v.name} family's store and took half their grain.` : 'Took up raiding, though there was little left to take.');
      R.alert('bad', `${c.name} of the ${f.name} family turned raider${v ? ` and stole half the ${v.name} family's grain. There will be a feud.` : '.'} ${why}`, { x: c.x, z: c.z, subject: c, aside: R.aside('hardship:trouble', ASIDES) });
    } else if (t.kind === 'preacher') {
      R.trait(c, 'preacher', true);
      t.preachUntil = S.year + H.T.PREACH_YEARS;
      R.story(c, 'Began to preach that the stone will provide, so nobody need work.');
      R.alert('warn', `${c.name} of the ${f.name} family has begun preaching that the stone will provide. Those who listen will stop working. ${why}`, { x: c.x, z: c.z, subject: c, aside: R.aside('hardship:trouble', ASIDES) });
      t.preacher = c;
    } else if (t.kind === 'firebrand') {
      const fields = S.buildings.filter((b) => b.kind === 'field' && b.done && b.family && b.family !== f);
      fields.sort((a, b) => dist(mid(a), c) - dist(mid(b), c));
      const fl = fields[0];
      R.trait(c, 'firebrand', true); // the clans read it: a raider's temper, grudges twice as fast
      if (fl) feud(fl.family, c, 'BURN', 'burnt their field');
      R.story(c, fl ? `Set fire to the ${fl.family.name} family's field in a quarrel.` : 'Started a fire in a quarrel.');
      R.alert('bad', `${c.name} of the ${f.name} family set fire to ${fl ? `the ${fl.family.name} family's field` : 'the grass'} in a quarrel. ${why}`, { x: c.x, z: c.z, subject: c, aside: R.aside('hardship:trouble', ASIDES) });
      const at = fl ? mid(fl) : c;
      H.fire?.start({ x: at.x, z: at.z, cause: 'a quarrel', by: c });
    }
    t.done = t.kind !== 'preacher';
    t.carried = S.year;
  }
  // a preacher wins up to two listeners a year (people near them who still work, with some faith)
  function preach(t) {
    const c = t.preacher;
    if (!c || c.dead || S.year > t.preachUntil) { t.done = true; return; }
    const near = S.people.filter((q) => !q.dead && q !== c && !q.expectsHelp && q.family?.state === 'settled' && q.stage !== 'child' && q.faith >= 25 && dist(q, c) < 30);
    for (let k = 0; k < 2 && near.length; k++) {
      const q = near.splice(Math.floor(Math.random() * near.length), 1)[0];
      q.expectsHelp = true;
      R.story(q, `Listened to ${c.name} preach that the stone will provide. Works less now, for good.`);
    }
  }
  function year() {
    for (const t of pending) {
      if (t.done || t.joke) continue;
      if (t.preacher) { preach(t); continue; }
      if (S.year >= t.year) carry(t);
    }
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].done && S.year - (pending[i].carried ?? pending[i].year) > 50) pending.splice(i, 1);
  }

  // ---------- fate lines (the inspector) ----------
  function fateLines(p) {
    const d = p.ext?.hardship;
    const out = [];
    for (const t of d?.troubles ?? []) if (!t.done && !t.joke) out.push(t.gen === 0 ? `${cap(PHRASE[t.kind](yearLabel(t.year)))}.` : `If ${his(p)} line lasts, ${his(p)} ${REL[t.gen]} ${PHRASE[t.kind](yearLabel(t.year))}.`);
    for (const t of d?.troubles ?? []) if (t.joke) out.push(`Later, past your watch: ${t.text}`);
    return out;
  }
  return { roll, lines, save, year, fateLines, pending, him };
}

const ASIDES = ['Mercy has a long tail.', 'Nobody saved ever stays grateful for long.', 'You did ask for this, in a way.'];
const dist = (a, b) => Math.hypot((a.cx ?? a.x) - (b.cx ?? b.x), (a.cz ?? a.z) - (b.cz ?? b.z));
const mid = (b) => ({ x: b.mx ?? b.x, z: b.mz ?? b.z });
