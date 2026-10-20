// Scoring and ranking rules shared by the browser game and server.js (keep it DOM-free).
import { SCORING, RULES, ITEM_SLOTS, DEFAULT_VENDOR } from './config.js';

const SMASH_VALUES = [SCORING.skeleton, SCORING.ghost, SCORING.bat];
const MIN_SMASH = Math.min(...SMASH_VALUES);
const MAX_SMASH = Math.max(...SMASH_VALUES);

export function comboMultiplier(streak) {
  return Math.min(SCORING.comboMax, 1 + SCORING.comboStep * Math.max(0, streak - 1));
}

// Points for one smash. base = the monster's value, streak = smashes in a row (1 = no combo),
// reactionSec = time since the target appeared.
export function smashScore(base, streak, reactionSec) {
  const withCombo = Math.round(base * comboMultiplier(streak));
  const speed = Math.max(0, SCORING.speedBonusMax - Math.floor(Math.max(0, reactionSec) / SCORING.speedDecaySec));
  return { base, combo: withCombo - base, speed, total: withCombo + speed };
}

// Final score from a round's breakdown. The server recomputes this to reject tampered totals.
export function totalScore(b) {
  return b.basePoints + b.comboPoints + b.speedPoints
    + b.items * SCORING.perItem
    + b.sets * SCORING.fullSet
    + b.survivedSec * SCORING.perSecondSurvived
    + (b.reason === 'time' ? b.livesLeft * SCORING.perLifeLeft : 0);
}

// Strict ranking: score, then smashes, lives left, seconds survived, then whoever got there first.
export function compareEntries(a, b) {
  return b.score - a.score || (b.smashes || 0) - (a.smashes || 0) || b.livesLeft - a.livesLeft
    || b.survivedSec - a.survivedSec || a.ts - b.ts;
}

// Mobile numbers -> digits only with country code, or null.
//   'LK'  Sri Lankan mobiles in any common format (07X…, 7X…, +94 7X…, 0094…) -> 947XXXXXXXX
//   'any' any international number with 8–15 digits
export function normalizeMobile(raw, country = 'LK') {
  const clean = String(raw || '').replace(/[\s\-().]/g, '');
  if (country === 'LK') {
    const m = clean.match(/^(?:\+94|0094|94|0)?(7\d{8})$/);
    return m ? `94${m[1]}` : null;
  }
  const m = clean.match(/^(?:\+|00)?(\d{8,15})$/);
  return m ? m[1] : null;
}

export const mobileTag = (phone) => (phone ? `••${String(phone).slice(-3)}` : '');

export const vendorOf = (e) => e.vendor || DEFAULT_VENDOR;
// A player is their mobile number when the vendor collects one, otherwise their device id.
export const playerKey = (e) => e.phone || (e.device ? `d:${e.device}` : null);

// One entry per player (their best) for one vendor, ranked. `since` filters by submission time.
export function rankBoard(entries, since = 0, vendor = DEFAULT_VENDOR) {
  const best = new Map();
  const latestName = new Map();
  for (const e of entries) {
    const key = playerKey(e);
    if (!key || vendorOf(e) !== vendor) continue;
    const prev = latestName.get(key);
    if (!prev || e.ts > prev.ts) latestName.set(key, e);
    if (e.ts < since) continue;
    const cur = best.get(key);
    if (!cur || compareEntries(e, cur) < 0) best.set(key, e);
  }
  return [...best.entries()].map(([key, e]) => ({ ...e, key }))
    .sort(compareEntries)
    .map((e, i) => ({ ...e, rank: i + 1, name: latestName.get(e.key).name }));
}

// Plausibility checks on a submitted breakdown. Returns an error string or null.
export function checkBreakdown(b) {
  const ints = ['smashes', 'basePoints', 'comboPoints', 'speedPoints', 'items', 'sets', 'survivedSec', 'livesLeft', 'score'];
  if (!ints.every((k) => Number.isInteger(b[k]) && b[k] >= 0)) return 'bad numbers';
  if (b.reason !== 'time' && b.reason !== 'lives') return 'bad reason';
  const ic = b.itemCounts;
  if (!ic || typeof ic !== 'object') return 'bad items';
  const counts = ITEM_SLOTS.map((id) => ic[id]);
  if (!counts.every((n) => Number.isInteger(n) && n >= 0) || Object.keys(ic).length !== ITEM_SLOTS.length) return 'bad items';
  if (counts.reduce((a, n) => a + n, 0) !== b.items) return 'items mismatch';
  if (b.sets !== Math.min(...counts)) return 'sets mismatch';
  if (b.basePoints < b.smashes * MIN_SMASH || b.basePoints > b.smashes * MAX_SMASH) return 'base points out of range';
  if (b.comboPoints > Math.ceil(b.basePoints * (SCORING.comboMax - 1)) + b.smashes) return 'combo too high';
  if (b.speedPoints > b.smashes * SCORING.speedBonusMax) return 'speed too high';
  if (b.livesLeft > RULES.lives || (b.reason === 'lives' && b.livesLeft !== 0)) return 'bad lives';
  if (b.survivedSec > RULES.durationSec || (b.reason === 'time' && b.survivedSec !== RULES.durationSec)) return 'bad time';
  if (b.score !== totalScore(b)) return 'total mismatch';
  return null;
}
