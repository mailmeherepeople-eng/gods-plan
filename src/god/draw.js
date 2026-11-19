// What the hands draw over the world while working: line sets (each tool its
// own, so none fights another or the shared overlay.setLines) and small text
// tags over a point (each its own element, so overlay.drawLabels stays the
// HUD's). Lines draw over everything, like the planner's overlay lines.
export function makeDraw(ctx) {
  const { THREE, overlay, camera } = ctx;
  const D = {};
  D.lines = (order = 63) => {
    const geo = new THREE.BufferGeometry();
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false }));
    obj.renderOrder = order; obj.frustumCulled = false;
    overlay.group.add(obj);
    const pos = [], col = [];
    const c = new THREE.Color();
    const L = {
      // start a fresh set
      begin() { pos.length = 0; col.length = 0; return L; },
      seg(a, b, color = 0xffffff) { c.setHex(color); pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); col.push(c.r, c.g, c.b, c.r, c.g, c.b); return L; },
      end() {
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeBoundingSphere();
        return L;
      },
      clear() { if (pos.length || !geo.attributes.position) { L.begin(); L.end(); } },
      get empty() { return pos.length === 0; },
    };
    L.clear();
    return L;
  };
  // a tag: a few words over a point of the world, kept in place every frame
  const tags = [];
  D.tag = () => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '5', display: 'none',
      font: '600 12px/1.2 system-ui, sans-serif', color: '#1f1a12', background: 'rgba(255, 246, 214, 0.92)',
      padding: '3px 7px', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
    });
    el.className = 'god-tag';
    document.body.appendChild(el);
    const t = { el, at: null };
    t.show = (x, y, z, text) => { t.at = [x, y, z]; if (el.textContent !== text) el.textContent = text; el.style.display = ''; place(t); };
    t.hide = () => { t.at = null; el.style.display = 'none'; };
    tags.push(t);
    return t;
  };
  function place(t) {
    if (!t.at) return;
    const s = camera.toScreen(t.at[0], t.at[1], t.at[2]);
    t.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -120%)`;
  }
  D.update = () => { for (const t of tags) place(t); };
  return D;
}
