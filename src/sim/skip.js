// Skip ahead (a testing aid; the director: "i want a skip to particular time
// during testing ... to see what happens if we do not interfere at all").
//
// skip(years) runs the SAME simulation as play, only without waiting for the
// screen: the very update() the frame loop calls, step after step, each step
// exactly a speed-4 frame at 60 fps (1/60 s of real time, 1/15 game second),
// with the clock advanced by its own advance(). Same rules, same randomness
// (Math.random), the god does nothing. Moments open and close as in play
// (their caps counted in the skip's own clock, S.now), but by default they do
// not crawl the calendar: nobody is watching (skip(years, { crawl: true })
// crawls as in play; dev.soak uses it to measure slowed time). The clock's `year` events fire once per year as usual. Alerts are
// collected into the summary instead of the feed (one summary alert at the
// end). Blocks are written as in play; every chunk left dirty is meshed when
// the skip ends.
//
// Work goes in slices of SLICE_MS, yielding to the browser between them, so
// the page keeps drawing and answering. Progress: bus event
// `sim:skip { done, total }` (years) after every slice, and once more with
// `finished: true` and the summary. While a skip runs the clock is held
// paused between slices (no 'pause' event), so the frame loop does not step
// the sim as well; speed and pause are put back as they were afterwards.
//
// Resolves with { years, fromYear, toYear, population: { before, after } (the settled: stats.settled),
// people: { before, after }, births, deaths, byCause, arrived, settled, left,
// attacks, wolves, families, homes, fields, peak, track, notable, alerts, ms }.
import { yearLabel, plural } from './words.js';

const STEP = 1 / 60;   // real seconds per step: one frame at 60 fps
const SPEED = 4;       // the clock's speed while skipping (the fastest button)
const SLICE_MS = 24;   // work per slice before yielding to the browser
const TRACK_EVERY = 25; // years between population samples in the summary

export function makeSkip(ctx, S, update, stats) {
  let job = null;

  // opts.crawl: let open moments slow the calendar as in play (soak() uses it to measure slowed time). By
  // default a skip does not crawl: nobody is watching, and the crawl was two thirds of a 500 year skip's steps.
  function skip(years = 100, opts = {}) {
    if (job) return job.promise;
    years = Number(years);
    if (!(years > 0)) return Promise.resolve(null);
    const clock = ctx.clock, bus = ctx.events;
    if (clock.phase !== 'running') clock.start();
    const was = { paused: clock.paused, speed: clock.speed, crawl: clock.crawl };
    clock.crawl = !!opts.crawl;
    const fromYear = clock.year, target = fromYear + years;
    const t0 = performance.now();
    let virt = S.now(); // the skip's own clock, in ms, for the moment caps
    const sum = {
      births: S.births, deaths: S.deaths, byCause: {}, arrived: 0, settled: 0, left: 0, attacks: 0, wolves: 0,
      popBefore: stats.settled, peopleBefore: S.people.filter((p) => !p.dead).length,
      peak: { population: stats.settled, year: Math.floor(fromYear) }, track: [], nextTrack: fromYear,
    };
    const alerts = [];
    const offs = [
      bus.on('sim:death', (e) => { sum.byCause[e.cause] = (sum.byCause[e.cause] ?? 0) + 1; }),
      bus.on('sim:arrive', () => { sum.arrived++; }),
      bus.on('sim:settle', () => { sum.settled++; }),
      bus.on('sim:leave', () => { sum.left++; }),
      bus.on('sim:attack', () => { sum.attacks++; }),
      // slowed time: how long moments held the calendar, in the skip's own seconds (as if played at 4x)
      bus.on('moment', (e) => {
        if (e.ended) {
          const o = slow.open.get(e.id);
          if (o) { slow.open.delete(e.id); const k = slow.byKind[o.kind] ?? (slow.byKind[o.kind] = { n: 0, s: 0, s1: 0 }); const d = (virt - o.t) / 1000; k.n++; k.s += d; k.s1 += Math.min(25, d * SPEED); }
        } else slow.open.set(e.id, { t: virt, kind: e.info?.kind ?? String(e.id).split(':').slice(0, 2).join(':') });
        if (e.on && slow.since == null) slow.since = virt;
        if (!e.on && slow.since != null) { slow.held += virt - slow.since; slow.since = null; }
      }),
    ];
    const slow = { open: new Map(), byKind: {}, held: 0, since: clock.moment ? virt : null, t0: virt };
    S.skipAlerts = alerts;
    S.now = () => virt;
    let cancelled = false;
    job = { cancel() { cancelled = true; } };
    clock.paused = true;
    const sample = () => {
      if (clock.year >= sum.nextTrack) { sum.track.push({ year: Math.floor(clock.year), population: stats.settled }); sum.nextTrack += TRACK_EVERY; }
      if (stats.settled > sum.peak.population) sum.peak = { population: stats.settled, year: Math.floor(clock.year) };
    };
    sample();

    // every chunk the skip left dirty meshed before it resolves, a slice at a time (all at once was a
    // 440 ms frame after 500 years: most of the world's 361 chunks had changed)
    const meshAll = (then) => {
      const go = () => { if (ctx.mesher.flush(Infinity, { maxMs: SLICE_MS }) > 0) setTimeout(go, 0); else then(); };
      go();
    };
    const finish = (resolve) => {
      for (const off of offs) off();
      const shift = virt - performance.now();
      S.now = () => performance.now() + shift; // keep the moment timers counting on from where the skip left them
      S.skipAlerts = null;
      clock.paused = was.paused; clock.speed = was.speed; clock.crawl = was.crawl;
      const after = stats.settled;
      const r = {
        years: Math.round((clock.year - fromYear) * 100) / 100, fromYear: Math.floor(fromYear), toYear: Math.floor(clock.year),
        population: { before: sum.popBefore, after }, people: { before: sum.peopleBefore, after: S.people.filter((p) => !p.dead).length },
        births: S.births - sum.births, deaths: S.deaths - sum.deaths, byCause: sum.byCause,
        arrived: sum.arrived, settled: sum.settled, left: sum.left, attacks: sum.attacks,
        wolves: alerts.filter((a) => a.text.startsWith('A wolf has come out of the mist')).length,
        families: stats.settledFamilies, homes: stats.homes, fields: stats.farms,
        peak: sum.peak, track: sum.track, notable: notable(alerts, after), alerts: alerts.length,
        cancelled, ms: Math.round(performance.now() - t0),
        // the share of play time spent slowed: at 4x (measured), and at 1x (estimated: fast time four times longer,
        // each moment as long as its cause lasted in game time, up to the 25 second cap)
        slowed: (() => {
          if (slow.since != null) slow.held += virt - slow.since;
          const total = (virt - slow.t0) / 1000, held = slow.held / 1000;
          const s1 = Object.values(slow.byKind).reduce((a, k) => a + k.s1, 0);
          const fast1 = (total - held) * SPEED;
          const byKind = Object.fromEntries(Object.entries(slow.byKind).map(([k, v]) => [k, { n: v.n, s: Math.round(v.s) }]));
          return { at4x: Math.round(held / Math.max(1e-6, total) * 1000) / 1000, at1x: Math.round(s1 / Math.max(1e-6, s1 + fast1) * 1000) / 1000, seconds: Math.round(held), total: Math.round(total), byKind };
        })(),
      };
      job = null;
      S.alert('info', `${cap1(plural(Math.round(r.years), 'year'))} passed while you looked away. The settlers went from ${r.population.before} to ${after}: ${plural(r.births, 'birth')}, ${plural(r.deaths, 'death')}.`);
      bus.emit('sim:skip', { done: r.years, total: years, finished: true, summary: r });
      resolve(r);
    };

    const promise = new Promise((resolve) => {
      const slice = () => {
        const end = performance.now() + SLICE_MS;
        try {
          clock.speed = SPEED;
          while (clock.year < target && !cancelled && performance.now() < end) {
            clock.paused = false;
            clock.advance(STEP, false);
            virt += STEP * 1000;
            update(STEP);
            clock.paused = true;
            sample();
          }
        } catch (err) {
          console.error('sim.skip failed:', err);
          cancelled = true;
        }
        clock.paused = true; clock.speed = was.speed;
        if (clock.year >= target || cancelled) { meshAll(() => finish(resolve)); return; }
        bus.emit('sim:skip', { done: Math.round((clock.year - fromYear) * 100) / 100, total: years });
        setTimeout(slice, 0);
      };
      bus.emit('sim:skip', { done: 0, total: years });
      setTimeout(slice, 0);
    });
    job.promise = promise;
    return promise;
  }
  skip.cancel = () => job?.cancel?.();
  Object.defineProperty(skip, 'running', { get: () => !!job });
  return skip;
}

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// soak(years): an unattended run for tuning (console `game.modules.sim.dev.soak(500)`): skips in 25 year
// chunks and sums what matters, from the subsystems' own queries and stats
export async function soak(S, skip, stats, years = 500, chunk = 25, opts = { crawl: true }) {
  const track = [], causes = {}, kinds = {};
  let births = 0, deaths = 0, ms = 0, extinct = null, held = 0, total = 0, s1 = 0;
  for (let y = 0; y < years; y += chunk) {
    const r = await skip(Math.min(chunk, years - y), opts);
    if (!r) break;
    ms += r.ms; births += r.births; deaths += r.deaths;
    for (const [k, v] of Object.entries(r.byCause ?? {})) causes[k] = (causes[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.slowed?.byKind ?? {})) { const o = kinds[k] ?? (kinds[k] = { n: 0, s: 0 }); o.n += v.n; o.s += v.s; }
    held += r.slowed.seconds; total += r.slowed.total; s1 += r.slowed.at1x * 1; // at1x averaged below
    track.push(stats.settled);
    if (!stats.settled && extinct == null && y >= 50) extinct = Math.floor(S.year);
  }
  const hl = S.seam.ask('hardshipLog');
  const hard = {}; for (const [k, v] of Object.entries(hl?.tally ?? {})) hard[k] = `${v.started} (${v.deaths} dead)`;
  const B = S.seam.tune('science')?.BANDS ?? [0.25, 0.4, 0.6, 0.75];
  const bands = { doubt: 0, doubting: 0, even: 0, believing: 0, faith: 0 };
  for (const p of S.people) { if (p.dead || p.age < 10 || p.family?.state !== 'settled') continue; const s = (p.faith + 0.5) / (p.faith + p.skep + 1); bands[s < B[0] ? 'doubt' : s < B[1] ? 'doubting' : s < B[2] ? 'even' : s < B[3] ? 'believing' : 'faith']++; }
  return { ms: Math.round(ms), track: track.join(' '), births, deaths, causes, hardships: hard, fights: stats.fightsByKind, fightDeaths: stats.fightDeaths,
    discoveries: stats.discoveries, earth: stats.earth?.text, balance: `${stats.balance?.label} (${stats.balance?.share})`, bands, forces: stats.forces, expectsHelp: stats.expectsHelp, clans: stats.clans,
    slowed4x: Math.round(held / Math.max(1, total) * 1000) / 1000, slowed1x: Math.round(s1 / Math.max(1, track.length) * 1000) / 1000, moments: kinds, extinct };
}

// the alerts worth reading, oldest first: everything bad or warning, the good
// news that changes the settlement, and the end if nobody is left
function notable(alerts, after) {
  const keep = alerts.filter((a) => a.severity === 'bad' || a.severity === 'warn' || (a.severity === 'good' && !/children were born|was born to/.test(a.text)));
  // the same kind of news repeated (deer raids, a wolf each decade): keep the first of each wording
  const seen = new Map();
  const out = [];
  for (const a of keep) {
    const k = a.text.replace(/\b(the|The) [A-Z][a-z]+ family\b/g, 'the X family').replace(/^[A-Z][a-z]+ of /, 'X of ').replace(/\d+/g, 'N');
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n === 1) out.push({ a, k });
  }
  const lines = out.map(({ a, k }) => `${yearLabel(a.year)}: ${a.text}${seen.get(k) > 1 ? ` (and ${seen.get(k) - 1} more like it)` : ''}`);
  if (lines.length > 24) lines.splice(12, lines.length - 24, `... ${lines.length - 24} more ...`);
  if (after === 0) lines.push('Nobody is settled on the land any more.');
  return lines;
}
