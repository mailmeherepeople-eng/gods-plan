// The lessons, as data (ui/tutorial.js runs them). Each is ONE line, shown in the slim strip at the top left edge,
// never over the middle or over what it teaches; a gold ring stands on the control to use; Skip is one tap.
// A step is { id, text, point?: [[test, selector]] (the first whose test passes is ringed; test(g) gets
//   { tool, family, phase, door (the open row), group (the group whose choices it shows), opts (the tool's settings, each { value, min, max }), done (the
//   modes used in this step), selected, river }), check: { kind, ... } }
// check kinds: camera (the view moved, turned or zoomed); stroke (an Omnipotence stroke or edit with one of `modes`,
//   `count` times, `all`: every mode at least once, `want(opts)`: the settings it was made with); applied (the tick
//   was pressed); phase (time runs);
//   select (a person); aim (a token's detail opened); world (the World opened).
// Land has three modes (DESIGN.md, 2026-11-14): Raise, Lower, Flatten. Hills, mountains, cliffs, plateaus, pits and
// flat fields are all made with those three, and these lessons show how. Plain words, no dashes.

const always = () => true;
// Omnipotence (2026-11-15, the director's tree): the door opens Land, Water, Life, Erase; each group shows its
// children, down to what is in hand (Land, Reshape; Land, Structures; Water, River). The ring walks it: the door,
// each group on the way (or Back, at the top centre, when another branch is open), then the family, then the mode,
// then (when given) a setting. A selector may be a function of the state: g.nav(family) is the next tap toward that
// family (ui/doors.js nextTap). fam: one family, or several (any will do; the ring leads to the first)
const via = (fam, mode, opt) => {
  const fams = [].concat(fam), away = (g) => !fams.includes(g.family);
  return [
    [away, (g) => g.nav(fams[0])],
    ...(mode ? [[(g) => g.tool !== mode, `.modes [data-tool="${mode}"]`]] : []),
    ...(opt ? [[(g) => !opt[1](g.opts[opt[0]]), `.knobs .step[data-opt="${opt[0]}"]`]] : []),
  ];
};
// a setting's place between its least and most, 0 to 1
const frac = (o) => (o && Number.isFinite(o.value) && o.max > o.min ? (o.value - o.min) / (o.max - o.min) : 0.5);
const big = (o) => frac(o) >= 0.6, small = (o) => frac(o) <= 0.45, soft = (o) => frac(o) <= 0.25, hard = (o) => frac(o) >= 0.75;
const tick = '.god-ghost-pending [data-ghost="ok"]';

// The recipes (docs/GOD-TOOLS.md, each made and photographed): a gentle hill is Raise with a big Size and Strength
// 1 or 2; a cliff is a small Size with Strength near 10 (strength sets how sharp the edge is); a plateau is Raise,
// then Flatten rubbed on its top; a pit is Lower; a level field is Flatten pressed where the height is right.
export const STEPS = [
  { id: 'camera', text: 'Drag to look around. Pinch, or turn the wheel, to come closer.',
    check: { kind: 'camera' } },
  { id: 'hill', text: 'A gentle hill: Land, Reshape, Raise. Size up, Strength down, hold on the grass.',
    point: [...via('shape', 'raise', ['size', big]), [(g) => !soft(g.opts.strength), '.knobs .step[data-opt="strength"]']],
    check: { kind: 'stroke', modes: ['raise'], want: (o) => big(o.size) && soft(o.strength), nearly: 'Nearly. For a gentle hill: Size up, Strength right down.' } },
  { id: 'tick', text: 'See-through until you press the tick; another tool drops it. Press it.',
    point: [[always, tick]], check: { kind: 'applied' } },
  { id: 'cliff', text: 'A cliff: Size down, Strength up. Strength is how sharp the edge is.',
    point: [...via('shape', 'raise', ['size', small]), [(g) => !hard(g.opts.strength), '.knobs .step[data-opt="strength"]']],
    check: { kind: 'stroke', modes: ['raise'], want: (o) => small(o.size) && hard(o.strength), nearly: 'Nearly. For a cliff: Size down, Strength right up.' } },
  { id: 'plateau', text: 'A plateau: raise a wide hill, then Flatten across its top.',
    point: [...via('shape', null), [(g) => !g.done.has('raise') && g.tool !== 'raise', '.modes [data-tool="raise"]'], [(g) => g.done.has('raise') && g.tool !== 'flatten', '.modes [data-tool="flatten"]']],
    check: { kind: 'stroke', modes: ['raise', 'flatten'], all: true } },
  { id: 'pit', text: 'A pit: pick Lower and hold it on the ground.',
    point: via('shape', 'lower'), check: { kind: 'stroke', modes: ['lower'] } },
  { id: 'flat', text: 'Fields want flat ground: Flatten, press where the height is right, drag.',
    point: via('shape', 'flatten'), check: { kind: 'stroke', modes: ['flatten'] } },
  { id: 'water', text: 'Families need fresh water. Water, then River (drag) or Lake (tap).',
    point: via(['river', 'lake'], null), check: { kind: 'stroke', modes: ['river', 'lake'] } },
  { id: 'cave', text: 'A home: Land, Structures, Cave. Tap near the water, turn it, then the tick.',
    point: [...via('structures', 'cave'), [always, '.god-ghost-cave [data-ghost="ok"]']], check: { kind: 'stroke', modes: ['cave'], labels: /cave/i } },
  { id: 'begin', text: 'When the land is ready, press And thus, we begin.',
    point: [[always, '.startbtn']], check: { kind: 'phase' } },
];

// after time starts: short lessons at the right moment (`when`: what must have happened first)
export const LATER = [
  { id: 'reading', when: 'settle', text: 'Tap a person to read them. Time waits while you read.', check: { kind: 'select' } },
  { id: 'tokens', when: 'warning', text: 'A token at the top right needs you. Tap it.',
    point: [[always, '.rail .tok:not([hidden])']], check: { kind: 'aim' } },
  { id: 'world', when: 'years40', text: 'The shape at the bottom right is your people. Tap it.',
    point: [[always, '.forcesb']], check: { kind: 'world' } },
];
