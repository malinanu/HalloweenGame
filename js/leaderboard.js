import { API_BASE } from './config.js';

// Talks to server.js. When the game is hosted as plain static files (no API),
// it falls back to a leaderboard stored in this browser so the game still works.
const LOCAL_KEY = 'maliban_local_scores';
let serverAvailable = null;

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
      const data = await api(`/leaderboard?period=${period}&limit=${limit}`);
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
      const data = await api('/scores', { method: 'POST', body: JSON.stringify(payload) });
      return { ...data, source: 'server' };
    } catch (e) {
      if (e.status && e.status < 500) throw e; // validation errors are real
      serverAvailable = false;
    }
  }
  const list = readLocal();
  list.push({ name: payload.name, score: payload.score, ts: Date.now() });
  writeLocal(list);
  const board = localBoard('daily', 1000);
  const rank = board.findIndex((e) => e.name.toLowerCase() === payload.name.toLowerCase()) + 1;
  return { ok: true, rank, source: 'local' };
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
  const since = periodStart(period);
  const best = new Map();
  for (const s of readLocal()) {
    if (s.ts < since) continue;
    const k = s.name.toLowerCase();
    if (!best.has(k) || best.get(k).score < s.score) best.set(k, s);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, limit)
    .map((e) => ({ name: e.name, score: e.score }));
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch { return []; }
}
function writeLocal(list) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-500))); } catch { /* ignore */ }
}

export function personalBest() {
  try { return Number(localStorage.getItem('maliban_best')) || 0; } catch { return 0; }
}
export function savePersonalBest(score) {
  try { if (score > personalBest()) localStorage.setItem('maliban_best', String(score)); } catch { /* ignore */ }
}
