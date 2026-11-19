// The World (the director, 2026-11-13: "there is no need for faith to be shown all the time"; 2026-11-14: always on
// screen, small, the three-cornered forces shape with the number of people and families). Bottom right once time
// runs: the forces button, the shape with people and families beside it; a tap opens the World in the side sheet.
// Everything about the people as a whole:
//   People         the three forces as one three-cornered shape (Faith, Skepticism, Strength: the further a corner
//                  sticks out, the more of that force; even is healthy, lopsided is trouble), its state in plain
//                  words and what it is doing to them; the count of people, families, homes and farms; Earth;
//                  great people and blessed lines; the hardships open now
//   Commandments   the six, at most two standing (as the Tablet had them)
//   Discoveries    what they found, against Earth's dates, and the next few
//   Clans          every clan and village, their grudges, "Show clans on the map"
// When a great person dies (force:fell) the shape drops at that corner in front of you, and the old outline
// stays a while, dashed, so the loss is seen.
// Reads (code against the names the forces agent gives; any may be missing): sim.ask('forces'),
// ask('forcesOf', clan), ask('great'), ask('lines'); sim.stats.faith / skepticism / strength; signals
// force:fell, force:great, line:blessed, line:lost.
import { h, icon, tip, esc, yearLabel, markSvg, setAttr, setText, setHidden } from './dom.js';

const TABS = [['people', 'People', 'forces'], ['commandments', 'Commandments', 'tablet'], ['discoveries', 'Discoveries', 'spark'], ['clans', 'Clans', 'clan']];
const heat = (v) => (v >= 0.75 ? 'boiling over' : v >= 0.5 ? 'hot' : v >= 0.25 ? 'simmering' : v > 0.02 ? 'a little' : 'none');
const FORCES = [['faith', 'Faith', 'faith'], ['skepticism', 'Skepticism', 'skepticism'], ['strength', 'Strength', 'strength']];
// DESIGN.md "Three forces": what too much or too little of each does, in plain words
const TOO = {
  faith: ['They wait for you. Work slows, fields fail, nobody trains or questions.', 'Only loud miracles reach them, and in battle your powers are weak.'],
  skepticism: ['Belief dries up: your quiet powers stop taking.', 'Nothing is invented. Sickness kills more, fields yield less, they fall behind Earth.'],
  strength: ['Warlords. Raids multiply and thinkers are pushed aside.', 'Soft. Wolves and raids kill more; in battle they break and run.'],
};
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

export default [{
  type: 'panel', id: 'world', region: 'root', order: 20,
  make(U) {
    const stub = h('span', 'wd-stub');
    stub.hidden = true;
    const el = U.slot.add('world', h('div', 'wd'));
    el.innerHTML = `<div class="ph zz"><span class="badge">${icon('forces', 22)}</span><div class="pw"><div class="pt">World</div><div class="ps wd-date"></div></div>
        <button class="btn ico quiet wd-x" type="button" aria-label="Close the World">${icon('close', 20)}</button></div>
      <div class="wd-tabs tabs" role="tablist"></div><div class="wd-body"></div>`;
    el.querySelector('.wd-x').addEventListener('click', () => U.slot.hide('world'));
    const tabsEl = el.querySelector('.wd-tabs'), body = el.querySelector('.wd-body');
    const tabBtns = {};
    for (const [id, label, ic] of TABS) {
      const b = h('button', 'btn wd-tab', `<span>${label}</span>`);
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = id;
      b.addEventListener('click', () => show(id));
      tabsEl.appendChild(b);
      tabBtns[id] = b;
    }
    let tab = 'people', sig = '', picked = null, replace = null;
    const isOpen = () => U.slot.shown === 'world';
    function show(t) { tab = t; picked = null; replace = null; sig = ''; render(); }

    // ---------- the three forces ----------
    const ask = (n, ...a) => U.call('sim', 'ask', n, ...a);
    function forces() {
      const f = ask('forces');
      const st = U.get('sim', 'stats') ?? {};
      const pick = (...v) => { for (const x of v) { const n = num(x); if (n != null) return n; } return null; };
      const o = {
        faith: pick(f?.faith, f?.F, f?.levels?.faith, st.faith),
        skepticism: pick(f?.skepticism, f?.skep, f?.doubt, f?.levels?.skepticism, st.skepticism),
        strength: pick(f?.strength, f?.S, f?.levels?.strength, st.strength),
        label: f?.state?.label ?? f?.label ?? f?.band ?? null,
        text: f?.state?.text ?? f?.text ?? f?.words ?? null,
        doing: Array.isArray(f?.effects) ? f.effects : Array.isArray(f?.doing) ? f.doing : f?.effects ? [String(f.effects)] : [],
        live: !!f, raw: f ?? null,
      };
      return o;
    }
    // the state in words: the simulation's own when it gives them, else read from the shape
    function words(F) {
      if (F.label) return [String(F.label), [F.text, ...F.doing].filter(Boolean).map(String)];
      const v = FORCES.map(([k]) => [k, F[k]]).filter(([, x]) => x != null);
      if (v.length < 2) return ['No people yet', []];
      if (v.length < 3 && Math.abs(v[0][1] - v[1][1]) < 15) return ['Faith and skepticism about even', ['Strength is not measured yet.']];
      const hi = v.reduce((a, b) => (b[1] > a[1] ? b : a)), lo = v.reduce((a, b) => (b[1] < a[1] ? b : a));
      const name = (k) => FORCES.find((x) => x[0] === k)[1].toLowerCase();
      if (hi[1] - lo[1] < 15) return ['Even, and healthy', ['No force starves another. Keep it so.']];
      const out = [];
      if (hi[1] >= 60) out.push(`Too much ${name(hi[0])}: ${TOO[hi[0]][0]}`);
      if (lo[1] <= 30) out.push(`Too little ${name(lo[0])}: ${TOO[lo[0]][1]}`);
      return [hi[1] - lo[1] >= 35 ? `Lopsided toward ${name(hi[0])}` : `Leaning toward ${name(hi[0])}`, out.length ? out : [`${FORCES.find((x) => x[0] === hi[0])[1]} is ahead of ${name(lo[0])}.`]];
    }
    // the shape: corners at 90 (Faith, top), 210 (Strength, bottom left), 330 (Skepticism, bottom right) degrees
    const ANG = { faith: -90, strength: 150, skepticism: 30 };
    const CX = 110, CY = 104, RMAX = 80;
    const pt = (k, v) => { const a = ANG[k] * Math.PI / 180, r = RMAX * Math.max(0.04, Math.min(1, (v ?? 0) / 100)); return [CX + Math.cos(a) * r, CY + Math.sin(a) * r]; };
    const poly = (o) => FORCES.map(([k]) => pt(k, o[k]).map((n) => n.toFixed(1)).join(',')).join(' ');
    const shown = { faith: null, skepticism: null, strength: null };
    let ghost = null, ghostUntil = 0, fellAt = null, lastTgt = null;
    const svgHtml = () => {
      const frame = FORCES.map(([k]) => pt(k, 100).join(',')).join(' ');
      const even = FORCES.map(([k]) => pt(k, 50).join(',')).join(' ');
      const axes = FORCES.map(([k]) => { const [x, y] = pt(k, 100); return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
      const lab = (k, l, dx, dy, anchor) => { const [x, y] = pt(k, 100); return `<text class="fz-lab fz-${k}" x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${l}</text>`; };
      return `<svg class="fz" viewBox="0 0 220 200" role="img" aria-label="The three forces">
        <polygon class="fz-frame" points="${frame}"/><polygon class="fz-even" points="${even}"/><g class="fz-axes">${axes}</g>
        <polygon class="fz-ghost" points=""/><polygon class="fz-shape" points=""/>
        <circle class="fz-dot fz-d-faith" r="4"/><circle class="fz-dot fz-d-skepticism" r="4"/><circle class="fz-dot fz-d-strength" r="4"/>
        ${lab('faith', 'Faith', 0, -8, 'middle')}${lab('strength', 'Strength', -2, 18, 'start')}${lab('skepticism', 'Skepticism', 2, 18, 'end')}
      </svg>`;
    };
    function paintShape(F, dt) {
      const svg = body.querySelector('.fz');
      if (!svg) return;
      // the shape changed while in view (research #25): the old shape stays as a dotted outline for 2 s, and a soft
      // slide rises if the shape grew more even, falls if more lopsided
      const tgt = FORCES.map(([k]) => (F[k] == null ? null : Math.round(F[k])));
      if (lastTgt && tgt.some((v, i) => v != null && lastTgt[i] != null && Math.abs(v - lastTgt[i]) >= 1) && !(fellAt && performance.now() < ghostUntil)) {
        ghost = { ...shown }; ghostUntil = performance.now() + 2000; fellAt = null;
        const spread = (a) => { const v = a.filter((x) => x != null); return v.length ? Math.max(...v) - Math.min(...v) : 0; };
        U.sfx(spread(tgt) <= spread(lastTgt) ? 'shape.even' : 'shape.lop');
      }
      lastTgt = tgt;
      // the shape eases toward the true values (a drop is seen, never jumped), on a light spring
      let moving = false;
      for (const [k] of FORCES) {
        const want = F[k];
        if (want == null) { shown[k] = null; continue; }
        if (shown[k] == null) shown[k] = want;
        const d = want - shown[k];
        if (Math.abs(d) > 0.05) { shown[k] += d * Math.min(1, dt * 2.2); moving = true; } else shown[k] = want;
      }
      const p = poly(shown);
      const s = svg.querySelector('.fz-shape');
      if (s.getAttribute('points') !== p) s.setAttribute('points', p);
      for (const [k] of FORCES) {
        const [x, y] = pt(k, shown[k]);
        const c = svg.querySelector(`.fz-d-${k}`);
        setAttr(c, 'cx', x.toFixed(1)); setAttr(c, 'cy', y.toFixed(1));
        c.classList.toggle('fell', fellAt === k && performance.now() < ghostUntil);
      }
      const g = svg.querySelector('.fz-ghost');
      const gp = ghost && performance.now() < ghostUntil ? poly(ghost) : '';
      if (g.getAttribute('points') !== gp) g.setAttribute('points', gp);
      g.classList.toggle('move', !fellAt);
      return moving;
    }
    U.on('force:fell', (e) => {
      const F = forces();
      const k = String(e?.force ?? '').toLowerCase();
      if (!FORCES.some(([x]) => x === k)) return;
      // the world's shape before the loss: the clan's drop shows as the whole people's corner pulled in by the same share
      ghost = { ...shown };
      if (ghost[k] == null) ghost[k] = F[k];
      const from = num(e?.from), to = num(e?.to);
      if (from != null && to != null && from > 0 && F[k] != null) { ghost[k] = Math.max(F[k], F[k] * from / Math.max(1, to)); shown[k] = ghost[k]; }
      fellAt = k; ghostUntil = performance.now() + 60000;
      sig = '';
    });

    // ---------- People ----------
    function renderPeople() {
      const F = forces();
      const st = U.get('sim', 'stats') ?? {};
      const [state, lines] = words(F);
      const E = U.s2.earth();
      const great = arr(ask('great')).map(normGreat).filter(Boolean);
      const allLines = arr(ask('lines')).filter(Boolean);
      const blessed = allLines.filter((l) => l.blessed);
      const watched = allLines.filter((l) => !l.blessed);
      const chiefs = arr(F.raw?.chiefs);
      const hard = U.s2.hardships();
      const clans = U.s2.clans();
      const villages = clans.filter((c) => c.village?.name).length;
      const val = (k) => (F[k] == null ? '-' : String(Math.round(F[k])));
      body.innerHTML = `<div class="wd-forces">${svgHtml()}<div class="wd-fz-t">
          <div class="wd-state">${esc(state)}</div>${lines.slice(0, 3).map((l) => `<p class="wd-doing">${esc(l)}</p>`).join('')}
          <dl class="wd-fz-n">${FORCES.map(([k, l, ic]) => `<dt>${icon(ic, 16)}${l}</dt><dd class="fz-v-${k}">${val(k)}</dd>`).join('')}</dl></div></div>
        <div class="wd-counts">${[['people', st.wanderers > 0 && Number.isFinite(st.settled) ? `People (${st.settled} settled)` : 'People', st.population], ['family', st.wanderingFamilies > 0 && Number.isFinite(st.settledFamilies) ? `Families (${st.settledFamilies} settled)` : 'Families', st.families], ['hut', 'Homes', st.homes], ['field', 'Farms', st.farms]].map(([ic, l, v]) => `<div class="wd-c">${icon(ic, 20)}<b>${Number.isFinite(v) ? Math.round(v) : '-'}</b><span>${l}</span></div>`).join('')}</div>
        ${U.faith ? '<div class="wd-links"><button class="btn chip wd-ledger" type="button">Why? The faith ledger</button><button class="btn chip wd-how" type="button">How faith works</button></div>' : ''}
        ${E ? `<button class="wd-row wd-earth" type="button">${icon('earth', 20)}<span>${E.ahead > 0 ? `Ahead of Earth by ${yrs(E.ahead)}` : E.ahead < 0 ? `Behind Earth by ${yrs(E.ahead)}` : 'Level with Earth'}${E.next?.name ? `. Next: ${esc(String(E.next.name).toLowerCase())}.` : ''}</span></button>` : ''}
        <h4 class="wd-h">Great people</h4>
        ${great.length ? `<div class="wd-list">${great.map((g) => `<button class="wd-row wd-great" type="button" data-id="${esc(g.id)}">${icon('great', 20)}<span><b>${esc(g.name)}</b>${g.force ? `, ${esc(g.force)}` : ''}${g.clan ? `, of the ${esc(g.clan)}` : ''}</span></button>`).join('')}</div>` : '<p class="wd-none">None yet. Some rise by themselves; a line you help many times raises one in each generation.</p>'}
        <h4 class="wd-h">Blessed lines</h4>
        ${blessed.length ? `<div class="wd-list">${blessed.map((l) => `<div class="wd-row">${icon('line', 20)}<span><b>${esc(cap1(l.name ?? 'A line'))}</b>${l.lead ? `, in ${esc(l.lead)}` : ''}${Number.isFinite(l.members) ? `, ${l.members} living` : ''}${Number.isFinite(l.total) && Number.isFinite(l.keepAt) ? `. Marks ${r1(l.total)}, kept above ${r1(l.keepAt)}` : ''}</span></div>`).join('')}</div>` : '<p class="wd-none">None yet. Help one family again and again, and you are watching them.</p>'}
        ${watched.length ? `<h4 class="wd-h">Lines you are watching</h4><div class="wd-list">${watched.slice(0, 4).map((l) => `<div class="wd-row">${icon('line', 20)}<span><b>${esc(cap1(l.name ?? 'A line'))}</b>${Number.isFinite(l.total) && Number.isFinite(l.blessAt ?? l.need) ? `: ${r1(l.total)} of ${r1(l.blessAt ?? l.need)} to be blessed` : ''}</span></div>`).join('')}</div>` : ''}
        ${chiefs.length ? `<h4 class="wd-h">Chiefs</h4><div class="wd-list">${chiefs.map((c) => `<div class="wd-row">${icon('chief', 20)}<span><b>${esc(c.name ?? c.person?.name ?? 'Someone')}</b>${c.village ? `, of ${esc(c.village?.name ?? c.village)}` : ''}</span></div>`).join('')}</div>` : ''}
        <h4 class="wd-h">Clans and villages</h4>
        <p class="wd-line">${clans.length ? `${clans.length} ${clans.length === 1 ? 'clan' : 'clans'}, ${villages} ${villages === 1 ? 'village' : 'villages'} of their own.` : 'Nobody has settled yet.'} <button class="btn chip wd-go" data-tab="clans" type="button">See them</button></p>
        <h4 class="wd-h">Hardships now</h4>
        ${hard.length ? `<div class="wd-list">${hard.map((x) => `<button class="wd-row wd-hard" type="button" data-x="${x.x}" data-z="${x.z}">${icon(x.kind === 'sickness' ? 'sick' : x.kind, 20)}<span>${esc(x.text ?? hardWord(x))}</span></button>`).join('')}</div>` : '<p class="wd-none">None. Enjoy it.</p>'}`;
      body.querySelector('.wd-earth')?.addEventListener('click', () => show('discoveries'));
      body.querySelector('.wd-ledger')?.addEventListener('click', () => U.faith?.open('ledger'));
      body.querySelector('.wd-how')?.addEventListener('click', () => U.faith?.open('how'));
      body.querySelector('.wd-go')?.addEventListener('click', () => show('clans'));
      body.querySelectorAll('.wd-hard').forEach((b) => b.addEventListener('click', () => { U.slot.hide('world'); U.glide(Number(b.dataset.x), Number(b.dataset.z), { sheet: false }); }));
      body.querySelectorAll('.wd-great').forEach((b) => b.addEventListener('click', () => { const g = great.find((x) => String(x.id) === b.dataset.id); if (g?.person) U.glide(g.person.x, g.person.z, { then: () => U.select?.(g.person) }); }));
      paintShape(F, 0);
      // counts tick from what they were to what they are, rather than jump (only when one changed while in view)
      for (const el2 of body.querySelectorAll('.wd-c b, .wd-fz-n dd')) {
        const key = el2.parentElement.textContent.replace(/[-\d\s]+/g, '') + el2.className;
        const to = Number(el2.textContent);
        const from = shownNums.get(key);
        shownNums.set(key, to);
        if (!Number.isFinite(to) || !Number.isFinite(from) || from === to || reduceM()) continue;
        tick(el2, from, to);
      }
    }
    const shownNums = new Map();
    const reduceM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick(el2, from, to) {
      const t0 = performance.now(), dur = Math.min(900, 250 + Math.abs(to - from) * 40);
      el2.classList.toggle('down', to < from); el2.classList.toggle('up', to > from);
      const step = () => {
        if (!el2.isConnected) return;
        const k = Math.min(1, (performance.now() - t0) / dur);
        const v = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
        if (el2.textContent !== String(v)) el2.textContent = String(v);
        if (k < 1) requestAnimationFrame(step); else { el2.classList.remove('down', 'up'); U.sfx(to < from ? 'count.down' : 'count.up'); }
      };
      el2.textContent = String(from);
      requestAnimationFrame(step);
    }
    const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v).find(Array.isArray) ?? [] : []);
    const yrs = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'year' : 'years'}`;
    const cap1 = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
    const r1 = (v) => String(Math.round(Number(v) * 10) / 10);
    const hardWord = (x) => ({ sickness: 'Sickness', fire: 'Fire', flood: 'Flood', drought: 'Drought', hunger: 'Hunger' }[x.kind] ?? 'Trouble');
    function normGreat(g) {
      if (!g) return null;
      const p = g.person ?? (g.kind === 'person' ? g : null);
      return { id: g.id ?? p?.id ?? g.name ?? p?.name, name: g.title ?? p?.name ?? g.name ?? 'Someone', force: g.kind ? `a great ${g.kind}` : g.force ?? g.in ?? null, clan: g.clan?.name ?? (typeof g.clan === 'string' ? g.clan : null) ?? p?.family?.name ?? null, person: p };
    }

    // ---------- commandments ----------
    function forecastFor(c, rep) { return U.call('sim', 'forecast', 'commandment', { kind: 'none', args: { commandment: c.id, on: !c.active, replace: rep ?? null } }) ?? null; }
    const rows = (cls, ic, label, list) => (list?.length ? `<div class="tc-row ${cls}"><span class="tc-g">${icon(ic, 16)}</span><div class="tc-b"><div class="tc-l">${label}</div>${list.map((x) => `<p>${esc(typeof x === 'string' ? x : x?.text ?? '')}</p>`).join('')}</div></div>` : '');
    function forecastHtml(f) {
      if (!f) return '<p class="tb-note">No forecast: the minds are not awake yet.</p>';
      if (f.ok === false) return `<p class="tb-note">${esc(f.who || 'This cannot be done now.')}</p>`;
      return `<div class="tb-fc">${rows('tc-gain', 'plus', 'Gains', f.gains)}${rows('tc-cost', 'minus', 'Costs', f.costs)}${rows('tc-fate', 'flat', 'What changes', f.fates)}${rows('tc-later', 'hourglass', 'Later, past your watch', f.later)}${f.who ? rows('tc-who', f.seenBy ? 'seen' : 'unseen', 'Who hears', [f.who]) : ''}</div>`;
    }
    function renderCommandments() {
      const C = U.s2.commandments();
      if (!C.all.length) { body.innerHTML = `<div class="tb-empty">${icon('tablet', 32)}<p><b>No commandments can be given yet.</b></p><p>Once your people's minds are awake you may set them standing rules. They obey in proportion to their faith.</p></div>`; return; }
      const act = C.all.filter((c) => c.active);
      const live = C.live && U.ctx.clock.phase === 'running';
      let html = `<p class="tb-lead">${act.length} of ${C.max} standing. Each person obeys in proportion to their faith, even when it hurts them. Giving or taking one back is heard by everyone awake.</p><div class="cm-list">`;
      for (const c of C.all) {
        const on = picked === c.id;
        const share = c.of ? c.obey / c.of : 0;
        html += `<div class="cm ${c.active ? 'active' : ''} ${on ? 'open' : ''}" data-id="${esc(c.id)}">
          <button class="cm-h" type="button" aria-expanded="${on}"><span class="cm-n">${esc(c.name)}</span>${c.active ? '<span class="cm-on">Standing</span>' : ''}${icon(on ? 'less' : 'expand', 18)}</button>
          <p class="cm-g">${icon('plus', 14)}<span>${esc(c.benefit)}</span></p><p class="cm-r">${icon('minus', 14)}<span>${esc(c.risk)}</span></p>
          ${c.active && c.obey != null ? `<div class="cm-ob"><span class="cm-ob-l">Obeyed by ${c.obey} of ${c.of}</span><span class="cm-ob-b"><i style="width:${Math.round(share * 100)}%"></i></span></div>` : ''}
          ${on ? `<div class="cm-x">${forecastHtml(forecastFor(c, replace))}<div class="cm-acts"></div></div>` : ''}</div>`;
      }
      body.innerHTML = `${html}</div>`;
      body.querySelectorAll('.cm-h').forEach((b) => b.addEventListener('click', () => { const id = b.parentElement.dataset.id; picked = picked === id ? null : id; replace = null; sig = ''; render(); }));
      const box = body.querySelector('.cm.open .cm-acts');
      if (!box) return;
      const c = C.all.find((x) => x.id === picked);
      const btn = (label, cls, fn, rep) => {
        const b = h('button', `btn chip ${cls}`, `<span>${esc(label)}</span>`);
        b.type = 'button'; b.disabled = !live;
        if (!live) tip(b, label, U.ctx.clock.phase !== 'running' ? 'Once time runs.' : 'Not yet: the minds are not awake.');
        b.addEventListener('click', fn);
        if (rep !== undefined) b.addEventListener('pointerenter', () => { if (replace !== rep) { replace = rep; const x = body.querySelector('.cm.open .tb-fc, .cm.open .tb-note'); if (x) x.outerHTML = forecastHtml(forecastFor(c, rep)); } });
        box.appendChild(b);
      };
      const issue = (rep) => {
        const res = U.call('god', 'perform', 'commandment', { kind: 'none', args: { commandment: c.id, on: !c.active, replace: rep ?? null } });
        if (res?.ok) { U.hint?.(c.active ? `${c.name}: taken back. Everyone awake heard it.` : `${c.name}: your word is heard.`, 4000); picked = null; replace = null; }
        sig = ''; render();
      };
      if (c.active) btn('Take it back', '', () => issue(null));
      else if (act.length < C.max) btn('Give this commandment', 'primary', () => issue(null));
      else for (const a of act) btn(`Instead of ${a.name.toLowerCase()}`, 'primary', () => issue(a.id), a.id);
    }

    // ---------- discoveries ----------
    function renderDiscoveries() {
      const D = U.s2.discoveries(), E = U.s2.earth();
      let html = E ? `<div class="ds-sum" data-side="${E.ahead > 0 ? 'ahead' : E.ahead < 0 ? 'behind' : 'level'}">${icon('earth', 22)}<span>${E.ahead > 0 ? `Ahead of Earth by ${yrs(E.ahead)}` : E.ahead < 0 ? `Behind Earth by ${yrs(E.ahead)}` : 'Level with Earth'}</span></div>` : '';
      if (!D.made.length && !D.next.length) { body.innerHTML = `${html}<div class="tb-empty">${icon('spark', 32)}<p><b>No discoveries yet.</b></p><p>People who work, and are free to question, think of new things in time. Earth found pottery and the plough long before writing.</p></div>`; return; }
      html += '<h4 class="tb-h">Made</h4>';
      if (!D.made.length) html += '<p class="tb-note">Nothing yet. Somebody is thinking about it.</p>';
      html += '<div class="ds-list">';
      for (const d of [...D.made].reverse()) {
        const diff = d.earthYear != null && d.year != null ? d.earthYear - d.year : null;
        const fx = U.s2.effectWords(d.effects);
        html += `<button class="ds" type="button" data-id="${esc(d.id)}" ${Number.isFinite(d.x) ? '' : 'disabled'}><span class="ds-ic">${icon('spark', 20)}</span><span class="ds-t"><b>${esc(d.name)}</b>
          <span class="ds-y">${d.year != null ? yearLabel(d.year) : ''} ${d.person?.name ? `by ${esc(d.person.name)}` : ''}</span>
          ${d.earthYear != null ? `<span class="ds-e">Earth: ${yearLabel(d.earthYear)}${diff != null ? `, ${diff > 0 ? `${yrs(diff)} after you` : diff < 0 ? `${yrs(diff)} before you` : 'the same year'}` : ''}</span>` : ''}
          ${fx.length ? `<span class="ds-fx">Brings ${esc(fx.join(', '))}.</span>` : ''}</span></button>`;
      }
      html += '</div>';
      if (D.next.length) {
        html += '<h4 class="tb-h">Next</h4><div class="ds-list ds-next">';
        for (const d of D.next.slice(0, 4)) html += `<div class="ds"><span class="ds-ic">${icon('open', 20)}</span><span class="ds-t"><b>${esc(d.name)}</b>${d.earthYear != null ? `<span class="ds-e">Earth had it by ${yearLabel(d.earthYear)}</span>` : ''}</span></div>`;
        html += '</div>';
      }
      body.innerHTML = html;
      body.querySelectorAll('button.ds').forEach((b) => b.addEventListener('click', () => {
        const d = D.made.find((x) => String(x.id) === b.dataset.id);
        if (!d) return;
        const pick = () => { if (d.person && typeof d.person === 'object') U.select(d.person); };
        if (Number.isFinite(d.x)) U.glide(d.x, d.z, { then: pick }); else pick();
      }));
    }

    // ---------- clans ----------
    function renderClans() {
      const list = U.s2.clans();
      const shownOn = !!U.clanmap?.shown;
      let html = `<div class="cl-top"><button class="btn chip cl-show ${shownOn ? 'on' : ''}" type="button" aria-pressed="${shownOn}">${icon(shownOn ? 'met' : 'open', 18)}<span>Show clans on the map</span></button></div>`;
      if (!list.length) html += `<div class="tb-empty">${icon('clan', 32)}<p><b>No clans yet.</b></p><p>Each family that settles is a clan, with its own colour and mark. Clans that marry merge; those who settle apart make their own village.</p></div>`;
      else {
        html += '<div class="cl-list">';
        for (const c of list) {
          const f = Number.isFinite(c.faith) ? Math.round(c.faith) : null;
          const gr = c.grudges.filter((g) => g.level > 0.02).sort((a, b) => b.level - a.level);
          const cf = ask('forcesOf', c.raw ?? c.id);
          const cs = num(cf?.strength);
          html += `<div class="cl" style="--dye:${esc(c.dye)}" data-id="${esc(c.id)}">
            <button class="cl-h" type="button"><i class="cc-sw"></i>${markSvg(c.mark, 16)}<span class="cl-n">the ${esc(c.name)}</span>${c.favoured ? `<span class="cl-fav" title="Your favourite. Nobody knows.">${icon('favour', 16)}</span>` : ''}<span class="cl-m">${c.members.length}</span></button>
            <p class="cl-v">${c.village?.name ? `${icon('village', 14)}<span>${esc(c.village.name)}</span>` : '<span>No village of their own</span>'}${f != null ? `<span class="cl-f" title="Average faith ${f}"><span class="cl-fl">Faith</span><span class="mini-bar"><i style="width:${f}%"></i></span><span class="cl-fn">${f}</span></span>` : ''}${cs != null ? `<span class="cl-f" title="Strength ${Math.round(cs)}"><span class="cl-fl">Strength</span><span class="cl-fn">${Math.round(cs)}</span></span>` : ''}</p>
            ${gr.length ? `<div class="cl-g"><span class="cl-gl">Grudges</span>${gr.slice(0, 4).map((g) => `<span class="cl-gr" data-heat="${heat(g.level).split(' ')[0]}"><span class="cl-gn">${esc(g.name ?? U.s2.clanName(g.clan))}</span><span class="cl-gb"><i style="width:${Math.round(g.level * 100)}%"></i></span><span class="cl-gw">${heat(g.level)}</span></span>`).join('')}</div>` : '<p class="cl-none">No grudges.</p>'}
          </div>`;
        }
        html += '</div>';
      }
      body.innerHTML = html;
      body.querySelectorAll('.cl-h').forEach((b) => b.addEventListener('click', () => {
        const c = U.s2.clanById(b.parentElement.dataset.id);
        if (!c) return;
        const show = () => U.inspect?.showClan?.(c);
        if (c.village && Number.isFinite(c.village.x)) U.glide(c.village.x, c.village.z, { then: show }); else show();
      }));
      body.querySelector('.cl-show')?.addEventListener('click', () => { U.clanmap?.setShown(!U.clanmap.shown); sig = ''; render(); });
    }

    function sigOf() {
      if (tab === 'people') {
        const F = forces(), st = U.get('sim', 'stats') ?? {};
        return JSON.stringify([F.label, F.text, FORCES.map(([k]) => Math.round(F[k] ?? -1)), st.population, st.settled, st.families, st.settledFamilies, st.homes, st.farms, U.s2.earth()?.ahead,
          arr(ask('great')).length, arr(ask('lines')).length, U.s2.hardships().map((x) => x.id), U.s2.clans().length, ghostUntil > performance.now()]);
      }
      if (tab === 'commandments') { const C = U.s2.commandments(); return JSON.stringify([C.all.map((c) => [c.id, c.active, c.obey]), picked, U.ctx.clock.phase]); }
      if (tab === 'discoveries') return JSON.stringify([U.s2.discoveries().made.length, U.s2.discoveries().next.map((d) => d.id), U.s2.earth()?.ahead]);
      return JSON.stringify([U.s2.clans().map((c) => [c.id, c.members.length, Math.round(c.faith ?? 0), c.favoured, c.grudges.map((g) => Math.round(g.level * 20))]), U.clanmap?.shown]);
    }
    function render() {
      if (!isOpen()) return;
      setText(el.querySelector('.wd-date'), yearLabel(U.ctx.clock.year));
      for (const [id, b] of Object.entries(tabBtns)) { b.classList.toggle('on', id === tab); setAttr(b, 'aria-selected', String(id === tab)); }
      // redrawn only when what it shows changed (a 4 Hz check), so a hover or a scroll is never lost
      const s = sigOf();
      if (s === sig) return;
      sig = s;
      const top = body.scrollTop;
      if (tab === 'people') renderPeople(); else if (tab === 'commandments') renderCommandments(); else if (tab === 'discoveries') renderDiscoveries(); else renderClans();
      body.scrollTop = top;
    }
    U.on('mind:commandments', () => { sig = ''; render(); });
    U.on('mind:discovery', () => { sig = ''; render(); });
    U.onSlot.push((k) => { if (k === 'world') { sig = ''; render(); } fz.classList.toggle('on', k === 'world'); });
    U.slow.push(() => render());
    // the shape eases every frame while it is in view
    U.frame.push((dt) => { if (isOpen() && tab === 'people') paintShape(forces(), dt); });
    U.world2 = {
      open(t) { if (t) { tab = t; sig = ''; } U.slot.show('world'); render(); },
      toggle(t) { if (isOpen() && (!t || t === tab)) U.slot.hide('world'); else U.world2.open(t); },
      get isOpen() { return isOpen(); }, get tab() { return tab; },
    };
    // the Tablet's old name, for lessons and keys that still ask for it
    U.tablet = { open: (t) => U.world2.open(t === 'commandments' || t === 'discoveries' || t === 'clans' ? t : undefined), close: () => { if (isOpen()) U.slot.hide('world'); }, toggle: (t) => U.world2.toggle(t), get isOpen() { return isOpen(); } };

    // ---------- the forces button, bottom right, always on screen once time runs ----------
    const fz = h('button', 'isl btn forcesb');
    fz.type = 'button';
    fz.innerHTML = `<svg class="fzs" viewBox="6 4 88 80" width="36" height="36" aria-hidden="true"><polygon class="fz-frame" points=""/><polygon class="fz-even" points=""/><polygon class="fz-shape" points=""/></svg>
      <span class="fzn">${icon('people', 14)}<span class="fz-p">-</span>${icon('family', 14)}<span class="fz-f">-</span></span>`;
    fz.dataset.hudBlock = '';
    U.root.appendChild(fz);
    fz.addEventListener('click', () => U.world2.toggle('people'));
    tip(fz, 'Your people', 'Faith at the top, strength bottom left, skepticism bottom right: even is healthy, lopsided is trouble. Then the number of people and of families. Tap for the World.', 'O');
    const SC = 50, SR = 40, SA = { faith: -90, strength: 150, skepticism: 30 };
    const sp = (k, v) => { const a = SA[k] * Math.PI / 180, r = SR * Math.max(0.04, Math.min(1, v)); return `${(SC + Math.cos(a) * r).toFixed(1)},${(SC + 6 + Math.sin(a) * r).toFixed(1)}`; };
    const sPoly = (f) => FORCES.map(([k]) => sp(k, f(k))).join(' ');
    fz.querySelector('.fz-frame').setAttribute('points', sPoly(() => 1));
    fz.querySelector('.fz-even').setAttribute('points', sPoly(() => 0.5));
    let fzSig = '';
    function paintForces() {
      const run = U.ctx.clock.phase === 'running';
      setHidden(fz, !run || !!U.titleOn);
      if (!run) return;
      const F = forces(), st = U.get('sim', 'stats') ?? {};
      const p = Number.isFinite(st.population) ? Math.round(st.population) : null, f = Number.isFinite(st.families) ? Math.round(st.families) : null;
      const s2 = JSON.stringify([FORCES.map(([k]) => Math.round(F[k] ?? -1)), p, f]);
      if (s2 === fzSig) return;
      fzSig = s2;
      fz.querySelector('.fz-shape').setAttribute('points', sPoly((k) => (F[k] ?? 0) / 100));
      setText(fz.querySelector('.fz-p'), p == null ? '-' : String(p));
      setText(fz.querySelector('.fz-f'), f == null ? '-' : String(f));
      const val = (k) => (F[k] == null ? 'not known' : String(Math.round(F[k])));
      fz.setAttribute('aria-label', `Your people: faith ${val('faith')}, skepticism ${val('skepticism')}, strength ${val('strength')}; ${p ?? 'no'} people, ${f ?? 'no'} families. Open the World.`);
    }
    // when the sheet reaches down to it, the forces step to the left of the sheet (never under it)
    function shift() {
      const sh = U.slot.el, on = U.slot.open && !fz.hidden;
      let want = false;
      if (on) { const a = sh.getBoundingClientRect(), b = fz.getBoundingClientRect(); want = a.bottom > b.top - 8; }
      if (fz.classList.contains('shift') !== want) fz.classList.toggle('shift', want);
    }
    U.onSlot.push(() => requestAnimationFrame(shift));
    U.slow.push(paintForces);
    U.slow.push(shift);
    paintForces();
    return stub;
  },
}];
