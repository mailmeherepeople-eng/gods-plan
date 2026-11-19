// A power aimed and landed. The director (2026-11-14): the FULL both-futures card is for lives and acts that matter
// (a turning point, a live warning, a great person, a death); for an ordinary target the sheet shows a compact card
// of one or two lines (what it does, who sees) with the full card one tap away ("The whole price").
// The trade off (UI-GUIDE 5.6) shows in the side sheet on the right (slot.js), the one
// place for "what is this": god:aim's forecast ({ ok, gains, costs, who, seenBy, fates, later, confirm }) under the
// title and line the power's data gives, at most 10 renders a second; god:aim null takes it away. Under it the
// act itself, for a finger or for an aim the HUD made (a warning's "do this"): "Do it", or for a harsh power a
// button to press and hold, which fills as it is held. With the mouse, clicking the target on the map still acts.
// A person needs a press and hold (god:hold): a ring round them fills while the button is down.
// The landing (the director: "this game should give feeling of power. we are gods!"), restrained and real: no
// haze, nothing over the world for more than a moment. A strike: a short white flash, on a person a pale column
// of light and a ring spreading on the ground. Any other power: a gold ring spreading as wide as it reached. A
// heavy one (a strike, fire, flood, sickness) also gives the camera one short kick. Sound hooks by name:
// power.arm, power.<id>, power.witnessed, power.land.heavy.
import { h, icon, hasIcon, esc, markSvg, sign, sealIcon } from './dom.js';

const HEAVY = new Set(['strike', 'send-fire', 'send-flood', 'send-sickness']);

export function makePower(U) {
  const { ctx } = U;
  const card = h('div', 'tcard');
  card.setAttribute('role', 'status');
  card.innerHTML = '<div class="tc-in"></div><div class="tc-do acts-row"></div>';
  const inner = card.querySelector('.tc-in'), doRow = card.querySelector('.tc-do');
  U.slot.add('trade', card);
  // the hold ring: an SVG circle whose stroke fills linearly, on the person, in client px
  const ring = h('div', 'holdring');
  ring.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="hr-back" cx="32" cy="32" r="27"/><circle class="hr-fill" cx="32" cy="32" r="27" pathLength="100"/></svg><span class="hr-t">Hold</span>`;
  ring.hidden = true;
  U.world.appendChild(ring);
  const ringFill = ring.querySelector('.hr-fill');

  let aim = null, dirty = false, lastDraw = 0, hold = null;
  U.aim = null;

  const asText = (x) => {
    if (typeof x === 'string') return x;
    if (!x || typeof x !== 'object') return '';
    const what = x.text ?? x.change ?? (x.before && x.after ? `${x.before} Now: ${x.after}` : x.after ?? '');
    return [x.name, what].filter(Boolean).join(': ');
  };
  const row = (cls, ic, title, lines, max = 99) => {
    if (!lines.length) return '';
    const shown = lines.slice(0, max), more = lines.length - shown.length;
    return `<div class="tc-row ${cls}"><span class="tc-g">${icon(ic, 18)}</span><div class="tc-b"><div class="tc-l">${title}</div>${shown.map((g) => `<p>${esc(g)}</p>`).join('')}${more > 0 ? `<p class="tc-more">and ${more} more</p>` : ''}</div></div>`;
  };
  const LATER_ASIDES = ['You will know. You will not be there.', 'Not your watch. Not your problem, strictly.', 'Somebody else\'s century.'];
  const people = (n) => (n === 1 ? '1 person' : `${n} people`);
  let drawnSig = '', armed = null, fullFor = null;
  // does this act carry a life or a turn of the story? Then the full card (both futures, gains, costs, later)
  const DEATH = /\b(die|dies|died|death|dead|kill|killed|killing)\b/i;
  function matters(a, f, harsh) {
    const e = a.entity ?? a.target?.entity ?? null;
    if (harsh && (a.targetKind === 'person' || e?.kind === 'person')) return true;
    if (a.targetKind === 'grave') return true; // a life given back: always the whole card
    if (e?.ext?.resurrect?.times) return true; // the Resurrected matter
    if (e && (e.great || U.isTurning?.(e) || U.call('sim', 'ask', 'lineOf', e)?.blessed)) return true;
    if (U.attend?.armedFrom && U.attend.armedFrom.power === (a.power ?? 'strike')) return true;
    const lines = [...(f?.fates ?? []), ...(f?.costs ?? []), ...(f?.later ?? [])].map(asText);
    return lines.some((l) => DEATH.test(l));
  }
  const targetKey = (a) => `${a.power}|${a.entity?.id ?? a.target?.entity?.id ?? `${Math.round(a.target?.x ?? 0)},${Math.round(a.target?.z ?? 0)}`}`;
  function draw() {
    dirty = false; lastDraw = performance.now();
    // while a power is in hand its place in the slot stays (no target yet: what to point at), so the slot does
    // not flick between the trade off and what was under it as the pointer crosses the map
    if (!armed) { U.slot.hide('trade'); drawnSig = ''; doRow.dataset.k = ''; return; }
    if (!aim) {
      const ic0 = armed.power?.icon && hasIcon(armed.power.icon) ? armed.power.icon : 'strike';
      const html = `<div class="ph zz tc-head"><span class="badge tc-ic">${sealIcon(ic0, 36)}</span><div class="pw"><div class="pt tc-title">${esc(armed.power?.tip ?? armed.name)}</div><div class="ps tc-sub">${esc(U.touchy ? `${armed.power?.pointAt ?? 'Tap what to use it on'}. The first tap shows the price; tap again to act.` : `${armed.power?.pointAt ?? 'Point at what to use it on'}. The price shows here.`)}</div></div>${armed.hotkey ? `<kbd>${esc(armed.hotkey)}</kbd>` : ''}</div>`;
      card.classList.add('compact');
      card.classList.remove('bad', 'seen', 'person', 'harsh');
      fullFor = null;
      if (html !== drawnSig) { drawnSig = html; inner.innerHTML = html; }
      if (doRow.dataset.k !== 'none') { doRow.dataset.k = 'none'; doRow.innerHTML = ''; const x = h('button', 'btn tc-act tc-cancel', `${sign('putdown', 20)}<span>Put it down</span>`); x.type = 'button'; x.addEventListener('click', () => U.call('god', 'setTool', null)); doRow.appendChild(x); }
      U.slot.show('trade');
      return;
    }
    const f = aim.forecast ?? null;
    const tool = (U.get('god', 'tools') ?? []).find((x) => x.id === (aim.power ?? 'strike'));
    const key = tool?.hotkey ?? '';
    const ok = f ? f.ok !== false : true;
    const harsh = aim.confirm === 'hold' || f?.confirm === 'hold';
    const n = harsh ? 4 : 3;
    const gains = (f?.gains ?? []).map(asText).filter(Boolean);
    let costs = (f?.costs ?? []).map(asText).filter(Boolean);
    if (!costs.length && ok && !aim.chooser) costs = ['Nothing, this time.'];
    const fates = (Array.isArray(f?.fates) ? f.fates : []).map(asText).filter(Boolean);
    const later = (Array.isArray(f?.later) ? f.later : []).map(asText).filter(Boolean);
    const seen = Number(f?.seenBy) || 0;
    const night = (U.get('sim', 'stats')?.daylight ?? 1) < 0.3;
    const whoText = !ok ? '' : f?.who || (seen ? `Seen by ${seen}.` : night ? 'Unseen. It is night.' : 'Unseen.');
    // refused: the sim's own reason (R.refuse puts it in `who`), never the power's generic "point at someone"
    const why = !ok ? asText(f?.who) || asText(f?.text) || asText(f?.reason) || '' : '';
    // (a power may name its refusal: Resurrect's "Not ready yet")
    const title = !ok && why ? (f?.refuseTitle ?? `${tool?.name ?? 'This power'} will not take here`) : aim.title ?? tool?.name ?? 'A power';
    const sub = !ok && why ? why : aim.sub ?? '';
    const ic = aim.icon ?? tool?.power?.icon;
    let reach = '';
    if (aim.targetKind === 'clan') {
      const c = U.s2?.clanOf(aim.entity) ?? null;
      const name = c?.name ?? aim.aim?.clan?.name ?? aim.entity?.family?.name ?? '';
      const nm = aim.members?.length ?? c?.members?.length ?? 0;
      if (name) reach = `<div class="tc-reach">${clanChip(c, name)}<span>${esc(people(nm))}${c?.village?.name ? `, ${esc(c.village.name)}` : ''}</span></div>`;
    } else if (aim.targetKind === 'area' && Number.isFinite(aim.inside)) {
      const r = Number(aim.aim?.r);
      reach = `<div class="tc-reach">${icon('people', 18)}<span>${aim.inside ? `${esc(people(aim.inside))} inside the ring` : 'Nobody inside the ring'}${Number.isFinite(r) ? ` (${Math.round(r)} m)` : ''}</span></div>`;
    }
    const aside = LATER_ASIDES[Math.abs((title.length + later.length) % LATER_ASIDES.length)];
    // both futures, as the simulation tells them on the forecast (the choices agent's `forecast.futures`)
    const fu = ok ? f?.futures : null;
    const col = (cls, ic2, t, x) => `<section class="${cls}"><h4>${icon(ic2, 15)}<span>${t}</span></h4><p class="sd-hl">${esc(x?.headline ?? '-')}</p>${(x?.key ?? []).length ? `<ul class="sd-key">${x.key.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${(x?.full ?? []).length ? `<ul class="sd-full">${x.full.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</section>`;
    const futHtml = fu?.act && fu?.wait ? `<div class="fut tc-fut">${col('act', 'hand', 'If you act', fu.act)}${col('wait', 'hourglass', 'If you do nothing', fu.wait)}</div>
      ${fu.third ? `<div class="tc-third">${col('third', 'go', `Or: ${esc(fu.third.label ?? '')}`, fu.third)}</div>` : ''}
      <div class="seg tc-depth" role="group" aria-label="How much to show">${['Short', 'More', 'All'].map((l, i) => `<button class="btn chip seg-b" data-d="${i + 1}" type="button">${l}</button>`).join('')}</div>` : '';
    const full = !ok || matters(aim, f, harsh) || fullFor === targetKey(aim);
    card.classList.toggle('compact', !full);
    const head = `<div class="ph zz tc-head"><span class="badge tc-ic">${sealIcon(ic && hasIcon(ic) ? ic : 'strike', 36)}</span><div class="pw"><div class="pt tc-title">${esc(title)}</div><div class="ps tc-sub">${esc(U.touchy && ok ? sub.replace(/^Click/, 'Tap again').replace(/Press and hold(?! on)/, 'Press and hold on them') : sub)}</div></div>${key ? `<kbd>${esc(key)}</kbd>` : ''}</div>`;
    // an ordinary target: what it does and who sees, and the whole price one tap away
    const short = `${head}<p class="tc-one">${esc([gains[0] ?? fates[0] ?? '', whoText].filter(Boolean).join(' '))}</p><button class="btn chip tc-full" type="button">The whole price</button>`;
    const html = !full ? short : `
      ${head}
      ${reach}
      ${futHtml}
      ${row('tc-gain', 'plus', 'Gains', gains, n)}
      ${row('tc-cost', 'minus', 'Costs', costs, n)}
      ${row('tc-fate', 'flat', 'What changes', fates, n)}
      ${later.length ? row('tc-later', 'hourglass', 'Later, past your watch', later, 2).replace('</div></div>', `<p class="tc-aside">${esc(aside)}</p></div></div>`) : ''}
      ${whoText ? row('tc-who', seen ? 'seen' : 'unseen', 'Who sees', [whoText]) : ''}`;
    card.classList.toggle('bad', !ok);
    card.classList.toggle('seen', seen > 0);
    card.classList.toggle('person', harsh && ok);
    card.classList.toggle('harsh', harsh && ok);
    if (html !== drawnSig) { drawnSig = html; inner.innerHTML = html; }
    paintDepth();
    // the act, from here
    const want = ok ? (harsh ? 'hold' : 'click') : 'none';
    if (doRow.dataset.k !== want) {
      doRow.dataset.k = want;
      doRow.innerHTML = '';
      if (want === 'click') {
        const b = h('button', 'btn tc-act primary', `${icon(ic && hasIcon(ic) ? ic : 'strike', 20)}<span>Do it</span>`);
        b.type = 'button';
        b.addEventListener('click', () => U.call('god', 'fireNow'));
        doRow.appendChild(b);
      } else if (want === 'hold') {
        const b = h('button', 'btn tc-act tc-holdb', `<i></i>${icon(ic && hasIcon(ic) ? ic : 'strike', 20)}<span>Press and hold</span>`);
        b.type = 'button';
        holdButton(b);
        doRow.appendChild(b);
      }
      const x = h('button', 'btn tc-act tc-cancel', `${sign('putdown', 20)}<span>Put it down</span>`);
      x.type = 'button';
      x.addEventListener('click', () => U.call('god', 'setTool', null));
      doRow.appendChild(x);
    }
    U.slot.show('trade');
  }
  // the futures' depth: the same setting as the detail's (Short by default, one tap for more)
  function paintDepth() {
    const d = Number(U.settings.depth) || 1;
    if (card.dataset.depth !== String(d)) card.dataset.depth = String(d);
    for (const b of inner.querySelectorAll('.tc-depth .seg-b')) b.classList.toggle('on', Number(b.dataset.d) === d);
  }
  inner.addEventListener('click', (ev) => {
    if (ev.target.closest('.tc-full') && aim) { fullFor = targetKey(aim); drawnSig = ''; draw(); return; }
    const b = ev.target.closest('.tc-depth .seg-b');
    if (!b) return;
    U.settings.depth = Number(b.dataset.d); U.saveSettings(); paintDepth();
  });
  // the slot's own press and hold: the same time as on the map (god.holdMs)
  function holdButton(b) {
    let t0 = 0, raf = 0;
    const fill = b.querySelector('i'), label = b.querySelector('span');
    const stop = (done) => {
      cancelAnimationFrame(raf); raf = 0; t0 = 0;
      fill.style.transform = done ? 'scaleX(1)' : 'scaleX(0)';
      label.textContent = done ? 'Done' : 'Press and hold';
    };
    const tick = () => {
      const ms = Number(U.get('god', 'holdMs')) || 600;
      const p = Math.min(1, (performance.now() - t0) / ms);
      fill.style.transform = `scaleX(${p.toFixed(3)})`;
      label.textContent = 'Keep holding';
      if (p >= 1) { stop(true); U.call('god', 'fireNow'); return; }
      raf = requestAnimationFrame(tick);
    };
    b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); try { b.setPointerCapture(ev.pointerId); } catch { /* synthetic */ } t0 = performance.now(); U.sfx('power.hold'); raf = requestAnimationFrame(tick); });
    const up = () => { if (t0) { stop(false); U.sfx('power.cancel'); } };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && !t0 && !ev.repeat) { ev.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(tick); } });
    b.addEventListener('keyup', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') up(); });
  }
  function clanChip(c, name) {
    const dye = c?.dye ?? '#8C5A3C';
    return `<span class="clanchip" style="--dye:${esc(dye)}"><i class="cc-sw"></i>${c?.mark ? markSvg(c.mark, 14) : ''}<b>the ${esc(name)}</b></span>`;
  }
  U.on('god:aim', (p) => {
    aim = p && p.target ? p : null;
    U.aim = aim;
    dirty = true;
  });

  // ---------- the hold on the map ----------
  U.on('god:hold', (p) => {
    if (!p) return;
    if (p.state === 'start' || p.state === 'hold') {
      hold = p;
      ring.hidden = false;
      ring.classList.remove('gone', 'full');
      ringFill.style.strokeDashoffset = String(100 - Math.round((p.progress ?? 0) * 100));
    } else if (p.state === 'done') {
      ringFill.style.strokeDashoffset = '0';
      ring.classList.add('full');
      hold = null;
      setTimeout(() => { if (!hold) ring.hidden = true; }, 160);
    } else {
      hold = null;
      ring.classList.add('gone');
      setTimeout(() => { if (!hold) { ring.hidden = true; ring.classList.remove('gone'); } }, 130);
      if (!aim) draw();
    }
  });
  // the ring fills round the pointer (the finger, on a phone), where the eye already is; the target is locked anyway
  const ptr = { x: NaN, y: NaN };
  const track = (ev) => { ptr.x = ev.clientX; ptr.y = ev.clientY; };
  addEventListener('pointermove', track, { passive: true, capture: true });
  addEventListener('pointerdown', track, { passive: true, capture: true });
  function placeRing() {
    const t = hold?.target;
    if (!t || ring.hidden) return;
    let x = ptr.x, y = ptr.y;
    if (!Number.isFinite(x)) { const s = ctx.camera.toScreen(t.x, (t.y ?? 16) + 1, t.z); x = s.x; y = s.y; }
    ring.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
  U.frame.push(() => { if (dirty && performance.now() - lastDraw > 100) draw(); placeRing(); kickStep(); });
  U.on('god:tool', ({ id } = {}) => {
    const t = (U.get('god', 'tools') ?? []).find((x) => x.id === id);
    const power = t && (t.group === 'power' || t.family === 'power' || t.kind === 'power');
    armed = power ? t : null;
    if (!power) { aim = null; U.aim = null; }
    draw();
  });

  // ---------- the camera's kick on a heavy landing (off with reduced motion) ----------
  let kick = null;
  function kickStep() {
    if (!kick) return;
    const C = ctx.camera;
    const t = (performance.now() - kick.t0) / 1000;
    if (t < 0) return;   // (after the hold)
    if (t > 0.14 || C.anim) { kick = null; return; }
    // a short downward jolt that settles: the view itself, never a layer over it
    const a = kick.amp * Math.sin(t * 46) * Math.exp(-t * 11);
    const d = a - kick.last;
    kick.last = a;
    try { C.panPx(0, d); } catch { kick = null; }
  }
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // the ring on the ground at the power's TRUE size (research #14): the circle of radius r round the target is
  // projected through the camera (a tilted view makes it an ellipse), so its final size is exactly the reach;
  // it spreads in 350 ms after the 70 to 100 ms hold (delight.js holds the world), then fades
  function groundRing(x, z, r, cls, delay) {
    const y = ctx.vox?.standY?.(Math.floor(x), Math.floor(z)) ?? 16;
    const c = ctx.camera.toScreen(x, y, z);
    const ex = ctx.camera.toScreen(x + r, y, z), ez = ctx.camera.toScreen(x, y, z + r);
    const ex2 = ctx.camera.toScreen(x, y, z - r), ex3 = ctx.camera.toScreen(x - r, y, z);
    const rx = Math.max(6, Math.hypot(ex.x - c.x, ex.y - c.y), Math.hypot(ex3.x - c.x, ex3.y - c.y));
    const ry = Math.max(4, Math.abs(ez.y - c.y), Math.abs(ex2.y - c.y));
    if (c.behind) return;
    const el = h('div', `landring ${cls}`);
    el.style.width = `${(2 * rx).toFixed(1)}px`; el.style.height = `${(2 * ry).toFixed(1)}px`;
    // (left and top, set once: the ring's `scale` animation would scale a transform's translation and grow it out
    // of the top left corner, which is why it was never seen where the power landed)
    el.style.left = `${(c.x - rx).toFixed(1)}px`; el.style.top = `${(c.y - ry).toFixed(1)}px`;
    el.style.animationDelay = `${delay}ms`;
    U.world.appendChild(el);
    setTimeout(() => el.remove(), 900 + delay);
  }
  // the landing
  U.on('god:act', (p) => {
    if (!Number.isFinite(p?.x)) return;
    const id = p.power ?? p.kind;
    const big = HEAVY.has(id);
    // the Shake setting, 0 to 100: 0 takes all shake away
    const shake = Number.isFinite(Number(U.settings.shake)) ? Math.max(0, Math.min(100, Number(U.settings.shake))) : 100;
    if (big && !reduce() && shake > 0) kick = { t0: performance.now() + 90, amp: (id === 'strike' ? 3 : 2.5) * (shake / 100), last: 0 };
    if (big) U.sfx('power.land.heavy');
    const hold = big ? 100 : 70;
    if (p.kind !== 'strike' && p.power && p.power !== 'strike') {
      U.sfx(`power.${p.power}`);
      if (p.seenBy > 0) U.sfx('power.witnessed');
      if (reduce()) return;
      groundRing(p.x, p.z, Math.max(1.5, Number(p.r) || 2), 'gold', hold);
      return;
    }
    if (p?.kind !== 'strike') return;
    const y = p.target?.y ?? 16;
    const s = ctx.camera.toScreen(p.x, y, p.z);
    const person = p.targetKind === 'person' || p.target?.kind === 'person';
    const at = `translate(${s.x}px, ${s.y}px)`;
    // (the flash stays small and single, on a person too: research 4.4)
    const f = h('div', 'flash');
    f.style.transform = at;
    U.world.appendChild(f);
    setTimeout(() => f.remove(), 400);
    const col = h('div', 'pillar');
    col.style.transform = at;
    col.style.setProperty('--h', `${Math.max(120, s.y + 40)}px`);
    U.world.append(col);
    setTimeout(() => { col.remove(); }, 1000);
    if (!reduce()) groundRing(p.x, p.z, Math.max(1.5, Number(p.r) || 3), 'white', hold);
    U.sfx('power.strike');
    if (p.seenBy > 0) U.sfx('power.witnessed');
  });
  return { card, ring };
}
