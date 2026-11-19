// Turning points (DESIGN.md "Deaths that carry the plan"; docs/CHOICES.md). Some people matter to the future far
// more than others, and the all-knowing god can see it. When a person's situation calls for it (a yearly look at
// everyone, and the moment they become fated to die), the simulation may fix ONE turning point on their life:
// something large that follows from their death before a set year, or from their living past it, which the
// simulation then carries out, exactly as stated. Most make a death useful and a rescue costly ("sometimes you
// have to let people die"); some run the other way, so letting everyone die is no answer either.
//
// One system of consequences: the older "saved people cause trouble later" rolls (hardship-trouble.js: hoarder,
// raider, preacher, firebrand) now go through this file first. When someone becomes fated to die, `turning:danger`
// decides: a turning point of the death-useful kind is fixed (and no trouble is rolled), or the trouble roll goes on
// as before. Both kinds are listed together by `turningPoints()`, shown in "What hangs on this life", and marked
// with the trait `turning` ('death' when the death is the useful branch, 'life' when the life is).
//
// Kinds: grief (a child turns grief into the next discovery), founder (the widow or widower clears new ground),
// wall (a death by a wolf makes the village hedge itself in), feud (an elder's death lets the young end a feud),
// warlord (a child: dead, the clan hardens; grown, a warlord), healer, peacemaker and thinker (their living matters).
import { yearLabel, number, cap, pick, range } from './words.js';
import { B } from '../world/blocks.js';
import { RES } from './land.js';

export const TUNE_TURNING = {
  SCAN_RATE: 0.0025,   // chance a calendar year that a settled person without one gets a turning point fixed, if one fits
  DANGER_SHARE: 0.4,  // when someone becomes fated to die: chance a death-useful turning point is fixed (else the old trouble roll)
  MAX_SHARE: 0.1,     // at most this share of the settled people carry one at once (at least MIN_MAX)
  MIN_MAX: 2,
  DEATH_WEIGHT: 1.4,  // death-useful kinds are picked this much more often than life-useful ones in the yearly look
  GRIEF_DELAY: [2, 6], // calendar years from the death to the grieving child's discovery
  FOUNDER_FOOD: 1.35, FOUNDER_STORE: 1.3, FOUNDER_YEARS: 30, // the cleared ground: food and store for life years
  WALL_R: 40,         // the hedge keeps resident wolves off anyone within this of the village's homes ...
  WALL_STRENGTH: 1.25, // ... and its people fight this much better at home
  HARD_STRENGTH: 1.2, HARD_YEARS: 40, // a child's death hardens the clan: strength for life years
  HEALER_SICK: 0.5, HEALER_R: 50, // a healer's village falls sick and dies of it at this share
  PEACE_COOL: 0.85, FEUD_COOL: 0.9, // grudges cooled by these shares
  GRUDGE_AT: 28,      // a clan grudge this hot counts as a feud for the feud, peacemaker and warlord kinds
  THINKER_DOUBT: 55,  // a thinker turning point needs this much doubt (and to be thinking toward a discovery now)
};
const TT = TUNE_TURNING;

export default {
  id: 'turning',
  tune: TUNE_TURNING,
  init(R) {
    const { S } = R;
    const T = R.T;
    const LR = () => T.LIFE_RATE;
    const rand = Math.random;
    const yl = yearLabel;
    const alive = (p) => p && !p.dead;
    const settled = (p) => alive(p) && p.family?.state === 'settled';
    const he = (p) => (p.sex === 'f' ? 'she' : 'he'), him = (p) => (p.sex === 'f' ? 'her' : 'him'), his = (p) => (p.sex === 'f' ? 'her' : 'his');
    const C = () => R.ask('clans:api');
    const clanOf = (p) => R.ask('clanOf', p);
    const clanName = (c) => (c?.name ? `the ${c.name} clan` : 'their clan');
    const nextD = () => R.ask('nextDiscovery');
    const nextName = () => { const d = nextD(); return d ? d.name.toLowerCase() : 'something new'; };
    const ageAtYear = (p, y) => Math.floor(p.age + (y - S.year) * LR());
    const yearAtAge = (p, a) => S.year + (a - p.age) / LR();
    const oldAgeYear = (p) => yearAtAge(p, p.lifespan);
    const tps = new Map();   // person -> record
    const done = [];         // carried out or lapsed (newest last)
    const due = [];          // scheduled effects { year, fn }
    let seq = 0;

    // a feud of this person's clan: the hottest grudge of theirs against another clan, or another against them
    function feudOf(p) {
      const c = clanOf(p), A = C();
      if (!c || !A?.ledger) return null;
      let best = null;
      for (const e of A.ledger.values()) {
        if (e.g < TT.GRUDGE_AT || (e.a !== c.id && e.b !== c.id)) continue;
        if (!best || e.g > best.g) best = e;
      }
      if (!best) return null;
      const other = A.groupOfId(best.a === c.id ? best.b : best.a);
      return other && other !== c && other.type !== 'village' ? { a: c, b: other, g: best.g } : null;
    }
    const kids = (p) => S.people.filter((c) => alive(c) && (c.mother === p || c.father === p));

    // ---------- the kinds: fits(p, o) -> record fields, or null ----------
    // each record: { kind, useful: 'death'|'life', by (calendar year), cause?, other?, ... } with words(rec) and the
    // carry-out functions death(rec, cause) and life(rec), all built here so the words and the act share their numbers
    const KINDS = {
      grief: {
        useful: 'death', title: 'A grief that turns to invention',
        fits(p) {
          if (p.stage === 'child') return null;
          const c = kids(p).filter((c) => c.age >= 9 && c.age <= 30 && R.ask('couldThink', c) !== false).sort((a, b) => b.age - a.age)[0];
          if (!c) return null;
          const by = Math.min(S.year + 40, oldAgeYear(p) - 2);
          if (by - S.year < 4) return null;
          return { other: c, by, delay: Math.round(range(TT.GRIEF_DELAY)) };
        },
        words: (r) => ({
          dies: `If ${r.p.name} dies before ${yl(r.by)}, ${his(r.p)} ${r.other.sex === 'f' ? 'daughter' : 'son'} ${r.other.name}, grieving, works out the next discovery (as things stand, ${nextName()}) ${r.delay} years after the death.`,
          lives: `If ${r.p.name} lives past ${yl(r.by)}, ${r.other.name} never takes that turn: the discovery waits for the thinkers.`,
        }),
        death(r) {
          const c = r.other, when = S.year;
          schedule(S.year + r.delay, () => {
            if (!alive(c)) { R.alert('info', `${c.name} died before ${his(c)} grief for ${r.p.name} could turn to anything.`); return 'lapsed'; }
            const d = nextD();
            R.ask('thinkPush', c, 1.05);
            R.story(c, `Grieving for ${r.p.name}, worked out ${d ? d.name.toLowerCase() : 'something new'}.`);
            R.alert('good', `${c.name}, grieving for ${r.p.name}, has worked out ${d ? d.name.toLowerCase() : 'something new'}. ${cap(his(c))} ${r.p.sex === 'f' ? 'mother' : 'father'}'s death in ${yl(when)} set ${him(c)} to it.`, { x: c.x, z: c.z, subject: c, aside: R.aside('turning:grief', ['Grief is a very hard-working teacher.', 'Nobody would have chosen this way to learn it.']) });
            return 'carried';
          });
        },
        life() {},
      },
      founder: {
        useful: 'death', title: 'A widow who clears new ground',
        fits(p) {
          const q = p.partner;
          if (p.stage !== 'adult' || !alive(q) || q.stage === 'child' || q.family !== p.family) return null;
          if (!p.family.members.some((c) => alive(c) && c.stage === 'child')) return null;
          const by = Math.min(S.year + 30, oldAgeYear(p) - 2, oldAgeYear(q) - 8);
          if (by - S.year < 4) return null;
          return { other: q, by };
        },
        words: (r) => ({
          dies: `If ${r.p.name} dies before ${yl(r.by)}, ${r.other.name} clears new ground by the far water and makes it pay: the ${r.p.family.name} household eats a third more for ${Math.round(TT.FOUNDER_YEARS / LR())} years.`,
          lives: `If ${r.p.name} lives past ${yl(r.by)}, the household farms the same tired ground as before.`,
        }),
        death(r) {
          const q = r.other, f = q.family;
          if (!alive(q) || !f) return 'lapsed';
          R.mod('yield', `turning:founder:${f.id}`, { mul: TT.FOUNDER_FOOD, who: f, until: S.life + TT.FOUNDER_YEARS, note: `${q.name} cleared new ground` });
          R.mod('store', `turning:founder:${f.id}`, { mul: TT.FOUNDER_STORE, who: f, until: S.life + TT.FOUNDER_YEARS, note: `${q.name} keeps a bigger store` });
          R.story(q, `After ${r.p.name} died, cleared new ground and made it pay.`);
          R.alert('good', `${q.name}, widowed in ${yl(S.year)}, has cleared new ground for the ${f.name} household. They eat a third more for years. ${r.p.name}'s death set ${him(q)} to it.`, { x: q.x, z: q.z, subject: q });
          return 'carried';
        },
        life() {},
      },
      wall: {
        useful: 'death', title: 'A death that builds a wall', danger: true,
        fits(p, o) {
          if (o?.how !== 'wolf' || p.stage === 'child') return null;
          return { by: S.year + 3, cause: 'wolf' };
        },
        words: (r) => ({
          dies: `If the wolf kills ${r.p.name}, ${his(r.p)} people hedge their homes with thorn and stakes: no wolf takes anyone inside it again, and it stands against raiders too.`,
          lives: `If ${r.p.name} is saved from the wolf, no hedge is built: the wolves keep coming to the huts.`,
        }),
        death(r) {
          const f = r.p.family, h = f?.home ?? S.buildings.find((b) => b.kind === 'hut' && b.family);
          if (!h) return 'lapsed';
          const g = { x: h.cx, z: h.cz, r: TT.WALL_R, by: r.p.name, year: S.year };
          if (S.eco) (S.eco.guards ?? (S.eco.guards = [])).push(g);
          R.mod('strength', `turning:wall:${r.id}`, { mul: TT.WALL_STRENGTH, who: (q) => q?.kind === 'person' && Math.hypot(q.x - g.x, q.z - g.z) < g.r, note: 'fighting from behind the hedge' });
          hedge(g);
          R.alert('good', `After the wolf took ${r.p.name}, ${his(r.p)} people hedged their homes with thorn and stakes. No wolf will take anyone inside it, and it will stand against raiders too.`, { x: g.x, z: g.z, aside: R.aside('turning:wall', ['Nothing builds a fence like a funeral.', 'The wolves have been informed.']) });
          return 'carried';
        },
        life() {},
      },
      feud: {
        useful: 'death', title: 'An old life that holds a feud open',
        fits(p) {
          if (p.age < 50) return null;
          const fd = feudOf(p);
          if (!fd) return null;
          const by = oldAgeYear(p) - 1;
          if (by - S.year < 3) return null;
          return { feud: fd, by };
        },
        words: (r) => ({
          dies: `If ${r.p.name} dies before ${yl(r.by)}, the young of ${clanName(r.feud.a)} and ${clanName(r.feud.b)} are let marry, and the feud between them all but ends.`,
          lives: `While ${r.p.name} lives (to ${ageAtYear(r.p, r.by + 1)}), ${he(r.p)} forbids the match, and the feud with ${clanName(r.feud.b)} goes on.`,
        }),
        death(r) {
          const A = C();
          if (!A) return 'lapsed';
          A.cool(r.feud.a, r.feud.b, null, TT.FEUD_COOL); A.cool(r.feud.b, r.feud.a, null, TT.FEUD_COOL);
          R.alert('good', `With ${r.p.name} gone, the young of ${clanName(r.feud.a)} and ${clanName(r.feud.b)} were let marry. The feud between them has all but ended.`, { x: r.p.x, z: r.p.z });
          return 'carried';
        },
        life() {},
      },
      warlord: {
        useful: 'death', title: 'A child who will be a warlord',
        fits(p, o) {
          if (p.stage !== 'child' || p.age < 3 || p.age > 12) return null;
          const c = clanOf(p);
          // a child of a clan that already has a quarrel (a grudge), or one fated to die now
          if (!c || (!o?.how && !feudOf(p))) return null;
          return { clan: c, by: yearAtAge(p, 18) };
        },
        words: (r) => ({
          dies: `If ${r.p.name} dies before ${yl(r.by)}, ${clanName(r.clan)} hardens with grief: they fight a fifth harder for ${Math.round(TT.HARD_YEARS / LR())} years.`,
          lives: `If ${r.p.name} lives to ${yl(r.by)}, ${he(r.p)} grows into a warlord: ${he(r.p)} leads ${clanName(r.clan)} on raids and starts a feud with the nearest clan.`,
        }),
        death(r) {
          const c = r.clan;
          R.mod('strength', `turning:hard:${r.id}`, { mul: TT.HARD_STRENGTH, who: (q) => q?.kind === 'person' && clanOf(q) === c, until: S.life + TT.HARD_YEARS, note: `hardened by the death of ${r.p.name}` });
          for (const k of S.peopleApi.kinOf?.(r.p) ?? []) if (alive(k)) R.signal('hardship:survived', { person: k, id: `grief-${r.id}`, kind: 'grief', unaided: true });
          R.alert('info', `${cap(clanName(c))} buried ${r.p.name} and came out of it harder: they fight a fifth harder for years.`, { x: r.p.x, z: r.p.z });
          return 'carried';
        },
        life(r) {
          const p = r.p, A = C();
          R.trait(p, 'raider', true);
          let other = null;
          if (A) {
            const mine = clanOf(p);
            let bd = 1e9;
            for (const g of A.liveClans?.() ?? []) { if (!mine || g.id === mine.id || A.resolve?.(g.id) === mine) continue; const m = A.groupMembers(g).find(alive); if (!m) continue; const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < bd) { bd = d; other = g; } }
            if (other && mine) A.add(mine, other, R.tune('fights')?.THEFT ?? 22, 'wrong', `${p.name} picked a quarrel in ${yl(S.year)}`);
          }
          R.story(p, 'Grew into a warlord. The clan follows where he leads.'.replace(' he ', ` ${he(p)} `));
          R.alert('bad', `${p.name} has grown into a warlord. ${cap(he(p))} leads ${clanName(clanOf(p) ?? r.clan)} on raids now${other ? `, and has picked a feud with ${clanName(other)}` : ''}.${r.saved ? ` ${p.name} was the child you saved in ${yl(r.saved)}.` : ''}`, { x: p.x, z: p.z, subject: p, aside: R.aside('turning:warlord', ['He was such a sweet child.', 'Every warlord was somebody\'s little one.']) });
          return 'carried';
        },
      },
      healer: {
        useful: 'life', title: 'A healer in the making',
        fits(p) {
          if (p.stage !== 'adult' || p.age > 40) return null;
          const by = S.year + Math.round(range([16, 36]));
          if (by > oldAgeYear(p) - 6) return null;
          return { by, sick: pick(['the fever', 'the coughing sickness', 'the flux']) };
        },
        words: (r) => ({
          dies: `If ${r.p.name} dies before ${yl(r.by)}, nobody learns to cool ${r.sick}: sickness comes as hard as ever.`,
          lives: `If ${r.p.name} lives to ${yl(r.by)}, ${he(r.p)} learns which herbs cool ${r.sick}: everyone near ${his(r.p)} home falls sick and dies of it half as often while ${he(r.p)} lives.`,
        }),
        death() { return 'lapsed'; },
        life(r) {
          const p = r.p, home = p.family.home;
          const at = () => (home ? { x: home.cx, z: home.cz } : { x: p.x, z: p.z });
          R.mod('sickness', `turning:healer:${r.id}`, { mul: TT.HEALER_SICK, who: (q) => q?.kind === 'person' && !p.dead && Math.hypot(q.x - at().x, q.z - at().z) < TT.HEALER_R, note: `${p.name} knows the herbs` });
          R.story(p, `Learned which herbs cool ${r.sick}. People come from all round.`);
          R.alert('good', `${p.name} has learned which herbs cool ${r.sick}. Everyone near ${his(p)} home falls sick half as often, and dies of it half as often, while ${he(p)} lives.`, { x: p.x, z: p.z, subject: p });
          return 'carried';
        },
      },
      peacemaker: {
        useful: 'life', title: 'A peacemaker',
        fits(p) {
          if (p.stage !== 'adult') return null;
          const fd = feudOf(p);
          if (!fd) return null;
          const by = S.year + Math.round(range([8, 24]));
          if (by > oldAgeYear(p) - 2) return null;
          return { feud: fd, by };
        },
        words: (r) => ({
          dies: `If ${r.p.name} dies before ${yl(r.by)}, the feud with ${clanName(r.feud.b)} goes on.`,
          lives: `If ${r.p.name} lives to ${yl(r.by)}, ${he(r.p)} talks ${clanName(r.feud.a)} and ${clanName(r.feud.b)} into peace that year.`,
        }),
        death() { return 'lapsed'; },
        life(r) {
          const A = C();
          if (!A) return 'lapsed';
          A.cool(r.feud.a, r.feud.b, null, TT.PEACE_COOL); A.cool(r.feud.b, r.feud.a, null, TT.PEACE_COOL);
          R.story(r.p, `Talked ${clanName(r.feud.a)} and ${clanName(r.feud.b)} into peace.`);
          R.alert('good', `${r.p.name} has talked ${clanName(r.feud.a)} and ${clanName(r.feud.b)} into peace. The feud has cooled.`, { x: r.p.x, z: r.p.z, subject: r.p });
          return 'carried';
        },
      },
      thinker: {
        useful: 'life', title: 'A thinker on the edge of something',
        fits(p) {
          // a doubter by nature, already turning things over (thinking toward a discovery now)
          if (p.age < 14 || p.stage === 'elder' || (p.skep ?? 0) < TT.THINKER_DOUBT || !R.ask('thinking', p)?.thinking) return null;
          const by = S.year + Math.round(range([14, 34]));
          if (by > oldAgeYear(p) - 2) return null;
          return { by };
        },
        words: (r) => ({
          dies: `If ${r.p.name} dies before ${yl(r.by)}, the idea dies with ${him(r.p)}.`,
          lives: `If ${r.p.name} lives to ${yl(r.by)}, ${he(r.p)} works out the next discovery that year (as things stand, ${nextName()}).`,
        }),
        death() { return 'lapsed'; },
        life(r) {
          const d = nextD();
          R.ask('thinkPush', r.p, 1.05);
          R.story(r.p, `Worked out ${d ? d.name.toLowerCase() : 'something new'}.`);
          R.alert('good', `${r.p.name} has worked out ${d ? d.name.toLowerCase() : 'something new'}, as foreseen.`, { x: r.p.x, z: r.p.z, subject: r.p });
          return 'carried';
        },
      },
    };
    const DEATH_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].useful === 'death');

    // ---------- fixing one ----------
    function fix(p, kind, extra) {
      const K0 = KINDS[kind];
      const rec = { id: `tp${++seq}`, p, kind, useful: K0.useful, made: S.year, ...extra };
      rec.by = Math.ceil(rec.by); // a whole calendar year: dies before it, or lives to see it
      tps.set(p, rec);
      R.trait(p, 'turning', rec.useful);
      R.signal('turning:fixed', { person: p, kind, useful: rec.useful, by: rec.by, id: rec.id });
      return rec;
    }
    const room = () => { const n = S.people.filter(settled).length; return tps.size < Math.max(TT.MIN_MAX, Math.round(n * TT.MAX_SHARE)); };
    // one of a kind per clan at a time, so the turning points stay varied
    const clanHas = (p, kind) => { const c = clanOf(p); return !!c && [...tps.values()].some((r) => r.kind === kind && clanOf(r.p) === c); };
    function tryFix(p, kinds, o) {
      const options = [];
      for (const k of kinds) { if (clanHas(p, k)) continue; const x = KINDS[k].fits(p, o); if (x) options.push([k, x]); }
      if (!options.length) return null;
      let sum = 0;
      const w = options.map(([k]) => { const v = KINDS[k].useful === 'death' ? TT.DEATH_WEIGHT : 1; sum += v; return v; });
      let r = rand() * sum;
      for (let i = 0; i < options.length; i++) { r -= w[i]; if (r <= 0) return fix(p, options[i][0], options[i][1]); }
      return fix(p, options[options.length - 1][0], options[options.length - 1][1]);
    }
    // the moment someone becomes fated to die (hardship-trouble.js asks first): 'fixed' means a turning point
    // now hangs on this life (no trouble is rolled); undefined lets the old trouble roll go on
    R.answer('turning:danger', (p) => {
      if (!settled(p)) return undefined;
      if (tps.has(p)) return 'fixed';
      if (!room() || rand() >= TT.DANGER_SHARE) return undefined;
      const how = S.mind.endOf(p).how;
      const rec = tryFix(p, DEATH_KINDS, { how });
      return rec ? 'fixed' : undefined;
    });

    // ---------- carrying them out ----------
    function schedule(year, fn) { due.push({ year, fn }); }
    function finish(rec, branch, outcome) {
      tps.delete(rec.p);
      if (!rec.p.dead) R.trait(rec.p, 'turning', null);
      rec.branch = branch; rec.outcome = outcome ?? 'carried'; rec.endYear = S.year;
      done.push(rec); if (done.length > 200) done.shift();
      R.signal('turning:landed', { person: rec.p, kind: rec.kind, branch, outcome: rec.outcome, id: rec.id, text: words(rec)[branch === 'death' ? 'dies' : 'lives'] });
    }
    R.on('person:death', (p, cause) => {
      const rec = tps.get(p);
      if (!rec) return;
      if (S.year < rec.by && (!rec.cause || rec.cause === cause)) finish(rec, 'death', KINDS[rec.kind].death(rec, cause) ?? 'carried');
      else finish(rec, 'death', 'lapsed');
    });
    // a saved person (hardship:saved): remembered for the warlord's alert
    R.on('hardship:saved', ({ person }) => { const rec = tps.get(person); if (rec) rec.saved = S.year; });
    R.on('year', () => {
      for (let i = due.length - 1; i >= 0; i--) if (S.year >= due[i].year) { const d = due.splice(i, 1)[0]; try { d.fn(); } catch (err) { console.warn('turning: due', err); } }
      for (const rec of [...tps.values()]) {
        if (rec.p.dead) { tps.delete(rec.p); continue; }
        if (rec.p.family?.state !== 'settled' && rec.p.family?.state !== 'leaving') continue;
        if (S.year >= rec.by) finish(rec, 'life', KINDS[rec.kind].life(rec) ?? 'carried');
      }
      // the yearly look: a few people's lives become turning points as their circumstances call for it
      if (!S.started || !room()) return;
      for (const p of S.people) {
        if (!settled(p) || tps.has(p) || rand() >= TT.SCAN_RATE) continue;
        tryFix(p, Object.keys(KINDS).filter((k) => !KINDS[k].danger));
        if (!room()) break;
      }
    });
    R.on('family:leave', (f) => { for (const m of f.members) { const rec = tps.get(m); if (rec) finish(rec, 'life', 'lapsed'); } });

    // the hedge: short runs of thorn bushes round the village homes, with gaps to walk through (real blocks)
    function hedge(g) {
      const L = S.land, W = R.ctx.world;
      const r = Math.min(g.r * 0.45, 18);
      let n = 0;
      for (let k = 0; k < 140; k++) {
        if (k % 4 === 3) continue;
        const a = (k / 140) * Math.PI * 2;
        const x = Math.floor(g.x + Math.cos(a) * r), z = Math.floor(g.z + Math.sin(a) * r);
        if (!L.inside(x, z)) continue;
        const i = L.ci(x, z);
        if (L.res[i] !== RES.NONE || L.wet[i] || L.tree[i] || L.obst[i]) continue;
        const y = L.top[i];
        if (W.get(x, y + 1, z) !== B.AIR) continue;
        S.build.put(x, y + 1, z, B.BUSH, null); L.scanColumn(x, z); n++;
      }
      return n;
    }

    // ---------- what the god sees ----------
    function words(rec) { return KINDS[rec.kind].words(rec); }
    const view = (rec) => {
      const w = words(rec);
      return { id: rec.id, source: 'turning', person: rec.p, name: rec.p.name, family: rec.p.family?.name ?? null, kind: rec.kind, title: KINDS[rec.kind].title, useful: rec.useful,
        by: Math.floor(rec.by), byLabel: yl(rec.by), cause: rec.cause ?? null, ifDies: w.dies, ifLives: w.lives, x: rec.p.x, z: rec.p.z, made: Math.floor(rec.made) };
    };
    // the older consequences, in the same shape: a trouble rolled on someone in danger (if saved), or one in train
    function troubleViews() {
      const H = R.ask('hardshipLog');
      const out = [];
      for (const p of S.people) {
        const tr = p.ext?.hardship?.trouble;
        if (!alive(p) || !tr || tr.joke) continue;
        out.push({ id: `tr-${p.id}`, source: 'trouble', person: p, name: p.name, family: p.family?.name ?? null, kind: tr.kind, title: 'Trouble if saved', useful: 'death', by: tr.year, byLabel: yl(tr.year),
          ifDies: `If ${p.name} dies now, nothing follows.`, ifLives: troubleLine(p, tr), x: p.x, z: p.z });
      }
      for (const t of H?.troubles ?? []) if (!t.done && !t.joke) out.push({ id: `tr-saved-${t.name}-${t.year}`, source: 'trouble', person: null, name: t.name, family: null, kind: t.kind, title: 'Trouble in train', useful: 'none', by: t.year, byLabel: yl(t.year), ifDies: null, ifLives: t.text, x: null, z: null });
      return out;
    }
    const troubleLine = (p, tr) => { const H = R.ask('hardshipLog'); void H; try { return R.ask('troubleLines', p, tr)?.fates?.[0] ?? `If saved, ${p.name}'s line brings trouble around ${yl(tr.year)}.`; } catch { return ''; } };
    R.answer('turningPoints', () => [...[...tps.values()].filter((r) => alive(r.p)).map(view), ...troubleViews()]);
    R.answer('turningOf', (p) => { const rec = tps.get(p); return rec ? view(rec) : null; });
    R.answer('turningLog', (n = 50) => done.slice(-n).map((r) => ({ ...view(r), branch: r.branch, outcome: r.outcome, endYear: Math.floor(r.endYear) })));
    // for futures.js: what follows if this person dies now (cause) or lives on
    R.answer('turningIf', (p, branch, cause) => {
      const rec = tps.get(p);
      if (!rec) return null;
      const w = words(rec);
      if (branch === 'death') {
        const counts = S.year < rec.by && (!rec.cause || !cause || rec.cause === cause);
        return { text: counts ? w.dies : null, useful: rec.useful, rec: view(rec) };
      }
      return { text: w.lives, useful: rec.useful, rec: view(rec) };
    });
    R.answer('turning:dev', () => ({ fix: (p, kind, o) => { const x = KINDS[kind]?.fits(p, o ?? {}); return x ? fix(p, kind, x) && view(tps.get(p)) : null; }, kinds: Object.keys(KINDS), tps, done, due }));
    R.on('fate', (p) => { const rec = tps.get(p); if (!rec) return null; const w = words(rec); return rec.useful === 'death' ? [w.dies, w.lives] : [w.lives, w.dies]; });
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const rec = tps.get(e);
      const lines = [];
      if (rec) { const w = words(rec); lines.push(`${KINDS[rec.kind].title}.`, w.dies, w.lives); }
      const tr = e.ext?.hardship?.trouble;
      if (tr && !tr.joke) lines.push(troubleLine(e, tr));
      for (const t of e.ext?.hardship?.troubles ?? []) if (!t.done && !t.joke) lines.push(`In train: ${t.text}`);
      if (lines.length) R.section(out, { id: 'turning', title: 'What hangs on this life', order: 20, lines, useful: rec?.useful ?? (tr ? 'death' : null) });
    });
    R.on('stats', (st) => { st.turning = tps.size; });
    void number;
  },
};
