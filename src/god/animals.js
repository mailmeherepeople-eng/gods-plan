// Animals: the god places them (the director, 2026-11-12). A click puts down `count` of the armed kind round the
// point; holding the button and moving puts more down every `spacing` blocks. Since 2026-11-14 (point 31) they wait
// in the preview as small marks (pending.js): the tick places them all through ctx.modules.sim.spawnAnimal(kind,
// x, z) (which answers { entity, reason, text }; a refusal goes out as god:refused animal-<reason>), as one undo
// step in creation, and while the clock runs as one act (kind 'animal', with the kind and count). Here only the
// plain refusals are checked ahead (mist, protected ground, water for those that walk, dry land for fish).
import { FISH_KINDS } from './tools.js';

export function makeAnimals(H) {
  const A = { op: null };
  const opt = () => H.opts.animals;

  function one(kind, x, z) {
    const w = H.why(Math.floor(x), Math.floor(z));
    if (w) { H.refuse(w, x, z); return false; }
    if (typeof H.sim()?.spawnAnimal !== 'function') { H.refuse('no-sim', x, z); return false; }
    const wet = H.P.L.waterTop(Math.floor(x), Math.floor(z)) >= 0;
    if (FISH_KINDS.includes(kind)) { if (!wet) { H.refuse('animal-dry', x, z); return false; } }
    else if (kind !== 'bird' && wet) { H.refuse('animal-water', x, z); return false; }
    H.P.op({ type: 'animal', kind, x, z }, x, z);
    return true;
  }
  // `count` animals: the first on the point, the rest in a loose ring round it
  function group(kind, x, z) {
    const n = Math.max(1, Math.round(opt().count));
    let made = 0;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, r = i ? 1.2 + Math.sqrt(i) * 0.9 : 0;
      if (one(kind, x + Math.cos(a) * r, z + Math.sin(a) * r)) made++;
    }
    return made;
  }
  A.busy = () => !!A.op;
  A.down = (g) => {
    const kind = H.toolDef()?.animal;
    if (!kind) return;
    H.P.begin('animal', `Place ${H.toolDef()?.name?.toLowerCase() ?? kind}`);
    A.op = { kind, last: { x: g.x, z: g.z } };
    group(kind, g.x, g.z);
  };
  A.drag = (g) => {
    const op = A.op;
    if (!op || Math.hypot(g.x - op.last.x, g.z - op.last.z) < opt().spacing) return;
    op.last = { x: g.x, z: g.z };
    group(op.kind, g.x, g.z);
  };
  A.up = () => { if (!A.op) return; A.op = null; H.P.end(); };
  A.cancel = () => { if (!A.op) return; A.op = null; H.P.cancelFrame(); H.P.changed(); };
  return A;
}
