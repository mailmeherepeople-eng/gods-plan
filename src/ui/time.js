// The time box, top left once time runs (mock-up A): the pause button, the date with the speed it runs at (one tap
// folds Slow, 1x, 2x and 4x open beside it), and under the date, tiny and always there, how far the people stand
// from Earth: a short bar with a centre line (left behind, right ahead) and the number of years. While anything is
// open, "Paused while reading" stands beside the date (a tick box: untick it to let time run while you read).
// Before time starts there is no time box: the start button says "Time starts, 5000 BC".
//
// The rule (docs/HUD.md, "Paused while reading"):
//   - Anything of the player's that is open is a reason to hold time: the side sheet (a warning, a prayer, a
//     power's price, the selected person or thing, World, the Log), the door's row (Powers), or a power or Reshape
//     tool in hand. While there is at least one reason, the box is ticked and time runs, time is paused at once;
//     when the last reason goes, time runs again. The menu pauses by itself.
//   - It never fights the player: if they pause themselves first, nothing is undone when the reasons go; if they
//     press Play (or a speed) while time is held, time runs for as long as those reasons stay open, and the hold
//     starts afresh only after everything is closed.
import { h, icon, tip, yearLabel, setText, setHidden, setAttr } from './dom.js';
import { makeGlobe } from './globe.js';

export function makeTime(U) {
  const { ctx } = U;
  const clock = ctx.clock;
  const SPEEDS = ctx.config?.CLOCK?.SPEEDS ?? [1, 2, 4];

  const el = h('div', 'isl tbox');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Time');
  el.innerHTML = `<button class="btn ico tb-pause" type="button"></button>
    <span class="globe" aria-hidden="true"></span>
    <button class="btn tb-date" type="button" aria-expanded="false"><span class="tb-dw"><span class="tb-d"></span><span class="tb-sp"></span>${icon('expand', 16)}</span>
      <span class="tb-r2"><span class="earth" aria-hidden="true"><span class="ea-bar"><i class="ea-mid"></i><i class="ea-fill"></i></span><span class="ea-n"></span></span><span class="tb-sn"></span></span></button>
    <div class="tb-speeds" role="group" aria-label="Speed"></div>
    <label class="tick" hidden><input type="checkbox"><span class="bx" aria-hidden="true">${icon('tick', 16)}</span><span class="tk-l">Paused while reading</span></label>`;
  el.dataset.hudBlock = '';
  U.root.appendChild(el);
  const pauseB = el.querySelector('.tb-pause'), dateB = el.querySelector('.tb-date'), sp = el.querySelector('.tb-speeds');
  const dateT = el.querySelector('.tb-d'), spT = el.querySelector('.tb-sp');
  const earth = el.querySelector('.earth'), eFill = el.querySelector('.ea-fill'), eN = el.querySelector('.ea-n');
  const seasonT = el.querySelector('.tb-sn');
  const tickL = el.querySelector('.tick'), box = tickL.querySelector('input');
  pauseB.addEventListener('click', () => togglePause());
  dateB.addEventListener('click', () => setOpen(!el.classList.contains('open')));
  let open = false;
  function setOpen(v) { open = v; el.classList.toggle('open', v); setAttr(dateB, 'aria-expanded', String(v)); U.sfx(v ? 'ui.open' : 'ui.close'); }
  // Slow: the player's own moment (the director: "slow down time to normal time, so that we can examine each person")
  const slowB = h('button', 'btn sp-slow', 'Slow');
  slowB.type = 'button';
  slowB.addEventListener('click', () => { toggleSlow(); setOpen(false); });
  sp.appendChild(slowB);
  const speedB = SPEEDS.map((s) => {
    const b = h('button', 'btn sp-x', `${s}x`);
    b.type = 'button'; b.dataset.speed = s;
    b.addEventListener('click', () => { setSpeed(s); setOpen(false); });
    sp.appendChild(b);
    return b;
  });
  tip(dateB, 'The date and the speed', 'Tap to change the speed. Under the date: how far your people stand from Earth, behind to the left, ahead to the right.');

  // ---------- paused while reading ----------
  if (U.settings.readPause == null) U.settings.readPause = true;
  box.checked = !!U.settings.readPause;
  tip(tickL, 'Paused while reading', 'Opening anything (a warning, a person, your powers, the World, the Log) stops time at once, and it runs again when you close it. Untick to let time run while you read.');
  box.addEventListener('change', () => { U.settings.readPause = box.checked; U.saveSettings(); R.apply(); U.sfx('ui.toggle'); });
  const R = {
    why: new Set(), held: false, override: false,
    // a reason to hold time opens or closes ('slot', 'door', 'tool' ...)
    set(key, on) {
      if (on === R.why.has(key)) return;
      if (on) R.why.add(key); else R.why.delete(key);
      R.apply();
    },
    get on() { return !!U.settings.readPause; },
    apply() {
      const want = R.on && clock.phase === 'running' && R.why.size > 0 && !U.call('sim', 'ask', 'battleLive'); // a battle is never held by reading
      if (!R.why.size) R.override = false;
      if (want && !R.held && !R.override && !clock.paused) { R.held = true; clock.setPaused(true); U.sfx('clock.pause'); }
      else if (!want && R.held) { R.held = false; if (clock.paused) { clock.setPaused(false); U.sfx('clock.resume'); } }
      paintRead();
    },
  };
  U.read = R;
  // someone else let time run while it was held (a speed button, the menu closing): the player's choice wins
  U.on('pause', ({ paused } = {}) => { if (!paused && R.held) { R.held = false; R.override = true; } paintRead(); });
  U.on('phase', () => R.apply());
  function paintRead() {
    if (box.checked !== R.on) box.checked = R.on;
    tickL.classList.toggle('off', !R.on);
    // shown beside the date while something is open (and always in Settings)
    setHidden(tickL, !(R.why.size > 0 && clock.phase === 'running'));
    el.classList.toggle('held', R.held);
    state = '';
  }

  const PLAYER = 'player';
  const mine = () => !!clock.moments?.has?.(PLAYER);
  const others = () => [...(clock.moments?.entries?.() ?? [])].filter(([id]) => id !== PLAYER).map(([, v]) => v ?? {});
  function toggleSlow(force) {
    if (clock.phase !== 'running' || typeof clock.hold !== 'function') return;
    const on = force ?? !mine();
    if (on) { clock.hold(PLAYER, { kind: 'player', text: 'You slowed time.' }); if (clock.paused) { if (R.held) { R.held = false; R.override = true; } clock.setPaused(false); } }
    else clock.release(PLAYER);
    U.sfx('clock.speed');
  }
  U.on('moment', (p) => { if (p?.on && !p?.ended && p.id !== PLAYER) U.sfx('clock.slow'); });

  // ---------- actions ----------
  function togglePause() {
    if (clock.phase !== 'running') return;
    if (clock.paused && R.held) { R.held = false; R.override = true; }
    clock.setPaused(!clock.paused);
    U.sfx(clock.paused ? 'clock.pause' : 'clock.resume');
  }
  function setSpeed(s) {
    if (clock.phase !== 'running') return;
    if (mine()) clock.release(PLAYER);
    clock.setSpeed(s);
    if (clock.paused) { if (R.held) { R.held = false; R.override = true; } clock.setPaused(false); }
    U.sfx('clock.speed');
  }
  // - and = walk the row: Pause, Slow, 1x, 2x, 4x
  function step(d) {
    if (clock.phase !== 'running') return;
    const row = ['pause', 'slow', ...SPEEDS];
    const cur = clock.paused ? 'pause' : mine() ? 'slow' : clock.speed;
    const i = Math.max(0, row.indexOf(cur));
    const next = row[Math.max(0, Math.min(row.length - 1, i + d))];
    if (next === cur) return;
    if (next === 'pause') { if (!clock.paused) togglePause(); return; }
    if (clock.paused) togglePause();
    if (next === 'slow') { clock.setSpeed(SPEEDS[0]); toggleSlow(true); return; }
    setSpeed(next);
  }

  // ---------- Earth: how far ahead or behind ----------
  let gapT = 0, gap = null;
  function earthGap() {
    const now = performance.now();
    if (now - gapT < 2000) return gap;
    gapT = now;
    const a = Math.round(Number(U.call('sim', 'ask', 'earth')?.ahead));
    gap = Number.isFinite(a) ? a : null;
    return gap;
  }
  let earthSig = '';
  function paintEarth() {
    const a = earthGap();
    const s = String(a);
    if (s === earthSig) return;
    earthSig = s;
    setHidden(earth, a == null);
    if (a == null) return;
    // the bar: a centre line, a fill from it to the side the people stand on (a century fills half the bar)
    const k = Math.max(-1, Math.min(1, a / 200));
    eFill.style.left = `${50 + Math.min(0, k) * 50}%`;
    eFill.style.width = `${Math.abs(k) * 50}%`;
    earth.classList.toggle('ahead', a > 0);
    earth.classList.toggle('behind', a < 0);
    setText(eN, a > 0 ? `+${a}` : String(a));
    const words = a > 0 ? `${a} ${a === 1 ? 'year' : 'years'} ahead of Earth` : a < 0 ? `${-a} ${a === -1 ? 'year' : 'years'} behind Earth` : 'Level with Earth';
    earth.title = words;
    dateB.setAttribute('aria-label', `${yearLabel(clock.year)}, ${seasonT.textContent ? `${seasonT.textContent}, ` : ''}${speedWord()}. ${words}. Change the speed.`);
  }
  // ---------- the season, beside Earth under the date (sim/season.js; docs/HUD.md) ----------
  const SEASON_WORD = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
  const WEATHER_WORD = { rain: 'Rain is falling.', 'a shower': 'A shower is passing.', snow: 'Snow is falling.', 'snow nearby': 'Snow is falling nearby.' };
  let seasonSig = '';
  function paintSeason() {
    const s = U.call('sim', 'ask', 'season'), w = U.call('sim', 'ask', 'weather');
    const name = SEASON_WORD[s?.name] ?? '';
    const sig = `${name}|${w?.label ?? ''}`;
    if (sig === seasonSig) return;
    seasonSig = sig;
    setText(seasonT, name);
    setHidden(seasonT, !name);
    earthSig = ''; // the date's spoken label names the season too
    seasonT.title = name ? `${name}. ${WEATHER_WORD[w?.label] ?? 'The seasons turn by themselves, about a minute each at 1x.'}` : '';
  }
  const speedWord = () => (clock.paused ? 'paused' : mine() ? 'slowed' : `${clock.speed}x`);

  // ---------- per frame / 4 Hz ----------
  let shownDate = '', state = '';
  // the small spinning Earth beside the year (the director, 2026-11-15: "the earth remains the spinning earth"):
  // its spin shows how fast time runs, and it stands still when time does
  let globe = null;
  try { globe = makeGlobe(U, el.querySelector('.globe')); } catch (err) { U.warnOnce('globe', err); }
  function frame(dt) {
    if (globe && !el.hidden) { try { globe.update(dt); } catch (err) { U.warnOnce('globe.update', err); } }
    const d = yearLabel(clock.year);
    if (d !== shownDate) { dateT.textContent = d; shownDate = d; }
  }
  function slow() {
    if (U.hitStop) return;   // a power's landing holds the world for 70 to 100 ms: not a pause to show
    const run = clock.phase === 'running';
    setHidden(el, !run || !!U.titleOn);
    if (!run) return;
    paintEarth();
    paintSeason();
    const st = `${clock.paused}|${clock.speed}|${mine()}|${R.held}|${others().length > 0}`;
    if (st === state) return;
    state = st;
    pauseB.classList.toggle('on', clock.paused);
    pauseB.classList.toggle('held', clock.paused && R.held);
    pauseB.innerHTML = icon(clock.paused ? 'play' : 'pause', 22);
    pauseB.setAttribute('aria-label', clock.paused ? 'Resume' : 'Pause');
    tip(pauseB, clock.paused ? 'Resume' : 'Pause', clock.paused ? (R.held ? 'Time waits while you read. Play lets it run anyway, until you close what you are reading.' : 'Let time run again.') : 'Stop time. You can still shape the land and aim your powers.', 'Space');
    pauseB.setAttribute('aria-pressed', String(clock.paused));
    const slowOn = mine();
    // (paused shows on the button itself, the play sign; the chip keeps the speed time will run at)
    setText(spT, slowOn ? 'Slow' : others().length ? 'Slowed' : `${clock.speed}x`);
    el.classList.toggle('slowed', !clock.paused && (slowOn || others().length > 0));
    slowB.classList.toggle('on', slowOn && !clock.paused);
    slowB.setAttribute('aria-pressed', String(slowOn));
    slowB.disabled = typeof clock.hold !== 'function';
    tip(slowB, slowOn ? 'Let time run' : 'Slow time', slowOn ? 'The calendar runs at its own pace again.' : 'Slow the years to a crawl so you can watch each person.', 'K');
    for (const b of speedB) {
      const s2 = Number(b.dataset.speed);
      const on = !clock.paused && !slowOn && clock.speed === s2;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      tip(b, `Speed ${s2}x`, s2 === 1 ? 'A year passes about every 2.4 seconds.' : `Time runs ${s2} times as fast.`);
    }
    earthSig = '';
    paintEarth();
  }
  U.on('year', ({ year }) => {
    if (((year % 100) + 100) % 100 !== 0) return;
    dateT.classList.remove('century'); void dateT.offsetWidth; dateT.classList.add('century');
    U.sfx('year.century');
  });

  U.frame.push(frame);
  U.slow.push(slow);
  slow(); frame(0);
  return { el, togglePause, toggleSlow, step, setSpeed, setOpen, get slowed() { return mine(); } };
}
