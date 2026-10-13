import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { DIRS } from './maze.js';
import { packLabelTexture } from './textures.js';

// Moves along the maze grid, cell centre to cell centre (Pac-Man style).
export class GridMover {
  constructor(world, x, y, speed) {
    this.world = world;
    this.maze = world.maze;
    this.x = x; this.y = y;          // cell we are leaving / standing on
    this.dir = null;                  // heading, one of n/e/s/w
    this.speed = speed;
    this.pos = world.toWorld(x, y);
  }

  get cellX() { return this.dir ? Math.round(this.x + DIRS[this.dir].dx * this.progress()) : this.x; }
  get cellY() { return this.dir ? Math.round(this.y + DIRS[this.dir].dy * this.progress()) : this.y; }

  progress() {
    const c = this.world.toWorld(this.x, this.y, _v);
    return Math.min(1, Math.hypot(this.pos.x - c.x, this.pos.z - c.z) / this.world.C);
  }

  // `decide(mover)` is asked for a heading every time we reach a cell centre.
  step(dt, decide, wanted = null) {
    let remaining = this.speed * dt;
    let guard = 8;
    while (remaining > 1e-6 && guard--) {
      if (this.dir && wanted === DIRS[this.dir].opp) {
        // instant reversal mid-corridor
        this.x += DIRS[this.dir].dx;
        this.y += DIRS[this.dir].dy;
        this.dir = wanted;
      }
      if (!this.dir) {
        const d = decide(this);
        if (!d || !this.maze.open(this.x, this.y, d)) return;
        this.dir = d;
      }
      const tx = this.x + DIRS[this.dir].dx, ty = this.y + DIRS[this.dir].dy;
      const target = this.world.toWorld(tx, ty, _t);
      const dist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
      if (remaining >= dist) {
        this.pos.x = target.x; this.pos.z = target.z;
        this.x = tx; this.y = ty;
        remaining -= dist;
        const d = decide(this);
        this.dir = d && this.maze.open(tx, ty, d) ? d : null;
      } else {
        this.pos.x += DIRS[this.dir].dx * remaining;
        this.pos.z += DIRS[this.dir].dy * remaining;
        remaining = 0;
      }
    }
  }
}
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

// ---------------------------------------------------------------- player
export class Player {
  constructor(world, speed) {
    this.world = world;
    this.mover = new GridMover(world, world.start.x, world.start.y, speed);
    this.wanted = null;
    this.facing = 0;
    this.walkT = 0;
    this.mesh = buildKid();
    this.mesh.position.copy(this.mover.pos);
    world.root.add(this.mesh);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: world.assets.textures.light_01_a, color: '#ffb347', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.position.y = 0.06;
    this.mesh.add(glow);
    this.lantern = new THREE.PointLight('#ffb466', 14, 9, 1.4);
    this.lantern.position.set(0, 2.2, 0.4);
    this.mesh.add(this.lantern);
  }

  update(dt, t) {
    const m = this.mover;
    m.step(dt, (mv) => {
      if (this.wanted && mv.maze.open(mv.x, mv.y, this.wanted)) return this.wanted;
      if (mv.dir && mv.maze.open(mv.x, mv.y, mv.dir)) return mv.dir;
      return null;
    }, this.wanted);
    this.mesh.position.x = m.pos.x;
    this.mesh.position.z = m.pos.z;
    const moving = !!m.dir;
    if (moving) {
      const target = Math.atan2(DIRS[m.dir].dx, DIRS[m.dir].dy);
      this.facing = lerpAngle(this.facing, target, Math.min(1, dt * 14));
      this.walkT += dt * 13;
    } else {
      this.walkT *= 0.85;
    }
    this.mesh.rotation.y = this.facing;
    const p = this.mesh.userData.parts;
    const sw = Math.sin(this.walkT) * (moving ? 0.8 : 0);
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8;
    p.body.position.y = moving ? Math.abs(Math.sin(this.walkT)) * 0.12 : Math.sin(t * 2) * 0.03;
  }

  setVisible(v) { this.mesh.visible = v; }
}

function buildKid() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const orange = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#28304a', roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: '#f4c194', roughness: 0.7 });
  const black = new THREE.MeshBasicMaterial({ color: '#111' });
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const scale = 1.45;
  root.scale.setScalar(scale);
  const legPivot = (x) => {
    const g = new THREE.Group();
    g.position.set(x, 0.62, 0);
    body.add(g);
    add(g, new THREE.CapsuleGeometry(0.11, 0.38, 4, 8), dark, 0, -0.3, 0);
    add(g, new THREE.BoxGeometry(0.2, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: '#3b2314' }), 0, -0.56, 0.05);
    return g;
  };
  const legL = legPivot(-0.14), legR = legPivot(0.14);
  add(body, new THREE.CapsuleGeometry(0.3, 0.42, 6, 12), orange, 0, 0.98, 0);
  const armPivot = (x) => {
    const g = new THREE.Group();
    g.position.set(x, 1.22, 0);
    body.add(g);
    add(g, new THREE.CapsuleGeometry(0.09, 0.36, 4, 8), orange, 0, -0.22, 0);
    add(g, new THREE.SphereGeometry(0.09, 8, 6), skin, 0, -0.46, 0);
    return g;
  };
  const armL = armPivot(-0.38), armR = armPivot(0.38);
  add(body, new THREE.SphereGeometry(0.3, 20, 14), skin, 0, 1.6, 0.02);
  const hood = add(body, new THREE.SphereGeometry(0.36, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.72), orange, 0, 1.62, -0.04);
  hood.rotation.x = -1.05;
  add(body, new THREE.SphereGeometry(0.045, 8, 6), black, -0.1, 1.64, 0.28);
  add(body, new THREE.SphereGeometry(0.045, 8, 6), black, 0.1, 1.64, 0.28);
  // trick-or-treat pumpkin bucket
  const bucket = add(armR, new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: '#ff8c1a', emissive: '#7a2c00' }), 0.05, -0.62, 0.05);
  bucket.scale.y = 0.85;
  root.userData.parts = { body, legL, legR, armL, armR };
  return root;
}

// ---------------------------------------------------------------- monsters
export class Monster {
  constructor(world, def, x, y) {
    this.world = world;
    this.def = def;
    this.mover = new GridMover(world, x, y, def.speed);
    this.mesh = SkeletonUtils.clone(world.assets.characters[def.model]);
    this.mesh.scale.setScalar(1.12);
    this.mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      if (def.tint === 'ghost') {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
        o.material.color = new THREE.Color('#bfeaff');
        o.material.emissive = new THREE.Color('#5fd0ff');
        o.material.emissiveIntensity = 0.6;
        o.material.depthWrite = false;
        o.castShadow = false;
      }
    });
    this.mesh.position.copy(this.mover.pos);
    world.root.add(this.mesh);

    this.mixer = new THREE.AnimationMixer(this.mesh);
    const clips = world.assets.clips;
    const runClip = def.speed > 3.5 ? clips.Running_A : clips.Walking_A || clips.Running_A;
    this.run = this.mixer.clipAction(runClip);
    this.run.timeScale = def.speed / 3.2;
    this.run.play();
    this.run.time = Math.random() * runClip.duration;
    this.idle = clips.Idle_A ? this.mixer.clipAction(clips.Idle_A) : null;

    const ring = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: world.assets.textures.light_01_a, color: def.tint === 'ghost' ? '#40c8ff' : '#ff2a4a', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.position.y = 0.07;
    this.mesh.add(ring);
    this.facing = 0;
    this.lastDir = null;
    this.trailT = 0;
  }

  update(dt, distMap, playerCell) {
    const m = this.mover;
    const maze = this.world.maze;
    m.step(dt, (mv) => {
      const options = maze.openDirs(mv.x, mv.y);
      if (!options.length) return null;
      const back = mv.dir ? DIRS[mv.dir].opp : this.lastDir ? DIRS[this.lastDir].opp : null;
      const forward = options.filter((d) => d !== back);
      const pool = forward.length ? forward : options;
      let choice;
      if (distMap && Math.random() < this.def.chase) {
        let best = Infinity;
        for (const d of pool) {
          const k = (mv.y + DIRS[d].dy) * maze.cols + (mv.x + DIRS[d].dx);
          const v = distMap[k] + Math.random() * 0.5;
          if (v < best) { best = v; choice = d; }
        }
      } else {
        choice = pool[Math.floor(Math.random() * pool.length)];
      }
      this.lastDir = choice;
      return choice;
    });
    this.mesh.position.x = m.pos.x;
    this.mesh.position.z = m.pos.z;
    if (m.dir) {
      const target = Math.atan2(DIRS[m.dir].dx, DIRS[m.dir].dy);
      this.facing = lerpAngle(this.facing, target, Math.min(1, dt * 10));
    }
    this.mesh.rotation.y = this.facing;
    if (this.def.tint === 'ghost') this.mesh.position.y = 0.35 + Math.sin(performance.now() / 300) * 0.2;
    this.mixer.update(dt);
  }
}

// ---------------------------------------------------------------- savoury packs
const packGeoCache = { geo: null };
function packGeometry() {
  if (packGeoCache.geo) return packGeoCache.geo;
  const w = 1, h = 1.4, d = 0.42;
  const geo = new THREE.BoxGeometry(w, h, d, 6, 14, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / (h / 2);
    const pinch = 1 - Math.pow(Math.abs(y), 5);
    p.setZ(i, p.getZ(i) * Math.max(0.05, pinch));
    p.setX(i, p.getX(i) * (1 + (1 - pinch) * 0.06));
  }
  geo.computeVertexNormals();
  packGeoCache.geo = geo;
  return geo;
}

export class Pack {
  constructor(world, product, x, y, labelTexture) {
    this.world = world;
    this.product = product;
    this.x = x; this.y = y;
    const side = new THREE.MeshStandardMaterial({ color: product.color, roughness: 0.35, metalness: 0.3 });
    const face = new THREE.MeshStandardMaterial({ map: labelTexture, roughness: 0.35, metalness: 0.25, emissive: '#ffffff', emissiveMap: labelTexture, emissiveIntensity: 0.25 });
    this.group = new THREE.Group();
    const bag = new THREE.Mesh(packGeometry(), [side, side, side, side, face, face]);
    bag.castShadow = true;
    bag.scale.setScalar(1.25);
    this.bag = bag;
    this.group.add(bag);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: world.assets.textures.light_01_a, color: product.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(3.4);
    glow.position.y = -0.2;
    this.group.add(glow);
    this.group.position.copy(world.toWorld(x, y));
    this.group.position.y = 1.4;
    this.phase = Math.random() * 10;
    this.spawnT = 0;
    world.root.add(this.group);
  }

  update(dt, t) {
    this.spawnT = Math.min(1, this.spawnT + dt * 3);
    const s = easeOutBack(this.spawnT);
    this.group.scale.setScalar(Math.max(0.001, s));
    this.bag.rotation.y = Math.sin(t * 1.6 + this.phase) * 0.6;
    this.group.position.y = 1.4 + Math.sin(t * 3 + this.phase) * 0.18;
  }

  dispose() {
    this.world.root.remove(this.group);
    this.group.traverse((o) => {
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export { packLabelTexture };
