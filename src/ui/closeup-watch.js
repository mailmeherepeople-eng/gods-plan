// What asks for the close-up window (closeup.js is the window itself). The director's list, 2026-11-19, and nothing
// beyond it: the raids, the first people walking onto the map, and what carries the red problem sign.
//   raids     a raid or a skirmish (the fights that may kill: fights.js `major`), from the moment the band is close to
//             where it halts (the raided run out to meet it) to a few seconds after the last blow, following the
//             thick of it (the mock-up's option B)
//   first     the first family of the run walking in out of the mist, until they settle (at most FIRST_S)
//   red       what carries the red problem sign, when it really happens where it can be watched (the list is with
//             signs(), below; a red warning years away has nothing to watch yet and opens nothing until it comes)
// Each source names its window by a key, so one thing opens it once; a thing the player closed does not come back.
export function makeWatch(U, W) {
  const T = W.T;
  const ask = (n, ...a) => U.call('sim', 'ask', n, ...a);
  const standing = (f, p) => !p.dead && !p.hidden && !(f.gone?.has?.(p));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // where a crowd is thickest: the one with the most others close by, and the middle of that knot (a raid spreads
  // out, so the plain middle of everyone can be empty ground); the ground's height there comes with it
  function knot(list, at) {
    if (!list.length) return at ? { x: at.x, z: at.z } : null;
    const R2 = T.KNOT_R * T.KNOT_R;
    let best = list[0], bn = -1;
    for (const p of list) { let n = 0; for (const q of list) if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 < R2) n++; if (n > bn) { bn = n; best = p; } }
    let x = 0, y = 0, z = 0, n = 0, ny = 0;
    for (const q of list) if ((best.x - q.x) ** 2 + (best.z - q.z) ** 2 < R2) { x += q.x; z += q.z; n++; if (Number.isFinite(q.y)) { y += q.y; ny++; } }
    return { x: x / n, z: z / n, y: ny ? y / ny : undefined };
  }

  // ---------- raids ----------
  function fights() {
    const F = ask('fights:api');
    if (!F?.active) return;
    for (const f of F.active) {
      if (!f.major) continue;
      const key = `fight:${f.id}`;
      if (W.has(key)) continue;
      const close = f.phase === 'clash' || (f.phase === 'march' && f.alarm && f.stopA && f.attackers.some((p) => !p.dead && dist(p, f.stopA) < T.EARLY_R));
      if (!close) continue;
      W.want({ key, rank: T.RANK.raid, label: f.kind === 'raid' ? 'A raid' : 'A fight',
        focus: () => knot(f.attackers.concat(f.defenders).filter((p) => standing(f, p)), f),
        // on from the charge to the last blow; the window's AFTER_S then holds it a little longer
        live: () => F.active.includes(f) && (f.phase === 'march' || f.phase === 'clash') });
    }
  }

  // ---------- the first people walking onto the map ----------
  // the first family of the run, from the moment they walk in out of the mist until they settle (or leave, or die
  // out), at most FIRST_S. Only the first: families after them do not open it (not decided by the director).
  const alive = (p) => !!p && !p.dead && !p.hidden && Number.isFinite(p.x);
  let firstSeen = false;
  U.on('sim:arrive', (e) => {
    if (firstSeen) return;
    firstSeen = true;
    const f = e?.family;
    if (!f || e.skip) return;   // (a first family that came during a skip ahead was not there to be watched)
    if ((U.get('sim', 'families') ?? []).some((x) => x !== f)) return;   // (people were already there: put in by hand)
    W.want({ key: `first:${f.id}`, rank: T.RANK.first, label: 'The first people arrive', maxS: T.FIRST_S,
      focus: () => knot(f.members.filter(alive), e),
      live: () => (f.state === 'wander' || f.state === 'settling') && f.members.some(alive) });
  });

  // ---------- the red problem signs ----------
  // What shows the red sign (attend.js: an item of severity bad wears the red wax seal, and the serious ones also get
  // the red indicator at the screen's edge when off screen), and what of it can be watched:
  //   a warning counted in seconds (a wolf about to kill, someone trapped in a burning hut, a death in a fight): from
  //     SOON_S real seconds before it comes, on the one in danger (and the wolf, when one is named), until it has come
  //     or been stopped;
  //   a wolf on the hunt (a moment of the world's own, red): while it lasts, on the wolf and its prey;
  //   a warning counted in years (hunger, sickness or wounds that will kill, a family that will leave): nothing to
  //     watch yet, so no window then; it opens when the thing really happens: the death (on where they fell, DIED_S),
  //     or the family packing up and walking away (followed, at most LEAVE_S);
  //   a great person dead: on where they fell, DIED_S;
  //   raids and fights: the raid source above (it opens at the charge, which is the moment their warning comes true);
  //   "Your people" entering a danger band (too much faith, too little strength ...): a state of everyone, with no
  //     place on the map: never.
  const clock = U.ctx.clock;
  const red = new Map();        // foresight key -> what it was, for every warning that has worn the red sign
  const redFam = new Set();     // families a red warning said would leave
  const soonOf = new Map();     // person id -> when a window was asked for on them before they died (not asked twice)
  const present = new Set();    // keys of the red things on the screen at the last look
  const recent = [];            // deaths a window was asked for lately: { x, z, t }
  const at = (e) => (alive(e) ? e : null);
  const pair = (a, b) => (a && b && dist(a, b) < 30 ? { x: (a.x + b.x) / 2, y: Number.isFinite(a.y) && Number.isFinite(b.y) ? (a.y + b.y) / 2 : undefined, z: (a.z + b.z) / 2 } : a ?? b);
  const RAIDS = new Set(['raid', 'grudge', 'skirmish', 'fight']);
  function signs() {
    present.clear();
    const items = U.attend?.items ?? [];
    for (const it of items) {
      if (it.sev !== 'bad') continue;
      if (it.kind === 'fore') {
        for (const v of it.src?.views ?? []) {
          if (v.sev !== 'bad') continue;
          red.set(v.key, { kind: v.kind, how: v.how });
          if (v.kind === 'leave' && v.family) redFam.add(v.family.id);
        }
        const v = it.src?.v;
        if (!v || v.sev !== 'bad' || v.scale !== 'secs' || RAIDS.has(v.kind) || v.how === 'fight') continue;
        const key = `soon:${v.id ?? v.key}`;
        present.add(key);
        if (W.has(key)) continue;
        const left = (Number(v.in) || 0) / Math.max(1e-6, clock.speed || 1);
        if (left > T.SOON_S) continue;
        const who = v.subject, foe = (v.options ?? []).map((o) => (o?.power === 'strike' ? o.target?.entity : null)).find(alive) ?? null;
        const place = { x: v.x, z: v.z };
        if (who?.id != null) soonOf.set(who.id, performance.now());
        W.want({ key, rank: T.RANK.soon, label: v.title ?? 'A death is coming',
          focus: () => (v.how === 'fire' ? place : pair(at(who), at(foe)) ?? (who && Number.isFinite(who.x) ? who : place)),
          live: () => present.has(key) });
      } else if (it.kind === 'moment' && it.src?.kind === 'predator') {
        const key = `hunt:${it.key}`;
        present.add(key);
        if (W.has(key)) continue;
        const info = it.src;
        let wolf = info.entity ?? info.animal ?? null;
        if (!wolf) { let bd = 30; for (const a of U.get('sim', 'animals') ?? []) { if (a.dead || a.species !== 'wolf') continue; const d = Math.hypot(a.x - it.x, a.z - it.z); if (d < bd) { bd = d; wolf = a; } } }
        const place = { x: it.x, z: it.z };
        W.want({ key, rank: T.RANK.hunt, label: it.title ?? 'A wolf on the hunt',
          focus: () => pair(at(wolf?.prey), at(wolf)) ?? place,
          live: () => present.has(key) });
      }
    }
  }
  // a death that wore the red sign (or a great person's): the place where they fell, for DIED_S
  function died(p, label) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    if (p.cause === 'fight') return;   // (killed in a raid or a fight: the raid's own window showed it)
    const t = soonOf.get(p.id);
    if (t != null && performance.now() - t < 60000) return;   // (the window was already on them as it came)
    // (a sickness going through a village kills several in a few seconds: one window for them, not one each)
    const now = performance.now();
    while (recent.length && now - recent[0].t > T.DIED_NEAR_S * 1000) recent.shift();
    if (recent.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < T.DIED_NEAR_R)) return;
    recent.push({ x: p.x, z: p.z, t: now });
    const place = { x: p.x, y: p.y, z: p.z };
    W.want({ key: `died:${p.id}`, rank: T.RANK.died, label, afterS: T.DIED_S, focus: () => place, live: () => false });
  }
  U.on('foresight:landed', (v) => {
    if (!v || v.skip || !U.closeup?.on) return;
    const was = red.get(v.key);
    red.delete(v.key);
    if (!was || RAIDS.has(was.kind) || was.how === 'fight' || was.kind === 'leave' || was.kind === 'peace') return;   // (raids and leaving: their own)
    const p = v.subject;
    if (p?.kind === 'person' || p?.name) died(p, `${p.name ?? 'Someone'} has died`);
  });
  U.on('force:fell', (e) => { if (!e || e.skip || !U.closeup?.on) return; died(e.person, `${e.title ?? e.person?.name ?? 'A great one'} has died`); });
  U.on('force:leaving', (e) => { if (e?.family?.id != null) redFam.add(e.family.id); });
  U.on('sim:leave', (e) => {
    const f = e?.family;
    if (!f || e.skip || !U.closeup?.on || !redFam.has(f.id)) return;
    redFam.delete(f.id);
    W.want({ key: `leave:${f.id}`, rank: T.RANK.leaving, label: `The ${f.name} family leaves`, maxS: T.LEAVE_S,
      focus: () => knot(f.members.filter(alive), f.leader?.() ?? f.members[0]),
      live: () => (U.get('sim', 'families') ?? []).includes(f) && f.members.some(alive) });
  });

  return {
    // four times a second, and only while the switch is on (closed and switched off, nothing here runs per frame)
    slow() {
      if (!U.closeup?.on || U.ctx.clock.phase !== 'running') return;
      try { fights(); } catch (err) { U.warnOnce('closeup fights', err); }
      try { signs(); } catch (err) { U.warnOnce('closeup signs', err); }
    },
    // what the red signs are now (console, tests)
    get red() { return [...red.entries()].map(([k, v]) => ({ key: k, ...v })); },
    knot,
  };
}
