// Battles (stage 3): an enemy people comes every 125 years with its own god (DESIGN.md "Battles"; the director's
// rulings of 2026-11-14; docs/BATTLES.md has every rule and number). This file is the clock and the bridge:
// when a battle is due, who fights, the march out, the switch to the battleground (never the home land), what it
// costs (the hearth fires), the walk home, and the next one. The fight is battle-field.js; the battleground
// battle-ground.js; the look battle-look.js; the numbers battle-tune.js.
//
// How a battle goes, on screen: the warning (battle:coming, years before) -> the call: your fighters gather at the
// standing stone and march out by the side the raiders come from (marchSeconds, a tap skips) -> the switch: the
// home land closes into mist, the battleground opens out of it (switchSeconds) and home time stands still
// (clock.away) -> the calm (calmSeconds: their host drawn up, a preview, the bar filling, you may cast) -> the
// fight -> the result card -> the switch back, and the survivors walk in from the edge of the village, the
// wounded limping. Unwatched (a skip, the bots) the same fight is played at once on the same battleground.
//
// Nothing here changes anyone's faith or skepticism, during or after (the director: "Faith remains the same
// after battle too"). While a battle is on, acts are noticed by nobody, the calendar stands still, prayers wait.
// Strength may change: survivors harden.
//
// Signals: battle:coming { year, n, inYears }, battle:march { x, z }, battle:calm { box, preview, ... },
//   battle:start, battle:fx { kind, ... }, battle:end { result }, battle:home, run:end { why, year }.
// Queries: battle (the live field, read only), battleNext, battleLive, battleStage, battleCall, battleAim,
//   battleSetAim, battleDone, battleSkip, battleRun, battleResult, battleGround, battleVisit, battlePick.
// Power: sim.act('battle', { kind: 'area', x, z, args: { power, line? } }) casts a battle power (no witness);
//   the same as castBattle(power, shape) below, which any input (taps, drags, a drawn gesture) can call.
// Console: game.modules.sim.dev.battle() starts one now; dev.battleBots(policy, n) plays n by a scripted god.
import { TUNE_BATTLES, POWERS, PM, PERS_ORDER, RAIDER_CHAMPS, RAIDER_PEOPLES } from './battle-tune.js';
import { makeField } from './battle-field.js';
import { makeBattleLook } from './battle-look.js';
import { makeGround } from './battle-ground.js';
import { groundTick, snapToGround } from './move.js';
import { setWeapon } from './bodies.js';
import { yearLabel } from './words.js';
import { T as T1 } from './tune.js';

const STEP = 1 / 30;
const JOIN = 0.35; // fights.js JOIN_DEFEND: the 'fight' stat a grown person needs to defend their home
const WORDS = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ease = (k) => k * k * (3 - 2 * k);

export default {
  id: 'battles',
  tune: TUNE_BATTLES,
  init(R) {
    const { S, ctx } = R, T = TUNE_BATTLES;
    R.words.battle = 'fell fighting the raiders';
    const PA = () => S.peopleApi;
    const run = { n: 1, next: null, fires: T.fires, firstFighters: 0, history: [], over: null, comingSaid: null, settledYear: null, endSaid: false };
    let G = null;        // the battleground (made on first use)
    let field = null, look = null, live = null;
    let policy = null;   // the bots' stand-in god (dev); null: the player
    let skipping = false;
    const ground = () => { if (!G) { G = makeGround(ctx, T); } G.ensure(Math.floor(Math.random() * 1e9)); return G; };
    const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- the run's clock ----------
    R.on('family:settle', () => {
      if (run.settledYear == null) run.settledYear = S.year;
      if (run.next == null) run.next = Math.floor(S.year) + T.firstAfterSettle;
    });
    const due = () => run.next != null && !run.over && S.year >= run.next;
    R.on('year', () => {
      if (run.next == null || run.over || live) return;
      const left = run.next - S.year;
      if (left <= T.comingYears && run.comingSaid !== run.n) {
        run.comingSaid = run.n;
        R.signal('battle:coming', { year: run.next, n: run.n, inYears: Math.round(left) });
        R.alert('warn', `Raiders are coming: ${RAIDER_PEOPLES[(run.n - 1) % RAIDER_PEOPLES.length]}, with their god, in ${Math.round(left)} years (${yearLabel(run.next)}). Your grown people will march out to meet them on the Marches.`, { x: S.stone.centre.x, z: S.stone.centre.z,
          aside: run.n === 1 ? 'Neighbours. Every story needs some.' : undefined });
      }
    });

    // ---------- while a battle is on: nobody notices acts (no faith moves), prayers wait, clan fights wait ----------
    const notice0 = R.notice;
    R.notice = (act, spec) => (live ? { now: [], later: [] } : notice0(act, spec));
    R.answer('battleLive', () => !!live);

    // ---------- who fights ----------
    function metalTier() {
      const made = R.ask('discoveries')?.made ?? [];
      const has = (id) => made.some((d) => d.id === id);
      return has('iron') ? 3 : has('bronze') ? 2 : has('copper') ? 1 : 0;
    }
    const blessedNow = (p) => R.mods('strength', p).some((m) => m.key.startsWith('clans:bless') && (m.until == null || S.life <= m.until));
    function powerOf(p) { const will = R.value('fight', p); return R.value('strength', p) * (0.5 + 0.5 * Math.min(1, will)) * (p.stage === 'elder' ? 0.7 : 1); }
    function muster() {
      const busy = (p) => !!R.ask('fightOf', p);
      const grown = S.people.filter((p) => !p.dead && p.family?.state === 'settled' && p.stage !== 'child');
      const willing = grown.filter((p) => p.stage === 'adult' && R.value('fight', p) >= JOIN && !busy(p)).sort((a, b) => powerOf(b) - powerOf(a));
      const fighters = willing.slice(0, Math.min(T.fightersMax, Math.max(2, Math.ceil(grown.length * T.fighterShare))));
      const byClan = new Map();
      for (const p of fighters) {
        const c = R.ask('clanOf', p) ?? { id: `f:${p.family.id}`, name: p.family.name, dye: p.family.dye };
        if (!byClan.has(c.id)) byClan.set(c.id, { id: c.id, name: c.name, dye: c.dye ?? p.family.dye ?? 0x3e78b2, members: [] });
        byClan.get(c.id).members.push(p);
      }
      // at most T.bands families of about the same size: each clan, the largest first, joins the smallest band so far
      const clans = [...byClan.values()].sort((a, b) => b.members.length - a.members.length);
      const nBands = Math.max(1, Math.min(T.bands, clans.length, Math.ceil(fighters.length / 5)));
      const groups = clans.slice(0, nBands).map((c) => ({ ...c, members: [...c.members] }));
      for (const c of clans.slice(nBands)) groups.reduce((a, b) => (b.members.length < a.members.length ? b : a)).members.push(...c.members);
      const mine = [], bands = [];
      groups.forEach((g, k) => {
        const band = { name: g.name, dye: g.dye, members: [] };
        const sorted = [...g.members].sort((a, b) => powerOf(b) - powerOf(a));
        const nSling = Math.round(sorted.length * T.slingShare);
        sorted.forEach((p, i) => {
          const m = { p, band: k, pow: powerOf(p), deathMul: R.value('death', p), str: R.ask('strengthOf', p) ?? 50, champ: i === 0 && sorted.length >= 2, sling: i >= sorted.length - nSling && i > 0, blessed: blessedNow(p) };
          band.members.push(m); mine.push(m);
        });
        bands.push(band);
      });
      return { fighters, mine, bands, grown: grown.length };
    }
    function enemyFor(n, myN) {
      if (n === 1 || !run.firstFighters) run.firstFighters = Math.max(myN, 4);
      const ref = T.refBlend * myN + (1 - T.refBlend) * run.firstFighters;
      const growth = Math.min(T.growthCap, 1 + T.harderPerBattle * (n - 1));
      const total = Math.max(T.enemyMin, Math.min(T.enemyMax, Math.round(T.enemyPerFighter * ref * growth)));
      let tier = 3; for (const [y, t] of T.earthTiers) if (S.year < y) { tier = t; break; }
      const persKey = n - 1 < PERS_ORDER.length ? PERS_ORDER[n - 1] : ['fire', 'hound', 'smiter', 'patient'][(n - 1 - PERS_ORDER.length) % 4];
      const c = RAIDER_CHAMPS, k = (n * 2) % c.length;
      return { total, strength: Math.min(T.enemyStrengthMax, T.enemyStrength + T.enemyStrengthPer * (n - 1)), tier, myTier: metalTier(), champs: [c[k], c[(k + 1) % c.length]],
        people: RAIDER_PEOPLES[(n - 1) % RAIDER_PEOPLES.length], pers: persKey };
    }
    // the side of home the fighters leave by: toward the nearest edge of the world from the stone
    function exitSide() {
      const c = S.stone.centre, b = ctx.camera?.bounds?.() ?? { x0: 0, z0: 0, x1: 300, z1: 300 };
      const opts = [{ x: 1, z: 0, d: b.x1 - c.x }, { x: -1, z: 0, d: c.x - b.x0 }, { x: 0, z: 1, d: b.z1 - c.z }, { x: 0, z: -1, d: c.z - b.z0 }];
      const o = opts.reduce((a, q) => (q.d < a.d ? q : a));
      const k = Math.min(36, o.d - 26);
      return { x: c.x + o.x * k, z: c.z + o.z * k, dir: o };
    }

    // ---------- the fight's own events: the look, and the screen ----------
    const fx = (kind, o = {}) => {
      if (look && field?.env.live) {
        if (kind === 'land' && !['raise', 'lower', 'kill', 'burn', 'heal-small', 'revive'].includes(o.power)) look.ring(o.x, o.z, o.r, o.side === 0 ? 0xfff1c8 : PM[o.power]?.col ?? 0xffffff, 0.75);
        if (kind === 'bolt') look.bolt(o.x, o.y ?? G.standY(o.x, o.z), o.z);
        if (kind === 'stone') look.puff(o.x, o.z, 3, 0x6e6a66);
        if (kind === 'answered') look.ring(o.x, o.z, 4.5, 0xf2c14e, 0.6);
        if (kind === 'champFalls') look.ring(o.x, o.z, 5, o.side === 0 ? 0xc7442e : 0xf2c14e, 1.1);
        if (kind === 'break') look.ring(o.x, o.z, 4, 0xc7442e, 0.8);
      }
      if (!skipping && field?.env.live) R.signal('battle:fx', { kind, ...o });
    };
    // a death in battle, recorded the normal way (cause 'battle'), told quietly (one summary after); the record's
    // place is the edge of the village they marched out from (their grave is on the battleground)
    function quietDie(p, how) {
      const keep = S.skipAlerts, ax = p.x, az = p.z;
      const ex = live?.exit ?? S.stone.centre;
      S.skipAlerts = keep ?? [];
      try {
        p.keepBody = 0; p.x = ex.x; p.z = ex.z;
        PA().die(p, 'battle', { story: how === 'caught' ? 'Was caught by the raiders, wounded, when the line broke on the Marches.' : how === 'village' ? 'Was killed when the raiders came through to the village.' : 'Fell fighting the raiders on the Marches.' });
      } finally { S.skipAlerts = keep; p.x = ax; p.z = az; }
    }
    // a fighter who falls lies on the field until the battle ends (Bring back may raise them); the death is recorded then
    const died = () => {};

    // ---------- the call: they gather at the stone and march out ----------
    function call() {
      const ms = muster();
      if (ms.grown < T.minGrown) {
        run.next = Math.floor(S.year) + T.passBy;
        R.alert('info', `Raiders came over the hills, saw how few you are, and went looking for richer pickings. They will be back in about ${T.passBy} years.`, { x: S.stone.centre.x, z: S.stone.centre.z });
        return null;
      }
      const ex = exitSide();
      // they march at first light: a battle never begins at dusk or by night (home time then stands still till it ends)
      const day = S.dayClock / T1.DAY_SECONDS + T1.DAY_START, dayT = day - Math.floor(day);
      if (dayT > 0.45 || dayT < 0.1) S.dayClock += ((1 + 0.12 - dayT) % 1) * T1.DAY_SECONDS;
      live = { stage: 'march', t: 0, ms, exit: ex, prevSpeed: null, result: null, resultT: 0, gather: { x: S.stone.centre.x + ex.dir.x * 6, z: S.stone.centre.z + ex.dir.z * 6 } };
      const clk = ctx.clock;
      clk.still.add('battle');
      clk.hold('sim:battle', { text: 'Your people march out to meet the raiders.', x: S.stone.centre.x, z: S.stone.centre.z, kind: 'battle' });
      if (clk.speed !== 1) { live.prevSpeed = clk.speed; clk.setSpeed(1); }
      for (const m of ms.mine) {
        const p = m.p;
        if (p.hidden) PA().exitHome(p);
        p.asleep = false; p.nightBound = true; p.ext.battle = { marching: true };
        const s = PA().spotNear(live.gather.x, live.gather.z, 0.5, 4);
        PA().goTo(p, s.x, s.z, { speed: 3.2, doing: 'gathering at the stone to march against the raiders', then: () => PA().goTo(p, ex.x + (Math.random() - 0.5) * 6, ex.z + (Math.random() - 0.5) * 6, { speed: 2.6, doing: 'marching out to meet the raiders' }) });
        if (p.F) setWeapon(p.F, m.p.seed % 3 === 0 ? 'spear' : metalTier() ? 'axe' : 'club', ['stone', 'copper', 'bronze', 'iron'][metalTier()], m.blessed);
      }
      R.signal('battle:march', { x: live.gather.x, z: live.gather.z, n: ms.fighters.length });
      R.alert('warn', `${cap(WORDS(ms.fighters.length))} of your people take up their weapons and march out by the ${ex.dir.x > 0 ? 'east' : ex.dir.x < 0 ? 'west' : ex.dir.z > 0 ? 'south' : 'north'} to meet ${RAIDER_PEOPLES[(run.n - 1) % RAIDER_PEOPLES.length]} on the Marches.`, { x: live.gather.x, z: live.gather.z });
      return live;
    }
    R.on('activity', (p) => {
      if (!live || live.stage !== 'march' || !p.ext?.battle?.marching) return false;
      PA().goTo(p, live.exit.x + (Math.random() - 0.5) * 6, live.exit.z + (Math.random() - 0.5) * 6, { speed: 2.6, doing: 'marching out to meet the raiders' });
      return true;
    });

    // ---------- the battle on the battleground ----------
    function beginField(ms, o = {}) {
      const g = ground();
      if (T.freshGround && g.battles > 0) g.build(Math.floor(Math.random() * 1e9));
      else if (g.battles > 0 && !g.weatheredFor?.has(run.n)) { g.weather(T.weather); (g.weatheredFor ??= new Set()).add(run.n); }
      const headless = !!o.headless;
      const enemy = enemyFor(run.n, ms.fighters.length);
      const grownNow = S.people.filter((p) => !p.dead && p.stage !== 'child');
      const faith = R.ask('forces')?.faith ?? (grownNow.length ? Math.round(grownNow.reduce((s, p) => s + p.faith, 0) / grownNow.length) : 50);
      const shock = R.ask('battleReach')?.shock ?? 0;
      if (!headless && !look) look = makeBattleLook(ctx, g);
      const H = g.hearth, dir = { x: 1, z: 0 };
      // your families hold the fords' near side; with three or more, the last stands at the hearth
      const nb = ms.bands.length, posts = [];
      for (let k = 0; k < nb; k++) {
        if (nb >= 3 && k === nb - 1) { posts.push({ x: H.x + 3, z: H.z }); continue; }
        const nFront = nb >= 3 ? nb - 1 : nb, f = g.fords[k % g.fords.length], fx = g.riverX(f.z);
        const extra = Math.floor(k / g.fords.length);
        posts.push(nFront === 1 ? { x: fx - 7, z: (g.fords[0].z + g.fords[1].z) / 2 } : { x: fx - 6 - extra * 3, z: f.z + (extra ? (k % 2 ? 4 : -4) : 0) });
      }
      const muster = { x: g.camp.x - 14, z: g.camp.z }, spawn = { x: g.camp.x - 2, z: g.camp.z };
      const env = { W: g.W, G: g, T, live: !headless, look: headless ? null : look, hearth: H, dir, posts, muster, spawn, mine: ms.mine, bands: ms.bands, enemy, faith, shock,
        policy: o.policy ?? policy, hand: POWERS, fx, died,
        ground(e, dt, snap) { if (snap) snapToGround(g.W, e); else groundTick(g.W, e, dt || STEP); } };
      for (const m of ms.mine) { m.p.ext.battle = { u: null }; m.p.go = null; m.p.work = null; m.p.path = null; m.p.hidden = false; m.p.inside = null; m.p.jumpV = null; m.p.hop = null; }
      field = makeField(env);
      field.env = env; field.n = run.n; field.faithAtStart = faith;
      for (const m of ms.mine) { m.p.ext.battle.u = m.u; if (m.blessed) { m.u.blessed = 30; look?.bless(m.u, true); } }
      return field;
    }
    function previewBox() {
      // the front: from your families at the fords to the far bank (pinch or drag to see more)
      const g = G, f0 = g.fords[0], f1 = g.fords[1], rx = g.riverX(g.hearth.z);
      return [g.hearth.x - 1, f0.z - 3, rx + 10, f1.z + 3];
    }
    function settle() {
      const f = field, r = f.result ?? { win: false, how: 'broken' }, st = f.stats, n = run.n;
      const out = { n, win: r.win, how: r.how, firesBefore: run.fires, firesLost: 0, relit: false, deadNames: [], villageDead: 0, wounded: 0, hardened: 0, over: null,
        enemy: f.enemy.people, god: f.gods[1].pers.name, ft: Math.round(f.ft), stats: { ...st, answeredWords: [...st.answeredWords] }, faithAtStart: f.faithAtStart,
        bar: { max: f.gods[0].barMax, refill: f.gods[0].refill, spent: f.gods[0].spent, casts: f.gods[0].casts }, theirCasts: f.gods[1].casts, year: Math.floor(S.year), early: st.early };
      for (const u of f.units) if (u.side === 0 && u.p && u.state === 'dead' && !u.p.dead) { quietDie(u.p, u.caught ? 'caught' : 'field'); out.deadNames.push(u.p.name); }
      const grownLeft = () => S.people.filter((p) => !p.dead && p.family?.state === 'settled' && p.stage !== 'child' && !p.ext?.battle);
      const killSome = (share) => {
        const pool = grownLeft().sort(() => Math.random() - 0.5);
        const k = Math.round(pool.length * share);
        for (let i = 0; i < k; i++) { quietDie(pool[i], 'village'); out.deadNames.push(pool[i].name); }
        out.villageDead += k;
      };
      if (!r.win) {
        if (T.loss === 'hearths') {
          out.firesLost = r.how === 'hearth' ? T.firesLostHearth : T.firesLost;
          run.fires = Math.max(0, run.fires - out.firesLost);
          killSome(T.villageShare);
          if (run.fires <= 0) out.over = 'The last hearth fire went out.';
        } else if (T.loss === 'share') killSome(r.how === 'hearth' ? T.shareLossHearth : T.shareLoss);
        else out.over = 'One lost battle was enough: the village is gone.';
      } else if (T.loss === 'hearths' && T.relightOnWin && run.fires < T.fires) { run.fires++; out.relit = true; }
      out.firesAfter = run.fires;
      const C = R.ask('clans:api'), FA = R.ask('forces:api');
      for (const u of f.units) {
        if (u.side !== 0 || !u.p || u.p.dead) continue;
        const p = u.p, hurt = u.state === 'wounded' || (u.state === 'gone' && u.limp);
        u.hurt = hurt;
        if (hurt) { C?.wound?.(p, 'a wound from the battle'); out.wounded++; }
        const gn = (r.win ? T.hardenWon : T.hardenLost) + (hurt ? T.hardenWound : 0);
        if (FA?.gain) { FA.gain(p, gn, `Came back from the battle against ${f.enemy.people}${r.win ? ', having held' : ''}${hurt ? ', wounded' : ''}`, { hard: true }); out.hardened++; }
        PA().story(p, `Fought ${f.enemy.people} on the Marches${r.win ? ' and held' : ''}${hurt ? ', and came home wounded' : ''}.`);
      }
      // the battleground remembers: graves where your people fell, the scorch where fire ran
      for (const u of f.units) if (u.side === 0 && u.state === 'dead' && u.p) G.grave(u.e.x, u.e.z, u.e.ry ?? 0, u.p.name);
      for (const i of f.scorched) G.scar(Math.floor(f.cellX(i)), Math.floor(f.cellZ(i)));
      G.battles++;
      run.history.push({ peopleAfter: S.people.filter((q) => !q.dead).length, grownAtCall: live?.ms?.grown, n, win: r.win, how: r.how, dead: out.deadNames.length, fieldDead: st.myDead, villageDead: out.villageDead, wounded: out.wounded, fires: run.fires, year: out.year, casts: out.bar.casts, theirCasts: out.theirCasts, enemy: f.enemy.total, mine: st.myStart, policy: f.env.policy ?? 'player', works: st.works, answered: st.answered });
      run.n++;
      run.next = Math.floor(S.year) + T.every;
      if (out.over) run.over = { why: out.over, year: Math.floor(S.year) };
      const dn = out.deadNames.length;
      R.alert(r.win ? 'good' : 'bad', `${r.win ? 'Your people held the Marches' : r.how === 'hearth' ? 'The hearth on the Marches fell' : 'Your people broke on the Marches'} against ${f.enemy.people}. ${dn ? `${cap(WORDS(dn))} died${dn <= 6 ? ` (${out.deadNames.join(', ')})` : ''}` : 'Nobody died'}${out.wounded ? `, ${WORDS(out.wounded)} came home wounded` : ''}. ${out.firesLost ? `${out.firesLost === 2 ? 'Two hearth fires went' : 'A hearth fire went'} out: ${run.fires} left.` : out.relit ? `A hearth fire was lit again: ${run.fires}.` : ''} The next raiders will come in ${T.every} years.`, { x: S.stone.centre.x, z: S.stone.centre.z });
      return out;
    }
    // the survivors come home: in from the edge of the village they left by, the wounded limping
    function homecoming(walk) {
      const ex = live?.exit ?? exitSide();
      for (const u of field?.units ?? []) {
        if (u.side !== 0 || !u.p) continue;
        const p = u.p;
        if (p.F && p.F.group.parent !== ctx.layers.entities) ctx.layers.entities.add(p.F.group);
        if (p.F) { p.F.fig.rotation.set(0, 0, 0); p.F.fig.position.set(0, 0, 0); setWeapon(p.F, null); p.F.group.visible = !p.dead; }
        if (p.dead) { p.hidden = true; continue; }
        delete p.ext.battle;
        p.x = ex.x + (Math.random() - 0.5) * 8; p.z = ex.z + (Math.random() - 0.5) * 8;
        snapToGround(ctx.world, p);
        p.hidden = false; p.inside = null; p.work = null; p.go = null; p.nightBound = false; p.moving = false;
        const d = p.family?.home?.door;
        if (walk && d) PA().goTo(p, d.x, d.z, { speed: u.hurt ? 0.9 : 2.0, doing: u.hurt ? 'limping home from the battle' : 'walking home from the battle' });
        else if (d) { p.x = d.x; p.z = d.z; snapToGround(ctx.world, p); }
      }
      for (const p of S.people) if (p.ext?.battle && !p.dead) delete p.ext.battle; // anyone left marching
    }
    function release(walk = true) {
      if (!live) return;
      if (!live.homed) homecoming(walk);
      look?.clear();
      const clk = ctx.clock;
      clk.release('sim:battle');
      clk.still.delete('battle');
      clk.away.delete('battle');
      if (live.prevSpeed && clk.speed === 1) clk.setSpeed(live.prevSpeed);
      const wasShown = G?.shown;
      if (G) G.show(false);
      if (wasShown && live.camHome && !live.homed) ctx.camera.restore?.(live.camHome);
      field = null; live = null;
      S.land.needFull = true;
      R.signal('battle:home', {});
      if (run.over) endRun();
      else if (run.again) { run.again = false; setTimeout(() => { run.next = Math.floor(S.year); const l = call(); if (l) l.skipMarch = true; }, 400); }
    }
    function endRun() {
      if (run.endSaid) return;
      run.endSaid = true;
      R.signal('run:end', { why: run.over.why, year: run.over.year, battles: run.history.length, held: run.history.filter((h) => h.win).length, fires: run.fires });
      if (!skipping) ctx.clock.setPaused(true);
    }
    // a battle nobody watches (a skip, the bots): played out at once on the same battleground, by the same rules
    function resolveHeadless(o = {}) {
      const ms = muster();
      if (ms.grown < T.minGrown) { run.next = Math.floor(S.year) + T.passBy; return null; }
      live = { stage: 'headless', ms, exit: exitSide(), result: null };
      const f = beginField(ms, { headless: true, policy: o.policy ?? policy ?? 'absent' });
      let guard = 0;
      while (f.phase !== 'over' && guard++ < 30 * 400) f.update(STEP);
      if (!f.result) f.result = { win: true, how: 'dawn' };
      live.result = settle();
      const res = live.result;
      R.signal('battle:end', { result: res, headless: true });
      release(false);
      return res;
    }

    // ---------- the switch between home and the battleground ----------
    // k runs 0 -> 1 over half the switch: the place shown closes into mist; then the other opens out of it
    function switchTo(toGround, dt) {
      const half = reduced() ? 0.001 : T.switchSeconds / 2;
      live.sw = (live.sw ?? 0) + dt;
      const C = ctx.camera, g = G;
      if (live.sw < half) {
        const b = toGround ? g.homeBounds() : g.bounds, k = ease(live.sw / half);
        g.mist(b, k, C.target.x, C.target.z, toGround ? 22 : 3);
        return false;
      }
      if (!live.swapped) {
        live.swapped = true;
        if (toGround) {
          live.camHome = C.state();
          ctx.clock.away.add('battle');
          g.show(true);
          const [x0, z0, x1, z1] = previewBox();
          C.anim = null;
          // the battle opens on the whole field: the player's own tilt, but never flatter than 37 degrees (a field seen
          // nearly level is a thin strip); the player can tilt it lower once there, and home gets their tilt back
          if (C.pitch < BATTLE_TILT_MIN) C.pitch = BATTLE_TILT_MIN;
          C.target.set((x0 + x1) / 2, g.standY((x0 + x1) / 2, (z0 + z1) / 2), (z0 + z1) / 2);
          C.ppm = frameppm(x1 - x0, z1 - z0);
          C.clamp(); C.update();
        } else {
          homecoming(true); // the survivors are back at the edge of the village as home opens out of the mist
          look?.clear();
          g.show(false);
          ctx.clock.away.delete('battle');
          if (live.camHome) { ctx.camera.restore(live.camHome); const ex = live.exit; if (ex) { ctx.camera.target.x = ex.x; ctx.camera.target.z = ex.z; ctx.camera.clamp(); ctx.camera.update(); } }
          live.homed = true;
        }
      }
      const k = ease(Math.min(1, (live.sw - half) / half));
      const b = toGround ? g.bounds : g.homeBounds(), w = toGround ? 3 : 22;
      g.mist(b, 1 - k, ctx.camera.target.x, ctx.camera.target.z, w);
      if (k >= 1) { g.mist(b, 0, 0, 0, w); return true; }
      return false;
    }
    // (frameppm counts the field's depth at no less than 0.6 of itself, which is the sine of about 37 degrees)
    const BATTLE_TILT_MIN = Math.asin(0.6);
    function frameppm(w, d) {
      const C = ctx.camera, v = C.view ?? { w: innerWidth, h: innerHeight };
      const across = w, up = d * Math.max(0.6, Math.sin(C.pitch)) + 6;
      return Math.max(5, Math.min(14, Math.min(v.w * 0.92 / across, Math.max(120, v.h - 140) * 0.95 / up)));
    }
    R.answer('battleFrame', () => (G && field ? previewBox() : null));

    // ---------- driving it: the march at home's pace, the rest on the battleground's own clock ----------
    ctx.frame.push((realDt) => {
      if (!live || live.stage === 'headless') return;
      const clk = ctx.clock;
      skipping = clk.crawl === false;
      if (skipping) { // a skip began: finish it unwatched
        if (!field) { live.stage = 'battle'; beginField(live.ms, { headless: true }); }
        field.env.live = false;
        let g = 0; while (field.phase !== 'over' && g++ < 30 * 400) field.update(STEP);
        if (!live.result) { live.result = settle(); R.signal('battle:end', { result: live.result }); }
        release(false);
        return;
      }
      const run1 = clk.running && !clk.paused;
      if (live.stage === 'march') {
        if (!run1) return;
        live.t += realDt * clk.speed;
        if (S.daylight < 0.98) S.dayClock += realDt * 9; // they march at first light
        if (live.t >= T.marchSeconds || (live.skipMarch && live.t > 0.2)) { /* home runs a moment first: the new light of day reaches the screen */ live.stage = 'out'; live.sw = 0; live.swapped = false; R.signal('battle:switch', { to: 'ground' }); }
        return;
      }
      if (live.stage === 'out') {
        if (live.sw === 0) { ctx.clock.away.add('battle'); beginField(live.ms); } // home time stands still from here
        if (switchTo(true, realDt)) {
          live.stage = 'battle';
          const pv = field.preview();
          R.signal('battle:calm', { box: previewBox(), n: run.n, enemy: field.enemy.people, god: field.gods[1].pers.name, side: 'east', preview: pv });
        }
        look?.frame(field, realDt);
        return;
      }
      if (live.stage === 'battle') {
        const dt = clk.adt;
        if (dt > 0 && field.phase !== 'over') {
          let k = Math.max(1, Math.ceil(dt / STEP)); const h = dt / k;
          const slow = field.phase === 'ending' ? 0.4 : 1;
          for (; k > 0; k--) field.update(h * slow);
          if (field.phase === 'fight' && !live.started) { live.started = true; R.signal('battle:start', { n: field.n }); }
        }
        G.tick();
        look?.frame(field, dt);
        if (field.phase === 'over' && !live.result) { live.result = settle(); live.resultT = 0; R.signal('battle:end', { result: live.result }); }
        if (live.result) { live.resultT += realDt; if (live.resultT > 60 || live.goHome) { live.stage = 'back'; live.sw = 0; live.swapped = false; } }
        return;
      }
      if (live.stage === 'back') {
        look?.frame(field, realDt);
        if (switchTo(false, realDt)) release(true);
      }
    });
    // the step at home: the call when a battle is due (and the run's end when the people are gone)
    let wipedSince = null;
    R.on('step', () => {
      if (!S.started) return;
      skipping = ctx.clock.crawl === false;
      if (run.settledYear != null && !run.over) {
        const settled = S.people.some((p) => !p.dead && p.family?.state === 'settled');
        if (settled) wipedSince = null; else if (wipedSince == null) wipedSince = S.year; else if (S.year - wipedSince > 40) { run.over = { why: 'Your people are gone.', year: Math.floor(S.year) }; if (!live) endRun(); }
      }
      if (!live && due()) { if (skipping) resolveHeadless(); else call(); }
    });
    R.on('person:death', (p) => { const u = p.ext?.battle?.u; if (u && u.state !== 'dead' && field) u.state = 'dead'; });

    // ---------- casting: one entry for every input ----------
    // castBattle(power, shape): shape { x, z } a point, { line: [{x,z},{x,z}] } a line, { x, z, r } an area
    const castBattle = (p, shape) => (field ? field.cast(p, shape) : { ok: false, text: 'There is no battle on.' });
    R.power({
      id: 'battle', witness: { unseen: 'In battle nobody stops to wonder where it came from.' },
      forecast(t) {
        const p = t?.args?.power;
        if (!field) return R.refuse('There is no battle on.');
        if (!POWERS.includes(p)) return R.refuse('Pick a battle power.');
        const a = field.aimInfo(p, t.args?.line ? { line: t.args.line } : { x: t.x, z: t.z });
        if (!a.ok) return R.refuse(a.why);
        return { ok: true, gains: [a.text], costs: [`${a.cost} from the bar (${Math.floor(field.gods[0].bar)} of ${field.gods[0].barMax}).`], who: 'In battle nobody stops to wonder.', seenBy: 0, confirm: 'click' };
      },
      carryOut(t) {
        const p = t?.args?.power;
        const r = castBattle(p, t.args?.line ? { line: t.args.line, x: t.x, z: t.z } : { x: t.x, z: t.z, r: t.r });
        return { ...r, x: t.x, z: t.z, r: field?.radiusOf(p, field.gods[0].size) ?? 2 };
      },
    });
    R.answer('castBattle', castBattle);

    // ---------- queries ----------
    R.answer('battle', () => field);
    R.answer('battleStage', () => live?.stage ?? null);
    R.answer('battleGround', () => G);
    R.answer('battleNext', () => ({ year: run.next, inYears: run.next == null ? null : Math.max(0, Math.round((run.next - S.year) * 10) / 10), n: run.n, fires: run.fires, firesMax: T.fires, loss: T.loss,
      foreseen: run.next != null && run.next - S.year <= T.comingYears, live: !!live, over: run.over }));
    R.answer('battleRun', () => ({ ...run, history: [...run.history] }));
    R.answer('battleCall', () => {
      if (live?.stage === 'march') { live.skipMarch = true; return true; }
      const ok = field?.callEarly() ?? false;
      if (ok) { R.signal('battle:start', { n: field.n, early: true }); live.started = true; }
      return ok;
    });
    R.answer('battleSkipMarch', () => { if (live?.stage === 'march') { live.skipMarch = true; return true; } if (live && (live.stage === 'out' || live.stage === 'back')) { live.sw = 99; return true; } return false; });
    R.answer('battleAim', (p, s) => (field ? field.aimInfo(p, s) : null));
    R.answer('battleSetAim', (a) => { look?.setAim(a); });
    R.answer('battleDone', () => { if (live?.result) { live.goHome = true; return true; } return false; });
    R.answer('battleResult', () => live?.result ?? null);
    // another battle at once (the ?battle=1 way in): home, then straight out again
    R.answer('battleAgain', () => { if (!live?.result) return false; live.goHome = true; run.again = true; return true; });
    // tap a fighter: the person (the same card as at home)
    R.answer('battlePick', (x, z, r = 1.2) => { if (!field) return null; let b = null, bd = r; for (const u of field.units) { if (!u.p || u.state === 'gone') continue; const d = Math.hypot(u.e.x - x, u.e.z - z); if (d < bd) { bd = d; b = u.p; } } return b; });
    R.answer('battleSkip', () => {
      const sim = ctx.modules.sim;
      if (live || run.next == null || !sim?.skip || sim.skip.running) return null;
      const y = run.next - S.year - 0.05;
      return y > 0 ? sim.skip(y) : Promise.resolve(null);
    });
    // look at the battleground between battles (and back)
    R.answer('battleVisit', (on = true) => {
      if (live) return false;
      const g = ground();
      if (on && !g.shown) { live = null; g.visitCam = ctx.camera.state(); ctx.clock.away.add('visit'); g.show(true); const [x0, z0, x1, z1] = [g.hearth.x - 4, g.fords[0].z - 9, g.riverX(g.hearth.z) + 16, g.fords[1].z + 9]; ctx.camera.target.set((x0 + x1) / 2, 16, (z0 + z1) / 2); ctx.camera.ppm = frameppm(x1 - x0, z1 - z0); ctx.camera.clamp(); ctx.camera.update(); return true; }
      if (!on && g.shown) { g.show(false); ctx.clock.away.delete('visit'); if (g.visitCam) ctx.camera.restore(g.visitCam); return true; }
      return false;
    });

    // ---------- ?battle=1: straight into a battle (a village of about 40, no lessons in the way) ----------
    const quick = typeof location !== 'undefined' && new URLSearchParams(location.search).get('battle') === '1';
    if (quick) {
      const u = new URL(location.href);
      if (!u.searchParams.has('notitle')) { u.searchParams.set('notitle', '1'); history.replaceState(null, '', u); } // the title screen reads this as it is built
      try { localStorage.setItem('gp.quickBattle', '1'); } catch { /* private */ }
    }
    // ---------- console helpers ----------
    ctx.events.on('ready', () => {
      if (quick) setTimeout(async () => {
        const sim = ctx.modules.sim, U = ctx.modules.ui?.dev;
        try { U?.tutorial?.stop?.(); } catch { /* no lessons */ }
        if (ctx.clock.phase !== 'running') ctx.clock.start();
        sim.dev.crowd(40);
        await sim.skip(15);
        try { U?.tutorial?.stop?.(); U?.closeSlot?.(); } catch { /* fine */ }
        for (const el of document.querySelectorAll('#ui .float, #ui .lesson, #ui .teach')) el.remove?.();
        run.next = Math.floor(S.year);
        const l = call();
        if (l) l.skipMarch = true;
      }, 50);
      const dev = ctx.modules.sim?.dev;
      if (!dev) return;
      dev.battle = (o = {}) => {
        if (ctx.clock.phase !== 'running') ctx.clock.start();
        if (live) return live;
        if (ctx.clock.paused) ctx.clock.setPaused(false);
        if (run.next == null) run.next = Math.floor(S.year);
        if (o.policy !== undefined) policy = o.policy;
        if (o.n) run.n = o.n;
        const l = call();
        if (l && o.skipMarch) l.skipMarch = true;
        return l;
      };
      dev.battleBots = async (pol = 'middling', nb = 6) => {
        policy = pol;
        const out = [];
        for (let k = 0; k < nb && !run.over; k++) {
          if (run.next == null) run.next = Math.floor(S.year) + 1;
          const before = run.history.length;
          await ctx.modules.sim.skip(Math.max(0.6, run.next - S.year + 0.5));
          if (run.history.length > before) out.push(run.history[run.history.length - 1]);
          else if (!S.people.some((q) => !q.dead && q.family?.state === 'settled')) break; // nobody left to march
        }
        policy = null;
        return { policy: pol, history: out, fires: run.fires, over: run.over, people: S.people.filter((p) => !p.dead).length };
      };
      dev.battleRun = run;
      dev.battleTune = T;
      dev.battleGround = () => ground();
    });
  },
};
