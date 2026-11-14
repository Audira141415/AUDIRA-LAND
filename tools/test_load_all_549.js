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

// Mock document
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

try {
  const dataPath = path.join(__dirname, '..', 'web', 'public', 'data', 'live_buildings.json');
  const buildings = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Loaded ${buildings.length} buildings from live_buildings.json.`);

  const loaderPath = path.join(__dirname, '..', 'web', 'src', 'models', 'building_loader.js').replace(/\\/g, '/');
  const { BuildingLoader } = await import(`file://${loaderPath}`);
  
  const mockScene = { add: () => {} };
  const loader = new BuildingLoader(mockScene);

  console.time('Load 549 Buildings');
  loader.loadBuildings(buildings);
  console.timeEnd('Load 549 Buildings');

  console.log(`Total loaded buildings in BuildingLoader: ${loader.loadedBuildings.size}`);
  
  let totalParts = 0;
  for (const [id, item] of loader.loadedBuildings) {
    if (item.mesh && item.mesh.children) {
      totalParts += item.mesh.children.length;
    }
  }
  console.log(`Total 3D mesh parts rendered: ${totalParts}`);
  console.log('Test completed successfully!');
} catch (err) {
  console.error('Validation error:', err);
  process.exit(1);
}

