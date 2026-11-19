// The HUD's panels, readouts and inspector sections: one file per line, each file's default export an array of
// registrations (ui/registry.js; docs/STAGE2-CONTRACTS.md). Loaded in this order, after the core HUD (index.js:
// time, slot, doors, Log, powers, inspector, cursor, menu, screens).
export const PANELS = [
  // dev only: stage 2 test doubles, loaded only with ?fixtures=1 (the file does nothing without the flag)
  () => (new URLSearchParams(location.search).get('fixtures') === '1' ? import('./fixtures.js') : Promise.resolve({ default: [] })),
  () => import('./delight.js'),     // the delight pass: sound, haptics, press feel, flights, eyes, graves, meat, beads, rumble
  () => import('./touch.js'),       // fingers: one drags the view, two pinch and turn, a tap selects or aims
  () => import('./attend.js'),      // tokens top right, markers on the map, their detail in the slot (both futures)
  () => import('./closeup.js'),     // the close-up window: raids, the first people, the red problem signs (closeup-watch.js)
  () => import('./world.js'),       // the World door: the three forces, counts, Earth, great people, commandments, discoveries, clans
  () => import('./discover.js'),    // a discovery announced
  () => import('./clanmap.js'),     // clan rings under people, the favourite's gold ring, name tags, village names
  () => import('./marks.js'),       // signs over heads (sick, wounded, great, turning points); the drop to 1x for fights
  () => import('./thought.js'),     // Give a thought (an inspector tab; the power's click comes here)
  () => import('./audit.js'),       // the overhang audit, a console helper: game.modules.ui.dev.audit()
  () => import('./faith-fx.js'),    // who saw an act and what it did, on the map; word passing from teller to listener
  () => import('./faith-panel.js'), // the faith ledger and "How faith works"
  () => import('./teach.js'),       // teaching cards
  () => import('./tutorial.js'),    // the lessons: one line at the top left edge, a ring on the control, Skip in one tap
  () => import('./xray.js'),        // x-ray on hover (and on a selected hut or cave, the tap equivalent)
  () => import('./battle.js'),      // battles (stage 3): the bar, their god, the hearth fires, the result, the end of a run
  () => import('./walk.js'),        // walking among the people in first person (after battle.js: it wraps the battle's pointer claim)
];
