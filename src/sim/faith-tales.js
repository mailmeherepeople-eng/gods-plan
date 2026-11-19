// Tales: what happens to an act after it was seen (faith.js holds the rules'
// numbers, docs/FAITH.md the plain words). Each witnessed act is one tale.
//   at once      the witnesses' households hear it from them (one telling)
//   on waking    those who slept through a lasting act find what it left
//   the years    everyone who knows tells TELL_RATE others a life year: someone
//                close by first (at the fire, the stone, at work), else their
//                village, now and then someone from another village
//   strength     hearing moves a listener HEAR_W of seeing it, RETELL less for
//                each retelling, less again from another village, and a doubter
//                discounts it by doubt x HEAR_DOUBT_CUT. Nobody is moved twice by
//                one tale: a stronger version tops up, a weaker one does nothing.
//   legends      a newborn is told its parents' strongest tales (LEGEND_W), one
//                retelling further each generation, so they fade by generations
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (v) => `${v >= 0 ? '+' : ''}${Math.abs(v) >= 9.95 ? Math.round(v) : Math.round(v * 10) / 10}`;
const she = (p) => (p.sex === 'f' ? 'she' : 'he'), her = (p) => (p.sex === 'f' ? 'her' : 'his');
const EXAG = ['', '', ' and the ground hummed', ', taller than three huts', ' and the stone glowed all night', ', twice over'];
const NAME = {
  strike: 'the bolt of light', 'send-fire': 'fire from a clear sky', 'bless-harvest': 'rain from a clear sky', 'send-flood': 'the water rising', heal: 'the sick made well',
  'bless-weapons': 'the blessed spears', hill: 'a hill rising', pit: 'the ground falling away', plateau: 'a hill rising', cliff: 'a cliff rising', lake: 'a lake filling',
  river: 'a river carving itself', water: 'water from nowhere', dry: 'water vanishing', raise: 'the land rising', lower: 'the land sinking', flatten: 'the land flattening',
  smooth: 'the land moving', 'area-move': 'the land moving', 'area-copy': 'the land doubling', 'area-resize': 'the land stretching', 'area-flatten': 'the land flattening',
  animal: 'an animal out of thin air', trees: 'trees springing up', cave: 'a cave carved out of the hill',
};
const FOUND = { land: 'the land changed', paint: 'the ground changed', 'send-flood': 'the water risen', cave: 'a cave in the hillside' };

export function makeTales(R, H) {
  const { S } = R;
  const T = R.T;
  const { F, shift, settled, cause } = H;
  const tales = [];
  let seq = 0;
  const yearNow = () => Math.floor(S.year);
  const vid = (p) => R.ask('villageOf', p)?.id ?? null;
  const nameOf = (t) => NAME[t.kind] ?? (String(t.kind).startsWith('tree.') ? 'trees springing up' : F.KIND_GROUP[t.kind] === 'paint' ? 'the ground changing' : 'something no person could do');
  const power = (t) => Math.max(Math.abs(t.faith), Math.abs(t.doubt));
  const strength = (t, hop) => power(t) * F.HEAR_W * F.RETELL ** (hop - 1);

  // how the listener knows the teller: "her mother", "his wife", or the teller's name
  function desc(a, b) {
    if (b.mother === a) return `${her(b)} mother`;
    if (b.father === a) return `${her(b)} father`;
    if (a.mother === b || a.father === b) return `${her(b)} ${a.sex === 'f' ? 'daughter' : 'son'}`;
    if (b.partner === a) return `${her(b)} ${a.sex === 'f' ? 'wife' : 'husband'}`;
    return a.name;
  }
  const old = (a) => (a.stage === 'elder' ? 'Old ' : '');
  function words(t, a, b, hop) {
    if (hop <= 1) return { story: `Heard ${desc(a, b)} tell how ${she(a)} saw ${t.what}`, thought: `${old(a)}${a.name} swears ${she(a)} saw ${t.what}.` };
    if (hop === 2) return { story: `Heard ${desc(a, b)} tell how someone once saw ${t.what}`, thought: `${a.name} had it from ${t.k.get(a.id)?.from ?? 'someone who was there'}: someone saw ${t.what}.` };
    return { story: `Heard the old tale of how someone once saw ${t.what}`, thought: `They say someone once saw ${t.what}${EXAG[Math.min(EXAG.length - 1, hop)]}.` };
  }

  // one telling: a tells b; returns the change in b, or null if b already had as strong a version
  function tell(t, a, b, hop, far, o = {}) {
    const base = (o.legend ? F.LEGEND_W * F.RETELL ** Math.max(0, hop - 1) : F.HEAR_W * F.RETELL ** (hop - 1)) * (far ? F.FAR_VILLAGE_W : 1);
    const k = o.legend ? base : base * (1 - F.HEAR_DOUBT_CUT * b.skep / 100);
    const prev = t.k.get(b.id);
    if (prev && prev.k >= k) return null;
    const dk = k - (prev?.k ?? 0);
    const w = words(t, a, b, hop);
    const r = shift(b, t.faith * dk, t.doubt * dk, o.legend ? `Grew up on the tale of how someone once saw ${t.what}` : w.story);
    t.k.set(b.id, { hop, k, p: b, from: a.name, legend: !!o.legend });
    if (!prev) { if (o.legend) t.legend++; else t.heard++; }
    t.sumF += r.df; t.sumD += r.dd;
    if (!o.legend) {
      b.lastHeard = S.life;
      if (!b.asleep && !b.planted && !b.dead) S.mind.push(b, w.thought);
      if (!o.quiet) S.emit('faith:told', { a, b, df: r.df, dd: r.dd, hop, far: !!far, tale: t.id });
    }
    return r;
  }

  // ---------- a witnessed act becomes a tale ----------
  function fromAct(info, later) {
    const { act, spec, moved } = info;
    if (!spec.faith && !spec.doubt) return null;
    const t = { id: ++seq, kind: act.kind, what: info.what ?? 'something no person could do', y: yearNow(), life: S.life, x: act.x, z: act.z,
      faith: spec.faith ?? 0, doubt: spec.doubt ?? 0, k: new Map(), seen: 0, found: 0, heard: 0, legend: 0, sumF: 0, sumD: 0, pend: [], home: 0 };
    for (const m of moved) {
      const k = spec.faith ? (m.df / spec.faith || m.w) : spec.doubt ? (m.dd / spec.doubt || m.w) : m.w;
      t.k.set(m.p.id, { hop: 0, k: Math.max(0.01, k), p: m.p });
      t.seen++; t.sumF += m.df; t.sumD += m.dd;
    }
    t.pend = later.map((n) => ({ p: n.p, w: n.w, t: n.t, until: S.life + F.LATER_LIFE }));
    if (!t.seen && !t.pend.length) return null;
    tales.push(t);
    while (tales.length > F.MAX_TALES) tales.shift();
    // the households hear it at once, from the one who saw it
    for (const m of moved) for (const q of m.p.family?.members ?? []) {
      if (q.dead || q.age < 3 || t.k.has(q.id)) continue;
      if (tell(t, m.p, q, 1, false)) t.home++;
    }
    cause({ kind: 'act', sign: 1, tale: t.id, live: () => liveText(t) });
    const people = moved.map((m) => ({ p: m.p, df: m.df, dd: m.dd, how: m.how }));
    const avg = (k) => (people.length ? people.reduce((s, x) => s + x[k], 0) / people.length : 0);
    S.emit('faith:witness', { x: act.x, z: act.z, kind: act.kind, what: t.what, name: nameOf(t), seen: moved.length, far: moved.filter((m) => m.how !== 'saw').length,
      later: t.pend.length, home: t.home, avgF: avg('df'), avgD: avg('dd'), people, tale: t.id });
    return t;
  }
  function liveText(t) {
    const n = t.seen + t.found + t.heard;
    const parts = [`${t.seen} saw it`];
    if (t.found) parts.push(`${t.found} found it on waking`);
    parts.push(`${t.heard} heard of it`);
    return `${cap1(nameOf(t))}: ${parts.join(', ')}${t.legend ? `, ${t.legend} grew up on it` : ''}. Faith ${signed(t.sumF / Math.max(1, n))}, skepticism ${signed(t.sumD / Math.max(1, n))} on average among them.`;
  }

  // ---------- those who slept through it find it when they wake ----------
  function step() {
    for (const t of tales) {
      if (!t.pend.length) continue;
      const found = [];
      t.pend = t.pend.filter((n) => {
        const p = n.p;
        if (p.dead || S.life > n.until) return false;
        if (p.hidden || p.asleep) return true;
        const k = n.w * n.t, prev = t.k.get(p.id);
        if (prev && prev.k >= k) return false;
        const dk = k - (prev?.k ?? 0);
        const what = FOUND[t.kind] ?? FOUND[F.KIND_GROUP[t.kind]] ?? 'it';
        const r = shift(p, t.faith * dk, t.doubt * dk, `Woke to find ${what} in the night, and knew something had done it`);
        t.k.set(p.id, { hop: 0, k, p });
        if (!prev) t.found++;
        t.sumF += r.df; t.sumD += r.dd;
        p.lastSaw = S.life;
        S.peopleApi.story(p, `Woke to find ${what} in the night, and knew something had done it.`);
        if (!p.planted) S.mind.push(p, 'That was not there yesterday. I am sure of it.');
        found.push({ p, df: r.df, dd: r.dd, how: 'found' });
        return false;
      });
      if (found.length) S.emit('faith:witness', { x: t.x, z: t.z, kind: t.kind, what: t.what, name: nameOf(t), found: true, seen: found.length, people: found, tale: t.id,
        avgF: found.reduce((s, x) => s + x.df, 0) / found.length, avgD: found.reduce((s, x) => s + x.dd, 0) / found.length });
    }
  }

  // ---------- the years: word spreads, thinkers argue ----------
  function year() {
    const live = S.people.filter((p) => settled(p));
    if (!live.length) return;
    const vmap = new Map(live.map((p) => [p, vid(p)]));
    const rate = F.TELL_RATE * T.LIFE_RATE; // tellings per knower per calendar year
    for (const t of tales) {
      if (S.year - t.y > F.TALE_YEARS) continue;
      let non = live.filter((p) => p.age >= 3 && !t.k.has(p.id));
      if (!non.length) continue;
      let tells = 0;
      for (const rec of [...t.k.values()]) {
        const a = rec.p;
        if (!settled(a) || a.age < 6 || rec.hop >= F.MAX_HOP || strength(t, rec.hop + 1) < F.MIN_TELL) continue;
        let n = Math.floor(rate + Math.random());
        while (n-- > 0 && non.length && tells < F.MAX_TELLS) {
          const tv = vmap.get(a);
          const near = () => non.filter((q) => Math.hypot(q.x - a.x, q.z - a.z) <= F.TALK_NEAR);
          const village = () => non.filter((q) => (tv != null ? vmap.get(q) === tv : Math.hypot(q.x - a.x, q.z - a.z) <= 40));
          const away = () => non.filter((q) => (tv == null || vmap.get(q) !== tv) && Math.hypot(q.x - a.x, q.z - a.z) <= F.TALK_FAR);
          const r = Math.random();
          // once their own village all knows it, they tell whoever they meet from the next village
          const order = r < F.P_NEAR ? [near, village, away] : r < F.P_NEAR + F.P_VILLAGE ? [village, near, away] : [away];
          let q = null;
          for (const pickFrom of order) { const l = pickFrom(); if (l.length) { q = l[Math.floor(Math.random() * l.length)]; break; } }
          if (!q) continue;
          const far = tv != null && vmap.get(q) !== tv;
          tell(t, a, q, rec.hop + 1, far);
          non = non.filter((x) => x !== q);
          tells++;
        }
        if (tells >= F.MAX_TELLS || !non.length) break;
      }
    }
    // thinkers argue with whoever is near them: doubt rises a little, more in those with little faith
    const k = F.ARGUE_RATE * T.LIFE_RATE;
    for (const p of live) {
      const m = p.ext?.mind;
      if (!m || p.age < 14 || !(m.now || (m.rate ?? 0) >= 0.3) || Math.random() >= k) continue;
      const near = live.filter((q) => q !== p && q.age >= 12 && !(q.ext?.mind?.now) && Math.hypot(q.x - p.x, q.z - p.z) <= F.TALK_NEAR);
      if (!near.length) continue;
      const q = near[Math.floor(Math.random() * near.length)];
      const r = shift(q, 0, F.ARGUE_DOUBT * Math.max(0, 1 - q.faith / 120), `Listened to the thinkers ask who really does what the stone is thanked for`, { key: 'argue' });
      if (!q.asleep && !q.planted) S.mind.push(q, `${p.name} asks who really dug the river. I had not thought of that.`);
      S.emit('faith:told', { a: p, b: q, df: 0, dd: r.dd, doubt: true });
    }
  }

  // ---------- a newborn is told its parents' strongest tales ----------
  function legends(child, parents, o = {}) {
    const ids = new Set(parents.map((p) => p.id));
    const cand = [];
    for (const t of tales) {
      let best = null;
      for (const id of ids) { const r = t.k.get(id); if (r && (!best || r.k > best.k)) best = r; }
      if (best) cand.push({ t, rec: best });
    }
    cand.sort((a, b) => b.rec.k * power(b.t) - a.rec.k * power(a.t));
    for (const { t, rec } of cand.slice(0, F.LEGENDS)) {
      // silent: a child of a devout house took the parents' faith whole; it knows the tale (and can tell it) without a second helping
      if (o.silent) { const hop = rec.hop + 1; t.k.set(child.id, { hop, k: F.LEGEND_W * F.RETELL ** Math.max(0, hop - 1), p: child, from: rec.p.name, legend: true }); t.legend++; }
      else tell(t, rec.p, child, rec.hop + 1, false, { legend: true, quiet: true });
    }
  }

  // ---------- the forecast: how far word will go (the same rules, counted now) ----------
  function forecast(act, N) {
    const seen = N.now.map((n) => n.p), later = N.later.map((n) => n.p);
    if (!seen.length && !later.length) return '';
    const know = new Set([...seen, ...later]);
    let home = 0;
    const homeSet = new Set();
    for (const p of seen) for (const q of p.family?.members ?? []) if (!q.dead && q.age >= 3 && !know.has(q) && !homeSet.has(q)) { homeSet.add(q); home++; }
    const live = S.people.filter((p) => settled(p) && p.age >= 3);
    const vs = new Set([...seen, ...later].map(vid).filter((v) => v != null));
    const names = [...vs].map((v) => R.ask('villages')?.find?.((x) => x.id === v)?.name).filter(Boolean);
    let vill = 0, away = 0, beyond = 0;
    const near = (q) => [...know].some((p) => Math.hypot(p.x - q.x, p.z - q.z) <= F.TALK_FAR);
    for (const q of live) {
      if (know.has(q) || homeSet.has(q)) continue;
      const v = vid(q);
      if (vs.size ? vs.has(v) : [...know].some((p) => Math.hypot(p.x - q.x, p.z - q.z) <= 40)) vill++;
      else if (near(q)) away++;
      else beyond++;
    }
    const avgSkep = live.length ? live.reduce((s, p) => s + p.skep, 0) / live.length : 50;
    const spec = R.witnessSpec(act) ?? {};
    const hearF = (spec.faith ?? 0) * F.HEAR_W * (1 - F.HEAR_DOUBT_CUT * avgSkep / 100);
    const bits = [];
    if (home) bits.push(`their households at once (${home})`);
    if (vill) bits.push(`${names.length ? `the rest of ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}` : 'the rest of their village'} within about 15 years (about ${vill} more)`);
    // measured (seed 2): a village within talking distance of one who knows hears nearly all of it in 15 years
    if (away) bits.push(`about ${away} in other villages nearby, also within about 15 years, believed less`);
    if (beyond && (home || vill || away)) bits.push(`${beyond} probably too far off to hear of it`);
    if (!bits.length) return '';
    return `Word spreads: ${bits.join('; ')}. Hearing it moves faith about ${signed(hearF)} at first, less with each retelling.`;
  }

  // ---------- the last act's reach, for the ledger ----------
  function lastReach() {
    const t = tales[tales.length - 1];
    if (!t) return null;
    const live = S.people.filter((p) => settled(p) && p.age >= 3);
    const knowing = live.filter((p) => t.k.has(p.id));
    const groups = new Map();
    for (const p of live) {
      const v = R.ask('villageOf', p);
      const key = v?.name ?? `the ${p.family.name} family`;
      const g = groups.get(key) ?? (groups.set(key, { name: key, knew: 0, of: 0 }), groups.get(key));
      g.of++; if (t.k.has(p.id)) g.knew++;
    }
    return { name: nameOf(t), what: t.what, y: t.y, years: yearNow() - t.y, seen: t.seen, found: t.found, heard: t.heard, legend: t.legend, knowing: knowing.length, of: live.length,
      sumF: t.sumF, sumD: t.sumD, groups: [...groups.values()].filter((g) => g.knew).sort((a, b) => b.knew - a.knew), x: t.x, z: t.z, told: S.year - t.y <= F.TALE_YEARS };
  }

  return { fromAct, step, year, legends, forecast, lastReach, count: () => tales.length, list: () => tales };
}
