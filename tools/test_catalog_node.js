// Test node syntax for netizenia_catalog.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock minimal Three.js objects for node verification
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

const catalogPath = path.join(__dirname, '..', 'web', 'src', 'models', 'netizenia_catalog.js');
console.log('Testing import from:', catalogPath);

try {
  const { NETIZENIA_BUILDINGS, createNetizeniaBuilding } = await import(`file://${catalogPath.replace(/\\/g, '/')}`);
  console.log('Successfully imported netizenia_catalog.js!');
  
  const keys = Object.keys(NETIZENIA_BUILDINGS);
  console.log(`Found ${keys.length} building definitions.`);
  
  let successCount = 0;
  for (const k of keys) {
    try {
      const bld = createNetizeniaBuilding(k);
      console.log(`  - [OK] ${k} (${NETIZENIA_BUILDINGS[k].n}): generated ${bld.children.length} meshes`);
      successCount++;
    } catch (err) {
      console.error(`  - [FAIL] ${k}: ${err.message}`);
    }
  }
  
  console.log(`\nVerification Result: ${successCount} / ${keys.length} buildings passed!`);
} catch (e) {
  console.error('Import error:', e);
}

