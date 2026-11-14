/**
 * AUDIRA-LAND: Katalog tanaman sawah (dipilih petani di kotak sawahnya).
 * Hasil panen sebanding dengan jeda tumbuh -> tiap pilihan punya trade-off:
 *   cepat = hasil kecil (cocok pemain aktif), lama = hasil besar (cocok sabar).
 * id harus sama dengan CASE di supabase/schema.sql (harvest_building, set_crop).
 */

// Warna visual 3D (plant/fruit) ada di building_loader.js (chunk lazy), bukan di sini (bundel awal).
export const CROPS = [
    { id: 'padi',     icon: '🌾', name: 'Padi',     amount: 15, hours: 24 },
    { id: 'jagung',   icon: '🌽', name: 'Jagung',   amount: 9,  hours: 12 },
    { id: 'tomat',    icon: '🍅', name: 'Tomat',    amount: 20, hours: 30 },
    { id: 'semangka', icon: '🍉', name: 'Semangka', amount: 26, hours: 40 },
    { id: 'cabai',    icon: '🌶️', name: 'Cabai',    amount: 34, hours: 52 }
];

export const DEFAULT_CROP = 'padi';

const BY_ID = new Map(CROPS.map(c => [c.id, c]));

export const isCrop = id => BY_ID.has(id);
export const getCrop = id => BY_ID.get(id) || BY_ID.get(DEFAULT_CROP);
export const cropAmount = id => getCrop(id).amount;
export const cropIntervalMs = id => getCrop(id).hours * 3600000;
/** id tanaman dari data bangunan (default padi untuk sawah lama tanpa crop). */
export const cropOf = building => (building && isCrop(building.crop)) ? building.crop : DEFAULT_CROP;
