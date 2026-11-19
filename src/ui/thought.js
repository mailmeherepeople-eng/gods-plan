// Give a thought (DESIGN.md "The all-knowing view and thoughts"): a tab of the
// inspector for the selected person, opened from its tab, from the inspector's
// Give a thought button, or by the dock power (G, then a click on a person: the
// god hands the click here instead of carrying anything out, god.choose).
//   the ready thoughts from B (sim.ask('readyThoughts'): [{ id, text, group, hint }]),
//   grouped and searchable; hovering or choosing one shows its forecast
//   (sim.forecast('give-thought', { kind: 'person', entity, args: { thought } }))
//   with the chance lines in words (forecast.chance: { asOwn, fromAbove, changed },
//   0..1, if B sends them), and a box to type your own (args: { text }, word for word)
//   Give carries it out with god.perform, so it is witnessed like any act.
// The person's Mind tab then lists the thought with where it came from
// (mind:thought-given { person, text, asOwn, changed }, kept in U.given).
import { h, icon, tip, esc, setDisabled } from './dom.js';

const odds = (p) => {
  if (!Number.isFinite(p)) return null;
  const n = Math.max(0, Math.min(10, Math.round(p * 10)));
  const w = p < 0.12 ? 'Unlikely' : p < 0.38 ? 'Some chance' : p < 0.62 ? 'Even odds' : p < 0.88 ? 'Likely' : 'Almost certain';
  return [w, n === 0 ? 'under 1 in 10' : n === 10 ? 'nearly 10 in 10' : `about ${n} in 10`];
};

export default [{
  type: 'section', id: 'give', title: '', tab: 'give', tabLabel: 'Give a thought', power: 'give-thought', order: 5,
  when: (info, e) => info?.kind === 'person' && !e?.dead && !!U0?.s2?.hasPower('give-thought'),
  render(el, info, p, U) { draw(el, p, U); },
}, {
  // the hookup: the dock power's click comes here, and the given thoughts are remembered
  type: 'panel', id: 'give-hook', region: 'root', order: 6,
  make(U) {
    U0 = U;
    U.given = new Map();
    U.on('mind:thought-given', (g) => {
      if (!g?.person) return;
      const l = U.given.get(g.person) ?? [];
      l.push({ text: String(g.text ?? ''), asOwn: !!g.asOwn, changed: !!g.changed, year: Math.floor(U.ctx.clock.year) });
      U.given.set(g.person, l.slice(-6));
    });
    U.call('god', 'choose', 'give-thought', (t) => {
      const p = t?.entity;
      if (!p || p.kind !== 'person') return;
      U.select(p);
      U.inspect?.openTab?.('give');
    });
    const el = document.createElement('span');
    el.hidden = true;
    return el;
  },
}];
let U0 = null;

const state = new WeakMap(); // el -> { person, choice, typed, filter, built }
function draw(el, p, U) {
  let S = state.get(el);
  if (!S || S.person !== p) {
    S = { person: p, choice: null, typed: '', filter: '', hover: null, done: null };
    state.set(el, S);
    build(el, S, U);
  }
  // the person may have changed (the forecast moves with their faith and doubt); refresh the shown one now and then
  S.tick = (S.tick ?? 0) + 1;
  if (S.tick % 4 === 0) showForecast(el, S, U);
  const give = el.querySelector('.gv-go');
  if (give) setDisabled(give, !(S.choice || S.typed.trim()) || U.ctx.clock.phase !== 'running');
}

function build(el, S, U) {
  const p = S.person;
  const list = U.s2.thoughts();
  el.innerHTML = `
    <p class="gv-lead">Put a thought in ${esc(p.name)}'s head. Whether they know it came from you depends on the thought, and on their faith and skepticism.</p>
    ${list.length ? `<label class="gv-find">${icon('search', 18)}<input type="search" placeholder="Find a ready thought" aria-label="Find a ready thought"></label><div class="gv-list" role="listbox" aria-label="Ready thoughts"></div>` : '<p class="tb-note">No ready thoughts yet.</p>'}
    <label class="gv-own"><span class="gv-ol">${icon('quill', 16)}<span>Or your own words</span></span><textarea rows="2" maxlength="140" placeholder="The universe has four dimensions." aria-label="Your own thought"></textarea></label>
    <div class="gv-acts"><button class="btn chip primary gv-go" type="button" disabled>${icon('thought', 18)}<span>Give it to ${esc(p.name)}</span></button></div>
    <p class="gv-done" hidden></p>
    <div class="gv-fc" aria-live="polite"></div>`;
  const box = el.querySelector('.gv-list');
  const fill = () => {
    if (!box) return;
    const f = S.filter.trim().toLowerCase();
    const groups = new Map();
    for (const t of list) if (!f || t.text.toLowerCase().includes(f) || t.group.toLowerCase().includes(f)) { if (!groups.has(t.group)) groups.set(t.group, []); groups.get(t.group).push(t); }
    box.innerHTML = groups.size ? [...groups].map(([g, ts]) => `<div class="gv-g"><div class="gv-gl">${esc(g)}</div>${ts.map((t) => `<button class="gv-t ${S.choice === t.id ? 'on' : ''}" type="button" role="option" aria-selected="${S.choice === t.id}" data-id="${esc(t.id)}"><span class="gv-tt">${esc(t.text)}</span>${t.hint ? `<span class="gv-th">${esc(t.hint)}</span>` : ''}</button>`).join('')}</div>`).join('')
      : '<p class="tb-note">No ready thought has those words. Type your own below.</p>';
    box.querySelectorAll('.gv-t').forEach((b) => {
      b.addEventListener('click', () => { S.choice = S.choice === b.dataset.id ? null : b.dataset.id; S.typed = ''; el.querySelector('textarea').value = ''; mark(); showForecast(el, S, U); draw(el, S.person, U); });
      b.addEventListener('pointerenter', () => { S.hover = b.dataset.id; showForecast(el, S, U); });
      b.addEventListener('focus', () => { S.hover = b.dataset.id; showForecast(el, S, U); });
      b.addEventListener('pointerleave', () => { S.hover = null; showForecast(el, S, U); });
    });
  };
  // choosing marks the buttons in place (rebuilding the list would lose its scroll and the pointer's place)
  const mark = () => box?.querySelectorAll('.gv-t').forEach((b) => { const on = S.choice === b.dataset.id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  fill();
  el.querySelector('input[type=search]')?.addEventListener('input', (ev) => { S.filter = ev.target.value; fill(); });
  const ta = el.querySelector('textarea');
  ta.addEventListener('input', () => { S.typed = ta.value; if (S.typed.trim()) { S.choice = null; box?.querySelectorAll('.gv-t.on').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); }); } showForecast(el, S, U); draw(el, S.person, U); });
  ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); give(el, S, U); } if (ev.key === 'Escape') ta.blur(); });
  el.querySelector('.gv-go').addEventListener('click', () => give(el, S, U));
  showForecast(el, S, U);
}

function argsOf(S, id = S.hover ?? S.choice) {
  if (id) return { thought: id };
  if (S.typed.trim()) return { text: S.typed.trim() };
  return null;
}
// the forecast box is rewritten only when its words change (it sits last, so a change never moves what is above it)
const put = (out, html) => { if (out.dataset.h !== html) { out.dataset.h = html; out.innerHTML = html; } };
function showForecast(el, S, U) {
  const out = el.querySelector('.gv-fc');
  if (!out) return;
  const args = argsOf(S);
  if (!args) { put(out, '<p class="tb-note">Point at a thought to see what it would do.</p>'); return; }
  const p = S.person;
  const f = U.call('sim', 'forecast', 'give-thought', { kind: 'person', entity: p, x: p.x, z: p.z, args }) ?? null;
  const t = args.thought ? U.s2.thoughts().find((x) => x.id === args.thought) : null;
  const head = t ? `"${esc(t.text)}"` : `"${esc(args.text)}" <span class="gv-word">Your words, exactly. The game cannot read them, so it has a general effect.</span>`;
  if (!f) { put(out, `<div class="gv-q">${head}</div><p class="tb-note">No forecast: the minds are not awake yet.</p>`); return; }
  if (f.ok === false) { put(out, `<div class="gv-q">${head}</div><p class="tb-note">${esc(f.who || 'Not now.')}</p>`); return; }
  const ch = f.chance ?? f.chances ?? {};
  const own = odds(ch.asOwn), above = odds(ch.fromAbove ?? (Number.isFinite(ch.asOwn) ? 1 - ch.asOwn : NaN)), changed = odds(ch.changed);
  const chance = [
    own && `${own[0]} to take it as their own idea (${own[1]}).`,
    above && `${above[0]} to hear it as a voice from above (${above[1]}): then their faith rises and their skepticism falls.`,
    changed && `${changed[0]} to change what they do (${changed[1]}).`,
  ].filter(Boolean);
  const row = (cls, ic, label, l) => (l?.length ? `<div class="tc-row ${cls}"><span class="tc-g">${icon(ic, 16)}</span><div class="tc-b"><div class="tc-l">${label}</div>${l.map((x) => `<p>${esc(typeof x === 'string' ? x : x?.text ?? '')}</p>`).join('')}</div></div>` : '');
  put(out, `<div class="gv-q">${head}</div>${row('tc-chance', 'balance', 'The chances', chance)}${row('tc-gain', 'plus', 'Gains', f.gains)}${row('tc-cost', 'minus', 'Costs', f.costs)}${row('tc-fate', 'flat', 'What changes', f.fates)}${row('tc-later', 'hourglass', 'Later, past your watch', f.later)}${f.who ? row('tc-who', f.seenBy ? 'seen' : 'unseen', 'Who knows', [f.who]) : ''}`);
}
function give(el, S, U) {
  const args = argsOf(S, S.choice);
  if (!args) return;
  const p = S.person;
  const res = U.call('god', 'perform', 'give-thought', { kind: 'person', entity: p, x: p.x, z: p.z, args });
  const done = el.querySelector('.gv-done');
  if (res?.ok) {
    done.hidden = false;
    done.textContent = res.text || `Given to ${p.name}.`;
    S.choice = null; S.typed = ''; S.hover = null;
    const ta = el.querySelector('textarea'); if (ta) ta.value = '';
    el.querySelectorAll('.gv-t.on').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
    showForecast(el, S, U);
    U.inspect?.openTab?.('mind');
  } else {
    done.hidden = false;
    done.textContent = res?.text || 'It did not take.';
  }
}
