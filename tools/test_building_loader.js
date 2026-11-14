import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Three.js
global.THREE = {
  BoxGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} },
  CylinderGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} },
  ConeGeometry: class { constructor() {} rotateY() { return this; } scale() { return this; } setAttribute() {} computeVertexNormals() {} },
  SphereGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} },
  BufferGeometry: class { constructor() {} setAttribute() {} computeVertexNormals() {} },
  Float32BufferAttribute: class { constructor() {} },
  Color: class { constructor(c) { this.c = c; } },
  MeshLambertMaterial: class { constructor(opt) { this.opt = opt; } },
  MeshBasicMaterial: class { constructor(opt) { this.opt = opt; } },
  Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.scale = { set: () => {} }; this.position = { set: () => {} }; this.rotation = {}; } },
  Group: class { constructor() { this.children = []; this.userData = {}; } add(c) { this.children.push(c); } position = { set: () => {} } }
};

try {
  const loaderPath = path.join(__dirname, '..', 'web', 'src', 'models', 'building_loader.js').replace(/\\/g, '/');
  const { BuildingLoader } = await import(`file://${loaderPath}`);
  console.log('BuildingLoader imported successfully!');
  
  const mockScene = { add: () => {} };
  const loader = new BuildingLoader(mockScene);
  console.log('BuildingLoader instantiated successfully!');
  
  // Test building mesh creation for several Netizenia types
  const testTypes = ['rumah', 'rumah2', 'kos', 'warung', 'kafe', 'kantor', 'sekolah', 'rs', 'istana', 'pasar', 'ibadah', 'stadion'];
  for (const t of testTypes) {
    const mesh = loader.createBuildingMeshByType(t);
    const meta = loader.getBuildingMeta(t);
    console.log(`  - [OK] ${t}: mesh with ${mesh.children.length} parts | Meta: ${meta.title} (${meta.icon}) - ${meta.jobTitle}`);
  }
  
  console.log('All test types rendered and verified!');
} catch (err) {
  console.error('Validation error:', err);
  process.exit(1);
}

