/**
 * AUDIRA-LAND: Taman Budaya Nusantara AUDIRA (kawasan wisata Desa Have, sisi barat)
 *
 * Kawasan taman ORIGINAL di LUAR peta aktif (kota Have berakhir di X = -288 m), jadi tidak
 * menutup kavling apa pun. Pintu masuk = ujung barat jalan kolektor z = -28 (gerbang di X = -302).
 *
 * Isi:
 *  - Taman budaya: danau elips dengan pulau-pulau miniatur kepulauan Indonesia, 6 paviliun rumah adat
 *    low-poly (Rumah Gadang, Tongkonan, Honai, Joglo, Rumah Panjang, Baileo) mengelilingi danau,
 *    gerbang utama bertingkat, jalan setapak, taman bunga, menara pandang.
 *  - Taman bermain: bianglala & komidi putar (berputar), ayunan, perosotan, jungkat-jungkit,
 *    kereta wisata mini yang mengelilingi kawasan, kereta gantung melintasi danau.
 *  - Pengunjung: keluarga berjalan-jalan (InstancedMesh, pola mirip Pedestrians tapi berdiri sendiri).
 *  - Malam: lampu taman, papan nama, lampu bianglala & komidi putar menyala (berkedip berganti warna).
 *
 * Draw call: semua mesh statis dilebur bakeStatic (tanpa chunk). Bagian bergerak = beberapa
 * InstancedMesh/Group terpisah (±20 draw call). Zero-Submerging: semua objek berdiri di atas
 * lantai taman (y = S), lantai paviliun, atau dasar danau (pilar kereta gantung di pulau).
 *
 * API: new ThemePark(scene) -> .update(dt), .setNight(isNight), .attachCameraPreset(cityCamera)
 */

import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { makeWaterMaterial } from '../core/water.js';
import { PALETTE } from '../core/constants.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

// ---------------------------------------------------------------------------
// Tata letak (meter, dunia)
// ---------------------------------------------------------------------------
const S = 0.08;                                    // puncak lantai rumput taman
const PARK = { x0: -472, x1: -296, z0: -174, z1: 160 };
const AXIS_Z = -28;                                // jalan kolektor kota yang berakhir di tepi barat
const GATE_X = -302;
const LAKE = { x: -390, z: -20, rx: 38, rz: 55 };
const WATER_Y = 0.14;
const RING = { rx: LAKE.rx + 7, rz: LAKE.rz + 7 }; // jalan setapak keliling danau
const PAV = { rx: LAKE.rx + 18, rz: LAKE.rz + 18 }; // lingkar paviliun
const TRACK = { x0: -462, x1: -308, z0: -166, z1: 152, r: 16 };   // rel kereta mini
const PROM = { x0: -455, x1: -316, z0: -158, z1: 146, r: 12 };    // promenade keliling
const FERRIS = { x: -342, z: 106, hub: 19, R: 16 };
const CAROUSEL = { x: -372, z: 104 };
const CABLE = { x: -383, zS: -97, zN: 57, zP: -17, hStation: 14, hPylon: 16.5 };
const TOWER = { x: -448, z: -128 };

function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
}

const glowTex = () => canvasTex(64, 64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,225,160,0.7)');
    r.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
});

/** Lebur beberapa geometri (posisi + warna per bagian) jadi satu geometri ber-vertex-color. */
const _mm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
function mergeParts(parts) {
    const pos = [], nor = [], col = [];
    const c = new THREE.Color();
    for (const p of parts) {
        const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
        _mm.compose(_p.set(p.x || 0, p.y || 0, p.z || 0),
            _q.setFromEuler(_e.set(p.rx || 0, p.ry || 0, p.rz || 0)),
            _s.set(p.sx || 1, p.sy || 1, p.sz || 1));
        g.applyMatrix4(_mm);
        c.copy(lin(p.c));
        const pa = g.attributes.position, na = g.attributes.normal;
        for (let i = 0; i < pa.count; i++) {
            pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
            nor.push(na.getX(i), na.getY(i), na.getZ(i));
            col.push(c.r, c.g, c.b);
        }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
}

/** Jalur tertutup dengan parameter panjang busur: sample(s) -> {x, z, dx, dz}. */
class Loop {
    constructor(pts) {
        this.pts = pts;
        this.cum = [0];
        for (let i = 1; i <= pts.length; i++) {
            const a = pts[i - 1], b = pts[i % pts.length];
            this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
        }
        this.length = this.cum[pts.length];
    }
    sample(s, out = {}) {
        const L = this.length;
        s = ((s % L) + L) % L;
        let lo = 0, hi = this.pts.length;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
        const a = this.pts[lo], b = this.pts[(lo + 1) % this.pts.length];
        const seg = this.cum[lo + 1] - this.cum[lo] || 1;
        const t = (s - this.cum[lo]) / seg;
        out.x = a.x + (b.x - a.x) * t;
        out.z = a.z + (b.z - a.z) * t;
        out.dx = (b.x - a.x) / seg;
        out.dz = (b.z - a.z) / seg;
        return out;
    }
}

/** Atap perisai 4 sisi (persegi panjang): diputar 45 derajat di geometri, lalu diskalakan. */
function hipGeo(rTop, rBot, h, sx, sz) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, 4);
    g.rotateY(Math.PI / 4);
    g.scale(sx, 1, sz);
    return g;
}

function ellipsePts(cx, cz, rx, rz, n) {
    const pts = [];
    for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        pts.push({ x: cx + rx * Math.cos(a), z: cz + rz * Math.sin(a) });
    }
    return pts;
}

function roundRectPts(r) {
    const pts = [];
    const corners = [
        { cx: r.x1 - r.r, cz: r.z1 - r.r, a0: 0 },
        { cx: r.x0 + r.r, cz: r.z1 - r.r, a0: Math.PI / 2 },
        { cx: r.x0 + r.r, cz: r.z0 + r.r, a0: Math.PI },
        { cx: r.x1 - r.r, cz: r.z0 + r.r, a0: Math.PI * 1.5 }
    ];
    for (const c of corners) {
        for (let k = 0; k <= 8; k++) {
            const a = c.a0 + (k / 8) * Math.PI / 2;
            pts.push({ x: c.cx + r.r * Math.cos(a), z: c.cz + r.r * Math.sin(a) });
        }
    }
    // Sisipkan titik antara agar sampling lurus tetap halus
    const dense = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
        for (let k = 0; k < n; k++) dense.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
    }
    return dense;
}

// Nama papan (atlas satu tekstur -> satu draw call)
const SIGN_ROWS = [
    ['RUMAH GADANG', 'Sumatera Barat'],
    ['TONGKONAN', 'Sulawesi Selatan'],
    ['HONAI', 'Papua Pegunungan'],
    ['JOGLO', 'Jawa Tengah'],
    ['RUMAH PANJANG', 'Kalimantan Barat'],
    ['BAILEO', 'Maluku']
];

export class ThemePark {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'theme_park';
        this.staticGroup = new THREE.Group();
        this.staticGroup.name = 'theme_park_static';
        this.time = 0;
        this.isNight = false;
        this.r = rng(0x7A3A11);

        const M = this.M = {};
        const L = (hex) => new THREE.MeshLambertMaterial({ color: lin(hex) });
        Object.assign(M, {
            lawn: L(0x6EA548), lawnDark: L(0x5A8E3C), hedge: L(0x3F6E34),
            pave: L(0xD9C8A4), paveDark: L(0xB79E78), stone: L(0xCFC2A6), stoneDark: L(0x9A8B72),
            asphalt: L(0x45474D), white: L(0xF2EEE6), terracotta: L(0xA9452F), brick: L(0x8E3B28),
            gold: L(0xD9A527), wood: L(0x7A4E2C), woodDark: L(0x4E3220), woodLight: L(0xA9784A),
            thatch: L(0xA88B4F), thatchDark: L(0x6B5534), ijuk: L(0x2B2622), red: L(0xB8312A),
            black: L(0x1F1C1A), cream: L(0xEADCC0), steel: L(0x8D96A0), steelDark: L(0x4C545E),
            sand: L(0xE3CF9A), rubber: L(0xE4BE86), rubberBlue: L(0x3E7CB8), blue: L(0x2F6FB5),
            yellow: L(0xF2C230), green: L(0x3E8E4B), trunk: L(0x5E4630), leaf: L(0x4F8A3A),
            leafLight: L(0x77AE4A), palm: L(0x5C8A3E), rock: L(0x8C877C), snow: L(0xF4F6F8),
            soil: L(0x6B4A30), ground: new THREE.MeshLambertMaterial({ color: PALETTE.GROUND_BASE })
        });
        // Lampu (warna diubah siang/malam -> tidak dilebur ke material bersama)
        M.lamp = new THREE.MeshBasicMaterial({ color: lin(0xC9C2B4) });
        M.aviation = new THREE.MeshBasicMaterial({ color: lin(0x7A2A26) });
        M.bulbA = new THREE.MeshBasicMaterial({ color: lin(0xE8DCC8) });
        M.bulbB = new THREE.MeshBasicMaterial({ color: lin(0xE8DCC8) });
        [M.lamp, M.aviation, M.bulbA, M.bulbB].forEach(protectMaterial);
        M.water = makeWaterMaterial({ color: 0x3C93B8, repeatU: 6, repeatV: 9, flow: 0.004, drift: 0.006 });
        M.sign = new THREE.MeshBasicMaterial({ map: this.makeSignTexture() });

        this.lampHeads = [];   // posisi cahaya (Points saat malam)

        this.buildGround();
        this.buildGate();
        this.buildPaths();
        this.buildLake();
        this.buildPavilions();
        this.buildFlowerGardens();
        this.buildPlaygroundStatic();
        this.buildTrack();
        this.buildCableCarStatic();
        this.buildTower();
        this.buildTrees();
        this.buildLamps();

        // Tanpa chunk: kawasan ini selalu dilihat utuh dari kejauhan -> satu batch per material (paling hemat)
        const baked = bakeStatic(this.staticGroup, { chunkSize: 0 });
        this.staticGroup.add(baked);
        this.root.add(this.staticGroup);

        // ---- Bagian bergerak ----
        // Dua material: three r128 tidak mengganti program saat InstancedMesh tanpa instanceColor
        // berbagi material dengan yang punya -> semua InstancedMesh di sini WAJIB setColorAt.
        this.vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.vcMatSolo = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.buildFerrisWheel();
        this.buildCarousel();
        this.buildPlaygroundMoving();
        this.buildTrain();
        this.buildCableCabins();
        this.buildVisitors();
        this.buildGlow();
        this.setupCulling();

        scene.add(this.root);
        this.update(0);
    }

    // =====================================================================
    // Helper pembuat mesh statis
    // =====================================================================
    add(geo, mat, x, y, z, o = {}, parent = this.staticGroup) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
        if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
        m.castShadow = o.cast === true;
        m.receiveShadow = true;
        parent.add(m);
        return m;
    }
    box(w, h, d, mat, x, y, z, o, parent) {
        return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o, parent);
    }
    /** Kotak berdiri: dasar tepat di y0. */
    block(w, h, d, mat, x, y0, z, o = {}, parent) {
        return this.box(w, h, d, mat, x, y0 + h / 2, z, o, parent);
    }
    cyl(rt, rb, h, seg, mat, x, y0, z, o = {}, parent) {
        return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y0 + h / 2, z, o, parent);
    }
    /** Segmen datar di tanah dari (x0,z0) ke (x1,z1). */
    strip(x0, z0, x1, z1, w, h, y0, mat, extra = 0.2, parent) {
        const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
        return this.box(len + extra, h, w, mat, (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2,
            { ry: Math.atan2(-dz, dx) }, parent);
    }
    /** Balok 3D antara dua titik. */
    beam(a, b, t, mat, parent, cast = true) {
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const len = dir.length();
        const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), mat);
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        m.castShadow = cast;
        m.receiveShadow = true;
        (parent || this.staticGroup).add(m);
        return m;
    }

    makeSignTexture() {
        // Baris 0 (tinggi 128): nama taman. Baris 1..6 (tinggi 64): papan paviliun.
        return canvasTex(1024, 512, (g, w) => {
            g.fillStyle = '#5A2316';
            g.fillRect(0, 0, w, 128);
            g.strokeStyle = '#E8B33A'; g.lineWidth = 8;
            g.strokeRect(6, 6, w - 12, 116);
            g.fillStyle = '#F6D77A';
            g.font = 'bold 54px Georgia, serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('TAMAN BUDAYA NUSANTARA', w / 2, 52);
            g.font = 'bold 30px Georgia, serif';
            g.fillStyle = '#FFFFFF';
            g.fillText('— AUDIRA —', w / 2, 100);
            SIGN_ROWS.forEach(([name, region], k) => {
                const y0 = 128 + k * 64;
                g.fillStyle = k % 2 ? '#3E2A1C' : '#4A3220';
                g.fillRect(0, y0, w, 64);
                g.strokeStyle = '#D9A527'; g.lineWidth = 4;
                g.strokeRect(4, y0 + 4, w - 8, 56);
                g.fillStyle = '#FBE7B0';
                g.font = 'bold 34px Georgia, serif';
                g.fillText(`${name}  ·  ${region}`, w / 2, y0 + 33);
            });
        });
    }

    /** Bidang papan nama yang memakai satu baris atlas. row -1 = nama taman. */
    signPlane(w, h, row) {
        const g = new THREE.PlaneGeometry(w, h);
        const v0 = row < 0 ? 1 - 128 / 512 : 1 - (128 + (row + 1) * 64) / 512;
        const v1 = row < 0 ? 1 : 1 - (128 + row * 64) / 512;
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
        return g;
    }

    // =====================================================================
    // Tanah, pagar, jalan masuk
    // =====================================================================
    buildGround() {
        const M = this.M;
        // Tanah dasar di luar peta (tanah kota berhenti di X ≈ -408): sedikit di bawah 0 agar tak z-fighting
        const g = new THREE.PlaneGeometry(300, 700);
        g.rotateX(-Math.PI / 2);
        this.add(g, M.ground, -440, -0.05, 0);

        // Lantai rumput taman (slab, puncak y = S)
        const w = PARK.x1 - PARK.x0, d = PARK.z1 - PARK.z0;
        this.block(w, 0.16, d, M.lawn, (PARK.x0 + PARK.x1) / 2, S - 0.16, (PARK.z0 + PARK.z1) / 2);

        // Pagar tanaman keliling, celah di gerbang
        const hh = 1.1, ht = 1.2;
        const gap0 = AXIS_Z - 9, gap1 = AXIS_Z + 9;
        this.block(ht, hh, gap0 - PARK.z0, M.hedge, PARK.x1 - 0.6, S, (PARK.z0 + gap0) / 2);
        this.block(ht, hh, PARK.z1 - gap1, M.hedge, PARK.x1 - 0.6, S, (PARK.z1 + gap1) / 2);
        this.block(ht, hh, d, M.hedge, PARK.x0 + 0.6, S, (PARK.z0 + PARK.z1) / 2);
        this.block(w, hh, ht, M.hedge, (PARK.x0 + PARK.x1) / 2, S, PARK.z0 + 0.6);
        this.block(w, hh, ht, M.hedge, (PARK.x0 + PARK.x1) / 2, S, PARK.z1 - 0.6);

        // Jalan masuk dari ujung barat jalan kolektor kota (X -288) ke gerbang
        this.block(18, 0.1, 5.2, M.asphalt, -295, 0, AXIS_Z);
        for (const s of [-1, 1]) {
            this.block(18, 0.16, 1.4, M.pave, -295, 0, AXIS_Z + s * 3.3);
        }
        for (let x = -289; x > -302; x -= 3) this.block(1.4, 0.01, 0.14, M.white, x, 0.1, AXIS_Z);

        // Bukit hijau di cakrawala barat (dilihat dari jauh -> kabut)
        const r = this.r;
        for (let k = 0; k < 9; k++) {
            const hz = -320 + k * 80 + (r() - 0.5) * 30;
            const rad = 50 + r() * 40;
            const geo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
            this.add(geo, k % 2 ? M.leaf : M.lawnDark, -560 - r() * 50, -0.05, hz, { s: [rad, 14 + r() * 16, rad * 0.8] });
        }
    }

    // =====================================================================
    // Gerbang utama (gapura bertingkat terakota + emas)
    // =====================================================================
    buildGate() {
        const M = this.M;
        const x = GATE_X;
        for (const s of [-1, 1]) {
            const z = AXIS_Z + s * 7.5;
            this.block(5, 1.2, 5, M.stoneDark, x, S, z, { cast: true });
            let y = S + 1.2;
            const tiers = [[4.2, 3.2], [3.6, 2.2], [3.0, 1.8], [2.4, 1.5], [1.8, 1.2], [1.2, 1.0]];
            tiers.forEach(([wd, h], k) => {
                this.block(wd, h, wd, k % 2 ? M.brick : M.terracotta, x, y, z, { cast: true });
                this.block(wd + 0.3, 0.18, wd + 0.3, M.gold, x, y + h - 0.09, z);
                y += h;
            });
            this.cyl(0, 0.5, 1.6, 8, M.gold, x, y, z, { cast: true });
            this.lampHeads.push([x, y + 0.6, z]);
            // Sayap dinding
            this.block(1.0, 1.6, 9, M.terracotta, x, S, z + s * 7.5);
            this.block(1.2, 0.2, 9, M.gold, x, S + 1.6, z + s * 7.5);
            // Umbul-umbul merah putih
            for (const dz of [10.5, 14.5]) {
                const fz = AXIS_Z + s * dz;
                this.cyl(0.07, 0.07, 7, 6, M.white, x + 2, S, fz);
                this.block(0.05, 1.4, 0.7, M.red, x + 2, S + 5.4, fz + 0.4);
                this.block(0.05, 1.4, 0.7, M.white, x + 2, S + 4.0, fz + 0.4);
            }
        }
        // Balok mahkota penghubung + papan nama (atlas baris nama taman)
        this.block(1.6, 1.8, 13, M.brick, x, 8.6, AXIS_Z, { cast: true });
        this.block(1.9, 0.3, 13.4, M.gold, x, 10.4, AXIS_Z);
        this.cyl(0, 1.0, 2.0, 4, M.gold, x, 10.7, AXIS_Z, { ry: Math.PI / 4, cast: true });
        const front = this.add(this.signPlane(11.6, 1.45, -1), M.sign, x + 0.81, 9.5, AXIS_Z, { ry: Math.PI / 2 });
        const back = this.add(this.signPlane(11.6, 1.45, -1), M.sign, x - 0.81, 9.5, AXIS_Z, { ry: -Math.PI / 2 });
        front.receiveShadow = back.receiveShadow = false;

        // Plaza + air mancur setelah gerbang
        const pcx = -322;
        this.add(new THREE.CylinderGeometry(12, 12, 0.05, 32), M.pave, pcx, S + 0.025, AXIS_Z);
        this.add(new THREE.CylinderGeometry(9, 9, 0.06, 32), M.paveDark, pcx, S + 0.03, AXIS_Z);
        this.cyl(4, 4.2, 0.6, 20, M.stone, pcx, S, AXIS_Z, { cast: true });
        this.add(new THREE.CylinderGeometry(3.7, 3.7, 0.05, 20), M.water, pcx, S + 0.56, AXIS_Z);
        this.cyl(0.9, 1.1, 1.6, 10, M.stone, pcx, S + 0.6, AXIS_Z, { cast: true });
        this.cyl(1.4, 0.4, 0.4, 10, M.gold, pcx, S + 2.2, AXIS_Z);
        this.cyl(0.3, 0.5, 0.9, 8, M.stone, pcx, S + 2.6, AXIS_Z);
    }

    // =====================================================================
    // Jalan setapak
    // =====================================================================
    buildPaths() {
        const M = this.M;
        const h = 0.04;
        // Sumbu utama gerbang -> danau
        this.strip(-300, AXIS_Z, -346, AXIS_Z, 5, h, S, M.pave);
        // Lingkar danau
        const ring = ellipsePts(LAKE.x, LAKE.z, RING.rx, RING.rz, 96);
        ring.forEach((a, k) => { const b = ring[(k + 1) % ring.length]; this.strip(a.x, a.z, b.x, b.z, 3.4, h, S, M.pave, 0.6); });
        // Promenade keliling
        const prom = roundRectPts(PROM);
        prom.forEach((a, k) => { const b = prom[(k + 1) % prom.length]; this.strip(a.x, a.z, b.x, b.z, 3.0, h, S, M.pave, 0.6); });
        // Sumbu utara & selatan (stasiun kereta gantung, taman bermain, taman bunga), barat
        this.strip(LAKE.x, LAKE.z + RING.rz, LAKE.x, PROM.z1, 3.6, h, S, M.pave);
        this.strip(LAKE.x, LAKE.z - RING.rz, LAKE.x, PROM.z0, 3.6, h, S, M.pave);
        this.strip(LAKE.x - RING.rx, LAKE.z, PROM.x0, LAKE.z, 3.0, h, S, M.pave);
        // Lantai taman bermain (paving pasir hangat, empuk)
        this.block(124, 0.05, 64, M.rubber, -390, S, 108);
    }

    // =====================================================================
    // Danau + pulau miniatur kepulauan Indonesia
    // =====================================================================
    buildLake() {
        const M = this.M;
        const geo = new THREE.CircleGeometry(1, 72);
        geo.rotateX(-Math.PI / 2);
        this.add(geo, M.water, LAKE.x, WATER_Y, LAKE.z, { s: [LAKE.rx + 0.6, 1, LAKE.rz + 0.6] });

        // Tepi batu
        const rim = ellipsePts(LAKE.x, LAKE.z, LAKE.rx + 0.6, LAKE.rz + 0.6, 120);
        rim.forEach((a, k) => {
            const b = rim[(k + 1) % rim.length];
            this.strip(a.x, a.z, b.x, b.z, 1.4, 0.32, S, k % 3 ? M.stone : M.stoneDark, 0.3);
        });

        // Garis pulau: (v, u) meter; u -> sumbu z danau (barat -> timur Nusantara), v -> sumbu x.
        const ISL = [
            { n: 'sumatra', p: [[10, -48], [14, -44], [4, -30], [-6, -22], [-10, -19], [-11, -23], [-4, -32], [6, -45]], peaks: [[8, -42, 2.4], [2, -34, 2.0], [-5, -26, 1.8]] },
            { n: 'jawa', p: [[-12, -18], [-14, -6], [-16, 4], [-18, 4], [-17, -8], [-15, -19]], peaks: [[-15, -12, 1.5], [-16, -4, 1.7], [-17, 2, 1.4]] },
            { n: 'bali', p: [[-17, 6], [-17, 9], [-19, 9], [-19, 6]], peaks: [[-18, 7.5, 1.0]] },
            { n: 'nusa', p: [[-18, 11], [-18, 19], [-20, 19], [-20, 11]], peaks: [] },
            { n: 'kalimantan', p: [[10, -12], [16, -6], [14, 2], [6, 4], [-4, 0], [-6, -8], [0, -12]], peaks: [], forest: true },
            { n: 'sulawesi', p: [[8, 10], [10, 18], [8, 20], [6, 13], [2, 14], [0, 18], [-1, 14], [-6, 12], [-4, 10], [2, 11]], peaks: [[4, 12, 1.2]] },
            { n: 'maluku', p: [[4, 24], [5, 27], [2, 27], [1, 24]], peaks: [] },
            { n: 'papua', p: [[2, 30], [4, 36], [0, 44], [-4, 50], [-12, 50], [-10, 40], [-4, 34], [-2, 30]], peaks: [[-4, 42, 2.2, true]], forest: true }
        ];
        const SV = 1.5;   // regangkan sumbu v supaya mengisi lebar danau
        const SU = 0.9;   // padatkan sumbu u agar Papua & Sumatra tetap di dalam elips
        const toWorld = (v, u) => [LAKE.x + v * SV, LAKE.z - u * SU];
        const mkShape = (pts, k) => {
            const cv = pts.reduce((a, p) => a + p[0], 0) / pts.length;
            const cu = pts.reduce((a, p) => a + p[1], 0) / pts.length;
            const sh = new THREE.Shape();
            pts.forEach(([v, u], i) => {
                const sx = (cv + (v - cv) * k) * SV, sy = (cu + (u - cu) * k) * SU;
                if (i === 0) sh.moveTo(sx, sy); else sh.lineTo(sx, sy);
            });
            return sh;
        };
        const ext = (shape, depth) => {
            const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
            g.rotateX(-Math.PI / 2);    // (sx, sy) -> (x, tinggi, -sy)
            return g;
        };
        const r = this.r;
        for (const isl of ISL) {
            // Pasir (berakar di dasar danau) + daratan hijau
            this.add(ext(mkShape(isl.p, 1.0), 0.5), M.sand, LAKE.x, WATER_Y - 0.12, LAKE.z);
            this.add(ext(mkShape(isl.p, 0.78), 0.32), M.leafLight, LAKE.x, WATER_Y + 0.38, LAKE.z);
            const top = WATER_Y + 0.7;
            for (const [v, u, h, snow] of isl.peaks) {
                const [x, z] = toWorld(v, u);
                this.cyl(0, h * 0.75, h, 7, M.lawnDark, x, top, z, { cast: true });
                this.cyl(0, h * 0.28, h * 0.36, 7, snow ? M.snow : M.rock, x, top + h * 0.64, z);
            }
            if (isl.forest) {
                const vs = isl.p.map(p => p[0]), us = isl.p.map(p => p[1]);
                const cv = (Math.min(...vs) + Math.max(...vs)) / 2, cu = (Math.min(...us) + Math.max(...us)) / 2;
                for (let k = 0; k < 14; k++) {
                    const [x, z] = toWorld(cv + (r() - 0.5) * (Math.max(...vs) - Math.min(...vs)) * 0.45,
                        cu + (r() - 0.5) * (Math.max(...us) - Math.min(...us)) * 0.45);
                    this.cyl(0, 0.45, 1.0 + r() * 0.5, 5, M.green, x, top, z);
                }
            }
        }
        // Dermaga kecil di sisi timur danau
        this.block(6, 0.25, 2.2, M.woodLight, LAKE.x + LAKE.rx - 2, WATER_Y + 0.05, LAKE.z + 14);
        for (const dx of [-2.6, 0, 2.6]) for (const dz of [-0.9, 0.9]) {
            this.cyl(0.12, 0.12, 0.3, 6, M.woodDark, LAKE.x + LAKE.rx - 2 + dx, WATER_Y - 0.1, LAKE.z + 14 + dz);
        }
    }

    // =====================================================================
    // Paviliun rumah adat (local: depan = +z menghadap danau, panjang = sumbu x)
    // =====================================================================
    buildPavilions() {
        const M = this.M;
        const builders = [this.rumahGadang, this.tongkonan, this.honai, this.joglo, this.rumahPanjang, this.baileo];
        const angles = [35, 115, 160, 200, 245, 325];
        angles.forEach((deg, k) => {
            const a = deg * Math.PI / 180;
            const x = LAKE.x + PAV.rx * Math.cos(a);
            const z = LAKE.z + PAV.rz * Math.sin(a);
            const g = new THREE.Group();
            g.position.set(x, 0, z);
            g.rotation.y = Math.atan2(LAKE.x - x, LAKE.z - z);   // +z lokal menghadap pusat danau
            this.staticGroup.add(g);
            // Lantai paviliun batu + jalan penghubung ke lingkar danau
            this.block(15, 0.36, 11, M.stone, 0, S, 0, {}, g);
            this.block(15.4, 0.08, 11.4, M.stoneDark, 0, S, 0, {}, g);
            builders[k].call(this, g, S + 0.36);
            // Papan nama (atlas)
            this.block(0.18, 1.7, 0.18, M.woodDark, -3.2, S, 6.2, {}, g);
            this.block(0.18, 1.7, 0.18, M.woodDark, 3.2, S, 6.2, {}, g);
            const sign = this.add(this.signPlane(6.4, 0.42, k), M.sign, 0, S + 1.5, 6.25, {}, g);
            sign.receiveShadow = false;
            // Sambungan ke jalan lingkar
            const fx = x + (LAKE.x - x) * 0.16, fz = z + (LAKE.z - z) * 0.16;
            this.strip(x + (LAKE.x - x) * 0.07, z + (LAKE.z - z) * 0.07, fx, fz, 3, 0.04, S, M.pave);
        });
    }

    stilts(g, y0, h, xs, zs, mat) {
        for (const x of xs) for (const z of zs) this.cyl(0.16, 0.18, h, 6, mat, x, y0, z, {}, g);
    }
    /** Atap pelana dua bidang miring sepanjang sumbu x. */
    gable(g, len, span, rise, yEave, mat, zc = 0) {
        const half = span / 2;
        const slope = Math.hypot(half, rise);
        const ang = Math.atan2(rise, half);
        for (const s of [-1, 1]) {
            this.box(len, 0.22, slope + 0.5, mat, 0, yEave + rise / 2, zc + s * half / 2, { rx: s * ang, cast: true }, g);
        }
    }

    rumahGadang(g, y0) {
        const M = this.M;
        this.stilts(g, y0, 1.6, [-5.4, -1.8, 1.8, 5.4], [-2.4, 2.4], M.woodDark);
        this.block(12, 0.3, 6, M.wood, 0, y0 + 1.6, 0, { cast: true }, g);
        const wy = y0 + 1.9;
        this.block(11.4, 2.4, 5.4, M.woodDark, 0, wy, 0, { cast: true }, g);
        // Ukiran: pita merah & emas di fasad depan
        this.block(11.2, 0.5, 0.06, M.red, 0, wy + 1.6, 2.72, {}, g);
        this.block(11.2, 0.12, 0.07, M.gold, 0, wy + 1.5, 2.73, {}, g);
        this.block(11.2, 0.12, 0.07, M.gold, 0, wy + 2.15, 2.73, {}, g);
        for (let x = -4.5; x <= 4.5; x += 1.8) this.block(0.9, 1.1, 0.06, M.black, x, wy + 0.3, 2.72, {}, g);
        this.block(1.4, 1.8, 0.08, M.wood, 0, wy, 2.74, {}, g);
        this.gable(g, 12.6, 7.2, 2.6, wy + 2.2, M.ijuk);
        // Gonjong: tanduk atap melengkung ke atas di ujung & tengah
        for (const [x, tilt, h] of [[-6.4, 0.75, 3.6], [-3.0, 0.35, 2.6], [3.0, -0.35, 2.6], [6.4, -0.75, 3.6]]) {
            this.cyl(0.05, 0.42, h, 6, M.ijuk, x, wy + 4.4, 0, { rz: tilt, cast: true }, g);
            // Ujung tanduk (pusat silinder diputar -> ujung = pusat + (-sin, cos) * h/2)
            const tx = x - Math.sin(tilt) * h / 2, ty = wy + 4.4 + h / 2 + Math.cos(tilt) * h / 2;
            this.add(new THREE.ConeGeometry(0.1, 0.6, 5), M.gold, tx - Math.sin(tilt) * 0.3, ty + Math.cos(tilt) * 0.3, 0, { rz: tilt }, g);
        }
        // Tangga depan
        this.block(1.6, 0.25, 1.4, M.wood, 0, y0, 3.7, {}, g);
        this.block(1.6, 0.25, 0.8, M.wood, 0, y0 + 0.6, 3.3, {}, g);
        this.block(1.6, 0.25, 0.6, M.wood, 0, y0 + 1.2, 3.1, {}, g);
    }

    tongkonan(g, y0) {
        const M = this.M;
        this.stilts(g, y0, 1.9, [-2.6, 0, 2.6], [-1.6, 1.6], M.woodDark);
        this.block(6.6, 0.3, 4.2, M.woodDark, 0, y0 + 1.9, 0, { cast: true }, g);
        const wy = y0 + 2.2;
        this.block(6, 2, 3.8, M.red, 0, wy, 0, { cast: true }, g);
        // Motif ukiran: pita hitam/kuning/putih
        for (const [dy, mat] of [[0.3, M.black], [0.8, M.yellow], [1.3, M.white], [1.7, M.black]]) {
            this.block(6.05, 0.16, 3.85, mat, 0, wy + dy, 0, {}, g);
        }
        // Atap perahu: pelana tengah + ujung melengkung naik
        this.gable(g, 6.8, 5.0, 1.6, wy + 2.0, M.ijuk);
        for (const s of [-1, 1]) {
            const g2 = new THREE.Group();
            g2.position.set(s * 3.2, wy + 2.6, 0);
            g2.rotation.z = s * 0.42;
            g.add(g2);
            this.box(4.4, 0.24, 4.8, M.ijuk, s * 2.1, 0, 0, { cast: true }, g2);
            this.box(4.0, 0.5, 0.6, M.ijuk, s * 2.1, 0.35, 0, { cast: true }, g2);
            // Tiang penyangga ujung atap
            this.cyl(0.18, 0.2, 6.1, 6, M.woodDark, s * 6.6, y0, 0, {}, g);
            // Tanduk kerbau di tiang
            this.block(0.3, 0.3, 1.2, M.cream, s * 6.6, y0 + 3.2, 0, {}, g);
        }
        this.block(1.2, 0.22, 1.6, M.wood, 0, y0, 2.9, {}, g);
        this.block(1.2, 0.22, 1.0, M.wood, 0, y0 + 0.9, 2.6, {}, g);
    }

    honai(g, y0) {
        const M = this.M;
        const one = (x, z, r, h) => {
            this.cyl(r, r, h, 12, M.wood, x, y0, z, { cast: true }, g);
            const dome = new THREE.SphereGeometry(r + 0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
            this.add(dome, M.thatch, x, y0 + h - 0.1, z, { s: [1, 0.95, 1], cast: true }, g);
            this.cyl(0.0, 0.3, 0.6, 6, M.thatchDark, x, y0 + h + r * 0.9, z, {}, g);
            this.block(0.8, 1.2, 0.1, M.woodDark, x, y0, z + r - 0.02, {}, g);
        };
        one(0, -0.5, 2.4, 2.0);
        one(-4.6, 1.2, 1.7, 1.6);
        one(4.6, 1.2, 1.7, 1.6);
        // Pagar kayu
        for (let x = -6.8; x <= 6.8; x += 0.8) this.block(0.12, 0.9, 0.12, M.woodDark, x, y0, -4.6, {}, g);
        this.block(13.8, 0.1, 0.1, M.woodDark, 0, y0 + 0.7, -4.6, {}, g);
    }

    joglo(g, y0) {
        const M = this.M;
        this.block(11, 0.5, 9, M.stoneDark, 0, y0, 0, {}, g);
        const fy = y0 + 0.5;
        this.block(10.4, 0.06, 8.4, M.cream, 0, fy, 0, {}, g);
        // Soko guru + tiang keliling
        for (const x of [-1.4, 1.4]) for (const z of [-1.4, 1.4]) this.cyl(0.2, 0.2, 3.8, 8, M.woodDark, x, fy, z, { cast: true }, g);
        for (const x of [-4.6, -1.6, 1.6, 4.6]) for (const z of [-3.8, 3.8]) this.cyl(0.15, 0.15, 2.8, 8, M.wood, x, fy, z, { cast: true }, g);
        for (const z of [-1.4, 1.4]) for (const x of [-4.6, 4.6]) this.cyl(0.15, 0.15, 2.8, 8, M.wood, x, fy, z, {}, g);
        // Atap: penanggap (bawah) + brunjung tinggi (atas)
        this.add(hipGeo(3.4, 7.6, 1.5, 1.1, 0.92), M.terracotta, 0, fy + 2.8 + 0.75, 0, { cast: true }, g);
        this.add(hipGeo(0.5, 3.4, 3.0, 1.35, 0.75), M.brick, 0, fy + 4.3 + 1.5, 0, { cast: true }, g);
        this.block(3.0, 0.2, 0.25, M.gold, 0, fy + 7.25, 0, {}, g);
        this.cyl(0, 0.2, 0.6, 6, M.gold, 0, fy + 7.4, 0, {}, g);
        // Gamelan mini di pendopo
        this.block(2.2, 0.4, 0.8, M.gold, 0, fy, 0.6, {}, g);
        this.block(2.2, 0.4, 0.8, M.woodDark, 0, fy, -0.8, {}, g);
    }

    rumahPanjang(g, y0) {
        const M = this.M;
        const xs = [];
        for (let x = -6.4; x <= 6.4; x += 2.13) xs.push(x);
        this.stilts(g, y0, 2.2, xs, [-2.2, 2.2], M.woodDark);
        this.block(14, 0.3, 6.2, M.woodLight, 0, y0 + 2.2, 0.6, { cast: true }, g);
        const wy = y0 + 2.5;
        this.block(13.4, 2.0, 4.4, M.wood, 0, wy, -0.4, { cast: true }, g);
        // Motif Dayak: pita hitam-putih-kuning + lingkaran
        this.block(13.45, 0.2, 4.45, M.black, 0, wy + 1.3, -0.4, {}, g);
        this.block(13.45, 0.12, 4.45, M.yellow, 0, wy + 1.55, -0.4, {}, g);
        for (let x = -5.5; x <= 5.5; x += 2.2) {
            this.add(new THREE.CircleGeometry(0.42, 10), M.white, x, wy + 0.75, 1.83, {}, g);
            this.add(new THREE.CircleGeometry(0.24, 10), M.red, x, wy + 0.75, 1.84, {}, g);
        }
        // Serambi + pagar
        for (let x = -6.6; x <= 6.6; x += 0.6) this.block(0.08, 0.7, 0.08, M.woodDark, x, wy, 3.55, {}, g);
        this.block(13.4, 0.1, 0.12, M.woodDark, 0, wy + 0.7, 3.55, {}, g);
        this.gable(g, 14.4, 6.6, 2.2, wy + 2.0, M.thatchDark, -0.2);
        // Tangga batang kayu bertakik
        this.box(0.5, 0.35, 3.4, M.woodDark, 0, y0 + 1.1, 4.6, { rx: -0.72, cast: true }, g);
    }

    baileo(g, y0) {
        const M = this.M;
        const xs = [-4.4, -2.2, 0, 2.2, 4.4], zs = [-2.8, 0, 2.8];
        this.stilts(g, y0, 1.2, xs, zs, M.woodDark);
        this.block(10, 0.3, 7, M.woodLight, 0, y0 + 1.2, 0, { cast: true }, g);
        const fy = y0 + 1.5;
        // Terbuka tanpa dinding: tiang + balok berukir
        for (const x of xs) for (const z of [-3.2, 3.2]) this.cyl(0.14, 0.14, 2.6, 6, M.wood, x, fy, z, { cast: true }, g);
        for (const s of [-1, 1]) {
            this.block(10, 0.3, 0.2, M.red, 0, fy + 2.3, s * 3.2, {}, g);
            this.block(10, 0.08, 0.22, M.gold, 0, fy + 2.15, s * 3.2, {}, g);
        }
        this.block(10, 0.5, 0.06, M.wood, 0, fy, 3.25, {}, g);   // pagar rendah
        // Atap perisai besar
        this.add(hipGeo(1.0, 7.2, 3.2, 1.15, 0.82), M.thatch, 0, fy + 2.6 + 1.6, 0, { cast: true }, g);
        this.block(2.6, 0.25, 0.3, M.thatchDark, 0, fy + 5.9, 0, {}, g);
        // Tifa di tengah
        this.cyl(0.35, 0.3, 0.9, 10, M.red, 0, fy, 0, {}, g);
        this.block(1.2, 0.2, 1.2, M.woodDark, 0, y0, 4.1, {}, g);
    }

    // =====================================================================
    // Taman bunga (selatan danau)
    // =====================================================================
    buildFlowerGardens() {
        const M = this.M;
        const COLORS = [0xE63946, 0xFFC93C, 0xFF7EB6, 0x9B5DE5, 0xFFFFFF, 0xFF8C42];
        const mats = COLORS.map(c => new THREE.MeshLambertMaterial({ color: lin(c) }));
        // Petak-petak bergaris (pola pelangi)
        for (let x = -432; x <= -324; x += 4.6) {
            if (Math.abs(x - LAKE.x) < 5) continue;
            for (let z = -150; z <= -110; z += 2.8) {
                if ([LAKE.x - 26, LAKE.x + 26].some(cx => Math.hypot(x - cx, z + 130) < 6)) continue;
                this.block(3.4, 0.22, 1.6, M.soil, x, S, z);
                const ci = Math.floor((x + 1000) / 4.6 + (z + 1000) / 2.8) % COLORS.length;
                this.block(3.0, 0.24, 1.2, mats[ci], x, S + 0.22, z);
            }
        }
        // Bedeng bunga bundar di persimpangan sumbu
        for (const [cx, cz] of [[LAKE.x, -130], [LAKE.x - 26, -130], [LAKE.x + 26, -130]]) {
            this.cyl(3.6, 3.8, 0.3, 20, M.stone, cx, S, cz);
            for (let k = 0; k < 3; k++) {
                this.cyl(3.0 - k * 0.9, 3.0 - k * 0.9, 0.3 + k * 0.18, 18, mats[(k * 2 + 1) % mats.length], cx, S + 0.3, cz);
            }
        }
    }

    // =====================================================================
    // Taman bermain (bagian statis)
    // =====================================================================
    buildPlaygroundStatic() {
        const M = this.M;
        // --- Bianglala: kaki A, poros, panggung, loket ---
        const { x, z, hub } = FERRIS;
        this.cyl(10.5, 11, 0.6, 24, M.stone, x, S, z, {});
        // Kaki A di luar bidang rim (rim +-1,4, lampu +-1,62) agar tidak menembus jari-jari yang berputar
        for (const sx of [-3.4, 3.4]) {
            for (const sz of [-9.5, 9.5]) this.beam([x + sx, S + 0.6, z + sz], [x + sx * 0.68, hub, z], 0.7, M.steelDark);
            this.beam([x + sx * 0.9, 7, z - 6.4], [x + sx * 0.9, 7, z + 6.4], 0.35, M.steel);
        }
        this.add(new THREE.CylinderGeometry(0.6, 0.6, 5.0, 12), M.steel, x, hub, z, { rz: Math.PI / 2, cast: true });
        this.block(3.4, 2.4, 2.4, M.red, x + 5, S + 0.6, z + 6.5, { cast: true });
        this.block(3.8, 0.3, 2.8, M.yellow, x + 5, S + 3.0, z + 6.5);

        // --- Komidi putar: panggung bawah ---
        this.cyl(8.2, 8.5, 0.5, 28, M.stoneDark, CAROUSEL.x, S, CAROUSEL.z, {});
        this.cyl(8.6, 8.6, 0.12, 28, M.gold, CAROUSEL.x, S, CAROUSEL.z, {});

        // --- Ayunan (2 rangka) ---
        this.swingSets = [{ x: -420, z: 92 }, { x: -420, z: 124 }];
        for (const sw of this.swingSets) {
            for (const dx of [-5.2, 5.2]) {
                for (const dz of [-1.6, 1.6]) this.beam([sw.x + dx, S, sw.z + dz], [sw.x + dx, S + 3.4, sw.z], 0.2, M.blue);
            }
            this.add(new THREE.CylinderGeometry(0.12, 0.12, 10.6, 8), M.yellow, sw.x, S + 3.4, sw.z, { rz: Math.PI / 2, cast: true });
            this.block(10, 0.04, 3.4, M.sand, sw.x, S + 0.05, sw.z);
        }

        // --- Perosotan ---
        const sl = { x: -444, z: 108 };
        this.block(2.4, 0.06, 2.4, M.blue, sl.x, S + 2.6, sl.z);
        for (const dx of [-1.1, 1.1]) for (const dz of [-1.1, 1.1]) this.block(0.18, 3.6, 0.18, M.red, sl.x + dx, S, sl.z + dz, { cast: true });
        this.cyl(0, 1.9, 1.4, 4, M.yellow, sl.x, S + 3.6, sl.z, { ry: Math.PI / 4, cast: true });
        // Tangga (sisi utara) + papan luncur (ke selatan, kemiringan ±28°)
        for (const dx of [-0.55, 0.55]) this.beam([sl.x + dx, S, sl.z + 3.4], [sl.x + dx, S + 2.65, sl.z + 1.2], 0.12, M.steel);
        for (let k = 1; k < 6; k++) {
            const t = k / 6;
            this.block(1.1, 0.06, 0.2, M.steel, sl.x, S + 2.65 * t, sl.z + 3.4 - 2.2 * t);
        }
        const len = Math.hypot(5.2, 2.6);
        this.box(1.0, 0.1, len, M.yellow, sl.x, S + 1.32, sl.z - 1.2 - 2.6, { rx: -Math.atan2(2.6, 5.2), cast: true });
        for (const dx of [-0.5, 0.5]) this.box(0.08, 0.3, len, M.red, sl.x + dx, S + 1.48, sl.z - 3.8, { rx: -Math.atan2(2.6, 5.2) });
        this.block(1.4, 0.06, 1.2, M.rubberBlue, sl.x, S + 0.04, sl.z - 6.9);

        // --- Jungkat-jungkit: tumpuan ---
        this.seesaws = [{ x: -400, z: 132 }, { x: -404, z: 84 }, { x: -436, z: 84 }];
        for (const ss of this.seesaws) {
            this.cyl(0.05, 0.42, 0.62, 4, M.red, ss.x, S, ss.z, { ry: Math.PI / 4 });
        }

        // --- Bangku & kios jajanan ---
        for (const [bx, bz, ry] of [[-360, 82, 0], [-398, 112.5, 0], [-368, 134, 0], [-330, 60, Math.PI / 2], [-450, 60, Math.PI / 2]]) {
            const b = new THREE.Group(); b.position.set(bx, 0, bz); b.rotation.y = ry; this.staticGroup.add(b);
            this.block(2.4, 0.08, 0.6, M.woodLight, 0, S + 0.45, 0, {}, b);
            this.block(2.4, 0.5, 0.08, M.woodLight, 0, S + 0.55, -0.3, {}, b);
            for (const dx of [-1, 1]) this.block(0.1, 0.45, 0.5, M.steelDark, dx, S, 0, {}, b);
        }
        const KIOSK = [0xE63946, 0x3E8E4B, 0x2F6FB5, 0xF2A33A];
        KIOSK.forEach((c, k) => {
            const kx = -440 + k * 9, kz = 146 - 4.5;
            this.block(3.6, 2.2, 2.6, M.cream, kx, S, kz, { cast: true });
            this.block(4.2, 0.25, 3.4, new THREE.MeshLambertMaterial({ color: lin(c) }), kx, S + 2.3, kz + 0.2, { cast: true });
            this.block(3.6, 0.1, 0.8, M.woodLight, kx, S + 1.0, kz + 1.6);
        });
    }

    // =====================================================================
    // Rel kereta wisata mini
    // =====================================================================
    buildTrack() {
        const M = this.M;
        this.trackLoop = new Loop(roundRectPts(TRACK));
        const pts = this.trackLoop.pts;
        const _o = {};
        // Bantalan tiap 1,6 m
        for (let s = 0; s < this.trackLoop.length; s += 1.6) {
            const p = this.trackLoop.sample(s, _o);
            this.box(0.36, 0.08, 2.0, M.woodDark, p.x, S + 0.04, p.z, { ry: Math.atan2(-p.dz, p.dx) });
        }
        // Dua rel baja
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
            const nx = -dz / len, nz = dx / len;
            for (const s of [-0.6, 0.6]) {
                this.strip(a.x + nx * s, a.z + nz * s, b.x + nx * s, b.z + nz * s, 0.1, 0.1, S + 0.08, M.steelDark, 0.12);
            }
        }
        // Stasiun kecil di sisi timur
        const sx = TRACK.x1 - 3.4, sz0 = 6, sz1 = 30;
        this.block(3.6, 0.6, sz1 - sz0, M.stone, sx, S, (sz0 + sz1) / 2, { cast: true });
        for (let z = sz0 + 2; z <= sz1 - 2; z += 5) this.block(0.2, 3, 0.2, M.wood, sx - 1, S + 0.6, z, { cast: true });
        this.block(4.8, 0.25, sz1 - sz0 + 1, M.red, sx - 0.4, S + 3.6, (sz0 + sz1) / 2, { cast: true });
    }

    // =====================================================================
    // Kereta gantung: stasiun, menara tengah di pulau, kabel
    // =====================================================================
    buildCableCarStatic() {
        const M = this.M;
        const { x, zS, zN, zP, hStation, hPylon } = CABLE;
        for (const [z, s] of [[zS, -1], [zN, 1]]) {
            this.block(9, 0.3, 9, M.stone, x, S, z);
            // Dek naik-turun penumpang tepat di bawah lantai kabin (kabin menggantung 2,9 m di bawah kabel)
            const deckY = hStation - 3.3;
            for (const dx of [-3.4, 3.4]) for (const dz of [-3.4, 3.4]) {
                this.block(0.6, deckY - S, 0.6, M.steelDark, x + dx, S, z + dz, { cast: true });
                this.block(0.3, 3.8, 0.3, M.steel, x + dx, deckY + 0.4, z + dz);
            }
            this.block(8, 0.4, 8, M.cream, x, deckY, z, { cast: true });
            this.add(new THREE.CylinderGeometry(0.4, 5.8, 2.2, 4), M.blue, x, hStation + 1.6, z, { ry: Math.PI / 4, cast: true });
            this.add(new THREE.TorusGeometry(1.6, 0.14, 6, 20), M.steel, x, hStation, z + s * 1.0, { rx: Math.PI / 2 });
            // Tangga
            for (let k = 0; k < 10; k++) this.block(1.4, 0.2, 0.6, M.steel, x + 4.4, S + k * (hStation - 3.1 - S) / 10, z - s * (3 - k * 0.6));
        }
        // Menara tengah di pulau Kalimantan
        const top = WATER_Y + 0.7;
        for (const dx of [-1.3, 1.3]) {
            this.beam([x + dx * 1.6, top, zP - 1.4], [x + dx, hPylon, zP], 0.45, M.steelDark);
            this.beam([x + dx * 1.6, top, zP + 1.4], [x + dx, hPylon, zP], 0.45, M.steelDark);
        }
        this.block(4.4, 0.4, 1.0, M.steel, x, hPylon, zP, { cast: true });
        this.lampHeads.push([x, hPylon + 0.8, zP]);
        // Kabel (dua jalur, turun-naik ke menara)
        for (const dx of [-1.6, 1.6]) {
            this.beam([x + dx, hStation, zS], [x + dx, hPylon + 0.4, zP], 0.07, M.black, null, false);
            this.beam([x + dx, hPylon + 0.4, zP], [x + dx, hStation, zN], 0.07, M.black, null, false);
        }
    }

    // =====================================================================
    // Menara pandang
    // =====================================================================
    buildTower() {
        const M = this.M;
        const { x, z } = TOWER;
        const H = 26;
        this.block(9, 0.5, 9, M.stoneDark, x, S, z);
        const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (const [a, b] of legs) this.beam([x + a * 3.6, S + 0.5, z + b * 3.6], [x + a * 1.7, H, z + b * 1.7], 0.5, M.steelDark);
        for (let y = 4; y < H; y += 4.4) {
            const t = (y - S) / H, r = 3.6 - (3.6 - 1.7) * t;
            for (let k = 0; k < 4; k++) {
                const [a0, b0] = legs[k], [a1, b1] = legs[(k + 1) % 4];
                this.beam([x + a0 * r, y, z + b0 * r], [x + a1 * r, y, z + b1 * r], 0.2, M.steel, null, false);
            }
        }
        // Tangga spiral (lempeng berputar) di poros
        this.cyl(0.35, 0.35, H, 8, M.steel, x, S + 0.5, z);
        for (let k = 0; k < 40; k++) {
            const a = k * 0.6, y = S + 1 + k * (H - 1.5) / 40;
            this.box(1.4, 0.08, 0.5, M.steel, x + Math.cos(a) * 0.9, y, z - Math.sin(a) * 0.9, { ry: a });
        }
        // Kabin pandang + atap + puncak
        this.cyl(3.2, 3.0, 0.5, 8, M.cream, x, H, z, { cast: true });
        for (let k = 0; k < 8; k++) {
            const a = k / 8 * Math.PI * 2 + Math.PI / 8;
            this.block(0.18, 2.6, 0.18, M.steelDark, x + Math.cos(a) * 3.0, H + 0.5, z + Math.sin(a) * 3.0);
        }
        this.cyl(3.15, 3.15, 1.0, 8, M.red, x, H + 0.5, z);
        this.cyl(0.4, 4.0, 2.6, 8, M.terracotta, x, H + 3.1, z, { cast: true });
        this.cyl(0.0, 0.35, 2.2, 6, M.gold, x, H + 5.7, z);
        this.box(0.5, 0.5, 0.5, M.aviation, x, H + 8.1, z);
        this.aviationPos = [x, H + 8.1, z];
    }

    // =====================================================================
    // Pohon
    // =====================================================================
    buildTrees() {
        const M = this.M;
        const r = this.r;
        const tree = (x, z, kind, y0 = S) => {
            if (kind === 'palm') {
                const h = 6 + r() * 2;
                this.cyl(0.18, 0.28, h, 6, M.trunk, x, y0, z, { rz: (r() - 0.5) * 0.12, cast: true });
                for (let k = 0; k < 6; k++) {
                    const a = k / 6 * Math.PI * 2 + r();
                    this.box(3.2, 0.06, 0.7, M.palm, x + Math.cos(a) * 1.4, y0 + h - 0.2, z + Math.sin(a) * 1.4,
                        { ry: -a, rz: -0.35, order: 'YXZ', cast: true });
                }
            } else {
                const h = 2.2 + r() * 1.2, s = 1.8 + r() * 1.2;
                this.cyl(0.2, 0.28, h, 6, M.trunk, x, y0, z, { cast: true });
                this.add(new THREE.IcosahedronGeometry(s, 0), r() < 0.5 ? M.leaf : M.leafLight, x, y0 + h + s * 0.7, z, { cast: true });
                if (r() < 0.5) this.add(new THREE.IcosahedronGeometry(s * 0.7, 0), M.leafLight, x + 0.6, y0 + h + s * 1.35, z - 0.4, { cast: true });
            }
        };
        // Deret pohon di dalam pagar
        for (let z = PARK.z0 + 6; z <= PARK.z1 - 6; z += 13) {
            if (Math.abs(z - AXIS_Z) > 16) tree(PARK.x1 - 4, z + r() * 3, 'leaf');
            tree(PARK.x0 + 4, z + r() * 3, 'leaf');
        }
        for (let x = PARK.x0 + 12; x <= PARK.x1 - 12; x += 14) {
            tree(x + r() * 3, PARK.z0 + 4, 'leaf');
            tree(x + r() * 3, PARK.z1 - 4, 'leaf');
        }
        // Kelapa di tepi danau (antara jalan lingkar & paviliun)
        for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2 + 0.17;
            const deg = ((a * 180 / Math.PI) % 360 + 360) % 360;
            if ([35, 115, 160, 200, 245, 325, 90, 270, 0, 180].some(d => Math.abs(((deg - d + 540) % 360) - 180) < 12)) continue;
            tree(LAKE.x + (RING.rx + 4.5) * Math.cos(a), LAKE.z + (RING.rz + 4.5) * Math.sin(a), 'palm');
        }
        // Pohon peneduh di plaza & taman bermain
        for (const [x, z] of [[-334, -12], [-334, -44], [-318, 54], [-318, -78], [-356, 140], [-405, 141], [-330, -100], [-450, -100]]) tree(x, z, 'leaf');
        // Deret pohon di luar pagar (tepi kanan-kiri jalan masuk & barat)
        for (let z = -300; z <= 300; z += 22) tree(-482 - r() * 8, z + r() * 8, 'leaf', -0.05);
    }

    // =====================================================================
    // Lampu taman (tiang statis, kepala lampu = material terproteksi)
    // =====================================================================
    buildLamps() {
        const M = this.M;
        const lamp = (x, z) => {
            this.cyl(0.07, 0.1, 3.4, 6, M.steelDark, x, S, z);
            this.cyl(0.32, 0.18, 0.3, 6, M.steelDark, x, S + 3.4, z);
            this.add(new THREE.SphereGeometry(0.26, 8, 6), M.lamp, x, S + 3.85, z);
            this.cyl(0.0, 0.3, 0.2, 6, M.gold, x, S + 4.1, z);
            this.lampHeads.push([x, S + 3.85, z]);
        };
        const ring = ellipsePts(LAKE.x, LAKE.z, RING.rx + 2.2, RING.rz + 2.2, 26);
        ring.forEach(p => lamp(p.x, p.z));
        const prom = new Loop(roundRectPts(PROM));
        const o = {};
        for (let s = 0; s < prom.length; s += 24) {
            const p = prom.sample(s, o);
            lamp(p.x - p.dz * 2.2, p.z + p.dx * 2.2);
        }
        for (const x of [-314, -336, -344]) { lamp(x, AXIS_Z - 3.4); lamp(x, AXIS_Z + 3.4); }
        for (const x of [-356, -386, -410, -436]) lamp(x, 105.8);
    }

    // =====================================================================
    // Bianglala (berputar) — rangka dilebur dalam grup berputar, gondola instanced
    // =====================================================================
    buildFerrisWheel() {
        const M = this.M;
        const { x, z, hub, R } = FERRIS;
        const rot = new THREE.Group();
        rot.position.set(x, hub, z);
        this.root.add(rot);
        this.ferrisRot = rot;
        const tmp = new THREE.Group();
        rot.add(tmp);
        for (const dx of [-1.4, 1.4]) {
            this.add(new THREE.TorusGeometry(R, 0.22, 6, 56), M.white, dx, 0, 0, { ry: Math.PI / 2, cast: true }, tmp);
            this.add(new THREE.TorusGeometry(R * 0.55, 0.14, 6, 40), M.red, dx, 0, 0, { ry: Math.PI / 2 }, tmp);
        }
        const N = 16;
        for (let k = 0; k < N; k++) {
            const a = (k / N) * Math.PI * 2;
            for (const dx of [-1.4, 1.4]) {
                this.add(new THREE.BoxGeometry(0.14, R, 0.14), M.white, dx, Math.sin(a) * R / 2, Math.cos(a) * R / 2, { rx: Math.PI / 2 - a, cast: true }, tmp);
            }
            // Batang lintang antar-rim (gantungan gondola)
            this.add(new THREE.BoxGeometry(2.8, 0.14, 0.14), M.steel, 0, Math.sin(a) * R, Math.cos(a) * R, {}, tmp);
        }
        // Bola lampu di kedua rim + jari-jari (bergantian A/B -> efek kejar)
        const bulbGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
        for (let k = 0; k < 64; k++) {
            const a = (k / 64) * Math.PI * 2;
            for (const dx of [-1.62, 1.62]) {
                this.add(bulbGeo, k % 2 ? M.bulbA : M.bulbB, dx, Math.sin(a) * R, Math.cos(a) * R, {}, tmp);
            }
        }
        for (let k = 0; k < N; k++) {
            const a = (k / N) * Math.PI * 2;
            for (let t = 0.3; t < 0.95; t += 0.16) {
                this.add(bulbGeo, (k % 2) ? M.bulbB : M.bulbA, 1.6, Math.sin(a) * R * t, Math.cos(a) * R * t, {}, tmp);
            }
        }
        this.add(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 12), M.gold, 0, 0, 0, { rz: Math.PI / 2 }, tmp);
        const baked = bakeStatic(tmp, { relativeTo: rot, mergeShadow: true });
        rot.remove(tmp);
        rot.add(baked);

        // Gondola: badan + atap + gantungan (pivot di atas)
        const geo = mergeParts([
            { geo: new THREE.BoxGeometry(0.1, 1.0, 0.1), c: 0x8D96A0, y: -0.5 },
            { geo: new THREE.CylinderGeometry(0.2, 1.0, 0.45, 6), c: 0xFFFFFF, y: -1.05 },
            { geo: new THREE.BoxGeometry(1.6, 0.9, 1.4), c: 0xFFFFFF, y: -1.75 },
            { geo: new THREE.BoxGeometry(1.64, 0.4, 1.44), c: 0xD8E8F0, y: -1.65 },
            { geo: new THREE.BoxGeometry(1.7, 0.12, 1.5), c: 0x4C545E, y: -2.25 }
        ]);
        this.gondolas = new THREE.InstancedMesh(geo, this.vcMat, N);
        this.gondolas.frustumCulled = false;
        this.gondolas.castShadow = true;
        this.gondolas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const C = [0xE63946, 0xFFC93C, 0x2F9E8F, 0x3E7CB8, 0xFF7EB6, 0x9B5DE5, 0xFF8C42, 0x6CC04A];
        const c = new THREE.Color();
        for (let k = 0; k < N; k++) this.gondolas.setColorAt(k, c.copy(lin(C[k % C.length])));
        this.gondolas.instanceColor.needsUpdate = true;
        this.root.add(this.gondolas);
        this.gondolaN = N;
    }

    // =====================================================================
    // Komidi putar (berputar) — kanopi/tiang dilebur, kuda instanced naik-turun
    // =====================================================================
    buildCarousel() {
        const M = this.M;
        const { x, z } = CAROUSEL;
        const y0 = S + 0.5;
        const rot = new THREE.Group();
        rot.position.set(x, y0, z);
        this.root.add(rot);
        this.carouselRot = rot;
        const tmp = new THREE.Group();
        rot.add(tmp);
        this.cyl(7.6, 7.6, 0.18, 28, M.cream, 0, 0, 0, {}, tmp);
        this.cyl(0.9, 1.0, 5.2, 12, M.gold, 0, 0.18, 0, { cast: true }, tmp);
        this.cyl(1.6, 1.6, 2.6, 12, M.red, 0, 1.6, 0, {}, tmp);
        // Kanopi bergaris merah-putih (12 irisan)
        const SEG = 12;
        for (let k = 0; k < SEG; k++) {
            const g = new THREE.CylinderGeometry(0.4, 8.4, 2.4, 2, 1, false, (k / SEG) * Math.PI * 2, Math.PI * 2 / SEG);
            this.add(g, k % 2 ? M.red : M.white, 0, 5.4 + 1.2, 0, { cast: true }, tmp);
            const v = new THREE.CylinderGeometry(8.4, 8.4, 0.7, 2, 1, true, (k / SEG) * Math.PI * 2, Math.PI * 2 / SEG);
            this.add(v, k % 2 ? M.white : M.red, 0, 5.4 - 0.3, 0, {}, tmp);
        }
        this.cyl(0, 0.6, 1.4, 8, M.gold, 0, 7.8, 0, {}, tmp);
        // Tiang kuningan
        this.horseSlots = [];
        for (const [rad, n] of [[6.0, 12], [3.8, 8]]) {
            for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2 + (rad < 5 ? 0.2 : 0);
                this.cyl(0.07, 0.07, 5.2, 6, M.gold, Math.cos(a) * rad, 0.18, Math.sin(a) * rad, {}, tmp);
                this.horseSlots.push({ a, rad, ph: k * 1.3 + rad });
            }
        }
        // Lampu tepi kanopi
        const bulbGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        for (let k = 0; k < 48; k++) {
            const a = (k / 48) * Math.PI * 2;
            this.add(bulbGeo, k % 2 ? M.bulbA : M.bulbB, Math.cos(a) * 8.45, 4.85, Math.sin(a) * 8.45, {}, tmp);
        }
        const baked = bakeStatic(tmp, { relativeTo: rot, mergeShadow: true });
        rot.remove(tmp);
        rot.add(baked);

        // Kuda (menghadap +x lokal)
        const geo = mergeParts([
            { geo: new THREE.BoxGeometry(1.3, 0.55, 0.42), c: 0xFFFFFF, y: 0 },
            { geo: new THREE.BoxGeometry(0.35, 0.75, 0.3), c: 0xFFFFFF, x: 0.65, y: 0.45, rz: -0.4 },
            { geo: new THREE.BoxGeometry(0.6, 0.28, 0.28), c: 0xFFFFFF, x: 0.95, y: 0.82 },
            { geo: new THREE.BoxGeometry(0.2, 0.55, 0.32), c: 0x7A4E2C, x: 0.55, y: 0.62, rz: -0.4 },
            { geo: new THREE.BoxGeometry(0.5, 0.12, 0.46), c: 0xB8312A, x: -0.05, y: 0.32 },
            { geo: new THREE.BoxGeometry(0.14, 0.62, 0.14), c: 0xEADCC0, x: 0.48, y: -0.5, rz: 0.5 },
            { geo: new THREE.BoxGeometry(0.14, 0.62, 0.14), c: 0xEADCC0, x: -0.5, y: -0.5, rz: -0.5 },
            { geo: new THREE.BoxGeometry(0.14, 0.55, 0.14), c: 0xEADCC0, x: 0.42, y: -0.45, z: 0.12, rz: 0.2 },
            { geo: new THREE.BoxGeometry(0.14, 0.55, 0.14), c: 0xEADCC0, x: -0.42, y: -0.45, z: 0.12, rz: -0.2 },
            { geo: new THREE.BoxGeometry(0.5, 0.12, 0.1), c: 0x7A4E2C, x: -0.8, y: 0.05, rz: 0.6 }
        ]);
        this.horses = new THREE.InstancedMesh(geo, this.vcMat, this.horseSlots.length);
        this.horses.frustumCulled = false;
        this.horses.castShadow = true;
        this.horses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const HC = [0xFFFFFF, 0xF6D7A7, 0xBFD9F2, 0xF7C6D9, 0xD6C9F0, 0xFFE9A8];
        const c = new THREE.Color();
        for (let k = 0; k < this.horseSlots.length; k++) this.horses.setColorAt(k, c.copy(lin(HC[k % HC.length])));
        this.horses.instanceColor.needsUpdate = true;
        this.root.add(this.horses);
    }

    // =====================================================================
    // Ayunan & jungkat-jungkit (bergerak)
    // =====================================================================
    buildPlaygroundMoving() {
        // Ayunan: pivot di palang atas (y = S+3.4), tali 2 + dudukan
        const swingGeo = mergeParts([
            { geo: new THREE.BoxGeometry(0.04, 2.7, 0.04), c: 0x8D96A0, x: -0.32, y: -1.35 },
            { geo: new THREE.BoxGeometry(0.04, 2.7, 0.04), c: 0x8D96A0, x: 0.32, y: -1.35 },
            { geo: new THREE.BoxGeometry(0.8, 0.08, 0.36), c: 0xFFFFFF, y: -2.74 }
        ]);
        this.swings = [];
        const SC = [0xE63946, 0x3E7CB8, 0xFFC93C, 0x6CC04A];
        for (const sw of this.swingSets) {
            for (let k = 0; k < 4; k++) this.swings.push({ x: sw.x - 3.6 + k * 2.4, z: sw.z, ph: k * 1.7 + sw.z * 0.1, amp: 0.25 + (k % 3) * 0.12 });
        }
        this.swingMesh = new THREE.InstancedMesh(swingGeo, this.vcMat, this.swings.length);
        this.swingMesh.frustumCulled = false;
        this.swingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const c = new THREE.Color();
        this.swings.forEach((s, k) => this.swingMesh.setColorAt(k, c.copy(lin(SC[k % SC.length]))));
        this.swingMesh.instanceColor.needsUpdate = true;
        this.root.add(this.swingMesh);

        // Jungkat-jungkit: papan sepanjang z, poros sumbu x setinggi 0,62
        const ssGeo = mergeParts([
            { geo: new THREE.BoxGeometry(0.42, 0.1, 4.2), c: 0xF2C230 },
            { geo: new THREE.BoxGeometry(0.5, 0.36, 0.08), c: 0x2F6FB5, y: 0.2, z: 1.75 },
            { geo: new THREE.BoxGeometry(0.5, 0.36, 0.08), c: 0x2F6FB5, y: 0.2, z: -1.75 },
            { geo: new THREE.BoxGeometry(0.6, 0.08, 0.06), c: 0xB8312A, y: 0.42, z: 1.75 },
            { geo: new THREE.BoxGeometry(0.6, 0.08, 0.06), c: 0xB8312A, y: 0.42, z: -1.75 }
        ]);
        this.seesawMesh = new THREE.InstancedMesh(ssGeo, this.vcMat, this.seesaws.length);
        this.seesawMesh.frustumCulled = false;
        this.seesawMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.seesaws.forEach((s, k) => this.seesawMesh.setColorAt(k, c.setRGB(1, 1, 1)));
        this.seesawMesh.instanceColor.needsUpdate = true;
        this.root.add(this.seesawMesh);
    }

    // =====================================================================
    // Kereta wisata mini (lokomotif + 4 gerbong), maju +x lokal
    // =====================================================================
    buildTrain() {
        const loco = mergeParts([
            { geo: new THREE.BoxGeometry(3.8, 0.35, 1.5), c: 0x2B2622, y: 0.55 },
            { geo: new THREE.CylinderGeometry(0.62, 0.62, 2.2, 10), c: 0x2E7D4F, x: 0.7, y: 1.3, rz: Math.PI / 2 },
            { geo: new THREE.CylinderGeometry(0.66, 0.66, 0.12, 10), c: 0xD9A527, x: 1.8, y: 1.3, rz: Math.PI / 2 },
            { geo: new THREE.CylinderGeometry(0.18, 0.26, 0.8, 8), c: 0x2B2622, x: 1.3, y: 2.2 },
            { geo: new THREE.BoxGeometry(1.4, 1.5, 1.5), c: 0xB8312A, x: -1.0, y: 1.45 },
            { geo: new THREE.BoxGeometry(1.7, 0.16, 1.7), c: 0x2B2622, x: -1.0, y: 2.28 },
            { geo: new THREE.BoxGeometry(0.06, 0.6, 1.0), c: 0xD8E8F0, x: -0.28, y: 1.7 },
            { geo: new THREE.BoxGeometry(0.4, 0.5, 1.5), c: 0xD9A527, x: 2.0, y: 0.45, rz: 0.5 },
            ...[-1.2, 0, 1.2].flatMap(x => [-0.6, 0.6].map(z => ({ geo: new THREE.CylinderGeometry(0.36, 0.36, 0.14, 10), c: 0xB8312A, x, y: 0.36, z, rx: Math.PI / 2 })))
        ]);
        const coach = mergeParts([
            { geo: new THREE.BoxGeometry(3.8, 0.3, 1.5), c: 0x2B2622, y: 0.5 },
            { geo: new THREE.BoxGeometry(3.8, 0.55, 1.5), c: 0xFFFFFF, y: 0.92 },
            { geo: new THREE.BoxGeometry(0.4, 0.4, 1.3), c: 0x7A4E2C, x: -0.9, y: 1.3 },
            { geo: new THREE.BoxGeometry(0.4, 0.4, 1.3), c: 0x7A4E2C, x: 0.9, y: 1.3 },
            ...[-1.8, 1.8].flatMap(x => [-0.68, 0.68].map(z => ({ geo: new THREE.BoxGeometry(0.1, 1.2, 0.1), c: 0xEADCC0, x, y: 1.8, z }))),
            { geo: new THREE.BoxGeometry(4.1, 0.14, 1.8), c: 0xFFFFFF, y: 2.45 },
            { geo: new THREE.BoxGeometry(4.15, 0.18, 1.85), c: 0xD9A527, y: 2.32 },
            ...[-1.2, 1.2].flatMap(x => [-0.6, 0.6].map(z => ({ geo: new THREE.CylinderGeometry(0.32, 0.32, 0.14, 10), c: 0x2B2622, x, y: 0.32, z, rx: Math.PI / 2 })))
        ]);
        this.locoMesh = new THREE.Mesh(loco, this.vcMatSolo);
        this.locoMesh.castShadow = true;
        this.locoMesh.frustumCulled = false;
        this.root.add(this.locoMesh);
        this.coachN = 4;
        this.coachMesh = new THREE.InstancedMesh(coach, this.vcMat, this.coachN);
        this.coachMesh.castShadow = true;
        this.coachMesh.frustumCulled = false;
        this.coachMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const CC = [0xF2C230, 0x6CC04A, 0x3E9BD8, 0xFF7EB6];
        const c = new THREE.Color();
        for (let k = 0; k < this.coachN; k++) this.coachMesh.setColorAt(k, c.copy(lin(CC[k])));
        this.coachMesh.instanceColor.needsUpdate = true;
        this.root.add(this.coachMesh);
        this.trainS = 40;
        this.trainPause = 0;
    }

    // =====================================================================
    // Kabin kereta gantung
    // =====================================================================
    buildCableCabins() {
        const geo = mergeParts([
            { geo: new THREE.BoxGeometry(0.08, 1.6, 0.08), c: 0x4C545E, y: -0.8 },
            { geo: new THREE.BoxGeometry(0.5, 0.2, 0.3), c: 0x4C545E, y: 0 },
            { geo: new THREE.BoxGeometry(1.5, 0.2, 1.7), c: 0xFFFFFF, y: -1.7 },
            { geo: new THREE.BoxGeometry(1.4, 1.0, 1.6), c: 0xFFFFFF, y: -2.3 },
            { geo: new THREE.BoxGeometry(1.44, 0.55, 1.64), c: 0xCFE6F0, y: -2.15 },
            { geo: new THREE.BoxGeometry(1.5, 0.15, 1.7), c: 0x4C545E, y: -2.85 }
        ]);
        this.cabinN = 10;
        this.cabins = new THREE.InstancedMesh(geo, this.vcMat, this.cabinN);
        this.cabins.frustumCulled = false;
        this.cabins.castShadow = true;
        this.cabins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const CC = [0xE63946, 0xFFC93C, 0x3E7CB8, 0x6CC04A, 0xFF8C42];
        const c = new THREE.Color();
        for (let k = 0; k < this.cabinN; k++) this.cabins.setColorAt(k, c.copy(lin(CC[k % CC.length])));
        this.cabins.instanceColor.needsUpdate = true;
        this.root.add(this.cabins);
        this.cableS = 0;
    }

    /** Posisi di kabel: s dalam [0, 2*span). Jalur pergi x+1.6 (S->N), pulang x-1.6 (N->S). */
    cablePos(s, out) {
        const { x, zS, zN, zP, hStation, hPylon } = CABLE;
        const span = zN - zS;
        s = ((s % (2 * span)) + 2 * span) % (2 * span);
        let z, dx;
        if (s < span) { z = zS + s; dx = 1.6; } else { z = zN - (s - span); dx = -1.6; }
        const h = z < zP
            ? hStation + (hPylon + 0.4 - hStation) * (z - zS) / (zP - zS)
            : hPylon + 0.4 + (hStation - hPylon - 0.4) * (z - zP) / (zN - zP);
        out.x = x + dx; out.y = h; out.z = z;
        return out;
    }

    // =====================================================================
    // Pengunjung: keluarga (2 dewasa + 1–2 anak) menyusuri jalan lingkar & promenade
    // =====================================================================
    buildVisitors() {
        const r = rng(4242);
        this.loops = [
            new Loop(ellipsePts(LAKE.x, LAKE.z, RING.rx, RING.rz, 140)),
            new Loop(roundRectPts(PROM))
        ];
        const SHIRT = [0xC0392B, 0x2E86C1, 0x27AE60, 0xF39C12, 0x8E44AD, 0x16A085, 0xD35400, 0xF4D03F, 0xEC7063, 0x5DADE2, 0xFFFFFF];
        const SKIN = [0x8D5A3B, 0xA8754F, 0xC08A5F, 0x7A4B30];
        const HIJAB = [0xE8DAEF, 0x1F618D, 0xF5B7B1, 0x2C3E50, 0xA9CCE3, 0xF9E79F];
        this.families = [];
        this.people = [];
        const famCount = [16, 18];
        famCount.forEach((n, li) => {
            const loop = this.loops[li];
            for (let f = 0; f < n; f++) {
                const fam = {
                    loop, s: (f / n) * loop.length + r() * 6, dir: r() < 0.5 ? 1 : -1,
                    speed: 0.8 + r() * 0.35, pause: 0, phase: r() * 6
                };
                fam.lane = fam.dir * (0.55 + r() * 0.2);
                const members = [
                    { kind: 'adult', lat: -0.32, along: 0 },
                    { kind: 'adult', lat: 0.32, along: 0, hijab: r() < 0.65 },
                    { kind: 'child', lat: 0.0, along: 0.9 }
                ];
                if (r() < 0.6) members.push({ kind: 'child', lat: 0.45, along: 0.7 });
                for (const m of members) {
                    const p = {
                        fam, lat: m.lat, along: m.along,
                        scale: m.kind === 'child' ? 0.6 + r() * 0.08 : 0.95 + r() * 0.1,
                        shirt: SHIRT[Math.floor(r() * SHIRT.length)],
                        skin: SKIN[Math.floor(r() * SKIN.length)],
                        hijab: m.hijab ? HIJAB[Math.floor(r() * HIJAB.length)] : 0,
                        phase: r() * 6
                    };
                    this.people.push(p);
                }
                this.families.push(fam);
            }
        });
        const N = this.people.length;
        const box = (w, h, d, ty) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, ty, 0); return g; };
        const lam = (opts) => new THREE.MeshLambertMaterial(opts);
        const make = (geo, mat, n) => {
            const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;
            m.castShadow = true;
            this.root.add(m);
            return m;
        };
        this.vLegL = make(box(0.14, 0.8, 0.16, -0.4), lam({ color: lin(0x2E3440) }), N);
        this.vLegR = make(box(0.14, 0.8, 0.16, -0.4), lam({ color: lin(0x2E3440) }), N);
        this.vTorso = make(box(0.44, 0.62, 0.26, 0.31), lam({ color: 0xffffff }), N);
        this.vHead = make(new THREE.SphereGeometry(0.14, 8, 6), lam({ color: 0xffffff }), N);
        const hijabN = this.people.filter(p => p.hijab).length;
        this.vHijab = make(new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), lam({ color: 0xffffff }), hijabN);
        this.vHijab.castShadow = false;
        this.vLegL.castShadow = this.vLegR.castShadow = false;   // kaki kecil: bayangan tak terlihat, hemat 2 draw call
        const c = new THREE.Color();
        let hi = 0;
        this.people.forEach((p, k) => {
            this.vTorso.setColorAt(k, c.copy(lin(p.shirt)));
            this.vHead.setColorAt(k, c.copy(lin(p.skin)));
            if (p.hijab) { p.hslot = hi; this.vHijab.setColorAt(hi++, c.copy(lin(p.hijab))); }
        });
        [this.vTorso, this.vHead, this.vHijab].forEach(m => { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }

    // =====================================================================
    // Cahaya malam (Points additive)
    // =====================================================================
    buildGlow() {
        const pos = [];
        for (const [x, y, z] of this.lampHeads) pos.push(x, y, z);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        this.glowMat = new THREE.PointsMaterial({
            map: glowTex(), color: 0xFFD08A, size: 4.2, sizeAttenuation: true,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.glow = new THREE.Points(geo, this.glowMat);
        this.glow.visible = false;
        this.glow.frustumCulled = true;

        // Pendar warna-warni yang ikut berputar (anak grup bianglala & komidi putar)
        const tex = this.glowMat.map;
        const ring = (parent, pts, size) => {
            const p = [], col = [];
            const c = new THREE.Color();
            pts.forEach(([x, y, z], k) => {
                p.push(x, y, z);
                c.setHSL((k / pts.length) * 3 % 1, 0.9, 0.6);
                col.push(c.r, c.g, c.b);
            });
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            const m = new THREE.PointsMaterial({
                map: tex, size, sizeAttenuation: true, vertexColors: true,
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
            });
            const pts3 = new THREE.Points(g, m);
            pts3.visible = false;
            parent.add(pts3);
            return pts3;
        };
        const R = FERRIS.R, fp = [];
        for (let k = 0; k < 48; k++) {
            const a = (k / 48) * Math.PI * 2;
            fp.push([k % 2 ? 1.62 : -1.62, Math.sin(a) * R, Math.cos(a) * R]);
        }
        for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            fp.push([1.6, Math.sin(a) * R * 0.62, Math.cos(a) * R * 0.62]);
        }
        this.ferrisGlow = ring(this.ferrisRot, fp, 2.6);
        const cp = [];
        for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            cp.push([Math.cos(a) * 8.45, 4.85, Math.sin(a) * 8.45]);
        }
        this.carouselGlow = ring(this.carouselRot, cp, 2.2);
        this.root.add(this.glow);
    }

    // =====================================================================
    // Siang / malam
    // =====================================================================
    setNight(isNight) {
        this.isNight = !!isNight;
        const M = this.M;
        M.lamp.color.copy(lin(isNight ? 0xFFE6A8 : 0xC9C2B4));
        M.aviation.color.copy(lin(isNight ? 0xFF3B30 : 0x7A2A26));
        if (!isNight) {
            M.bulbA.color.copy(lin(0xE8DCC8));
            M.bulbB.color.copy(lin(0xE8DCC8));
        }
        this.glow.visible = this.isNight;
        this.ferrisGlow.visible = this.carouselGlow.visible = this.isNight;
    }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        // Target kamera harus bisa mencapai tengah taman (clampTarget simetris ±maxPan)
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 420);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-park')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-park';
            btn.title = 'Fokus ke Taman Budaya Nusantara AUDIRA (barat Desa Have)';
            btn.textContent = '🎡 Taman';
            group.insertBefore(btn, group.firstChild);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            // Tombol preset lain -> lepas status aktif tombol taman
            document.querySelectorAll('.btn-view:not(.btn-zone-park)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    /** Arahkan kamera ke taman: dari tenggara, menghadap barat laut. */
    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(-385, 0, 10);
        const a = 120 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 30 * Math.PI / 180;
        cam.distanceDesired = 170;
    }

    // =====================================================================
    // Update per frame
    // =====================================================================
    /**
     * InstancedMesh bergerak memakai koordinat dunia di matriks instance, jadi bounding sphere
     * geometrinya diganti dengan bola yang menutup seluruh area geraknya. Dengan begitu frustum
     * culling (kamera & bayangan) tetap jalan: taman tidak menambah draw call saat kamera di kota.
     */
    setupCulling() {
        const cull = (mesh, x, y, z, r) => {
            mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), r);
            mesh.frustumCulled = true;
        };
        cull(this.gondolas, FERRIS.x, FERRIS.hub, FERRIS.z, FERRIS.R + 4);
        cull(this.horses, CAROUSEL.x, 3, CAROUSEL.z, 10);
        cull(this.swingMesh, -420, 2, 108, 22);
        cull(this.seesawMesh, -418, 1, 108, 32);
        cull(this.coachMesh, (TRACK.x0 + TRACK.x1) / 2, 1, (TRACK.z0 + TRACK.z1) / 2, 185);
        cull(this.cabins, CABLE.x, 12, (CABLE.zS + CABLE.zN) / 2, 82);
        const cx = (PARK.x0 + PARK.x1) / 2, cz = (PARK.z0 + PARK.z1) / 2;
        for (const m of [this.vLegL, this.vLegR, this.vTorso, this.vHead, this.vHijab]) cull(m, cx, 1, cz, 180);
        this.locoMesh.frustumCulled = true;   // geometri lokal: bounding sphere bawaan sudah benar
        // Detail kecil yang disembunyikan bila kamera jauh dari taman (LOD jarak)
        this.detailMeshes = [this.vLegL, this.vLegR, this.vTorso, this.vHead, this.vHijab, this.swingMesh, this.seesawMesh, this.horses];
        this.far = false;
    }

    update(dt) {
        this.time += dt;
        const t = this.time;
        const camPos = this.cityCamera && this.cityCamera.camera && this.cityCamera.camera.position;
        const far = camPos ? Math.hypot(camPos.x - (PARK.x0 + PARK.x1) / 2, camPos.z - (PARK.z0 + PARK.z1) / 2) > 360 : false;
        if (far !== this.far) {
            this.far = far;
            for (const m of this.detailMeshes) m.visible = !far;
        }
        const d = this._d || (this._d = new THREE.Object3D());
        const set = (mesh, idx, x, y, z, rx, ry, rz, s = 1) => {
            d.position.set(x, y, z);
            d.rotation.set(rx, ry, rz, 'YXZ');
            d.scale.set(s, s, s);
            d.updateMatrix();
            mesh.setMatrixAt(idx, d.matrix);
        };

        // --- Bianglala: 1 putaran ±70 dtk ---
        const wa = t * 0.09;
        this.ferrisRot.rotation.x = wa;
        const { x: fx, z: fz, hub, R } = FERRIS;
        for (let k = 0; k < this.gondolaN; k++) {
            const a = (k / this.gondolaN) * Math.PI * 2 - wa;
            const sway = Math.sin(t * 1.3 + k) * 0.04;
            set(this.gondolas, k, fx, hub + Math.sin(a) * R, fz + Math.cos(a) * R, sway, 0, 0);
        }
        this.gondolas.instanceMatrix.needsUpdate = true;

        // --- Komidi putar ---
        const ca = t * 0.42;
        this.carouselRot.rotation.y = ca;
        for (let k = 0; !far && k < this.horseSlots.length; k++) {
            const h = this.horseSlots[k];
            const a = h.a - ca;     // rotasi y positif: (cos a, sin a) -> sudut a - ca pada bidang xz (z dibalik)
            const x = CAROUSEL.x + Math.cos(a) * h.rad;
            const z = CAROUSEL.z + Math.sin(a) * h.rad;
            const bob = Math.sin(t * 2.2 + h.ph) * 0.35;
            // Arah gerak = garis singgung (berlawanan jarum jam dilihat dari atas)
            set(this.horses, k, x, S + 0.5 + 0.18 + 1.9 + bob, z, 0, Math.PI / 2 - a, Math.sin(t * 2.2 + h.ph) * 0.12);
        }
        this.horses.instanceMatrix.needsUpdate = true;

        // --- Ayunan ---
        if (!far) this.swings.forEach((s, k) => {
            set(this.swingMesh, k, s.x, S + 3.4, s.z, Math.sin(t * 1.9 + s.ph) * s.amp, 0, 0);
        });
        this.swingMesh.instanceMatrix.needsUpdate = true;

        // --- Jungkat-jungkit ---
        const maxTilt = Math.atan2(0.5, 2.1);
        if (!far) this.seesaws.forEach((s, k) => {
            const tilt = Math.max(-1, Math.min(1, Math.sin(t * 1.4 + k * 2.1) * 1.4)) * maxTilt;
            set(this.seesawMesh, k, s.x, S + 0.62, s.z, tilt, 0, 0);
        });
        this.seesawMesh.instanceMatrix.needsUpdate = true;

        // --- Kereta mini: berhenti sebentar di stasiun ---
        const loop = this.trackLoop;
        const o = this._o || (this._o = {});
        if (this.trainPause > 0) this.trainPause -= dt;
        else {
            const prev = this.trainS;
            this.trainS += dt * 4.2;
            // Stasiun di sisi timur (x = TRACK.x1, z ≈ 18)
            const stopS = this._stopS ?? (this._stopS = this.findTrackS(TRACK.x1, 18));
            const L = loop.length;
            const crossed = ((prev - stopS) % L + L) % L > ((this.trainS - stopS) % L + L) % L;
            if (crossed) this.trainPause = 6;
        }
        const placeCar = (mesh, idx, s) => {
            const p = loop.sample(s, o);
            const ry = Math.atan2(-p.dz, p.dx);
            d.position.set(p.x, S + 0.08, p.z);
            d.rotation.set(0, ry, 0);
            d.scale.set(1, 1, 1);
            d.updateMatrix();
            if (idx < 0) { mesh.position.copy(d.position); mesh.rotation.copy(d.rotation); }
            else mesh.setMatrixAt(idx, d.matrix);
        };
        placeCar(this.locoMesh, -1, this.trainS);
        for (let k = 0; k < this.coachN; k++) placeCar(this.coachMesh, k, this.trainS - 4.6 * (k + 1));
        this.coachMesh.instanceMatrix.needsUpdate = true;

        // --- Kereta gantung ---
        this.cableS += dt * 2.6;
        const span2 = 2 * (CABLE.zN - CABLE.zS);
        const cp = this._cp || (this._cp = {});
        for (let k = 0; k < this.cabinN; k++) {
            this.cablePos(this.cableS + (k / this.cabinN) * span2, cp);
            set(this.cabins, k, cp.x, cp.y, cp.z, Math.sin(t * 1.1 + k) * 0.03, 0, 0);
        }
        this.cabins.instanceMatrix.needsUpdate = true;

        // --- Pengunjung ---
        for (const f of this.families) {
            if (f.pause > 0) { f.pause -= dt; f.moving = false; }
            else {
                f.s += f.dir * f.speed * dt;
                f.moving = true;
                if (Math.random() < dt * 0.015) f.pause = 3 + Math.random() * 5;
            }
        }
        const baseY = S + 0.04;
        let hk = 0;
        for (let k = 0; !far && k < this.people.length; k++) {
            const p = this.people[k];
            const f = p.fam;
            const q = f.loop.sample(f.s + f.dir * p.along, o);
            const nx = -q.dz, nz = q.dx;             // normal kiri jalur
            const lat = f.lane + p.lat * f.dir;
            const x = q.x + nx * lat, z = q.z + nz * lat;
            const ry = Math.atan2(q.dx * f.dir, q.dz * f.dir);
            const sc = p.scale;
            const ph = (t + p.phase) * (f.moving ? 5.4 : 0) + p.phase;
            const swing = f.moving ? Math.sin(ph) * 0.45 : 0;
            const bob = f.moving ? Math.abs(Math.sin(ph)) * 0.04 * sc : 0;
            const hipY = baseY + 0.8 * sc + bob;
            const cx = Math.cos(ry) * 0.1 * sc, cz = -Math.sin(ry) * 0.1 * sc;
            set(this.vLegL, k, x - cx, hipY, z - cz, swing, ry, 0, sc);
            set(this.vLegR, k, x + cx, hipY, z + cz, -swing, ry, 0, sc);
            set(this.vTorso, k, x, hipY, z, 0, ry, 0, sc);
            const headY = hipY + 0.76 * sc;
            set(this.vHead, k, x, headY, z, 0, ry, 0, sc);
            if (p.hijab) { set(this.vHijab, p.hslot, x, headY - 0.06 * sc, z, 0, ry, 0, sc); hk++; }
        }
        [this.vLegL, this.vLegR, this.vTorso, this.vHead, this.vHijab].forEach(m => { m.instanceMatrix.needsUpdate = true; });

        // --- Lampu bianglala & komidi putar (malam): kejar-kejaran berganti warna ---
        if (this.isNight) {
            const on = Math.floor(t * 2.5) % 2 === 0;
            const hue = (t * 0.05) % 1;
            const cA = this._cA || (this._cA = new THREE.Color());
            if (!this._dim) this._dim = lin(0x5A4A3A);
            cA.setHSL(hue, 0.95, 0.62);
            this.M.bulbA.color.copy(on ? cA : this._dim);
            cA.setHSL((hue + 0.5) % 1, 0.95, 0.62);
            this.M.bulbB.color.copy(!on ? cA : this._dim);
            this.M.aviation.color.copy(lin(Math.floor(t * 1.2) % 2 ? 0xFF3B30 : 0x5A1A16));
            this.glowMat.size = 4.2 + Math.sin(t * 3.1) * 0.15;
            this.ferrisGlow.material.size = on ? 2.9 : 2.2;   // berdenyut seirama lampu kejar
            this.carouselGlow.material.size = on ? 2.0 : 2.5;
        }
    }

    findTrackS(x, z) {
        const loop = this.trackLoop, o = {};
        let best = 0, bd = Infinity;
        for (let s = 0; s < loop.length; s += 0.5) {
            const p = loop.sample(s, o);
            const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
            if (dd < bd) { bd = dd; best = s; }
        }
        return best;
    }
}
