// Chunk mesher: culled faces, vertex colors, classic 4-level ambient occlusion,
// low-frequency world tinting and position-hash jitter so vertex-colored voxels
// read as hand-textured. Flora flagged `cross: true` renders as two crossed
// quads (walk-through, never occludes).
// Ported from the source repo's world/mesher.js. Changed for a big flat world:
// the y loop stops above world.maxY, the sun march exits above it, the world
// tint noise is computed only for blocks that emit a face, and the bottom
// faces of y 0 (never seen) are skipped. Output is otherwise identical.
import * as THREE from '../../vendor/three.module.js';
import { WORLD } from '../config.js';
import { B, BLOCK_DEFS, BERRY_KINDS, BLOSSOM, isOpaque, isWater } from './blocks.js';
import { atlasTexture, tileUV } from './atlas.js';
import { noise2 } from './noise.js';
import { enhance, MOON_DIR } from './shade.js';

const { CHUNK, SIZE_Y: SY } = WORLD;

// face: d = normal, c = 4 corners (CCW from outside), ax = the two tangent
// axes (indices into [x,y,z]) used for AO corner sampling.
// uv: [axis for U, axis for V] into the corner triple, so a painted face is
// upright on the sides and reads left-to-right on the top/bottom.
const FACES = [
  // Face shades are the classic voxel "cube reads as a cube" stylisation on
  // top of the real Lambert term: tops full, sides stepped, bottoms deep.
  // Widened 2026-08-23 (was 1.0 / 0.55 / 0.8 / 0.8 / 0.72 / 0.9): the old
  // spread was narrow enough that a block edge needed the AO corner to show.
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, part: 'top', ax: [0, 2], uv: [0, 2] },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.45, part: 'bottom', ax: [0, 2], uv: [0, 2] },
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.78, part: 'side', ax: [1, 2], uv: [2, 1] },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.70, part: 'side', ax: [1, 2], uv: [2, 1] },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.68, part: 'side', ax: [0, 1], uv: [0, 1] },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.84, part: 'side', ax: [0, 1], uv: [0, 1] },
];

// ---- baked sun shadows ----
// The sun sits at (40, 60, 20) (engine/renderer.js); light travels the other
// way, so from any point we march TOWARD the sun and the first opaque cell we
// meet puts the point in shadow. The march steps one block in y at a time
// (the x and z steps below are the sun direction scaled to that), which is
// coarse enough to be cheap and fine enough for anything a tree or a cliff
// casts. A one-block trunk can slip between samples at some corners, and that
// is accepted: its canopy is what throws the shadow that matters.
// Marching stops after SUN_STEPS blocks of rise, or as soon as it climbs above
// the highest block in the world (world.maxY), where nothing can shade it.
const SUN_DX = 40 / 60, SUN_DZ = 20 / 60;
const SUN_STEPS = 14;
// The moon (MOON_DIR in shade.js, west-south-west and lower): the same march toward it, baked into a
// second attribute `moon` that the shader uses only at night, so moonlight throws its own longer
// shadows with no remesh at dusk. It steps a little over a block sideways per block of rise.
const MOON_DX = MOON_DIR[0] / MOON_DIR[1], MOON_DZ = MOON_DIR[2] / MOON_DIR[1];
// The sample point starts half a block out along the face normal (inside the
// open cell the face looks into, never inside its own block) and is nudged a
// whisker toward the face centre so a corner that sits exactly on a block
// boundary floors into the cell it belongs to rather than its neighbour.
const SUN_EPS = 0.02;

// AO level (0 = fully cornered … 3 = open) → brightness
const AO_LUT = [0.55, 0.74, 0.87, 1.0];
// per-face scratch (one face is finished before the next starts)
const _sun = [0, 0, 0, 0], _moon = [0, 0, 0, 0], _ao = [0, 0, 0, 0], _foam = [0, 0, 0, 0];
const _p1 = [0, 0, 0], _p2 = [0, 0, 0], _pc = [0, 0, 0];

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 1000) / 1000;
}

export class ChunkMesher {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    // every chunk material goes through shade.js: baked sun on all three,
    // wind sway on canopy blocks and cross flora, the wobble + specular on
    // water. See that file for what each costs (nothing per draw call).
    this.solidMat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true }), { sun: true, sway: true });
    this.waterMat = enhance(new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
    }), { water: true });
    this.crossMat = enhance(new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide,
    }), { sun: true, sway: true, vividFull: true });
    this.texMat = null; // built on first sight of a painted block (see atlas.js)
    this.chunks = new Map(); // key -> {solid, water, cross, tex} (Mesh|null each)
    // The seasons (view/seasons.js) set this on the home land's mesher; null everywhere else (the battleground):
    //   tag(id, part, x, y, z) -> [a, b, w]  per face; written with the face shade times AO into a `season` attribute
    //   cross(id, x, y, z)     -> [a, b, w]  per tuft; the attribute's third value is 0 at the root, 1 at the tip
    //   keep(id, nid, x, z, nx, nz) -> true draws a face against a leaf block that may vanish in winter
    // The season's colours, snow and bare trees are then drawn by the shader from uniforms: no remesh.
    this.look = null;
    this._part = null; // while a berry bush or flower is drawn with the look on: what the season may do to each vertex
  }

  remeshAll() {
    this.world.markAllDirty();
    this.flush(Infinity);
  }

  // remesh up to `budget` dirty chunks; call per frame. Options (the frame
  // loop's flush of the sim's own writes; transactions and tools flush at once):
  //   minAge  ms a chunk waits after it was first seen dirty, so a burst of
  //           writes to one chunk (crops ripening one by one, a harvest, a hut
  //           going up) is meshed once rather than once per frame
  //   maxMs   stop starting chunks once this much time has gone this call
  // Measured 2026-11-12 (seed 2, speed 4): 80% of the frame loop's remeshes
  // were crop blocks, 0.8 to 1.2 chunks a frame, and meshing made about two
  // thirds of the page's garbage (35 of 53 MB a second).
  flush(budget = 2, o = null) {
    let n = 0;
    const dirty = this.world.dirty;
    const minAge = o?.minAge ?? 0, maxMs = o?.maxMs ?? Infinity;
    const now = minAge || maxMs < Infinity ? performance.now() : 0;
    const seen = this._seen ?? (this._seen = new Map());
    for (const key of dirty) {
      if (n >= budget) break;
      if (minAge) {
        const t = seen.get(key);
        if (t === undefined) { seen.set(key, now); continue; }
        if (now - t < minAge) continue;
      }
      if (n && performance.now() - now > maxMs) break;
      dirty.delete(key);
      seen.delete(key);
      const c = key.indexOf(',');
      this.buildChunk(+key.slice(0, c), +key.slice(c + 1));
      n++;
    }
    if (seen.size > dirty.size) for (const key of seen.keys()) if (!dirty.has(key)) seen.delete(key);
    return dirty.size;
  }

  // painted-block material, created only once a block with `tex` is meshed
  _texMaterial() {
    if (!this.texMat) {
      this.texMat = enhance(new THREE.MeshLambertMaterial({ map: atlasTexture(), vertexColors: true }), { sun: true });
    }
    return this.texMat;
  }

  // For a future ground-level camera: skip chunks whose nearest edge is past
  // `far` blocks. Unused by the god view (the camera is high, so all shows).
  cullFar(cam, far = 140, high = 30) {
    const all = cam.position.y > high;
    const f2 = far * far;
    for (const e of this.chunks.values()) {
      let show = all;
      if (!show) {
        const dx = Math.max(e.x0 - cam.position.x, 0, cam.position.x - (e.x0 + CHUNK));
        const dz = Math.max(e.z0 - cam.position.z, 0, cam.position.z - (e.z0 + CHUNK));
        show = dx * dx + dz * dz < f2;
      }
      if (show === e.shown) continue;
      e.shown = show;
      for (const m of [e.solid, e.water, e.cross, e.tex]) if (m) m.visible = show;
    }
  }

  disposeAll() {
    for (const { solid, water, cross, tex } of this.chunks.values()) {
      for (const m of [solid, water, cross, tex]) {
        if (!m) continue;
        this.scene.remove(m);
        m.geometry.dispose();
      }
    }
    this.chunks.clear();
  }

  buildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const prev = this.chunks.get(key);
    if (prev) {
      for (const m of [prev.solid, prev.water, prev.cross, prev.tex]) {
        if (m) { this.scene.remove(m); m.geometry.dispose(); }
      }
    }
    const w = this.world;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    const pos = [], col = [], idxArr = [], sunA = [], swayA = [], moonA = [];
    const wpos = [], wcol = [], widx = [];
    const xpos = [], xcol = [], xidx = [], xsun = [], xsway = [], xmoon = [];
    const tpos = [], tcol = [], tuv = [], tidx = [], tsun = [], tmoon = []; // painted blocks (atlas)
    const look = this.look, seaA = look ? [] : null, xsea = look ? [] : null; // the seasons (see the constructor)

    // occupancy sample for AO: 1 if the cell shadows a corner
    const occ = (x, y, z) => (isOpaque(w.get(x, y, z)) ? 1 : 0);
    // 1 if nothing opaque stands between this point and the sun (see the
    // SUN_* notes above). Bounded by the world volume, so a point under open
    // sky exits in a handful of steps.
    const topY = Math.min(SY - 1, w.maxY ?? SY - 1);
    const sunAt = (px, py, pz) => {
      for (let k = 0; k <= SUN_STEPS; k++) {
        const sx = Math.floor(px + SUN_DX * k), sy = Math.floor(py + k), sz = Math.floor(pz + SUN_DZ * k);
        if (sy > topY) return 1;
        if (isOpaque(w.get(sx, sy, sz))) return 0;
      }
      return 1;
    };
    const moonAt = (px, py, pz) => {
      for (let k = 0; k <= SUN_STEPS; k++) {
        const sx = Math.floor(px + MOON_DX * k), sy = Math.floor(py + k), sz = Math.floor(pz + MOON_DZ * k);
        if (sy > topY) return 1;
        if (isOpaque(w.get(sx, sy, sz))) return 0;
      }
      return 1;
    };

    for (let y = 0; y <= topY; y++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          const id = w.get(x, y, z);
          if (id === B.AIR) continue;
          const def = BLOCK_DEFS[id];
          if (!def) continue;

          // low-frequency world tint: light/dark patches across the meadow
          // (computed on first use: most blocks are buried and emit nothing)
          let tn = -1;

          if (def.cross) {
            tn = noise2(x * 0.045, z * 0.045);
            // berry bushes and flowers have their own shapes (emitBush, emitFlower, below); other flora is crossed cards
            if (def.bush || def.flower) {
              // their vertex counts vary: each emitter notes per vertex what the season look may do to it (this._part:
              // -1 a berry, blossom, flower head or seed head, kept in its own colour; else the body's shade, plus 10
              // where snow may lie on it), and the season tags follow that list (view/seasons.js `look.cross`)
              this._part = xsea ? [] : null;
              if (def.bush) this.emitBush(x, y, z, def, tn, xpos, xcol, xidx, xsun, xsway, sunAt, xmoon, moonAt);
              else this.emitFlower(x, y, z, def, tn, xpos, xcol, xidx, xsun, xsway, sunAt, xmoon, moonAt);
              if (xsea) {
                const t = look.cross(id, x, y, z);
                for (const v of this._part) {
                  if (v < 0) xsea.push(0, 0, 0, 0);
                  else if (v >= 10) xsea.push(t[0], t[1], Math.min(1, v - 10), t[2]);
                  else xsea.push(t[0], 0, def.bush ? Math.min(1, v) : 0, t[2]);
                }
                this._part = null;
              }
            } else {
              this.emitCross(x, y, z, def, tn, xpos, xcol, xidx, xsun, xsway, sunAt, xmoon, moonAt);
              if (xsea) { const t = look.cross(id, x, y, z); for (let k = 0; k < 2; k++) xsea.push(t[0], t[1], 0, t[2], t[0], t[1], 0, t[2], t[0], t[1], 1, t[2], t[0], t[1], 1, t[2]); }
            }
            continue;
          }

          const water = isWater(id);
          // a painted block goes to the atlas pass; everything else is exactly
          // the vertex-coloured path it always was
          const painted = !water && !!def.tex;
          const P = painted ? tpos : water ? wpos : pos;
          const Cc = painted ? tcol : water ? wcol : col;
          const I = painted ? tidx : water ? widx : idxArr;
          // Surface water sits 0.15 below the block top. That drop has to apply
          // to the SIDE faces as well, not just the top face — with sides run
          // to full height the wall stood proud of its own surface and read as
          // a floating lip with a gap under it wherever water met a bank.
          // Submerged water cells keep full height so the column has no seams.
          const wTop = water && !isWater(w.get(x, y + 1, z)) ? 0.85 : 1;

          for (const f of FACES) {
            if (y === 0 && f.part === 'bottom') continue; // the underside of the world
            const nx = x + f.d[0], ny = y + f.d[1], nz = z + f.d[2];
            const nid = w.get(nx, ny, nz);
            if (water) {
              // water: top face under air, side faces against air or
              // walk-through flora (world edge, carved banks, bank reeds) —
              // never between two water cells
              if (f.part === 'bottom') continue;
              if (nid !== B.AIR && !BLOCK_DEFS[nid]?.cross) continue;
            } else if (isOpaque(nid) && !(look && look.keep(id, nid, x, z, nx, nz))) {
              continue;
            }
            const base = def[f.part === 'top' ? 'top' : f.part === 'bottom' ? 'bottom' : 'side'] || def.top;
            // cave/cliff rock gets much stronger per-face jitter so big flat
            // walls break up instead of reading as drywall
            const caveRock = id === B.ROCK || id === B.ROCK_DARK;
            let jitter = caveRock
              ? 0.82 + 0.30 * hash3(x, y * 7, z * 13)
              : 0.94 + 0.12 * hash3(x, y * 7, z * 13);
            // birch bark banding: darker rings at hashed heights (same hash on
            // all four sides of a trunk block → a consistent ring)
            if (id === B.WOOD_BIRCH && f.part === 'side') {
              jitter *= hash3(x, y * 3, z) < 0.28 ? 0.78 : 1.0;
            }

            // per-block tint: strong on natural ground/canopy, subtle elsewhere
            let tr = 1, tg = 1, tb = 1;
            if (tn < 0) tn = noise2(x * 0.045, z * 0.045);
            if (!water) {
              const strong = id === B.GRASS || id === B.SAND || id === B.SNOWGRASS ||
                id === B.LEAVES || id === B.LEAVES_DARK || id === B.LEAVES_BRIGHT;
              const s = strong ? 0.24 : caveRock ? 0.16 : 0.07;
              const t = 1 + (tn - 0.5) * 2 * s;
              tr = t; tg = t; tb = t;
              if ((id === B.GRASS && f.part === 'top') || id === B.LEAVES ||
                id === B.LEAVES_DARK || id === B.LEAVES_BRIGHT) {
                // warm/dry vs cool/lush hue drift on grass tops and canopies
                tr *= 1 + (tn - 0.5) * 0.22;
                tg *= 1 + (0.5 - tn) * 0.08;
              }
              if (caveRock) {
                // gentle vertical gradient: deeper = darker, so cave interiors
                // shade toward the floor instead of one flat beige
                const vg = 0.72 + 0.28 * Math.min(1, Math.max(0, (y - 4) / 12));
                tr *= vg; tg *= vg; tb *= vg;
              }
              // Wood SIDES barely see the warm sun: what lands on them is the
              // cool hemisphere sky (0xaecdea) and the cool fill (0xbdd2ec),
              // and pale birch bark has too little saturation to survive being
              // multiplied by that — it came out concrete grey at the act 3
              // vista even after the palette itself was warmed. Widening the
              // R over B spread here means the cool light lands on cream
              // rather than on white. Deliberately kept under the point where
              // base × shade × jitter × tint would clip, so nothing blows out.
              // Note B.WOOD is not only trunks: pen fences, granary stilts and
              // box walls, well posts, the log crossing and stumps all use it.
              // That is intended — it is all wood, and it all wants to read
              // warm under the same cold sky.
              if (f.part === 'side' && (id === B.WOOD_BIRCH || id === B.WOOD)) {
                tr *= 1.08; tb *= 0.82;
              }
            }
            // painted faces let the texture carry the hue: the vertex colour
            // is pure light (face shade × jitter × AO), so the same tile reads
            // correctly on every side of the cube
            const r0 = painted ? f.shade * jitter : base[0] * f.shade * jitter * tr;
            const g0 = painted ? f.shade * jitter : base[1] * f.shade * jitter * tg;
            const b0 = painted ? f.shade * jitter : base[2] * f.shade * jitter * tb;
            const uvRect = painted
              ? tileUV(def.tex[f.part] ?? def.tex.side ?? def.tex.top ?? 0)
              : null;

            const vi = P.length / 3;
            let ao = null;
            // wind: canopy blocks breathe a little as a whole; everything else
            // stands still. Per-vertex so the shader needs no block id.
            const leaf = id === B.LEAVES || id === B.LEAVES_DARK || id === B.LEAVES_BRIGHT;
            const swayV = leaf ? 0.35 : 0;
            // foam: a water surface corner hugged by a bank cell at the same
            // level gets a pale rim, so the river meets its shore with an edge
            // instead of a hard colour seam
            const sea = seaA && !water && !painted ? look.tag(id, f.part, x, y, z) : null; // the seasons
            let foam = null;
            if (water && f.part === 'top' && wTop < 1) {
              foam = _foam;
              for (let ci = 0; ci < 4; ci++) {
                const cnr = f.c[ci];
                const sA = cnr[0] ? 1 : -1, sB = cnr[2] ? 1 : -1;
                foam[ci] = (occ(x + sA, y, z) || occ(x, y, z + sB) || occ(x + sA, y, z + sB)) ? 1 : 0;
              }
            }
            let sun = null;
            if (!water) {
              sun = _sun;
              const cxm = x + 0.5, cym = y + 0.5, czm = z + 0.5;
              for (let ci = 0; ci < 4; ci++) {
                const cnr = f.c[ci];
                const px = x + cnr[0], py = y + cnr[1], pz = z + cnr[2];
                const qx = px + f.d[0] * 0.5 + (cxm - px) * SUN_EPS;
                const qy = py + f.d[1] * 0.5 + (cym - py) * SUN_EPS;
                const qz = pz + f.d[2] * 0.5 + (czm - pz) * SUN_EPS;
                sun[ci] = sunAt(qx, qy, qz);
                // a face turned away from the moon gets none of its light whatever the mask says: no march
                _moon[ci] = f.d[0] * MOON_DIR[0] + f.d[1] * MOON_DIR[1] + f.d[2] * MOON_DIR[2] > 0 ? moonAt(qx, qy, qz) : 1;
              }
            }
            if (!water) {
              // classic 4-level AO: sample the 3 cells that hug each corner
              // one step out along the face normal
              ao = _ao;
              const bx = x + f.d[0], by = y + f.d[1], bz = z + f.d[2];
              const a1 = f.ax[0], a2 = f.ax[1];
              // scratch arrays, reused: this loop runs for every face corner of a remesh
              const p1 = _p1, p2 = _p2, pc = _pc;
              for (let ci = 0; ci < 4; ci++) {
                const cnr = f.c[ci];
                const sA = cnr[a1] ? 1 : -1;
                const sB = cnr[a2] ? 1 : -1;
                p1[0] = bx; p1[1] = by; p1[2] = bz; p1[a1] += sA;
                p2[0] = bx; p2[1] = by; p2[2] = bz; p2[a2] += sB;
                pc[0] = bx; pc[1] = by; pc[2] = bz; pc[a1] += sA; pc[a2] += sB;
                const s1 = occ(p1[0], p1[1], p1[2]);
                const s2 = occ(p2[0], p2[1], p2[2]);
                const cc = occ(pc[0], pc[1], pc[2]);
                ao[ci] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
              }
            }

            for (let ci = 0; ci < 4; ci++) {
              const cnr = f.c[ci];
              const yy = water ? y + cnr[1] * wTop : y + cnr[1];
              P.push(x + cnr[0], yy, z + cnr[2]);
              if (uvRect) {
                const u = cnr[f.uv[0]], v = cnr[f.uv[1]];
                tuv.push(uvRect.u0 + (uvRect.u1 - uvRect.u0) * u,
                  uvRect.v0 + (uvRect.v1 - uvRect.v0) * v);
              }
              if (water) {
                // slight per-vertex shimmer + depth-leaning blue
                const wj = 0.9 + 0.2 * hash3(x * 3 + cnr[0], y, z * 3 + cnr[2]);
                let wr = Math.min(1, base[0] * f.shade * wj * 0.9);
                let wg = Math.min(1, base[1] * f.shade * wj);
                let wb = Math.min(1, base[2] * f.shade * (0.95 + wj * 0.1));
                if (foam && foam[ci]) {
                  wr += (0.78 - wr) * 0.55; wg += (0.86 - wg) * 0.55; wb += (0.86 - wb) * 0.55;
                }
                Cc.push(wr, wg, wb);
              } else {
                const a = AO_LUT[ao[ci]];
                Cc.push(Math.min(1, r0 * a), Math.min(1, g0 * a), Math.min(1, b0 * a));
                if (painted) { tsun.push(sun[ci]); tmoon.push(_moon[ci]); }
                else { sunA.push(sun[ci]); swayA.push(swayV); moonA.push(_moon[ci]); if (sea) seaA.push(sea[0], sea[1], f.shade * a, sea[2]); }
              }
            }

            // flip the quad diagonal so AO (and the baked shadow edge)
            // interpolates without banding (anisotropy fix: keep the single
            // dark corner off the diagonal)
            if (!water && ao[0] + ao[2] + sun[0] * 2 + sun[2] * 2 < ao[1] + ao[3] + sun[1] * 2 + sun[3] * 2) {
              I.push(vi + 1, vi + 2, vi + 3, vi + 3, vi, vi + 1);
            } else {
              I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            }
          }
        }
      }
    }

    const entry = { solid: null, water: null, cross: null, tex: null, x0, z0, shown: true };
    if (pos.length) entry.solid = this.makeMesh(pos, col, idxArr, this.solidMat, null, sunA, swayA, moonA, seaA);
    if (wpos.length) entry.water = this.makeMesh(wpos, wcol, widx, this.waterMat);
    if (xpos.length) entry.cross = this.makeMesh(xpos, xcol, xidx, this.crossMat, null, xsun, xsway, xmoon, xsea);
    if (tpos.length) entry.tex = this.makeMesh(tpos, tcol, tidx, this._texMaterial(), tuv, tsun, null, tmoon);
    // the river receives the Rich-tier shadow map but never casts into it
    if (entry.water) entry.water.castShadow = false;
    this.chunks.set(key, entry);
  }

  // two crossed quads with a hash-driven rotation/offset — reads as a tuft,
  // flower or reed instead of a cube. Never occludes neighbours.
  // Quads are TAPERED trapezoids: top verts pull toward the centre by
  // def.crossTaper (default 0.5) so cover reads as tufts, not slabs.
  emitCross(x, y, z, def, tn, P, Cc, I, SunA, SwayA, sunAt, MoonA, moonAt) {
    const h1 = hash3(x, 1, z), h2 = hash3(x, 2, z), h3 = hash3(x, 3, z);
    // one sun sample per tuft, from the open cell it stands in: it is under
    // a canopy or it is not
    const sunV = sunAt(x + 0.5, y + 0.5, z + 0.5);
    const moonV = moonAt(x + 0.5, y + 0.5, z + 0.5);
    const cx = x + 0.5 + (h1 - 0.5) * 0.3;
    const cz = z + 0.5 + (h2 - 0.5) * 0.3;
    const ang = h3 * Math.PI;
    const rad = 0.42;
    // stacked flora (2-tall reeds) must join seamlessly: the hash ignores y,
    // so segments share rotation/offset — just run the lower one full-height
    const stacked = this.world.get(x, y + 1, z) !== B.AIR &&
      this.world.get(x, y + 1, z) === this.world.get(x, y, z);
    // nominal height 0.7 (REED overrides via crossH) with hash variance
    // ≈0.5–0.85; a stacked lower segment runs full height with NO taper so
    // its top matches the upper segment's untapered bottom (no seam)
    const baseH = def.crossH ?? 0.7;
    const hgt = stacked ? 1.0 : Math.min(1.0, baseH * (0.72 + h1 * 0.5));
    const topScale = stacked ? 1.0 : 1 - (def.crossTaper ?? 0.5);

    const base = def.top;
    const tint = 1 + (tn - 0.5) * 0.24;
    // stem/base color: darker at the ground so tufts sit into the grass
    const br = Math.min(1, base[0] * 0.72 * tint);
    const bg = Math.min(1, base[1] * 0.72 * tint);
    const bb = Math.min(1, base[2] * 0.72 * tint);
    // plain top color (accent-free flora just brightens toward the tip)
    const pr = Math.min(1, base[0] * 1.06 * tint);
    const pg = Math.min(1, base[1] * 1.06 * tint);
    const pb = Math.min(1, base[2] * 1.06 * tint);

    for (let k = 0; k < 2; k++) {
      const a = ang + k * Math.PI * 0.5;
      const dx = Math.cos(a) * rad, dz = Math.sin(a) * rad;
      const vi = P.length / 3;
      P.push(cx - dx, y, cz - dz);
      P.push(cx + dx, y, cz + dz);
      P.push(cx + dx * topScale, y + hgt, cz + dz * topScale);
      P.push(cx - dx * topScale, y + hgt, cz - dz * topScale);
      // bottom two verts: stem color
      Cc.push(br, bg, bb, br, bg, bb);
      // top two verts: accent gradient (bloom) or flecks (berries); a stacked
      // segment keeps stem color at its top so the joint has no color seam
      for (let t = 0; t < 2; t++) {
        let r = pr, g = pg, b = pb;
        if (stacked) { r = br; g = bg; b = bb; }
        else if (def.accent) {
          const useAccent = def.fleck ? hash3(x + k * 7, 5 + t * 3, z) > 0.55 : true;
          if (useAccent) { r = def.accent[0]; g = def.accent[1]; b = def.accent[2]; }
        }
        Cc.push(Math.min(1, r), Math.min(1, g), Math.min(1, b));
      }
      // roots stay put, tips bend: bottom verts 0, top verts 1 (a stacked
      // lower reed segment keeps its top still so the joint never tears)
      SunA.push(sunV, sunV, sunV, sunV);
      MoonA.push(moonV, moonV, moonV, moonV);
      const tip = stacked ? 0 : 1;
      SwayA.push(0, 0, tip, tip);
      // DoubleSide material — one winding is enough
      I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }
  }

  // ---- berry bushes and flowers (the food work, 2026-11-16; docs/research/12-look-and-feel-our-game.md 3.1 and 3.2) ----
  // Both go into the flora pass (walk-through, two-sided, one sun sample each). Their `sway` values carry a season
  // code read by the shader (world/shade.js, uBloom): 0..1 is plain wind sway as before; 2 + t is a flower head or
  // blossom, shown while the season's bloom share is above t; 4 + t a seed head, shown while the seed share is above
  // t; 6 a flower stem's root and 7 its tip, shown except in winter. A hidden part sinks into the ground, so a season
  // changes what shows with no remesh. Triangles are wound to face out from a centre (tri), so the light is right.
  _tri(P, I, centre, a, b, c) {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (ax + P[b * 3] + P[c * 3]) / 3 - centre[0], my = (ay + P[b * 3 + 1] + P[c * 3 + 1]) / 3 - centre[1], mz = (az + P[b * 3 + 2] + P[c * 3 + 2]) / 3 - centre[2];
    if (nx * mx + ny * my + nz * mz >= 0) I.push(a, b, c); else I.push(a, c, b);
  }

  // A berry bush: a low, lumpy green dome (a seven-sided stack of rings, lighter on top, as research 3.1 asks), with
  // seven to nine berries (small diamonds) on its top and upper sides in its kind's colour, a lighter shine on each
  // berry's crown. A bare bush (picked, or out of season) has no berries and a duller green, and carries spring
  // blossom (pale pink stars shown only in spring by the bloom). About 30 vertices for the dome, 6 a berry.
  emitBush(x, y, z, def, tn, P, Cc, I, SunA, SwayA, sunAt, MoonA, moonAt) {
    // the look test (below): ?bush=a, b or c draws one of the three new looks instead of this dome
    const look = this._bushLook();
    if (look) {
      const K = this._bushKit(x, y, z, def, tn, P, Cc, I, SunA, SwayA, sunAt, MoonA, moonAt);
      if (look === 'a') this._bushBlocks(x, y, z, def, K);
      else if (look === 'b') this._bushShrub(x, y, z, def, K);
      else this._bushThicket(x, y, z, def, K);
      return;
    }
    const h1 = hash3(x, 1, z), h2 = hash3(x, 2, z), h3 = hash3(x, 3, z);
    const sunV = sunAt(x + 0.5, y + 0.6, z + 0.5), moonV = moonAt(x + 0.5, y + 0.6, z + 0.5);
    const cx = x + 0.5 + (h1 - 0.5) * 0.12, cz = z + 0.5 + (h2 - 0.5) * 0.12;
    const s = 0.9 + h3 * 0.2;
    const tint = 1 + (tn - 0.5) * 0.2;
    const g = def.top, part = this._part;
    // pv: what the season look may do to the vertex (buildChunk): -1 keep its colour (a berry, blossom), else the
    // dome's shade, plus 10 on its upper part where snow may lie
    const push = (px, py, pz, r, gg, b, sway, pv = -1) => {
      P.push(px, py, pz); Cc.push(Math.min(1, r), Math.min(1, gg), Math.min(1, b));
      SunA.push(sunV); MoonA.push(moonV); SwayA.push(sway);
      if (part) part.push(pv);
      return P.length / 3 - 1;
    };
    // the dome: rings of [radius, height, shade]
    const RINGS = [[0.30, 0.0, 0.58], [0.47, 0.2, 0.74], [0.44, 0.42, 0.9], [0.28, 0.6, 1.02]];
    const N = 7, a0 = h3 * 6.283, centre = [cx, y + 0.3 * s, cz];
    const ring = [];
    for (let j = 0; j < RINGS.length; j++) {
      const [r, hy, sh] = RINGS[j];
      const row = [];
      for (let k = 0; k < N; k++) {
        const a = a0 + k / N * 6.283, rr = r * s * (0.88 + 0.24 * hash3(x + k, 11 + j, z));
        const k2 = sh * tint * (0.95 + 0.1 * hash3(x + k, 21 + j, z));
        row.push(push(cx + Math.cos(a) * rr, y + hy * s, cz + Math.sin(a) * rr, g[0] * k2, g[1] * k2, g[2] * k2, j >= 2 ? 0.15 : 0, (j >= 2 ? 10 : 0) + sh));
      }
      ring.push(row);
    }
    const top = push(cx, y + 0.7 * s, cz, g[0] * 1.08 * tint, g[1] * 1.08 * tint, g[2] * 1.08 * tint, 0.15, 11);
    for (let j = 0; j < RINGS.length - 1; j++) for (let k = 0; k < N; k++) {
      const a = ring[j][k], b = ring[j][(k + 1) % N], c = ring[j + 1][(k + 1) % N], d = ring[j + 1][k];
      this._tri(P, I, centre, a, b, c); this._tri(P, I, centre, a, c, d);
    }
    for (let k = 0; k < N; k++) this._tri(P, I, centre, ring[RINGS.length - 1][k], ring[RINGS.length - 1][(k + 1) % N], top);
    // a point on the dome's upper surface at angle a, from 0 (the crown) to 1 (the widest ring)
    const onDome = (a, u) => {
      const r = (0.06 + 0.4 * u) * s, hy = (0.7 - 0.3 * u * u) * s;
      return [cx + Math.cos(a) * r, y + hy, cz + Math.sin(a) * r];
    };
    if (def.berries) {
      // the kind from where it grows: a slow noise, so a clump shares one kind
      const kn = noise2(x * 0.07 + 31.7, z * 0.07 - 12.3);
      const kind = BERRY_KINDS[Math.min(BERRY_KINDS.length - 1, Math.floor(((kn * 3.7) % 1) * BERRY_KINDS.length))];
      const n = 7 + Math.floor(hash3(x, 5, z) * 3);
      for (let k = 0; k < n; k++) {
        const a = a0 + k * 2.4 + hash3(x + k, 6, z) * 0.6, u = k < 4 ? 0.15 + 0.35 * hash3(x + k, 7, z) : 0.6 + 0.35 * hash3(x + k, 7, z);
        const [bx, by, bz] = onDome(a, u);
        const r = 0.09 + 0.02 * hash3(x + k, 8, z), b = kind.berry, sh = kind.shine;
        const c = [bx, by + 0.02, bz];
        const v = [
          push(bx + r, c[1], bz, b[0], b[1], b[2], 0.15), push(bx - r, c[1], bz, b[0], b[1], b[2], 0.15),
          push(bx, c[1], bz + r, b[0], b[1], b[2], 0.15), push(bx, c[1], bz - r, b[0], b[1], b[2], 0.15),
          push(bx, c[1] + r * 1.1, bz, sh[0], sh[1], sh[2], 0.15), push(bx, c[1] - r * 0.8, bz, b[0] * 0.6, b[1] * 0.6, b[2] * 0.6, 0.15),
        ];
        for (const [p, q] of [[0, 2], [2, 1], [1, 3], [3, 0]]) { this._tri(P, I, c, v[p], v[q], v[4]); this._tri(P, I, c, v[p], v[q], v[5]); }
      }
    } else {
      // spring blossom: small pale stars on the crown and upper sides, each shown from its own share of the bloom
      const n = 6 + Math.floor(hash3(x, 5, z) * 3);
      for (let k = 0; k < n; k++) {
        const a = a0 + k * 2.4 + hash3(x + k, 6, z) * 0.6, u = 0.1 + 0.7 * hash3(x + k, 7, z);
        const [bx, by, bz] = onDome(a, u);
        const code = 2 + 0.55 + 0.4 * hash3(x + k, 9, z), r = 0.085, pe = BLOSSOM.petal, ey = BLOSSOM.eye;
        const yy = by + 0.025, c = [bx, yy - 1, bz];
        for (let q = 0; q < 2; q++) {
          const ang = q * 0.785 + k;
          const dx = Math.cos(ang) * r, dz = Math.sin(ang) * r;
          const v0 = push(bx - dx, yy, bz - dz, pe[0], pe[1], pe[2], code), v1 = push(bx - dz, yy, bz + dx, pe[0], pe[1], pe[2], code);
          const v2 = push(bx + dx, yy, bz + dz, pe[0], pe[1], pe[2], code), v3 = push(bx + dz, yy, bz - dx, pe[0], pe[1], pe[2], code);
          this._tri(P, I, c, v0, v1, v2); this._tri(P, I, c, v0, v2, v3);
        }
        const e0 = push(bx, yy + 0.012, bz + 0.03, ey[0], ey[1], ey[2], code), e1 = push(bx + 0.03, yy + 0.012, bz - 0.02, ey[0], ey[1], ey[2], code), e2 = push(bx - 0.03, yy + 0.012, bz - 0.02, ey[0], ey[1], ey[2], code);
        this._tri(P, I, c, e0, e1, e2);
      }
    }
  }

  // ---- the berry bush look test (2026-11-16; the director: "the bushes ... look horrible ... the model has to be
  // improved") ----
  // Three new looks, chosen by the address: ?bush=a blocks (a few small leaf cubes, like a tree crown with no trunk),
  // ?bush=b a shrub (leafy clumps of different heights, berries in hanging bunches, twigs when bare, a shadow under
  // it), ?bush=c a thicket (the whole clump one ragged bramble patch that follows the ground). With no switch the
  // dome above is drawn as before. Each keeps the season tags (pv: -1 keeps its own colour, else the leaf's shade,
  // plus 10 where snow may lie), the berry kind's colour, and spring blossom by the bloom code (2 + t), so a season
  // never remeshes. In a and b each bush stands anywhere in its cell, sized and shaped by it (kept out of a higher step
  // of ground beside it), so a clump never reads as a grid; in c the clump is one patch with a ragged edge.
  // Look only: the bush is still the one block the people walk to and pick.
  _bushLook() {
    if (ChunkMesher.bushLook === undefined) {
      let v = '';
      try { v = new URLSearchParams(location.search).get('bush') ?? ''; } catch { /* no address (the checks) */ }
      ChunkMesher.bushLook = v === 'a' || v === 'b' || v === 'c' ? v : '';
    }
    return ChunkMesher.bushLook;
  }

  // what every look draws with: push a vertex, the leaf colour, a box, a berry, a blossom
  _bushKit(x, y, z, def, tn, P, Cc, I, SunA, SwayA, sunAt, MoonA, moonAt) {
    const sunV = sunAt(x + 0.5, y + 0.6, z + 0.5), moonV = moonAt(x + 0.5, y + 0.6, z + 0.5);
    const part = this._part, tint = 1 + (tn - 0.5) * 0.2;
    const push = (px, py, pz, c, sway, pv = -1) => {
      P.push(px, py, pz); Cc.push(Math.min(1, c[0]), Math.min(1, c[1]), Math.min(1, c[2]));
      SunA.push(sunV); MoonA.push(moonV); SwayA.push(sway);
      if (part) part.push(pv);
      return P.length / 3 - 1;
    };
    const tri = (centre, a, b, c) => this._tri(P, I, centre, a, b, c);
    const quad = (centre, a, b, c, d) => { this._tri(P, I, centre, a, b, c); this._tri(P, I, centre, a, c, d); };
    // the leaf colour at shade k; warm > 0 leans it yellow (a sunlit leaf), < 0 blue (a shaded one)
    const g = def.top;
    const leaf = (k, warm = 0) => [g[0] * k * tint * (1 + warm), g[1] * k * tint * (1 + warm * 0.25), g[2] * k * tint * (1 - warm)];
    // the kind from where it grows: a slow noise, so a clump shares one kind (as the dome)
    const kn = noise2(x * 0.07 + 31.7, z * 0.07 - 12.3);
    const kind = BERRY_KINDS[Math.min(BERRY_KINDS.length - 1, Math.floor(((kn * 3.7) % 1) * BERRY_KINDS.length))];
    // a box with no bottom: flat faces (its own corners each, so the light is flat), the top where snow may lie
    // (unless snow is false), the sides stepped like a block's (world FACES); the top corners sway by `sway`
    const box = (x0, y0, z0, x1, y1, z1, col, sway, snow = true) => {
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], tv = snow ? 11 : 1;
      quad(c, push(x0, y1, z0, col, sway, tv), push(x1, y1, z0, col, sway, tv), push(x1, y1, z1, col, sway, tv), push(x0, y1, z1, col, sway, tv));
      const side = (ax, az, bx, bz, sh) => {
        const sc = [col[0] * sh, col[1] * sh, col[2] * sh];
        quad(c, push(ax, y0, az, sc, 0, sh), push(bx, y0, bz, sc, 0, sh), push(bx, y1, bz, sc, sway, sh), push(ax, y1, az, sc, sway, sh));
      };
      side(x1, z0, x1, z1, 0.78); side(x0, z1, x0, z0, 0.7); side(x1, z1, x0, z1, 0.68); side(x0, z0, x1, z0, 0.84);
    };
    // a berry: a small cube of eight shared corners, its top in the kind's shine (what shows from above), the rest the
    // berry's colour, darker below; kept in its own colour all year
    const B0 = kind.berry, SH = kind.shine, BD = [B0[0] * 0.62, B0[1] * 0.62, B0[2] * 0.62];
    const BM = [(B0[0] + SH[0]) / 2, (B0[1] + SH[1]) / 2, (B0[2] + SH[2]) / 2];
    const berry = (bx, by, bz, r, sway) => {
      const c = [bx, by, bz];
      const t0 = push(bx - r, by + r, bz - r, SH, sway), t1 = push(bx + r, by + r, bz - r, B0, sway);
      const t2 = push(bx + r, by + r, bz + r, B0, sway), t3 = push(bx - r, by + r, bz + r, B0, sway);
      const b0 = push(bx - r, by - r, bz - r, BD, sway), b1 = push(bx + r, by - r, bz - r, BD, sway);
      const b2 = push(bx + r, by - r, bz + r, BD, sway), b3 = push(bx - r, by - r, bz + r, BD, sway);
      quad(c, t0, t1, t2, t3);
      quad(c, b0, b1, t1, t0); quad(c, b1, b2, t2, t1); quad(c, b2, b3, t3, t2); quad(c, b3, b0, t0, t3);
    };
    // a round berry (an eight-sided diamond, six corners): for the shrub's hanging bunches
    const bead = (bx, by, bz, r, sway) => {
      const c = [bx, by, bz];
      const v = [
        push(bx + r, by, bz, B0, sway), push(bx, by, bz + r, B0, sway), push(bx - r, by, bz, B0, sway), push(bx, by, bz - r, B0, sway),
        push(bx, by + r * 1.1, bz, BM, sway), push(bx, by - r, bz, BD, sway),
      ];
      for (let k = 0; k < 4; k++) { tri(c, v[k], v[(k + 1) % 4], v[4]); tri(c, v[k], v[(k + 1) % 4], v[5]); }
    };
    // spring blossom: a flat pale square with a pink centre lying on a surface, turned by `a`, shown from its share
    // `t` of the season's bloom (sway code 2 + t; out of spring it sinks out of sight)
    const blossom = (bx, by, bz, r, a, t) => {
      const code = 2 + t, pe = BLOSSOM.petal, ey = BLOSSOM.eye, yy = by + 0.02, c = [bx, yy - 1, bz];
      const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
      const m = push(bx, yy + 0.01, bz, ey, code);
      const v0 = push(bx - dx, yy, bz - dz, pe, code), v1 = push(bx - dz, yy, bz + dx, pe, code);
      const v2 = push(bx + dx, yy, bz + dz, pe, code), v3 = push(bx + dz, yy, bz - dx, pe, code);
      tri(c, m, v0, v1); tri(c, m, v1, v2); tri(c, m, v2, v3); tri(c, m, v3, v0);
    };
    // keep a bush of reach R about (cx, cz) out of a higher step of ground (or a wall) beside its cell: it moves back
    // toward the middle and, if it still would not fit, shrinks. Returns [cx, cz, k], k the share of its size kept.
    const W = this.world;
    const fit = (cx, cz, R) => {
      let k = 1;
      if (isOpaque(W.get(x + 1, y, z)) && cx + R > x + 1) { cx = Math.max(x + 0.5, x + 1 - R); k = Math.min(k, (x + 1 - cx) / R); }
      if (isOpaque(W.get(x - 1, y, z)) && cx - R < x) { cx = Math.min(x + 0.5, x + R); k = Math.min(k, (cx - x) / R); }
      if (isOpaque(W.get(x, y, z + 1)) && cz + R > z + 1) { cz = Math.max(z + 0.5, z + 1 - R); k = Math.min(k, (z + 1 - cz) / R); }
      if (isOpaque(W.get(x, y, z - 1)) && cz - R < z) { cz = Math.min(z + 0.5, z + R); k = Math.min(k, (cz - z) / R); }
      return [cx, cz, Math.max(0.6, k)];
    };
    return { push, tri, quad, leaf, kind, box, berry, bead, blossom, fit };
  }

  // (a) blocks: three to six small leaf cubes, like a little tree crown with no trunk: a heart cube on the ground,
  // smaller ones round it, often one on top, in two or three leaf shades. Ripe: nine to thirteen bright berry cubes
  // sitting on and over the edges of the tops. Bare: plain leaves (spring: pale blossom squares on the tops). Snow lies
  // only on the heart and the crown. 20 vertices a leaf cube, 8 a berry, 5 a blossom: measured on seed 2, 178 a ripe
  // bush on average (132 to 224), 120 a bare one (the dome: 77 and 106).
  _bushBlocks(x, y, z, def, K) {
    let s = 0.75 + 0.55 * hash3(x, 13, z), k0;
    let cx = x + 0.5 + (hash3(x, 1, z) - 0.5) * 0.4, cz = z + 0.5 + (hash3(x, 2, z) - 0.5) * 0.4;
    [cx, cz, k0] = K.fit(cx, cz, 0.6 * s); s *= k0;
    const a0 = hash3(x, 3, z) * 6.283, n = 3 + Math.floor(hash3(x, 14, z) * 3.999);
    const SHADES = [[0.92, 0.02], [0.78, -0.03], [1.04, 0.06]];
    const tops = []; // [x0, z0, x1, z1, top y] of each cube
    // snow: only on the heart and the crown, so a snowed-on bush still shows green round its white top
    const cube = (px, pz, hw, hd, y0, h, k, snow) => {
      const [sh, warm] = SHADES[k % 3];
      K.box(px - hw, y + y0, pz - hd, px + hw, y + y0 + h, pz + hd, K.leaf(sh, warm), 0.12, snow);
      tops.push([px - hw, pz - hd, px + hw, pz + hd, y + y0 + h]);
    };
    // the heart
    const hw0 = (0.29 + 0.08 * hash3(x, 15, z)) * s, hgt0 = (0.42 + 0.16 * hash3(x, 16, z)) * s;
    cube(cx, cz, hw0, hw0 * (0.8 + 0.3 * hash3(x, 17, z)), -0.02, hgt0, Math.floor(hash3(x, 18, z) * 3), true);
    for (let k = 1; k < n; k++) {
      const h = hash3(x + k, 19, z), h2 = hash3(x + k, 20, z), h3 = hash3(x + k, 21, z);
      const a = a0 + k * 2.39 + h * 0.6;
      if (k === n - 1 && n >= 4) {
        // a crown cube on top of the heart
        const hw = (0.14 + 0.06 * h2) * s;
        cube(cx + Math.cos(a) * 0.07 * s, cz + Math.sin(a) * 0.07 * s, hw, hw * (0.85 + 0.3 * h3), hgt0 * 0.7, hgt0 * 0.55 + hw, k, true);
      } else {
        const d = (0.24 + 0.12 * h2) * s, hw = (0.17 + 0.09 * h3) * s;
        cube(cx + Math.cos(a) * d, cz + Math.sin(a) * d, hw, hw * (0.8 + 0.4 * h), -0.02, (0.26 + 0.2 * h2) * s, k, false);
      }
    }
    if (def.berries) {
      // many and big enough that a ripe bush shows its colour from the normal height (a signal to the player)
      const nb = 9 + Math.floor(hash3(x, 5, z) * 4.999);
      for (let k = 0; k < nb; k++) {
        const t = tops[(k + Math.floor(hash3(x + k, 22, z) * tops.length)) % tops.length];
        const u = 0.08 + 0.84 * hash3(x + k, 6, z), v = 0.08 + 0.84 * hash3(x + k, 7, z);
        const r = 0.09 + 0.02 * hash3(x + k, 8, z);
        K.berry(t[0] + (t[2] - t[0]) * u, t[4] + r * 0.2, t[1] + (t[3] - t[1]) * v, r, 0.12);
      }
    } else {
      const nb = 5 + Math.floor(hash3(x, 5, z) * 2.999);
      for (let k = 0; k < nb; k++) {
        const t = tops[k % tops.length];
        const u = 0.2 + 0.6 * hash3(x + k, 6, z), v = 0.2 + 0.6 * hash3(x + k, 7, z);
        K.blossom(t[0] + (t[2] - t[0]) * u, t[4], t[1] + (t[3] - t[1]) * v, 0.075, k, 0.55 + 0.4 * hash3(x + k, 9, z));
      }
    }
  }

  // (b) a shrub: three to five leafy clumps of different heights (the middle one tallest), the whole bush leaning a
  // little, a dark shadow on the ground under it to the side away from the sun. Ripe: five to seven bunches of three
  // round berries, most on the clumps' tops, the rest hanging from their sides. Bare: a little thinner, brown twigs
  // poking out of the tops (spring: blossom on them). 19 vertices a clump, 7 the shadow, 6 a berry, 4 a twig, 5 a
  // blossom: measured on seed 2, 191 a ripe bush on average (154 to 228), 129 a bare one.
  _bushShrub(x, y, z, def, K) {
    let s = 0.6 + 0.7 * hash3(x, 13, z), k0;
    let cx = x + 0.5 + (hash3(x, 1, z) - 0.5) * 0.4, cz = z + 0.5 + (hash3(x, 2, z) - 0.5) * 0.4;
    [cx, cz, k0] = K.fit(cx, cz, 0.6 * s); s *= k0;
    const a0 = hash3(x, 3, z) * 6.283, la = hash3(x, 23, z) * 6.283, lk = 0.16 * s * hash3(x, 24, z);
    const lx = Math.cos(la) * lk, lz = Math.sin(la) * lk; // the lean, at the top of a clump
    const bare = !def.berries, n = 3 + Math.floor(hash3(x, 14, z) * 2.999);
    // the shadow: a dark six-sided disc a little off to the side away from the sun (snow-covered, a shaded snow)
    {
      const sx = cx - 0.894 * 0.1 * s, sz = cz - 0.447 * 0.1 * s, sr = 0.5 * s, sc = K.leaf(0.42, -0.05), c = [sx, y - 1, sz];
      const m = K.push(sx, y + 0.015, sz, sc, 0, 10.5);
      const ring = [];
      for (let k = 0; k < 6; k++) { const a = a0 + k * 1.047; ring.push(K.push(sx + Math.cos(a) * sr * (0.85 + 0.25 * hash3(x + k, 25, z)), y + 0.012, sz + Math.sin(a) * sr * (0.85 + 0.25 * hash3(x + k, 25, z)), sc, 0, 10.62)); }
      for (let k = 0; k < 6; k++) K.tri(c, m, ring[k], ring[(k + 1) % 6]);
    }
    const SHADES = [[1.04, 0.04], [0.86, -0.04], [1.18, 0.08]];
    const lobes = []; // [x, z, r, h]
    for (let k = 0; k < n; k++) {
      const h = hash3(x + k, 19, z), h2 = hash3(x + k, 20, z), h3 = hash3(x + k, 21, z);
      const a = a0 + k * 2.2 + h * 0.5;
      const d = k === 0 ? 0.04 * s : (0.17 + 0.11 * h2) * s;
      let r = (k === 0 ? 0.29 : 0.2 + 0.08 * h3) * s, hh = (k === 0 ? 0.6 + 0.12 * h : 0.32 + 0.24 * h) * s;
      if (bare) r *= 0.9;
      const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d;
      lobes.push([px, pz, r, hh]);
      const [sh, warm] = SHADES[(k + Math.floor(h2 * 3)) % 3];
      // rings [radius, height, shade, sway, snow]
      const RINGS = [[0.72, 0, 0.6, 0, 0], [1, 0.45, 0.86, 0.08, 0], [0.7, 0.8, 1, 0.15, 10]];
      const centre = [px + lx * 0.45, y + hh * 0.45, pz + lz * 0.45];
      const rows = [], ar = a + h3;
      for (let j = 0; j < 3; j++) {
        const [rf, hf, rs, sw, snow] = RINGS[j], row = [];
        for (let q = 0; q < 6; q++) {
          const aa = ar + q * 1.047, rr = r * rf * (0.82 + 0.36 * hash3(x + q * 7 + k, 26 + j, z));
          const kk = rs * (0.94 + 0.12 * hash3(x + q, 27 + j, z + k));
          row.push(K.push(px + Math.cos(aa) * rr + lx * hf, y + hh * hf, pz + Math.sin(aa) * rr + lz * hf, K.leaf(sh * kk, warm), sw, snow + kk));
        }
        rows.push(row);
      }
      const top = K.push(px + lx, y + hh, pz + lz, K.leaf(sh * 1.1, warm + 0.03), 0.18, 11.1);
      for (let j = 0; j < 2; j++) for (let q = 0; q < 6; q++) K.quad(centre, rows[j][q], rows[j][(q + 1) % 6], rows[j + 1][(q + 1) % 6], rows[j + 1][q]);
      for (let q = 0; q < 6; q++) K.tri(centre, rows[2][q], rows[2][(q + 1) % 6], top);
    }
    // a point on clump k's surface: f 0 (the top) to 1 (its widest), turned to a
    const onLobe = (k, a, f) => {
      const [px, pz, r, hh] = lobes[k % lobes.length], hf = 1 - 0.55 * f, rr = r * (0.15 + 0.85 * f);
      return [px + Math.cos(a) * rr + lx * hf, y + hh * hf, pz + Math.sin(a) * rr + lz * hf];
    };
    if (!bare) {
      // most bunches on the tops, where the god's eye falls; the rest hanging from the sides
      const nc = 5 + Math.floor(hash3(x, 5, z) * 2.999);
      for (let k = 0; k < nc; k++) {
        const a = a0 + k * 2.4 + hash3(x + k, 6, z) * 0.8, f = k < 4 ? 0.2 + 0.4 * hash3(x + k, 7, z) : 0.75 + 0.2 * hash3(x + k, 7, z);
        const [bx, by, bz] = onLobe(k, a, f), r = 0.075 + 0.015 * hash3(x + k, 8, z);
        // a bunch: three berries, the third hanging lower
        const ox = Math.cos(a + 1.57) * r * 1.2, oz = Math.sin(a + 1.57) * r * 1.2, px = Math.cos(a) * r * 0.6, pz = Math.sin(a) * r * 0.6;
        K.bead(bx + ox + px, by + r * 0.5, bz + oz + pz, r, 0.15);
        K.bead(bx - ox + px, by + r * 0.5, bz - oz + pz, r, 0.15);
        K.bead(bx + px * 2, by - r * 0.9, bz + pz * 2, r, 0.15);
      }
    } else {
      // twigs: thin brown cards leaning out of the tops (kept brown all year)
      const TW = [0.42, 0.31, 0.2], TT = [0.55, 0.42, 0.3];
      for (let k = 0; k < Math.min(4, lobes.length + 1); k++) {
        const [px, pz, , hh] = lobes[k % lobes.length], a = a0 + k * 1.9 + hash3(x + k, 28, z);
        const bx = px + lx * 0.8, by = y + hh * 0.8, bz = pz + lz * 0.8, len = (0.2 + 0.1 * hash3(x + k, 29, z)) * s;
        const ex = bx + Math.cos(a) * len * 0.75, ey = by + len * 0.7, ez = bz + Math.sin(a) * len * 0.75;
        const wx = -Math.sin(a) * 0.022, wz = Math.cos(a) * 0.022;
        const c = [bx, by - 1, bz];
        K.quad(c, K.push(bx - wx, by, bz - wz, TW, 0.15), K.push(bx + wx, by, bz + wz, TW, 0.15), K.push(ex + wx * 0.5, ey, ez + wz * 0.5, TT, 0.2), K.push(ex - wx * 0.5, ey, ez - wz * 0.5, TT, 0.2));
      }
      const nb = 5 + Math.floor(hash3(x, 5, z) * 2.999);
      for (let k = 0; k < nb; k++) {
        const a = a0 + k * 2.4 + hash3(x + k, 6, z) * 0.6, [bx, by, bz] = onLobe(k, a, 0.15 + 0.6 * hash3(x + k, 7, z));
        K.blossom(bx, by, bz, 0.075, k, 0.55 + 0.4 * hash3(x + k, 9, z));
      }
    }
  }

  // (c) a thicket: the clump drawn as one low, lumpy bramble patch. Each bush cell is a 4 x 4 net of corners at
  // thirds of the cell, its height from where the corner is in the world, so neighbouring bush cells meet with no
  // seam; where the patch ends (a side or corner without a bush beyond it) the edge drops to the ground and pulls in
  // by a ragged amount, so the patch has an uneven outline, not a square one. A few thorny sprigs stand out of it.
  // Ripe: six to eight berry cubes scattered over each cell. Bare: plain (spring: blossom). 16 vertices the patch,
  // 5 a sprig, 8 a berry, 5 a blossom: measured on seed 2, 81 a ripe cell on average (48 to 100), 52 a bare one.
  _bushThicket(x, y, z, def, K) {
    const W = this.world;
    const isB = (xx, zz) => { const v = W.get(xx, y, zz); return v === B.SHRUB_BERRY || v === B.BERRY_BARE; };
    const nb = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nb.push(dx || dz ? isB(x + dx, z + dz) : true);
    const has = (dx, dz) => nb[(dz + 1) * 3 + dx + 1];
    const SIDE = [[-1, 0], [0], [0], [0, 1]]; // the cells a corner at 0..3 thirds touches, one way
    const pts = [], hy = [];
    const centre = [x + 0.5, y - 1, z + 0.5];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      let inside = true;
      for (const dz of SIDE[j]) for (const dx of SIDE[i]) if (!has(dx, dz)) inside = false;
      const gx = x * 3 + i, gz = z * 3 + j; // the corner in the world, in thirds (the same from every cell it touches)
      let px = gx / 3, pz = gz / 3, py, sh;
      if (inside) {
        if (i > 0 && i < 3) px += (hash3(gx, 41, gz) - 0.5) * 0.22;
        if (j > 0 && j < 3) pz += (hash3(gx, 42, gz) - 0.5) * 0.22;
        const hh = hash3(gx, 47, gz);
        py = y + 0.28 + 0.34 * hh; sh = 0.8 + 0.34 * hh;
      } else {
        const pull = 0.08 + 0.4 * hash3(gx * 7 + x, 43, gz * 5 + z);
        px += (x + 0.5 - px) * pull; pz += (z + 0.5 - pz) * pull;
        py = y + 0.03; sh = 0.52;
      }
      const dark = hash3(gx, 48, gz) < 0.3;
      pts.push(K.push(px, py, pz, K.leaf(sh * (dark ? 0.86 : 1), dark ? -0.04 : 0.04), inside ? 0.1 : 0, 10 + sh));
      hy.push([px, py, pz]);
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const a = pts[j * 4 + i], b = pts[j * 4 + i + 1], c = pts[(j + 1) * 4 + i + 1], d = pts[(j + 1) * 4 + i];
      // split each little square along the diagonal that keeps its bumps
      if (Math.abs(hy[j * 4 + i][1] - hy[(j + 1) * 4 + i + 1][1]) > Math.abs(hy[j * 4 + i + 1][1] - hy[(j + 1) * 4 + i][1])) K.quad(centre, b, c, d, a);
      else K.quad(centre, a, b, c, d);
    }
    // a point on the patch: the middle of little square (i, j), a little way across it
    const onPatch = (i, j, u, v) => {
      const p = (ii, jj) => hy[jj * 4 + ii];
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      const lerp = (k) => (a[k] * (1 - u) + b[k] * u) * (1 - v) + (d[k] * (1 - u) + c[k] * u) * v;
      return [lerp(0), lerp(1), lerp(2)];
    };
    // thorny sprigs: thin four-sided spikes leaning out of the patch, dark at the foot, light at the tip (no snow on
    // them, so a snowed-on thicket still shows)
    const ns = 2 + Math.floor(hash3(x, 30, z) * 2.999);
    for (let k = 0; k < ns; k++) {
      const i = Math.floor(hash3(x + k, 31, z) * 2.999), j = Math.floor(hash3(x + k, 32, z) * 2.999);
      const [bx, by, bz] = onPatch(i, j, 0.3 + 0.4 * hash3(x + k, 33, z), 0.3 + 0.4 * hash3(x + k, 34, z));
      if (by < y + 0.15) continue;
      const a = hash3(x + k, 35, z) * 6.283, hgt = 0.16 + 0.12 * hash3(x + k, 36, z), r = 0.055, c = [bx, by + hgt * 0.3, bz];
      const foot = K.leaf(0.7, -0.04), tipC = K.leaf(1.2, 0.08);
      const v = [];
      for (let q = 0; q < 4; q++) v.push(K.push(bx + Math.cos(a + q * 1.571) * r, by - 0.03, bz + Math.sin(a + q * 1.571) * r, foot, 0.1, 0.7));
      const tip = K.push(bx + Math.cos(a) * hgt * 0.4, by + hgt, bz + Math.sin(a) * hgt * 0.4, tipC, 0.25, 1.2);
      for (let q = 0; q < 4; q++) K.tri(c, v[q], v[(q + 1) % 4], tip);
    }
    const n = (def.berries ? 6 : 4) + Math.floor(hash3(x, 5, z) * 2.999);
    for (let k = 0; k < n; k++) {
      const i = Math.floor(hash3(x + k, 37, z) * 2.999), j = Math.floor(hash3(x + k, 38, z) * 2.999);
      const [bx, by, bz] = onPatch(i, j, 0.15 + 0.7 * hash3(x + k, 6, z), 0.15 + 0.7 * hash3(x + k, 7, z));
      if (by < y + 0.12) continue;
      if (def.berries) K.berry(bx, by + 0.03, bz, 0.085 + 0.02 * hash3(x + k, 8, z), 0.1);
      else K.blossom(bx, by, bz, 0.08, k, 0.55 + 0.4 * hash3(x + k, 9, z));
    }
  }

  // Flowers that face the sky: two or three flowers to a block, each a short upright stem with a flat star-shaped
  // head lying level at its top in the petal colour, round a small centre in the eye colour, so the colour shows from
  // the god's camera (the old crossed cards were edge-on from above). Each flower also has a small seed head, shown
  // only in autumn. Each head has its own share of the season's bloom, so spring shows them all and summer a third.
  emitFlower(x, y, z, def, tn, P, Cc, I, SunA, SwayA, sunAt, MoonA, moonAt) {
    const sunV = sunAt(x + 0.5, y + 0.5, z + 0.5), moonV = moonAt(x + 0.5, y + 0.5, z + 0.5);
    const tint = 1 + (tn - 0.5) * 0.2, part = this._part;
    // pv (buildChunk): 0 a stem, which takes the season's colour; -1 a head or seed head, kept in its own colour
    const push = (px, py, pz, c, sway, pv = -1) => {
      P.push(px, py, pz); Cc.push(Math.min(1, c[0]), Math.min(1, c[1]), Math.min(1, c[2]));
      SunA.push(sunV); MoonA.push(moonV); SwayA.push(sway);
      if (part) part.push(pv);
      return P.length / 3 - 1;
    };
    const stemC = [def.top[0] * 0.8 * tint, def.top[1] * 0.8 * tint, def.top[2] * 0.8 * tint];
    const tipC = [def.top[0] * 1.05 * tint, def.top[1] * 1.05 * tint, def.top[2] * 1.05 * tint];
    const SEED = [0.66, 0.56, 0.38];
    const n = 2 + (hash3(x, 4, z) < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const fx = x + 0.2 + 0.6 * hash3(x + k, 1, z), fz = z + 0.2 + 0.6 * hash3(x, 2, z + k);
      const hh = 0.26 + 0.18 * hash3(x + k, 3, z), ang = hash3(x + k, 4, z) * 3.14;
      const th = hash3(x + k * 13, 5, z * 7 + k) * 0.999, th2 = hash3(x + k * 5, 6, z + k * 3) * 0.999;
      const c = [fx, y + hh - 1, fz];
      // the stem: one thin upright card (the old card, narrow), root still, tip swaying
      const sx = Math.cos(ang) * 0.06, sz = Math.sin(ang) * 0.06;
      const s0 = push(fx - sx, y, fz - sz, stemC, 6, 0), s1 = push(fx + sx, y, fz + sz, stemC, 6, 0);
      const s2 = push(fx + sx * 0.4, y + hh, fz + sz * 0.4, tipC, 7, 0), s3 = push(fx - sx * 0.4, y + hh, fz - sz * 0.4, tipC, 7, 0);
      I.push(s0, s1, s2, s0, s2, s3);
      // the head: two squares turned against each other (an eight-point star), level, facing up
      const r = 0.15 + 0.05 * hash3(x + k, 7, z), hy = y + hh;
      for (let q = 0; q < 2; q++) {
        const a = ang + q * 0.785, dx = Math.cos(a) * r, dz = Math.sin(a) * r;
        const v0 = push(fx - dx, hy, fz - dz, def.head, 2 + th), v1 = push(fx - dz, hy, fz + dx, def.head, 2 + th);
        const v2 = push(fx + dx, hy, fz + dz, def.head, 2 + th), v3 = push(fx + dz, hy, fz - dx, def.head, 2 + th);
        this._tri(P, I, c, v0, v1, v2); this._tri(P, I, c, v0, v2, v3);
      }
      const e = 0.055, ey = hy + 0.012;
      const e0 = push(fx - e, ey, fz - e, def.eye, 2 + th), e1 = push(fx + e, ey, fz - e, def.eye, 2 + th);
      const e2 = push(fx + e, ey, fz + e, def.eye, 2 + th), e3 = push(fx - e, ey, fz + e, def.eye, 2 + th);
      this._tri(P, I, c, e0, e1, e2); this._tri(P, I, c, e0, e2, e3);
      // the seed head (autumn): a small dun knob where the head was
      const d = 0.06, dy = hy + 0.02;
      const d0 = push(fx - d, dy, fz, SEED, 4 + th2), d1 = push(fx, dy, fz - d, SEED, 4 + th2), d2 = push(fx + d, dy, fz, SEED, 4 + th2);
      const d3 = push(fx, dy, fz + d, SEED, 4 + th2), d4 = push(fx, dy + d, fz, [SEED[0] * 1.15, SEED[1] * 1.15, SEED[2] * 1.15], 4 + th2);
      for (const [p, q] of [[d0, d1], [d1, d2], [d2, d3], [d3, d0]]) this._tri(P, I, [fx, dy - 1, fz], p, q, d4);
    }
  }

  makeMesh(pos, col, idx, mat, uv = null, sun = null, sway = null, moon = null, season = null) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (sun) g.setAttribute('sun', new THREE.Float32BufferAttribute(sun, 1));
    if (sway) g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
    if (moon) g.setAttribute('moon', new THREE.Float32BufferAttribute(moon, 1));
    if (season?.length) g.setAttribute('season', new THREE.Float32BufferAttribute(season, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = true;
    // a chunk never moves: its matrix is worked out once, not every frame (with ~1,000 chunk meshes this was a
    // visible share of each frame on a slowed phone CPU, found while making walking smooth, view/walk.js)
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    // flags only; they cost nothing until the renderer turns its shadow map
    // on (engine/renderer.js setRich)
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
}
