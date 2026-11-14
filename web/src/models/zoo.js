/**
 * AUDIRA-LAND: Kebun Binatang Desa Have-Not ("Kebun Binatang AUDIRA"), di kaki gunung timur.
 *
 * Letak: lahan terasering timur tepat di bawah gunung (x 314..386, z 148..252), DI LUAR kavling aktif.
 * rural_scenery.js & wildlife.js melewati petak sawah di dalam ZOO_RECT dan jalur masuk (inZoo).
 * Jalan tanah masuk menyambung ujung timur jalan arteri utara kota (z 172) lewat jembatan kayu di atas kali.
 *
 * Isi: pagar keliling + gerbang bertuliskan AUDIRA, jalan setapak melingkar, danau flamingo di tengah,
 * 7 kandang (gajah, jerapah, orangutan, rusa, komodo, harimau sumatra, sangkar merak), loket, bangku, pohon.
 * - Benda diam: dilebur bakeStatic -> beberapa draw call (lambert vertex color + 1 papan nama bertekstur).
 * - Satwa: 1 InstancedMesh per spesies (8 draw call), berjalan-berhenti-merumput di kandangnya.
 *   Disembunyikan bila kamera > ANIMAL_LOD m dari pusat (tanpa update) -> 0 draw call dari jauh.
 * - Zero-Submerging: pelat lahan setebal 0,04 di atas y=0; semua benda berdiri di BASE = 0,06 (+0,02 lift).
 * - Warna sRGB -> linear (lin) seperti modul pedesaan lain.
 */

import { bakeStatic } from '../core/static_batcher.js';
import { EAST_DX as DX } from '../core/constants.js';
import { MultiInstanced } from '../core/multi_instanced.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

export const ZOO_RECT = { x0: 314, x1: 386, z0: 148, z1: 252 };
// Jalan tanah masuk: dari ujung jalan arteri utara (x 264, z 172) ke gerbang barat
export const ZOO_PATH = { x0: 262, x1: 316, z0: 169, z1: 175, z: 172 };
// Plaza depan gerbang monumental (di luar pagar, sebelah barat): patung gajah + umbul-umbul
export const ZOO_PLAZA = { x0: 304, x1: 316, z0: 159, z1: 185 };
const CX = 352, CZ = 204;                 // pusat jalan melingkar & danau
const RING = { rx: 18, rz: 30, w: 3 };
const TOP = 0.04;                         // tebal pelat lahan
const BASE = TOP + 0.02;                  // dasar benda (micro-lift)
const ANIMAL_LOD = 260;

// Kali (salinan rural_scenery.js) untuk letak jembatan
const streamX = z => 236 + DX + 13 * Math.sin(z / 52) + 5 * Math.sin(z / 19 + 1.3);

/** true bila (x, z) +margin bersinggungan dengan kebun binatang atau jalan masuknya. */
export function inZoo(x, z, margin = 0) {
    const R = ZOO_RECT, P = ZOO_PATH, Q = ZOO_PLAZA;
    return (x > R.x0 - margin && x < R.x1 + margin && z > R.z0 - margin && z < R.z1 + margin)
        || (x > P.x0 - margin && x < P.x1 + margin && z > P.z0 - margin && z < P.z1 + margin)
        || (x > Q.x0 - margin && x < Q.x1 + margin && z > Q.z0 - margin && z < Q.z1 + margin);
}

// Kandang: pusat, jari-jari, alas, spesies
const PENS = [
    { id: 'gajah', x: 330, z: 240, r: 9, ground: 0x9C7B55, pond: true },
    { id: 'jerapah', x: 376, z: 238, r: 9, ground: 0xB49A5E },
    { id: 'orangutan', x: 356, z: 244, r: 7, ground: 0x5E8E3E, walk: 4.2 },
    { id: 'rusa', x: 324, z: 204, r: 8, ground: 0x76A24E },
    { id: 'komodo', x: 378, z: 204, r: 6, ground: 0x4D93B0, walk: 3.6 },   // pulau: alas = parit air
    { id: 'harimau', x: 376, z: 180, r: 7, ground: 0x7E8F4E, walk: 3.4 },
    { id: 'merak', x: 372, z: 158, r: 9, ground: 0x86AE5A, aviary: true }
];
// Danau tengah: pulau di utara, flamingo di dangkal barat laut, perahu bebek memutari air mancur di selatan
const ISLAND = { x: CX + 3, z: CZ + 10, rx: 2.4, rz: 3.0 };
const FOUNTAIN = { x: CX, z: CZ - 3 };
const BOAT_LOOP = { x: CX, z: CZ - 3, rx: 5.5, rz: 7 };
const BRIDGE = { z: CZ - 13, half: 7.5, w: 2.4, peak: 2.1 };
const TOWER = { x: 344, z: 160 };
const KIOSKS = [[338, 179, 0xF2B233], [364, 169, 0xE2453C], [333, 226, 0x2E86C1]];

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

// ---------------------------------------------------------------------------
// Pembuat geometri satwa: primitif satuan digabung jadi 1 BufferGeometry ber-vertex color
// ---------------------------------------------------------------------------
const UNIT = {
    box: () => new THREE.BoxGeometry(1, 1, 1),
    cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    cone: () => new THREE.ConeGeometry(0.5, 1, 8),
    ico: () => new THREE.IcosahedronGeometry(0.5, 1)
};
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function mergeParts(parts) {
    const pos = [], nor = [], col = [];
    for (const [type, hex, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0] of parts) {
        let g = UNIT[type]();
        if (g.index) g = g.toNonIndexed();
        _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
        g.applyMatrix4(_m4);
        const c = lin(hex);
        const P = g.attributes.position.array, N = g.attributes.normal.array;
        for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
        for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
        g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
}

// Semua satwa menghadap +Z, telapak di y = 0
const SPECIES = {
    gajah: () => {
        const G = 0x8E8B88, D = 0x6E6B68;
        const p = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(['cyl', G, 0.55, 1.3, 0.55, sx * 0.5, 0.65, sz * 0.75]);
        p.push(['box', G, 1.5, 1.5, 2.4, 0, 1.95, 0]);
        p.push(['box', G, 1.1, 1.1, 0.9, 0, 2.35, 1.55]);
        for (const s of [-1, 1]) p.push(['box', D, 0.12, 1.0, 0.85, s * 0.66, 2.4, 1.3, 0, s * 0.35, 0]);
        p.push(['cyl', G, 0.3, 1.5, 0.3, 0, 1.55, 2.05, 0.18, 0, 0]);
        for (const s of [-1, 1]) p.push(['cone', 0xF2EEDF, 0.12, 0.6, 0.12, s * 0.32, 1.8, 2.05, 1.9, 0, 0]);
        for (const s of [-1, 1]) p.push(['box', 0x222222, 0.08, 0.1, 0.05, s * 0.4, 2.55, 2.0]);
        p.push(['cyl', D, 0.07, 0.9, 0.07, 0, 1.75, -1.3, -0.4, 0, 0]);
        return mergeParts(p);
    },
    jerapah: () => {
        const Y = 0xE0AA4A, S = 0x8A5222;
        const p = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(['cyl', Y, 0.2, 2.0, 0.2, sx * 0.32, 1.0, sz * 0.62]);
        p.push(['box', Y, 0.9, 0.85, 1.6, 0, 2.3, 0]);
        [[0.3, 2.45, 0.4], [-0.1, 2.2, -0.35], [0.25, 2.15, -0.1], [-0.3, 2.45, 0.15], [0, 2.5, -0.55]].forEach(([y0, yy, z]) => {
            for (const s of [-1, 1]) p.push(['box', S, 0.04, 0.26, 0.3, s * 0.46, yy, z + y0 * 0.2]);
        });
        p.push(['cyl', Y, 0.28, 2.2, 0.28, 0, 3.45, 0.85, 0.38, 0, 0]);
        p.push(['box', S, 0.08, 1.8, 0.12, 0, 3.5, 0.68, 0.38, 0, 0]);
        p.push(['box', Y, 0.34, 0.38, 0.7, 0, 4.55, 1.4]);
        for (const s of [-1, 1]) p.push(['cyl', S, 0.06, 0.25, 0.06, s * 0.1, 4.85, 1.25]);
        p.push(['cyl', S, 0.05, 0.9, 0.05, 0, 2.1, -0.85, -0.3, 0, 0]);
        return mergeParts(p);
    },
    orangutan: () => {
        const O = 0xB2501E, F = 0xD9A27A;
        const p = [];
        for (const s of [-1, 1]) p.push(['cyl', O, 0.18, 0.55, 0.18, s * 0.18, 0.28, 0]);
        p.push(['box', O, 0.62, 0.7, 0.48, 0, 0.9, 0]);
        p.push(['box', O, 0.42, 0.42, 0.38, 0, 1.45, 0.04]);
        p.push(['box', F, 0.32, 0.26, 0.06, 0, 1.42, 0.24]);
        for (const s of [-1, 1]) p.push(['cyl', O, 0.16, 1.05, 0.16, s * 0.44, 0.72, 0.05, 0, 0, s * 0.12]);
        return mergeParts(p);
    },
    rusa: () => {
        const B = 0xA8743F, A = 0xD8C9A8;
        const p = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(['cyl', B, 0.1, 0.8, 0.1, sx * 0.14, 0.4, sz * 0.36]);
        p.push(['box', B, 0.42, 0.48, 1.0, 0, 1.03, 0]);
        p.push(['cyl', B, 0.17, 0.6, 0.17, 0, 1.42, 0.45, 0.5, 0, 0]);
        p.push(['box', B, 0.22, 0.24, 0.46, 0, 1.72, 0.66]);
        for (const s of [-1, 1]) {
            p.push(['cyl', A, 0.04, 0.45, 0.04, s * 0.09, 2.0, 0.58, 0, 0, s * 0.45]);
            p.push(['cyl', A, 0.03, 0.22, 0.03, s * 0.17, 2.12, 0.66, 0.6, 0, s * 0.2]);
        }
        p.push(['box', 0xF2EEE6, 0.12, 0.14, 0.08, 0, 1.15, -0.52]);
        return mergeParts(p);
    },
    komodo: () => {
        const K = 0x6E6A4C, D = 0x55523A;
        const p = [];
        p.push(['box', K, 0.55, 0.3, 1.3, 0, 0.32, 0]);
        p.push(['box', K, 0.34, 0.2, 0.52, 0, 0.32, 0.88]);
        p.push(['cone', D, 0.34, 1.5, 0.28, 0, 0.27, -1.4, -Math.PI / 2, 0, 0]);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(['box', D, 0.14, 0.24, 0.14, sx * 0.36, 0.12, sz * 0.42, 0, 0, sx * 0.4]);
        p.push(['box', 0xC0392B, 0.04, 0.02, 0.18, 0, 0.3, 1.2]);
        return mergeParts(p);
    },
    harimau: () => {
        const T = 0xE07A22, W = 0xF4EDE0, K = 0x1E1A16;
        const p = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(['cyl', T, 0.2, 0.55, 0.2, sx * 0.22, 0.28, sz * 0.55]);
        p.push(['box', T, 0.6, 0.58, 1.5, 0, 0.82, 0]);
        p.push(['box', W, 0.5, 0.14, 1.2, 0, 0.55, 0]);
        for (const z of [-0.55, -0.22, 0.12, 0.45]) p.push(['box', K, 0.62, 0.42, 0.07, 0, 0.9, z]);
        p.push(['box', T, 0.5, 0.45, 0.45, 0, 0.98, 0.92]);
        p.push(['box', W, 0.28, 0.16, 0.1, 0, 0.86, 1.15]);
        for (const s of [-1, 1]) p.push(['box', T, 0.12, 0.14, 0.06, s * 0.18, 1.26, 0.85]);
        p.push(['cyl', T, 0.08, 0.95, 0.08, 0, 0.85, -1.08, -0.9, 0, 0]);
        return mergeParts(p);
    },
    flamingo: () => {
        const P = 0xF08FA8;
        const p = [];
        for (const s of [-1, 1]) p.push(['cyl', 0xD9748F, 0.04, 0.9, 0.04, s * 0.07, 0.45, 0]);
        p.push(['ico', P, 0.42, 0.34, 0.7, 0, 1.05, 0]);
        p.push(['cyl', P, 0.07, 0.72, 0.07, 0, 1.5, 0.25, 0.3, 0, 0]);
        p.push(['ico', P, 0.17, 0.17, 0.2, 0, 1.86, 0.36]);
        p.push(['cone', 0x2A2A2A, 0.06, 0.16, 0.06, 0, 1.8, 0.5, 2.2, 0, 0]);
        return mergeParts(p);
    },
    // Perahu bebek kayuh (menghadap +Z, lunas di y = 0)
    perahu: () => mergeParts([
        ['box', 0xF4F4F0, 1.3, 0.5, 2.0, 0, 0.25, 0],
        ['box', 0x2E86C1, 1.34, 0.12, 2.04, 0, 0.48, 0],
        ['box', 0xE2453C, 1.0, 0.5, 0.12, 0, 0.75, -0.5],
        ['cyl', 0xF2C230, 0.3, 0.8, 0.3, 0, 0.85, 0.85, 0.25, 0, 0],
        ['ico', 0xF2C230, 0.5, 0.48, 0.55, 0, 1.32, 0.98],
        ['cone', 0xE67E22, 0.18, 0.32, 0.18, 0, 1.28, 1.32, Math.PI / 2, 0, 0],
        ['box', 0x222222, 0.52, 0.07, 0.07, 0, 1.42, 1.1]
    ]),
    // Kereta wisata: lokomotif & gerbong (menghadap +Z)
    loko: () => mergeParts([
        ['box', 0x2F6B3A, 1.6, 1.1, 2.6, 0, 0.85, 0.1],
        ['cyl', 0x2F6B3A, 1.0, 1.4, 1.0, 0, 1.2, 0.7, Math.PI / 2, 0, 0],
        ['box', 0xB03A2E, 1.6, 1.3, 1.1, 0, 2.0, -0.7],
        ['box', 0x222222, 1.8, 0.12, 1.4, 0, 2.7, -0.7],
        ['cyl', 0x222222, 0.36, 0.8, 0.36, 0, 2.2, 1.0],
        ['cone', 0x222222, 0.6, 0.3, 0.6, 0, 2.7, 1.0, Math.PI, 0, 0],
        ['ico', 0xF2C230, 0.3, 0.3, 0.12, 0, 1.25, 1.42],
        ...[-0.75, 0.75].flatMap(z => [-1, 1].map(s => ['cyl', 0x222222, 0.6, 0.18, 0.6, s * 0.8, 0.3, z, 0, 0, Math.PI / 2]))
    ]),
    gerbong: () => mergeParts([
        ['box', 0xF2B233, 1.6, 0.5, 2.6, 0, 0.6, 0],
        ['box', 0x8B6A43, 1.4, 0.5, 0.3, 0, 1.1, -0.6],
        ['box', 0x8B6A43, 1.4, 0.5, 0.3, 0, 1.1, 0.5],
        ...[-1, 1].flatMap(sx => [-1, 1].map(sz => ['cyl', 0xDDDDDD, 0.08, 1.5, 0.08, sx * 0.72, 1.6, sz * 1.18])),
        ['box', 0xE2453C, 1.8, 0.1, 2.8, 0, 2.38, 0],
        ['box', 0x666666, 0.2, 0.15, 0.6, 0, 0.45, 1.45],
        ...[-0.8, 0.8].flatMap(z => [-1, 1].map(s => ['cyl', 0x222222, 0.5, 0.16, 0.5, s * 0.8, 0.25, z, 0, 0, Math.PI / 2]))
    ]),
    merak: () => {
        const B = 0x1F5FB0;
        const p = [];
        for (const s of [-1, 1]) p.push(['cyl', 0x8C7A5A, 0.04, 0.32, 0.04, s * 0.08, 0.16, 0]);
        p.push(['ico', B, 0.34, 0.34, 0.5, 0, 0.46, 0]);
        p.push(['cyl', 0x1E6FC9, 0.08, 0.45, 0.08, 0, 0.8, 0.18]);
        p.push(['ico', B, 0.14, 0.14, 0.16, 0, 1.05, 0.22]);
        p.push(['cyl', 0x1E8F5A, 1.7, 0.04, 1.1, 0, 0.95, -0.42, Math.PI / 2 - 0.25, 0, 0]);
        p.push(['cyl', 0x3FB27F, 1.2, 0.05, 0.75, 0, 0.97, -0.38, Math.PI / 2 - 0.25, 0, 0]);
        return mergeParts(p);
    }
};

// Jumlah per spesies & kandangnya (flamingo di danau tengah)
const POP = [
    { sp: 'gajah', pen: 'gajah', n: 2, speed: 0.55 },
    { sp: 'jerapah', pen: 'jerapah', n: 3, speed: 0.6 },
    { sp: 'orangutan', pen: 'orangutan', n: 3, speed: 0.35 },
    { sp: 'rusa', pen: 'rusa', n: 5, speed: 0.9 },
    { sp: 'komodo', pen: 'komodo', n: 2, speed: 0.3 },
    { sp: 'harimau', pen: 'harimau', n: 2, speed: 0.8 },
    { sp: 'merak', pen: 'merak', n: 3, speed: 0.4 },
    { sp: 'flamingo', pen: 'danau', n: 8, speed: 0.25 }
];

export class Zoo {
    constructor(scene) {
        this.scene = scene;
        this.rand = rng(0x200B1A);
        this.group = new THREE.Group();
        this.group.name = 'kebun_binatang';
        this.matCache = new Map();

        this.buildGround();
        this.buildAccessRoad();
        this.buildPerimeter();
        this.buildLake();
        PENS.forEach(p => this.buildPen(p));
        this.buildFacilities();
        this.buildPlaza();
        this.buildTower();
        this.buildBridge();
        this.buildKiosksAndLamps();
        this.buildTrees();

        const sign = this.buildGateSign();   // tekstur kanvas: tetap terpisah dari leburan
        const baked = bakeStatic(this.group, { remove: true });
        baked.name = 'kebun_binatang_static';
        scene.add(baked);
        scene.add(sign);
        this.static = baked;

        this.buildRides();
        this.buildAnimals();
    }

    /** Bagian bergerak non-satwa: perahu bebek, kereta wisata, pancaran air mancur, bola lampu (5 draw call). */
    buildRides() {
        const lod = [];
        const inst = (sp, n, name, cast = false) => {
            const im = new THREE.InstancedMesh(SPECIES[sp](), new THREE.MeshLambertMaterial({ vertexColors: true }), n);
            im.name = name;
            im.castShadow = cast;
            im.receiveShadow = true;
            im.frustumCulled = false;
            this.scene.add(im);
            lod.push(im);
            return im;
        };
        this.boats = inst('perahu', 5, 'zoo_perahu_bebek');
        this.loco = inst('loko', 1, 'zoo_kereta_loko', true);
        this.cars = inst('gerbong', 3, 'zoo_kereta_gerbong', true);

        // Tabel panjang busur jalan melingkar (kereta melaju dengan kecepatan tetap)
        const N = 256, tab = [0];
        let prev = [CX + RING.rx, CZ];
        for (let k = 1; k <= N; k++) {
            const a = (k / N) * Math.PI * 2, p = [CX + Math.cos(a) * RING.rx, CZ + Math.sin(a) * RING.rz];
            tab.push(tab[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
            prev = p;
        }
        this.ringTab = tab;
        this.ringLen = tab[N];
        this.trainS = 0;

        // Pancaran air mancur: kerucut terbuka transparan, tinggi berdenyut
        const jet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.9, 1, 12, 1, true).translate(0, 0.5, 0),
            new THREE.MeshBasicMaterial({ color: 0xDDF3FF, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
        );
        jet.position.set(FOUNTAIN.x, BASE + 2.65, FOUNTAIN.z);
        jet.name = 'zoo_air_mancur';
        this.scene.add(jet);
        lod.push(jet);
        this.jet = jet;

        // Bola lampu taman (tiang statis di buildKiosksAndLamps)
        const bulbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: 0xFFE7A0 }), this.lampSpots.length);
        this.lampSpots.forEach(([x, z], k) => {
            const y0 = x < ZOO_RECT.x0 ? TOP + 0.02 : BASE;
            bulbs.setMatrixAt(k, _m4.compose(_p.set(x, y0 + 3.75, z), _q.identity(), _s.set(1, 1, 1)));
        });
        bulbs.name = 'zoo_bola_lampu';
        this.scene.add(bulbs);
        lod.push(bulbs);
        this.rideLod = lod;
    }

    /** Titik & arah pada jalan melingkar untuk jarak busur s. */
    ringAt(s) {
        const tab = this.ringTab, N = tab.length - 1;
        s = ((s % this.ringLen) + this.ringLen) % this.ringLen;
        let lo = 0, hi = N;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m] <= s) lo = m; else hi = m; }
        const a = ((lo + (s - tab[lo]) / (tab[hi] - tab[lo])) / N) * Math.PI * 2;
        const x = CX + Math.cos(a) * RING.rx, z = CZ + Math.sin(a) * RING.rz;
        return [x, z, Math.atan2(-Math.sin(a) * RING.rx, Math.cos(a) * RING.rz)];
    }

    updateRides(dt, t) {
        // Kereta: 2,4 m/s berlawanan arah jarum jam (s bertambah), gerbong berjarak 3,3 m di belakang
        this.trainS += dt * 2.4;
        const put = (im, k, s) => {
            const [x, z, yaw] = this.ringAt(s);
            im.setMatrixAt(k, _m4.compose(_p.set(x, BASE, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1)));
        };
        put(this.loco, 0, this.trainS);
        for (let k = 0; k < 3; k++) put(this.cars, k, this.trainS - 3.4 * (k + 1));
        this.loco.instanceMatrix.needsUpdate = true;
        this.cars.instanceMatrix.needsUpdate = true;
        // Perahu bebek: memutari air mancur, bergoyang pelan
        const L = BOAT_LOOP;
        for (let k = 0; k < 5; k++) {
            const a = t * 0.07 + (k / 5) * Math.PI * 2;
            const x = L.x + Math.cos(a) * L.rx, z = L.z + Math.sin(a) * L.rz;
            const yaw = Math.atan2(-Math.sin(a) * L.rx, Math.cos(a) * L.rz);
            _e.set(Math.sin(t * 1.3 + k) * 0.04, yaw, Math.sin(t * 1.7 + k * 2) * 0.05, 'YXZ');
            this.boats.setMatrixAt(k, _m4.compose(_p.set(x, BASE + 0.03 + Math.sin(t * 2 + k) * 0.03, z), _q.setFromEuler(_e), _s.set(1, 1, 1)));
        }
        this.boats.instanceMatrix.needsUpdate = true;
        // Air mancur berdenyut
        const h = 3.2 + Math.sin(t * 2.1) * 0.6 + Math.sin(t * 5.3) * 0.15;
        this.jet.scale.set(1 + Math.sin(t * 3.1) * 0.06, h, 1 + Math.sin(t * 3.1) * 0.06);
    }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 420);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-zoo')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-zoo';
            btn.title = 'Fokus ke Kebun Binatang AUDIRA (kaki gunung timur Desa Have-Not)';
            btn.textContent = '🦒 Kebun Binatang';
            group.insertBefore(btn, group.firstChild);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-zoo)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    /** Arahkan kamera ke kebun binatang: dari selatan (memanjang utara-selatan, pas layar HP tegak). */
    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(359, 0, 194);
        const a = 198 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 40 * Math.PI / 180;
        cam.distanceDesired = 190;
    }

    // --- primitif statis (dilebur nanti) ---
    mat(hex) {
        if (!this.matCache.has(hex)) this.matCache.set(hex, new THREE.MeshLambertMaterial({ color: lin(hex) }));
        return this.matCache.get(hex);
    }
    prim(type, hex, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0, cast = false) {
        const m = new THREE.Mesh(UNIT[type](), this.mat(hex));
        m.scale.set(sx, sy, sz);
        m.position.set(x, y, z);
        m.rotation.set(rx, ry, rz);
        m.castShadow = cast;
        m.receiveShadow = true;
        this.group.add(m);
        return m;
    }
    /** Elips datar (alas): titik tengah (x, z), jari-jari rx/rz, tinggi y. */
    disc(hex, x, z, rx, rz, y, seg = 24) {
        const g = new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, this.mat(hex));
        m.scale.set(rx, 1, rz);
        m.position.set(x, y, z);
        m.receiveShadow = true;
        this.group.add(m);
    }
    /** Pagar bundar: tiang tiap ±1,6 m + 2 rel cincin. */
    roundFence(x, z, r, h = 1.1, hex = 0x7A5534) {
        const n = Math.max(10, Math.round((2 * Math.PI * r) / 1.6));
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            this.prim('cyl', hex, 0.14, h, 0.14, x + Math.cos(a) * r, BASE + h / 2, z + Math.sin(a) * r);
        }
        for (const y of [h * 0.45, h * 0.9]) {
            const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 4, Math.max(24, n)).rotateX(Math.PI / 2), this.mat(hex));
            t.position.set(x, BASE + y, z);
            this.group.add(t);
        }
    }
    tree(x, z, s = 1, hex = 0x3F7F34) {
        const h = 2.2 * s;
        this.prim('cyl', 0x6B4A2E, 0.3 * s, h, 0.3 * s, x, BASE + h / 2, z, 0, 0, 0, true);
        this.prim('ico', hex, 2.6 * s, 2.2 * s, 2.6 * s, x, BASE + h + 0.7 * s, z, this.rand() * 3, 0, 0, true);
        this.prim('ico', hex, 1.8 * s, 1.6 * s, 1.8 * s, x + 0.6 * s, BASE + h + 1.6 * s, z - 0.3 * s, 0, 0, 0, true);
    }
    rock(x, z, s, hex = 0x8A847A) {
        // ico satuan: dasar di -0,5 x sy -> pusat BASE + 0,4 s (dasar tepat di permukaan)
        this.prim('ico', hex, s * 1.3, s * 0.8, s, x, BASE + s * 0.4, z, this.rand() * 3, 0, 0, true);
    }
    /** Patung perunggu satu warna dari geometri satwa (menghadap +Z diputar ry). */
    statue(sp, x, y, z, ry, s = 1, hex = 0xA88A5A) {
        const m = new THREE.Mesh(SPECIES[sp](), this.mat(hex));
        m.scale.setScalar(s);
        m.position.set(x, y, z);
        m.rotation.y = ry;
        m.castShadow = true;
        this.group.add(m);
    }
    /** Batang dari titik a ke b (silinder). */
    beam(hex, r, ax, ay, az, bx, by, bz) {
        const len = Math.hypot(bx - ax, by - ay, bz - az);
        const m = new THREE.Mesh(UNIT.cyl(), this.mat(hex));
        m.scale.set(r, len, r);
        m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize());
        this.group.add(m);
        return m;
    }
    /** true bila (x, z) mengenai bangunan/jalan baru (untuk sebaran pohon). */
    blocked(x, z, pad = 0) {
        const B = BRIDGE;
        if (Math.abs(z - B.z) < B.w / 2 + 1 + pad && Math.abs(x - CX) < 17 + pad) return true;      // jembatan + jalan sambung
        if (Math.hypot(x - TOWER.x, z - TOWER.z) < 5 + pad) return true;
        if (Math.hypot(x - 324, z - ZOO_PATH.z) < 10.5 + pad) return true;                          // plaza dalam
        return KIOSKS.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < 2.6 + pad);
    }

    // ---------------------------------------------------------------------
    buildGround() {
        const R = ZOO_RECT;
        this.prim('box', 0x6FA24C, R.x1 - R.x0, TOP, R.z1 - R.z0, (R.x0 + R.x1) / 2, TOP / 2, (R.z0 + R.z1) / 2);
        // Jalan setapak melingkar (cincin elips) + jalan dari gerbang ke cincin
        const g = new THREE.RingGeometry(1 - RING.w / RING.rx / 2, 1 + RING.w / RING.rx / 2, 48).rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(g, this.mat(0xC9B48A));
        ring.scale.set(RING.rx, 1, RING.rz);
        ring.position.set(CX, BASE - 0.005, CZ);
        ring.receiveShadow = true;
        this.group.add(ring);
        this.prim('box', 0xC9B48A, CX - R.x0, 0.01, 3, (R.x0 + CX) / 2, BASE - 0.005, ZOO_PATH.z);
    }

    buildAccessRoad() {
        // Jalan tanah dari ujung arteri utara kota ke gerbang, jembatan kayu di atas kali
        const P = ZOO_PATH, sx = streamX(P.z), gap = 6.4;
        const seg = (a, b) => this.prim('box', 0xB49B6E, b - a, 0.03, 4.2, (a + b) / 2, 0.015, P.z);
        seg(P.x0, sx - gap);
        seg(sx + gap, P.x1);
        const len = gap * 2 + 1.2;
        this.prim('box', 0x8B6A43, len, 0.2, 4.4, sx, 0.4, P.z, 0, 0, 0, true);
        for (let k = 0; k <= 6; k++) this.prim('box', 0x6E5235, 0.12, 0.04, 4.4, sx - len / 2 + (k / 6) * len, 0.52, P.z);
        for (const s of [-1, 1]) {
            this.prim('box', 0x6E5235, len, 0.12, 0.12, sx, 1.4, P.z + s * 2.1);
            for (let k = 0; k <= 4; k++) this.prim('cyl', 0x6E5235, 0.14, 1.4, 0.14, sx - len / 2 + (k / 4) * len, 0.7, P.z + s * 2.1);
        }
    }

    buildPerimeter() {
        const R = ZOO_RECT, h = 1.6, hex = 0x6E4B2E;
        const side = (x0, z0, x1, z1, gapA = null, gapB = null) => {
            const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 3);
            for (let k = 0; k <= n; k++) {
                const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
                if (gapA !== null && z > gapA && z < gapB) continue;
                this.prim('box', hex, 0.2, h, 0.2, x, BASE + h / 2, z);
            }
            const rail = (a, b) => {
                const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
                const l = Math.hypot(bx - ax, bz - az);
                for (const y of [0.55, 1.3]) this.prim('box', hex, x0 === x1 ? 0.1 : l, 0.1, x0 === x1 ? l : 0.1, (ax + bx) / 2, BASE + y, (az + bz) / 2);
            };
            if (gapA === null) rail(0, 1);
            else { const ta = (gapA - z0) / (z1 - z0), tb = (gapB - z0) / (z1 - z0); rail(0, ta); rail(tb, 1); }
        };
        side(R.x0, R.z0, R.x1, R.z0);
        side(R.x0, R.z1, R.x1, R.z1);
        side(R.x1, R.z0, R.x1, R.z1);
        side(R.x0, R.z0, R.x0, R.z1, ZOO_PATH.z - 6, ZOO_PATH.z + 6);
        // Gapura monumental: 2 menara bata berpuncak atap joglo + balok papan nama + atap pelana
        const gx = R.x0, gz = ZOO_PATH.z, STONE = 0x9A9288, BRICK = 0xB5562E, CREAM = 0xE9D9B0, ROOF = 0x2F6B3A, GOLD = 0xD4A93A;
        for (const s of [-1, 1]) {
            const tz = gz + s * 7.2;
            this.prim('box', STONE, 3.4, 1.2, 3.4, gx, BASE + 0.6, tz, 0, 0, 0, true);
            this.prim('box', BRICK, 2.4, 9, 2.4, gx, BASE + 5.7, tz, 0, 0, 0, true);
            for (const y of [4.2, 7.4]) this.prim('box', CREAM, 2.6, 0.3, 2.6, gx, BASE + y, tz);
            this.prim('box', CREAM, 2.9, 0.5, 2.9, gx, BASE + 10.45, tz, 0, 0, 0, true);
            this.prim('cone', ROOF, 4.2, 2.6, 4.2, gx, BASE + 12.0, tz, Math.PI / 8, 0, 0, true);
            this.prim('cyl', GOLD, 0.22, 1.2, 0.22, gx, BASE + 13.9, tz);
            this.prim('ico', GOLD, 0.6, 0.6, 0.6, gx, BASE + 14.7, tz);
            // Lentera di kaki menara
            this.prim('box', CREAM, 0.4, 0.7, 0.6, gx - 1.45, BASE + 1.55, tz);   // di atas alas batu
        }
        this.prim('box', 0x7A3E1E, 1.6, 2.8, 13.2, gx, BASE + 8.6, gz, 0, 0, 0, true);
        this.prim('box', ROOF, 2.8, 0.35, 15.6, gx, BASE + 10.15, gz, 0, 0, 0, true);
        this.prim('box', ROOF, 1.6, 1.6, 14.4, gx, BASE + 10.3, gz, 0, 0, Math.PI / 4, true);   // bubungan pelana
        this.prim('ico', GOLD, 0.9, 0.9, 0.9, gx, BASE + 11.75, gz);
    }

    buildGateSign() {
        const cv = document.createElement('canvas');
        cv.width = 1024; cv.height = 240;
        const c = cv.getContext('2d');
        c.fillStyle = '#F6E7C1'; c.fillRect(0, 0, 1024, 240);
        c.strokeStyle = '#D4A93A'; c.lineWidth = 16; c.strokeRect(8, 8, 1008, 224);
        c.strokeStyle = '#2F6B3A'; c.lineWidth = 6; c.strokeRect(26, 26, 972, 188);
        c.fillStyle = '#2F6B3A'; c.textAlign = 'center';
        c.font = 'bold 84px sans-serif'; c.fillText('KEBUN BINATANG', 512, 112);
        c.fillStyle = '#B45309'; c.font = 'bold 76px sans-serif'; c.fillText('AUDIRA', 512, 196);
        const tex = new THREE.CanvasTexture(cv);
        tex.encoding = THREE.sRGBEncoding;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.6), new THREE.MeshBasicMaterial({ map: tex }));
        m.position.set(ZOO_RECT.x0 - 0.82, BASE + 8.6, ZOO_PATH.z);
        m.rotation.y = -Math.PI / 2;     // menghadap barat (ke arah kota)
        m.name = 'papan_kebun_binatang';
        return m;
    }

    buildLake() {
        this.disc(0x8A847A, CX, CZ, 10.2, 17.2, BASE + 0.002, 28);
        this.disc(0x4D93B0, CX, CZ, 9, 16, BASE + 0.012, 28);
        this.disc(0x6FA24C, ISLAND.x, ISLAND.z, ISLAND.rx, ISLAND.rz, BASE + 0.03, 14);   // pulau kecil
        this.tree(ISLAND.x, ISLAND.z, 0.7, 0x4C8A3A);
        // Kolam air mancur bertingkat di tengah lintasan perahu bebek (pancaran air: mesh terpisah, beranimasi)
        const F = FOUNTAIN, ST = 0x9A9288;
        this.prim('cyl', ST, 4.4, 0.5, 4.4, F.x, BASE + 0.25, F.z, 0, 0, 0, true);
        this.disc(0x6FB7D6, F.x, F.z, 1.95, 1.95, BASE + 0.51, 20);
        this.prim('cyl', 0xE9D9B0, 0.7, 1.4, 0.7, F.x, BASE + 0.5 + 0.7, F.z);
        this.prim('cyl', ST, 2.6, 0.3, 2.6, F.x, BASE + 2.05, F.z, 0, 0, 0, true);
        this.disc(0x6FB7D6, F.x, F.z, 1.1, 1.1, BASE + 2.21, 16);
        this.prim('cyl', 0xE9D9B0, 0.35, 0.9, 0.35, F.x, BASE + 2.2 + 0.45, F.z);
        for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2 + this.rand() * 0.2;
            this.rock(CX + Math.cos(a) * 9.8, CZ + Math.sin(a) * 16.8, 0.4 + this.rand() * 0.3);
        }
    }

    buildPen(p) {
        this.disc(p.ground, p.x, p.z, p.r, p.r, BASE + 0.004, 28);
        if (p.aviary) this.buildAviary(p);
        else this.roundFence(p.x, p.z, p.r);
        const r = this.rand;
        switch (p.id) {
            case 'gajah':
                this.disc(0x8A847A, p.x - 3, p.z + 2.5, 3.1, 2.4, BASE + 0.008, 16);
                this.disc(0x4D93B0, p.x - 3, p.z + 2.5, 2.7, 2.0, BASE + 0.014, 16);
                this.tree(p.x + 5, p.z + 4, 0.9);
                this.prim('box', 0xC2A15A, 1.4, 0.7, 1.0, p.x + 4, BASE + 0.35, p.z - 4);   // tumpukan jerami
                break;
            case 'jerapah':
                // Pohon akasia (tajuk datar tinggi) + tempat pakan tinggi
                this.prim('cyl', 0x6B4A2E, 0.4, 5.0, 0.4, p.x + 4, BASE + 2.5, p.z - 3, 0, 0, 0, true);
                this.prim('cyl', 0x5A8C32, 6.0, 1.0, 5.0, p.x + 4, BASE + 5.3, p.z - 3, 0, 0, 0, true);
                this.prim('cyl', 0x6B4A2E, 0.2, 4.2, 0.2, p.x - 4, BASE + 2.1, p.z + 3);
                this.prim('box', 0x7A5A3A, 1.4, 0.6, 1.4, p.x - 4, BASE + 4.4, p.z + 3);
                this.prim('box', 0x9DBA4A, 1.2, 0.4, 1.2, p.x - 4, BASE + 4.85, p.z + 3);
                break;
            case 'orangutan': {
                // Rumah hutan: 2 pohon raksasa di tepi kandang, rumah panggung beratap ijuk + jembatan tali
                const A = [p.x - 4, p.z + 3.8], B = [p.x + 4.5, p.z - 3.2], TRUNK = 0x6B4A2E;
                for (const [tx, tz] of [A, B]) {
                    this.prim('cyl', TRUNK, 1.0, 10, 1.0, tx, BASE + 5, tz, 0, 0, 0, true);
                    for (let k = 0; k < 3; k++) this.beam(TRUNK, 0.3, tx, BASE + 0.9, tz, tx + Math.cos(k * 2.1) * 1.2, BASE, tz + Math.sin(k * 2.1) * 1.2);  // akar
                    this.prim('ico', 0x3F7F34, 6.0, 4.0, 6.0, tx, BASE + 11.0, tz, r() * 3, 0, 0, true);
                    this.prim('ico', 0x4C8A3A, 4.2, 3.0, 4.2, tx + 1.2, BASE + 12.6, tz - 0.6, 0, 0, 0, true);
                    for (let k = 0; k < 4; k++) this.prim('cyl', 0x4E7A2E, 0.05, 3.2, 0.05, tx + Math.cos(k * 1.6) * 2.2, BASE + 7.6, tz + Math.sin(k * 1.6) * 2.2);  // akar gantung
                }
                const [hx, hz] = A;
                this.prim('box', 0x8B6A43, 3.8, 0.3, 3.8, hx, BASE + 6.0, hz, 0.3, 0, 0, true);
                this.prim('box', 0xC9A26A, 2.6, 2.0, 2.6, hx, BASE + 7.15, hz, 0.3, 0, 0, true);
                this.prim('box', 0x3A2A1C, 0.06, 0.9, 0.8, hx + Math.cos(0.3) * 1.32, BASE + 7.0, hz - Math.sin(0.3) * 1.32, 0.3);
                this.prim('cone', 0x9C7B3A, 4.4, 2.2, 4.4, hx, BASE + 9.25, hz, Math.PI / 8, 0, 0, true);
                this.prim('box', 0x8B6A43, 2.6, 0.25, 2.6, B[0], BASE + 5.2, B[1], -0.4, 0, 0, true);
                // Jembatan tali melengkung antar pohon
                const N = 9, ya = BASE + 6.1, yb = BASE + 5.3;
                for (let k = 0; k <= N; k++) {
                    const t = k / N, x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t;
                    const y = ya + (yb - ya) * t - Math.sin(t * Math.PI) * 0.8;
                    this.prim('box', 0x8B6A43, 0.9, 0.08, 0.35, x, y, z, Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2);
                }
                for (const off of [-0.45, 0.45]) {
                    const nx = (B[1] - A[1]), nz = -(B[0] - A[0]), nl = Math.hypot(nx, nz);
                    const ox = nx / nl * off, oz = nz / nl * off;
                    this.beam(0xC2A15A, 0.05, A[0] + ox, ya + 0.9, A[1] + oz, (A[0] + B[0]) / 2 + ox, (ya + yb) / 2 + 0.1, (A[1] + B[1]) / 2 + oz);
                    this.beam(0xC2A15A, 0.05, (A[0] + B[0]) / 2 + ox, (ya + yb) / 2 + 0.1, (A[1] + B[1]) / 2 + oz, B[0] + ox, yb + 0.9, B[1] + oz);
                }
                break;
            }
            case 'rusa':
                this.tree(p.x - 3, p.z - 3, 1.0);
                this.tree(p.x + 2, p.z + 4, 0.8, 0x4C8A3A);
                break;
            case 'komodo': {
                // Pulau Komodo: parit air (alas), pulau pasir, bukit batu di tengah, pohon lontar
                this.disc(0xD2BE86, p.x, p.z, 4.7, 4.7, BASE + 0.012, 24);
                this.prim('ico', 0x8A7A5A, 2.2, 3.4, 2.2, p.x, BASE + 1.7, p.z, 0.5, 0, 0, true);
                this.prim('ico', 0x9A8A6A, 1.4, 1.8, 1.4, p.x + 0.9, BASE + 0.9, p.z - 0.6, 0, 0, 0, true);
                for (const a of [0.6, 2.7, 4.6]) {
                    const tx = p.x + Math.cos(a) * 4.2, tz = p.z + Math.sin(a) * 4.2;
                    this.prim('cyl', 0x7A5A3A, 0.25, 5.2, 0.25, tx, BASE + 2.6, tz, 0, 0, 0, true);
                    for (let k = 0; k < 6; k++) this.prim('box', 0x4F8A2E, 0.5, 0.06, 2.0, tx + Math.sin(k) * 0.7, BASE + 5.2, tz + Math.cos(k) * 0.7, k, 0.35, 0, true);
                }
                for (let k = 0; k < 4; k++) { const a = k * 1.6 + 0.3; this.rock(p.x + Math.cos(a) * 3.4, p.z + Math.sin(a) * 3.4, 0.4 + r() * 0.3, 0x9A8A6A); }
                break;
            }
            case 'harimau': {
                // Tebing harimau: dinding batu tinggi di sisi timur + air terjun ke kolam + batu berjemur
                const CL = [0x7C766C, 0x6E685F, 0x8A847A];
                for (let k = 0; k < 8; k++) {
                    const a = -1.25 + (k / 7) * 2.5, h = 5.5 + r() * 3 + (Math.abs(a) < 0.5 ? 1.5 : 0);
                    this.prim('ico', CL[k % 3], 3.2, h, 3.0, p.x + Math.cos(a) * 5.9, BASE + h / 2, p.z + Math.sin(a) * 5.9, r() * 3, 0, 0, true);
                }
                this.prim('box', 0x9FD3E6, 0.25, 6.4, 1.4, p.x + 4.35, BASE + 3.2, p.z);
                this.disc(0x8A847A, p.x + 2.7, p.z, 2.0, 2.3, BASE + 0.006, 16);
                this.disc(0x4D93B0, p.x + 2.7, p.z, 1.7, 2.0, BASE + 0.012, 16);
                this.prim('ico', 0x8A847A, 2.4, 1.2, 2.0, p.x - 2.5, BASE + 0.6, p.z - 2.5, 0.4, 0, 0, true);
                this.tree(p.x - 3.6, p.z + 3.4, 0.9, 0x3B7030);
                break;
            }
        }
    }

    buildAviary(p) {
        // Aviary raksasa: kubah tinggi 14 rusuk (tiap rusuk 7 batang), 3 cincin, mahkota emas + menara puncak
        const n = 14, seg = 7, R = p.r, HF = 1.5, hex = 0x4A4F55;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            for (let s = 0; s < seg; s++) {
                const t0 = (s / seg) * Math.PI / 2, t1 = ((s + 1) / seg) * Math.PI / 2;
                const r0 = Math.cos(t0) * R, r1 = Math.cos(t1) * R, y0 = Math.sin(t0) * R * HF, y1 = Math.sin(t1) * R * HF;
                const ax = p.x + Math.cos(a) * r0, az = p.z + Math.sin(a) * r0, bx = p.x + Math.cos(a) * r1, bz = p.z + Math.sin(a) * r1;
                const len = Math.hypot(bx - ax, y1 - y0, bz - az);
                const m = new THREE.Mesh(UNIT.cyl(), this.mat(hex));
                m.scale.set(0.09, len, 0.09);
                m.position.set((ax + bx) / 2, BASE + (y0 + y1) / 2, (az + bz) / 2);
                m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, y1 - y0, bz - az).normalize());
                this.group.add(m);
            }
        }
        const H = R * HF;
        for (const y of [0.05, H * 0.35, H * 0.7]) {
            const rr = y < 1 ? R : Math.cos(Math.asin(y / H)) * R;
            const t = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.06, 4, 40).rotateX(Math.PI / 2), this.mat(hex));
            t.position.set(p.x, BASE + y, p.z);
            this.group.add(t);
        }
        this.prim('cyl', 0xD4A93A, 1.6, 0.5, 1.6, p.x, BASE + H + 0.1, p.z, 0, 0, 0, true);
        this.prim('cone', 0x2F6B3A, 1.4, 2.2, 1.4, p.x, BASE + H + 1.45, p.z, 0, 0, 0, true);
        this.prim('ico', 0xD4A93A, 0.5, 0.5, 0.5, p.x, BASE + H + 2.75, p.z);
        // Isi: pohon tinggi + tiang tenggeran
        this.tree(p.x + 2.5, p.z - 2, 1.1, 0x4C8A3A);
        this.tree(p.x - 3, p.z + 2.5, 0.8, 0x3F7F34);
        this.prim('cyl', 0x7A5A3A, 0.18, 6, 0.18, p.x - 1, BASE + 3, p.z - 3.5);
        this.prim('box', 0x7A5A3A, 2.4, 0.12, 0.12, p.x - 1, BASE + 5.6, p.z - 3.5);
    }

    buildFacilities() {
        // Warung makan + payung di sudut barat daya
        this.prim('box', 0xE8C99A, 4, 2.4, 3, 326, BASE + 1.2, 156, 0, 0, 0, true);
        this.prim('box', 0xB45309, 4.6, 0.3, 3.6, 326, BASE + 2.55, 156, 0, 0, 0, true);
        for (const [x, z] of [[333, 158], [337, 154], [333, 152]]) {
            this.prim('cyl', 0xDDDDDD, 0.08, 2.2, 0.08, x, BASE + 1.1, z);
            this.prim('cone', [0xE2453C, 0xF2B233, 0x2E86C1][Math.round(x + z) % 3], 2.4, 0.6, 2.4, x, BASE + 2.4, z);
            this.prim('cyl', 0xF2F2F2, 1.1, 0.06, 1.1, x, BASE + 0.75, z);
        }
        // Bangku menghadap danau
        for (const a of [0.4, 1.3, 2.2, 3.6, 4.5, 5.6]) {
            const x = CX + Math.cos(a) * (RING.rx + 2.6), z = CZ + Math.sin(a) * (RING.rz + 2.6);
            if (PENS.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 1.2)) continue;
            const yaw = Math.atan2(CX - x, CZ - z);
            this.prim('box', 0x8B6A43, 1.8, 0.1, 0.5, x, BASE + 0.45, z, yaw);
            this.prim('box', 0x6E5235, 1.6, 0.4, 0.08, x - Math.sin(yaw) * 0.25, BASE + 0.4, z - Math.cos(yaw) * 0.25, yaw);
        }
    }

    buildPlaza() {
        const gz = ZOO_PATH.z, Q = ZOO_PLAZA, PAVE = 0xD8C8A4, STONE = 0x9A9288;
        // Plaza luar (di depan gapura): pelataran batu + 2 patung gajah di atas alas
        const px1 = ZOO_RECT.x0;   // berhenti di pagar: tidak bertumpuk dengan pelat lahan kebun binatang
        this.prim('box', PAVE, px1 - Q.x0, TOP, Q.z1 - Q.z0, (Q.x0 + px1) / 2, TOP / 2, (Q.z0 + Q.z1) / 2);
        for (const s of [-1, 1]) {
            this.prim('box', STONE, 4.4, 1.0, 3.0, 309.5, BASE + 0.5, gz + s * 9, 0, 0, 0, true);
            this.statue('gajah', 309.5, BASE + 1.0, gz + s * 9, -Math.PI / 2, 1.15);
            // Bedeng bunga di sudut plaza
            this.disc(0x3F7F34, 306.5, gz + s * 11.2, 1.4, 1.0, BASE + 0.003, 10);
            for (let k = 0; k < 5; k++) this.prim('ico', [0xE2453C, 0xF2B233, 0xF08FA8][k % 3], 0.5, 0.4, 0.5, 306 + k * 0.3, BASE + 0.2, gz + s * (10.7 + (k % 2) * 0.8));
        }
        // Umbul-umbul di sepanjang jalan masuk (tiang melengkung + kain panjang), kecuali di jembatan kali
        const sx = streamX(gz), COL = [0xE2453C, 0xF2B233, 0x2E86C1, 0x2F9E57];
        let i = 0;
        for (let x = 268; x <= 312; x += 5.5) {
            if (Math.abs(x - sx) < 8) continue;
            for (const s of [-1, 1]) {
                const z = gz + s * 2.6, y0 = x > Q.x0 ? BASE : 0.02;
                this.prim('cyl', 0xF2F2F2, 0.08, 6.4, 0.08, x, y0 + 3.2, z);
                this.prim('cyl', 0xF2F2F2, 0.05, 1.4, 0.05, x, y0 + 6.7, z - s * 0.35, 0, s * 0.6, 0);
                this.prim('box', COL[(i + (s > 0 ? 2 : 0)) % 4], 0.05, 3.4, 0.6, x, y0 + 4.4, z - s * 0.35);
            }
            i++;
        }
        // Plaza dalam: pelataran bundar, patung jerapah di tengah, loket kembar, lampu taman
        this.disc(PAVE, 324, gz, 9, 9, BASE + 0.003, 28);
        this.prim('cyl', STONE, 4.6, 0.6, 4.6, 325, BASE + 0.3, gz, 0, 0, 0, true);
        this.disc(0x3F7F34, 325, gz, 2.0, 2.0, BASE + 0.61, 16);
        this.statue('jerapah', 325, BASE + 0.6, gz, -Math.PI / 2, 1.3);
        for (const s of [-1, 1]) {
            const bz = gz + s * 5.6;
            this.prim('box', 0xF2E3C6, 3.2, 2.6, 2.4, 319, BASE + 1.3, bz, 0, 0, 0, true);
            this.prim('box', 0x2F6B3A, 3.8, 0.3, 3.0, 319, BASE + 2.75, bz, 0, 0, 0, true);
            this.prim('cone', 0x2F6B3A, 2.8, 1.0, 2.2, 319, BASE + 3.4, bz, Math.PI / 4);
            this.prim('box', 0x3A6EA5, 1.4, 0.8, 0.06, 319, BASE + 1.6, bz - s * 1.23);
        }
    }

    buildTower() {
        // Menara Pandang AUDIRA (±27 m): ikon kebun binatang yang terlihat dari seluruh desa
        const { x, z } = TOWER, CREAM = 0xE9D9B0, WOOD = 0x7A3E1E;
        this.prim('cyl', 0x9A9288, 6, 0.6, 6, x, BASE + 0.3, z, 0, 0, 0, true);
        this.prim('cyl', CREAM, 1.8, 19, 1.8, x, BASE + 0.6 + 9.5, z, 0, 0, 0, true);
        for (let k = 0; k < 18; k++) {            // tangga spiral di luar batang
            const a = k * 0.9, y = BASE + 1 + k * 0.98;
            this.prim('box', WOOD, 1.0, 0.12, 0.5, x + Math.cos(a) * 1.3, y, z + Math.sin(a) * 1.3, -a);
        }
        const deck = BASE + 19.6;
        this.prim('cyl', WOOD, 7, 0.5, 7, x, deck, z, 0, 0, 0, true);
        for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; this.prim('cyl', CREAM, 0.08, 1.0, 0.08, x + Math.cos(a) * 3.35, deck + 0.75, z + Math.sin(a) * 3.35); }
        const rail = new THREE.Mesh(new THREE.TorusGeometry(3.35, 0.07, 4, 28).rotateX(Math.PI / 2), this.mat(CREAM));
        rail.position.set(x, deck + 1.25, z);
        this.group.add(rail);
        this.prim('cyl', 0x3A6EA5, 3.6, 2.4, 3.6, x, deck + 1.45, z, 0, 0, 0, true);
        this.prim('cone', 0x2F6B3A, 6.4, 3.0, 6.4, x, deck + 4.15, z, 0, 0, 0, true);
        this.prim('cyl', 0xDDDDDD, 0.08, 3.0, 0.08, x, deck + 7.1, z);
        this.prim('box', 0xB45309, 0.05, 0.9, 1.6, x, deck + 8.1, z + 0.8);
    }

    buildBridge() {
        // Jembatan lengkung merah melintasi lobus selatan danau + jalan sambung ke jalan melingkar
        const B = BRIDGE, N = 10, RED = 0xB03A2E, y = t => BASE + 0.15 + B.peak * (1 - (2 * t - 1) ** 2);
        for (let k = 0; k < N; k++) {
            const t0 = k / N, t1 = (k + 1) / N;
            const x0 = CX - B.half + 2 * B.half * t0, x1 = CX - B.half + 2 * B.half * t1;
            const y0 = y(t0), y1 = y(t1), len = Math.hypot(x1 - x0, y1 - y0) + 0.05, rz = Math.atan2(y1 - y0, x1 - x0);
            this.prim('box', 0x8B6A43, len, 0.25, B.w, (x0 + x1) / 2, (y0 + y1) / 2, B.z, 0, 0, rz, true);
            for (const s of [-1, 1]) this.prim('box', RED, len, 0.1, 0.1, (x0 + x1) / 2, (y0 + y1) / 2 + 0.9, B.z + s * (B.w / 2 - 0.05), 0, 0, rz);
        }
        for (let k = 0; k <= N; k++) {
            const t = k / N, x = CX - B.half + 2 * B.half * t;
            for (const s of [-1, 1]) this.prim('box', RED, 0.14, 1.0, 0.14, x, y(t) + 0.55, B.z + s * (B.w / 2 - 0.05));
        }
        for (const dx of [-3, 3]) {
            const t = (dx + B.half) / (2 * B.half), top = y(t) - 0.12;
            this.prim('cyl', 0x9A9288, 0.5, top - BASE, 0.5, CX + dx, BASE + (top - BASE) / 2, B.z, 0, 0, 0, true);
        }
        for (const s of [-1, 1]) {
            const a = CX + s * B.half, b = CX + s * 16.4;
            this.prim('box', 0xC9B48A, Math.abs(b - a), 0.01, B.w, (a + b) / 2, BASE - 0.004, B.z);
        }
    }

    buildKiosksAndLamps() {
        // Kios gerobak beratap payung bergaris
        for (const [x, z, hex] of KIOSKS) {
            this.prim('box', hex, 2.0, 1.0, 1.2, x, BASE + 0.7, z, 0, 0, 0, true);
            this.prim('box', 0xF2F2F2, 2.1, 0.08, 1.3, x, BASE + 1.24, z);
            for (const s of [-1, 1]) this.prim('cyl', 0x2B2B2B, 0.4, 0.06, 0.4, x + s * 0.7, BASE + 0.2, z + 0.64, 0, 0, Math.PI / 2);
            this.prim('cyl', 0xDDDDDD, 0.06, 1.6, 0.06, x, BASE + 2.0, z);
            this.prim('cone', hex, 2.8, 0.7, 2.8, x, BASE + 3.1, z);
            this.prim('cone', 0xF2F2F2, 1.4, 0.36, 1.4, x, BASE + 3.3, z);
        }
        // Lampu taman di luar jalan melingkar + plaza: tiang statis, bola lampu = 1 InstancedMesh
        this.lampSpots = [];
        for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2 + 0.17;
            const x = CX + Math.cos(a) * (RING.rx + 1.9), z = CZ + Math.sin(a) * (RING.rz + 1.9);
            if (PENS.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 1)) continue;
            this.lampSpots.push([x, z]);
        }
        for (const s of [-1, 1]) this.lampSpots.push([317, ZOO_PATH.z + s * 2.4], [331, ZOO_PATH.z + s * 2.4], [309.5, ZOO_PATH.z + s * 4.5]);
        for (const [x, z] of this.lampSpots) {
            const y0 = x < ZOO_RECT.x0 ? TOP + 0.02 : BASE;
            this.prim('cyl', 0x2B2B2B, 0.12, 3.4, 0.12, x, y0 + 1.7, z);
            this.prim('cyl', 0x2B2B2B, 0.5, 0.12, 0.5, x, y0 + 3.4, z);
        }
    }

    buildTrees() {
        const R = ZOO_RECT, r = this.rand;
        let placed = 0;
        for (let t = 0; t < 400 && placed < 34; t++) {
            const x = R.x0 + 3 + r() * (R.x1 - R.x0 - 6), z = R.z0 + 3 + r() * (R.z1 - R.z0 - 6);
            const e = ((x - CX) / (RING.rx + 3)) ** 2 + ((z - CZ) / (RING.rz + 3)) ** 2;
            if (e < 1.35 && e > 0.6) continue;                                   // jalan melingkar
            if (e <= 0.6 && ((x - CX) / 11) ** 2 + ((z - CZ) / 18) ** 2 < 1) continue; // danau
            if (Math.abs(z - ZOO_PATH.z) < 4 && x < CX) continue;                // jalan gerbang
            if (PENS.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 2.2)) continue;
            if (x < 340 && z < 162) continue;                                     // warung
            if (this.blocked(x, z, 1)) continue;                                  // plaza, menara, jembatan, kios
            this.tree(x, z, 0.7 + r() * 0.5, [0x3F7F34, 0x4C8A3A, 0x356F2C][Math.floor(r() * 3)]);
            placed++;
        }
    }

    // ---------------------------------------------------------------------
    // Satwa bergerak
    // ---------------------------------------------------------------------
    buildAnimals() {
        const r = this.rand;
        this.herds = [];
        // Semua jenis satwa dalam SATU MultiInstanced (12 draw call -> 1); geometri prosedural kecil
        const total = POP.reduce((s, P) => s + P.n, 0);
        const im = new MultiInstanced(POP.map(P => SPECIES[P.sp]()), new THREE.MeshLambertMaterial({ vertexColors: true }), total);
        im.name = 'zoo_satwa';
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;     // posisi diperbarui tiap frame; area kecil
        this.scene.add(im);
        this.animalMesh = im;
        let base = 0;
        POP.forEach((P, part) => {
            // Flamingo: perairan dangkal barat laut danau (pulau di timur laut, perahu di selatan)
            const pen = P.pen === 'danau' ? { x: CX - 3, z: CZ + 10, r: 5, rz: 4.5 } : PENS.find(p => p.id === P.pen);
            const walk = pen.walk ?? pen.r - 2;
            for (let k = 0; k < P.n; k++) im.setPart(base + k, part);
            const list = [];
            for (let k = 0; k < P.n; k++) {
                const rx = walk * (0.35 + r() * 0.6);
                list.push({
                    rx, rz: pen.rz ? rx * (pen.rz / pen.r) : rx * (0.7 + r() * 0.3),
                    a: r() * Math.PI * 2, dir: r() < 0.5 ? 1 : -1,
                    speed: P.speed * (0.8 + r() * 0.4),
                    timer: r() * 6, moving: r() < 0.6, phase: r() * 10
                });
            }
            this.herds.push({ im, base, pen, list, sp: P.sp });
            base += P.n;
        });
        this.visible = true;
        this.update(0, null);
    }

    update(dt, camPos) {
        if (!this.herds) return;
        const show = !camPos || Math.hypot(camPos.x - CX, camPos.z - CZ) < ANIMAL_LOD;
        if (show !== this.visible) {
            this.visible = show;
            this.animalMesh.visible = show;
            if (this.rideLod) for (const m of this.rideLod) m.visible = show;
        }
        if (!show) return;
        this.t = (this.t || 0) + dt;
        const t = this.t;
        if (this.rideLod) this.updateRides(dt, t);
        for (const h of this.herds) {
            const { im, base, pen, list } = h;
            for (let k = 0; k < list.length; k++) {
                const a = list[k];
                a.timer -= dt;
                if (a.timer <= 0) { a.moving = !a.moving; a.timer = a.moving ? 4 + Math.random() * 6 : 2 + Math.random() * 5; if (Math.random() < 0.25) a.dir *= -1; }
                if (a.moving) a.a += a.dir * a.speed * dt / Math.max(a.rx, 1);
                const x = pen.x + Math.cos(a.a) * a.rx, z = pen.z + Math.sin(a.a) * a.rz;
                // arah = garis singgung lintasan elips
                const tx = -Math.sin(a.a) * a.rx * a.dir, tz = Math.cos(a.a) * a.rz * a.dir;
                const yaw = Math.atan2(tx, tz);
                const bob = a.moving ? Math.abs(Math.sin(t * 5 * a.speed + a.phase)) * 0.05 : 0;
                const pitch = a.moving ? 0 : 0.06 + 0.04 * Math.sin(t * 1.3 + a.phase);   // merumput / mengendus
                _m4.compose(_p.set(x, BASE + bob, z), _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ')), _s.set(1, 1, 1));
                im.setMatrixAt(base + k, _m4);
            }
        }
        this.animalMesh.instanceMatrix.needsUpdate = true;
    }
}
