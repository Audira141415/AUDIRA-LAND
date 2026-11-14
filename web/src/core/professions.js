/**
 * AUDIRA-LAND: Data resmi Desa & Profesi warga (dipakai wizard pendaftaran, HUD, KTP).
 * Daftar id profesi + desanya harus sama dengan supabase/schema.sql (register_player, profession_matches, home_kits).
 */

export const HOUSE_BUILD_MS = 5 * 60 * 1000; // rumah awal warga selesai dalam 5 menit

export const VILLAGES = [
    {
        id: 'have',
        icon: '🏙️',
        title: 'Desa Have',
        tagline: 'Barat sungai • kota mapan',
        desc: 'Dekat Alun-Alun Merdeka, jalan beraspal, ramai toko dan kantor. Rumah gedong rapi.',
        houseType: 'rumah',
        houseLabel: 'Rumah Gedong',
        searchFrom: { i: 96, j: 96 }
    },
    {
        id: 'have_not',
        icon: '🌾',
        title: 'Desa Have-Not',
        tagline: 'Timur sungai • pedesaan asri',
        desc: 'Dekat sawah dan gunung, lahan masih luas. Rumah limasan dengan pekarangan kebun.',
        houseType: 'rumah_limas',
        houseLabel: 'Rumah Limasan',
        searchFrom: { i: 112, j: 96 }
    }
];

// Profesi berbeda per desa: Have (kota mapan) = profesi kantoran/layanan kota,
// Have-Not (pedesaan) = pekerjaan rakyat desa. village = desa tempat profesi ini bisa dipilih.
// workplaces: tipe bangunan tempat profesi ini dapat bonus upah (+50%)
export const PROFESSIONS = [
    // Desa Have
    { id: 'dokter', village: 'have', icon: '🩺', title: 'Dokter', desc: 'Merawat warga yang sakit di rumah sakit', workplaces: ['rs', 'posko'] },
    { id: 'perawat', village: 'have', icon: '💉', title: 'Perawat', desc: 'Membantu dokter merawat pasien', workplaces: ['rs', 'posko'] },
    { id: 'polisi', village: 'have', icon: '👮', title: 'Polisi', desc: 'Menjaga keamanan & ketertiban kota', workplaces: ['polisi', 'penjara', 'pos_ronda', 'barak'] },
    { id: 'pemadam', village: 'have', icon: '🚒', title: 'Pemadam Kebakaran', desc: 'Siaga memadamkan api & menolong warga', workplaces: ['posko', 'pln', 'pangkalan'] },
    { id: 'guru', village: 'have', icon: '📚', title: 'Guru', desc: 'Mengajar anak-anak di sekolah kota', workplaces: ['sekolah', 'lapangan'] },
    { id: 'pedagang', village: 'have', icon: '🏪', title: 'Pengusaha Toko', desc: 'Mengelola toko & ruko di pusat kota', workplaces: ['pasar', 'toko', 'ruko', 'warung_madura'] },
    { id: 'koki', village: 'have', icon: '🍳', title: 'Koki', desc: 'Memasak di kafe & rumah makan', workplaces: ['kafe', 'warung', 'warung_kopi', 'warung_madura'] },
    { id: 'programmer', village: 'have', icon: '💻', title: 'Programmer', desc: 'Membuat aplikasi untuk kota digital', workplaces: ['kantor', 'bank', 'pln'] },
    { id: 'seniman', village: 'have', icon: '🎨', title: 'Seniman', desc: 'Melukis mural & menampilkan seni budaya', workplaces: ['taman', 'tugu', 'stadion', 'saung_bambu'] },
    // Desa Have-Not
    { id: 'petani', village: 'have_not', icon: '🌾', title: 'Petani', desc: 'Menanam padi & sayur di sawah desa', workplaces: ['sawah', 'kebun_sayur', 'waduk', 'lahan_material'] },
    { id: 'nelayan', village: 'have_not', icon: '🎣', title: 'Nelayan', desc: 'Mencari ikan di sungai & waduk', workplaces: ['waduk', 'pasar'] },
    { id: 'kuli', village: 'have_not', icon: '🧱', title: 'Kuli Bangunan', desc: 'Mengangkut bata & semen di proyek', workplaces: ['proyek_rumah', 'proyek_gedung', 'lahan_material', 'pabrik'] },
    { id: 'peternak', village: 'have_not', icon: '🐄', title: 'Peternak', desc: 'Merawat sapi, kambing & ayam', workplaces: ['sawah', 'kebun_sayur', 'lapangan', 'pasar'] },
    { id: 'pedagang_keliling', village: 'have_not', icon: '🛒', title: 'Pedagang Keliling', desc: 'Berjualan jajanan & sayur keliling desa', workplaces: ['pkl', 'pasar', 'warung', 'warung_kopi'] },
    { id: 'ojek', village: 'have_not', icon: '🏍️', title: 'Tukang Ojek', desc: 'Mengantar warga dari pangkalan ke pasar', workplaces: ['pangkalan', 'pasar', 'terminal'] },
    { id: 'pengrajin', village: 'have_not', icon: '🧺', title: 'Pengrajin', desc: 'Menganyam bambu & membuat gerabah', workplaces: ['saung_bambu', 'pasar', 'toko', 'tugu'] },
    { id: 'buruh', village: 'have_not', icon: '🏭', title: 'Buruh Pabrik', desc: 'Bekerja shift di pabrik & gudang', workplaces: ['pabrik', 'lahan_material', 'pln', 'bengkel'] }
];

// Upah kerja: dasar 35 ₳; bekerja di tempat yang cocok dengan profesi dapat bonus +50%
export const BASE_WAGE = 35;
export const PROFESSION_BONUS_RATE = 0.5;

export const getVillage = id => VILLAGES.find(v => v.id === id) || null;
export const getProfession = id => PROFESSIONS.find(p => p.id === id) || null;
/** Profesi yang bisa dipilih warga desa ini. */
export const professionsForVillage = villageId => PROFESSIONS.filter(p => p.village === villageId);
/** True bila profesi ini milik desa tersebut. */
export const professionAllowedIn = (professionId, villageId) => getProfession(professionId)?.village === villageId;

/**
 * Upah profesi di tipe bangunan tertentu (belum dipotong batas harian).
 * @returns {{ base:number, bonus:number, total:number, matched:boolean, profession:object|null }}
 */
export function wageFor(professionId, buildingType) {
    const prof = getProfession(professionId);
    const matched = !!(prof && buildingType && prof.workplaces.includes(buildingType));
    const bonus = matched ? Math.round(BASE_WAGE * PROFESSION_BONUS_RATE) : 0;
    return { base: BASE_WAGE, bonus, total: BASE_WAGE + bonus, matched, profession: prof };
}

/**
 * Bonus profesi +50% dari upah dasar desa (base berbeda per desa, lihat village_identity.js).
 * @returns {{ bonus:number, matched:boolean, profession:object|null }}
 */
export function professionBonusFor(professionId, buildingType, base = BASE_WAGE) {
    const prof = getProfession(professionId);
    const matched = !!(prof && buildingType && prof.workplaces.includes(buildingType));
    return { bonus: matched ? Math.round(base * PROFESSION_BONUS_RATE) : 0, matched, profession: prof };
}

/** Profesi yang dapat bonus di tipe bangunan ini (info di kartu petak). */
export const professionsForWorkplace = type => PROFESSIONS.filter(p => p.workplaces.includes(type));

/** Username IG: huruf kecil, angka, titik, garis bawah; 1–30 karakter. */
export function cleanIgUsername(raw) {
    const clean = String(raw || '').trim().replace(/^@+/, '').toLowerCase();
    return /^[a-z0-9._]{1,30}$/.test(clean) ? clean : null;
}
