// Both futures, always (the director: "i want both futures plainly. we are omniscient."). For every decision the
// game puts to the god, a true, plain, two column account: IF YOU ACT and IF YOU DO NOTHING, each saying who lives
// and who dies and when, what it does to the land and the herds, what follows years on (the uses of ecology.js and
// the turning points of turning.js), and who would see it. Both columns are what the simulation then does: the act
// column is the power's own forecast (built from the functions its act uses) plus what the ecology and the turning
// points then carry out; the do-nothing column is read from the very fates, hardships and rates the simulation will
// play out if nothing changes. A third future is offered rarely, and only when it truly works.
//
// The shape (on every ok forecast, `forecast.futures`; for warnings, the query `warningFutures(id or key)`):
//   { act: Future, wait: Future, third?: Future & { label, how } }
//   Future = { headline: text (one line), key: [text] (the few lines that matter most), full: [text] (every thread),
//              who: text (who would see it), deaths: [{ name, id, year, how }], lives: [{ name, id, until }] }
// The old `fates` and `later` fields of the forecast are left exactly as they were.
import { yearLabel, number, cap } from './words.js';
let hardshipApi = () => null;
try { ({ hardshipApi } = await import('./hardship.js')); } catch { /* fewer threads */ }

export const TUNE_FUTURES = {
  KEY_LINES: 4,        // the middle depth: this many lines
  PROJECT_YEARS: 30,   // how far ahead the herds are told
  THIRD_MARGIN: 0.6,   // a third future (wait for night) only when death is at least this many life years past nightfall
};
const F = TUNE_FUTURES;

export default {
  id: 'futures',
  tune: TUNE_FUTURES,
  init(R) {
    const { S } = R;
    const T = R.T;
    const H = () => hardshipApi();
    const LR = () => T.LIFE_RATE;
    const yl = yearLabel;
    const alive = (p) => p && !p.dead;
    const he = (p) => (p.sex === 'f' ? 'she' : 'he'), his = (p) => (p.sex === 'f' ? 'her' : 'his');
    const eco = () => S.eco;
    const E = () => R.tune('ecology') ?? {};

    // ---------- when and how a person dies, if nothing changes ----------
    function endYear(p) {
      const e = S.mind.endOf(p), d = p.ext?.hardship;
      if (e.how === 'wolf' || e.how === 'fire' || e.how === 'fight') return { e, year: S.year, soon: true };
      if (e.how === 'sickness' && d?.sick?.dieAt != null) return { e, year: S.year + (d.sick.dieAt - S.life) / LR() };
      if (e.how === 'wounds' && d?.wound?.dieAt != null) return { e, year: S.year + (d.wound.dieAt - S.life) / LR() };
      return { e, year: S.year + Math.max(0, e.age + 0.5 - p.age) / LR() };
    }
    const deathWords = (e) => e.words ?? (e.how === 'wolf' ? `taken by a wolf at ${e.age}` : e.how === 'hunger' ? `of hunger at ${e.age}` : `of old age at ${e.age}`);
    function deathLine(p) {
      const { e, year, soon } = endYear(p);
      return { text: `${p.name} dies ${deathWords(e)}${soon ? ', within moments' : `, in ${yl(year)}`}.`, death: { name: p.name, id: p.id, year: Math.floor(year), how: e.how } };
    }
    function lifeLine(p) {
      const n = p.stage === 'child' ? 0 : (S.mind.childrenAhead(p)?.length ?? 0);
      const until = S.year + Math.max(0, p.lifespan - p.age) / LR();
      return { text: `${p.name} lives to ${Math.floor(p.lifespan)} (${yl(until)})${n ? ` and has ${number(n)} more ${n === 1 ? 'child' : 'children'}` : ''}.`, life: { name: p.name, id: p.id, until: Math.floor(until) } };
    }
    // what follows from a turning point: branch 'death' (they die now or as fated) or 'life'
    const tp = (p, branch, cause) => { const r = R.ask('turningIf', p, branch, cause); return r?.text ? `${r.rec.title}: ${r.text}` : null; };
    // an elder kept alive holds the young back (ecology.js)
    function elderLine(p, saved) {
      if (p.stage !== 'elder' || p.age < (E().ELDER_HOLD_AGE ?? 58)) return null;
      const held = eco()?.heldBackBy?.(p) ?? [];
      if (!held.length) return null;
      const names = held.map((q) => q.name).join(' and ');
      return saved ? `${names} ${held.length === 1 ? 'defers' : 'defer'} to ${p.name} until ${he(p)} dies (${yl(S.year + (p.lifespan - p.age) / LR())}): ${held.length === 1 ? 'thinks' : 'they think'} a quarter slower while ${he(p)} lives.`
        : `When ${p.name} dies, ${names} ${held.length === 1 ? 'takes' : 'take'} over the hut and the field, and think${held.length === 1 ? 's' : ''} freely.`;
    }
    const sickName = (k) => R.deathWords(k)?.replace(/^died of /, '') ?? k;

    // ---------- the column builder: lines with weights, then the three depths ----------
    function column() { const L = [], deaths = [], lives = []; return { L, deaths, lives, add(text, w = 1, extra) { if (extra?.death) deaths.push(extra.death); if (extra?.life) lives.push(extra.life); if (text) L.push({ text, w }); } }; }
    function finish(col, headline, who) {
      const seen = new Set(), L = col.L.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
      const key = [...L].sort((a, b) => b.w - a.w).slice(0, F.KEY_LINES).map((x) => x.text);
      return { headline, key, full: L.map((x) => x.text), who: who ?? '', deaths: col.deaths, lives: col.lives };
    }
    const herdWords = (pr) => `about ${number(pr.deer)} deer and ${number(pr.wolves)} ${pr.wolves === 1 ? 'wolf' : 'wolves'}${pr.browse > 0.05 ? `, the grazers eating about ${Math.round((E().BROWSE_FIELD ?? 0.35) * pr.browse * 100)} in a hundred of the food` : ''}`;
    const herdIn = (delta) => eco()?.project?.(F.PROJECT_YEARS, delta);
    const UNSEEN = 'Nobody sees anything: nobody\'s faith or skepticism changes.';
    const actSeen = (f) => f.who || (f.seenBy ? `${f.seenBy} would see it.` : UNSEEN);

    // the forecast's own lines go into the act column (they are what the act does)
    function fromForecast(col, f) {
      for (const t of f.fates ?? []) col.add(t, 4);
      for (const t of f.gains ?? []) if (!/^Nothing( anyone needs)?\.?$/.test(t)) col.add(t, 3);
      for (const t of f.costs ?? []) if (t !== 'Nothing.' && !/^Each who sees it/.test(t)) col.add(t, 2);
      for (const t of f.later ?? []) col.add(`Later: ${t}`, 0.5);
    }

    // ---------- per power ----------
    const P = {};
    P.strike = (t, f, act, wait) => {
      const a = f.target ?? t.entity;
      if (!a) return null;
      if (a.kind === 'person') {
        act.add(`${a.name} dies now, at ${Math.floor(a.age)}.`, 5, { death: { name: a.name, id: a.id, year: Math.floor(S.year), how: 'struck down' } });
        act.add(tp(a, 'death', 'struck down'), 4.5);
        act.add(elderLine(a, false), 2);
        const d = endYear(a);
        if (d.e.how === 'old age') { const l = lifeLine(a); wait.add(l.text, 5, { life: l.life }); } else { const l = deathLine(a); wait.add(l.text, 5, { death: l.death }); }
        wait.add(tp(a, d.e.how === 'old age' ? 'life' : 'death', d.e.how), 4.5);
        wait.add(elderLine(a, true), 2);
        return { act: `${a.name} dies now; ${f.seenBy ? 'seen' : 'unseen'}.`, wait: d.e.how === 'old age' ? `${a.name} lives to ${Math.floor(a.lifespan)}.` : `${a.name} dies ${deathWords(d.e)} anyway.` };
      }
      if (a.species === 'wolf') {
        const W = eco()?.residents?.().length ?? 0;
        const r = eco()?.rates?.(S.animals.filter((x) => x.species === 'deer' && !x.dead).length, S.animals.filter((x) => x.species === 'rabbit' && !x.dead).length);
        const prey = a.prey?.kind === 'person' && alive(a.prey) ? a.prey : null;
        const kills = prey && a.outcome === 'kill';
        if (kills) {
          const l = lifeLine(prey);
          act.add(`${prey.name} is safe from it. ${l.text}`, 5, { life: l.life });
          act.add(tp(prey, 'life'), 4.5);
          wait.add(`The wolf kills ${prey.name} within moments, at ${Math.floor(prey.age)}.`, 5, { death: { name: prey.name, id: prey.id, year: Math.floor(S.year), how: 'wolf' } });
          wait.add(tp(prey, 'death', 'wolf'), 4.5);
          wait.add(elderLine(prey, false), 1.5);
        } else if (prey) wait.add(`${prey.name} ${a.outcome === 'wound' ? 'is bitten, and lives' : 'sees it in time and gets away'}.`, 4);
        if (a.resident && eco()) {
          const now = herdIn(0), after = herdIn(-1);
          if (W <= 1) act.add(`No wolf is left to thin the herds. In ${F.PROJECT_YEARS} years, if you keep them out: ${herdWords(after)}. Left alone, wolves follow the deer back out of the mist (on average in about ${Math.round(1 / (E().WOLF_ARRIVE ?? 0.1))} years).`, 3.5);
          else act.add(`${cap(number(W - 1))} ${W - 1 === 1 ? 'wolf is' : 'wolves are'} left. In ${F.PROJECT_YEARS} years: ${herdWords(after)}.`, 3);
          wait.add(`The wolf keeps taking about ${Math.round((r?.deer ?? 1) * 10) / 10} deer a life year, the old and the young first. In ${F.PROJECT_YEARS} years: ${herdWords(now)}.`, 3);
          if (a.manHunt) wait.add('It is hungry: it will go for a person alone at the edge.', 2.5);
          else if (a.weakHunt) wait.add('It is watching for someone weak: a child, an elder, the sick.', 2.5);
          else wait.add('Fed, it leaves people alone.', 1.5);
        }
        return { act: kills ? `${prey.name} lives; one wolf fewer on the deer.` : 'One wolf fewer on the deer.', wait: kills ? `${prey.name} dies; the wolf keeps the deer down.` : 'The wolf keeps the deer down.' };
      }
      if (a.species === 'deer' || a.species === 'rabbit') {
        wait.add(eco()?.noWolvesWords?.() || 'The herds go on as they are.', 1);
        return { act: `One ${a.species} fewer.`, wait: 'Nothing changes.' };
      }
      return null;
    };
    function peopleIn(t) {
      if (t?.kind === 'person') return t.entity && !t.entity.dead ? [t.entity] : [];
      if (t?.kind === 'area') return S.people.filter((p) => !p.dead && p.family?.state === 'settled' && Math.hypot(p.x - t.x, p.z - t.z) <= (t.r ?? 0) + 0.5);
      return [];
    }
    P.heal = (t, f, act, wait, ctx) => {
      const plans = peopleIn(t).map((p) => H()?.sick.healPlan(p)).filter(Boolean);
      if (!plans.length) return null;
      const fatal = plans.filter((x) => x.fatal);
      for (const x of plans) {
        const p = x.p;
        if (x.fatal) {
          const d = deathLine(p);
          wait.add(d.text, 5, { death: d.death });
          wait.add(tp(p, 'death', x.end?.how), 4.5);
          wait.add(elderLine(p, false), 2);
          act.add(tp(p, 'life'), 4.5, { life: lifeLine(p).life });
          act.add(elderLine(p, true), 2.5);
        } else if (x.sick) wait.add(`${p.name} gets over ${x.sick.the} by ${yl(S.year + (x.sick.until - S.life) / LR())}, and is never sick with it again.`, 3);
        if (x.sick) {
          act.add(`${p.name} never fought ${x.sick.the}: ${he(p)} can catch it again in ${Math.round((E().HEALED_COVER ?? 3) / LR())} years, and ${his(p)} children are none the hardier.`, 2.2);
          if (!x.fatal) wait.add(`${p.name}'s children will be hardier against sickness.`, 1.2);
        }
        if (x.wound && !x.fatal) wait.add(`${p.name}'s ${x.wound.cause === 'fire' ? 'burns heal' : 'wound heals'} by ${yl(S.year + (x.wound.until - S.life) / LR())}.`, 2);
      }
      // a third future: the same cure after nightfall, when nobody is awake to see it
      if (f.seenBy > 0 && fatal.length) {
        const night = R.T.DAY_SECONDS, dayT = S.dayT ?? 0;
        const toNight = dayT >= 0.7 || dayT < 0.02 ? 0 : (0.7 - dayT) * night; // game seconds
        const lifeToNight = toNight / Math.max(1e-6, R.ctx.clock.secondsPerYear) * LR();
        const soonest = Math.min(...fatal.map((x) => (x.end && endYear(x.p).year - S.year) * LR()));
        if (toNight > 0 && soonest - lifeToNight > F.THIRD_MARGIN) {
          ctx.third = { label: 'Wait for nightfall, then heal', how: `Night falls in about ${Math.max(1, Math.round(toNight))} seconds. Heal then, while everyone is asleep indoors.`,
            headline: `${fatal.map((x) => x.p.name).join(' and ')} ${fatal.length === 1 ? 'is' : 'are'} cured all the same, and nobody awake sees it.`,
            key: [`Night falls in about ${Math.max(1, Math.round(toNight))} seconds; ${fatal.map((x) => `${x.p.name} would not die before ${yl(endYear(x.p).year)}`).join('; ')}.`, 'The same cure, with nobody awake to see it: nobody\'s faith or skepticism changes, and nobody comes to lean on you.'],
            full: [], who: 'Nobody awake: they are asleep indoors.', deaths: [], lives: fatal.map((x) => lifeLine(x.p).life) };
          ctx.third.full = [...ctx.third.key];
        }
      }
      const names = fatal.map((x) => x.p.name).join(' and ');
      return { act: fatal.length ? `${names} ${fatal.length === 1 ? 'lives' : 'live'}.` : 'They are well at once.', wait: fatal.length ? `${names} ${fatal.length === 1 ? 'dies' : 'die'}.` : 'They get well by themselves, and immune for life.' };
    };
    P['bless-harvest'] = (t, f, act, wait) => {
      if (t?.kind !== 'area') return null;
      const r = Math.max(1, t.r ?? 6), h = H();
      const mid = (b) => ({ x: b.mx ?? b.cx ?? b.x, z: b.mz ?? b.cz ?? b.z });
      const fams = S.families.filter((x) => x.state === 'settled' && ((x.home && Math.hypot(x.home.cx - t.x, x.home.cz - t.z) <= r + 2) || x.fields.some((fl) => Math.hypot(mid(fl).x - t.x, mid(fl).z - t.z) <= r + 3)));
      // fed: only a family with a sown field has a crop for the rain to ripen (powers-nature.js rainPlan)
      const hungry = fams.filter((x) => x.fields.some((fl) => fl.done && !fl.bare)).flatMap((x) => x.members.filter((m) => !m.dead && S.mind.endOf(m).how === 'hunger'));
      const droughts = h?.water.droughts().filter((d) => Math.hypot(d.x - t.x, d.z - t.z) <= d.r + r) ?? [];
      for (const m of hungry) { const d = deathLine(m); wait.add(d.text, 5, { death: d.death }); wait.add(tp(m, 'death', 'hunger'), 4.5); act.add(tp(m, 'life'), 4.5, { life: lifeLine(m).life }); }
      for (const d of droughts) wait.add(`The drought lasts until about ${yl(d.until)}, then breaks by itself.`, 3);
      const lean = hungry.length || droughts.length;
      if (lean) {
        const nd = R.ask('nextDiscovery');
        wait.add(`Come through it with no help, they learn: for about ${Math.round((E().LEAN_STORE_YEARS ?? 30) / LR())} years they keep a quarter more in store and get about ${Math.round(((E().LEAN_YIELD ?? 1.15) - 1) * 100)} in a hundred more from their fields, and they think harder about food (a push toward ${nd ? nd.name.toLowerCase() : 'the next discovery'}).`, 3.2);
        act.add('Helped through it, they learn nothing from these lean years: no bigger store, no harder work, no push toward the next discovery.', 2.5);
      }
      const b = eco()?.browse?.() ?? 0;
      if (b > 0.05 && fams.length) act.add(`${eco().noWolvesWords() || 'The herds are many.'} The green of the watered fields draws the deer: they eat about ${Math.round(Math.min(0.65, (E().BROWSE_FIELD ?? 0.5) * b * (E().BROWSE_LUSH ?? 1.4)) * 100)} in a hundred of what those fields give while they stay green.`, 3);
      const fire = h?.fire.preview(t.x, t.z, r);
      if (fire?.cells) wait.add('The fire burns on. Fields it burns grow back richer from the ash, and the woods there are young again.', 1.5);
      if (!fams.length) return { act: 'Rain on the wilds.', wait: 'Nothing changes.' };
      return { act: hungry.length ? `${hungry.map((m) => m.name).join(' and ')} ${hungry.length === 1 ? 'is' : 'are'} fed.` : 'Their fields are watered.', wait: hungry.length ? `${hungry.map((m) => m.name).join(' and ')} ${hungry.length === 1 ? 'starves' : 'starve'}${lean ? '; the rest learn from it' : ''}.` : droughts.length ? 'The drought runs its course; they learn from it.' : 'Nothing changes.' };
    };
    P['send-sickness'] = (t, f, act, wait) => {
      const list = peopleIn(t);
      for (const p of list) {
        const fated = (f.fates ?? []).some((x) => x.startsWith(`${p.name} falls sick`) && /dies of it/.test(x));
        if (fated) { act.add(tp(p, 'death', 'sickness'), 4.5); act.add(elderLine(p, false), 2); }
        else act.add(`${p.name}, once well, is immune to it for life, and ${his(p)} children hardier.`, 2.5);
        const d = endYear(p);
        wait.add(d.e.how === 'old age' ? lifeLine(p).text : deathLine(p).text, 3);
      }
      if (eco()?.unexposed?.()) wait.add('Few here have come through a sickness: when one comes by itself (newcomers bring them), it will go hard.', 2);
      return { act: 'They fall sick.', wait: 'Nothing changes.' };
    };
    P['send-fire'] = (t, f, act, wait) => {
      const E0 = E(), over = eco()?.overgrownAt?.(t.x, t.z);
      act.add(`Fields it burns grow back about ${Math.round((E0.ASH_RICH ?? 0.25) * 100)} in a hundred richer from the ash; the woods it burns are young again and will not burn so hard for about ${E0.OVERGROWN_FROM ?? 80} years.`, 2.5);
      if (over) { act.add('These woods have not burned in a long time: they are dense, and it will burn hard and far.', 3); wait.add(`These woods have not burned in a long time: the next fire here, when lightning brings it, burns up to ${E0.OVERGROWN_FUEL ?? 1.9} times as hard.`, 2.5); }
      return { act: 'It burns.', wait: 'Nothing burns, for now.' };
    };
    P['send-flood'] = (t, f, act) => {
      const E0 = E();
      act.add(`When it goes down, the fields it covered are about ${Math.round((E0.SILT_RICH ?? 0.3) * 100)} in a hundred richer from the silt, and families near the water eat fish and reeds for about ${Math.round((E0.FISH_YEARS ?? 20) / LR())} years.`, 2.5);
      return { act: 'The water rises.', wait: 'Nothing changes.' };
    };
    P.calm = (t, f, act, wait) => {
      const A = R.ask('fights:api');
      const p = t.entity;
      const fight = A?.active?.find((x) => (x.attackers ?? []).includes(p) || (x.defenders ?? []).includes(p));
      if (fight) {
        wait.add(`${cap(fight.label ?? 'the fight')} goes ahead. Its survivors come out of it hardened, and it may end in a promised marriage that cools the feud.`, 2.5);
        act.add('No fight: nobody is hardened by it, and no marriage comes of it.', 2);
      }
      return null;
    };
    P.provoke = P.calm;
    // Resurrect (resurrect.js): its forecast names both heads (who rises, and how; or that they stay in the grave)
    P.resurrect = (t, f, act, wait) => { if (!f.heads) return null; wait.add(f.heads.wait, 5); return { act: f.heads.act, wait: f.heads.wait }; };

    // the foresight records about this target (what the warnings say happens if nothing is done)
    function warningsFor(t) {
      const list = R.ask('foresight') ?? [];
      const e = t?.entity;
      if (e) return list.filter((w) => w.subject === e || (w.people ?? []).some((q) => q.id === e.id));
      if (t?.x == null) return [];
      // near the spot, or about a family whose home or a field lies under it (rain is aimed at fields, warnings sit on homes)
      const r = (t.r ?? 0);
      const under = (fam) => { const f = fam && S.families.find((x) => x.id === fam.id); if (!f) return false;
        return (f.home && Math.hypot(f.home.cx - t.x, f.home.cz - t.z) <= r + 2) || f.fields.some((fl) => Math.hypot((fl.mx ?? fl.cx) - t.x, (fl.mz ?? fl.cz) - t.z) <= r + 3); };
      return list.filter((w) => w.kind !== 'line' && ((w.x != null && Math.hypot(w.x - t.x, w.z - t.z) <= r + 2) || under(w.family)));
    }

    function build(id, t, f) {
      const act = column(), wait = column(), ctx = {};
      fromForecast(act, f);
      let heads = null;
      try { heads = P[id]?.(t, f, act, wait, ctx) ?? null; } catch (err) { console.warn('futures: power', id, err); }
      // the warnings' do-nothing lines, for powers with no reading of their own
      // the live warnings about this target: their do-nothing outcome goes in the wait column, and leads it when the
      // power's own reading found nothing (2026-11-13: rain on a starving family said "Nothing changes" beside the
      // warning "Mian starves in 34 years")
      const warned = warningsFor(t).filter((w) => w.nothing).slice(0, 3);
      const outcome = (w) => w.nothing.replace(/^Do nothing: /, '').replace(/^./, (c) => c.toUpperCase()).replace(/\.?$/, '.');
      for (const w of warned) wait.add(outcome(w), 4.6);
      if (!wait.L.length) wait.add('Nothing changes: things go on as they are.', 1);
      const actWho = actSeen(f);
      const actHead = heads?.act ?? ((f.gains ?? []).find((g) => !/^Nothing/.test(g)) ?? 'It is done.');
      const quietHead = !heads?.wait || /^Nothing changes/.test(heads.wait);
      const waitHead = warned.length && quietHead ? outcome(warned[0]) : heads?.wait ?? (wait.L.sort((a, b) => b.w - a.w)[0]?.text ?? 'Nothing changes.');
      const out = { act: finish(act, actHead, actWho), wait: finish(wait, waitHead, UNSEEN) };
      if (ctx.third) out.third = ctx.third;
      return out;
    }
    // every power's forecast, after the other extenders (this file loads last)
    R.on('forecast', ({ id, target, forecast }) => {
      try { forecast.futures = build(id, target, forecast); } catch (err) { console.warn('futures: build', id, err); }
    });

    // ---------- a warning's two futures ----------
    // act: the first option whose own forecast works, as that forecast's futures say; wait: the warning's own course,
    // with the turning points and the uses that follow
    R.answer('warningFutures', (idOrKey) => {
      const list = R.ask('foresight') ?? [];
      const w = list.find((x) => x.id === idOrKey || x.key === idOrKey);
      if (!w) return null;
      const wait = column();
      wait.add(w.text, 5);
      const subj = w.subject?.kind === 'person' ? w.subject : null;
      if (subj && alive(subj)) {
        if (w.kind === 'death' || w.kind === 'hunger') { wait.add(tp(subj, 'death', w.how ?? (w.kind === 'hunger' ? 'hunger' : undefined)), 4.5); wait.add(elderLine(subj, false), 2); }
      }
      if (w.kind === 'hunger' || w.kind === 'drought') { const nd = R.ask('nextDiscovery'); wait.add(`Come through it with no help, they keep a quarter more in store and work their fields harder for years, and think harder about food (a push toward ${nd ? nd.name.toLowerCase() : 'the next discovery'}).`, 3); }
      if (w.kind === 'wolf') wait.add('A wolf follows the deer: it will mostly take deer and rabbits, and now and then someone weak alone at the edge.', 2.5);
      for (const c of w.cause ?? []) wait.add(c, 1);
      const opt = (w.options ?? []).find((o) => o.works) ?? (w.options ?? [])[0];
      let act = null, third = null;
      if (opt?.power === 'deer') {
        // a deer by the door (the Animals tool): no power forecast; hunting.js says who hunts it and how well
        const f = w.family ? S.families.find((x) => x.id === w.family.id) : null;
        const feeds = f ? R.ask('deerFeeds', f) : null;
        const col = column();
        if (feeds?.works) {
          col.add(`${feeds.hunter.name} goes after it with a spear: about ${Math.round(feeds.hit * 100)} in 100 throws kill a deer put down fresh, and a deer is about ${feeds.meat} years of one grown-up's eating.`, 5);
          const doomed = f.members.filter((m) => alive(m) && (S.mind.endOf(m).how === 'hunger' || (w.kind === 'hunger' && w.subject === m)));
          for (const m of doomed) col.add(tp(m, 'life'), 4.5, { life: lifeLine(m).life });
          if (doomed.length) col.add(`${doomed.map((m) => m.name).join(' and ')} ${doomed.length === 1 ? 'eats' : 'eat'} again and ${doomed.length === 1 ? 'lives' : 'live'}.`, 4.8);
          col.add('Fed by you, they learn nothing from these lean years.', 2);
          col.add('A deer nobody hunts joins the herds, and the herds eat the fields.', 1);
        } else col.add(feeds?.why ?? 'A deer would not help them now.', 5);
        act = { ...finish(col, feeds?.works ? `${feeds.hunter.name} hunts it, and the family eats.` : 'It would not feed them now.', opt.seenBy ? `${opt.seenBy === 1 ? 'One person' : `${cap(number(opt.seenBy))} people`} would see it appear out of nowhere.` : 'Nobody sees it appear: to them it just walked up.'), option: { power: opt.power, label: opt.label } };
      } else if (opt) {
        const fc = R.forecast(opt.power, opt.target ? { ...opt.target } : null);
        if (fc?.ok && fc.futures) {
          // no option would change the outcome now: say so first, then what the nearest one would still do
          const head = opt.works === false ? `${opt.label} would not stop it now. ${fc.futures.act.headline}` : fc.futures.act.headline;
          act = { ...fc.futures.act, headline: head, option: { power: opt.power, label: opt.label, works: opt.works !== false } }; third = fc.futures.third ?? null;
        }
      }
      // the three forces' warnings: what each future means for the line, the clan, the village
      if (w.kind === 'blessed') {
        const l = (R.ask('lines') ?? []).find((x) => `blessed:${x.id}` === w.key);
        if (l && act?.headline && opt?.works) act = { ...act, key: [`A mark on ${l.name}: it stays blessed${l.nextMarkIn ? ` (once the next help can count, in ${l.nextMarkIn} years)` : ''}, and a gifted child is still born to them each generation.`, ...act.key].slice(0, F.KEY_LINES) };
        wait.add('No gifted child is born to them after the blessing goes; the ones already born keep their gift.', 3);
      }
      if (w.kind === 'great' || w.kind === 'chief' || w.kind === 'peace') for (const c of w.cause ?? []) wait.add(c, 3);
      const out = { act: act ?? { headline: 'There is nothing you can do about it.', key: [], full: [], who: '', deaths: [], lives: [], option: null }, wait: finish(wait, w.nothing ? w.nothing.replace(/^Do nothing: /, '').replace(/^./, (c) => c.toUpperCase()) : w.text, UNSEEN) };
      if (third) out.third = third;
      return out;
    });
    void yl;
  },
};
