// The seasons and the weather (DESIGN.md "Seasons and weather"; rules and numbers: docs/SIM.md, docs/NUMBERS.md).
// This file is the one source of truth for what season it is and what weather is falling; the look
// (view/seasons.js), the time box's label (ui/season-label.js) and the food work only read it.
//
// The clock. Spring, summer, autumn, winter, in that order, each SEASON_SECS game seconds long (sim/tune.js,
// the director's "own slow cycle", one minute at speed 1 by default). It counts the same seconds crops grow by
// and people eat by (build.js growField: game seconds times S.timeK, which is the calendar's own pace): it
// stands still while paused and before time starts, runs two or four times as fast at 2x and 4x, and a skip
// ahead (skip.js) moves it exactly as play would, because a skip runs this same step. While a moment is open the
// calendar crawls (clock.js MOMENT_RATE), crops and eating crawl with it, and so do the seasons: a field never
// ripens out of its season because the player stopped to read. During a battle the calendar stands still, and
// so do the seasons. Time starts at the beginning of spring.
//
//   sim.ask('season')  ->  { name, index, t (0..1 through this season), round (whole years of seasons so far), secs (SEASON_SECS) }
//   bus 'sim:season'   ->  { name, index, round, from } when the season turns (and a quiet line in the Log)
//   sim.ask('weather') ->  { kind: 'rain' | 'snow' | null, local, x, z, r, amount 0..1, cover 0..1 (snow lying), label }
//   sim.ask('seasonTime') -> the season clock's own seconds since time began (the look eases between seasons by it)
//
// The weather. A plan for each year of seasons, drawn from the world's seed and the year's number, so the same
// land has the same weather every time it is played (a skip and play see the same rain). Local showers drift
// across the land, rain sometimes falls over the whole map, snow falls in winter, lies, and melts as spring comes.
// Rain of a proper size that moves (the director, 2026-11-17; DESIGN.md has his words): a local shower covers a
// random share of the map from one eighth to one quarter (sim/rain-size.js), forms anywhere on the land (it fades
// in, never pops), drifts where the wind takes it (sim/rain-wind.js windNow; the wind may turn and the shower turns
// with it), and ends by fading out or by drifting off the map. Its path is worked out in fixed steps of PATH_STEP
// season seconds from where it formed, and kept, so play and a skip see it in the same places.
// The god's rain, once its act is done, lives on as a cloud that drifts the same way (addCloud below, from
// powers-nature.js): it does only what natural rain does, never a second blessing and never faith.
// Natural rain is just rain (the director: "Rain should not just be a miracle. It should rain normally also. If
// someone prays for rain, & it rains, it should not shoot up the faith."):
//   it does   put out any fire it falls on, and wet that ground so it will not catch again for WET_S game seconds;
//             end a drought whose middle it rains on for DROUGHT_S game seconds, the way a drought ends by itself
//             ("The rains came back": outcome 'passed', nobody counted as helped from above)
//   it does not  move anyone's faith or doubt, count as a sight (no witness), answer a prayer (prayers are answered
//             only by the god's own acts, forces-prayers.js 'act:after'), water fields, green dry grass, raise
//             ponds, or count toward the god's "third rain floods" rule (powers-nature.js keeps only its own rains)
// Snow changes nothing in the simulation: it is a look (and footprints).
// Test switches in the address: ?season=winter starts the clock at the beginning of that season, ?seasonsecs=N
// sets the length of a season, ?weather=rain|rain-local|snow|none holds the weather.
import { T } from './tune.js';
import { hardshipApi } from './hardship.js';
import { X0, Z0, X1, Z1 } from '../edit/vox.js';
import { RAIN_SIZE, rOfShare, shareBetween } from './rain-size.js';
import { makeWindNow, STILL } from './rain-wind.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const NAMES = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

export const TUNE_SEASON = {
  // how often each kind of weather comes, a season (the plan is drawn per year of seasons from the seed)
  SHOWERS: { spring: [1, 2], summer: [0, 1], autumn: [1, 2], winter: [0, 0] }, // local showers: at least, at most
  WHOLE_RAIN: { spring: 0.35, summer: 0.3, autumn: 0.55, winter: 0 },           // chance of rain over the whole map
  SHOWER_LEN: [0.16, 0.3],   // a shower lasts this share of a season (at 60 s a season: 10 to 18 game seconds)
  WHOLE_LEN: [0.1, 0.18],    // rain over the whole map
  SHOWER_SHARE: RAIN_SIZE.SHOWER, // a shower covers a random share of the map between these (sim/rain-size.js)
  FORM_IN: [0.05, 0.95],     // a shower forms anywhere in this share of the map's width and depth (not only at an edge)
  DRIFT: 2.5,                // a rain cloud moves at this share of the wind's speed (sim/wind.js: 0.6 to 4 blocks a game
                             // second), the way the wind blows: a shower crosses about two thirds of its width in its life
  PATH_STEP: 0.25,           // season seconds between the points of a shower's worked-out path
  OFF_FADE: 0.5,             // a shower fades out as its middle nears the map's edge: gone once its middle is this
                             // share of its radius beyond the edge, full while it is this share inside
  SNOW_AT: [0.04, 0.12],     // winter's first snow starts this far into winter
  SNOW_LEN: [0.3, 0.42],     // and falls for this share of it
  SNOW_AGAIN: 0.5,           // chance of a second, local, snowfall later in winter
  SNOW_FULL: 0.3,            // a season's share of snowfall that covers the land completely
  MELT: [0.1, 0.25],         // the snow melts from this share before the end of winter to this share into spring
  RAMP: 0.05,                // weather builds and eases off over this share of a season
  // what natural rain does (game seconds)
  WET_S: 40,                 // ground it rained on will not catch fire for this long
  DROUGHT_S: 8,              // rain on a drought's middle for this long ends it, as if the rains came back by themselves
};
const W = TUNE_SEASON;

// a small seeded random (mulberry32), so the weather plan is the same for the same land and year
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (v) => { v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// the address's test switches (none in node)
function switches() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  const len = Number(q.get('seasonsecs'));
  const at = SEASONS.indexOf(q.get('season'));
  const w = q.get('weather');
  const force = w === 'none' ? 'none' : ['rain', 'rain-local', 'snow', 'snow-local'].includes(w) ? w : null;
  return { len: Number.isFinite(len) && len >= 4 ? Math.min(3600, len) : null, at: at >= 0 ? at : null, force };
}

// One year of seasons' weather: [{ s (season index), at, len (shares of a season), kind, local, from, share, r }]
// (a local shower's `from` is where it forms; where it goes is the wind's, worked out by makeSeasonClock)
export function planYear(seed, round) {
  const r = rng((seed * 2654435761) ^ (round * 40503 + 0x9e3779b9));
  const between = (a, b) => a + (b - a) * r();
  const out = [];
  const w = X1 - X0, d = Z1 - Z0;
  for (let s = 0; s < 4; s++) {
    const name = SEASONS[s], list = [];
    if (name === 'winter') {
      list.push({ len: between(W.SNOW_LEN[0], W.SNOW_LEN[1]), kind: 'snow', local: false, fixedAt: between(W.SNOW_AT[0], W.SNOW_AT[1]) });
      if (r() < W.SNOW_AGAIN) list.push({ len: between(W.SHOWER_LEN[0], W.SHOWER_LEN[1]), kind: 'snow', local: true });
    } else {
      const [lo, hi] = W.SHOWERS[name];
      const n = lo + Math.floor(r() * (hi - lo + 1));
      for (let k = 0; k < n; k++) list.push({ len: between(W.SHOWER_LEN[0], W.SHOWER_LEN[1]), kind: 'rain', local: true });
      if (r() < W.WHOLE_RAIN[name]) list.push({ len: between(W.WHOLE_LEN[0], W.WHOLE_LEN[1]), kind: 'rain', local: false });
      // shuffled, so the whole-map rain is not always last
      for (let k = list.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [list[k], list[j]] = [list[j], list[k]]; }
    }
    // laid end to end with gaps, never across a change of season (the first and last 0.12 of a season stay clear)
    const room = 0.76 - list.reduce((n, e) => n + e.len, 0);
    let t = 0.12;
    for (const e of list) {
      const gap = room > 0 ? r() * room / list.length : 0;
      const at = e.fixedAt ?? t + gap;
      t = at + e.len;
      if (t > 0.9) break;
      const ev = { s, at, len: e.len, kind: e.kind, local: e.local, r: 0, share: 0, from: null };
      if (e.local) {
        // a shower forms anywhere on the land, of a random size from one eighth of the map to one quarter
        ev.from = [X0 + w * between(W.FORM_IN[0], W.FORM_IN[1]), Z0 + d * between(W.FORM_IN[0], W.FORM_IN[1])];
        ev.share = shareBetween(W.SHOWER_SHARE, r());
        ev.r = rOfShare(ev.share);
      }
      out.push(ev);
    }
  }
  return out;
}

// how much of a rain of radius r centred at (x, z) is still on the map, as a fade 0..1 (gone once its middle is
// OFF_FADE of its radius past the edge)
export function onMap(x, z, r) {
  const d = Math.min(x - X0, X1 - x, z - Z0, Z1 - z), k = Math.max(1, W.OFF_FADE * r);
  return smooth((d + k) / (2 * k));
}
// the season clock and the weather as functions of the clock's seconds (shared by the sim and the check).
// wind(x, z, secs) -> { dir, speed }: the wind a shower drifts in, at that season time (still air if none given)
export function makeSeasonClock(seed, L, wind = () => STILL) {
  const plans = new Map();
  const plan = (round) => {
    let p = plans.get(round);
    if (!p) { p = planYear(seed, round); plans.set(round, p); if (plans.size > 6) plans.delete(plans.keys().next().value); }
    return p;
  };
  // where a shower is `secs` into the clock: its path from where it formed, in steps of PATH_STEP season seconds,
  // each step moved by the wind at the step's start; worked out once and kept on the plan's event (so a frame, a
  // skip and a look back all read the same points), and eased between two points
  const H = W.PATH_STEP;
  const track = (e, round, secs) => {
    const t0 = (round * 4 + e.s + e.at) * L;
    const u = Math.max(0, secs - t0), k = Math.floor(u / H), f = u / H - k;
    const p = (e.path ??= [e.from[0], e.from[1]]);
    while (p.length / 2 < k + 2) {
      const n = p.length / 2 - 1, x = p[2 * n], z = p[2 * n + 1];
      const wv = wind(x, z, t0 + n * H), v = wv.speed * W.DRIFT * H;
      p.push(x + Math.cos(wv.dir) * v, z + Math.sin(wv.dir) * v);
    }
    return [p[2 * k] + (p[2 * k + 2] - p[2 * k]) * f, p[2 * k + 1] + (p[2 * k + 3] - p[2 * k + 1]) * f];
  };
  const season = (secs) => {
    const k = Math.max(0, Math.floor(secs / L)), index = k % 4;
    return { name: SEASONS[index], index, t: clamp01((secs - k * L) / L), round: Math.floor(k / 4), secs: L };
  };
  // what falls at this moment, or null
  const weatherAt = (secs) => {
    const k = Math.max(0, Math.floor(secs / L)), i = k % 4, u = secs - k * L;
    const round = Math.floor(k / 4);
    for (const e of plan(round)) {
      if (e.s !== i) continue;
      const f0 = e.at * L, f1 = (e.at + e.len) * L;
      if (u < f0 || u > f1) continue;
      const ramp = Math.max(0.5, W.RAMP * L);
      let amount = clamp01(Math.min(u - f0, f1 - u) / ramp);
      if (!e.local) { const wv = wind((X0 + X1) / 2, (Z0 + Z1) / 2, secs); return { kind: e.kind, local: false, amount, x: (X0 + X1) / 2, z: (Z0 + Z1) / 2, r: 1e4, share: 1, dir: wv.dir, speed: wv.speed * W.DRIFT }; }
      const [x, z] = track(e, round, secs);
      amount *= onMap(x, z, e.r);
      const wv = wind(x, z, secs);
      return { kind: e.kind, local: true, amount, x, z, r: e.r, share: e.share, dir: wv.dir, speed: wv.speed * W.DRIFT, id: `${round}:${e.s}:${e.at.toFixed(4)}` };
    }
    return null;
  };
  // snow lying 0..1 by the end of u seconds of this year's winter: whole-map snowfall heaps it up
  const lying = (round, u) => {
    let fell = 0;
    for (const e of plan(round)) if (e.s === 3 && e.kind === 'snow' && !e.local) fell += Math.max(0, Math.min(u, (e.at + e.len) * L) - e.at * L);
    return clamp01(fell / (W.SNOW_FULL * L));
  };
  // how much snow lies at this moment: it heaps up while winter's snow falls, lies, and melts across the change to spring
  const coverAt = (secs) => {
    const k = Math.max(0, Math.floor(secs / L)), i = k % 4, u = secs - k * L, round = Math.floor(k / 4);
    const m0 = L * (1 - W.MELT[0]), mLen = L * (W.MELT[0] + W.MELT[1]);
    if (i === 3) return lying(round, u) * (u > m0 ? 1 - smooth((u - m0) / mLen) : 1);
    if (i === 0 && round > 0 && u < L * W.MELT[1]) return lying(round - 1, L) * (1 - smooth((u + L * W.MELT[0]) / mLen));
    return 0;
  };
  return { season, weatherAt, coverAt, plan, L };
}

export default {
  id: 'season',
  tune: TUNE_SEASON,
  init(R) {
    const { S, ctx } = R;
    const sw = switches();
    const L = sw.len ?? T.SEASON_SECS;
    const seed = (ctx.world?.gen?.seed ?? 1) >>> 0;
    // the wind a rain drifts in: sim/wind.js's, at the time asked (still air if the wind is left out)
    const windNow = makeWindNow((...a) => R.ask(...a));
    const C = makeSeasonClock(seed, L, windNow);
    // the clock's own seconds; ?season=winter starts at the beginning of winter
    S.seasonSecs = (sw.at ?? 0) * L;
    let shownK = Math.floor(S.seasonSecs / L);
    const holdOf = (w) => ({ kind: w.kind ?? 'rain', local: !!w.local, x: w.x, z: w.z, r: w.r, still: !!w.still });
    let force = sw.force === 'none' ? 'none' : sw.force ? holdOf({ kind: sw.force.startsWith('snow') ? 'snow' : 'rain', local: sw.force.endsWith('-local') }) : null;

    // held weather (the address's ?weather= and the checks): a held shower forms where it is put (or a little off the
    // middle), of the smallest shower's size unless told, and drifts with the wind as any shower does (still: true
    // holds it in place)
    const forced = () => {
      if (!force) return undefined;
      if (force === 'none') return null;
      const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
      force.x ??= cx + 30; force.z ??= cz - 4;
      const r = force.local ? (force.r ?? rOfShare(RAIN_SIZE.MIN)) : 1e4;
      const wv = windNow(force.local ? force.x : cx, force.local ? force.z : cz, S.seasonSecs);
      return { kind: force.kind, local: force.local, amount: force.local ? onMap(force.x, force.z, r) : 1, x: force.local ? force.x : cx, z: force.local ? force.z : cz, r,
        share: force.local ? Math.PI * r * r / ((X1 - X0) * (Z1 - Z0)) : 1, dir: wv.dir, speed: wv.speed * W.DRIFT, id: 'held' };
    };
    // a held shower drifts with the wind, in the same steps a planned one is worked out in
    let heldAcc = 0;
    const driftHeld = (secs) => {
      if (!force || force === 'none' || !force.local || force.still || force.x == null) return;
      heldAcc += secs;
      while (heldAcc >= W.PATH_STEP) {
        heldAcc -= W.PATH_STEP;
        // (each step meets the wind of its own time: the clock is already at the step's end, heldAcc is still to come)
        const wv = windNow(force.x, force.z, S.seasonSecs - heldAcc), v = wv.speed * W.DRIFT * W.PATH_STEP;
        force.x += Math.cos(wv.dir) * v; force.z += Math.sin(wv.dir) * v;
      }
    };
    const weatherNow = () => { const f = forced(); return f !== undefined ? f : C.weatherAt(S.seasonSecs); };
    const label = (w) => {
      if (!w || w.amount < 0.2) return null;
      if (w.kind === 'snow') return w.local ? 'snow nearby' : 'snow';
      return w.local ? 'a shower' : 'rain';
    };

    R.answer('season', () => C.season(S.seasonSecs));
    R.answer('seasonTime', () => S.seasonSecs);
    R.answer('weather', () => {
      const w = weatherNow();
      const cover = force?.kind === 'snow' && !force.local ? 1 : C.coverAt(S.seasonSecs);
      return w ? { ...w, cover, label: label(w) } : { kind: null, local: false, x: 0, z: 0, r: 0, amount: 0, cover, label: null };
    });
    // testing aids (the check and the phone rig): jump the clock, hold the weather, read a year's plan
    R.answer('season:dev', () => ({
      at(name, t = 0) { const i = SEASONS.indexOf(name); S.seasonSecs = (Math.floor(S.seasonSecs / (4 * L)) * 4 + Math.max(0, i)) * L + clamp01(t) * L; shownK = Math.floor(S.seasonSecs / L); },
      setSecs(v) { S.seasonSecs = Math.max(0, Number(v) || 0); shownK = Math.floor(S.seasonSecs / L); },
      force(w) { force = w == null ? null : w === 'none' ? 'none' : holdOf(w); heldAcc = 0; },
      plan: (round) => C.plan(round ?? C.season(S.seasonSecs).round).map((e) => ({ ...e })),
      clock: C,
      stats: () => ({ ...stats }),
    }));

    const stats = { doused: 0, droughtsEnded: 0, rainS: 0, snowS: 0 };
    const rainOn = new Map(); // drought -> game seconds of rain on its middle

    // natural rain on the land, once a game second: fires out, wet ground, a drought it covers ends by itself.
    // `list`: the rains falling, each { local, x, z, r } (a shower or the whole map, and the god's drifting clouds);
    // a drought under two of them at once still counts one second a second
    let acc = 0;
    function rainEffects(list, secs) {
      const H = hardshipApi();
      if (!H || !list.length) return;
      const circles = list.map((w) => (w.local ? { x: w.x, z: w.z, r: w.r } : { x: (X0 + X1) / 2, z: (Z0 + Z1) / 2, r: 1e4 }));
      const fire = H.fire;
      for (const { x, z, r } of circles) {
        if (fire && (fire.cells.size || fire.huts.size)) {
          // nobody is counted as helped from above: douse() marks the fires it puts out as aided (the god's rain
          // does), so that mark is put back as it was
          const was = new Map();
          for (const c of fire.cells.values()) if (!was.has(c.fire)) was.set(c.fire, c.fire.aidedAll);
          for (const st of fire.huts.values()) if (!was.has(st.fire)) was.set(st.fire, st.fire.aidedAll);
          const out = fire.douse(x, z, r);
          for (const [f, a] of was) f.aidedAll = a;
          if (out.cells || out.huts.length) stats.doused++;
        }
        fire?.wetten(x, z, r, W.WET_S);
      }
      for (const d of H.water?.droughts() ?? []) {
        if (!circles.some((c) => Math.hypot(d.x - c.x, d.z - c.z) <= c.r)) continue;
        const n = (rainOn.get(d) ?? 0) + secs;
        rainOn.set(d, n);
        if (n >= W.DROUGHT_S) { rainOn.delete(d); H.water.endDrought(d, 'passed'); stats.droughtsEnded++; }
      }
      for (const d of rainOn.keys()) if (d.ended) rainOn.delete(d);
    }

    // The god's rain after its act (powers-nature.js rainAct): a cloud { x, z, r, fall, keep } that falls as light
    // rain for `fall` game seconds, drifting with the wind, and is kept `keep` seconds in all (its ground dries where
    // it stopped). It does what natural rain does (rainEffects) and nothing else: no blessing, no faith, no prayer,
    // no soaking. Its age runs on the walking clock (the step's dt), as the rain's look does.
    // R.ask('rainCloud', c) adds one (and returns it, moved in place); R.ask('clouds') lists them.
    const clouds = [];
    R.answer('rainCloud', (c) => {
      if (!c || !Number.isFinite(c.x)) return null;
      Object.assign(c, { age: 0, acc: 0, dir: c.dir ?? 0, speed: 0 });
      clouds.push(c);
      return c;
    });
    R.answer('clouds', () => clouds);
    // (secs: the season seconds this step; each part of the drift meets the wind of its own time in the step)
    function stepClouds(dt, secs = 0) {
      for (let k = clouds.length - 1; k >= 0; k--) {
        const c = clouds[k];
        c.age += dt;
        if (c.age > c.keep) { clouds.splice(k, 1); continue; }
        if (c.age > c.fall) { c.speed = 0; continue; }
        // drift in steps of at most PATH_STEP, the way a shower is worked out
        let left = dt;
        while (left > 1e-9) {
          const h = Math.min(W.PATH_STEP, left);
          const wv = windNow(c.x, c.z, S.seasonSecs + secs * (1 - left / dt));
          c.dir = wv.dir; c.speed = wv.speed * W.DRIFT;
          c.x += Math.cos(wv.dir) * c.speed * h; c.z += Math.sin(wv.dir) * c.speed * h;
          left -= h;
        }
      }
    }
    const fallingClouds = () => clouds.filter((c) => c.age < c.fall);

    R.on('step', ({ dt, dYears }) => {
      if (dt > 0) stepClouds(dt, dYears * ctx.clock.secondsPerYear);
      // the calendar's own seconds this step: dt while the years run freely, dt * MOMENT_RATE while a moment is
      // open, 0 while a battle holds the calendar (the same seconds growField and eating use)
      const secs = dYears * ctx.clock.secondsPerYear;
      if (!(secs > 0)) return;
      S.seasonSecs += secs;
      driftHeld(secs);
      const k = Math.floor(S.seasonSecs / L);
      if (k !== shownK) {
        const from = SEASONS[((shownK % 4) + 4) % 4];
        shownK = k;
        const s = C.season(S.seasonSecs);
        R.alert('info', TURN_WORDS[s.name]);
        R.signal('sim:season', { name: s.name, index: s.index, round: s.round, from });
      }
      const w = weatherNow();
      const rainingHere = w && w.amount > 0.5 && w.kind === 'rain';
      if (w && w.amount > 0.5) { if (w.kind === 'rain') stats.rainS += secs; else stats.snowS += secs; }
      const falling = fallingClouds();
      if (rainingHere || falling.length) {
        acc += secs;
        if (acc >= 1) { rainEffects(rainingHere ? [w, ...falling] : falling, acc); acc = 0; }
      } else acc = 0;
    });

    // people out in natural weather think of it, as anyone would (no faith in it: nobody thinks it was sent)
    R.on('thoughts', (p) => {
      if (p.asleep || p.inside) return null;
      const w = weatherNow();
      if (!w || w.amount < 0.5) return null;
      if (w.local && Math.hypot(p.x - w.x, p.z - w.z) > w.r) return null;
      return w.kind === 'snow' ? [[14, 'Snow. Cold feet again.'], [10, 'Look how white it is.']]
        : [[14, 'Rain again.'], [10, 'Good for the ground, this rain.'], [8, 'Wet through.']];
    });
  },
};
const TURN_WORDS = {
  spring: 'Spring. The snow goes, the trees blossom and the meadows flower.',
  summer: 'Summer has come.',
  autumn: 'Autumn. The leaves turn and fall.',
  winter: 'Winter has come. Snow will fall.',
};
export { NAMES as SEASON_NAMES };
