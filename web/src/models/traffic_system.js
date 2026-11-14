/**
 * AUDIRA-LAND: Traffic System & Low-Poly Vehicles Khas Nusantara
 * Arsitektur kendaraan otentik Indonesia dengan kepatuhan rute:
 * 1. STRICT ASPHALT LANES: Kendaraan HANYA melaju di atas jalan aspal dan jembatan resmi.
 * 2. ANTI-WATER PROTECTION: Dilarang keras melintas di palung air sungai (-16m s/d +16m).
 *    Penyeberangan sungai HANYA melewati 3 Jembatan Penghubung Megah (Grand Bridges).
 * 3. DIVERSE FLEET: Angkot (Biru/Hijau), Sedan Keluarga, Pickup Sayur Kebun, Truk Box, dan Motor Ojek.
 * 4. ELEVATION PACING: Mengikuti ketinggian jembatan (Y = 0.46m) saat menyeberang sungai.
 * 5. CIRI KHAS DESA (village_identity.js): tipe kendaraan dipilih dari bobot desa tempat lajur dimulai.
 *    Desa Have: mobil, taksi, bus kota, ojek. Desa Have-Not: motor, onthel, becak, gerobak, pikap sayur.
 *    Kendaraan besar tidak pernah masuk gang (kelas 1); bus kota hanya di Desa Have (tidak menyeberang).
 */

import { bakeStatic } from '../core/static_batcher.js';
import { GRID_CONFIG, PALETTE } from '../core/constants.js';
import { roadRuns, isLotTile } from '../core/road_network.js';
import { PF, pfPick, pfMesh } from './polyfork_library.js';
import { VILLAGE_IDENTITY, LARGE_VEHICLES, HAVE_ONLY_VEHICLES, villageIdAtX } from '../core/village_identity.js';
import { MultiInstanced } from '../core/multi_instanced.js';

const wx = a => (a - (GRID_CONFIG.HALF_TILES || 108)) * (GRID_CONFIG.TILE_SIZE || 8.0);

// Faktor kecepatan kendaraan tradisional terhadap kecepatan lajur
const TRAD_SPEED = { becak: 0.32, onthel: 0.38, gerobak: 0.2 };
// Kendaraan pribadi warga: punya rumah -> keluar dari kavling, berkeliling, lalu pulang & parkir.
// Kendaraan umum (bus, truk, angkot, foodtruck, layanan) tetap berkeliling tanpa rumah.
const HOME_TYPES = new Set(['car', 'taxi', 'motor', 'ojek', 'becak', 'onthel', 'gerobak', 'pickup']);
// Panjang kendaraan layanan (m), seskala mobil kota 3,9 m
const SERVICE_LEN = {
    'police-cruiser-a2d25e': 3.9, 'ambulance-van-29919a': 4.6,
    'garbage-truck-a7ffbf': 5.4, 'fire-engine-7d476b': 5.8
};

// Kendaraan besar hanya di kolektor/arteri; motor & kendaraan tradisional boleh masuk gang.
// Bus kota hanya di lajur yang seluruhnya di Desa Have.
const laneAllowed = (type, lane) => {
    if (HAVE_ONLY_VEHICLES.has(type) && !lane.westOnly) return false;
    return lane.cls >= 2 || !LARGE_VEHICLES.has(type);
};
// Model Polyfork mobil pribadi (semua varian; jumlah UNIT mobil tetap 8, hanya tersebar ke lebih banyak
// model -> draw call hampir tak bertambah). Taksi terpisah.
const TAXI_ID = 'city-taxi-eefa91';
const CAR_IDS = PF.cars.filter(id => id !== TAXI_ID);
// Varian ringan Desa Have-Not: motor, onthel, gerobak, pikap roda-3. Dicampur ~50% dengan mesh lokal
// prosedural (becak/onthel/gerobak khas) agar ciri khas tetap ada dan tiap model baru hanya muncul
// sedikit unit -> cenderung dilebur MultiInstanced (draw call hampir tak naik). [spec, panjang m]
const PF_LIGHT = {
    motor: [PF.motorbikes, 2.1], onthel: [PF.bicycles, 1.7], gerobak: [PF.carts, 2.2], pickup: [PF.minitruck, 2.8]
};

export class TrafficSystem {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'city_traffic';
        this.scene.add(this.group);

        this.T = GRID_CONFIG.TILE_SIZE || 8.0;
        this.HALF = GRID_CONFIG.HALF_TILES || 108;
        this.vehicles = [];
        this.roadLanes = this.calculateRoadLanes();

        this.materials = this.createMaterials();
        this.spawnInitialFleet();
        this.buildInstancing();
    }

    /**
     * Mengubah armada (ratusan mesh kecil) menjadi InstancedMesh per jenis+warna:
     * ±300 draw call -> ±20. Objek kendaraan asli tetap dipakai sebagai "transform proxy".
     */
    buildInstancing() {
        const sigs = new Map();
        for (const v of this.vehicles) {
            const mats = new Set();
            // Material + geometri: model Polyfork berbagi satu material tapi geometrinya beda
            v.mesh.traverse(o => { if (o.isMesh) { mats.add(o.material.uuid); if (o.geometry.userData.bakeVertexColor) mats.add(o.geometry.uuid); } });
            const sig = v.type + '|' + [...mats].sort().join(',');
            let s = sigs.get(sig);
            if (!s) { s = { template: v.mesh, list: [], meshes: [] }; sigs.set(sig, s); }
            s.list.push(v);
        }
        // Bagian kecil (<1000 vertex) dan model yang hanya 1 unit digabung ke MultiInstanced per
        // kelompok+jenis material (1 draw call per kelompok). Model besar bervolume tetap InstancedMesh
        // sendiri, karena MultiInstanced memproses vertex semua bagian untuk tiap instance.
        const groups = new Map();
        this.multi = [];
        for (const s of sigs.values()) {
            const baked = bakeStatic(s.template, { relativeTo: s.template, remove: false, mergeShadow: true });
            for (const m of baked.children) {
                const nv = m.geometry.attributes.position.count;
                const kind = nv < 1000 ? 'kecil' : s.list.length === 1 ? 'tunggal' : null;
                if (kind && m.material.vertexColors) {
                    const key = kind + '|' + m.material.type;
                    if (!groups.has(key)) groups.set(key, { material: m.material, entries: [] });
                    groups.get(key).entries.push({ s, geo: m.geometry });
                    continue;
                }
                const im = new THREE.InstancedMesh(m.geometry, m.material, s.list.length);
                im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                im.castShadow = !!m.material.isMeshLambertMaterial;
                im.receiveShadow = false;
                im.frustumCulled = false; // instance tersebar di seluruh peta
                s.meshes.push(im);
                this.group.add(im);
            }
            s.list.forEach(v => this.group.remove(v.mesh));
        }
        for (const [key, g] of groups) {
            const total = g.entries.reduce((n, e) => n + e.s.list.length, 0);
            const mm = new MultiInstanced(g.entries.map(e => e.geo), g.material, total);
            mm.name = 'traffic_multi_' + key.replace('|', '_');
            mm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mm.castShadow = !!g.material.isMeshLambertMaterial;
            mm.receiveShadow = false;
            mm.frustumCulled = false;
            let base = 0;
            g.entries.forEach((e, part) => {
                for (let i = 0; i < e.s.list.length; i++) mm.setPart(base + i, part);
                e.base = base;
                base += e.s.list.length;
            });
            this.multi.push({ mesh: mm, entries: g.entries });
            this.group.add(mm);
        }
        this.instSigs = [...sigs.values()];
        this.syncInstances();
    }

    syncInstances() {
        if (!this.instSigs) return;
        for (const g of this.multi || []) {
            for (const e of g.entries) {
                for (let i = 0; i < e.s.list.length; i++) {
                    const m = e.s.list[i].mesh;
                    m.updateMatrix();
                    g.mesh.setMatrixAt(e.base + i, m.matrix);
                }
            }
            g.mesh.instanceMatrix.needsUpdate = true;
        }
        for (const s of this.instSigs) {
            for (let i = 0; i < s.list.length; i++) {
                const m = s.list[i].mesh;
                m.updateMatrix();
                for (const im of s.meshes) im.setMatrixAt(i, m.matrix);
            }
            for (const im of s.meshes) im.instanceMatrix.needsUpdate = true;
        }
    }

    createMaterials() {
        return {
            white: new THREE.MeshLambertMaterial({ color: 0xF5F5F0, roughness: 0.5 }),
            silver: new THREE.MeshLambertMaterial({ color: 0xD0D7DE, roughness: 0.4 }),
            red: new THREE.MeshLambertMaterial({ color: 0xC84435, roughness: 0.6 }),
            blue: new THREE.MeshLambertMaterial({ color: 0x2A6F97, roughness: 0.6 }),
            black: new THREE.MeshLambertMaterial({ color: 0x262626, roughness: 0.7 }),
            yellow: new THREE.MeshLambertMaterial({ color: 0xEAB308, roughness: 0.4 }),
            angkotGreen: new THREE.MeshLambertMaterial({ color: 0x15803D, roughness: 0.5 }),
            angkotBlue: new THREE.MeshLambertMaterial({ color: 0x1D4ED8, roughness: 0.5 }),
            ojekGreen: new THREE.MeshLambertMaterial({ color: 0x16A34A, roughness: 0.4 }),
            teakWood: new THREE.MeshLambertMaterial({ color: 0x78350F, roughness: 0.7 }),
            cabbage: new THREE.MeshLambertMaterial({ color: 0x4ADE80, roughness: 0.6 }),
            carrot: new THREE.MeshLambertMaterial({ color: 0xEA580C, roughness: 0.6 }),
            tire: new THREE.MeshLambertMaterial({ color: 0x18181B, roughness: 0.9 }),
            glass: new THREE.MeshLambertMaterial({ color: 0x93C5FD, roughness: 0.2 }),
            headlight: new THREE.MeshBasicMaterial({ color: 0xFEF08A }),
            becakBody: new THREE.MeshLambertMaterial({ color: 0x1F6F8B }),
            becakHood: new THREE.MeshLambertMaterial({ color: 0xB23A2E }),
            skin: new THREE.MeshLambertMaterial({ color: 0xA8754F }),
            lurik: new THREE.MeshLambertMaterial({ color: 0x5C4632 }),
            caping: new THREE.MeshLambertMaterial({ color: 0xD8B46A }),
            sack: new THREE.MeshLambertMaterial({ color: 0xCDBB95 }),
            taillight: new THREE.MeshBasicMaterial({ color: 0xEF4444 })
        };
    }

    /**
     * Lajur kendaraan per ruas jalan dari peta 2D (road_network.js).
     * Setiap ruas = 2 lajur berlawanan arah. Kendaraan yang tiba di ujung ruas berbelok ke ruas lain
     * yang melewati petak persimpangan itu (jaringan tersambung), atau putar balik di jalan buntu.
     * Tidak ada lagi lajur yang menembus kavling: ruas hanya ada di petak jalan.
     */
    calculateRoadLanes() {
        const lanes = [];
        const T = GRID_CONFIG.TILE_SIZE;
        const tc = t => wx(t) + T / 2;
        const runs = roadRuns();
        const rMin = GRID_CONFIG.RIVER_TILE_MIN_I, rMax = GRID_CONFIG.RIVER_TILE_MAX_I;
        const offsetOf = cls => (cls === 3 ? 2.6 : cls === 2 ? 1.2 : 0.6);
        this.laneIndex = new Map();   // "i,j" -> lajur yang melewati petak itu

        const addPair = (axis, fixedTile, t0, t1, cls) => {
            const pos = tc(fixedTile);
            const off = offsetOf(cls);
            const bridge = axis === 'h' && t0 < rMin && t1 > rMax;
            const base = axis === 'h' ? 7.0 : 6.5;
            const spread = axis === 'h' ? 3.5 : 3.0;
            const k = cls === 1 ? 0.6 : 1.0;   // gang lebih pelan
            const mk = dir => ({
                type: axis === 'h' ? 'horizontal' : 'vertical',
                axis, fixedTile, t0, t1, cls,
                fixedPos: pos - dir * off,       // +arah di sisi kiri sumbu (sama dengan versi lama)
                direction: dir,
                start: dir > 0 ? tc(t0) : tc(t1),
                end: dir > 0 ? tc(t1) : tc(t0),
                isBridgeCrossing: bridge,
                westOnly: axis === 'h' ? t1 < rMin : fixedTile < rMin,
                speed: (base + Math.random() * spread) * k
            });
            const a = mk(1), b = mk(-1);
            a.twin = b; b.twin = a;
            for (const l of [a, b]) {
                lanes.push(l);
                for (let t = t0; t <= t1; t++) {
                    const key = axis === 'h' ? t + ',' + fixedTile : fixedTile + ',' + t;
                    let arr = this.laneIndex.get(key);
                    if (!arr) this.laneIndex.set(key, arr = []);
                    arr.push(l);
                }
            }
        };

        for (const r of runs.v) addPair('v', r.i, r.j0, r.j1, r.cls);
        for (const r of runs.h) addPair('h', r.j, r.i0, r.i1, r.cls);
        return lanes;
    }

    /** Pilih lajur lanjutan di petak ujung lajur kendaraan (belok / lurus / putar balik). */
    continueOnNetwork(v) {
        const lane = v.lane;
        const T = GRID_CONFIG.TILE_SIZE;
        const endT = lane.direction > 0 ? lane.t1 : lane.t0;
        const key = lane.axis === 'h' ? endT + ',' + lane.fixedTile : lane.fixedTile + ',' + endT;
        const [ti, tj] = key.split(',').map(Number);
        const here = l => (l.axis === 'h' ? ti : tj);                   // indeks petak sepanjang sumbu l
        const endOf = l => (l.direction > 0 ? l.t1 : l.t0);
        const cands = (this.laneIndex.get(key) || []).filter(l =>
            l !== lane && l !== lane.twin && laneAllowed(v.type, l) && endOf(l) !== here(l));
        let next = null;
        if (v.state === 'returning' && v.home && cands.length) {
            // Pulang: pilih ruas yang ujungnya paling dekat ke petak jalan rumah (greedy di grid).
            const hi = v.homeLaneTile.i, hj = v.homeLaneTile.j;
            let best = Infinity;
            for (const l of cands) {
                const eAlong = l.direction > 0 ? l.t1 : l.t0;
                const ei = l.axis === 'h' ? eAlong : l.fixedTile;
                const ej = l.axis === 'h' ? l.fixedTile : eAlong;
                const d = Math.abs(ei - hi) + Math.abs(ej - hj);
                if (d < best) { best = d; next = l; }
            }
        }
        if (!next) next = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
        if (!next) next = laneAllowed(v.type, lane.twin) ? lane.twin : lane;   // jalan buntu: putar balik
        const total = Math.abs(next.end - next.start) || 1;
        const pos = wx(here(next)) + T / 2;
        v.lane = next;
        v.progress = next === lane ? 0 : Math.min(0.999, Math.abs(pos - next.start) / total);
        v.speed = next.speed * (TRAD_SPEED[v.type] || 1);
    }

    /** Desa tempat lajur dimulai ('have' | 'have_not'). */
    laneVillage(lane) {
        return villageIdAtX(lane.axis === 'h' ? lane.start : lane.fixedPos);
    }

    spawnInitialFleet() {
        // Armada per desa dari bobot VILLAGE_IDENTITY.<desa>.vehicles (20 kendaraan per desa)
        const PER_VILLAGE = 20;
        for (const id of ['have', 'have_not']) {
            const weights = VILLAGE_IDENTITY[id].vehicles;
            const sum = Object.values(weights).reduce((a, b) => a + b, 0);
            for (const [type, w] of Object.entries(weights)) {
                const count = Math.max(1, Math.round(w / sum * PER_VILLAGE));
                const allowed = this.roadLanes.filter(l => this.laneVillage(l) === id && laneAllowed(type, l));
                if (!allowed.length) continue;
                for (let i = 0; i < count; i++) {
                    const lane = allowed[Math.floor(Math.random() * allowed.length)];
                    this.spawnVehicle(type, lane, Math.random());
                }
            }
        }
    }

    spawnVehicle(type, lane, initialProgress = 0) {
        // Kendaraan modern pakai model Polyfork bila termuat (angkot/ojek/becak/onthel/gerobak tetap khas lokal)
        let mesh = this.createPolyforkMesh(type);
        if (!mesh) switch (type) {
            case 'angkot':
                mesh = this.createAngkotMesh();
                break;
            case 'pickup':
                mesh = this.createPickupSayurMesh();
                break;
            case 'truk':
                mesh = this.createTrukLogistikMesh();
                break;
            case 'ojek':
                mesh = this.createOjekMesh();
                break;
            case 'motor':
                mesh = this.createMotorMesh();
                break;
            case 'bus':
                mesh = this.createBusMesh();
                break;
            case 'becak':
                mesh = this.createBecakMesh();
                break;
            case 'onthel':
                mesh = this.createOnthelMesh();
                break;
            case 'gerobak':
                mesh = this.createGerobakMesh();
                break;
            default:
                mesh = this.createCarMesh();
                break;
        }

        const vehicle = {
            type,
            lane,
            mesh,
            progress: initialProgress,
            speed: lane.speed * (TRAD_SPEED[type] || 1),
            currentPos: new THREE.Vector3(),
            state: 'roaming',
            roam: Infinity,
            home: false
        };

        // Kendaraan pribadi: cari kavling rumah di tepi lajur ini. Dapat -> siklus keluar/pulang.
        if (HOME_TYPES.has(type) && this.assignHome(vehicle)) {
            if (Math.random() < 0.6) {           // sebagian mulai terparkir di rumah (lalu keluar)
                vehicle.state = 'parked';
                vehicle.timer = 2 + Math.random() * 25;
                this.placePark(vehicle);
            } else {
                vehicle.state = 'roaming';
                vehicle.roam = 15 + Math.random() * 40;
                vehicle.retTimer = 0;
                this.updateVehicleTransform(vehicle);
            }
        } else {
            this.updateVehicleTransform(vehicle);
        }
        this.group.add(mesh);
        this.vehicles.push(vehicle);
    }

    wxOf(t) { return (t - this.HALF) * this.T; }
    tcOf(t) { return this.wxOf(t) + this.T / 2; }

    /** Petak (i,j) tempat kendaraan berada sekarang, dihitung dari posisi di lajur. */
    vehicleTile(v) {
        const lane = v.lane;
        const along = lane.axis === 'v' ? v.currentPos.z : v.currentPos.x;
        const t = Math.round(along / this.T + this.HALF - 0.5);
        return lane.axis === 'v' ? { i: lane.fixedTile, j: t } : { i: t, j: lane.fixedTile };
    }

    /** Cari kavling rumah bersebelahan dengan lajur; set parkPos (dekat jalan) + arah hadap. */
    assignHome(v) {
        const lane = v.lane;
        for (let tries = 0; tries < 16; tries++) {
            const t = lane.t0 + Math.floor(Math.random() * (lane.t1 - lane.t0 + 1));
            const laneTile = lane.axis === 'v' ? { i: lane.fixedTile, j: t } : { i: t, j: lane.fixedTile };
            for (const side of (Math.random() < 0.5 ? [-1, 1] : [1, -1])) {
                const lot = lane.axis === 'v'
                    ? { i: lane.fixedTile + side, j: t }
                    : { i: t, j: lane.fixedTile + side };
                if (!isLotTile(lot.i, lot.j)) continue;
                v.home = true;
                v.homeTile = lot;
                v.homeLaneTile = laneTile;
                v.homeAlong = t;
                const lx = this.tcOf(lot.i), lz = this.tcOf(lot.j);
                const rx = this.tcOf(laneTile.i), rz = this.tcOf(laneTile.j);
                // Parkir di tepi kavling yang menghadap jalan (seperti carport), bukan di tengah rumah.
                v.parkPos = { x: lx + (rx - lx) * 0.40, z: lz + (rz - lz) * 0.40 };
                v.parkRot = Math.atan2(rx - lx, rz - lz);   // 0 = hadap +Z
                return true;
            }
        }
        return false;
    }

    placePark(v) {
        v.mesh.position.set(v.parkPos.x, 0.10, v.parkPos.z);
        v.mesh.rotation.y = v.parkRot;
        v.currentPos.set(v.parkPos.x, 0.10, v.parkPos.z);
    }

    /** Dari parkir -> masuk lajur rumah (animasi geser 1,2 dtk). */
    startLeaving(v) {
        const cands = (this.laneIndex.get(v.homeLaneTile.i + ',' + v.homeLaneTile.j) || [])
            .filter(l => laneAllowed(v.type, l));
        if (!cands.length) { v.timer = 8; return; }   // tak ada lajur: tetap parkir, coba lagi nanti
        v.pendingLane = cands[Math.floor(Math.random() * cands.length)];
        const ex = v.pendingLane.axis === 'v' ? v.pendingLane.fixedPos : this.tcOf(v.homeAlong);
        const ez = v.pendingLane.axis === 'v' ? this.tcOf(v.homeAlong) : v.pendingLane.fixedPos;
        v.from = { x: v.parkPos.x, z: v.parkPos.z };
        v.to = { x: ex, z: ez };
        v.rot = Math.atan2(ex - v.parkPos.x, ez - v.parkPos.z);
        v.t = 0; v.dur = 1.2; v.y = 0.10; v.state = 'leaving';
    }

    enterLane(v) {
        const lane = v.pendingLane;
        const total = Math.abs(lane.end - lane.start) || 1;
        v.lane = lane;
        v.progress = Math.min(0.999, Math.abs(this.tcOf(v.homeAlong) - lane.start) / total);
        v.speed = lane.speed * (TRAD_SPEED[v.type] || 1);
        v.state = 'roaming';
        v.roam = 18 + Math.random() * 42;
        v.retTimer = 0;
        this.updateVehicleTransform(v);
    }

    /** Dari lajur -> parkir di rumah (animasi geser 1,2 dtk). */
    startArriving(v) {
        v.from = { x: v.currentPos.x, z: v.currentPos.z };
        v.to = { x: v.parkPos.x, z: v.parkPos.z };
        v.rot = v.parkRot; v.t = 0; v.dur = 1.2; v.y = 0.10; v.state = 'arriving';
    }

    createPolyforkMesh(type) {
        const base = { car: [CAR_IDS, 3.9], taxi: [[TAXI_ID], 3.9], truk: [PF.trucks, 5.4], layanan: [PF.service, 0], foodtruck: [PF.foodtruck, 5.2] };
        this._pfSeed = (this._pfSeed || 0) + 1;
        const seed = this._pfSeed * 2654435761;
        // Varian ringan Have-Not: ~50% pakai model Polyfork, sisanya jatuh ke mesh lokal prosedural
        const spec = base[type] || (PF_LIGHT[type] && !((seed >>> 8) & 1) ? PF_LIGHT[type] : null);
        if (!spec) return null;
        const id = pfPick(spec[0], seed);
        // Bus kota tetap panjang (8 m) agar proporsinya tidak gepeng seperti truk 5,4 m
        const len = SERVICE_LEN[id] || (id && id.includes('bus') ? 8.0 : spec[1]);
        const m = id && pfMesh(id, { length: len });
        if (!m) return null;
        const group = new THREE.Group();
        group.add(m);
        return group;
    }

    createCarMesh() {
        const group = new THREE.Group();
        const colors = [this.materials.white, this.materials.silver, this.materials.red, this.materials.blue, this.materials.black];
        const bodyMat = colors[Math.floor(Math.random() * colors.length)];

        // Bodi Bawah Sedan
        const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 3.4), bodyMat);
        lowerBody.position.y = 0.38;
        lowerBody.castShadow = true;
        group.add(lowerBody);

        // Kabin Atas & Kaca
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.45, 1.8), this.materials.glass);
        cabin.position.set(0, 0.78, -0.15);
        group.add(cabin);

        // Atap Sedan
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.7), bodyMat);
        roof.position.set(0, 1.02, -0.15);
        group.add(roof);

        // Roda
        const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 8);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-0.8, -0.9], [0.8, -0.9], [-0.8, 0.9], [0.8, 0.9]].forEach(([wx, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, this.materials.tire);
            wheel.position.set(wx, 0.24, wz);
            group.add(wheel);
        });

        // Lampu
        this.attachLights(group, 1.71, 0.45, 0.5);

        return group;
    }

    createAngkotMesh() {
        const group = new THREE.Group();
        const colors = [this.materials.angkotBlue, this.materials.angkotGreen, this.materials.yellow];
        const bodyMat = colors[Math.floor(Math.random() * colors.length)];

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.85, 3.6), bodyMat);
        body.position.y = 0.68;
        body.castShadow = true;
        group.add(body);

        const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.35, 2.2), this.materials.glass);
        sideWindow.position.set(0, 0.78, -0.2);
        group.add(sideWindow);

        // Rak Atas Angkot untuk Barang
        const rack = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 1.8), this.materials.black);
        rack.position.set(0, 1.15, -0.2);
        group.add(rack);

        const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 8);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-0.85, -1.0], [0.85, -1.0], [-0.85, 1.0], [0.85, 1.0]].forEach(([wx, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, this.materials.tire);
            wheel.position.set(wx, 0.26, wz);
            group.add(wheel);
        });

        this.attachLights(group, 1.81, 0.5, 0.55);

        return group;
    }

    createPickupSayurMesh() {
        const group = new THREE.Group();

        // Kabin Depan Pickup
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.4), this.materials.white);
        cab.position.set(0, 0.72, 0.9);
        cab.castShadow = true;
        group.add(cab);

        // Bak Terbuka Kayu di Belakang
        const bed = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.45, 2.1), this.materials.teakWood);
        bed.position.set(0, 0.48, -0.7);
        bed.castShadow = true;
        group.add(bed);

        // Muatan Sayuran Segar Desa (Kubis & Wortel)
        for (let i = -0.5; i <= 0.5; i += 0.45) {
            const veg = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), this.materials.cabbage);
            veg.position.set(i, 0.8, -0.6);
            group.add(veg);

            const crt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.2), this.materials.carrot);
            crt.position.set(i, 0.78, -1.1);
            group.add(crt);
        }

        const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 8);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-0.82, -1.0], [0.82, -1.0], [-0.82, 1.0], [0.82, 1.0]].forEach(([wx, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, this.materials.tire);
            wheel.position.set(wx, 0.26, wz);
            group.add(wheel);
        });

        this.attachLights(group, 1.62, 0.45, 0.55);

        return group;
    }

    createTrukLogistikMesh() {
        const group = new THREE.Group();

        // Kepala Truk
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 1.5), this.materials.yellow);
        cab.position.set(0, 0.95, 1.3);
        cab.castShadow = true;
        group.add(cab);

        // Box Kargo Logistik Besar
        const boxCargo = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.6, 3.2), this.materials.silver);
        boxCargo.position.set(0, 1.15, -0.9);
        boxCargo.castShadow = true;
        group.add(boxCargo);

        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 8);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-0.92, -1.6], [0.92, -1.6], [-0.92, -0.7], [0.92, -0.7], [-0.92, 1.3], [0.92, 1.3]].forEach(([wx, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, this.materials.tire);
            wheel.position.set(wx, 0.3, wz);
            group.add(wheel);
        });

        this.attachLights(group, 2.06, 0.55, 0.65);

        return group;
    }

    createOjekMesh() {
        const group = new THREE.Group();

        // Rangka Motor
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 1.6), this.materials.red);
        frame.position.y = 0.45;
        group.add(frame);

        const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 8);
        wheelGeo.rotateZ(Math.PI / 2);
        const wFront = new THREE.Mesh(wheelGeo, this.materials.tire);
        wFront.position.set(0, 0.25, 0.65);
        group.add(wFront);

        const wRear = new THREE.Mesh(wheelGeo, this.materials.tire);
        wRear.position.set(0, 0.25, -0.65);
        group.add(wRear);

        // Driver Jaket & Helm Hijau
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.3), this.materials.ojekGreen);
        torso.position.set(0, 0.85, 0.0);
        group.add(torso);

        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 6), this.materials.ojekGreen);
        helmet.position.set(0, 1.25, 0.05);
        group.add(helmet);

        return group;
    }

    /** Motor bebek warga desa: pengendara bercaping, karung di boncengan. */
    createMotorMesh() {
        const g = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 1.5), this.materials.black);
        frame.position.y = 0.42;
        g.add(frame);
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.12), this.materials.blue);
        shield.position.set(0, 0.62, 0.55);
        g.add(shield);
        const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8);
        wheelGeo.rotateZ(Math.PI / 2);
        [0.6, -0.6].forEach(z => {
            const w = new THREE.Mesh(wheelGeo, this.materials.tire);
            w.position.set(0, 0.24, z);
            g.add(w);
        });
        const sack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.35), this.materials.sack);
        sack.position.set(0, 0.75, -0.6);
        g.add(sack);
        this.addRider(g, 0.62, -0.05, 0.1);
        return g;
    }

    /** Bus kota Desa Have: bodi biru-putih, jendela memanjang, 2 sumbu roda. Hadap +Z. */
    createBusMesh() {
        const g = new THREE.Group();
        const lower = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.9, 7.2), this.materials.angkotBlue);
        lower.position.y = 0.85;
        lower.castShadow = true;
        g.add(lower);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 7.2), this.materials.white);
        upper.position.y = 1.85;
        upper.castShadow = true;
        g.add(upper);
        const windows = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.6, 6.4), this.materials.glass);
        windows.position.set(0, 1.85, -0.2);
        g.add(windows);
        const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 0.06), this.materials.glass);
        windshield.position.set(0, 1.8, 3.61);
        g.add(windshield);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 4.0), this.materials.silver);
        roof.position.set(0, 2.49, -0.5);
        g.add(roof);
        const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 10);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-1.0, 2.4], [1.0, 2.4], [-1.0, -2.3], [1.0, -2.3]].forEach(([x, z]) => {
            const w = new THREE.Mesh(wheelGeo, this.materials.tire);
            w.position.set(x, 0.42, z);
            g.add(w);
        });
        this.attachLights(g, 3.62, 0.7, 0.75);
        return g;
    }

    /** Pengemudi sederhana: badan lurik, kepala, caping. y = tinggi pinggul. */
    addRider(group, y, z, lean = 0) {
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.24), this.materials.lurik);
        torso.position.set(0, y + 0.26, z);
        torso.rotation.x = lean;
        group.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), this.materials.skin);
        head.position.set(0, y + 0.64, z + Math.sin(lean) * 0.3);
        group.add(head);
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.14, 8), this.materials.caping);
        hat.position.set(0, y + 0.8, z + Math.sin(lean) * 0.3);
        group.add(hat);
    }

    /** Becak: kabin penumpang + kap merah di depan, pengayuh di belakang. Hadap +Z. */
    createBecakMesh() {
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.9), this.materials.becakBody);
        seat.position.set(0, 0.6, 0.55);
        g.add(seat);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.7, 0.9), this.materials.becakHood);
        hood.position.set(0, 1.2, 0.45);
        g.add(hood);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.4), this.materials.black);
        frame.position.set(0, 0.45, -0.4);
        g.add(frame);
        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-0.55, 0.55], [0.55, 0.55], [0, -1.05]].forEach(([x, z]) => {
            const w = new THREE.Mesh(wheelGeo, this.materials.tire);
            w.position.set(x, 0.3, z);
            g.add(w);
        });
        this.addRider(g, 0.75, -0.85, -0.2);
        return g;
    }

    /** Sepeda onthel dengan pengendara bercaping. */
    createOnthelMesh() {
        const g = new THREE.Group();
        const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        [0.55, -0.55].forEach(z => {
            const w = new THREE.Mesh(wheelGeo, this.materials.tire);
            w.position.set(0, 0.34, z);
            g.add(w);
        });
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.15), this.materials.black);
        bar.position.set(0, 0.62, 0);
        g.add(bar);
        const basket = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), this.materials.caping);
        basket.position.set(0, 0.8, 0.75);
        g.add(basket);
        this.addRider(g, 0.8, -0.1, 0.15);
        return g;
    }

    /** Gerobak dagangan didorong pedagang (atap terpal + karung). */
    createGerobakMesh() {
        const g = new THREE.Group();
        const cart = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.5), this.materials.teakWood);
        cart.position.set(0, 0.65, 0.35);
        g.add(cart);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 1.7), this.materials.becakHood);
        roof.position.set(0, 1.75, 0.35);
        g.add(roof);
        [[-0.45, -0.35], [0.45, -0.35], [-0.45, 1.05], [0.45, 1.05]].forEach(([x, z]) => {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), this.materials.teakWood);
            post.position.set(x, 1.33, z);
            g.add(post);
        });
        const sack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), this.materials.sack);
        sack.position.set(0, 1.1, 0.4);
        g.add(sack);
        const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10);
        wheelGeo.rotateZ(Math.PI / 2);
        [-0.55, 0.55].forEach(x => {
            const w = new THREE.Mesh(wheelGeo, this.materials.tire);
            w.position.set(x, 0.32, 0.35);
            g.add(w);
        });
        // Pedagang berjalan mendorong di belakang
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.2), this.materials.black);
        legs.position.set(0, 0.4, -0.75);
        g.add(legs);
        this.addRider(g, 0.8, -0.75, 0.25);
        return g;
    }

    attachLights(group, frontZ, lightY, offsetW) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.04), this.materials.headlight);
        hl.position.set(-offsetW, lightY, frontZ);
        group.add(hl);

        const hr = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.04), this.materials.headlight);
        hr.position.set(offsetW, lightY, frontZ);
        group.add(hr);

        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.04), this.materials.taillight);
        tl.position.set(-offsetW, lightY, -frontZ);
        group.add(tl);

        const tr = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.04), this.materials.taillight);
        tr.position.set(offsetW, lightY, -frontZ);
        group.add(tr);
    }

    updateVehicleTransform(v) {
        const lane = v.lane;
        const totalDist = Math.abs(lane.end - lane.start);
        const curDist = v.progress * totalDist;

        let curX, curZ, rotY;

        if (lane.type === 'vertical') {
            curX = lane.fixedPos;
            curZ = lane.start + curDist * lane.direction;
            rotY = lane.direction > 0 ? 0 : Math.PI; // Menghadap Selatan (0) atau Utara (PI)
        } else {
            curZ = lane.fixedPos;
            curX = lane.start + curDist * lane.direction;
            rotY = lane.direction > 0 ? Math.PI / 2 : -Math.PI / 2; // Menghadap Timur (PI/2) atau Barat (-PI/2)
        }

        // Ketinggian Y = permukaan + 0.02 m (Zero-Submerging micro-lift), diukur raycast 2026-11-13:
        // aspal y = 0.055 m, dek jembatan sungai (-18 m s/d +18 m) y = 0.38 m.
        // (Sebelumnya 0.22 / 0.46 -> roda melayang 16 cm di atas aspal.)
        let curY = 0.075;
        if (lane.isBridgeCrossing && curX >= -18.0 && curX <= 18.0) {
            curY = 0.40;
        }

        v.mesh.position.set(curX, curY, curZ);
        v.mesh.rotation.y = rotY;
        v.currentPos.set(curX, curY, curZ);
    }

    update(dt) {
        if (!dt || dt > 0.5) dt = 0.016;

        for (const v of this.vehicles) {
            // Terparkir di rumah: diam sampai timer habis, lalu keluar.
            if (v.state === 'parked') {
                v.timer -= dt;
                if (v.timer <= 0) this.startLeaving(v);
                continue;
            }
            // Transisi keluar/pulang (geser halus antara kavling dan lajur).
            if (v.state === 'leaving' || v.state === 'arriving') {
                v.t += dt / (v.dur || 1);
                const a = Math.min(1, v.t);
                const x = v.from.x + (v.to.x - v.from.x) * a;
                const z = v.from.z + (v.to.z - v.from.z) * a;
                v.mesh.position.set(x, v.y, z);
                v.mesh.rotation.y = v.rot;
                v.currentPos.set(x, v.y, z);
                if (a >= 1) {
                    if (v.state === 'leaving') this.enterLane(v);
                    else { v.state = 'parked'; v.timer = 12 + Math.random() * 30; }
                }
                continue;
            }
            // Berkeliling / menuju pulang di jaringan lajur.
            const totalDist = Math.abs(v.lane.end - v.lane.start) || 1;
            v.progress += (v.speed * dt) / totalDist;
            if (v.state === 'roaming') {
                v.roam -= dt;
                if (v.roam <= 0 && v.home) v.state = 'returning';
            }
            if (v.progress >= 1.0) this.continueOnNetwork(v);
            this.updateVehicleTransform(v);
            // Sudah sampai petak jalan rumah -> parkir. Batas waktu 45 dtk sbg pengaman anti-nyasar.
            if (v.state === 'returning' && v.home) {
                const at = this.vehicleTile(v);
                if (at.i === v.homeLaneTile.i && at.j === v.homeLaneTile.j) this.startArriving(v);
                else { v.retTimer = (v.retTimer || 0) + dt; if (v.retTimer > 45) this.startArriving(v); }
            }
        }
        this.syncInstances();
    }
}
