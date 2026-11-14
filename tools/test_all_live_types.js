import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Three.js
global.THREE = {
  BoxGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} rotateX() { return this; } },
  CylinderGeometry: class { constructor() {} rotateZ() { return this; } rotateX() { return this; } setAttribute() {} computeVertexNormals() {} },
  ConeGeometry: class { constructor() {} rotateY() { return this; } scale() { return this; } setAttribute() {} computeVertexNormals() {} },
  SphereGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} },
  PlaneGeometry: class { constructor() {} rotateX() { return this; } },
  BufferGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} },
  Float32BufferAttribute: class { constructor() {} },
  EdgesGeometry: class { constructor() {} },
  LineSegments: class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { set: () => {}, y: 0 }; } },
  LineBasicMaterial: class { constructor(opt) { this.opt = opt; } },
  Color: class { constructor(c) { this.c = c; } },
  MeshLambertMaterial: class { constructor(opt) { this.opt = opt; } },
  MeshBasicMaterial: class { constructor(opt) { this.opt = opt; } },
  SpriteMaterial: class { constructor(opt) { this.opt = opt; } },
  Sprite: class { constructor() { this.position = { set: () => {} }; this.scale = { set: () => {} }; } },
  CanvasTexture: class { constructor() {} },
  Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.scale = { set: () => {} }; this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.rotation = { y: 0, x: 0 }; } },
  Group: class { constructor() { this.children = []; this.userData = {}; this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.rotation = { y: 0, x: 0 }; } add(c) { this.children.push(c); } }
};

global.document = {
  createElement: () => ({
    width: 256,
    height: 128,
    getContext: () => ({
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {}
    })
  })
};

const loaderPath = path.join(__dirname, '..', 'web', 'src', 'models', 'building_loader.js').replace(/\\/g, '/');
const { BuildingLoader } = await import(`file://${loaderPath}`);

const mockScene = { add: () => {} };
const loader = new BuildingLoader(mockScene);

const types = ['apartemen', 'bank', 'barak', 'ibadah', 'istana', 'kafe', 'kantor', 'kos', 'lahan_material', 'lapangan', 'mulyo', 'pabrik', 'pangkalan', 'pasar', 'penjara', 'pkl', 'pln', 'polisi', 'posko', 'proyek_gedung', 'proyek_rumah', 'rs', 'ruko', 'rumah', 'rumah2', 'sawah', 'sekolah', 'stadion', 'taman', 'terminal', 'toko', 'tugu', 'waduk', 'warung'];

console.log(`Testing all ${types.length} types in BuildingLoader...`);
let okCount = 0;
for (const t of types) {
  try {
    const mesh = loader.createBuildingMeshByType(t);
    const meta = loader.getBuildingMeta(t);
    okCount++;
  } catch (err) {
    console.error(`Error on ${t}:`, err.message);
  }
}
console.log(`Passed: ${okCount} / ${types.length} types!`);


