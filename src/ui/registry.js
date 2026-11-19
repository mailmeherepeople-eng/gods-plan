// The HUD's stage 2 seam: panels, readouts and inspector sections are data,
// registered from ui/plugins.js, so a new one is a new file plus one line
// (docs/STAGE2-CONTRACTS.md). Each def is { type, id, order?, ... }:
//   panel    { region, make(U) -> element, update?(U, dt, el) at 4 Hz, frame?(U, dt, el) every frame }
//            regions: 'topbar' (the top right row), 'root' (straight into the HUD root; the element places
//            itself), 'world' (the layer on the world, client px); any other name gets a box of its own
//   readout  { region: 'r2-left' (default) | 'r2-right' | 'status' (inside the top status island, after the
//            meters; there is no spare room there at 1366 x 768) | any panel region,
//            make(U) -> element, update?(U, stats, dt, el) at 4 Hz while time runs }
//   section  { title, when?(info, entity) -> bool, render(el, info, entity, U) } an inspector section the
//            HUD draws itself (give a thought); sections the simulation sends (inspect().sections) need none
// A def that throws is logged once and left out; the rest carry on.
import { h } from './dom.js';

export function makeRegistry(U) {
  const items = [];
  const byOrder = (a, b) => (a.def.order ?? 100) - (b.def.order ?? 100);
  const safe = (key, fn) => { try { return fn(); } catch (err) { U.warnOnce(key, err); return undefined; } };
  // each floating region is one box (made when first used), so several panels in it line up instead of overlapping
  const boxes = {};
  const parentOf = (region) => {
    if (region === 'topbar') return U.topbar;
    if (region === 'root') return U.root;          // the element places itself (hud.css)
    if (region === 'world') return U.world;        // on the world, client px, never takes the mouse unless it asks
    if (!boxes[region]) { boxes[region] = h('div', `reg-box reg-${region}`); U.root.appendChild(boxes[region]); }
    return boxes[region];
  };

  function place(it) {
    const { def, el } = it;
    const region = def.region ?? (def.type === 'readout' ? 'r2-left' : 'right');
    const free = region === 'root' || region === 'world';
    if (!free) el.classList.add('isl');
    el.classList.add(`reg-item`, `reg-item-${region}`);
    el.dataset.reg = def.id;
    const parent = parentOf(region);
    // in order among the others of the same region
    const after = items.filter((x) => x !== it && x.el.parentNode === parent && (x.def.order ?? 100) <= (def.order ?? 100)).pop();
    if (after) after.el.after(el); else parent.appendChild(el);
  }
  function add(def) {
    if (!def?.id || !def.type) { console.warn('ui: a registration needs an id and a type', def); return null; }
    const old = items.findIndex((x) => x.def.id === def.id);
    if (old >= 0) { items[old].el?.remove(); items.splice(old, 1); }
    const it = { def, el: null };
    if (def.type === 'section') { it.el = h('section', `in-sec in-reg in-reg-${def.id}`); items.push(it); U.inspect?.sectionsChanged?.(); return it.el; }
    it.el = safe(`make ${def.id}`, () => def.make(U));
    if (!it.el) return null;
    items.push(it);
    items.sort(byOrder);
    place(it);
    return it.el;
  }
  U.slow.push((dt) => {
    const st = U.get('sim', 'stats');
    const run = U.ctx.clock.phase === 'running';
    for (const it of items) {
      if (it.def.type === 'panel' && it.def.update) safe(`update ${it.def.id}`, () => it.def.update(U, dt, it.el));
      if (it.def.type === 'readout' && it.def.update && run) safe(`update ${it.def.id}`, () => it.def.update(U, st, dt, it.el));
    }
  });
  U.frame.push((dt) => { for (const it of items) if (it.def.frame) safe(`frame ${it.def.id}`, () => it.def.frame(U, dt, it.el)); });
  return {
    add,
    // the inspector's own sections, in order
    sections: () => items.filter((x) => x.def.type === 'section').sort(byOrder).map((x) => ({ def: x.def, el: x.el })),
    list: () => items.map((x) => ({ id: x.def.id, type: x.def.type, region: x.def.region ?? null })),
    async load(list) {
      for (const load of list) {
        try { const m = await load(); for (const d of m.default ?? []) add(d); } catch (err) { console.error('ui: a panel file failed to load', err); }
      }
    },
  };
}
