/**
 * AUDIRA-LAND: Pustaka model Polyfork bersama (CC BY 4.0, kredit di tab Admin "Kredit Aset").
 * File: web/public/models/polyfork/<id>.glb (dibuat tools/polyfork_import.py: 1 mesh, vertex color,
 * dasar y=0, pusat X/Z = 0, depan +Z).
 *
 * Dimuat SEBELUM game dibuat (main.js) supaya modul sinkron (CityGrid, TrafficSystem) bisa memakai
 * model asli. Model yang gagal/terlambat dimuat -> fungsi mengembalikan null dan modul memakai
 * model prosedural lama (fallback).
 */

import { parseGLB } from './javanese_houses.js';

const BASE = 'public/models/polyfork/';

// Daftar model yang dipakai kota. Ubah di sini untuk mengganti varian.
export const PF = {
    treesRound: ['broad-canopy-shade-tree-e7c4a2', 'street-tree-0d33f3', 'maple-tree-65fa12',
        'ornamental-front-yard-tree-c6781a', 'palm-tree-a307da', 'banana-plant-978d7f',
        'bamboo-grove-clump-7c747d', 'palm-sapling-ef7ae4'],
    treesPine: ['tall-pine-tree-ab4108', 'pine-tree-3ea075'],
    // Pohon tambahan pedesaan (rural_scenery.js, dilebur bakeStatic -> 0 draw call tambahan)
    treesRural: [],
    cars: ['compact-hatchback-386417', 'city-taxi-eefa91', 'town-car-56eeb6',
        'family-minivan-924de0', 'family-crossover-suv-42027f', 'kei-van-211ed5'],
    pickups: ['suburban-pickup-truck-d15ea2', 'marigold-pickup-f4b6f9'],
    trucks: ['delivery-truck-a9537e', 'boxy-delivery-van-a3ceae', 'city-bus-49fd97'],
    // Varian ringan (2026-11-14): dicampur ke mesh lokal prosedural agar kota lebih beragam tanpa
    // menambah jumlah UNIT kendaraan -> draw call hampir tetap (tiap model berat multi-unit = +1 draw).
    motorbikes: ['touring-motorcycle-3b1ad3', 'motorcycle-and-sidecar-7d39b8'],  // motor (Have-Not)
    bicycles: ['city-bicycle-5b67d1', 'flower-bicycle-284d0e'],                  // onthel (Have-Not)
    carts: ['ox-cart-9c857f', 'wooden-hand-cart-3ae5b5', 'elote-cart-a8fb49'],  // gerobak + gerobak jajan (Have-Not)
    minitruck: ['three-wheeled-delivery-mini-744094'],                          // pikap roda-3 (Have-Not)
    foodtruck: ['food-truck-3c4e0e'],                                           // food truck kota (Have)
    // Tiang di z = -1.04, lengan menjulur ke +Z sampai z = 1.56, tinggi 8.01 m (ukuran asli)
    streetLamp: ['cobra-head-street-light-3e25b8'],
    // Pejalan kaki (anak-anak diberi tinggi lebih kecil di living_world.js)
    // Kendaraan layanan kota (Desa Have): ambulans, polisi, pemadam, truk sampah. Panjang = SERVICE_LEN.
    service: ['ambulance-van-29919a', 'police-cruiser-a2d25e', 'fire-engine-7d476b', 'garbage-truck-a7ffbf'],
    people: ['suburban-resident-a9db9c', 'student-in-a-hoodie-7c8223', 'city-commuter-52a53f',
        'passenger-ac425a', 'street-vendor-139de3',
        'neighborhood-child-8cc5ac', 'kite-kid-0a7d70',
        'farmer-363820', 'hanga-roa-fisherman-e56812', 'police-officer-1cc379',
        'doctor-d49de0', 'school-teacher-8b8bfc'],
    kids: ['neighborhood-child-8cc5ac', 'kite-kid-0a7d70'],
    // Ternak berjalan (wildlife.js), juga hanya frame jalannya yang dimuat
    animals: ['goat-base', 'cow-base']
};
// Pohon Polyfork pedesaan (CC BY 4.0, kredit di docs/CREDITS_POLYFORK.md). h = tinggi [min, max] m,
// w = bobot kemunculan: rindang/tropis/buah sering; pinus sedang; pohon mati, gurun & salju jarang (aksen).
// Tabel pohon pedesaan: public/data/rural_trees.json ({id, h:[min,max] m, w: bobot}); dimuat oleh
// preloadPolyfork sebelum game dibuat (tidak ikut bundel JS agar anggaran 160 KB gzip terjaga).
export const RURAL_TREES = [];
/** Jenis pohon kebun buah (rural_scenery.js), dari rural_trees.json "orchard". */
export const FRUIT_IDS = [];

const WALK_ONLY = new Set(['people', 'kids', 'animals']);

const geos = new Map();
let material = null;

/** Muat semua model PF (atau ids). Selesai paling lambat timeoutMs, apa pun hasilnya. */
// Karakter: klip Walk dibake jadi WALK_FRAMES mesh (tools/polyfork_bake_anim.py) -> <id>__walk<k>.glb
export const WALK_FRAMES = 8;
const walkIds = id => Array.from({ length: WALK_FRAMES }, (_, k) => `${id}__walk${k}`);
// Model pose-T karakter tidak dimuat (yang dipakai hanya frame jalannya)
const DEFAULT_IDS = [...Object.entries(PF).filter(([k]) => !WALK_ONLY.has(k)).flatMap(([, v]) => v),
    ...PF.people.flatMap(walkIds), ...PF.animals.flatMap(walkIds)];

/** Frame jalan karakter (array geometri) atau null bila belum lengkap. */
export function pfWalkFrames(id) {
    const f = walkIds(id).map(k => geos.get(k));
    return f.every(Boolean) ? f : null;
}

let liveMaterial = null;
/** Material untuk mesh yang TIDAK dilebur static_batcher (bergerak): vertex color langsung. */
export function pfLiveMaterial() {
    if (!liveMaterial) liveMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    return liveMaterial;
}

export async function preloadPolyfork(ids = null, timeoutMs = 8000) {
    if (!ids) {
        try {
            const d = await fetch('public/data/rural_trees.json').then(r => r.json());
            RURAL_TREES.push(...d.trees);
            FRUIT_IDS.push(...d.orchard);
            PF.treesRural = d.trees.map(t => t.id);
        } catch (e) { console.warn('[Polyfork] rural_trees.json gagal dimuat:', e); }
        ids = [...DEFAULT_IDS, ...PF.treesRural, ...FRUIT_IDS];
    }
    const jobs = Promise.all([...new Set(ids)].map(id =>
        fetch(`${BASE}${id}.glb`)
            .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            // Karakter (frame __walk) pakai warna asli: nada kota membuat baju & kulit pucat keabu-abuan
            .then(buf => geos.set(id, parseGLB(buf, id.includes('__walk') ? { tone: false } : undefined)))
            .catch(e => console.warn(`[Polyfork] lewati ${id}:`, e))
    ));
    return Promise.race([jobs, new Promise(r => setTimeout(r, timeoutMs))]).then(() => geos.size);
}

export const pfGeo = id => geos.get(id) || null;
export const pfReady = ids => ids.some(id => geos.has(id));

/** Material bersama: putih polos, warna asli dari vertex color (dilebur static_batcher). */
export function pfMaterial() {
    if (!material) material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    return material;
}

/** Skala seragam agar ukuran sumbu tertentu (x | y | z) = target meter. */
export function pfScaleTo(id, axis, target) {
    const g = geos.get(id);
    if (!g) return 1;
    const b = g.boundingBox, size = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }[axis];
    return size > 0 ? target / size : 1;
}

/** Mesh siap pakai (dasar y=0 lokal), diskalakan ke panjang (+Z) atau tinggi tertentu. */
export function pfMesh(id, { length, height } = {}) {
    const g = geos.get(id);
    if (!g) return null;
    const m = new THREE.Mesh(g, pfMaterial());
    const s = length ? pfScaleTo(id, 'z', length) : height ? pfScaleTo(id, 'y', height) : 1;
    m.scale.setScalar(s);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

/** Pilih id deterministik dari daftar yang sudah termuat. */
export function pfPick(ids, seed) {
    const ok = ids.filter(id => geos.has(id));
    return ok.length ? ok[(seed >>> 0) % ok.length] : null;
}

/**
 * Sebar banyak salinan (pohon dll) sebagai InstancedMesh per varian.
 * points: [{x, z, y?}], height: [min, max] meter. Rotasi Y & tinggi acak deterministik.
 * Zero-Submerging: dasar model = y titik (sudah termasuk micro-lift dari pemanggil).
 */
export function pfInstances(ids, points, { height = [4, 6], castShadow = true } = {}) {
    const ok = ids.filter(id => geos.has(id));
    if (!ok.length || !points.length) return [];
    const buckets = ok.map(() => []);
    points.forEach((p, k) => {
        const h = (Math.imul(Math.round(p.x * 10), 73856093) ^ Math.imul(Math.round(p.z * 10), 19349663)) >>> 0;
        buckets[h % ok.length].push({ ...p, h });
    });
    const dummy = new THREE.Object3D();
    const out = [];
    ok.forEach((id, vi) => {
        const list = buckets[vi];
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geos.get(id), pfMaterial(), list.length);
        list.forEach((p, k) => {
            const t = ((p.h >>> 8) % 1000) / 1000;
            const s = pfScaleTo(id, 'y', height[0] + (height[1] - height[0]) * t);
            dummy.position.set(p.x, p.y || 0, p.z);
            dummy.rotation.set(0, ((p.h >>> 4) % 628) / 100, 0);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            im.setMatrixAt(k, dummy.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = castShadow;
        im.receiveShadow = true;
        im.name = `pf_${id}`;
        out.push(im);
    });
    return out;
}
