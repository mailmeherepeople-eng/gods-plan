// Teaching cards (the director: "the notification should tell us about faith, doubt and stuff when the game
// starts"). Each idea is told once, at the moment it first matters: time starting, the first family, the first act
// witnessed, the balance, the first slowed time, the first person selected, the first warning and the first
// account afterwards. One at a time, as a token at the top right that opens in the side sheet. Never modal, never
// pauses. "Got it" moves on; "Do not show tips" stops them (Settings and the menu bring them back; the menu can
// replay them all). The words are in teach-words.js. A "How faith works" button appears when that sheet exists.
import { h } from './dom.js';
import { TIPS } from './teach-words.js';

export function makeTeach(U) {
  const { ctx } = U;
  const clock = ctx.clock;
  if (U.settings.tips == null) U.settings.tips = true;
  const seenKey = (id) => `tip:${id}`;
  const seen = (id) => !!U.settings.seen?.[seenKey(id)];
  const mark = (id) => { U.settings.seen[seenKey(id)] = true; U.saveSettings(); };
  const queue = [];
  let cur = null, gapUntil = 0, replaying = false;

  // the faith sheet, if the faith work has put one on screen (guarded: several names are tried)
  function faithSheet() {
    const cands = [U.faithSheet, U.howFaith, U.faith];
    for (const c of cands) if (c && typeof c.open === 'function') return () => c.open();
    const b = U.root.querySelector('[data-sheet="faith"], .faith-sheet-open, button[data-open="faith"]');
    if (b) return () => b.click();
    return null;
  }
  function want(when, extra) {
    if (!U.settings.tips && !replaying) return;
    for (const t of TIPS) if (t.when === when && !seen(t.id) && !queue.includes(t) && cur?.t !== t) queue.push({ ...t, extra });
  }
  // Round 4 (the director: a tip popped up in the middle of the map while a power was in hand, over the very spot
  // and its result, and moved when the slot closed): a tip is a token on the rail, like a discovery. It never
  // stands over the world; it opens in the slot when the player wants it, and goes to the Log.
  const LIFE_S = 90;
  function post(t) {
    const sheet = t.link === 'faith' ? faithSheet() : null;
    const key = `tip:${t.id}`;
    cur = { t, key, t0: performance.now() };
    mark(t.id);
    const acts = [
      { label: 'Got it', primary: true },
      ...(sheet ? [{ label: 'How faith works', go: () => sheet(), away: false }] : []),
      { label: 'Do not show tips', go: () => { U.settings.tips = false; U.saveSettings(); queue.length = 0; replaying = false; } },
    ];
    U.attend.note(key, { kind: 'tip', sev: 'info', icon: 'quill', title: t.title, src: { what: t.text, lines: t.aside ? [t.aside] : [], acts } }, LIFE_S);
    U.feed?.push({ severity: 'info', text: `${t.title}. ${t.text}`, kind: 'tip', key }, { logOnly: true });
  }
  // the token is gone (read, put away or lapsed): the next one may come after a breath
  U.slow.push(() => {
    if (!cur?.key || performance.now() - cur.t0 < 2000) return;
    if ((U.attend?.items ?? []).some((it) => it.key === cur.key)) return;
    cur = null;
    gapUntil = performance.now() + (replaying ? 250 : 4000);
    if (replaying && !queue.length) replaying = false;
  });
  function show(t) { post(t); }
  function done() {
    cur = null;
    gapUntil = performance.now() + (replaying ? 250 : 1600);
    if (replaying && !queue.length) replaying = false;
  }
  // ---------- the moments ----------
  let started = false, arrived = 0, seenAct = false;
  U.on('phase', () => { if (clock.phase === 'running' && !started) { started = true; setTimeout(() => want('start'), 2500); } });
  U.on('sim:arrive', () => { arrived++; if (arrived === 1) want('arrive'); });
  U.on('sim:settle', () => want('arrive2'));
  U.on('sim:witness', (w) => { if (w && w.seenBy > 0 && !w.unseen && !seenAct) { seenAct = true; want('witness'); } });
  U.on('moment', (m) => { if (m?.on && m.id !== 'player') want('moment'); });
  U.on('year', () => {
    const st = U.get('sim', 'stats');
    if (clock.phase === 'running' && (st?.settled ?? st?.population ?? 0) >= 6 && seenOrLate()) want('balance');
  });
  const startYear = clock.year;
  const seenOrLate = () => seenAct || clock.year - startYear > 40;
  U.emitTeach = (when, extra) => want(when, extra);
  let lastSel = null;
  U.slow.push(() => {
    const s = U.inspect?.selected;
    if (s && s !== lastSel && s.kind === 'person' && clock.phase === 'running') want('select');
    lastSel = s ?? null;
  });
  U.frame.push(() => {
    if (cur || !queue.length || performance.now() < gapUntil) return;
    if (U.menu?.isOpen || U.titleOn || (clock.phase !== 'running' && !replaying)) return;
    show(queue.shift());
  });
  return {
    // the menu: every tip again, one after another
    replay() { for (const t of TIPS) delete U.settings.seen[seenKey(t.id)]; U.saveSettings(); replaying = true; queue.length = 0; for (const t of TIPS) queue.push({ ...t }); if (cur) done(false); gapUntil = 0; },
    get showing() { return !!cur; },
  };
}

export default [{
  type: 'panel', id: 'teach', region: 'root', order: 6,
  make(U) { U.teach = makeTeach(U); const s = h('span', 'teach-stub'); s.hidden = true; return s; },
}];
