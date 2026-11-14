const path = require('path');
const THREE = require(path.resolve(__dirname, '../web/public/vendor/three.min.js'));
global.THREE = THREE;
global.window = { THREE };

const { NETIZENIA_BUILDINGS, GENTENG, WALLS, AKSEN } = require(path.resolve(__dirname, '../web/src/models/netizenia_catalog.js'));
const buildings = require(path.resolve(__dirname, '../web/data/live_buildings.json'));

console.log('Testing chunk merger on', buildings.length, 'buildings...');

const startTime = Date.now();

// 2. Define chunks (Grid 4x4, chunk size = 12 tiles)
const CHUNK_SIZE = 12;
const minI = 84, minJ = 86;

function getChunkKey(gridI, gridJ) {
  const ci = Math.floor((gridI - minI) / CHUNK_SIZE);
  const cj = Math.floor((gridJ - minJ) / CHUNK_SIZE);
  return `${ci}_${cj}`;
}

const chunks = new Map();

for (const b of buildings) {
  if (b.stage === 'bangun' || b.stage === 'sketsa') {
    continue;
  }
  const ck = getChunkKey(b.grid_i, b.grid_j);
  if (!chunks.has(ck)) chunks.set(ck, []);
  chunks.get(ck).push(b);
}

console.log(`Created ${chunks.size} chunks for completed buildings.`);
for (const [ck, list] of chunks.entries()) {
  console.log(`- Chunk ${ck}: ${list.length} buildings`);
}

console.log(`Time taken to organize chunks: ${Date.now() - startTime}ms`);
