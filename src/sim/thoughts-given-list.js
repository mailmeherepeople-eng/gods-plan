// B. Minds: the ready thoughts the god can give (thoughts-given.js runs them).
// Each one: the words (`text`, word for word what the person then thinks), how
// odd it is (`odd` 0 plain .. 1 very strange: the voice-or-own rule reads it),
// how long it stays on their mind (`lasts`, life years), what it makes them do
// (`act`, a claim on their next activity, at `chance`), how others take it when
// told (`weights`, `heard`), any lasting modifiers (`mods`, on while it is on
// their mind), and the plain words of the forecast (`does`, `others`,
// `forGood`, `forecast`), which say only what the code below does.
import { clamp, clamp100, she, her, herO, cap1, dist, mid, pct } from './science-util.js';

const near = (a, b, r) => a && b && Math.hypot(a.x - b.x, a.z - b.z) < r;
const need = (H, f) => Math.max(0.01, H.PA().needOf(f));
const famOn = (H, f, id) => !!f?.members?.some((m) => !m.dead && H.isOn(m, id));
const SHARE = 0.25, OFFER = 0.4, RABBIT_HIT = 0.45, RABBIT_FOOD = 0.8, LEAVE_HAPPY = 55;
const leaveChance = (p) => {
  const f = p.family;
  if (p.stage === 'child' || f.state !== 'settled') return 0;
  const alive = f.members.filter((m) => !m.dead);
  const h = alive.reduce((s, m) => s + m.happy, 0) / Math.max(1, alive.length);
  return h < LEAVE_HAPPY ? clamp((LEAVE_HAPPY - h) / 40, 0, 0.8) : 0;
};
const nextIs = (H, ids) => ids.includes(H.R.ask('nextDiscovery')?.id);

export const READY = [
  // ---- the four dimensions ----
  { id: 'four-dimensions', title: 'The universe has four dimensions', text: 'The universe has four dimensions. Time is just another way to walk.', odd: 0.95, tone: 'confused', lasts: 8, chance: 0.6, tell: 0,
    does: 'stares at walls, works at 60 percent, walks the four corners of nothing in particular, and walks up to people to tell them, correctly, how and when they will die (the very fate you see).',
    others: 'each one told: a believer takes it for a gift of sight (faith +4); a skeptic laughs (skepticism +2); anyone told they have under 10 years left is badly shaken (happiness -8).',
    forGood: 'goes on telling fortunes now and then for life',
    mods: [['work', { mul: 0.6 }]],
    act(p, H) {
      const q = H.nearestPerson(p, 30, (x) => x.ext?.given?.foretoldBy !== p.id);
      if (!q || Math.random() < 0.3) {
        // the four corners of nothing in particular
        const h = H.home(p), A = H.PA(), s = 5;
        const pts = [[s, 0], [s, s], [0, s], [0, 0]].map(([dx, dz]) => ({ x: h.x + dx, z: h.z + dz }));
        const leg = (i) => (i >= pts.length ? null : A.goTo(p, pts[i].x, pts[i].z, { doing: 'walking the fourth way', r: 0.6, until: 8, then: () => leg(i + 1) }));
        leg(0);
        return true;
      }
      return H.visit(p, q, `telling ${q.name} about ${her(q)} future`, (who) => {
        const line = H.fateLine(who);
        const end = H.S.mind.endOf(who), left = end.age - who.age;
        const g = H.G(who); g.foretoldBy = p.id;
        const c = H.G(p).cur;
        if (who.faith >= who.skep) { who.faith = clamp100(who.faith + 4); if (c) c.believed++; H.say(who, `${p.name} looked straight through me and said: "${line}" ${cap1(she(p))} sees it. ${cap1(she(p))} really sees it.`); }
        else { who.skep = clamp100(who.skep + 2); if (c) c.laughed++; H.say(who, `${p.name} says: "${line}" As if anyone could know that.`); }
        if (left < 10) { who.happy = clamp100(who.happy - 8); H.say(who, `"${line}" That is so soon.`); }
        if (c) c.told++;
        H.R.story(who, `${p.name}, who says time is a way to walk, told ${herO(who)}: "${line}"`);
      });
    },
    forecast: (p, H) => {
      const q = H.nearestPerson(p, 30);
      return q ? { gains: [`The first in reach would be ${q.name}, who would hear: "${H.fateLine(q)}"`] } : null;
    } },

  { id: 'fish-watching', title: 'The fish are watching you', text: 'The fish are watching me. They know what I did.', odd: 0.8, tone: 'troubled', lasts: 6, chance: 0.4, tell: 0.2,
    does: 'keeps going down to the water to stare the fish down instead of working, and is gloomy about it (happiness -8 at once, -6 while it lasts).',
    others: 'most laugh; the devout may believe it and get a little afraid of the water themselves (happiness -3).',
    forGood: 'never quite trusts the water again',
    mods: [['happy', { add: -6 }]],
    give: (p) => { p.happy = clamp100(p.happy - 8); return null; },
    act(p, H) { const s = H.byWater(p, 5); if (!s) return false; return H.goWork(p, s.x, s.z, 'sit', 6, 'staring back at the fish', { walking: 'going to have it out with the fish', face: s.face }); },
    weights: (q) => ({ believe: q.faith > 55 ? 1.4 : 0.4 }),
    heard: (q, p, kind) => { if (kind === 'believe') q.happy = clamp100(q.happy - 3); } },

  { id: 'share-grain', title: 'What if we shared the grain?', text: "What if we shared the grain? All of it, everyone's.", odd: 0.35, tone: 'inspired', lasts: 6, chance: 0.35, tell: 0.3,
    does: `carries grain to the hungriest neighbouring family, a basket at a time (a quarter of the family store each trip, while the family has a year and a half of food or more).`,
    others: 'the hungry love the idea and do the same with what they have; the well fed skeptics laugh it off or keep away.',
    forGood: 'shares food with the hungry for life',
    act(p, H) {
      const f = p.family, n = need(H, f);
      if (f.food < n * 1.5) return false;
      let best = null, br = (f.food / n) * 0.7;
      for (const o of H.S.families) {
        if (o === f || o.state !== 'settled' || !o.home?.done || !near(mid(o.home), p, 70)) continue;
        const r = o.food / need(H, o);
        if (r < br) { br = r; best = o; }
      }
      if (!best) return false;
      const A = H.PA();
      A.carry(p, 'basket');
      A.goTo(p, best.home.door.x, best.home.door.z, { doing: `carrying grain to the ${best.name} family`, r: 0.9, until: 40, then: () => {
        A.carry(p, null);
        const g = Math.min(f.food * SHARE, need(H, best) * 2);
        f.food -= g; best.food += g;
        H.R.story(p, `Carried grain to the ${best.name} family, for nothing.`);
        for (const q of best.members) if (!q.dead && dist(q, p) < 25) { q.happy = clamp100(q.happy + 5); H.say(q, `${p.name} of the ${f.name} family brought us grain. For nothing!`); }
        A.work(p, null, 1.5, { doing: 'handing over the grain' });
      } });
      return true;
    },
    forecast: (p, H) => {
      const f = p.family, n = need(H, f);
      return { costs: [f.food >= n * 1.5 ? `The ${f.name} store (${Math.round(f.food * 10) / 10} years of eating) shrinks by a quarter each trip; in a bad year they may go short themselves.` : `The ${f.name} family has under a year and a half of food, so there is nothing to share yet.`] };
    },
    weights: (q) => ({ believe: q.hunger > 0 || q.family.shortRate > 0 ? 2.2 : q.happy > 55 ? 1 : 0.5, shun: q.skep > 60 && q.hunger <= 0 ? 1.2 : 0.3 }) },

  { id: 'stone-hollow', title: 'The stone is hollow', text: 'The stone is hollow. Something lives inside it.', odd: 0.85, tone: 'confused', lasts: 6, chance: 0.45, tell: 0.3,
    does: 'spends days at the stone, knocking on it and listening.',
    others: 'believers go and listen at the stone too (faith +4 each); skeptics scoff the more for it (skepticism +3 each).',
    forGood: 'knocks on the stone, now and then, for life',
    act(p, H) { const s = H.stoneSpot(); return H.goWork(p, s.x, s.z, 'pick', 5, 'knocking on the stone and listening', { walking: 'going to listen to the stone', face: s.face }); },
    weights: (q) => ({ believe: q.faith > q.skep ? 1.5 : 0.5 }),
    heard: (q, p, kind) => { if (kind === 'believe') q.faith = clamp100(q.faith + 4); else if (kind === 'laugh') q.skep = clamp100(q.skep + 3); } },

  { id: 'neighbour-right', title: 'Your neighbour is right', text: 'My neighbour is right. About everything. Always has been.', odd: 0.4, tone: 'amused', lasts: 6, chance: 0.35, tell: 0.2,
    does: 'takes on most of the nearest neighbour\'s views at once (60 percent of the way to their faith and skepticism), keeps going round to agree with them, and holds grudges at half the rate.',
    others: 'the neighbour is flattered (happiness +6 each visit); everyone else finds it hilarious.',
    forGood: 'agrees with that neighbour for life',
    mods: [['grudge', { mul: 0.5 }]],
    give(p, H, c) {
      const q = H.nearestPerson(p, 80, (x) => x.family !== p.family && x.stage !== 'child');
      if (!q) return 'There was no neighbour to agree with.';
      c.target = q.id;
      p.faith = clamp100(p.faith + (q.faith - p.faith) * 0.6); p.skep = clamp100(p.skep + (q.skep - p.skep) * 0.6);
      return `${cap1(she(p))} now sees things the way ${q.name} does.`;
    },
    act(p, H, c) {
      const q = H.S.people.find((x) => x.id === (c?.target ?? H.G(p).cur?.target) && !x.dead && !x.hidden);
      if (!q) return false;
      return H.visit(p, q, `agreeing with ${q.name} about everything`, (who) => { who.happy = clamp100(who.happy + 6); H.say(who, `${p.name} came round to agree with me again. ${cap1(she(p))} is very wise.`); }, 'sit', 5);
    },
    forecast: (p, H) => {
      const q = H.nearestPerson(p, 80, (x) => x.family !== p.family && x.stage !== 'child');
      if (!q) return { costs: ['There is no neighbour near enough to agree with: the thought will have nothing to hold on to.'] };
      const f = Math.round(p.faith + (q.faith - p.faith) * 0.6), s = Math.round(p.skep + (q.skep - p.skep) * 0.6);
      return { gains: [`The neighbour is ${q.name} of the ${q.family.name} family (faith ${Math.round(q.faith)}, skepticism ${Math.round(q.skep)}): ${p.name} goes from faith ${Math.round(p.faith)} and skepticism ${Math.round(p.skep)} to about ${f} and ${s}, after the voice or own idea below.`] };
    },
    weights: () => ({ believe: 0.4, laugh: 1.6 }) },

  { id: 'count-everything', title: 'Count everything', text: 'Count everything. Then count it again.', odd: 0.5, tone: 'inspired', lasts: 8, chance: 0.45, tell: 0.25,
    does: 'goes round counting the fields, the huts and the stone; counting counts as thinking for a mind that can think (half as fast again while it lasts), and the family store, counted, holds a year more.',
    others: 'skeptics take it up and count too; the devout shrug.',
    forGood: 'counts things for life',
    mods: [['think', { mul: 1.5 }], ['store', { add: 1, who: (f, H) => !!f?.members && famOn(H, f, 'count-everything') }]],
    act(p, H) {
      const f = p.family, opts = [];
      for (const fl of f.fields) opts.push([mid(fl), 'the rows in the field']);
      if (f.home) opts.push([H.home(p), 'the sticks in the hut wall']);
      opts.push([H.S.stone.centre, 'the stones round the stone']);
      if (H.S.fire?.done) opts.push([mid(H.S.fire), 'the stones of the fire circle']);
      const [at, what] = opts[Math.floor(Math.random() * opts.length)];
      const s = H.PA().spotNear(at.x, at.z, 1.5, 4);
      return H.goWork(p, s.x, s.z, 'pick', 4, `counting ${what}`, { walking: 'going to count something', think: true });
    },
    weights: (q) => ({ believe: q.skep > 50 ? 1.5 : 0.4 }) },

  { id: 'sky-lid', title: 'The sky is a lid', text: 'The sky is a lid. Someone could lift it.', odd: 0.8, tone: 'troubled', lasts: 6, chance: 0.45, tell: 0.25,
    does: 'climbs the highest ground near home to stare up at the lid, and from the afternoon on keeps close to the door in case someone lifts it.',
    others: 'believers grow uneasy (happiness -4) and keep close to home too; the rest laugh.',
    forGood: 'keeps one eye on the sky for life',
    act(p, H) {
      if (H.S.dayT > 0.45) { const h = H.home(p); return H.goWork(p, h.x, h.z, 'sit', 6, 'keeping close to the door, in case someone lifts the lid', { walking: 'hurrying home before someone lifts the lid' }); }
      const L = H.S.land, h = H.home(p);
      let best = null, bt = -1;
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * 6.283, r = 4 + Math.random() * 22;
        const x = Math.floor(h.x + Math.cos(a) * r), z = Math.floor(h.z + Math.sin(a) * r);
        if (!L.inside?.(x, z) || !L.passable(x, z, 'person')) continue;
        const t = L.topAt(x, z);
        if (t > bt) { bt = t; best = { x: x + 0.5, z: z + 0.5 }; }
      }
      if (!best) return false;
      return H.goWork(p, best.x, best.z, 'sit', 6, 'staring up at the lid', { walking: 'climbing up to look at the lid' });
    },
    weights: (q) => ({ believe: q.faith > q.skep ? 1.3 : 0.5 }),
    heard: (q, p, kind) => { if (kind === 'believe') q.happy = clamp100(q.happy - 4); } },

  { id: 'you-could-leave', title: 'You could leave', text: 'You could leave. Nobody is keeping you here.', odd: 0.3, tone: 'inspired', lasts: 4, chance: 0.4, tell: 0.3,
    does: (p) => {
      const c = leaveChance(p);
      return c > 0 ? `the family is not happy here: ${chanceText2(c)} the family packs up and leaves at once. Otherwise ${she(p)} walks out toward the mist, looks at it a while, and comes back content (happiness +8).`
        : `walks out toward the mist, looks at it a while, and comes back content (happiness +8). The family is happy enough here that leaving does not come into it.`;
    },
    others: 'in an unhappy family, the idea brings them a year or two nearer to leaving; the happy laugh.',
    forGood: 'goes and looks at the mist now and then, for life',
    give(p, H, c) {
      const ch = leaveChance(p);
      if (ch > 0 && Math.random() < ch) { c.left = true; H.PA().leave(p.family, 'one of them realised nobody was keeping them here', 'warn'); return `The ${p.family.name} family packed up and left.`; }
      return null;
    },
    act(p, H, c) {
      if (c?.looked || p.family.state !== 'settled') return false;
      // out, away from the stone, toward the mist at the edge of the land
      const h = H.home(p), c0 = H.S.stone.centre;
      const dx = h.x - c0.x, dz = h.z - c0.z, d = Math.hypot(dx, dz) || 1;
      H.PA().goTo(p, h.x + dx / d * 30, h.z + dz / d * 30, { doing: 'walking out toward the mist', r: 2, until: 30, then: () => H.here(p, 'sit', 6, 'looking out at the mist', { then: () => {
        if (c) c.looked = true;
        p.happy = clamp100(p.happy + 8);
        H.say(p, 'I could leave. I will not. But I could.');
      } }) });
      return true;
    },
    forecast: (p) => { const c = leaveChance(p); return c > 0 ? { costs: [`${chanceText2(c, true)} the whole ${p.family.name} family leaves the land at once.`] } : null; },
    weights: (q) => ({ believe: leaveChance(q) > 0 ? 1.6 : 0.3 }),
    heard: (q, p, kind) => { if (kind === 'believe' && leaveChance(q) > 0) q.family.unhappy = (q.family.unhappy ?? 0) + 2; } },

  { id: 'wash-hands', title: 'Wash your hands', text: 'Wash your hands. Something too small to see is on them.', odd: 0.45, tone: 'confused', lasts: 10, chance: 0.35, tell: 0.25,
    does: 'keeps going to the water to wash. While it lasts, sickness catches and kills them half as often.',
    others: 'some take it up (and get the same protection); skeptics laugh: too small to see, so how would anyone know?',
    forGood: 'washes for life, and keeps the protection',
    mods: [['sickness', { mul: 0.5 }]],
    act(p, H) { const s = H.byWater(p, 1.2); if (!s) return false; return H.goWork(p, s.x, s.z, 'pick', 3, 'washing hands, again', { walking: 'going to wash', face: s.face }); },
    weights: () => ({ believe: 0.8 }) },

  { id: 'nobody-in-charge', title: 'Nobody is in charge', text: 'Nobody is in charge. Not even the stone.', odd: 0.6, tone: 'troubled', lasts: 6, chance: 0.1, tell: 0.3,
    does: 'stops praying (at the prayer hour, sits pointedly at home instead).',
    others: 'the devout keep away and cling to the stone the harder (faith +2); skeptics agree (skepticism +5, faith -3).',
    forGood: 'never prays again',
    meters: { own: () => ({ faith: -15, skep: 12 }), voice: () => ({ faith: -8, skep: 8, happy: -10 }) },
    act(p, H) { const h = H.home(p), s = H.PA().spotNear(h.x, h.z, 0.8, 2.5); return H.goWork(p, s.x, s.z, 'sit', 4, H.prayerHour() ? 'pointedly not praying' : 'sitting about, unsupervised'); },
    give: (p, H, c) => (c.asVoice ? `A voice from above told ${herO(p)} nobody is up there. ${cap1(she(p))} is still working out what that means.` : null),
    weights: (q) => ({ believe: q.skep > 55 ? 2 : 0.4, shun: q.faith > 55 ? 3 : 0.3 }),
    heard: (q, p, kind) => { if (kind === 'believe') { q.skep = clamp100(q.skep + 5); q.faith = clamp100(q.faith - 3); } else if (kind === 'shun') q.faith = clamp100(q.faith + 2); } },

  { id: 'fire-hungry', title: 'Fire is hungry', text: 'Fire is hungry. Feed it, and it will keep us.', odd: 0.5, tone: 'inspired', lasts: 6, chance: 0.4, tell: 0.25,
    does: 'spends time feeding the fire circle (or the hearth at home, if there is none), and is happier for it (+4). While anyone feeds it, everyone living within 45 of the fire circle is a little happier (+2).',
    others: 'many take it up; nobody minds a warm fire.',
    forGood: 'feeds the fire for life',
    mods: [['happy', { add: 4 }], ['happy', { add: 2, who: (p, H) => H.fireFed > 0 && p?.kind === 'person' && H.S.fire?.done && p.family?.home && near(mid(H.S.fire), mid(p.family.home), 45) }]],
    init(H) { H.fireFed = 0; H.ticks.push(() => { let n = 0; for (const q of H.S.people) if (!q.dead && H.isOn(q, 'fire-hungry')) n++; H.fireFed = n; }); },
    act(p, H) {
      const F = H.S.fire;
      if (F?.done && near(mid(F), p, 60)) { const c = mid(F), s = H.PA().spotNear(c.x, c.z, 2.5, 3.5); return H.goWork(p, s.x, s.z, 'chop', 6, 'feeding the fire', { walking: 'fetching wood for the fire', face: c }); }
      const h = H.home(p); return H.goWork(p, h.x, h.z, 'chop', 5, 'building up the hearth');
    } },

  { id: 'dance-rain', title: 'If we dance, it will rain', text: 'If we dance, it will rain.', odd: 0.55, tone: 'amused', lasts: 5, chance: 0.45, tell: 0.35,
    does: 'dances in the fields. It will not rain because of it: nothing here makes rain. The dancers are happier (+6) and the fields get less care.',
    others: 'plenty join in for the fun of it; the rest laugh.',
    forGood: 'dances in the fields for life',
    mods: [['happy', { add: 6 }]],
    act(p, H) {
      const fl = p.family.fields[0];
      const at = fl ? mid(fl) : H.home(p), s = H.PA().spotNear(at.x, at.z, 0.5, 3);
      return H.goWork(p, s.x, s.z, 'play', 5, 'dancing for rain', { walking: 'going to dance for rain' });
    },
    weights: () => ({ believe: 1.3, laugh: 1.1 }) },

  { id: 'sleep-wasted', title: 'Sleep is a waste', text: 'Sleep is a waste. The night is long and full of time.', odd: 0.45, tone: 'confused', lasts: 6, chance: 0.9, tell: 0.2, night: true,
    does: 'stays up outdoors all night, so can see what happens in the dark (sight 7 at night), and works at three quarters strength from tiredness.',
    others: 'hardly anyone believes it; they are asleep.',
    forGood: 'sleeps little for life',
    mods: [['work', { mul: 0.75 }]],
    act(p, H) {
      if (!H.night()) { if (Math.random() > 0.2) return false; return H.here(p, 'sit', 4, 'yawning'); }
      p.nightBound = true; p.asleep = false;
      const F = H.S.fire, c = F?.done && p.family.home && near(mid(F), mid(p.family.home), 40) ? mid(F) : H.home(p);
      const s = H.PA().spotNear(c.x, c.z, 1.5, 3.5);
      H.PA().goTo(p, s.x, s.z, { doing: 'awake while everyone sleeps', r: 0.8, until: 15, then: () => { H.PA().work(p, 'sit', 8, { doing: 'awake while everyone sleeps' }); if (p.work) p.work.mind = 'busy'; } });
      return true;
    },
    weights: () => ({ believe: 0.3 }) },

  { id: 'birds-gods', title: 'The white birds are the true gods', text: 'The white birds are the true gods. The stone is just where they sit.', odd: 0.75, tone: 'inspired', lasts: 6, chance: 0.4, tell: 0.3,
    does: 'follows the white birds about and bows to them; at the prayer hour prays to a bird instead of the stone. Taken as an own idea, faith in the stone falls (faith -6).',
    others: 'children love it and follow the birds too; the devout keep away.',
    forGood: 'bows to birds for life',
    meters: { own: () => ({ faith: -6 }) },
    act(p, H) {
      let b = null, bd = 60;
      for (const a of H.S.animals) if (a.species === 'bird' && !a.dead && !a.flying) { const d = dist(a, p); if (d < bd) { bd = d; b = a; } }
      if (!b) for (const a of H.S.animals) if (a.species === 'bird' && !a.dead) { const d = dist(a, p); if (d < bd) { bd = d; b = a; } }
      if (!b) return false;
      const s = H.PA().spotNear(b.x, b.z, 2, 3.5);
      return H.goWork(p, s.x, s.z, 'pray', 5, 'bowing to a white bird', { walking: 'following the white birds', face: { x: b.x, z: b.z } });
    },
    weights: (q) => ({ believe: q.stage === 'child' ? 2.5 : 0.6, shun: q.faith > 55 ? 1.5 : 0.3 }) },

  { id: 'eat-rabbits', title: 'We could eat the rabbits', text: 'The rabbits are eating our grain. We could eat the rabbits.', odd: 0.3, tone: 'inspired', lasts: 6, chance: 0.4, tell: 0.3,
    does: `goes after the rabbits; ${pct(RABBIT_HIT)} of the chases that end within reach of one put it in the pot (food +${RABBIT_FOOD} years of eating). Fewer rabbits nibble the fields, and fewer are left to draw the wolves off people.`,
    others: 'the hungry join the hunt; the rest think rabbits are too quick.',
    forGood: 'hunts rabbits for life',
    act(p, H) {
      let r = null, bd = 60;
      for (const a of H.S.animals) if (a.species === 'rabbit' && !a.dead) { const d = dist(a, p); if (d < bd) { bd = d; r = a; } }
      if (!r) return false;
      const A = H.PA();
      A.goTo(p, r.x, r.z, { doing: 'chasing a rabbit', r: 1.5, until: 12, speed: 3, direct: true, then: () => {
        let hit = null, hd = 6;
        for (const a of H.S.animals) if (a.species === 'rabbit' && !a.dead) { const d = dist(a, p); if (d < hd) { hd = d; hit = a; } }
        if (hit && Math.random() < RABBIT_HIT) {
          H.S.animalsApi.kill(hit, 'hunted'); hit.keepBody = 3;
          p.family.food += RABBIT_FOOD;
          H.say(p, 'Got one! Rabbit tonight.'); H.R.story(p, 'Caught a rabbit for the pot.');
        } else H.say(p, 'Too quick. Next time.');
        A.work(p, null, 1, { doing: 'catching breath' });
      } });
      return true;
    },
    weights: (q) => ({ believe: q.hunger > 0 || q.family.shortRate > 0 ? 2.2 : 0.8 }) },

  { id: 'stars-fires', title: 'The stars are fires', text: "The stars are other people's fires, very far away.", odd: 0.6, tone: 'inspired', lasts: 6, chance: 0.5, tell: 0.3, night: true,
    does: 'sits out in the early night looking up instead of going to bed (and can see what happens then), thinks twice as fast at work while it lasts, and is happier for it (+4).',
    others: 'children love it (happiness +4); some of the devout take it as a sign (faith +2).',
    forGood: 'looks at the stars for life',
    mods: [['think', { mul: 2 }], ['happy', { add: 4 }]],
    act(p, H) {
      if (!H.night() || H.S.dayT > 0.85 || H.S.dayT < 0.5) return false;
      p.nightBound = true; p.asleep = false;
      const h = H.home(p), s = H.PA().spotNear(h.x, h.z, 1.5, 4);
      H.PA().goTo(p, s.x, s.z, { doing: 'looking at the stars', r: 0.8, until: 12, then: () => { H.PA().work(p, 'sit', 7, { doing: 'looking at the stars' }); if (p.work) p.work.mind = 'busy'; } });
      return true;
    },
    weights: (q) => ({ believe: q.stage === 'child' ? 2.5 : 1 }),
    heard: (q, p, kind) => { if (kind === 'believe') { if (q.stage === 'child') q.happy = clamp100(q.happy + 4); else if (q.faith > 50) q.faith = clamp100(q.faith + 2); } } },

  { id: 'stone-hungry', title: 'The stone is hungry', text: 'The stone is hungry. Leave it bread.', odd: 0.6, tone: 'confused', lasts: 6, chance: 0.35, tell: 0.3,
    does: `carries bread to the stone as an offering; each one takes ${OFFER} years of eating from the family store.`,
    others: 'the devout believe it (faith +3) and make offerings too; skeptics laugh: the birds are very well fed.',
    forGood: 'leaves bread at the stone for life',
    act(p, H) {
      const f = p.family;
      if (f.food < OFFER * 1.5) return false;
      const s = H.stoneSpot(), A = H.PA();
      A.carry(p, 'basket');
      return H.goWork(p, s.x, s.z, 'pray', 3, 'leaving bread at the stone', { walking: 'carrying bread to the stone', face: s.face, then: () => { A.carry(p, null); f.food = Math.max(0, f.food - OFFER); H.G(p).offered = (H.G(p).offered ?? 0) + OFFER; } });
    },
    weights: (q) => ({ believe: q.faith > 50 ? 1.8 : 0.3 }),
    heard: (q, p, kind) => { if (kind === 'believe') q.faith = clamp100(q.faith + 3); } },

  { id: 'be-kind', title: 'Be kind to the next person', text: 'Be kind to the next person you see. Then the one after.', odd: 0.15, tone: 'inspired', lasts: 6, chance: 0.45, tell: 0.3,
    does: 'goes round being kind to the unhappiest people near by (each one: happiness +8, grief eased), and gives half a year of food to a hungry house when the family can spare it.',
    others: 'most believe it and do the same: kindness spreads.',
    forGood: 'is kind for life',
    act(p, H) {
      let q = null, lo = 101;
      for (const x of H.S.people) if (x !== p && !x.dead && !x.hidden && !x.asleep && x.family.state === 'settled' && dist(x, p) < 30 && x.happy < lo) { lo = x.happy; q = x; }
      if (!q) return false;
      return H.visit(p, q, `being kind to ${q.name}`, (who) => {
        who.happy = clamp100(who.happy + 8); who.grief = Math.max(0, who.grief - 0.2);
        const mine = p.family, theirs = who.family;
        if (theirs !== mine && theirs.food < need(H, theirs) && mine.food > need(H, mine) * 2) { mine.food -= 0.5; theirs.food += 0.5; }
        H.say(who, `${p.name} was kind to me today, for no reason at all.`);
      }, 'sit', 3);
    },
    weights: () => ({ believe: 1.6, laugh: 0.6 }) },

  { id: 'children-know', title: 'The children know something', text: 'The children know something the grown-ups have forgotten.', odd: 0.55, tone: 'amused', lasts: 6, chance: 0.45, tell: 0.25,
    does: 'plays with the children instead of working; each child played with is happier (+5) and learns to ask why (skepticism +2: more thinkers later).',
    others: 'parents mostly laugh; a few keep away.',
    forGood: 'plays with the children for life',
    act(p, H) {
      const q = H.nearestPerson(p, 40, (x) => x.stage === 'child' && x.age >= 4);
      if (!q) return false;
      return H.visit(p, q, 'playing with the children, as an equal', () => {
        for (const c of H.S.people) if (!c.dead && c.stage === 'child' && dist(c, p) < 6) { c.happy = clamp100(c.happy + 5); c.skep = clamp100(c.skep + 2); }
      }, 'play', 5);
    },
    weights: () => ({ believe: 0.6, laugh: 1.5, shun: 1 }) },

  { id: 'i-am-the-stone', title: 'I am the stone', text: 'I am the stone. I have always been the stone.', odd: 0.95, tone: 'confused', lasts: 6, chance: 0.6, tell: 0.3,
    does: 'goes and stands at the stone, very still, for hours, being the stone.',
    others: 'some of the devout believe it (faith +2) and their families bring food to this one\'s family (a third of a year each); the very devout keep away from the blasphemy; skeptics laugh.',
    forGood: 'is the stone, on and off, for life',
    act(p, H) { const s = H.stoneSpot(); return H.goWork(p, s.x, s.z, null, 8, 'being the stone', { walking: 'going to be the stone' }); },
    weights: (q) => ({ believe: q.faith > 50 ? 1.2 : 0.2, shun: q.faith > 75 ? 2.5 : 0.4 }),
    heard: (q, p, kind) => {
      if (kind !== 'believe') return;
      q.faith = clamp100(q.faith + 2);
      if (q.family !== p.family && q.family.food > 0.4) { q.family.food -= 0.33; p.family.food += 0.33; }
    } },

  { id: 'seeds-closer', title: 'Plant the seeds closer', text: 'Plant the seeds closer together. Twice the grain.', odd: 0.3, tone: 'inspired', lasts: 8, chance: 0.3, tell: 0.3,
    does: 'replants the family rows closer together. It works, a little: the family fields give about a tenth more (not twice) while it lasts. Replanting counts as thinking work.',
    others: 'farmers take it up for their own fields; the rest are unconvinced.',
    forGood: 'farms close rows for life',
    mods: [['yield', { mul: 1.12, who: (f, H) => !!f?.members && famOn(H, f, 'seeds-closer') }]],
    act(p, H) {
      const fl = p.family.fields[Math.floor(Math.random() * p.family.fields.length)];
      if (!fl) return false;
      const s = fl.steps[Math.floor(Math.random() * fl.steps.length)];
      return H.goWork(p, s.x + 0.5, s.z + 0.5, 'tend', 6, 'replanting the rows closer', { walking: 'going to replant the field', think: true });
    },
    weights: (q) => ({ believe: q.family.fields.length ? 1.3 : 0.5 }) },

  { id: 'dead-listening', title: 'The dead can hear us', text: 'The dead can hear us. Talk to them.', odd: 0.7, tone: 'troubled', lasts: 6, chance: 0.35, tell: 0.25,
    does: 'sits alone talking to the dead; grief heals much faster (each talk eases it) and it is a comfort (happiness +3 each time).',
    others: 'the grieving believe it and are eased; others find it eerie and some keep away.',
    forGood: 'talks to the dead for life',
    act(p, H) {
      const h = H.home(p), s = H.PA().spotNear(h.x, h.z, 2, 6);
      return H.goWork(p, s.x, s.z, 'sit', 5, `talking to ${p.lost ?? 'the dead'}`, { walking: 'going somewhere quiet', then: () => { p.grief = Math.max(0, p.grief - 0.3); p.happy = clamp100(p.happy + 3); } });
    },
    weights: (q) => ({ believe: q.grief > 0.2 ? 2.4 : 0.5, shun: 0.6 }),
    heard: (q, p, kind) => { if (kind === 'believe') q.grief = Math.max(0, q.grief - 0.4); } },

  { id: 'round-things', title: 'Round things roll', text: 'Round things roll. Why is nobody using that?', odd: 0.4, tone: 'inspired', lasts: 4, chance: 0.3, tell: 0.3,
    does: (p, H) => {
      const n = H.R.ask('nextDiscovery');
      if (!n) return 'rolls stones about. There is nothing left to discover.';
      const big = nextIs(H, ['wheel', 'potters-wheel']);
      return `rolls stones about, thinking, and brings the next discovery (${n.name}) ${big ? '60' : '10'} percent of the way closer at once${big ? ': it is the very thing' : ''}. If that finishes it, it is made now.`;
    },
    others: 'skeptics who believe it think on it too (each brings the next discovery 3 percent closer).',
    forGood: 'rolls things for life',
    give(p, H) { const big = nextIs(H, ['wheel', 'potters-wheel']); H.R.ask('thinkPush', p, big ? 0.6 : 0.1); return null; },
    act(p, H) { const h = H.home(p), s = H.PA().spotNear(h.x, h.z, 2, 6); return H.goWork(p, s.x, s.z, 'pick', 4, 'rolling a stone about, thinking', { think: true }); },
    weights: (q) => ({ believe: q.skep > 45 ? 1.4 : 0.5 }),
    heard: (q, p, kind, H) => { if (kind === 'believe') H.R.ask('thinkPush', q, 0.03); } },
];

// chance words for a forecast line: "There is about a 1 in 4 chance"
function chanceText2(p, capital) {
  const n = p >= 0.45 ? `about ${Math.round(p * 10)} in 10` : `about 1 in ${Math.round(1 / p)}`;
  return `${capital ? 'There is' : 'there is'} a chance, ${n}, that`;
}

// ---------- free text: the general effect by tone (the game cannot understand the words) ----------
const LEX = {
  troubled: ['die', 'dies', 'dead', 'death', 'dark', 'kill', 'end', 'fear', 'afraid', 'alone', 'never', 'wrong', 'lost', 'pain', 'sad', 'doom', 'hate', 'blood', 'cold', 'nothing', 'no', 'cannot', 'worse', 'bad', 'evil', 'hell', 'grave', 'gone', 'empty', 'rot'],
  inspired: ['love', 'light', 'good', 'yes', 'hope', 'joy', 'free', 'sun', 'grow', 'build', 'together', 'can', 'great', 'sing', 'gold', 'beautiful', 'brave', 'true', 'better', 'kind', 'warm', 'new', 'rise', 'dream', 'star', 'stars', 'all', 'everyone', 'friend', 'peace'],
  amused: ['ha', 'haha', 'hahaha', 'lol', 'silly', 'fart', 'cheese', 'duck', 'banana', 'pants', 'bum', 'joke', 'wobble', 'goat', 'frog', 'sock', 'socks', 'hat', 'potato', 'noodle', 'butt', 'giggle', 'tickle', 'moo', 'quack', 'beard', 'snail', 'bees'],
};
// the tone of typed words by counting what they look like, not what they mean
export function readTone(text) {
  const t = String(text).toLowerCase();
  const words = t.match(/[a-z']+/g) ?? [];
  const score = { troubled: 0, inspired: 0, amused: 0 };
  for (const w of words) for (const k of Object.keys(LEX)) if (LEX[k].includes(w)) score[k]++;
  if (/!/.test(t)) score.inspired += 0.5;
  if (/(ha){2,}|lol|:\)|xd/.test(t)) score.amused += 1;
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best[1] >= 1) return best[0];
  if (/\?/.test(t) || words.length > 12) return 'confused';
  if (words.length <= 3 && /!/.test(t)) return 'inspired';
  return 'confused';
}
// how odd typed words seem: longer, louder and more questioning is odder
export function freeOdd(text) {
  const words = (String(text).match(/\S+/g) ?? []).length;
  const letters = String(text).replace(/[^a-zA-Z]/g, '');
  const caps = letters.length ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0;
  return Math.round(clamp(0.35 + words / 40 + (/!/.test(text) ? 0.1 : 0) + (caps > 0.6 ? 0.15 : 0) + (/\?/.test(text) ? 0.05 : 0), 0.3, 0.9) * 100) / 100;
}
export const FREE_TONES = {
  confused: { id: 'free-confused', free: true, tone: 'confused', title: 'a confusing thought', lasts: 6, chance: 0.35, tell: 0.3,
    does: 'repeats the words to people and spends spells staring at nothing, lips moving; works at three quarters strength while it lasts (happiness -2).',
    others: 'most are baffled and laugh; a few repeat the words too, word for word.',
    forGood: 'mutters the words for life',
    mods: [['work', { mul: 0.75 }], ['happy', { add: -2 }]],
    act(p, H) { const h = H.home(p), s = H.PA().spotNear(h.x, h.z, 1, 4); return H.goWork(p, s.x, s.z, 'sit', 5, 'staring at nothing, lips moving'); },
    weights: () => ({ believe: 0.5, laugh: 1.4 }) },
  inspired: { id: 'free-inspired', free: true, tone: 'inspired', title: 'an inspiring thought', lasts: 6, chance: 0, tell: 0.35,
    does: 'is lit up by it: happier (+4), works 15 percent harder and thinks half as fast again while it lasts, and repeats the words to people.',
    others: 'many are carried along (happiness +4) and repeat the words too; skeptics laugh.',
    forGood: 'keeps the fire of it for life',
    mods: [['work', { mul: 1.15 }], ['think', { mul: 1.5 }], ['happy', { add: 4 }]],
    weights: () => ({ believe: 1.3 }),
    heard: (q, p, kind) => { if (kind === 'believe') q.happy = clamp100(q.happy + 4); } },
  troubled: { id: 'free-troubled', free: true, tone: 'troubled', title: 'a troubling thought', lasts: 6, chance: 0.3, tell: 0.3,
    does: 'is troubled by it (happiness -8 while it lasts), sits brooding at the door instead of working, and repeats the words to people.',
    others: 'those who believe it worry too (happiness -4); others keep away.',
    forGood: 'broods on it for life',
    mods: [['happy', { add: -8 }]],
    act(p, H) {
      const h = H.home(p); return H.goWork(p, h.x, h.z, 'sit', 5, H.S.dayT > 0.4 ? 'home early, troubled' : 'brooding at the door');
    },
    weights: () => ({ believe: 1, shun: 0.8 }),
    heard: (q, p, kind) => { if (kind === 'believe') q.happy = clamp100(q.happy - 4); } },
  amused: { id: 'free-amused', free: true, tone: 'amused', title: 'a funny thought', lasts: 5, chance: 0.3, tell: 0.45,
    does: 'finds it hilarious (happiness +5 while it lasts), laughs at nothing in particular, and tells everyone.',
    others: 'nearly everyone laughs (happiness +3 each), and the words go round.',
    forGood: 'laughs about it for life',
    mods: [['happy', { add: 5 }]],
    act(p, H) { const h = H.home(p), s = H.PA().spotNear(h.x, h.z, 1, 4); return H.goWork(p, s.x, s.z, 'play', 4, 'laughing at something nobody else heard'); },
    weights: () => ({ believe: 0.8, laugh: 2 }) },
};
