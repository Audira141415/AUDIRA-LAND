const path = require('path');
const THREE = require(path.resolve(__dirname, '../web/public/vendor/three.min.js'));
global.THREE = THREE;
global.window = { THREE };

const geos = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  sph: new THREE.SphereGeometry(0.5, 8, 6),
  pyr: (() => {
    const geo = new THREE.ConeGeometry(0.5, 1, 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.scale(Math.SQRT2, 1, Math.SQRT2);
    return geo;
  })(),
  prism: (() => {
    const geo = new THREE.BufferGeometry();
    const o = [-0.5, -0.5, -0.5], n = [-0.5, -0.5, 0.5], e = [-0.5, 0.5, 0];
    const s = [0.5, -0.5, -0.5], r = [0.5, -0.5, 0.5], l = [0.5, 0.5, 0];
    const i = [o, n, e, s, l, r, o, s, r, o, r, n, n, r, l, n, l, e, o, e, l, o, l, s];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(i.flat(), 3));
    geo.computeVertexNormals();
    return geo;
  })()
};

function mergePrimitiveGroup(items, scale = 1.0) {
  if (!items || items.length === 0) return null;

  let totalPositions = 0;
  let totalNormals = 0;
  let totalIndices = 0;

  for (const it of items) {
    const base = geos[it.g] || geos.box;
    totalPositions += base.attributes.position.array.length;
    totalNormals += (base.attributes.normal ? base.attributes.normal.array.length : base.attributes.position.array.length);
    totalIndices += (base.index ? base.index.array.length : 0);
  }

  const mergedPositions = new Float32Array(totalPositions);
  const mergedNormals = new Float32Array(totalNormals);
  const mergedIndices = new Uint32Array(totalIndices);

  let posOffset = 0;
  let normOffset = 0;
  let idxOffset = 0;
  let vertexCount = 0;

  const dummy = new THREE.Object3D();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const it of items) {
    const base = geos[it.g] || geos.box;
    const posArr = base.attributes.position.array;
    const normArr = base.attributes.normal ? base.attributes.normal.array : null;
    const idxArr = base.index ? base.index.array : null;

    dummy.position.set(it.p[0] * scale, it.p[1] * scale, it.p[2] * scale);
    dummy.scale.set(it.s[0] * scale, it.s[1] * scale, it.s[2] * scale);
    dummy.rotation.set(it.rx || 0, it.ry || 0, 0);
    dummy.updateMatrix();

    const m = dummy.matrix;
    normalMatrix.getNormalMatrix(m);

    for (let i = 0; i < posArr.length; i += 3) {
      v.set(posArr[i], posArr[i+1], posArr[i+2]).applyMatrix4(m);
      mergedPositions[posOffset + i] = v.x;
      mergedPositions[posOffset + i + 1] = v.y;
      mergedPositions[posOffset + i + 2] = v.z;

      if (normArr) {
        n.set(normArr[i], normArr[i+1], normArr[i+2]).applyMatrix3(normalMatrix).normalize();
        mergedNormals[normOffset + i] = n.x;
        mergedNormals[normOffset + i + 1] = n.y;
        mergedNormals[normOffset + i + 2] = n.z;
      }
    }

    if (idxArr) {
      for (let i = 0; i < idxArr.length; i++) {
        mergedIndices[idxOffset + i] = idxArr[i] + vertexCount;
      }
      idxOffset += idxArr.length;
    }

    vertexCount += base.attributes.position.count;
    posOffset += posArr.length;
    normOffset += (normArr ? normArr.length : posArr.length);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
  if (totalIndices > 0) {
    geo.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
  }

  return geo;
}

const { NETIZENIA_BUILDINGS, createNetizeniaBuilding } = require(path.resolve(__dirname, '../web/src/models/netizenia_catalog.js'));

// Test time to generate 100 buildings with merging
console.log('Testing 100 buildings generation with merge...');
const t0 = Date.now();
for (let i = 0; i < 100; i++) {
  const b = createNetizeniaBuilding('rumah', { seed: i });
}
console.log('Done 100 buildings in:', Date.now() - t0, 'ms');

