// Island G, the inspector (UI-GUIDE 5.7), and selection. With no tool armed a
// left click selects what was under the pointer at mouse-down (a person beats
// an animal beats anything else; people and animals get a 28 px screen hit
// circle); empty ground clears. ctx.core.select records it for the engine, a
// gold ring under the feet marks it, and the panel fills from sim.inspect at
// 4 Hz. Follow (F) keeps the camera on a person until any pan input.
// Stage 2: a person reads in priority order so it never becomes a wall of text:
//   head      name, age and role, and a row of chips: clan (colour, mark, name),
//             sick, wounded, whispered, leaning on you, your favourite
//   always    what they are doing now, home, the three meters
//   tabs      Mind (thinking, thoughts you gave and where they came from, what they
//             obey), Fate (if you do nothing, and what changed it), Life (the story),
//             Clan, More (any other section), Give a thought (thought.js)
// Sections the simulation sends (inspect().sections: { id, title, rows|lines, order,
// tab? }) go to the tab their id suggests (or the one they name); the HUD's own
// sections (registry.js, { tab, tabLabel }) likewise. Clans and villages are
// selections too (showClan): members, village, faith, grudges.
import { h, icon, hasIcon, tip, esc, cap, markSvg, yearLabel, setHidden, setAttr, setData, setText as putText, sign } from './dom.js';
import { hasSign } from './signs.js';
import { makeOutline } from './outline.js';

// people and animals win over fields and ground within this screen radius (UI-GUIDE: at least 28 px)
const HIT = 30;
// six panes inside, three tabs on show (round 2, the mock-ups' Mind, Life, Give): Life holds the fate, what changed
// it and the life so far, then a fold "More about them" with the clan and every other section, so nothing is lost
const TABS = [['mind', 'Mind'], ['fate', 'Fate'], ['life', 'Life'], ['clan', 'Clan'], ['more', 'More'], ['give', 'Give a thought']];
const SHOWN = [['mind', 'Mind'], ['life', 'Life'], ['give', 'Give a thought']];
// the director's chosen signs on the tabs
const TAB_SIGN = { mind: 'mind', life: 'life', give: 'thought' };
const GROUP = { mind: 'mind', fate: 'life', life: 'life', clan: 'life', more: 'life', give: 'give' };
// which tab a section belongs to, by its id
const tabOf = (s) => {
  if (s.tab && TABS.some(([id]) => id === s.tab)) return s.tab;
  const id = String(s.id ?? '');
  if (/clan|village|grudge|kin|tribe/i.test(id)) return 'clan';
  if (/health|sick|fever|wound|hurt|fate|future|trouble|turn|hangs/i.test(id) || /hangs on this life/i.test(String(s.title ?? ''))) return 'fate';
  if (/mind|thought|given|obey|command|belief|idea|whisper|think|science/i.test(id)) return 'mind';
  if (/story|life|past|strong|line|pray/i.test(id)) return 'life';   // (forces: why they are strong, their line, praying)
  return 'more';
};
const heat = (v) => (v >= 0.75 ? 'boiling over' : v >= 0.5 ? 'hot' : v >= 0.25 ? 'simmering' : v > 0.02 ? 'a little' : 'none');

export function makeInspect(U) {
  const { ctx } = U;
  const canvas = ctx.dom.canvas;
  const el = h('div', 'insp');
  el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Selected');
  // the name, the four meters and the tabs stay in view; what the tab holds scrolls under them; the powers that would
  // act on this one stand at the foot, in view
  el.innerHTML = `<div class="ph zz in-head"><span class="badge in-ic"></span><div class="pw in-t"><div class="pt in-name"></div></div>
      <button class="btn ico quiet in-follow" type="button" aria-label="Follow">${icon('follow', 20)}</button><button class="btn ico quiet in-x" type="button" aria-label="Close">${icon('close', 20)}</button></div>
    <div class="in-row2"><div class="in-sub"></div><button class="btn chip in-walk" type="button" aria-label="Walk here" hidden>${icon('people', 18)}<span>Walk here</span></button></div>
    <div class="in-meters"></div>
    <div class="in-tabs tabs" role="tablist" aria-label="About them"></div>
    <div class="in-body">
    <div class="in-chips"></div>
    <div class="in-now"></div>
    <div class="in-home"></div>
    <div class="in-pane" data-tab="mind">
      <section class="in-sec in-think"><h3 class="in-h">Thinking</h3><div class="in-thought"><span class="it-face on"></span><span class="it-face"></span></div><h3 class="in-h in-earlier">Earlier</h3><ul class="in-thoughts"></ul></section>
      <section class="in-sec in-given"><h3 class="in-h">Thoughts you gave</h3><ul class="in-givens"></ul></section>
    </div>
    <div class="in-pane" data-tab="fate">
      <section class="in-sec in-fate"><h3 class="in-h">Fate, if you do nothing</h3><ul class="in-fates"></ul></section>
      <section class="in-sec in-changed"><h3 class="in-h">What changed it</h3><ul class="in-changes"></ul></section>
    </div>
    <div class="in-pane" data-tab="life"><section class="in-sec in-life"><h3 class="in-h">Life so far</h3><ul class="in-story"></ul></section></div>
    <details class="in-fold"><summary class="in-fold-s">More about them</summary>
      <div class="in-pane" data-tab="clan"></div>
      <div class="in-pane" data-tab="more"></div>
    </details>
    <div class="in-pane" data-tab="give"></div>
    <div class="in-spacer" aria-hidden="true"></div>
    <div class="in-give" hidden></div>
    <div class="in-acts acts-row" role="group" aria-label="Your powers on them"></div>
    </div>`;
  // the inspector lives in the detail slot on the right (slot.js): one thing at a time
  if (U.slot) U.slot.add('select', el); else U.root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const pane = (t) => el.querySelector(`.in-pane[data-tab="${t}"]`);
  tip($('.in-x'), 'Close', '', 'Esc');
  $('.in-x').addEventListener('click', () => select(null));
  $('.in-follow').addEventListener('click', () => toggleFollow());
  // walking among the people (walk.js): set down beside whatever this card is about, facing it
  $('.in-walk').addEventListener('click', () => { const e = sel; if (e) U.walk?.enterAt(e); });
  tip($('.in-walk'), 'Walk here', 'Go down among them and walk, unseen. Leave brings you back up.');
  const outline = makeOutline(U);
  const ringEl = h('div', 'selring');
  const hovEl = h('div', 'hovring');
  setHidden(hovEl, true);
  U.world.append(hovEl, ringEl);

  const meters = $('.in-meters');
  const body = $('.in-body');
  el.querySelector('.in-thoughts').addEventListener('animationend', (ev) => ev.currentTarget.classList.remove('fresh'));
  const M = {};
  for (const [k, ic, label] of [['happiness', 'happy', 'Happy'], ['faith', 'faith', 'Faith'], ['skepticism', 'skepticism', 'Skepticism'], ['strength', 'strength', 'Strength']]) {
    const d = h('div', `meter meter-${k}`);
    d.innerHTML = `<span class="mt-ic">${icon(ic, 16)}</span><span class="mt-l">${label === 'Skepticism' ? 'Skeptic' : label}</span><span class="mt-bar"><i class="mt-lost"></i><i class="mt-fill"></i></span><span class="mt-v">-</span>`;
    tip(d, label, k === 'happiness' ? 'How content this person is, 0 to 100. Solid bar.' : k === 'faith' ? 'How much they believe, 0 to 100. Hatched bar. It moves only when they see you act.' : k === 'strength' ? 'How hard they are, 0 to 100: hardship come through, hunting, fights. Wins fights and survives bad years.' : 'How much they question, 0 to 100. Dotted bar. Questions bring discoveries.');
    meters.appendChild(d);
    M[k] = { d, fill: d.querySelector('.mt-fill'), lost: d.querySelector('.mt-lost'), v: d.querySelector('.mt-v'), last: null };
  }

  // a turning point (the choices agent; the name is guarded): a person in ask('turningPoints'), or whose
  // inspect has a section "What hangs on this life"
  let tpT = 0, tpSet = new Set();
  function turning(p) {
    const now = performance.now();
    if (now - tpT > 1000) {
      tpT = now;
      const raw = U.call('sim', 'ask', 'turningPoints');
      tpSet = new Set((Array.isArray(raw) ? raw : []).map((x) => x?.person ?? x));
    }
    return tpSet.has(p) || (info?.sections ?? []).some((s) => /turn|hangs/i.test(String(s.id ?? '')) || /hangs on this life/i.test(String(s.title ?? '')));
  }
  U.isTurning = turning;
  let sel = null, info = null, following = false, follow = null;
  let tabPref = 'mind', tabsKey = '';
  const usableCache = new Map(); // power id -> { sel, t, ok, why }: may this power act on the selection now
  // Steadiness (the director: the thoughts "keep moving up and down making it impossible to read"). While the
  // panel is open on one selection nothing in it may move: its outer height is fixed for a person (CSS), every
  // part only ever grows (grow-only min-heights, reset when the selection changes), tabs and power buttons that
  // have shown stay (an empty tab says so, a power that cannot act now is greyed with the reason), text is
  // patched in place, and the thought on show is held long enough to read (the simulation may think faster).
  let uiT = 0, steadyFor = null;     // real seconds, from the HUD's frames; the selection the steadiness is for
  const seenTabs = new Set(), offered = new Map(); // for this selection: tabs shown, power buttons shown (id -> tool)
  const TH = { sel: null, text: '', from: '', year: null, at: 0, face: 0, log: [] };
  const readFor = (t) => Math.min(9, Math.max(4.5, 1.5 + String(t).split(/\s+/).length * 0.35)); // seconds to read it
  const STEADY = '.in-chips, .in-now, .in-home, .in-ext, .in-sec, .in-fates, .in-changes, .in-story, .in-givens, .in-acts, .in-reg';
  function unsteady() { for (const n of el.querySelectorAll('[data-steady]')) { n.style.minHeight = ''; delete n.dataset.steady; } el.style.minHeight = ''; paneMin = 0; const sp = el.querySelector('.in-spacer'); if (sp) sp.style.height = ''; }
  let paneMin = 0;
  // grow-only: what has been this tall stays this tall while the panel shows the same selection
  function steady() {
    for (const n of el.querySelectorAll(STEADY)) {
      if (n.hidden || n.closest('[hidden]')) continue;
      const hgt = n.offsetHeight, was = Number(n.dataset.steady) || 0;
      if (hgt > was + 0.5) { n.dataset.steady = String(hgt); n.style.minHeight = `${hgt}px`; }
    }
    // every tab's pane is as tall as the tallest shown so far, so changing tab never shortens the panel's
    // content (which would make the browser pull the scroll back and everything jump)
    // (a tab now shows several panes and a fold: the space they take together only grows, held by a spacer under them)
    const vis = [...el.querySelectorAll('.in-pane, .in-fold')].filter((p) => !p.hidden && (p.classList.contains('in-fold') || !p.closest('.in-fold')));
    if (vis.length) {
      const hgt = vis.reduce((s, p) => s + p.offsetHeight, 0);
      if (hgt > paneMin + 0.5) paneMin = hgt;
      const sp = el.querySelector('.in-spacer');
      const want = `${Math.max(0, Math.round(paneMin - hgt))}px`;
      if (sp && sp.style.height !== want) sp.style.height = want;
    }
    // the panel itself (people have a fixed height in CSS; animals, huts and the rest only grow)
    if (el.dataset.kind !== 'person') { const hgt = el.offsetHeight; if (hgt > (parseFloat(el.style.minHeight) || 0) + 0.5) el.style.minHeight = `${hgt}px`; }
  }

  // ---------- picking ----------
  const visible = (e) => e && !e.dead && (!e.hidden || e.xray) && !e.removed && !e.deleted && Number.isFinite(e.x);
  // the hit circle grows with the zoom so a close-up figure is easy too; measured to the feet and the
  // middle of the body, whichever is nearer (in a plan view they are one point, tilted they are not)
  const hitR = () => Math.max(HIT, Math.min(60, (ctx.camera.ppm || 0) * 1.3));
  function nearest(list, px, py, r = hitR()) {
    let best = null, bd = r;
    for (const e of list ?? []) {
      if (!visible(e)) continue;
      const y = e.y ?? 16;
      const a = ctx.camera.toScreen(e.x, y + 0.9, e.z), b = ctx.camera.toScreen(e.x, y, e.z);
      if (a.behind) continue;
      const d = Math.min(Math.hypot(a.x - px, a.y - py), Math.hypot(b.x - px, b.y - py));
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // deep: also a whole tree, water body, bush clump, rock or ground cell (god.look), only on a click
  function pickAt(px, py, deep = false) {
    const p = nearest(U.get('sim', 'people'), px, py);
    if (p) return p;
    const a = nearest(U.get('sim', 'animals'), px, py);
    if (a) return a;
    let e = null;
    try { e = ctx.pick?.entity?.(px, py) ?? null; } catch { e = null; }
    if (e && (e.cat === 'holy' || e.cat === 'building' || e.cat === 'person' || e.cat === 'animal' || e.kind === 'stone')) return e;
    if (!deep) return null;
    const t = U.call('god', 'look', px, py);
    // bare ground or rock is not a thing to read: a stray click on it opens nothing and never holds time
    // (round 2: a "Grass / Ground" card paused the game); the Pick tool still reports the ground
    if (!t || t.kind === 'ground' || t.kind === 'rock') return null;
    return { kind: 'thing', thing: t, name: t.name, x: t.x, y: t.y ?? t.top ?? 16, z: t.z };
  }

  let down = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || U.get('god', 'tool') || !ctx.controls.enabled) return;
    down = { x: ev.clientX, y: ev.clientY, t: performance.now(), e: pickAt(ev.clientX, ev.clientY, true) };
  });
  addEventListener('pointerup', (ev) => {
    const d = down; down = null;
    if (!d || ev.button !== 0) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return;
    open(d.e);
  });
  // a tap on someone: the camera travels to them in a fixed time first (nothing teleports), then they open; a
  // tap on nothing closes what was open, and the view stays where it is
  function open(e) {
    if (!e || e.kind === 'clan' || !Number.isFinite(e.x)) { select(e); return; }
    U.glide(e.x, e.z, { y: e.y, then: () => select(e) });
  }
  // hover: the engine's outline on what a click would select
  let hoverT = 0, hoverAt = null;
  canvas.addEventListener('pointermove', (ev) => { hoverAt = { x: ev.clientX, y: ev.clientY }; });
  canvas.addEventListener('pointerleave', () => { hoverAt = null; setHover(null); });
  let hov = null;
  function setHover(e) {
    const core = ctx.core;
    // a person or an animal under the pointer gets a white ring at the feet, so the player knows who a click gets
    hov = e && (e.kind === 'person' || e.cat === 'animal') ? e : null;
    if (!core || core.hover === e) return;
    core.hover = e && e.registered !== false ? e : null;
    if (ctx.overlay) ctx.overlay.dirty = true;
    if (!U.get('god', 'tool') && !ctx.controls.down) canvas.style.cursor = e ? 'pointer' : '';
  }

  // ---------- selection ----------
  const pseudo = (e) => e && (e.kind === 'thing' || e.kind === 'clan');
  function select(e) {
    // a dead person can still be looked at (an alert about a death opens their life story)
    if (e && !visible(e) && !(e.cat === 'holy' || e.cat === 'building' || pseudo(e) || (e.kind === 'person' && e.dead))) e = null;
    sel = e;
    if (e?.kind === 'thing') outline.show(e.thing); else outline.clear();
    if (!e) stopFollow();
    try { ctx.core?.select?.(e && !pseudo(e) && e.foot && e.registered !== false && !e.removedFromCore && !e.dead ? [e] : [], 'set'); if (ctx.overlay) ctx.overlay.dirty = true; } catch (err) { U.warnOnce('core.select', err); }
    for (const k in M) M[k].last = null;
    const same = e === steadyFor;
    if (!same) { unsteady(); seenTabs.clear(); offered.clear(); tabsKey = ''; TH.sel = null; steadyFor = e; }
    if (!same) body.scrollTop = 0;
    refresh(true);
    el.classList.toggle('on', !!sel);
    if (sel) U.slot?.show('select'); else U.slot?.hide('select');
    if (e) U.sfx('ui.click');
  }
  // a clan (from the Tablet, the pins, a village name on the map) as a selection of its own
  function showClan(c) {
    if (!c) return;
    select({ kind: 'clan', clanId: c.id, name: `the ${c.name}`, x: c.village?.x, z: c.village?.z });
  }
  function toggleFollow() { if (!sel || pseudo(sel)) return; following = !following; follow = null; $('.in-follow').classList.toggle('on', following); $('.in-follow').setAttribute('aria-pressed', String(following)); }
  function stopFollow() { following = false; $('.in-follow').classList.remove('on'); $('.in-follow').setAttribute('aria-pressed', 'false'); }

  function refresh(force = false) {
    if (!sel) return;
    let r = sel.kind === 'thing' ? describe(sel.thing) : sel.kind === 'clan' ? describeClan(sel) : U.call('sim', 'inspect', sel);
    if (r == null) {
      if (sel.kind === 'clan') { select(null); return; }
      // no sim: what the entity itself says
      r = { name: sel.name ?? cap(sel.kind ?? 'something'), kind: sel.kind, role: sel.cat ?? '', doing: sel.doing ?? '', story: [] };
    }
    if (sel.dead && !force && info && info.dead) return;
    info = r;
    const person = r.kind === 'person';
    const animal = sel.cat === 'animal' || sel.kind === 'animal';
    setData(el, 'kind', person ? 'person' : animal ? 'animal' : sel.kind === 'clan' ? 'clan' : 'thing');
    setData(U.slot.el, 'sel', el.dataset.kind);
    const TIC = { tree: 'scatter', bushes: 'scatter', reeds: 'scatter', water: 'water', rock: 'land', ground: 'land', clan: 'clan' };
    const ic = person ? 'people' : animal ? (hasSign(sel.species) ? sel.species : 'paw') : r.kind === 'stone' ? 'stone' : r.kind === 'hut' ? 'hut' : r.kind === 'field' ? 'field' : TIC[r.kind] ?? 'dot';
    const icEl = $('.in-ic');
    if (icEl.dataset.ic !== ic) { icEl.innerHTML = icon(ic, 26); icEl.dataset.ic = ic; }
    setText('.in-name', r.name ?? '');
    const age = Number.isFinite(r.age) ? `${r.age}` : '';
    const role = person ? (r.role ?? '') : animal ? `${cap(r.kind ?? sel.species ?? 'animal')}, ${r.role ?? 'wild animal'}` : cap(r.role ?? '');
    setText('.in-sub', person ? [age && `${age} years old`, r.role].filter(Boolean).join(', ') : [role, animal && age ? `${age} years old` : ''].filter(Boolean).join(', '));
    // a living person keeps every row in place (empty rows keep their room); others hide what they lack
    const alive = person && !sel.dead;
    setText('.in-home', r.home ? `Home: ${r.home}` : alive ? 'Home: none yet' : '');
    setHidden($('.in-home'), !r.home && !alive);
    setText('.in-now', r.doing ? `Now: ${r.doing}` : '');
    setHidden($('.in-now'), !r.doing && !alive);
    setHidden(meters, !person || !!sel.dead);
    if (person) for (const k of ['happiness', 'faith', 'skepticism']) setMeter(k, r[k]);
    // Strength (the forces agent's inspect field): shown once it is there
    const str = person ? Number(r.strength ?? sel.strength) : NaN;
    setHidden(M.strength.d, !Number.isFinite(str));
    if (Number.isFinite(str)) setMeter('strength', str);
    chips(r, person);
    // what an all-knowing god sees: the thought now, the last few, the fate, the life so far
    const lines = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (typeof x === 'string' ? x : x?.text ?? '')).filter(Boolean);
    const thought = typeof r.thought === 'string' ? r.thought : r.thought?.text ?? '';
    const thoughtFrom = typeof r.thought === 'object' ? (r.thought?.from ?? r.thought?.source ?? '') : (sel.planted?.text === thought ? (sel.planted.from ?? '') : '');
    showThought(thought, thoughtFrom, lines(r.thoughts), !!sel.planted && sel.planted.text === thought);
    setHidden($('.in-think'), (!TH.text && !TH.log.length && !alive) || !!sel.dead);
    // thoughts the god gave, with where they came from (mind:thought-given, thought.js)
    const given = person ? (U.given?.get(sel) ?? []) : [];
    fillHtml('.in-givens', given.slice(-3).reverse().map((g) => `<span class="ig-q">"${esc(g.text)}"</span> <span class="ig-src ${g.asOwn ? 'own' : 'above'}">${g.asOwn ? 'thinks it was their own' : 'heard a voice from above'}</span>${g.changed ? ' <span class="ig-ch">it changed them</span>' : ''}`));
    setHidden($('.in-given'), !given.length);
    const fate = lines(r.fate);
    fill('.in-fates', fate.slice(0, 4));
    setHidden($('.in-fate'), !fate.length);
    // a changed fate is told in the story ("Was to die at 55 by a wolf. The wolf was struck down..."): shown with the fate
    const storyAll = lines(r.story);
    const changes = storyAll.filter((x) => /^Was to /.test(x)).slice(-3);
    fill('.in-changes', changes);
    setHidden($('.in-changed'), !changes.length);
    const story = storyAll.slice(-4);
    fill('.in-story', story);
    setHidden($('.in-life'), !story.length);
    setText('.in-life .in-h', sel.kind === 'thing' ? 'For your people' : sel.kind === 'clan' ? 'Members' : 'Life so far');
    // named sections: those the simulation's inspect extenders send (r.sections), then the HUD's own (registry.js)
    extSections(r, person);
    tabs(person && !sel.dead);
    // actions: a button for every power whose data offers one for this kind of selection (power.inspector)
    const acts = $('.in-acts');
    const k = (animal || person) && !sel.dead ? (person ? 'person' : 'animal') : '';
    const sectionFor = (id) => (U.registry?.sections?.() ?? []).find((s) => s.def.power === id);
    // only the powers that would do something to this one now (integration: nine buttons were too many options);
    // asked of the forecasts once a second, and a power with its own tab (Give a thought) always stays
    const usable = (t) => {
      if (sectionFor(t.id)) return true;
      const now = performance.now();
      const c = usableCache.get(t.id);
      if (c && c.sel === sel && now - c.t < 1000) return c.ok;
      const kinds = [].concat(t.power?.target ?? []);
      const target = kinds.includes(k) || !kinds.includes('clan') ? { kind: k, entity: sel } : { kind: 'clan', entity: sel };
      const f = U.call('sim', 'forecast', t.id, target);
      const ok = f == null || f.ok !== false;
      usableCache.set(t.id, { sel, t: now, ok, why: ok ? '' : String(f?.who || '') });
      return ok;
    };
    // a button that has shown for this selection stays where it is: greyed, with the reason, while it cannot act
    const tools = k ? (U.get('god', 'tools') ?? []).filter((t) => t.power?.inspector?.[k]) : [];
    for (const t of tools) if (!offered.has(t.id) && !sectionFor(t.id) && usable(t)) offered.set(t.id, t);
    const offer = tools.filter((t) => offered.has(t.id));
    const want = `${k}:${offer.map((t) => t.id).join(',')}`;
    if (acts.dataset.k !== want) {
      acts.dataset.k = want;
      acts.innerHTML = '';
      for (const t of offer) {
        const ic2 = t.power.icon && hasIcon(t.power.icon) ? t.power.icon : 'strike';
        const b = h('button', `btn chip in-power in-${t.id}`, `${icon(ic2, 18)}<span>${esc(t.name)}</span>`);
        b.type = 'button';
        b.dataset.id = t.id;
        // a power with its own tab here (Give a thought) opens the tab; any other arms the power
        b.addEventListener('click', () => { if (b.classList.contains('off')) return; const s = sectionFor(t.id); if (s) openTab(s.def.tab); else U.call('god', 'setTool', t.id); });
        acts.appendChild(b);
      }
    }
    for (const b of acts.children) {
      const t = offered.get(b.dataset.id);
      if (!t) continue;
      const ok = usable(t), [title, text] = t.power.inspector[k] ?? ['', ''];
      const why = ok ? '' : usableCache.get(t.id)?.why || 'Not now.';
      const key = `${ok}|${why}`;
      if (b.dataset.st === key) continue;
      b.dataset.st = key;
      b.classList.toggle('off', !ok);
      b.setAttribute('aria-disabled', String(!ok));
      tip(b, title, ok ? text : `Not now: ${why}`, t.hotkey ?? '');
    }
    setHidden(acts, !acts.children.length);
    setHidden($('.in-follow'), !(person || animal));
    setHidden($('.in-walk'), !(U.walk?.can?.() && sel.kind !== 'clan' && Number.isFinite(sel.x) && !(person && sel.dead)));
    tip($('.in-follow'), following ? 'Stop following' : 'Follow', 'Keep the view on them. Any pan stops it.', 'F');
    if (el.classList.contains('on') || force) steady();
  }

  // ---------- the thought on show ----------
  // The simulation may change a person's thought every second or two at 4x; the panel holds each for as long as
  // it takes to read (readFor), then shows the newest, with a calm crossfade in a box of fixed height. The one
  // it replaces goes to the top of Earlier (newest first, with its year), so the order never reshuffles.
  // A thought the god just gave shows at once.
  function showThought(thought, from, recent, given) {
    const box = $('.in-thought'), faces = box.children;
    const fresh = TH.sel !== sel;
    if (fresh) {
      TH.sel = sel; TH.text = ''; TH.from = ''; TH.year = null; TH.at = -1e9;
      TH.log = recent.filter((x) => x !== thought).slice(0, 3).map((text) => ({ text, year: null }));
    }
    if (thought && thought !== TH.text && (fresh || given || uiT - TH.at >= readFor(TH.text))) {
      if (TH.text) { TH.log.unshift({ text: TH.text, year: TH.year }); TH.log.length = Math.min(TH.log.length, 3); }
      TH.text = thought; TH.from = from; TH.year = Math.floor(U.ctx.clock.year); TH.at = uiT;
      const words = `"${thought.replace(/^"|"$/g, '')}"${from ? ` (from ${from})` : ''}`;
      if (fresh) { faces[TH.face].textContent = words; faces[1 - TH.face].textContent = ''; }
      else {
        // crossfade: the new words come up in the other face while the old fade out, in the same box
        TH.face = 1 - TH.face;
        faces[TH.face].textContent = words;
        faces[TH.face].classList.add('on'); faces[1 - TH.face].classList.remove('on');
      }
      patchEarlier(!fresh);
    } else if (fresh) patchEarlier(false);
    box.classList.toggle('none', !TH.text);
    if (!TH.text) putText(faces[TH.face], sel.asleep ? 'Asleep.' : 'Nothing much.');
  }
  // Earlier: three slots of fixed height, newest first, each with its year
  function patchEarlier(anim) {
    const ul = $('.in-thoughts');
    while (ul.children.length < 3) ul.appendChild(h('li', 'itl', '<span class="itl-y"></span><span class="itl-t"></span>'));
    for (let i = 0; i < 3; i++) {
      const li = ul.children[i], g = TH.log[i];
      const y = g?.year != null ? yearLabel(g.year) : g ? 'before' : '', t = g ? `"${g.text.replace(/^"|"$/g, '')}"` : '';
      if (li.children[0].textContent !== y) li.children[0].textContent = y;
      if (li.children[1].textContent !== t) li.children[1].textContent = t;
      li.classList.toggle('empty', !g);
    }
    setHidden($('.in-earlier'), false);
    // the list's soft fade plays once, when it really changed and is in view; the class goes when it ends, so the
    // list showing again (a tab switch, the panel reopening) never replays it
    if (anim && !ul.closest('[hidden]')) { ul.classList.remove('fresh'); void ul.offsetWidth; ul.classList.add('fresh'); }
  }

  // the chips under the name: who they belong to and what state they are in, each a glyph and a word
  function chips(r, person) {
    const box = $('.in-chips');
    const out = [];
    const clan = person ? U.s2?.clanOf(sel) : sel.cat === 'building' && sel.family ? U.s2?.clans().find((c) => c.family === sel.family) ?? null : sel.kind === 'clan' ? U.s2?.clanById(sel.clanId) : null;
    if (clan) out.push(`<span class="clanchip" style="--dye:${esc(clan.dye)}" title="Clan colour and mark"><i class="cc-sw"></i>${markSvg(clan.mark, 14)}<b>the ${esc(clan.name)}</b></span>`);
    if (clan?.favoured) out.push(`<span class="ichip fav">${icon('favour', 14)}<span>your favourite</span></span>`);
    if (person && !sel.dead) {
      const hp = U.s2?.health(sel) ?? {};
      const sick = hp.sick || (r.sections ?? []).some((s) => /sick|fever|health/i.test(s.id ?? '') && (s.lines?.length || s.rows?.length));
      if (sick) out.push(`<span class="ichip bad">${icon('sick', 14)}<span>sick</span></span>`);
      if (hp.wounded) out.push(`<span class="ichip bad sq">${icon('wound', 14)}<span>wounded</span></span>`);
      if (r.whispered || sel.ext?.traits?.whispered) out.push(`<span class="ichip">${icon('whisper', 14)}<span>whispered to</span></span>`);
      if (r.expectsHelp) out.push(`<span class="ichip warn">${icon('hourglass', 14)}<span>waits on you</span></span>`);
      // the forces agent's fields: a great person, a blessed line; the choices agent's turning point
      // the Resurrected (sim/resurrect.js): a gold chip with the risen sign, the year they rose in its tip
      if (r.risen) out.push(`<span class="ichip great" title="${esc(r.risen.text ?? '')}">${icon('risen', 14)}<span>the Resurrected</span></span>`);
      const g = r.great ?? sel.great;
      if (g) out.push(`<span class="ichip great">${icon('great', 14)}<span>${typeof g === 'string' ? `great in ${esc(g)}` : g.kind && g.since != null ? `a great ${esc(g.kind)}` : g.gifted ? 'gifted: will be great' : g.kind ? `a great ${esc(g.kind)}` : 'great'}</span></span>`);
      const ln = r.line ?? U.call('sim', 'ask', 'lineOf', sel);
      if (ln && (ln.blessed !== false)) out.push(`<span class="ichip line">${icon('line', 14)}<span>${ln.name ? `the ${esc(ln.name)} line` : 'blessed line'}</span></span>`);
      if (turning(sel)) out.push(`<span class="ichip turn">${icon('turn', 14)}<span>a turning point</span></span>`);
    }
    const key = out.join('');
    if (box.dataset.k !== key) { box.dataset.k = key; morph(box, key); }
    setHidden(box, !out.length);
  }

  // a thing that is not an entity, in the inspector's words (god.look's answer, plus what it means to people)
  function describe(t) {
    const n = (v) => Number(v).toLocaleString('en-GB');
    const base = { name: t.name, kind: t.kind, age: null, happiness: null, faith: null, skepticism: null, home: null, story: [], thought: null, thoughts: [], fate: [] };
    if (t.kind === 'tree') return { ...base, role: 'tree', doing: `${t.height} m tall, ${t.trunk} ${t.trunk === 1 ? 'block' : 'blocks'} of trunk, ${t.blocks.length} blocks in all` };
    if (t.kind === 'water') {
      const use = U.call('sim', 'waterUse', t.cells);
      const fams = use?.families ?? [];
      const fresh = !use ? '' : fams.length ? `Fresh water for ${fams.length === 1 ? `the ${fams[0]} family` : `${fams.length} families (${fams.slice(0, 3).join(', ')}${fams.length > 3 ? ' and more' : ''})`}: within ${use.reach} m of their homes.`
        : `No home is within ${use.reach} m of it, so nobody counts it as their water yet.`;
      return { ...base, role: t.name.toLowerCase(), doing: `${t.big ? 'more than ' : ''}${n(t.area)} m2, up to ${t.depthMax} m deep (${t.depthMean} m on average)`, home: null, story: fresh ? [fresh] : [] };
    }
    if (t.kind === 'bushes' || t.kind === 'reeds') return { ...base, role: t.kind === 'reeds' ? 'reeds' : 'bushes', doing: `${t.count} ${t.count === 1 ? 'plant' : 'plants'} together` };
    if (t.kind === 'rock') return { ...base, role: 'bare rock', doing: `${n(t.area)} m2 of ${t.name.toLowerCase()}: no soil to build or farm on` };
    const h2 = t.height;
    return { ...base, role: 'ground', doing: `${h2 === 0 ? 'level ground' : h2 > 0 ? `${h2} m up` : `${-h2} m down`} (block ${t.top})` };
  }
  // a clan as a selection: from s2.clans(), refreshed at 4 Hz
  function describeClan(s) {
    const c = U.s2?.clanById(s.clanId);
    if (!c) return null;
    const ms = c.members;
    const adults = ms.filter((m) => m.stage !== 'child').length;
    const f = Number.isFinite(c.faith) ? Math.round(c.faith) : null;
    const gr = c.grudges.filter((g) => g.level > 0.02).sort((a, b) => b.level - a.level);
    const sections = [];
    sections.push({ id: 'clan-grudges', title: 'Grudges', tab: 'more', lines: gr.length ? gr.map((g) => `Toward the ${g.name ?? U.s2.clanName(g.clan)}: ${heat(g.level)}.`) : ['None. For now.'] });
    if (f != null) sections.push({ id: 'clan-faith', title: 'Faith', tab: 'more', rows: [['Average faith', String(f)], ['Lean on you', String(ms.filter((m) => m.expectsHelp).length)]] });
    if (Number.isFinite(c.village?.x)) { s.x = c.village.x; s.z = c.village.z; }
    return { name: `the ${c.name}`, kind: 'clan', role: 'clan', age: null, doing: `${ms.length} ${ms.length === 1 ? 'person' : 'people'}, ${adults} grown`, home: c.village?.name ?? null,
      story: ms.slice(0, 8).map((m) => `${m.name}, ${Math.floor(m.age)}${m.expectsHelp ? ', waits on you' : ''}`).concat(ms.length > 8 ? [`and ${ms.length - 8} more`] : []), fate: [], thought: null, thoughts: [], sections };
  }
  // sections from inspect(): { id, title, lines?: [text], rows?: [[label, value]], order?, tab? }, each into its tab,
  // redrawn only when they change; then the HUD's own sections (registry.js)
  const secHtml = (s) => `<section class="in-sec in-x-${esc(String(s.id ?? 'x'))}"><h3 class="in-h">${esc(s.title ?? '')}</h3>${
    Array.isArray(s.rows) && s.rows.length ? `<dl class="in-rows">${s.rows.map(([a, b]) => `<dt>${esc(String(a))}</dt><dd>${esc(String(b))}</dd>`).join('')}</dl>` : ''}${
    Array.isArray(s.lines) && s.lines.length ? `<ul>${s.lines.map((x) => `<li>${esc(String(x))}</li>`).join('')}</ul>` : ''}</section>`;
  function extSections(r, person) {
    const list = Array.isArray(r.sections) ? [...r.sections].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)) : [];
    const by = {};
    for (const s of list) { const t = person ? tabOf(s) : 'more'; (by[t] ??= []).push(s); }
    for (const [t] of TABS) {
      if (t === 'give') continue;
      const p = pane(t);
      let box = p.querySelector(':scope > .in-ext');
      if (!box) { box = h('div', 'in-ext'); if (t === 'clan' || t === 'more') p.prepend(box); else p.appendChild(box); }
      const key = sel?.dead ? '' : JSON.stringify(by[t] ?? []);
      if (box.dataset.k !== key) { box.dataset.k = key; morph(box, key ? (by[t] ?? []).map(secHtml).join('') : ''); }
    }
    for (const { def, el: sec } of U.registry?.sections?.() ?? []) {
      const t = def.tab && TABS.some(([id]) => id === def.tab) ? def.tab : 'more';
      if (sec.parentNode !== pane(t)) { sec.innerHTML = def.title ? `<h3 class="in-h">${esc(def.title)}</h3><div class="in-reg-body"></div>` : '<div class="in-reg-body"></div>'; pane(t).appendChild(sec); }
      let show = false;
      try { show = !!sel && (def.when ? !!def.when(r, sel) : true); if (show) def.render(sec.querySelector('.in-reg-body'), r, sel, U); } catch (err) { U.warnOnce(`section ${def.id}`, err); show = false; }
      setHidden(sec, !show);
    }
  }
  // the tabs: only those with something in them; the last one chosen stays chosen from person to person
  const hasContent = (p) => [...p.querySelectorAll(':scope > section, :scope > .in-ext > section, :scope > .in-reg')].some((s) => !s.hidden);
  function tabs(tabbed) {
    el.classList.toggle('tabbed', tabbed);
    const bar = $('.in-tabs'), fold = $('.in-fold');
    const foldHas = hasContent(pane('clan')) || hasContent(pane('more'));
    if (!tabbed) {
      // not a living person (an animal, a tree, a clan): everything shows, the fold open and without its title
      setHidden(bar, true); setData(el, 'tab', null);
      for (const [t] of TABS) setHidden(pane(t), !hasContent(pane(t)));
      if (!fold.classList.contains('flat')) fold.classList.add('flat');
      if (!fold.open) fold.open = true;
      setHidden(fold, !foldHas);
      return;
    }
    if (fold.classList.contains('flat')) fold.classList.remove('flat');
    // a living person always has the three tabs, so the row never reflows
    const cur = SHOWN.some(([t]) => t === tabPref) ? tabPref : 'mind';
    // an empty tab says so (once, on its first pane)
    for (const [g] of SHOWN) {
      const ps = TABS.filter(([t]) => GROUP[t] === g).map(([t]) => pane(t));
      const empty = !ps.some(hasContent);
      const p = ps[0];
      let none = p.querySelector(':scope > .in-none');
      if (empty && !none) { none = h('p', 'in-none', 'Nothing here just now.'); p.appendChild(none); }
      if (none) setHidden(none, !empty);
    }
    const key = SHOWN.map(([t]) => t).join();
    if (key !== tabsKey) {
      tabsKey = key;
      bar.innerHTML = '';
      for (const [t, label] of SHOWN) {
        const def = (U.registry?.sections?.() ?? []).find((s) => s.def.tab === t)?.def;
        const b = h('button', `in-tab ${t === cur ? 'on' : ''}`, `${TAB_SIGN[t] ? sign(TAB_SIGN[t], 18) : ''}<span>${esc(def?.tabLabel ?? label)}</span>`);
        b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(t === cur)); b.dataset.tab = t;
        b.addEventListener('click', () => openTab(t));
        bar.appendChild(b);
      }
    }
    setHidden(bar, false);
    setData(el, 'tab', cur);
    for (const [t] of TABS) { const p = pane(t); const on = GROUP[t] === cur; setHidden(p, !on || (t !== 'fate' && t !== 'life' && t !== 'mind' && t !== 'give' && !hasContent(p))); p.classList.toggle('on', on); }
    setHidden(fold, cur !== 'life' || !foldHas);
    for (const b of bar.children) { const on = b.dataset.tab === cur; b.classList.toggle('on', on); setAttr(b, 'aria-selected', String(on)); }
  }
  // a chosen tab: if the panel is scrolled past the tab row, it comes back to just under the sticky name, so what
  // the tab holds starts in view; otherwise nothing moves
  function openTab(t) {
    tabPref = GROUP[t] ?? t; refresh(true);
    const bar = $('.in-tabs');
    if (bar.hidden) return;
    const to = 0;
    if (body.scrollTop > to) body.scrollTop = to;
  }
  function setText(s, t) { const n = $(s); if (n.textContent !== t) n.textContent = t; }
  // lists are patched in place: the same <li> nodes keep their place and only changed words are rewritten
  function fill(s, list) {
    const n = $(s), key = list.join('|');
    if (n.dataset.k === key) return;
    n.dataset.k = key;
    while (n.children.length > list.length) n.lastElementChild.remove();
    list.forEach((x, i) => { const li = n.children[i] ?? n.appendChild(document.createElement('li')); if (li.textContent !== x) li.textContent = x; });
    setHidden(n, !list.length);
  }
  function fillHtml(s, list) {
    const n = $(s), key = list.join('|');
    if (n.dataset.k === key) return;
    n.dataset.k = key;
    while (n.children.length > list.length) n.lastElementChild.remove();
    list.forEach((x, i) => { const li = n.children[i] ?? n.appendChild(document.createElement('li')); if (li.dataset.h !== x) { li.dataset.h = x; li.innerHTML = x; } });
    setHidden(n, !list.length);
  }
  // rewrite a container to new markup without throwing its nodes away: same tag and class, the node stays and
  // only its words and attributes change (sections from the simulation, chips)
  function morph(box, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    patchKids(box, tpl.content);
  }
  function patchKids(a, b) {
    const an = [...a.childNodes], bn = [...b.childNodes];
    for (let i = 0; i < bn.length; i++) {
      const x = an[i], y = bn[i];
      if (!x) { a.appendChild(y); continue; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || (x.nodeType === 1 && x.className !== y.className)) { a.replaceChild(y, x); continue; }
      if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      if (x.nodeType === 1) {
        for (const at of [...x.attributes]) if (!y.hasAttribute(at.name) && at.name !== 'style' && at.name !== 'data-steady') x.removeAttribute(at.name);
        for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
        patchKids(x, y);
      }
    }
    for (let i = an.length - 1; i >= bn.length; i--) an[i].remove();
  }
  function setMeter(k, v) {
    const m = M[k];
    const n = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
    const vt = n == null ? '-' : String(n);
    if (m.v.textContent !== vt) m.v.textContent = vt;
    if (n == null) { if (m.fill.style.width !== '0%') m.fill.style.width = '0%'; return; }
    // a real loss (3 points or more) leaves a pale trail; the small steps of a running clock do not, or the bar flickers
    if (m.last != null && n <= m.last - 3) {
      // a pale trail of what was lost, for 400 ms
      m.lost.style.transition = 'none'; m.lost.style.width = `${m.last}%`; m.lost.style.opacity = '1';
      void m.lost.offsetWidth;
      m.lost.style.transition = ''; m.lost.style.opacity = '0';
    }
    if (m.fill.style.width !== `${n}%`) m.fill.style.width = `${n}%`;
    m.last = n;
  }

  // ---------- per frame ----------
  function frame(dt) {
    uiT += Math.min(0.25, Number(dt) || 0);
    // the ring under the feet
    if (sel && visible(sel) && !pseudo(sel)) {
      const p = ctx.camera.toScreen(sel.x, sel.y ?? 16, sel.z);
      const d = Math.max(18, Math.min(90, ctx.camera.ppm * 1.6));
      ringEl.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      ringEl.style.setProperty('--d', `${d}px`);
      setHidden(ringEl, false);
    } else setHidden(ringEl, true);
    if (hov && hov !== sel && visible(hov) && !U.get('god', 'tool')) {
      const p = ctx.camera.toScreen(hov.x, hov.y ?? 16, hov.z);
      const d = Math.max(18, Math.min(90, ctx.camera.ppm * 1.6));
      hovEl.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      hovEl.style.setProperty('--d', `${d}px`);
      setHidden(hovEl, false);
    } else setHidden(hovEl, true);
    if (sel && (sel.removed || sel.deleted) && !(sel.kind === 'person' && sel.dead)) select(null);
    // follow
    if (following && sel && visible(sel)) {
      const C = ctx.camera, K = ctx.controls;
      if (K.keys?.size || K.down?.moved) { stopFollow(); }
      else {
        if (follow && (Math.abs(C.target.x - follow.x) > 0.05 || Math.abs(C.target.z - follow.z) > 0.05) && C.ppm === follow.ppm && !C.anim) { stopFollow(); return; }
        const k = Math.min(1, dt * 6);
        if (!C.anim) {
          C.target.x += (sel.x - C.target.x) * k; C.target.z += (sel.z - C.target.z) * k;
          C.clamp(); C.update();
        }
        follow = { x: C.target.x, z: C.target.z, ppm: C.ppm };
      }
    }
    // hover, 10 times a second
    hoverT -= dt;
    if (hoverT <= 0) {
      hoverT = 0.1;
      if (hoverAt && !U.get('god', 'tool') && !ctx.controls.down && ctx.controls.enabled) setHover(pickAt(hoverAt.x, hoverAt.y));
      else if (ctx.core?.hover) setHover(null);
    }
  }
  U.frame.push(frame);
  U.slow.push(() => { if (sel) refresh(); });
  U.on('select', (p) => {
    // someone else changed the selection (another module): follow it if it is ours to show
    const s = p?.selected?.[0] ?? null;
    if (s !== sel && s && (s.cat === 'person' || s.cat === 'animal')) {
      sel = s;
      if (s !== steadyFor) { unsteady(); seenTabs.clear(); offered.clear(); tabsKey = ''; TH.sel = null; steadyFor = s; body.scrollTop = 0; }
      refresh(true); el.classList.add('on'); U.slot?.show('select');
    }
  });
  // the slot shows something else on top: nothing to change here; closed from outside (Esc on the slot): deselect
  U.onSlot?.push(() => { if (sel && !U.slot.has('select')) select(null); });
  return { select, open, showClan, openTab, get selected() { return sel; }, get hovered() { return hov; }, toggleFollow, get open() { return !!sel; }, sectionsChanged() { tabsKey = ''; } };
}
