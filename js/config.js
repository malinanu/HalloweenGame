// Central game configuration: rules, scoring, monsters and maze. Branding is per vendor (vendors/).
export const RULES = {
  durationSec: 60,
  lives: 3,
  invulnerableSec: 2.0,
  activePacks: 9,          // packs visible in the maze at any moment
  packRespawnSec: 1.2,     // delay before a collected pack re-appears elsewhere
};

// Scoring. The brief's base (10 per pack, +20 per life left) plus skill points so scores
// spread out and players rarely tie. server.js imports this file, so the server always
// validates with the same numbers.
export const SCORING = {
  perPack: 10,
  comboWindowSec: 2.5,     // next pack within this many seconds keeps the combo going
  comboStep: 0.25,         // multiplier grows x1.25, x1.5, x1.75 ...
  comboMax: 2,             // ... up to x2
  speedBonusMax: 5,        // fresh pack = +5, then -1 every speedDecaySec seconds it was left lying
  speedDecaySec: 2,
  nearMiss: 5,             // a skeleton came close and you got away
  nearMissRadius: 2.8,     // world units (cell = 4); hit radius is 1.55
  nearMissCooldownSec: 3,  // per skeleton
  fullSet: 50,             // every complete set of all five kinds of item (repeatable)
  perSecondSurvived: 2,
  perLifeLeft: 20,         // only when the timer runs out
};

// Vendor branding (name, colours, what players collect, prizes) lives in vendors/<id>/vendor.json.
// Collectibles are always five kinds, stored as these slots so scoring never depends on a vendor.
export const ITEM_SLOTS = ['i1', 'i2', 'i3', 'i4', 'i5'];
export const ITEM_SHAPES = ['bag', 'can', 'box', 'coin', 'gift'];
export const DEFAULT_VENDOR = 'spooky';
export const VENDOR_ID = /^[a-z0-9-]{1,40}$/;

// The five characters to avoid (KayKit Skeletons, each with its own personality).
export const MONSTERS = [
  { name: 'Warrior', model: 'Skeleton_Warrior', speed: 3.1, chase: 0.65, tint: null },
  { name: 'Rogue',   model: 'Skeleton_Rogue',   speed: 3.9, chase: 0.45, tint: null },
  { name: 'Mage',    model: 'Skeleton_Mage',    speed: 2.8, chase: 0.75, tint: null },
  { name: 'Minion',  model: 'Skeleton_Minion',  speed: 3.4, chase: 0.30, tint: null },
  { name: 'Ghost',   model: 'Skeleton_Minion',  speed: 2.5, chase: 0.85, tint: 'ghost' },
];

export const MAZE = {
  cell: 4,                 // world units per cell (KayKit tiles are 4x4)
  portrait: { cols: 7, rows: 10 },
  portraitMaxRows: 14,     // tall phones grow the portrait maze up to this many rows
  landscape: { cols: 11, rows: 7 },
  extraOpenings: 0.32,     // fraction of dead-ends/walls knocked out so there are loops to escape through
  wallScaleY: 0.45,        // squash the 4m KayKit walls so the camera can see into the corridors
};

export const PLAYER_SPEED = 5.2;  // world units / second

export const API_BASE = '/api';
