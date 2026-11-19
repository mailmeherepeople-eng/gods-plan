// The door under the left thumb (mock-up A, "two thumbs"; DESIGN.md "Decisions after the mock-ups").
// 2026-11-15, the director: the whole Omnipotence menu follows his tree ("change everything to be like this from now
// on. we follow this."; why: "there are too many options and the screen is crowding too much"), every level the same:
// a group's children show in the row, a child picked takes its place and shows its own, down to the tools. The door
// stays the door; a bar at the top centre shows where you are, with Back (one level up) and Exit (all shut).
// Where the older notes below say the door shows the tool with a cross, or a group moves to the door: that is gone.
//   the door   bottom left. Before time starts it is Omnipotence (the director, 2026-11-15: "Reshape should be
//              renamed to Omnipotence"); once time runs it is Powers. With a tool or a power in hand it shows that one,
//              with a cross: a tap puts it down. It is as wide as its word (it grows, the text never shrinks), and
//              the row, the modes and Undo and Redo stand beside it wherever it ends (--doorx).
//   the row    the door opens ONE row toward the middle (two when the window is too narrow): before time starts the
//              Omnipotence groups (Land, Water, Life, then Erase set apart) with Undo and Redo; once time runs
//              Omnipotence first, then every power. Omnipotence there opens its groups in the same row, with a way back.
//   a group    a group of one (Erase) arms it at once. A group of more (Land: Reshape, Structures) moves to the door,
//              with a back mark, and the row shows its choices; the one picked takes the door's place, in hand.
//   in hand    an Omnipotence tool: its modes in one row beside the door, its other controls (Size, Strength: the same
//              width, lined up) standing on the map above the right corner, Undo and Redo above the door; nothing
//              has a slab behind it. A power: its own setting (the radius) above the door, its price in the sheet.
// Everything is drawn from what the god module reports (god.groups, god.families, god.tools, their options): no tool
// is named here, so the god's list may change and a group may hold one choice or five, a tool two modes or eight.
// The god owns every key.
import { h, icon, hasIcon, tip, esc, cap, setText, setAttr, setHidden, setDisabled, sign, sealIcon } from './dom.js';

// pictures and words for the groups and families the game has had; any other one still shows, with its own name
const INFO = {
  // the groups of the Omnipotence tree
  'g:land': { icon: 'land', desc: 'Reshape the ground, paint it, or build a structure: a cave.' },
  'g:terrain': { icon: 'paint', desc: 'Paint the ground: fertile, non fertile, or frozen.' },
  'g:water': { icon: 'water', desc: 'Paint a river, or dig and fill a lake.' },
  'g:life': { icon: 'sprout', desc: 'Grow plants, or place animals.' },
  'g:plants': { icon: 'scatter', desc: 'Bushes, berry bushes, reeds and flowers, or trees.' },
  'g:animals': { icon: 'paw', desc: 'Birds in the sky, fish in the water, or animals of the land.' },
  'g:fauna': { icon: 'deer', desc: 'Animals that eat plants (deer, rabbits), or that hunt (wolves).' },
  // the families (what is in hand)
  shape: { icon: 'land', desc: 'Raise, lower and flatten the ground: hills, mountains, plateaus, pits.' },
  land: { icon: 'land', desc: 'Raise, lower and flatten the ground: hills, mountains, plateaus, pits.' },
  fertile: { icon: 'field', desc: 'Grass and farmland: ground things grow on.' },
  barren: { icon: 'dry', desc: 'Dry grass, dirt, sand and rock: ground nothing is sown on.' },
  frozen: { icon: 'night', desc: 'Snow and ice.' },
  structures: { icon: 'cave', desc: 'Build into the land. A cave: a home carved into a hillside, where people live until they learn to build.' },
  river: { icon: 'river', desc: 'Drag along the ground to paint a river. Its water runs downhill.' },
  lake: { icon: 'lake', desc: 'Tap the ground: a bowl is dug there and filled with water.' },
  water: { icon: 'water', desc: 'Bring water in or take it away: rivers and lakes.' },
  bushes: { icon: 'sprout', desc: 'Bushes, berry bushes, reeds and flowers, grown in clumps.' },
  trees: { icon: 'scatter', desc: 'Palms, a mix of trees, or banyans.' },
  sky: { icon: 'bird', desc: 'Birds.' },
  swim: { icon: 'fish', desc: 'Fish: minnows in the shallows, trout in running water, pike by the reeds, catfish in deep water. People fish for them.' },
  herbivore: { icon: 'rabbit', desc: 'Deer and rabbits: they eat plants, and people hunt them.' },
  carnivore: { icon: 'wolf', desc: 'Wolves: they hunt.' },
  vegetation: { icon: 'scatter', desc: 'Paint the ground, or grow trees, bushes and reeds.' },
  animals: { icon: 'paw', desc: 'Place deer, rabbits, wolves, birds or fish.' },
  cave: { icon: 'cave', desc: 'Carve a home into a hillside. People live in caves until they learn to build.' },
  erase: { icon: 'erase', desc: 'Clear whatever is under the brush: plants, painted ground, water, animals you placed.' },
};
const icOf = (key, id) => INFO[key]?.icon ?? (hasIcon(id) ? id : 'dot');
// a tool's modes that have a chosen sign (shown bare beside the mode's name, as the picker showed them)
const MODE_SIGN = { raise: 'raise', lower: 'lower', flatten: 'flatten', cave: 'cave', river: 'river', lake: 'lake',
  'animal.deer': 'deer', 'animal.rabbit': 'rabbit', 'animal.wolf': 'wolf', 'animal.bird': 'bird',
  'animal.minnow': 'fish', 'animal.trout': 'fish', 'animal.pike': 'fish', 'animal.catfish': 'fish' };
// the door's word before time starts, and the Powers row's first button
const OMNI = 'Omnipotence';
const NEEDS = { animal: 'animal', person: 'person', clan: 'clan' };
const NONE_TEXT = { animal: 'No animals about yet.', person: 'Nobody here yet.', clan: 'No clans yet: nobody has settled.' };
// a tool's settings in the order they matter; the first three stand on the map, the rest a tap further
const FIRST_OPTS = ['size', 'strength', 'height', 'width', 'depth', 'room', 'count', 'density', 'spacing', 'rim'];
const MODES_MAX = 8;   // more modes than this: the first few and "More"

const isPower = (t) => !!t && (t.dock || t.family === 'power' || t.group === 'power' || t.kind === 'power');

export function makeDoors(U) {
  const { ctx } = U;
  const phase = () => ctx.clock.phase;
  const tools = () => { const t = U.get('god', 'tools'); return Array.isArray(t) ? t : []; };
  const armed = () => U.get('god', 'tool') ?? null;
  const inPhase = (t) => !Array.isArray(t?.phases) || t.phases.includes(phase());

  // ---------- the door: always Omnipotence (Powers once time runs); a tap opens the row, or closes everything ----------
  const door = h('button', 'isl btn door');
  door.type = 'button';
  door.addEventListener('click', () => {
    if (armed() || cur) { exit(); return; }
    open(phase() === 'running' ? 'powers' : 'reshape');
  });
  U.root.appendChild(door);

  // ---------- the row the door opens ----------
  const strip = h('div', 'isl strip');
  strip.setAttribute('role', 'toolbar');
  U.root.appendChild(strip);
  let cur = null;   // null | 'reshape' (Omnipotence) | 'powers'
  let path = [];    // the Omnipotence groups opened, from the top: [] the four groups; ['land', 'terrain'] Terrain's
  const node = () => path[path.length - 1] ?? tree().root;
  function open(key, to = []) {
    const was = cur;
    if (key === cur && !key) { paintDoor(); return; }
    cur = key;
    path = key === 'reshape' ? to.slice() : [];
    U.root.dataset.door = key ?? '';
    U.root.dataset.group = path.join('/');
    U.read?.set('door', !!key);
    if (key) build(key);
    strip.classList.toggle('on', !!key);
    if (key !== was) U.sfx(key ? 'ui.open' : 'ui.close');
    paintDoor();
    paintBar();
    for (const fn of U.onDoor ?? []) { try { fn(key, was, path.slice()); } catch (err) { U.warnOnce('onDoor', err); } }
  }
  // down into a group: its children in the row, its name in the bar at the top
  function into(id) { if (armed()) U.call('god', 'setTool', null); U.sfx('ui.open'); open('reshape', [...path, id]); }
  // Back (the bar at the top): one level up the tree. A tool in hand: put down (what waits for the tick goes, as
  // picking another tool does) and its group's choices shown; a group: its parent's; the Omnipotence row once time
  // runs: the Powers row; a power in hand: the Powers row
  function back() {
    const t = curTool();
    if (t) {
      const power = isPower(t);
      const f = power ? null : famOf(t.id);
      U.call('god', 'setTool', null);
      if (power || !f) open('powers');
      else open('reshape', pathTo(f.id).slice(0, -1));
      return;
    }
    if (cur === 'reshape' && path.length) { U.sfx('ui.close'); open('reshape', path.slice(0, -1)); return; }
    if (cur === 'reshape' && phase() === 'running') { open('powers'); return; }
    exit();
  }
  // Exit: the tool down and the menu shut, the plain map
  function exit() { if (armed()) U.call('god', 'setTool', null); open(null); }
  U.onDoor = [];
  // a sheet opening (a warning, a person, World, the Log) puts the row away
  U.onSlot?.push((k) => { if (k && k !== 'trade' && cur) open(null); });

  // what can be in hand (god.families): each with its tools, its parent group, and whether its one tool shows as a chip
  function families() {
    const fam = U.get('god', 'families');
    const byId = Object.fromEntries(tools().map((t) => [t.id, t]));
    let list = Array.isArray(fam) ? fam.filter((f) => !f.dock && f.id !== 'power').map((f) => ({ id: f.id, name: f.name ?? cap(f.id), key: f.hotkey ?? '', modes: (f.modes ?? []).filter((m) => byId[m]), mode: f.mode, apart: !!f.apart, subs: f.subs ?? null, parent: f.parent ?? null, chips: !!f.chips })) : [];
    if (!list.length) {
      // an older god without families: group the tools by family
      const m = new Map();
      for (const t of tools()) { if (isPower(t)) continue; const f = t.family ?? 'other'; if (!m.has(f)) m.set(f, { id: f, name: t.familyName ?? cap(f), key: t.hotkey ?? '', modes: [] }); m.get(f).modes.push(t.id); }
      list = [...m.values()];
    }
    return list.filter((f) => f.modes.length).map((f) => ({ ...f, tools: f.modes.map((m) => byId[m]) }));
  }
  const famOf = (id) => families().find((f) => f.modes.includes(id)) ?? null;
  // the Omnipotence tree (god.tree); a god without one: every family a child of the top
  function tree() {
    const t = U.get('god', 'tree');
    if (t?.nodes?.[t.root]) return t;
    return { root: 'omni', nodes: { omni: { id: 'omni', name: OMNI, kids: families().map((f) => f.id), parent: null } } };
  }
  const parentOf = (id) => { const T = tree(); return Object.values(T.nodes).find((n) => n.kids.includes(id))?.id ?? null; };
  // the groups from the top down to a family or group: pathTo('frozen') = ['land', 'terrain', 'frozen']
  function pathTo(id) { const T = tree(), out = []; for (let k = id, i = 0; k && k !== T.root && i < 12; k = parentOf(k), i++) out.unshift(k); return out; }
  // what a child of a group is: a group (more choices) or a family (tools: in hand); its name, sign and words
  function child(id) {
    const T = tree(), n = T.nodes[id];
    if (n) return { id, group: true, name: n.name, hint: INFO[`g:${id}`]?.desc ?? n.hint ?? '', key: n.hotkey ?? '', last: n.last, fams: famsUnder(id) };
    const f = families().find((x) => x.id === id);
    return f ? { id, group: false, name: f.name, hint: INFO[id]?.desc ?? f.tools[0]?.hint ?? '', key: f.key, apart: f.apart, fam: f, fams: [f] } : null;
  }
  function famsUnder(id) { const T = tree(), n = T.nodes[id]; if (!n) { const f = families().find((x) => x.id === id); return f ? [f] : []; } return n.kids.flatMap(famsUnder); }
  // where the next tap goes to bring a family into the hand (the lessons' ring follows it): a selector
  function nextTap(famId) {
    const t = curTool();
    const want = pathTo(famId);
    if (t && famOf(t.id)?.id === famId) return null;
    if (t) return '.topbar [data-act="back"]';
    if (!cur) return '.door';
    if (cur === 'powers') return '.strip [data-fam="reshape"]';
    const ok = path.every((k, i) => want[i] === k);
    if (!ok) return '.topbar [data-act="back"]';
    return `.strip [data-node="${want[path.length]}"]`;
  }
  const last = {};
  function pickFamily(f) {
    const avail = f.tools.filter(inPhase);
    const want = avail.find((t) => t.id === last[f.id]) ?? avail.find((t) => t.id === f.mode) ?? avail[0];
    if (want) U.call('god', 'setTool', want.id);
  }
  // a tool or a power in the row: its clay seal over its name (a power round, an Omnipotence tool a pillow square)
  const tb = (cls, ic, label, kind) => {
    const b = h('button', `btn tb ${cls}`, `${kind ? sealIcon(ic, 32, kind) : icon(ic, 26)}<span>${esc(label)}</span>`);
    b.type = 'button';
    return b;
  };
  function build(key) {
    strip.innerHTML = '';
    strip.dataset.kind = key;
    const row = h('div', 'st-row');
    if (key === 'reshape') {
      // the children of the group open now (the top: Land, Water, Life, then Erase apart): a group shows its own
      // children in its place; a family is taken in hand
      const T = tree(), n = T.nodes[node()];
      strip.dataset.group = node();
      for (const id of n?.kids ?? []) {
        const c = child(id);
        if (!c) continue;
        const b = tb('st-node', icOf(c.group ? `g:${id}` : id, id), c.name, 'tool');
        b.dataset.node = id;
        if (!c.group) b.dataset.fam = id;
        if (c.apart) row.appendChild(h('span', 'st-div'));
        if (n.last === id) b.classList.add('last');
        setDisabled(b, !c.fams.some((f) => f.tools.some(inPhase)));
        tip(b, c.name, c.hint, c.key);
        b.addEventListener('click', () => { if (c.group) into(id); else pickFamily(c.fam); });
        row.appendChild(b);
      }
      if (phase() !== 'running' && !path.length) { row.appendChild(h('span', 'st-div')); row.append(histBtn('undo'), histBtn('redo')); }
      strip.appendChild(row);
    } else {
      strip.dataset.group = '';
      // the word is wider than a tile: it may break as Omni-potence (a soft hyphen), never be cut off (phone run, 2026-11-17)
      const rs = tb('st-reshape', 'reshape', 'Omni­potence', 'power');
      rs.setAttribute('aria-label', OMNI);
      rs.dataset.fam = 'reshape';
      tip(rs, OMNI, 'The land itself: shape and paint the ground, build caves, bring rivers and lakes, grow plants, place animals.');
      rs.addEventListener('click', () => open('reshape'));
      row.appendChild(rs);
      for (const t of tools().filter(isPower)) {
        const ic = t.power?.icon && hasIcon(t.power.icon) ? t.power.icon : hasIcon(t.id) ? t.id : 'dot';
        const b = tb('st-power', ic, t.name, 'power');
        b.dataset.tool = t.id;
        if (t.power?.confirm === 'hold') b.classList.add('harsh');
        b.addEventListener('click', () => { if (!b.classList.contains('why')) U.call('god', 'setTool', t.id); });
        row.appendChild(b);
      }
      strip.appendChild(row);
    }
    sync();
    syncHist();
  }

  // ---------- the bar at the top centre: Back, where you are, Exit (the director, 2026-11-15: "players need to see
  // the tool in the center top of the screen") ----------
  const bar = h('div', 'isl topbar');
  bar.dataset.hudBlock = '';
  bar.setAttribute('role', 'toolbar');
  bar.innerHTML = `<button class="btn tbar-b" type="button" data-act="back">${sign('undo', 20)}<span>Back</span></button><span class="tbar-here"></span><button class="btn tbar-b" type="button" data-act="exit">${sign('close', 20)}<span>Exit</span></button>`;
  tip(bar.querySelector('[data-act="back"]'), 'Back', 'One step back up the menu. A tool in hand is put down.', '');
  tip(bar.querySelector('[data-act="exit"]'), 'Exit', 'Put the tool down and close the menu.', 'Esc');
  bar.querySelector('[data-act="back"]').addEventListener('click', () => back());
  bar.querySelector('[data-act="exit"]').addEventListener('click', () => exit());
  U.root.appendChild(bar);
  function paintBar() {
    const t = curTool();
    let ic = null, label = '';
    if (t) {
      const power = isPower(t);
      ic = power ? (t.power?.icon && hasIcon(t.power.icon) ? t.power.icon : 'strike') : (MODE_SIGN[t.id] && hasIcon(MODE_SIGN[t.id]) ? MODE_SIGN[t.id] : icOf(famOf(t.id)?.id, famOf(t.id)?.id ?? 'land'));
      label = t.name;
    } else if (cur === 'reshape' && path.length) { const id = node(); ic = icOf(`g:${id}`, id); label = tree().nodes[id]?.name ?? cap(id); }
    else if (cur === 'reshape' && phase() === 'running') { ic = 'reshape'; label = OMNI; }
    const on = !!label && !U.titleOn;
    const html = on ? `${icon(ic, 22)}<b>${esc(label)}</b>` : '';
    const here = bar.querySelector('.tbar-here');
    if (here._html !== html) { here._html = html; here.innerHTML = html; }
    bar.classList.toggle('on', on);
    bar.dataset.at = t ? 'tool' : on ? 'group' : '';
    placeBar();
  }
  // the bar keeps clear of the lesson's line, the time box, the tokens and the menu: if it would touch one it steps
  // down below it (never smaller)
  const NEAR = '.lesson.on, .tbox, .rail, .menub, .logb, .compass, .tokens, .sheet.on';
  function placeBar() {
    if (!bar.classList.contains('on')) return;
    bar.style.top = ''; bar.style.left = '';
    // the side sheet open (a power's price, a person): the bar centres in the map left of it
    const sh = [...U.root.querySelectorAll('.sheet.on')].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (sh) { const sl = sh.getBoundingClientRect().left, bw = bar.offsetWidth; bar.style.left = `${Math.round(Math.max(bw / 2 + 8, (sl - 8) / 2))}px`; }
    for (let i = 0; i < 4; i++) {
      const b = bar.getBoundingClientRect();
      let low = null;
      for (const e of U.root.querySelectorAll(NEAR)) {
        if (e === bar || bar.contains(e) || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.left < b.right + 6 && r.right > b.left - 6 && r.top < b.bottom + 6 && r.bottom > b.top - 6) low = Math.max(low ?? 0, r.bottom);
      }
      if (low == null) break;
      bar.style.top = `${Math.round(low + 8)}px`;
    }
  }
  function histBtn(k) {
    const b = h('button', `btn ico h-${k}`, icon(k, 22));
    b.type = 'button';
    b.setAttribute('aria-label', k === 'undo' ? 'Undo' : 'Redo');
    tip(b, k === 'undo' ? 'Undo' : 'Redo', k === 'undo' ? 'Take back your last change to the land.' : 'Put back what you took back.', k === 'undo' ? 'Ctrl+Z' : 'Ctrl+Y');
    b.addEventListener('click', () => { U.call('god', k); syncHist(); });
    return b;
  }
  function syncHist() {
    const can = { undo: !!U.call('god', 'canUndo'), redo: !!U.call('god', 'canRedo') };
    for (const b of U.root.querySelectorAll('.h-undo, .h-redo')) setDisabled(b, !can[b.classList.contains('h-undo') ? 'undo' : 'redo']);
  }
  // which powers can do something now (a power with nothing to aim at is greyed with the reason)
  function sync() {
    if (cur !== 'powers') return;
    const animals = U.get('sim', 'animals'), people = U.get('sim', 'people');
    const anyAlive = { animal: Array.isArray(animals) && animals.some((a) => !a.dead), person: (people ?? []).some((p) => !p.dead && !p.hidden), clan: (U.s2?.clans()?.length ?? 0) > 0 };
    const qp = U.sim()?.ask?.('quietPowers') ?? null;
    let quietNo = '';
    if (qp?.always?.length && Number.isFinite(qp.faith)) {
      const grown = (people ?? []).filter((p) => !p.dead && !p.hidden && p.stage !== 'child' && p.family?.state === 'settled');
      const avg = grown.length ? grown.reduce((s, p) => s + (Number(p.faith) || 0), 0) / grown.length : 0;
      if (grown.length && avg < qp.faith) quietNo = `Will not take: your people's faith is ${Math.round(avg)} on average, under ${qp.faith}. Quiet powers work only on people who believe.`;
    }
    const byId = Object.fromEntries(tools().map((t) => [t.id, t]));
    for (const b of strip.querySelectorAll('.st-power')) {
      const t = byId[b.dataset.tool];
      if (!t) continue;
      const okPhase = inPhase(t);
      const kinds = [].concat(t.power?.target ?? []);
      const needs = kinds.filter((k) => NEEDS[k]);
      const none = okPhase && !!U.sim() && kinds.length > 0 && needs.length === kinds.length && !needs.some((k) => anyAlive[k]);
      b.classList.toggle('why', !okPhase || none);
      setAttr(b, 'aria-disabled', String(!okPhase || none));
      const why = !okPhase ? 'This power wakes once time runs.' : none ? (t.id === 'strike' ? 'Nothing to strike yet.' : NONE_TEXT[needs[0]] ?? 'Nothing to aim it at yet.') : '';
      const wont = !why && quietNo && qp.always.includes(t.id) ? quietNo : '';
      b.classList.toggle('wont', !!wont);
      tip(b, t.power?.tip ?? t.name, why || wont || t.hint || '', t.hotkey || '', why || wont ? '' : t.power?.confirm === 'hold' ? 'A harsh one: you press and hold to do it.' : '');
    }
  }

  // ---------- in hand ----------
  const modes = h('div', 'isl modes');        // a Reshape tool's modes, beside the door
  modes.setAttribute('role', 'group');
  const hist = h('div', 'isl hist');          // Undo and Redo, above the door
  const knobs = h('div', 'isl knobs');        // the tool's settings, on the map above the right corner
  const pknobs = h('div', 'isl knobs pknobs'); // a power's own setting, above the door
  U.root.append(modes, hist, knobs, pknobs);
  // the god's own tick, cross and turn buttons on the map keep clear of these
  for (const x of [door, strip, modes, hist, knobs, pknobs]) x.dataset.hudBlock = '';
  hist.append(histBtn('undo'), histBtn('redo'));
  let built = '', moreModes = false, optPage = 0;
  function optionsOf(t) {
    let o = t.options;
    if (o && !Array.isArray(o) && typeof o === 'object') o = Object.entries(o).map(([name, v]) => (v && typeof v === 'object' ? { name, ...v } : { name, value: v }));
    return Array.isArray(o) ? o.map((x) => (typeof x === 'string' ? { name: x } : { ...x })).map((x) => ({ ...x, name: x.name ?? x.id ?? x.key })) : [];
  }
  const isBool = (o) => typeof o.value === 'boolean' || o.type === 'bool';
  function setOpt(name, value) {
    if (typeof U.god()?.setOption === 'function') U.call('god', 'setOption', name, value);
    else if (name === 'size' || name === 'strength') U.call('god', 'setBrush', { [name]: value });
  }
  const fmt = (o, v) => (Number.isFinite(v) ? (Array.isArray(o.names) && o.names[Math.round(v - (o.min ?? 0))] != null ? o.names[Math.round(v - (o.min ?? 0))] : String(Math.round(v * 10) / 10)) : '-');
  function stepper(o) {
    const w = h('span', 'step');
    w.dataset.opt = o.name;
    const label = o.label ?? cap(o.name);
    w.innerHTML = `<button class="btn st-m" type="button" aria-label="${esc(label)} less">${icon('minus', 18)}</button><span class="sl">${esc(label)}</span><b></b><button class="btn st-p" type="button" aria-label="${esc(label)} more">${icon('plus', 18)}</button>`;
    if (o.hint) tip(w, label, o.hint);
    const nudge = (d) => {
      const spec = optionsOf(curTool() ?? {}).find((x) => x.name === o.name) ?? o;
      const step = Number(spec.step) || 1, v = Number(spec.value) || 0;
      const nv = Math.max(spec.min ?? -Infinity, Math.min(spec.max ?? Infinity, Math.round((v + d * step) / step) * step));
      setOpt(o.name, +nv.toFixed(3));
    };
    w.querySelector('.st-m').addEventListener('click', () => nudge(-1));
    w.querySelector('.st-p').addEventListener('click', () => nudge(1));
    w._set = (spec) => {
      setText(w.querySelector('b'), fmt(spec, Number(spec.value)));
      setDisabled(w.querySelector('.st-m'), Number(spec.value) <= (spec.min ?? -Infinity));
      setDisabled(w.querySelector('.st-p'), Number(spec.value) >= (spec.max ?? Infinity));
    };
    w._set(o);
    return w;
  }
  function toggle(o) {
    const b = h('button', 'btn chip ch-bool');
    b.type = 'button'; b.dataset.opt = o.name;
    const label = o.label ?? cap(o.name);
    if (o.hint) tip(b, label, o.hint);
    b.addEventListener('click', () => setOpt(o.name, !(b.getAttribute('aria-pressed') === 'true')));
    b._set = (spec) => { const on = !!spec.value; b.innerHTML = `${icon(on ? 'met' : 'open', 18)}<span>${esc(label)}</span>`; b.classList.toggle('on', on); setAttr(b, 'aria-pressed', String(on)); };
    b._set(o);
    return b;
  }
  const curTool = () => { const id = armed(); return id ? tools().find((x) => x.id === id) ?? null : null; };
  function renderHand() {
    const t = curTool();
    const power = isPower(t);
    const run = phase() === 'running';
    U.root.dataset.hand = !t ? '' : power ? 'power' : 'tool';
    U.read?.set('tool', !!t);
    if (!t) {
      if (built) { built = ''; for (const x of [modes, hist, knobs, pknobs]) { x.classList.remove('on'); x.innerHTML = x === hist ? x.innerHTML : ''; } }
      paintDoor();
      return;
    }
    const f = power ? null : famOf(t.id);
    const opts = optionsOf(t);
    const ranges = opts.filter((o) => !isBool(o)).sort((a, b) => (FIRST_OPTS.indexOf(a.name) + 1 || 99) - (FIRST_OPTS.indexOf(b.name) + 1 || 99));
    const bools = opts.filter(isBool);
    const key = `${t.id}|${f?.id}|${f?.modes.join(',')}|${opts.map((o) => o.name).join(',')}|${run}|${moreModes}|${optPage}`;
    if (key !== built) {
      built = key;
      modes.innerHTML = ''; knobs.innerHTML = ''; pknobs.innerHTML = '';
      // the modes, in one row beside the door (wrapping upward if the window is narrow)
      if (f && (f.tools.length > 1 || bools.length || f.chips)) {
        let list = f.tools;
        const many = list.length > MODES_MAX && !moreModes;
        if (many) { list = list.slice(0, MODES_MAX - 1); if (!list.includes(t)) list[list.length - 1] = t; }
        let lastSub = null;
        for (const m of list) {
          if (f.tools.length < 2 && !f.chips) break;
          if (m.sub && m.sub !== lastSub && f.subs) { modes.appendChild(h('span', 'md-sub', esc(m.sub))); lastSub = m.sub; }
          const b = h('button', 'btn chip md', `${MODE_SIGN[m.id] ? sign(MODE_SIGN[m.id], 22) : ''}<span>${esc(m.name)}</span>`);
          b.type = 'button'; b.dataset.tool = m.id;
          setDisabled(b, !inPhase(m));
          tip(b, m.name, inPhase(m) ? (m.hint ?? '') : 'Wakes once time runs.', m.modeKey ?? '');
          b.addEventListener('click', () => U.call('god', 'setTool', m.id));
          modes.appendChild(b);
        }
        if (f.tools.length > MODES_MAX) {
          const mb = h('button', 'btn chip md-more', `<span>${moreModes ? 'Fewer' : `More (${f.tools.length - MODES_MAX + 1})`}</span>`);
          mb.type = 'button';
          mb.addEventListener('click', () => { moreModes = !moreModes; renderHand(); });
          modes.appendChild(mb);
        }
        for (const o of bools) modes.appendChild(toggle(o));
        if (f.id && f.tools.length > 1) modes.setAttribute('aria-label', `${f.name}: what a press does`);
      }
      // its settings: on the map, lined up, the same width; three at most at once
      const box = power ? pknobs : knobs;
      const per = 3, pages = Math.max(1, Math.ceil(ranges.length / per));
      if (optPage >= pages) optPage = 0;
      const shown = ranges.length > per ? ranges.slice(optPage * (per - 1), optPage * (per - 1) + per - 1) : ranges;
      for (const o of shown) box.appendChild(stepper(o));
      if (ranges.length > per) {
        const mb = h('button', 'btn chip k-more', `${icon('sliders', 18)}<span>More settings</span>`);
        mb.type = 'button';
        mb.addEventListener('click', () => { optPage = (optPage + 1) % Math.ceil(ranges.length / (per - 1)); renderHand(); });
        box.appendChild(mb);
      }
      // (every Omnipotence tool previews first: the god module draws its own tick and cross beside the see-through change, and keeps
      // them clear of everything here that carries data-hud-block)
      for (const x of [modes, knobs, pknobs]) x.classList.toggle('on', x.children.length > 0);
      // Undo and Redo: before time starts for the land itself, at any time for strokes still waiting for the tick
      hist.classList.toggle('on', !power);
      if (power) armFx();
    }
    // live values
    for (const o of ranges) (power ? pknobs : knobs).querySelector(`.step[data-opt="${CSS.escape(o.name)}"]`)?._set?.(o);
    for (const o of bools) modes.querySelector(`.ch-bool[data-opt="${CSS.escape(o.name)}"]`)?._set?.(o);
    for (const b of modes.querySelectorAll('.md[data-tool]')) { const on = b.dataset.tool === t.id; b.classList.toggle('on', on); setAttr(b, 'aria-pressed', String(on)); }
    syncHist();
    paintDoor();
  }
  function paintDoor() {
    const t = curTool();
    const run = phase() === 'running';
    // the door stays the door (2026-11-15): Omnipotence, or Powers once time runs; what is in hand shows in the bar at
    // the top. Lit while its menu or a tool is open; a tap then closes everything
    const ic = run ? 'hand' : 'reshape', label = run ? 'Powers' : OMNI;
    const html = `${icon(ic, 26)}<span class="dl">${esc(label)}</span>`;
    if (door._html !== html) { door._html = html; door.innerHTML = html; }
    door.dataset.door = run ? 'powers' : 'reshape';
    const open_ = !!cur || !!t;
    door.classList.toggle('on', open_);
    setAttr(door, 'aria-label', open_ ? `Close ${label}` : label);
    setAttr(door, 'aria-expanded', String(open_));
    tip(door, label, open_ ? 'Tap to close it and put the tool down.' : run ? 'Omnipotence over the land, and every other power you have.' : 'Shape the land before time starts.', open_ ? 'Esc' : '');
    setHidden(door, !!U.titleOn);
    // the door is as wide as its word: the row, the modes and Undo and Redo stand beside it wherever it ends
    const w = door.offsetWidth;
    if (w && w !== door._w) { door._w = w; U.root.style.setProperty('--doorx', `${w}px`); }
    paintBar();
  }

  // ---------- events ----------
  U.on('god:tool', ({ id } = {}) => {
    const t = id ? tools().find((x) => x.id === id) : null;
    if (t && !isPower(t)) { const f = famOf(id); if (f) last[f.id] = id; }
    moreModes = false; optPage = 0;
    // the choice is made: the row gets out of the way of the world
    if (id && cur) open(null);
    renderHand();
    U.sfx(id ? (t && isPower(t) ? 'power.arm' : 'tool.arm') : 'tool.drop');
  });
  U.on('god:brush', () => renderHand());
  U.on('god:options', () => renderHand());
  // what waits for the tick: the first strokes say how it works; from the second stroke on the tick pulses once,
  // gently, so nobody loses work by picking another tool (only the tick keeps it)
  let pendN = 0;
  U.on('god:pending', (p) => {
    syncHist();
    const n = Number(p?.strokes) || 0;
    if (n === 1 && pendN === 0 && (U.settings.seen.pendingHint ?? 0) < 3) { U.settings.seen.pendingHint = (U.settings.seen.pendingHint ?? 0) + 1; U.saveSettings(); U.hint?.('The tick keeps it. Picking another tool drops it.', 4500); }
    if (n >= 2 && n > pendN && !U.fx?.reduce?.()) {
      const ok = document.querySelector('.god-ghost-pending [data-ghost="ok"]');
      ok?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', boxShadow: '0 0 0 6px rgba(229, 174, 60, 0.45)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
    }
    pendN = n;
  });
  U.on('god:applied', () => syncHist());
  U.on('god:history', () => syncHist());
  U.on('phase', () => { if (cur) open(null); built = ''; renderHand(); });
  U.on('edit', () => syncHist());
  // a power taken up: the door flares once (transform only)
  function armFx() {
    if (U.fx?.reduce?.()) return;
    door.classList.remove('flare'); void door.offsetWidth; door.classList.add('flare');
  }
  // the god's list changed (a power registered): the open row is drawn again
  let sig = null;
  const signature = () => tools().map((t) => `${t.id}:${t.family ?? t.group}:${(t.phases ?? []).join('+')}`).join('|');
  U.slow.push(() => {
    const s = signature();
    if (s !== sig) { sig = s; built = ''; if (cur) build(cur); }
    if (cur === 'powers') sync();
    if (armed()) renderHand(); else paintDoor();
  });
  U.on('god:powers', () => { sig = null; });
  addEventListener('resize', () => placeBar());
  renderHand();
  return { door, strip, bar, open, into, back, exit, nextTap, pathTo, tree, get cur() { return cur; }, get path() { return path.slice(); }, get group() { return cur === 'reshape' ? path[path.length - 1] ?? null : null; }, families, render: renderHand };
}
