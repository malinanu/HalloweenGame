// Central game configuration. Tweak rules, scoring and branding here.
export const RULES = {
  durationSec: 60,
  lives: 3,
  invulnerableSec: 2.0,
  activePacks: 9,          // packs visible in the maze at any moment
  packRespawnSec: 1.2,     // delay before a collected pack re-appears elsewhere
};

export const SCORING = {
  perPack: 10,
  allFiveBonus: 50,        // awarded once, the first time all five products are collected
  perLifeLeft: 20,         // awarded at the end of the round
};

// The five Maliban savoury products. Swap names/colours to match the real range.
export const PRODUCTS = [
  { id: 'red',    name: 'Hot & Spicy',   color: '#e3262b', accent: '#ffd23f' },
  { id: 'yellow', name: 'Cheese',        color: '#f6c514', accent: '#c0392b' },
  { id: 'green',  name: 'Sour Cream',    color: '#2fb84a', accent: '#fff36b' },
  { id: 'blue',   name: 'Salted',        color: '#1f6fe0', accent: '#ffe066' },
  { id: 'purple', name: 'BBQ',           color: '#8e2bd1', accent: '#ff9a3c' },
];

// Optional real pack artwork (front label), e.g. { red: 'assets/packs/red.png' }.
// Any product not listed uses the drawn placeholder label.
export const PACK_ART = {};

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
