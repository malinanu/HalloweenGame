import * as THREE from 'three';
import { RULES, SCORING, MONSTERS, MAZE, PLAYER_SPEED } from './config.js';
import { VENDOR } from './vendor.js';
import { itemTexture } from './textures.js';
import { Maze } from './maze.js';
import { World } from './world.js';
import { VFX } from './vfx.js';
import { Player, Monster, Pack } from './entities.js';
import { packScore, comboMultiplier, totalScore } from './scoring.js';

const HIT_RADIUS = 1.55;
const PICK_RADIUS = 1.7;

export class Game {
  constructor(canvas, assets, audio, input, hooks) {
    this.canvas = canvas;
    this.assets = assets;
    this.audio = audio;
    this.input = input;
    this.hooks = hooks; // { hud(state), toast(text, kind), flash(kind), end(result), insets() }
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.lowQuality = new URLSearchParams(location.search).has('low');
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.maxPixelRatio = this.mobile ? 1.5 : 2; // phones: sharp enough, much cheaper to fill
    this.renderer.setPixelRatio(this.lowQuality ? 1 : Math.min(devicePixelRatio, this.maxPixelRatio));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.perf = { frames: 0, time: 0 };
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.shake = 0;
    this.state = 'idle';
    this.labels = VENDOR.items.map((it) => itemTexture(it, VENDOR));
    this.loadItemArt();

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
    if (innerWidth >= innerHeight * 1.1) return { ...MAZE.landscape, portrait: false };
    // Tall phones get extra rows so the maze fills the screen height (cell size stays the same).
    const { cols, rows } = MAZE.portrait;
    const ratio = (innerHeight - 140) / innerWidth;
    const fit = Math.max(rows, Math.min(MAZE.portraitMaxRows, Math.floor(ratio * cols * 1.05)));
    return { cols, rows: fit, portrait: true };
  }

  // More maze, more packs on screen at once.
  get activePacks() {
    return Math.max(RULES.activePacks, Math.round(this.maze.cells.length / 8));
  }

  build(mode) {
    this.teardown();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#1a0f2e', 60, 140);
    this.vfx = new VFX(this.scene, this.assets);
    this.mazeLayout = this.layout();
    const { cols, rows } = this.mazeLayout;
    this.maze = new Maze(cols, rows).generate(MAZE.extraOpenings);
    this.world = new World(this.scene, this.assets, this.vfx, this.maze);
    this.player = new Player(this.world, PLAYER_SPEED);
    this.monsters = [];
    this.packs = [];
    this.pendingPacks = [];
    this.spawnMonsters();
    this.mode = mode;
    this.player.setVisible(mode !== 'attract');
    if (mode === 'attract') {
      for (let i = 0; i < this.activePacks; i++) this.spawnPack();
    }
    this.resize();
  }

  teardown() {
    if (!this.scene) return;
    this.vfx.clear();
    this.scene.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.material && !o.isSkinnedMesh) [].concat(o.material).forEach((m) => m.dispose());
    });
    this.scene = null;
  }

  spawnMonsters() {
    const dist = this.maze.distances(this.world.start.x, this.world.start.y);
    const cells = this.maze.cells.filter((c) => dist[c.y * this.maze.cols + c.x] >= 5);
    // spread spawns over the far half of the maze
    cells.sort((a, b) => dist[b.y * this.maze.cols + b.x] - dist[a.y * this.maze.cols + a.x]);
    const used = new Set();
    MONSTERS.forEach((def, i) => {
      let c = cells[Math.floor((i / MONSTERS.length) * cells.length * 0.7)] || cells[0];
      for (const alt of cells) {
        if (!used.has(alt) && Math.abs(alt.x - c.x) + Math.abs(alt.y - c.y) < 3 && ![...used].some((u) => Math.abs(u.x - alt.x) + Math.abs(u.y - alt.y) < 2)) { c = alt; break; }
      }
      used.add(c);
      this.monsters.push(new Monster(this.world, def, c.x, c.y));
    });
  }

  // Pick a free cell for a new pack, keeping the five flavours balanced.
  spawnPack() {
    const taken = new Set(this.packs.map((p) => `${p.x},${p.y}`));
    const px = this.player.mover.cellX, py = this.player.mover.cellY;
    const free = this.maze.cells.filter((c) => !taken.has(`${c.x},${c.y}`) && Math.abs(c.x - px) + Math.abs(c.y - py) > 2);
    if (!free.length) return;
    const c = free[Math.floor(Math.random() * free.length)];
    const items = VENDOR.items;
    const counts = items.map((p) => this.packs.filter((k) => k.product === p).length);
    const min = Math.min(...counts);
    const choices = items.map((p, i) => i).filter((i) => counts[i] === min);
    const pi = choices[Math.floor(Math.random() * choices.length)];
    const pack = new Pack(this.world, items[pi], c.x, c.y, this.labels[pi], VENDOR.item.shape);
    pack.bornAt = this.playTime || 0;
    this.packs.push(pack);
    this.vfx.burst(pack.group.position.clone(), { texture: 'star_06_a', count: 6, color: items[pi].color, speed: 2, size: 0.7, up: 1, gravity: 0, life: 0.6 });
  }

  // ------------------------------------------------------------ round flow
  attract() {
    this.build('attract');
    this.state = 'attract';
  }

  start() {
    this.build('play');
    this.score = 0;
    this.lives = RULES.lives;
    this.timeLeft = RULES.durationSec;
    this.playTime = 0;          // seconds since GO
    this.collected = 0;
    this.flavourCounts = Object.fromEntries(VENDOR.items.map((p) => [p.id, 0]));
    this.sets = 0;              // complete sets of all five kinds of item
    this.packPoints = 0;
    this.comboPoints = 0;
    this.speedPoints = 0;
    this.streak = 0;            // packs in the current combo
    this.lastPickAt = -99;
    this.nearMisses = 0;
    this.near = new Map();      // monster -> { inside, lastAward }
    this.survivedSec = 0;
    this.lastSecTick = 99;
    this.invuln = 0;
    this.input.reset();
    this.state = 'countdown';
    this.countdown = 3.2;
    this.lastTick = 4;
    this.player.setVisible(false);
    this.vfx.play('vortex', this.world.portalPos.clone(), { scale: 6, fps: 30, color: '#7dffb0' });
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

  enterMaze() {
    this.state = 'playing';
    this.player.setVisible(true);
    const p = this.player.mesh.position.clone().setY(1.2);
    this.vfx.play('electric', p, { scale: 4, color: '#9dffb8' });
    this.vfx.burst(p, { texture: 'magic_02_a', count: 14, color: '#6dff9a', speed: 3, size: 0.8, up: 2, gravity: -2 });
    for (let i = 0; i < this.activePacks; i++) this.spawnPack();
    this.audio.go();
    this.hooks.toast('GO!', 'go');
  }

  finish(reason) {
    this.state = 'over';
    const survivedSec = reason === 'time' ? RULES.durationSec : Math.min(RULES.durationSec, Math.floor(this.playTime));
    const result = {
      reason,
      packs: this.collected,
      flavourCounts: { ...this.flavourCounts },
      packPoints: this.packPoints,
      comboPoints: this.comboPoints,
      speedPoints: this.speedPoints,
      nearMisses: this.nearMisses,
      sets: this.sets,
      survivedSec,
      livesLeft: this.lives,
    };
    result.score = totalScore(result);
    this.score = result.score;
    this.pushHud();
    this.audio.gameOver(reason === 'time');
    setTimeout(() => this.hooks.end(result), reason === 'time' ? 700 : 1300);
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
      if (this.countdown <= 0) this.enterMaze();
    }

    const live = this.state === 'playing' || this.state === 'attract' || this.state === 'countdown' || this.state === 'over';
    if (live) {
      const moving = this.state === 'playing';
      if (moving) {
        this.player.wanted = this.input.wanted;
        this.player.update(dt, t);
        this.updateRound(dt);
      }
      const pc = { x: this.player.mover.cellX, y: this.player.mover.cellY };
      if (!this.distT || this.distT <= 0) {
        this.distMap = this.state === 'attract' ? null : this.maze.distances(pc.x, pc.y);
        this.distT = 0.2;
      }
      this.distT -= dt;
      const monsterDt = this.state === 'countdown' ? 0 : this.state === 'over' ? dt * 0.3 : dt;
      for (const m of this.monsters) m.update(monsterDt, this.distMap, pc);
      for (const p of this.packs) p.update(dt, t);
      this.world.update(t);
      this.vfx.update(dt);
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
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

  updateRound(dt) {
    this.timeLeft -= dt;
    const secs = Math.ceil(this.timeLeft);
    if (secs <= 5 && secs < (this.lastSecTick ?? 99) && secs > 0) { this.lastSecTick = secs; this.audio.tick(secs === 1); }
    this.playTime += dt;
    // survival points tick up live, one second at a time
    const survived = Math.min(RULES.durationSec, Math.floor(this.playTime));
    if (survived > this.survivedSec) {
      this.score += (survived - this.survivedSec) * SCORING.perSecondSurvived;
      this.survivedSec = survived;
    }

    // pick-ups
    const pp = this.player.mesh.position;
    for (const pack of this.packs) {
      const g = pack.group.position;
      if (Math.hypot(g.x - pp.x, g.z - pp.z) < PICK_RADIUS) this.collect(pack);
    }
    this.packs = this.packs.filter((p) => !p.taken);
    this.pendingPacks = this.pendingPacks.filter((s) => {
      s.t -= dt;
      if (s.t <= 0) { this.spawnPack(); return false; }
      return true;
    });

    // monsters
    this.invuln = Math.max(0, this.invuln - dt);
    this.player.mesh.visible = this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0;
    for (const m of this.monsters) {
      const mp = m.mesh.position;
      const d = Math.hypot(mp.x - pp.x, mp.z - pp.z);
      if (this.invuln <= 0 && d < HIT_RADIUS) { this.hurt(m); break; }
      this.checkNearMiss(m, d);
    }

    if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish('time'); }
    this.pushHud();
  }

  collect(pack) {
    pack.taken = true;
    const pos = pack.group.position.clone();
    pack.dispose();
    const now = this.playTime;
    this.streak = now - this.lastPickAt <= SCORING.comboWindowSec ? this.streak + 1 : 1;
    this.lastPickAt = now;
    const pts = packScore(this.streak, now - pack.bornAt);
    this.collected++;
    this.packPoints += pts.total;
    this.comboPoints += pts.combo;
    this.speedPoints += pts.speed;
    this.score += pts.total;
    this.flavourCounts[pack.product.id]++;
    this.audio.pickup(this.streak);
    this.hooks.haptic?.(12);
    this.vfx.play('star', pos, { scale: 3.6, fps: 40, additive: true });
    this.vfx.burst(pos, { texture: 'spark_05_a', count: 10, color: pack.product.color, speed: 5, size: 0.7 });
    const mult = comboMultiplier(this.streak);
    this.hooks.popup(`+${pts.total}${mult > 1 ? ` ×${mult}` : ''}`, pos, this.camera, pack.product.color);

    const sets = Math.min(...Object.values(this.flavourCounts));
    if (sets > this.sets) {
      this.sets = sets;
      this.score += SCORING.fullSet;
      this.audio.bonus();
      this.hooks.haptic?.([20, 30, 20, 30, 40]);
      this.hooks.toast(`FULL SET${sets > 1 ? ` ×${sets}` : ''}! +${SCORING.fullSet}`, 'bonus');
      this.vfx.play('wavy', this.player.mesh.position.clone().setY(1.2), { scale: 7, fps: 30 });
    }
    this.pendingPacks.push({ t: RULES.packRespawnSec });
  }

  // A near miss is scored when a skeleton gets close and then moves away without touching you.
  checkNearMiss(monster, dist) {
    let n = this.near.get(monster);
    if (!n) this.near.set(monster, (n = { inside: false, lastAward: -99 }));
    if (dist < SCORING.nearMissRadius) {
      if (this.invuln <= 0) n.inside = true;
      return;
    }
    if (!n.inside) return;
    n.inside = false;
    if (this.playTime - n.lastAward < SCORING.nearMissCooldownSec) return;
    n.lastAward = this.playTime;
    this.nearMisses++;
    this.score += SCORING.nearMiss;
    this.hooks.haptic?.(8);
    this.hooks.popup(`NEAR MISS +${SCORING.nearMiss}`, this.player.mesh.position.clone().setY(2.2), this.camera, '#7dffb0');
  }

  hurt(monster) {
    for (const n of this.near.values()) n.inside = false;
    this.lives--;
    this.invuln = RULES.invulnerableSec;
    this.shake = 0.6;
    this.audio.hit();
    this.hooks.haptic?.([80, 40, 120]);
    const p = this.player.mesh.position.clone().setY(1.3);
    this.vfx.play('hit', p, { scale: 5, fps: 36, color: '#ff6a6a' });
    this.vfx.play('blood', p.clone().setY(1.6), { scale: 3, fps: 30, additive: false, color: '#b388ff' });
    this.vfx.burst(p, { texture: 'smoke_07_a', count: 6, color: '#9b6bff', speed: 1.5, size: 1.6, gravity: 0, up: 1, additive: false, life: 0.9, grow: 1 });
    this.hooks.flash('hurt');
    this.hooks.toast(`${monster.def.name.toUpperCase()} GOT YOU!`, 'hurt');
    if (this.lives <= 0) {
      this.lives = 0;
      this.player.mesh.visible = false;
      this.vfx.play('vortex', p, { scale: 5, fps: 30, color: '#ff7070' });
      this.finish('caught');
    }
    this.pushHud();
  }

  pushHud() {
    this.hooks.hud({ score: this.score ?? 0, time: Math.max(0, this.timeLeft ?? RULES.durationSec), lives: this.lives ?? RULES.lives, flavours: this.flavourCounts ? Object.keys(this.flavourCounts).filter((k) => this.flavourCounts[k] > this.sets) : [] });
  }

  // ------------------------------------------------------------ camera
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.fitCamera();
  }

  fitCamera() {
    if (!this.world) return;
    const w = innerWidth, h = innerHeight;
    const { top, bottom, left = 0, right = 0 } = this.hooks.insets();
    const availH = Math.max(100, h - top - bottom);
    const availW = Math.max(100, w - left - right);
    const cam = this.camera;
    cam.clearViewOffset();
    cam.aspect = availW / availH;
    cam.fov = availW / availH < 0.75 ? 34 : 40;
    cam.updateProjectionMatrix();

    const pitch = THREE.MathUtils.degToRad(this.mazeLayout.portrait ? 62 : 58);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const hw = this.world.halfW + 0.6, hd = this.world.halfD + 0.6;
    const wallH = 4 * MAZE.wallScaleY;
    const pts = [];
    for (const x of [-hw, hw]) for (const z of [-hd, hd + MAZE.cell * 1.1]) for (const y of [0, wallH]) pts.push(new THREE.Vector3(x, y, z));
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
