// Strike (stage 1), moved onto the seam as the worked example of a power:
// strike down an animal (a click) or a person (a press and hold). docs/SIM.md
// "Striking a person" has the rules; docs/STAGE2-CONTRACTS.md the seam.
//   forecast(target)  the trade off, built from the same functions die() and the witness spec use
//   carryOut(target)  kills; it does NOT witness (the god's single witness call does, kind 'strike')
//   witness           what seeing it does: a wolf struck (faith, early settlers hooked on help), or a
//                     person struck (terror and faith, never help)
import { T } from './tune.js';
import { number, yearLabel } from './words.js';
import { whatSeen } from './powers.js';

const STRIKE_R = 3; // a bolt of light from the sky is seen this far beyond each person's sight
const ASIDES = ['Smiting: the oldest tool in the box.', 'Mysterious ways, they will call it. Mostly just ways.', 'Somebody will write a very long poem about this.'];
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default {
  id: 'strike',
  init(R) {
    const { S } = R;
    // the last strike carried out, so a witness call without a target (the console) can still name the animal
    let lastStrike = null;

    // what a strike target is: an animal entity, a person, or a point near an animal
    function resolve(target) {
      if (!target) return null;
      if (target.entity !== undefined) target = target.entity ?? (target.x != null ? { x: target.x, z: target.z } : null);
      if (!target) return null;
      if (target.kind === 'animal') return target.dead ? null : target;
      if (target.kind === 'person') return target.dead ? null : target;
      if (target.x != null) {
        let best = null, bd = 3;
        for (const a of S.animals) { if (a.dead) continue; const d = Math.hypot(a.x - target.x, a.z - target.z); if (d < bd) { bd = d; best = a; } }
        return best;
      }
      return null;
    }

    function forecast(target) {
      const a = resolve(target);
      if (!a) return { gains: [], costs: [], who: 'There is nothing here to strike.', seenBy: 0, ok: false, fates: [] };
      if (a.kind === 'person') return forecastPerson(a);
      // who would notice, by the witness rule (faith.js: a bolt is seen far off, and its thunder wakes sleepers)
      const W = R.describeWitness(witness({ kind: 'strike', x: a.x, z: a.z, r: STRIKE_R, target: a }), a.x, a.z, STRIKE_R, 'strike');
      const seen = W.seen;
      const gains = [], costs = [];
      const wolves = S.predators.filter((w) => !w.dead);
      const deer = S.animals.filter((d) => d.species === 'deer' && !d.dead).length;
      if (a.species === 'wolf') {
        gains.push('This wolf will never hunt again.');
        if (a.prey?.kind === 'person' && a.outcome && a.outcome !== 'escape') gains.push(`${a.prey.name} of the ${a.prey.family.name} family, whom it is hunting, will be safe from it.`);
        else if (a.prey?.kind === 'person') gains.push(`It is hunting ${a.prey.name} of the ${a.prey.family.name} family, who will see it in time anyway.`);
        else if (a.state === 'leave') gains.push('It was already going back into the mist.');
        if (wolves.length === 1) {
          const run = S.year - S.startYear;
          costs.push(`No predator will be left to thin the deer. There are ${deer} now; past ${T.DEER_RAID_AT} they start eating the fields.`);
          if (run < T.PRED_UNTIL) costs.push('Others may still come out of the mist.');
        }
      } else if (a.species === 'rabbit') {
        const rabbits = S.animals.filter((d) => d.species === 'rabbit' && !d.dead).length;
        gains.push(rabbits > 10 ? 'One less rabbit nibbling the crops.' : 'Nothing anyone needs.');
        costs.push(`The rabbits number ${rabbits - 1}.`);
      } else if (a.species === 'deer') {
        gains.push(deer > T.DEER_RAID_AT ? 'One less deer eating the fields.' : 'Nothing anyone needs: your people do not hunt deer yet.');
        costs.push(`The herds shrink to ${deer - 1}.`);
        if (deer - 1 <= 4 && wolves.length) costs.push('The wolves will have fewer deer to hunt, and more reason to come for people.');
      } else {
        gains.push('Nothing anyone needs.');
      }
      costs.push(...W.costs);
      // what-if: fates this strike would change (only the wolf's prey's, today)
      const fates = [];
      if (a.species === 'wolf' && a.prey?.kind === 'person' && !a.prey.dead) { const t = S.mind.fateWithoutWolf(a.prey, a); if (t) fates.push(t); }
      return { gains, costs, who: W.who, seenBy: W.seenBy, later: W.later, word: W.word, ok: true, target: a, fates, kind: 'animal', confirm: 'click' };
    }

    // ---------- striking a person: everything here is what die() and the witness spec then do ----------
    const she = (p) => (p.sex === 'f' ? 'she' : 'he'), her = (p) => (p.sex === 'f' ? 'her' : 'his'), herO = (p) => (p.sex === 'f' ? 'her' : 'him');
    const names = (list, max = 2) => {
      const n = list.map((p) => p.name);
      if (n.length <= max) return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n.join('');
      return `${n.slice(0, max).join(', ')} and ${number(n.length - max)} more`;
    };
    const ending = (e) => e.words ?? (e.how === 'wolf' ? `at ${e.age}, taken by a wolf` : e.how === 'hunger' ? `of hunger at ${e.age}` : `of old age at ${e.age}`);
    function personPlan(p) {
      const f = p.family, PA = S.peopleApi, M = S.mind;
      const end = M.endOf(p), kids = M.kidsDue(p, end);
      const kin = PA.kinOf(p), orphans = PA.motherless(p);
      const house = f.members.filter((m) => m !== p && !m.dead);
      const adultsLeft = house.filter((m) => m.stage !== 'child');
      const childrenLeft = house.filter((m) => m.stage === 'child');
      return { p, f, end, kids, kin, orphans, house, adultsLeft, childrenLeft, partner: p.partner && !p.partner.dead ? p.partner : null };
    }
    function forecastPerson(p) {
      const P = personPlan(p), f = P.f, age = Math.floor(p.age);
      const W = R.describeWitness(witness({ kind: 'strike', x: p.x, z: p.z, r: STRIKE_R, target: p }), p.x, p.z, STRIKE_R, 'strike');
      const seen = W.seen;
      const gains = [], costs = [], fates = [];
      // gains: only what is true
      const need = S.peopleApi.needOf(f);
      if (f.state === 'settled' && P.house.length && (f.shortRate > 0 || f.food < need * T.FOOD_PANIC)) gains.push(`One mouth less to feed: the ${f.name} family is short of food.`);
      if (f.members.length === T.HOUSE_MAX) gains.push(`The ${f.name} hut is no longer crowded.`);
      if (p.expectsHelp) gains.push(`Gone: one who sat waiting for the stone instead of working.`);
      if (!gains.length) gains.push('Nothing anyone needs.');
      // costs
      const wasTo = P.end.how === 'old age' ? `${she(p)} was to live to ${P.end.age}` : `${she(p)} was to die ${ending(P.end)} anyway`;
      costs.push(`${p.name} dies now, at ${age}. ${cap1(wasTo)}.`);
      if (P.kin.length) {
        const away = P.kin.filter((m) => m.family !== f);
        const who = P.kin.length <= 3 ? names(P.kin, 3) : `${cap1(number(P.kin.length))} of ${her(p)} kin`;
        costs.push(`${who} ${P.kin.length === 1 ? 'grieves' : 'grieve'}${away.length && P.kin.length > 3 ? ` (${names(away)} in another hut)` : ''}: happiness falls by ${-T.HAPPY_GRIEF}, healing over ${T.GRIEF_YEARS} years.`);
      }
      if (p.stage === 'child') costs.push('No work lost: a child.');
      else if (f.state !== 'settled') costs.push(`The ${f.name} family walks on with one ${p.stage === 'elder' ? 'elder' : 'grown-up'} fewer.`);
      else if (!P.adultsLeft.length && P.childrenLeft.length) costs.push(`${names(P.childrenLeft)} ${P.childrenLeft.length === 1 ? 'is' : 'are'} left with no grown-up to work for them.`);
      else if (f.plans.some((b) => !b.done && b.kind === 'hut')) costs.push(`Work lost: the ${f.name} hut goes up slower without ${herO(p)}.`);
      else if (f.fields.length) costs.push(`Work lost: the ${f.name} fields get less care.`);
      else costs.push(`Work lost: one fewer to gather food for the ${f.name} family.`);
      // what changes for others, exactly as the simulation will carry it out
      if (P.kids) {
        const n = P.kids === 1 ? 'child' : `${number(P.kids)} children`;
        if (p.sex === 'f') fates.push(P.kids === 1 ? `Her unborn child will never be.` : `Her ${number(P.kids)} unborn children will never be.`);
        else fates.push(`The ${n} ${P.partner.name} was to have with him will never be.`);
      }
      for (const o of P.orphans) fates.push(`${o.child.name} grows up without a mother and dies at ${Math.floor(o.after)} instead of ${Math.floor(o.before)}.`);
      if (!P.house.length && f.state === 'settled') fates.push(`The ${f.name} family ends with ${herO(p)}.${f.home?.done ? ' Their hut will stand empty.' : ''}`);
      else if (P.partner && !P.kids) fates.push(`${P.partner.name} is left without a partner.`);
      // who sees, and what it does to them (the numbers of the witness spec below)
      let who;
      if (seen.length) {
        const far = W.seen.length - seen.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) <= T.SIGHT_DAY + STRIKE_R).length;
        who = `${names(seen)} ${seen.length === 1 ? 'is' : 'are'} watching${far > 0 ? ` (${number(far)} from afar, or woken by the thunder)` : ''}. Seeing a person struck from the sky terrifies: happiness drops ${T.STRUCK_SEEN_HAPPY} at once and fear stays for about ${T.DREAD_YEARS} years; faith jumps ${T.STRUCK_SEEN_FAITH}, skepticism falls ${T.STRUCK_SEEN_SKEP} in those close by (less from afar, and in skeptics). Fear does not make them lean on you.${W.word ? ` ${W.word}` : ''}`;
      } else {
        const anyAwake = S.people.some((q) => q !== p && !q.dead && !q.hidden && !q.asleep);
        who = `${!anyAwake && S.people.length > 1 ? 'Nobody is looking: everyone else is asleep.' : 'Nobody is looking.'} Nobody's faith changes; to ${her(p)} kin ${she(p)} simply fell dead.`;
      }
      return { gains, costs, who, seenBy: seen.length, later: W.later, word: W.word, ok: true, target: p, fates, kind: 'person', name: `${p.name} of the ${f.name} family`, sex: p.sex, confirm: 'hold' };
    }
    function strikePerson(p) {
      const P = personPlan(p), age = Math.floor(p.age), when = yearLabel(S.year);
      R.bolt(p.x, p.y, p.z);
      lastStrike = { x: p.x, z: p.z, a: p };
      for (const w of S.predators) if (w.prey === p) w.outcome = null;
      const unseen = R.seenAt(p.x, p.z, STRIKE_R, 'strike') - (R.sees(p, p.x, p.z, STRIKE_R) ? 1 : 0) <= 0;
      const life = P.end.how === 'old age' ? `Was to live to ${P.end.age}` : `Was to die ${ending(P.end)}`;
      const story = `Struck down from the sky at ${age}. ${life}${P.kids ? ` and have ${number(P.kids)} more ${P.kids === 1 ? 'child' : 'children'}` : ''}.`;
      const kinStory = (k) => {
        if (k === P.partner && P.kids) return `Was to have ${number(P.kids)} more ${P.kids === 1 ? 'child' : 'children'} with ${p.name}. ${cap1(she(p))} was struck down in ${when}.`;
        return `Lost ${p.name}, struck down from the sky${unseen ? '. Nobody saw what happened' : ''}.`;
      };
      const aside = R.aside('strike:person', ASIDES, 100);
      p.keepBody = 6;
      S.peopleApi.die(p, 'struck down', { story, kinStory, aside });
      const n = R.seenAt(p.x, p.z, STRIKE_R, 'strike');
      const text = `${p.name} is struck down. ${n ? `${cap1(number(n))} ${n === 1 ? 'person' : 'people'} saw it.` : 'Nobody saw it.'}`;
      return { ok: true, text, x: p.x, z: p.z, r: STRIKE_R, target: p, kind: 'person' };
    }

    function carryOut(target) {
      const a = resolve(target);
      if (!a) return { ok: false, text: 'There is nothing here to strike.' };
      if (a.kind === 'person') {
        if (a.hidden && !a.xray) return { ok: false, text: `${a.name} is indoors, out of reach.` }; // xray: seen through the roof on hover (ui/xray.js)
        return strikePerson(a);
      }
      // The strike only kills. The caller (the god module) then calls
      // witness({ kind: 'strike', x, z, r }) as for every act, which applies the
      // effects once (contract; orchestrator note 2026-11-12).
      R.bolt(a.x, a.y, a.z);
      lastStrike = { x: a.x, z: a.z, a };
      const prey = a.prey;
      if (prey?.kind === 'person' && !prey.dead && a.outcome && a.outcome !== 'escape') {
        R.fateChanged(prey, a.outcome === 'kill' ? `die at ${Math.floor(prey.age)} by a wolf` : 'be bitten by a wolf', `The wolf was struck down in ${yearLabel(S.year)}.`);
      }
      a.outcome = null;
      S.animalsApi.kill(a, 'strike');
      a.keepBody = 5;
      const n = R.seenAt(a.x, a.z, STRIKE_R, 'strike');
      const name = a.name.replace(/^An? /, '').toLowerCase();
      const text = `The ${name} is struck down. ${n ? `${cap1(number(n))} ${n === 1 ? 'person' : 'people'} saw it.` : 'Nobody saw it.'}`;
      return { ok: true, text, x: a.x, z: a.z, r: STRIKE_R, target: a };
    }

    // ---------- what seeing it does ----------
    // Seeing a person struck dead from a clear sky (docs/SIM.md "Striking a person"): far stronger than
    // seeing a wolf struck. Each witness is terrified (happiness drops STRUCK_SEEN_HAPPY at once and a
    // dread stays, counted as fear, fading over DREAD_YEARS) and their faith jumps (STRUCK_SEEN_FAITH,
    // doubt down STRUCK_SEEN_SKEP). It never makes anyone expect help, early settler or not: they fear
    // the sky, they do not lean on it. The struck person sees nothing (they are dead).
    function witness(act) {
      let target = act.target;
      if (!target?.species && target?.kind !== 'person' && lastStrike && Math.hypot(lastStrike.x - act.x, lastStrike.z - act.z) < 4) target = lastStrike.a;
      if (target?.kind === 'person') {
        const v = target;
        return {
          r: STRIKE_R, exclude: v, happy: -T.STRUCK_SEEN_HAPPY, dread: 1, dreadOf: v.name, faith: T.STRUCK_SEEN_FAITH, doubt: -T.STRUCK_SEEN_SKEP,
          what: `${v.name} struck dead by light from a clear sky`, // the tale people tell (faith-tales.js)
          thought: `Light fell from a clear sky and ${v.name} dropped dead. Something up there kills.`,
          story: `Saw ${v.name} struck dead by light from the sky. Has been afraid since.`,
          payload: () => ({ target: v }),
          report(seen) {
            if (seen.length) S.alert('warn', `${seen.length === 1 ? 'One person' : `${cap1(number(seen.length))} people`} saw ${v.name} struck from the sky. They are terrified, and their faith leapt.`, act.x, act.z, undefined, seen[0]);
            else S.alert('info', `Nobody saw what killed ${v.name}. Nobody's faith changed; the family grieve without knowing why.`, act.x, act.z);
          },
        };
      }
      const what = whatSeen('strike', target);
      const w = T.KIND_WEIGHT.strike ?? T.KIND_WEIGHT.default;
      return {
        r: STRIKE_R, faith: T.WITNESS_FAITH * w, doubt: -(T.WITNESS_SKEP * w), early: T.EARLY_MULT, hooks: true, what,
        thought: 'Light fell from the sky and the animal dropped. Something is watching us.',
        story: `Saw ${what}.`,
        after(seen) {
          const prey = target?.prey;
          if (prey?.kind === 'person' && !prey.dead && Math.hypot(prey.x - act.x, prey.z - act.z) < 30) {
            S.peopleApi.story(prey, seen.includes(prey) ? 'Was saved from a wolf by a bolt of light.' : `A wolf hunting ${prey.sex === 'f' ? 'her' : 'him'} dropped dead. ${prey.sex === 'f' ? 'She' : 'He'} never knew why.`);
          }
          if (!seen.length) {
            const name = target?.name ? target.name.replace(/^An? /, '').toLowerCase() : 'animal';
            S.alert('info', `The ${name} fell dead where nobody could see. Nobody's mind changed.`, act.x, act.z, 'A miracle with no audience. Very modest of you.');
          }
        },
      };
    }

    R.power({ id: 'strike', forecast, carryOut, witness });
  },
};
