// Everything the planner draws over the world: selection and hover outlines,
// the faint marks of removed things, people's rounds, drag ghosts, zones,
// measurements, the grid and height contours, and the HTML labels.
// Ported from the source repo's dev/planner/overlay.js. Changed: labels go into
// a given layer element (was the planner's panel layout); the height contour
// colour scale is centred on this world's ground; label class names are
// `label` (was `pl-label`). Overlay lines are not touched by the edge mist.
import * as THREE from '../../vendor/three.module.js';
import { WORLD } from '../config.js';
import { BLOCK_DEFS } from '../world/blocks.js';
import { SX, SZ, X0, Z0, X1, Z1, blockColor } from '../edit/vox.js';
import { CAT, quarter } from '../edit/core.js';

const lineMat = (o = {}) => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, ...o });
const col = (hex) => new THREE.Color(hex);
const rot = (x, z, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, -x * s + z * c]; };

// `layer`: an absolutely positioned element over the canvas for HTML labels
export function makeOverlay(P, C, layer) {
  const G = P.G, scene = G.renderer.scene;
  const O = { group: new THREE.Group(), labels: [], dirty: true };
  O.group.renderOrder = 50;
  scene.add(O.group);

  // ---- outlines (one draw) ----
  const outGeo = new THREE.BufferGeometry();
  const outline = new THREE.LineSegments(outGeo, lineMat());
  outline.renderOrder = 60; outline.frustumCulled = false;
  O.group.add(outline);
  const pos = [], cols = [];
  const seg = (a, b, c) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); cols.push(c.r, c.g, c.b, c.r, c.g, c.b); };
  function rectOf(e, pad = 0.15) {
    const f = e.foot, dr = e.ry - e.ry0, a = (f.a ?? 0) + dr;
    const [ccx, ccz] = rot(f.cx, f.cz, dr);
    const hw = f.w / 2 + pad, hd = f.d / 2 + pad;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => { const [rx, rz] = rot(x, z, a); return [e.x + ccx + rx, e.z + ccz + rz]; });
  }
  O.rectOf = rectOf;
  function box(e, c, y, ticks = true) {
    if (e.outline) { e.outline(seg, c); return; } // a thing that draws its own outline (a path: its line)
    const r = rectOf(e);
    for (let i = 0; i < 4; i++) {
      const a = r[i], b = r[(i + 1) % 4];
      seg([a[0], y, a[1]], [b[0], y, b[1]], c);
      if (ticks) seg([a[0], y, a[1]], [a[0], y + Math.min(1.2, e.foot.h), a[1]], c);
    }
  }
  const WHITE = col(0xffffff), HOVER = col(0x7fe0ff), RED = col(0xff5a4a), ROUND = col(0x9fd4ff), DIM = col(0xb0b0b0);
  O.rebuildOutlines = () => {
    pos.length = 0; cols.length = 0;
    const sel = P.sel;
    for (const e of sel) {
      if (!P.alive(e)) continue;
      const gc = e.group && P.doc.groups[e.group] ? col(P.doc.groups[e.group].color) : WHITE;
      box(e, e.removed ? RED : (sel.size > 1 && e.group ? gc : WHITE), e.y + 0.08);
      if (e.round && sel.size <= 30) roundLines(e);
    }
    const h = P.hover;
    if (h && !sel.has(h) && P.alive(h)) box(h, h.removed ? RED : HOVER, h.y + 0.08);
    // removed things: a faint cross where they stood
    for (const e of P.list) {
      if (!e || !e.removed || e.deleted || P.filters[e.cat]?.hidden) continue;
      const r = rectOf(e, 0), y = e.y + 0.1;
      seg([r[0][0], y, r[0][1]], [r[2][0], y, r[2][1]], RED);
      seg([r[1][0], y, r[1][1]], [r[3][0], y, r[3][1]], RED);
      for (let i = 0; i < 4; i += 1) if (i % 2 === 0) { const a = r[i], b = r[(i + 1) % 4]; seg([a[0], y, a[1]], [b[0], y, b[1]], DIM); }
    }
    for (const e of extraBoxes) box(e.e, col(e.color), e.e.y + 0.08, false);
    outGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    outGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    outGeo.computeBoundingSphere();
  };
  let extraBoxes = [];
  O.setExtraBoxes = (list) => { extraBoxes = list; O.dirty = true; };
  function roundLines(e) {
    const dx = e.x - e.base.x, dz = e.z - e.base.z;
    const pts = e.round;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ya = P.V.standY(a.x + dx, a.z + dz) + 0.15, yb = P.V.standY(b.x + dx, b.z + dz) + 0.15;
      seg([a.x + dx, ya, a.z + dz], [b.x + dx, yb, b.z + dz], ROUND);
      if (a.stop) for (let k = 0; k < 8; k++) {
        const t0 = k / 8 * Math.PI * 2, t1 = (k + 1) / 8 * Math.PI * 2;
        seg([a.x + dx + Math.cos(t0) * 0.6, ya, a.z + dz + Math.sin(t0) * 0.6], [a.x + dx + Math.cos(t1) * 0.6, ya, a.z + dz + Math.sin(t1) * 0.6], ROUND);
      }
    }
  }

  // ---- free lines: measurements, drag read-outs, previews (one draw) ----
  const freeGeo = new THREE.BufferGeometry();
  const free = new THREE.LineSegments(freeGeo, lineMat());
  free.renderOrder = 61; free.frustumCulled = false;
  O.group.add(free);
  O.setLines = (list) => { // [{a:[x,y,z], b:[x,y,z], color}]
    const p = [], c = [];
    for (const l of list) { const cc = col(l.color ?? 0xffffff); p.push(...l.a, ...l.b); c.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b); }
    freeGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    freeGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    freeGeo.computeBoundingSphere();
  };
  O.setLines([]);

  // ---- a disc or ring under the brush ----
  const ringGeo = new THREE.BufferGeometry();
  const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, opacity: 0.9 }));
  ring.renderOrder = 62; ring.frustumCulled = false; ring.visible = false;
  O.group.add(ring);
  O.brush = (x, z, r, color = 0xffffff, square = false) => {
    if (r == null) { ring.visible = false; return; }
    const p = [], n = square ? 4 : 48;
    for (let i = 0; i < n; i++) {
      let px, pz;
      if (square) { const s = [[-1, -1], [1, -1], [1, 1], [-1, 1]][i]; px = x + s[0] * r; pz = z + s[1] * r; } else { const a = i / n * Math.PI * 2; px = x + Math.cos(a) * r; pz = z + Math.sin(a) * r; }
      p.push(px, P.V.standY(px, pz) + 0.12, pz);
    }
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    ring.material.color.setHex(color);
    ring.visible = true;
  };

  // ---- ghosts of block-built things while they are dragged or placed ----
  const ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  O.cellMesh = (cells, opacity = 0.62) => {
    const n = cells.length;
    const pa = unit.attributes.position.array, ia = unit.index.array;
    const P3 = new Float32Array(n * pa.length), Cc = new Float32Array(n * pa.length), I = new Uint32Array(n * ia.length);
    cells.forEach((c, k) => {
      const [r, g, b] = blockColor(c[3]).map((v) => v ** 2.2); // sRGB palette to the linear colours three shades with
      const o = k * pa.length;
      for (let v = 0; v < pa.length; v += 3) {
        P3[o + v] = pa[v] + c[0] + 0.5; P3[o + v + 1] = pa[v + 1] + c[1] + 0.5; P3[o + v + 2] = pa[v + 2] + c[2] + 0.5;
        const sh = v / 3 < 8 ? 0.85 : v / 3 < 16 ? 1 : 0.92;
        Cc[o + v] = r * sh; Cc[o + v + 1] = g * sh; Cc[o + v + 2] = b * sh;
      }
      for (let t = 0; t < ia.length; t++) I[k * ia.length + t] = ia[t] + k * (pa.length / 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P3, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    const m = new THREE.Mesh(geo, opacity === 1 ? new THREE.MeshBasicMaterial({ vertexColors: true }) : ghostMat);
    m.renderOrder = 40;
    return m;
  };
  // a ghost for an entity's blocks, positioned like the entity at (x, y, z, ry)
  O.ghostFor = (e) => {
    const g = new THREE.Group();
    const m = O.cellMesh(e.cells.filter((c) => c[3] !== 0 && !BLOCK_DEFS[c[3]]?.water));
    g.add(m);
    g.userData.e = e;
    O.group.add(g);
    return g;
  };
  O.placeGhost = (g, x, y, z, q) => {
    const e = g.userData.e;
    const m = g.children[0];
    // the template is about the origin cell; turning goes about the anchor
    g.position.set(x, Math.round(y) + (e.cellDy ?? 0), z);
    g.rotation.y = q * Math.PI / 2;
    m.position.set(-e.fx, 0, -e.fz);
  };
  O.drop = (g) => { O.group.remove(g); g.traverse((o) => { if (o.geometry && o.geometry !== unit) o.geometry.dispose(); }); };

  // ---- zones: a draped tint and an outline ----
  let zoneMesh = null, zoneLines = null;
  O.rebuildZones = () => {
    if (zoneMesh) { O.group.remove(zoneMesh); zoneMesh.geometry.dispose(); zoneMesh = null; }
    if (zoneLines) { O.group.remove(zoneLines); zoneLines.geometry.dispose(); zoneLines = null; }
    if (P.filters.zone.hidden) return;
    const p = [], c = [], lp = [], lc = [];
    const zones = [...P.doc.zones, ...(O.previewZone ? [O.previewZone] : [])];
    for (const zn of zones) {
      const cc = col(zn.color ?? '#9b8cff');
      const [x0, z0, x1, z1] = zoneBounds(zn);
      const sel = P.zoneSel === zn.id;
      for (let z = Math.max(Z0, Math.floor(z0)); z <= Math.min(Z1 - 1, Math.ceil(z1)); z++) for (let x = Math.max(X0, Math.floor(x0)); x <= Math.min(X1 - 1, Math.ceil(x1)); x++) {
        if (!inZone(zn, x + 0.5, z + 0.5)) continue;
        const y = P.V.groundTop(x, z) + 1.06;
        p.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x, y, z + 1);
        for (let k = 0; k < 6; k++) c.push(cc.r, cc.g, cc.b, sel ? 0.34 : 0.2);
      }
      const ring2 = zoneOutline(zn);
      for (let i = 0; i < ring2.length - (zn.shape === 'path' ? 1 : 0); i++) {
        const a = ring2[i], b = ring2[(i + 1) % ring2.length];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let k = 0; k < n; k++) {
          const ax = a[0] + (b[0] - a[0]) * k / n, az = a[1] + (b[1] - a[1]) * k / n, bx = a[0] + (b[0] - a[0]) * (k + 1) / n, bz = a[1] + (b[1] - a[1]) * (k + 1) / n;
          lp.push(ax, P.V.standY(ax, az) + 0.2, az, bx, P.V.standY(bx, bz) + 0.2, bz);
          lc.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
        }
      }
    }
    if (p.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 4));
      zoneMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      zoneMesh.renderOrder = 30; zoneMesh.frustumCulled = false;
      O.group.add(zoneMesh);
    }
    if (lp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
      zoneLines = new THREE.LineSegments(g, lineMat());
      zoneLines.renderOrder = 31; zoneLines.frustumCulled = false;
      O.group.add(zoneLines);
    }
  };

  // ---- the grid, draped on the ground ----
  let gridObj = null;
  O.gridOn = false;
  O.rebuildGrid = () => {
    if (gridObj) { O.group.remove(gridObj); gridObj.traverse((o) => o.geometry?.dispose()); gridObj = null; }
    if (!O.gridOn) return;
    const minor = [], major = [];
    const top = new Int16Array((SX + 1) * (SZ + 1));
    for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) top[x - X0 + (z - Z0) * SX] = P.V.groundTop(x, z) + 1;
    for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
      const y = top[x - X0 + (z - Z0) * SX] + 0.03;
      (((z % 10) + 10) % 10 === 0 ? major : minor).push(x, y, z, x + 1, y, z);
      (((x % 10) + 10) % 10 === 0 ? major : minor).push(x, y, z, x, y, z + 1);
    }
    gridObj = new THREE.Group();
    const mk = (arr, color, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); l.frustumCulled = false; l.renderOrder = 20; return l; };
    gridObj.add(mk(minor, 0xffffff, 0.16)); gridObj.add(mk(major, 0xfff0b0, 0.55));
    gridObj.children[0].userData.minor = true;
    O.group.add(gridObj);
  };
  O.gridZoom = () => { if (gridObj) gridObj.children[0].visible = C.ppm >= 5; };

  // ---- height contours: an edge wherever the ground steps ----
  let contour = null;
  O.contoursOn = false;
  O.rebuildContours = () => {
    if (contour) { O.group.remove(contour); contour.geometry.dispose(); contour = null; }
    if (!O.contoursOn) return;
    const p = [], c = [];
    const h = (x, z) => P.V.groundTop(x, z);
    const hc = (y) => { const t = Math.max(0, Math.min(1, (y - WORLD.GROUND_Y + 8) / 24)); return new THREE.Color().setHSL(0.62 - t * 0.62, 0.85, 0.6); };
    for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) {
      const a = h(x, z);
      if (x + 1 < X1) { const b = h(x + 1, z); if (a !== b) { const y = Math.max(a, b) + 1.04, cc = hc(Math.max(a, b)); p.push(x + 1, y, z, x + 1, y, z + 1); c.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b); } }
      if (z + 1 < Z1) { const b = h(x, z + 1); if (a !== b) { const y = Math.max(a, b) + 1.04, cc = hc(Math.max(a, b)); p.push(x, y, z + 1, x + 1, y, z + 1); c.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b); } }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    contour = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthWrite: false }));
    contour.frustumCulled = false; contour.renderOrder = 21;
    O.group.add(contour);
  };

  // ---- HTML labels, pooled ----
  // O.drawLabels([{ x, y, z, text, cls, color }]) each frame; extra classes in `cls`
  const pool = [];
  O.drawLabels = (list) => {
    let n = 0;
    const v = C.view;
    if (layer._v !== `${v.x},${v.y},${v.w},${v.h}`) { layer._v = `${v.x},${v.y},${v.w},${v.h}`; Object.assign(layer.style, { left: `${v.x}px`, top: `${v.y}px`, width: `${v.w}px`, height: `${v.h}px`, right: 'auto', bottom: 'auto' }); }
    for (const L of list) {
      const s = C.toScreen(L.x, L.y, L.z);
      if (s.x < v.x - 10 || s.x > v.x + v.w + 10 || s.y < v.y + 4 || s.y > v.y + v.h + 30) continue;
      s.x -= v.x; s.y -= v.y;
      let el = pool[n];
      if (!el) { el = document.createElement('div'); layer.appendChild(el); pool.push(el); }
      if (el._t !== L.text) { el.textContent = L.text; el._t = L.text; }
      const cls = `label ${L.cls ?? ''}`;
      if (el.className !== cls) el.className = cls;
      if (L.color) el.style.setProperty('--c', L.color); else el.style.removeProperty('--c');
      el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
      el.style.display = '';
      n++;
      if (n > 260) break;
    }
    for (let i = n; i < pool.length; i++) if (pool[i].style.display !== 'none') pool[i].style.display = 'none';
  };
  return O;
}

// ---------- zone geometry ----------
export function zoneBounds(zn) {
  if (zn.shape === 'circle') return [zn.x - zn.r, zn.z - zn.r, zn.x + zn.r, zn.z + zn.r];
  if (zn.shape === 'rect') return [Math.min(zn.x0, zn.x1), Math.min(zn.z0, zn.z1), Math.max(zn.x0, zn.x1), Math.max(zn.z0, zn.z1)];
  const xs = zn.pts.map((p) => p[0]), zs = zn.pts.map((p) => p[1]), w = zn.shape === 'path' ? (zn.width ?? 3) / 2 : 0;
  return [Math.min(...xs) - w, Math.min(...zs) - w, Math.max(...xs) + w, Math.max(...zs) + w];
}
export function inZone(zn, x, z) {
  if (zn.shape === 'circle') return Math.hypot(x - zn.x, z - zn.z) <= zn.r;
  if (zn.shape === 'rect') { const [x0, z0, x1, z1] = zoneBounds(zn); return x >= x0 && x <= x1 && z >= z0 && z <= z1; }
  if (zn.shape === 'path') {
    const w = (zn.width ?? 3) / 2;
    for (let i = 0; i < zn.pts.length - 1; i++) if (distSeg(x, z, zn.pts[i], zn.pts[i + 1]) <= w) return true;
    return false;
  }
  let inside = false;
  const p = zn.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  }
  return inside;
}
export function zoneOutline(zn) {
  if (zn.shape === 'circle') return Array.from({ length: 40 }, (_, i) => [zn.x + Math.cos(i / 40 * Math.PI * 2) * zn.r, zn.z + Math.sin(i / 40 * Math.PI * 2) * zn.r]);
  if (zn.shape === 'rect') { const [x0, z0, x1, z1] = zoneBounds(zn); return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
  return zn.pts;
}
export function zoneCentre(zn) {
  const [x0, z0, x1, z1] = zoneBounds(zn);
  if (zn.shape === 'path') return zn.pts[Math.floor(zn.pts.length / 2)];
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}
export function distSeg(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
export { CAT, quarter };
