// Resurrect, as power data (the sim side is sim/resurrect.js; the director, 2026-11-16: "i want to be able to
// resurrect in the main game"). It aims at a grave: god/aim.js finds the grave mound under the pointer or the finger
// (within GRAVE_MAGNET px, a 60 px circle), the card shows what happens first, and a click (a second tap) raises them.
// While it is in hand every grave mound shows at any zoom (ui/delight.js).
const notOk = (a) => a.forecast?.ok === false;
const nameOf = (a) => a.forecast?.name ?? a.target?.name ?? null;

export default [
  {
    id: 'resurrect',
    name: 'Resurrect',
    group: 'mercy',
    icon: 'risen',
    target: 'grave',
    confirm: 'click',
    phases: ['running'],
    witness: 'resurrect',
    hint: 'Tap a grave to raise who lies there. The card says what happens first; tap again to do it. Once in a round of seasons.',
    label: 'Resurrect: tap a grave.',
    pointAt: 'Tap a grave mound',
    noTarget: 'That is not a grave. Tap one of the grave mounds: they all show while Resurrect is in hand.',
    tip: 'Raise the dead from a grave',
    card: {
      title: (a) => (notOk(a) ? (a.forecast?.refuseTitle ?? 'This grave will not open') : `Resurrect ${nameOf(a) ?? 'them'}`),
      sub: (a) => (notOk(a) ? 'Tap a grave mound.' : 'Click to do it. They rise at the grave, confused and weak at first, then walk home.'),
    },
  },
];
