// Strike (stage 1) as registered power data: the worked example of the god seam
// (docs/STAGE2-CONTRACTS.md). Everything about aiming, the hold, carrying it out
// and the witness is generic (god/aim.js); this is only what Strike is.
const who = (e) => String(e?.name ?? e?.species ?? 'animal').replace(/^(an?|the)\s+/i, '').toLowerCase() || 'animal';
const isPerson = (a) => (a.forecast?.kind ?? a.target?.kind) === 'person';
const him = (a) => (a.forecast?.sex === 'm' || a.entity?.sex === 'm' ? 'him' : 'her');

export default [
  {
    id: 'strike',
    name: 'Strike',
    group: 'hand',                    // the god's own hand, first in the dock (A's sendings are 'harm')
    icon: 'strike',
    hotkey: 'Z',
    target: ['animal', 'person'],     // an animal wins a near tie with a person
    // confirm: from the forecast (a person: 'hold', an animal: 'click')
    phases: ['running'],
    witness: 'strike',                // the act kind sent to sim.witness and in god:act
    hint: 'Click an animal to strike it down. A person needs a press and hold until the ring is full; let go to spare them. Shift keeps the power ready.',
    label: 'Strike: click an animal, or hold on a person.',
    pointAt: 'Point at a person or an animal',
    noTarget: 'Nothing to strike here. Point at a person or an animal.',
    tip: 'Strike down an animal or a person',
    // a button in the inspector, for these kinds of selection: [tooltip title, tooltip text]
    inspector: {
      person: ['Strike down this person', 'Ready your power, then press and hold on them. The card shows what it costs and who would see.'],
      animal: ['Strike down an animal', 'Ready your power, then click the animal. The card shows who would see.'],
    },
    // the trade off card's title and line under it (defaults in god/aim.js)
    card: {
      title: (a) => (a.forecast?.ok === false ? 'This cannot be struck' : isPerson(a) ? `Strike down ${a.forecast?.name ?? a.entity?.name ?? 'this person'}` : `Strike down this ${who(a.entity)}`),
      sub: (a) => {
        if (a.forecast?.ok === false) return 'Point at a person or an animal.';
        if (!isPerson(a)) return 'Kills it at once. Click to do it.';
        const s = (a.holdMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
        return `Kills ${him(a)} at once. Press and hold on ${him(a)} for ${s} ${s === '1' ? 'second' : 'seconds'} to do it; let go to spare ${him(a)}.`;
      },
    },
  },
];
