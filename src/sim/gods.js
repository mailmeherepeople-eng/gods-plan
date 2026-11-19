// Testing aid (docs/CHOICES.md "The four gods"): scripted gods that play a run by a fixed policy, so the shift
// the choices make can be measured. Nothing here runs unless a policy is set from the console:
//   const C = game.modules.sim.ask('choices:dev');
//   game.modules.sim.dev.crowd(36); C.setPolicy('housekeeper', game.modules.god.perform);
//   for (let k = 0; k < 12; k++) await game.modules.sim.skip(25);  C.report()
// Policies (looked at every LOOK_YEARS calendar years):
//   housekeeper  quietly removes every threat: strikes every wolf, heals everyone sick or hurt, rains on every
//                hungry or dry family's fields and on every fire near a home; each only when nobody would see it
//   absent       does nothing
//   showman      the same answers as the housekeeper, at once, in full view
//   careful      lets most things run; saves those whose living is a turning point (life-useful), lets those
//                whose death is one die; keeps a few wolves (strikes only past CAREFUL_WOLVES);
//                saves a life about to be lost for nothing (no turning point hangs on it) with the cheapest help
//                that works (a deer by a hungry family's door, a heal, a strike on a wolf about to kill); when the
//                people's faith sinks under CAREFUL_FAITH, one help where they can see it, at most every
//                CAREFUL_SEEN_YEARS (DESIGN.md: "acts rarely and well")
//   pleaser      answers every prayer as it asks, at once (the forces agent's "answer everything" test)
import { SUGGEST_R } from './rain-size.js'; // the test gods' own rains: the smallest rain there is

export const TUNE_GODS = { LOOK_YEARS: 0.5, CAREFUL_WOLVES: 3, MAX_ACTS: 6,
  CAREFUL_SOON: 6,        // a death this many life years off or nearer is "about to be lost"
  CAREFUL_DEER_GAP: 8,    // calendar years between two deer for one family
  CAREFUL_FAITH: 30,      // the people's faith under which the careful god shows itself once
  CAREFUL_SEEN_YEARS: 20, // and no more often than this
};

export default {
  id: 'gods',
  tune: TUNE_GODS,
  init(R) {
    const { S } = R;
    const G = TUNE_GODS;
    let policy = null, perform = null, last = -1e9, lastSeen = -1e9;
    const acts = {}, seen = {}, fed = new Map();
    const track = [];
    const alive = (p) => p && !p.dead;
    const settled = (p) => alive(p) && p.family?.state === 'settled';
    const H = () => R.ask('hardships') ?? [];
    function doIt(id, target, quiet) {
      const f = R.forecast(id, target);
      if (!f?.ok) return false;
      if (quiet && f.seenBy > 0) return false; // wait until nobody would see it
      const r = perform(id, target);
      if (r?.ok) { acts[id] = (acts[id] ?? 0) + 1; if (f.seenBy) seen[id] = (seen[id] ?? 0) + 1; return true; }
      return false;
    }
    const personT = (p) => ({ kind: 'person', entity: p, x: p.x, z: p.z });
    const animalT = (a) => ({ kind: 'animal', entity: a, x: a.x, z: a.z });
    const homeArea = (f) => (f.home ? { kind: 'area', x: f.home.cx + 0.5, z: f.home.cz + 0.5, r: SUGGEST_R } : null);
    function housekeep(quiet) {
      let n = 0;
      // a bolt is seen from far off even at night (faith.js), so a strike is never quite unseen: the quiet god strikes
      // wolves by night, when the fewest are awake to see it
      const night = S.peopleApi.isNight();
      for (const w of [...S.predators]) if (!w.dead && n < G.MAX_ACTS && (!quiet || night) && doIt('strike', animalT(w), false)) n++;
      for (const p of [...S.people]) {
        if (n >= G.MAX_ACTS) break;
        const d = p.ext?.hardship;
        if (settled(p) && (d?.sick || d?.wound || R.ask('wounded', p)) && doIt('heal', personT(p), quiet)) n++;
      }
      const dry = new Set();
      for (const h of H()) if (h.kind === 'drought' || h.kind === 'hunger') for (const fn of h.families) dry.add(fn);
      for (const f of S.families) {
        if (n >= G.MAX_ACTS || f.state !== 'settled') continue;
        const hungry = f.members.some((m) => alive(m) && S.mind.endOf(m).how === 'hunger');
        if ((hungry || dry.has(f.name)) && homeArea(f) && doIt('bless-harvest', homeArea(f), quiet)) n++;
      }
      for (const h of H()) if (h.kind === 'fire' && n < G.MAX_ACTS && doIt('bless-harvest', { kind: 'area', x: h.x, z: h.z, r: SUGGEST_R }, quiet)) n++;
    }
    function careful() {
      let n = 0;
      // the life-useful turning points: save them from a death that is coming
      for (const tp of R.ask('turningPoints') ?? []) {
        if (n >= G.MAX_ACTS || tp.source !== 'turning' || tp.useful !== 'life' || !alive(tp.person)) continue;
        const p = tp.person, e = S.mind.endOf(p);
        if (e.how === 'old age') continue;
        if (e.how === 'wolf' && e.wolf && doIt('strike', animalT(e.wolf), false)) n++;
        else if ((e.how === 'sickness' || e.how === 'wounds') && doIt('heal', personT(p), true)) n++;
        else if (e.how === 'hunger' && homeArea(p.family) && doIt('bless-harvest', homeArea(p.family), true)) n++;
      }
      // a life about to be lost for nothing (no turning point hangs on that death): the cheapest help that works.
      // A deer by the door for a family going hungry (the design's way to feed people early on, and no rain to
      // flood the fields or draw the herds); heal unseen if it takes, else where they see it; strike a wolf on a kill
      for (const p of S.people) {
        if (n >= G.MAX_ACTS || !settled(p)) continue;
        const e = S.mind.endOf(p);
        if (e.how === 'old age' || e.age - p.age > G.CAREFUL_SOON) continue;
        const tp = R.ask('turningOf', p);
        if (tp?.useful === 'death') continue; // the careful god lets a useful death happen
        if (e.how === 'hunger' && p.family?.home) {
          const f = p.family, k = `deer:${f.id}`;
          if ((fed.get(k) ?? -1e9) > S.year - G.CAREFUL_DEER_GAP) continue;
          if (!R.ask('deerFeeds', f)?.works) continue;
          const at = R.ask('deerSpot', f, { unseen: true }); // the least watched spot by their door (hunting.js)
          if (!at || at.seenBy > 0) continue;                 // wait for a moment nobody would see it appear
          if (placeDeer(at)) { fed.set(k, S.year); n++; }
        } else if (e.how === 'sickness' || e.how === 'wounds') {
          if (doIt('heal', personT(p), true) || doIt('heal', personT(p), false)) n++;
        } else if (e.how === 'wolf' && e.wolf && !e.wolf.dead && doIt('strike', animalT(e.wolf), false)) n++;
      }
      // keep the three forces even: when faith sinks toward too little, one help where they can see it, now and then
      // (DESIGN.md: "act where they can see: faith up"; one seen act every CAREFUL_SEEN_YEARS, no more)
      const fo = R.ask('forces')?.settled; // the settled grown, as before (the query's own levels are everyone grown)
      if (n < G.MAX_ACTS && fo?.n >= 6 && fo.faith < G.CAREFUL_FAITH && S.year - lastSeen >= G.CAREFUL_SEEN_YEARS && !S.peopleApi.isNight()) {
        // the field with the most people round it, rained on in their sight
        let best = null;
        for (const f of S.families) for (const fl of f.state === 'settled' ? f.fields : []) {
          if (!fl.done) continue;
          const t = { kind: 'area', x: fl.mx ?? fl.cx, z: fl.mz ?? fl.cz, r: SUGGEST_R };
          const fc = R.forecast('bless-harvest', t);
          if (fc?.ok && (fc.seenBy ?? 0) > (best?.seen ?? 2)) best = { t, seen: fc.seenBy };
        }
        if (best && doIt('bless-harvest', best.t, false)) { lastSeen = S.year; n++; }
      }
      // keep a few wolves: strike only the ones past CAREFUL_WOLVES, out of sight
      const W = S.eco?.residents?.() ?? [];
      if (W.length > G.CAREFUL_WOLVES) for (const w of W.slice(G.CAREFUL_WOLVES)) if (n < G.MAX_ACTS && doIt('strike', animalT(w), true)) n++;
    }
    // a deer put down as the Animals tool would: sim.spawnAnimal, then the one witness call (god/animals.js)
    function placeDeer(at) {
      const r = S.animalsApi.spawnAnimal('deer', at.x, at.z) ?? {};
      if (!r.entity) return false;
      const w = R.witness({ kind: 'animal', x: at.x, z: at.z, r: 0, target: r.entity }) ?? 0;
      acts.deer = (acts.deer ?? 0) + 1;
      if (w) seen.deer = (seen.deer ?? 0) + 1;
      return true;
    }
    // answers every prayer as it asks (the forces agent's warning: kindness alone should not wipe a village out)
    function pleaser() {
      for (const pr of R.ask('prayers') ?? []) {
        const a = pr.answer;
        if (a.via === 'sim.spawnAnimal') placeDeer(a.target);
        else doIt(a.power, a.target, false);
      }
    }
    R.on('step', () => {
      if (!policy || !S.started || S.year - last < G.LOOK_YEARS) return;
      last = S.year;
      try {
        if (policy === 'housekeeper') housekeep(true);
        else if (policy === 'showman') housekeep(false);
        else if (policy === 'careful') careful();
        else if (policy === 'pleaser') pleaser();
      } catch (err) { console.warn('gods: policy', err); }
    });
    R.on('year', () => {
      if (!policy || Math.floor(S.year) % 25) return;
      const e = R.ask('ecology') ?? {};
      const fa = R.ask('forces') ?? {}, fo = fa.settled ?? fa; // the settled grown (the query's own levels are everyone grown)
      track.push({ year: Math.floor(S.year), pop: S.people.filter(settled).length, deer: e.deer, wolves: e.wolves, harvest: e.harvest, browse: e.browse,
        forces: `${fo.faith ?? '-'}/${fo.skepticism ?? '-'}/${fo.strength ?? '-'}`, state: fo.state ?? null });
    });
    // one whole scripted run: await game.modules.sim.ask('choices:dev').run('careful', game.modules.sim, game.modules.god.perform)
    // (settles a village at once with sim.dev.crowd(36), then skips `years` in 25 year steps; a compact summary)
    const KEYS = { 'no wolves': /no wolves|last wolf is gone/, sickened: /sickened/, warlord: /warlord/, trouble: /turned raider|hid the family grain|set fire to|preaching/, flood: /water is rising/,
      grief: /grieving for/, hedge: /hedged their homes/, ash: /ash of the fire/, silt: /left its silt/, lean: /came through the lean years/, founder: /cleared new ground/, healer: /learned which herbs/, peace: /into peace/, thinker: /as foreseen/ };
    // every alert of a skip (skip.js keeps them in S.skipAlerts), read as it goes
    const heard = [];
    let arr = null, ai = 0;
    R.on('step', () => {
      if (!policy) return;
      if (S.skipAlerts !== arr) { arr = S.skipAlerts; ai = 0; }
      if (arr) while (ai < arr.length) heard.push(arr[ai++]);
    });
    // opts.dense: prayers come as often per calendar year as at 1x (a skip runs at 4x, where a 30 second pace gives a
    // quarter as many)
    async function run(name, sim, fn, years = 300, opts = {}) {
      sim.dev.crowd(36);
      api.setPolicy(name, fn);
      const PT = R.tune('forces-prayers'), every0 = PT?.EVERY_S;
      if (opts.dense && PT) PT.EVERY_S = every0 / 4;
      try { return await runOn(name, sim, years); } finally { if (PT) PT.EVERY_S = every0; }
    }
    async function runOn(name, sim, years) {
      const byCause = {}, notes = {}, samples = {};
      let births = 0, left = 0, arrived = 0;
      for (let k = 0; k < Math.round(years / 25); k++) {
        const r = await sim.skip(25);
        births += r.births ?? 0; left += r.left ?? 0; arrived += r.arrived ?? 0;
        for (const [c, n] of Object.entries(r.byCause ?? {})) byCause[c] = (byCause[c] ?? 0) + n;
        for (const a of heard.splice(0)) for (const [k2, re] of Object.entries(KEYS)) if (re.test(a.text)) { notes[k2] = (notes[k2] ?? 0) + 1; samples[k2] ??= a.text; }
      }
      const rep = api.report();
      const tr = rep.track;
      const meanPop = Math.round(tr.reduce((s, t) => s + t.pop, 0) / Math.max(1, tr.length));
      const fa = R.ask('forces') ?? {}, fo = fa.settled ?? fa;
      return { policy: name, meanPop, endPop: S.people.filter(settled).length, forces: tr.filter((t, i) => i % 2 === 1).map((t) => `${t.year - tr[0].year + 25}:${t.forces}`).join(' '),
        endForces: { faith: fo.faith, skepticism: fo.skepticism, strength: fo.strength, label: fo.label }, expectsHelp: S.people.filter((p) => settled(p) && p.expectsHelp).length,
        prayers: R.ask('prayerStats') ? (({ made, answered, solved, lost, lapsed, gone }) => ({ made, answered, solved, lost, lapsed, gone }))(R.ask('prayerStats')) : null,
        pop: tr.map((t) => t.pop).join(' '), deer: tr.map((t) => t.deer).join(' '), wolves: tr.map((t) => t.wolves).join(' '),
        harvest: Math.round(tr.reduce((s, t) => s + (t.harvest ?? 0), 0) / Math.max(1, tr.length) * 100) / 100, births, left, arrived, byCause, discoveries: rep.discoveries, acts: rep.acts, seen: rep.seen,
        turning: rep.turning, troubles: rep.troubles, hardships: rep.hardships, notes, samples };
    }
    const api = {
      setPolicy(name, fn) { policy = name; perform = fn; last = -1e9; lastSeen = -1e9; fed.clear(); track.length = 0; for (const k in acts) delete acts[k]; for (const k in seen) delete seen[k]; return name; },
      report() {
        const e = R.ask('ecology') ?? {}, tl = R.ask('turningLog', 400) ?? [], sci = R.ask('scienceState') ?? {};
        const tpBy = {};
        for (const r of tl) { const k = `${r.useful}-useful ${r.branch} ${r.outcome}`; tpBy[k] = (tpBy[k] ?? 0) + 1; }
        const hl = R.ask('hardshipLog');
        return { policy, year: Math.floor(S.year), pop: S.people.filter(settled).length, track: track.slice(), acts: { ...acts }, seen: { ...seen }, discoveries: sci.made ?? null,
          eco: { deer: e.deer, wolves: e.wolves, browse: e.browse, harvest: e.harvest, book: e.book }, turning: tpBy, troubles: hl?.troubles?.filter((t) => t.carried).length ?? 0,
          hardships: hl ? Object.fromEntries(Object.entries(hl.tally).map(([k, v]) => [k, v.started])) : null };
      },
      run,
    };
    R.answer('choices:dev', () => api);
  },
};
