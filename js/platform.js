// Where the game runs: the open web (default), YouTube Playables, or an ad-supported game
// portal (CrazyGames, GameDistribution). The rest of the game talks only to this module.
//
//   platform.init()            load the platform SDK + saved data (await before anything else)
//   platform.firstFrame()      the first frame has been drawn
//   platform.ready()           the game is interactive (start screen showing)
//   platform.store.get/set     saved data (localStorage on the web, the platform's cloud save elsewhere)
//   platform.onPause/onResume  the platform wants the game paused / allows it to continue
//   platform.onAudio(cb)       the platform's sound setting changed (cb(enabled))
//   platform.roundStart()      gameplay started
//   platform.roundEnd(score)   gameplay ended with this score
//   platform.adBreak()         show an ad between rounds if the platform has ads; resolves when done
//   platform.caps              what this platform allows (server, phone, prizes, fullscreen)
import { PLATFORM_CONFIG } from './platform-config.js';

const TARGETS = ['web', 'youtube', 'crazygames', 'gamedistribution'];
const SAVE_KEY = 'smr_save';

// A test override (?platform=youtube) is only honoured on the plain web build.
const asked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('platform'); // undefined in Node (server.js)
const target = PLATFORM_CONFIG.target === 'web' && TARGETS.includes(asked) ? asked : PLATFORM_CONFIG.target;

const handlers = { pause: [], resume: [], audio: [] };
const emit = (k, ...a) => handlers[k].forEach((f) => { try { f(...a); } catch (e) { console.error(e); } });

// ------------------------------------------------------------ saved data
// Everything is kept in one small object. The web writes it to localStorage; platforms with
// cloud saves get the whole object as a JSON string (debounced).
const cache = {};
let persist = () => {};
let saveTimer = null;
const store = {
  get(k) { return k in cache ? cache[k] : null; },
  set(k, v) {
    cache[k] = v == null ? null : String(v);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(), 300);
  },
};

function localPersistence() {
  try { Object.assign(cache, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch { /* private mode */ }
  // keep values written by earlier versions of the game
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('smr_') && k !== SAVE_KEY && !(k in cache)) cache[k] = localStorage.getItem(k);
    }
  } catch { /* ignore */ }
  persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(cache)); } catch { /* ignore */ } };
}

// ------------------------------------------------------------ adapters
const adapters = {
  web: {
    caps: { server: true, phone: true, prizes: true, fullscreen: true },
    async init() { localPersistence(); },
  },

  // https://developers.google.com/youtube/gaming/playables — the SDK script tag is added to
  // index.html by `npm run package -- --target youtube`.
  youtube: {
    caps: { server: false, phone: false, prizes: false, fullscreen: false },
    async init() {
      const yt = window.ytgame;
      if (!yt || !yt.IN_PLAYABLES_ENV) { localPersistence(); return; } // e.g. testing outside YouTube
      try {
        const raw = await yt.game.loadData(); // must finish before the first saveData
        if (raw) Object.assign(cache, JSON.parse(raw));
      } catch (e) { console.warn('Playables loadData failed', e); }
      persist = () => yt.game.saveData(JSON.stringify(cache)).catch((e) => console.warn('Playables saveData failed', e));
      yt.system.onPause(() => emit('pause'));
      yt.system.onResume(() => emit('resume'));
      yt.system.onAudioEnabledChange((on) => emit('audio', on));
      this.audioEnabled = yt.system.isAudioEnabled();
    },
    firstFrame() { window.ytgame?.IN_PLAYABLES_ENV && window.ytgame.game.firstFrameReady(); },
    ready() { window.ytgame?.IN_PLAYABLES_ENV && window.ytgame.game.gameReady(); },
    roundEnd(score) { window.ytgame?.IN_PLAYABLES_ENV && window.ytgame.engagement.sendScore({ value: Math.round(score) }).catch(() => {}); },
  },

  // https://docs.crazygames.com — SDK v3, script tag added by the crazygames build.
  crazygames: {
    caps: { server: false, phone: false, prizes: false, fullscreen: false },
    async init() {
      localPersistence();
      this.sdk = window.CrazyGames?.SDK;
      try { await this.sdk?.init(); } catch (e) { console.warn('CrazyGames SDK init failed', e); this.sdk = null; }
    },
    roundStart() { try { this.sdk?.game.gameplayStart(); } catch { /* ignore */ } },
    roundEnd() { try { this.sdk?.game.gameplayStop(); } catch { /* ignore */ } },
    adBreak() {
      if (!this.sdk) return Promise.resolve();
      return new Promise((done) => {
        const finish = () => { emit('resume'); done(); };
        try {
          this.sdk.ad.requestAd('midgame', { adStarted: () => emit('pause'), adFinished: finish, adError: finish });
        } catch { finish(); }
      });
    },
  },

  // https://gamedistribution.com — loads the GD SDK with the game id from platform-config.js.
  gamedistribution: {
    caps: { server: false, phone: false, prizes: false, fullscreen: false },
    async init() {
      localPersistence();
      const gameId = PLATFORM_CONFIG.gameDistributionId;
      if (!gameId) { console.warn('Set gameDistributionId in js/platform-config.js'); return; }
      await new Promise((resolve) => {
        window.GD_OPTIONS = {
          gameId,
          onEvent: (event) => {
            if (event.name === 'SDK_GAME_PAUSE') emit('pause');
            if (event.name === 'SDK_GAME_START') emit('resume');
            if (event.name === 'SDK_READY') resolve();
          },
        };
        const s = document.createElement('script');
        s.src = 'https://html5.api.gamedistribution.com/main.min.js';
        s.onerror = resolve;
        document.head.appendChild(s);
        setTimeout(resolve, 4000);
      });
    },
    adBreak() {
      return window.gdsdk?.showAd ? window.gdsdk.showAd().catch(() => {}) : Promise.resolve();
    },
  },
};

const impl = adapters[target];
const noop = () => {};
let firstFrameSent = false;
let readyWaiting = false; // ready() was asked for before the first frame was drawn

export const platform = {
  name: target,
  caps: impl.caps,
  store,
  get audioEnabled() { return impl.audioEnabled !== false; },
  async init() { await impl.init(); },
  firstFrame() {
    if (firstFrameSent) return;
    firstFrameSent = true;
    (impl.firstFrame || noop).call(impl);
    if (readyWaiting) { readyWaiting = false; (impl.ready || noop).call(impl); }
  },
  // platforms need "first frame" before "ready" (YouTube rejects the other order)
  ready() {
    if (!firstFrameSent) { readyWaiting = true; return; }
    (impl.ready || noop).call(impl);
  },
  roundStart() { (impl.roundStart || noop).call(impl); },
  roundEnd(score) { (impl.roundEnd || noop).call(impl, score); },
  adBreak() { return impl.adBreak ? impl.adBreak() : Promise.resolve(); },
  onPause(cb) { handlers.pause.push(cb); },
  onResume(cb) { handlers.resume.push(cb); },
  onAudio(cb) { handlers.audio.push(cb); },
};
