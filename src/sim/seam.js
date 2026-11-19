// The plugin seam (stage 2): each subsystem lives in its own files and
// registers here, instead of editing index.js, people.js, mind.js or powers.js.
// docs/STAGE2-CONTRACTS.md is the contract; read it before adding anything.
//
//   R.on(name, fn)              lifecycle hooks, run in registration order (list in HOOKS)
//   R.signal(name, payload)     a subsystem's own news: its hooks, then the same name on the bus
//   R.answer(name, fn) / ask    named queries between subsystems (the last answer wins)
//   R.power(def)                a power by id: forecast(target, R) and carryOut(target, R)
//   R.witnessKind(kind, spec)   what seeing an act of that kind does to people
//   R.mod / unmod / value       stacking modifiers on the shared stats (STATS)
//   R.moment                    decision moments with the 25 second cap
//   R.data(e, id, init)         a subsystem's own data on a person, family or building: e.ext[id]
//   R.tune(id, block)           a subsystem's tunables, listed and changed from the console
// Everything here is deterministic and frame-rate independent, so skip() runs it as play does.
import { T } from './tune.js';
import { number, yearLabel } from './words.js';

// the hooks the core calls, and what they are handed (in this order inside one update, see docs)
export const HOOKS = ['phase:start', 'step', 'year', 'person:new', 'person:death', 'family:arrive', 'family:settle', 'family:leave',
  'family:new', 'animal:death', 'building:built', 'building:removed', 'activity', 'thoughts', 'fate', 'end', 'inspect', 'stats', 'forecast',
  'witnessed']; // witnessed: { act, spec, moved: [{ p, df, dd, how, w }], later, hooked, what } after R.witness applied an act (faith.js keeps the tale)

// the shared stats every subsystem may push on; value(stat, subject, base) = (base + sum of add) * product of mul
export const STATS = {
  work: 'how hard a person works (the effort multiplier on building, tending, gathering); subject a person',
  yield: 'food a field or a forager brings in; subject a family',
  store: 'how many life years of eating a family store can hold; subject a family',
  happy: 'the happiness target, in points; subject a person',
  faithDrift: 'faith gained (or lost, negative) a life year; subject a person',
  doubtDrift: 'skepticism gained (or lost) a life year; subject a person',
  fight: 'willingness to fight, 0 (hangs back) to 1; subject a person',
  strength: 'how well a person fights, 1 = an ordinary grown-up; subject a person',
  death: 'a multiplier on every death chance a subsystem rolls (sickness, fire, flood, a fight); subject a person',
  sickness: 'a multiplier on catching and dying of sickness; subject a person',
  think: 'how fast a person thinks toward a discovery; subject a person',
  grudge: 'how fast grudges build; subject a person, a family or a clan',
};
// the seam's own tunables
export const TUNE_SEAM = {
  MOMENT_CAP_S: 4,      // a moment holds time at most this many real seconds (2026-11-13 joining pass: was 20; at 1x 43 in 100
                        // seconds of play were slowed, a fever held time for 13 s)
  MOMENT_FAST_CAP_S: 1, // at 2x and 4x a moment is only a brief dip: at most this many real seconds
  MOMENT_OFF: ['sickness', 'hunger', 'drought', 'flood'], // kinds that never slow time: years away, the warning tokens carry them
  MOMENT_QUIET_S: 60,   // and the same id opens no other moment for this many real seconds after
  // integration tuning (so slowed time is the exception, not the rule):
  MOMENT_SPEED_EXP: 0.75, // at speed s a moment holds at most cap / s^this (2x: 15 s of 25, 4x: 9 s): the god chose speed
  MOMENT_GAP_S: 25,     // no moment opens within this many real seconds of another ending (was: minor ones only), so at most
                        // about 4 s in 29 (14 in 100) of play is slowed even in a busy village
  MOMENT_MINOR: { drought: 8, flood: 6, hunger: 12 }, // minor kinds and their caps (s); a subsystem may also pass minor: true
  MOMENT_MINOR_CAP_S: 10, // the cap of a moment flagged minor whose kind has no cap above
  FIGHT_ADULT: 1, FIGHT_ELDER: 0.4, FIGHT_CHILD: 0, // base willingness to fight by age
  FIGHT_DEPENDENT: 0.3, // a person who expects help fights at this fraction (DESIGN.md: they will not fight)
};
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const EMPTY = [];

export function makeSeam(ctx, S) {
  const hooks = new Map();     // name -> [{ fn, owner }]
  const answers = new Map();   // name -> fn
  const powers = new Map();    // id -> def
  const kinds = new Map();     // witness kind -> spec or fn(act) -> spec
  const mods = new Map();      // stat -> [modifier]
  const tunes = new Map();     // id -> block
  const subs = [];             // loaded subsystems { id, owner }
  const failed = new Set();
  const moments = new Map();   // id -> { open, t, quiet, cap, quietS }
  const asides = new Map();    // key -> { n, last }
  const R = { ctx, S, T, number, yearLabel, cap1, HOOKS, STATS, TUNE_SEAM, words: {} };
  let owner = 'core';

  const guard = (where, fn, args) => {
    try { return fn(...args); } catch (err) {
      if (!failed.has(where)) { failed.add(where); console.error(`sim seam: ${where} failed`, err); }
      return undefined;
    }
  };

  // ---------- hooks ----------
  R.on = (name, fn) => {
    if (!hooks.has(name)) hooks.set(name, []);
    const h = { fn, owner };
    hooks.get(name).push(h);
    return () => { const l = hooks.get(name); const i = l.indexOf(h); if (i >= 0) l.splice(i, 1); };
  };
  R.has = (name) => (hooks.get(name)?.length ?? 0) > 0;
  R.run = (name, ...args) => {
    const l = hooks.get(name);
    if (!l || !l.length) return;
    for (const h of l) guard(`${h.owner} ${name}`, h.fn, args);
  };
  // the first hook that returns something truthy wins (activity: a subsystem claims the person's next act)
  R.first = (name, ...args) => {
    const l = hooks.get(name);
    if (!l || !l.length) return undefined;
    for (const h of l) { const r = guard(`${h.owner} ${name}`, h.fn, args); if (r) return r; }
    return undefined;
  };
  // during sim.skip every signal's payload carries skip: true, so the screen files it straight to the Log instead of
  // announcing old news (four discovery tokens crowding the rail after a skip, 2026-11-13)
  const marked = (payload) => (S.skipAlerts && payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.assign(payload, { skip: true }) : payload);
  R.signal = (name, payload) => { payload = marked(payload); R.run(name, payload); ctx.events.emit(name, payload); };

  // ---------- queries ----------
  R.answer = (name, fn) => { answers.set(name, fn); };
  R.ask = (name, ...args) => { const fn = answers.get(name); return fn ? guard(`ask ${name}`, fn, args) : undefined; };

  // ---------- per-entity data ----------
  R.data = (e, id, init) => {
    if (!e) return null;
    const x = e.ext ?? (e.ext = {});
    if (x[id] === undefined && init) x[id] = typeof init === 'function' ? init(e) : init;
    return x[id];
  };
  // shared traits (a small fixed vocabulary, docs/STAGE2-CONTRACTS.md): set by one subsystem, acted on by another
  R.trait = (p, name, value) => {
    const t = R.data(p, 'traits', () => ({}));
    if (value === undefined) return t[name];
    if (value === null || value === false) delete t[name]; else t[name] = value;
    return t[name];
  };

  // ---------- modifiers ----------
  const matches = (m, s) => m.who == null || m.who === s || (s && m.who === s.family) || (typeof m.who === 'function' && m.who(s));
  R.mod = (stat, key, spec = {}) => {
    if (!STATS[stat]) console.warn(`sim seam: unknown stat "${stat}" (add it to STATS in seam.js by agreement)`);
    const list = mods.get(stat) ?? (mods.set(stat, []), mods.get(stat));
    const m = { stat, key, add: spec.add ?? 0, mul: spec.mul ?? 1, who: spec.who ?? null, until: spec.until ?? null, source: spec.source ?? owner, note: spec.note ?? '' };
    const i = list.findIndex((x) => x.key === key);
    if (i >= 0) list[i] = m; else list.push(m);
    return key;
  };
  R.unmod = (stat, key) => { const l = mods.get(stat); if (!l) return false; const i = l.findIndex((x) => x.key === key); if (i >= 0) l.splice(i, 1); return i >= 0; };
  R.unmodSource = (source) => { for (const l of mods.values()) for (let i = l.length - 1; i >= 0; i--) if (l[i].source === source) l.splice(i, 1); };
  R.mods = (stat, subject) => (stat ? (mods.get(stat) ?? EMPTY) : [...mods.values()].flat()).filter((m) => subject === undefined || matches(m, subject));
  const BASE = {
    fight: (p) => (p.stage === 'child' ? TUNE_SEAM.FIGHT_CHILD : p.stage === 'elder' ? TUNE_SEAM.FIGHT_ELDER : TUNE_SEAM.FIGHT_ADULT) * (p.expectsHelp ? TUNE_SEAM.FIGHT_DEPENDENT : 1),
    strength: () => 1, death: () => 1, sickness: () => 1, think: () => 1, grudge: () => 1, store: () => T.STORE_MAX_YEARS,
  };
  R.value = (stat, subject, base) => {
    if (base === undefined) base = BASE[stat] ? BASE[stat](subject) : 0;
    const list = mods.get(stat);
    if (!list || !list.length) return base;   // the common case: nothing pushes on it
    let add = 0, mul = 1;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.until != null && S.life > m.until) { list.splice(i, 1); continue; }
      if (!matches(m, subject)) continue;
      add += m.add; mul *= m.mul;
    }
    return (base + add) * mul;
  };

  // ---------- tunables ----------
  R.tune = (id, block) => { if (block) tunes.set(id, block); return tunes.get(id); };
  // console: sim.tune() lists every block; sim.tune('hardship') one; sim.tune('hardship', 'KEY', 3) sets
  R.tuneConsole = (id, key, value) => {
    if (id == null) return Object.fromEntries(tunes);
    const b = tunes.get(id);
    if (!b) return undefined;
    if (key == null) return b;
    if (value !== undefined) b[key] = value;
    return b[key];
  };
  R.tune('sim', T); R.tune('seam', TUNE_SEAM);

  // ---------- story, alerts, the narrator ----------
  R.story = (p, text) => S.peopleApi.story(p, text);
  // a changed fate, told the stage 1 way: "Was to die at 55 by a wolf. The wolf was struck down in 4931 BC."
  R.fateChanged = (p, was, why) => S.peopleApi.story(p, `Was to ${was}. ${why}`);
  R.alert = (severity, text, o = {}) => S.alert(severity, text, o.x, o.z, o.aside, o.subject);
  // a narrator aside for this key: the first time, then at most once every `every` calendar years, cycling the list
  R.aside = (key, list, every = 100) => {
    const a = asides.get(key) ?? (asides.set(key, { n: 0, last: -1e9 }), asides.get(key));
    a.n++;
    if (a.n !== 1 && S.year - a.last <= every) return undefined;
    a.last = S.year;
    return list[(a.n - 1) % list.length];
  };
  // stage 1 death words by cause; add yours: R.words.fever = 'died of a fever'
  R.deathWords = (cause) => R.words[cause];

  // ---------- targets ----------
  // one shape for every power: { kind: 'person'|'animal'|'area'|'building'|'clan'|'grave'|'none', entity?, x?, z?, r?, clan?, grave?, args? }
  // (a grave: { kind: 'grave', grave: its id, x, z }, from graves.js; the power Resurrect aims at one)
  R.target = (t) => {
    if (t == null) return null;
    if (typeof t === 'string') t = ctx.core.byId.get(t) ?? S.people.find((p) => p.id === t) ?? null;
    if (!t) return null;
    if (t.kind === 'person' || t.kind === 'animal') {
      if (t.entity !== undefined) return t;
      return { kind: t.kind, entity: t, x: t.x, z: t.z };
    }
    if (t.cat === 'building' || t.cat === 'holy') return { kind: 'building', entity: t, x: t.mx ?? t.x, z: t.mz ?? t.z };
    if (t.kind === 'area' || t.kind === 'building' || t.kind === 'clan' || t.kind === 'grave' || t.kind === 'none') return t;
    if (t.x != null && t.z != null) return { kind: 'area', x: t.x, z: t.z, r: t.r ?? 0 };
    return null;
  };

  // ---------- clans (the default: a clan is a family; the clans subsystem answers these instead) ----------
  const famClan = (f) => (f ? { id: `clan:${f.id}`, name: f.name, family: f, dye: f.dye, members: f.members.filter((m) => !m.dead) } : null);
  R.answer('clanOf', (p) => famClan(p?.family));
  R.answer('clanMembers', (c) => (c?.kind === 'person' ? famClan(c.family)?.members : c?.members) ?? []);
  R.answer('clans', () => S.families.filter((f) => f.state === 'settled').map(famClan));
  // 0 well fed .. 1 starving: the share of a year's eating the store cannot cover, or hunger already biting
  R.answer('foodPressure', (f) => {
    if (!f) return 0;
    const need = Math.max(0.01, S.peopleApi.needOf(f));
    return Math.max(0, Math.min(1, f.shortRate > 0 ? 0.5 + f.shortRate / 2 : 1 - f.food / need));
  });

  // ---------- sight and witnessing (sight from powers.js) ----------
  let sight = null;
  R.useSight = (P) => { sight = P; R.watchers = P.watchers; R.seenAt = (x, z, r, kind) => R.noticeCount({ kind, x, z, r: r ?? 0 }); R.sees = P.sees; R.isEarly = P.isEarly; R.whoText = P.whoText; R.earlyCost = P.earlyCost; R.bolt = P.bolt; };
  R.witnessKind = (kind, spec) => { kinds.set(kind, spec); };
  R.witnessSpec = (act) => {
    const s = kinds.get(act.kind) ?? kinds.get('*');
    if (typeof s !== 'function') return s;
    const o = s(act, R);
    if (o && typeof o === 'object' && !o.kind) o.kind = act.kind; // made for this act: it is of this act's kind
    return o;
  };
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const textOf = (v, p, act) => (typeof v === 'function' ? v(p, act) : v);
  // Who notices an act, and how strongly (docs/FAITH.md). The faith subsystem (faith.js) answers with
  // { now: [{ p, w, t, how, story?, thought? }], later: [{ p, w, t }] }: `now` notice it at once (how 'saw' close
  // by, 'far' from a distance, 'woke' brought out by thunder or a glow), `later` find what it left at their next
  // waking. w scales what it does to them, t is how far they trust their own eyes (doubters explain it away).
  // Without the faith subsystem: the stage 1 rule, everyone awake outdoors within sight.
  let noticeFn = null;
  R.useNotice = (fn) => { noticeFn = fn; };
  R.notice = (act, spec = {}) => {
    const r = Math.max(act.r ?? 0, spec?.r ?? 0);
    let N = noticeFn ? noticeFn({ ...act, kind: act.kind ?? spec?.kind, r }, spec) :{ now: sight.watchers(act.x, act.z, r).map((p) => ({ p, w: 1, t: 1, how: 'saw' })), later: [] };
    if (spec?.exclude) N = { now: N.now.filter((n) => n.p !== spec.exclude), later: N.later.filter((n) => n.p !== spec.exclude) };
    return N;
  };
  R.noticeCount = (act) => { const spec = act.kind ? R.witnessSpec(act) : null; return spec?.unseen ? 0 : R.notice(act, spec ?? {}).now.length; };
  // an act happened: who saw it, and what it does to each of them, by the spec of its kind (docs: witness spec)
  R.witness = (act = {}) => {
    if (act.x == null || act.z == null) return 0;
    const spec = R.witnessSpec(act) ?? {};
    // an unseen act (a sent sickness, a given thought, calm, provoke, favour): nobody is counted, nobody's mind moves
    if (spec.unseen) {
      S.emit('sim:witness', { kind: act.kind, seenBy: 0, x: act.x, z: act.z, unseen: true, ...(spec.payload?.(act) ?? {}) });
      spec.report?.([], act, 0, spec);
      return 0;
    }
    const N = R.notice(act, spec);
    const seen = N.now.map((n) => n.p);
    let hooked = 0;
    const moved = [];
    for (const n of N.now) {
      const p = n.p, close = n.how === 'saw';
      const early = sight.isEarly(p), m = (early && close && spec.early ? spec.early : 1) * n.w;
      const k = m * (n.t ?? 1);
      p.thinkT = 0;
      const th = n.thought ?? textOf(spec.thought, p, act);
      if (th) S.mind.push(p, th);
      if (spec.happy) p.happy = clamp(p.happy + spec.happy * m);
      if (spec.dread && n.w >= 0.6) { p.dread = spec.dread * n.w; if (spec.dreadOf) p.dreadOf = spec.dreadOf; }
      const f0 = p.faith, d0 = p.skep;
      if (spec.faith) p.faith = clamp(p.faith + spec.faith * k);
      if (spec.doubt) p.skep = clamp(p.skep + spec.doubt * k);
      moved.push({ p, df: p.faith - f0, dd: p.skep - d0, how: n.how, w: n.w });
      p.lastSaw = S.lifeNow();
      p.sawCount = (p.sawCount ?? 0) + 1;
      const st = n.story ?? textOf(spec.story, p, act);
      if (st) S.peopleApi.story(p, st);
      // only those who saw it close by, in their first years here, learn to lean on it (not a far flash, not hearsay)
      if (spec.hooks && early && close && !p.expectsHelp) {
        p.expectsHelp = true; hooked++;
        S.peopleApi.story(p, 'From then on expected the stone to help, and worked less.');
      }
      spec.each?.(p, act, early);
    }
    spec.after?.(seen, act, hooked);
    // the faith subsystem keeps the tale: households, word spreading, those who find it at dawn, the ledger
    const info = { act, spec, moved, later: N.later, hooked, what: textOf(spec.what, null, act) ?? null };
    R.run('witnessed', info);
    S.emit('sim:witness', { kind: act.kind, seenBy: seen.length, x: act.x, z: act.z, later: N.later.length, ...(spec.payload?.(act) ?? {}) });
    (spec.report ?? R.reportWitness)(seen, act, hooked, spec, info);
    return seen.length;
  };
  const avgOf = (l, k) => (l.length ? l.reduce((s, x) => s + x[k], 0) / l.length : 0);
  const signed = (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}`;
  // the alerts after an act was seen (any spec may use it, or write its own `report`): how many, and what it did
  R.reportWitness = (seen, act, hooked, spec, info) => {
    const what = textOf(spec?.what, null, act) ?? 'something no person could do';
    const moved = info?.moved ?? [];
    const later = info?.later?.length ?? 0;
    const far = moved.filter((m) => m.how !== 'saw').length;
    if (seen.length) {
      const nums = moved.length ? ` Faith ${signed(avgOf(moved, 'df'))}, skepticism ${signed(avgOf(moved, 'dd'))} on average.` : '';
      S.alert('info', `${seen.length === 1 ? 'One person' : `${cap1(number(seen.length))} people`} saw ${what}${far ? ` (${number(far)} from afar)` : ''}.${nums}${later ? ` ${cap1(number(later))} more will find it when they wake.` : ''} Word will spread.`, act.x, act.z);
    } else if (later) S.alert('info', `Nobody saw ${what}, but ${number(later)} will find it when they wake.`, act.x, act.z);
    if (hooked) S.alert('warn', `${hooked === 1 ? 'One of them' : `${cap1(number(hooked))} of them`} had only just arrived. They will expect help from now on and work less, for good.`, act.x, act.z, 'They have learned that the sky does chores.');
  };
  // what a witness spec will do, in words, for a forecast: built from the same numbers R.witness applies (honest by construction)
  R.describeWitness = (spec, x, z, r = 0, kind) => {
    if (spec?.unseen) return { seen: [], seenBy: 0, who: typeof spec.unseen === 'string' ? spec.unseen : 'Nobody sees it.', costs: [] };
    const act = { kind: kind ?? spec?.kind, x, z, r };
    const N = R.notice(act, spec ?? {});
    const seen = N.now.map((n) => n.p);
    const costs = [];
    if (seen.length && spec) {
      const parts = [];
      if (spec.faith) parts.push(`faith ${spec.faith > 0 ? '+' : ''}${Math.round(spec.faith)}`);
      if (spec.doubt) parts.push(`skepticism ${spec.doubt > 0 ? '+' : ''}${Math.round(spec.doubt)}`);
      if (spec.happy) parts.push(`happiness ${spec.happy > 0 ? '+' : ''}${Math.round(spec.happy)}`);
      if (parts.length) costs.push(`Each who sees it close by: ${parts.join(', ')}${spec.early > 1 ? ` (${spec.early} times as much in those who came only recently)` : ''}; less from afar, and less in skeptics.`);
      if (spec.hooks) { const e = sight.earlyCost(N.now.filter((n) => n.how === 'saw').map((n) => n.p)); if (e) costs.push(e); }
    }
    const word = R.ask('wordForecast', act, N, spec) ?? '';
    return { seen, seenBy: seen.length, later: N.later.length, who: `${R.whoNotice(N)}${word ? ` ${word}` : ''}`, word, costs };
  };
  // "Nine people are watching, four of them from afar. Three more will find it when they wake."
  R.whoNotice = (N) => {
    const n = N.now.length, far = N.now.filter((x) => x.how !== 'saw').length, later = N.later.length;
    const base = sight.whoText(n);
    const farT = n && far ? ` ${far === n ? (n === 1 ? 'From afar.' : 'All from afar.') : `${cap1(number(far))} of them from afar.`}` : '';
    const laterT = later ? ` ${cap1(number(later))} more will find it when they wake.` : '';
    return `${base}${farT}${laterT}`;
  };

  // ---------- powers ----------
  // the forecast shape, the same for every power (extra keys are allowed and passed through)
  R.shape = (f) => {
    const o = f ?? {};
    return Object.assign(o, { ok: o.ok !== false, gains: o.gains ?? [], costs: o.costs ?? [], who: o.who ?? '', seenBy: Number(o.seenBy) || 0, fates: o.fates ?? [], confirm: o.confirm === 'hold' ? 'hold' : 'click' });
  };
  R.refuse = (text) => R.shape({ ok: false, gains: [], costs: [], who: text, seenBy: 0, fates: [] });
  R.power = (def) => {
    if (!def?.id) throw new Error('a power needs an id');
    powers.set(def.id, { ...def, owner });
    // an object spec learns its kind, so its forecast (describeWitness) uses that kind's reach (faith.js NOTICE)
    if (def.witness && typeof def.witness === 'object' && !def.witness.kind) def.witness.kind = def.kind ?? def.id;
    if (def.witness) R.witnessKind(def.kind ?? def.id, def.witness);
    return def.id;
  };
  R.powers = () => [...powers.keys()];
  R.forecast = (id, target) => {
    const def = powers.get(id);
    const t = R.target(target);
    if (!def) {
      // any other act (the land tools): only who would see it
      if (!t || t.x == null) return { gains: [], costs: [], who: 'Nothing to forecast here.', seenBy: 0, ok: false, fates: [] };
      const spec = R.witnessSpec({ kind: id, x: t.x, z: t.z, r: t.r ?? 0 }) ?? {};
      const w = R.describeWitness(spec, t.x, t.z, t.r ?? 0, id);
      return { gains: [], costs: w.costs, who: w.who, seenBy: w.seenBy, later: w.later, word: w.word, ok: true, fates: [] };
    }
    const f = R.shape(guard(`${def.owner} forecast ${id}`, def.forecast, [t, R]) ?? R.refuse('This power has nothing to say here.'));
    // forecast extenders: another subsystem adds what it knows (a raid's leader, a wolf's prey's trouble).
    // A hook pushes onto f.gains / f.costs / f.fates / f.later only what that subsystem's own hooks then do.
    if (f.ok && R.has('forecast')) { if (!f.later) f.later = []; R.run('forecast', { id, target: t, forecast: f }); }
    return f;
  };
  R.act = (id, target) => {
    const def = powers.get(id);
    if (!def) return { ok: false, text: 'There is no such power.' };
    const r = guard(`${def.owner} carryOut ${id}`, def.carryOut, [R.target(target), R]);
    return r ?? { ok: false, text: 'Nothing happened.' };
  };

  // ---------- moments (time slows for a decision; the director's 25 second cap) ----------
  const now = () => S.now(); // real ms in play, the skip's own clock in a skip
  let lastClosed = -1e12; // real ms the last moment ended (minor ones wait MOMENT_GAP_S after it)
  // the cap now, by the clock's speed (the faster time runs, the shorter a moment holds it)
  const capNow = (m) => ((ctx.clock.speed || 1) > 1 ? Math.min(m.cap, TUNE_SEAM.MOMENT_FAST_CAP_S * 1000) : m.cap);
  const M = {
    isOpen: (id) => !!moments.get(id)?.open,
    // open one now (nothing happens if it is open or quiet); info: { text, x, z, kind, act? } or a function giving it.
    // o: { cap?, quiet?, minor? }. A minor moment (o.minor, or a kind in MOMENT_MINOR) has a short cap and does
    // not open within MOMENT_GAP_S of another ending, so small things never crawl the calendar back to back.
    open(id, info, o = {}) {
      const clk = ctx.clock;
      if (!clk.hold) return false;
      const m = moments.get(id) ?? (moments.set(id, { open: false, t: 0, quiet: 0 }), moments.get(id));
      if (m.open || m.quiet > now()) return false;
      const inf = typeof info === 'function' ? info() : info;
      if (TUNE_SEAM.MOMENT_OFF.includes(inf?.kind)) return false; // slow troubles never slow time (the tokens warn of them)
      const kindCap = TUNE_SEAM.MOMENT_MINOR[inf?.kind];
      const minor = !!o.minor || kindCap != null;
      const busy = [...clk.moments.keys()].some((k) => k !== 'player'); // the player's own slow does not count
      // one at a time, and a cool-off after each, whatever the kind
      if (busy || now() - lastClosed < TUNE_SEAM.MOMENT_GAP_S * 1000) return false;
      const cap = Math.min(TUNE_SEAM.MOMENT_CAP_S, minor ? Math.min(o.cap ?? Infinity, kindCap ?? TUNE_SEAM.MOMENT_MINOR_CAP_S) : (o.cap ?? TUNE_SEAM.MOMENT_CAP_S));
      m.open = true; m.t = now(); m.cap = cap * 1000; m.quietS = o.quiet ?? TUNE_SEAM.MOMENT_QUIET_S;
      clk.hold(id, inf);
      return true;
    },
    // end it; quiet (default) keeps the same id from opening again for a while; forget drops its record
    close(id, o = {}) {
      const m = moments.get(id);
      if (!m) return false;
      const was = m.open;
      if (was) {
        if (o.quiet !== false) m.quiet = now() + m.quietS * 1000;
        m.open = false; m.t = 0;
        ctx.clock.release(id);
        lastClosed = now();
      }
      if (o.forget) moments.delete(id);
      return was;
    },
    // call every step: open while `active`, close when it stops or the cap runs out (the wolf's rule)
    keep(id, active, info, o) {
      if (!ctx.clock.hold) return;
      const m = moments.get(id);
      if (active && !m?.open) M.open(id, info, o);
      else if (m?.open && (!active || now() - m.t > capNow(m))) M.close(id);
    },
  };
  R.moment = M;
  function capMoments() {
    if (!moments.size) return;
    const t = now();
    for (const [id, m] of moments) if (m.open && t - m.t > capNow(m)) M.close(id);
  }

  // ---------- the core's calls into the seam ----------
  let lastYear = null;
  R.started = () => { lastYear = Math.floor(S.year); R.run('phase:start'); };
  // after the built-in per-frame ticks: step hooks, then a year hook for each whole year crossed, then moment caps
  R.tick = (dt, dYears, dLife) => {
    R.run('step', { dt, dYears, dLife });
    const y = Math.floor(S.year);
    if (lastYear == null) lastYear = y;
    while (lastYear < y) { lastYear++; R.run('year', { year: lastYear }); }
    capMoments();
  };
  // the person's next activity: a subsystem may claim it (returns true after starting a walk or a piece of work)
  R.claim = (p) => (R.has('activity') ? !!R.first('activity', p) : false);
  // extra thought candidates: [[weight, text], ...]
  R.thoughtsFor = (p, c) => {
    if (!R.has('thoughts')) return c;
    for (const h of hooks.get('thoughts')) { const more = guard(`${h.owner} thoughts`, h.fn, [p]); if (more?.length) for (const x of more) c.push(x); }
    return c;
  };
  // the end of a life, if a subsystem's state makes it come sooner: { age, how, words, line }
  R.endOf = (p, end) => {
    if (!R.has('end')) return end;
    for (const h of hooks.get('end')) {
      const e = guard(`${h.owner} end`, h.fn, [p, end]);
      if (e && e.age < end.age) end = { ...e, wolf: end.wolf };
    }
    return end;
  };
  R.fateLines = (p) => {
    if (!R.has('fate')) return EMPTY;
    const out = [];
    for (const h of hooks.get('fate')) { const l = guard(`${h.owner} fate`, h.fn, [p]); if (l) out.push(...(Array.isArray(l) ? l : [l])); }
    return out;
  };
  // inspect extenders add fields to `out` or named sections: R.section(out, { id, title, lines | rows, order })
  R.section = (out, sec) => { (out.sections ?? (out.sections = [])).push(sec); return sec; };

  // ---------- loading the subsystems (plugins.js) ----------
  R.add = (sub) => {
    if (!sub?.id) throw new Error('a subsystem needs an id');
    owner = sub.id;
    try {
      if (sub.tune) R.tune(sub.id, sub.tune);
      sub.init?.(R);
      subs.push({ id: sub.id });
    } finally { owner = 'core'; }
  };
  R.load = async (list) => {
    for (const load of list) {
      try {
        const m = await load();
        const sub = m.default ?? m.subsystem;
        if (sub) R.add(sub);
      } catch (err) { console.error('sim seam: a subsystem failed to load', err); }
    }
  };
  R.subsystems = () => subs.map((s) => s.id);
  return R;
}
