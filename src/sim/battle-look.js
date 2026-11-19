// Battles (stage 3): what a battle looks like on the battleground, beyond the ground itself (battle-ground.js).
// Your fighters are the very people from home: their own figures (bodies.js) are lent to the battleground's
// scene group for the battle and handed back after. The raiders and wolves are figures of its own. A ring on
// the ground under every fighter says whose side they are on at a glance (pale yours, red theirs, gold or black
// a champion); a family's banner stands over it; the enemy god's wind-up is a ring that fills; fire burns cell
// by cell, rain falls, earth rises in dust, stones fly from slings, a landing power flashes its true size.
// Words and names are the screen's (ui/battle.js). Instanced draws with fixed caps, made once.
import * as THREE from '../../vendor/three.module.js';
import { makePerson, lookFor, setWeapon, applyPose, makeAnimal } from './bodies.js';
import { makeFightLook } from './fights-look.js';
import { turn } from './move.js';
import { PM } from './battle-tune.js';

const LAVA = 120, DISCS = 140, FLAMES = 320, DROPS = 260, FLASH = 10, TELLS = 4, STONES = 40, CELLS = 40;
const THEIR_DYE = 0x9b2d20, THEIR_BAND = 0x2a2118;
const RING_MINE = 0xf4ecd8, RING_THEIRS = 0xd0402a, RING_MY_CHAMP = 0xf2c14e, RING_THEIR_CHAMP = 0x2a1a14;
const METAL = ['stone', 'copper', 'bronze', 'iron'];

export function makeBattleLook(ctx, G) {
  const layer = G.things;
  const groundY = (x, z) => G.standY(x, z);
  const fl = makeFightLook({ layers: { entities: layer }, vox: { standY: (x, z) => G.standY(x, z) }, world: null });
  const _tmpC = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
  const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const inst = (geo, mat, cap) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; m.userData.noPick = true; m.renderOrder = 2; layer.add(m); return m; };
  const basic = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...o });
  const discs = inst(new THREE.RingGeometry(0.42, 0.62, 20), basic({ opacity: 0.95, side: THREE.DoubleSide }), DISCS);
  discs.setColorAt(0, _c.setHex(0xffffff));
  const FG = new THREE.BoxGeometry(0.7, 0.8, 0.7); FG.translate(0, 0.4, 0);
  const flames = inst(FG, new THREE.MeshBasicMaterial({ color: 0xffffff }), FLAMES);
  flames.setColorAt(0, _c.setHex(0xff8a2a));
  const lavaM = inst(new THREE.BoxGeometry(1, 0.12, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), LAVA);
  lavaM.setColorAt(0, _c.setHex(0xff5a1a)); lavaM.userData.glow = 'flame';
  // the warning: dark crust over a glow, so the seams between the plates read as glowing cracks
  const crustM = inst(new THREE.BoxGeometry(0.72, 0.1, 0.72), new THREE.MeshBasicMaterial({ color: 0x2a1a14 }), LAVA);
  const drops = inst(new THREE.BoxGeometry(0.13, 1.1, 0.13), basic({ color: 0xdff0ff, opacity: 0.9 }), DROPS);
  const wetDisc = inst(new THREE.CircleGeometry(1, 28), basic({ color: 0x2a6fb0, opacity: 0.5, side: THREE.DoubleSide }), 8);
  const tellRing = inst(new THREE.RingGeometry(0.93, 1, 48), basic({ opacity: 0.95, side: THREE.DoubleSide }), TELLS + 2);
  tellRing.setColorAt(0, _c.setHex(0xffffff));
  const tellFill = inst(new THREE.CircleGeometry(1, 48), basic({ opacity: 0.28, side: THREE.DoubleSide }), TELLS + 2);
  tellFill.setColorAt(0, _c.setHex(0xffffff));
  const flash = inst(new THREE.RingGeometry(0.86, 1, 48), basic({ opacity: 0.8, side: THREE.DoubleSide }), FLASH);
  flash.setColorAt(0, _c.setHex(0xffffff));
  const stones = inst(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0x4a443c }), STONES);
  const cellsM = inst(new THREE.BoxGeometry(0.96, 0.5, 0.96), basic({ color: 0xffffff, opacity: 0.4 }), CELLS * 2);
  cellsM.setColorAt(0, _c.setHex(0xffffff));
  // spells seen: patches on the ground (heal green, boost gold), marks where a strike fell, markers where beasts
  // were sent, drain lines (boost), each in its god's tint (theirs leans violet)
  // a patch is painted on the ground in a strong colour. (Light added to pale grass washed out to near white on
  // the phone: the green could not be told from a flash. Checked 2026-11-15 at 822 x 311.)
  const patchM = inst(new THREE.CircleGeometry(1, 40), basic({ color: 0xffffff, opacity: 0.6, side: THREE.DoubleSide }), 12);
  patchM.setColorAt(0, _c.setHex(0xffffff));
  const patchEdge = inst(new THREE.RingGeometry(0.8, 1, 48), basic({ color: 0xffffff, opacity: 0.9, side: THREE.DoubleSide }), 24);
  patchEdge.setColorAt(0, _c.setHex(0xffffff));
  const markM = inst(new THREE.CircleGeometry(1, 20), basic({ color: 0x241c16, opacity: 0.55, side: THREE.DoubleSide }), 24);
  const LINEG = new THREE.BoxGeometry(1, 0.08, 0.08); LINEG.translate(0.5, 0, 0);
  const lineM = inst(LINEG, new THREE.MeshBasicMaterial({ color: 0xffffff }), 24);
  lineM.setColorAt(0, _c.setHex(0xffffff));
  const cloudM = inst(new THREE.CircleGeometry(1, 28), basic({ color: 0x1e2a33, opacity: 0.2, side: THREE.DoubleSide }), 8);
  const TINT = 0xa040d0;
  const tint = (col, side) => (side === 1 ? _c.setHex(col).lerp(new THREE.Color(TINT), 0.55).getHex() : col);
  const PATCH_COL = { 'heal-area': 0x12c040, 'boost-area': 0xf08a00, 'heal-small': 0x12c040, wolves: 0x7ec850, gorilla: 0xd8b070 };
  const EDGE_COL = { 'heal-area': 0x0a7a26, 'boost-area': 0xa85a00, 'heal-small': 0x0a7a26, wolves: 0xf4ffe0, gorilla: 0xfff0d0 };
  const boltM = new THREE.Mesh(new THREE.BoxGeometry(0.35, 14, 0.35), basic({ color: 0xfff1b0, opacity: 0.95 }));
  boltM.visible = false; boltM.userData.noPick = true; layer.add(boltM);
  let boltT = 0;
  const flashes = [];
  const figs = new Set();
  const banners = new Map();
  const dropsS = { x: new Float32Array(DROPS), y: new Float32Array(DROPS), z: new Float32Array(DROPS), n: 0 };
  let aim = null; // { x, z, r, ok, cells? }

  function addRaider(u) {
    const l = lookFor(Math.random, THEIR_DYE, { sex: Math.random() < 0.7 ? 'm' : 'f' });
    l.band = THEIR_BAND; l.dress = 'kilt';
    const F = makePerson(l);
    F.group.position.set(u.e.x, u.e.y, u.e.z);
    if (u.kind === 'champ') F.group.scale.setScalar(1.18);
    layer.add(F.group);
    u.F = F;
    u.thrust = u.id % 3 === 0 && u.kind !== 'sling';
    setWeapon(F, u.kind === 'sling' ? 'sack' : u.thrust ? 'spear' : u.kind === 'champ' ? 'axe' : 'club', METAL[u.tier] ?? 'stone');
    figs.add(u);
  }
  // your own: the person's own figure, lent to the battleground for the battle
  function addMine(u) {
    const p = u.p, F = p?.F;
    if (!F) return;
    u.F = F;
    layer.add(F.group);
    F.group.visible = true;
    if (F.far) { F.far.visible = false; F.fig.visible = true; }
    F.fig.rotation.set(0, 0, 0); F.fig.position.set(0, 0, 0); F.fig.scale.set(1, 1, 1);
    u.thrust = (p.seed ?? 0) % 3 === 0 && u.kind !== 'sling';
    const metal = METAL[u.tier] ?? 'stone';
    setWeapon(F, u.kind === 'sling' ? 'sack' : u.thrust ? 'spear' : metal === 'stone' ? 'club' : 'axe', metal, u.blessedHome ?? false);
    figs.add(u);
  }
  // one great beast: a hulking dark figure (a person's body, made broad and furred), fists for weapons
  function addBeast(u) {
    const l = lookFor(Math.random, u.owner === 0 ? 0x3a3330 : 0x2a1a14, { sex: 'm' });
    l.skin = 0x2e2622; l.hairC = 0x1a1410; l.hair = 'short'; l.beard = true; l.band = 0; l.dress = 'kilt';
    const F = makePerson(l);
    F.group.scale.set(2.0, 1.9, 2.0);
    F.group.position.set(u.e.x, u.e.y, u.e.z);
    layer.add(F.group);
    u.F = F; u.beast = true; u.pose = 'brace'; u.poseT = 0;
    figs.add(u);
  }
  // brought back: the figure stands again
  function revive(u) { u.deadT = 0; if (u.F) { u.F.fig.rotation.set(0, 0, 0); u.F.fig.position.set(0, 0, 0); u.F.group.visible = true; } ring(u.e.x, u.e.z, 2.2, 0xfff1b0, 0.8); }
  function addWolf(u) {
    const F = makeAnimal('wolf');
    F.group.position.set(u.e.x, u.e.y, u.e.z);
    layer.add(F.group);
    u.F = F; u.wolf = true;
    figs.add(u);
  }
  function gone(u) { if (u.F && !u.p) u.goneT = 0.6; }
  function bless(u, on) {
    const F = u.F;
    if (!F || u.wolf || !F.weaponKey) return;
    const [kind, m] = F.weaponKey.split(':');
    setWeapon(F, kind, m, on);
  }
  function spark(a, b) { if (Math.random() < 0.55) fl.spark((a.e.x + b.e.x) / 2, (b.e.y ?? 16) + 1.4, (a.e.z + b.e.z) / 2, 4); }
  function ring(x, z, r, col, dur = 0.7) { flashes.push({ x, z, r, t: 0, dur, col }); if (flashes.length > FLASH) flashes.shift(); }
  function puff(x, z, n = 6, col = 0xcdb68a) { for (let k = 0; k < n; k++) fl.puff(x + (Math.random() - 0.5) * 1.6, groundY(x, z), z + (Math.random() - 0.5) * 1.6, 0.6, col, 1.2, 1.4, 1); }
  // earth on the move: dust over each cell (brown for earth, grey-blue for a pond)
  function dust(cells, kind, start) {
    const col = kind === 'pond' ? 0xa9b8c0 : 0xb89a6a;
    cells.forEach((c, i) => { if (start ? i % 2 === 0 : true) fl.puff(c.x + 0.5, groundY(c.x + 0.5, c.z + 0.5), c.z + 0.5, start ? 0.5 : 0.8, col, 1.4, 0.8, start ? 0.8 : 1.2); });
  }
  function bolt(x, y, z) { boltM.position.set(x, y + 7, z); boltM.visible = true; boltT = 0.28; ring(x, z, 2.5, 0xfff1b0, 0.5); }
  function setBanner(k, dye, on, x, z, fall) {
    let b = banners.get(k);
    if (!b) { b = fl.banner(dye); banners.set(k, b); }
    b.on = on; b.x = x + 0.6; b.z = z; b.y = groundY(x + 0.6, z); b.fall = fall ? Math.min(1, b.fall + 0.05) : Math.max(0, b.fall - 0.05);
  }
  function setAim(a) { aim = a; }

  function animate(u, dt) {
    const F = u.F, g = F.group, e = u.e;
    if (u.goneT != null) { u.goneT -= dt; g.position.y -= dt * 1.5; if (u.goneT <= 0) { g.removeFromParent(); figs.delete(u); } return; }
    if (u.state !== 'dead') { e.ry = e.ry ?? 0; turn(e, dt, u.wolf ? 12 : 9); }
    g.position.set(e.x, e.y, e.z);
    g.rotation.y = e.ry;
    if (u.beast) u.poseT = (u.poseT ?? 0) + dt;
    if (u.wolf) { u.ph = (u.ph ?? 0) + dt * (u.moving ? 15 : 0); for (const l of F.legs) l.rotation.x = u.moving ? Math.sin(u.ph + l._ph) * 0.8 : l.rotation.x * 0.8; return; }
    const fig = F.fig;
    if (u.state === 'dead') { u.deadT = (u.deadT ?? 0) + dt; const k = Math.min(1, u.deadT / 0.45); fig.rotation.z = k * Math.PI / 2; fig.position.y = k * 0.25; fig.rotation.x = 0; return; }
    if (u.state === 'gone') { g.visible = false; return; }
    let lean = 0, figY = 0;
    if (u.moving) {
      u.walkPh = (u.walkPh ?? 0) + dt * (u.state === 'wounded' ? 1.4 : 2.6) * 3.8;
      const sw = Math.sin(u.walkPh) * 0.6;
      F.legL.rotation.x = sw; F.legR.rotation.x = -sw;
      F.armL.rotation.x = -sw * 0.55; F.armR.rotation.x = u.state === 'flee' ? 0.3 : -0.9 + sw * 0.25;
      F.armL.rotation.z = F.armR.rotation.z = 0;
      figY = Math.abs(Math.sin(u.walkPh)) * 0.06; lean = u.state === 'wounded' ? -0.2 : 0.1;
    } else { const r = applyPose(F, u.pose ?? 'brace', u.poseT ?? 0); lean = r.lean; figY = r.figY; }
    fig.position.y = figY; fig.rotation.x = lean; fig.rotation.z = 0;
  }
  function frame(field, dt) {
    for (const u of [...figs]) animate(u, dt);
    if (boltT > 0) { boltT -= dt; boltM.material.opacity = Math.max(0, boltT / 0.28); if (boltT <= 0) boltM.visible = false; }
    if (!field) { for (const m of [crustM, patchM, patchEdge, markM, lineM, cloudM, lavaM, discs, flames, drops, wetDisc, tellRing, tellFill, flash, stones, cellsM]) m.count = 0; fl.tick(dt); return; }
    let n = 0;
    for (const u of field.units) {
      if (n >= DISCS || u.kind === 'wolf' || (u.state !== 'fight' && u.state !== 'flee')) continue;
      const e = u.e, champ = u.kind === 'champ' || u.kind === 'beast', s = u.kind === 'beast' ? 2 : champ ? 1.45 : 1;
      _p.set(e.x, (e.groundY ?? e.y) + 0.07, e.z); _s.set(s, s, s);
      discs.setMatrixAt(n, _m.compose(_p, flatQ, _s));
      const mine = u.side === 0 || (u.side === 2 && u.owner === 0);
      discs.setColorAt(n, _c.setHex(u.boost > 0 ? (mine ? 0xffc23a : tint(0xffc23a, 1)) : mine ? (champ ? RING_MY_CHAMP : RING_MINE) : (champ ? RING_THEIR_CHAMP : RING_THEIRS)));
      n++;
    }
    discs.count = n; discs.instanceMatrix.needsUpdate = true; if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
    const t = performance.now() / 1000;
    let f = 0;
    for (let i = 0; i < field.burn.length && f < FLAMES; i++) {
      if (field.burn[i] <= 0) continue;
      const x = field.cellX(i), z = field.cellZ(i), k = Math.min(1, field.burn[i] / 2) * (0.75 + 0.25 * Math.sin(t * 11 + i));
      _p.set(x, groundY(x, z), z); _s.set(1, 0.4 + k, 1); _q.setFromEuler(_e.set(0, i * 0.7, 0));
      flames.setMatrixAt(f, _m.compose(_p, _q, _s)); flames.setColorAt(f, _c.setHex((i + Math.floor(t * 8)) % 3 ? 0xff7a1e : 0xffc23a)); f++;
      if (Math.random() < dt * 0.6) fl.puff(x, groundY(x, z) + 1.2, z, 0.5, 0x6b6560, 1.6, 2.2, 1.6);
    }
    for (const u of field.units) {
      if (!(u.burning > 0) || f >= FLAMES || (u.state !== 'fight' && u.state !== 'flee')) continue;
      _p.set(u.e.x, (u.e.y ?? 16) + 0.6, u.e.z); const k = 0.8 + 0.3 * Math.sin(t * 13 + u.id); _s.set(1.1, k * 2.4, 1.1); _q.setFromEuler(_e.set(0, u.id, 0));
      flames.setMatrixAt(f, _m.compose(_p, _q, _s)); flames.setColorAt(f, _c.setHex((u.id + Math.floor(t * 9)) % 2 ? 0xff7a1e : 0xffd040)); f++;
      if (Math.random() < dt * 8) fl.puff(u.e.x, (u.e.y ?? 16) + 2.6, u.e.z, 0.55, 0x4a4540, 1.8, 0.5, 1.2);
    }
    flames.count = f; flames.instanceMatrix.needsUpdate = true; if (flames.instanceColor) flames.instanceColor.needsUpdate = true;
    // patches, marks, markers, drain lines
    let pn = 0, en = 0, mn = 0, ln = 0;
    for (const e of field.effects) {
      const col = tint(PATCH_COL[e.power] ?? 0xffffff, e.side), edge = tint(EDGE_COL[e.power] ?? 0xffffff, e.side), gy = groundY(e.x, e.z) + 0.2, k = e.t / e.dur;
      if (e.kind === 'patch' && pn < 12) {
        const fade = Math.min(1, (e.dur - e.t) / 0.6, e.t / 0.15);
        _p.set(e.x, gy, e.z); _s.set(e.r, e.r, e.r);
        patchM.setMatrixAt(pn, _m.compose(_p, flatQ, _s)); patchM.setColorAt(pn, _c.setHex(col).multiplyScalar(0.6 + 0.4 * fade)); pn++;
        if (en < 24) { const rr = e.r * (1 + 0.04 * Math.sin(t * 6)); _s.set(rr, rr, rr); patchEdge.setMatrixAt(en, _m.compose(_p, flatQ, _s)); patchEdge.setColorAt(en, _c.setHex(edge)); en++; }
        if (Math.random() < dt * 26) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * e.r; fl.puff(e.x + Math.cos(a) * d, gy, e.z + Math.sin(a) * d, 0.42, col, 1.8, 0.2, 1.3); }
      } else if ((e.kind === 'pulse' || e.kind === 'glow') && e.u) {
        if (en < 24) { const rr = (e.kind === 'pulse' ? 0.4 + 1.1 * k : 0.7) * (e.r ?? 1); _p.set(e.u.e.x, (e.u.e.groundY ?? e.u.e.y) + 0.15, e.u.e.z); _s.set(rr, rr, rr); patchEdge.setMatrixAt(en, _m.compose(_p, flatQ, _s)); patchEdge.setColorAt(en, _c.setHex(edge)); en++; }
        if (Math.random() < dt * (e.kind === 'pulse' ? 22 : 10)) fl.puff(e.u.e.x + (Math.random() - 0.5) * 0.6, (e.u.e.y ?? 16) + 0.6 + Math.random(), e.u.e.z + (Math.random() - 0.5) * 0.6, 0.25, col, 1.8, 0.2, 0.9);
      } else if (e.kind === 'mark' && mn < 24) {
        const rr = e.r * (k < 0.05 ? k / 0.05 : 1); _p.set(e.x, gy - 0.02, e.z); _s.set(rr, rr, rr);
        markM.setMatrixAt(mn++, _m.compose(_p, flatQ, _s));
      } else if (e.kind === 'goal' && en < 24) {
        const rr = e.r * (0.85 + 0.15 * Math.sin(t * 7)); _p.set(e.x, gy, e.z); _s.set(rr, rr, rr);
        patchEdge.setMatrixAt(en, _m.compose(_p, flatQ, _s)); patchEdge.setColorAt(en, _c.setHex(edge)); en++;
      }
    }
    for (const u of field.units) { // whoever is alight: an orange ring at their feet as well as the flames
      if (en >= 24 || !(u.burning > 0) || (u.state !== 'fight' && u.state !== 'flee')) continue;
      const rr = 0.9 + 0.15 * Math.sin(t * 10 + u.id); _p.set(u.e.x, (u.e.groundY ?? u.e.y) + 0.16, u.e.z); _s.set(rr, rr, rr);
      patchEdge.setMatrixAt(en, _m.compose(_p, flatQ, _s)); patchEdge.setColorAt(en, _c.setHex(0xff6a10)); en++;
    }
    for (const l of field.lines) {
      if (ln >= 24) break;
      const dx = l.x1 - l.x0, dz = l.z1 - l.z0, len = Math.hypot(dx, dz) || 0.01, y = groundY(l.x0, l.z0) + 1.2;
      _p.set(l.x0, y, l.z0); _q.setFromEuler(_e.set(0, -Math.atan2(dz, dx), 0)); _s.set(len, 1.5, 1.5);
      lineM.setMatrixAt(ln, _m.compose(_p, _q, _s)); lineM.setColorAt(ln, _c.setHex(tint(0xff5030, l.side))); ln++;
    }
    patchM.count = pn; patchEdge.count = en; markM.count = mn; lineM.count = ln;
    for (const m of [patchM, patchEdge, markM, lineM]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // lava: the warning glows and pulses dark red, then it runs bright
    let lv = 0, kn = 0;
    for (let i = 0; i < field.lavaW.length && lv < LAVA; i++) {
      const w = field.lavaW[i], r = field.lavaR[i];
      if (!(w > 0) && !(r > 0)) continue;
      const x = field.cellX(i), z = field.cellZ(i);
      _p.set(x, groundY(x, z) + 0.04, z); _s.set(1, w > 0 ? 0.5 : 1 + 0.4 * Math.sin(t * 6 + i), 1);
      lavaM.setMatrixAt(lv, _m.compose(_p, _q.identity(), _s));
      const glow = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.7); // the cracks throb
      lavaM.setColorAt(lv, w > 0 ? _c.setHex(0xff4a10).lerp(_tmpC.setHex(0xffd060), glow) : _c.setHex((i + Math.floor(t * 7)) % 3 ? 0xff6a1a : 0xffc040));
      lv++;
      if (w > 0) { _p.y += 0.05; _q.setFromEuler(_e.set(0, (i * 0.37) % 0.5 - 0.25, 0)); _s.set(1, 1, 1); crustM.setMatrixAt(kn++, _m.compose(_p, _q, _s)); }
      if (r > 0 && Math.random() < dt * 0.8) fl.puff(x, groundY(x, z) + 0.4, z, 0.5, 0x5a5550, 1.4, 1.8, 1.4);
    }
    crustM.count = kn; crustM.instanceMatrix.needsUpdate = true;
    lavaM.count = lv; lavaM.instanceMatrix.needsUpdate = true; if (lavaM.instanceColor) lavaM.instanceColor.needsUpdate = true;
    let w = 0, dn = 0;
    for (const r of field.rains) if (w < 8) { _p.set(r.x, groundY(r.x, r.z) + 0.05, r.z); _s.set(r.r, r.r, r.r); wetDisc.setMatrixAt(w, _m.compose(_p, flatQ, _s)); _p.y += 0.03; _s.set(r.r * 1.15, r.r * 1.15, r.r * 1.15); cloudM.setMatrixAt(w, _m.compose(_p, flatQ, _s)); w++; }
    wetDisc.count = w; wetDisc.instanceMatrix.needsUpdate = true; cloudM.count = w; cloudM.instanceMatrix.needsUpdate = true;
    if (field.rains.length) {
      const want = Math.min(DROPS, field.rains.length * 110);
      for (let i = 0; i < want; i++) {
        if (i >= dropsS.n || dropsS.y[i] < -50) { const r = field.rains[i % field.rains.length], a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r.r; dropsS.x[i] = r.x + Math.cos(a) * d; dropsS.z[i] = r.z + Math.sin(a) * d; dropsS.y[i] = groundY(r.x, r.z) + 3 + Math.random() * 6; }
        dropsS.y[i] -= dt * 16;
        const gy = groundY(dropsS.x[i], dropsS.z[i]);
        if (dropsS.y[i] < gy) dropsS.y[i] = -99;
        _p.set(dropsS.x[i], Math.max(gy, dropsS.y[i]), dropsS.z[i]); _s.set(1, 1, 1);
        drops.setMatrixAt(dn++, _m.compose(_p, _q.identity(), _s));
      }
      dropsS.n = want;
    }
    drops.count = dn; drops.instanceMatrix.needsUpdate = true;
    // sling stones in flight
    let sn = 0;
    for (const s of field.shots) {
      if (sn >= STONES) break;
      const k = s.t / s.dur, tx = s.tg.e.x, tz = s.tg.e.z, ty = (s.tg.e.y ?? 16) + 1.2;
      _p.set(s.x0 + (tx - s.x0) * k, s.y0 + (ty - s.y0) * k + Math.sin(Math.PI * k) * 1.2, s.z0 + (tz - s.z0) * k); _s.set(1, 1, 1);
      stones.setMatrixAt(sn++, _m.compose(_p, _q.identity(), _s));
    }
    stones.count = sn; stones.instanceMatrix.needsUpdate = true;
    // the enemy god's wind-ups (rings, and the cells of an earthwork) and your aim
    let tn = 0, cn = 0;
    const putTell = (x, z, r, k, col, fill) => {
      _p.set(x, groundY(x, z) + 0.1, z); _s.set(r, r, r);
      tellRing.setMatrixAt(tn, _m.compose(_p, flatQ, _s)); tellRing.setColorAt(tn, _c.setHex(col));
      const fr = Math.max(0.01, r * k); _s.set(fr, fr, fr);
      tellFill.setMatrixAt(tn, _m.compose(_p, flatQ, _s)); tellFill.setColorAt(tn, _c.setHex(fill ?? col));
      tn++;
    };
    const putCells = (cells, col, k = 1) => { for (const c of cells ?? []) { if (cn >= CELLS * 2) break; _p.set(c.x + 0.5, groundY(c.x + 0.5, c.z + 0.5) + 0.25 * k, c.z + 0.5); _s.set(1, k, 1); cellsM.setMatrixAt(cn, _m.compose(_p, _q.identity(), _s)); cellsM.setColorAt(cn, _c.setHex(col)); cn++; } };
    for (const tl of field.tells) {
      if (tn >= TELLS) break;
      const k = Math.min(1, tl.t / tl.dur), col = PM[tl.power]?.col ?? 0xffffff;
      if (tl.cells) putCells(tl.cells, col, 0.4 + k);
      putTell(tl.x, tl.z, tl.r, k, col);
    }
    if (aim) { if (aim.cells) putCells(aim.cells, aim.ok ? 0xfff3cc : 0x9a8f80, 1); else if (tn < TELLS + 2) putTell(aim.x, aim.z, aim.r, aim.ok ? 1 : 0.15, aim.ok ? 0xfff3cc : 0x9a8f80, aim.ok ? 0xfff3cc : 0x6a6458); }
    tellRing.count = tn; tellFill.count = tn; cellsM.count = cn;
    for (const m of [tellRing, tellFill, cellsM]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    let fn = 0;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const fx = flashes[i]; fx.t += dt;
      if (fx.t >= fx.dur) { flashes.splice(i, 1); continue; }
      const k = fx.t / fx.dur, r = fx.r * (0.3 + 0.7 * (1 - (1 - k) * (1 - k)));
      _p.set(fx.x, groundY(fx.x, fx.z) + 0.12, fx.z); _s.set(r, r, r);
      flash.setMatrixAt(fn, _m.compose(_p, flatQ, _s)); flash.setColorAt(fn, _c.setHex(fx.col)); fn++;
    }
    flash.count = fn; flash.instanceMatrix.needsUpdate = true; if (flash.instanceColor) flash.instanceColor.needsUpdate = true;
    for (const [k, b] of field.bands.entries()) {
      const fm = field.fam[k];
      const champ = field.units.find((u) => u.side === 0 && u.band === k && u.kind === 'champ' && field.alive(u));
      const at = champ ? { x: champ.e.x - 0.4, z: champ.e.z } : fm ? { x: fm.x, z: fm.z } : b.post;
      setBanner(k, b.dye, !!fm || field.phase === 'calm', at.x, at.z, !!fm?.retreat);
    }
    fl.tick(dt);
  }
  // the battle is over: raiders and wolves go, your people's figures are handed back (battle.js puts them home)
  function clear() {
    for (const u of [...figs]) { if (!u.p) u.F.group.removeFromParent(); figs.delete(u); }
    for (const b of banners.values()) fl.dropBanner(b);
    banners.clear();
    flashes.length = 0; aim = null; dropsS.n = 0;
    frame(null, 0);
  }
  return { addRaider, addMine, addBeast, revive, addWolf, gone, bless, spark, ring, puff, dust, frame, clear, setAim, bolt, groundY };
}
