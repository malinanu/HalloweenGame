import { Assets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { PRODUCTS, SCORING, RULES } from './config.js';
import { startSession, fetchBoard, submitScore, personalBest, savePersonalBest } from './leaderboard.js';

const $ = (s) => document.querySelector(s);
const screens = [...document.querySelectorAll('.screen')];
const touch = matchMedia('(pointer: coarse)').matches;

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
  $('#dpad').classList.toggle('hidden', !(ingame && touch));
  game?.fitCamera();
}

// ---------------------------------------------------------------- HUD hooks
const hearts = $('#hud-lives');
const flavourBar = $('#flavours');
flavourBar.innerHTML = PRODUCTS.map((p) => `<i data-id="${p.id}" title="${p.name}" style="background:${p.color};color:${p.color}"></i>`).join('');
$('#rules-flavours').innerHTML = PRODUCTS.map((p) => `<span style="background:${p.color}">${p.name}</span>`).join('');
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
    const dpad = !$('#dpad').classList.contains('hidden');
    const bottom = dpad ? Math.min(150, innerHeight * 0.2) : 12;
    return { top, bottom };
  },
  end(result) { gameOver(result); },
};

// ---------------------------------------------------------------- flow
async function play() {
  audio.ensure();
  audio.startMusic();
  $('#hud').classList.remove('hidden');
  $('#flavours').classList.remove('hidden');
  show(null);
  game.start();
  session = await startSession();
}

function gameOver(result) {
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
$('#btn-play').addEventListener('click', play);
$('#btn-again').addEventListener('click', play);
$('#btn-rules').addEventListener('click', () => show('screen-rules'));
$('#btn-board').addEventListener('click', () => openBoard('daily'));
$('#btn-over-board').addEventListener('click', () => openBoard('daily'));
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.closest('#screen-board') ? backTo : 'screen-start')));
$('#btn-pause').addEventListener('click', togglePause);
$('#btn-resume').addEventListener('click', togglePause);
$('#btn-quit').addEventListener('click', () => { game.attract(); $('#hud').classList.add('hidden'); $('#flavours').classList.add('hidden'); show('screen-start'); });
const soundBtn = $('#btn-sound');
const syncSound = () => { soundBtn.textContent = audio.muted ? '🔇' : '🔊'; };
syncSound();
soundBtn.addEventListener('click', () => { audio.ensure(); audio.setMuted(!audio.muted); syncSound(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game?.pause()) show('screen-pause'); });

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
  const input = new Input($('#game'), $('#dpad'));
  input.onPause = () => { if (game.state === 'playing' || game.state === 'paused' || game.state === 'countdown') togglePause(); };
  game = new Game($('#game'), assets, audio, input, hooks);
  game.attract();
  show('screen-start');
  window.__game = game; // handy for debugging in the console
})();
