// Clans on the map, drawn from the HUD's side so it needs nothing from the
// simulation's bodies (the family dye already colours their clothes; a clan can
// span families once C merges them, so the HUD marks it itself):
//   markers   a flat ring on the ground under each person in their clan's colour,
//             the ring's shape from the clan's mark (solid, dashed, double, notched),
//             so colour is never the only sign. One InstancedMesh per shape, owned
//             here. Shown by the overlay toggle (Tablet, Clans), while a clan power
//             is armed, and for both sides of an open fight.
//   favourite a thin gold ring under every member of the clan you favour, always
//   name tag  hovering a person (nothing armed) shows a tag over their head: name,
//             clan colour and mark
//   villages  at far zoom, each village's name on the map (C's village, else each
//             settled family's home); a click glides there and inspects the clan
import { h, esc, markSvg, MARK_IDS } from './dom.js';

const CAP = 800;            // people with a marker at most
const FAR_PPM = 4.6;        // below this zoom (pixels a metre) the village names show (the whole world at 1920 is 3.8; the opening view 6)
const SHAPES = 4;           // ring shapes: solid, dashed, double, notched

export default [{
  type: 'panel', id: 'clanmap', region: 'world', order: 50,
  make(U) {
    const { ctx } = U;
    const THREE = ctx.THREE;
    const layer = h('div', 'clanmap');
    let shown = false;
    try { shown = localStorage.getItem('godgame.clans') === '1'; } catch { /* private */ }

    // ---------- the rings ----------
    const meshes = [];
    const fav = { mesh: null };
    if (THREE && ctx.scene) {
      const flat = (g) => { g.rotateX(-Math.PI / 2); return g; };
      const ring = (a, b, s = 0, len = Math.PI * 2) => new THREE.RingGeometry(a, b, 28, 1, s, len);
      const merge = (list) => {
        // a few ring pieces as one geometry (no BufferGeometryUtils in the vendored build)
        const pos = [], idx = [];
        for (const g of list) {
          const base = pos.length / 3;
          const p = g.getAttribute('position').array;
          for (let i = 0; i < p.length; i++) pos.push(p[i]);
          const ix = g.getIndex().array;
          for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        out.setIndex(idx);
        return out;
      };
      const dashes = (n, a, b) => merge(Array.from({ length: n }, (_, i) => ring(a, b, (i / n) * Math.PI * 2, (Math.PI * 2 / n) * 0.62)));
      const geos = [
        ring(0.46, 0.66),
        dashes(6, 0.44, 0.68),
        merge([ring(0.34, 0.44), ring(0.58, 0.68)]),
        merge([ring(0.46, 0.66), ...Array.from({ length: 3 }, (_, i) => ring(0.66, 0.86, (i / 3) * Math.PI * 2, 0.35))]),
      ].map(flat);
      for (const g of geos) {
        const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const mesh = new THREE.InstancedMesh(g, m, CAP);
        mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'hud-clan-rings';
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
        ctx.scene.add(mesh);
        meshes.push(mesh);
      }
      const fg = flat(ring(0.74, 0.84));
      fav.mesh = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), CAP);
      fav.mesh.count = 0; fav.mesh.frustumCulled = false; fav.mesh.renderOrder = 3; fav.mesh.name = 'hud-favour-rings';
      ctx.scene.add(fav.mesh);
    }
    const M = THREE ? new THREE.Matrix4() : null, C = THREE ? new THREE.Color() : null;
    const shapeOf = (mark) => Math.max(0, MARK_IDS.indexOf(mark)) % SHAPES;

    // which clans to mark now: all (toggle, or a clan power armed), or only the sides of open fights
    function wanted() {
      const tool = U.get('god', 'tool');
      const t = tool ? (U.get('god', 'tools') ?? []).find((x) => x.id === tool) : null;
      const kinds = [].concat(t?.power?.target ?? []);
      if (shown || kinds.includes('clan') || t?.power?.group === 'war') return { all: true };
      const ids = new Set();
      for (const f of U.s2.fights()) { if (f.A) ids.add(f.A.id); if (f.B) ids.add(f.B.id); }
      return ids.size ? { ids } : null;
    }
    let clanOf = new Map(), clanT = 0;
    function refreshClans() {
      clanOf = new Map();
      for (const c of U.s2.clans()) for (const m of c.members) clanOf.set(m, c);
    }
    function drawRings(dt) {
      if (!meshes.length) return;
      clanT -= dt;
      if (clanT <= 0) { clanT = 0.25; refreshClans(); }
      const want = ctx.clock.phase === 'running' ? wanted() : null;
      const n = new Array(SHAPES).fill(0);
      let nf = 0;
      const people = U.get('sim', 'people') ?? [];
      for (const p of people) {
        if (p.dead || p.hidden || !Number.isFinite(p.x)) continue;
        const c = clanOf.get(p);
        if (!c) continue;
        const y = (p.y ?? 16) + 0.06;
        if (c.favoured && nf < CAP) { M.makeTranslation(p.x, y + 0.01, p.z); fav.mesh.setMatrixAt(nf++, M); }
        if (!want || (!want.all && !want.ids.has(c.id))) continue;
        const s = shapeOf(c.mark);
        if (n[s] >= CAP) continue;
        M.makeTranslation(p.x, y, p.z);
        meshes[s].setMatrixAt(n[s], M);
        C.set(c.dye);
        meshes[s].setColorAt(n[s], C);
        n[s]++;
      }
      meshes.forEach((m, i) => { m.count = n[i]; m.visible = n[i] > 0; if (n[i]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } });
      fav.mesh.count = nf; fav.mesh.visible = nf > 0; if (nf) fav.mesh.instanceMatrix.needsUpdate = true;
    }

    // ---------- the hover name tag ----------
    const tag = h('div', 'ntag');
    tag.hidden = true;
    layer.appendChild(tag);
    let tagFor = null;
    function drawTag() {
      const p = U.inspect?.hovered;
      const person = p && p.kind === 'person' && !p.dead && !U.get('god', 'tool') ? p : null;
      if (!person) { if (!tag.hidden) tag.hidden = true; tagFor = null; return; }
      if (tagFor !== person) {
        tagFor = person;
        const c = clanOf.get(person) ?? U.s2.clanOf(person);
        const hp = U.s2.health(person);
        tag.style.setProperty('--dye', c?.dye ?? 'transparent');
        tag.innerHTML = `${c ? `<i class="cc-sw"></i>${markSvg(c.mark, 14)}` : ''}<span class="nt-n">${esc(person.name)}</span>${c ? `<span class="nt-c">of the ${esc(c.name)}</span>` : ''}${hp.sick ? '<span class="nt-s">sick</span>' : ''}${hp.wounded ? '<span class="nt-s">wounded</span>' : ''}`;
      }
      const s = ctx.camera.toScreen(person.x, (person.y ?? 16) + 2.3, person.z);
      if (s.behind) { tag.hidden = true; return; }
      tag.hidden = false;
      tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    }

    // ---------- village names at far zoom ----------
    const vbox = h('div', 'vlabels');
    layer.appendChild(vbox);
    const labels = new Map();
    let vT = 0, villages = [];
    function collectVillages() {
      const out = [];
      for (const c of U.s2.clans()) {
        const v = c.village;
        if (!v || !Number.isFinite(v.x)) continue;
        // without named villages (no clans subsystem), families close together share one label
        const near = !v.name ? out.find((o) => !o.named && Math.hypot(o.x - v.x, o.z - v.z) < 18) : null;
        if (near) { near.clans.push(c); continue; }
        out.push({ key: c.id, name: v.name, named: !!v.name, x: v.x, z: v.z, clans: [c] });
      }
      return out;
    }
    function drawVillages(dt) {
      const far = ctx.clock.phase === 'running' && ctx.camera.ppm < FAR_PPM;
      vbox.hidden = !far;
      if (!far) return;
      vT -= dt;
      if (vT <= 0) { vT = 0.5; villages = collectVillages(); }
      const live = new Set();
      for (const v of villages) {
        live.add(v.key);
        let el = labels.get(v.key);
        const text = v.name ?? (v.clans.length === 1 ? `the ${v.clans[0].name}` : `the ${v.clans[0].name} and ${v.clans.length - 1 === 1 ? `the ${v.clans[1].name}` : `${v.clans.length - 1} more`}`);
        const sig = `${text}|${v.clans.map((c) => c.dye + c.mark).join()}`;
        if (!el) {
          el = h('button', 'vlabel');
          el.type = 'button';
          el.addEventListener('click', () => { const vv = villages.find((x) => x.key === el.dataset.key); if (!vv) return; U.glide(vv.x, vv.z); U.inspect?.showClan?.(vv.clans[0]); });
          vbox.appendChild(el); labels.set(v.key, el);
        }
        el.dataset.key = v.key;
        if (el.dataset.sig !== sig) {
          el.dataset.sig = sig;
          el.innerHTML = `${v.clans.slice(0, 3).map((c) => `<span class="vl-c" style="--dye:${esc(c.dye)}"><i class="cc-sw"></i>${markSvg(c.mark, 12)}</span>`).join('')}<span class="vl-n">${esc(text)}</span>`;
          el.setAttribute('aria-label', `${text}: look there`);
        }
        let y = 16;
        try { y = ctx.vox.standY(Math.floor(v.x), Math.floor(v.z)) + 4; } catch { /* no world */ }
        const s = ctx.camera.toScreen(v.x, y, v.z);
        const off = s.behind || s.x < -80 || s.y < -40 || s.x > innerWidth + 80 || s.y > innerHeight + 40;
        el.hidden = off;
        if (!off) el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
      }
      for (const [k, el] of labels) if (!live.has(k)) { el.remove(); labels.delete(k); }
    }

    U.frame.push((dt) => { drawRings(dt); drawTag(); drawVillages(dt); });
    U.clanmap = {
      get shown() { return shown; },
      setShown(v) { shown = !!v; try { localStorage.setItem('godgame.clans', shown ? '1' : '0'); } catch { /* private */ } },
    };
    return layer;
  },
}];
