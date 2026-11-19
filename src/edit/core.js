// The edit state: entities, groups, the document (zones and other edit data),
// selection, filters, and the undo history. Every edit runs inside a
// transaction that snapshots the entities it touches and records the blocks it
// writes, so anything can be undone.
// Ported from the source repo's dev/planner/core.js. Removed: the era number
// and the history game's categories. Added: addCat(), a doc key that did not
// exist before a transaction is undone cleanly, maxY on the mesher proxy.
//
// An entity is a plain object (see docs/ARCHITECTURE.md):
//   { id, kind, cat, name, x, y, z, ry,
//     foot: { w, d, h, cx, cz },          // footprint for picking and outlines
//     objs: [{ obj, off: {x,y,z}, ry0 }], // three.js objects that follow it
//     cells: null | [[dx,dy,dz,id,heal,force], ...], fx, fz }  // block-built
import { B } from '../world/blocks.js';
import { makeVox, cellsAt, cutCells, pasteCells, idx, inB, inXZ, SX, SY, SZ, X0, Z0, X1, Z1, GROUND_Y } from './vox.js';

// Categories drive filters (hide, lock) and outline colours. Add more with
// P.addCat(); 'zone' and 'note' are read by view/overlay.js.
export const CATS = [
  { id: 'holy', label: 'Holy places', color: '#f2dc5d' },
  { id: 'building', label: 'Buildings', color: '#e8a33c' },
  { id: 'tree', label: 'Trees and plants', color: '#62a84a' },
  { id: 'rock', label: 'Rocks', color: '#a8a296' },
  { id: 'animal', label: 'Animals', color: '#c98a5a' },
  { id: 'person', label: 'People', color: '#6aa8d8' },
  { id: 'note', label: 'Notes', color: '#f2dc5d' },
  { id: 'zone', label: 'Zones', color: '#9b8cff' },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

const STATE_KEYS = ['x', 'y', 'z', 'ry', 'removed', 'deleted', 'name', 'note', 'group'];
const rotXZ = (x, z, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; };
export const quarter = (e) => (((Math.round((e.ry - e.ry0) / (Math.PI / 2)) % 4) + 4) % 4);

export function makeCore(G) {
  const V = makeVox(G);
  let owner = new Uint16Array(SX * SY * SZ); // re-made when the world's size changes (P.relayout)
  const P = {
    G, V, owner,
    list: [null],            // entity by index (owner map refers to these); [0] unused
    byId: new Map(),
    sel: new Set(),
    hover: null,
    doc: freshDoc(),
    filters: Object.fromEntries(CATS.map((c) => [c.id, { hidden: false, locked: false }])),
    history: { undo: [], redo: [] },
    listeners: new Map(),
    snap: true,
    dirty: false,
  };
  P.on = (ev, fn) => { if (!P.listeners.has(ev)) P.listeners.set(ev, []); P.listeners.get(ev).push(fn); };
  P.emit = (ev, a) => { for (const fn of P.listeners.get(ev) ?? []) { try { fn(a); } catch (err) { console.error('core', ev, err); } } };
  // a new category (for filters and outline colours)
  P.addCat = (id, label = id, color = '#ffffff') => {
    if (!CAT[id]) { const c = { id, label, color }; CATS.push(c); CAT[id] = c; }
    if (!P.filters[id]) P.filters[id] = { hidden: false, locked: false };
    return CAT[id];
  };
  P.changed = (what = 'edit') => { P.dirty = true; P.emit('change', what); };

  // ---------- entities ----------
  P.reset = () => {
    for (const e of P.list) if (e) e.dispose?.();
    P.list = [null]; P.byId.clear(); P.sel.clear(); P.hover = null;
    owner.fill(0);
    P.doc = freshDoc();
    P.history = { undo: [], redo: [] };
  };
  P.add = (e) => {
    Object.assign(e, {
      ry: e.ry ?? 0, removed: false, deleted: false, note: e.note ?? '', group: e.group ?? null,
      objs: e.objs ?? [], cells: e.cells ?? null,
    });
    e.ry0 = e.ry0 ?? e.ry;
    e.base = e.added ? null : { x: e.x, y: e.y, z: e.z, ry: e.ry, name: e.name };
    if (!e.baseName) e.baseName = e.name;
    e.i = P.list.length;
    P.list.push(e);
    let id = e.id, n = 2;
    while (P.byId.has(id)) id = `${e.id}#${n++}`;
    e.id = id;
    P.byId.set(id, e);
    if (e.cells) own(e, true);
    return e;
  };
  P.alive = (e) => e && !e.deleted;
  P.all = () => P.list.filter((e) => e && !e.deleted);

  // which cells are this entity's right now
  function own(e, on) {
    if (!e.cells) return;
    for (const [x, y, z, id] of cellsAt(e, e.x, e.y, e.z, quarter(e))) {
      if (!inB(x, y, z)) continue;
      const i = idx(x, y, z);
      if (on) { if (V.W.data[i] === id && (id !== B.AIR || e.carve)) owner[i] = e.i; } else if (owner[i] === e.i) owner[i] = 0;
    }
  }
  P.own = own;

  // where a thing stands at (x, z): on the ground, keeping the height it had
  // above the ground where it was made (a fire in a trench stays in the trench)
  P.standY = (e, x, z) => groundSkip(e, x, z) + 1 + (e.yAbove ?? 0);
  function groundSkip(e, x, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    if (!inXZ(fx, fz)) return GROUND_Y;
    if (e.carve) { // a trench measures from the surface beside itself
      for (let y = SY - 1; y >= 0; y--) if (owner[idx(fx, y, fz)] === e.i) return Math.round(e.y) - 1;
    }
    return V.groundTop(fx, fz);
  }

  P.placeObjs = (e) => {
    const dr = e.ry - e.ry0;
    for (const o of e.objs) {
      const [ox, oz] = rotXZ(o.off.x, o.off.z, dr);
      o.obj.position.set(e.x + ox, e.y + o.off.y, e.z + oz);
      o.obj.rotation.y = o.ry0 + dr;
    }
    e.onPlace?.();
  };
  P.visible = (e) => !e.deleted && !e.removed && !P.filters[e.cat]?.hidden;
  P.refreshVis = (e) => { const v = P.visible(e); for (const o of e.objs) o.obj.visible = v; e.onVis?.(v); };

  // ---------- transactions ----------
  let tx = null;
  P.begin = (label) => { if (tx) P.end(); tx = { label, before: new Map(), docBefore: {}, created: new Set() }; V.begin(); };
  P.touch = (e) => { if (tx && !tx.before.has(e)) tx.before.set(e, snapState(e)); };
  P.touchNew = (e) => { if (tx) { tx.before.set(e, { ...snapState(e), deleted: true }); tx.created.add(e); } };
  P.touchDoc = (key) => { if (tx && !(key in tx.docBefore)) tx.docBefore[key] = JSON.stringify(P.doc[key] ?? null); };
  P.end = () => {
    if (!tx) return null;
    const t = tx; tx = null;
    const diff = V.end();
    const cmd = { label: t.label, before: t.before, after: new Map(), diff, docBefore: t.docBefore, docAfter: {} };
    for (const e of t.before.keys()) cmd.after.set(e, snapState(e));
    for (const k of Object.keys(t.docBefore)) cmd.docAfter[k] = JSON.stringify(P.doc[k] ?? null);
    const nothing = !diff.length && ![...cmd.before].some(([e, s]) => JSON.stringify(s) !== JSON.stringify(cmd.after.get(e)))
      && !Object.keys(cmd.docBefore).some((k) => cmd.docBefore[k] !== cmd.docAfter[k]);
    if (nothing) return null;
    P.history.undo.push(cmd);
    if (P.history.undo.length > 600) P.history.undo.shift();
    P.history.redo.length = 0;
    V.flush();
    P.changed(t.label);
    return cmd;
  };
  P.cancel = () => { // throw away an open transaction, putting everything back
    if (!tx) return;
    const t = tx; tx = null;
    V.applyDiff(V.end(), false);
    for (const [e, s] of t.before) applyState(e, s);
    for (const k of Object.keys(t.docBefore)) P.doc[k] = JSON.parse(t.docBefore[k]);
    V.flush();
    P.emit('change', 'cancel');
  };
  P.inTx = () => !!tx;
  // a step that is not blocks and entities (a world resize, say): its own undo and redo
  P.pushCustom = (label, custom) => {
    if (tx) P.end();
    P.history.undo.push({ label, custom, before: new Map(), after: new Map(), diff: [], docBefore: {}, docAfter: {} });
    if (P.history.undo.length > 600) P.history.undo.shift();
    P.history.redo.length = 0;
    P.changed(label);
  };

  function snapState(e) {
    const s = {};
    for (const k of STATE_KEYS) s[k] = e[k];
    s.params = e.params ? JSON.parse(JSON.stringify(e.params)) : null;
    return s;
  }
  P.snapState = snapState;
  function applyState(e, s) {
    if (e.cells) own(e, false);
    for (const k of STATE_KEYS) e[k] = s[k];
    if (s.params) e.params = JSON.parse(JSON.stringify(s.params));
    P.placeObjs(e);
    if (e.cells && !e.removed && !e.deleted) own(e, true);
    if (e.deleted) P.sel.delete(e);
    P.refreshVis(e);
    e.onParams?.();
  }
  P.applyState = applyState;

  P.undo = () => {
    if (tx) P.end();
    const c = P.history.undo.pop();
    if (!c) return false;
    if (c.custom) { c.custom.undo(); P.history.redo.push(c); V.flush(); P.changed('undo'); return c.label; } // a custom step (pushCustom)
    // entities go back first (their own cells unowned), then the blocks
    for (const [e] of c.before) if (e.cells) own(e, false);
    V.applyDiff(c.diff, false);
    for (const [e, s] of c.before) applyState(e, s);
    for (const k of Object.keys(c.docBefore)) P.doc[k] = JSON.parse(c.docBefore[k]);
    P.history.redo.push(c);
    V.flush();
    P.changed('undo');
    return c.label;
  };
  P.redo = () => {
    const c = P.history.redo.pop();
    if (!c) return false;
    if (c.custom) { c.custom.redo(); P.history.undo.push(c); V.flush(); P.changed('redo'); return c.label; }
    for (const [e] of c.after) if (e.cells) own(e, false);
    V.applyDiff(c.diff, true);
    for (const [e, s] of c.after) applyState(e, s);
    for (const k of Object.keys(c.docAfter)) P.doc[k] = JSON.parse(c.docAfter[k]);
    P.history.undo.push(c);
    V.flush();
    P.changed('redo');
    return c.label;
  };

  // ---------- moving things (call inside a transaction) ----------
  // moves: [{ e, x, z, ry }]. Every block-built thing is cut first, then all
  // are pasted, so a group can move onto its own old ground.
  // `between` runs once everything is cut and before anything is pasted: the
  // ground itself may change there (moving a piece of land), and things land on the new ground.
  P.moveMany = (moves, between) => {
    for (const m of moves) P.touch(m.e);
    for (const m of moves) {
      const e = m.e;
      if (e.cells && !e.removed) cutCells(V, cellsAt(e, e.x, e.y, e.z, quarter(e)), owner, e.i);
    }
    between?.();
    for (const m of moves) {
      const e = m.e;
      e.x = clampX(m.x, X0, X1); e.z = clampX(m.z, Z0, Z1);
      if (m.ry !== undefined) e.ry = m.ry;
      e.y = m.y ?? P.standY(e, e.x, e.z);
    }
    for (const m of moves) {
      const e = m.e;
      if (e.cells && !e.removed) pasteCells(V, cellsAt(e, e.x, e.y, e.z, quarter(e)), owner, e.i);
      P.placeObjs(e);
    }
  };
  const clampX = (v, lo, hi) => Math.max(lo + 0.5, Math.min(hi - 0.5, v));
  P.removeMany = (ents) => {
    for (const e of ents) {
      if (e.removed || e.deleted) continue;
      P.touch(e);
      if (e.cells) cutCells(V, cellsAt(e, e.x, e.y, e.z, quarter(e)), owner, e.i);
      if (e.added) e.deleted = true; else e.removed = true;
      P.sel.delete(e);
      P.refreshVis(e);
    }
  };
  P.restoreMany = (ents) => {
    for (const e of ents) {
      if (!e.removed) continue;
      P.touch(e);
      e.removed = false;
      if (e.cells) pasteCells(V, cellsAt(e, e.x, e.y, e.z, quarter(e)), owner, e.i);
      P.refreshVis(e);
    }
  };
  // a new thing: its blocks pasted where it stands, recorded as created
  P.create = (e) => {
    e.added = true;
    P.add(e);
    P.touchNew(e);
    if (e.cells) { e.y = e.y ?? P.standY(e, e.x, e.z); own(e, false); pasteCells(V, cellsAt(e, e.x, e.y, e.z, quarter(e)), owner, e.i); }
    P.placeObjs(e);
    P.refreshVis(e);
    return e;
  };

  // ---------- selection ----------
  P.groupOf = (e) => (e.group ? P.all().filter((o) => o.group === e.group) : [e]);
  P.selectable = (e) => P.alive(e) && !P.filters[e.cat]?.hidden && !P.filters[e.cat]?.locked;
  P.select = (ents, mode = 'set') => {
    if (mode === 'set') P.sel.clear();
    if (ents.length) P.zoneSel = null;
    for (const e of ents) {
      if (!e) continue;
      if (mode === 'toggle') { if (P.sel.has(e)) P.sel.delete(e); else P.sel.add(e); } else if (mode === 'remove') P.sel.delete(e); else P.sel.add(e);
    }
    P.emit('select');
  };
  P.selected = () => [...P.sel].filter((e) => P.alive(e));

  // ---------- filters: hiding block-built things needs the mesher's help ----------
  const W = V.W;
  const hiddenCats = () => new Set(CATS.filter((c) => P.filters[c.id].hidden).map((c) => c.id));
  const proxy = { get: (x, y, z) => W.get(x, y, z), dirty: W.dirty, markAllDirty: () => W.markAllDirty(), get maxY() { return W.maxY; } };
  G.mesher.world = proxy;
  P.setFilter = (cat, key, on) => {
    P.filters[cat][key] = on;
    if (key === 'hidden') {
      for (const e of P.list) if (e && e.cat === cat) { P.refreshVis(e); if (on) P.sel.delete(e); }
      const hc = hiddenCats();
      const anyCells = P.list.some((e) => e && e.cells && hc.has(e.cat));
      if (anyCells || P._cellsHidden) {
        P._cellsHidden = anyCells;
        if (!anyCells) proxy.get = (x, y, z) => W.get(x, y, z);
        else proxy.get = (x, y, z) => {
          if (!inB(x, y, z)) return B.AIR;
          const i = idx(x, y, z), o = owner[i];
          if (o) { const e = P.list[o]; if (e && hc.has(e.cat)) return B.AIR; }
          return W.data[i];
        };
        W.markAllDirty();
        G.mesher.flush(Infinity);
      }
    }
    if (key === 'locked' && on) for (const e of [...P.sel]) if (e.cat === cat) P.sel.delete(e);
    P.emit('filters');
    P.emit('select');
  };

  // the world changed size (a future port of worldsize.js): a fresh owner map in the new layout, every thing owning its cells again
  P.relayout = () => {
    owner = new Uint16Array(SX * SY * SZ);
    P.owner = owner;
    for (const e of P.list) if (e && e.cells && !e.removed && !e.deleted) own(e, true);
  };
  P.newId = (prefix) => { let n = (P.doc.seq = (P.doc.seq ?? 0) + 1); while (P.byId.has(`${prefix}${n}`)) n = ++P.doc.seq; return `${prefix}${n}`; };
  return P;
}

// Doc keys are free-form; touchDoc(key) before changing one inside a transaction.
export function freshDoc() {
  return { groups: {}, zones: [], seq: 0 };
}
