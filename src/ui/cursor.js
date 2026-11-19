// K, the cursor chip (UI-GUIDE 5.1, 5.5): 16 px right of and below the pointer,
// flipped at the edges. With a tool armed it shows the brush size, the height
// for land tools, and in words whether an act here is seen ("Seen by 3",
// "Unseen", "Unseen. Night."), because the sight wash is colour only. A
// god:refused text takes the chip over for 1.5 s, wherever the pointer is.
// Also L, the hint chip: one line at the bottom middle, a few seconds.
import { h, icon, esc } from './dom.js';

const SHORT = { mist: 'Lost in the mist.', protected: 'Not under the stone.',
  // the Cave tool's refusals (sim/caves.js plan)
  low: 'Raise the land first.', roof: 'The roof would break through.', thin: 'The hill is too thin.', wet: 'Too wet: it would flood.',
  taken: 'Too close to something built.', deep: 'Too deep to dig.', edge: 'Off the edge.' };

export function makeCursor(U) {
  const { ctx } = U;
  const chip = h('div', 'cchip');
  chip.setAttribute('aria-hidden', 'true');
  U.root.appendChild(chip);
  const hint = h('div', 'panel hchip');
  hint.setAttribute('role', 'status');
  U.root.appendChild(hint);

  let refused = null, html = '', hintT = 0;
  U.on('god:refused', (p) => {
    const text = p?.text || SHORT[p?.reason] || 'That cannot be done here.';
    // a finger has no pointer to follow: the words go to the hint at the bottom instead
    if (matchMedia('(pointer: coarse)').matches) { U.hint?.(text, 3000); return; }
    refused = { text, until: performance.now() + 1500 };
  });
  // o.head: a short first word or two in bold ("It helped", "Not yet"); o.kind: 'yes' (a tick) or 'no' (a cross)
  // for the answer to an act on a need (attend.js), which may run to two or three lines
  U.hint = (text, ms = 6000, o = {}) => {
    const ic = o.kind === 'yes' ? 'tick' : o.kind === 'no' ? 'close' : 'tip';
    hint.innerHTML = `${icon(ic, 20)}<span>${o.head ? `<b class="hc-h">${esc(o.head)}.</b> ` : ''}${esc(text)}</span>`;
    hint.dataset.kind = o.kind ?? '';
    hint.classList.add('on');
    hintT = performance.now() + ms;
    place(); placeT = performance.now();
  };
  // an answer's chip: centred in the map left of the side sheet when one is open, and stepped up above any part of the
  // interface it would lie on (the tool's modes, its settings, Undo and Redo, the door, the forces button)
  let placeT = 0;
  function place() {
    hint.style.left = ''; hint.style.bottom = '';
    if (!hint.dataset.kind) return;
    const sh = U.slot?.open && U.slot.el ? U.slot.el.getBoundingClientRect() : null;
    if (sh && sh.width) hint.style.left = `${Math.round(Math.max(hint.offsetWidth / 2 + 16, (sh.left - 8) / 2))}px`;
    let r = hint.getBoundingClientRect();
    for (const e of U.root.querySelectorAll('.modes, .knobs, .hist, .strip, .door, .forcesb, .startbtn')) {
      if (e.hidden || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') continue;
      const b = e.getBoundingClientRect();
      if (b.width && b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom) { hint.style.bottom = `${Math.round(innerHeight - b.top + 8)}px`; r = hint.getBoundingClientRect(); }
    }
  }

  // the armed power's "point at" words, read once per arming (god.tools is rebuilt on every read)
  let pointAt = '';
  U.on('god:tool', ({ id } = {}) => { pointAt = id ? ((U.get('god', 'tools') ?? []).find((x) => x.id === id)?.power?.pointAt ?? '') : ''; });
  const LAND = new Set(['raise', 'lower', 'flatten']);
  const GROUND = ctx.config?.WORLD?.GROUND_Y ?? 15;
  function seenLine(n) {
    const run = ctx.clock.phase === 'running';
    if (!run) return '';
    const night = (U.get('sim', 'stats')?.daylight ?? 1) < 0.3;
    if (n > 0) return `<span class="cc-seen on">${icon('seen', 18)}Seen by ${n}</span>`;
    return `<span class="cc-seen">${icon('unseen', 18)}${night ? 'Unseen. Night.' : 'Unseen'}</span>`;
  }

  function frame() {
    const now = performance.now();
    if (hintT && now > hintT) { hintT = 0; hint.classList.remove('on'); }
    if (hintT && hint.dataset.kind && now - placeT > 250) { placeT = now; place(); }
    const p = U.pointer;
    let out = '';
    if (refused && now < refused.until) {
      out = `<span class="cc-no">${icon('close', 16)}${esc(refused.text)}</span>`;
    } else {
      refused = null;
      const tool = U.get('god', 'tool');
      const c = tool && p.overCanvas ? U.get('god', 'cursor') : null;
      if (c) {
        const parts = [];
        if (c.power) {
          // any power: what the press does and who would see, or what to point at (the power's own words)
          const a = U.aim;
          if (a?.target) {
            const n = Number(a.forecast?.seenBy) || 0;
            if (a.targetKind === 'area' && Number.isFinite(c.size)) parts.push(`<span class="cc-t">${Math.round(c.size * 10) / 10} m</span>`);
            if (c.reason) parts.push(`<span class="cc-no">${esc(SHORT[c.reason] ?? 'Not here.')}</span>`);
            else {
              if (a.confirm === 'hold') parts.push(`<span class="cc-t">${c.hold > 0 ? 'Keep holding' : 'Press and hold'}</span>`);
              parts.push(seenLine(n));
            }
          } else {
            parts.push(`<span class="cc-t">${esc(pointAt || 'Point at something to use it on')}</span>`);
          }
        } else {
          if (Number.isFinite(c.size) && c.size > 0) parts.push(`<span class="cc-t">${c.tool === 'river' || c.tool === 'lake' ? `${Math.round(c.size * 2)} m wide` : `${Math.round(c.size * 10) / 10} m`}</span>`);
          if (LAND.has(c.tool) && Number.isFinite(c.top)) {
            const d = c.top - GROUND;
            parts.push(`<span class="cc-t">${d === 0 ? 'Level ground' : d > 0 ? `${d} m up` : `${-d} m down`}</span>`);
          }
          if (c.reason) parts.push(`<span class="cc-no">${esc(SHORT[c.reason] ?? 'Not here.')}</span>`);
          else parts.push(seenLine(Number(c.seenBy) || 0));
        }
        out = parts.filter(Boolean).join('');
      }
    }
    if (out !== html) { chip.innerHTML = out; html = out; chip.classList.toggle('on', !!out); }
    if (!out) return;
    const W = innerWidth, H = innerHeight;
    const w = chip.offsetWidth, hh = chip.offsetHeight;
    let x = p.x + 16, y = p.y + 16;
    if (x + w > W - 8) x = p.x - 16 - w;
    if (y + hh > H - 8) y = p.y - 16 - hh;
    chip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  U.frame.push(frame);
  return { chip, hint };
}
