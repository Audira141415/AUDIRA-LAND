/**
 * AUDIRA-LAND: Static Batcher (Draw-Call Killer)
 *
 * Menggabungkan mesh statis menjadi sedikit draw call:
 *  - Material Lambert/Basic polos (tanpa map, opak, tidak di-mutasi runtime) dilebur
 *    ke SATU material bersama ber-vertex-color. Ratusan warna = 1 draw call.
 *  - Material khusus (transparan, ber-tekstur, emissive, glow siang/malam) tetap
 *    memakai material aslinya, digabung per material agar mutasi runtime tetap jalan.
 *  - InstancedMesh di-expand per instance. Index & transform bersarang ditangani benar.
 *  - Opsional: dibagi per chunk spasial agar frustum culling tetap efektif.
 *
 * Sprite, Line, Points, dan objek dengan userData.noBatch tidak disentuh.
 */

const SHARED = {};
function sharedMaterial(kind) {
    if (!SHARED[kind]) {
        SHARED[kind] = kind === 'basic'
            ? new THREE.MeshBasicMaterial({ vertexColors: true })
            : new THREE.MeshLambertMaterial({ vertexColors: true });
        SHARED[kind].name = `batched_${kind}`;
    }
    return SHARED[kind];
}

// Material yang warnanya diubah saat runtime (siang/malam) wajib tidak dilebur.
const protectedMaterials = new WeakSet();
export function protectMaterial(mat) {
    if (mat) protectedMaterials.add(mat);
}

function classify(mat) {
    if (!mat || Array.isArray(mat)) return null;
    const plain = !mat.map && !mat.transparent && !mat.alphaTest && mat.side !== THREE.DoubleSide
        && !protectedMaterials.has(mat) && !mat.vertexColors && mat.visible !== false;
    if (plain && mat.isMeshLambertMaterial && (!mat.emissive || mat.emissive.getHex() === 0)) return 'lambert';
    if (plain && mat.isMeshBasicMaterial) return 'basic';
    return 'own';
}

const _m = new THREE.Matrix4();
const _inst = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _c = new THREE.Vector3();

/**
 * @param {THREE.Object3D} root   Objek yang anak-anaknya akan dilebur.
 * @param {object} opts
 *   chunkSize  : ukuran sel spasial (m). 0 = tanpa chunk.
 *   relativeTo : Object3D; jika diberikan, hasil dalam ruang lokal objek ini (untuk bangunan dinamis).
 *   remove     : hapus mesh asli dari induknya (default true).
 *   mergeShadow: abaikan beda castShadow (objek kecil/bergerak: 1 draw call, seluruhnya cast).
 * @returns {THREE.Group} group berisi mesh hasil leburan.
 */
export function bakeStatic(root, opts = {}) {
    const chunkSize = opts.chunkSize || 0;
    const remove = opts.remove !== false;
    root.updateMatrixWorld(true);

    const inv = new THREE.Matrix4();
    if (opts.relativeTo) {
        opts.relativeTo.updateMatrixWorld(true);
        inv.copy(opts.relativeTo.matrixWorld).invert();
    }

    const buckets = new Map();
    const consumed = [];

    root.traverse(obj => {
        if (!obj.isMesh || obj.userData.noBatch || !obj.visible) return;
        const geo = obj.geometry;
        if (!geo || !geo.attributes || !geo.attributes.position) return;
        // Jangan masuk ke cabang yang tidak terlihat
        for (let p = obj.parent; p && p !== root; p = p.parent) {
            if (!p.visible || p.userData.noBatch) return;
        }
        const kind = classify(obj.material);
        if (!kind) return;

        const count = obj.isInstancedMesh ? obj.count : 1;
        for (let k = 0; k < count; k++) {
            _m.copy(obj.matrixWorld);
            if (obj.isInstancedMesh) {
                obj.getMatrixAt(k, _inst);
                _m.multiply(_inst);
            }
            if (opts.relativeTo) _m.premultiply(inv);

            let chunkKey = '';
            if (chunkSize > 0) {
                if (!geo.boundingBox) geo.computeBoundingBox();
                _box.copy(geo.boundingBox).applyMatrix4(_m).getCenter(_c);
                chunkKey = Math.floor(_c.x / chunkSize) + ',' + Math.floor(_c.z / chunkSize);
            }
            const matKey = kind === 'own' ? obj.material.uuid : kind;
            // receiveShadow tidak memecah bucket (menerima bayangan tak menambah draw call)
            const key = `${chunkKey}|${matKey}|${(obj.castShadow && !opts.mergeShadow) ? 1 : 0}`;
            let b = buckets.get(key);
            if (!b) {
                b = { kind, mat: obj.material, cast: obj.castShadow, recv: obj.receiveShadow, items: [], verts: 0, idx: 0, uv: false };
                buckets.set(key, b);
            }
            const vc = geo.attributes.position.count;
            if (obj.receiveShadow) b.recv = true;
            if (obj.castShadow) b.cast = true;
            b.items.push({ geo, matrix: _m.clone(), color: obj.material.color });
            b.verts += vc;
            b.idx += geo.index ? geo.index.count : vc;
            if (kind === 'own' && geo.attributes.uv) b.uv = true;
        }
        consumed.push(obj);
    });

    const out = new THREE.Group();
    out.name = (root.name || 'root') + '_baked';

    for (const b of buckets.values()) {
        if (b.verts === 0) continue;
        const pos = new Float32Array(b.verts * 3);
        const nor = new Float32Array(b.verts * 3);
        const col = b.kind !== 'own' ? new Float32Array(b.verts * 3) : null;
        const uv = b.uv ? new Float32Array(b.verts * 2) : null;
        const IndexArr = b.verts > 65535 ? Uint32Array : Uint16Array;
        const index = new IndexArr(b.idx);

        let vo = 0, io = 0;
        for (const it of b.items) {
            const g = it.geo;
            const p = g.attributes.position;
            let n = g.attributes.normal;
            if (!n) { g.computeVertexNormals(); n = g.attributes.normal; }
            const u = g.attributes.uv;
            _nm.getNormalMatrix(it.matrix);
            const cr = it.color ? it.color.r : 1, cg = it.color ? it.color.g : 1, cb = it.color ? it.color.b : 1;
            // Geometri bertanda bakeVertexColor (mis. rumah Jawa .glb) membawa warnanya sendiri
            const sc = g.userData.bakeVertexColor ? g.attributes.color : null;

            for (let i = 0; i < p.count; i++) {
                _v.fromBufferAttribute(p, i).applyMatrix4(it.matrix);
                const o3 = (vo + i) * 3;
                pos[o3] = _v.x; pos[o3 + 1] = _v.y; pos[o3 + 2] = _v.z;
                _v.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
                nor[o3] = _v.x; nor[o3 + 1] = _v.y; nor[o3 + 2] = _v.z;
                if (col && sc) { col[o3] = cr * sc.getX(i); col[o3 + 1] = cg * sc.getY(i); col[o3 + 2] = cb * sc.getZ(i); continue; }
                if (col) { col[o3] = cr; col[o3 + 1] = cg; col[o3 + 2] = cb; }
                if (uv && u) { uv[(vo + i) * 2] = u.getX(i); uv[(vo + i) * 2 + 1] = u.getY(i); }
            }
            // Matriks bercermin (skala negatif) membalik urutan segitiga
            const flip = it.matrix.determinant() < 0;
            if (g.index) {
                const src = g.index.array;
                for (let i = 0; i < src.length; i += 3) {
                    index[io + i] = src[i] + vo;
                    index[io + i + 1] = src[flip ? i + 2 : i + 1] + vo;
                    index[io + i + 2] = src[flip ? i + 1 : i + 2] + vo;
                }
                io += src.length;
            } else {
                for (let i = 0; i < p.count; i += 3) {
                    index[io + i] = vo + i;
                    index[io + i + 1] = vo + (flip ? i + 2 : i + 1);
                    index[io + i + 2] = vo + (flip ? i + 1 : i + 2);
                }
                io += p.count;
            }
            vo += p.count;
        }

        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        if (col) merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
        if (uv) merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        merged.setIndex(new THREE.BufferAttribute(index, 1));
        merged.computeBoundingSphere();
        merged.computeBoundingBox();

        const mat = b.kind === 'own' ? b.mat : sharedMaterial(b.kind);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.recv;
        mesh.userData.baked = true;
        // Papan teks/banner bertekstur: boleh disembunyikan saat jauh (lihat updateDetailLOD)
        if (b.kind === 'own' && mat.map) mesh.userData.detail = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        out.add(mesh);
    }

    if (remove) {
        for (const obj of consumed) {
            if (obj.parent) obj.parent.remove(obj);
        }
    }
    return out;
}

/**
 * Melebur satu objek dinamis (bangunan / kendaraan) menjadi group ringkas yang
 * tetap bisa dipindah sebagai satu kesatuan. Sprite & Line tetap ikut sebagai anak.
 */
export function compactObject(obj) {
    const pos = obj.position.clone();
    const quat = obj.quaternion.clone();
    const scl = obj.scale.clone();
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.set(1, 1, 1);
    obj.updateMatrixWorld(true);

    const baked = bakeStatic(obj, { relativeTo: obj, remove: true, mergeShadow: true });
    for (const m of [...baked.children]) obj.add(m);
    // Bersihkan group kosong
    const empty = [];
    obj.traverse(o => { if (o.isGroup && o !== obj && o.children.length === 0) empty.push(o); });
    empty.forEach(o => o.parent && o.parent.remove(o));

    obj.position.copy(pos);
    obj.quaternion.copy(quat);
    obj.scale.copy(scl);
    return obj;
}

/** Buang geometri hasil leburan (unik per bake; geometri katalog bersama tidak disentuh). */
export function disposeBaked(obj) {
    obj.traverse(o => {
        if (o.isMesh && o.userData.baked && o.geometry) {
            o.geometry.dispose();
        }
    });
}

/**
 * Sembunyikan mesh detail (papan teks/banner) yang terlalu jauh dari kamera.
 * Teks tak terbaca di jarak itu, jadi hemat draw call tanpa beda visual.
 */
const _sc = new THREE.Vector3();
export function updateDetailLOD(root, camera, maxDist = 150) {
    root.traverse(o => {
        if (!o.userData.detail || !o.geometry || !o.geometry.boundingSphere) return;
        // userData.detail boleh berupa angka = jarak maksimum khusus objek itu
        const md = typeof o.userData.detail === 'number' ? o.userData.detail : maxDist;
        const max2 = md * md;
        _sc.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
        const r = o.geometry.boundingSphere.radius;
        const d2 = _sc.distanceToSquared(camera.position);
        o.visible = d2 < max2 + r * r + 2 * md * r;
    });
}
