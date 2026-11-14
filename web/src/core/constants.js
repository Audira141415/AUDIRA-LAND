/**
 * AUDIRA-LAND: Konstanta Sistem, Grid, dan Palet Warna
 * Berpedoman pada standar "Tinta Hangat" (Warm Ink) Nusantara dan Anggaran Mobile 390px.
 * Diperkaya dengan seluruh arsitektur dan sistem grid teruji Republik Netizenia v2.
 */

import { isRoadTile, isLotTile } from './road_network.js';

// =============================================================================
// 1. PALET WARNA TINTA HANGAT (WARM INK PALETTE NUSANTARA)
// =============================================================================
export const PALETTE = {
    // Latar & Langit
    SKY_DAY: 0xDCEDFA,
    SKY_DAWN: 0xFCE8DC,
    SKY_DUSK: 0xF7B07A,
    SKY_NIGHT: 0x141B2B,

    FOG_DAY: 0xE8F0F7,
    FOG_NIGHT: 0x161E30,

    // Tanah & Alam Tropis Nusantara
    GROUND_BASE: 0x5D8C43,       // Rumput tropis dasar
    GRASS: 0x629B43,             // Rumput taman & kavling
    GRASS_ALT: 0x74A356,         // Variasi rumput hijau muda
    GRASS_DARK: 0x4F7239,        // Rumput teduh
    WATER: 0x4A9BBF,             // Air mancur jernih
    WATER_SHIMMER: 0x76BEE0,

    // Sungai Pemisah & Jembatan Penghubung
    RIVER_WATER: 0x2563EB,       // Air sungai jernih biru royal
    RIVER_DEEP: 0x1E3A8A,        // Kedalaman palung sungai biru dongker
    RIVER_BANK: 0x64748B,        // Tanggul batu kali tepi sungai abu-abu kokoh
    BRIDGE_DECK: 0x334155,       // Geladak jembatan aspal
    BRIDGE_RAIL: 0xCBD5E1,       // Railing pagar jembatan baja putih
    BRIDGE_PIER: 0x475569,       // Pilar beton jembatan

    // Jalan & Infrastruktur
    ROAD_ARTERIAL: 0x2A2C31,     // Aspal jalan arteri utama (10m)
    ROAD_COLLECTOR: 0x36383E,    // Aspal jalan kolektor (5.2m)
    ROAD_ALLEY: 0xB5A593,        // Paving gang pemukiman (2.7m)
    ROAD_MARKING: 0xFFF9EE,      // Marka jalan krem terang
    ROAD_ZEBRA: 0xEDE9DF,        // Zebra crossing
    SIDEWALK: 0xD6CBBF,          // Trotoar batu sandstone krem
    CURB: 0x9E978C,              // Lis pembatas trotoar / curb beton
    MEDIAN: 0x629B43,            // Pulau median jalan arteri

    // Kavling (Plot)
    PLOT_PAD: 0x629B43,          // Lantai rumput kavling
    PLOT_PAD_ALT: 0x74A356,
    PLOT_BORDER: 0x8C8376,       // Lis pembatas kavling
    PLOT_HOVER: 0xE9A91E,        // Sorotan emas kursor hover
    PLOT_LOCKED: 0x8C8376,       // Kavling distrik terkunci

    // Material Pohon & Tanaman
    TREE_TRUNK: 0x5E4630,        // Batang pohon kayu
    TREE_LEAF_TOP: 0x7FA850,     // Daun atas
    TREE_LEAF_MID: 0x6A9245,     // Daun tengah
    TREE_LEAF_BOT: 0x4F7239,     // Daun bawah
    PALM_LEAF: 0x5C7D3E,         // Daun palem
    PINE_LEAF: 0x3F5E44,         // Daun cemara

    // Material Arsitektur Nusantara
    INK: 0x231B14,               // Tinta garis tepi
    WOOD: 0x54331C,              // Kayu jati tua
    WOOD_WARM: 0x754728,         // Kayu jati serambi
    WOOD_LIGHT: 0x9C6F47,        // Kayu kusen & mebel
    BAMBOO: 0xBFA06A,            // Bambu kering kuning
    BAMBOO_POLE: 0x8E7548,       // Tiang bambu
    THATCH_IJUK: 0x26221E,       // Atap ijuk aren hitam
    TERRACOTTA: 0xC8553D,        // Genteng tanah liat bakar
    TERRACOTTA_DARK: 0xA33822,   // Nok wuwungan bata
    GOLD: 0xE9A91E,              // Logam emas mahkota / tugu
    GOLD_BRIGHT: 0xFFA726,       // Lampu temaram emas
    CREAM: 0xFFF9EC,             // Plafon & dinding stucco krem
    CREAM_DARK: 0xF0E5D3,        // Plinth marmer

    // Material Khusus Warung, Crane & Fasilitas
    CRANE_YELLOW: 0xF1C40F,      // Crane kuning konstruksi
    CRANE_DARK: 0xD4AC0D,
    PETROL_YELLOW: 0xFFCA28,     // Botol bensin eceran Pertamini
    BANNER_RED: 0xD32F2F,        // Garis terpal merah
    BANNER_WHITE: 0xFFFFFF,      // Garis terpal putih
    LEAF_GREEN: 0x4CAE30,        // Daun sayur hidroponik
    LEAF_DARK: 0x2E7D1A          // Rimbun tanaman hias
};

// =============================================================================
// 2. SPESIFIKASI GRID DETERMINISTIK KOTA (T = 8.0m, N = 217, PD = 43)
// =============================================================================
export const GRID_CONFIG = {
    // Dimensi Dunia: 1 unit = 1 meter nyata
    TILE_SIZE: 8.0,             // 8.0 meter per petak tile
    N_TILES: 217,               // 217 x 217 total petak dunia
    HALF_TILES: 108,            // Pusat koordinat (tile 108 = 0m)
    PD: 43,                     // 43 petak per distrik (5x5 distrik = 215 + 2 border)

    // Ukuran Distrik
    DISTRICTS_X: 5,
    DISTRICTS_Y: 5,
    TOTAL_DISTRICTS: 25,
    CENTER_DISTRICT_KEY: 'k12', // Alun-Alun Merdeka (Pusat Kota)

    // Hirarki Lebar Jalan
    ROAD_ARTERIAL_WIDTH: 10.0,  // Jalan protokol arteri (Class 3)
    ROAD_COLLECTOR_WIDTH: 5.2,  // Jalan kolektor tengah (Class 2)
    ROAD_ALLEY_WIDTH: 2.7,      // Gang pemukiman (Class 1)
    SIDEWALK_WIDTH: 1.4,        // Trotoar batu krem
    CURB_WIDTH: 0.22,           // Pembatas jalan beton

    // Kavling (Plot) Deterministik
    PLOT_SIZE: 7.8,             // 7.8m x 7.8m bantalan kavling hijau
    PLOT_PAD_HEIGHT: 0.04,      // Ketinggian bantalan rumput (+0.04m)
    SURFACE_Y: 0.20,            // Elevasi permukaan tanah netizenia Y0 = 0.20m
    MICRO_LIFT: 0.02,           // Toleransi Zero-Submerging (+0.02m)

    // Jangkauan Distrik Aktif k12 (Simetris 24 petak ke kiri & kanan dari tile 108)
    ACTIVE_MIN_I: 72,          // Desa Have diperluas 12 kolom ke barat (2026-11-13) agar bangunan mewah muat
    ACTIVE_MAX_I: 140,          // Desa Have-Not diperluas 8 kolom ke timur (2026-11-13), sawah ikut bergeser (EAST_DX)
    ACTIVE_MIN_J: 86,
    ACTIVE_MAX_J: 129,

    // Sungai Pemisah Desa Have & Have-Not (32 Meter Lebar)
    RIVER_MIN_X: -16.0,         // Batas barat sungai (Desa Have di X < -16m)
    RIVER_MAX_X: 16.0,          // Batas timur sungai (Desa Have-Not di X > +16m)
    RIVER_WIDTH: 32.0,          // Lebar sungai 32 meter
    RIVER_TILE_MIN_I: 106,      // Tile awal koridor sungai
    RIVER_TILE_MAX_I: 109       // Tile akhir koridor sungai
};

// Fungsi Helper Grid Matematika Deterministik
export const wx = a => (a - GRID_CONFIG.HALF_TILES) * GRID_CONFIG.TILE_SIZE;
// Batas timur peta aktif (m) & pergeseran pemandangan sawah/kali/gunung terhadap tata letak awal (batas 200 m).
// rural_scenery.js, wildlife.js, weather.js menambahkan EAST_DX ke semua koordinat X sisi timur.
export const EAST_EDGE_X = (GRID_CONFIG.ACTIVE_MAX_I + 1 - GRID_CONFIG.HALF_TILES) * GRID_CONFIG.TILE_SIZE;
export const EAST_DX = EAST_EDGE_X - 200;
// Rumus jalan periodik 1D lama (roadI/roadJ) sudah dihapus: jalan kini peta 2D organik di
// road_network.js (roadAt). isRoad/isLot di bawah hanya meneruskan ke sana. Impor melingkar aman
// karena road_network.js tidak membaca GRID_CONFIG di top-level.
export const isRiverTile = a => a >= GRID_CONFIG.RIVER_TILE_MIN_I && a <= GRID_CONFIG.RIVER_TILE_MAX_I;
export const inMap = (a, t) => a >= 0 && t >= 0 && a < GRID_CONFIG.N_TILES && t < GRID_CONFIG.N_TILES;
export const isRoad = (a, t) => inMap(a, t) && isRoadTile(a, t);
export const isLot = (a, t) => isLotTile(a, t);

// Daftar 25 Distrik
export const DISTRICT_MAP = [
    { key: 'k00', name: 'Pesisir Utara Barat', gridX: 0, gridY: 0 },
    { key: 'k01', name: 'Pesisir Utara', gridX: 1, gridY: 0 },
    { key: 'k02', name: 'Kampung Nelayan Utara', gridX: 2, gridY: 0 },
    { key: 'k03', name: 'Pesisir Utara Timur', gridX: 3, gridY: 0 },
    { key: 'k04', name: 'Tanjung Harapan', gridX: 4, gridY: 0 },
    { key: 'k05', name: 'Kawasan Barat Laut', gridX: 0, gridY: 1 },
    { key: 'k06', name: 'Perkebunan Buah', gridX: 1, gridY: 1 },
    { key: 'k07', name: 'Kampung Budaya Utara', gridX: 2, gridY: 1 },
    { key: 'k08', name: 'Hulu Sungai Timur', gridX: 3, gridY: 1 },
    { key: 'k09', name: 'Kawasan Timur Laut', gridX: 4, gridY: 1 },
    { key: 'k10', name: 'Kawasan Industri Barat', gridX: 0, gridY: 2 },
    { key: 'k11', name: 'Permukiman Barat', gridX: 1, gridY: 2 },
    { key: 'k12', name: 'Alun-Alun Merdeka (Pusat Kota)', gridX: 2, gridY: 2 },
    { key: 'k13', name: 'Permukiman Timur', gridX: 3, gridY: 2 },
    { key: 'k14', name: 'Kawasan Niaga Timur', gridX: 4, gridY: 2 },
    { key: 'k15', name: 'Kawasan Barat Daya', gridX: 0, gridY: 3 },
    { key: 'k16', name: 'Pertanian Sayur Organik', gridX: 1, gridY: 3 },
    { key: 'k17', name: 'Kampung Selatan Subur', gridX: 2, gridY: 3 },
    { key: 'k18', name: 'Kawasan Riset Agrikultur', gridX: 3, gridY: 3 },
    { key: 'k19', name: 'Kawasan Tenggara', gridX: 4, gridY: 3 },
    { key: 'k20', name: 'Tanjung Barat Selatan', gridX: 0, gridY: 4 },
    { key: 'k21', name: 'Hutan Konservasi Selatan', gridX: 1, gridY: 4 },
    { key: 'k22', name: 'Kawasan Suaka Selatan', gridX: 2, gridY: 4 },
    { key: 'k23', name: 'Kawasan Perbukitan Hijau', gridX: 3, gridY: 4 },
    { key: 'k24', name: 'Ujung Samudra Tenggara', gridX: 4, gridY: 4 }
];
