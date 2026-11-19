// DEV ONLY. Test doubles for stage 2, loaded only with ?fixtures=1 (ui/plugins.js).
// Agents A, B and C build the real hardships, minds and clans in parallel; until
// they are merged this file registers stand-ins for every stage 2 power (god data
// and sim forecast / carry out), query, stat, inspect field and signal, exactly
// as docs/STAGE2-CONTRACTS.md names them, so every panel and readout of the HUD
// can be seen working. The numbers mean nothing. Without the flag it does nothing.
// Console: game.modules.ui.dev.fx.discovery() / .sickness() / .fire() / .fight() / .thought()
const ON = new URLSearchParams(location.search).get('fixtures') === '1';

const DISCOVERIES = [
  ['fire-keeping', 'Keeping fire', -5600], ['pottery', 'Pottery', -5500], ['weaving', 'Weaving', -5000], ['plough', 'The plough', -4500],
  ['copper', 'Copper', -4200], ['wheel', 'The wheel', -3500], ['writing', 'Writing', -3200], ['bronze', 'Bronze', -3000],
  ['sail', 'The sail', -2800], ['iron', 'Iron', -1200],
];
const FX = { pottery: { food: true }, weaving: { health: true }, plough: { food: true }, copper: { weapons: true }, wheel: { building: true }, writing: { building: 'records and laws' }, bronze: { weapons: true }, sail: { food: 'fish from deeper water' }, iron: { weapons: true }, 'fire-keeping': { health: true } };
const CMDS = ['store-grain', 'train-fighters', 'settle-by-water', 'honour-thinkers', 'keep-the-peace', 'tend-the-stone'];
const THOUGHTS = [
  ['boil-water', 'Water from the pot is safer than water from the pond.', 'Sensible', 'Less sickness in their family.'],
  ['store-seed', 'Keep back the best seed for next year.', 'Sensible', 'Their fields yield more.'],
  ['fire-is-hot', 'Fire is hot. Do not sleep in it.', 'Sensible', 'Fewer burns. They feel wise.'],
  ['count-days', 'The moon comes back every so many days. Count them.', 'Sensible', 'A push toward writing.'],
  ['round-rolls', 'Round things roll. Heavy round things roll heavily.', 'Sensible', 'A push toward the wheel.'],
  ['share-food', 'Share food with the family over the hill.', 'Kind', 'A grudge cools.'],
  ['forgive', 'They meant no harm by it.', 'Kind', 'Forgives one wrong.'],
  ['stone-listens', 'The stone listens when you sing to it.', 'Faith', 'Prays more; faith up.'],
  ['ask-why', 'Why does the river never run out?', 'Doubt', 'Questions more; doubt up.'],
  ['four-dimensions', 'The universe has four dimensions.', 'Absurd', 'Stares at the sky. Works a little less.'],
  ['birds-spies', 'The birds are counting us.', 'Absurd', 'Throws stones at birds. Neighbours worry.'],
  ['neighbours-steal', 'The family by the river steals your grain.', 'Dangerous', 'A grudge grows. Maybe a raid.'],
  ['chosen', 'You alone were chosen by the stone.', 'Dangerous', 'Pride. Others start to resent them.'],
];
const NAMES = ['Ash Hollow', 'Reedford', 'Two Stones', 'Heronmere', 'Flint Rise', 'Willowbank', 'Cold Spring', 'Oxbend'];

function godData() {
  const area = (min, max, value) => ({ min, max, value, step: 1, label: 'Radius' });
  return [
    { id: 'heal', name: 'Heal', group: 'mercy', icon: 'heal', hotkey: 'H', target: ['person', 'area'], radius: area(2, 12, 5),
      hint: 'Click a person to heal them, or the ground to heal everyone in the ring.', label: 'Heal: click a person, or the ground for everyone in the ring.',
      pointAt: 'Point at a person, or at the ground', tip: 'Heal the sick and the wounded', inspector: { person: ['Heal this person', 'Ready Heal, then click them. The card shows who would see.'] } },
    { id: 'bless-harvest', name: 'Bless the harvest', group: 'mercy', icon: 'harvest', hotkey: 'R', target: 'area', radius: area(4, 20, 10),
      hint: 'Click over fields. Rain comes, crops swell, a drought there ends.', label: 'Bless the harvest: click over fields.', pointAt: 'Point at fields', tip: 'Bless the harvest, bring rain' },
    { id: 'send-sickness', name: 'Send sickness', group: 'harm', icon: 'sick', target: 'area', radius: area(3, 14, 6), confirm: 'hold',
      hint: 'Press and hold on the ground until the ring fills. A fever takes hold of everyone inside.', label: 'Send sickness: press and hold on the ground.', pointAt: 'Point at the ground', tip: 'Send a sickness' },
    { id: 'send-fire', name: 'Send fire', group: 'harm', icon: 'fire', target: 'area', radius: area(2, 10, 4), confirm: 'hold',
      hint: 'Press and hold until the ring fills. Fire takes whatever stands inside.', label: 'Send fire: press and hold on the ground.', pointAt: 'Point at the ground', tip: 'Send fire' },
    { id: 'send-flood', name: 'Send flood', group: 'harm', icon: 'flood', target: 'area', radius: area(4, 18, 8), confirm: 'hold',
      hint: 'Press and hold by water until the ring fills. The water rises over the low ground.', label: 'Send flood: press and hold by water.', pointAt: 'Point at the ground', tip: 'Send a flood' },
    { id: 'whisper', name: 'Whisper an idea', group: 'minds', icon: 'whisper', target: 'person', confirm: 'hold',
      hint: 'Press and hold on a person. They make the next discovery now, and never think for themselves again.', label: 'Whisper an idea: press and hold on a person.',
      pointAt: 'Point at a person', tip: 'Whisper an idea', inspector: { person: ['Whisper an idea to them', 'They make the next discovery at once. Their faith goes to the top and they never think again.'] } },
    { id: 'give-thought', name: 'Give a thought', group: 'minds', icon: 'thought', hotkey: 'G', target: 'person',
      hint: 'Click a person to choose a thought for them, or type your own.', label: 'Give a thought: click a person.', pointAt: 'Point at a person', tip: 'Give someone a thought',
      inspector: { person: ['Give a thought', 'Choose a ready thought for them, or type your own.'] } },
    { id: 'commandment', name: 'Commandment', group: 'minds', icon: 'tablet', target: 'none', dock: false, hint: 'Issued from the commandments panel.' },
    { id: 'bless-weapons', name: 'Bless weapons', group: 'war', icon: 'club', target: 'clan',
      hint: 'Click anyone of a clan. The whole clan fights better for a few years.', label: 'Bless weapons: click anyone of a clan.', pointAt: 'Point at anyone of a clan', tip: 'Bless a clan\'s weapons' },
    { id: 'calm', name: 'Calm', group: 'war', icon: 'calm', hotkey: 'C', target: ['clan', 'area'], radius: area(4, 16, 8),
      hint: 'Click anyone of a clan, or the ground. Grudges cool.', label: 'Calm: click a clan, or the ground.', pointAt: 'Point at a clan or the ground', tip: 'Calm tempers' },
    { id: 'provoke', name: 'Provoke', group: 'war', icon: 'provoke', hotkey: 'P', target: ['clan', 'area'], radius: area(4, 16, 8), confirm: 'hold',
      hint: 'Press and hold on a clan or the ground. Grudges flare.', label: 'Provoke: press and hold on a clan or the ground.', pointAt: 'Point at a clan or the ground', tip: 'Stir up a grudge' },
    { id: 'favour', name: 'Favour', group: 'war', icon: 'favour', target: 'clan',
      hint: 'Click anyone of a clan to make it your favourite. Nobody notices; you just follow them more easily.', label: 'Favour: click anyone of a clan.', pointAt: 'Point at anyone of a clan', tip: 'Favour a clan (nobody notices)' },
  ];
}

export default (ON ? [{ type: 'panel', id: 'fixtures', region: 'root', make(U) { install(U); const el = document.createElement('div'); el.className = 'fx-badge'; el.textContent = 'Test data (fixtures)'; el.title = 'Loaded with ?fixtures=1. Stand-ins for stage 2 until the real subsystems arrive.'; return el; } }] : []);

function install(U) {
  const sim = U.sim(), god = U.god();
  if (!sim?.seam || !god) { console.warn('fixtures: needs the simulation and the god'); return; }
  console.info('fixtures: stage 2 test doubles are on (?fixtures=1)');
  const fx = {};
  U.fx = fx;
  sim.seam.add({ id: 'fixtures', init(R) { build(R, U, fx); } });
  for (const d of godData()) god.registerPower(d);
  if (U.ctx.modules.ui) U.ctx.modules.ui.dev.fx = fx;
}

function build(R, U, fx) {
  const S = R.S;
  const rnd = (() => { let s = 99; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const alive = () => S.people.filter((p) => !p.dead);
  const settled = () => alive().filter((p) => p.family?.state === 'settled');
  const near = (x, z, r) => alive().filter((p) => !p.hidden && Math.hypot(p.x - x, p.z - z) <= r);
  const who = (n) => (n === 1 ? 'one person' : `${R.number(n)} people`);

  // ---------- clans: families, with a village name, grudges and the favour flag (C answers these) ----------
  const grudge = new Map();   // "a|b" -> 0..1
  let favoured = null;
  const vName = new Map();
  const clanOfFam = (f) => {
    if (!f) return null;
    if (!vName.has(f.id)) vName.set(f.id, NAMES[vName.size % NAMES.length]);
    const home = f.home;
    const id = `clan:${f.id}`;
    const others = S.families.filter((g) => g !== f && g.state === 'settled');
    return { id, name: f.name, dye: f.dye, family: f, members: f.members.filter((m) => !m.dead),
      village: home ? { name: vName.get(f.id), x: home.mx ?? home.cx, z: home.mz ?? home.cz } : null,
      grudges: others.map((g) => ({ clan: `clan:${g.id}`, level: grudge.get(`${f.id}|${g.id}`) ?? 0 })).filter((g) => g.level > 0.02),
      favoured: favoured === id };
  };
  R.answer('clanOf', (p) => clanOfFam(p?.family));
  R.answer('clanMembers', (c) => (c?.kind === 'person' ? clanOfFam(c.family)?.members : c?.members ?? clanOfFam(c?.family)?.members) ?? []);
  R.answer('clans', () => S.families.filter((f) => f.state === 'settled').map(clanOfFam));
  R.on('year', () => {
    const fams = S.families.filter((f) => f.state === 'settled');
    for (const a of fams) for (const b of fams) if (a !== b && rnd() < 0.08) {
      const k = `${a.id}|${b.id}`; grudge.set(k, Math.min(1, (grudge.get(k) ?? 0) + rnd() * 0.12));
    }
  });

  // ---------- minds: discoveries, Earth, the balance, commandments, thoughts (B) ----------
  const made = [];
  let active = ['store-grain'];
  const thinkersLeft = () => DISCOVERIES.filter(([id]) => !made.some((m) => m.id === id));
  function discover(person) {
    const next = thinkersLeft()[0];
    if (!next) return null;
    const p = person ?? settled().filter((q) => q.stage !== 'child')[Math.floor(rnd() * Math.max(1, settled().length))] ?? null;
    const d = { id: next[0], name: next[1], person: p, year: Math.floor(S.year), earthYear: next[2], effects: FX[next[0]] ?? {}, x: p?.x, z: p?.z };
    made.push(d);
    R.signal('mind:discovery', d);
    if (p) R.story(p, `Discovered ${next[1].toLowerCase()} in ${R.yearLabel(d.year)}.`);
    R.alert('good', `${p ? p.name : 'Someone'} has discovered ${next[1].toLowerCase()}.`, { x: p?.x, z: p?.z, subject: p });
    return d;
  }
  R.answer('discoveries', () => ({ made: made.slice(), next: thinkersLeft().slice(0, 4).map(([id, name, earthYear]) => ({ id, name, earthYear })) }));
  R.answer('earth', () => {
    const last = made[made.length - 1];
    const ahead = last ? last.earthYear - last.year : -Math.round((S.year - -5600));
    return { year: last ? last.earthYear : -5600, ahead };
  });
  R.answer('balance', () => {
    const l = settled();
    if (!l.length) return undefined;
    const faith = l.reduce((a, p) => a + p.faith, 0) / l.length, doubt = l.reduce((a, p) => a + p.skep, 0) / l.length;
    return { faith, doubt, net: faith - doubt, causes: ['Seen acts at the stone', 'Few hardships lately', 'Thinkers among the Oaks'] };
  });
  R.answer('commandments', () => CMDS.map((id) => ({ id, active: active.includes(id) })));
  R.answer('obedience', (p, id) => (active.includes(id) ? Math.max(0, Math.min(1, (p.faith - 20) / 60)) : 0));
  R.answer('readyThoughts', () => THOUGHTS.map(([id, text, group, hint]) => ({ id, text, group, hint })));
  const given = new Map(); // person -> [{ text, asOwn, changed, year }]

  // ---------- hardships (A) and fights (C) ----------
  const hard = new Map();
  let hseq = 0, fseq = 0;
  function startHardship(kind, x, z, r, sent = false) {
    const id = `h${++hseq}`;
    const people = near(x, z, r);
    const h = { id, kind, x, z, r, people, sent, until: S.year + 6, families: [...new Set(people.map((p) => p.family))] };
    hard.set(id, h);
    for (const p of people) if (kind === 'sickness') R.trait(p, 'sick', true);
    R.signal('hardship:start', h);
    const txt = { sickness: `A fever has taken hold of ${who(people.length)}.`, fire: 'A fire is spreading through the huts.', flood: 'The river is rising over the low ground.', drought: 'No rain has come for two years. The fields are cracking.', hunger: 'The stores are empty. A family is going hungry.' }[kind];
    R.moment.open(`sim:hardship:${id}`, { text: txt, x, z, kind, act: kind === 'sickness' ? 'Heal: H, then click them or the ground.' : kind === 'drought' ? 'Bless the harvest: R, then click the fields.' : '' });
    R.alert('warn', txt, { x, z, subject: people[0] });
    return h;
  }
  function endHardship(h, outcome = 'passed') {
    hard.delete(h.id);
    for (const p of h.people) R.trait(p, 'sick', null);
    R.moment.close(`sim:hardship:${h.id}`);
    R.signal('hardship:end', { id: h.id, kind: h.kind, outcome, deaths: 0, survivors: h.people.length });
  }
  R.answer('hardships', () => [...hard.values()].map(({ until, ...h }) => h));
  const fights = new Map();
  function startFight() {
    const fams = S.families.filter((f) => f.state === 'settled' && f.members.some((m) => !m.dead));
    if (fams.length < 2) return null;
    const a = clanOfFam(fams[0]), b = clanOfFam(fams[1]);
    const ah = fams[0].home, bh = fams[1].home;
    const x = ((ah?.cx ?? 150) + (bh?.cx ?? 150)) / 2, z = ((ah?.cz ?? 150) + (bh?.cz ?? 150)) / 2;
    const id = `f${++fseq}`;
    const f = { id, kind: rnd() < 0.5 ? 'raid' : 'skirmish', a, b, x, z, until: S.year + 4 };
    fights.set(id, f);
    for (const m of [...a.members, ...b.members]) if (m.stage !== 'child') R.trait(m, 'wounded', rnd() < 0.25 ? true : null);
    R.signal('fight:start', f);
    R.moment.open(`sim:fight:${id}`, { text: `The ${a.name} are going for the ${b.name} over the water.`, x, z, kind: 'fight', act: 'Calm: C, then click either side. Or bless one side.' });
    R.alert('bad', `The ${a.name} and the ${b.name} have come to blows.`, { x, z });
    return f;
  }
  R.answer('fights', () => [...fights.values()].map(({ until, ...f }) => f));

  R.on('year', ({ year }) => {
    if (year % 9 === 0 && settled().length) discover();
    for (const h of [...hard.values()]) if (S.year > h.until) endHardship(h);
    for (const f of [...fights.values()]) if (S.year > f.until) { fights.delete(f.id); R.moment.close(`sim:fight:${f.id}`); R.signal('fight:end', { id: f.id, deaths: 0, winner: f.a.id }); }
  });
  fx.discovery = () => discover();
  fx.sickness = () => { const p = settled()[0]; return p ? startHardship('sickness', p.x, p.z, 8) : null; };
  fx.fire = () => { const p = settled()[1] ?? settled()[0]; return p ? startHardship('fire', p.x + 3, p.z, 5) : null; };
  fx.drought = () => { const p = settled()[0]; return p ? startHardship('drought', p.x - 6, p.z + 4, 10) : null; };
  fx.fight = () => startFight();

  // ---------- powers: forecast and carry out (the real ones are A's, B's and C's) ----------
  const SEEN = { faith: 3, doubt: -2, early: 2, hooks: true, what: 'something no person could do' };
  const peopleIn = (t) => (t.kind === 'area' ? near(t.x, t.z, t.r ?? 0) : t.entity ? [t.entity] : []);
  const clanIn = (t) => (t.kind === 'clan' ? (t.clan?.members ?? clanOfFam(t.entity?.family)?.members ?? []) : peopleIn(t));
  const describe = (t, spec = SEEN) => R.describeWitness(spec, t.x, t.z, t.r ?? 2);
  const P = {};
  P.heal = {
    forecast(t) {
      const list = peopleIn(t);
      if (!list.length && t.kind !== 'area') return R.refuse('Point at a person, or at the ground.');
      const sick = list.filter((p) => R.trait(p, 'sick'));
      const w = describe(t);
      return { gains: sick.length ? [`${R.cap1(who(sick.length))} recover from the fever at once.`] : ['Aches and small hurts mended.'],
        costs: [...w.costs, ...(sick.length ? [] : ['Nobody here was sick: a power spent on nothing much.'])], who: w.who, seenBy: w.seenBy,
        fates: sick.slice(0, 3).map((p) => `${p.name}: was to die of the fever at ${Math.floor(p.age) + 1}. Now lives to ${Math.floor(p.age) + 31}.`),
        later: sick.length ? ['One of those you heal has a great-granddaughter who will burn the granary in 4790 BC. Not your watch.'] : [], people: list.length };
    },
    carryOut(t) { for (const p of peopleIn(t)) { R.trait(p, 'sick', null); R.story(p, 'Was healed by a warmth nobody could explain.'); } return { ok: true, text: 'The fever broke.', x: t.x, z: t.z, r: t.r ?? 2 }; },
  };
  P['bless-harvest'] = {
    forecast(t) { const w = describe(t); const fams = new Set(peopleIn(t).map((p) => p.family)); return { gains: [`Rain on the fields of ${fams.size} ${fams.size === 1 ? 'family' : 'families'}.`, 'Crops grow half again as fast this year.'], costs: [...w.costs, 'Those who see it work the fields a little less.'], who: w.who, seenBy: w.seenBy, fates: [] }; },
    carryOut(t) { return { ok: true, text: 'Rain fell, softly, only there.', x: t.x, z: t.z, r: t.r }; },
  };
  const harsh = (kind, gains, costs) => ({
    forecast(t) {
      const list = peopleIn(t), w = describe(t, { ...SEEN, faith: 6, doubt: -4, happy: -10 });
      return { gains, costs: [`${R.cap1(who(list.length))} inside the ring.`, ...costs(list), ...w.costs], who: w.who, seenBy: w.seenBy, confirm: 'hold',
        fates: list.slice(0, 4).map((p, i) => (i % 2 ? `${p.name}: was to live to 60. Now dies at ${Math.floor(p.age) + 1}.` : `${p.name}: lives, but loses a child.`)),
        later: list.length ? ['A survivor\'s grandson will remember this, and turn the clan against the stone around AD 300. Long after your watch.'] : [], people: list.length };
    },
    carryOut(t) { R.bolt(t.x, 17, t.z); startHardship(kind, t.x, t.z, t.r ?? 4, true); return { ok: true, text: `You sent ${kind}.`, x: t.x, z: t.z, r: t.r }; },
  });
  P['send-sickness'] = harsh('sickness', ['Fewer mouths to feed this winter.'], (l) => [`About ${Math.ceil(l.length / 3)} of them will die.`]);
  P['send-fire'] = harsh('fire', ['Old huts cleared away.'], () => ['Homes and stores inside burn.']);
  P['send-flood'] = harsh('flood', ['The soil is richer afterwards.'], () => ['Fields under water for a year.']);
  P.whisper = {
    forecast(t) {
      const p = t.entity; if (!p) return R.refuse('Point at a person.');
      const next = thinkersLeft()[0];
      if (!next) return R.refuse('There is nothing left to discover.');
      const w = describe(t, { faith: 0 });
      return { gains: [`${p.name} discovers ${next[1].toLowerCase()} now, years early.`], costs: [`${p.name}'s faith goes to the top. They never think for themselves again.`, ...w.costs], who: w.who, seenBy: w.seenBy, confirm: 'hold',
        fates: [`${p.name}: was to become a thinker. Now a believer, and a useless one.`] };
    },
    carryOut(t) { const p = t.entity; p.faith = 100; R.trait(p, 'whispered', true); discover(p); return { ok: true, text: `${p.name} had an idea.`, x: p.x, z: p.z, r: 2 }; },
  };
  P['give-thought'] = {
    forecast(t) {
      const p = t.entity; if (!p) return R.refuse('Point at a person.');
      const a = t.args ?? {};
      const th = THOUGHTS.find(([id]) => id === a.thought);
      if (!th && !a.text) return R.shape({ ok: true, gains: [], costs: [], who: 'Choose a thought first.', seenBy: 0, fates: [] });
      const own = Math.max(0.05, Math.min(0.95, (p.skep + 10) / 120)), changed = th ? 0.7 : 0.35;
      return { gains: [th ? th[3] : 'A general nudge: they act a little out of the ordinary for a while.'], costs: [own < 0.5 ? 'They may take it as a voice from above: faith up, doubt down.' : 'They will most likely think it was their own idea.'],
        who: 'Nobody else hears it.', seenBy: 0, fates: th?.[2] === 'Dangerous' ? [`${p.name}: was to die old and at peace. Now dies at ${Math.floor(p.age) + 9}, in a quarrel.`] : [],
        chance: { asOwn: own, fromAbove: 1 - own, changed } };
    },
    carryOut(t) {
      const p = t.entity, a = t.args ?? {};
      const th = THOUGHTS.find(([id]) => id === a.thought);
      const text = th ? th[1] : String(a.text ?? '').slice(0, 140);
      if (!text) return { ok: false, text: 'No thought was given.' };
      const asOwn = rnd() < (p.skep + 10) / 120, changed = rnd() < (th ? 0.7 : 0.35);
      p.planted = { text, from: 'you' };
      R.S.mind.push(p, text);
      const list = given.get(p) ?? []; list.push({ text, asOwn, changed, year: Math.floor(S.year) }); given.set(p, list);
      R.story(p, asOwn ? `Had a thought of their own: "${text}"` : `Heard a voice from above: "${text}"`);
      R.signal('mind:thought-given', { person: p, text, asOwn, changed });
      return { ok: true, text: asOwn ? `${p.name} thinks it was their own idea.` : `${p.name} heard it as a voice from above.`, x: p.x, z: p.z, r: 0 };
    },
  };
  P.commandment = {
    forecast(t) {
      const a = t.args ?? {};
      const id = a.commandment;
      if (!CMDS.includes(id)) return R.refuse('Choose a commandment.');
      const n = settled().length, obey = settled().filter((p) => (p.faith - 20) / 60 >= 0.5).length;
      if (a.on === false) return { gains: [`Those who obeyed it are free of it.`], costs: ['Some will think the stone has changed its mind.'], who: `Heard by everyone awake (${n}).`, seenBy: n, fates: [] };
      return { gains: [`About ${obey} of ${n} people will obey it.`], costs: [a.replace ? `It replaces ${a.replace.replace(/-/g, ' ')}.` : 'One of your two commandments is taken.', 'Faith +2, doubt +1 in everyone awake: they heard it.'],
        who: `Heard by everyone awake (${n}).`, seenBy: n, fates: id === 'train-fighters' ? ['Two of the Oaks\' sons will die young, in fights they started.'] : [], later: id === 'tend-the-stone' ? ['In 3100 BC a priesthood of stone-tenders will rule the river. You will not see it.'] : [] };
    },
    carryOut(t) {
      const a = t.args ?? {};
      if (a.on === false) active = active.filter((x) => x !== a.commandment);
      else { if (a.replace) active = active.filter((x) => x !== a.replace); if (!active.includes(a.commandment)) active.push(a.commandment); active = active.slice(-2); }
      R.signal('mind:commandments', { active: active.slice() });
      return { ok: true, text: 'Your word is heard.', x: S.stone.centre.x, z: S.stone.centre.z, r: 0 };
    },
  };
  const clanPower = (gains, costs, apply, confirm = 'click') => ({
    forecast(t) {
      const list = clanIn(t);
      if (!list.length) return R.refuse('Point at anyone of a clan.');
      const w = describe(t);
      const name = t.kind === 'clan' ? (t.clan?.name ?? t.entity?.family?.name) : null;
      return { gains: gains(name, list), costs: [...costs(name, list), ...w.costs], who: w.who, seenBy: w.seenBy, confirm, fates: [], people: list.length };
    },
    carryOut(t) { apply(t, clanIn(t)); return { ok: true, text: 'Done.', x: t.x, z: t.z, r: t.r ?? 3 }; },
  });
  P['bless-weapons'] = clanPower((n, l) => [`The ${n ?? 'clan'} (${l.length}) fight half again as well for 5 years.`], () => ['Blessed fighters go looking for a fight.'], () => {});
  P.calm = clanPower((n) => [n ? `The ${n}'s grudges cool by half.` : 'Grudges here cool by half.'], () => ['A wrong left unanswered can fester.'], (t) => { for (const k of grudge.keys()) grudge.set(k, grudge.get(k) / 2); });
  P.provoke = clanPower((n) => [n ? `The ${n} remember every wrong ever done to them.` : 'Old wrongs flare up here.'], (n, l) => [`A raid is likely within 3 years: ${l.length} people at risk.`], () => {}, 'hold');
  P.favour = {
    forecast(t) {
      const c = t.kind === 'clan' ? (t.clan ?? clanOfFam(t.entity?.family)) : null;
      if (!c) return R.refuse('Point at anyone of a clan.');
      const on = favoured !== c.id;
      return { gains: [on ? `The ${c.name} are pinned at the top of your screen and easy to follow.` : `The ${c.name} are no longer your favourite.`], costs: ['Nothing at all. Nobody notices.'], who: 'Nobody notices. Ever.', seenBy: 0, fates: [] };
    },
    carryOut(t) { const c = t.clan ?? clanOfFam(t.entity?.family); favoured = favoured === c?.id ? null : c?.id ?? null; return { ok: true, text: 'Noted.', x: t.x, z: t.z, r: 0 }; },
  };
  for (const [id, p] of Object.entries(P)) R.power({ id, ...p, witness: id === 'favour' || id === 'give-thought' ? { r: 0, what: 'nothing' } : SEEN });
  fx.thought = () => { const p = settled()[0]; return p ? R.act('give-thought', { kind: 'person', entity: p, x: p.x, z: p.z, args: { thought: 'four-dimensions' } }) : null; };

  // ---------- inspect sections, stats and fate lines ----------
  R.on('inspect', (e, out) => {
    if (e?.kind === 'person' && !e.dead) {
      const c = clanOfFam(e.family);
      if (c) R.section(out, { id: 'clan', title: 'Clan', order: 10, rows: [['Clan', `the ${c.name}`], ['Village', c.village?.name ?? 'none yet'], ['Grudges', c.grudges.length ? c.grudges.map((g) => `${g.clan.replace(/^clan:f\d+/, (m) => S.families.find((f) => `clan:${f.id}` === m)?.name ?? m)} ${Math.round(g.level * 100)}`).join(', ') : 'none']] });
      const obey = active.map((id) => [id.replace(/-/g, ' ').replace(/^\w/, (x) => x.toUpperCase()), `${Math.round(Math.max(0, Math.min(1, (e.faith - 20) / 60)) * 100)} percent`]);
      if (obey.length) R.section(out, { id: 'obeys', title: 'Obeys', order: 20, rows: obey });
      // (thoughts you gave: the HUD lists them itself from mind:thought-given, so B need not send a section)
      void given;
      if (R.trait(e, 'sick')) R.section(out, { id: 'health', title: 'Health', order: 5, lines: ['Fever. Will die of it in 2 years unless healed.'] });
      if (R.trait(e, 'whispered')) out.whispered = true;
    }
    if (e?.cat === 'building' && e.family) R.section(out, { id: 'owner', title: 'Whose', rows: [['Clan', `the ${e.family.name}`], ['Village', clanOfFam(e.family)?.village?.name ?? '-']] });
  });
  R.on('fate', (p) => (R.trait(p, 'sick') ? 'Has a fever.' : null));
  R.on('stats', (st) => { st.discoveries = made.length; st.sick = alive().filter((p) => R.trait(p, 'sick')).length; st.fights = fights.size; });
}
