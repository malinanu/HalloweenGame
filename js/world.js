import * as THREE from 'three';
import { MAZE } from './config.js';
import { pumpkinFaceTexture, radialTexture } from './textures.js';

const WALL_TINT = new THREE.Color('#c9b2ff');
const WALL_GLOW = new THREE.Color('#2b1654');
const FLOOR_TINT = new THREE.Color('#a497bd');

// Builds the haunted dungeon maze from KayKit pieces.
export class World {
  constructor(scene, assets, vfx, maze, rng = Math.random) {
    this.scene = scene;
    this.assets = assets;
    this.vfx = vfx;
    this.maze = maze;
    this.rng = rng;
    this.C = MAZE.cell;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.animated = [];
    this.lights = [];
    this.start = { x: Math.floor(maze.cols / 2), y: maze.rows - 1 };

    this.buildLights();
    this.buildGround();
    this.buildFloor();
    this.buildWalls();
    this.buildPortal();
    this.buildDecor();
  }

  toWorld(x, y, out = new THREE.Vector3()) {
    const { cols, rows } = this.maze;
    return out.set((x - (cols - 1) / 2) * this.C, 0, (y - (rows - 1) / 2) * this.C);
  }

  get halfW() { return (this.maze.cols * this.C) / 2; }
  get halfD() { return (this.maze.rows * this.C) / 2; }

  instanced(name, transforms, { tint, emissive, castShadow = false, receiveShadow = true } = {}) {
    const src = this.assets.meshOf(name);
    const material = src.material.clone();
    if (tint) material.color.copy(tint);
    if (emissive) material.emissive = emissive.clone();
    const mesh = new THREE.InstancedMesh(src.geometry, material, transforms.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    transforms.forEach((t, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rot || 0);
      m.compose(t.pos, q, t.scale || new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    this.root.add(mesh);
    return mesh;
  }

  place(name, pos, { rot = 0, scale = 1, shadow = false } = {}) {
    const obj = this.assets.models[name].clone();
    obj.position.copy(pos);
    obj.rotation.y = rot;
    obj.scale.setScalar(scale);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; } });
    this.root.add(obj);
    return obj;
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight('#b39cff', '#2a1745', 2.1);
    this.root.add(hemi);
    const moon = new THREE.DirectionalLight('#d9ccff', 2.2);
    moon.position.set(-14, 30, -18);
    moon.castShadow = true;
    const s = Math.max(this.halfW, this.halfD) + 6;
    Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
    const size = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    moon.shadow.mapSize.set(size, size);
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.04;
    this.root.add(moon);
    this.root.add(moon.target);
    this.root.add(new THREE.AmbientLight('#4a3570', 1.0));
  }

  buildGround() {
    const size = 400;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#1f1430', roughness: 1 });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.root.add(ground);

    // A soft purple mist pool right around the maze.
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(this.halfW * 3.2, this.halfD * 3.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(120,70,190,0.55)', 'rgba(40,10,70,0)'), transparent: true, depthWrite: false }),
    );
    mist.position.y = -0.1;
    this.root.add(mist);
  }

  buildFloor() {
    const variants = { floor_tile_large: [] };
    for (const c of this.maze.cells) {
      variants.floor_tile_large.push({ pos: this.toWorld(c.x, c.y), rot: Math.floor(this.rng() * 4) * Math.PI / 2 });
    }
    // path from the portal into the maze
    const s = this.toWorld(this.start.x, this.start.y);
    variants.floor_tile_large.push({ pos: s.clone().add(new THREE.Vector3(0, 0, this.C)) });
    for (const [k, list] of Object.entries(variants)) {
      if (list.length) this.instanced(k, list, { tint: FLOOR_TINT });
    }
  }

  buildWalls() {
    const { cols, rows } = this.maze;
    const C = this.C;
    const sy = MAZE.wallScaleY;
    const walls = [];
    const vertices = new Set();
    const addWall = (x, y, vertical) => {
      // (x, y) is the vertex at the wall's start
      const pos = vertical
        ? new THREE.Vector3((x - cols / 2) * C, 0, (y + 0.5 - rows / 2) * C)
        : new THREE.Vector3((x + 0.5 - cols / 2) * C, 0, (y - rows / 2) * C);
      walls.push({ pos, rot: vertical ? Math.PI / 2 : 0, scale: new THREE.Vector3(1, sy, 1) });
      vertices.add(`${x},${y}`);
      vertices.add(vertical ? `${x},${y + 1}` : `${x + 1},${y}`);
    };
    for (const c of this.maze.cells) {
      if (c.n) addWall(c.x, c.y, false);
      if (c.w) addWall(c.x, c.y, true);
      if (c.x === cols - 1 && c.e) addWall(c.x + 1, c.y, true);
      if (c.y === rows - 1 && c.s && c.x !== this.start.x) addWall(c.x, c.y + 1, false);
    }
    this.instanced('wall', walls, { tint: WALL_TINT, emissive: WALL_GLOW, castShadow: true });

    const pillars = [...vertices].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return {
        pos: new THREE.Vector3((x - cols / 2) * C, 0, (y - rows / 2) * C),
        scale: new THREE.Vector3(0.82, sy * 1.12, 0.82),
      };
    });
    this.instanced('pillar', pillars, { tint: WALL_TINT, emissive: WALL_GLOW, castShadow: true });
  }

  buildPortal() {
    const s = this.toWorld(this.start.x, this.start.y);
    const p = s.clone().add(new THREE.Vector3(0, 1.6, this.C * 0.95));
    this.portalPos = p.clone();
    const tw = this.assets.textures.twirl_02_a;
    const mk = (color, size, speed, opacity) => {
      const m = new THREE.SpriteMaterial({ map: tw, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(m);
      sp.position.copy(p);
      sp.scale.setScalar(size);
      this.root.add(sp);
      this.animated.push((t) => { m.rotation = t * speed; });
      return sp;
    };
    mk('#39ff6a', 3.4, -2.2, 0.9);
    mk('#b6ff3b', 2.4, 3.1, 0.8);
    const glow = mk('#20ff70', 4.6, 0.6, 0.35);
    glow.material.map = this.assets.textures.light_01_a;
    const light = new THREE.PointLight('#39ff6a', 30, 12, 1.6);
    light.position.copy(p).add(new THREE.Vector3(0, 0.5, 0.5));
    this.root.add(light);
    this.animated.push((t) => { light.intensity = 26 + Math.sin(t * 5) * 6; });
    // arch pillars
    for (const dx of [-1.9, 1.9]) {
      this.place('pillar', new THREE.Vector3(p.x + dx, 0, p.z), { scale: 0.7 });
      this.place('torch_mounted', new THREE.Vector3(p.x + dx, 2.0, p.z + 0.5), { scale: 1 });
      this.vfx.play('fire', new THREE.Vector3(p.x + dx, 2.75, p.z + 0.85), { scale: 1.1, loop: true, fps: 24, parent: this.root });
    }
  }

  buildDecor() {
    const rng = this.rng;
    const hw = this.halfW, hd = this.halfD;
    const ring = [];
    const step = 3.2;
    for (let x = -hw - 2; x <= hw + 2; x += step) { ring.push([x, -hd - 2.6]); ring.push([x, hd + 2.6]); }
    for (let z = -hd + 1; z <= hd - 1; z += step) { ring.push([-hw - 2.6, z]); ring.push([hw + 2.6, z]); }

    let lightsLeft = 4;
    const lightSlots = new Set([0, Math.floor(ring.length * 0.25), Math.floor(ring.length * 0.5), Math.floor(ring.length * 0.75)]);
    ring.forEach(([x, z], i) => {
      const pos = new THREE.Vector3(x + (rng() - 0.5), 0, z + (rng() - 0.5));
      if (Math.abs(pos.x - this.portalPos.x) < 4 && pos.z > hd) return; // keep the portal clear
      const r = rng();
      if (lightSlots.has(i) || r < 0.2) {
        this.place('torch_lit', pos.clone().setY(0.4), { scale: 1.6 });
        this.vfx.play('fire', pos.clone().setY(1.75), { scale: 1.4, loop: true, fps: 20 + rng() * 10, parent: this.root });
        if (lightSlots.has(i) && lightsLeft-- > 0) {
          const l = new THREE.PointLight('#ff8a2a', 22, 14, 1.7);
          l.position.copy(pos).setY(2.2);
          this.root.add(l);
          const ph = rng() * 10;
          this.animated.push((t) => { l.intensity = 20 + Math.sin(t * 13 + ph) * 3 + Math.sin(t * 7.3 + ph) * 2; });
        }
      } else if (r < 0.55) {
        this.addPumpkin(pos, 0.9 + rng() * 0.6, Math.floor(rng() * 4));
      } else if (r < 0.7) {
        this.place(rng() < 0.5 ? 'barrel_small' : 'keg', pos, { rot: rng() * 6.28, scale: 1.1 });
      } else if (r < 0.8) {
        this.place('crates_stacked', pos, { rot: rng() * 6.28, scale: 0.8 });
      } else if (r < 0.9) {
        this.place('candle_triple', pos, { rot: rng() * 6.28, scale: 1.6 });
      } else {
        this.place('rubble_half', pos, { rot: rng() * 6.28, scale: 0.9 });
      }
    });

  }

  addPumpkin(pos, scale = 1, variant = 0) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.6, 24, 16);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = Math.atan2(v.z, v.x);
      const k = 1 + 0.07 * Math.cos(a * 8);
      p.setXYZ(i, v.x * k, v.y * 0.72, v.z * k);
    }
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#f07a12', roughness: 0.55, emissive: '#5a1d00', emissiveIntensity: 0.6 }));
    body.position.y = 0.43;
    body.castShadow = true;
    g.add(body);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.25, 6), new THREE.MeshStandardMaterial({ color: '#3d5a1b' }));
    stem.position.y = 0.9;
    stem.rotation.z = 0.25;
    g.add(stem);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.85),
      new THREE.MeshBasicMaterial({ map: pumpkinFaceTexture(variant), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    face.position.set(0, 0.45, 0.62);
    g.add(face);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.assets.textures.light_01_a, color: '#ff8a1a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.5, 0.4);
    glow.scale.setScalar(2.4);
    g.add(glow);
    const ph = this.rng() * 10;
    this.animated.push((t) => { glow.material.opacity = 0.45 + Math.sin(t * 9 + ph) * 0.1; });
    g.position.copy(pos);
    g.scale.setScalar(scale);
    g.rotation.y = (this.rng() - 0.5) * 0.6; // mostly facing the camera
    this.root.add(g);
    return g;
  }

  update(t) {
    for (const fn of this.animated) fn(t);
  }
}
