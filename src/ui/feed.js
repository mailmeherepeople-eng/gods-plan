// The Log (UI-GUIDE 5.4): everything that happened, newest first, with filters, in the side sheet. Its button at the
// top right is a parchment scroll (the director's notes, 2026-11-14, 1): ordinary news (a birth, a hut finished,
// a forecast updated, a discovery after its moment) gets no token and nothing flies; the scroll swells and bobs
// once as if filling, its count rises, with a soft sound, so the player knows something went in and that it can
// wait. Tapping an entry glides the camera there first, then opens who it is about (nothing teleports).
// One entry per thing: an entry pushed with a `key` replaces the last entry with that key and moves to the top
// (the same family's forecast was logged again and again). The same words near the same place within 10 years
// merge into "x3".
import { h, icon, esc, yearLabel } from './dom.js';

const SEVS = ['bad', 'warn', 'good', 'info'];

export function makeFeed(U) {
  const { ctx } = U;
  const log = [];        // newest last
  let unread = 0, filter = 'all';
  const year = () => ctx.clock.year;

  function norm(a) {
    const sev = SEVS.includes(a?.severity) ? a.severity : 'info';
    const subject = a?.subject ?? a?.person ?? a?.animal ?? a?.target ?? a?.family?.members?.[0] ?? null;
    return { sev, text: String(a?.text ?? '').trim(), x: Number(a?.x), z: Number(a?.z), subject, year: Number.isFinite(a?.year) ? a.year : year(), n: 1, rev: 0,
      kind: a?.kind ?? null, key: a?.key ?? null, detail: Array.isArray(a?.detail) ? a.detail.filter(Boolean).map(String) : null };
  }
  const near = (p, q) => (!Number.isFinite(p.x) || !Number.isFinite(q.x)) ? true : Math.hypot(p.x - q.x, p.z - q.z) < 16;
  const same = (p, q) => p.text === q.text && Math.abs(p.year - q.year) <= 10 && near(p, q);

  function push(raw) {
    const a = norm(raw);
    if (!a.text) return;
    let fresh = true;
    if (a.key) {
      const i = log.findIndex((x) => x.key === a.key);
      if (i >= 0) {
        const old = log[i];
        log.splice(i, 1);
        a.rev = old.rev + 1;
        if (!a.detail) a.detail = old.detail;
        // (acted on stays acted on: a warning updated, withdrawn or landed keeps its place under "Actioned")
        if (old.done) { a.done = true; a.doneAt = old.doneAt; a.status = old.status; }
        if (raw?.quiet) fresh = false;
      }
      log.push(a);
    } else {
      const lm = log.length ? log[log.length - 1] : null;
      if (lm && same(lm, a)) { lm.n++; lm.year = a.year; fresh = false; } else log.push(a);
    }
    if (log.length > 500) log.shift();
    if (isOpen()) renderLog();
    else {
      if (fresh) { unread++; U.onUnread?.(unread); }
      // the scroll fills: once, softly (a busy year is one swell, not a drum roll)
      if (!skipping()) U.logSwell?.();
    }
  }
  const skipping = () => !!U.get('sim', 'skip')?.running || !!U.skipNow;
  // the entry's thing: the camera travels there, then the one it is about opens (a dead person too, for their story)
  function jump(a) {
    const s = a.subject;
    const open = () => { if (s && typeof s === 'object' && (!s.dead || s.kind === 'person')) U.select?.(s); };
    if (Number.isFinite(a.x) && Number.isFinite(a.z)) U.glide(a.x, a.z, { then: open });
    else open();
  }
  U.on('sim:alert', (a) => push(a));

  // Acted on (the director, 2026-11-16: "Once we interact with a notification, it should not remain on the screen
  // anymore & go into the log under actioned"): the entries that tell a thing the player opened or answered move under
  // "Actioned" at the top of the Log, newest act first, with what came of it (`status`, one line under the words).
  // `keys`: the entries' keys (a warning's foresight lines, a prayer's line); `entry`: one made when none is there yet.
  // Nothing is counted as unread and the scroll does not swell for it: the player did it, and its token flew in.
  // `soft`: keep a status already there (the thing opened again after an act: what came of the act stays).
  function markActioned(keys = [], entry = null, status = '', soft = false) {
    const t = performance.now();
    let hit = false;
    const all = entry?.key ? [...keys, entry.key] : keys;
    for (const a of log) if (a.key && all.includes(a.key)) { a.done = true; a.doneAt = t; if (status && !(soft && a.status)) a.status = status; hit = true; }
    if (!hit && entry) {
      const a = norm(entry);
      if (!a.text) return;
      a.done = true; a.doneAt = t; a.status = status || '';
      log.push(a);
      if (log.length > 500) log.shift();
    }
    if (isOpen()) renderLog();
  }

  // ---------- the Log, in the side sheet ----------
  const el = h('div', 'lg');
  el.innerHTML = `<div class="ph zz"><span class="badge">${icon('scroll', 22)}</span><div class="pw"><div class="pt">Log</div><div class="ps">Newest first</div></div>
      <button class="btn ico quiet lg-x" type="button" aria-label="Close the Log">${icon('close', 20)}</button></div>
    <div class="lg-filters chips" role="group" aria-label="Show"></div><div class="lg-list"></div>`;
  U.slot.add('log', el);
  el.querySelector('.lg-x').addEventListener('click', () => toggleLog(false));
  const fl = el.querySelector('.lg-filters');
  for (const [k, label] of [['all', 'All'], ['fore', 'Foreseen'], ['bad', 'Danger'], ['info', 'News']]) {
    const b = h('button', 'btn chip', `<span>${label}</span>`);
    b.type = 'button'; b.dataset.f = k;
    b.addEventListener('click', () => { filter = k; renderLog(); });
    fl.appendChild(b);
  }
  const list = el.querySelector('.lg-list');
  function renderLog() {
    fl.querySelectorAll('.chip').forEach((b) => { b.classList.toggle('on', b.dataset.f === filter); b.setAttribute('aria-pressed', String(b.dataset.f === filter)); });
    const rows = log.filter((a) => filter === 'all' || (filter === 'fore' ? !!a.kind : filter === 'bad' ? a.sev === 'bad' || a.sev === 'warn' : a.sev === 'info' || a.sev === 'good')).slice().reverse().slice(0, 200);
    const top = list.scrollTop;
    list.innerHTML = rows.length ? '' : '<div class="lg-empty">Nothing yet. News of your people will gather here.</div>';
    // two parts: what you acted on (newest act first), then everything not acted on yet (newest first); the headings
    // show only when there is something acted on, so a Log with no acts reads as it always did
    const done = rows.filter((a) => a.done).sort((p, q) => (q.doneAt ?? 0) - (p.doneAt ?? 0)), rest = rows.filter((a) => !a.done);
    const heading = (t) => list.appendChild(h('div', 'lg-h', esc(t)));
    if (done.length) heading('Actioned');
    for (const a of done) row(a);
    if (done.length && rest.length) heading('Not acted on yet');
    for (const a of rest) row(a);
    list.scrollTop = top;
  }
  function row(a) {
    const r = h('button', `lg-row sev-${a.sev}`);
    r.type = 'button';
    r.innerHTML = `<span class="lg-ic">${icon(`sev-${a.sev}`, 18)}</span><span class="lg-t">${esc(a.text)}${a.n > 1 ? ` <span class="lg-n">x${a.n}</span>` : ''}${a.rev ? ' <span class="lg-n">updated</span>' : ''}</span>${a.done && a.status ? `<span class="lg-st">${esc(a.status)}</span>` : ''}<span class="lg-y">${yearLabel(a.year)}</span>`;
    r.disabled = !Number.isFinite(a.x) && !(a.subject && typeof a.subject === 'object');
    r.addEventListener('click', () => jump(a));
    if (a.detail?.length) {
      const w = h('div', `lg-wrap sev-${a.sev}`);
      const d = h('details', 'lg-more', `<summary>The full account</summary><ul>${a.detail.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
      w.append(r, d);
      list.appendChild(w);
    } else list.appendChild(r);
  }
  const isOpen = () => U.slot.shown === 'log';
  function toggleLog(on = !isOpen()) {
    if (on) { U.slot.show('log'); unread = 0; U.onUnread?.(0); renderLog(); }
    else U.slot.hide('log');
  }
  U.onSlot.push((top) => { if (top === 'log') { unread = 0; U.onUnread?.(0); renderLog(); } });
  // the Log on one filter
  function showLog(f = 'all') { filter = f; toggleLog(true); }
  return { push, markActioned, toggleLog, showLog, get open() { return isOpen(); }, get unread() { return unread; }, log, el };
}
