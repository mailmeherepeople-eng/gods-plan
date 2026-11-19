// Names and plain words. Invented given names from syllables; family names
// are everyday nature words, so a player can tell the Reed family from the
// Flint family at a glance. No em or en dashes anywhere (contract).
const FAMILY = ['Reed', 'Flint', 'Heron', 'Ash', 'Fern', 'Otter', 'Thorn', 'Wren', 'Birch', 'Clay', 'Hare', 'Moss',
  'Sloe', 'Brook', 'Lark', 'Rowan', 'Sedge', 'Willow', 'Marten', 'Elder', 'Pike', 'Hazel', 'Crane', 'Bramble',
  'Teal', 'Vole', 'Linden', 'Quill', 'Rush', 'Stoat', 'Yarrow', 'Kestrel'];
const A = ['A', 'Ka', 'Te', 'Mi', 'Ro', 'Su', 'Na', 'Lo', 'Vi', 'Ha', 'E', 'O', 'U', 'Ta', 'Be', 'Ji', 'Da', 'Ny', 'Sa', 'Ko', 'Ri', 'Ilo', 'Mar', 'Tor', 'Fen', 'Ysa'];
const Bs = ['ma', 'ri', 'no', 'ka', 'la', 'sh', 'ven', 'ti', 'ro', 'mi', 'da', 'ru', 'el', 'an', 'is', 'o', 'ya', 'ne', 'li', 'ko', 'th', 'ra'];
const Cs = ['', '', '', 'a', 'n', 'i', 'k', 'l', 'o', 'r', 'e'];

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const rnd = Math.random;
export const range = (r, f = Math.random) => r[0] + f() * (r[1] - r[0]);
export const pick = (a, f = Math.random) => a[Math.floor(f() * a.length)];

let famI = Math.floor(Math.random() * FAMILY.length);
export function familyName(taken) {
  for (let k = 0; k < FAMILY.length; k++) {
    const n = FAMILY[(famI++) % FAMILY.length];
    if (!taken.has(n)) return n;
  }
  return FAMILY[(famI++) % FAMILY.length];
}
export function givenName() {
  const n = pick(A) + pick(Bs) + pick(Cs);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// -5000 -> "5000 BC" (the calendar has no year 0)
export function yearLabel(y) {
  const f = Math.floor(y);
  return f < 0 ? `${-f} BC` : `AD ${f + 1}`;
}
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function sideName(x, z, cx, cz) {
  const dx = x - cx, dz = z - cz;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'east' : 'west';
  return dz > 0 ? 'south' : 'north';
}
export const number = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
