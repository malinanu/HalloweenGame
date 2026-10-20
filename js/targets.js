import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { SKELETONS } from './config.js';
import { buildItemMesh } from './items.js';

const DEPTH = 2.6;      // how far below ground a target hides
const RISE = 0.18;      // seconds to pop up
const SINK = 0.22;      // seconds to drop back down

// Something that pops out of a grave, waits, and sinks again unless tapped.
//   kind: 'skeleton' | 'ghost' | 'cat' | 'item'
export class SpotTarget {
  constructor(game, spot, kind, upTime, opts = {}) {
    this.game = game;
    this.spot = spot;
    this.kind = kind;
    this.upTime = upTime;
    this.t = 0;
    this.phase = 'rise';
    this.item = opts.item || null;
    this.group = new THREE.Group();
    this.group.position.copy(spot.pos).setY(-DEPTH);
    this.disposables = [];
    this.mixer = null;

    if (kind === 'skeleton' || kind === 'ghost') this.buildSkeleton(kind === 'ghost');
    else if (kind === 'cat') this.group.add(this.track(buildCat()));
    else if (kind === 'item') this.buildItem(opts.texture, opts.shape);

    // floor glow so targets read clearly from far away
    const glowColor = { skeleton: '#ff2a4a', ghost: '#40c8ff', cat: '#ffd23f', item: this.item?.color }[kind];
    const ring = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 24).rotateX(-Math.PI / 2),
      this.track(new THREE.MeshBasicMaterial({ map: game.assets.textures.light_01_a, color: glowColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    ring.position.copy(spot.pos).setY(0.09);
    this.ring = ring;
    game.scene.add(ring);
    game.scene.add(this.group);
    spot.busy = this;
  }

  track(o) {
    o.traverse?.((m) => { if (m.material) this.disposables.push(...[].concat(m.material)); });
    if (o.isMaterial) this.disposables.push(o);
    return o;
  }

  buildSkeleton(ghost) {
    const assets = this.game.assets;
    const model = ghost ? 'Skeleton_Minion' : SKELETONS[Math.floor(Math.random() * SKELETONS.length)];
    const mesh = SkeletonUtils.clone(assets.characters[model]);
    mesh.scale.setScalar(1.05);
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = !ghost;
      o.frustumCulled = false;
      if (ghost) {
        o.material = o.material.clone();
        Object.assign(o.material, { transparent: true, opacity: 0.55, depthWrite: false });
        o.material.color = new THREE.Color('#bfeaff');
        o.material.emissive = new THREE.Color('#5fd0ff');
        o.material.emissiveIntensity = 0.6;
        this.disposables.push(o.material);
      }
    });
    this.group.add(mesh);
    this.mesh = mesh;
    this.mixer = new THREE.AnimationMixer(mesh);
    const clips = assets.clips;
    const idle = clips.Idle_B || clips.Idle_A;
    if (idle) {
      const a = this.mixer.clipAction(idle);
      a.play();
      a.time = Math.random() * idle.duration;
    }
    this.hitClip = clips.Hit_A || clips.Hit_B || null;
  }

  buildItem(texture, shape) {
    const mesh = buildItemMesh(shape, this.item, texture);
    this.track(mesh);
    const holder = new THREE.Group();
    holder.position.y = 1.2;
    holder.add(mesh);
    this.spinner = mesh;
    this.shape = shape;
    const glow = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: this.game.assets.textures.light_01_a, color: this.item.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
    glow.scale.setScalar(3.2);
    holder.add(glow);
    this.group.add(holder);
  }

  // World point the player aims at (used for tap tests and effects).
  center(out = new THREE.Vector3()) {
    const h = { skeleton: 1.15, ghost: 1.6, cat: 0.55, item: 1.2 }[this.kind];
    return out.copy(this.group.position).setY(this.group.position.y + h);
  }

  get tappable() { return this.phase === 'rise' || this.phase === 'up'; }
  get reaction() { return this.phase === 'rise' ? 0 : this.t; }

  hit() {
    this.phase = 'hit';
    this.t = 0;
    if (this.hitClip && this.mixer) {
      this.mixer.stopAllAction();
      const a = this.mixer.clipAction(this.hitClip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
    }
  }

  update(dt, time) {
    this.t += dt;
    const g = this.group;
    let y = 0;
    if (this.phase === 'rise') {
      const k = Math.min(1, this.t / RISE);
      y = -DEPTH * (1 - easeOutBack(k));
      if (k >= 1) { this.phase = 'up'; this.t = 0; }
    } else if (this.phase === 'up') {
      if (this.t >= this.upTime) { this.phase = 'sink'; this.t = 0; this.escaped = true; }
    } else if (this.phase === 'sink' || this.phase === 'hit') {
      const dur = this.phase === 'hit' ? 0.32 : SINK;
      const k = Math.min(1, this.t / dur);
      y = -DEPTH * k * k;
      if (this.phase === 'hit') g.scale.set(1 + k * 0.25, 1 - k * 0.45, 1 + k * 0.25); // squashed
      if (k >= 1) this.phase = 'done';
    }
    g.position.y = y;
    if (this.kind === 'ghost') {
      g.position.y += 0.5 + Math.sin(time * 3 + this.spot.index) * 0.18;
      g.position.x = this.spot.pos.x + Math.sin(time * 2.2 + this.spot.index) * 0.45;
    }
    if (this.spinner) this.spinner.rotation.y = this.shape === 'coin' ? time * 2.4 : Math.sin(time * 1.8) * 0.6;
    if (this.kind === 'cat') this.group.children[0].userData.animate?.(time);
    this.mixer?.update(dt);
    const visible = this.phase === 'up' ? 1 : this.phase === 'rise' ? Math.min(1, this.t / RISE) : 0;
    this.ring.material.opacity = 0.55 * visible;
  }

  dispose() {
    this.game.scene.remove(this.group, this.ring);
    this.ring.geometry.dispose();
    for (const m of this.disposables) m.dispose();
    if (this.spot.busy === this) this.spot.busy = null;
  }
}

// A bat that flaps across the yard; tap it for bonus points.
export class Bat {
  constructor(game, z, dir) {
    this.game = game;
    this.kind = 'bat';
    this.phase = 'up';
    this.t = 0;
    this.dir = dir;
    this.span = game.yard.halfW + 3;
    this.duration = 2.8;
    this.z = z;
    this.group = buildBat();
    this.group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    game.scene.add(this.group);
    this.update(0, 0);
  }

  center(out = new THREE.Vector3()) { return out.copy(this.group.position); }
  get tappable() { return this.phase === 'up'; }
  get reaction() { return 0; }

  hit() { this.phase = 'hit'; this.t = 0; }

  update(dt, time) {
    this.t += dt;
    const g = this.group;
    if (this.phase === 'up') {
      const k = this.t / this.duration;
      g.position.set(-this.dir * this.span + this.dir * 2 * this.span * k, 2.8 + Math.sin(k * Math.PI * 4) * 0.5, this.z);
      if (k >= 1) { this.phase = 'done'; this.escaped = true; }
    } else if (this.phase === 'hit') {
      g.position.y -= dt * 9;
      g.rotation.z += dt * 14;
      if (this.t > 0.4) this.phase = 'done';
    }
    g.userData.animate?.(time);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); });
  }
}

// ---------------------------------------------------------------- procedural characters
function buildCat() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: '#17121f', roughness: 0.8 });
  const eye = new THREE.MeshBasicMaterial({ color: '#ffe14d' });
  const pupil = new THREE.MeshBasicMaterial({ color: '#000' });
  const pink = new THREE.MeshStandardMaterial({ color: '#ff8fb3' });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const body = add(new THREE.SphereGeometry(0.5, 16, 12), fur, 0, 0.45, 0);
  body.scale.set(0.9, 1.05, 0.8);
  const head = new THREE.Group();
  head.position.set(0, 1.1, 0.12);
  g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), fur);
  skull.castShadow = true;
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), fur);
    ear.position.set(s * 0.22, 0.32, 0);
    ear.rotation.z = -s * 0.3;
    head.add(ear);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), eye);
    e.position.set(s * 0.14, 0.05, 0.32);
    e.scale.z = 0.5;
    head.add(e);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.02), pupil);
    p.position.set(s * 0.14, 0.05, 0.37);
    head.add(p);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), pink);
  nose.position.set(0, -0.06, 0.37);
  head.add(nose);
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 16, Math.PI * 1.2), fur);
  tail.position.set(0.42, 0.55, -0.15);
  tail.rotation.set(0, Math.PI / 2, 0.6);
  g.add(tail);
  // a little heart sign so it reads as "friendly — don't tap"
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false }));
  heart.position.set(0, 1.85, 0);
  heart.scale.setScalar(0.55);
  g.add(heart);
  g.userData.animate = (t) => {
    tail.rotation.z = 0.6 + Math.sin(t * 4) * 0.35;
    head.rotation.z = Math.sin(t * 1.7) * 0.12;
    heart.position.y = 1.85 + Math.sin(t * 5) * 0.08;
  };
  return g;
}

let heartTex = null;
function heartTexture() {
  if (heartTex) return heartTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff4d7d';
  g.shadowColor = '#ff8fb3';
  g.shadowBlur = 8;
  g.beginPath();
  g.moveTo(32, 54);
  g.bezierCurveTo(4, 34, 10, 8, 32, 22);
  g.bezierCurveTo(54, 8, 60, 34, 32, 54);
  g.fill();
  heartTex = new THREE.CanvasTexture(c);
  heartTex.colorSpace = THREE.SRGBColorSpace;
  return heartTex;
}

function buildBat() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#241a33', roughness: 0.7, side: THREE.DoubleSide });
  const eye = new THREE.MeshBasicMaterial({ color: '#ff3b3b' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  body.scale.set(0.8, 0.9, 1.1);
  g.add(body);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eye);
    e.position.set(s * 0.1, 0.1, 0.3);
    g.add(e);
  }
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(1.1, 0.35);
  wingShape.lineTo(0.95, -0.05);
  wingShape.lineTo(0.7, 0.1);
  wingShape.lineTo(0.5, -0.15);
  wingShape.lineTo(0.3, 0.05);
  wingShape.lineTo(0, -0.2);
  const wingGeo = new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2);
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Mesh(wingGeo, skin);
    w.scale.x = s;
    g.add(w);
    return w;
  });
  g.userData.animate = (t) => {
    const a = Math.sin(t * 22) * 0.9;
    wings[0].rotation.z = -a; // left wing is mirrored with scale.x, so opposite angles flap both up together
    wings[1].rotation.z = a;
  };
  g.scale.setScalar(1.3);
  return g;
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
