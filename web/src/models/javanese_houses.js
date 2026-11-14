/**
 * AUDIRA-LAND: Rumah tradisional Jawa dari Blender (.glb)
 * Model: joglo (2x2 kavling), limasan, kampung, panggang pe (warung), tajug (langgar) (1 kavling).
 * Sumber: blender/scripts/build_rumah_jawa.py -> web/public/models/rumah_<key>.glb
 *
 * - Pembaca GLB mini (0 dependensi, tanpa GLTFLoader): 1 mesh, POSITION/NORMAL/COLOR_0/indeks.
 * - Geometri dibagi pakai; warna disimpan sebagai vertex color dan ditandai
 *   geometry.userData.bakeVertexColor agar static_batcher melebur ke bucket lambert bersama
 *   (0 draw call tambahan per chunk).
 * - Titik nol di dasar tengah, dasar y=0, depan menghadap +Z.
 */

export const JAVANESE_HOUSE_KEYS = ['joglo', 'limasan', 'kampung', 'panggangpe', 'tajug'];

// true: warna disesuaikan dengan kota (hex dipakai sebagai nilai linear -> nada pastel seragam).
// false: warna asli Blender (lebih pekat).
const CITY_TONE = true;

const geometries = new Map(); // key -> BufferGeometry
let material = null;
let loadPromise = null;

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const NORM_DIV = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function readAccessor(json, bin, idx) {
    const acc = json.accessors[idx];
    const view = json.bufferViews[acc.bufferView];
    const Arr = COMPONENT[acc.componentType];
    const n = SIZE[acc.type];
    const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
    const stride = view.byteStride || 0;
    if (!stride || stride === n * Arr.BYTES_PER_ELEMENT) {
        return { array: new Arr(bin.buffer, bin.byteOffset + offset, acc.count * n), n, acc };
    }
    const out = new Arr(acc.count * n);
    const dv = new Arr(bin.buffer, bin.byteOffset);
    const step = stride / Arr.BYTES_PER_ELEMENT;
    const base = offset / Arr.BYTES_PER_ELEMENT;
    for (let i = 0; i < acc.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[base + i * step + k];
    return { array: out, n, acc };
}

const toCityTone = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** tone: false = warna asli GLB (linear), tanpa penyesuaian nada kota. */
export function parseGLB(buffer, { tone = CITY_TONE } = {}) {
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('bukan GLB');
    const jsonLen = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLen)));
    const binStart = 20 + jsonLen + 8;
    const bin = new Uint8Array(buffer, binStart, dv.getUint32(20 + jsonLen, true));
    const prim = json.meshes[0].primitives[0];

    const geo = new THREE.BufferGeometry();
    const pos = readAccessor(json, bin, prim.attributes.POSITION);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.array), 3));
    if (prim.attributes.NORMAL !== undefined) {
        const nor = readAccessor(json, bin, prim.attributes.NORMAL);
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor.array), 3));
    } else {
        geo.computeVertexNormals();
    }
    if (prim.attributes.COLOR_0 !== undefined) {
        const c = readAccessor(json, bin, prim.attributes.COLOR_0);
        const div = c.acc.componentType === 5126 ? 1 : NORM_DIV[c.acc.componentType];
        const count = c.acc.count;
        const col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            for (let k = 0; k < 3; k++) {
                const v = c.array[i * c.n + k] / div;
                col[i * 3 + k] = tone ? toCityTone(v) : v;
            }
        }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.userData.bakeVertexColor = true;
    }
    if (prim.indices !== undefined) {
        const ix = readAccessor(json, bin, prim.indices);
        const Arr = pos.acc.count > 65535 ? Uint32Array : Uint16Array;
        geo.setIndex(new THREE.BufferAttribute(Arr.from(ix.array), 1));
    }
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
}

/** Muat kelima .glb sekali. Gagal per model tidak memutus model lain (fallback prosedural). */
export function loadJavaneseHouses(base = 'public/models/') {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all(JAVANESE_HOUSE_KEYS.map(key =>
        fetch(`${base}rumah_${key}.glb`)
            .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then(buf => { geometries.set(key, parseGLB(buf)); })
            .catch(e => console.warn(`[Rumah Jawa] gagal memuat ${key}:`, e))
    )).then(() => geometries.size);
    return loadPromise;
}

export const javaneseHousesReady = () => geometries.size > 0;

/** Objek siap tempel (dasar di y=0 lokal). null bila model belum/tidak termuat. */
export function createJavaneseHouse(key) {
    const geo = geometries.get(key);
    if (!geo) return null;
    // Lambert polos (warna putih): warna asli dari vertex color, dibaca static_batcher
    if (!material) material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false });
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.name = `bld_jawa_${key}`;
    group.add(mesh);
    return group;
}

function hashSeed(data) {
    const s = String(data.id || '') + ':' + (data.grid_i || 0) + ':' + (data.grid_j || 0);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/**
 * Pilih model rumah Jawa untuk satu bangunan, atau null (pakai model prosedural lama).
 * - rumah_limas (rumah warga Have-Not): limasan / kampung
 * - rumah 2x2: joglo
 * - rumah 1x1: Desa Have-Not selalu tradisional; Desa Have 1 dari 5 (campuran kota-kampung)
 * - warung: panggang pe (Have-Not selalu, Have separuh)
 * - ibadah: tajug (langgar)
 */
export function pickJavaneseHouse(type, data = {}, isHaveNot = false) {
    if (!javaneseHousesReady()) return null;
    const w = data.width || 1, h = data.height || 1;
    const seed = hashSeed(data);
    let key = null;
    switch (type) {
        case 'rumah_limas':
            key = seed % 3 === 0 ? 'kampung' : 'limasan';
            break;
        case 'rumah':
            if (w >= 2 && h >= 2) key = 'joglo';
            else if (isHaveNot || seed % 5 === 0) key = (seed >> 3) % 2 ? 'kampung' : 'limasan';
            break;
        case 'warung':
            if (isHaveNot || seed % 2 === 0) key = 'panggangpe';
            break;
        case 'ibadah':
            key = 'tajug';
            break;
        case 'joglo': case 'limasan': case 'kampung': case 'panggangpe': case 'tajug':
            key = type;
            break;
    }
    return key && geometries.has(key) ? key : null;
}
