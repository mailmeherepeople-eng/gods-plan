// Battles (stage 3): every number worth changing, in one block (docs/BATTLES.md explains each).
// The starting point is the battle prototype's TUNE block and its recommended options (game/proto/battle.js),
// turned from its 20 px cells into metres (one block is a metre) and fitted to the director's rulings of
// 2026-11-14: no faith changes from a battle, a refilling bar only in battle, the enemy god on cooldowns.
// Console: game.modules.sim.tune('battles') lists it, tune('battles', 'KEY', value) sets one.

export const TUNE_BATTLES = {
  // ---- when ----
  every: 125,             // calendar years between two battles (about 56 from 5000 BC to 2026)
  firstAfterSettle: 125,  // the first comes this long after the first family settles
  comingYears: 12,        // the warning (signal battle:coming, a token) this many years before
  minGrown: 3,            // fewer grown people than this: the raiders find nothing worth the walk and pass by ...
  passBy: 25,             // ... and come back this many years later

  // ---- the shape of one battle (seconds of battle time: at 1x a real second) ----
  marchSeconds: 7,        // your fighters gather at the standing stone and march out (a tap skips it)
  switchSeconds: 1.2,     // the home land sinks into mist and the battleground rises (instant under reduced motion)
  calmSeconds: 30,        // the calm: their host drawn up and a preview (how many, how hard, notable fighters, their god's spells);
                          // the bar fills and you may cast already; "Call them now" starts the fight early
  dawnAt: 105,            // hold this long after the attack and the raiders give up
  wave2At: 30, wave3At: 62,
  waveShare: [10, 14, 14],// how the raiders split between the three waves
  endSeconds: 2.2,        // the last beat before the result card (time slows)

  // ---- the raiders ----
  enemyPerFighter: 0.75,  // raiders per fighter of yours in the first battle (tuned by the bots: docs/BATTLES.md)
  refBlend: 0.7,          // the size follows your fighters now (this share) and your fighters at the first battle (the rest),
                          // so a people that grows has it easier and one that shrinks has it harder
  harderPerBattle: 0.1,  // each later battle brings this much more (the prototype had 0.15)
  growthCap: 3,           // ... up to this many times the first
  enemyMin: 6, enemyMax: 48, aliveMax: 40, // at most this many raiders on the field at once (the rest wait)
  fightersMax: 40,        // at most this many of yours fight (the strongest willing first) ...
  fighterShare: 0.6,      // ... and at most this share of the grown (the rest keep the village)
  enemyStrength: 50,      // their strength level (50 is an ordinary grown-up), rising each battle ...
  enemyStrengthPer: 1, enemyStrengthMax: 70,
  // Earth's metal by year: the raiders carry what Earth had (stone, copper, bronze, iron); yours is what your
  // people discovered. A tier behind, their blows land harder (research 06: one tier 25 percent, two 60).
  earthTiers: [[-4000, 0], [-3000, 1], [-1000, 2], [99999, 3]],
  tierMul: [1, 1, 1, 1.25, 1.6], // by (their tier - yours), from -2 to +2 (being ahead does not soften their blows)

  // ---- what losing costs (option; the director has not finally chosen) ----
  loss: 'hearths',        // 'hearths' (recommended): seven fires; 'share': a share of the adults; 'sudden': one loss ends the run
  fires: 7,
  firesLost: 1, firesLostHearth: 2, // a lost battle puts out one fire, two if the hearth itself fell
  relightOnWin: true,     // a won battle relights one
  villageShare: 0.05,     // hearths: the raiders also kill this share of the grown left in the village
  shareLoss: 0.25, shareLossHearth: 0.38, // share: this share of the grown die (more if the hearth fell)
  caughtOnLoss: 0.4,      // on a loss, this share of the wounded still on the field are caught
  hardenWon: 7, hardenLost: 4, hardenWound: 3, // strength gained by the survivors (strength is not faith)

  // ---- bodies and blows (the prototype's, in metres) ----
  hp: 100, champHp: 340, wolfHp: 40,
  dmg: 11, champDmg: 20, wolfDmg: 7,
  hitEvery: 0.9, wolfEvery: 0.7,
  speed: 2.4, wolfSpeed: 4.6, fleeSpeed: 1.25, woundedSpeed: 0.5,
  reach: 1.3,             // a blow lands from this far (centre to centre)
  aggroYours: 9, leashYours: 12, aggroTheirs: 5.5, aggroWolf: 11,
  deathChance: 0.22, champDeathChance: 0.35, // a fighter who goes down dies with this chance (times their death stat), else wounded
  // nerve (shared by a family): breaks at 20, or 50 when their strength is under 30
  breakAt: 20, breakAtSoft: 50, softBelow: 30,
  nerveLossPerDamage: 0.35, allyDeathNerve: 8, champDeathNerve: 20,
  rallyAt: 60, nerveRegen: 2, fleeRegen: 2.5, champAura: 5, champAuraRegen: 3, hearthRegen: 7,
  bands: 4,               // your fighters stand in at most this many families (the smallest households join their clan's)
  // the field
  hearthR: 4, hearthTakers: 4, hearthSeconds: 6, // this many raiders standing within hearthR of the hearth this long: it falls
  hearthDefend: 14,       // your people with nothing to fight run back to any raider this close to the hearth
  // the battleground (sim/battle-ground.js): one for the whole run, or a fresh one each battle
  freshGround: false,
  weather: 0.5,           // between battles earthworks keep this share of their height (old ridges become low banks)
  slingShare: 0.22,       // this share of each side carries slings (they throw from range; from higher ground, further)
  slingHp: 80, slingDmg: 6, slingEvery: 1.5, slingRange: 6, highRange: 1.3, highDmg: 1.2, highAt: 1.5,
  pondSlow: 0.5, trenchSlow: 0.45, ridgeSlow: 0.32, // earthworks only slow (they never hurt, knock down or throw anyone)

  // ---- your spells in battle: the bar ----
  // the bar's size and refill are fixed by the people's faith when the battle starts (faith built outside pays
  // off inside); under quietBelow, the quiet spells (the mending ones) do not take
  barByFaith: [[0, 14], [20, 18], [50, 28], [70, 34], [100, 40]],
  refillByFaith: [[0, 0.5], [20, 0.8], [50, 1.3], [70, 1.6], [100, 1.9]], // a second
  sizeByFaith: [[0, 0.35], [20, 0.55], [50, 0.85], [70, 1.0], [100, 1.1]], // how strong each spell is
  barStart: 0.5,          // the bar starts this full (and fills during the calm)
  quietBelow: 20, quiet: ['heal-small', 'heal-area', 'boost-area'],
  // land cheap, healing middling, killing dear, lava dearest (the director, 2026-11-15)
  cost: { lower: 1, raise: 1, pond: 2, rain: 3, 'heal-small': 4, 'heal-area': 7, 'boost-area': 8, burn: 7, wolves: 9, kill: 10, 'fire-area': 11, gorilla: 12, revive: 12, lava: 18 },
  // earthworks are cast as a line (Lower, Raise: cost + perCell for each cell, at most maxCells) or a circle (Pond)
  works: { perCell: 0.25, maxCells: 10, defCells: 6, ridgeHigh: 2, trenchDeep: 2, pondR: 2.3, riseSeconds: 1.0 },
  worksLockout: 2,        // an earthwork can be cast again this soon
  lockout: 8,             // the same spell cannot be cast again for this long
  voiceGap: 0.5,          // two casts at least this far apart (a burst is still a burst)
  windup: 0.45,           // your cast gathers this long before it lands
  // ---- the enemy god (on cooldowns, as the director ruled), from the same sixteen ----
  enemyFaith: 70,         // its people's faith: spell size 1.0, cooldowns x1.0
  cdTiers: { lower: 12, raise: 14, pond: 18, rain: 20, 'heal-small': 10, 'heal-area': 22, 'boost-area': 26, burn: 12, kill: 14, 'fire-area': 24, wolves: 28, gorilla: 40, revive: 999, lava: 999 },
  cdByFaith: [[0, 1.6], [35, 1.2], [70, 1.0], [100, 0.9]],
  startCharge: 0.7,       // it starts the fight with every spell this charged
  tell: 2, tellSmall: 1,  // its wind-up in seconds (quick ones: kill, burn, lower, small heal)
  planAhead: 8,           // its next move is shown this far ahead
  patientWaits: 12,       // the Patient One waits this long for your answer to be spent, then strikes anyway
  // shock: low faith (the forces query's battleReach.shock) freezes your people at enemy miracles
  shockFreeze: 2, shockNerve: 12,
  // ---- what each spell does (size scales most of these) ----
  healSmall: { share: 0.45, r: 2.5 },
  revive: { r: 3, hp: 0.6 },                      // once a battle
  burn: { seconds: 5, dps: 14, burst: 14, r: 2.5 },
  kill: { dmg: 130, champShare: 0.6 },            // a champion takes this share of his whole strength
  heal: { r: 3.2, share: 0.4 },                   // heal the ground: the wounded get up
  boost: { r: 3.6, seconds: 15, bonus: 0.3, steal: 0.4 }, // hit harder, and heal by this share of each blow
  fire: { r: 3.6, seconds: 6, burst: 26, dps: 16, nerve: 12 },
  lava: { r: 3.2, warn: 2, run: 3, friendly: true }, // cracks and glows, then runs: whoever stays dies (yours too, unless friendly is off); rain cools it to rock
  rain: { r: 5.2, seconds: 8, slow: 0.6, wet: 2.5 },
  ridge: { flattenR: 3 },
  wolves: { n: 6, seconds: 12, scareR: 4 },
  gorilla: { hp: 420, dmg: 24, seconds: 25, every: 1.1 },
};

// the battle spell tree (the director, 2026-11-15): four groups of four; a gesture picks group, kind or harsh,
// small or big. The order in each group is [kind small, kind big, harsh small, harsh big]; null is an empty slot.
export const GROUPS = [
  { id: 'person', name: 'Person', stroke: 'up', spells: ['heal-small', 'revive', 'burn', 'kill'] },
  { id: 'area', name: 'Area', stroke: 'down', spells: ['heal-area', 'boost-area', 'fire-area', 'lava'] },
  { id: 'land', name: 'Land', stroke: 'right', spells: ['pond', 'rain', 'lower', 'raise'] },
  { id: 'create', name: 'Create', stroke: 'left', spells: [null, null, 'wolves', 'gorilla'] },
];
export const POWERS = ['heal-small', 'revive', 'burn', 'kill', 'heal-area', 'boost-area', 'fire-area', 'lava', 'pond', 'rain', 'lower', 'raise', 'wolves', 'gorilla'];
export const SMALL = ['kill', 'burn', 'lower', 'heal-small'];
export const LINES = ['lower', 'raise'];          // cast as a line on the ground
export const WORKS = ['lower', 'raise', 'pond'];  // move the ground
export const PERSON = ['heal-small', 'revive', 'burn', 'kill']; // aimed at one person
// plain names and what each does, for the buttons and the aim line
export const PM = {
  'heal-small': { name: 'Small heal', col: 0x8fc25a, css: '#8FC25A', does: 'Mends one of yours a little.' },
  revive: { name: 'Bring back', col: 0xf2e6a0, css: '#F2E6A0', does: 'Raises one fallen fighter of yours. Once a battle.' },
  burn: { name: 'Burn', col: 0xe8742a, css: '#E8742A', does: 'Sets one of them alight.' },
  kill: { name: 'Kill', col: 0x8a5bd0, css: '#8A5BD0', does: 'Strikes one of them dead. A champion takes it hard but may live.' },
  'heal-area': { name: 'Heal ground', col: 0x6e9a3a, css: '#6E9A3A', does: 'Everyone of yours here mends; the fallen get up.' },
  'boost-area': { name: 'Boost', col: 0xe5ae3c, css: '#E5AE3C', does: 'Yours here hit harder and heal as they hit.' },
  'fire-area': { name: 'Fire', col: 0xe0552b, css: '#E0552B', does: 'The ground burns. Wet ground will not take.' },
  lava: { name: 'Lava', col: 0xc2342a, css: '#C2342A', does: 'The ground cracks and glows, then runs as lava: whoever stays dies, yours too. Rain cools it to rock.' },
  pond: { name: 'Pond', col: 0x4f8fb8, css: '#4F8FB8', does: 'Water stands in a circle: it slows them, and wet ground will not burn.' },
  rain: { name: 'Rain', col: 0x3e8ec9, css: '#3E8EC9', does: 'Puts out fire, cools lava to rock, and slows them.' },
  lower: { name: 'Lower', col: 0x6b4a2e, css: '#6B4A2E', does: 'The ground sinks along the line: it slows them.' },
  raise: { name: 'Raise', col: 0x9a6440, css: '#9A6440', does: 'Earth rises along the line: it slows and blocks them.' },
  wolves: { name: 'Wolves', col: 0x5e8f3a, css: '#5E8F3A', does: 'A pack harries them. Fire scatters it.' },
  gorilla: { name: 'Gorilla', col: 0x4a3b30, css: '#4A3B30', does: 'One great beast fights for you for a while.' },
};
// soft counters: what helps against each of their spells (rain on fire and lava, fire on a pack, a heal on a burn)
export const HELPS = { 'fire-area': ['rain', 'pond'], lava: ['rain'], wolves: ['fire-area', 'burn'], burn: ['heal-small', 'rain'], kill: ['revive'], gorilla: ['kill'],
  lower: ['raise'], raise: ['lower'], pond: ['raise'], rain: [], 'heal-small': ['kill'], 'heal-area': ['fire-area'], 'boost-area': ['fire-area'], revive: [] };
export const ANSWER = { 'fire-area': 'rain', lava: 'rain', wolves: 'fire-area', burn: 'heal-small', lower: 'raise', pond: 'raise', gorilla: 'kill' };
export const SOFT_TEXT = {
  'fire-area': 'Rain or a pond there first and the ground will be too wet to burn.', lava: 'Rain on it and it cools to rock.', wolves: 'Fire there and the pack will bolt.',
  burn: 'A small heal saves the one alight.', kill: 'Bring them back.', gorilla: 'Kill it.', lower: 'Raise it again.', raise: 'Lower it again.', pond: 'Raise the ground over it.',
};

// the enemy god's personalities (the prototype's, on the new sixteen; the Patient One first, the rest in turn later)
export const PERS = {
  patient: {
    name: 'The Patient One', css: '#7C6AB8', short: 'Waits until your answer is spent, then strikes big.',
    powers: ['fire-area', 'rain', 'lower', 'pond', 'wolves', 'kill', 'heal-area', 'burn', 'lava'],
    w: { 'fire-area': 1, rain: 1, lower: 1, pond: 0.7, wolves: 1, kill: 1, 'heal-area': 0.8, burn: 1, lava: 1.2 },
    gap: 6, tellMul: 1.25, sizeMul: 1.15, threshold: 2.2, waits: true, ownFire: 2.5,
  },
  fire: {
    name: 'The Fire Lover', css: '#D2482A', short: 'Opens with fire and casts often.',
    powers: ['fire-area', 'rain', 'lower', 'pond', 'wolves', 'kill', 'heal-area', 'boost-area', 'burn', 'lava'],
    w: { 'fire-area': 2.2, rain: 0.8, lower: 0.8, pond: 0.6, wolves: 0.9, kill: 1, 'heal-area': 0.6, 'boost-area': 0.8, burn: 1.4, lava: 1.4 },
    gap: 2, tellMul: 1, sizeMul: 1, threshold: 1.2, opensWith: 'fire-area', ownFire: 1.2,
  },
  hound: {
    name: 'The Hound Lord', css: '#4F8A3A', short: 'Wolves first, then a beast. Afraid of fire.',
    powers: ['wolves', 'gorilla', 'fire-area', 'rain', 'lower', 'pond', 'kill', 'heal-area', 'lava'],
    w: { wolves: 2.6, gorilla: 2, 'fire-area': 0.6, rain: 1, lower: 1, pond: 0.7, kill: 1, 'heal-area': 0.8, lava: 0.8 },
    gap: 3, tellMul: 1, sizeMul: 1, threshold: 1.5, opensWith: 'wolves', ownFire: 2.5,
  },
  smiter: {
    name: 'The Smiter', css: '#8A5BD0', short: 'Goes for your champions.',
    powers: ['kill', 'burn', 'heal-small', 'heal-area', 'fire-area', 'lava'],
    w: { kill: 3.2, burn: 1.4, 'heal-small': 0.8, 'heal-area': 0.7, 'fire-area': 0.7, lava: 0.7 },
    gap: 3, tellMul: 1, sizeMul: 1, threshold: 1.4, ownFire: 2.5, champHunter: true,
  },
};
// the order they come in: the Patient One for the first battles, then one after another
export const PERS_ORDER = ['patient', 'patient', 'fire', 'hound', 'smiter'];
// raiders' champions and the names their peoples go by
export const RAIDER_CHAMPS = ['Ruk', 'Hessa', 'Vorn', 'Ylla', 'Grath', 'Senna', 'Dorvo', 'Kesh', 'Mabba', 'Tullo'];
export const RAIDER_PEOPLES = ['the Ash Hill people', 'the Marsh folk', 'the Red Ochre clans', 'the Horn people', 'the Salt Coast tribe', 'the Tall Grass riders', 'the Flint people', 'the Bone River clans'];
