// Raising the dead in the main game (the director, 2026-11-16: "i want to be able to resurrect in the main game. not
// just the battle."). The battle keeps its own "Bring back" (battle-field.js); this is the power 'resurrect', aimed at
// a grave (graves.js keeps one record per death). docs/SIM.md "Raising the dead" has the rules; docs/NUMBERS.md the
// numbers. His decisions, and what is built for each:
//   who        any grave the game still remembers. Old age: they come back for one minute of game time
//              (T.RESURRECT_OLD_AGE_S, on the game clock: pause and speed apply), then die of old age again, for good;
//              nobody is raised from old age twice. Any other cause: the rest of their natural life ahead of them,
//              their old-age date as it was.
//   the limit  one raising, then the next only T.RESURRECT_EVERY_SEASONS seasons later on the season clock (4: one
//              round of seasons). Until then the power refuses and says when, in seasons.
//   the title  "the Resurrected" after their name for the rest of their life: the name itself carries it, so every
//              place a name shows (labels, their card, the Log, family lists, other people's thoughts) says it. A mark of
//              standing over their head (ui/marks.js), a chip on their card, their household glad and their clan's
//              other households holding them in regard (happiness, below).
//   the return they rise at the grave (the nearest good ground when the grave is under water or built over), at the
//              age they died, weak for WEAK_YEARS (work and fighting as a wound), stand a moment looking about, their
//              thoughts confusion and surprise first, then happiness, and walk home: their own household, a partner
//              still unpaired, the nearest household of their clan, or a household of their own.
// The person is the same person (the same object, id, story and kin), taken back out of the dead.
// Queries: resurrect() the limit and who has risen; resurrectState(graveId) what the grave card offers; risen() the
// living Resurrected. Signals: resurrect:risen { person, grave }. Witness kind 'resurrect'.
import { T } from './tune.js';
import { number, cap, pick, yearLabel } from './words.js';
import { snapToGround } from './move.js';
import { hardshipApi } from './hardship.js';
import { SEASONS } from './season.js';

export const TUNE_RESURRECT = {
  // builder defaults (the director chose the limit and the minute; these are mine, for him to change)
  WEAK_YEARS: 4,        // life years they are weak after rising (a wound heals in 6: clans.js WOUND_LIFE)
  WEAK_WORK: 0.6,       // meanwhile they work this much as hard (a wound: clans.js WOUND_WORK 0.6)
  WEAK_FIGHT: 0.55,     // and fight this much as well (a wound: WOUND_FIGHT 0.55)
  RISE_S: 1.6,          // game seconds the rising takes: the figure gets up off the ground
  LOOK_S: 4,            // then stands this long looking about before walking home
  THINK_SURPRISE_S: 2.4,// seconds after the rising ends that surprise follows the first confusion
  THINK_HAPPY_S: 6.5,   // and happiness after that; happy thoughts lead for HAPPY_FOR seconds more
  HAPPY_FOR: 40,
  // what seeing it does (HIS TO DECIDE: he did not pick these; in the range of the other great acts, between a heal
  // (faith +6) and seeing a person struck from the sky (faith +25))
  SEEN_R: 3,            // seen this far beyond each person's sight
  SEEN_FAITH: 15, SEEN_DOUBT: -12, SEEN_HAPPY: 5,
  // regard
  HOME_GLAD: 12,        // their household: happiness up this much ...
  GLAD_YEARS: 6,        // ... for this many life years
  REGARD: 4,            // their clan's other households: happiness up this much ...
  REGARD_YEARS: 10,     // ... for this many life years
  OWN_FAITH: 20, OWN_DOUBT: -20, // the risen themselves: they were there
  OWN_HAPPY: 80,        // and their happiness starts at least this high
  SPOT_R: 12,           // the nearest good ground is looked for this far from the grave
  HOME_R: 120,          // a household of their clan to take them in is looked for this far away
};
const N = TUNE_RESURRECT;

// first confusion, then surprise, then happiness: several of each so two people do not say the same
const CONFUSED = [
  'Where... where am I? Why is the ground so cold?',
  'I remember the dark. Then nothing. Then this.',
  'Why am I lying out here? What happened to me?',
  'My head is full of mist. How long was I gone?',
  'Was I asleep? Everything looks too bright.',
  'Earth in my hair. Earth everywhere. What is this?',
];
const SURPRISED = [
  'I am breathing. I am breathing!',
  'My hands. I can feel my hands!',
  'I was dead. I know I was dead.',
  'The sky! I never thought I would see the sky again.',
  'Something brought me back. Something did.',
  'My heart is beating. Listen to it go!',
];
const HAPPY = [
  'I am alive! Alive, and I am going home.',
  'I cannot wait to see their faces.',
  'Every blade of grass looks new to me.',
  'A second life. I will not waste a day of it.',
  'Home. I want to go home and hold them all.',
  'The air tastes sweet. Everything tastes sweet.',
];
const HAPPY_OLD = [
  'One more look at them all. That is all I want.',
  'Just a little longer. Long enough to say goodbye.',
  'The fields, the fire, the faces. Once more.',
];

export default {
  id: 'resurrect',
  tune: TUNE_RESURRECT,
  init(R) {
    const { S, ctx } = R;
    const land = S.land;
    const she = (p) => (p.sex === 'f' ? 'she' : 'he'), her = (p) => (p.sex === 'f' ? 'her' : 'his'), herO = (p) => (p.sex === 'f' ? 'her' : 'him');
    const yrs = (n) => `${number(n)} ${n === 1 ? 'year' : 'years'}`;
    const cal = (life) => Math.max(1, Math.round(life / T.LIFE_RATE)); // life years to calendar years
    const stageOf = (age) => (age < T.CHILD_UNTIL ? 'child' : age < T.ELDER_FROM ? 'adult' : 'elder');
    const data = (p) => R.data(p, 'resurrect', () => ({ times: 0, oldAge: false, year: null, until: null }));

    // the dead behind each grave, kept so the same person can rise (grave id -> person)
    const bodies = new Map();
    R.on('person:death', (p) => {
      const g = R.ask('graveOf', p.id);
      if (g) bodies.set(g.id, p);
      if (bodies.size > (R.tune('graves')?.KEEP ?? 600) + 40) for (const id of [...bodies.keys()]) if (!R.ask('grave', id)) bodies.delete(id);
    });

    // ---------- the limit: one raising, then the next EVERY_SEASONS seasons later on the season clock ----------
    let lastAt = -Infinity; // season clock seconds of the last raising
    let count = 0;
    const seasonLen = () => R.ask('season')?.secs ?? T.SEASON_SECS;
    const seasonNow = () => S.seasonSecs ?? S.clockT;
    const nextAt = () => lastAt + T.RESURRECT_EVERY_SEASONS * seasonLen();
    const waitSecs = () => Math.max(0, nextAt() - seasonNow());
    // "in about two seasons, in the summer" (never in seconds)
    function whenWords() {
      const L = seasonLen(), left = waitSecs(), at = seasonNow() + left;
      const n = Math.max(1, Math.round(left / L));
      const k = Math.floor(at / L + 1e-6), name = SEASONS[((k % 4) + 4) % 4], start = at / L - Math.floor(at / L + 1e-6) < 0.02;
      return `in about ${number(n)} ${n === 1 ? 'season' : 'seasons'}, ${start ? `as ${name} begins` : `in the ${name}`}`;
    }
    const limitWords = () => `You can raise one of the dead once in ${T.RESURRECT_EVERY_SEASONS === 4 ? 'a round of seasons' : `${number(T.RESURRECT_EVERY_SEASONS)} seasons`}.`;

    // ---------- the grave a target means ----------
    function graveOf(t) {
      if (!t) return null;
      if (t.kind === 'grave' && t.grave) return R.ask('grave', t.grave);
      if (t.grave?.id) return R.ask('grave', t.grave.id);
      if (Number.isFinite(t.x)) return R.ask('graveAt', t.x, t.z, 2.5);
      return null;
    }
    // can this grave's dead be raised now? { ok, g, p, why, wait }
    function check(g) {
      if (!g) return { ok: false, why: 'That is not a grave. Tap one of the grave mounds.' };
      const p = bodies.get(g.id) ?? null;
      if (g.raised) return { ok: false, g, why: `The grave is empty: ${p?.name ?? g.name} rose from it in ${g.raised.yearLabel}.` };
      if (!p) return { ok: false, g, why: `${g.name} died too long ago: nobody remembers them well enough to raise.` };
      if (!p.dead) return { ok: false, g, p, why: `${p.name} is alive.` };
      if (R.ask('battleLive')) return { ok: false, g, p, why: 'A battle is on. Raise the dead when it is over.' };
      if (g.cause === 'old age' && data(p).oldAge) return { ok: false, g, p, why: `Old age has taken ${p.name} twice. Nobody is raised from old age a second time.` };
      if (waitSecs() > 0) return { ok: false, g, p, wait: true, why: `${limitWords()} The next is ready ${whenWords()}.` };
      return { ok: true, g, p };
    }

    // ---------- where they rise ----------
    function spotFor(g, p) {
      const lying = S.people.includes(p); // the body still lies where it fell (or is being carried)
      const x0 = lying ? p.x : g.x, z0 = lying ? p.z : g.z;
      const cx = Math.floor(x0), cz = Math.floor(z0);
      if (land.inside(cx, cz) && land.spotOk(cx, cz, 'person')) return { x: x0, z: z0, moved: null };
      const why = !land.inside(cx, cz) ? 'out past the edge of the land' : land.wet[land.ci(cx, cz)] ? 'under water now' : 'built over or blocked now';
      const s = land.nearestSpot(x0, z0, 'person', N.SPOT_R) ?? land.nearestOpen(x0, z0, 'person', N.SPOT_R);
      if (s) return { x: s.x, z: s.z, moved: why };
      const h = homeFor(p).fam?.home;
      const d = h?.door ?? S.stone.centre;
      const s2 = land.nearestSpot(d.x, d.z, 'person', 8) ?? { x: d.x, z: d.z };
      return { x: s2.x, z: s2.z, moved: why, far: true };
    }

    // ---------- the household they go home to ----------
    const settledFam = (f) => !!f && f.state === 'settled' && S.families.includes(f) && f.members.some((m) => !m.dead);
    const clanIdOf = (p) => p.ext?.clans?.clan ?? null;
    const famClanId = (f) => f?.ext?.clans?.clan ?? null;
    const famXZ = (f) => (f.home ? { x: f.home.mx ?? f.home.cx ?? f.home.x, z: f.home.mz ?? f.home.cz ?? f.home.z } : f.members.find((m) => !m.dead) ?? { x: 0, z: 0 });
    function nearestFam(p, ok) {
      let best = null, bd = N.HOME_R;
      for (const f of S.families) {
        if (!settledFam(f) || !ok(f)) continue;
        const c = famXZ(f), d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    }
    // { fam, kind: 'own' | 'partner' | 'parent' | 'clan' | 'taken' | 'new', partner }
    function homeFor(p) {
      const q = p.partner && !p.partner.dead && (!p.partner.partner || p.partner.partner === p) ? p.partner : null;
      const lost = p.partner && !q ? p.partner : null; // dead, or with someone else now
      const out = (fam, kind) => ({ fam, kind, partner: q && fam && q.family === fam ? q : null, lost: lost ?? (q && fam && q.family !== fam ? q : null) });
      if (q && settledFam(q.family)) return out(q.family, q.family === p.family ? 'own' : 'partner');
      if (settledFam(p.family)) return out(p.family, 'own');
      if (p.stage === 'child' || p.age < T.CHILD_UNTIL) {
        for (const par of [p.mother, p.father]) if (par && !par.dead && settledFam(par.family)) return out(par.family, 'parent');
      }
      const cid = clanIdOf(p);
      const clanFam = cid ? nearestFam(p, (f) => famClanId(f) === cid && f.members.length < T.HOUSE_MAX) ?? nearestFam(p, (f) => famClanId(f) === cid) : null;
      if (clanFam) return out(clanFam, 'clan');
      // a child is never left on their own: the nearest household takes them in
      if (p.age < T.CHILD_UNTIL) { const any = nearestFam(p, () => true); if (any) return out(any, 'taken'); }
      return out(null, 'new');
    }
    const homeWords = (p, H) => {
      const fn = H.fam ? `the ${H.fam.name} family` : '';
      if (H.kind === 'own') return `${cap(she(p))} goes home to ${fn}${H.partner ? `, and to ${H.partner.name}` : ''}.`;
      if (H.kind === 'partner') return `${cap(she(p))} goes home to ${H.partner?.name ?? 'the one waiting'}, in the hut of ${fn}.`;
      if (H.kind === 'parent') return `${her(p) === 'her' ? 'Her' : 'His'} family is gone from that hut: ${she(p)} goes to ${fn}, where a parent lives.`;
      if (H.kind === 'clan') return `${her(p) === 'her' ? 'Her' : 'His'} household is gone: ${she(p)} joins ${fn}, of the same clan.`;
      if (H.kind === 'taken') return `${her(p) === 'her' ? 'Her' : 'His'} household is gone: ${fn} takes ${herO(p)} in.`;
      return `${her(p) === 'her' ? 'Her' : 'His'} household and clan are gone: ${she(p)} makes a home of ${her(p)} own, as anyone alone here does.`;
    };

    // ---------- the witness: seeing the dead get up out of the grave ----------
    let last = null; // the last raised, so the god's single witness call names them
    const seenSpec = (p) => {
      const name = p?.name ?? 'someone';
      return { r: N.SEEN_R, exclude: p ?? undefined, faith: N.SEEN_FAITH, doubt: N.SEEN_DOUBT, happy: N.SEEN_HAPPY, early: T.EARLY_MULT, hooks: true, kind: 'resurrect',
        what: `${name} get up out of the grave, alive`,
        thought: `${name} was dead. I saw ${name} buried. And ${p ? she(p) : 'they'} just got up out of the grave!`,
        story: `Saw ${name} rise from the grave, alive.` };
    };

    // ---------- the forecast ----------
    function forecast(t) {
      const g = graveOf(t), c = check(g);
      if (!c.ok) return Object.assign(R.refuse(c.why), { wait: !!c.wait, refuseTitle: c.wait ? 'Not ready yet' : g ? 'This grave will not open' : 'Not a grave' });
      const { p } = c;
      const H = homeFor(p), spot = spotFor(g, p);
      const old = g.cause === 'old age';
      const age = Math.floor(p.age);
      const title = p.ext?.resurrect?.name0 ? p.name : `${p.name} the Resurrected`;
      const gains = [], costs = [], fates = [];
      const life = Math.floor(Math.max(p.lifespan, p.age + 1));
      // the first line is the whole of it (the card's "If you act" leads with it; at phone size it is all that shows)
      gains.push(old ? `${p.name} rises from the grave at ${age}, confused at first, for one more minute; then old age takes ${herO(p)} again, for good.`
        : `${p.name} rises from the grave at ${age}, confused and weak at first, and lives on to ${life}.`);
      gains.push(spot.moved ? `The grave is ${spot.moved}: ${she(p)} rises on the nearest good ground.` : `${cap(she(p))} rises where ${she(p)} was laid.`);
      if (old) gains.push(`${cap(she(p))} died of old age: one more minute of life (${number(T.RESURRECT_OLD_AGE_S)} seconds of time), then old age takes ${herO(p)} again, this time for good.`);
      else gains.push(`${cap(she(p))} has the rest of ${her(p)} life ahead: ${she(p)} lives to ${life}, ${her(p)} old-age date as it was.`);
      gains.push(`${cap(she(p))} carries a title for the rest of ${her(p)} life: ${title}.`);
      gains.push(homeWords(p, H));
      gains.push(`${cap(her(p))} household is glad to have ${herO(p)} back: happiness +${N.HOME_GLAD}${H.fam ? '' : ' (when there is one)'} for about ${yrs(cal(N.GLAD_YEARS))}, and ${her(p)} clan's other households hold ${herO(p)} in regard (+${N.REGARD}).`);
      // (gains[1] repeats the first line's place only when it moved: drop the plain "where laid" line from the short list)
      if (!spot.moved) gains.splice(1, 1);
      costs.push(old ? `${cap(she(p))} comes back confused at first, and weak for the minute ${she(p)} has: works ${Math.round(N.WEAK_WORK * 100)} percent as hard and fights ${Math.round(N.WEAK_FIGHT * 100)} percent as well.`
        : `${cap(she(p))} comes back confused at first, and weak: works ${Math.round(N.WEAK_WORK * 100)} percent as hard and fights ${Math.round(N.WEAK_FIGHT * 100)} percent as well for about ${yrs(cal(N.WEAK_YEARS))}.`);
      costs.push(`${limitWords()} After this one the next is ready in ${T.RESURRECT_EVERY_SEASONS === 4 ? 'a round of seasons' : `${number(T.RESURRECT_EVERY_SEASONS)} seasons`}.`);
      if (H.lost && !H.lost.dead) fates.push(`${H.lost.name} is with ${H.lost.partner?.name ?? 'someone else'} now: ${p.name} comes back without a partner.`);
      else if (H.partner) {
        const w = p.sex === 'f' ? p : H.partner, m = p.sex === 'f' ? H.partner : p;
        const kids = old ? 0 : (w.birthAges ?? []).filter((a) => a >= w.age && a < w.lifespan && a - w.age < m.lifespan - m.age).length;
        fates.push(`${p.name} and ${H.partner.name} are together again${kids ? `, and may have ${number(kids)} more ${kids === 1 ? 'child' : 'children'}` : ''}.`);
      }
      fates.push(old ? `Dies of old age again in about a minute, at ${Math.floor(p.age + T.RESURRECT_OLD_AGE_S / ctx.clock.secondsPerYear * T.LIFE_RATE)}. Nobody is raised from old age twice.` : `Dies of old age at ${Math.floor(Math.max(p.lifespan, p.age + 1))}, if nothing comes sooner.`);
      const W = R.describeWitness(seenSpec(p), spot.x, spot.z, N.SEEN_R, 'resurrect');
      costs.push(...W.costs);
      const heads = { act: gains[0], wait: `${p.name} stays in the grave.` };
      return { gains, costs, fates, who: W.who, seenBy: W.seenBy, word: W.word, confirm: 'click', kind: 'grave', name: p.name, sex: p.sex, old, grave: g.id, heads };
    }

    // ---------- the act ----------
    function act(t) {
      const g = graveOf(t), c = check(g);
      if (!c.ok) return { ok: false, text: c.why };
      const p = rise(c.g, c.p);
      return { ok: true, text: `${p.ext.resurrect.name0} rose from the grave: ${p.name}.`, x: p.x, z: p.z, r: N.SEEN_R, target: p, kind: 'grave' };
    }

    const risen = new Map(); // person -> { t0, phase, old, until, glad }
    let seq = 0;
    function rise(g, p) {
      const PA = S.peopleApi;
      const d = data(p);
      const old = g.cause === 'old age';
      const when = yearLabel(S.year);
      const H = homeFor(p), spot = spotFor(g, p);
      const lying = S.people.includes(p);
      // a body still lying (or carried, or a wolf at it): let it go first
      if (lying) {
        const F = R.ask('fights:api');
        for (const h of F?.hauls ?? []) if (h.who === p) h.done = true;
        for (const b of F?.bodies ?? []) if (b.p === p) b.done = true;
        for (const a of S.predators) if (a.kill === p) { a.kill = null; a.feedT = 0; }
      } else {
        S.people.push(p);
        p.deleted = false; p.removed = false; p.removedFromCore = false;
      }
      // alive again: the same person, as they were, with the dying undone
      p.dead = false; p.cause = null; p.deadT = 0; p.keepBody = undefined;
      p.hunger = 0; p.hungerFate = null; p.grief = 0; p.dread = 0; p.fleeing = null;
      p.hidden = false; p.inside = null; p.asleep = false; p.go = null; p.work = null; p.path = null; p.basket = null; p.carry = null; p.moving = false;
      p.stage = stageOf(p.age);
      const hd = p.ext?.hardship;
      if (hd) { hd.sick = null; hd.wound = null; }
      if (p.ext?.clans) p.ext.clans.wound = null;
      R.trait(p, 'sick', null); R.trait(p, 'wounded', null);
      if (old) { d.oldAge = true; d.until = S.clockT + T.RESURRECT_OLD_AGE_S; p.lifespan = p.age + 1000; } // the minute decides, not the years
      else p.lifespan = Math.max(p.lifespan, p.age + 1);
      // the household
      const from = p.family;
      let fam = H.fam;
      const made = !fam;
      if (made) fam = newHome(p, spot);
      if (fam !== from) { from.members = from.members.filter((m) => m !== p); p.family = fam; }
      if (!fam.members.includes(p)) fam.members.push(p);
      // (clans.js takes a new household into the person's own clan once they are in it)
      if (made) R.run('family:new', fam, [p]);
      if (H.partner) { p.partner = H.partner; H.partner.partner = p; } else p.partner = null;
      const cid = famClanId(fam);
      if (cid && p.ext?.clans) p.ext.clans.clan = cid;
      // the title, everywhere a name shows (children's lists of their parents' names follow it)
      const name0 = d.name0 ?? p.name;
      if (!d.name0) {
        d.name0 = name0;
        p.name = `${name0} the Resurrected`;
        for (const q of S.people) if ((q.mother === p || q.father === p) && Array.isArray(q.parents)) q.parents = q.parents.map((n) => (n === name0 ? p.name : n));
      }
      d.times++; d.year = Math.floor(S.year); d.cause = g.cause;
      // the figure, lying where the grave was, then getting up
      p.x = spot.x; p.z = spot.z;
      snapToGround(ctx.world, p);
      PA.refigure(p);
      if (p.F) { p.F.fig.rotation.z = Math.PI / 2; p.F.fig.position.y = 0.25; p.F.group.visible = true; }
      ctx.core.refreshVis?.(p);
      try { hardshipApi()?.fx?.glow(p.x, (p.y ?? 16) + 0.2, p.z); } catch { /* no glow */ }
      // weak for a while, as a wound
      R.mod('work', `resurrect:weak:${p.id}`, { mul: N.WEAK_WORK, who: p, until: S.life + N.WEAK_YEARS, note: 'weak from the grave' });
      R.mod('strength', `resurrect:weak:${p.id}`, { mul: N.WEAK_FIGHT, who: p, until: S.life + N.WEAK_YEARS, note: 'weak from the grave' });
      d.weakUntil = S.life + N.WEAK_YEARS;
      // their own mind, and the regard of their household and clan
      p.faith = Math.min(100, p.faith + N.OWN_FAITH); p.skep = Math.max(0, p.skep + N.OWN_DOUBT);
      p.happy = Math.max(p.happy, N.OWN_HAPPY);
      const k = ++seq;
      R.mod('happy', `resurrect:glad:${k}`, { add: N.HOME_GLAD, who: (q) => q?.kind === 'person' && q !== p && q.family === fam, until: S.life + N.GLAD_YEARS, note: `${p.name} came back from the grave` });
      if (cid) R.mod('happy', `resurrect:regard:${k}`, { add: N.REGARD, who: (q) => q?.kind === 'person' && q !== p && q.family !== fam && q.ext?.clans?.clan === cid, until: S.life + N.REGARD_YEARS, note: `${p.name} of their clan came back from the grave` });
      // stories, and grief undone
      R.story(p, `${cap(g.causeText || 'died')} at ${g.age} in ${g.yearLabel}. Rose from the grave in ${when}, by no hand: ${p.name}.`);
      for (const m of PA.kinOf(p)) {
        if (m.lost === name0 || m.lost === p.name) { m.grief = 0; m.lost = null; }
        R.story(m, `${name0} came back from the grave in ${when}.`);
        if (m.family === fam && !m.asleep && !m.hidden && Math.hypot(m.x - p.x, m.z - p.z) < 40) { m.thinkT = 9; S.mind.push(m, pick([`${name0} is back! ${cap(she(p))} came back to us!`, `It cannot be. ${name0}, walking about again!`, `I buried ${name0}. And there ${she(p)} is.`])); }
      }
      if (H.lost && !H.lost.dead) R.story(p, `Came back to find ${H.lost.name} with ${H.lost.partner?.name ?? 'another'}.`);
      // the rising, the look about, and home
      const rec = { p, t0: S.clockT, old, k, said: 0, yaw0: p.ry ?? 0, cur: CONFUSED[(k + p.seed) % CONFUSED.length] };
      risen.set(p, rec);
      p.nightBound = true; // (night does not cut the rising short: people.js drops work at night only for those not yet heading home)
      PA.work(p, 'rise', N.RISE_S, { doing: 'getting up out of the grave', then: () => lookAbout(rec) });
      p.thinkT = 99;
      S.mind.push(p, rec.cur);
      // the grave is empty now; the screen takes the mound away
      R.ask('graveRaised', g.id);
      lastAt = seasonNow(); count++;
      last = p;
      S.alert('good', `${name0} of the ${fam.name} family rose from the grave, alive. ${cap(she(p))} is ${p.name} now.${old ? ` Old age gives ${herO(p)} one more minute.` : ''}`, p.x, p.z, undefined, p);
      R.signal('resurrect:risen', { person: p, grave: g, old, x: p.x, z: p.z });
      return p;
    }
    // a household of one: their old hut if it stands empty, else a hut site near, else (huts not known) none yet
    function newHome(p, spot) {
      const PA = S.peopleApi;
      const taken = new Set(S.families.map((f) => f.name));
      const f = PA.newFamily(taken.has(p.family?.name) ? undefined : p.family?.name);
      f.state = 'settled'; f.settledYear = S.year; f.settledLife = S.life;
      f.food = T.NEW_HOME_FOOD * (p.age < T.CHILD_UNTIL ? T.EAT_CHILD : T.EAT);
      const oldHut = p.family?.home && p.family.home.done && !p.family.home.family && S.buildings.includes(p.family.home) ? p.family.home : null;
      const near = oldHut ?? S.buildings.find((b) => b.kind === 'hut' && b.done && !b.family && Math.hypot(b.cx - spot.x, b.cz - spot.z) < 40 && land.wdistAt(b.cx, b.cz) <= T.WATER_REACH);
      if (near) { f.home = near; near.family = f; near.name = `Hut of the ${f.name} family`; }
      else if (!R.ask('noHuts', f)) {
        const { best } = land.bestHut(spot.x, spot.z, T.PAIR_SITE_R, { huts: S.buildings.filter((b) => b.kind === 'hut').map((b) => ({ x: b.cx, z: b.cz })), stone: S.stone.centre, protectedAt: (x, z) => S.isProtected(x, z) });
        if (best) { f.home = S.build.planHut(f, best.x, best.z); f.plans.push(f.home); }
      }
      return f;
    }

    function lookAbout(rec) {
      const p = rec.p;
      if (p.dead || risen.get(p) !== rec) return;
      if (p.F) { p.F.fig.rotation.z = 0; }
      rec.phase = 'look';
      S.peopleApi.work(p, 'wonder', N.LOOK_S, { doing: 'looking about, bewildered', tick: (dt, w) => { p.yawT = rec.yaw0 + Math.sin(w.t * 1.5) * 1.1; return false; }, then: () => goHome(rec) });
    }
    function goHome(rec) {
      const p = rec.p;
      rec.phase = 'home';
      p.nightBound = false;
      const h = p.family.home;
      if (h?.done && h.door) S.peopleApi.goTo(p, h.door.x, h.door.z, { doing: 'walking home', r: 1.2, then: () => S.peopleApi.work(p, null, 0.6) });
    }

    // each step: the thoughts in order, the end of the minute, the figure upright once the rising is done
    R.on('step', () => {
      if (!risen.size) return;
      for (const [p, rec] of risen) {
        if (p.dead) { risen.delete(p); continue; }
        const t = S.clockT - rec.t0;
        if (p.work?.pose !== 'rise' && p.F && p.F.fig.rotation.z !== 0) p.F.fig.rotation.z = 0;
        if (rec.said < 1 && t >= N.RISE_S + N.THINK_SURPRISE_S) { rec.said = 1; p.thinkT = 99; rec.cur = SURPRISED[(rec.k + p.seed) % SURPRISED.length]; S.mind.push(p, rec.cur); }
        if (rec.said < 2 && t >= N.RISE_S + N.THINK_HAPPY_S) { rec.said = 2; p.thinkT = 8; const L = rec.old ? HAPPY_OLD : HAPPY; rec.cur = L[(rec.k + p.seed) % L.length]; S.mind.push(p, rec.cur); }
        // old age: the minute is up
        if (rec.old && S.clockT >= p.ext.resurrect.until) {
          risen.delete(p);
          p.lifespan = p.age;
          S.peopleApi.die(p, 'old age', {
            story: `Died of old age again at ${Math.floor(p.age)}, a minute after rising from the grave. Old age keeps ${herO(p)} this time.`,
            kinStory: () => `Lost ${p.name} a second time: old age took ${herO(p)} again, a minute after ${she(p)} rose.`,
          });
          continue;
        }
        if (t > N.RISE_S + N.THINK_HAPPY_S + N.HAPPY_FOR && !rec.old) risen.delete(p);
      }
    });
    // the risen's own household hears the tale of the rising at once from those who saw it (faith-tales.js), the risen
    // among them: they are not told their own story, and their first confusion is not talked over
    R.on('witnessed', (info) => {
      if (info?.act?.kind !== 'resurrect') return;
      for (const [p, rec] of risen) {
        if (rec.said >= 2) continue;
        p.story = p.story.filter((l) => !(l.includes('tell how') && l.includes(p.name)));
        if (p.thought !== rec.cur) { S.mind.push(p, rec.cur); p.thinkT = 99; }
        p.thoughts = (p.thoughts ?? []).filter((x) => x === rec.cur || !x.includes(p.name));
      }
    });
    // happy thoughts lead for a while after the rising
    R.on('thoughts', (p) => {
      const rec = risen.get(p);
      if (!rec || rec.said < 2 || p.asleep) return null;
      const L = rec.old ? HAPPY_OLD : HAPPY;
      return L.map((x) => [70, x]);
    });
    // the minute is the end, for the fate line and every forecast
    R.on('end', (p) => {
      const d = p.ext?.resurrect;
      if (!d?.oldAge || p.dead || d.until == null) return null;
      const left = Math.max(0, d.until - S.clockT);
      const age = Math.floor(p.age + left / ctx.clock.secondsPerYear * T.LIFE_RATE);
      const s = Math.max(1, Math.ceil(left / Math.max(1e-6, ctx.clock.speed || 1)));
      return { age, how: 'old age', words: `of old age again at ${age}, a minute after rising`, line: `Dies of old age again in about ${number(s)} ${s === 1 ? 'second' : 'seconds'}, at ${age}, for good this time.` };
    });
    R.on('fate', (p) => {
      const d = p.ext?.resurrect;
      if (!d?.times || p.dead) return null;
      const out = [`Came back from the grave in ${yearLabel(d.year)}: ${p.name}.`];
      if (d.weakUntil > S.life) out.push(`Weak from the grave for about ${yrs(cal(d.weakUntil - S.life))} more: works ${Math.round(N.WEAK_WORK * 100)} percent as hard, fights ${Math.round(N.WEAK_FIGHT * 100)} percent as well.`);
      return out;
    });
    R.on('inspect', (e, out) => {
      const d = e?.kind === 'person' ? e.ext?.resurrect : null;
      if (!d?.times || e.dead) return;
      out.risen = { year: d.year, yearLabel: yearLabel(d.year), text: `Rose from the grave in ${yearLabel(d.year)}.`, oldAge: !!d.oldAge };
    });

    R.power({ id: 'resurrect', witness: () => seenSpec(last), forecast, carryOut: act });
    R.answer('resurrect', () => ({ ready: waitSecs() <= 0, waitSecs: waitSecs(), when: waitSecs() > 0 ? whenWords() : 'now', every: T.RESURRECT_EVERY_SEASONS, count,
      risen: S.people.filter((p) => !p.dead && p.ext?.resurrect?.times).map((p) => p) }));
    R.answer('risen', () => S.people.filter((p) => !p.dead && !p.hidden && p.ext?.resurrect?.times));
    // what the grave card offers: { ok, wait, why, label }
    R.answer('resurrectState', (id) => {
      const g = R.ask('grave', id), c = check(g);
      const nm = c.p ? (c.p.ext?.resurrect?.name0 ?? c.p.name) : g?.name ?? 'them';
      return { ok: c.ok, wait: !!c.wait, why: c.why ?? '', label: c.ok ? `Resurrect ${nm}` : c.wait ? `Resurrect: ready ${whenWords().replace(/^in about /, 'in ')}` : '', raised: g?.raised ?? null };
    });
    // testing: make the next raising ready now
    R.answer('resurrect:dev', () => ({ ready() { lastAt = -Infinity; }, bodies: () => bodies.size }));
  },
};
