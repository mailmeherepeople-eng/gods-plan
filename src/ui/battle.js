// Battles (stage 3): the battle's own screen (the director, 2026-11-15: "there needs to be a separate UI for
// battles"). While a battle is on (from the march out to the walk home) the whole home interface is hidden by one
// attribute, `data-battle="1"` on the HUD root `#ui` (and on <html>), and this screen shows only:
//   top      one slim strip at the top edge: their god and its next move, the wave and the time left, yours
//            against theirs, the hearth fires, pause and a small menu (pause, sound, help)
//   bottom   the bar, and four buttons, the groups of the tree (Person, Area, Land, Create) with their first
//            stroke; one opens its spells above it (icon, name, cost, the other two strokes); the director, 2026-11-15
//   map      family names over their banners, champions named over their heads, their god's rings, words where
//            things happen, the spell in hand following the finger or pointer, a small name tag on a tapped fighter
//   cards    the calm's preview (small, at the right, closes itself when the fight starts), the result, the end
// Casting: draw three strokes anywhere on the battleground (or tap a spell in the row): the spell is then in hand,
// its ring (or line, or marker) follows the finger; a tap places it, and only then is the bar charged.
// Every cast goes through sim.ask('castBattle', spellId, shape); the gesture is only the way to pick the spell.
import { h } from './dom.js';
import { spellSeal, groupSeal, signSvg, SIGNS } from './signs.js';
import { TILT_TOUCH, tiltStarts, tiltView } from './touch.js';

const ICON = {
  fire: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.5-3.6 2.5-5.2.3 1.6 1 2.4 2 2.7C11 8.2 11 5.6 12 3z',
  rain: 'M7 13.5a3.8 3.8 0 0 1 .4-7.6 5 5 0 0 1 9.6 1.4 3.2 3.2 0 0 1 0 6.2zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  ridge: 'M2 18c3-7 6-9 10-9s7 2 10 9z',
  trench: 'M2 8h6l2 9h4l2-9h6v3h-4l-2 9H8L6 11H2z',
  pond: 'M12 6c5 0 9 2.7 9 6s-4 6-9 6-9-2.7-9-6 4-6 9-6zM8 12c1.3-1 2.7-1 4 0s2.7 1 4 0',
  wolves: 'M5 4l3.5 5h7L19 4v8l-2.5 5L12 20l-4.5-3L5 12zM9.5 12h.01M14.5 12h.01',
  smite: 'M13 2L5 14h6l-1 8 8-12h-6z',
  heal: 'M5 19C5 10 11 5 20 4c0 9-6 15-15 15zM5 19l8-8',
  bless: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z',
  revive: 'M12 2l2 5h5l-4 3.5 1.5 5.5L12 13l-4.5 3 1.5-5.5L5 7h5zM6 20h12',
  skyfall: 'M3 18c2-3 4-4 6-3s3 3 5 2 3-4 7-4v8H3z',
  eye: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  horn: 'M3 10l11-6v16L3 14zM14 8c3 0 6 1.5 7 4-1 2.5-4 4-7 4',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z', play: 'M7 4l13 8-13 8z', menu: 'M4 6h16v2H4zM4 11h16v2H4zM4 16h16v2H4z',
  spear: 'M4 20L17 7M14 4l6 0 0 6z',
  gorilla: 'M7 5a5 5 0 0 1 10 0v2a4 4 0 0 1 2 3.5V16a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5v-5.5A4 4 0 0 1 7 7zM9.5 9h.01M14.5 9h.01M9 14h6',
  x: 'M6 6l12 12M18 6L6 18',
  gperson: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z',
  garea: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  gland: 'M2 19l6-8 3 4 4-7 7 11z',
  gcreate: 'M8 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM16 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM5 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM19 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM12 10c3 0 6 4 6 7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3c0-3 3-7 6-7z',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
// the director's chosen signs (signs.js): each spell in its pillow hexagon, glazed in its group's colour with the group's
// mark on the rim; the four groups by their own marks; the screen's small controls as the bare sign
const SPELL_SIGN = { 'heal-small': 'heal1', revive: 'revive', burn: 'burn', kill: 'kill', 'heal-area': 'healArea', 'boost-area': 'boost', 'fire-area': 'fireArea',
  lava: 'lava', pond: 'pond', rain: 'rain', lower: 'lower', raise: 'raise', wolves: 'wolf', gorilla: 'gorilla' };
const GKEY = { U: 'person', D: 'area', R: 'land', L: 'create' };
const SIGNC = { pause: 'pause', play: 'play', menu: 'menu', x: 'close', spear: 'battle' };
const sig = (k, size = 20) => (SIGNC[k] ? signSvg(SIGNC[k], size) : svg(k));
// the hearth fire's sign as a mask, so a fire still lights and goes out by its colour
const HEARTH = (() => { const d = SIGNS.hearth; if (!d) return ''; const S = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${d.s ? `<path d="${d.s}"/>` : ''}${d.st ? `<path d="${d.st}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>` : ''}</svg>`); return `url("data:image/svg+xml,${S}")`; })();
// the tree, in its order: [path, spell] (first stroke: up a person, down an area, right the land, left create)
const TREE = [['ULU', 'heal-small'], ['ULD', 'revive'], ['URU', 'burn'], ['URD', 'kill'], ['DLU', 'heal-area'], ['DLD', 'boost-area'], ['DRU', 'fire-area'], ['DRD', 'lava'],
  ['RUL', 'pond'], ['RUR', 'rain'], ['RDL', 'lower'], ['RDR', 'raise'], ['LUL', 'gorilla'], ['LUR', 'wolves']];
const BYPATH = Object.fromEntries(TREE);
const STROKES = Object.fromEntries(TREE.map(([k, v]) => [v, k]));
const spell = (p, size) => (SPELL_SIGN[p] ? spellSeal(SPELL_SIGN[p], size, GKEY[STROKES[p]?.[0]]) : svg(SICON[p] ?? 'eye'));
const POWERS = TREE.map(([, v]) => v);
const LINES = ['lower', 'raise'];
const PERSON = { 'heal-small': 0, revive: 0, burn: 1, kill: 1 }; // spells aimed at one fighter, and whose
const NAME = { 'heal-small': 'Small heal', revive: 'Bring back', burn: 'Burn', kill: 'Kill', 'heal-area': 'Heal ground', 'boost-area': 'Boost', 'fire-area': 'Fire', lava: 'Lava', pond: 'Pond', rain: 'Rain', lower: 'Lower land', raise: 'Raise land', wolves: 'Wolves', gorilla: 'Gorilla' };
const SICON = { 'heal-small': 'heal', revive: 'revive', burn: 'fire', kill: 'smite', 'heal-area': 'heal', 'boost-area': 'bless', 'fire-area': 'fire', lava: 'skyfall', pond: 'pond', rain: 'rain', lower: 'trench', raise: 'ridge', wolves: 'wolves', gorilla: 'gorilla' };
const COL = { 'heal-small': '#8FC25A', revive: '#F2E6A0', burn: '#E8742A', kill: '#8A5BD0', 'heal-area': '#6E9A3A', 'boost-area': '#E5AE3C', 'fire-area': '#E0552B', lava: '#C2342A', pond: '#4F8FB8', rain: '#3E8EC9', lower: '#6B4A2E', raise: '#9A6440', wolves: '#5E8F3A', gorilla: '#4A3B30' };
const HELPS = { 'fire-area': 'rain', lava: 'rain', wolves: 'fire-area', burn: 'heal-small', kill: 'revive', gorilla: 'kill', lower: 'raise', pond: 'raise', raise: 'lower' };
const VERB = { 'heal-small': 'a small heal', revive: 'Bring back', burn: 'Burn', kill: 'Kill', 'heal-area': 'Heal ground', 'boost-area': 'Boost', 'fire-area': 'Fire', lava: 'Lava', pond: 'a pond', rain: 'Rain', lower: 'lowered land', raise: 'raised land', wolves: 'Wolves', gorilla: 'a beast' };
const ARROW = { U: '↑', D: '↓', L: '←', R: '→' };
const GNAME = { U: 'A person', D: 'An area', R: 'The land', L: 'Create' };
// the four groups take the colours of their seals (the picker's glazes), so a button's border, its arrow and its seal agree
const GCOL = { U: '#4C8A84', D: '#C2622E', R: '#71883E', L: '#5A6A8E' };
const BRANCH = { UL: 'kind', UR: 'harsh', DL: 'kind', DR: 'harsh', RU: 'water', RD: 'earth', LU: 'animals', LD: 'empty' };
// stroke reading (docs/CASTING.md, measured): a stroke counts from 16 px along its way, at most 30 degrees off it;
// an unfinished path resets 1.2 s after the finger lifts; a cancelled touch is ignored, never read as an end
const MIN = 16, OFF = Math.tan(30 * Math.PI / 180), RESET_MS = 1200, TAP_PX = 12;
// the big title: its middle at this share of the screen's height (as it always was) unless that would put it over
// the strip or the bottom, and kept this far from any card
const BANNER_AT = 0.32, BANNER_GAP = 8;
const QUICK = new URLSearchParams(location.search).get('battle') === '1'; // ?battle=1: straight into a battle
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const words = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default [{
  type: 'panel', id: 'battle', region: 'root', order: 90,
  make(U) { const B = makeBattle(U); const stub = h('span', 'bt-stub'); stub.hidden = true; stub._b = B; return stub; },
  update(U, dt, el) { el._b.slow(dt); },
  frame(U, dt, el) { el._b.frame(dt); },
}];

function makeBattle(U) {
  const { ctx } = U;
  ctx.addStyle(new URL('./battle.css', import.meta.url));
  const ask = (name, ...a) => U.call('sim', 'ask', name, ...a);
  const root = h('div', 'bt-root');
  document.body.appendChild(root);
  const labels = h('div', 'bt-labels'); root.appendChild(labels);
  const gcv = document.createElement('canvas'); gcv.className = 'bt-gcv'; root.appendChild(gcv);
  const gctx = gcv.getContext('2d');

  // ---------- the strip at the top ----------
  const top = h('div', 'bt-card bt-strip bt-hide', `
    <span class="bt-s-god"><span class="bt-eye">${svg('eye')}</span><span class="bt-s-gt"><span class="bt-s-gn"></span><span class="bt-s-gm"></span></span><span class="bt-s-gbar"><i></i></span></span>
    <span class="bt-s-time"><span class="bt-s-ta"></span></span>
    <button type="button" class="bt-btn bt-go bt-call">${svg('horn')}<span>Call them</span></button>
    <span class="bt-s-score"><b class="bt-mine"></b><span class="bt-vs"><i></i></span><b class="bt-theirs"></b></span>
    <span class="bt-fires"></span>
    <span class="bt-s-hearth bt-hide">Hearth!<span class="bt-h-bar"><i></i></span></span>
    <button type="button" class="bt-btn bt-ico bt-pause" aria-label="Pause">${sig('pause')}</button>
    <button type="button" class="bt-btn bt-ico bt-menub" aria-label="Menu">${sig('menu')}</button>`);
  root.appendChild(top);
  const Q = (sel) => top.querySelector(sel);
  Q('.bt-call').addEventListener('click', () => ask('battleCall'));
  Q('.bt-pause').addEventListener('click', () => ctx.clock.setPaused(!ctx.clock.paused));
  const menu = h('div', 'bt-card bt-menu bt-hide', `<button type="button" class="bt-btn bt-m-pause"></button><button type="button" class="bt-btn bt-m-sound"></button><button type="button" class="bt-btn bt-m-help">How to cast</button>`);
  root.appendChild(menu);
  Q('.bt-menub').addEventListener('click', () => { menu.classList.toggle('bt-hide'); drawMenu(); });
  menu.querySelector('.bt-m-pause').addEventListener('click', () => { ctx.clock.setPaused(!ctx.clock.paused); drawMenu(); });
  menu.querySelector('.bt-m-sound').addEventListener('click', () => { U.settings.sound = U.settings.sound === false; try { U.saveSettings?.(); } catch { /* fine */ } drawMenu(); });
  menu.querySelector('.bt-m-help').addEventListener('click', () => { menu.classList.add('bt-hide'); showHelp(); });
  function drawMenu() {
    menu.querySelector('.bt-m-pause').textContent = ctx.clock.paused ? 'Resume' : 'Pause';
    menu.querySelector('.bt-m-sound').textContent = U.settings.sound === false ? 'Sound: off' : 'Sound: on';
  }
  const help = h('div', 'bt-scrim bt-hide');
  root.appendChild(help);
  function showHelp() {
    const rows = TREE.map(([k, v]) => `<span class="bt-hrow"><span class="bt-hp" style="--pc:${COL[v]}">${spell(v, 26)}</span>${NAME[v]}<b>${k.split('').map((c) => ARROW[c]).join(' ')}</b></span>`).join('');
    help.innerHTML = `<div class="bt-card bt-help"><h2>Cast with three strokes</h2><p>Draw three strokes anywhere on the battleground, each up, down, left or right, in one line with corners or as three flicks. The first picks the kind of spell (up a person, down an area, right the land, left create). Then the spell is in your hand: tap where it should land. Or tap one of the four buttons at the bottom, pick a spell from it, then tap the ground. Tap the spell's button again, or the cross, to put it down. Two fingers move, zoom and turn the view; drag them up or down together to tilt it.</p><div class="bt-hgrid">${rows}</div><div class="bt-foot"><button type="button" class="bt-btn bt-go">Back to the battle</button></div></div>`;
    help.classList.remove('bt-hide');
    help.querySelector('button').addEventListener('click', () => help.classList.add('bt-hide'));
  }
  // the calm's preview, and the march
  const prev = h('div', 'bt-card bt-prev bt-hide'); root.appendChild(prev);
  const march = h('div', 'bt-card bt-march bt-hide', `<span class="bt-m-t">Your people gather at the stone and march out.</span><button type="button" class="bt-btn bt-go">Go now</button>`);
  root.appendChild(march);
  march.querySelector('button').addEventListener('click', () => ask('battleSkipMarch'));

  // ---------- the bottom: the spell in hand, the bar, the row of spells ----------
  const bottom = h('div', 'bt-bottom bt-hide'); root.appendChild(bottom);
  const handEl = h('div', 'bt-card bt-hand bt-hide', `<span class="bt-h-t"></span><button type="button" class="bt-btn bt-ico bt-h-x" aria-label="Drop the spell">${sig('x')}</button>`);
  const barw = h('div', 'bt-barw', `<span class="bt-barmk">${signSvg('battlebar', 22, '', { map: true })}</span><span class="bt-bar"><u></u><i></i></span><span class="bt-barn"></span>`);
  if (HEARTH) root.style.setProperty('--hearth', HEARTH);
  const row = h('div', 'bt-row');
  const pop = h('div', 'bt-card bt-pop bt-hide');
  bottom.append(handEl, pop, barw, row);
  handEl.querySelector('.bt-h-x').addEventListener('click', () => setHeld(null));
  const btn = {}, gbtn = {};
  const GROUPS = [['U', 'Person', 'person'], ['D', 'Area', 'area'], ['R', 'Land', 'land'], ['L', 'Create', 'create']];
  let openG = null;
  for (const [g, name, ic] of GROUPS) {
    const b = h('button', 'bt-grp', `${groupSeal(ic, 34)}<span class="bt-g-n">${name}</span><span class="bt-g-a">${ARROW[g]}</span><span class="bt-g-x" aria-label="Put the spell down">${sig('x', 16)}</span>`);
    b.type = 'button'; b.dataset.g = g; b.style.setProperty('--gc', GCOL[g]); b.title = `${name} (${ARROW[g]})`;
    b.addEventListener('click', (ev) => { if (held && ev.target.closest('.bt-g-x')) { setHeld(null); openGroup(null); return; } openGroup(openG === g ? null : g); }); // the cross on a lit button puts the spell down
    row.appendChild(b); gbtn[g] = b;
  }
  for (const [path, p] of TREE) {
    const b = h('button', 'bt-sp', `<span class="bt-sp-fill"></span>${spell(p, 30)}<span class="bt-sp-n">${NAME[p]}</span><span class="bt-sp-c"></span><span class="bt-sp-a">${path.slice(1).split('').map((c) => ARROW[c]).join('')}</span><span class="bt-sp-u bt-hide">used</span>`);
    b.type = 'button'; b.dataset.p = p; b.title = `${NAME[p]}: ${path.split('').map((c) => ARROW[c]).join(' ')}`;
    b.style.setProperty('--gc', GCOL[path[0]]); b.style.setProperty('--pc', COL[p]);
    b.addEventListener('click', () => { setHeld(held === p ? null : p); openGroup(null); });
    btn[p] = b;
  }
  function openGroup(g) {
    openG = g;
    for (const k in gbtn) gbtn[k].classList.toggle('bt-open', k === g);
    pop.replaceChildren(...(g ? TREE.filter(([path]) => path[0] === g).map(([, p]) => btn[p]) : []));
    pop.classList.toggle('bt-hide', !g);
    if (g) pop.style.setProperty('--gc', GCOL[g]);
  }

  // ---------- state ----------
  let F = null, stage = null, held = null, aim = null, lastN = null, hover = null;
  const fx = [], bandEls = [], champEls = new Map(), tellEls = new Map();
  const aimEl = h('div', 'bt-lab bt-aimt bt-hide'); labels.appendChild(aimEl);
  const tagEl = h('div', 'bt-lab bt-tag bt-hide'); labels.appendChild(tagEl);
  let tag = null; // { u, t }
  const G = () => ask('battleGround');
  const gy = (x, z) => G()?.standY(x, z) ?? 16;
  function ground(px, py) {
    const g = G(), C = ctx.camera;
    if (!g) return null;
    let hgt = 16, p = null;
    for (let k = 0; k < 3; k++) { p = C.onPlane(px, py, hgt); if (!p) return null; hgt = g.standY(p.x, p.z); }
    return g.inside(p.x, p.z) ? { x: p.x, z: p.z } : null;
  }

  // ---------- the spell in hand ----------
  function setHeld(p) {
    held = p;
    for (const k of POWERS) btn[k].classList.toggle('bt-held', k === p);
    for (const [g, name] of GROUPS) { const on = !!p && STROKES[p][0] === g; gbtn[g].classList.toggle('bt-held', on); gbtn[g].querySelector('.bt-g-n').textContent = on ? NAME[p] : name; }
    aim = null; ask('battleSetAim', null);
    // a tapped group or spell button must not keep its focus ring once the spell is placed or put down
    { const a = document.activeElement; if (a?.classList?.contains('bt-grp') || a?.classList?.contains('bt-sp')) a.blur(); }
    if (!p) { handEl.classList.add('bt-hide'); return; }
    handEl.classList.remove('bt-hide');
    handEl.style.borderColor = GCOL[STROKES[p][0]];
    drawHand();
    U.sfx?.('ui.toggle');
  }
  function drawHand(why) {
    if (!held || !F) return;
    const cost = F.costOf(held), r = F.refusal(held, cost);
    const what = held in PERSON ? (PERSON[held] ? 'tap one of theirs' : held === 'revive' ? 'tap one of yours who fell' : 'tap one of yours') : LINES.includes(held) ? 'tap where the line should run' : 'tap the ground';
    setT(handEl.querySelector('.bt-h-t'), `${NAME[held]} (${cost}): ${why ?? (r && !/again in|Not enough/.test(r) ? r : r ?? what)}`);
    handEl.classList.toggle('bt-no', !!(why || r));
  }
  // where a spell lands: a person spell takes the nearest fighter of the right side within reach of the point
  const REACH = 4.5;
  function personAt(p, x, z) {
    if (!F) return null;
    if (p === 'revive') { let b = null, bd = REACH; for (const u of F.units) { if (u.side !== 0 || !u.p || (u.state !== 'dead' && u.state !== 'wounded')) continue; const d = Math.hypot(u.e.x - x, u.e.z - z); if (d < bd) { bd = d; b = u; } } return b; }
    if (PERSON[p]) return F.nearestUnit(1, x, z, REACH) ?? F.nearestUnit(2, x, z, REACH);
    return F.nearestUnit(0, x, z, REACH);
  }
  function shapeAt(p, x, z) {
    if (p in PERSON) { const u = personAt(p, x, z); return u ? { x: u.e.x, z: u.e.z, unit: u } : null; }
    return { x, z };
  }
  function aimAt(x, z) {
    if (!held || !F) return;
    const s = shapeAt(held, x, z);
    if (!s) { aim = { x, z, ok: false, why: held === 'revive' ? 'None of yours has fallen here.' : PERSON[held] ? 'None of theirs here.' : 'None of yours here.' }; ask('battleSetAim', { x, z, r: 1, ok: false }); return; }
    const a = ask('battleAim', held, { x: s.x, z: s.z });
    if (!a) return;
    aim = { ...a, unit: s.unit };
    ask('battleSetAim', { x: a.x, z: a.z, r: s.unit ? 0.9 : a.r, ok: a.ok, cells: a.cells });
  }
  function place(x, z) {
    if (!held || !F) return false;
    const s = shapeAt(held, x, z);
    if (!s) { drawHand(held === 'revive' ? 'none of yours has fallen there' : PERSON[held] ? 'none of theirs there' : 'none of yours there'); nope(); return false; }
    const r = ask('castBattle', held, { x: s.x, z: s.z });
    if (!r?.ok) { drawHand(r?.text ?? 'nothing happened'); nope(); return false; }
    U.sfx?.('power.cast');
    ctx.clock.hitStop?.(70);
    navigator.vibrate?.(12);
    word(s.x, s.z, NAME[held], 'soft', 1.1);
    setHeld(null);
    return true;
  }
  function nope() { handEl.classList.remove('bt-nope'); void handEl.offsetWidth; handEl.classList.add('bt-nope'); }

  // ---------- strokes: they pick a spell, from anywhere on the battleground ----------
  const glab = h('div', 'bt-glab bt-hide'); root.appendChild(glab);
  const gguide = h('div', 'bt-gguide bt-hide'); root.appendChild(gguide);
  const GS = { path: '', pts: [], seg: null, down: false, resetT: 0, guideT: 0, moved: 0, t0: 0, start: null };
  function gsize() { const d = Math.min(2, devicePixelRatio || 1); gcv.width = innerWidth * d; gcv.height = innerHeight * d; gcv.style.width = `${innerWidth}px`; gcv.style.height = `${innerHeight}px`; gctx.setTransform(d, 0, 0, d, 0, 0); gdraw(); }
  function gdraw() {
    gctx.clearRect(0, 0, innerWidth, innerHeight);
    if (GS.pts.length < 2) return;
    const trace = () => { gctx.beginPath(); GS.pts.forEach((q, i) => { if (!q) return; if (i === 0 || !GS.pts[i - 1]) gctx.moveTo(q.x, q.y); else gctx.lineTo(q.x, q.y); }); gctx.stroke(); };
    gctx.lineCap = gctx.lineJoin = 'round';
    gctx.lineWidth = 8; gctx.strokeStyle = 'rgba(255,248,230,0.85)'; trace();
    gctx.lineWidth = 4.5; gctx.strokeStyle = GS.path ? GCOL[GS.path[0]] : '#5A3824'; trace();
  }
  function glabel() {
    const p = GS.path, last = GS.pts[GS.pts.length - 1] ?? GS.start;
    if (!p || !last) { glab.classList.add('bt-hide'); return; }
    let text = GNAME[p[0]], cls = '';
    if (p.length >= 2) text += ` › ${BRANCH[p.slice(0, 2)] ?? '?'}`;
    if (p.length === 3) { const sp = BYPATH[p]; if (!sp) { text = 'No such spell'; cls = 'bt-no'; } else text = `${NAME[sp]} (${F?.costOf(sp) ?? ''})`; }
    glab.textContent = text; glab.className = `bt-glab ${cls}`; glab.style.borderColor = GCOL[p[0]];
    const x = Math.max(8, Math.min(innerWidth - 170, last.x - 60)), y = Math.max(8, last.y - 74);
    glab.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function gguideShow() {
    const c = GS.pts[GS.pts.length - 1] ?? GS.start; if (!c) return;
    const p = GS.path;
    let opts;
    if (!p) opts = { U: 'A person', D: 'An area', R: 'The land', L: 'Create' };
    else if (p.length === 1) opts = p[0] === 'U' || p[0] === 'D' ? { L: 'kind', R: 'harsh' } : p[0] === 'R' ? { U: 'water', D: 'earth' } : { U: 'animals' };
    else if (p.length === 2) { opts = {}; for (const d of 'UDLR') { const sp = BYPATH[p + d]; if (sp) opts[d] = NAME[sp]; } }
    else { gguide.classList.add('bt-hide'); return; }
    gguide.innerHTML = Object.entries(opts).map(([d, t]) => `<span class="bt-gg bt-gg-${d}">${ARROW[d]} ${t}</span>`).join('');
    gguide.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
    gguide.classList.remove('bt-hide');
  }
  function greset() { GS.path = ''; GS.pts = []; GS.seg = null; GS.start = null; gdraw(); glab.classList.add('bt-hide'); gguide.classList.add('bt-hide'); clearTimeout(GS.resetT); clearTimeout(GS.guideT); }
  const armGuide = () => { clearTimeout(GS.guideT); GS.guideT = setTimeout(() => { if (GS.down && GS.path.length < 3) gguideShow(); }, 250); };
  function gdown(ev) {
    clearTimeout(GS.resetT);
    if (GS.path.length >= 3) greset();
    const pt = { x: ev.clientX, y: ev.clientY };
    if (!GS.path) { GS.start = pt; GS.pts = []; }
    else GS.pts.push(null);
    GS.t0 = performance.now(); GS.moved = 0; GS.press = pt;
    GS.pts.push(pt); GS.seg = { x: pt.x, y: pt.y, d: GS.path ? GS.path[GS.path.length - 1] : null }; GS.down = true;
    gguide.classList.add('bt-hide'); armGuide(); gdraw();
    if (held) { const g = ground(pt.x, pt.y); if (g) aimAt(g.x, g.z); } // the spell in hand shows where a tap here would put it
  }
  function gmove(ev) {
    if (!GS.down) return;
    const q = { x: ev.clientX, y: ev.clientY };
    GS.moved = Math.max(GS.moved, Math.hypot(q.x - GS.press.x, q.y - GS.press.y));
    if (held && GS.moved < TAP_PX && !GS.path) { const g = ground(q.x, q.y); if (g) aimAt(g.x, g.z); return; }
    if (GS.path.length < 3) GS.pts.push(q);
    const dx = q.x - GS.seg.x, dy = q.y - GS.seg.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) >= MIN && GS.path.length < 3 && Math.min(ax, ay) <= Math.max(ax, ay) * OFF) {
      const d = ax > ay ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
      if (d !== GS.seg.d) { GS.path += d; GS.seg = { x: q.x, y: q.y, d }; navigator.vibrate?.(6); gguide.classList.add('bt-hide'); armGuide(); }
      else { GS.seg.x = q.x; GS.seg.y = q.y; }
    }
    gdraw(); glabel();
  }
  function gup(ev, cancelled) {
    if (!GS.down) return;
    GS.down = false; clearTimeout(GS.guideT); gguide.classList.add('bt-hide');
    if (cancelled) { // a cancelled touch is nothing: keep what was drawn, wait for the next flick
      if (!GS.path) greset(); else GS.resetT = setTimeout(greset, RESET_MS);
      return;
    }
    if (!GS.path) {
      const tap = GS.moved < TAP_PX && performance.now() - GS.t0 < 700;
      const g = tap ? ground(ev.clientX, ev.clientY) : null;
      greset();
      if (!g) return;
      if (held) { place(g.x, g.z); return; }
      showTag(g.x, g.z);
      return;
    }
    if (GS.path.length < 3) { glabel(); GS.resetT = setTimeout(greset, RESET_MS); return; }
    const sp = BYPATH[GS.path];
    glabel();
    if (!sp) { GS.resetT = setTimeout(greset, 1100); return; }
    // the spell is now in hand: a tap places it
    setHeld(sp);
    if (!U.touchy && hover) aimAt(hover.x, hover.z);
    GS.resetT = setTimeout(greset, 450);
  }
  // a tap on a fighter: a small name tag (never the home card, never a pause)
  function showTag(x, z) {
    if (!F) return;
    let b = null, bd = 1.6;
    for (const u of F.units) { if (u.state === 'gone' || (u.side !== 0 && u.kind !== 'champ' && u.kind !== 'beast')) continue; const d = Math.hypot(u.e.x - x, u.e.z - z); if (d < bd) { bd = d; b = u; } }
    if (!b) { tag = null; tagEl.classList.add('bt-hide'); return; }
    const st = b.state === 'dead' ? 'fallen' : b.state === 'wounded' ? 'wounded, limping back' : b.state === 'flee' ? 'falling back' : b.frozen > 0 ? 'frozen with fear' : b.boost > 0 ? 'boosted' : b.burning > 0 ? 'alight' : 'fighting';
    const fam = b.side === 0 ? `of the ${F.bands[b.band]?.name ?? ''} family` : b.kind === 'beast' ? '' : 'their champion';
    tagEl.innerHTML = `<b>${b.p?.name ?? b.name ?? 'a raider'}</b> ${fam}<br><small>${st}${b.side === 0 ? `, ${Math.max(0, Math.round(100 * b.hp / b.maxHp))}%` : ''}</small>`;
    tag = { u: b, t: 2.6 };
    tagEl.classList.remove('bt-hide');
  }
  addEventListener('resize', gsize); gsize();

  // the pointer on the battleground is the battle's (main.js ctx.claimPointer): one finger or the left button draws
  // and taps, two fingers move, zoom and turn the view, and tilt it as at home (T-0440: side by side, dragged up or
  // down together, decided in the first 8 px by the same rule as ui/touch.js, then the tilt owns the touch; a pinch,
  // twist or pan that started first never tilts); the right and middle buttons stay the camera's
  const canvas = ctx.dom.canvas;
  const pts = new Map();
  let pinch = null;
  // a new pair of fingers (the first two down, or a third taking the place of a lifted one): every baseline from the
  // view as it is now, so nothing jumps; what was recognised stays
  function pairStart(keep) {
    const C = ctx.camera, ids = [...pts.keys()].slice(0, 2), a = pts.get(ids[0]), b = pts.get(ids[1]);
    const m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinch = { key: ids.join(','), ids, d0: Math.hypot(a.x - b.x, a.y - b.y), ppm0: C.ppm, aLast: Math.atan2(b.y - a.y, b.x - a.x), acc: 0, yaw0: C.yaw,
      turn: keep?.turn ?? false, zoom: keep?.zoom ?? false, pan: keep?.pan ?? false, tilt: keep?.tilt ?? false,
      sA: { x: a.x, y: a.y }, sB: { x: b.x, y: b.y }, m0, ground: C.onPlane(m0.x, m0.y), pitch0: C.pitch,
      t0: { x: C.target.x, z: C.target.z },
      // a tilt is two fingers side by side (more across than up and down from each other), as at home
      side: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) };
  }
  function pinchMove(dx, dy) {
    const C = ctx.camera, P = pinch, a = pts.get(P.ids[0]), b = pts.get(P.ids[1]);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    C.anim = null;
    if (d >= TILT_TOUCH.MIN_SPACING) { const an = Math.atan2(b.y - a.y, b.x - a.x); let da = an - P.aLast; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; P.acc += da; P.aLast = an; }
    const ax = a.x - P.sA.x, ay = a.y - P.sA.y, bx = b.x - P.sB.x, by = b.y - P.sB.y;
    // ---- the tilt is looked at first, and only while nothing else has been recognised ----
    if (!P.tilt && P.side && !P.zoom && !P.turn && !P.pan && tiltStarts(ax, ay, bx, by, d - P.d0, P.acc * d / 2)) {
      P.tilt = true;
      // the tilt owns the touch from its start: the little zoom the first pixels made is taken back
      C.ppm = P.ppm0; C.yaw = P.yaw0; C.target.x = P.t0.x; C.target.z = P.t0.z; C.update();
    }
    if (P.tilt) { tiltView(C, P, (ay + by) / 2); return; }
    // ---- zoom and turn, as the battle always had them: the zoom follows the spacing from the first pixel ----
    C.ppm = Math.max(C.minPpm(), Math.min(40, P.ppm0 * d / Math.max(10, P.d0)));
    if (!P.zoom && Math.abs(Math.log2(Math.max(10, d) / Math.max(10, P.d0))) >= TILT_TOUCH.ZOOM_LOG2) P.zoom = true;
    // a deliberate twist (12 degrees or more) turns the view with the fingers, as at home (ui/touch.js)
    if (!P.turn && Math.abs(P.acc) >= 12 * Math.PI / 180) P.turn = true;
    if (P.turn) C.yaw = P.yaw0 + P.acc;
    // ---- pan: at once sideways; a move mostly up or down with the fingers side by side may still be a tilt, so it
    // waits (PAN_WAIT_PX) and then catches up all the way from where the fingers came down ----
    if (!P.pan) {
      const mx = (a.x + b.x) / 2 - P.m0.x, my = (a.y + b.y) / 2 - P.m0.y, dd = Math.hypot(mx, my);
      const couldTilt = P.side && !P.zoom && !P.turn;
      if (dd >= TILT_TOUCH.PAN_PX && (!couldTilt || Math.abs(mx) >= Math.abs(my) || dd >= TILT_TOUCH.PAN_WAIT_PX)) { P.pan = true; C.panPx(mx, my); }
    } else C.panPx(dx / 2, dy / 2);
    C.clamp(); C.update();
  }
  const onGround = () => stage === 'battle' || stage === 'out' || stage === 'back' || stage === 'visit';
  ctx.claimPointer = (ev) => {
    if (!onGround()) return false;
    if (ev.target !== canvas && !pts.has(ev.pointerId)) { if (ev.type === 'pointermove' && ev.pointerType === 'mouse') hover = null; return false; }
    if (ev.pointerType === 'mouse' && ev.type === 'pointerdown' && ev.button !== 0) {
      if (ev.button === 2 && held) { setHeld(null); return true; }
      return false;
    }
    if (stage === 'out' || stage === 'back') { if (ev.type === 'pointerdown') ask('battleSkipMarch'); return true; }
    if (stage === 'visit') return false;
    const C = ctx.camera;
    if (ev.type === 'pointerdown') {
      try { canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic */ }
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { gup(ev, true); greset(); pairStart(pinch); return true; }
      if (pts.size > 2) return true;
      if (openG) openGroup(null);
      if (F) gdown(ev);
      return true;
    }
    const p = pts.get(ev.pointerId);
    if (ev.type === 'pointermove') {
      if (!p) { // a mouse hovering: the spell in hand follows it
        if (ev.pointerType === 'mouse' && ev.target === canvas) { const g = ground(ev.clientX, ev.clientY); hover = g; if (held && g && !GS.down) aimAt(g.x, g.z); }
        return false;
      }
      const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      p.x = ev.clientX; p.y = ev.clientY;
      if (pinch && pts.size >= 2) {
        if (pinch.key !== [...pts.keys()].slice(0, 2).join(',')) pairStart(pinch); // a third finger took a lifted one's place
        else if (pinch.ids.includes(ev.pointerId)) pinchMove(dx, dy);
        return true;
      }
      if (!pinch) gmove(ev);
      return true;
    }
    if (ev.type === 'pointerup' || ev.type === 'pointercancel') {
      if (!p) return false;
      pts.delete(ev.pointerId);
      if (pinch) {
        if (pts.size === 0) { if (pinch.tilt) ctx.camera.tilted?.(); pinch = null; } // a tilt is the player's, as at home
        else pinch.key = ''; // one left: the next finger down starts a fresh pair from where the view is
        return true;
      }
      gup(ev, ev.type === 'pointercancel');
      return true;
    }
    return false;
  };
  addEventListener('keydown', (ev) => {
    if (!F || stage !== 'battle') return;
    if (ev.code === 'Escape' && held) { setHeld(null); ev.preventDefault(); ev.stopImmediatePropagation(); }
    else if (ev.code === 'Enter' && F.phase === 'calm') { ask('battleCall'); ev.preventDefault(); }
    else if (ev.code === 'Space') { ctx.clock.setPaused(!ctx.clock.paused); ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, { capture: true });

  // ---------- layout: the strip at the top edge, the row at the bottom edge ----------
  let safe = { l: 12, r: 12, t: 6, b: 6 };
  function measureSafe() {
    const probe = h('div'); probe.style.cssText = 'position:fixed;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden';
    root.appendChild(probe); const ps = getComputedStyle(probe), px = (v) => parseFloat(v) || 0;
    safe = { l: Math.max(16, px(ps.paddingLeft) + 8), r: Math.max(16, px(ps.paddingRight) + 8), /* as screen.css --L and --R */ t: Math.max(6, px(ps.paddingTop)), b: Math.max(6, px(ps.paddingBottom)) };
    probe.remove();
  }
  function layout() {
    measureSafe();
    const W = innerWidth, Hh = innerHeight;
    root.classList.toggle('bt-compact', W < 1100 || Hh < 520);
    root.classList.toggle('bt-tiny', Hh < 340 || W < 860);
    top.style.left = `${safe.l}px`; top.style.right = `${safe.r}px`; top.style.top = `${safe.t}px`;
    bottom.style.left = `${safe.l}px`; bottom.style.right = `${safe.r}px`; bottom.style.bottom = `${safe.b}px`;
    const tb = safe.t + top.offsetHeight + 6;
    prev.style.right = `${safe.r}px`; prev.style.top = `${tb}px`;
    prev.style.maxHeight = `${Math.max(80, Hh - tb - bottom.offsetHeight - safe.b - 10)}px`;
    menu.style.right = `${safe.r}px`; menu.style.top = `${tb}px`;
    march.style.left = `${Math.max(safe.l, (W - Math.min(460, W - 32)) / 2)}px`; march.style.top = `${safe.t + 8}px`;
  }

  // ---------- the map labels ----------
  const proj = (x, y, z) => ctx.camera.toScreen(x, y, z);
  const placeEl = (el, s, dy = 0) => { el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y + dy)}px) translate(-50%, -100%)`; };
  function word(x, z, text, cls = '', dur = 1.8) {
    const el = h('div', `bt-lab bt-word ${cls}`); el.textContent = text;
    labels.appendChild(el);
    fx.push({ el, x, z, t: 0, dur, lift: cls.includes('big') ? 3.2 : 2.6 });
    if (fx.length > 14) { const o = fx.shift(); o.el.remove(); }
  }
  // the big title across the middle: centred in the part of the map nothing else covers (below the strip, above the
  // bottom, left of the raiders card or the menu), wrapping to that width, never over a card (T-0494)
  // (placed again every frame while it shows: it is often made a frame before the strip and the card appear)
  const banners = new Set();
  function banner(text, sub = '') {
    const el = h('div', 'bt-banner', `${text}${sub ? `<small>${sub}</small>` : ''}`);
    root.appendChild(el);
    banners.add(el);
    placeBanner(el);
    setTimeout(() => { el.remove(); banners.delete(el); }, 2700);
  }
  function placeBanner(el) {
    const W = innerWidth, Hh = innerHeight, shown = (e) => !e.classList.contains('bt-hide') && e.offsetHeight > 0;
    let l = safe.l, r = W - safe.r;
    const t = shown(top) ? top.getBoundingClientRect().bottom + BANNER_GAP : safe.t;
    const b = shown(bottom) ? bottom.getBoundingClientRect().top - BANNER_GAP : Hh - safe.b;
    for (const c of [prev, menu]) if (shown(c)) r = Math.min(r, c.getBoundingClientRect().left - BANNER_GAP);
    el.style.maxWidth = `${Math.max(0, r - l)}px`;
    el.style.left = `${Math.round((l + r) / 2)}px`;
    const hgt = el.offsetHeight;
    el.style.top = `${Math.round(Math.max(t, Math.min(b - hgt, Hh * BANNER_AT - hgt / 2)))}px`;
  }
  function drawLabels(dt) {
    F.bands.forEach((b, k) => {
      let el = bandEls[k];
      if (!el) { el = bandEls[k] = h('div', 'bt-lab bt-band', '<i></i><span></span><small></small>'); labels.appendChild(el); }
      const f = F.fam[k], at = f ? { x: f.x, z: f.z } : b.post;
      el.style.setProperty('--dye', `#${(b.dye ?? 0x3e78b2).toString(16).padStart(6, '0')}`);
      el.classList.toggle('bt-broke', !!f?.retreat);
      el.children[1].textContent = b.name;
      el.children[2].textContent = f ? (f.retreat ? 'falling back' : `${f.n}`) : (F.phase === 'calm' ? '' : 'gone');
      const s = proj(at.x + 0.6, gy(at.x, at.z) + 5.4, at.z);
      el.style.display = s.behind ? 'none' : ''; placeEl(el, s);
    });
    const seen = new Set();
    for (const u of F.units) {
      if ((u.kind !== 'champ' && u.kind !== 'beast') || !(u.state === 'fight' || u.state === 'flee')) continue;
      seen.add(u);
      let el = champEls.get(u);
      const theirs = u.side === 1 || (u.side === 2 && u.owner === 1);
      if (!el) { el = h('div', `bt-lab bt-champ${theirs ? ' bt-their' : ''}`, `<span></span><span class="bt-hp"><i></i></span>`); el.children[0].textContent = u.kind === 'beast' ? (theirs ? 'their beast' : 'your beast') : u.name; labels.appendChild(el); champEls.set(u, el); }
      el.children[1].firstChild.style.width = `${Math.max(0, Math.round(100 * u.hp / u.maxHp))}%`;
      const s = proj(u.e.x, u.e.y + (u.kind === 'beast' ? 5 : 3), u.e.z);
      el.style.display = s.behind ? 'none' : ''; placeEl(el, s);
    }
    for (const [u, el] of champEls) if (!seen.has(u)) { el.remove(); champEls.delete(u); }
    const tl = new Set();
    for (const t of F.tells) {
      tl.add(t);
      let el = tellEls.get(t);
      if (!el) {
        el = h('div', 'bt-lab bt-tell', `<span class="bt-ti">${spell(t.power, 40)}</span><span class="bt-tt"></span><span class="bt-th"></span>`);
        el.querySelector('.bt-ti').style.setProperty('--pc', COL[t.power]);
        const hp = HELPS[t.power];
        el.querySelector('.bt-th').textContent = t.mode === 'flatten' ? 'Flattening your earthworks' : hp ? `${NAME[hp]} helps (${STROKES[hp].split('').map((c) => ARROW[c]).join('')})` : 'Cannot be stopped';
        labels.appendChild(el); tellEls.set(t, el);
      }
      el.querySelector('.bt-tt').textContent = `${NAME[t.power]} ${Math.max(0, t.dur - t.t).toFixed(1)}`;
      const s = proj(t.x, gy(t.x, t.z) + 0.5, t.z);
      el.style.display = s.behind ? 'none' : '';
      el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -50%)`;
    }
    for (const [t, el] of tellEls) if (!tl.has(t)) { el.remove(); tellEls.delete(t); }
    for (let i = fx.length - 1; i >= 0; i--) {
      const o = fx[i]; o.t += dt;
      if (o.t >= o.dur) { o.el.remove(); fx.splice(i, 1); continue; }
      placeEl(o.el, proj(o.x, gy(o.x, o.z) + o.lift, o.z));
    }
    if (held && aim) {
      aimEl.classList.remove('bt-hide'); aimEl.classList.toggle('bt-no', !aim.ok);
      aimEl.textContent = aim.ok ? (aim.unit ? (aim.unit.p?.name ?? aim.unit.name ?? (aim.unit.kind === 'beast' ? 'the beast' : 'a raider')) : aim.text) : aim.why;
      const s = proj(aim.x, gy(aim.x, aim.z), aim.z);
      aimEl.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, 16px)`;
    } else aimEl.classList.add('bt-hide');
    if (tag) {
      tag.t -= dt;
      if (tag.t <= 0) { tag = null; tagEl.classList.add('bt-hide'); }
      else placeEl(tagEl, proj(tag.u.e.x, tag.u.e.y + 3.6, tag.u.e.z));
    }
  }
  function clearLabels() {
    for (const el of bandEls) el?.remove(); bandEls.length = 0;
    for (const el of champEls.values()) el.remove(); champEls.clear();
    for (const el of tellEls.values()) el.remove(); tellEls.clear();
    for (const o of fx) o.el.remove(); fx.length = 0;
    aimEl.classList.add('bt-hide'); tagEl.classList.add('bt-hide'); tag = null;
  }

  // ---------- the strip, the hand, the bar and the row, every frame ----------
  const setT = (el, t) => { if (el._t !== t) { el._t = t; el.textContent = t; } };
  const setH = (el, t) => { if (el._t !== t) { el._t = t; el.innerHTML = t; } };
  function drawHud() {
    const g0 = F.gods[0], g1 = F.gods[1];
    Q('.bt-eye').style.background = g1.pers.css;
    setT(Q('.bt-s-gn'), g1.pers.name);
    const nm = F.nextMove(), m = Q('.bt-s-gm'), gb = Q('.bt-s-gbar i'), godEl = Q('.bt-s-god');
    if (F.phase === 'calm') { setT(m, 'Watching. Waiting.'); gb.style.width = '0'; godEl.classList.remove('bt-landing'); }
    else if (nm) {
      const aimW = nm.mode === 'flatten' ? ' on your earthworks' : nm.aim ? ` on ${nm.aim}` : '';
      if (nm.landing) setH(m, `<b>${NAME[nm.power]}${aimW}!</b> ${nm.in.toFixed(1)} s`);
      else setT(m, `Next: ${VERB[nm.power]}${aimW}${nm.in > 0.3 ? ` in ${Math.ceil(nm.in)} s` : ''}`);
      gb.style.width = nm.landing ? `${Math.round(100 * (1 - nm.in / nm.dur))}%` : '0';
      godEl.classList.toggle('bt-landing', !!nm.landing);
    } else { setT(m, F.phase === 'fight' ? 'Biding its time.' : '...'); gb.style.width = '0'; godEl.classList.remove('bt-landing'); }
    setT(Q('.bt-s-ta'), F.phase === 'calm' ? `Attack in ${Math.ceil(F.calmLeft)} s` : F.phase === 'fight' ? `Wave ${F.waveIdx + 1}/3 · ${fmt(F.env.T.dawnAt - F.ft)}` : F.result?.win ? 'Held' : 'Lost');
    Q('.bt-call').classList.toggle('bt-hide', F.phase !== 'calm');
    setH(Q('.bt-pause'), sig(ctx.clock.paused ? 'play' : 'pause'));
    let mine = 0, theirs = 0;
    for (const u of F.units) if (u.state === 'fight' || u.state === 'flee') { if (u.side === 0) mine++; else if (u.side === 1) theirs++; }
    theirs += F.spawnQueue.length + (F.waveIdx < 2 ? F.waves.slice(F.waveIdx + 1).reduce((s, w) => s + w.n + (w.champ ? 1 : 0), 0) : 0);
    setT(Q('.bt-mine'), String(mine)); setT(Q('.bt-theirs'), String(theirs));
    Q('.bt-vs i').style.width = `${Math.round(100 * mine / Math.max(1, mine + theirs))}%`;
    const hd = F.hearthT > 0.2;
    Q('.bt-s-hearth').classList.toggle('bt-hide', !hd);
    if (hd) Q('.bt-h-bar i').style.width = `${Math.round(100 * F.hearthT / F.env.T.hearthSeconds)}%`;
    prev.classList.toggle('bt-hide', F.phase !== 'calm' || prevClosed);
    // the bar
    const bar = barw.querySelector('.bt-bar');
    bar.querySelector('i').style.width = `${(100 * g0.bar / g0.barMax).toFixed(1)}%`;
    if (!bar._ticks) { bar._ticks = true; for (let v = 2; v < g0.barMax; v += 2) { const t = document.createElement('b'); t.style.left = `${100 * v / g0.barMax}%`; t.style.opacity = v % 10 === 0 ? '1' : '0.45'; bar.appendChild(t); } }
    const hc = held ? F.costOf(held) : 0;
    bar.querySelector('u').style.width = held ? `${(100 * Math.min(g0.bar, hc) / g0.barMax).toFixed(1)}%` : '0';
    setT(barw.querySelector('.bt-barn'), `${Math.floor(g0.bar)}/${g0.barMax}`);
    // the row: each spell fills as the bar fills; locked, used, refused, the answer to their move
    const helpSp = nm ? HELPS[nm.power] : null;
    for (const p of POWERS) {
      const b = btn[p], cost = F.costOf(p), lock = g0.lock[p];
      setT(b.querySelector('.bt-sp-c'), String(cost));
      const used = p === 'revive' && g0.usedRevive;
      const refused = !F.quietOk && F.env.T.quiet.includes(p);
      const k = used || refused ? 0 : lock > 0 ? 1 - lock / (F.env.T.lockout || 8) : Math.min(1, g0.bar / cost);
      b.querySelector('.bt-sp-fill').style.height = `${Math.round(100 * k)}%`;
      b.classList.toggle('bt-dim', used || refused || lock > 0 || g0.bar < cost);
      b.querySelector('.bt-sp-u').classList.toggle('bt-hide', !used);
      b.classList.toggle('bt-glow', F.phase === 'fight' && p === helpSp && !F.refusal(p, cost));
    }
    for (const [g] of GROUPS) gbtn[g].classList.toggle('bt-glow', !!helpSp && F.phase === 'fight' && STROKES[helpSp][0] === g && !F.refusal(helpSp) && held !== helpSp);
    if (held) drawHand();
  }
  let prevClosed = false;
  function fillPreview(pv) {
    prevClosed = false;
    const spells = pv.spells.map((p) => `<span class="bt-ps" style="--pc:${COL[p]}" title="${NAME[p]}">${spell(p, 24)}<i>${NAME[p]}</i></span>`).join('');
    prev.innerHTML = `<div class="bt-p-h"><b>${cap(pv.people)}</b><button type="button" class="bt-btn bt-ico bt-p-x" aria-label="Close">${sig('x')}</button></div>
      <p class="bt-p-l"><b>${pv.total}</b> raiders in ${pv.waves.length} waves${pv.champs.length ? `, led by ${pv.champs.map((c) => `<b>${c}</b>`).join(' and ')}` : ''}. <b class="bt-p-d">${cap(pv.difficulty)}.</b></p>
      <p class="bt-p-l">Their god, <b>${pv.god}</b>: ${pv.godShort}</p>
      <div class="bt-p-s" title="Their god's spells">${spells}</div>`;
    prev.querySelector('.bt-p-x').addEventListener('click', () => { prevClosed = true; prev.classList.add('bt-hide'); });
  }
  let firesShown = null;
  function drawFires(el, n, max, change) {
    const key = `${n}/${max}/${change ?? ''}`;
    if (el._k === key) return;
    el._k = key;
    let html = '';
    for (let k = 0; k < max; k++) {
      let cls = k < n ? '' : 'out';
      if (change && change < 0 && k >= n && k < n - change) cls = 'going';
      if (change && change > 0 && k === n - 1) cls = 'coming';
      html += `<i class="${cls}"></i>`;
    }
    el.innerHTML = html;
  }

  // ---------- battle events ----------
  U.on('battle:march', (e) => {
    if (!e) return;
    hudRoot()?.setAttribute('data-battle', '1'); document.documentElement.dataset.battle = '1'; // at once, not a frame later
    U.read?.apply(); // anything open at home lets go of time: a battle is never paused by reading (time.js)
    const C = ctx.camera, from = { x: C.target.x, y: C.target.y, z: C.target.z, ppm: C.ppm, yaw: C.yaw, pitch: C.pitch };
    C.anim = { from, to: { ...from, x: e.x, z: e.z, ppm: Math.max(C.ppm, 11) }, t: 0, dur: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.1 : 0.9 };
    U.sfx?.('alert.bad');
  });
  U.on('battle:calm', (e) => {
    if (!e) return;
    if (e.preview) fillPreview(e.preview);
    banner(`${cap(e.enemy)} draw up`, `with ${e.god}`);
    layout();
  });
  U.on('battle:start', () => { banner('They come!'); prevClosed = true; });
  U.on('battle:fx', (e) => {
    if (!e || !F) return;
    switch (e.kind) {
      case 'wave': if (e.k > 0) banner(e.text); break;
      case 'answered': word(e.x, e.z, e.text, 'big', 1.6); if (e.line) setTimeout(() => word(e.x, e.z, e.line, 'soft', 1.6), 250); break;
      case 'champFalls': word(e.x, e.z, e.text, `big${e.side === 0 ? ' bad' : ''}`, 2.6); break;
      case 'champWounded': word(e.x, e.z, e.text, e.side === 0 ? 'bad' : '', 2); break;
      case 'break': word(e.x, e.z, e.text, 'bad', 2.2); break;
      case 'theirBreak': word(e.x, e.z, e.text, 'good', 1.6); break;
      case 'rally': word(e.x, e.z, e.text, 'good', 2); break;
      case 'shock': word(e.x, e.z, e.text, 'soft', 1.8); break;
      case 'word': word(e.x, e.z, e.text, e.tone ?? '', 1.6); break;
      case 'end': banner(e.text); break;
      default: break;
    }
  });
  U.on('battle:end', (e) => { if (!e || e.headless) return; setHeld(null); greset(); setTimeout(() => showResult(e.result), 600); });
  U.on('run:end', (e) => showEnd(e));

  // ---------- the result card ----------
  let resEl = null;
  function showResult(r) {
    if (!r) return;
    resEl?.remove();
    const how = { dawn: 'They held until the raiders lost heart and went home.', routed: 'The last of the raiders ran for home.', hearth: 'Raiders stood round your hearth on the Marches and nobody could shift them.', broken: 'Nobody was left to hold the line.' }[r.how] ?? '';
    const title = r.win ? (r.stats.myDead === 0 ? 'Held, and nobody lost.' : 'Held.') : r.how === 'hearth' ? 'The hearth fell.' : 'Your people broke.';
    const n = (v) => `<b data-n="${v}">0</b>`;
    const st = r.stats, lines = [];
    if (st.myChampsLost.length) lines.push(`${st.myChampsLost.map((c) => c.name).join(' and ')} fell.`);
    if (st.champsWounded.length) lines.push(`${st.champsWounded.join(' and ')} ${st.champsWounded.length === 1 ? 'was' : 'were'} carried off wounded, and will mend.`);
    if (st.theirChampsLost.length) lines.push(`Their ${st.theirChampsLost.join(' and ')} fell.`);
    if (st.famBreaks) lines.push(`${st.famBreaks === 1 ? 'Once a family broke' : `${cap(words(st.famBreaks))} times a family broke`} and fell back to the hearth.`);
    if (st.answered) lines.push(`You answered ${words(st.answered)} of their god's moves (${[...new Set(st.answeredWords)].join(' ')}).`);
    const ff = [];
    if (st.ffFire) ff.push(`your fire took ${words(st.ffFire)} of yours`); if (st.ffWolf) ff.push(`your beasts ${words(st.ffWolf)}`); if (st.ffSmite) ff.push(`your strike ${words(st.ffSmite)}`);
    if (ff.length) lines.push(`${cap(ff.join(', '))}.`);
    if (st.shocked) lines.push(`${cap(words(st.shocked))} times one of yours froze at their god's miracles: with so little faith, such things terrify them.`);
    if (r.villageDead) lines.push(`Raiders who slipped past came through to the village: ${words(r.villageDead)} more died there.`);
    if (st.caught) lines.push(`When the line broke they caught ${words(st.caught)} of the wounded.`);
    const firesLine = r.firesLost ? `${r.firesLost === 2 ? 'Two hearth fires go' : 'A hearth fire goes'} out. ${r.firesAfter} left.` : r.relit ? `A hearth fire is lit again: ${r.firesAfter}.` : `${r.firesAfter} hearth fires.`;
    const scrim = h('div', 'bt-scrim');
    scrim.innerHTML = `<div class="bt-card bt-res" role="dialog" aria-label="The battle is over">
      <h2 class="${r.win ? 'bt-good' : 'bt-bad'}">${title}</h2>
      <p class="bt-how">${how} Battle ${r.n}, against ${r.enemy} and ${r.god}.</p>
      <div class="bt-nums">
        <div class="bt-num">${n(st.myStart)}<span>marched out</span></div>
        <div class="bt-num">${n(st.myDead)}<span>died fighting</span></div>
        <div class="bt-num">${n(Math.max(0, r.wounded))}<span>wounded, will mend</span></div>
        <div class="bt-num">${n(st.theirDead + Math.max(0, st.theirWounded))}<span>raiders put down</span></div>
        <div class="bt-num">${n(r.bar.casts)}<span>of your spells</span></div>
      </div>
      <div class="bt-firesrow"><span class="bt-fires bt-rf"></span><span>${firesLine}</span></div>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
      <p>${r.over ? `<b>${r.over}</b>` : 'The survivors walk home, harder for it. The next raiders come in about 125 years.'}</p>
      <div class="bt-foot">${QUICK && !r.over ? '<button type="button" class="bt-btn bt-go bt-again">Fight again</button>' : ''}<button type="button" class="bt-btn ${QUICK ? '' : 'bt-go'} bt-goon">${r.over ? 'See how it ended' : 'Go home'}</button></div></div>`;
    root.appendChild(scrim);
    resEl = scrim;
    drawFires(scrim.querySelector('.bt-rf'), r.firesAfter, F?.env?.T?.fires ?? 7, r.firesLost ? -r.firesLost : r.relit ? 1 : null);
    const els = [...scrim.querySelectorAll('[data-n]')];
    let done = false;
    const finish = () => { done = true; for (const e of els) e.textContent = e.dataset.n; };
    scrim.addEventListener('pointerdown', finish, { once: true });
    const t0 = performance.now();
    const step = (now) => { if (done) return; let more = false; els.forEach((e, k) => { const t = Math.max(0, Math.min(1, (now - t0 - k * 150) / 420)); e.textContent = String(Math.round(+e.dataset.n * (1 - (1 - t) ** 2))); if (t < 1) more = true; }); if (more) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    scrim.querySelector('.bt-goon').addEventListener('click', () => { scrim.remove(); resEl = null; ask('battleDone'); });
    scrim.querySelector('.bt-again')?.addEventListener('click', () => { scrim.remove(); resEl = null; ask('battleAgain'); });
  }
  function showEnd(e) {
    if (!e) return;
    resEl?.remove();
    const y = Math.round(e.year), yl = y < 0 ? `${-y} BC` : `AD ${y}`;
    const scrim = h('div', 'bt-scrim');
    scrim.innerHTML = `<div class="bt-card bt-end" role="dialog" aria-label="The run is over"><h2>The end of your people</h2>
      <p>${e.why}</p><p class="bt-year">${yl}</p>
      <p>${e.battles ? `${cap(words(e.held))} of ${words(e.battles)} battles held.` : 'No battle was fought.'}</p>
      <div class="bt-foot" style="justify-content:center"><button type="button" class="bt-btn bt-go">Begin again</button></div></div>`;
    root.appendChild(scrim);
    scrim.querySelector('button').addEventListener('click', () => { location.href = location.pathname; });
  }

  // ---------- at home: the warning chip, the Menu rows, the battleground between battles ----------
  const chip = h('div', 'bt-card bt-chip bt-hide', `${sig('spear')}<span class="bt-ct"></span><button type="button" class="bt-btn bt-skip">Skip to it</button><button type="button" class="bt-btn bt-visit">Visit the Marches</button>`);
  root.appendChild(chip);
  let skipping = false, visiting = false;
  const doSkip = async (b) => { if (skipping) return; skipping = true; if (b) b.disabled = true; try { await ask('battleSkip'); } finally { skipping = false; if (b) b.disabled = false; } };
  const doVisit = () => { visiting = !visiting; ask('battleVisit', visiting); chip.querySelector('.bt-visit').textContent = visiting ? 'Back home' : 'Visit the Marches'; };
  chip.querySelector('.bt-skip').addEventListener('click', (ev) => doSkip(ev.currentTarget));
  chip.querySelector('.bt-visit').addEventListener('click', doVisit);
  const mo = new MutationObserver(() => {
    const r0 = document.querySelector('#ui .mskip');
    if (!r0 || r0.parentNode.querySelector('.bt-mrow')) return;
    const nx = ask('battleNext');
    if (!nx?.year || nx.live) return;
    const r = h('div', 'mrow bt-mrow', `<span class="mrow-l">Skip to the next battle <span class="mnote-i">(${nx.year < 0 ? `${-nx.year} BC` : `AD ${nx.year}`})</span></span>`);
    const b = h('button', 'btn chip', 'Skip'); b.type = 'button';
    b.addEventListener('click', () => { U.menu?.close?.(); doSkip(b); });
    const v = h('button', 'btn chip', 'Visit the Marches'); v.type = 'button';
    v.addEventListener('click', () => { U.menu?.close?.(); doVisit(); });
    r.append(b, v); r0.after(r);
  });
  mo.observe(document.getElementById('ui') ?? document.body, { childList: true, subtree: true });

  // ---------- each frame, each quarter second ----------
  const hudRoot = () => document.getElementById('ui');
  let layoutT = 0;
  function frame(dt) {
    const st = ask('battleStage') ?? (visiting ? 'visit' : null);
    if (st !== stage) {
      stage = st;
      // the battle's own screen: the whole home interface goes, by one attribute on the HUD root
      const on = !!stage;
      if (hudRoot()) { if (on) hudRoot().dataset.battle = '1'; else delete hudRoot().dataset.battle; }
      if (on) document.documentElement.dataset.battle = '1'; else delete document.documentElement.dataset.battle;
      if (on) { menu.classList.add('bt-hide'); layout(); } else { greset(); setHeld(null); }
    }
    march.classList.toggle('bt-hide', stage !== 'march');
    const f = ask('battle') ?? null;
    if (f !== F) {
      F = f; clearLabels(); setHeld(null);
      if (F) { barw.querySelector('.bt-bar')._ticks = false; for (const t of barw.querySelectorAll('.bt-bar b')) t.remove(); }
    }
    const shown = !!F && stage === 'battle';
    const was = !top.classList.contains('bt-hide');
    top.classList.toggle('bt-hide', !shown); bottom.classList.toggle('bt-hide', !shown);
    if (!shown) { prev.classList.add('bt-hide'); menu.classList.add('bt-hide'); if (F && stage !== 'battle') clearLabels(); return; }
    if (held && aim && U.touchy && !GS.down) aimAt(aim.unit ? aim.unit.e.x : aim.x, aim.unit ? aim.unit.e.z : aim.z); // the marker keeps up with a fighter who moves
    drawHud();
    // the strip has just appeared: lay out at once, so the raiders card starts below it, not under it (T-0494)
    if (!was) layout();
    drawLabels(dt);
    for (const el of banners) placeBanner(el);
  }
  function slow(dt) {
    layoutT -= dt;
    if (F && layoutT <= 0) { layoutT = 1; layout(); }
    const n = ask('battleNext');
    if (!n) return;
    drawFires(Q('.bt-fires'), n.fires, n.firesMax, lastN && lastN.fires !== n.fires ? n.fires - lastN.fires : null);
    Q('.bt-fires').classList.toggle('bt-hide', n.loss !== 'hearths');
    lastN = n;
    const show = ((!n.live && n.foreseen) || visiting) && !n.over && ctx.clock.phase === 'running';
    chip.classList.toggle('bt-hide', !show);
    if (show) {
      setT(chip.querySelector('.bt-ct'), visiting ? 'The Marches' : `Raiders in ${Math.max(0, Math.ceil(n.inYears))} years`);
      chip.querySelector('.bt-skip').classList.toggle('bt-hide', visiting);
      measureSafe();
      chip.style.top = `${safe.t + 110}px`; chip.style.right = `${safe.r}px`;
    }
    void firesShown;
  }
  addEventListener('resize', () => { if (F) layout(); });
  return { frame, slow, setHeld };
}
