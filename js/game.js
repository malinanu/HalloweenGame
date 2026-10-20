import * as THREE from 'three';
import { RULES, SCORING, DIFFICULTY, YARD } from './config.js';
import { VENDOR } from './vendor.js';
import { itemTexture } from './textures.js';
import { Yard } from './yard.js';
import { VFX } from './vfx.js';
import { SpotTarget, Bat } from './targets.js';
import { smashScore, comboMultiplier, totalScore } from './scoring.js';

const lerp = (a, b, k) => a + (b - a) * k;
const ramp = (r, k) => lerp(r.start, r.end, k);

export class Game {
  constructor(canvas, assets, audio, input, hooks) {
    this.canvas = canvas;
    this.assets = assets;
    this.audio = audio;
    this.input = input;
    this.hooks = hooks; // { hud, toast, flash, popup, end, insets, haptic }
    this.lowQuality = new URLSearchParams(location.search).has('low');
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.maxPixelRatio = this.mobile ? 1.5 : 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.lowQuality ? 1 : Math.min(devicePixelRatio, this.maxPixelRatio));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    this.clock = new THREE.Clock();
    this.perf = { frames: 0, time: 0 };
    this.time = 0;
    this.shake = 0;
    this.state = 'idle';
    this.labels = VENDOR.items.map((it) => itemTexture(it, VENDOR));
    this.loadItemArt();

    input.onTap = (x, y) => this.tap(x, y);
    input.onSpot = (i) => this.tapSpot(i);
    addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // Real product artwork ("image" in the vendor file) replaces the drawn label.
  loadItemArt() {
    const loader = new THREE.TextureLoader();
    VENDOR.items.forEach((it, i) => {
      if (!it.image) return;
      loader.load(it.image, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        this.labels[i] = t;
      }, undefined, () => console.warn(`Item artwork not found: ${it.image}`));
    });
  }

  layout() {
    return innerWidth >= innerHeight * 1.1 ? { ...YARD.landscape, portrait: false } : { ...YARD.portrait, portrait: true };
  }

  build() {
    this.teardown();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#1a0f2e', 60, 140);
    this.vfx = new VFX(this.scene, this.assets);
    this.yardLayout = this.layout();
    this.yard = new Yard(this.scene, this.assets, this.vfx, this.yardLayout);
    this.targets = [];
    this.spawnT = 0;
    this.batT = 2;
    this.resize();
  }

  teardown() {
    if (!this.scene) return;
    for (const t of this.targets) t.dispose();
    this.vfx.clear();
    this.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.material && !o.isSkinnedMesh) [].concat(o.material).forEach((m) => m.dispose());
    });
    this.scene = null;
  }

  // ------------------------------------------------------------ round flow
  attract() {
    this.build();
    this.state = 'attract';
  }

  start() {
    this.build();
    this.score = 0;
    this.lives = RULES.lives;
    this.timeLeft = RULES.durationSec;
    this.playTime = 0;
    this.smashes = 0;
    this.basePoints = 0;
    this.comboPoints = 0;
    this.speedPoints = 0;
    this.streak = 0;
    this.items = 0;
    this.itemCounts = Object.fromEntries(VENDOR.items.map((p) => [p.id, 0]));
    this.sets = 0;
    this.survivedSec = 0;
    this.lastSecTick = 99;
    this.state = 'countdown';
    this.countdown = 3.2;
    this.lastTick = 4;
    this.pushHud();
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'countdown') return false;
    this.resumeState = this.state;
    this.state = 'paused';
    return true;
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.resumeState;
    this.clock.getDelta();
  }

  go() {
    this.state = 'playing';
    this.spawnT = 0.3;
    this.audio.go();
    this.hooks.toast('SMASH!', 'go');
  }

  finish(reason) {
    this.state = 'over';
    const result = {
      reason,
      smashes: this.smashes,
      basePoints: this.basePoints,
      comboPoints: this.comboPoints,
      speedPoints: this.speedPoints,
      items: this.items,
      itemCounts: { ...this.itemCounts },
      sets: this.sets,
      survivedSec: reason === 'time' ? RULES.durationSec : Math.min(RULES.durationSec, Math.floor(this.playTime)),
      livesLeft: this.lives,
    };
    result.score = totalScore(result);
    this.score = result.score;
    this.pushHud();
    this.audio.gameOver(reason === 'time');
    setTimeout(() => this.hooks.end(result), reason === 'time' ? 700 : 1300);
  }

  // ------------------------------------------------------------ spawning
  // 0 at the start of a round, 1 at the end; menus use a gentle constant pace.
  get progress() {
    return this.state === 'playing' ? Math.min(1, this.playTime / RULES.durationSec) : 0.15;
  }

  spawn() {
    const k = this.progress;
    const active = this.targets.filter((t) => t instanceof SpotTarget && t.phase !== 'done').length;
    if (active >= Math.round(ramp(DIFFICULTY.maxActive, k))) return;
    const free = this.yard.spots.filter((s) => !s.busy);
    if (!free.length) return;
    const spot = free[Math.floor(Math.random() * free.length)];
    const upTime = ramp(DIFFICULTY.upTimeSec, k) * (0.85 + Math.random() * 0.3);
    const r = Math.random();
    const cat = ramp(DIFFICULTY.catChance, k);
    let target;
    if (r < cat) {
      target = new SpotTarget(this, spot, 'cat', upTime * 1.15);
    } else if (r < cat + DIFFICULTY.itemChance) {
      // pick the kind the player has fewest of, so sets stay reachable
      const items = VENDOR.items;
      const min = Math.min(...items.map((it) => this.itemCounts?.[it.id] ?? 0));
      const choices = items.filter((it) => (this.itemCounts?.[it.id] ?? 0) === min);
      const item = choices[Math.floor(Math.random() * choices.length)];
      target = new SpotTarget(this, spot, 'item', upTime * 1.25, { item, texture: this.labels[items.indexOf(item)], shape: VENDOR.item.shape });
    } else if (r < cat + DIFFICULTY.itemChance + DIFFICULTY.ghostChance) {
      target = new SpotTarget(this, spot, 'ghost', upTime * 1.1);
    } else {
      target = new SpotTarget(this, spot, 'skeleton', upTime);
    }
    this.targets.push(target);
    if (this.state === 'playing') this.audio.pop();
  }

  spawnBat() {
    const rows = this.yard.spots.filter((s) => s.x === 0).map((s) => s.pos.z);
    const z = rows[Math.floor(Math.random() * rows.length)] - 1;
    this.targets.push(new Bat(this, z, Math.random() < 0.5 ? 1 : -1));
  }

  // ------------------------------------------------------------ tapping
  // Pick the tappable target nearest to the tap on screen (generous radius for fingers).
  tap(clientX, clientY) {
    if (this.state !== 'playing') return;
    const v = new THREE.Vector3();
    let best = null;
    let bestD = Infinity;
    const scale = Math.min(1.4, Math.max(0.8, Math.min(innerWidth, innerHeight) / 500));
    for (const t of this.targets) {
      if (!t.tappable) continue;
      t.center(v).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - clientX, sy - clientY);
      const r = YARD.tapRadiusPx * scale * (t.kind === 'bat' ? 1.2 : 1);
      if (d < r && d < bestD) { best = t; bestD = d; }
    }
    if (best) this.hitTarget(best);
    else this.miss(clientX, clientY);
  }

  tapSpot(index) {
    if (this.state !== 'playing') return;
    const spot = this.yard.spots[index];
    if (spot?.busy?.tappable) this.hitTarget(spot.busy);
    else if (spot) this.miss(...this.toScreen(spot.pos));
  }

  toScreen(pos) {
    const v = pos.clone().project(this.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }

  hitTarget(t) {
    const pos = t.center();
    t.hit();
    if (t.kind === 'cat') return this.hurt(pos);
    if (t.kind === 'item') return this.collect(t, pos);

    this.streak++;
    this.smashes++;
    const pts = smashScore(SCORING[t.kind], this.streak, t.reaction);
    this.basePoints += pts.base;
    this.comboPoints += pts.combo;
    this.speedPoints += pts.speed;
    this.score += pts.total;
    const mult = comboMultiplier(this.streak);
    this.hooks.popup(`+${pts.total}${mult > 1 ? ` ×${mult}` : ''}`, pos, this.camera, t.kind === 'ghost' ? '#7fe3ff' : t.kind === 'bat' ? '#ff7a7a' : '#ffd23f');
    this.vfx.play('hit', pos, { scale: 4, fps: 40, color: t.kind === 'ghost' ? '#8fe8ff' : '#ffb36b' });
    this.vfx.burst(pos, { texture: 'spark_05_a', count: 12, color: '#ffcf6b', speed: 6, size: 0.7 });
    if (t.kind === 'ghost') this.vfx.burst(pos, { texture: 'smoke_07_a', count: 6, color: '#9be7ff', speed: 1.5, size: 1.4, gravity: 0, up: 1, additive: false, life: 0.8, grow: 1 });
    this.audio.smash(this.streak);
    this.hooks.haptic?.(14);
    this.shake = Math.max(this.shake, 0.18);
    this.pushHud();
  }

  collect(t, pos) {
    this.items++;
    this.itemCounts[t.item.id]++;
    this.score += SCORING.perItem;
    this.hooks.popup(`+${SCORING.perItem}`, pos, this.camera, t.item.color);
    this.vfx.play('star', pos, { scale: 3.6, fps: 40 });
    this.vfx.burst(pos, { texture: 'star_06_a', count: 10, color: t.item.color, speed: 4, size: 0.7 });
    this.audio.pickup(3);
    this.hooks.haptic?.(12);
    const sets = Math.min(...Object.values(this.itemCounts));
    if (sets > this.sets) {
      this.sets = sets;
      this.score += SCORING.fullSet;
      this.audio.bonus();
      this.hooks.haptic?.([20, 30, 20, 30, 40]);
      this.hooks.toast(`FULL SET${sets > 1 ? ` ×${sets}` : ''}! +${SCORING.fullSet}`, 'bonus');
      this.vfx.play('wavy', pos, { scale: 7, fps: 30 });
    }
    this.pushHud();
  }

  miss(x, y) {
    if (this.streak > 1) this.hooks.popup('MISS', this.groundAt(x, y).setY(1), this.camera, '#b9a2ff');
    this.streak = 0;
    const p = this.groundAt(x, y);
    this.vfx.burst(p.setY(0.4), { texture: 'smoke_07_a', count: 4, color: '#8d7bb0', speed: 1, size: 1, gravity: 0, up: 1, additive: false, life: 0.6, grow: 0.8 });
    this.audio.miss();
  }

  groundAt(x, y) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) || p;
  }

  hurt(pos) {
    this.lives--;
    this.streak = 0;
    this.shake = 0.6;
    this.audio.hit();
    this.audio.meow();
    this.hooks.haptic?.([80, 40, 120]);
    this.vfx.play('blood', pos, { scale: 3, fps: 30, additive: false, color: '#b388ff' });
    this.hooks.flash('hurt');
    this.hooks.toast("DON'T SMASH THE CAT!", 'hurt');
    if (this.lives <= 0) {
      this.lives = 0;
      this.finish('lives');
    }
    this.pushHud();
  }

  pushHud() {
    this.hooks.hud({
      score: this.score ?? 0,
      time: Math.max(0, this.timeLeft ?? RULES.durationSec),
      lives: this.lives ?? RULES.lives,
      flavours: this.itemCounts ? Object.keys(this.itemCounts).filter((k) => this.itemCounts[k] > this.sets) : [],
    });
  }

  // ------------------------------------------------------------ per-frame
  frame() {
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 1 / 20);
    if (!this.scene) return;
    this.watchPerformance(raw);
    if (this.state !== 'paused') this.time += dt;
    const t = this.time;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastTick && n > 0) { this.lastTick = n; this.audio.tick(); this.hooks.toast(String(n), 'count'); }
      if (this.countdown <= 0) this.go();
    }

    if (this.state === 'playing') this.updateRound(dt);
    if (this.state === 'attract' || this.state === 'playing') {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawn();
        this.spawnT = ramp(DIFFICULTY.spawnEverySec, this.progress) * (0.7 + Math.random() * 0.6);
      }
      this.batT -= dt;
      if (this.batT <= 0) { this.spawnBat(); this.batT = DIFFICULTY.batEverySec * (0.7 + Math.random() * 0.6); }
    }

    if (this.state !== 'paused') {
      for (const target of this.targets) {
        target.update(dt, t);
        if (target.escaped && this.state === 'playing' && target.kind !== 'cat' && target.kind !== 'item') {
          target.escaped = false;
          this.streak = 0; // a monster got away: combo broken
        }
      }
      this.targets = this.targets.filter((target) => {
        if (target.phase !== 'done') return true;
        target.dispose();
        return false;
      });
      this.yard.update(t);
      this.vfx.update(dt);
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateRound(dt) {
    this.playTime += dt;
    this.timeLeft -= dt;
    const survived = Math.min(RULES.durationSec, Math.floor(this.playTime));
    if (survived > this.survivedSec) {
      this.score += (survived - this.survivedSec) * SCORING.perSecondSurvived;
      this.survivedSec = survived;
    }
    const secs = Math.ceil(this.timeLeft);
    if (secs <= 5 && secs < this.lastSecTick && secs > 0) { this.lastSecTick = secs; this.audio.tick(secs === 1); }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish('time'); }
    this.pushHud();
  }

  // Drop to a lighter render path on slow devices (keeps the game playable on old phones).
  watchPerformance(raw) {
    if (this.lowQuality || this.state === 'paused') return;
    this.perf.frames++;
    this.perf.time += raw;
    if (this.perf.frames < 120) return;
    if (this.perf.time / this.perf.frames > 1 / 40) {
      this.lowQuality = true;
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.scene?.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
      this.resize();
    }
    this.perf = { frames: 0, time: 0 };
  }

  // ------------------------------------------------------------ camera
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.fitCamera();
  }

  // Frame the whole yard inside the screen area left free by the HUD.
  fitCamera() {
    if (!this.yard) return;
    const w = innerWidth, h = innerHeight;
    const { top, bottom, left = 0, right = 0 } = this.hooks.insets();
    const availH = Math.max(100, h - top - bottom);
    const availW = Math.max(100, w - left - right);
    const cam = this.camera;
    cam.clearViewOffset();
    cam.aspect = availW / availH;
    cam.fov = availW / availH < 0.75 ? 34 : 40;
    cam.updateProjectionMatrix();

    const pitch = THREE.MathUtils.degToRad(this.yardLayout.portrait ? 58 : 52);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const hw = this.yard.halfW + 0.4, hd = this.yard.halfD + 0.4;
    const pts = [];
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [0, 2.4]) pts.push(new THREE.Vector3(x, y, z));
    const target = new THREE.Vector3(0, 0, 0);
    let d = 60;
    const v = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let minX = 1, maxX = -1, minY = 1, maxY = -1;
      for (const p of pts) {
        v.copy(p).project(cam);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      const extent = Math.max((maxX - minX) / 2, (maxY - minY) / 2) / 0.96;
      target.z -= ((maxY + minY) / 2) * hd * 0.6;
      target.x += ((maxX + minX) / 2) * hw * 0.6;
      d *= extent;
    }
    this.camBase = { pos: cam.position.clone(), target: target.clone() };
    cam.setViewOffset(availW, availH, -left, -top, w, h);
    cam.updateProjectionMatrix();
  }

  updateCamera(dt) {
    if (!this.camBase) return;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const s = this.shake * this.shake * 0.8;
    this.camera.position.copy(this.camBase.pos);
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.camBase.target);
  }
}
