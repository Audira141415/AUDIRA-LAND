/**
 * AUDIRA-LAND: Satwa pedesaan hidup (Desa Have-Not & sawah di luar peta).
 *  - Bebek: berbaris di pematang (bolak-balik), berenang di petak sawah tergenang & di kali.
 *  - Kuntul putih: berdiri/mematuk di sawah, dan kawanan terbang formasi V dengan kepakan sayap.
 *  - Ayam & anak ayam: mematuk di pekarangan rumah/warung Have-Not (titik bebas dicari dengan raycast
 *    ke mesh bangunan itu sendiri, jadi tidak menembus pagar/sumur/bedeng).
 *  - Kerbau: berjalan pelan menyusuri tepian kali, berhenti merumput (kepala menunduk, kaki melangkah).
 *
 * Semua = 7 InstancedMesh (bebek, kuntul, sayap kuntul, ayam, badan/kepala/kaki kerbau).
 * Geometri tiap satwa dilebur dengan vertex color -> satu material bersama.
 * Bounding sphere tiap InstancedMesh dihitung ulang tiap frame dari posisi instance, sehingga frustum
 * culling tetap bekerja; satwa kecil disembunyikan saat kamera jauh.
 *
 * Data sawah/kali dihitung ulang dari rumus yang sama dengan rural_scenery.js (read-only):
 * petak 13 x 9,5 m, permukaan datar y 0,32 (x < 268), pematang +0,22, kali y 0,05.
 * Zero-Submerging: kaki/alas setiap satwa >= permukaan + 0,02.
 */

import { CHANNEL, inOrchard } from './rural_scenery.js';
import { inZoo } from './zoo.js';
import { onCoastRoad } from '../core/coast_roads.js';
import { GRID_CONFIG, EAST_EDGE_X, EAST_DX as DX } from '../core/constants.js';
import { pfWalkFrames, WALK_FRAMES } from './polyfork_library.js';
import { MultiInstanced, mergeParts as mergeMultiParts } from '../core/multi_instanced.js';

// Ternak Polyfork (CC BY 4.0): frame jalan dibake, ukuran asli kambing ±1,3 m, sapi ±2,4 m panjang
const TERNAK = {
    kambing: { id: 'goat-base', scale: 0.85, speed: 0.38, off: 4.2, gap: 1.6 },
    sapi: { id: 'cow-base', scale: 1.0, speed: 0.32, off: 5.6, gap: 3.0 }
};

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

// ---------------------------------------------------------------------------
// Data sawah & kali (salinan rumus rural_scenery.js)
// ---------------------------------------------------------------------------
const MAP_MAX_X = EAST_EDGE_X;
const MAP_Z = 176;
const LIFT = 0.02;
const streamX = z => 236 + DX + 13 * Math.sin(z / 52) + 5 * Math.sin(z / 19 + 1.3);
const streamSlope = z => (13 / 52) * Math.cos(z / 52) + (5 / 19) * Math.cos(z / 19 + 1.3);
const STREAM_HALF = 3.6;
const STREAM_Y = 0.05;
const BAMBOO_BRIDGES = [-200, -40, 120, 260];
const STATIC_KERBAU = [[streamX(60) + 7, 60], [streamX(72) + 9, 72], [streamX(-150) - 8, -150]];
const CW = 13, CD = 9.5;
const REGIONS = [
    { x0: MAP_MAX_X + 6, x1: 334 + DX, z0: -300, z1: 300 },
    { x0: 24, x1: MAP_MAX_X + 6, z0: MAP_Z + 8, z1: 300 },
    { x0: 24, x1: MAP_MAX_X + 6, z0: -300, z1: -MAP_Z - 8 }
];
const terraceTop = x => (x < 268 + DX ? 0.32 : 0.32 + (Math.floor((x - 268 - DX) / 13) + 1) * 0.85);
const distToChannel = (x, z) => {
    let best = Infinity;
    for (const p of CHANNEL) best = Math.min(best, Math.hypot(x - p.x, z - p.z) - p.half);
    return best;
};

function buildCells(gubukSpots) {
    const gubuk = new Set((gubukSpots || []).map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`));
    const cells = [];
    const index = new Map();
    REGIONS.forEach((R, ri) => {
        for (let x = R.x0, ix = 0; x + CW <= R.x1 + 0.01; x += CW, ix++) {
            for (let z = R.z0, iz = 0; z + CD <= R.z1 + 0.01; z += CD, iz++) {
                const cx = x + CW / 2, cz = z + CD / 2;
                let skip = distToChannel(cx, cz) < 9.5
                    || Math.abs(cx - streamX(cz)) < CW / 2 + STREAM_HALF + 2.8
                    || gubuk.has(`${cx.toFixed(2)},${cz.toFixed(2)}`)
                    || inZoo(cx, cz, Math.max(CW, CD) / 2 + 1)
                    || onCoastRoad(cx, cz, Math.max(CW, CD) / 2 + 1)
                    || inOrchard(cx, cz);
                const base = Math.sin(cx * 0.031 + 1.7) + Math.cos(cz * 0.027);
                const c = { ri, ix, iz, x, z, cx, cz, top: terraceTop(cx), skip, base, water: base < -1.35 };
                cells.push(c);
                index.set(`${ri}:${ix}:${iz}`, c);
            }
        }
    });
    return { cells, index };
}

// ---------------------------------------------------------------------------
// Geometri: primitive dilebur + vertex color
// ---------------------------------------------------------------------------
const TPL = {
    box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
    ball: new THREE.IcosahedronGeometry(0.5, 1),
    cone: new THREE.ConeGeometry(0.5, 1, 6).toNonIndexed()
};

function mergeParts(parts, scale = 1) {
    const pos = [], nrm = [], col = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const S = new THREE.Matrix4().makeScale(scale, scale, scale);
    for (const [kind, hex, s, p, r = [0, 0, 0]] of parts) {
        const g = TPL[kind].clone();
        e.set(r[0], r[1], r[2], 'YXZ');
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(...p), q, new THREE.Vector3(...s));
        g.applyMatrix4(m);
        g.applyMatrix4(S);
        const c = lin(hex);
        const P = g.attributes.position.array, N = g.attributes.normal.array;
        for (let i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(N[i]); }
        for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
        g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    return geo;
}

const C = {
    white: 0xF3F1EA, bill: 0xE58A2B, egret: 0xF6F6F2, beak: 0xE9BC34, legDark: 0x2B2A28,
    comb: 0xD6342A, chickLeg: 0xE7B743, kerbau: 0x4C4844, kerbauDark: 0x3A3633, horn: 0x8C8270, muzzle: 0x6A625C
};

// Bebek: depan +Z, alas kaki y=0
const DUCK = () => mergeParts([
    ['ball', C.white, [0.32, 0.24, 0.5], [0, 0.2, 0]],
    ['cone', C.white, [0.16, 0.16, 0.16], [0, 0.26, -0.27], [-2.0, 0, 0]],
    ['box', C.white, [0.1, 0.2, 0.1], [0, 0.33, 0.17]],
    ['ball', C.white, [0.17, 0.16, 0.2], [0, 0.45, 0.2]],
    ['box', C.bill, [0.085, 0.035, 0.13], [0, 0.43, 0.34]],
    ['box', C.bill, [0.06, 0.08, 0.1], [-0.07, 0.04, 0.02]],
    ['box', C.bill, [0.06, 0.08, 0.1], [0.07, 0.04, 0.02]]
], 1.25);

// Kuntul berdiri; badan miring 40° sehingga rotasi +0,8 rad = pose terbang (kaki terseret ke belakang)
const EGRET_PIVOT_Y = 0.56;
const EGRET = () => mergeParts([
    ['box', C.legDark, [0.035, 0.44, 0.035], [-0.06, 0.22, -0.02]],
    ['box', C.legDark, [0.035, 0.44, 0.035], [0.06, 0.22, -0.02]],
    ['ball', C.egret, [0.24, 0.24, 0.56], [0, 0.56, 0], [-0.7, 0, 0]],
    ['box', C.egret, [0.065, 0.34, 0.065], [0, 0.82, 0.17], [0.25, 0, 0]],
    ['ball', C.egret, [0.11, 0.11, 0.15], [0, 0.99, 0.22]],
    ['cone', C.beak, [0.045, 0.2, 0.045], [0, 0.98, 0.37], [Math.PI / 2, 0, 0]]
], 1.1);
// Sayap kiri (+X), pangkal di x=0; sayap kanan = instance yang dicerminkan (scale x -1)
const WING = () => mergeParts([
    ['box', C.egret, [0.42, 0.03, 0.3], [0.21, 0, 0]],
    ['box', C.egret, [0.3, 0.025, 0.2], [0.55, 0, -0.04]]
], 1.1);

// Ayam (anak ayam = instance yang sama, skala 0,45, warna kuning)
const CHICKEN = () => mergeParts([
    ['box', C.chickLeg, [0.03, 0.13, 0.03], [-0.06, 0.065, 0]],
    ['box', C.chickLeg, [0.03, 0.13, 0.03], [0.06, 0.065, 0]],
    ['ball', C.white, [0.3, 0.26, 0.36], [0, 0.25, 0]],
    ['box', C.white, [0.07, 0.22, 0.15], [0, 0.38, -0.17], [-0.45, 0, 0]],
    ['ball', C.white, [0.15, 0.16, 0.15], [0, 0.43, 0.15]],
    ['box', C.comb, [0.03, 0.07, 0.1], [0, 0.53, 0.15]],
    ['cone', C.beak, [0.05, 0.08, 0.05], [0, 0.42, 0.25], [Math.PI / 2, 0, 0]]
]);

// Kerbau: badan (alas kaki y=0 saat berdiri)
const KERBAU_BODY = () => mergeParts([
    ['box', C.kerbau, [1.0, 0.78, 1.9], [0, 1.0, 0]],
    ['box', C.kerbau, [0.9, 0.3, 0.7], [0, 1.42, 0.45]],
    ['box', C.kerbauDark, [0.07, 0.6, 0.07], [0, 0.8, -0.98], [0.15, 0, 0]],
    ['box', C.kerbauDark, [0.14, 0.14, 0.14], [0, 0.48, -1.02]]
]);
// Kepala: pivot di leher (0,0,0), menghadap +Z
const KERBAU_HEAD = () => mergeParts([
    ['box', C.kerbau, [0.5, 0.48, 0.66], [0, -0.06, 0.34]],
    ['box', C.muzzle, [0.38, 0.3, 0.24], [0, -0.17, 0.7]],
    ['box', C.horn, [0.5, 0.08, 0.1], [-0.36, 0.22, 0.12], [0, 0, 0.4]],
    ['box', C.horn, [0.5, 0.08, 0.1], [0.36, 0.22, 0.12], [0, 0, -0.4]],
    ['box', C.horn, [0.08, 0.2, 0.08], [-0.6, 0.38, 0.1], [0, 0, 0.6]],
    ['box', C.horn, [0.08, 0.2, 0.08], [0.6, 0.38, 0.1], [0, 0, -0.6]],
    ['box', C.kerbauDark, [0.12, 0.08, 0.18], [-0.3, 0.06, 0.02], [0, 0, -0.5]],
    ['box', C.kerbauDark, [0.12, 0.08, 0.18], [0.3, 0.06, 0.02], [0, 0, 0.5]]
]);
// Kaki: pivot di pinggul (puncak kaki y=0), panjang 0,64
const KERBAU_LEG = () => mergeParts([
    ['box', C.kerbau, [0.2, 0.56, 0.2], [0, -0.28, 0]],
    ['box', C.kerbauDark, [0.21, 0.08, 0.21], [0, -0.6, 0]]
]);
const KERBAU_HIPS = [[-0.33, 0.64, 0.68], [0.33, 0.64, 0.68], [-0.33, 0.64, -0.68], [0.33, 0.64, -0.68]];
const KERBAU_NECK = [0, 1.18, 0.95];

// ---------------------------------------------------------------------------
// Batch: InstancedMesh + bounding sphere dinamis
// ---------------------------------------------------------------------------
class Batch {
    constructor(scene, name, geo, mat, cap, margin, opts = {}) {
        // r128: program shader tidak dibedakan per ada/tidaknya instanceColor -> material per batch,
        // dan semua batch diberi instanceColor (putih) agar atribut selalu ada.
        // opts.parts: beberapa geometri dalam satu draw call (MultiInstanced); pilih bagian lewat this.part
        this.im = opts.parts ? new MultiInstanced(opts.parts, mat, Math.max(1, cap))
            : new THREE.InstancedMesh(geo, mat.clone(), Math.max(1, cap));
        this.multi = !!opts.parts;
        this.part = 0;
        this.im.name = name;
        const white = new THREE.Color(1, 1, 1);
        for (let i = 0; i < Math.max(1, cap); i++) this.im.setColorAt(i, white);
        this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.im.castShadow = !!opts.cast;
        this.im.receiveShadow = true;
        this.im.count = 0;
        this.margin = margin;
        this.maxDist = opts.maxDist || 300;
        scene.add(this.im);
        this.m = new THREE.Matrix4();
        this.q = new THREE.Quaternion();
        this.e = new THREE.Euler();
        this.v = new THREE.Vector3();
        this.s = new THREE.Vector3();
        this.p = new THREE.Vector3();
    }
    begin(cam) {
        this.i = 0;
        this.cam = cam || null;
        this.near = Infinity;
        this.minX = this.minY = this.minZ = Infinity;
        this.maxX = this.maxY = this.maxZ = -Infinity;
    }
    /** Pivot: titik lokal (0,pivotY,0) diletakkan di (x,y,z), lalu rotasi YXZ di sekitarnya. */
    put(x, y, z, ry, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx, pivotY = 0) {
        this.e.set(rx, ry, rz, 'YXZ');
        this.q.setFromEuler(this.e);
        this.s.set(sx, sy, sz);
        this.p.set(0, -pivotY * sy, 0).applyQuaternion(this.q);
        this.v.set(x + this.p.x, y + this.p.y, z + this.p.z);
        this.m.compose(this.v, this.q, this.s);
        if (this.multi) this.im.setPart(this.i, this.part);
        this.im.setMatrixAt(this.i++, this.m);
        this.grow(x, y, z);
    }
    putMatrix(mat, x, y, z) {
        if (this.multi) this.im.setPart(this.i, this.part);
        this.im.setMatrixAt(this.i++, mat);
        this.grow(x, y, z);
    }
    grow(x, y, z) {
        if (this.cam) {
            const d = (x - this.cam.x) ** 2 + (y - this.cam.y) ** 2 + (z - this.cam.z) ** 2;
            if (d < this.near) this.near = d;
        }
        if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
        if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
        if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    }
    end() {
        this.im.count = this.i;
        this.im.instanceMatrix.needsUpdate = true;
        // LOD: sembunyikan bila satwa terdekat lebih jauh dari maxDist (sudah sub-piksel)
        this.im.visible = this.i > 0 && (!this.cam || Math.sqrt(this.near) < this.maxDist);
        if (this.i === 0) return;
        const bs = this.im.geometry.boundingSphere;
        bs.center.set((this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2, (this.minZ + this.maxZ) / 2);
        bs.radius = Math.hypot(this.maxX - this.minX, this.maxY - this.minY, this.maxZ - this.minZ) / 2 + this.margin;
    }
    setColors(colors) {
        colors.forEach((hex, i) => this.im.setColorAt(i, lin(hex)));
        if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
    }
}

const pingpong = (u, L) => {
    const m = ((u % (2 * L)) + 2 * L) % (2 * L);
    return m < L ? [m, 1] : [2 * L - m, -1];
};
const angLerp = (a, b, k) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
};

const HEN_COLORS = [0xA4532C, 0x2E2B28, 0xF1EEE6, 0xD39B45, 0x8A4A26];
const DUCK_COLORS = [0xB48A60, 0xA07A54, 0xFFFFFF, 0xC49A6C];

// ---------------------------------------------------------------------------
export class Wildlife {
    /**
     * @param scene
     * @param scenery   RuralScenery (dibaca saja: treeSpots, gubukSpots)
     * @param houses    [{ data, mesh }] dari buildingLoader.loadedBuildings
     */
    constructor(scene, scenery, houses) {
        this.r = rng(7788);
        this.time = 0;
        const { cells, index } = buildCells(scenery && scenery.gubukSpots);
        this.cells = cells;
        this.cellIndex = index;
        this.trees = (scenery && scenery.treeSpots) || [];

        this.ducks = [];
        this.duckFlocks = [];
        this.egrets = [];
        this.egretFlocks = [];
        this.chickens = [];
        this.kerbau = [];
        this.ternak = [];

        this.planDikeDucks();
        this.planPaddyDucks();
        this.planStreamDucks();
        this.planEgrets();
        this.planKerbau();
        this.planTernak();
        this.planChickens(houses || []);

        const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.mat = mat;
        const nFly = this.egretFlocks.reduce((s, f) => s + f.n, 0);
        this.bDuck = new Batch(scene, 'wild_ducks', DUCK(), mat, this.ducks.length, 1, { maxDist: 130 });
        this.bEgret = new Batch(scene, 'wild_egrets', EGRET(), mat, this.egrets.length + nFly, 2, { maxDist: 260 });
        this.bWing = new Batch(scene, 'wild_egret_wings', WING(), mat, nFly * 2, 2, { maxDist: 260 });
        this.bChicken = new Batch(scene, 'wild_chickens', CHICKEN(), mat, this.chickens.length, 1, { maxDist: 110 });
        // Kerbau: badan (bagian 0), kepala (1), kaki (2) dalam satu MultiInstanced
        this.bKerbau = new Batch(scene, 'wild_kerbau', null, mat, this.kerbau.length * 6, 3,
            { maxDist: 220, cast: true, parts: [KERBAU_BODY(), KERBAU_HEAD(), KERBAU_LEG()] });
        this.batches = [this.bDuck, this.bEgret, this.bWing, this.bChicken, this.bKerbau];
        // Ternak Polyfork: 1 InstancedMesh per jenis, geometri diganti per frame jalan (warna asli model)
        // Semua ternak dalam SATU MultiInstanced: bagian 2j = jenis j berjalan (frame berganti),
        // 2j+1 = jenis j diam (frame 0, merumput tanpa kaki melangkah). 4 draw call -> 1.
        this.ternakPart = {};
        const kinds = Object.entries(TERNAK)
            .map(([kind, T]) => ({ kind, frames: pfWalkFrames(T.id) }))
            .filter(k => k.frames && this.ternak.some(a => a.kind === k.kind));
        this.ternak = this.ternak.filter(a => kinds.some(k => k.kind === a.kind));
        if (kinds.length) {
            kinds.forEach((k, j) => { this.ternakPart[k.kind] = 2 * j; });
            const partsAt = f => kinds.flatMap(k => [k.frames[f], k.frames[0]]);
            this.bTernak = new Batch(scene, 'wild_ternak', null, mat, this.ternak.length, 2,
                { maxDist: 120, parts: partsAt(0) });
            this.ternakFrames = [this.bTernak.im.geometry];
            for (let f = 1; f < WALK_FRAMES; f++) {
                const g = mergeMultiParts(partsAt(f));
                g.setAttribute('iPart', this.bTernak.im.parts);
                this.ternakFrames.push(g);
            }
            this.batches.push(this.bTernak);
        }

        this.bDuck.setColors(this.ducks.map(d => d.color));
        this.bChicken.setColors(this.chickens.map(c => c.color));

        this.mWing = new THREE.Matrix4();
        this.update(0.016, null);
    }

    // ----------------------------------------------------------- perencanaan
    cell(ri, ix, iz) { return this.cellIndex.get(`${ri}:${ix}:${iz}`); }

    treeNear(x, z, rad) {
        for (const t of this.trees) if (Math.hypot(t[0] - x, t[2] - z) < rad) return true;
        return false;
    }

    /** Titik (x,z) berada di petak sawah yang padat (bukan dilewati)? */
    occupied(x, z) {
        for (let ri = 0; ri < REGIONS.length; ri++) {
            const R = REGIONS[ri];
            const ix = Math.floor((x - R.x0 + 0.3) / CW), iz = Math.floor((z - R.z0 + 0.3) / CD);
            const c = this.cell(ri, ix, iz);
            if (c && !c.skip) return true;
        }
        return false;
    }

    /** Bebek berbaris di pematang: cari ruas pematang datar panjang tanpa pohon. */
    planDikeDucks() {
        const runs = [];
        for (const ri of [1, 2]) {
            const R = REGIONS[ri];
            const nz = Math.floor((R.z1 + 0.01 - R.z0 - CD) / CD) + 1;
            const nx = Math.floor((R.x1 + 0.01 - R.x0 - CW) / CW) + 1;
            for (let iz = 0; iz < nz; iz++) {
                let start = -1;
                for (let ix = 0; ix <= nx; ix++) {
                    const c = ix < nx ? this.cell(ri, ix, iz) : null;
                    const ok = c && !c.skip && c.top < 0.5 && !this.treeNear(c.cx, c.z, CW / 2 + 1.5);
                    if (ok && start < 0) start = ix;
                    if (!ok && start >= 0) {
                        if (ix - start >= 4) {
                            const a = this.cell(ri, start, iz), b = this.cell(ri, ix - 1, iz);
                            runs.push({ ri, z: a.z, x0: a.x + 0.8, x1: b.x + CW - 0.8, top: a.top, d: Math.abs(Math.abs(a.z) - MAP_Z) });
                        }
                        start = -1;
                    }
                }
            }
        }
        runs.sort((a, b) => a.d - b.d);
        const picked = [];
        for (const run of runs) {
            if (picked.length >= 8) break;
            if (picked.some(p => p.ri === run.ri && Math.abs(p.z - run.z) < 18)) continue;
            picked.push(run);
        }
        for (const run of picked) {
            const n = 6 + Math.floor(this.r() * 4);
            const f = { kind: 'dike', run, L: run.x1 - run.x0, u: this.r() * 40, speed: 0.55 + this.r() * 0.2, n, first: this.ducks.length };
            this.duckFlocks.push(f);
            for (let i = 0; i < n; i++) this.ducks.push({ flock: f, i, phase: this.r() * 6.28, color: DUCK_COLORS[Math.floor(this.r() * DUCK_COLORS.length)] });
        }
    }

    /** Bebek berenang bebas di petak sawah yang pasti tergenang, dekat desa. */
    planPaddyDucks() {
        const wet = this.cells.filter(c => !c.skip && c.water && !this.treeNear(c.cx, c.cz, 8));
        wet.sort((a, b) => Math.hypot(a.cx - 110, Math.abs(a.cz) - MAP_Z) - Math.hypot(b.cx - 110, Math.abs(b.cz) - MAP_Z));
        const used = [];
        for (const c of wet) {
            if (used.length >= 9) break;
            if (used.some(u => Math.hypot(u.cx - c.cx, u.cz - c.cz) < 20)) continue;
            used.push(c);
            const n = 4 + Math.floor(this.r() * 3);
            const f = { kind: 'paddy', cell: c, n, first: this.ducks.length };
            this.duckFlocks.push(f);
            for (let i = 0; i < n; i++) {
                this.ducks.push({
                    flock: f, i, phase: this.r() * 6.28, color: DUCK_COLORS[Math.floor(this.r() * DUCK_COLORS.length)],
                    x: c.cx + (this.r() - 0.5) * 7, z: c.cz + (this.r() - 0.5) * 5, h: this.r() * 6.28, turn: 0
                });
            }
        }
    }

    /** Bebek berenang beriringan di kali, di antara jembatan bambu. */
    planStreamDucks() {
        for (const [z0, z1] of [[-30, 108], [-188, -54], [134, 246]]) {
            const n = 7 + Math.floor(this.r() * 4);
            const f = { kind: 'stream', z0, L: z1 - z0, u: this.r() * 60, speed: 0.45 + this.r() * 0.15, n, first: this.ducks.length };
            this.duckFlocks.push(f);
            for (let i = 0; i < n; i++) this.ducks.push({ flock: f, i, phase: this.r() * 6.28, lat: Math.sin(i * 1.7) * 1.1, color: DUCK_COLORS[Math.floor(this.r() * DUCK_COLORS.length)] });
        }
    }

    planEgrets() {
        // Berdiri: petak padat, bukan blok padi menguning (tempat orang-orangan sawah)
        const ok = this.cells.filter(c => !c.skip && c.base < 0.9 && !this.treeNear(c.cx, c.cz, 7));
        const near = ok.filter(c => c.cx < 280).sort(() => this.r() - 0.5);
        const chosen = [];
        for (const c of near) {
            if (chosen.length >= 22) break;
            if (chosen.some(u => Math.hypot(u.cx - c.cx, u.cz - c.cz) < 16)) continue;
            chosen.push(c);
        }
        for (const c of chosen) {
            const k = this.r() < 0.4 ? 2 : 1;
            for (let i = 0; i < k; i++) {
                this.egrets.push({
                    cell: c, x: c.cx + (this.r() - 0.5) * (CW - 3), z: c.cz + (this.r() - 0.5) * (CD - 3),
                    h: this.r() * 6.28, hT: this.r() * 6.28, peck: 0, timer: this.r() * 4, walk: 0
                });
            }
        }
        // Terbang: kawanan formasi V mengitari sawah
        for (const [cx, cz, rx, rz, alt, n, w] of [
            [120, 236, 70, 34, 18, 7, 0.09], [262 + DX, -60, 46, 110, 24, 6, -0.07], [250 + DX, 150, 40, 70, 15, 5, 0.11]
        ]) {
            this.egretFlocks.push({ cx, cz, rx, rz, alt, n, w, a: this.r() * 6.28, phase: this.r() * 10 });
        }
    }

    /** Kerbau di tepian kali: ruas tepian bebas petak/pohon/jembatan/kerbau statis. */
    planKerbau() {
        const OFF = 5.0;
        const clear = (z, side) => {
            const x = streamX(z) + side * OFF;
            if (BAMBOO_BRIDGES.some(b => Math.abs(z - b) < 8)) return false;
            if (STATIC_KERBAU.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < 5)) return false;
            if (this.treeNear(x, z, 2.8)) return false;
            if (distToChannel(x, z) < 4) return false;
            for (const dz of [-1.4, 0, 1.4]) for (const dx of [-0.8, 0.8]) if (this.occupied(x + dx, z + dz)) return false;
            return Math.abs(z) < 300;
        };
        const runs = [];
        for (const side of [-1, 1]) {
            let start = null;
            for (let z = -296; z <= 296; z += 1) {
                const ok = clear(z, side);
                if (ok && start === null) start = z;
                if ((!ok || z === 296) && start !== null) {
                    const end = ok ? z : z - 1;
                    if (end - start >= 14) runs.push({ side, z0: start + 1.5, z1: end - 1.5 });
                    start = null;
                }
            }
        }
        runs.sort((a, b) => (b.z1 - b.z0) - (a.z1 - a.z0));
        this.spareRuns = runs.slice(8);   // sisa tepian kali -> kambing & sapi (planTernak)
        for (const run of runs.slice(0, 8)) {
            this.kerbau.push({
                run, off: OFF, s: this.r() * (run.z1 - run.z0), dir: this.r() < 0.5 ? 1 : -1, h: 0,
                state: this.r() < 0.5 ? 'walk' : 'graze', timer: 2 + this.r() * 8, head: 0.5, leg: this.r() * 6.28,
                scale: 0.92 + this.r() * 0.16
            });
        }
    }

    /** Kambing (kawanan 2-3) & sapi (1-2) menyusuri tepian kali yang tidak dipakai kerbau. */
    planTernak() {
        const runs = this.spareRuns || [];
        runs.slice(0, 16).forEach((run, i) => {
            const kind = i % 3 === 2 ? 'sapi' : 'kambing';
            const n = kind === 'sapi' ? 2 + (this.r() < 0.5 ? 1 : 0) : 3 + Math.floor(this.r() * 3);
            const L = run.z1 - run.z0, gap = TERNAK[kind].gap;
            // Satu kawanan bergerak bersama: s = posisi ekor terakhir, anggota ke-k di s + k*gap,
            // jadi kawanan selalu muat di jalur dan anggotanya tidak pernah saling tembus.
            const herd = {
                run, len: Math.max(0, L - gap * (n - 1)), s: 0, dir: this.r() < 0.5 ? 1 : -1, h: 0,
                state: this.r() < 0.6 ? 'walk' : 'graze', timer: 2 + this.r() * 8
            };
            herd.s = this.r() * herd.len;
            for (let k = 0; k < n; k++) {
                this.ternak.push({
                    kind, herd, run, k, off: TERNAK[kind].off + (k % 2) * 0.9,
                    h: 0, scale: 0.9 + this.r() * 0.2
                });
            }
        });
    }

    updateTernak(dt, t) {
        const B = this.bTernak;
        if (!B) return;
        // satu fase jalan untuk semua ternak (semua instance berbagi geometri frame yang sama)
        B.im.geometry = this.ternakFrames[Math.floor(t / 0.9 * WALK_FRAMES) % WALK_FRAMES];
        B.begin(this.cam);
        const herds = new Set(this.ternak.map(a => a.herd));
        for (const h of herds) {
            h.timer -= dt;
            if (h.timer <= 0) {
                h.state = h.state === 'walk' ? 'graze' : 'walk';
                h.timer = h.state === 'walk' ? 5 + Math.random() * 7 : 4 + Math.random() * 8;
            }
        }
        for (const h of herds) h.moved = false;
        for (const a of this.ternak) {
            const T = TERNAK[a.kind], h = a.herd;
            if (h.state === 'walk' && !h.moved) {
                h.moved = true;
                h.s += h.dir * T.speed * dt;
                if (h.s > h.len) { h.s = h.len; h.dir = -1; }
                if (h.s < 0) { h.s = 0; h.dir = 1; }
            }
            const z = a.run.z0 + h.s + a.k * T.gap;
            const x = streamX(z) + a.run.side * a.off;
            a.h = angLerp(a.h, Math.atan2(streamSlope(z) * h.dir, h.dir), Math.min(1, dt * 1.2));
            // Ternak Polyfork menghadap +Z (kepala di +Z, beda dengan karakter yang -Z).
            // Merumput = diam di frame 0 tanpa memiringkan badan (miring = kaki depan amblas ke tanah).
            B.part = this.ternakPart[a.kind] + (h.state === 'walk' ? 0 : 1);
            B.put(x, 0.03 + LIFT, z, a.h, 0, 0, T.scale * a.scale);
        }
        B.end();
    }

    /** Ayam: cari area pekarangan kosong lewat raycast ke mesh bangunan itu sendiri. */
    planChickens(houses) {
        const T = GRID_CONFIG.TILE_SIZE;
        const SY = GRID_CONFIG.SURFACE_Y;
        const TYPES = new Set(['rumah', 'rumah_limas', 'warung', 'toko', 'sawah', 'taman', 'ibadah', 'pasar']);
        const ray = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        const o = new THREE.Vector3();
        for (const h of houses) {
            const d = h.data;
            if (!d || d.worldX <= GRID_CONFIG.RIVER_MAX_X || !TYPES.has(d.type) || !h.mesh) continue;
            h.mesh.updateMatrixWorld(true);
            // Hanya Mesh (papan nama Sprite butuh kamera untuk raycast)
            const solids = [];
            h.mesh.traverse(o => { if (o.isMesh && !o.isSprite && o.geometry) solids.push(o); });
            const hw = (d.width || 1) * T / 2 - 0.9, hd = (d.height || 1) * T / 2 - 0.9;
            const step = 1;
            const nx = Math.floor((2 * hw) / step) + 1, nz = Math.floor((2 * hd) / step) + 1;
            const free = [];
            for (let a = 0; a < nx; a++) {
                const row = [];
                for (let b = 0; b < nz; b++) {
                    const x = d.worldX - hw + a * step, z = d.worldZ - hd + b * step;
                    o.set(x, 40, z);
                    ray.set(o, down);
                    ray.far = 60;
                    const hit = ray.intersectObjects(solids, false)[0];
                    const y = hit ? hit.point.y : SY;
                    row.push(y <= SY + 0.14 ? Math.max(y, SY) : null);
                }
                free.push(row);
            }
            // Blok 3x3 bebas -> tempat kawanan; maksimal 2 per kavling, saling berjauhan
            const spots = [];
            for (let a = 1; a < nx - 1; a++) {
                for (let b = 1; b < nz - 1; b++) {
                    let ok = true, yMax = -Infinity;
                    for (let da = -1; da <= 1 && ok; da++) for (let db = -1; db <= 1; db++) {
                        const y = free[a + da][b + db];
                        if (y === null) { ok = false; break; }
                        yMax = Math.max(yMax, y);
                    }
                    if (ok) spots.push({ x: d.worldX - hw + a * step, z: d.worldZ - hd + b * step, y: yMax });
                }
            }
            const take = [];
            spots.sort(() => this.r() - 0.5);
            for (const s of spots) {
                if (take.length >= (d.width >= 2 ? 3 : 2)) break;
                if (take.some(t => Math.hypot(t.x - s.x, t.z - s.z) < 3.5)) continue;
                take.push(s);
            }
            for (const s of take) {
                const hen = {
                    home: s, x: s.x, z: s.z, y: s.y + LIFT, h: this.r() * 6.28, tx: s.x, tz: s.z, speed: 0.35,
                    scale: 1, state: 'idle', timer: this.r() * 2, peck: 0, color: HEN_COLORS[Math.floor(this.r() * HEN_COLORS.length)], hen: null
                };
                this.chickens.push(hen);
                const chicks = this.r() < 0.85 ? 3 + Math.floor(this.r() * 3) : 0;
                for (let i = 0; i < chicks; i++) {
                    this.chickens.push({
                        home: s, x: s.x + (this.r() - 0.5), z: s.z + (this.r() - 0.5), y: s.y + LIFT, h: this.r() * 6.28,
                        tx: s.x, tz: s.z, speed: 0.5, scale: 0.45, state: 'idle', timer: this.r(), peck: 0, color: 0xF3D24C, hen
                    });
                }
            }
        }
    }

    // ----------------------------------------------------------- per frame
    /** @param camPos posisi kamera dunia (untuk LOD jarak ke satwa terdekat) */
    update(dt, camPos = null) {
        this.time += dt;
        const t = this.time;
        this.cam = camPos;
        // Semua satwa tetap disimulasikan (±300 instance, murah) agar jarak LOD selalu segar
        this.updateDucks(dt, t);
        this.updateEgrets(dt, t);
        this.updateChickens(dt, t);
        this.updateKerbau(dt, t);
        this.updateTernak(dt, t);
    }

    updateDucks(dt, t) {
        const B = this.bDuck;
        B.begin(this.cam);
        for (const f of this.duckFlocks) {
            if (f.kind === 'dike' || f.kind === 'stream') {
                // Kecepatan bergelombang: kawanan sesekali melambat hampir berhenti
                f.u += dt * f.speed * (0.55 + 0.45 * Math.sin(t * 0.21 + f.first));
            }
        }
        for (const d of this.ducks) {
            const f = d.flock;
            const step = t * 7 + d.phase;
            if (f.kind === 'dike') {
                const [s, dir] = pingpong(f.u - d.i * 0.75, f.L);
                const y = f.run.top + 0.22 + LIFT + Math.abs(Math.sin(step)) * 0.02;
                B.put(f.run.x0 + s, y, f.run.z, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0, Math.sin(step) * 0.14);
            } else if (f.kind === 'stream') {
                const [s, dir] = pingpong(f.u - d.i * 1.1, f.L);
                const z = f.z0 + s;
                const x = streamX(z) + d.lat + Math.sin(t * 0.7 + d.phase) * 0.3;
                const h = Math.atan2(streamSlope(z) * dir, dir);
                B.put(x, STREAM_Y + LIFT + Math.sin(t * 2 + d.phase) * 0.01, z, h, Math.sin(t * 1.6 + d.phase) * 0.04);
            } else {
                const c = f.cell;
                d.turn += (Math.random() - 0.5) * dt * 2.5;
                d.turn *= 0.98;
                d.h += d.turn * dt;
                const v = 0.22 + 0.12 * Math.sin(t * 0.5 + d.phase);
                d.x += Math.sin(d.h) * v * dt;
                d.z += Math.cos(d.h) * v * dt;
                const mx = CW / 2 - 1.1, mz = CD / 2 - 1.1;
                if (Math.abs(d.x - c.cx) > mx || Math.abs(d.z - c.cz) > mz) {
                    d.x = Math.max(c.cx - mx, Math.min(c.cx + mx, d.x));
                    d.z = Math.max(c.cz - mz, Math.min(c.cz + mz, d.z));
                    d.h = Math.atan2(c.cx - d.x, c.cz - d.z) + (Math.random() - 0.5);
                }
                // Sesekali "dabbling": kepala masuk air (pitch maju), tetap di atas permukaan
                const dab = Math.max(0, Math.sin(t * 0.9 + d.phase * 3) - 0.85) * 4;
                B.put(d.x, c.top + 0.02 + LIFT, d.z, d.h, dab * 0.5, 0, 1, 1, 1, 0);
            }
        }
        B.end();
    }

    updateEgrets(dt, t) {
        const B = this.bEgret, W = this.bWing;
        B.begin(this.cam);
        W.begin(this.cam);
        for (const e of this.egrets) {
            e.timer -= dt;
            if (e.timer <= 0) {
                const k = Math.random();
                if (k < 0.45) { e.peck = 1.2; e.timer = 1.4 + Math.random() * 3; }
                else if (k < 0.75) { e.walk = 2 + Math.random() * 3; e.hT = e.h + (Math.random() - 0.5) * 2; e.timer = e.walk + 1; }
                else { e.hT = e.h + (Math.random() - 0.5) * 3; e.timer = 2 + Math.random() * 4; }
            }
            e.h = angLerp(e.h, e.hT, Math.min(1, dt * 1.5));
            if (e.walk > 0) {
                e.walk -= dt;
                const nx = e.x + Math.sin(e.h) * 0.25 * dt, nz = e.z + Math.cos(e.h) * 0.25 * dt;
                const c = e.cell;
                if (Math.abs(nx - c.cx) < CW / 2 - 1.2 && Math.abs(nz - c.cz) < CD / 2 - 1.2) { e.x = nx; e.z = nz; }
                else { e.hT = Math.atan2(c.cx - e.x, c.cz - e.z); }
            }
            let pitch = 0;
            if (e.peck > 0) {
                e.peck -= dt;
                pitch = Math.sin(Math.min(1, (1.2 - e.peck) / 1.2) * Math.PI) * 0.75;
            }
            const stepBob = e.walk > 0 ? Math.abs(Math.sin(t * 5)) * 0.015 : 0;
            B.put(e.x, e.cell.top + 0.02 + LIFT + stepBob, e.z, e.h, pitch);
        }
        const m = this.mWing, q = new THREE.Quaternion(), qw = new THREE.Quaternion();
        const eu = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
        for (const f of this.egretFlocks) {
            f.a += dt * f.w;
            const ca = Math.cos(f.a), sa = Math.sin(f.a);
            const lx = f.cx + ca * f.rx, lz = f.cz + sa * f.rz;
            // Arah terbang = turunan elips
            const vx = -sa * f.rx * Math.sign(f.w), vz = ca * f.rz * Math.sign(f.w);
            const head = Math.atan2(vx, vz);
            const fx = Math.sin(head), fz = Math.cos(head);
            for (let i = 0; i < f.n; i++) {
                // Formasi V: pemimpin di depan, sisanya bergantian kiri/kanan ke belakang
                const rank = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? 1 : -1);
                const back = rank * 2.1, lat = side * rank * 1.7;
                const x = lx - fx * back + fz * lat;
                const z = lz - fz * back - fx * lat;
                const y = f.alt + Math.sin(t * 0.6 + i) * 0.6 - rank * 0.25;
                const cycle = (t + f.phase + i * 0.37) % 7;
                const flap = cycle < 4.5 ? Math.sin((t + i * 0.21) * 2 * Math.PI * 2.2) * 0.65 : 0.12 + Math.sin(t * 3 + i) * 0.04;
                const bodyBob = cycle < 4.5 ? -flap * 0.05 : 0;
                B.put(x, y + bodyBob, z, head, 0.8, side * 0.05, 1, 1, 1, EGRET_PIVOT_Y);
                // Sayap: pangkal di bahu, berputar pada sumbu badan
                for (const sgn of [1, -1]) {
                    eu.set(0, head, 0, 'YXZ');
                    q.setFromEuler(eu);
                    eu.set(0, 0, sgn * flap, 'YXZ');
                    qw.setFromEuler(eu);
                    qw.premultiply(q);
                    v.set(sgn * 0.1, 0.06, 0.08).multiplyScalar(1.1).applyQuaternion(q);
                    sc.set(sgn, 1, 1);
                    m.compose(new THREE.Vector3(x + v.x, y + bodyBob + v.y, z + v.z), qw, sc);
                    W.putMatrix(m, x, y, z);
                }
            }
        }
        B.end();
        W.end();
    }

    updateChickens(dt, t) {
        const B = this.bChicken;
        const R = 1.0;
        B.begin(this.cam);
        for (const c of this.chickens) {
            c.timer -= dt;
            if (c.timer <= 0) {
                const k = Math.random();
                if (k < 0.45) { c.state = 'peck'; c.timer = 1 + Math.random() * 2; }
                else if (k < 0.85) {
                    c.state = 'walk'; c.timer = 3;
                    const cx = c.hen ? c.hen.x : c.home.x, cz = c.hen ? c.hen.z : c.home.z;
                    const a = Math.random() * 6.28, rr = Math.random() * (c.hen ? 0.5 : R);
                    let tx = cx + Math.cos(a) * rr, tz = cz + Math.sin(a) * rr;
                    const dx = tx - c.home.x, dz = tz - c.home.z, dd = Math.hypot(dx, dz);
                    if (dd > R) { tx = c.home.x + dx / dd * R; tz = c.home.z + dz / dd * R; }
                    c.tx = tx; c.tz = tz;
                } else { c.state = 'idle'; c.timer = 0.5 + Math.random() * 1.5; }
            }
            let pitch = 0, bob = 0;
            if (c.state === 'walk') {
                const dx = c.tx - c.x, dz = c.tz - c.z, dd = Math.hypot(dx, dz);
                if (dd < 0.05) { c.state = 'idle'; c.timer = 0.3 + Math.random(); }
                else {
                    c.h = angLerp(c.h, Math.atan2(dx, dz), Math.min(1, dt * 8));
                    const s = Math.min(dd, c.speed * dt);
                    c.x += dx / dd * s; c.z += dz / dd * s;
                    bob = Math.abs(Math.sin(t * 14 + c.timer)) * 0.015 * c.scale;
                    pitch = Math.sin(t * 14) * 0.08;
                }
            } else if (c.state === 'peck') {
                pitch = 0.35 + Math.max(0, Math.sin(t * 9 + c.home.x)) * 0.45;
            }
            B.put(c.x, c.y + bob, c.z, c.h, pitch, 0, c.scale);
        }
        B.end();
    }

    updateKerbau(dt, t) {
        const K = this.bKerbau;
        K.begin(this.cam);
        const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
        for (const k of this.kerbau) {
            k.timer -= dt;
            if (k.timer <= 0) {
                k.state = k.state === 'walk' ? 'graze' : 'walk';
                k.timer = k.state === 'walk' ? 6 + Math.random() * 8 : 5 + Math.random() * 9;
            }
            const L = k.run.z1 - k.run.z0;
            const walking = k.state === 'walk';
            if (walking) {
                k.s += k.dir * 0.42 * dt;
                if (k.s > L) { k.s = L; k.dir = -1; }
                if (k.s < 0) { k.s = 0; k.dir = 1; }
                k.leg += dt * 4.2;
            }
            const z = k.run.z0 + k.s;
            const x = streamX(z) + k.run.side * k.off;
            k.h = angLerp(k.h, Math.atan2(streamSlope(z) * k.dir, k.dir), Math.min(1, dt * 1.2));
            k.head += ((walking ? 0.2 : 1.05) - k.head) * Math.min(1, dt * 1.5);
            const sc = k.scale;
            const y0 = 0.03 + LIFT;
            const bob = walking ? Math.abs(Math.sin(k.leg)) * 0.025 : 0;
            K.part = 0;
            K.put(x, y0 + bob, z, k.h, 0, 0, sc);
            e.set(0, k.h, 0, 'YXZ');
            q.setFromEuler(e);
            const nod = walking ? Math.sin(k.leg * 2) * 0.06 : Math.sin(t * 2.3 + k.run.z0) * 0.08;
            v.set(KERBAU_NECK[0], KERBAU_NECK[1], KERBAU_NECK[2]).multiplyScalar(sc).applyQuaternion(q);
            K.part = 1;
            K.put(x + v.x, y0 + bob + v.y, z + v.z, k.h, k.head + nod, 0, sc);
            K.part = 2;
            KERBAU_HIPS.forEach(([hx, hy, hz], i) => {
                const pair = (i === 0 || i === 3) ? 0 : Math.PI;
                const swing = walking ? Math.sin(k.leg + pair) * 0.32 : 0;
                v.set(hx, hy, hz).multiplyScalar(sc).applyQuaternion(q);
                K.put(x + v.x, y0 + bob + v.y, z + v.z, k.h, swing, 0, sc);
            });
        }
        K.end();
    }
}
