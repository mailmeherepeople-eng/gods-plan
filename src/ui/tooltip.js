// Tooltips (UI-GUIDE 5.8): 400 ms delay, then a 120 ms fade with a 4 px rise;
// instant when moving between neighbours within 800 ms; 80 ms out. Content
// from the element's data-tip (name), data-key, data-desc and data-aside,
// read when it opens, so a readout can keep its text fresh. 8 px from the
// element on data-side (bottom by default), flipped at the window's edges.
import { h, esc } from './dom.js';

export function makeTips(U) {
  const el = h('div', 'tip');
  el.setAttribute('role', 'tooltip');
  U.root.appendChild(el);
  let cur = null, timer = 0, lastHide = -1e9, open = false;

  function render(t) {
    const d = t.dataset;
    el.innerHTML = `<div class="tip-head"><span class="tip-name">${esc(d.tip)}</span>${d.key ? `<kbd>${esc(d.key)}</kbd>` : ''}</div>`
      + (d.desc ? `<div class="tip-desc">${esc(d.desc)}</div>` : '')
      + (d.aside ? `<div class="tip-aside">${esc(d.aside)}</div>` : '');
  }
  function place(t) {
    const s = 1, r = t.getBoundingClientRect();
    const R = { l: r.left / s, t: r.top / s, r: r.right / s, b: r.bottom / s };
    const W = innerWidth / s, H = innerHeight / s;
    const w = el.offsetWidth, hh = el.offsetHeight, g = 8;
    let side = t.dataset.side || 'bottom';
    const fits = {
      bottom: R.b + g + hh < H - 4, top: R.t - g - hh > 4,
      right: R.r + g + w < W - 4, left: R.l - g - w > 4,
    };
    const flip = { bottom: 'top', top: 'bottom', right: 'left', left: 'right' };
    if (!fits[side] && fits[flip[side]]) side = flip[side];
    let x, y;
    if (side === 'right' || side === 'left') {
      x = side === 'right' ? R.r + g : R.l - g - w;
      y = (R.t + R.b) / 2 - hh / 2;
    } else {
      x = (R.l + R.r) / 2 - w / 2;
      y = side === 'bottom' ? R.b + g : R.t - g - hh;
    }
    x = Math.max(4, Math.min(W - w - 4, x));
    y = Math.max(4, Math.min(H - hh - 4, y));
    el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`;
    el.dataset.side = side;
  }
  function show(t) {
    if (!t.isConnected || !t.dataset.tip) return;
    cur = t; render(t);
    el.classList.add('measure');
    place(t);
    el.classList.remove('measure');
    el.classList.add('on'); open = true;
  }
  function hide() {
    clearTimeout(timer); timer = 0;
    if (open) lastHide = performance.now();
    open = false; cur = null;
    el.classList.remove('on');
  }
  function want(t) {
    // the same element again (the pointer crossing its own icon and label) neither restarts the wait nor flickers
    if (t === cur && (open || timer)) return;
    clearTimeout(timer);
    if (open) { el.classList.remove('on'); open = false; lastHide = performance.now(); }
    cur = t;
    const quick = performance.now() - lastHide < 800;
    timer = setTimeout(() => { timer = 0; show(t); }, quick ? 0 : 400);
  }

  U.root.addEventListener('pointerover', (ev) => {
    const t = ev.target.closest?.('[data-tip]');
    if (!t || !t.dataset.tip) { if (cur) hide(); return; }
    want(t);
  });
  U.root.addEventListener('pointerout', (ev) => {
    if (!cur) return;
    const to = ev.relatedTarget;
    if (!to || !cur.contains(to)) { const n = to?.closest?.('[data-tip]'); if (!n) hide(); }
  });
  U.root.addEventListener('pointerdown', hide, true);
  U.root.addEventListener('focusin', (ev) => {
    const t = ev.target.closest?.('[data-tip]');
    if (t && t.matches(':focus-visible')) want(t);
  });
  U.root.addEventListener('focusout', hide);
  U.tips = { hide, refresh: () => { if (open && cur) { render(cur); place(cur); } }, get current() { return open ? cur : null; } };
  return U.tips;
}
