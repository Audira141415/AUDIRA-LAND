/**
 * AUDIRA-LAND: Master Game Controller (Tahap 02 + FASE A: Identitas Warga & Klaim Kavling)
 * Mengorkestrasi Scene, Renderer, Kamera 360°, Grid Deterministik, Siklus Siang-Malam WIB,
 * Autentikasi Warga (KTP Digital), Sistem Konstruksi Proyek Nyata, dan Dashboard Super Admin.
 */

import { CityRenderer } from './core/renderer.js';
import { CityCamera } from './core/camera.js';
import { CityLighting } from './core/lighting.js';
import { CityGrid } from './core/grid.js';
import { bakeStatic, updateDetailLOD } from './core/static_batcher.js';
import { BuildingLoader } from './models/building_loader.js';
import { updateCatalogLighting } from './models/netizenia_catalog.js';
import { TrafficSystem } from './models/traffic_system.js';
import { RuralScenery } from './models/rural_scenery.js';
import { buildCoastRoads } from './core/coast_roads.js';
import { SnowValley } from './models/snow_valley.js';
import { AlunAlun } from './models/alun_alun.js';
import { PolyforkFarm } from './models/polyfork_farm.js';
import { preloadPolyfork, pfMaterial, pfGeo } from './models/polyfork_library.js';
import { createHomeKitMesh, loadHomeKit } from './models/home_kit_mesh.js';
import { Pedestrians, ChimneySmoke, TeplokLamps, IdleScenes } from './models/living_world.js';
import { Ambience } from './core/ambience.js';
import { FishingBoats } from './models/fishing_boats.js';
import { Wildlife } from './models/wildlife.js';
import { Zoo } from './models/zoo.js';
// ThemePark dimuat lazy (chunk terpisah, hemat bundel awal); pemakai memeriksa this.themePark
import { HaveNotPlayground } from './models/havenot_playground.js';
import { CityTrees } from './models/city_trees.js';
import { ScaffoldBatcher } from './models/scaffold_batcher.js';
import { CHANNEL } from './models/rural_scenery.js';
import { updateWater, makeWaterMaterial } from './core/water.js';
import { Anglers } from './models/water_life.js';
import { WeatherSystem } from './core/weather.js';
import { applyCityControls } from './core/city_controls.js';
import { CityHUD } from './ui/hud.js';
import { AuthModal } from './ui/auth_modal.js';
import { playerState } from './core/player_state.js';
import { GRID_CONFIG } from './core/constants.js';
import { getDistrictBuildings, getCitySnapshot, isServerId, voteProposal, submitProposal, sendChat, syncRpc, getSupabase } from './api/client.js';
import { ChatPanel } from './ui/chat_panel.js';
// WalkMode dimuat lazy (import dinamis di bawah) agar tidak membebani bundel awal (budget 160 KB)
import { TouchControls } from './ui/touch_controls.js';
import { SUPABASE_CONFIG } from './api/config.js';
import { getProfession, PROFESSION_BONUS_RATE } from './core/professions.js';
import { DISTRICT_MAP } from './core/constants.js';

/**
 * Modal yang hanya dibuka lewat klik (Klaim Kavling, Status Desa, Dashboard Admin) dimuat saat pertama dibuka,
 * supaya kodenya tidak ikut bundel awal (anggaran JS gzip <= 160 KB). Modal dibuat sekali, lalu dipakai ulang.
 * `methods`: nama method modal yang boleh dipanggil dari luar (diteruskan setelah modul termuat).
 */
function lazyModal(load, options, methods = ['show']) {
    let ready = null;
    const proxy = {};
    for (const name of methods) {
        proxy[name] = (...args) => {
            ready = ready || load().then((Modal) => new Modal(options));
            ready.then((modal) => modal[name](...args)).catch((err) => {
                ready = null;
                console.warn('[AUDIRA-LAND] Gagal memuat modal:', err);
            });
        };
    }
    return proxy;
}

class AudiraLandGame {
    constructor() {
        this.canvas = document.getElementById('canvas-3d');
        if (!this.canvas) {
            console.error('Canvas #canvas-3d tidak ditemukan!');
            return;
        }

        // 1. Scene Three.js
        this.scene = new THREE.Scene();

        // 2. Renderer Engine
        this.renderer = new CityRenderer(this.canvas);

        // 3. Kamera 360° Orbit, Pan, & Zoom
        this.camera = new CityCamera(this.canvas, window.innerWidth / window.innerHeight);

        // 4. Sistem Pencahayaan Siang-Malam WIB
        this.lighting = new CityLighting(this.scene);


        // Hubungkan mode pencahayaan Siang/Malam ke seluruh gedung & lampu kota
        this.lighting.onTimeChange(({ isNight }) => {
            if (this.buildingLoader) this.buildingLoader.updateLighting(isNight);
            if (this.grid) this.grid.setNight(isNight);
            if (this.teplok) this.teplok.setNight(isNight);
            if (this.idleScenes) this.idleScenes.setNight(isNight);
            if (this.ambience) this.ambience.setNight(isNight);
            if (this.themePark) this.themePark.setNight(isNight);
            if (this.busTerminals) this.busTerminals.setNight(isNight);
            if (this.airport) this.airport.setNight(isNight);
            if (this.harbor) this.harbor.setNight(isNight);
            if (this.cruiseTerminal) this.cruiseTerminal.setNight(isNight);
            if (this.railway) this.railway.setNight(isNight);
            if (this.stadium) this.stadium.setNight(isNight);
            if (this.playground) this.playground.setNight(isNight);
            if (this.inequality) this.inequality.setNight(isNight);
            updateCatalogLighting(isNight);
        });

        // Kanvas berubah ukuran (rotasi HP, panel dibuka) -> kamera ikut, tidak gepeng
        this.renderer.onResize = (w, h) => this.camera.resize(w, h);
        if (this.renderer.width) this.camera.resize(this.renderer.width, this.renderer.height);

        // 5. Grid Deterministik 5x5 Distrik (jalan, sungai, pohon, lampu dilebur jadi sedikit draw call)
        this.grid = new CityGrid(this.scene);
        // Tanpa chunk: kota cuma ±470 m dan chunk memecah tiap material di garis x=0/z=0
        // (draw call 27 -> ±15 di tampilan jauh/sungai)
        this.grid.group.add(bakeStatic(this.grid.group, { chunkSize: 0 }));
        this.grid.setNight(this.lighting.isNight());

        // 5b. Pemandangan pedesaan Desa Have-Not: sawah berundak, kali, bukit, gunung
        this.scenery = new RuralScenery(this.scene);
        buildCoastRoads(this.scene);   // jalan akses pesisir selatan ke Terminal Pesiar & Pelabuhan
        import('./models/fishing.js').then(m => { this.fishing = new m.Fishing(this.scene, this.scenery, { bakeStatic, makeWaterMaterial, Anglers, preloadPolyfork, pfGeo, pfMaterial }); });   // laut selatan + tambak (lazy)
        this.snowValley = new SnowValley(this.scene); // lembah pinus + gunung es di cakrawala utara
        this.alunAlun = new AlunAlun(this.scene);     // alun-alun di atas sungai perbatasan (z -74..-8)
        // 5b-2. Kebun & peternakan desa (kit Polyfork Cozy Farm, CC BY 4.0), dimuat async
        this.farm = new PolyforkFarm(this.scene);
        // 5b-3. Kebun Binatang AUDIRA di kaki gunung timur Desa Have-Not (zoo.js)
        this.zoo = new Zoo(this.scene);
        this.zoo.attachCameraPreset(this.camera);    // tombol "🦒 Kebun Binatang"

        // 5c. Taman Budaya Nusantara AUDIRA (barat Desa Have, di luar peta aktif) + tombol kamera "Taman"
        //     Dimuat lazy (chunk terpisah) agar tidak membebani bundel awal (budget 160 KB).
        this.themePark = null;
        import('./models/theme_park.js').then(m => {
            this.themePark = new m.ThemePark(this.scene);
            this.themePark.setNight(this.lighting.isNight());
            this.themePark.attachCameraPreset(this.camera);
        }).catch(e => console.warn('[ThemePark] gagal dimuat:', e));

        // 5d. Stadion Cakrawala AUDIRA (selatan Desa Have) & Taman Bermain Warga (selatan Desa Have-Not), di luar peta aktif
        // Stadion dimuat lazy (chunk terpisah, hemat bundel awal); semua pemakai sudah memeriksa this.stadium
        import('./models/have_stadium.js').then(({ HaveStadium }) => {
            this.stadium = new HaveStadium(this.scene);
            this.stadium.setNight(this.lighting.isNight());
            this.stadium.attachCameraPreset(this.camera);
        });
        this.playground = new HaveNotPlayground(this.scene);
        this.playground.setNight(this.lighting.isNight());
        this.playground.attachCameraPreset(this.camera);

        // 5e. Terminal Bis (beberapa titik dekat arteri) & Bandara megah (tepi utara-barat).
        //     Aset dunia statis; dimuat lazy (chunk terpisah) agar bundel awal kecil (budget 160 KB).
        //     docs/SPEC_BUS_TERMINAL_AIRPORT.md
        this.busTerminals = null;
        import('./models/bus_terminals.js').then(({ BusTerminals }) => {
            this.busTerminals = new BusTerminals(this.scene);
            this.busTerminals.setNight(this.lighting.isNight());
            this.busTerminals.attachCameraPreset(this.camera);
        }).catch(e => console.warn('[BusTerminals] gagal dimuat:', e));
        this.airport = null;
        import('./models/airport.js').then(async ({ Airport }) => {
            await preloadPolyfork(['narrow-body-airliner-619183']);   // GLB pesawat (parkir + terbang)
            this.airport = new Airport(this.scene);
            this.airport.setNight(this.lighting.isNight());
            this.airport.attachCameraPreset(this.camera);
        }).catch(e => console.warn('[Airport] gagal dimuat:', e));
        this.harbor = null;
        import('./models/harbor.js').then(({ Harbor }) => {
            this.harbor = new Harbor(this.scene);
            this.harbor.setNight(this.lighting.isNight());
            this.harbor.attachCameraPreset(this.camera);
        }).catch(e => console.warn('[Harbor] gagal dimuat:', e));
        this.railway = null;   // peta diperbesar jadi pulau + kereta api lingkar pulau (lazy)
        import('./models/island_railway.js').then(({ IslandRailway }) => {
            this.railway = new IslandRailway(this.scene);
            this.railway.setNight(this.lighting.isNight());
            this.railway.attachCameraPreset(this.camera);
        }).catch(e => console.warn('[IslandRailway] gagal dimuat:', e));
        this.cruiseTerminal = null;
        import('./models/cruise_terminal.js').then(({ CruiseTerminal }) => {
            this.cruiseTerminal = new CruiseTerminal(this.scene);
            this.cruiseTerminal.setNight(this.lighting.isNight());
            this.cruiseTerminal.attachCameraPreset(this.camera);
        }).catch(e => console.warn('[CruiseTerminal] gagal dimuat:', e));

        // 6. Loader Model Bangunan & Proyek Konstruksi
        this.traffic = new TrafficSystem(this.scene);

        this.buildingLoader = new BuildingLoader(this.scene, {
            onBuildingCompleted: (building) => {
                playerState.addNews(
                    'pembangunan',
                    `🎉 Proyek ${building.title || building.type} telah resmi selesai dibangun dan siap beroperasi!`
                );
                // Simpan status 'selesai' agar refresh tidak memunculkan perancah lagi
                this.markUserBuildingDone(building.id);
                // Perancah gabungan dibangun ulang sekarang (kuncinya tidak selalu berubah saat proyek selesai,
                // sehingga perancah lama tertinggal di samping rumah yang sudah jadi)
                if (this.scaffoldBatch) { this.scaffoldBatch.key = ''; this.scaffoldBatch.timer = Infinity; }
                if (building.id && building.id === playerState.state.homeId) {
                    this.hud.playMelodicCoinSound();
                    this.hud.showToast('🏡 Rumahmu Sudah Jadi!', `${building.title} selesai dibangun. Selamat datang di rumah baru!`, '🎉');
                    if (this.constructionFx) this.constructionFx.celebrate(building.worldX, building.worldZ);
                }
            }
        });

        // 6b. Pohon di dalam kota (Polyfork: pohon jalan, peneduh, bunga, kelapa, pisang, mangga).
        // Memantau layout kavling: bangunan baru otomatis membersihkan pohon di kavlingnya.
        this.cityTrees = new CityTrees(this.scene, this.buildingLoader.layout);
        // Proyek konstruksi & sketsa: 1 draw call bersama, bukan 1 per kavling (anggaran HP <= 100)
        this.scaffoldBatch = new ScaffoldBatcher(this.buildingLoader.buildingsGroup);

        // 6c. Palet Aset Admin: aset yang ditempatkan walikota (docs/SPEC_ADMIN_ASSET_PALETTE.md).
        // Dibaca semua pemain lewat RPC publik list_placements; modul render di-lazy agar bundel awal kecil.
        this.adminPlacements = null;
        this.loadAdminPlacements();

        // 7. Raycaster & Interaksi Pemilihan Kavling
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.selectedPlot = null;

        // 8. Modal Dialog Sistem (FASE A & B)
        this.authModal = new AuthModal({
            onRegistered: (profile) => {
                console.log(`[Warga] Selamat bergabung, ${profile.username} (${profile.profession})!`);
                this.hud.updatePlayerUI(playerState.state);
            },
            // Cari kavling 1x1 kosong di sisi sungai desa pilihan (tidak menabrak jalan/sungai/bangunan)
            findHomeLot: (village) => {
                const layout = this.buildingLoader.layout;
                const side = village.id === 'have' ? -1 : 1;
                const from = village.searchFrom;
                const spot = layout.findNearest(from.i, from.j, 1, 1, '__home__', side);
                if (!spot) return null;
                const [gi, gj] = spot;
                const T = GRID_CONFIG.TILE_SIZE, HALF = GRID_CONFIG.HALF_TILES;
                return { gridI: gi, gridJ: gj, worldX: (gi - HALF) * T + T / 2, worldZ: (gj - HALF) * T + T / 2 };
            },
            onLogin: (citizen) => {
                this.hud.updatePlayerUI(citizen);
                this.hud.showToast('🔑 Selamat Datang Kembali', `${citizen.username} berhasil masuk. Rumahmu tetap di tempatnya.`, '🏡');
                const lot = citizen.assignedLot;
                if (lot) this.camera.recenter(lot.worldX, lot.worldZ);
            },
            onInstagramRegistered: ({ citizen, home, alreadyRegistered }) => {
                this.hud.updatePlayerUI(citizen);

                if (alreadyRegistered) {
                    this.hud.showToast('👋 Selamat Datang Kembali', `${citizen.username} sudah terdaftar. Rumahmu tetap di tempatnya.`, '🏡');
                    if (citizen.assignedLot) this.camera.recenter(citizen.assignedLot.worldX, citizen.assignedLot.worldZ);
                    return;
                }

                this.citizenCount = (this.citizenCount || 0) + 1;
                this.refreshPopulation();
                if (home) {
                    this.buildingLoader.addBuilding(home);
                    this.saveUserBuildingLocally(home);

                    // Petani dapat 1 kotak sawah gratis (sekali) dekat rumahnya, siap ditanami (modul lazy)
                    if (citizen.professionId === 'petani') {
                        import('./core/farmer_grant.js').then(m => m.grantFarmerSawah(this, citizen, home)).catch(e => console.warn('[Petani] grant gagal:', e));
                    }

                    setTimeout(() => {
                        this.camera.recenter(home.worldX, home.worldZ);
                        this.hud.showToast(
                            '🏗️ Rumahmu Sedang Dibangun',
                            `${home.title} mulai dibangun. Selesai dalam 5 menit, pantau hitung mundurnya di peta.`,
                            '⏳'
                        );
                    }, 400);
                }
            }
        });

        this.claimModal = lazyModal(() => import('./ui/claim_modal.js').then((m) => m.ClaimModal), {
            onRequireRegistration: () => {
                alert('Silakan daftarkan identitas KTP Digital Anda terlebih dahulu sebelum mengklaim kavling!');
                this.authModal.show();
            },
            onBuildingCreated: (buildingData) => {
                this.buildingLoader.addBuilding(buildingData);
                this.saveUserBuildingLocally(buildingData);
                playerState.addNews(
                    'pembangunan',
                    `🏗️ ${playerState.state.username} resmi mendirikan ${buildingData.title} di Alun-Alun Merdeka!`
                );
                console.log(`[Proyek] Proyek ${buildingData.title} berhasil didirikan di [${buildingData.grid_i}, ${buildingData.grid_j}].`);

                if (this.selectedPlot) {
                    this.hud.showPlotCard(this.selectedPlot, buildingData);
                }
                this.hud.playMelodicCoinSound();
                this.hud.showToast('🎉 Rumah Berhasil Berdiri!', `Selamat kepada ${playerState.state.username}! ${buildingData.title} telah resmi berdiri kokoh di kavling [${buildingData.grid_i}, ${buildingData.grid_j}].`, '🏡');
            }
        }, ['openForPlot', 'hide']);

        // 8b. Modal Status Desa: HAVE vs HAVE-NOT
        this.villageStatusModal = lazyModal(() => import('./ui/village_status_modal.js').then((m) => m.VillageStatusModal), {
            onNavigateEmptyLot: () => this.navigateEmptyLot(),
            // Data nyata dari peta: bangunan yang benar-benar dimuat + kavling kosong
            getBuildings: () => [...this.buildingLoader.loadedBuildings.values()].map(v => v.data),
            countEmptyLots: () => this.grid.plots.filter(p => !this.buildingLoader.getBuildingAt(p.districtKey, p.gridI, p.gridJ)).length,
            getBuildingMeta: (type) => this.buildingLoader.getBuildingMeta(type)
        });

        // 8c. Panel Pengelola Kota (chunk lazy). Login email+password Supabase; hak walikota dicek server
        //     (supabase/admin_panel.sql). Dependensi disuntikkan agar chunk tidak menarik modul bundel utama.
        this.adminApi = null;   // diisi admin_modal.js setelah server memastikan role walikota
        this.adminModal = lazyModal(() => import('./ui/admin_modal.js').then((m) => m.AdminModal), {
            config: SUPABASE_CONFIG,
            playerState,
            toast: (t, m, i) => this.hud.showToast(t, m, i),
            onAdminChange: (on, api) => {
                this.adminApi = on ? api : null;
                playerState.setAdminVerified(on);
                if (this.selectedPlot && this.hud.currentPlot) this.hud.showPlotCard(this.hud.currentPlot, this.hud.currentBuilding);
            },
            onWorldChanged: (kind, d) => {
                if (kind === 'finishAll') this.buildingLoader.completeAllProjects();
                else if (kind === 'finish') this.buildingLoader.completeBuilding(d.id);
                else if (kind === 'demolish') this.buildingLoader.demolishBuilding(d.id);
                else if (kind === 'controls') applyCityControls(this, d.controls, d.settings);
                else if (kind === 'snapshot') this.pollSnapshot();
                else if (kind === 'placement') this.applyPlacement(d);
            },
            // Pusat kamera (x/z) untuk tombol "Tempat di tengah layar" di tab Aset.
            getCameraTarget: () => ({ x: this.camera.target.x, z: this.camera.target.z }),
            onNavigateEmptyLot: () => this.navigateEmptyLot(),
            // Terbang ke bangunan di peta: posisi dari mesh yang dimuat, atau dari koordinat grid
            onFlyTo: (b) => {
                const item = this.buildingLoader.loadedBuildings.get(b.id);
                const { posX, posZ } = this.buildingLoader.resolveWorldPos(item ? item.data : b);
                this.camera.recenter(posX, posZ);
                this.grid.setHighlight(posX, posZ);
            },
            isLoaded: (id) => this.buildingLoader.loadedBuildings.has(id),
        }, ['show', 'restore']);
        // Hak pengelola wajib login ulang tiap kunjungan: buang sesi admin lama agar tidak auto-nyambung.
        // (Panel Admin & tag SUPER ADMIN hanya muncul setelah login pengelola di sesi ini.)
        try { sessionStorage.removeItem('audira_land_admin_session'); } catch (e) {}

        // 8d. Panel Warga (chunk lazy): profil/KTP, saldo, rumah, kerja & bonus profesi, voting
        this.citizenPanel = lazyModal(() => import('./ui/citizen_panel.js').then((m) => m.CitizenPanel), {
            playerState,
            getProfession,
            bonusRate: PROFESSION_BONUS_RATE,
            getSnapshot: getCitySnapshot,
            vote: voteProposal,
            propose: async (title, type) => {
                const slot = this.findFreeProposalSlot();
                const district = slot ? slot.districtKey : 'k12';
                const i = slot ? slot.gridI : 16;
                const j = slot ? slot.gridJ : 16;
                const rpc = await syncRpc(() => submitProposal(title, type, district, i, j));
                playerState.addNews('kota', `🗳️ ${playerState.state.username} mengusulkan "${title}" untuk divoting warga kota.`);
                if (rpc.status === 'failed') return { error: rpc.message };
                return { ok: true };
            },
            getDistricts: () => DISTRICT_MAP.map((d) => {
                const ring = Math.max(Math.abs(d.gridX - 2), Math.abs(d.gridY - 2));
                return { key: d.key, name: d.name, ring, cost: ring === 0 ? 0 : ring * 15000, unlocked: playerState.isDistrictUnlocked(d.key) };
            }),
            unlockDistrict: (key, cost) => playerState.unlockDistrict(key, cost),
            getBuildingMeta: (type) => this.buildingLoader.getBuildingMeta(type),
            getMyHome: () => {
                const it = this.buildingLoader.loadedBuildings.get(playerState.state.homeId);
                return it ? it.data : null;
            },
            onOpenKTP: () => this.authModal.show('ktp'),
            onRegister: () => this.authModal.show('instagram'),
            onGoHome: () => {
                const lot = playerState.state.assignedLot;
                if (lot) this.camera.recenter(lot.worldX, lot.worldZ);
            },
            toast: (t, m, i) => this.hud.showToast(t, m, i)
        });

        // 9. HUD & Kontrol Antarmuka (Termasuk Presets Kamera 360, Kas Kota, Role Switcher & Super Admin Action)
        this.hud = new CityHUD({
            onRotateCamera: (cw) => this.camera.rotateStep(cw),
            onRecenterCamera: () => this.camera.recenter(0, 0),
            onZoomCamera: (delta) => this.camera.zoom(delta),
            onSetTimePreset: (preset) => this.lighting.setPreset(preset),
            onSetPresetView: (view) => this.camera.setPresetView(view),
            onTogglePrimaryMode: () => this.camera.togglePrimaryMode(),
            onOpenProfile: () => this.authModal.show(),
            onOpenVillageStatus: () => this.villageStatusModal.show(),
            onOpenAdminPanel: () => this.adminModal.show(),
            onOpenCitizenPanel: () => this.citizenPanel.show(),
            onClaimPlot: (plot) => this.claimModal.openForPlot(plot),
            onDeselectPlot: () => this.deselectPlot(),
            getBuildingMeta: (type) => this.buildingLoader.getBuildingMeta(type),
            onWorkBuilding: async (building) => {
                return await playerState.executeWork(building);
            },
            onAdminDemolishBuilding: async (building) => {
                if (!building || !(await this.adminServer('admin_demolish', building))) return;
                this.buildingLoader.demolishBuilding(building.id);
                try {
                    const raw = localStorage.getItem('audira_user_buildings') || '[]';
                    const list = JSON.parse(raw);
                    const filtered = list.filter(b => !(b.district_key === building.district_key && b.grid_i === building.grid_i && b.grid_j === building.grid_j));
                    localStorage.setItem('audira_user_buildings', JSON.stringify(filtered));
                } catch (e) {}
                this.hud.hidePlotCard();
                this.deselectPlot();
                playerState.adminBroadcast(`Super Admin merelokasi & menggusur bangunan di distrik ${building.district_key} [${building.grid_i}, ${building.grid_j}].`);
                this.hud.showToast('🚨 Bangunan Digusur', `Bangunan di kavling [${building.grid_i}, ${building.grid_j}] berhasil digusur. Kavling siap dibangun kembali.`, '🚨');
            },
            onAdminFinishBuilding: async (building) => {
                if (!building || !(await this.adminServer('admin_finish_building', building))) return;
                this.buildingLoader.completeBuilding(building.id);
                playerState.adminBroadcast(`Super Admin meresmikan penyelesaian instan untuk proyek ${building.title}!`);
                this.hud.showToast('⚡ Proyek Selesai', `Proyek ${building.title} berhasil diselesaikan seketika!`, '⚡');
                if (this.selectedPlot) {
                    const b = this.buildingLoader.getBuildingAt(this.selectedPlot.district.key, this.selectedPlot.tileI, this.selectedPlot.tileJ);
                    this.hud.showPlotCard(this.selectedPlot, b || building);
                }
            }
        });

        // Waktu Loop & Telemetri
        this.lastTime = performance.now();
        this.clockInterval = 0;
        this.timerUpdateInterval = 0;

        this.init();
    }

    async init() {
        console.log('🚀 Memulai AUDIRA-LAND (Tata Kelola Super Admin & Warga)...');

        // Setup Event Pointer / Tap Kavling
        this.setupPointerInteractions();

        // Obrolan Warga Kota (local-first + send_chat server bila online)
        this.chat = new ChatPanel({
            playerState,
            send: (msg) => sendChat(msg),
            onRequireRegistration: () => this.authModal.show('instagram')
        });

        // Mode Jalan (avatar tokoh 3D) + joystick/emote — modul dimuat lazy (chunk terpisah)
        this.walk = null;
        import('./core/walk_mode.js').then(m => {
            this.walk = new m.WalkMode(this.scene, this.camera, playerState, this.buildingLoader);
        }).catch(e => console.warn('[WalkMode] gagal dimuat:', e));

        // Sistem Perjalanan darat/laut/udara (bus, kapal feri, pesawat) — chunk lazy
        this.travel = null;
        import('./core/travel_system.js').then(m => {
            this.travel = new m.TravelSystem({
                scene: this.scene, camera: this.camera, hud: this.hud, playerState, getWalk: () => this.walk
            });
        }).catch(e => console.warn('[Travel] gagal dimuat:', e));
        this.touch = new TouchControls({
            onToggleWalk: () => {
                if (!this.walk) {
                    this.hud.showToast('🚶 Mode Jalan', 'Sedang menyiapkan mode jalan, coba lagi sebentar.', '⏳');
                    return false;
                }
                const active = this.walk.toggle();
                document.body.classList.toggle('walking', active);
                this.hud.showToast(active ? '🚶 Mode Jalan Aktif' : '🗺️ Mode Peta',
                    active ? 'Gunakan joystick / WASD untuk berjalan. Shift untuk lari.' : 'Kembali ke tampilan peta kota.', active ? '🚶' : '🗺️');
                return active;
            },
            onEmote: (k) => this.walk?.emote(k),
            isWalkActive: () => !!this.walk && this.walk.isActive()
        });

        // Muat Data Snapshot & Bangunan Perdana di k12 + Bangunan Lokal Warga
        await this.loadStarterWorld();
        this.loadUserBuildingsLocally();

        // Kota Si Kaya & Si Miskin (models/inequality_city.js) DIMATIKAN 2026-11-13 atas keputusan Producer:
        // rumah di kota hanya muncul dari warga terdaftar, jadi kavling kosong tidak diisi bangunan latar.

        this.refreshPopulation();
        // Keramaian ikut jumlah warga (chunk lazy; landing masih menutupi layar saat dimuat)
        import('./core/crowd_scale.js').then(m => { this.applyCrowd = m.applyCrowd; });

        // Landing / gerbang kota: aktifkan tombol "Masuk dengan Instagram" begitu bangunan kota dimuat
        // (chunk lazy kecil: markup gerbang sudah tampil dari index.html, modul ini hanya mengaktifkan tombol)
        import('./ui/landing.js').then(({ mountLanding }) =>
            mountLanding({ authModal: this.authModal, camera: this.camera, playerState, citizenCount: this.citizenCount || 0,
                onAdmin: () => this.adminModal.show() }));

        // FASE C: Dunia Hidup (pejalan kaki, asap cerobong, lampu teplok, suara suasana)
        this.setupLivingWorld();

        // Cuaca & langit: awan, hujan + genangan, bintang & bulan, kabut pagi sawah (weather.js)
        this.weather = new WeatherSystem(this.scene, this.lighting);
        this.weather.mountButton(document.querySelector('.hud-camera-controls'));
        // Siklus siang-malam otomatis (default): tombol "🔁 Siklus" di bar waktu
        this.lighting.mountCycleButton(document.querySelector('.hud-time-controls'));

        // Kendali Pemkot (cuaca/waktu/lalu lintas/keramaian/acara) dari snapshot server; disegarkan tiap 45 dtk
        this.playerState = playerState;
        this.applySnapshot(this.snapshot);
        // Default: polling snapshot tiap 45 dtk. Bila Supabase Realtime subscribe, interval
        // ini melambat jadi 120 dtk (jaring pengaman) dan push realtime jadi jalur utama.
        this.realtimeOn = false;
        this._pollTimer = setInterval(() => { if (!document.hidden) this.pollSnapshot(); }, 45000);
        this.setupRealtime();

        // Mulai Loop Animasi
        this.animate();
    }

    /**
     * Animasi proyek pembangunan (rumah tumbuh, pekerja, debu, pil progres) dimuat lazy:
     * chunk terpisah, hanya diunduh begitu ada bangunan berstatus 'proyek'.
     */
    /** Angka 👥 HUD: maksimum dari jumlah server dan warga terdaftar di perangkat ini. */
    refreshPopulation() {
        const local = (playerState.citizensList || []).filter(c => c.isRegistered).length;
        this.population = Math.max(this.citizenCount || 0, local);
        this.hud.setPopulation(this.population);
    }

    /**
     * Realtime ringan: ambil bangunan distrik dari server dan tambahkan rumah/usaha warga
     * baru (punya owner_id) yang belum ada di peta. Tidak menghapus apa pun. Dipanggil dari pollSnapshot.
     */
    /**
     * Supabase Realtime: push perubahan (chat/bangunan/kabar/usulan) tanpa menunggu polling.
     * Gagal / Supabase mati → tetap pakai polling 45 dtk. Berhasil → polling melambat ke 120 dtk.
     */
    async setupRealtime() {
        try {
            const { subscribeRealtime } = await import('./api/realtime.js');
            const rt = await subscribeRealtime({
                // Chat: payload lengkap, langsung gabung (tanpa RPC).
                onChat: (row) => { if (this.chat && row) this.chat.mergeServer([row]); },
                // Bangunan warga baru: refreshLiveBuildings sudah idempoten & dedup.
                onBuilding: () => this.refreshLiveBuildings(),
                // Kabar kota baru: tampilkan langsung dari payload.
                onNews: (row) => {
                    if (!row) return;
                    const id = Number(row.id) || 0;
                    if (id > (this.lastNewsId || 0)) {
                        playerState.addNews(row.category || 'kota', row.message);
                        this.lastNewsId = id;
                    }
                },
                // Usulan/suara/pengaturan: data otoritatif dari snapshot, tarik ulang (debounce).
                onCity: () => this.scheduleSnapshot()
            });
            if (rt) {
                this.realtime = rt;
                this.realtimeOn = true;
                clearInterval(this._pollTimer);
                this._pollTimer = setInterval(() => { if (!document.hidden) this.pollSnapshot(); }, 120000);
                console.log('[Realtime] Supabase push aktif; polling melambat ke 120 dtk.');
            }
        } catch (e) { /* biarkan polling 45 dtk jalan */ }
    }

    /** Tarik snapshot dengan debounce (banyak event realtime beruntun → satu poll). */
    scheduleSnapshot() {
        clearTimeout(this._snapDebounce);
        this._snapDebounce = setTimeout(() => this.pollSnapshot(), 800);
    }

    async refreshLiveBuildings() {
        if (this._refreshingBuildings) return;
        this._refreshingBuildings = true;
        try {
            const { data: buildings } = await getDistrictBuildings('k12');
            if (!Array.isArray(buildings)) return;
            const synced = new Set(this.readUserBuildings().map(b => b.server_id).filter(Boolean));
            let added = 0;
            for (const b of buildings) {
                if (!b.owner_id || synced.has(b.id)) continue;
                if (this.buildingLoader.loadedBuildings.has(b.id)) continue;
                if (this.buildingLoader.getBuildingAt(b.district_key, b.grid_i, b.grid_j)) continue;
                this.buildingLoader.addBuilding(b);
                added++;
            }
            if (added) console.log(`[Realtime] ${added} bangunan warga baru muncul di peta.`);
        } catch (e) { /* abaikan, coba lagi putaran berikutnya */ }
        finally { this._refreshingBuildings = false; }
    }

    /** Kavling kosong pertama untuk lokasi usulan fasilitas publik (voting). */
    findFreeProposalSlot() {
        return this.grid.plots.find((p) =>
            p.isLot !== false && !p.isOpenSpace && !p.isRiver &&
            !this.buildingLoader.getBuildingAt(p.districtKey, p.gridI, p.gridJ)) || null;
    }


        maybeLoadConstructionFx() {
        if (this.constructionFx || this.constructionFxLoading) return;
        let any = false;
        for (const item of this.buildingLoader.loadedBuildings.values()) {
            if (item.data.stage === 'proyek' && item.mesh) { any = true; break; }
        }
        if (!any) return;
        this.constructionFxLoading = true;
        import('./models/construction_fx.js').then(({ ConstructionFX }) => {
            this.constructionFx = new ConstructionFX({
                scene: this.scene,
                buildingLoader: this.buildingLoader,
                renderer: this.renderer.renderer,
                camera: this.camera,
                isMuted: () => !!(this.ambience && this.ambience.muted),
                deps: { createHomeKitMesh, loadHomeKit, pfMaterial, playerState, preloadPolyfork, pfGeo, riverMaxX: GRID_CONFIG.RIVER_MAX_X }
            });
        }).catch(err => {
            this.constructionFxLoading = false;
            console.warn('[Konstruksi] Animasi proyek gagal dimuat:', err);
        });
    }

    setupLivingWorld() {
        const buildings = [...this.buildingLoader.loadedBuildings.values()].map(v => v.data);
        const isNight = this.lighting.isNight();
        this.pedestrians = new Pedestrians(this.scene, 140);
        // Kepadatan pejalan kaki per jam & desa (village_identity.js)
        this.pedestrians.hourFn = () => this.lighting.currentHourWIB ?? 12;
        // Kegiatan diam: kafe & bangku taman (Have), ronda, jemuran, ngobrol di warung (Have-Not)
        this.idleScenes = new IdleScenes(this.scene, buildings, { benches: this.grid.benchSpots, jemuran: this.grid.jemuranSpots, ronda: this.grid.rondaSpots });
        this.idleScenes.setNight(isNight);
        this.smoke = new ChimneySmoke(this.scene, buildings);
        this.teplok = new TeplokLamps(this.scene, buildings);
        this.teplok.setNight(isNight);

        // Perahu nelayan: z jembatan diambil dari grid agar perahu tidak menembus geladak
        const bridgeZs = [-256, 256];
        this.scene.traverse(o => {
            const m = /^bridge_z_(-?\d+)/.exec(o.name || '');
            if (m) bridgeZs.push(Number(m[1]));
        });
        if (this.grid.luxuryBridgeZ !== undefined) bridgeZs.push(this.grid.luxuryBridgeZ);
        this.boats = new FishingBoats(this.scene, bridgeZs, CHANNEL);

        // Satwa pedesaan (bebek, kuntul, ayam, kerbau) — 7 InstancedMesh
        this.wildlife = new Wildlife(this.scene, this.scenery, [...this.buildingLoader.loadedBuildings.values()]);

        this.ambience = new Ambience();
        this.ambience.setNight(isNight);
        // Audio hanya boleh mulai setelah interaksi pengguna (kebijakan autoplay browser)
        const kick = () => {
            this.ambience.start();
            window.removeEventListener('pointerdown', kick);
            window.removeEventListener('keydown', kick);
        };
        window.addEventListener('pointerdown', kick);
        window.addEventListener('keydown', kick);

        // Tombol bisu/suara di deret kontrol kamera
        const bar = document.querySelector('.hud-camera-controls');
        if (bar) {
            const btn = document.createElement('button');
            btn.className = 'btn-cam';
            btn.id = 'btn-ambience';
            const label = () => { btn.textContent = this.ambience.muted ? '🔇' : '🔊'; btn.title = this.ambience.muted ? 'Nyalakan suara suasana' : 'Bisukan suara suasana'; };
            label();
            btn.addEventListener('click', () => { this.ambience.setMuted(!this.ambience.muted); label(); });
            bar.appendChild(btn);
            // Azan di jam salat (opsional, bisa dimatikan)
            const azan = document.createElement('button');
            azan.className = 'btn-cam';
            azan.id = 'btn-azan';
            const azanLabel = () => { azan.textContent = '🕌'; azan.style.opacity = this.ambience.azanOn ? '1' : '0.45'; azan.title = this.ambience.azanOn ? 'Matikan azan di jam salat' : 'Nyalakan azan di jam salat'; };
            azanLabel();
            azan.addEventListener('click', () => { this.ambience.setAzan(!this.ambience.azanOn); azanLabel(); });
            bar.appendChild(azan);
        }
    }

    /**
     * Memuat data starter dari API / Offline Mock
     */
    async loadStarterWorld() {
        try {
            // 1. Ambil Snapshot Kota (Kas, Berita, & Donasi Warga)
            const { data: snapshot } = await getCitySnapshot();
            if (snapshot) {
                this.citizenCount = snapshot.stats?.population ?? snapshot.stats?.players ?? 0;
                if (snapshot.kas !== undefined) {
                    playerState.setCityTreasury(snapshot.kas);
                }
                if (snapshot.news && Array.isArray(snapshot.news)) {
                    snapshot.news.forEach(n => {
                        playerState.addNews(n.kind || 'kota', n.text || n.message);
                    });
                }
                if (snapshot.donations && Array.isArray(snapshot.donations)) {
                    snapshot.donations.forEach(d => {
                        playerState.addNews('donasi', `💖 Donatur terbaru: ${d.name} · Rp${d.amount} · "${d.message}"`);
                    });
                }
                this.lastNewsId = Math.max(0, ...(snapshot.news || []).map(n => Number(n.id) || 0));
                if (this.chat && snapshot.chat) this.chat.mergeServer(snapshot.chat);
                this.snapshot = snapshot;   // kendali kota diterapkan setelah cuaca & cahaya siap (init)
                console.log(`[Kota] Snapshot dimuat: Kas ${snapshot.kas || 5380} ₳, ${snapshot.news?.length || 0} berita.`);
            }

            // 2. Ambil Seluruh Bangunan Hidup Kota (549 Bangunan Hasil Scraping Netizenia v2)
            const { data: buildings } = await getDistrictBuildings('k12');
            if (buildings && buildings.length > 0) {
                // Bangunan warga (cache lokal) didahulukan agar kavlingnya tidak dipakai penataan ulang
                // Rumah warga yang juga ada di server (server_id) tidak dimuat dua kali
                const local = this.readUserBuildings();
                const synced = new Set(local.map(b => b.server_id).filter(Boolean));
                this.buildingLoader.loadBuildings([...local, ...buildings.filter(b => !synced.has(b.id))]);
                console.log(`[Aset] Berhasil memuat ${buildings.length} bangunan hidup di kawasan kota!`);
            }
        } catch (err) {
            console.warn('[Kota] Gagal memuat data awal, menggunakan default offline:', err);
        }
    }

    /** Terapkan bagian snapshot yang bisa berubah saat bermain: kas, kendali kota, aturan kerja. */
    applySnapshot(snap) {
        if (!snap) return;
        const st = snap.settings || {};
        const kas = st.city_treasury ?? snap.kas;
        if (kas !== undefined && kas !== null) playerState.setCityTreasury(Number(kas) || 0);
        applyCityControls(this, st.city_controls || snap.city_controls, st);
    }

    /** Muat ulang snapshot (cache server 5 dtk): kendali kota baru + kabar kota yang belum tampil. */
    async pollSnapshot() {
        try {
            const { data: snap } = await getCitySnapshot();
            if (!snap) return;
            const fresh = (snap.news || []).filter(n => (Number(n.id) || 0) > (this.lastNewsId || 0)).reverse();
            for (const n of fresh) playerState.addNews(n.category || 'kota', n.message);
            if (fresh.length) this.lastNewsId = Number(fresh[fresh.length - 1].id) || this.lastNewsId;
            if (this.chat && snap.chat) this.chat.mergeServer(snap.chat);
            this.refreshLiveBuildings();
            this.applySnapshot(snap);
        } catch (e) { /* jaringan putus: coba lagi di putaran berikutnya */ }
    }

    /**
     * Menyimpan bangunan yang diklaim warga ke cache lokal
     */
    markUserBuildingDone(id) {
        if (!id) return;
        try {
            const list = this.readUserBuildings();
            const item = list.find(b => b.id === id);
            if (item && item.stage !== 'selesai') {
                item.stage = 'selesai';
                localStorage.setItem('audira_user_buildings', JSON.stringify(list));
            }
        } catch (e) {}
    }

    /** Kamera ke kavling kosong pertama + buka kartunya (Status Desa & panel pengelola). */
    navigateEmptyLot() {
        const lot = this.grid.plots.find(p => !this.buildingLoader.getBuildingAt(p.districtKey, p.gridI, p.gridJ));
        if (!lot) return;
        this.camera.recenter(lot.snapX, lot.snapZ);
        this.selectedPlot = lot;
        this.grid.setHighlight(lot.snapX, lot.snapZ);
        this.hud.showPlotCard(lot, null);
        this.hud.showToast('📍 Kavling Kosong Ditemukan', `Kavling [${lot.gridI}, ${lot.gridJ}] siap diklaim untuk membangun rumah!`, '🏗️');
    }

    /** Muat lapisan Palet Aset Admin (custom placements) untuk semua pemain saat boot (modul render lazy). */
    async loadAdminPlacements() {
        try {
            const supabase = await getSupabase();
            if (!supabase) return;   // offline/belum terkonfigurasi: lapisan kosong
            const { data, error } = await supabase.rpc('list_placements');
            if (error || !Array.isArray(data) || !data.length) return;
            const { AdminPlacements } = await import('./models/admin_placements.js');
            this.adminPlacements = new AdminPlacements(this.scene);
            await this.adminPlacements.setAll(data);
        } catch (e) {
            console.warn('[AUDIRA-LAND] Gagal memuat palet aset admin:', e && e.message);
        }
    }

    /** Terapkan perubahan placement dari panel admin ke peta (tanpa reload). */
    async applyPlacement(d) {
        if (!d) return;
        try {
            if (!this.adminPlacements) {
                const { AdminPlacements } = await import('./models/admin_placements.js');
                this.adminPlacements = new AdminPlacements(this.scene);
            }
            if (d.action === 'add' && d.row) await this.adminPlacements.add(d.row);
            else if (d.action === 'remove' && d.id) this.adminPlacements.remove(d.id);
        } catch (e) {
            console.warn('[AUDIRA-LAND] Gagal menerapkan placement:', e && e.message);
        }
    }

    /**
     * Aksi pengelola dari kartu kavling: bangunan server (UUID) wajib lolos RPC admin_* dulu
     * (server menolak non-walikota); bangunan lokal browser ini cukup diubah di peta.
     */
    async adminServer(fn, building) {
        if (!this.adminApi) {
            this.hud.showToast('⛔ Bukan Pengelola', 'Masuk lewat "Masuk Pengelola" di gerbang kota.', '⛔');
            return false;
        }
        if (!isServerId(building.id)) return true;
        try {
            const res = await this.adminApi.rpc(fn, { p_building_id: building.id });
            if (res && res.success === false) throw new Error(res.error);
            return true;
        } catch (e) {
            this.hud.showToast('⛔ Ditolak Server', e.message || 'Aksi gagal.', '⛔');
            return false;
        }
    }

    saveUserBuildingLocally(buildingData) {
        try {
            const raw = localStorage.getItem('audira_user_buildings') || '[]';
            const list = JSON.parse(raw);
            const filtered = list.filter(b => !(b.district_key === buildingData.district_key && b.grid_i === buildingData.grid_i && b.grid_j === buildingData.grid_j));
            filtered.push(buildingData);
            localStorage.setItem('audira_user_buildings', JSON.stringify(filtered));
        } catch (e) {
            console.warn('[Cache] Gagal simpan bangunan lokal:', e);
        }
    }

    /**
     * Memuat kembali bangunan yang pernah diklaim warga dari cache lokal
     */
    readUserBuildings() {
        try {
            return JSON.parse(localStorage.getItem('audira_user_buildings') || '[]');
        } catch (e) {
            return [];
        }
    }

    loadUserBuildingsLocally() {
        try {
            const raw = localStorage.getItem('audira_user_buildings');
            if (raw) {
                const list = JSON.parse(raw);
                this.buildingLoader.loadBuildings(list);
            }
        } catch (e) {
            console.warn('[Cache] Gagal membaca bangunan lokal:', e);
        }
    }

    /**
     * Interaksi Raycasting Tap / Klik pada Kavling
     */
    setupPointerInteractions() {
        const el = this.canvas;
        let isPointerDown = false;
        let startPos = { x: 0, y: 0 };

        el.addEventListener('pointerdown', (e) => {
            isPointerDown = true;
            startPos = { x: e.clientX, y: e.clientY };
        });

        el.addEventListener('pointerup', (e) => {
            if (!isPointerDown) return;
            isPointerDown = false;

            const dist = Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y);
            if (dist < 6.0 && this.camera.dragDistanceTraveled < 6.0) {
                this.handlePointerClick(e.clientX, e.clientY);
            }
        });

        // Hover Kursor di Desktop (hanya jika mouse tidak sedang men-drag kamera)
        el.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'mouse' && !this.camera.isPointerDown) {
                this.handlePointerHover(e.clientX, e.clientY);
            }
        });
    }

    /**
     * Menghitung posisi intersect raycast pada bidang tanah Y=0
     */
    getGroundIntersect(clientX, clientY) {
        this.pointer.x = (clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera.camera);
        const intersectPoint = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, intersectPoint);
        return hit ? intersectPoint : null;
    }

    handlePointerHover(clientX, clientY) {
        const pt = this.getGroundIntersect(clientX, clientY);
        if (!pt) {
            this.grid.hideHighlight();
            return;
        }

        const plot = this.grid.getPlotFromWorld(pt.x, pt.z);
        if (plot) {
            this.grid.setHighlight(plot.snapX, plot.snapZ);
            this.hud.updateDistrict(plot.district.name, plot.district.key);
        } else {
            this.grid.hideHighlight();
        }
    }

    handlePointerClick(clientX, clientY) {
        const pt = this.getGroundIntersect(clientX, clientY);
        if (!pt) return;

        const plot = this.grid.getPlotFromWorld(pt.x, pt.z);
        if (plot) {
            this.selectedPlot = plot;
            this.grid.setHighlight(plot.snapX, plot.snapZ);

            // Cek apakah ada bangunan di petak ini
            const building = this.buildingLoader.getBuildingAt(plot.district.key, plot.tileI, plot.tileJ);
            this.hud.showPlotCard(plot, building);
            this.hud.updateDistrict(plot.district.name, plot.district.key);
            // Kavling tampak kosong: mungkin warga lain baru mendaftar sesudah halaman dimuat.
            // Tarik ulang bangunan server (maks 1x / 10 dtk) lalu segarkan kartu bila ternyata berpemilik.
            if (!building && typeof this.refreshLiveBuildings === 'function' && Date.now() - (this._lastEmptySync || 0) > 10000) {
                this._lastEmptySync = Date.now();
                this.refreshLiveBuildings().then(() => {
                    if (this.selectedPlot !== plot) return;
                    const b = this.buildingLoader.getBuildingAt(plot.district.key, plot.tileI, plot.tileJ);
                    if (b) this.hud.showPlotCard(plot, b);
                }).catch(() => {});
            }
            return;
        }

        // Di luar grid kota: sawah hiasan desa (berundak timur/utara/selatan) tetap bisa diklik
        const petak = this.scenery?.riceFieldAt?.(pt.x, pt.z);
        if (petak) {
            this.deselectPlot();
            const owner = this.buildingLoader.sawahOwnerAt(pt.x, pt.z, petak.hw + 2, petak.hd + 2);
            this.hud.showSawahCard(petak, owner);
        }
    }

    deselectPlot() {
        this.selectedPlot = null;
        this.grid.hideHighlight();
    }

    /**
     * Render Game Loop (60 FPS)
     */
    animate() {
        requestAnimationFrame(() => this.animate());

        const now = performance.now();
        // Batasi dt: kembali dari tab lain tidak membuat kendaraan/kamera melompat
        const dt = Math.min((now - this.lastTime) / 1000.0, 0.1);
        this.lastTime = now;

        // 0. Mode Jalan: gerakkan tokoh dulu (ia menyetel target kamera), baru kamera dilerp
        // Perjalanan berlangsung: kendaraan yang menyetel target kamera, tokoh dibekukan
        if (this.travel) this.travel.update(dt);
        if (this.walk && this.walk.isActive() && !(this.travel && this.travel.isBusy())) {
            const v = this.touch.getInput();
            this.walk.setInput(v.x, v.y, v.run);
            this.walk.update(dt);
        }

        // 1. Update Kamera 360
        this.camera.update(dt);

        // 1a. Transisi cahaya halus + bayangan mengikuti fokus kamera
        this.lighting.update(dt, this.camera.target, this.camera.distance);
        if (this.weather) this.weather.update(dt, this.camera.target, this.camera.distance);

        // 1a'. LOD papan teks/banner (4x per detik cukup)
        this.lodInterval = (this.lodInterval || 0) + dt;
        if (this.lodInterval >= 0.25) {
            this.lodInterval = 0;
            updateDetailLOD(this.scene, this.camera.camera, 150);
        }

        // 1b. Update Simulasi Lalu Lintas Kendaraan
        this.traffic.update(dt * (this.trafficMult ?? 1));   // 0 = jalan ditutup Pemkot
        updateWater(dt);
        if (this.pedestrians) this.pedestrians.update(dt, this.camera.distance);
        if (this.smoke) this.smoke.update(dt);
        if (this.boats) this.boats.update(dt);
        if (this.themePark) this.themePark.update(dt);
        if (this.airport) this.airport.update(dt);
        if (this.harbor) this.harbor.update(dt);
        if (this.cruiseTerminal) this.cruiseTerminal.update(dt);
        if (this.railway) this.railway.update(dt);
        if (this.stadium) this.stadium.update(dt);
        if (this.playground) this.playground.update(dt);
        if (this.cityTrees) this.cityTrees.update(dt);
        if (this.inequality) this.inequality.update(dt);
        if (this.scaffoldBatch) this.scaffoldBatch.update(dt);
        if (this.constructionFx) this.constructionFx.update(dt);
        if (this.applyCrowd) this.applyCrowd(this);
        if (this.wildlife) this.wildlife.update(dt, this.camera.camera.position);
        if (this.zoo) this.zoo.update(dt, this.camera.camera.position);
        if (this.teplok) this.teplok.update(dt);
        if (this.ambience) this.ambience.update(dt, this.camera.target, this.lighting.currentHourWIB);

        // 2. Update Rotasi Ticker Berita Otomatis
        this.hud.tickTicker(dt);

        // 3. Update Jam & Pencahayaan Siang-Malam tiap 1 detik
        this.clockInterval += dt;
        if (this.clockInterval >= 1.0) {
            this.clockInterval = 0;
            if (this.lighting.mode === 'auto') {
                this.lighting.updateTime();
            }
            this.hud.updateClock(this.lighting.timeDisplayString);
        }

        // 4. Update Hitung Mundur Proyek Konstruksi & Jeda Kerja tiap 1 detik
        this.timerUpdateInterval += dt;
        if (this.timerUpdateInterval >= 1.0) {
            this.timerUpdateInterval = 0;
            this.buildingLoader.updateTimers();
            this.hud.updateWorkCardTimers();
            this.maybeLoadConstructionFx();
        }

        // 5. Render Scene WebGL
        this.renderer.render(this.scene, this.camera.camera);

        // 6. Update Telemetri Performa di HUD (2x/dtk; menulis DOM tiap frame memicu layout)
        this.telemetryInterval = (this.telemetryInterval || 0) + dt;
        if (this.telemetryInterval >= 0.5) {
            this.telemetryInterval = 0;
            this.hud.updateTelemetry(this.renderer.getTelemetry());
        }
    }
}

// Inisialisasi otomatis setelah DOM selesai dimuat
// Model Polyfork (pohon, kendaraan) dimuat dulu (maks 5 dtk) agar CityGrid & TrafficSystem bisa memakainya
// Bila modul selesai dievaluasi SETELAH DOMContentLoaded (muat lambat/ulang), langsung mulai; jangan dobel.
const startGame = () => {
    if (window.__audiraStarted) return;
    window.__audiraStarted = true;
    window.playerState = playerState;
    preloadPolyfork().finally(() => { window.game = new AudiraLandGame(); });
};
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', startGame);
else startGame();
