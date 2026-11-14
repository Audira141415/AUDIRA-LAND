import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Three.js
global.THREE = {
  BoxGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} rotateX() { return this; } },
  CylinderGeometry: class { constructor() {} rotateZ() { return this; } rotateX() { return this; } setAttribute() {} computeVertexNormals() {} },
  SphereGeometry: class { constructor() {} rotateX() { return this; } setAttribute() {} computeVertexNormals() {} },
  PlaneGeometry: class { constructor() {} rotateX() { return this; } },
  Vector3: class { constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; } set(x,y,z) { this.x=x; this.y=y; this.z=z; } },
  Color: class { constructor(c) { this.c = c; } },
  MeshLambertMaterial: class { constructor(opt) { this.opt = opt; } },
  MeshBasicMaterial: class { constructor(opt) { this.opt = opt; } },
  Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.scale = { set: () => {} }; this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.rotation = { y: 0, x: 0 }; } },
  Group: class { constructor() { this.children = []; this.userData = {}; this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.rotation = { y: 0, x: 0 }; } add(c) { this.children.push(c); } }
};

try {
  const trafficPath = path.join(__dirname, '..', 'web', 'src', 'models', 'traffic_system.js').replace(/\\/g, '/');
  const { TrafficSystem } = await import(`file://${trafficPath}`);
  console.log('TrafficSystem imported successfully!');
  
  const mockScene = { add: () => {} };
  const traffic = new TrafficSystem(mockScene);
  console.log(`TrafficSystem instantiated successfully with ${traffic.vehicles.length} vehicles!`);
  
  traffic.update(0.016);
  console.log('TrafficSystem update() loop verified successfully!');
} catch (err) {
  console.error('Validation error:', err);
  process.exit(1);
}
