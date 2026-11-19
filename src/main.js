// Boot: builds the world, renderer, camera, edit core, picker and overlay, puts
// them on one shared context object (ctx), runs the frame loop, then hands ctx
// to the three feature folders. Feature work goes in those folders, not here:
//   src/god/index.js  the god's hands (land tools)
//   src/sim/index.js  the people simulation
//   src/ui/index.js   the HUD and screens
// Each exports init(ctx) (may be async, may return an object) and optionally
// update(dt); an update(dt) on the returned object works too. They are started
// in that order and updated in that order every frame. One that throws is
// logged and does not stop the others. docs/ARCHITECTURE.md describes ctx.
import * as THREE from '../vendor/three.module.js';
import { WORLD, PERF, QUALITY, QUALITY_TIER, CLOCK } from './config.js';
import { Renderer } from './engine/renderer.js';
import { makeBus } from './engine/bus.js';
import { makeClock } from './engine/clock.js';
import { makePerf } from './engine/perf.js';
import { VoxelWorld } from './world/voxel.js';
import { ChunkMesher } from './world/mesher.js';
import { generateFlat } from './world/generate.js';
import { edgeClear } from './world/shade.js';
import { makeCore } from './edit/core.js';
import { makeCamera } from './view/camera.js';
import { makeControls } from './view/controls.js';
import { makePicker } from './view/pick.js';
import { makeOverlay } from './view/overlay.js';
// god, sim and ui are loaded one by one below, so a broken file in one folder cannot stop the others.
// `?skip=sim,ui` in the address leaves folders out (for testing one on its own).

async function boot() {
  const t0 = performance.now();
  const canvas = document.getElementById('view');
  const events = makeBus();
  const clock = makeClock(events);

  const renderer = new Renderer(canvas);
  renderer.setBackground(WORLD.MIST_HEX);
  const scene = renderer.scene;

  const world = new VoxelWorld();
  generateFlat(world);
  // the home land's chunk meshes live in one group, so another place (the battleground, sim/battle-ground.js)
  // can be shown instead of it by flipping visibility: nothing is rebuilt or freed on a switch
  const homeLand = new THREE.Group();
  homeLand.name = 'home-land';
  scene.add(homeLand);
  const mesher = new ChunkMesher(world, homeLand);
  // the ported planner modules take this as `G`
  const G = { world, mesher, renderer, scene };
  const core = makeCore(G); // also points mesher.world at its filter proxy
  const camera = makeCamera(G);
  renderer.camera = camera.cam;
  const controls = makeControls(camera, canvas, events);
  const pick = makePicker(core, camera);
  const overlay = makeOverlay(core, camera, document.getElementById('labels'));

  // moving things live under `entities`, never folded; finished static props
  // may live under `statics` and be folded with world/merge.js foldStatic()
  const layers = { entities: new THREE.Group(), statics: new THREE.Group() };
  layers.entities.name = 'entities'; layers.statics.name = 'statics';
  scene.add(layers.entities, layers.statics);

  const bounds = camera.bounds();
  renderer.setEdgeMist(bounds, WORLD.EDGE_FADE);
  // the seasons' look (view/seasons.js): tags the land's faces as they are meshed, so it is set up before the first
  // mesh (loaded on its own, so a broken file there cannot stop the game)
  let seasons = null;
  try { seasons = (await import('./view/seasons.js')).setupSeasons({ world, mesher, renderer }); } catch (err) { console.error('seasons not set up:', err); mesher.look = null; }
  const tMesh = performance.now();
  mesher.remeshAll();
  const meshMs = performance.now() - tMesh;

  renderer.onResize = () => { camera.onResize(); events.emit('resize', { w: innerWidth, h: innerHeight }); };
  camera.ppm = 6;
  camera.clamp(); camera.update();

  // core's own events, on the shared bus
  core.on('change', (label) => events.emit('edit', { label }));
  core.on('select', () => events.emit('select', { selected: core.selected() }));

  const ctx = {
    THREE,
    config: { WORLD, PERF, QUALITY, QUALITY_TIER, CLOCK },
    world, mesher, renderer, scene, layers, homeLand,
    camera, controls, core, vox: core.V, pick, overlay,
    clock, events,
    edgeClear,
    dom: { canvas, labels: document.getElementById('labels'), ui: document.getElementById('ui') },
    // load a stylesheet that sits next to a module: ctx.addStyle(new URL('./hud.css', import.meta.url))
    addStyle(href) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = String(href);
      document.head.appendChild(link);
      return link;
    },
    modules: {},
    // extra per-frame callbacks (real dt), after the clock and the camera and before the feature folders: a
    // place with its own clock runs here while home time stands still (the battleground, sim/battle.js)
    frame: [],
    // a screen that takes the pointer for itself (the battle's casting, panning and pinching) sets this to a
    // function (ev) -> true when it used the event; it is asked before the camera, the tools and the HUD
    // frame timing (engine/perf.js): game.perf.report() in the console, ?perf=1 for a live readout
    perf: Object.assign(makePerf(() => ({ speed: clock.running ? clock.speed : 0, moment: clock.moment,
      day: ctx.modules.sim?.dayTime, people: ctx.modules.sim?.people?.length })), { bootMs: 0, meshMs, stats: renderer.stats }),
  };
  window.game = ctx; // for the console and tests only; modules use the ctx they are given
  if (seasons) { try { seasons.start(ctx); } catch (err) { console.error('seasons failed to start:', err); } }
  // wind you can see (view/wind.js): on unless ?wind=off is in the address (then nothing of it is loaded at all)
  if (new URLSearchParams(location.search).get('wind') !== 'off') {
    try { (await import('./view/wind.js')).startWind(ctx); } catch (err) { console.error('wind lines not started:', err); }
  }
  ctx.claimPointer = null;
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    addEventListener(type, (ev) => { if (ctx.claimPointer && ctx.claimPointer(ev)) ev.stopImmediatePropagation(); }, { capture: true, passive: false });
  }

  // ---------- the frame ----------
  const hooks = [];
  const failed = new Map();
  const run = (name, fn, dt) => {
    try { fn(dt); } catch (err) {
      const n = (failed.get(name) ?? 0) + 1;
      failed.set(name, n);
      if (n <= 3) console.error(`${name}.update failed${n === 3 ? ' (further errors hidden)' : ''}:`, err);
    }
  };
  const perf = ctx.perf;
  renderer.onFrame = (dt, hidden) => {
    perf.begin();
    clock.advance(dt, hidden || document.hidden);
    camera.tick(dt);
    controls.tick(dt);
    for (const fn of ctx.frame) run('frame hook', fn, dt);
    perf.lap('clock');
    const dirty = world.dirty.size;
    // blocks written outside a transaction (the sim's building and crops): a chunk waits half a second so
    // a burst of writes is meshed once, and meshing stops for the frame after 4 ms (world/mesher.js)
    perf.count('chunks', dirty - mesher.flush(QUALITY.meshBudget, { minAge: 500, maxMs: 4 }));
    perf.lap('mesh');
    for (const [name, fn] of hooks) { run(name, fn, dt); perf.lap(name); }
    if (overlay.dirty) { overlay.rebuildOutlines(); overlay.dirty = false; }
    perf.lap('overlay');
  };
  renderer.onRendered = (hidden) => { perf.lap('render'); perf.end(hidden); };

  // ---------- the feature folders ----------
  const skip = (new URLSearchParams(location.search).get('skip') || '').split(',');
  for (const name of ['god', 'sim', 'ui']) {
    if (skip.includes(name)) continue;
    try {
      const mod = await import(`./${name}/index.js`);
      const r = await mod.init?.(ctx);
      ctx.modules[name] = r ?? mod;
      const up = r?.update ?? mod.update;
      if (typeof up === 'function') hooks.push([name, up.bind(r ?? mod)]);
    } catch (err) {
      console.error(`${name}.init failed:`, err);
    }
  }
  ctx.perf.bootMs = performance.now() - t0;
  events.emit('ready', ctx);
}

boot().catch((err) => {
  console.error('boot failed:', err);
  const el = document.getElementById('boot-error');
  if (el) { el.textContent = 'The world could not be built. See the browser console.'; el.hidden = false; }
});
