// C. Clans (stage 2): clans with colours, marks and names, villages, and the
// grudges between them. Fights are sim/fights.js, the powers sim/clans-powers.js.
// Owned by agent C (files sim/clans*.js, sim/fights*.js, god/powers-clans.js).
// The seam and every shared name: docs/STAGE2-CONTRACTS.md.
//
// A clan: every family that walks in founds one, named after it ("the Reed
// clan"), with a colour from a colour-blind safe set and a mark. A household
// made when two people pair up belongs to the clan whose name it takes; the
// other partner marries in, which binds the two clans (allied) and, after
// generations of it, merges the smaller into the larger. Children belong to
// their household's clan.
// A village: homes within VILLAGE_LINK of each other (two households or more),
// named, kept by who lives in it as it grows, splits or joins.
// A grudge: how much one group (a clan or a village) resents another, 0..100,
// one way, remembered across years and fading slowly. Built by scarce land and
// water (made worse by hunger), by wrongs (fights.js), by faith, and by being
// strangers (strongest in the first generations). Cooled by marriage, shared
// hardship, food given in a lean year, time, and the god's Calm.
import { PALETTE, MARKS, villageName, grudgeWord, CAUSE, cap1 } from './clans-words.js';
import { makeLook } from './clans-look.js';

export const TUNE_CLANS = {
  // ---- villages ----
  VILLAGE_LINK: 28,      // homes this close (hut to hut, blocks) are one village; two households make a village
  VILLAGE_EVERY: 2,      // calendar years between recounting villages (and on every settling)
  // ---- grudges, 0..100 one way, per calendar year unless said ----
  WARY_START: 16,        // a clan that settles and every clan already here start this wary of each other
  WARY_VILLAGE: 8,       // a new village and every other village
  STRANGER_YEARS: 100,   // every grudge builds faster between groups new to each other:
  STRANGER_MIN: 0.4,     //   x (MIN + EXTRA / (1 + years together / STRANGER_YEARS)): 1.6 at first, 1 after 100 years
  STRANGER_EXTRA: 1.2,
  COOL_RATE: 0.016,      // a grudge loses this share a year (half in about 43 years) ...
  BOND_COOL: 0.6,        // ... times (1 + this per marriage binding the two clans)
  CROWD_R: 24,           // two homes this close may contend for land and water
  SHARE_WATER_R: 9,      // they share a drinking place when their nearest shores are this close
  FIELD_NEAR: 11,        // and contend for land when fields are this close (centre to centre)
  LAND_RATE: 0.8,        // grudge a year for crowded fields (each pair of homes)
  WATER_RATE: 0.6,       // and for a crowded shore (times the extra households drinking there)
  HUNGER_BASE: 0.5,      // land and water build x (BASE + MUL x the hungrier side's food pressure)
  HUNGER_MUL: 1.6,
  SLOW_CAP: 72,          // land, water and faith alone build ever slower toward this (x (1 - grudge / SLOW_CAP)): wrongs take it higher
  FAITH_GAP: 18,         // average faith further apart than this ...
  FAITH_RATE: 0.7,       // ... builds this a year per 30 points beyond it
  SEEN_SPLIT: 0.45,      // one group's share of people who have seen the sky act exceeds the other's by this
  SEEN_RATE: 0.9,        // ... builds this a year
  ALLY_MUL: 0.35,        // clans bound by marriage build grudges this much as fast
  MARRY_KEEP: 0.45,      // a marriage between two clans leaves this share of their grudges
  MARRY_END_FEUD: 40,    // a marriage across a grudge this bitter is told as the end of a feud
  HARDSHIP_COOL: 12,     // groups that came through the same hardship lose this much grudge
  GIFT_NEED: 0.6,        // a household this short of food (food pressure) ...
  GIFT_HAVE: 4,          // ... may be given food by a household of another clan with this many years in store
  GIFT_SHARE: 0.22, GIFT_COOL: 8, GIFT_CHANCE: 0.2, GIFT_R: 45, GIFT_EVERY: 12,
  OWED_YEARS: 40,        // a raid unanswered this long keeps the raided side's grudge from fading ...
  OWED_RATE: 0.5,        // ... and adds this a year
  RAIDER_MUL: 2,         // a clan with a raider (A's trouble) builds grudges this much as fast
  TYRANT_RATE: 2.5,      // others resent a clan with a tyrant by this a year
  MERGE_BONDS: 2,        // two clans with this many living marriages between them ...
  MERGE_YEARS: 60,       // ... bound this long ...
  MERGE_RATIO: 0.75,     // ... merge when the smaller has at most this share of the larger's people
  WOUND_LIFE: 6,         // a wound heals in this many life years: work x WOUND_WORK, fighting x WOUND_FIGHT meanwhile
  WOUND_WORK: 0.6, WOUND_FIGHT: 0.55,
  MAX: 100,
};

export default {
  id: 'clans',
  tune: TUNE_CLANS,
  init(R) {
    const { S } = R, T = TUNE_CLANS;
    const look = makeLook(R);
    const clans = new Map();     // id -> clan record
    const villages = new Map();  // id -> village record
    const ledger = new Map();    // 'a>b' -> grudge entry
    const allySince = new Map(); // 'a|b' (sorted) -> year the clans were first bound by marriage
    const counters = { merged: 0, absorbed: 0, fled: 0, gifts: 0, marriages: 0, feudsEnded: 0, fightDeaths: 0, wounds: 0 };
    let cseq = 0, vseq = 0;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

    // ---------- records ----------
    const fdata = (f) => f?.ext?.clans ?? null;
    const pdata = (p) => p?.ext?.clans ?? null;
    const resolve = (id) => { let c = typeof id === 'string' ? clans.get(id) : id; let n = 0; while (c?.mergedInto && n++ < 20) c = clans.get(c.mergedInto); return c ?? null; };
    const clanOfFamily = (f) => resolve(fdata(f)?.clan);
    const clanOf = (p) => (p && !p.dead ? clanOfFamily(p.family) : p ? resolve(pdata(p)?.clan) : null);
    const settledHere = (f) => f.state === 'settled';
    const householdsOf = (c) => S.families.filter((f) => clanOfFamily(f) === c);
    const membersOf = (c) => S.people.filter((p) => !p.dead && clanOfFamily(p.family) === c);
    const villageOfFamily = (f) => { const v = villages.get(fdata(f)?.village); return v?.alive ? v : null; };
    const villageOf = (p) => (p?.family ? villageOfFamily(p.family) : null);
    const vHouseholds = (v) => S.families.filter((f) => f.state === 'settled' && villageOfFamily(f) === v);
    const groupHouseholds = (g) => (g?.type === 'village' ? vHouseholds(g) : g ? householdsOf(g).filter(settledHere) : []);
    const groupMembers = (g) => { const hs = new Set(groupHouseholds(g)); return S.people.filter((p) => !p.dead && hs.has(p.family)); };
    const groupName = (g) => (!g ? 'nobody' : g.type === 'village' ? g.name : `the ${g.name} clan`);
    const groupOfId = (id) => (id?.startsWith('v') ? villages.get(id) : resolve(id));
    const alive = (g) => !!g && g.alive && groupHouseholds(g).length > 0;

    function usedCounts(list, key) {
      const n = new Map();
      for (const c of clans.values()) if (c.alive && !c.mergedInto) n.set(c[key], (n.get(c[key]) ?? 0) + 1);
      return list.map((x, i) => [i, n.get(key === 'dye' ? x.dye : x.id) ?? 0]);
    }
    const leastUsed = (counts, offset) => counts.sort((a, b) => a[1] - b[1] || ((a[0] - offset + 99) % counts.length) - ((b[0] - offset + 99) % counts.length))[0][0];
    function newClan(f) {
      const n = ++cseq;
      const col = PALETTE[leastUsed(usedCounts(PALETTE, 'dye'), n)];
      const mk = MARKS[leastUsed(usedCounts(MARKS, 'mark'), n * 5)];
      const c = { type: 'clan', id: `c${n}`, name: f.name, dye: col.dye, dyeName: col.name, mark: mk.id, markName: mk.name,
        founded: Math.floor(S.year), settled: null, favoured: false, alive: true, mergedInto: null, founder: f.id };
      Object.defineProperties(c, {
        members: { get: () => membersOf(c), enumerable: false },
        households: { get: () => householdsOf(c).filter(settledHere), enumerable: false },
        family: { get: () => householdsOf(c)[0] ?? null, enumerable: false },
        villages: { get: () => [...new Set(householdsOf(c).map(villageOfFamily).filter(Boolean))], enumerable: false },
        allies: { get: () => alliesOf(c), enumerable: false },
        faith: { get: () => avgFaith(groupMembers(c)), enumerable: false },
        // the screen's names (agent D): colour, the main village, grudges with levels 0..1
        color: { get: () => c.dye, enumerable: false }, colour: { get: () => c.dye, enumerable: false },
        village: { get: () => mainVillage(c), enumerable: false },
        grudges: { get: () => grudgesOf(c), enumerable: false },
      });
      clans.set(c.id, c);
      R.signal('clan:new', { clan: c });
      return c;
    }
    function setHouseholdClan(f, c) {
      const fd = R.data(f, 'clans', () => ({ clan: c.id, village: null, water: null, gift: -1e9 }));
      fd.clan = c.id;
      for (const m of f.members) { const pd = pdata(m); if (pd) pd.clan = c.id; }
      look.dyeHousehold(f, c.dye);
    }

    // a person appears (arrival, birth, the console's crowd): the household's clan, or a new one for a new family
    R.on('person:new', (p) => {
      const f = p.family;
      let c = clanOfFamily(f);
      if (!c) { c = newClan(f); setHouseholdClan(f, c); }
      R.data(p, 'clans', () => ({ born: c.id, clan: c.id, from: null, houseName: f.name, wound: null }));
      if (f.dye !== c.dye) look.dyeHousehold(f, c.dye);
    });
    // a household nobody has seen yet with people already in clans: two people paired up (people.js pairUp)
    function newHouseholds() {
      for (const f of S.families) {
        if (fdata(f) || !f.members.length) continue;
        const ms = f.members.filter((m) => pdata(m));
        if (!ms.length) { const c = newClan(f); setHouseholdClan(f, c); continue; }
        const host = ms.find((m) => pdata(m).houseName === f.name) ?? ms[0];
        const c = resolve(pdata(host).clan);
        if (!c) { const n = newClan(f); setHouseholdClan(f, n); continue; }
        R.data(f, 'clans', () => ({ clan: c.id, village: null, water: null, gift: -1e9 }));
        for (const m of ms) {
          const pd = pdata(m), was = resolve(pd.clan);
          if (was && was !== c) { pd.from = was.id; marriedAcross(m, was, c, ms.find((o) => o !== m)); }
          pd.clan = c.id; pd.houseName = f.name;
        }
        look.dyeHousehold(f, c.dye);
      }
    }
    const pairKey = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
    function marriedAcross(m, from, into, partner) {
      counters.marriages++; bondYear = null;
      if (!allySince.has(pairKey(from, into))) allySince.set(pairKey(from, into), Math.floor(S.year));
      const before = Math.max(entry(from, into, false)?.g ?? 0, entry(into, from, false)?.g ?? 0);
      for (const [a, b] of [[from, into], [into, from]]) { const e = entry(a, b, false); if (e) scale(e, T.MARRY_KEEP); }
      R.story(m, `Married into the ${into.name} clan from the ${from.name} clan${partner ? `, with ${partner.name}` : ''}.`);
      if (partner) R.story(partner, `Married ${m.name} of the ${from.name} clan. The two clans are bound now.`);
      const after = Math.max(entry(from, into, false)?.g ?? 0, entry(into, from, false)?.g ?? 0);
      R.signal('clan:marriage', { a: from, b: into, person: m, partner: partner ?? null, before, after, feudEnded: before >= T.MARRY_END_FEUD });
      if (before >= T.MARRY_END_FEUD) {
        counters.feudsEnded++;
        R.alert('good', `${m.name} of the ${from.name} clan married into the ${into.name} clan. The feud between them has cooled.`, { x: m.x, z: m.z, subject: m,
          aside: R.aside('clans:feud-wed', ['Nothing ends a feud like a wedding. Except, sometimes, the wedding.', 'Love, or a very long peace treaty with dancing.'], 80) });
      }
    }

    // ---------- the grudge ledger ----------
    const key = (a, b) => `${a.id}>${b.id}`;
    function entry(a, b, make = true) {
      if (!a || !b || a === b) return null;
      let e = ledger.get(key(a, b));
      if (!e && make) { e = { a: a.id, b: b.id, g: 0, c: {}, last: null, incident: -1e9, owed: null }; ledger.set(key(a, b), e); }
      return e ?? null;
    }
    function scale(e, k) { e.g *= k; for (const c in e.c) e.c[c] *= k; }
    // how fast this group's grudges build: the 'grudge' stat (B's Keep the peace, this subsystem's Calm and
    // Provoke), over the group and its grown people; a raider in a clan doubles it
    function mulOf(g) {
      let m = g.type === 'clan' ? R.value('grudge', g, 1) : 1;
      const ad = groupMembers(g).filter((p) => p.stage !== 'child');
      if (ad.length) m *= ad.reduce((s, p) => s + R.value('grudge', p, 1), 0) / ad.length;
      if (ad.some((p) => R.trait(p, 'raider') || R.trait(p, 'firebrand'))) m *= T.RAIDER_MUL;
      return m;
    }
    function strange(a, b) {
      const sa = a.settled ?? a.founded ?? S.year, sb = b.settled ?? b.founded ?? S.year;
      const together = Math.max(0, S.year - Math.max(sa, sb));
      return T.STRANGER_MIN + T.STRANGER_EXTRA / (1 + together / T.STRANGER_YEARS);
    }
    const allied = (a, b) => a?.type === 'clan' && b?.type === 'clan' && bonds(a, b) > 0;
    // build a grudge: scaled by the group's 'grudge' stat, by how strange they are to each other, by marriage ties
    function add(a, b, amt, cause, text, o = {}) {
      if (!a || !b || a === b || !(amt > 0)) return 0;
      const e = entry(a, b);
      let k = amt * (o.raw ? 1 : (o.mul ?? mulOf(a)) * strange(a, b) * (allied(a, b) ? T.ALLY_MUL : 1));
      if (o.cap) k *= Math.max(0, 1 - e.g / o.cap);
      k = Math.min(k, T.MAX - e.g);
      e.g += k; e.c[cause] = (e.c[cause] ?? 0) + k;
      if (text) e.last = { text, year: Math.floor(S.year), cause };
      return k;
    }
    // cool (amount, or a share with o.share)
    function cool(a, b, amt, share) {
      const e = entry(a, b, false);
      if (!e || e.g <= 0) return 0;
      const before = e.g;
      const to = share != null ? e.g * (1 - share) : Math.max(0, e.g - amt);
      scale(e, before > 0 ? to / before : 0);
      return before - e.g;
    }
    const gOf = (a, b) => entry(a, b, false)?.g ?? 0;
    function topCause(e) {
      let best = null, bv = 0;
      for (const c in e.c) if (e.c[c] > bv) { bv = e.c[c]; best = c; }
      return best;
    }
    function why(a, b) {
      const e = entry(a, b, false);
      if (!e) return '';
      const c = topCause(e) ?? 'wary';
      const lastWrong = e.last && (c === 'wrong' || c === 'kill') ? e.last.text : null;
      let t = (CAUSE[c] ?? CAUSE.wary)(groupName(a), groupName(b), lastWrong);
      if (e.last && (e.last.cause === 'wrong' || e.last.cause === 'kill') && c !== 'wrong' && c !== 'kill' && S.year - e.last.year < 60) t += `; and ${e.last.text}`;
      const hs = groupHouseholds(a);
      const fp = hs.length ? hs.reduce((s, f) => s + (R.ask('foodPressure', f) ?? 0), 0) / hs.length : 0;
      if (fp > 0.5 && (c === 'land' || c === 'water')) t += ', and hunger makes it worse';
      return t;
    }
    // bonds: living people who married from one of the clans into the other
    let bondCache = new Map(), bondYear = null;
    function bondsAll() {
      if (bondYear === S.year) return bondCache;
      bondYear = S.year; bondCache = new Map();
      for (const p of S.people) {
        const pd = pdata(p);
        if (p.dead || !pd?.from) continue;
        const a = resolve(pd.from), b = clanOf(p);
        if (!a || !b || a === b) continue;
        const k = pairKey(a, b);
        bondCache.set(k, (bondCache.get(k) ?? 0) + 1);
      }
      return bondCache;
    }
    const bonds = (a, b) => (a && b && a !== b && a.type === 'clan' && b.type === 'clan' ? bondsAll().get(pairKey(a, b)) ?? 0 : 0);
    const alliesOf = (c) => [...clans.values()].filter((o) => o !== c && o.alive && !o.mergedInto && bonds(c, o) > 0);

    // ---------- villages ----------
    function countVillages() {
      const hs = S.families.filter((f) => f.state === 'settled' && f.home);
      const n = hs.length, parent = hs.map((_, i) => i);
      const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      const pos = hs.map((f) => ({ x: f.home.cx ?? f.home.x, z: f.home.cz ?? f.home.z }));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (dist(pos[i], pos[j]) <= T.VILLAGE_LINK) parent[find(i)] = find(j);
      const groups = new Map();
      for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
      // the biggest clusters claim their old names first
      const list = [...groups.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);
      const claimed = new Set(), keep = new Set();
      for (const g of list) {
        const votes = new Map();
        for (const i of g) { const v = fdata(hs[i])?.village; if (v && villages.get(v)?.alive && !claimed.has(v)) votes.set(v, (votes.get(v) ?? 0) + 1); }
        let id = null, best = 0;
        for (const [v, k] of votes) if (k > best) { best = k; id = v; }
        let v = id ? villages.get(id) : null;
        let x = 0, z = 0;
        for (const i of g) { x += pos[i].x; z += pos[i].z; }
        x /= g.length; z /= g.length;
        if (!v) {
          const taken = new Set([...villages.values()].map((o) => o.name));
          v = { type: 'village', id: `v${++vseq}`, name: villageName(taken), founded: Math.floor(S.year), settled: Math.floor(S.year), alive: true, x, z };
          Object.defineProperties(v, {
            households: { get: () => vHouseholds(v), enumerable: false },
            members: { get: () => groupMembers(v), enumerable: false },
            clans: { get: () => [...new Set(vHouseholds(v).map(clanOfFamily).filter(Boolean))], enumerable: false },
            faith: { get: () => avgFaith(groupMembers(v)), enumerable: false },
            // drawn as a side of a fight: the colour and mark of the clan with most people there
            dye: { get: () => topClan(v)?.dye ?? 0x8c5a3c, enumerable: false }, color: { get: () => topClan(v)?.dye ?? 0x8c5a3c, enumerable: false },
            mark: { get: () => topClan(v)?.mark ?? 'ring', enumerable: false },
            village: { get: () => ({ id: v.id, name: v.name, x: v.x, z: v.z }), enumerable: false },
            grudges: { get: () => grudgesOf(v), enumerable: false },
          });
          villages.set(v.id, v);
          founded(v, g.map((i) => hs[i]));
        }
        v.x = x; v.z = z; v.size = g.length;
        claimed.add(v.id); keep.add(v.id);
        for (const i of g) R.data(hs[i], 'clans', () => ({ clan: clanOfFamily(hs[i])?.id, village: null, water: null, gift: -1e9 })).village = v.id;
      }
      for (const f of hs) { const fd = fdata(f); if (fd && fd.village && !keep.has(fd.village)) fd.village = null; }
      for (const v of villages.values()) if (v.alive && !keep.has(v.id)) v.alive = false;
    }
    function founded(v, hs) {
      const tally = new Map();
      for (const f of hs) { const c = clanOfFamily(f); if (c) tally.set(c, (tally.get(c) ?? 0) + f.members.length); }
      let clan = null, best = 0;
      for (const [c, k] of tally) if (k > best) { best = k; clan = c; }
      for (const o of villages.values()) if (o !== v && o.alive) { add(v, o, T.WARY_VILLAGE, 'wary', null, { raw: true }); add(o, v, T.WARY_VILLAGE, 'wary', null, { raw: true }); }
      R.signal('clan:village', { clan, x: v.x, z: v.z, village: v });
      R.alert('info', `The homes ${clan ? `of the ${clan.name} clan ` : ''}around ${Math.round(v.x)}, ${Math.round(v.z)} are a village now. They call it ${v.name}.`, { x: v.x, z: v.z });
    }

    function topClan(v) { const t = new Map(); for (const f of vHouseholds(v)) { const c = clanOfFamily(f); if (c) t.set(c, (t.get(c) ?? 0) + f.members.length); } let b = null, n = 0; for (const [c, k] of t) if (k > n) { n = k; b = c; } return b; }
    function mainVillage(c) { const t = new Map(); for (const f of householdsOf(c)) { const v = villageOfFamily(f); if (v) t.set(v, (t.get(v) ?? 0) + 1); } let b = null, n = 0; for (const [v, k] of t) if (k > n) { n = k; b = v; } return b ? { id: b.id, name: b.name, x: b.x, z: b.z } : null; }
    const grudgesOf = (g) => [...ledger.values()].filter((e) => e.a === g.id && e.g >= 2).map((e) => { const o = groupOfId(e.b); return o ? { clan: o, id: o.id, name: o.name, level: Math.min(1, e.g / 100), word: grudgeWord(e.g), cause: topCause(e) } : null; }).filter(Boolean).sort((x, y) => y.level - x.level);

    // ---------- the year: villages, bonds, grudges built and cooled, gifts, merges ----------
    const avgFaith = (list) => { const a = list.filter((p) => p.age >= 6); return a.length ? a.reduce((s, p) => s + p.faith, 0) / a.length : 0; };
    const seenShare = (list) => { const a = list.filter((p) => p.age >= 6); return a.length ? a.filter((p) => (p.sawCount ?? 0) > 0).length / a.length : 0; };
    function waterSpot(f) {
      const fd = fdata(f);
      if (!fd || !f.home) return null;
      if (fd.water && fd.water.hut === f.home.id) return fd.water;
      const w = S.land.nearestWater(f.home.cx, f.home.cz, 40);
      fd.water = { hut: f.home.id, x: w ? w.x : null, z: w ? w.z : null };
      return fd.water;
    }
    function year() {
      const y = Math.floor(S.year);
      newHouseholds();
      if (y % T.VILLAGE_EVERY === 0) countVillages();
      bondYear = null;
      // clans that have no one left
      for (const c of clans.values()) if (c.alive && !c.mergedInto && !householdsOf(c).length) { c.alive = false; c.ended = y; }
      const hs = S.families.filter((f) => f.state === 'settled' && f.home && fdata(f));
      const info = hs.map((f) => ({ f, c: clanOfFamily(f), v: villageOfFamily(f), fp: R.ask('foodPressure', f) ?? 0, w: waterSpot(f), at: { x: f.home.cx, z: f.home.cz }, fields: f.fields.filter((b) => b.done).map((b) => ({ x: b.mx, z: b.mz })) }));
      const mul = new Map();
      const mulFor = (g) => { if (!mul.has(g)) mul.set(g, mulOf(g)); return mul.get(g); };
      // scarce land and water: two homes of different groups at the same crowded place
      for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) {
        const A = info[i], B = info[j];
        if (dist(A.at, B.at) > T.CROWD_R) continue;
        const [ga, gb] = A.v && B.v && A.v !== B.v ? [A.v, B.v] : A.c !== B.c ? [A.c, B.c] : [null, null];
        if (!ga || !gb) continue;
        const hunger = T.HUNGER_BASE + T.HUNGER_MUL * Math.max(A.fp, B.fp);
        let land = 0, water = 0;
        if (A.fields.some((a) => B.fields.some((b) => dist(a, b) <= T.FIELD_NEAR))) land = T.LAND_RATE;
        if (A.w?.x != null && B.w?.x != null && Math.hypot(A.w.x - B.w.x, A.w.z - B.w.z) <= T.SHARE_WATER_R) {
          const crowd = info.filter((o) => o.w?.x != null && Math.hypot(o.w.x - A.w.x, o.w.z - A.w.z) <= T.SHARE_WATER_R).length;
          water = T.WATER_RATE * Math.min(2, (crowd - 1) / 2);
        }
        for (const [a, b] of [[ga, gb], [gb, ga]]) {
          if (land) add(a, b, land * hunger, 'land', null, { mul: mulFor(a), cap: T.SLOW_CAP });
          if (water) add(a, b, water * hunger, 'water', null, { mul: mulFor(a), cap: T.SLOW_CAP });
        }
      }
      // faith: a wide gap in average faith, or one group has seen the sky act and the other has not
      const groups = [...clans.values(), ...villages.values()].filter((g) => g.alive && !g.mergedInto && groupHouseholds(g).length);
      const gi = new Map(groups.map((g) => { const ms = groupMembers(g); return [g, { faith: avgFaith(ms), seen: seenShare(ms), tyrant: ms.some((p) => R.trait(p, 'tyrant')) }]; }));
      for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i], b = groups[j];
        if (a.type !== b.type) continue;
        const A = gi.get(a), B = gi.get(b);
        const gap = Math.abs(A.faith - B.faith);
        const seen = Math.abs(A.seen - B.seen) >= T.SEEN_SPLIT;
        for (const [x, z] of [[a, b], [b, a]]) {
          if (gap > T.FAITH_GAP) add(x, z, T.FAITH_RATE * (gap - T.FAITH_GAP) / 30, 'faith', null, { mul: mulFor(x), cap: T.SLOW_CAP });
          if (seen) add(x, z, T.SEEN_RATE, 'seen', null, { mul: mulFor(x), cap: T.SLOW_CAP });
          if (gi.get(z).tyrant) add(x, z, T.TYRANT_RATE, 'tyrant', null, { mul: mulFor(x) });
        }
      }
      // time cools; a raid not answered keeps its grudge
      for (const [k, e] of ledger) {
        const a = groupOfId(e.a), b = groupOfId(e.b);
        if (!alive(a) || !alive(b)) { ledger.delete(k); continue; }
        const owed = e.owed != null && y - e.owed < T.OWED_YEARS;
        if (owed) add(a, b, T.OWED_RATE, 'wrong', null, { mul: mulFor(a) });
        else if (e.owed != null) e.owed = null;
        const rate = T.COOL_RATE * (1 + T.BOND_COOL * bonds(a, b)) * (owed ? 0.2 : 1);
        scale(e, 1 - Math.min(0.5, rate));
        if (e.g < 0.3) ledger.delete(k);
      }
      gifts(info);
      merges();
      for (const k of [...allySince.keys()]) { const [a, b] = k.split('|').map(resolve); if (!a || !b || a === b || !bonds(a, b)) allySince.delete(k); }
    }
    // a lean year: a household of another clan with plenty may give food (real food), and the grudge cools
    function gifts(info) {
      for (const N of info) {
        if (N.fp < T.GIFT_NEED) continue;
        const nd = fdata(N.f);
        if (S.year - nd.gift < T.GIFT_EVERY) continue;
        const D = info.filter((o) => o.c !== N.c && dist(o.at, N.at) <= T.GIFT_R && o.f.food >= T.GIFT_HAVE * Math.max(1, S.peopleApi.needOf(o.f)) && gOf(o.c, N.c) < 60)
          .sort((a, b) => dist(a.at, N.at) - dist(b.at, N.at))[0];
        if (!D || Math.random() > T.GIFT_CHANCE * (1 - gOf(D.c, N.c) / 100)) continue;
        const amt = D.f.food * T.GIFT_SHARE;
        D.f.food -= amt; N.f.food += amt; nd.gift = S.year;
        counters.gifts++;
        cool(N.c, D.c, T.GIFT_COOL); cool(D.c, N.c, T.GIFT_COOL * 0.6);
        if (N.v && D.v && N.v !== D.v) { cool(N.v, D.v, T.GIFT_COOL); cool(D.v, N.v, T.GIFT_COOL * 0.6); }
        const giver = D.f.leader(), taker = N.f.leader();
        if (giver) R.story(giver, `Gave grain to the ${N.f.name} family of the ${N.c.name} clan in a lean year.`);
        if (taker) R.story(taker, `The ${D.f.name} family of the ${D.c.name} clan gave us grain when we were going hungry. We will not forget it.`);
        R.alert('good', `In a lean year the ${D.f.name} family (${D.c.name} clan) gave ${Math.round(amt * 10) / 10} years of grain to the hungry ${N.f.name} family (${N.c.name} clan).`, { x: N.at.x, z: N.at.z, subject: taker });
      }
    }
    // generations of marriage: the smaller clan becomes part of the larger
    function merges() {
      for (const [k, since] of allySince) {
        if (S.year - since < T.MERGE_YEARS) continue;
        const [a, b] = k.split('|').map(resolve);
        if (!a?.alive || !b?.alive || a === b || bonds(a, b) < T.MERGE_BONDS) continue;
        const na = membersOf(a).length, nb = membersOf(b).length;
        const [small, big] = na <= nb ? [a, b] : [b, a];
        if (Math.min(na, nb) > T.MERGE_RATIO * Math.max(na, nb)) continue;
        mergeClan(small, big, 'marriage');
        return;
      }
    }
    function mergeClan(from, into, how = 'marriage') {
      if (!from || !into || from === into || !from.alive) return false;
      const hs = householdsOf(from);
      for (const f of hs) setHouseholdClan(f, into);
      from.alive = false; from.mergedInto = into.id; from.ended = Math.floor(S.year);
      if (from.favoured) into.favoured = true;
      // what others felt about the smaller clan they now feel about the larger (the stronger feeling stays)
      for (const [k, e] of [...ledger]) {
        if (e.a !== from.id && e.b !== from.id) continue;
        ledger.delete(k);
        const a = e.a === from.id ? into : groupOfId(e.a), b = e.b === from.id ? into : groupOfId(e.b);
        if (!a || !b || a === b) continue;
        const t = entry(a, b);
        if (e.g > t.g) { t.g = e.g; t.c = { ...e.c }; t.last = e.last ?? t.last; t.owed = e.owed ?? t.owed; }
      }
      counters[how === 'absorbed' ? 'absorbed' : 'merged']++;
      R.signal('clan:merge', { from, into, how });
      const L = hs[0]?.leader?.();
      if (how === 'absorbed') R.alert('warn', `The ${from.name} clan is no more: what was left of it was taken in by the ${into.name} clan.`, { x: L?.x, z: L?.z, subject: L });
      else R.alert('good', `The ${from.name} and ${into.name} clans have married into each other for so long that they are one people now: the ${into.name} clan.`, { x: L?.x, z: L?.z, subject: L,
        aside: R.aside('clans:merge', ['Two clans, one clan, and a great many in-laws.', 'Nobody can remember which grandmother was which. Good.'], 100) });
      return true;
    }

    // ---------- wounds (a fight's; real effects through the shared stats) ----------
    function wound(p, how) {
      const pd = pdata(p);
      if (!pd || p.dead) return;
      const until = S.life + T.WOUND_LIFE;
      pd.wound = { until, how };
      R.trait(p, 'wounded', true); // the screen draws a wounded sign from this trait
      counters.wounds++;
      R.mod('work', `clans:wound:${p.id}`, { who: p, mul: T.WOUND_WORK, until, note: 'wounded in a fight' });
      R.mod('strength', `clans:wound:${p.id}`, { who: p, mul: T.WOUND_FIGHT, until, note: 'wounded in a fight' });
    }
    const isWounded = (p) => { const w = pdata(p)?.wound; return !!w && S.life < w.until; };
    function heal(p) {
      const pd = pdata(p);
      if (!pd?.wound) return false;
      pd.wound = null; R.trait(p, 'wounded', p.ext?.hardship?.wound ? true : null); // A's burn or bite keeps the sign
      R.unmod('work', `clans:wound:${p.id}`); R.unmod('strength', `clans:wound:${p.id}`);
      return true;
    }

    // ---------- hooks ----------
    R.on('family:new', () => newHouseholds()); // a household formed (people.js pairUp); the year scan stays as a backstop
    // wounds heal on the life clock: the trait goes when the wound does
    R.on('year', () => { for (const p of S.people) { const w = pdata(p)?.wound; if (w && S.life >= w.until) { pdata(p).wound = null; R.trait(p, 'wounded', p.ext?.hardship?.wound ? true : null); } } });
    R.on('year', year);
    R.on('family:settle', (f) => {
      const c = clanOfFamily(f);
      if (c && c.settled == null) {
        c.settled = Math.floor(S.year);
        for (const o of clans.values()) if (o !== c && o.alive && !o.mergedInto && o.settled != null && householdsOf(o).some(settledHere)) {
          add(c, o, T.WARY_START, 'wary', null, { raw: true }); add(o, c, T.WARY_START, 'wary', null, { raw: true });
        }
      }
      countVillages();
    });
    R.on('family:leave', (f) => {
      const c = clanOfFamily(f);
      if (c && f.state === 'leaving' && !householdsOf(c).some((h) => h !== f && h.state === 'settled') && c.settled != null) { c.fled = Math.floor(S.year); counters.fled++; }
    });
    R.on('person:death', (p) => { if (pdata(p)?.wound) { R.unmod('work', `clans:wound:${p.id}`); R.unmod('strength', `clans:wound:${p.id}`); } });
    // shared hardship (agent A's signal): the groups that came through it together cool toward each other
    R.on('hardship:end', (h) => {
      if (!h || h.outcome === 'killed' && !(h.survivors > 0)) return;
      const fs = (h.families ?? []).filter(Boolean);
      const cs = [...new Set(fs.map(clanOfFamily).filter(Boolean))];
      for (const a of cs) for (const b of cs) if (a !== b) cool(a, b, T.HARDSHIP_COOL);
      const vs = [...new Set(fs.map(villageOfFamily).filter(Boolean))];
      for (const a of vs) for (const b of vs) if (a !== b) cool(a, b, T.HARDSHIP_COOL);
    });

    // grudge thoughts: what a grown person resents, in their own words
    const THOUGHT = {
      wary: (o) => [`Who are these ${o} people anyway? I do not trust a new face.`, `The ${o} lot keep to themselves. What are they hiding?`],
      land: (o) => [`The ${o} fields creep closer to ours every season.`, `That strip by the water was ours before the ${o} lot came.`],
      water: (o) => [`The ${o} people muddy our water every morning.`, `There is a queue at the shore now. A ${o} queue.`],
      faith: (o) => [`The ${o} people do not pray right. It will bring trouble.`, `The ${o} lot are fools about the stone, one way or the other.`],
      seen: (o) => [`The ${o} people never saw what we saw. They laugh at us.`, `The ${o} lot say the sky does things. Nonsense. Dangerous nonsense.`],
      wrong: (o) => [`The ${o} clan wronged us. I have not forgotten.`, `One day the ${o} people will pay for what they did.`],
      kill: (o) => [`The ${o} people killed one of ours. Blood is owed.`, `I see the ${o} faces and I see who they killed.`],
      tyrant: (o) => [`The ${o} people take and take. Someone should stop them.`],
      god: (o) => [`I woke up furious at the ${o} lot. I do not even know why.`],
    };
    R.on('thoughts', (p) => {
      if (p.asleep || p.stage === 'child' || p.dead) return null;
      const c = clanOf(p);
      if (!c) return null;
      let best = null;
      for (const g of [c, villageOf(p)]) {
        if (!g) continue;
        for (const e of ledger.values()) if (e.a === g.id && e.g >= 30 && (!best || e.g > best.g)) best = e;
      }
      if (!best) return null;
      const o = groupOfId(best.b);
      if (!o) return null;
      const name = o.type === 'village' ? `${o.name}` : o.name;
      const list = (THOUGHT[topCause(best)] ?? THOUGHT.wary)(name);
      const w = best.g >= 62 ? 14 : best.g >= 45 ? 9 : 5;
      return list.map((t) => [w, t]);
    });

    // ---------- inspect and stats ----------
    const markText = (c) => `${c.dyeName}, ${c.markName}`;
    function grudgeLines(g, max = 3) {
      const out = [];
      const list = [...ledger.values()].filter((e) => e.a === g.id && e.g >= 15).sort((x, y) => y.g - x.g).slice(0, max);
      for (const e of list) { const o = groupOfId(e.b); if (o) out.push(`${g.type === 'village' ? g.name : `The ${g.name} clan`} ${e.g >= 45 ? 'resents' : 'is wary of'} ${groupName(o)}: ${grudgeWord(e.g)} (${Math.round(e.g)}), because ${why(g, o)}.`); }
      return out;
    }
    R.on('inspect', (e, out) => {
      if (!e) return;
      if (e.kind === 'person') {
        const c = clanOf(e), v = e.dead ? null : villageOf(e), pd = pdata(e);
        if (!c) return;
        out.clan = { id: c.id, name: c.name, dye: c.dye, dyeName: c.dyeName, mark: c.mark, markName: c.markName, favoured: !!c.favoured };
        out.village = v ? { id: v.id, name: v.name } : null;
        out.wounded = isWounded(e);
        const rows = [['Clan', `the ${c.name} clan (${markText(c)})`], ['Village', v ? v.name : e.family.state === 'settled' ? 'a lone homestead' : 'none: on the move']];
        const from = pd?.from ? resolve(pd.from) : null;
        if (from && from !== c) rows.push(['Married in from', `the ${from.name} clan`]);
        const al = alliesOf(c);
        if (al.length) rows.push(['Bound by marriage to', al.map((o) => `the ${o.name} clan`).join(', ')]);
        if (!e.dead && e.stage !== 'child') {
          const w = R.value('fight', e);
          const FT = api.fightT ?? { JOIN_ATTACK: 0.5, JOIN_DEFEND: 0.35 };
          rows.push(['Will fight', w >= FT.JOIN_ATTACK ? 'yes' : w >= FT.JOIN_DEFEND ? 'only to defend home' : e.expectsHelp ? 'no: expects the stone to fight for them' : 'no']);
        }
        if (isWounded(e)) rows.push(['Wounded', `${pd.wound.how}; heals in ${Math.max(1, Math.ceil(pd.wound.until - S.life))} years`]);
        if (c.favoured) rows.push(['Your favour', 'yes (nobody knows)']);
        R.section(out, { id: 'clan', title: 'Clan', order: 20, rows, lines: [...grudgeLines(c, 2), ...(v ? grudgeLines(v, 1) : [])] });
      } else if (e.cat === 'building' && e.family) {
        const c = clanOfFamily(e.family), v = villageOfFamily(e.family);
        if (!c) return;
        out.clan = { id: c.id, name: c.name, dye: c.dye, dyeName: c.dyeName, mark: c.mark, markName: c.markName, favoured: !!c.favoured };
        out.village = v ? { id: v.id, name: v.name } : null;
        R.section(out, { id: 'clan', title: 'Clan', order: 20, rows: [['Clan', `the ${c.name} clan (${markText(c)})`], ['Village', v ? v.name : 'a lone homestead']] });
      }
    });
    R.on('stats', (st) => {
      let n = 0;
      for (const c of clans.values()) if (c.alive && !c.mergedInto && c.settled != null) n++;
      st.clans = n;
      let v = 0; for (const x of villages.values()) if (x.alive) v++;
      st.villages = v;
      let feuds = 0; for (const e of ledger.values()) if (e.g >= 45) feuds++;
      st.feuds = feuds;
      st.fightDeaths = counters.fightDeaths;
      st.favoured = [...clans.values()].filter((c) => c.favoured && c.alive).map((c) => c.id);
    });

    // ---------- queries (contract names first) ----------
    const liveClans = () => [...clans.values()].filter((c) => c.alive && !c.mergedInto && householdsOf(c).some(settledHere));
    R.answer('clanOf', (p) => (p?.kind === 'person' ? clanOf(p) : p?.cat === 'building' && p.family ? clanOfFamily(p.family) : p?.members ? p : null));
    R.answer('clanMembers', (c) => {
      if (!c) return [];
      if (c.kind === 'person') return membersOf(clanOf(c));
      if (typeof c === 'string') c = groupOfId(c);
      if (c?.type === 'village') return groupMembers(c);
      return c ? membersOf(resolve(c.id ?? c)) : [];
    });
    R.answer('clans', liveClans);
    R.answer('clan', (id) => groupOfId(id?.id ?? id));
    R.answer('villages', () => [...villages.values()].filter((v) => v.alive));
    R.answer('villageOf', (x) => (x?.kind === 'person' ? villageOf(x) : x?.members ? villageOfFamily(x) : null));
    R.answer('grudge', (a, b) => { a = groupOfId(a?.id ?? a); b = groupOfId(b?.id ?? b); const e = entry(a, b, false); return e ? { g: e.g, word: grudgeWord(e.g), why: why(a, b), cause: topCause(e), last: e.last } : { g: 0, word: grudgeWord(0), why: '', cause: null, last: null }; });
    R.answer('grudges', (g) => [...ledger.values()].filter((e) => !g || e.a === (g.id ?? g)).map((e) => ({ a: groupOfId(e.a), b: groupOfId(e.b), g: e.g, word: grudgeWord(e.g), cause: topCause(e) })).sort((x, y) => y.g - x.g));
    R.answer('favoured', () => [...clans.values()].filter((c) => c.favoured && c.alive));
    R.answer('wounded', (p) => isWounded(p));
    R.answer('heal-wound', (p) => heal(p));

    // the API the other C files use (fights.js, clans-powers.js)
    const api = {
      T, clans, villages, ledger, counters, resolve, clanOf, clanOfFamily, villageOf, villageOfFamily, groupHouseholds, groupMembers, groupName, groupOfId,
      alive, entry, add, cool, scale, gOf, why, topCause, bonds, allied, mulOf, strange, mergeClan, wound, isWounded, heal, liveClans, look, countVillages, pdata, fdata,
      allGroups: () => [...clans.values(), ...villages.values()].filter((g) => g.alive && !g.mergedInto && groupHouseholds(g).length),
    };
    R.answer('clans:api', () => api);
    R.words.fight = 'was killed'; // fights.js always adds where it happened (in the raid on Kamaford)
  },
};
