// C. Fights (stage 2): a grudge that boils over (sim/clans.js keeps them)
// becomes, in rising order, a quarrel, a theft or a field burnt, a raid on a
// village, or a pitched skirmish, played out on the map with the stage 1
// bodies: people gather, march, clash, run. Deaths go through the normal death
// path (cause 'fight'); stores, fields and huts really change; grudges answer.
//
// The battle is rolled when the war band gathers (fights-battle.js, a seeded
// roll), so the fate panel can say exactly who will fall, as it does for a
// wolf's hunt; anything that changes the fighters or how well they fight before
// blood is shed (a blessing, a death, the leader struck) rolls it again from
// the same seed, and the change goes into the stories. A moment opens while the
// band gathers and marches, and closes when blood is shed or the raid is off.
//
// Who fights: grown people whose 'fight' stat (seam: adult 1, elder 0.4, x 0.3
// for those who expect the stone's help; B pushes on it) reaches JOIN_ATTACK to
// march or JOIN_DEFEND to defend their own homes; the rest hang back (those who
// expect help pray for the stone to fight for them). How well: the 'strength'
// stat (B's weapons, this subsystem's blessing, wounds), numbers, morale.
import { T as T1 } from './tune.js';
import { resolveBattle, TUNE_BATTLE } from './fights-battle.js';
import { cap1, names } from './clans-words.js';
import { yearLabel, number } from './words.js';
import { setWeapon } from './bodies.js';
import { makeFightLook } from './fights-look.js';
import { idx, inB } from '../edit/vox.js';

export const TUNE_FIGHTS = {
  // ---- when a grudge boils over (grudge 0..100, one group against another) ----
  QUARREL_AT: 30,        // from here a quarrel may break out
  THEFT_AT: 44,          // a theft from a store, or a field burnt
  RAID_AT: 56,           // a raid on the other's village
  SKIRMISH_AT: 78,       // a pitched skirmish
  INCIDENT_RATE: 0.2,     // (integration: was 0.14; a hands-off run should feel its feuds) chance a calendar year at grudge 100 (from 0 at QUARREL_AT, as the square root: lesser grudges flare too)
  COOLDOWN: 12,          // calendar years between two incidents of the same pair
  MAX_ACTIVE: 2,         // fights going on at once
  START_DAY: [0.07, 0.24],// they begin in the morning, in full daylight (part of the day)
  WAIT_YEARS: 30,        // an incident not begun within this many years is forgotten
  // ---- who goes ----
  JOIN_ATTACK: 0.5,      // the 'fight' stat a grown person needs to march
  JOIN_DEFEND: 0.35,     // and to defend their own home (elders can)
  RAID_MIN: 2,           // a raid or skirmish needs this many willing fighters, else it is a theft
  BAND_MAX: 10,          // at most this many on a side
  // ---- how it plays out (game seconds, blocks; walking time: at 1x a game second is a real one) ----
  // (visible fights, 2026-11-13: the band gathers for GATHER_MIN_S..GATHER_S, marches in a body behind its
  // leader, stops, shakes its weapons for a moment and charges; each round of the resolver's script takes ROUND_S;
  // the slowed time holds from the gathering to the end of the aftermath, renewed by the fight itself.)
  GATHER_S: 13, GATHER_MIN_S: 6, MARCH_MAX_S: 60, CLASH_R: 8, ALARM_R: 34, ROUND_S: 3.0, CONTACT_S: 2.3, AFTER_S: 11, QUARREL_S: 10, SNEAK_MAX_S: 70,
  FAST: { GATHER_S: 7, GATHER_MIN_S: 0, ROUND_S: 1.7, CONTACT_S: 0, AFTER_S: 9, QUARREL_S: 7, SNEAK_MAX_S: 40 }, // in a skip (nobody watching): the old, quick timings
  FIGHT_MAX_S: 170,      // a raid or skirmish never runs longer than this (game seconds, start to end): the moment's ceiling
  BODY_S: 80,            // the dead lie where they fell this long unless kin carry them home to bury
  DAY_SLOW: 0.25,        // while a raid or skirmish is on, the day and night run at this share (the fight stays in daylight)
  SNEAK_DAY: [0.6, 0.68],// thieves and fire-raisers set out at dusk (part of the day)
  QUARREL_BRAWL: 0.25,   // a quarrel comes to blows (one wounded, nobody dies) with this chance
  CAUGHT: 0.4,           // a thief is caught (and beaten) with this chance
  STEAL_SHARE: 0.35,     // else takes this share of the store
  LOOT_SHARE: 0.4,       // a won raid carries off this share of the raided households' stores
  BURN_AFTER_RAID: 0.5,  // a raid won outright burns a field with this chance ...
  ROOF_AFTER_RAID: 0.3,  // ... and a hut's roof with this (the family must rebuild it)
  TRIBUTE_SHARE: 0.35,   // a beaten clan that stays pays this share of its stores
  FLEE_LOSS: 0.45,       // a beaten side that lost this share of its fighters leaves the land ...
  FLEE_SMALL: 3,         // ... as does one with this many grown-ups or fewer facing three times as many
  ABSORB_HOUSEHOLDS: 1,  // a beaten clan this small, living in the winners' village, is taken in
  // ---- what a wrong adds to the wronged side's grudge ----
  INSULT: 9, THEFT: 22, CAUGHT_THIEF: 8, BURN: 24, RAID: 22, KILL: 16, WOUND: 5,
  ANSWER_YEARS: 40,      // a wrong this fresh is answered one step higher (insult: theft; theft or fire: raid) ...
  ANSWER_AT: 38,         // ... by a side whose grudge is at least this
  VENT: 0.55,            // a raid or skirmish carried out leaves the attackers this share of their own grudge
  VENT_SMALL: 0.8,       // a theft or a burnt field this share (a quarrel vents nothing: words harden both sides)
  SETTLED: 0.5,          // tribute paid leaves both sides this share
  FEAR_HAPPY: -14, FEAR_LIFE: 8, // the raided are afraid (happiness, for this many life years)
  // ---- morale (0..1) ----
  MORALE: 0.62, MORALE_HOME: 0.12, MORALE_GRUDGE: 0.002, MORALE_BLESSED: 0.15, MORALE_INFLAMED: 0.12,
  WOLF_SCARE: 18,        // a hunting wolf this close to the gathering band ends the raid (a bad sign)
  INFLAME: 20,           // a leader struck where the band cannot see: they blame the other side, this much
};

export default {
  id: 'fights',
  tune: TUNE_FIGHTS,
  init(R) {
    const { S } = R, T = TUNE_FIGHTS, B = TUNE_BATTLE;
    R.tune('battle', TUNE_BATTLE);
    let C = null; // the clans API (sim/clans.js), fetched on first use: fights work only with clans loaded
    const api = () => C ?? (C = R.ask('clans:api') ?? null);
    const active = [];      // fights going on
    const pending = [];     // incidents waiting for the morning: { a, b, year, forced? }
    const roles = new Map(); // person -> { fight, role }
    const done = [];        // the last fights, for the console and the screen
    const log = [];         // the last launches: what the grudge called for and what it became (console)
    const stats = { byKind: { quarrel: 0, theft: 0, burning: 0, raid: 0, skirmish: 0 }, calledOff: 0, fled: 0, absorbed: 0, paid: 0, deaths: 0, wounds: 0, hangBack: 0 };
    let seq = 0;
    const rand = Math.random;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const PA = () => S.peopleApi;
    const year = () => Math.floor(S.year);
    const when = () => yearLabel(S.year);

    // ---------- presentation: timings, weapons, the look ----------
    const look = makeFightLook(R.ctx);
    const fast = () => R.ctx.clock.crawl === false; // a skip: nobody is watching, keep the old quick timings
    const TT = (k) => (fast() && T.FAST[k] != null ? T.FAST[k] : T[k]);
    const armed = new Set();      // people holding a weapon, torch or sack for a fight
    const afterplay = new Map();  // person -> a short task after their fight ended (lower the weapon and go home, cower, carry)
    const hauls = [];             // { by, who, dead, phase, t, home }: the dead (or the beaten) carried home
    const bodies = [];            // the fallen, lying where they fell: { p, hauled }
    // the best metal the people know, for the heads of their weapons
    function metalNow() {
      const made = R.ask('discoveries')?.made ?? [];
      const has = (id) => made.some((d) => d.id === id);
      return has('iron') ? 'iron' : has('bronze') ? 'bronze' : has('copper') ? 'copper' : 'stone';
    }
    const hashId = (p) => { let h = 7; const s = String(p.id); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    const weaponOf = (p, f) => (hashId(p) % 3 === 0 ? 'spear' : f.metal === 'stone' ? 'club' : 'axe');
    function arm(p, f, kind) {
      if (!p.F || p.dead) return;
      setWeapon(p.F, kind ?? weaponOf(p, f), f?.metal ?? 'stone', !!f && (kind == null) && blessed(p));
      armed.add(p);
    }
    function disarm(p) { if (p.F) { setWeapon(p.F, null); if (p.F.fig.scale.y !== 1) p.F.fig.scale.y = 1; } armed.delete(p); }
    const strikeOf = (p) => (p.F?.weaponKey?.startsWith('spear') ? 'thrust' : 'swing');
    const dyeOf = (g) => g?.dye ?? g?.color ?? 0xc0532f;
    // the slowed time: a raid or skirmish holds it from the gathering to the end of its aftermath. The seam's cap
    // counts real time (and runs on while paused), so the fight renews its own moment; FIGHT_MAX_S is the ceiling.
    const momentInfo = (f) => () => ({ text: f.text, x: f.x, z: f.z, kind: 'fight', act: f.major ? momentAct(f) : undefined });
    function keepMoment(f) {
      if (f.minorMoment || R.moment.isOpen(f.mid)) return;
      R.moment.open(f.mid, momentInfo(f), { cap: T.FIGHT_MAX_S + 30, quiet: 0, minor: false });
    }
    // a quarrel, a theft, a fire: a short minor moment (it may not open if another just ended; the feed still tells)
    function smallMoment(f, text) { f.minorMoment = true; f.text = text; R.moment.open(f.mid, momentInfo(f), { minor: true, cap: 12, quiet: 0 }); }

    // ---------- groups and who can fight ----------
    const gname = (g) => api().groupName(g);
    const centre = (hs) => {
      const at = hs.filter((f) => f.home).map((f) => ({ x: f.home.door?.x ?? f.home.cx, z: f.home.door?.z ?? f.home.cz }));
      if (!at.length) return null;
      return { x: at.reduce((s, a) => s + a.x, 0) / at.length, z: at.reduce((s, a) => s + a.z, 0) / at.length };
    };
    const busy = (p) => roles.has(p);
    const able = (p) => !p.dead && p.family.state === 'settled' && p.stage !== 'child' && !busy(p);
    const will = (p) => R.value('fight', p);
    const groupBusy = (g) => active.some((f) => f.a === g || f.b === g);
    // the target homes of a raid on group b, from a: b's homes nearest a (a village, or a clan's nearest cluster)
    function targetHomes(a, b) {
      const hs = api().groupHouseholds(b).filter((f) => f.home);
      if (!hs.length) return [];
      if (b.type === 'village') return hs;
      const from = centre(api().groupHouseholds(a)) ?? { x: S.stone.centre.x, z: S.stone.centre.z };
      const first = hs.reduce((m, f) => (dist({ x: f.home.cx, z: f.home.cz }, from) < dist({ x: m.home.cx, z: m.home.cz }, from) ? f : m));
      return hs.filter((f) => Math.hypot(f.home.cx - first.home.cx, f.home.cz - first.home.cz) <= 30);
    }
    function placeName(b, hs) {
      if (b.type === 'village') return b.name;
      const v = hs.map((f) => api().villageOfFamily(f)).find(Boolean);
      return v ? v.name : `the ${b.name} homes`;
    }
    const powerOf = (p, over) => {
      const w = api().isWounded(p) ? api().T.WOUND_FIGHT : 1;
      return R.value('strength', p) / w * (over?.strength?.(p) ?? 1) * (0.5 + 0.5 * Math.min(1, will(p) * (over?.will?.(p) ?? 1))) * (p.stage === 'elder' ? 0.7 : 1);
    };
    const blessed = (p, over) => over?.blessed?.(p) || R.mods('strength', p).some((m) => m.key.startsWith('clans:bless') && (m.until == null || S.life <= m.until));
    // the two sides as the battle sees them; `over` is a what-if (a blessing not yet given)
    function sides(f, over) {
      const up = (list) => list.filter((p) => !p.dead).sort((x, y) => (x.id < y.id ? -1 : 1));
      const A = up(f.attackers), D = up(f.defenders);
      const share = (list) => (list.length ? list.filter((p) => blessed(p, over)).length / list.length : 0);
      const g = api().gOf(f.a, f.b);
      const forces = (list) => Number(R.ask('moraleOf', list)) || 0; // forces.js: a soft people breaks sooner, a great warrior steadies a band
      return [
        { id: f.a.id, name: gname(f.a), morale: T.MORALE + g * T.MORALE_GRUDGE + (share(A) >= 0.5 ? T.MORALE_BLESSED : 0) + (f.inflamed ? T.MORALE_INFLAMED : 0) + forces(A),
          fighters: A.map((p) => ({ ref: p, power: powerOf(p, over), wounded: api().isWounded(p), deathMul: R.value('death', p) })) },
        { id: f.b.id, name: gname(f.b), morale: T.MORALE + (f.kind === 'raid' ? T.MORALE_HOME : 0) + (share(D) >= 0.5 ? T.MORALE_BLESSED : 0) + forces(D),
          fighters: D.map((p) => ({ ref: p, power: powerOf(p, over), wounded: api().isWounded(p), deathMul: R.value('death', p) })) },
      ];
    }
    const sig = (sd) => sd.map((s) => `${s.morale.toFixed(2)}:${s.fighters.map((x) => `${x.ref.id}=${x.power.toFixed(2)}${x.wounded ? 'w' : ''}`).join(',')}`).join('|');
    const plan = (f, over) => resolveBattle(sides(f, over), f.seed, B);
    // roll again if anything changed before blood is shed; tell the stories whose fate moved
    function replan(f, why) {
      const sd = sides(f);
      const s = sig(sd);
      if (s === f.sig && f.plan) return false;
      const was = f.plan;
      f.sig = s; f.plan = resolveBattle(sd, f.seed, B);
      if (was) {
        const dWas = new Set(was.dead.flat()), dNow = new Set(f.plan.dead.flat());
        for (const p of dWas) if (!dNow.has(p) && !p.dead) R.fateChanged(p, `die at ${Math.floor(p.age)} in ${f.label}`, why ?? 'Things changed before the fighting began.');
        for (const p of dNow) if (!dWas.has(p)) R.story(p, `Was to come through ${f.label}. ${why ?? 'Things changed before the fighting began.'}`);
      }
      return true;
    }

    // ---------- choosing what happens ----------
    const RANK = { quarrel: 1, theft: 2, burning: 2, raid: 3, skirmish: 4 };
    // a fresh wrong is answered in kind and one step higher: an insult with a theft, a theft or a burnt field
    // with a raid, a raid or a killing with a raid (a skirmish once the grudge is high enough on its own)
    const ANSWER = { insult: 'theft', theft: 'raid', burning: 'raid', raid: 'raid', kill: 'raid' };
    // theft or fire: fixed for a pair in a given year, so a forecast (provoke) and the act agree
    const sneakOf = (a, b) => { let h = year(); for (const ch of `${a.id}>${b?.id ?? ''}`) h = (h * 31 + ch.charCodeAt(0)) | 0; return (h & 1) ? 'burning' : 'theft'; };
    function levelFor(g, a, b) {
      let k = g >= T.SKIRMISH_AT ? 'skirmish' : g >= T.RAID_AT ? 'raid' : g >= T.THEFT_AT ? (api().groupMembers(a).some((p) => R.trait(p, 'raider') || R.trait(p, 'firebrand')) ? 'raid' : sneakOf(a, b)) : g >= T.QUARREL_AT ? 'quarrel' : null;
      const w = b && api().entry(a, b, false)?.wrong;
      if (k && w && year() - w.year <= T.ANSWER_YEARS && g >= T.ANSWER_AT) { const ans = ANSWER[w.kind]; if (ans && RANK[ans] > RANK[k]) k = ans === 'theft' ? sneakOf(a, b) : ans; }
      return k;
    }
    // remember a wrong for the ladder (on the wronged side's entry)
    const wronged = (x, y, kind) => { const e = api().entry(x, y); if (e) e.wrong = { kind, year: year() }; };
    function willing(a, min) {
      return api().groupMembers(a).filter((p) => able(p) && p.stage === 'adult' && will(p) >= min).sort((x, y) => powerOf(y) - powerOf(x));
    }
    function hangers(a) { return api().groupMembers(a).filter((p) => able(p) && p.stage === 'adult' && will(p) < T.JOIN_ATTACK); }
    // the year: does any grudge boil over?
    function rollYear() {
      const A = api();
      if (!A) return;
      for (const e of A.ledger.values()) {
        if (e.g < T.QUARREL_AT || year() - e.incident < T.COOLDOWN) continue;
        const a = A.groupOfId(e.a), b = A.groupOfId(e.b);
        if (!A.alive(a) || !A.alive(b) || pending.some((x) => x.a === a || x.b === a || x.a === b || x.b === b) || groupBusy(a) || groupBusy(b)) continue;
        if (rand() < T.INCIDENT_RATE * Math.sqrt((e.g - T.QUARREL_AT) / (100 - T.QUARREL_AT))) pending.push({ a, b, year: year() });
      }
    }
    // provoke, the console: queue one now for the next morning
    function queue(a, b, o = {}) {
      if (!a || !b || a === b) return false;
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].a === a && pending[i].b === b) pending.splice(i, 1);
      pending.unshift({ a, b, year: year(), forced: o.kind ?? null });
      return true;
    }
    // what would happen at the next morning between a and b, if it began now (the forecast reads this)
    function preview(a, b, kind) {
      const g = api().gOf(a, b);
      let k = kind ?? levelFor(g, a, b);
      if (!k) return null;
      if (api().allied(a, b) && k !== 'quarrel') k = 'quarrel';
      if ((k === 'raid' || k === 'skirmish') && willing(a, T.JOIN_ATTACK).length < T.RAID_MIN) k = willing(a, T.JOIN_ATTACK).length ? 'theft' : null;
      if ((k === 'theft' || k === 'burning') && !willing(a, T.JOIN_ATTACK).length) k = null;
      if (k === 'quarrel' && !api().groupMembers(a).some((p) => able(p) && p.stage === 'adult')) k = null;
      return k;
    }
    function launch() {
      if (!pending.length || active.length >= T.MAX_ACTIVE || R.ask('battleLive')) return; // a battle (sim/battle.js): feuds wait
      const morning = S.dayT >= T.START_DAY[0] && S.dayT <= T.START_DAY[1], dusk = S.dayT >= T.SNEAK_DAY[0] && S.dayT <= T.SNEAK_DAY[1];
      if (!morning && !dusk) return;
      const A = api();
      for (let i = 0; i < pending.length; i++) {
        const q = pending[i];
        if (groupBusy(q.a) || groupBusy(q.b)) continue;
        // a theft or a fire is done at dusk, everything else in the morning (the kind is the same roll either way)
        if (A.alive(q.a) && A.alive(q.b)) { const k0 = preview(q.a, q.b, q.forced ?? undefined); const sneaky = k0 === 'theft' || k0 === 'burning'; if (k0 && (sneaky ? !dusk : !morning)) continue; }
        pending.splice(i, 1);
        if (year() - q.year > T.WAIT_YEARS || !A.alive(q.a) || !A.alive(q.b)) return;
        const g = A.gOf(q.a, q.b);
        if (!q.forced && g < T.QUARREL_AT) return;
        const k = preview(q.a, q.b, q.forced ?? undefined);
        log.push({ year: year(), a: q.a.name, b: q.b.name, g: Math.round(g), level: levelFor(g, q.a, q.b), kind: k, willing: willing(q.a, T.JOIN_ATTACK).length, allied: A.allied(q.a, q.b) }); if (log.length > 80) log.shift();
        const e = A.entry(q.a, q.b);
        e.incident = year(); e.wrong = null;
        if (!k) { noOne(q.a, q.b); return; }
        start(k, q.a, q.b);
        return;
      }
    }
    // a grudge with nobody willing to raise a hand: those who expect help wait for the stone
    function noOne(a, b) {
      const hb = hangers(a);
      const e = api().entry(a, b);
      if (!hb.length || year() - (e.nobodySaid ?? -1e9) < 60) return;
      e.nobodySaid = year();
      stats.hangBack += hb.length;
      for (const p of hb) R.story(p, `Was angry with ${gname(b)}, but left it to the stone to settle.`);
      R.alert('info', `${cap1(gname(a))} seethed at ${gname(b)}, but nobody would raise a hand: they wait for the stone to settle it.`, { x: hb[0].x, z: hb[0].z, subject: hb[0],
        aside: R.aside('fights:nobody', ['Pacifism, of a sort. The lazy sort.', 'Outsourcing a feud to the sky. Bold.'], 120) });
    }

    // ---------- starting a fight ----------
    function newFight(kind, a, b) {
      const id = ++seq;
      const f = { id: `fight${id}`, n: id, mid: `sim:fight:${id}`, kind, a, b, why: api().why(a, b), phase: 'gather', t: 0, seed: (Math.random() * 1e9) | 0,
        attackers: [], defenders: [], hide: [], hangBack: [], dead: [], hurt: [], year: year(), started: S.life, events: [], ei: 0, alarm: false, inflamed: false, text: '' };
      return f;
    }
    const assign = (f, p, role) => { roles.set(p, { fight: f, role }); p.go = null; p.work = null; if (p.hidden && !PA().isNight()) PA().exitHome(p); };
    function start(kind, a, b) {
      const A = api();
      const f = newFight(kind, a, b);
      const ahs = A.groupHouseholds(a);
      f.rally = centre(ahs) ?? { x: S.stone.centre.x, z: S.stone.centre.z };
      if (kind === 'quarrel') return startQuarrel(f);
      if (kind === 'theft' || kind === 'burning') return startSneak(f);
      // raid or skirmish
      const band = willing(a, T.JOIN_ATTACK).slice(0, T.BAND_MAX);
      const raider = band.find((p) => R.trait(p, 'raider') || R.trait(p, 'firebrand'));
      f.leader = raider ?? band[0];
      f.attackers = band;
      f.hangBack = hangers(a);
      const ths = kind === 'raid' ? targetHomes(a, b) : A.groupHouseholds(b);
      f.homes = ths;
      f.place = placeName(b, ths);
      const tc = centre(ths) ?? { x: b.x ?? f.rally.x, z: b.z ?? f.rally.z };
      const home = new Set(ths);
      // defenders: who is home and willing; in a raid, allies living among them come out too
      let def = [];
      if (kind === 'raid') {
        const allies = b.type === 'clan' ? A.clans && [...A.clans.values()].filter((o) => o !== b && o.alive && A.bonds(o, b) > 0) : [];
        def = S.people.filter((p) => able(p) && (home.has(p.family) || (allies.includes(A.clanOfFamily(p.family)) && dist({ x: p.family.home?.cx ?? p.x, z: p.family.home?.cz ?? p.z }, tc) < 30)) && will(p) >= T.JOIN_DEFEND && !band.includes(p));
        f.hide = S.people.filter((p) => !p.dead && home.has(p.family) && !def.includes(p) && !busy(p) && !(p.stage !== 'child' && p.expectsHelp));
      } else def = willing(b, T.JOIN_DEFEND).filter((p) => !band.includes(p));
      f.defenders = def.sort((x, y) => powerOf(y) - powerOf(x)).slice(0, T.BAND_MAX + 2);
      f.hangBack.push(...A.groupMembers(b).filter((p) => able(p) && p.stage === 'adult' && will(p) < T.JOIN_DEFEND && !f.defenders.includes(p)));
      // where they meet: the raided homes, or halfway between the two sides
      if (kind === 'raid') f.target = tc;
      else { const bc = centre(A.groupHouseholds(b)) ?? tc; f.brally = bc; f.target = openSpot(PA().spotNear((f.rally.x + bc.x) / 2, (f.rally.z + bc.z) / 2, 0, 3, 12)); }
      f.x = f.target.x; f.z = f.target.z;
      // neighbours in one village: the band gathers out in the open beyond its own homes, so that it is seen to come
      if (!fast()) {
        const out = (c, from, k) => { const dx = c.x - from.x, dz = c.z - from.z, d = Math.hypot(dx, dz); const a = d > 0.5 ? Math.atan2(dz, dx) : rand() * 6.283; return openSpot(PA().spotNear(from.x + Math.cos(a) * k, from.z + Math.sin(a) * k, 0, 2, 10), 6); };
        if (kind === 'raid' && dist(f.rally, f.target) < 16) f.rally = out(f.rally, f.target, 16);
        if (kind === 'skirmish' && dist(f.rally, f.brally) < 24) { const m = f.target; f.rally = out(f.rally, m, 12); f.brally = out(f.brally, m, 12); if (dist(f.rally, f.brally) < 12) f.brally = out({ x: 2 * m.x - f.rally.x, z: 2 * m.z - f.rally.z }, m, 12); }
      }
      // where each band halts before the charge: a raid at the edge of the homes, a skirmish either side of the meeting place
      f.stopA = toward(f.target, f.rally, kind === 'raid' ? 5 : 2.6);
      f.stopB = kind === 'raid' ? toward(f.target, f.rally, 1.6) : toward(f.target, f.brally, 2.6);
      f.metal = metalNow();
      f.dleader = null;
      f.banA = look.banner(dyeOf(a));
      f.banB = look.banner(dyeOf(b));
      f.label = kind === 'raid' ? `the ${a.type === 'clan' ? `${a.name} clan's` : `${a.name}`} raid on ${f.place}` : `the skirmish between ${gname(a)} and ${gname(b)}`;
      for (const p of f.attackers) assign(f, p, 'attack');
      for (const p of f.defenders) assign(f, p, 'defend');
      for (const p of f.hide) assign(f, p, 'hide');
      for (const p of f.hangBack) if (!busy(p)) assign(f, p, 'hang');
      stats.hangBack += f.hangBack.length;
      replan(f);
      active.push(f);
      stats.byKind[kind]++;
      f.text = momentText(f);
      for (const p of f.attackers) { S.mind.push(p, p === f.leader ? `Today ${gname(b)} pays. Follow me.` : `Today ${gname(b)} pays.`); R.story(p, `Took up a club against ${gname(b)}${p === f.leader ? ', and led the band' : ''}.`); }
      for (const p of f.hangBack) { S.mind.push(p, p.expectsHelp ? 'Let the stone deal with them. It always does.' : 'This is no fight of mine.'); R.story(p, p.expectsHelp ? `Hung back from ${f.label}, waiting for the stone to fight for ${p.sex === 'f' ? 'her' : 'him'}.` : `Stayed out of ${f.label}.`); }
      f.dleader = f.defenders[0] ?? null;
      // the eye goes to the band: between its homes and where it is going (the pill then follows it)
      f.x = (f.rally.x + f.target.x) / 2; f.z = (f.rally.z + f.target.z) / 2;
      f.major = true; // a raid or skirmish may always kill: never a minor moment, never skipped
      R.signal('fight:start', { id: f.id, kind, a, b, x: f.x, z: f.z, fight: f });
      keepMoment(f);
      const first = stats.byKind[kind] === 1;
      R.alert('warn', f.text, { x: f.x, z: f.z, subject: f.leader,
        aside: first ? (kind === 'raid' ? 'The first raid. Somebody always has to start it.' : 'A pitched battle, with sticks. Civilisation approaches.') : undefined });
      return f;
    }
    function momentText(f) {
      const deaths = f.plan ? f.plan.dead.flat().length : 0;
      const who = f.kind === 'raid' ? `${cap1(gname(f.a))} ${f.a.type === 'clan' ? 'are' : 'is'} gathering to raid ${f.place}` : `${cap1(gname(f.a))} and ${gname(f.b)} are gathering to fight`;
      const hb = f.hangBack.filter((p) => p.expectsHelp).length;
      return `${who}, ${f.attackers.length} against ${f.defenders.length}, because ${f.why}.${hb ? ` ${cap1(number(hb))} who expect the stone to help ${hb === 1 ? 'hangs' : 'hang'} back.` : ''} Unless something changes, ${deaths ? `${number(deaths)} will die` : 'nobody will die'}.`;
    }
    const momentAct = (f) => `Bless one side's weapons, Calm (C) or Provoke (P) them, or strike their leader ${f.leader?.name ?? ''} (Z): seen by the band it ends the raid, unseen they blame ${gname(f.b)} and fight harder. A wolf near their camp also sends them home.`;

    function startQuarrel(f) {
      const A = api();
      const pa = A.groupMembers(f.a).filter((p) => able(p) && p.stage === 'adult').sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 2));
      const pb = A.groupMembers(f.b).filter((p) => able(p) && p.stage === 'adult').sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 2));
      if (!pa.length || !pb.length) return null;
      f.attackers = pa; f.defenders = pb; f.leader = pa[0];
      const ca = centre(A.groupHouseholds(f.a)) ?? pa[0], cb = centre(A.groupHouseholds(f.b)) ?? pb[0];
      f.target = openSpot(PA().spotNear((ca.x + cb.x) / 2, (ca.z + cb.z) / 2, 0, 3, 12));
      f.x = f.target.x; f.z = f.target.z;
      f.brawl = rand() < T.QUARREL_BRAWL;
      f.label = `a quarrel between ${gname(f.a)} and ${gname(f.b)}`;
      f.phase = 'meet';
      for (const p of pa) assign(f, p, 'attack');
      for (const p of pb) assign(f, p, 'defend');
      for (const p of [...pa, ...pb]) S.mind.push(p, `I am going to tell ${gname(pa.includes(p) ? f.b : f.a)} exactly what I think.`);
      active.push(f);
      stats.byKind.quarrel++;
      smallMoment(f, `${cap1(gname(f.a))} and ${gname(f.b)} are squaring up for a quarrel.`);
      return f;
    }
    function startSneak(f) {
      const A = api();
      const thief = willing(f.a, T.JOIN_ATTACK).sort((x, y) => (R.ask('foodPressure', y.family) ?? 0) - (R.ask('foodPressure', x.family) ?? 0))[0];
      if (!thief) return null;
      const from = thief.family.home ? { x: thief.family.home.cx, z: thief.family.home.cz } : thief;
      if (f.kind === 'theft') {
        const hs = A.groupHouseholds(f.b).filter((h) => h.home?.done && h.food > 0.5).sort((x, y) => y.food / (1 + dist({ x: y.home.cx, z: y.home.cz }, from) / 40) - x.food / (1 + dist({ x: x.home.cx, z: x.home.cz }, from) / 40));
        f.house = hs[0];
        if (!f.house) return null;
        f.target = { x: f.house.home.door.x, z: f.house.home.door.z };
        f.caught = rand() < T.CAUGHT;
        f.catcher = f.caught ? f.house.members.find((m) => !m.dead && m.stage !== 'child' && !busy(m)) ?? null : null;
        if (!f.catcher) f.caught = false;
        f.label = `a theft from the ${f.house.name} family's store`;
      } else {
        const fl = A.groupHouseholds(f.b).flatMap((h) => h.fields.filter((b) => b.done)).sort((x, y) => dist({ x: x.mx, z: x.mz }, from) - dist({ x: y.mx, z: y.mz }, from))[0];
        if (!fl) { f.kind = 'theft'; return startSneak(f); }
        f.field = fl;
        f.target = { x: fl.mx, z: fl.mz };
        f.label = `the burning of the ${fl.family?.name ?? 'X'} family's field`;
      }
      f.attackers = [thief]; f.leader = thief;
      f.x = f.target.x; f.z = f.target.z;
      f.phase = 'sneak';
      assign(f, thief, 'attack');
      if (f.catcher) assign(f, f.catcher, 'catch');
      arm(thief, f, f.kind === 'theft' ? 'sack' : 'torch');
      smallMoment(f, f.kind === 'theft' ? `${thief.name} of ${gname(f.a)} is creeping toward the ${f.house.name} family's store.` : `${thief.name} of ${gname(f.a)} is creeping toward a field with a burning brand.`);
      S.mind.push(thief, f.kind === 'theft' ? `They have more grain than they need. A little less will not hurt them.` : `Let ${gname(f.b)} see how they like an empty field.`);
      active.push(f);
      stats.byKind[f.kind]++;
      return f;
    }

    // ---------- the play on the map: what each person in a fight does next ----------
    // A fighter's next step is asked for whenever they have nothing to do (the stage 1 'activity' hook), so every
    // walk and pose here is short: the choreography is re-decided many times a second across a band. Nothing here
    // changes who wins or who falls: that is the resolver's script, played at its times (runEvent).
    const spotAround = (c, i, r0 = 1.5) => { const a = i * 2.39996, r = r0 + (i % 3) * 0.9; return PA().spotNear(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, 0, 0.8, 4); };
    const homeDoor = (p) => p.family.home?.door ?? p.family.home ?? p;
    const standing = (f, p) => !p.dead && !(f.gone?.has(p));
    // go home and put the weapon down there
    function goHome(p, o = {}) {
      const d = homeDoor(p);
      PA().goTo(p, d.x, d.z, { speed: o.speed ?? T1.WALK, r: 1, doing: o.doing ?? 'going home', then: () => { disarm(p); release(p); } });
      return true;
    }
    // a line across the way the enemy comes from, centred on c
    function lineSpot(c, from, i) {
      const dx = c.x - from.x, dz = c.z - from.z, d = Math.hypot(dx, dz) || 1;
      const k = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.25, back = Math.floor(i / 6) * 1.3;
      return PA().spotNear(c.x - dz / d * k + dx / d * back, c.z + dx / d * k + dz / d * back, 0, 0.6, 3);
    }
    const crouch = (p, on) => { if (p.F) p.F.fig.scale.y = on ? 0.8 : 1; };
    const toward = (c, from, k) => { const d = dist(c, from) || 1; return { x: c.x + (from.x - c.x) / d * k, z: c.z + (from.z - c.z) / d * k }; };
    function claim(p) {
      const ap = afterplay.get(p);
      if (ap) return claimAfter(p, ap);
      const r = roles.get(p);
      if (!r) return false;
      const f = r.fight, P = PA();
      if (P.isNight()) p.nightBound = true;
      const run = p.stage === 'adult' ? T1.RUN : T1.RUN * 0.8;
      if (f.gone?.has(p) || (f.phase === 'after' && f.losers?.includes(p))) {
        if (r.limp) return goHome(p, { speed: T1.WALK * 0.4, doing: 'crawling away from the fight' });
        return goHome(p, { speed: run, doing: 'running from the fight' });
      }
      if (r.role === 'hang') {
        if (f.phase === 'after' || f.phase === 'done') { release(p); return false; }
        const d = homeDoor(p);
        const s = r.spot ?? (r.spot = P.spotNear(d.x, d.z, 0.8, 2.2));
        if (dist(p, s) > 1.2) { P.goTo(p, s.x, s.z, { r: 0.5, doing: p.expectsHelp ? 'going home to pray for the stone to fight for them' : 'keeping out of it' }); return true; }
        if (p.expectsHelp) P.work(p, 'kneel', 4 + rand() * 2, { face: S.stone.centre, doing: 'kneeling to pray for the stone to fight for them' });
        else P.work(p, 'sit', 3 + rand() * 2, { doing: 'keeping out of the fight' });
        return true;
      }
      if (r.role === 'hide') {
        if (f.phase === 'after' || f.phase === 'done') { release(p); return false; }
        if (!f.alarm) return false;
        const h = p.family.home, d = homeDoor(p);
        if (dist(p, d) > 1.2) { P.goTo(p, d.x, d.z, { speed: run, r: 0.8, doing: 'running to hide from the raiders' }); return true; }
        if (h?.done && !P.isNight()) { P.enterHome(p, h); p.fleeing = 'fight'; p.doing = 'hiding indoors from the raiders'; return true; }
        P.work(p, 'cower', 3, { doing: 'hiding from the raiders' });
        return true;
      }
      if (f.kind === 'quarrel') return claimQuarrel(f, p, r);
      if (f.kind === 'theft' || f.kind === 'burning') return claimSneak(f, p, r);
      const atk = r.role === 'attack';
      if (f.phase === 'gather') {
        if (!atk && f.kind === 'raid') return false;
        const c = atk ? f.rally : (f.brally ?? f.target), i = (atk ? f.attackers : f.defenders).indexOf(p);
        const s = r.spot ?? (r.spot = spotAround(c, Math.max(0, i), 1.5));
        const doing = `gathering to fight ${gname(atk ? f.b : f.a)}`;
        if (dist(p, s) > 1.4) { P.goTo(p, s.x, s.z, { r: 1, speed: T1.WALK * 1.1, doing }); return true; }
        arm(p, f); r.there = true;
        P.work(p, rand() < 0.6 ? 'rally' : 'brace', 1 + rand(), { face: atk ? f.stopA : f.stopB, doing });
        return true;
      }
      if (f.phase === 'march') {
        if (atk || f.kind === 'skirmish') return marchStep(f, p, r, atk ? 0 : 1);
        if (!f.alarm) return false;
        // the raided drop their work, run home for a weapon, and stand in a line before the homes
        const d = homeDoor(p);
        if (!r.armed && dist(p, d) > 2.5) { P.goTo(p, d.x, d.z, { speed: run, r: 1.2, doing: 'running home for a weapon' }); return true; }
        if (!r.armed) { r.armed = true; arm(p, f); P.work(p, 'rally', 0.7, { face: f.rally, doing: 'snatching up a weapon' }); return true; }
        const s = r.spot2 ?? (r.spot2 = lineSpot(f.stopB, f.rally, f.defenders.indexOf(p)));
        if (dist(p, s) > 1) { P.goTo(p, s.x, s.z, { speed: run, r: 0.6, doing: `running to defend ${f.place}` }); return true; }
        P.work(p, 'brace', 0.8 + rand() * 0.6, { face: f.attackers.find((q) => !q.dead) ?? f.rally, doing: `standing to defend ${f.place}` });
        return true;
      }
      if (f.phase === 'clash') return claimClash(f, p, r, atk, run);
      if (f.phase === 'after') return claimAfterFight(f, p, r, atk);
      disarm(p); release(p);
      return false;
    }
    // the march: the leader walks to the halt (carrying the banner), the rest keep their places in a wedge behind
    // open ground near c for a fight to be fought on (and seen): few trees overhead, no water, nothing in the way
    const covered = (x, top, z) => { const d = R.ctx.world?.data; if (!d) return false; for (let y = top + 3; y <= top + 9; y++) if (inB(x, y, z) && d[idx(x, y, z)]) return true; return false; };
    function openSpot(c, rMax = 15) {
      const L = S.land;
      if (!L?.ci || fast()) return c;
      let best = c, bs = 1e9;
      for (let r = 0; r <= rMax; r += 3) for (let k = 0; k < (r ? 8 : 1); k++) {
        const a = k / 8 * 6.283, x = Math.floor(c.x + Math.cos(a) * r), z = Math.floor(c.z + Math.sin(a) * r);
        let bad = r * 0.35;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          if (!L.inside(x + dx, z + dz)) { bad += 5; continue; }
          const i = L.ci(x + dx, z + dz);
          bad += L.wet[i] ? 3 : L.tree[i] ? 2.5 : L.obst[i] ? 1 : L.res[i] ? 0.3 : 0;
          if ((dx & 1) === 0 && (dz & 1) === 0 && covered(x + dx, L.top[i], z + dz)) bad += 2.5; // leaves overhead hide a fight
        }
        if (bad < bs) { bs = bad; best = { x: x + 0.5, z: z + 0.5 }; }
      }
      return best;
    }
    const _bc = { x: 0, z: 0 };
    function marchStep(f, p, r, side) {
      const P = PA(), band = side ? f.defenders : f.attackers;
      const lead = side ? f.dleader : f.leader, stop = side ? f.stopB : f.stopA;
      const foe = side ? f.rally : f.kind === 'raid' ? f.target : f.brally;
      arm(p, f);
      const doing = f.kind === 'raid' ? `marching to raid ${f.place}` : `marching to fight ${gname(side ? f.a : f.b)}`;
      // (a leader far from the band hurries to its head; followers far from the leader make for the halt on their own)
      if (!lead || lead.dead || lead === p || dist(p, lead) > 12) {
        const behind = p === lead && dist(p, side ? f.stopB : f.stopA) > 3 && centreOf(band, _bc) > 1 && dist(p, _bc) > 8 && dist(_bc, stop) < dist(p, stop);
        if (dist(p, stop) > 1.4) { P.goTo(p, stop.x, stop.z, { speed: behind ? T1.RUN * 0.85 : T1.WALK, r: 1, until: 3, doing: p === lead ? `leading the band: ${doing}` : doing }); return true; }
        P.work(p, 'rally', 0.8, { face: foe, doing: 'waiting for the band to close up' });
        return true;
      }
      let i = 0;
      for (const q of band) { if (q === p) break; if (q !== lead) i++; }
      const hx = stop.x - lead.x, hz = stop.z - lead.z, hd = Math.hypot(hx, hz);
      let ux, uz;
      if (hd > 0.8) { ux = hx / hd; uz = hz / hd; } else { const fx = foe.x - lead.x, fz = foe.z - lead.z, fd = Math.hypot(fx, fz) || 1; ux = fx / fd; uz = fz / fd; }
      const row = 1 + Math.floor(i / 3), col = (i % 3) - 1;
      const sx = lead.x - ux * row * 1.35 - uz * col * 1.3, sz = lead.z - uz * row * 1.35 + ux * col * 1.3;
      const d = Math.hypot(sx - p.x, sz - p.z);
      if (d > 12) { P.goTo(p, sx, sz, { speed: T1.WALK * 1.3, r: 1.5, until: 2.5, doing }); return true; }
      if (d > 0.7) { P.goTo(p, sx, sz, { direct: true, speed: Math.min(T1.RUN, T1.WALK * 0.9 + d * 0.5), r: 0.4, until: 0.6, doing }); return true; }
      P.work(p, lead.moving ? null : 'rally', lead.moving ? 0.25 : 0.7, { face: foe, doing });
      return true;
    }
    // whom to fight: the partner the script pairs them with, else the nearest enemy not already beset
    function pickOpp(f, p, r) {
      const o = r.opp;
      if (o && standing(f, o) && !o.hidden && (r.oppUntil ?? 0) > f.t) return o;
      const w = r.partner;
      if (w && standing(f, w) && !w.hidden) return w;
      if (o && standing(f, o) && !o.hidden && dist(p, o) < 5) return o;
      const mine = f.attackers.includes(p), list = mine ? f.defenders : f.attackers, own = mine ? f.attackers : f.defenders;
      let best = null, bs = 1e9;
      for (const q of list) {
        if (!standing(f, q) || q.hidden) continue;
        let n = 0;
        for (const z of own) if (z !== p && roles.get(z)?.opp === q) n++;
        const s = dist(p, q) + n * 2.5;
        if (s < bs) { bs = s; best = q; }
      }
      return best && dist(p, best) < 40 ? best : null;
    }
    // the one struck answers (unless they are reeling from a telling blow, or already in a blow of their own)
    function respond(f, q, by, pose, dur) {
      const rq = roles.get(q);
      if (!rq || rq.fight !== f || (rq.lockT ?? -1) > f.t || q.dead || f.gone?.has(q)) return;
      q.go = null; PA().work(q, pose, dur, { face: by, doing: `fighting ${by.name}` }); rq.lockT = f.t + dur * 0.8;
    }
    function push(f, q, by, k) {
      const rq = roles.get(q);
      if (!rq || rq.fight !== f || (rq.lockT ?? -1) > f.t || q.dead) return;
      const dx = q.x - by.x, dz = q.z - by.z, d = Math.hypot(dx, dz) || 1;
      PA().goTo(q, q.x + dx / d * k, q.z + dz / d * k, { direct: true, speed: 4.5, r: 0.2, until: 0.4, doing: `shoved back by ${by.name}` });
      rq.lockT = f.t + 0.4;
    }
    function claimClash(f, p, r, atk, run) {
      const P = PA();
      arm(p, f);
      // the two sides face each other and shake their weapons, then charge
      if (f.t < 1.3 && !fast()) { const q = pickOpp(f, p, r); P.work(p, 'rally', 1.35 - f.t, { face: q ?? f.target, doing: 'shaking a weapon at the enemy' }); return true; }
      const q = pickOpp(f, p, r);
      if (!q) {
        if (atk && f.kind === 'raid' && f.homes?.length) { const h = f.homes[f.attackers.indexOf(p) % f.homes.length]; const d = h.home?.door ?? f.target; P.goTo(p, d.x, d.z, { speed: run, r: 1, doing: `looting ${f.place}`, then: () => P.work(p, 'pick', 2, { doing: `looting ${f.place}` }) }); return true; }
        P.work(p, 'brace', 0.7, { face: f.target, doing: 'standing ready' });
        return true;
      }
      r.opp = q;
      const d = dist(p, q);
      // partners hold their places on the front and fight across it
      const rq = roles.get(q);
      if (q === r.partner && r.front && rq?.front && (r.oppUntil ?? 0) <= f.t && dist(r.front, rq.front) < 3 && dist(q, rq.front) < 2.5) {
        if (dist(p, r.front) > 0.7) { P.goTo(p, r.front.x, r.front.z, { direct: true, speed: dist(p, r.front) > 4 ? run : T1.WALK, r: 0.3, until: 0.8, doing: `squaring up to ${q.name}` }); return true; }
      } else if (d > 2.1) { const k = (d - 1.55) / d; P.goTo(p, p.x + (q.x - p.x) * k, p.z + (q.z - p.z) * k, { direct: true, speed: run, r: 0.35, until: 0.7, doing: `fighting ${q.name}` }); return true; }
      if (d < 1.15) { const k = 1.6 / (d || 1); P.goTo(p, q.x + (p.x - q.x) * k, q.z + (p.z - q.z) * k, { direct: true, speed: T1.WALK, r: 0.25, until: 0.4, doing: `giving ground to ${q.name}` }); return true; } // a little room to swing
      const doing = `fighting ${q.name} of ${gname(atk ? f.b : f.a)}`;
      const x = rand();
      if (x < 0.5) { // a blow: the other blocks it or reels back (the telling blows are the script's, below)
        P.work(p, strikeOf(p), 0.75, { face: q, doing });
        respond(f, q, p, rand() < 0.55 ? 'block' : 'recoil', 0.6);
        r.lockT = f.t + 0.7; r.hitAt = f.t + 0.42; r.hitOn = q;
      } else if (x < 0.62) { P.work(p, 'shove', 0.45, { face: q, doing }); push(f, q, p, 1.5); r.lockT = f.t + 0.4; }
      else if (x < 0.82) { // circle round them, looking for an opening
        const a = Math.atan2(p.z - q.z, p.x - q.x) + (rand() < 0.5 ? 0.7 : -0.7);
        P.goTo(p, q.x + Math.cos(a) * 1.75, q.z + Math.sin(a) * 1.75, { direct: true, speed: T1.WALK * 0.8, r: 0.3, until: 0.6, doing });
      } else P.work(p, 'brace', 0.4 + rand() * 0.4, { face: q, doing });
      return true;
    }
    function claimAfterFight(f, p, r, atk) {
      const P = PA();
      const winner = (atk && f.winner === 0) || (!atk && f.winner === 1);
      if (winner && !r.cheered && !fast()) { r.cheered = true; arm(p, f); P.work(p, 'cheer', 1.6 + rand() * 0.8, { face: f.target, doing: 'cheering: the day is won' }); return true; }
      if (atk && winner && f.kind === 'raid') {
        if (f.torch === p && f.burnPending) { // the field the raiders burn, with a torch from the hearth
          arm(p, f, 'torch');
          const fl = f.burnPending, c = { x: fl.mx ?? fl.x, z: fl.mz ?? fl.z };
          if (dist(p, c) > 2.4) { P.goTo(p, c.x, c.z, { speed: T1.RUN, r: 2.2, doing: `running to burn the ${fl.family?.name ?? ''} family's crop` }); return true; }
          if (!f.burnLit) { f.burnLit = true; look.burn(fl); }
          P.work(p, 'kindle', 2.6, { face: c, doing: 'setting the crop alight', then: () => doBurn(f) });
          return true;
        }
        if (!r.looted && f.homes?.length) {
          r.looted = true;
          const h = f.homes[Math.max(0, f.attackers.indexOf(p)) % f.homes.length], d = h.home?.door ?? f.target;
          arm(p, f, 'sack');
          P.goTo(p, d.x, d.z, { speed: T1.RUN, r: 1.1, doing: `looting ${f.place}`, then: () => P.work(p, 'pick', 2.2, { face: d, doing: `carrying off grain from ${f.place}`, then: () => arm(p, f, 'sackfull') }) });
          return true;
        }
        return goHome(p, { doing: 'carrying off the loot' });
      }
      const hurt = f.hurt.includes(p);
      return goHome(p, { speed: hurt ? T1.WALK * 0.55 : T1.WALK, doing: winner ? 'going home after the fight' : hurt ? 'limping home' : 'going home, beaten' });
    }
    // after the fight is over: a lowered weapon and the walk home, a cower under the sky, carrying the dead
    function claimAfter(p, a) {
      const P = PA();
      if (a.kind === 'lower') { afterplay.set(p, { kind: 'home', speed: T1.WALK * 0.9, doing: 'going home, the anger gone' }); P.work(p, 'lower', a.dur ?? 2.6, { face: a.face, doing: 'lowering the weapon: the anger has gone out of it' }); return true; }
      if (a.kind === 'cower') { afterplay.set(p, { kind: 'home', speed: T1.RUN, doing: 'running home from the sky' }); P.work(p, 'cower', a.dur ?? 1.5, { face: a.face, doing: 'cowering: the sky struck the leader down' }); return true; }
      if (a.kind === 'home') { afterplay.delete(p); return goHome(p, { speed: a.speed, doing: a.doing }); }
      if (a.kind === 'mourn') { afterplay.delete(p); disarm(p); P.work(p, 'mourn', a.dur ?? 4, { face: a.face, doing: a.doing ?? 'mourning' }); return true; }
      if (a.kind === 'hauled') { P.work(p, 'down', 2, { doing: 'being helped home, beaten' }); return true; }
      if (a.kind === 'haul') return claimHaul(p, a.h);
      afterplay.delete(p);
      return false;
    }
    // carrying home the dead (to bury by the home) or the beaten (to their door)
    function claimHaul(p, h) {
      const P = PA(), w = h.who;
      if (h.done || (h.dead ? !S.people.includes(w) : w.dead)) { endHaul(h); return false; }
      disarm(p);
      if (h.phase === 'go') {
        if (dist(p, w) > 1.3) { P.goTo(p, w.x, w.z, { r: 1, speed: T1.WALK * 1.15, doing: h.dead ? `going to ${w.name}, who fell` : `going to help ${w.name} home` }); return true; }
        h.phase = 'mourn';
        P.work(p, 'mourn', h.dead ? 3.5 : 1, { face: w, doing: h.dead ? `mourning ${w.name}` : `lifting ${w.name}` });
        return true;
      }
      if (h.phase === 'mourn') h.phase = 'carry';
      const d = h.home ?? (h.home = homeDoor(p));
      if (dist(p, d) > 1.6) { P.goTo(p, d.x, d.z, { speed: T1.WALK * 0.7, r: 1.4, doing: h.dead ? `carrying ${w.name} home to bury` : `helping ${w.name} home`, then: () => arriveHaul(h) }); return true; }
      arriveHaul(h);
      return false;
    }
    function arriveHaul(h) {
      if (h.done) return;
      const w = h.who, by = h.by;
      if (h.dead) {
        if (S.people.includes(w)) {
          const s = PA().spotNear(by.x, by.z, 1.5, 3.2);
          look.grave(s.x, s.z, by.ry ?? 0);
          w.x = s.x; w.z = s.z; w.keepBody = 0;
        }
        h.done = true;
        const i = hauls.indexOf(h); if (i >= 0) hauls.splice(i, 1);
        afterplay.set(by, { kind: 'mourn', dur: 4, doing: `burying ${w.name}` });
        return;
      }
      endHaul(h);
    }
    function endHaul(h) {
      h.done = true;
      const i = hauls.indexOf(h); if (i >= 0) hauls.splice(i, 1);
      if (afterplay.get(h.by)?.h === h) afterplay.delete(h.by);
      if (!h.dead && !h.who.dead) { afterplay.delete(h.who); h.who.work = null; }
      if (h.dead) { const b = bodies.find((x) => x.p === h.who); if (b) b.hauled = false; } // nobody carried them after all: buried where they lie
    }
    function startHauls(f) {
      if (fast()) return;
      const free = (q) => q && !q.dead && !q.hidden && !roles.has(q) && !afterplay.has(q) && q.stage !== 'child' && q.family.state === 'settled';
      for (const w of f.dead) {
        if (!S.people.includes(w)) continue;
        const kin = (w.family?.members ?? []).filter((q) => free(q) && dist(q, w) < 70);
        const side = f.attackers.includes(w) ? f.attackers : f.defenders;
        const by = kin.sort((x, y) => dist(x, w) - dist(y, w))[0] ?? side.filter((q) => free(q) && dist(q, w) < 30)[0];
        if (!by) continue;
        const h = { by, who: w, dead: true, phase: 'go', home: null, done: false };
        hauls.push(h); afterplay.set(by, { kind: 'haul', h }); by.go = null; by.work = null;
        const b = bodies.find((x) => x.p === w); if (b) b.hauled = true;
        S.mind.push(by, `${w.name}... no.`);
      }
      // the beaten who could not walk: a comrade drags them home
      for (const w of f.downed ?? []) {
        if (w.dead || dist(w, homeDoor(w)) < 4) continue;
        const side = f.attackers.includes(w) ? f.attackers : f.defenders;
        const by = side.filter((q) => free(q) && dist(q, w) < 25)[0];
        if (!by) continue;
        const h = { by, who: w, dead: false, phase: 'go', home: null, done: false };
        hauls.push(h); afterplay.set(by, { kind: 'haul', h }); afterplay.set(w, { kind: 'hauled' }); by.go = null; by.work = null; w.go = null; w.work = null;
      }
    }
    function claimQuarrel(f, p, r) {
      const P = PA(), mine = r.role === 'attack', other = mine ? f.defenders : f.attackers;
      const s = r.spot ?? (r.spot = spotAround(f.target, (mine ? 0 : 3) + (mine ? f.attackers : f.defenders).indexOf(p), 0.9));
      const foe = mine ? f.b : f.a, q = other.find((x) => !x.dead) ?? null;
      if (f.phase === 'meet' || (f.phase === 'argue' && dist(p, s) > 2.5)) {
        if (dist(p, s) <= 1.2) { P.work(p, 'shout', 0.9, { face: q ?? f.target, doing: `shouting at ${gname(foe)}` }); return true; }
        P.goTo(p, s.x, s.z, { speed: T1.WALK * 1.15, doing: `going to have words with ${gname(foe)}`, r: 1 });
        return true;
      }
      if (f.phase === 'argue') {
        if (f.blows && (p === f.fighter || p === f.victim) && f.t > TT('QUARREL_S') * 0.4) {
          const o = p === f.fighter ? f.victim : f.fighter;
          const d = dist(p, o);
          if (d > 1.4) { const k = (d - 1.1) / d; P.goTo(p, p.x + (o.x - p.x) * k, p.z + (o.z - p.z) * k, { direct: true, speed: T1.RUN, r: 0.35, until: 0.6, doing: `going for ${o.name}` }); return true; }
          const x = rand();
          if (x < 0.4) { P.work(p, 'swing', 0.75, { face: o, doing: `trading blows with ${o.name}` }); respond(f, o, p, 'recoil', 0.55); r.lockT = f.t + 0.7; r.hitAt = f.t + 0.42; r.hitOn = o; }
          else if (x < 0.65) { P.work(p, 'shove', 0.45, { face: o, doing: `shoving ${o.name}` }); push(f, o, p, 1.2); }
          else P.work(p, 'brace', 0.5, { face: o, doing: `squaring up to ${o.name}` });
          return true;
        }
        P.work(p, rand() < 0.6 ? 'shout' : 'gesture', 1.0 + rand() * 0.8, { face: q, doing: `quarrelling with ${q?.name ?? 'them'}` });
        return true;
      }
      return goHome(p, { speed: T1.WALK * 1.35, doing: 'storming off home' });
    }
    function claimSneak(f, p, r) {
      const P = PA();
      if (r.role === 'catch') {
        if (f.phase !== 'take' && f.phase !== 'caught') return false;
        const t = f.leader;
        if (!r.armedCatch) { r.armedCatch = true; arm(p, f, 'club'); }
        if (dist(p, t) > 1.4) { P.goTo(p, t.x, t.z, { direct: true, speed: T1.RUN, r: 1.1, until: 2, doing: `catching ${t.name} at the store` }); return true; }
        P.work(p, 'swing', 0.75, { face: t, doing: `beating ${t.name}, the thief` }); respond(f, t, p, rand() < 0.5 ? 'block' : 'cower', 0.6); r.lockT = f.t + 0.7; r.hitAt = f.t + 0.42; r.hitOn = t;
        return true;
      }
      if (f.phase === 'sneak') { crouch(p, true); P.goTo(p, f.target.x, f.target.z, { speed: T1.WALK * 0.75, r: f.kind === 'burning' ? 2.2 : 1.1, doing: f.kind === 'theft' ? `creeping to the ${f.house.name} family's store` : 'creeping to a field with a burning brand', then: () => arrive(f) }); return true; }
      if (f.phase === 'take') { crouch(p, false); P.work(p, f.kind === 'theft' ? 'pick' : 'kindle', 1, { face: f.target, doing: f.kind === 'theft' ? 'stuffing grain into a sack' : 'setting the crop alight' }); return true; }
      if (f.phase === 'caught') { crouch(p, false); P.work(p, rand() < 0.5 ? 'block' : 'recoil', 0.7, { face: f.catcher, doing: 'caught, and fighting to get away' }); return true; }
      crouch(p, false);
      if (f.loot) arm(p, f, 'sackfull');
      return goHome(p, { speed: f.caught || f.kind === 'burning' ? T1.RUN : T1.RUN * 0.9, doing: f.caught ? 'running home, bruised' : f.kind === 'theft' ? 'running home with a sack of stolen grain' : 'running home from the fire' });
    }
    function arrive(f) { if (f.phase === 'sneak') { f.phase = 'take'; f.t = 0; if (f.kind === 'burning' && !fast()) look.burn(f.field); } }
    function release(p) { const r = roles.get(p); if (r) roles.delete(p); }
    const interrupt = (list) => { for (const p of list) if (!p.dead) { p.go = null; p.work = null; if (p.hidden && !PA().isNight()) PA().exitHome(p); } };

    // ---------- each step: the fights move on ----------
    function tick(dt) {
      if (!api()) return;
      launch();
      for (const f of [...active]) {
        f.t += dt;
        if (f.kind === 'quarrel') tickQuarrel(f);
        else if (f.kind === 'theft' || f.kind === 'burning') tickSneak(f);
        else tickBattle(f, dt);
      }
    }
    // the middle of a band (the pill follows it)
    function centreOf(list, out) {
      let x = 0, z = 0, n = 0;
      for (const p of list) if (!p.dead && !p.hidden) { x += p.x; z += p.z; n++; }
      if (n) { out.x = x / n; out.z = z / n; }
      return n;
    }
    const nearCount = (list, c, r) => { let n = 0; for (const p of list) if (!p.dead && dist(p, c) < r) n++; return n; };
    const aliveCount = (list) => { let n = 0; for (const p of list) if (!p.dead) n++; return n; };
    function tickBattle(f, dt) {
      keepMoment(f);
      f.life = (f.life ?? 0) + dt;
      if (f.phase === 'gather' || f.phase === 'march') {
        const off = callOffReason(f);
        if (off) return callOff(f, off);
        f.replanT = (f.replanT ?? 0) - 1;
        if (f.replanT <= 0) { f.replanT = 20; if (replan(f)) f.text = momentText(f); }
      }
      // the ceiling: whatever happens, a fight does not hold the slowed time for ever
      const over = f.life > T.FIGHT_MAX_S;
      if (f.phase === 'gather') {
        centreOf(f.attackers, f);
        const there = f.attackers.filter((p) => !p.dead && roles.get(p)?.there).length, all = aliveCount(f.attackers);
        if ((f.t >= TT('GATHER_MIN_S') && there >= Math.ceil(all * 0.7)) || f.t >= TT('GATHER_S') || over) { f.phase = 'march'; f.t = 0; interrupt(f.attackers); if (f.kind === 'skirmish') interrupt(f.defenders); }
        return;
      }
      if (f.phase === 'march') {
        const band = f.attackers;
        centreOf(band, f);
        const near = nearCount(band, f.target, T.ALARM_R);
        if (!f.alarm && (near || f.kind === 'skirmish')) { f.alarm = true; interrupt([...f.defenders, ...f.hide]); for (const p of f.defenders) S.mind.push(p, f.kind === 'raid' ? 'They are coming! Grab a stick!' : `Here they come. Stand together.`); for (const p of f.hide) S.mind.push(p, 'Stay down. Stay quiet.'); }
        let ready;
        if (fast()) {
          const close = nearCount(band, f.target, T.CLASH_R + 3);
          ready = f.kind === 'raid' ? close >= Math.ceil(aliveCount(band) / 2) : close >= Math.ceil(aliveCount(band) / 2) && nearCount(f.defenders, f.target, T.CLASH_R + 4) >= Math.ceil(aliveCount(f.defenders) / 2);
        } else {
          // the band halts in a body at the edge of the homes (a skirmish: both bands at their halts), then charges
          const a = nearCount(band, f.stopA, 4.5) >= Math.ceil(aliveCount(band) / 2);
          const b = f.kind === 'raid' ? true : nearCount(f.defenders, f.stopB, 4.5) >= Math.ceil(aliveCount(f.defenders) / 2);
          ready = a && b;
        }
        if (ready || f.t > T.MARCH_MAX_S || over) clash(f);
        return;
      }
      if (f.phase === 'clash') {
        const t = f.t;
        // the script's blows are set up a moment before they land: the striker and the struck square up, the striker swings
        for (let i = f.ei; i < f.events.length; i++) {
          const e = f.events[i];
          if (e.at - 1.8 > t) break;
          const p = e.ref, by = e.by;
          if (!e.paired && by && standing(f, by) && !p.dead) { e.paired = true; const rp = roles.get(p), rb = roles.get(by); if (rp) { rp.opp = by; rp.oppUntil = e.at; } if (rb) { rb.opp = p; rb.oppUntil = e.at; } }
          if (!e.blow && e.at - 0.45 <= t && by && standing(f, by) && !p.dead && dist(by, p) < 3.4) { e.blow = true; by.go = null; PA().work(by, strikeOf(by), 0.75, { face: p, doing: `striking ${p.name}` }); const rb = roles.get(by); if (rb) rb.lockT = t + 0.7; }
        }
        while (f.ei < f.events.length && f.events[f.ei].at <= t) runEvent(f, f.events[f.ei++]);
        centreOf(f.attackers.concat(f.defenders).filter((p) => standing(f, p)), f);
        if (t >= f.endAt || over) finishBattle(f);
        return;
      }
      if (f.phase === 'after' && (f.t >= TT('AFTER_S') || over)) end(f);
    }
    function clash(f) {
      replan(f);
      f.phase = 'clash'; f.t = 0;
      f.gone = new Set();
      f.downed = [];
      const RS = TT('ROUND_S'), C0 = TT('CONTACT_S');
      f.events = f.plan.events.map((e) => ({ ...e, at: C0 + (e.round + (fast() ? 0.55 : 0.3) + rand() * (fast() ? 0.35 : 0.6)) * RS })).sort((x, y) => x.at - y.at);
      f.endAt = C0 + (f.plan.rounds + 0.8) * RS;
      interrupt([...f.attackers, ...f.defenders]);
      for (const p of f.attackers.concat(f.defenders)) if (!p.dead) S.mind.push(p, p === f.leader || p === f.dleader ? 'Now! At them!' : rand() < 0.5 ? 'At them!' : 'Stay with me!');
      if (!fast()) frontLine(f);
    }
    // the clash is fought along a front, in pairs, so it reads as a line of duels rather than one heap: each
    // fighter gets a place on their side of the line and a partner across it (the bigger side's extras pair up
    // with the same enemies, a step behind their comrade). The script's blows still pair striker and struck.
    function frontLine(f) {
      const A = f.attackers.filter((p) => !p.dead && !p.hidden), D = f.defenders.filter((p) => !p.dead && !p.hidden);
      if (!A.length || !D.length) return;
      const ca = { x: 0, z: 0 }, cd = { x: 0, z: 0 };
      centreOf(A, ca); centreOf(D, cd);
      let ux = cd.x - ca.x, uz = cd.z - ca.z; const d = Math.hypot(ux, uz) || 1; ux /= d; uz /= d;
      const vx = -uz, vz = ux, mx = (ca.x + cd.x) / 2, mz = (ca.z + cd.z) / 2;
      const along = (p) => (p.x - mx) * vx + (p.z - mz) * vz;
      const place = (list, sgn) => {
        list.sort((x, y) => along(x) - along(y));
        const n = list.length;
        list.forEach((p, i) => { const r = roles.get(p); if (!r) return; const l = (i - (n - 1) / 2) * 2.1; r.front = PA().spotNear(mx + vx * l - sgn * ux * 0.95, mz + vz * l - sgn * uz * 0.95, 0, 0.5, 3); r.lane = l; });
      };
      place(A, 1); place(D, -1);
      const pair = (from, to) => from.forEach((p, i) => { const r = roles.get(p); if (r) r.partner = to[Math.min(to.length - 1, Math.round(i * (to.length - 1) / Math.max(1, from.length - 1)))]; });
      pair(A, D); pair(D, A);
    }
    function runEvent(f, e) {
      const p = e.ref;
      if (!p || p.dead) return;
      const by = e.by && !e.by.dead ? e.by : null;
      const r = roles.get(p);
      if (!fast()) look.spark(p.x, (p.y ?? 16) + 1.5, p.z, e.kind === 'death' ? 12 : e.kind === 'flee' ? 0 : 8);
      if (e.kind === 'wound') {
        api().wound(p, `wounded in ${f.label}`);
        f.hurt.push(p); stats.wounds++;
        R.story(p, `Was wounded in ${f.label}${by ? ` by ${by.name}` : ''}.`);
        S.mind.push(p, 'It hurts. It hurts. Keep going.');
        p.go = null; PA().work(p, 'stagger', fast() ? 0.7 : 1.5, { face: by ?? undefined, doing: 'staggering, wounded' });
        if (r) r.lockT = f.t + 1.4;
      } else if (e.kind === 'death') killed(f, p, by, e.pursuit);
      else {
        f.gone.add(p); p.go = null; p.work = null;
        if (e.kind === 'out') {
          f.hurt.push(p); f.downed.push(p); if (r) r.limp = true;
          R.story(p, `Was beaten down in ${f.label} and crawled away.`);
          if (!fast()) { PA().work(p, 'down', 3.2, { doing: 'beaten to the ground' }); if (r) r.lockT = f.t + 3.2; }
        } else {
          R.story(p, `Ran from ${f.label}.`);
          disarm(p); // a broken side throws down its weapons and runs
          const ban = f.attackers.includes(p) ? f.banA : f.banB;
          if (ban) ban.falling = true;
        }
      }
    }
    function killed(f, p, by, pursuit) {
      const age = Math.floor(p.age), c = api().clanOf(p);
      const byC = by ? api().clanOf(by) : null;
      f.dead.push(p); stats.deaths++; api().counters.fightDeaths++;
      // the dead lie where they fell (straightened first: the people step tips them onto their side)
      p.keepBody = fast() ? 8 : T.BODY_S;
      if (p.F) { p.F.fig.rotation.x = 0; p.F.fig.position.y = 0; }
      disarm(p);
      if (!fast()) bodies.push({ p, hauled: false, done: false });
      PA().die(p, 'fight', {
        where: ` in ${f.label}`,
        story: `Killed in ${f.label} at ${age}${by ? `, by ${by.name} of the ${byC?.name ?? by.family.name} clan` : pursuit ? ', cut down while running' : ''}.`,
        kinStory: (k) => `Lost ${p.name}, killed in ${f.label}.`,
        aside: f.dead.length === 1 && stats.deaths === 1 ? 'The first of your people killed by your people. It was always going to be one of them.' : undefined,
      });
      // the wrong: the dead one's clan against the killer's clan (and the groups that fought)
      const side = f.attackers.includes(p) ? 0 : 1;
      const mine = side === 0 ? f.a : f.b, theirs = side === 0 ? f.b : f.a;
      const t = `${gname(theirs)} killed ${p.name} in ${when()}`;
      api().add(mine, theirs, T.KILL, 'kill', t);
      if (c && byC && c !== byC && (c !== mine || byC !== theirs)) api().add(c, byC, T.KILL, 'kill', `the ${byC.name} clan killed ${p.name} in ${when()}`);
    }
    function finishBattle(f) {
      const A = api();
      f.winner = f.plan.winner;
      const W = f.winner === 0 ? f.a : f.winner === 1 ? f.b : null, L = f.winner === 0 ? f.b : f.winner === 1 ? f.a : null;
      f.losers = f.winner === 0 ? f.defenders : f.winner === 1 ? f.attackers : [];
      // wounds are wrongs too
      for (const p of f.hurt) { const s = f.attackers.includes(p) ? 0 : 1; A.add(s ? f.b : f.a, s ? f.a : f.b, T.WOUND, 'wrong', null); }
      const parts = [];
      if (f.dead.some((p) => f.attackers.includes(p))) wronged(f.a, f.b, 'kill');
      if (f.kind === 'skirmish' && f.dead.some((p) => f.defenders.includes(p))) wronged(f.b, f.a, 'kill');
      if (f.kind === 'raid') {
        A.add(f.b, f.a, T.RAID, 'wrong', `${gname(f.a)} raided ${f.place} in ${when()}`); wronged(f.b, f.a, f.dead.some((p) => f.defenders.includes(p)) ? 'kill' : 'raid');
        const eb = A.entry(f.b, f.a); eb.owed = year();
        const ea = A.entry(f.a, f.b, false); if (ea && ea.owed != null) ea.owed = null; // they answered
        if (f.winner === 0) { if (ea) A.scale(ea, T.VENT); const sp = raidSpoils(f); parts.push(...(sp.length ? sp : [`the raiders won, but found little worth taking`])); }
        else parts.push(f.winner === 1 ? `${cap1(gname(f.b))} drove them off` : 'neither side gave way');
        R.mod('happy', `fights:fear:${f.id}`, { add: T.FEAR_HAPPY, who: ((hs) => (p) => hs.has(p.family))(new Set(f.homes)), until: S.life + T.FEAR_LIFE, note: `afraid since ${f.label}` });
      } else {
        for (const [x, y] of [[f.a, f.b], [f.b, f.a]]) { const e = A.entry(x, y, false); if (e) A.scale(e, T.VENT); }
        if (W) parts.push(...afterSkirmish(f, W, L));
        else parts.push('both sides limped home');
      }
      const dn = f.dead.length;
      const txt = `${cap1(f.label)}: ${dn ? `${number(dn)} dead (${names(f.dead, 3)})` : 'nobody died'}${f.hurt.length ? `, ${number(f.hurt.length)} hurt` : ''}. ${cap1(parts.join('; '))}.`;
      f.result = txt;
      R.alert(dn ? 'bad' : 'warn', txt, { x: f.x, z: f.z, subject: f.dead[0] ?? f.leader, aside: dn >= 3 ? R.aside('fights:many', ['A bad day for the clans. A good day for the crows.', 'They will sing about this. Badly, and for a long time.'], 80) : undefined });
      f.phase = 'after'; f.t = 0;
      // who won reads on the map: the losers' banner falls, the winners' stays up while they cheer
      if (f.winner === 0 && f.banB) f.banB.falling = true;
      if (f.winner === 1 && f.banA) f.banA.falling = true;
      if (f.burnPending) f.torch = f.attackers.find((p) => standing(f, p)) ?? null;
      if (f.burnPending && !f.torch) doBurn(f);
      interrupt([...f.attackers, ...f.defenders]);
    }
    // the raiders' fire: the field burns when the torch reaches it (or at the end of the aftermath, whatever happens)
    function doBurn(f) {
      const fl = f.burnPending;
      if (!fl) return;
      f.burnPending = null;
      if (!f.burnLit && !fast()) look.burn(fl);
      f.burnLit = true;
      burnField(fl);
    }
    // a won raid: grain carried off, perhaps a field burnt or a roof torn down (real changes)
    function raidSpoils(f) {
      const out = [];
      const takers = api().groupHouseholds(f.a).filter((h) => f.attackers.some((p) => p.family === h));
      let loot = 0;
      for (const h of f.homes) { const k = Math.max(0, h.food) * T.LOOT_SHARE; h.food -= k; loot += k; }
      if (takers.length) for (const h of takers) h.food += loot / takers.length;
      if (loot > 0.2) out.push(`they carried off ${Math.round(loot * 10) / 10} years of grain`);
      const outright = f.plan.broke === 1 || !f.defenders.length;
      const r = (Math.abs(f.seed) % 1000) / 1000, r2 = (Math.abs(f.seed >> 10) % 1000) / 1000;
      // (the field is decided and told now; it burns when a raider's torch reaches it, a few seconds on: doBurn)
      if (outright && r < T.BURN_AFTER_RAID) { const fl = f.homes.flatMap((h) => h.fields.filter((b) => b.done))[0]; if (fl && fl.done && S.buildings.includes(fl)) { if (fast()) burnField(fl); else f.burnPending = fl; out.push(`${fl.family?.name ? `burnt the ${fl.family.name} family's crop` : 'burnt a field'}`); } }
      if (outright && r2 < T.ROOF_AFTER_RAID) { const h = f.homes.find((x) => x.home?.done); if (h && tearRoof(h)) out.push(`tore the roof off the ${h.name} hut`); }
      return out;
    }
    function afterSkirmish(f, W, L) {
      const A = api(), out = [`${gname(W)} won`];
      const Lside = L === f.a ? f.attackers : f.defenders;
      const lost = Lside.filter((p) => p.dead || f.gone.has(p)).length / Math.max(1, Lside.length);
      const la = A.groupMembers(L).filter((p) => p.stage !== 'child').length, wa = A.groupMembers(W).filter((p) => p.stage !== 'child').length;
      const lhs = A.groupHouseholds(L);
      const wv = new Set(A.groupHouseholds(W).map((h) => A.villageOfFamily(h)).filter(Boolean));
      if (L.type === 'clan' && W.type === 'clan' && lhs.length <= T.ABSORB_HOUSEHOLDS && lhs.every((h) => wv.has(A.villageOfFamily(h)))) {
        A.mergeClan(L, W, 'absorbed'); stats.absorbed++;
        out.push(`what was left of ${gname(L)} was taken in by ${gname(W)}`);
      } else if (lost >= T.FLEE_LOSS || (la <= T.FLEE_SMALL && wa >= 3 * la)) {
        const go = L.type === 'village' ? lhs.filter((h) => !A.groupHouseholds(W).some((w) => A.clanOfFamily(w) === A.clanOfFamily(h))) : lhs;
        for (const h of go) PA().leave(h, `they lost a fight with ${gname(W)} and dared not stay`, 'bad');
        if (go.length) { stats.fled++; out.push(`${gname(L)} packed up and left the land`); }
      } else {
        let paid = 0;
        for (const h of lhs) { const k = Math.max(0, h.food) * T.TRIBUTE_SHARE; h.food -= k; paid += k; }
        const whs = A.groupHouseholds(W);
        for (const h of whs) h.food += paid / Math.max(1, whs.length);
        for (const [x, y] of [[f.a, f.b], [f.b, f.a]]) { const e = A.entry(x, y, false); if (e) A.scale(e, T.SETTLED); }
        stats.paid++;
        out.push(`${gname(L)} paid ${Math.round(paid * 10) / 10} years of grain, and it is settled for now`);
      }
      return out;
    }
    function burnField(fl) {
      if (!fl || !fl.done || !S.buildings.includes(fl)) return false;
      let n = 0;
      while (!S.build.harvestStep(fl) && n++ < 200);
      fl.care = Math.min(fl.care, 0.15);
      return true;
    }
    // a hut's roof torn down: the thatch comes off and the family must raise it again
    function tearRoof(h) {
      const hut = h.home;
      // a cave has no roof to tear (caves.js homes have no build steps: raids on cave families threw here, 2026-11-13)
      if (!hut?.done || !S.buildings.includes(hut) || !Array.isArray(hut.steps)) return false;
      for (const m of S.people) if (m.inside === hut) PA().exitHome(m);
      const roof = hut.steps.map((s, i) => [s, i]).filter(([s]) => !s.ground && s.dy >= 2);
      if (!roof.length) return false;
      for (const [s] of roof) { S.build.put(hut.cx + s.dx, Math.round(hut.y) + s.dy, hut.cz + s.dz, 0, hut); S.land.scanColumn(hut.cx + s.dx, hut.cz + s.dz); }
      hut.next = roof[0][1]; hut.done = false; hut.progress = hut.next / hut.steps.length;
      if (!h.plans.includes(hut)) h.plans.push(hut);
      for (const m of h.members) R.story(m, 'The raiders tore the roof off our hut.');
      if (!fast()) for (let k = 0; k < 14; k++) look.puff(hut.cx, Math.round(hut.y) + 2.5, hut.cz, 0.9, 0xb89a68, 1.4, 3.2, 1.8);
      return true;
    }
    function callOffReason(f) {
      const g = api().gOf(f.a, f.b);
      if (!f.attackers.some((p) => !p.dead)) return { why: 'nobody', text: `Nobody was left to fight, so ${f.label} never happened.` };
      if (g < T.QUARREL_AT) return { why: 'calm', text: `${cap1(gname(f.a))} lost the will to fight, and ${f.label} was called off.` };
      if (f.phase === 'gather') {
        const w = S.predators.find((a) => !a.dead && a.state !== 'leave' && (dist(a, f.rally) < T.WOLF_SCARE || f.attackers.some((p) => !p.dead && dist(a, p) < T.WOLF_SCARE * 0.6)));
        if (w) return { why: 'wolf', text: `A wolf came out of the grass by the camp of ${gname(f.a)}. They took it as a bad sign and went home: ${f.label} is off.` };
      }
      return null;
    }
    function callOff(f, off) {
      R.moment.close(f.mid, { forget: true });
      stats.calledOff++;
      f.calledOff = off.why;
      for (const p of f.attackers) if (!p.dead && off.why !== 'nobody') R.story(p, off.why === 'calm' ? `Put down the club and went home. The anger had gone out of it.` : off.why === 'struck' ? `Saw ${f.leader?.name ?? 'the leader'} struck from a clear sky, and went home.` : off.why === 'wolf' ? 'Saw a wolf by the camp and went home. A bad sign.' : `Went home: ${f.label} was off.`);
      for (const p of f.plan?.dead.flat() ?? []) if (!p.dead) R.fateChanged(p, `die at ${Math.floor(p.age)} in ${f.label}`, off.why === 'calm' ? 'The anger went out of it.' : off.why === 'struck' ? `${f.leader?.name ?? 'The leader'} was struck down from the sky.` : off.why === 'wolf' ? 'A wolf frightened the war band home.' : 'It never happened.');
      R.alert('good', off.text, { x: f.x, z: f.z, subject: f.leader });
      f.winner = null; f.result = off.text;
      // how it reads: calmed, they lower their weapons and walk home; the leader struck before their eyes, they cower
      // and run; a wolf or trouble at home, they hurry back. Their banner comes down.
      if (!fast() && off.why !== 'nobody') {
        const face = f.kind === 'raid' ? f.target : f.brally ?? f.target;
        for (const p of f.attackers) if (!p.dead && !p.hidden) afterplay.set(p, off.why === 'calm' ? { kind: 'lower', face } : off.why === 'struck' ? { kind: 'cower', face: f.leaderFell ?? face } : { kind: 'home', speed: T1.RUN * 0.85, doing: off.why === 'wolf' ? 'hurrying home: a wolf, a bad sign' : 'hurrying home: trouble there' });
        if (f.kind === 'skirmish') for (const p of f.defenders) if (!p.dead && !p.hidden) afterplay.set(p, off.why === 'calm' ? { kind: 'lower', face: f.rally } : { kind: 'home', speed: T1.WALK, doing: 'going home: the fight is off' });
        if (f.banA) f.banA.falling = true;
      }
      end(f);
    }
    function end(f) {
      R.moment.close(f.mid, { forget: true });
      const i = active.indexOf(f); if (i >= 0) active.splice(i, 1);
      if (f.burnPending) doBurn(f);
      for (const [p, r] of [...roles]) if (r.fight === f) {
        roles.delete(p);
        if (p.dead) continue;
        if (r.role === 'hide' && p.hidden && p.fleeing === 'fight') p.fleeing = null; // out of hiding (in daylight they step out)
        if (f.phase !== 'after') { p.go = null; p.work = null; }
        if (!afterplay.has(p) && !p.go) disarm(p);
        crouch(p, false);
      }
      for (const p of f.hide) if (!p.dead && p.fleeing === 'fight') p.fleeing = null;
      if (f.banA) look.dropBanner(f.banA);
      if (f.banB) look.dropBanner(f.banB);
      if (f.kind === 'raid' || f.kind === 'skirmish') startHauls(f);
      f.phase = 'done'; f.endYear = year();
      R.signal('fight:end', { id: f.id, kind: f.kind, deaths: f.dead.length, winner: f.winner === 0 ? f.a : f.winner === 1 ? f.b : null, a: f.a, b: f.b, calledOff: f.calledOff ?? null, fight: f });
      done.push(f); if (done.length > 30) done.shift();
    }

    // ---------- the small ones: a quarrel, a theft, a field burnt ----------
    function tickQuarrel(f) {
      const all = [...f.attackers, ...f.defenders].filter((p) => !p.dead);
      if (f.phase === 'meet') {
        const there = all.filter((p) => dist(p, f.target) < 4).length;
        if (there >= Math.min(2, all.length) || f.t > (fast() ? 25 : 45)) { f.phase = 'argue'; f.t = 0; interrupt(all); if (f.brawl) { f.fighter = f.attackers[0]; f.victim = f.defenders[0]; f.blows = true; } }
        return;
      }
      if (f.phase === 'argue' && f.t >= TT('QUARREL_S')) {
        const A = api();
        A.add(f.b, f.a, T.INSULT, 'wrong', `${gname(f.a)} insulted them in ${when()}`); wronged(f.b, f.a, 'insult');
        let hurt = null;
        if (f.brawl) {
          const pa = powerOf(f.fighter), pb = powerOf(f.victim);
          hurt = rand() < pa / (pa + pb) ? f.victim : f.fighter;
          if (!hurt.dead) { A.wound(hurt, `hurt in ${f.label}`); f.hurt.push(hurt); stats.wounds++; R.story(hurt, `Came home from ${f.label} with a split lip and worse.`); A.add(hurt === f.victim ? f.b : f.a, hurt === f.victim ? f.a : f.b, T.WOUND, 'wrong', null); }
        }
        for (const p of all) R.story(p, `Had words with ${gname(f.attackers.includes(p) ? f.b : f.a)}. Things were said.`);
        const txt = `${cap1(gname(f.a))} and ${gname(f.b)} had a shouting match${hurt ? `, and it came to blows: ${hurt.name} was hurt` : ''}. Words were said that will not be forgotten.`;
        f.result = txt;
        R.signal('clan:wrong', { kind: 'quarrel', a: f.a, b: f.b, x: f.x, z: f.z, text: txt, hurt });
        R.alert('info', txt, { x: f.x, z: f.z, subject: f.leader });
        f.phase = 'after'; f.t = 0; interrupt(all);
        return;
      }
      if (f.phase === 'after' && f.t > 4) end(f);
    }
    function tickSneak(f) {
      const p = f.leader;
      if (p.dead) { end(f); return; }
      if (f.phase === 'sneak' && f.t > TT('SNEAK_MAX_S')) arrive(f);
      if (f.phase === 'take' && f.t >= 2.5) {
        const A = api();
        if (f.kind === 'theft') {
          if (f.caught && f.catcher && !f.catcher.dead) {
            f.phase = 'caught'; f.t = 0; interrupt([p, f.catcher]);
            S.mind.push(f.catcher, `${p.name}! A thief at our store!`);
            return;
          }
          const k = Math.max(0, f.house.food) * T.STEAL_SHARE;
          f.house.food -= k; p.family.food += k; f.loot = k;
          // they find the store lighter, and blame whoever they resent most (often, not always, the right ones)
          const actual = f.a;
          const blame = blamed(f.b, actual);
          A.add(f.b, blame, T.THEFT, 'wrong', `${gname(blame)} stole their grain in ${when()}`); wronged(f.b, blame, 'theft');
          const ea = A.entry(f.a, f.b, false); if (ea) A.scale(ea, T.VENT_SMALL);
          const txt = `${p.name} of ${gname(f.a)} ${k >= 0.05 ? `stole ${Math.round(k * 10) / 10} years of grain from` : 'broke into, and found nearly empty,'} the ${f.house.name} family's store. ${blame === actual ? `They know who did it.` : `They blame ${gname(blame)}. It was ${gname(actual)}.`}`;
          R.story(p, `Stole grain from the ${f.house.name} family.`);
          for (const m of f.house.members) if (!m.dead) R.story(m, `Our store was robbed. ${cap1(gname(blame))} did it, everyone says.`);
          f.result = txt;
          R.signal('clan:wrong', { kind: 'theft', a: f.a, b: f.b, blamed: blame, x: f.x, z: f.z, text: txt, amount: k });
          R.alert('warn', txt, { x: f.x, z: f.z, subject: p, aside: blame !== actual ? R.aside('fights:blame', ['Justice is blind. Also, apparently, not great at faces.', 'Wrong family. You could tell them. You will not.'], 100) : undefined });
        } else {
          burnField(f.field);
          A.add(f.b, f.a, T.BURN, 'wrong', `${gname(f.a)} burnt their crop in ${when()}`); wronged(f.b, f.a, 'burning');
          const ea = A.entry(f.a, f.b, false); if (ea) A.scale(ea, T.VENT_SMALL);
          const txt = `${p.name} of ${gname(f.a)} set fire to the ${f.field.family?.name ?? ''} family's crop. The grain is gone; the smoke told everyone who did it.`;
          R.story(p, `Burnt the crop of the ${f.field.family?.name ?? ''} family.`);
          for (const h of api().groupHouseholds(f.b)) if (h === f.field.family) for (const m of h.members) R.story(m, `${cap1(gname(f.a))} burnt our crop.`);
          f.result = txt;
          R.signal('clan:wrong', { kind: 'burning', a: f.a, b: f.b, x: f.x, z: f.z, text: txt, field: f.field });
          R.alert('warn', txt, { x: f.x, z: f.z, subject: p });
        }
        f.phase = 'home'; f.t = 0; interrupt([p]);
        return;
      }
      if (f.phase === 'caught' && f.t >= 2) {
        const A = api();
        A.wound(p, `beaten for stealing`); f.hurt.push(p); stats.wounds++;
        A.add(f.b, f.a, T.CAUGHT_THIEF + T.THEFT * 0.5, 'wrong', `${p.name} of ${gname(f.a)} tried to rob them in ${when()}`); wronged(f.a, f.b, 'insult');
        A.add(f.a, f.b, T.WOUND, 'wrong', null);
        const txt = `${f.catcher.name} caught ${p.name} of ${gname(f.a)} stealing from the ${f.house.name} family's store and beat ${p.sex === 'f' ? 'her' : 'him'} off.`;
        R.story(p, `Was caught stealing from the ${f.house.name} family, and beaten.`);
        R.story(f.catcher, `Caught ${p.name} stealing from our store.`);
        f.result = txt;
        R.signal('clan:wrong', { kind: 'theft', a: f.a, b: f.b, caught: true, x: f.x, z: f.z, text: txt });
        R.alert('warn', txt, { x: f.x, z: f.z, subject: p });
        release(f.catcher); interrupt([f.catcher]);
        f.phase = 'home'; f.t = 0; interrupt([p]);
        return;
      }
      if (f.phase === 'home' && (f.t > 20 || !roles.has(p))) end(f);
    }
    function blamed(b, actual) {
      const A = api();
      if (rand() < 0.6) return actual;
      let best = actual, bg = A.gOf(b, actual);
      for (const e of A.ledger.values()) if (e.a === b.id && e.g > bg) { const o = A.groupOfId(e.b); if (A.alive(o) && o.type === actual.type) { bg = e.g; best = o; } }
      return best;
    }

    // ---------- the god's other powers, as ways of taking a side ----------
    // Strike: a war leader struck down before blood is shed. Seen by the band, the raid ends; unseen,
    // they blame the other side and fight on harder. Any fighter's death before the clash rolls the fight again.
    R.on('person:death', (p, cause) => {
      afterplay.delete(p); armed.delete(p);
      for (const h of [...hauls]) if (h.by === p || (h.who === p && !h.dead)) endHaul(h);
      const r = roles.get(p);
      if (!r) return;
      const f = r.fight;
      roles.delete(p);
      if ((f.kind !== 'raid' && f.kind !== 'skirmish') || (f.phase !== 'gather' && f.phase !== 'march')) return;
      if (p === f.leader) {
        f.leaderFell = { x: p.x, z: p.z };
        const band = f.attackers.filter((q) => q !== p && !q.dead);
        const saw = cause === 'struck down' ? band.filter((q) => R.sees(q, p.x, p.z, 3)).length : 0;
        if (cause === 'struck down' && band.length && saw >= Math.max(1, Math.ceil(band.length / 2))) { f.pendingOff = { why: 'struck', text: `${p.name}, who led ${f.label}, was struck down from the sky in front of the band. They went home.` }; return; }
        f.leader = band.sort((x, y) => powerOf(y) - powerOf(x))[0] ?? null;
        if (cause === 'struck down' && f.leader) {
          f.inflamed = true;
          api().add(f.a, f.b, T.INFLAME, 'kill', `they believe ${gname(f.b)} killed ${p.name} in ${when()}`, { raw: true });
          R.alert('warn', `${p.name}, who led ${f.label}, fell dead where the band could not see. They blame ${gname(f.b)}, and ${f.leader.name} leads them on, angrier.`, { x: p.x, z: p.z, subject: f.leader });
        }
      }
      replan(f, `${p.name} died before the fighting began.`);
      f.text = momentText(f);
    });
    // Strike's card on a war leader: the same test the death hook above then applies (half the band sees it)
    R.on('forecast', ({ id, target, forecast }) => {
      if (id !== 'strike' || target?.kind !== 'person') return;
      const p = target.entity, r = p && roles.get(p);
      const f = r?.fight;
      if (!f || (f.kind !== 'raid' && f.kind !== 'skirmish') || (f.phase !== 'gather' && f.phase !== 'march')) return;
      if (p !== f.leader) { forecast.fates.push(`${p.name} was to fight in ${f.label}. One fewer fighter: who wins and who dies is rolled again.`); return; }
      const band = f.attackers.filter((q) => q !== p && !q.dead);
      const saw = band.filter((q) => R.sees(q, p.x, p.z, 3)).length;
      if (band.length && saw >= Math.max(1, Math.ceil(band.length / 2))) forecast.fates.push(`${p.name} leads ${f.label}. The band sees it happen (${number(saw)} of ${number(band.length)}): they go home and the raid is off.`);
      else if (band.length) {
        const next = band.slice().sort((x, y) => powerOf(y) - powerOf(x))[0];
        forecast.fates.push(`${p.name} leads ${f.label}. Too few of the band see it (${number(saw)} of ${number(band.length)}): they blame ${gname(f.b)}, and ${next.name} leads them on, angrier.`);
      } else forecast.fates.push(`${p.name} leads ${f.label} alone: it ends with ${p.name}.`);
    });
    R.on('step', () => { for (const f of [...active]) if (f.pendingOff) { const o = f.pendingOff; f.pendingOff = null; callOff(f, o); } });
    // A's hardships: trouble at home sends a gathering war band home
    R.on('hardship:start', (h) => {
      const fs = new Set(h?.families ?? []);
      if (!fs.size) return;
      for (const f of [...active]) if ((f.phase === 'gather' || f.phase === 'march') && api().groupHouseholds(f.a).some((x) => fs.has(x))) f.pendingOff = { why: 'hardship', text: `Trouble struck at home, and ${gname(f.a)} went back to face it: ${f.label} is off.` };
    });

    // ---------- fate: the all-knowing view of a fight ----------
    const scripted = (p) => {
      const r = roles.get(p);
      if (!r || !r.fight.plan || r.fight.phase === 'after' || r.fight.phase === 'done') return null;
      const f = r.fight, pl = f.plan;
      if (f.phase === 'clash') { const ev = f.events.slice(f.ei).find((e) => e.ref === p); return ev ? { f, kind: ev.kind } : { f, kind: null }; }
      const ev = pl.events.find((e) => e.ref === p && (e.kind === 'death' || e.kind === 'wound' || e.kind === 'out'));
      return { f, kind: ev?.kind ?? null };
    };
    R.on('end', (p) => {
      const s = scripted(p);
      if (!s || s.kind !== 'death') return null;
      const age = Math.floor(p.age);
      return { age, how: 'fight', words: `in ${s.f.label} at ${age}`, line: `Dies at ${age} in ${s.f.label}, unless something changes.` };
    });
    R.on('fate', (p) => {
      const out = [];
      const r = roles.get(p);
      if (R.trait(p, 'raider') || R.trait(p, 'firebrand')) out.push('Has a raider\'s temper: leads the clan\'s raids, and the clan\'s grudges build twice as fast.');
      if (!r) return out;
      const f = r.fight, s = scripted(p);
      if (r.role === 'hang') out.push(p.expectsHelp ? `Hangs back from ${f.label}: expects the stone to fight for ${p.sex === 'f' ? 'her' : 'him'}.` : `Stays out of ${f.label}.`);
      else if (r.role === 'hide') out.push(`Will hide from the raiders in ${f.label}.`);
      else if (f.kind === 'raid' || f.kind === 'skirmish') {
        out.push(`${p === f.leader ? 'Leads' : r.role === 'attack' ? 'Fights in' : 'Will defend against'} ${f.label}.`);
        if (s?.kind === 'wound') out.push('Will be wounded, and live.');
        else if (s?.kind === 'out') out.push('Will be beaten down, and crawl away alive.');
      } else if (f.kind === 'theft') out.push(r.role === 'catch' ? `Will catch ${f.leader.name} at the store.` : f.caught ? `Will be caught stealing, and beaten.` : `Will steal grain from the ${f.house.name} family and get away with it.`);
      else if (f.kind === 'burning') out.push(`Will burn the ${f.field.family?.name ?? ''} family's crop.`);
      else if (f.kind === 'quarrel') out.push(f.brawl && (p === f.fighter || p === f.victim) ? 'The quarrel will come to blows.' : 'Will have hard words, and nothing worse.');
      return out;
    });
    R.on('thoughts', (p) => {
      const r = roles.get(p);
      if (!r || p.asleep) return null;
      const f = r.fight;
      if (r.role === 'hang') return [[20, p.expectsHelp ? 'Let the stone deal with them. It always does.' : 'Not my fight.'], [20, 'Why should I bleed for this?']];
      if (r.role === 'hide') return [[20, 'Stay down. Stay quiet.'], [20, 'Please let them go past.']];
      if (f.kind === 'raid' || f.kind === 'skirmish') return [[18, r.role === 'attack' ? `Today ${gname(f.b)} pays.` : `Nobody takes what is ours.`], [18, 'Keep close. Keep together.']];
      return null;
    });

    // ---------- inspect, stats, queries ----------
    const view = (f) => ({
      id: f.id, kind: f.kind, phase: f.phase, a: f.a, b: f.b, x: f.x, z: f.z, rally: f.rally, target: f.target, place: f.place ?? null, label: f.label, why: f.why,
      text: f.text || f.label, leader: f.leader ?? null, attackers: f.attackers.filter((p) => !p.dead), defenders: f.defenders.filter((p) => !p.dead), hangBack: f.hangBack, hide: f.hide,
      dead: [...f.dead], hurt: [...f.hurt], moment: f.mid, momentOpen: R.moment.isOpen(f.mid), year: f.year,
      forecast: f.plan ? { deaths: f.plan.dead.flat().filter((p) => !p.dead), winner: f.plan.winner === 0 ? f.a : f.plan.winner === 1 ? f.b : null } : null,
      sideOf: (p) => (f.attackers.includes(p) ? 'attack' : f.defenders.includes(p) ? 'defend' : roles.get(p)?.fight === f ? roles.get(p).role : null),
      result: f.result ?? null, winner: f.winner === 0 ? f.a : f.winner === 1 ? f.b : null,
      major: !!f.major, // a raid or skirmish: someone may die (the screen drops 4x to 1x for these)
      praying: f.hangBack.filter((p) => !p.dead && p.expectsHelp && roles.get(p)?.fight === f), // kneeling for the stone to fight for them
    });
    R.answer('fights', () => active.map(view));
    R.answer('fightOf', (p) => { const r = roles.get(p); return r ? { fight: view(r.fight), role: r.role } : null; });
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const r = roles.get(e);
      if (!r) return;
      out.fight = { id: r.fight.id, kind: r.fight.kind, role: r.role, label: r.fight.label };
      R.section(out, { id: 'fight', title: 'Fight', order: 21, rows: [['In', r.fight.label], ['Side', r.role === 'attack' ? `with ${gname(r.fight.a)}` : r.role === 'defend' ? `with ${gname(r.fight.b)}` : r.role === 'hang' ? 'hanging back' : r.role === 'hide' ? 'hiding' : r.role]] });
    });
    R.on('stats', (st) => { st.fights = active.length; st.fightsByKind = { ...stats.byKind }; });
    R.on('step', ({ dt }) => { tick(dt); present(dt); });
    // ---------- what the eye sees besides the people: banners, dust, chips, the carried, the graves ----------
    let sweepT = 0;
    function chipFor(r, p) {
      if (r.hitAt == null || r.fight.t < r.hitAt) return;
      const q = r.hitOn;
      r.hitAt = null;
      if (q && !q.dead && dist(p, q) < 2.6) look.spark((p.x + q.x) / 2, (q.y ?? 16) + 1.6, (p.z + q.z) / 2, 3);
    }
    let _dt = 0;
    // a blessed weapon sheds a little golden light now and then (Bless weapons reads on the blessed side)
    function shimmer(p) { if (p.F?.weaponKey?.endsWith(':1') && !p.hidden && rand() < _dt * 2.2) look.puff(p.x, (p.groundY ?? p.y ?? 16) + 1.1, p.z, 0.32, 0xffd860, 0.9, 0.9, 0.9); }
    function flicker(p) { const fl = p.F?.weaponCur?.userData?.flame; if (fl) fl.scale.set(1, 0.8 + Math.sin((S.clockT ?? 0) * 13 + p.x) * 0.25, 1); }
    function placeBanner(b, carrier, plant) {
      if (!b) return;
      if (b.falling) { b.on = true; return; }
      if (carrier && !carrier.dead && !carrier.hidden) {
        const ry = carrier.ry ?? 0;
        b.on = true; b.x = carrier.x - Math.sin(ry) * 0.45 + Math.cos(ry) * 0.35; b.z = carrier.z - Math.cos(ry) * 0.45 - Math.sin(ry) * 0.35;
        b.y = carrier.groundY ?? carrier.y ?? look.groundY(b.x, b.z); b.yaw = ry;
      } else if (plant) { if (!b.on || b.planted !== plant) { b.on = true; b.planted = plant; b.x = plant.x; b.z = plant.z; b.y = look.groundY(plant.x, plant.z); } }
      else b.on = false;
    }
    function present(dt) {
      if (fast()) return;
      let major = false;
      for (const f of active) {
        if (!f.major) continue;
        major = true;
        placeBanner(f.banA, f.leader, f.rally);
        placeBanner(f.banB, f.kind === 'skirmish' ? f.dleader : null, f.kind === 'raid' ? (f.alarm ? f.stopB : null) : f.brally);
        // dust: kicked up by the marching band, hanging over the melee
        const k = f.phase === 'clash' ? 3.2 : f.phase === 'march' ? 2.2 : 0.6;
        for (const p of f.attackers) if (!p.dead && !p.hidden && (p.moving || f.phase === 'clash') && rand() < dt * k) look.puff(p.x, p.groundY ?? p.y ?? 16, p.z, f.phase === 'clash' ? 0.6 : 0.45);
        for (const p of f.defenders) if (!p.dead && !p.hidden && (p.moving || f.phase === 'clash') && rand() < dt * k) look.puff(p.x, p.groundY ?? p.y ?? 16, p.z, f.phase === 'clash' ? 0.6 : 0.45);
      }
      // the day crawls while a raid or skirmish is on, so that it is fought in daylight
      if (major) S.dayClock -= dt * (1 - T.DAY_SLOW);
      // chips where an ordinary blow lands (the telling blows burst bigger: runEvent)
      roles.forEach(chipFor);
      // the dead and the beaten, carried or dragged behind whoever brings them home
      for (const h of hauls) {
        if (h.phase !== 'carry' || h.done) continue;
        const by = h.by, w = h.who, ry = by.ry ?? 0;
        w.x = by.x - Math.sin(ry) * 0.95; w.z = by.z - Math.cos(ry) * 0.95;
        w.ry = h.dead ? ry + Math.PI / 2 : ry + Math.PI;
      }
      // the fallen nobody came for are buried where they lay
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i];
        if (b.done || !S.people.includes(b.p)) { bodies.splice(i, 1); continue; }
        if (!b.hauled && b.p.deadT >= T.BODY_S - 0.4) { look.grave(b.p.x, b.p.z, b.p.ry ?? 0); b.done = true; }
      }
      // a torch flickers; weapons are put down by anyone no longer in a fight
      armed.forEach(flicker);
      _dt = dt; armed.forEach(shimmer);
      sweepT -= dt;
      if (sweepT <= 0) { sweepT = 2; for (const p of [...armed]) if (p.dead || (!roles.has(p) && !afterplay.has(p) && !p.go)) disarm(p); }
      look.tick(dt);
    }
    R.on('year', rollYear);
    R.on('activity', claim);
    // the API the other C files and the console use (game.modules.sim.ask('fights:api'))
    const fapi = {
      T, active, pending, roles, done, stats, start, queue, preview, plan, sides, replan, levelFor, willing, hangers, callOff, groupBusy, momentText, view, end,
      powerOf, targetHomes, log, look, afterplay, hauls, bodies, armed,
    };
    R.answer('fights:api', () => fapi);
    // the clans module reads the join thresholds for its inspector
    const tryLink = () => { const A = api(); if (A) A.fightT = T; };
    tryLink();
    R.on('phase:start', tryLink);
  },
};
