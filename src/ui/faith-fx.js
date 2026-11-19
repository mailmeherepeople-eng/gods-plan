// Faith on the map, the moment it moves (docs/FAITH.md):
//   marks    each who saw an act gets a small rising number over the head for a
//            couple of seconds ("+6" in faith gold; a doubt number in blue when
//            doubt is what moved), at most MAX_MARKS at once, only zoomed in
//   summary  one pill where the act was: "9 saw it. Faith +7, doubt -5." and
//            under it who hears at home and who will find it on waking
//   word     a soft dot travels from teller to listener when word is passed on
//            (and a blue one when a thinker talks someone into doubt), sparing:
//            at most MAX_DOTS at once and DOTS_PER_S a second, never in a skip
// Listens to the sim's faith:witness, faith:told and faith:shift (faith.js, faith-tales.js).
import { h, icon, esc, setHidden } from './dom.js';

const MAX_MARKS = 40, MARK_S = 2.6, SUM_S = 6, MAX_DOTS = 8, DOTS_PER_S = 3, DOT_S = 1.5, MARK_PPM = 1.6;
const signed = (v) => `${v >= 0 ? '+' : ''}${Math.abs(v) >= 9.95 ? Math.round(v) : Math.round(v * 10) / 10}`;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nWord = (n) => (n === 1 ? 'One' : String(n));

export default [{
  type: 'panel', id: 'faith-fx', region: 'world', order: 62,
  make(U) {
    const { ctx } = U;
    try { if (![...document.querySelectorAll('link')].some((l) => /\/faith\.css/.test(l.href))) ctx.addStyle(new URL('./faith.css', import.meta.url)); } catch { /* no styles: still works */ }
    const layer = h('div', 'ffx');
    const marks = [], sums = [], dots = [];
    let dotBudget = DOTS_PER_S;
    const skipping = () => !!U.get('sim', 'skip')?.running;
    const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScreen = (s) => !s.behind && s.x > -40 && s.y > -40 && s.x < innerWidth + 40 && s.y < innerHeight + 40;

    function mark(p, df, dd, how) {
      // (the delight pass: an eye over each who saw, flying to the World door, now tells a rise in faith; the
      // number stays only for skepticism moving, so the cast stays modest)
      if (U.fx && !(Math.abs(dd) > Math.abs(df) * 1.5 && dd > 0)) return;
      if (marks.length >= MAX_MARKS || !p || ctx.camera.ppm < MARK_PPM) return;
      const doubt = Math.abs(dd) > Math.abs(df) * 1.5 && dd > 0;
      const v = doubt ? dd : df;
      if (Math.abs(v) < 0.5) return;
      const el = h('span', `ffx-mark${doubt ? ' dbt' : ''}${how === 'far' ? ' far' : ''}`, `${icon(doubt ? 'doubt' : 'faith', 14)}<b>${esc(signed(v))}</b>`);
      el.setAttribute('aria-hidden', 'true');
      layer.appendChild(el);
      marks.push({ el, p, t: 0 });
    }
    function summary(x, z, lines, kind) {
      // (Round 4: the card stood over the very spot the power landed on, hiding the rain it had just sent. With the
      // delight pass on screen the eyes, the motes and "+N faith" by the World door tell it, and the Log keeps the
      // words; nothing stands over the world)
      if (U.fx) { if (kind === 'doubt') U.feed?.push({ severity: 'info', text: lines.join(' '), kind: 'faith', x, z }, { logOnly: true }); return; }
      const el = h('div', `ffx-sum${kind ? ` k-${kind}` : ''}`, lines.map((l, i) => `<span class="${i ? 'ffx-s2' : 'ffx-s1'}">${i ? '' : icon('seen', 16)}${esc(l)}</span>`).join(''));
      el.setAttribute('role', 'status');
      layer.appendChild(el);
      sums.push({ el, x, z, t: 0 });
      while (sums.length > 3) sums.shift().el.remove();
    }

    U.on('faith:witness', (e) => {
      if (skipping() || !e) return;
      for (const m of (e.people ?? []).slice(0, MAX_MARKS)) mark(m.p, m.df, m.dd, m.how);
      const lines = [];
      if (e.found) lines.push(`${nWord(e.seen)} woke to find it. Faith ${signed(e.avgF)}, skepticism ${signed(e.avgD)}.`);
      else {
        lines.push(e.seen ? `${nWord(e.seen)} saw it${e.far ? ` (${e.far} from afar)` : ''}. Faith ${signed(e.avgF)}, skepticism ${signed(e.avgD)}.` : 'Nobody saw it.');
        const more = [];
        if (e.home) more.push(`${e.home} heard at home`);
        if (e.later) more.push(`${e.later} will find it on waking`);
        if (more.length) lines.push(`${cap1(more.join('; '))}. Word will spread.`);
        else if (e.seen) lines.push('Word will spread.');
      }
      summary(e.x, e.z, lines, e.found ? 'found' : 'seen');
    });
    U.on('faith:shift', (e) => {
      if (skipping() || !e) return;
      for (const m of (e.people ?? []).slice(0, MAX_MARKS)) mark(m.p, m.df, m.dd, 'saw');
      if (e.text) summary(e.x, e.z, [e.text], 'doubt');
    });
    U.on('faith:told', (e) => {
      if (skipping() || !e?.a || !e?.b || dots.length >= MAX_DOTS || dotBudget < 1) return;
      if (e.a.hidden || e.b.hidden || ctx.camera.ppm < MARK_PPM) return;
      const sa = ctx.camera.toScreen(e.a.x, (e.a.y ?? 16) + 2, e.a.z), sb = ctx.camera.toScreen(e.b.x, (e.b.y ?? 16) + 2, e.b.z);
      if (!onScreen(sa) && !onScreen(sb)) return;
      dotBudget -= 1;
      const el = h('i', `ffx-dot${e.doubt ? ' dbt' : ''}`);
      el.setAttribute('aria-hidden', 'true');
      layer.appendChild(el);
      dots.push({ el, a: e.a, b: e.b, t: 0, df: e.df ?? 0, dd: e.dd ?? 0, doubt: !!e.doubt });
    });

    function frame(dt) {
      dotBudget = Math.min(DOTS_PER_S, dotBudget + dt * DOTS_PER_S);
      const still = reduce();
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i];
        m.t += dt;
        const k = m.t / MARK_S;
        if (k >= 1 || m.p.dead) { m.el.remove(); marks.splice(i, 1); continue; }
        const s = ctx.camera.toScreen(m.p.x, (m.p.y ?? 16) + 2.5, m.p.z);
        setHidden(m.el, !onScreen(s) || m.p.hidden);
        if (m.el.hidden) continue;
        const rise = still ? 0 : 26 * Math.min(1, k * 1.4);
        m.el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y - rise).toFixed(1)}px) translate(-50%, -100%)`;
        m.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
      }
      for (let i = sums.length - 1; i >= 0; i--) {
        const o = sums[i];
        o.t += dt;
        if (o.t >= SUM_S) { o.el.remove(); sums.splice(i, 1); continue; }
        let y = 16;
        try { y = ctx.vox.standY(Math.floor(o.x), Math.floor(o.z)) + 6; } catch { /* no world */ }
        const s = ctx.camera.toScreen(o.x, y, o.z);
        setHidden(o.el, !onScreen(s));
        if (o.el.hidden) continue;
        const stack = sums.slice(i + 1).reduce((a, x) => a + (x.el.offsetHeight || 40) + 6, 0);
        o.el.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y - stack).toFixed(1)}px) translate(-50%, -100%)`;
        o.el.style.opacity = String(o.t < SUM_S - 0.8 ? 1 : (SUM_S - o.t) / 0.8);
      }
      for (let i = dots.length - 1; i >= 0; i--) {
        const d = dots[i];
        d.t += dt;
        const k = d.t / DOT_S;
        if (k >= 1 || d.a.dead || d.b.dead) {
          d.el.remove(); dots.splice(i, 1);
          if (k >= 1 && !d.b.dead) mark(d.b, d.df, d.dd, 'told');
          continue;
        }
        const sa = ctx.camera.toScreen(d.a.x, (d.a.y ?? 16) + 2, d.a.z), sb = ctx.camera.toScreen(d.b.x, (d.b.y ?? 16) + 2, d.b.z);
        const e = k * k * (3 - 2 * k);
        const x = sa.x + (sb.x - sa.x) * e, y = sa.y + (sb.y - sa.y) * e - Math.sin(Math.PI * e) * Math.min(60, 12 + Math.hypot(sb.x - sa.x, sb.y - sa.y) * 0.25);
        setHidden(d.el, sa.behind && sb.behind);
        d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
        d.el.style.opacity = String(Math.sin(Math.PI * Math.min(1, k * 1.05)) * 0.9 + 0.1);
      }
    }
    U.frame.push(frame);
    return layer;
  },
}];
