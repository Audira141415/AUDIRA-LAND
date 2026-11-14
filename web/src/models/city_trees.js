/* global THREE */
/**
 * AUDIRA-LAND: Pepohonan di DALAM kota (Desa Have & Desa Have-Not) dari model Polyfork (CC BY 4.0).
 *
 * Melengkapi pohon bawaan grid.js (median arteri vertikal, trotoar kolektor tiap 4 petak, taman Have)
 * supaya kota terasa hidup dan teduh, tanpa menyalin aset: geometri diambil dari pustaka bersama
 * polyfork_library.js (GLB di web/public/models/polyfork/, 1 mesh + vertex color, dasar y = 0).
 *
 * Spesies (dipisah per desa -> tiap InstancedMesh hanya berisi satu desa, frustum culling efektif):
 *  - Desa Have (tertata): street-tree (pohon jalan ramping), broad-canopy-shade-tree (peneduh taman/tanggul),
 *    ornamental-front-yard-tree (pohon bunga di tepi taman).
 *  - Desa Have-Not (organik): palm-tree (kelapa), banana-plant (pisang), apple-tree (dipakai sbg mangga).
 *
 * Lokasi tanam (semuanya bukan aspal, bukan sungai, bukan jembatan, bukan bangunan):
 *  - Trotoar kolektor di antara pohon grid.js (Have rapi tiap 2 petak; Have-Not acak), median arteri horizontal.
 *  - Tanggul sungai (|x| 16..17, puncak y 0.31), kecuali dekat jembatan, alun-alun, huruf raksasa.
 *  - Tepi taman Desa Have, kebun/ruang terbuka Desa Have-Not (menghindari kolam buildVillageGreens).
 *  - Sudut pekarangan kavling KOSONG Desa Have-Not (rumah Jawa memenuhi ±3.95 m petak, jadi kavling berisi
 *    rumah tidak ditanami). Pohon tanggul juga hanya tampil bila kavling tepi sungai di sebelahnya kosong.
 *  Kavling dipantau lewat layout.occupy/release (CityLayout milik BuildingLoader, hanya dibungkus, tidak diubah):
 *  bila ada bangunan baru / dibongkar, refresh() menyusun ulang instance (maks 1x per 0,5 dtk).
 *
 * Kinerja: 1 InstancedMesh per spesies per desa (pohon Polyfork = 1 mesh: batang + tajuk vertex color),
 * 6 draw call + bayangan. Tiap mesh punya geometri sendiri (atribut dibagi pakai) dengan boundingSphere
 * yang meliputi semua instance -> frustum culling r128 benar (tidak memakai frustumCulled = false).
 * Material vertexColors khusus modul ini; SEMUA mesh yang memakainya punya instanceColor (setColorAt).
 * LOD jarak (2026-11-13): pohon < LOD_NEAR (85 m, histeresis 12 m) dari kamera = model Polyfork asli di mesh
 * dekat per spesies; sisanya = proksi ±25 segitiga di 2 mesh jauh (bulat/palem, warna tajuk rata-rata spesies).
 * Maks 8 draw call; mesh kosong disembunyikan. Kamera dicatat lewat scene.onBeforeRender (berantai).
 */

import { pfGeo, preloadPolyfork } from './polyfork_library.js';
import { GRID_CONFIG, wx } from '../core/constants.js';
import {
    roadAt, roadAtH, roadAtV, roadRuns, isRiverTile, isRoadTile, isOpenSpace, isLotTile, roadNetworkInfo
} from '../core/road_network.js';
import { isMonumentTile } from '../core/city_layout.js';
import { ALUN } from './alun_alun.js';
import { alleyCrossings } from './alley_bridges.js';
import { getSurfaceIndex } from '../core/surface_index.js';
import { onCoastRoad } from '../core/coast_roads.js';

const T = GRID_CONFIG.TILE_SIZE;
const LIFT = GRID_CONFIG.MICRO_LIFT;           // 0.02 m (Zero-Submerging)
const tc = t => wx(t) + T / 2;                  // pusat petak

// Tinggi puncak permukaan nyata (lihat grid.js) + micro-lift
const Y = {
    sidewalk: 0.085 + LIFT,   // trotoar: pusat 0.055, tebal 0.06
    median: 0.151 + LIFT,     // median arteri: pusat 0.10/0.101, tebal 0.10
    park: 0.09 + LIFT,        // pad taman Have: pusat 0.06, tebal 0.06
    green: 0.058 + LIFT,      // kebun gumpalan Have-Not (lingkaran datar 0.05..0.056)
    yard: 0.058 + LIFT,       // pekarangan gumpalan Have-Not (0.045..0.055)
    bank: 0.31 + LIFT,        // tanggul batu kali: pusat 0.12, tebal 0.38
    lot: 0.09 + LIFT,         // pad kavling Have: pusat 0.06, tebal 0.06 (7.7 m)
    ground: 0.0 + LIFT        // tanah dasar (bahu gang, luar tepi desa)
};

// Spesies: id Polyfork, rentang tinggi (m), desa ('W' Have | 'E' Have-Not), castShadow
const SPECIES = {
    street: { id: 'street-tree-0d33f3', h: [4.0, 6.4], v: 'W', shadow: true },
    shade: { id: 'broad-canopy-shade-tree-e7c4a2', h: [4.8, 8.0], v: 'W', shadow: true },
    flower: { id: 'ornamental-front-yard-tree-c6781a', h: [3.0, 4.8], v: 'W', shadow: false },
    palm: { id: 'palm-tree-a307da', h: [6.0, 8.2], v: 'E', shadow: true },
    banana: { id: 'banana-plant-978d7f', h: [3.6, 4.8], v: 'E', shadow: false },
    mango: { id: 'apple-tree-ef0ba0', h: [3.6, 4.8], v: 'E', shadow: true },
    // Tambahan ragam (2026-11-14): peneduh & ornamen Desa Have, bambu kebun Desa Have-Not.
    maple: { id: 'maple-tree-65fa12', h: [5.2, 7.0], v: 'W', shadow: true },   // asli 6.43 m, peneduh
    pine: { id: 'pine-tree-3ea075', h: [2.0, 3.0], v: 'W', shadow: true },     // asli 2.24 m (70 tri), evergreen kecil
    tallpine: { id: 'tall-pine-tree-ab4108', h: [7.5, 10.0], v: 'W', shadow: true }, // asli 9.0 m, ornamen tinggi
    plum: { id: 'plum-tree-565179', h: [2.6, 3.8], v: 'W', shadow: false },    // asli 3.0 m, ornamen Have + kebun Have-Not
    bamboo: { id: 'bamboo-grove-clump-7c747d', h: [5.2, 6.4], v: 'E', shadow: true } // asli 5.97 m, rumpun kebun
};

// Hash deterministik (seed tetap) -> [0, 1)
const SEED = 0x7EE5;
function hash(a, b, c = 0) {
    let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ SEED;
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Sama persis dengan rnd() di grid.js (dipakai untuk mereplikasi letak kolam buildVillageGreens)
const gridRnd = seed => { const x = Math.sin(seed) * 43758.5453; return x - Math.floor(x); };

// Undian ragam spesies (deterministik, pakai hash) -> tiap area campur, logika penempatan tetap.
// Desa Have: peneduh kadang maple/tallpine, baris kadang pinus, ornamen kadang plum berbunga.
const pickShade = r => (r < 0.30 ? 'maple' : r < 0.42 ? 'tallpine' : 'shade');
const pickStreet = r => (r < 0.22 ? 'pine' : 'street');
const pickFlower = r => (r < 0.35 ? 'plum' : 'flower');
// Desa Have-Not: kebun kadang rumpun bambu / pohon plum selain pilihan lama.
const pickHaveNot = (r, base) => (r < 0.16 ? 'bamboo' : r < 0.28 ? 'plum' : base);

export class CityTrees {
    /**
     * @param {THREE.Scene} scene
     * @param {CityLayout} layout  buildingLoader.layout (dibaca; occupy/release dibungkus untuk refresh)
     */
    constructor(scene, layout) {
        this.scene = scene;
        this.layout = layout;
        this.group = new THREE.Group();
        this.group.name = 'city_trees';
        scene.add(this.group);
        this.material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
        this.meshes = [];          // { mesh, pts, key }
        this.dirty = false;
        this.timer = 0;
        this.counts = { W: 0, E: 0 };
        this.watchLayout();
        // Kamera untuk LOD: dicatat dari scene.onBeforeRender (berantai, tidak menimpa hook lain)
        this.cam = null;
        const prev = scene.onBeforeRender;
        scene.onBeforeRender = (renderer, sc, camera, rt) => {
            if (typeof prev === 'function') prev.call(scene, renderer, sc, camera, rt);
            if (camera && camera.isPerspectiveCamera) this.cam = camera;
        };

        // Model pohon jalan sudah dimuat preloadPolyfork() di main.js; apple-tree (mangga) dimuat di sini.
        const need = Object.values(SPECIES).map(s => s.id).filter(id => !pfGeo(id));
        this.ready = (need.length ? preloadPolyfork(need, 8000) : Promise.resolve())
            .then(() => this.build())
            .catch(e => console.warn('[Pohon Kota] gagal:', e));
    }

    /** Bungkus occupy/release milik layout agar bangunan baru langsung membersihkan pohon di kavlingnya. */
    watchLayout() {
        const L = this.layout;
        if (!L || L.__treesWatched) return;
        L.__treesWatched = true;
        const mark = () => { this.dirty = true; };
        for (const fn of ['occupy', 'release']) {
            const orig = L[fn].bind(L);
            L[fn] = (...args) => { const r = orig(...args); mark(); return r; };
        }
    }

    occupied(i, j) {
        if (this.blocked && this.blocked(i, j)) return true;   // bangunan latar InequalityCity
        return !!(this.layout && this.layout.occ && this.layout.occ.has(i + ',' + j));
    }

    /** Kumpulkan semua titik kandidat. need = petak kavling yang harus kosong agar pohon tampil. */
    collect() {
        const pts = [];
        const add = (sp, x, z, y, need = null, planter = false) => pts.push({ sp, x, z, y, need, planter });
        const { minI, maxI, minJ, maxJ } = roadNetworkInfo();
        const rMin = GRID_CONFIG.RIVER_TILE_MIN_I, rMax = GRID_CONFIG.RIVER_TILE_MAX_I;
        const west = i => i < rMin;
        const runs = roadRuns();
        const sideFree = (i, j) => !isRiverTile(i) && !isRoadTile(i, j);

        // ---------- 1. Trotoar jalan kolektor (sela pohon grid.js yang ada di j0+1+4k) ----------
        for (const r of runs.v) {
            if (r.cls !== 2 || isRiverTile(r.i)) continue;
            const x = tc(r.i);
            for (let j = r.j0 + 1; j <= r.j1 - 1; j++) {
                const k = (j - r.j0 - 1) % 4;
                if (k === 0) continue;                                         // petak pohon grid.js
                if (roadAtH(r.i, j) !== 0 || roadAtH(r.i, j - 1) === 3 || roadAtH(r.i, j + 1) === 3) continue;
                const z = tc(j);
                for (const s of [-1, 1]) {
                    if (!sideFree(r.i + s, j)) continue;
                    if (west(r.i)) {
                        add(pickStreet(hash(r.i, j, s + 3)), x + s * 3.35, z, Y.sidewalk);  // Have: rapi, kadang pinus
                        // + satu lagi di batas petak (jarak 4 m = boulevard rimbun)
                        if (j + 1 <= r.j1 - 1 && !roadAtH(r.i, j + 1) && roadAtH(r.i, j + 2) !== 3 && sideFree(r.i + s, j + 1))
                            add(pickStreet(hash(r.i, j, s + 4)), x + s * 3.35, z + 4, Y.sidewalk);
                    } else if (hash(r.i, j, s + 5) < 0.42) {                   // Have-Not: acak
                        add(hash(j, r.i, 9) < 0.6 ? 'palm' : 'banana', x + s * 3.4, z + (hash(r.i, j, 7) - 0.5) * 4, Y.sidewalk);
                    }
                }
            }
        }
        for (const r of runs.h) {
            if (r.cls !== 2) continue;
            const z = tc(r.j);
            for (let i = r.i0 + 1; i <= r.i1 - 1; i++) {
                const k = (i - r.i0 - 1) % 4;
                if (k === 0 || isRiverTile(i) || isRiverTile(i - 1) || isRiverTile(i + 1)) continue;
                if (roadAtV(i, r.j) !== 0 || roadAtV(i - 1, r.j) === 3 || roadAtV(i + 1, r.j) === 3) continue;
                const x = tc(i);
                for (const s of [-1, 1]) {
                    if (!sideFree(i, r.j + s)) continue;
                    if (west(i)) {
                        add(pickStreet(hash(i, r.j, s + 1)), x, z + s * 3.35, Y.sidewalk);
                        if (i + 1 <= r.i1 - 1 && !roadAtV(i + 1, r.j) && roadAtV(i + 2, r.j) !== 3 && !isRiverTile(i + 2) && sideFree(i + 1, r.j + s))
                            add(pickStreet(hash(i, r.j, s + 2)), x + 4, z + s * 3.35, Y.sidewalk);
                    } else if (hash(i, r.j, s + 11) < 0.42) {
                        add(hash(r.j, i, 13) < 0.6 ? 'palm' : 'banana', x + (hash(i, r.j, 17) - 0.5) * 4, z + s * 3.4, Y.sidewalk);
                    }
                }
            }
        }

        // ---------- 2. Median arteri horizontal (grid.js hanya menanami arteri vertikal) ----------
        for (const r of runs.h) {
            if (r.cls !== 3) continue;
            const z = tc(r.j);
            for (let i = r.i0 + 1; i <= r.i1 - 1; i += 2) {
                if (isRiverTile(i) || isRiverTile(i - 1) || isRiverTile(i + 1)) continue;
                if (roadAtV(i, r.j) || roadAtV(i - 1, r.j) || roadAtV(i + 1, r.j)) continue;   // jauhi persimpangan
                add(west(i) ? 'street' : 'palm', tc(i), z, Y.median);
            }
        }

        // Median arteri vertikal: sela pohon grid.js (j0+2+3k)
        for (const r of runs.v) {
            if (r.cls !== 3 || isRiverTile(r.i)) continue;
            for (let j = r.j0 + 3; j <= r.j1 - 2; j++) {
                if ((j - r.j0 - 2) % 3 === 0) continue;
                if (roadAtH(r.i, j) || roadAtH(r.i, j - 1) || roadAtH(r.i, j + 1)) continue;
                add(west(r.i) ? 'street' : 'palm', tc(r.i), tc(j), Y.median);
            }
        }

        // ---------- 3. Tanggul sungai (jauhi jembatan, alun-alun, huruf raksasa, jalan yang berujung di tepi) ----------
        const bridgeZ = [];
        const mid = (rMin + rMax) >> 1;
        for (let j = minJ; j <= maxJ; j++) if (roadAtH(mid, j) > 0) bridgeZ.push(tc(j));
        for (const c of alleyCrossings()) bridgeZ.push((c.zW + c.zE) / 2);
        const lux = tc(GRID_CONFIG.HALF_TILES);
        const z0 = wx(minJ) + 3, z1 = wx(maxJ + 1) - 3;
        for (const [s, iLand] of [[-1, rMin - 1], [1, rMax + 1]]) {
            for (let z = z0; z <= z1; z += 7) {
                const zz = z + (hash(s, Math.round(z), 21) - 0.5) * 2.0;
                if (bridgeZ.some(b => Math.abs(zz - b) < 11)) continue;
                if (Math.abs(zz - lux) < 14) continue;                                  // pilon jembatan landmark
                if (zz > ALUN.z0 - 4 && zz < ALUN.z1 + 4) continue;                     // alun-alun + gapura
                const j = Math.floor(zz / T) + GRID_CONFIG.HALF_TILES;
                if (isMonumentTile(iLand, j)) continue;
                if (roadAt(iLand, j) || roadAt(iLand, j - 1) || roadAt(iLand, j + 1)) continue;
                const x = s * 16.5;
                const need = isLotTile(iLand, j) ? [iLand + ',' + j] : null;
                add(s < 0 ? pickShade(hash(iLand, j, 23)) : 'palm', x, zz, Y.bank, need);
            }
        }

        // ---------- 3b. Alun-Alun Gotong Royong (pelataran di ATAS sungai, alun_alun.js: x ±4..±16.4, z -74..-8) ----------
        // Dua baris pohon jalan di tiap pelataran (x ±8 & ±12.4), di sela pendopo (z -66..-54), beringin kembar
        // + tajuknya (z -28..-16), pulau tugu, bangku (x ±6.2/±14.2), pot (±14, -50/-32), lampu (±5.3/±14.8), palem raja (±15),
        // gapura (z -73.2/-8.8). Tiap pohon berdiri di bedeng rumput (instance proksi bulat yang dibenam ke pelataran,
        // lihat PLANTER) -> tanpa draw call baru. Pelataran = beton/paving, jadi tidak ada pohon tanpa bedeng.
        for (const sx of [-1, 1]) {
            // Celah bebas (alun_alun.js kini: beringin di z -22 tajuk r ±6, pulau tugu r 8.5 di z -41, pot ±14 @ -50/-32)
            for (const [ax, zs] of [[8.0, [-70, -52, -30, -12]], [12.4, [-70, -46, -38, -12]]]) {
                for (const z of zs) add('street', sx * ax, z, PLANTER.top + LIFT, null, true);
            }
            // Tanggul di sisi luar pelataran (x ±16.75, puncak 0.31), di sela tiang umbul-umbul; hanya bila kavling
            // tepi sungai di sebelahnya kosong (Have penuh bangunan -> praktis hanya sisi Have-Not)
            const iLand = sx < 0 ? rMin - 1 : rMax + 1;
            for (let z = ALUN.z0 + 6; z < ALUN.z1 - 3; z += 6) {
                const j = Math.floor(z / T) + GRID_CONFIG.HALF_TILES;
                if (!isLotTile(iLand, j) || isMonumentTile(iLand, j)) continue;
                add(sx < 0 ? 'street' : 'mango', sx * 16.75, z, Y.bank, [iLand + ',' + j]);
            }
        }

        // ---------- 4. Ruang terbuka ----------
        const hnOpen = [];
        for (let j = minJ; j <= maxJ; j++) {
            for (let i = minI; i <= maxI; i++) {
                if (!isOpenSpace(i, j)) continue;
                if (west(i)) {
                    // Taman Have: pohon bunga/peneduh di tepi yang berbatasan dengan bukan-taman (grid.js menanam tengah)
                    const x = tc(i), z = tc(j);
                    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        if (isOpenSpace(i + di, j + dj)) continue;
                        for (const t of [-2.2, 2.2]) {
                            if (hash(i * 4 + di, j * 4 + dj, t > 0 ? 31 : 37) < 0.3) continue;
                            const px = x + di * 3.0 + (dj ? t : 0), pz = z + dj * 3.0 + (di ? t : 0);
                            add(hash(i, j, di * 3 + dj + 41) < 0.55 ? pickFlower(hash(i, j, di + dj + 43)) : pickShade(hash(i, j, di * 2 + dj + 45)), px, pz, Y.park);
                        }
                    }
                } else if (!isRiverTile(i)) {
                    hnOpen.push({ i, j });
                }
            }
        }
        // Kebun Have-Not: kelompok mangga/pisang/kelapa, hindari kolam (replika buildVillageGreens)
        const set = new Set(hnOpen.map(t => t.i + ',' + t.j));
        for (const t of hnOpen) {
            const x = tc(t.i), z = tc(t.j);
            const s0 = t.i * 17.13 + t.j * 5.71;
            const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => set.has((t.i + a) + ',' + (t.j + b)));
            const pond = inner && gridRnd(s0 + 6) < 0.6;
            const n = 2 + Math.floor(hash(t.i, t.j, 51) * 3);           // 2..4 pohon per petak
            for (let k = 0; k < n; k++) {
                let px, pz;
                if (pond) {   // kolam (elips s.d. ±4.4 m) di tengah petak -> hanya di sudut petak
                    const c = (Math.floor(hash(t.i, t.j, 60) * 4) + k) % 4;
                    px = x + (c & 1 ? 3.5 : -3.5); pz = z + (c & 2 ? 3.5 : -3.5);
                } else {
                    px = x + (hash(t.i, t.j, 70 + k) - 0.5) * 6.0;
                    pz = z + (hash(t.j, t.i, 80 + k) - 0.5) * 6.0;
                }
                const r = hash(t.i, t.j, 90 + k);
                const base = r < 0.45 ? 'mango' : r < 0.75 ? 'banana' : 'palm';
                add(pickHaveNot(hash(t.i, t.j, 95 + k), base), px, pz, Y.green);
            }
        }

        // ---------- 5. Sudut pekarangan kavling kosong Have-Not (hilang bila kavling diklaim) ----------
        for (let j = minJ; j <= maxJ; j++) {
            for (let i = rMax + 1; i <= maxI; i++) {
                if (!isLotTile(i, j)) continue;
                if (hash(i, j, 101) < 0.5) continue;                           // sebagian pekarangan lapang
                const x = tc(i), z = tc(j);
                const n = hash(i, j, 103) < 0.5 ? 1 : 2;
                const c0 = Math.floor(hash(i, j, 105) * 4);
                for (let k = 0; k < n; k++) {
                    const c = (c0 + k * 2) % 4;                                 // sudut berseberangan
                    const sx = c & 1 ? 1 : -1, sz = c & 2 ? 1 : -1;
                    const r = hash(i, j, 107 + k);
                    const base = r < 0.4 ? 'banana' : r < 0.75 ? 'mango' : 'palm';
                    add(pickHaveNot(hash(i, j, 109 + k), base),
                        x + sx * (2.6 + hash(i, j, 111 + k) * 0.6), z + sz * (2.6 + hash(i, j, 113 + k) * 0.6), Y.yard, [i + ',' + j]);
                }
            }
        }

        this.collectHaveExtra(add, { minI, maxJ, minJ, rMin, runs });

        // Penjaga terakhir: titik tidak boleh di aspal (petak jalan tanpa trotoar) atau di sungai
        const kept = pts.filter(p => {
            if (Math.abs(p.x) < 16.05) return !!p.planter;          // di atas sungai hanya pohon bedeng alun-alun
            if (onCoastRoad(p.x, p.z, 2)) return false;              // jalan akses pesisir (core/coast_roads.js)
            const i = Math.floor(p.x / T) + GRID_CONFIG.HALF_TILES, j = Math.floor(p.z / T) + GRID_CONFIG.HALF_TILES;
            if (!isRoadTile(i, j)) return true;
            if (p.y === Y.median) return true;
            // Di petak jalan: hanya trotoar kolektor (|offset| >= 2.9 dari as jalan yang melintas)
            const ox = Math.abs(p.x - tc(i)), oz = Math.abs(p.z - tc(j));
            const v = roadAtV(i, j), h = roadAtH(i, j);
            if (v && h) return false;
            const lim = c => (c === 2 ? 2.9 : c === 1 ? 2.6 : 99);       // kolektor: trotoar, gang: bahu rumput
            if (v) return ox >= lim(v);
            return oz >= lim(h);
        });
        // y akhir dari permukaan nyata (core/surface_index.js): gumpalan pekarangan Have-Not tidak menutup
        // sudut kavling, jadi tebakan Y.yard bisa melayang 8 cm di atas tanah. Titik di aspal/parit/air dibuang.
        const S = getSurfaceIndex();
        const snapped = S ? kept.map(p => {
            if (p.planter) return p;      // pelataran alun-alun di atas air: y = puncak bedeng (PLANTER), bukan indeks
            const y = S.plant(p.x, p.z, 0.3);
            return y == null ? null : { ...p, y };
        }).filter(Boolean) : kept;
        return this.dedupe(snapped);
    }

    /**
     * Desa Have dirimbunkan (2026-11-13 lanjutan): bahu gang, kluster taman, sudut kavling kosong,
     * baris pohon di luar tepi barat/utara/selatan desa.
     */
    collectHaveExtra(add, { minI, maxJ, minJ, rMin, runs }) {
        // a. Bahu rumput gang (aspal 2.7 m di petak 8 m -> sisa 2.65 m per sisi). Bukan kolom tepi sungai
        //    (abutmen jembatan gang), bukan sisi yang bertetangga arteri (aspal arteri 10 m meluber 1 m).
        for (const r of runs.v) {
            if (r.cls !== 1 || r.i >= rMin - 1) continue;
            for (let j = r.j0; j <= r.j1; j++) {
                if (roadAt(r.i, j) !== 1 || roadAtH(r.i, j)) continue;
                for (const s of [-1, 1]) {
                    if (roadAt(r.i + s, j) === 3 || hash(r.i, j, s + 201) < 0.3) continue;
                    add(hash(r.i, j, 203) < 0.7 ? pickStreet(hash(r.i, j, s + 207)) : pickFlower(hash(r.i, j, s + 209)), tc(r.i) + s * 3.05, tc(j) + (hash(r.i, j, s + 205) - 0.5) * 3, Y.ground);
                }
            }
        }
        for (const r of runs.h) {
            if (r.cls !== 1) continue;
            for (let i = r.i0; i <= r.i1; i++) {
                if (i >= rMin - 1 || roadAt(i, r.j) !== 1 || roadAtV(i, r.j)) continue;
                for (const s of [-1, 1]) {
                    if (roadAt(i, r.j + s) === 3 || hash(i, r.j, s + 211) < 0.3) continue;
                    add(hash(i, r.j, 213) < 0.7 ? pickStreet(hash(i, r.j, s + 217)) : pickFlower(hash(i, r.j, s + 219)), tc(i) + (hash(i, r.j, s + 215) - 0.5) * 3, tc(r.j) + s * 3.05, Y.ground);
                }
            }
        }
        // b. Kluster di setiap petak taman Have (dedupe menjauhkan dari pohon grid.js & pohon tepi)
        for (let j = minJ; j <= maxJ; j++) {
            for (let i = minI; i < rMin; i++) {
                if (!isOpenSpace(i, j)) continue;
                for (let k = 0; k < 4; k++) {
                    const a = (k + hash(i, j, 221)) * Math.PI / 2;
                    const rr = 1.8 + hash(i, j, 223 + k) * 1.4;
                    add(hash(i, j, 227 + k) < 0.6 ? pickShade(hash(i, j, 229 + k)) : pickFlower(hash(i, j, 230 + k)), tc(i) + Math.cos(a) * rr, tc(j) + Math.sin(a) * rr, Y.park);
                }
            }
        }
        // c. Sudut kavling KOSONG Have (hilang saat kavling diklaim -> refresh())
        for (let j = minJ; j <= maxJ; j++) {
            for (let i = minI; i < rMin; i++) {
                if (!isLotTile(i, j) || hash(i, j, 231) < 0.25) continue;
                const n = hash(i, j, 233) < 0.5 ? 2 : 3;
                const c0 = Math.floor(hash(i, j, 235) * 4);
                for (let k = 0; k < n; k++) {
                    const c = (c0 + k) % 4, sx = c & 1 ? 1 : -1, sz = c & 2 ? 1 : -1;
                    const r = hash(i, j, 237 + k);
                    add(r < 0.45 ? pickFlower(hash(i, j, 247 + k)) : r < 0.8 ? pickStreet(hash(i, j, 249 + k)) : pickShade(hash(i, j, 251 + k)),
                        tc(i) + sx * (2.5 + hash(i, j, 241 + k) * 0.7), tc(j) + sz * (2.5 + hash(i, j, 245 + k) * 0.7), Y.lot, [i + ',' + j]);
                }
            }
        }
        // d. Baris pohon di luar tepi desa: barat (kolom minI-1), utara (j maxJ+2, di luar arteri 129-130),
        //    selatan (j minJ-1, di luar arteri 86-87) kecuali slab stadion X -258..-78.
        const xW = wx(minI) - 4.5;
        for (let z = wx(minJ) + 2; z < wx(maxJ + 1) + 12; z += 6.5) {
            const zz = z + (hash(7, Math.round(z), 251) - 0.5) * 2;
            const j = Math.floor(zz / T) + GRID_CONFIG.HALF_TILES;
            if (roadAt(minI - 1, j)) continue;
            add(hash(3, j, 253) < 0.6 ? pickShade(hash(4, j, 254)) : pickStreet(hash(6, j, 256)), xW + (hash(5, j, 255) - 0.5) * 1.5, zz, Y.ground);
        }
        const jN = maxJ + 2, jS = minJ - 1;
        for (let x = wx(minI) + 3; x < -22; x += 6.5) {
            const xx = x + (hash(Math.round(x), 9, 257) - 0.5) * 2;
            const ii = Math.floor(xx / T) + GRID_CONFIG.HALF_TILES;
            if (!roadAt(ii, jN))
                add(hash(Math.round(x), 1, 259) < 0.6 ? pickShade(hash(Math.round(x), 1, 260)) : pickStreet(hash(Math.round(x), 1, 262)), xx, tc(jN) - 1 + (hash(Math.round(x), 2, 261) - 0.5) * 1.5, Y.ground);
            if (!(xx > -262 && xx < -74) && !roadAt(ii, jS))
                add(hash(Math.round(x), 3, 263) < 0.6 ? pickShade(hash(Math.round(x), 3, 264)) : pickStreet(hash(Math.round(x), 3, 266)), xx, tc(jS) - 1.5, Y.ground);
        }
    }

    /** Buang titik yang terlalu rapat (antar titik + pohon/lampu bawaan grid.js). Urutan = prioritas. */
    dedupe(pts) {
        const cell = 4, map = new Map();
        const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
        const near = (x, z, d) => {
            const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
                const l = map.get((cx + a) + ',' + (cz + b));
                if (l && l.some(q => (q.x - x) ** 2 + (q.z - z) ** 2 < d * d)) return true;
            }
            return false;
        };
        const put = p => { const k = key(p.x, p.z); if (!map.has(k)) map.set(k, []); map.get(k).push(p); };
        // Penghalang: pohon taman, pohon kolektor & lampu jalan grid.js (rumus sama dengan grid.js)
        const { minI, maxI, minJ, maxJ } = roadNetworkInfo();
        for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
            if (!isOpenSpace(i, j) || wx(i) + T / 2 >= GRID_CONFIG.RIVER_MIN_X) continue;
            const h = (i * 73856093) ^ (j * 19349663);
            if ((h >>> 0) % 3 === 0) continue;
            put({ x: tc(i) + (((h >>> 3) % 5) - 2) * 0.7, z: tc(j) + (((h >>> 7) % 5) - 2) * 0.7 });
        }
        const runs = roadRuns();
        for (const r of runs.v) if (r.cls === 2) {
            for (let j = r.j0 + 1; j <= r.j1 - 1; j += 4) { put({ x: tc(r.i) - 3.5, z: tc(j) }); put({ x: tc(r.i) + 3.5, z: tc(j) + 2 }); }
            for (let j = r.j0 + 2; j <= r.j1 - 1; j += 6) { put({ x: tc(r.i) - 3.2, z: tc(j) }); put({ x: tc(r.i) + 3.2, z: tc(j) }); }
        }
        for (const r of runs.h) if (r.cls === 2) {
            for (let i = r.i0 + 1; i <= r.i1 - 1; i += 4) { put({ x: tc(i), z: tc(r.j) - 3.5 }); put({ x: tc(i) + 2, z: tc(r.j) + 3.5 }); }
            for (let i = r.i0 + 2; i <= r.i1 - 1; i += 6) { put({ x: tc(i), z: tc(r.j) - 3.2 }); put({ x: tc(i), z: tc(r.j) + 3.2 }); }
        }
        const out = [];
        for (const p of pts) {
            if (p.x > 0) { out.push(p); continue; }          // Have-Not tidak diubah (sudah organik)
            const d = (p.sp === 'shade' || p.sp === 'maple' || p.sp === 'tallpine') ? 3.2 : p.sp === 'banana' ? 1.8 : 2.4;
            if (near(p.x, p.z, d)) continue;
            put(p); out.push(p);
        }
        return out;
    }

    build() {
        const pts = this.collect();
        const byKey = new Map();
        for (const p of pts) {
            const S = SPECIES[p.sp];
            if (!pfGeo(S.id)) continue;
            const key = S.v + ':' + p.sp;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(p);
        }
        // ---- LOD: mesh DEKAT (model Polyfork asli) per spesies + mesh JAUH (proksi ±30 segitiga) ----
        const mats = (p, sx, sy, sz) => new THREE.Matrix4().compose(
            new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(UP, p.ry), new THREE.Vector3(sx, sy, sz));
        const farCount = { round: 0, palm: 0 };
        for (const [key, list] of byKey) {
            const spName = key.split(':')[1];
            const S = SPECIES[spName];
            const src = pfGeo(S.id);
            const bb = src.boundingBox, bh = bb.max.y - bb.min.y;
            const maxR = Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z);
            const crown = avgColor(src, bh * 0.55, Infinity);
            // Geometri per mesh (atribut dibagi pakai); boundingSphere dihitung ulang tiap pembaruan LOD
            const geo = new THREE.BufferGeometry();
            for (const name in src.attributes) geo.setAttribute(name, src.attributes[name]);
            geo.setIndex(src.index);
            geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);

            const im = new THREE.InstancedMesh(geo, this.material, list.length);
            im.name = `city_trees_${key.replace(':', '_')}`;
            im.castShadow = S.shadow;
            im.receiveShadow = false;
            im.raycast = () => {};                     // jangan ganggu raycast kavling
            const entry = { mesh: im, n: 0, box: new THREE.Box3() };
            list.forEach((p, k) => {
                const xs = Math.round(p.x * 10), zs = Math.round(p.z * 10);
                const t = hash(xs, zs, 1);
                const s = (S.h[0] + (S.h[1] - S.h[0]) * t) / bh;
                p.ry = hash(xs, zs, 2) * Math.PI * 2;
                p.H = bh * s; p.R = maxR * s;
                const v = 0.86 + hash(xs, zs, 3) * 0.22;
                p.col = new THREE.Color().setRGB(v, v * (0.98 + hash(k, 3, 4) * 0.06), v * 0.96);
                p.fcol = crown.clone().multiply(p.col);
                p.mh = mats(p, s, s, s);
                p.ml = mats(p, p.R * (spName === 'palm' ? 0.8 : 0.92), p.H, p.R * (spName === 'palm' ? 0.8 : 0.92));
                p.near = entry;
                p.far = spName === 'palm' ? 'palm' : 'round';
                p.isNear = false;
                farCount[p.far]++;
                if (p.planter) {          // bedeng rumput: proksi bulat dibenam, setengah atas lensa = gundukan
                    p.mp = new THREE.Matrix4().compose(new THREE.Vector3(p.x, PLANTER.deck - 0.66 * PLANTER.h, p.z),
                        new THREE.Quaternion().setFromAxisAngle(UP, p.ry), new THREE.Vector3(PLANTER.r, PLANTER.h, PLANTER.r));
                    farCount.round++;
                }
                im.setColorAt(k, p.col);   // instanceColor wajib ada di SEMUA mesh bermaterial vertexColors ini
            });
            this.group.add(im);
            entry.pts = list; entry.key = key;
            this.meshes.push(entry);
        }
        // Mesh jauh: 2 proksi (pohon bulat, palem) untuk semua spesies; warna tajuk rata-rata spesies via instanceColor
        this.far = {};
        const all = [].concat(...this.meshes.map(e => e.pts));
        const fbox = new THREE.Box3();
        for (const p of all) {
            fbox.expandByPoint(new THREE.Vector3(p.x - p.R, p.y, p.z - p.R));
            fbox.expandByPoint(new THREE.Vector3(p.x + p.R, p.y + p.H, p.z + p.R));
        }
        for (const kind of ['round', 'palm']) {
            if (!farCount[kind]) continue;
            const geo = proxyGeometry(kind);
            geo.boundingSphere = fbox.getBoundingSphere(new THREE.Sphere());
            const im = new THREE.InstancedMesh(geo, this.material, farCount[kind]);
            im.name = `city_trees_far_${kind}`;
            im.castShadow = true;
            im.receiveShadow = false;
            im.raycast = () => {};
            for (let k = 0; k < farCount[kind]; k++) im.setColorAt(k, WHITE);
            this.group.add(im);
            this.far[kind] = { mesh: im, n: 0 };
        }
        this.refresh();
        console.log(`[Pohon Kota] ${this.counts.W} pohon Desa Have + ${this.counts.E} pohon Desa Have-Not (${this.meshes.length} InstancedMesh dekat + ${Object.keys(this.far).length} jauh).`);
    }

    /** Susun ulang daftar pohon aktif: pohon yang kavlingnya kini berisi bangunan disembunyikan. */
    refresh() {
        const counts = { W: 0, E: 0 };
        this.active = [];
        for (const { pts, key } of this.meshes) {
            for (const p of pts) {
                if (p.need && p.need.some(t => this.occupied(...t.split(',').map(Number)))) continue;
                this.active.push(p);
                counts[key[0]]++;
            }
        }
        this.counts = counts;
        this.dirty = false;
        this.applyLOD(true);
    }

    /**
     * Pilih model dekat/jauh per pohon menurut jarak ke kamera (histeresis 12 m agar tidak berkedip),
     * lalu salin matriks ke mesh dekat/jauh. Mesh tanpa instance disembunyikan (tidak memakan draw call).
     */
    applyLOD(force = false) {
        const cam = this.cam ? this.cam.position : null;
        if (cam) {
            if (!force && this.lodPos && this.lodPos.distanceToSquared(cam) < LOD_MOVE * LOD_MOVE) return;
            this.lodPos = (this.lodPos || new THREE.Vector3()).copy(cam);
        }
        for (const e of this.meshes) { e.n = 0; e.box.makeEmpty(); }
        for (const k in this.far) this.far[k].n = 0;
        // Bedeng pohon alun-alun selalu tampil (tidak ikut LOD), di mesh jauh "round"
        const fr = this.far.round;
        if (fr) for (const p of this.active) {
            if (!p.mp) continue;
            fr.mesh.setMatrixAt(fr.n, p.mp);
            fr.mesh.setColorAt(fr.n, PLANTER.col);
            fr.n++;
        }
        const L = this.lodNear || LOD_NEAR;          // lodNear bisa diubah saat uji (mis. 1e9 = tanpa LOD)
        const n2 = L * L, f2 = (L + 12) ** 2;
        for (const p of this.active) {
            let near = true;
            if (cam) {
                const dx = p.x - cam.x, dy = p.y + p.H * 0.5 - cam.y, dz = p.z - cam.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                near = d2 < n2 || (p.isNear && d2 < f2);
            }
            p.isNear = near;
            if (near || !this.far[p.far]) {
                const e = p.near;
                e.mesh.setMatrixAt(e.n, p.mh);
                e.mesh.setColorAt(e.n, p.col);
                e.n++;
                _v.set(p.x - p.R, p.y, p.z - p.R); e.box.expandByPoint(_v);
                _v.set(p.x + p.R, p.y + p.H, p.z + p.R); e.box.expandByPoint(_v);
            } else {
                const f = this.far[p.far];
                f.mesh.setMatrixAt(f.n, p.ml);
                f.mesh.setColorAt(f.n, p.fcol);
                f.n++;
            }
        }
        for (const e of [...this.meshes, ...Object.values(this.far)]) {
            const m = e.mesh;
            m.count = e.n;
            m.visible = e.n > 0;
            m.instanceMatrix.needsUpdate = true;
            m.instanceColor.needsUpdate = true;
            if (e.box && e.n) e.box.getBoundingSphere(m.geometry.boundingSphere);
        }
        this.nearCount = this.meshes.reduce((a, e) => a + e.n, 0);
    }

    update(dt) {
        if (!this.meshes.length) return;
        this.timer += dt;
        if (this.dirty && this.timer >= 0.5) { this.timer = 0; this.refresh(); return; }
        this.lodTimer = (this.lodTimer || 0) + dt;
        if (this.lodTimer >= 0.25) { this.lodTimer = 0; this.applyLOD(); }
    }
}

// ---------------- LOD helper ----------------
const LOD_NEAR = 140;      // m dari kamera: lebih dekat = model Polyfork asli, lebih jauh = proksi
// (85 m dulu terlalu pendek: di view zona/kota hampir semua pohon jadi proksi generik -> tampak seragam)
// Bedeng pohon di pelataran alun-alun: proksi bulat (lensa ikosahedron y 0.33h..0.99h) dengan pusat lensa tepat di
// permukaan paving -> batang & separuh bawah lensa terbenam di badan pelataran (tebal 0.5), separuh atas = gundukan
// rumput setinggi 0.23 m, jari-jari 1.35 m. Pohon berdiri di puncak gundukan.
const PLANTER = { deck: 0.495, h: 0.7, r: 1.35, top: 0.495 + 0.33 * 0.7, col: new THREE.Color(0x5E9446).convertSRGBToLinear() };
const LOD_MOVE = 6;        // susun ulang LOD bila kamera bergeser > 6 m (dicek 4x per detik)
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);
const _v = new THREE.Vector3();

/** Warna vertex rata-rata pada rentang tinggi [y0, y1) (warna tajuk spesies untuk proksi jauh). */
function avgColor(geo, y0, y1) {
    const pos = geo.attributes.position, col = geo.attributes.color;
    const c = new THREE.Color(0, 0, 0);
    if (!col) return c.setRGB(0.35, 0.55, 0.3);
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < y0 || y >= y1) continue;
        c.r += col.getX(i); c.g += col.getY(i); c.b += col.getZ(i); n++;
    }
    return n ? c.multiplyScalar(1 / n) : c.setRGB(0.35, 0.55, 0.3);
}

/**
 * Proksi satuan (tinggi 1, jari-jari tajuk 1) dengan vertex color: batang cokelat, tajuk putih
 * (diwarnai instanceColor = warna tajuk spesies). round: ikosahedron pipih + batang 5 sisi (26 segitiga);
 * palm: payung kerucut 7 sisi + batang ramping (24 segitiga).
 */
function proxyGeometry(kind) {
    const parts = kind === 'palm'
        ? [[new THREE.CylinderGeometry(0.035, 0.06, 0.8, 5, 1, true).translate(0, 0.4, 0), TRUNK],
            [new THREE.ConeGeometry(1, 0.26, 7, 1).translate(0, 0.86, 0), LEAF]]
        : [[new THREE.CylinderGeometry(0.08, 0.11, 0.42, 5, 1, true).translate(0, 0.21, 0), TRUNK],
            [new THREE.IcosahedronGeometry(1, 0).scale(1, 0.33, 1).translate(0, 0.66, 0), LEAF]];
    const P = [], N = [], C = [];
    for (const [g0, c] of parts) {
        const g = g0.index ? g0.toNonIndexed() : g0;
        P.push(...g.attributes.position.array);
        N.push(...g.attributes.normal.array);
        for (let i = 0; i < g.attributes.position.count; i++) C.push(c[0], c[1], c[2]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    return geo;
}
const TRUNK = [0.55, 0.42, 0.33];   // dikali warna tajuk -> cokelat zaitun di kejauhan
const LEAF = [1, 1, 1];
