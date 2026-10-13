import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DUNGEON = 'assets/models/dungeon/';
const SKELETONS = 'assets/models/skeletons/';
const VFX = 'assets/vfx/';

export const DUNGEON_MODELS = [
  'wall', 'pillar', 'floor_tile_large', 'torch_lit', 'torch_mounted',
  'barrel_small', 'keg', 'candle_triple', 'crates_stacked', 'rubble_half',
];
const SKELETON_MODELS = ['Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage', 'Skeleton_Minion'];
const ANIMATION_FILES = ['Rig_Medium_MovementBasic', 'Rig_Medium_General'];

// name -> [file, columns, rows, frameCount]
export const SHEETS = {
  star: ['star_explosion_6x5', 6, 5, 26],
  hit: ['big_hit_6x5', 6, 5, 30],
  vortex: ['vortex_6x5', 6, 5, 25],
  fire: ['fire_point_6x5', 6, 5, 30],
  blood: ['blood_impact_6x5', 6, 5, 30],
  wavy: ['wavy_purple_6x5', 6, 5, 30],
  electric: ['electric_ring_6x5', 6, 5, 30],
};
export const PARTICLES = ['smoke_07_a', 'spark_05_a', 'light_01_a', 'magic_02_a', 'star_06_a', 'circle_05_a', 'twirl_02_a'];

export class Assets {
  constructor() {
    this.models = {};
    this.characters = {};
    this.clips = {};
    this.textures = {};
  }

  async load(onProgress = () => {}) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
    const gltf = new GLTFLoader(manager);
    const tex = new THREE.TextureLoader(manager);

    const jobs = [];
    for (const name of DUNGEON_MODELS) {
      jobs.push(gltf.loadAsync(`${DUNGEON}${name}.gltf`).then((g) => { this.models[name] = g.scene; }));
    }
    for (const name of SKELETON_MODELS) {
      jobs.push(gltf.loadAsync(`${SKELETONS}${name}.glb`).then((g) => { this.characters[name] = g.scene; }));
    }
    for (const name of ANIMATION_FILES) {
      jobs.push(gltf.loadAsync(`${SKELETONS}${name}.glb`).then((g) => {
        for (const clip of g.animations) this.clips[clip.name] = clip;
      }));
    }
    const loadTex = (key, file) => tex.loadAsync(file).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures[key] = t;
    });
    for (const [key, [file]] of Object.entries(SHEETS)) jobs.push(loadTex(key, `${VFX}${file}.png`));
    for (const p of PARTICLES) jobs.push(loadTex(p, `${VFX}${p}.png`));

    await Promise.all(jobs);
    return this;
  }

  // First mesh inside a single-mesh KayKit model (geometry + material) for instancing.
  meshOf(name) {
    let found = null;
    this.models[name].traverse((o) => { if (!found && o.isMesh) found = o; });
    return found;
  }
}
