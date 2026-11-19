// No home yet: trees, then water, or leave (the director, 2026-11-13: "people without place to stay always
// go to trees and tries to get shelter there. never in the open. trees and near river if present. or else
// they leave. first they will look for trees then river. if no river or water for a while, during their
// search, they leave stating no proper stay. they can find a cave we make too.")
//   walking in  a family walks its route as before (people.js), noting the best shelter of trees it passes
//               (by water if it can); at night it beds down under the nearest good trees, never in the open
//   camp        when the route is done it camps under the best trees it saw and searches from there: grown-ups
//               walk out and back, the rest gather food and rest under the canopy. A free cave by water
//               (caves.js) or, once huts are known, a hut site (people.js scout) ends it.
//   leaving     no water found in NO_WATER_YEARS: they leave sooner; water but no cave (and no way to build)
//               in WAIT_YEARS: they leave; no trees to shelter under at nightfall: they leave at once. Each
//               reason has its own words. While camping they are less happy and less safe.
//   homeless    a settled family that lost its cave shelters under the trees near it and looks for another
// The sleeping itself is people.js goHomeAndSleep (and its outdoor sleeping state); this file only picks the
// place, through the 'shelterFor' answer it asks.
import { RES } from './land.js';
import { cap, number } from './words.js';

export const TUNE_SHELTER = {
  SHELTER_R: 50,        // how far a family looks for trees to shelter under, from where it stands
  SPOT_TREES: 2,        // trunks within 3 blocks that make a shelter (under a canopy or at a wood's edge)
  WATER_BONUS: 6,       // a shelter within reach of water is worth this many trunks more
  ROUTE_STOPS: 2,       // of the stage 1 route (in, nearer in, across, out), they walk this many stops, then camp
  NIGHT_R: 18,          // walking in, they bed down under trees this close to where the night finds them, if any
  TRACK_R: 14,          // walking in, the shelter they pass is judged this far round the leader
  NO_WATER_YEARS: 10,   // after the route, this many calendar years more looking for water, then they leave
  WAIT_YEARS: 24,       // water but no cave and no way to build: this many calendar years (12 life years) under the trees, then they leave
  HOMELESS_YEARS: 40,   // a settled family whose cave is gone: this long looking for another, then they leave
  SEARCH_R: 55,         // how far from camp the searchers walk by day
  SEARCH_SHARE: 0.55,   // of the grown-ups' choices, this share is a search walk
  CAMP_HAPPY: -15,      // the happiness target of those camping (points)
  CAMP_DEATH: 1.5,      // and every death chance a subsystem rolls for them (sickness, fire, a fight)
};
const C = TUNE_SHELTER;
const REASON = { // people.js REASON, for a camp that could build but found nowhere (after huts)
  grass: 'there was no flat grassy ground near the water to farm', steep: 'the ground by the water was too steep or rough to build on',
  taken: 'the good land by the water was already taken', sand: 'the land by the water was all sand', trees: 'trees crowded every spot by the water',
  rock: 'the ground by the water was bare rock', bank: 'the only dry ground was right on the bank', wet: 'the land by the water was flooded',
  poor: 'the land by the water was poor', edge: 'the water lay too far out in the mist',
};

export default {
  id: 'shelter',
  tune: TUNE_SHELTER,
  init(R) {
    const { S, ctx } = R;
    const T = R.T;
    const A = () => S.peopleApi;
    const data = (f) => R.data(f, 'shelter', () => ({ phase: 'walk', best: null, spot: null, campSince: null, homelessSince: null, night: null }));
    const hutsKnown = () => !!R.ask('hutsKnown');
    const camping = (f) => f && ((f.state === 'wander' && f.ext?.shelter?.phase === 'camp') || (f.state === 'settled' && !f.home));
    R.answer('sheltering', (f) => camping(f));

    // a place to bed down under trees near (x, z), within r: the best by trunks, water and nearness
    function treeSpot(x, z, r) {
      const L = S.land;
      let best = null, bs = -1e9;
      const step = r > 20 ? 2 : 1;
      for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) {
        if (dx * dx + dz * dz > r * r) continue;
        const sx = Math.floor(x + dx), sz = Math.floor(z + dz);
        if (!L.inside(sx, sz) || ctx.edgeClear(sx + 0.5, sz + 0.5) < 0.7) continue;
        const i = L.ci(sx, sz);
        if (L.wet[i] || L.obst[i] || L.tree[i] || L.res[i] === RES.HUT || L.res[i] === RES.STONE || L.res[i] === RES.FIELD) continue;
        const n = L.treesAround(sx, sz, 3);
        if (n < C.SPOT_TREES) continue;
        const wd = L.wdist[i];
        const s = Math.min(n, 6) - Math.hypot(dx, dz) / 15 + (wd <= T.WATER_REACH ? C.WATER_BONUS : wd <= 40 ? 2 : 0) - (wd < 3 ? 3 : 0);
        if (s > bs) { bs = s; best = { x: sx + 0.5, z: sz + 0.5, wd, trees: n, score: s }; }
      }
      return best;
    }
    const near = (a, b, d) => a && b && Math.hypot(a.x - b.x, a.z - b.z) <= d;
    // tonight's shelter for a family with no finished home
    function nightSpot(f) {
      const sh = data(f), L = f.leader();
      if (!L) return null;
      const night = S.dayT >= 0.5 ? S.dayN : S.dayN - 1; // one night runs across the day count's turn
      if (sh.night?.day === night && sh.night.s) return sh.night.s;
      let s = null;
      if (f.state === 'settled') { const c = f.home ? { x: f.home.mx ?? f.home.x, z: f.home.mz ?? f.home.z } : sh.spot ?? L; s = treeSpot(c.x, c.z, f.home ? 30 : C.SHELTER_R); }
      else if (sh.phase === 'camp') s = sh.spot;
      // walking in: trees close to where the night finds them (walking back to the best trees passed undid a day's walk)
      else s = treeSpot(L.x, L.z, C.NIGHT_R) ?? (near(sh.best, L, 40) ? sh.best : treeSpot(L.x, L.z, C.SHELTER_R));
      sh.night = { day: night, s };
      if (s && f.state === 'settled' && !f.home) sh.spot = s;
      return s;
    }
    R.answer('shelterFor', (p) => {
      const f = p?.family;
      if (!f || f.home?.done) return undefined;
      const s = nightSpot(f);
      return s ? { x: s.x, z: s.z } : undefined;
    });

    // ---------- leaving, each reason in its own words ----------
    function tallyWhy(f) {
      let best = null, bn = 0;
      for (const k in f.tally ?? {}) if (k !== 'dry' && f.tally[k] > bn) { bn = f.tally[k]; best = k; }
      return REASON[best] ?? 'there was nowhere by the water to build';
    }
    const WHY = {
      notrees: () => 'they found no trees to shelter under, and would not sleep in the open',
      nowater: () => 'they found no fresh water anywhere they searched: no proper place to stay',
      nocave: () => 'they had water and trees, but no cave to live in, and nobody here knows yet how to build a hut',
      nobuild: (f) => `they had water, but no cave, and ${tallyWhy(f)}`,
      homeless: () => 'their cave was gone and they found no other place to live',
    };
    function leaveFor(f, why) {
      if (f.state === 'leaving') return;
      data(f).left = why;
      A().leave(f, WHY[why](f), why === 'homeless' ? 'bad' : 'warn');
    }

    // walking in: they come toward the middle of the land and make camp there, not on across and out the far side
    // (the night stops them, so the whole stage 1 route took most of a life)
    R.on('family:arrive', (f) => { if (f.route.length > C.ROUTE_STOPS) f.route.length = C.ROUTE_STOPS; });

    // ---------- the camp ----------
    function startCamp(f) {
      const sh = data(f), L = f.leader();
      if (!L) return;
      const byWater = f.sawWater ? treeSpot(L.x, L.z, 40) : null;
      const s = (byWater && byWater.wd <= T.WATER_REACH ? byWater : null) ?? sh.bestWater ?? sh.best ?? treeSpot(L.x, L.z, C.SHELTER_R) ?? treeSpot(L.x, L.z, 90);
      if (!s) { leaveFor(f, 'notrees'); return; }
      sh.phase = 'camp'; sh.spot = s; sh.campSince = S.year; sh.night = null;
      f.route.length = f.ri; // the walk is over: from here they search from the camp (people.js may still add a walk to water)
      const water = f.sawWater || s.wd <= T.SCOUT_RADIUS;
      if (water) f.sawWater = true;
      const yrs = water ? C.WAIT_YEARS : C.NO_WATER_YEARS;
      const until = R.yearLabel(S.year + yrs);
      for (const m of f.members) if (!m.dead) R.story(m, water ? 'Made camp under the trees by the water, with no home to go to.' : 'Made camp under the trees, still looking for water.');
      const name = cap(A().famLabel(f));
      R.alert('warn', water
        ? `${name} are camping under the trees. They have water, but no cave${hutsKnown() ? ' and nowhere they can build' : ', and nobody here knows yet how to build'}. They will wait about ${yrs} years, until ${until}, then leave.`
        : `${name} are camping under the trees. They have found no fresh water. They will look for about ${yrs} more years, until ${until}, then leave saying there is no proper place to stay.`,
      { x: s.x, z: s.z, subject: L, aside: water && !hutsKnown() ? 'A hill near that water, and a cave in it, would keep them.' : undefined });
    }
    function campDay(p, f, sh) {
      const s = sh.spot, P = A(), rnd = Math.random;
      if (p.stage === 'adult' && rnd() < C.SEARCH_SHARE) {
        const a = rnd() * Math.PI * 2, r = 12 + rnd() * (C.SEARCH_R - 12);
        const q = P.spotNear(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 0, 3);
        P.goTo(p, q.x, q.z, { speed: T.WANDER_WALK, doing: 'searching for water and a place to live', then: () => P.work(p, 'pick', 1.5 + rnd() * 2, { doing: 'looking around' }) });
      } else if (p.stage !== 'child' && rnd() < 0.6) {
        const q = P.spotNear(s.x, s.z, 1, 5);
        P.goTo(p, q.x, q.z, { doing: 'looking for food under the trees', then: () => P.work(p, 'pick', 4 + rnd() * 3, { doing: 'looking for food' }) });
      } else {
        const q = P.spotNear(s.x, s.z, 1, 4);
        const child = p.stage === 'child';
        P.goTo(p, q.x, q.z, { doing: child ? 'playing under the trees' : 'resting under the trees', then: () => P.work(p, child ? 'play' : 'sit', 3 + rnd() * 3, { doing: child ? 'playing under the trees' : 'resting under the trees' }) });
      }
    }
    R.on('wander', (p) => {
      const f = p.family;
      if (f.state !== 'wander') return false;
      const sh = data(f), P = A();
      if (P.isNight()) {
        const s = nightSpot(f);
        if (!s) { leaveFor(f, 'notrees'); return false; }
        // camp.js (when present) beds them down round a fire at the place shelterFor gives; until then, go there
        if (R.ask('campFires') !== undefined) {
          if (Math.hypot(p.x - s.x, p.z - s.z) < 4) P.work(p, 'sit', 2, { doing: 'under the trees for the night' });
          else P.goTo(p, s.x + (Math.random() - 0.5) * 3, s.z + (Math.random() - 0.5) * 3, { doing: 'going to the trees for the night' });
        } else P.goHomeAndSleep(p);
        return true;
      }
      if (f.route[f.ri]) return false;           // walking in (or toward water people.js spotted): the stage 1 walk
      if (sh.phase !== 'camp') { startCamp(f); if (f.state !== 'wander') return false; }
      campDay(p, f, sh);
      return true;
    });
    // a settled family with no home at all (its cave was closed): the trees by day, look for another
    R.on('activity', (p) => {
      const f = p.family;
      if (f.home || A().isNight()) return false;
      if (f.food < A().needOf(f) * 2) return false; // short of food: people.js sends them to their fields and the berry bushes
      const sh = data(f);
      if (!sh.spot) { const L = f.leader() ?? p; sh.spot = treeSpot(L.x, L.z, C.SHELTER_R); }
      if (!sh.spot) return false;
      campDay(p, f, sh);
      return true;
    });

    // ---------- every little while: the best shelter passed, water seen, the timers ----------
    let acc = 0;
    R.on('step', ({ dt }) => {
      acc += dt;
      if (acc < 1.5) return;
      acc = 0;
      const night = A().isNight();
      for (const f of [...S.families]) {
        if (f.state === 'wander') {
          const sh = data(f), L = f.leader();
          if (!L) continue;
          for (const m of f.members) if (!m.dead && m.stage !== 'child' && S.land.wdistAt(Math.floor(m.x), Math.floor(m.z)) <= T.SCOUT_RADIUS) f.sawWater = true;
          // children due while they have no home: the latest one waits for a home, older ones are not born (people.js would
          // otherwise bring them all at once on settling)
          for (const m of f.members) while (m.birthAges?.length > 1 && m.age >= m.birthAges[1] + T.BIRTH_WAIT) { const a0 = m.birthAges.shift(); if (m.partner && !m.partner.dead) R.story(m, `Was to have a child at ${Math.floor(a0)}. There was no home to have it in.`); }
          if (sh.phase !== 'camp') { const s = treeSpot(L.x, L.z, C.TRACK_R); if (s && s.score > (sh.best?.score ?? -1e9)) sh.best = s; if (s && s.wd <= T.WATER_REACH && s.score > (sh.bestWater?.score ?? -1e9)) sh.bestWater = s; }
          // nightfall: drop the walk and go to the trees for the night (settled people do the same in people.js)
          if (night) {
            for (const m of f.members) if (!m.dead && !m.asleep && !m.nightBound && (m.go || m.work)) { m.go = null; m.work = null; }
          }
          // a searcher found water the camp is not near: the camp moves to trees by it
          if (sh.phase === 'camp' && !night && sh.spot && sh.spot.wd > T.WATER_REACH) {
            const w = f.members.find((m) => !m.dead && m.stage !== 'child' && S.land.wdistAt(Math.floor(m.x), Math.floor(m.z)) <= T.SCOUT_RADIUS);
            const s = w && treeSpot(w.x, w.z, 30);
            if (s && s.wd <= T.WATER_REACH) {
              sh.spot = s; sh.night = null; f.sawWater = true;
              for (const m of f.members) if (!m.dead) { R.story(m, 'Moved the camp to trees by the water.'); m.go = null; m.work = null; }
              R.alert('warn', `${cap(A().famLabel(f))} found water and moved their camp to the trees beside it. With no cave${hutsKnown() ? ' and nowhere to build' : ''}, they will wait until about ${R.yearLabel(sh.campSince + C.WAIT_YEARS)}, then leave.`, { x: s.x, z: s.z, subject: L });
            }
          }
          if (sh.phase === 'camp') {
            const yrs = S.year - sh.campSince;
            if (!f.sawWater && yrs > C.NO_WATER_YEARS) leaveFor(f, 'nowater');
            else if (f.sawWater && yrs > C.WAIT_YEARS) leaveFor(f, hutsKnown() ? 'nobuild' : 'nocave');
          }
        } else if (f.state === 'settled' && !f.home) {
          const sh = data(f);
          if (sh.homelessSince == null) sh.homelessSince = S.year;
          if (hutsKnown()) {
            const L = f.leader();
            if (L) {
              const { best } = S.land.bestHut(L.x, L.z, 30, { huts: S.buildings.filter((b) => b.kind === 'hut' || b.kind === 'cave').map((b) => ({ x: b.cx, z: b.cz })), stone: S.stone.centre, protectedAt: (x, z) => S.isProtected(x, z) });
              if (best) { f.home = S.build.planHut(f, best.x, best.z); f.plans.push(f.home); sh.homelessSince = null; for (const m of f.members) R.story(m, 'Began a hut, to have a home again.'); continue; }
            }
          }
          if (S.year - sh.homelessSince > C.HOMELESS_YEARS) leaveFor(f, 'homeless');
        }
      }
    });

    // ---------- worse off under the trees ----------
    R.mod('happy', 'shelter:camp', { add: C.CAMP_HAPPY, who: (p) => camping(p?.family), note: 'no home: camping under the trees' });
    R.mod('death', 'shelter:camp', { mul: C.CAMP_DEATH, who: (p) => camping(p?.family), note: 'no home: camping under the trees' });

    // ---------- what the god sees ----------
    R.on('fate', (p) => {
      const f = p.family, sh = f?.ext?.shelter;
      if (!sh || p.dead) return null;
      if (f.state === 'wander' && sh.phase === 'camp') {
        const end = sh.campSince + (f.sawWater ? C.WAIT_YEARS : C.NO_WATER_YEARS);
        return f.sawWater ? `Leaves about ${R.yearLabel(end)} unless the family finds a cave${hutsKnown() ? ' or a place to build' : ''}.` : `Leaves about ${R.yearLabel(end)} unless the family finds fresh water and a home.`;
      }
      if (f.state === 'settled' && !f.home && sh.homelessSince != null) return `Leaves about ${R.yearLabel(sh.homelessSince + C.HOMELESS_YEARS)} unless the family finds another cave${hutsKnown() ? ' or builds' : ''}.`;
      return null;
    });
    R.on('inspect', (e, out) => {
      if (e?.kind !== 'person') return;
      const f = e.family;
      if (f.state === 'wander' && f.ext?.shelter?.phase === 'camp') out.home = `none: camping under the trees${f.sawWater ? ' by the water' : ''}`;
      else if (f.state === 'settled' && !f.home) out.home = 'none: sheltering under the trees';
    });
    R.on('stats', (st) => {
      let n = 0;
      for (const f of S.families) if (camping(f)) n += f.members.filter((m) => !m.dead).length;
      st.sheltering = n;
    });
    void number;
  },
};
