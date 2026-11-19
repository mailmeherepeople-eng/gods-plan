// Foresight (the all-knowing god's warnings). The director: "notifications should tell the exact time something
// will happen ... people should have chance to act on it. since we are omniscient, we should have ample time."
//
// Every EVAL_S game seconds this looks ahead with the simulation's own fate and forecast machinery and keeps one
// record per bad thing it can foresee: who, where, why, when (calendar years for slow things, game seconds for
// fast ones), and what the god could do about it (each option checked with that power's own forecast, so it
// says only what would really work, and who would see it). When the thing lands, it says what happened, why, and
// what would have prevented it; when it stops being foreseen (the god acted, or luck), it is withdrawn with the
// reason. Nothing here changes the simulation: it only reads (queries, hooks, the hardships' own functions).
//
// Kinds (key prefix, clock):
//   hunger:<family>   food running out, then the first death by hunger            years (life clock / LIFE_RATE)
//   leave:<family>    a settled family giving up and leaving                        years
//   death:<person>    a death by sickness, wounds, fire, a wolf or a fight          years (sickness) or seconds
//   mother:<child>    a young child's mother fated to die (old age) before they are 6   years
//   line:<family>     a household whose line ends: nobody left, no child to come    years
//   thinker           the last person thinking toward a discovery dies              years
//   wolf:come         a wolf comes out of the mist                                  years (S.predNext)
//   raid:<a>><b>      a raid or skirmish waiting for the dawn, gathering, marching  seconds
//   grudge:<a>><b>    a grudge reaching raiding pitch                               years
//   fire:<hut>        a fire burning toward a home                                  seconds (expected pace)
//   flood:<id>        water rising over huts; flood-sick:<id> the sickness after     seconds / years
//   drought:<id>      a drought over the fields (a village's water drying)          years (until it ends)
//
// Queries: foresight() the live list (views), foresightNow() { year, clock }, foresightLog() what landed or
// was withdrawn, foresightAccuracy() stated time against what happened, by kind; foresightLevel(level?) the
// difficulty (generous, standard, scant); foresight:dev the console set-ups that make each kind happen.
// Signals (seam hooks and bus): foresight:new, foresight:update, foresight:withdrawn, foresight:landed.
import { SUGGEST_R } from './rain-size.js';
let hardshipApi = () => null;
try { ({ hardshipApi } = await import('./hardship.js')); } catch { /* the hardships are not loaded: fewer kinds */ }

// ---------------- every number of the foresight, in one place ----------------
// Console: sim.tune('foresight'), sim.tune('foresight', 'LEVEL', 'scant').
export const TUNE_FORESIGHT = {
  LEVEL: 'generous',     // the difficulty "Foresight": generous (default), standard, scant
  // how far ahead a warning is shown at all, before the level's multiplier: calendar years for the slow kinds,
  // game seconds for the fast ones. Generous shows a thing as soon as the simulation can see it within these.
  HORIZON_YEARS: { hunger: 40, leave: 40, death: 40, mother: 40, line: 80, thinker: 60, wolf: 30, grudge: 40, floodSick: 40, drought: 60,
    great: 40, blessed: 40, chief: 5, peace: 40 }, // the three forces (2026-11-13): a great person's death, a blessing fading, a chief, families leaving for peace
  HORIZON_SECS: { death: 120, raid: 150, fire: 150, flood: 30 },
  LEVELS: {
    generous: { mul: 1, label: 'Generous', words: 'Warnings come as early as the world can be read. Plenty of time to act.' },
    standard: { mul: 0.4, label: 'Standard', words: 'Warnings come with enough time to act, if you go at once.' },
    scant: { mul: 0.15, label: 'Scant', words: 'Warnings come late. You will often be too late.' },
  },
  EVAL_S: 0.5,           // game seconds between two looks ahead
  OPTIONS_S: 3,          // real seconds between two checks of what the god could do (forecasts are not free)
  GRACE_S: { hunger: 20, leave: 10, thinker: 20, grudge: 10, line: 10, default: 2 }, // game seconds a thing must stay unforeseen before it counts as withdrawn (no flicker)
  MOVED: 0.25,           // a stated time that moves by this share of the time LAST ANNOUNCED (and at least a year or 3 s) is "updated"
  MOVED_MIN_YEARS: 3,    // ... and at least this many years, for a warning told in years
  UPDATE_GAP_YEARS: 5,   // one warning is re-announced at most once in this many calendar years, unless its outcome worsens
  DORMANT_S: 40,        // game seconds a warning that simply stopped being foreseen (no act, no death, nobody left) waits
                         // quietly before it is announced withdrawn; if it comes back meanwhile it is picked up silently
                         // (the Log noise of 2026-11-13: a family's store falling between harvests and rising after each)
  FIRE_FRONT: 0.15,     // a fire's front reaches a hut in this share of the one-column-at-a-time time (measured)
  FOOD_WINDOW: 1.6,      // life years of a family's store kept to measure how fast it falls
  FOOD_MIN_SPAN: 0.6,    // ... and at least this span before the trend is trusted
  NEW_FIELD_GRACE: 1.5,  // a family whose first field is being made is given this many life years of store before a warning
  ACT_MEMORY_S: 30,      // real seconds a god's act is remembered, to say "you did this" when a warning is withdrawn
  LOG_MAX: 300,
};

const SEV_RANK = { bad: 3, warn: 2, info: 1 };
const POWER_WORDS = { 'bless-harvest': 'You brought rain on their fields', heal: 'You healed', strike: 'You struck', calm: 'You calmed them', provoke: 'You stirred them up', 'bless-weapons': 'You blessed their weapons', 'send-fire': 'Your fire', 'send-flood': 'Your flood', 'send-sickness': 'Your sickness', whisper: 'Your whisper', 'give-thought': 'Your thought', animal: 'You put an animal there', deer: 'You put a deer by them', river: 'You dug a river', lake: 'You filled a lake', water: 'You brought water' };

export default {
  id: 'foresight',
  tune: TUNE_FORESIGHT,
  init(R) {
    const { S } = R, F = TUNE_FORESIGHT;
    const T1 = R.T;
    const H = () => hardshipApi();
    const LR = () => T1.LIFE_RATE;
    const cap = R.cap1, num = R.number, yl = R.yearLabel;
    const live = new Map();     // key -> record
    const log = [];             // landed and withdrawn records (newest last)
    const acc = [];             // accuracy: { kind, key, stated, actual, err, lead, scale }
    const acts = [];            // recent god acts { kind, x, z, r, at (real ms), year, seenBy, power }
    const famHist = new Map();  // family -> [[life, food]]
    const grudgeHist = new Map(); // ledger key -> [[year, g]]
    const fireTrack = new Map();  // hut "x,z" -> { t (walking clock), d } when a fire was first seen near it
    let evalT = 0, optT = 0, optClock = 0, seq = 0;
    const quiet = () => !!S.skipAlerts; // a skip ahead: keep the books, send nothing to the screen
    const signal = (name, payload) => { if (quiet()) { R.run(name, payload); return; } R.signal(name, payload); };
    const nowReal = () => S.now();
    const level = () => F.LEVELS[F.LEVEL] ?? F.LEVELS.generous;
    const horizonY = (k) => (F.HORIZON_YEARS[k] ?? 40) * level().mul;
    const horizonS = (k) => (F.HORIZON_SECS[k] ?? 60) * Math.max(0.25, level().mul);
    const alive = (p) => p && !p.dead;
    const famName = (f) => `the ${f.name} family`;
    const he = (p) => (p.sex === 'f' ? 'she' : 'he');
    const his = (p) => (p.sex === 'f' ? 'her' : 'his');
    const him = (p) => (p.sex === 'f' ? 'her' : 'him');
    const yrs = (y) => { const n = Math.max(1, Math.round(y)); return `${num(n)} ${n === 1 ? 'year' : 'years'}`; };
    const secsW = (s) => { const n = Math.max(1, Math.round(s)); return `${n} ${n === 1 ? 'second' : 'seconds'}`; };
    const home = (f) => (f?.home ? { x: f.home.cx + 0.5, z: f.home.cz + 0.5 } : null);
    const where = (f, p) => home(f) ?? (p ? { x: p.x, z: p.z } : { x: S.stone.centre.x, z: S.stone.centre.z });
    const youngest = (list) => list.reduce((a, b) => (a.age <= b.age ? a : b));
    const names = (l) => (l.length <= 2 ? l.map((p) => p.name).join(' and ') : `${l.slice(0, 2).map((p) => p.name).join(', ')} and ${num(l.length - 2)} more`);

    // ---------- when a person dies, by the simulation's own fate ----------
    // { how, life? (life years left) | secs? (game seconds left), words, where? }, from the very sources the
    // simulation acts on: the rolled sickness, the hunger pace, the burning hut, the wolf's rolled hunt, the fight's plan.
    function wolfOn(p) { return S.predators.find((a) => !a.dead && a.prey === p && (a.state === 'stalk' || a.state === 'sprint')) ?? null; }
    // the wolf's own path (it winds round water and steep ground), at its stalking pace, then the sprint, which
    // closes only as fast as the wolf outruns its prey; a rough figure, corrected each look as the hunt goes on
    function wolfSecs(a, p) {
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      let len = d * 1.25;
      if (a.path?.length && a.pi != null) {
        len = 0; let x = a.x, z = a.z;
        for (let k = a.pi; k < a.path.length; k++) { len += Math.hypot(a.path[k][0] - x, a.path[k][1] - z); x = a.path[k][0]; z = a.path[k][1]; }
        len += Math.hypot(p.x - x, p.z - z) * 0.5;
      }
      const preyV = p.moving ? (p.go?.speed ?? T1.WALK) : 0;
      const sprint = Math.max(0, Math.min(d, T1.PRED_SPRINT_AT) - 0.95) / Math.max(0.8, T1.PRED_SPRINT - preyV);
      return a.state === 'sprint' ? sprint : Math.max(0, len - T1.PRED_SPRINT_AT) / T1.PRED_STALK + sprint;
    }
    function fightOf(p) {
      const A = R.ask('fights:api');
      if (!A) return null;
      const r = A.roles.get(p);
      if (!r || !r.fight.plan) return null;
      const f = r.fight;
      if (f.phase === 'clash') { const ev = f.events.slice(f.ei).find((e) => e.ref === p && e.kind === 'death'); return ev ? { f, secs: Math.max(0, ev.at - f.t) } : null; }
      if (f.phase !== 'gather' && f.phase !== 'march') return null;
      const ev = f.plan.events.find((e) => e.ref === p && e.kind === 'death');
      if (!ev) return null;
      return { f, secs: toClash(f) + (ev.round + 0.72) * (A.T.ROUND_S ?? 1.7) };
    }
    function toClash(f) {
      const A = R.ask('fights:api');
      const T = A?.T ?? { GATHER_S: 7, MARCH_MAX_S: 45, CLASH_R: 8 };
      const band = f.attackers.filter(alive);
      const d = band.length ? band.reduce((s, p) => s + Math.hypot(p.x - f.target.x, p.z - f.target.z), 0) / band.length : 0;
      const march = Math.min(T.MARCH_MAX_S, Math.max(0, d - T.CLASH_R - 2) / (T1.WALK * 1.15) * 1.2);
      return f.phase === 'gather' ? Math.max(0, T.GATHER_S - f.t) + march : Math.min(Math.max(0, T.MARCH_MAX_S - f.t), march);
    }
    function deathOf(p) {
      if (!alive(p)) return null;
      const e = S.mind.endOf(p);
      const h = H(), d = p.ext?.hardship;
      if (e.how === 'wolf' && e.wolf) return { how: 'wolf', secs: wolfSecs(e.wolf, p), wolf: e.wolf, words: 'taken by a wolf' };
      if (e.how === 'fire' && d?.trapped && h) { const st = h.fire.huts.get(d.trapped.hut); if (st) return { how: 'fire', secs: Math.max(0, h.T.HUT_BURN_S - st.t), hut: d.trapped.hut, words: 'in the burning hut' }; }
      if (e.how === 'fight') { const fo = fightOf(p); if (fo) return { how: 'fight', secs: fo.secs, fight: fo.f, words: `in ${fo.f.label}` }; }
      if (e.how === 'sickness' && d?.sick?.die) return { how: 'sickness', life: d.sick.dieAt - S.life, words: `of ${d.sick.label}`, sick: d.sick };
      if (e.how === 'wounds' && d?.wound?.die) return { how: 'wounds', life: d.wound.dieAt - S.life, words: d.wound.cause === 'fire' ? 'of the burns' : 'of the bad bite' };
      if (e.how === 'hunger' && h) { const l = h.hungerLeft(p); if (Number.isFinite(l)) return { how: 'hunger', life: l, words: 'of hunger' }; }
      if (e.how === 'old age') return { how: 'old age', life: Math.max(0, p.lifespan - p.age), words: 'of old age' };
      // another subsystem's end: its age is all we know
      return { how: e.how, life: Math.max(0, e.age + 1 - p.age), words: e.words ?? e.how, rough: true };
    }
    const deathYears = (dd) => (dd.secs != null ? dd.secs / Math.max(1e-6, R.ctx.clock.secondsPerYear) : dd.life / LR());

    // ---------- the god's options, each checked with its own forecast ----------
    // An option: { power (a power id or a land tool id), label, target, works(forecast) }. The screen names the key.
    const area = (x, z, r) => ({ kind: 'area', x, z, r });
    const optRain = (f, label) => { const at = where(f); return { power: 'bless-harvest', label: label ?? `Bring rain on ${famName(f)}'s fields`, target: area(at.x, at.z, SUGGEST_R), works: (fc) => fc.ok && [...fc.gains, ...fc.fates].some((t) => t.includes(f.name) || t.includes('is fed')) }; };
    const optHeal = (p) => ({ power: 'heal', label: `Heal ${p.name}`, target: { kind: 'person', entity: p, x: p.x, z: p.z }, works: (fc) => fc.ok });
    const optStrikeWolf = (w, p) => ({ power: 'strike', label: `Strike down the wolf on ${p.name}`, target: { kind: 'animal', entity: w, x: w.x, z: w.z }, works: (fc) => fc.ok });
    const optCalm = (p, what) => ({ power: 'calm', label: what ?? `Calm ${p.name}'s clan`, target: { kind: 'person', entity: p, x: p.x, z: p.z }, works: (fc) => fc.ok });
    const optStrikeLeader = (p) => ({ power: 'strike', label: `Strike down ${p.name}, who leads it`, target: { kind: 'person', entity: p, x: p.x, z: p.z }, works: (fc) => fc.ok, harsh: true });
    const optBless = (p) => ({ power: 'bless-weapons', label: `Bless the weapons of ${p.name}'s side`, target: { kind: 'person', entity: p, x: p.x, z: p.z }, works: (fc) => fc.ok });
    const optRainFire = (x, z, label) => ({ power: 'bless-harvest', label, target: area(x, z, SUGGEST_R), works: (fc) => fc.ok && fc.gains.some((g) => /fire/.test(g)) });
    const optLand = (tool, label, x, z) => ({ power: tool, label, target: area(x, z, 6), land: true, works: () => true });
    // a deer by a hungry family's door: they hunt it (the Animals tool: sim.spawnAnimal('deer', x, z); hunting.js says
    // where it can stand and whether it would feed them). The target is re-chosen at each check: the least watched spot
    const optDeer = (f) => ({ power: 'deer', via: 'sim.spawnAnimal', tool: 'animals', label: `Put a deer by ${famName(f)}'s door: they will hunt it`, deer: f,
      target: (() => { const s = R.ask('deerSpot', f); return s ? area(s.x, s.z, 0) : null; })() });
    function evalOption(o) {
      if (o.deer) {
        const f = o.deer, s = R.ask('deerSpot', f), feeds = R.ask('deerFeeds', f) ?? { works: false };
        if (s) o.target = area(s.x, s.z, 0);
        const seenBy = s?.seenBy ?? 0;
        const who = !s ? 'There is nowhere near their door a deer could stand.' : !feeds.works ? feeds.why
          : `${feeds.hunter.name} goes after it: about ${Math.round(feeds.hit * 100)} in 100 throws kill it, and a deer is about ${feeds.meat} years of one grown-up's eating. ${seenBy ? `${seenBy === 1 ? 'One person' : `${cap(num(seenBy))} people`} would see it appear.` : 'Nobody would see it appear: to them it just walked up.'}`;
        return { works: !!s && feeds.works, seenBy, who, early: null, ok: !!s, year: S.year };
      }
      const fc = R.forecast(o.power, o.target) ?? {};
      const works = !!(o.land ? true : o.works?.(fc));
      const early = (fc.costs ?? []).find((c) => /expect help/.test(c)) ?? null;
      return { works, seenBy: Number(fc.seenBy) || 0, who: fc.who ?? '', early, ok: fc.ok !== false, year: S.year };
    }
    function refreshOptions(rec) {
      for (const o of rec.options) {
        let ev;
        try { ev = evalOption(o); } catch { ev = { works: false, seenBy: 0, who: '', early: null, ok: false, year: S.year }; }
        o.now = ev;
        if (ev.works) {
          o.everWorked = true;
          if (o.best == null || ev.seenBy < o.best.seenBy) o.best = ev;   // the least seen moment it would have worked
          o.last = ev;
        }
      }
    }

    // ---------- the looks ahead ----------
    // each returns predictions: { key, kind, sev, scale: 'years'|'secs', in (years or game seconds), family?, people,
    //   subject, x, z, title, text, cause: [lines], options: [option], nothing (the do-nothing line), event }
    const out = [];
    const put = (pr) => { out.push(pr); return pr; };

    // food running out, then hunger (one record per family: the store, then the starving)
    // (the store and the crop standing in their fields together: food comes home in harvest lumps, and the crop is
    // what the next harvest will bring, so the two together run as smoothly as the store ran when fields fed it daily)
    const stockOf = (f) => f.food + (S.peopleApi.cropOf?.(f) ?? 0);
    function foodTrend(f) {
      const hist = famHist.get(f) ?? (famHist.set(f, []), famHist.get(f));
      hist.push([S.life, stockOf(f)]);
      while (hist.length > 2 && S.life - hist[0][0] > F.FOOD_WINDOW) hist.shift();
      if (hist.length < 3 || S.life - hist[0][0] < F.FOOD_MIN_SPAN) return null;
      // least squares slope, life years
      const n = hist.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [x, y] of hist) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const den = n * sxx - sx * sx;
      return den > 1e-9 ? (n * sxy - sx * sy) / den : null;
    }
    function foodCauses(f) {
      const c = [];
      const done = f.fields.filter((fl) => fl.done);
      if (!done.length) c.push(f.fields.length || f.plans.some((b) => b.kind === 'field') ? 'Their first field is not sown yet.' : f.noFieldSaid ? 'There is no flat grass near their hut for a field.' : 'They have no field yet, and live on berries.');
      else {
        // the season: winter (nothing grows, the standing crop perishes), or fields lying bare
        if (S.peopleApi.season?.().name === 'winter') c.push('It is winter: nothing grows, and what is left standing in the fields perishes. They live on their store until spring.');
        else if (done.every((fl) => fl.bare)) c.push(`Their ${done.length === 1 ? 'field lies' : 'fields lie'} bare, not sown again yet.`);
        const care = done.reduce((s, fl) => s + fl.care, 0) / done.length;
        if (care < 0.45) c.push(`Their ${done.length === 1 ? 'field is' : 'fields are'} poorly tended (care ${Math.round(care * 100)} percent).`);
        const mouths = f.members.filter(alive).length;
        if (done.length * T1.PEOPLE_PER_FIELD < mouths) c.push(`${cap(num(mouths))} mouths and only ${num(done.length)} ${done.length === 1 ? 'field' : 'fields'}.`);
      }
      for (const m of R.mods('yield', f)) if (m.mul < 1 && m.note) c.push(`Their food is cut: ${m.note}.`);
      const h = H();
      const dr = h?.water?.droughtOf?.(f);
      if (dr && !c.some((t) => /drought/.test(t))) c.push(`A drought lies on their fields until about ${yl(dr.until)}.`);
      if (f.members.some((m) => m.expectsHelp)) c.push('Some of them wait for the stone and work at half strength.');
      if (f.members.some((m) => m.ext?.hardship?.sick)) c.push('Sickness keeps some of them from work.');
      return c;
    }
    function hungerLook(f) {
      if (f.state !== 'settled' || !f.members.some(alive)) return;
      const h = H(), members = f.members.filter(alive), need = Math.max(0.01, S.peopleApi.needOf(f));
      const at = where(f, members[0]);
      // already starving: the hardships' own pace (H.hungerLeft) says who goes first and when
      const hungry = members.filter((m) => m.hunger > 0);
      let victim = null, life = Infinity, phase = 'store';
      if (hungry.length && (S.peopleApi.hungerRate?.(f) ?? f.shortRate) > 0 && h) {
        for (const m of members) { const l = h.hungerLeft(m); if (l < life) { life = l; victim = m; } }
        phase = 'starving';
      }
      if (!victim) {
        const slope = foodTrend(f);
        if (slope == null || slope >= -0.02) return;
        const cap0 = need * R.value('store', f, T1.STORE_MAX_YEARS);
        if (f.food >= cap0 * 0.98) return;            // full store: the harvest spills over
        // a first field on its way: give it time
        const making = !f.fields.some((fl) => fl.done) && f.plans.some((b) => b.kind === 'field');
        if (making && f.food / need > F.NEW_FIELD_GRACE) return;
        const empty = stockOf(f) / -slope;                // life years until the store (and the crop in the field) is gone
        const short = Math.min(1, -slope / need);          // the share of the eating that will not be met
        const rate = (short - 0.25) * 2;                   // people.js: a small shortfall is borne
        if (rate <= 0) return;
        for (const m of members) { const l = empty + (m.starveAt - m.hunger) / rate; if (l < life || (Math.abs(l - life) < 0.05 && m.age < victim.age)) { life = l; victim = m; } }
        if (!victim) return;
        f.ext.foresight = f.ext.foresight ?? {};
        f.ext.foresight.empty = S.year + empty / LR();
      }
      // a deer the god put down is on its way to them (hunting.js: their watch sees or finds it, a hunter goes after it,
      // the meat comes home): no warning, so long as it comes before the first of them starves. If the hunt fails or the
      // deer wanders out of reach, the next look foresees the hunger again, as it really stands
      const coming = R.ask('deerComing', f);
      if (coming && life > coming.life * 1.1) return;
      const inY = life / LR();
      if (!(inY <= horizonY('hunger'))) return;
      const young = members.length > 1 && victim === youngest(members) ? `, the youngest,` : '';
      const emptyY = phase === 'store' ? (stockOf(f) / Math.max(1e-6, -(foodTrend(f) ?? -1e-6))) / LR() : 0;
      // who else starves, as the hunger plays forward (after each death the food is shared by fewer)
      const moreAfter = () => {
        const more = h ? members.filter((m) => m !== victim && Number.isFinite(h.hungerLeft(m)) && h.hungerLeft(m) / LR() <= horizonY('hunger')).length : 0;
        return more ? `, and ${num(more)} more after` : members.length > 1 ? '; the rest pull through on what is left' : '';
      };
      const title = phase === 'store' ?`${cap(famName(f))} runs out of food` : `${cap(famName(f))} is starving`;
      const text = phase === 'store'
        ? `${cap(famName(f))} has food for ${emptyY < 1.5 ? 'one more year' : `${yrs(emptyY)} more`}. Then they go hungry, and ${victim.name}${young} starves first, in ${yrs(inY)}.`
        : `${cap(famName(f))} has run out of food. ${victim.name}${young} dies of hunger in ${yrs(inY)}${moreAfter()}.`;
      put({ key: `hunger:${f.id}`, kind: 'hunger', sev: phase === 'starving' || inY < 8 ? 'bad' : 'warn', scale: 'years', in: inY, family: f, people: members, subject: victim, ...at,
        title, text, phase, cause: foodCauses(f), event: { type: 'death', who: victim, cause: 'hunger', family: f },
        options: [optDeer(f), optRain(f), ...(f.fields.some((fl) => fl.done) ? [] : [optLand('flatten', 'Flatten grass near their hut for a field', at.x + 6, at.z)])],
        nothing: `Do nothing: ${victim.name} starves in ${yrs(inY)}.` });
    }

    // a settled family giving up and leaving (people.js: average happiness under LEAVE_HAPPY for LEAVE_YEARS)
    function happyTerms(f) {
      // the reasons their happiness is low, in the words people.js would use when they go
      const m = f.members.filter(alive);
      const c = [];
      if (m.some((p) => p.hunger > 0)) c.push('too little food');
      else if (m.some((p) => (p.fear ?? 0) > 0.3 && (p.dread ?? 0) >= (p.wolfFear ?? 0) && (p.dread ?? 0) > 0.3)) c.push('they fear what strikes from the sky');
      else if (m.some((p) => (p.fear ?? 0) > 0.3)) c.push('they fear the wild animals');
      if (m.some((p) => p.grief > 0.4)) c.push('they are grieving');
      if (!f.home?.done) c.push('no home yet');
      const hh = home(f);
      if (hh && S.land.wdistAt(Math.floor(hh.x), Math.floor(hh.z)) > 16) c.push('the water is far');
      if (m.length > 6) c.push('the hut is crowded');
      if (m.some((p) => p.ext?.hardship?.sick)) c.push('sickness in the house');
      return c;
    }
    function leaveLook(f) {
      if (f.state !== 'settled') return;
      if (f.hungerPlan && f.members.some((m) => !m.dead && m.hungerFate)) return; // starving to a foretold end: they stay (people.js)
      const m = f.members.filter(alive);
      if (!m.length) return;
      const avg = m.reduce((s, p) => s + p.happy, 0) / m.length;
      let life;
      if (f.unhappy > 0 && avg < T1.LEAVE_HAPPY) life = T1.LEAVE_YEARS - f.unhappy;
      else {
        const tgt = m.reduce((s, p) => s + (p.happyTarget ?? p.happy), 0) / m.length;
        if (tgt >= T1.LEAVE_HAPPY - 0.5) return;
        // each moves HAPPY_RATE a life year toward their own target: when does the average fall under the line?
        let t = 0;
        const at = (t) => m.reduce((s, p) => { const g = p.happyTarget ?? p.happy; return s + (p.happy > g ? Math.max(g, p.happy - T1.HAPPY_RATE * t) : Math.min(g, p.happy + T1.HAPPY_RATE * t)); }, 0) / m.length;
        while (t < 12 && at(t) >= T1.LEAVE_HAPPY) t += 0.05;
        if (at(t) >= T1.LEAVE_HAPPY) return;
        life = t + T1.LEAVE_YEARS;
      }
      const inY = Math.max(0, life) / LR();
      if (!(inY <= horizonY('leave'))) return;
      const terms = happyTerms(f);
      const why = terms.length ? terms.join(', and ') : 'they are unhappy here';
      const at = where(f, m[0]);
      const options = [];
      if (terms.includes('too little food')) options.push(optDeer(f), optRain(f));
      const sick = m.find((p) => p.ext?.hardship?.sick || p.ext?.hardship?.wound);
      if (sick) options.push(optHeal(sick));
      const wolf = S.predators.find((w) => !w.dead && Math.hypot(w.x - at.x, w.z - at.z) < 60);
      if (wolf && terms.some((t) => /animals/.test(t))) options.push({ ...optStrikeWolf(wolf, m[0]), label: 'Strike down the wolf that frightens them' });
      if (terms.includes('the water is far')) options.push(optLand('river', 'Dig a river or fill a lake near their hut', at.x, at.z));
      if (!options.length) options.push(optRain(f, `Bring rain on their fields: food and good cheer`));
      put({ key: `leave:${f.id}`, kind: 'leave', sev: inY < 6 ? 'bad' : 'warn', scale: 'years', in: inY, family: f, people: m, subject: f.leader?.() ?? m[0], ...at,
        title: `${cap(famName(f))} will leave`, text: `${cap(famName(f))} will leave in ${yrs(inY)}: ${why}.`, cause: terms.map((t) => cap(t) + '.'),
        event: { type: 'leave', family: f }, options: options.slice(0, 3), nothing: `Do nothing: they leave in ${yrs(inY)}.` });
    }

    // deaths by sickness, wounds, fire, a wolf, a fight (hunger is the family's record above)
    function deathLook(p) {
      if (!alive(p) || p.family.state !== 'settled') return null;
      const dd = deathOf(p);
      if (!dd || dd.how === 'old age' || dd.how === 'hunger' || dd.rough) return dd;
      const inYears = deathYears(dd);
      if (dd.secs != null ? dd.secs > horizonS('death') : inYears > horizonY('death')) return dd;
      const f = p.family, at = { x: p.x, z: p.z };
      const options = [], cause = [];
      let title, text, sev = 'bad';
      const when = dd.secs != null ? `in ${secsW(dd.secs)}` : `in ${yrs(inYears)}`;
      if (dd.how === 'sickness') {
        title = `${p.name} will die of ${dd.sick.label}`;
        const catching = f.members.filter((q) => alive(q) && q !== p && !q.ext?.hardship?.sick && !((q.ext?.hardship?.immuneUntil ?? -1) > S.life));
        text = `${p.name} of ${famName(f)} has ${dd.sick.label} and dies of it ${when}.${catching.length ? ` It is catching: ${names(catching)} in ${his(p)} hut will likely have it within the year.` : ''}`;
        cause.push(`Fell sick with ${dd.sick.label}.`);
        options.push(optHeal(p));
      } else if (dd.how === 'wounds') {
        title = `${p.name} will die of ${his(p)} wounds`;
        text = `${p.name} of ${famName(f)} dies ${dd.words} ${when}, unless healed.`;
        const wd = p.ext?.hardship?.wound;
        cause.push(wd?.cause === 'fire' ? 'Was badly burned in a fire, and the burns went bad.' : wd?.cause === 'bite' ? 'A wolf’s bite went bad.' : 'A wound went bad.');
        options.push(optHeal(p));
      } else if (dd.how === 'fire') {
        title = `${p.name} is trapped in a burning hut`;
        text = `${p.name} is trapped in the burning hut of ${famName(f)}. It falls ${when}.`;
        cause.push(`The hut caught fire with ${him(p)} inside, and ${he(p)} could not get out.`);
        options.push(optRainFire(dd.hut.cx, dd.hut.cz, 'Bring rain on the fire'));
        Object.assign(at, { x: dd.hut.cx + 0.5, z: dd.hut.cz + 0.5 });
      } else if (dd.how === 'wolf') {
        title = `A wolf will kill ${p.name}`;
        text = `A wolf is stalking ${p.name} of ${famName(f)}. It kills ${him(p)} ${when}.`;
        cause.push(`${cap(he(p))} is outdoors and alone at the edge of things, and does not see it coming.`);
        options.push(optStrikeWolf(dd.wolf, p));
      } else if (dd.how === 'fight') {
        title = `${p.name} will die in ${dd.fight.label}`;
        text = `${p.name} of ${famName(f)} dies ${when}, in ${dd.fight.label}.`;
        cause.push(dd.fight.why ? cap(String(dd.fight.why)).replace(/\.?$/, '.') : 'A grudge boiled over.');
        const lead = dd.fight.leader && alive(dd.fight.leader) ? dd.fight.leader : dd.fight.attackers?.find(alive);
        if (lead) options.push(optCalm(lead, `Calm the ${lead.family.name} side before it starts`), optStrikeLeader(lead));
        if (dd.fight.defenders?.includes(p)) options.push(optBless(p));
      } else {
        title = `${p.name} will die`;
        text = `${p.name} of ${famName(f)} dies ${dd.words} ${when}.`;
      }
      // a great person: the clan's level in that force falls with them (forces-great.js)
      const fp = GA()?.fallPreview?.(p);
      if (fp) {
        title = title.replace(p.name, fp.great.title);
        const fall = fallWords(fp);
        cause.push(`${fp.great.title} is a great ${fp.great.kind}${fall ? `: when ${he(p)} dies, ${fall}` : ''}.`);
      }
      // a young child left without a mother: their own life is shortened (people.js motherless)
      const kids = p.sex === 'f' ? S.peopleApi.motherless(p) : [];
      for (const o of kids) cause.push(`${o.child.name}, ${Math.floor(o.child.age)}, grows up without ${his(p)} mother and dies at ${Math.floor(o.after)} instead of ${Math.floor(o.before)}.`);
      put({ key: `death:${p.id}`, kind: 'death', how: dd.how, sev, scale: dd.secs != null ? 'secs' : 'years', in: dd.secs != null ? dd.secs : inYears, family: f, people: [p], subject: p, ...at,
        title, text, cause, event: { type: 'death', who: p, cause: dd.how }, options: options.slice(0, 3),
        nothing: `Do nothing: ${p.name} dies ${when}.` });
      return dd;
    }
    // a young child's mother dying of old age before the child is 6 (other causes say it in their own card)
    function motherLook(p, dd) {
      if (!dd || dd.how !== 'old age' || p.sex !== 'f') return;
      const inY = dd.life / LR();
      if (inY > horizonY('mother')) return;
      for (const c of S.people) {
        if (!alive(c) || c.mother !== p || c.age + dd.life >= T1.MOTHERLESS_AGE) continue;
        const after = Math.max(Math.floor(c.age + dd.life) + 1.5, c.lifespan - c.motherlessCut);
        put({ key: `mother:${c.id}`, kind: 'mother', sev: 'warn', scale: 'years', in: inY, family: p.family, people: [p, c], subject: c, x: p.x, z: p.z,
          title: `${c.name} will lose ${his(c)} mother`, text: `${p.name}, ${c.name}'s mother, dies of old age in ${yrs(inY)}, when ${c.name} is only ${Math.max(1, Math.floor(c.age + dd.life))}. Growing up without her, ${c.name} dies at ${Math.floor(after)} instead of ${Math.floor(c.lifespan)}.`,
          cause: [`${p.name} is old: her years run out.`], event: { type: 'death', who: p, cause: 'old age' },
          options: [], nothing: 'Nothing you can do stops old age. You can only watch over the child.' });
      }
    }
    // a household whose line ends: no children, nobody to have them, everyone fated to die
    function lineLook(f) {
      if (f.state !== 'settled') return;
      const m = f.members.filter(alive);
      if (!m.length || m.some((p) => p.stage === 'child')) return;
      if (m.some((p) => S.mind.kidsDue(p) > 0)) return;
      if (m.some((p) => !p.partner && p.age < 45 && p.stage === 'adult')) return; // could still pair up
      // their children elsewhere carry the line on
      if (S.people.some((q) => alive(q) && q.family !== f && m.some((p) => q.mother === p || q.father === p))) return;
      let last = null, lastY = -1;
      for (const p of m) { const dd = deathOf(p); if (!dd) return; const y = deathYears(dd); if (y > lastY) { lastY = y; last = p; } }
      if (!(lastY <= horizonY('line'))) return;
      const at = where(f, m[0]);
      put({ key: `line:${f.id}`, kind: 'line', sev: 'info', scale: 'years', in: lastY, family: f, people: m, subject: last, ...at,
        title: `The ${f.name} line ends`, text: `The ${f.name} line ends in ${yrs(lastY)} with ${last.name}: no child is coming, and nobody is left to have one.`,
        cause: [m.length === 1 ? `${last.name} lives alone.` : `${names(m)} will have no more children.`], event: { type: 'line', family: f },
        options: [], nothing: 'There is no power to make a child. The land will just be a little quieter.' });
    }
    // the last thinker
    let thinkT = 0;
    let thinkers = [];
    function thinkerLook() {
      if (nowReal() - thinkT > 2000 || !thinkers.length) {
        thinkT = nowReal();
        thinkers = S.people.filter((p) => alive(p) && p.family.state === 'settled' && R.ask('thinking', p)?.thinking);
      }
      thinkers = thinkers.filter(alive);
      if (thinkers.length !== 1) return;
      const p = thinkers[0], dd = deathOf(p);
      if (!dd) return;
      const y = deathYears(dd);
      if (y > horizonY('thinker')) return;
      put({ key: 'thinker', kind: 'thinker', sev: 'warn', scale: 'years', in: y, family: p.family, people: [p], subject: p, x: p.x, z: p.z,
        title: `Your last thinker dies`, text: `${p.name} is the only one still thinking toward a discovery. ${cap(he(p))} dies ${dd.words} in ${yrs(y)}; then thinking stops.`,
        cause: ['Thinkers need skepticism: those who lean on you do not wonder.'], event: { type: 'death', who: p, cause: dd.how },
        options: dd.how === 'sickness' || dd.how === 'wounds' ? [optHeal(p)] : [], nothing: 'Do nothing: discoveries stop with them, until skepticism makes new thinkers.' });
    }
    // a wolf from the mist
    function wolfLook() {
      if (!S.started) return;
      const runYears = S.year - S.startYear;
      const eco = S.eco?.ownsWolves; // choices (ecology.js): wolves follow the deer, the next one's coming rolled ahead
      if (S.predNext == null || (!eco && (runYears >= T1.PRED_UNTIL || S.predNext - S.startYear >= T1.PRED_UNTIL))) return;
      if ((eco ? S.eco.residents().length > 0 : S.predators.filter(alive).length >= T1.PRED_MAX) || !S.families.some((f) => f.state === 'settled')) return;
      const inY = Math.max(0, S.predNext - S.year);
      if (inY > horizonY('wolf')) return;
      const c = S.stone.centre;
      put({ key: 'wolf:come', kind: 'wolf', sev: 'info', scale: 'years', in: inY, people: [], subject: null, x: null, z: null,
        title: 'A wolf is coming', text: `A wolf will come out of the mist in ${yrs(inY)}, looking for someone alone at the edge of things.`,
        cause: ['Wolves keep coming from the mist in the first years.'], event: { type: 'wolf' },
        options: [optLand('river', 'Water or steep ground round the huts keeps wolves out', c.x, c.z)], nothing: 'Do nothing: it hunts whoever strays furthest out.' });
    }
    // raids and skirmishes: waiting for the dawn, gathering, marching
    function raidLook() {
      const A = R.ask('fights:api'), C = R.ask('clans:api');
      if (!A || !C) return;
      const dayS = T1.DAY_SECONDS;
      const toDawn = () => { const d = S.dayT, [a, b] = A.T.START_DAY; return d >= a && d <= b ? 0 : ((a - d + 1) % 1) * dayS; };
      for (const q of A.pending) {
        const k = A.preview(q.a, q.b, q.forced ?? undefined);
        if (k !== 'raid' && k !== 'skirmish') continue;
        const secs = toDawn() + 2;
        if (secs > horizonS('raid')) continue;
        const lead = A.willing(q.a, A.T.JOIN_ATTACK)[0];
        const tgt = C.groupHouseholds(q.b)[0];
        const at = home(tgt) ?? (lead ? { x: lead.x, z: lead.z } : null);
        put({ key: `raid:${q.a.id}>${q.b.id}`, kind: 'raid', sev: 'warn', scale: 'secs', in: secs, people: lead ? [lead] : [], subject: lead ?? null, family: lead?.family ?? null, x: at?.x, z: at?.z,
          title: `${cap(C.groupName(q.a))} will ${k === 'raid' ? 'raid' : 'fight'} ${C.groupName(q.b)}`,
          text: `${cap(C.groupName(q.a))} will ${k === 'raid' ? 'raid' : 'fight'} ${C.groupName(q.b)} at the next dawn${secs > 3 ? `, in ${secsW(secs)}` : ''}. Who dies is rolled when they gather.`,
          cause: [C.why?.(q.a, q.b) ? cap(String(C.why(q.a, q.b))).replace(/\.?$/, '.') : 'An old grudge.'], event: { type: 'raid', a: q.a, b: q.b },
          options: lead ? [optCalm(lead, `Calm ${C.groupName(q.a)}`)] : [], nothing: 'Do nothing: they set out at dawn.' });
      }
      for (const f of A.active) {
        if (f.kind !== 'raid' && f.kind !== 'skirmish') continue;
        // the clash has begun: what was foretold has come
        if (f.phase === 'clash') { const r = live.get(`raid:${f.a.id}>${f.b.id}`); if (r) land(r, { what: `${cap(f.label)} came to blows.` }); continue; }
        if (f.phase !== 'gather' && f.phase !== 'march') continue;
        const secs = toClash(f);
        if (secs > horizonS('raid')) continue;
        const dead = (f.plan?.dead.flat() ?? []).filter(alive);
        const lead = f.leader && alive(f.leader) ? f.leader : f.attackers.find(alive);
        put({ key: `raid:${f.a.id}>${f.b.id}`, kind: 'raid', sev: dead.length ? 'bad' : 'warn', scale: 'secs', in: secs, people: [...f.attackers.filter(alive)], subject: lead ?? null, family: lead?.family ?? null, x: f.target?.x ?? f.x, z: f.target?.z ?? f.z,
          title: `${cap(f.label)}`, text: `${cap(f.label)}: they ${f.phase === 'gather' ? 'are gathering' : 'are marching'} and strike in ${secsW(secs)}. ${dead.length ? `${names(dead)} ${dead.length === 1 ? 'dies' : 'die'}.` : 'Nobody dies, as it stands.'}`,
          cause: [f.why ? cap(String(f.why)).replace(/\.?$/, '.') : 'An old grudge.'], event: { type: 'raid', a: f.a, b: f.b, fight: f },
          options: lead ? [optCalm(lead, `Calm ${C.groupName(f.a)} while they gather`), optStrikeLeader(lead), ...(f.defenders.find(alive) ? [optBless(f.defenders.find(alive))] : [])] : [],
          nothing: dead.length ? `Do nothing: ${names(dead)} ${dead.length === 1 ? 'dies' : 'die'} in ${secsW(secs)}.` : 'Do nothing: they clash, and the feud goes on.' });
      }
    }
    // a grudge reaching raiding pitch (fights.js RAID_AT); after that, a raid can come any year
    function grudgeLook() {
      const A = R.ask('fights:api'), C = R.ask('clans:api');
      if (!A || !C) return;
      const RAID = A.T.RAID_AT;
      const seen = new Set();
      for (const [k, e] of C.ledger) {
        seen.add(k);
        const hist = grudgeHist.get(k) ?? (grudgeHist.set(k, []), grudgeHist.get(k));
        if (!hist.length || S.year - hist[hist.length - 1][0] >= 0.5) hist.push([S.year, e.g]);
        while (hist.length > 2 && S.year - hist[0][0] > 12) hist.shift();
        if (e.g >= RAID || e.g < A.T.QUARREL_AT * 0.6 || hist.length < 3) continue;
        // a feud both ways is one warning: the angrier side's
        const back = C.ledger.get(`${e.b}>${e.a}`);
        if (back && (back.g > e.g || (back.g === e.g && e.a > e.b))) continue;
        const span = hist[hist.length - 1][0] - hist[0][0];
        if (span < 2) continue;
        const rate = (hist[hist.length - 1][1] - hist[0][1]) / span;
        if (rate <= 0.05) continue;
        const inY = (RAID - e.g) / rate;
        if (inY > horizonY('grudge')) continue;
        const a = C.groupOfId(e.a), b = C.groupOfId(e.b);
        if (!a || !b) continue;
        const m = C.groupMembers(a).find((p) => alive(p) && p.stage === 'adult');
        const hh = C.groupHouseholds(a)[0];
        const at = home(hh) ?? (m ? { x: m.x, z: m.z } : {});
        put({ key: `grudge:${e.a}>${e.b}`, kind: 'grudge', sev: 'warn', scale: 'years', in: inY, people: m ? [m] : [], subject: m ?? null, family: m?.family ?? null, ...at,
          title: `${cap(C.groupName(a))} will want blood`, text: `${cap(C.groupName(a))} ${a.type === 'clan' ? 'are' : 'is'} angry with ${C.groupName(b)} (${Math.round(e.g)} of 100). In ${yrs(inY)} it reaches raiding pitch; after that, a raid can come in any year.`,
          cause: [C.why?.(a, b) ? cap(String(C.why(a, b))).replace(/\.?$/, '.') : 'Old wrongs.'], event: { type: 'grudge', a, b },
          options: m ? [optCalm(m, `Calm ${C.groupName(a)}`)] : [], nothing: 'Do nothing: the anger keeps building.' });
      }
      for (const k of grudgeHist.keys()) if (!seen.has(k)) grudgeHist.delete(k);
    }
    // fire, flood, drought (the hardships' own records)
    function hardshipLook() {
      const h = H();
      if (!h) return;
      // a fire burning toward a home: its expected pace across the cells between (the fire's own spread rule)
      const fires = h.active('fire');
      if (!fires.length) fireTrack.clear();
      if (fires.length && h.fire.cells?.size) {
        const homes = S.buildings.filter((b) => b.kind === 'hut' && b.done && b.family && !h.fire.huts.has(b));
        for (const b of homes) {
          let best = null, bd = 1e9;
          for (const c of h.fire.cells.values()) { const d = Math.hypot(c.x - b.cx, c.z - b.cz); if (d < bd) { bd = d; best = c; } }
          if (!best || bd > 26) continue;
          // the expected time along a straight line: 1 / (spread x fuel) a column, the hut's own fuel last
          let secs = 0, ok = true;
          const n = Math.max(1, Math.ceil(bd) - 2);
          for (let i = 1; i <= n; i++) {
            const x = Math.floor(best.x + (b.cx - best.x) * i / (n + 2)), z = Math.floor(best.z + (b.cz - best.z) * i / (n + 2));
            const fu = h.fire.fuel(x, z);
            if (fu <= 0) { ok = false; break; }
            secs += 1 / (h.T.FIRE_SPREAD * fu);
          }
          if (!ok) continue;
          secs += 1 / (h.T.FIRE_SPREAD * h.T.FIRE_HUT * 2);
          // a front of many burning columns moves faster than one column's chance (measured: about 4 times):
          // the model's figure until the fire has been watched closing in, then its own pace
          secs *= F.FIRE_FRONT;
          const tk = `${b.cx},${b.cz}`, tr = fireTrack.get(tk);
          if (!tr) fireTrack.set(tk, { t: S.clockT, d: bd });
          else if (S.clockT - tr.t >= 3 && tr.d - bd > 0.5) secs = Math.min(secs * 2, bd / ((tr.d - bd) / (S.clockT - tr.t)));
          if (secs > horizonS('fire')) continue;
          const f = b.family;
          put({ key: `fire:${b.id ?? `${b.cx},${b.cz}`}`, kind: 'fire', sev: 'warn', scale: 'secs', in: secs, family: f, people: f.members.filter(alive), subject: b, x: b.cx + 0.5, z: b.cz + 0.5,
            title: `Fire is coming for ${famName(f)}'s hut`, text: `A fire is burning toward ${famName(f)}'s hut. At its likely pace it reaches the hut in about ${secsW(secs)}.${f.members.some((m) => m.inside === b) ? ' Someone is asleep inside.' : ''}`,
            cause: [`The fire is ${Math.round(bd)} steps away, over ground that burns.`], event: { type: 'hut-fire', hut: b },
            options: [optRainFire(best.x + 0.5, best.z + 0.5, 'Bring rain on the fire')], nothing: 'Do nothing: the hut catches.' });
        }
      }
      for (const fl of h.active('flood')) {
        const fams = fl.plan?.families ?? [];
        if (fl.rising && fl.plan?.huts?.length) {
          const secs = h.T.FLOOD_RISE_S * Math.max(0, 1 - fl.ri / Math.max(1, fl.plan.cells.length));
          const huts = fl.plan.huts.filter((x) => x.done && x.family);
          if (huts.length && secs <= horizonS('flood')) {
            const f = huts[0].family;
            put({ key: `flood:${fl.id}`, kind: 'flood', sev: 'warn', scale: 'secs', in: secs, family: f, people: huts.flatMap((x) => x.family.members.filter(alive)), subject: huts[0], x: huts[0].cx + 0.5, z: huts[0].cz + 0.5,
              title: 'The water is rising', text: `The water is rising over the low land. In ${secsW(secs)} it washes out the walls of ${huts.length === 1 ? `${famName(f)}'s hut` : `${num(huts.length)} huts`}.`,
              cause: ['Low land beside the water floods.'], event: { type: 'washout', flood: fl },
              options: [optRain(f, 'Bring rain on their fields: food while the water stays')], nothing: 'Do nothing: they sleep outside until the water falls.' });
          }
        }
        if (fl.sickAt != null && fams.length) {
          const inY = fl.sickAt - S.year;
          if (inY >= 0 && inY <= horizonY('floodSick')) {
            const f = fams[0], at = where(f);
            put({ key: `flood-sick:${fl.id}`, kind: 'floodSick', sev: 'warn', scale: 'years', in: inY, family: f, people: fams.flatMap((x) => x.members.filter(alive)), subject: f.leader?.() ?? null, ...at,
              title: 'A sickness follows the flood', text: `A sickness breaks out among ${h.water.namesOf ? h.water.namesOf(fams) : famName(f)} in ${yrs(inY)}, from the flood's foul water.`,
              cause: ['Floodwater fouls the wells.'], event: { type: 'sickness', flood: fl }, options: [],
              nothing: 'You cannot stop it starting. Heal (H) the ones it would kill, once it does.' });
          }
        }
      }
      for (const d of h.water.droughts?.() ?? []) {
        const fams = [...d.families];
        if (!fams.length) continue;
        const inY = d.until - S.year;
        if (inY < 0 || inY > horizonY('drought')) continue;
        const f = fams[0];
        put({ key: `drought:${d.id}`, kind: 'drought', sev: 'info', scale: 'years', in: inY, family: f, people: [], subject: f.leader?.() ?? null, x: d.x, z: d.z,
          title: 'The water is drying', text: `A drought lies over the land of ${h.water.namesOf ? h.water.namesOf(fams) : famName(f)} for ${yrs(inY)} more: their fields give a third of their food.`,
          cause: ['No rain has fallen there.'], event: { type: 'drought-end', drought: d },
          options: [{ ...optRain(f, 'Bring rain: it ends the drought'), works: (fc) => fc.ok && fc.gains.some((g) => /drought/.test(g)) }], nothing: `Do nothing: it lasts until about ${yl(d.until)}.` });
      }
    }

    // ---------- the three forces (forces.js, forces-great.js): what the god should hear of before it happens ----------
    const GA = () => R.ask('forces:great-api');
    const FW = { strength: 'strength', faith: 'faith', skepticism: 'skepticism' };
    // said as it stands now (the clan's level drifts year by year): the drop their loss makes, from today's level
    const fallWords = (fp) => (fp?.clan && fp.from != null && fp.to != null ? `the ${fp.clan.name} clan's ${FW[fp.force]} falls by about ${Math.max(1, fp.from - fp.to)} (as it stands now, from ${fp.from} to ${fp.to})` : null);
    // a great person's death by old age (other deaths are death records, which say it too: see deathLook)
    function greatLook(p, dd) {
      const fp = GA()?.fallPreview?.(p);
      if (!fp || !dd || dd.how !== 'old age') return;
      const inY = dd.life / LR();
      if (inY > horizonY('great')) return;
      const g = fp.great, fall = fallWords(fp);
      put({ key: `great:${p.id}`, kind: 'great', sev: 'warn', scale: 'years', in: inY, family: p.family, people: [p], subject: p, x: p.x, z: p.z,
        title: `${g.title} will die`, text: `${g.title}, a great ${g.kind}, dies of old age in ${yrs(inY)}${fall ? `. Then ${fall}` : ''}.`,
        cause: [`${cap(he(p))} is old: ${his(p)} years run out.`, ...(fall ? [`While ${he(p)} lives, ${fall.replace(/ falls by about \d+ \(as it stands now, from (\d+) to \d+\)$/, ' stands at $1')}.`] : [])],
        event: { type: 'death', who: p, cause: 'old age' }, options: [],
        nothing: `Nothing you can do stops old age: ${g.title} dies in ${yrs(inY)}${fall ? `, and ${fall}` : ''}.` });
    }
    // a blessed line whose blessing fades out, unless the god helps one of them again
    function blessedLook() {
      const G = R.tune('forces-great');
      if (!G) return;
      for (const l of R.ask('lines') ?? []) {
        if (!l.blessed || !l.alive || l.total <= G.KEEP_AT) continue;
        const inY = l.halfLife * Math.log2(l.total / G.KEEP_AT);
        if (inY > horizonY('blessed')) continue;
        const ms = S.people.filter((p) => alive(p) && p.family?.state === 'settled' && p.ext?.line?.id === l.id);
        if (!ms.length) continue;
        const f = ms[0].family, at = where(f, ms[0]);
        // help that marks the line (forces-great.js act:before): a heal of a sick member, a deer or rain for a hungry
        // house of theirs, rain on a field of theirs; each works only once the next mark can count
        const options = [];
        const sick = ms.find((p) => p.ext?.hardship?.sick || p.ext?.hardship?.wound);
        if (sick) options.push({ ...optHeal(sick), line: l.id });
        const fams = [...new Set(ms.map((p) => p.family))];
        const hungry = fams.find((x) => x.members.some((m) => alive(m) && m.hunger > 0));
        if (hungry) options.push({ ...optDeer(hungry), line: l.id });
        const withField = fams.find((x) => x.fields.some((fl) => fl.done));
        if (withField) options.push({ ...optRain(withField, `Bring rain on the fields of ${famName(withField)}, of ${l.name}`), line: l.id });
        // a whisper always marks (skepticism, the heaviest mark), if the one it is for believes enough for it to take
        const ear = ms.filter((p) => p.age >= 8).sort((a, b) => b.faith - a.faith)[0];
        if (ear) options.push({ power: 'whisper', label: `Whisper to ${ear.name}, of ${l.name}`, target: { kind: 'person', entity: ear, x: ear.x, z: ear.z }, works: (fc) => fc.ok, line: l.id });
        for (const o of options) { const w0 = o.works; o.works = (fc) => !!w0?.(fc) && (R.ask('lines') ?? []).find((x) => x.id === l.id)?.nextMarkIn === 0; }
        const next = l.nextMarkIn > 0 ? ` The next help counts in ${yrs(l.nextMarkIn)}.` : '';
        const gifted = l.gifted.filter((x) => !x.dead).map((x) => x.name);
        put({ key: `blessed:${l.id}`, kind: 'blessed', sev: inY < 8 ? 'warn' : 'info', scale: 'years', in: inY, family: f, people: ms, subject: ms[0], ...at,
          title: `${cap(l.name)} will lose your blessing`, text: `${cap(l.name)} loses your blessing in ${yrs(inY)} unless you help one of them again: no more gifted children after that.${next}`,
          cause: [`Your marks on them fade: ${l.total} now, lost under ${G.KEEP_AT}. ${l.fade}`, ...(gifted.length ? [`Their gifted ${gifted.length === 1 ? 'child stays' : 'children stay'} gifted: ${gifted.join(', ')}.`] : [])],
          event: { type: 'line-lost', line: l.id }, options,
          nothing: `Do nothing: the blessing on ${l.name} fades out in ${yrs(inY)}; no gifted child is born to them after that.` });
      }
    }
    // a chief rising in a village grown too strong, and the weaker families who mean to leave it
    function forceLook() {
      const FA = R.forces, FT = R.tune('forces');
      if (!FA || !FT) return;
      for (const v of R.ask('villages') ?? []) {
        const g = FA.groups.get(v.id);
        if (!g || g.n < FT.MIN_GROUP || !g.on.has('much-strength') || FA.chiefs.get(v.id)) continue;
        const best = v.members.filter((p) => alive(p) && p.age >= T1.CHILD_UNTIL && p.age < T1.ELDER_FROM).sort((a, b) => (b.ext?.forces?.s ?? 0) - (a.ext?.forces?.s ?? 0));
        const p = best[0];
        if (!p || (p.ext?.forces?.s ?? 0) < FT.CHIEF_AT) continue;
        const inY = Math.max(0.2, Math.floor(S.year) + 1 - S.year);
        const next = best[1] && (best[1].ext?.forces?.s ?? 0) >= FT.CHIEF_AT ? best[1] : null;
        put({ key: `chief:${v.id}`, kind: 'chief', sev: 'warn', scale: 'years', in: inY, family: p.family, people: [p], subject: p, x: p.x, z: p.z,
          title: `${p.name} will make ${p.sex === 'f' ? 'herself' : 'himself'} chief`,
          text: `${v.name} has grown too strong (strength ${Math.round(g.strength)}). At the turn of the year ${p.name}, the strongest (${Math.round(p.ext.forces.s)}), makes ${p.sex === 'f' ? 'herself' : 'himself'} chief and takes ${Math.round(FT.CHIEF_TAKE * 100)} in 100 of every other household's store each year.`,
          cause: [`Too much strength in ${v.name}: ${Math.round(g.strength)}, at or over ${FT.HIGH.strength}.`, ...(next ? [`If ${p.name} were gone, ${next.name} (${Math.round(next.ext.forces.s)}) would take it instead.`] : [])],
          event: { type: 'chief', village: v.id },
          options: [{ ...optStrikeLeader(p), label: `Strike down ${p.name}`, works: (fc) => fc.ok && !next }],
          nothing: `Do nothing: ${p.name} is chief of ${v.name} from next year, until the village cools or ${he(p)} dies.` });
      }
      for (const [f, l] of FA.leaving) {
        if (f.state !== 'settled' || !f.members.some(alive)) continue;
        const inY = Math.max(0, l.year - S.year);
        if (inY > horizonY('peace')) continue;
        const g = FA.groups.get(l.village.id);
        const line = FT.HIGH.strength - FT.HYST;
        const at = where(f);
        // what cools a village: its grown-ups seeing the sky help them ("why bother": strength falls for each who sees)
        const coolRain = { power: 'bless-harvest', label: `Bring rain where ${l.village.name} can see it: those who see it lean on you, and their strength falls`, target: area(at.x, at.z, SUGGEST_R),
          works: (fc) => fc.ok && g && g.n > 0 && g.strength - FT.SEEN_HELP * Math.min(g.n, fc.seenBy ?? 0) / g.n < line };
        put({ key: `peace:${f.id}`, kind: 'peace', sev: 'warn', scale: 'years', in: inY, family: f, people: f.members.filter(alive), subject: f.leader?.() ?? null, ...at,
          title: `${cap(famName(f))} will leave for a peaceful place`,
          text: `${cap(famName(f))} are tired of the raids${FA.chiefs.get(l.village.id) ? ` and of ${FA.chiefs.get(l.village.id).name}'s taking` : ''} in ${l.village.name}. They leave in ${yrs(inY)}, unless the village cools (strength under ${line}; it is ${g ? Math.round(g.strength) : '?'}).`,
          cause: [`Too much strength in ${l.village.name}: the weaker families want peace.`], event: { type: 'leave', family: f },
          options: [coolRain], nothing: `Do nothing: they leave in ${yrs(inY)}, unless ${l.village.name} cools by itself.` });
      }
    }

    // ---------- one look ahead: compare with what was foreseen before ----------
    function look() {
      out.length = 0;
      const deaths = new Map();
      for (const f of [...S.families]) { try { hungerLook(f); leaveLook(f); } catch (err) { warnOnce('family', err); } }
      for (const p of S.people) { try { const dd = deathLook(p); deaths.set(p, dd); motherLook(p, dd); if (dd && dd.how === 'old age') greatLook(p, dd); } catch (err) { warnOnce('person', err); } }
      for (const f of [...S.families]) { try { lineLook(f); } catch (err) { warnOnce('line', err); } }
      for (const fn of [thinkerLook, wolfLook, raidLook, grudgeLook, hardshipLook, blessedLook, forceLook]) { try { fn(); } catch (err) { warnOnce(fn.name, err); } }
      const keys = new Set();
      for (const pr of out) {
        keys.add(pr.key);
        let r = live.get(pr.key);
        if (!r && dormant.has(pr.key)) { r = dormant.get(pr.key); dormant.delete(pr.key); live.set(pr.key, r); } // back: picked up silently
        if (!r) { live.set(pr.key, begin(pr)); continue; }
        r.missing = 0;
        update(r, pr);
      }
      // not foreseen any more: withdrawn after its grace (no flicker), at once when the god just acted near it or
      // when its time has passed without it coming. One that simply stopped being foreseen (no act, no death, nobody
      // left) goes dormant first: off the live list at once, announced withdrawn only if it stays away DORMANT_S
      for (const r of [...live.values()]) {
        if (keys.has(r.key)) continue;
        r.missing += F.EVAL_S;
        const passed = (r.scale === 'secs' ? r.atClock - S.clockT : r.atYear - S.year) < 0;
        const act = actNear(r);
        const grace = act ? 1 : (F.GRACE_S[r.kind] ?? F.GRACE_S.default);
        if (!passed && r.missing < grace) continue;
        const gone = r.subject?.kind === 'person' && r.subject.dead || (r.family && (r.family.state === 'leaving' || !S.families.includes(r.family)));
        if (passed || act || gone) withdraw(r);
        else { live.delete(r.key); r.dormantUntil = S.clockT + F.DORMANT_S; dormant.set(r.key, r); }
      }
      for (const r of [...dormant.values()]) {
        const passed = (r.scale === 'secs' ? r.atClock - S.clockT : r.atYear - S.year) < 0;
        if (passed || S.clockT >= r.dormantUntil || !(S.clockT >= r.dormantUntil - F.DORMANT_S - 1)) { dormant.delete(r.key); withdraw(r); }
      }
    }
    const dormant = new Map(); // key -> a record that stopped being foreseen, not yet announced withdrawn
    const warned = new Set();
    function warnOnce(k, err) { if (warned.has(k)) return; warned.add(k); console.warn(`foresight: ${k} look failed`, err); }
    // the absolute time a prediction states: a calendar year, or a point on the walking clock
    const atOf = (pr) => (pr.scale === 'secs' ? { atClock: S.clockT + pr.in } : { atYear: S.year + pr.in });
    function begin(pr) {
      const r = { ...pr, id: `fs${++seq}`, missing: 0, since: S.year, sinceClock: S.clockT, sinceReal: nowReal(), ...atOf(pr), first: { ...atOf(pr), in: pr.in, year: S.year, clock: S.clockT }, moved: 0, history: [],
        storyLen: pr.subject?.story?.length ?? 0, sinceAct: performance.now() };
      r.options = pr.options.map((o) => ({ ...o }));
      try { refreshOptions(r); } catch { /* forecasts failed: the options stay unchecked */ }
      r.said = { ...atOf(pr), outcome: outcomeOf(pr), year: S.year };
      signal('foresight:new', view(r));
      return r;
    }
    // what the warning says will happen, apart from when: a change of this is always announced
    const outcomeOf = (pr) => `${pr.how ?? ''}|${pr.phase ?? ''}`;
    function update(r, pr) {
      // the time last announced (not the last look's): slow drift is not news, a jump of MOVED is
      const said = r.said ?? { ...atOf(r), outcome: outcomeOf(r) };
      const was = r.scale === 'secs' ? said.atClock - S.clockT : said.atYear - S.year;
      Object.assign(r, { sev: pr.sev, scale: pr.scale, in: pr.in, family: pr.family, people: pr.people, subject: pr.subject, x: pr.x, z: pr.z, title: pr.title, text: pr.text, cause: pr.cause, event: pr.event, nothing: pr.nothing, how: pr.how, phase: pr.phase }, atOf(pr));
      // the options keep what was learned about them (best moment, ever worked); new ones join
      for (const o of pr.options) { const old = r.options.find((x) => x.power === o.power && x.label === o.label); if (old) Object.assign(old, { target: o.target, works: o.works }); else r.options.push({ ...o }); }
      r.options = r.options.filter((o) => pr.options.some((x) => x.power === o.power && x.label === o.label) || o.everWorked);
      const moveMin = r.scale === 'secs' ? 3 : F.MOVED_MIN_YEARS;
      const outcome = outcomeOf(pr);
      // a worse outcome is always news (going hungry to starving; not back); a time that moved by MOVED (and
      // MOVED_MIN_YEARS) is news, at most once every UPDATE_GAP_YEARS for one warning (grudges and harvests nudge it)
      const worse = outcome !== said.outcome && !(String(said.outcome).endsWith('|starving') && pr.phase === 'store');
      const moved = Math.abs(pr.in - was) >= Math.max(moveMin, Math.abs(was) * F.MOVED) && (r.scale === 'secs' || S.year - (said.year ?? -1e9) >= F.UPDATE_GAP_YEARS);
      if (worse || moved) {
        r.history.push({ year: S.year, was, now: pr.in });
        r.moved++;
        r.said = { ...atOf(pr), outcome, year: S.year };
        signal('foresight:update', { ...view(r), was, why: pr.in < was ? 'sooner' : 'later' });
      }
    }
    // the god's latest act near a record since it began (real time: the act memory is not the skip's clock)
    function actNear(r) {
      const t = performance.now();
      let best = null;
      for (const a of acts) if (t - a.at < F.ACT_MEMORY_S * 1000 && a.at >= r.sinceAct - 500 && (r.x == null || Math.hypot(a.x - r.x, a.z - r.z) <= (a.r ?? 0) + 14)) best = a;
      return best;
    }
    // why a foreseen thing no longer comes: the god's act, a changed fate, or the turn of events
    function reasonFor(r) {
      const subj = r.subject;
      if (subj?.kind === 'person' && subj.dead) return `${subj.name} died first: ${subj.cause ?? 'another way'}.`;
      if (r.family && (r.family.state === 'leaving' || !S.families.includes(r.family)) && r.kind !== 'leave' && r.kind !== 'line') return `${cap(famName(r.family))} left the land first.`;
      // a recent act of the god near them
      const act = actNear(r);
      if (act) {
        const w = POWER_WORDS[act.kind] ?? 'You acted';
        const seen = act.seenBy ? ` ${act.seenBy === 1 ? 'One person' : `${cap(num(act.seenBy))} people`} saw it.` : ' Nobody saw it.';
        return `${w} in ${yl(act.year)}.${seen}`;
      }
      // the person's own story says why their fate changed ("Was to ... . <why>")
      if ((r.kind === 'death' || r.kind === 'hunger') && subj?.story?.length && subj.story.length > (r.storyLen ?? 0)) {
        const fresh = subj.story.slice(Math.max(0, (r.storyLen ?? subj.story.length) - 1));
        const line = [...fresh].reverse().find((l) => /: Was to (die|be bitten)/.test(l));
        const m = line && /: Was to [^.]*\.\s*(.+)$/.exec(line);
        if (m?.[1]) return m[1];
      }
      const K = {
        hunger: () => (r.phase === 'starving' ? 'They have food again.' : 'Their store is no longer falling: the field is giving enough.'),
        leave: () => 'They are happier now and mean to stay.',
        death: () => (r.how === 'wolf' ? 'The wolf lost the trail.' : r.how === 'fight' ? 'The fight was called off, or rolled again.' : r.how === 'fire' ? 'The fire is out.' : 'It no longer comes to pass.'),
        raid: () => 'The raid is off.', grudge: () => 'The anger is cooling.', fire: () => 'The fire died down, or turned.',
        wolf: () => 'No wolf will come after all: there are enough of them, or nobody settled.', drought: () => 'The drought is over.',
        line: () => 'A child is coming after all, or someone can still pair up.', thinker: () => 'Others have begun to think.', mother: () => 'Her fate changed.',
      };
      return (K[r.kind] ?? (() => 'Things changed. It no longer comes to pass.'))();
    }
    function withdraw(r) {
      live.delete(r.key); dormant.delete(r.key);
      r.end = 'withdrawn'; r.endYear = S.year; r.endClock = S.clockT;
      r.reason = reasonFor(r);
      record(r);
      signal('foresight:withdrawn', { ...view(r), reason: r.reason });
    }
    function land(r, actual = {}) {
      if (r.end) return;
      live.delete(r.key); dormant.delete(r.key);
      r.end = 'landed'; r.endYear = S.year; r.endClock = S.clockT;
      const statedIn = r.scale === 'secs' ? r.first.in : r.first.in;
      const realIn = r.scale === 'secs' ? S.clockT - r.first.clock : S.year - r.first.year;
      const lastIn = r.scale === 'secs' ? r.atClock - r.first.clock : r.atYear - r.first.year;
      acc.push({ kind: r.kind, how: r.how ?? null, key: r.key, scale: r.scale, stated: round(statedIn), statedLast: round(lastIn), actual: round(realIn), err: round(realIn - statedIn), errLast: round(realIn - lastIn), year: Math.floor(S.year) });
      if (acc.length > 400) acc.shift();
      r.account = hindsight(r, actual);
      record(r);
      signal('foresight:landed', { ...view(r), account: r.account });
    }
    const round = (v) => Math.round(v * 10) / 10;
    function record(r) { log.push(r); if (log.length > F.LOG_MAX) log.shift(); }

    // ---------- afterwards: what you could have done ----------
    // Honest by construction: the options are the ones each power's own forecast said would work, at the time,
    // with who would have seen it at the least watched moment; "nothing unseen" when every one was seen.
    function hindsight(r, actual = {}) {
      const lines = [], could = [];
      const warned = r.first ? (r.scale === 'secs' ? `You were told ${secsW(S.clockT - r.first.clock)} before.` : `You were told ${yrs(S.year - r.first.year)} before, in ${yl(r.first.year)}.`) : null;
      for (const o of r.options) {
        if (!o.everWorked) continue;
        const b = o.best ?? o.last;
        let cost = '';
        if (o.land) cost = 'Shaped where nobody is looking, it goes unseen; next to people, they would have seen the land move.';
        else if (!b || b.seenBy === 0) cost = b ? `In ${yl(b.year)} nobody was looking: it would have gone unseen.` : '';
        else cost = `It would have been seen by ${b.seenBy === 1 ? 'one person' : `${num(b.seenBy)} people`}.${b.early ? ' Those new here would have come to lean on you, and worked less for good.' : ' Their faith would have grown, and their skepticism shrunk.'}`;
        could.push({ power: o.power, label: o.label, cost, unseen: o.land || (!!b && b.seenBy === 0) });
      }
      // what saving them would have brought (the hardships roll it while the danger lasts)
      const p = r.event?.who;
      const h = H();
      const tr = p?.ext?.hardship?.trouble;
      if (tr && h) { try { const l = h.trouble.lines(p, tr); for (const t of [...l.fates, ...l.later]) lines.push(`Saving ${p.name} would also have meant: ${t.replace(/^Saved, /, '')}`); } catch { /* no lines */ } }
      const unseenOK = could.some((c) => c.unseen);
      const none = !could.length;
      let verdict;
      if (none) verdict = r.kind === 'line' || r.kind === 'mother' ? 'Nothing you could have done: no power stops old age or makes a child.' : (r.options.length ? 'Nothing you could have done would have changed it, as things stood.' : 'Nothing within your powers would have changed it.');
      else if (!unseenOK) {
        // every option that would have worked, worked only while someone would have seen it: say which, when, and that
        // unseen it would not have (FAULTS 2026-11-13: the old words blamed watchers when the option simply failed)
        const c0 = could[0], o0 = r.options.find((o) => o.label === c0.label), b0 = o0?.best ?? o0?.last;
        verdict = b0 ? `${c0.label} would have worked only where it was seen: in ${yl(b0.year)}, by ${b0.seenBy === 1 ? 'one person' : `${num(b0.seenBy)} people`}. Unseen, it would not have worked.`
          : 'What would have worked would only have worked where it was seen.';
      }
      else verdict = 'It could have been done unseen.';
      return { what: actual.what ?? r.text, why: r.cause ?? [], could, verdict, warned, more: lines };
    }
    // a bad end that nobody foresaw (too fast, or the look missed it): the account from the cause alone
    function unforeseen(p, cause) {
      const f = p.family;
      const what = `${p.name} of ${famName(f)} ${R.deathWords(cause) ?? (cause === 'wolf' ? 'was killed by a wolf' : cause === 'hunger' ? 'died of hunger' : cause === 'fight' ? 'died in a fight' : `died (${cause})`)}.`;
      const could = [];
      if (cause === 'wolf') could.push({ power: 'strike', label: 'Strike the wolf down while it stalked', cost: 'Unseen only at night or away from the huts.' });
      if (cause === 'fight') could.push({ power: 'calm', label: 'Calm the angry side before the fight', cost: 'Nobody ever sees a calming.' , unseen: true });
      if (cause === 'hunger') could.push({ power: 'deer', label: 'Put a deer by their door in time: they would have hunted it', cost: 'Put where nobody looks, it goes unseen.', unseen: true },
        { power: 'bless-harvest', label: 'Bring rain on their fields in time', cost: 'Who saw it would have leaned on you.' });
      return { what, why: [], could, verdict: could.length ? 'There was too little warning to say more.' : 'Nothing within your powers would have changed it.', warned: 'There was no warning: it came too fast.', more: [] };
    }

    // ---------- the screen's view of a record (plain data, no live objects but the subject) ----------
    function view(r) {
      const opts = r.options.map((o) => ({ power: o.power, label: o.label, target: o.target ? { kind: o.target.kind, x: o.target.x, z: o.target.z, r: o.target.r, entity: o.target.entity ?? null } : null,
        works: o.now ? o.now.works : null, seenBy: o.now?.seenBy ?? null, who: o.now?.who ?? '', early: o.now?.early ?? null, land: !!o.land, harsh: !!o.harsh,
        via: o.via ?? 'sim.act', tool: o.tool ?? null }));
      return { id: r.id, key: r.key, kind: r.kind, how: r.how ?? null, phase: r.phase ?? null, sev: r.sev, scale: r.scale, in: r.scale === 'secs' ? r.atClock - S.clockT : r.atYear - S.year,
        atYear: r.atYear ?? null, atClock: r.atClock ?? null, since: r.since, title: r.title, text: r.text, cause: [...(r.cause ?? [])], options: opts, nothing: r.nothing,
        family: r.family ? { id: r.family.id, name: r.family.name } : null, subject: r.subject ?? null, people: (r.people ?? []).filter(alive).map((p) => ({ id: p.id, name: p.name })),
        x: Number.isFinite(r.x) ? r.x : null, z: Number.isFinite(r.z) ? r.z : null, moved: r.moved, end: r.end ?? null, reason: r.reason ?? null, account: r.account ?? null, endYear: r.endYear ?? null };
    }

    // ---------- what lands ----------
    R.on('person:death', (p, cause) => {
      for (const r of [...live.values(), ...dormant.values()]) {
        const ev = r.event;
        if (!ev) continue;
        // a record lands only on the end it foretold; another end first leaves it to be withdrawn ("died first")
        if (r.kind === 'hunger') { if (cause === 'hunger' && r.family === p.family) land(r, { what: deathText(p, cause) }); continue; }
        if (ev.type === 'death' && ev.who === p && causeMatch(ev.cause, cause, r.kind)) { land(r, { what: deathText(p, cause) }); continue; }
        if (r.kind === 'thinker' && r.subject === p) land(r, { what: deathText(p, cause) });
      }
      if (['wolf', 'fight', 'hunger', 'fire', 'wounds', 'fever', 'cough', 'flux'].includes(cause) && p.family?.state === 'settled' && !log.slice(-6).some((r) => r.end === 'landed' && r.event?.who === p)) {
        // the same death in a family's hunger record counts as landed above; this is the unforeseen case
        if (!log.slice(-6).some((r) => r.end === 'landed' && r.family === p.family && r.kind === 'hunger' && Math.abs(r.endYear - S.year) < 0.5)) {
          const account = unforeseen(p, cause);
          const rec = { id: `fs${++seq}`, key: `unforeseen:${p.id}`, kind: cause === 'hunger' ? 'hunger' : 'death', how: cause, sev: 'bad', scale: 'years', in: 0, atYear: S.year, family: p.family, people: [p], subject: p, x: p.x, z: p.z,
            title: account.what, text: account.what, cause: [], options: [], nothing: '', end: 'landed', endYear: S.year, account, moved: 0, since: S.year };
          record(rec);
          signal('foresight:landed', view(rec));
        }
      }
    });
    const SICK = new Set(['fever', 'cough', 'flux', 'sickness']);
    const causeMatch = (want, got, kind) => kind === 'thinker' || kind === 'mother' || want === got || (want === 'sickness' && SICK.has(got)) || (want === 'wounds' && got === 'wounds');
    const deathText = (p, cause) => `${p.name} of ${famName(p.family)} ${R.deathWords(cause) ?? ({ hunger: 'died of hunger', wolf: 'was killed by a wolf', fight: 'was killed in a fight', 'old age': 'died of old age', 'struck down': 'was struck down from the sky' }[cause] ?? `died (${cause})`)} at ${Math.floor(p.age)}.`;
    R.on('family:leave', (f, reason) => {
      for (const r of [...live.values(), ...dormant.values()]) {
        if (r.family !== f) continue;
        if (r.kind === 'leave' || r.kind === 'peace') land(r, { what: `${cap(famName(f))} packed up and left: ${reason}.` });
      }
      // a settled family that left with no warning, or a passing family that walked on: what would have kept them
      const settled = f.settledYear != null;
      if (!log.slice(-4).some((r) => (r.kind === 'leave' || r.kind === 'peace') && r.family === f && r.end === 'landed')) {
        const could = settled ? [] : [{ power: 'lake', label: 'A river or lake beside flat grass where they walked would have kept them', cost: 'Shaped where nobody looks, it goes unseen.', unseen: true }];
        const account = { what: `${cap(famName(f))} ${settled ? 'packed up and left' : 'walked on and left'}: ${reason}.`, why: [], could, verdict: settled ? 'There was no warning: it came too fast to read.' : 'They only pass through land that offers nothing.', warned: null, more: [] };
        const rec = { id: `fs${++seq}`, key: `left:${f.id}`, kind: 'leave', sev: settled ? 'bad' : 'info', scale: 'years', in: 0, atYear: S.year, family: f, people: f.members.filter(alive), subject: f.leader?.() ?? null,
          x: f.leader?.()?.x, z: f.leader?.()?.z, title: account.what, text: account.what, cause: [], options: [], nothing: '', end: 'landed', endYear: S.year, account, moved: 0, since: S.year };
        record(rec);
        signal('foresight:landed', view(rec));
      }
      // everything else about them is withdrawn now (reasonFor says they left)
      for (const r of [...live.values(), ...dormant.values()]) if (r.family === f) withdraw(r);
    });
    // a wolf out of the mist (not one the god placed)
    let wolvesKnown = new Set();
    function wolfArrivals() {
      for (const w of S.predators) if (!wolvesKnown.has(w)) { wolvesKnown.add(w); if (!w.placed) { const r = live.get('wolf:come'); if (r) land(r, { what: 'A wolf came out of the mist.' }); } }
      if (wolvesKnown.size > 50) wolvesKnown = new Set(S.predators);
    }
    R.on('fight:end', (e) => {
      const r = live.get(`raid:${e?.a?.id}>${e?.b?.id}`);
      if (!r) return;
      if (e.calledOff) { r.reason = 'The raid was called off.'; withdraw(r); }
      else land(r, { what: `${cap(r.title)} came to blows: ${e.deaths ? `${num(e.deaths)} died` : 'nobody died'}.` });
    });
    // the three forces: a chief made, a blessing lost
    R.on('force:chief', (e) => { const r = live.get(`chief:${e?.village?.id}`); if (r) land(r, { what: `${e.person?.name ?? 'The strongest'} made ${e.person?.sex === 'f' ? 'herself' : 'himself'} chief of ${e.village?.name ?? 'the village'}.` }); });
    R.on('line:lost', (e) => { const k = `blessed:${e?.line?.id}`, r = live.get(k) ?? dormant.get(k); if (r) land(r, { what: `${cap(e.line.name)} is no longer blessed.` }); });
    R.on('fight:start', (e) => { const g = live.get(`grudge:${e?.a?.id}>${e?.b?.id}`); if (g) land(g, { what: 'The grudge boiled over.' }); });
    R.on('hardship:start', (e) => {
      if (e?.kind !== 'sickness') return;
      for (const r of [...live.values()]) if (r.kind === 'floodSick' && (e.families ?? []).some((f) => r.family === f || (r.event.flood?.plan?.families ?? []).includes(f))) land(r, { what: 'The sickness broke out after the flood.' });
    });
    R.on('hardship:end', (e) => { for (const r of [...live.values()]) if (r.kind === 'drought' && r.event.drought?.id === e?.id) { if (e.outcome === 'ended') withdraw(r); else land(r, { what: 'The drought is over.' }); } });
    // watched each look: a hut that caught, a flood that finished rising
    function watchHardships() {
      const h = H();
      if (!h) return;
      for (const r of [...live.values()]) {
        if (r.kind === 'fire' && h.fire.huts.has(r.event.hut)) land(r, { what: `${cap(famName(r.family))}'s hut caught fire.` });
        if (r.kind === 'flood' && !r.event.flood.rising) land(r, { what: 'The flood washed out the walls.' });
        if (r.kind === 'grudge') { const C = R.ask('clans:api'), A = R.ask('fights:api'); if (C && A && C.gOf(r.event.a, r.event.b) >= A.T.RAID_AT) land(r, { what: 'The grudge reached raiding pitch.' }); }
      }
    }
    // the god's acts (the bus), to say "you did this" when a warning is withdrawn
    R.ctx.events.on('god:act', (a) => {
      if (!a || a.x == null) return;
      const deerAct = a.power === 'deer' || (a.kind === 'animal' && a.animal === 'deer');
      acts.push({ kind: deerAct ? 'deer' : a.power ?? a.kind, x: a.x, z: a.z, r: a.r ?? 0, at: performance.now(), year: S.year, seenBy: a.seenBy ?? 0 });
      if (acts.length > 30) acts.shift();
      // look again at once, so the screen hears soon
      evalT = F.EVAL_S;
      // and say now what it did for the need it was aimed at
      if (!quiet()) { try { answerAct(a, deerAct ? 'deer' : a.power ?? a.kind); } catch (err) { warnOnce('answer', err); } }
    });

    // ---------- the answer to an act: what it did for the need it was aimed at, said at once ----------
    // The director (2026-11-16): "after we give deer or Rain, it still persists & we get NO FEEDBACK whether what we did
    // was useful. Remember, FEEDBACK within 100 ms." On an act (the bus's god:act is sent the moment the act is carried
    // out, in the same call) the warnings it could have been for are looked at again at once, not on the next step
    // (time is often held while a power is in hand, so no step would come), and each is told back in plain words: met
    // (withdrawn now, so its token and red sign go straight away) or not (it stays, and the words say why). The words
    // come from the simulation's own rules: hunting.js deerReach and deerComing for a deer, the rain's plan as it stood
    // just before it fell (act:before) for rain. Nothing is guessed: a warning is "met" only when the look ahead, run
    // again on the world as the act left it, no longer foresees it.
    // Signal foresight:answer { power, x, z, results: [{ key, kind, family, met, head, text }], ms }; query lastAnswer().
    const ANSWER_KINDS = { deer: new Set(['hunger']), 'bless-harvest': new Set(['hunger', 'drought', 'fire']) };
    const fieldMid = (fl) => ({ x: fl.mx ?? fl.cx ?? fl.x, z: fl.mz ?? fl.cz ?? fl.z });
    let rainBefore = null, lastAnswer = null;
    // the rain's plan as it stands just before it falls (powers-nature.js rainPlan's own tests): who it would reach,
    // whose fields it would water, whose were watered lately and so would give no new harvest
    R.on('act:before', (ev) => {
      if (ev?.id !== 'bless-harvest' || ev.target?.kind !== 'area') return;
      const t = ev.target, r = Math.max(1, t.r ?? 6), fams = new Map();
      for (const f of S.families) {
        if (f.state !== 'settled') continue;
        const hh = home(f), done = f.fields.filter((fl) => fl.done);
        const dHome = hh ? Math.hypot(hh.x - t.x, hh.z - t.z) : Infinity;
        const dField = done.length ? Math.min(...done.map((fl) => { const m = fieldMid(fl); return Math.hypot(m.x - t.x, m.z - t.z); })) : Infinity;
        const watered = R.mods('yield', f).some((m) => m.key === `nature:bless:${f.id}` && (m.until == null || m.until > S.life));
        fams.set(f, { fields: done.length, sown: done.filter((fl) => !fl.bare).length, dHome, dField, near: Math.round(Math.max(0, Math.min(dHome - r - 2, dField - r - 3))), inRing: dHome <= r + 2 || dField <= r + 3, watered });
      }
      rainBefore = { x: t.x, z: t.z, r, clock: S.clockT, fams, logLen: log.length, used: false };
    });
    const stays = 'The warning stays.', lifted = 'The warning is lifted.';
    function answerAct(a, power) {
      const kinds = ANSWER_KINDS[power];
      if (!kinds) return null;
      const t0 = performance.now(), now = S.clockT;
      // the deer just put down: the act's own, and any others placed with it at the same tick
      const deer = power === 'deer' ? S.animals.filter((e) => e.species === 'deer' && !e.dead && e.placed && Math.hypot(e.x - a.x, e.z - a.z) <= (a.r ?? 1.5) + 2.5) : [];
      if (a.target?.species === 'deer' && !a.target.dead && !deer.includes(a.target)) deer.push(a.target);
      if (power === 'deer' && !deer.length) return null;
      const span = power === 'deer' ? 90 : (a.r ?? 6) + 40;
      const dTo = (r) => (Number.isFinite(r.x) ? Math.hypot(r.x - a.x, r.z - a.z) : Infinity);
      const fits = (r) => kinds.has(r.kind) || (power === 'bless-harvest' && r.kind === 'death' && r.how === 'fire');
      // the warnings it could have been for: live ones in reach that this power answers, nearest first, and any the act
      // itself already ended as it was carried out (rain ends a drought as it falls: that warning is withdrawn then)
      const cands = [...live.values()].filter((r) => fits(r) && dTo(r) <= span).sort((p, q) => dTo(p) - dTo(q)).slice(0, 3);
      // (only what this rain itself ended: the log since its act:before. With time held, every act shares one moment
      // of the clock, so "ended now" would also take in what an earlier act ended)
      const fresh = power === 'bless-harvest' && rainBefore && !rainBefore.used ? log.slice(rainBefore.logLen) : [];
      if (rainBefore) rainBefore.used = true;
      const ended = fresh.filter((r) => r.end === 'withdrawn' && (r.kind === 'drought' || r.kind === 'fire') && dTo(r) <= span + 20).slice(-2);
      const results = [];
      // no warning it answers: a deer by a household that needs nothing is said to graze, one by a hungry house to be hunted
      const graze = () => {
        const f = S.families.filter((x) => x.state === 'settled' && home(x)).map((x) => ({ x, d: Math.hypot(home(x).x - deer[0].x, home(x).z - deer[0].z) })).filter((o) => o.d <= 45).sort((p, q) => p.d - q.d)[0]?.x;
        const rr = f ? R.ask('deerReach', f, deer[0]) : null;
        if (!rr) return;
        results.push({ key: null, kind: null, family: { id: f.id, name: f.name }, met: null, head: '',
          text: rr.ok ? `${deer.length > 1 ? `${cap(num(deer.length))} deer` : 'A deer'} near ${famName(f)}: they are short of food, and ${rr.hunter.name} goes after ${deer.length > 1 ? 'one' : 'it'}.` : rr.code === 'fed' ? 'Nobody near here is short of food: the deer will just graze.' : rr.why });
      };
      if (!cands.length && !ended.length) {
        if (power !== 'deer') return null;
        graze();
        if (!results.length) return null;
      } else {
        // what the act changed, read now: the family's own rule for food found (a rain's harvest undoes a foretold hunger
        // death), then one look ahead on the world as the act left it
        if (power === 'bless-harvest') for (const r of cands) if (r.family) S.peopleApi.foodFound?.(r.family);
        // a rain that watered their fields changed what comes in: the store's old trend (measured while it was falling)
        // no longer says where it is going, so it is measured afresh from now (tested with a finger, 2026-11-16: a store
        // refilled by the rain still read "food for one more year" from the fall before it)
        if (power === 'bless-harvest' && rainBefore) for (const r of cands) { const b = r.family && rainBefore.fams.get(r.family); if (b && b.inRing && b.fields && b.sown && !b.watered) famHist.delete(r.family); }
        look();
        for (const r of ended) results.push(words(r, true, power, a, deer));
        for (const r of cands) {
          if (r.end) continue;   // (ended by the look itself: its time passed, or the family left; not this act's doing)
          const still = live.get(r.key) === r && !(r.missing > 0);
          const w = words(r, !still, power, a, deer);
          // (no longer foreseen, but not because of this act: it is left to its own grace, as any warning is, and
          // nothing is said of it here; the screen tested with a finger, 2026-11-16, read neighbours' warnings lifted
          // "not by this rain" and the like, which only buried the answer)
          if (w.met === null) continue;
          if (w.met) withdraw(r);   // met: withdrawn now (its reason is the act), not after its grace
          results.push(w);
        }
        if (!results.length && power === 'deer') graze();
      }
      // what helped comes first (the headline), then what did not, each nearest first
      results.sort((p, q) => (q.met === true) - (p.met === true));
      lastAnswer = { power, x: a.x, z: a.z, year: S.year, results, ms: Math.round((performance.now() - t0) * 10) / 10 };
      signal('foresight:answer', lastAnswer);
      return lastAnswer;
    }
    // the words for one warning: what the act did for it, from what the simulation computes
    function words(r, met, power, a, deer) {
      const f = r.family, name = f ? famName(f) : 'them', Name = cap(name);
      const out = { key: r.key, kind: r.kind, family: f ? { id: f.id, name: f.name } : null, met, head: met ? 'It helped' : 'Not yet', text: '', x: r.x, z: r.z };
      const v = r.subject?.kind === 'person' ? r.subject : null;
      if (power === 'deer' && r.kind === 'hunger') {
        const n = deer.length, what = n > 1 ? `${cap(num(n))} deer` : 'A deer', it = n > 1 ? 'them' : 'it';
        const reach = f ? deer.map((e) => R.ask('deerReach', f, e)).filter(Boolean) : [];
        const ok = reach.filter((x) => x.ok).sort((p, q) => p.secs - q.secs)[0];
        // (gone, but not for this deer: they have food again by other means; the deer is not why)
        if (met && !ok) {
          out.met = null; out.head = '';
          out.text = `${Name} is not short of food any more, so the warning is lifted. The deer will graze.`;
        } else if (met) {
          const c = f ? R.ask('deerComing', f) : null, who = c?.hunter ?? ok?.hunter;
          out.text = `${what} near ${name}: they can reach ${it}. ${who ? `${who.name} goes after ${n > 1 ? 'one' : 'it'}` : 'They go after it'}${ok ? `, and about ${Math.round(ok.hit * 100)} in 100 throws kill ${n > 1 ? 'one' : 'it'}` : ''}. A deer is about ${yrs(ok?.years ?? 1)} of their eating. ${lifted}`;
        } else if (ok) {
          out.text = v ? `Too late for ${v.name}: ${he(v)} starves before the meat could be carried home. ${stays}` : `They can reach ${it}, but it does not change what is coming: ${r.text} ${stays}`;
        } else {
          const why = reach.slice().sort((p, q) => (p.steps ?? 1e9) - (q.steps ?? 1e9))[0]?.why ?? 'The deer could not stand there.';
          out.text = `${why} ${stays}`;
        }
        return out;
      }
      if (power === 'bless-harvest' && r.kind === 'hunger') {
        const b = rainBefore && rainBefore.clock === S.clockT ? rainBefore.fams.get(f) : null;
        // (gone, but not for this rain: it fell short of their fields)
        if (met && b && !b.inRing) {
          out.met = null; out.head = '';
          out.text = `${Name} has food again, so the warning is lifted, but not by this rain: it fell ${num(b.near)} ${b.near === 1 ? 'step' : 'steps'} short of their fields.`;
        } else if (met) {
          // (the ripened crop stands in the field until it is cut and carried home: say what it holds)
          const ripe = f && S.peopleApi.ripeOf ? S.peopleApi.ripeOf(f) : null;
          const st = f && ripe == null ? R.ask('foodStore', f) : null;
          const held = ripe != null ? ` About ${yrs(Math.max(1, Math.round(ripe / Math.max(0.01, S.peopleApi.needOf(f)) / LR())))} of their food stands ready to bring in.` : st?.text ? ` ${st.text}` : '';
          out.text = `Rain on ${name}'s fields: the crop ripens at once.${held}${v ? ` ${v.name} no longer starves.` : ''} ${lifted}`;
        } else if (b && !b.inRing) out.text = `The rain missed ${name}'s fields: it fell ${num(b.near)} ${b.near === 1 ? 'step' : 'steps'} short of them. ${stays}`;
        else if (b && !b.fields) out.text = `${Name} has no field yet for the rain to water. ${stays}`;
        else if (b && b.watered) out.text = `You watered ${name}'s fields lately: this rain brings no new harvest. ${stays}`;
        else if (b && !b.sown) out.text = `${Name}'s fields lie bare${S.peopleApi.season?.().name === 'winter' ? ' for the winter' : ', not sown again yet'}: there is no crop for the rain to ripen. ${stays}`;
        else out.text = `The rain helped, but not enough: ${r.text} ${stays}`;
        return out;
      }
      if (r.kind === 'drought') {
        const d = r.event?.drought;
        if (met) out.text = `Rain ends the drought over ${name}: their fields give full food again. ${lifted}`;
        else {
          const gap = d ? Math.max(0, Math.round(Math.hypot(d.x - a.x, d.z - a.z) - (d.r ?? 0) - (a.r ?? 0))) : null;
          out.text = gap ? `The rain missed the drought: it fell ${num(gap)} ${gap === 1 ? 'step' : 'steps'} from its edge. ${stays}` : `The drought holds: ${r.text} ${stays}`;
        }
        return out;
      }
      if (r.kind === 'fire' || r.how === 'fire') {
        out.text = met ? `Rain puts the fire out: ${r.title.replace(/[.]$/, '')} will not happen now. ${lifted}` : `The rain did not reach the fire. ${stays}`;
        return out;
      }
      out.text = met ? `${r.title.replace(/[.]$/, '')}: it no longer comes to pass. ${lifted}` : `${r.text} ${stays}`;
      return out;
    }
    R.on('family:arrive', () => {});

    // ---------- each step ----------
    R.on('step', ({ dt }) => {
      evalT += dt;
      if (evalT < F.EVAL_S) return;
      evalT = 0;
      look();
      wolfArrivals();
      watchHardships();
      // the options of the most pressing records are checked again now and then (real time; not during a skip)
      // (in a skip ahead, by the walking clock instead: every 4 game seconds)
      if (quiet() ? S.clockT - optClock > 4 : nowReal() - optT > F.OPTIONS_S * 1000) {
        optT = nowReal(); optClock = S.clockT;
        const list = [...live.values()].sort((a, b) => urgency(b) - urgency(a)).slice(0, 8);
        for (const r of list) { try { refreshOptions(r); } catch { /* skip */ } }
      }
    });
    const urgency = (r) => (SEV_RANK[r.sev] ?? 1) * 100 / (20 + (r.scale === 'secs' ? r.atClock - S.clockT : (r.atYear - S.year) * R.ctx.clock.secondsPerYear));

    // ---------- queries ----------
    R.answer('foresight', () => [...live.values()].map(view));
    R.answer('foresightNow', () => ({ year: S.year, clock: S.clockT, level: F.LEVEL }));
    R.answer('foresightLog', (n = 50) => log.slice(-n).map(view));
    R.answer('foresightAccuracy', () => {
      const by = {};
      for (const a of acc) {
        const k = a.how ? `${a.kind}:${a.how}` : a.kind;
        const b = by[k] ?? (by[k] = { n: 0, scale: a.scale, meanAbsErr: 0, maxAbsErr: 0, meanLead: 0, rows: [] });
        b.n++; b.meanAbsErr += Math.abs(a.err); b.maxAbsErr = Math.max(b.maxAbsErr, Math.abs(a.err)); b.meanLead += a.stated; b.rows.push(a);
      }
      for (const b of Object.values(by)) { b.meanAbsErr = round(b.meanAbsErr / b.n); b.meanLead = round(b.meanLead / b.n); b.rows = b.rows.slice(-8); }
      return { by, withdrawn: log.filter((r) => r.end === 'withdrawn').length, landed: log.filter((r) => r.end === 'landed').length };
    });
    R.answer('foresightLevel', (lv) => {
      if (lv && F.LEVELS[lv] && lv !== F.LEVEL) {
        F.LEVEL = lv; evalT = F.EVAL_S;
        // what now lies beyond the level's reach is simply not shown yet (nothing changed in the world)
        for (const r of [...live.values()]) {
          const left = r.scale === 'secs' ? r.atClock - S.clockT : r.atYear - S.year;
          const kk = r.kind === 'floodSick' ? 'floodSick' : r.kind;
          const max = r.scale === 'secs' ? horizonS(kk) : horizonY(kk);
          if (left > max) live.delete(r.key);
        }
      }
      return { level: F.LEVEL, levels: Object.entries(F.LEVELS).map(([id, v]) => ({ id, label: v.label, words: v.words, mul: v.mul })) }; });
    R.answer('foresightLook', () => { look(); return [...live.values()].map(view); });
    R.answer('lastAnswer', () => lastAnswer);

    // ---------- console set-ups that make each kind happen (testing; game.modules.sim.ask('foresight:dev')) ----------
    const dev = {
      settled: () => S.families.filter((f) => f.state === 'settled' && f.home?.done),
      // a family with no food and no fields: the store falls, then they starve
      hunger(f = dev.settled()[0], years = 3) { if (!f) return null; f.food = S.peopleApi.needOf(f) * years; for (const fl of f.fields) fl.care = 0; R.mod('yield', 'foresight:dev:hunger', { mul: 0, who: f, note: 'a test: no food comes in' }); return f.name; },
      feed(f) { R.unmod('yield', 'foresight:dev:hunger'); if (f) f.food = S.peopleApi.needOf(f) * 6; },
      // a family made miserable: they will leave
      unhappy(f = dev.settled()[0]) { if (!f) return null; R.mod('happy', 'foresight:dev:unhappy', { add: -60, who: f, note: 'a test: misery' }); return f.name; },
      cheer() { R.unmod('happy', 'foresight:dev:unhappy'); },
      // a sickness that kills this person
      sick(p = S.people.find((q) => alive(q) && q.family.state === 'settled' && q.stage === 'adult')) { const h = H(); if (!h || !p) return null; const hh = h.sick.start({ person: p, pre: new Map([[p, { len: 2.5, die: true, dieIn: 1.6 }]]) }); return hh ? p.name : null; },
      // a wolf on someone, fated to kill
      wolf(p = S.people.find((q) => alive(q) && q.family.state === 'settled' && !q.hidden && q.stage === 'adult')) {
        if (!p) return null; const w = S.animalsApi.spawnWolf(); if (!w) return null;
        w.x = p.x + 24; w.z = p.z + 4; w.y = p.y; w.prey = p; w.state = 'stalk'; w.repathT = 0; w.huntT = 0; w.outcome = 'kill'; return `${w.name} on ${p.name}`;
      },
      // a hut set alight with someone inside
      fire(f = dev.settled()[0]) { const h = H(); if (!h || !f?.home) return null; const inside = f.members.filter(alive); for (const m of inside) { if (!m.inside) S.peopleApi.enterHome(m, f.home); } const pre = new Map(inside.slice(0, 1).map((m) => [m, true])); h.fire.start({ x: f.home.cx, z: f.home.cz, r: 0, hut: f.home, cause: 'a hearth', pre }); return f.name; },
      // a grass fire some way off a home
      grassFire(f = dev.settled()[0], d = 12) { const h = H(); if (!h || !f?.home) return null; h.fire.start({ x: f.home.cx + d, z: f.home.cz, r: 2, cause: 'lightning' }); return f.name; },
      // a raid queued for the next dawn between the two biggest clans
      raid() { const A = R.ask('fights:api'), C = R.ask('clans:api'); if (!A || !C) return null; const cs = C.liveClans?.() ?? []; if (cs.length < 2) return null; const [a, b] = cs; C.add?.(a, b, 70, 'test'); A.queue(a, b, { kind: 'raid' }); return `${a.name} on ${b.name}`; },
      grudge() { const C = R.ask('clans:api'); const cs = C?.liveClans?.() ?? []; if (cs.length < 2) return null; C.add?.(cs[0], cs[1], 40, 'test'); return `${cs[0].name} > ${cs[1].name}`; },
      flood(f = dev.settled()[0], sickIn = 3) { const h = H(); if (!h || !f?.home) return null; const P = h.water.planFlood(f.home.cx, f.home.cz, 16); if (!P) return null; h.water.startFlood({ plan: P, years: 10, sickIn }); return P.families.map((x) => x.name); },
      drought(f = dev.settled()[0]) { const h = H(); if (!h || !f?.home) return null; h.water.startDrought({ x: f.home.cx, z: f.home.cz }); return f.name; },
      wolfSoon(years = 4) { S.predNext = S.year + years; return yl(S.predNext); },
      list: () => [...live.values()].map((r) => `${r.key} ${r.scale === 'secs' ? `${round(r.atClock - S.clockT)} s` : `${round(r.atYear - S.year)} y`}: ${r.text}`),
      acc: () => acc.slice(),
      log: () => log.slice(),
    };
    R.answer('foresight:dev', () => dev);
  },
};
