import * as THREE from 'three';

// Collectible meshes in the vendor's shape (bag, can, box, coin, gift).
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

// Builds the mesh for one collectible in the vendor's shape (bag, can, box, coin, gift).
export function buildItemMesh(shape, item, tex) {
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.25, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 });
  const plain = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.35, metalness: 0.3 });
  let mesh;
  if (shape === 'can') {
    const metal = new THREE.MeshStandardMaterial({ color: '#d7dde5', roughness: 0.25, metalness: 0.9 });
    mesh = new THREE.Mesh(shapeGeo.can(), [face, metal, metal]);
    mesh.scale.setScalar(1.2);
  } else if (shape === 'coin') {
    const rim = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.25, metalness: 0.85, emissive: item.color, emissiveIntensity: 0.15 });
    // the second cap sees the texture rotated, so give it a turned copy
    const backTex = tex.clone();
    backTex.wrapS = backTex.wrapT = THREE.RepeatWrapping;
    backTex.repeat.set(-1, -1);
    backTex.needsUpdate = true;
    const back = face.clone();
    back.map = backTex;
    back.emissiveMap = backTex;
    mesh = new THREE.Mesh(shapeGeo.coin(), [rim, face, back]);
    mesh.scale.setScalar(1.25);
  } else if (shape === 'gift') {
    mesh = new THREE.Group();
    const wrap = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.15 });
    const ribbon = new THREE.MeshStandardMaterial({ color: item.accent, roughness: 0.3, metalness: 0.4 });
    mesh.add(new THREE.Mesh(shapeGeo.giftBox(), wrap));
    for (const g of [shapeGeo.ribbonA(), shapeGeo.ribbonB()]) mesh.add(new THREE.Mesh(g, ribbon));
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(shapeGeo.bow(), ribbon);
      loop.position.set(side * 0.16, 0.6, 0);
      loop.rotation.set(0, Math.PI / 2, side * 0.6);
      mesh.add(loop);
    }
    mesh.scale.setScalar(1.05);
  } else if (shape === 'box') {
    mesh = new THREE.Mesh(shapeGeo.box(), [plain, plain, plain, plain, face, face]);
    mesh.scale.setScalar(1.2);
  } else {
    mesh = new THREE.Mesh(packGeometry(), [plain, plain, plain, plain, face, face]);
    mesh.scale.setScalar(1.25);
  }
  mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return mesh;
}

const geoCache = {};
const cached = (k, make) => () => geoCache[k] || (geoCache[k] = make());
const shapeGeo = {
  can: cached('can', () => new THREE.CylinderGeometry(0.42, 0.42, 1.15, 32)),
  coin: cached('coin', () => new THREE.CylinderGeometry(0.62, 0.62, 0.16, 40).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)),
  giftBox: cached('gift', () => new THREE.BoxGeometry(1, 1, 1)),
  box: cached('box', () => new THREE.BoxGeometry(1, 1.3, 0.5)),
  ribbonA: cached('ribbonA', () => new THREE.BoxGeometry(1.04, 1.04, 0.18)),
  ribbonB: cached('ribbonB', () => new THREE.BoxGeometry(0.18, 1.04, 1.04)),
  bow: cached('bow', () => new THREE.TorusGeometry(0.17, 0.06, 8, 16)),
};
