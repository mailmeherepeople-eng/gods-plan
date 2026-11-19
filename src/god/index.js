// The god's hands: the Omnipotence tools (Land: Reshape and Structures; Water: River and Lake; Life: Vegetation and
// Animals; Erase. Path has code but no button) and the powers.
// docs/GOD-TOOLS.md is the manual; the contract with the simulation and the HUD
// is docs/STAGE1-CONTRACTS.md.
//   tools.js   families, modes, keys and options
//   land.js    what the brushes and water do to the blocks
//   pending.js the see-through preview every Reshape tool draws into, the tick and the cross
//   buttons.js the tick, cross and turn buttons on the map (the preview's and the cave's)
//   trees.js   trees of blocks
//   path.js    paths: laying, taking up, the path as a thing
//   input.js   mouse, keys, strokes, the ring, the river and path being drawn
//   draw.js    the hands' own lines and tags
//   sight.js   the soft wash on what people can see
//   aim.js     the generic hand for every power: aiming, the card, the hold, carrying it out
//   plugins.js the powers, as data files (power-strike.js is Strike), registered by id
//   animals.js placing animals (a click, or hold and move)
import { TOOLS, TOOL, FAMILIES, FAMILY, ALIAS, COLUMNS, COLUMN, NODES, ROOT, PARENT, POWER, PREVIEWED, addPower } from './tools.js';
import { POWERS } from './plugins.js';
import { makeLand } from './land.js';
import { makePaths } from './path.js';
import { makeDraw } from './draw.js';
import { makePending } from './pending.js';
import { makeInput } from './input.js';
import { makeSight } from './sight.js';
import { makeAim } from './aim.js';
import { makeAnimals } from './animals.js';
import { makeLook } from './look.js';
import { makeCave } from './cave.js';

const TEXT = {
  mist: 'Lost in the mist. What you cannot see, you cannot touch.',
  protected: 'The standing stone is kept clear: the ground round it stays low enough to see it.',
  running: 'Time is running. What is done is done.',
  phase: 'That power wakes only once time runs.',
  'path-short': 'A path needs at least two points: click where it starts, then along the way.',
  'no-target': 'Nothing for this power here.',
  'hold-short': 'Keep the button held down on a person until the ring is full. Letting go early spares them.',
  'strike-failed': 'The strike did not land.',
  'act-failed': 'Nothing happened.',
  'animal-water': 'Animals cannot stand in water.',
  'animal-dry': 'Fish need water. Put them in a river, a lake or a pond.',
  'animal-shallow': 'Too shallow for that fish here. Put it in deeper water.',
  'animal-cliff': 'Too steep or blocked for an animal to stand there.',
  'animal-protected': 'Not on the standing stone or in a home.',
  'animal-mist': 'Lost in the mist. What you cannot see, you cannot touch.',
  'no-sim': 'There is no life in this world to place.',
};

export async function init(ctx) {
  const { core, events, clock } = ctx;
  // the powers, as data (plugins.js): each becomes a tool of the powers column; a file that fails is left out
  for (const load of POWERS) {
    try { const m = await load(); for (const d of m.default ?? []) addPower(d); } catch (err) { console.error('god: a power file failed to load', err); }
  }
  const H = { ctx, tool: null, cursor: null };
  H.sim = () => ctx.modules?.sim;
  H.toolDef = () => TOOL[H.tool] ?? null;
  // every family keeps its own options, as the planner's T.opts did
  H.opts = Object.fromEntries(FAMILIES.map((f) => [f.id, Object.fromEntries(Object.entries(f.options).map(([k, s]) => [k, s.value]))]));
  // the last mode used in each column entry (a column may hold several option sets: Vegetation)
  const lastMode = Object.fromEntries(COLUMNS.map((c) => [c.id, c.modes[0]]));
  // the child picked last inside each group of the Omnipotence tree
  const lastKid = {};

  // every call into the simulation is guarded: it may be missing or broken
  const simErr = new Set();
  H.simCall = (name, ...args) => {
    const fn = H.sim()?.[name];
    if (typeof fn !== 'function') return undefined;
    try { return fn.apply(H.sim(), args); } catch (err) {
      if (!simErr.has(name)) { simErr.add(name); console.error(`god: sim.${name} failed`, err); }
      return undefined;
    }
  };

  // ---------- refusals ----------
  const lastRef = new Map();
  H.refuse = (reason, x = null, z = null, text = null) => {
    const now = performance.now();
    if (now - (lastRef.get(reason) ?? -1e9) < 400) return;
    lastRef.set(reason, now);
    events.emit('god:refused', { reason, x, z, text: text ?? TEXT[reason] ?? reason });
  };
  H.why = (x, z) => {
    if (ctx.edgeClear(x + 0.5, z + 0.5) < 0.5) return 'mist';
    if (H.simCall('isProtected', x, z) === true) return 'protected';
    return null;
  };
  const tally = { mist: 0, protected: 0 };
  const allow = (x, z) => { const r = H.why(x, z); if (r) { tally[r]++; return false; } return true; };
  allow.why = H.why;
  // the standing stone is never buried: outside its protected ground, raised land may rise only one block for each
  // block away from it, so it stands on a gentle rise, never at the bottom of a shaft (director, 2026-11-15)
  let stoneBox = null, stoneBase = null;
  allow.cap = (x, z) => {
    if (!stoneBox) { const st = H.sim()?.stone; if (!st?.protect) return null; stoneBox = st.protect; stoneBase = ctx.vox?.groundTop?.(Math.floor((stoneBox.x0 + stoneBox.x1) / 2) + 3, stoneBox.z0) ?? null; }
    if (stoneBase == null) return null;
    const d = Math.max(stoneBox.x0 - x, x - stoneBox.x1, stoneBox.z0 - z, z - stoneBox.z1);
    if (d <= 0 || d > 40) return null;
    return stoneBase + d;
  };
  H.allow = allow;
  H.tallyReset = () => { tally.mist = 0; tally.protected = 0; };
  H.tallyTotal = () => tally.mist + tally.protected;
  H.tallyReason = () => (tally.protected > 0 ? 'protected' : 'mist');

  // ---------- history: the strokes waiting in the preview (always), then what was applied (creation only) ----------
  let hist = '';
  const canUndo = () => !!H.P?.canUndo() || (clock.phase === 'creation' && core.history.undo.length > 0);
  const canRedo = () => !!H.P?.canRedo() || (!H.P?.has() && clock.phase === 'creation' && core.history.redo.length > 0);
  const histChanged = () => {
    const k = `${canUndo()},${canRedo()}`;
    if (k === hist) return;
    hist = k;
    events.emit('god:history', { canUndo: canUndo(), canRedo: canRedo() });
  };
  H.histChanged = histChanged;
  const clearHistory = () => { core.history.undo.length = 0; core.history.redo.length = 0; histChanged(); };

  // ---------- acts: after every committed act while the clock runs ----------
  H.act = (kind, x, z, r, extra = {}) => {
    if (clock.phase !== 'running') return 0;
    clearHistory();
    const w = H.simCall('witness', { kind, x, z, r, ...extra });
    const seenBy = typeof w === 'number' ? w : Number(w?.seenBy) || 0;
    events.emit('god:act', { kind, x, z, r, seenBy, ...extra });
    return seenBy;
  };

  // ---------- the parts ----------
  const D = makeDraw(ctx);
  H.L = makeLand(core, allow);
  H.PT = makePaths(H);
  H.P = makePending(H, D);
  const I = makeInput(H, D);
  H.aim = makeAim(H, D);
  H.animals = makeAnimals(H);
  H.look = makeLook(H);
  H.cave = makeCave(H, D);
  const sight = makeSight(H);

  // state the HUD may show: god:path { drawing, selected }
  H.emit = (what) => {
    if (what === 'path') events.emit('god:path', { drawing: I.path?.pts.length ?? 0, selected: core.selected().filter((e) => e.kind === 'path').map((e) => e.id) });
  };

  // ---------- options ----------
  const curFamily = () => TOOL[H.tool]?.family ?? 'land';
  const optionList = (t) => t.opts.map((name) => { const s = FAMILY[t.family].options[name]; return { name, label: s.label, type: s.type, min: s.min, max: s.max, step: s.step, value: H.opts[t.family][name], hint: s.hint, names: s.names ?? null }; });
  H.emitOptions = (family = curFamily()) => events.emit('god:options', { family, tool: H.tool, options: { ...H.opts[family] } });
  const setOption = (name, value, family = curFamily()) => {
    const spec = FAMILY[family]?.options[name];
    if (!spec) return false;
    let v;
    if (spec.type === 'bool') v = !!value;
    else { v = Number(value); if (!Number.isFinite(v)) return false; v = Math.max(spec.min, Math.min(spec.max, Math.round(v / spec.step) * spec.step)); v = +v.toFixed(3); }
    if (H.opts[family][name] === v) return true;
    H.opts[family][name] = v;
    events.emit('god:options', { family, tool: H.tool, name, value: v, options: { ...H.opts[family] } });
    if (name === 'size' || name === 'strength') { const b = api.brush; events.emit('god:brush', b); }
    return true;
  };
  H.setOption = (...a) => setOption(...a);
  H.stepOption = (name, d) => {
    const f = curFamily(), spec = FAMILY[f].options[name];
    if (!spec || spec.type === 'bool') return;
    setOption(name, H.opts[f][name] + d * (spec.step < 1 && H.opts[f][name] + d * spec.step < 1 ? spec.step : Math.max(1, spec.step)), f);
  };
  H.stepSize = (d) => {
    if (H.tool === 'cave') { H.stepOption('room', d); return; } // the cave's size is its room
    const f = curFamily();
    if (FAMILY[f].options.size) H.stepOption('size', d);
    else if (FAMILY[f].options.width) H.stepOption('width', d); // the path's size is its width
  };

  // family here is the column entry (what the HUD groups by); optionSet is where its options live; sub is
  // the group inside the entry (Vegetation: Ground or Plants); apart: set apart at the foot; dock: a power
  const entry = (t) => ({
    id: t.id, family: t.col, group: t.col, optionSet: t.family, sub: t.sub, name: t.name,
    familyName: COLUMN[t.col].name, hotkey: COLUMN[t.col].key, modeKey: t.modeKey ?? null, hint: t.hint,
    phases: [...t.phases], kind: t.kind, options: optionList(t), apart: !!COLUMN[t.col].apart, dock: !!COLUMN[t.col].dock,
    animal: t.animal ?? null, preview: PREVIEWED.has(t.col),
    // a power's own data for the dock and the HUD (docs/STAGE2-CONTRACTS.md); its own letter, if any, is its hotkey
    ...(t.power ? { hotkey: t.power.hotkey ?? null, power: powerInfo(t.power) } : {}),
  });
  const powerInfo = (d) => ({ group: d.group ?? 'powers', icon: d.icon ?? null, target: d.target ?? 'none', confirm: d.confirm ?? null, radius: d.radius ?? null,
    label: d.label ?? null, pointAt: d.pointAt ?? null, tip: d.tip ?? null, inspector: d.inspector ?? null });
  const ORDER = Object.fromEntries(COLUMNS.map((c, i) => [c.id, i]));

  const api = {
    // one entry per tool (a family's mode), rebuilt on every read so option values are current
    // in column order; a hidden column (Path) is left out: its tools still work through setTool and path.*
    get tools() { return TOOLS.filter((t) => !t.hidden && !COLUMN[t.col].hidden).sort((a, b) => ORDER[a.col] - ORDER[b.col]).map(entry); },
    get families() { return COLUMNS.filter((c) => !c.hidden).map((c) => ({ id: c.id, name: c.name, hotkey: c.key ?? null, hint: c.hint, modes: c.modes.slice(), mode: lastMode[c.id], apart: !!c.apart, dock: !!c.dock, subs: null, preview: PREVIEWED.has(c.id), parent: PARENT[c.id] ?? null, chips: !!c.chips })); },
    // the Omnipotence tree (tools.js NODES): the root's id and every group with its children (groups or families),
    // in order, and the child picked last inside it
    get tree() { return { root: ROOT, nodes: Object.fromEntries(Object.values(NODES).map((n) => [n.id, { id: n.id, name: n.name, hint: n.hint ?? '', hotkey: n.key ?? null, kids: n.kids.slice(), parent: PARENT[n.id] ?? null, last: lastKid[n.id] ?? null }])) }; },
    get tool() { return H.tool; },
    get family() { return TOOL[H.tool]?.col ?? null; },
    // Another tool, or none: the change waiting in the preview is DROPPED (the director, 2026-11-15: "if we reshape
    // the land and switch tools, we lose the pending change"; only the tick makes it real). A mode of the same entry
    // (Raise to Flatten, Ground to Plants) keeps it waiting. The HUD says so, and the tick pulses as strokes add up.
    setTool(id) {
      if (id != null) id = ALIAS[id] ?? id;
      if (id != null && !TOOL[id]) return false;
      if (id != null && !TOOL[id].phases.includes(clock.phase)) { H.refuse('phase'); return false; }
      if (id === H.tool) return true;
      const was = H.tool;
      I.finish();
      if (TOOL[was]?.col !== TOOL[id]?.col) { I.offTool(); if (H.P.has()) H.P.drop(); }
      else if (TOOL[was]?.kind !== TOOL[id]?.kind) I.modeChange();
      H.aim.clear();
      ctx.overlay.brush(null);
      H.tool = id ?? null;
      if (id && !TOOL[id].hidden) {
        const col = TOOL[id].col;
        lastMode[col] = id;
        // every group on the way up remembers the child picked inside it (a letter for a group comes back to it)
        for (let k = col; PARENT[k]; k = PARENT[k]) lastKid[PARENT[k]] = k;
      }
      events.emit('god:tool', { id: H.tool, family: TOOL[id]?.col ?? null });
      return true;
    },
    // a family's letter: the family, back on its last mode
    // a group's letter: down the children picked last (else the first) to a family, on its last mode
    setFamily(fid) {
      let k = fid;
      for (let i = 0; i < 8 && NODES[k]; i++) k = lastKid[k] ?? NODES[k].kids[0];
      const c = COLUMN[k] ?? COLUMN[TOOL[FAMILY[fid]?.modes?.[0]]?.col];
      if (!c) return false;
      return api.setTool(lastMode[c.id] ?? c.modes[0]);
    },
    get options() { const f = curFamily(); return { family: f, ...H.opts[f] }; },
    setOption,
    get brush() { const o = H.opts[curFamily()]; return { size: o.size ?? o.width ?? null, strength: o.strength ?? null }; },
    setBrush({ size, strength } = {}) {
      const f = curFamily();
      if (Number.isFinite(size)) { if (FAMILY[f].options.size) setOption('size', size, f); else if (FAMILY[f].options.width) setOption('width', size, f); }
      if (Number.isFinite(strength) && FAMILY[f].options.strength) setOption('strength', strength, f);
      return api.brush;
    },
    canUndo, canRedo,
    // undo steps back what is waiting first (the river's last point, then the last stroke), in creation and while
    // time runs; with nothing waiting it takes back an applied change (creation only)
    undo() {
      if (I.op) { I.cancel(); histChanged(); return 'stroke'; }
      if (H.P.canUndo()) { const r = H.P.undo(); histChanged(); return r; }
      if (clock.phase !== 'creation') { H.refuse('running'); return false; }
      I.finish();
      const r = core.undo();
      histChanged();
      return r;
    },
    redo() {
      if (H.P.canRedo()) { const r = H.P.redo(); histChanged(); return r; }
      if (H.P.has()) return false;
      if (clock.phase !== 'creation') { H.refuse('running'); return false; }
      I.finish();
      const r = core.redo();
      histChanged();
      return r;
    },
    // the change waiting in the preview (every Reshape tool but the cave): has, strokes, tool; apply() is the
    // tick, drop() the cross (also Enter and Esc, and the buttons on the map)
    get pending() { return H.P.state(); },
    apply: () => I.digRiver(),
    drop: () => I.escapePending(),
    get cursor() { return H.cursor ? { ...H.cursor } : null; },
    // a harsh power (confirm 'hold') needs the button held this long (UI-GUIDE: 300 to 1000 ms); the hold in progress
    get holdMs() { return H.aim.holdMs; },
    set holdMs(ms) { const v = Number(ms); if (Number.isFinite(v)) H.aim.holdMs = Math.max(300, Math.min(1000, v)); },
    get powerHold() { const h = H.aim.hold; return h ? { power: h.power, target: h.target.entity ?? h.target, progress: Math.min(1, h.p), ms: H.aim.holdMs } : null; },
    get strikeHold() { return api.powerHold; },
    // powers (stage 2 seam): the registered data, a power added at run time (one call, nothing else), and
    // carrying one out with no pointer (a panel: give a thought, a commandment): sim.act, the witness, god:act
    get powers() { return Object.values(POWER).map((d) => ({ ...d })); },
    registerPower(d) { const t = addPower(d); H.opts[t.family] = Object.fromEntries(Object.entries(FAMILY[t.family].options).map(([k, s]) => [k, s.value])); events.emit('god:powers', { ids: Object.keys(POWER) }); return d.id; },
    perform: (id, target) => H.aim.perform(id, target),
    // a panel takes over the click of a power that needs a choice first: fn(target) instead of carrying it out
    // (the HUD's Give a thought); choose(id, null) gives the click back
    choose: (id, fn) => H.aim.choose(id, fn),
    // the HUD aims a power at a given target (a warning's "do this", a prayer's answer: arms it first), shows its
    // trade off, and carries it out from the detail slot (fireNow; a harsh one is held in the slot first)
    aimAt(id, target) { if (id && H.tool !== id && !api.setTool(id)) return null; return H.aim.aimAt(target); },
    fireNow: (shift = false) => H.aim.fireNow(shift),
    get aimTarget() { const t = H.aim.lock?.t ?? H.aim.target; return t ? { ...t } : null; },
    // a second finger came down (ui/touch.js): drop the stroke or hold the first finger started, keep the tool
    // (what that finger began goes: its stroke, a lake or river point it tapped; the strokes before it stay)
    cancelStroke() { const held = H.aim.cancelHold('lost'); H.aim.untouch(); H.cave.untouch?.(); const undid = I.untouch(); return undid || held; },
    get busy() { return I.busy(); },
    cancel: () => I.escape(),
    // the river being painted: its path so far (empty when no stroke is under way); digRiver is the tick, as apply
    get riverPoints() { return I.op?.kind === 'river' ? I.op.pts.map((q) => q.slice()) : []; },
    digRiver: () => I.digRiver(),
    // paths
    path: {
      get drawing() { return I.path?.pts.map((q) => q.slice()) ?? null; },
      finish: () => I.finishPath(),
      lay: (pts, kind = 'earth', width = H.opts.path.width, steps = H.opts.path.steps) => I.layPath(pts, kind, width, steps),
      takeUp: (list) => I.takeUpPaths(list),
      all: () => H.PT.all(),
    },
    // what is under the pointer as one whole thing (tree, water body, bushes, rock, ground); read-only
    look: (px, py) => H.look.look(px, py),
    // scripted acts through the same code as the finger. Each goes into the preview and is applied at once (one
    // undo step), unless o.keep: then it waits like a drawn stroke. o.hold: extra dabs at every point, as if the
    // finger rested there (a held raise grows a mountain); o.size / o.strength set the brush first.
    stroke(id, pts, o = {}) {
      id = ALIAS[id] ?? id;
      if (!TOOL[id] || TOOL[id].kind !== 'brush' || !pts?.length) return null;
      const T = TOOL[id];
      if (H.P.has() && H.P.top() && TOOL[H.P.top().tool]?.col !== T.col && !o.keep) H.P.apply();
      if (o.size != null && FAMILY[T.family].options.size) setOption('size', o.size, T.family);
      if (o.strength != null && FAMILY[T.family].options.strength) setOption('strength', o.strength, T.family);
      const g = (p) => ({ x: p[0], z: p[1], cx: Math.floor(p[0]), cz: Math.floor(p[1]) });
      const prev = I.g, prevTool = H.tool;
      H.tool = id;
      const S = I.startStroke(id, g(pts[0]));
      const rest = (p) => { for (let k = 0; k < (o.hold ?? 0); k++) I.dabAt(S, g(p)); };
      rest(pts[0]);
      for (const p of pts.slice(1)) { if (!I.strokeTo(S, g(p))) I.dabAt(S, g(p)); S.last = { x: p[0], z: p[1] }; rest(p); }
      const f = I.endStroke(S);
      H.tool = prevTool; I.g = prev;
      if (!f) return null;
      if (o.keep) return f.label;
      const r = H.P.apply();
      return r ? r.label : null;
    },
    // a river painted along the points at once (o.banks, o.size set the River first)
    river(pts, o = {}) {
      if (!pts?.length) return null;
      if (H.P.has() && H.P.top() && TOOL[H.P.top().tool]?.col !== 'river' && !o.keep) H.P.apply();
      if (o.size != null) setOption('size', o.size, 'river');
      if (o.banks != null) setOption('banks', o.banks, 'river');
      const f = I.riverAlong(pts);
      if (o.keep) return f ? pts.length : 0;
      const r = H.P.apply();
      return r ? { points: pts.map((q) => q.slice()), ...r } : null;
    },
    // a cave carved at (x, z) as the mouse would (room 1 to 3), or { close: true } closes the one there
    cave: (x, z, room, o) => H.cave.at(x, z, room, o),
    // the Cave tool's ghost (left by the first click): where it is and which way it faces; turn, carve, cancel
    get caveGhost() { return H.cave.state(); },
    caveTurn: () => H.cave.turn(),
    caveConfirm: () => H.cave.confirm(),
    caveCancel: () => H.cave.cancel(),
    lake(x, z, o = {}) {
      const cx = Math.floor(x), cz = Math.floor(z), w = H.P.L.waterTop(cx, cz);
      const res = I.lakeAt({ x, z, cx, cz, top: Math.max(H.P.V.groundTop(cx, cz), w) });
      if (res && !o.keep) H.P.apply();
      return res;
    },
    // the preview's numbers (tests, the frame-time check): blocks waiting, ghost pieces drawn
    get previewStats() { return H.P.stats(); },
    update(dt) {
      I.update(dt);
      H.P.update(dt);
      D.update();
      H.aim.update(dt);
      H.cave.update(dt);
      sight.update(dt, !!H.tool && clock.phase === 'running');
    },
  };
  H.api = api;
  H.sight = sight;

  events.on('edit', histChanged);
  events.on('phase', ({ to }) => {
    if (to !== 'running') return;
    I.finish();
    // (the HUD asks first: apply and begin, drop and begin, or keep shaping; anything still waiting here is dropped)
    if (H.P.has()) { I.offTool(); H.P.drop(); }
    clearHistory();
    if (H.tool && !TOOL[H.tool].phases.includes('running')) api.setTool(null);
  });
  histChanged();
  return api;
}
