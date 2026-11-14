/**
 * AUDIRA-LAND: Ciri Khas Desa Have (barat sungai) & Desa Have-Not (timur sungai).
 * Satu sumber data (spek docs/SPEC_CIRI_KHAS_DESA.md): palet, jalan, perabot, kendaraan,
 * peran warga, suara, dan angka ekonomi. Modul lain hanya MEMBACA tabel ini.
 * Angka ekonomi wajib sama dengan RPC di supabase/schema.sql (claim_plot_and_build, work_at_building, harvest_building).
 */

import { GRID_CONFIG } from './constants.js';
import { isHaveNotTile } from './village_rules.js';
import { cropAmount, cropIntervalMs, cropOf } from './crops.js';

export const VILLAGE_IDENTITY = {
    have: {
        id: 'have',
        icon: '🏙️',
        title: 'Desa Have',
        economy: {
            claimFee: 150,          // biaya klaim kavling (di luar biaya bangunan)
            baseWage: 42,           // 35 ₳ × 1,2
            cityTaxRate: 0.10,      // pajak kota: 10% upah masuk kas kota
            gotongRoyongBonus: 0,
            harvest: null
        },
        rules: {
            claim: '🏙️ Desa Have: kavling kota 150 ₳',
            work: '🏙️ Desa Have: upah kota 42 ₳, pajak kota 10% masuk kas'
        },
        palette: {
            road: 0x3B3F46,         // aspal gelap
            roadMark: 0xF4F4F0,     // marka putih putus-putus
            sidewalk: 0xB8BBC0,     // trotoar keramik abu
            curb: 0x8E9196,         // kanstin
            ground: 0x6FAE4E,       // rumput hijau rata
            fence: 0x2F3437,        // pagar besi
            lampPole: 0x5B6168,
            lampLight: 0xF2F6FF,    // LED putih
            hemiTint: 0xE8F0FF      // nada sedikit dingin
        },
        streetLamp: 'modern',
        fence: 'besi',
        trees: ['peneduh'],
        vehicles: { car: 5, taxi: 2, bus: 2, ojek: 2, layanan: 2, foodtruck: 1 },   // mobil, taksi, bus kota, ojek, layanan kota, food truck
        walkerRoles: ['kantoran', 'pedagang_toko', 'pelajar', 'pelari', 'polisi', 'dokter', 'guru'],
        idleScenes: ['kafe', 'bangku_taman'],
        // kepadatan pejalan per jam (0..1), ramai siang
        density: h => (h >= 9 && h < 17) ? 1 : (h >= 6 && h < 21) ? 0.7 : 0.3,
        sound: { day: ['lalu_lintas', 'klakson', 'keramaian'], night: ['musik_kafe'] }
    },
    have_not: {
        id: 'have_not',
        icon: '🌾',
        title: 'Desa Have-Not',
        economy: {
            claimFee: 60,
            baseWage: 35,
            cityTaxRate: 0,
            gotongRoyongBonus: 10,  // kerja di bangunan warga lain se-desa
            harvest: { types: ['sawah', 'kebun_sayur'], amount: 15, intervalMs: 24 * 60 * 60 * 1000 }
        },
        rules: {
            claim: '🌾 Desa Have-Not: kavling murah 60 ₳',
            work: '🌾 Desa Have-Not: bantu tetangga +10 ₳ di bangunan tetangga se-desa'
        },
        palette: {
            road: 0x8A6A48,         // tanah / makadam cokelat
            roadMark: null,         // tanpa marka
            sidewalk: 0x6E8F3E,     // rumput liar tepi jalan
            curb: 0x4E6B7A,         // parit kecil
            ground: 0x7E8F46,       // tanah cokelat bercampur rumput
            fence: 0xC9B26A,        // bambu
            lampPole: 0x6B4A2E,     // tiang kayu
            lampLight: 0xFFC56B,    // bohlam kuning
            hemiTint: 0xFFF1DC      // nada hangat
        },
        streetLamp: 'kayu',
        fence: 'bambu',
        trees: ['pisang', 'kelapa', 'bambu'],
        vehicles: { motor: 5, onthel: 3, becak: 2, gerobak: 1, pickup: 1 },   // tanpa bus; pickup = pikap sayur
        walkerRoles: ['petani', 'ibu_bakul', 'anak_layangan', 'jamu_gendong', 'nelayan'],
        idleScenes: ['ronda', 'jemuran', 'ngobrol_warung'],
        // ramai pagi (berangkat ke sawah) dan sore
        density: h => (h >= 5 && h < 9) || (h >= 15 && h < 18) ? 1 : (h >= 9 && h < 15) ? 0.5 : 0.25,
        sound: { day: ['ayam', 'burung', 'angin_sawah'], night: ['jangkrik', 'katak', 'kentongan'], azan: true }
    }
};

/** Kendaraan besar: tidak boleh masuk gang Have-Not. */
export const LARGE_VEHICLES = new Set(['bus', 'pickup', 'taxi', 'car', 'layanan', 'foodtruck']);
/** Bus kota hanya beroperasi di Desa Have (tidak menyeberang jembatan). */
export const HAVE_ONLY_VEHICLES = new Set(['bus']);

const RIVER_MAX_X = GRID_CONFIG.RIVER_MAX_X ?? 16;

/** Sisi desa dari posisi dunia X. */
export const villageIdAtX = x => (x > RIVER_MAX_X ? 'have_not' : 'have');

/** Sisi desa dari kolom petak global. */
export const villageIdAtTile = gi => (isHaveNotTile(gi) ? 'have_not' : 'have');

/** Sisi desa sebuah bangunan/kavling: pakai posisi dunia bila ada, lalu kolom petak. */
export function villageIdOf(obj) {
    if (!obj) return 'have';
    const x = obj.worldX ?? obj.snapX;
    if (Number.isFinite(x)) return villageIdAtX(x);
    const gi = obj.grid_i ?? obj.tileI ?? obj.gridI;
    return Number.isFinite(gi) ? villageIdAtTile(gi) : 'have';
}

export const identityOf = id => VILLAGE_IDENTITY[id] || VILLAGE_IDENTITY.have;

/** Biaya klaim kavling di petak/kavling ini. */
export const claimFeeFor = plot => identityOf(villageIdOf(plot)).economy.claimFee;

/**
 * Hitung upah kerja menurut aturan desa (sebelum batas harian).
 * @param {object} p
 * @param {string} p.playerVillage   desa warga ('have' | 'have_not')
 * @param {string} p.playerId        id warga
 * @param {string} p.playerName      nama warga (data lama hanya punya owner_name)
 * @param {object} p.building        bangunan tempat kerja
 * @param {(base:number) => {bonus:number, matched:boolean, profession:object|null}} p.professionBonus
 * @returns {{ village:string, base:number, bonus:number, matched:boolean, profession:object|null,
 *             gotongRoyong:number, gross:number, tax:number, net:number }}
 */
export function computeWage({ playerVillage, playerId, playerName, building, professionBonus }) {
    const village = villageIdOf(building);
    const eco = identityOf(village).economy;
    const base = eco.baseWage;
    const prof = professionBonus ? professionBonus(base) : { bonus: 0, matched: false, profession: null };
    const gotongRoyong = isGotongRoyong({ playerVillage, playerId, playerName, building }) ? eco.gotongRoyongBonus : 0;
    const gross = base + prof.bonus + gotongRoyong;
    const tax = Math.round(gross * eco.cityTaxRate);
    return { village, base, bonus: prof.bonus, matched: prof.matched, profession: prof.profession, gotongRoyong, gross, tax, net: gross - tax };
}

const SERVER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Gotong royong: warga Have-Not bekerja di bangunan milik warga LAIN di Desa Have-Not.
 * Bangunan dari server (id uuid) wajib punya owner_id, sama dengan work_at_building di
 * supabase/schema.sql (get_buildings selalu mengirim owner_id bila ada pemilik). Pemilik yang
 * hanya dikenal lewat owner_name diterima untuk data lokal/offline saja (id 'bld-…', 'starter-…').
 */
export function isGotongRoyong({ playerVillage, playerId, playerName, building }) {
    if (!building || playerVillage !== 'have_not') return false;
    if (villageIdOf(building) !== 'have_not') return false;
    if (building.is_public) return false;
    if (SERVER_ID_RE.test(String(building.id || '')) && !building.owner_id) return false;
    const hasOwner = building.owner_id || building.owner_name;
    if (!hasOwner) return false;
    const mine = (building.owner_id && building.owner_id === playerId) ||
        (!building.owner_id && building.owner_name === playerName);
    return !mine;
}

/**
 * Status panen sebuah bangunan.
 * @returns {{ eligible:boolean, ready:boolean, amount:number, remainingMs:number }}
 */
export function harvestStatus(building, lastHarvestIso, now = Date.now()) {
    const h = identityOf(villageIdOf(building)).economy.harvest;
    if (!h || !building || !h.types.includes(building.type) || (building.stage && building.stage !== 'selesai')) return { eligible: false, ready: false, amount: 0, remainingMs: 0 };
    // Sawah: hasil & jeda mengikuti tanaman yang dipilih (crops.js); kebun_sayur pakai default desa.
    const useCrop = building.type === 'sawah';
    const amount = useCrop ? cropAmount(cropOf(building)) : h.amount;
    const intervalMs = useCrop ? cropIntervalMs(cropOf(building)) : h.intervalMs;
    const last = lastHarvestIso ? new Date(lastHarvestIso).getTime() : 0;
    const remainingMs = Math.max(0, last + intervalMs - now);
    return { eligible: true, ready: remainingMs === 0, amount, remainingMs, crop: useCrop ? cropOf(building) : null };
}
