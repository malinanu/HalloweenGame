import { Assets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { PRODUCTS, SCORING, RULES } from './config.js';
import { startSession, fetchBoard, submitScore, personalBest, savePersonalBest } from './leaderboard.js';

const $ = (s) => document.querySelector(s);
const screens = [...document.querySelectorAll('.screen')];
const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches;
document.body.classList.toggle('touch', touch);

let game;
let session = null;
let lastResult = null;
let submitted = false;
let backTo = 'screen-start';
const audio = new Audio();

function show(id) {
  screens.forEach((s) => s.classList.toggle('show', s.id === id));
  const ingame = !id;
  $('#top').classList.toggle('hidden', !ingame && id !== 'screen-pause');
  game?.fitCamera();
}

// ---------------------------------------------------------------- HUD hooks
const hearts = $('#hud-lives');
const flavourBar = $('#flavours');
flavourBar.innerHTML = PRODUCTS.map((p) => `<i data-id="${p.id}" title="${p.name}" style="background:${p.color};color:${p.color}"></i>`).join('');
$('#rules-flavours').innerHTML = PRODUCTS.map((p) => `<span style="background:${p.color}">${p.name}</span>`).join('');
if (touch) $('.controls').textContent = 'Swipe anywhere to steer · tap ❚❚ to pause';
$('#r-pack').textContent = `${SCORING.perPack} pts`;
$('#r-five').textContent = `+${SCORING.allFiveBonus} pts`;
$('#r-life').textContent = `+${SCORING.perLifeLeft} pts`;

const hooks = {
  hud({ score, time, lives, flavours }) {
    $('#hud-score').textContent = score.toLocaleString();
    const s = Math.ceil(time);
    $('#hud-time').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    $('#pill-time').classList.toggle('warn', s <= 10 && s > 0);
    const h = Array.from({ length: RULES.lives }, (_, i) => `<i class="${i < lives ? '' : 'lost'}">❤</i>`).join('');
    if (hearts.innerHTML !== h) hearts.innerHTML = h;
    flavourBar.querySelectorAll('i').forEach((el) => el.classList.toggle('got', flavours.includes(el.dataset.id)));
  },
  toast(text, kind) {
    const t = $('#toast');
    t.className = '';
    t.textContent = text;
    void t.offsetWidth;
    t.className = `show ${kind}`;
  },
  flash(kind) {
    const f = $('#flash');
    f.className = kind;
    requestAnimationFrame(() => requestAnimationFrame(() => { f.className = ''; }));
  },
  popup(text, pos, camera, color) {
    const v = pos.clone().project(camera);
    const el = document.createElement('span');
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
    $('#popups').appendChild(el);
    setTimeout(() => el.remove(), 900);
  },
  insets() {
    const hudVisible = !$('#top').classList.contains('hidden');
    const top = hudVisible ? $('#top').getBoundingClientRect().bottom + 4 : 12;
    const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;
    return { top, bottom: 12 + safeBottom };
  },
  haptic(pattern) {
    if (touch && navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* ignore */ } }
  },
  end(result) { gameOver(result); },
};

// ---------------------------------------------------------------- flow
// Fullscreen + keep the screen awake while playing on phones.
let wakeLock = null;
async function enterMobileMode() {
  if (!touch) return;
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
  } catch { /* not allowed (e.g. iOS Safari) */ }
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* ignore */ }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// ---------------------------------------------------------------- tutorial
const TUT_KEY = 'maliban_tutorial_seen';
const tutCards = [...document.querySelectorAll('.tut-card')];
let tutIndex = 0;
let tutThen = null; // what to do when the tutorial closes
$('#tut-packs').innerHTML = PRODUCTS.map((p) => `<i style="background:${p.color};color:${p.color}"></i>`).join('');
$('#tut-pack-pts').textContent = `${SCORING.perPack} points`;
$('#tut-five-pts').textContent = `+${SCORING.allFiveBonus}`;
$('#tut-life-pts').textContent = `+${SCORING.perLifeLeft} points`;
$('#tut-dots').innerHTML = tutCards.map(() => '<i></i>').join('');

function tutorialSeen() { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; } }
function showTutCard(i) {
  tutIndex = i;
  tutCards.forEach((c, k) => c.classList.toggle('on', k === i));
  document.querySelectorAll('#tut-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
  $('#tut-next').textContent = i === tutCards.length - 1 ? "Let's go! ▶" : 'Next ▶';
}
function openTutorial(then) {
  tutThen = then;
  showTutCard(0);
  show('screen-tutorial');
}
function closeTutorial() {
  try { localStorage.setItem(TUT_KEY, '1'); } catch { /* ignore */ }
  const then = tutThen;
  tutThen = null;
  if (then) then(); else show('screen-start');
}
function tutNext() {
  if (tutIndex < tutCards.length - 1) showTutCard(tutIndex + 1);
  else closeTutorial();
}
$('#tut-next').addEventListener('click', tutNext);
$('#tut-skip').addEventListener('click', closeTutorial);
// Swiping on the tutorial practises the control and moves to the next card.
{
  const tut = $('#screen-tutorial');
  let sx = 0, sy = 0, id = null;
  tut.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) { sx = e.clientX; sy = e.clientY; id = e.pointerId; } });
  tut.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) >= 40) { hooks.haptic(10); tutNext(); }
  });
}

function startGame() {
  if (tutorialSeen()) play();
  else openTutorial(play);
}

async function play() {
  enterMobileMode();
  audio.ensure();
  audio.startMusic();
  $('#hud').classList.remove('hidden');
  $('#flavours').classList.remove('hidden');
  show(null);
  game.start();
  session = await startSession();
}

function gameOver(result) {
  releaseWakeLock();
  lastResult = result;
  submitted = false;
  const best = personalBest();
  savePersonalBest(result.score);
  $('#over-title').textContent = result.reason === 'time' ? "Time's up — you survived!" : 'The skeletons got you!';
  $('#over-score').textContent = result.score.toLocaleString();
  $('#over-best').textContent = result.score > best ? '★ New personal best!' : `Personal best: ${best.toLocaleString()}`;
  $('#over-breakdown').innerHTML = [
    [`Packs collected (${result.packs} × ${SCORING.perPack})`, result.packPoints],
    [`All five flavours bonus (${result.flavours}/5)`, result.flavourBonus],
    [`Lives left bonus (${result.livesLeft} × ${SCORING.perLifeLeft})`, result.lifeBonus],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v ? '+' + v : '0'}</b></div>`).join('')
    + `<div class="total"><span>Total</span><b>${result.score}</b></div>`;
  $('#submit-msg').textContent = '';
  $('#submit-msg').className = 'msg';
  $('#btn-submit').disabled = false;
  $('#submit-form').classList.toggle('hidden', result.score <= 0);
  try { $('#in-name').value = localStorage.getItem('maliban_name') || ''; } catch { /* ignore */ }
  show('screen-over');
}

$('#submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitted || !lastResult) return;
  const name = $('#in-name').value.trim().replace(/\s+/g, ' ');
  const phone = $('#in-phone').value.trim();
  const msg = $('#submit-msg');
  if (name.length < 2) { msg.textContent = 'Please enter a name (2–16 characters).'; msg.className = 'msg err'; return; }
  $('#btn-submit').disabled = true;
  msg.textContent = 'Submitting…';
  msg.className = 'msg';
  try {
    try { localStorage.setItem('maliban_name', name); } catch { /* ignore */ }
    const r = await submitScore({
      session, name, phone,
      score: lastResult.score, packs: lastResult.packs, livesLeft: lastResult.livesLeft,
      flavours: lastResult.flavours, reason: lastResult.reason,
    });
    submitted = true;
    msg.textContent = r.rank ? `Submitted! You're #${r.rank} today.` : 'Submitted!';
    msg.className = 'msg ok';
    setTimeout(() => openBoard('daily', name), 900);
  } catch (err) {
    msg.textContent = err.message || 'Could not submit score.';
    msg.className = 'msg err';
    $('#btn-submit').disabled = false;
  }
});

// ---------------------------------------------------------------- leaderboard
let boardPeriod = 'daily';
let highlight = null;
async function renderBoard() {
  const list = $('#lb-list');
  list.innerHTML = '<li class="empty">Loading…</li>';
  const { entries, source } = await fetchBoard(boardPeriod, 10);
  list.innerHTML = entries.length
    ? entries.map((e, i) => `<li class="${highlight && e.name.toLowerCase() === highlight.toLowerCase() ? 'me' : ''}"><span class="rk">${i < 3 ? ['👑 1', '2', '3'][i] : i + 1}</span><span class="nm">${escapeHtml(e.name)}</span><span class="sc">${e.score.toLocaleString()}</span></li>`).join('')
    : '<li class="empty">No scores yet — be the first!</li>';
  $('#lb-note').textContent = source === 'local' ? 'Offline mode: showing scores saved on this device.' : 'Only your best score counts. Prizes for daily & weekly leaders!';
}
function openBoard(period = boardPeriod, me = highlight) {
  boardPeriod = period;
  highlight = me;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.period === period));
  backTo = document.querySelector('.screen.show')?.id === 'screen-over' ? 'screen-over' : 'screen-start';
  if (submitted) backTo = 'screen-over';
  show('screen-board');
  renderBoard();
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { boardPeriod = b.dataset.period; openBoard(boardPeriod); }));

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- buttons
function togglePause() {
  if (game.state === 'paused') { game.resume(); show(null); }
  else if (game.pause()) show('screen-pause');
}
$('#btn-play').addEventListener('click', startGame);
$('#btn-howto').addEventListener('click', () => openTutorial(null));
$('#btn-again').addEventListener('click', play);
$('#btn-rules').addEventListener('click', () => show('screen-rules'));
$('#btn-board').addEventListener('click', () => openBoard('daily'));
$('#btn-over-board').addEventListener('click', () => openBoard('daily'));
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.closest('#screen-board') ? backTo : 'screen-start')));
$('#btn-pause').addEventListener('click', togglePause);
$('#btn-resume').addEventListener('click', togglePause);
$('#btn-quit').addEventListener('click', () => { releaseWakeLock(); game.attract(); $('#hud').classList.add('hidden'); $('#flavours').classList.add('hidden'); show('screen-start'); });
const soundBtn = $('#btn-sound');
const syncSound = () => { soundBtn.textContent = audio.muted ? '🔇' : '🔊'; };
syncSound();
soundBtn.addEventListener('click', () => { audio.ensure(); audio.setMuted(!audio.muted); syncSound(); });
document.addEventListener('visibilitychange', async () => {
  if (document.hidden && game?.pause()) show('screen-pause');
  // the wake lock is dropped when the tab is hidden; take it back when we return mid-round
  if (!document.hidden && wakeLock && game?.state !== 'over') {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* ignore */ }
  }
});
// Rotating the phone or showing/hiding the browser bar changes the viewport.
addEventListener('orientationchange', () => setTimeout(() => game?.resize(), 250));
document.addEventListener('contextmenu', (e) => { if (touch) e.preventDefault(); });
// Stop double-tap zoom on iOS (user-scalable=no is ignored there).
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && !e.target.closest('input, button, a')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// ---------------------------------------------------------------- boot
(async function boot() {
  const assets = new Assets();
  try {
    await assets.load((p) => { $('#load-bar').style.width = `${Math.round(p * 100)}%`; });
  } catch (err) {
    console.error(err);
    $('#screen-loading .muted').textContent = 'Failed to load game assets. Please refresh.';
    return;
  }
  const input = new Input();
  input.onSteer = () => hooks.haptic(6);
  input.onPause = () => { if (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown') togglePause(); };
  game = new Game($('#game'), assets, audio, input, hooks);
  game.attract();
  show('screen-start');
  window.__game = game; // handy for debugging in the console
})();
