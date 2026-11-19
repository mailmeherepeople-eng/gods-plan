// A. The powers of mercy and harm over nature: heal, rain (id bless-harvest),
// send sickness, send fire, send flood. Each forecast is built from the
// same functions and rolls its carryOut then uses (hardship*.js), and its
// "Who sees" from the very witness spec R.witness applies (R.describeWitness).
// A roll a forecast shows (who a sent sickness kills, who is trapped in a hut
// set alight, how long a flood stays) is kept PRE_MS real ms for the act.
//
// Witness specs (rule choices for the director, docs/HARDSHIPS.md):
//   heal           seen helping: faith up, doubt down, a little happier; early settlers who see it
//                  expect help for good (DESIGN.md: help seen early makes people dependent)
//   bless-harvest  rain out of a clear sky (the Rain power): as heal, a little softer; early settlers hooked
//   send-sickness  nobody can tell a sent sickness from any other: nobody sees it, nobody's mind changes
//   send-fire      fire falling from a clear sky: faith up from fear, happiness down, a dread; never hooks
//   send-flood     water rising out of nothing: faith up, happiness down; never hooks
import { hardshipApi } from './hardship.js';
import { yearLabel, number, cap, pick } from './words.js';
import { B } from '../world/blocks.js';
import { makeRainFx } from './powers-nature-rain.js';

export const TUNE_NATURE = {
  HEAL_FAITH: 6, HEAL_DOUBT: -5, HEAL_HAPPY: 3,
  BLESS_FAITH: 5, BLESS_DOUBT: -4, BLESS_HAPPY: 4,
  BLESS_RIPE: 1,       // rain on a sown field ripens its standing crop at once, to at least this share of a full harvest at
                       // full care (tune.js FIELD_YIELD x CROP_GROW: about 75 food a field), ready to cut and carry home
  BLESS_YIELD: 1.8,    // then their fields fill their crops this many times as fast
  BLESS_YEARS: 10,     // for this many life years (rain on fields watered within this long ripens nothing more)
  RAIN_WET_S: 60,      // game seconds the ground under the god's rain is too wet to burn
  RAIN_GAME_S: 12,     // game seconds people think of the rain and run from it
  RAIN_FALL_S: 9,      // after its act the god's rain falls on as light rain for this many game seconds, drifting with
                       // the wind and doing only what natural rain does (sim/season.js rainCloud)
  RAIN_DRY_S: 32,      // then the ground it last fell on dries over this many game seconds (the look)
  SOAK_YEARS: 12,      // calendar years one rain keeps the ground soaked
  SOAK_FLOOD: 3,       // the third rain on the same ground within SOAK_YEARS floods its low land (if water lies by it):
                       // the low land that would flood (the water planFlood finds by the rain's middle) must lie under
                       // this rain and under SOAK_FLOOD - 1 earlier ones
  RAIN_CALM: 0.5,      // chance a war band caught gathering or marching under it goes home
  RAIN_GLAD: 8,        // happiness for those it saves from a drought, a fire or hunger
  RAIN_SOAKED: -6,     // happiness for the others, the third time running
  RAIN_MOOD_YEARS: 2,  // life years either lasts
  GREEN_YEARS: 25,     // calendar years dry grass the rain greened stays green
  GREEN_PER_STEP: 250, // dry grass cells greened a step (the rest wait for the next steps: a quarter-map rain greens
                       // thousands, all at once that held a frame)
  FIRE_FAITH: 8, FIRE_DOUBT: -6, FIRE_HAPPY: -10, FIRE_DREAD: 0.5,
  FLOOD_FAITH: 6, FLOOD_DOUBT: -5, FLOOD_HAPPY: -6,
  PRE_MS: 60000,       // a forecast's rolls are kept this long for the act
};
const N = TUNE_NATURE;
const she = (p) => (p.sex === 'f' ? 'she' : 'he'), her = (p) => (p.sex === 'f' ? 'her' : 'his');
const names = (l, max = 3) => {
  const n = l.map((p) => p.name);
  if (n.length <= max) return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n.join('');
  return `${n.slice(0, max).join(', ')} and ${number(n.length - max)} more`;
};
const famNames = (fams) => { const n = [...fams].map((f) => f.name); return n.length === 1 ? `the ${n[0]} family` : n.length === 2 ? `the ${n[0]} and ${n[1]} families` : `the ${n.slice(0, 2).join(', ')} and ${number(n.length - 2)} more families`; };
const yrs = (n) => `${number(n)} ${n === 1 ? 'year' : 'years'}`;

export default {
  id: 'powers-nature',
  tune: TUNE_NATURE,
  init(R) {
    const { S } = R;
    const A = () => hardshipApi();
    const T = R.T;
    const cal = (life) => Math.max(1, Math.round(life / T.LIFE_RATE));
    const mid = (b) => ({ x: b.mx ?? b.cx ?? b.x, z: b.mz ?? b.cz ?? b.z });
    // rolls kept between a forecast and the act
    const pre = new Map();
    const keep = (key, make) => {
      const k = pre.get(key);
      if (k && performance.now() - k.t < N.PRE_MS) return k.v;
      const v = make();
      pre.set(key, { v, t: performance.now() });
      return v;
    };
    const used = (key) => pre.delete(key);
    // what a saved person's life now is, for a fates line
    const lifeAfter = (p) => {
      const n = p.stage === 'child' ? 0 : (S.mind.childrenAhead(p)?.length ?? 0); // births still to come, by the lifespans
      return `${cap(she(p))} lives to ${Math.floor(p.lifespan)}${n ? ` and has ${number(n)} more ${n === 1 ? 'child' : 'children'}` : ''}.`;
    };
    const troubleLines = (p, out) => { const l = A().trouble.lines(p); out.fates.push(...l.fates); out.later.push(...l.later); out.troubles.push(...l.troubles); };
    const peopleIn = (t) => {
      if (t?.kind === 'person') return t.entity && !t.entity.dead ? [t.entity] : [];
      if (t?.kind === 'area') return S.people.filter((p) => !p.dead && p.family?.state === 'settled' && Math.hypot(p.x - t.x, p.z - t.z) <= (t.r ?? 0) + 0.5);
      return [];
    };

    // ================= heal =================
    const HEAL_SEEN = { faith: N.HEAL_FAITH, doubt: N.HEAL_DOUBT, happy: N.HEAL_HAPPY, early: T.EARLY_MULT, hooks: true,
      what: 'the sick get up well, as if a hand had lifted the sickness off them', thought: 'The sickness just left. As if a hand lifted it.', story: 'Saw the sick made well by no hand.' };
    const healR = (t) => (t.kind === 'area' ? Math.max(1.5, t.r ?? 0) : 1.5);
    function healForecast(t) {
      if (t?.kind !== 'person' && t?.kind !== 'area') return R.refuse('Point at a sick or hurt person.');
      const plans = peopleIn(t).map((p) => A().sick.healPlan(p)).filter(Boolean);
      if (!plans.length) return R.refuse(t.kind === 'person' ? `${t.entity?.name ?? 'This person'} is not sick or hurt.` : 'Nobody here is sick or hurt.');
      const gains = [], out = { fates: [], later: [], troubles: [] };
      const fatal = plans.filter((x) => x.fatal), mild = plans.filter((x) => !x.fatal);
      if (fatal.length) gains.push(`${names(fatal.map((x) => x.p))} ${fatal.length === 1 ? 'is' : 'are'} cured, and will not die of it.`);
      if (mild.length) gains.push(`${names(mild.map((x) => x.p))} ${mild.length === 1 ? 'is' : 'are'} well at once instead of in a year or more, and back at work.`);
      if (plans.some((x) => x.sick)) gains.push('The sickness cannot pass from them to anyone else.');
      for (const x of fatal) { out.fates.push(`${x.p.name} no longer ${x.was.replace(/^die/, 'dies')}. ${lifeAfter(x.p)}`); troubleLines(x.p, out); }
      const w = R.describeWitness(HEAL_SEEN, t.x, t.z, healR(t));
      const costs = w.costs.length ? w.costs : ['Nothing.'];
      return { gains, costs, who: w.who, seenBy: w.seenBy, fates: out.fates, later: out.later, troubles: out.troubles, confirm: 'click', kind: t.kind, name: t.entity?.name };
    }
    function healAct(t) {
      const plans = peopleIn(t).map((p) => A().sick.healPlan(p)).filter(Boolean);
      if (!plans.length) return { ok: false, text: 'Nobody here is sick or hurt.' };
      const when = yearLabel(S.year);
      for (const x of plans) {
        A().sick.heal(x.p);
        A().fx.glow(x.p.x, x.p.y ?? 16, x.p.z);
        if (x.fatal) {
          R.fateChanged(x.p, x.was, `Healed by no hand in ${when}.`);
          A().trouble.save(x.p, 'heal', x.was, 'healed');
        } else R.story(x.p, `Was made well at once in ${when}, by no hand.`);
      }
      return { ok: true, text: `${names(plans.map((x) => x.p))} ${plans.length === 1 ? 'is' : 'are'} healed.`, x: t.x, z: t.z, r: healR(t) };
    }
    R.power({ id: 'heal', witness: HEAL_SEEN, forecast: healForecast, carryOut: healAct });

    // ================= rain =================
    // The god may send rain anywhere, at any time, on any size of ground (the director: "i should be able to
    // send rain whenever i want, whereever i want"); never smaller than an eighth of the map, a prayer's rain a
    // quarter (sim/rain-size.js, the director 2026-11-17). It does what rain does to whatever lies under it, and the
    // card says each of those before the act, from this one plan (rainPlan) that rainAct then carries out:
    //   fire      out in the ring, and the soaked ground will not catch again for RAIN_WET_S game seconds
    //   drought   one the ring touches is over; fields are watered: a sown field's standing crop ripens at once to a
    //             full harvest (BLESS_RIPE), ready to bring in, and the fields grow BLESS_YIELD times as well for
    //             BLESS_YEARS life years (once in that time: rain on fields already watered only keeps them growing
    //             well; rain on bare fields, or in winter, ripens nothing but helps what is sown next)
    //   grass     dry grass in the ring greens
    //   water     a pond or lake under the ring rises one block for TOPUP_YEARS; the third rain on the
    //             same ground within SOAK_YEARS floods its low land (the card warns on the second)
    //   sickness  rain does nothing for the sick or against them (only a flood's own rule follows a flood)
    //   a fight   a band gathering or marching under it may lose heart (RAIN_CALM, rolled for the card)
    //   people    everyone out in it runs for shelter; it is welcome where it ends a drought, a fire or
    //             hunger, and miserable the third time in a short while (happiness, not faith)
    // Empty wilderness: it just rains and the grass greens. Who sees it is the witness spec, unchanged.
    const BLESS_SEEN = { faith: N.BLESS_FAITH, doubt: N.BLESS_DOUBT, happy: N.BLESS_HAPPY, early: T.EARLY_MULT, hooks: true,
      what: 'rain fall out of a clear sky on one spot', thought: 'Rain, out of a clear sky, just here.', story: 'Saw rain fall out of a clear sky on one spot.' };
    const watered = new Map();  // family -> life time its fields stay watered
    const soaks = [];           // { x, z, r, year }: the god's rains, for soaking
    const rains = [];           // { x, z, r, until (S.clockT) }: rain falling now
    const greens = [];          // { cells: [x, z...], until (year) }: dry grass the rain greened
    R.on('year', () => {
      for (let k = greens.length - 1; k >= 0; k--) {
        const g = greens[k];
        if (S.year < g.until) continue;
        greens.splice(k, 1);
        for (let j = 0; j < g.cells.length; j += 2) {
          const x = g.cells[j], z = g.cells[j + 1], i = S.land.ci(x, z), y = S.land.top[i];
          // a drought dries it by itself (and greens it again when it ends), so leave those
          if (R.ctx.world.get(x, y, z) === B.GRASS && !A().water.dryAt(x, z)) { S.build.put(x, y, z, B.GRASS_DRY, null); S.land.scanColumn(x, z); }
        }
      }
    });
    // dry grass waiting to green, x, z pairs: put down GREEN_PER_STEP a step so a quarter-map rain never holds a frame
    const greenQ = [];
    function greenStep() {
      const land = S.land, n = Math.min(greenQ.length, N.GREEN_PER_STEP * 2);
      for (let k = 0; k < n; k += 2) {
        const x = greenQ[k], z = greenQ[k + 1], i = land.ci(x, z);
        if (R.ctx.world.get(x, land.top[i], z) === B.GRASS_DRY) { S.build.put(x, land.top[i], z, B.GRASS, null); land.scanColumn(x, z); }
      }
      greenQ.splice(0, n);
    }
    R.on('step', () => { if (greenQ.length) greenStep(); });
    let rainSeq = 0, rainFx = null;
    // measuring aid (tools/rain-measure.mjs): what the god's rains have reached, and the slowest act
    const rainStats = { acts: 0, fams: 0, fresh: 0, under: 0, floods: 0, warned: 0, greened: 0, maxMs: 0 };
    const fx = () => (rainFx ??= makeRainFx(R.ctx, S));
    const inRing = (x, z, t, pad = 0) => Math.hypot(x - t.x, z - t.z) <= (t.r ?? 0) + pad;
    function soakAt(t) {
      for (let k = soaks.length - 1; k >= 0; k--) if (S.year - soaks[k].year >= N.SOAK_YEARS) soaks.splice(k, 1);
      return soaks.filter((s) => Math.hypot(s.x - t.x, s.z - t.z) <= s.r + 2);
    }
    // how far the flood itself reaches: the same 6 to 18 blocks as before rain grew. A quarter-map rain still floods
    // only the low land by the water nearest its middle (where the prayer was), not every shore under it
    const floodR = (r) => Math.min(18, Math.max(6, r));
    function floodRoll(t) {
      return keep(`rainflood:${Math.round(t.x)},${Math.round(t.z)},${t.r}`, () => {
        const years = Math.round(A().T.FLOOD_YEARS[0] + Math.random() * (A().T.FLOOD_YEARS[1] - A().T.FLOOD_YEARS[0]));
        return { years, sickIn: Math.random() < A().T.FLOOD_SICK ? 1 + Math.random() * Math.max(1, years * 0.6 - 1) : null };
      });
    }
    function rainPlan(t) {
      const r = Math.max(1, t.r ?? 6), land = S.land;
      const fams = S.families.filter((f) => f.state === 'settled' && ((f.home && Math.hypot(f.home.cx - t.x, f.home.cz - t.z) <= r + 2) || f.fields.some((fl) => Math.hypot(mid(fl).x - t.x, mid(fl).z - t.z) <= r + 3)));
      // a crop to ripen needs a sown field (people.js, build.js: bare after a harvest, or in winter, until sown again)
      const sown = (f) => f.fields.some((fl) => fl.done && !fl.bare);
      const farm = fams.filter((f) => f.fields.some((fl) => fl.done));
      const notLately = (f) => !((watered.get(f) ?? -1) > S.life);
      const fresh = farm.filter((f) => notLately(f) && sown(f)), bare = farm.filter((f) => notLately(f) && !sown(f));
      const again = farm.filter((f) => !notLately(f));
      const droughts = A().water.droughts().filter((d) => Math.hypot(d.x - t.x, d.z - t.z) <= d.r + r);
      const fire = A().fire.preview(t.x, t.z, r);
      // fed: those foretold to starve whose family's crop it ripens (the ripe crop is food found: people.js foodFound)
      const hungry = fresh.flatMap((f) => f.members.filter((m) => !m.dead && S.mind.endOf(m).how === 'hunger'));
      // dry grass in the ring (a drought it ends greens its own)
      let dry = 0;
      for (let z = Math.floor(t.z - r); z <= Math.ceil(t.z + r); z++) for (let x = Math.floor(t.x - r); x <= Math.ceil(t.x + r); x++) {
        if (!land.inside(x, z) || Math.hypot(x + 0.5 - t.x, z + 0.5 - t.z) > r) continue;
        const i = land.ci(x, z);
        if (!land.wet[i] && land.gid[i] === B.GRASS_DRY) dry++;
      }
      // water: a top-up, or on soaked ground a flood. The ground that counts is the low land that would flood (the
      // water planFlood finds by the rain's middle, always under this rain), soaked when earlier rains covered it
      const nFlood = Math.max(1, N.SOAK_FLOOD - 1);
      const floodNear = A().water.floodNear(t.x, t.z, r);
      let flood = null, warn = false;
      const fp = floodNear ? null : A().water.planFlood(t.x, t.z, floodR(r));
      const canFlood = !!fp && fp.dry >= 6;
      const soaked = soakAt(canFlood ? { x: fp.x, z: fp.z } : t);
      if (canFlood && soaked.length >= nFlood) flood = { plan: fp, roll: floodRoll(t) };
      else if (canFlood && soaked.length === nFlood - 1) warn = true;
      const top = flood || floodNear ? null : A().water.planTopUp(t.x, t.z, r);
      // a war band caught in it (C's fights, through their own api)
      const F = R.ask('fights:api');
      const bands = [];
      for (const f of F?.active ?? []) {
        if (f.phase !== 'gather' && f.phase !== 'march') continue;
        const band = f.attackers.filter((p) => !p.dead);
        const wet = band.filter((p) => inRing(p.x, p.z, t, 0.5));
        if (!band.length || wet.length < Math.ceil(band.length / 2)) continue;
        bands.push({ f, home: keep(`rainfight:${f.id}`, () => Math.random() < N.RAIN_CALM) });
      }
      const under = peopleIn({ kind: 'area', x: t.x, z: t.z, r });
      const out = under.filter((p) => !p.hidden && !p.asleep && !p.inside);
      const helped = new Set([...droughts.flatMap((d) => [...d.families]), ...fire.huts.map((h) => h.family).filter(Boolean), ...hungry.map((m) => m.family)]);
      const glad = under.filter((p) => helped.has(p.family));
      const sad = soaked.length >= 2 ? under.filter((p) => !helped.has(p.family)) : [];
      const sick = under.filter((p) => p.ext?.hardship?.sick);
      return { r, fams, fresh, bare, again, droughts, fire, hungry, dry, soaked, flood, warn, top, bands, under, out, glad, sad, sick };
    }
    function floodLines(P, pr, costs, fates) {
      costs.push(`This ground is soaked from your last rains, and this one floods it: the water rises ${number(A().T.FLOOD_RISE)} blocks over ${P.dry} cells of low land, for about ${yrs(pr.years)}.`);
      const byFam = new Map();
      for (const [fl, n] of P.fields) if (fl.family && n >= 4) byFam.set(fl.family, (byFam.get(fl.family) ?? 0) + 1);
      for (const [f, k] of byFam) {
        const left = Math.max(0, f.fields.length - k);
        costs.push(`${k === 1 ? 'A field' : `${cap(number(k))} fields`} of the ${f.name} family ${k === 1 ? 'goes' : 'go'} under: ${left ? 'less' : 'no'} food from ${left ? 'their fields' : 'them'} until it falls.`);
      }
      for (const h of P.huts) if (h.family) fates.push(`The ${h.family.name} family's hut is washed out: they sleep outside for about ${yrs(pr.years)}, then rebuild.`);
      if (pr.sickIn != null && P.families.length) fates.push(`A sickness breaks out among ${famNames(P.families)} about ${yrs(Math.max(1, Math.round(pr.sickIn)))} after the flood.`);
      else if (P.families.length) fates.push('No sickness follows the flood.');
    }
    function rainForecast(t) {
      if (t?.kind !== 'area') return R.refuse('Point at the land.');
      const P = rainPlan(t);
      const gains = [], costs = [], out = { fates: [], later: [], troubles: [] };
      if (P.fire.cells || P.fire.huts.length) gains.push(`Puts out the fire in the ring${P.fire.huts.length ? `, and saves ${P.fire.huts.length === 1 ? 'the burning hut' : `${number(P.fire.huts.length)} burning huts`}` : ''}. The soaked ground will not catch again for a while.`);
      for (const d of P.droughts) gains.push(`Ends the drought around ${d.families.size ? famNames(d.families) : 'here'}.`);
      if (P.fresh.length) {
        // what the ripened crop is worth to them: a full harvest a sown field, in years of the family's eating
        const per = P.fresh.map((f) => f.fields.filter((fl) => fl.done && !fl.bare).length * S.build.fullHarvest() * N.BLESS_RIPE / Math.max(0.01, S.peopleApi.needOf(f)));
        const avg = per.reduce((a, b) => a + b, 0) / per.length;
        gains.push(`Waters the fields of ${famNames(P.fresh)}: the standing crop ripens at once, ready to bring in (about ${yrs(cal(avg))} of food for ${P.fresh.length === 1 ? 'the family' : 'each family'}), then the fields grow ${N.BLESS_YIELD} times as well for about ${yrs(cal(N.BLESS_YEARS))}.`);
      }
      if (P.bare.length) gains.push(S.peopleApi.season?.().name === 'winter'
        ? `It is winter: nothing grows in the fields of ${famNames(P.bare)} until spring. What they sow then grows ${N.BLESS_YIELD} times as well, if it is within about ${yrs(cal(N.BLESS_YEARS))}.`
        : `The fields of ${famNames(P.bare)} lie bare, not sown again yet: nothing to ripen, but what they sow next grows ${N.BLESS_YIELD} times as well for about ${yrs(cal(N.BLESS_YEARS))}.`);
      if (P.again.length) gains.push(`The fields of ${famNames(P.again)} were watered lately: no new harvest, but they keep growing well for about ${yrs(cal(N.BLESS_YEARS))} from now.`);
      if (P.dry) gains.push(`The dry grass here greens (${number(P.dry)} ${P.dry === 1 ? 'patch' : 'patches'}) for about ${yrs(N.GREEN_YEARS)}.`);
      if (P.top) gains.push(`The water here fills up a little: it rises one block${P.top.dry ? `, over ${number(P.top.dry)} cells of its lowest shore,` : ''} for about ${yrs(A().T.TOPUP_YEARS)}.`);
      for (const b of P.bands) out.fates.push(b.home ? `The band gathering for ${b.f.label} is caught in the downpour. They lose heart and go home: ${b.f.label} is off.` : `The band gathering for ${b.f.label} is caught in the downpour, shakes it off and goes on.`);
      for (const m of P.hungry) { out.fates.push(`${m.name} is fed, and no longer dies of hunger at ${S.mind.endOf(m).age}.`); troubleLines(m, out); }
      for (const p of P.fire.trapped) { out.fates.push(`${p.name} gets out of the burning hut alive. ${lifeAfter(p)}`); troubleLines(p, out); }
      if (!gains.length && !P.flood) gains.push(P.warn ? 'Rain on ground still wet from the last.' : P.fams.length ? 'Rain on their homes. Nothing here needed it.' : 'Rain falls on the land and the grass drinks it. Nothing else changes.');
      if (P.flood) floodLines(P.flood.plan, P.flood.roll, costs, out.fates);
      else if (P.warn) costs.push(`The ground is wet from your last rain here. Rain on it once more within about ${yrs(N.SOAK_YEARS)} and the low land by the water floods.`);
      if (P.out.length) costs.push(`${P.out.length === 1 ? `${P.out[0].name} is out in it and runs` : `${cap(number(P.out.length))} people out in it run`} for shelter.`);
      if (P.glad.length) costs.push(`Welcome rain: ${P.glad.length === 1 ? `${P.glad[0].name} is` : `${number(P.glad.length)} people are`} happier (+${N.RAIN_GLAD}) for about ${yrs(cal(N.RAIN_MOOD_YEARS))}.`);
      if (P.sad.length) costs.push(`Rain on them again, the third time in a short while: ${P.sad.length === 1 ? `${P.sad[0].name} is` : `${number(P.sad.length)} people are`} miserable (${N.RAIN_SOAKED}) for about ${yrs(cal(N.RAIN_MOOD_YEARS))}.`);
      if (P.sick.length) costs.push(`It does nothing for the sick (${names(P.sick)}).`);
      const w = R.describeWitness(BLESS_SEEN, t.x, t.z, P.r);
      costs.push(...w.costs);
      return { gains, costs: costs.length ? costs : ['Nothing.'], who: w.who, seenBy: w.seenBy, fates: out.fates, later: out.later, troubles: out.troubles, confirm: 'click', kind: 'area', flood: !!P.flood };
    }
    function rainAct(t) {
      if (t?.kind !== 'area') return { ok: false, text: 'Point at the land.' };
      const t0 = performance.now();
      const P = rainPlan(t), when = yearLabel(S.year), land = S.land;
      rainStats.acts++; rainStats.fams += P.fresh.length + P.bare.length + P.again.length; rainStats.fresh += P.fresh.length; rainStats.under += P.under.length;
      if (P.flood) rainStats.floods++; else if (P.warn) rainStats.warned++;
      const hungry = P.hungry.map((m) => ({ m, was: `die of hunger at ${S.mind.endOf(m).age}` }));
      // the standing crop ripens at once (a full harvest at least): food in their fields, theirs to cut and carry home
      // (people.js: a ripe crop is food found, and an empty store eats from it while the harvest comes in)
      for (const f of P.fresh) {
        for (const fl of f.fields) if (fl.done && !fl.bare) { fl.grow = 1; fl.crop = Math.max(fl.crop ?? 0, S.build.fullHarvest() * N.BLESS_RIPE); }
        S.peopleApi.foodFound?.(f);
      }
      for (const f of [...P.fresh, ...P.bare, ...P.again]) {
        watered.set(f, S.life + N.BLESS_YEARS);
        R.mod('yield', `nature:bless:${f.id}`, { mul: N.BLESS_YIELD, who: f, until: S.life + N.BLESS_YEARS, note: 'fields watered by your rain' });
      }
      for (const f of P.fams) {
        for (const m of f.members) R.story(m, `Rain fell out of a clear sky on the family's land in ${when}.`);
        for (const h of A().active()) if (h.families.has(f)) A().aid(h, f);
        const hh = A().hungerOf(f); if (hh) hh.aidedAll = true;
      }
      for (const d of P.droughts) { d.aidedAll = true; A().water.endDrought(d, 'ended'); }
      const trapped = [...P.fire.trapped];
      if (P.fire.cells || P.fire.huts.length) A().fire.douse(t.x, t.z, P.r);
      A().fire.wetten(t.x, t.z, P.r, N.RAIN_WET_S);
      // the dry grass greens (for GREEN_YEARS: then it is the dry land it was). Which cells is decided now; a big
      // rain greens thousands, so they are put down GREEN_PER_STEP a step (greenStep), the first at once
      const greened = [];
      for (let z = Math.floor(t.z - P.r); z <= Math.ceil(t.z + P.r); z++) for (let x = Math.floor(t.x - P.r); x <= Math.ceil(t.x + P.r); x++) {
        if (!land.inside(x, z) || Math.hypot(x + 0.5 - t.x, z + 0.5 - t.z) > P.r) continue;
        const i = land.ci(x, z);
        if (!land.wet[i] && land.gid[i] === B.GRASS_DRY && R.ctx.world.get(x, land.top[i], z) === B.GRASS_DRY) greened.push(x, z);
      }
      if (greened.length) { greens.push({ cells: greened, until: S.year + N.GREEN_YEARS }); greenQ.push(...greened); greenStep(); }
      rainStats.greened += greened.length / 2;
      // the water: a flood on soaked ground, else a top-up
      let flooded = false;
      if (P.flood) {
        used(`rainflood:${Math.round(t.x)},${Math.round(t.z)},${t.r}`);
        A().water.startFlood({ plan: P.flood.plan, years: P.flood.roll.years, sent: true, sickIn: P.flood.roll.sickIn });
        flooded = true;
      } else if (P.top) A().water.topUp(P.top, P.r, t.x, t.z);
      soaks.push({ x: t.x, z: t.z, r: P.r, year: S.year });
      // a war band caught in it
      const F = R.ask('fights:api');
      for (const b of P.bands) {
        used(`rainfight:${b.f.id}`);
        if (b.home && F?.active.includes(b.f)) F.callOff(b.f, { why: 'rain', text: `A downpour out of a clear sky soaked the band gathering for ${b.f.label}. They lost heart and went home: ${b.f.label} is off.` });
      }
      // everyone out in it runs for shelter; it is welcome, or miserable
      for (const p of P.out) { const d = R.data(p, 'nature', () => ({})); d.shelter = S.clockT + 6; p.go = null; p.work = null; }
      const k = ++rainSeq;
      if (P.glad.length) { const g = new Set(P.glad); R.mod('happy', `nature:rain-glad:${k}`, { add: N.RAIN_GLAD, who: (p) => g.has(p), until: S.life + N.RAIN_MOOD_YEARS, note: 'rain when it was needed' }); }
      if (P.sad.length) { const g = new Set(P.sad); R.mod('happy', `nature:rain-soaked:${k}`, { add: N.RAIN_SOAKED, who: (p) => g.has(p), until: S.life + N.RAIN_MOOD_YEARS, note: 'rain again and again' }); for (const p of P.sad) R.story(p, `Soaked again in ${when}, the third rain in no time.`); }
      for (const { m, was } of hungry) { if (m.dead) continue; R.fateChanged(m, was, `Rain fell on the family's fields in ${when}.`); A().trouble.save(m, 'bless-harvest', was, 'fed by your rain'); }
      for (const p of trapped) { if (p.dead) continue; R.fateChanged(p, `die in the burning hut at ${Math.floor(p.age)}`, `Rain put the fire out in ${when}.`); A().trouble.save(p, 'bless-harvest', `die in the burning hut at ${Math.floor(p.age)}`, 'pulled out of a burning hut with rain'); }
      // everything above happened at once under the ring; now the cloud lives on, falling as light rain and drifting
      // with the wind (sim/season.js: only what natural rain does), and the look follows it
      const cloud = { x: t.x, z: t.z, r: P.r, fall: N.RAIN_FALL_S, keep: N.RAIN_FALL_S + N.RAIN_DRY_S, until: S.clockT + N.RAIN_GAME_S, god: true };
      const c = R.ask('rainCloud', cloud) ?? Object.assign(cloud, { age: 0, standalone: true });
      fx().rain(c);
      rains.push(c);
      rainStats.maxMs = Math.max(rainStats.maxMs, performance.now() - t0);
      const what = [P.fire.cells || P.fire.huts.length ? 'the fire is out' : null, P.droughts.length ? 'the drought is over' : null, P.fresh.length ? `the fields of ${famNames(P.fresh)} are watered` : null, flooded ? 'the low land floods' : null, P.bands.some((b) => b.home) ? 'a war band went home' : null].filter(Boolean);
      return { ok: true, text: what.length ? `Rain fell: ${what.join(', ')}.` : 'Rain fell.', x: t.x, z: t.z, r: P.r };
    }
    R.power({ id: 'bless-harvest', witness: BLESS_SEEN, forecast: rainForecast, carryOut: rainAct });
    // out in the rain: to the hut door, or a huddle where they are
    R.on('activity', (p) => {
      const d = p.ext?.nature;
      if (!d?.shelter) return false;
      const until = d.shelter; d.shelter = 0;
      if (S.clockT > until) return false;
      const h = p.family?.home;
      if (h?.done && h.door) S.peopleApi.goTo(p, h.door.x, h.door.z, { speed: R.T.RUN, until: 6, doing: 'running in out of the rain', then: () => S.peopleApi.work(p, 'sit', 3, { doing: 'sheltering from the rain' }) });
      else S.peopleApi.work(p, 'sit', 3, { doing: 'huddled against the rain' });
      return true;
    });
    R.on('thoughts', (p) => {
      if (p.asleep || !rains.length) return null;
      for (let k = rains.length - 1; k >= 0; k--) if (S.clockT > rains[k].until) rains.splice(k, 1);
      if (!rains.some((w) => inRing(p.x, p.z, w, 1))) return null;
      return [[40, 'Rain! Out of a clear sky!'], [40, 'Inside, quick, before we are soaked.'], [30, 'Where did that cloud come from?']];
    });
    R.answer('rains', () => ({ falling: rainFx?.falling() ?? [], soaks: soaks.map((s) => ({ ...s })), topUps: A().water.topUps.length, stats: { ...rainStats } }));

    // ================= send sickness =================
    // nobody sees a sent sickness: the seam's `unseen` flag counts nobody and moves nobody's mind
    const SICK_SEEN = { unseen: true, report(seen, act) { S.alert('info', 'Nobody saw anything. To them it is only a sickness, as sicknesses come.', act.x, act.z); } };
    const sickTargets = (t) => peopleIn(t).filter((p) => { const d = p.ext?.hardship; return !d?.sick && !((d?.immuneUntil ?? -1) > S.life); });
    function sickPre(t, list) {
      const kind = keep('sick-kind', () => pick(A().sick.SICKNESS));
      const rolls = new Map(list.map((p) => [p, keep(`sick:${p.id}`, () => A().sick.rollSick(p))]));
      return { kind, rolls };
    }
    function sickForecast(t) {
      if (t?.kind !== 'person' && t?.kind !== 'area') return R.refuse('Point at a person, or the ground among people.');
      const list = sickTargets(t);
      if (!list.length) {
        const p = t.kind === 'person' ? t.entity : null, d = p?.ext?.hardship;
        const why = !p ? 'Nobody here can fall sick now: they are sick already, or came through a sickness lately and cannot catch one again yet.'
          : d?.sick ? `${p.name} is sick already.` : (d?.immuneUntil ?? -1) > S.life ? `${p.name} came through a sickness and cannot catch one again for about ${yrs(cal(d.immuneUntil - S.life))}.` : `${p.name} cannot fall sick now.`;
        return R.refuse(why);
      }
      const { kind, rolls } = sickPre(t, list);
      const fates = [], costs = [];
      for (const p of list) {
        const r = rolls.get(p);
        if (r.die) fates.push(`${p.name} falls sick with ${kind.label} and dies of it at ${Math.floor(p.age + r.dieIn)}, instead of ${S.mind.endOf(p).how === 'old age' ? `living to ${Math.floor(p.lifespan)}` : `at ${S.mind.endOf(p).age}`}.`);
        else fates.push(`${p.name} falls sick with ${kind.label} and is well again in about ${yrs(cal(r.len))}.`);
      }
      const die = list.filter((p) => rolls.get(p).die).length;
      costs.push(list.length === 1 ? `${list[0].name} falls sick${die ? ' and dies of it' : ', and lives'}. The sick work at less than half strength.`
        : `${cap(number(list.length))} fall sick${die ? `; ${number(die)} of them ${die === 1 ? 'dies' : 'die'}` : ', and all of them live'}. The sick work at less than half strength.`);
      costs.push('Then it spreads as any sickness does: to the hut, and to anyone working close by. Who else catches it is not yet decided.');
      return { gains: ['Nothing anyone needs.'], costs, who: 'Nobody can tell a sent sickness from any other: nobody sees anything, and nobody\'s faith changes.', seenBy: 0, fates, confirm: 'hold', kind: t.kind, name: t.entity?.name };
    }
    function sickAct(t) {
      const list = sickTargets(t);
      if (!list.length) return { ok: false, text: 'Nobody here can fall sick now.' };
      const { kind, rolls } = sickPre(t, list);
      const h = A().sick.start({ person: list[0], more: list.slice(1), sent: true, pre: rolls, kind });
      used('sick-kind'); for (const p of list) used(`sick:${p.id}`);
      if (!h) return { ok: false, text: 'The sickness did not take.' };
      return { ok: true, text: `${names(list)} ${list.length === 1 ? 'falls' : 'fall'} sick with ${kind.label}.`, x: t.x, z: t.z, r: 0 };
    }
    R.power({ id: 'send-sickness', witness: SICK_SEEN, forecast: sickForecast, carryOut: sickAct });

    // ================= send fire =================
    const FIRE_SEEN = { faith: N.FIRE_FAITH, doubt: N.FIRE_DOUBT, happy: N.FIRE_HAPPY, early: 1, hooks: false, dread: N.FIRE_DREAD,
      what: 'fire fall out of a clear sky', thought: 'Fire fell out of a clear sky. Something up there is angry.', story: 'Saw fire fall out of a clear sky. Has been uneasy since.' };
    function firePre(t, wb) {
      const m = new Map();
      for (const h of wb.huts) for (const p of S.people) if (!p.dead && p.inside === h) m.set(p, keep(`trap:${p.id}`, () => Math.random() < Math.min(0.9, A().T.FIRE_TRAP * R.value('death', p))));
      return m;
    }
    function fireForecast(t) {
      if (t?.kind !== 'area') return R.refuse('Point at the ground.');
      const r = t.r ?? 1, wb = A().fire.whatBurns(t.x, t.z, r);
      if (!wb.cells && !wb.huts.size) {
        const w = A().fire.wetAt(t.x, t.z);
        return R.refuse(w ? `The ground here is soaked from your rain: nothing will catch until it dries, in about ${number(Math.max(1, Math.ceil((w.until - S.clockT) / Math.max(1, R.ctx.clock.speed || 1))))} seconds.` : 'Nothing here will burn: water or bare ground.');
      }
      const rolls = firePre(t, wb);
      const costs = [], fates = [], gains = ['Nothing anyone needs.'];
      for (const h of wb.huts) {
        const inside = [...rolls.keys()].filter((p) => p.inside === h);
        const trapped = inside.filter((p) => rolls.get(p)), out = inside.filter((p) => !rolls.get(p));
        costs.push(`${h.family ? `The ${h.family.name} family's hut` : 'An empty hut'} burns down${h.family ? '; they sleep outside until they rebuild it' : ''}.`);
        for (const p of trapped) fates.push(`${p.name} is trapped inside and dies in the fire, at ${Math.floor(p.age)}.`);
        if (out.length) fates.push(`${names(out)} ${out.length === 1 ? 'gets' : 'get'} out in time.`);
        if (h.family && !inside.length) fates.push(`Nobody is inside the ${h.family.name} hut.`);
      }
      for (const fl of wb.fields) costs.push(`${fl.family ? `The ${fl.family.name} family's field` : 'An abandoned field'} burns: no food from it for about ${yrs(cal(A().T.FIELD_REGROW))}.`);
      if (wb.trees) costs.push(`${cap(number(wb.trees))} ${wb.trees === 1 ? 'tree burns' : 'trees burn'} to a stump.`);
      costs.push('From there it spreads by what lies around: trees, thatch and dry grass carry it; water and bare ground stop it. How far it goes is not yet decided. Anyone close by runs, and some may be burned.');
      const w = R.describeWitness(FIRE_SEEN, t.x, t.z, r);
      costs.push(...w.costs);
      return { gains, costs, who: w.who, seenBy: w.seenBy, fates, confirm: 'hold', kind: 'area' };
    }
    function fireAct(t) {
      if (t?.kind !== 'area') return { ok: false, text: 'Point at the ground.' };
      const r = t.r ?? 1, wb = A().fire.whatBurns(t.x, t.z, r);
      if (!wb.cells && !wb.huts.size) return { ok: false, text: 'Nothing here will burn.' };
      const rolls = firePre(t, wb);
      R.bolt(t.x, (S.land.topAt(Math.floor(t.x), Math.floor(t.z)) ?? 15) + 1, t.z);
      const h = A().fire.start({ x: t.x, z: t.z, r, sent: true, cause: 'the sky', pre: rolls });
      for (const p of rolls.keys()) used(`trap:${p.id}`);
      if (!h) return { ok: false, text: 'Nothing caught.' };
      return { ok: true, text: 'Fire fell from the sky.', x: t.x, z: t.z, r };
    }
    R.power({ id: 'send-fire', witness: FIRE_SEEN, forecast: fireForecast, carryOut: fireAct });

    // ================= send flood =================
    const FLOOD_SEEN = { faith: N.FLOOD_FAITH, doubt: N.FLOOD_DOUBT, happy: N.FLOOD_HAPPY, early: 1, hooks: false,
      what: 'the water rise out of a clear sky', thought: 'The lake is rising and it has not rained. How?', story: 'Saw the water rise with no rain.' };
    function floodPre(t) {
      return keep(`flood:${Math.round(t.x)},${Math.round(t.z)},${t.r}`, () => {
        const years = Math.round(A().T.FLOOD_YEARS[0] + Math.random() * (A().T.FLOOD_YEARS[1] - A().T.FLOOD_YEARS[0]));
        return { years, sickIn: Math.random() < A().T.FLOOD_SICK ? 1 + Math.random() * Math.max(1, years * 0.6 - 1) : null };
      });
    }
    function floodForecast(t) {
      if (t?.kind !== 'area') return R.refuse('Point at a shore.');
      const P = A().water.planFlood(t.x, t.z, t.r ?? 8);
      if (!P || P.dry < 6) return R.refuse('No water near enough to rise over low land here. Point at a shore.');
      const pr = floodPre(t);
      const costs = [`The water rises ${number(A().T.FLOOD_RISE)} blocks over ${P.dry} cells of low land, for about ${yrs(pr.years)}.`];
      const fates = [];
      const byFam = new Map();
      for (const [fl, n] of P.fields) if (fl.family && n >= 4) byFam.set(fl.family, (byFam.get(fl.family) ?? 0) + 1);
      for (const [f, k] of byFam) {
        const left = Math.max(0, f.fields.length - k);
        costs.push(`${k === 1 ? 'A field' : `${cap(number(k))} fields`} of the ${f.name} family ${k === 1 ? 'goes' : 'go'} under: ${left ? 'less' : 'no'} food from ${left ? 'their fields' : 'them'} until it falls. They have about ${yrs(Math.max(0, cal(f.food / Math.max(0.1, S.peopleApi.needOf(f)))))} of food in store.`);
      }
      for (const h of P.huts) if (h.family) fates.push(`The ${h.family.name} family's hut is washed out: they sleep outside for about ${yrs(pr.years)}, then rebuild.`);
      if (pr.sickIn != null && P.families.length) fates.push(`A sickness breaks out among ${famNames(P.families)} about ${yrs(Math.max(1, Math.round(pr.sickIn)))} after.`);
      else if (P.families.length) fates.push('No sickness follows it.');
      const w = R.describeWitness(FLOOD_SEEN, P.x, P.z, t.r ?? 8);
      costs.push(...w.costs);
      return { gains: ['Nothing anyone needs.'], costs, who: w.who, seenBy: w.seenBy, fates, confirm: 'hold', kind: 'area' };
    }
    function floodAct(t) {
      if (t?.kind !== 'area') return { ok: false, text: 'Point at a shore.' };
      const P = A().water.planFlood(t.x, t.z, t.r ?? 8);
      if (!P || P.dry < 6) return { ok: false, text: 'No water near enough to rise.' };
      const pr = floodPre(t);
      used(`flood:${Math.round(t.x)},${Math.round(t.z)},${t.r}`);
      A().water.startFlood({ plan: P, years: pr.years, sent: true, sickIn: pr.sickIn });
      return { ok: true, text: 'The water began to rise.', x: P.x, z: P.z, r: t.r ?? 8 };
    }
    R.power({ id: 'send-flood', witness: FLOOD_SEEN, forecast: floodForecast, carryOut: floodAct });
  },
};
