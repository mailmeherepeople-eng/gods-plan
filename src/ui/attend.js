// What needs the god, shown twice and opened in one place (the director, 2026-11-13: "in C, i like the tokens on
// the top right ... in B i like each warning as a marker over the people or place. when we click it, it should
// open on the right ... two things being there i think is fine").
//   tokens   top right: each thing that needs you (a warning with its time left, a prayer, a fight gathering, a
//            great person's death, what could have been done) is a small clay seal token, its sign and a glaze
//            that drains as its time runs down, the time in tabular digits under it. Five at most, urgent ones
//            first, then in the order they came; the rest are counted ("+3") and kept in the Log. A token keeps
//            its node for as long as it stays: it is patched in place and only moved (transform, opacity).
//   markers  the same things over the people or place they concern, with the same picture and ring; off screen,
//            an arrow at the edge of the clear part of the window. A token and its marker are one thing:
//            pointing at either lights the other, opening either marks both.
//   detail   a click on either opens its detail in the slot on the right (slot.js), and a marker's click glides
//            the camera there: what is happening, the time left, and both futures side by side, "If you act"
//            and "If you do nothing", at three depths (the headline; the lines that matter; the full account),
//            light by default and one tap for more. Its buttons arm the right power on the right target (the
//            trade off then shows in the same slot) or, for a prayer, answer it in one tap.
// Sources (all guarded; a missing one shows nothing): sim.ask('foresight') and 'foresightNow' (warnings), 'prayers'
// (the forces agent: [{ id, person, text, x, z, expires, answer: { power, target }, ifAnswered, ifNot }]),
// U.s2.fights() and hardships(), the clock's open moments, and the signals force:fell, force:great,
// line:blessed, line:lost, prayer:new / answered / expired, foresight:new / update / withdrawn / landed.
// A forecast or warning may carry futures: { act: { headline, key: [text], full: [text] }, wait: { ... } }
// (the choices agent); until it does, both futures are put together from the warning's own words.
// Alerts in three levels (DESIGN.md "Decisions after the mock-ups", 2026-11-14):
//   serious    a death about to happen that matters, a raid, a great person dying, a family about to leave, the people
//              entering a danger band: a token, and when its place is off screen a red indicator at the screen edge
//              pointing to it; at most one new serious interrupt a minute (the next waits its turn for the edge)
//   needs you  prayers, warnings with a countdown, good news in its moment (a discovery, someone great): a token
//   ordinary   births, huts, news, forecasts updating, accounts after the fact: no token and nothing flies; the Log's
//              scroll swells (feed.js). The gold or red blob flies only for a token the player resolved or lost.
// Nothing teleports: a token, a marker or an edge indicator glides the camera to its place in a fixed time first,
// then its detail opens in the side sheet.
import { h, icon, hasIcon, tip, esc, cap, yearLabel, setText, setAttr, setHidden, setData, setHtml, signOf, oldDraw } from './dom.js';
import { tokenSeal, markerSvg, setGlaze, signSvg, GROUP_OF } from './signs.js';
import { FORE } from './teach-words.js';
import { SUGGEST_R } from '../sim/rain-size.js';

const CAP_MAX = 5;
const SERIOUS_GAP = 60000;   // ms between two new serious interrupts
// a prayer comes before a warning: it is short-lived and answerable in one tap (the director: prayers keep the
// player engaged); a crisis comes before both
// good news (a discovery, a gifted child, someone great) is a short beat that must be seen while it lasts, so it
// comes before a warning too; it leaves for the Log on its own within half a minute
const SEV_W = { bad: 4, pray: 3.2, good: 3.1, warn: 3, info: 1 };
const ICON = { hunger: 'hunger', leave: 'family', mother: 'family', line: 'line', thinker: 'spark', wolf: 'paw', raid: 'fight', grudge: 'fight',
  fire: 'fire', flood: 'flood', floodSick: 'sick', drought: 'drought', death: 'sev-bad', sickness: 'sick', predator: 'paw', skirmish: 'fight', fight: 'fight', quarrel: 'provoke',
  // the forces' warnings (the joining pass): a great person dying, a blessing fading, a chief, a family leaving for peace
  great: 'great', blessed: 'line', chief: 'strength', peace: 'peace' };
const HOW_ICON = { sickness: 'sick', wounds: 'wound', fire: 'fire', wolf: 'paw', fight: 'fight', hunger: 'hunger', fever: 'sick', cough: 'sick', flux: 'sick' };
const HARD = { sickness: ['sick', 'Fever'], fire: ['fire', 'Fire'], flood: ['flood', 'Flood'], drought: ['drought', 'Drought'], hunger: ['hunger', 'Hunger'] };
const DEPTHS = [[1, 'Short'], [2, 'More'], [3, 'All']];
// Each token, marker and detail badge is the director's clay seal (signs.js; DESIGN.md "Icons, markers ..."): the
// seal's shape tells the group (a prayer a drop, a want a pillow square, nature's hand a triangle, strife a lozenge,
// lives that matter a shield, good news a circle, a tip a capsule), the sign pressed in tells the kind, red wax with
// drips is serious, and the glaze drains as its time runs (it was a ring before). On the map: the same shape as a
// thin clay outline. The sign each thing takes, by what the simulation says it is:
const SIGN = { hunger: 'hunger', leave: 'leaving', mother: 'death', line: 'lineLost', thinker: 'death', wolf: 'wolf', predator: 'wolf',
  raid: 'raid', grudge: 'grudge', skirmish: 'raid', fight: 'raid', quarrel: 'grudge', fire: 'fire', flood: 'flood', floodSick: 'sick',
  drought: 'drought', sickness: 'sick', death: 'death', great: 'death', blessed: 'lineLost', chief: 'chief', peace: 'leaving' };
// a death foretold shows what will kill, where that has a sign of its own (the director chose a Wolf sign and a Sickness sign for exactly this)
const DEATH_BY = { wolf: 'wolf', sick: 'sick', sickness: 'sick', hunger: 'hunger', starve: 'hunger', fire: 'fire', flood: 'flood', fight: 'raid', raid: 'raid' };
const LEVEL = { bad: 'serious', pray: 'pray', warn: 'warn', good: 'good', info: 'info' };
function signFor(it) {
  const k = it.kind;
  const s = k === 'prayer' ? 'prayer' : k === 'fore' ? ((it.src?.v?.kind === 'death' && DEATH_BY[it.src?.v?.how]) || SIGN[it.src?.v?.kind]) : k === 'fight' ? 'raid' : k === 'hard' || k === 'moment' ? SIGN[it.src?.kind]
    : k === 'account' ? (it.icon === 'family' ? 'leaving' : 'death') : k === 'fell' ? 'death' : k === 'great' ? 'great' : k === 'gifted' ? 'gifted'
      : k === 'chief' ? 'chief' : k === 'leaving' ? 'leaving' : k === 'line' ? 'blessed' : null;
  return s ?? (k === 'state' ? null : signOf(it.icon));
}
// the seal a thing takes: its sign (or its old picture pressed in), its group, its level
function sealOf(it) {
  const sign = signFor(it);
  const level = LEVEL[it.sev] ?? 'warn';
  const group = (sign && GROUP_OF[sign]) || (it.sev === 'bad' ? 'conflict' : it.sev === 'pray' ? 'pray' : it.sev === 'good' ? 'good' : 'need');
  return { sign, level, group, draw: sign ? undefined : oldDraw(it.icon) };
}

export default [{
  type: 'panel', id: 'attend', region: 'root', order: 5,
  make(U) {
    const A = makeAttend(U);
    const stub = h('span', 'attend-stub');
    stub.hidden = true;
    stub._a = A;
    return stub;
  },
  update(U, dt, el) { el._a.update(dt); },
  frame(U, dt, el) { el._a.frame(dt); },
}];

function makeAttend(U) {
  const { ctx } = U;
  const clock = ctx.clock;
  const realS = (gameS) => gameS / Math.max(1e-6, clock.speed || 1);
  let simClock = 0;

  // ---------- the rail ----------
  const rail = h('div', 'rail');
  rail.setAttribute('role', 'toolbar'); rail.setAttribute('aria-label', 'Things that need you');
  const more = h('button', 'btn tok-more', '<span></span>');
  more.type = 'button';
  tip(more, 'More in the Log', 'Only five show at once, the most urgent first. The rest wait in the Log.', 'L');
  more.addEventListener('click', () => U.feed?.showLog?.('fore'));
  rail.appendChild(more);
  // in the top right row, before the Log and the Menu
  const logB = U.topbar.querySelector('.logb');
  if (logB) U.topbar.insertBefore(rail, logB); else U.topbar.appendChild(rail);
  // ---------- the markers ----------
  const layer = h('div', 'amarks');
  U.world.appendChild(layer);
  // who it is about, shown on the world itself: a gold ring and name on the one in danger, a red ring and name on
  // what threatens them, and a dashed line from one to the other (the director, 2026-11-15: "i cant tell what is
  // going to happen. which animal going to get affected")
  const spots = h('div', 'aspots');
  U.world.insertBefore(spots, layer);
  const spotLine = h('div', 'aspot-line'); spots.appendChild(spotLine);
  const spotEls = [];
  const spotEl = (i) => { while (spotEls.length <= i) { const e = h('div', 'aspot'); e.innerHTML = '<i></i><b></b>'; spots.appendChild(e); spotEls.push(e); } return spotEls[i]; };
  const live = (e) => !!e && !e.dead && Number.isFinite(e.x) && Number.isFinite(e.z);
  const beast = (a) => (a?.species ? `The ${a.species}` : a?.name ?? 'It');
  function actorsOf(it) {
    const out = [];
    const add = (e, role, label) => { if (live(e) && !out.some((o) => o.e === e)) out.push({ e, role, label }); };
    if (it.kind === 'fore') {
      for (const v of arr(it.src?.views).slice(0, 1)) {
        add(v.subject ?? it.subject, 'you', (v.subject ?? it.subject)?.name);
        for (const o of arr(v.options)) { const t = o?.target; if (o?.power === 'strike' && t?.entity) add(t.entity, 'foe', t.kind === 'animal' ? beast(t.entity) : t.entity.name); }
      }
    } else if (it.kind === 'moment' && it.src?.kind === 'predator') {
      let wolf = it.src.entity ?? it.src.animal ?? null, bd = 30;
      if (!wolf) for (const a of arr(U.get('sim', 'animals'))) { if (a.dead || a.species !== 'wolf') continue; const d = Math.hypot(a.x - it.x, a.z - it.z); if (d < bd) { bd = d; wolf = a; } }
      add(wolf?.prey ?? it.subject, 'you', (wolf?.prey ?? it.subject)?.name);
      add(wolf, 'foe', beast(wolf));
    } else if (it.subject) add(it.subject, it.sev === 'bad' ? 'you' : 'calm', it.subject.name);
    return out;
  }
  function drawSpots() {
    // the open one, and anything serious that lands within seconds
    const its = [];
    for (const k of order) { const it = items.get(k); if (it && (k === openKey || (it.level === 'serious' && it.when?.scale === 'secs'))) its.push(it); }
    if (openKey && putAway(openKey)) its.push(items.get(openKey));
    let n = 0, line = null;
    for (const it of its) {
      const pts = [];
      for (const a of actorsOf(it)) {
        const e = a.e, y = Number.isFinite(e.y) ? e.y : 16;
        const p = ctx.camera.toScreen(e.x, y + 0.9, e.z);
        if (p.behind) continue;
        pts.push({ ...p, role: a.role });
        if (p.x < -40 || p.x > innerWidth + 40 || p.y < -40 || p.y > innerHeight + 40) continue;
        const el = spotEl(n++);
        setHidden(el, false);
        if (el.dataset.role !== a.role) el.dataset.role = a.role;
        setText(el.lastChild, a.label ?? '');
        el.style.translate = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
      }
      const a = pts.find((q) => q.role === 'foe'), b = pts.find((q) => q.role === 'you');
      if (a && b && !line && (it.key === openKey || its.length === 1)) line = { a, b };
    }
    for (let i = n; i < spotEls.length; i++) setHidden(spotEls[i], true);
    if (line) {
      const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y, d = Math.hypot(dx, dy);
      setHidden(spotLine, d < 50);
      spotLine.style.width = `${Math.max(0, d - 44).toFixed(1)}px`;
      spotLine.style.translate = `${line.a.x.toFixed(1)}px ${line.a.y.toFixed(1)}px`;
      spotLine.style.rotate = `${Math.atan2(dy, dx).toFixed(3)}rad`;
    } else setHidden(spotLine, true);
  }
  // ---------- the detail ----------
  const sd = h('div', 'sd');
  sd.innerHTML = `<div class="ph zz sd-head"><span class="badge sd-badge"><span class="sd-ic"></span></span><div class="pw"><div class="pt sd-title"></div><div class="ps sd-time"><b></b> <i></i></div></div>
      <button class="btn ico quiet sd-look" type="button" aria-label="Look there">${icon('follow', 20)}</button><button class="btn ico quiet sd-x" type="button" aria-label="Close">${icon('close', 20)}</button></div>
    <div class="sd-scroll">
      <div class="fut sd-fut"><section class="act sd-act"><h4>${icon('hand', 15)}<span>If you act</span></h4><p class="sd-hl"></p><ul class="sd-key"></ul><ul class="sd-full"></ul></section>
        <section class="wait sd-wait"><h4>${icon('hourglass', 15)}<span>If you do nothing</span></h4><p class="sd-hl"></p><ul class="sd-key"></ul><ul class="sd-full"></ul></section></div>
      <section class="sd-third"><h4>${icon('go', 15)}<span class="sd-tl"></span></h4><p class="sd-hl"></p><ul class="sd-key"></ul><ul class="sd-full"></ul></section>
      <div class="acts-row sd-acts"></div>
      <p class="voice sd-voice"></p><p class="sd-what"></p>
      <ul class="sd-acc"></ul>
      <div class="sd-depth seg" role="group" aria-label="How much to show"></div></div>`;
  const $ = (s) => sd.querySelector(s);
  tip($('.sd-x'), 'Close', '', 'Esc');
  $('.sd-x').addEventListener('click', () => close());
  // look there: the camera travels to it (the sheet stays open), and the one it is about is picked
  $('.sd-look').addEventListener('click', () => {
    const it = openKey ? items.get(openKey) : null;
    if (!it || !Number.isFinite(it.x)) return;
    U.glide(it.x, it.z, { ppm: it.kind === 'fight' ? 9 : 5 });
  });
  if (U.settings.depth == null) U.settings.depth = 1;
  for (const [d, label] of DEPTHS) {
    const b = h('button', 'btn chip seg-b', esc(label));
    b.type = 'button'; b.dataset.d = String(d);
    tip(b, label, d === 1 ? 'Just the headline of each future.' : d === 2 ? 'The few lines that matter.' : 'The whole account.');
    b.addEventListener('click', () => { U.settings.depth = d; U.saveSettings(); paintDepth(); });
    $('.sd-depth').appendChild(b);
  }
  function paintDepth() {
    setData(sd, 'depth', U.settings.depth);
    for (const b of $('.sd-depth').children) { const on = Number(b.dataset.d) === U.settings.depth; b.classList.toggle('on', on); setAttr(b, 'aria-pressed', String(on)); }
  }
  paintDepth();
  U.slot.add('detail', sd);

  // ---------- the model ----------
  const items = new Map();        // key -> item (live, rebuilt each pull, nodes kept in `els`)
  const els = new Map();          // key -> { tok, mk, ar, sig, first, seen }
  const extras = new Map();       // signal-made items with a life: key -> { item, until }
  const firstLeft = new Map();    // key -> the time left when first seen (the ring's whole)
  const seenAt = new Map();       // key -> when first seen (the stable order)
  let order = [], openKey = null, armedFrom = null, hot = null;
  const ask = (n, ...a) => U.call('sim', 'ask', n, ...a);
  const arr = (v) => (Array.isArray(v) ? v : []);

  // time left of anything: { gs (game seconds) | years }, short words, and its fraction of the whole
  function left(it, o) {
    if (o.scale === 'secs' || Number.isFinite(o.atClock)) {
      const gs = (o.atClock ?? 0) - simClock;
      return { secs: gs, real: realS(gs), short: gs <= 0.4 ? 'now' : shortS(realS(gs)), main: gs <= 0.4 ? 'now' : longS(realS(gs)), urgent: realS(gs) < 15, raw: gs };
    }
    if (Number.isFinite(o.atYear)) {
      const y = o.atYear - clock.year;
      const n = Math.ceil(Math.max(0, y));
      return { years: y, real: realS(y * clock.secondsPerYear), short: y < 0.15 ? 'now' : `${n}yr`, main: y < 0.15 ? 'now' : n <= 1 ? 'this year' : `${n} years`, sub: yearLabel(o.atYear), urgent: realS(y * clock.secondsPerYear) < 15, raw: y };
    }
    if (Number.isFinite(o.until)) {
      const s = (o.until - performance.now()) / 1000;
      return { real: s, short: '', main: '', raw: s, life: true };
    }
    return { short: 'now', main: 'now', raw: null };
  }
  const shortS = (s) => (s < 90 ? `${Math.max(1, Math.round(s))}s` : `${Math.round(s / 60)}m`);
  const longS = (s) => (s < 90 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);
  // a prayer's end: `expires` is a calendar year (docs/FORCES.md, forces-prayers.js `until`); `left` the whole
  // years to it. Fights and fires stay open until decided (expires may then lie past what the fight takes).
  function prayerWhen(p) {
    const e = Number(p.expires);
    if (Number.isFinite(e)) return { atYear: e };
    if (Number.isFinite(p.left)) return { atYear: clock.year + p.left };
    return {};
  }
  const near = (a, b, r) => Number.isFinite(a?.x) && Number.isFinite(b?.x) && Math.hypot(a.x - b.x, a.z - b.z) < r;

  function pull() {
    const now = new Map();
    if (clock.phase !== 'running' || !U.sim()) { items.clear(); return; }
    const fn = ask('foresightNow');
    if (fn && Number.isFinite(fn.clock)) simClock = fn.clock;
    // warnings, one per family (or per thing), the worst first inside it
    const by = new Map();
    for (const v of arr(ask('foresight'))) {
      // (a quiet note nothing can change, "old age", stays in the Log: it does not need the god)
      if (!v || (v.sev === 'info' && !v.options?.length)) continue;
      const k = v.family ? `fam:${v.family.id}` : `v:${v.key}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(v);
    }
    const due = (v) => (v.scale === 'secs' ? -1e9 + (v.atClock ?? 0) : (v.atYear ?? 0));
    for (const [k, list] of by) {
      list.sort((a, b) => (SEV_W[b.sev] ?? 1) - (SEV_W[a.sev] ?? 1) || due(a) - due(b) || String(a.key).localeCompare(String(b.key)));
      const v = list[0];
      now.set(`f:${k}`, { key: `f:${k}`, kind: 'fore', level: v.sev === 'bad' ? 'serious' : 'needs', sev: v.sev === 'bad' ? 'bad' : v.sev === 'info' ? 'info' : 'warn', icon: v.kind === 'death' ? HOW_ICON[v.how] ?? 'sev-bad' : ICON[v.kind] ?? 'hourglass',
        title: v.title, x: v.x, z: v.z, subject: v.subject, when: v, src: { views: list, v } });
    }
    const fore = [...now.values()];
    // prayers, in the person's own words
    for (const p of arr(ask('prayers'))) {
      if (!p || p.answered || p.expired) continue;
      const who = p.person ?? null;
      const k = `p:${p.id ?? who?.id ?? p.text}`;
      now.set(k, { key: k, kind: 'prayer', level: 'needs', sev: 'pray', icon: 'pray', title: `${p.name ?? who?.name ?? 'Someone'}${p.clan ? ` of ${p.clan}` : ''} prays`, x: p.x ?? who?.x, z: p.z ?? who?.z, subject: who, when: prayerWhen(p), src: p });
    }
    // fights gathering or under way (a raid's foresight carries it when there is one)
    for (const f of U.s2.fights()) {
      if (!f.major && f.kind !== 'raid' && f.kind !== 'skirmish') continue;
      if (fore.some((it) => (it.src.v.kind === 'raid' || it.src.v.kind === 'grudge') && near(it, f, 30))) continue;
      const k = `g:${f.id}`;
      const a = f.A?.name, b = f.B?.name;
      now.set(k, { key: k, kind: 'fight', level: f.kind === 'raid' || f.major ? 'serious' : 'needs', sev: 'bad', icon: 'fight', title: `${f.kind === 'raid' ? 'A raid' : 'A fight'}${a && b ? `: the ${a} against the ${b}` : ''}`, x: f.x, z: f.z, subject: null, when: {}, src: f });
    }
    // hardships under way that no warning speaks for
    for (const hd of U.s2.hardships()) {
      if (fore.some((it) => near(it, hd, 24))) continue;
      // (a hunger nobody is about to die of, or one a deer the god put down is already on its way to, needs nothing now)
      if (hd.kind === 'hunger' && (hd.danger === 0 || hd.coming)) continue;
      const kw = HARD[hd.kind] ?? ['sev-warn', 'Trouble'];
      const n = hd.people?.filter?.((p) => !p.dead).length ?? 0;
      const k = `h:${hd.id}`;
      now.set(k, { key: k, kind: 'hard', level: 'needs', sev: 'warn', icon: kw[0], title: hd.kind === 'sickness' ? `${kw[1]}, ${n} sick` : n ? `${kw[1]}, ${n} in danger` : kw[1], x: hd.x, z: hd.z, when: {}, src: hd });
    }
    // the moments the world opened that nothing above already shows
    for (const [id, info] of clock.moments?.entries?.() ?? []) {
      if (id === 'player' || !info || !Number.isFinite(info.x)) continue;
      if (/^sim:(hardship|fight):/.test(id)) continue;
      if ([...now.values()].some((it) => near(it, info, 14))) continue;
      const k = `m:${id}`;
      now.set(k, { key: k, kind: 'moment', level: 'needs', sev: info.kind === 'predator' ? 'bad' : 'warn', icon: ICON[info.kind] ?? 'hourglass', title: info.text ?? 'Something needs your eye', x: info.x, z: info.z, when: {}, src: info });
    }
    // what signals left behind, each with its life
    const t = performance.now();
    for (const [k, e] of extras) { if (t > e.until) { extras.delete(k); continue; } now.set(k, { ...e.item, when: { until: e.until } }); }
    items.clear();
    for (const [k, v] of now) items.set(k, v);
  }

  // Acted on (the director, 2026-11-16: "Once we interact with a notification, it should not remain on the screen
  // anymore & go into the Log under actioned"): a token, marker or edge sign the player opened, or a warning they
  // answered, leaves the rail and the map at once (its token flies into the Log, where its entry moves under
  // "Actioned"); its marker shows only while its own detail is open. It comes back only if the thing grows worse
  // (a warning turning serious), or if the player's act did not meet the need (the answer below says why).
  const actioned = new Map();     // key -> { level (when acted on), met, goneAt }
  const putAway = (k) => actioned.has(k) && items.has(k);
  // ---------- serious ones: at most one new interrupt a minute ----------
  const interruptAt = new Map();
  let lastInterrupt = -1e9;
  function schedule(k) {
    const t = Math.max(performance.now(), lastInterrupt + SERIOUS_GAP);
    interruptAt.set(k, t); lastInterrupt = t;
  }
  const interrupted = (it) => (interruptAt.get(it.key) ?? Infinity) <= performance.now();
  const sounded = new Set();
  function interruptTick() {
    const now = performance.now();
    for (const [k, t] of interruptAt) if (t <= now && !sounded.has(k)) { sounded.add(k); if (!actioned.has(k)) { U.sfx('alert.crisis'); U.fx?.buzz?.(20); } }
    for (const k of sounded) if (!interruptAt.has(k)) sounded.delete(k);
  }

  // ---------- order: urgent first, then as they came ----------
  // by kind of trouble only (a crisis, a warning, a prayer, news), never by the running clocks, so the rail does
  // not reshuffle as times tick down; within a kind, the order they came in
  const rank = (it) => SEV_W[it.sev] ?? 1;
  let shownKeys = [];
  function arrange() {
    const t = performance.now();
    for (const k of items.keys()) if (!seenAt.has(k)) { seenAt.set(k, t); if (items.get(k).level === 'serious') schedule(k); }
    for (const k of [...seenAt.keys()]) if (!items.has(k)) { seenAt.delete(k); firstLeft.delete(k); interruptAt.delete(k); }
    // acted on: one that grew worse comes back; one whose thing is over is forgotten (at once once met, else after a
    // minute, so a warning that drops out for a moment and comes back is not shown again)
    for (const [k, a] of [...actioned]) {
      const it = items.get(k);
      if (it) { a.goneAt = 0; if (it.level === 'serious' && a.level !== 'serious') unAction(k); continue; }
      if (!a.goneAt) a.goneAt = t;
      if (a.met || t - a.goneAt > 60000) actioned.delete(k);
    }
    const cmp = (a, b) => rank(items.get(b)) - rank(items.get(a)) || seenAt.get(a) - seenAt.get(b) || a.localeCompare(b);
    const all = [...items.keys()].filter((k) => items.get(k).rail !== false && !actioned.has(k)).sort(cmp);
    // the five on the rail keep their places: one leaves only for something of a more urgent kind (so nothing goes
    // back and forth at the edge of the five)
    // (one acted on gives up its place at once)
    let shown = shownKeys.filter((k) => items.has(k) && !actioned.has(k));
    for (const k of all) {
      if (shown.includes(k)) continue;
      if (shown.length < capN) { shown.push(k); continue; }
      const low = shown.reduce((a, b) => (cmp(a, b) > 0 ? a : b));
      if (rank(items.get(k)) > rank(items.get(low))) shown = shown.filter((x) => x !== low).concat(k);
    }
    shown.sort(cmp);
    shownKeys = shown;
    order = [...shown, ...all.filter((k) => !shown.includes(k))];
  }

  // ---------- drawing the tokens and markers ----------
  const pitch = () => 52;
  // how many tokens fit in the top right row beside the time box, the Log and the Menu: three to five where there is
  // room (the rest are counted, "+N"), fewer only on a window too narrow for three
  let capN = 3, capT = 0;
  function capNow() {
    const now = performance.now();
    if (now - capT < 500) return capN;
    capT = now;
    const tr = U.topbar.getBoundingClientRect();
    if (!tr.width) return capN;
    const others = [...U.topbar.children].filter((c) => c !== rail && !c.hidden && c.getClientRects().length).reduce((a, c) => a + c.getBoundingClientRect().width + 8, 0);
    const tb = U.time?.el;
    const tbr = tb && !tb.hidden && tb.getClientRects().length ? tb.getBoundingClientRect() : null;
    // (the time box with "Paused while reading" beside it, so the count does not change when something opens)
    const left = tbr ? tbr.left + Math.max(tbr.width, tb.querySelector('.tb-date')?.getBoundingClientRect().right - tbr.left + 160) : 16;
    const avail = tr.right - others - left - 12 - 52;
    // three on a phone, four on a small window, five on a big one (the director: three to five, then "+N")
    const most = innerWidth < 1000 ? 3 : innerWidth < 1300 ? 4 : CAP_MAX;
    capN = Math.max(1, Math.min(most, Math.floor(avail / pitch())));
    rail.style.width = `${capN * pitch() + 52}px`;
    return capN;
  }
  // along the top band; on a phone held sideways, down the right edge
  // (from the right: the first stands next to the Log, the others to its left, "+N" after the last)
  const slide = (d) => `translateX(${(-d).toFixed(0)}px)`;
  function nodes(it) {
    let n = els.get(it.key);
    if (n) return n;
    const tok = h('button', 'tok');
    tok.type = 'button';
    tok.innerHTML = `<span class="tok-ic"></span><span class="tok-tag"></span>`;
    tok.style.transform = `${slide(0)} scale(0.5)`;
    tok.style.opacity = '0';
    rail.insertBefore(tok, more);
    const mk = h('button', 'amk');
    mk.type = 'button';
    mk.innerHTML = `<span class="amk-ic"></span><span class="amk-tag"></span>`;
    const ar = h('button', 'amk-arrow');
    ar.type = 'button';
    ar.innerHTML = `<span class="ar-p"></span><span class="ar-i"></span>`;
    layer.append(mk, ar);
    // it came: the marker on the map pulses once, in step with the token popping in
    mk.classList.add('pop');
    mk.addEventListener('animationend', (e) => { if (e.animationName === 'amkpop') mk.classList.remove('pop'); });
    U.sfx(it.kind === 'prayer' ? 'prayer.new' : 'token.new');
    const key = it.key;
    const lit = (on) => { hot = on ? key : hot === key ? null : hot; const e = els.get(key); if (e) for (const x of [e.tok, e.mk, e.ar]) x.classList.toggle('hot', on); };
    for (const x of [tok, mk, ar]) {
      x.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') lit(true); });
      x.addEventListener('pointerleave', () => lit(false));
      x.addEventListener('focus', () => lit(true));
      x.addEventListener('blur', () => lit(false));
    }
    // (a token opens its detail and leaves the view where it is: the camera moves only when the player asks,
    // with a marker, an arrow or "Look there")
    tok.addEventListener('click', () => { if (openKey === key) close(); else openItem(key, true, tok); });
    mk.addEventListener('click', () => openItem(key, true, mk));
    ar.addEventListener('click', () => openItem(key, true, ar));
    n = { tok, mk, ar, sig: '', off: 0, fresh: true };
    els.set(key, n);
    void tok.offsetWidth;
    return n;
  }
  function paintStatic(it, n) {
    const sig = `${it.sev}|${it.icon}|${it.title}`;
    if (n.sig === sig) return;
    n.sig = sig;
    for (const x of [n.tok, n.mk, n.ar]) { for (const s of ['bad', 'warn', 'pray', 'good', 'info']) x.classList.toggle(`sev-${s}`, it.sev === s); x.dataset.kind = it.kind; }
    const sl = sealOf(it);
    setHtml(n.tok.querySelector('.tok-ic'), tokenSeal({ ...sl, size: 46 }));
    setHtml(n.mk.querySelector('.amk-ic'), markerSvg({ sign: sl.sign, group: sl.group, serious: sl.level === 'serious', draw: sl.draw }));
    setHtml(n.ar.querySelector('.ar-i'), sl.sign ? signSvg(sl.sign, 20) : icon(it.icon, 20));
    for (const x of [n.tok, n.mk]) x.dataset.group = sl.group;
    const words = it.title;
    n.tok.setAttribute('aria-label', `${words}. Open its detail.`);
    tip(n.tok, words, it.kind === 'prayer' ? 'A prayer. Open it to answer.' : 'Open its detail on the right.');
    n.mk.setAttribute('aria-label', `${words}. Open its detail.`);
    n.mk.title = words;
    n.ar.setAttribute('aria-label', `${words}, off screen. Look there.`);
    n.ar.title = `${words} (off screen)`;
  }
  function paintTime(it, n) {
    const l = left(it, it.when);
    if (l.raw != null && !firstLeft.has(it.key)) firstLeft.set(it.key, Math.max(l.raw, 0.001));
    // the ring's whole is the warning's own span, from when it was first foreseen (or the prayer was made) to the
    // moment it lands, so the ring shows the exact share of time left (research #3); else the time when first seen
    const w = it.when;
    const whole = l.years != null && Number.isFinite(w?.since) && w.atYear > w.since && w.since > -1e5 ? w.atYear - w.since
      : it.kind === 'prayer' && Number.isFinite(it.src?.year) && it.src.expires > it.src.year ? it.src.expires - it.src.year
        : firstLeft.get(it.key);
    const frac = l.raw == null || !whole ? 1 : Math.max(0, Math.min(1, l.raw / whole));
    // the glaze drains with the time left
    n.frac = frac;
    setGlaze(n.tok.querySelector('.tok-ic'), frac);
    // the last quarter: the seal wobbles gently (never blinks), and one low tick, once
    const lastQ = l.raw != null && frac <= 0.25 && !l.life;
    if (lastQ !== !!n.last) { n.last = lastQ; n.tok.classList.toggle('last', lastQ); n.mk.classList.toggle('last', lastQ); if (lastQ && !n.ticked) { n.ticked = true; U.sfx('ring.last'); } }
    setText(n.tok.querySelector('.tok-tag'), l.short);
    setText(n.mk.querySelector('.amk-tag'), l.short);
    setHidden(n.tok.querySelector('.tok-tag'), !l.short);
    setHidden(n.mk.querySelector('.amk-tag'), !l.short);
    n.tok.classList.toggle('soon', !!l.urgent);
    n.mk.classList.toggle('soon', !!l.urgent);
    return l;
  }
  // The rail is one row with even gaps, always (Round 4, the director saw two tokens on top of each other and the
  // "+5" chip on a token): a token on its way to the Log keeps its place until it has turned into its blob, and
  // nothing new comes onto the rail while one is leaving; slides have no overshoot, so neighbours never cross.
  const leaving = new Map();      // key -> { tok, idx }
  let lastLayout = [], heldT = 0;
  const seenOnRail = (n) => !!n && !n.tok.hidden && n.tok.style.opacity === '1';
  function release(key) { if (leaving.delete(key)) drawRail(); }
  function drawRail() {
    const P = pitch();
    capNow();
    const live = new Set(order);
    // gone: EVERYTHING that leaves the rail goes to the Log as a blob (the director's moment, research #1); one the
    // player dealt with first takes a "Saved" stamp (#6) and leaves gold; one that ended badly leaves clay red; one
    // that only lapsed, or news, leaves grey. An open detail sends its blob from the slot's badge instead.
    for (const [k, n] of [...els]) {
      if (live.has(k)) continue;
      // acted on, the thing still there: only the token goes, into the Log (a grey blob: put away, not yet decided);
      // the marker is kept for while its detail is open
      if (putAway(k)) {
        if (n.away) continue;
        n.away = true;
        const seen = seenOnRail(n) && !leaving.has(k);
        n.tok.style.pointerEvents = 'none';
        if (!seen) { if (!leaving.has(k)) n.tok.remove(); continue; }
        leaving.set(k, { tok: n.tok, idx: Math.max(0, lastLayout.indexOf(k)) });
        flyToLog(n.tok, false, 'actioned', null, k);
        continue;
      }
      els.delete(k);
      n.mk.remove(); n.ar.remove();
      // (its token already went into the Log when it was acted on)
      if (n.away) { if (openKey === k) close(true); resolved.delete(k); lost.delete(k); continue; }
      const fromSlot = openKey === k ? $('.sd-badge') : null;
      const fromRect = fromSlot && U.slot.shown === 'detail' ? fromSlot.getBoundingClientRect() : null;
      if (openKey === k) close(true);
      const visible = seenOnRail(n) && !leaving.has(k);
      if (!visible && !fromRect) { if (!leaving.has(k)) n.tok.remove(); continue; }
      const outcome = resolved.has(k) ? 'saved' : lost.has(k) ? 'lost' : 'news';
      resolved.delete(k); lost.delete(k);
      n.tok.style.pointerEvents = 'none';
      if (visible) leaving.set(k, { tok: n.tok, idx: Math.max(0, lastLayout.indexOf(k)) });
      // only a token the player resolved (gold) or lost (red) flies to the Log; one that lapsed or was news just goes,
      // and the scroll swells as it fills
      if (outcome === 'news') { fadeOut(n.tok, k); U.logSwell?.(); continue; }
      if (outcome === 'saved' && visible && !(U.fx?.reduce?.())) {
        const st = h('span', 'tok-stamp', 'Saved');
        n.tok.appendChild(st);
        U.sfx('token.saved');
        U.fx?.buzz?.(12);
        setTimeout(() => flyToLog(n.tok, false, outcome, fromRect, k), 360);
      } else flyToLog(n.tok, false, outcome, fromRect, k);
    }
    // beyond five: counted, in the Log, and not drawn as tokens (their markers still show on the map); one that
    // was on show and is pushed out flies into the Log, so the eye sees where it went
    for (const k of order.slice(capN)) {
      const it = items.get(k), n = nodes(it);
      paintStatic(it, n);
      if (leaving.has(k)) continue;
      if (seenOnRail(n) && lastLayout.includes(k)) { leaving.set(k, { tok: n.tok, idx: lastLayout.indexOf(k) }); fadeOut(n.tok, k, true); continue; }
      if (!n.flying) { n.tok.style.opacity = '0'; setHidden(n.tok, true); }
    }
    // the row: the five to show; while one is leaving, only those already on show, with the leaving ones in their
    // own places (what came meanwhile waits for the room)
    // (one still on its way out, called back meanwhile, waits until its blob has gone)
    const want = order.slice(0, capN).filter((k) => !els.get(k)?.flying && !leaving.has(k));
    let layout = want;
    // (while one is leaving the row is frozen as it stands: the same tokens in the same order)
    if (leaving.size) layout = lastLayout.filter((k) => leaving.has(k) || (want.includes(k) && seenOnRail(els.get(k)) && !els.get(k).fresh));
    // left to right: the tokens, the most urgent first, then "+N" (plain, next to the Log), then the Log
    const extra = Math.max(0, order.length - layout.filter((k) => !leaving.has(k)).length);
    const at = (i) => slide(((extra ? 1 : 0) + (layout.length - 1 - i)) * P);
    // those already on show move first; a new one waits until they have made room
    let shifted = false;
    for (const [i, k] of layout.entries()) {
      const n = leaving.get(k) ?? els.get(k);
      if (!n || els.get(k)?.fresh) continue;
      const tf = at(i);
      if (n.tok.style.transform !== tf) {
        // (an arrival still flying to its old place lands at once, so it cannot hold that place over a neighbour)
        if (!leaving.has(k)) for (const a of n.tok.getAnimations()) if (!a.transitionProperty) a.finish();
        n.tok.style.transform = tf; shifted = true;
      }
    }
    // (still sliding from a moment ago counts too): the new ones wait, their places kept empty, and come next time
    const busy = shifted || layout.some((k) => !els.get(k)?.fresh && (els.get(k)?.tok.getAnimations() ?? []).some((a) => a.transitionProperty === 'transform' && a.playState === 'running'));
    let held = false;
    layout.forEach((k, i) => {
      const tf = at(i);
      if (leaving.has(k)) return;
      const it = items.get(k), n = nodes(it);
      paintStatic(it, n);
      // a new one starts small in its own place (never slides in across its neighbours), once they have moved
      if (n.fresh) {
        if (busy) { held = true; return; }
        n.tok.style.transition = 'none'; n.tok.style.transform = `${tf} scale(0.5)`; void n.tok.offsetWidth; n.tok.style.transition = '';
      }
      if (n.tok.style.transform !== tf) n.tok.style.transform = tf;
      if (n.tok.style.opacity !== '1') n.tok.style.opacity = '1';
      setHidden(n.tok, false);
      if (n.fresh) { n.fresh = false; arrive(it, n); }
      n.tok.classList.toggle('sel', openKey === k);
      n.mk.classList.toggle('sel', openKey === k);
    });
    // waiting for room: out of sight until their turn
    for (const k of want) if (!layout.includes(k)) { const n = els.get(k); if (n && !n.fresh && !leaving.has(k) && !n.flying) { n.tok.style.opacity = '0'; setHidden(n.tok, true); n.fresh = true; } }
    if (held && !heldT) heldT = setTimeout(() => { heldT = 0; drawRail(); }, 280);
    lastLayout = layout;
    setText(more.querySelector('span'), extra ? `+${extra}` : '');
    more.classList.toggle('shown', extra > 0);
    more.style.transform = slide(0);
    rail.classList.toggle('empty', !order.length && !leaving.size);
  }
  // a token that goes without being dealt with: it fades where it stands (keep: it may come back, past the count)
  function fadeOut(tok, key, keep = false) {
    const n = [...els.values()].find((x) => x.tok === tok);
    if (n) n.flying = true;
    tok.style.opacity = '0';
    setTimeout(() => {
      if (keep && els.get(key)?.tok === tok) { setHidden(tok, true); if (n) { n.flying = false; n.fresh = true; } } else tok.remove();
      release(key);
    }, 200);
  }
  // a token leaving for the Log: a quick squash, then it becomes a 14 px blob of its outcome's colour that flies on
  // an arc to the Log button (with three trail dots); the Log gulps and its count rolls on the landing frame. Its
  // place on the rail is given up the moment the token itself is out of sight.
  const resolved = new Set(), lost = new Set();
  function flyToLog(tok, keep, outcome = 'news', fromRect = null, key = null) {
    const n = [...els.values()].find((x) => x.tok === tok);
    if (n) n.flying = true;
    const logB = U.root.querySelector('.logb');
    const r = fromRect ?? tok.getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const gone = () => { tok.style.opacity = '0'; if (key != null) release(key); };
    const done = () => {
      tok.style.transition = '';
      for (const a of tok.getAnimations?.() ?? []) a.cancel();
      if (keep && key != null && els.get(key)?.tok === tok) { tok.style.opacity = '0'; setHidden(tok, true); if (n) { n.flying = false; n.fresh = true; } } else tok.remove();
    };
    const land = () => { U.fx?.pulse?.(logB, 'dl-gulp'); bumpLog(); U.sfx('token.land'); };
    U.sfx('token.tolog');
    if (!U.fx || U.fx.reduce() || !logB || !logB.getClientRects().length || !tok.animate) { tok.style.transition = 'none'; gone(); setTimeout(() => { done(); land(); }, 160); return; }
    // anticipation: 115% wide, 85% tall for 70 ms, then the token is gone and the blob is in flight
    // (on the transform itself: the `scale` property would scale the slide along the rail too, and push it onto
    // its neighbour)
    for (const a of tok.getAnimations()) if (!a.transitionProperty) a.cancel();   // (an arrival still running would hold it in sight)
    const base = tok.style.transform || 'none';
    tok.animate([{ transform: base }, { transform: `${base === 'none' ? '' : base} scale(1.15, 0.85)` }], { duration: 70, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    setTimeout(() => {
      tok.style.transition = 'none';
      gone();
      const pray = tok.classList.contains('sev-pray');
      U.fx.fly(from, logB, { cls: `${outcome}${pray ? ' pray' : ''}`, size: 14, onLand: land });
      setTimeout(done, 200);
    }, 70);
  }
  function bumpLog() {
    const b = U.root.querySelector('.logb');
    if (!b) return;
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }
  // a token arrives from the side of the screen where its place is (or rises from its marker when that is on
  // screen): a small dot on an arc to its slot, then the pop (research #2)
  function arrive(it, n, delay = 0) {
    if (!U.fx || U.fx.reduce() || !n.tok.animate) return;
    const tr = n.tok.getBoundingClientRect();
    if (!tr.width) return;
    let fx = null, fy = null;
    if (Number.isFinite(it.x) && Number.isFinite(it.z)) {
      const p = ctx.camera.toScreen(it.x, (it.subject?.y ?? ctx.vox?.standY?.(Math.floor(it.x), Math.floor(it.z)) ?? 16) + 3, it.z);
      if (!p.behind && p.x > 0 && p.y > 0 && p.x < innerWidth && p.y < innerHeight) { fx = p.x; fy = p.y; }
      else {
        // off screen: the edge it lies beyond
        const cx = innerWidth / 2, cy = innerHeight / 2;
        let dx = p.x - cx, dy = p.y - cy; if (p.behind) { dx = -dx; dy = -dy; }
        const k = Math.min(Math.abs(cx / (dx || 1e-6)), Math.abs(cy / (dy || 1e-6)));
        fx = Math.max(0, Math.min(innerWidth, cx + dx * k)); fy = Math.max(0, Math.min(innerHeight, cy + dy * k));
      }
    }
    if (fx == null) return;
    const base = n.tok.style.transform;
    const dx = fx - (tr.left + tr.width / 2), dy = fy - (tr.top + tr.height / 2);
    const dist = Math.hypot(dx, dy);
    const dur = Number.isFinite(dist) ? Math.min(380, 220 + dist * 0.1) : 220;   // with the pop, never past 500 ms (research rule 3)
    // the path: to just off the rail, straight out from its own place (below it; beside it on a phone), then into
    // the place, so the dot never passes over its neighbours (Round 4: the rail is one row, always)
    const ax = 0, ay = 40;
    n.tok.animate([
      { transform: `${base} translate(${Number.isFinite(dx) ? dx.toFixed(0) : 0}px, ${Number.isFinite(dy) ? dy.toFixed(0) : 0}px) scale(0.22)`, opacity: 0.9 },
      { transform: `${base} translate(${ax}px, ${ay}px) scale(0.3)`, opacity: 1, offset: 0.55 },
      { transform: `${base} scale(0.3)`, opacity: 1, offset: 0.8 },
      { transform: `${base} scale(1.12)`, offset: 0.92 },
      { transform: base, opacity: 1 },
    ], { duration: dur + 110, delay, fill: 'backwards', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
  }

  // the part of the window the HUD leaves clear: markers outside it become arrows on its edge
  let clear = { l: 100, t: 120, r: innerWidth - 20, b: innerHeight - 20 };
  function clearBox() {
    const r = (e) => { if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden' ? b : null; };
    const top = Math.max(r(U.time?.el)?.bottom ?? 0, r(U.topbar)?.bottom ?? 0, 60);
    const sheet = U.slot.open ? r(U.slot.el) : null;
    const sa = U.safe?.() ?? { l: 0, r: 0 };
    const box = { l: Math.max(16, sa.l + 8), t: top + 8, r: innerWidth - Math.max(16, sa.r + 8), b: innerHeight - 76 };
    if (sheet) box.r = Math.min(box.r, sheet.left - 14);
    if (box.b - box.t < 80) box.b = box.t + 80;
    if (box.r - box.l < 80) box.r = box.l + 80;
    return box;
  }
  function drawMarkers() {
    const W = innerWidth, H = innerHeight, box = clear, placed = [], arrows = [];
    // (who already has a map marker over them: the small head signs in marks.js stand down for these, so the two never pile up)
    const marked = U.markedPeople ?? (U.markedPeople = new Set()); marked.clear();
    const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
    // (one acted on shows its marker only while its own detail is open)
    const keys = openKey && putAway(openKey) && !order.includes(openKey) ? [...order, openKey] : order;
    for (const [k, n] of els) if (putAway(k) && k !== openKey) { setHidden(n.mk, true); setHidden(n.ar, true); }
    keys.forEach((k, idx) => {
      const it = items.get(k), n = els.get(k);
      if (!n) return;
      // past the tokens on the row a marker is not drawn (a busy village stays readable; the Log and "+N" keep them)
      const quiet = (idx >= capN || putAway(k)) && openKey !== k;
      if (quiet || !Number.isFinite(it.x) || !Number.isFinite(it.z)) { setHidden(n.mk, true); setHidden(n.ar, true); return; }
      let y = 16;
      try { const s = it.subject; y = s && Number.isFinite(s.y) && !s.dead ? s.y + 3.2 : ctx.vox.standY(Math.floor(it.x), Math.floor(it.z)) + (it.kind === 'fight' ? 7 : 4); } catch { /* no world */ }
      const sx = it.subject && !it.subject.dead && Number.isFinite(it.subject.x) ? it.subject.x : it.x, sz = it.subject && !it.subject.dead && Number.isFinite(it.subject.z) ? it.subject.z : it.z;
      const p = ctx.camera.toScreen(sx, y, sz);
      let on = !p.behind && p.x > box.l && p.x < box.r && p.y > box.t + 30 && p.y < box.b + 20;
      setHidden(n.mk, !on);
      // off screen: only a serious one gets the red indicator at the edge, and only once its turn has come (at most
      // one new serious interrupt a minute)
      setHidden(n.ar, on || it.level !== 'serious' || !interrupted(it));
      if (on) {
        // two markers close together stack upward instead of covering each other
        let yy = p.y;
        for (let i = 0; i < 6; i++) { const hit = placed.find((q) => Math.abs(q.x - p.x) < 48 && Math.abs(q.y - yy) < 52); if (!hit) break; yy = hit.y - 54; }
        placed.push({ x: p.x, y: yy });
        if (it.subject) marked.add(it.subject);
        // (the `translate` property, not transform: the pop's `scale` would scale a transform's translation too)
        const tf = `${p.x.toFixed(1)}px ${yy.toFixed(1)}px`;
        if (n.mkAt !== tf) { n.mkAt = tf; n.mk.style.translate = tf; }
        return;
      }
      let dx = p.x - cx, dy = p.y - cy;
      if (p.behind) { dx = -dx; dy = -dy; }
      const kk = Math.min(Math.abs((dx > 0 ? box.r - cx : box.l - cx) / (dx || 1e-6)), Math.abs((dy > 0 ? box.b - cy : box.t - cy) / (dy || 1e-6)));
      let ax = Math.max(box.l + 22, Math.min(box.r - 22, cx + dx * kk)), ay = Math.max(box.t + 22, Math.min(box.b - 22, cy + dy * kk));
      // arrows on the same stretch of edge stand side by side along it, never on top of each other
      const side = Math.abs(ax - box.l) < 2 || Math.abs(ax - box.r) < 2;
      for (let i = 0; i < 8 && arrows.some((q) => Math.hypot(q.x - ax, q.y - ay) < 48); i++) { if (side) ay = Math.min(box.b - 22, ay + 50); else ax = Math.min(box.r - 22, ax + 50); }
      arrows.push({ x: ax, y: ay });
      setAttr(n.ar, 'style', `transform: translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px); --a: ${Math.atan2(dy, dx).toFixed(2)}rad;`);
    });
  }

  // ---------- the detail ----------
  // a token, a marker or an edge indicator: the camera travels to the thing in a fixed time, then its detail opens
  // (nothing teleports; the view does not move again when it closes)
  function openItem(key, glide = true, srcEl = null) {
    const it = items.get(key);
    if (!it) return;
    // acted on: it leaves the rail and the map now, and its entry moves under "Actioned" in the Log
    markActioned(it, 'You opened it.');
    const go = () => showItem(key, srcEl);
    if (glide && Number.isFinite(it.x) && Number.isFinite(it.z)) {
      const s = it.subject && !it.subject.dead && Number.isFinite(it.subject.x) ? it.subject : null;
      U.glide(s ? s.x : it.x, s ? s.z : it.z, { then: go, ppm: it.kind === 'fight' ? 9 : 5 });
    } else go();
  }
  function showItem(key, srcEl) {
    const it = items.get(key);
    if (!it) return;
    openKey = key;
    sd.dataset.kind = it.kind;
    detailSig = '';
    fillDetail();
    U.slot.show('detail');
    // the sheet grows out of the token (or marker) that opened it (research #4), 260 ms, decelerating
    if (srcEl && U.fx && !U.fx.reduce() && U.slot.el.animate && srcEl.getClientRects().length) {
      const a = srcEl.getBoundingClientRect(), slot = U.slot.el;
      slot.getAnimations().forEach((x) => x.cancel());
      const b = slot.getBoundingClientRect();
      if (a.width && b.width) {
        const sx = a.width / b.width, sy = a.height / b.height;
        slot.animate([{ transformOrigin: '0 0', transform: `translate(${(a.left - b.left).toFixed(1)}px, ${(a.top - b.top).toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`, opacity: 0.6 },
          { transformOrigin: '0 0', transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0, 0, 0.2, 1)' });
        sd.querySelector('.sd-scroll')?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: 380 });
      }
    }
    drawRail();
  }
  function close(quiet) {
    if (!openKey) return;
    openKey = null;
    U.slot.hide('detail');
    if (!quiet) U.sfx('ui.close');
    drawRail();
  }
  const keyOf = (power) => {
    const t = (U.get('god', 'tools') ?? []).find((x) => x.id === power);
    return t?.hotkey ?? '';
  };
  const nameOf = (power) => (U.get('god', 'tools') ?? []).find((x) => x.id === power)?.name ?? cap(String(power ?? ''));
  const seenWords = (o) => (o.land ? '' : o.seenBy == null ? '' : o.seenBy === 0 ? 'nobody sees' : `seen by ${o.seenBy}`);
  const asText = (x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? [x.name, x.text ?? x.change ?? x.after].filter(Boolean).join(': ') : '');
  // a power's own forecast for an option, asked at most once a second while the detail is open
  const fcCache = new Map();
  function forecastOf(o) {
    if (!o?.power || o.land || !o.target) return null;
    const k = `${o.power}|${o.target.entity?.id ?? `${o.target.x},${o.target.z}`}`;
    const c = fcCache.get(k), t = performance.now();
    if (c && t - c.t < 1000) return c.f;
    const f = U.call('sim', 'forecast', o.power, o.target) ?? null;
    fcCache.set(k, { t, f });
    if (fcCache.size > 40) fcCache.delete(fcCache.keys().next().value);
    return f;
  }
  const strip = (s) => cap(String(s ?? '').replace(/^Do nothing:\s*/i, ''));
  const normF = (F) => {
    const one = (x) => ({ headline: String(x?.headline ?? ''), key: arr(x?.key).map(String), full: arr(x?.full).map(String), who: x?.who ? String(x.who) : '' });
    return { act: one(F.act), wait: one(F.wait), third: F.third ? { ...one(F.third), label: String(F.third.label ?? 'Or'), how: String(F.third.how ?? '') } : null };
  };
  // a warning's two futures, as the simulation tells them (the choices agent's `warningFutures`), at most once a second
  const wfCache = new Map();
  function warningFutures(v) {
    const k = v.key ?? v.id, c = wfCache.get(k), t = performance.now();
    if (c && t - c.t < 1000) return c.f;
    const f = U.call('sim', 'ask', 'warningFutures', v.id ?? v.key) ?? (v.id != null ? U.call('sim', 'ask', 'warningFutures', v.key) : null) ?? null;
    wfCache.set(k, { t, f });
    if (wfCache.size > 40) wfCache.delete(wfCache.keys().next().value);
    return f;
  }
  // both futures, and what to offer
  function compose(it) {
    const out = { what: '', voice: '', act: { headline: '', key: [], full: [] }, wait: { headline: '', key: [], full: [] }, third: null, acts: [], account: [], fut: true };
    const F = it.src?.futures ?? it.src?.v?.futures ?? (it.kind === 'fore' ? warningFutures(it.src.v) : null);
    if (it.kind === 'fore') {
      const { v, views } = it.src;
      out.what = v.text ?? '';
      const ok = (v.options ?? []).filter((o) => o.works !== false);
      const bad = (v.options ?? []).filter((o) => o.works === false);
      const best = ok[0] ?? null;
      const f = best ? forecastOf(best) : null;
      out.act.headline = best ? `${best.label}.` : (v.options ?? []).length ? FORE.noneNow : 'There is nothing your powers can do about this.';
      out.act.key = [
        ...(best && f?.ok !== false ? [...arr(f?.gains).map(asText), ...arr(f?.fates).map(asText)].slice(0, 2) : []),
        ...ok.map((o) => `${o.label}${seenWords(o) ? `: ${seenWords(o)}` : ''}.`),
        ...ok.map((o) => o.early).filter(Boolean),
      ].filter(Boolean).slice(0, 4);
      out.act.full = [
        ...(f && f.ok !== false ? [...arr(f.costs).map((c) => `Cost: ${asText(c)}`), ...arr(f.later).map((c) => `Later: ${asText(c)}`), f.who].filter(Boolean) : []),
        ...ok.map((o) => o.who).filter(Boolean),
        ...bad.map((o) => `${o.label}: would not work now.`),
      ];
      out.wait.headline = v.nothing ? `${strip(v.nothing)}${/[.!?]$/.test(strip(v.nothing)) ? '' : '.'}` : v.text ?? '';
      out.wait.key = arr(v.cause).slice(0, 2);
      out.wait.full = [...arr(v.cause).slice(2), ...views.slice(1).map((r) => `Also: ${r.title}, ${left(it, r).main}.`)];
      for (const o of ok.slice(0, 3)) {
        const deer = o.via === 'sim.spawnAnimal' || o.power === 'deer';
        out.acts.push({ label: o.label, seen: seenWords(o), harsh: o.harsh, key: deer ? '' : keyOf(o.power), go: () => (deer ? deerOption(it, o) : arm(it, o.power, o.target, o.land)) });
      }
    } else if (it.kind === 'prayer') {
      const p = it.src;
      out.voice = p.text ? `"${String(p.text).replace(/^"|"$/g, '')}"` : '';
      out.what = `${p.name ?? p.person?.name ?? 'Someone'}${p.clan ? ` of ${p.clan}` : ''} is praying to you${p.wish ? `, for ${String(p.wish).replace(/[.]$/, '')}` : ''}.${p.expiresLabel ? ` The prayer lapses in ${p.expiresLabel}.` : ''}`;
      const ans = p.answer ?? null;
      const ansName = ans?.via === 'sim.spawnAnimal' || ans?.power === 'deer' ? 'A deer' : nameOf(ans?.power);
      out.act.headline = arr(p.ifAnswered)[0] ?? (ans ? `${ansName} answers it. Faith rises.` : 'Answered, their faith rises.');
      out.act.key = arr(p.ifAnswered).slice(1, 3);
      out.act.full = arr(p.ifAnswered).slice(3);
      out.wait.headline = arr(p.ifNot)[0] ?? 'Unanswered, their skepticism grows.';
      out.wait.key = arr(p.ifNot).slice(1, 3);
      out.wait.full = arr(p.ifNot).slice(3);
      if (ans?.power) {
        const deer = ans.via === 'sim.spawnAnimal' || ans.power === 'deer';
        out.acts.push({ label: `Answer: ${deer ? 'put a deer down' : nameOf(ans.power)}`, primary: true, key: deer ? '' : keyOf(ans.power), go: () => answer(it, p) });
        // the price first: the power aimed at the prayer's target (a deer: the Animals tool on Deer, looking there)
        if (deer) out.acts.push({ label: 'Put it down yourself', go: () => arm(it, 'animal.deer', ans.target, true) });
        else out.acts.push({ label: 'See the price first', go: () => arm(it, ans.power, ans.target ?? p.person) });
      }
    } else if (it.kind === 'fight') {
      const f = it.src;
      const n = (c, i) => f.sides?.[i]?.n ?? c?.members?.filter?.((m) => !m.dead).length ?? '?';
      out.what = f.A && f.B ? `The ${f.A.name} (${n(f.A, 0)}) against the ${f.B.name} (${n(f.B, 1)}).${f.phase ? ` ${cap(String(f.phase))}.` : ''}` : 'A fight between your people.';
      out.act.headline = 'Calm one side, bless the other\'s weapons, or strike.';
      out.act.key = ['Calming is never seen. A blessing is.'];
      out.wait.headline = 'They fight it out. Some will die.';
      const lead = (c) => c?.members?.find?.((m) => !m.dead) ?? null;
      const a = lead(f.A), b = lead(f.B);
      if (a) out.acts.push({ label: `Calm the ${f.A.name}`, key: keyOf('calm'), go: () => arm(it, 'calm', a) });
      if (b) out.acts.push({ label: `Bless the ${f.B.name}'s weapons`, key: keyOf('bless-weapons'), go: () => arm(it, 'bless-weapons', b) });
    } else if (it.kind === 'hard') {
      const hd = it.src;
      out.what = hd.text ?? `${it.title}.`;
      if (hd.kind === 'fire' || hd.kind === 'drought') { out.act.headline = hd.kind === 'fire' ? 'Rain puts it out.' : 'Rain ends it.'; out.acts.push({ label: 'Bring rain there', key: keyOf('bless-harvest'), go: () => arm(it, 'bless-harvest', { kind: 'area', x: hd.x, z: hd.z, r: SUGGEST_R }) }); }
      else if (hd.kind === 'sickness') { const p = hd.people?.find?.((q) => !q.dead); out.act.headline = 'Heal them, one by one.'; if (p) out.acts.push({ label: `Heal ${p.name}`, key: keyOf('heal'), go: () => arm(it, 'heal', p) }); }
      else out.act.headline = 'Your powers can ease it.';
      out.wait.headline = 'It runs its course.';
    } else if (it.kind === 'moment') {
      out.what = it.src.text ?? '';
      out.act.headline = it.src.act ?? (it.src.kind === 'predator' ? 'Strike the wolf down.' : 'Act while time is slow.');
      out.wait.headline = it.src.kind === 'predator' ? 'The wolf hunts. Someone may die.' : 'It happens.';
      if (it.src.kind === 'predator') {
        // the wolf nearest the moment's place
        let wolf = it.src.entity ?? it.src.animal ?? null, bd = 30;
        if (!wolf) for (const a of arr(U.get('sim', 'animals'))) { if (a.dead || a.species !== 'wolf') continue; const d = Math.hypot(a.x - it.x, a.z - it.z); if (d < bd) { bd = d; wolf = a; } }
        if (wolf) out.acts.push({ label: 'Strike the wolf down', primary: true, key: keyOf('strike'), go: () => arm(it, 'strike', wolf) });
      }
    } else {
      // after the fact: no futures, only what happened and what would have worked
      out.fut = false;
      out.what = it.src.what ?? it.title;
      out.account = arr(it.src.lines);
      // put away: the token turns into a blob and flies to the Log, where it is kept
      // (an item may bring its own buttons first: a teaching tip's "Got it" and "Do not show tips")
      for (const a of arr(it.src.acts)) out.acts.push({ ...a, go: () => { a.go?.(); if (a.away !== false) { extras.delete(it.key); close(); lookSoon(); } } });
      if (extras.has(it.key) && !it.src.acts && it.rail !== false) out.acts.push({ label: 'Into the Log', go: () => { extras.delete(it.key); close(); lookSoon(); } });
    }
    if (F?.act && F?.wait) {
      const n = normF(F);
      // the simulation's own account; who would see it closes the full account
      // (a warning whose futures found no working option while the warning itself lists one that works: the
      // warning's own act column stays, so the god is never told "nothing can be done" beside a button that can)
      const noAct = it.kind === 'fore' && !F.act?.option && out.acts.length > 0;
      if (!noAct) out.act = { ...n.act, full: [...n.act.full, n.act.who].filter(Boolean) };
      out.wait = { ...n.wait, full: [...n.wait.full, n.wait.who].filter(Boolean) };
      out.third = n.third;
    }
    // no line said twice in a column (the warning's own lines and the simulation's account can overlap)
    for (const col of [out.act, out.wait]) {
      const norm = (x) => String(x).toLowerCase().replace(/\s+/g, ' ').trim();
      const seen = new Set([norm(col.headline)]);
      const once = (l) => l.filter((x) => { const k = norm(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
      col.key = once(arr(col.key)); col.full = once(arr(col.full));
    }
    return out;
  }
  let detailSig = '';
  function fillDetail() {
    const it = openKey ? items.get(openKey) : null;
    if (!it) return;
    const c = compose(it);
    const sig = JSON.stringify([it.key, it.title, it.icon, it.sev, c.what, c.voice, c.act, c.wait, c.third, c.account, c.acts.map((a) => [a.label, a.seen])]);
    if (sig === detailSig) return;
    detailSig = sig;
    for (const s of ['bad', 'warn', 'pray', 'good', 'info']) sd.classList.toggle(`sev-${s}`, it.sev === s);
    setHtml($('.sd-ic'), tokenSeal({ ...sealOf(it), size: 40 }));
    setText($('.sd-title'), it.title);
    setText($('.sd-what'), c.what);
    setHidden($('.sd-what'), !c.what);
    setText($('.sd-voice'), c.voice);
    setHidden($('.sd-voice'), !c.voice);
    setHidden($('.sd-fut'), !c.fut);
    setHidden($('.sd-depth'), !c.fut);
    for (const [cls, f] of [['.sd-act', c.act], ['.sd-wait', c.wait]]) {
      const col = $(cls);
      setText(col.querySelector('.sd-hl'), f.headline || '-');
      fillList(col.querySelector('.sd-key'), f.key);
      fillList(col.querySelector('.sd-full'), f.full);
    }
    // a third future, offered rarely by the simulation and only when it truly works ("wait for night")
    const th = $('.sd-third');
    setHidden(th, !c.third);
    if (c.third) {
      setText(th.querySelector('.sd-tl'), `Or: ${c.third.label}`);
      setText(th.querySelector('.sd-hl'), [c.third.headline, c.third.how].filter(Boolean).join(' '));
      fillList(th.querySelector('.sd-key'), c.third.key);
      fillList(th.querySelector('.sd-full'), c.third.full);
    }
    fillList($('.sd-acc'), c.account);
    const box = $('.sd-acts');
    box.innerHTML = '';
    c.acts.forEach((a, i) => {
      const b = h('button', `btn sd-b${a.primary || i === 0 ? ' primary' : ''}${a.harsh ? ' harsh' : ''}`, `<span class="sd-bl">${esc(a.label)}</span>${a.seen ? `<span class="sd-bs">${icon(a.seen === 'nobody sees' ? 'unseen' : 'seen', 14)}${esc(a.seen)}</span>` : ''}`);
      b.type = 'button';
      b.dataset.primary = '';
      if (a.key) tip(b, a.label, '', a.key);
      b.addEventListener('click', a.go);
      box.appendChild(b);
    });
    setHidden(box, !c.acts.length);
    setHidden($('.sd-look'), !Number.isFinite(it.x));
  }
  function fillList(ul, list) {
    const key = list.join('|');
    if (ul.dataset.k === key) return;
    ul.dataset.k = key;
    ul.innerHTML = list.map((t) => `<li>${esc(t)}</li>`).join('');
    setHidden(ul, !list.length);
  }
  function tickDetail() {
    const it = openKey ? items.get(openKey) : null;
    if (!it) return;
    if (sd.dataset.depth !== String(U.settings.depth)) paintDepth();
    const l = left(it, it.when);
    setText($('.sd-time b'), l.life ? '' : l.main);
    setText($('.sd-time i'), l.life ? '' : clock.paused ? `${l.sub ? `${l.sub}, ` : ''}${FORE.pausedNote}` : l.sub ? (l.years != null ? `${l.sub}, about ${longS(l.real)}` : l.sub) : l.real != null && l.secs != null ? `at this speed` : '');
    const n = els.get(openKey);
    setGlaze($('.sd-ic'), n?.frac ?? 1);
    sd.classList.toggle('soon', !!l.urgent);
  }
  // arm a power on a target: its trade off shows in this slot, over the detail; once it lands the detail goes
  function arm(it, power, target, land) {
    if (!power) return;
    const t = target?.entity ?? target;
    const x = target?.x ?? t?.x, z = target?.z ?? t?.z;
    // the view stays where it is; only when the place is out of sight does it glide there, so the act can be seen
    if (Number.isFinite(x)) {
      const s = ctx.camera.toScreen(x, ctx.vox?.standY?.(Math.floor(x), Math.floor(z)) ?? 16, z);
      if (s.behind || s.x < clear.l || s.x > clear.r || s.y < clear.t || s.y > clear.b) U.glide(x, z);
    }
    aimedKey = it.key;
    if (land) { U.call('god', 'setTool', power); U.hint?.(power.startsWith('animal.') ? 'Tap the ground near them to put it down. Done puts the tool down.' : 'Shape the land there. Done puts the tool down.', 5000); return; }
    armedFrom = { key: it.key, power };
    const shape = target?.kind ? { ...target, entity: target.entity ?? null } : t;
    const ok = U.call('god', 'aimAt', power, shape);
    if (!ok) U.call('god', 'setTool', power);
    U.sfx('power.arm');
  }
  // a prayer answered in one tap, the way docs/FORCES.md says: `via: 'sim.spawnAnimal'` puts a deer down (as the
  // Animals tool does: the deer, then the one witness call and god:act); anything else is god.perform(power, target)
  // a deer put down where the option or prayer says (as the Animals tool does: the deer, the one witness call, god:act)
  function putDeer(x, z) {
    const r = U.call('sim', 'spawnAnimal', 'deer', x, z);
    if (!r?.entity) { U.hint?.(r?.text ?? 'No deer could stand there.', 3000); return null; }
    const w = U.call('sim', 'witness', { kind: 'animal', x: r.entity.x, z: r.entity.z, r: 1.5, target: r.entity, animal: 'deer', count: 1 });
    const seenBy = typeof w === 'number' ? w : Number(w?.seenBy) || 0;
    U.ctx.events.emit('god:act', { kind: 'animal', power: 'deer', x: r.entity.x, z: r.entity.z, r: 1.5, seenBy, target: r.entity, animal: 'deer', count: 1 });
    return { ok: true };
  }
  // a warning's deer option (the joining pass: power 'deer', via 'sim.spawnAnimal', tool 'animals'): one tap
  function deerOption(it, o) {
    const t = o.target ?? {};
    const x = t.x ?? t.entity?.x ?? it.x, z = t.z ?? t.entity?.z ?? it.z;
    if (!Number.isFinite(x)) return;
    // (what it did is said by the answer to the act, below: helped, or not and why)
    aimedKey = it.key;
    if (putDeer(x, z)?.ok) { close(); lookSoon(); }
  }
  function answer(it, p) {
    const a = p.answer;
    let res;
    if (a.via === 'sim.spawnAnimal' || a.power === 'deer') {
      const t = a.target ?? {}, x = t.x ?? p.x, z = t.z ?? p.z;
      res = putDeer(x, z);
    } else res = U.call('god', 'perform', a.power, a.target ?? p.person);
    if (res?.ok) {
      // (the words come from the answer to the act: prayer:answered, below)
      extras.delete(it.key);
      resolved.add(it.key);
      close();
      lookSoon();
    }
  }
  U.on('god:act', (e) => {
    if (!armedFrom) return;
    if (e?.power === armedFrom.power || e?.kind === armedFrom.power) { resolved.add(armedFrom.key); if (openKey === armedFrom.key) close(true); armedFrom = null; lookSoon(); }
  });
  U.on('god:tool', ({ id } = {}) => { if (!id) armedFrom = armedFrom && openKey === armedFrom.key ? armedFrom : null; });

  // ---------- acted on: off the screen, into the Log under "Actioned" ----------
  // the Log entries that tell this thing (a warning's foresight lines, a prayer's line); one is made when there is none
  const logKeysOf = (it) => (it.kind === 'fore' ? arr(it.src?.views).map((v) => `fore:${v.key}`) : it.kind === 'prayer' && it.src?.id != null ? [`pray:${it.src.id}`] : []);
  const logEntryOf = (it) => ({ severity: it.sev === 'bad' ? 'bad' : it.sev === 'good' ? 'good' : it.sev === 'warn' ? 'warn' : 'info', text: it.title, key: `act:${it.key}`, x: it.x, z: it.z, subject: it.subject });
  function markActioned(it, status) {
    if (!it) return;
    const a = actioned.get(it.key);
    if (!a) actioned.set(it.key, { level: it.level, met: false, goneAt: 0 });
    else a.level = it.level;
    // (soft: opened again, what came of an act stays the line under it)
    U.feed?.markActioned?.(logKeysOf(it), logEntryOf(it), status, true);
    arrange(); drawRail();
  }
  // back on the screen (it grew worse, or the act did not meet the need): its old nodes go, fresh ones come
  function unAction(k) {
    actioned.delete(k);
    const n = els.get(k);
    if (n?.away) { n.tok.remove(); n.mk.remove(); n.ar.remove(); els.delete(k); leaving.delete(k); }
  }

  // ---------- what an act did for a need, said at once (the director: "FEEDBACK within 100 ms") ----------
  // The simulation answers every act on the spot, inside the act's own call (foresight.js answerAct: foresight:answer),
  // and a prayer the act answered says so in the same call (prayer:answered). What one act brings is gathered and said
  // once, at the end of that call (a microtask: no frame passes first), in the hint at the bottom middle: a tick and "It
  // helped", or a cross and "Not yet", then the simulation's own words. A warning met is gone from the screen in the
  // same moment (the simulation withdrew it; the rail and the map are redrawn now, not on the next frame); one not met
  // stays, or comes back if it had been put away, and its Log entry under "Actioned" says what came of the act.
  const heard = [];
  let heardQ = false, actNow = false, aimedKey = null;   // aimedKey: the warning whose own button the act came from
  function hear(line) { heard.push(line); if (!heardQ) { heardQ = true; queueMicrotask(sayHeard); } }
  U.on('god:act', () => { actNow = true; if (!heardQ) { heardQ = true; queueMicrotask(sayHeard); } });
  function sayHeard() {
    heardQ = false;
    const was = actNow;
    actNow = false;
    // (a prayer answered by no act of the player's says nothing here: the Log has it)
    const lines = heard.splice(0).filter((l) => !l.needsAct || was);
    if (!lines.length) return;
    // the hint says the one the act was aimed at (the nearest warning, which the simulation puts first) and a prayer it
    // answered; any other warning it touched is counted, and its words are in the Log (tested with a finger at 822 x
    // 311: four answers at once ran to eight lines and covered the time box and the tokens)
    const fore = lines.filter((l) => !l.needsAct), pray = lines.filter((l) => l.needsAct);
    const main = fore.find((l) => l.item && l.item === aimedKey) ?? fore[0] ?? pray[0];
    if (was) aimedKey = null;
    const others = fore.filter((l) => l !== main), helped = others.filter((l) => l.met === true).length;
    const more = helped ? ` It also helped ${helped === 1 ? 'one more household' : `${helped} more households`}: see the Log.` : others.length ? ` (${others.length === 1 ? 'One more' : `${others.length} more`} in the Log.)` : '';
    const text = [main.text, ...pray.filter((l) => l !== main).slice(0, 1).map((l) => l.text)].join(' ') + more;
    const no = main.met === false, yes = main.met === true;
    U.hint?.(text, Math.min(10000, 4000 + text.length * 35), { head: no ? 'Not yet' : yes ? 'It helped' : '', kind: no ? 'no' : yes ? 'yes' : '' });
    if (no || yes) U.fx?.buzz?.(no ? 8 : 12);
    for (const l of lines) {
      const it = l.item ? items.get(l.item) : null;
      if (l.met === false && l.item) { resolved.delete(l.item); unAction(l.item); }
      else if (l.met === true && l.item) { resolved.add(l.item); const a = actioned.get(l.item); if (a) a.met = true; }
      U.feed?.markActioned?.(l.logKeys ?? [], it ? logEntryOf(it) : l.entry ?? null, `${l.met === false ? 'Not yet: ' : l.met === true ? 'It helped: ' : ''}${l.text}`);
    }
    // the red sign of a warning met goes now
    pull(); arrange(); drawRail();
    if (openKey && !items.has(openKey)) close(true);
  }
  U.on('foresight:answer', (ans) => {
    for (const r of arr(ans?.results)) {
      if (!r?.text) continue;
      const item = r.key ? (r.family ? `f:fam:${r.family.id}` : `f:v:${r.key}`) : null;
      hear({ met: r.met, text: r.text, item, logKeys: r.key ? [`fore:${r.key}`] : [],
        entry: { severity: r.met === false ? 'warn' : 'good', text: r.text, key: `act:answer:${r.key ?? Math.random()}`, x: r.x, z: r.z } });
    }
  });
  U.on('prayer:answered', (p) => {
    if (!p) return;
    const who = p.name ?? p.person?.name ?? 'Someone';
    hear({ met: true, needsAct: true, text: `Answered: ${who}'s prayer. Their faith rises.`, item: p.id != null ? `p:${p.id}` : null, logKeys: p.id != null ? [`pray:${p.id}`] : [] });
  });

  // ---------- signals: items with a life, and the Log ----------
  const pos = (v) => ({ x: v?.x ?? undefined, z: v?.z ?? undefined, subject: v?.subject ?? null });
  // (during a skip the sim marks what it sends with skip: true; those go straight to the Log: no token, no blob,
  // no sound)
  const skipping = () => !!U.get('sim', 'skip')?.running || !!U.skipNow;
  function addExtra(key, item, lifeS) {
    if (!item.level) item.level = 'needs';
    if (skipping() || item?.skip || item?.src?.skip || item.level === 'ordinary') {
      if (item?.kind !== 'tip' && item?.kind !== 'grave') U.feed?.push({ severity: item.sev === 'bad' ? 'bad' : item.sev === 'good' ? 'good' : 'info', text: item.title, kind: item.kind, key, detail: arr(item.src?.lines), x: item.x, z: item.z, subject: item.subject }, { logOnly: true });
      return;
    }
    extras.set(key, { item: { key, ...item }, until: performance.now() + lifeS * 1000 });
    lookSoon();
  }
  const logLines = (v) => [...arr(v.cause), ...arr(v.options).filter((o) => o.works !== false).map((o) => `${FORE.doHeader}: ${o.label}${keyOf(o.power) ? ` (${keyOf(o.power)})` : ''}.`), v.nothing].filter(Boolean);
  const accountLines = (a) => [...arr(a.why).map((t) => `${FORE.whyHeader}: ${t}`), ...arr(a.could).map((c) => `${FORE.workedHeader}: ${c.label}. ${c.cost ?? ''}`), a.verdict, a.warned, ...arr(a.more)].filter(Boolean);
  // one Log entry per foresight, updated as it changes (FAULTS: the same family's forecast was logged again and again)
  U.on('foresight:new', (v) => { if (!v) return; U.feed?.push({ severity: v.sev, text: `Foreseen: ${v.text}`, kind: 'foresight', key: `fore:${v.key}`, detail: logLines(v), ...pos(v) }, { logOnly: true }); U.emitTeach?.('warning', v); lookSoon(); });
  U.on('foresight:update', (v) => { if (!v) return; U.feed?.push({ severity: v.sev === 'bad' ? 'bad' : 'warn', text: `Foreseen (${v.why === 'sooner' ? FORE.sooner.toLowerCase() : FORE.later.toLowerCase()}): ${v.text}`, kind: 'foresight', key: `fore:${v.key}`, detail: logLines(v), quiet: true, ...pos(v) }, { logOnly: true }); lookSoon(); });
  U.on('foresight:withdrawn', (v) => { if (!v) return; U.feed?.push({ severity: 'good', text: `${FORE.noLonger}: ${v.title}. ${v.reason ?? ''}`, kind: 'foresight', key: `fore:${v.key}`, quiet: true, ...pos(v) }, { logOnly: true }); lookSoon(); });
  U.on('foresight:landed', (v) => {
    if (!v) return;
    // the warning ended the bad way: its token leaves as a clay red blob
    lost.add(v.family ? `f:fam:${v.family.id}` : `f:v:${v.key}`);
    const a = v.account;
    if (a) {
      U.feed?.push({ severity: v.sev === 'info' ? 'info' : 'bad', text: a.what, kind: 'hindsight', key: `fore:${v.key}`, detail: accountLines(a), ...pos(v) }, { logOnly: true });
      if (v.sev !== 'info') addExtra(`a:${v.key}`, { kind: 'account', level: 'ordinary', sev: 'info', icon: v.kind === 'leave' ? 'family' : HOW_ICON[v.how] ?? 'sev-bad', title: a.what, x: v.x, z: v.z, subject: v.subject, src: { what: a.what, lines: accountLines(a) } }, 30);
      U.emitTeach?.('landed', v);
    }
    lookSoon();
  });
  const pname = (p) => p?.name ?? 'Someone';
  // (the simulation logs a new prayer itself; the answer and the lapse are logged here)
  U.on('prayer:new', () => { U.sfx('prayer.new'); lookSoon(); });
  U.on('prayer:answered', (p) => { if (p?.id != null) resolved.add(`p:${p.id}`); if (p) U.feed?.push({ severity: 'good', text: `Answered: ${p.name ?? pname(p.person)}'s prayer${p.wish ? `, for ${p.wish}` : ''}. Their faith rises.`, kind: 'prayer', key: `pray:${p.id}`, x: p.person?.x, z: p.person?.z, subject: p.person }, { logOnly: true }); lookSoon(); });
  U.on('prayer:expired', (p) => { if (p) U.feed?.push({ severity: 'info', text: p.solved ? `${p.name ?? pname(p.person)}'s prayer came right by itself. Unanswered, their skepticism grows, and they are a little stronger for it.` : `Unanswered: ${p.name ?? pname(p.person)}'s prayer lapsed. Their skepticism grows.`, kind: 'prayer', key: `pray:${p.id}`, x: p.person?.x, z: p.person?.z, subject: p.person }, { logOnly: true }); lookSoon(); });
  // a great person dies: the clan's force drops, and the god is told who and what was lost
  U.on('force:fell', (e) => {
    const p = e?.person, c = e?.clan;
    const cn = c?.name ?? (typeof c === 'string' ? c : null) ?? p?.family?.name ?? null;
    const force = String(e?.force ?? 'strength').toLowerCase();
    const lost = Number.isFinite(e?.from) && Number.isFinite(e?.to) ? `${cap(force)} falls from ${Math.round(e.from)} to ${Math.round(e.to)}.` : `Their ${force} falls.`;
    const who = e?.title ?? pname(p);
    const title = `${who} is dead${cn ? `: the ${cn} lose ${force}` : ''}`;
    // (the simulation sends its own alert to the Log; the token tells it once more, and leaves for the Log)
    addExtra(`fell:${p?.id ?? Math.random()}`, { kind: 'fell', level: 'serious', sev: 'bad', icon: 'great', title, x: p?.x, z: p?.z, subject: p, src: { what: `${who}, great in ${force}, is dead.`, lines: [cn ? `The ${cn} clan: ${lost}` : lost, 'A great person is hard to replace. A blessed line raises one in each generation.'] } }, 40);
    U.sfx('great.fell');
  });
  const KIND_WORD = { warrior: 'a great warrior', thinker: 'a great thinker', seer: 'a great seer' };
  U.on('force:great', (e) => {
    const p = e?.person;
    const force = String(e?.force ?? '').toLowerCase();
    const who = e?.title ?? pname(p);
    const what = `${who} is ${KIND_WORD[e?.kind] ?? `great${force ? ` in ${force}` : ''}`} now${e?.gifted ? ', as the blessing promised' : ''}. Keep them alive, and the clan keeps what they bring.`;
    addExtra(`great:${p?.id ?? Math.random()}`, { kind: 'great', sev: 'good', icon: 'great', title: `${who} is great`, x: p?.x, z: p?.z, subject: p, src: { what, lines: [] } }, 20);
    U.sfx('great.rise');
  });
  // a gifted child is born to a blessed line: a short celebratory beat (the delight brief), then the Log
  U.on('line:gifted', (e) => {
    const p = e?.person, n = e?.line?.name ?? null;
    const force = String(e?.force ?? '').toLowerCase();
    const what = `${pname(p)} is born to ${n ? `the ${n} line` : 'a blessed line'}, gifted${force ? ` in ${force}` : ''}. At sixteen ${p?.sex === 'm' ? 'he' : p?.sex === 'f' ? 'she' : 'they'} will be great.`;
    addExtra(`gifted:${p?.id ?? Math.random()}`, { kind: 'gifted', sev: 'good', icon: 'line', title: `A gifted child: ${pname(p)}`, x: p?.x, z: p?.z, subject: p, src: { what, lines: [] } }, 18);
    U.sfx('line.gifted');
  });
  // the people's state changes (too much faith, too little strength ...): a short token with what it does
  U.on('force:state', (e) => {
    const g = e?.group;
    if (g && g.kind && g.kind !== 'people') return;
    if (!e?.on) return;
    const F = ask('forces');
    const label = F?.label ?? String(e?.state ?? '').replace(/-/g, ' ');
    const danger = /little|much/.test(String(e?.state ?? '') + label);
    addExtra(`state:${e?.state}`, { kind: 'state', level: danger ? 'serious' : 'ordinary', sev: danger ? 'bad' : 'info', icon: 'forces', title: `Your people: ${label}`, src: { what: [F?.text, ...arr(F?.effects)].filter(Boolean).join(' ') || label, lines: ['The shape at the bottom right shows it; tap it for the World.'] } }, 25);
  });
  U.on('force:chief', (e) => {
    const p = e?.person, v = e?.village?.name ?? (typeof e?.village === 'string' ? e.village : null);
    addExtra(`chief:${p?.id ?? Math.random()}`, { kind: 'chief', sev: 'warn', icon: 'strength', title: `${pname(p)} makes ${p?.sex === 'f' ? 'herself' : 'himself'} chief${v ? ` of ${v}` : ''}`, x: p?.x, z: p?.z, subject: p, src: { what: `Too much strength: ${pname(p)}, the strongest, now takes a share of every other household's store each year. It ends when the village cools, or the chief dies.`, lines: [] } }, 30);
  });
  U.on('force:leaving', (e) => {
    const f = e?.family, v = e?.village?.name ?? (typeof e?.village === 'string' ? e.village : null);
    const m = f?.members?.find?.((x) => !x.dead) ?? null;
    addExtra(`leaving:${f?.id ?? Math.random()}`, { kind: 'leaving', level: 'serious', sev: 'bad', icon: 'family', title: `The ${f?.name ?? 'a'} family will leave for a peaceful place`, x: m?.x, z: m?.z, subject: m, src: { what: `Too much strength in ${v ?? 'their village'}: the ${f?.name ?? ''} family will leave in ${Number.isFinite(e?.year) ? yearLabel(e.year) : 'ten years'}, unless the village cools.`, lines: [] } }, 30);
  });
  U.on('line:blessed', (e) => {
    const n = e?.line?.name ?? e?.family?.name ?? e?.name;
    const force = String(e?.force ?? e?.line?.lead ?? '').toLowerCase();
    const text = `${n ? `The ${n} line` : 'A line'} is blessed${force ? ` in ${force}` : ''}: you are watching them. Each generation, one of them will be great.`;
    const p = e?.person ?? e?.line?.members?.[0] ?? e?.family?.members?.[0] ?? null;
    addExtra(`line:${n ?? Math.random()}`, { kind: 'line', sev: 'good', icon: 'line', title: `${n ? `The ${n} line` : 'A line'} is blessed`, x: p?.x, z: p?.z, subject: p, src: { what: text, lines: [] } }, 18);
    U.sfx('line.blessed');
  });
  // (line:lost: the simulation logs it itself)

  // the foresight level (Settings): the settings say, the simulation is told
  // (Standard is the way the game is meant to be played: the default until the player picks in Difficulty)
  if (!U.settings.foresightChosen || !U.settings.foresight) U.settings.foresight = 'standard';
  const tell = () => U.call('sim', 'ask', 'foresightLevel', U.settings.foresight);
  tell();
  U.foresightLevel = (lv) => { if (lv) { U.settings.foresight = lv; U.saveSettings(); tell(); lookSoon(); } return U.call('sim', 'ask', 'foresightLevel') ?? null; };

  let soon = false;
  const lookSoon = () => { soon = true; };
  U.attend = {
    // something that happened and needs no act (a discovery, say): a token for `lifeS` seconds whose detail tells
    // it; when its time is up, or it is put away, it flies to the Log
    note: (key, item, lifeS = 30) => addExtra(key, item, lifeS),
    // mark a token as dealt with by the player: when it leaves it takes the "Saved" stamp and a gold blob
    resolve: (key) => resolved.add(key),
    // aim a power from an item's own button (the grave card's Resurrect): its price shows over the detail, and once it
    // lands the item is done, as a warning's "do this" (arm, above)
    arm: (key, power, target) => { const it = items.get(key); if (it) arm(it, power, target); else U.call('god', 'aimAt', power, target); },
    open: openItem, close, get openKey() { return openKey; }, get actioned() { return [...actioned.keys()]; }, get armedFrom() { return armedFrom; }, get items() { return [...items.values()]; }, get order() { return order.slice(); }, refresh: () => { pull(); arrange(); drawRail(); } };
  U.closeSlot = () => { const k = U.slot.shown; if (k === 'detail') close(); else if (k === 'select') U.inspect?.select(null); else if (k === 'trade') U.call('god', 'setTool', null); else if (k) U.slot.hide(k); };
  U.onSlot.push((top) => { if (top !== 'detail' && openKey && !U.slot.has('detail')) { openKey = null; drawRail(); } });

  let clearT = 0;
  return {
    update() {
      pull(); arrange(); drawRail();
      setHidden(rail, clock.phase !== 'running');
      setHidden(layer, clock.phase !== 'running');
      if (openKey && !items.has(openKey)) close(true);
      fillDetail();
    },
    frame(dt) {
      simClock += clock.dt || 0;
      interruptTick();
      if (soon) { soon = false; pull(); arrange(); drawRail(); }
      for (const k of order) { const it = items.get(k), n = els.get(k); if (it && n) paintTime(it, n); }
      if (openKey && putAway(openKey)) { const it = items.get(openKey), n = els.get(openKey); if (it && n) paintTime(it, n); }
      // walking among the people (walk.js) hides the map's markers and spots: they are not laid out meanwhile
      if (!U.walking) {
        clearT -= dt;
        if (clearT <= 0) { clearT = 0.25; clear = clearBox(); }
        drawMarkers();
        try { drawSpots(); } catch (err) { U.warnOnce?.('spots', err); }
      }
      tickDetail();
    },
  };
}
