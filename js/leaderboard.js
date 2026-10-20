import { API_BASE } from './config.js';
import { rankBoard, normalizeMobile, mobileTag } from './scoring.js';
import { VENDOR } from './vendor.js';
import { platform } from './platform.js';

// Talks to server.js. When the game is hosted as plain static files (no API),
// it falls back to a leaderboard stored in this browser so the game still works.
// Every vendor has its own leaderboard.
const LOCAL_KEY = 'smr_local_scores';
let serverAvailable = platform.caps.server ? null : false; // platform builds never call a server

// Anonymous per-browser id: identifies a player when the vendor doesn't collect phone numbers.
export function deviceId() {
  let id = platform.store.get('smr_device');
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 24);
    platform.store.set('smr_device', id);
  }
  return id;
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export async function startSession() {
  if (!platform.caps.server) return null;
  try {
    const { session } = await api('/session', { method: 'POST', body: '{}' });
    serverAvailable = true;
    return session;
  } catch {
    serverAvailable = false;
    return null;
  }
}

export async function fetchBoard(period = 'daily', limit = 10) {
  if (serverAvailable !== false) {
    try {
      const data = await api(`/leaderboard?vendor=${VENDOR.id}&period=${period}&limit=${limit}`);
      serverAvailable = true;
      return { entries: data.entries, source: 'server' };
    } catch {
      serverAvailable = false;
    }
  }
  return { entries: localBoard(period, limit), source: 'local' };
}

export async function submitScore(payload) {
  if (serverAvailable !== false && payload.session) {
    try {
      const data = await api('/scores', { method: 'POST', body: JSON.stringify({ ...payload, vendor: VENDOR.id, device: deviceId() }) });
      return { ...data, source: 'server' };
    } catch (e) {
      if (e.status && e.status < 500) throw e; // validation errors are real
      serverAvailable = false;
    }
  }
  const phone = VENDOR.leaderboard.requirePhone ? normalizeMobile(payload.phone, VENDOR.leaderboard.phoneCountry) : null;
  const entry = { ...payload, vendor: VENDOR.id, phone, device: deviceId(), ts: Date.now() };
  delete entry.session;
  const list = readLocal();
  list.push(entry);
  writeLocal(list);
  const mine = rankBoard(list, periodStart('daily'), VENDOR.id).find((e) => e.ts === entry.ts || (phone ? e.phone === phone : e.device === entry.device));
  return { ok: true, rank: mine.rank, best: mine.score, improved: mine.ts === entry.ts, tag: mobileTag(phone), source: 'local' };
}

function periodStart(period) {
  const now = new Date();
  if (period === 'daily') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === 'weekly') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    return d.getTime() - dow * 86400000;
  }
  return 0;
}

function localBoard(period, limit) {
  return rankBoard(readLocal(), periodStart(period), VENDOR.id).slice(0, limit)
    .map((e) => ({ rank: e.rank, name: e.name, tag: mobileTag(e.phone), score: e.score, smashes: e.smashes }));
}

function readLocal() {
  try { return JSON.parse(platform.store.get(LOCAL_KEY)) || []; } catch { return []; }
}
function writeLocal(list) {
  platform.store.set(LOCAL_KEY, JSON.stringify(list.slice(-200)));
}

export function personalBest() {
  return Number(platform.store.get(`smr_best_${VENDOR.id}`)) || 0;
}
export function savePersonalBest(score) {
  if (score > personalBest()) platform.store.set(`smr_best_${VENDOR.id}`, String(score));
}
