// Stage 2's data, read for the screen: one place that asks the simulation's
// named queries (docs/STAGE2-CONTRACTS.md section 5) and turns whatever comes
// back into the few shapes the panels draw. Every reader is guarded and cached
// for a quarter second, and every one has an honest answer when nobody answers
// yet (the stubs): nothing, or what stage 1 already knows.
//   clans()        [{ id, name, dye (css), mark, members, family, village, faith, grudges: [{ clan, name, level 0..1 }], favoured }]
//   clanOf(p)      the clan of a person (C's clanOf, else the family)
//   commandments() { all: [{ id, name, benefit, risk, active, obey, of }], active: [ids], live }  (B)
//   balance()      { faith, doubt, share (0 all doubt .. 1 all faith), from: 'mind' | 'stats' }   (B, else stage 1's averages)
//   earth()        { year, ahead, last, next, live }  (B)
//   discoveries()  { made: [{ id, name, year, earthYear, person, x, z, effects }], next: [{ id, name, earthYear }] }  (B)
//   hardships()    [{ id, kind, x, z, r, people, sent, text }]  (A)
//   fights()       [{ id, kind, a, b, x, z, sides: [{ clan, n }] }]  (C)
//   thoughts()     the ready thoughts [{ id, text, group, hint }] (B; query name `readyThoughts`, not in the contract)
//   health(p)      { sick, wounded, words } for a person, from what A tells (traits, hardships, sections)
import { MARK_IDS } from './dom.js';

const CACHE_S = 0.25;
const hex = (n) => `#${(Number(n) >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;
export const dyeCss = (d) => (typeof d === 'number' ? hex(d) : typeof d === 'string' && d ? d : '#8C5A3C');
// a stable small number from an id, for a mark
const hash = (s) => { let x = 2166136261; for (const c of String(s)) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0; };
const arr = (v) => (Array.isArray(v) ? v : []);
const titleOf = (id) => String(id ?? '').replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const pct = (v) => (Number.isFinite(v) ? (Math.abs(v) <= 1.0001 ? v : v / 100) : null);

// the six commandments' words, used when the simulation gives a commandment without its own words (plan choice)
export const COMMANDMENTS = {
  'store-grain': { name: 'Store grain', benefit: 'Families keep more food against a bad year.', risk: 'They eat less now, and a full store tempts raiders.' },
  'train-fighters': { name: 'Train fighters', benefit: 'Clans fight better when it comes to blows.', risk: 'Less work in the fields, and readier fists.' },
  'settle-by-water': { name: 'Settle by water', benefit: 'Newcomers build close to fresh water.', risk: 'Crowded banks, and floods reach more homes.' },
  'honour-thinkers': { name: 'Honour thinkers', benefit: 'Thinkers are fed and spared work, so discoveries come sooner.', risk: 'Fewer hands at work, and skepticism spreads.' },
  'keep-the-peace': { name: 'Keep the peace', benefit: 'Grudges build more slowly between clans.', risk: 'Wrongs go unanswered, and the bold take advantage.' },
  'tend-the-stone': { name: 'Tend the stone', benefit: 'Faith holds steady even when nothing is seen.', risk: 'Time at the stone is time not spent working or thinking.' },
};

export function makeS2(U) {
  const cache = new Map();
  const now = () => performance.now() / 1000;
  const memo = (key, fn) => {
    const c = cache.get(key);
    if (c && now() - c.t < CACHE_S) return c.v;
    let v;
    try { v = fn(); } catch (err) { U.warnOnce(`s2 ${key}`, err); v = undefined; }
    cache.set(key, { t: now(), v });
    return v;
  };
  const ask = (name, ...args) => U.call('sim', 'ask', name, ...args);
  const powers = () => memo('powers', () => new Set([...(U.call('sim', 'powers') ?? [])]));
  const living = () => arr(U.get('sim', 'people')).filter((p) => !p.dead);

  // ---------- clans (C; until then a clan is a settled family) ----------
  let favouredId = null;
  const S = {};
  function normClan(c) {
    if (!c) return null;
    const id = c.id ?? `clan:${c.family?.id ?? c.name}`;
    const members = arr(c.members).filter((m) => m && !m.dead);
    const v = c.village ?? null;
    const home = c.family?.home;
    const village = v ? { name: v.name ?? `${c.name} village`, x: v.x ?? v.cx, z: v.z ?? v.cz } : home ? { name: null, x: home.mx ?? home.cx ?? home.x, z: home.mz ?? home.cz ?? home.z } : null;
    let faith = Number.isFinite(c.faith) ? c.faith : null;
    if (faith == null && members.length) faith = members.reduce((a, m) => a + (m.faith ?? 0), 0) / members.length;
    // grudges: an array of { clan|against|id|to, level|value|n } or a map id -> level; levels 0..1 or 0..100
    let g = c.grudges ?? c.grudge ?? null;
    if (g && !Array.isArray(g) && typeof g === 'object') g = Object.entries(g).map(([k, val]) => ({ clan: k, level: val }));
    const grudges = arr(g).map((x) => {
      const other = x.clan ?? x.against ?? x.to ?? x.id ?? x.other;
      const level = pct(Number(x.level ?? x.value ?? x.n ?? x.amount));
      return { clan: typeof other === 'object' ? other?.id : other, name: typeof other === 'object' ? other?.name : x.name ?? null, level: level == null ? 0 : Math.max(0, Math.min(1, level)) };
    }).filter((x) => x.clan != null);
    return {
      id, name: c.name ?? 'Unnamed', dye: dyeCss(c.dye ?? c.colour ?? c.color ?? c.family?.dye),
      mark: MARK_IDS.includes(c.mark) ? c.mark : MARK_IDS[hash(id) % MARK_IDS.length],
      members, family: c.family ?? null, village, faith, grudges,
      favoured: c.favoured === true || c.favored === true || id === favouredId, raw: c,
    };
  }
  S.clans = () => memo('clans', () => arr(U.call('sim', 'clans')).map(normClan).filter(Boolean));
  S.clanById = (id) => S.clans().find((c) => c.id === id || c.raw === id) ?? null;
  S.clanOf = (p) => {
    if (!p) return null;
    const raw = U.call('sim', 'clanOf', p);
    if (!raw) return null;
    const id = raw.id ?? `clan:${raw.family?.id ?? raw.name}`;
    return S.clans().find((c) => c.id === id) ?? normClan(raw);
  };
  S.clanName = (id) => S.clanById(id)?.name ?? (typeof id === 'string' ? titleOf(id.replace(/^clan:/, '')) : 'another clan');
  // the god's private mark (Favour): C may flag it on the clan; else the UI remembers the last favour act
  S.setFavoured = (id) => { favouredId = id; cache.delete('clans'); };
  S.favoured = () => S.clans().find((c) => c.favoured) ?? null;

  // ---------- commandments (B) ----------
  S.commandments = () => memo('cmd', () => {
    const live = powers().has('commandment');
    let raw = ask('commandments');
    let active = [];
    if (raw && !Array.isArray(raw) && typeof raw === 'object') { active = arr(raw.active).map((x) => x?.id ?? x); raw = raw.all ?? raw.list ?? raw.set ?? Object.values(raw).find(Array.isArray) ?? []; }
    const list = arr(raw).map((x) => (typeof x === 'string' ? { id: x } : x)).filter((x) => x?.id);
    if (!list.length) return { all: [], active: [], live, max: 2 };
    if (!active.length) active = list.filter((x) => x.active || x.on).map((x) => x.id);
    const people = living().filter((p) => p.family?.state === 'settled' && p.stage !== 'child');
    const all = list.map((x) => {
      const w = COMMANDMENTS[x.id] ?? {};
      let obey = Number.isFinite(x.obey) ? x.obey : Number.isFinite(x.obeyed) ? x.obeyed : null;
      if (obey == null && active.includes(x.id) && people.length) {
        obey = 0;
        for (const p of people) { const o = Number(ask('obedience', p, x.id)); if (Number.isFinite(o) && o >= 0.5) obey++; }
      }
      return { id: x.id, name: x.name ?? w.name ?? titleOf(x.id), benefit: x.benefit ?? x.good ?? w.benefit ?? '', risk: x.risk ?? x.bad ?? w.risk ?? '',
        active: active.includes(x.id), obey, of: people.length, note: x.note ?? '' };
    });
    return { all, active, live, max: Number(raw?.max) || 2 };
  });

  // ---------- the balance of faith against doubt (B, else the people's own average meters) ----------
  S.balance = () => memo('bal', () => {
    const b = ask('balance');
    let faith, doubt, from = 'mind';
    if (b && (Number.isFinite(b.faith) || Number.isFinite(b.doubt))) { faith = Number(b.faith) || 0; doubt = Number(b.doubt) || 0; }
    else {
      const st = U.get('sim', 'stats');
      if (!st || !Number.isFinite(st.faith) || !(st.population > 0)) return null;
      faith = st.faith; doubt = st.skepticism; from = 'stats';
    }
    const sum = faith + doubt;
    const share = sum > 0 ? faith / sum : 0.5;
    return { faith, doubt, share, net: b?.net ?? null, from, causes: arr(b?.causes ?? b?.why), band: b?.band ?? null, label: b?.label ?? null, text: b?.text ?? null };
  });
  // the balance in plain words: the simulation's own band when it has one (its bands carry the real effects)
  const BAND_WHY = {
    doubt: 'Commandments go half heard, the stone is left alone, and quarrels grow faster.',
    doubting: 'Thinkers are busy, but your word carries less weight.',
    even: 'Faith and doubt are about even. Thinkers think, and still listen.',
    believing: 'Fewer questions asked. Thinking slows, and fewer will fight.',
    faith: 'Almost nobody questions. Nobody thinks, and few will fight: they wait for you.',
  };
  S.balanceWords = (share, b) => {
    if (b?.band && b.label) return [b.label, BAND_WHY[b.band] ?? b.text ?? ''];
    if (share == null) return ['No people yet', ''];
    const d = share - 0.5;
    if (Math.abs(d) < 0.06) return ['In balance', 'Faith and doubt are about even. Thinkers think, and still listen.'];
    if (d >= 0.25) return ['Faith rules', 'Almost nobody questions. Nobody thinks, and few will fight: they wait for you.'];
    if (d >= 0.12) return ['Leaning to faith', 'Fewer questions asked. Thinking slows, and some wait on you.'];
    if (d > 0) return ['A little more faith', 'Close to the aim, a touch on the side of belief.'];
    if (d <= -0.25) return ['Doubt rules', 'Commandments go unheard and the stone is left alone.'];
    if (d <= -0.12) return ['Leaning to doubt', 'Thinkers are busy, but your word carries less weight.'];
    return ['A little more doubt', 'Close to the aim, a touch on the side of questions.'];
  };

  // ---------- Earth and discoveries (B) ----------
  const normDisc = (d) => (d ? { id: d.id ?? d.name, name: d.name ?? titleOf(d.id), year: Number.isFinite(d.year) ? d.year : null, earthYear: Number.isFinite(d.earthYear) ? d.earthYear : Number.isFinite(d.earth) ? d.earth : null,
    person: d.person ?? d.by ?? null, x: d.x ?? d.person?.x, z: d.z ?? d.person?.z, effects: d.effects ?? {}, text: d.text ?? d.what ?? '' } : null);
  S.discoveries = () => memo('disc', () => {
    const raw = ask('discoveries');
    let made = [], next = [];
    if (Array.isArray(raw)) {
      for (const d of raw.map(normDisc).filter(Boolean)) (d.year != null || raw.find((x) => (x.id ?? x.name) === d.id)?.made ? made : next).push(d);
    } else if (raw && typeof raw === 'object') {
      made = arr(raw.made ?? raw.done).map(normDisc).filter(Boolean);
      next = arr(raw.next ?? raw.upcoming ?? raw.left).map(normDisc).filter(Boolean);
    }
    return { made, next, live: raw != null };
  });
  S.earth = () => memo('earth', () => {
    const e = ask('earth');
    if (!e || !Number.isFinite(e.ahead)) return null;
    const D = S.discoveries();
    return { year: e.year ?? null, ahead: Math.round(e.ahead), last: e.last ?? D.made[D.made.length - 1] ?? null, next: e.next ?? D.next[0] ?? null };
  });
  S.effectWords = (fx = {}) => {
    const out = [];
    // the keys say what kind of gain it is; B's values are the stat it moves ('store', 'yield'), not words
    const w = { food: 'more food', health: 'better health', building: 'quicker work', weapons: 'better weapons', comfort: 'more cheer', thinking: 'quicker thinking' };
    for (const [k, v] of Object.entries(fx ?? {})) if (v) out.push(w[k] ?? (typeof v === 'string' && v.includes(' ') ? v : titleOf(k).toLowerCase()));
    return out;
  };

  // ---------- hardships (A) and fights (C) ----------
  S.hardships = () => memo('hard', () => arr(ask('hardships')).filter((x) => x && Number.isFinite(x.x)).map((x) => ({ ...x, people: arr(x.people) })));
  S.fights = () => memo('fights', () => arr(ask('fights')).filter((x) => x && Number.isFinite(x.x)).map((f) => {
    const side = (c) => (c && typeof c === 'object' ? normClan(c) ?? null : S.clanById(c));
    const a = side(f.a), b = side(f.b);
    return { ...f, A: a, B: b };
  }));

  // ---------- the ready thoughts (B) ----------
  S.thoughts = () => memo('thoughts', () => arr(ask('readyThoughts') ?? ask('thoughts')).map((t) => (typeof t === 'string' ? { id: t, text: t } : t)).filter((t) => t?.id && t.text).map((t) => ({ id: t.id, text: t.text, group: t.group ?? t.kind ?? 'Ready thoughts', hint: t.hint ?? t.effect ?? '' })));

  // ---------- a person's health, from whatever A tells ----------
  S.health = (p) => {
    if (!p || p.dead) return { sick: false, wounded: false };
    const tr = p.ext?.traits ?? {};
    let sick = !!(tr.sick || p.ext?.hardship?.sick || p.sick);
    const wounded = !!(tr.wounded || p.ext?.hardship?.wounded || p.wounded || p.ext?.fights?.wounded);
    if (!sick) for (const h of S.hardships()) if (h.kind === 'sickness' && h.people.includes(p)) { sick = true; break; }
    return { sick, wounded };
  };
  S.hasPower = (id) => powers().has(id);
  S.living = living;
  S.title = titleOf;
  return S;
}
