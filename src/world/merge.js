// Fold static part-meshes into a single draw call.
//
// Ported unchanged in logic from the source repo's world/merge.js.
//
// Characters and props are authored as one small Mesh per part, each with its
// own solid-colour material. That is lovely to author and expensive to draw:
// in the source game 11 characters and 21 props were 330 of ~490 renderables
// while carrying 6% of the triangles, and GPU drivers bill per draw call.
//
// Folding bakes each part's material colour into vertex colours and welds the
// geometries into one, drawn with a single shared vertex-coloured material,
// the same technique world/mesher.js uses for terrain.
//
// Anything the game ANIMATES OR MOVES must stay out of the fold: pass it in
// `keep`, or never fold its root. A folded part loses its own transform, so a
// mesh that is rotated, scaled or moved per frame has to stay a separate
// object. Fold a building once it is finished; never fold a person.
//
// Hand-rolled rather than vendoring BufferGeometryUtils (36 KB for one
// function). Attributes are normalised to position/normal/colour first, which
// makes the weld below trivial.
import * as THREE from '../../vendor/three.module.js';
import { enhance } from './shade.js';

// One material for every folded mesh in the game: never dispose it. Enhanced
// so folded props share the world's edge mist and cloud shadows.
export const MERGED_MAT = enhance(new THREE.MeshLambertMaterial({ vertexColors: true }), { linearColors: true });
// The same look for people and animals (sim/bodies.js), plus a small night lift (shade.js USE_FIGURE): at
// night they keep more of their colour and catch a little extra moonlight, so they stay easy to find.
// Identical to MERGED_MAT by day.
export const FIGURE_MAT = enhance(new THREE.MeshLambertMaterial({ vertexColors: true }), { linearColors: true, figure: true });

const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();

// Fold only opaque, untextured, front-side Lambert meshes with indexed
// geometry. Everything else keeps its own call, which is correct — those
// differ in more than colour: flames and embers are MeshBasicMaterial, reeds
// and butterfly wings are DoubleSide, blob shadows are transparent, and
// painted blocks ride the atlas pass.
function foldable(o) {
  if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return false;
  const m = o.material;
  return !!m.isMeshLambertMaterial && !m.map && !m.transparent && m.opacity === 1 &&
    m.side === THREE.FrontSide && !!o.geometry.attributes.position;
}

// Clone into merge-ready form (position + normal + colour, indexed) expressed
// in `root` space. The SOURCE geometry is never touched: builders may
// share cached geometries between instances, so mutating one would corrupt
// every other character using that same box size.
function bake(mesh, matrix) {
  const g = mesh.geometry.clone();
  if (matrix) g.applyMatrix4(matrix); // rotates the normals too
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  // Some primitives arrive unindexed — IcosahedronGeometry and the rest of the
  // PolyhedronGeometry family, which is what boulders and foliage blobs are
  // built from. Give them a trivial sequential index so the weld below can
  // treat every contributor the same way.
  if (!g.index) {
    const seq = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) seq[i] = i;
    g.setIndex(new THREE.BufferAttribute(seq, 1));
  }
  const c = mesh.material.color; // already in the linear working space, as vertex colours are
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Weld pre-baked geometries (identical attribute set, all indexed) into one.
function weld(geos) {
  let verts = 0, idxCount = 0;
  for (const g of geos) { verts += g.attributes.position.count; idxCount += g.index.count; }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const index = verts > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

/**
 * Fold `root`'s static foldable descendants into one mesh.
 *
 * If `root` is itself a foldable Mesh, its own geometry joins the weld and the
 * result is written back onto it, so the part keeps its identity and its
 * animation (a head still rotates; it just draws its eyes, brow and hair in the
 * same call). If `root` is a Group, the weld is added as a single new child.
 *
 * Children in `keep` are skipped entirely, as are non-Mesh children — a plain
 * Group may itself be animated (a door or lid pivot), and there is
 * no way to tell from here, so sub-groups are left for the caller to fold
 * explicitly.
 *
 * @returns {number} how many draw calls were removed
 */
export function foldStatic(root, keep = []) {
  if (!root) return 0;
  const kept = new Set(keep);
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();

  const geos = [];
  const drop = [];
  const rootFolds = foldable(root);
  if (rootFolds) geos.push(bake(root, null));

  (function walk(node) {
    for (const child of node.children) {
      if (kept.has(child) || !foldable(child)) continue;
      geos.push(bake(child, _rel.multiplyMatrices(_inv, child.matrixWorld)));
      drop.push(child);
      walk(child); // absorb its own static descendants as well
    }
  })(root);

  if (geos.length < 2) { for (const g of geos) g.dispose(); return 0; }

  const merged = weld(geos);
  for (const g of geos) g.dispose();
  for (const child of drop) child.removeFromParent();

  if (rootFolds) {
    // the outgoing geometry is a SHARED cache entry — swap the reference,
    // never dispose it
    root.geometry = merged;
    root.material = MERGED_MAT;
    root.castShadow = true;
    root.receiveShadow = true;
  } else {
    const m = new THREE.Mesh(merged, MERGED_MAT);
    m.name = `${root.name || 'static'}:folded`;
    // flags only: free until the Rich tier turns the shadow map on
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  return drop.length;
}
