// Caves: people's first homes (the director, 2026-11-13: "we should make cave for the people in the
// beginning. that is where the families stay"). The god carves them with the Cave tool (god/cave.js); this
// file owns what a cave is:
//   plan       where a click on a hillside would put the mouth and the chamber, or why it cannot (the tool
//              shows it and writes the blocks itself, through the recorded writer, so undo works in creation)
//   the cave   a building (kind 'cave', cat 'building') that answers what a hut answers: done, door, x, z,
//              cx, cz, family, name, so people.js, the hunters and everyone else treat it as a home. A big
//              cave holds more than one household (kin who share); `households` lists them.
//   homes      a wandering family or a homeless one that finds a free cave by water moves in; before the
//              Huts discovery (science-data.js) nobody plans a hut and new couples need a cave too
//   being seen the carve is the act kind 'cave' (faith.js: +50 to each close eyewitness); closing one is
//              'cave-close'. The god calls witness and god:act; nothing here witnesses.
// Blocks come back after undo and redo: each carve keeps its spec, and after every edit a spec whose blocks
// are intact is a cave again (and one whose blocks are gone is not).
import { B, registerBlock, isSolid } from '../world/blocks.js';
import { TREE_IDS, STRUCT_IDS, inXZ, idx } from '../edit/vox.js';
import { RES } from './land.js';
import { sideName, number, cap } from './words.js';

export const CB = {
  FLOOR: registerBlock({ name: 'SIM_CAVE_FLOOR', top: 0x5a4535, side: 0x4e3c2e, bottom: 0x3f3025 }),
};

export const TUNE_CAVES = {
  // rooms by the tool's Room option: chamber width across the mouth, depth into the hill, households it holds
  // (a family and the household of one grown child: kin share; the opening needs that much room to grow, 2026-11-13)
  ROOMS: [null, { w: 6, d: 5, homes: 2 }, { w: 8, d: 6, homes: 3 }, { w: 10, d: 7, homes: 4 }],
  HIGH: 3,              // the chamber and the mouth are this many blocks tall (people are about 2)
  CEIL: 2,              // rock left over the chamber: a hill must stand HIGH + CEIL above the mouth's floor
  MOUTH: [0, 1],        // the mouth's two columns, across (the chamber runs from -(w/2 - 1) to w/2)
  CUT_MIN: 1, CUT_MAX: 3, // the open cutting in front of the mouth, in blocks: short, so the mouth and lintel are the feature
  FOOT_MAX: 10,         // from the click, the mouth's floor is found up to this far down the slope
  LOW_SHARE: 0.6,       // this share of the chamber too low: "raise the land here first"
  SCOUT: 90,            // a family sees a free cave this far from any of its grown-ups (a dark mouth in a rock face, across the valley)
  UNREACH_YEARS: 20,    // a cave they could not walk to is not tried again for this long
  PAIR_REACH: 60,       // a new couple looks for a free cave this far from either home (before huts)
  REST_ELDER: 0.12, REST_MOTHER: 0.15, // chance an elder, or a mother of a baby, goes in to rest by day when choosing
  REST_S: [6, 14],      // game seconds resting inside
  HUTS_FROM_START: false, // true: huts are known from the start (the stage 1 rule)
  SHARE_STRANGERS: true, // (2026-11-13, joining pass) a cave with room takes in a newcomer family too, not only kin: with one
                         // cave a lone family's children had nobody to pair with, and the village died out before huts
  HUTS_LEARN: 0.004,    // each grown-up living in a cave: this share of the Huts discovery a calendar year (5 of them: about 50 years)
  CAMP_LEARN: 0.5,      // (2026-11-13) a grown-up camping under the trees, weaving shelters, adds this much of HUTS_LEARN
  MOVE_OUT: true,       // (2026-11-13) once huts are known, a cave household with no field and no flat grass by the mouth goes
  MOVE_OUT_R: 40,       // to build a hut within this of the cave, where it can farm (several households share one mouth's ground)
  CLOSE: { faith: 8, doubt: -6, happy: -10 }, // seeing a cave close over (my choice: awe, and a fright)
};
const C = TUNE_CAVES;
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // the way a mouth faces (out of the hill): south, east, north, west
const FACE = ['south', 'east', 'north', 'west'];
const TRUNKS = new Set([B.WOOD, B.WOOD_BIRCH]);

export default {
  id: 'caves',
  tune: TUNE_CAVES,
  init(R) {
    const { S, ctx } = R;
    const T = R.T;
    const W = ctx.world, V = ctx.vox;
    const A = () => S.peopleApi;
    const specs = [];  // every carve ever made: { ...plan, active: cave | null }
    let seq = 0;
    const top = (x, z) => V.groundTop(x, z);
    const isGround = (id) => isSolid(id) && !TREE_IDS.has(id) && !STRUCT_IDS.has(id) && id !== B.BUSH && id !== B.BUSH_BARE;
    const wet = (x, z) => V.waterTop(x, z) >= 0;
    const live = () => specs.filter((s) => s.active).map((s) => s.active);

    // ---------- huts: known only after the discovery ----------
    let hutsLearned = false, sciOn = null;
    const hutsKnown = () => {
      if (C.HUTS_FROM_START || hutsLearned) return true;
      if (sciOn == null) sciOn = R.ask('scienceState') !== undefined;
      return !sciOn; // no science subsystem: nobody could ever learn it, so the stage 1 rule
    };
    R.on('mind:discovery', (d) => { if (d?.id === 'huts') hutsLearned = true; });
    // living in a cave and weaving shelters under the trees teaches the shape of a home: each grown-up in a cave
    // adds HUTS_LEARN of the Huts discovery's cost a calendar year, on top of what the thinkers think (science.js)
    R.on('year', () => {
      if (hutsKnown() || R.ask('nextDiscovery')?.id !== 'huts') return;
      for (const c of live()) for (const f of c.households) for (const m of f.members) if (!m.dead && m.age >= T.PAIR_AGE) R.ask('thinkPush', m, C.HUTS_LEARN);
      for (const f of S.families) if (f.state === 'wander' && f.ext?.shelter?.phase === 'camp') for (const m of f.members) if (!m.dead && m.age >= T.PAIR_AGE) R.ask('thinkPush', m, C.HUTS_LEARN * C.CAMP_LEARN);
    });
    // huts known: a cave household that found no field by the mouth goes to build a hut where it can farm
    R.on('year', () => {
      if (!C.MOVE_OUT || !hutsKnown()) return;
      for (const c of live()) {
        tidyHomes(c);
        for (const f of [...c.households]) {
          if (!f.noFieldSaid || f.fields.length || f.plans.length || f.state !== 'settled') continue;
          const huts = S.buildings.filter((b) => b.kind === 'hut' || b.kind === 'cave').map((b) => ({ x: b.cx, z: b.cz }));
          const { best } = S.land.bestHut(c.cx, c.cz, C.MOVE_OUT_R, { huts, stone: S.stone.centre, protectedAt: (x, z) => S.isProtected(x, z) });
          if (!best) continue;
          c.households = c.households.filter((x) => x !== f); c.family = c.households[0] ?? null;
          for (const m of f.members) if (m.inside === c) A().exitHome(m);
          f.home = S.build.planHut(f, best.x, best.z); f.plans.push(f.home); f.noFieldSaid = false;
          for (const m of f.members) if (!m.dead) R.story(m, 'Left the shared cave to build a hut where there is ground to farm.');
          R.alert('info', `${cap(A().famLabel(f))} found no ground to farm by the cave, and went to build a hut where they can.`, { x: best.x, z: best.z, subject: f.leader() });
        }
      }
    });
    R.answer('noHuts', () => !hutsKnown());
    R.answer('hutsKnown', () => hutsKnown());

    // ---------- the plan: a click on a hillside ----------
    const fresh = () => { if (S.land.needFull) S.land.fullScan(); };
    function layoutFor(ax, az, di) {
      const [dx, dz] = DIRS[di], ux = -dx, uz = -dz, lx = -uz, lz = ux;
      return (k, j) => [ax + ux * k + lx * j, az + uz * k + lz * j];
    }
    function rectOf(cells) {
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const [x, z] of cells) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      return { x0, z0, x1, z1 };
    }
    const across = (R0) => Math.max(R0.w + 2, C.CUT_MIN + R0.d + 3);
    const needH = () => C.HIGH + C.CEIL;
    const TEXT = {
      edge: 'That is off the edge of the world.',
      mist: 'Lost in the mist. What you cannot see, you cannot touch.',
      taken: 'Too close to a home, a field, another cave or the standing stone.',
      wet: 'Too wet: water lies over the hill or at the mouth, and a cave there would flood.',
      low: (R0) => `Raise the land here first: a cave needs a hill at least ${needH()} high and ${across(R0)} across.`,
      roof: (n) => `The roof would break through the top of the hill. Raise the land over it by ${n} more.`,
      thin: 'The hill is too thin: the cave would break through its side or the far side. Raise or widen it there.',
      deep: 'Too close to the bottom of the world to dig.',
    };
    // one direction: the mouth faces `di`; its floor is the foot of the slope below the click
    function tryDir(cx, cz, di, R0, room) {
      const [dx, dz] = DIRS[di];
      let ax = cx, az = cz, t = top(ax, az);
      for (let s = 0; s < C.FOOT_MAX; s++) {
        const nx = ax + dx, nz = az + dz;
        if (!inXZ(nx, nz)) break;
        const nt = top(nx, nz);
        if (nt >= t) break;
        ax = nx; az = nz; t = nt;
      }
      const F = t, at = layoutFor(ax, az, di);
      const j0 = -(R0.w / 2 - 1), j1 = R0.w / 2, jw0 = j0 - 1, jw1 = j1 + 1;
      const [m0, m1] = C.MOUTH;
      const roofNeed = F + C.HIGH + C.CEIL, wallNeed = F + C.HIGH; // a wall must stand as tall as the chamber; the roof CEIL more
      let bestL = null;
      for (let L = C.CUT_MIN; L <= C.CUT_MAX; L++) {
        const bad = [], why = { edge: 0, mist: 0, taken: 0, wet: 0, roof: 0, thin: 0 };
        let roofShort = 0, chamberN = 0, chamberLow = 0;
        const chk = (x, z) => {
          if (!inXZ(x, z)) { why.edge++; return false; }
          if (ctx.edgeClear(x + 0.5, z + 0.5) < 0.75) { why.mist++; return false; }
          if (S.isProtected(x, z) || S.land.res[S.land.ci(x, z)]) { why.taken++; bad.push([x, z, 0, 0, 'taken']); return false; }
          if (wet(x, z)) { why.wet++; bad.push([x, z, 0, 0, 'wet']); return false; }
          return true;
        };
        for (let j = m0 - 1; j <= m1 + 1; j++) for (let k = 0; k <= L; k++) { const [x, z] = at(k, j); chk(x, z); }
        for (let k = L + 1; k <= L + 2 + R0.d; k++) for (let j = jw0; j <= jw1; j++) {
          const [x, z] = at(k, j);
          if (!chk(x, z)) continue;
          const h = top(x, z);
          const inner = k >= L + 2 && k <= L + 1 + R0.d && j >= j0 && j <= j1;
          if (inner) {
            chamberN++;
            if (h < roofNeed) { why.roof++; chamberLow++; roofShort = Math.max(roofShort, roofNeed - h); bad.push([x, z, h, roofNeed, 'roof']); }
          } else {
            const need = k === L + 1 && j >= m0 && j <= m1 ? wallNeed + 1 : wallNeed; // over the mouth: a lintel
            if (h < need) { why.thin++; bad.push([x, z, h, need, 'thin']); }
          }
        }
        const n = bad.length + why.edge + why.mist;
        if (!bestL || n < bestL.n) bestL = { L, bad, why, n, roofShort, low: chamberLow >= C.LOW_SHARE * chamberN };
        if (!n) break;
      }
      const L = bestL.L, k1 = L + 2 + R0.d;
      // the shapes, for the preview: apron, cutting and mouth, chamber
      const cellsIn = (ka, kb, ja, jb) => { const out = []; for (let k = ka; k <= kb; k++) for (let j = ja; j <= jb; j++) out.push(at(k, j)); return out; };
      const rects = [
        { kind: 'cut', ...rectOf(cellsIn(1, L + 1, m0, m1)), y0: F + 1, y1: F + 1 + C.HIGH },
        { kind: 'chamber', ...rectOf(cellsIn(L + 2, L + 1 + R0.d, j0, j1)), y0: F + 1, y1: F + 1 + C.HIGH },
        { kind: 'apron', ...rectOf(cellsIn(0, 0, m0 - 1, m1 + 1)), y0: F + 1, y1: F + 1 },
      ];
      const box = rectOf(cellsIn(L + 1, k1, jw0, jw1));
      const base = { dir: di, face: FACE[di], F, L, room, homes: R0.homes, capacity: R0.homes * T.HOUSE_MAX, rects, box,
        x: (box.x0 + box.x1 + 1) / 2, z: (box.z0 + box.z1 + 1) / 2, r: Math.hypot(box.x1 - box.x0 + 1, box.z1 - box.z0 + 1) / 2 };
      const w = bestL.why;
      let reason = null;
      if (F < 3) reason = 'deep';
      else if (w.edge) reason = 'edge';
      else if (w.mist) reason = 'mist';
      else if (bestL.low) reason = 'low'; // too low first: that is the first thing to fix
      else if (w.taken) reason = 'taken';
      else if (w.wet) reason = 'wet';
      else if (bestL.low) reason = 'low';
      else if (w.roof) reason = 'roof';
      else if (w.thin) reason = 'thin';
      if (reason) {
        const text = reason === 'low' ? TEXT.low(R0) : reason === 'roof' ? TEXT.roof(bestL.roofShort) : TEXT[reason];
        return { ok: false, reason, text, bad: bestL.bad, score: bestL.n, ...base };
      }
      return build(base, at, R0, ax, az);
    }
    // the blocks of an accepted plan: [x, y, z, id, was]
    function build(P, at, R0, ax, az) {
      const { F, L } = P, H = C.HIGH, [m0, m1] = C.MOUTH;
      const j0 = -(R0.w / 2 - 1), j1 = R0.w / 2, jw0 = j0 - 1, jw1 = j1 + 1, kc0 = L + 2, kc1 = L + 1 + R0.d, kb = kc1 + 1;
      const map = new Map(), own = [], trees = [];
      const put = (x, y, z, id) => { if (y < 1) return; map.set(`${x},${y},${z}`, [x, y, z, id]); };
      const g = (x, y, z) => W.get(x, y, z);
      const trunk = (x, z) => { const y = top(x, z) + 1; if (TRUNKS.has(g(x, y, z))) trees.push([x, y, z]); };
      // the apron: bare rock where the mouth meets the ground
      for (let j = m0 - 1; j <= m1 + 1; j++) {
        const [x, z] = at(0, j);
        trunk(x, z);
        if (top(x, z) === F && isGround(g(x, F, z))) { put(x, F, z, B.ROCK); own.push([x, F, z]); }
      }
      // the cutting, open to the sky, with rock sides
      for (let k = 1; k <= L; k++) {
        for (let j = m0; j <= m1; j++) {
          const [x, z] = at(k, j), t = top(x, z);
          trunk(x, z);
          for (let y = F + 1; y <= W.maxY + 1; y++) if (g(x, y, z) !== B.AIR) put(x, y, z, B.AIR);
          for (let y = t + 1; y < F; y++) put(x, y, z, B.DIRT);
          put(x, F, z, CB.FLOOR); own.push([x, F, z]);
        }
        for (const j of [m0 - 1, m1 + 1]) {
          const [x, z] = at(k, j), t = top(x, z);
          trunk(x, z);
          for (let y = F + 1; y <= t; y++) if (isGround(g(x, y, z))) put(x, y, z, B.ROCK);
          if (t > F) own.push([x, t, z]);
        }
      }
      // the front wall: rock, a bare rock lintel seen from above, the mouth through it
      for (let j = jw0; j <= jw1; j++) {
        const [x, z] = at(L + 1, j), t = top(x, z);
        for (let y = F + 1; y < t; y++) if (isGround(g(x, y, z))) put(x, y, z, B.ROCK);
        if (j >= m0 - 1 && j <= m1 + 1 && isGround(g(x, t, z))) put(x, t, z, B.ROCK);
        own.push([x, t, z]);
        if (j >= m0 && j <= m1) { for (let y = F + 1; y <= F + H; y++) put(x, y, z, B.AIR); put(x, F, z, CB.FLOOR); own.push([x, F, z]); }
      }
      // the chamber, its rock shell (leaving the hill's own surface), the hearth in the middle of the floor
      for (let k = kc0; k <= kb; k++) for (let j = jw0; j <= jw1; j++) {
        const [x, z] = at(k, j), t = top(x, z);
        own.push([x, t, z]);
        const inner = k <= kc1 && j >= j0 && j <= j1;
        if (inner) {
          for (let y = F + 1; y <= F + H; y++) put(x, y, z, B.AIR);
          put(x, F, z, CB.FLOOR); own.push([x, F, z]);
          if (F + H + 1 < t && isGround(g(x, F + H + 1, z))) put(x, F + H + 1, z, B.ROCK);
        } else for (let y = F; y <= F + H; y++) if (y < t && isGround(g(x, y, z))) put(x, y, z, B.ROCK);
      }
      const kh = kc0 + Math.floor((R0.d - 1) / 2);
      const [hx, hz] = at(kh, m0);
      put(hx, F, hz, B.CHARCOAL);
      const cells = [...map.values()].map(([x, y, z, id]) => [x, y, z, id, g(x, y, z)]).filter((c) => c[3] !== c[4]);
      // the door: in the cutting, just outside the lintel, between the mouth's two columns
      const [d0x, d0z] = at(L, m0), [d1x, d1z] = at(L, m1);
      const door = { x: (d0x + d1x) / 2 + 0.5, z: (d0z + d1z) / 2 + 0.5 };
      const [f0x, f0z] = at(-3, m0), [f1x, f1z] = at(-3, m1);
      const front = { x: (f0x + f1x) / 2 + 0.5, z: (f0z + f1z) / 2 + 0.5 }; // the open ground in front of the mouth: fields and the fire circle are sited from here
      const cin = []; for (let k = kc0; k <= kc1; k++) for (let j = j0; j <= j1; j++) cin.push(at(k, j));
      const chamber = rectOf(cin);
      const foot = [], cut = []; // reserved: the lintel, chamber and walls (RES.CAVE); the cutting (RES.DOOR: walked, protected)
      for (let k = L + 1; k <= kb; k++) for (let j = jw0; j <= jw1; j++) foot.push(at(k, j));
      for (let k = 1; k <= L; k++) for (let j = m0 - 1; j <= m1 + 1; j++) (j >= m0 && j <= m1 ? cut : foot).push(at(k, j)); // its rock sides are not climbed
      const [ck, cj] = [kc0, j0];
      const [qx, qz] = at(ck, cj), [mx, mz] = at(L + 1, m0);
      fresh();
      return {
        ...P, ok: true, cells, own, trees, door, front, chamber, foot, cut, apron: at(0, m0), hearth: { x: hx + 0.5, y: F + 1, z: hz + 0.5 }, cutY: F + H + 1,
        check: [[qx, F, qz, CB.FLOOR], [qx, F + 1, qz, B.AIR], [mx, F + 1, mz, B.AIR]], wd: S.land.wdistAt(Math.floor(door.x), Math.floor(door.z)),
        face: FACE[P.dir], text: '',
      };
    }
    // dir (optional, 0..3: south, east, north, west): the player chose which way the mouth faces (the Cave tool's
    // turn button); only that way is tried. Without it the most downhill way that fits, as before.
    function plan(px, pz, room = 1, dir = null) {
      const cx = Math.floor(px), cz = Math.floor(pz);
      const R0 = C.ROOMS[Math.round(room)] ?? C.ROOMS[1];
      if (!inXZ(cx, cz)) return { ok: false, reason: 'edge', text: TEXT.edge, bad: [], rects: [] };
      if (dir === 0 || dir === 1 || dir === 2 || dir === 3) return tryDir(cx, cz, dir, R0, Math.round(room));
      let gx = 0, gz = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const h = top(cx + dx, cz + dz); gx += dx * h; gz += dz * h; }
      const order = [0, 1, 2, 3].sort((a, b) => (DIRS[a][0] * gx + DIRS[a][1] * gz) - (DIRS[b][0] * gx + DIRS[b][1] * gz)); // most downhill first
      let first = null;
      for (const di of order) {
        const r = tryDir(cx, cz, di, R0, Math.round(room));
        if (r.ok) return r;
        if (!first) first = r;
        if (Math.hypot(gx, gz) < 4) break; // flat ground: one answer is enough
      }
      return first;
    }
    R.answer('cavePlan', plan);

    // ---------- a cave: a home in the hill ----------
    function homesWord(c) {
      const hs = c.households;
      if (!hs.length) return 'An empty cave';
      if (hs.length === 1) return `Cave of the ${hs[0].name} family`;
      return `Cave of the ${hs.slice(0, -1).map((f) => f.name).join(', ')} and ${hs[hs.length - 1].name} families`;
    }
    function activate(spec) {
      const b = spec.box;
      const e = {
        id: `cave${++seq}`, kind: 'cave', cat: 'building', x: spec.x, y: spec.F + 1, z: spec.z, ry: 0, ry0: 0, fx: 0.5, fz: 0.5,
        foot: { w: b.x1 - b.x0 + 1, d: b.z1 - b.z0 + 1, h: C.HIGH + 1, cx: 0, cz: 0 }, objs: [], cells: null, added: true,
        done: true, progress: 1, family: null, households: [], spec, door: { ...spec.door }, cx: Math.floor(spec.front.x), cz: Math.floor(spec.front.z),
        // a home is reckoned from in front of its mouth (fields, the fire, water, gathering)
        mx: spec.front.x, mz: spec.front.z, box: spec.box, chamber: spec.chamber, hearth: spec.hearth, cutY: spec.cutY, F: spec.F, room: spec.room,
        homes: spec.homes, capacity: spec.capacity, face: spec.face, carvedYear: spec.carvedYear, seenBy: spec.seenBy ?? 0,
      };
      Object.defineProperty(e, 'name', { get: () => homesWord(e), set: () => {}, enumerable: true, configurable: true });
      ctx.core.add(e);
      for (const [x, y, z] of spec.own) if (W.get(x, y, z) !== B.AIR) ctx.core.owner[idx(x, y, z)] = e.i;
      S.land.reserve(spec.foot, RES.CAVE, e.i);
      S.land.reserve(spec.cut, RES.DOOR, e.i);
      S.buildings.push(e);
      spec.active = e;
      return e;
    }
    // a cave stops being one (undone, closed): its households lose their home
    function deactivate(spec, why = 'gone') {
      const e = spec.active;
      if (!e) return;
      spec.active = null;
      for (const f of [...e.households]) loseHome(f, e, why);
      for (const [x, y, z] of spec.own) if (ctx.core.owner[idx(x, y, z)] === e.i) ctx.core.owner[idx(x, y, z)] = 0;
      if (S.buildings.includes(e)) S.build.removeBuilding(e);
      if (ctx.core.selected().includes(e)) ctx.core.select([e], 'remove');
    }
    function loseHome(f, e, why) {
      for (const m of f.members) { if (m.inside === e) { A().exitHome(m); if (why === 'closed') m.happy = Math.max(0, m.happy + C.CLOSE.happy); } if (!m.asleep || m.inside === null) { m.go = null; m.work = null; } }
      if (f.home === e) f.home = null;
      const sh = R.data(f, 'shelter', () => ({}));
      sh.homelessSince = S.year;
      for (const m of f.members) if (!m.dead) R.story(m, why === 'closed' ? 'The hill closed over the cave they lived in. Out under the trees again.' : 'The cave they lived in was gone.');
    }
    const intact = (spec) => spec.check.every(([x, y, z, id]) => W.get(x, y, z) === id);
    const overlap = (a, b) => a.box.x0 <= b.box.x1 && b.box.x0 <= a.box.x1 && a.box.z0 <= b.box.z1 && b.box.z0 <= a.box.z1;
    ctx.events.on('edit', () => {
      for (const s of specs) {
        const ok = intact(s);
        if (s.active && !ok) deactivate(s, 'gone');
        else if (!s.active && ok && !s.closing && !specs.some((o) => o !== s && o.active && overlap(o, s))) activate(s);
      }
    });
    const caveOf = (e) => (e?.kind === 'cave' ? e : null);
    function addHome(c, f) {
      if (!c.households.includes(f)) c.households.push(f);
      c.family = c.households[0];
      f.home = c;
      const sh = f.ext?.shelter; if (sh) { sh.homelessSince = null; sh.phase = 'home'; }
    }
    function tidyHomes(c) {
      c.households = c.households.filter((f) => f.home === c && f.state !== 'leaving' && S.families.includes(f) && f.members.some((m) => !m.dead));
      c.family = c.households[0] ?? null;
    }
    R.on('family:leave', (f) => { const c = caveOf(f.home); if (c) { c.households = c.households.filter((x) => x !== f); c.family = c.households[0] ?? null; } });
    R.on('family:new', (nf) => { const c = caveOf(nf.home); if (c) addHome(c, nf); });

    // the god carved one (god/cave.js wrote the blocks; it calls witness and god:act after)
    R.answer('caveCarved', (p) => {
      if (!p?.ok) return null;
      // the same carve made again after an undo: one spec, not two caves in one hill
      const again = specs.find((o) => o.active && overlap(o, p));
      if (again) return again.active; // the edit that wrote the blocks already brought the earlier carve back
      for (let i = specs.length - 1; i >= 0; i--) if (!specs[i].active && overlap(specs[i], p)) specs.splice(i, 1);
      const spec = { ...p, carvedYear: Math.floor(S.year), carvedIn: ctx.clock.phase, active: null };
      specs.push(spec);
      if (!intact(spec)) return null;
      fresh();
      return activate(spec);
    });
    R.answer('caveAt', (x, z) => live().find((c) => x >= c.box.x0 - 0.01 && x < c.box.x1 + 1 && z >= c.box.z0 - 0.01 && z < c.box.z1 + 1)
      ?? live().find((c) => c.spec.cut.some(([fx, fz]) => fx === Math.floor(x) && fz === Math.floor(z))) ?? null);
    R.answer('caves', () => live());
    // the god is about to close it: everyone inside gets out first; the blocks the tool will write back
    R.answer('caveClosePlan', (c) => {
      if (!caveOf(c)) return null;
      const cells = c.spec.cells.filter(([x, y, z, id]) => W.get(x, y, z) === id).map(([x, y, z, id, was]) => [x, y, z, was, id]);
      return { ok: true, cells, x: c.x, z: c.z, r: c.spec.r };
    });
    R.answer('caveClosing', (c) => { if (!caveOf(c)) return false; c.spec.closing = true; deactivate(c.spec, 'closed'); c.spec.closing = false; return true; });
    const hidePeople = (c) => S.people.filter((p) => !p.dead && p.inside === c);

    // ---------- the card: what carving or closing does ----------
    R.witnessKind('cave-close', { kind: 'cave-close', faith: C.CLOSE.faith, doubt: C.CLOSE.doubt, happy: C.CLOSE.happy, early: 1, hooks: false,
      what: 'a hillside close over a cave', thought: 'The hill closed itself up. Just like that.', story: 'Saw a hillside close over a cave.' });
    const FT = R.tune('faith');
    if (FT?.KIND_GROUP && !FT.KIND_GROUP['cave-close']) FT.KIND_GROUP['cave-close'] = 'land';
    function nearbyHomeless(x, z) {
      return S.families.filter((f) => (f.state === 'wander' || (f.state === 'settled' && !f.home)) && f.members.some((m) => !m.dead && Math.hypot(m.x - x, m.z - z) < C.SCOUT));
    }
    R.answer('caveForecast', (p, mode = 'carve', cave = null) => {
      const running = ctx.clock.phase === 'running';
      const gains = [], costs = [], fates = [];
      if (mode === 'close') {
        const c = caveOf(cave);
        if (!c) return R.refuse('No cave here to close.');
        gains.push('The hill is whole again, as it was before you carved it.');
        for (const f of c.households) {
          const n = hidePeople(c).filter((m) => m.family === f).length;
          costs.push(`The ${f.name} family lose their home${n ? `: ${n === 1 ? 'one' : number(n)} inside ${n === 1 ? 'gets' : 'get'} out unharmed, frightened` : ''}, and go back to sheltering under the trees.`);
          fates.push(`The ${f.name} family leave in about ${R.tune('shelter')?.HOMELESS_YEARS ?? 40} years unless they find another cave${hutsKnown() ? ' or build a hut' : ''}.`);
        }
        if (!c.households.length) costs.push('Nobody lives in it. Nobody will miss it.');
        if (!running) return R.shape({ ok: true, gains, costs, fates, who: 'Nobody is here yet.', seenBy: 0 });
        const w = R.describeWitness(R.witnessSpec({ kind: 'cave-close', x: c.x, z: c.z, r: c.spec.r }), c.x, c.z, c.spec.r, 'cave-close');
        return R.shape({ ok: true, gains, costs: [...costs, ...w.costs], fates, who: w.who, seenBy: w.seenBy });
      }
      if (!p) return R.refuse('Point at a hillside.');
      if (!p.ok) return R.refuse(p.text);
      gains.push(`A home in the hill for ${p.homes === 1 ? 'one household' : `${number(p.homes)} households${C.SHARE_STRANGERS ? '' : ' of kin'}`} (up to ${p.capacity} people), facing ${p.face}.`);
      fresh();
      const wd = S.land.wdistAt(Math.floor(p.door.x), Math.floor(p.door.z));
      if (wd <= T.WATER_REACH) gains.push(`Fresh water ${wd} steps from the mouth.`);
      else costs.push(`No fresh water within ${T.WATER_REACH} steps of the mouth: nobody will live here until there is.`);
      for (const f of nearbyHomeless(p.door.x, p.door.z).slice(0, 2)) if (wd <= T.WATER_REACH) gains.push(`The ${f.name} family, with no home nearby, will find it and move in.`);
      if (!running) return R.shape({ ok: true, gains, costs, fates, who: 'Nobody is here yet. Whoever comes will find it and think it was always there.', seenBy: 0 });
      const spec = R.witnessSpec({ kind: 'cave', x: p.x, z: p.z, r: p.r });
      const w = R.describeWitness(spec, p.x, p.z, p.r, 'cave');
      const N = R.notice({ kind: 'cave', x: p.x, z: p.z, r: p.r }, spec ?? {});
      const close = N.now.filter((n) => n.how === 'saw');
      const devout = close.filter((n) => n.p.age >= 14 && n.p.faith + (spec?.faith ?? 50) * (R.isEarly(n.p) ? (spec?.early ?? 1) : 1) * (n.t ?? 1) >= (R.tune('science')?.FAITH_STOP ?? 85)).length;
      costs.push(...w.costs);
      if (close.length) costs.push(`Their children will be raised in it: a parent above ${R.tune('faith')?.DEVOUT_HOUSE ?? 50} faith passes it on whole.`);
      if (devout) costs.push(`${devout === close.length && devout > 1 ? 'All of them' : `${cap(number(devout))} of them`} will believe too strongly ever to wonder again: no more thinking toward discoveries${hutsKnown() ? '' : ', and huts come by discovery'}.`);
      return R.shape({ ok: true, gains, costs, fates, who: w.who, seenBy: w.seenBy });
    });

    // ---------- finding a cave, moving in ----------
    function settleCave(f, c) {
      tidyHomes(c);
      if (c.spec.active !== c || c.households.length >= c.homes) { f.state = 'wander'; f.site = null; return; }
      f.state = 'settled'; f.settledYear = S.year; f.settledLife = S.life; f.site = null;
      for (const m of f.members) { A().register(m); m.since = S.life; }
      addHome(c, f);
      const wd = S.land.wdistAt(Math.floor(c.door.x), Math.floor(c.door.z));
      const where = `${sideName(c.x, c.z, S.stone.centre.x, S.stone.centre.z)} of the stone`;
      for (const m of f.members) R.story(m, 'Moved into a cave in the hillside, by fresh water.');
      S.seam.run('family:settle', f, { x: c.cx, z: c.cz, wd, cave: c });
      S.emit('sim:settle', { family: f, x: c.door.x, z: c.door.z, cave: c });
      R.alert('good', `${cap(A().famLabel(f))} moved into the cave ${where}: fresh water ${wd} steps from the mouth.`, { x: c.door.x, z: c.door.z, subject: f.leader() });
    }
    // the leader of a family that chose a cave walks to its mouth; the others follow (people.js thinkWander)
    R.on('wander', (p) => {
      const f = p.family;
      if (f.state !== 'settling' || !f.site?.cave) return false;
      if (p !== f.leader()) return false;
      const c = f.site.cave;
      if (c.spec.active !== c) { f.state = 'wander'; f.site = null; return false; }
      // the open ground in front first (a straight line to the door can run into the hill and stick there: a family stood
      // 21 steps from a cave for 35 years, 2026-11-13), then the mouth
      if (!c.front) openMouth(c);
      const far = c.front && Math.hypot(p.x - c.door.x, p.z - c.door.z) > Math.hypot(c.front.x - c.door.x, c.front.z - c.door.z) + 2;
      if (far) A().goTo(p, c.front.x, c.front.z, { speed: T.CAVE_WALK ?? T.WANDER_WALK, r: 1.5, doing: 'walking to the cave they found', then: () => settleCave(f, c) }); // at its open ground, it is theirs
      else A().goTo(p, c.door.x, c.door.z, { speed: T.CAVE_WALK ?? T.WANDER_WALK, r: 1.5, doing: 'walking to the cave they found', then: () => settleCave(f, c) });
      return true;
    });
    function usable(c) {
      const dx = Math.floor(c.door.x), dz = Math.floor(c.door.z);
      if (S.land.wdistAt(dx, dz) > T.WATER_REACH) return false;
      if (W.get(dx, c.F + 1, dz) === B.WATER || W.get(Math.floor(c.hearth.x), c.F + 1, Math.floor(c.hearth.z)) === B.WATER) return false; // flooded
      return true;
    }
    const tally = {}; const tick = (k) => { tally[k] = (tally[k] ?? 0) + 1; };
    R.answer('caveTally', () => ({ ...tally }));
    // caves by fresh water with room for another household (people.js sends arrivals toward them, index.js keeps
    // families coming while there is room): nearest the stone first
    R.answer('caveRoom', () => live().filter((c) => { tidyHomes(c); return usable(c) && c.households.length < (c.households.length && !C.SHARE_STRANGERS ? 0 : c.homes) && c.open !== false; })
      .sort((a, b) => Math.hypot(a.cx - S.stone.centre.x, a.cz - S.stone.centre.z) - Math.hypot(b.cx - S.stone.centre.x, b.cz - S.stone.centre.z)));
    function openMouth(c) {
      if (c.open != null && c.openAt > S.year - 5) return c.open;
      const [dx, dz] = DIRS[c.spec.dir];
      // from open ground a few steps out in front (a tree or a rock on the one fixed spot used to shut a good cave for
      // 20 years, 2026-11-13): the first walkable spot 4 to 9 steps out, straight or a little to either side
      let p = null;
      for (let k = 4; k <= 12 && p === null; k++) for (const side of [0, -2, 2]) {
        const ox = c.door.x + dx * (c.spec.L + k) + dz * side, oz = c.door.z + dz * (c.spec.L + k) + dx * side;
        if (!S.land.inside(Math.floor(ox), Math.floor(oz)) || !S.land.passable(Math.floor(ox), Math.floor(oz), 'person')) continue;
        S.land.newFrame();
        p = S.land.findPath(ox, oz, c.door.x, c.door.z, 'person', 2000);
        if (p) c.front = { x: ox, z: oz }; // the open ground walkers make for first
        break;
      }
      c.open = p !== null; c.openAt = S.year;
      return c.open;
    }
    function pickCave(f, free) {
      const L = f.leader();
      if (!L) return null;
      tick('looked');
      const seen = R.data(f, 'caves', () => ({ unreach: {} }));
      const pts = f.members.filter((m) => !m.dead && m.stage !== 'child');
      let best = null, bd = Infinity;
      for (const c of free) {
        if ((seen.unreach[c.id] ?? -1e9) > S.year - C.UNREACH_YEARS || !usable(c)) continue;
        const d = Math.min(...pts.map((m) => Math.hypot(m.x - c.door.x, m.z - c.door.z)));
        if (d <= C.SCOUT && d < bd) { bd = d; best = c; }
      }
      if (!best) { let md = Infinity; for (const c of free) for (const m of pts) md = Math.min(md, Math.hypot(m.x - c.door.x, m.z - c.door.z)); tick(`nearest ${f.ext?.shelter?.phase ?? '-'} ${Math.floor(md / 30) * 30}`); tick(free.some((c) => (seen.unreach[c.id] ?? -1e9) > S.year - C.UNREACH_YEARS) ? 'skipUnreach' : free.some((c) => !usable(c)) ? 'unusable' : 'tooFar'); return null; }
      // the mouth can be walked to from its own apron (checked once per cave); a long A* from far off ran out of
      // nodes or started inside the stone's box and marked good caves unreachable (2026-11-13)
      if (!openMouth(best)) { tick('mouthShut'); seen.unreach[best.id] = S.year; return null; }
      tick('chosen');
      return best;
    }
    let acc = 0;
    R.on('step', ({ dt }) => {
      acc += dt;
      if (acc < 1.5) return;
      acc = 0;
      const all = live();
      for (const c of all) tidyHomes(c);
      // a family that has reached the cave's open ground has arrived, day or night (at dusk the walk is dropped for the
      // night and its last step never ran: a family stood eight steps from its cave until dawn, 2026-11-13)
      for (const f of S.families) {
        const c = f.state === 'settling' ? f.site?.cave : null, L = c && f.leader();
        if (!L || c.spec.active !== c) continue;
        const at = c.front ?? { x: c.cx, z: c.cz };
        if (Math.hypot(L.x - at.x, L.z - at.z) <= 6 || Math.hypot(L.x - c.door.x, L.z - c.door.z) <= 6) settleCave(f, c);
      }
      if (A().isNight()) return;
      // a cave a family is already walking to is spoken for (three families once raced for one cave and two lost a day)
      const claims = (c) => S.families.filter((f) => f.state === 'settling' && f.site?.cave === c).length;
      const room = new Map(all.map((c) => [c, c.households.length ? (C.SHARE_STRANGERS ? c.homes - c.households.length : 0) - claims(c) : 1 - Math.min(1, claims(c))]));
      // an empty cave first; else, if strangers share, one with room for another household
      const free = all.filter((c) => !c.households.length && room.get(c) > 0);
      const shared = all.filter((c) => c.households.length && room.get(c) > 0);
      if (!free.length && !shared.length) return;
      for (const f of S.families) {
        const wander = f.state === 'wander', homeless = f.state === 'settled' && !f.home;
        if (!wander && !homeless) continue;
        const c = (free.length ? pickCave(f, free) : null) ?? (shared.length ? pickCave(f, shared) : null);
        if (!c) continue;
        room.set(c, room.get(c) - 1);
        if (room.get(c) <= 0) { if (free.includes(c)) free.splice(free.indexOf(c), 1); if (shared.includes(c)) shared.splice(shared.indexOf(c), 1); }
        if (wander) {
          f.state = 'settling'; f.site = { cave: c, x: c.cx, z: c.cz, wd: S.land.wdistAt(Math.floor(c.door.x), Math.floor(c.door.z)) };
          for (const m of f.members) { if (!m.asleep) { m.go = null; m.work = null; } }
        } else {
          addHome(c, f);
          for (const m of f.members) if (!m.dead) R.story(m, 'Found a cave to live in.');
          R.alert('good', `${cap(A().famLabel(f))} found a cave to live in.`, { x: c.door.x, z: c.door.z, subject: f.leader() });
        }
        if (!free.length && !shared.length) break;
      }
    });
    // a new couple before huts: a cave of their kin with room, or a free one near either home; false: nowhere yet
    // once huts are known, a couple with no hut site near them may still take a cave with room (people.js pairUp)
    R.answer('pairCave', (p, q) => { const c = pairCave(p, q); return c || null; });
    R.answer('pairHome', (p, q) => (hutsKnown() ? undefined : pairCave(p, q)));
    function pairCave(p, q) {
      for (const h of [p.family.home, q.family.home]) { const c = caveOf(h); if (c && c.spec.active === c) { tidyHomes(c); if (c.households.length < c.homes) return c; } }
      let best = null, bd = Infinity;
      for (const c of live()) {
        if (c.households.length || !usable(c)) continue;
        const d = Math.min(Math.hypot(p.x - c.door.x, p.z - c.door.z), Math.hypot(q.x - c.door.x, q.z - c.door.z));
        if (d < C.PAIR_REACH && d < bd) { bd = d; best = c; }
      }
      return best ?? false;
    }

    // ---------- resting inside by day (so a look inside finds someone) ----------
    R.on('activity', (p) => {
      const f = p.family, h = f.home;
      if (!h?.done || p.fleeing || A().isNight() || S.dayT > T.GO_HOME - 0.06 || S.dayT < T.WAKE + 0.03) return false;
      let ch = 0;
      if (p.stage === 'elder') ch = C.REST_ELDER;
      else if (p.sex === 'f' && f.members.some((c) => c.mother === p && !c.dead && c.age < 3)) ch = C.REST_MOTHER;
      if (!ch || Math.random() >= ch) return false;
      A().goTo(p, h.door.x, h.door.z, {
        doing: `going in to rest`, r: 0.8,
        then: () => {
          if (f.home !== h || A().isNight()) return;
          A().enterHome(p, h);
          p.asleep = false;
          p.restUntil = S.clockT + C.REST_S[0] + Math.random() * (C.REST_S[1] - C.REST_S[0]);
          p.doing = `resting inside the ${h.kind}`;
        },
      });
      return true;
    });

    // ---------- the inspector, stats, the land checks ----------
    R.on('inspect', (e, out) => {
      if (e?.kind === 'person') {
        const c = caveOf(e.family?.home);
        if (c) out.home = c.households.length > 1 ? `a cave shared by the ${c.households.map((f) => f.name).join(' and ')} families` : `the cave of the ${e.family.name} family`;
        return;
      }
      const c = caveOf(e);
      if (!c) return;
      tidyHomes(c);
      const inside = hidePeople(c);
      const n = c.households.reduce((s, f) => s + f.members.filter((m) => !m.dead).length, 0);
      out.role = 'cave';
      out.doing = c.households.length ? `lived in${inside.length ? `: ${number(inside.length)} inside now` : ''}` : usable(c) ? 'empty, waiting to be found' : 'empty: no fresh water near the mouth';
      out.home = c.households.length ? c.households.map((f) => `the ${f.name} family`).join(' and ') : null;
      out.story = [`${c.spec.carvedIn === 'creation' ? 'Carved before anyone came' : `Carved in ${R.yearLabel(c.carvedYear)}`}${c.spec.carvedIn === 'running' ? (c.seenBy ? `, before the eyes of ${c.seenBy}` : ', with nobody watching') : ''}.`];
      R.section(out, { id: 'cave', title: 'The cave', order: 10, rows: [
        ['Lives here', c.households.length ? c.households.map((f) => `the ${f.name} family (${f.members.filter((m) => !m.dead).length})`).join(', ') : 'nobody yet'],
        ['Room', `${c.homes === 1 ? 'one household' : `${number(c.homes)} households`}, up to ${c.capacity} people (${n} now)`],
        ['Inside now', inside.length ? inside.map((p) => p.name).join(', ') : 'nobody'],
        ['Water', `${S.land.wdistAt(Math.floor(c.door.x), Math.floor(c.door.z))} steps from the mouth`],
        ['Faces', c.face],
      ] });
    });
    R.on('stats', (st) => { const l = live(); st.caves = l.length; st.cavesLived = l.filter((c) => c.households.length).length; });
    R.answer('landNeeds', () => {
      fresh();
      const L = S.land;
      const trees = L.treesAround(Math.floor(S.stone.centre.x), Math.floor(S.stone.centre.z), 400);
      const l = live();
      return { water: L.waterCount > 0, trees, caves: l.length, cavesByWater: l.filter(usable).length };
    });
    R.on('phase:start', () => { fresh(); for (const c of live()) tidyHomes(c); });
  },
};
