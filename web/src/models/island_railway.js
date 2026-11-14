/**
 * AUDIRA-LAND: PULAU + KERETA API LINGKAR PULAU (2026-11-14)
 *
 * Peta diperbesar menjadi sebuah PULAU utuh:
 *  - Daratan pulau (rumput) menutup seluruh kawasan lama (kota, taman budaya, lembah salju, pegunungan)
 *    sampai X -860..1440, Z -440..1160, dikelilingi pantai pasir + palem, lalu samudra di semua sisi.
 *    Laut selatan lama (fishing.js, y -0,25) tetap dipakai; samudra baru di bawahnya (polygonOffset).
 *  - Rel AUDIRA RAIL: satu loop persegi membulat (R 220 m, ±7,6 km) di pesisir pulau. Sisi selatan
 *    berjalan di atas JEMBATAN LAUT (viaduk 9 m) di depan pelabuhan & terminal pesiar.
 *  - 4 stasiun: Samudra (selatan, di atas viaduk), Kaki Gunung (timur), Lembah Salju (utara),
 *    Taman Budaya (barat). Peron di sisi dalam pulau, kanopi, gedung stasiun, papan nama, lampu.
 *  - 3 rangkaian kereta (lokomotif dorong-tarik + 4 gerbong) beroperasi: percepat, melaju 24 m/dtk,
 *    melambat, berhenti 14 dtk di tiap stasiun, jaga jarak aman antar-kereta. Jendela menyala malam.
 *
 * Kinerja (anggaran draw <= 100 @390px): rel/viaduk/stasiun/palem dilebur bakeStatic per chunk 400 m
 * (frustum culling tetap jalan); bantalan rel 1 InstancedMesh; kereta 4 InstancedMesh (lokomotif,
 * gerbong, kaca lokomotif, kaca gerbong). Dimuat lazy dari main.js (tidak menambah bundel awal).
 * Zero-Submerging: semua alas berdiri di atas daratan (y >= 0) atau dek viaduk; pilar viaduk
 * berdiri di dasar laut.
 *
 * API: new IslandRailway(scene) -> .update(dt), .setNight(isNight), .attachCameraPreset(cam)
 */
import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { makeWaterMaterial } from '../core/water.js';
import { fillIsland } from './island_fill.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

// ---- Pulau ----
const ISLAND = { x0: -860, x1: 1440, z0: -440, z1: 1160, r: 260 };   // daratan (sisi selatan = laut lama)
const BEACH_W = 55;                                                    // lebar pantai di luar daratan
const LAND_Y = -0.12, BEACH_Y = -0.12, OCEAN_Y = -0.27;

// ---- Jalur rel (persegi membulat, berlawanan jarum jam dilihat dari atas peta) ----
const RAIL = { x0: -800, x1: 1380, z0: -690, z1: 1100, r: 220 };
const VIADUCT_H = 9;                    // tinggi dek jembatan laut
const RAMP_Z0 = -300, RAMP_Z1 = -470;   // tanjakan dari darat ke viaduk
const GAUGE = 0.72;                     // setengah lebar sepur 1435 mm
const RAIL_TOP = 0.66;                  // puncak rel di atas dasar balas

// ---- Operasi kereta ----
const VMAX = 24, ACC = 0.7, DEC = 0.9, DWELL = 14, HEADWAY = 90;
const LOCO_L = 16, CAR_L = 18, GAP = 0.8, N_CARS = 4;
const TRAIN_L = LOCO_L * 2 + N_CARS * CAR_L + (N_CARS + 1) * GAP;

const COL = {
    land: 0x6A9A45, beach: 0xE3CF9A, ballast: 0x8A8178, rail: 0x6E747C, sleeper: 0x5B4A3A,
    deck: 0xB7B1A6, pier: 0xA39D92, parapet: 0xD6D0C4, pole: 0x6B737D, wire: 0x2F3439,
    platform: 0xD9CFC0, edge: 0xE9C21E, canopy: 0x0F766E, canopyPost: 0xE9E3D6,
    wall: 0xF4EEE2, wallTrim: 0xC8553D, roof: 0xA33822, door: 0x54331C, window: 0x2C6E8F,
    bench: 0x754728, palmTrunk: 0x8E7548, palmLeaf: 0x4F8A3A, palmLeaf2: 0x6AA548,
    body: 0xF4F1EA, stripe: 0x0F766E, stripe2: 0xE9A91E, roofTrain: 0xB8BEC6, bogie: 0x2B2F35,
    nose: 0xC8553D, glassDay: 0x24343F, glassNight: 0xFFD98A, lampDay: 0xBFC6CC, lampNight: 0xFFE08A
};

const STATIONS = [
    { name: 'Stasiun Samudra', sub: 'Jembatan Laut · Pelabuhan', side: 'S', at: 290 },
    { name: 'Stasiun Kaki Gunung', sub: 'Pegunungan Timur', side: 'E', at: 100 },
    { name: 'Stasiun Lembah Salju', sub: 'Lembah Salju Utara', side: 'N', at: 300 },
    { name: 'Stasiun Taman Budaya', sub: 'Taman Budaya Barat', side: 'W', at: 50 }
];

const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const elevAt = z => VIADUCT_H * smooth(RAMP_Z0, RAMP_Z1, z);

function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Lintasan loop: potongan lurus & busur, parameter jarak tempuh s (meter). */
function makePath() {
    const { x0, x1, z0, z1, r } = RAIL;
    const D = Math.PI / 2;
    const pieces = [
        { line: [x0 + r, z0, x1 - r, z0] },
        { arc: [x1 - r, z0 + r, -D, 0] },
        { line: [x1, z0 + r, x1, z1 - r] },
        { arc: [x1 - r, z1 - r, 0, D] },
        { line: [x1 - r, z1, x0 + r, z1] },
        { arc: [x0 + r, z1 - r, D, 2 * D] },
        { line: [x0, z1 - r, x0, z0 + r] },
        { arc: [x0 + r, z0 + r, 2 * D, 3 * D] }
    ];
    let L = 0;
    for (const p of pieces) {
        p.s0 = L;
        p.len = p.line ? Math.hypot(p.line[2] - p.line[0], p.line[3] - p.line[1]) : r * (p.arc[3] - p.arc[2]);
        L += p.len;
    }
    const at = (s, out = {}) => {
        s = ((s % L) + L) % L;
        let p = pieces[pieces.length - 1];
        for (const q of pieces) if (s < q.s0 + q.len) { p = q; break; }
        const t = (s - p.s0) / p.len;
        if (p.line) {
            const [ax, az, bx, bz] = p.line;
            out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t;
            out.dx = (bx - ax) / p.len; out.dz = (bz - az) / p.len;
        } else {
            const [cx, cz, a0, a1] = p.arc;
            const a = a0 + (a1 - a0) * t;
            out.x = cx + r * Math.cos(a); out.z = cz + r * Math.sin(a);
            out.dx = -Math.sin(a); out.dz = Math.cos(a);
        }
        out.y = elevAt(out.z);
        return out;
    };
    /** s untuk titik di sisi lurus tertentu (S/E/N/W) pada koordinat `at`. */
    const sOf = (side, v) => {
        if (side === 'S') return pieces[0].s0 + (v - (x0 + r));
        if (side === 'E') return pieces[2].s0 + (v - (z0 + r));
        if (side === 'N') return pieces[4].s0 + ((x1 - r) - v);
        return pieces[6].s0 + ((z1 - r) - v);
    };
    return { L, at, sOf };
}

/** Gabung bagian {geo, matrix, color?} jadi satu BufferGeometry (non-indexed, opsional warna/UV). */
function mergeParts(parts, { color = false, uv = false } = {}) {
    let n = 0;
    const flat = parts.map(p => {
        const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.matrix);
        if (!g.attributes.normal) g.computeVertexNormals();
        n += g.attributes.position.count;
        return { g, c: p.color != null ? lin(p.color) : null };
    });
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    const col = color ? new Float32Array(n * 3) : null, uvs = uv ? new Float32Array(n * 2) : null;
    let o = 0;
    for (const { g, c } of flat) {
        const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        pos.set(P.array, o * 3); nrm.set(N.array, o * 3);
        if (col) for (let i = 0; i < P.count; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
        if (uvs && U) uvs.set(U.array, o * 2);
        o += P.count;
        g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    out.computeBoundingSphere();
    return out;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const boxAt = (w, h, d, x, y, z) => ({ geo: new THREE.BoxGeometry(w, h, d), matrix: new THREE.Matrix4().makeTranslation(x, y, z) });

export class IslandRailway {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'island_railway';
        this.staticGroup = new THREE.Group();
        this.path = makePath();
        this.matCache = new Map();
        this.lampMat = new THREE.MeshBasicMaterial({ color: lin(COL.lampDay) });
        this.glassMat = new THREE.MeshLambertMaterial({ color: lin(COL.glassDay), emissive: 0x000000 });
        [this.lampMat, this.glassMat].forEach(protectMaterial);
        this.lampParts = [];
        this.signParts = [];
        this.follow = -1;

        this.buildIsland();
        this.buildTrack();
        this.stations = STATIONS.map((st, k) => this.buildStation(st, k));
        this.buildPalms();
        this.fillStats = fillIsland(this, RAIL, ISLAND);   // hutan + kampung di area kosong pulau

        this.buildSleepers();
        this.staticGroup.add(bakeStatic(this.staticGroup, { chunkSize: 600 }));
        this.root.add(this.staticGroup);
        this.buildLampsAndSigns();
        this.buildTrains();

        scene.add(this.root);
    }

    mat(hex) {
        if (!this.matCache.has(hex)) this.matCache.set(hex, new THREE.MeshLambertMaterial({ color: lin(hex) }));
        return this.matCache.get(hex);
    }
    add(geo, hex) {
        // Struktur statis tidak memancarkan bayangan: 1 bucket per chunk, tanpa draw di shadow pass
        const m = new THREE.Mesh(geo, this.mat(hex));
        m.castShadow = false; m.receiveShadow = true;
        this.staticGroup.add(m);
        return m;
    }

    // ------------------------------------------------------------------ Pulau
    roundedShape(x0, x1, z0, z1, r) {
        // Koordinat shape (x, -z): setelah rotateX(-90°) kembali ke (x, 0, z). Sudut selatan siku (laut).
        const s = new THREE.Shape();
        s.moveTo(x0, -z0);
        s.lineTo(x1, -z0);
        s.lineTo(x1, -(z1 - r));
        s.absarc(x1 - r, -(z1 - r), r, 0, -Math.PI / 2, true);
        s.lineTo(x0 + r, -z1);
        s.absarc(x0 + r, -(z1 - r), r, -Math.PI / 2, -Math.PI, true);
        s.lineTo(x0, -z0);
        return s;
    }

    buildIsland() {
        const I = ISLAND;
        // Daratan + cincin pantai (shape berlubang, tak tumpang-tindih) dalam 1 mesh ber-vertex-color = 1 draw
        const landShape = this.roundedShape(I.x0, I.x1, I.z0, I.z1, I.r);
        const ring = this.roundedShape(I.x0 - BEACH_W, I.x1 + BEACH_W, I.z0 - 3, I.z1 + BEACH_W, I.r + BEACH_W);   // + garis pasir 3 m di pantai selatan (lubang tak menempel tepi)
        ring.holes.push(new THREE.Path(landShape.getPoints(24).reverse()));
        const parts = [
            { geo: new THREE.ShapeGeometry(landShape, 24).rotateX(-Math.PI / 2), matrix: new THREE.Matrix4().makeTranslation(0, LAND_Y, 0), color: COL.land },
            { geo: new THREE.ShapeGeometry(ring, 24).rotateX(-Math.PI / 2), matrix: new THREE.Matrix4().makeTranslation(0, LAND_Y, 0), color: COL.beach }
        ];
        const land = new THREE.Mesh(mergeParts(parts, { color: true }), new THREE.MeshLambertMaterial({
            vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4
        }));
        land.receiveShadow = true; land.name = 'island_land';
        this.root.add(land);

        const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
            makeWaterMaterial({ color: 0x2C7DA6, repeatU: 220, repeatV: 220, flow: 0.01, drift: 0.01 }));
        ocean.material.polygonOffset = true;
        ocean.material.polygonOffsetFactor = 4;
        ocean.material.polygonOffsetUnits = 16;
        ocean.position.set(300, OCEAN_Y, 300);
        ocean.receiveShadow = true;
        ocean.name = 'island_ocean';
        this.root.add(ocean);
    }

    // ------------------------------------------------------------------ Rel & viaduk
    /** Ekstrusi penampang [[u, h], ...] di sepanjang loop. u + = sisi dalam pulau, h di atas dasar balas. */
    extrude(profile, hex, { closed = true, filter = null, step = 4 } = {}) {
        const { L, at } = this.path;
        const n = Math.ceil(L / step);
        const S = [];
        for (let i = 0; i <= n; i++) S.push(at((i / n) * L));
        const cu = profile.reduce((a, p) => a + p[0], 0) / profile.length;
        const ch = profile.reduce((a, p) => a + p[1], 0) / profile.length;
        const CH = 500;                                  // potong per 500 m agar bakeStatic bisa chunk + culling
        const chunks = new Map();
        const W = (p, u, h) => [p.x - p.dz * u, p.y + h, p.z + p.dx * u];
        const edges = profile.length - (closed ? 0 : 1);
        for (let i = 0; i < n; i++) {
            const a = S[i], b = S[i + 1];
            if (filter && !filter(a) && !filter(b)) continue;
            const ca = W(a, cu, ch);
            const key = Math.floor(((i + 0.5) / n) * L / CH);
            if (!chunks.has(key)) chunks.set(key, []);
            const pos = chunks.get(key);
            for (let e = 0; e < edges; e++) {
                const p0 = profile[e], p1 = profile[(e + 1) % profile.length];
                const v0 = W(a, p0[0], p0[1]), v1 = W(a, p1[0], p1[1]), v2 = W(b, p1[0], p1[1]), v3 = W(b, p0[0], p0[1]);
                // Arah normal keluar: bandingkan dengan vektor dari pusat penampang
                const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
                const wx = v3[0] - v0[0], wy = v3[1] - v0[1], wz = v3[2] - v0[2];
                const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
                const ox = (v0[0] + v1[0]) / 2 - ca[0], oy = (v0[1] + v1[1]) / 2 - ca[1], oz = (v0[2] + v1[2]) / 2 - ca[2];
                if (nx * ox + ny * oy + nz * oz >= 0) pos.push(...v0, ...v1, ...v2, ...v0, ...v2, ...v3);
                else pos.push(...v0, ...v2, ...v1, ...v0, ...v3, ...v2);
            }
        }
        for (const pos of chunks.values()) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.computeVertexNormals();
            this.add(g, hex);
        }
    }

    buildTrack() {
        const elevated = p => p.y > 0.4;
        this.extrude([[-2.5, -0.05], [-1.7, 0.42], [1.7, 0.42], [2.5, -0.05]], COL.ballast, { closed: false });
        for (const c of [-GAUGE, GAUGE]) {
            this.extrude([[c - 0.05, 0.48], [c - 0.05, RAIL_TOP], [c + 0.05, RAIL_TOP], [c + 0.05, 0.48]], COL.rail, { closed: false });
        }
        // Viaduk: dek beton + tembok pengaman (hanya di bagian yang terangkat)
        this.extrude([[-2.9, -0.05], [-2.9, -1.35], [2.9, -1.35], [2.9, -0.05]], COL.deck, { filter: elevated });
        for (const c of [-2.85, 2.85]) {
            this.extrude([[c - 0.12, -0.05], [c - 0.12, 0.95], [c + 0.12, 0.95], [c + 0.12, -0.05]], COL.parapet, { filter: elevated });
        }
        // Kawat listrik aliran atas
        this.extrude([[-0.03, 6.0], [-0.03, 6.06], [0.03, 6.06], [0.03, 6.0]], COL.wire, { step: 8 });

        const { L, at } = this.path;
        const p = {};
        // Pilar viaduk (alas di dasar laut / tanah)
        for (let s = 0; s < L; s += 30) {
            at(s, p);
            if (p.y < 1.4) continue;
            const h = p.y - 1.35 + 1.2;
            const m = this.add(new THREE.BoxGeometry(4.6, h, 2.2), COL.pier);
            m.position.set(p.x, -1.2 + h / 2, p.z);
            m.rotation.y = Math.atan2(p.dx, p.dz);
            const cap = this.add(new THREE.BoxGeometry(6.2, 0.6, 2.8), COL.deck);
            cap.position.set(p.x, p.y - 1.35 - 0.3, p.z);
            cap.rotation.y = m.rotation.y;
        }
        // Tiang listrik di sisi luar loop + lengan ke atas sepur
        for (let s = 0; s < L; s += 50) {
            at(s, p);
            const u = p.y > 0.4 ? -2.5 : -3.2;            // di viaduk: berdiri di dek, di dalam tembok
            const x = p.x - p.dz * u, z = p.z + p.dx * u, au = (u + 0.1) / 2;
            const pole = this.add(new THREE.CylinderGeometry(0.14, 0.18, 6.6, 6), COL.pole);
            pole.position.set(x, p.y + 3.3, z);
            const arm = this.add(new THREE.BoxGeometry(0.1 - u, 0.12, 0.12), COL.pole);
            arm.position.set(p.x - p.dz * au, p.y + 6.25, p.z + p.dx * au);
            arm.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI / 2;
        }
    }

    buildSleepers() {
        const { L, at } = this.path;
        const n = Math.floor(L / 1.6);
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 0.12, 0.26), this.mat(COL.sleeper), n);
        const p = {};
        for (let i = 0; i < n; i++) {
            at((i / n) * L, p);
            _e.set(0, Math.atan2(p.dx, p.dz), 0);
            _q.setFromEuler(_e);
            _v.set(p.x, p.y + 0.46, p.z);
            mesh.setMatrixAt(i, _m4.compose(_v, _q, _one));
        }
        mesh.receiveShadow = true;
        mesh.name = 'rail_sleepers';
        this.staticGroup.add(mesh);                      // dilebur bakeStatic per chunk (culling benar, 0 draw tambahan)
    }

    // ------------------------------------------------------------------ Stasiun
    buildStation(st, k) {
        const s = this.path.sOf(st.side, st.at);
        const p = this.path.at(s);
        const T = { x: p.dx, z: p.dz }, N = { x: -p.dz, z: p.dx };     // N = sisi dalam pulau
        const yaw = Math.atan2(T.x, T.z);
        const y0 = p.y;
        const W = (t, u) => [p.x + T.x * t + N.x * u, p.z + T.z * t + N.z * u];
        const box = (t, u, lenT, wU, h, yb, hex) => {
            const [x, z] = W(t, u);
            const m = this.add(new THREE.BoxGeometry(wU, h, lenT), hex);
            m.position.set(x, yb + h / 2, z); m.rotation.y = yaw;
            return m;
        };
        const PL = 120, elevated = y0 > 1;
        // Viaduk melebar untuk peron + gedung (stasiun jembatan laut) dengan pilar sendiri
        if (elevated) {
            box(0, 13, PL + 8, 21, 1.3, y0 - 1.35, COL.deck);
            for (let t = -PL / 2; t <= PL / 2; t += 20) for (const u of [7, 18]) box(t, u, 2.2, 2.6, y0 - 1.35 + 1.2, -1.2, COL.pier);
            box(0, 23.4, PL + 8, 0.25, 1.0, y0 - 0.05, COL.parapet);
        }
        const PH = 1.05;
        box(0, 5.0, PL, 6.0, PH, y0, COL.platform);                 // peron
        box(0, 2.22, PL, 0.42, 0.02, y0 + PH, COL.edge);      // garis kuning tepi peron
        // Kanopi: tiang + atap
        for (let t = -42; t <= 42; t += 12) box(t, 6.6, 0.3, 0.3, 4.1, y0 + PH, COL.canopyPost);
        box(0, 5.2, 96, 7.4, 0.28, y0 + PH + 4.1, COL.canopy);
        box(0, 1.95, 96, 0.2, 0.4, y0 + PH + 3.75, COL.canopy);  // lis depan kanopi (di atas atap kereta 4,7 m)
        // Bangku di peron
        for (let t = -36; t <= 36; t += 18) box(t, 6.4, 3.0, 0.7, 0.45, y0 + PH, COL.bench);
        // Gedung stasiun di belakang peron
        const GU = 14.5, GH = 6.5;
        box(0, GU, 32, 11, GH, y0, COL.wall);
        box(0, GU, 32.4, 11.4, 0.5, y0 + GH - 0.5, COL.wallTrim);
        box(0, GU, 34, 12.6, 0.4, y0 + GH, COL.roof);
        box(0, GU, 30, 8, 1.6, y0 + GH + 0.4, COL.roof);              // atap bertingkat (limasan)
        box(0, GU, 22, 4, 1.2, y0 + GH + 2.0, COL.roof);
        for (const t of [-11, -5, 5, 11]) {
            box(t, GU - 5.55, 3.2, 0.12, 2.2, y0 + 2.6, COL.window);   // jendela sisi peron
            box(t, GU + 5.55, 3.2, 0.12, 2.2, y0 + 2.6, COL.window);   // jendela sisi darat
        }
        box(0, GU + 5.56, 4.0, 0.14, 3.2, y0, COL.door);
        box(0, GU - 5.56, 4.0, 0.14, 3.2, y0 + PH, COL.door);
        // Jalan akses dari pintu depan ke pedalaman (darat saja)
        if (!elevated) box(0, GU + 5.5 + 30, 7, 60, 0.06, 0.0, COL.platform);

        // Lampu peron (kepala lampu = material terlindung untuk siang/malam)
        for (let t = -48; t <= 48; t += 16) {
            const [x, z] = W(t, 7.6);
            const post = this.add(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), COL.pole);
            post.position.set(x, y0 + PH + 1.7, z);
            this.lampParts.push(boxAt(0.5, 0.3, 0.5, x, y0 + PH + 3.5, z));
        }
        // Papan nama: di bawah kanopi menghadap sepur (2 buah) + di atas pintu menghadap darat
        const sign = (t, u, y, face, w, h) => {
            const [x, z] = W(t, u);
            const g = new THREE.PlaneGeometry(w, h);
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setY(i, (3 - k + uv.getY(i)) / 4);
            const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + face, 0)), _one);
            this.signParts.push({ geo: g, matrix: m });
        };
        sign(-24, 2.3, y0 + PH + 3.0, Math.PI / 2, 9, 1.4);
        sign(24, 2.3, y0 + PH + 3.0, Math.PI / 2, 9, 1.4);
        sign(0, GU + 5.75, y0 + GH - 1.3, -Math.PI / 2, 14, 2.2);
        sign(0, GU - 5.75, y0 + GH - 1.3, Math.PI / 2, 14, 2.2);

        return { ...st, s, x: p.x, z: p.z, y: y0, yaw, N };
    }

    makeSignTexture() {
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 640;
        const g = c.getContext('2d');
        STATIONS.forEach((st, k) => {
            const y = k * 160;
            g.fillStyle = '#0F766E'; g.fillRect(0, y, 1024, 160);
            g.fillStyle = '#E9A91E'; g.fillRect(0, y + 148, 1024, 12);
            g.fillStyle = '#FFF9EC';
            g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
            g.fillText('AUDIRA RAIL  ·  🚆', 512, y + 40);
            g.font = 'bold 64px sans-serif';
            g.fillText(st.name.toUpperCase(), 512, y + 104);
            g.font = '24px sans-serif';
            g.fillText(st.sub, 512, y + 136);
        });
        const tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = 4;
        return tex;
    }

    buildLampsAndSigns() {
        const lamps = new THREE.Mesh(mergeParts(this.lampParts), this.lampMat);
        lamps.name = 'rail_lamps';
        const signs = new THREE.Mesh(mergeParts(this.signParts, { uv: true }),
            new THREE.MeshBasicMaterial({ map: this.makeSignTexture() }));
        signs.name = 'rail_signs';
        this.lamps = lamps; this.signs = signs;
        this.root.add(lamps, signs);
    }

    // ------------------------------------------------------------------ Palem pantai
    buildPalms() {
        const rnd = mulberry(0x7A11);
        const { L, at } = this.path;
        const p = {};
        const near = s => this.stations.reduce((m, q) => Math.min(m, Math.abs((((q.s - s) % L) + L * 1.5) % L - L / 2)), 1e9);
        let placed = 0;
        for (let s = 0; s < L && placed < 140; s += 26 + rnd() * 30) {
            at(s, p);
            if (p.y > 0.2) continue;                        // sisi selatan = laut
            if (near(s) < 80) continue;
            const u = -(46 + rnd() * 50);                    // sisi luar (pantai)
            const x = p.x - p.dz * u, z = p.z + p.dx * u;
            const y0 = (-u > 60 ? BEACH_Y : LAND_Y) + 0.02;  // Zero-Submerging: alas di pasir / rumput
            const h = 6 + rnd() * 4, lean = (rnd() - 0.5) * 0.3;
            const trunk = this.add(new THREE.CylinderGeometry(0.22, 0.34, h, 5), COL.palmTrunk);
            trunk.position.set(x, y0 + h / 2, z); trunk.rotation.z = lean;
            const tx = x - Math.sin(lean) * h / 2;
            for (let f = 0; f < 5; f++) {
                const a = (f / 5) * Math.PI * 2 + rnd();
                const leaf = this.add(new THREE.BoxGeometry(0.9, 0.1, 4.2), f % 2 ? COL.palmLeaf : COL.palmLeaf2);
                leaf.position.set(tx + Math.sin(a) * 1.8, y0 + h - 0.2, z + Math.cos(a) * 1.8);
                leaf.rotation.set(0, a, 0);
                leaf.rotateX(0.45);
            }
            placed++;
        }
    }

    // ------------------------------------------------------------------ Kereta
    trainGeometries() {
        const car = [], carGlass = [], loco = [], locoGlass = [];
        const B = (list, w, h, d, x, y, z, color) => list.push({ ...boxAt(w, h, d, x, y, z), color });
        // Gerbong 18 m (lokal: +Z maju, y 0 = puncak rel)
        const cl = CAR_L - 0.4;
        B(car, 2.9, 2.7, cl, 0, 1.0 + 1.35, 0, COL.body);
        B(car, 2.5, 0.35, cl - 0.6, 0, 3.7 + 0.17, 0, COL.roofTrain);
        B(car, 2.94, 0.28, cl - 0.2, 0, 1.45, 0, COL.stripe);
        B(car, 2.94, 0.1, cl - 0.2, 0, 1.68, 0, COL.stripe2);
        for (const z of [-6.5, 6.5]) B(car, 2.4, 0.75, 3.2, 0, 0.45, z, COL.bogie);
        for (const z of [-5.6, 5.6]) B(car, 2.95, 2.1, 1.3, 0, 1.05 + 1.05, z, COL.stripe);   // pintu
        B(carGlass, 2.96, 0.85, 3.6, 0, 2.75, 0, null);
        for (const z of [-3.1, 3.1]) B(carGlass, 2.96, 0.85, 3.4, 0, 2.75, z, null);
        // Lokomotif 16 m: kabin depan menurun + moncong merah
        B(loco, 2.9, 2.75, 12.6, 0, 1.0 + 1.37, -1.6, COL.body);
        B(loco, 2.5, 0.4, 11.5, 0, 3.75 + 0.2, -1.9, COL.roofTrain);
        B(loco, 2.9, 2.2, 3.0, 0, 1.0 + 1.1, 6.0, COL.nose);
        B(loco, 2.7, 0.7, 2.0, 0, 3.2 + 0.35, 5.2, COL.nose);
        B(loco, 2.94, 0.28, 12.4, 0, 1.45, -1.6, COL.stripe);
        B(loco, 2.94, 0.1, 12.4, 0, 1.68, -1.6, COL.stripe2);
        B(loco, 1.2, 0.3, 1.0, 0, 4.15, -3.5, COL.bogie);                 // pantograf
        for (const z of [-5.5, 4.5]) B(loco, 2.4, 0.75, 3.2, 0, 0.45, z, COL.bogie);
        B(locoGlass, 2.5, 0.75, 0.1, 0, 2.95, 4.25, null);                 // kaca depan
        for (const x of [-0.9, 0.9]) B(locoGlass, 0.45, 0.3, 0.1, x, 1.6, 7.55, null);   // lampu sorot
        for (const z of [-4, 0.5]) B(locoGlass, 2.96, 0.8, 2.6, 0, 2.75, z, null);
        return {
            car: mergeParts(car, { color: true }), carGlass: mergeParts(carGlass),
            loco: mergeParts(loco, { color: true }), locoGlass: mergeParts(locoGlass)
        };
    }

    buildTrains() {
        const G = this.trainGeometries();
        const nT = 3;
        const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        const mk = (geo, mat, count, name) => {
            const m = new THREE.InstancedMesh(geo, mat, count);
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;            // instance tersebar di loop 7,6 km
            m.castShadow = name.endsWith('body'); m.receiveShadow = true; m.name = name;
            this.root.add(m);
            return m;
        };
        this.locoMesh = mk(G.loco, bodyMat, nT * 2, 'train_loco_body');
        this.carMesh = mk(G.car, bodyMat, nT * N_CARS, 'train_car_body');
        this.locoGlass = mk(G.locoGlass, this.glassMat, nT * 2, 'train_loco_glass');
        this.carGlass = mk(G.carGlass, this.glassMat, nT * N_CARS, 'train_car_glass');

        // 3 kereta mulai berhenti di stasiun 0..2 (jadwal bergiliran)
        this.stopS = this.stations.map(st => st.s + TRAIN_L / 2);
        this.trains = [];
        for (let i = 0; i < nT; i++) {
            this.trains.push({ s: this.stopS[i], v: 0, dwell: 4 + i * 5, next: (i + 1) % this.stations.length });
        }
        this._a = {}; this._b = {};
        this.update(0);
    }

    poseAt(mesh, idx, sCenter, half, reverse) {
        const a = this.path.at(sCenter + half * 0.75, this._a), b = this.path.at(sCenter - half * 0.75, this._b);
        const f = reverse ? b : a, r = reverse ? a : b;
        const hx = f.x - r.x, hz = f.z - r.z;
        _e.set(-Math.atan2(f.y - r.y, Math.hypot(hx, hz)), Math.atan2(hx, hz), 0);
        _q.setFromEuler(_e);
        _v.set((a.x + b.x) / 2, (a.y + b.y) / 2 + RAIL_TOP, (a.z + b.z) / 2);
        _m4.compose(_v, _q, _one);
        mesh.setMatrixAt(idx, _m4);
    }

    update(dt) {
        if (!this.trains) return;
        dt = Math.min(dt || 0, 0.1);
        const L = this.path.L, nT = this.trains.length;
        for (let i = 0; i < nT; i++) {
            const t = this.trains[i];
            if (t.dwell > 0) {
                t.dwell -= dt; t.v = 0;
                if (t.dwell <= 0) t.dwell = 0;
                else continue;
            }
            const target = this.stopS[t.next];
            const d = (((target - t.s) % L) + L) % L;
            const ahead = this.trains[(i + 1) % nT];
            const gap = (((ahead.s - TRAIN_L - t.s) % L) + L) % L;
            let vT = Math.min(VMAX, Math.sqrt(2 * DEC * Math.max(0, d - 0.2)));
            if (nT > 1) vT = Math.min(vT, Math.sqrt(2 * DEC * Math.max(0, gap - HEADWAY)));
            t.v = t.v < vT ? Math.min(vT, t.v + ACC * dt) : Math.max(vT, t.v - DEC * 1.6 * dt);
            t.s += t.v * dt;
            if (d < 0.6 && t.v < 0.8) {
                t.s = target; t.v = 0; t.dwell = DWELL;
                t.next = (t.next + 1) % this.stations.length;
            }
            t.s = ((t.s % L) + L) % L;
        }
        // Pose lokomotif & gerbong
        for (let i = 0; i < nT; i++) {
            const s = this.trains[i].s;
            let c = s - LOCO_L / 2;
            this.poseAt(this.locoMesh, i * 2, c, LOCO_L / 2, false);
            this.poseAt(this.locoGlass, i * 2, c, LOCO_L / 2, false);
            c -= LOCO_L / 2 + GAP + CAR_L / 2;
            for (let k = 0; k < N_CARS; k++) {
                this.poseAt(this.carMesh, i * N_CARS + k, c, CAR_L / 2, false);
                this.poseAt(this.carGlass, i * N_CARS + k, c, CAR_L / 2, false);
                c -= CAR_L + GAP;
            }
            c += CAR_L / 2 - LOCO_L / 2;
            this.poseAt(this.locoMesh, i * 2 + 1, c, LOCO_L / 2, true);
            this.poseAt(this.locoGlass, i * 2 + 1, c, LOCO_L / 2, true);
        }
        for (const m of [this.locoMesh, this.carMesh, this.locoGlass, this.carGlass]) m.instanceMatrix.needsUpdate = true;

        // Hemat draw call: kereta/lampu/papan (tersebar di loop 7,6 km, tanpa culling) hanya digambar
        // bila titik pandang kamera cukup dekat dengan salah satunya.
        if (this.cityCamera) {
            const c = this.cityCamera.target, far = 300 + 1.3 * (this.cityCamera.distance || 0);
            const near = (x, z) => Math.hypot(x - c.x, z - c.z) < far;
            let tv = false;
            for (const t of this.trains) { const p = this.path.at(t.s - TRAIN_L / 2, this._b); if (near(p.x, p.z)) { tv = true; break; } }
            for (const m of [this.locoMesh, this.carMesh, this.locoGlass, this.carGlass]) m.visible = tv;
            const sv = this.stations.some(st => near(st.x, st.z));
            this.lamps.visible = this.signs.visible = sv;
        }

        // Kamera ikut kereta
        if (this.follow >= 0 && this.cityCamera) {
            const p = this.path.at(this.trains[this.follow].s - TRAIN_L / 2, this._a);
            this.cityCamera.targetDesired.set(p.x, p.y, p.z);
        }
    }

    setNight(isNight) {
        this.lampMat.color.copy(lin(isNight ? COL.lampNight : COL.lampDay));
        this.glassMat.color.copy(lin(isNight ? COL.glassNight : COL.glassDay));
        this.glassMat.emissive.copy(lin(isNight ? 0x8A6A2A : 0x000000));
    }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        // Peta diperbesar: kamera boleh menjelajah seluruh pulau + rel lingkar
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 1400);
        if (cityCamera.camera && cityCamera.camera.far < 2600) {
            cityCamera.camera.far = 2600;
            cityCamera.camera.updateProjectionMatrix();
        }
        const stop = () => {
            this.follow = -1;
            if (this.btn) { this.btn.classList.remove('active'); this.btn.textContent = '🚆 Kereta'; }
        };
        if (cityCamera.canvas) cityCamera.canvas.addEventListener('pointerdown', stop);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-train')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-train';
            btn.title = 'Ikuti kereta AUDIRA RAIL keliling pulau (klik lagi: kereta berikutnya)';
            btn.textContent = '🚆 Kereta';
            group.insertBefore(btn, group.firstChild);
            this.btn = btn;
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.follow = (this.follow + 1) % this.trains.length;
                btn.textContent = `🚆 Kereta ${this.follow + 1}`;
                const a = 35 * Math.PI / 180;
                cityCamera.azimuthDesired = cityCamera.nearestAngle ? cityCamera.nearestAngle(a) : a;
                cityCamera.elevationDesired = 30 * Math.PI / 180;
                cityCamera.distanceDesired = 140;
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-train)').forEach(b => b.addEventListener('click', stop));
        };
        tryAttach();
    }
}
