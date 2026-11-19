// B. Minds: commandments. Six standing instructions, two active at a time
// (STAGE2-PLAN choice). Each person obeys in proportion to their own faith,
// even when the rule is hurting them; low faith, they ignore it (DESIGN.md).
// Issuing or changing them is the power `commandment` (dock: false, a panel's
// act through god.perform), a voice from the stone heard by everyone awake.
//
// Obedience (obey): 0 at faith OBEY_FROM, 1 at OBEY_FULL, cut by up to
// DOUBTER_CUT in strong doubters (skepticism 60 to 90), halved again while
// "doubt rules" the balance. Children do not keep commandments.
// Each commandment has a real benefit and a real way to hurt; numbers below.
import { clamp, smooth, she, her, cap1, settled, isAdult, dist, mid, graded, ungraded, pct, chanceText, names } from './science-util.js';
import { TUNE_FORCES } from './forces.js';

export const TUNE_COMMANDMENTS = {
  MAX_ACTIVE: 2,
  OBEY_FROM: 15, OBEY_FULL: 85,   // faith: ignores below, obeys fully above
  DOUBTER_CUT: 0.5,               // a strong doubter (skepticism 90) obeys this much less
  DOUBT_BAND_OBEY: 0.5,           // while "doubt rules", everyone obeys this fraction
  ISSUE_FAITH: 5, ISSUE_DOUBT: 3, // each who hears the stone speak: faith +, doubt -
  ISSUE_AGAIN_YEARS: 20, ISSUE_AGAIN: 0.4, // spoken again within this many calendar years: this much of the effect
  // Store grain
  STORE_MUL: 1.3,                 // store cap x this at full obedience
  SEAL_ABOVE: 2, SEAL_RATE: 0.3, JAR_MAX: 6, // seal this share a life year of the store above SEAL_ABOVE years, up to JAR_MAX years
  OPEN_BELOW: 1, OPEN_RATE: 2,    // below OPEN_BELOW years of food, the jar is opened at OPEN_RATE x (1 - obedience) a life year
  STORE_ACT: 0.15,                // chance an act goes to sealing jars (x obedience)
  // Train fighters
  TRAIN_ACT: 0.3, TRAIN_GAIN: 0.03, TRAIN_DECAY: 0.15, TRAIN_STRENGTH: 0, // the three forces: training now builds a person's strength
                                  // (forces.js TRAIN a life year x how trained), and strength sets how well they fight (was +0.4 here)
  // Settle by water
  WATER_CLOSE: 8, WATER_LOOK: 36, MARSH_SICK: 1.3, // a new home further than WATER_CLOSE from water moves to a free site within WATER_LOOK
  // Honour thinkers
  HONOUR_THINK: 1.6, HONOUR_IDLE: 0.35, TITHE: 0.08, RESENT_HAPPY: -6, RESENT_GRUDGE: 1.2,
  // Keep the peace
  PEACE_GRUDGE: 0.4, PEACE_FIGHT: 0.4, PEACE_ACT: 0.1,
  // Tend the stone
  TEND_ACT: 0.2, TEND_FAITH: 0.25, TEND_HAPPY: 3, TEND_LASTS: 3, // faith: was 0.8 against the old fade of -0.5 a year (faith.js now fades -0.1, slower still for tenders)
};
const C = TUNE_COMMANDMENTS;

export const COMMANDMENTS = [
  { id: 'store-grain', name: 'Store grain', says: 'Store grain.',
    gains: () => `Families seal spare grain in jars beyond the store's limit, and stores hold up to ${pct(C.STORE_MUL - 1)} more: a famine finds food put by.`,
    hurts: () => 'In a hungry year the devout keep the jars sealed and go hungry beside them. Time goes to sealing jars.' },
  { id: 'train-fighters', name: 'Train fighters', says: 'Train to fight.',
    gains: () => `Grown-ups drill with spears and grow strong: a fully trained grown-up gains about ${Math.round(TUNE_FORCES.TRAIN * 5)} strength every 10 years, and strength wins fights, outruns wolves and lands spears (training fades slowly when they stop).`,
    hurts: () => 'Every drill is time taken from the fields and the building.' },
  { id: 'settle-by-water', name: 'Settle by water', says: 'Live by the water.',
    gains: () => `A new home planned more than ${C.WATER_CLOSE} steps from water is moved down to the bank, where the bank has room: shorter walks for water, happier homes, the best of irrigation.`,
    hurts: () => `They crowd the banks: damp huts make sickness ${C.MARSH_SICK} times as likely, floods reach them first, and flat ground for fields runs short.` },
  { id: 'honour-thinkers', name: 'Honour thinkers', says: 'Honour those who think.',
    gains: () => `The faithful feed and spare the thinkers: thinking up to ${C.HONOUR_THINK + 1} times as fast.`,
    hurts: () => `Thinkers sit and ponder instead of working; the faithful give ${pct(C.TITHE)} of their store a year to them and, going short in a bad year, resent it (happiness ${C.RESENT_HAPPY}, grudges ${C.RESENT_GRUDGE} times as fast).` },
  { id: 'keep-the-peace', name: 'Keep the peace', says: 'Keep the peace.',
    gains: () => `Grudges build up to ${pct(1 - C.PEACE_GRUDGE)} slower; the devout go and make peace with their neighbours.`,
    hurts: () => `A wrong goes unanswered: the most devout are only ${pct(C.PEACE_FIGHT)} as willing to fight, even when raided.` },
  { id: 'tend-the-stone', name: 'Tend the stone', says: 'Tend the stone.',
    gains: () => `People go and tend the stone: those who did keep their faith (+${C.TEND_FAITH} a year instead of fading) and are a little happier (+${C.TEND_HAPPY}).`,
    hurts: () => 'Time at the stone is time away from work, and the far-off walk a long way. While faith is too low, nobody goes.' },
];
const BY_ID = Object.fromEntries(COMMANDMENTS.map((c) => [c.id, c]));

export default {
  id: 'commandments',
  tune: TUNE_COMMANDMENTS,
  init(R) {
    const { S } = R;
    const PA = () => S.peopleApi;
    const K = { active: [], lastIssue: -1e9, issued: 0, waterLog: [] };
    const on = (id) => K.active.includes(id);
    const doubtRules = () => R.ask('balance')?.band === 'doubt';

    // ---------- obedience ----------
    function obeyBase(p, band) {
      if (!p || p.dead || p.kind !== 'person' || !isAdult(p)) return 0;
      const f = clamp((p.faith - C.OBEY_FROM) / (C.OBEY_FULL - C.OBEY_FROM));
      return f * (1 - C.DOUBTER_CUT * smooth(p.skep, 60, 90)) * (band ? C.DOUBT_BAND_OBEY : 1);
    }
    let bandDoubt = false; // refreshed every half game second (a who-function must stay cheap)
    const obey = (p) => obeyBase(p, bandDoubt);
    const famObey = (f) => {
      if (!f?.members) return 0;
      let s = 0, n = 0;
      for (const m of f.members) if (!m.dead && isAdult(m)) { s += obey(m); n++; }
      return n ? s / n : 0;
    };
    // a subject of the grudge stat may be a person, a family or a clan
    const obeyOf = (s) => (s?.kind === 'person' ? obey(s) : s?.members ? famObey(s) : 0);
    const mind = (e) => R.data(e, 'cmd', () => ({}));

    // ---------- the modifiers, on while a commandment is active ----------
    function applyMods() {
      ungraded(R, 'store', 'commandments:store');
      ungraded(R, 'strength', 'commandments:train');
      R.unmod('sickness', 'commandments:marsh');
      ungraded(R, 'think', 'commandments:honour');
      R.unmod('happy', 'commandments:resent'); R.unmod('grudge', 'commandments:resent');
      ungraded(R, 'grudge', 'commandments:peace'); ungraded(R, 'fight', 'commandments:peace');
      R.unmod('faithDrift', 'commandments:tend'); R.unmod('happy', 'commandments:tend');
      // training and the damp banks outlast the commandment: they are in the people now
      graded(R, 'strength', 'commandments:train', { add: C.TRAIN_STRENGTH, note: 'trained to fight' }, (p) => p?.ext?.cmd?.trained ?? 0);
      R.mod('sickness', 'commandments:marsh', { mul: C.MARSH_SICK, who: (p) => !!p?.family?.ext?.cmd?.byWater, note: 'a damp hut on the bank' });
      R.mod('faithDrift', 'commandments:tend', { add: C.TEND_FAITH, who: (p) => (p?.ext?.cmd?.tendedAt ?? -1e9) > S.life - C.TEND_LASTS, note: 'tended the stone' });
      R.mod('happy', 'commandments:tend', { add: C.TEND_HAPPY, who: (p) => (p?.ext?.cmd?.tendedAt ?? -1e9) > S.life - C.TEND_LASTS, note: 'tended the stone' });
      if (on('store-grain')) graded(R, 'store', 'commandments:store', { mul: C.STORE_MUL, note: 'Store grain' }, famObey);
      if (on('honour-thinkers')) {
        graded(R, 'think', 'commandments:honour', { mul: 1 + C.HONOUR_THINK, note: 'Honour thinkers' }, (p) => ((p?.ext?.mind?.rate ?? 0) >= 0.3 ? honour : 0));
        const resent = (p) => p?.kind === 'person' && p.hunger > 0 && obey(p) >= 0.3 && (p.ext?.mind?.rate ?? 0) < 0.3;
        R.mod('happy', 'commandments:resent', { add: C.RESENT_HAPPY, who: resent, note: 'fed the thinkers and went short' });
        R.mod('grudge', 'commandments:resent', { mul: C.RESENT_GRUDGE, who: resent, note: 'fed the thinkers and went short' });
      }
      if (on('keep-the-peace')) {
        graded(R, 'grudge', 'commandments:peace', { mul: C.PEACE_GRUDGE, note: 'Keep the peace' }, obeyOf);
        graded(R, 'fight', 'commandments:peace', { mul: C.PEACE_FIGHT, note: 'Keep the peace' }, obey);
      }
    }
    let honour = 0; // the people's mean obedience (Honour thinkers), refreshed with the band
    applyMods();

    // ---------- every update ----------
    let scanT = 0;
    R.on('step', ({ dt, dLife }) => {
      scanT -= dt;
      if (scanT <= 0) {
        scanT = 0.5;
        bandDoubt = doubtRules();
        let s = 0, n = 0;
        for (const p of S.people) if (settled(p) && isAdult(p)) { s += obey(p); n++; }
        honour = n ? s / n : 0;
        if (on('settle-by-water')) for (const f of S.families) checkWater(f);
      }
      if (!(dLife > 0)) return;
      let tithe = null;
      if (on('honour-thinkers')) {
        tithe = { pool: 0, to: [], has: new Set() };
        for (const f of S.families) {
          if (f.state !== 'settled') continue;
          const k = f.members.filter((q) => !q.dead && (q.ext?.mind?.rate ?? 0) >= 0.3).length;
          if (k) { tithe.to.push([f, k]); tithe.has.add(f); }
        }
        if (!tithe.to.length) tithe = null; // nobody to honour: nothing is given
      }
      for (const f of S.families) {
        if (f.state !== 'settled') continue;
        const need = Math.max(0.01, PA().needOf(f));
        const m = mind(f);
        const o = famObey(f);
        m.jar = m.jar ?? 0;
        // Store grain: seal the surplus; open the jar when food runs low, the devout slowly or never
        if (on('store-grain') && f.food > need * C.SEAL_ABOVE && m.jar < need * C.JAR_MAX) {
          const put = Math.min(C.SEAL_RATE * o * (f.food - need * C.SEAL_ABOVE) * dLife, need * C.JAR_MAX - m.jar);
          f.food -= put; m.jar += put;
        }
        if (m.jar > 0) {
          const room = Math.max(0, need * R.value('store', f, R.T.STORE_MAX_YEARS) - f.food);
          let out = 0;
          if (!on('store-grain')) out = Math.min(m.jar, room, need * dLife * 4);           // no rule: eaten as needed
          else if (f.food < need * C.OPEN_BELOW) out = Math.min(m.jar * Math.min(1, (1 - o) * C.OPEN_RATE * dLife), room);
          if (out > 0) {
            if (!m.openedSaid && on('store-grain') && f.food < need * 0.3 && o < 0.5) { m.openedSaid = true; for (const q of f.members) if (!q.dead) R.story(q, 'Opened the sealed jars in a hungry year, rule or no rule.'); }
            f.food += out; m.jar -= out;
          }
          if (on('store-grain') && f.food < need * 0.2 && m.jar > need && o >= 0.5 && !m.hungrySaid) {
            m.hungrySaid = true;
            for (const q of f.members) if (!q.dead) { R.story(q, 'Went hungry with grain sealed in the jars. The stone said store it.'); R.signal('mind:hurt', { person: q, id: 'store-grain', text: 'Went hungry beside sealed jars, as the stone said' }); }
            R.alert('warn', `The ${f.name} family are going hungry beside sealed jars of grain: the stone told them to store it, and they are devout.`, { x: f.home?.cx, z: f.home?.cz, subject: f.leader?.() });
          }
          if (f.food >= need) { m.hungrySaid = false; m.openedSaid = false; }
        }
        // Honour thinkers: the faithful give to the thinkers' families
        if (tithe && !tithe.has.has(f) && o > 0 && f.food > 0) { const g = Math.min(f.food, f.food * C.TITHE * o * dLife); f.food -= g; tithe.pool += g; }
      }
      if (tithe && tithe.pool > 0) {
        const n = tithe.to.reduce((s, [, k]) => s + k, 0);
        for (const [f, k] of tithe.to) f.food += tithe.pool * k / n;
      }
      // training fades
      for (const p of S.people) { const c = p.ext?.cmd; if (c?.trained > 0) c.trained = Math.max(0, c.trained - C.TRAIN_DECAY * dLife); }
    });

    // Settle by water: a new home not yet begun is moved nearer the water by an obedient family
    function checkWater(f) {
      if (f.state !== 'settled' || !f.home || f.home.done || (f.home.next ?? 0) > 0) return;
      const m = mind(f);
      if (m.waterChecked === f.home) return;
      m.waterChecked = f.home; m.ignoredWater = false; m.noWaterSite = false; m.nearAlready = false;
      const L = S.land, h = f.home;
      const wd = L.wdistAt(h.cx, h.cz);
      if (wd <= C.WATER_CLOSE) { m.nearAlready = true; return; }
      const o = famObey(f);
      K.waterLog.push({ year: Math.floor(S.year), family: f.name, o: Math.round(o * 100) / 100, wd: Math.round(wd) });
      if (K.waterLog.length > 100) K.waterLog.shift();
      const entry = K.waterLog[K.waterLog.length - 1];
      if (Math.random() >= o) { m.ignoredWater = true; entry.result = 'ignored'; return; }
      entry.result = 'no free site nearer the water';
      const info = { huts: S.buildings.filter((b) => b.kind === 'hut' && b !== h).map((b) => ({ x: b.cx, z: b.cz })), stone: S.stone.centre, protectedAt: (x, z) => S.isProtected(x, z) };
      // the best site within WATER_LOOK of the chosen one that is clearly nearer the water (rare: a new home)
      let best = null;
      const at = { x: h.cx, z: h.cz }, LR = C.WATER_LOOK;
      for (let dz = -LR; dz <= LR; dz += 2) for (let dx = -LR; dx <= LR; dx += 2) {
        if (dx * dx + dz * dz > LR * LR) continue;
        const x = Math.floor(at.x + dx), z = Math.floor(at.z + dz);
        if (!L.inside(x, z) || L.wdistAt(x, z) > Math.min(C.WATER_CLOSE + 2, wd - 3)) continue;
        const s = L.hutSite(x, z, info);
        if (s.ok && (!best || s.score > best.score)) best = { ...s, x, z };
      }
      if (!best) { m.noWaterSite = true; return; }
      S.build.removeBuilding(h);
      f.plans = f.plans.filter((b) => b !== h);
      f.home = S.build.planHut(f, best.x, best.z);
      f.plans.push(f.home);
      m.waterChecked = f.home; m.byWater = true;
      entry.result = `moved to ${Math.round(best.wd)} steps from the water`;
      for (const q of f.members) if (!q.dead) { R.story(q, `Moved the new hut down to the water, ${Math.round(best.wd)} steps from it instead of ${Math.round(wd)}: the stone said live by the water.`); q.go = null; q.work = null; }
    }

    // ---------- the day: commandments that reorder it (activity hook) ----------
    const busy = (p) => { if (p.work) p.work.mind = 'busy'; };
    const goWork = (p, x, z, pose, dur, doing, o = {}) => {
      const A = PA();
      A.goTo(p, x, z, { doing: o.walking ?? doing, r: o.r ?? 0.8, then: () => { A.work(p, pose, dur, { doing, face: o.face, tick: o.tick, then: o.then }); if (o.think) p.work.mind = 'think'; else busy(p); } });
      return true;
    };
    R.on('activity', (p) => {
      if (!K.active.length || !isAdult(p) || p.fleeing || PA().isNight()) return false;
      const t = S.dayT;
      if (t >= R.T.PRAY_START && t < R.T.PRAY_END) return false; // the prayer hour is left alone
      const o = obey(p);
      if (o <= 0.01) return false;
      const f = p.family, home = f.home ? (f.home.door ?? mid(f.home)) : p;
      const r = Math.random;
      // Honour thinkers: the honoured sit and ponder (it counts as thinking) while others work
      if (on('honour-thinkers') && (p.ext?.mind?.rate ?? 0) >= 0.3 && r() < C.HONOUR_IDLE * honour) {
        const s = PA().spotNear(home.x, home.z, 1, 3);
        return goWork(p, s.x, s.z, 'sit', 6 + r() * 3, 'pondering, while the faithful do the work', { think: true });
      }
      if (on('train-fighters') && p.stage === 'adult' && r() < C.TRAIN_ACT * o) {
        const c = S.fire?.done && f.home && dist(mid(S.fire), mid(f.home)) < 40 ? mid(S.fire) : home;
        const s = PA().spotNear(c.x, c.z, 3, 7);
        const m = mind(p);
        return goWork(p, s.x, s.z, 'chop', 6 + r() * 3, 'drilling with a spear', { walking: 'going to drill with the others', tick: (dt) => { m.trained = Math.min(1, (m.trained ?? 0) + C.TRAIN_GAIN * dt); return false; } });
      }
      if (on('tend-the-stone') && !bandDoubt && r() < C.TEND_ACT * o) {
        const c = S.stone.centre, a = r() * 6.283, rr = 4.5 + r() * 3;
        const m = mind(p);
        return goWork(p, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, 'pick', 5 + r() * 2, 'tending the stone', { walking: 'walking to tend the stone', face: c, then: () => { m.tendedAt = S.life; } });
      }
      if (on('store-grain') && f.home?.done) {
        const need = PA().needOf(f), m = mind(f);
        if (f.food > need * C.SEAL_ABOVE && (m.jar ?? 0) < need * C.JAR_MAX && r() < C.STORE_ACT * o) return goWork(p, f.home.door.x, f.home.door.z, 'pick', 4, 'sealing grain in jars');
      }
      if (on('keep-the-peace') && r() < C.PEACE_ACT * o) {
        let best = null, bd = 60;
        for (const b of S.buildings) if (b.kind === 'hut' && b.done && b.family && b.family !== f) { const d = Math.hypot(b.cx - p.x, b.cz - p.z); if (d < bd) { bd = d; best = b; } }
        if (best) {
          const other = best.family;
          return goWork(p, best.door.x, best.door.z, 'sit', 4, `making peace with the ${other.name} family`, { then: () => {
            p.happy = Math.min(100, p.happy + 2);
            for (const q of other.members) if (!q.dead && dist(q, p) < 10) { q.happy = Math.min(100, q.happy + 2); S.mind.push(q, `${p.name} came by to make peace. We were not even fighting.`); }
          } });
        }
      }
      return false;
    });

    // ---------- the act: issuing or changing commandments ----------
    // args: { active: [ids] } (the whole new set) | { id } (add one; the older goes if two are active) | { remove: id } | { clear: true }
    function nextSet(args = {}) {
      let set = [...K.active];
      if (args.commandment) {
        // the HUD's shape: { commandment, on, replace }: give it (replacing `replace`, or the older if two stand) or withdraw it
        const id = args.commandment;
        if (!BY_ID[id]) return { error: `There is no commandment "${id}".` };
        if (args.on === false) set = set.filter((x) => x !== id);
        else if (!set.includes(id)) {
          if (args.replace && set.includes(args.replace)) set = set.filter((x) => x !== args.replace);
          set.push(id);
          while (set.length > C.MAX_ACTIVE) set.shift();
        }
      } else if (Array.isArray(args.active)) set = args.active.filter((id) => BY_ID[id]);
      else if (args.id) { if (!BY_ID[args.id]) return { error: `There is no commandment "${args.id}".` }; if (!set.includes(args.id)) { set.push(args.id); while (set.length > C.MAX_ACTIVE) set.shift(); } }
      else if (args.remove) set = set.filter((id) => id !== args.remove);
      else if (args.clear) set = [];
      else return { error: 'Choose a commandment to give or withdraw.' };
      set = [...new Set(set)];
      if (set.length > C.MAX_ACTIVE) return { error: `Only ${C.MAX_ACTIVE} commandments can stand at once.` };
      if (set.length === K.active.length && set.every((id) => K.active.includes(id))) return { error: 'Those are already the commandments.' };
      return { set, added: set.filter((id) => !K.active.includes(id)), removed: K.active.filter((id) => !set.includes(id)) };
    }
    const again = () => (S.year - K.lastIssue < C.ISSUE_AGAIN_YEARS ? C.ISSUE_AGAIN : 1);
    const voice = (set) => (set.length ? set.map((id) => BY_ID[id].says).join(' ') : 'Forget what I told you.');
    function spec(act) {
      const k = act?.again ?? again();
      const words = act?.words ?? voice(K.active);
      return {
        r: 1000, faith: C.ISSUE_FAITH * k, doubt: -C.ISSUE_DOUBT * k, early: 1, hooks: false,
        thought: (p) => (p.skep > 70 ? `The stone spoke: "${words}" I am hearing things. Or am I?` : `The stone spoke! "${words}"`),
        story: `Heard the stone speak: "${words}"`,
        report(seen) {
          if (seen.length) R.alert('info', `${seen.length === 1 ? 'One person' : `${cap1(R.number(seen.length))} people`} heard the stone speak: "${words}" Their faith grew a little.`, { x: S.stone.centre.x, z: S.stone.centre.z });
          else R.alert('info', `The stone spoke, "${words}", and nobody was awake to hear it. They will hear of it by morning; only their faith does not move.`, { x: S.stone.centre.x, z: S.stone.centre.z });
        },
      };
    }
    R.witnessKind('commandment', spec);
    // how many would follow each commandment once this is heard (the witnesses' faith moves first)
    function followers(id, sp, seen) {
      const heard = new Set(seen);
      const out = { close: 0, part: 0, ignore: 0 };
      for (const p of S.people) {
        if (!settled(p) || !isAdult(p)) continue;
        const was = p.faith, ws = p.skep;
        if (heard.has(p)) { p.faith = Math.max(0, Math.min(100, p.faith + sp.faith)); p.skep = Math.max(0, Math.min(100, p.skep + sp.doubt)); }
        const o = obey(p);
        p.faith = was; p.skep = ws;
        if (o >= 0.6) out.close++; else if (o >= 0.2) out.part++; else out.ignore++;
      }
      return out;
    }
    function forecast(t) {
      const n = nextSet(t?.args ?? {});
      if (n.error) return R.refuse(n.error);
      const c = S.stone.centre;
      const k = again(), sp = spec({ again: k, words: voice(n.set) });
      const w = R.describeWitness(sp, c.x, c.z, 1000);
      const gains = [], costs = [];
      for (const id of n.added) {
        const d = BY_ID[id], f = followers(id, sp, w.seen);
        gains.push(`${d.name}: ${d.gains()}`);
        gains.push(`Of ${f.close + f.part + f.ignore} grown-ups, ${f.close} will follow it closely, ${f.part} in part, ${f.ignore} will ignore it${bandDoubt ? ' (too little faith: everyone obeys half as much)' : ''}.`);
        costs.push(`${d.name}: ${d.hurts()}`);
      }
      for (const id of n.removed) {
        const d = BY_ID[id];
        gains.push(`${d.name} is withdrawn: ${id === 'store-grain' ? 'the jars are opened as needed.' : id === 'train-fighters' ? 'the drilling stops (training fades slowly).' : id === 'settle-by-water' ? 'new homes go where the land suits them.' : 'its good and its harm both stop.'}`);
      }
      if (k < 1) costs.push(`You spoke less than ${C.ISSUE_AGAIN_YEARS} years ago: it moves them only ${pct(k)} as much this time.`);
      costs.push(...w.costs);
      return { ok: true, gains, costs, who: w.seenBy ? `Everyone awake hears it: ${w.seenBy} ${w.seenBy === 1 ? 'person' : 'people'}. Those asleep hear of it by morning; only the hearers' faith moves.` : 'Everyone is asleep. They will hear of it by morning; nobody\'s faith moves.',
        seenBy: w.seenBy, fates: [], confirm: 'click', set: n.set, added: n.added, removed: n.removed };
    }
    function carryOut(t) {
      const n = nextSet(t?.args ?? {});
      if (n.error) return { ok: false, text: n.error };
      const words = voice(n.set);
      const k = again();
      K.active = n.set; K.lastIssue = S.year; K.issued++;
      applyMods();
      // the witness that follows uses these words and this strength
      R.witnessKind('commandment', () => spec({ again: k, words }));
      R.signal('mind:commandments', { active: [...K.active] });
      const c = S.stone.centre;
      const text = n.set.length ? `The commandments now: ${n.set.map((id) => BY_ID[id].name).join(' and ')}.` : 'No commandments stand now.';
      R.alert('info', text, { x: c.x, z: c.z });
      return { ok: true, text, x: c.x, z: c.z, r: 1000, active: [...K.active] };
    }
    R.power({ id: 'commandment', forecast, carryOut });

    // ---------- queries ----------
    R.answer('obedience', (p, id) => (id && !on(id) ? 0 : obey(p)));
    R.answer('commandments', () => {
      // obedience is the same for every commandment (it follows faith), so it is counted once
      let close = 0, part = 0, ignore = 0, half = 0;
      for (const p of S.people) { if (!settled(p) || !isAdult(p)) continue; const o = obey(p); if (o >= 0.5) half++; if (o >= 0.6) close++; else if (o >= 0.2) part++; else ignore++; }
      const of = close + part + ignore;
      const all = COMMANDMENTS.map((d) => ({ id: d.id, name: d.name, says: d.says, benefit: d.gains(), risk: d.hurts(), gains: d.gains(), hurts: d.hurts(), active: on(d.id),
        obey: half, obeyedBy: half, of, followers: { close, part, ignore } }));
      return { active: [...K.active], max: C.MAX_ACTIVE, all, lastIssued: K.lastIssue > -1e8 ? R.yearLabel(K.lastIssue) : null };
    });
    R.answer('jarOf', (f) => mind(f).jar ?? 0);

    // ---------- stats, inspect, thoughts ----------
    R.on('stats', (st) => { st.commandments = K.active; });
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person' || !K.active.length) return;
      const o = obey(e), m = e.ext?.cmd;
      out.obedience = Object.fromEntries(K.active.map((id) => [id, Math.round(o * 100) / 100]));
      const rows = K.active.map((id) => [BY_ID[id].name, !isAdult(e) ? 'a child: keeps no rules' : o >= 0.6 ? `follows it closely (${pct(o)})` : o >= 0.2 ? `follows it in part (${pct(o)})` : `ignores it (${pct(o)})`]);
      if (m?.trained > 0.02) rows.push(['Trained', pct(m.trained)]);
      const jar = e.family?.ext?.cmd?.jar ?? 0;
      if (jar > 0.05) rows.push(['Sealed jars', `${Math.round(jar * 10) / 10} years of eating`]);
      R.section(out, { id: 'commandments', title: 'Commandments', rows, order: 32 });
    });
    R.on('thoughts', (p) => {
      if (p.asleep || !K.active.length || !isAdult(p)) return null;
      const o = obey(p), out = [];
      const id = K.active[Math.floor(Math.random() * K.active.length)], d = BY_ID[id];
      if (o >= 0.6) {
        out.push([5, `"${d.says}" The stone said it, so we do it.`]);
        if (id === 'store-grain' && p.hunger > 0) out.push([14, 'My belly is empty and the jars are full. The stone knows best. It must.']);
        if (id === 'honour-thinkers' && p.hunger > 0) out.push([12, 'We feed the thinkers and go short ourselves. What are they thinking about, food?']);
      } else if (o < 0.15 && p.skep > 55) out.push([4, `"${d.says}" says the stone. The stone also says nothing, most days.`]);
      if (p.doing === 'drilling with a spear') out.push([10, 'Thrust, step, thrust. My field is not weeding itself.']);
      if (p.doing === 'tending the stone') out.push([10, 'A clean stone is a happy stone. Probably.']);
      if (p.doing?.startsWith('pondering')) out.push([10, 'They bring me food so I can think. I am thinking about the food.']);
      return out;
    });
    R.commandments = { K, obey, famObey, BY_ID };
  },
};
