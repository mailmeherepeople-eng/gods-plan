// The game's signs, drawn the way the director saw them in the sign picker (game/mock2/tokens: seal.js, shapes.js,
// picker.js), from his chosen drawing of each (signs-data.js, generated). DESIGN.md "Icons, markers, pending strokes,
// battle spells": clay seals with the bubble look; the SHAPE of a seal tells the kind of thing, the sign pressed into
// it tells which. One look for the whole game:
//   signSvg     the bare pressed sign (screen buttons, the person card, small controls inside a button)
//   sealSvg     the sign pressed into a clay seal: a token (shape by group, red wax for serious, a glaze that drains
//               as its time runs), a power (round), a Reshape tool (pillow square), a battle spell (pillow hexagon,
//               glazed in its group's colour, the group's mark on the rim)
//   markerSvg   the thin version on the map: the same shape as a slim clay outline, the sign inside
// Every string is built once and kept (nothing is drawn again each frame); a token's glaze is moved with setGlaze.
import { STYLES, SIGNS, SHAPES, GROUP_SHAPE, SPELL_GROUPS } from './signs-data.js';

export { SIGNS, SPELL_GROUPS, GROUP_SHAPE };
// a fish (2026-11-16, the Water animals): drawn here in the Kolam style of the bird and the rabbit (an outline, a dot for
// the eye), until the sign picker has one to choose from; signs-data.js is generated and would lose it
if (!SIGNS.fish) SIGNS.fish = { name: 'Fish', style: 'kolam', s: 'M7.4 10.7a1.2 1.2 0 1 1 0 2.4a1.2 1.2 0 1 1 0-2.4z', st: 'M2.6 12c3.2-4.6 9.4-5.4 14 0-4.6 5.4-10.8 4.6-14 0zM16.6 12l4.8-4v8zM2.8 21.8h18.4' };
export const hasSign = (id) => !!SIGNS[id];

const r1 = (n) => Math.round(n * 100) / 100;
const C = (cx, cy, r) => `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0-${2 * r}z`;
// inlaid: a pale lip under the ink, then the details cut out in the field colour (pale on wax)
const TONE = {
  dark: { ink: '#2A1A10', lip: 'rgba(255,241,214,.72)', cut: '#E6CDA4' },
  light: { ink: '#F8EAD0', lip: 'rgba(58,12,6,.6)', cut: '#8E2A1A' },
};
const FIELD = '#DCAA7A', FIELD_WAX = '#B03A27', FIELD_RAW = '#E9D3AE';
const GLAZE = { gold: '#DFA03A', lacquer: '#6A1A10', slip: '#EEDDBA' };
const GLAZE_OF = { serious: 'lacquer', warn: 'gold', pray: 'gold', good: 'slip', tip: null, info: null };
const K = 0.72;   // the pressed field is the shape at 72 percent

// which group each alert sign belongs to (the picker's kinds), so a token takes its group's shape
export const GROUP_OF = {
  prayer: 'pray', hunger: 'need', leaving: 'need', sick: 'nature', fire: 'nature', flood: 'nature', drought: 'nature', wolf: 'nature',
  grudge: 'conflict', raid: 'conflict', battle: 'conflict', death: 'lives', lineLost: 'lives', chief: 'lives',
  discovery: 'good', great: 'good', gifted: 'good', blessed: 'good', tip: 'tip',
};

// ---------- a sign, inlaid (picker.js draw) ----------
const drawn = new Map();
export function drawSign(id, tone = 'dark', small = false) {
  const key = `${id}|${tone}|${small}`;
  let out = drawn.get(key);
  if (out != null) return out;
  const d = SIGNS[id];
  if (!d) return '';
  const S = STYLES[d.style], sw = r1(S.sw + (small ? 0.3 : 0)), T = TONE[tone] ?? TONE.dark;
  const body = (c, dx, dy) => `<g transform="translate(${dx} ${dy})">${d.s ? `<path d="${d.s}" fill="${c}" stroke="none"/>` : ''}${d.st ? `<path d="${d.st}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="${S.cap}" stroke-linejoin="${S.join}" stroke-miterlimit="3"/>` : ''}</g>`;
  out = body(T.lip, 0.5, 0.65) + body(T.ink, 0, 0) + (d.k ? `<path d="${d.k}" fill="none" stroke="${T.cut}" stroke-width="${(sw * 0.8).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>` : '');
  drawn.set(key, out);
  return out;
}
// a parchment edge so a bare sign reads over the map
function halo(id, w) {
  const d = SIGNS[id];
  if (!d) return '';
  return `<g stroke="#F3E4C4" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="#F3E4C4">${d.s ? `<path d="${d.s}"/>` : ''}${d.st ? `<path d="${d.st}" fill="none"/>` : ''}</g>`;
}

// ---------- the bare sign ----------
const bareCache = new Map();
// size in px; small signs (20 px and under) take the picker's slightly heavier line; map: with a parchment edge;
// light: pale ink, for a sign on a dark ground (the little cross on the door)
export function signSvg(id, size = 24, cls = '', opt = {}) {
  const key = `${id}|${size}|${cls}|${opt.map ? 1 : 0}|${opt.light ? 1 : 0}`;
  let out = bareCache.get(key);
  if (out != null) return out;
  out = `<svg class="ic sg sg-${id}${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="-1 -1 26 26" aria-hidden="true" focusable="false">${opt.map ? halo(id, 5.2) : ''}${drawSign(id, opt.light ? 'light' : 'dark', size <= 20)}</svg>`;
  bareCache.set(key, out);
  return out;
}

// ---------- the clay seal (shapes.js seal) ----------
const BB = {};
// the outline's top and bottom, measured once in the page (as the picker does)
function bbox(key) {
  if (BB[key]) return BB[key];
  const sh = SHAPES[key] ?? SHAPES.A_circle;
  let b = null;
  try {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    svg.setAttribute('style', 'position:absolute;left:-999px;top:0;width:48px;height:48px');
    p.setAttribute('d', sh.d); svg.appendChild(p); document.body.appendChild(svg);
    const r = p.getBBox(); svg.remove();
    if (r.height > 0) b = [r.y, r.y + r.height];
  } catch { /* no layout yet */ }
  if (!b) return [2, sh.b];
  return (BB[key] = b);
}
function drips(b, w) { // three wax drips hanging under the lowest point
  return [[w * -0.32, 4.2], [w * 0.05, 2.6], [w * 0.3, 3.4]].map(([dx, h]) => { const x = 24 + dx; return `M${r1(x - 2.2)} ${r1(b - 4)}C${r1(x - 2.2)} ${r1(b + h - 1)} ${r1(x - 1.6)} ${r1(b + h + 1.6)} ${r1(x)} ${r1(b + h + 1.6)}S${r1(x + 2.2)} ${r1(b + h - 1)} ${r1(x + 2.2)} ${r1(b - 4)}z`; }).join('');
}
const ft = (sh) => `translate(${sh.c[0]} ${sh.c[1]}) scale(${K}) translate(${-sh.c[0]} ${-sh.c[1]})`;

// the clay, the wax, the grain, the gloss, and one clip per shape: in the page once (light from the upper left)
let defsIn = false;
export function ensureDefs() {
  if (defsIn || typeof document === 'undefined' || !document.body) return;
  defsIn = true;
  const clips = Object.entries(SHAPES).map(([k, sh]) => `<clipPath id="sg-cl-${k}"><path d="${sh.d}" transform="${ft(sh)}"/></clipPath>`).join('');
  const box = document.createElement('div');
  box.innerHTML = `<svg width="0" height="0" style="position:absolute;left:0;top:0;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
    <radialGradient id="sg-clay" cx="34%" cy="26%" r="82%"><stop offset="0" stop-color="#E8B888"/><stop offset=".5" stop-color="#C8895A"/><stop offset="1" stop-color="#8E552E"/></radialGradient>
    <radialGradient id="sg-wax" cx="34%" cy="26%" r="82%"><stop offset="0" stop-color="#DE6248"/><stop offset=".55" stop-color="#B23524"/><stop offset="1" stop-color="#761A10"/></radialGradient>
    <radialGradient id="sg-shade" cx="30%" cy="22%" r="30%"><stop offset="0" stop-color="#FFF4E0" stop-opacity=".42"/><stop offset="1" stop-color="#FFF4E0" stop-opacity="0"/></radialGradient>
    <radialGradient id="sg-raw" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#F0DCB8"/><stop offset="1" stop-color="#D2B288"/></radialGradient>
    <filter id="sg-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.6 1.1" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>
    ${clips}</defs></svg>`;
  document.body.prepend(box.firstChild);
}

const sealCache = new Map();
// o: { sign (picker id) | draw (markup on the 24 grid), shape, wax, raw, glaze (key or colour), frac (0..1), mark
//      (picker id of a battle group's mark), size (px), cls }
export function sealSvg(o) {
  const key = JSON.stringify(o);
  let out = sealCache.get(key);
  if (out != null) return out;
  ensureDefs();
  const shape = SHAPES[o.shape] ? o.shape : 'A_circle', sh = SHAPES[shape], wax = !!o.wax, raw = !!o.raw;
  const [cx, cy] = sh.c;
  const frac = o.frac == null ? 1 : Math.max(0, Math.min(1, o.frac));
  const gz = o.glaze ? (GLAZE[o.glaze] ?? o.glaze) : null;
  const bb = bbox(shape), top = cy + (bb[0] - cy) * K, span = (bb[1] - bb[0]) * K, y = r1(top + span * (1 - frac));
  const sc = (sh.s || 0.88) * (o.signScale || 1);
  const body = wax ? 'url(#sg-wax)' : raw ? 'url(#sg-raw)' : 'url(#sg-clay)';
  const F = ft(sh);
  const size = o.size ? ` width="${o.size}" height="${o.size}"` : '';
  const inner = o.draw != null ? o.draw : drawSign(o.sign, wax ? 'light' : 'dark');
  out = `<svg class="ic sl sg${o.cls ? ` ${o.cls}` : ''}"${size} viewBox="0 0 48 48" style="overflow:visible" aria-hidden="true" focusable="false" data-top="${r1(top)}" data-span="${r1(span)}">`
    + `<g transform="translate(.7 2.3)" fill="rgba(82,44,20,.3)" stroke="none"><path d="${sh.d}"/>${wax ? `<path d="${drips(sh.b, 30)}"/>` : ''}</g>`
    + (wax ? `<path d="${drips(sh.b, 30)}" fill="#8E2213" stroke="none"/>` : '')
    + `<path d="${sh.d}" fill="${body}" stroke="none"/>`
    + `<path d="${sh.d}" fill="#7A4A28" stroke="none" filter="url(#sg-grain)" opacity="${raw ? 0.3 : 0.45}" style="mix-blend-mode:multiply"/>`
    + `<path d="${sh.d}" fill="url(#sg-shade)" stroke="none"/>`
    + `<path d="${sh.d}" transform="${F}" fill="${wax ? FIELD_WAX : raw ? FIELD_RAW : FIELD}" stroke="none"/>`
    + `<g clip-path="url(#sg-cl-${shape})">${gz ? `<rect class="glz" x="0" y="${y}" width="48" height="48" fill="${gz}" stroke="none"/><path class="men" d="M0 ${y}h48" fill="none" stroke="rgba(255,244,214,.75)" stroke-width="1.1"/>` : ''}`
    + `<path d="${sh.d}" transform="${F} translate(-1.1 -1.3)" fill="none" stroke="rgba(58,24,8,${wax ? 0.6 : 0.5})" stroke-width="${r1(3.4 / K)}"/>`
    + `<path d="${sh.d}" transform="${F} translate(1 1.2)" fill="none" stroke="rgba(255,240,214,${wax ? 0.3 : 0.5})" stroke-width="${r1(1.8 / K)}"/></g>`
    + `<path d="${sh.d}" fill="none" stroke="rgba(70,34,14,${wax ? 0.6 : 0.45})" stroke-width="1"/>`
    + (o.mark ? `<g transform="translate(${r1(cx - 4.6)} ${r1(top - 6.2)}) scale(.38)"><path d="${C(12, 12, 10.6)}" fill="#F3E4C4" stroke="rgba(70,34,14,.7)" stroke-width="1.8"/>${drawSign(o.mark, 'dark', true)}</g>` : '')
    + `<g transform="translate(${r1(cx - 12 * sc)} ${r1(cy - 12 * sc)}) scale(${sc})">${inner}</g></svg>`;
  sealCache.set(key, out);
  return out;
}
// move a seal's glaze to a share of time left (only touches the DOM when it changes by a percent or more)
export function setGlaze(el, frac) {
  const svg = el?.matches?.('svg.sl') ? el : el?.querySelector?.('svg.sl');
  if (!svg) return;
  const r = svg.querySelector('.glz');
  if (!r) return;
  const f = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  if (svg._gf === f) return;
  svg._gf = f;
  const y = r1(+svg.dataset.top + +svg.dataset.span * (1 - f / 100));
  r.setAttribute('y', y);
  svg.querySelector('.men')?.setAttribute('d', `M0 ${y}h48`);
}

// ---------- the containers (TOKENS.md, "The rule": powers round, Reshape tools a pillow square, spells a hexagon) ----------
export const powerSeal = (id, size, cls) => sealSvg({ sign: id, shape: 'A_circle', size, cls });
export const toolSeal = (id, size, cls) => sealSvg({ sign: id, shape: 'A_square', size, cls });
const groupOfSpell = (id) => SPELL_GROUPS.find((g) => g.list.includes(id));
export function spellSeal(id, size, groupKey, cls) {
  const g = (groupKey && SPELL_GROUPS.find((x) => x.key === groupKey)) || groupOfSpell(id);
  const empty = id === 'empty';
  return sealSvg({ sign: id, shape: 'X_hex', glaze: g && !empty ? g.glaze : null, frac: 0.46, mark: g ? g.mark : null, raw: empty, size, cls });
}
// a battle group's own mark, in its hexagon, glazed full in the group's colour (as the picker's row of marks)
export function groupSeal(key, size, cls) {
  const g = SPELL_GROUPS.find((x) => x.key === key);
  return sealSvg({ sign: g?.mark ?? 'gPerson', shape: 'X_hex', glaze: g?.glaze ?? null, frac: 1, size, cls });
}
// an alert token: group shape (from its sign, or as asked), red wax when serious, glaze by level; draw: markup for a
// thing that has no chosen sign (its old drawing pressed in)
export function tokenSeal({ sign, group, level, size, cls, draw }) {
  const grp = group ?? GROUP_OF[sign] ?? 'good';
  const lvl = level ?? 'warn';
  return sealSvg({ sign: draw != null ? undefined : sign, draw, shape: GROUP_SHAPE[grp] ?? 'A_circle', wax: lvl === 'serious', glaze: GLAZE_OF[lvl] ?? null, raw: grp === 'tip', frac: 1, size, cls });
}

// ---------- the thin version on the map (shapes.js outlineMarker) ----------
const mkCache = new Map();
export function markerSvg({ sign, group, serious, draw }) {
  const key = `${sign}|${group}|${serious ? 1 : 0}|${draw ? draw.length : ''}`;
  let out = mkCache.get(key);
  if (out != null) return out;
  const sh = SHAPES[GROUP_SHAPE[group ?? GROUP_OF[sign] ?? 'good']] ?? SHAPES.A_circle;
  const col = serious ? '#A8301F' : '#9C6338', hi = serious ? 'rgba(255,196,176,.7)' : 'rgba(255,236,204,.85)';
  const [cx, cy] = sh.c, sc = (sh.s || 0.88) * 0.98, w = serious ? 5 : 4;
  out = `<svg class="ic rg sg" viewBox="-2 -2 52 52" style="overflow:visible" aria-hidden="true" focusable="false">`
    + `<path d="${sh.d}" transform="translate(.9 1.8)" fill="none" stroke="rgba(40,22,10,.4)" stroke-width="${w}"/>`
    + (serious ? `<path d="${drips(sh.b, 26)}" fill="${col}" stroke="none" transform="translate(0 -1)"/>` : '')
    + `<path d="${sh.d}" fill="rgba(243,228,196,.22)" stroke="${col}" stroke-width="${w}" stroke-linejoin="round"/>`
    + `<path d="${sh.d}" fill="none" stroke="${hi}" stroke-width="1.1" transform="translate(-.6 -.7)" stroke-dasharray="20 300" stroke-linecap="round"/>`
    + `<g transform="translate(${r1(cx - 12 * sc)} ${r1(cy - 12 * sc)}) scale(${sc})">${draw != null ? draw : halo(sign, 5.4) + drawSign(sign, 'dark', true)}</g></svg>`;
  mkCache.set(key, out);
  return out;
}

// an old drawing (24 px grid, the HUD's own stroke icons) pressed in like a sign, for things that have no chosen sign
export function oldAsSign(paths) {
  const g = (c, dx, dy) => `<g transform="translate(${dx} ${dy})" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
  return g(TONE.dark.lip, 0.5, 0.65) + g(TONE.dark.ink, 0, 0);
}
