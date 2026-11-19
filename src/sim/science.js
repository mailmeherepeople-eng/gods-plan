// B. Minds (stage 2): thinking, discoveries in Earth's order and their effects,
// the Earth yardstick, and Whisper an idea.
// Commandments live in commandments.js, given thoughts in thoughts-given.js
// (both agent B's). The seam and every shared name: docs/STAGE2-CONTRACTS.md.
//
// Thinking. A settled grown-up thinks while at work (building, tending,
// harvesting, gathering, drawing water) when fed, not waiting on the stone
// ("expects help"), not whispered, and free to doubt: skepticism high enough
// and faith not overwhelming (the director: "we need the science people to
// think and they need to be somewhat atheist"). Each thinker adds
// think x (calendar years at work) to the people's knowledge; R.value('think')
// carries writing, Honour thinkers and the balance on top.
//
// Discoveries. Each step of DISCOVERIES costs EARTH_PACE points per Earth year
// between it and the step before (MIN_GAP at least). A people thinking at
// EARTH_PACE a calendar year keep level with Earth; the readout says how far
// ahead or behind. The step goes to a thinker drawn by how much each thought
// toward it; it is announced, enters their story and pushes its modifiers.
//
// The old faith and doubt balance (five bands with their own effects) is gone:
// the three forces replace it (forces.js, docs/FORCES.md). Too little
// skepticism there uses this file's DOUBT_FROM (20) as its line: nobody under
// it thinks at all, and in a people with too little of it the few who do are
// not listened to (forces.js pushes on 'think').
import { DISCOVERIES, calOf, earthLabel } from './science-data.js';
import { clamp, smooth, she, her, herself, cap1, settled, chanceText, pct, names } from './science-util.js';

export const TUNE_SCIENCE = {
  // ---- thinking ----
  DOUBT_FROM: 20, DOUBT_FULL: 60,  // skepticism: no thinking below DOUBT_FROM, full from DOUBT_FULL
  FAITH_FROM: 55, FAITH_STOP: 85,  // faith: full thinking below FAITH_FROM, none from FAITH_STOP
  THINK_MIN_AGE: 14,               // children do not think toward discoveries
  // ---- discoveries ----
  EARTH_PACE: 4.5,                 // knowledge points per Earth year between two steps (tuned, see the report)
  MIN_GAP: 60,                     // a step costs at least this many Earth years of points
  SURVIVOR_PUSH: 8,                // an unaided survivor of a hardship adds up to this many Earth years of points
                                   // (the nth of the same hardship 1/n of it; integration: was 12 each, no falloff)
  // (the old balance bands, BANDS to DOUBT_FAITH_DRIFT, are retired: forces.js TUNE_FORCES has the three forces' states)
  DEVOUT_AT: 80, DEVOUT_FIGHT: 0.5, // anyone this devout hangs back in a fight (the stone will see to it)
};
const T = TUNE_SCIENCE;
const WORK_POSES = new Set(['chop', 'tend', 'pick']);
const ASIDES = ['Progress: what happens when nobody is watching them closely.', 'Another thing Earth already knew. Still, nice for them.', 'They will be insufferable about this for a generation.'];

export default {
  id: 'science',
  tune: TUNE_SCIENCE,
  init(R) {
    const { S } = R;
    const N = DISCOVERIES.length;
    const K = { idx: 0, points: 0, made: [], start: S.startYear ?? -5000, total: 0 };
    const mindOf = (p) => R.data(p, 'mind', () => ({ ideas: 0, since: 0, yr: 0, rateAvg: 0, found: [], now: false, why: '', rate: 0 }));
    const startCal = () => K.start;
    const calAt = (i) => (i < 0 ? startCal() : calOf(DISCOVERIES[i].earth));
    const cost = (i) => T.EARTH_PACE * Math.max(T.MIN_GAP, calAt(i) - calAt(i - 1));
    R.on('phase:start', () => { K.start = Math.floor(S.startYear ?? S.year); });

    // ---------- who thinks, and how fast ----------
    // returns { rate, why } (rate 0 with the reason in plain words)
    function thinkOf(p) {
      if (!settled(p)) return { rate: 0, why: p?.dead ? 'dead' : 'on the move' };
      if (p.age < T.THINK_MIN_AGE) return { rate: 0, why: 'too young to think toward discoveries' };
      if (R.trait(p, 'whispered')) return { rate: 0, why: 'thinks no more: your whisper filled the head' };
      if (p.expectsHelp) return { rate: 0, why: 'waits for the stone to think for them' };
      if (p.hunger > 0) return { rate: 0, why: 'too hungry to think' };
      const d = smooth(p.skep, T.DOUBT_FROM, T.DOUBT_FULL), f = 1 - smooth(p.faith, T.FAITH_FROM, T.FAITH_STOP);
      const base = d * f;
      if (base <= 0.02) return { rate: 0, why: f < 0.1 ? 'too devout to wonder' : 'too little skepticism to wonder' };
      const w = p.work, mindWork = w?.mind;
      const atWork = w && !p.go && ((WORK_POSES.has(w.pose) && mindWork !== 'busy') || mindWork === 'think');
      if (!atWork) return { rate: 0, why: 'thinks only while at work', could: R.value('think', p, base) };
      return { rate: R.value('think', p, base), why: '' };
    }
    // how strongly this person could think (ignoring whether they are at work this moment)
    const couldThink = (p) => { const t = thinkOf(p); return t.rate || t.could || 0; };

    // ---------- the knowledge ----------
    function addPoints(p, pts) {
      if (!(pts > 0)) return;
      K.points += pts; K.total += pts;
      if (p) { const m = mindOf(p); m.since += pts; m.ideas += pts; m.yr += pts; }
    }
    // the thinker credited with a step: drawn by how much each thought toward it since the last one
    function pickCredit() {
      let sum = 0;
      const c = [];
      for (const p of S.people) { if (!settled(p)) continue; const m = p.ext?.mind; if (m?.since > 0 && !R.trait(p, 'whispered')) { c.push([p, m.since]); sum += m.since; } }
      if (sum > 0) { let r = Math.random() * sum; for (const [p, w] of c) { r -= w; if (r <= 0) return p; } return c[c.length - 1][0]; }
      let best = null, bi = -1;
      for (const p of S.people) if (settled(p) && p.age >= T.THINK_MIN_AGE && (p.ext?.mind?.ideas ?? 0) > bi) { bi = p.ext?.mind?.ideas ?? 0; best = p; }
      return best;
    }
    function applyEffects(d) {
      d.mods(S).forEach(([stat, spec], i) => R.mod(stat, `science:${d.id}:${i}`, { ...spec, note: d.name }));
    }
    function discover(by, how = {}) {
      if (K.idx >= N) return null;
      const d = DISCOVERIES[K.idx];
      const c = cost(K.idx);
      K.points = Math.max(0, K.points - c);
      K.idx++;
      applyEffects(d);
      for (const p of S.people) if (p.ext?.mind) p.ext.mind.since = 0;
      const f = by?.family;
      const rec = { id: d.id, name: d.name, what: d.what, earth: d.earth, earthYear: calOf(d.earth), earthLabel: earthLabel(d.earth), year: Math.floor(S.year),
        yearLabel: R.yearLabel(S.year), by: by ? `${by.name} of the ${f?.name} family` : 'someone', person: by ?? null, x: by?.x ?? S.stone.centre.x, z: by?.z ?? S.stone.centre.z,
        effects: d.effects, text: d.text, whispered: !!how.whispered, ahead: Math.round(calOf(d.earth) - Math.floor(S.year)) };
      K.made.push(rec);
      if (by) {
        mindOf(by).found.push(d.name);
        R.story(by, how.whispered ? `Heard a whisper and at once worked out ${d.what}.` : `Worked out ${d.what}.`);
        S.mind.push(by, how.whispered ? `It came all at once: ${d.what}. Not from me. From above.` : `I have it! ${cap1(d.what)}.`);
      }
      const behind = rec.ahead;
      const vs = Math.abs(behind) < 10 ? 'about when Earth did' : behind > 0 ? `${behind} years before Earth did` : `${-behind} years after Earth did`;
      const aside = how.whispered ? undefined : R.aside('science:discovery', ASIDES, 150);
      R.alert('good', `${by ? `${by.name} of the ${f?.name} family` : 'Someone'} worked out ${d.what}${how.whispered ? ', all at once' : ''}: ${d.name.toLowerCase()}, ${vs} (Earth: ${rec.earthLabel}). ${d.text}`, { x: rec.x, z: rec.z, subject: by, aside });
      R.signal('mind:discovery', { id: d.id, name: d.name, person: by ?? null, year: rec.year, earthYear: rec.earthYear, effects: d.effects, whispered: rec.whispered });
      return rec;
    }

    // ---------- the yardstick ----------
    // Integration (2026-11-12): measured by discoveries only, so the readout and every discovery card agree.
    //   ahead:  the newest discovery came before Earth's date for it: ahead by (its Earth date - today);
    //   behind: Earth already had the next one and they still do not: behind by (today - its Earth date);
    //   level:  they have everything Earth had by today, and nothing Earth did not.
    // The day a discovery is made the readout equals that discovery's card; after that it moves a year a year.
    // (It used to add the progress toward the next one, which no card showed, so the two disagreed.)
    function aheadNow(idx = K.idx, cal = Math.floor(S.year)) {
      const lastE = idx > 0 ? calAt(idx - 1) : null, nextE = idx < N ? calAt(idx) : null;
      if (lastE != null && lastE > cal) return Math.round(lastE - cal);
      if (nextE != null && nextE < cal) return -Math.round(cal - nextE);
      return 0;
    }
    function earth() {
      const next = K.idx < N ? calAt(K.idx) : null;
      const frac = next != null ? clamp(K.points / cost(K.idx)) : 0;
      const ahead = aheadNow();
      const year = Math.floor(S.year) + ahead; // the Earth year whose knowledge they match
      const text = ahead === 0 ? 'Level with Earth' : ahead > 0 ? `${ahead} years ahead of Earth` : `${-ahead} years behind Earth`;
      const last = K.made[K.made.length - 1];
      return { year: Math.round(year), label: R.yearLabel(Math.round(year)), calendar: Math.floor(S.year), ahead, text,
        next: next != null ? { id: DISCOVERIES[K.idx].id, name: DISCOVERIES[K.idx].name, earthYear: next, earthLabel: earthLabel(DISCOVERIES[K.idx].earth), progress: Math.round(frac * 100) / 100 } : null,
        last: last ? { id: last.id, name: last.name, year: last.year, earthYear: last.earthYear, by: last.by } : null,
        made: K.made.length, of: N };
    }
    // the yardstick if `pts` more points came in now (the whisper's forecast; the same arithmetic as discover)
    function earthAfterStep() {
      if (K.idx >= N) return null;
      return Math.floor(S.year) + aheadNow(K.idx + 1);
    }
    const aheadText = (a) => (a === 0 ? 'level with Earth' : a > 0 ? `${a} years ahead of Earth` : `${-a} years behind Earth`);

    // ---------- (the old balance of faith and doubt lived here: forces.js answers 'balance' now) ----------
    // a whispered head stays full: faith held at the top, doubt at the bottom, for life
    R.mod('faithDrift', 'science:whispered', { add: 50, who: (p) => !!p?.ext?.traits?.whispered, note: 'whispered: faith stays at the top' });
    R.mod('doubtDrift', 'science:whispered', { add: -50, who: (p) => !!p?.ext?.traits?.whispered, note: 'whispered: no doubt left' });
    // much faith: hangs back (contract: B pushes `fight`)
    R.mod('fight', 'science:devout', { mul: T.DEVOUT_FIGHT, who: (p) => p?.kind === 'person' && p.faith >= T.DEVOUT_AT, note: 'devout: the stone will fight for them' });

    // ---------- every update ----------
    let thinkersNow = 0;
    R.on('phase:start', () => { K.started = true; });
    R.on('step', ({ dYears }) => {
      if (!K.started) K.started = true;
      let n = 0;
      if (dYears > 0) {
        for (const p of S.people) {
          if (p.dead || p.family.state !== 'settled' || p.age < T.THINK_MIN_AGE) continue;
          const t = thinkOf(p);
          const m = mindOf(p);
          m.now = t.rate > 0; m.why = t.why; m.rate = t.rate || t.could || 0;
          if (t.rate > 0) { n++; addPoints(p, t.rate * dYears); }
        }
        thinkersNow = n;
        let guard = 0;
        while (K.idx < N && K.points >= cost(K.idx) && guard++ < 3) discover(pickCredit());
      }
    });
    R.on('year', () => {
      for (const p of S.people) { const m = p.ext?.mind; if (!m) continue; m.rateAvg = m.rateAvg * 0.9 + m.yr * 0.1; m.yr = 0; }
    });
    // an unaided survivor of a hardship learns from it (A's signal)
    // Integration: the nth survivor of the same hardship learns 1/n as much (a family that lived through one
    // drought learns one lesson, not one each); unlimited, survivors made three quarters of all knowledge.
    const learned = new Map(); // hardship id -> survivors who learned so far
    R.on('hardship:survived', (e) => {
      const p = e?.person;
      if (!e?.unaided || !settled(p) || R.trait(p, 'whispered') || p.age < T.THINK_MIN_AGE) return;
      const n = (learned.get(e.id) ?? 0) + 1;
      learned.set(e.id, n);
      if (learned.size > 200) learned.delete(learned.keys().next().value);
      const k = 0.5 + 0.5 * smooth(p.skep, T.DOUBT_FROM, T.DOUBT_FULL);
      addPoints(p, T.SURVIVOR_PUSH * T.EARTH_PACE * k / n);
      R.story(p, 'Got through it with no help from above, and learned something from it.');
    });

    // ---------- Whisper an idea ----------
    const WHISPER_SEEN = { unseen: true, report() {} }; // nobody but the one person hears a whisper
    function whisperPlan(p) {
      if (!p || p.kind !== 'person' || p.dead) return { ok: false, why: 'Point at a person.' };
      if (p.family.state !== 'settled') return { ok: false, why: `${p.name} is only passing through. Whisper to someone who lives here.` };
      if (p.age < 8) return { ok: false, why: `${p.name} is too small to make sense of it.` };
      if (R.trait(p, 'whispered')) return { ok: false, why: `${p.name} already hears nothing but you. There is no room left in there for an idea.` };
      if (K.idx >= N) return { ok: false, why: 'There is nothing left on the list to discover.' };
      return { ok: true, d: DISCOVERIES[K.idx] };
    }
    function forecastWhisper(t) {
      const p = t?.entity;
      const P = whisperPlan(p);
      if (!P.ok) return R.refuse(P.why);
      const d = P.d, now = earth(), afterYear = earthAfterStep(), afterAhead = Math.round(afterYear - S.year);
      const m = mindOf(p), th = thinkOf(p);
      const end = S.mind.endOf(p);
      const leftCal = Math.max(0, (end.age - p.age) / R.T.LIFE_RATE);
      const expected = m.rateAvg * leftCal;
      const share = expected / cost(K.idx);
      let sum = 0; for (const q of S.people) sum += q.ext?.mind?.since ?? 0;
      const chance = sum > 0 ? m.since / sum : 0;
      const gains = [`${p.name} works out ${d.what} at once: ${d.name.toLowerCase()} (on Earth ${earthLabel(d.earth)}).`, `For everyone: ${d.text}`,
        `The Earth readout goes from ${aheadText(now.ahead)} to ${aheadText(afterAhead)}.`];
      const costs = [`${p.name}'s faith goes to 100 and stays there. ${cap1(she(p))} never thinks for ${herself(p)} again.`];
      if (th.rate > 0 || th.could > 0 || m.rateAvg > 0.001) {
        const yrs = Math.max(1, Math.round(end.age - p.age));
        const bit = share >= 1 ? `about ${Math.round(share * 10) / 10} discoveries' worth of thinking` : share >= 0.01 ? `about ${pct(share)} of a discovery's worth of thinking` : 'a little thinking';
        costs.push(`Left alone, ${p.name} would think on for the rest of ${her(p)} life (about ${yrs} more years, until ${her(p)} death at ${end.age}) and add ${bit}${chance > 0.005 ? `, and has ${chanceText(chance)} of being the one to make the next discovery` : ''}.`);
      } else costs.push(`Left alone, ${p.name} would not think much anyway: ${th.why || 'not one for wondering'}. A cheap mind to spend.`);
      if (p.skep > 60) costs.push(`One of the people's skeptics becomes a believer: the people's faith rises a little, their skepticism falls a little.`);
      return { ok: true, gains, costs, who: `Nobody sees a whisper. Only ${p.name} hears it, and the people only see the discovery.`, seenBy: 0,
        fates: [`${p.name} will never think for ${herself(p)} again.`], confirm: 'click', kind: 'person', name: `${p.name} of the ${p.family.name} family`, sex: p.sex,
        discovery: { id: d.id, name: d.name, earthLabel: earthLabel(d.earth) }, earthBefore: now.ahead, earthAfter: afterAhead };
    }
    function whisper(t) {
      const p = t?.entity;
      const P = whisperPlan(p);
      if (!P.ok) return { ok: false, text: P.why };
      // the step is made now: the points it lacked are what the whisper gives
      K.points = Math.max(K.points, cost(K.idx));
      const rec = discover(p, { whispered: true });
      p.faith = 100; p.skep = Math.min(p.skep, 5);
      R.trait(p, 'whispered', true);
      R.story(p, 'Has not had a thought of ' + her(p) + ' own since.');
      return { ok: true, text: `${p.name} worked out ${rec.name.toLowerCase()} at once, and will never think for ${herself(p)} again.`, x: p.x, z: p.z, r: 0, discovery: rec };
    }
    R.power({ id: 'whisper', forecast: forecastWhisper, carryOut: whisper, witness: WHISPER_SEEN });

    // ---------- queries ----------
    R.answer('earth', earth);
    // { made: [{ id, name, what, year, yearLabel, earthYear, earthLabel, by, person, x, z, effects, text, whispered, ahead }], next: [{ id, name, earthYear, earthLabel, text, effects, progress }] }
    R.answer('discoveries', () => ({
      made: K.made.map((d) => ({ ...d })),
      next: DISCOVERIES.slice(K.idx).map((d, i) => ({ id: d.id, name: d.name, what: d.what, earthYear: calOf(d.earth), earthLabel: earthLabel(d.earth), text: d.text, effects: d.effects,
        progress: i === 0 ? Math.round(clamp(K.points / cost(K.idx)) * 100) / 100 : 0 })),
    }));
    R.answer('discoveryList', () => DISCOVERIES.map((d, i) => ({ id: d.id, name: d.name, what: d.what, earth: d.earth, earthLabel: earthLabel(d.earth), text: d.text, effects: d.effects,
      made: i < K.idx, by: K.made[i]?.by ?? null, year: K.made[i]?.yearLabel ?? null, cost: Math.round(cost(i)), progress: i === K.idx ? Math.round(K.points / cost(i) * 100) / 100 : i < K.idx ? 1 : 0 })));
    R.answer('nextDiscovery', () => (K.idx < N ? { ...DISCOVERIES[K.idx], mods: undefined, index: K.idx, cost: cost(K.idx), points: K.points } : null));
    // thinking of one person: { thinking, why, rate, could, ideas, found, whispered }
    R.answer('thinking', (p) => { if (!p) return null; const t = thinkOf(p), m = mindOf(p); return { thinking: t.rate > 0, why: t.why, rate: t.rate, could: couldThink(p), ideas: m.ideas, found: [...m.found], whispered: !!R.trait(p, 'whispered'), rateAvg: m.rateAvg }; });
    R.answer('couldThink', couldThink);
    // a push toward the next step, credited to p: share of the step's cost (a given thought, a survivor)
    R.answer('thinkPush', (p, share) => { if (K.idx >= N) return 0; const pts = Math.max(0, share) * cost(K.idx); addPoints(p, pts); const before = K.idx; while (K.idx < N && K.points >= cost(K.idx) && K.idx - before < 2) discover(pickCredit()); return pts; });
    R.answer('scienceState', () => ({ idx: K.idx, points: K.points, total: K.total, made: K.made.length, thinkers: thinkersNow, cost: K.idx < N ? cost(K.idx) : null }));

    // ---------- stats (4 Hz readers; cheap) ----------
    R.on('stats', (st) => {
      const e = earth();
      st.earth = e; st.earthYear = e.year; st.earthAhead = e.ahead;
      st.discoveries = K.made.length;
      st.nextDiscovery = e.next;
      st.thinkers = thinkersNow;
    });

    // ---------- inspect, thoughts, fate ----------
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const t = thinkOf(e), m = mindOf(e);
      const lean = (e.faith + 0.5) / (e.faith + e.skep + 1);
      const leanText = lean < 0.25 ? 'a skeptic' : lean < 0.4 ? 'leans to skepticism' : lean <= 0.6 ? 'both faith and skepticism' : lean <= 0.75 ? 'leans to faith' : 'a believer';
      out.mind = { thinking: t.rate > 0, why: t.why, rate: Math.round((t.rate || 0) * 100) / 100, could: Math.round(couldThink(e) * 100) / 100, ideas: Math.round(m.ideas * 10) / 10, found: [...m.found], whispered: !!R.trait(e, 'whispered'), lean: Math.round(lean * 100) / 100, leanText };
      const rows = [['Thinking', t.rate > 0 ? `yes, at ${pct(Math.min(9, t.rate))} of a full mind` : `no: ${t.why}`], ['Leans', leanText]];
      if (m.ideas > 0.05) rows.push(['Ideas so far', `worth about ${Math.max(1, Math.round(m.ideas / T.EARTH_PACE))} years of Earth's progress`]);
      if (m.found.length) rows.push(['Worked out', m.found.join(', ')]);
      R.section(out, { id: 'mind', title: 'Mind', rows, order: 30 });
    });
    R.on('thoughts', (p) => {
      if (p.asleep || p.dead) return null;
      const out = [];
      if (R.trait(p, 'whispered')) out.push([9, 'My thoughts come from above now. It is very quiet in here.'], [6, 'I used to wonder about things. I do not remember why.']);
      const m = p.ext?.mind;
      if (m?.now && K.idx < N) out.push([7, DISCOVERIES[K.idx].hint], [3, 'An idea keeps nagging at me. Not yet. Not yet.']);
      if (m?.found?.length) out.push([3, `I worked out ${m.found[m.found.length - 1].toLowerCase()}. Nobody ever says thank you.`]);
      return out;
    });
    R.on('fate', (p) => (R.trait(p, 'whispered') ? `Will never think for ${herself(p)} again: the whisper filled ${her(p)} head.` : null));

    // console: game.modules.sim.seam (R) has it all; a few shortcuts for testing
    R.science = { K, earth, discover: (p) => discover(p ?? pickCredit()), cost, thinkOf, names };
  },
};
