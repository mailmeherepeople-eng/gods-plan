// Every tunable number of the people simulation, in one place. Times are in
// game seconds (ctx.clock.dt) or calendar years (ctx.clock.dYears, 2.4 game
// seconds each at speed 1); distances in blocks (1 block = 1 metre).
// docs/SIM.md explains what each rule does.
export const T = {
  // ---- the day: a visual rhythm, not a date ----
  DAY_SECONDS: 48,       // one day and night, in game seconds (20 calendar years at 2.4 s a year)
  DAY_START: 0.08,       // where in the day the clock starts (0 dawn .. 1)
  DAWN: [0.0, 0.07],     // daylight rises 0 -> 1 over this part of the day
  DUSK: [0.6, 0.7],      // and falls 1 -> 0 over this part
  GO_HOME: 0.58,         // people head home from here
  WAKE: 0.02,            // and leave home from here (night is DUSK end .. 1)
  DAYLIGHT_STEP: 0.05,   // sim:daylight fires when daylight moved this much
  // ---- the seasons (sim/season.js): their own slow cycle, apart from the calendar (the director, 2026-11-16) ----
  SEASON_SECS: 60,       // game seconds a season lasts (spring, summer, autumn, winter: four minutes a round at speed 1)
  // ---- raising the dead (sim/resurrect.js; the director, 2026-11-16: "i want to be able to resurrect in the main game") ----
  RESURRECT_EVERY_SEASONS: 4, // THE LIMIT: one raising, then the next only this many seasons later on the season clock
                         // (4 = one round of seasons, 240 game seconds at speed 1). His choice: "a limit on how often"
  RESURRECT_OLD_AGE_S: 60, // someone raised from old age lives this many more game seconds (one minute at speed 1, on the game
                         // clock: pause and speed apply), then dies of old age again, for good ("extend their life by one minute")

  // ---- life ----
  // People live on a "life clock": LIFE_RATE years of life pass per calendar
  // year. Every rate below marked "a life year" runs on it (ageing, eating,
  // births, crops, the meters). At 0.5 a 60 year life lasts 120 calendar years,
  // about 4.8 minutes at speed 1. A question for the director (docs/SIM.md).
  LIFE_RATE: 0.5,
  CHILD_UNTIL: 14,       // a child below this age; works from it
  ELDER_FROM: 55,        // works half as hard from here
  LIFESPAN: [48, 74],    // old age comes at a random age in this range
  BIRTH_RATE: 0.2,       // a woman's birth ages are rolled at this rate a life year (at least 2 apart) when she appears
  BIRTH_FOOD: 1.0,       // "food": at least this many life years of the family's eating in store
  BIRTH_WAIT: 3,         // a birth due while the house cannot take a child waits this long, then is lost
  FERTILE: [17, 42],     // the mother's age range for a birth
  HOUSE_MAX: 7,          // no births in a household this big
  MAX_PEOPLE: 400,       // a safety cap: no births past this many people
  PAIR_AGE: 17,          // a grown child may start a household of their own from here
  PAIR_SITE_R: 40,       // a new couple looks for a hut site this far round the middle of their two homes (was 30, 2026-11-13)
  PAIR_RATE: 0.5,        // chance a life year that an unpaired adult (17 to 45) looks for a partner

  // ---- food (a food unit is what an adult eats in a life year) ----
  EAT: 1,                // an adult eats this much a life year
  EAT_CHILD: 0.4,
  FIELD_YIELD: 12,       // a fully tended field puts this much food into its standing crop each life year while it grows
                         // (the food comes home only with the harvest: see "crops" below). Was 5 a life year all year
                         // round before crops were sown and harvested; a field now grows only about a third of the time
                         // (bare between harvest and sowing, all winter, and the spring growing), so 12 (2026-11-16,
                         // measured with tools/food-measure.mjs: docs/NUMBERS.md "Food through the seasons")
  CARE_DECAY: 0.15,      // a field's care (0..1) falls this much a life year untended
  CARE_PER_S: 0.6,       // and rises this much per game second of tending (times the worker's effort)
  TEND_FIRST: 0.8,       // a hungry house tends any growing field under this care first, then its spare hands pick berries (2026-11-13)
  FOOD_PANIC: 1.0,       // below this many life years of food in store, adults drop building to find food
  STORE_MAX_YEARS: 24,   // a store holds at most this many life years of the family's eating. Was 8; raised 2026-11-16
                         // with the seasons: a winter is 12.5 life years with nothing growing, and the first spring
                         // harvest comes some 8 more after it, so a store must carry about 20 (the "timing trap")
  NEW_HOME_FOOD: 16,     // a new couple's household starts with this many life years of food (was 4 until 2026-11-13, 8
                         // until 2026-11-16: a new household's first harvest is now a sowing and a growing away)
  START_FOOD_YEARS: 20,  // arrivals carry this many life years of food (was 6 until 2026-11-13, 10 until 2026-11-16, for
                         // the same reason)
  STARVE_YEARS: 8,       // a person dies after this much hunger (plus 0 to 2, rolled), longer than one night
  PEOPLE_PER_FIELD: 3,   // a family wants one field for this many mouths
  FIELD_SIZE: [6, 4],
  FIELD_RADIUS: 18,      // fields lie within this of home

  // ---- crops: sown, grown, harvested and carried home (the director, 2026-11-16; docs/SIM.md "Crops") ----
  // A person sows a field (a real piece of work). It grows to ripe in CROP_GROW game seconds at full care (slower
  // when poorly tended: 0.3 + 0.7 x care of full speed). While it grows its standing crop fills at FIELD_YIELD x care
  // a life year, times every yield change (drought, flood, fire, deer and rabbits, worn or rich soil, discoveries,
  // the god's rain); a ripe crop waits, full, until someone harvests it and carries the basket home, and only then is
  // it food in the store. Each field keeps its own sowing time, so harvests come at different times for each family.
  // At full care one harvest is FIELD_YIELD x CROP_GROW game seconds in life years (12 x 6.25 = 75 food: some
  // 25 years of a family of three's eating). Starting guesses for the director to tweak.
  CROP_GROW: 30,         // game seconds from sowing to ripe at full care (6.25 life years; a season is 60)
  SOW_S: 6,              // game seconds of one person's work to sow a field (effort speeds it)
  SOW_CARE: 0.6,         // a field's care when it is sown (as a new field's), however low it fell while it lay bare
  HARVEST_S: 8,          // game seconds of one person's work to cut a ripe field
  SOW_LATE: 0.85,        // no sowing when less than this share of the time the crop needs to ripen is left before winter
                         // (CROP_GROW at the pace it will grow from the care it is sown with: build.js canSow)
  EAT_FROM_FIELD: true,  // a house whose store is empty eats from its ripe standing crop while the harvest comes in
  // ---- the seasons, for food (sim/food-season.js reads the season; the seasons work owns SEASON_SECS) ----
  FOOD_SEASONS: true,    // false: always summer for food (to measure a world without winter)
  WINTER_PERISH: 30,     // in winter a standing crop (growing or ripe) perishes over this many game seconds, a little at a
                         // time (the dead-crop look of a drought); nothing is sown in winter, and nothing grows
  // ---- berries: real bushes, picked and carried home (docs/SIM.md "Berries"; they replace the old placeless gathering) ----
  BERRY_FOOD: 2.5,       // food one ripe bush gives when picked (an adult's eating for 2.5 life years)
  BERRY_REGROW: 30,      // game seconds a picked bush takes to fruit again (in a fruiting season; 0.8 to 1.2 of this)
  BERRY_FRUIT: ['summer', 'autumn'], // the seasons bushes fruit in; in spring they flower, in winter they stand bare
  BERRY_SPREAD: 12,      // game seconds over which bushes ripen, or lose their fruit, as a season turns (not all at once)
  BERRY_REACH: 30,       // people pick bushes this far from home (blocks)
  BERRY_TRIP: 3,         // bushes one person picks on one trip (the nearest ripe one and others close by it)
  BERRY_PICK_S: 3,       // game seconds picking one bush
  BLOOM_SUMMER: 0.35,    // share of the flowers still in bloom through summer (spring: all; autumn: seed heads; winter: none)

  // ---- work ----
  BUILD_WORK: 0.15,      // work-seconds per block placed (a hut is about 60 blocks, a field 24 at 0.6 of this)
  DEPENDENT_WORK: 0.5,   // a person who expects help works at this fraction
  WORK_HAPPY_MIN: 0.7,   // work at happiness 0 (1 at happiness 100)

  // ---- meters (all 0..100) ----
  HAPPY_RATE: 10,        // happiness moves this many points a life year toward its target
  HAPPY_BASE: 55,
  HAPPY_HOME: 12, HAPPY_NO_HOME: -15, HAPPY_FED: 10, HAPPY_HUNGRY: -35,
  HAPPY_WATER_NEAR: 5, HAPPY_WATER_FAR: -8, HAPPY_FIRE: 5,
  HAPPY_FEAR: -22,       // after an attack within FEAR_RADIUS, fading over FEAR_YEARS
  FEAR_RADIUS: 35, FEAR_YEARS: 10,
  HAPPY_GRIEF: -20, GRIEF_YEARS: 8,
  HAPPY_CROWDED: -10,
  START_FAITH: [18, 45], START_SKEP: [25, 55], START_HAPPY: [50, 70],
  // the stage 1 drift, used only without the faith subsystem: faith.js FADE_FAITH / FADE_DOUBT and practice replace it
  FAITH_DRIFT: -0.5,     // per life year while nothing is witnessed (toward FAITH_FLOOR)
  SKEP_DRIFT: 0.4,       // per life year (toward SKEP_CEIL)
  FAITH_FLOOR: 5, SKEP_CEIL: 90,
  WITNESS_FAITH: 10,     // faith gained by one witness of a full-strength act
  WITNESS_SKEP: 8,       // skepticism lost
  EARLY_YEARS: 10,       // "the first years after arrival" (life years): since settling, or since birth
  EARLY_MULT: 2.5,       // an early witness is moved this many times more
  KIND_WEIGHT: { strike: 1, default: 0.6 },  // how striking each kind of act is (by god:act kind)
  // ---- striking down a person (docs/SIM.md "Striking a person") ----
  // Seeing a person struck dead from a clear sky terrifies: happiness drops at
  // once and a dread stays (it counts as fear in the happiness target, as an
  // attack does, fading over DREAD_YEARS); faith jumps and doubt falls harder
  // than for a wolf. It never makes anyone expect help: fear is not comfort.
  STRUCK_SEEN_HAPPY: 30,   // happiness lost at once by each witness
  STRUCK_SEEN_FAITH: 25,   // faith gained by each witness
  STRUCK_SEEN_SKEP: 16,    // skepticism lost by each witness
  DREAD_YEARS: 10,         // the dread fades over this many life years
  // A young child whose mother dies grows up without her and dies sooner: old
  // age comes MOTHERLESS_CUT years earlier (rolled per person when they
  // appear, so the god can be told exactly). Applies to every cause of death.
  MOTHERLESS_AGE: 6,
  MOTHERLESS_CUT: [15, 28],
  LEAVE_HAPPY: 25,       // a family this unhappy on average ...
  LEAVE_YEARS: 5,        // ... for this long packs up and leaves

  // ---- prayer ----
  PRAY_START: 0.42, PRAY_END: 0.56, // the prayer hour (part of the day)
  PRAY_SCALE: 0.9,       // chance to go and pray = faith/100 * this (+ dependent bonus)
  PRAY_DEPENDENT: 0.25,
  PRAY_RING: [4.5, 8],   // people stand this far from the stone
  PRAY_REACH: 50,        // families living further than this pray at home, facing the stone

  // ---- sight ----
  SIGHT_DAY: 22,         // a person awake outdoors in daylight sees this far
  SIGHT_NIGHT: 7,        // at night (indoors or asleep: nothing)

  // ---- arrival ----
  FIRST_ARRIVAL: 2,      // game seconds after the clock starts
  ARRIVE_EVERY: [9, 15], // calendar years between families
  ARRIVE_ROOM: [5, 9],   // ... while there is room (a cave with room, or huts known and under ROOM_PEOPLE settled): 2026-11-13
  ROOM_PEOPLE: 40,
  ARRIVE_TOWARD_CAVE: true, // a family comes in from the side a cave with room is on, and makes for it first
  ARRIVE_SLOW_FAMILIES: 18, // past this many settled families, arrivals come half as often
  MAX_WANDERING: 2,      // families on the move at once
  FAMILY_SIZE: [2, 5],
  SCOUT_RADIUS: 28,      // how far a wandering family looks around itself
  SCOUT_STOPS: [3, 4],   // waypoints a family visits before giving up
  WATER_REACH: 22,       // fresh water must be within this of a home
  BANK_GAP: 3,           // and no closer than this (not on the bank)
  FLAT_GRASS_MIN: 45,    // flat grass cells needed within FARM_LOOK of the home
  FARM_LOOK: 12,
  HUT_GAP: 3,            // empty cells kept between a hut and anything built
  NEIGHBOUR_NEAR: 7, NEIGHBOUR_FAR: 26, // huts like neighbours in this range
  SETTLE_SCORE: 1.6,     // a site scoring under this is not good enough (land.js hutSite)

  // ---- movement (blocks per game second) ----
  WALK: 2.0, RUN: 3.2, CHILD_WALK: 1.7, ELDER_WALK: 1.4, WANDER_WALK: 2.5, CAVE_WALK: 3.2, // CAVE_WALK: a family making for a cave it has seen (2026-11-13)
  STEP: 1.05, JUMP: 2.2, // from the source game: step up a block, jump two
  DROP: 3,               // people path down at most this much in one cell
  PRED_MAX_STEP: 1,      // wolves, deer and rabbits cross steps of at most this, up or down, in their paths and their walking alike; 2 or more is a cliff to them
  PATH_MAX_NODES: 7000,  // one A* search gives up after this many cells
  PATH_FRAME_BUDGET: 24000, // cells searched per frame across all searches
  WATER_COST: 4, DEEP_COST: 9, CLIMB_COST: 0.6,

  // ---- animals ----
  DEER_HERDS: 2, DEER_PER_HERD: [3, 5],
  DEER_MAX: 40,          // no more deer than this
  DEER_BIRTH: 0.12,      // per deer per life year (times room left under DEER_MAX)
  HERD_RETURN_YEARS: 40, // with under 3 deer left, a new herd walks in at most this often (calendar years)
  DEER_LIFESPAN: [14, 22], // life years
  DEER_RAID_AT: 14,      // with more deer than this, the extra ones eat the fields
  DEER_RAID_EAT: 1.2,    // food a raiding deer takes from a field's family per life year spent in it
  DEER_WARY: 6,          // deer bolt from people this close
  BIRD_FLOCKS: 2, BIRDS_PER_FLOCK: 4,
  RABBIT_WARRENS: 1, RABBITS_PER_WARREN: 4, // at the start
  RABBIT_MAX: 30,        // no more rabbits than this
  RABBIT_BIRTH: 0.8,     // per rabbit per life year near a warren with another (times room under RABBIT_MAX)
  RABBIT_LIFESPAN: [4, 8], // life years
  RABBIT_EAT: 0.15,      // food a rabbit takes from a field's family per life year spent nibbling in it (deer: 1.2)
  RABBIT_RANGE: 45,      // rabbits go to fields this close to their warren
  RABBIT_WARY: 4, RABBIT_WARY_WOLF: 9, // they bolt from people and wolves this close
  RABBIT_BOLT: 3.3,      // a bolting rabbit's speed: under a wolf's sprint (4), so a chase can end in a kill
  HUNT_BOW_SHARE: 0.5,   // the share of households that hunt with bows (the rest with spears); the same household always
                         // the same weapon. A bow has the spear's range and aim for now (hunting.js); the director to decide
  RABBIT_PREY_PULL: 16,  // a wolf counts a rabbit this many blocks nearer than it is (deer: 4), so rabbits draw wolves off people
  // ---- deer and rabbits come and go by the mist, as wolves do (director, 2026-11-16: "Yes, come and go") ----
  // Starting guesses, measured with tools/move-check.mjs to keep the average counts about where they were and to
  // make an arrival or a departure something seen every few minutes at speed 1 (a minute is about 25 calendar years).
  HERD_ARRIVE_YEARS: 150,     // a herd walks in from the mist on average once in this many calendar years ...
  HERD_ARRIVE_BELOW: 0.5,     // ... while the deer are under this share of what the land can hold (the cap)
  HERD_ARRIVE_SIZE: [2, 4],   // deer in an arriving herd
  HERD_LEAVE_YEARS: 300,      // a herd, or a part of one, walks out by an edge on average once in this many calendar years (a herd is chased hard most of the time, so about half this in play) ...
  HERD_LEAVE_MAX: 4,          // ... at most this many deer at a time (a bigger herd splits and the rest stay)
  DEER_CROWD_AT: 0.6,         // deer over this share of the cap count as crowded ...
  HERD_LEAVE_CROWD: 3,        // ... and then herds leave this many times as often
  HERD_CHASED_AT: 8,          // a herd bolted from people or wolves (one count a deer a bolt, 3 a deer killed) this much lately ...
  HERD_LEAVE_CHASED: 2,       // ... is chased hard: departures come this many times as often, and it is the one that goes
  HERD_CHASED_FADE: 20,       // how long a herd remembers being chased (calendar years for the count to fall to about a third)
  RABBIT_ARRIVE_YEARS: 200,   // a few rabbits walk in and dig a new warren on average once in this many calendar years ...
  RABBIT_ARRIVE_BELOW: 0.9,   // ... while the rabbits are under this share of RABBIT_MAX
  RABBIT_ARRIVE_SIZE: [2, 4], // rabbits in an arriving group
  RABBIT_LEAVE_YEARS: 200,    // rabbits from a crowded warren walk out by an edge on average once in this many calendar years ...
  RABBIT_CROWD_AT: 0.7,       // ... only while the rabbits are over this share of RABBIT_MAX
  RABBIT_LEAVE_SIZE: [2, 3],  // rabbits that go at a time (never the last two of a warren)
  GRAZER_LEAVE_GIVE_UP: 150,  // game seconds a leaving deer or rabbit keeps trying for the edge before it stays after all
  PRED_FIRST: 5,         // calendar years after the start before the first predator
  PRED_EVERY: 9,         // years between predators at the start, growing over the run
  PRED_EVERY_GROWTH: 40, // the gap doubles every this many years
  PRED_UNTIL: 160,       // after this many years predators stop coming
  PRED_MAX: 3,           // at most this many at once
  PRED_SENSE: 60,        // a predator picks prey within this
  PRED_STALK: 1.1, PRED_SPRINT: 4.0, PRED_SPRINT_AT: 9,
  HUNT_ESCAPE: 0.45,     // chance (rolled when a hunt begins) a grown person sees the wolf in time; half for children and elders
  PRED_KILL: 0.75,       // of the rest: chance the attack kills (else a bite they survive)
  PRED_FEED_S: 10,       // game seconds a predator stays with its kill
  PRED_GIVE_UP_S: 30,    // a predator that cannot reach prey wanders off after this
  MOMENT_MAX_S: 15,      // a wolf stalking a person holds time (ctx.clock.hold) at most this many real seconds (integration: was 25)
  MOMENT_QUIET_S: 60,    // and the same wolf opens no other moment for this many real seconds after
  NOTICE_STALK: [6, 0.5],  // people notice a stalking wolf within 6 blocks, with this chance a second
  NOTICE_SPRINT: [10, 2.5], // and a charging one within 10
  DEER_FLEE_PRED: 12,

  // ---- fish (fish.js) and fishing (fishing.js); the director, 2026-11-16: "for right now, let us add fish. visible ones" ----
  // (FISH BLOCK START: everything down to FISH BLOCK END belongs to the fish build; builder defaults, the director's to tune)
  // Measured 2026-11-16 with tools/food-sources.mjs (SCENARIO=welcoming, 6 seeds x 200 years): fishing brings in about
  // 5 in 100 of a lake village's food (fields about 83, gathering 5, hunting 2), and hunger is not gone (families short
  // of food about 18% of the time, the same as with nobody fishing, within the runs' noise). Four kinds; docs/SIM.md "Fish" says why these. Per kind: name and one (words), home (where it keeps to), len (metres,
  // nose to tail, before FISH_DRAW_SCALE) and wide (width as a share of length: the silhouette from above), color, under
  // (how much of the water's colour it takes, so it reads as just under the surface), minDepth (shallowest water it swims
  // in), perCells (one fish for this many cells of its kind of water in a body) and max (at most this many in one body),
  // life (life years), birth (young a fish a life year while there is room), speed and dart (blocks a game second,
  // cruising and fleeing), turn (how fast it turns), hold ([min, max] game seconds it cruises round a spot before swimming
  // on: fish never sit still), loop ([min, max] metres: the size of the loops and figure-eights it cruises there), food
  // (food units it brings home: a rabbit is 6, a deer 36), hit (chance a spear strike takes it), school (minnows: a shoal's size).
  FISH: {
    minnow: { name: 'Minnows', one: 'a minnow', home: 'the shallows by the bank', len: 0.34, wide: 0.3, color: 0xe2ecef, under: 0.15, minDepth: 1, perCells: 6, max: 60,
      life: [2, 4], birth: 1.4, speed: 0.9, dart: 3.4, turn: 6, hold: [0.5, 2], loop: [1.2, 2.4], food: 2, hit: 0.6, school: [5, 9] },
    trout: { name: 'Trout', one: 'a trout', home: 'running water', len: 0.55, wide: 0.24, color: 0xb59a5c, under: 0.2, minDepth: 1, perCells: 15, max: 16,
      life: [4, 9], birth: 0.8, speed: 0.7, dart: 4.2, turn: 5, hold: [2, 6], loop: [0.8, 1.8], food: 6, hit: 0.45 },
    pike: { name: 'Pike', one: 'a pike', home: 'the reeds', len: 1.0, wide: 0.16, color: 0x7c9a3c, under: 0.2, minDepth: 1, perCells: 18, max: 10,
      life: [8, 16], birth: 0.5, speed: 0.45, dart: 5.5, turn: 3, hold: [5, 14], loop: [1, 2.4], food: 12, hit: 0.45 },
    catfish: { name: 'Catfish', one: 'a catfish', home: 'deep water', len: 1.4, wide: 0.3, color: 0x2e2620, under: 0.25, minDepth: 2, perCells: 80, max: 6,
      life: [12, 30], birth: 0.3, speed: 0.35, dart: 2.4, turn: 1.6, hold: [1, 4], loop: [1.8, 3.5], food: 24, hit: 0.4 },
  },
  // swimming (the director, 2026-11-16: "they need to swim regardless"): no fish ever sits still
  FISH_CRUISE: [0.35, 0.75], // a cruising fish swims at this share of its speed, swelling and easing between the two
  FISH_CRUISE_TURN: 0.6, // and turns at this share of its turning rate (easy turns, wide loops)
  FISH_LINGER_R: 0.35,   // a fish lingering in front of a fisher circles this small (metres) ...
  FISH_LINGER_PACE: [0.25, 0.45], // ... and this slowly (shares of its speed)
  FISH_SHOAL_DRIFT: 0.18, // a minnow drifts this far (metres) about its place in the shoal
  FISH_WAG_BASE: 0.8, FISH_WAG_PER: 0.6, FISH_WAG_MAX: 6, // tail beats a game second: BASE + PER x (speed / length), at most MAX
  FISH_WAG_AMP: [0.07, 0.15], // how far the tail tip swings to each side (a share of the length), cruising .. darting
  FISH_DRAW_SCALE: 1.5,  // fish are drawn this much bigger than life so they read from above (people are drawn 1.18 times)
  FISH_WATER_TINT: 0x2f6f86, // the water colour fish take a little of (their `under`)
  FISH_DRAW_MAX: 400,    // at most this many fish drawn (one instanced mesh)
  FISH_SHALLOWS: 3,      // water within this many cells of the bank is the shallows (minnows' water)
  FISH_CHANNEL_W: 6,     // water this narrow (in cells) across, in three of four directions, is running water (trout's)
  FISH_REED_NEAR: 2,     // water within this many cells of a reed is a reed bed (pike's)
  FISH_PIKE_BARE: 0.2,   // a shallow cell by a bank with no reeds counts this much toward pike
  FISH_REED_RESCAN: 30,  // game seconds between looks for reeds grown or cleared (water changes are seen at once)
  FISH_STOCK: 0.7,       // the world's water starts with this share of what it can hold
  FISH_CROWD_DIE: 0.5,   // each fish over what its water can hold dies with this chance a life year
  FISH_SHIFT_R: 3,       // a fish whose water is taken swims to water this close, or dies
  FISH_ARRIVE_YEARS: 120, // minnows turn up in still water with none, on average once in this many calendar years
  FISH_RETURN_YEARS: 150, // a kind missing from water that runs into the mist swims in on average this often (calendar years) ...
  FISH_STRAY_YEARS: 300, // ... and into other water it could live in, this often (a few find their way along ditches in a wet year)
  FISH_KEEP: 2,          // nobody fishes a kind in a body of water below this many
  FISH_FEAR_WADE: 3.5,   // fish dart from someone moving in the water this close
  FISH_FEAR_BANK: 1.5,     // or walking on the bank this close
  FISH_FEAR_STILL: 0.8,  // or standing still this close (a fisher waiting with the spear)
  FISH_SPLASH_R: 3,      // a spear's splash sends fish within this darting off
  FISH_SPLASH_S: 0.9,    // game seconds a splash ring shows
  FISH_LURE_R: 18,       // fish this close to a fisher waiting still may come by (that is why a fisher waits) ...
  FISHING_COME: 1.5,     // ... one does, at this rate (a game second, times 0.35), swimming to the water in front of the spear (was 0.6)
  FISH_COME_PACE: 1,     // a fish coming by swims at this share of its darting speed (at least its cruising speed; was 0.7)
  FISH_LINGER: [4, 8],   // and stays there this many game seconds, unless frightened (was [2, 5])
  FISHING_BASE: 0.7,     // chance a free grown-up with fish near home goes fishing each time they choose what to do next in the morning
  FISHING_HUNGRY_MULT: 3, // a store under FOOD_PANIC years of eating: this much likelier (fish are close to home)
  FISHING_LEAN_YEARS: 3, FISHING_LEAN_MULT: 2, // a store under this many years: this much likelier
  FISHING_FED_YEARS: 5, FISHING_FED_MULT: 0.6, // a store over this many years: this much less likely
  FISHING_FULL: 0.9,     // nobody goes with the store at this share of what it can hold (STORE_MAX_YEARS) or more
  FISHING_HABIT: 1,      // someone who has fished before is up to (1 + this) times as likely
  FISHING_SHARE: 0.12,   // at most this share of the settled grown-ups out fishing at once (at least one)
  FISHING_CARE_FIRST: 0.8, // a field cared for less than this is tended first
  FISHING_START_BY: 0.45, // nobody sets out to fish after this part of the day (people head home at 0.58)
  FISHING_RANGE: 30,     // fish are looked for within this of the door
  FISHING_WADE_DEPTH: 1, // a fisher wades into water this deep at most (else stands on the bank)
  FISHING_WADE_COST: 1.5, // a wading spot counts this many steps further than a bank spot
  FISHING_WAIT: [6, 12],  // game seconds standing still at a spot before trying another along the bank
  FISHING_TRIES: 6,      // spots tried before going home
  FISHING_SEE: 20,        // after a wait with nothing in reach, the fisher moves to another spot along the bank this far at most
  FISHING_MAX_S: 45,     // game seconds a fishing trip may last
  FISHING_REACH: 2.2,    // a fish this close to the fisher can be struck
  FISHING_STRIKE_AT: 0.25, // seconds into the thrust that the spear meets the water
  FISHING_HANDFUL: 4,    // a hit on a shoal of minnows takes up to this many (four minnows: 8 food, a bit more than a rabbit)
  FISHING_BAG: 12,       // home once the catch is worth this much food (two rabbits' worth)
  FISHING_FEAST: 0.15,   // a hungry person's hunger eases by this much a food unit when fish comes in
  FISHING_WINTER: 0.35,  // in winter (when there is a season clock): this much as likely to go ...
  FISHING_WINTER_HIT: 0.6, // ... and strikes land this much as often (cold, slow fish deep down; ice is a later idea)
  // (FISH BLOCK END)

  // ---- drawing ----
  PERSON_SCALE: 1.18,    // the source's figure was 1.65 blocks; this makes it about 2 (readable from above)
  LOD_PPM: 3.2,          // below this zoom (pixels per metre) people draw as one mesh and do not swing limbs
};
