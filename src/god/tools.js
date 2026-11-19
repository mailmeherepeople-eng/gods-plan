// The god's tools, laid out as the World Planner lays them (source repo dev/planner/planner.js keys, tools.js
// options bar): a letter arms a tool (back on its last mode), the number keys 1 to 9 pick the mode inside it.
// Options live in option sets (FAMILIES: land, cave, river, lake, paint, scatter, animals ...), as the planner's
// T.opts did.
// Omnipotence (the director, 2026-11-15: "Reshape should be renamed to Omnipotence. Omnipotence has 4 things. Land,
// Water, Life, Erase.", then his tree, below at NODES and COLUMNS). Path keeps its code but has no button and no key.
// The power Strike Z lives in the HUD's Powers row.
// Every Omnipotence tool previews first (pending.js): strokes add up as a see-through ghost and only the tick (Enter)
// makes them real. None of these is a camera key (Q E T W A S D, arrows, Home, wheel, right and middle drag).
// docs/GOD-TOOLS.md has the whole table.
import { B } from '../world/blocks.js';

const BOTH = ['creation', 'running'];
const range = (label, min, max, step, value, hint) => ({ type: 'range', label, min, max, step, value, hint });
const bool = (label, value, hint) => ({ type: 'bool', label, value, hint });

// what every Omnipotence tool's hint ends with: the preview, and how it is kept or dropped
export const PENDING_HINT = 'You see the change first, see-through. The tick (Enter) keeps it; the cross (Esc) drops it. Picking another tool, or putting this one down, drops it too.';

// the fish among them (sim/fish.js): they go in water, never on land
export const FISH_KINDS = ['minnow', 'trout', 'pike', 'catfish'];

// family: { id, name, key (label), code (ev.code), options: { name: spec } }
export const FAMILIES = [
  { id: 'land', name: 'Land', key: 'B', code: 'KeyB', hint: `Raise, lower or flatten the ground with the brush. ${PENDING_HINT}`, options: {
    size: range('Size', 1, 14, 1, 4, 'How wide the brush is. Large for hills and fields, small for cliffs and pits.'),
    strength: range('Strength', 1, 10, 1, 3, 'How fast it works and how hard its edge is: low gives soft, rounded slopes; high gives sheer cliffs.'),
  } },
  { id: 'cave', name: 'Cave', key: 'Y', code: 'KeyY', hint: `Tap a hillside where the mouth should be: the cave shows as a ghost. Turn it, then the tick carves it; the cross drops it. Ctrl+click a cave to close it.`, options: {
    room: range('Room', 1, 3, 1, 1, 'How many households the cave holds: 1 for a family, more for kin who share. A bigger cave needs a bigger hill.'),
  } },
  { id: 'paint', name: 'Paint', key: 'P', code: 'KeyP', hint: 'Hold and move to paint the ground.', options: {
    size: range('Size', 0.5, 12, 0.5, 3), soft: bool('Soft edge', false, 'Ragged, dithered edges instead of a hard circle'),
  } },
  { id: 'river', name: 'River', key: 'U', code: 'KeyU', hint: `Drag along the ground to paint a river. Its water steps down as it goes, never up. ${PENDING_HINT}`, options: {
    size: range('Size', 2, 12, 1, 5, 'How wide the river is.'),
    banks: bool('Sand banks', true, 'A sand bed, sand banks a block above the water, the ground eased down to it, reeds here and there. Off: a plain channel of water.'),
  } },
  { id: 'lake', name: 'Lake', key: null, code: null, hint: `Tap the ground: a bowl is dug there and filled with water. ${PENDING_HINT}`, options: {
    size: range('Size', 6, 28, 2, 12, 'How wide the lake is, shore to shore.'),
    depth: range('Depth', 1, 6, 1, 3, 'How deep the water is in the middle.'),
  } },
  { id: 'scatter', name: 'Scatter', key: 'J', code: 'KeyJ', hint: 'Hold and move to scatter.', options: {
    size: range('Size', 2, 20, 1, 8), density: range('Density', 0.05, 1, 0.05, 0.4),
  } },
  { id: 'erase', name: 'Erase', key: 'X', code: 'KeyX', hint: `Brush over anything to clear it: trees, bushes, reeds, water (back to dry ground), painted ground (back to grass), animals you placed, and empty caves you carved. People, lived-in homes, fields while time runs and the standing stone are never taken. ${PENDING_HINT}`, options: {
    size: range('Size', 1, 16, 1, 4),
  } },
  { id: 'path', name: 'Path', key: 'L', code: 'KeyL', hint: 'Click along the way; double-click or Enter lays it. Click a laid path to select it, Del takes it up.', options: {
    width: range('Width', 1, 5, 1, 2, 'How many blocks wide'),
    steps: bool('Cut steps', false, 'Cut and fill along the path so no step is more than one block (what a walker can climb). Off: the path lies on the ground as it is.'),
  } },
  { id: 'animals', name: 'Animals', key: 'N', code: 'KeyN', hint: `Tap to place an animal; hold and move to place several. ${PENDING_HINT}`, options: {
    count: range('At each click', 1, 6, 1, 1, 'How many come at each click (a small herd or flock)'),
    spacing: range('Spacing', 2, 12, 1, 4, 'How far apart they are placed when you hold and move'),
  } },
  { id: 'power', name: 'Powers', key: 'Z', code: 'KeyZ', hint: 'Click an animal to strike it down; press and hold on a person.', options: {} },
];
export const FAMILY = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

// ---------- the Omnipotence tree (the director's drawing, 2026-11-15: "change everything to be like this from now
// on. we follow this." Why: "there are too many options and the screen is crowding too much. so had to streamline
// everything.") ----------
// Every level works the same way: tapping a group shows its children; picking a child puts it in the group's place
// and shows its own children, down to the tools. A COLUMN is a node whose children are tools: that is what is in
// hand, its tools shown as chips beside the door (`chips`: even one tool shows as a chip, already armed, so more can
// join it later). A NODE is a group of nodes or columns. The HUD (ui/doors.js) is drawn from this and names no tool.
//   Omnipotence
//     Land:  Reshape (Raise, Lower, Flatten) | Terrain: Fertile (Grass, Farmland), Non fertile (Dry grass, Dirt, Sand,
//            Rock), Frozen (Snow, Ice) | Structures (Cave)
//     Water: River | Lake                       (Rain is on the drawing: not built yet)
//     Life:  Plants: Bushes (Bushes, Berry bushes, Reeds, Flowers), Trees (Palm, Mix, Banyan)
//            Animals: Sky (Birds), Water (Minnows, Trout, Pike, Catfish: 2026-11-16), Land: Herbivore (Deer, Rabbit), Carnivore (Wolf)
//     Erase  (set apart; it takes water away too)
// Left the menu (their ids still work for scripts, `hidden`): Dark rock, Stone, Trodden earth, Farmland + crop; the
// Tall, Round and Flat-top trees.
// key: a letter that arms the column (or the last column used inside the node) directly, on its last mode
export const COLUMNS = [
  { id: 'shape', name: 'Reshape', key: 'B', code: 'KeyB', modes: ['raise', 'lower', 'flatten'], hint: FAMILY.land.hint },
  { id: 'fertile', name: 'Fertile', modes: ['grass', 'farmland'], hint: `Ground things grow on. ${PENDING_HINT}` },
  { id: 'barren', name: 'Non fertile', modes: ['drygrass', 'dirt', 'sand', 'rock'], hint: `Ground nothing is sown on. ${PENDING_HINT}` },
  { id: 'frozen', name: 'Frozen', modes: ['snow', 'ice'], hint: `Snow and ice. ${PENDING_HINT}` },
  { id: 'structures', name: 'Structures', key: 'Y', code: 'KeyY', modes: ['cave'], chips: true, hint: FAMILY.cave.hint },
  { id: 'river', name: 'River', key: 'U', code: 'KeyU', modes: ['river'], hint: FAMILY.river.hint },
  { id: 'lake', name: 'Lake', modes: ['lake'], hint: FAMILY.lake.hint },
  { id: 'bushes', name: 'Bushes', modes: ['bushes', 'berries', 'reeds', 'flowers'], hint: `Hold and move to grow them in clumps. ${PENDING_HINT}` },
  { id: 'trees', name: 'Trees', modes: ['tree.palm', 'trees', 'tree.wide'], hint: `Hold and move to grow trees. ${PENDING_HINT}` },
  { id: 'sky', name: 'Sky', modes: ['animal.bird'], chips: true, hint: FAMILY.animals.hint },
  { id: 'swim', name: 'Water', modes: FISH_KINDS.map((k) => `animal.${k}`), hint: `Tap the water to put fish in; hold and move to put in more. Each kind keeps to its own water: minnows the shallows, trout running water, pike the reeds, catfish deep water. ${PENDING_HINT}` },
  { id: 'herbivore', name: 'Herbivore', modes: ['animal.deer', 'animal.rabbit'], hint: FAMILY.animals.hint },
  { id: 'carnivore', name: 'Carnivore', modes: ['animal.wolf'], chips: true, hint: FAMILY.animals.hint },
  { id: 'erase', name: 'Erase', key: 'X', code: 'KeyX', modes: ['erase'], apart: true, hint: FAMILY.erase.hint },
  { id: 'path', name: 'Path', modes: [], hidden: true, hint: FAMILY.path.hint },
  { id: 'power', name: 'Powers', key: 'Z', code: 'KeyZ', modes: [], from: ['power'], dock: true, hint: FAMILY.power.hint },
];
export const COLUMN = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));
// the groups: their children (nodes or columns), in the row's order
export const NODES = {
  omni: { id: 'omni', name: 'Omnipotence', kids: ['land', 'water', 'life', 'erase'] },
  land: { id: 'land', name: 'Land', kids: ['shape', 'terrain', 'structures'], hint: 'Reshape the ground, paint it, or build a structure.' },
  terrain: { id: 'terrain', name: 'Terrain', key: 'P', code: 'KeyP', kids: ['fertile', 'barren', 'frozen'], hint: 'Paint the ground: fertile, non fertile, or frozen.' },
  water: { id: 'water', name: 'Water', kids: ['river', 'lake'], hint: 'Paint a river, or dig and fill a lake.' },
  life: { id: 'life', name: 'Life', kids: ['plants', 'animals'], hint: 'Grow plants, or place animals.' },
  plants: { id: 'plants', name: 'Plants', key: 'V', code: 'KeyV', kids: ['bushes', 'trees'], hint: 'Bushes, reeds and flowers, or trees.' },
  animals: { id: 'animals', name: 'Animals', key: 'N', code: 'KeyN', kids: ['sky', 'swim', 'fauna'], hint: 'Birds, fish in the water, or animals of the land.' },
  fauna: { id: 'fauna', name: 'Land', kids: ['herbivore', 'carnivore'], hint: 'Animals that eat plants, or that hunt.' },
};
export const ROOT = 'omni';
// every node's and column's parent (the way up for Back)
export const PARENT = {};
for (const n of Object.values(NODES)) for (const k of n.kids) PARENT[k] = n.id;
// the way down from the top to a column or node: [land, terrain, frozen]
export const PATH_TO = (id) => { const out = []; for (let k = id; k && k !== ROOT; k = PARENT[k]) out.unshift(k); return out; };
// a letter: a column or a node (the node arms the column last used inside it)
export const KEY_BY_CODE = Object.fromEntries([...COLUMNS, ...Object.values(NODES)].filter((c) => c.code).map((c) => [c.code, c.id]));

// the ground paints (the planner's SURFACES, kept to blocks this game has); those not on the tree have no button
export const SURFACES = [
  ['grass', 'Grass', B.GRASS], ['dirt', 'Dirt', B.DIRT], ['sand', 'Sand', B.SAND], ['rock', 'Rock', B.ROCK],
  ['drygrass', 'Dry grass', B.GRASS_DRY], ['darkrock', 'Dark rock', B.ROCK_DARK], ['stone', 'Stone', B.STONE], ['earth', 'Trodden earth', B.PATH],
  ['farmland', 'Farmland', B.FARMLAND], ['crop', 'Farmland + crop', -1], ['snow', 'Snow', B.SNOWGRASS], ['ice', 'Ice', B.ICE],
];
// path surfaces (the planner's PATH_KINDS came from the history game's own builders; these are this game's blocks)
export const PATH_KINDS = {
  earth: { label: 'Trodden earth', block: B.PATH, stamp: 'line' },
  trail: { label: 'Broken trail', block: B.PATH, stamp: 'trail' },
  dirt: { label: 'Bare dirt', block: B.DIRT, stamp: 'line' },
  sand: { label: 'Sand', block: B.SAND, stamp: 'line' },
  stone: { label: 'Stone', block: B.STONE, stamp: 'square' },
  drygrass: { label: 'Dry grass track', block: B.GRASS_DRY, stamp: 'line' },
};
// scatter: trees by shape (the planner's sal, banyan, peepal, date palm, babul) and plant mixes
// animals the god can place (the sim's species)
export const ANIMAL_KINDS = { deer: 'Deer', rabbit: 'Rabbit', wolf: 'Wolf', bird: 'Birds', minnow: 'Minnows', trout: 'Trout', pike: 'Pike', catfish: 'Catfish' };
// (the spreading tree is shown as the Banyan, the director's name for it)
export const TREE_KINDS = { tall: 'Tall tree', wide: 'Banyan', round: 'Round tree', palm: 'Palm', flat: 'Flat-top tree' };
// (2026-11-15: berry shrubs are their own mix; plain bushes are ferns and tall grass)
export const PLANT_MIX = {
  tallgrass: [B.TALLGRASS, B.TALLGRASS, B.DEADBUSH], flowers: [B.FLOWER_YELLOW, B.FLOWER_RED, B.FLOWER_WHITE, B.FLOWER_BLUE, B.FLOWER_DAISY, B.FLOWER_LILAC],
  bushes: [B.FERN, B.TALLGRASS, B.FERN], berries: [B.SHRUB_BERRY], reeds: [B.REED],
};

// every tool: one mode of a family. `opts` lists the family options that apply.
// `kind` is the gesture: brush (hold or drag), river (drag: the river is painted along the finger's path),
// lake (tap: a bowl dug and filled), cave (click, turn, tick), animal (click or hold and move),
// path (points), power.
const T = (id, family, name, kind, opts, hint, extra = {}) => ({ id, family, name, kind, opts, hint, phases: extra.phases ?? BOTH, ...extra });
export const TOOLS = [
  // Land: three brushes make every shape (the lessons' recipes are in docs/GOD-TOOLS.md). Strength sets both how
  // fast and how hard the edge is: 1 a soft rounded dome, 10 a sheer wall (land.js profile)
  T('raise', 'land', 'Raise', 'brush', ['size', 'strength'], 'Hold or drag to build the ground up. Hold longer for a mountain. Low strength: soft hills; high strength: sheer cliffs'),
  T('lower', 'land', 'Lower', 'brush', ['size', 'strength'], 'Hold or drag to dig the ground down: pits, valleys, a cut into a hillside'),
  T('flatten', 'land', 'Flatten', 'brush', ['size', 'strength'], 'Brings the ground to the height where you first pressed, up or down: level fields, flat hilltops, terraces'),
  T('cave', 'cave', 'Cave', 'cave', ['room'], 'Tap where the mouth should be: a home is carved into the hill, or into a small rocky mound raised for it, facing the water. Turn it, then the tick carves it. Ctrl+click a cave to close it'),
  ...SURFACES.map(([id, name, block]) => T(id, 'paint', name, 'brush', ['size', 'soft'], `Paint ${name.toLowerCase()}`, { block })),
  T('river', 'river', 'River', 'river', ['size', 'banks'], 'Drag along the ground to paint a river: its water shows as you go and steps down, never up. Each stroke is one step for undo'),
  T('lake', 'lake', 'Lake', 'lake', ['size', 'depth'], 'Tap any ground: a bowl is dug there and filled. On a slope the higher side is cut back to the water'),
  T('trees', 'scatter', 'Mix', 'brush', ['size', 'density'], 'Hold and move to grow a mix of trees', { tree: null }),
  ...Object.entries(TREE_KINDS).map(([k, name]) => T(`tree.${k}`, 'scatter', name, 'brush', ['size', 'density'], `Hold and move to grow: ${name.toLowerCase()}`, { tree: k })),
  T('bushes', 'scatter', 'Bushes', 'brush', ['size', 'density'], 'Hold and move to grow clumps of bushes', { plants: 'bushes' }),
  T('berries', 'scatter', 'Berry bushes', 'brush', ['size', 'density'], 'Hold and move to grow berry bushes: people within 30 steps of home pick them for food in summer and autumn, and they fruit again', { plants: 'berries' }),
  T('reeds', 'scatter', 'Reeds', 'brush', ['size', 'density'], 'Hold and move to sow reeds', { plants: 'reeds' }),
  T('flowers', 'scatter', 'Flowers', 'brush', ['size', 'density'], 'Hold and move to grow clumps of flowers', { plants: 'flowers' }),
  ...Object.entries(ANIMAL_KINDS).map(([k, name]) => T(`animal.${k}`, 'animals', name, 'animal', ['count', 'spacing'], FISH_KINDS.includes(k) ? `Tap the water to put in ${k === 'minnow' ? 'a shoal of minnows' : `a ${name.toLowerCase()}`}; hold and move to put in more` : `Click to place ${k === 'bird' ? 'a bird' : `a ${name.toLowerCase()}`}; hold and move to place more`, { animal: k })),
  T('erase', 'erase', 'Erase', 'brush', ['size'], 'Brush over it to clear it: trees, bushes, reeds, water back to dry ground, painted ground back to grass, animals you placed, empty caves you carved. Never people, homes or the standing stone'),
  ...Object.entries(PATH_KINDS).map(([k, K]) => T(`path.${k}`, 'path', K.label, 'path', ['width', 'steps'], `Click along the way; double-click or Enter lays ${K.label.toLowerCase()}`, { pathKind: k })),
];
export const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
// each tool's column: the one that lists it; the tools that left the menu keep a home (for the door's word and the
// options) but no button
const HOME = { darkrock: 'barren', stone: 'barren', earth: 'barren', crop: 'fertile', 'tree.tall': 'trees', 'tree.round': 'trees', 'tree.flat': 'trees' };
for (const c of COLUMNS) for (const id of c.modes) TOOL[id].col = c.id;
for (const t of TOOLS) {
  if (t.family === 'path') { t.col = 'path'; t.hidden = true; }
  else if (!t.col) { t.col = HOME[t.id]; t.hidden = true; }
  t.sub = null;
}
for (const c of COLUMNS) { c.from = c.from ?? [...new Set(c.modes.map((id) => TOOL[id].family))]; c.family = c.from[0] ?? null; }
for (const f of FAMILIES) f.modes = TOOLS.filter((t) => t.family === f.id && !t.hidden).map((t) => t.id);
// the number key of each mode inside its column (1 to 9; later modes have none)
for (const c of COLUMNS) c.modes.forEach((id, i) => { TOOL[id].modeKey = i < 9 ? String(i + 1) : null; });
// ---------- powers (stage 2 seam): a power is data, registered by id (god/plugins.js lists the files) ----------
// Each power becomes one tool of the 'power' column (the HUD's powers dock) with its own option set
// `pw.<id>` (an area power's radius is its `size` option, so [ ] and Alt+wheel size it). The dock order, and the
// number keys 1 to 9 while a power is armed, follow the groups in order of first registration.
// docs/STAGE2-CONTRACTS.md has the shape; god/aim.js is the generic hand that aims and carries them out.
export const POWER = {};          // id -> the registered data
export const POWER_BY_CODE = {};  // ev.code -> power id (a power's own letter)
const PGROUPS = [];
// letters the camera, the column and the HUD already use: a power may not take them
const TAKEN = new Set(['KeyQ', 'KeyE', 'KeyT', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyK', 'KeyL', 'KeyF', ...Object.keys(KEY_BY_CODE).filter((k) => k !== 'KeyZ')]);
export function addPower(def) {
  if (!def?.id || !def.name) throw new Error('a power needs an id and a name');
  if (TOOL[def.id] && !TOOL[def.id].power) throw new Error(`"${def.id}" is already a tool`);
  const fam = `pw.${def.id}`;
  const options = {};
  if (def.radius) {
    const r = def.radius;
    options.size = range(r.label ?? 'Radius', r.min ?? 1, r.max ?? 20, r.step ?? 1, r.value ?? 6, r.hint ?? 'How far the power reaches, in metres');
    // named steps (the Rain's "Any", "1/8" ...): the setting shows the name, and r.toR turns a step into the radius
    if (r.names) options.size.names = r.names;
  }
  for (const [k, o] of Object.entries(def.options ?? {})) options[k] = o.type === 'bool' ? bool(o.label ?? k, !!o.value, o.hint) : range(o.label ?? k, o.min ?? 0, o.max ?? 10, o.step ?? 1, o.value ?? o.min ?? 0, o.hint);
  const F = { id: fam, name: def.name, key: null, code: null, hint: def.hint ?? '', options, modes: [def.id] };
  const fi = FAMILIES.findIndex((f) => f.id === fam);
  if (fi >= 0) FAMILIES[fi] = F; else FAMILIES.push(F);
  FAMILY[fam] = F;
  if (!COLUMN.power.from.includes(fam)) COLUMN.power.from.push(fam);
  // dock: false keeps a power out of the dock and god.tools (a panel carries it out with god.perform)
  const t = T(def.id, fam, def.name, 'power', Object.keys(options), def.hint ?? '', { phases: def.phases ?? ['running'], power: def, hidden: def.dock === false });
  t.col = 'power'; t.sub = null;
  const ti = TOOLS.findIndex((x) => x.id === def.id);
  if (ti >= 0) TOOLS[ti] = t; else TOOLS.push(t);
  TOOL[def.id] = t;
  POWER[def.id] = def;
  const g = def.group ?? 'powers';
  if (!PGROUPS.includes(g)) PGROUPS.push(g);
  for (const [code, id] of Object.entries(POWER_BY_CODE)) if (id === def.id) delete POWER_BY_CODE[code];
  if (def.hotkey) {
    const code = `Key${String(def.hotkey).toUpperCase()}`;
    if (TAKEN.has(code) || (POWER_BY_CODE[code] && POWER_BY_CODE[code] !== def.id)) console.warn(`god: the key ${def.hotkey} for "${def.id}" is taken; it has none`);
    else POWER_BY_CODE[code] = def.id;
  }
  // dock order: by group (first registered first), then registration order; the number keys follow it
  const pw = TOOLS.filter((x) => x.col === 'power' && !x.hidden);
  pw.sort((a, b) => PGROUPS.indexOf(a.power.group ?? 'powers') - PGROUPS.indexOf(b.power.group ?? 'powers') || TOOLS.indexOf(a) - TOOLS.indexOf(b));
  COLUMN.power.modes = pw.map((x) => x.id);
  FAMILY.power.modes = COLUMN.power.modes.slice();
  COLUMN.power.modes.forEach((id, i) => { TOOL[id].modeKey = i < 9 ? String(i + 1) : null; });
  return t;
}

// ids that were renamed or folded into others (2026-11-14: Land keeps Raise, Lower and Flatten; an old call
// for a hill or a pit arms the brush that makes one now)
export const ALIAS = { plants: 'bushes', tallgrass: 'bushes', clear: 'erase',
  hill: 'raise', cliff: 'raise', pit: 'lower', plateau: 'flatten', smooth: 'flatten',
  // 2026-11-15: Paint water became the River brush; Dry land is Erase's work now
  water: 'river', dry: 'erase' };

// Ctrl held at the press turns a tool into its opposite for that stroke (an addition, not in the planner)
export const INVERSE = { raise: 'lower', lower: 'raise' };

// the column entries whose work waits as a see-through preview until the tick (pending.js)
export const PREVIEWED = new Set(COLUMNS.filter((c) => !c.dock && c.id !== 'structures' && c.id !== 'path').map((c) => c.id));
