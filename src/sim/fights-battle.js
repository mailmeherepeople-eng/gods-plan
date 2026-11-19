// C. Fights: the battle itself, as a pure function. Two sides of fighters go
// at each other in rounds; it returns a script (who is wounded, who falls,
// who runs, when, and which side breaks) that the map then plays out. It knows
// nothing of clans or the map: a fighter is { ref, power, wounded, deathMul },
// a side { id, name, fighters, morale }. Stage 3's battles against Earth's
// armies can call it with an outside army as one side (refs that are not
// people; the caller decides what a death means for them).
//
// Rolled with a seeded generator, so the same inputs always give the same
// script: the forecast of a power (bless weapons, calm) and the fight that
// follows are the same roll (the honest forecast rule).
import { rng } from './words.js';

export const TUNE_BATTLE = {
  ROUNDS: 8,           // at most this many rounds; then the stronger side holds the field, or both withdraw
  HIT: 0.42,           // chance a pair of fighters trade a telling blow in a round
  GANG: 0.6,           // each extra fighter on the bigger side adds this share of its power to a pair
  FIRST_DOWN: 0.27,    // a blow on an unhurt fighter kills with this chance (times their death stat), else wounds
  SECOND_DOWN: 0.55,    // a blow on a wounded one kills with this chance, else they drop out and crawl away
  WOUNDED_POWER: 0.55, // a wounded fighter fights at this share
  MORALE_LOSS: 0.9,    // a side's morale falls by this times the share of its starting fighters lost
  MORALE_FADE: 0.05,   // and by this each round it is losing on numbers
  BREAK: 0.22,         // a side whose morale falls under this breaks and runs
  PURSUIT_KILL: 0.12,  // each wounded fighter of a broken side is cut down with this chance as it runs
  HOLD_RATIO: 1.35,    // after the last round, a side this much stronger holds the field
};

// sides: [A, B]; each { id, name, morale (0..1, about 0.6), fighters: [{ ref, power, wounded?, deathMul? }] }
// returns { events: [{ round, kind: 'wound'|'death'|'out'|'flee', side, ref, by }], winner: 0|1|null,
//   broke: 0|1|null, rounds, lost: [n, n], dead: [refs, refs], hurt: [refs, refs], standing: [refs, refs], morale: [m, m] }
export function resolveBattle(sides, seed = 1, T = TUNE_BATTLE) {
  const r = rng(seed);
  const st = sides.map((s, si) => ({
    si, morale: s.morale ?? 0.6, start: s.fighters.length,
    f: s.fighters.map((x) => ({ ref: x.ref, power: Math.max(0.05, x.power ?? 1), wounded: !!x.wounded, deathMul: x.deathMul ?? 1, out: false, dead: false })),
  }));
  const events = [];
  const up = (s) => s.f.filter((x) => !x.out);
  const pw = (x) => x.power * (x.wounded ? T.WOUNDED_POWER : 1);
  let winner = null, broke = null, round = 0;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (; round < T.ROUNDS; round++) {
    const A = shuffle(up(st[0])), B = shuffle(up(st[1]));
    if (!A.length || !B.length) break;
    const n = Math.min(A.length, B.length);
    // the bigger side's extra fighters gang up on the pairs
    const extraA = A.slice(n).reduce((s, x) => s + pw(x), 0) * T.GANG / n, extraB = B.slice(n).reduce((s, x) => s + pw(x), 0) * T.GANG / n;
    const lost = [0, 0];
    for (let i = 0; i < n; i++) {
      if (r() >= T.HIT) continue;
      const a = A[i], b = B[i];
      const pa = pw(a) + extraA, pb = pw(b) + extraB;
      const aWins = r() < pa / (pa + pb);
      const [hit, by, side] = aWins ? [b, a, 1] : [a, b, 0];
      if (!hit.wounded) {
        if (r() < T.FIRST_DOWN * hit.deathMul) { hit.dead = true; hit.out = true; events.push({ round, kind: 'death', side, ref: hit.ref, by: by.ref }); }
        else { hit.wounded = true; events.push({ round, kind: 'wound', side, ref: hit.ref, by: by.ref }); }
      } else if (r() < T.SECOND_DOWN * hit.deathMul) { hit.dead = true; hit.out = true; events.push({ round, kind: 'death', side, ref: hit.ref, by: by.ref }); }
      else { hit.out = true; events.push({ round, kind: 'out', side, ref: hit.ref, by: by.ref }); }
      if (hit.out) lost[side]++;
    }
    for (const s of st) {
      s.morale -= T.MORALE_LOSS * lost[s.si] / Math.max(1, s.start);
      const mine = up(s).reduce((k, x) => k + pw(x), 0), theirs = up(st[1 - s.si]).reduce((k, x) => k + pw(x), 0);
      if (mine < theirs) s.morale -= T.MORALE_FADE * Math.min(2, theirs / Math.max(0.1, mine));
    }
    const brk = st.filter((s) => s.morale < T.BREAK || !up(s).length);
    if (brk.length) {
      // the one that broke worse runs; the other holds the field
      const s = brk.length === 2 ? (brk[0].morale <= brk[1].morale ? brk[0] : brk[1]) : brk[0];
      broke = s.si; winner = 1 - s.si;
      for (const x of up(s)) {
        if (x.wounded && r() < T.PURSUIT_KILL * x.deathMul) { x.dead = true; x.out = true; events.push({ round: round + 1, kind: 'death', side: s.si, ref: x.ref, by: null, pursuit: true }); }
        else { x.out = true; events.push({ round: round + 1, kind: 'flee', side: s.si, ref: x.ref }); }
      }
      round++;
      break;
    }
  }
  if (winner == null) {
    const a = up(st[0]).reduce((k, x) => k + pw(x), 0), b = up(st[1]).reduce((k, x) => k + pw(x), 0);
    if (!up(st[1]).length && up(st[0]).length) winner = 0;
    else if (!up(st[0]).length && up(st[1]).length) winner = 1;
    else if (a > b * T.HOLD_RATIO) winner = 0;
    else if (b > a * T.HOLD_RATIO) winner = 1;
  }
  return {
    events, winner, broke, rounds: round,
    lost: st.map((s) => s.f.filter((x) => x.out && !(events.some((e) => e.ref === x.ref && e.kind === 'flee'))).length),
    dead: st.map((s) => s.f.filter((x) => x.dead).map((x) => x.ref)),
    hurt: st.map((s) => s.f.filter((x) => x.wounded && !x.dead).map((x) => x.ref)),
    standing: st.map((s) => s.f.filter((x) => !x.out).map((x) => x.ref)),
    morale: st.map((s) => Math.round(s.morale * 100) / 100),
  };
}
