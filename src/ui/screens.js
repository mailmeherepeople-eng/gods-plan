// The two phases (UI-GUIDE section 4):
//   creation  the start button under the right thumb: "And thus, we begin." with "Time starts, 5000 BC" in it, so
//             nothing else has to show the date before time runs. Pressed with something families need missing
//             (a cave, fresh water), a small question first: "No cave yet. Families will not stay. Begin anyway?"
//             with Begin anyway and Keep shaping (sim.ask('landNeeds')). No checklist bar (the director, 2026-11-14).
//   running   the start button goes; night follows sim:daylight: this file hands the level and the sim's time of day
//             to renderer.setDaylight, and the renderer lights the night itself. Nothing in the HUD filters, tints or
//             washes the world (the director: darkness, never haze).
import { h, icon, tip, yearLabel, esc } from './dom.js';
import { B } from '../world/blocks.js';
import { makeTitle } from './title.js';

export function makeScreens(U) {
  const { ctx } = U;
  const clock = ctx.clock;
  const START = ctx.config?.CLOCK?.START_YEAR ?? -5000;

  // ---------- the start button ----------
  const start = h('button', 'isl btn startbtn');
  start.type = 'button';
  start.innerHTML = `<span class="st-l">And thus, we begin.</span><span class="st-y">Time starts, ${esc(yearLabel(START))}</span>`;
  start.setAttribute('aria-label', `And thus, we begin. Time starts, ${yearLabel(START)}.`);
  tip(start, 'Begin', 'The years begin to pass and families start to arrive. Undo ends here; you can still reshape the land, they will just be watching.');
  start.dataset.hudBlock = '';
  U.root.appendChild(start);

  // ---------- the question when something is missing ----------
  const warn = h('div', 'isl startwarn');
  warn.setAttribute('role', 'alertdialog');
  warn.innerHTML = `<p class="sw-t"></p><div class="acts-row"><button class="btn sw-no" type="button">Keep shaping</button><button class="btn sw-drop" type="button">Drop them and begin</button><button class="btn primary sw-go" type="button">Begin anyway</button></div>`;
  warn.dataset.hudBlock = '';
  U.root.appendChild(warn);
  warn.querySelector('.sw-no').addEventListener('click', () => closeWarn());
  const swGo = warn.querySelector('.sw-go'), swDrop = warn.querySelector('.sw-drop');
  // the first question may be about strokes still waiting for the tick: apply them, or drop them, then the next check
  let asking = null;
  swGo.addEventListener('click', () => { closeWarn(); if (asking === 'pending') { U.call('god', 'apply'); setTimeout(ask, 60); } else go(); });
  swDrop.addEventListener('click', () => { closeWarn(); U.call('god', 'drop'); setTimeout(ask, 60); });
  let warnOpen = false;
  function closeWarn() { warnOpen = false; warn.classList.remove('on'); }
  U.startWarn = { get open() { return warnOpen; }, close: closeWarn };
  // what families need and the land lacks (the sim's own check; without it, water read from the blocks)
  function missing() {
    const need = U.call('sim', 'ask', 'landNeeds');
    let water = need ? need.water : null;
    if (water == null) { try { water = ctx.world?.data ? ctx.world.data.indexOf(B.WATER) !== -1 : null; } catch { water = null; } }
    const cave = !!need && !(need.cavesByWater > 0), dry = water === false;
    if (cave && dry) return 'No cave and no fresh water yet.';
    if (cave) return need.caves ? 'No cave by the water yet.' : 'No cave yet.';
    if (dry) return 'No fresh water yet.';
    return '';
  }
  function question(kind, text) {
    asking = kind;
    warn.querySelector('.sw-t').textContent = text;
    swGo.textContent = kind === 'pending' ? 'Apply them and begin' : 'Begin anyway';
    swDrop.hidden = kind !== 'pending';
    warnOpen = true; warn.classList.add('on');
    U.sfx('ui.open');
  }
  function ask() {
    if (clock.phase !== 'creation') return;
    if (U.get('god', 'pending')?.has) { question('pending', 'You have changes not yet applied.'); return; }
    const m = missing();
    if (m) { question('missing', `${m} Families will not stay. Begin anyway?`); return; }
    go();
  }
  start.addEventListener('click', ask);
  function go() {
    if (clock.phase !== 'creation') return;
    start.classList.add('pressed');
    // put down whatever is in hand, or "Paused while reading" would hold time still on the very first press
    try { U.call('god', 'setTool', null); } catch { /* nothing in hand */ }
    U.doors?.open(null);
    setTimeout(() => { try { clock.start(); } catch (err) { U.warnOnce('clock.start', err); } }, 60);
  }

  function applyPhase(animate) {
    const run = clock.phase === 'running';
    U.root.dataset.phase = clock.phase;
    start.hidden = run;
    if (run) closeWarn();
    if (run && animate) U.sfx('clock.start');
  }
  U.on('phase', () => {
    applyPhase(true);
    if (clock.phase === 'running' && !U.sim()) U.feed?.push({ severity: 'info', text: 'Time begins. Somewhere out in the mist, someone is walking this way.' });
  });
  applyPhase(false);

  // ---------- night ----------
  let level = 1;
  U.on('sim:daylight', (p) => { if (Number.isFinite(p?.level)) level = p.level; });
  function slow() {
    const run = clock.phase === 'running';
    // the creation screens follow the clock itself, not only its event (started from the console, by a skip)
    if (U.root.dataset.phase !== clock.phase) applyPhase(false);
    const st = U.get('sim', 'stats');
    if (Number.isFinite(st?.daylight)) level = st.daylight;
    U.daylight = run ? level : 1;
    const t = run ? U.get('sim', 'dayTime') : null;
    ctx.renderer?.setDaylight?.(U.daylight, { t: Number.isFinite(t) ? t : undefined });
    // the title screen's blur (title.js) is the only filter ever put on the world, and only while the title is up
    const f = U.worldBlur || '';
    const cv = ctx.dom?.canvas; if (cv && cv.style.filter !== f) cv.style.filter = f;
  }
  U.slow.push(slow);
  void icon;
  // the title screen, "God's Plan", and the Difficulty step, before creation (title.js; ?notitle=1 skips it)
  try { U.title = makeTitle(U); } catch (err) { U.warnOnce('title', err); U.titleOn = false; U.worldBlur = ''; U.root.classList.remove('titled'); }
  slow();
  return { start, warn };
}
