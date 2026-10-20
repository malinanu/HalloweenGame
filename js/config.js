// Central game configuration: rules, scoring, targets and yard layout.
// Branding (name, colours, collectibles, prizes) is per vendor skin: vendors/<id>/vendor.json.
// server.js imports this file, so score validation always uses the same numbers.

export const RULES = {
  durationSec: 60,
  lives: 3,
};

export const SCORING = {
  // points for smashing each kind of monster
  skeleton: 10,
  ghost: 15,
  bat: 20,
  perItem: 10,             // each collectible tapped
  comboStep: 0.25,         // consecutive smashes: x1.25, x1.5, x1.75 ...
  comboMax: 2,             // ... up to x2 (a miss or a wrong tap resets it)
  speedBonusMax: 5,        // tapped right away = +5, then -1 every speedDecaySec
  speedDecaySec: 0.25,
  fullSet: 50,             // every complete set of all five kinds of collectible (repeatable)
  perSecondSurvived: 2,
  perLifeLeft: 20,         // only when the timer runs out
};

// How the round ramps up: values go from `start` to `end` over the 60 seconds.
export const DIFFICULTY = {
  spawnEverySec: { start: 0.95, end: 0.38 },  // gap between pop-ups
  upTimeSec: { start: 1.7, end: 0.85 },       // how long a target stays up
  maxActive: { start: 2, end: 5 },            // targets up at the same time
  catChance: { start: 0.10, end: 0.20 },      // share of pop-ups that are the black cat (don't tap!)
  itemChance: 0.14,                           // share that are collectibles
  ghostChance: 0.14,                          // share that are ghosts
  batEverySec: 6,                             // a bat flies across this often
};

// The four KayKit skeletons that pop out of the graves (tinted ghost reuses the Minion).
export const SKELETONS = ['Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage', 'Skeleton_Minion'];

export const YARD = {
  spacing: 3.3,                                // world units between graves
  portrait: { cols: 3, rows: 4 },
  landscape: { cols: 4, rows: 3 },
  tapRadiusPx: 70,                             // taps this close to a target still count (phones)
};

// Collectibles are always five kinds, stored as these slots so scoring never depends on a vendor.
export const ITEM_SLOTS = ['i1', 'i2', 'i3', 'i4', 'i5'];
export const ITEM_SHAPES = ['bag', 'can', 'box', 'coin', 'gift'];
export const DEFAULT_VENDOR = 'pumpkin-smash';
export const VENDOR_ID = /^[a-z0-9-]{1,40}$/;

export const API_BASE = '/api';
