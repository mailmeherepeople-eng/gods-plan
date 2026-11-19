// What people think, and what will become of them. Both are read-only views
// for an all-knowing god (the director: "we should be able to see all of
// this. also their thoughts").
//
// Thoughts: a current thought and the last few, first person, chosen from
// what is really going on for that person (hunger, work, fear, grief, the
// stone, doubt or devotion by their meters, what they saw). Stage 2 may plant
// a thought: set p.planted = { text, source } and it becomes the current
// thought (and, later, may steer them); nothing here plants anything.
//
// Fate: what will happen if the god does nothing, as exact facts. It is true
// because the simulation is made to carry it out: lifespans and birth ages
// are rolled when a person appears; hunger kills at a fixed threshold; a
// wolf's hunt has its outcome rolled when it begins and is then played out.
// When something changes a fate, the change and its reason go into the story.
import { T } from './tune.js';
import { pick, yearLabel } from './words.js';

const he = (p) => (p.sex === 'f' ? 'She' : 'He');
const his = (p) => (p.sex === 'f' ? 'her' : 'his');

export function makeMind(ctx, S) {
  const rand = Math.random;

  // ---------- rolled at birth or arrival ----------
  // a woman's children come at these ages (a Poisson walk at BIRTH_RATE, at least 2 life years apart)
  function rollBirths(p) {
    p.birthAges = [];
    if (p.sex !== 'f') return;
    let a = T.FERTILE[0];
    for (;;) {
      a += Math.max(2, -Math.log(1 - rand()) / T.BIRTH_RATE);
      if (a > T.FERTILE[1]) break;
      if (a > p.age) p.birthAges.push(a);
    }
  }
  function rollLife(p) {
    rollBirths(p);
    p.starveAt = T.STARVE_YEARS + rand() * 2; // hunger kills at this many life years of hunger
  }

  // children still to come for this person (through their partner), if nothing changes
  function childrenAhead(p) {
    const w = p.sex === 'f' ? p : p.partner;
    const m = p.sex === 'f' ? p.partner : p;
    if (!w || !m || w.dead || m.dead) return null;
    const wLeft = w.lifespan - w.age, mLeft = m.lifespan - m.age;
    return (w.birthAges ?? []).filter((a) => a - w.age < wLeft && a - w.age < mLeft && a >= w.age);
  }
  const ageIn = (p, lifeYears) => Math.floor(p.age + lifeYears);

  // ---------- fate ----------
  // how and when this person's life ends if nothing changes: { age, how, wolf }
  function endOf(p) {
    const f = p.family;
    let end = { age: Math.floor(p.lifespan), how: 'old age', wolf: null };
    const wolf = S.predators.find((a) => !a.dead && a.prey === p && (a.state === 'stalk' || a.state === 'sprint'));
    end.wolf = wolf ?? null;
    if (wolf?.outcome === 'kill') end = { age: Math.floor(p.age), how: 'wolf', wolf };
    // the hunger played forward (people.js hungerFuture: the pace over a day, fewer mouths after each death)
    const left = S.peopleApi?.hungerLeftOf ? S.peopleApi.hungerLeftOf(p) : (p.hunger > 0 && f.shortRate > 0 ? (p.starveAt - p.hunger) / f.shortRate : Infinity);
    if (end.how !== 'wolf' && Number.isFinite(left)) {
      if (p.age + left < end.age) end = { age: ageIn(p, left), how: 'hunger', wolf };
    }
    // a subsystem's own end, if it comes sooner (seam 'end' hooks: { age, how, words, line })
    return end.how === 'wolf' ? end : S.seam.endOf(p, end);
  }
  const endText = (e) => (e.words ? `die ${e.words}` : e.how === 'wolf' ? `die at ${e.age}, taken by a wolf` : e.how === 'hunger' ? `die of hunger at ${e.age}` : `die of old age at ${e.age}`);
  // how many more children this person's fate line promises (the same count the inspector shows)
  function kidsDue(p, end = endOf(p)) {
    const kids = childrenAhead(p);
    if (!kids || p.stage === 'child') return 0;
    const w = p.sex === 'f' ? p : p.partner;
    return kids.filter((a) => a - w.age < end.age - p.age).length;
  }
  function fateOf(p) {
    if (p.dead) return [`Died at ${Math.floor(p.age)}${p.cause ? ` (${p.cause})` : ''}.`];
    const out = [];
    const f = p.family;
    const end = endOf(p);
    // a wolf already on the hunt for this person
    const wolf = end.wolf;
    if (wolf && wolf.outcome !== 'kill') {
      if (wolf.outcome === 'wound') out.push('Will be bitten by the wolf that is hunting them, and live.');
      else out.push(`Will see the wolf that is hunting ${p.sex === 'f' ? 'her' : 'him'} in time, and run.`);
    }
    if (f.state === 'leaving') out.push('Will walk out of this land into the mist, never to return.');
    else if (f.state === 'settled' && f.unhappy > 0 && f.unhappyRate > 0) {
      const left = (T.LEAVE_YEARS - f.unhappy) / f.unhappyRate;
      if (left < end.age - p.age) out.push(`The family will give up and leave in about ${Math.max(1, Math.round(left))} years unless things get better.`);
    }
    const kids = childrenAhead(p);
    if (p.stage === 'child') { const y = Math.max(1, Math.ceil(T.CHILD_UNTIL - p.age)); out.push(`Comes of age in ${y} ${y === 1 ? 'year' : 'years'}.`); }
    else if (kids) {
      const n = kidsDue(p, end);
      out.push(n ? `Will have ${n} more ${n === 1 ? 'child' : 'children'}.` : 'Will have no more children.');
    } else if (p.stage === 'adult' && p.age < 45 && !p.partner) out.push('Has no partner. No children will come unless one is found.');
    if (p.expectsHelp) out.push('Will keep waiting for the stone to help, and work at half strength, for life.');
    for (const l of S.seam.fateLines(p)) out.push(l); // seam 'fate' hooks
    out.push(end.line ? end.line : end.how === 'wolf' ? `Dies at ${end.age}, taken by a wolf.` : end.how === 'hunger' ? `Dies of hunger at ${end.age}, unless the family finds food.` : `Dies of old age at ${end.age}.`);
    return out;
  }
  // the fate this person would have if the wolf hunting them were gone (for the strike's what-if)
  function fateWithoutWolf(p, wolf) {
    if (!wolf || wolf.prey !== p) return null;
    if (wolf.outcome === 'escape') return `${p.name} would have got away anyway.`;
    if (wolf.outcome === 'wound') return `${p.name} will not be bitten.`;
    const kids = childrenAhead(p);
    const n = kids ? kids.length : 0;
    return `${p.name} no longer dies at ${Math.floor(p.age)}. ${he(p)} lives to ${Math.floor(p.lifespan)}${n ? ` and has ${n} more ${n === 1 ? 'child' : 'children'}` : ''}.`;
  }

  // ---------- thoughts ----------
  // The thought now and the last few, never the same line twice in the list. An event (a wolf, a
  // strike) brings its thought to the front; a thought picked at random is never one already there.
  function push(p, text) {
    if (!text || p.thought === text) return;
    p.thought = text;
    p.thoughts = [text, ...(p.thoughts ?? []).filter((t) => t !== text)].slice(0, 5);
  }
  const DREAMS = ['Mm. Dreaming of fat deer and a dry roof.', 'Asleep. Dreaming the hut is twice as big.', 'Zzz. Something about a river of porridge.',
    'Dreaming of walking, walking, and the mist never ending.', 'A dream: the stone is talking, but only in sneezes.', 'Zzz. The field is all bread, already baked.',
    'Dreaming of being small again, and carried.', 'Mm. Warm feet. Warm feet at last.', 'A dream of flying over the land like the white birds.', 'Zzz. Counting deer. Losing count. Counting again.'];
  function candidates(p) {
    const f = p.family, c = [];
    const add = (w, ...texts) => { for (const t of texts) c.push([w, t]); };
    if (p.planted) return [[99, p.planted.text]];
    if (p.fleeing) add(50, 'Run. Do not look back.', 'That wolf has been following me since the fields.', 'Faster, faster, the door is right there.');
    if (p.asleep) {
      if (p.grief > 0.3 && p.lost) add(12, `Dreaming that ${p.lost} is still here.`, `In the dream ${p.lost} is calling from the fields.`);
      if ((p.dread ?? 0) > 0.3) add(12, 'A dream of white light, and nobody left standing.', 'Dreaming the sky has an eye in it.');
      add(10, ...DREAMS);
      return S.seam.thoughtsFor(p, c);
    }
    if (f.state === 'wander') {
      if (f.sawWater) add(8, 'Water, at last. But is the land around it any good?', 'I can smell water. My feet can stop soon.');
      else add(8, 'There must be water somewhere. There must.', 'Every hill looks like the last one.', 'If we walk much further I will turn into a stick.');
    }
    if (f.state === 'leaving') add(20, 'We tried. This land did not want us.', 'Somewhere past the mist there is better ground. There has to be.');
    if (p.hunger > 1.5) add(30, 'My belly has been empty for days.', 'If the field fails again we will not last.', 'I would eat the thatch if it came with salt.');
    else if (p.hunger > 0) add(15, 'We are eating less than we should.', 'Smaller bowls again tonight.');
    if ((p.wolfFear ?? p.fear) > 0.3) add(18, 'I keep seeing the wolf\'s eyes in the long grass.', 'Nobody should walk alone past the fields now.', 'I hold the children closer since the wolf came.');
    if ((p.dread ?? 0) > 0.3) {
      const who = p.dreadOf ?? 'them';
      add(22, `It killed ${who}. Out of a clear sky.`, `What did ${who} do? What did ${who} do?`, 'It could strike any of us. Any of us.', 'I do not stand in the open any more.',
        'Be good. Be quiet. Something up there is watching.', 'I flinch every time the sky brightens.');
    }
    if (p.grief > 0.3) {
      if (p.lost) add(16, `I still set out a bowl for ${p.lost}.`, `${p.lost} would have laughed at this.`, `I keep turning to tell ${p.lost} something.`, `${p.lost}'s cloak still hangs by the door.`,
        `Nobody hums like ${p.lost} did.`, `I walked the long way round so I would not pass where ${p.lost} fell.`);
      add(14, 'The hut is too quiet now.', 'Some days I forget, and then I remember.', 'Everyone says it gets easier. It has not yet.', 'Work keeps my hands busy. Not my head.');
    }
    if (p.expectsHelp) add(14, 'Why break my back? The stone will provide.', 'It helped us once. It will help again.', 'I will rest. Help is coming. It always comes now.');
    if (S.lifeNow() - (p.lastSaw ?? -1e9) < 4) add(16, 'I saw it with my own eyes. Something watches us.', 'Nobody believes what I saw. I believe it.', 'The sky did that. The sky.');
    const d = p.doing ?? '';
    if (d.includes('build')) add(6, 'One more wall and the rain stays out.', 'Thatch in the hair again.', 'Stack, tie, stack, tie. A home, one bundle at a time.');
    if (d.includes('tend') || d.includes('harvest')) {
      const fl = f.fields?.[0];
      if (fl && fl.care > 0.7) add(6, 'The grain is coming up well this year.', 'Good soil. I will not tell the neighbours.');
      else add(6, 'These weeds grow faster than the crop.', 'If I turn my back the field forgets me.');
    }
    if (d.includes('water')) {
      const wd = f.home ? S.land.wdistAt(f.home.cx, f.home.cz) : 0;
      add(5, wd > 14 ? 'The walk to the water gets longer every day.' : 'The water is sweet here. We chose well.');
    }
    if (d.includes('gather')) add(5, 'Berries, roots, a mushroom I am fairly sure about.', 'Wild food keeps us alive. Barely.');
    if (d.includes('pray')) {
      if (p.faith > 60) add(10, 'I can feel it listening.', 'The stone was here before us. It will be here after.');
      else if (p.skep > 60) add(10, 'I pray because my mother did. I do not know why.', 'If anyone is listening, now would be a good time to say so.');
      else add(8, 'Keep us fed, keep the wolves away. That is all I ask.');
    }
    if (d.includes('fire')) add(6, 'Someone should tell the story of the long walk again.', 'The fire is the best thing we ever built.');
    if (p.stage === 'child' && d.includes('play')) add(6, 'I am the fastest runner in the whole world.', 'When I grow up I will build a hut taller than the stone.', 'I found a beetle. I am keeping him.');
    if (p.stage === 'elder') add(4, 'My knees know when the rain is coming.', 'When I was young we walked for years to find this place.');
    if (p.faith > 65) add(5, 'Something watches over this place. I am sure of it.');
    if (p.skep > 70) add(5, 'A stone is a stone. We built our own huts.', 'Nobody helped us dig that field but us.');
    const other = S.buildings.find((b) => b.kind === 'hut' && b.done && b.family && b.family !== f && Math.hypot(b.cx - p.x, b.cz - p.z) < 25);
    if (other && f.home?.done) add(3, `The ${other.family.name} family's hut has a better roof than ours.`, `The ${other.family.name} children are too loud.`);
    S.seam.thoughtsFor(p, c); // seam 'thoughts' hooks: [[weight, text], ...]
    if (!c.length) add(1, 'A quiet day. Good.', 'Nothing much to think about. Lovely.');
    return c;
  }
  function think(p, dt) {
    p.thinkT = (p.thinkT ?? rand() * 4) - dt;
    if (p.thinkT > 0 && !p.planted) return;
    p.thinkT = (6 + rand() * 6) * (p.asleep ? 3 : 1);
    if (p.planted) { push(p, p.planted.text); return; }
    // only thoughts that are not already in the recent list; when every true thought is there, keep the one now
    const recent = new Set([p.thought, ...(p.thoughts ?? [])]);
    const c = candidates(p).filter((x) => !recent.has(x[1]));
    if (!c.length) return;
    const top = Math.max(...c.map((x) => x[0]));
    const best = c.filter((x) => x[0] >= top * 0.6);
    push(p, pick(best)[1]);
  }

  // ---------- telling the story of a changed fate ----------
  function fateChanged(p, text) { S.peopleApi.story(p, text); }

  return { rollLife, fateOf, fateWithoutWolf, push, think, fateChanged, childrenAhead, endOf, endText, kidsDue, yearLabel, his };
}
