/**
 * AUDIRA-LAND: Kebun & peternakan desa dari kit Polyfork "Cozy Farm" (CC BY 4.0).
 * Sumber: tools/polyfork_import.py -> web/public/models/polyfork/<id>.glb + manifest.json
 * Kredit wajib: docs/CREDITS_POLYFORK.md (ikut setiap file .glb di manifest).
 *
 * Letak: sisi selatan peta, DI LUAR kavling aktif (|Z| > 176), di lahan yang dikosongkan dari
 * sawah (rural_scenery.js melewati petak di dalam FARM_RECT). Depan model (+Z) menghadap kota.
 *
 * - Model dimuat async lalu dilebur bakeStatic -> 1 draw call per chunk (vertex color, lambert).
 * - Zero-Submerging: alas lahan = pelat setebal FARM_TOP di atas y=0, setiap model diletakkan di
 *   FARM_TOP + 0.02 (micro-lift). Rotasi hanya sumbu Y, jadi dasar model tetap rata.
 * - Model gagal dimuat dilewati satu per satu (kebun tetap tampil sebagian).
 */

import { parseGLB } from './javanese_houses.js';
import { bakeStatic } from '../core/static_batcher.js';

export const FARM_RECT = { x0: 70, x1: 150, z0: -246, z1: -190 };
const CX = (FARM_RECT.x0 + FARM_RECT.x1) / 2;
const CZ = (FARM_RECT.z0 + FARM_RECT.z1) / 2;
const FARM_TOP = 0.04;              // tebal pelat lahan
const LIFT = FARM_TOP + 0.02;       // dasar model

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

/** true bila titik (x, z) +margin bersinggungan dengan lahan kebun (dipakai rural_scenery). */
export function inFarm(x, z, margin = 0) {
    return x > FARM_RECT.x0 - margin && x < FARM_RECT.x1 + margin && z > FARM_RECT.z0 - margin && z < FARM_RECT.z1 + margin;
}

// Model per id pendek -> id Polyfork
const M = {
    house: 'gabled-farmhouse-c7534f', barn: 'red-barn-d41683', silo: 'grain-silo-58ca67',
    windpump: 'windpump-tower-1633a9', greenhouse: 'greenhouse-53ab6d', coop: 'chicken-coop-371f97',
    stable: 'open-stable-dbf2d5', shed: 'tool-shed-f61f49', stand: 'roadside-farm-stand-e218ca',
    sign: 'signpost-0bf523', fence: 'wooden-fence-section-d72055', gate: 'farm-gate-8ab320',
    apple: 'apple-tree-ef0ba0', plum: 'plum-tree-565179', berry: 'berry-bush-ee4812',
    corn: 'corn-crop-b71f2f', wheat: 'wheat-crop-7e08e6', tomato: 'staked-tomato-crop-588b3d',
    pumpkin: 'pumpkin-crop-7de137', sunflower: 'sunflower-80ce15', scarecrow: 'scarecrow-334079',
    hay: 'hay-bale-079e8c', well: 'stone-well-b2dfcd', trough: 'water-trough-df3ced',
    tractor: 'compact-tractor-35b84b', trailer: 'tipping-trailer-061095', barrow: 'wheelbarrow-0f8406',
    crate: 'wooden-crate-e46521', sack: 'feed-sack-c84641', churn: 'milk-churn-895735',
    firewood: 'firewood-stack-810f49', beehive: 'beehive-2e70bf', clothes: 'clothes-line-ee47e4',
    basket: 'basket-of-produce-7420cf', flowers: 'flower-bed-708e73', dog: 'farm-dog-723730',
    compost: 'compost-heap-dfec38', bench: 'potting-bench-3a85ec', pump: 'hand-water-pump-448037',
    rock: 'garden-rock-7f5d60', stump: 'log-stump-1d65a5'
};

const COL = { lahan: 0x86B25A, halaman: 0xB59A6E, bedeng: 0x6B4A30, jalan: 0xC9B48A };

export class PolyforkFarm {
    constructor(scene, base = 'public/models/polyfork/') {
        this.scene = scene;
        this.base = base;
        this.group = new THREE.Group();
        this.group.name = 'polyfork_farm';
        this.geos = new Map();
        this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.mats = new Map();
        this.box = new THREE.BoxGeometry(1, 1, 1);
        this.ready = this.load().then(() => this.build()).catch(e => console.warn('[Kebun Polyfork] gagal:', e));
    }

    async load() {
        const ids = [...new Set(Object.values(M))];
        await Promise.all(ids.map(id =>
            fetch(`${this.base}${id}.glb`)
                .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
                .then(buf => this.geos.set(id, parseGLB(buf)))
                .catch(e => console.warn(`[Kebun Polyfork] lewati ${id}:`, e))
        ));
    }

    /** Taruh model (koordinat lokal kebun, lz positif = ke arah kota). */
    put(key, lx, lz, ry = 0, s = 1) {
        const geo = this.geos.get(M[key]);
        if (!geo) return null;
        const m = new THREE.Mesh(geo, this.mat);
        m.position.set(CX + lx, LIFT, CZ + lz);
        m.rotation.y = ry;
        if (s !== 1) m.scale.setScalar(s);
        m.castShadow = true;
        m.receiveShadow = true;
        this.group.add(m);
        return m;
    }

    /** Pelat datar (alas dari y=0). */
    plate(hex, lx, lz, w, d, h = FARM_TOP) {
        if (!this.mats.has(hex)) this.mats.set(hex, new THREE.MeshLambertMaterial({ color: lin(hex) }));
        const m = new THREE.Mesh(this.box, this.mats.get(hex));
        m.scale.set(w, h, d);
        m.position.set(CX + lx, h / 2, CZ + lz);
        m.receiveShadow = true;
        this.group.add(m);
        return m;
    }

    build() {
        const W = FARM_RECT.x1 - FARM_RECT.x0, D = FARM_RECT.z1 - FARM_RECT.z0;
        const hw = W / 2, hd = D / 2;

        // Lahan: rumput, halaman tanah di tengah, jalan setapak dari gerbang ke rumah
        this.plate(COL.lahan, 0, 0, W, D);
        this.plate(COL.halaman, -6, -8, 40, 22, FARM_TOP + 0.005);
        this.plate(COL.jalan, 0, hd - 9, 3, 18, FARM_TOP + 0.01);

        // Bangunan utama (sisi selatan, membelakangi sawah, menghadap kota)
        this.put('house', -18, -10);
        this.put('barn', 4, -15);
        this.put('silo', 12, -16);
        this.put('windpump', -32, -18);
        this.put('greenhouse', -30, -6, Math.PI / 2);
        this.put('shed', -9, -15);
        this.put('coop', 20, -6, -Math.PI / 2);
        this.put('stable', 30, -16);
        this.put('well', -8, -3);
        this.put('pump', -12, -4);
        this.put('clothes', -20, -2.5);
        this.put('firewood', -24, -12, Math.PI / 2);
        this.put('bench', -26, -3, Math.PI / 2);
        this.put('flowers', -15, -4.5);
        this.put('flowers', -21, -4.5);
        this.put('dog', -14, -2, 0.6);

        // Kandang & peralatan di halaman
        this.put('trough', 30, -10);
        this.put('hay', 26, -11, 0.3);
        this.put('hay', 26.4, -10.4, 0.3);
        this.put('hay', 34, -11, -0.2);
        this.put('tractor', 0, -4, -0.5);
        this.put('trailer', 6, -6, -0.5);
        this.put('barrow', 10, -3, 1.2);
        this.put('crate', 8, -10);
        this.put('crate', 8.7, -10.2, 0.4);
        this.put('sack', 9.4, -9.6, -0.3);
        this.put('churn', 16, -11);
        this.put('churn', 16.5, -10.5);
        this.put('compost', 36, -4);
        for (let i = 0; i < 4; i++) this.put('beehive', -37 + i * 1.3, 4);

        // Kandang kuda/sapi berpagar (sekitar stable)
        for (let x = 25; x <= 35; x += 2) this.put('fence', x, -8);
        for (let z = -18; z <= -10; z += 2) { this.put('fence', 24, z, Math.PI / 2); this.put('fence', 36, z, Math.PI / 2); }

        // Bedeng tanaman timur (4 petak, baris rapi)
        const plots = [['corn', 14, 8], ['wheat', 24, 8], ['tomato', 14, 17], ['pumpkin', 24, 17]];
        for (const [crop, px, pz] of plots) {
            this.plate(COL.bedeng, px, pz, 8, 6, FARM_TOP + 0.03);
            for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
                const s = 0.9 + ((r * 7 + c * 3) % 5) * 0.05;
                this.put(crop, px - 3 + c * 2, pz - 1.8 + r * 1.8, ((r + c) % 4) * 0.4, s)
                    ?.position.setY(FARM_TOP + 0.03 + 0.02);
            }
        }
        this.put('scarecrow', 19, 12.5);
        this.put('sunflower', 31, 6); this.put('sunflower', 31, 8.5); this.put('sunflower', 31, 11);

        // Kebun buah barat + semak
        const orchard = [[-34, 10], [-28, 12], [-22, 10], [-34, 18], [-28, 20], [-22, 18]];
        orchard.forEach(([x, z], i) => this.put(i % 2 ? 'plum' : 'apple', x, z, i * 1.1));
        [[-16, 14], [-16, 18], [-38, 23], [38, 22], [36, -22]].forEach(([x, z], i) => this.put('berry', x, z, i));
        [[-10, 22], [12, 24], [-38, -24]].forEach(([x, z], i) => this.put(i ? 'rock' : 'stump', x, z, i));

        // Pagar sisi kota dengan gerbang di tengah, lapak hasil kebun di luar gerbang
        for (let x = -hw + 1; x <= hw - 1; x += 2) {
            if (Math.abs(x) < 2) continue;
            this.put('fence', x, hd - 0.4);
        }
        this.put('gate', 0, hd - 0.4);
        this.put('stand', 5, hd - 3.5);
        this.put('basket', 3.4, hd - 2.3);
        this.put('basket', 6.8, hd - 2.4, 1);
        this.put('sign', -2.6, hd - 1.6, 0.25);

        const baked = bakeStatic(this.group, { chunkSize: 60 });
        this.group.add(baked);
        this.scene.add(this.group);
        return this.group;
    }
}
