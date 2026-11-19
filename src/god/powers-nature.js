// A. Hardships and mercy: the god's side of agent A's powers (heal, rain (id
// bless-harvest), send sickness, fire, flood), as data only. god/power-strike.js is the
// pattern, docs/STAGE2-CONTRACTS.md the shape; the sim registers the same ids
// with R.power() (sim/powers-nature.js). Owned by agent A.
import { RAIN_SIZE, godRainR } from '../sim/rain-size.js';
const nameOf = (a) => a.forecast?.name ?? a.entity?.name ?? null;
const notOk = (a) => a.forecast?.ok === false;

export default [
  {
    id: 'heal',
    name: 'Heal',
    group: 'mercy',
    icon: 'heal',
    hotkey: 'H',
    target: ['person', 'area'],           // a person under the pointer, else everyone in the ring
    radius: { min: 1, max: 8, value: 3, step: 1, label: 'Radius' },
    confirm: 'click',
    phases: ['running'],
    witness: 'heal',
    hint: 'Click a sick or hurt person to heal them, or the ground to heal everyone in the ring. Shift keeps the power ready.',
    label: 'Heal: click a sick person, or the ground for everyone in the ring.',
    pointAt: 'Point at a sick or hurt person',
    noTarget: 'Nobody here to heal. Point at a sick or hurt person.',
    tip: 'Heal sickness and wounds',
    inspector: { person: ['Heal this person', 'Ready your power, then click them. The card shows what it changes and who would see.'] },
    card: {
      title: (a) => (notOk(a) ? 'Nobody to heal here' : a.target?.kind === 'person' && nameOf(a) ? `Heal ${nameOf(a)}` : 'Heal everyone in the ring'),
      sub: (a) => (notOk(a) ? 'Point at a sick or hurt person.' : 'Cures sickness and wounds at once. Click to do it.'),
    },
  },
  {
    id: 'bless-harvest',
    name: 'Rain',
    group: 'mercy',
    icon: 'rain',
    hotkey: 'R',
    target: 'area',
    // how much of the land it covers (sim/rain-size.js, the director 2026-11-17: never less than an eighth, chosen
    // for him unless he picks a size): 0 "Any" draws a size from an eighth to a quarter, shown in the ring before he
    // sends it; then an eighth, a quarter, three eighths, a half
    radius: { min: 0, max: RAIN_SIZE.STEPS.length, value: 0, step: 1, label: 'Size', names: RAIN_SIZE.STEP_NAMES,
      hint: 'How much of the land the rain covers. Any: a size chosen for you, from an eighth to a quarter of the land.',
      toR: godRainR },
    confirm: 'click',
    phases: ['running'],
    witness: 'bless-harvest',
    hint: 'Click anywhere on the land: rain falls over the ring, then drifts on with the wind as light rain. It puts out fire, ends a drought, waters fields and greens the grass; rain the same low ground too often and it floods. [ and ] or Alt and the wheel set the size, from an eighth of the land to a half; Shift keeps it ready to rain again.',
    label: 'Rain: click anywhere on the land.',
    pointAt: 'Point at the land',
    noTarget: 'Point at the land you can see.',
    tip: 'Send rain, anywhere',
    card: {
      title: (a) => (notOk(a) ? 'No rain here' : a.forecast?.flood ? 'Send rain: it floods' : 'Send rain'),
      sub: (a) => (notOk(a) ? 'Point at the land you can see.' : 'Rain over the ring, then it drifts with the wind. Click to do it.'),
    },
  },
  {
    id: 'send-sickness',
    name: 'Send sickness',
    group: 'harm',
    icon: 'sickness',
    target: ['person', 'area'],
    radius: { min: 1, max: 6, value: 1, step: 1, label: 'Radius' },
    confirm: 'hold',
    phases: ['running'],
    witness: 'send-sickness',
    hint: 'Press and hold on a person, or on the ground for everyone in the ring, to make them fall sick. It spreads as any sickness does. Let go to stop.',
    label: 'Send sickness: hold on a person.',
    pointAt: 'Point at a person',
    noTarget: 'Nobody here can fall sick. Point at a person.',
    tip: 'Send a sickness',
    inspector: { person: ['Make this person sick', 'Ready your power, then press and hold on them. The card shows who dies of it.'] },
    card: {
      title: (a) => (notOk(a) ? 'Nobody here can fall sick' : a.target?.kind === 'person' && nameOf(a) ? `Send a sickness to ${nameOf(a)}` : 'Send a sickness to the ring'),
      sub: (a) => (notOk(a) ? 'Point at a person.' : `Press and hold for ${(a.holdMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} seconds to do it; let go to stop.`),
    },
  },
  {
    id: 'send-fire',
    name: 'Send fire',
    group: 'harm',
    icon: 'fire',
    target: 'area',
    radius: { min: 1, max: 5, value: 2, step: 1, label: 'Radius' },
    confirm: 'hold',
    phases: ['running'],
    witness: 'send-fire',
    hint: 'Press and hold on the ground: fire falls from the sky there and spreads by what lies around. Water and bare ground stop it. Let go to stop.',
    label: 'Send fire: hold on the ground.',
    pointAt: 'Point at something that will burn',
    noTarget: 'Nothing here will burn.',
    tip: 'Send fire from the sky',
    card: {
      title: (a) => (notOk(a) ? 'Nothing here will burn' : 'Send fire'),
      sub: (a) => (notOk(a) ? 'Point at grass, trees, a field or a hut.' : `Press and hold for ${(a.holdMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} seconds to do it; let go to stop.`),
    },
  },
  {
    id: 'send-flood',
    name: 'Send flood',
    group: 'harm',
    icon: 'flood',
    target: 'area',
    radius: { min: 4, max: 18, value: 10, step: 1, label: 'Radius' },
    confirm: 'hold',
    phases: ['running'],
    witness: 'send-flood',
    hint: 'Press and hold on a shore: the water rises over the low land beside it for some years. Let go to stop.',
    label: 'Send flood: hold on a shore.',
    pointAt: 'Point at a shore',
    noTarget: 'No water near enough to rise. Point at a shore.',
    tip: 'Send a flood',
    card: {
      title: (a) => (notOk(a) ? 'No water to rise here' : 'Send a flood'),
      sub: (a) => (notOk(a) ? 'Point at a shore with low land beside it.' : `Press and hold for ${(a.holdMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} seconds to do it; let go to stop.`),
    },
  },
];
