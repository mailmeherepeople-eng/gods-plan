// The wind (DESIGN.md "Wind you can see (director, 2026-11-17)"; rules: docs/SIM.md "The wind"; numbers:
// docs/NUMBERS.md). One wind for the whole land. It changes nothing else in the simulation: no person, crop, fire or
// faith reads it. The wind lines (view/wind.js) draw it, and the rain clouds are carried by it.
//
//   sim.ask('wind')             -> { dir, speed, gust }  the main wind
//   sim.ask('windAt', { x, z }) -> { dir, speed, gust }  the wind at one place (with the land's gentle bending and the
//                                                        gust fronts that roll across it)
//     dir    the heading the air moves TOWARD, radians, atan2(dz, dx) in world blocks: x grows to the east, z to the
//            south (view/camera.js: with the view turned north up, +x is right and +z is down the screen). So 0 blows
//            toward the east, PI/2 toward the south, PI toward the west, -PI/2 toward the north.
//     speed  blocks a game second something the wind carries (a rain cloud) moves
//     gust   0..1, how much of a gust is blowing now (0 a lull, 1 the peak of a strong gust)
//   sim.ask('wind:dev')         -> testing aids: hold(deg, strength), the pure model, the wind's own seconds
//
// How it behaves, all of it a pure function of the world's seed and the wind's own game seconds (counted like the
// season clock's, sim/season.js: still while paused and before time starts, faster at 2x and 4x, crawling while a
// moment is open, still during a battle, and a skip moves it exactly as play would), so play and skip agree:
//   heading   the weather holds a heading for a spell (CHANGE_EVERY), then may pick a new one anywhere round the
//             compass, small turns more common than big ones. It swings round to it smoothly (a slow start and a slow
//             finish), never faster than TURN_CAP_DEG_S, and a big swing has a lull in its middle (CALM_ON_TURN), as
//             real wind drops before it backs round. On top, the heading wanders a little (DRIFT_DEG) on two slow waves.
//   strength  a slow mood (MOOD, over MOOD_S) under gusts and lulls: one gust in each GUST_SLOT_S, lasting GUST_LEN
//             (real gusts last under about 20 seconds), rising quickly and easing off slowly, then a lull. The gust
//             rolls across the land with the wind as a front (GUST_FRONT_SPEED), so one place feels it before another.
//   bending   the wind at a place turns at most BEND_DEG from the main wind, in broad smooth bends BEND_SIZE blocks
//             across that shift slowly (BEND_DRIFT_S): the lines are never ruler straight, never haphazard.
// Test switches in the address: ?winddir=<degrees> (0 toward the east, 90 toward the south) and ?windspeed=<0..1>
// hold the wind still there: both together hold it entirely; winddir alone holds the heading (gusts and lulls go on),
// windspeed alone holds the strength and the gust (the heading turns as ever). Live: sim.ask('wind:dev').hold(deg, s),
// with null for the part left free, hold(null) lets go.
import { noise2 } from '../world/noise.js';
import { X0, Z0, X1, Z1 } from '../edit/vox.js';

export const TUNE_WIND = {
  // the heading
  CHANGE_EVERY: [40, 100],   // game seconds a spell of wind lasts (its swing included) before the weather may pick another
                             // heading (the director, 2026-11-17: "sometimes wind changes directions right?": a turn every minute or two)
  CHANGE_KEEP: 0.15,         // chance a new spell keeps the old heading (the wind just goes on)
  CHANGE_DEG: [30, 150],     // how far a new heading turns from the last, degrees, either way round
  CHANGE_SHAPE: 1.3,         // small turns are more common than big ones (1: all as likely)
  TURN_CAP_DEG_S: 2.5,       // the wind never turns faster than this, degrees a game second (the wandering included)
  TURN_MIN_S: 25,            // a change of heading takes at least this long
  DRIFT_DEG: 8,              // the heading wanders this far either side of its spell's heading
  DRIFT_S: [140, 61],        // on two slow waves this long (game seconds)
  CALM_ON_TURN: 0.6,         // a swing of 180 degrees takes this share off the strength in its middle (smaller swings less)
  // the strength (0 calm .. 1 strong)
  MOOD: [0.25, 0.85],        // the steady strength under the gusts wanders between these
  MOOD_S: 380,               // over about this long
  GUST_SLOT_S: 28,           // one gust and one lull in every slot this long
  GUST_LEN: [7, 16],         // a gust lasts this long
  GUST_LULL_MIN: 5,          // and is followed by at least this long a lull
  GUST_RISE: 0.35,           // the share of a gust spent rising (the rest easing off)
  GUST_SKIP: 0.15,           // chance a slot has no gust (a long lull)
  GUST_PEAK: [0.55, 1],      // how strong a gust peaks, 0..1
  GUST_SWELL: [0.6, 1.2],    // the strength is the mood times this, from a lull (gust 0) to a full gust (gust 1)
  GUST_FRONT_SPEED: 10,      // blocks a game second a gust's front rolls across the land, with the wind
  SPEED: [0.6, 4],           // blocks a game second a rain cloud is carried, from strength 0 to strength 1
  // the land's gentle bending
  BEND_DEG: 28,              // at any place the wind is at most this far from the main wind (neighbouring lines visibly not parallel)
  BEND_SIZE: 70,             // blocks across one bend (about 4 across the land)
  BEND_DRIFT_S: 600,         // the bends shift over about this long
};
const W = TUNE_WIND;
const DEG = Math.PI / 180, TAU = Math.PI * 2;

// a small seeded random (mulberry32): the same land always has the same wind
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// the address's test switches (none in node)
function switches() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  const d = q.get('winddir'), s = q.get('windspeed');
  if (d == null && s == null) return null;
  const deg = Number(d), sp = Number(s);
  return { deg: d != null && d !== '' && Number.isFinite(deg) ? deg : null, s: s != null && s !== '' && Number.isFinite(sp) ? clamp01(sp) : null };
}

// The wind as pure functions of its own seconds t (shared by the sim, the view and the check).
export function makeWind(seed, tune = W) {
  const T = tune;
  const s0 = seed >>> 0;
  const hash = (k, salt) => rng((s0 * 2654435761) ^ (k * 40503 + salt));
  // the most the wandering ever turns the heading, degrees a second, so a swing is paced to leave room for it
  const driftRate = () => T.DRIFT_DEG * TAU * (0.6 / T.DRIFT_S[0] + 0.4 / T.DRIFT_S[1]);
  const p0 = hash(0, 0x51ed)();
  const ph = [hash(1, 0x77)() * TAU, hash(2, 0x77)() * TAU];
  // spells of wind, made one after another as time reaches them: start, length, heading before, heading, swing length
  const spells = [{ at: 0, len: 0, from: p0 * 360, to: p0 * 360, swing: 0 }];
  {
    const r = hash(0, 0xa11);
    spells[0].len = T.CHANGE_EVERY[0] + (T.CHANGE_EVERY[1] - T.CHANGE_EVERY[0]) * r();
  }
  function grow(t) {
    while (spells[spells.length - 1].at + spells[spells.length - 1].len <= t) {
      const prev = spells[spells.length - 1], k = spells.length, r = hash(k, 0xa11);
      let len = T.CHANGE_EVERY[0] + (T.CHANGE_EVERY[1] - T.CHANGE_EVERY[0]) * r();
      let to = prev.to, swing = 0;
      if (r() >= T.CHANGE_KEEP) {
        const d = T.CHANGE_DEG[0] + (T.CHANGE_DEG[1] - T.CHANGE_DEG[0]) * Math.pow(r(), T.CHANGE_SHAPE);
        to = prev.to + (r() < 0.5 ? -d : d);
        // smoothstep's steepest is 1.5 times the average: paced so the swing and the wandering together stay under the cap
        swing = Math.max(T.TURN_MIN_S, (1.5 * d) / Math.max(0.2, T.TURN_CAP_DEG_S - driftRate()));
        len = Math.max(len, swing + 10);
      }
      spells.push({ at: prev.at + prev.len, len, from: prev.to, to, swing });
    }
  }
  function spellAt(t) {
    grow(t);
    let lo = 0, hi = spells.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (spells[m].at <= t) lo = m; else hi = m - 1; }
    return spells[lo];
  }
  // the main heading, degrees (not wrapped: it is continuous, so its rate can be measured), and the calm of a swing
  function headingDeg(t) {
    t = Math.max(0, t);
    const sp = spellAt(t);
    const u = sp.swing > 0 ? (t - sp.at) / sp.swing : 1;
    const base = sp.from + (sp.to - sp.from) * smooth(u);
    const drift = T.DRIFT_DEG * (0.6 * Math.sin(TAU * t / T.DRIFT_S[0] + ph[0]) + 0.4 * Math.sin(TAU * t / T.DRIFT_S[1] + ph[1]));
    return base + drift;
  }
  function calm(t) {
    const sp = spellAt(Math.max(0, t));
    if (!(sp.swing > 0)) return 1;
    const u = (t - sp.at) / sp.swing;
    if (u <= 0 || u >= 1) return 1;
    return 1 - T.CALM_ON_TURN * Math.min(1, Math.abs(sp.to - sp.from) / 180) * Math.sin(Math.PI * u);
  }
  // the mood: slow smooth wander between MOOD's ends
  function mood(t) {
    const n = 0.6 * noise2(t / T.MOOD_S + 3.1, s0 % 977 + 0.37) + 0.4 * noise2(t / (T.MOOD_S * 0.43) + 11.7, (s0 % 613) + 5.71);
    return T.MOOD[0] + (T.MOOD[1] - T.MOOD[0]) * smooth((n - 0.2) / 0.6);
  }
  // the gust blowing at time t (0..1): one in each slot, quick to rise, slow to ease off
  function gust(t) {
    const P = T.GUST_SLOT_S, k = Math.floor(t / P), u = t - k * P;
    const r = hash(k + 7919, 0x6057);
    if (r() < T.GUST_SKIP) return 0;
    const len = Math.min(P - T.GUST_LULL_MIN, T.GUST_LEN[0] + (T.GUST_LEN[1] - T.GUST_LEN[0]) * r());
    const at = r() * Math.max(0, P - len - T.GUST_LULL_MIN);
    const peak = T.GUST_PEAK[0] + (T.GUST_PEAK[1] - T.GUST_PEAK[0]) * r();
    const q = (u - at) / len;
    if (q <= 0 || q >= 1) return 0;
    const R = T.GUST_RISE;
    return peak * (q < R ? smooth(q / R) : smooth((1 - q) / (1 - R)));
  }
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  const strengthOf = (t, g) => clamp01(mood(t) * calm(t) * (T.GUST_SWELL[0] + (T.GUST_SWELL[1] - T.GUST_SWELL[0]) * g));
  const speedOf = (s) => T.SPEED[0] + (T.SPEED[1] - T.SPEED[0]) * s;
  // the land's bend at a place, radians (at most BEND_DEG either way)
  const bo = [(s0 % 1009) * 0.731 + 17.3, (s0 % 1013) * 0.577 + 41.9];
  function bend(x, z, t) {
    const L = T.BEND_SIZE, d = t / T.BEND_DRIFT_S;
    const n = 0.65 * noise2(x / L + bo[0] + d, z / L + bo[1] - d * 0.6) + 0.35 * noise2(x / (L * 0.5) + bo[1] - d * 1.3, z / (L * 0.5) + bo[0] + d * 0.8);
    return T.BEND_DEG * DEG * Math.max(-1, Math.min(1, (n - 0.5) * 2.4));
  }
  // the whole state at t into out: { dir, speed, gust, strength, mood, deg }
  // a held heading, or one swinging round to a new hold (turnTo): the same smooth, capped swing as the weather's own
  const heldDeg = (h, t) => (h.turn ? h.turn.from + (h.turn.to - h.turn.from) * smooth((t - h.turn.at) / h.turn.dur) : h.deg);
  // how long a swing of d degrees takes: never faster than the cap, never under TURN_MIN_S
  const swingSecs = (d) => Math.max(T.TURN_MIN_S, (1.5 * Math.abs(d)) / T.TURN_CAP_DEG_S);
  function main(t, out = {}, hold = null) {
    const deg = hold?.deg != null ? heldDeg(hold, t) : headingDeg(t);
    out.deg = deg; out.dir = wrapAngle(deg * DEG);
    if (hold?.s != null) { out.gust = hold.s; out.strength = hold.s; out.mood = hold.s; }
    else { const g = gust(t); out.gust = g; out.mood = mood(t); out.strength = strengthOf(t, g); }
    out.speed = speedOf(out.strength);
    // how fast the heading is turning now, degrees a game second (+ toward +z from +x): the lines curve with a turn
    const d0 = hold?.deg != null ? heldDeg(hold, Math.max(0, t - 0.5)) : headingDeg(Math.max(0, t - 0.5));
    out.turn = (deg - d0) / 0.5;
    return out;
  }
  // the wind at one place: the main wind bent by the land, with the gust as its front reaches there
  function at(t, x, z, out = {}, hold = null) {
    const m = main(t, out, hold);
    const b = bend(x, z, hold?.deg != null ? 0 : t);
    if (hold?.s == null) {
      // the gust here is the one the middle of the land had a little while ago (or will have), as its front rolls downwind
      const ux = Math.cos(m.dir), uz = Math.sin(m.dir);
      const lag = ((x - cx) * ux + (z - cz) * uz) / T.GUST_FRONT_SPEED;
      const g = gust(Math.max(0, t - lag));
      m.gust = g; m.strength = strengthOf(t, g); m.speed = speedOf(m.strength);
    }
    m.dir = wrapAngle(m.dir + b); m.bend = b;
    return m;
  }
  return { main, at, headingDeg, heldDeg, swingSecs, gust, mood, calm, bend, spells: () => spells, tune: T };
}

export default {
  id: 'wind',
  tune: TUNE_WIND,
  init(R) {
    const { S, ctx } = R;
    const seed = (ctx.world?.gen?.seed ?? 1) >>> 0;
    const M = makeWind(seed, TUNE_WIND);
    S.windSecs = 0;
    // the wind's clock against the season clock (sim/season.js, loaded first): both count the same calendar seconds, so
    // the gap between them is fixed; the rain asks the wind at a season time (windAtTime) through it, so a shower's path
    // worked out in steps, in play or in a skip, meets the wind of each step's own time
    const syncOff = () => { S.windOff = S.windSecs - (S.seasonSecs ?? 0); };
    syncOff();
    let hold = switches();
    const shape = (m) => ({ dir: m.dir, speed: m.speed, gust: m.gust });
    const tmp = {};
    R.answer('wind', () => shape(M.main(S.windSecs, tmp, hold)));
    R.answer('windAt', (p) => shape(M.at(S.windSecs, Number(p?.x) || 0, Number(p?.z) || 0, tmp, hold)));
    // the wind at one place at a time given on the season clock (the rain's drift; sim/rain-wind.js)
    R.answer('windAtTime', (p) => shape(M.at(Math.max(0, (Number(p?.secs) || 0) + S.windOff), Number(p?.x) || 0, Number(p?.z) || 0, tmp, hold)));
    // testing aids (the check, the view and the phone rig): hold the wind still, the pure model, its seconds
    R.answer('wind:dev', () => ({
      hold(deg, s = null) {
        const d = deg == null ? null : Number(deg) || 0, k = s == null ? null : clamp01(Number(s));
        hold = d == null && k == null ? null : { deg: d, s: k };
      },
      // swing a held heading (or the wind as it is now) round to deg, as the weather would: smoothly, never faster
      // than TURN_CAP_DEG_S; it then stays held there. Returns the game seconds the swing takes.
      turnTo(deg, s) {
        const t = S.windSecs, from = hold?.deg != null ? M.heldDeg(hold, t) : M.headingDeg(t);
        let d = ((Number(deg) - from) % 360 + 540) % 360 - 180;
        const dur = M.swingSecs(d);
        hold = { deg: from + d, s: s === undefined ? hold?.s ?? null : s == null ? null : clamp01(Number(s)), turn: { from, to: from + d, at: t, dur } };
        return dur;
      },
      get held() { return hold; },
      model: M,
      secs: () => S.windSecs,
      setSecs(v) { S.windSecs = Math.max(0, Number(v) || 0); syncOff(); },
      // the view's reads, written into the caller's own object (nothing made each frame)
      main: (out) => M.main(S.windSecs, out, hold),
      at: (x, z, out) => M.at(S.windSecs, x, z, out, hold),
    }));
    R.on('step', ({ dYears }) => {
      // the calendar's own seconds this step, as the season clock counts them (sim/season.js)
      const secs = dYears * ctx.clock.secondsPerYear;
      if (secs > 0) S.windSecs += secs;
      syncOff();
    });
  },
};
