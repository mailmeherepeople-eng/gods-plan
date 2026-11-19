// The highlight on a selected thing that is not an entity (a tree, a water
// body, a clump of bushes, a patch of rock, a cell of ground): a translucent
// gold fill plus gold edge lines, drawn over everything (no depth test), in the
// HUD's own objects inside the overlay group, so it never fights the god's
// lines. Blocks (trees, bushes): every face open to the air. Cells (water,
// rock, ground): the patch's top, just above its surface, and its rim.
export function makeOutline(U) {
  const { ctx } = U;
  const THREE = ctx.THREE;
  const lineGeo = new THREE.BufferGeometry(), fillGeo = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  lines.renderOrder = 65; fill.renderOrder = 64;
  for (const o of [lines, fill]) { o.frustumCulled = false; o.visible = false; o.userData.noPick = true; }
  try { ctx.overlay.group.add(fill, lines); } catch (err) { U.warnOnce('outline', err); }

  // a quad: its four edges into L, two triangles into F
  const quad = (L, F, a, b, c, d) => { L.push(...a, ...b, ...b, ...c, ...c, ...d, ...d, ...a); F.push(...a, ...b, ...c, ...a, ...c, ...d); };
  function blockFaces(blocks, L, F) {
    const set = new Set(blocks.map(([x, y, z]) => `${x},${y},${z}`));
    const has = (x, y, z) => set.has(`${x},${y},${z}`);
    for (const [x, y, z] of blocks) {
      const X = x + 1, Y = y + 1, Z = z + 1;
      if (!has(x, y + 1, z)) quad(L, F, [x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z]);
      if (!has(x, y - 1, z)) quad(L, F, [x, y, z], [X, y, z], [X, y, Z], [x, y, Z]);
      if (!has(x + 1, y, z)) quad(L, F, [X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z]);
      if (!has(x - 1, y, z)) quad(L, F, [x, y, z], [x, Y, z], [x, Y, Z], [x, y, Z]);
      if (!has(x, y, z + 1)) quad(L, F, [x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]);
      if (!has(x, y, z - 1)) quad(L, F, [x, y, z], [X, y, z], [X, Y, z], [x, Y, z]);
    }
  }
  function cellPatch(cells, yOf, L, F) {
    const set = new Set(cells.map(([x, z]) => `${x},${z}`));
    const has = (x, z) => set.has(`${x},${z}`);
    for (const [x, z] of cells) {
      const y = yOf(x, z);
      F.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z, x + 1, y, z + 1, x, y, z + 1);
      if (!has(x, z - 1)) L.push(x, y, z, x + 1, y, z);
      if (!has(x, z + 1)) L.push(x, y, z + 1, x + 1, y, z + 1);
      if (!has(x - 1, z)) L.push(x, y, z, x, y, z + 1);
      if (!has(x + 1, z)) L.push(x + 1, y, z, x + 1, y, z + 1);
    }
  }
  const O = {};
  O.show = (t) => {
    const L = [], F = [];
    if (t?.blocks?.length) blockFaces(t.blocks, L, F);
    else if (t?.cells?.length) {
      const level = t.kind === 'water' ? t.level + 1.02 : null;
      cellPatch(t.cells, (x, z) => level ?? (ctx.vox.groundTop(x, z) + 1.04), L, F);
    }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
    fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(F, 3));
    lineGeo.computeBoundingSphere(); fillGeo.computeBoundingSphere();
    lines.visible = fill.visible = L.length > 0 || F.length > 0;
  };
  O.clear = () => { lines.visible = fill.visible = false; };
  return O;
}
