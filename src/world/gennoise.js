// Seeded randomness for the landscape generator (generate.js): a small PRNG,
// a per-cell hash and 2D gradient noise with octaves. Everything here is a
// pure function of the seed, so ?seed=<n> rebuilds the same land.

// mulberry32: a fast 32-bit PRNG, 0 <= r() < 1
export function makeRng(seed) {
  // scramble the seed first, so neighbouring seeds (1, 2, 3) start far apart
  let a = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b);
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35);
  a ^= a >>> 16;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a word or any text as a seed (so ?seed=meadow works too)
export function textSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// 0..1 per (x, z, k), mixed with the seed
export function makeHash(seed) {
  const s = Math.imul(seed | 0, 1442695041);
  return (x, z, k = 0) => {
    let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(k, 2246822519) + s) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// 2D gradient noise, about -1..1, smooth, seeded. fbm(x, z, octaves) sums
// octaves at doubling frequency and halving weight, normalised to the same range.
export function makeNoise(seed) {
  const GX = new Float32Array(256), GZ = new Float32Array(256);
  for (let k = 0; k < 256; k++) { GX[k] = Math.cos((k / 256) * Math.PI * 2); GZ[k] = Math.sin((k / 256) * Math.PI * 2); }
  const s = Math.imul(seed | 0, 1442695041) | 0;
  const g = (ix, iz) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + s) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) & 255;
  };
  function perlin(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
    let k = g(xi, zi); const a = GX[k] * xf + GZ[k] * zf;
    k = g(xi + 1, zi); const b = GX[k] * (xf - 1) + GZ[k] * zf;
    k = g(xi, zi + 1); const c = GX[k] * xf + GZ[k] * (zf - 1);
    k = g(xi + 1, zi + 1); const d = GX[k] * (xf - 1) + GZ[k] * (zf - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.41;
  }
  function fbm(x, z, oct = 3) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * perlin(x * f + o * 17.31, z * f - o * 9.13);
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return sum / norm;
  }
  return { perlin, fbm };
}
