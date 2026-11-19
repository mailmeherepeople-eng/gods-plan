// The game clock. A run opens in the 'creation' phase with time stopped
// (DESIGN.md: shape the land first); start() moves it to 'running', and only
// then do years pass. main.js calls advance(dt) once per frame.
//
//   phase    'creation' | 'running'
//   year     float, negative = BC (-5000 at the start). There is no year 0 in
//            the calendar; formatting that is the UI's job.
//   speed    multiplier (1, 2, 4 ...)
//   paused   true stops time while running
//   dt       game seconds that passed this frame (0 in creation, paused, or a
//            hidden tab); the simulation should step by this, not by real dt
//   dYears   years that passed this frame (dt / secondsPerYear)
//
//
// Moments (the director, 2026-11-12: "slow time down to normal-ish time when
// there is a decision to be made. or else things happen at a fast speed"):
//   hold(id, info)   something the god might act on has begun. While any hold
//                    is open the calendar crawls (dYears is multiplied by
//                    CLOCK.MOMENT_RATE) but dt is untouched, so people still
//                    walk at their normal pace and the player has time to act.
//   release(id)      it is over. With no holds left the years run again.
//   moment           true while any hold is open; moments is the Map of them.
//   hitStop(ms)      a 70 to 100 ms freeze for a power landing: dt is 0 until it ends; paused is not touched.
//   stopped          true during a hit-stop.
// Use dt for movement and animation, dYears for anything measured in years
// (ageing, hunger, crops, arrivals).
//
// Events (on the bus): 'phase' {from, to}, 'year' {year} once per whole year
// crossed, 'speed' {speed}, 'pause' {paused}, 'moment' {on, id, info, count}.
import { CLOCK } from '../config.js';
const HITSTOP_MAX = 250; // ms: a hit-stop never holds time longer than this

export function makeClock(bus) {
  const K = {
    phase: 'creation',
    year: CLOCK.START_YEAR,
    speed: 1,
    paused: false,
    secondsPerYear: CLOCK.SECONDS_PER_YEAR,
    dt: 0,
    dYears: 0,
    moments: new Map(),
    crawl: true,          // false: open moments do not slow the calendar (sim.skip: nobody is watching)
    still: new Set(),     // while any id is in here the calendar stands still (a battle: sim/battle.js); dt still runs
    away: new Set(),      // while any id is in here home time stands still: dt and dYears are 0, and adt carries
    adt: 0,               // the game seconds of the place being looked at instead (the battleground, sim/battle.js)
    get moment() { return K.moments.size > 0; },
    get running() { return K.phase === 'running' && !K.paused; },
    hold(id, info = null) {
      if (K.moments.has(id)) return;
      K.moments.set(id, info);
      bus.emit('moment', { on: true, id, info, count: K.moments.size });
    },
    release(id) {
      if (!K.moments.has(id)) return;
      const info = K.moments.get(id);
      K.moments.delete(id);
      bus.emit('moment', { on: K.moments.size > 0, id, info, count: K.moments.size, ended: true });
    },
    // hit-stop (the screen's punch on a power landing): time stands still for `ms` real milliseconds (at most
    // HITSTOP_MAX), without touching `paused` or sending a 'pause' event. Overlapping calls keep the later end.
    stopUntil: 0,
    hitStop(ms = 80) {
      const t = performance.now() + Math.max(0, Math.min(HITSTOP_MAX, Number(ms) || 0));
      if (t > K.stopUntil) K.stopUntil = t;
    },
    get stopped() { return performance.now() < K.stopUntil; },
    start() {
      if (K.phase === 'running') return;
      const from = K.phase;
      K.phase = 'running';
      bus.emit('phase', { from, to: K.phase });
    },
    setSpeed(s) {
      s = Math.max(0, Number(s) || 0);
      if (s === K.speed) return;
      K.speed = s;
      bus.emit('speed', { speed: s });
    },
    setPaused(p) {
      p = !!p;
      if (p === K.paused) return;
      K.paused = p;
      bus.emit('pause', { paused: p });
    },
    // `hidden`: the frame came from the renderer's hidden-tab heartbeat; time
    // does not pass while nobody is watching
    advance(realDt, hidden = false) {
      K.adt = K.running && !hidden && !K.stopped ? realDt * K.speed : 0;
      K.dt = K.away.size ? 0 : K.adt;
      K.dYears = K.still.size ? 0 : (K.dt / K.secondsPerYear) * (K.moments.size && K.crawl ? CLOCK.MOMENT_RATE : 1);
      if (!K.dYears) return;
      const before = Math.floor(K.year);
      K.year += K.dYears;
      const after = Math.floor(K.year);
      for (let y = before + 1; y <= after; y++) bus.emit('year', { year: y });
    },
  };
  return K;
}
