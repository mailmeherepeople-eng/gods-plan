// Animals: deer herds that graze, drink, bolt from people and wolves, breed,
// come and go by the mist (as do rabbits, at warren scale),
// and (when there are too many) eat the fields; flocks of birds; and wolves
// that walk in from the mist, mostly in the early years, stalk people at the
// edge of the settlement and attack. Wolves and deer never enter water and
// cannot cross a step of two blocks or more, so a river, a lake or a cliff
// keeps them out (land.js pathing, mode 'pred' / 'deer').
// Ported in spirit from the source repo's npc/npc.js Animal (gait, grazing,
// zigzag bolting, the side-fall when struck) and npc/ambient.js (herds
// roaming, drinking at the water).
import { makeAnimal } from './bodies.js';
import { snapToGround, followPath, stepToward } from './move.js';
import { T } from './tune.js';
import { range, pick } from './words.js';
import { X0, Z0, X1, Z1 } from '../edit/vox.js';
import { HUNT_LOOK } from './hunt-look.js';

export function makeAnimals(ctx, S) {
  const W = ctx.world, core = ctx.core, land = S.land;
  let seq = 0;
  const rand = Math.random;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const NAMES = { deer: 'A deer', wolf: 'A wolf', bird: 'A white bird', rabbit: 'A rabbit' };

  function newAnimal(species, x, z, o = {}) {
    // every animal that walks is put down on a checked spot (land.spotOk): passable, dry, no tree, set down on the
    // real ground; the nearest one within 8 steps when the asked-for spot is not (herds and wolves out of the
    // mist, warrens, births, the god's hand)
    if (species !== 'bird' && !land.spotOk(Math.floor(x), Math.floor(z), species === 'wolf' ? 'pred' : 'deer')) {
      const s = land.nearestSpot(x, z, species === 'wolf' ? 'pred' : 'deer', 8);
      if (s) { x = s.x; z = s.z; }
    }
    const F = makeAnimal(species);
    const a = {
      id: `a${++seq}`, kind: 'animal', cat: 'animal', species, name: NAMES[species],
      x, y: 16, z, ry: rand() * 6.28, ry0: 0, added: true,
      foot: species === 'bird' ? { w: 0.6, d: 0.6, h: 0.5, cx: 0, cz: 0 } : species === 'rabbit' ? { w: 0.4, d: 0.5, h: 0.5, cx: 0, cz: 0 } : { w: 0.8, d: 1.4, h: 1.3, cx: 0, cz: 0 },
      objs: [{ obj: F.group, off: { x: 0, y: 0, z: 0 }, ry0: 0 }], F,
      r: species === 'wolf' ? 0.32 : species === 'rabbit' ? 0.18 : 0.3, sepR: species === 'bird' ? 0 : species === 'rabbit' ? 0.5 : 1.3, seed: seq,
      // wolves, deer and rabbits climb or drop one block at most and never jump, as their paths assume (land.js
      // PRED_MAX_STEP): a step of two or more is a cliff to them
      noWater: species !== 'bird', maxDrop: T.PRED_MAX_STEP, noJump: species !== 'bird',
      age: o.age ?? (species === 'rabbit' ? range([0.5, 3]) : range([1, 8])), lifespan: range(species === 'rabbit' ? T.RABBIT_LIFESPAN : T.DEER_LIFESPAN), state: 'idle', herd: o.herd ?? null, warren: o.warren ?? null,
      path: null, pi: 0, t: rand() * 10, phase: rand() * 6, graze: 0, grazeT: 0, dead: false, hidden: false,
      doing: 'wandering', since: S.lifeNow(),
    };
    if (species === 'bird') { a.flock = o.flock; a.slot = o.slot; a.y = (o.flock?.ground ?? 16) + (o.flock?.alt ?? 10); }
    else snapToGround(W, a);
    F.group.position.set(a.x, a.y, a.z); // drawn at once (in creation the frame does not draw animals)
    F.group.rotation.y = a.ry;
    ctx.layers.entities.add(F.group);
    core.add(a);
    S.animals.push(a);
    if (species === 'wolf') S.predators.push(a);
    return a;
  }
  function removeAnimal(a) {
    S.seam.moment.close(`sim:wolf:${a.id}`, { quiet: false, forget: true });
    if (!a.removedFromCore) { core.removeMany([a]); a.removedFromCore = true; }
    a.F.group.removeFromParent();
    S.animals.splice(S.animals.indexOf(a), 1);
    const i = S.predators.indexOf(a);
    if (i >= 0) S.predators.splice(i, 1);
    if (a.herd) a.herd.members = a.herd.members.filter((m) => m !== a);
  }
  function kill(a, cause) {
    if (a.dead) return;
    a.dead = true; a.deadT = 0; a.cause = cause; a.path = null;
    // a herd losing deer to hunters is chased hard (wolves count by the bolts they cause: most of their kills are out of sight)
    if (a.herd && (cause === 'hunt' || cause === 'hunted')) a.herd.chased = (a.herd.chased ?? 0) + 3;
    S.seam.moment.close(`sim:wolf:${a.id}`, { quiet: false });
    a.doing = cause === 'strike' ? 'struck down' : 'dead';
    S.seam.run('animal:death', a, cause);
    S.emit('sim:animal-death', { animal: a, cause, x: a.x, z: a.z }); // sim:death is for people only
  }

  // ---------- a hunter's kill: the wounded run (2026-11-16; the director: "the wounded animal also runs a few steps
  // before dying and dropping") ----------
  // hunting.js calls this the moment its weapon strikes, straight after kill(): in every count the animal died then,
  // as before (the herd, the wolves, the hunters' tally, the death event). Only its body is not done yet: it flinches,
  // bolts a few steps away from the hunter, slowing and stumbling, and drops onto its side where the run ends. The
  // run is a straight walk the land allows an animal (land.lineWalk, so no water, no cliff, no trunk on the way) to
  // a spot one could stand on (land.spotOk) clear of the mist and of homes, so the hunter can always walk to it;
  // with no such walk it staggers and drops where it was struck. Look numbers: hunt-look.js HUNT_LOOK.
  function wound(a, fx, fz) {
    const deer = a.species === 'deer';
    const dx = a.x - fx, dz = a.z - fz, d = Math.hypot(dx, dz) || 1;
    const away = Math.atan2(dz / d, dx / d) + (rand() - 0.5) * 0.5;
    const len0 = range(deer ? HUNT_LOOK.RUN_DEER : HUNT_LOOK.RUN_RABBIT);
    const veer = rand() < 0.5 ? 1 : -1;
    let to = null;
    const ok = (x, z) => {
      const cx = Math.floor(x), cz = Math.floor(z);
      return land.inside(cx, cz) && ctx.edgeClear(x, z) >= 0.6 && !S.isProtected(cx, cz) && land.spotOk(cx, cz, 'deer') && land.lineWalk(a.x, a.z, x, z, 'deer');
    };
    for (const f of [1, 0.62, 0.32]) {
      for (const off of [0, 0.55, -0.55, 1.1, -1.1]) {
        const ang = away + off * veer, x = a.x + Math.cos(ang) * len0 * f, z = a.z + Math.sin(ang) * len0 * f;
        if (ok(x, z)) { to = { x, z }; break; }
      }
      if (to) break;
    }
    const sx = a.x, sz = a.z, len = to ? Math.hypot(to.x - sx, to.z - sz) : 0;
    const ux = len ? (to.x - sx) / len : dx / d, uz = len ? (to.z - sz) / len : dz / d;
    // the flank the blow came from (+1 its right, -1 its left): the weapon sticks there, and the body falls onto the
    // other side, so the shaft stands up out of it where it lies
    const side = (fx - a.x) * Math.cos(a.ry) - (fz - a.z) * Math.sin(a.ry) >= 0 ? 1 : -1;
    a.dying = {
      t: 0, s: 0, sx, sz, ux, uz, len, side, ry0: a.ry, ry1: Math.atan2(ux, uz), v0: deer ? HUNT_LOOK.RUN_V_DEER : HUNT_LOOK.RUN_V_RABBIT,
      stumbles: len > 2 ? [0.35 + rand() * 0.2, ...(rand() < 0.6 ? [0.68 + rand() * 0.15] : [])] : [], st: -1, done: false,
    };
    a.doing = deer ? 'wounded, running' : 'wounded, bolting';
    return { x: len ? to.x : sx, z: len ? to.z : sz, len, side };
  }
  // one step of the wounded run (the body's look only; groundTick keeps its feet on the ground)
  function dyingStep(a, dt) {
    const w = a.dying, F = a.F, fig = F.fig;
    w.t += dt;
    const flinch = HUNT_LOOK.FLINCH_S;
    if (w.t < flinch) {
      // struck: a jerk and a rear, turning away from the blow
      const u = w.t / flinch;
      fig.rotation.x = -0.32 * Math.sin(Math.PI * u);
      fig.rotation.z = 0.12 * Math.sin(Math.PI * u * 2);
      let dr = w.ry1 - w.ry0; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.ry = w.ry0 + dr * u;
      return;
    }
    a.ry = w.ry1;
    const u = w.len ? Math.min(1, w.s / w.len) : 1;
    // a stumble: the forelegs give, the head goes down, it nearly stops, then lurches on
    if (w.st < 0) { const at = w.stumbles.find((p) => u >= p); if (at != null) { w.stumbles.splice(w.stumbles.indexOf(at), 1); w.st = 0; } }
    let dip = 0, slow = 1;
    if (w.st >= 0) { w.st += dt; const k = w.st / HUNT_LOOK.STUMBLE_S; dip = Math.sin(Math.PI * Math.min(1, k)); slow = 1 - 0.7 * dip; if (k >= 1) w.st = -1; }
    const v = w.v0 * (1 - (1 - HUNT_LOOK.RUN_SLOW_TO) * u) * slow;
    if (u >= 1) {
      // the run is spent: it drops (the fall below, from here)
      w.done = true; a.deadT = 0; a.doing = 'dead';
      for (const l of F.legs ?? []) l.rotation.x *= 0.3;
      fig.rotation.x = 0; fig.position.y = 0;
      return;
    }
    w.s = Math.min(w.len, w.s + v * dt);
    a.x = w.sx + w.ux * w.s; a.z = w.sz + w.uz * w.s;
    a.phase = (a.phase ?? 0) + dt * (a.species === 'rabbit' ? 14 : 13) * (v / w.v0 * 0.6 + 0.4);
    const amp = 0.75 * (1 - 0.4 * u);
    for (const l of F.legs ?? []) l.rotation.x = Math.sin(a.phase + l._ph) * amp;
    // unsteady, more so as it slows; the head sinks
    fig.rotation.z = Math.sin(w.t * 8.5) * 0.1 * (0.4 + u);
    fig.rotation.x = 0.38 * dip;
    fig.position.y = a.species === 'rabbit' ? Math.abs(Math.sin(a.phase)) * 0.16 * (1 - u) : -0.08 * dip;
    if (F.head) { F.head.position.y = F.headY - (0.1 + 0.2 * u) * (a.species === 'deer' ? 1 : 0.3); F.head.rotation.x = 0.5 * u + 0.4 * dip; }
  }

  const settlementCentre = () => {
    const huts = S.buildings.filter((b) => b.kind === 'hut');
    if (!huts.length) return null;
    let x = 0, z = 0;
    for (const h of huts) { x += h.cx; z += h.cz; }
    return { x: x / huts.length, z: z / huts.length };
  };
  const nearHut = (x, z, r) => S.buildings.some((b) => b.kind === 'hut' && Math.hypot(b.cx - x, b.cz - z) < r);
  function edgeSpot(side) {
    const u = 0.15 + rand() * 0.7;
    const x = side === 'west' ? X0 + 7 : side === 'east' ? X1 - 7 : X0 + (X1 - X0) * u;
    const z = side === 'north' ? Z0 + 7 : side === 'south' ? Z1 - 7 : Z0 + (Z1 - Z0) * u;
    return { x, z };
  }
  // the points on the four edges straight out from (a.x, a.z), nearest first
  const edgesFrom = (a) => [['west', a.x - X0], ['east', X1 - a.x], ['north', a.z - Z0], ['south', Z1 - a.z]].sort((p, q) => p[1] - q[1])
    .map(([s]) => (s === 'west' ? { x: X0 + 4, z: a.z } : s === 'east' ? { x: X1 - 4, z: a.z } : s === 'north' ? { x: a.x, z: Z0 + 4 } : { x: a.x, z: Z1 - 4 }));
  // a walk out toward an edge: the nearest edge with a way, partway if it is far. 'wait' when the pathing budget
  // is spent this frame, 'none' when no edge can be walked toward at all, else true.
  function leaveWalk(a, mode) {
    for (const e of edgesFrom(a)) {
      const r = pathTo(a, e.x, e.z, mode, { partial: true });
      if (r === 'wait') return 'wait';
      if (r) return true;
    }
    return 'none';
  }
  // a grassy spot for a herd: clear of the mist, away from huts
  function pastureSpot(near) {
    for (let k = 0; k < 30; k++) {
      const x = near ? near.x + (rand() - 0.5) * 70 : X0 + 40 + rand() * (X1 - X0 - 80);
      const z = near ? near.z + (rand() - 0.5) * 70 : Z0 + 40 + rand() * (Z1 - Z0 - 80);
      const fx = Math.floor(x), fz = Math.floor(z);
      if (!land.inside(fx, fz) || ctx.edgeClear(x, z) < 0.7 || !land.passable(fx, fz, 'deer')) continue;
      if (nearHut(x, z, 20)) continue;
      return { x: fx + 0.5, z: fz + 0.5 };
    }
    return null;
  }

  // ---------- spawning ----------
  function spawnHerd() {
    const side = pick(['west', 'east', 'north', 'south']);
    const at = edgeSpot(side);
    const herd = { x: at.x, z: at.z, members: [], moveT: 0 };
    const to = pastureSpot(null);
    if (to) { herd.x = to.x; herd.z = to.z; }
    S.herds.push(herd);
    const n = Math.round(range(T.DEER_PER_HERD));
    for (let k = 0; k < n; k++) herd.members.push(newAnimal('deer', at.x + rand() * 3, at.z + rand() * 3, { herd }));
    return herd;
  }
  function spawnFlock() {
    const fl = { x: X0 + 60 + rand() * (X1 - X0 - 120), z: Z0 + 60 + rand() * (Z1 - Z0 - 120), tx: 0, tz: 0, t: 0, down: 0, alt: 12, members: [] };
    fl.tx = fl.x; fl.tz = fl.z;
    S.flocks.push(fl);
    for (let k = 0; k < T.BIRDS_PER_FLOCK; k++) fl.members.push(newAnimal('bird', fl.x, fl.z, { flock: fl, slot: k }));
  }
  const makeWolf = (x, z, side) => {
    const w = newAnimal('wolf', x, z);
    w.state = 'prowl'; w.unreach = new Map(); w.blockedT = 0; w.decideT = 0; w.side = side;
    w.doing = 'prowling';
    return w;
  };
  function spawnWolf(o = {}) {
    const side = pick(['west', 'east', 'north', 'south']);
    const at = edgeSpot(side);
    const w = makeWolf(at.x, at.z, side);
    w.doing = 'prowling in from the mist';
    if (!o.quiet) S.alert('warn', `A wolf has come out of the mist in the ${side}. It will hunt anyone alone at the edge of the settlement.`, at.x, at.z, undefined, w);
    return w;
  }
  // choices (ecology.js): a resident wolf lives here, goes back to its den after a hunt instead of into the mist
  const afterHunt = (a) => { a.path = null; if (a.resident) { a.state = 'prowl'; a.decideT = 3; a.blockedT = 0; } else a.state = 'leave'; };
  // rabbits: a warren (a spot they keep near), a few at a time
  function spawnWarren(at) {
    const spot = at ?? pastureSpot(null);
    if (!spot) return null;
    const wr = { x: spot.x, z: spot.z };
    S.warrens.push(wr);
    if (!at) for (let k = 0; k < T.RABBITS_PER_WARREN; k++) newAnimal('rabbit', spot.x + rand() * 2 - 1, spot.z + rand() * 2 - 1, { warren: wr });
    return wr;
  }

  // The god places an animal (god/animals.js). Answers { entity, reason, text }: reason water, cliff,
  // protected or mist when it cannot stand there. Works in creation too (it then waits for time to run).
  const SIDE = (x, z) => [['west', x - X0], ['east', X1 - x], ['north', z - Z0], ['south', Z1 - z]].sort((p, q) => p[1] - q[1])[0][0];
  function spawnAnimal(kind, x, z) {
    const no = (reason, text) => ({ entity: null, reason, text });
    if (!NAMES[kind]) return no('kind', 'There is no such animal here.');
    if (land.needFull) land.fullScan();
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!land.inside(cx, cz) || ctx.edgeClear(x, z) < 0.5) return no('mist', 'Lost in the mist. What you cannot see, you cannot touch.');
    if (S.isProtected(cx, cz)) return no('protected', 'Not on the standing stone or in a home.');
    if (kind !== 'bird') {
      if (land.waterAt(cx, cz)) return no('water', 'Animals cannot stand in water.');
      if (!land.passable(cx, cz, kind === 'wolf' ? 'pred' : 'deer')) return no('cliff', 'Something is in the way there: a tree, a rock or a wall.');
      const h = land.topAt(cx, cz);
      let ways = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (land.passable(cx + dx, cz + dz, 'deer') && Math.abs(land.topAt(cx + dx, cz + dz) - h) <= 1) ways++;
      if (!ways) return no('cliff', 'Too steep there: an animal could not move off that spot.');
      // a spot it would be set down on something other than the ground (a trunk, a roof, a wall top): the nearest
      // good spot a step or three away, or no
      if (!land.spotOk(cx, cz, kind === 'wolf' ? 'pred' : 'deer')) {
        const s = land.nearestSpot(x, z, kind === 'wolf' ? 'pred' : 'deer', 3);
        if (!s) return no('cliff', 'Something is in the way there: a tree, a rock or a wall.');
        x = s.x; z = s.z;
      }
    }
    let e;
    if (kind === 'deer') {
      let herd = S.herds.find((hd) => Math.hypot(hd.x - x, hd.z - z) < 25);
      if (!herd) { herd = { x: cx + 0.5, z: cz + 0.5, members: [], moveT: 30 }; S.herds.push(herd); }
      e = newAnimal('deer', x, z, { herd, age: range([1, 6]) });
      herd.members.push(e);
    } else if (kind === 'wolf') e = makeWolf(x, z, SIDE(x, z));
    else if (kind === 'rabbit') {
      const wr = S.warrens.find((w) => Math.hypot(w.x - x, w.z - z) < 14) ?? spawnWarren({ x, z });
      e = newAnimal('rabbit', x, z, { warren: wr });
    } else {
      let fl = S.flocks.find((f) => Math.hypot(f.x - x, f.z - z) < 20 && f.members.length < 8);
      if (!fl) { fl = { x, z, tx: x, tz: z, t: 6, down: 0, alt: 10, members: [], ground: land.topAt(cx, cz) + 1 }; S.flocks.push(fl); }
      e = newAnimal('bird', x, z, { flock: fl, slot: fl.members.length });
      fl.members.push(e);
    }
    e.placed = true;
    return { entity: e, reason: null, text: null };
  }
  // undo of a placement (and a tidy way out for any animal)
  function despawn(a) {
    if (!a || !S.animals.includes(a)) return false;
    if (a.flock) a.flock.members = a.flock.members.filter((m) => m !== a);
    removeAnimal(a);
    return true;
  }

  // ---------- movement helpers ----------
  // a path by the land's rules. o.partial: toward the nearest reachable cell when the goal is out of reach.
  // After a walk got stuck the next path is the unsmoothed one (a.rawNext), which keeps off corners.
  function pathTo(a, x, z, mode, o = {}) {
    const r = land.findPath(a.x, a.z, x, z, mode, o.nodes ?? (mode === 'pred' ? 9000 : 4000), { raw: !!a.rawNext, partial: !!o.partial });
    if (r === 'wait') return 'wait';
    if (!r) return null;
    a.rawNext = false;
    a.path = r.length ? r : [[x + 0.0, z + 0.0]];
    a.pi = 0; a.stuckT = 0; a.stuckX = a.x; a.stuckZ = a.z;
    return a.path;
  }
  // a short walk: straight when the land allows it (land.lineWalk), else by a path; true if a walk was set
  function routeTo(a, x, z, mode) {
    if (land.lineWalk(a.x, a.z, x, z, mode)) { a.path = [[x, z]]; a.pi = 0; return true; }
    const r = pathTo(a, x, z, mode, { nodes: 800 });
    return r != null && r !== 'wait';
  }
  const modeOf = (a) => (a.species === 'wolf' ? 'pred' : 'deer');
  function walk(a, speed, dt) {
    if (!a.path) return 'arrived';
    a.arriveR = 0.6;
    const st = followPath(W, a, speed, dt);
    a.moving = st === 'moving';
    if (st !== 'moving') a.path = null;
    if (st === 'stuck') a.rawNext = true;
    return st;
  }
  // a zigzag bolt away from (x, z), as in the source's fleeFrom
  function bolt(a, fx, fz) {
    const dx = a.x - fx, dz = a.z - fz, d = Math.hypot(dx, dz) || 1;
    a.flee = { ax: dx / d, az: dz / d, legs: 2 + Math.floor(rand() * 2), side: rand() < 0.5 ? -1 : 1 };
    a.state = 'flee'; a.doing = 'bolting';
    if (a.herd) a.herd.chased = (a.herd.chased ?? 0) + 1; // a herd chased hard is the likelier to leave (tick)
    fleeLeg(a);
  }
  // after a bolt: back to leaving if it was on its way out, else idle
  const calm = (a) => { a.flee = null; a.state = a.leaving ? 'leave' : 'idle'; a.path = null; };
  // each leg of a bolt is a checked walk; a leg that has no way tries the other side and wider angles
  function fleeLeg(a) {
    const f = a.flee;
    if (!f || f.legs <= 0) { calm(a); return; }
    f.legs--; f.side = -f.side;
    a.path = null;
    for (let k = 0; k < 4 && !a.path; k++) {
      const side = k % 2 ? -f.side : f.side;
      const ang = side * (0.25 + rand() * 0.7 + k * 0.35), c = Math.cos(ang), s = Math.sin(ang);
      const hx = f.ax * c - f.az * s, hz = f.ax * s + f.az * c, len = 4 + rand() * 4;
      routeTo(a, Math.max(X0 + 3, Math.min(X1 - 3, a.x + hx * len)), Math.max(Z0 + 3, Math.min(Z1 - 3, a.z + hz * len)), modeOf(a));
    }
    if (!a.path) calm(a);
  }

  // ---------- deer and rabbits coming and going by the mist (the wolves' pattern) ----------
  S.comeGo = { deerIn: 0, deerOut: 0, rabbitIn: 0, rabbitOut: 0, deerInHerds: 0, deerOutGroups: 0, rabbitInGroups: 0, rabbitOutGroups: 0, stayed: 0 };
  // A few deer (a new herd) or rabbits (a new warren) walk in from the mist: put down on a checked spot in the mist at
  // an edge, they make for a pasture spot fifty or so steps in. Returns how many came.
  function grazersArrive(species) {
    const c = { x: (X0 + X1) / 2, z: (Z0 + Z1) / 2 };
    for (let k = 0; k < 6; k++) {
      const e = edgeSpot(pick(['west', 'east', 'north', 'south']));
      const s = land.nearestSpot(e.x, e.z, 'deer', 6);
      if (!s || ctx.edgeClear(s.x, s.z) > 0.5) continue; // appears where the mist still hides it
      const d = Math.hypot(c.x - s.x, c.z - s.z) || 1;
      const to = pastureSpot({ x: s.x + (c.x - s.x) / d * 50, z: s.z + (c.z - s.z) / d * 50 }) ?? pastureSpot(null);
      if (!to) return 0;
      const n = Math.round(range(species === 'deer' ? T.HERD_ARRIVE_SIZE : T.RABBIT_ARRIVE_SIZE));
      const at = () => [s.x + rand() * 2 - 1, s.z + rand() * 2 - 1]; // newAnimal checks each spot again
      if (species === 'deer') {
        const herd = { x: to.x, z: to.z, members: [], moveT: 30 + rand() * 20 };
        S.herds.push(herd);
        for (let i = 0; i < n; i++) herd.members.push(newAnimal('deer', ...at(), { herd }));
        S.comeGo.deerIn += n; S.comeGo.deerInHerds++;
      } else {
        const wr = { x: to.x, z: to.z };
        S.warrens.push(wr);
        for (let i = 0; i < n; i++) newAnimal('rabbit', ...at(), { warren: wr });
        S.comeGo.rabbitIn += n; S.comeGo.rabbitInGroups++;
      }
      return n;
    }
    return 0;
  }
  // these go: they leave their herd or warren and walk out by the nearest edge they can reach
  function setLeaving(list) {
    for (const a of list) {
      if (a.herd) a.herd.members = a.herd.members.filter((m) => m !== a);
      a.herd = null; a.warren = null; a.raider = null; a.raid = null; a.nibble = null;
      a.leaving = true; a.leaveT = 0; a.path = null; a.grazeT = 0;
      if (a.state !== 'flee') a.state = 'leave';
    }
  }
  // one walking out: taken off the map only once deep in the mist; with no way out after all it stays
  function leaveStep(a, dt, speed) {
    a.doing = 'going back into the mist';
    a.leaveT += dt;
    if (!a.path) {
      const r = a.leaveT > T.GRAZER_LEAVE_GIVE_UP ? 'none' : leaveWalk(a, 'deer');
      if (r === 'wait') return;
      if (r === 'none') { stayAfterAll(a); return; }
    }
    walk(a, speed, dt);
    if (ctx.edgeClear(a.x, a.z) < 0.12) a.gone = true;
  }
  function stayAfterAll(a) {
    a.leaving = false; a.state = 'idle'; a.path = null; a.grazeT = 1; S.comeGo.stayed++;
    if (a.species === 'deer') {
      let h = S.herds.find((hd) => Math.hypot(hd.x - a.x, hd.z - a.z) < 40);
      if (!h) { h = { x: a.x, z: a.z, members: [], moveT: 20 }; S.herds.push(h); }
      h.members.push(a); a.herd = h;
    } else a.warren = S.warrens.find((w) => Math.hypot(w.x - a.x, w.z - a.z) < 30) ?? spawnWarren({ x: a.x, z: a.z });
  }

  // ---------- deer ----------
  function deerStep(a, dt) {
    a.senseT = (a.senseT ?? 0) - dt;
    if (a.state !== 'flee' && a.senseT <= 0) {
      a.senseT = 0.35;
      for (const w of S.predators) if (!w.dead && dist(w, a) < T.DEER_FLEE_PRED) { bolt(a, w.x, w.z); break; }
      if (a.state !== 'flee') for (const p of S.people) if (!p.dead && !p.hidden && dist(p, a) < T.DEER_WARY) { bolt(a, p.x, p.z); break; }
    }
    if (a.state === 'flee') {
      const st = walk(a, 3.6, dt);
      if (st !== 'moving') fleeLeg(a);
      return;
    }
    if (a.state === 'leave') { leaveStep(a, dt, 1.6); return; }
    if (a.path) {
      const st = walk(a, a.state === 'raid' ? 1.6 : 1.3, dt);
      if (st === 'arrived' && a.state === 'drink') { a.grazeT = 3 + rand() * 2; a.state = 'idle'; }
      if (st === 'arrived' && a.state === 'raid') { a.state = 'eat'; a.grazeT = 6 + rand() * 6; }
      // stuck: stand a moment, then choose afresh (a new spot, not the same walk again)
      if (st === 'stuck') { if (a.state === 'drink') a.state = 'idle'; a.grazeT = 0.5 + rand(); }
      return;
    }
    if (a.grazeT > 0) {
      a.grazeT -= dt;
      if (a.state === 'eat' && a.raid?.family) {
        a.doing = `eating the ${a.raid.family.name} family's crops`;
        a.raid.family.food = Math.max(0, a.raid.family.food - T.DEER_RAID_EAT * dt * S.timeK * T.LIFE_RATE / ctx.clock.secondsPerYear);
        a.raid.care = Math.max(0, a.raid.care - 0.02 * dt * S.timeK);
        if (rand() < dt * 0.5) S.build.trample(a.raid);
        if (!S.raidSaid || S.year - S.raidSaid > 25) { S.raidSaid = S.year; S.alert('warn', `Deer are eating the ${a.raid.family.name} family's field. There are too many deer.`, a.x, a.z, undefined, a); }
      }
      return;
    }
    if (a.state === 'eat') { a.state = 'idle'; a.raid = null; }
    // what next: raid, drink, or graze near the herd
    const h = a.herd;
    if (a.raider && a.raider.done && a.raider.family) {
      const fl = a.raider, s = fl.steps[Math.floor(rand() * fl.steps.length)];
      a.raid = fl; a.state = 'raid'; a.doing = 'heading for a field';
      if (pathTo(a, s.x + 0.5, s.z + 0.5, 'deer') == null) { a.raider = null; a.state = 'idle'; }
      return;
    }
    if (rand() < 0.15) {
      const w = land.nearestWater(a.x, a.z, 30);
      if (w && pathTo(a, w.sx + 0.5, w.sz + 0.5, 'deer')) { a.state = 'drink'; a.doing = 'going to drink'; return; }
    }
    // far from where the herd now grazes (it moved to a new pasture, or the deer walked in from the mist): a path
    // toward it, partway when it is far
    if (h && Math.hypot(h.x - a.x, h.z - a.z) > 18) {
      const r = pathTo(a, h.x, h.z, 'deer', { partial: true });
      if (r && r !== 'wait') { a.doing = 'following the herd'; return; }
    }
    if (rand() < 0.5 || !h) { a.grazeT = 2 + rand() * 4; a.doing = 'grazing'; return; }
    const x = h.x + (rand() - 0.5) * 14, z = h.z + (rand() - 0.5) * 14;
    if (land.passable(Math.floor(x), Math.floor(z), 'deer') && routeTo(a, x, z, 'deer')) a.doing = 'wandering with the herd';
    else a.grazeT = 1;
  }

  // ---------- rabbits: hop about their warren, bolt from wolves and people, nibble the crops ----------
  function rabbitStep(a, dt) {
    a.senseT = (a.senseT ?? 0) - dt;
    if (a.state !== 'flee' && a.senseT <= 0) {
      a.senseT = 0.3;
      for (const w of S.predators) if (!w.dead && dist(w, a) < T.RABBIT_WARY_WOLF) { bolt(a, w.x, w.z); break; }
      if (a.state !== 'flee') for (const p of S.people) if (!p.dead && !p.hidden && dist(p, a) < T.RABBIT_WARY) { bolt(a, p.x, p.z); break; }
    }
    if (a.state === 'flee') { const st = walk(a, T.RABBIT_BOLT, dt); if (st !== 'moving') fleeLeg(a); return; }
    if (a.state === 'leave') { leaveStep(a, dt, 1.8); return; }
    if (a.path) { if (walk(a, 1.8, dt) === 'stuck') a.grazeT = 0.5 + rand(); return; }
    if (a.grazeT > 0) {
      a.grazeT -= dt;
      // a rabbit in a field takes a little of the family's food
      const fl = a.nibble;
      if (fl?.family && fl.done) {
        a.doing = `nibbling the ${fl.family.name} family's crops`;
        fl.family.food = Math.max(0, fl.family.food - T.RABBIT_EAT * dt * S.timeK * T.LIFE_RATE / ctx.clock.secondsPerYear);
      }
      return;
    }
    a.nibble = null;
    const wr = a.warren ?? { x: a.x, z: a.z };
    // far from its warren (walked in from the mist to dig a new one): a path toward it, partway when it is far
    if (Math.hypot(wr.x - a.x, wr.z - a.z) > 14) {
      const r = pathTo(a, wr.x, wr.z, 'deer', { partial: true });
      if (r && r !== 'wait') { a.doing = 'hopping toward its warren'; return; }
    }
    const field = rand() < 0.25 ? S.buildings.find((b) => b.kind === 'field' && b.done && b.family && Math.hypot(b.mx - wr.x, b.mz - wr.z) < T.RABBIT_RANGE) : null;
    const to = field ? field.steps[Math.floor(rand() * field.steps.length)] : null;
    const x = to ? to.x + 0.5 : wr.x + (rand() - 0.5) * 12, z = to ? to.z + 0.5 : wr.z + (rand() - 0.5) * 12;
    if (land.passable(Math.floor(x), Math.floor(z), 'deer') && routeTo(a, x, z, 'deer')) { a.doing = field ? 'hopping to a field' : 'hopping about'; a.nibble = field; a.grazeT = 2 + rand() * 4; }
    else { a.grazeT = 1; a.doing = 'nibbling grass'; }
  }

  // ---------- wolves ----------
  // A hunt's outcome is rolled when it begins and then carried out, so the
  // fate panel can say it as a fact. Someone awake and grown has the best
  // chance to see the wolf in time; children and elders less.
  // stage 2 (forces.js 'wolfOdds'): a strong person sees it sooner and is harder to kill
  const oddsOf = (p) => S.seam.ask('wolfOdds', p) ?? { see: 1, kill: 1 };
  function beginHunt(a, p) {
    const k = oddsOf(p);
    const see = Math.min(0.95, (p.stage === 'adult' ? T.HUNT_ESCAPE : T.HUNT_ESCAPE * 0.5) * k.see);
    a.outcome = rand() < see ? 'escape' : rand() < Math.min(0.95, T.PRED_KILL * k.kill) ? 'kill' : 'wound';
    S.peopleApi.story(p, `A wolf began to hunt ${p.sex === 'f' ? 'her' : 'him'}.`);
  }
  // the hunt ended without its outcome (the person went indoors, the trail was lost): the fate changes back
  function endHunt(a, why) {
    const p = a.prey;
    if (p && p.kind === 'person' && !p.dead && a.outcome && a.outcome !== 'escape') {
      S.peopleApi.story(p, `Was to ${a.outcome === 'kill' ? `die at ${Math.floor(p.age)} by a wolf` : 'be bitten by a wolf'}. ${why}`);
    }
    a.outcome = null;
  }
  function wolfStep(a, dt) {
    a.decideT -= dt;
    const c = settlementCentre();
    if (a.state === 'prowl') {
      a.doing = 'prowling';
      if (a.decideT <= 0) {
        a.decideT = 0.6;
        // prey: someone outdoors, alone, at the edge of things; or a deer that is nearer
        let best = null, bs = Infinity, anyPeople = false;
        for (const p of S.people) {
          if (p.dead || p.hidden) continue;
          const d = dist(p, a);
          if (d > T.PRED_SENSE) continue;
          if (a.resident && S.eco && !S.eco.mayHunt(a, p)) continue; // a fed resident wolf leaves people alone (ecology.js)
          anyPeople = true;
          if ((a.unreach.get(p.id) ?? -1) > S.clockT) continue;
          let alone = true;
          for (const o of S.people) if (o !== p && !o.dead && !o.hidden && Math.abs(o.x - p.x) < 6 && Math.abs(o.z - p.z) < 6) { alone = false; break; }
          const s = d - (c ? 0.5 * Math.hypot(p.x - c.x, p.z - c.z) : 0) - (alone ? 10 : 0) - (p.stage !== 'adult' ? 6 : 0);
          if (s < bs) { bs = s; best = p; }
        }
        for (const d of S.animals) {
          if ((d.species !== 'deer' && d.species !== 'rabbit') || d.dead) continue;
          const dd = dist(d, a);
          if (dd > T.PRED_SENSE || (a.unreach.get(d.id) ?? -1) > S.clockT) continue;
          const bias = d.species === 'rabbit' ? T.RABBIT_PREY_PULL : 4; // a rabbit close by is an easy meal
          if (dd - bias < bs) { bs = dd - bias; best = d; }
        }
        if (best) {
          const r = pathTo(a, best.x, best.z, 'pred');
          if (r === 'wait') return;
          if (r) { a.prey = best; a.state = 'stalk'; a.repathT = 2.5; a.blockedT = 0; a.huntT = 0; if (best.kind === 'person') beginHunt(a, best); }
          else { a.unreach.set(best.id, S.clockT + 25); if (best.kind === 'person') a.blockedT += 0.6; }
        } else if (!a.path) {
          // nothing to hunt: drift toward the settlement's edge
          const goal = a.resident && S.eco ? S.eco.denOf(a) ?? pastureSpot(a) : c ? { x: c.x + (a.x - c.x) * 0.5, z: c.z + (a.z - c.z) * 0.5 } : pastureSpot(a);
          if (goal) pathTo(a, goal.x, goal.z, 'pred');
          if (anyPeople) a.blockedT += 0.6;
        }
        if (a.blockedT > T.PRED_GIVE_UP_S && a.resident) { a.blockedT = 0; a.manHunt = false; a.weakHunt = false; }
        else if (a.blockedT > T.PRED_GIVE_UP_S) {
          if (!a.saidBlocked) { a.saidBlocked = true; S.alert('good', 'A wolf prowled the edge of the land and could not reach anyone. Water and steep ground kept it out.', a.x, a.z, 'Geography, the quiet guardian.', a); }
          a.state = 'leave'; a.path = null;
        }
      }
      if (a.path) walk(a, T.PRED_STALK, dt);
      return;
    }
    if (a.state === 'stalk' || a.state === 'sprint') {
      const p = a.prey;
      if (!p || p.dead || p.hidden) {
        if (p?.hidden) endHunt(a, `${p.sex === 'f' ? 'She' : 'He'} went indoors and the wolf lost the trail.`);
        a.state = 'prowl'; a.prey = null; a.path = null; return;
      }
      a.huntT += dt;
      const d = dist(p, a);
      a.doing = p.kind === 'person' ? `stalking ${p.name}` : `stalking ${p.name.replace(/^An? /, 'a ').toLowerCase()}`;
      if (a.state === 'stalk') {
        a.repathT -= dt;
        if (a.repathT <= 0) {
          a.repathT = 2.5;
          const r = pathTo(a, p.x, p.z, 'pred');
          if (r === null) { endHunt(a, 'The land between them stopped the wolf.'); a.unreach.set(p.id, S.clockT + 25); a.state = 'prowl'; a.prey = null; return; }
        }
        if (d < T.PRED_SPRINT_AT) { a.state = 'sprint'; a.sprintT = 0; }
        else walk(a, T.PRED_STALK, dt);
        if (a.huntT > 90) { endHunt(a, 'The wolf lost interest.'); a.state = 'prowl'; a.prey = null; }
        return;
      }
      // sprint
      a.sprintT += dt;
      a.doing = p.kind === 'person' ? `chasing ${p.name}` : `chasing ${p.name.replace(/^An? /, 'a ').toLowerCase()}`;
      const moved = stepToward(W, a, p.x, p.z, T.PRED_SPRINT, dt);
      a.moving = moved;
      if (d < 0.95) return attack(a, p);
      // a hunt that is to end in a kill or a bite keeps going; one the person is to escape gives up at the chase's end
      const doomed = p.kind === 'person' && a.outcome && a.outcome !== 'escape';
      if (!doomed && (d > T.PRED_SPRINT_AT * 2.2 || a.sprintT > 7)) { a.state = 'stalk'; a.repathT = 0; a.huntT += 10; }
      else if (!moved && a.sprintT > 1.5) { a.state = 'stalk'; a.repathT = 0; }
      return;
    }
    if (a.state === 'feed') {
      a.doing = 'eating its kill';
      a.feedT -= dt;
      a.moving = false;
      if (a.feedT <= 0) { afterHunt(a); if (a.kill) a.kill.keepBody = 0; }
      return;
    }
    if (a.state === 'leave') {
      a.doing = 'going back into the mist';
      // out by the nearest edge it can reach (a checked path, partway when the edge is far); a wolf with no way
      // out at all (water or cliffs all round) stays and prowls instead of walking at a wall
      if (!a.path && leaveWalk(a, 'pred') === 'none') { a.state = 'prowl'; a.decideT = 6; a.blockedT = 0; return; }
      walk(a, 1.6, dt);
      if (ctx.edgeClear(a.x, a.z) < 0.12) { a.gone = true; }
    }
  }
  function attack(a, p) {
    a.prey = null;
    if (p.kind === 'animal') {
      kill(p, 'wolf'); p.keepBody = T.PRED_FEED_S + 1; a.kill = p;
      a.state = 'feed'; a.feedT = p.species === 'rabbit' ? T.PRED_FEED_S * 0.5 : T.PRED_FEED_S; a.lastDeer = S.year;
      return;
    }
    if (a.outcome === 'escape') {
      // fated to get away: the wolf snaps at the air and turns back
      S.peopleApi.story(p, 'Saw a wolf coming and got away.');
      S.mind.push(p, 'That was too close. My legs are still shaking.');
      a.outcome = null; afterHunt(a);
      return;
    }
    S.attacks.push({ x: p.x, z: p.z, year: S.year });
    S.emit('sim:attack', { animal: a, person: p, x: p.x, z: p.z });
    for (const o of S.people) if (o !== p && !o.dead && !o.hidden && Math.hypot(o.x - p.x, o.z - p.z) < 20) { o.thinkT = 0; S.mind.push(o, `The wolf took ${p.name}. It came out of nowhere.`); }
    const fatal = a.outcome ? a.outcome === 'kill' : rand() < Math.min(0.95, T.PRED_KILL * oddsOf(p).kill);
    a.outcome = null;
    if (fatal) {
      p.keepBody = T.PRED_FEED_S + 1;
      S.peopleApi.die(p, 'wolf', { where: S.buildings.some((b) => b.kind === 'field' && Math.hypot(b.mx - p.x, b.mz - p.z) < 8) ? ' by the fields' : ' at the edge of the settlement' });
      a.state = 'feed'; a.feedT = T.PRED_FEED_S; a.kill = p;
    } else {
      p.happy = Math.max(0, p.happy - 25); p.grief = Math.max(p.grief, 0.5);
      S.peopleApi.story(p, 'Was bitten by a wolf and got away.');
      S.alert('bad', `A wolf attacked ${p.name} of the ${p.family.name} family. ${p.sex === 'f' ? 'She' : 'He'} got away, bleeding.`, p.x, p.z, undefined, p);
      afterHunt(a);
    }
  }

  // ---------- birds ----------
  function flockStep(fl, dt) {
    fl.t -= dt;
    if (fl.t <= 0) {
      fl.t = 10 + rand() * 12;
      if (fl.down <= 0 && rand() < 0.45) fl.down = 7 + rand() * 6;
      else { const s = pastureSpot(fl) ?? { x: fl.x, z: fl.z }; fl.tx = s.x; fl.tz = s.z; }
    }
    if (fl.down > 0) {
      fl.down -= dt;
      for (const p of S.people) if (!p.dead && !p.hidden && Math.abs(p.x - fl.x) < 7 && Math.abs(p.z - fl.z) < 7) { fl.down = 0; break; }
    } else {
      const dx = fl.tx - fl.x, dz = fl.tz - fl.z, d = Math.hypot(dx, dz);
      if (d > 0.5) { fl.x += dx / d * Math.min(d, 4 * dt); fl.z += dz / d * Math.min(d, 4 * dt); }
    }
    const ground = land.topAt(Math.floor(fl.x), Math.floor(fl.z)) + 1;
    fl.alt += ((fl.down > 0 ? 0 : 11) - fl.alt) * Math.min(1, dt * 0.8);
    fl.ground = ground;
  }
  function birdStep(b, dt) {
    const fl = b.flock;
    b.t += dt;
    const ang = b.t * (fl.down > 0 ? 0.15 : 0.6) + b.slot * (6.283 / T.BIRDS_PER_FLOCK);
    const rr = fl.down > 0 ? 1.4 + b.slot * 0.4 : 4 + b.slot * 0.8;
    const tx = fl.x + Math.cos(ang) * rr, tz = fl.z + Math.sin(ang) * rr;
    const ty = fl.ground + fl.alt + Math.sin(b.t * 1.3 + b.slot) * (fl.alt > 1 ? 0.6 : 0);
    const k = Math.min(1, dt * 3);
    const vx = tx - b.x, vz = tz - b.z;
    b.x += vx * k; b.z += vz * k; b.y += (ty - b.y) * k;
    if (Math.abs(vx) + Math.abs(vz) > 0.02) b.yawT = Math.atan2(vx, vz);
    b.flying = fl.alt > 0.6;
    b.doing = b.flying ? 'flying' : 'pecking at the ground';
  }

  // ---------- the year: births, old age, raids, spawning ----------
  function tick(gdt, dLife) {
    const runYears = S.year - S.startYear;
    // wolves
    // (with the ecology on, wolves come and go by the deer they can live on: ecology.js)
    if (!S.eco?.ownsWolves && runYears >= T.PRED_FIRST && runYears < T.PRED_UNTIL && S.year >= S.predNext) {
      const gap = T.PRED_EVERY * Math.pow(2, runYears / T.PRED_EVERY_GROWTH);
      S.predNext = S.year + gap * (0.7 + rand() * 0.6);
      if (S.predators.filter((w) => !w.dead).length < T.PRED_MAX && S.families.some((f) => f.state === 'settled')) spawnWolf();
    }
    // rabbits: they breed quickly (two or more near a warren), die young
    const rabbits = S.animals.filter((a) => a.species === 'rabbit' && !a.dead);
    // (one walking out by the mist does not die of old age on the way: a rabbit's walk out can take longer than its life)
    for (const r of rabbits) { r.age += dLife; if (r.age > r.lifespan && !r.leaving) kill(r, 'old age'); }
    const rroom = Math.max(0, 1 - rabbits.length / T.RABBIT_MAX);
    for (const wr of S.warrens) {
      const near = rabbits.filter((r) => r.warren === wr);
      if (near.length >= 2 && rand() < near.length * T.RABBIT_BIRTH * rroom * dLife) newAnimal('rabbit', wr.x + rand() * 2 - 1, wr.z + rand() * 2 - 1, { warren: wr, age: 0 });
    }
    S.warrens = S.warrens.filter((wr) => rabbits.some((r) => r.warren === wr));
    // deer: births and old age
    const deer = S.animals.filter((a) => a.species === 'deer' && !a.dead);
    S.deerCount = deer.length;
    for (const d of deer) { d.age += dLife; if (d.age > d.lifespan && !d.leaving) kill(d, 'old age'); }
    const room = Math.max(0, 1 - deer.length / (S.eco?.deerCap ?? T.DEER_MAX));
    const deerBirth = S.eco?.deerBirth ?? T.DEER_BIRTH;
    // nearly no deer left: a new herd wanders in from the mist now and then
    if (deer.length < 3 && S.year >= (S.herdNext ?? -Infinity)) { S.herdNext = S.year + T.HERD_RETURN_YEARS; spawnHerd(); }
    for (const h of S.herds) {
      const n = h.members.filter((m) => !m.dead).length;
      if (n >= 2 && rand() < n * deerBirth * room * dLife) {
        const m = h.members.find((q) => !q.dead) ?? h.members[0]; // born beside a living mother (the spot is checked in newAnimal)
        const fawn = newAnimal('deer', m.x + 0.5, m.z + 0.5, { herd: h, age: 0 });
        h.members.push(fawn);
      }
    }
    // herds roam
    for (const h of S.herds) {
      h.moveT -= gdt;
      h.members = h.members.filter((m) => !m.dead || m.keepBody);
      if (h.moveT <= 0) { h.moveT = 25 + rand() * 25; const s = pastureSpot(h); if (s) { h.x = s.x; h.z = s.z; } }
      // a big herd splits
      if (h.members.length > 9) {
        const nh = { x: h.x, z: h.z, members: h.members.splice(5), moveT: 0 };
        for (const m of nh.members) m.herd = nh;
        S.herds.push(nh);
      }
    }
    S.herds = S.herds.filter((h) => h.members.length);
    comeAndGo(dLife / T.LIFE_RATE, deer.filter((d) => !d.dead), rabbits.filter((r) => !r.dead));
    // too many deer: the extra ones go for the fields
    const fields = S.buildings.filter((b) => b.kind === 'field' && b.done && b.family);
    const raiders = Math.max(0, Math.ceil((deer.length - (S.eco?.raidAt ?? T.DEER_RAID_AT)) / 2));
    let have = deer.filter((d) => d.raider).length;
    for (const d of deer) {
      if (have >= raiders || !fields.length) break;
      if (!d.raider && d.state !== 'flee') { d.raider = pick(fields); have++; }
    }
    if (have > raiders) for (const d of deer) if (d.raider && have > raiders) { d.raider = null; have--; }
  }
  // Deer and rabbits come and go by the mist, as wolves do (tune.js HERD_*, RABBIT_ARRIVE_*, RABBIT_LEAVE_*): dY is
  // the calendar years this frame; `deer` and `rabbits` the living ones (those already leaving count until they go).
  function comeAndGo(dY, deer, rabbits) {
    if (!(dY > 0)) return;
    const fade = Math.exp(-dY / T.HERD_CHASED_FADE);
    for (const h of S.herds) h.chased = (h.chased ?? 0) * fade;
    const cap = S.eco?.deerCap ?? T.DEER_MAX;
    if (deer.length < cap * T.HERD_ARRIVE_BELOW && rand() < dY / T.HERD_ARRIVE_YEARS) grazersArrive('deer');
    // a herd goes: more often when the deer are crowded or a herd has been chased hard (that herd goes first);
    // never so many that fewer than 3 deer stay (the old rule then brings a herd back)
    const staying = deer.filter((d) => !d.leaving);
    const herds = S.herds.filter((h) => h.members.some((m) => !m.dead && !m.leaving));
    const hard = herds.filter((h) => h.chased >= T.HERD_CHASED_AT);
    const p = dY / T.HERD_LEAVE_YEARS * (deer.length >= cap * T.DEER_CROWD_AT ? T.HERD_LEAVE_CROWD : 1) * (hard.length ? T.HERD_LEAVE_CHASED : 1);
    if (herds.length && staying.length > 4 && rand() < p) {
      const h = hard.length ? hard.reduce((a, b) => (a.chased > b.chased ? a : b)) : pick(herds);
      const live = h.members.filter((m) => !m.dead && !m.leaving);
      const go = live.slice(0, Math.min(live.length, T.HERD_LEAVE_MAX, staying.length - 3));
      if (go.length) { setLeaving(go); h.chased = 0; S.comeGo.deerOutGroups++; }
    }
    if (rabbits.length < T.RABBIT_MAX * T.RABBIT_ARRIVE_BELOW && rand() < dY / T.RABBIT_ARRIVE_YEARS) grazersArrive('rabbit');
    if (rabbits.length >= T.RABBIT_MAX * T.RABBIT_CROWD_AT && rand() < dY / T.RABBIT_LEAVE_YEARS) {
      // from the most crowded warren, never its last two
      let best = null, bn = 0;
      for (const wr of S.warrens) { const n = rabbits.filter((r) => r.warren === wr && !r.leaving).length; if (n > bn) { bn = n; best = wr; } }
      const n = Math.min(Math.round(range(T.RABBIT_LEAVE_SIZE)), bn - 2);
      if (best && n > 0) { setLeaving(rabbits.filter((r) => r.warren === best && !r.leaving).slice(0, n)); S.comeGo.rabbitOutGroups++; }
    }
  }
  // A wolf closing on a person is a decision the god could make (strike it,
  // unseen if possible), so it opens a moment: the calendar crawls until it
  // resolves either way, at most MOMENT_MAX_S real seconds (contract, "moments"); the same wolf opens no
  // other for MOMENT_QUIET_S. The seam's moment keeper (seam.js) does the clock work, on S.now() (a skip's own clock).
  const MOMENT = { cap: T.MOMENT_MAX_S, quiet: T.MOMENT_QUIET_S };
  const MOMENT_MINOR = { ...MOMENT, minor: true };
  function moment(a) {
    const hunting = !a.dead && !a.gone && (a.state === 'stalk' || a.state === 'sprint') && a.prey?.kind === 'person' && !a.prey.dead;
    // a hunt that will not kill is a minor moment (short, and not straight after another; seam.js)
    S.seam.moment.keep(`sim:wolf:${a.id}`, hunting, () => ({ text: `A wolf is stalking ${a.prey.name} of the ${a.prey.family.name} family.`, x: a.prey.x, z: a.prey.z, kind: 'predator' }), a.outcome === 'kill' ? MOMENT : MOMENT_MINOR);
  }
  function step(a, dt) {
    a.moving = false;
    if (a.species === 'wolf') moment(a);
    if (a.dead) {
      a.deadT += dt;
      // a hunter's kill still on its feet: the wounded run first (wound, above), then the fall
      if (a.dying && !a.dying.done) { dyingStep(a, dt); if (a.deadT > (a.keepBody ?? 6)) removeAnimal(a); return; }
      const k = Math.min(1, a.deadT / HUNT_LOOK.FALL_S), e = k * (2 - k);
      a.F.fig.rotation.z = e * Math.PI / 2 * (a.dying?.side ?? 1);
      if (a.dying && k < 1) a.F.fig.rotation.x *= 0.8;
      a.F.fig.position.y = e * Math.max(0, (a.F.bw ?? 0.3) / 2 - 0.06);
      if (a.species === 'bird') a.y = Math.max(land.topAt(Math.floor(a.x), Math.floor(a.z)) + 1, a.y - dt * 12);
      if (a.deadT > (a.keepBody ?? 6)) removeAnimal(a);
      return;
    }
    if (a.species === 'deer' || a.species === 'rabbit') {
      if (a.species === 'deer') deerStep(a, dt); else rabbitStep(a, dt);
      // walked out into the mist: gone from the land
      if (a.gone) { if (a.species === 'deer') S.comeGo.deerOut++; else S.comeGo.rabbitOut++; removeAnimal(a); return; }
    }
    else if (a.species === 'wolf') { wolfStep(a, dt); if (a.gone) { removeAnimal(a); return; } }
    else birdStep(a, dt);
  }
  return { newAnimal, spawnHerd, spawnFlock, spawnWolf, spawnWarren, spawnAnimal, despawn, kill, wound, removeAnimal, tick, step, flockStep, settlementCentre };
}
