// Prayers (DESIGN.md "Prayers"; rules and numbers: docs/FORCES.md). People pray for things, and about every
// 30 real seconds, whatever the speed, one prayer reaches the god (never while paused or in creation; fewer when
// faith is low: people who do not believe do not pray). A prayer is a person, a wish, a place and a time limit,
// drawn from what is really true for them, in their own words. Each names the power and target that would answer
// it, and both futures, built from the same forecasts and fates the game then follows: if you answer, and if you
// do not. Answered: faith in the one who prayed (on top of whatever seeing the act did: never counted twice) and
// in their household. Left unanswered: skepticism; and strength, if they then come through it by themselves.
// Some prayers are bad to grant, and the both-futures lines say why. At most MAX_OPEN are open at once.
import { hardshipApi } from './hardship.js';
import { clamp, smooth, cap1, settled, she, her, herO, chanceText } from './science-util.js';
import { number } from './words.js';
import { PRAYER_R } from './rain-size.js'; // a prayer's rain is always a quarter of the map (the director, 2026-11-17)

export const TUNE_PRAYERS = {
  EVERY_S: 30,          // real seconds between two prayers at full faith (any speed: the clock's own seconds, not the calendar's)
  CURVE: [5, 30],       // the people's average faith: at or under 5 prayers come at MIN_K of the pace, at 30 or more at full pace
  MIN_K: 0.15,          // (a smooth step between): faith 5 one about every 200 s, 10 about 120 s, 15 about 65 s, 20 about 42 s, 30 and up 30 s
  RETRY_S: 5,           // nothing to pray for: look again in this many real seconds
  MAX_OPEN: 3,          // at most this many open at once (the next waits for a slot)
  LIMIT_YEARS: 25,      // a prayer lapses after this many calendar years at most (sooner if its trouble ends first)
  MIN_FAITH: 8,         // nobody under this faith prays
  WISH: { sick: 5, hunger: 5, fire: 6, drought: 4, wolf: 4, fight: 4, rival: 2, harvest: 2, hunt: 2 }, // how often each wish is chosen, when true
  ANSWERED_FAITH: 10,   // the one who prayed: faith up to this on top of what seeing the act gave them (skepticism down half as much)
  HOUSE_FAITH: 4,       // each of their household who did not see the act: faith this (word of it spreads on as any tale)
  UNANSWERED_SKEP: 5, UNANSWERED_FAITH: -2, // the one who prayed, when no answer came
  OWN_STRENGTH: 4,      // ... and strength, if the trouble then came right by their own hands
  RIVAL_GRUDGE: 45,     // a clan with a grudge this high prays against its rival
  CHECK_S: 0.5,         // game seconds between checks of the open prayers
  CACHE_S: 2,           // real seconds a prayer's both futures are kept before they are worked out again
  LOG_KEEP: 40,
};
const P = TUNE_PRAYERS;
const rel = (who, s) => {
  if (who.partner === s) return s.sex === 'f' ? 'wife' : 'husband';
  if (s.mother === who || s.father === who) return s.sex === 'f' ? 'daughter' : 'son';
  if (who.mother === s) return 'mother';
  if (who.father === s) return 'father';
  if (s.mother && (s.mother === who.mother)) return s.sex === 'f' ? 'sister' : 'brother';
  return null;
};

export default {
  id: 'forces-prayers',
  tune: TUNE_PRAYERS,
  init(R) {
    const { S } = R;
    const T1 = R.T;
    const H = () => hardshipApi();
    const yr = () => Math.floor(S.year);
    const open = [];
    const log = [];
    let seq = 0, acc = P.EVERY_S * 0.5, checkT = 0, lastNew = -1e9;
    const shift = (p, df, dd, text) => (R.faith?.shift ? R.faith.shift(p, df, dd, text) : (p.faith = clamp(p.faith + df, 0, 100), p.skep = clamp(p.skep + dd, 0, 100)));
    const clanName = (p) => { const c = R.ask('clanOf', p); return c ? `the ${c.name} clan` : `the ${p.family.name} family`; };
    const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) <= r;
    const homeOf = (f) => (f?.home ? { x: f.home.door?.x ?? f.home.cx, z: f.home.door?.z ?? f.home.cz } : null);
    const fieldOf = (f) => { const fl = f?.fields?.find((x) => x.done); return fl ? { x: fl.mx ?? fl.cx, z: fl.mz ?? fl.cz } : null; };
    const grownOf = (f) => f.members.filter((m) => !m.dead && m.age >= T1.CHILD_UNTIL && m.faith >= P.MIN_FAITH);
    const pickW = (all) => { const list = all.filter((x) => x.w > 0); if (!list.length) return null; const s = list.reduce((a, x) => a + x.w, 0); let r = Math.random() * s; for (const x of list) { r -= x.w; if (r <= 0) return x; } return list[list.length - 1]; };
    const yrs = (n) => `${number(Math.max(1, Math.round(n)))} ${Math.round(n) === 1 ? 'year' : 'years'}`;
    const lifeToCal = (l) => l / T1.LIFE_RATE;

    // ================= what is true for them: the wishes =================
    // each returns candidates { kind, who, key, words, x, z, answer: { power, target }, until, accept(ev), state(), outcome() }
    function wishes() {
      const out = [];
      const taken = new Set(open.map((x) => x.key));
      const add = (c) => { if (c && c.who && !taken.has(c.key) && !c.who.dead && c.who.faith >= P.MIN_FAITH) out.push(c); };
      // a sick person, prayed for by their kin
      for (const s of S.people) {
        const sk = s.ext?.hardship?.sick;
        if (!sk || s.dead || !settled(s)) continue;
        const kin = s.family.members.filter((q) => !q.dead && q !== s && q.age >= 8 && !q.ext?.hardship?.sick && q.faith >= P.MIN_FAITH); // a child prays for a sick parent too
        for (const q of [s.mother, s.father, s.partner]) if (q && !q.dead && !kin.includes(q) && q.faith >= P.MIN_FAITH && !q.ext?.hardship?.sick) kin.push(q);
        if (!kin.length) continue;
        const who = kin[Math.floor(Math.random() * kin.length)];
        const r = rel(who, s);
        // the prayer lasts until a little after the sickness runs its course (its death or its end decides it)
        const until = Math.min(yr() + P.LIMIT_YEARS, Math.ceil(S.year + lifeToCal((sk.die ? sk.dieAt : sk.until) - S.life)) + 2);
        add({ kind: 'sick', who, subject: s, key: `sick:${s.id}`, x: s.x, z: s.z, until: Math.max(yr() + 2, until),
          words: `${r ? `My ${r} ` : ''}${s.name} burns with ${sk.label}. Make ${herO(s)} well.`, wish: `${s.name} healed`,
          answer: { power: 'heal', target: { kind: 'person', entity: s, x: s.x, z: s.z } },
          accept: (ev) => ev.id === 'heal' && (ev.target?.entity === s || (ev.target?.kind === 'area' && near(s, ev.target, (ev.target.r ?? 0) + 0.5))),
          state: () => (s.dead ? 'lost' : !s.ext?.hardship?.sick ? 'solved' : null) });
      }
      const fams = S.families.filter((f) => f.state === 'settled');
      for (const f of fams) {
        const need = S.peopleApi.needOf(f), home = homeOf(f);
        if (!home) continue;
        const grown = grownOf(f);
        if (!grown.length) continue;
        const who = grown[Math.floor(Math.random() * grown.length)];
        const fld = fieldOf(f);
        // hunger, for a hungry child
        const kids = f.members.filter((m) => !m.dead && m.stage === 'child');
        if (kids.length && (f.members.some((m) => m.hunger > 0) || f.food < need * 0.8)) {
          const kid = kids[0];
          const deer = !fld;
          const spot = deer ? R.ask('deerSpot', f) : null; // where a deer could stand by their door (hunting.js)
          const at = deer ? (spot ?? { x: home.x + 6, z: home.z + 3 }) : fld;
          add({ kind: 'hunger', who, subject: f, key: `hunger:${f.id}`, x: home.x, z: home.z, until: yr() + P.LIMIT_YEARS,
            words: `${kid.name} cries all night, and there is nothing in the pot. Send us food.`, wish: `food for the ${f.name} family`,
            answer: deer ? { power: 'deer', via: 'sim.spawnAnimal', tool: 'animals', target: { kind: 'area', x: at.x, z: at.z, r: 0 } } : { power: 'bless-harvest', target: { kind: 'area', x: at.x, z: at.z, r: PRAYER_R } },
            accept: (ev) => (ev.id === 'bless-harvest' && (f.fields.some((fl) => fl.done && near({ x: fl.mx ?? fl.cx, z: fl.mz ?? fl.cz }, ev.target, (ev.target.r ?? 6) + 3)) || near(home, ev.target, (ev.target.r ?? 6) + 2))) || (ev.id === 'deer' && near(home, ev.target, 45)),
            state: () => (f.state !== 'settled' || f.members.every((m) => m.dead) ? 'lost' : f.members.some((m) => m.cause === 'hunger') ? 'lost' : !f.members.some((m) => m.hunger > 0) && f.food >= need ? 'solved' : null) });
        }
        // a harvest (only for a family with a field and no worse trouble)
        if (fld && !f.members.some((m) => m.hunger > 0)) {
          add({ kind: 'harvest', who, subject: f, key: `harvest:${f.id}`, x: fld.x, z: fld.z, until: yr() + Math.round(P.LIMIT_YEARS * 0.6),
            words: 'Let the grain come in heavy this year. Just this once.', wish: `a good harvest for the ${f.name} family`,
            answer: { power: 'bless-harvest', target: { kind: 'area', x: fld.x, z: fld.z, r: PRAYER_R } },
            accept: (ev) => ev.id === 'bless-harvest' && near(fld, ev.target, (ev.target.r ?? 6) + 3),
            state: () => (f.state !== 'settled' ? 'lost' : null), unsolvable: true }); // left alone, the harvest comes in as it would
        }
        // a husband or wife out on the hunt
        const out = f.members.find((m) => !m.dead && m !== who && m.partner === who && /tracking|stalking|hurrying after/.test(m.doing ?? ''));
        if (out) {
          const h0 = out.ext?.hunt?.lastAt ?? -1e9;
          add({ kind: 'hunt', who, subject: out, key: `hunt:${out.id}`, x: out.x, z: out.z, until: yr() + P.LIMIT_YEARS,
            words: `${out.name} has been out after deer since dawn. Send ${herO(out)} something to kill.`, wish: `game for ${out.name}`,
            answer: { power: 'deer', via: 'sim.spawnAnimal', tool: 'animals', target: { kind: 'area', x: out.x + 8, z: out.z + 4, r: 0 } },
            accept: (ev) => ev.id === 'deer' && near(out, ev.target, 30),
            state: () => (out.dead ? 'lost' : (out.ext?.hunt?.lastAt ?? -1e9) > h0 ? (/deer|rabbit/.test(out.ext.hunt.lastWhat ?? '') ? 'solved' : 'lost') : null), own: 'brought it down by their own hand' });
        }
      }
      // a drought or a fire on their land
      for (const h of H()?.active() ?? []) {
        if (h.kind !== 'drought' && h.kind !== 'fire') continue;
        const fs = [...(h.families ?? [])].filter((f) => f.state === 'settled' && homeOf(f));
        for (const f of fs) {
          const grown = grownOf(f);
          if (!grown.length) continue;
          const who = grown[Math.floor(Math.random() * grown.length)];
          const home = homeOf(f);
          if (h.kind === 'drought') {
            const at = fieldOf(f) ?? home;
            add({ kind: 'drought', who, subject: f, hard: h, key: `drought:${h.id}:${f.id}`, x: at.x, z: at.z, until: Math.min(yr() + P.LIMIT_YEARS, Math.ceil(h.until ?? yr() + P.LIMIT_YEARS) + 2),
              words: 'Rain. Please. The barley is dust and the stream is a crack in the mud.', wish: `rain on the ${f.name} family's land`,
              answer: { power: 'bless-harvest', target: { kind: 'area', x: at.x, z: at.z, r: PRAYER_R } },
              accept: (ev) => ev.id === 'bless-harvest' && (near(at, ev.target, (ev.target.r ?? 6) + 3) || near({ x: h.x, z: h.z }, ev.target, (h.r ?? 0) + (ev.target.r ?? 6))),
              state: () => (h.ended ? 'solved' : f.state !== 'settled' ? 'lost' : null), own: 'got through the drought by their own hands' });
          } else {
            add({ kind: 'fire', who, subject: f, hard: h, key: `fire:${h.id}:${f.id}`, x: h.x ?? home.x, z: h.z ?? home.z, until: yr() + 6, hold: () => !h.ended,
              words: 'The fire is coming for our hut! Put it out, put it out!', wish: `the fire put out before the ${f.name} family's hut`,
              answer: { power: 'bless-harvest', target: { kind: 'area', x: (h.x ?? home.x), z: (h.z ?? home.z), r: PRAYER_R } },
              accept: (ev) => ev.id === 'bless-harvest' && (near(home, ev.target, (ev.target.r ?? 6) + 6) || near({ x: h.x ?? home.x, z: h.z ?? home.z }, ev.target, (ev.target.r ?? 6) + 4)),
              state: () => (h.ended ? (f.members.some((m) => m.dead && m.cause === 'fire') ? 'lost' : 'solved') : null), own: 'beat the fire back themselves' });
          }
        }
      }
      // a wolf near home
      for (const w of S.predators) {
        if (w.dead || w.state === 'leave' || w.state === 'feed') continue;
        const f = fams.find((x) => { const h = homeOf(x); return h && near(h, w, 40); });
        if (!f) continue;
        const grown = grownOf(f);
        if (!grown.length) continue;
        const who = grown[Math.floor(Math.random() * grown.length)];
        const prey0 = w.prey?.kind === 'person' ? w.prey : null;
        add({ kind: 'wolf', who, subject: w, key: `wolf:${w.id}`, x: w.x, z: w.z, until: yr() + P.LIMIT_YEARS,
          words: `There is a wolf ${f.fields.length ? 'by the fields' : 'by the hut'} again. Take it away before it takes one of us.`, wish: 'the wolf gone',
          answer: { power: 'strike', target: { kind: 'animal', entity: w, x: w.x, z: w.z } },
          accept: (ev) => ev.id === 'strike' && ev.target?.entity === w,
          state: () => (f.members.some((m) => m.dead && m.cause === 'wolf') || (prey0 && prey0.dead) ? 'lost' : w.dead || w.gone || !S.predators.includes(w) ? 'solved' : null), own: 'kept the wolf off themselves' });
      }
      // a son or daughter marching to a fight
      for (const fi of R.ask('fights:api')?.active ?? []) {
        if ((fi.kind !== 'raid' && fi.kind !== 'skirmish') || (fi.phase !== 'gather' && fi.phase !== 'march')) continue;
        for (const [side, list] of [[0, fi.attackers], [1, fi.defenders]]) {
          for (const s of list) {
            if (s.dead) continue;
            const who = [s.mother, s.father].find((q) => q && !q.dead && q.faith >= P.MIN_FAITH);
            if (!who) continue;
            const other = side === 0 ? fi.b : fi.a;
            const oName = R.ask('clans:api')?.groupName?.(other) ?? 'them';
            add({ kind: 'fight', who, subject: s, fight: fi, side, key: `fight:${fi.id}:${s.id}`, x: s.x, z: s.z, until: yr() + P.LIMIT_YEARS,
              hold: () => (R.ask('fights:api')?.active ?? []).includes(fi), // open until the fight is decided
              words: `My ${s.sex === 'f' ? 'daughter' : 'son'} ${s.name} goes against ${oName} today. Let ${herO(s)} win, and come home.`, wish: `${s.name} to win the fight`,
              answer: { power: 'bless-weapons', target: { kind: 'person', entity: s, x: s.x, z: s.z } },
              accept: (ev) => ev.id === 'bless-weapons' && (ev.target?.entity && R.ask('clanOf', ev.target.entity) === R.ask('clanOf', s) || (ev.target?.kind === 'area' && near(s, ev.target, ev.target.r ?? 6))),
              // decided when the fight ends: won, lost, or called off (nobody fought: the prayer simply ends)
              state: () => (s.dead ? 'lost' : !(R.ask('fights:api')?.active ?? []).includes(fi) ? (fi.winner === side ? 'solved' : fi.winner == null ? 'off' : 'lost') : null), own: 'won it with their own arms' });
            break;
          }
        }
      }
      // a rival clan (a bitter grudge): bring one of them low
      for (const e of R.ask('grudges') ?? []) {
        if (e.g < P.RIVAL_GRUDGE || e.a?.type !== 'clan' || e.b?.type !== 'clan') continue;
        const mine = (e.a.members ?? []).filter((p) => p.age >= T1.CHILD_UNTIL && p.faith >= P.MIN_FAITH && settled(p));
        const theirs = (e.b.members ?? []).filter((p) => p.age >= T1.CHILD_UNTIL && settled(p) && !p.ext?.hardship?.sick);
        if (!mine.length || !theirs.length) continue;
        // the one they resent most: their most promising thinker, else their strongest
        const rival = theirs.slice().sort((a, b) => ((b.ext?.mind?.since ?? 0) - (a.ext?.mind?.since ?? 0)) || ((b.ext?.forces?.s ?? 0) - (a.ext?.forces?.s ?? 0)))[0];
        const who = mine[Math.floor(Math.random() * mine.length)];
        add({ kind: 'rival', who, subject: rival, key: `rival:${rival.id}`, x: rival.x, z: rival.z, until: yr() + P.LIMIT_YEARS,
          words: `${rival.name} of the ${e.b.name} clan laughs at us down at the water. Bring ${herO(rival)} low.`, wish: `${rival.name} humbled`,
          answer: { power: 'send-sickness', target: { kind: 'person', entity: rival, x: rival.x, z: rival.z } },
          accept: (ev) => (ev.id === 'send-sickness' || ev.id === 'strike') && (ev.target?.entity === rival || (ev.target?.kind === 'area' && near(rival, ev.target, (ev.target.r ?? 0) + 0.5))),
          state: () => (rival.dead ? 'lost' : null), unsolvable: true });
      }
      return out;
    }

    // ================= both futures =================
    const clean = (l) => (l ?? []).filter((x) => x && x !== 'Nothing.');
    function forecastLines(pr) {
      const a = pr.answer;
      const out = [];
      if (a.power === 'deer') {
        const HT = R.tune('hunting');
        const hunter = pr.kind === 'hunt' ? pr.subject : pr.subject.members?.find((m) => !m.dead && m.stage === 'adult');
        const hit = Math.round(Math.min(0.97, (HT?.HIT_PLACED ?? 0.85) * (hunter ? R.ask('huntSkill', hunter) ?? 1 : 1)) * 100);
        out.push(`A deer stands by ${pr.kind === 'hunt' ? pr.subject.name : 'their door'}. A deer put down fresh has not learned to fear spears: about ${hit} in 100 throws kill it, and a deer is about ${HT?.MEAT_DEER ?? 36} years of one grown-up's eating.`);
        // the Animals tool's placement is witnessed like any act (god/animals.js): say who would see it appear
        const seen = R.noticeCount({ kind: 'animal', x: a.target.x, z: a.target.z, r: 0 });
        out.push(seen ? `${seen === 1 ? 'One person sees' : `${cap1(number(seen))} people see`} it appear out of nowhere: their faith grows. (Your Animals tool.)` : 'Nobody sees you put it there: to them it just walked up. (Your Animals tool.)');
        return out;
      }
      const f = R.forecast(a.power, a.target);
      if (!f?.ok) return [`It cannot be answered that way now: ${f?.who ?? 'the power refuses'}`];
      out.push(...clean(f.gains), ...clean(f.fates), ...clean(f.costs));
      if (f.who) out.push(f.who);
      out.push(...clean(f.later));
      return out;
    }
    function ifNotLines(pr) {
      const s = pr.subject, out = [];
      switch (pr.kind) {
        case 'sick': {
          const sk = s.ext?.hardship?.sick;
          if (sk?.die) out.push(`${s.name} dies of ${sk.label} at ${Math.floor(s.age + (sk.dieAt - S.life))}, in about ${yrs(lifeToCal(sk.dieAt - S.life))}.`);
          else if (sk) out.push(`${s.name} gets over ${sk.the ?? sk.label} alone in about ${yrs(lifeToCal(sk.until - S.life))}.`);
          break;
        }
        case 'hunger': {
          const doomed = s.members.filter((m) => !m.dead && S.mind.endOf(m).how === 'hunger');
          if (doomed.length) for (const m of doomed.slice(0, 3)) out.push(`${m.name} dies of hunger at ${S.mind.endOf(m).age}.`);
          else if (Number.isFinite(S.peopleApi.leaveLeft?.(s) ?? Infinity)) out.push(`The ${s.name} family give up and leave in about ${yrs(lifeToCal(S.peopleApi.leaveLeft(s)))}, hungry, before anyone starves.`);
          else if (s.members.some((m) => !m.dead && m.hunger > 0)) out.push('They are going hungry. Within a few years it will be plain whether anyone starves.');
          else out.push('They go hungry for a while and pull through on berries and what they can find.');
          break;
        }
        case 'drought': out.push(`The drought ends by itself in about ${yrs((pr.hard.until ?? S.year) - S.year)}. Until then their fields give a third of the food.`); break;
        case 'fire': {
          const pv = H()?.fire?.preview?.(pr.x, pr.z, 10);
          if (pv?.huts?.length) out.push(`The fire takes ${pv.huts.length === 1 ? 'a hut' : `${number(pv.huts.length)} huts`}${pv.trapped?.length ? `, and ${pv.trapped.map((p) => p.name).join(', ')} ${pv.trapped.length === 1 ? 'dies' : 'die'} inside` : ''}.`);
          else out.push('The fire burns itself out without reaching a home.');
          break;
        }
        case 'wolf': {
          const pz = s.prey?.kind === 'person' ? s.prey : null;
          if (pz && s.outcome) out.push(s.outcome === 'kill' ? `The wolf kills ${pz.name}.` : s.outcome === 'wound' ? `The wolf bites ${pz.name}, who lives.` : `${pz.name} sees the wolf in time and gets away.`);
          else out.push('The wolf prowls on. Whether it takes anyone is rolled when it begins a hunt: a grown person sees it coming about half the time.');
          break;
        }
        case 'fight': {
          const fi = pr.fight, pl = fi.plan;
          if (pl) {
            const dies = pl.dead?.flat().includes(s);
            out.push(`As things stand ${pl.winner === pr.side ? `${s.name}'s side wins` : pl.winner == null ? 'neither side gives way' : `${s.name}'s side loses`}, and ${s.name} ${dies ? 'dies' : 'comes home'}.`);
          }
          break;
        }
        case 'rival': {
          let sum = 0; for (const q of S.people) sum += q.ext?.mind?.since ?? 0;
          const ch = sum > 0 ? (s.ext?.mind?.since ?? 0) / sum : 0;
          out.push(ch > 0.02 ? `${s.name} thinks on, and has ${chanceText(ch)} of making the next discovery: ${R.ask('nextDiscovery')?.name?.toLowerCase() ?? 'the next one'}.` : `${s.name} goes on as before.`);
          break;
        }
        case 'harvest': out.push('The harvest comes in as it would. No extra food.'); break;
        case 'hunt': out.push(`${s.name} hunts on: about ${Math.round(Math.min(0.97, (R.tune('hunting')?.HIT_DEER ?? 0.5) * (R.ask('huntSkill', s) ?? 1)) * 100)} in 100 throws at a deer kill.`); break;
        default: break;
      }
      return out;
    }
    // what only the prayer adds, said the same way in both futures
    function extraAnswered(pr) {
      const out = [];
      const w = pr.who;
      if (pr.kind === 'rival') {
        let sum = 0; for (const q of S.people) sum += q.ext?.mind?.since ?? 0;
        const ch = sum > 0 ? (pr.subject.ext?.mind?.since ?? 0) / sum : 0;
        if (ch > 0.02) out.push(`${pr.subject.name} had ${chanceText(ch)} of making the next discovery. Laid low, that thinking is lost to everyone.`);
        if (R.ask('forces:great-api')?.greatOfPerson(pr.subject)) out.push(`${pr.subject.name} is ${R.ask('forces:great-api').greatOfPerson(pr.subject).title}: if ${she(pr.subject)} dies, the clan's level drops.`);
      }
      if (pr.kind === 'fight' && pr.side === 0 && pr.fight.kind === 'raid') {
        const FT = R.tune('fights');
        out.push(`They are the raiders. If they win they carry off ${Math.round((FT?.LOOT_SHARE ?? 0.4) * 100)} percent of the raided households' stores, and the raided side's grudge rises by ${FT?.RAID ?? 22}.`);
      }
      out.push(`${w.name}'s faith +${P.ANSWERED_FAITH} (counting what seeing it gives), skepticism -${P.ANSWERED_FAITH / 2}: the prayer was answered. ${cap1(her(w))} household hears of it: faith +${P.HOUSE_FAITH} each.`);
      const l = R.ask('lineOf', pr.kind === 'sick' || pr.kind === 'hunt' || pr.kind === 'fight' ? pr.subject : w);
      if (l && pr.answer.power !== 'send-sickness' && pr.answer.power !== 'strike') out.push(`${cap1(l.name)}: a mark (${l.total} of ${l.blessAt} to be blessed). ${l.nextMark}`);
      return out;
    }
    function extraNot(pr) {
      const w = pr.who;
      const out = [`${w.name}: skepticism +${P.UNANSWERED_SKEP}, faith ${P.UNANSWERED_FAITH}. Nothing came.`];
      if (!pr.unsolvable) out.push(`If it comes right without you, ${w.name} gains strength +${P.OWN_STRENGTH}: ${pr.own ?? 'they managed alone'}.`);
      return out;
    }
    function futures(pr) {
      const now = performance.now();
      if (pr.cache && now - pr.cache.t < P.CACHE_S * 1000) return pr.cache;
      pr.cache = { t: now, ifAnswered: [...forecastLines(pr), ...extraAnswered(pr)], ifNot: [...ifNotLines(pr), ...extraNot(pr)] };
      return pr.cache;
    }
    function view(pr) {
      const fu = futures(pr);
      return {
        id: pr.id, kind: pr.kind, person: pr.who, name: pr.who.name, clan: clanName(pr.who), text: pr.words, says: `${pr.who.name} of ${clanName(pr.who)}: "${pr.words}"`, wish: pr.wish,
        x: pr.x, z: pr.z, year: pr.year, expires: pr.until, expiresLabel: R.yearLabel(pr.until), left: Math.max(0, Math.round(pr.until - S.year)),
        answer: { power: pr.answer.power, target: pr.answer.target, via: pr.answer.via ?? 'sim.act', tool: pr.answer.tool ?? null },
        ifAnswered: fu.ifAnswered, ifNot: fu.ifNot, subject: pr.subject,
      };
    }
    const logView = (pr) => ({ id: pr.id, kind: pr.kind, name: pr.who.name, person: pr.who, text: pr.words, wish: pr.wish, year: pr.year, ended: pr.ended, outcome: pr.outcome, power: pr.power ?? null, note: pr.note ?? '' });

    // ================= the pace =================
    const people = () => R.forces?.people;
    const paceK = () => { const f = people()?.faith ?? 30; return P.MIN_K + (1 - P.MIN_K) * smooth(f, P.CURVE[0], P.CURVE[1]); };
    function surface() {
      const c = wishes();
      if (!c.length) return null;
      const GA = R.ask('forces:great-api');
      for (const x of c) x.w = (P.WISH[x.kind] ?? 1) * (x.who.faith / 100) * (GA?.hasGreat(x.who, 'faith') ? R.tune('forces-great').SEER_PRAY : 1);
      const ch = pickW(c);
      if (!ch) return null;
      const pr ={ ...ch, id: `pr${++seq}`, year: yr(), started: S.year, rt: performance.now() };
      delete pr.w;
      open.push(pr);
      lastNew = performance.now();
      R.story(pr.who, `Prayed for ${pr.wish}.`);
      S.mind.push(pr.who, pr.words);
      R.alert('info', `${pr.who.name} of ${clanName(pr.who)} prays: "${pr.words}"`, { x: pr.x, z: pr.z, subject: pr.who });
      R.signal('prayer:new', view(pr));
      stats.made++;
      stats.times.push(Math.round(performance.now()));
      if (stats.times.length > 40) stats.times.shift();
      return pr;
    }
    R.on('step', ({ dt }) => {
      if (!(dt > 0) || R.ask('battleLive')) return; // a battle (sim/battle.js): prayers wait, none lapses (faith stays as it was)
      const real = dt / Math.max(1e-6, R.ctx.clock.speed || 1);
      acc = Math.min(P.EVERY_S, acc + real * paceK());
      if (acc >= P.EVERY_S && open.length < P.MAX_OPEN) acc = surface() ? 0 : P.EVERY_S - P.RETRY_S;
      checkT -= dt;
      if (checkT <= 0) { checkT = P.CHECK_S; check(); }
      if (pendingAns.length) settle();
    });

    // ================= answered, solved, lost, lapsed =================
    const pendingAns = []; // answered by an act: faith is settled after the act's witness ran
    let lastMoved = null;  // the last witnessed act: { kind, moved: Map(person -> faith gained) }
    R.on('witnessed', (info) => { lastMoved = { kind: info.act?.kind, moved: new Map((info.moved ?? []).map((m) => [m.p, m.df])) }; });
    function answered(pr, power) {
      close(pr, 'answered', power);
      lastMoved = null;
      pendingAns.push({ pr, power, t: S.clockT });
    }
    function settle() {
      for (const x of pendingAns.splice(0)) {
        const { pr, power } = x;
        const seen = lastMoved && (lastMoved.kind === power || !lastMoved.kind) ? lastMoved.moved : new Map();
        const w = pr.who;
        if (!w.dead) {
          const got = Math.max(0, seen.get(w) ?? 0);
          const add = Math.max(0, P.ANSWERED_FAITH - got);
          shift(w, add, -add / 2, `Prayed for ${pr.wish}, and it came`);
          R.story(w, `Prayed for ${pr.wish}, and it came.`);
          S.mind.push(w, 'It came. I asked, and it came.');
          for (const q of w.family.members) if (q !== w && !q.dead && q.age >= 6 && !seen.has(q)) shift(q, P.HOUSE_FAITH, -P.HOUSE_FAITH / 2, `Heard that ${w.name}'s prayer was answered`);
        }
        R.signal('prayer:answered', { ...logView(pr), power });
      }
      lastMoved = null;
    }
    R.on('act:after', (ev) => { for (const pr of [...open]) if (pr.accept(ev)) answered(pr, ev.id); });
    R.on('deer:placed', (e) => { for (const pr of [...open]) if (pr.accept({ id: 'deer', target: { kind: 'area', x: e.x, z: e.z, r: 0 } })) answered(pr, 'deer'); });
    function close(pr, outcome, power) {
      const i = open.indexOf(pr);
      if (i >= 0) open.splice(i, 1);
      pr.ended = yr(); pr.outcome = outcome; pr.power = power ?? null;
      log.push(pr);
      if (log.length > P.LOG_KEEP) log.shift();
      stats[outcome] = (stats[outcome] ?? 0) + 1;
    }
    function check() {
      for (const pr of [...open]) {
        if (pr.who.dead || pr.who.family?.state !== 'settled') { close(pr, 'gone'); pr.note = `${pr.who.name} is gone.`; R.signal('prayer:expired', { ...logView(pr), solved: false }); continue; }
        const st = pr.state();
        if (!st && (S.year < pr.until || pr.hold?.())) continue;
        const w = pr.who;
        if (st === 'off') { // the fight was called off: nothing to answer, nothing held against you
          close(pr, 'lapsed'); pr.note = 'The fight never came: it was called off.';
          R.story(w, `Prayed for ${pr.wish}. The fight was called off.`);
          R.signal('prayer:expired', { ...logView(pr), solved: false });
          continue;
        }
        const solved = st === 'solved';
        shift(w, P.UNANSWERED_FAITH, P.UNANSWERED_SKEP, solved ? `Prayed for ${pr.wish}; nothing came, and they managed alone` : `Prayed for ${pr.wish}, and nothing came`);
        if (solved && !pr.unsolvable) R.forces?.gain(w, P.OWN_STRENGTH, `Prayed, got no answer, and ${pr.own ?? 'managed alone'}`, { hard: true });
        R.story(w, solved ? `Prayed for ${pr.wish}. No answer came; ${pr.own ?? 'they managed alone'}.` : `Prayed for ${pr.wish}. No answer came.`);
        close(pr, solved ? 'solved' : st === 'lost' ? 'lost' : 'lapsed');
        pr.note = solved ? `${pr.own ?? 'Managed alone'}.` : st === 'lost' ? 'It went the bad way.' : 'The time ran out.';
        R.signal('prayer:expired', { ...logView(pr), solved });
      }
    }

    // ================= queries =================
    const stats = { made: 0, answered: 0, solved: 0, lost: 0, lapsed: 0, gone: 0, times: [] };
    R.answer('prayers', () => open.map(view));
    R.answer('prayerLog', (n = P.LOG_KEEP) => log.slice(-n).map(logView).reverse());
    R.answer('prayerStats', () => ({ ...stats, times: [...stats.times], open: open.length, pace: Math.round(paceK() * 100) / 100, everyS: Math.round(P.EVERY_S / paceK()) }));
    R.answer('prayerFor', (p) => open.filter((pr) => pr.who === p || pr.subject === p).map(view));
    R.prayers = { open, log, surface, wishes, stats, view, check };
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const mine = open.filter((pr) => pr.who === e);
      if (!mine.length) return;
      out.prayers = mine.map((pr) => ({ id: pr.id, text: pr.words, wish: pr.wish, expires: pr.until }));
      R.section(out, { id: 'prayer', title: 'Praying', lines: mine.map((pr) => `"${pr.words}" Until ${R.yearLabel(pr.until)}.`), order: 29 });
    });
  },
};
