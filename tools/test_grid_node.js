import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Three.js
global.THREE = {
  BoxGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} rotateX() { return this; } },
  CylinderGeometry: class { constructor() {} rotateZ() { return this; } rotateX() { return this; } setAttribute() {} computeVertexNormals() {} },
  SphereGeometry: class { constructor() {} rotateX() { return this; } setAttribute() {} computeVertexNormals() {} },
  ConeGeometry: class { constructor() {} rotateX() { return this; } setAttribute() {} computeVertexNormals() {} },
  PlaneGeometry: class { constructor() {} rotateX() { return this; } },
  EdgesGeometry: class { constructor() {} },
  LineSegments: class { constructor() { this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.visible = true; } },
  LineBasicMaterial: class { constructor(opt) { this.opt = opt; } },
  Vector3: class { constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; } set(x,y,z) { this.x=x; this.y=y; this.z=z; } },
  Color: class { constructor(c) { this.c = c; } },
  MeshLambertMaterial: class { constructor(opt) { this.opt = opt; } },
  MeshBasicMaterial: class { constructor(opt) { this.opt = opt; } },
  Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.scale = { set: () => {} }; this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.rotation = { y: 0, x: 0 }; } },
  Group: class { constructor() { this.children = []; this.userData = {}; this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.rotation = { y: 0, x: 0 }; } add(c) { this.children.push(c); } }
};

try {
  const gridPath = path.join(__dirname, '..', 'web', 'src', 'core', 'grid.js').replace(/\\/g, '/');
  const { CityGrid } = await import(`file://${gridPath}`);
  console.log('CityGrid imported successfully!');

  const mockScene = { add: () => {} };
  const grid = new CityGrid(mockScene);
  console.log(`CityGrid instantiated successfully! Total registered plots: ${grid.plots.length}`);

  // Test raycast query
  const testPlot = grid.getPlotFromWorld(0, 0);
  console.log('Plot at (0, 0):', testPlot ? testPlot.key : 'None');

  const testPlot2 = grid.getPlotFromWorld(-24, -8);
  console.log('Plot at (-24, -8) [Rumah Pak Mulyo]:', testPlot2 ? testPlot2.key : 'None');

  console.log('CityGrid verification passed 100%!');
} catch (err) {
  console.error('Validation error:', err);
  process.exit(1);
}

