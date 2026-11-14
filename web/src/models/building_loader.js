/**
 * AUDIRA-LAND: Model Bangunan 3D Nusantara & Proyek Konstruksi
 * Desain arsitektur otentik khas Nusantara (Warm Ink Stylized):
 * - Balai Kota (Grand Joglo Pendopo Agung bertingkat dengan bedug & mustaka emas)
 * - Warung Madura 24 Jam (Etalase warna-warni, terpal merah-putih, rak bensin botol Pertamini, karung beras)
 * - Warung Kopi Giras (Bar kayu-bambu, ceret kuningan, gantungan sachet kopi, lemari gorengan, cangkir blirik)
 * - Kebun Hidroponik Hijau (Rangka pipa A-frame, 18 selada segar, tandon nutrisi, peti panen wortel/tomat)
 * - Saung Bambu Santai (Panggung bambu, atap ijuk aren hitam bertingkat, teko poci tanah liat, angklung angin)
 * - Pos Ronda Siskamling (Menara panggung, kentongan kayu jati raksasa & gandhen, lentera, helm siskamling)
 * - Taman Surya Tirta (Kolam air mancur marmer bertingkat, nozel emas, petak bunga marigold, bangku taman)
 * - Rumah Limasan Jawa (Atap limasan wuwungan, serambi emperan, gebyok ukir, gentong padasan cuci kaki)
 * - Proyek Konstruksi (Perancah bambu bertingkat, derek katrol, tumpukan bata/semen, billboard hitung mundur 3D)
 *
 * Mematuhi Zero-Submerging Surface Policy (bottomY >= surfaceY + 0.08) & Presisi Kotak Kavling 2.8m.
 */

import { PALETTE, GRID_CONFIG } from '../core/constants.js';
import { NETIZENIA_BUILDINGS, createNetizeniaBuilding, GENTENG, WALLS, AKSEN } from './netizenia_catalog.js';
import { bakeStatic, compactObject, protectMaterial, disposeBaked } from '../core/static_batcher.js';
import { CityLayout } from '../core/city_layout.js';
import { getCrop, cropOf } from '../core/crops.js';
import { applyHaveNotRules, isHaveNotTile, isAllowedInHaveNot, HAVE_NOT_MAX_FLOORS } from '../core/village_rules.js';
import { loadJavaneseHouses, pickJavaneseHouse, createJavaneseHouse } from './javanese_houses.js';
import { createHomeKitMesh, loadHomeKit, homeKitReady } from './home_kit_mesh.js';

// Ukuran sel batching spasial (m): cukup besar untuk sedikit draw call, cukup kecil untuk frustum culling
const STATIC_CHUNK = 96; // 64 -> 96 setelah peta diperluas ke barat (jaga draw call <= 100)
// Desa Have-Not (X > 16 m): rumah sedikit diputar (±6°, deterministik per posisi) supaya kampung
// tidak berbaris kaku seperti kota. Desa Have tetap lurus.
const villageYaw = (x, z) => (x > GRID_CONFIG.RIVER_MAX_X ? Math.sin(x * 3.17 + z * 1.71) * 0.105 : 0);

// Alas tak beraturan (poligon 11 titik, jari-jari 0,8-1,0 acak deterministik) untuk proyek di Desa Have-Not,
// menggantikan alas persegi. Skala x/z = setengah lebar/dalam kavling. Permukaan rata di y = 0.
function organicPadGeometry(seed, hw, hd) {
    const r = k => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const shape = new THREE.Shape();
    const N = 11;
    for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2 + (r(k) - 0.5) * 0.3;
        const rad = 0.8 + r(k + 20) * 0.2;
        const x = Math.cos(a) * rad * hw, z = Math.sin(a) * rad * hd;
        if (k === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
    }
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);   // normal menghadap atas
}

export class BuildingLoader {
    constructor(scene, callbacks = {}) {
        this.scene = scene;
        this.callbacks = callbacks;
        this.buildingsGroup = new THREE.Group();
        this.buildingsGroup.name = 'city_buildings';
        this.scene.add(this.buildingsGroup);

        this.loadedBuildings = new Map(); // id -> { data, mesh, billboardObj, chunkKey }
        this.staticChunks = new Map();    // chunkKey -> { members: Map<id, data>, group }
        this.layout = new CityLayout();   // tata kota: tidak ada bangunan di jalan/sungai
        this.materials = this.createMaterials();
        protectMaterial(this.materials.windowGlow);
        protectMaterial(this.materials.lanternGlow);
        // Rumah Jawa .glb (Blender): dimuat di latar; setelah siap, bangunan yang cocok diganti
        loadJavaneseHouses().then(n => { if (n) this.applyJavaneseHouses(); });
    }

    /** Ganti bangunan yang sudah tampil dengan model rumah Jawa .glb bila tipenya cocok. */
    applyJavaneseHouses() {
        const isHN = data => isHaveNotTile(CityLayout.footprint(data).gi);
        this.swapMatching(d => pickJavaneseHouse(d.type, d, isHN(d)), 'Rumah Jawa');
    }

    /** Rumah warga kit Desa × Profesi yang modelnya baru termuat: ganti mesh fallback. */
    applyHomeKits() {
        this.swapMatching(d => homeKitReady(d), 'Rumah Profesi');
    }

    /** Bangun ulang mesh bangunan jadi yang cocok predikat (chunk statis ikut dibangun ulang). */
    swapMatching(match, label) {
        let swapped = 0;
        const dirty = new Set();
        for (const item of this.loadedBuildings.values()) {
            const d = item.data;
            if (!match(d)) continue;
            if (item.chunkKey) { dirty.add(item.chunkKey); swapped++; continue; }
            if (!item.mesh || d.stage === 'proyek' || d.stage === 'bangun' || d.stage === 'sketsa') continue;
            const old = item.mesh;
            const mesh = this.createBuildingMeshByType(d.type, d);
            if (!mesh) continue;
            mesh.position.copy(old.position);
            mesh.rotation.copy(old.rotation);
            compactObject(mesh);
            this.buildingsGroup.remove(old);
            disposeBaked(old);
            this.buildingsGroup.add(mesh);
            item.mesh = mesh;
            swapped++;
        }
        dirty.forEach(key => this.rebuildStaticChunk(key));
        console.log(`[${label}] ${swapped} bangunan memakai model .glb (${dirty.size} chunk dibangun ulang).`);
    }

    createMaterials() {
        return {
            // Kayu & Bambu Nusantara
            teak: new THREE.MeshLambertMaterial({ color: PALETTE.WOOD, roughness: 0.7 }),
            teakDark: new THREE.MeshLambertMaterial({ color: 0x361F10, roughness: 0.8 }),
            teakWarm: new THREE.MeshLambertMaterial({ color: PALETTE.WOOD_WARM, roughness: 0.65 }),
            teakLight: new THREE.MeshLambertMaterial({ color: PALETTE.WOOD_LIGHT, roughness: 0.6 }),
            bamboo: new THREE.MeshLambertMaterial({ color: PALETTE.BAMBOO, roughness: 0.55 }),
            bambooDark: new THREE.MeshLambertMaterial({ color: PALETTE.BAMBOO_POLE, roughness: 0.65 }),
            thatchIjuk: new THREE.MeshLambertMaterial({ color: PALETTE.THATCH_IJUK, roughness: 0.95 }),

            // Tanah Liat & Bata
            terracotta: new THREE.MeshLambertMaterial({ color: PALETTE.TERRACOTTA, roughness: 0.6 }),
            terracottaDark: new THREE.MeshLambertMaterial({ color: PALETTE.TERRACOTTA_DARK, roughness: 0.7 }),
            brick: new THREE.MeshLambertMaterial({ color: 0xB54C34, roughness: 0.75 }),

            // Plester Krem & Marmer
            cream: new THREE.MeshLambertMaterial({ color: PALETTE.CREAM, roughness: 0.8 }),
            creamDark: new THREE.MeshLambertMaterial({ color: PALETTE.CREAM_DARK, roughness: 0.85 }),
            stone: new THREE.MeshLambertMaterial({ color: 0x8C8376, roughness: 0.9 }),

            // Logam & Kemilau
            gold: new THREE.MeshLambertMaterial({ color: PALETTE.GOLD, roughness: 0.35 }),
            goldBright: new THREE.MeshBasicMaterial({ color: PALETTE.GOLD_BRIGHT }),
            brass: new THREE.MeshLambertMaterial({ color: 0xD49428, roughness: 0.3 }),
            ironDark: new THREE.MeshLambertMaterial({ color: 0x2A2724, roughness: 0.6 }),

            // Air & Alam
            water: new THREE.MeshLambertMaterial({ color: PALETTE.WATER, roughness: 0.15 }),
            waterShimmer: new THREE.MeshBasicMaterial({ color: PALETTE.WATER_SHIMMER }),
            grass: new THREE.MeshLambertMaterial({ color: PALETTE.GRASS, roughness: 0.9 }),
            leafGreen: new THREE.MeshLambertMaterial({ color: PALETTE.LEAF_GREEN, roughness: 0.7 }),
            leafDark: new THREE.MeshLambertMaterial({ color: PALETTE.LEAF_DARK, roughness: 0.8 }),
            flowerGold: new THREE.MeshLambertMaterial({ color: 0xFFA000 }),
            flowerRed: new THREE.MeshLambertMaterial({ color: 0xE53935 }),

            // Toko, Warung & Sembako
            petrolYellow: new THREE.MeshLambertMaterial({ color: PALETTE.PETROL_YELLOW, roughness: 0.2 }),
            bannerRed: new THREE.MeshLambertMaterial({ color: PALETTE.BANNER_RED }),
            bannerWhite: new THREE.MeshLambertMaterial({ color: PALETTE.BANNER_WHITE }),
            packageBlue: new THREE.MeshLambertMaterial({ color: 0x1E88E5 }),
            packageGreen: new THREE.MeshLambertMaterial({ color: 0x43A047 }),
            glass: new THREE.MeshLambertMaterial({ color: 0xB2EBF2, transparent: true, opacity: 0.65 }),

            // Tinta Outline
            ink: new THREE.MeshBasicMaterial({ color: PALETTE.INK }),

            // Jendela & lentera yang menyala di malam hari (diatur updateLighting)
            windowGlow: new THREE.MeshLambertMaterial({ color: 0x475569, emissive: 0x000000 }),
            lanternGlow: new THREE.MeshBasicMaterial({ color: 0x94A3B8 })
        };
    }

    /**
     * Memuat daftar bangunan dari array data
     * Memisahkan bangunan dinamis (konstruksi/sketsa) dan bangunan statis (jadi)
     * Menggabungkan bangunan statis secara batch untuk menjamin 60 FPS & draw call minimal.
     */
    loadBuildings(buildingList) {
        // Pindahkan bangunan yang menabrak jalan/sungai ke kavling sah & hadapkan ke jalan
        buildingList = (buildingList || []).filter(d => !this.loadedBuildings.has(d.id));
        // Desa Have-Not: hanya bangunan sederhana 1 lantai; bangunan mewah dipindah ke Desa Have
        const rules = applyHaveNotRules(buildingList, CityLayout.footprint);
        if (rules.moved || rules.flattened) {
            console.log(`[Aturan Desa] Have-Not: ${rules.moved} bangunan mewah dipindah ke Desa Have, ${rules.flattened} diturunkan ke 1 lantai.`);
        }
        buildingList = this.layout.place(buildingList);
        const dynamicBuildings = [];
        const staticBuildings = [];

        buildingList.forEach(data => {
            if (data.stage === 'proyek' || data.stage === 'bangun' || data.stage === 'sketsa') {
                dynamicBuildings.push(data);
            } else {
                staticBuildings.push(data);
            }
        });

        // 1. Tambahkan bangunan konstruksi / dinamis secara individual
        dynamicBuildings.forEach(data => this.addBuilding(data));

        // 2. Batch merge seluruh bangunan statis ('jadi')
        this.batchMergeStaticBuildings(staticBuildings);
    }

    /**
     * Batch merge bangunan statis berdasarkan palet material untuk mereduksi ribuan draw call
     */
    batchMergeStaticBuildings(staticBuildings) {
        if (!staticBuildings || staticBuildings.length === 0) return;
        const dirty = new Set();

        for (const data of staticBuildings) {
            if (this.loadedBuildings.has(data.id)) continue;
            const { posX, posZ } = this.resolveWorldPos(data);
            const chunkKey = Math.floor(posX / STATIC_CHUNK) + ',' + Math.floor(posZ / STATIC_CHUNK);
            const full = { ...data, worldX: posX, worldZ: posZ };

            // Catat metadata untuk raycasting matematis & kartu info plot
            this.loadedBuildings.set(data.id, { data: full, mesh: null, billboardObj: null, chunkKey });

            let chunk = this.staticChunks.get(chunkKey);
            if (!chunk) {
                chunk = { members: new Map(), group: null };
                this.staticChunks.set(chunkKey, chunk);
            }
            chunk.members.set(data.id, full);
            dirty.add(chunkKey);
        }

        dirty.forEach(key => this.rebuildStaticChunk(key));
    }

    resolveWorldPos(data) {
        let posX = data.worldX;
        let posZ = data.worldZ;
        if (posX === undefined || posZ === undefined) {
            const T = GRID_CONFIG.TILE_SIZE;
            const HALF = GRID_CONFIG.HALF_TILES;
            const i = data.grid_i !== undefined ? data.grid_i : 108;
            const j = data.grid_j !== undefined ? data.grid_j : 108;
            const w = data.width || 1;
            const h = data.height || 1;
            posX = (i - HALF) * T + (w * T) / 2;
            posZ = (j - HALF) * T + (h * T) / 2;
        }
        return { posX, posZ };
    }

    /**
     * Membangun ulang satu chunk statis: semua bangunan di sel ini dilebur menjadi
     * beberapa draw call (vertex color + material khusus). Dipanggil saat muat & saat gusur.
     */
    rebuildStaticChunk(chunkKey) {
        const chunk = this.staticChunks.get(chunkKey);
        if (!chunk) return;
        if (chunk.group) {
            this.buildingsGroup.remove(chunk.group);
            disposeBaked(chunk.group);
            chunk.group = null;
        }
        if (chunk.members.size === 0) {
            this.staticChunks.delete(chunkKey);
            return;
        }

        const temp = new THREE.Group();
        const surfaceBaseY = GRID_CONFIG.SURFACE_Y + GRID_CONFIG.MICRO_LIFT;
        const leftovers = [];
        for (const data of chunk.members.values()) {
            const group = this.createBuildingMeshByType(data.type, data);
            if (!group) continue;
            group.position.set(data.worldX, surfaceBaseY, data.worldZ);
            group.rotation.y = ((data.facing !== undefined && data.facing !== null) ? data.facing * (Math.PI / 2) : 0) + villageYaw(data.worldX, data.worldZ);
            temp.add(group);
            leftovers.push(group);
        }

        const baked = bakeStatic(temp, { remove: true });
        baked.name = `static_chunk_${chunkKey}`;
        // Sprite/garis/teks yang tidak bisa dilebur tetap ikut di chunk
        for (const g of leftovers) {
            let hasRest = false;
            g.traverse(o => { if (o !== g && !o.isGroup) hasRest = true; });
            if (hasRest) baked.add(g);
        }
        chunk.group = baked;
        this.buildingsGroup.add(baked);
    }

    /**
     * Mencari bangunan yang berdiri pada koordinat kavling tertentu (districtKey, tileI, tileJ)
     */
    getBuildingAt(districtKey, tileI, tileJ) {
        for (const [id, item] of this.loadedBuildings) {
            const b = item.data;
            // Baris server (get_district_buildings) & proyek vital sering tak mengisi district_key:
            // perlakukan yang kosong sebagai grid utama agar kavling berpemilik tak terbaca kosong.
            if (b.district_key === districtKey || b.district_key === undefined || b.district_key === null) {
                if (b.grid_i === undefined || b.grid_j === undefined) continue;
                const bw = b.width || 1;
                const bh = b.height || 1;
                if (tileI >= b.grid_i && tileI < b.grid_i + bw && tileJ >= b.grid_j && tileJ < b.grid_j + bh) {
                    return b;
                }
            }
        }
        return null;
    }

    /** Bangunan sawah warga (type 'sawah') yang menutupi titik dunia (x,z), atau null. */
    sawahOwnerAt(x, z, hw = 6.5, hd = 6.5) {
        for (const [, item] of this.loadedBuildings) {
            const b = item.data;
            if (b.type !== 'sawah') continue;
            const bx = b.worldX, bz = b.worldZ;
            if (bx === undefined || bz === undefined) continue;
            if (Math.abs(x - bx) <= hw && Math.abs(z - bz) <= hd) return b;
        }
        return null;
    }

    /**
     * Mengambil metadata detail bangunan berdasarkan tipe
     */
    getBuildingMeta(type) {
        const metaCatalog = {
            balai_kota: {
                title: 'Balai Kota Alun-Alun',
                desc: 'Pusat musyawarah warga dan pelayanan administrasi warga dengan arsitektur Joglo agung.',
                icon: '🏛️',
                jobTitle: 'Staf Administrasi & Musyawarah',
                isWorkable: true
            },
            warung_madura: {
                title: 'Warung Madura 24 Jam',
                desc: 'Toko sembako serba ada dengan rak bensin botol Pertamini, karung beras, dan etalase komplit.',
                icon: '🏪',
                jobTitle: 'Pengelola Toko Sembako',
                isWorkable: true
            },
            taman_surya: {
                title: 'Taman Surya Tirta',
                desc: 'Taman publik asri dengan kolam air mancur marmer bertingkat, bunga marigold, dan bangku santai.',
                icon: '⛲',
                jobTitle: 'Petugas Konservasi Taman',
                isWorkable: true
            },
            pos_ronda: {
                title: 'Pos Ronda Siskamling',
                desc: 'Pos keamanan terpadu panggung kayu dengan kentongan raksasa siaga dan jadwal ronda warga.',
                icon: '🚨',
                jobTitle: 'Petugas Siskamling Warga',
                isWorkable: true
            },
            rumah_limas: {
                title: 'Rumah Limasan Jawa',
                desc: 'Hunian tradisional kayu jati beratap limasan wuwungan, serambi emperan luas, dan gentong padasan.',
                icon: '🏠',
                jobTitle: 'Pemelihara Rumah & Homestay',
                isWorkable: true
            },
            warung_kopi: {
                title: 'Warung Kopi Giras',
                desc: 'Pusat cangkrukan santai, seduhan kopi tubruk ceret kuningan, rentengan sachet, dan gorengan hangat.',
                icon: '☕',
                jobTitle: 'Barista Kopi & Kudapan',
                isWorkable: true
            },
            kebun_sayur: {
                title: 'Kebun Hidroponik Hijau',
                desc: 'Pertanian perkotaan modern dengan pipa A-frame bertingkat, selada segar, tandon, dan peti panen.',
                icon: '🥬',
                jobTitle: 'Pengelola Panen Hidroponik',
                isWorkable: true
            },
            saung_bambu: {
                title: 'Saung Bambu Santai',
                desc: 'Gazebo panggung bambu beratap ijuk aren hitam bertingkat, poci teh tanah liat, dan angklung angin.',
                icon: '🎋',
                jobTitle: 'Pengurus Saung & Kenyamanan',
                isWorkable: true
            }
,

            // --- 36 Model Scraped Republik Netizenia v2 ---
            rumah: {
                title: 'Rumah Kecil',
                desc: 'Bangunan hunian Rumah Kecil asri dan nyaman untuk warga AUDIRA-LAND.',
                icon: '🏠',
                jobTitle: 'Penjaga Rumah Warga',
                isWorkable: true
            },
            rumah2: {
                title: 'Rumah Tingkat',
                desc: 'Bangunan hunian Rumah Tingkat asri dan nyaman untuk warga AUDIRA-LAND.',
                icon: '🏡',
                jobTitle: 'Pengelola Rumah Hunian',
                isWorkable: true
            },
            kos: {
                title: 'Kos-kosan',
                desc: 'Fasilitas Kos-kosan di kawasan AUDIRA-LAND.',
                icon: '🏢',
                jobTitle: 'Pengelola Kos-kosan',
                isWorkable: true
            },
            warung: {
                title: 'Warung',
                desc: 'Pusat usaha dan niaga Warung melayani kebutuhan warga 24 jam.',
                icon: '🏪',
                jobTitle: 'Pengelola Warung & Sembako',
                isWorkable: true
            },
            kafe: {
                title: 'Kafe Kopi',
                desc: 'Pusat usaha dan niaga Kafe Kopi melayani kebutuhan warga 24 jam.',
                icon: '☕',
                jobTitle: 'Barista Kafe Kopi',
                isWorkable: true
            },
            toko: {
                title: 'Toko Kelontong',
                desc: 'Pusat usaha dan niaga Toko Kelontong melayani kebutuhan warga 24 jam.',
                icon: '🛒',
                jobTitle: 'Pramuniaga Toko Kelontong',
                isWorkable: true
            },
            bengkel: {
                title: 'Bengkel',
                desc: 'Fasilitas Bengkel di kawasan AUDIRA-LAND.',
                icon: '🔧',
                jobTitle: 'Mekanik Bengkel Kendaraan',
                isWorkable: true
            },
            sawah: {
                title: 'Sawah',
                desc: 'Fasilitas Sawah di kawasan AUDIRA-LAND.',
                icon: '🌾',
                jobTitle: 'Petani Penggarap Padi',
                isWorkable: true
            },
            kantor: {
                title: 'Kantor',
                desc: 'Pusat administrasi, keuangan, dan tata kelola kawasan Kantor.',
                icon: '🏢',
                jobTitle: 'Staf Eksekutif Perkantoran',
                isWorkable: true
            },
            taman: {
                title: 'Taman',
                desc: 'Fasilitas Taman di kawasan AUDIRA-LAND.',
                icon: '⛲',
                jobTitle: 'Petugas Kebersihan & Bunga Taman',
                isWorkable: true
            },
            lapangan: {
                title: 'Tanah Lapang',
                desc: 'Fasilitas Tanah Lapang di kawasan AUDIRA-LAND.',
                icon: '⚽',
                jobTitle: 'Pengelola Sarana Olahraga',
                isWorkable: true
            },
            sekolah: {
                title: 'Sekolah',
                desc: 'Layanan sosial dasar Sekolah penunjang kesejahteraan warga.',
                icon: '🏫',
                jobTitle: 'Guru Pengajar Warga',
                isWorkable: true
            },
            rs: {
                title: 'Rumah Sakit',
                desc: 'Layanan kesehatan Rumah Sakit untuk warga AUDIRA-LAND.',
                icon: '🏥',
                jobTitle: 'Tenaga Medis & Perawat RS',
                isWorkable: true
            },
            polisi: {
                title: 'Kantor Polisi',
                desc: 'Pusat administrasi, keuangan, dan tata kelola kawasan Kantor Polisi.',
                icon: '👮',
                jobTitle: 'Aparat Pengaman Kawasan',
                isWorkable: true
            },
            penjara: {
                title: 'Penjara',
                desc: 'Fasilitas Penjara di kawasan AUDIRA-LAND.',
                icon: '⛓️',
                jobTitle: 'Petugas Lapas Keamanan',
                isWorkable: true
            },
            pasar: {
                title: 'Pasar Rakyat',
                desc: 'Fasilitas Pasar Rakyat di kawasan AUDIRA-LAND.',
                icon: '🏬',
                jobTitle: 'Pedagang Pasar Rakyat',
                isWorkable: true
            },
            ibadah: {
                title: 'Tempat Ibadah',
                desc: 'Fasilitas Tempat Ibadah di kawasan AUDIRA-LAND.',
                icon: '🕌',
                jobTitle: 'Pengurus Rumah Ibadah',
                isWorkable: true
            },
            pln: {
                title: 'Gardu PLN',
                desc: 'Fasilitas Gardu PLN di kawasan AUDIRA-LAND.',
                icon: '⚡',
                jobTitle: 'Teknisi Jaringan Listrik PLN',
                isWorkable: true
            },
            stadion: {
                title: 'Stadion',
                desc: 'Fasilitas Stadion di kawasan AUDIRA-LAND.',
                icon: '🏟️',
                jobTitle: 'Pengelola Stadion Gelora',
                isWorkable: true
            },
            istana: {
                title: 'Istana Negara',
                desc: 'Pusat administrasi, keuangan, dan tata kelola kawasan Istana Negara.',
                icon: '🏛️',
                jobTitle: 'Aparatur Pelayanan Balai Kota',
                isWorkable: true
            },
            tugu: {
                title: 'Alun-alun Tugu Kuda',
                desc: 'Fasilitas Alun-alun Tugu Kuda di kawasan AUDIRA-LAND.',
                icon: '🗿',
                jobTitle: 'Petugas Monumen Sejarah',
                isWorkable: true
            },
            mulyo: {
                title: 'Rumah Pak Mulyo',
                desc: 'Bangunan hunian Rumah Pak Mulyo asri dan nyaman untuk warga AUDIRA-LAND.',
                icon: '🏡',
                jobTitle: 'Staf Pelayanan Warga Mulyo',
                isWorkable: true
            },
            posko: {
                title: 'Posko Tukang',
                desc: 'Fasilitas Posko Tukang di kawasan AUDIRA-LAND.',
                icon: '🔨',
                jobTitle: 'Tukang Bangunan Warga',
                isWorkable: true
            },
            bank: {
                title: 'Bank Negara',
                desc: 'Pusat administrasi, keuangan, dan tata kelola kawasan Bank Negara.',
                icon: '🏦',
                jobTitle: 'Teller & Pengelola Kas Daerah',
                isWorkable: true
            },
            barak: {
                title: 'Barak TNI',
                desc: 'Fasilitas Barak TNI di kawasan AUDIRA-LAND.',
                icon: '🪖',
                jobTitle: 'Prajurit Pengaman Wilayah',
                isWorkable: true
            },
            waduk: {
                title: 'Bendungan & Sungai',
                desc: 'Fasilitas Bendungan & Sungai di kawasan AUDIRA-LAND.',
                icon: '🌊',
                jobTitle: 'Operator Bendungan & Pengairan',
                isWorkable: true
            },
            apartemen: {
                title: 'Apartemen Netizenia',
                desc: 'Fasilitas Apartemen Netizenia di kawasan AUDIRA-LAND.',
                icon: '🏢',
                jobTitle: 'Pengelola Hunian Rusun',
                isWorkable: true
            },
            pabrik: {
                title: 'Pabrik & Bengkel',
                desc: 'Fasilitas Pabrik & Bengkel di kawasan AUDIRA-LAND.',
                icon: '🏭',
                jobTitle: 'Operator Mesin Pabrik',
                isWorkable: true
            },
            pkl: {
                title: 'Zona PKL',
                desc: 'Fasilitas Zona PKL di kawasan AUDIRA-LAND.',
                icon: '🍢',
                jobTitle: 'Pedagang Kuliner Kaki Lima',
                isWorkable: true
            },
            ruko: {
                title: 'Ruko',
                desc: 'Fasilitas Ruko di kawasan AUDIRA-LAND.',
                icon: '🏬',
                jobTitle: 'Pengelola Usaha Ruko',
                isWorkable: true
            },
            kebun: {
                title: 'Kebun',
                desc: 'Fasilitas Kebun di kawasan AUDIRA-LAND.',
                icon: '🥬',
                jobTitle: 'Petani Kebun & Sayuran',
                isWorkable: true
            },
            terminal: {
                title: 'Terminal Angkot',
                desc: 'Fasilitas Terminal Angkot di kawasan AUDIRA-LAND.',
                icon: '🚌',
                jobTitle: 'Sopir & Operator Terminal Angkot',
                isWorkable: true
            },
            pangkalan: {
                title: 'Pangkalan Ojek & Angkot',
                desc: 'Fasilitas Pangkalan Ojek & Angkot di kawasan AUDIRA-LAND.',
                icon: '🛵',
                jobTitle: 'Driver Ojek Transportasi',
                isWorkable: true
            },
            proyek_gedung: {
                title: 'Proyek Gedung Negara',
                desc: 'Fasilitas Proyek Gedung Negara di kawasan AUDIRA-LAND.',
                icon: '🏗️',
                jobTitle: 'Pekerja Konstruksi Gedung',
                isWorkable: true
            },
            proyek_rumah: {
                title: 'Proyek Rumah Negara',
                desc: 'Bangunan hunian Proyek Rumah Negara asri dan nyaman untuk warga AUDIRA-LAND.',
                icon: '🏗️',
                jobTitle: 'Tukang Bangunan Rumah',
                isWorkable: true
            },
            lahan_material: {
                title: 'Lahan Material',
                desc: 'Fasilitas Lahan Material di kawasan AUDIRA-LAND.',
                icon: '📦',
                jobTitle: 'Logistik & Pergudangan Bahan',
                isWorkable: true
            }        };

        return metaCatalog[type] || {
            title: 'Bangunan Warga',
            desc: 'Fasilitas terbangun di kawasan AUDIRA-LAND.',
            icon: '🏢',
            jobTitle: 'Operator Bangunan',
            isWorkable: true
        };
    }

    /**
     * Menambahkan satu bangunan baru ke dunia 3D (Presisi 100% di Kotak Kavling)
     */
    addBuilding(data) {
        if (this.loadedBuildings.has(data.id)) return;
        {
            const fp = CityLayout.footprint(data);
            if (isHaveNotTile(fp.gi)) {
                if (!isAllowedInHaveNot(data.type)) {
                    console.warn(`[Aturan Desa] ${data.type} tidak boleh dibangun di Desa Have-Not.`);
                    return false;
                }
                data.floors = HAVE_NOT_MAX_FLOORS;
            }
        }
        {
            const fp = CityLayout.footprint(data);
            this.layout.occupy(data.id, fp.gi, fp.gj, fp.w, fp.h);
        }

        let mesh;
        let billboardObj = null;

        if (data.stage === 'proyek' || data.stage === 'bangun') {
            const res = this.createConstructionScaffoldMesh(data);
            mesh = res.group;
            billboardObj = res;
        } else if (data.stage === 'sketsa') {
            mesh = this.createSketsaMesh(data);
        } else {
            mesh = this.createBuildingMeshByType(data.type, data);
        }

        if (mesh) {
            let posX = data.worldX;
            let posZ = data.worldZ;

            if (posX === undefined || posZ === undefined) {
                const T = GRID_CONFIG.TILE_SIZE;
                const HALF = GRID_CONFIG.HALF_TILES;
                const i = data.grid_i !== undefined ? data.grid_i : 108;
                const j = data.grid_j !== undefined ? data.grid_j : 108;
                const w = data.width || 1;
                const h = data.height || 1;
                posX = (i - HALF) * T + (w * T) / 2;
                posZ = (j - HALF) * T + (h * T) / 2;
            }

            // Ketinggian Zero-Submerging Surface Policy (Y0 = 0.20m + 0.02m lift)
            const surfaceBaseY = GRID_CONFIG.SURFACE_Y + GRID_CONFIG.MICRO_LIFT;
            mesh.position.set(posX, surfaceBaseY, posZ);

            // Orientasi menghadap jalan (facing 0: S, 1: E, 2: N, 3: W)
            if (data.facing !== undefined && data.facing !== null) {
                mesh.rotation.y = data.facing * (Math.PI / 2);
            }
            mesh.rotation.y += villageYaw(posX, posZ);

            // Lebur mesh anak menjadi beberapa draw call (sprite billboard tetap utuh)
            compactObject(mesh);
            // Garis perancah & billboard: sembunyikan bila jauh (updateDetailLOD)
            mesh.traverse(o => {
                if ((o.isLine || o.isSprite) && o.geometry) {
                    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
                    o.userData.detail = o.isSprite ? 70 : 110;
                }
            });
            this.buildingsGroup.add(mesh);

            this.loadedBuildings.set(data.id, {
                data: { ...data, worldX: posX, worldZ: posZ },
                mesh,
                billboardObj
            });
        }
    }

    createBuildingMeshByType(type, data = {}) {
        // -1. Rumah warga + kendaraan dari kit Desa × Profesi (model dimuat lazy, lalu applyHomeKits)
        if (data.pf_house) {
            const kit = createHomeKitMesh(data);
            if (kit) return kit;
            loadHomeKit(data).then(ok => { if (ok) this.applyHomeKits(); });
        }
        // 0. Rumah tradisional Jawa .glb (joglo/limasan/kampung/panggang pe/tajug), bila sudah termuat
        {
            const hn = data.grid_i !== undefined ? isHaveNotTile(CityLayout.footprint(data).gi) : false;
            const key = pickJavaneseHouse(type, data, hn);
            const house = key && createJavaneseHouse(key);
            if (house) return house;
        }
        // 1. Heritage Craftsman Models (Otentik Nusantara Bertingkat)
        switch (type) {
            case 'balai_kota':
                return this.createBalaiKotaMesh();
            case 'warung_madura':
                return this.createWarungMaduraMesh();
            case 'taman_surya':
                return this.createTamanSuryaMesh();
            case 'pos_ronda':
                return this.createPosRondaMesh();
            case 'rumah_limas':
                return this.createRumahLimasMesh();
            case 'warung_kopi':
                return this.createWarungKopiMesh();
            case 'kebun_sayur':
                return this.createKebunSayurMesh();
            case 'sawah':
                return this.createSawahMesh(cropOf(data));
            case 'saung_bambu':
                return this.createSaungBambuMesh();
        }

        // 2. Netizenia Architecture Catalog (36 Tipe Prosedural Lengkap)
        if (typeof NETIZENIA_BUILDINGS !== 'undefined' && NETIZENIA_BUILDINGS[type]) {
            const seed = data.seed !== undefined ? data.seed : (
                (data.net_id ? Number(data.net_id) : 0) +
                (data.id && typeof data.id === 'string' ? data.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) : 0) +
                (data.grid_i || 0) * 7 +
                (data.grid_j || 0) * 13
            );
            const genteng = data.genteng || GENTENG[seed % GENTENG.length];
            const wall = data.wall || WALLS[seed % WALLS.length];
            const aksen = data.aksen || AKSEN[seed % AKSEN.length];
            return createNetizeniaBuilding(type, {
                seed,
                genteng,
                wall,
                aksen,
                scale: 1.0,
                zone: data.zone || 'KOTA',
                floors: data.floors || (data.height > 1 ? 2 : 1),
                adj: data.adj || {}
            });
        }

        // 3. Fallback
        if (typeof createNetizeniaBuilding === 'function') {
            return createNetizeniaBuilding('rumah', { scale: 1.0 });
        }
        return this.createDefaultBuildingMesh(type);
    }

    // =========================================================================
    // 1. MODEL PROYEK KONSTRUKSI (SCAFFOLDING REALISTIS & COUNTDOWN 3D)
    // =========================================================================
    // =========================================================================
    // MODEL KAVLING RANCANGAN SKETSA (BLUEPRINT BLUE WIREFRAME BOX)
    // =========================================================================
    createSketsaMesh(data) {
        const group = new THREE.Group();
        group.name = `sketsa_${data.id}`;

        const w = (data.width || 1) * 8.0 - 0.8;
        const d = (data.height || 1) * 8.0 - 0.8;
        const h = 4.5;

        // Garis Wireframe Biru Cetak Biru (Blueprint Box)
        const boxGeo = new THREE.BoxGeometry(w, h, d);
        const edgesGeo = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x3B82F6,
            transparent: true,
            opacity: 0.75
        });
        const wireframe = new THREE.LineSegments(edgesGeo, lineMat);
        wireframe.position.y = h / 2 + 0.02;
        group.add(wireframe);

        // Bantalan Alas Transparan Biru Lembut
        const isVillage = this.resolveWorldPos(data).posX > GRID_CONFIG.RIVER_MAX_X;
        const padGeo = isVillage ? organicPadGeometry((data.grid_i || 0) * 31 + (data.grid_j || 0) + 0.5, w / 2, d / 2) : new THREE.BoxGeometry(w, 0.05, d);
        const padMat = new THREE.MeshBasicMaterial({
            color: 0x60A5FA,
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.y = isVillage ? 0.04 : 0.025;
        group.add(pad);

        return group;
    }

    createConstructionScaffoldMesh(data) {
        const group = new THREE.Group();
        group.name = `scaffold_${data.id}`;

        const w = (data.width || 1) * 8.0 - 0.8;
        const d = (data.height || 1) * 8.0 - 0.8;

        // 1. Alas Pasir & Kerikil Proyek
        const village = this.resolveWorldPos(data).posX > GRID_CONFIG.RIVER_MAX_X;
        const sand = new THREE.Mesh(village ? organicPadGeometry((data.grid_i || 0) * 31 + (data.grid_j || 0) + 0.5, w / 2, d / 2)
            : new THREE.BoxGeometry(w, 0.08, d), this.materials.creamDark);
        sand.position.y = village ? 0.03 : 0.04;
        sand.receiveShadow = true;
        group.add(sand);

        // 2. Dinding Bata Setengah Jadi (Bata Merah Terakota Bersusun)
        const wallBack = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 0.2), this.materials.brick);
        wallBack.position.set(0, 0.49, -0.9);
        wallBack.castShadow = true;
        group.add(wallBack);

        const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 1.8), this.materials.brick);
        wallLeft.position.set(-0.9, 0.39, 0);
        wallLeft.castShadow = true;
        group.add(wallLeft);

        // 3. Perancah Bambu Bertingkat Dua (InstancedMesh 8 Tiang)
        const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6);
        const poleCoords = [
            [-1.1, -1.1], [0.0, -1.1], [1.1, -1.1],
            [-1.1, 0.0],              [1.1, 0.0],
            [-1.1, 1.1],  [0.0, 1.1],  [1.1, 1.1]
        ];
        const polesMesh = new THREE.InstancedMesh(poleGeo, this.materials.bambooDark, poleCoords.length);
        const pDummy = new THREE.Object3D();
        poleCoords.forEach(([px, pz], pIdx) => {
            pDummy.position.set(px, 1.4, pz);
            pDummy.updateMatrix();
            polesMesh.setMatrixAt(pIdx, pDummy.matrix);
        });
        polesMesh.instanceMatrix.needsUpdate = true;
        polesMesh.castShadow = true;
        group.add(polesMesh);

        // Balok Horizontal & Papan Kerja Kayu
        const plankMat = this.materials.teakLight;
        const plank1 = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 0.4), plankMat);
        plank1.position.set(0, 1.2, 0.6);
        group.add(plank1);

        const plank2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 2.3), plankMat);
        plank2.position.set(0.6, 1.9, 0);
        group.add(plank2);

        // 4. Derek Tower Crane Kuning Khas Proyek Konstruksi Netizenia v2 (Dioptimalkan)
        const craneDarkMat = new THREE.MeshLambertMaterial({ color: 0x334155, roughness: 0.6 });
        const craneYellowMat = new THREE.MeshLambertMaterial({ color: 0xF1C40F, roughness: 0.4 });

        // Komponen Kuning Derek (Mast + Jib digabung)
        const craneMast = new THREE.Mesh(new THREE.BoxGeometry(0.55, 13.5, 0.55), craneYellowMat);
        craneMast.position.set(w / 2 - 1.2, 6.75, d / 2 - 1.2);
        craneMast.castShadow = true;
        group.add(craneMast);

        const craneJib = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.45, 0.45), craneYellowMat);
        craneJib.position.set(w / 2 - 5.5, 14.2, d / 2 - 1.2);
        craneJib.castShadow = true;
        group.add(craneJib);

        // Komponen Gelap Derek (Kabin + Counterweight)
        const craneCab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), craneDarkMat);
        craneCab.position.set(w / 2 - 1.2, 13.6, d / 2 - 1.2);
        group.add(craneCab);

        const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), craneDarkMat);
        counterWeight.position.set(w / 2 + 1.8, 14.1, d / 2 - 1.2);
        group.add(counterWeight);

        // Garis Kisi Scaffolding Proyek Luas
        const scafGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w - 0.6, 5.0, d - 0.6, 2, 2, 2));
        const scafLineMat = new THREE.LineBasicMaterial({ color: 0xC2913A, transparent: true, opacity: 0.5 });
        const scafLines = new THREE.LineSegments(scafGeo, scafLineMat);
        scafLines.position.y = 1.6;
        group.add(scafLines);

        // 5. Tumpukan Sak Semen & Palet Kayu (InstancedMesh)
        const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), this.materials.teak);
        pallet.position.set(-0.5, 0.07, 0.5);
        group.add(pallet);

        const sackInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.12, 0.35), this.materials.creamDark, 3);
        for (let i = 0; i < 3; i++) {
            pDummy.position.set(-0.5, 0.16 + i * 0.11, 0.5);
            pDummy.updateMatrix();
            sackInst.setMatrixAt(i, pDummy.matrix);
        }
        sackInst.instanceMatrix.needsUpdate = true;
        group.add(sackInst);

        // 6. Billboard Dinamis (Sprite Canvas)
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(0, 4.0, 0);
        sprite.scale.set(3.2, 1.6, 1.0);
        group.add(sprite);

        this.drawBillboard(ctx, texture, data);

        return { group, canvas, ctx, texture, sprite };
    }

    drawBillboard(ctx, texture, data) {
        const now = Date.now();
        const finish = new Date(data.build_finished_at || (now + 3600000)).getTime();
        const start = new Date(data.build_started_at || (now - 60000)).getTime();
        const remainingMs = Math.max(0, finish - now);
        const totalMs = Math.max(1000, finish - start);
        const progress = Math.min(1.0, Math.max(0.0, 1.0 - (remainingMs / totalMs)));

        const totalSec = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        const timeText = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        ctx.clearRect(0, 0, 256, 128);

        // Frame Kayu Tinta Hangat
        ctx.fillStyle = '#FFF9EC';
        ctx.strokeStyle = '#2E2117';
        ctx.lineWidth = 4;
        ctx.fillRect(8, 8, 240, 112);
        ctx.strokeRect(8, 8, 240, 112);

        // Header Proyek
        ctx.fillStyle = '#5B3A24';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(data.title || 'Proyek Warga', 128, 35);

        // Hitung Mundur Waktu
        ctx.fillStyle = '#C8553D';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(`⏳ ${timeText}`, 128, 65);

        // Progress Bar
        ctx.fillStyle = '#D8CEBC';
        ctx.fillRect(24, 82, 208, 16);
        ctx.fillStyle = '#E9A91E';
        ctx.fillRect(24, 82, 208 * progress, 16);
        ctx.strokeStyle = '#2E2117';
        ctx.lineWidth = 2;
        ctx.strokeRect(24, 82, 208, 16);

        texture.needsUpdate = true;
    }

    // =========================================================================
    // 2. MODEL BALAI KOTA (GRAND JOGLO PENDOPO AGUNG ALUN-ALUN)
    // =========================================================================
    createBalaiKotaMesh() {
        const group = new THREE.Group();
        group.name = 'bld_balai_kota';

        // 1. Plinth Marmer Umpak Bertingkat Dua (Tingkat Bawah 2.7m, Tingkat Atas 2.4m)
        const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 2.7), this.materials.creamDark);
        step1.position.y = 0.06;
        step1.receiveShadow = true;
        group.add(step1);

        const step2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 2.4), this.materials.cream);
        step2.position.y = 0.18;
        step2.receiveShadow = true;
        group.add(step2);

        // Tangga Masuk Marmer Depan
        const stair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.35), this.materials.creamDark);
        stair.position.set(0, 0.04, 1.4);
        group.add(stair);

        // Sepasang Tiang Bendera Merah Putih di Depan Tangga
        [-0.7, 0.7].forEach(bx => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 6), this.materials.gold);
            pole.position.set(bx, 1.0, 1.4);
            group.add(pole);

            const red = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.02), this.materials.bannerRed);
            red.position.set(bx + 0.18, 1.84, 1.4);
            group.add(red);

            const white = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.02), this.materials.bannerWhite);
            white.position.set(bx + 0.18, 1.72, 1.4);
            group.add(white);
        });

        // 2. Empat Tiang Soko Guru Jati Utama & 12 Tiang Serambi Keliling
        const sokoGeo = new THREE.CylinderGeometry(0.08, 0.09, 1.8, 8);
        [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].forEach(([px, pz]) => {
            const soko = new THREE.Mesh(sokoGeo, this.materials.teakDark);
            soko.position.set(px, 1.14, pz);
            soko.castShadow = true;
            group.add(soko);

            // Balok Konsol Tumpang Sari di Kepala Tiang
            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), this.materials.teakWarm);
            cap.position.set(px, 2.04, pz);
            group.add(cap);
        });

        // 8 Tiang Serambi Luar
        const outerColGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6);
        const outerCoords = [
            [-1.05, -1.05], [0, -1.05], [1.05, -1.05],
            [-1.05, 1.05],  [0, 1.05],  [1.05, 1.05],
            [-1.05, 0],                 [1.05, 0]
        ];
        outerCoords.forEach(([ox, oz]) => {
            const col = new THREE.Mesh(outerColGeo, this.materials.teakWarm);
            col.position.set(ox, 0.94, oz);
            col.castShadow = true;
            group.add(col);
        });

        // Pagar Pembatas Silang Rendah di Teras
        const fenceGeo = new THREE.BoxGeometry(0.8, 0.25, 0.04);
        [[-1.05, 0.5], [1.05, 0.5], [0, -1.05]].forEach(([fx, fz]) => {
            const fence = new THREE.Mesh(fenceGeo, this.materials.teakLight);
            fence.position.set(fx, 0.35, fz);
            if (fx !== 0) fence.rotation.y = Math.PI / 2;
            group.add(fence);
        });

        // 3. Interior Musyawarah: Meja Kayu Jati Panjang & Bedug Agung
        const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.45), this.materials.teakWarm);
        table.position.set(0, 0.42, 0);
        group.add(table);

        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.46), this.materials.terracotta);
        cloth.position.set(0, 0.61, 0);
        group.add(cloth);

        // Bedug Agung di Sisi Barat
        const bedugFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.4), this.materials.teakDark);
        bedugFrame.position.set(-0.9, 0.64, -0.6);
        group.add(bedugFrame);

        const bedugBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 10).rotateZ(Math.PI / 2), this.materials.teakWarm);
        bedugBarrel.position.set(-0.9, 0.75, -0.6);
        bedugBarrel.castShadow = true;
        group.add(bedugBarrel);

        // 4. Atap Joglo Tajuk Bertingkat Tiga
        // Tingkat 1: Atap Titisan Landai Bawah
        const roof1 = new THREE.Mesh(new THREE.ConeGeometry(2.35, 0.6, 4).rotateY(Math.PI / 4), this.materials.terracotta);
        roof1.position.y = 1.95;
        roof1.castShadow = true;
        group.add(roof1);

        // Tingkat 2: Ventilasi Louvres Slatted Kayu
        const vent = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 1.4), this.materials.teakLight);
        vent.position.y = 2.25;
        group.add(vent);

        // Tingkat 3: Mahkota Atap Tajuk Joglo Curam Puncak
        const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.15, 4).rotateY(Math.PI / 4), this.materials.terracottaDark);
        roof2.position.y = 2.85;
        roof2.castShadow = true;
        group.add(roof2);

        // Nok Wuwungan Bubungan Lengkung
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 1.5), this.materials.terracotta);
        ridge.position.y = 3.35;
        group.add(ridge);

        // Mustaka Emas Kemilau di Puncak Tertinggi
        const finialBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.2, 8), this.materials.gold);
        finialBase.position.y = 3.5;
        group.add(finialBase);

        const finialSpire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), this.materials.gold);
        finialSpire.position.y = 3.8;
        group.add(finialSpire);

        // 4 Lentera Temaram Gantung di Sudut Atap
        const lanternGeo = new THREE.SphereGeometry(0.08, 6, 6);
        [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([lx, lz]) => {
            const lantern = new THREE.Mesh(lanternGeo, this.materials.goldBright);
            lantern.position.set(lx, 1.55, lz);
            group.add(lantern);
        });

        return group;
    }

    // =========================================================================
    // 3. MODEL WARUNG MADURA 24 JAM CAK MAHMUD
    // =========================================================================
    createWarungMaduraMesh() {
        const group = new THREE.Group();
        group.name = 'bld_warung_madura';

        // 1. Dinding Toko Stucco Krem Cerah & Lantai Keramik
        const floor = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 2.3), this.materials.creamDark);
        floor.position.y = 0.04;
        floor.receiveShadow = true;
        group.add(floor);

        const mainShop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 1.7), this.materials.cream);
        mainShop.position.set(0, 0.93, -0.2);
        mainShop.castShadow = true;
        group.add(mainShop);

        // Lis Dinding Bawah Bata Merah
        const baseSkirt = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.35, 1.75), this.materials.brick);
        baseSkirt.position.set(0, 0.25, -0.2);
        group.add(baseSkirt);

        // 2. Kanopi Terpal Ikonik Garis Merah-Putih Miring
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.06, 0.95), this.materials.bannerRed);
        canopy.rotation.x = 0.25;
        canopy.position.set(0, 1.82, 0.65);
        canopy.castShadow = true;
        group.add(canopy);

        // Garis Putih pada Terpal
        for (let s = -0.9; s <= 0.9; s += 0.45) {
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.96), this.materials.bannerWhite);
            stripe.rotation.x = 0.25;
            stripe.position.set(s, 1.825, 0.65);
            group.add(stripe);
        }

        // Papan Nama di Atas Kanopi: "WARUNG MADURA 24 JAM"
        const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.28, 0.06), this.materials.bannerRed);
        signBoard.position.set(0, 2.05, 0.32);
        group.add(signBoard);

        const signText = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.08), this.materials.bannerWhite);
        signText.position.set(0, 2.05, 0.33);
        group.add(signText);

        // 3. Etalase Kaca Depan & Rak Barang Warna-Warni (Mi Instan, Sabun, Makanan)
        const counterDesk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.4), this.materials.teakLight);
        counterDesk.position.set(0, 0.43, 0.65);
        group.add(counterDesk);

        const glassCase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.32), this.materials.glass);
        glassCase.position.set(0, 0.98, 0.65);
        group.add(glassCase);

        // Kotak-kotak Kemasan Dagangan di dalam Kaca
        const pkgColors = [this.materials.packageBlue, this.materials.packageGreen, this.materials.bannerRed, this.materials.gold];
        for (let px = -0.5; px <= 0.5; px += 0.32) {
            for (let py = 0; py <= 1; py++) {
                const pkg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), pkgColors[(Math.floor(Math.abs(px*10)) + py) % 4]);
                pkg.position.set(px, 0.85 + py * 0.18, 0.65);
                group.add(pkg);
            }
        }

        // 4. RAK BENSIN PERTAMINI (Botol Kaca Bensin Kuning Pertalite Eceran Ikonik)
        const pertaminiRack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), this.materials.ironDark);
        pertaminiRack.position.set(0.95, 0.38, 0.7);
        group.add(pertaminiRack);

        // 4 Botol Kaca Isi Bensin Kuning
        [-0.08, 0.08].forEach(bx => {
            [-0.08, 0.08].forEach(bz => {
                const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 6), this.materials.petrolYellow);
                bottle.position.set(0.95 + bx, 0.78, 0.7 + bz);
                group.add(bottle);
            });
        });

        // Corong Tuang Bensin Hitam di Samping Rak
        const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6).rotateX(Math.PI), this.materials.ironDark);
        funnel.position.set(0.95, 0.95, 0.9);
        group.add(funnel);

        // 5. Karung Beras Goni Bertumpuk di Sisi Barat
        const sack1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.35), this.materials.creamDark);
        sack1.position.set(-0.95, 0.18, 0.65);
        group.add(sack1);

        const sack2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.32), this.materials.creamDark);
        sack2.position.set(-0.95, 0.36, 0.65);
        group.add(sack2);

        // Kotak Es Pendingin Minuman
        const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.4), this.materials.bannerRed);
        cooler.position.set(-0.95, 0.3, 0.05);
        group.add(cooler);

        const coolerLid = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.42), this.materials.bannerWhite);
        coolerLid.position.set(-0.95, 0.55, 0.05);
        group.add(coolerLid);

        return group;
    }

    // =========================================================================
    // 4. MODEL WARUNG KOPI GIRAS (PUSAT CANGKRUKAN SANTEN & GORENGAN)
    // =========================================================================
    createWarungKopiMesh() {
        const group = new THREE.Group();
        group.name = 'bld_warung_kopi';

        // Lantai Papan Kayu
        const floor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 2.2), this.materials.teakDark);
        floor.position.y = 0.04;
        floor.receiveShadow = true;
        group.add(floor);

        // Dinding Bambu & Kayu Rustic
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, 0.15), this.materials.bambooDark);
        backWall.position.set(0, 0.83, -0.85);
        backWall.castShadow = true;
        group.add(backWall);

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 1.6), this.materials.bambooDark);
        leftWall.position.set(-1.0, 0.83, -0.05);
        leftWall.castShadow = true;
        group.add(leftWall);

        // Atap Seng / Genteng Miring Bertingkat
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 2.2), this.materials.terracotta);
        roof.rotation.x = 0.18;
        roof.position.set(0, 1.75, 0.15);
        roof.castShadow = true;
        group.add(roof);

        // Cerobong Uap Mini di Atas Atap
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), this.materials.ironDark);
        pipe.position.set(-0.6, 2.1, -0.4);
        group.add(pipe);

        // Meja Bar Kayu Melengkung / L-Shape
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.72, 0.4), this.materials.teakWarm);
        bar.position.set(0.1, 0.44, 0.45);
        group.add(bar);

        // Ceret Kopi Kuningan Leher Angsa
        const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.28, 8), this.materials.brass);
        kettle.position.set(-0.4, 0.94, 0.45);
        group.add(kettle);

        // Lemari Kaca Gorengan (Pisang Goreng, Tempe Mendoan, Tahu)
        const snackCase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.28), this.materials.glass);
        snackCase.position.set(0.55, 0.96, 0.45);
        group.add(snackCase);

        const snackFood = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.2), this.materials.gold);
        snackFood.position.set(0.55, 0.88, 0.45);
        group.add(snackFood);

        // Gantungan Kopi Sachet Renteng Aneka Warna
        const sachetBeam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.04), this.materials.teakDark);
        sachetBeam.position.set(0.1, 1.5, 0.45);
        group.add(sachetBeam);

        const sachetColors = [this.materials.bannerRed, this.materials.gold, this.materials.packageGreen, this.materials.packageBlue];
        for (let si = -0.5; si <= 0.5; si += 0.25) {
            const strand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.02), sachetColors[Math.floor(Math.random() * 4)]);
            strand.position.set(si + 0.1, 1.3, 0.45);
            group.add(strand);
        }

        // Bangku Panjang Kayu / Lincak Cangkrukan
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.32, 0.3), this.materials.teakLight);
        bench.position.set(0.1, 0.2, 0.95);
        group.add(bench);

        // Cangkir Kopi Blirik Hijau di Meja
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 6), this.materials.leafGreen);
        cup.position.set(0.05, 0.84, 0.45);
        group.add(cup);

        // Bohlam Gantung Temaram
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), this.materials.goldBright);
        bulb.position.set(0, 1.35, 0.45);
        group.add(bulb);

        return group;
    }

    // =========================================================================
    // 5. MODEL KEBUN HIDROPONIK HIJAU
    // =========================================================================
    /**
     * Petak sawah milik warga, visual mengikuti tanaman terpilih (crops.js):
     * padi (tuft pendek), jagung (batang tinggi + tongkol), tomat/cabai (semak + buah),
     * semangka (vine + buah bulat besar).
     */
    createSawahMesh(cropId) {
        const c = getCrop(cropId);
        const CROP_VIS = {
            padi:     { plant: 0x5E9A3A, fruit: 0xCDB750 },
            jagung:   { plant: 0x4F8A35, fruit: 0xE6B732 },
            tomat:    { plant: 0x3D6B2C, fruit: 0xD6453A },
            semangka: { plant: 0x4C7F34, fruit: 0x2E8B4F },
            cabai:    { plant: 0x3A6B30, fruit: 0xD13B2A }
        };
        const vis = CROP_VIS[c.id] || CROP_VIS.padi;
        const group = new THREE.Group();
        group.name = 'bld_sawah_' + c.id;
        const plantMat = new THREE.MeshLambertMaterial({ color: vis.plant });
        const fruitMat = new THREE.MeshLambertMaterial({ color: vis.fruit });
        const surf = 0.18;
        const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };

        // Petak berair + pematang tanah di tepi
        add(new THREE.BoxGeometry(2.5, 0.16, 2.3), this.materials.teakDark, 0, 0.08, 0).receiveShadow = true;
        add(new THREE.BoxGeometry(2.3, 0.1, 2.1), this.materials.water, 0, 0.12, 0).receiveShadow = true;

        // Bentuk tanaman per jenis (shape, tinggi, buah) — grid 5×5
        const style = { jagung: 'tall', semangka: 'vine', tomat: 'bush', cabai: 'bush' }[c.id] || 'rice';
        const N = 5, step = 1.9 / (N - 1), x0 = -0.95;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
            const px = x0 + i * step, pz = x0 + j * step;
            if (style === 'tall') {
                add(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 5), plantMat, px, surf + 0.45, pz);
                add(new THREE.ConeGeometry(0.16, 0.5, 5), this.materials.leafDark || plantMat, px, surf + 0.85, pz);
                add(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), fruitMat, px + 0.1, surf + 0.6, pz).rotation.z = 0.4;
            } else if (style === 'vine') {
                add(new THREE.BoxGeometry(0.34, 0.06, 0.34), plantMat, px, surf + 0.03, pz);
                if ((i + j) % 2 === 0) add(new THREE.SphereGeometry(0.16, 8, 6), fruitMat, px, surf + 0.14, pz);
            } else if (style === 'bush') {
                add(new THREE.DodecahedronGeometry(0.18, 0), plantMat, px, surf + 0.18, pz).scale.set(1, 0.9, 1);
                add(new THREE.SphereGeometry(0.06, 6, 5), fruitMat, px, surf + 0.3, pz);
            } else {
                add(new THREE.BoxGeometry(0.16, 0.3, 0.16), plantMat, px, surf + 0.15, pz);
                add(new THREE.ConeGeometry(0.1, 0.14, 5), fruitMat, px, surf + 0.33, pz);
            }
        }
        return group;
    }

    /** Bangun ulang mesh sawah setelah ganti tanaman (crop) supaya tampilan ikut berubah. */
    refreshBuildingMesh(id, crop) {
        const item = this.loadedBuildings.get(id);
        if (!item || !item.data || item.data.type !== 'sawah') return;
        const data = { ...item.data };
        if (crop) data.crop = crop;
        this.demolishBuilding(id);
        this.addBuilding(data);
    }

    createKebunSayurMesh() {
        const group = new THREE.Group();
        group.name = 'bld_kebun_sayur';

        // Bedeng Tanah Subur & Rangka Batas Kayu
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 2.3), this.materials.teakDark);
        frame.position.y = 0.07;
        frame.receiveShadow = true;
        group.add(frame);

        const soil = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 2.1), this.materials.stone);
        soil.position.y = 0.15;
        group.add(soil);

        // Tiang Rangka Paranet Pelindung Matahari
        const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6);
        [[-1.0, -0.9], [1.0, -0.9], [-1.0, 0.9], [1.0, 0.9]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(postGeo, this.materials.bambooDark);
            post.position.set(px, 1.0, pz);
            group.add(post);
        });

        // Jaring Paranet Hijau di Atap
        const paranet = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.0).rotateX(-Math.PI / 2), this.materials.leafDark);
        paranet.position.y = 1.9;
        group.add(paranet);

        // 2 Rak Pipa Hidroponik A-Frame (Kiri & Kanan)
        [-0.55, 0.55].forEach(rx => {
            // Pipa PVC Putih 3 Tingkat
            [0.4, 0.75, 1.1].forEach((py, idx) => {
                const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8).rotateX(Math.PI / 2), this.materials.cream);
                pipe.position.set(rx, py, 0);
                pipe.castShadow = true;
                group.add(pipe);

                // Kepala Selada Hijau Mekar (3 per pipa = 18 sayur total)
                const greenTones = [this.materials.leafGreen, this.materials.grass, this.materials.leafDark];
                [-0.5, 0, 0.5].forEach((sz, sidx) => {
                    const veg = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), greenTones[(idx + sidx) % 3]);
                    veg.position.set(rx, py + 0.12, sz);
                    veg.scale.set(1.1, 0.8, 1.1);
                    veg.castShadow = true;
                    group.add(veg);
                });
            });
        });

        // Tandon Nutrisi Biru 200L di Sudut Belakang
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.65, 10), this.materials.packageBlue);
        tank.position.set(-0.9, 0.48, -0.75);
        tank.castShadow = true;
        group.add(tank);

        // 2 Peti Kayu Panen Sayuran Segar (Wortel Oranye & Tomat Merah)
        const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.32), this.materials.teakLight);
        crate1.position.set(0.85, 0.24, -0.6);
        group.add(crate1);

        const carrots = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.25), this.materials.petrolYellow);
        carrots.position.set(0.85, 0.34, -0.6);
        group.add(carrots);

        const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.3), this.materials.teakLight);
        crate2.position.set(0.85, 0.22, 0.6);
        group.add(crate2);

        const tomatoes = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.22), this.materials.bannerRed);
        tomatoes.position.set(0.85, 0.31, 0.6);
        group.add(tomatoes);

        return group;
    }

    // =========================================================================
    // 6. MODEL SAUNG BAMBU SANTAI
    // =========================================================================
    createSaungBambuMesh() {
        const group = new THREE.Group();
        group.name = 'bld_saung_bambu';

        // Panggung Bambu Alami Berdiri di Atas Umpak Batu
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 2.1), this.materials.bamboo);
        deck.position.y = 0.35;
        deck.receiveShadow = true;
        group.add(deck);

        // 4 Tiang Kaki Panggung Pendek
        [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].forEach(([sx, sz]) => {
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.18), this.materials.stone);
            foot.position.set(sx, 0.14, sz);
            group.add(foot);
        });

        // Tangga Bambu 2 Trap Masuk Saung
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.35), this.materials.bambooDark);
        ladder.position.set(0, 0.14, 1.25);
        group.add(ladder);

        // 4 Tiang Bambu Utama
        const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6);
        [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].forEach(([px, pz]) => {
            const post = new THREE.Mesh(postGeo, this.materials.bambooDark);
            post.position.set(px, 1.2, pz);
            post.castShadow = true;
            group.add(post);
        });

        // Sandaran Duduk Bambu Belakang & Samping
        const railH = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.06), this.materials.bamboo);
        railH.position.set(0, 0.72, -0.8);
        group.add(railH);

        // Atap Ijuk Aren Hitam Bertingkat Dua yang Tebal & Berserat
        const roof1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 4).rotateY(Math.PI / 4), this.materials.thatchIjuk);
        roof1.position.y = 2.15;
        roof1.castShadow = true;
        group.add(roof1);

        const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.8, 4).rotateY(Math.PI / 4), this.materials.thatchIjuk);
        roof2.position.y = 2.65;
        roof2.castShadow = true;
        group.add(roof2);

        // Puncak Ikatan Tali Ijuk
        const peakTie = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.25, 8), this.materials.bambooDark);
        peakTie.position.y = 3.1;
        group.add(peakTie);

        // Meja Teh Kayu Rendah & Teko Poci Tanah Liat
        const teaTable = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.65), this.materials.teakWarm);
        teaTable.position.set(0, 0.52, 0);
        group.add(teaTable);

        const poci = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this.materials.terracotta);
        poci.position.set(0, 0.68, 0);
        group.add(poci);

        // Bantal Duduk Nyaman
        const cushion1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.35), this.materials.terracotta);
        cushion1.position.set(-0.45, 0.44, 0);
        group.add(cushion1);

        const cushion2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.35), this.materials.grass);
        cushion2.position.set(0.45, 0.44, 0);
        group.add(cushion2);

        // Gantungan Angklung Angin Bambu di Samping
        const chimes = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), this.materials.bamboo);
        chimes.position.set(0.8, 1.7, 0.4);
        group.add(chimes);

        return group;
    }

    // =========================================================================
    // 7. MODEL POS RONDA SISKAMLING (POS KEAMANAN DENGAN KENTONGAN RAKSASA)
    // =========================================================================
    createPosRondaMesh() {
        const group = new THREE.Group();
        group.name = 'bld_pos_ronda';

        // Pondasi Kaki Panggung & Lantai Kayu Siskamling
        const floor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 2.1), this.materials.teakWarm);
        floor.position.y = 0.3;
        floor.receiveShadow = true;
        group.add(floor);

        // 4 Pilar Batu Pondasi
        [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].forEach(([px, pz]) => {
            const pier = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), this.materials.stone);
            pier.position.set(px, 0.12, pz);
            group.add(pier);

            const timber = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), this.materials.teakDark);
            timber.position.set(px, 1.12, pz);
            timber.castShadow = true;
            group.add(timber);
        });

        // Pagar Pembatas Silang Khas Pos Kamling
        const fenceB = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.04), this.materials.teakLight);
        fenceB.position.set(0, 0.55, -0.8);
        group.add(fenceB);

        const fenceL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 1.7), this.materials.teakLight);
        fenceL.position.set(-0.8, 0.55, 0);
        group.add(fenceL);

        // Atap Genteng Kampung Miring
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 0.85, 4).rotateY(Math.PI / 4), this.materials.terracotta);
        roof.position.y = 2.15;
        roof.castShadow = true;
        group.add(roof);

        // KENTONGAN KAYU JATI RAKSASA DENGAN GANDHEN (PEMUKUL)
        const beamCenter = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.7), this.materials.teakDark);
        beamCenter.position.set(0, 1.82, 0);
        group.add(beamCenter);

        const ropeK = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 4), this.materials.ink);
        ropeK.position.set(0.3, 1.68, 0);
        group.add(ropeK);

        const kentongan = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.65, 8), this.materials.teakWarm);
        kentongan.position.set(0.3, 1.35, 0);
        kentongan.castShadow = true;
        group.add(kentongan);

        // Rongga Kentongan Hitam
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 0.08), this.materials.ink);
        slit.position.set(0.38, 1.35, 0);
        group.add(slit);

        // Gandhen (Pemukul Kayu)
        const mallet = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.35, 4).rotateZ(0.4), this.materials.teak);
        mallet.position.set(0.48, 1.25, 0.1);
        group.add(mallet);

        // Papan Jadwal Ronda Malam di Dinding Belakang
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.04), this.materials.ink);
        board.position.set(-0.25, 1.1, -0.78);
        group.add(board);

        // Lentera Senter Kuning & Helm Ronda di Meja
        const tableRonda = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.4), this.materials.teakWarm);
        tableRonda.position.set(-0.35, 0.48, 0.3);
        group.add(tableRonda);

        const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 6), this.materials.petrolYellow);
        lantern.position.set(-0.35, 0.72, 0.3);
        group.add(lantern);

        return group;
    }

    // =========================================================================
    // 8. MODEL TAMAN SURYA TIRTA (AIR MANCUR MARMER BERTINGKAT & FLOWERBEDS)
    // =========================================================================
    createTamanSuryaMesh() {
        const group = new THREE.Group();
        group.name = 'bld_taman_surya';

        // Alas Bundar Rumput & Jalur Setapak Batu Sandstone
        const plazaBase = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.4, 0.08, 24), this.materials.creamDark);
        plazaBase.position.y = 0.04;
        plazaBase.receiveShadow = true;
        group.add(plazaBase);

        // Kolam Bawah Marmer Lingkar
        const outerBasin = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.35, 20), this.materials.cream);
        outerBasin.position.y = 0.22;
        outerBasin.castShadow = true;
        group.add(outerBasin);

        // Air Jernih Biru Kolam Bawah
        const waterBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.05, 20), this.materials.water);
        waterBottom.position.y = 0.36;
        group.add(waterBottom);

        // Mangkuk Air Mancur Tingkat Dua
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.55, 8), this.materials.creamDark);
        pedestal.position.y = 0.62;
        group.add(pedestal);

        const midBasin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.18, 16), this.materials.cream);
        midBasin.position.y = 0.88;
        group.add(midBasin);

        const waterMid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.04, 16), this.materials.water);
        waterMid.position.y = 0.96;
        group.add(waterMid);

        // Nozel Emas & Kolom Air Puncak
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.35, 8), this.materials.gold);
        spout.position.y = 1.12;
        group.add(spout);

        const waterJet = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), this.materials.waterShimmer);
        waterJet.position.y = 1.45;
        group.add(waterJet);

        // 4 Petak Bunga Marigold Emas & Mawar Mengelilingi Kolam
        const flowerCoords = [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]];
        flowerCoords.forEach(([fx, fz], idx) => {
            const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 8), this.materials.grass);
            bed.position.set(fx, 0.08, fz);
            group.add(bed);

            const blossom = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.12, 0),
                idx % 2 === 0 ? this.materials.flowerGold : this.materials.flowerRed
            );
            blossom.position.set(fx, 0.2, fz);
            group.add(blossom);
        });

        // 2 Bangku Taman Kayu Melengkung
        [-1.15, 1.15].forEach(bx => {
            const bench = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, 0.7), this.materials.teakWarm);
            bench.position.set(bx, 0.18, 0);
            group.add(bench);
        });

        return group;
    }

    // =========================================================================
    // 9. MODEL RUMAH LIMASAN JAWA (HUNIAN TRADISIONAL BERATAP LIMAS & SERAMBI)
    // =========================================================================
    createRumahLimasMesh() {
        const group = new THREE.Group();
        group.name = 'bld_rumah_limas';

        // Lantai Dasar Umpak Marmer
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 2.5), this.materials.creamDark);
        plinth.position.y = 0.07;
        plinth.receiveShadow = true;
        group.add(plinth);

        // Dinding Gebyok Kayu Jati Berukir (Rumah Inti)
        const core = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, 1.6), this.materials.teakWarm);
        core.position.set(0, 0.84, -0.3);
        core.castShadow = true;
        group.add(core);

        // Pintu Gebyok Ukir Tengah & Jendela Krepyak
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.06), this.materials.teakDark);
        door.position.set(0, 0.72, 0.52);
        group.add(door);

        [-0.6, 0.6].forEach(wx => {
            const windowL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.65, 0.05), this.materials.teakLight);
            windowL.position.set(wx, 0.85, 0.52);
            group.add(windowL);
        });

        // Serambi Depan (Emperan Gandok) dengan 4 Tiang Kayu Ramping
        const verandaColGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6);
        [-0.9, -0.3, 0.3, 0.9].forEach(cx => {
            const col = new THREE.Mesh(verandaColGeo, this.materials.teak);
            col.position.set(cx, 0.84, 0.85);
            col.castShadow = true;
            group.add(col);
        });

        // Atap Limasan Bertingkat Khas Jawa
        // Tingkat 1: Atap Serambi Eaves
        const roof1 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.65, 4).rotateY(Math.PI / 4), this.materials.terracotta);
        roof1.position.set(0, 1.85, 0);
        roof1.castShadow = true;
        group.add(roof1);

        // Tingkat 2: Mahkota Limasan Atas
        const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.85, 4).rotateY(Math.PI / 4), this.materials.terracottaDark);
        roof2.position.set(0, 2.35, -0.15);
        roof2.castShadow = true;
        group.add(roof2);

        // Nok Wuwungan Bubungan Burung
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 1.2), this.materials.terracotta);
        ridge.position.set(0, 2.75, -0.15);
        group.add(ridge);

        // Gentong Padasan (Tempat Cuci Kaki Tanah Liat Tradisional di Depan Tangga)
        const padasanPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.22, 6), this.materials.stone);
        padasanPedestal.position.set(-0.85, 0.22, 1.05);
        group.add(padasanPedestal);

        const padasanPot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), this.materials.terracotta);
        padasanPot.position.set(-0.85, 0.44, 1.05);
        group.add(padasanPot);

        // Pot Tanaman Melati di Teras Kanan
        const flowerPot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.2, 6), this.materials.terracotta);
        flowerPot.position.set(0.85, 0.22, 1.05);
        group.add(flowerPot);

        const plant = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), this.materials.leafGreen);
        plant.position.set(0.85, 0.42, 1.05);
        group.add(plant);

        return group;
    }

    createDefaultBuildingMesh(type) {
        return this.createRumahLimasMesh();
    }

    /**
     * Memperbarui hitung mundur konstruksi tiap detik
     */
    updateTimers() {
        const now = Date.now();
        const completedIds = [];

        this.loadedBuildings.forEach((bld, id) => {
            if (bld.data.stage === 'proyek' && bld.billboardObj) {
                this.drawBillboard(bld.billboardObj.ctx, bld.billboardObj.texture, bld.data);

                const finish = new Date(bld.data.build_finished_at).getTime();
                if (now >= finish) {
                    completedIds.push(id);
                }
            }
        });

        if (completedIds.length) {
            const pending = [];
            completedIds.forEach(id => this.completeBuilding(id, pending));
            this.batchMergeStaticBuildings(pending);
        }
    }

    /**
     * Mengubah status proyek menjadi bangunan selesai
     */
    completeBuilding(id, pending = null) {
        const item = this.loadedBuildings.get(id);
        if (!item) return;

        if (!item.mesh) return;
        this.buildingsGroup.remove(item.mesh);
        disposeBaked(item.mesh);

        item.data.stage = 'selesai';
        // Bangunan jadi masuk chunk statis (dilebur) agar draw call tidak bertambah
        this.loadedBuildings.delete(id);
        if (pending) pending.push(item.data);   // dilebur sekali untuk banyak proyek
        else this.batchMergeStaticBuildings([item.data]);

        console.log(`[Konstruksi] Proyek ${item.data.title || item.data.type} telah resmi selesai dibangun!`);

        if (this.callbacks && this.callbacks.onBuildingCompleted) {
            this.callbacks.onBuildingCompleted(item.data);
        }
    }

    /**
     * Menggusur / menghapus bangunan dari dunia 3D (Super Admin Power)
     */

    /**
     * Memperbarui mode pencahayaan siang/malam pada lampu dan jendela seluruh bangunan
     */
    updateLighting(isNight) {
        if (!this.materials) return;

        // Lampu jendela bangunan heritage
        if (this.materials.windowGlow) {
            if (isNight) {
                this.materials.windowGlow.color.setHex(0xFFE082);
                this.materials.windowGlow.emissive.setHex(0xFFA000);
                this.materials.windowGlow.emissiveIntensity = 1.2;
            } else {
                this.materials.windowGlow.color.setHex(0x475569);
                this.materials.windowGlow.emissive.setHex(0x000000);
                this.materials.windowGlow.emissiveIntensity = 0.0;
            }
        }

        // Lentera gapura dan sumur
        if (this.materials.lanternGlow) {
            if (isNight) {
                this.materials.lanternGlow.color.setHex(0xFEF08A);
            } else {
                this.materials.lanternGlow.color.setHex(0x94A3B8);
            }
        }
    }

    demolishBuilding(id) {
        const item = this.loadedBuildings.get(id);
        if (!item) return false;

        if (item.mesh) {
            this.buildingsGroup.remove(item.mesh);
            disposeBaked(item.mesh);
        }
        this.loadedBuildings.delete(id);
        this.layout.release(id);
        if (item.chunkKey) {
            const chunk = this.staticChunks.get(item.chunkKey);
            if (chunk) {
                chunk.members.delete(id);
                this.rebuildStaticChunk(item.chunkKey);
            }
        }
        console.log(`[Admin] Bangunan ${id} berhasil digusur.`);
        return true;
    }

    /**
     * Menyelesaikan seluruh proyek konstruksi yang sedang aktif secara serentak (Super Admin Power)
     */
    completeAllProjects() {
        const projectIds = [];
        this.loadedBuildings.forEach((item, id) => {
            if (item.data.stage === 'proyek' || item.data.stage === 'bangun') {
                projectIds.push(id);
            }
        });
        const pending = [];
        projectIds.forEach(id => this.completeBuilding(id, pending));
        this.batchMergeStaticBuildings(pending);
        return projectIds.length;
    }
}
