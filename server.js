// Maliban Savoury Maze — static file server + leaderboard API. Zero dependencies.
//   node server.js            (PORT=8080, DATA_DIR=./data, TZ_OFFSET_MIN=330 by default)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
// Day/week boundaries for the daily & weekly prizes. 330 = Sri Lanka (UTC+05:30).
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN ?? 330);
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// Must match js/config.js
const RULES = { durationSec: 60, perPack: 10, allFive: 50, perLife: 20, lives: 3 };
const MAX_PACKS_PER_SEC = 1.6; // generous upper bound on how fast packs can physically be collected

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
};

// ------------------------------------------------------------------ storage
fs.mkdirSync(DATA_DIR, { recursive: true });
let scores = [];
try { scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')); } catch { scores = []; }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${SCORES_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(scores));
    fs.renameSync(tmp, SCORES_FILE);
  }, 200);
}

const sessions = new Map(); // id -> { started, ip }
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k, s] of sessions) if (s.started < cutoff) sessions.delete(k);
}, 60 * 1000).unref();

// ------------------------------------------------------------------ helpers
function periodStart(period, now = Date.now()) {
  if (period === 'all') return 0;
  const local = new Date(now + TZ_OFFSET_MIN * 60000); // shift so UTC getters read local wall-clock
  local.setUTCHours(0, 0, 0, 0);
  if (period === 'weekly') local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7)); // Monday
  return local.getTime() - TZ_OFFSET_MIN * 60000;
}

function board(period, limit) {
  const since = periodStart(period);
  const best = new Map();
  for (const s of scores) {
    if (s.ts < since) continue;
    const k = s.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || s.score > cur.score || (s.score === cur.score && s.ts < cur.ts)) best.set(k, s);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, limit);
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4096) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

// Recompute the score from its parts so a tampered total is rejected.
function validate(body, session) {
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 16) return 'Name must be 2–16 characters.';
  if (!/^[\p{L}\p{N} _.\-']+$/u.test(name)) return 'Name can only use letters, numbers, spaces and . _ - \'';
  const phone = String(body.phone || '').replace(/[^\d+]/g, '');
  if (phone && (phone.length < 9 || phone.length > 15)) return 'Please enter a valid mobile number.';
  const packs = Number(body.packs), lives = Number(body.livesLeft), flavours = Number(body.flavours);
  const score = Number(body.score);
  if (![packs, lives, flavours, score].every(Number.isInteger)) return 'Invalid score.';
  if (packs < 0 || lives < 0 || lives > RULES.lives || flavours < 0 || flavours > 5 || flavours > packs) return 'Invalid score.';
  const timeUp = body.reason === 'time';
  const expected = packs * RULES.perPack + (flavours === 5 ? RULES.allFive : 0) + (timeUp ? lives * RULES.perLife : 0);
  if (score !== expected) return 'Invalid score.';
  const elapsed = (Date.now() - session.started) / 1000;
  if (timeUp && elapsed < RULES.durationSec - 2) return 'Invalid score.';
  if (packs > Math.ceil(Math.min(elapsed, RULES.durationSec + 5) * MAX_PACKS_PER_SEC)) return 'Invalid score.';
  return { name, phone, packs, lives, flavours, score };
}

// ------------------------------------------------------------------ API
async function api(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/session') {
    const id = crypto.randomBytes(16).toString('hex');
    sessions.set(id, { started: Date.now(), ip: clientIp(req) });
    return send(res, 200, { session: id });
  }

  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    const period = ['daily', 'weekly', 'all'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'daily';
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
    return send(res, 200, { period, entries: board(period, limit).map(({ name, score, ts }) => ({ name, score, ts })) });
  }

  if (req.method === 'POST' && url.pathname === '/api/scores') {
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad request.' }); }
    const session = sessions.get(String(body.session || ''));
    if (!session) return send(res, 400, { error: 'Your game session expired — play again to submit.' });
    const v = validate(body, session);
    if (typeof v === 'string') return send(res, 400, { error: v });
    sessions.delete(String(body.session)); // one submission per game
    const entry = { name: v.name, score: v.score, packs: v.packs, livesLeft: v.lives, flavours: v.flavours, phone: v.phone || undefined, ip: session.ip, ts: Date.now() };
    scores.push(entry);
    save();
    const rank = board('daily', 100000).findIndex((e) => e.name.toLowerCase() === v.name.toLowerCase()) + 1;
    return send(res, 200, { ok: true, rank });
  }

  // Organiser export of winners incl. contact numbers: GET /api/admin/winners?period=daily&key=ADMIN_KEY
  if (req.method === 'GET' && url.pathname === '/api/admin/winners') {
    if (!ADMIN_KEY || url.searchParams.get('key') !== ADMIN_KEY) return send(res, 403, { error: 'Forbidden' });
    const period = url.searchParams.get('period') || 'daily';
    return send(res, 200, { period, since: new Date(periodStart(period)).toISOString(), entries: board(period, 50) });
  }

  return send(res, 404, { error: 'Not found' });
}

// ------------------------------------------------------------------ static
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  // Never serve server-side files: dotfiles/dirs (.env, .git, .deploy-tools), data, configs.
  const parts = path.relative(ROOT, file).split(path.sep);
  const blocked = parts.some((p) => p.startsWith('.')) || ['data', 'node_modules'].includes(parts[0])
    || ['server.js', 'ecosystem.config.cjs', 'package.json', 'package-lock.json'].includes(parts.join('/'));
  if (!file.startsWith(ROOT + path.sep) || blocked) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((e) => { console.error(e); send(res, 500, { error: 'Server error' }); });
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, url);
  } else {
    send(res, 405, { error: 'Method not allowed' });
  }
}).listen(PORT, () => console.log(`Maliban Savoury Maze running at http://localhost:${PORT}`));
