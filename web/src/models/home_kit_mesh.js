/**
 * AUDIRA-LAND: Mesh rumah warga + kendaraan parkir dari kit Desa × Profesi
 * (core/home_catalog.js, docs/SPEC_RUMAH_KENDARAAN_PROFESI.md).
 *
 * Data bangunan membawa pf_house, pf_vehicle, vehicle_len. Model dimuat lazy (hanya rumah warga
 * yang ada). Kavling 8 m: rumah di belakang (pas 6,0 × 4,6 m, tinggi maks 10 m), kendaraan diparkir
 * menyamping di depan. Dasar semua model y = 0 lokal (Zero-Submerging; loader menambah micro-lift).
 */

import { pfGeo, pfMaterial, preloadPolyfork } from './polyfork_library.js';

const LOT_HALF = 4.0;
const HOUSE_W = 6.0, HOUSE_D = 4.6, HOUSE_MAX_H = 10;
const VEHICLE_MAX_LEN = 5.6;

export const homeKitIds = d => (d && d.pf_house ? [d.pf_house, d.pf_vehicle].filter(Boolean) : []);
export const homeKitReady = d => homeKitIds(d).length > 0 && homeKitIds(d).every(id => pfGeo(id));

const pending = new Map();
/** Muat model kit yang belum ada. Resolve true bila semua siap. */
export function loadHomeKit(d) {
    const missing = homeKitIds(d).filter(id => !pfGeo(id));
    if (!missing.length) return Promise.resolve(homeKitReady(d));
    const key = missing.join(',');
    if (!pending.has(key)) {
        pending.set(key, preloadPolyfork(missing, 15000).then(() => { pending.delete(key); return homeKitReady(d); }));
    }
    return pending.get(key);
}

function sizeOf(geo) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox;
    return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
}

/** Grup rumah + kendaraan, atau null bila model belum termuat. */
export function createHomeKitMesh(d) {
    if (!homeKitReady(d)) return null;
    const group = new THREE.Group();
    group.name = 'bld_home_kit';
    const mat = pfMaterial();

    // Kendaraan: sumbu panjangnya dibuat sejajar X (parkir menyamping di depan rumah)
    let houseD = HOUSE_D;
    if (d.pf_vehicle) {
        const vg = pfGeo(d.pf_vehicle), vs = sizeOf(vg);
        const longZ = vs.z >= vs.x;
        const len = Math.min(d.vehicle_len || 4, VEHICLE_MAX_LEN);
        const k = len / Math.max(vs.x, vs.z);
        const width = (longZ ? vs.x : vs.z) * k;
        const car = new THREE.Mesh(vg, mat);
        car.scale.setScalar(k);
        if (longZ) car.rotation.y = Math.PI / 2;
        const carBack = LOT_HALF - 0.2 - width;
        car.position.set(LOT_HALF - 0.4 - len / 2, 0, carBack + width / 2);
        car.castShadow = car.receiveShadow = true;
        group.add(car);
        // Kendaraan lebar (food truck, damkar): rumah dibuat lebih dangkal agar tidak bertabrakan
        houseD = Math.min(HOUSE_D, carBack - 0.15 - (-LOT_HALF + 0.4));
    }

    // Rumah: skala seragam agar pas di belakang kavling (model kecil diperbesar, besar dikecilkan)
    const hg = pfGeo(d.pf_house), hs = sizeOf(hg);
    const s = Math.min(HOUSE_W / hs.x, houseD / hs.z, HOUSE_MAX_H / hs.y);
    const house = new THREE.Mesh(hg, mat);
    house.scale.setScalar(s);
    house.position.set(0, 0, -LOT_HALF + 0.4 + (hs.z * s) / 2);
    house.castShadow = house.receiveShadow = true;
    group.add(house);
    return group;
}
