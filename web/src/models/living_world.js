/**
 * AUDIRA-LAND FASE C: Dunia Hidup
 *  - Pejalan kaki berbaju batik (pola kawung) & lurik (garis) di trotoar jalan kolektor.
 *    Semua orang = 6 InstancedMesh (kaki kiri/kanan, badan batik, badan lurik, kepala, peci/caping),
 *    kaki berayun & badan naik-turun mengikuti langkah.
 *  - Asap tipis dari cerobong warung/pasar/rumah: puff low-poly membesar & naik terbawa angin (1 draw call).
 *  - Lampu teplok di depan rumah Desa Have-Not, menyala & berkedip lembut saat malam (1 draw call).
 *
 * Total tambahan ±8 draw call, berapa pun jumlah orangnya.
 *
 * Ciri khas desa (village_identity.js, spek docs/SPEC_CIRI_KHAS_DESA.md):
 *  - Pejalan kaki memakai peran desa tempat jalurnya berada. Desa Have: pekerja kantoran (tas), pedagang toko,
 *    pelajar berseragam (putih-abu + ransel), pelari pagi. Desa Have-Not: petani (caping + cangkul), ibu
 *    menggendong bakul, anak main layangan, penjual jamu gendong. Aksesori & warna seragam DILEBUR ke frame
 *    jalan model (1 InstancedMesh per peran, tetap 8 draw call).
 *  - Kepadatan per jam dari VILLAGE_IDENTITY.<desa>.density (Have ramai siang; Have-Not ramai pagi & sore).
 *  - IdleScenes: kegiatan diam (warga duduk di kafe & bangku taman, ronda malam, ibu menjemur, ibu-ibu
 *    ngobrol di depan warung) = figur statis dilebur bakeStatic, 1 draw call per kelompok waktu.
 */

import { GRID_CONFIG } from '../core/constants.js';
import { roadRuns, isRiverTile } from '../core/road_network.js';
import { PF, pfWalkFrames, pfLiveMaterial, WALK_FRAMES } from './polyfork_library.js';
import { bakeStatic } from '../core/static_batcher.js';
import { VILLAGE_IDENTITY, villageIdAtX } from '../core/village_identity.js';

const T = GRID_CONFIG.TILE_SIZE;
const HALF = GRID_CONFIG.HALF_TILES;
const wx = a => (a - HALF) * T;
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

function canvasTex(draw, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

// Pola batik kawung (abu-abu, diwarnai lewat instanceColor)
const batikTex = () => canvasTex((g, s) => {
    g.fillStyle = '#f2ece0';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#5a4a3a';
    const q = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * q + q / 2, cy = y * q + q / 2;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            g.beginPath();
            g.ellipse(cx + dx * q * 0.22, cy + dy * q * 0.22, q * 0.18, q * 0.1, dx ? 0 : Math.PI / 2, 0, Math.PI * 2);
            g.fill();
        }
        g.fillRect(cx - 1, cy - 1, 2, 2);
    }
});

// Lurik: garis vertikal tipis-tebal
const lurikTex = () => canvasTex((g, s) => {
    g.fillStyle = '#ece6da';
    g.fillRect(0, 0, s, s);
    const widths = [3, 1, 1, 5, 1, 2, 1, 4];
    let x = 0, k = 0;
    while (x < s) {
        g.fillStyle = k % 2 ? '#3d3328' : '#7a6a58';
        g.fillRect(x, 0, widths[k % widths.length], s);
        x += widths[k % widths.length] + 3;
        k++;
    }
});

const glowTex = () => canvasTex((g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,220,150,0.7)');
    r.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
});

const BATIK_COLORS = [0x8A4B22, 0x2F3E6B, 0x6B2730, 0x9C6B2E, 0x3E5A3A, 0x5B3A24];
const LURIK_COLORS = [0x6B5A44, 0x4A5C6A, 0x7A4E3A, 0x55603F];
const SKIN = [0x8D5A3B, 0xA8754F, 0xC08A5F, 0x7A4B30];

// =============================================================================
// PERAN WARGA PER DESA (aksesori + warna baju dilebur ke frame jalan Polyfork)
// =============================================================================
// Model menghadap -Z; punggung = +Z. Satuan meter pada ukuran asli model (dewasa ±1,75 m, anak ±1,2 m).
/**
 * Jarak orbit kamera (m) di atas ini pejalan kaki Polyfork disembunyikan. Tampilan awal (170) dan preset
 * "far" (150) = overview kota, warga di sana hanya ±13 px; preset have/havenot/river (60-85) tetap tampil.
 */
export const PED_LOD_DIST = 140;

export const ROLE_MODELS = {
    kantoran: { id: 'city-commuter-52a53f', acc: 'tas' },
    pedagang_toko: { id: 'street-vendor-139de3' },
    pelajar: { id: 'student-in-a-hoodie-7c8223', recolor: ['seragam', 0xF2F2EE, 0x6B7078], acc: 'ransel' },
    pelari: { id: 'suburban-resident-a9db9c', recolor: ['olahraga', 0x2E86C1, 0x22262B], speed: 2.3 },
    petani: { id: 'farmer-363820', acc: 'cangkul' },
    nelayan: { id: 'hanga-roa-fisherman-e56812' },
    polisi: { id: 'police-officer-1cc379' },
    dokter: { id: 'doctor-d49de0' },
    guru: { id: 'school-teacher-8b8bfc', acc: 'tas' },
    ibu_bakul: { id: 'passenger-ac425a', recolor: ['kebaya', 0x8E3B46, 0x6B4A2E], acc: 'bakul' },
    anak_layangan: { id: 'kite-kid-0a7d70', acc: 'layangan', kid: true },
    jamu_gendong: { id: 'passenger-ac425a', recolor: ['kebaya', 0xE3C46A, 0x5B3A24], acc: 'jamu' }
};

/** Gabungkan geometri (position, normal, color; ber-index) jadi satu BufferGeometry. */
function mergeGeos(list) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let vo = 0, io = 0;
    for (const g of list) {
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, vo * 3);
        nor.set(g.attributes.normal.array, vo * 3);
        col.set(g.attributes.color.array, vo * 3);
        if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
        else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
        vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
}

/** Potongan aksesori berwarna (vertex color) pada posisi/rotasi/skala model. */
function accPart(geo, hex, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, quat = null) {
    const g = geo.clone();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4();
    const q = quat || new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    const c = lin(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
}

/** Batang tipis dari titik a ke b (tali layangan, gagang cangkul). */
function accRod(hex, a, b, r) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    return accPart(new THREE.CylinderGeometry(r, r, 1, 5), hex, mid.x, mid.y, mid.z, 0, 0, 0, 1, len, 1, q);
}

function buildAccessory(kind, top) {
    const B = new THREE.BoxGeometry(1, 1, 1), C = new THREE.CylinderGeometry(1, 1, 1, 10), K = new THREE.ConeGeometry(1, 1, 12);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    switch (kind) {
        case 'tas': return [accPart(B, 0x3A2A1E, 0.32, 0.86, 0.0, 0, 0, 0, 0.08, 0.28, 0.36)];
        case 'ransel': return [accPart(B, 0x2B4C8C, 0, 1.18, 0.22, 0, 0, 0, 0.34, 0.42, 0.16)];
        case 'caping_cangkul': return [
            accPart(K, 0xD8B46A, 0, top + 0.06, 0, 0, 0, 0, 0.36, 0.16, 0.36),
            accRod(0x7A5232, V(0.24, 0.95, -0.35), V(0.22, 1.62, 0.45), 0.025),
            accPart(B, 0x8A9096, 0.22, 1.68, 0.52, 0.5, 0, 0, 0.2, 0.03, 0.22)
        ];
        // Model petani bercaping (farmer-363820) sudah memakai caping: cukup cangkul di bahu
        case 'cangkul': return [
            accRod(0x7A5232, V(0.24, 0.95, -0.35), V(0.22, 1.62, 0.45), 0.025),
            accPart(B, 0x8A9096, 0.22, 1.68, 0.52, 0.5, 0, 0, 0.2, 0.03, 0.22)
        ];
        case 'bakul': return [
            accPart(C, 0xB08850, 0, 1.12, 0.3, 0, 0, 0, 0.23, 0.3, 0.23),
            accPart(B, 0x9C3B2E, 0, 1.24, 0.06, 0, 0, 0.6, 0.08, 0.72, 0.44)
        ];
        case 'jamu': return [
            accPart(C, 0xA77B45, 0, 1.08, 0.32, 0, 0, 0, 0.27, 0.28, 0.27),
            ...[[-0.1, -0.08], [0.1, -0.08], [-0.1, 0.1], [0.1, 0.1]].map(([dx, dz], k) =>
                accPart(C, k % 2 ? 0xE0A93B : 0x7A4E2A, dx, 1.34, 0.32 + dz, 0, 0, 0, 0.045, 0.24, 0.045)),
            accPart(B, 0x3B6E4A, 0, 1.24, 0.06, 0, 0, 0.6, 0.08, 0.72, 0.44)
        ];
        case 'layangan': {
            const kite = V(0.9, 4.2, -2.4);
            return [
                accPart(B, 0xD94F3D, kite.x, kite.y, kite.z, 0.35, 0, Math.PI / 4, 0.55, 0.55, 0.02),
                accPart(B, 0xF2E6C9, kite.x, kite.y - 0.55, kite.z + 0.1, 0, 0, 0, 0.04, 0.6, 0.02),
                accRod(0xEDEDED, V(0.2, 0.95, -0.25), kite, 0.008)
            ];
        }
        default: return [];
    }
}

/** Ganti warna baju (bukan kulit) per pita tinggi: atas = baju, bawah = celana/jarik. */
function recolorFrame(g, [, topHex, botHex], top) {
    const p = g.attributes.position, c = g.attributes.color;
    const T1 = lin(topHex), T2 = lin(botHex);
    const chest = top * 0.54, shoe = top * 0.07;
    for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
        const skin = r > 0.18 && r > gg * 1.35 && gg > b * 1.2;
        if (skin || y > top * 0.86 || y < shoe) continue;   // kepala/rambut & sepatu tetap
        const t = y >= chest ? T1 : T2;
        c.setXYZ(i, t.r, t.g, t.b);
    }
    c.needsUpdate = true;
}

/** Frame jalan per peran (8 geometri) = frame model + warna peran + aksesori. Null bila model belum termuat. */
function roleFrames(role) {
    const R = ROLE_MODELS[role];
    const frames = R && pfWalkFrames(R.id);
    if (!frames) return null;
    frames[0].computeBoundingBox();
    const top = frames[0].boundingBox.max.y;
    const acc = R.acc ? buildAccessory(R.acc, top) : [];
    return frames.map(f => {
        const g = new THREE.BufferGeometry();
        for (const k of ['position', 'normal', 'color']) g.setAttribute(k, f.attributes[k].clone());
        if (f.index) g.setIndex(f.index.clone());
        if (R.recolor) recolorFrame(g, R.recolor, top);
        return acc.length ? mergeGeos([g, ...acc]) : g;
    });
}

// =============================================================================
// PEJALAN KAKI
// =============================================================================
export class Pedestrians {
    /** Pengali jumlah pejalan kaki (0..1) mengikuti jumlah warga terdaftar; diatur main.js applyCrowd(). */
    crowd = 1;
    constructor(scene, count = 140) {
        this.group = new THREE.Group();
        this.group.name = 'living_pedestrians';
        scene.add(this.group);
        const r = rng(777);

        // Jalur trotoar di kedua sisi setiap ruas kolektor vertikal (peta jalan 2D, tidak di koridor sungai).
        // Tiap jalur hanya sepanjang ruasnya sendiri, jadi orang tidak berjalan menembus kavling.
        this.lanes = [];
        const sidewalkOff = GRID_CONFIG.ROAD_COLLECTOR_WIDTH / 2 + GRID_CONFIG.SIDEWALK_WIDTH / 2;
        for (const run of roadRuns().v) {
            if (run.cls !== 2 || isRiverTile(run.i)) continue;
            const cx = wx(run.i) + T / 2;
            const zMin = wx(run.j0) + 2, zMax = wx(run.j1) + T - 2;
            if (zMax - zMin < 4) continue;
            this.lanes.push({ x: cx - sidewalkOff, zMin, zMax }, { x: cx + sidewalkOff, zMin, zMax });
        }
        const laneLen = this.lanes.reduce((s, l) => s + (l.zMax - l.zMin), 0);
        const pickLane = u => {           // peluang sebanding panjang jalur
            let acc = u * laneLen;
            for (const l of this.lanes) { acc -= l.zMax - l.zMin; if (acc <= 0) return l; }
            return this.lanes[this.lanes.length - 1];
        };

        // Desa tiap jalur (sisi sungai) -> peran warga dari VILLAGE_IDENTITY
        for (const l of this.lanes) l.village = villageIdAtX(l.x);
        this.hourFn = () => 12;   // diisi main.js (jam game) untuk kepadatan per jam

        // Karakter Polyfork bila termuat (fallback: figur prosedural di bawah)
        if (PF.people.some(id => pfWalkFrames(id))) { this.initPolyfork(Math.min(count, 96), r, pickLane); return; }

        const box = (w, h, d, ty) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, ty, 0); return g; };
        const legGeo = box(0.13, 0.8, 0.15, -0.4);             // poros di pinggul
        const torsoGeo = box(0.42, 0.6, 0.24, 0.3);
        const headGeo = new THREE.SphereGeometry(0.13, 8, 6);
        const capGeo = new THREE.CylinderGeometry(0.115, 0.12, 0.1, 8);

        const lam = (opts) => new THREE.MeshLambertMaterial(opts);
        const make = (geo, mat, n) => {
            const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;
            m.castShadow = true;
            this.group.add(m);
            return m;
        };

        this.people = [];
        for (let k = 0; k < count && this.lanes.length; k++) {
            const lane = pickLane(r());
            this.people.push({
                lane,
                x: lane.x + (r() - 0.5) * 0.5,
                z: lane.zMin + r() * (lane.zMax - lane.zMin),
                dir: r() < 0.5 ? 1 : -1,
                speed: 0.9 + r() * 0.6,
                phase: r() * Math.PI * 2,
                lurik: r() < 0.4,
                cap: r() < 0.5 ? 'peci' : 'caping',
                shirt: 0, skin: SKIN[Math.floor(r() * SKIN.length)],
                pause: 0
            });
        }
        const batikN = this.people.filter(p => !p.lurik).length;
        const lurikN = this.people.length - batikN;
        this.legL = make(legGeo, lam({ color: lin(0x2B2620) }), this.people.length);
        this.legR = make(legGeo, lam({ color: lin(0x2B2620) }), this.people.length);
        this.batik = make(torsoGeo, lam({ map: batikTex() }), batikN);
        this.lurik = make(torsoGeo, lam({ map: lurikTex() }), lurikN);
        this.head = make(headGeo, lam({ color: 0xffffff }), this.people.length);
        this.capPeci = make(capGeo, lam({ color: lin(0x1E1B19) }), this.people.length);

        const c = new THREE.Color();
        let bi = 0, li = 0;
        this.people.forEach((p, k) => {
            if (p.lurik) { p.slot = li++; this.lurik.setColorAt(p.slot, c.copy(lin(LURIK_COLORS[k % LURIK_COLORS.length]))); }
            else { p.slot = bi++; this.batik.setColorAt(p.slot, c.copy(lin(BATIK_COLORS[k % BATIK_COLORS.length]))); }
            this.head.setColorAt(k, c.copy(lin(p.skin)));
        });
        [this.batik, this.lurik, this.head].forEach(m => { if (m.instanceColor) m.instanceColor.needsUpdate = true; });

        this.dummy = new THREE.Object3D();
        this.time = 0;
        this.update(0);
    }

    /**
     * Pejalan kaki = karakter Polyfork dengan siklus jalan dibake (8 frame), 1 InstancedMesh per PERAN.
     * Peran dipilih dari desa jalur (VILLAGE_IDENTITY.<desa>.walkerRoles), bergiliran per desa.
     */
    initPolyfork(count, r, pickLane) {
        this.pf = true;
        this.people = [];
        const frames = new Map();
        for (const v of Object.values(VILLAGE_IDENTITY)) for (const role of v.walkerRoles) {
            const f = roleFrames(role);
            if (f) frames.set(role, f);
        }
        const perRole = new Map([...frames.keys()].map(k => [k, 0]));
        const turn = { have: 0, have_not: 0 };
        for (let k = 0; k < count && this.lanes.length; k++) {
            const lane = pickLane(r());
            const roles = VILLAGE_IDENTITY[lane.village].walkerRoles.filter(x => frames.has(x));
            if (!roles.length) continue;
            const role = roles[turn[lane.village]++ % roles.length];
            const R = ROLE_MODELS[role];
            const h = R.kid ? 1.05 + r() * 0.15 : 1.55 + r() * 0.2;
            this.people.push({
                lane, id: role, slot: perRole.get(role),
                village: lane.village,
                rank: r(),                           // tampil bila rank < kepadatan desa jam ini
                x: lane.x + (r() - 0.5) * 0.5,
                z: lane.zMin + r() * (lane.zMax - lane.zMin),
                dir: r() < 0.5 ? 1 : -1,
                speed: R.speed || (R.kid ? 1.0 : 1.15),   // laju disamakan per peran agar langkah = frame animasi
                phase: r() * Math.PI * 2,
                s: h / (R.kid ? 1.18 : 1.72),        // frame dibake berukuran asli (dewasa ±1,72 m, anak ±1,18 m)
                pause: 0
            });
            perRole.set(role, perRole.get(role) + 1);
        }
        this.pfMeshes = new Map();
        for (const [id, f] of frames) {
            const n = perRole.get(id);
            if (!n) continue;
            const m = new THREE.InstancedMesh(f[0], pfLiveMaterial(), n);
            m.userData.frames = f;
            m.userData.cycle = 0.9 * 1.15 / (ROLE_MODELS[id].speed || 1.15);   // pelari: langkah lebih cepat
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;
            m.castShadow = true;
            m.name = `pf_person_${id}`;
            this.pfMeshes.set(id, m);
            this.group.add(m);
        }
        this.dummy = new THREE.Object3D();
        this.time = 0;
        this.update(0);
    }

    updatePolyfork(dt, camDist = 0) {
        // LOD: di atas PED_LOD_DIST (tampilan awal kota, 170 m) warga tinggal beberapa piksel.
        // Sembunyikan 12 InstancedMesh peran -> hemat 12 draw call; simulasi dijeda selama itu.
        const far = camDist > PED_LOD_DIST;
        if (far !== this.far) {
            this.far = far;
            for (const m of this.pfMeshes.values()) m.visible = !far;
        }
        if (far) return;
        const d = this.dummy;
        this.time += dt;
        const baseY = GRID_CONFIG.SURFACE_Y + 0.08;   // di atas trotoar (zero-submerging)
        const hour = this.hourFn();
        const dens = { have: VILLAGE_IDENTITY.have.density(hour), have_not: VILLAGE_IDENTITY.have_not.density(hour) };
        for (const p of this.people) {
            p.z += p.dir * p.speed * dt;
            if (p.z > p.lane.zMax) { p.z = p.lane.zMax; p.dir = -1; }
            if (p.z < p.lane.zMin) { p.z = p.lane.zMin; p.dir = 1; }
            d.position.set(p.x, baseY, p.z);
            d.rotation.set(0, p.dir > 0 ? Math.PI : 0, 0);   // karakter Polyfork menghadap -Z
            // Kepadatan per jam: warga di luar kuota jam ini disembunyikan (skala 0, tetap 1 draw call)
            d.scale.setScalar(p.rank < dens[p.village] * this.crowd ? p.s : 0.0001);
            d.updateMatrix();
            this.pfMeshes.get(p.id).setMatrixAt(p.slot, d.matrix);
        }
        // Satu siklus jalan ±0,9 dtk; tiap model mulai di fase berbeda supaya tidak serempak
        let k = 0;
        for (const m of this.pfMeshes.values()) {
            const f = Math.floor((this.time / (m.userData.cycle || 0.9) * WALK_FRAMES) + k * 3) % WALK_FRAMES;
            m.geometry = m.userData.frames[f];
            m.instanceMatrix.needsUpdate = true;
            k++;
        }
    }

    update(dt, camDist = 0) {
        if (this.pf) return this.updatePolyfork(dt, camDist);
        this.time += dt;
        const d = this.dummy;
        const set = (mesh, idx, x, y, z, rx, ry, sx = 1, sy = 1, sz = 1) => {
            d.position.set(x, y, z);
            d.rotation.set(rx, ry, 0, 'YXZ');
            d.scale.set(sx, sy, sz);
            d.updateMatrix();
            mesh.setMatrixAt(idx, d.matrix);
        };
        const baseY = GRID_CONFIG.SURFACE_Y + 0.08;   // di atas trotoar (zero-submerging)

        for (let k = 0; k < this.people.length; k++) {
            const p = this.people[k];
            // Sesekali berhenti sebentar (ngobrol / lihat warung)
            if (p.pause > 0) p.pause -= dt;
            else {
                p.z += p.dir * p.speed * dt;
                p.phase += dt * p.speed * 5.2;
                if (Math.random() < dt * 0.02) p.pause = 2 + Math.random() * 4;
            }
            if (p.z > p.lane.zMax) { p.z = p.lane.zMax; p.dir = -1; }
            if (p.z < p.lane.zMin) { p.z = p.lane.zMin; p.dir = 1; }

            const yaw = p.dir > 0 ? 0 : Math.PI;
            const walking = p.pause <= 0;
            const swing = walking ? Math.sin(p.phase) * 0.5 : 0;
            const bob = walking ? Math.abs(Math.cos(p.phase)) * 0.035 : 0;
            const hip = baseY + 0.8 + bob;
            const side = Math.cos(yaw);          // arah kiri/kanan relatif hadap
            set(this.legL, k, p.x - 0.09 * side, hip, p.z, swing, yaw);
            set(this.legR, k, p.x + 0.09 * side, hip, p.z, -swing, yaw);
            set(p.lurik ? this.lurik : this.batik, p.slot, p.x, hip, p.z, 0, yaw);
            set(this.head, k, p.x, hip + 0.74, p.z, 0, yaw);
            if (p.cap === 'peci') set(this.capPeci, k, p.x, hip + 0.86, p.z, 0, yaw);
            else set(this.capPeci, k, p.x, hip + 0.83, p.z, 0, yaw, 2.6, 0.9, 2.6); // caping lebar
        }
        for (const m of [this.legL, this.legR, this.batik, this.lurik, this.head, this.capPeci]) m.instanceMatrix.needsUpdate = true;
    }
}

// =============================================================================
// KEGIATAN DIAM (figur statis, dilebur bakeStatic: 1 draw call per kelompok waktu)
// =============================================================================
const KAFE_TYPES = new Set(['kafe', 'resto', 'warung_kopi']);
const WARUNG_TYPES = new Set(['warung', 'warung_kopi', 'warung_madura', 'toko', 'pasar']);

export class IdleScenes {
    /**
     * @param {THREE.Scene} scene
     * @param {object[]} buildings  data bangunan (worldX, worldZ, type, facing, width, height)
     * @param {{benches?:object[], jemuran?:object[]}} spots  titik dari CityGrid.buildVillageDecor
     */
    constructor(scene, buildings, spots = {}) {
        this.root = new THREE.Group();
        this.root.name = 'idle_scenes';
        scene.add(this.root);
        const r = rng(4242);
        const groups = { always: new THREE.Group(), day: new THREE.Group(), night: new THREE.Group() };
        const M = new Map();
        const mat = hex => { if (!M.has(hex)) M.set(hex, new THREE.MeshLambertMaterial({ color: hex })); return M.get(hex); };
        const B = new THREE.BoxGeometry(1, 1, 1), S = new THREE.SphereGeometry(1, 8, 6), K = new THREE.ConeGeometry(1, 1, 10);
        const SHIRT = [0x8A4B22, 0x2F3E6B, 0x6B2730, 0x9C6B2E, 0x3E5A3A, 0xE3C46A, 0x8E3B46, 0xD9D4CC];
        const BASE = GRID_CONFIG.SURFACE_Y + 0.11;   // di atas pad kavling / trotoar (Zero-Submerging)

        // Satu figur: anchor (x,z,yaw) + bagian lokal [geo, hex, lx, ly, lz, sx, sy, sz]
        const figure = (g, x, y, z, yaw, parts) => {
            const o = new THREE.Group();
            o.position.set(x, y, z);
            o.rotation.y = yaw;
            for (const [geo, hex, lx, ly, lz, sx, sy, sz] of parts) {
                const m = new THREE.Mesh(geo, mat(hex));
                m.position.set(lx, ly, lz);
                m.scale.set(sx, sy, sz);
                o.add(m);
            }
            g.add(o);
        };
        const skin = () => SKIN[Math.floor(r() * SKIN.length)];
        const shirt = () => SHIRT[Math.floor(r() * SHIRT.length)];
        // Duduk (pinggul di ketinggian seat): kaki menjulur ke depan (-Z lokal)
        const seated = (g, x, y, z, yaw, opts = {}) => {
            const sk = skin(), sh = opts.shirt || shirt(), pants = opts.pants || 0x2B2620;
            const parts = [
                [B, pants, -0.1, 0.06, -0.2, 0.14, 0.13, 0.42], [B, pants, 0.1, 0.06, -0.2, 0.14, 0.13, 0.42],
                [B, pants, -0.1, -0.2, -0.38, 0.12, 0.42, 0.13], [B, pants, 0.1, -0.2, -0.38, 0.12, 0.42, 0.13],
                [B, sh, 0, 0.42, 0, 0.42, 0.56, 0.24], [S, sk, 0, 0.84, 0, 0.13, 0.14, 0.13]
            ];
            if (opts.sarung) parts.push([B, opts.sarung, 0, 0.08, -0.12, 0.38, 0.18, 0.46]);
            if (opts.peci) parts.push([B, 0x1E1B19, 0, 0.98, 0, 0.22, 0.09, 0.22]);
            figure(g, x, y, z, yaw, parts);
        };
        // Berdiri: kaki/jarik, badan, kepala, kerudung/caping opsional
        const standing = (g, x, z, yaw, opts = {}) => {
            const sk = skin(), sh = opts.shirt || shirt(), low = opts.skirt || 0x2B2620;
            const parts = opts.skirt
                ? [[B, low, 0, 0.42, 0, 0.36, 0.84, 0.26]]
                : [[B, low, -0.09, 0.42, 0, 0.13, 0.84, 0.15], [B, low, 0.09, 0.42, 0, 0.13, 0.84, 0.15]];
            parts.push([B, sh, 0, 1.13, 0, 0.42, 0.6, 0.24], [S, sk, 0, 1.56, 0, 0.13, 0.14, 0.13]);
            if (opts.kerudung) parts.push([S, opts.kerudung, 0, 1.6, 0.01, 0.16, 0.16, 0.16]);
            if (opts.caping) parts.push([K, 0xD8B46A, 0, 1.74, 0, 0.36, 0.15, 0.36]);
            figure(g, x, BASE, z, yaw, parts);
        };
        const front = b => {
            const f = b.facing || 0;
            const fx = f === 1 ? 1 : f === 3 ? -1 : 0, fz = f === 0 ? 1 : f === 2 ? -1 : 0;
            const w = (b.width || 1) * T, h = (b.height || 1) * T;
            const off = (fx ? w : h) / 2 + 0.55;
            return { x: b.worldX + fx * off, z: b.worldZ + fz * off, fx, fz, yaw: Math.atan2(fx, fz) };
        };

        let kafe = 0, ronda = 0, ngobrol = 0;
        for (const b of buildings) {
            if (!Number.isFinite(b.worldX) || b.stage === 'proyek') continue;
            const east = villageIdAtX(b.worldX) === 'have_not';
            const fr = front(b);
            const lat = (k) => [fr.x + (fr.fz ? k : 0), fr.z + (fr.fx ? k : 0)];
            if (!east && KAFE_TYPES.has(b.type) && kafe < 24) {
                // Desa Have: meja kafe di teras + 2 warga duduk berhadapan
                kafe++;
                const [tx, tz] = lat(0);
                figure(groups.always, tx, BASE, tz, 0, [[B, 0xEDE6DA, 0, 0.72, 0, 0.7, 0.05, 0.7], [B, 0x3A3F44, 0, 0.36, 0, 0.08, 0.72, 0.08]]);
                for (const sgn of [-1, 1]) {
                    const [cx, cz] = lat(sgn * 0.75);
                    figure(groups.always, cx, BASE, cz, 0, [[B, 0x7A5A3A, 0, 0.45, 0, 0.42, 0.06, 0.42], [B, 0x3A3F44, 0, 0.22, 0, 0.06, 0.44, 0.06]]);
                    seated(groups.always, cx, BASE + 0.48, cz, fr.yaw + (fr.fz ? sgn : 0) * 0 + (sgn > 0 ? Math.PI / 2 : -Math.PI / 2) * (fr.fz ? 1 : 0) + (fr.fx ? (sgn > 0 ? Math.PI : 0) : 0));
                }
            } else if (east && b.type === 'pos_ronda' && ronda < 16) {
                // Desa Have-Not: ronda malam (3 bapak bersarung & berpeci, kentongan)
                ronda++;
                for (const k of [-0.8, 0, 0.8]) {
                    const [cx, cz] = lat(k);
                    seated(groups.night, cx, BASE + 0.42, cz, fr.yaw + Math.PI, { sarung: k ? 0x3E5A3A : 0x6B2730, peci: true, shirt: 0xD9D4CC });
                }
                const [kx, kz] = lat(1.4);
                figure(groups.night, kx, BASE, kz, 0, [[B, 0x6B4A2E, 0, 0.9, 0, 0.08, 1.8, 0.08], [new THREE.CylinderGeometry(1, 1, 1, 8), 0x9C6B2E, 0, 1.45, 0.12, 0.09, 0.55, 0.09]]);
            } else if (east && WARUNG_TYPES.has(b.type) && ngobrol < 24) {
                // Desa Have-Not: ibu-ibu ngobrol di depan warung (melingkar)
                ngobrol++;
                const [cx, cz] = lat(0);
                for (let k = 0; k < 3; k++) {
                    const a = k * 2.1 + r();
                    standing(groups.day, cx + Math.cos(a) * 0.55, cz + Math.sin(a) * 0.55, Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI,
                        { skirt: [0x6B4A2E, 0x5B3A24, 0x3E2A1A][k], shirt: [0x8E3B46, 0xE3C46A, 0x3B6E4A][k], kerudung: k === 1 ? 0xE9E2D0 : null });
                }
            }
        }
        // Desa Have-Not: ronda malam di gardu ronda kebun desa (CityGrid.rondaSpots)
        for (const s of (spots.ronda || [])) {
            for (const [dx, yaw] of [[-0.55, Math.PI], [0.1, Math.PI], [0.7, 0]]) {
                seated(groups.night, s.x + dx, s.y, s.z + (yaw ? 0.6 : -0.6), yaw, { sarung: dx < 0 ? 0x3E5A3A : 0x6B2730, peci: true, shirt: 0xD9D4CC });
            }
            figure(groups.night, s.x + 0.95, s.y + 0.9, s.z + 0.75, 0, [[new THREE.CylinderGeometry(1, 1, 1, 8), 0x9C6B2E, 0, 0, 0, 0.09, 0.55, 0.09]]);
            ronda++;
        }
        // Desa Have: warga duduk di bangku taman (separuh bangku terisi)
        for (const s of (spots.benches || [])) if (r() < 0.5) seated(groups.always, s.x, s.y, s.z, s.yaw);
        // Desa Have-Not: ibu menjemur pakaian (siang)
        for (const s of (spots.jemuran || [])) standing(groups.day, s.x, s.z, s.yaw, { skirt: 0x6B4A2E, shirt: 0xC98B5A, caping: r() < 0.4 });

        this.groups = {};
        for (const [k, g] of Object.entries(groups)) {
            const baked = bakeStatic(g, { remove: false });
            baked.name = 'idle_' + k;
            baked.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
            this.root.add(baked);
            this.groups[k] = baked;
        }
        this.counts = { kafe, ronda, ngobrol, bangku: (spots.benches || []).length, jemuran: (spots.jemuran || []).length };
        this.setNight(false);
    }

    setNight(isNight) {
        if (this.groups.day) this.groups.day.visible = !isNight;
        if (this.groups.night) this.groups.night.visible = isNight;
    }
}

// =============================================================================
// ASAP CEROBONG
// =============================================================================
const SMOKE_TYPES = { warung: 5.2, warung_kopi: 4.4, warung_madura: 4.6, pasar: 6.0, rumah: 5.4, rumah_limas: 5.6, kafe: 5.0, resto: 5.4 };

export class ChimneySmoke {
    constructor(scene, buildings, maxSources = 36) {
        this.sources = [];
        const list = [...buildings].filter(b => SMOKE_TYPES[b.type] && b.stage !== 'proyek' && b.stage !== 'bangun' && b.stage !== 'sketsa');
        // Sebar merata: ambil tiap n-ke agar tidak semua di satu tempat
        const step = Math.max(1, Math.floor(list.length / maxSources));
        for (let k = 0; k < list.length && this.sources.length < maxSources; k += step) {
            const b = list[k];
            this.sources.push({ x: b.worldX + 1.2, y: GRID_CONFIG.SURFACE_Y + SMOKE_TYPES[b.type], z: b.worldZ - 1.0, seed: k * 0.37 });
        }
        this.puffs = 6;
        const n = Math.max(1, this.sources.length * this.puffs);
        const mat = new THREE.MeshLambertMaterial({ color: lin(0xE4E0D8), transparent: true, opacity: 0.78, depthWrite: false });
        this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), mat, n);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 3;
        this.mesh.name = 'chimney_smoke';
        scene.add(this.mesh);
        this.dummy = new THREE.Object3D();
        this.time = 0;
        this.update(0);
    }

    update(dt) {
        this.time += dt;
        const d = this.dummy;
        let idx = 0;
        for (const s of this.sources) {
            for (let k = 0; k < this.puffs; k++) {
                const t = (this.time * 0.16 + s.seed + k / this.puffs) % 1;
                const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : Math.min(1, t * 6);
                const sc = (0.25 + t * 1.5) * fade;
                d.position.set(s.x + t * 2.6 + Math.sin(this.time + k) * 0.15, s.y + t * 6.5, s.z + t * 0.8);
                d.rotation.set(t * 2, t * 3 + k, 0);
                d.scale.setScalar(Math.max(0.001, sc));
                d.updateMatrix();
                this.mesh.setMatrixAt(idx++, d.matrix);
            }
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

// =============================================================================
// LAMPU TEPLOK (malam, Desa Have-Not)
// =============================================================================
const TEPLOK_TYPES = new Set(['rumah', 'proyek_rumah', 'warung', 'warung_kopi', 'rumah_limas', 'saung_bambu', 'pos_ronda', 'kebun_sayur', 'sawah']);

export class TeplokLamps {
    constructor(scene, buildings) {
        const pts = [];
        for (const b of buildings) {
            if (b.worldX <= GRID_CONFIG.RIVER_MAX_X || !TEPLOK_TYPES.has(b.type)) continue;
            const w = (b.width || 1) * T, h = (b.height || 1) * T;
            // Depan bangunan sesuai arah hadap (0:+Z, 1:+X, 2:-Z, 3:-X)
            const f = b.facing || 0;
            const fx = f === 1 ? 1 : f === 3 ? -1 : 0;
            const fz = f === 0 ? 1 : f === 2 ? -1 : 0;
            const off = (fx ? w : h) / 2 - 0.6;
            for (const side of [-1, 1]) {
                const lateral = 1.1 * side;
                pts.push(b.worldX + fx * off + (fz ? lateral : 0), GRID_CONFIG.SURFACE_Y + 2.1, b.worldZ + fz * off + (fx ? lateral : 0));
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.length ? pts : [0, -100, 0], 3));
        this.mat = new THREE.PointsMaterial({
            map: glowTex(), color: 0xFFC56B, size: 3.4, sizeAttenuation: true,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.points = new THREE.Points(geo, this.mat);
        this.points.name = 'teplok_lamps';
        this.points.visible = false;
        this.points.renderOrder = 4;
        scene.add(this.points);
        this.count = pts.length / 3;
        this.time = 0;
    }

    setNight(isNight) {
        this.points.visible = isNight;
    }

    update(dt) {
        if (!this.points.visible) return;
        this.time += dt;
        // Kedip api teplok: gabungan dua frekuensi agar tidak terasa mekanis
        this.mat.opacity = 0.82 + Math.sin(this.time * 7.3) * 0.08 + Math.sin(this.time * 13.1) * 0.05;
        this.mat.size = 3.4 + Math.sin(this.time * 5.1) * 0.12;
    }
}
