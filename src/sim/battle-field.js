// Battles (stage 3): one battle, played out in real time on the battleground (sim/battle-ground.js, never the
// home land). Ported from the battle prototype's fight (game/proto/battle.js: units, nerve shared by a family,
// the hearth, three waves, two gods trading powers, soft counters), turned into metres on a voxel world and
// fed by the game's own fight rules: a fighter's power is the 'strength' stat (weapons discovered, blessings,
// wounds) times their willingness (the 'fight' stat), their death chance the 'death' stat (sim/fights.js).
//
// Your fighters are the very people from home (their own bodies, names and cards): a unit's entity IS the
// person, moved on the battleground while home time stands still. It changes no one's faith or skepticism
// (the director, 2026-11-14). The same code runs headless (a skip, the bots) and on screen. Earthworks
// (Ridge, Trench, Pond) are spells like the rest, cast by either god at any moment: the ground moves over
// about a second, and they only slow (they never hurt, knock down or throw anyone: the director, 2026-11-14).
//
// env (from battle.js): { W, G (the ground), T, live, look, hearth, dir, posts, muster, spawn, mine, bands, enemy,
//   faith, shock, policy, hand, fx(kind, o), died(u, how), ground(e, dt, snap) }
// A cast: F.cast(power, shape) with shape { x, z } (a point), { line: [{x,z},{x,z}] } or { x, z, r } (an area);
// any input (taps, drags, a drawn gesture) only has to make one of these.
import { stepToward, tryMove } from './move.js';
import { POWERS, SMALL, HELPS, ANSWER, PERS, PM, LINES, WORKS } from './battle-tune.js';

export const interp = (pts, v) => {
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (v <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (v - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const D = (a, b) => Math.hypot(a.e.x - b.e.x, a.e.z - b.e.z);
const dxz = (u, x, z) => Math.hypot(u.e.x - x, u.e.z - z);
const GRID = 128, GH = GRID / 2; // the burn and wet grid, a metre a cell

export function makeField(env) {
  const T = env.T, H = env.hearth, dir = env.dir, perp = { x: -dir.z, z: dir.x }, G = env.G, W = env.W;
  const HAND = env.hand ?? POWERS; // the spells brought to this battle (later: a chosen hand; for now all of them)
  const F = {
    phase: 'calm', time: 0, ft: 0, calmLeft: T.calmSeconds, waveIdx: -1, spawnQueue: [], waves: [],
    units: [], tells: [], windups: [], delayed: [], rains: [], works: [], shots: [], hand: HAND, effects: [], lines: [],
    hearth: H, dir, muster: env.muster, spawn: env.spawn, bands: env.bands, enemy: env.enemy, G,
    hearthT: 0, hearthN: 0, hearthMax: 0, result: null, endT: 0, nextId: 1, voice: 0, scorched: new Set(),
    stats: { myStart: 0, myDead: 0, myWounded: 0, theirDead: 0, theirWounded: 0, theirTotal: 0,
      byHand: 0, byGod: 0, ffFire: 0, ffWolf: 0, ffSmite: 0, myChampsLost: [], theirChampsLost: [], champsWounded: [], shocked: 0,
      refused: 0, answered: 0, caught: 0, famBreaks: 0, early: 0, casts: 0, theirCasts: 0, answeredWords: [], works: 0 },
    fam: {},
  };
  // ---------- the burn and wet grid ----------
  const gx0 = Math.floor((G.bounds.x0 + G.bounds.x1) / 2) - GH, gz0 = Math.floor((G.bounds.z0 + G.bounds.z1) / 2) - GH;
  const cell = (x, z) => { const cx = Math.floor(x) - gx0, cz = Math.floor(z) - gz0; return cx < 0 || cz < 0 || cx >= GRID || cz >= GRID ? -1 : cz * GRID + cx; };
  const cx = (i) => gx0 + (i % GRID) + 0.5, cz = (i) => gz0 + ((i / GRID) | 0) + 0.5;
  const burn = new Float32Array(GRID * GRID), burnPow = new Float32Array(GRID * GRID), burnSide = new Int8Array(GRID * GRID), wet = new Float32Array(GRID * GRID);
  const lavaW = new Float32Array(GRID * GRID), lavaR = new Float32Array(GRID * GRID), lavaS = new Int8Array(GRID * GRID);
  F.burn = burn; F.wet = wet; F.cellX = cx; F.cellZ = cz; F.lavaW = lavaW; F.lavaR = lavaR;
  const forCells = (x, z, r, fn) => {
    for (let dz = Math.floor(-r); dz <= Math.ceil(r); dz++) for (let dx = Math.floor(-r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      const i = cell(x + dx, z + dz); if (i >= 0) fn(i, x + dx, z + dz);
    }
  };

  // ---------- the two gods ----------
  const faith = clamp(env.faith, 0, 100);
  const myGod = { side: 0, faith, barMax: Math.round(interp(T.barByFaith, faith)), refill: interp(T.refillByFaith, faith), size: interp(T.sizeByFaith, faith),
    bar: 0, lock: {}, usedGreat: false, usedRevive: false, casts: 0, spent: 0, lastCast: -99, think: 0 };
  myGod.bar = Math.round(myGod.barMax * T.barStart);
  for (const p of POWERS) myGod.lock[p] = 0;
  const pers = PERS[env.enemy.pers] ?? PERS.patient;
  const theirGod = { side: 1, faith: T.enemyFaith, pers, size: interp(T.sizeByFaith, T.enemyFaith) * pers.sizeMul, cdMul: interp(T.cdByFaith, T.enemyFaith),
    cds: {}, readySince: {}, usedGreat: false, casts: 0, lastCast: -99, think: 0, opened: false, plan: null };
  for (const p of POWERS) { theirGod.cds[p] = 0; theirGod.readySince[p] = 0; }
  F.gods = [myGod, theirGod];
  F.quietOk = faith >= T.quietBelow;
  F.shock = env.shock ?? 0;

  // ---------- units ----------
  function addUnit(side, kind, e, o = {}) {
    const hp = kind === 'wolf' ? T.wolfHp : kind === 'champ' ? T.champHp : kind === 'sling' ? T.slingHp : T.hp;
    const dmg = kind === 'wolf' ? T.wolfDmg : kind === 'champ' ? T.champDmg : kind === 'sling' ? T.slingDmg : T.dmg;
    const u = { id: F.nextId++, side, kind, e, p: o.p ?? null, name: o.name ?? '', band: o.band ?? 0, post: o.post ?? null, slot: o.slot ?? null,
      hp, maxHp: hp, dmg, pow: o.pow ?? 1, deathMul: o.deathMul ?? 1, str: o.str ?? 50,
      nerve: 100, state: 'fight', target: null, retarget: 0, atk: rand(0, 0.6), frozen: 0, paused: 0, blessed: 0, blessSave: false, provoked: 0,
      owner: o.owner ?? -1, life: o.life ?? 0, scared: 0, sx: 0, sz: 0, wave: o.wave ?? -1, pose: 'brace', poseT: 0, moving: false, hitFlash: 0,
      stuckT: 0, side0: 0, sideT: 0, heldMsg: false, tier: o.tier ?? 0, wpt: null };
    F.units.push(u);
    return u;
  }
  F.addUnit = addUnit;
  const alive = (u) => u.state === 'fight' || u.state === 'flee';

  // your fighters, by family, at their posts (from battle.js: by the fords, a guard at the hearth)
  env.bands.forEach((b, k) => { b.post = env.posts[k]; });
  for (const m of env.mine) {
    const b = env.bands[m.band];
    const i = b.members.indexOf(m);
    const row = Math.floor(i / 3), col = (i % 3) - 1;
    const slot = { x: b.post.x - dir.x * row * 1.3 + perp.x * col * 1.4, z: b.post.z - dir.z * row * 1.3 + perp.z * col * 1.4 };
    const p = m.p;
    p.x = H.x - dir.x * 3 + rand(-2, 2); p.z = H.z + rand(-4, 4); p.ry = p.yawT = Math.atan2(dir.x, dir.z);
    env.ground(p, 0, true);
    const kind = m.champ ? 'champ' : m.sling ? 'sling' : 'fighter';
    m.u = addUnit(0, kind, p, { p, name: m.champ ? p.name : '', band: m.band, post: b.post, slot, pow: m.pow, deathMul: m.deathMul, str: m.str, tier: env.enemy.myTier });
    env.look?.addMine(m.u);
  }
  F.stats.myStart = F.units.length;

  // the raiders: a total split over three waves, champions from the second wave on
  const total = env.enemy.total, share = T.waveShare, sumShare = share[0] + share[1] + share[2];
  const sizes = [Math.max(2, Math.round(total * share[0] / sumShare)), Math.max(1, Math.round(total * share[1] / sumShare)), 0];
  sizes[2] = Math.max(1, total - sizes[0] - sizes[1]);
  F.waves = sizes.map((n, k) => ({ n, champ: k === 0 ? null : env.enemy.champs[k - 1] ?? null, label: '' }));
  F.waves[0].label = `First wave: ${sizes[0]} raiders`;
  F.waves[1].label = `Second wave: ${sizes[1]}${F.waves[1].champ ? `, with ${F.waves[1].champ}` : ''}`;
  F.waves[2].label = `Last push: ${sizes[2]}${F.waves[2].champ ? `, with ${F.waves[2].champ}` : ''}`;
  const enemyPow = 0.55 + 0.9 * clamp(env.enemy.strength, 0, 100) / 100;
  function spawnWave(k) {
    const w = F.waves[k], list = [];
    if (w.champ) list.push({ kind: 'champ', name: w.champ });
    const slings = Math.round(w.n * T.slingShare);
    for (let i = 0; i < w.n; i++) list.push({ kind: i < slings ? 'sling' : 'fighter' });
    list.forEach((s, i) => F.spawnQueue.push({ t: F.time + i * 0.3, ...s, wave: k, i }));
    F.waveIdx = k;
    F.stats.theirTotal += list.length;
    env.fx('wave', { k, text: w.label });
  }
  function musterSlot(i) {
    const row = Math.floor(i / 8), col = (i % 8) - 3.5;
    return { x: env.muster.x + dir.x * row * 1.5 + perp.x * col * 1.5, z: env.muster.z + dir.z * row * 1.5 + perp.z * col * 1.5 };
  }
  function spawnOne(s) {
    const a = rand(-1, 1) * 5;
    const e = { x: env.spawn.x + perp.x * a + rand(-1, 1), z: env.spawn.z + perp.z * a + rand(-1, 1), y: 16, r: 0.26, ry: Math.atan2(-dir.x, -dir.z), yawT: Math.atan2(-dir.x, -dir.z), kind: 'raider' };
    env.ground(e, 0, true);
    const u = addUnit(1, s.kind, e, { name: s.name ?? '', band: 10 + s.wave, wave: s.wave, pow: enemyPow * (s.kind === 'champ' ? 1.1 : 1), str: env.enemy.strength, tier: env.enemy.tier });
    u.slot = musterSlot(s.i);
    env.look?.addRaider(u);
  }
  function updateSpawns() {
    let n1 = 0;
    for (const u of F.units) if (u.side === 1 && alive(u)) n1++;
    while (F.spawnQueue.length && F.spawnQueue[0].t <= F.time && n1 < T.aliveMax) { spawnOne(F.spawnQueue.shift()); n1++; }
  }
  spawnWave(0); // the first wave walks in during the calm and draws up where you can see it

  // ---------- phases ----------
  F.callEarly = () => { if (F.phase !== 'calm') return false; F.stats.early = Math.round(F.calmLeft); startFight(); return true; };
  function startFight() {
    F.phase = 'fight'; F.ft = 0;
    for (const p of POWERS) { theirGod.cds[p] = p === 'skyfall' ? 0 : cdOf(theirGod, p) * (1 - T.startCharge); theirGod.readySince[p] = theirGod.cds[p] <= 0 ? F.time : null; }
    while (F.spawnQueue.length) spawnOne(F.spawnQueue.shift());
    env.fx('horn', { text: 'They come!' });
  }
  function endBattle(win, how) {
    if (F.result) return;
    F.result = { win, how };
    if (!win) for (const u of F.units) if (u.side === 0 && u.state === 'wounded' && Math.random() < T.caughtOnLoss) {
      u.state = 'dead'; u.caught = true; F.stats.myWounded--; F.stats.myDead++; F.stats.caught++; env.died(u, 'caught');
    }
    F.phase = 'ending'; F.endT = T.endSeconds;
    for (const u of F.units) if (alive(u)) u.target = null;
    env.fx('end', { win, how, text: win ? (how === 'dawn' ? 'They give up and go home.' : 'They run!') : (how === 'hearth' ? 'The hearth falls.' : 'Your people break.') });
  }

  // ---------- the update ----------
  F.update = (dt) => {
    if (F.phase === 'over') return;
    F.time += dt;
    F.voice = Math.max(0, F.voice - dt);
    for (const p of POWERS) if (myGod.lock[p] > 0) myGod.lock[p] = Math.max(0, myGod.lock[p] - dt);
    if (F.phase === 'calm' || F.phase === 'fight') myGod.bar = Math.min(myGod.barMax, myGod.bar + myGod.refill * dt);
    if (F.phase === 'calm') {
      F.calmLeft -= dt;
      updateSpawns();
      if (env.policy) botAI(myGod, dt);
    } else if (F.phase === 'fight') {
      F.ft += dt;
      if (F.waveIdx < 1 && F.ft >= T.wave2At) spawnWave(1);
      if (F.waveIdx < 2 && F.ft >= T.wave3At) spawnWave(2);
      updateSpawns();
      for (const p of POWERS) if (theirGod.cds[p] > 0) { theirGod.cds[p] -= dt; if (theirGod.cds[p] <= 0) { theirGod.cds[p] = 0; theirGod.readySince[p] = F.time; } }
      godAI(theirGod, dt);
      if (env.policy) botAI(myGod, dt);
    } else F.ft += dt;
    for (const e of F.effects) e.t += dt;
    F.effects = F.effects.filter((e) => e.t < e.dur && !(e.until && e.until()));
    for (const l of F.lines) l.t += dt;
    F.lines = F.lines.filter((l) => l.t < l.dur);
    updateCasts(dt);
    updateWorks(dt);
    updateTerrain(dt);
    updateLava(dt);
    updateUnits(dt);
    updateShots(dt);
    if (F.phase === 'calm' && F.calmLeft <= 0) startFight();
    else if (F.phase === 'fight') checkEnd(dt);
    else if (F.phase === 'ending') { F.endT -= dt; if (F.endT <= 0) F.phase = 'over'; }
  };

  function updateCasts(dt) {
    for (const t of F.tells) {
      if (t.done) continue;
      t.t += dt;
      if (t.target && alive(t.target)) { t.x = t.target.e.x; t.z = t.target.e.z; t.shape = { x: t.x, z: t.z }; }
      if (t.t >= t.dur) { t.done = true; applyPower(1, t.power, t.shape, t.size, { target: t.target, mode: t.mode }); }
    }
    F.tells = F.tells.filter((t) => !t.done);
    for (const w of F.windups) {
      w.t += dt;
      if (w.o.target && alive(w.o.target)) { w.shape.x = w.o.target.e.x; w.shape.z = w.o.target.e.z; }
      if (w.t >= w.dur) { w.done = true; applyPower(0, w.power, w.shape, w.size, w.o); }
    }
    F.windups = F.windups.filter((w) => !w.done);
    for (const d of F.delayed) { d.t -= dt; if (d.t <= 0) { d.done = true; d.fn(); } }
    F.delayed = F.delayed.filter((d) => !d.done);
    for (const r of F.rains) { r.t += dt; forCells(r.x, r.z, r.r, (i) => { burn[i] = 0; wet[i] = Math.max(wet[i], T.rain.wet); }); }
    F.rains = F.rains.filter((r) => r.t < r.dur);
  }
  let terrainT = 0;
  function updateTerrain(dt) {
    terrainT += dt;
    if (terrainT < 0.1) return;
    const k = terrainT; terrainT = 0;
    for (let i = 0; i < burn.length; i++) {
      if (wet[i] > 0) { wet[i] = Math.max(0, wet[i] - k); if (burn[i] > 0) burn[i] = 0; }
      if (burn[i] > 0) { burn[i] = Math.max(0, burn[i] - k); if (burn[i] === 0) G.scar?.(Math.floor(cx(i)), Math.floor(cz(i))); } // scorched where it burned
    }
  }
  // ---------- earthworks: the ground rises or sinks a layer at a time, about a second in all ----------
  function updateWorks(dt) {
    for (const w of F.works) {
      w.t += dt;
      while (w.step < w.steps.length && w.t >= w.steps[w.step]) { doStep(w, w.step); w.step++; }
      if (w.step >= w.steps.length) w.done = true;
    }
    F.works = F.works.filter((w) => !w.done);
  }
  function doStep(w, k) {
    const moved = [];
    for (const c of w.cells) {
      let ok = false;
      if (w.kind === 'ridge') ok = G.layer(c.x, c.z, +1, T.works.ridgeHigh);
      else if (w.kind === 'trench') ok = G.layer(c.x, c.z, -1, T.works.trenchDeep);
      else if (w.kind === 'pond') ok = k === 0 ? (G.layer(c.x, c.z, -1, 1) || !!G.workAt(c.x, c.z)) : G.pond(c.x, c.z);
      else if (w.kind === 'flatten') ok = G.flatten(c.x, c.z);
      if (ok) { moved.push(c); if (w.kind === 'pond') { const i = cell(c.x + 0.5, c.z + 0.5); if (i >= 0) burn[i] = 0; } }
    }
    if (!moved.length) return;
    // anyone standing there rides it up or steps down with it: earthworks never hurt or throw anyone
    const set = new Set(moved.map((c) => `${c.x},${c.z}`));
    for (const u of F.units) if (u.state !== 'dead' && u.state !== 'gone' && set.has(`${Math.floor(u.e.x)},${Math.floor(u.e.z)}`)) env.ground(u.e, 0, true);
    env.look?.dust(moved, w.kind);
  }
  function startWork(kind, cells, side) {
    const s = T.works.riseSeconds;
    const steps = kind === 'flatten' ? [s * 0.5] : [s * 0.35, s * 0.85];
    F.works.push({ kind, cells, side, t: 0, step: 0, steps, done: false });
    F.stats.works++;
    env.look?.dust(cells, kind, true);
  }
  function lineCells(a, b) {
    const out = [], seen = new Set();
    let x0 = Math.floor(a.x), z0 = Math.floor(a.z);
    const x1 = Math.floor(b.x), z1 = Math.floor(b.z);
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    for (let k = 0; k < 64 && out.length < T.works.maxCells; k++) {
      const key = `${x0},${z0}`;
      if (!seen.has(key)) { seen.add(key); if (G.canWork(x0, z0)) out.push({ x: x0, z: z0 }); }
      if (x0 === x1 && z0 === z1) break;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
    return out;
  }
  function circleCells(x, z, r) {
    const out = [];
    for (let dz = Math.floor(-r); dz <= Math.ceil(r); dz++) for (let dx = Math.floor(-r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      const px = Math.floor(x + dx), pz = Math.floor(z + dz);
      if (G.canWork(px, pz)) out.push({ x: px, z: pz });
    }
    return out;
  }
  // an earthwork's cells: a drawn line, or a tap (a line across the way they come, centred there); a pond's circle
  function workShape(p, shape) {
    if (p === 'pond') return { cells: circleCells(shape.x, shape.z, T.works.pondR), x: shape.x, z: shape.z };
    let a, b;
    if (shape.line && Math.hypot(shape.line[1].x - shape.line[0].x, shape.line[1].z - shape.line[0].z) >= 1) { a = shape.line[0]; b = shape.line[1]; }
    else { const h = (T.works.defCells - 1) / 2, x = shape.x ?? shape.line?.[0].x, z = shape.z ?? shape.line?.[0].z; a = { x: x - perp.x * h, z: z - perp.z * h }; b = { x: x + perp.x * h, z: z + perp.z * h }; }
    return { cells: lineCells(a, b), x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, a, b };
  }
  F.workShape = workShape;
  const costOf = (p, shape) => {
    if (!LINES.includes(p)) return T.cost[p];
    const n = shape ? workShape(p, shape).cells.length : T.works.defCells;
    return Math.max(1, Math.round(T.cost[p] + T.works.perCell * Math.max(1, n)));
  };
  F.costOf = costOf;

  // ---------- people ----------
  let HASH = new Map();
  function buildHash() {
    HASH = new Map();
    for (const u of F.units) {
      if (u.state === 'dead' || u.state === 'gone') continue;
      const k = (Math.floor(u.e.x / 4) + 500) * 4096 + Math.floor(u.e.z / 4) + 500;
      let a = HASH.get(k); if (!a) HASH.set(k, a = []); a.push(u);
    }
  }
  function near(x, z, r, fn) {
    const x0 = Math.floor((x - r) / 4), x1 = Math.floor((x + r) / 4), z0 = Math.floor((z - r) / 4), z1 = Math.floor((z + r) / 4);
    for (let bx = x0; bx <= x1; bx++) for (let bz = z0; bz <= z1; bz++) { const a = HASH.get((bx + 500) * 4096 + bz + 500); if (a) for (const v of a) fn(v); }
  }
  const nerveScale = (u) => clamp(1.5 - u.str / 100, 0.5, 1.5);
  const tierMul = (d) => T.tierMul[clamp(d, -2, 2) + 2];
  const famKey = (u) => u.side * 100 + u.band;
  function breakAt(u) { const b = u.str < T.softBelow ? T.breakAtSoft : T.breakAt; return u.kind === 'champ' ? b * 0.3 : b; }
  // earthworks underfoot only slow: climbing a ridge, crossing a trench, wading a pond
  function groundMul(u, ux, uz) {
    const ahead = G.workAt(u.e.x + ux * 0.7, u.e.z + uz * 0.7), here = G.workAt(u.e.x, u.e.z);
    let m = 1;
    for (const w of [here, ahead]) {
      if (!w) continue;
      if (w.pond) m = Math.min(m, T.pondSlow);
      else if (w.h > 0) m = Math.min(m, T.ridgeSlow);
      else if (w.h < 0) m = Math.min(m, T.trenchSlow);
    }
    return m;
  }
  function rainMul(x, z) { for (const r of F.rains) if (Math.hypot(x - r.x, z - r.z) < r.r) return T.rain.slow; return 1; }
  // the way across the river is by a ford
  function waypoint(u, tx, tz) {
    const rx0 = G.riverX(u.e.z), rx1 = G.riverX(tz);
    const s0 = Math.sign(u.e.x - rx0), s1 = Math.sign(tx - rx1);
    if (s0 === s1 || !s0 || !s1) { u.wpt = null; return null; }
    if (!u.wpt) { let best = null; for (const f of G.fords) { const d = Math.abs(u.e.z - f.z) + Math.abs(tz - f.z); if (!best || d < best.d) best = { f, d }; } u.wpt = best.f; }
    const f = u.wpt, fx = G.riverX(f.z);
    const zz = clamp(u.e.z, f.z - f.half + 0.8, f.z + f.half - 0.8);
    if (Math.abs(u.e.x - fx) > 3.5) return { x: fx + s0 * 2.5, z: Math.abs(u.e.x - fx) > 8 ? f.z : zz };
    return { x: fx - s0 * 4, z: zz };
  }
  function moveToward(u, tx, tz, spd, dt) {
    const e = u.e;
    const wp = waypoint(u, tx, tz);
    if (wp) { tx = wp.x; tz = wp.z; }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { u.moving = false; return; }
    let ux = dx / d, uz = dz / d;
    if (u.sideT > 0) { u.sideT -= dt; const sx = ux + perp.x * u.side0 * 1.6, sz = uz + perp.z * u.side0 * 1.6, l = Math.hypot(sx, sz); ux = sx / l; uz = sz / l; }
    const sp = spd * groundMul(u, ux, uz) * rainMul(e.x, e.z);
    const x0 = e.x, z0 = e.z;
    const step = Math.min(sp * dt, d);
    // deep water is no way: the river is crossed at the fords
    if (G.isDeep(e.x + ux * (step + 0.3), e.z + uz * (step + 0.3))) { u.stuckT += dt; if (u.stuckT > 0.5) { u.stuckT = 0; u.side0 = Math.random() < 0.5 ? -1 : 1; u.sideT = 1; } u.moving = false; return; }
    stepToward(W, e, e.x + ux * 2, e.z + uz * 2, sp, dt);
    const moved = Math.hypot(e.x - x0, e.z - z0);
    u.moving = moved > sp * dt * 0.15 || e.jumpV != null;
    if (moved < sp * dt * 0.1 && e.jumpV == null) { u.stuckT += dt; if (u.stuckT > 0.8) { u.stuckT = 0; u.side0 = Math.random() < 0.5 ? -1 : 1; u.sideT = 1.2; } }
    else u.stuckT = Math.max(0, u.stuckT - dt);
    env.ground(e, dt);
  }
  function face(u, x, z) { const dx = x - u.e.x, dz = z - u.e.z; if (dx * dx + dz * dz > 0.01) u.e.yawT = Math.atan2(dx, dz); }
  const setPose = (u, pose) => { if (u.pose !== pose) { u.pose = pose; u.poseT = 0; } };
  function unitSpeed(u) { let s = T.speed * (u.kind === 'champ' ? 1.05 : 1); if (u.provoked > 0) s *= 1 + T.provoke.bonus; return s; }
  function anyFoeWithin(u, r) { let hit = false; near(u.e.x, u.e.z, r, (v) => { if (!hit && v.side !== u.side && v.side !== 2 && v.state === 'fight' && D(u, v) < r) hit = true; }); return hit; }
  const high = (u, v) => u.e.y - v.e.y >= T.highAt;
  const slingRange = (u, v) => T.slingRange * (v && high(u, v) ? T.highRange : 1);
  const validTarget = (u, v) => v && v.state === 'fight' && (u.side !== 0 || !u.post || Math.hypot(v.e.x - u.post.x, v.e.z - u.post.z) <= T.leashYours + 3 || dxz(v, H.x, H.z) <= T.hearthDefend + 2);
  function findTarget(u) {
    let aggro = u.side === 0 ? T.aggroYours : T.aggroTheirs;
    if (u.kind === 'sling') aggro = Math.max(aggro, T.slingRange * T.highRange + 1);
    const leash = u.side === 0 && u.post ? T.leashYours : Infinity;
    let best = null, bd = Infinity;
    near(u.e.x, u.e.z, aggro, (v) => {
      if (v === u || (v.state !== 'fight' && v.state !== 'flee') || v.side === u.side) return;
      if (v.side === 2 && v.owner === u.side) return;
      let d = D(u, v);
      if (v.kind === 'wolf' && d > 3) return;
      if (d > aggro) return;
      if (v.state === 'flee') d += 7;
      d += (v.engaged ?? 0) * 2.2; // spread out: one already beset by two is a worse pick than a free one
      if (leash < Infinity && Math.hypot(v.e.x - u.post.x, v.e.z - u.post.z) > leash) return;
      if (d < bd) { bd = d; best = v; }
    });
    // anyone of yours with nothing to fight runs back when raiders close on the hearth
    if (!best && u.side === 0) for (const v of F.units) {
      if (v.side !== 1 || v.state !== 'fight' || dxz(v, H.x, H.z) > T.hearthDefend) continue;
      const d = D(u, v) + (v.engaged ?? 0) * 3;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  function familyTick() {
    const fam = {};
    for (const u of F.units) {
      if (!alive(u) || u.kind === 'wolf' || u.kind === 'beast') continue;
      const k = famKey(u);
      let f = fam[k]; if (!f) fam[k] = f = { n: 0, fight: 0, nonChamp: 0, nerve: 0, flee: 0, side: u.side, band: u.band, str: 0, x: 0, z: 0 };
      f.n++; f.nerve += u.nerve; f.str += u.str; f.x += u.e.x; f.z += u.e.z;
      if (u.kind !== 'champ') f.nonChamp++;
      if (u.state === 'fight') f.fight++; else f.flee++;
    }
    for (const k in fam) {
      const f = fam[k], old = F.fam[k] || {};
      f.nerve /= f.n; f.str /= f.n; f.x /= f.n; f.z /= f.n; f.retreat = old.retreat || false;
      if (!f.retreat && f.fight > 0 && f.nerve < breakAt({ str: f.str, kind: 'fighter' })) {
        f.retreat = true;
        for (const u of F.units) if (famKey(u) === +k && u.state === 'fight') { u.state = 'flee'; u.target = null; }
        if (f.side === 0) { F.stats.famBreaks++; env.fx('break', { x: f.x, z: f.z, band: f.band, text: `The ${env.bands[f.band]?.name ?? ''} family breaks and falls back` }); }
        else env.fx('theirBreak', { x: f.x, z: f.z, text: 'They break!' });
      } else if (f.retreat && f.nerve >= T.rallyAt) {
        f.retreat = false;
        for (const u of F.units) if (famKey(u) === +k && u.state === 'flee') u.state = 'fight';
        if (f.side === 0) env.fx('rally', { x: f.x, z: f.z, band: f.band, text: `The ${env.bands[f.band]?.name ?? ''} family comes back` });
      } else if (!f.retreat && f.flee > 0 && f.nerve >= 40) for (const u of F.units) if (famKey(u) === +k && u.state === 'flee') u.state = 'fight';
    }
    F.fam = fam;
  }
  function updateUnits(dt) {
    buildHash();
    if (F.phase !== 'calm') familyTick();
    const champs = F.units.filter((u) => u.kind === 'champ' && u.state === 'fight');
    for (const u of F.units) u.engaged = 0;
    for (const u of F.units) if (u.target && u.state === 'fight') u.target.engaged = (u.target.engaged ?? 0) + 1;
    for (const u of F.units) {
      if (u.state === 'dead' || u.state === 'gone') continue;
      u.poseT += dt; u.atk -= dt;
      if (u.hitFlash > 0) u.hitFlash -= dt;
      if (u.blessed > 0) { u.blessed -= dt; if (u.blessed <= 0) { u.blessSave = false; env.look?.bless(u, false); } }
      if (u.provoked > 0) u.provoked -= dt;
      if (u.paused > 0) u.paused -= dt;
      if (u.boost > 0) { u.boost -= dt; if (u.boost <= 0) env.look?.bless(u, false); }
      if (u.burning > 0 && alive(u)) { u.burning -= dt; damage(u, T.burn.dps * dt, u.burnBy ?? 1, 'fire'); if (!alive(u) && u.state !== 'wounded') continue; }
      u.moving = false;
      if (u.state === 'wounded') { updateWounded(u, dt); continue; }
      if (u.kind === 'wolf' || u.kind === 'beast') { updateWolf(u, dt); continue; }
      if (u.frozen > 0) { u.frozen -= dt; setPose(u, 'cower'); continue; }
      if (F.phase === 'calm') { calmStep(u, dt); continue; }
      if (F.phase === 'ending' || F.phase === 'over') { endStep(u, dt); continue; }
      const ci = cell(u.e.x, u.e.z);
      if (ci >= 0 && burn[ci] > 0) {
        damage(u, T.fire.dps * burnPow[ci] * dt, burnSide[ci], 'fire');
        u.nerve -= (u.str < 30 ? 14 : 8) * dt;
        if (!alive(u)) continue;
      }
      const foeNear = anyFoeWithin(u, 3);
      if (!foeNear) u.nerve += T.nerveRegen * dt;
      for (const c of champs) if (c !== u && c.side === u.side && D(c, u) < T.champAura) { u.nerve += T.champAuraRegen * dt; break; }
      u.nerve = Math.min(100, u.nerve);
      if (u.state === 'flee') { updateFlee(u, dt, foeNear); continue; }
      if (ci >= 0 && burn[ci] > 0) { const d = fireEscape(u); if (d) { moveToward(u, d.x, d.z, unitSpeed(u) * 1.2, dt); continue; } }
      u.retarget -= dt;
      if (u.retarget <= 0 || !validTarget(u, u.target)) { u.retarget = 0.35; u.target = findTarget(u); }
      const tg = u.target, spd = unitSpeed(u);
      if (tg) {
        const d = D(u, tg), reach = u.kind === 'sling' ? slingRange(u, tg) : T.reach;
        if (d <= reach) { face(u, tg.e.x, tg.e.z); if (u.atk <= 0) attack(u, tg, d); else if (!(u.pose === 'swing' || u.pose === 'thrust') || u.poseT > 0.75) setPose(u, 'brace'); }
        else if (u.paused <= 0) { const k = u.kind === 'sling' ? (d - reach + 0.3) / d : (d - 1) / d; moveToward(u, u.e.x + (tg.e.x - u.e.x) * Math.min(1, k + 0.05), u.e.z + (tg.e.z - u.e.z) * Math.min(1, k + 0.05), spd, dt); setPose(u, 'brace'); }
      } else if (u.paused <= 0) idle(u, spd, dt);
      else setPose(u, 'brace');
    }
    separate(dt);
  }
  function calmStep(u, dt) {
    const s = u.slot ?? u.post;
    if (!s) return;
    if (dxz(u, s.x, s.z) > 0.5) { moveToward(u, s.x, s.z, u.side === 1 ? T.speed * 0.85 : T.speed * 1.1, dt); setPose(u, 'brace'); }
    else { face(u, u.side === 0 ? env.muster.x : H.x, u.side === 0 ? env.muster.z : H.z); setPose(u, u.side === 1 && u.id % 3 === 0 ? 'rally' : 'brace'); }
  }
  function endStep(u, dt) {
    const won = F.result?.win;
    if (u.side === 0) setPose(u, won ? 'cheer' : 'cower');
    else if (won) { moveToward(u, env.spawn.x, env.spawn.z, T.speed * 1.2, dt); setPose(u, 'brace'); }
    else setPose(u, 'cheer');
  }
  function updateWounded(u, dt) {
    const tg = u.side === 0 ? { x: H.x - dir.x * 5, z: H.z + (u.id % 5 - 2) * 1.2 } : env.spawn;
    if (dxz(u, tg.x, tg.z) < 1.2) { u.state = 'gone'; u.limp = true; env.look?.gone(u); return; }
    moveToward(u, tg.x, tg.z, T.speed * T.woundedSpeed, dt);
    setPose(u, 'stagger');
    u.limp = true;
  }
  function idle(u, spd, dt) {
    if (u.side === 0) {
      const s = u.slot ?? u.post;
      if (s && dxz(u, s.x, s.z) > 0.6) { moveToward(u, s.x, s.z, spd * 0.9, dt); setPose(u, 'brace'); }
      else { face(u, env.muster.x, env.muster.z); setPose(u, 'brace'); }
      return;
    }
    moveToward(u, H.x, H.z, spd, dt);
    setPose(u, 'brace');
  }
  function updateFlee(u, dt, foeNear) {
    const tx = u.side === 0 ? H.x - dir.x * 3 : env.muster.x + dir.x * 6, tz = u.side === 0 ? H.z + (u.band - 1.5) * 2 : env.muster.z;
    const there = dxz(u, tx, tz) < 2.2;
    if (!there) moveToward(u, tx, tz, T.speed * T.fleeSpeed, dt); else setPose(u, 'brace');
    if (!foeNear) u.nerve = Math.min(100, u.nerve + (there ? T.hearthRegen : T.fleeRegen) * dt);
    if (there) u.hp = Math.min(u.maxHp, u.hp + 2.5 * dt);
  }
  function fireEscape(u) {
    let best = null, bs = Infinity;
    const gx = u.side === 0 && u.post ? u.post.x : u.e.x - dir.x * 3, gz = u.side === 0 && u.post ? u.post.z : u.e.z;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, x = u.e.x + Math.cos(a) * 1.5, z = u.e.z + Math.sin(a) * 1.5, i = cell(x, z);
      if ((i >= 0 && burn[i] > 0) || G.isDeep(x, z)) continue;
      const s = Math.hypot(x - gx, z - gz);
      if (s < bs) { bs = s; best = { x, z }; }
    }
    return best;
  }
  function attack(u, tg, d) {
    if (u.kind === 'sling') {
      u.atk = T.slingEvery * rand(0.9, 1.1);
      setPose(u, 'swing');
      F.shots.push({ x0: u.e.x, y0: u.e.y + 1.6, z0: u.e.z, t: 0, dur: Math.max(0.25, d / 14), att: u, tg, dmg: u.dmg * (high(u, tg) ? T.highDmg : 1) });
      return;
    }
    u.atk = T.hitEvery * rand(0.9, 1.1);
    setPose(u, u.thrust ? 'thrust' : 'swing');
    hitUnit(u, tg, u.dmg);
    if (tg.state === 'fight' && tg.pose === 'brace') setPose(tg, Math.random() < 0.5 ? 'block' : 'recoil');
    env.look?.spark(u, tg);
  }
  function updateShots(dt) {
    for (const s of F.shots) { s.t += dt; if (s.t >= s.dur) { s.done = true; if (alive(s.tg)) hitUnit(s.att, s.tg, s.dmg); } }
    F.shots = F.shots.filter((s) => !s.done);
  }
  function hitUnit(att, def, base) {
    let m = att.pow;
    if (att.side === 1 && def.side === 0) m *= tierMul(att.tier - def.tier);
    if (att.boost > 0) m *= 1 + T.boost.bonus;
    if (att.provoked > 0) m *= 1 + T.provoke.bonus;
    if (def.provoked > 0) m *= 1.2;
    if (att.kind === 'wolf' || att.kind === 'beast') { damage(def, base * m, att.owner, 'wolf'); def.nerve -= 3; }
    else damage(def, base * m, att.side, 'hand');
    if (att.boost > 0) { att.hp = Math.min(att.maxHp, att.hp + base * m * T.boost.steal); if (F.lines.length < 24) F.lines.push({ x0: def.e.x, z0: def.e.z, x1: att.e.x, z1: att.e.z, t: 0, dur: 0.4, side: att.side }); } // heals as it hits
  }
  const familyHolds = (u) => { if (u.kind !== 'champ') return false; const f = F.fam[famKey(u)]; return !!(f && f.nonChamp > 0); };
  function damage(u, d, bySide, src) {
    if (!alive(u)) return;
    u.hp -= d;
    if (u.hp <= 0 && familyHolds(u)) { u.hp = 1; if (!u.heldMsg) { u.heldMsg = true; env.fx('word', { x: u.e.x, z: u.e.z, text: `${u.side === 0 ? 'Their' : 'His'} family holds ${u.name || 'the champion'} up`, tone: 'soft' }); } }
    if (u.kind !== 'wolf') u.nerve -= d * T.nerveLossPerDamage * nerveScale(u);
    u.hitFlash = 0.12;
    if (u.hp <= 0) down(u, bySide, src);
  }
  function down(u, bySide, src, sure = false) {
    const S = F.stats;
    if (u.kind === 'wolf' || u.kind === 'beast') { u.state = 'dead'; env.look?.gone(u); if (u.kind === 'beast') env.fx('word', { x: u.e.x, z: u.e.z, text: `${u.name} falls`, tone: u.owner === 0 ? 'bad' : 'good' }); return; }
    near(u.e.x, u.e.z, 4, (v) => { if (v.side === u.side && alive(v)) v.nerve -= T.allyDeathNerve * 0.5; });
    if (u.kind === 'champ') for (const v of F.units) if (v.side === u.side && alive(v)) v.nerve -= T.champDeathNerve * 0.5;
    if (!sure && Math.random() >= (u.kind === 'champ' ? T.champDeathChance : T.deathChance) * u.deathMul) {
      u.state = 'wounded'; u.hp = 0; u.target = null; u.frozen = 0;
      if (u.side === 0) S.myWounded++; else { S.theirWounded++; if (bySide === 0) { if (src === 'hand') S.byHand++; else S.byGod++; } }
      if (u.kind === 'champ') { if (u.side === 0) S.champsWounded.push(u.name); env.fx('champWounded', { x: u.e.x, z: u.e.z, side: u.side, text: `${u.name} is carried off, wounded` }); }
      return;
    }
    u.state = 'dead'; u.hp = 0;
    near(u.e.x, u.e.z, 4, (v) => { if (v.side === u.side && alive(v)) v.nerve -= T.allyDeathNerve * 0.5; });
    if (u.kind === 'champ') for (const v of F.units) if (v.side === u.side && alive(v)) v.nerve -= T.champDeathNerve * 0.5;
    if (u.side === 0) {
      S.myDead++;
      if (bySide === 0) { if (src === 'fire') S.ffFire++; else if (src === 'wolf') S.ffWolf++; else if (src === 'smite') S.ffSmite++; }
      if (u.kind === 'champ') S.myChampsLost.push({ name: u.name, band: u.band });
    } else {
      S.theirDead++;
      if (bySide === 0) { if (src === 'hand') S.byHand++; else S.byGod++; }
      if (u.kind === 'champ') S.theirChampsLost.push(u.name);
    }
    if (u.kind === 'champ') env.fx('champFalls', { x: u.e.x, z: u.e.z, side: u.side, text: `${u.name} falls` });
    env.died(u, src === 'hand' ? 'blow' : src);
  }
  function updateWolf(w, dt) {
    w.life -= dt;
    if (w.life <= 0) { w.state = 'gone'; env.look?.gone(w); return; }
    if (w.scared > 0) { w.scared -= dt; moveToward(w, w.e.x + w.sx * 3, w.e.z + w.sz * 3, T.wolfSpeed * 1.3, dt); if (w.scared <= 0) { w.state = 'gone'; env.look?.gone(w); } return; }
    const beast = w.kind === 'beast', spd = beast ? T.speed * 1.15 : T.wolfSpeed;
    if (w.goal) { // on its way in from its side's edge to where it was sent
      if (Math.hypot(w.e.x - w.goal.x, w.e.z - w.goal.z) < 1.5) w.goal = null;
      else { moveToward(w, w.goal.x, w.goal.z, spd * (beast ? 1.6 : 1.3), dt); return; }
    }
    let fire = false;
    if (!beast) forCells(w.e.x, w.e.z, 2, (i) => { if (burn[i] > 0) fire = true; });
    if (fire) { scareWolf(w, w.e.x - Math.sin(w.e.yawT ?? 0), w.e.z - Math.cos(w.e.yawT ?? 0)); return; }
    w.retarget -= dt;
    if (w.retarget <= 0 || !w.target || w.target.state !== 'fight') {
      w.retarget = 0.4; let best = null, bd = T.aggroWolf;
      near(w.e.x, w.e.z, T.aggroWolf * (beast ? 1.4 : 1), (v) => { if (v.kind === 'wolf' || v.state !== 'fight' || v.side === w.owner || (v.side === 2 && v.owner === w.owner)) return; const d = D(w, v); if (d < bd) { bd = d; best = v; } });
      w.target = best;
    }
    const tg = w.target;
    if (tg) { const d = D(w, tg); if (d <= T.reach * (beast ? 1.2 : 0.9)) { face(w, tg.e.x, tg.e.z); if (w.atk <= 0) { w.atk = beast ? T.gorilla.every : T.wolfEvery; hitUnit(w, tg, w.dmg); if (beast) { w.pose = 'swing'; w.poseT = 0; } } } else moveToward(w, tg.e.x, tg.e.z, spd, dt); }
    else moveToward(w, beast ? (w.owner === 0 ? env.muster.x : H.x) : w.e.x + Math.sin(w.e.yawT ?? 0) * 2, beast ? (w.owner === 0 ? env.muster.z : H.z) : w.e.z + Math.cos(w.e.yawT ?? 0) * 2, spd * (beast ? 0.7 : 0.4), dt);
  }
  function scareWolf(w, fx, fz) { const dx = w.e.x - fx, dz = w.e.z - fz, l = Math.hypot(dx, dz) || 1; w.sx = dx / l; w.sz = dz / l; w.scared = 1.4; w.target = null; }
  function separate(dt) {
    for (const u of F.units) {
      if (u.state === 'dead' || u.state === 'gone') continue;
      near(u.e.x, u.e.z, 1.2, (v) => {
        if (v === u || v.state === 'dead' || v.state === 'gone') return;
        let dx = u.e.x - v.e.x, dz = u.e.z - v.e.z; const d = Math.hypot(dx, dz), min = u.kind === 'wolf' || v.kind === 'wolf' ? 0.8 : 1.0;
        if (d >= min) return;
        if (d < 1e-3) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; } else { dx /= d; dz /= d; }
        if (!G.isDeep(u.e.x + dx * 0.4, u.e.z + dz * 0.4)) tryMove(W, u.e, dx, dz, Math.min(min - d, 2.5 * dt));
      });
    }
  }
  function checkEnd(dt) {
    let at = 0;
    for (const u of F.units) if (u.side === 1 && u.state === 'fight' && dxz(u, H.x, H.z) < T.hearthR) at++;
    F.hearthN = at;
    if (at >= T.hearthTakers) F.hearthT += dt; else F.hearthT = Math.max(0, F.hearthT - dt * 0.5);
    F.hearthMax = Math.max(F.hearthMax, F.hearthT);
    if (F.hearthT >= T.hearthSeconds) return endBattle(false, 'hearth');
    if (!F.units.some((u) => u.side === 0 && u.kind !== 'wolf' && alive(u))) return endBattle(false, 'broken');
    if (F.ft >= T.dawnAt) return endBattle(true, 'dawn');
    if (F.waveIdx === 2 && !F.spawnQueue.length && !F.units.some((u) => u.side === 1 && u.state === 'fight')) return endBattle(true, 'routed');
  }

  // ---------- spells ----------
  function cdOf(g, p) { return (T.cdTiers[p] ?? 20) * g.cdMul; }
  function radiusOf(p, size) {
    const sq = Math.sqrt(Math.max(0.05, size));
    switch (p) {
      case 'fire-area': return T.fire.r * sq;
      case 'rain': return T.rain.r * sq;
      case 'wolves': return 2.4;
      case 'gorilla': return 1.6;
      case 'kill': case 'burn': case 'heal-small': return 1.2;
      case 'revive': return T.revive.r;
      case 'heal-area': return T.heal.r * sq;
      case 'boost-area': return T.boost.r * sq;
      case 'lava': return T.lava.r * Math.sqrt(clamp(size, 0.4, 1.1));
      case 'pond': return T.works.pondR;
      case 'lower': case 'raise': return T.works.defCells / 2;
      default: return 2.5;
    }
  }
  F.radiusOf = radiusOf;
  const asShape = (s, z) => (typeof s === 'number' ? { x: s, z } : s ?? {});
  const centreOf = (s) => (s.line ? { x: (s.line[0].x + s.line[1].x) / 2, z: (s.line[0].z + s.line[1].z) / 2 } : { x: s.x, z: s.z });
  const fallenNear = (side, x, z, r) => { let b = null, bd = r; for (const u of F.units) { if (u.side !== side || (u.state !== 'dead' && u.state !== 'wounded') || u.kind === 'wolf' || u.kind === 'beast') continue; const d = dxz(u, x, z); if (d < bd) { bd = d; b = u; } } return b; };
  // what a cast would do here, for the aim line: { ok, r, why, text, cost, cells? }
  F.aimInfo = (p, s0, z0) => {
    const s = asShape(s0, z0), c = centreOf(s), g = myGod, r = radiusOf(p, g.size), cost = costOf(p, s);
    let why = refusal(p, cost);
    let foes = 0, mine = 0;
    for (const u of F.units) { if (!alive(u) || u.kind === 'wolf' || u.kind === 'beast') continue; if (dxz(u, c.x, c.z) <= r + 0.4) { if (u.side === 1) foes++; else mine++; } }
    let text = '', cells = null;
    if (WORKS.includes(p)) { const ws = workShape(p, s); cells = ws.cells; text = p === 'pond' ? 'a pond: slows them, will not burn' : `${p === 'raise' ? 'raised land' : 'lowered land'}, ${cells.length} long: slows them`; if (!cells.length && !why) why = 'Nothing can be dug here.'; }
    else if (p === 'fire-area') text = `${foes} of theirs${mine ? `, and ${mine} of yours` : ''} in the flames`;
    else if (p === 'lava') text = `${foes} of theirs${mine ? `, and ${mine} of yours` : ''} stand here: whoever stays dies`;
    else if (p === 'kill' || p === 'burn') { const t = nearestUnit(1, c.x, c.z, 2.5) ?? nearestUnit(2, c.x, c.z, 2.5); text = t ? `${t.name || (t.kind === 'beast' ? 'their beast' : t.kind === 'wolf' ? 'a wolf' : 'a raider')}` : 'nobody here'; if (!t && !why) why = 'Point at one of them.'; }
    else if (p === 'heal-small') { const t = nearestUnit(0, c.x, c.z, 2.5); text = t ? (t.p?.name ?? 'one of yours') : 'nobody of yours here'; if (!t && !why) why = 'Point at one of yours.'; }
    else if (p === 'revive') { const t = fallenNear(0, c.x, c.z, T.revive.r); text = t ? `${t.p?.name ?? 'one of yours'} gets up` : 'none of yours has fallen here'; if (!t && !why) why = 'Point at one of yours who fell.'; }
    else if (p === 'wolves') text = 'the pack runs at the nearest raiders';
    else if (p === 'gorilla') text = 'a great beast fights for you for a while';
    else if (p === 'rain') text = `no fire will take here${foes ? `; ${foes} of theirs slowed` : ''}`;
    else if (p === 'heal-area' || p === 'boost-area') text = `${mine} of yours`;
    return { ok: !why, why, r, text, cost, power: p, cells, x: c.x, z: c.z };
  };
  function refusal(p, cost = costOf(p)) {
    const g = myGod;
    if (!HAND.includes(p)) return `${PM[p].name} was not brought to this battle.`;
    if (F.phase !== 'fight' && F.phase !== 'calm') return 'The fighting is over.';
    if (p === 'revive' && g.usedRevive) return 'Bring back works once a battle.';
    if (g.lock[p] > 0) return `${PM[p].name} again in ${Math.ceil(g.lock[p])} s.`;
    if (g.bar < cost - 1e-6) return `Not enough yet: ${PM[p].name} needs ${cost}.`;
    if (!F.quietOk && T.quiet.includes(p)) return `They do not believe: ${PM[p].name} does not take on people with so little faith.`;
    return null;
  }
  F.refusal = refusal;
  // your cast: { ok, text }
  F.cast = (p, s0, z0, o = {}) => {
    if (!POWERS.includes(p)) return { ok: false, text: 'That is not a battle spell.' };
    const s = asShape(s0, z0), c = centreOf(s);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) return { ok: false, text: 'Point at the ground.' };
    const cost = costOf(p, s);
    const a = F.aimInfo(p, s);
    const why = a.why ?? (F.voice > 0 ? 'One at a time.' : null);
    if (why) { if (!F.quietOk && T.quiet.includes(p)) F.stats.refused++; return { ok: false, text: why }; }
    const g = myGod;
    g.bar -= cost; g.spent += cost; g.lock[p] = WORKS.includes(p) ? T.worksLockout : T.lockout; g.casts++; g.lastCast = F.time; F.voice = T.voiceGap; F.stats.casts++;
    if (p === 'revive') g.usedRevive = true;
    F.lastPlayerPower = p; F.lastPlayerCast = F.time;
    if ((p === 'kill' || p === 'burn') && !o.target) o.target = nearestUnit(1, c.x, c.z, 2.5) ?? nearestUnit(2, c.x, c.z, 2.5);
    if (p === 'heal-small' && !o.target) o.target = nearestUnit(0, c.x, c.z, 2.5);
    if (p === 'revive' && !o.target) o.target = fallenNear(0, c.x, c.z, T.revive.r);
    const shape = { ...s, x: c.x, z: c.z };
    F.windups.push({ side: 0, power: p, shape, t: 0, dur: WORKS.includes(p) ? 0.05 : T.windup, size: g.size, o });
    env.fx('cast', { side: 0, power: p, x: c.x, z: c.z, r: radiusOf(p, g.size) });
    return { ok: true, text: `${PM[p].name}.` };
  };
  function tellDur(g, p) {
    if (p === 'lava') return T.tell * 1.25;
    if (SMALL.includes(p)) return T.tellSmall * 1.2;
    return T.tell * (g.pers ? g.pers.tellMul : 1);
  }
  function enemyCast(g, o) {
    const p = o.power;
    g.casts++; g.lastCast = F.time; g.opened = true; F.stats.theirCasts++;
    g.cds[p] = cdOf(g, p);
    const r = o.mode === 'flatten' ? T.ridge.flattenR : radiusOf(p, g.size);
    const t = { side: 1, power: p, x: o.x, z: o.z, shape: o.shape ?? { x: o.x, z: o.z }, r, t: 0, dur: tellDur(g, p), size: g.size, target: o.target || null, mode: o.mode || null, done: false, aim: o.aim ?? '' };
    if (WORKS.includes(p)) t.cells = o.mode === 'flatten' ? [...G.works.values()].filter((w) => Math.hypot(w.x + 0.5 - o.x, w.z + 0.5 - o.z) <= T.ridge.flattenR).map((w) => ({ x: w.x, z: w.z })) : workShape(p, t.shape).cells;
    F.tells.push(t);
    env.fx('tell', { power: p, x: o.x, z: o.z, r, dur: t.dur, aim: t.aim });
  }

  function applyPower(side, p, shape, size, o = {}) {
    const x = shape.x, z = shape.z;
    switch (p) {
      case 'fire-area': doFire(side, x, z, size); break;
      case 'rain': doRain(side, x, z, size); break;
      case 'lower': case 'raise': case 'pond': {
        if (o.mode === 'flatten') { const cells = []; for (const w of G.works.values()) if (Math.hypot(w.x + 0.5 - x, w.z + 0.5 - z) <= T.ridge.flattenR) cells.push({ x: w.x, z: w.z }); if (cells.length) startWork('flatten', cells, side); break; }
        const ws = workShape(p, shape);
        if (ws.cells.length) startWork(p === 'raise' ? 'ridge' : p === 'lower' ? 'trench' : 'pond', ws.cells, side);
        break;
      }
      case 'wolves': doWolves(side, x, z, size); break;
      case 'gorilla': doGorilla(side, x, z, size); break;
      case 'kill': doKill(side, x, z, size, o); break;
      case 'burn': doBurn(side, x, z, size, o); break;
      case 'heal-small': doHealSmall(side, x, z, size, o); break;
      case 'revive': doRevive(side, x, z, size, o); break;
      case 'heal-area': doHeal(side, x, z, size); break;
      case 'boost-area': doBoost(side, x, z, size); break;
      case 'lava': doLava(side, x, z, size); break;
    }
    env.fx('land', { side, power: p, x, z, r: radiusOf(p, size) });
    if (side === 1) shockAt(p, x, z, size);
  }
  function doFire(side, x, z, size, quiet) {
    const r = radiusOf('fire-area', size), s1 = Math.min(1.1, size);
    let cells = 0, dry = 0;
    forCells(x, z, r, (i) => {
      cells++;
      if (wet[i] > 0 || G.isWet(cx(i), cz(i))) return;
      dry++;
      burn[i] = Math.max(burn[i], T.fire.seconds * (0.5 + 0.5 * Math.min(1, size)));
      burnPow[i] = Math.max(burnPow[i], s1); burnSide[i] = side;
      F.scorched.add(i);
    });
    const dryFrac = cells ? dry / cells : 1;
    let scattered = false;
    for (const u of F.units) {
      if (!alive(u)) continue;
      const d = dxz(u, x, z);
      if (u.kind === 'wolf') { if (d < r + T.wolves.scareR) { if (!(u.scared > 0) && side === 0 && u.owner === 1) scattered = true; scareWolf(u, x, z); } continue; }
      if (d <= r + 0.3) { damage(u, T.fire.burst * s1 * dryFrac, side, 'fire'); u.nerve -= T.fire.nerve * dryFrac * nerveScale(u); }
    }
    if (dryFrac < 0.4 && !quiet) {
      if (side === 1) answered(x, z, 'Soaked!', 'their fire hisses out on wet ground');
      else env.fx('word', { x, z, text: 'the fire hisses out on wet ground', tone: 'soft' });
    }
    if (scattered) answered(x, z, 'Scattered!', 'their pack bolts from your fire');
  }
  function doRain(side, x, z, size) {
    const r = radiusOf('rain', size);
    F.rains.push({ x, z, r, t: 0, dur: T.rain.seconds * (0.5 + 0.5 * Math.min(1, size)), side });
    let cooled = 0;
    forCells(x, z, r, (i) => { burn[i] = 0; wet[i] = T.rain.wet; if (lavaW[i] > 0 || lavaR[i] > 0) { lavaW[i] = 0; lavaR[i] = 0; cooled++; G.rock?.(Math.floor(cx(i)), Math.floor(cz(i))); } });
    for (const u of F.units) if (u.burning > 0 && dxz(u, x, z) < r) u.burning = 0;
    if (cooled) { env.look?.dust(cooled ? [{ x: Math.floor(x), z: Math.floor(z) }] : [], 'pond'); if (side === 0 && lavaSide === 1) answered(x, z, 'Cooled!', 'their lava sets into rock'); else env.fx('word', { x, z, text: 'the lava cools to rock', tone: 'soft' }); }
  }
  function doWolves(side, x, z, size) {
    const n = Math.max(1, Math.round(T.wolves.n * Math.min(1.2, size)));
    let fire = false, myFire = false;
    forCells(x, z, 2.5, (i) => { if (burn[i] > 0) { fire = true; if (burnSide[i] === 0) myFire = true; } });
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      const ex = side === 0 ? G.bounds.x0 + 2 : G.bounds.x1 - 2;
      const e = { x: ex + Math.cos(a) * 1.1, z: z + Math.sin(a) * 1.6, y: 16, r: 0.3, ry: a, yawT: side === 0 ? Math.PI / 2 : -Math.PI / 2, kind: 'wolf' };
      env.ground(e, 0, true);
      const w = addUnit(2, 'wolf', e, { owner: side, life: T.wolves.seconds * (0.6 + 0.4 * Math.min(1, size)) + 6 });
      w.goal = { x: x + Math.cos(a) * 1.1, z: z + Math.sin(a) * 1.1 };
      env.look?.addWolf(w);
      if (fire) scareWolf(w, x, z);
    }
    if (myFire && side === 1) answered(x, z, 'Scattered!', 'the pack bolts from the fire');
    F.effects.push({ kind: 'goal', power: 'wolves', x, z, r: 2.4, t: 0, dur: 8, side, until: () => !F.units.some((u) => u.kind === 'wolf' && u.goal && u.owner === side) });
  }
  // one great beast that fights for its god's side (it harries like a pack, but fire does not scare it)
  function doGorilla(side, x, z, size) {
    const e = { x: side === 0 ? G.bounds.x0 + 2 : G.bounds.x1 - 2, z, y: 16, r: 0.5, ry: 0, yawT: side === 0 ? Math.atan2(dir.x, dir.z) : Math.atan2(-dir.x, -dir.z), kind: 'beast' };
    env.ground(e, 0, true);
    const b = addUnit(2, 'beast', e, { owner: side, life: T.gorilla.seconds * (0.6 + 0.4 * Math.min(1, size)), name: side === 0 ? 'your beast' : 'their beast' });
    b.hp = b.maxHp = T.gorilla.hp * Math.min(1.1, size + 0.2); b.dmg = T.gorilla.dmg; b.life += 8;
    b.goal = G.isDeep(x, z) ? { x: x - dir.x * 3, z } : { x, z };
    F.effects.push({ kind: 'goal', power: 'gorilla', x: b.goal.x, z: b.goal.z, r: 1.8, t: 0, dur: 12, side, until: () => !b.goal || b.state !== 'fight' });
    env.look?.addBeast(b);
  }
  function nearestUnit(side, x, z, r) {
    let b = null, bd = r;
    for (const u of F.units) { if (!alive(u) || u.side !== side) continue; const d = dxz(u, x, z); if (d < bd) { bd = d; b = u; } }
    return b;
  }
  F.nearestUnit = nearestUnit;
  function doKill(side, x, z, size, o) {
    let tg = o.target && alive(o.target) ? o.target : null;
    if (!tg) tg = nearestUnit(1 - side, x, z, 2) || nearestUnit(2, x, z, 2);
    const bx = tg ? tg.e.x : x, bz = tg ? tg.e.z : z;
    env.fx('bolt', { side, x: bx, z: bz, y: tg?.e.y });
    if (!tg) return;
    const st = tg.side === 2 ? 0 : tg.str, dodge = clamp((st - 30) / 100, 0, 0.5);
    if (tg.kind !== 'beast' && Math.random() < dodge) { tryMove(W, tg.e, perp.x, perp.z, 0.8); env.fx('word', { x: tg.e.x, z: tg.e.z, text: 'sidestepped', tone: 'soft' }); return; }
    damage(tg, (tg.kind === 'champ' || tg.kind === 'beast' ? tg.maxHp * T.kill.champShare : T.kill.dmg) * size, side, 'smite');
    F.effects.push({ kind: 'mark', x: bx, z: bz, r: 0.9, t: 0, dur: 10, side });
  }
  function doBurn(side, x, z, size, o) {
    let tg = o.target && alive(o.target) ? o.target : null;
    if (!tg) tg = nearestUnit(1 - side, x, z, 2) || nearestUnit(2, x, z, 2);
    if (!tg) return;
    if (tg.kind === 'wolf') { scareWolf(tg, tg.e.x - 1, tg.e.z); }
    for (const v of F.units) if (v.kind === 'wolf' && alive(v) && D(v, tg) < T.burn.r + 2) scareWolf(v, tg.e.x, tg.e.z);
    tg.burning = T.burn.seconds * (0.6 + 0.4 * Math.min(1, size)); tg.burnBy = side;
    damage(tg, T.burn.burst * size, side, 'fire');
  }
  function doHealSmall(side, x, z, size, o) {
    const tg = o.target && alive(o.target) ? o.target : nearestUnit(side, x, z, 2.5);
    if (!tg) return;
    tg.hp = Math.min(tg.maxHp, tg.hp + tg.maxHp * T.healSmall.share * Math.min(1.1, size));
    tg.burning = 0;
    F.effects.push({ kind: 'pulse', power: 'heal-small', u: tg, x: tg.e.x, z: tg.e.z, r: 1.3, t: 0, dur: 1.2, side });
    if (side === 0 && F.tells.some((t) => t.power === 'burn' || t.power === 'kill')) { /* a mend in time */ }
  }
  function doRevive(side, x, z, size, o) {
    const tg = o.target && (o.target.state === 'dead' || o.target.state === 'wounded') ? o.target : fallenNear(side, x, z, T.revive.r);
    if (!tg) return;
    const was = tg.state;
    tg.state = 'fight'; tg.hp = tg.maxHp * T.revive.hp; tg.nerve = Math.max(tg.nerve, 70); tg.limp = false; tg.deadT = 0;
    if (was === 'dead') { if (tg.side === 0) { F.stats.myDead--; if (tg.p) tg.p.dead = false; } else F.stats.theirDead--; }
    else if (tg.side === 0) F.stats.myWounded--; else F.stats.theirWounded--;
    env.look?.revive(tg);
    env.fx('word', { x: tg.e.x, z: tg.e.z, text: `${tg.p?.name ?? tg.name ?? 'one of them'} gets up`, tone: side === 0 ? 'good' : 'bad' });
  }
  function doHeal(side, x, z, size) {
    const r = radiusOf('heal-area', size);
    let up = 0;
    F.effects.push({ kind: 'patch', power: 'heal-area', x, z, r, t: 0, dur: 3, side });
    for (const u of F.units) {
      if (u.side !== side || u.kind === 'wolf' || u.state === 'dead' || u.state === 'gone' || dxz(u, x, z) > r + 0.3) continue;
      if (u.state === 'wounded') { u.state = 'fight'; u.hp = 0; u.limp = false; u.nerve = Math.max(u.nerve, 50); up++; if (side === 0) F.stats.myWounded--; else F.stats.theirWounded--; }
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * T.heal.share * Math.min(1.1, size));
      u.burning = 0;
      F.effects.push({ kind: 'glow', power: 'heal-area', u, x: u.e.x, z: u.e.z, r: 0.8, t: 0, dur: 1, side });
    }
    if (up) env.fx('word', { x, z, text: up === 1 ? 'one of the fallen gets up' : `${up} of the fallen get up`, tone: 'good' });
  }
  function doBoost(side, x, z, size) {
    const r = radiusOf('boost-area', size);
    F.effects.push({ kind: 'patch', power: 'boost-area', x, z, r, t: 0, dur: 3, side });
    for (const u of F.units) if (u.side === side && alive(u) && dxz(u, x, z) <= r + 0.3) { u.boost = T.boost.seconds * (0.5 + 0.5 * Math.min(1, size)); env.look?.bless(u, true); }
  }
  // lava: the ground cracks and glows (a warning), then runs; whoever stays in it dies
  let lavaSide = -1;
  function doLava(side, x, z, size) {
    const r = radiusOf('lava', size);
    lavaSide = side;
    forCells(x, z, r, (i) => { if (G.isWet(cx(i), cz(i)) || wet[i] > 0) return; lavaW[i] = T.lava.warn; lavaR[i] = 0; lavaS[i] = side; });
  }
  function updateLava(dt) {
    let any = false;
    for (let i = 0; i < lavaW.length; i++) {
      if (lavaW[i] > 0) { any = true; lavaW[i] -= dt; if (lavaW[i] <= 0) { lavaW[i] = 0; lavaR[i] = T.lava.run; } }
      else if (lavaR[i] > 0) { any = true; lavaR[i] -= dt; if (lavaR[i] <= 0) { lavaR[i] = 0; F.scorched.add(i); } }
    }
    if (!any) return;
    for (const u of F.units) {
      if (!alive(u) && u.state !== 'wounded') continue;
      const i = cell(u.e.x, u.e.z);
      if (i < 0 || !(lavaR[i] > 0)) continue;
      if (!T.lava.friendly && u.side === lavaS[i]) continue;
      if (u.kind === 'wolf' || u.kind === 'beast') { u.state = 'dead'; env.look?.gone(u); continue; }
      if (u.state === 'wounded') { u.state = 'fight'; u.hp = 1; }
      u.hp = 0; down(u, lavaS[i], 'fire', true);
    }
  }
  function answered(x, z, word, line) { F.stats.answered++; F.stats.answeredWords.push(word); env.fx('answered', { x, z, text: word, line }); }
  function shockAt(p, x, z, size) {
    const sh = F.shock;
    if (sh < 0.15 || WORKS.includes(p) || p === 'heal-small' || p === 'heal-area' || p === 'boost-area') return;
    const r = p === 'kill' || p === 'burn' ? 2.4 : p === 'wolves' || p === 'gorilla' ? 3.5 : radiusOf(p, size);
    let n = 0;
    for (const u of F.units) {
      if (u.side !== 0 || !alive(u) || dxz(u, x, z) > r + 0.3) continue;
      u.frozen = Math.max(u.frozen, T.shockFreeze * sh);
      u.nerve -= T.shockNerve * Math.max(0, sh - 0.5) * 2;
      n++;
    }
    F.stats.shocked += n;
    if (n) env.fx('shock', { x, z, n, text: `${sh > 0.66 ? 'frozen in terror' : 'frozen in awe'}: ${n} of yours` });
  }

  // ---------- the enemy god's mind (the prototype's, on cooldowns, on the sixteen) ----------
  function countNear(list, x, z, r) { let n = 0; for (const u of list) if (dxz(u, x, z) <= r) n++; return n; }
  function centroidNear(list, x, z, r) { let sx = 0, sz = 0, n = 0; for (const u of list) if (dxz(u, x, z) <= r) { sx += u.e.x; sz += u.e.z; n++; } return n ? { x: sx / n, z: sz / n } : { x, z }; }
  function stuckSpot(own) {
    const stuck = [];
    for (const u of own) { if (u.target) continue; const w = G.workAt(u.e.x, u.e.z) ?? G.workAt(u.e.x - dir.x, u.e.z - dir.z); if (w && (w.h > 0 || w.pond)) stuck.push(w); }
    if (stuck.length < 3) return null;
    let sx = 0, sz = 0; for (const m of stuck) { sx += m.x + 0.5; sz += m.z + 0.5; }
    return { x: sx / stuck.length, z: sz / stuck.length, n: stuck.length };
  }
  const bandName = (u) => (u.side === 0 ? `the ${env.bands[u.band]?.name ?? ''} family` : 'raiders');
  const line = (x, z, n = T.works.defCells) => { const h = (n - 1) / 2; return { line: [{ x: x - perp.x * h, z: z - perp.z * h }, { x: x + perp.x * h, z: z + perp.z * h }], x, z }; };
  function evalPower(g, p) {
    const me = g.side, foe = 1 - me, foes = [], mine = [], myFlee = [];
    for (const u of F.units) {
      if (!alive(u) || u.kind === 'wolf' || u.kind === 'beast') continue;
      if (u.side === foe && u.state === 'fight') foes.push(u);
      else if (u.side === me) { if (u.state === 'fight') mine.push(u); else myFlee.push(u); }
    }
    if (me === 0 && !F.quietOk && T.quiet.includes(p)) return null;
    const best = (list, fn) => { let b = null; for (const u of list) { const s = fn(u); if (s !== null && (!b || s > b.score)) b = { x: u.e.x, z: u.e.z, score: s, unit: u }; } return b; };
    const ps = g.pers || {};
    switch (p) {
      case 'fire-area': {
        const r = radiusOf('fire-area', g.size), pen = ps.ownFire ?? 2.5;
        const b = best(foes, (u) => countNear(foes, u.e.x, u.e.z, r * 0.9) - pen * countNear(mine, u.e.x, u.e.z, r + 0.6));
        if (b) { const c = centroidNear(foes, b.x, b.z, r * 0.9); b.x = c.x; b.z = c.z; b.aim = b.unit.side === 0 ? bandName(b.unit) : ''; }
        return b && { power: p, x: b.x, z: b.z, score: b.score, aim: b.aim };
      }
      case 'lava': {
        const r = radiusOf('lava', g.size);
        const c = best(foes, (u) => { const n = countNear(foes, u.e.x, u.e.z, r * 0.8), own = countNear(mine, u.e.x, u.e.z, r + 2); return n >= 5 ? n * 0.6 - own * 2 : null; });
        return c && { power: p, x: c.x, z: c.z, score: c.score, aim: me === 1 ? bandName(c.unit) : '' };
      }
      case 'rain': {
        if (F.time - (me === 1 ? (F.lastPlayerCast ?? -99) : theirGod.lastCast) < 0.6) return null;
        let b = null;
        for (let i = 0; i < burn.length; i++) if ((burn[i] > 0.8 && burnSide[i] === foe) || ((lavaW[i] > 0 || lavaR[i] > 0) && lavaS[i] === foe)) { const n = countNear(mine, cx(i), cz(i), 3); if (n && (!b || n > b.n)) b = { x: cx(i), z: cz(i), n }; }
        if (b) return { power: p, x: b.x, z: b.z, score: 1.5 + b.n, aim: me === 1 ? 'its own people in your fire' : '' };
        return null;
      }
      case 'raise': {
        let b = null;
        if (me === 0) for (const band of env.bands) {
          if (!band.post) continue;
          const n = foes.filter((u) => dxz(u, band.post.x, band.post.z) < 16 && dxz(u, band.post.x, band.post.z) > 5).length;
          const rx = band.post.x + dir.x * 3.5, rz = band.post.z + dir.z * 3.5, w = G.workAt(rx, rz);
          if (n >= 4 && !(w && w.h > 0) && (!b || n > b.n)) b = { n, x: rx, z: rz };
        }
        return b && { power: p, ...line(b.x, b.z), score: 1.5 + b.n * 0.4 };
      }
      case 'lower': {
        if (me === 1) { const st = stuckSpot(mine); if (st) return { power: p, x: st.x, z: st.z, score: 1 + st.n * 0.8, mode: 'flatten', aim: 'your earthworks' }; }
        const c = best(foes, (u) => { const n = countNear(foes, u.e.x, u.e.z, 2.5); return n >= 4 ? n * 0.45 : null; });
        return c && { power: p, ...line(c.x, c.z), score: c.score, aim: me === 1 ? bandName(c.unit) : '' };
      }
      case 'pond': {
        const c = best(foes, (u) => { const n = countNear(foes, u.e.x, u.e.z, T.works.pondR); return n >= 4 ? n * 0.4 : null; });
        return c && { power: p, x: c.x, z: c.z, score: c.score, aim: me === 1 ? bandName(c.unit) : '' };
      }
      case 'wolves': {
        const c = best(foes, (u) => (countNear(mine, u.e.x, u.e.z, 6.5) ? null : countNear(foes, u.e.x, u.e.z, 3) * 0.8));
        return c && { power: p, x: c.x, z: c.z, score: c.score, aim: me === 1 ? bandName(c.unit) : '' };
      }
      case 'gorilla': {
        const c = best(foes, (u) => (countNear(foes, u.e.x, u.e.z, 4) >= 3 ? 2 + countNear(foes, u.e.x, u.e.z, 4) * 0.3 : null));
        return c && { power: p, x: c.x - (me === 0 ? dir.x : -dir.x) * 4, z: c.z, score: c.score, aim: me === 1 ? bandName(c.unit) : '' };
      }
      case 'kill': {
        let c = best(foes.filter((u) => u.kind === 'champ'), () => 3);
        if (!c) { const beast = F.units.find((u) => u.kind === 'beast' && alive(u) && u.owner === foe); if (beast) c = { x: beast.e.x, z: beast.e.z, score: 3.2, unit: beast }; }
        if (!c) c = best(foes, () => 0.9);
        return c && { power: p, x: c.x, z: c.z, score: c.score, target: c.unit, aim: c.unit.name || (me === 1 ? `one of ${bandName(c.unit)}` : '') };
      }
      case 'burn': {
        const c = best(foes, (u) => (u.burning > 0 ? null : (u.kind === 'champ' ? 2.2 : 1) * (u.hp / u.maxHp)));
        return c && { power: p, x: c.x, z: c.z, score: c.score + 0.6, target: c.unit, aim: c.unit.name || (me === 1 ? `one of ${bandName(c.unit)}` : '') };
      }
      case 'heal-small': {
        const c = best(mine, (u) => (u.hp < u.maxHp * 0.5 ? (u.kind === 'champ' ? 3 : 1.4) : null));
        return c && { power: p, x: c.x, z: c.z, score: c.score, target: c.unit, aim: 'one of its own' };
      }
      case 'revive': {
        let c = null;
        for (const u of F.units) if (u.side === me && u.kind === 'champ' && (u.state === 'dead' || u.state === 'wounded')) c = { x: u.e.x, z: u.e.z, score: 3.5, unit: u };
        return c && { power: p, x: c.x, z: c.z, score: c.score, target: c.unit, aim: c.unit.name };
      }
      case 'heal-area': {
        const r = radiusOf('heal-area', g.size);
        const c = best(mine, (u) => { let m = 0; for (const v of mine) if (D(u, v) < r) m += v.maxHp - v.hp; return m / 90; });
        return c && { power: p, x: c.x, z: c.z, score: c.score, aim: 'its own hurt' };
      }
      case 'boost-area': {
        if (mine.some((u) => u.boost > 0)) return null;
        const eng = mine.filter((u) => u.target && u.target.state === 'fight' && D(u, u.target) < 1.6);
        if (eng.length < 4) return null;
        const c = centroidNear(eng, eng[0].e.x, eng[0].e.z, 10);
        return { power: p, x: c.x, z: c.z, score: 2.2 + eng.length * 0.1, aim: 'its own fighters' };
      }
    }
    return null;
  }
  const answerSpent = (ans) => myGod.lock[ans] > 2.5 || myGod.bar < costOf(ans) || (!F.quietOk && T.quiet.includes(ans));
  function godAI(g, dt) {
    const ps = g.pers;
    g.think -= dt;
    if (g.think > 0) return;
    g.think = 0.4;
    const now = F.time;
    const gapLeft = Math.max(0, ps.gap - (now - g.lastCast), 1 - (now - (F.lastPlayerCast ?? -99)));
    const cands = [];
    for (const p of ps.powers) {
      if (p === 'lava' && (g.usedGreat || F.ft < 25)) continue;
      let eta = Math.max(g.cds[p] ?? 0, gapLeft);
      if (eta > T.planAhead) continue;
      if (ps.opensWith && !g.opened && p !== ps.opensWith) continue;
      const o = evalPower(g, p);
      if (!o) continue;
      o.score *= ps.w[p] ?? 1;
      if (ps.waits && ANSWER[p] && !answerSpent(ANSWER[p]) && now - (g.readySince[p] ?? now) < T.patientWaits) { o.waiting = ANSWER[p]; eta = Math.max(eta, 1); }
      o.eta = eta;
      cands.push(o);
    }
    let best = null;
    for (const o of cands) if (!best || o.score > best.score) best = o;
    if (!best || best.score < ps.threshold) { g.plan = null; return; }
    if (g.plan && g.plan.power !== best.power) { const cur = cands.find((o) => o.power === g.plan.power); if (cur && cur.score >= ps.threshold && cur.score >= best.score * 0.75) best = cur; }
    g.plan = best;
    if (best.eta <= 0 && !best.waiting && !F.tells.some((t) => t.side === g.side)) {
      if (!['kill', 'burn', 'lower', 'heal-small', 'revive'].includes(best.power) && Math.random() < 0.15) { best.x += rand(-1.7, 1.7); best.z += rand(-1.7, 1.7); }
      if (best.power === 'lava') g.usedGreat = true;
      enemyCast(g, { ...best, shape: best.line ? { line: best.line, x: best.x, z: best.z } : { x: best.x, z: best.z } });
      g.plan = null;
    }
  }
  // a stand-in player for the bots (docs/BATTLES.md): 'absent' does nothing; 'middling' answers about half of the
  // enemy god's moves, late, and casts now and then; 'good' answers every move it can, quickly, and casts often
  function botAI(g, dt) {
    const pol = env.policy;
    if (pol === 'absent') return;
    for (const t of F.tells) {
      if (t.side !== 1 || t.done) continue;
      if (t.botAt === undefined) { t.botAt = pol === 'middling' ? rand(0.8, 1.7) : rand(0.5, 1.0); t.botMiss = pol === 'middling' && Math.random() < 0.5; }
      if (t.answered || t.botMiss || t.t < t.botAt || F.voice > 0) continue;
      const ans = (HELPS[t.power] ?? []).find((p) => !refusal(p) && p !== 'revive');
      if (ans) { t.answered = true; F.cast(ans, { x: t.target?.e.x ?? t.x, z: t.target?.e.z ?? t.z }, undefined, ans === 'heal-small' && t.target ? { target: t.target } : {}); }
    }
    g.think -= dt;
    if (g.think > 0 || F.voice > 0 || F.time - g.lastCast < (pol === 'middling' ? 11 : 6)) return;
    g.think = 0.5;
    let best = null;
    for (const p of ['raise', 'fire-area', 'kill', 'burn', 'wolves', 'heal-area', 'boost-area', 'gorilla', 'lava', 'revive']) {
      if (refusal(p)) continue;
      const o = evalPower(g, p);
      if (o && (!best || o.score > best.score)) best = o;
    }
    if (best && best.score >= 3) F.cast(best.power, best.line ? { line: best.line, x: best.x, z: best.z } : { x: best.x, z: best.z }, undefined, { target: best.target || null });
  }
  F.evalPower = evalPower;

  F.nextMove = () => {
    const t = F.tells[0];
    if (t) return { power: t.power, aim: t.aim, in: Math.max(0, t.dur - t.t), dur: t.dur, landing: true, x: t.x, z: t.z, r: t.r, mode: t.mode };
    const pl = theirGod.plan;
    if (pl) return { power: pl.power, aim: pl.aim ?? '', in: pl.eta ?? 0, waiting: pl.waiting ?? null, landing: false, x: pl.x, z: pl.z, mode: pl.mode };
    return null;
  };
  // the preview in the calm: how many, how hard, who is notable, what their god will use
  F.preview = () => {
    const ps = theirGod.pers, n = F.waves.reduce((s, w) => s + w.n + (w.champ ? 1 : 0), 0);
    const ratio = n * enemyPow / Math.max(1, F.units.filter((u) => u.side === 0).reduce((s, u) => s + u.pow, 0));
    const word = ratio < 0.9 ? 'an easy fight' : ratio < 1.25 ? 'a fair fight' : ratio < 1.7 ? 'a hard fight' : 'a very hard fight';
    return { total: n, waves: F.waves.map((w) => w.n + (w.champ ? 1 : 0)), champs: F.waves.map((w) => w.champ).filter(Boolean), difficulty: word, ratio: Math.round(ratio * 100) / 100,
      god: ps.name, godShort: ps.short, spells: [...ps.powers], people: env.enemy.people, metal: ['stone', 'copper', 'bronze', 'iron'][env.enemy.tier], myMetal: ['stone', 'copper', 'bronze', 'iron'][env.enemy.myTier] };
  };
  F.alive = alive;
  return F;
}
