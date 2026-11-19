// C. Clans: the god's side of agent C's powers (bless weapons, calm, provoke,
// favour), as data only. god/power-strike.js is the pattern,
// docs/STAGE2-CONTRACTS.md the shape; the sim registers the same ids with
// R.power() in sim/clans-powers.js. Owned by agent C. Icons are agent D's.
const clanName = (a) => a.forecast?.target?.name ?? a.target?.clan?.name ?? null;
const AREA = { min: 4, max: 24, value: 10, step: 1, label: 'Radius', hint: 'How many people it reaches, in metres' };

export default [
  {
    id: 'bless-weapons',
    name: 'Bless weapons',
    group: 'war',
    icon: 'club',
    target: ['clan', 'area'],          // a person picks their whole clan; the ground picks the grown people in the ring
    radius: AREA,
    confirm: 'click',
    phases: ['running'],
    witness: 'bless-weapons',
    hint: 'Point at a person to bless the weapons of their whole clan, or at the ground to bless everyone grown in the ring. They fight better for a while. Those who see it believe more, and newcomers come to lean on you.',
    label: 'Bless weapons: click a person for their clan, or the ground for an area.',
    pointAt: 'Point at a person, or at the ground near people',
    noTarget: 'Nobody to bless here. Point at a person, or at the ground near people.',
    tip: 'Bless the weapons of a clan or of the fighters in an area',
    inspector: { person: ['Bless the weapons of this clan', 'Ready the power, then click any of them. The card shows how a coming fight would change.'] },
    card: {
      title: (a) => (a.forecast?.ok === false ? 'Nothing to bless here' : clanName(a) ? `Bless the weapons of the ${clanName(a)} clan` : 'Bless the weapons of the people here'),
      sub: (a) => (a.forecast?.ok === false ? 'Point at a person, or at the ground near people.' : 'They fight better for a while. Click to do it.'),
    },
  },
  {
    id: 'calm',
    name: 'Calm',
    group: 'war',
    icon: 'calm',
    hotkey: 'C',
    target: ['clan', 'area'],
    radius: AREA,
    confirm: 'click',
    phases: ['running'],
    witness: 'calm',
    hint: 'Point at a person to cool the grudges of their whole clan, or at the ground for everyone grown in the ring. A raid can be called off. Nobody knows it was you.',
    label: 'Calm: click a person for their clan, or the ground for an area.',
    pointAt: 'Point at a person, or at the ground near people',
    noTarget: 'Nobody here to calm. Point at a person, or at the ground near people.',
    tip: 'Cool the grudges of a clan or of an area',
    inspector: { person: ['Calm this clan', 'Ready the power, then click any of them. The card shows which grudges cool, and any fight it stops.'] },
    card: {
      title: (a) => (a.forecast?.ok === false ? 'Nobody to calm here' : clanName(a) ? `Calm the ${clanName(a)} clan` : 'Calm the people here'),
      sub: (a) => (a.forecast?.ok === false ? 'Point at a person, or at the ground near people.' : 'Their anger cools. Nobody will know it was you. Click to do it.'),
    },
  },
  {
    id: 'provoke',
    name: 'Provoke',
    group: 'war',
    icon: 'provoke',
    hotkey: 'P',
    target: ['clan', 'area'],
    radius: AREA,
    confirm: 'hold',
    phases: ['running'],
    witness: 'provoke',
    hint: 'Point at a person to stir up their whole clan against its worst rival, or at the ground for everyone grown in the ring. Press and hold: it can start a raid. Nobody knows it was you.',
    label: 'Provoke: hold on a person for their clan, or on the ground for an area.',
    pointAt: 'Point at a person, or at the ground near people',
    noTarget: 'Nobody here to stir up. Point at a person, or at the ground near people.',
    tip: 'Stir up the grudges of a clan or of an area',
    inspector: { person: ['Provoke this clan', 'Ready the power, then press and hold on any of them. The card shows who they turn on, and what they will do.'] },
    card: {
      title: (a) => (a.forecast?.ok === false ? 'Nobody to stir up here' : clanName(a) ? `Provoke the ${clanName(a)} clan` : 'Provoke the people here'),
      sub: (a) => {
        if (a.forecast?.ok === false) return 'Point at a person, or at the ground near people.';
        const s = ((a.holdMs ?? 500) / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
        return `Their anger flares. Nobody will know it was you. Press and hold for ${s} ${s === '1' ? 'second' : 'seconds'} to do it.`;
      },
    },
  },
  {
    id: 'favour',
    name: 'Favour',
    group: 'war',
    icon: 'favour',
    target: 'clan',
    confirm: 'click',
    phases: ['running'],
    witness: 'favour',
    hint: 'Click a person to favour their clan: your own private mark, so you can follow them. It changes nothing for them and nobody ever notices. Click a favoured clan again to stop.',
    label: 'Favour: click a person to mark their clan as yours.',
    pointAt: 'Point at a person',
    noTarget: 'Nobody here. Point at a person of the clan you want to favour.',
    tip: 'Pick a favourite clan (nobody notices)',
    inspector: { person: ['Favour this clan', 'Your own mark, so you can follow them. Nobody notices.'] },
    card: {
      title: (a) => (a.forecast?.ok === false ? 'No clan here' : a.forecast?.favoured ? `Stop favouring the ${clanName(a)} clan` : `Favour the ${clanName(a) ?? ''} clan`),
      sub: () => 'A private mark. Nobody will ever know. Click to do it.',
    },
  },
];
