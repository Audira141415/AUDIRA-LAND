/**
 * AUDIRA-LAND: Aturan Desa Have-Not (timur sungai).
 * Desa Have-Not adalah desa warga sederhana: tidak ada bangunan mewah atau tinggi.
 *  - Hanya tipe di HAVE_NOT_ALLOWED yang boleh berdiri di sana.
 *  - Semua bangunan di sana maksimal 1 lantai.
 *  - Bangunan lain (istana, apartemen, kantor, bank, ruko, kafe, RS besar, dll.) dipindah ke Desa Have.
 */

import { GRID_CONFIG } from './constants.js';

export const HAVE_NOT_MAX_FLOORS = 1;

export const HAVE_NOT_ALLOWED = new Set([
    // Hunian sederhana
    'rumah', 'rumah_limas', 'proyek_rumah', 'saung_bambu',
    // Usaha kecil
    'warung', 'warung_kopi', 'warung_madura', 'toko', 'bengkel', 'pkl', 'pasar', 'pangkalan',
    // Pertanian & alam
    'sawah', 'kebun_sayur', 'lahan_material', 'waduk', 'taman', 'taman_surya', 'lapangan',
    // Fasilitas desa kecil
    'posko', 'pos_ronda', 'polisi', 'ibadah', 'sekolah', 'pln', 'tugu'
]);

/** True bila tapak yang mulai di kolom `gi` ada di timur sungai (Desa Have-Not). */
export const isHaveNotTile = gi => gi > GRID_CONFIG.RIVER_TILE_MAX_I;

export const isAllowedInHaveNot = type => HAVE_NOT_ALLOWED.has(type);

/**
 * Terapkan aturan pada daftar data bangunan (dimutasi di tempat) sebelum ditata CityLayout.
 * @param {object[]} list
 * @param {(d: object) => {gi:number, gj:number, w:number, h:number}} footprint
 * @returns {{ moved: number, flattened: number }}
 */
export function applyHaveNotRules(list, footprint) {
    const mirror = GRID_CONFIG.RIVER_TILE_MIN_I + GRID_CONFIG.RIVER_TILE_MAX_I; // 215: cermin terhadap sungai
    let moved = 0, flattened = 0;
    for (const d of list) {
        const fp = footprint(d);
        if (!isHaveNotTile(fp.gi)) continue;
        if (!isAllowedInHaveNot(d.type)) {
            // Pindah ke posisi cermin di Desa Have; CityLayout mencari kavling sah terdekat di barat
            d.grid_i = mirror - fp.gi - fp.w + 1;
            d.grid_j = fp.gj;
            delete d.worldX;
            delete d.worldZ;
            d.zone = 'KOTA';
            d.is_have = true;
            moved++;
        } else {
            if ((d.floors || 1) > HAVE_NOT_MAX_FLOORS) flattened++;
            d.floors = HAVE_NOT_MAX_FLOORS;
            if (!d.zone || d.zone === 'KOTA') d.zone = 'DESA';
        }
    }
    return { moved, flattened };
}
