// B. Minds: small shared helpers for science.js, commandments.js and
// thoughts-given.js (agent B's files). No state lives here.

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const clamp100 = (v) => Math.max(0, Math.min(100, v));
// 0 below a, 1 above b, a smooth step between
export const smooth = (v, a, b) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
export const she = (p) => (p?.sex === 'f' ? 'she' : 'he');
export const her = (p) => (p?.sex === 'f' ? 'her' : 'his');
export const herO = (p) => (p?.sex === 'f' ? 'her' : 'him');
export const herself = (p) => (p?.sex === 'f' ? 'herself' : 'himself');
export const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const alive = (p) => p && !p.dead;
export const settled = (p) => p && !p.dead && p.family?.state === 'settled';
export const isAdult = (p) => p && (p.stage === 'adult' || p.stage === 'elder');
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const mid = (b) => ({ x: b.mx ?? b.cx ?? b.x, z: b.mz ?? b.cz ?? b.z });

// a chance in plain words: 0.34 -> "about 1 in 3"
export function chanceText(p) {
  if (p >= 0.995) return 'certain';
  if (p <= 0.005) return 'no chance';
  if (p >= 0.9) return `about ${Math.round(p * 10)} in 10`;
  if (p > 0.55) return `about ${Math.round(p * 10)} in 10`;
  if (p >= 0.45) return 'about even';
  const n = Math.round(1 / p);
  return `about 1 in ${n}`;
}
export const pct = (v) => `${Math.round(v * 100)} percent`;
export const signed = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

// A modifier whose strength grows with a weight 0..1 of each subject (obedience, training):
// the seam's modifiers are fixed numbers, so the full effect is split into TIERS steps, each
// switched on for subjects whose weight passes its threshold. At weight 1 the product is the
// full `mul` (or the sum the full `add`); at 0.5 about half of it (geometric for mul).
const TIERS = 4;
export function graded(R, stat, key, spec, weight) {
  for (let i = 0; i < TIERS; i++) {
    const at = (i + 0.5) / TIERS;
    R.mod(stat, `${key}:${i}`, {
      mul: spec.mul != null ? Math.pow(spec.mul, 1 / TIERS) : 1,
      add: spec.add != null ? spec.add / TIERS : 0,
      who: (s) => (weight(s) ?? 0) >= at,
      note: spec.note ?? '',
    });
  }
}
export function ungraded(R, stat, key) { for (let i = 0; i < TIERS; i++) R.unmod(stat, `${key}:${i}`); }
// what a graded modifier gives at weight w (for forecasts: the same tiers)
export function gradedAt(spec, w) {
  let n = 0;
  for (let i = 0; i < TIERS; i++) if (w >= (i + 0.5) / TIERS) n++;
  return spec.mul != null ? Math.pow(spec.mul, n / TIERS) : (spec.add ?? 0) * n / TIERS;
}

// a person's household as a list of names: "Ana, Bo and 3 more"
export function names(list, max = 2) {
  const n = list.map((p) => p.name);
  if (n.length <= max) return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n.join('');
  return `${n.slice(0, max).join(', ')} and ${n.length - max} more`;
}
