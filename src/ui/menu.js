// Island C (Log with its badge, Menu) and the menu (UI-GUIDE 5.9): a centred
// panel over a mist scrim. It stops camera input and pauses the clock, and
// puts both back on close. Resume, Controls, Settings, Start a new world (asks
// once; stage 1 starts again by reloading the page). The controls sheet is
// built from god.tools plus the camera and HUD keys, so it never drifts.
import { h, icon, tip, esc } from './dom.js';

export function makeMenu(U) {
  const { ctx } = U;
  // ---------- top right: the Log (a parchment scroll) and the Menu ----------
  const logB = h('button', 'isl btn round logb', `${icon('scroll', 24)}<span class="count" hidden></span>`);
  const menuB = h('button', 'isl btn round menub', icon('menu', 22));
  logB.type = menuB.type = 'button';
  logB.setAttribute('aria-label', 'Log');
  menuB.setAttribute('aria-label', 'Menu');
  tip(logB, 'Log', 'Everything that has happened, newest first. Tap an entry to look there.', 'L');
  tip(menuB, 'Menu', 'Pause, controls, settings, full screen, a new world.', 'Esc');
  U.topbar.append(logB, menuB);
  logB.addEventListener('click', () => U.feed?.toggleLog());
  menuB.addEventListener('click', () => open());
  const fsOk = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleFull() {
    try {
      if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      else {
        const d = document.documentElement;
        const p = (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d, { navigationUI: 'hide' });
        const lock = () => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not here */ } };
        if (p?.then) p.then(lock, () => U.hint?.('This browser would not go full screen here.', 3000)); else lock();
      }
    } catch { U.hint?.('This browser would not go full screen here.', 3000); }
  }
  U.onSlot?.push((k) => { logB.classList.toggle('on', k === 'log'); logB.setAttribute('aria-expanded', String(k === 'log')); });
  U.onUnread = (n) => { const c = logB.querySelector('.count'); c.hidden = !n; c.textContent = n > 99 ? '99+' : String(n); };
  // ordinary news went in: the scroll swells and bobs once, with a soft sound (at most every 1.5 s, the sound every 4 s)
  let swellT = 0, soundT = 0;
  U.logSwell = () => {
    const now = performance.now();
    if (now - swellT < 1500) return;
    swellT = now;
    if (!U.fx?.reduce?.()) { logB.classList.remove('swell'); void logB.offsetWidth; logB.classList.add('swell'); }
    if (now - soundT > 4000) { soundT = now; U.sfx('log.fill'); }
  };
  logB.addEventListener('animationend', () => logB.classList.remove('swell'));
  const paintTop = () => { const run = ctx.clock.phase === 'running'; logB.hidden = !run; };
  U.on('phase', paintTop);
  paintTop();

  // ---------- the menu ----------
  const scrim = h('div', 'scrim');
  const box = h('div', 'panel menu');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Menu');
  scrim.appendChild(box);
  U.root.appendChild(scrim);
  scrim.addEventListener('pointerdown', (ev) => { if (ev.target === scrim) close(); });

  let isOpen = false, wePaused = false, prevEnabled = true, view = 'main', returnFocus = null, standalone = false, solo = null;
  // o.fromTitle: opened from the title screen on one sheet (Settings); Back closes it instead of showing the menu
  function open(v = 'main', o = {}) {
    if (U.titleOn && !o.fromTitle) return;
    if (!isOpen) standalone = !!o.fromTitle;
    // over the title screen the HUD is hidden: the sheet goes into a HUD layer of its own above the title
    if (!isOpen && standalone) { solo = solo ?? h('div', 'hud hud-solo'); ctx.dom.ui.appendChild(solo); solo.appendChild(scrim); }
    if (!isOpen) {
      isOpen = true;
      returnFocus = document.activeElement;
      prevEnabled = ctx.controls.enabled;
      ctx.controls.enabled = false;
      wePaused = ctx.clock.phase === 'running' && !ctx.clock.paused;
      if (wePaused) ctx.clock.setPaused(true);
      scrim.classList.add('on');
      U.sfx('menu.open');
    }
    show(v);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    scrim.classList.remove('on');
    if (scrim.parentNode === solo) { U.root.appendChild(scrim); solo.remove(); }
    ctx.controls.enabled = prevEnabled;
    if (wePaused) ctx.clock.setPaused(false);
    wePaused = false;
    U.sfx('menu.close');
    try { returnFocus?.focus?.({ preventScroll: true }); } catch { /* gone */ }
  }
  const item = (ic, label, fn, cls = '') => {
    const b = h('button', `btn mitem ${cls}`, `${icon(ic, 20)}<span>${esc(label)}</span>`);
    b.type = 'button'; b.addEventListener('click', fn);
    return b;
  };
  const head = (title, back = true) => {
    const d = h('div', 'mhead');
    d.innerHTML = `<span class="mtitle">${esc(title)}</span>`;
    if (back) {
      const b = h('button', 'btn chip mback', `<span>Back</span>`);
      b.type = 'button'; b.addEventListener('click', () => (standalone ? close() : show('main')));
      d.appendChild(b);
    }
    return d;
  };
  function show(v) {
    view = v;
    box.innerHTML = '';
    if (v === 'main') {
      box.appendChild(head(ctx.clock.phase === 'running' ? 'Time waits' : 'Creation', false));
      box.appendChild(h('p', 'maside', ctx.clock.phase === 'running' ? 'Nobody down there will notice the pause.' : 'Nothing has happened yet. Nothing can go wrong. Yet.'));
      const r = item('play', 'Resume', close, 'primary');
      // walking among the people (walk.js): by the standing stone; while walking, a way back up
      const walk = U.walk?.on ? item('close', 'Leave walking', () => { close(); U.walk.leave(); })
        : U.walk?.can?.() ? item('people', 'Walk among them', () => { close(); U.walk.enterStone(); }) : null;
      box.append(r, ...(walk ? [walk] : []), item('keys', 'Controls', () => show('controls')), item('sliders', 'Settings', () => show('settings')), item('quill', 'Lessons and tips', () => show('lessons')), ...(fsOk ? [item(isFull() ? 'unfull' : 'full', isFull() ? 'Leave full screen' : 'Full screen', () => { toggleFull(); close(); })] : []), item('sprout', 'Start a new world', () => show('new'), 'danger'));
      box.appendChild(skipRow());
      r.focus({ preventScroll: true });
    } else if (v === 'controls') {
      box.appendChild(head('Controls'));
      const list = h('div', 'mkeys');
      for (const [k, what] of bindings()) list.insertAdjacentHTML('beforeend', `<div class="mk"><span class="mk-k">${k.map((x) => `<kbd>${esc(x)}</kbd>`).join(' ')}</span><span>${esc(what)}</span></div>`);
      box.appendChild(list);
      box.querySelector('.mback').focus({ preventScroll: true });
    } else if (v === 'settings') {
      box.appendChild(head('Settings'));
      const S = U.settings;
      const row = (label, ctl) => { const d = h('div', 'mrow'); d.innerHTML = `<span class="mrow-l">${esc(label)}</span>`; d.appendChild(ctl); return d; };
      const toggle = (key, after) => {
        const b = h('button', 'btn chip', '');
        b.type = 'button';
        const paint = () => { b.innerHTML = `${icon(S[key] ? 'met' : 'open', 18)}<span>${S[key] ? 'On' : 'Off'}</span>`; b.classList.toggle('on', !!S[key]); b.setAttribute('aria-pressed', String(!!S[key])); };
        b.addEventListener('click', () => { S[key] = !S[key]; U.saveSettings(); paint(); after?.(); });
        paint();
        return b;
      };
      box.append(row('Paused while reading: time stops while anything is open', toggle('readPause', () => U.read?.apply())));
      box.append(row('Pan when the pointer touches the window edge', toggle('edgePan')), row('Hints', toggle('hints')), row('Teaching tips', toggle('tips')));
      box.append(row('Slow to 1x for fights where someone may die (from 4x)', toggle('fightSlow'))); // ui/marks.js reads it
      // the close-up window (closeup.js): one switch for everything that opens it, on unless turned off
      if (S.closeup == null) S.closeup = true;
      box.append(row('Close-up window for raids and big moments', toggle('closeup', () => U.closeup?.set(S.closeup))));
      const again = h('button', 'btn chip', '<span>Show all hints again</span>');
      again.type = 'button';
      again.addEventListener('click', () => { U.settings.seen = {}; U.saveSettings(); again.innerHTML = '<span>Done</span>'; });
      // sound, made in the browser; haptics on Android phones; the camera's kick when a heavy power lands
      box.append(row('Sound', toggle('sound')), row('Haptics (Android phones)', toggle('haptics')));
      const shake = h('div', 'oc');
      shake.innerHTML = `<input type="range" min="0" max="100" step="10" value="${Number(S.shake ?? 100)}" aria-label="Shake"><span class="oc-v">${Number(S.shake ?? 100)}%</span>`;
      shake.querySelector('input').addEventListener('input', (ev) => { S.shake = Number(ev.target.value); shake.querySelector('.oc-v').textContent = `${ev.target.value}%`; U.saveSettings(); });
      box.append(row('Shake when a heavy power lands', shake), row('Less motion (fades instead of flights)', toggle('reduceMotion')));
      // how see-through the land preview is (god/pending.js reads S.ghost every frame; 50 is the look the director chose)
      const ghost = h('div', 'oc');
      ghost.innerHTML = `<span class="oc-v">Faint</span><input type="range" min="0" max="100" step="5" value="${Number(S.ghost ?? 50)}" aria-label="Land preview: how see-through"><span class="oc-v">Solid</span>`;
      ghost.querySelector('input').addEventListener('input', (ev) => { S.ghost = Number(ev.target.value); U.saveSettings(); });
      box.append(row('Land preview: how see-through', ghost));
      box.append(row('', again), h('p', 'mnote', 'Less motion is also on when your system asks for reduced motion.'));
      box.querySelector('.mback').focus({ preventScroll: true });
    } else if (v === 'lessons') {
      box.appendChild(head('Lessons and tips'));
      const run = ctx.clock.phase === 'running';
      box.appendChild(h('p', 'maside', run ? 'Some things are easier to learn the second time. Most things, really.' : 'The land will wait. It is good at that.'));
      const tips = item('quill', 'Show every tip again', () => { close(); U.settings.tips = true; U.saveSettings(); U.teach?.replay(); });
      const les = item('land', run ? 'The lessons for when time runs' : 'The lesson in shaping land', () => { close(); U.tutorial?.start({ again: true }); });
      les.disabled = !U.tutorial;
      box.append(tips, les);
      if (run) box.appendChild(h('p', 'mnote', 'The lesson in shaping land happens before time begins: start a new world to take it again.'));
      tips.focus({ preventScroll: true });
    } else if (v === 'new') {
      box.appendChild(head('Start a new world', false));
      box.appendChild(h('p', 'mq', 'Throw this world away? It cannot be undone.'));
      const keep = item('close', 'Keep it', () => show('main'), 'primary');
      const toss = item('sprout', 'Throw it away', () => { try { location.reload(); } catch { /* no reload */ } }, 'danger');
      box.append(keep, toss);
      keep.focus({ preventScroll: true });
    }
  }
  // ---------- Skip ahead (a testing aid): calls sim.skip(years) when the simulation has it ----------
  let skipping = null;
  function skipRow() {
    const d = h('div', 'mskip');
    const has = typeof U.sim()?.skip === 'function';
    const run = ctx.clock.phase === 'running';
    d.innerHTML = `<div class="mrow"><span class="mrow-l">Skip ahead <span class="mnote-i">(for testing)</span></span><span class="mskip-b chips"></span></div><p class="mskip-s mnote" role="status" aria-live="polite"></p>`;
    const row = d.querySelector('.mskip-b'), st = d.querySelector('.mskip-s');
    for (const y of [10, 50, 100, 500]) {
      const b = h('button', 'btn chip', `<span>${y} years</span>`);
      b.type = 'button';
      b.disabled = !has || !run || !!skipping;
      tip(b, `Skip ${y} years`, has ? (run ? 'The years pass at once, as they would have. For testing.' : 'Time has not begun yet.') : 'The simulation cannot skip time yet.');
      b.addEventListener('click', () => skip(y, d));
      row.appendChild(b);
    }
    if (!has) st.textContent = 'Not available: the simulation has no skip yet.';
    else if (skipping) st.textContent = skipping.text;
    d.hidden = !U.sim();
    return d;
  }
  async function skip(years, d) {
    const sim = U.sim();
    if (skipping || typeof sim?.skip !== 'function') return;
    const st = d.querySelector('.mskip-s');
    const before = { ...(sim.stats ?? {}) }, y0 = ctx.clock.year;
    skipping = { text: `Skipping ${years} years...` };
    d.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    st.textContent = skipping.text;
    const off = U.on('sim:skip', (p) => {
      if (!p || !Number.isFinite(p.total)) return;
      skipping.text = `Skipping: ${Math.round(p.done ?? 0)} of ${Math.round(p.total)} years.`;
      if (st.isConnected) st.textContent = skipping.text;
    });
    let err = null;
    try { await sim.skip(years); } catch (e) { err = e; U.warnOnce('sim.skip', e); }
    off();
    const a = sim.stats ?? {};
    const dn = (k) => { const v = (a[k] ?? 0) - (before[k] ?? 0); return `${v >= 0 ? '+' : ''}${v}`; };
    const text = err ? 'The skip failed. See the console.'
      : `Skipped ${Math.round(ctx.clock.year - y0)} years. People ${a.population ?? '-'} (${dn('population')}), families ${a.families ?? '-'}, births ${dn('births')}, deaths ${dn('deaths')}.`;
    skipping = null;
    const fresh = box.querySelector('.mskip');
    if (fresh) { fresh.replaceWith(skipRow()); box.querySelector('.mskip-s').textContent = text; }
    U.hint?.(text, 6000);
  }
  function bindings() {
    const tools = U.get('god', 'tools') ?? [];
    const out = [];
    // one line per family: its key, then the number keys for its modes
    const fams = new Map();
    for (const t of tools) {
      const f = t.family ?? t.group ?? t.id;
      if (!fams.has(f)) fams.set(f, []);
      fams.get(f).push(t);
    }
    for (const list of fams.values()) {
      const keys = [...new Set(list.map((t) => t.hotkey).filter(Boolean))];
      const late = list.every((t) => t.phases && !t.phases.includes('creation')) ? ' (once time runs)' : '';
      const name = list[0].familyName ?? list[0].name;
      if (keys.length === 1 && list.length > 1) {
        out.push([[keys[0]], `${name}${late}. Then a number picks: ${list.map((t) => `${t.modeKey ? `${t.modeKey} ` : ''}${t.name.toLowerCase()}`).join(', ')}.`]);
      } else {
        for (const t of list) if (t.hotkey) out.push([[t.hotkey], `${t.name}${late}`]);
      }
    }
    out.push(
      [['[', ']'], 'Brush size'], [['Shift', '[', ']'], 'Brush strength'], [['Ctrl', 'Z'], 'Undo (creation only)'], [['Ctrl', 'Y'], 'Redo (creation only)'],
      [['Esc'], 'Cancel, put the tool down, close, then this menu'], [['Right click'], 'Cancel or put the tool down'],
      [['Right drag'], 'Pan the view; start the drag straight up or down to tilt it instead'], [['Wheel'], 'Zoom'], [['W', 'A', 'S', 'D'], 'Pan the view'], [['Q', 'E'], 'Turn a quarter'],
      [['Page Up', 'Page Down'], 'Tilt the view: toward straight down, or toward level'],
      [['T'], 'Look straight down, or back to your tilt'], [['Home'], 'See the whole world'],
      [['Space'], 'Pause or resume'], [['K'], 'Slow time, so you can watch each person'], [['-', '='], 'Slower, faster'], [['L'], 'Log'], [['O'], 'World: your people, and your commandments'], [['J'], 'World: discoveries'],
      [['1', '9'], 'With a power ready: pick another power by its place in the Powers list'], [['F'], 'Follow the one you selected'],
      [['Tap'], 'On a phone: select, or with a power ready, see its price (tap again to act)'], [['Drag'], 'On a phone: one finger moves the view; two fingers pinch to zoom, twist to turn, drag up or down together to tilt'],
      [['?'], 'This sheet'], [['Ctrl', 'H'], 'Hide the interface'],
      [['W', 'A', 'S', 'D'], 'Walking among them: walk (the arrow keys too)'], [['Space'], 'Walking: jump'], [['Wheel'], 'Walking: bring the camera in or take it back (all the way in is through the eyes)'],
      [['Drag'], 'Walking: click to hand the view the mouse, or hold a button and drag to look'], [['Esc'], 'Walking: leave and go back up'],
      [['Thumbs'], 'Walking on a phone: the stick walks, a drag looks, two fingers pinch the camera in or out, Jump jumps'],
    );
    return out;
  }
  return { open, close, get isOpen() { return isOpen; }, el: menuB, logB, toggleFull };
}
