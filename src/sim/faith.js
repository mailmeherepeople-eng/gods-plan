// E. Faith: how far an act is seen, how word of it spreads, how children are
// raised in it, how practice keeps it and doubt grows for reasons, and the
// ledger the player reads. docs/FAITH.md is the formula in plain words; every
// number is in TUNE_FAITH below (console: game.modules.sim.tune('faith')).
//
// The director's rule stays: faith moves only because of what people witness
// or are told by someone who did, never from acts nobody could know about.
//   notice    R.witness asks notice(act) who sees it: close by (full), from afar
//             (less, out to the act's reach), woken by thunder or a glow, or
//             finding what it left when they next wake (lasting acts only)
//   tales     every witnessed act becomes a tale (faith-tales.js): the household
//             hears at once, the village over the years, other villages slowly
//   raised    a child's faith and doubt come from its parents and its village
//   fade      faith fades a little a year, slower for those who pray, tend the
//             stone and keep the commandments, faster when the stone is neglected
//   doubt     unanswered prayers, hardships survived by their own hands,
//             discoveries, thinkers arguing, a commandment that hurt them
import { makeTales } from './faith-tales.js';
import { number } from './words.js';

export const TUNE_FAITH = {
  // ---- who notices an act (blocks; w = how much it moves them, 1 = seen close by) ----
  // reach: how far it is seen by day; perR: more per block of the area it changed; cap: at most; wake: within
  // this, people asleep or indoors are woken by it and come out; lit: seen as far at night (a bolt, a fire);
  // lasting: it leaves something (a hill, a lake) that those who missed it find when they next wake
  NOTICE: {
    default: { reach: 22, perR: 0 },                                  // quiet acts: only those who see it (the stage 1 rule)
    land: { reach: 30, perR: 2.2, cap: 120, lasting: true },          // a hill raised, land moved, a lake, a river
    paint: { reach: 22, perR: 0.8, cap: 50, lasting: true },          // ground changed, trees and plants sprung up
    strike: { reach: 60, wake: 40, lit: true, wakeBy: 'thunder from a clear sky' },
    'send-fire': { reach: 55, wake: 30, lit: true, wakeBy: 'a glow and a crack of thunder' },
    'bless-harvest': { reach: 30, perR: 1.5, cap: 70 },               // rain over the fields from a clear sky
    'send-flood': { reach: 30, perR: 1.5, cap: 80, lasting: true },
    cave: { reach: 35, perR: 1.5, cap: 70, lasting: true },          // a hillside hollowed out: seen across the valley, found at dawn
    commandment: { all: true },                                       // the stone speaks: everyone awake hears it
  },
  KIND_GROUP: {
    raise: 'land', lower: 'land', flatten: 'land', smooth: 'land', hill: 'land', pit: 'land', plateau: 'land', cliff: 'land',
    water: 'land', dry: 'land', river: 'land', lake: 'land', 'area-move': 'land', 'area-resize': 'land', 'area-copy': 'land', 'area-flatten': 'land',
    grass: 'paint', dirt: 'paint', sand: 'paint', rock: 'paint', drygrass: 'paint', darkrock: 'paint', stone: 'paint', earth: 'paint',
    farmland: 'paint', crop: 'paint', snow: 'paint', picked: 'paint', trees: 'paint', bushes: 'paint', reeds: 'paint', erase: 'paint',
    path: 'paint', 'path-remove': 'paint',
  },
  SEE_FAR_W: 0.45,      // a witness at the very edge of the reach is moved this much (1 within sight, 22 blocks by day)
  WOKE_W: 0.7,          // woken by it
  LATER_W: 0.6,         // found it on waking (a lasting act seen by nobody awake there)
  LATER_LIFE: 20,       // those who will find it at waking: forgotten after this many life years asleep or away
  SEE_DOUBT_CUT: 0.3,   // a strong doubter (doubt 40 to 90) trusts their own eyes this much less
  // ---- word of it (faith-tales.js) ----
  HEAR_W: 0.45,         // hearing it from one who saw it moves you this share of seeing it
  RETELL: 0.7,          // each retelling further from the eyewitness: this share again
  HEAR_DOUBT_CUT: 0.6,  // a listener discounts hearsay by doubt / 100 x this
  FAR_VILLAGE_W: 0.6,   // told by someone from another village: this share
  TELL_RATE: 0.9,       // each who knows it tells this many others a life year (more at the fire, the stone, at work)
  P_NEAR: 0.6, P_VILLAGE: 0.32, // whom they tell: someone close by now (the fire, the stone, the field), else their village, else (the rest) another village
  TALK_NEAR: 14,        // close by: within this many blocks
  TALK_FAR: 110,        // another village: within this many blocks
  TALE_YEARS: 40,       // a tale is told for this many calendar years; after that it is a legend, told only to children
  MAX_HOP: 4,           // retold at most this many times from the eyewitness
  MIN_TELL: 0.4,        // a version that would move a listener less than this much faith is not passed on
  MAX_TALES: 24,        // tales remembered at once (the oldest is forgotten)
  MAX_TELLS: 40,        // tellings of one tale in one calendar year at most (cost)
  // ---- raised in it (a newborn's faith and doubt) ----
  DEVOUT_HOUSE: 50,     // the director: a parent with faith above this passes it on whole, no roll (both: their average)
  PARENT_W: 0.6, VILLAGE_W: 0.3, MID_W: 0.1, // otherwise: parents' average, their village's grown-ups, the middle of a new arrival
  MID_FAITH: 25, MID_DOUBT: 45,
  BIRTH_SPREAD: 2,      // plus or minus this, rolled (only outside a devout house)
  LEGEND_W: 0.2,        // a parent's tale told to a child: this share of seeing it (times RETELL for each telling before)
  LEGENDS: 2,           // the strongest this many of the parents' tales
  // ---- fading and practice (a life year; a life year is two calendar years) ----
  FADE_FAITH: -0.1, FADE_DOUBT: 0.07,   // with nothing seen or heard, faith falls and doubt rises this much a life year
  FADE_CHILD: 0.3,      // children fade this much as fast (they are raised in it)
  PRAY_KEEP: 10,        // praying at the stone (or at home, facing it) keeps faith for this many life years (about a day)
  PRAY_MUL: 0.4,        // ... fading this much as fast
  TEND_MUL: 0.6,        // tended the stone in that time: this much as fast again
  KEPT_AT: 0.5, KEPT_MUL: 0.7, // keeping a standing commandment (obedience at least KEPT_AT): this much as fast again
  NEGLECT_AT: 0.25, NEGLECT_MUL: 1.8,   // the stone neglected (care under this): everyone fades this much faster
  KEPT_STONE_AT: 0.6, KEPT_STONE_MUL: 0.8, // the stone well kept: everyone fades this much as fast
  STONE_SHARE: 0.3,     // the stone's care is the share of the people (6 and up) who prayed or tended there today, against this
  HOME_PRAYER: 0.5,     // a prayer said at home, facing the stone (they live too far to walk), counts this much toward its care
  TOGETHER_N: 4, TOGETHER_R: 20, // praying with at least this many others within this many blocks ...
  TOGETHER_FAITH: 0.8,  // ... adds this much faith, once a day
  TEND_DEVOUT: 65, TEND_CHANCE: 0.04, CARE_TEND: 0.05, // the devout go and tend the stone on their own: chance per choice of what to do
  // ---- doubt, for reasons ----
  UNANSWERED_DOUBT: 6, UNANSWERED_FAITH: -3, // prayed through a hardship and no help came
  OWN_HANDS_DOUBT: 2,   // came through a hardship by their own hands, without praying
  DISCOVERY_DOUBT: { writing: 4, numbers: 2, calendar: 5, herbs: 3, 'bone-setting': 3, geometry: 3, alphabet: 2, telescope: 6, germs: 6, vaccination: 4, antibiotics: 3, moon: 5, default: 1 },
  ARGUE_RATE: 0.3,      // a thinker argues with someone close by this often a life year
  ARGUE_DOUBT: 1.5,     // and their doubt rises this much (less in the devout)
  HURT_DOUBT: 4, HURT_FAITH: -2, // a commandment that hurt them (went hungry beside sealed jars)
  // ---- leaning on you ----
  DEPEND_FAITH: 80, DEPEND_SEEN: 3, DEPEND_WINDOW: 30, // this devout, having seen the sky help this often in this many life years: they wait for it
  HELP_KINDS: ['heal', 'bless-harvest', 'strike', 'bless-weapons'],
  // ---- a cave carved for them (the director: "seeing a cave get made is 50 faith"; the Cave tool sends kind 'cave') ----
  CAVE_FAITH: 50, CAVE_DOUBT: -35, // each who sees it close by (less from afar, and in doubters); doubt falls 35 (my choice)
  // ---- faith is felt ----
  KNEEL_FAITH: 55,      // a believer who sees an act close by falls to their knees for a moment
  KNEEL_S: [3, 5],
  // ---- the ledger ----
  TREND_EVERY: 5,       // calendar years between samples of the people's faith and doubt
  TREND_KEEP: 120,      // samples kept (600 years)
  LOG_KEEP: 10,         // lines kept in a person's "why they believe"
  CAUSES_KEEP: 16,
  CAUSE_MIN: 6,         // a hardship nobody prayed through goes in the ledger only if this many came through it
};
const F = TUNE_FAITH;
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const smooth = (v, a, b) => { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const signed = (v) => `${v >= 0 ? '+' : ''}${Math.abs(v) >= 9.95 || Number.isInteger(v) ? Math.round(v) : Math.round(v * 10) / 10}`;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DISC_WORDS = {
  writing: 'Words kept in clay. The old tales can be checked now.',
  numbers: 'Counting past the fingers. Things add up without the stone.',
  calendar: 'The sun tells the planting time now, not the stone.',
  herbs: 'Herbs cool a fever. Fewer prayers for the sick.',
  'bone-setting': 'Bones set by hand. Fewer prayers for the hurt.',
  geometry: 'The land measured true. It is only land.',
  telescope: 'They looked up and saw no lid on the sky.',
  germs: 'Sickness is small living things, not anger from above.',
};

export default {
  id: 'faith',
  tune: TUNE_FAITH,
  init(R) {
    const { S } = R;
    const T = R.T;
    const data = (p) => R.data(p, 'faith', () => ({ log: [], mark: null, helps: [], prayLife: -1e9, prayDay: -1, tendLife: -1e9, togetherDay: -1 }));
    const settled = (p) => p && !p.dead && p.family?.state === 'settled';
    const yearNow = () => Math.floor(S.year);

    // ---------- a person's own ledger: why their faith and doubt are what they are ----------
    // note(p, text, df, dd) after a change was applied: first closes the quiet years since the last line
    function note(p, text, df = 0, dd = 0, o = {}) {
      const d = data(p);
      if (!d.mark) d.mark = { y: yearNow(), f: p.faith - df, d: p.skep - dd };
      const qf = p.faith - df - d.mark.f, qd = p.skep - dd - d.mark.d;
      if (Math.abs(qf) >= 1 || Math.abs(qd) >= 1) d.log.push({ y: d.mark.y, y2: yearNow(), quiet: true, df: qf, dd: qd });
      const last = d.log[d.log.length - 1];
      // the same kind of line again in the same years (prayers with the others, the thinkers' talk): one line, summed
      if (o.key && last && last.key === o.key && yearNow() - last.y2 < 60) { last.df += df; last.dd += dd; last.y2 = yearNow(); last.n = (last.n ?? 1) + 1; }
      else d.log.push({ y: yearNow(), y2: yearNow(), text, df, dd, key: o.key ?? null, first: !!o.first });
      while (d.log.length > F.LOG_KEEP) { const i = d.log.findIndex((x) => !x.first); d.log.splice(i < 0 ? 0 : i, 1); }
      d.mark = { y: yearNow(), f: p.faith, d: p.skep };
    }
    // a change for a reason: applied, noted, returned
    function shift(p, df, dd, text, o) {
      const f0 = p.faith, d0 = p.skep;
      p.faith = clamp(p.faith + df); p.skep = clamp(p.skep + dd);
      const a = p.faith - f0, b = p.skep - d0;
      if (text && (Math.abs(a) >= 0.05 || Math.abs(b) >= 0.05)) note(p, text, a, b, o);
      return { df: a, dd: b };
    }

    // ---------- the people's ledger: the trend, and what moved it ----------
    const L = { trend: [], causes: [], nextSample: null, stone: { care: 0.5, today: 0, day: -1, praying: 0 } };
    function cause(c) {
      L.causes.push({ y: yearNow(), ...c });
      if (L.causes.length > F.CAUSES_KEEP) L.causes.shift();
      return L.causes[L.causes.length - 1];
    }
    const avgOf = (list, k) => (list.length ? list.reduce((s, p) => s + p[k], 0) / list.length : 0);
    function sample() {
      const pool = S.people.filter((p) => settled(p) && p.age >= 10);
      if (!pool.length) return;
      L.trend.push({ y: yearNow(), f: Math.round(avgOf(pool, 'faith') * 10) / 10, d: Math.round(avgOf(pool, 'skep') * 10) / 10, n: pool.length });
      if (L.trend.length > F.TREND_KEEP) L.trend.shift();
    }

    // ---------- who notices an act ----------
    const noticeOf = (kind) => F.NOTICE[kind] ?? F.NOTICE[F.KIND_GROUP[kind]] ?? (String(kind ?? '').startsWith('tree.') || String(kind ?? '').startsWith('path.') ? F.NOTICE.paint : F.NOTICE.default);
    const reachOf = (kind, r = 0) => { const N = noticeOf(kind); return Math.min(N.cap ?? 1e9, N.reach + (N.perR ?? 0) * r); };
    const trustEyes = (p) => 1 - F.SEE_DOUBT_CUT * smooth(p.skep, 40, 90);
    function notice(act) {
      const N = noticeOf(act.kind), r = act.r ?? 0;
      const now = [], later = [];
      if (N.all || r >= 500) {
        for (const p of S.people) if (!p.dead && p.age >= 2 && !p.hidden && !p.asleep) now.push({ p, w: 1, t: trustEyes(p), how: 'saw' });
        return { now, later };
      }
      const reach = reachOf(act.kind, r);
      const nightK = T.SIGHT_NIGHT / T.SIGHT_DAY, dk = nightK + (1 - nightK) * S.daylight;
      const range = N.lit ? reach : reach * dk;       // out to here, by the light there is
      const close = Math.min(range, T.SIGHT_DAY * (N.lit ? 1 : dk)); // within this: as if beside it
      for (const p of S.people) {
        if (p.dead || p.age < 2) continue;
        const d = Math.max(0, Math.hypot(p.x - act.x, p.z - act.z) - r);
        if (d > reach) continue;
        const out = !p.hidden && !p.asleep;
        if (out && d <= range) {
          if (d <= close) now.push({ p, w: 1, t: trustEyes(p), how: 'saw' });
          else now.push({ p, w: 1 - (1 - F.SEE_FAR_W) * (d - close) / Math.max(1, range - close), t: trustEyes(p), how: 'far' });
        } else if (N.wake && d <= N.wake) {
          now.push({ p, w: F.WOKE_W, t: trustEyes(p), how: 'woke', story: `Woke to ${N.wakeBy ?? 'a noise from a clear sky'}, and went out to look.`, thought: `${cap1(N.wakeBy ?? 'a noise')}. Not a cloud anywhere. What was that?` });
        } else if (N.lasting) later.push({ p, w: F.LATER_W, t: trustEyes(p) });
      }
      return { now, later };
    }
    R.useNotice(notice);
    // a cave carved out of a hillside in front of them: the strongest thing anyone can see (the Cave tool's act kind)
    R.witnessKind('cave', {
      kind: 'cave', faith: F.CAVE_FAITH, doubt: F.CAVE_DOUBT, early: T.EARLY_MULT, hooks: true,
      what: 'a cave hollow itself out of the hillside', thought: 'The hill opened. A home, carved for us, by nothing. I will never question it again.',
      story: 'Saw a cave hollow itself out of the hillside, and has believed with all of it since.',
    });
    // far witnesses: their own words (the spec's words are for those who stood beside it)
    const FAR_THOUGHT = ['Did you see that, over that way? Tell me you saw that.', 'Something happened over there. Something big.', 'From up on the path I saw it. I swear I did.'];

    // ---------- tales: households, the village, other villages, legends (faith-tales.js) ----------
    const tales = makeTales(R, { F, data, note, shift, settled, cause, clamp, trustEyes });

    // ---------- an act was witnessed (seam.js R.witness ran it) ----------
    R.on('witnessed', (info) => {
      const { act, spec, moved, later } = info;
      // eyewitnesses far off get their own words; believers close by fall to their knees
      for (const m of moved) {
        const p = m.p;
        if (m.how === 'far' && !p.planted) S.mind.push(p, FAR_THOUGHT[Math.floor(Math.random() * FAR_THOUGHT.length)]);
        const df = m.df, dd = m.dd;
        note(p, `${m.how === 'saw' ? 'Saw' : m.how === 'far' ? 'Saw from afar' : 'Woke to it, and saw'} ${info.what ?? 'something no person could do'}`, df, dd);
        if (m.how === 'saw' && p.faith >= F.KNEEL_FAITH) kneel(p);
        // a helping hand seen too often: the devout stop doing it themselves
        if (spec.hooks && F.HELP_KINDS.includes(act.kind)) {
          const d = data(p);
          d.helps = d.helps.filter((t) => S.life - t < F.DEPEND_WINDOW); d.helps.push(S.life);
          if (!p.expectsHelp && d.helps.length >= F.DEPEND_SEEN && p.faith >= F.DEPEND_FAITH) {
            p.expectsHelp = true;
            S.peopleApi.story(p, 'Has seen the sky do it too often to bother doing it any more.');
            dependNow++;
          }
        }
      }
      if (dependNow) { R.alert('warn', `${dependNow === 1 ? 'One devout soul has' : `${cap1(number(dependNow))} devout souls have`} seen the sky help once too often. They will wait for it now, and work less, for good.`, { x: act.x, z: act.z }); dependNow = 0; }
      if (spec.tale === false || act.kind === 'commandment') return; // the stone's voice: everyone awake heard it; no tale to tell
      tales.fromAct(info, later);
    });
    let dependNow = 0;
    function kneel(p) {
      if (p.dead || p.hidden || p.asleep || p.fleeing || p.family?.state !== 'settled') return;
      if (R.ask('fightOf', p)) return;
      const A = S.peopleApi;
      p.go = null; p.path = null; p.moving = false;
      A.work(p, 'pray', F.KNEEL_S[0] + Math.random() * (F.KNEEL_S[1] - F.KNEEL_S[0]), { doing: 'on their knees, staring at the sky' });
    }

    // ---------- raised in it ----------
    // the newborn's starting faith and doubt (people.js birth asks): parents, village, a little of the middle
    function villageAvg(p) {
      const v = R.ask('villageOf', p);
      const list = (v?.members ?? p.family?.members ?? []).filter((q) => !q.dead && q.age >= 17);
      return list.length ? { f: avgOf(list, 'faith'), d: avgOf(list, 'skep') } : null;
    }
    // The director's rule: a child of believing parents (faith above DEVOUT_HOUSE) is born at their level, with no
    // roll. Both above: their average; only one above: that parent's (the believer raises the child in it). Doubt
    // comes from the same parent or parents. Otherwise: raised near the parents and the village (a small roll).
    function believers(mother, father) {
      return [mother, father].filter((q) => q && q.faith > F.DEVOUT_HOUSE);
    }
    R.answer('upbringing', (mother, father) => {
      const dev = believers(mother, father);
      if (dev.length) return { faith: clamp(avgOf(dev, 'faith')), skep: clamp(avgOf(dev, 'skep')), devout: true };
      const pf = (mother.faith + (father ?? mother).faith) / 2, pd = (mother.skep + (father ?? mother).skep) / 2;
      const v = villageAvg(mother) ?? { f: pf, d: pd };
      const roll = () => (Math.random() * 2 - 1) * F.BIRTH_SPREAD;
      const faith = clamp(F.PARENT_W * pf + F.VILLAGE_W * v.f + F.MID_W * F.MID_FAITH + roll());
      const skep = clamp(F.PARENT_W * pd + F.VILLAGE_W * v.d + F.MID_W * F.MID_DOUBT + roll());
      return { faith, skep };
    });
    const houseWord = (f, d) => (f - d >= 25 ? 'a devout house' : d - f >= 25 ? 'a skeptical house' : f - d >= 8 ? 'a house that leans to faith' : d - f >= 8 ? 'a house that leans to skepticism' : 'a house of both faith and skepticism');
    R.on('person:new', (p) => {
      const d = data(p);
      if (p.mother && p.age < 1) {
        const m = p.mother, fa = p.father ?? m;
        const v = villageAvg(m);
        const dev = believers(m, p.father);
        d.raised = dev.length ? (dev.length === 2 ? 'a devout house, and took its faith whole' : `a devout house: took ${dev[0] === m ? 'the mother' : 'the father'}'s faith whole`) : houseWord((m.faith + fa.faith) / 2, (m.skep + fa.skep) / 2);
        d.mark = { y: yearNow(), f: p.faith, d: p.skep };
        d.log.push({ y: yearNow(), y2: yearNow(), text: `Born into ${d.raised}${v && !dev.length ? `, in a village of faith ${Math.round(v.f)} and skepticism ${Math.round(v.d)}` : ''}: began at faith ${Math.round(p.faith)}, skepticism ${Math.round(p.skep)}`, df: 0, dd: 0, first: true });
        // the parents' tales: a devout house's child already has the parents' faith whole, so the tales add knowing, not faith
        tales.legends(p, [m, p.father].filter(Boolean), { silent: dev.length > 0 });
      } else {
        d.mark = { y: yearNow(), f: p.faith, d: p.skep };
        d.log.push({ y: yearNow(), y2: yearNow(), text: `Came with faith ${Math.round(p.faith)} and skepticism ${Math.round(p.skep)} of their own`, df: 0, dd: 0, first: true });
      }
    });

    // ---------- fading, and what slows it (people.js meters asks every tick) ----------
    let activeCmd = [];
    R.on('mind:commandments', (e) => { activeCmd = [...(e?.active ?? [])]; });
    function fadeWhy(p) {
      const d = data(p), why = [];
      let mul = 1;
      if (p.age < T.CHILD_UNTIL) { mul *= F.FADE_CHILD; why.push('a child, raised in it'); }
      if (S.life - d.prayLife <= F.PRAY_KEEP) { mul *= F.PRAY_MUL; why.push('prays'); }
      const tended = Math.max(d.tendLife, p.ext?.cmd?.tendedAt ?? -1e9);
      if (S.life - tended <= F.PRAY_KEEP) { mul *= F.TEND_MUL; why.push('tends the stone'); }
      if (activeCmd.length && (Number(R.ask('obedience', p)) || 0) >= F.KEPT_AT) { mul *= F.KEPT_MUL; why.push('keeps the commandments'); }
      const care = L.stone.care;
      if (care < F.NEGLECT_AT) { mul *= F.NEGLECT_MUL; why.push('the stone is neglected'); }
      else if (care >= F.KEPT_STONE_AT) { mul *= F.KEPT_STONE_MUL; why.push('the stone is well kept'); }
      return { faith: F.FADE_FAITH * mul, doubt: F.FADE_DOUBT * mul, mul, why };
    }
    R.answer('fade', (p) => {
      const d = data(p);
      if (d.fade && S.life - d.fadeAt < 0.25) return d.fade;
      d.fade = fadeWhy(p); d.fadeAt = S.life;
      return d.fade;
    });

    // ---------- practice: prayer, the stone's care, the devout tending it ----------
    let scanT = 0;
    R.on('step', ({ dt }) => {
      if (L.nextSample == null) L.nextSample = S.year;
      if (S.year >= L.nextSample) { sample(); L.nextSample = S.year + F.TREND_EVERY; }
      scanT -= dt;
      if (scanT > 0) return;
      scanT = 0.5;
      // a new day: the stone's care from yesterday's prayers and tending
      if (L.stone.day !== S.dayN) {
        if (L.stone.day >= 0) {
          const n = S.people.filter((p) => settled(p) && p.age >= 6).length;
          const share = n ? L.stone.today / n : 0;
          const was = L.stone.care;
          L.stone.care = clamp(L.stone.care * 0.5 + Math.min(1, share / F.STONE_SHARE) * 0.5, 0, 1);
          if (was >= F.NEGLECT_AT && L.stone.care < F.NEGLECT_AT && n >= 6) cause({ kind: 'stone', sign: -1, text: `The stone is neglected: hardly anyone prays there. Faith fades ${F.NEGLECT_MUL} times as fast.` });
          else if (was < F.KEPT_STONE_AT && L.stone.care >= F.KEPT_STONE_AT && n >= 6) cause({ kind: 'stone', sign: 1, text: 'The stone is well kept: many pray there. Faith fades more slowly.' });
        }
        L.stone.day = S.dayN; L.stone.today = 0;
      }
      const praying = S.people.filter((p) => !p.dead && p.work?.pose === 'pray' && /^praying/.test(p.doing ?? ''));
      L.stone.praying = praying.length;
      for (const p of praying) {
        const d = data(p);
        if (d.prayDay === S.dayN) continue;
        d.prayDay = S.dayN; d.prayLife = S.life; d.fade = null;
        const atStone = p.doing === 'praying at the stone';
        // the stone's care: a prayer at the stone counts whole, one at home facing it (too far to walk) half
        L.stone.today += atStone ? 1 : F.HOME_PRAYER;
        const others = praying.filter((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) <= F.TOGETHER_R).length;
        if (others >= F.TOGETHER_N && d.togetherDay !== S.dayN) { d.togetherDay = S.dayN; shift(p, F.TOGETHER_FAITH, 0, atStone ? 'Prayed at the stone with the others' : 'Prayed with the neighbours, facing the stone', { key: 'together' }); }
      }
      tales.step();
    });
    R.on('activity', (p) => {
      if (!settled(p) || p.stage === 'child' || p.faith < F.TEND_DEVOUT || p.fleeing || S.peopleApi.isNight()) return false;
      if (S.dayT >= T.PRAY_START && S.dayT < T.PRAY_END) return false;
      if (Math.random() >= F.TEND_CHANCE) return false;
      const c = S.stone.centre;
      if (Math.hypot(p.x - c.x, p.z - c.z) > T.PRAY_REACH) return false;
      const a = Math.random() * 6.283, rr = 4.5 + Math.random() * 3, A = S.peopleApi;
      A.goTo(p, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, { doing: 'walking to tend the stone', r: 0.8,
        then: () => A.work(p, 'pick', 4 + Math.random() * 2, { doing: 'tending the stone', face: c, then: () => { const d = data(p); d.tendLife = S.life; d.fade = null; L.stone.today += 0.5; L.stone.care = Math.min(1, L.stone.care + F.CARE_TEND); } }) });
      return true;
    });

    // ---------- doubt, for reasons ----------
    // prayed through a hardship and nothing came; or came through it by their own hands
    const hardStart = new Map();
    R.on('hardship:start', (e) => { if (e?.id) { hardStart.set(e.id, S.life); if (hardStart.size > 200) hardStart.delete(hardStart.keys().next().value); } });
    const HARD_WORDS = { drought: 'the drought', hunger: 'the hungry years', sickness: 'the sickness', fire: 'the fire', flood: 'the flood' };
    const shiftRun = new Map(); // hardship id -> { x, z, people: [{ p, df, dd }], prayed, own }
    R.on('hardship:survived', (e) => {
      const p = e?.person;
      if (!e?.unaided || !settled(p) || p.age < 12) return;
      const d = data(p);
      d.hard = d.hard ?? [];
      if (d.hard.includes(e.id)) return;
      d.hard.push(e.id); if (d.hard.length > 8) d.hard.shift();
      const start = hardStart.get(e.id) ?? S.life - 10;
      const what = HARD_WORDS[e.kind] ?? 'the bad years';
      const run = shiftRun.get(e.id) ?? (shiftRun.set(e.id, { x: p.x, z: p.z, people: [], prayed: 0, own: 0, what }), shiftRun.get(e.id));
      if (d.prayLife >= start) {
        const r = shift(p, F.UNANSWERED_FAITH, F.UNANSWERED_DOUBT, `Prayed through ${what}, and nothing came`);
        run.people.push({ p, ...r }); run.prayed++;
        S.mind.push(p, `We prayed all through ${what}. Nothing. Not a drop, not a word.`);
      } else {
        const r = shift(p, 0, F.OWN_HANDS_DOUBT, `Came through ${what} by their own hands`);
        run.people.push({ p, ...r }); run.own++;
      }
    });
    R.on('hardship:end', (e) => {
      const run = shiftRun.get(e?.id);
      if (!run) return;
      shiftRun.delete(e.id);
      const n = run.people.length;
      const df = avgOf(run.people, 'df'), dd = avgOf(run.people, 'dd');
      const text = `${run.prayed ? `${cap1(number(run.prayed))} prayed through ${run.what} and no help came` : ''}${run.prayed && run.own ? '; ' : ''}${run.own ? `${run.prayed ? number(run.own) : cap1(number(run.own))} came through it by their own hands` : ''}. Skepticism ${signed(dd)}${df ? `, faith ${signed(df)}` : ''} among them.`;
      if (run.prayed || n >= F.CAUSE_MIN) cause({ kind: 'hardship', sign: -1, text, n }); // a family getting by alone is not news
      S.emit('faith:shift', { x: run.x, z: run.z, text, people: run.people.map((x) => ({ p: x.p, df: x.df, dd: x.dd })) });
    });
    // discoveries explain what used to be the stone's
    R.on('mind:discovery', (e) => {
      const k = F.DISCOVERY_DOUBT[e?.id] ?? F.DISCOVERY_DOUBT.default;
      if (!k) return;
      const words = DISC_WORDS[e.id] ?? 'One less thing to ask the stone.';
      const moved = [];
      for (const p of S.people) {
        if (!settled(p) || p.age < 12) continue;
        moved.push(shift(p, -k / 2, k * (1 - p.faith / 200), `Learned of ${String(e.name ?? 'a discovery').toLowerCase()}. ${words}`));
      }
      if (moved.length) cause({ kind: 'discovery', sign: -1, text: `${e.name}: ${words} Skepticism ${signed(avgOf(moved, 'dd'))}, faith ${signed(avgOf(moved, 'df'))} among the grown.`, n: moved.length });
    });
    // a commandment that hurt them (commandments.js signals it)
    R.on('mind:hurt', (e) => {
      const p = e?.person;
      if (!settled(p)) return;
      shift(p, F.HURT_FAITH, F.HURT_DOUBT, e.text ?? 'A commandment of the stone hurt them');
    });
    // thinkers argue with whoever sits near them (the year's talk, faith-tales.js runs it with the tales)
    R.on('year', () => tales.year());

    // ---------- queries for the HUD and the forecasts ----------
    R.answer('wordForecast', (act, N, spec) => (spec?.tale === false || act.kind === 'commandment' ? '' : tales.forecast(act, N)));
    R.answer('faithLog', (p) => {
      const d = p?.ext?.faith;
      if (!d) return null;
      const lines = d.log.map((x) => ({ ...x }));
      if (d.mark) { const qf = p.faith - d.mark.f, qd = p.skep - d.mark.d; if (Math.abs(qf) >= 0.5 || Math.abs(qd) >= 0.5) lines.push({ y: d.mark.y, y2: yearNow(), quiet: true, df: qf, dd: qd, now: true }); }
      return { lines, fade: fadeWhy(p), raised: d.raised ?? null };
    });
    R.answer('faithLedger', () => {
      const pool = S.people.filter((p) => settled(p) && p.age >= 10);
      const groups = [];
      const vs = R.ask('villages');
      if (Array.isArray(vs) && vs.length) {
        for (const v of vs) { const ms = (v.members ?? []).filter((p) => p.age >= 10); if (ms.length) groups.push({ name: v.name, n: ms.length, faith: Math.round(avgOf(ms, 'faith')), doubt: Math.round(avgOf(ms, 'skep')), x: v.x, z: v.z }); }
      } else {
        for (const f of S.families) { if (f.state !== 'settled') continue; const ms = f.members.filter((p) => !p.dead && p.age >= 10); if (ms.length) groups.push({ name: `the ${f.name} family`, n: ms.length, faith: Math.round(avgOf(ms, 'faith')), doubt: Math.round(avgOf(ms, 'skep')), x: f.home?.cx, z: f.home?.cz }); }
      }
      groups.sort((a, b) => b.n - a.n);
      const fades = pool.map((p) => R.ask('fade', p));
      return {
        trend: L.trend.slice(), causes: [...L.causes].reverse().map((c) => ({ ...c, text: typeof c.live === 'function' ? c.live() : c.text })),
        last: tales.lastReach(), groups, stone: { care: Math.round(L.stone.care * 100) / 100, neglected: L.stone.care < F.NEGLECT_AT, kept: L.stone.care >= F.KEPT_STONE_AT, praying: L.stone.praying },
        fade: { faith: avgOf(fades.filter(Boolean), 'faith'), doubt: avgOf(fades.filter(Boolean), 'doubt') }, n: pool.length,
        faith: pool.length ? Math.round(avgOf(pool, 'faith')) : null, doubt: pool.length ? Math.round(avgOf(pool, 'skep')) : null,
        rules: rulesText(),
      };
    });
    // the balance's "why it stands here" (science.js asks): the three freshest causes, in words
    R.answer('faithCauses', () => [...L.causes].reverse().slice(0, 3).map((c) => `${R.yearLabel(c.y)}: ${typeof c.live === 'function' ? c.live() : c.text}`));
    function rulesText() {
      return { fadeFaith: F.FADE_FAITH, fadeDoubt: F.FADE_DOUBT, hearW: F.HEAR_W, retell: F.RETELL, lifeRate: T.LIFE_RATE };
    }

    // ---------- inspect: "why they believe" ----------
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const lg = R.ask('faithLog', e);
      if (!lg) return;
      const per10 = (v) => signed(v * T.LIFE_RATE * 10);
      const fd = lg.fade;
      const lines = [];
      lines.push(`Now: faith ${Math.round(e.faith)}, skepticism ${Math.round(e.skep)}. With nothing new, about ${per10(fd.faith)} faith and ${per10(fd.doubt)} skepticism every 10 years${fd.why.length ? ` (${fd.why.join(', ')})` : ''}.`);
      for (const x of [...lg.lines].reverse()) {
        const nums = [Math.abs(x.df) >= 0.05 ? `faith ${signed(x.df)}` : '', Math.abs(x.dd) >= 0.05 ? `skepticism ${signed(x.dd)}` : ''].filter(Boolean).join(', ');
        const when = x.y2 && x.y2 !== x.y ? `${R.yearLabel(x.y)} to ${x.now ? 'now' : R.yearLabel(x.y2)}` : R.yearLabel(x.y);
        if (x.quiet) lines.push(`${when}, quiet years${nums ? `: ${nums}` : ''}`);
        else lines.push(`${String(x.text).replace(/\.$/, '')}${x.n > 1 ? ` (${x.n} times)` : ''}, ${when}${nums ? `: ${nums}` : ''}`);
      }
      out.belief = { lines: lg.lines, fade: fd };
      R.section(out, { id: 'belief', title: 'Why they believe what they do', lines: lines.slice(0, 11), order: 31 });
    });
    R.on('thoughts', (p) => {
      if (p.asleep || p.dead) return null;
      const out = [];
      if (p.doing === 'tending the stone' && !p.ext?.cmd?.tendedAt) out.push([10, 'Somebody has to sweep the moss off it. It may as well be me.']);
      if (p.doing === 'on their knees, staring at the sky') out.push([30, 'I saw it. I saw it. I am not getting up yet.']);
      if (L.stone.care < F.NEGLECT_AT && p.faith > 40 && p.age >= 14) out.push([4, 'Nobody goes to the stone any more. It looks lonely.']);
      return out;
    });
    R.on('stats', (st) => { st.stoneCare = Math.round(L.stone.care * 100) / 100; st.tales = tales.count(); });

    // console helpers
    R.faith = { L, tales, notice, fadeWhy, reachOf, data, shift }; // shift: forces-prayers.js writes answered prayers into the ledger
  },
};
