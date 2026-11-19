// The side sheet (mock-up A): one box that slides in from the right, never wider than 40 percent of the window,
// only as tall as what it holds (World and the Log, being lists, take the full height and scroll inside). It shows
// ONE thing at a time:
//   detail   a token's or a marker's detail: what is happening, the time left, both futures, what to do (attend.js)
//   trade    a power's price while it is aimed (power.js)
//   select   the selected person, animal, hut, cave, tree, lake or clan (inspect.js)
//   world    the World (world.js)          log   the Log (feed.js)
// The newest thing asked for shows; closing it shows the one under it again (a warning's detail comes back after
// its power has landed). Each kind has one size (screen.css, [data-pane]), so a sheet never changes size while
// open. Opening it holds time if "Paused while reading" is ticked (time.js).
import { h } from './dom.js';

export function makeSlot(U) {
  const host = h('aside', 'isl sheet');
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Detail');
  host.dataset.hudBlock = '';
  U.root.appendChild(host);
  const panes = new Map();   // name -> element
  let stack = [];            // names wanted, oldest first; the last shows

  function add(name, el) {
    panes.set(name, el);
    el.classList.add('sheet-pane');
    el.dataset.pane = name;
    host.appendChild(el);
    paint();
    return el;
  }
  function show(name) {
    if (!panes.has(name)) return;
    stack = stack.filter((n) => n !== name);
    // World and the Log are places of their own: opening one puts away a person or a detail under it
    if (name === 'world' || name === 'log') stack = stack.filter((n) => n === 'trade');
    else stack = stack.filter((n) => n !== 'world' && n !== 'log');
    stack.push(name);
    paint();
  }
  function hide(name) {
    if (!stack.includes(name)) return;
    stack = stack.filter((n) => n !== name);
    paint();
  }
  let shown = null;
  function paint() {
    const top = stack[stack.length - 1] ?? null;
    if (top === shown && host.classList.contains('on') === !!top) return;
    const was = shown;
    shown = top;
    for (const [n, el] of panes) { const on = n === top; if (el.classList.contains('cur') !== on) el.classList.toggle('cur', on); }
    host.classList.toggle('on', !!top);
    if (top) host.dataset.pane = top; else delete host.dataset.pane;
    U.root.dataset.sheet = top ?? '';
    U.read?.set('slot', !!top);
    if (top && !was) U.sfx('ui.open');
    U.onSlot?.forEach?.((fn) => { try { fn(top, was); } catch (err) { U.warnOnce('onSlot', err); } });
  }
  U.onSlot = [];
  return {
    el: host, add, show, hide,
    get shown() { return shown; },
    has: (name) => stack.includes(name),
    get open() { return !!shown; },
  };
}
