// Great people and blessed lines (DESIGN.md "Great people and blessed lines"; rules and numbers: docs/FORCES.md).
//
// Great people. Now and then someone becomes great in one force by reaching a high level through their own life
// (not born to it): a warrior (strength), a thinker (skepticism), a seer (faith). They get a name and a mark, a
// line in their story and an alert. A great person lifts their clan: the clan's level in that force stands
// GREAT_LIFT higher (a warrior's clan fights as if that much stronger and its band holds better; a thinker's clan
// thinks faster; a seer's clan keeps its faith and prays more). When one dies the clan's level drops, and the
// god is told with the numbers.
//
// Blessed lines. A line is a family line by blood: every family that walks in from the mist founds one (all its
// members belong to it); a child born here belongs to the line of the parent whose line the god has marked more
// (a tie: the mother's). Marriage changes nobody's line, and clan merges do not touch lines (a line is blood, a
// clan is a household's name). A line ends when its last member dies. Each time the god helps a member who
// needed it, the line gains a mark of the matching kind; marks fade; enough of them and the line is blessed:
// one child in each generation is born gifted and becomes great in the force the god's help mostly fed.
import { clamp, cap1, settled } from './science-util.js';
import { number } from './words.js';
import { hardshipApi } from './hardship.js';

export const TUNE_GREAT = {
  // ---- great people ----
  AT: { faith: 72, skepticism: 66, strength: 60 }, // the level that makes a candidate ...
  ABOVE: 12,            // ... and at least this far above the people's level in that force (they stand out)
  GAINED: 10,           // and they must have risen at least this much in it since they were born or came (their own life)
  AGE: [18, 60],        // grown, not yet old
  CHANCE: 0.04,         // a calendar year, for each candidate
  PER_CLAN: 1,          // at most this many great people of one force in a clan at once
  PER_GROWN: 15,        // and at most one great person (any force) per this many grown people
  ACTIVE_LIFE: 30,      // a warrior must have faced a wolf, a hardship or a fight, or hunted, in this many life years;
                        // a seer must have prayed in it; a thinker must think toward a discovery (science.js)
  THINK_CLAN: 1.5, THINK_SELF: 2, // a great thinker: the clan thinks this much faster; the thinker this much
  SEER_KEEP: 0.06,      // a great seer: the clan's faith fades this much less a life year (faith.js fades 0.1)
  SEER_PRAY: 2,         // and its people's prayers reach you this many times as often (forces-prayers.js)
  WARRIOR_MORALE: 0.12, // a great warrior in a band: its morale this much higher (fights-battle.js morale about 0.6)
  // ---- blessed lines ----
  KIND: { heal: 'faith', 'bless-harvest': 'faith', deer: 'faith', strike: 'strength', 'bless-weapons': 'strength', tested: 'strength', 'give-thought': 'skepticism', whisper: 'skepticism' },
  WEIGHT: { 'give-thought': 0.5, whisper: 1.5 }, // a mark's weight (others 1)
  HALF_LIFE: 50,        // calendar years: a mark's weight halves (about a generation; at three generations it is an eighth)
  BLESS_AT: 5,          // weight that makes a line blessed
  KEEP_AT: 2.5,         // a blessed line under this is no longer blessed
  GAP: 8,               // at most one mark per line every this many calendar years
  SHARED: 2, SHARED_POW: 3, // with more lines blessed than SHARED, every line's marks fade (blessed / SHARED) ^ SHARED_POW times as fast
                        // (three blessed: 3.4 times, four: 8 times; the god's watching is divided)
  GEN_YEARS: 50,        // one gifted child per generation of a blessed line (calendar years between two)
  GIFT_AGE: 16,         // the gifted child becomes great at this age
  WATCH_FROM: 0.5,      // a line with at least this much weight is "watched"
  DEER_R: 45,           // a deer dropped this close to a hungry family's home feeds them
  WOLF_R: 25,           // a wolf struck with a person this close (or hunting one) saved them
  HISTORY: 8,
};
const G = TUNE_GREAT;
const KINDS = { strength: 'warrior', skepticism: 'thinker', faith: 'seer' };
const MARKS = { strength: 'spear', skepticism: 'owl', faith: 'eye' };
const EPITHETS = {
  strength: ['the Bold', 'Stonearm', 'Wolfbane', 'the Unbowed', 'Longspear', 'the Bear'],
  skepticism: ['the Wise', 'Who Asks', 'the Counter', 'Sharp-Eyed', 'Who Questions Stones', 'the Measurer'],
  faith: ['Who Hears', 'Sky-Touched', 'the Stone\'s Voice', 'the Kneeling', 'Dream-Walker', 'the Lamp'],
};
const HELP_WORDS = { heal: 'healed', 'bless-harvest': 'fed by rain on their fields', deer: 'fed by a deer you put at their door', strike: 'saved from a wolf', 'bless-weapons': 'their weapons blessed', tested: 'came through a hardship you sent', 'give-thought': 'given a thought', whisper: 'whispered to' };
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const r1 = (v) => Math.round(v * 10) / 10;

export default {
  id: 'forces-great',
  tune: TUNE_GREAT,
  init(R) {
    const { S } = R;
    const T1 = R.T;
    const FA = () => R.forces;
    const year = () => Math.floor(S.year);
    const level = (p, f) => (f === 'faith' ? p.faith : f === 'skepticism' ? p.skep : p.ext?.forces?.s ?? 0);
    const setLevel = (p, f, v) => { if (f === 'faith') p.faith = clamp(v, 0, 100); else if (f === 'skepticism') p.skep = clamp(v, 0, 100); else { const d = p.ext?.forces; if (d) { d.s = clamp(v, 0, 100); d.eff = FA()?.effOf(p) ?? d.s; } } };
    const clanOf = (p) => R.ask('clanOf', p);

    // ================= great people =================
    const greats = new Map(); // person -> { person, force, kind, title, mark, since, clanId, gifted }
    const fallen = [];         // the dead great, newest last
    let byClan = new Map();    // clan id -> Set of forces with a living great
    function reindex() {
      byClan = new Map();
      for (const g of greats.values()) {
        const c = clanOf(g.person);
        g.clanId = c?.id ?? g.clanId;
        if (!g.clanId) continue;
        (byClan.get(g.clanId) ?? (byClan.set(g.clanId, new Set()), byClan.get(g.clanId))).add(g.force);
      }
    }
    const clanIdOf = (p) => (p?.kind === 'person' ? clanOf(p)?.id : null);
    const liftOf = (p, f) => (byClan.get(clanIdOf(p))?.has(f) ? R.tune('forces').GREAT_LIFT : 0);
    function groupLift(g, f) {
      if (!g) return 0;
      if (g.type === 'clan') return byClan.get(g.id)?.has(f) ? R.tune('forces').GREAT_LIFT : 0;
      if (g.type === 'village') { for (const x of greats.values()) if (x.force === f && !x.person.dead && R.ask('villageOf', x.person) === g) return R.tune('forces').GREAT_LIFT; }
      return 0;
    }
    function greatIn(p, f, other) {
      const id = clanIdOf(p);
      for (const g of greats.values()) if (g.force === f && g.clanId === id && (!other || g.person !== p)) return g;
      return null;
    }
    function makeGreat(p, force, o = {}) {
      if (greats.has(p) || p.dead) return null;
      const ep = EPITHETS[force][hash(p.id + force) % EPITHETS[force].length];
      const c = clanOf(p);
      const g = { person: p, force, kind: KINDS[force], title: `${p.name} ${ep}`, epithet: ep, mark: MARKS[force], since: year(), clanId: c?.id ?? null, gifted: !!o.gifted, line: o.line ?? null };
      greats.set(p, g);
      reindex();
      R.story(p, `${o.gifted ? 'Grew into the gift: became' : 'Became'} a great ${g.kind}, ${ep}.`);
      const where = c ? ` of the ${c.name} clan` : ` of the ${p.family.name} family`;
      const lift = R.tune('forces').GREAT_LIFT;
      const does = force === 'strength' ? `The clan fights as if ${lift} stronger, and a band ${p.sex === 'f' ? 'she' : 'he'} marches with holds better.` : force === 'skepticism' ? `The clan thinks ${G.THINK_CLAN} times as fast.` : 'The clan keeps its faith, and prays more.';
      R.alert('good', `${p.name}${where} has become a great ${g.kind}: ${g.title}${o.gifted ? `, born gifted of ${o.line?.name ?? 'a blessed line'}` : ''}. ${does}`,
        { x: p.x, z: p.z, subject: p, aside: R.aside(`great:${force}`, force === 'strength' ? ['Every village needs one. Ideally only one.'] : force === 'skepticism' ? ['Asks why. Keeps asking. Insufferable, and useful.'] : ['Hears you clearly. Possibly too clearly.'], 150) });
      R.signal('force:great', { person: p, force, kind: g.kind, title: g.title, gifted: g.gifted });
      return g;
    }
    function candidate(p, f) {
      const d = p.ext?.forces;
      if (!d || !d.start) return false;
      const lv = level(p, f);
      if (lv < G.AT[f] || lv < (FA()?.people?.[f] ?? 0) + G.ABOVE || lv - (d.start[f] ?? 0) < G.GAINED) return false;
      if (f === 'strength') return S.life - d.lastHard <= G.ACTIVE_LIFE || (p.ext?.hunt?.last ?? -1e9) > S.life - G.ACTIVE_LIFE;
      if (f === 'faith') return (p.ext?.faith?.prayLife ?? -1e9) > S.life - G.ACTIVE_LIFE;
      if (f === 'skepticism') return !R.trait(p, 'whispered') && ((p.ext?.mind?.rateAvg ?? 0) > 0.001 || (R.ask('couldThink', p) ?? 0) > 0.1);
      return false;
    }
    function rollGreat() {
      let grown = 0;
      for (const p of S.people) if (settled(p) && p.age >= R.tune('forces').GROWN) grown++;
      const cap = Math.max(1, Math.floor(grown / G.PER_GROWN));
      let living = [...greats.values()].filter((g) => !g.gifted).length;
      for (const p of S.people) {
        if (living >= cap) break;
        if (!settled(p) || greats.has(p) || p.age < G.AGE[0] || p.age > G.AGE[1]) continue;
        for (const f of ['strength', 'skepticism', 'faith']) {
          if (!candidate(p, f)) continue;
          const id = clanIdOf(p);
          if ([...greats.values()].filter((g) => g.force === f && g.clanId === id).length >= G.PER_CLAN) continue;
          if (Math.random() >= G.CHANCE) continue;
          makeGreat(p, f); living++;
          break;
        }
      }
    }
    // a death: the clan's level in that force drops; say so with the numbers
    R.on('person:death', (p) => {
      const g = greats.get(p);
      if (!g) return;
      greats.delete(p);
      const c = R.ask('clan', g.clanId) ?? clanOf(p);
      const grp = c ? FA().groups.get(c.id) : null;
      const from = grp ? Math.round(grp[g.force]) : null;
      reindex();
      let to = null;
      if (c) {
        const ms = (c.members ?? []).filter((q) => !q.dead && q !== p && q.age >= R.tune('forces').GROWN);
        if (ms.length) to = Math.round(clamp(ms.reduce((s, q) => s + level(q, g.force), 0) / ms.length + groupLift(c, g.force), 0, 100));
      }
      fallen.push({ ...g, died: year(), cause: p.cause, from, to });
      if (fallen.length > 40) fallen.shift();
      const nm = g.force === 'strength' ? 'strength' : g.force;
      const text = c && from != null && to != null ? `The ${c.name} clan's ${nm} fell from ${from} to ${to}: ${p.name} is dead.` : `${g.title}, a great ${g.kind}, is dead.`;
      R.alert('bad', `${text} ${g.title} ${p.cause === 'old age' ? 'died of old age' : `died (${p.cause})`}.`, { x: p.x, z: p.z, subject: p });
      R.signal('force:fell', { clan: c ?? null, force: g.force, from, to, person: p, title: g.title });
      if (c) FA()?.measure();
    });
    // a merge or a move: keep each great person's clan current
    R.on('clan:merge', () => reindex());

    // ----- what great people do for their clan -----
    R.mod('think', 'great:thinker-clan', { mul: G.THINK_CLAN, who: (p) => p?.kind === 'person' && !!byClan.get(clanIdOf(p))?.has('skepticism'), note: 'a great thinker in the clan' });
    R.mod('think', 'great:thinker', { mul: G.THINK_SELF / G.THINK_CLAN, who: (p) => p?.kind === 'person' && greats.get(p)?.force === 'skepticism', note: 'a great thinker' });
    R.mod('faithDrift', 'great:seer-clan', { add: G.SEER_KEEP, who: (p) => p?.kind === 'person' && !!byClan.get(clanIdOf(p))?.has('faith'), note: 'a great seer in the clan' });

    // ================= lines =================
    const lines = new Map();   // id -> line
    const famLine = new Map(); // arriving family id -> line id
    let lseq = 0;
    const lineData = (p) => R.data(p, 'line', () => ({ id: null }));
    const lineOfP = (p) => lines.get(p?.ext?.line?.id) ?? null;
    const total = (l) => l.w.faith + l.w.skepticism + l.w.strength;
    const leadOf = (l) => ['faith', 'strength', 'skepticism'].reduce((a, b) => (l.w[b] > l.w[a] ? b : a));
    function newLine(f, p) {
      const taken = new Set([...lines.values()].filter((l) => l.alive).map((l) => l.name));
      let name = `the ${f.name} line`;
      if (taken.has(name)) name = `the ${f.name} line of ${p.name}`;
      const l = { id: `l${++lseq}`, name, family: f.name, founded: year(), founders: [], w: { faith: 0, skepticism: 0, strength: 0 }, helps: [], blessed: false, since: null, lastMark: -1e9, lastGift: -1e9, gifted: [], alive: true, peak: 0 };
      Object.defineProperty(l, 'members', { get: () => S.people.filter((q) => !q.dead && q.ext?.line?.id === l.id), enumerable: false });
      lines.set(l.id, l);
      return l;
    }
    R.on('person:new', (p) => {
      const d = lineData(p);
      const ps = [p.mother, p.father].filter((q) => q?.ext?.line?.id && lines.has(q.ext.line.id));
      if (ps.length) {
        const ls = ps.map((q) => lines.get(q.ext.line.id));
        const l = ls.length === 2 && total(ls[1]) > total(ls[0]) ? ls[1] : ls[0];
        d.id = l.id;
        if (p.age < 1 && p.mother) gift(p, l);
        return;
      }
      let l = lines.get(famLine.get(p.family.id));
      if (!l) { l = newLine(p.family, p); famLine.set(p.family.id, l.id); }
      d.id = l.id;
      if (p.age >= T1.CHILD_UNTIL && l.founders.length < 2) l.founders.push(p.name);
    });
    // in a blessed line, one child each generation is born gifted, in the force the god's help mostly fed
    function gift(p, l) {
      if (!l.blessed || year() - l.lastGift < G.GEN_YEARS) return;
      if (l.gifted.some((x) => !x.person.dead && !x.great)) return;
      const force = leadOf(l);
      l.lastGift = year();
      const rec = { person: p, name: p.name, force, year: year(), great: false };
      l.gifted.push(rec);
      R.data(p, 'forces', () => ({})).gifted = { force, line: l.id };
      R.story(p, `Born gifted, of ${l.name}, which you have watched over: will be a great ${KINDS[force]}.`);
      R.alert('good', `A gifted child, ${p.name}, was born to ${l.name}: ${p.sex === 'f' ? 'she' : 'he'} will grow into a great ${KINDS[force]} at ${G.GIFT_AGE}.`, { x: p.x, z: p.z, subject: p });
      R.signal('line:gifted', { line: lineView(l), person: p, force });
    }
    function mark(l, kind, who, text) {
      if (!l || !l.alive) return false;
      if (year() - l.lastMark < G.GAP) return false;
      const force = G.KIND[kind];
      if (!force) return false;
      const w = G.WEIGHT[kind] ?? 1;
      l.w[force] += w;
      l.lastMark = year();
      l.helps.push({ year: year(), kind, force, w, who: who?.name ?? null, text: text ?? HELP_WORDS[kind] });
      if (l.helps.length > G.HISTORY) l.helps.shift();
      l.peak = Math.max(l.peak, total(l));
      check(l);
      // the screen's moment: a mark on a line (each help that counts)
      const t = total(l);
      R.signal('line:marked', { line: lineView(l), force, kind, total: r1(t), need: r1(Math.max(0, G.BLESS_AT - t)), blessed: l.blessed, person: who ?? null, x: who?.x ?? null, z: who?.z ?? null });
      return true;
    }
    // the god helped these people: each distinct line among them gains a mark
    function helped(people, kind) {
      const done = new Set();
      for (const p of people) {
        const l = lineOfP(p);
        if (!l || done.has(l)) continue;
        if (mark(l, kind, p)) done.add(l);
      }
    }
    function blessedCount() { let n = 0; for (const l of lines.values()) if (l.blessed && l.alive) n++; return n; }
    const fadeMul = (n = blessedCount()) => Math.max(1, (n / G.SHARED) ** G.SHARED_POW);
    function check(l) {
      const t = total(l);
      if (!l.blessed && t >= G.BLESS_AT) {
        l.blessed = true; l.since = year();
        const f = leadOf(l);
        R.alert('good', `${cap1(l.name)} is blessed. You have helped them ${number(l.helps.length)} times. In each generation one child of the line will be born gifted, and become a great ${KINDS[f]}. They have seen a great deal of you.`, { x: S.stone.centre.x, z: S.stone.centre.z });
        R.signal('line:blessed', { line: lineView(l), force: f });
      } else if (l.blessed && t < G.KEEP_AT) {
        l.blessed = false;
        R.alert('warn', `${cap1(l.name)} is no longer blessed: your marks on them have faded (${r1(t)}, under ${G.KEEP_AT}).`, { x: S.stone.centre.x, z: S.stone.centre.z });
        R.signal('line:lost', { line: lineView(l) });
      }
    }

    // ----- what counts as help (forces.js runs act:before and act:after around every power) -----
    const wolves = (t) => (t?.entity?.species === 'wolf' ? t.entity : null);
    const hardshipOf = (f) => hardshipApi()?.water?.droughtOf?.(f) ?? null;
    R.on('act:before', (ev) => {
      const t = ev.target;
      if (!t) return;
      const near = (x, z, r) => S.people.filter((p) => settled(p) && Math.hypot(p.x - x, p.z - z) <= r);
      const id = ev.id;
      if (id === 'heal') ev.helped = (t.kind === 'person' ? [t.entity] : near(t.x, t.z, (t.r ?? 0) + 0.5)).filter((p) => p && (p.ext?.hardship?.sick || p.ext?.hardship?.wound || R.ask('wounded', p)));
      else if (id === 'bless-harvest') {
        const r = Math.max(1, t.r ?? 6);
        // a field of theirs under the rain that it feeds (not watered by you lately, or they are hungry, or in a
        // drought), or a hungry home under it
        const hungry = (f) => f.members.some((m) => m.hunger > 0);
        const fed = (f) => hungry(f) || !R.mods('yield', f).some((m) => m.key === `nature:bless:${f.id}` && (m.until == null || m.until > S.life)) || !!hardshipOf(f);
        const fams = S.families.filter((f) => f.state === 'settled' && ((f.fields.some((fl) => fl.done && Math.hypot((fl.mx ?? fl.cx) - t.x, (fl.mz ?? fl.cz) - t.z) <= r + 3) && fed(f)) || (f.home && Math.hypot(f.home.cx - t.x, f.home.cz - t.z) <= r + 2 && hungry(f))));
        ev.helped = fams.flatMap((f) => f.members.filter((m) => !m.dead));
      } else if (id === 'strike') {
        const w = wolves(t);
        if (w) {
          const prey = w.prey?.kind === 'person' ? w.prey : near(w.x, w.z, G.WOLF_R).sort((a, b) => Math.hypot(a.x - w.x, a.z - w.z) - Math.hypot(b.x - w.x, b.z - w.z))[0];
          ev.helped = prey ? [prey] : [];
        }
      } else if (id === 'bless-weapons') {
        const c = t.kind !== 'area' ? (t.clan?.id ? R.ask('clan', t.clan.id) : t.entity?.kind === 'person' ? clanOf(t.entity) : null) : null;
        ev.helped = (c ? c.members : near(t.x, t.z, t.r ?? 6)).filter((p) => p.stage !== 'child');
      } else if (id === 'give-thought' || id === 'whisper') ev.helped = t.entity?.kind === 'person' && t.entity.age >= 8 ? [t.entity] : [];
    });
    R.on('act:after', (ev) => { if (ev.helped?.length && G.KIND[ev.id]) helped(ev.helped, ev.id); });
    R.on('force:tested', (e) => { if (e?.person) helped([e.person], 'tested'); });
    // a deer put down by a hungry family's home (the Animals tool calls sim.spawnAnimal)
    const A = S.animalsApi, baseSpawn = A.spawnAnimal;
    A.spawnAnimal = (kind, x, z) => {
      const r = baseSpawn(kind, x, z);
      if (kind === 'deer' && r?.entity) {
        const fams = S.families.filter((f) => f.state === 'settled' && f.home && Math.hypot(f.home.cx - x, f.home.cz - z) <= G.DEER_R && (f.food < S.peopleApi.needOf(f) * 1.5 || f.members.some((m) => m.hunger > 0)));
        if (fams.length) helped(fams.flatMap((f) => f.members.filter((m) => !m.dead)), 'deer');
        R.run('deer:placed', { x, z, entity: r.entity });
      }
      return r;
    };

    // ----- the year: fades, blessings kept or lost, gifted children grow up, great people arise -----
    R.on('year', () => {
      const k = Math.pow(0.5, fadeMul() / G.HALF_LIFE);
      const count = new Map();
      for (const p of S.people) if (!p.dead && p.ext?.line?.id) count.set(p.ext.line.id, (count.get(p.ext.line.id) ?? 0) + 1);
      for (const l of lines.values()) {
        if (!l.alive) continue;
        for (const f of ['faith', 'skepticism', 'strength']) l.w[f] *= k;
        if (!count.get(l.id)) { l.alive = false; l.ended = year(); if (l.blessed) { l.blessed = false; R.signal('line:lost', { line: lineView(l), ended: true }); R.alert('warn', `${cap1(l.name)} has died out, and its blessing with it.`, {}); } continue; }
        check(l);
        for (const g of l.gifted) {
          const p = g.person;
          if (g.great || p.dead || p.age < G.GIFT_AGE) continue;
          g.great = true;
          const f = g.force;
          const to = Math.min(100, Math.round(Math.max(G.AT[f] + 2, (FA()?.people?.[f] ?? 0) + G.ABOVE)));
          if (level(p, f) < to) { setLevel(p, f, to); R.story(p, `The gift came on at ${Math.floor(p.age)}: ${f} ${to}.`); }
          makeGreat(p, f, { gifted: true, line: l });
        }
      }
      // forget lines long dead
      for (const [id, l] of lines) if (!l.alive && year() - l.ended > 200) lines.delete(id);
      rollGreat();
      reindex();
    });

    // ================= views and queries =================
    function lineView(l) {
      if (!l) return null;
      const t = total(l), mul = fadeMul();
      const half = G.HALF_LIFE / mul;
      const ms = l.members;
      const grown = ms.filter((p) => p.age >= R.tune('forces').GROWN);
      const avg = (f) => (grown.length ? Math.round(grown.reduce((s, p) => s + level(p, f), 0) / grown.length) : null);
      const lead = leadOf(l);
      let fade;
      if (l.blessed) { const yrs = t > G.KEEP_AT ? Math.round(half * Math.log2(t / G.KEEP_AT)) : 0; fade = `With no more help it stays blessed about ${number(yrs)} more years (marks halve every ${Math.round(half)} years${mul > 1 ? `, ${r1(mul)} times as fast because you bless ${number(blessedCount())} lines` : ''}).`; }
      else fade = `${r1(Math.max(0, G.BLESS_AT - t))} more to be blessed. Marks halve every ${Math.round(half)} years${mul > 1 ? ` (${r1(mul)} times as fast: you bless ${number(blessedCount())} lines)` : ''}.`;
      const next = Math.max(0, Math.ceil(l.lastMark + G.GAP - year()));
      return {
        id: l.id, name: l.name, family: l.family, founded: l.founded, founders: [...l.founders], alive: l.alive, members: ms.length,
        blessed: l.blessed, since: l.since, marks: { faith: r1(l.w.faith), skepticism: r1(l.w.skepticism), strength: r1(l.w.strength) }, total: r1(t),
        need: r1(Math.max(0, G.BLESS_AT - t)), blessAt: G.BLESS_AT, keepAt: G.KEEP_AT, lead, leadKind: KINDS[lead], halfLife: Math.round(half), fade,
        nextMarkIn: next, nextMark: next ? `The next help counts in ${number(next)} years (one mark every ${G.GAP} years).` : 'The next help counts.',
        gifted: l.gifted.map((g) => ({ person: g.person, name: g.name, force: g.force, year: g.year, great: g.great, dead: g.person.dead })),
        helps: l.helps.map((h) => ({ ...h })),
        seen: { faith: avg('faith'), strength: avg('strength'), skepticism: avg('skepticism'), expectsHelp: ms.filter((p) => p.expectsHelp).length,
          text: grown.length ? `The cost: they have seen a great deal of you. Faith ${avg('faith')}, strength ${avg('strength')}, skepticism ${avg('skepticism')} among their grown${ms.some((p) => p.expectsHelp) ? `; ${number(ms.filter((p) => p.expectsHelp).length)} wait for your help` : ''}.` : '' },
      };
    }
    const greatView = (g) => ({ person: g.person, name: g.person.name, title: g.title, epithet: g.epithet, force: g.force, kind: g.kind, mark: g.mark, since: g.since, gifted: g.gifted, clan: R.ask('clan', g.clanId)?.name ?? null, clanId: g.clanId, age: Math.floor(g.person.age) });
    R.answer('great', () => [...greats.values()].filter((g) => !g.person.dead).map(greatView));
    R.answer('greatOf', (c) => { const id = c?.kind === 'person' ? clanIdOf(c) : c?.id ?? c; return [...greats.values()].filter((g) => !g.person.dead && g.clanId === id).map(greatView); });
    R.answer('greatFallen', () => fallen.map((g) => ({ name: g.person.name, title: g.title, force: g.force, kind: g.kind, since: g.since, died: g.died, cause: g.cause, from: g.from, to: g.to })));
    R.answer('lines', () => [...lines.values()].filter((l) => l.alive && (l.blessed || total(l) >= G.WATCH_FROM)).sort((a, b) => total(b) - total(a)).map(lineView));
    R.answer('lineOf', (p) => lineView(lineOfP(p)));
    R.answer('linesAll', () => [...lines.values()].map(lineView));
    R.answer('linesRule', () => ({ blessAt: G.BLESS_AT, keepAt: G.KEEP_AT, halfLife: G.HALF_LIFE, gap: G.GAP, shared: G.SHARED, fadeMul: fadeMul(), blessed: blessedCount() }));
    const api = {
      liftOf, groupLift, greats, lines, mark, helped, makeGreat, lineOfP, blessedCount, fadeMul,
      hasGreat: (p, f, other) => !!greatIn(p, f, other),
      greatName: (p, f) => greatIn(p, f)?.title ?? null,
      warriorMorale: (list) => (list.some((p) => greats.get(p)?.force === 'strength') ? G.WARRIOR_MORALE : 0),
      greatOfPerson: (p) => greats.get(p) ?? null,
      // what the clan's level in that force would fall to if this great person died now (the same sums as the death)
      fallPreview(p) {
        const g = greats.get(p);
        if (!g) return null;
        const c = R.ask('clan', g.clanId) ?? clanOf(p);
        const grp = c ? FA()?.groups.get(c.id) : null;
        const from = grp ? Math.round(grp[g.force]) : null;
        const ms = c ? (c.members ?? []).filter((q) => !q.dead && q !== p && q.age >= R.tune('forces').GROWN) : [];
        const other = [...greats.values()].some((x) => x !== g && x.force === g.force && x.clanId === g.clanId && !x.person.dead);
        const to = ms.length ? Math.round(clamp(ms.reduce((s, q) => s + level(q, g.force), 0) / ms.length + (other ? R.tune('forces').GREAT_LIFT : 0), 0, 100)) : null;
        return { great: g, clan: c ?? null, force: g.force, from, to };
      },
    };
    R.answer('forces:great-api', () => api);
    R.great = api;

    // ================= inspect, fate =================
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const g = greats.get(e);
      out.great = g ? { force: g.force, kind: g.kind, title: g.title, mark: g.mark, since: g.since, gifted: g.gifted, text: `A great ${g.kind} since ${R.yearLabel(g.since)}${g.gifted ? ', born gifted' : ''}.` } : null;
      const gd = e.ext?.forces?.gifted;
      if (!g && gd) out.great = { force: gd.force, kind: KINDS[gd.force], title: null, gifted: true, pending: true, text: `Born gifted: will be a great ${KINDS[gd.force]} at ${G.GIFT_AGE}.` };
      const l = lineOfP(e);
      const v = lineView(l);
      out.line = v ? { id: v.id, name: v.name, blessed: v.blessed, marks: v.marks, total: v.total, need: v.need, lead: v.lead, members: v.members } : null;
      if (v) {
        const lines2 = [`${cap1(v.name)}: ${v.members} living. ${v.blessed ? `Blessed since ${R.yearLabel(v.since)}.` : v.total >= G.WATCH_FROM ? 'Watched by you.' : 'Not marked by you.'}`];
        if (v.total > 0.05) lines2.push(`Marks: faith ${v.marks.faith}, strength ${v.marks.strength}, skepticism ${v.marks.skepticism} (${v.total} of ${G.BLESS_AT} to be blessed). ${v.fade}`);
        for (const h of [...v.helps].reverse().slice(0, 4)) lines2.push(`${R.yearLabel(h.year)}: ${h.who ? `${h.who}, ` : ''}${h.text}.`);
        if (v.gifted.length) lines2.push(`Gifted: ${v.gifted.map((x) => `${x.name} (${KINDS[x.force]}${x.dead ? ', dead' : x.great ? ', great' : ''})`).join(', ')}.`);
        R.section(out, { id: 'line', title: 'Their line', lines: lines2, order: 33 });
      }
    });
    R.on('fate', (p) => {
      const gd = p.ext?.forces?.gifted;
      if (gd && !greats.has(p) && p.age < G.GIFT_AGE) return `Will become a great ${KINDS[gd.force]} at ${G.GIFT_AGE}, the gift of a blessed line.`;
      return null;
    });
    R.on('thoughts', (p) => {
      const g = greats.get(p);
      if (!g || p.asleep || p.dead) return null;
      return g.force === 'strength' ? [[3, 'They look to me when the wolves come. I had better not blink.']] : g.force === 'skepticism' ? [[3, 'Everyone keeps asking me things. I keep asking back.']] : [[3, 'I hear it more clearly than the others. Or I think I do.']];
    });
  },
};
