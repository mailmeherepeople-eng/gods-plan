// The faith ledger: faith across the whole people, and why (docs/FAITH.md).
// Opened from two links in the World door's People tab. Non-modal, closes on its own button, Escape or a second open.
//   Ledger         the trend of faith and doubt over the last centuries (acts
//                  marked), what moved it lately, how far word of your last act
//                  has spread, and faith and doubt by village
//   How it works   the formula in plain words, with the live numbers
// Reads the sim's faithLedger query (faith.js) and its tunables (tune('faith')).
import { h, icon, esc, yearLabel } from './dom.js';

const signed = (v) => `${v >= 0 ? '+' : ''}${Math.abs(v) >= 9.95 ? Math.round(v) : Math.round(v * 10) / 10}`;
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

export default [{
  type: 'panel', id: 'faith-panel', region: 'root', order: 12,
  make(U) {
    const { ctx } = U;
    try { if (![...document.querySelectorAll('link')].some((l) => /\/faith\.css/.test(l.href))) ctx.addStyle(new URL('./faith.css', import.meta.url)); } catch { /* no styles */ }
    const el = h('div', 'isl panel fpanel');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Faith among your people');
    el.hidden = true;
    el.innerHTML = `<div class="fp-head">${icon('faith', 20)}<span class="fp-title">Faith</span>
      <span class="fp-tabs" role="tablist"><button type="button" class="btn chip fp-t" data-t="ledger" role="tab">Ledger</button><button type="button" class="btn chip fp-t" data-t="how" role="tab">How faith works</button></span>
      <button type="button" class="btn chip fp-x" aria-label="Close">${icon('close', 16)}</button></div>
      <div class="fp-body"></div>`;
    const body = el.querySelector('.fp-body');
    let tab = 'ledger', sig = '';
    const open = (t = tab) => { tab = t; el.hidden = false; sig = ''; draw(); for (const b of el.querySelectorAll('.fp-t')) { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); } };
    const close = () => { el.hidden = true; };
    el.querySelector('.fp-x').addEventListener('click', close);
    for (const b of el.querySelectorAll('.fp-t')) b.addEventListener('click', () => open(b.dataset.t));
    addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !el.hidden) { ev.stopPropagation(); close(); } }, true);
    U.faith = { open, close, get isOpen() { return !el.hidden; } };

    // opened from the World door's People tab (world.js: "Why? The faith ledger", "How faith works")
    void esc;

    // ---------- drawing ----------
    function chart(L) {
      const tr = L.trend ?? [];
      if (tr.length < 2) return '<p class="fp-note">The trend draws once a few years have passed.</p>';
      const W = 380, Hh = 104, pad = 4;
      const y0 = tr[0].y, y1 = tr[tr.length - 1].y, span = Math.max(1, y1 - y0);
      const X = (y) => pad + (y - y0) / span * (W - pad * 2), Y = (v) => pad + (1 - v / 100) * (Hh - pad * 2);
      const line = (k) => tr.map((s, i) => `${i ? 'L' : 'M'}${X(s.y).toFixed(1)} ${Y(s[k]).toFixed(1)}`).join(' ');
      const acts = (L.causes ?? []).filter((c) => c.kind === 'act' && c.y >= y0).map((c) => `<line class="fp-act" x1="${X(c.y).toFixed(1)}" x2="${X(c.y).toFixed(1)}" y1="${pad}" y2="${Hh - pad}"/>`).join('');
      const grid = [25, 50, 75].map((v) => `<line class="fp-grid" x1="${pad}" x2="${W - pad}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('');
      const last = tr[tr.length - 1];
      return `<figure class="fp-chart"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Average faith and skepticism from ${yearLabel(y0)} to ${yearLabel(y1)}: faith now ${Math.round(last.f)}, skepticism ${Math.round(last.d)}">
        ${grid}${acts}<path class="fp-d" d="${line('d')}"/><path class="fp-f" d="${line('f')}"/></svg>
        <figcaption><span class="fp-key f">${icon('faith', 14)}Faith ${Math.round(last.f)}</span><span class="fp-key d">${icon('doubt', 14)}Skepticism ${Math.round(last.d)}</span><span class="fp-key a"><i></i>your acts</span><span class="fp-span">${yearLabel(y0)} to ${yearLabel(y1)}</span></figcaption></figure>`;
    }
    function ledger(L, T) {
      const lr = T?.LIFE_RATE ?? 0.5;
      const per10 = (v) => signed(v * lr * 10);
      const stone = L.stone ?? {};
      const out = [];
      out.push(chart(L));
      out.push(`<p class="fp-now">Average faith <b>${L.faith ?? '-'}</b>, skepticism <b>${L.doubt ?? '-'}</b> among ${L.n ?? 0} people. With nothing new, faith moves about <b>${per10(L.fade?.faith ?? 0)}</b> and skepticism <b>${per10(L.fade?.doubt ?? 0)}</b> every 10 years. The stone is ${stone.neglected ? '<b class="bad">neglected</b>: hardly anyone prays there, so faith fades faster' : stone.kept ? '<b>well kept</b>: many pray there, so faith fades more slowly' : 'tended by some'}.</p>`);
      const a = L.last;
      if (a) {
        const ago = a.years <= 0 ? 'this year' : `${a.years} ${a.years === 1 ? 'year' : 'years'} ago`;
        out.push(`<h4 class="fp-h">Word of your last act</h4><p class="fp-p"><b>${esc(a.name.charAt(0).toUpperCase() + a.name.slice(1))}</b>, ${esc(yearLabel(a.y))} (${ago}). ${a.seen} saw it${a.found ? `, ${a.found} found it on waking` : ''}, ${a.heard} heard of it${a.legend ? `, ${a.legend} grew up on it` : ''}. Known now to <b>${a.knowing} of ${a.of}</b> (${pct(a.knowing, a.of)} percent)${a.told ? '' : '; it is a legend now, told only to children'}.</p>`);
        if (a.groups?.length) out.push(`<div class="fp-rows">${a.groups.slice(0, 6).map((g) => `<div class="fp-row"><span class="fp-l">${esc(g.name)}</span><span class="fp-bar"><i style="width:${pct(g.knew, g.of)}%"></i></span><span class="fp-n">${g.knew} of ${g.of}</span></div>`).join('')}</div>`);
      } else out.push('<h4 class="fp-h">Word of your last act</h4><p class="fp-p">Nobody has seen you do anything yet. As far as they know, the stone is a stone.</p>');
      const cs = (L.causes ?? []).slice(0, 6);
      out.push(`<h4 class="fp-h">What moved it lately</h4>${cs.length ? `<ul class="fp-list">${cs.map((c) => `<li class="${c.sign < 0 ? 'neg' : 'pos'}"><span class="fp-y">${esc(yearLabel(c.y))}</span>${esc(c.text)}</li>`).join('')}</ul>` : '<p class="fp-p">Nothing yet but the slow years.</p>'}`);
      const gs = (L.groups ?? []).slice(0, 8);
      if (gs.length) {
        out.push(`<h4 class="fp-h">By village</h4><div class="fp-rows">${gs.map((g) => {
          const s = g.faith + g.doubt ? g.faith / (g.faith + g.doubt) : 0.5;
          return `<div class="fp-row fp-v"><span class="fp-l">${esc(g.name)} <small>(${g.n})</small></span><span class="fp-bal" title="Faith ${g.faith}, skepticism ${g.doubt}"><i class="f" style="width:${Math.round(s * 100)}%"></i></span><span class="fp-n">${g.faith} / ${g.doubt}</span></div>`;
        }).join('')}</div><p class="fp-note">Faith / skepticism, people 10 and up. The gold part is faith's share.</p>`);
      }
      return out.join('');
    }
    function how(F, T) {
      if (!F) return '<p class="fp-p">The faith rules are not loaded.</p>';
      const lr = T?.LIFE_RATE ?? 0.5;
      const yr10 = (v) => signed(v * lr * 10);
      const N = F.NOTICE ?? {};
      const reach = (k) => { const n = N[k] ?? {}; return `${n.reach} blocks${n.perR ? `, plus ${n.perR} for each block of land it changed, up to ${n.cap}` : ''}`; };
      return `<div class="fp-how">
        <p>Faith only moves when people see what you did, or are told by someone who did. Nobody can be moved by what nobody could know.</p>
        <h4 class="fp-h">Who sees it</h4>
        <ul class="fp-list plain">
          <li>Quiet acts (healing, an animal set down) are seen only by those awake and outdoors within ${T?.SIGHT_DAY ?? 22} blocks by day, ${T?.SIGHT_NIGHT ?? 7} at night.</li>
          <li>Bigger acts are seen further: plants and painted ground ${reach('paint')}; moving land ${reach('land')}; rain over the fields ${reach('bless-harvest')}; fire from the sky ${reach('send-fire')}; a bolt of light ${reach('strike')}; a cave ${reach('cave')}.</li>
          <li>Close by, it counts in full. At the edge of its reach, ${Math.round(F.SEE_FAR_W * 100)} percent. Thunder and fire wake sleepers nearby (${Math.round(F.WOKE_W * 100)} percent). A changed land is found by those who slept through it, when they wake (${Math.round(F.LATER_W * 100)} percent).</li>
          <li>Strong skeptics trust their own eyes up to ${Math.round(F.SEE_DOUBT_CUT * 100)} percent less.</li>
        </ul>
        <h4 class="fp-h">Word spreads</h4>
        <ul class="fp-list plain">
          <li>Their households hear it that same day. Then each who knows tells about ${Math.round(F.TELL_RATE * lr * 10) / 10} others a year: someone near them at the fire, the stone or the field, else their own village, now and then another village.</li>
          <li>Hearing it moves you ${Math.round(F.HEAR_W * 100)} percent as much as seeing it, ${Math.round(F.RETELL * 100)} percent of that again with each retelling, ${Math.round(F.FAR_VILLAGE_W * 100)} percent from another village. A skeptic discounts it by their skepticism: at skepticism 50, by ${Math.round(F.HEAR_DOUBT_CUT * 50)} percent.</li>
          <li>Nobody is moved twice by one tale. After ${F.TALE_YEARS} years it is a legend, told only to children.</li>
        </ul>
        <h4 class="fp-h">Children</h4>
        <ul class="fp-list plain">
          <li>A parent with faith above ${F.DEVOUT_HOUSE} passes it on whole: the child is born at that faith and skepticism (both parents above: their average).</li>
          <li>Otherwise a child starts near its parents (${Math.round(F.PARENT_W * 100)} percent), its village (${Math.round(F.VILLAGE_W * 100)} percent) and the middle (${Math.round(F.MID_W * 100)} percent), give or take ${F.BIRTH_SPREAD}. It grows up on its parents' strongest tales.</li>
        </ul>
        <h4 class="fp-h">The slow fade</h4>
        <ul class="fp-list plain">
          <li>With nothing new, faith moves ${yr10(F.FADE_FAITH)} and skepticism ${yr10(F.FADE_DOUBT)} every 10 years. Children fade at ${Math.round(F.FADE_CHILD * 100)} percent of that.</li>
          <li>Praying keeps it: those who prayed today fade at ${Math.round(F.PRAY_MUL * 100)} percent; tending the stone and keeping a commandment slow it more. Praying with ${F.TOGETHER_N} or more others adds ${F.TOGETHER_FAITH} faith.</li>
          <li>A neglected stone (few pray there) makes everyone fade ${F.NEGLECT_MUL} times as fast; a well kept one, ${Math.round(F.KEPT_STONE_MUL * 100)} percent.</li>
        </ul>
        <h4 class="fp-h">Skepticism, for reasons</h4>
        <ul class="fp-list plain">
          <li>Prayed through a hardship and no help came: skepticism +${F.UNANSWERED_DOUBT}, faith ${F.UNANSWERED_FAITH}. Came through by their own hands: skepticism +${F.OWN_HANDS_DOUBT}.</li>
          <li>Discoveries explain what used to be the stone's: the calendar skepticism +${F.DISCOVERY_DOUBT?.calendar}, writing +${F.DISCOVERY_DOUBT?.writing}, and so on. Thinkers argue with whoever sits near them.</li>
          <li>A commandment that hurt them: skepticism +${F.HURT_DOUBT}.</li>
        </ul>
        <h4 class="fp-h">Leaning on you</h4>
        <p>Seen helping in their first years here, people expect help for good and work less. The devout (faith ${F.DEPEND_FAITH} and up) who see you help ${F.DEPEND_SEEN} times in ${Math.round(F.DEPEND_WINDOW / lr)} years do too. The aim is the middle: enough faith to listen, enough skepticism to think.</p>
      </div>`;
    }
    function draw() {
      if (el.hidden) return;
      const T = U.call('sim', 'tune', 'sim'), F = U.call('sim', 'tune', 'faith');
      if (tab === 'how') { const s = `how|${F?.TELL_RATE}`; if (s !== sig) { sig = s; body.innerHTML = how(F, T); } return; }
      const L = U.call('sim', 'ask', 'faithLedger');
      if (!L) { if (sig !== 'none') { sig = 'none'; body.innerHTML = '<p class="fp-p">No faith rules here.</p>'; } return; }
      const html = ledger(L, T);
      if (html !== sig) { sig = html; const top = body.scrollTop; body.innerHTML = html; body.scrollTop = top; }
    }
    let t = 0;
    U.slow.push((dt) => { t -= dt; if (t <= 0) { t = 1; draw(); } });
    return el;
  },
}];
