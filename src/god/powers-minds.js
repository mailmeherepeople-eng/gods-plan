// B. Minds: the god's side of agent B's powers (whisper an idea, give a thought,
// and the commandment act), as data only. god/power-strike.js is the pattern,
// docs/STAGE2-CONTRACTS.md the shape; the sim registers the same ids with
// R.power() (sim/science.js, sim/thoughts-given.js, sim/commandments.js).
// Owned by agent B.
const nameOf = (a) => a.forecast?.name ?? a.entity?.name ?? 'this person';
const him = (a) => (a.forecast?.sex === 'm' || a.entity?.sex === 'm' ? 'him' : 'her');

export default [
  {
    id: 'whisper',
    name: 'Whisper',
    group: 'minds',
    icon: 'whisper',
    target: 'person',
    confirm: 'click',
    phases: ['running'],
    witness: 'whisper',               // nobody sees it (the sim's spec reaches no one)
    hint: 'Click a person to whisper the next discovery into their head. They make it at once, but their faith goes to the top and they never think for themselves again.',
    label: 'Whisper: click a person.',
    pointAt: 'Point at a person',
    noTarget: 'Nobody here to whisper to. Point at a person.',
    tip: 'Whisper an idea to one person',
    inspector: { person: ['Whisper an idea to this person', 'They make the next discovery now, and never think for themselves again. The card shows what is gained and what this mind would otherwise have done.'] },
    card: {
      title: (a) => (a.forecast?.ok === false ? 'Nobody to whisper to' : `Whisper to ${nameOf(a)}`),
      sub: (a) => (a.forecast?.ok === false ? 'Point at someone who lives here.' : a.forecast?.discovery ? `The next discovery, ${a.forecast.discovery.name.toLowerCase()}, now. Click to do it.` : 'Click to do it.'),
    },
  },
  {
    id: 'give-thought',
    name: 'Give a thought',
    group: 'minds',
    icon: 'thought',
    hotkey: 'G',
    target: 'person',
    confirm: 'click',
    phases: ['running'],
    witness: 'give-thought',          // nobody sees it; others react to what the person then says and does
    hint: 'Click a person to put a thought in their head. With no panel open it is the next ready thought on the list (console: sim.ask("chooseThought", id or { text })).',
    label: 'Give a thought: click a person.',
    pointAt: 'Point at a person',
    noTarget: 'Nobody here to give a thought to. Point at a person.',
    tip: 'Give a person a thought',
    inspector: { person: ['Give this person a thought', 'A ready thought or your own words. Whether they hear a voice from above or think it their own depends on the thought and on their faith and doubt.'] },
    card: {
      title: (a) => (a.forecast?.ok === false ? 'No thought to give here' : `Give ${nameOf(a)} a thought`),
      sub: (a) => (a.forecast?.ok === false ? 'Point at someone awake who lives here.' : a.forecast?.thought ? `"${a.forecast.thought.text}" Click to give it to ${him(a)}.` : 'Click to do it.'),
    },
  },
  {
    id: 'commandment',
    name: 'Commandments',
    group: 'minds',
    icon: 'commandment',
    target: 'none',
    confirm: 'click',
    phases: ['running'],
    witness: 'commandment',           // heard by everyone awake
    dock: false,                      // a panel's act: god.perform('commandment', { kind: 'none', args: { id } | { active: [ids] } | { remove: id } })
    hint: 'Give or withdraw a standing commandment; two can stand at once. Everyone awake hears the stone speak.',
    label: 'Commandments',
    pointAt: 'Choose a commandment',
    noTarget: 'Choose a commandment to give or withdraw.',
    tip: 'Give the people a commandment',
    card: { title: () => 'The stone speaks', sub: () => 'Heard by everyone awake. Each obeys by their own faith.' },
  },
];
