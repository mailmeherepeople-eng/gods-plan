// The screen audit, a console helper: game.modules.ui.dev.audit(). It lists what breaks the screen's rules
// (DESIGN.md "Phone first"): a part of the interface past the window or in the unsafe strips at its edges, two parts
// lying over each other, text under 13 px, a target under 44 x 44 px. The phone rig (tools/phone-rig/) is the
// standing test on every device; this is the same check by hand, in whatever window is open.
const PARTS = '.tbox, .hud-tr, .door, .strip.on, .modes.on, .hist.on, .knobs.on, .startbtn, .startwarn.on, .forcesb, .sheet.on, .lesson.on';

export default [{
  type: 'panel', id: 'audit', region: 'root', order: 999,
  make(U) {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0.05 && !e.closest('[hidden]');
    U.audit = () => {
      const W = innerWidth, H = innerHeight, sa = U.safe?.() ?? { l: 0, r: 0, t: 0, b: 0 };
      const out = { off: [], unsafe: [], overlap: [], smallText: [], smallTarget: [] };
      const parts = [...U.root.querySelectorAll(PARTS)].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect(), n: e.className.split(' ').filter((c) => c !== 'isl' && c !== 'btn')[0] }));
      for (const p of parts) {
        const o = Math.max(-p.r.left, -p.r.top, p.r.right - W, p.r.bottom - H);
        if (o > 0.5) out.off.push(`${p.n} ${Math.round(o)}px`);
        if (p.r.left < sa.l - 0.5 || p.r.right > W - sa.r + 0.5 || p.r.bottom > H - sa.b + 0.5) out.unsafe.push(p.n);
      }
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i].r, b = parts[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1 && !parts[i].e.contains(parts[j].e) && !parts[j].e.contains(parts[i].e)) out.overlap.push(`${parts[i].n} x ${parts[j].n} ${Math.round(w)}x${Math.round(h)}`);
      }
      for (const el of U.root.querySelectorAll('*')) {
        if (!vis(el)) continue;
        if ([...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12.95) out.smallText.push(`${el.textContent.trim().slice(0, 24)} ${fs}px`); }
        if (el.matches('button, [role="checkbox"], label.tick')) { const r = el.getBoundingClientRect(); if (r.width < 43.5 || r.height < 43.5) out.smallTarget.push(`${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`); }
      }
      return out;
    };
    const el = document.createElement('span');
    el.hidden = true;
    return el;
  },
}];
