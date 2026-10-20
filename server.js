// Spooky Maze Runner — static file server + leaderboard API. Zero dependencies.
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

// Scoring/ranking rules come from the game's own modules (loaded at startup) so client and server never drift.
let RULES, scoring;
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

// One entry per mobile number (their best), strictly ranked — see js/scoring.js.
function board(period) {
  return scoring.rankBoard(scores, periodStart(period));
}

const publicEntry = (e) => ({ rank: e.rank, name: e.name, tag: scoring.mobileTag(e.phone), score: e.score, packs: e.packs });

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

// Recompute the score from its breakdown and bounds-check every part (js/scoring.js).
const BREAKDOWN_KEYS = ['reason', 'packs', 'flavourCounts', 'packPoints', 'comboPoints', 'speedPoints', 'nearMisses', 'sets', 'survivedSec', 'livesLeft', 'score'];
function validate(body, session) {
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 16) return 'Name must be 2–16 characters.';
  if (!/^[\p{L}\p{N} _.\-']+$/u.test(name)) return 'Name can only use letters, numbers, spaces and . _ - \'';
  const phone = scoring.normalizeMobile(body.phone);
  if (!phone) return 'Please enter a valid Sri Lankan mobile number (07X XXX XXXX).';
  const b = Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, body[k]]));
  const problem = scoring.checkBreakdown(b);
  if (problem) { console.warn(`Rejected score from ${session.ip}: ${problem}`); return 'Invalid score.'; }
  const elapsed = (Date.now() - session.started) / 1000;
  if (elapsed < b.survivedSec - 2) return 'Invalid score.';
  if (b.packs > Math.ceil(Math.min(elapsed, RULES.durationSec + 5) * MAX_PACKS_PER_SEC)) return 'Invalid score.';
  return { name, phone, ...b };
}

// `textCols`: indexes of player-typed columns that get formula-injection protection.
function toCsv(rows, textCols = []) {
  const cell = (v, i) => {
    let t = String(v ?? '');
    if (textCols.includes(i) && /^[=+\-@]/.test(t)) t = `'${t}`; // keep spreadsheet apps from running formulas
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\n') + '\n';
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
    return send(res, 200, { period, entries: board(period).slice(0, limit).map(publicEntry) });
  }

  if (req.method === 'POST' && url.pathname === '/api/scores') {
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'Bad request.' }); }
    const session = sessions.get(String(body.session || ''));
    if (!session) return send(res, 400, { error: 'Your game session expired — play again to submit.' });
    const v = validate(body, session);
    if (typeof v === 'string') return send(res, 400, { error: v });
    sessions.delete(String(body.session)); // one submission per game
    const entry = { ...v, ip: session.ip, ts: Date.now() };
    scores.push(entry);
    save();
    const today = board('daily');
    const mine = today.find((e) => e.phone === v.phone);
    return send(res, 200, { ok: true, rank: mine.rank, best: mine.score, improved: mine.ts === entry.ts, tag: scoring.mobileTag(v.phone) });
  }

  // Organiser export of winners incl. contact numbers:
  //   GET /api/admin/winners?period=daily|weekly|all&limit=5&format=json|csv&key=ADMIN_KEY
  if (req.method === 'GET' && url.pathname === '/api/admin/winners') {
    if (!ADMIN_KEY || url.searchParams.get('key') !== ADMIN_KEY) return send(res, 403, { error: 'Forbidden' });
    const period = ['daily', 'weekly', 'all'].includes(url.searchParams.get('period')) ? url.searchParams.get('period') : 'daily';
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 5));
    const top = board(period).slice(0, limit).map(({ ip, ...e }) => ({ ...e, mobile: `+${e.phone}`, submittedAt: new Date(e.ts).toISOString() }));
    if (url.searchParams.get('format') === 'csv') {
      const cols = ['rank', 'name', 'mobile', 'score', 'packs', 'packPoints', 'comboPoints', 'speedPoints', 'nearMisses', 'sets', 'survivedSec', 'livesLeft', 'reason', 'submittedAt'];
      return send(res, 200, toCsv([cols, ...top.map((e) => cols.map((c) => e[c]))], [cols.indexOf('name')]), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="spooky-maze-${period}-top${limit}.csv"`,
      });
    }
    return send(res, 200, { period, since: new Date(periodStart(period)).toISOString(), entries: top });
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

(async () => {
  ({ RULES } = await import('./js/config.js'));
  scoring = await import('./js/scoring.js');
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      api(req, res, url).catch((e) => { console.error(e); send(res, 500, { error: 'Server error' }); });
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url);
    } else {
      send(res, 405, { error: 'Method not allowed' });
    }
  }).listen(PORT, () => console.log(`Spooky Maze Runner running at http://localhost:${PORT}`));
})();
