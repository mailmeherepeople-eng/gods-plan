// Fishing (the director, 2026-11-16: "food = animals, fishing, berries, crops" and "all of this needs to affect the
// hunger"; boats later). A grown-up with water that holds fish near home sometimes takes the spear down to it instead
// of resting or gathering: walks to the bank (or wades into the shallows), stands still with the spear raised, waits
// for a fish to come close, and strikes. A miss throws up a splash and every fish near it darts off; a hit takes the
// fish out of the water for real (fish.js: that water holds one fewer) and onto a cord over the shoulder. After a
// good catch, or when the morning is over, they carry it home, and the family's store rises at the door as it does
// for meat (the screen's food pip at the hut: the 'hunt:home' signal, kind 'fish'). More often when food is short,
// less when the house is well fed, never by night, poorer in winter (sim.ask('season'), when there is a season clock;
// without one every day is alike). Nobody fishes a kind in a body of water down to its last few (FISH_KEEP), so the
// water is never emptied by fishing alone.
//
// A plugin on the seam, after hunting (a hunt, when one starts, comes first): the activity hook drives each fisher one
// step at a time (a short walk or a piece of work, then the hook is asked again), as hunting.js does. Every number is
// in tune.js (FISHING_*, and each kind's worth and catch chance in FISH).
import { T } from './tune.js';
import { setTool, toolHome } from './bodies.js';
import { makeCordFish } from './fish-look.js';

export default {
  id: 'fishing',
  init(R) {
    const { S, ctx } = R;
    const K = T.FISH;
    const rand = Math.random;
    const P = () => S.peopleApi, F = () => S.fishApi, land = () => S.land;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const trips = new Map();  // person -> trip
    const log = { trips: 0, strikes: 0, hits: 0, food: 0, home: 0, empty: 0, byKind: {}, why: {}, ends: {}, secs: 0 };
    const rec = (p) => R.data(p, 'fishing', () => ({ trips: 0, caught: 0, last: -1e9, lastWhat: null, lastAt: -1e9 }));
    const no = (k) => { log.why[k] = (log.why[k] ?? 0) + 1; return false; };
    const doorOf = (f) => { const h = f.home; if (!h) return null; const d = h.door ?? h.drop ?? h.entrance; if (d && d.x != null) return d; return h.cx != null ? { x: h.cx + 0.5, z: h.cz + 0.5 } : null; };
    const isAdult = (q) => q && !q.dead && q.stage === 'adult' && q.family.state === 'settled';
    // the season, if there is a season clock (sim/season.js): a winter's day is a poor one for fishing
    const winter = () => R.ask('season')?.name === 'winter';
    const seasonChance = () => (winter() ? T.FISHING_WINTER : 1);
    const seasonHit = () => (winter() ? T.FISHING_WINTER_HIT : 1);

    // ---------- the water near a home ----------
    // fish worth going for near this door: in the water, out of the mist, not fished down to the last few
    function fishNear(at, r = T.FISHING_RANGE) {
      let best = null, bs = -Infinity;
      for (const f of F().list) {
        const d = Math.hypot(f.x - at.x, f.z - at.z);
        if (d > r || ctx.edgeClear(f.x, f.z) < 0.6 || !F().spare(f)) continue;
        const s = K[f.k].food * K[f.k].hit * (f.k === 'minnow' ? T.FISHING_HANDFUL : 1) - d * 0.08;
        if (s > bs) { bs = s; best = f; }
      }
      return best;
    }
    // does this family's home have water near that holds (or could hold) fish? (food-sources.mjs splits by it)
    function fishWaterNear(f) {
      const at = doorOf(f);
      if (!at) return false;
      const A = F(), L = land(), r = T.FISHING_RANGE, x0 = Math.floor(at.x), z0 = Math.floor(at.z);
      const seen = new Set();
      for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) {
        const x = x0 + dx, z = z0 + dz;
        if (!A.inside(x, z) || dx * dx + dz * dz > r * r) continue;
        const b = A.comp[A.ci(x, z)];
        if (b < 0 || seen.has(b)) continue;
        seen.add(b);
        const B = A.bodies()[b];
        if (B && Object.values(B.caps).some((c) => c > 0)) return true;
      }
      void L;
      return false;
    }
    // somewhere to stand to fish for a fish at (x, z): a dry spot on the bank beside the water, or the shallows
    // (FISHING_WADE_DEPTH or less), as close to the fish as the land allows but not on top of it
    function standFor(x, z) {
      const L = land(), A = F();
      const fx = Math.floor(x), fz = Math.floor(z);
      let best = null, bs = Infinity;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const cx = fx + dx, cz = fz + dz;
        if (!A.inside(cx, cz)) continue;
        const i = A.ci(cx, cz), wet = L.wet[i];
        const d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z);
        if (d < 0.9) continue;
        let ok = false, cost = d;
        if (!wet) ok = L.wdistAt(cx, cz) <= 1 && L.spotOk?.(cx, cz, 'person') !== false && L.passable(cx, cz, 'person');
        else if (wet <= T.FISHING_WADE_DEPTH) { ok = true; cost += T.FISHING_WADE_COST; }
        if (ok && cost < bs) { bs = cost; best = { x: cx + 0.5, z: cz + 0.5, wading: !!wet }; }
      }
      return best;
    }

    // the nearest place along the water from `from` (within `r`) where fish are about: a bank spot (or the shallows)
    // with fish within FISH_LURE_R in that water; `away`: not within 3 of this point (the spot just tried)
    function bankSpot(from, r, away = null) {
      const L = land(), A = F(), fx = Math.floor(from.x), fz = Math.floor(from.z);
      const cand = [];
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const x = fx + dx, z = fz + dz;
        if (!A.inside(x, z) || L.wdistAt(x, z) > 1) continue;
        const d = Math.hypot(dx, dz);
        if (d > r || (away && Math.hypot(x + 0.5 - away.x, z + 0.5 - away.z) < 3)) continue;
        const i = A.ci(x, z), wet = L.wet[i];
        if (wet ? wet > T.FISHING_WADE_DEPTH : !(L.passable(x, z, 'person') && L.spotOk(x, z, 'person'))) continue;
        cand.push([d + (wet ? T.FISHING_WADE_COST : 0), x, z, wet]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      for (let n = 0; n < Math.min(cand.length, 60); n++) {
        const [, x, z, wet] = cand[n];
        // fish about in the water beside it
        const near = A.within(x + 0.5, z + 0.5, T.FISH_LURE_R * 0.8, []);
        if (near.some((f) => A.spare(f) && A.comp[A.ci(Math.floor(f.x), Math.floor(f.z))] >= 0 && ctx.edgeClear(f.x, f.z) >= 0.6)) return { x: x + 0.5, z: z + 0.5, wading: !!wet };
      }
      return null;
    }

    // ---------- who goes ----------
    let nearCache = new Map(); // family -> { t, fish }
    function wantsToFish(p) {
      const f = p.family, at = doorOf(f);
      if (!isAdult(p) || !at || p.asleep || p.hidden || p.fleeing || P().isNight()) return no('not free');
      if (S.dayT < T.WAKE + 0.01 || S.dayT > T.FISHING_START_BY) return no('hour');
      if (f.plans.some((b) => !b.done && (b.kind === 'field' || b.kind === 'hut'))) return no('building');
      const wanting = f.fields.filter((fl) => fl.grow >= 1 || fl.care < T.FISHING_CARE_FIRST).length;
      if (wanting) {
        const hands = f.members.filter((m) => !m.dead && m.stage === 'adult' && !trips.has(m)).length;
        if (wanting >= hands) return no('fields');
      }
      for (const q of trips.keys()) if (q.family === f) return no('one out');
      let out = 0, adults = 0;
      for (const q of S.people) if (isAdult(q)) adults++;
      out = trips.size;
      if (out >= Math.max(1, Math.ceil(adults * T.FISHING_SHARE))) return no('share');
      // fish near home (looked for again every few game seconds)
      let c = nearCache.get(f);
      if (!c || S.clockT - c.t > 4) { c = { t: S.clockT, fish: fishNear(at) }; nearCache.set(f, c); }
      if (!c.fish || c.fish.dead) return no('no fish');
      const need = P().needOf(f);
      // a store as full as it can hold: the catch would only spoil
      if (f.food >= Math.max(need, 1) * R.value('store', f, T.STORE_MAX_YEARS) * T.FISHING_FULL) return no('store full');
      let w = T.FISHING_BASE * seasonChance();
      if (f.food < need * T.FOOD_PANIC) w *= T.FISHING_HUNGRY_MULT;
      else if (f.food < need * T.FISHING_LEAN_YEARS) w *= T.FISHING_LEAN_MULT;
      else if (f.food >= need * T.FISHING_FED_YEARS) w *= T.FISHING_FED_MULT;
      if (p.expectsHelp) w *= T.DEPENDENT_WORK;
      w *= 1 + T.FISHING_HABIT * Math.min(1, rec(p).trips / 4);
      return rand() < w || no('chance');
    }
    function startTrip(p) {
      const at = doorOf(p.family), fish = fishNear(at);
      if (!fish) return no('no fish');
      const spot = bankSpot(at, T.FISHING_RANGE) ?? standFor(fish.x, fish.z);
      if (!spot) return no('no bank');
      const t = { phase: 'walk', spot, t0: S.clockT, tries: 0, bag: [], food: 0, cord: null, aim: fish.k };
      trips.set(p, t);
      const r = rec(p);
      r.trips++; r.last = S.life; log.trips++;
      if (r.trips === 1) R.story(p, 'Went down to the water with a spear to fish for the first time.');
      setTool(p.F, 'spear');
      return lead(p, t);
    }
    // why: how the trip ended (fishingLog's `ends`, for the checks)
    function end(p, t, why = 'other') {
      if (t && !t.ended) { t.ended = true; log.ends[why] = (log.ends[why] ?? 0) + 1; log.secs += S.clockT - t.t0; }
      trips.delete(p);
      dropLure(t);
      if (p.F) setTool(p.F, null);
      if (t?.cord) { t.cord.removeFromParent(); t.cord = null; }
    }

    // ---------- the trip, one step at a time ----------
    // the trip's own walks and work carry its mark, so the step hook can tell when another subsystem (a hunt, a fire
    // to flee, a fight) has taken the fisher away mid-trip
    const goTo = (p, t, x, z, o) => { P().goTo(p, x, z, o); if (p.go) p.go.fishing = t; };
    const work = (p, t, pose, dur, o) => { P().work(p, pose, dur, o); if (p.work) p.work.fishing = t; };
    const kindWord = (k) => (k === 'minnow' ? 'minnows' : k);
    function lead(p, t) {
      const f = p.family;
      if (f.state !== 'settled' || !doorOf(f)) { end(p, t, 'unsettled'); return false; }
      if (t.phase === 'home') return goHome(p, t);
      if (P().isNight() || S.clockT - t.t0 > T.FISHING_MAX_S) return t.bag.length ? goHome(p, t) : giveUp(p, t);
      if (t.food >= T.FISHING_BAG) return goHome(p, t);
      if (!t.spot) {
        // the way to the bank failed: another fish, another spot
        if (++t.tries > T.FISHING_TRIES) return t.bag.length ? goHome(p, t) : giveUp(p, t);
        const spot = bankSpot(p, 12);
        if (!spot) return t.bag.length ? goHome(p, t) : giveUp(p, t);
        t.spot = spot; t.phase = 'walk';
      }
      if (t.phase === 'walk') {
        if (dist(p, t.spot) > 0.7) {
          dropLure(t);
          goTo(p, t, t.spot.x, t.spot.z, { r: 0.5, speed: t.tries ? T.WALK * 0.6 : undefined, doing: t.spot.wading ? 'wading into the shallows with a spear' : 'walking down to the water with a spear', fail: () => { t.tries++; t.spot = null; } });
          return true;
        }
        t.phase = 'watch'; t.watchT = 0; t.wait = T.FISHING_WAIT[0] + rand() * (T.FISHING_WAIT[1] - T.FISHING_WAIT[0]);
      }
      if (t.phase === 'watch') return watch(p, t);
      return t.bag.length ? goHome(p, t) : giveUp(p, t);
    }
    // standing still, spear raised, until a fish comes within reach (or the wait runs out and they try along the bank)
    const near = [];
    // the spot a fisher waits at draws fish in time (fish.js FISH_LURE): the water in front of them
    function lureFor(p, t) {
      const A = F();
      // a little way out into the water, where a fish has room to come and go: the open water nearest within reach
      let best = null, bs = -Infinity;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
        if (!A.inside(x, z)) continue;
        const i = A.ci(x, z), b = A.comp[i], d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
        if (b < 0 || d > T.FISHING_REACH - 0.3 || d < 0.7) continue;
        const s = Math.min(3, A.shore[i]) - d * 0.3;
        if (s > bs) { bs = s; best = { x: x + 0.5, z: z + 0.5, body: b, who: p }; }
      }
      if (t.lure) { const i = A.lures.indexOf(t.lure); if (i >= 0) A.lures.splice(i, 1); }
      t.lure = best;
      if (best) A.lures.push(best);
    }
    function dropLure(t) { if (t?.lure) { const i = F().lures.indexOf(t.lure); if (i >= 0) F().lures.splice(i, 1); t.lure = null; } }
    function watch(p, t) {
      if (!t.lure || t.lure.at !== t.spot) { lureFor(p, t); if (t.lure) t.lure.at = t.spot; }
      const where = t.spot.wading ? 'standing in the shallows' : 'on the bank';
      work(p, t, 'crouch', 0.35, {
        doing: `fishing with a spear, ${where}`,
        face: t.face ?? undefined,
        then: () => {
          t.watchT += 0.35;
          F().within(p.x, p.z, T.FISHING_REACH, near);
          let best = null, bs = -Infinity;
          for (const fish of near) {
            if (!F().spare(fish)) continue;
            const s = K[fish.k].food * (fish.k === 'minnow' ? T.FISHING_HANDFUL : 1) - dist(fish, p);
            if (s > bs) { bs = s; best = fish; }
          }
          if (!best) {
            // waiting quietly brings a fish by in time (from within FISH_LURE_R in this water)
            if (t.lure && rand() < T.FISHING_COME * 0.35) {
              let c = null, cd = Infinity;
              for (const fish of F().within(p.x, p.z, T.FISH_LURE_R, near)) {
                if (fish.body !== t.lure.body || !F().spare(fish) || fish.state === 'dart' || fish.school?.state === 'dart') continue;
                const d = dist(fish, p);
                if (d < cd) { cd = d; c = fish; }
              }
              if (c && F().comeTo(c, t.lure)) t.called = c;
            }
            // something to look at: the nearest fish in sight, so they turn toward it
            const seen = fishNear(p, 6);
            t.face = seen ? { x: seen.x, z: seen.z } : t.face;
            // a fish on its way: they wait for it
            if (t.called && !t.called.dead && (t.called.school ?? t.called).coming) t.watchT -= 0.3;
            // nothing comes: after a while, a few quiet steps along the bank to where fish are about
            if (t.watchT >= t.wait) {
              t.tries++;
              if (t.tries > T.FISHING_TRIES) { t.phase = 'done'; return; }
              const spot = bankSpot(p, T.FISHING_SEE, p);
              if (spot) { t.spot = spot; t.phase = 'walk'; }
              else { t.watchT = 0; t.wait *= 0.8; }
            }
            return;
          }
          strike(p, t, best);
        },
      });
      return true;
    }
    function strike(p, t, fish) {
      t.phase = 'strike';
      log.strikes++;
      work(p, t, 'thrust', 0.7, {
        face: fish, doing: `striking at ${fish.k === 'minnow' ? 'the minnows' : `a ${fish.k}`} with the spear`,
        tick: (dt, w) => {
          if (w.struck || w.t < T.FISHING_STRIKE_AT) return false;
          w.struck = true;
          const hit = !fish.dead && dist(fish, p) < T.FISHING_REACH + 0.6 && rand() < K[fish.k].hit * seasonHit() * (R.ask('huntSkill', p) ?? 1);
          const x = fish.x, z = fish.z;
          if (hit) {
            log.hits++;
            // a handful from a shoal; one fish otherwise
            const got = [fish];
            if (fish.k === 'minnow') for (const o of F().within(x, z, 0.9, [])) if (got.length < T.FISHING_HANDFUL && o !== fish && o.k === 'minnow' && F().spare(o)) got.push(o);
            for (const g of got) { t.food += F().take(g); t.bag.push(g.k); log.byKind[g.k] = (log.byKind[g.k] ?? 0) + 1; }
            showCord(p, t);
            const r = rec(p); r.caught += got.length; r.lastWhat = fish.k; r.lastAt = S.life;
            S.mind.push(p, fish.k === 'catfish' ? 'A catfish! It nearly pulled me in.' : fish.k === 'pike' ? 'Got the pike. Mind the teeth.' : fish.k === 'trout' ? 'A trout. Quick, but not quicker than me.' : 'A handful of minnows. Small, but supper.');
          } else S.mind.push(p, 'Missed. Now every fish here knows.');
          F().splash(x, z); // the spear goes in: the water jumps and every fish near darts off
          return false;
        },
        then: () => { t.phase = 'watch'; t.watchT = 0; },
      });
      return true;
    }
    // the catch on a cord over the shoulder (rebuilt if the figure is rebuilt)
    function showCord(p, t) {
      if (t.cord) t.cord.removeFromParent();
      t.cord = makeCordFish(t.bag.slice(-3).map((k) => K[k].color), p.F.s ?? T.PERSON_SCALE);
      p.F.group.add(t.cord);
    }
    function giveUp(p, t) {
      log.empty++;
      const r = rec(p); r.lastWhat = 'miss'; r.lastAt = S.life;
      const d = doorOf(p.family);
      end(p, t, P().isNight() ? 'empty at dark' : S.clockT - t.t0 > T.FISHING_MAX_S ? 'empty, too long' : 'empty');
      if (!d || P().isNight()) return false;
      P().goTo(p, d.x, d.z, { r: 1, doing: 'walking home from the water empty-handed' });
      return true;
    }
    function goHome(p, t) {
      const d = doorOf(p.family);
      if (!d) { end(p, t, 'no door'); return false; }
      t.phase = 'home';
      dropLure(t);
      if (P().isNight()) p.nightBound = true;
      goTo(p, t, d.x, d.z, { r: 0.9, doing: `carrying ${t.bag.length === 1 ? (t.bag[0] === 'minnow' ? 'a few minnows' : `a ${t.bag[0]}`) : 'fish'} home on a cord`, then: () => deliver(p, t) });
      return true;
    }
    function deliver(p, t, quiet = false) {
      const f = p.family, food = t.food;
      const hungry = f.members.filter((q) => !q.dead && q.hunger > 0);
      f.food += food;
      log.food += food; log.home++;
      for (const q of hungry) { q.hunger = Math.max(0, q.hunger - food * T.FISHING_FEAST); S.mind.push(q, 'Fish tonight. Bones and all.'); }
      R.signal('hunt:home', { hunter: p, family: f, kind: 'fish', fish: [...t.bag], meat: Math.round(food * 10) / 10, years: Math.round(food / Math.max(0.01, P().needOf(f)) / T.LIFE_RATE * 10) / 10, store: R.ask('foodStore', f), x: p.x, z: p.z });
      const r = rec(p);
      if (r.caught === t.bag.length) R.story(p, `Brought fish home to ${P().famLabel(f)} for the first time.`);
      if (!log.first) { log.first = true; R.alert('good', `${p.name} of ${P().famLabel(f)} brought fish home from the water on a cord. Another way to eat.`, { x: p.x, z: p.z, subject: p }); }
      S.mind.push(p, 'Fish for the pot.');
      end(p, t, quiet ? 'home, stopped early' : 'home');
      if (quiet) return;
      if (P().isNight()) { if (f.home?.done) P().enterHome(p, f.home); else P().goHomeAndSleep(p); }
      else P().work(p, 'pick', 1, { doing: 'laying the fish by' });
    }

    // ---------- hooks ----------
    R.on('activity', (p) => {
      const t = trips.get(p);
      if (t) return lead(p, t);
      if (!wantsToFish(p)) return false;
      return startTrip(p);
    });
    R.on('step', () => {
      for (const [p, t] of [...trips]) {
        if (p.dead) continue;
        // asleep or indoors with a trip still open (the night came first, or a camp claimed them): the catch, if any,
        // is in the store, and the trip is over
        if (p.asleep || p.hidden) { if (t.bag.length) deliver(p, t, true); else end(p, t, 'asleep, empty'); continue; }
        // taken away mid-trip by something else (a hunt, a fire to flee, a fight): the trip is over, and any catch on
        // the cord goes into the store as it would at night
        const g = p.go, w = p.work;
        if ((g || w) && g?.fishing !== t && w?.fishing !== t) { if (t.bag.length) deliver(p, t, true); else end(p, t, 'taken away'); continue; }
        if (p.F && (p.F.toolKind ?? null) !== 'spear') setTool(p.F, 'spear');
        const pose = p.work?.pose;
        if (p.F?.tool && pose !== 'thrust') toolHome(p.F);
        if (t.cord && t.cord.parent !== p.F?.group) showCord(p, t);
      }
    });
    R.on('person:death', (p) => { const t = trips.get(p); if (t) end(p, t, 'died'); });
    R.on('family:leave', (f) => { for (const m of f.members) { const t = trips.get(m); if (t) end(m, t, 'family left'); } nearCache.delete(f); });
    R.on('thoughts', (p) => {
      if (p.asleep) return null;
      const t = trips.get(p);
      if (t) {
        if (t.phase === 'home') return [[12, 'They swing on the cord as I walk. Supper keeping time.'], [10, 'Fish again. Nobody will complain. Much.']];
        return [[14, 'Still. Stiller. Let it come to me.'], [12, 'The water shows the sky. The fish shows itself, if you wait.'], [9, `Is that a ${kindWord(t.aim)}? There. No. There.`]];
      }
      const r = p.ext?.fishing;
      if (r && S.life - r.lastAt < 6) return r.lastWhat === 'miss' ? [[8, 'The fish were cleverer than me today.']] : [[7, 'Fish in the house. The children ate the tails.']];
      return null;
    });
    R.on('inspect', (e, out) => {
      if (!e || e.kind !== 'person' || e.dead) return;
      const r = e.ext?.fishing;
      if (trips.has(e) && e.stage === 'adult' && !out.role?.includes?.('hunter')) out.role = 'fisher';
      if (!r || !r.trips) return;
      R.section(out, { id: 'fishing', title: 'Fishing', order: 61, rows: [['Trips to the water', String(r.trips)], ['Fish brought home', String(r.caught)]] });
    });
    R.on('stats', (st) => { st.fishers = trips.size; st.fishFood = Math.round(log.food); });
    R.answer('fishingLog', () => ({ ...log, food: Math.round(log.food), out: trips.size }));
    R.answer('fishWaterNear', (f) => (f ? fishWaterNear(f) : null));
    R.answer('isFisher', (p) => trips.has(p));
    // testing: send this grown-up fishing now (sim.ask('fishNow', person)), whatever the odds
    R.answer('fishNow', (p) => { if (!isAdult(p) || trips.has(p) || !p.family.home) return false; p.go = null; p.work = null; return startTrip(p); });
  },
};
