// Every word the teaching cards, the foresight cards and the opening lessons put on screen, in one place, so
// they can be corrected without touching code (the faith rules are being rewritten: docs/FAITH.md and the
// in-game "How faith works" sheet are the authority once they exist; these cards follow DESIGN.md's principles
// and give no exact numbers on purpose). Plain words, sentence case, wry at most once a card, no dashes.

// ---------- teaching cards: each shows once, at the moment it matters ----------
// when: the moment it is shown (ui/teach.js watches for it). link: 'faith' offers the "How faith works" sheet.
export const TIPS = [
  { id: 'faith', when: 'start', title: 'Faith, skepticism, strength',
    text: 'Every person down there carries their own faith in you, their own skepticism and their own strength. Tap anyone to read them. The shape at the bottom right shows all three across your people; tap it for the World.',
    aside: 'You are a rumour. Make it a good one.', link: 'faith' },
  { id: 'seen', when: 'arrive', title: 'Only what they see counts',
    text: 'Faith moves only when people witness what you do. Help them out of sight, at night or far from anyone, and nobody’s mind changes. When a power is ready, the warm wash on the land is what they can see.',
    aside: 'A miracle nobody saw is just weather.' },
  { id: 'early', when: 'arrive2', title: 'The first years are delicate',
    text: 'Newcomers who see you help them learn to wait on you, for good: they work less, think less and will not fight. Help early settlers where they cannot see it, and let them do the rest.',
    aside: 'Teach a family to pray for fish, and they stop fishing.' },
  { id: 'witnessed', when: 'witness', title: 'They saw that',
    text: 'People saw your hand. Their faith rose and their skepticism fell, and they will talk about it. That is the only way faith moves: by being seen.',
    aside: 'Word travels faster than people do.', link: 'faith' },
  { id: 'balance', when: 'balance', title: 'Even is healthy',
    text: 'Each force, overgrown, starves the next. Too much faith and nobody works, questions or fights: they wait for you. Too much skepticism and your word carries no weight. Too much strength makes warlords. The shape at the bottom right should stay even.',
    aside: 'Be worshipped, but not too much. Gods have it hard.', link: 'faith' },
  { id: 'slow', when: 'moment', title: 'Slowed time',
    text: 'When something is happening that you could change, the years slow to a crawl while people keep walking, so you have time to act. When it is over, the years run on. Press K to slow time yourself, or Space to pause.' },
  { id: 'person', when: 'select', title: 'Reading a person',
    text: 'This is everything about them: what they feel, what they think, and their fate if you do nothing. Fate is exact. What it says is what happens, unless something changes it.',
    aside: 'They have no idea you can read this. Be kind.' },
  { id: 'foresight', when: 'warning', title: 'You are warned ahead',
    text: 'You know what is coming. Each token at the top right (its sign is on the map too) holds a glaze that drains as the time runs out. Tap one: what happens if you act, and if you do nothing, opens on the right, with who would see each way to help.' },
  { id: 'hindsight', when: 'landed', title: 'What could have been done',
    text: 'When something bad happens, the card says why, and what would really have prevented it: never more than your powers could have done. The Log keeps the full account.' },
];

// ---------- foresight cards ----------
export const FORE = {
  doHeader: 'What you could do',
  workedHeader: 'What would have worked',
  whyHeader: 'Why',
  noneNow: 'Nothing you can do helps right now.',
  more: (n) => `${n} more foreseen. See them all in the Log.`,
  averted: 'Averted',
  noLonger: 'No longer foreseen',
  sooner: 'Sooner now',
  later: 'Later now',
  unseenNow: 'unseen now',
  seenBy: (n) => `seen by ${n} now`,
  hooks: 'newcomers would lean on you',
  slowedNote: 'time slowed',
  pausedNote: 'paused',
  // the narrator, rarely, after something bad (never scolding)
  asides: [
    'Hindsight: the one power you have in abundance.',
    'It is easier to see from up here. That is rather the point.',
    'The sky noticed. The sky did not act. Both are allowed.',
    'Somewhere, a philosopher is taking notes on this.',
    'Not every story needs saving. Some just need watching.',
  ],
};

// ---------- the title screen ----------
export const TITLE = {
  title: 'God’s Plan',
  begin: 'Begin',
  howTo: 'How to play',
  settings: 'Settings',
  credits: 'Credits',
  creditsText: [
    'An original game. Every name, mark and picture in it is made for it; no real faith’s signs are used.',
    'Type: Fraunces, Atkinson Hyperlegible Next and Patrick Hand, from Google Fonts. 3D by three.js.',
  ],
};

// ---------- the opening lessons (tutorial-steps.js holds the steps; these are the shared bits) ----------
export const LESSON = {
  offer: 'New here? A few short lessons, on this very land.',
  offerYes: 'Show me',
  offerNo: 'No thanks',
  skip: 'Skip',
  stop: 'Stop the lessons',
};
