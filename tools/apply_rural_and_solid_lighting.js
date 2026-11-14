const fs = require('fs');
const path = require('path');

const catalogPath = path.resolve(__dirname, '../web/src/models/netizenia_catalog.js');
let catalogContent = fs.readFileSync(catalogPath, 'utf8');

const regexTarget = /const materialCache = new Map\(\);[\s\S]*?return glowCache\.get\(colorStr\);\s*\}/;

const replacementGlowSection = `const materialCache = new Map();
function getLambertMat(colorStr) {
  const key = \`\${colorStr}\`;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({
      color: new THREE.Color(colorStr),
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true
    }));
  }
  return materialCache.get(key);
}

export const dynamicGlowMaterials = [];
const glowCache = new Map();

function getGlowMat(colorStr) {
  if (!glowCache.has(colorStr)) {
    // Material jendela & lentera otentik: Solid, mati di siang hari, bercahaya hangat di malam hari
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(0x3B4252), // Tint kaca gelap di siang hari
      emissive: new THREE.Color(0x000000), // Emissive 0 saat siang (mati)
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true
    });
    glowCache.set(colorStr, mat);
    dynamicGlowMaterials.push({ mat, originalGlowColor: new THREE.Color(colorStr || '#F2CF8A') });
  }
  return glowCache.get(colorStr);
}

/**
 * Mengubah pencahayaan jendela/lampu gedung secara dinamis (Siang vs Malam)
 * Menjawab instruksi: Lampu menyala jika malam dan mati saat siang.
 */
export function updateCatalogLighting(isNight) {
  for (let i = 0; i < dynamicGlowMaterials.length; i++) {
    const item = dynamicGlowMaterials[i];
    if (isNight) {
      // Malam: Lampu kuning keemasan menyala hangat
      item.mat.color.setHex(0xFFE082);
      item.mat.emissive.setHex(0xFFA000);
      item.mat.emissiveIntensity = 1.2;
    } else {
      // Siang: Lampu padam, kaca memantulkan warna natural gelap
      item.mat.color.setHex(0x475569);
      item.mat.emissive.setHex(0x000000);
      item.mat.emissiveIntensity = 0.0;
    }
  }
}`;

if (regexTarget.test(catalogContent)) {
    catalogContent = catalogContent.replace(regexTarget, replacementGlowSection);
    fs.writeFileSync(catalogPath, catalogContent, 'utf8');
    console.log('[Catalog] Sukses memperbarui getLambertMat & getGlowMat dengan mode Siang/Malam!');
} else {
    console.log('[Catalog] Regex tidak cocok!');
}
