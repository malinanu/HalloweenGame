import * as THREE from 'three';
import { YARD } from './config.js';
import { pumpkinFaceTexture, radialTexture } from './textures.js';

const STONE_TINT = new THREE.Color('#c9b2ff');
const STONE_GLOW = new THREE.Color('#2b1654');
const FLOOR_TINT = new THREE.Color('#9a8db3');

// The haunted graveyard: a grid of open graves (spots) inside a low stone wall,
// with torches, pumpkins and props around it. Built from KayKit pieces + a few procedural ones.
export class Yard {
  constructor(scene, assets, vfx, layout, rng = Math.random) {
    this.scene = scene;
    this.assets = assets;
    this.vfx = vfx;
    this.rng = rng;
    this.cols = layout.cols;
    this.rows = layout.rows;
    this.S = YARD.spacing;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.animated = [];

    this.spots = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.spots.push({ index: this.spots.length, x, y, pos: this.spotPos(x, y), busy: null });
      }
    }

    this.buildLights();
    this.buildGround();
    this.buildWall();
    this.buildGraves();
    this.buildDecor();
  }

  spotPos(x, y) {
    return new THREE.Vector3((x - (this.cols - 1) / 2) * this.S, 0, (y - (this.rows - 1) / 2) * this.S);
  }

  get halfW() { return (this.cols * this.S) / 2 + 0.8; }
  get halfD() { return (this.rows * this.S) / 2 + 0.8; }

  instanced(name, transforms, { tint, emissive, castShadow = false } = {}) {
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
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  place(name, pos, { rot = 0, scale = 1 } = {}) {
    const obj = this.assets.models[name].clone();
    obj.position.copy(pos);
    obj.rotation.y = rot;
    obj.scale.setScalar(scale);
    obj.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.root.add(obj);
    return obj;
  }

  buildLights() {
    this.root.add(new THREE.HemisphereLight('#b39cff', '#2a1745', 2.1));
    const moon = new THREE.DirectionalLight('#d9ccff', 2.2);
    moon.position.set(-14, 30, -18);
    moon.castShadow = true;
    const s = Math.max(this.halfW, this.halfD) + 6;
    Object.assign(moon.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
    const size = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    moon.shadow.mapSize.set(size, size);
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.04;
    this.root.add(moon, moon.target);
    this.root.add(new THREE.AmbientLight('#4a3570', 1.0));
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#1f1430', roughness: 1 }),
    );
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.root.add(ground);

    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(this.halfW * 3.4, this.halfD * 3.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(120,70,190,0.55)', 'rgba(40,10,70,0)'), transparent: true, depthWrite: false }),
    );
    mist.position.y = -0.1;
    this.root.add(mist);

    // cobbled courtyard: KayKit 4x4 floor tiles covering the yard
    const tiles = [];
    const nx = Math.ceil((this.halfW * 2) / 4), nz = Math.ceil((this.halfD * 2) / 4);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        tiles.push({ pos: new THREE.Vector3((i - (nx - 1) / 2) * 4, 0, (j - (nz - 1) / 2) * 4), rot: Math.floor(this.rng() * 4) * Math.PI / 2 });
      }
    }
    this.instanced('floor_tile_large', tiles, { tint: FLOOR_TINT });
    this.tileHalf = { w: (nx * 4) / 2, d: (nz * 4) / 2 };
  }

  // Low stone wall around the courtyard, with pillars at the joints.
  buildWall() {
    const { w, d } = this.tileHalf;
    const walls = [];
    const pillars = [];
    const sy = 0.3;
    const segX = Math.round((w * 2) / 4), segZ = Math.round((d * 2) / 4);
    for (let i = 0; i < segX; i++) {
      const x = -w + 2 + i * 4;
      if (Math.abs(x) > 2.1) walls.push({ pos: new THREE.Vector3(x, 0, d), scale: new THREE.Vector3(1, sy, 0.7) }); // gap = gate
      walls.push({ pos: new THREE.Vector3(x, 0, -d), scale: new THREE.Vector3(1, sy, 0.7) });
    }
    for (let j = 0; j < segZ; j++) {
      const z = -d + 2 + j * 4;
      walls.push({ pos: new THREE.Vector3(-w, 0, z), rot: Math.PI / 2, scale: new THREE.Vector3(1, sy, 0.7) });
      walls.push({ pos: new THREE.Vector3(w, 0, z), rot: Math.PI / 2, scale: new THREE.Vector3(1, sy, 0.7) });
    }
    for (let i = 0; i <= segX; i++) for (const z of [-d, d]) pillars.push({ pos: new THREE.Vector3(-w + i * 4, 0, z), scale: new THREE.Vector3(0.7, 0.42, 0.7) });
    for (let j = 1; j < segZ; j++) for (const x of [-w, w]) pillars.push({ pos: new THREE.Vector3(x, 0, -d + j * 4), scale: new THREE.Vector3(0.7, 0.42, 0.7) });
    this.instanced('wall', walls, { tint: STONE_TINT, emissive: STONE_GLOW, castShadow: true });
    this.instanced('pillar', pillars, { tint: STONE_TINT, emissive: STONE_GLOW, castShadow: true });
  }

  // Each spot: an open grave (dark hole in a dirt mound) with a tombstone behind it.
  buildGraves() {
    const dirt = new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 1 });
    const hole = new THREE.MeshBasicMaterial({ color: '#07030c' });
    const stone = new THREE.MeshStandardMaterial({ color: '#8e86a8', roughness: 0.9, emissive: '#1d1433' });
    const moundGeo = new THREE.TorusGeometry(0.95, 0.28, 8, 24).rotateX(Math.PI / 2).scale(1, 0.55, 0.8);
    const holeGeo = new THREE.CircleGeometry(0.95, 24).rotateX(-Math.PI / 2).scale(1, 1, 0.8);
    const stoneGeo = tombstoneGeometry();
    for (const s of this.spots) {
      const mound = new THREE.Mesh(moundGeo, dirt);
      mound.position.copy(s.pos).setY(0.05);
      mound.receiveShadow = true;
      const h = new THREE.Mesh(holeGeo, hole);
      h.position.copy(s.pos).setY(0.07);
      const t = new THREE.Mesh(stoneGeo, stone);
      t.position.copy(s.pos).add(new THREE.Vector3((this.rng() - 0.5) * 0.3, 0, -1.15));
      t.rotation.set(-0.05 - this.rng() * 0.12, (this.rng() - 0.5) * 0.3, (this.rng() - 0.5) * 0.15);
      t.castShadow = true;
      this.root.add(mound, h, t);
    }
  }

  buildDecor() {
    const rng = this.rng;
    const { w, d } = this.tileHalf;
    const ring = [];
    const step = 3.1;
    for (let x = -w - 1.6; x <= w + 1.6; x += step) { ring.push([x, -d - 2.2]); ring.push([x, d + 2.2]); }
    for (let z = -d + 1; z <= d - 1; z += step) { ring.push([-w - 2.2, z]); ring.push([w + 2.2, z]); }

    // torches + a warm light at each corner
    for (const [x, z] of [[-w, -d], [w, -d], [-w, d], [w, d]]) {
      const pos = new THREE.Vector3(x * 1.06, 0, z * 1.06);
      this.place('torch_lit', pos.clone().setY(0.4), { scale: 1.6 });
      this.vfx.play('fire', pos.clone().setY(1.75), { scale: 1.4, loop: true, fps: 20 + rng() * 10, parent: this.root });
      const l = new THREE.PointLight('#ff8a2a', 22, 14, 1.7);
      l.position.copy(pos).setY(2.2);
      this.root.add(l);
      const ph = rng() * 10;
      this.animated.push((t) => { l.intensity = 20 + Math.sin(t * 13 + ph) * 3 + Math.sin(t * 7.3 + ph) * 2; });
    }

    ring.forEach(([x, z]) => {
      const pos = new THREE.Vector3(x + (rng() - 0.5), 0, z + (rng() - 0.5));
      // the row nearest the camera only gets low props so it never hides the graves
      if (z > d) {
        if (rng() < 0.6) this.addPumpkin(pos, 0.8 + rng() * 0.4, Math.floor(rng() * 4));
        else this.place('candle_triple', pos, { rot: rng() * 6.28, scale: 1.4 });
        return;
      }
      const r = rng();
      if (r < 0.45) this.addPumpkin(pos, 0.9 + rng() * 0.6, Math.floor(rng() * 4));
      else if (r < 0.6) this.place(rng() < 0.5 ? 'barrel_small' : 'keg', pos, { rot: rng() * 6.28, scale: 1.1 });
      else if (r < 0.7) this.place('crates_stacked', pos, { rot: rng() * 6.28, scale: 0.8 });
      else if (r < 0.85) this.place('candle_triple', pos, { rot: rng() * 6.28, scale: 1.6 });
      else this.place('rubble_half', pos, { rot: rng() * 6.28, scale: 0.9 });
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

// Rounded-top headstone with a carved cross, standing on y = 0.
function tombstoneGeometry() {
  const shape = new THREE.Shape();
  const w = 0.55, h = 0.95;
  shape.moveTo(-w, 0);
  shape.lineTo(-w, h);
  shape.absarc(0, h, w, Math.PI, 0, true);
  shape.lineTo(w, 0);
  shape.lineTo(-w, 0);
  const cross = new THREE.Path();
  const c = 0.08;
  cross.moveTo(-c, 0.55); cross.lineTo(c, 0.55); cross.lineTo(c, 0.95); cross.lineTo(0.26, 0.95); cross.lineTo(0.26, 1.1);
  cross.lineTo(c, 1.1); cross.lineTo(c, 1.3); cross.lineTo(-c, 1.3); cross.lineTo(-c, 1.1); cross.lineTo(-0.26, 1.1);
  cross.lineTo(-0.26, 0.95); cross.lineTo(-c, 0.95); cross.lineTo(-c, 0.55);
  shape.holes.push(cross);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  geo.translate(0, 0, -0.11);
  return geo;
}
