// Signs over heads, and the drop to 1x for a fight (the warnings themselves are tokens and markers now:
// attend.js draws the markers over the people and places, with edge arrows for what is off screen).
//   people   sick and wounded people carry a small sign over their heads at normal zoom: a round fever sign
//            or a square bandage sign (shape and glyph, not colour alone), at most MAX_HEADS of them, nearest
//            the middle first; those who kneel in a fight, those squaring up in a quarrel
//   great    a great person (the forces agent: ask('great'), or an inspect field `great`) carries a small
//            gold mark of three raised stones at any zoom where people can be told apart
//   turning  a turning point (the choices agent: ask('turningPoints')) a quiet hollow mark, no colour
//   risen    the Resurrected (sim/resurrect.js: ask('risen')) carry their name with its title over their heads, on a
//            gold-edged pill with the risen sign, from RISEN_PPM in: their mark of standing for the rest of their life
import { h, icon, esc } from './dom.js';

// fights (C): a raid or skirmish gathering at 4x drops time to 1x so it can be watched (setting "fightSlow", on by
// default), and the speed comes back when the last such fight is over, unless the player changed it meanwhile
const MAX_HEADS = 30;
const HEAD_PPM = 3.2;   // signs over heads only when zoomed in at least this far
const RISEN_PPM = 2.2;  // the Resurrected's name and title from a little further out (as far as the graves show)

export default [{
  type: 'panel', id: 'marks', region: 'world', order: 60,
  make(U) {
    const { ctx } = U;
    const layer = h('div', 'marks');
    const heads = new Map();   // person -> el
    let t = 0, headList = [];

    // ---------- fights: the glide in, and the drop from 4x to 1x for a fight where someone may die ----------
    if (U.settings.fightSlow == null) U.settings.fightSlow = true;
    const slowed = new Set();
    let restore = null; // the player's speed before the drop
    function fightSpeed() {
      const clk = ctx.clock;
      let live = 0;
      for (const f of U.s2.fights()) {
        if (!f.major) continue;
        live++;
        if (slowed.has(f.id)) continue;
        slowed.add(f.id);
        if (U.settings.fightSlow !== false && clk.speed >= 4 && !clk.paused) {
          if (!restore) restore = clk.speed;
          clk.setSpeed(1);
          U.feed?.push?.({ severity: 'info', text: `${f.kind === 'raid' ? 'A raid' : 'A skirmish'} is gathering, so time drops to 1x for you to watch it. Your speed comes back when it is over. (Settings: slow to 1x for fights.)`, x: f.x, z: f.z });
        }
      }
      if (!live) { slowed.clear(); if (restore) { if (clk.speed === 1) clk.setSpeed(restore); restore = null; } }
    }
    function frame(dt) {
      const run = ctx.clock.phase === 'running';
      t -= dt;
      // walking among the people (walk.js) hides this layer: the signs are not worked out meanwhile
      if (t <= 0) { t = 0.25; if (!U.walking) headList = run ? collectHeads() : []; if (run) fightSpeed(); }
      if (!U.walking) drawHeads();
    }

    // ---------- signs over the heads of the sick and the wounded ----------
    function collectHeads() {
      if (ctx.camera.ppm < RISEN_PPM) return [];
      const out = [];
      // the Resurrected first: their name and title (they may be sick too: the title still shows)
      const risen = U.call('sim', 'ask', 'risen');
      for (const p of Array.isArray(risen) ? risen : []) if (p?.kind === 'person' && !p.dead && !p.hidden && Number.isFinite(p.x)) out.push({ p, st: { risen: true } });
      if (ctx.camera.ppm < HEAD_PPM) return out;
      // (in the thick of a clash the bandage signs would bury the fight: the staggering shows who is hurt)
      const melee = new Set();
      for (const f of U.s2.fights()) if (f.major && f.phase === 'clash') for (const p of [...(f.attackers ?? []), ...(f.defenders ?? [])]) melee.add(p);
      for (const p of U.s2.living()) {
        if (p.hidden || !Number.isFinite(p.x) || melee.has(p)) continue;
        const st = U.s2.health(p);
        if (st.sick || st.wounded) out.push({ p, st });
      }
      // in a fight: those who kneel for the stone to fight for them, and those squaring up in a quarrel
      for (const f of U.s2.fights()) {
        for (const p of f.praying ?? []) if (!p.hidden && !p.dead) out.push({ p, st: { pray: true } });
        if (f.kind === 'quarrel' && f.phase !== 'after') for (const p of [...(f.attackers ?? []), ...(f.defenders ?? [])]) if (!p.hidden && !p.dead) out.push({ p, st: { angry: true } });
      }
      // the great and the turning points: a mark of their own (they may be sick too: the sickness shows first)
      const has = new Set(out.filter((o) => o.st.risen).map((o) => o.p));
      for (let i = out.length - 1; i >= 0; i--) if (!out[i].st.risen && has.has(out[i].p)) out.splice(i, 1);
      for (const o of out) has.add(o.p);
      const great = (Array.isArray(U.call('sim', 'ask', 'great')) ? U.call('sim', 'ask', 'great') : []).map((g) => g?.person ?? g).filter((p) => p && p.kind === 'person');
      for (const p of great) if (!p.dead && !p.hidden && !has.has(p) && Number.isFinite(p.x)) { out.push({ p, st: { great: true } }); has.add(p); }
      const tps = U.call('sim', 'ask', 'turningPoints');
      for (const x of Array.isArray(tps) ? tps : []) { const p = x?.person ?? x; if (p && p.kind === 'person' && !p.dead && !p.hidden && !has.has(p) && Number.isFinite(p.x)) { out.push({ p, st: { turn: true } }); has.add(p); } }
      const cx = innerWidth / 2, cy = innerHeight / 2;
      for (const o of out) { const s = ctx.camera.toScreen(o.p.x, o.p.y ?? 16, o.p.z); o.d = s.behind ? 1e9 : Math.hypot(s.x - cx, s.y - cy); }
      return out.sort((a, b) => a.d - b.d).slice(0, MAX_HEADS);
    }
    function drawHeads() {
      const live = new Set(), put = [];
      for (const { p, st } of headList) {
        live.add(p);
        let el = heads.get(p);
        if (!el) { el = h('span', 'headsign'); layer.appendChild(el); heads.set(p, el); }
        const kind = st.risen ? `risen:${p.name}` : st.great ? 'great' : st.turn ? 'turn' : st.pray ? 'pray' : st.angry ? 'angry' : st.sick && st.wounded ? 'both' : st.sick ? 'sick' : 'wound';
        if (el.dataset.k !== kind) {
          el.dataset.k = kind;
          el.classList.toggle('risen', !!st.risen);
          el.innerHTML = st.risen ? `<i class="hs-r">${icon('risen', 14)}</i><b class="hs-n">${esc(p.name)}</b>` : st.great ? `<i class="hs-g" title="A great person">${icon('great', 14)}</i>` : st.turn ? `<i class="hs-t" title="A turning point: much hangs on this life">${icon('turn', 14)}</i>` : st.pray ? `<i class="hs-p" title="Praying for the stone to fight for them">${icon('faith', 14)}</i>` : st.angry ? `<i class="hs-a" title="Quarrelling">${icon('provoke', 14)}</i>`
            : (st.sick ? `<i class="hs-s">${icon('sick', 14)}</i>` : '') + (st.wounded ? `<i class="hs-w">${icon('wound', 14)}</i>` : '');
        }
        const s = ctx.camera.toScreen(p.x, (p.y ?? 16) + 2.4, p.z);
        // people standing in a huddle (a sick household) show one sign, not a heap of them on top of each other
        // (the Resurrected's title shows over a warning's marker too, lifted clear of it: their standing is for life)
        const marked = !!U.markedPeople?.has(p);
        if (st.risen && marked) s.y -= 40;
        el.hidden = s.behind || p.dead || (marked && !st.risen) || put.some((q) => Math.abs(q.x - s.x) < 26 && Math.abs(q.y - s.y) < 26);
        if (!el.hidden) put.push({ x: s.x, y: s.y });
        if (!el.hidden) el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
      }
      for (const [p, el] of heads) if (!live.has(p)) { el.remove(); heads.delete(p); }
    }
    U.frame.push(frame);
    return layer;
  },
}];
