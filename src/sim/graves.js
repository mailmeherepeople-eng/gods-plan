// Graves (the screen's request, 2026-11-13): one lasting record per death, kept by the simulation so a grave on the
// map survives and can be clicked. Each: { id, person (id), name, age, cause, causeText, year, yearLabel, x, z, family,
// clan, saved: text (what would have saved them, from foresight's own account of that death when it had one), could:
// [{ power, label, cost }] }. Queries: graves() newest first, grave(id), graveAt(x, z, r = 2), graveOf(personId).
// Signal: grave:new (the record). Numbers: TUNE_GRAVES.
// A grave whose dead were raised (sim/resurrect.js, 2026-11-16) is kept, marked raised: { year, yearLabel }, so a card
// open on it can say so; graves(), graveAt() and graveOf() leave it out, and grave:gone tells the screen to take the
// mound away. If they die again, that is a new grave where they fall.
export const TUNE_GRAVES = {
  KEEP: 600,     // graves kept (the oldest are forgotten first)
};
const G = TUNE_GRAVES;

// What would have saved them, in plain words, by the cause, when foresight had no account of that death that names
// a power (the director, 2026-11-16: "when i click on a grave, it should tell me that i could have saved it"). Each is
// what the power really does: Heal cures a sickness or a wound at any point before the end, rain ripens a sown crop and
// puts any fire out, a deer by the door is hunted, a calming cools a grudge before a raid. A line starting "You" or
// "Nothing" is shown as it is; any other is shown after "What would have saved them:".
const OLD = 'Nothing would have: old age comes to everyone, and no power stops it.';
const OLD_AGAIN = 'Nothing would have: old age took them a second time, and nobody is raised from old age twice.';
// the causes people.js names itself (the card read "Hunger, 4997 BC." before)
const CORE_WORDS = { hunger: 'died of hunger', wolf: 'was killed by a wolf', 'old age': 'died of old age', 'struck down': 'was struck down from the sky' };
const SICK = { fever: 'the fever', cough: 'the coughing sickness', flux: 'the flux' };
function byCause(cause, p) {
  const her = p?.sex === 'f' ? 'her' : 'him';
  if (cause === 'old age') return { saved: p?.ext?.resurrect?.oldAge ? OLD_AGAIN : OLD, could: [] };
  if (cause === 'struck down') return { saved: 'You struck them down. Holding back would have saved them.', could: [] };
  if (cause === 'hunger') return { saved: 'A deer put down by their door for them to hunt, or rain on their sown fields to ripen the crop, while there was still time.',
    could: [{ power: 'bless-harvest', label: 'Bring rain on their fields in time', cost: '' }, { power: 'deer', label: 'Put a deer by their door in time', cost: '' }] };
  if (cause === 'wolf') return { saved: `Striking the wolf down while it stalked ${her}.`, could: [{ power: 'strike', label: 'Strike the wolf down while it stalked', cost: '' }] };
  if (SICK[cause]) return { saved: `Healing ${her} before ${SICK[cause]} took ${her}: Heal cures it at any time before the end.`, could: [{ power: 'heal', label: `Heal ${p?.name ?? 'them'}`, cost: '' }] };
  if (cause === 'wounds') return { saved: `Healing ${her} wounds in time: Heal mends a wound at once.`, could: [{ power: 'heal', label: `Heal ${p?.name ?? 'them'}`, cost: '' }] };
  if (cause === 'fire') return { saved: 'Rain on the fire before it reached them: rain puts any fire out.', could: [{ power: 'bless-harvest', label: 'Bring rain on the fire', cost: '' }] };
  if (cause === 'fight') return { saved: 'Calming the angry side before the fight began. Once the blows fell, no power could stop them.', could: [{ power: 'calm', label: 'Calm the angry side before the fight', cost: '' }] };
  if (cause === 'flood') return { saved: 'Nothing you could have done: no power stops rising water.', could: [] };
  if (cause === 'battle') return { saved: 'Nothing you could have done here at home: they fell in battle, where only the battle\'s own spells reach.', could: [] };
  return { saved: 'Nothing you could have done, as far as anyone can tell.', could: [] };
}

export default {
  id: 'graves',
  tune: TUNE_GRAVES,
  init(R) {
    const { S } = R;
    const list = [];
    let seq = 0;
    function savedBy(p, cause) {
      // a second death of old age after a raising: nothing else to say
      if (cause === 'old age' || cause === 'struck down') return byCause(cause, p); // (the second: the god's own hand)
      // foresight runs its death hook first (plugins.js order): its newest landed account about this person. A death it
      // foresaw and checked every power against says what worked, or that nothing did as things stood. A death nobody
      // saw coming (its "unforeseen" account) says only that nothing could, which is not always true (a fever is healed
      // at any time before the end): the words by the cause say what would have
      const log = R.ask('foresightLog', 12) ?? [];
      // (only the account this death landed, which opens with their own death: "Ama of the Reed family died of
      // hunger at 30." A household's hunger warning lands on whichever of them starves first, so a record about the
      // same person landed by another's death is not about this one)
      const mine = (r) => String(r.account?.what ?? '').startsWith(`${p.name} of `);
      const rec = [...log].reverse().find((r) => r.end === 'landed' && r.account && Math.abs((r.endYear ?? -1e9) - S.year) < 1 && mine(r));
      const a = rec?.account;
      const could = (a?.could ?? []).map((c) => ({ power: c.power, label: c.label, cost: c.cost ?? '' }));
      if (could.length) return { saved: `${could.map((c) => c.label).join('; or ')}. ${a.verdict ?? ''}`.trim(), could };
      const unforeseen = !a || /no warning/i.test(a.warned ?? '');
      if (!unforeseen && a.verdict) return { saved: a.verdict, could: [] };
      return byCause(cause, p);
    }
    R.on('person:death', (p, cause) => {
      if (!p) return;
      const c = R.ask('clanOf', p);
      const { saved, could } = savedBy(p, cause);
      const g = { id: `g${++seq}`, person: p.id, name: p.name, sex: p.sex, age: Math.floor(p.age), cause: cause ?? p.cause ?? null,
        causeText: R.deathWords(cause) ?? CORE_WORDS[cause] ?? cause ?? '', year: Math.floor(S.year), yearLabel: R.yearLabel(Math.floor(S.year)),
        x: p.x, z: p.z, family: p.family?.name ?? null, clan: c?.name ?? null, saved, could, skip: !!S.skipAlerts, raised: null };
      list.push(g);
      if (list.length > G.KEEP) list.shift();
      R.signal('grave:new', g);
    });
    const open = (g) => !g.raised;
    R.answer('graves', () => list.filter(open).reverse());
    R.answer('grave', (id) => list.find((g) => g.id === id) ?? null);
    R.answer('graveOf', (pid) => { for (let i = list.length - 1; i >= 0; i--) if (list[i].person === pid && open(list[i])) return list[i]; return null; });
    R.answer('graveAt', (x, z, r = 2) => { let best = null, bd = r; for (const g of list) { if (!open(g)) continue; const d = Math.hypot(g.x - x, g.z - z); if (d <= bd) { bd = d; best = g; } } return best; });
    // the dead were raised (resurrect.js): the grave is empty now
    R.answer('graveRaised', (id) => {
      const g = list.find((x) => x.id === id);
      if (!g || g.raised) return null;
      g.raised = { year: Math.floor(S.year), yearLabel: R.yearLabel(Math.floor(S.year)) };
      R.signal('grave:gone', g);
      return g;
    });
  },
};
