// Scoring and ranking rules shared by the browser game and server.js (keep it DOM-free).
import { SCORING, RULES, PRODUCTS, MONSTERS } from './config.js';

export function comboMultiplier(streak) {
  return Math.min(SCORING.comboMax, 1 + SCORING.comboStep * Math.max(0, streak - 1));
}

// Points for one pack: streak = packs in the current combo (1 = no combo), ageSec = how long it lay there.
export function packScore(streak, ageSec) {
  const withCombo = Math.round(SCORING.perPack * comboMultiplier(streak));
  const speed = Math.max(0, SCORING.speedBonusMax - Math.floor(Math.max(0, ageSec) / SCORING.speedDecaySec));
  return { base: SCORING.perPack, combo: withCombo - SCORING.perPack, speed, total: withCombo + speed };
}

// Final score from a round's breakdown. The server recomputes this to reject tampered totals.
export function totalScore(b) {
  return b.packPoints
    + b.nearMisses * SCORING.nearMiss
    + b.sets * SCORING.flavourSet
    + b.survivedSec * SCORING.perSecondSurvived
    + (b.reason === 'time' ? b.livesLeft * SCORING.perLifeLeft : 0);
}

// Strict ranking: score, then packs, lives left, seconds survived, then whoever got there first.
export function compareEntries(a, b) {
  return b.score - a.score || b.packs - a.packs || b.livesLeft - a.livesLeft
    || b.survivedSec - a.survivedSec || a.ts - b.ts;
}

// Sri Lankan mobile numbers in any common format -> "947XXXXXXXX", or null.
export function normalizeMobile(raw) {
  const m = String(raw || '').replace(/[\s\-().]/g, '').match(/^(?:\+94|0094|94|0)?(7\d{8})$/);
  return m ? `94${m[1]}` : null;
}

export const mobileTag = (phone) => `••${String(phone).slice(-3)}`;

// One entry per mobile number (their best), ranked. `since` filters by submission time.
export function rankBoard(entries, since = 0) {
  const best = new Map();
  const latestName = new Map();
  for (const e of entries) {
    if (!e.phone) continue; // legacy/test entries without a mobile number
    const prev = latestName.get(e.phone);
    if (!prev || e.ts > prev.ts) latestName.set(e.phone, e);
    if (e.ts < since) continue;
    const cur = best.get(e.phone);
    if (!cur || compareEntries(e, cur) < 0) best.set(e.phone, e);
  }
  return [...best.values()].sort(compareEntries)
    .map((e, i) => ({ ...e, rank: i + 1, name: latestName.get(e.phone).name }));
}

// Plausibility checks on a submitted breakdown. Returns an error string or null.
export function checkBreakdown(b) {
  const ints = ['packs', 'packPoints', 'comboPoints', 'speedPoints', 'nearMisses', 'sets', 'survivedSec', 'livesLeft', 'score'];
  if (!ints.every((k) => Number.isInteger(b[k]) && b[k] >= 0)) return 'bad numbers';
  if (b.reason !== 'time' && b.reason !== 'caught') return 'bad reason';
  const fc = b.flavourCounts;
  if (!fc || typeof fc !== 'object') return 'bad flavours';
  const counts = PRODUCTS.map((p) => fc[p.id]);
  if (!counts.every((n) => Number.isInteger(n) && n >= 0) || Object.keys(fc).length !== PRODUCTS.length) return 'bad flavours';
  if (counts.reduce((a, n) => a + n, 0) !== b.packs) return 'packs mismatch';
  if (b.sets !== Math.min(...counts)) return 'sets mismatch';
  if (b.packPoints !== b.packs * SCORING.perPack + b.comboPoints + b.speedPoints) return 'pack points mismatch';
  if (b.comboPoints > b.packs * SCORING.perPack * (SCORING.comboMax - 1)) return 'combo too high';
  if (b.speedPoints > b.packs * SCORING.speedBonusMax) return 'speed too high';
  if (b.livesLeft > RULES.lives || (b.reason === 'caught' && b.livesLeft !== 0)) return 'bad lives';
  if (b.survivedSec > RULES.durationSec || (b.reason === 'time' && b.survivedSec !== RULES.durationSec)) return 'bad time';
  if (b.nearMisses > MONSTERS.length * Math.ceil(b.survivedSec / SCORING.nearMissCooldownSec)) return 'too many near misses';
  if (b.score !== totalScore(b)) return 'total mismatch';
  return null;
}
