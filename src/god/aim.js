// The generic hand for every power (stage 2 seam; Strike is one registered
// power, god/power-strike.js). The god only aims and asks; the simulation owns
// the effect (docs/STAGE2-CONTRACTS.md).
//   find      what the pointer is on, by the armed power's `target`: a person, an animal
//             (both within 28 px, as stage 1's strike), a building, a clan (any member;
//             every member is ringed), an area (the brush ring, radius = the power's size
//             option) or nothing at all ('none': anywhere on the world)
//   god:aim   { power, target, aim, entity, targetKind, confirm, holdMs, forecast, title, sub, members }
//             on every new target and every 0.25 s while aimed; null when off. `target` is
//             the entity for entity targets (as in stage 1), else the target shape.
//   confirm   'hold' when the forecast or the power says so (the stricter wins), else 'click'
//   hold      a press and hold of holdMs (real time, so it works paused); god:hold reports it;
//             letting go early, sliding off (68 px), Esc, a right click or losing the target cancels
//   carry out sim.act(power, target), then the single witness call and god:act (H.act), then the
//             power is put down unless Shift was held at the press
// With no simulation there are no entity targets and a click does nothing but say so.
import { TOOL } from './tools.js';

const MAGNET = 28, HYST = 6;  // screen pixels
const GRAVE_MAGNET = 30;      // a grave is found this close to the pointer (a 60 px circle: the touch rule asks 44 at least)
const PERSON_BIAS = 6;        // an animal wins a near tie with a person (the common, lighter strike)
const SLIP = 90;              // a hold stays locked on its target; it cancels only when the pointer slides this far off
const REFRESH = 0.25;         // seconds between forecast refreshes while aimed
const AREA_EVERY = 0.1;       // an area target moving with the pointer is re-forecast at most this often
const HOLD_MS = 500;
const ENTITY = new Set(['person', 'animal', 'building', 'clan']);

export function makeAim(H, D) {
  const { pick, camera, overlay, events, clock, vox } = H.ctx;
  const A = { target: null, t: 0, hold: null, holdMs: HOLD_MS, confirm: 'click', forecast: null, members: [] };
  const clanLines = D.lines(62);
  const list = (k) => { const a = H.sim()?.[k]; return Array.isArray(a) ? a : []; };
  const alive = (e) => e && !e.dead && !e.deleted && !e.removed && e.alive !== false;
  const isAnimal = (e) => alive(e) && (e.cat === 'animal' || list('animals').includes(e));
  const isPerson = (e) => alive(e) && (!e.hidden || e.xray) && e.kind === 'person'; // xray: seen indoors on hover (ui/xray.js)
  const isBuilding = (e) => alive(e) && e.cat === 'building';
  const screenOf = (e) => camera.toScreen(e.mx ?? e.x, (e.y ?? 16) + (e.kind === 'person' ? 0.9 : 0.5), e.mz ?? e.z);
  const def = () => TOOL[H.tool]?.power ?? null;
  const kinds = (d) => new Set(Array.isArray(d.target) ? d.target : [d.target ?? 'none']);
  const fam = () => TOOL[H.tool]?.family;
  // an area power's radius from its size setting; a power whose sizes are named steps (the Rain: "Any", "1/8" ...)
  // turns its step into a radius itself (d.radius.toR). "Any" is drawn once and kept until that power is carried
  // out, so the ring shown is the rain that falls (A.anyU, drawn again after each act)
  A.anyU = Math.random();
  const sizeR = (d, opts = H.opts[`pw.${d.id}`]) => {
    const v = Number(opts?.size);
    if (typeof d.radius?.toR === 'function') return d.radius.toR(Number.isFinite(v) ? v : d.radius.value ?? 0, A.anyU);
    return v || d.radius?.value || 6;
  };
  const mist = (t) => H.ctx.edgeClear(t.x, t.z) < 0.5;

  // ---------- what is under the pointer ----------
  function findEntity(px, py, K) {
    const wantA = K.has('animal'), wantP = K.has('person') || K.has('clan'), wantB = K.has('building');
    try {
      const hit = pick.entity(px, py);
      if ((wantA && isAnimal(hit)) || (wantP && isPerson(hit)) || (wantB && isBuilding(hit))) return hit;
    } catch { /* no picker help */ }
    let best = null, bd = MAGNET;
    const cur = A.target?.entity;
    const look = (arr, ok, bias) => {
      for (const a of arr) {
        if (!ok(a) || !Number.isFinite(a.x)) continue;
        const s = screenOf(a);
        const d = Math.hypot(s.x - px, s.y - py) + bias - (a === cur ? HYST : 0);
        if (d < bd) { bd = d; best = a; }
      }
    };
    if (wantA) look(list('animals'), isAnimal, 0);
    if (wantP) look(list('people'), isPerson, PERSON_BIAS);
    if (wantB) look(list('buildings'), isBuilding, 0);
    return best;
  }
  const shapeOf = (e, K) => {
    if (e.kind === 'person' && K.has('clan') && !K.has('person')) {
      const clan = H.simCall('clanOf', e) ?? null;
      return { kind: 'clan', entity: e, clan, x: e.x, z: e.z };
    }
    if (e.cat === 'building') return { kind: 'building', entity: e, x: e.mx ?? e.x, z: e.mz ?? e.z };
    return { kind: e.kind === 'person' ? 'person' : 'animal', entity: e, x: e.x, z: e.z };
  };
  // a grave (graves.js), for Resurrect: the mound nearest the pointer within GRAVE_MAGNET px (a finger's 60 px circle;
  // the mound drawn by ui/delight.js is a 44 px button, which lets the pointer through while Resurrect is in hand)
  function findGrave(px, py) {
    const list = H.simCall('ask', 'graves');
    if (!Array.isArray(list)) return null;
    let best = null, bd = GRAVE_MAGNET;
    const cur = A.target?.kind === 'grave' ? A.target.grave : null;
    for (const g of list) {
      if (!Number.isFinite(g.x)) continue;
      const s = camera.toScreen(g.x, vox.standY(Math.floor(g.x), Math.floor(g.z)) + 0.3, g.z);
      if (s.behind) continue;
      const d = Math.hypot(s.x - px, s.y - py) - (g.id === cur ? HYST : 0);
      if (d < bd) { bd = d; best = g; }
    }
    return best ? { kind: 'grave', grave: best.id, x: best.x, z: best.z, name: best.name, entity: null } : null;
  }
  function find(px, py, d) {
    const K = kinds(d);
    if (K.has('grave')) return findGrave(px, py);
    if ([...K].some((k) => ENTITY.has(k))) { const e = findEntity(px, py, K); if (e) return shapeOf(e, K); }
    const g = H.I.g;
    if (K.has('area') && g && !g.off) return { kind: 'area', x: g.x, z: g.z, r: sizeR(d, H.opts[fam()]) };
    if (K.has('none') && g && !g.off) return { kind: 'none', x: g.x, z: g.z };
    return null;
  }
  const same = (a, b) => {
    if (!a || !b) return a === b;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'grave') return a.grave === b.grave;
    if (a.entity || b.entity) return a.entity === b.entity;
    return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.z - b.z) < 0.5 && (a.r ?? 0) === (b.r ?? 0);
  };

  // ---------- telling the HUD ----------
  const hold = (d, f) => (d.confirm === 'hold' || f?.confirm === 'hold' ? 'hold' : 'click');
  function card(d, t, f, confirm) {
    const aim = { forecast: f, entity: t.entity ?? null, target: t, confirm, holdMs: A.holdMs, power: d };
    const ok = f ? f.ok !== false : true;
    const name = (t.kind === 'clan' ? t.clan?.name : null) ?? t.entity?.name ?? '';
    const title = d.card?.title?.(aim) ?? (!ok ? `${d.name}: not here` : name ? `${d.name}: ${t.kind === 'clan' ? `the ${name} clan` : name}` : d.name);
    const s = ((A.holdMs) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
    const sub = d.card?.sub?.(aim) ?? (A.choosers.has(d.id) && t.entity ? 'Click to choose what to give them.' : !ok ?(d.pointAt ?? 'Point somewhere else.') : confirm === 'hold' ? `Press and hold for ${s} ${s === '1' ? 'second' : 'seconds'} to do it; let go to stop.` : 'Click to do it.');
    return { title, sub };
  }
  function emit() {
    const t = A.target, d = def();
    if (!t || !d) { A.forecast = null; A.members = []; events.emit('god:aim', null); return; }
    const f = H.simCall('forecast', d.id, t) ?? null;
    A.forecast = f;
    A.confirm = hold(d, f);
    A.members = t.kind === 'clan' ? (H.simCall('clanMembers', t.clan ?? t.entity) ?? []) : [];
    const { title, sub } = card(d, t, f, A.confirm);
    // an area: how many people stand inside the ring (the card counts them; the ring marks each)
    const inside = t.kind === 'area' ? list('people').filter((p) => isPerson(p) && Math.hypot(p.x - t.x, p.z - t.z) <= t.r).length : null;
    events.emit('god:aim', { power: d.id, target: t.entity ?? t, aim: t, entity: t.entity ?? null, targetKind: t.kind, confirm: A.confirm, holdMs: A.holdMs, forecast: f, title, sub, members: A.members, icon: d.icon ?? null, inside, chooser: A.choosers.has(d.id) });
  }

  // ---------- the hold ----------
  const at = (h) => h.target.entity ?? h.target;
  function holdEvent(state) {
    const h = A.hold;
    const e = h ? at(h) : null;
    events.emit('god:hold', { state, progress: h ? Math.min(1, h.p) : 0, ms: A.holdMs, target: e, x: e?.x ?? null, z: e?.z ?? null, power: h?.power ?? null });
  }
  function startHold(t, ev) {
    A.hold = { target: t, t0: performance.now(), p: 0, shift: !!ev?.shiftKey, px: H.I.px, py: H.I.py, power: def().id };
    holdEvent('start');
    events.emit('sfx:play', { name: 'power.hold' });
  }
  A.cancelHold = (why = 'released') => {
    const h = A.hold;
    if (!h) return false;
    A.hold = null;
    const e = at(h);
    events.emit('god:hold', { state: 'cancel', why, progress: h.p, ms: A.holdMs, target: e, x: e.x, z: e.z, power: h.power });
    events.emit('sfx:play', { name: 'power.cancel' });
    if (why === 'released' && !h.soft) H.refuse('hold-short', e.x, e.z);
    return true;
  };
  const stillThere = (t) => !t.entity || (t.entity.kind === 'person' ? isPerson(t.entity) : alive(t.entity));
  function tickHold() {
    const h = A.hold, t = h.target;
    if (!stillThere(t) || H.tool !== h.power) { A.cancelHold('lost'); return; }
    const s = t.entity ? screenOf(t.entity) : { x: h.px, y: h.py };
    if (Math.hypot(s.x - H.I.px, s.y - H.I.py) > MAGNET + SLIP) { A.cancelHold('slipped'); return; }
    h.p = (performance.now() - h.t0) / A.holdMs;
    if (h.p < 1) { holdEvent('hold'); return; }
    h.p = 1;
    holdEvent('done');
    A.hold = null;
    fire(t, h.shift);
  }

  // ---------- per frame while a power is armed ----------
  A.update = (dt) => {
    if (A.hold) { tickHold(); return; }
    const d = def();
    // a target given by the HUD (a warning's "do this", a prayer's answer): kept until the pointer moves away
    // over the world or the tool changes, so its trade off can be read and done from the detail slot
    // (a finger's aim is not dropped by moving: only by another tap, the power put down, or the target gone)
    if (A.lock && (!d || A.lock.power !== d.id || !stillThere(A.lock.t) || (!A.lock.touch && H.I.over && Math.hypot(H.I.px - A.lock.px, H.I.py - A.lock.py) > 24))) A.lock = null;
    if (A.lock) {
      A.t -= dt;
      if (!same(A.lock.t, A.target)) { A.target = A.lock.t; A.t = REFRESH; emit(); }
      else if (A.t <= 0) { A.t = REFRESH; emit(); }
      return;
    }
    const want = d && H.I.over && clock.phase === 'running' && (d.phases ?? ['running']).includes(clock.phase);
    const t = want ? find(H.I.px, H.I.py, d) : null;
    A.t -= dt;
    if (!same(t, A.target)) {
      // an area moving under the pointer is re-forecast at most every AREA_EVERY; anything else at once
      if (t && A.target && !t.entity && !A.target.entity && t.kind === A.target.kind && A.t > REFRESH - AREA_EVERY) { A.target = t; A.moved = true; return; }
      A.target = t; A.t = REFRESH; A.moved = false; emit(); return;
    }
    if (t) A.target = t;
    if (t && (A.t <= 0 || (A.moved && A.t <= REFRESH - AREA_EVERY))) { A.t = REFRESH; A.moved = false; emit(); }
  };
  // the ring on the target (the shared brush ring), the clan's members ringed, and the cursor read-out
  const circle = (L, x, z, r, color) => {
    const y = vox.standY(x, z) + 0.15;
    for (let i = 0; i < 14; i++) {
      const a0 = i / 14 * Math.PI * 2, a1 = (i + 1) / 14 * Math.PI * 2;
      L.seg([x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], color);
    }
  };
  A.ring = () => {
    const t = A.hold?.target ?? A.target, g = H.I.g, d = def();
    const seenBy = Number(A.forecast?.seenBy) || 0;
    if (A.members.length && t?.kind === 'clan') {
      clanLines.begin();
      for (const m of A.members) if (m !== t.entity && alive(m) && !m.hidden) circle(clanLines, m.x, m.z, 0.9, 0xf2c94c);
      clanLines.end();
    } else if (t?.kind === 'area' && !mist(t)) {
      // an area: everyone inside the ring gets a small ring of their own, so the player sees who it reaches
      A.inside = list('people').filter((p) => isPerson(p) && Math.hypot(p.x - t.x, p.z - t.z) <= t.r);
      if (A.inside.length) { clanLines.begin(); for (const p of A.inside) circle(clanLines, p.x, p.z, 0.8, 0xf2c94c); clanLines.end(); } else clanLines.clear();
    } else { clanLines.clear(); A.inside = []; }
    if (t && t.entity) {
      const e = t.entity;
      const r = e.cat === 'building' ? Math.max(e.foot?.w ?? 3, e.foot?.d ?? 3) * 0.7 : Math.max(1.2, (Math.max(e.foot?.w ?? 1, e.foot?.d ?? 1)) * (e.kind === 'person' ? 1.4 : 0.75));
      // the ring goes where they are now (an aim held for a finger stays on someone who walks on)
      const ex = e.cat === 'building' ? t.x : Number.isFinite(e.x) ? e.x : t.x, ez = e.cat === 'building' ? t.z : Number.isFinite(e.z) ? e.z : t.z;
      overlay.brush(ex, ez, r, e.kind === 'person' ? 0xff8a5c : 0xf2c94c);
      H.cursor = { x: ex, z: ez, size: r, tool: H.tool, power: d?.id, target: e, targetKind: t.kind, hold: A.hold ? Math.min(1, A.hold.p) : 0, seenBy };
    } else if (t && t.kind === 'grave') {
      // the grave aimed at: a ring round the mound (gold when it will open, grey when it will not)
      const ok = A.forecast ? A.forecast.ok !== false : true;
      overlay.brush(t.x, t.z, 1.3, ok ? 0xf2c94c : 0x8f8f8f);
      H.cursor = { x: t.x, z: t.z, size: 1.3, tool: H.tool, power: d?.id, target: null, targetKind: 'grave', grave: t.grave, seenBy, hold: 0 };
    } else if (t && t.kind === 'area') {
      const reason = mist(t) ? 'mist' : null;
      overlay.brush(t.x, t.z, t.r, reason ? 0x8f8f8f : seenBy > 0 ? 0xf4d77a : 0xffffff);
      H.cursor = { x: t.x, z: t.z, top: vox.groundTop(Math.floor(t.x), Math.floor(t.z)), size: t.r, tool: H.tool, power: d?.id, target: null, targetKind: 'area', reason, seenBy, hold: A.hold ? Math.min(1, A.hold.p) : 0, inside: A.inside?.length ?? 0 };
    } else if (g && !g.off) {
      overlay.brush(g.x, g.z, 0.8, 0x8f8f8f);
      H.cursor = { x: g.x, z: g.z, size: 0.8, tool: H.tool, power: d?.id, target: null, targetKind: t?.kind ?? null, seenBy };
    } else { overlay.brush(null); H.cursor = null; }
  };

  // ---------- carrying it out ----------
  function fire(t, shift) {
    const d = TOOL[H.tool]?.power ?? def();
    const res = perform(d, t);
    if (!res || !res.ok) return res ?? null;
    A.lock = null; A.touched = null;
    A.target = null; emit();
    if (!shift) H.api.setTool(null);
    return res;
  }
  // also the API's god.perform(id, target): a panel's act (give a thought, a commandment) with no pointer
  function perform(d, t) {
    if (!d) return null;
    if (clock.phase !== 'running') { H.refuse('phase'); return null; }
    let res = H.simCall('act', d.id, t);
    if (res === undefined && d.id === 'strike') res = H.simCall('strike', t.entity ?? t); // a stage 1 simulation
    if (!res || !res.ok) { H.refuse(d.id === 'strike' ? 'strike-failed' : 'act-failed', t.x ?? null, t.z ?? null, res?.text); return res ?? null; }
    if (typeof d.radius?.toR === 'function') A.anyU = Math.random(); // the next "Any" rain is another size
    const x = res.x ?? t.x, z = res.z ?? t.z;
    H.act(d.witness ?? d.id, x, z, res.r ?? t.r ?? 0, { target: t.entity ?? null, targetKind: t.kind, text: res.text, power: d.id, aim: t });
    return res;
  }
  A.perform = (id, target) => {
    const d = TOOL[id]?.power;
    if (!d) return null;
    let t;
    if (!target) t = { kind: 'none' };
    else if (target.cat || target.foot) t = shapeOf(target, kinds(d));      // an entity
    else if (target.kind) t = { ...target };                                 // already a target shape
    else if (target.x != null) t = { kind: 'area', r: 0, ...target };        // a point
    else t = { kind: 'none', ...target };
    if (t.entity && t.x == null) { t.x = t.entity.mx ?? t.entity.x; t.z = t.entity.mz ?? t.entity.z; }
    return perform(d, t);
  };
  // a panel may take over the click for a power that needs a choice first (the HUD's Give a thought): with a
  // chooser set, a click on a valid target hands the target to it and puts the power down; nothing is carried out
  A.choosers = new Map();
  A.choose = (id, fn) => { if (fn) A.choosers.set(id, fn); else A.choosers.delete(id); };
  // the left button goes down with a power armed: a click carries it out, a hold starts the ring
  A.down = (ev) => {
    const d = def();
    // the press itself looks again (sticky: the nearest person within MAGNET px), so a press that comes in the
    // same frame as the move onto a walking person still lands on them and not on nothing
    if (d && !A.lock && clock.phase === 'running') {
      const now = find(H.I.px, H.I.py, d);
      if (now && !same(now, A.target)) { A.target = now; A.t = REFRESH; A.moved = false; emit(); }
    }
    const t = A.target;
    if (!t || !d) { H.refuse('no-target', H.I.g?.x ?? null, H.I.g?.z ?? null, d?.noTarget); return null; }
    const pick = A.choosers.get(d.id);
    if (pick && t.kind !== 'area' && t.kind !== 'none') {
      A.target = null; emit();
      H.api.setTool(null);
      try { pick({ ...t }); } catch (err) { console.error(`god: the chooser for ${d.id} failed`, err); }
      return { chosen: true };
    }
    // only the mist stops a power on the ground (what you cannot see you cannot touch); huts and the stone do not
    if ((t.kind === 'area' || t.kind === 'none') && mist(t)) { H.refuse('mist', t.x, t.z); return null; }
    if (A.forecast && A.forecast.ok === false) { H.refuse('no-target', t.x, t.z, A.forecast.who || d.noTarget); return null; }
    if (A.confirm === 'hold') { startHold(t, ev); return { hold: true }; }
    return fire(t, !!ev?.shiftKey);
  };
  A.click = A.down;
  // the button comes up: a hold not yet full is cancelled
  // (a hold already long enough when the button comes up is done, even if no frame ran since it filled)
  A.up = () => {
    // a finger that found nothing to aim at says so as it lifts (not if a second finger made it a pinch)
    if (A.pending) { const q = A.pending; A.pending = null; H.refuse('no-target', q.x, q.z, q.text); }
    if (A.tapAct) { A.tapAct = false; A.before = null; A.down(null); return false; }
    if (!A.hold) return false;
    if (performance.now() - A.hold.t0 >= A.holdMs) { tickHold(); if (!A.hold) return false; }
    return A.cancelHold('released');
  };
  A.clear = () => { A.cancelHold('lost'); A.lock = null; A.touched = null; A.pending = null; A.before = null; A.tapAct = false; clanLines.clear(); if (A.target) { A.target = null; emit(); } };
  // a second finger came down: the first finger's tap was the start of a pinch, not a tap. The aim goes back to
  // what it was before that finger (its own aim, its complaint and its hold are dropped)
  A.untouch = () => {
    A.pending = null; A.tapAct = false;
    const b = A.before;
    A.before = null;
    if (!b) return false;
    A.lock = b.lock; A.touched = b.touched;
    if (!same(A.target, b.target)) { A.target = b.target; A.t = REFRESH; emit(); }
    return true;
  };

  // ---------- a finger (phones have no hover) ----------
  // The first tap on a target only aims (its trade off shows in the detail slot); a second tap on the same
  // target carries it out, or a press and hold on it does, for the harsh ones. A tap elsewhere aims there.
  // A finger does not hover, so the aim it makes is held (A.lock, as an aim the HUD makes) until the player taps
  // elsewhere, puts the power down or does it; without that the next frame found no pointer and dropped it.
  // A second tap on the same thing (for an area or anywhere-power: within TAP_SAME px of the first) acts on what
  // the first tap aimed at, so the price shown is the price paid.
  const TAP_SAME = 36;
  const nearTap = (a, b) => {
    if (!a || !b || a.entity || b.entity || a.kind !== b.kind) return false;
    const p = camera.toScreen(a.x, vox.standY(Math.floor(a.x), Math.floor(a.z)), a.z), q = camera.toScreen(b.x, vox.standY(Math.floor(b.x), Math.floor(b.z)), b.z);
    return Math.hypot(p.x - q.x, p.y - q.y) <= TAP_SAME;
  };
  A.touch = (ev) => {
    const d = def();
    if (!d) return null;
    // kept, so a second finger (a pinch, not a tap) can put the aim back as it was (A.untouch)
    A.before = { lock: A.lock, touched: A.touched, target: A.target };
    A.pending = null;
    const t = clock.phase === 'running' ? find(H.I.px, H.I.py, d) : null;
    if (!t) {
      // said when the finger lifts (A.up), so the first finger of a pinch does not complain
      A.pending = { x: H.I.g?.x ?? null, z: H.I.g?.z ?? null, text: d.noTarget };
      return null;
    }
    const held = A.lock?.t ?? A.touched;
    if (held && (same(t, held) || nearTap(t, held)) && (same(held, A.target) || same(t, A.target))) {
      // the lock stays while it is carried out (A.down then does not look again), and goes once it is done
      A.lock = { t: held, power: d.id, px: H.I.px, py: H.I.py, touch: true }; A.target = held;
      // a harsh one is held from the press, as before; anything else is done as the finger lifts (A.up), so the
      // first finger of a pinch that lands on the aimed target does not set it off
      if (A.confirm === 'hold') return A.down(ev);
      A.tapAct = true;
      return { aimed: true, acting: true };
    }
    A.touched = t; A.target = t; A.t = REFRESH;
    A.lock = { t, power: d.id, px: H.I.px, py: H.I.py, touch: true };
    emit();
    // a harsh power: a finger that stays down on the target holds at once (a quick tap only aimed, so letting go
    // early says nothing); the ring fills under the finger
    if (A.confirm === 'hold' && !(A.forecast && A.forecast.ok === false) && !((t.kind === 'area' || t.kind === 'none') && mist(t))) {
      startHold(t, ev); A.hold.soft = true;
      return { aimed: true, hold: true };
    }
    return { aimed: true };
  };
  // ---------- aimed from the HUD ----------
  // the target shape for an entity, a target shape or a point (as perform takes them)
  const shape = (d, target) => {
    let t;
    if (!target) t = { kind: 'none' };
    else if (target.cat || target.foot) t = shapeOf(target, kinds(d));
    else if (target.kind) t = { ...target, entity: target.entity ?? null };
    else if (target.x != null) t = { kind: 'area', r: sizeR(d), ...target };
    else t = { kind: 'none', ...target };
    if (t.entity && t.x == null) { t.x = t.entity.mx ?? t.entity.x; t.z = t.entity.mz ?? t.entity.z; }
    if (t.kind === 'area' && !Number.isFinite(t.r)) t.r = sizeR(d);
    return t;
  };
  // aim the armed power at a given target, as if the pointer were on it; the HUD then shows its trade off
  A.aimAt = (target) => {
    const d = def();
    if (!d) return null;
    const t = shape(d, target);
    A.lock = { t, power: d.id, px: H.I.px, py: H.I.py };
    A.touched = t;
    A.target = t; A.t = REFRESH; emit();
    return t;
  };
  // carry out the armed power on its locked or current target (the slot's "Do it" button); harsh powers are
  // held in the slot itself before this is called
  A.fireNow = (shift = false) => {
    const t = A.lock?.t ?? A.target, d = def();
    if (!t || !d) return null;
    if (A.forecast && A.forecast.ok === false) { H.refuse('no-target', t.x, t.z, A.forecast.who || d.noTarget); return null; }
    A.lock = null; A.touched = null;
    return fire(t, shift);
  };
  return A;
}
