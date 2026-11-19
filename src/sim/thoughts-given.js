// B. Minds: Give a thought (the power `give-thought`, one person). The director:
// "we should be able to give them random thoughts for fun... see what happens
// when we give them weird thoughts". Two ways in: a ready thought from the list
// (thoughts-given-list.js, each with its own real effect on what the person then
// does), or free text (the typed words become the thought word for word and
// spread as they repeat them; the general effect comes from the words' length
// and tone, since the game cannot understand them).
//
// Own idea or a voice from above (DESIGN.md: "depends on the thought and also
// the level of skepticism and faith the person has. the person also has a
// chance of changing"): chance of a voice = VOICE_BASE + VOICE_ODD x oddness x
// faith + VOICE_LEAN x (faith - doubt), within VOICE_MIN..VOICE_MAX. A voice:
// faith up and doubt down by the oddness (a revelation). Their own idea: a
// sensible one is a small pride; an odd one is just an odd idea, or, in a head
// with far more doubt than faith, a reason to doubt harder. Changed for good:
// CHANGE_BASE + CHANGE_ODD x oddness x (the stronger of faith and doubt) +
// CHANGE_PLAIN x (1 - oddness): the behaviour stays for life (at FOR_GOOD of
// its rate) and a revelation deepens faith (or the doubt hardens).
//
// Nobody witnesses the giving itself (the witness spec is `unseen`); others
// react only to what the person then says (they walk up and tell people) and
// does. Listeners believe, laugh or keep away, by their own faith and doubt and
// the thought; believers carry it on (MAX_DEPTH steps from the first).
import { READY, readTone, freeOdd, FREE_TONES } from './thoughts-given-list.js';
import { clamp, clamp100, she, her, herO, cap1, settled, isAdult, dist, mid, chanceText, pct, signed } from './science-util.js';

export const TUNE_THOUGHTS = {
  ACT_MUL: 1.6,          // every thought's act and telling chances are multiplied by this (capped)
  LASTS_MUL: 2,          // every thought's `lasts` (life years) is multiplied by this
  PLANT_YEARS: 1.5,      // life years the given words fill the head (p.planted) before other thoughts come back
  VOICE_BASE: 0.05, VOICE_ODD: 0.85, VOICE_LEAN: 0.35, VOICE_MIN: 0.02, VOICE_MAX: 0.97,
  CHANGE_BASE: 0.08, CHANGE_ODD: 0.35, CHANGE_PLAIN: 0.1, CHANGE_MIN: 0.05, CHANGE_MAX: 0.6,
  VOICE_FAITH: 8, VOICE_FAITH_ODD: 14, VOICE_DOUBT: 4, VOICE_DOUBT_ODD: 6, // a voice from above: faith +, doubt -
  CHANGED_FAITH: 10,     // a revelation that changes them for good: faith + this as well
  HARDER_GAP: 15,        // an odd thought in a head with this much more doubt than faith: a reason to doubt harder
  HARDER_DOUBT: 4, HARDER_DOUBT_ODD: 8, HARDER_FAITH: -3, HARDER_CHANGED: 6,
  OWN_HAPPY: 4,          // a sensible thought taken as one's own: a little pride
  TELL_CHANCE: 0.25,     // chance an act goes to telling someone (each thought may set its own)
  TELL_REACH: 25, MAX_DEPTH: 2, HEARD_LASTS: 0.5, FOR_GOOD: 0.5,
  FREE_MAX: 160,         // free text is cut at this many letters
};
const TG = TUNE_THOUGHTS;
const BY_ID = Object.fromEntries(READY.map((d) => [d.id, d]));

export default {
  id: 'thoughts-given',
  tune: TUNE_THOUGHTS,
  init(R) {
    const { S } = R;
    const PA = () => S.peopleApi;
    const K = { log: [], next: 0, chosen: null };
    const G = (p) => R.data(p, 'given', () => ({ cur: null, lasting: [], history: [] }));
    const live = (c) => c && S.life < c.until;
    // is this thought working in p now? (active, or kept for good)
    const isOn = (p, id) => {
      const g = p?.ext?.given;
      if (!g) return false;
      if (g.cur && g.cur.id === id && S.life < g.cur.until) return true;
      return g.lasting.includes(id);
    };
    const toneOn = (p, tone) => { const c = p?.ext?.given?.cur; return !!(c && c.id === 'free' && c.tone === tone && S.life < c.until) || (p?.ext?.given?.lasting ?? []).includes(`tone:${tone}`); };

    // ---------- the rules of a given thought ----------
    const pVoice = (p, d) => clamp(TG.VOICE_BASE + TG.VOICE_ODD * d.odd * p.faith / 100 + TG.VOICE_LEAN * (p.faith - p.skep) / 100, TG.VOICE_MIN, TG.VOICE_MAX);
    const pChange = (p, d) => clamp(TG.CHANGE_BASE + TG.CHANGE_ODD * d.odd * Math.max(p.faith, p.skep) / 100 + TG.CHANGE_PLAIN * (1 - d.odd), TG.CHANGE_MIN, TG.CHANGE_MAX);
    function voiceMeters(p, d) {
      if (d.meters?.voice) return d.meters.voice(p);
      return { faith: TG.VOICE_FAITH + TG.VOICE_FAITH_ODD * d.odd, skep: -(TG.VOICE_DOUBT + TG.VOICE_DOUBT_ODD * d.odd) };
    }
    function ownMeters(p, d) {
      if (d.meters?.own) return d.meters.own(p);
      if (d.odd >= 0.5) return p.skep > p.faith + TG.HARDER_GAP ? { skep: TG.HARDER_DOUBT + TG.HARDER_DOUBT_ODD * d.odd, faith: TG.HARDER_FAITH, harder: true } : { odd: true };
      return { happy: TG.OWN_HAPPY };
    }
    const meterText = (m) => {
      const parts = [];
      if (m.faith) parts.push(`faith ${signed(m.faith)}`);
      if (m.skep) parts.push(`skepticism ${signed(m.skep)}`);
      if (m.happy) parts.push(`happiness ${signed(m.happy)}`);
      return parts.join(', ');
    };
    const applyMeters = (p, m) => { if (m.faith) p.faith = clamp100(p.faith + m.faith); if (m.skep) p.skep = clamp100(p.skep + m.skep); if (m.happy) p.happy = clamp100(p.happy + m.happy); };

    // ---------- helpers the ready thoughts use (H) ----------
    const H = {
      R, S, PA, isOn, G, ticks: [],
      say: (p, text) => S.mind.push(p, text),
      busy: (p, kind = 'busy') => { if (p.work) p.work.mind = kind; },
      home: (p) => (p.family.home ? (p.family.home.door ?? mid(p.family.home)) : { x: p.x, z: p.z }),
      // walk somewhere, then a piece of work; o: { walking, face, think, then, tick, r }
      goWork(p, x, z, pose, dur, doing, o = {}) {
        const A = PA();
        A.goTo(p, x, z, { doing: o.walking ?? doing, r: o.r ?? 0.8, until: o.until ?? 30, then: () => { A.work(p, pose, dur, { doing, face: o.face, tick: o.tick, then: o.then }); if (p.work) p.work.mind = o.think ? 'think' : 'busy'; } });
        return true;
      },
      here(p, pose, dur, doing, o = {}) { PA().work(p, pose, dur, { doing, face: o.face, then: o.then }); if (p.work) p.work.mind = o.think ? 'think' : 'busy'; return true; },
      // the nearest person (awake, outdoors) passing `ok`
      nearestPerson(p, r, ok = () => true) {
        let best = null, bd = r;
        for (const q of S.people) {
          if (q === p || q.dead || q.hidden || q.asleep || q.family.state !== 'settled' || q.age < 4 || !ok(q)) continue;
          const d = dist(q, p);
          if (d < bd) { bd = d; best = q; }
        }
        return best;
      },
      // walk up to q and spend a moment with them, then `then(q)` if still close
      visit(p, q, doing, then, pose = null, dur = 3) {
        const A = PA();
        const talk = () => {
          A.work(p, pose, dur, { doing, face: q, then: () => { if (!q.dead && !q.hidden && dist(p, q) < 8) then(q); } });
          if (p.work) p.work.mind = 'busy';
        };
        // walk to where they are; if they have moved on by then, follow once more
        A.goTo(p, q.x, q.z, { doing: `going over to ${q.name}`, r: 1.6, until: 10, then: () => {
          if (q.dead || q.hidden) return;
          if (dist(p, q) < 4) talk();
          else A.goTo(p, q.x, q.z, { doing: `going over to ${q.name}`, r: 1.6, until: 8, then: talk });
        } });
        return true;
      },
      water(p) { return S.land.nearestWater(p.x, p.z, 45); },
      // a spot a few steps back from the shore, facing the water
      byWater(p, back = 3) {
        const w = H.water(p);
        if (!w) return null;
        const sx = (w.sx ?? w.x) + 0.5, sz = (w.sz ?? w.z) + 0.5;
        const dx = p.x - sx, dz = p.z - sz, d = Math.hypot(dx, dz) || 1;
        return { x: sx + dx / d * back, z: sz + dz / d * back, face: { x: w.x + 0.5, z: w.z + 0.5 } };
      },
      stoneSpot() { const c = S.stone.centre, a = Math.random() * 6.283, r = 4.5 + Math.random() * 3; return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, face: c }; },
      // what the god sees of q's end, said to q: "You die of old age at 63."
      fateLine(q) {
        const l = S.mind.fateOf(q);
        const last = l[l.length - 1] ?? '';
        return last.replace(/^Dies\b/, 'You die').replace(/^Will\b/, 'You will').replace(/, unless[^.]*\./, '.');
      },
      prayerHour: () => S.dayT >= R.T.PRAY_START && S.dayT < R.T.PRAY_END,
      night: () => PA().isNight(),
      // a carrier p tells q: the reaction is rolled from q's faith and doubt and the thought
      tell: (p, q) => tell(p, q),
    };

    // ---------- the thought itself ----------
    function resolve(args) {
      if (args?.text != null) {
        const text = String(args.text).replace(/\s+/g, ' ').trim().slice(0, TG.FREE_MAX);
        if (!text) return { error: 'Type a thought first.' };
        const tone = readTone(text);
        return { ...FREE_TONES[tone], id: 'free', free: true, title: text, text, tone, odd: freeOdd(text) };
      }
      const id = args?.thought ?? args?.id ?? K.chosen ?? READY[K.next % READY.length].id;
      if (typeof id === 'object' && id?.text) return resolve(id);
      const d = BY_ID[id];
      if (!d) return { error: `There is no ready thought "${id}". Ask for the list with sim.ask('thoughtList').` };
      return d;
    }
    function refuseFor(p) {
      if (!p || p.kind !== 'person' || p.dead) return 'Point at a person.';
      if (p.family.state !== 'settled') return `${p.name} is only passing through. Give the thought to someone who lives here.`;
      if (p.age < 4) return `${p.name} is too small. It would come out as babble.`;
      if (p.hidden || p.asleep) return `${p.name} is asleep. A thought now would only be a dream.`;
      return null;
    }

    function forecast(t) {
      const p = t?.entity;
      const why = refuseFor(p);
      if (why) return R.refuse(why);
      const d = resolve(t.args);
      if (d.error) return R.refuse(d.error);
      const pv = pVoice(p, d), pc = pChange(p, d), vm = voiceMeters(p, d), om = ownMeters(p, d);
      const gains = [], costs = [];
      if (!t.args || (t.args.thought == null && t.args.id == null && t.args.text == null)) gains.push(`No thought chosen, so it is the next on the list: "${d.text}"`);
      if (d.free) gains.push(`${p.name} will think, word for word: "${d.text}". The words mean nothing to the game, which cannot understand them; by their length and tone they read as ${d.tone}.`);
      gains.push(`What ${she(p)} then does: ${typeof d.does === 'function' ? d.does(p, H) : d.does}`);
      const more = d.forecast?.(p, H);
      if (more?.gains) gains.push(...more.gains);
      if (more?.costs) costs.push(...more.costs);
      costs.push(`Takes it as a voice from above: ${chanceText(pv)}${meterText(vm) ? ` (${meterText(vm)})` : ''}. As ${her(p)} own idea: ${chanceText(1 - pv)}${om.harder ? `, and a reason to grow more skeptical (${meterText(om)})` : om.odd ? ', just an odd idea' : meterText(om) ? ` (${meterText(om)})` : ''}.`);
      costs.push(`Changed for good: ${chanceText(pc)}. Then ${typeof d.forGood === 'function' ? d.forGood(p) : d.forGood}${vm.faith > 0 ? `, and a voice that sticks adds faith +${TG.CHANGED_FAITH}` : ''}.`);
      costs.push(`Others: ${typeof d.others === 'function' ? d.others(p, H) : d.others}`);
      return { ok: true, gains, costs, who: `Nobody sees a thought given. Others react only to what ${p.name} then says and does.`, seenBy: 0, fates: [], confirm: 'click',
        kind: 'person', name: `${p.name} of the ${p.family.name} family`, sex: p.sex, thought: { id: d.id, text: d.text, tone: d.tone, odd: d.odd }, chances: { voice: pv, changed: pc },
        chance: { asOwn: Math.round((1 - pv) * 1000) / 1000, fromAbove: Math.round(pv * 1000) / 1000, changed: Math.round(pc * 1000) / 1000 } };
    }

    function give(t) {
      const p = t?.entity;
      const why = refuseFor(p);
      if (why) return { ok: false, text: why };
      const d = resolve(t.args);
      if (d.error) return { ok: false, text: d.error };
      if (!d.free && !t.args?.thought && !t.args?.id) K.next++;
      const asVoice = Math.random() < pVoice(p, d);
      const changed = Math.random() < pChange(p, d);
      const m = asVoice ? voiceMeters(p, d) : ownMeters(p, d);
      applyMeters(p, m);
      if (changed && asVoice && (m.faith ?? 0) > 0) p.faith = clamp100(p.faith + TG.CHANGED_FAITH);
      if (changed && m.harder) p.skep = clamp100(p.skep + TG.HARDER_CHANGED);
      const g = G(p);
      const c = { id: d.id, text: d.text, tone: d.tone, odd: d.odd, free: !!d.free, asVoice, changed, harder: !!m.harder, from: null, depth: 0,
        at: Math.floor(S.year), until: S.life + (d.lasts ?? 6) * TG.LASTS_MUL, plantUntil: S.life + TG.PLANT_YEARS, told: 0, believed: 0, laughed: 0, shunned: 0, notes: [] };
      if (g.cur) g.history.push(g.cur);
      g.cur = c;
      if (changed) g.lasting.push(d.free ? `tone:${d.tone}` : d.id);
      p.planted = { text: d.text, source: asVoice ? 'a voice from above' : 'their own idea' };
      p.thinkT = 0;
      const note = d.give?.(p, H, c) ?? null;
      R.story(p, asVoice ? `Heard a voice from above say: "${d.text}"` : m.harder ? `Had a strange thought, "${d.text}", and took it as proof that heads make things up. The stone too.` : `Had a thought all ${her(p)} own: "${d.text}"`);
      if (changed) R.story(p, 'Was never quite the same after.');
      const rec = { year: c.at, yearLabel: R.yearLabel(S.year), person: p, name: p.name, family: p.family.name, id: d.id, text: d.text, tone: d.tone, asVoice, changed, cur: c, note };
      K.log.push(rec); if (K.log.length > 60) K.log.shift();
      R.signal('mind:thought-given', { person: p, text: d.text, asOwn: !asVoice, changed, id: d.id, tone: d.tone });
      const how = asVoice ? 'as a voice from above' : m.harder ? 'as a strange idea, and grows more skeptical for it' : 'as an idea of ' + her(p) + ' own';
      return { ok: true, text: `${p.name} took it ${how}${changed ? ', and is changed for good' : ''}.${note ? ` ${note}` : ''}`, x: p.x, z: p.z, r: -100, asVoice, changed, thought: d.id };
    }
    R.power({ id: 'give-thought', forecast, carryOut: give, witness: { unseen: true, report() {} } });

    // ---------- telling: the only way others learn of it ----------
    function tell(p, q) {
      const g = G(p), c = g.cur && live(g.cur) ? g.cur : null;
      const d = c ? (c.free ? FREE_TONES[c.tone] : BY_ID[c.id]) : BY_ID[g.lasting.find((x) => BY_ID[x])];
      if (!d) return null;
      const text = c?.text ?? d.text, odd = c?.odd ?? d.odd, claimVoice = !!c?.asVoice;
      const lf = q.faith / 100, ls = q.skep / 100;
      const w = d.weights?.(q, p, H) ?? {};
      const believe = (w.believe ?? 1) * (claimVoice ? 0.3 + 1.2 * lf : 0.4 + 0.6 * (1 - odd)) * (1 - 0.6 * odd * ls);
      const laugh = (w.laugh ?? 1) * (0.2 + 1.2 * odd * ls);
      const shun = (w.shun ?? 0.3) * (claimVoice ? 0.3 + ls : 0.3) * odd;
      let r = Math.random() * (believe + laugh + shun);
      const kind = (r -= believe) < 0 ? 'believe' : (r -= laugh) < 0 ? 'laugh' : 'shun';
      const said = claimVoice ? `The stone spoke to ${p.name}: "${text}"` : `${p.name} says: "${text}"`;
      if (c) { c.told++; if (kind === 'believe') c.believed++; else if (kind === 'laugh') c.laughed++; else c.shunned++; }
      R.data(q, 'given', () => ({ cur: null, lasting: [], history: [] })).heardFrom = p.id;
      if (kind === 'believe') {
        H.say(q, `${said} ${cap1(she(p))} may be right.`);
        p.happy = clamp100(p.happy + 3);
        const gq = G(q);
        if ((!gq.cur || !live(gq.cur)) && (c?.depth ?? 0) < TG.MAX_DEPTH) {
          gq.cur = { id: c?.id ?? d.id, text, tone: c?.tone ?? d.tone, odd, free: !!c?.free, asVoice: false, changed: false, from: p.name, depth: (c?.depth ?? 0) + 1,
            at: Math.floor(S.year), until: S.life + (d.lasts ?? 6) * TG.LASTS_MUL * TG.HEARD_LASTS, plantUntil: 0, told: 0, believed: 0, laughed: 0, shunned: 0, notes: [] };
          R.story(q, `Heard ${p.name} say "${text}" and came to believe it.`);
        }
      } else if (kind === 'laugh') {
        H.say(q, `${said} I laughed until I cried.`);
        q.happy = clamp100(q.happy + 3); p.happy = clamp100(p.happy - 3);
        H.say(p, 'They laughed at me. They will see.');
      } else {
        H.say(q, `${p.name} has gone strange. I keep away from ${herO(p)} now.`);
        p.happy = clamp100(p.happy - 6);
        R.story(q, `Kept away from ${p.name} after what ${she(p)} kept saying.`);
        if (c && c.shunned === 2) R.story(p, `People keep away since ${she(p)} started saying "${text}".`);
      }
      d.heard?.(q, p, kind, H);
      return kind;
    }

    // ---------- the day: what the thought makes them do (activity hook, before commandments) ----------
    R.on('activity', (p) => {
      const g = p.ext?.given;
      if (!g || p.fleeing) return false;
      const c = g.cur && live(g.cur) ? g.cur : null;
      const keptId = !c ? g.lasting[g.lasting.length - 1] : null;
      if (!c && !keptId) return false;
      const d = c ? (c.free ? FREE_TONES[c.tone] : BY_ID[c.id]) : keptId.startsWith('tone:') ? FREE_TONES[keptId.slice(5)] : BY_ID[keptId];
      if (!d) return false;
      const night = H.night();
      if (night && !d.night) return false;
      const k = c ? 1 : TG.FOR_GOOD;
      // telling someone (carriers within MAX_DEPTH)
      const depth = c?.depth ?? 0;
      if (!night && (c || !d.free) && depth < TG.MAX_DEPTH && Math.random() < Math.min(0.9, (d.tell ?? TG.TELL_CHANCE) * TG.ACT_MUL * k)) {
        const q = H.nearestPerson(p, TG.TELL_REACH, (x) => x.ext?.given?.heardFrom !== p.id);
        if (q) return H.visit(p, q, `telling ${q.name}: "${(c?.text ?? d.text).slice(0, 48)}${(c?.text ?? d.text).length > 48 ? '...' : ''}"`, (who) => tell(p, who));
      }
      if (d.act && Math.random() < Math.min(0.95, (d.chance ?? 0.3) * TG.ACT_MUL * k)) return !!d.act(p, H, c ?? { id: d.id, text: d.text, kept: true });
      return false;
    });

    // ---------- every update: the planted words fade; the shared modifiers (registered once) ----------
    let fadeT = 0;
    R.on('step', ({ dt }) => {
      fadeT -= dt;
      if (fadeT > 0) return;
      fadeT = 0.5;
      for (const p of S.people) {
        const c = p.ext?.given?.cur;
        if (c && p.planted && S.life >= c.plantUntil && p.planted.text === c.text) { p.planted = null; p.thinkT = 0; }
      }
      for (const f of H.ticks) f();
    });
    for (const d of [...READY, ...Object.values(FREE_TONES)]) {
      (d.mods ?? []).forEach(([stat, spec], i) => R.mod(stat, `thoughts:${d.id}:${i}`, { ...spec, who: spec.who ? (s) => spec.who(s, H) : d.free ? (s) => toneOn(s, d.tone) : (s) => isOn(s, d.id), note: d.title }));
    }
    for (const d of READY) d.init?.(H);

    // ---------- queries, inspect, thoughts, fate ----------
    R.answer('thoughtList', () => READY.map((d) => ({ id: d.id, title: d.title, text: d.text, odd: d.odd, tone: d.tone })));
    // the HUD's list: [{ id, text, group, hint }]; group by how strange the thought is
    R.answer('readyThoughts', () => READY.map((d) => ({ id: d.id, text: d.text, title: d.title, group: d.odd >= 0.7 ? 'Strange' : d.odd >= 0.45 ? 'Odd' : 'Sensible', hint: typeof d.does === 'string' ? cap1(d.does) : d.title, odd: d.odd, tone: d.tone })));
    R.answer('chooseThought', (x) => { K.chosen = x ?? null; return K.chosen; });
    R.answer('givenThoughts', () => K.log.map((r) => ({ ...r, person: undefined, personId: r.person.id, told: r.cur.told, believed: r.cur.believed, laughed: r.cur.laughed, shunned: r.cur.shunned, cur: undefined })));
    R.answer('thoughtOf', (p) => { const c = p?.ext?.given?.cur; return c ? { ...c, notes: undefined, active: live(c), lasting: [...p.ext.given.lasting] } : null; });
    R.answer('thoughtRules', () => ({ pVoice, pChange }));
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const g = e.ext?.given, c = g?.cur;
      if (!c) return;
      const on = live(c);
      out.given = { text: c.text, id: c.id, tone: c.tone, asVoice: c.asVoice, from: c.from, changed: c.changed, active: on, told: c.told, believed: c.believed, laughed: c.laughed, shunned: c.shunned, lasting: [...g.lasting] };
      const rows = [['Thought', `"${c.text}"`], ['Took it', c.from ? `from ${c.from}` : c.asVoice ? 'as a voice from above' : c.harder ? 'as a strange idea, and grows more skeptical for it' : `as ${her(e)} own idea`]];
      if (c.changed || g.lasting.length) rows.push(['Changed for good', 'yes: it stays with them for life']);
      if (c.told) rows.push(['Told', `${c.told} ${c.told === 1 ? 'person' : 'people'}: ${c.believed} believed, ${c.laughed} laughed, ${c.shunned} kept away`]);
      rows.push(['On their mind', on ? `for about ${Math.max(1, Math.round((c.until - S.life) / R.T.LIFE_RATE))} more years` : g.lasting.length ? 'for life' : 'no longer']);
      R.section(out, { id: 'given', title: 'A given thought', rows, order: 34 });
    });
    R.on('thoughts', (p) => {
      const g = p.ext?.given;
      if (!g || p.dead) return null;
      const c = g.cur, out = [];
      if (c && live(c)) {
        if (p.asleep) out.push([14, c.free ? `A dream. Someone keeps saying: "${c.text}"` : `Dreaming: "${c.text}"`]);
        else out.push([c.from ? 18 : 26, c.from ? `"${c.text}" ${c.from} told me. I keep thinking about it.` : c.text]);
      } else if (g.lasting.length && !p.asleep) out.push([6, (c && c.text) || 'That old thought again.']);
      return out;
    });
    R.on('fate', (p) => (p.ext?.given?.lasting?.length ? `Will carry the thought "${(p.ext.given.history.concat(p.ext.given.cur ?? []).find((c) => c.changed)?.text ?? p.ext.given.cur?.text ?? '').slice(0, 60)}" for life.` : null));
    R.thoughtsGiven = { K, H, pVoice, pChange, give, forecast, tell, isOn };
  },
};
