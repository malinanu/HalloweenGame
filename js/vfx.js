import * as THREE from 'three';
import { SHEETS } from './assets.js';

// Sprite-sheet effects (Brackeys VFX bundle) and lightweight sprite particles.
export class VFX {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.effects = [];
    this.particles = [];
  }

  sheetMaterial(name, { color = 0xffffff, additive = true, opacity = 1 } = {}) {
    const [, cols, rows] = SHEETS[name];
    const map = this.assets.textures[name].clone();
    map.repeat.set(1 / cols, 1 / rows);
    return new THREE.SpriteMaterial({
      map, color, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  static setFrame(material, name, frame) {
    const [, cols, rows] = SHEETS[name];
    const c = frame % cols;
    const r = Math.floor(frame / cols);
    material.map.offset.set(c / cols, 1 - (r + 1) / rows);
  }

  // One-shot (or looping) animated sprite sheet.
  play(name, position, { scale = 3, fps = 30, color, additive = true, loop = false, rotation = 0, parent } = {}) {
    const material = this.sheetMaterial(name, { color, additive });
    material.rotation = rotation;
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(scale, scale, scale);
    sprite.renderOrder = 10;
    (parent || this.scene).add(sprite);
    const fx = { sprite, name, fps, t: 0, loop, frames: SHEETS[name][3] };
    VFX.setFrame(material, name, 0);
    this.effects.push(fx);
    return fx;
  }

  remove(fx) {
    fx.sprite.parent?.remove(fx.sprite);
    fx.sprite.material.map.dispose();
    fx.sprite.material.dispose();
    fx.dead = true;
  }

  // Simple additive particles using the alpha textures.
  burst(position, { texture = 'spark_05_a', count = 12, color = 0xffffff, speed = 4, life = 0.7, size = 0.6, gravity = -6, up = 3, additive = true, spread = 1, grow = 0 } = {}) {
    const map = this.assets.textures[texture];
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map, color, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      material.rotation = Math.random() * Math.PI * 2;
      const s = new THREE.Sprite(material);
      s.position.copy(position);
      s.position.x += (Math.random() - 0.5) * spread * 0.5;
      s.position.z += (Math.random() - 0.5) * spread * 0.5;
      const sz = size * (0.6 + Math.random() * 0.8);
      s.scale.setScalar(sz);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.scene.add(s);
      this.particles.push({
        s, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: up * (0.5 + Math.random()),
        life, t: 0, gravity, size: sz, grow, spin: (Math.random() - 0.5) * 4,
      });
    }
  }

  update(dt) {
    for (const fx of this.effects) {
      if (fx.dead) continue;
      fx.t += dt;
      let frame = Math.floor(fx.t * fx.fps);
      if (frame >= fx.frames) {
        if (!fx.loop) { this.remove(fx); continue; }
        frame %= fx.frames;
      }
      VFX.setFrame(fx.sprite.material, fx.name, frame);
    }
    this.effects = this.effects.filter((f) => !f.dead);

    for (const p of this.particles) {
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        p.dead = true;
        continue;
      }
      p.vy += p.gravity * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.s.material.opacity = 1 - k * k;
      p.s.material.rotation += p.spin * dt;
      p.s.scale.setScalar(p.size * (1 + p.grow * k));
    }
    this.particles = this.particles.filter((p) => !p.dead);
  }

  clear() {
    for (const fx of this.effects) this.remove(fx);
    for (const p of this.particles) { this.scene.remove(p.s); p.s.material.dispose(); }
    this.effects = [];
    this.particles = [];
  }
}
