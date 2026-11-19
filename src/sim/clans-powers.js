// C. The god's powers over clans: bless weapons, calm, provoke, favour (the
// god data is god/powers-clans.js). Each forecast is built from the same
// functions and numbers its carryOut then uses (the honest forecast rule):
// a blessing's effect on a coming fight is that fight rolled again from its
// own seed with the blessing in, exactly as carryOut will roll it.
//
// Who knows it was the god (choices for the director to confirm):
//   Bless weapons  witnessed like any act: those who see the weapons glow gain
//                  faith, and those new to the land come to expect help for good
//                  (and so hang back from later fights: the director's rule).
//   Calm, Provoke  not seen: it feels to them like their own change of heart.
//                  Nobody's faith changes.
//   Favour         the god's private mark; changes nothing in the simulation,
//                  nobody notices, never witnessed. The screen pins and
//                  highlights the favoured clan (sim.ask('favoured'), clan.favoured).
import { grudgeWord, cap1 } from './clans-words.js';
import { number } from './words.js';

export const TUNE_CLAN_POWERS = {
  BLESS_MUL: 1.6,       // blessed fighters' strength is multiplied by this ...
  BLESS_LIFE: 15,       // ... for this many life years (30 calendar years at the usual LIFE_RATE)
  BLESS_FAITH_W: 0.6,   // witnesses move like any other act of this weight (tune.js WITNESS_FAITH, WITNESS_SKEP)
  CALM_CUT: 0.6,        // calm takes this share off every grudge the group holds (times the share of it in an area)
  CALM_MUL: 0.35,       // and grudges then build this fast ...
  CALM_LIFE: 15,        // ... for this many life years
  PROVOKE_ADD: 32,      // provoke adds this to the group's grudge against its worst rival (times the share in an area)
  PROVOKE_MUL: 2,       // and grudges then build this fast ...
  PROVOKE_LIFE: 10,     // ... for this many life years
};

export default {
  id: 'clans-powers',
  tune: TUNE_CLAN_POWERS,
  init(R) {
    const { S } = R, P = TUNE_CLAN_POWERS;
    const C = () => R.ask('clans:api');
    const F = () => R.ask('fights:api');
    let seq = 0;
    const years = (life) => Math.round(life / R.T.LIFE_RATE);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

    // ---------- what a target means: a clan (any member), or the grown people in an area ----------
    function clanOfTarget(t) {
      if (!t) return null;
      const A = C();
      if (t.clan?.type === 'clan') return A.resolve(t.clan.id);
      if (t.clan?.id) return A.resolve(t.clan.id);
      if (t.entity?.kind === 'person') return A.clanOf(t.entity);
      return null;
    }
    // { people (grown, settled), groups: [{ g, k }] (k: the share of the group's grown people inside), label, x, z, r, clan }
    function reach(t) {
      const A = C();
      if (!A || !t) return null;
      if (t.kind === 'clan' || t.kind === 'person') {
        const c = clanOfTarget(t);
        if (!c) return null;
        const people = c.members.filter((p) => p.stage !== 'child' && p.family.state === 'settled');
        const out = people.filter((p) => !p.hidden);
        const pts = out.length ? out : people;
        const x = pts.length ? pts.reduce((s, p) => s + p.x, 0) / pts.length : t.x, z = pts.length ? pts.reduce((s, p) => s + p.z, 0) / pts.length : t.z;
        const r = Math.min(25, Math.max(3, ...pts.map((p) => dist(p, { x, z }))));
        return { people, groups: [{ g: c, k: 1 }], label: `the ${c.name} clan`, x, z, r, clan: c, kind: 'clan' };
      }
      if (t.kind === 'area') {
        const r = t.r ?? 6;
        const people = S.people.filter((p) => !p.dead && p.stage !== 'child' && p.family.state === 'settled' && Math.hypot(p.x - t.x, p.z - t.z) <= r);
        const tally = new Map();
        for (const p of people) for (const g of [A.clanOf(p), A.villageOf(p)]) if (g) tally.set(g, (tally.get(g) ?? 0) + 1);
        const groups = [...tally].map(([g, n]) => ({ g, k: Math.min(1, n / Math.max(1, A.groupMembers(g).filter((p) => p.stage !== 'child').length)) }));
        const cs = groups.filter((x) => x.g.type === 'clan').map((x) => x.g);
        const label = people.length ? `${number(people.length)} grown ${people.length === 1 ? 'person' : 'people'} here${cs.length ? ` (${cs.map((c) => `the ${c.name} clan`).join(', ')})` : ''}` : 'nobody';
        return { people, groups, label, x: t.x, z: t.z, r, clan: null, kind: 'area' };
      }
      return null;
    }
    const whoFn = (T) => (T.kind === 'clan' ? T.clan : ((set) => (s) => set.has(s))(new Set(T.people)));
    const fightsOf = (people) => { const f = F(); if (!f) return []; const set = new Set(people); return f.active.filter((x) => (x.kind === 'raid' || x.kind === 'skirmish') && (x.attackers.some((p) => set.has(p)) || x.defenders.some((p) => set.has(p)))); };
    const outcome = (f, pl) => {
      const dead = pl.dead.flat().filter((p) => !p.dead);
      const win = pl.winner === 0 ? `${C().groupName(f.a)} win${f.a.type === 'clan' ? '' : 's'}` : pl.winner === 1 ? `${C().groupName(f.b)} hold${f.b.type === 'clan' ? '' : 's'}` : 'neither side gives way';
      return `${win}, ${dead.length ? `${number(dead.length)} die (${dead.slice(0, 3).map((p) => p.name).join(', ')}${dead.length > 3 ? ' and more' : ''})` : 'nobody dies'}`;
    };
    // a power is unseen: the seam's `unseen` flag counts nobody as a witness and moves nobody's mind
    const unseen = (what) => ({ unseen: true, report() {}, payload: () => ({ what }) });
    const UNSEEN_WHO = 'Nobody will know it was you: to them it is their own change of heart. Nobody\'s faith changes.';

    // ---------- bless weapons ----------
    const BLESS_SEEN = () => ({
      faith: R.T.WITNESS_FAITH * P.BLESS_FAITH_W, doubt: -(R.T.WITNESS_SKEP * P.BLESS_FAITH_W), early: R.T.EARLY_MULT, hooks: true,
      what: 'weapons glow with light in people\'s hands',
      thought: 'The clubs glowed. Something up there wants this fight won.',
      story: 'Saw weapons glow with light in people\'s hands.',
    });
    function blessForecast(t) {
      const T = reach(t);
      if (!T) return R.refuse('Point at a person of the clan, or at the ground near people.');
      if (!T.people.length) return R.refuse(T.kind === 'area' ? 'There are no grown people here to bless.' : `The ${T.clan.name} clan has nobody grown to bless.`);
      const set = new Set(T.people);
      const w = R.describeWitness(BLESS_SEEN(), T.x, T.z, T.r);
      const hooked = new Set(w.seen.filter((p) => R.isEarly(p) && !p.expectsHelp));
      const over = { strength: (p) => (set.has(p) ? P.BLESS_MUL : 1), blessed: (p) => set.has(p), will: (p) => (hooked.has(p) ? R.TUNE_SEAM.FIGHT_DEPENDENT : 1) };
      const gains = [`${cap1(T.label)}: ${number(T.people.length)} grown ${T.people.length === 1 ? 'person fights' : 'people fight'} ${P.BLESS_MUL} times as well for about ${years(P.BLESS_LIFE)} years.`];
      const costs = [...w.costs];
      if (hooked.size) costs.push(`${cap1(number(hooked.size))} of them will expect the stone to fight for them from now on, and will hang back from fights.`);
      const later = [];
      const fs = fightsOf(T.people);
      for (const f of fs) {
        if (f.phase === 'clash') { gains.push(`${cap1(f.label)} is already being fought: too late to change it.`); continue; }
        const before = f.plan, after = F().plan(f, over);
        const line = `${cap1(f.label)}: ${outcome(f, before)}. Blessed: ${outcome(f, after)}.`;
        (after.dead.flat().length <= before.dead.flat().length ? gains : costs).push(line);
      }
      if (!fs.length) later.push('No fight is coming for them right now. The blessing fades in time.');
      return { gains, costs, who: w.who, seenBy: w.seenBy, confirm: 'click', later, kind: T.kind, target: T.clan ?? null };
    }
    function blessCarry(t) {
      const T = reach(t);
      if (!T || !T.people.length) return { ok: false, text: 'There is nobody grown here to bless.' };
      const set = new Set(T.people);
      const k = `clans:bless:${++seq}`;
      R.mod('strength', k, { mul: P.BLESS_MUL, who: (s) => set.has(s), until: S.life + P.BLESS_LIFE, note: 'blessed weapons' });
      for (const p of T.people) R.story(p, 'Felt the club grow light and sure in the hand.');
      for (const f of fightsOf(T.people)) if (f.phase !== 'clash') { F().replan(f, `The weapons of ${T.label} were blessed.`); f.text = F().momentText(f); }
      return { ok: true, text: `The weapons of ${T.label} are blessed.`, x: T.x, z: T.z, r: T.r, kind: 'bless-weapons' };
    }
    R.power({ id: 'bless-weapons', forecast: blessForecast, carryOut: blessCarry, witness: () => BLESS_SEEN() });

    // ---------- calm ----------
    function calmPlan(T) {
      const A = C(), FT = F()?.T;
      const lines = [], off = [];
      for (const { g, k } of T.groups) {
        const cut = P.CALM_CUT * k;
        for (const e of A.ledger.values()) {
          if (e.a !== g.id || e.g < 15) continue;
          const o = A.groupOfId(e.b);
          lines.push({ g, o, from: e.g, to: e.g * (1 - cut) });
        }
      }
      for (const f of F()?.active ?? []) {
        if (f.phase === 'clash' || f.phase === 'after') continue;
        const l = lines.find((x) => x.g === f.a && x.o === f.b);
        if (l && l.to < FT.QUARREL_AT) off.push(f);
      }
      return { lines: lines.sort((x, y) => y.from - x.from), off };
    }
    function calmForecast(t) {
      const T = reach(t);
      if (!T) return R.refuse('Point at a person of the clan, or at the ground near people.');
      if (!T.people.length) return R.refuse('There is nobody here whose anger could cool.');
      const { lines, off } = calmPlan(T);
      const A = C();
      const gains = lines.slice(0, 4).map((l) => `${cap1(A.groupName(l.g))} toward ${A.groupName(l.o)}: ${grudgeWord(l.from)} (${Math.round(l.from)}) to ${grudgeWord(l.to)} (${Math.round(l.to)}).`);
      if (!lines.length) gains.push(`${cap1(T.label)} hold no grudge worth cooling.`);
      for (const f of off) gains.push(`${cap1(f.label)} is called off.`);
      gains.push(`For about ${years(P.CALM_LIFE)} years their grudges build at ${Math.round(P.CALM_MUL * 100)} percent of the pace.`);
      const costs = [];
      for (const f of F()?.active ?? []) if ((f.kind === 'raid' || f.kind === 'skirmish') && f.phase !== 'clash' && f.phase !== 'after' && !off.includes(f) && T.groups.some((x) => x.g === f.a)) costs.push(`${cap1(f.label)} still goes ahead: the anger is not gone enough.`);
      if (!costs.length) costs.push('Nothing.');
      return { gains, costs, who: UNSEEN_WHO, seenBy: 0, confirm: 'click', kind: T.kind };
    }
    function calmCarry(t) {
      const T = reach(t);
      if (!T || !T.people.length) return { ok: false, text: 'There is nobody here to calm.' };
      const A = C();
      const { lines } = calmPlan(T);
      for (const l of lines) { const e = A.entry(l.g, l.o, false); if (e && e.g > 0) A.scale(e, l.to / e.g); }
      R.mod('grudge', `clans:calm:${++seq}`, { mul: P.CALM_MUL, who: whoFn(T), until: S.life + P.CALM_LIFE, note: 'calmed' });
      for (const p of T.people) if (!p.dead) { R.story(p, 'Woke up and found the old anger had gone quiet.'); S.mind.push(p, 'Why was I so angry? It hardly seems worth it now.'); }
      return { ok: true, text: `${cap1(T.label)} ${T.kind === 'clan' ? 'is' : 'are'} calmer now.`, x: T.x, z: T.z, r: T.r, kind: 'calm' };
    }
    R.power({ id: 'calm', forecast: calmForecast, carryOut: calmCarry, witness: unseen('calm') });

    // ---------- provoke ----------
    // each group's worst rival (or, with no grudge yet, the nearest other group of its kind)
    function rivalOf(g) {
      const A = C();
      let best = null, bg = -1;
      for (const e of A.ledger.values()) if (e.a === g.id && e.g > bg) { const o = A.groupOfId(e.b); if (A.alive(o)) { bg = e.g; best = o; } }
      if (best) return best;
      const at = A.groupMembers(g)[0];
      if (!at) return null;
      let nd = 1e9;
      for (const o of A.allGroups()) if (o !== g && o.type === g.type) { const m = A.groupMembers(o)[0]; if (m && dist(m, at) < nd) { nd = dist(m, at); best = o; } }
      return best;
    }
    function provokePlan(T) {
      const A = C(), FT = F()?.T;
      const out = [];
      for (const { g, k } of T.groups) {
        if (T.kind === 'area' && k < 0.2) continue;
        const o = rivalOf(g);
        if (!o) continue;
        const from = A.gOf(g, o), to = Math.min(100, from + P.PROVOKE_ADD * k);
        const kind = to >= FT.THEFT_AT && !F().groupBusy(g) ? F().preview(g, o, F().levelFor(to, g, o)) : null;
        out.push({ g, o, from, to, kind, k });
      }
      return out;
    }
    const KIND_WORDS = { quarrel: 'pick a quarrel with', theft: 'steal from', burning: 'burn a field of', raid: 'raid', skirmish: 'march out to fight' };
    function provokeForecast(t) {
      const T = reach(t);
      if (!T) return R.refuse('Point at a person of the clan, or at the ground near people.');
      if (!T.people.length) return R.refuse('There is nobody here to stir up.');
      const plan = provokePlan(T);
      if (!plan.length) return R.refuse(`${cap1(T.label)} have nobody to be angry with.`);
      const A = C();
      const gains = [], costs = [];
      for (const l of plan) {
        costs.push(`${cap1(A.groupName(l.g))} toward ${A.groupName(l.o)}: ${grudgeWord(l.from)} (${Math.round(l.from)}) to ${grudgeWord(l.to)} (${Math.round(l.to)}).`);
        if (l.kind) costs.push(`At the next dawn ${A.groupName(l.g)} will ${KIND_WORDS[l.kind]} ${l.kind === 'raid' && l.o.type === 'clan' ? `the ${l.o.name} homes` : A.groupName(l.o)}, unless something changes.`);
        else if (l.to >= F().T.THEFT_AT) costs.push(`Nobody among ${A.groupName(l.g)} will raise a hand for now: those who expect the stone's help leave it to the stone.`);
        else costs.push('Not angry enough yet to do anything about it.');
      }
      costs.push(`For about ${years(P.PROVOKE_LIFE)} years their grudges build ${P.PROVOKE_MUL} times as fast.`);
      gains.push('A side you want weakened may come to blows with the other.');
      return { gains, costs, who: UNSEEN_WHO, seenBy: 0, confirm: 'hold', kind: T.kind };
    }
    function provokeCarry(t) {
      const T = reach(t);
      if (!T || !T.people.length) return { ok: false, text: 'There is nobody here to stir up.' };
      const A = C();
      const plan = provokePlan(T);
      if (!plan.length) return { ok: false, text: 'They have nobody to be angry with.' };
      for (const l of plan) {
        A.add(l.g, l.o, l.to - l.from, 'god', null, { raw: true });
        if (l.kind) F().queue(l.g, l.o, { kind: l.kind });
      }
      R.mod('grudge', `clans:provoke:${++seq}`, { mul: P.PROVOKE_MUL, who: whoFn(T), until: S.life + P.PROVOKE_LIFE, note: 'provoked' });
      for (const p of T.people) if (!p.dead) { R.story(p, 'Woke up with an old anger burning hot again.'); S.mind.push(p, 'I am sick of them. Somebody has to do something.'); }
      return { ok: true, text: `${cap1(T.label)} ${T.kind === 'clan' ? 'is' : 'are'} spoiling for a fight.`, x: T.x, z: T.z, r: T.r, kind: 'provoke' };
    }
    R.power({ id: 'provoke', forecast: provokeForecast, carryOut: provokeCarry, witness: unseen('provoke') });

    // ---------- favour: the god's private mark ----------
    function favourForecast(t) {
      const c = C() && clanOfTarget(t);
      if (!c) return R.refuse('Point at a person of the clan you want to favour.');
      if (c.favoured) return { gains: [`You stop following the ${c.name} clan.`], costs: ['Nothing.'], who: 'Nobody can tell. Nobody could tell before.', seenBy: 0, confirm: 'click', kind: 'clan', target: c, favoured: true };
      return { gains: [`The ${c.name} clan is pinned and marked for you to follow, wherever they go.`], costs: ['Nothing. It changes nothing for them: it is only your own mark.'], who: 'Nobody notices. Not even them.', seenBy: 0, confirm: 'click', kind: 'clan', target: c, favoured: false };
    }
    function favourCarry(t) {
      const c = C() && clanOfTarget(t);
      if (!c) return { ok: false, text: 'There is no clan here.' };
      c.favoured = !c.favoured;
      R.signal('clan:favour', { clan: c, favoured: c.favoured });
      return { ok: true, text: c.favoured ? `You favour the ${c.name} clan. Nobody knows.` : `You no longer favour the ${c.name} clan.`, x: t.x, z: t.z, r: 0, kind: 'favour' };
    }
    R.power({ id: 'favour', forecast: favourForecast, carryOut: favourCarry, witness: unseen('favour') });
  },
};
