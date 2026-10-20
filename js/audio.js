// Tiny WebAudio synth: spooky music loop + sound effects. No audio files needed.
import { platform } from './platform.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;   // the player's own sound toggle (loaded after platform.init)
    this.blocked = false; // the platform has sound off (e.g. YouTube's mute)
    this.musicOn = false;
    this.step = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.silent ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
  }

  get silent() { return this.muted || this.blocked; }

  load() { this.muted = platform.store.get('smr_muted') === '1'; this.apply(); }

  setMuted(m) {
    this.muted = m;
    platform.store.set('smr_muted', m ? '1' : '0');
    this.apply();
  }

  // the platform's own sound setting always wins over the in-game toggle
  setBlocked(b) { this.blocked = b; this.apply(); }

  apply() {
    if (this.master) this.master.gain.setTargetAtTime(this.silent ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  suspend() { this.ctx?.suspend?.(); }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slide = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.3, at = 0, filter = 1200 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  pickup(combo = 0) {
    const base = 660 * Math.pow(2, Math.min(combo, 6) / 12);
    this.tone(base, 0.09, { type: 'square', vol: 0.12 });
    this.tone(base * 1.5, 0.16, { type: 'square', vol: 0.12, at: 0.07 });
    this.tone(base * 2, 0.2, { type: 'sine', vol: 0.15, at: 0.07 });
  }

  // a thwack: low thump + short noise crack, pitched up a little with the combo
  smash(combo = 1) {
    this.noise(0.12, { vol: 0.45, filter: 2400 });
    this.tone(160 * Math.pow(2, Math.min(combo, 8) / 24), 0.18, { type: 'triangle', vol: 0.35, slide: 0.45 });
    if (combo > 1) this.tone(660 * Math.pow(2, Math.min(combo, 8) / 12), 0.08, { type: 'square', vol: 0.06, at: 0.03 });
  }

  pop() { this.tone(300 + Math.random() * 120, 0.07, { type: 'sine', vol: 0.06, slide: 1.8 }); }

  miss() { this.tone(180, 0.1, { type: 'sine', vol: 0.08, slide: 0.7 }); }

  meow() {
    this.tone(700, 0.18, { type: 'sawtooth', vol: 0.07, slide: 1.4, at: 0.05 });
    this.tone(950, 0.25, { type: 'sawtooth', vol: 0.06, slide: 0.6, at: 0.22 });
  }

  bonus() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.2, at: i * 0.07 }));
  }

  hit() {
    this.noise(0.35, { vol: 0.5, filter: 900 });
    this.tone(220, 0.45, { type: 'sawtooth', vol: 0.25, slide: 0.3 });
  }

  tick(last = false) { this.tone(last ? 1320 : 880, 0.08, { type: 'square', vol: 0.1 }); }

  go() {
    this.tone(392, 0.15, { type: 'square', vol: 0.15 });
    this.tone(784, 0.4, { type: 'square', vol: 0.15, at: 0.12 });
  }

  gameOver(won) {
    const seq = won ? [523, 659, 784, 1047] : [440, 392, 349, 262];
    seq.forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.22, at: i * 0.16 }));
  }

  // Minor-key "haunted organ" loop scheduled slightly ahead of time.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextNote = this.ctx.currentTime + 0.05;
    const bpm = 128;
    const eighth = 60 / bpm / 2;
    const bass = [110, 110, 87.31, 87.31, 98, 98, 82.41, 82.41];
    const arp = [
      [440, 523.25, 659.25, 523.25], [349.23, 440, 523.25, 440],
      [392, 493.88, 587.33, 493.88], [329.63, 415.3, 493.88, 415.3],
    ];
    this.timer = setInterval(() => {
      while (this.nextNote < this.ctx.currentTime + 0.25) {
        const s = this.step;
        const bar = Math.floor(s / 8) % 4;
        const at = this.nextNote - this.ctx.currentTime;
        if (s % 4 === 0) this.tone(bass[(Math.floor(s / 4)) % 8] , eighth * 3.5, { type: 'triangle', vol: 0.35, at, dest: this.musicGain });
        this.tone(arp[bar][s % 4], eighth * 0.9, { type: 'square', vol: 0.05, at, dest: this.musicGain });
        if (s % 16 === 14) this.tone(arp[bar][2] * 2, eighth * 2, { type: 'sine', vol: 0.06, at, slide: 0.94, dest: this.musicGain });
        this.nextNote += eighth;
        this.step++;
      }
    }, 60);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }
}

