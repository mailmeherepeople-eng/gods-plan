// The god's hands: the left mouse button (or one finger) on the world, the keys, the brush ring, strokes, the
// river being painted, the path being drawn, the lake tap, and handing the pointer to the cave, the animals and the
// powers. (2026-11-15: the river is a brush you drag, no longer points; the lake is dug where it is tapped.)
// Ported from the source repo's dev/planner/tools.js (leftDown, leftMove, leftUp, the brush tick that dabs every
// few hundredths of a second and fills a fast stroke between dabs, brushRing, riverCurve/riverHit/riverDown/
// riverDbl/riverPreview, lakeAt) and planner.js (the keys).
// 2026-11-14 (director, point 31): every Reshape stroke, river, lake, animal and erase goes into the preview
// (pending.js) and changes nothing real until the tick. Enter is the tick and Esc the cross for every tool (the
// cave's too); undo steps back the strokes still waiting. Measure, Pick, Move area, the stamps and the cliff line
// are gone (the middle click no longer picks).
import { TOOL, COLUMN, KEY_BY_CODE, INVERSE, POWER_BY_CODE, PREVIEWED } from './tools.js';

const EVERY = { land: 0.06, paint: 0.03, scatter: 0.12, erase: 0.05 };

export function makeInput(H, D) {
  const { ctx, PT } = H;
  const { core, vox, pick, overlay, camera, controls, events, clock, dom } = ctx;
  const canvas = dom.canvas;
  const I = { op: null, g: null, px: 0, py: 0, over: false, picked: false, path: null, camKey: '', lastTouch: null };
  H.I = I;
  const P = () => H.P;
  const pathLines = D.lines(63), pathTag = D.tag();
  let pathGhost = null;

  const typing = () => { const a = document.activeElement; return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  const fam = (id = H.tool) => TOOL[id]?.family;
  const O = (id = H.tool) => H.opts[fam(id)] ?? {};
  const usable = (g) => g && !g.off;
  // the pending preview belongs to the column armed now (Reshape, River, Lake, Vegetation, Animals, Erase)
  I.previewed = (id = H.tool) => PREVIEWED.has(TOOL[id]?.col);

  // ---------- brush strokes (into the preview) ----------
  function dab(S, g) {
    const id = S.id, T = TOOL[id], o = H.opts[T.family], L = P().L;
    const before = H.tallyTotal();
    let n = 0;
    if (T.family === 'land') n = L.dab(id, o, g);
    else if (T.family === 'paint') n = L.paint(T.block, o, g);
    else if (T.family === 'scatter') n = L.scatter(T.plants ?? (T.tree ? `tree.${T.tree}` : 'trees'), o, g);
    else if (T.family === 'erase') n = L.erase({ ...o, fields: clock.phase === 'creation' }, g) + eraseThings(o, g);
    S.n += n;
    if (H.tallyTotal() > before || H.allow.capped) H.refuse(H.allow.capped ? 'protected' : H.tallyReason(), g.x, g.z);
    H.allow.capped = false;
  }
  // what an erase takes that is not blocks: animals the god placed, and caves the god carved that nobody lives in
  function eraseThings(o, g) {
    let n = 0;
    const r = o.size, Pp = P();
    const gone = Pp.goneAnimals();
    for (const a of H.sim()?.animals ?? []) {
      if (!a.placed || a.dead || gone.has(a) || Math.hypot(a.x - g.x, a.z - g.z) > r + 0.5) continue;
      if (H.why(Math.floor(a.x), Math.floor(a.z))) continue;
      Pp.op({ type: 'gone', e: a }, a.x, a.z);
      n++;
    }
    const closing = Pp.closingCaves();
    for (const c of H.simCall('ask', 'caves') ?? []) {
      if (closing.has(c) || c.households?.length || !c.box) continue;
      const b = c.box, nx = Math.max(b.x0, Math.min(b.x1 + 1, g.x)), nz = Math.max(b.z0, Math.min(b.z1 + 1, g.z));
      if (Math.hypot(nx - g.x, nz - g.z) > r) continue;
      const cp = H.simCall('ask', 'caveClosePlan', c);
      if (!cp?.ok) continue;
      Pp.op({ type: 'cave', cave: c, y: c.F ?? vox.groundTop(c.x, c.z) }, c.x, c.z);
      for (const [x, y, z, id] of cp.cells) Pp.V.set(x, y, z, id); // the hill as it was, in the preview
      n++;
    }
    return n;
  }
  function startStroke(id, g) {
    finish();
    H.tallyReset();
    const T = TOOL[id];
    P().begin(id);
    P().L.beginStroke(O(id), g);
    const S = { kind: 'brush', id, T, n: 0, t: 0, every: EVERY[T.family] ?? 0.06, last: { x: g.x, z: g.z } };
    I.op = S;
    dab(S, g);
    return S;
  }
  // a fast stroke is filled in between dabs, so a painted lane has no gaps (not scatter, as the planner)
  function strokeTo(S, g) {
    const r = Math.max(0.6, (H.opts[S.T.family].size ?? 3) * 0.5);
    const dx = g.x - S.last.x, dz = g.z - S.last.z, d = Math.hypot(dx, dz);
    if (d <= r || S.T.family === 'scatter') return false;
    const n = Math.min(40, Math.ceil(d / r));
    for (let i = 1; i < n; i++) dab(S, { x: S.last.x + dx * i / n, z: S.last.z + dz * i / n });
    dab(S, g);
    S.last = { x: g.x, z: g.z }; S.t = 0;
    return true;
  }
  function strokeTick(S, dt) {
    S.t += dt;
    const g = I.g;
    if (usable(g) && strokeTo(S, g)) { /* dabbed along the way */ } else if (S.t >= S.every) { S.t = 0; const at = usable(g) ? g : S.last; dab(S, at); S.last = { x: at.x, z: at.z }; }
  }
  function endStroke(S) {
    P().L.endStroke();
    I.op = null;
    return P().end();
  }

  // ---------- the river, painted (the director, 2026-11-15: "you paint water like how you paint water right now. We
  // do not need points for rivers"). A stroke gathers the finger's path; the river is made again along it (land.js
  // L.river: sand banks or a plain channel, its surface stepping down, never up) at most every RIVER_MS while the
  // finger moves, as one frame of the preview, so the water shows as it is painted and undo takes back a stroke.
  const RIVER_DEPTH = 2, RIVER_STEP = 0.8, RIVER_MS = 90;
  // a light smoothing of the finger's wobble (each point the mean of its neighbours; the ends stay)
  const smoothPath = (pts) => (pts.length < 3 ? pts.map((q) => q.slice()) : pts.map((q, i) => (i === 0 || i === pts.length - 1 ? q.slice() : [(pts[i - 1][0] + q[0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + q[1] * 2 + pts[i + 1][1]) / 4])));
  function riverMake(S) {
    S.due = 0; S.at = performance.now();
    const Pp = P();
    if (S.frame && Pp.top() === S.frame) Pp.popTop();
    S.frame = null;
    const o = H.opts.river;
    H.tallyReset();
    Pp.begin('river', 'Paint a river');
    Pp.L.river(smoothPath(S.pts), o.size, RIVER_DEPTH, o.banks);
    S.frame = Pp.end();
    if (!S.frame) Pp.changed();
    if (H.tallyTotal()) H.refuse(H.tallyReason(), S.pts[0][0], S.pts[0][1]);
  }
  function riverStart(g) {
    finish();
    const w = H.why(g.cx ?? Math.floor(g.x), g.cz ?? Math.floor(g.z));
    if (w) { H.refuse(w, g.x, g.z); return null; }
    const S = { kind: 'river', id: 'river', pts: [[g.x, g.z]], frame: null, due: 0, at: 0 };
    I.op = S;
    riverMake(S);
    return S;
  }
  function riverTo(S, g) {
    const l = S.pts[S.pts.length - 1], d = Math.hypot(g.x - l[0], g.z - l[1]);
    if (d < RIVER_STEP) return;
    const n = Math.min(60, Math.ceil(d / RIVER_STEP));
    for (let i = 1; i <= n; i++) S.pts.push([l[0] + (g.x - l[0]) * i / n, l[1] + (g.z - l[1]) * i / n]);
    if (!S.due) S.due = performance.now();
  }
  function riverTick(S) {
    if (usable(I.g)) riverTo(S, I.g);
    if (S.due && performance.now() - S.at > RIVER_MS) riverMake(S);
  }
  function riverEnd(S) { if (S.due) riverMake(S); I.op = null; return S.frame; }
  // a river along given points at once (god.river, the scripts)
  I.riverAlong = (pts) => {
    if (!pts?.length) return null;
    const S = { kind: 'river', id: 'river', pts: [[pts[0][0], pts[0][1]]], frame: null, due: 0, at: 0 };
    for (const p of pts.slice(1)) riverTo(S, { x: p[0], z: p[1] });
    riverMake(S);
    return S.frame;
  };
  // the tick (Enter, the HUD's button, god.apply): everything waiting
  I.digRiver = () => { finish(); return P().apply(); };

  // ---------- lake: one tap digs a bowl and fills it (land.js L.bowl), into the preview ----------
  I.lakeAt = (g) => {
    finish();
    const o = H.opts.lake;
    H.tallyReset();
    P().begin('lake', 'Dig a lake');
    const res = P().L.bowl(g.x, g.z, o.size, o.depth);
    if (res.refused || !res.n) {
      P().cancelFrame();
      P().changed();
      if (res.refused) H.refuse(res.refused, res.x ?? g.x, res.z ?? g.z);
      return null;
    }
    P().end();
    if (H.tallyTotal()) H.refuse(H.tallyReason(), g.x, g.z);
    return res;
  };

  // ---------- the path being drawn (no button, no key: kept as it was, laid at once) ----------
  const r1 = (v) => Math.round(v * 10) / 10;
  function pathDown(g, ev) {
    if (!I.path && !ev.shiftKey) { // a laid path under the click: select it (Del takes it up)
      const e = PT.at(g.x, g.z, Math.max(0.35, 4 / camera.ppm));
      if (e) { core.select([e]); overlay.dirty = true; H.emit('path'); return; }
    }
    if (core.selected().some((e) => e.kind === 'path')) { core.select([]); overlay.dirty = true; }
    const w = H.why(Math.floor(g.x), Math.floor(g.z));
    if (w) { H.refuse(w, g.x, g.z); return; }
    const q = [r1(g.x), r1(g.z)];
    if (!I.path) I.path = { pts: [q] };
    else { const l = I.path.pts[I.path.pts.length - 1]; if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.6) I.path.pts.push(q); }
    pathPreview();
    H.emit('path');
  }
  function pathPreview() {
    if (pathGhost) { overlay.group.remove(pathGhost); pathGhost.geometry.dispose(); pathGhost = null; }
    if (!I.path) { pathLines.clear(); pathTag.hide(); return; }
    const pts = I.path.pts.slice();
    const g = I.g;
    if (usable(g) && I.over) pts.push([g.x, g.z]);
    pathLines.begin();
    const yy = (x, z) => vox.standY(x, z) + 0.25;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
      for (let k = 0; k < n; k++) {
        const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], q = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
        pathLines.seg([p[0], yy(p[0], p[1]), p[1]], [q[0], yy(q[0], q[1]), q[1]], 0xffe066);
      }
    }
    const s = Math.max(0.3, 4 / camera.ppm);
    for (const [x, z] of I.path.pts) { const y = vox.standY(x, z) + 0.3; pathLines.seg([x - s, y, z], [x + s, y, z], 0xffffff).seg([x, y, z - s], [x, y, z + s], 0xffffff); }
    pathLines.end();
    if (pts.length > 1) {
      const T = TOOL[H.tool], { Kd, lay, water } = PT.plan({ pathKind: T.pathKind, width: H.opts.path.width, points: pts });
      const cells = [];
      for (const c of lay) { const h = vox.groundTop(c.x, c.z); cells.push([c.x, h + 0.08, c.z, Kd.block]); }
      if (cells.length && cells.length < 6000) { pathGhost = overlay.cellMesh(cells); pathGhost.scale.y = 0.15; overlay.group.add(pathGhost); }
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const last = pts[pts.length - 1];
      pathTag.show(last[0], vox.standY(last[0], last[1]) + 1.2, last[1], `${len.toFixed(1)} m${water.length ? `, stops at ${water.length} m2 of water` : ''}`);
    } else pathTag.hide();
  }
  I.finishPath = () => {
    if (!I.path) return null;
    const pts = I.path.pts.filter((q, i, a) => !i || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 0.6);
    I.path = null; pathPreview();
    if (pts.length < 2) { H.refuse('path-short', pts[0]?.[0] ?? null, pts[0]?.[1] ?? null); H.emit('path'); return null; }
    return layPath(pts, TOOL[H.tool]?.pathKind ?? 'earth', H.opts.path.width, H.opts.path.steps);
  };
  function layPath(pts, kind, width, steps) {
    finish();
    H.tallyReset();
    core.begin(`Lay a path: ${TOOL[`path.${kind}`]?.name ?? kind}`);
    const r = PT.create(pts, kind, width, steps);
    const cmd = core.end();
    if (H.tallyTotal()) H.refuse(H.tallyReason(), r.e.x, r.e.z);
    if (cmd) { core.select([r.e]); overlay.dirty = true; H.act('path', r.e.x, r.e.z, Math.hypot(r.e.foot.w, r.e.foot.d) / 2); }
    H.emit('path');
    return cmd ? r.e : null;
  }
  I.layPath = layPath;
  I.dropPathPoint = () => { if (!I.path) return false; I.path.pts.pop(); if (!I.path.pts.length) I.path = null; pathPreview(); H.emit('path'); return true; };
  I.clearPath = () => { if (!I.path) return false; I.path = null; pathPreview(); H.emit('path'); return true; };
  // take up the selected path(s): the ground under them comes back
  I.takeUpPaths = (list = core.selected().filter((e) => e.kind === 'path')) => {
    if (!list.length) return false;
    const why = list.map((e) => e.params.laid.map(([x, , z]) => H.why(x, z)).find(Boolean)).find(Boolean);
    if (why) { H.refuse(why, list[0].x, list[0].z); return true; }
    finish();
    core.begin(list.length === 1 ? 'Take up a path' : `Take up ${list.length} paths`);
    for (const e of list) { core.touch(e); PT.heal(e); }
    core.removeMany(list);
    const cmd = core.end();
    overlay.dirty = true;
    if (cmd) { const e = list[0]; H.act('path-remove', e.x, e.z, Math.hypot(e.foot.w, e.foot.d) / 2); }
    H.emit('path');
    return true;
  };

  // ---------- pointer ----------
  function press(ev) {
    let id = H.tool;
    const g = I.g, T = TOOL[id];
    // a finger has no hover: its first tap aims (the trade off shows), a second tap on the same target acts
    if (T.kind === 'power') { if (ev.pointerType === 'touch') H.aim.touch(ev); else H.aim.down(ev); return; }
    if (!usable(g)) return;
    if (T.kind === 'animal') { H.animals.down(g, ev); return; }
    if (T.kind === 'river') { riverStart(g); return; }
    if (T.kind === 'lake') { I.lakeAt(g); return; }
    if (T.kind === 'cave') { H.cave.down(g, ev); return; }
    if (T.kind === 'path') { pathDown(g, ev); return; }
    if (ev.ctrlKey && INVERSE[id]) id = INVERSE[id];
    startStroke(id, g);
  }
  function release() {
    const op = I.op;
    if (!op) return;
    if (op.kind === 'brush') endStroke(op);
    else if (op.kind === 'river') riverEnd(op);
    else I.op = null;
  }
  // end whatever is in progress, keeping it (a tool change, an undo)
  function finish() { if (I.op) release(); H.animals.up(); }
  // throw away whatever stroke is in progress (not the strokes before it)
  function cancel() {
    const op = I.op;
    I.op = null;
    if (op?.kind === 'brush') { P().L.endStroke(); P().cancelFrame(); P().changed(); }
    if (op?.kind === 'river') { if (op.frame && P().top() === op.frame) P().popTop(); P().changed(); }
    H.animals.cancel?.();
  }
  I.finish = finish;
  I.cancel = cancel;
  I.busy = () => !!I.op || !!I.path;
  I.startStroke = startStroke; I.strokeTo = strokeTo; I.endStroke = endStroke; I.dabAt = dab;
  // a second finger came down: what the first one began since it touched goes (its stroke, its river, a lake it
  // dug, animals it put down); what was drawn before stays
  I.untouch = () => {
    if (!I.down || !I.downAt) { if (I.op) { cancel(); return true; } return false; }
    const at = I.downAt;
    I.downAt = null;
    let undid = false;
    if (I.op) { cancel(); undid = true; }
    if (H.animals.busy()) { H.animals.cancel(); undid = true; }
    while (P().count() > at.frames) { P().undo(); undid = true; }
    return undid;
  };

  const repick = () => { I.g = pick.ground(I.px, I.py); I.picked = true; };
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !H.tool || !controls.enabled) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic event */ }
    I.px = ev.clientX; I.py = ev.clientY; I.over = true;
    if (ev.pointerType === 'touch') I.lastTouch = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    repick();
    I.down = true;
    I.downAt = { frames: P().count() };
    press(ev);
  });
  canvas.addEventListener('pointermove', (ev) => {
    I.px = ev.clientX; I.py = ev.clientY; I.over = true; I.picked = false;
    if (ev.pointerType === 'touch' && I.down) I.lastTouch = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    if (H.animals.busy() && (ev.buttons & 1)) { repick(); if (usable(I.g)) H.animals.drag(I.g); }
  });
  canvas.addEventListener('pointerup', (ev) => {
    if (ev.button === 0) {
      I.down = false;
      if (ev.pointerType === 'touch') I.lastTouch = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      H.aim.up();
      H.cave.up();
      H.animals.up();
      I.px = ev.clientX; I.py = ev.clientY; repick();
      if (I.op?.kind === 'brush' && usable(I.g)) strokeTo(I.op, I.g);
      if (I.op?.kind === 'river' && usable(I.g)) riverTo(I.op, I.g);
      release();
    }
  });
  canvas.addEventListener('pointercancel', () => { I.down = false; H.aim.cancelHold('lost'); H.animals.up(); release(); });
  canvas.addEventListener('pointerleave', () => { if (!I.down && !I.op) I.over = false; });
  canvas.addEventListener('pointerenter', () => { I.over = true; });
  addEventListener('blur', () => { I.down = false; H.aim.cancelHold('lost'); H.animals.up(); release(); });
  canvas.addEventListener('dblclick', (ev) => {
    const T = TOOL[H.tool];
    if (!T) return;
    if (T.kind === 'path') { I.finishPath(); return; }
  });
  // Alt + wheel: brush size (the camera keeps the plain wheel)
  let wheelT = 0;
  addEventListener('wheel', (ev) => {
    if (!ev.altKey || !H.tool || ev.target !== canvas) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const now = performance.now();
    if (now - wheelT < 60) return;
    wheelT = now;
    H.stepSize(ev.deltaY < 0 ? 1 : -1);
  }, { capture: true, passive: false });

  // a short right click (controls sends it): the Esc step
  events.on('rightclick', (p) => { if (I.escape()) { if (p) p.handled = true; } });

  // Esc unwinds, one step at a time: a held power, the stroke in progress, the change waiting (the cross), the
  // cave's ghost, the path's points, then the tool itself
  I.escape = () => {
    if (H.aim.cancelHold('escape')) return true;
    if (I.op) { cancel(); return true; }
    if (I.escapePending()) return true;
    if (H.tool === 'cave' && H.cave.cancel()) return true;
    if (I.clearPath()) return true;
    if (fam() === 'path' && core.selected().some((e) => e.kind === 'path')) { core.select([]); overlay.dirty = true; return true; }
    if (H.tool) { H.api.setTool(null); return true; }
    return false;
  };
  // the cross: the stroke in progress and every stroke waiting go
  I.escapePending = () => {
    if (I.op?.kind === 'brush' || I.op?.kind === 'river') cancel();
    if (!P().has()) return false;
    if (!P().drop()) P().changed();
    return true;
  };
  // Enter: the tick, for whatever is waiting (a change, the cave's ghost, a path's points)
  I.enter = () => {
    if (I.op) finish();
    if (P().has()) { I.digRiver(); return true; }
    if (H.tool === 'cave' && H.cave.pin) { H.cave.confirm(); return true; }
    if (I.path) { I.finishPath(); return true; }
    return false;
  };
  // a path's points are let go together with the tool (pending applied or dropped by the caller first)
  I.offTool = () => { I.clearPath(); };
  I.modeChange = () => {};

  // ---------- keys (planner.js) ----------
  const codeOf = (key = '') => {
    if (key === '[' || key === '{') return 'BracketLeft';
    if (key === ']' || key === '}') return 'BracketRight';
    if (/^[0-9]$/.test(key)) return `Digit${key}`;
    if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
    return key; // Escape, Enter, Backspace, Delete
  };
  addEventListener('keydown', (ev) => {
    // a menu or a sheet is open (it turns the camera's input off): the tool keys sleep too
    if (typing() || !controls.enabled) return;
    const k = ev.code || codeOf(ev.key);
    if (ev.ctrlKey || ev.metaKey) {
      if (k === 'KeyZ' && !ev.shiftKey) { ev.preventDefault(); H.api.undo(); }
      else if (k === 'KeyY' || (k === 'KeyZ' && ev.shiftKey)) { ev.preventDefault(); H.api.redo(); }
      return;
    }
    if (ev.altKey) return;
    if (k === 'Escape') { if (I.escape()) ev.preventDefault(); return; }
    if (k === 'BracketLeft' || k === 'BracketRight') {
      ev.preventDefault();
      const d = k === 'BracketRight' ? 1 : -1;
      if (ev.shiftKey) H.stepOption('strength', d); else H.stepSize(d);
      return;
    }
    if (k === 'Enter' || k === 'NumpadEnter') {
      if (!H.tool) return;
      if (ev.repeat) { if (P().has() || I.path || H.cave.pin) ev.preventDefault(); return; }
      if (I.enter()) ev.preventDefault();
      return;
    }
    if (k === 'Backspace' || k === 'Delete') {
      if (k === 'Backspace' && I.dropPathPoint()) { ev.preventDefault(); return; }
      if (fam() === 'path' && core.selected().some((e) => e.kind === 'path')) { ev.preventDefault(); I.takeUpPaths(); return; }
      return;
    }
    if (ev.repeat || ev.shiftKey) return;
    // with the Cave tool in hand R turns the cave's mouth (before Rain's letter, which is R too)
    if (k === 'KeyR' && H.tool === 'cave') { ev.preventDefault(); H.cave.turn(); return; }
    // a power's own letter arms it (Z Strike); then a tool's or group's letter (B Reshape, P Terrain, Y Structures,
    // U River, V Plants, N Animals, X Erase), on what was picked last inside it
    const pw = POWER_BY_CODE[k];
    if (pw) { ev.preventDefault(); H.api.setTool(pw); return; }
    const f = KEY_BY_CODE[k];
    if (f) { ev.preventDefault(); H.api.setFamily(f); return; }
    const m = /^Digit([1-9])$/.exec(k) ?? /^Numpad([1-9])$/.exec(k);
    if (m && H.tool) {
      const id = COLUMN[TOOL[H.tool]?.col]?.modes[Number(m[1]) - 1];
      if (id) { ev.preventDefault(); H.api.setTool(id); }
    }
  });

  // ---------- per frame ----------
  I.update = (dt) => {
    const key = `${camera.target.x.toFixed(2)},${camera.target.z.toFixed(2)},${camera.ppm.toFixed(3)},${camera.yaw.toFixed(3)},${camera.pitch.toFixed(3)}`;
    const camMoved = key !== I.camKey;
    I.camKey = key;
    const hadG = I.g;
    if (H.tool && I.over && (!I.picked || camMoved) && I.op?.kind !== 'brush') repick();
    else if (I.op?.kind === 'brush' && (!I.picked || camMoved)) repick();
    if (I.op?.kind === 'brush') strokeTick(I.op, dt);
    // the river being painted: its path follows the finger, its water is made again at most every RIVER_MS
    if (I.op?.kind === 'river') riverTick(I.op);
    if (I.path && (I.g !== hadG || camMoved)) pathPreview();
    ring(dt);
    const want = !H.tool ? '' : 'crosshair';
    if (controls.down == null && canvas.style.cursor !== want) canvas.style.cursor = want;
  };

  // ---------- the ring (planner brushRing) and the cursor read-out ----------
  let seenT = 0, seenAt = null;
  function ring(dt = 1 / 60) {
    const id = H.tool;
    // an aim held for a finger (no hover after it lifts) keeps its ring; so does the cave's ghost waiting to be turned
    if (id && !I.over && TOOL[id]?.kind === 'power' && H.aim.lock) { H.aim.ring(); return; }
    if (id && !I.over && TOOL[id]?.kind === 'cave' && H.cave.pin) { H.cave.ring(); return; }
    if (!id || (!I.over && !I.op)) { overlay.brush(null); H.cursor = null; return; }
    if (TOOL[id]?.kind === 'power') { H.aim.ring(); return; }
    const T = TOOL[id], op = I.op;
    if (T.kind === 'cave') { H.cave.ring(); return; }
    if (T.kind === 'path' || T.kind === 'animal') {
      overlay.brush(null);
      const g = I.g;
      H.cursor = usable(g) ? { x: g.x, z: g.z, top: g.top, size: 0, reason: H.why(g.cx, g.cz), seenBy: 0, tool: id } : null;
      return;
    }
    const g = I.g;
    if (!usable(g)) { overlay.brush(null); H.cursor = null; return; }
    const x = g.x, z = g.z;
    let r, color = 0xffffff;
    if (id === 'river' || id === 'lake') { r = (O().size ?? 4) / 2; color = 0x6fb6ff; }
    else { r = O().size ?? 3; color = T.family === 'erase' ? 0xff6b5a : 0xffffff; }
    const cx = Math.floor(x), cz = Math.floor(z);
    const reason = H.why(cx, cz);
    seenT -= dt;
    if (clock.phase === 'running' && H.sim()?.seenAt) {
      if (seenT <= 0 || !seenAt || Math.hypot(seenAt.x - x, seenAt.z - z) > 2) { seenT = 0.2; seenAt = { x, z, n: Number(H.simCall('seenAt', x, z, r, op?.id ?? id)) || 0 }; } // the act's kind: land is seen further than paint
    } else seenAt = null;
    const seenBy = seenAt?.n ?? 0;
    if (seenBy > 0) color = 0xf4d77a;
    if (reason) color = 0x8f8f8f;
    overlay.brush(x, z, r, color);
    H.cursor = { x, z, top: vox.groundTop(cx, cz), size: r, reason, seenBy, tool: op?.id ?? id, pending: P().has() };
  }
  return I;
}
