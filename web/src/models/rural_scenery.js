/**
 * AUDIRA-LAND: Pemandangan Pedesaan Desa Have-Not (sisi timur sungai, X > +16 m)
 *
 * Semua diletakkan DI LUAR batas peta aktif (X > 200, |Z| > 176) supaya tidak menutup
 * kavling yang bisa diklaim warga:
 *  - Sawah petak-petak dengan pematang, beragam fase tanam (baru digenangi, hijau muda,
 *    hijau tua, menguning), berundak (terasering) makin ke timur mendekati gunung.
 *  - Kali kecil berkelok membelah sawah + tepian tanah + jembatan bambu.
 *  - Bukit hijau di kaki gunung dan barisan gunung (satu gunung api berpuncak abu-abu)
 *    di cakrawala timur dengan kabut udara (aerial perspective) yang dipanggang ke warna.
 *  - Pohon kelapa, rumpun bambu, pohon rindang, gubuk sawah, orang-orangan sawah, kerbau.
 *
 * Deterministik (seed tetap), Zero-Submerging: setiap objek berdiri di atas permukaannya.
 * Seluruh isi dilebur oleh bakeStatic -> tambahan draw call kecil.
 */

import { bakeStatic } from '../core/static_batcher.js';
import { pfMesh, RURAL_TREES, FRUIT_IDS as FRUIT } from './polyfork_library.js';

// Kebun buah di kaki gunung api: jalur sawah berundak timur antara kali dan kaki bukit (±56 x 280 m).
// Petak tetap membangun undakan tanah (tidak bolong), isinya 2 pohon buah; 1 jenis per blok 2x4 petak.
const ORCH = { x0: 324, x1: 378, z0: -150, z1: 172 };   // z > 132 & x < 354 = tambak (fishing.js)
export const inOrchard = (x, z) => x > ORCH.x0 && x < ORCH.x1 && z > ORCH.z0 && z < ORCH.z1;

import { makeWaterMaterial } from '../core/water.js';
import { WaterfallFX, Anglers } from './water_life.js';
import { EAST_EDGE_X, EAST_DX as DX } from '../core/constants.js';
import { inFarm } from './polyfork_farm.js';
import { inZoo } from './zoo.js';
import { onCoastRoad } from '../core/coast_roads.js';

// --- Batas peta aktif (lihat GRID_CONFIG.ACTIVE_*) ---
const MAP_MAX_X = EAST_EDGE_X;   // 264 m sejak Have-Not diperluas; semua X timur + DX
const MAP_Z = 176;

// Warna ditulis dalam sRGB (seperti di color picker); renderer bekerja linear + output sRGB,
// jadi dikonversi agar hijau sawah tidak pudar jadi pastel.
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Jalur kali: x sebagai fungsi z
const streamX = z => 236 + DX + 13 * Math.sin(z / 52) + 5 * Math.sin(z / 19 + 1.3);
const STREAM_HALF = 3.6;

// Saluran sungai lebar: keluar dari sungai utama (sisi timur, z≈226) berkelok ke kali kaki gunung
export const CHANNEL = (() => {
    const ctrl = [[6, 222], [34, 236], [78, 247], [128, 250], [176, 257], [212 + DX * 0.5, 264], [212 + DX, 266], [streamX(270), 270]];
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const n = 90;
    const pts = curve.getSpacedPoints(n).map((p, i) => ({ x: p.x, z: p.z, half: 13 - 9 * (i / n) }));
    return pts;
})();
const distToChannel = (x, z) => {
    let best = Infinity;
    for (const p of CHANNEL) best = Math.min(best, Math.hypot(x - p.x, z - p.z) - p.half);
    return best;
};

// Air terjun di kaki gunung api timur: tebing menghadap barat, kolam di bawahnya, lalu anak kali
// mengalir ke barat masuk ke kali kecil (streamX). Posisi dipilih di tempat lereng gunung masih y~0.
const FALL = { lipX: 334.5 + DX, z: -12, topY: 20, width: 5, poolX: 328 + DX, poolRX: 7.2, poolRZ: 6.2, poolY: 0.085 };
const CREEK = (() => {
    const zAt = x => FALL.z + 3.5 * Math.sin((x - 322 - DX) / 17);
    let xEnd = 240 + DX;
    for (let k = 0; k < 4; k++) xEnd = streamX(zAt(xEnd)) + STREAM_HALF;   // berhenti tepat di tepi kali
    const pts = [], n = 40;
    for (let k = 0; k <= n; k++) {
        const x = 321.5 + DX - (321.5 + DX - xEnd) * (k / n);
        pts.push({ x, z: zAt(x), half: 1.8 + 0.7 * (k / n) });
    }
    return pts;
})();
const distToCreek = (x, z) => {
    let best = Math.hypot((x - FALL.poolX) / FALL.poolRX, (z - FALL.z) / FALL.poolRZ) * FALL.poolRX - FALL.poolRX;
    for (const p of CREEK) best = Math.min(best, Math.hypot(x - p.x, z - p.z) - p.half);
    return best;
};

/**
 * Dermaga kayu (di luar kavling kota): 2 di tanggul sungai utama (|z| > 176, tak ada jembatan
 * di sana) dan 2 di tepi saluran. Perahu tertambat sejajar tepian di kiri-kanan dermaga;
 * jaraknya dihitung agar tidak tersentuh perahu yang berlayar (lihat fishing_boats.js).
 */
export const DOCKS = (() => {
    const docks = [];
    const make = (sx, sz, dx, dz, o) => {
        const l = Math.hypot(dx, dz);
        dx /= l; dz /= l;
        const tx = dz, tz = -dx;                         // sejajar tepian
        const d = { shore: { x: sx, z: sz }, dir: { x: dx, z: dz }, ...o };
        const bx = sx + dx * o.boatDist, bz = sz + dz * o.boatDist;
        d.boats = [-1, 1].map((k, i) => ({
            x: bx + tx * k * o.boatGap, z: bz + tz * k * o.boatGap,
            yaw: Math.atan2(tx, tz) + (i ? Math.PI : 0), waterY: o.waterY, crew: i === 1
        }));
        d.seat = { x: sx + dx * (o.len - 0.45), z: sz + dz * (o.len - 0.45), y: o.deckY, yaw: Math.atan2(dx, dz) };
        docks.push(d);
    };
    // Sungai utama: tanggul di |x| 16..17, dasar sungai y -0.06
    const river = { len: 5.2, deckY: 0.6, boatDist: 3.9, boatGap: 3.3, waterY: 0.04, landUntil: 1.6, bedY: -0.06 };
    make(17.8, -215, -1, 0, river);
    make(-17.8, 205, 1, 0, river);
    // Saluran
    for (const [i, sgn] of [[22, 1], [46, -1]]) {
        const p = CHANNEL[i], q = CHANNEL[i + 1], r = CHANNEL[i - 1];
        let tx = q.x - r.x, tz = q.z - r.z;
        const l = Math.hypot(tx, tz);
        tx /= l; tz /= l;
        const sx = -tz * sgn, sz = tx * sgn;            // menunjuk ke tepi (sisi sgn)
        make(p.x + sx * (p.half + 1.6), p.z + sz * (p.half + 1.6), -sx, -sz,
            { len: 4.6, deckY: 0.55, boatDist: 3.2, boatGap: 3.2, waterY: 0.045, landUntil: 1.6, bedY: -0.03 });
    }
    return docks;
})();

/** Pita (ribbon) sepanjang polyline. offA/offB = jarak tepi kiri/kanan dari garis tengah. */
function ribbon(points, offA, offB, y, vScale = 0.08) {
    const pos = [], uv = [];
    let acc = 0;
    const side = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const q = points[Math.min(points.length - 1, i + 1)];
        const r = points[Math.max(0, i - 1)];
        let tx = q.x - r.x, tz = q.z - r.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        if (i > 0) acc += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
        const a = offA(p), b = offB(p);
        side.push({ ax: p.x - tz * a, az: p.z + tx * a, bx: p.x - tz * b, bz: p.z + tx * b, v: acc * vScale });
    }
    for (let i = 0; i < side.length - 1; i++) {
        const s0 = side[i], s1 = side[i + 1];
        const A = [s0.ax, y, s0.az], B = [s0.bx, y, s0.bz], C = [s1.ax, y, s1.az], D = [s1.bx, y, s1.bz];
        // Urutan segitiga dipilih agar menghadap ke atas
        pos.push(...A, ...C, ...B, ...B, ...C, ...D);
        uv.push(0, s0.v, 0, s1.v, 1, s0.v, 1, s0.v, 0, s1.v, 1, s1.v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const nrm = new Float32Array(pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    // Pastikan winding menghadap atas (cek segitiga pertama)
    if (pos.length >= 9) {
        const e1x = pos[3] - pos[0], e1z = pos[5] - pos[2], e2x = pos[6] - pos[0], e2z = pos[8] - pos[2];
        if (e1z * e2x - e1x * e2z < 0) {
            const p = geo.attributes.position.array, u = geo.attributes.uv.array;
            for (let t = 0; t < p.length; t += 9) for (let k = 0; k < 3; k++) { const tmp = p[t + 3 + k]; p[t + 3 + k] = p[t + 6 + k]; p[t + 6 + k] = tmp; }
            for (let t = 0; t < u.length; t += 6) for (let k = 0; k < 2; k++) { const tmp = u[t + 2 + k]; u[t + 2 + k] = u[t + 4 + k]; u[t + 4 + k] = tmp; }
        }
    }
    return geo;
}

const COL = {
    pematang: 0x7C8A48,
    tanah: 0x8A7352,
    tanahGelap: 0x6B5A40,
    padiMuda: 0x93BC57,
    padiTua: 0x5E9A3A,
    padiKuning: 0xCDB750,
    rumput: 0x6A9A45,
    batang: 0x7A5C3E,
    kelapaDaun: 0x4F8A35,
    bambu: 0x8BA34A,
    bambuDaun: 0x5C8E3A,
    daun: 0x4C7F34,
    daunTua: 0x3D6B2C,
    atapIjuk: 0x3A2E26,
    kayu: 0x8C6A45,
    kerbau: 0x4A4642,
    kain: 0xB8483A,
    caping: 0xD8B46A
};

export class RuralScenery {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'rural_scenery';
        this.rand = rng(20261113);
        this.treeSpots = [];
        this.mats = new Map();

        this.geo = {
            box: new THREE.BoxGeometry(1, 1, 1),
            cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
            cone: new THREE.ConeGeometry(0.5, 1, 7),
            ico: new THREE.IcosahedronGeometry(0.5, 1)
        };
        this.waterMat = new THREE.MeshPhongMaterial({ color: lin(0x6E9A9C), specular: lin(0xBFD8DC), shininess: 70 });
        this.streamMat = makeWaterMaterial({ color: 0x3F92B4, repeatU: 1, repeatV: 1, flow: 0.25 });

        // Petak sawah hiasan yang bisa diklik (diisi buildRiceFields): {cx,cz,hw,hd,phase,icon,ripe}
        this.sawahPetak = [];

        this.buildGroundExtension();
        this.buildStream();
        this.buildChannel();
        this.buildWaterfall();
        this.buildDocks();
        this.buildRiceFields();
        this.buildHills();
        this.buildMountains();
        this.buildTreeLines();

        // Lebur semua jadi sedikit draw call (chunk besar: area ini dilihat dari jauh)
        const baked = bakeStatic(this.group, { chunkSize: 260 });
        this.group.add(baked);
        this.scene.add(this.group);

        // Bagian bergerak (tidak dilebur): tirai air terjun + buih, pemancing
        this.waterfall = new WaterfallFX(this.scene, {
            lipX: FALL.lipX - 0.08, z: FALL.z, topY: FALL.topY + 0.06, poolY: FALL.poolY,
            width: FALL.width, outward: 1.2, poolRadius: FALL.poolRX
        });
        this.anglers = new Anglers(this.scene, this.anglerSpots());
    }

    mat(hex) {
        if (!this.mats.has(hex)) this.mats.set(hex, new THREE.MeshLambertMaterial({ color: lin(hex) }));
        return this.mats.get(hex);
    }

    /** Tambah primitive. y = alas objek (bottom), bukan pusat. */
    prim(kind, color, sx, sy, sz, x, y, z, ry = 0, cast = true, rx = 0, rz = 0) {
        const m = new THREE.Mesh(this.geo[kind], typeof color === 'number' ? this.mat(color) : color);
        m.scale.set(sx, sy, sz);
        m.position.set(x, y + sy / 2, z);
        m.rotation.set(rx, ry, rz);
        m.castShadow = cast;
        m.receiveShadow = true;
        this.group.add(m);
        return m;
    }

    jitterColor(hex, amt) {
        const c = new THREE.Color(hex);
        const k = 1 + (this.rand() - 0.5) * amt;
        c.multiplyScalar(k);
        return c.getHex();
    }

    /** Petak sawah hiasan di titik dunia (x,z), atau null. Dipakai klik kavling di luar grid kota. */
    riceFieldAt(x, z) {
        const list = this.sawahPetak;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (Math.abs(x - p.cx) <= p.hw && Math.abs(z - p.cz) <= p.hd) return p;
        }
        return null;
    }

    // ---------------------------------------------------------------------
    // Tanah luas di luar peta (dasar sawah & kaki gunung)
    // ---------------------------------------------------------------------
    buildGroundExtension() {
        // Z -440..650: berhenti di garis pantai selatan (pulau, island_railway.js), tak lagi menjorok ke laut
        const g = new THREE.PlaneGeometry(900, 1090);
        g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, this.mat(COL.rumput));
        // y sedikit di bawah terrain kota (0) agar tumpang-tindih tidak z-fighting
        m.position.set(MAP_MAX_X + 120 + 450, -0.03, 105);
        m.receiveShadow = true;
        this.group.add(m);
    }

    // ---------------------------------------------------------------------
    // Kali kecil berkelok + tepian tanah + jembatan bambu
    // ---------------------------------------------------------------------
    buildStream() {
        const pts = [];
        for (let k = 0; k <= 132; k++) { const z = -330 + 660 * (k / 132); pts.push({ x: streamX(z), z }); }
        const add = (geo, material) => {
            const m = new THREE.Mesh(geo, material);
            m.receiveShadow = true;
            this.group.add(m);
        };
        add(ribbon(pts, () => -STREAM_HALF, () => STREAM_HALF, 0.05), this.streamMat);
        add(ribbon(pts, () => -STREAM_HALF - 2.6, () => -STREAM_HALF, 0.03), this.mat(COL.tanah));
        add(ribbon(pts, () => STREAM_HALF, () => STREAM_HALF + 2.6, 0.03), this.mat(COL.tanah));

        // Jembatan bambu sederhana di beberapa titik
        for (const z of [-200, -40, 120, 260]) {
            const x = streamX(z);
            const ang = Math.atan2(streamX(z + 1) - x, 1); // kemiringan kali
            // Lantai bambu melintang kali (sumbu X), ditopang 4 tiang yang berdiri di tepian
            this.prim('box', COL.bambu, STREAM_HALF * 2 + 4, 0.18, 2.2, x, 0.55, z, -ang, true);
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    this.prim('cyl', COL.batang, 0.16, 1.4, 0.16, x + sx * (STREAM_HALF + 1.4), 0.0, z + sz * 0.9, 0, true);
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Saluran sungai lebar dari sungai utama ke kali kaki gunung
    // ---------------------------------------------------------------------
    buildChannel() {
        const add = (geo, material) => {
            const m = new THREE.Mesh(geo, material);
            m.receiveShadow = true;
            this.group.add(m);
        };
        add(ribbon(CHANNEL, p => -p.half, p => p.half, 0.045), this.streamMat);
        add(ribbon(CHANNEL, p => -p.half - 3, p => -p.half, 0.035), this.mat(COL.tanah));
        add(ribbon(CHANNEL, p => p.half, p => p.half + 3, 0.035), this.mat(COL.tanah));
        add(ribbon(CHANNEL, p => -p.half - 4.2, p => -p.half - 3, 0.03), this.mat(COL.rumput));
        // Pohon kelapa & bambu menyusuri tepian
        for (let i = 3; i < CHANNEL.length; i += 6) {
            const p = CHANNEL[i];
            const sgn = i % 12 === 3 ? 1 : -1;
            const q = CHANNEL[Math.min(CHANNEL.length - 1, i + 1)];
            const tx = q.x - p.x, tz = q.z - p.z, l = Math.hypot(tx, tz) || 1;
            this.treeSpots.push([p.x - (tz / l) * sgn * (p.half + 5), 0, p.z + (tx / l) * sgn * (p.half + 5)]);
        }
    }

    // ---------------------------------------------------------------------
    // Air terjun: tebing batu + kolam + anak kali ke kali kecil
    // ---------------------------------------------------------------------
    buildWaterfall() {
        const F = FALL;
        const ROCK = 0x7A7368, ROCK_D = 0x5E5950, ROCK_L = 0x948C7E, MOSS = 0x5B8A3C;
        const add = (geo, material, y = 0) => {
            const m = new THREE.Mesh(geo, material);
            m.position.y = y;
            m.receiveShadow = true;
            this.group.add(m);
            return m;
        };
        // Tebing utama (muka barat rata tempat air jatuh) + punggungan di belakangnya menyatu ke lereng
        const zA = F.z - 9, zB = F.z + 9;
        this.prim('box', ROCK, 15.5, F.topY, zB - zA, F.lipX + 7.75, 0, F.z);
        this.prim('box', ROCK_D, 18, F.topY + 4.5, 24, 357 + DX, 0, F.z - 1, 0.08);
        this.prim('box', ROCK_D, 12, F.topY - 6, 10, 343 + DX, 0, zA - 3.5, -0.18);   // bahu selatan
        this.prim('box', ROCK_D, 11, F.topY - 4, 9, 342 + DX, 0, zB + 3, 0.22);      // bahu utara
        // Bongkah batu di sisi tirai (memecah siluet kotak) + lumut di bibir tebing
        const r = this.rand;
        for (const side of [-1, 1]) {
            for (let k = 0; k < 5; k++) {
                const h = F.topY * (0.25 + r() * 0.6);
                const w = 2.2 + r() * 2.5;
                this.prim('ico', k % 2 ? ROCK_L : ROCK, w, h, w * 1.1,
                    F.lipX + 0.6 + r() * 2.5, 0, F.z + side * (F.width / 2 + 1.4 + k * 1.1 + r()), r() * 3, true);
            }
            this.prim('box', MOSS, 6, 0.5, 3.2, F.lipX + 3, F.topY, F.z + side * (F.width / 2 + 1.8), r(), false);
        }
        this.prim('box', MOSS, 9, 0.4, 14, F.lipX + 11, F.topY, F.z - 1, 0.1, false);
        // Air di puncak tebing mengalir ke bibir (mata air keluar dari punggungan)
        const top = new THREE.PlaneGeometry(F.width, 13.6, 1, 1);
        top.rotateX(-Math.PI / 2);
        top.rotateY(Math.PI / 2);
        top.translate(F.lipX + 6.8, 0, F.z);
        add(top, this.streamMat, F.topY + 0.06);
        for (const side of [-1, 1]) this.prim('box', ROCK_L, 13.6, 0.45, 0.8, F.lipX + 6.8, F.topY, F.z + side * (F.width / 2 + 0.3), 0, false);

        // Kolam (elips) + batu tepian kecuali sisi barat (keluar ke anak kali)
        const pool = new THREE.CircleGeometry(1, 28);
        pool.rotateX(-Math.PI / 2);
        pool.scale(F.poolRX, 1, F.poolRZ);
        pool.translate(F.poolX, 0, F.z);
        add(pool, this.streamMat, F.poolY);
        const rim = new THREE.CircleGeometry(1, 28);
        rim.rotateX(-Math.PI / 2);
        rim.scale(F.poolRX + 1.8, 1, F.poolRZ + 1.8);
        rim.translate(F.poolX, 0, F.z);
        add(rim, this.mat(COL.tanahGelap), 0.015);
        for (let k = 0; k < 16; k++) {
            const a = -2.3 + (k / 15) * 4.6;            // sudut terhadap +X, celah di barat (pi)
            const s = 0.9 + r() * 1.3;
            this.prim('ico', k % 3 ? ROCK : ROCK_L, s * 1.3, s * 0.8, s,
                F.poolX + Math.cos(a) * (F.poolRX + 0.7), 0, F.z + Math.sin(a) * (F.poolRZ + 0.7), r() * 3, true);
        }
        // Batu di kaki tirai, sebagian tersembunyi buih
        for (let k = 0; k < 4; k++) {
            const s = 1 + r();
            this.prim('ico', ROCK_D, s, s * 0.6, s, F.lipX - 1.4 + r() * 0.8, 0, F.z + (r() - 0.5) * F.width, r() * 3, true);
        }

        // Anak kali ke kali kecil + tepian tanah
        add(ribbon(CREEK, p => -p.half, p => p.half, 0), this.streamMat, 0.062);
        add(ribbon(CREEK, p => -p.half - 1.6, p => -p.half, 0), this.mat(COL.tanah), 0.042);
        add(ribbon(CREEK, p => p.half, p => p.half + 1.6, 0), this.mat(COL.tanah), 0.042);
        // Pohon di sekitar kolam
        for (const [dx, dz] of [[-4, 11], [-9, -10], [3, 12.5], [-1, -11.5]]) this.treeSpots.push([F.poolX + dx, 0, F.z + dz]);
    }

    // ---------------------------------------------------------------------
    // Dermaga kayu (perahu tertambat ditangani fishing_boats.js)
    // ---------------------------------------------------------------------
    buildDocks() {
        const WOOD = 0x8C6A45, WOOD_D = 0x6B4E32;
        for (const D of DOCKS) {
            const { shore: s, dir: d, len, deckY } = D;
            const yaw = Math.atan2(d.x, d.z);
            const at = t => [s.x + d.x * t, s.z + d.z * t];
            // Papan lantai melintang (selang-seling warna)
            for (let t = 0.2, k = 0; t < len; t += 0.46, k++) {
                const [x, z] = at(t);
                this.prim('box', k % 3 ? WOOD : 0x9A7A52, 1.7, 0.08, 0.42, x, deckY - 0.08, z, yaw, false);
            }
            // Gelagar bawah
            for (const side of [-0.6, 0.6]) {
                const [x, z] = at(len / 2);
                this.prim('box', WOOD_D, 0.14, 0.14, len, x + d.z * side, deckY - 0.22, z - d.x * side, yaw, false);
            }
            // Tiang pancang: berdiri di darat (tepian) atau di dasar air; tiang ujung lebih tinggi (tambatan)
            for (const t of [0.3, 2.2, len - 1.6, len - 0.15]) {
                const [x, z] = at(t);
                const base = t < D.landUntil ? 0.0 : D.bedY;
                const topY = deckY - 0.08 + (t > len - 0.5 ? 0.55 : 0);
                for (const side of [-0.8, 0.8]) {
                    this.prim('cyl', WOOD_D, 0.17, topY - base, 0.17, x + d.z * side, base, z - d.x * side, 0, true);
                }
            }
        }
    }

    /** Tempat duduk pemancing: tanggul sungai (|z| > 176), tepi saluran, tepi kali, ujung dermaga. */
    anglerSpots() {
        const spots = [];
        const TANGGUL_Y = 0.31;
        for (const z of [-188, -197, -236, -248, 186, 196, 250]) spots.push({ x: 16.55, y: TANGGUL_Y, z, yaw: -Math.PI / 2 });
        for (const z of [-184, -205, -240, 190, 230, 250]) spots.push({ x: -16.55, y: TANGGUL_Y, z, yaw: Math.PI / 2 });
        [[10, 1], [32, -1], [58, 1], [70, -1], [82, 1]].forEach(([i, sgn]) => {
            const p = CHANNEL[i], q = CHANNEL[i + 1], r = CHANNEL[i - 1];
            let tx = q.x - r.x, tz = q.z - r.z;
            const l = Math.hypot(tx, tz);
            tx /= l; tz /= l;
            const sx = -tz * sgn, sz = tx * sgn;
            spots.push({ x: p.x + sx * (p.half + 0.9), y: 0.04, z: p.z + sz * (p.half + 0.9), yaw: Math.atan2(-sx, -sz) });
        });
        [[-262, 1], [-120, -1], [25, 1], [150, -1], [205, 1], [300, -1]].forEach(([z, sgn]) => {
            spots.push({ x: streamX(z) + sgn * (STREAM_HALF + 0.9), y: 0.035, z, yaw: Math.atan2(-sgn, 0) });
        });
        for (const D of DOCKS) spots.push({ ...D.seat });
        return spots;
    }

    // ---------------------------------------------------------------------
    // Sawah petak + pematang, berundak makin ke timur
    // ---------------------------------------------------------------------
    terraceTop(x) {
        if (x < 268 + DX) return 0.32;
        return 0.32 + (Math.floor((x - 268 - DX) / 13) + 1) * 0.85;
    }

    buildRiceFields() {
        const r = this.rand;
        const regions = [
            { x0: MAP_MAX_X + 6, x1: 334 + DX, z0: -300, z1: 300 },        // timur (berundak)
            { x0: 24, x1: MAP_MAX_X + 6, z0: MAP_Z + 8, z1: 300 },     // utara
            { x0: 24, x1: MAP_MAX_X + 6, z0: -300, z1: -MAP_Z - 8 }    // selatan
        ];
        this.gubukSpots = [];

        for (const R of regions) {
            const cw = 13, cd = 9.5;
            for (let x = R.x0; x + cw <= R.x1 + 0.01; x += cw) {
                // Blok fase tanam: beberapa petak berdampingan sefase (seperti sawah nyata)
                for (let z = R.z0; z + cd <= R.z1 + 0.01; z += cd) {
                    const cx = x + cw / 2, cz = z + cd / 2;
                    // Lewati saluran sungai lebar, kolam air terjun & anak kalinya
                    if (distToChannel(cx, cz) < 9.5) continue;
                    if (distToCreek(cx, cz) < 8.5) continue;
                    // Lahan kebun Polyfork (polyfork_farm.js) dikosongkan dari sawah
                    if (inFarm(cx, cz, Math.max(cw, cd) / 2 + 1)) continue;
                    // Kebun binatang di kaki gunung (zoo.js) + jalan masuknya dikosongkan dari sawah
                    if (inZoo(cx, cz, Math.max(cw, cd) / 2 + 1)) continue;
                    // Jalan akses pesisir (core/coast_roads.js) dikosongkan dari sawah
                    if (onCoastRoad(cx, cz, Math.max(cw, cd) / 2 + 1)) continue;
                    // Lewati jalur kali
                    if (Math.abs(cx - streamX(cz)) < cw / 2 + STREAM_HALF + 2.8) {
                        if (r() < 0.35) this.treeSpots.push([streamX(cz) + (r() < 0.5 ? -1 : 1) * (STREAM_HALF + 4.5), 0, cz]);
                        continue;
                    }
                    const top = this.terraceTop(cx);
                    if (inOrchard(cx, cz)) { this.orchardCell(x, z, cx, cz, cw, cd, top); continue; }
                    const roll = r();
                    if (roll < 0.018 && top < 1) { this.gubukSpots.push([cx, cz]); continue; }

                    const phaseNoise = Math.sin(cx * 0.031 + 1.7) + Math.cos(cz * 0.027) + (r() - 0.5) * 0.7;
                    let fill, phase, icon;
                    if (phaseNoise < -1.0) { fill = this.waterMat; phase = 'Baru digenangi'; icon = '💧'; }
                    else if (phaseNoise < -0.1) { fill = this.jitterColor(COL.padiMuda, 0.12); phase = 'Padi muda'; icon = '🌱'; }
                    else if (phaseNoise < 1.3) { fill = this.jitterColor(COL.padiTua, 0.12); phase = 'Padi menghijau'; icon = '🌾'; }
                    else { fill = this.jitterColor(COL.padiKuning, 0.1); phase = 'Siap panen'; icon = '🌾'; }

                    // Catat petak sawah agar bisa diklik (lookup riceFieldAt). Batas = badan petak (cw-0.5 x cd-0.5).
                    this.sawahPetak.push({ cx, cz, hw: (cw - 0.5) / 2, hd: (cd - 0.5) / 2, phase, icon, ripe: phaseNoise >= 1.3 });

                    // Badan petak (dari tanah sampai permukaan sawah) -> undakan terlihat
                    const body = this.prim('box', fill === this.waterMat ? COL.tanahGelap : fill,
                        cw - 0.5, top, cd - 0.5, cx, 0, cz, 0, top > 0.5);
                    body.castShadow = top > 0.5;
                    if (fill === this.waterMat) {
                        this.prim('box', this.waterMat, cw - 0.5, 0.02, cd - 0.5, cx, top, cz, 0, false);
                    } else {
                        // Baris tanaman padi -> petak terlihat sebagai sawah, bukan kotak hijau polos
                        this.riceRows(cx, cz, cw, cd, top, fill, phaseNoise);
                    }
                    // Pematang (utara & barat petak); undakan diberi dinding tanah
                    const dikeH = top + 0.22;
                    this.prim('box', COL.pematang, cw, dikeH, 0.5, cx, 0, z, 0, false);
                    this.prim('box', COL.pematang, 0.5, dikeH, cd, x, 0, cz, 0, false);

                    // Orang-orangan sawah di petak padi menguning
                    if (fill !== this.waterMat && phaseNoise >= 1.3 && r() < 0.08) this.scarecrow(cx, top, cz);
                    if (top < 1 && r() < 0.012) this.treeSpots.push([x, dikeH, z]);
                }
            }
        }

        this.gubukSpots.forEach(([x, z]) => this.gubuk(x, z));
        this.kerbau(streamX(60) + 7, 60, 0.4);
        this.kerbau(streamX(72) + 9, 72, 2.2);
        this.kerbau(streamX(-150) - 8, -150, 1.1);
    }

    /** Petak kebun buah: undakan tanah + pematang seperti sawah, 2 pohon sejenis per petak. */
    orchardCell(x, z, cx, cz, cw, cd, top) {
        const r = this.rand;
        this.prim('box', COL.rumput, cw - 0.5, top, cd - 0.5, cx, 0, cz, 0, top > 0.5);
        this.prim('box', COL.pematang, cw, top + 0.22, 0.5, cx, 0, z, 0, false);
        this.prim('box', COL.pematang, 0.5, top + 0.22, cd, x, 0, cz, 0, false);
        const id = FRUIT[(Math.floor(cx / 26) * 3 + Math.floor(cz / 38) + 70) % FRUIT.length];
        if (cz > 132 && cx < 354) return;
        for (const dx of [-3.2, 3.2]) {
            const m = pfMesh(id, { height: 3.6 + r() * 1.2 });
            if (!m) return;
            m.position.set(cx + dx, top + 0.02, cz);
            m.rotation.y = r() * Math.PI * 2;
            this.group.add(m);
        }
    }

    /** Larikan padi di satu petak sawah: baris tipis memanjang arah Z (murah, dibake). */
    riceRows(cx, cz, cw, cd, top, fill, phaseNoise) {
        const r = this.rand;
        // Warna baris sedikit lebih gelap/pekat dari permukaan -> larikan terlihat jelas
        const row = new THREE.Color(fill).multiplyScalar(0.8).getHex();
        const kuning = phaseNoise >= 1.3;
        const muda = phaseNoise < -0.1;
        const h = muda ? 0.16 : kuning ? 0.46 : 0.34;   // tinggi tanaman per fase
        const step = 1.8;                               // jarak antar baris (m)
        const n = Math.max(3, Math.floor((cw - 1.4) / step));
        const g = (cw - 1.4) / (n - 1);
        const x0 = cx - (cw - 1.4) / 2;
        const len = cd - 1.4;
        for (let i = 0; i < n; i++) {
            const px = x0 + i * g + (r() - 0.5) * 0.25;
            this.prim('box', row, 0.42, h * (0.85 + r() * 0.3), len, px, top, cz, 0, false);
            // Bulir menguning: beberapa titik kuning di atas baris
            if (kuning && r() < 0.6) {
                this.prim('cone', COL.padiKuning, 0.3, 0.26, 0.3, px, top + h, cz + (r() - 0.5) * len * 0.5, 0, false);
            }
        }
    }

    scarecrow(x, y, z) {
        this.prim('cyl', COL.batang, 0.08, 1.7, 0.08, x, y, z);
        this.prim('box', COL.batang, 1.3, 0.07, 0.07, x, y + 1.25, z);
        this.prim('box', COL.kain, 0.45, 0.55, 0.22, x, y + 0.85, z);
        this.prim('ico', COL.caping, 0.3, 0.3, 0.3, x, y + 1.55, z);
        this.prim('cone', COL.caping, 0.75, 0.22, 0.75, x, y + 1.78, z);
    }

    gubuk(x, z) {
        const h = 1.1, w = 3.2, d = 2.6;
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            this.prim('cyl', COL.batang, 0.14, 2.6, 0.14, x + px * w / 2.2, 0, z + pz * d / 2.2);
        }
        this.prim('box', COL.bambu, w, 0.14, d, x, h, z);                 // lantai panggung
        const roof = this.prim('cone', COL.atapIjuk, w * 1.55, 1.3, d * 1.55, x, 2.5, z, Math.PI / 4);
        roof.scale.set(w * 1.55, 1.3, d * 1.55);
        this.treeSpots.push([x + 4.5, 0, z + 1.5]);
    }

    kerbau(x, z, ry) {
        const g = new THREE.Group();
        const add = (kind, sx, sy, sz, px, py, pz) => {
            const m = new THREE.Mesh(this.geo[kind], this.mat(COL.kerbau));
            m.scale.set(sx, sy, sz);
            m.position.set(px, py, pz);
            m.castShadow = true;
            g.add(m);
        };
        add('box', 1.0, 0.75, 1.9, 0, 0.95, 0);          // badan
        add('box', 0.5, 0.5, 0.7, 0, 1.05, 1.15);        // kepala
        add('box', 1.1, 0.08, 0.1, 0, 1.35, 1.1);        // tanduk
        for (const [lx, lz] of [[-0.35, -0.7], [0.35, -0.7], [-0.35, 0.7], [0.35, 0.7]]) add('box', 0.18, 0.6, 0.18, lx, 0.3, lz);
        g.position.set(x, 0, z);
        g.rotation.y = ry;
        this.group.add(g);
    }

    // ---------------------------------------------------------------------
    // Bukit di kaki gunung
    // ---------------------------------------------------------------------
    buildHills() {
        const hemi = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const spots = [[352, -230, 34, 16], [360, -90, 40, 20], [348, 40, 30, 14], [365, 170, 42, 22], [350, 285, 30, 15]].map(([x, z, r, h]) => [x + DX, z, r, h]);
        for (const [x, z, rad, h] of spots) {
            const m = new THREE.Mesh(hemi, this.mat(this.jitterColor(0x5C8C3E, 0.15)));
            m.scale.set(rad, h, rad * 1.2);
            m.position.set(x, 0, z);     // alas belahan bola tepat di y=0
            m.castShadow = true;
            m.receiveShadow = true;
            this.group.add(m);
            // Pohon di kaki bukit
            for (let k = 0; k < 7; k++) {
                const a = this.rand() * Math.PI * 2;
                this.treeSpots.push([x + Math.cos(a) * rad * 1.05, 0, z + Math.sin(a) * rad * 1.25]);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Barisan gunung di cakrawala timur (low-poly, flat shaded, kabut dipanggang)
    // ---------------------------------------------------------------------
    buildMountains() {
        const haze = lin(0xA9BFCF);
        const list = [
            { x: 470 + DX, z: -70, r: 150, h: 178, volcano: true, seed: 3 },
            { x: 440 + DX, z: 175, r: 120, h: 128, seed: 7 },
            { x: 395 + DX, z: -265, r: 95, h: 82, seed: 11 },
            { x: 410 + DX, z: 335, r: 95, h: 74, seed: 13 },
            { x: 560 + DX, z: 70, r: 170, h: 150, seed: 17, far: true },
            { x: 545 + DX, z: -260, r: 150, h: 120, seed: 19, far: true }
        ];
        const positions = [], colors = [];
        const tmp = new THREE.Color();
        for (const M of list) {
            const R = rng(M.seed);
            const seg = 26, rings = 9;
            const ringPts = [];
            for (let j = 0; j <= rings; j++) {
                const t = j / rings;                        // 0 kaki -> 1 puncak
                const row = [];
                for (let i = 0; i < seg; i++) {
                    const a = (i / seg) * Math.PI * 2;
                    // Profil cekung khas gunung api; puncak gunung api dipotong (kawah)
                    const prof = M.volcano ? Math.pow(1 - t, 1.6) * 0.94 + 0.06 : Math.pow(1 - t, 1.25);
                    const ridge = 1 + 0.16 * Math.sin(a * 5 + M.seed) + 0.1 * Math.sin(a * 11 + M.seed * 2) + (R() - 0.5) * 0.12;
                    const rad = M.r * prof * (j === 0 ? 1 : ridge);
                    const y = j === rings ? M.h * (M.volcano ? 0.97 : 1) : M.h * t * (j === 0 ? 1 : 1 + (R() - 0.5) * 0.06);
                    row.push([M.x + Math.cos(a) * rad, Math.max(0, y), M.z + Math.sin(a) * rad * 0.85]);
                }
                ringPts.push(row);
            }
            const colorFor = (y) => {
                const t = y / M.h;
                if (M.volcano && t > 0.72) tmp.setHex(t > 0.86 ? 0x8A7F74 : 0x6E6B5A);
                else if (t > 0.6) tmp.setHex(0x40683A);
                else if (t > 0.25) tmp.setHex(0x3F7034);
                else tmp.setHex(0x4F7F3C);
                tmp.convertSRGBToLinear();
                return tmp.clone().lerp(haze, M.far ? 0.55 : 0.32);
            };
            const pushTri = (p1, p2, p3) => {
                positions.push(...p1, ...p2, ...p3);
                const c = colorFor((p1[1] + p2[1] + p3[1]) / 3);
                for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
            };
            for (let j = 0; j < rings; j++) {
                for (let i = 0; i < seg; i++) {
                    const a = ringPts[j][i], b = ringPts[j][(i + 1) % seg];
                    const c = ringPts[j + 1][i], d = ringPts[j + 1][(i + 1) % seg];
                    if (j === rings - 1 && !M.volcano) {
                        // tutup puncak runcing
                        pushTri(a, [M.x, M.h, M.z], b);
                    } else {
                        pushTri(a, c, b);
                        pushTri(b, c, d);
                    }
                }
            }
            if (M.volcano) {
                // Kawah: cincin puncak ditutup sedikit lebih rendah
                const top = ringPts[rings];
                const cy = M.h * 0.93;
                for (let i = 0; i < seg; i++) pushTri(top[i], [M.x, cy, M.z], top[(i + 1) % seg]);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals(); // non-indexed -> flat shading low-poly
        // Gunung tidak terkena kabut jarak (sudah dipanggang) agar tetap tampak di cakrawala
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'mountains';
        mesh.userData.noBatch = true;
        this.group.add(mesh);
    }

    // ---------------------------------------------------------------------
    // Pohon: kelapa, bambu, pohon rindang
    // ---------------------------------------------------------------------
    buildTreeLines() {
        // Deretan pohon di sepanjang batas peta timur (memisahkan kota & sawah)
        for (let z = -170; z <= 170; z += 11 + this.rand() * 8) this.treeSpots.push([MAP_MAX_X + 3, 0, z]);
        // tanpa pohon di kebun binatang & tambak pancing (fishing.js; x+6 ikut menyaring saung di sisi barat)
        this.treeSpots = this.treeSpots.filter(([x, , z]) => !inZoo(x, z, 2.5) && !onCoastRoad(x, z, 2.5) && !(z > 130 && inOrchard(x + 6, z)));
        for (const [x, y, z] of this.treeSpots) {
            const k = this.rand();
            // Kelapa & bambu prosedural tetap jadi ciri desa; sisanya pohon Polyfork (rindang = cadangan)
            if (k < 0.35) this.kelapa(x, y, z);
            else if (k < 0.55) this.bambu(x, y, z);
            else if (!this.polyforkTree(x, y, z)) this.rindang(x, y, z);
        }
    }

    /** Pohon Polyfork acak berbobot (RURAL_TREES); false bila model belum termuat. */
    polyforkTree(x, y, z) {
        const r = this.rand;
        if (!this._treeTotal) this._treeTotal = RURAL_TREES.reduce((s, t) => s + t.w, 0);
        let u = r() * this._treeTotal, t = RURAL_TREES[0];
        for (const c of RURAL_TREES) { u -= c.w; if (u <= 0) { t = c; break; } }
        const m = pfMesh(t.id, { height: t.h[0] + r() * (t.h[1] - t.h[0]) });
        if (!m) return false;
        m.position.set(x, y + 0.02, z);   // dasar model y=0 -> micro-lift zero-submerging
        m.rotation.y = r() * Math.PI * 2;
        this.group.add(m);
        return true;
    }

    kelapa(x, y, z) {
        const r = this.rand;
        const h = 7 + r() * 4;
        const lean = (r() - 0.5) * 0.35;
        const dir = r() * Math.PI * 2;
        const segs = 4;
        let px = x, pz = z, py = y;
        for (let i = 0; i < segs; i++) {
            const sh = h / segs;
            const m = this.prim('cyl', COL.batang, 0.32 - i * 0.04, sh, 0.32 - i * 0.04, px, py, pz);
            m.rotation.set(Math.cos(dir) * lean * (i / segs), 0, Math.sin(dir) * lean * (i / segs));
            px += Math.sin(dir) * lean * sh * (i / segs);
            pz += Math.cos(dir) * lean * sh * (i / segs);
            py += sh * 0.99;
        }
        for (let f = 0; f < 7; f++) {
            const a = (f / 7) * Math.PI * 2 + r();
            const leaf = this.prim('box', COL.kelapaDaun, 0.55, 0.06, 3.0, px + Math.sin(a) * 1.2, py - 0.25, pz + Math.cos(a) * 1.2, a);
            leaf.rotation.set(0.45, a, 0, 'YXZ');
        }
        this.prim('ico', 0x6B5530, 0.55, 0.5, 0.55, px, py - 0.55, pz);
    }

    bambu(x, y, z) {
        const r = this.rand;
        const n = 6 + Math.floor(r() * 5);
        let maxH = 0;
        for (let i = 0; i < n; i++) {
            const h = 7 + r() * 5;
            maxH = Math.max(maxH, h);
            const m = this.prim('cyl', COL.bambu, 0.12, h, 0.12, x + (r() - 0.5) * 1.6, y, z + (r() - 0.5) * 1.6);
            m.rotation.set((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
        }
        for (let i = 0; i < 4; i++) {
            this.prim('ico', COL.bambuDaun, 3.2, 2.6, 3.2, x + (r() - 0.5) * 2.2, y + maxH * (0.55 + r() * 0.3), z + (r() - 0.5) * 2.2);
        }
    }

    rindang(x, y, z) {
        const r = this.rand;
        const h = 2.4 + r() * 1.5;
        this.prim('cyl', COL.batang, 0.38, h, 0.38, x, y, z);
        const c = r() < 0.5 ? COL.daun : COL.daunTua;
        this.prim('ico', c, 4.6, 3.6, 4.6, x, y + h - 0.6, z);
        this.prim('ico', c, 3.2, 2.6, 3.2, x + 1.2, y + h + 1.2, z - 0.6);
    }
}
