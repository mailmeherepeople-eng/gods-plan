// C. Clans: names, colours, marks and the plain words for grudges and fights.
// Invented names only (no real place, people or faith); no em or en dashes.

// Clan colours: a colour-blind safe set (after Okabe and Ito, with the green
// left out because it vanishes on the meadow), each with a plain name, so the
// screen never has to rely on colour alone. Every clan also has a mark.
export const PALETTE = [
  { dye: 0x2f6db5, name: 'blue' },
  { dye: 0xe69f00, name: 'orange' },
  { dye: 0xf2ecdc, name: 'white' },
  { dye: 0xd55e00, name: 'rust red' },
  { dye: 0x56b4e9, name: 'sky blue' },
  { dye: 0xcc79a7, name: 'pink' },
  { dye: 0xf0e442, name: 'yellow' },
  { dye: 0x3b3352, name: 'dark plum' },
];
// marks: the screen's own shape ids (ui/dom.js MARKS), each with a word, so colour is never the only sign
export const MARKS = [
  { id: 'zig', name: 'a zigzag' }, { id: 'dots', name: 'dots' }, { id: 'ring', name: 'a ring' }, { id: 'notch', name: 'three notches' },
  { id: 'chev', name: 'a chevron' }, { id: 'wave', name: 'a wave' }, { id: 'lattice', name: 'a lattice' }, { id: 'bar', name: 'two bars' },
];

// village names: two invented syllables and a place ending
const V1 = ['Ka', 'Te', 'Mo', 'Ru', 'Sa', 'Lo', 'Vi', 'Ha', 'Ne', 'Ta', 'Be', 'Da', 'Ko', 'Ri', 'Fe', 'Yo', 'Gu', 'Pa', 'Si', 'Wa'];
const V2 = ['ma', 'ri', 'no', 'ka', 'la', 'ven', 'ti', 'ro', 'da', 'ru', 'el', 'an', 'is', 'ya', 'ne', 'li', 'ko', 'sh', 'th', 'bo'];
const V3 = ['ford', 'mere', 'holt', 'stead', 'dale', 'wick', 'barrow', 'hollow', 'reach', 'fold', 'brook', 'combe', 'ness', 'ley'];
export function villageName(taken, rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  for (let k = 0; k < 40; k++) {
    const n = pick(V1) + pick(V2) + pick(V3);
    if (!taken.has(n)) return n;
  }
  return pick(V1) + pick(V2) + pick(V3) + ' Nether';
}

// how bitter a grudge (0..100) is, in a word
export const GRUDGE_WORDS = [[15, 'at ease'], [30, 'wary'], [45, 'resentful'], [62, 'bitter'], [80, 'hateful'], [101, 'out for blood']];
export const grudgeWord = (g) => GRUDGE_WORDS.find(([at]) => g < at)[1];

// why one group resents another, by the largest cause (the ledger keeps them)
export const CAUSE = {
  wary: (a, b) => `${a} and ${b} are strangers to each other, and newcomers trust nobody`,
  land: (a, b) => `the fields of ${a} and ${b} crowd the same strip of land`,
  water: (a, b) => `${a} and ${b} draw water at the same crowded shore`,
  faith: (a, b) => `${a} and ${b} do not believe alike, and each looks down on the other`,
  seen: (a, b) => `one of ${a} and ${b} has seen the sky act and the other has not`,
  wrong: (a, b, w) => w || `${b} wronged ${a}`,
  kill: (a, b, w) => w || `${b} killed one of ${a}`,
  tyrant: (a, b) => `${b} is ruled by a bully who demands too much`,
  god: (a, b) => `${a} simply woke up angry at ${b}`,
};

export const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const names = (list, max = 2, nm = (p) => p.name) => {
  const n = list.map(nm);
  if (n.length <= max) return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n.join('');
  return `${n.slice(0, max).join(', ')} and ${n.length - max} more`;
};
