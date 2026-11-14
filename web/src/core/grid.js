/**
 * AUDIRA-LAND: Generator Grid Deterministik & Jaringan Jalan Otentik Nusantara
 * Mengadopsi arsitektur teruji Republik Netizenia v2 dengan skala 1:1 (T = 8.0m):
 * - DI KIRI (BARAT, X <= -16m / i <= 105): DESA HAVE (Sudah Ada / Terbangun)
 * - DI KANAN (TIMUR, X >= +16m / i >= 110): DESA HAVE-NOT (Belum Dibangun / Proyek & Kavling Kosong)
 * - DI TENGAH (-16m <= X <= +16m / i = 106..109): SUNGAI LUAS (32 METER)
 * - Jembatan Penghubung Megah (Grand Bridges) di setiap perlintasan jalan horizontal
 * - Gapura batas jembatan: "🏡 DESA HAVE (BARAT)" & "🚧 DESA HAVE-NOT (TIMUR)"
 * - Patok BPN Merah-Putih di kavling siap bangun
 * - Mematuhi Zero-Submerging Surface Policy (bottomY >= surfaceY + 0.02)
 */

import { protectMaterial } from './static_batcher.js';
import { buildBridgeSet } from '../models/luxury_bridge.js';
import { alleyCrossings } from '../models/alley_bridges.js';
import { makeWaterMaterial } from './water.js';
import { PALETTE, GRID_CONFIG, DISTRICT_MAP } from './constants.js';
import {
    roadAtH, roadAtV, roadRuns, roadWidth, luxuryBridgeRow,
    isRoadTile, isLotTile, isOpenSpace, isRiverTile
} from './road_network.js';
import { MONUMENT_Z, isMonumentTile } from './city_layout.js';
import { PF, pfReady, pfInstances, pfGeo, pfMaterial } from '../models/polyfork_library.js';
import { VILLAGE_IDENTITY } from './village_identity.js';
import { SurfaceIndex } from './surface_index.js';

// Helper matematis deterministik lokal (jalan & kavling: peta 2D bersama di road_network.js)
const wx = a => (a - (GRID_CONFIG.HALF_TILES || 108)) * (GRID_CONFIG.TILE_SIZE || 8.0);
const isRoad = (a, t) => isRoadTile(a, t);
const isLot = (a, t) => isLotTile(a, t);

export class CityGrid {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'city_grid';
        this.scene.add(this.group);

        this.districts = new Map();
        DISTRICT_MAP.forEach(d => this.districts.set(d.key, d));

        this.plots = [];
        this.plotsByKey = new Map();

        this.highlightMesh = null;
        this.activeDistrict = DISTRICT_MAP.find(d => d.key === GRID_CONFIG.CENTER_DISTRICT_KEY);

        this.buildCityGround();
        this.createPlotHighlightCursor();
    }

    /**
     * Membangun seluruh bentang alam, jalan, sungai pemisah, jembatan, kavling, pohon, dan lampu
     */
    buildCityGround() {
        const T = GRID_CONFIG.TILE_SIZE; // 8.0m
        const HALF = GRID_CONFIG.HALF_TILES; // 108
        const minI = GRID_CONFIG.ACTIVE_MIN_I || 84;
        const maxI = GRID_CONFIG.ACTIVE_MAX_I || 132;
        const minJ = GRID_CONFIG.ACTIVE_MIN_J || 86;
        const maxJ = GRID_CONFIG.ACTIVE_MAX_J || 129;

        const startX = wx(minI);
        const endX = wx(maxI) + T;
        const startZ = wx(minJ);
        const endZ = wx(maxJ) + T;
        const totalW = endX - startX;
        const totalH = endZ - startZ;
        const centerX = (startX + endX) / 2;
        const centerZ = (startZ + endZ) / 2;

        const riverMinX = GRID_CONFIG.RIVER_MIN_X || -16.0;
        const riverMaxX = GRID_CONFIG.RIVER_MAX_X || 16.0;
        const riverWidth = riverMaxX - riverMinX; // 32m

        // =========================================================================
        // 1. DASAR TANAH RUMPUT LUAS (BASE TERRAIN)
        // =========================================================================
        const terrainGeo = new THREE.PlaneGeometry(totalW + 240, totalH + 240);
        terrainGeo.rotateX(-Math.PI / 2);
        const terrainMat = new THREE.MeshLambertMaterial({
            color: PALETTE.GROUND_BASE,
            roughness: 0.85
        });
        const terrain = new THREE.Mesh(terrainGeo, terrainMat);
        terrain.position.set(centerX, 0.0, centerZ);
        terrain.receiveShadow = true;
        this.group.add(terrain);

        // =========================================================================
        // 2. KELOMPOK MATERIAL JALAN, TROTOAR, SUNGAI & JEMBATAN
        // =========================================================================
        const roadArterialMat = new THREE.MeshLambertMaterial({ color: PALETTE.ROAD_ARTERIAL, roughness: 0.7 });
        const roadCollectorMat = new THREE.MeshLambertMaterial({ color: PALETTE.ROAD_COLLECTOR, roughness: 0.75 });
        // Gang kini beraspal (sebelumnya paving krem yang tampak seperti lantai beton)
        const roadAlleyMat = new THREE.MeshLambertMaterial({ color: 0x55585E });
        const markingMat = new THREE.MeshBasicMaterial({ color: PALETTE.ROAD_MARKING });
        const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.SIDEWALK, roughness: 0.85 });
        const curbMat = new THREE.MeshLambertMaterial({ color: PALETTE.CURB, roughness: 0.9 });
        const medianMat = new THREE.MeshLambertMaterial({ color: PALETTE.MEDIAN, roughness: 0.85 });

        // Ciri khas desa (village_identity.js). Semua material polos -> dilebur bakeStatic (0 draw call baru).
        // Desa Have: trotoar keramik abu + kanstin. Desa Have-Not: tanah/makadam, rumput liar, parit kecil.
        const HV = VILLAGE_IDENTITY.have.palette, HN = VILLAGE_IDENTITY.have_not.palette;
        sidewalkMat.color.setHex(HV.sidewalk);
        curbMat.color.setHex(HV.curb);
        const hn = {
            road: {
                3: new THREE.MeshLambertMaterial({ color: 0x7E6B52 }),   // makadam
                2: new THREE.MeshLambertMaterial({ color: HN.road }),    // jalan tanah
                1: new THREE.MeshLambertMaterial({ color: 0xA58A62 })    // jalan setapak
            },
            verge: new THREE.MeshLambertMaterial({ color: HN.sidewalk }),
            ditch: new THREE.MeshLambertMaterial({ color: HN.curb })
        };
        // Jenis permukaan untuk surface_index.js: pohon/props tidak boleh ditanam di aspal, kanstin, parit, air
        for (const m of [roadArterialMat, roadCollectorMat, roadAlleyMat, markingMat, curbMat, hn.road[1], hn.road[2], hn.road[3], hn.ditch]) {
            m.userData.surface = 'road';
        }

        // Material Sungai & Jembatan
        const riverBedMat = new THREE.MeshLambertMaterial({ color: 0x2C4A4F });
        // Air beriak & mengalir (bukan pelat rata yang mirip aspal)
        const riverWaterMat = makeWaterMaterial({ color: 0x3F92B4, repeatU: 3, repeatV: 40, flow: 0.06 });
        riverBedMat.userData.surface = riverWaterMat.userData.surface = 'water';
        const riverShimmerMat = new THREE.MeshBasicMaterial({ color: 0xCFE6EA, transparent: true, opacity: 0.22, depthWrite: false });
        const riverBankMat = new THREE.MeshLambertMaterial({ color: PALETTE.RIVER_BANK || 0x64748B, roughness: 0.9 });
        const bridgeDeckMat = new THREE.MeshLambertMaterial({ color: PALETTE.BRIDGE_DECK || 0x334155, roughness: 0.7 });
        const bridgeRailMat = new THREE.MeshLambertMaterial({ color: PALETTE.BRIDGE_RAIL || 0xE2E8F0, roughness: 0.5 });
        const bridgePierMat = new THREE.MeshLambertMaterial({ color: PALETTE.BRIDGE_PIER || 0x475569, roughness: 0.85 });

        const lotGrassMats = [
            new THREE.MeshLambertMaterial({ color: 0x629B43, roughness: 0.9 }),
            new THREE.MeshLambertMaterial({ color: 0x74A356, roughness: 0.9 }),
            new THREE.MeshLambertMaterial({ color: 0x6DA048, roughness: 0.9 })
        ];
        const lotBorderMat = new THREE.MeshLambertMaterial({ color: PALETTE.PLOT_BORDER, roughness: 0.9 });

        // =========================================================================
        // 3. SUNGAI PEMISAH LUAS (32 METER) DI TENGAH PETA
        // =========================================================================
        this.buildWideRiver(riverMinX, riverMaxX, riverWidth, totalH, centerZ, startZ, endZ, riverBedMat, riverWaterMat, riverShimmerMat, riverBankMat);

        // =========================================================================
        // 4-5. JARINGAN JALAN ORGANIK PER RUAS (peta 2D bersama: core/road_network.js)
        // Arteri lurus, kolektor ber-jog, gang dengan pertigaan & jalan buntu.
        // Tiap ruas dibangun dari ujung ke ujung (bukan baris penuh), lalu dilebur bakeStatic.
        // Ruas di baris jembatan dipotong di sungai; jembatan dibangun terpisah.
        // =========================================================================
        this.buildRoadNetwork({
            T, riverMinX, riverMaxX, riverWidth,
            roadArterialMat, roadCollectorMat, roadAlleyMat, markingMat, sidewalkMat, curbMat, medianMat,
            bridgeDeckMat, bridgeRailMat, bridgePierMat, hn
        });

        // =========================================================================
        // 6. KAVLING RUMAH & PEKARANGAN RUMPUT (LOTS 8m x 8m - EXCLUDE SUNGAI)
        // Menggunakan THREE.InstancedMesh untuk performa tinggi (60 FPS)
        // =========================================================================
        const lotBoxGeo = new THREE.BoxGeometry(7.7, 0.06, 7.7);
        const lotPositionsHave = [];
        const lotPositionsHavenot = [];
        const lotsByMat = [[], [], []];
        const allLots = [];

        for (let j = minJ; j <= maxJ; j++) {
            for (let i = minI; i <= maxI; i++) {
                if (isLot(i, j)) {
                    const plotX = wx(i) + T / 2;
                    const plotZ = wx(j) + T / 2;

                    // Klasifikasikan kavling
                    const isHaveSide = (plotX < riverMinX);

                    // Pad rumput kotak + lis hanya di Desa Have (kota). Have-Not: pekarangan organik (di bawah).
                    if (isHaveSide) {
                        const matIdx = (7 * i + 3 * j) % 3;
                        lotsByMat[matIdx].push({ x: plotX, z: plotZ });
                        allLots.push({ x: plotX, z: plotZ });
                    }
                    if (isHaveSide) {
                        lotPositionsHave.push({ x: plotX, z: plotZ });
                    } else {
                        lotPositionsHavenot.push({ x: plotX, z: plotZ });
                    }

                    // Daftarkan plot ke registry
                    const plotKey = `plot_k12_${i}_${j}`;
                    const plotObj = {
                        key: plotKey,
                        districtKey: 'k12',
                        district: this.activeDistrict,
                        gridI: i,
                        gridJ: j,
                        snapX: plotX,
                        snapZ: plotZ,
                        centerX: plotX,
                        centerZ: plotZ,
                        isHaveSide,
                        width: 1,
                        height: 1
                    };
                    this.plots.push(plotObj);
                    this.plotsByKey.set(plotKey, plotObj);
                }
            }
        }

        // InstancedMesh untuk Pad Rumput Kavling (3 draw calls menggantikan 1.000+)
        const lotDummy = new THREE.Object3D();
        for (let m = 0; m < 3; m++) {
            const list = lotsByMat[m];
            if (list.length > 0) {
                const instMesh = new THREE.InstancedMesh(lotBoxGeo, lotGrassMats[m], list.length);
                instMesh.receiveShadow = true;
                for (let k = 0; k < list.length; k++) {
                    lotDummy.position.set(list[k].x, 0.06, list[k].z);
                    lotDummy.updateMatrix();
                    instMesh.setMatrixAt(k, lotDummy.matrix);
                }
                instMesh.instanceMatrix.needsUpdate = true;
                this.group.add(instMesh);
            }
        }

        // InstancedMesh untuk Lis Garis Pembatas Kavling (1 draw call menggantikan 1.000+)
        if (allLots.length > 0) {
            const borderGeo = new THREE.BoxGeometry(7.85, 0.015, 7.85);
            const borderInst = new THREE.InstancedMesh(borderGeo, lotBorderMat, allLots.length);
            for (let k = 0; k < allLots.length; k++) {
                lotDummy.position.set(allLots[k].x, 0.058, allLots[k].z);
                lotDummy.updateMatrix();
                borderInst.setMatrixAt(k, lotDummy.matrix);
            }
            borderInst.instanceMatrix.needsUpdate = true;
            this.group.add(borderInst);
        }

        // Desa Have-Not: pekarangan berbentuk gumpalan (elips 9 sisi, ukuran/rotasi/geser acak deterministik)
        // yang saling tumpang-tindih, bukan pad kotak 8 m -> kampung tidak terlihat kotak-kotak. 1 draw call.
        this.buildOrganicYards(lotPositionsHavenot);

        // Ruang terbuka (taman/lapangan/alun-alun kecil) dari peta jalan: rumput lebih tua, tidak bisa diklaim.
        // Pad menutup petak penuh (8 m) supaya satu blok taman tampak menyatu. 1 draw call.
        const parkTiles = [];
        const hnOpen = [];   // ruang terbuka Desa Have-Not -> kebun/kolam gumpalan (buildVillageGreens)
        for (let j = minJ; j <= maxJ; j++) {
            for (let i = minI; i <= maxI; i++) {
                if (isOpenSpace(i, j) && wx(i) + T / 2 < riverMinX) parkTiles.push({ i, j, x: wx(i) + T / 2, z: wx(j) + T / 2 });
                else if (isOpenSpace(i, j)) hnOpen.push({ i, j, x: wx(i) + T / 2, z: wx(j) + T / 2 });
            }
        }
        this.parkTiles = parkTiles;
        this.hnOpenTiles = hnOpen;
        this.buildVillageGreens(hnOpen);
        if (parkTiles.length > 0) {
            const parkMat = new THREE.MeshLambertMaterial({ color: 0x4F8F3A });
            const parkInst = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 0.06, T), parkMat, parkTiles.length);
            parkInst.receiveShadow = true;
            parkTiles.forEach((p, k) => {
                lotDummy.position.set(p.x, 0.06, p.z);   // dasar 0.03 > tanah 0.0, sejajar pad kavling
                lotDummy.updateMatrix();
                parkInst.setMatrixAt(k, lotDummy.matrix);
            });
            parkInst.instanceMatrix.needsUpdate = true;
            this.group.add(parkInst);
        }

        // =========================================================================
        // 7. PATOK BATAS BPN MERAH-PUTIH (DI DESA HAVE-NOT / KAVLING SIAP BANGUN)
        // =========================================================================
        if (lotPositionsHavenot.length > 0 && typeof THREE.InstancedMesh === 'function') {
            const totalPegs = lotPositionsHavenot.length * 4;
            const pegBaseMat = new THREE.MeshLambertMaterial({ color: 0xE8E8E8, roughness: 0.9 });
            const pegCapMat = new THREE.MeshLambertMaterial({ color: 0xD32F2F, roughness: 0.8 });

            const baseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), pegBaseMat, totalPegs);
            const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.124, 0.06, 0.124), pegCapMat, totalPegs);

            const dummy = new THREE.Object3D();
            const cornerOffsets = [
                [-3.7, -3.7],
                [3.7, -3.7],
                [-3.7, 3.7],
                [3.7, 3.7]
            ];

            let pegIdx = 0;
            for (const lot of lotPositionsHavenot) {
                for (const [ox, oz] of cornerOffsets) {
                    const px = lot.x + ox;
                    const pz = lot.z + oz;

                    // Pilar beton putih
                    dummy.position.set(px, 0.15, pz);
                    dummy.updateMatrix();
                    baseMesh.setMatrixAt(pegIdx, dummy.matrix);

                    // Kepala cat merah BPN
                    dummy.position.set(px, 0.26, pz);
                    dummy.updateMatrix();
                    capMesh.setMatrixAt(pegIdx, dummy.matrix);

                    pegIdx++;
                }
            }

            baseMesh.instanceMatrix.needsUpdate = true;
            capMesh.instanceMatrix.needsUpdate = true;
            baseMesh.receiveShadow = true;
            capMesh.receiveShadow = true;

            this.group.add(baseMesh);
            this.group.add(capMesh);
        }

        // =========================================================================
        // 8. PEPOHONAN RINDANG KOTA (ROUND TREES, PINES & PALMS - DI LUAR SUNGAI)
        // =========================================================================
        // Indeks permukaan datar (aspal, median, trotoar, pad, gumpalan, air) sebelum ada pohon/props:
        // dipakai penanam pohon di sini dan city_trees.js (getSurfaceIndex) agar tidak ambles/melayang/di aspal
        this.surface = SurfaceIndex.fromGroup(this.group);
        this.plantCityTrees(minI, maxI, minJ, maxJ, T, riverMinX, riverMaxX);
        this.buildVillageDecor();
        // Indeks ulang setelah paving taman, bedengan & dekor desa ada (dipakai city_trees.js)
        this.surface = SurfaceIndex.fromGroup(this.group);

        // =========================================================================
        // 9. LAMPU JALAN & TIANG LISTRIK
        // =========================================================================
        this.placeStreetLamps(minI, maxI, minJ, maxJ, T, riverMinX, riverMaxX);
    }

    /**
     * Geometri jalan per ruas dari peta jalan 2D (road_network.js).
     * - Aspal per ruas; ujung di persimpangan menyatu dengan jalan yang dipotong, ujung buntu berhenti di tepi petak.
     * - Kelas lebih tinggi digambar sedikit lebih tinggi (arteri > kolektor > gang) agar persimpangan tidak z-fighting.
     * - Curb (arteri & kolektor) dan trotoar (kolektor) terputus tepat selebar jalan yang masuk dari samping.
     * - Marka putus-putus, zebra cross, median arteri: InstancedMesh / mesh statis (dilebur bakeStatic).
     */
    buildRoadNetwork(ctx) {
        const { T, riverMinX, riverMaxX, riverWidth } = ctx;
        const runs = roadRuns();
        const W = cls => roadWidth(cls);
        const matOf = cls => (cls === 3 ? ctx.roadArterialMat : cls === 2 ? ctx.roadCollectorMat : ctx.roadAlleyMat);
        const yOf = (cls, axis) => (cls === 3 ? 0.054 : cls === 2 ? 0.052 : 0.050) + (axis === 'h' ? 0.001 : 0);
        const tc = t => wx(t) + T / 2;                         // pusat petak sepanjang sumbu
        const tile = (axis, fixed, t) => (axis === 'h' ? [t, fixed] : [fixed, t]);
        // Kelas jalan tegak lurus yang memotong petak t pada ruas
        const crossCls = (axis, fixed, t) => {
            const [i, j] = tile(axis, fixed, t);
            return axis === 'h' ? roadAtV(i, j) : roadAtH(i, j);
        };
        // Kurangi interval [a,b] dengan daftar potongan [c0,c1]
        const subtract = (a, b, cuts) => {
            let segs = [[a, b]];
            for (const [c0, c1] of cuts) {
                const next = [];
                for (const [s0, s1] of segs) {
                    if (c1 <= s0 || c0 >= s1) { next.push([s0, s1]); continue; }
                    if (c0 > s0) next.push([s0, c0]);
                    if (c1 < s1) next.push([c1, s1]);
                }
                segs = next;
            }
            return segs.filter(([s0, s1]) => s1 - s0 > 0.3);
        };
        // Tambah kotak memanjang di sepanjang sumbu ruas
        const addStrip = (axis, fixedPos, a, b, width, height, y, mat, receive = true) => {
            const len = b - a;
            const geo = axis === 'h' ? new THREE.BoxGeometry(len, height, width) : new THREE.BoxGeometry(width, height, len);
            const m = new THREE.Mesh(geo, mat);
            if (axis === 'h') m.position.set((a + b) / 2, y, fixedPos); else m.position.set(fixedPos, y, (a + b) / 2);
            m.receiveShadow = receive;
            this.group.add(m);
        };

        const markingDashes = [];
        const stripes = [];
        const fences = [];
        const lux = luxuryBridgeRow();
        const bridgeList = []; // semua penyeberangan sungai -> jembatan gaya Gotong Royong (buildBridgeSet)

        const allRuns = [
            ...runs.h.map(r => ({ axis: 'h', fixed: r.j, t0: r.i0, t1: r.i1, cls: r.cls })),
            ...runs.v.map(r => ({ axis: 'v', fixed: r.i, t0: r.j0, t1: r.j1, cls: r.cls }))
        ];

        for (const run of allRuns) {
            const { axis, fixed, cls } = run;
            const w = W(cls);
            const fixedPos = tc(fixed);

            // Bentang daratan: potong petak sungai (hanya ruas horizontal di baris jembatan)
            const spans = [];
            for (let t = run.t0; t <= run.t1; t++) {
                const river = axis === 'h' && isRiverTile(t);
                if (river) continue;
                const last = spans[spans.length - 1];
                if (last && last[1] === t - 1) last[1] = t; else spans.push([t, t]);
            }

            for (const [s0, s1] of spans) {
                // Ujung bentang: persimpangan -> sampai tepi jauh jalan yang dipotong; selain itu tepi petak
                const c0 = crossCls(axis, fixed, s0), c1 = crossCls(axis, fixed, s1);
                const a = c0 ? tc(s0) - W(c0) / 2 : wx(s0);
                const b = c1 ? tc(s1) + W(c1) / 2 : wx(s1) + T;
                if (b - a < 0.5) continue;
                // Sisi desa bentang ini (bentang tidak pernah menembus sungai)
                const east = (axis === 'h' ? (a + b) / 2 : fixedPos) > riverMaxX;

                // Pagar kavling menghadap gang & kolektor (Have: tembok rendah + besi; Have-Not: bambu / beluntas)
                if (cls <= 2) {
                    for (const side of [-1, 1]) {
                        for (let t = s0; t <= s1; t++) {
                            const [ni, nj] = tile(axis, fixed + side, t);
                            if (!isLot(ni, nj)) continue;
                            fences.push({ axis, pos: fixedPos + side * (T / 2 - 0.12), t0: wx(t), t1: wx(t) + T, east,
                                base: cls === 2 ? 0.105 : 0.02, seed: ni * 7919 + nj * 104729 });
                        }
                    }
                }
                // Bagian yang tidak tertutup jalan yang dipotong di ujung (untuk curb/trotoar)
                const ea = c0 ? tc(s0) + W(c0) / 2 : a;
                const eb = c1 ? tc(s1) - W(c1) / 2 : b;

                // 1. Aspal
                const len = b - a;
                const geo = axis === 'h' ? new THREE.PlaneGeometry(len, w) : new THREE.PlaneGeometry(w, len);
                geo.rotateX(-Math.PI / 2);
                const road = new THREE.Mesh(geo, east ? ctx.hn.road[cls] : matOf(cls));
                if (axis === 'h') road.position.set((a + b) / 2, yOf(cls, axis), fixedPos);
                else road.position.set(fixedPos, yOf(cls, axis), (a + b) / 2);
                road.receiveShadow = true;
                this.group.add(road);

                if (cls < 2) continue;   // gang: aspal polos

                // Potongan persimpangan di dalam bentang (untuk median & marka)
                const crossCuts = [];
                for (let t = s0; t <= s1; t++) {
                    const cc = crossCls(axis, fixed, t);
                    if (cc) crossCuts.push([tc(t) - W(cc) / 2 - 0.4, tc(t) + W(cc) / 2 + 0.4]);
                }

                // 2. Median arteri (terputus di persimpangan)
                if (cls === 3) {
                    for (const [m0, m1] of subtract(ea, eb, crossCuts)) {
                        addStrip(axis, fixedPos, m0, m1, 1.2, 0.10, axis === 'h' ? 0.101 : 0.10, ctx.medianMat);
                    }
                }

                // 3. Marka putus-putus (hanya aspal Desa Have; jalan tanah Have-Not tanpa marka)
                const offs = cls === 3 ? [-2.8, 2.8] : [0];
                for (let s = a; !east && s + 2.0 < b; s += 4.0) {
                    const m = s + 2.0;
                    if (crossCuts.some(([q0, q1]) => m > q0 - 1 && m < q1 + 1)) continue;
                    for (const o of offs) {
                        if (axis === 'h') markingDashes.push({ x: m, y: 0.057, z: fixedPos + o, rotY: Math.PI / 2 });
                        else markingDashes.push({ x: fixedPos + o, y: 0.057, z: m, rotY: 0 });
                    }
                }

                // 4. Curb & trotoar per sisi, terputus selebar jalan yang masuk dari samping
                for (const side of [-1, 1]) {
                    const cuts = [];
                    for (let t = s0; t <= s1; t++) {
                        const [ni, nj] = tile(axis, fixed + side, t);
                        if (isRiverTile(ni) || !isRoadTile(ni, nj)) continue;
                        const nc = axis === 'h' ? roadAtV(ni, nj) : roadAtH(ni, nj);
                        // Jalan sejajar yang menempel (mis. pita arteri ganda): putus satu petak penuh
                        cuts.push(nc ? [tc(t) - W(nc) / 2, tc(t) + W(nc) / 2] : [wx(t), wx(t) + T]);
                    }
                    for (const [k0, k1] of subtract(ea, eb, cuts)) {
                        if (east) {
                            // Have-Not: parit kecil di tepi jalan + rumput liar (bukan kanstin & trotoar)
                            addStrip(axis, fixedPos + side * (w / 2 + 0.25), k0, k1, 0.5, 0.02, 0.058, ctx.hn.ditch);
                            if (cls === 2) addStrip(axis, fixedPos + side * (w / 2 + 1.2), k0, k1, 1.4, 0.03, 0.06, ctx.hn.verge);
                            continue;
                        }
                        addStrip(axis, fixedPos + side * w / 2, k0, k1, GRID_CONFIG.CURB_WIDTH,
                            cls === 3 ? 0.12 : 0.10, cls === 3 ? 0.08 : 0.07, ctx.curbMat, false);
                        if (cls === 2) {
                            addStrip(axis, fixedPos + side * (w / 2 + 0.7), k0, k1, GRID_CONFIG.SIDEWALK_WIDTH, 0.06, 0.055, ctx.sidewalkMat);
                        }
                    }
                }

                // 5. Zebra cross: kolektor bertemu arteri (di luar badan arteri), hanya Desa Have
                if (cls === 2 && !east) {
                    let g = null;
                    const flush = () => {
                        if (!g) return;
                        const e0 = tc(g[0]) - W(3) / 2 - 2.0, e1 = tc(g[1]) + W(3) / 2 + 2.0;
                        for (const e of [e0, e1]) {
                            if (e < a + 1 || e > b - 1) continue;
                            for (let k = -2.5; k <= 2.5; k += 1.0) {
                                if (axis === 'h') stripes.push([e, fixedPos + k * 0.95, Math.PI / 2]);
                                else stripes.push([fixedPos + k * 0.95, e, 0]);
                            }
                        }
                        g = null;
                    };
                    for (let t = s0; t <= s1; t++) {
                        if (crossCls(axis, fixed, t) === 3) { if (g) g[1] = t; else g = [t, t]; }
                        else flush();
                    }
                    flush();
                }
            }

            // 6. Jembatan: ruas horizontal yang menembus seluruh koridor sungai
            if (axis === 'h' && run.t0 < GRID_CONFIG.RIVER_TILE_MIN_I && run.t1 > GRID_CONFIG.RIVER_TILE_MAX_I) {
                // Semua penyeberangan memakai gaya Jembatan Gotong Royong (dibangun setelah loop)
                bridgeList.push({ z: fixedPos, w, landmark: fixed === lux });
            }
        }

        // Jembatan Gotong Royong di setiap penyeberangan (jalan grid + gang buntu di tepi sungai)
        for (const c of alleyCrossings()) bridgeList.push({ z: (c.zW + c.zE) / 2, w: roadWidth(1), span: Math.abs(c.zE - c.zW) });
        this.luxuryBridge = buildBridgeSet(this.group, bridgeList, riverMinX, riverMaxX);
        this.luxuryBridgeZ = this.luxuryBridge.landmarkZ;

        this.buildLotFences(fences);

        // InstancedMesh marka putus-putus (1 draw call)
        if (markingDashes.length > 0) {
            const dashGeo = new THREE.PlaneGeometry(0.2, 1.8).rotateX(-Math.PI / 2);
            const dashInst = new THREE.InstancedMesh(dashGeo, ctx.markingMat, markingDashes.length);
            const dm = new THREE.Object3D();
            markingDashes.forEach((d, k) => {
                dm.position.set(d.x, d.y, d.z);
                dm.rotation.set(0, d.rotY, 0);
                dm.updateMatrix();
                dashInst.setMatrixAt(k, dm.matrix);
            });
            dashInst.instanceMatrix.needsUpdate = true;
            this.group.add(dashInst);
        }

        // InstancedMesh zebra cross (1 draw call)
        if (stripes.length) {
            const zGeo = new THREE.PlaneGeometry(0.5, 3.0).rotateX(-Math.PI / 2);
            const zMat = new THREE.MeshBasicMaterial({ color: PALETTE.ROAD_ZEBRA });
            const zInst = new THREE.InstancedMesh(zGeo, zMat, stripes.length);
            const dm = new THREE.Object3D();
            stripes.forEach(([x, z, r], k) => {
                dm.position.set(x, 0.058, z);
                dm.rotation.set(0, r, 0);
                dm.updateMatrix();
                zInst.setMatrixAt(k, dm.matrix);
            });
            zInst.instanceMatrix.needsUpdate = true;
            this.group.add(zInst);
        }
    }

    /**
     * Membangun Sungai Megah 32m, tanggul batu kali, dan sampan nelayan tradisional
     */
    buildWideRiver(riverMinX, riverMaxX, riverWidth, totalH, centerZ, startZ, endZ, riverBedMat, riverWaterMat, riverShimmerMat, riverBankMat) {
        const riverCenterX = (riverMinX + riverMaxX) / 2; // 0.0m
        const riverLength = totalH + 160;

        // 1. Dasar Palung Sungai (Deep Trench)
        const bedGeo = new THREE.BoxGeometry(riverWidth + 1.2, 0.4, riverLength);
        const bedMesh = new THREE.Mesh(bedGeo, riverBedMat);
        bedMesh.position.set(riverCenterX, -0.26, centerZ); // puncak -0.06: di BAWAH air (0.04); dulu 0.05 menutupi air
        bedMesh.receiveShadow = true;
        this.group.add(bedMesh);

        // 2. Permukaan Air Sungai Berkilau (Water Surface)
        const waterGeo = new THREE.PlaneGeometry(riverWidth, riverLength);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMesh = new THREE.Mesh(waterGeo, riverWaterMat);
        waterMesh.position.set(riverCenterX, 0.04, centerZ);
        waterMesh.receiveShadow = true;
        this.group.add(waterMesh);

        // Garis riak statis lama dimatikan: riak kini dari tekstur air yang mengalir (core/water.js).
        // Strip putih transparan ini membuat sungai tampak pucat seperti aspal.
        for (let z = startZ - 40; false && z < endZ + 40; z += 18.0) {
            const ripple1 = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.6).rotateX(-Math.PI / 2), riverShimmerMat);
            ripple1.position.set(riverCenterX - 4, 0.043, z);
            this.group.add(ripple1);

            const ripple2 = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5).rotateX(-Math.PI / 2), riverShimmerMat);
            ripple2.position.set(riverCenterX + 5, 0.043, z + 8);
            this.group.add(ripple2);
        }

        // 3. Tanggul Batu Kali Kokoh (Stone Embankment Walls)
        // Tanggul Tepi Barat (Desa Have)
        const bankWest = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.38, riverLength), riverBankMat);
        bankWest.position.set(riverMinX - 0.5, 0.12, centerZ);
        bankWest.receiveShadow = true;
        this.group.add(bankWest);

        // Tanggul Tepi Timur (Desa Have-Not)
        // Tanggul timur diberi celah di muara saluran ke kali kaki gunung (z 206..244)
        const zA = centerZ - riverLength / 2, zB = centerZ + riverLength / 2;
        for (const [z0, z1] of [[zA, 206], [244, zB]]) {
            if (z1 <= z0) continue;
            const bankEast = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.38, z1 - z0), riverBankMat);
            bankEast.position.set(riverMaxX + 0.5, 0.12, (z0 + z1) / 2);
            bankEast.receiveShadow = true;
            this.group.add(bankEast);
        }

        // 4. Sampan & Perahu Kayu Tradisional di Sungai
        const boatMat = new THREE.MeshLambertMaterial({ color: PALETTE.WOOD || 0x54331C, roughness: 0.8 });
        const paddleMat = new THREE.MeshLambertMaterial({ color: PALETTE.BAMBOO || 0xBFA06A });

        const boatZs = [-110, -50, 15, 65, 135];
        boatZs.forEach((bz, idx) => {
            const boatGroup = new THREE.Group();
            const bx = (idx % 2 === 0) ? -4.5 : 4.5;

            // Badan Perahu Kayu
            const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 4.2), boatMat);
            hull.position.y = 0.12;
            boatGroup.add(hull);

            // Haluan Perahu Segitiga
            const bow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 4), boatMat);
            bow.rotation.x = Math.PI / 2;
            bow.position.set(0, 0.12, 2.7);
            boatGroup.add(bow);

            // Dayung Bambu
            const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), paddleMat);
            paddle.rotation.z = 0.5;
            paddle.rotation.y = 0.3;
            paddle.position.set(0.6, 0.45, 0);
            boatGroup.add(paddle);

            boatGroup.position.set(bx, 0.04, bz);
            boatGroup.rotation.y = (idx * 0.4) - 0.2;
            this.group.add(boatGroup);
        });

        // 5. BANNER MONUMENTAL RAKSASA BATAS KOTA (HAVE VS HAVE-NOT)
        this.buildMonumentalCityBanners(riverMinX, riverMaxX);
    }

    /**
     * Membuat papan gapura penanda batas desa di pintu jembatan
     */
    createBridgeSign(parentGroup, x, z, halfRoadW, title, colorHex) {
        const signGroup = new THREE.Group();
        const postMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
        const boardMat = new THREE.MeshLambertMaterial({ color: colorHex });

        // Tiang Gapura Kiri & Kanan
        const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), postMat);
        p1.position.set(0, 1.2, -halfRoadW - 0.4);
        signGroup.add(p1);

        const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), postMat);
        p2.position.set(0, 1.2, halfRoadW + 0.4);
        signGroup.add(p2);

        // Balok Palang Papan Atas
        const spanW = (halfRoadW + 0.5) * 2;
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, spanW), boardMat);
        board.position.set(0, 2.3, 0);
        signGroup.add(board);

        // Papan Kanvas Teks 3D: satu material per judul, dipakai bersama semua jembatan
        // supaya bakeStatic meleburnya (dulu 1 draw call per papan)
        this._bridgeSignMats = this._bridgeSignMats || new Map();
        let textMat = this._bridgeSignMats.get(title);
        if (!textMat) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = (colorHex === 0x15803D) ? '#166534' : '#9A3412';
        ctx.fillRect(0, 0, 512, 128);
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, 500, 116);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, 256, 64);

        const tex = new THREE.CanvasTexture(canvas);
        textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        this._bridgeSignMats.set(title, textMat);
        }

        const textPlane1 = new THREE.Mesh(new THREE.PlaneGeometry(spanW * 0.9, 0.58), textMat);
        textPlane1.rotation.y = -Math.PI / 2;
        textPlane1.position.set(-0.12, 2.3, 0);
        signGroup.add(textPlane1);

        const textPlane2 = new THREE.Mesh(new THREE.PlaneGeometry(spanW * 0.9, 0.58), textMat);
        textPlane2.rotation.y = Math.PI / 2;
        textPlane2.position.set(0.12, 2.3, 0);
        signGroup.add(textPlane2);

        signGroup.position.set(x, 0.20, z);
        parentGroup.add(signGroup);
    }

    /**
     * Menanam pepohonan alami di luar koridor sungai menggunakan THREE.InstancedMesh
     */

    /**
     * Membangun Banner Monumental Raksasa untuk Kota Have (Barat) dan Kota Have-Not (Timur)
     * Tampak megah di cakrawala kota dengan tipografi tajam, tiang truss kokoh, mahkota atap, dan lampu sorot.
     */
    buildMonumentalCityBanners(riverMinX, riverMaxX) {
        const bannersGroup = new THREE.Group();
        bannersGroup.name = 'monumental_city_banners';

        // -------------------------------------------------------------
        // A. MONUMEN RAKSASA BARAT: KOTA DESA HAVE (X = -21.5m, Z = 0)
        // Arsitektur: Granit hitam-emas, tiang truss emas megah, mahkota Tajuk Joglo
        // -------------------------------------------------------------
        // Huruf raksasa saja (tanpa papan), gaya tulisan bukit "HOLLYWOOD": ±38 m x 10 m,
        // terbaca dari seberang sungai dan dari kamera jauh.
        bannersGroup.add(this.createGiantLetters({
            text: 'DESA HAVE',
            posX: riverMinX - 4.0,
            posZ: MONUMENT_Z,
            fill: '#FBBF24',
            stroke: '#064E3B'
        }));

        // -------------------------------------------------------------
        // B. MONUMEN RAKSASA TIMUR: KOTA DESA HAVE-NOT (X = +21.5m, Z = 0)
        // Arsitektur: Batu kali terakota, tiang bambu/kayu ulin rimbun, mahkota Saung Ijuk
        // -------------------------------------------------------------
        bannersGroup.add(this.createGiantLetters({
            text: 'DESA HAVE-NOT',
            posX: riverMaxX + 4.0,
            posZ: MONUMENT_Z,
            fill: '#FEF3C7',
            stroke: '#7C2D12'
        }));

        // -------------------------------------------------------------
        // C. OVERHEAD GANTRY BANNERS PADA JEMBATAN UTARA (Z = -60) & SELATAN (Z = +60)
        // -------------------------------------------------------------
        // Gerbang di atas jembatan baris 97 dan 118 (road_network.js), pusat petak = (j - 108) * 8 + 4
        [-84, 84].forEach(zCoord => {
            const gantryWest = this.createOverheadGantryBanner({
                posX: riverMinX - 1.8,
                posZ: zCoord,
                rotationY: Math.PI / 2,
                title: '🌟 GERBANG KOTA DESA HAVE (BARAT)',
                sub: 'Wilayah Modern Nusantara Mandiri',
                bgHex: '#064E3B',
                borderHex: '#F59E0B'
            });
            bannersGroup.add(gantryWest);

            const gantryEast = this.createOverheadGantryBanner({
                posX: riverMaxX + 1.8,
                posZ: zCoord,
                rotationY: -Math.PI / 2,
                title: '🚜 GERBANG KOTA DESA HAVE-NOT (TIMUR)',
                sub: 'Kawasan Pedesaan & Pekarangan Warga',
                bgHex: '#78350F',
                borderHex: '#FBBF24'
            });
            bannersGroup.add(gantryEast);
        });

        this.group.add(bannersGroup);
    }

    /**
     * Tulisan nama desa berupa huruf raksasa berdiri di tepi sungai (tanpa papan/tiang).
     * Huruf digambar di kanvas transparan (alphaTest) pada 2 bidang saling membelakangi supaya
     * terbaca dari kedua sisi, plus 1 lapis gelap di belakang tiap sisi sebagai ketebalan huruf.
     * Sejajar sungai (sumbu Z), alas huruf di y = 0.02 (Zero-Submerging).
     */
    createGiantLetters({ text, posX, posZ, fill, stroke, length = 38, height = 10 }) {
        const group = new THREE.Group();
        group.name = `giant_letters_${text}`;

        const W = 2048, H = Math.round(W * height / length);
        const draw = (front) => {
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');
            let size = H * 0.95;
            const font = s => `900 ${s}px "Arial Black", "Segoe UI Black", Impact, sans-serif`;
            ctx.font = font(size);
            const tw = ctx.measureText(text).width;
            if (tw > W * 0.96) { size *= (W * 0.96) / tw; ctx.font = font(size); }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            const y = H - H * 0.04; // huruf kapital duduk di dasar kanvas
            ctx.lineJoin = 'round';
            if (front) {
                ctx.lineWidth = size * 0.12;
                ctx.strokeStyle = stroke;
                ctx.strokeText(text, W / 2, y);
                ctx.fillStyle = fill;
                ctx.fillText(text, W / 2, y);
            } else {
                // Lapis belakang: siluet gelap sedikit lebih tebal = sisi tebal huruf
                ctx.lineWidth = size * 0.16;
                ctx.strokeStyle = stroke;
                ctx.fillStyle = stroke;
                ctx.strokeText(text, W / 2, y);
                ctx.fillText(text, W / 2, y);
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.anisotropy = 4;
            return new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
        };
        const faceMat = draw(true);
        const depthMat = draw(false);
        const geo = new THREE.PlaneGeometry(length, height);

        // Dua sisi: menghadap timur (+X) dan barat (-X); lapis gelap 0.35 m di belakang tiap muka
        [1, -1].forEach(dir => {
            const face = new THREE.Mesh(geo, faceMat);
            face.rotation.y = dir * Math.PI / 2;
            face.position.set(dir * 0.5, height / 2 + 0.02, 0);
            group.add(face);
            const back = new THREE.Mesh(geo, depthMat);
            back.rotation.y = dir * Math.PI / 2;
            back.position.set(dir * 0.15, height / 2 + 0.02, 0);
            group.add(back);
        });

        group.position.set(posX, 0, posZ);
        return group;
    }

    /**
     * Gapura Lengkung Melintang di Atas Jalan (Overhead Highway Gantry)
     */
    createOverheadGantryBanner({ posX, posZ, rotationY, title, sub, bgHex, borderHex }) {
        const gantry = new THREE.Group();
        gantry.position.set(posX, 0.20, posZ);
        gantry.rotation.y = rotationY;

        const steelMat = new THREE.MeshLambertMaterial({ color: 0x334155, roughness: 0.6 });
        const roadSpan = 14.0;

        [-roadSpan / 2, roadSpan / 2].forEach(px => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 6.5, 8), steelMat);
            leg.position.set(px, 3.25, 0);
            leg.castShadow = true;
            gantry.add(leg);
        });

        const beam = new THREE.Mesh(new THREE.BoxGeometry(roadSpan + 1.2, 1.5, 0.4),
            new THREE.MeshLambertMaterial({ color: 0x1E293B })
        );
        beam.position.set(0, 5.8, 0);
        beam.castShadow = true;
        gantry.add(beam);

        // Satu material per judul, dipakai bersama gerbang utara & selatan (dilebur bakeStatic)
        this._gantryMats = this._gantryMats || new Map();
        let mat = this._gantryMats.get(title);
        if (!mat) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = bgHex;
        ctx.fillRect(0, 0, 512, 128);

        ctx.strokeStyle = borderHex;
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, 500, 116);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, 256, 52);

        ctx.fillStyle = borderHex;
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.fillText(sub, 256, 95);

        const tex = new THREE.CanvasTexture(canvas);
        mat = new THREE.MeshBasicMaterial({ map: tex });
        this._gantryMats.set(title, mat);
        }

        const front = new THREE.Mesh(new THREE.PlaneGeometry(roadSpan - 0.4, 1.35), mat);
        front.position.set(0, 5.8, 0.22);
        gantry.add(front);

        const back = new THREE.Mesh(new THREE.PlaneGeometry(roadSpan - 0.4, 1.35), mat);
        back.rotation.y = Math.PI;
        back.position.set(0, 5.8, -0.22);
        gantry.add(back);

        return gantry;
    }

    /**
     * Pekarangan organik Desa Have-Not: tiap kavling diberi 2 gumpalan elips rumput (warna, ukuran,
     * rotasi & geser acak deterministik) yang menumpuk -> petak pekarangan tak beraturan.
     * Tinggi bertingkat 0,002 m per lapis mencegah z-fighting antar gumpalan.
     */
    buildOrganicYards(lots) {
        if (!lots.length) return;
        // Warna per bucket material (bukan instanceColor: bakeStatic hanya membaca material.color).
        // 3 hijau pekarangan + 1 tanah halaman yang disapu. Setelah dilebur tetap 1 draw call.
        const rnd = seed => { const x = Math.sin(seed) * 43758.5453; return x - Math.floor(x); };
        const geo = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2);
        // Desa Have-Not: tanah cokelat bercampur rumput (village_identity: palette.ground)
        const cols = [0x6DA048, 0x78A852, VILLAGE_IDENTITY.have_not.palette.ground, 0x9A8156];
        const buckets = cols.map(() => []);
        const d = new THREE.Object3D();
        let k = 0;
        for (const p of lots) {
            for (let b = 0; b < 2; b++) {
                const s0 = p.x * 12.9898 + p.z * 78.233 + b * 37.719;
                const ox = (rnd(s0) - 0.5) * (b ? 3.0 : 1.6), oz = (rnd(s0 + 1) - 0.5) * (b ? 3.0 : 1.6);
                d.position.set(p.x + ox, 0.045 + (k % 6) * 0.002, p.z + oz);
                d.rotation.set(0, rnd(s0 + 2) * Math.PI, 0);
                const rx = b ? 2.2 + rnd(s0 + 3) * 1.3 : 3.8 + rnd(s0 + 3) * 0.9;
                const rz = b ? 1.8 + rnd(s0 + 4) * 1.2 : 3.2 + rnd(s0 + 4) * 1.0;
                d.scale.set(rx, 1, rz);
                d.updateMatrix();
                const ci = rnd(s0 + 5) < (b ? 0.45 : 0.3) ? 3 : Math.floor(rnd(s0 + 6) * 3);
                buckets[ci].push(d.matrix.clone());
                k++;
            }
        }
        buckets.forEach((list, ci) => {
            if (!list.length) return;
            const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: cols[ci] }), list.length);
            im.receiveShadow = true;
            list.forEach((m, n) => im.setMatrixAt(n, m));
            im.instanceMatrix.needsUpdate = true;
            im.name = 'havenot_yards_' + ci;
            this.group.add(im);
        });
    }

    /**
     * Ruang terbuka Desa Have-Not: kebun rumput tua berbentuk gumpalan (elips besar per petak yang
     * menyatu jadi satu bentuk tak beraturan) + kolam ikan di petak yang dikelilingi ruang terbuka. 2 draw call.
     */
    buildVillageGreens(tiles) {
        if (!tiles.length) return;
        const rnd = seed => { const x = Math.sin(seed) * 43758.5453; return x - Math.floor(x); };
        const set = new Set(tiles.map(t => t.i + ',' + t.j));
        const geo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
        const green = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(0x5E9A42).convertSRGBToLinear() }), tiles.length);
        green.receiveShadow = true;
        const d = new THREE.Object3D();
        const ponds = [];
        const pondTiles = this.pondTiles = new Set();
        tiles.forEach((t, k) => {
            const s0 = t.i * 17.13 + t.j * 5.71;
            d.position.set(t.x + (rnd(s0) - 0.5) * 1.6, 0.05 + (k % 4) * 0.002, t.z + (rnd(s0 + 1) - 0.5) * 1.6);
            d.rotation.set(0, rnd(s0 + 2) * Math.PI, 0);
            d.scale.set(5.2 + rnd(s0 + 3) * 1.2, 1, 4.6 + rnd(s0 + 4) * 1.2);
            d.updateMatrix();
            green.setMatrixAt(k, d.matrix);
            const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => set.has((t.i + a) + ',' + (t.j + b)));
            if (inner && rnd(s0 + 6) < 0.6) { ponds.push({ x: t.x, z: t.z, s0 }); pondTiles.add(t.i + ',' + t.j); }
        });
        green.instanceMatrix.needsUpdate = true;
        green.name = 'havenot_greens';
        this.group.add(green);
        if (!ponds.length) return;
        const pond = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(0x4F8FA6).convertSRGBToLinear() }), ponds.length);
        ponds.forEach((p, k) => {
            d.position.set(p.x + (rnd(p.s0 + 7) - 0.5), 0.07, p.z + (rnd(p.s0 + 8) - 0.5));
            d.rotation.set(0, rnd(p.s0 + 9) * Math.PI, 0);
            d.scale.set(3.4 + rnd(p.s0 + 10), 1, 2.6 + rnd(p.s0 + 11));
            d.updateMatrix();
            pond.setMatrixAt(k, d.matrix);
        });
        pond.instanceMatrix.needsUpdate = true;
        pond.name = 'havenot_ponds';
        pond.material.userData.surface = 'water';
        this.group.add(pond);
    }

    plantCityTrees(minI, maxI, minJ, maxJ, T, riverMinX, riverMaxX) {
        const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.TREE_TRUNK, roughness: 0.9 });
        const leafTopMat = new THREE.MeshLambertMaterial({ color: PALETTE.TREE_LEAF_TOP, roughness: 0.8 });
        const leafMidMat = new THREE.MeshLambertMaterial({ color: PALETTE.TREE_LEAF_MID, roughness: 0.85 });
        const leafDarkMat = new THREE.MeshLambertMaterial({ color: PALETTE.TREE_LEAF_BOT, roughness: 0.85 });

        const roundTrees = [];
        const pineTrees = [];

        const runs = roadRuns();

        // Tanam di median jalan protokol arteri vertikal (bukan di petak persimpangan)
        for (const r of runs.v) {
            if (r.cls !== 3 || isRiverTile(r.i)) continue;
            const posX = wx(r.i) + T / 2;
            for (let j = r.j0 + 2; j <= r.j1 - 2; j += 3) {
                if (roadAtH(r.i, j) !== 0) continue;
                const posZ = wx(j) + T / 2;
                if ((r.i + j) % 2 === 0) roundTrees.push({ x: posX, z: posZ, road: true });
                else pineTrees.push({ x: posX, z: posZ, road: true });
            }
        }

        // Tanam di trotoar jalan kolektor (kedua arah), hanya di sisi yang bersebelahan kavling/taman
        const sideFree = (i, j) => !isRiverTile(i) && !isRoadTile(i, j);
        for (const r of runs.v) {
            if (r.cls !== 2) continue;
            const posX = wx(r.i) + T / 2;
            for (let j = r.j0 + 1; j <= r.j1 - 1; j += 4) {
                if (roadAtH(r.i, j) !== 0) continue;
                const posZ = wx(j) + T / 2;
                if (sideFree(r.i - 1, j)) roundTrees.push({ x: posX - 3.5, z: posZ, road: true });
                if (sideFree(r.i + 1, j)) roundTrees.push({ x: posX + 3.5, z: posZ + 2.0, road: true });
            }
        }
        for (const r of runs.h) {
            if (r.cls !== 2) continue;
            const posZ = wx(r.j) + T / 2;
            for (let i = r.i0 + 1; i <= r.i1 - 1; i += 4) {
                if (isRiverTile(i) || roadAtV(i, r.j) !== 0) continue;
                const posX = wx(i) + T / 2;
                if (posX > riverMinX - 1.0 && posX < riverMaxX + 1.0) continue;
                if (sideFree(i, r.j - 1)) roundTrees.push({ x: posX, z: posZ - 3.5, road: true });
                if (sideFree(i, r.j + 1)) roundTrees.push({ x: posX + 2.0, z: posZ + 3.5, road: true });
            }
        }

        // Pepohonan taman / lapangan (ruang terbuka dari peta jalan), posisi deterministik
        for (const p of (this.parkTiles || [])) {
            const h = (p.i * 73856093) ^ (p.j * 19349663);
            if ((h >>> 0) % 3 === 0) continue;               // sebagian petak dibiarkan lapang
            const ox = (((h >>> 3) % 5) - 2) * 0.7;
            const oz = (((h >>> 7) % 5) - 2) * 0.7;
            // y: angkat 0.02 m di atas pad taman (Zero-Submerging)
            if ((h >>> 11) % 4 === 0) pineTrees.push({ x: p.x + ox, z: p.z + oz, y: 0.02 });
            else roundTrees.push({ x: p.x + ox, z: p.z + oz, y: 0.02 });
        }

        // Model Polyfork (pohon peneduh, palem, pisang, cemara) bila sudah termuat; jika tidak, prosedural lama
        if (pfReady(PF.treesRound) || pfReady(PF.treesPine)) {
            // y dari permukaan nyata di bawah jejak batang (median 0.15, trotoar 0.085, pad taman 0.09) + 0.02;
            // titik yang jatuh di aspal/kanstin/parit/air dibuang (Zero-Submerging & bukan di jalan)
            const S = this.surface;
            const snap = p => {
                const y = S ? S.plant(p.x, p.z, 0.3) : (p.y || 0) + 0.02;
                return y == null ? null : { ...p, y };
            };
            const west = p => p.x < riverMinX;
            // Tepi jalan (median, trotoar): tajuk ramping & tinggi supaya tidak menjorok ke lajur kendaraan.
            // Pohon peneduh lebar (7 m) hanya di taman.
            const HAVE_ROAD = ['street-tree-0d33f3', 'maple-tree-65fa12'];
            const HAVE_PARK = ['broad-canopy-shade-tree-e7c4a2', 'ornamental-front-yard-tree-c6781a', 'maple-tree-65fa12'];
            const HN_ROAD = ['palm-tree-a307da'];
            const round = roundTrees.map(snap).filter(Boolean), pine = pineTrees.map(snap).filter(Boolean);
            const add = (ids, pts, height) => pfInstances(ids, pts, { height }).forEach(m => this.group.add(m));
            add(HAVE_ROAD, round.filter(p => west(p) && p.road), [4.2, 6.0]);
            add(HAVE_PARK, round.filter(p => west(p) && !p.road), [4.2, 6.0]);
            add(['tall-pine-tree-ab4108'], pine.filter(p => west(p) && p.road), [4.5, 6.5]);
            add(PF.treesPine, pine.filter(p => west(p) && !p.road), [4.5, 6.5]);
            add(HN_ROAD, [...round, ...pine].filter(p => !west(p)), [4.8, 6.4]);
            return;
        }

        const dummy = new THREE.Object3D();

        // InstancedMesh untuk Pohon Bulat Peneduh
        if (roundTrees.length > 0) {
            const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.24, 1.8, 6), trunkMat, roundTrees.length);
            const midInst = new THREE.InstancedMesh(new THREE.SphereGeometry(1.3, 7, 5), leafMidMat, roundTrees.length);
            const topInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 6, 5), leafTopMat, roundTrees.length);

            trunkInst.castShadow = true;
            midInst.castShadow = true;
            topInst.castShadow = true;

            for (let k = 0; k < roundTrees.length; k++) {
                const { x, z, y: ly = 0 } = roundTrees[k];
                dummy.rotation.set(0, 0, 0);

                dummy.position.set(x, 1.0 + ly, z);
                dummy.updateMatrix();
                trunkInst.setMatrixAt(k, dummy.matrix);

                dummy.position.set(x, 2.3 + ly, z);
                dummy.updateMatrix();
                midInst.setMatrixAt(k, dummy.matrix);

                dummy.position.set(x + 0.2, 3.0 + ly, z - 0.15);
                dummy.updateMatrix();
                topInst.setMatrixAt(k, dummy.matrix);
            }

            trunkInst.instanceMatrix.needsUpdate = true;
            midInst.instanceMatrix.needsUpdate = true;
            topInst.instanceMatrix.needsUpdate = true;

            this.group.add(trunkInst);
            this.group.add(midInst);
            this.group.add(topInst);
        }

        // InstancedMesh untuk Pohon Cemara
        if (pineTrees.length > 0) {
            const pTrunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.20, 1.2, 6), trunkMat, pineTrees.length);
            const cone1Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 2.2, 7), leafDarkMat, pineTrees.length);
            const cone2Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1.0, 1.8, 7), leafMidMat, pineTrees.length);

            pTrunkInst.castShadow = true;
            cone1Inst.castShadow = true;
            cone2Inst.castShadow = true;

            for (let k = 0; k < pineTrees.length; k++) {
                const { x, z, y: ly = 0 } = pineTrees[k];
                dummy.rotation.set(0, 0, 0);

                dummy.position.set(x, 0.7 + ly, z);
                dummy.updateMatrix();
                pTrunkInst.setMatrixAt(k, dummy.matrix);

                dummy.position.set(x, 2.0 + ly, z);
                dummy.updateMatrix();
                cone1Inst.setMatrixAt(k, dummy.matrix);

                dummy.position.set(x, 3.1 + ly, z);
                dummy.updateMatrix();
                cone2Inst.setMatrixAt(k, dummy.matrix);
            }

            pTrunkInst.instanceMatrix.needsUpdate = true;
            cone1Inst.instanceMatrix.needsUpdate = true;
            cone2Inst.instanceMatrix.needsUpdate = true;

            this.group.add(pTrunkInst);
            this.group.add(cone1Inst);
            this.group.add(cone2Inst);
        }
    }

    /**
     * Memasang lampu jalan di luar koridor sungai menggunakan THREE.InstancedMesh
     */
    placeStreetLamps(minI, maxI, minJ, maxJ, T, riverMinX, riverMaxX) {
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x2A2A2E, roughness: 0.6 });
        const lanternMat = new THREE.MeshBasicMaterial({ color: 0xB8B2A6 });
        protectMaterial(lanternMat); // warna diubah siang/malam lewat setNight()
        this.lanternMat = lanternMat;

        const allLamps = [];
        const lamps = allLamps;

        // Pasang lampu di trotoar jalan kolektor (kedua arah), lengan menjulur ke atas aspal.
        // Hanya di petak non-persimpangan & sisi yang bersebelahan kavling/taman (tidak di atas jalan lain).
        const runs = roadRuns();
        const sideFree = (i, j) => !isRiverTile(i) && !isRoadTile(i, j);
        for (const r of runs.v) {
            if (r.cls !== 2) continue;
            const posX = wx(r.i) + T / 2;
            for (let j = r.j0 + 2; j <= r.j1 - 1; j += 6) {
                if (roadAtH(r.i, j) !== 0) continue;
                const posZ = wx(j) + T / 2;
                if (sideFree(r.i - 1, j)) lamps.push({ x: posX - 3.2, z: posZ, rotY: Math.PI / 2 });
                if (sideFree(r.i + 1, j)) lamps.push({ x: posX + 3.2, z: posZ, rotY: -Math.PI / 2 });
            }
        }
        for (const r of runs.h) {
            if (r.cls !== 2) continue;
            const posZ = wx(r.j) + T / 2;
            for (let i = r.i0 + 2; i <= r.i1 - 1; i += 6) {
                if (isRiverTile(i) || roadAtV(i, r.j) !== 0) continue;
                const posX = wx(i) + T / 2;
                if (posX > riverMinX - 1.0 && posX < riverMaxX + 1.0) continue;
                if (sideFree(i, r.j - 1)) lamps.push({ x: posX, z: posZ - 3.2, rotY: 0 });
                if (sideFree(i, r.j + 1)) lamps.push({ x: posX, z: posZ + 3.2, rotY: Math.PI });
            }
        }

        // Desa Have: tiang lampu modern LED putih. Desa Have-Not: tiang kayu + bohlam kuning (buildWoodLamps).
        const hnLamps = allLamps.filter(l => l.x > riverMaxX);
        lamps.splice(0, lamps.length, ...allLamps.filter(l => l.x <= riverMaxX));
        this.buildWoodLamps(hnLamps);

        if (lamps.length > 0) {
            // Lampu jalan Polyfork (Cobra-Head) bila termuat: tiang + lengan dari model, kotak lampu
            // (lanternMat, menyala malam) ditaruh tepat di bawah kepala lampu.
            const pfLamp = pfGeo(PF.streetLamp[0]);
            const LS = 5.6 / 8.01;                 // tinggi 8 m -> 5.6 m (skala kota)
            const poleInst = pfLamp
                ? new THREE.InstancedMesh(pfLamp, pfMaterial(), lamps.length)
                : new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 3.8, 6), poleMat, lamps.length);
            const armInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), poleMat, pfLamp ? 0 : lamps.length);
            const lanternInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.12, 0.45), lanternMat, lamps.length);

            poleInst.castShadow = true;

            const dummy = new THREE.Object3D();
            const armOffset = new THREE.Vector3(0, 3.65, 0.35);
            const lanternOffset = pfLamp ? new THREE.Vector3(0, 7.72 * LS, 2.45 * LS) : new THREE.Vector3(0, 3.55, 0.7);

            for (let k = 0; k < lamps.length; k++) {
                const { x, z, rotY } = lamps[k];

                // Pole (Polyfork: pusat bbox digeser agar kaki tiang tepat di titik lampu, dasar y=0.12)
                if (pfLamp) {
                    const off = new THREE.Vector3(0, 0, 1.04 * LS).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
                    dummy.rotation.set(0, rotY, 0);
                    dummy.scale.setScalar(LS);
                    dummy.position.set(x + off.x, 0.12, z + off.z);
                    dummy.updateMatrix();
                    poleInst.setMatrixAt(k, dummy.matrix);
                    dummy.scale.setScalar(1);
                } else {
                    dummy.rotation.set(0, 0, 0);
                    dummy.position.set(x, 2.0, z);
                    dummy.updateMatrix();
                    poleInst.setMatrixAt(k, dummy.matrix);
                }

                // Arm (hanya model prosedural)
                if (!pfLamp) {
                const armPos = armOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(new THREE.Vector3(x, 0.10, z));
                dummy.rotation.set(0, rotY, 0);
                dummy.position.copy(armPos);
                dummy.updateMatrix();
                armInst.setMatrixAt(k, dummy.matrix);
                }

                // Lantern
                const lanternPos = lanternOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(new THREE.Vector3(x, 0.10, z));
                dummy.rotation.set(0, rotY, 0);
                dummy.position.copy(lanternPos);
                dummy.updateMatrix();
                lanternInst.setMatrixAt(k, dummy.matrix);
            }

            poleInst.instanceMatrix.needsUpdate = true;
            armInst.instanceMatrix.needsUpdate = true;
            lanternInst.instanceMatrix.needsUpdate = true;

            this.group.add(poleInst);
            this.group.add(armInst);
            this.group.add(lanternInst);

            // Genangan cahaya lampu di aspal (hanya malam): 1 draw call untuk semua lampu
            const poolTex = this.makeGlowTexture();
            const poolMat = new THREE.MeshBasicMaterial({
                map: poolTex, color: 0xCFDCFF, transparent: true, opacity: 0.85,   // LED putih kebiruan
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const poolGeo = new THREE.PlaneGeometry(7.5, 7.5);
            poolGeo.rotateX(-Math.PI / 2);
            const poolInst = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
            for (let k = 0; k < lamps.length; k++) {
                const { x, z, rotY } = lamps[k];
                const p = lanternOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
                dummy.rotation.set(0, 0, 0);
                dummy.position.set(x + p.x, 0.235, z + p.z);
                dummy.updateMatrix();
                poolInst.setMatrixAt(k, dummy.matrix);
            }
            poolInst.instanceMatrix.needsUpdate = true;
            poolInst.userData.noBatch = true;
            poolInst.visible = false;
            poolInst.renderOrder = 2;
            this.lampPools = poolInst;
            this.group.add(poolInst);
        }
    }

    /**
     * Pagar depan kavling (menghadap gang & kolektor), di tepi petak jalan (bukan di kavling: rumah tetap utuh).
     * Celah 1.4 m di tengah tiap petak sebagai pintu pagar. Semua InstancedMesh material polos -> dilebur bakeStatic.
     *  - Desa Have: tembok rendah krem-abu + tiang & pegangan besi.
     *  - Desa Have-Not: pagar bambu (tiang + 2 palang) atau tanaman beluntas (deterministik per kavling).
     */
    buildLotFences(fences) {
        if (!fences.length) return;
        const rnd = seed => { const x = Math.sin(seed) * 43758.5453; return x - Math.floor(x); };
        const P = { wall: [], rail: [], post: [], bPost: [], bRail: [], hedge: [], hedgeTop: [] };
        const d = new THREE.Object3D();
        const put = (list, axis, pos, along, y, len, h, thick) => {
            if (axis === 'h') { d.position.set(along, y, pos); d.scale.set(len, h, thick); }
            else { d.position.set(pos, y, along); d.scale.set(thick, h, len); }
            d.updateMatrix();
            list.push(d.matrix.clone());
        };
        for (const f of fences) {
            const mid = (f.t0 + f.t1) / 2;
            const segs = [[f.t0 + 0.15, mid - 0.7], [mid + 0.7, f.t1 - 0.15]];
            const by = f.base;
            const hedge = f.east && rnd(f.seed) < 0.4;
            for (const [s0, s1] of segs) {
                const L = s1 - s0, c = (s0 + s1) / 2;
                if (!f.east) {
                    put(P.wall, f.axis, f.pos, c, by + 0.21, L, 0.42, 0.16);
                    put(P.rail, f.axis, f.pos, c, by + 0.86, L, 0.05, 0.05);
                    for (const q of [s0 + 0.04, c, s1 - 0.04]) put(P.post, f.axis, f.pos, q, by + 0.65, 0.05, 0.44, 0.05);
                } else if (hedge) {
                    put(P.hedge, f.axis, f.pos, c, by + 0.3, L, 0.6, 0.45);
                    put(P.hedgeTop, f.axis, f.pos, c, by + 0.66, L - 0.2, 0.12, 0.32);
                } else {
                    for (const q of [s0 + 0.05, c, s1 - 0.05]) put(P.bPost, f.axis, f.pos, q, by + 0.4, 0.08, 0.8, 0.08);
                    put(P.bRail, f.axis, f.pos, c, by + 0.32, L, 0.05, 0.05);
                    put(P.bRail, f.axis, f.pos, c, by + 0.62, L, 0.05, 0.05);
                }
            }
        }
        const box = new THREE.BoxGeometry(1, 1, 1);
        const COL = { wall: 0xD9D4CC, rail: 0x2F3437, post: 0x2F3437, bPost: 0xB9A15A,
            bRail: VILLAGE_IDENTITY.have_not.palette.fence, hedge: 0x4C7A34, hedgeTop: 0x5E9440 };
        for (const [k, list] of Object.entries(P)) {
            if (!list.length) continue;
            const im = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: COL[k] }), list.length);
            list.forEach((m, n) => im.setMatrixAt(n, m));
            im.instanceMatrix.needsUpdate = true;
            im.receiveShadow = true;
            im.name = 'lot_fence_' + k;
            this.group.add(im);
        }
    }

    /**
     * Lampu jalan Desa Have-Not: tiang kayu, lengan kayu pendek, bohlam kuning (menyala malam).
     * Tiang & lengan dilebur bakeStatic; bohlam 1 material (dilindungi, warna siang/malam) + genangan cahaya hangat.
     */
    buildWoodLamps(lamps) {
        if (!lamps.length) return;
        const woodMat = new THREE.MeshLambertMaterial({ color: VILLAGE_IDENTITY.have_not.palette.lampPole });
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0x8C7A5E });
        protectMaterial(bulbMat);
        this.bulbMat = bulbMat;
        const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 3.4, 0.14), woodMat, lamps.length);
        const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.0), woodMat, lamps.length);
        const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), bulbMat, lamps.length);
        const d = new THREE.Object3D();
        const up = new THREE.Vector3(0, 1, 0);
        const ends = [];
        lamps.forEach((l, k) => {
            const base = 0.105;   // di atas rumput liar / tanah (Zero-Submerging)
            d.rotation.set(0, l.rotY, 0);
            d.position.set(l.x, base + 1.7, l.z);
            d.updateMatrix();
            pole.setMatrixAt(k, d.matrix);
            const a = new THREE.Vector3(0, 0, 0.45).applyAxisAngle(up, l.rotY);
            d.position.set(l.x + a.x, base + 3.25, l.z + a.z);
            d.updateMatrix();
            arm.setMatrixAt(k, d.matrix);
            const e = new THREE.Vector3(0, 0, 0.9).applyAxisAngle(up, l.rotY);
            d.position.set(l.x + e.x, base + 3.05, l.z + e.z);
            d.updateMatrix();
            bulb.setMatrixAt(k, d.matrix);
            ends.push([l.x + e.x, l.z + e.z]);
        });
        for (const m of [pole, arm, bulb]) { m.instanceMatrix.needsUpdate = true; this.group.add(m); }
        pole.castShadow = true;

        // Genangan cahaya bohlam (malam saja): kuning hangat, lebih kecil dari LED kota
        const poolMat = new THREE.MeshBasicMaterial({
            map: this.makeGlowTexture(), color: 0xFFB65C, transparent: true, opacity: 0.75,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(5.0, 5.0).rotateX(-Math.PI / 2), poolMat, ends.length);
        ends.forEach(([x, z], k) => { d.rotation.set(0, 0, 0); d.position.set(x, 0.235, z); d.updateMatrix(); pools.setMatrixAt(k, d.matrix); });
        pools.instanceMatrix.needsUpdate = true;
        pools.userData.noBatch = true;
        pools.frustumCulled = false;
        pools.visible = false;
        pools.renderOrder = 2;
        this.bulbPools = pools;
        this.group.add(pools);
    }

    /**
     * Unsur khas ruang terbuka tiap desa (deterministik, material polos -> dilebur bakeStatic, 0 draw call):
     *  - Desa Have: taman berpaving + air mancur kecil + bangku di petak taman yang dibiarkan lapang.
     *  - Desa Have-Not: rumpun bambu, jemuran pakaian, dan kebun pekarangan (bedengan sayur) di kebun desa.
     */
    buildVillageDecor() {
        const box = new THREE.BoxGeometry(1, 1, 1);
        const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
        this.benchSpots = [];
        this.jemuranSpots = [];
        this.rondaSpots = [];
        const parts = new Map();   // warna -> { geo, mats[] }
        const d = new THREE.Object3D();
        const add = (geo, color, x, y, z, sx, sy, sz, ry = 0) => {
            const key = geo.uuid + ':' + color;
            let p = parts.get(key);
            if (!p) parts.set(key, p = { geo, color, mats: [] });
            d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.set(sx, sy, sz); d.updateMatrix();
            p.mats.push(d.matrix.clone());
        };
        const h32 = (i, j, k = 0) => {
            let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k + 1, 83492791);
            h = Math.imul(h ^ (h >>> 15), 2246822507);
            return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
        };

        // --- Desa Have: taman berpaving + air mancur (petak taman yang tidak ditanami pohon) ---
        const park = new Set((this.parkTiles || []).map(p => p.i + ',' + p.j));
        for (const p of (this.parkTiles || [])) {
            const h = (p.i * 73856093) ^ (p.j * 19349663);
            if ((h >>> 0) % 3 !== 0) continue;   // sama dengan petak lapang di plantCityTrees
            const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => park.has((p.i + a) + ',' + (p.j + b))).length >= 2;
            const top = 0.09;                       // puncak pad taman
            add(box, 0xC9C2B5, p.x, top + 0.04, p.z, 6.6, 0.04, 6.6);                 // paving
            add(box, 0xA9A194, p.x, top + 0.035, p.z, 6.9, 0.03, 6.9);                // lis paving
            const pv = top + 0.06 + 0.02;           // puncak paving + micro-lift
            if (inner) {
                add(cyl, 0xCFCAC0, p.x, pv + 0.2, p.z, 1.35, 0.4, 1.35);              // kolam air mancur
                add(cyl, 0x7FB9D6, p.x, pv + 0.41, p.z, 1.18, 0.02, 1.18);             // air (diam)
                add(cyl, 0xCFCAC0, p.x, pv + 0.75, p.z, 0.16, 0.7, 0.16);              // tiang tengah
                add(cyl, 0xCFCAC0, p.x, pv + 1.12, p.z, 0.5, 0.1, 0.5);                // mangkuk atas
                add(cyl, 0xBFE3F2, p.x, pv + 1.32, p.z, 0.08, 0.3, 0.08);              // semburan
            }
            for (const [ox, oz, r] of [[2.6, 0, Math.PI / 2], [-2.6, 0, Math.PI / 2], [0, 2.6, 0], [0, -2.6, 0]]) {
                // Bangku menghadap pusat taman; titik duduk dipakai IdleScenes (living_world.js)
                this.benchSpots.push({ x: p.x + ox, y: pv + 0.45, z: p.z + oz, yaw: Math.atan2(ox, oz) });
                add(box, 0x7A5A3A, p.x + ox, pv + 0.42, p.z + oz, 1.4, 0.06, 0.42, r);  // dudukan bangku
                add(box, 0x3A3F44, p.x + ox, pv + 0.2, p.z + oz, 1.2, 0.4, 0.1, r);     // kaki besi
            }
        }

        // --- Desa Have-Not: bambu, jemuran, bedengan sayur (bukan petak kolam) ---
        const ponds = this.pondTiles || new Set();
        const G = 0.058 + 0.02;   // puncak kebun gumpalan + micro-lift
        for (const t of (this.hnOpenTiles || [])) {
            if (ponds.has(t.i + ',' + t.j)) continue;
            const r = h32(t.i, t.j);
            const cx = t.x + (h32(t.i, t.j, 1) < 0.5 ? -2.4 : 2.4);
            const cz = t.z + (h32(t.i, t.j, 2) < 0.5 ? -2.4 : 2.4);
            if (r < 0.34) {
                // Rumpun bambu: 7 batang hijau-kuning, tinggi berbeda, ujung daun
                for (let k = 0; k < 7; k++) {
                    const a = k * 2.4 + r * 6, rr = 0.25 + h32(t.i, t.j, k + 3) * 0.45;
                    const hh = 4.2 + h32(t.i, t.j, k + 10) * 2.6;
                    const bx = cx + Math.cos(a) * rr, bz = cz + Math.sin(a) * rr;
                    add(cyl, k % 2 ? 0x8DA845 : 0xA9B456, bx, G + hh / 2, bz, 0.07, hh, 0.07);
                    add(box, 0x5F8F35, bx, G + hh - 0.1, bz, 0.9, 0.5, 0.35, a);
                }
            } else if (r < 0.6) {
                // Jemuran: 2 tiang bambu, tali, pakaian warna-warni
                const ry = h32(t.i, t.j, 4) * Math.PI;
                const ux = Math.cos(ry), uz = -Math.sin(ry);
                for (const s of [-1.5, 1.5]) add(cyl, 0xB9A15A, cx + ux * s, G + 0.9, cz + uz * s, 0.05, 1.8, 0.05);
                this.jemuranSpots.push({ x: cx - uz * 0.7, z: cz + ux * 0.7, yaw: ry + Math.PI / 2 });
                add(box, 0x5A5148, cx, G + 1.72, cz, 3.0, 0.02, 0.02, ry);
                const cloth = [0xD94F3D, 0x3B6EA8, 0xF2E6C9, 0xE0A93B, 0x6E9E5A];
                for (let k = 0; k < 4; k++) {
                    const s = -1.1 + k * 0.72;
                    add(box, cloth[(k + Math.floor(r * 10)) % cloth.length], cx + ux * s, G + 1.38, cz + uz * s, 0.55, 0.62, 0.02, ry);
                }
            } else if (r >= 0.9) {
                // Gardu ronda bambu (warga ronda duduk di sini malam hari, lihat IdleScenes)
                for (const [px, pz] of [[-0.95, -0.75], [0.95, -0.75], [-0.95, 0.75], [0.95, 0.75]]) add(cyl, 0x9C7B4A, cx + px, G + 1.1, cz + pz, 0.06, 2.2, 0.06);
                add(box, 0xC9B26A, cx, G + 0.4, cz, 2.0, 0.08, 1.6);                 // lantai bambu (bale)
                add(box, 0x8A6A3A, cx, G + 2.26, cz, 2.6, 0.12, 2.2);                // atap
                add(box, 0x6E5230, cx, G + 2.42, cz, 1.6, 0.2, 1.4);                 // bubungan
                this.rondaSpots.push({ x: cx, z: cz, y: G + 0.44 });
            } else if (r < 0.85) {
                // Kebun pekarangan: 3 bedengan tanah + baris sayur
                const ry = h32(t.i, t.j, 5) < 0.5 ? 0 : Math.PI / 2;
                for (let k = -1; k <= 1; k++) {
                    const ox = ry ? 0 : k * 0.9, oz = ry ? k * 0.9 : 0;
                    add(box, 0x6B4A2E, cx + ox, G + 0.08, cz + oz, 0.6, 0.16, 2.6, ry);
                    for (let q = -1; q <= 1; q++) {
                        const qx = ry ? q * 0.8 : 0, qz = ry ? 0 : q * 0.8;
                        add(box, k === 0 ? 0x7DB346 : 0x4F8A35, cx + ox + qx, G + 0.25, cz + oz + qz, 0.38, 0.2, 0.38, q);
                    }
                }
            }
        }

        for (const p of parts.values()) {
            const im = new THREE.InstancedMesh(p.geo, new THREE.MeshLambertMaterial({ color: p.color }), p.mats.length);
            p.mats.forEach((m, n) => im.setMatrixAt(n, m));
            im.instanceMatrix.needsUpdate = true;
            im.castShadow = p.geo === cyl && p.color !== 0x7FB9D6;
            im.receiveShadow = true;
            im.name = 'village_decor';
            this.group.add(im);
        }
    }

    makeGlowTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,0.9)');
        grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
    }

    /** Lampu jalan menyala saat malam/senja, padam saat siang. */
    setNight(isNight) {
        if (this.lanternMat) this.lanternMat.color.setHex(isNight ? VILLAGE_IDENTITY.have.palette.lampLight : 0xB8B2A6);
        if (this.lampPools) this.lampPools.visible = isNight;
        if (this.bulbMat) this.bulbMat.color.setHex(isNight ? VILLAGE_IDENTITY.have_not.palette.lampLight : 0x8C7A5E);
        if (this.bulbPools) this.bulbPools.visible = isNight;
        if (this.luxuryBridge) this.luxuryBridge.setNight(isNight);
    }

    /**
     * Kursor Sorotan Kavling (Golden Bounding Wireframe)
     */
    createPlotHighlightCursor() {
        const size = GRID_CONFIG.PLOT_SIZE;
        const geo = new THREE.BoxGeometry(size, 0.25, size);
        const edges = new THREE.EdgesGeometry(geo);
        const mat = new THREE.LineBasicMaterial({
            color: PALETTE.PLOT_HOVER,
            linewidth: 3
        });

        this.highlightMesh = new THREE.LineSegments(edges, mat);
        this.highlightMesh.position.y = 0.22;
        this.highlightMesh.visible = false;
        this.scene.add(this.highlightMesh);
    }

    setHighlight(snapX, snapZ) {
        if (!this.highlightMesh) return;
        this.highlightMesh.position.set(snapX, 0.22, snapZ);
        this.highlightMesh.visible = true;
    }

    hideHighlight() {
        if (this.highlightMesh) {
            this.highlightMesh.visible = false;
        }
    }

    /**
     * Mendeteksi kavling berdasarkan koordinat dunia (x, z)
     */
    getPlotFromWorld(x, z) {
        const T = GRID_CONFIG.TILE_SIZE;
        const HALF = GRID_CONFIG.HALF_TILES;

        const tileI = Math.floor(x / T + HALF);
        const tileJ = Math.floor(z / T + HALF);

        if (tileI < (GRID_CONFIG.ACTIVE_MIN_I || 84) || tileI > (GRID_CONFIG.ACTIVE_MAX_I || 132) ||
            tileJ < (GRID_CONFIG.ACTIVE_MIN_J || 86) || tileJ > (GRID_CONFIG.ACTIVE_MAX_J || 129)) {
            return null;
        }

        const snapX = wx(tileI) + T / 2;
        const snapZ = wx(tileJ) + T / 2;

        return {
            key: `plot_k12_${tileI}_${tileJ}`,
            districtKey: 'k12',
            district: this.activeDistrict,
            gridI: tileI,
            gridJ: tileJ,
            tileI,
            tileJ,
            snapX,
            snapZ,
            centerX: snapX,
            centerZ: snapZ,
            isLot: isLot(tileI, tileJ),
            isRoad: isRoad(tileI, tileJ),
            isOpenSpace: isOpenSpace(tileI, tileJ) || isMonumentTile(tileI, tileJ),   // taman/lapangan/monumen: tidak bisa diklaim
            isMonument: isMonumentTile(tileI, tileJ),
            isRiver: isRiverTile(tileI),
            width: 1,
            height: 1
        };
    }
}
