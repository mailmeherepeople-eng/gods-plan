// What people see, and what the god's acts do to them. Faith only changes
// when someone witnesses an act (DESIGN.md): a person awake and out of doors
// sees SIGHT_DAY blocks in daylight, SIGHT_NIGHT at night, nothing when asleep
// or indoors. Witnessing raises faith and lowers skepticism; in a person's
// first EARLY_YEARS after settling (or birth) it moves them EARLY_MULT times as
// much and leaves them expecting help for good, which makes them work less.
// The forecast says only what the simulation will really do.
//
// Stage 2: the powers themselves are registered on the seam (seam.js, by id);
// Strike lives in power-strike.js. This file keeps sight, the witness of the
// land tools' acts (the default witness spec '*'), and the bolts of light.
import { makeBolt } from './bodies.js';
import { T } from './tune.js';
import { number } from './words.js';

const WHAT = {
  strike: (o) => `a bolt of light strike down ${o?.name ? o.name.toLowerCase() : 'an animal'}`,
  animal: (o) => `${o?.name ? o.name.toLowerCase() : 'an animal'} appear out of thin air`,
  raise: () => 'the land rise by itself', lower: () => 'the land sink by itself', flatten: () => 'the land flatten by itself',
  smooth: () => 'the land move by itself', hill: () => 'a hill rise out of nothing', pit: () => 'the ground fall away',
  water: () => 'water appear from nowhere', river: () => 'a river carve itself', lake: () => 'a lake fill from nowhere',
  dry: () => 'water vanish into the ground', trees: () => 'trees spring up from nothing', plants: () => 'plants spring up from nothing',
  clear: () => 'trees and plants vanish', grass: () => 'the ground change by itself', sand: () => 'the ground turn to sand by itself',
  dirt: () => 'the ground change by itself', rock: () => 'the ground turn to rock by itself',
};
export const whatSeen = (kind, target) => (WHAT[kind] ?? (() => 'something no person could do'))(target);

export function makePowers(ctx, S) {
  const sightOf = (p) => {
    if (p.dead || p.hidden || p.asleep || p.age < 2) return 0;
    return T.SIGHT_NIGHT + (T.SIGHT_DAY - T.SIGHT_NIGHT) * S.daylight;
  };
  const sees = (p, x, z, r) => { const s = sightOf(p); return s > 0 && Math.hypot(p.x - x, p.z - z) <= s + r; };
  const isEarly = (p) => S.lifeNow() - p.since <= T.EARLY_YEARS;

  function sightCircles() {
    const out = [];
    for (const p of S.people) { const r = sightOf(p); if (r > 0) out.push({ x: p.x, z: p.z, r }); }
    return out;
  }
  function seenAt(x, z, r = 0) {
    let n = 0;
    for (const p of S.people) if (sees(p, x, z, r)) n++;
    return n;
  }
  function watchers(x, z, r) { return S.people.filter((p) => sees(p, x, z, r)); }

  function whoText(n) {
    if (n === 0) {
      const anyAwake = S.people.some((p) => !p.dead && !p.hidden && !p.asleep);
      return !anyAwake && S.people.length ? 'Nobody is looking: it is night and everyone is asleep.' : 'Nobody is looking.';
    }
    return `${n === 1 ? 'One person is' : `${cap1(number(n))} people are`} watching. They will know something did this.`;
  }
  function earlyCost(list) {
    const k = list.filter((p) => isEarly(p) && !p.expectsHelp).length;
    if (!k) return null;
    return `${k === 1 ? 'One of them' : `${cap1(number(k))} of them`} came here only recently. They will expect help from now on and work less, for good.`;
  }

  // the land tools' acts (and any kind with no spec of its own): faith up WITNESS_FAITH x weight, doubt down
  // WITNESS_SKEP x weight, early witnesses EARLY_MULT times as much and hooked on help for good
  S.seam.witnessKind('*', (act) => {
    const w = T.KIND_WEIGHT[act.kind] ?? T.KIND_WEIGHT.default;
    const what = whatSeen(act.kind, act.target);
    return { faith: T.WITNESS_FAITH * w, doubt: -(T.WITNESS_SKEP * w), early: T.EARLY_MULT, hooks: true, what,
      thought: `I saw ${what}. Nobody will believe me.`, story: `Saw ${what}.` };
  });
  // an act happened at (x, z): who saw it, and what it does to them (seam.js applies the act kind's spec)
  function witness(act = {}) { return S.seam.witness(act); }

  // a bolt of light from the sky at (x, y, z), fading over 0.6 real seconds
  const bolts = [];
  function bolt(x, y, z) {
    const m = makeBolt();
    m.position.set(x, y, z);
    ctx.layers.entities.add(m);
    bolts.push({ m, t: 0 });
    return m;
  }
  function tickBolts(realDt) {
    for (const b of [...bolts]) {
      b.t += realDt;
      const k = Math.max(0, 1 - b.t / 0.6);
      b.m.scale.set(0.2 + k * 1.6, 1, 0.2 + k * 1.6);
      b.m.visible = k > 0;
      if (b.t > 0.6) { b.m.removeFromParent(); bolts.splice(bolts.indexOf(b), 1); }
    }
  }
  return { sightCircles, seenAt, witness, tickBolts, sightOf, sees, isEarly, watchers, whoText, earlyCost, bolt };
}
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
