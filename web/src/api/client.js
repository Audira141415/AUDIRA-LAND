/**
 * AUDIRA-LAND: API Client Service
 * Menangani komunikasi RPC ke PostgreSQL Supabase dengan fallback mock data.
 */

import { SUPABASE_CONFIG, isSupabaseConfigured } from './config.js';

let supabaseClient = null;

/**
 * Inisialisasi Supabase JS Client jika kredensial sudah dikonfigurasi
 */
export async function getSupabase() {
    if (!isSupabaseConfigured()) {
        return null;
    }
    if (supabaseClient) {
        return supabaseClient;
    }

    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        return supabaseClient;
    } catch (err) {
        console.warn('[API] Gagal memuat @supabase/supabase-js CDN:', err);
        return null;
    }
}

/**
 * Login anonim warga (Supabase Auth → Anonymous sign-ins), satu login per warga.
 * Logika brankas sesi ada di auth_session.js (chunk lazy, hanya dimuat saat RPC tulis).
 */
// Warga aktif: uid = auth.uid() miliknya (null = warga baru/tamu), known = uid semua warga di browser ini
const authCitizen = { uid: null, known: [] };
let sessionPromise = null;

/** Dipanggil player_state tiap warga aktif berganti/tersimpan. */
export function setAuthCitizen(uid, knownUids) {
    authCitizen.known = knownUids;
    if (uid !== authCitizen.uid) {
        authCitizen.uid = uid;
        sessionPromise = null;   // sesi dicocokkan ulang di RPC berikutnya
    }
}

/** Sesi Supabase milik warga aktif (lihat matchSession). Gagal → null, server lalu menolak sopan. */
export async function ensureSession() {
    const supabase = await getSupabase();
    if (!supabase) return null;
    if (!sessionPromise) {
        // Gagal (null) → sessionPromise dikosongkan agar dicoba lagi di aksi berikutnya
        sessionPromise = import('./auth_session.js').then(m => m.matchSession(supabase, authCitizen))
            .then(s => s || (sessionPromise = null));
    }
    return sessionPromise;
}

/** Client Supabase yang sudah login (untuk RPC yang wajib auth). */
async function getAuthedSupabase() {
    const supabase = await getSupabase();
    if (supabase) await ensureSession();
    return supabase;
}

/** Id bangunan dari server berupa UUID; bangunan lokal ('bld-…', 'starter-…', 'rumah-ig-…') tidak dikirim ke RPC. */
export const isServerId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

/**
 * Jalankan RPC aksi pemain dan baca hasilnya.
 * Supabase tidak melempar error: kegagalan datang sebagai `{ error }` atau `{ data: { success: false, error } }`.
 * @param {() => Promise<{data:any, error:any, offline?:boolean}>} call
 * @returns {Promise<{status:'ok'|'offline'|'failed', data:any, message:string}>}
 *   ok      : server menerima; pakai angka server (saldo, upah) sebagai kebenaran.
 *   offline : Supabase belum dikonfigurasi atau jaringan putus; lanjut mode lokal.
 *   failed  : server menolak; batalkan aksi, saldo lokal tidak boleh berubah.
 */
export async function syncRpc(call) {
    let res;
    try {
        res = await call();
    } catch (err) {
        console.warn('[API] RPC gagal terhubung, lanjut mode lokal:', err && err.message);
        return { status: 'offline', data: null, message: '' };
    }
    if (!res || res.offline) return { status: 'offline', data: null, message: '' };
    if (res.error) {
        // Error jaringan (fetch gagal) = offline; error dari PostgREST/PostgreSQL = ditolak
        const msg = String(res.error.message || res.error);
        if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return { status: 'offline', data: null, message: '' };
        return { status: 'failed', data: null, message: msg };
    }
    const data = res.data;
    if (data && data.success === false) return { status: 'failed', data, message: data.error || 'Ditolak server.' };
    return { status: 'ok', data, message: '' };
}

const offlineResult = () => ({ data: null, error: new Error('Supabase belum terkonfigurasi'), offline: true });

/**
 * Data Mock Offline untuk pengembangan lokal sebelum Supabase online
 */
// Cadangan terakhir bila Supabase DAN data/*.json gagal dimuat: kota kosong tanpa warga
// (data starter lengkap ada di data/city_snapshot.json & data/live_buildings.json).
const OFFLINE_SNAPSHOT = {
    settings: { city_name: 'AUDIRA-LAND', city_treasury: 50000 },
    stats: { population: 0 },
    districts: [], news: [], chat: [], active_proposals: []
};

const OFFLINE_BUILDINGS_K12 = [];

/**
 * 1. Mengambil Snapshot Kota (Publik, Cacheable)
 */
export async function getCitySnapshot() {
    const supabase = await getSupabase();
    if (!supabase) {
        try {
            const resp = await fetch('./data/city_snapshot.json');
            if (resp.ok) {
                const snap = await resp.json();
                return { data: snap, error: null };
            }
        } catch (e) {
            console.warn('[API] Fallback ke snapshot default:', e);
        }
        return { data: OFFLINE_SNAPSHOT, error: null };
    }

    try {
        const { data, error } = await supabase.rpc('get_city_snapshot');
        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.warn('[API] RPC get_city_snapshot fallback ke data lokal:', err.message);
        try {
            const resp = await fetch('./data/city_snapshot.json');
            if (resp.ok) {
                const snap = await resp.json();
                return { data: snap, error: null };
            }
        } catch (e) {}
        return { data: OFFLINE_SNAPSHOT, error: err };
    }
}

/**
 * 2. Mengambil Bangunan per Distrik (Publik, Cacheable)
 */
export async function getDistrictBuildings(districtKey) {
    const supabase = await getSupabase();
    if (!supabase) {
        try {
            const resp = await fetch('./data/live_buildings.json');
            if (resp.ok) {
                const all = await resp.json();
                console.log(`[API] Berhasil memuat ${all.length} bangunan hidup kota dari Republik Netizenia v2!`);
                return { data: all, error: null };
            }
        } catch (e) {
            console.warn('[API] Fallback ke starter buildings:', e);
        }
        return { data: districtKey === 'k12' ? OFFLINE_BUILDINGS_K12 : [], error: null };
    }

    try {
        const { data, error } = await supabase.rpc('get_buildings', { p_district: districtKey });
        if (error) throw error;
        // Bangunan kota (negara + proyek vital, ±130) hanya ada di data/live_buildings.json; server
        // menyimpan lapisan warga. Gabungkan: dunia statis + bangunan server yang punya pemilik.
        let base = [];
        try {
            const resp = await fetch('./data/live_buildings.json');
            if (resp.ok) base = await resp.json();
        } catch (e) {}
        if (!base.length && districtKey === 'k12') base = OFFLINE_BUILDINGS_K12;
        return { data: [...base, ...(data || []).filter(b => b.owner_id)], error: null };
    } catch (err) {
        console.warn(`[API] RPC get_buildings(${districtKey}) error, memuat data live lokal:`, err.message);
        try {
            const resp = await fetch('./data/live_buildings.json');
            if (resp.ok) {
                const all = await resp.json();
                return { data: all, error: null };
            }
        } catch (e) {}
        return { data: districtKey === 'k12' ? OFFLINE_BUILDINGS_K12 : [], error: err };
    }
}

/**
 * 3. Mendaftarkan Profil Warga Baru (Wajib Auth)
 */
export async function registerPlayer(username, profession, avatarColor, village = null, avatarData = null) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    const args = { p_username: username, p_profession: profession, p_avatar_color: avatarColor, p_village: village, p_avatar_data: avatarData || null };
    let res = await supabase.rpc('register_player', args);
    const d = res && res.data;
    if (d && (d.success || d.code === 'uid_taken')) {
        // Login ini kini (atau ternyata sudah) milik seorang warga: simpan tokennya di brankas
        await (await import('./auth_session.js')).bindCurrentSession(supabase);
        // Terikat ke warga lain (sesi lama yang tidak tercatat): login anonim baru, coba sekali lagi
        if (!d.success) {
            sessionPromise = null;
            if (await ensureSession()) res = await supabase.rpc('register_player', args);
        }
    }
    return res;
}

/**
 * 3b. Rumah awal warga di kavling (i, j). Server memilih rumah & kendaraan dari home_kits
 * (desa × profesi) dan memakai jam server untuk waktu bangun 5 menit. Idempoten.
 */
export async function registerHome(i, j) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('register_home', { p_i: i, p_j: j });
}

/**
 * 4. Klaim Kavling dan Mulai Membangun (Wajib Auth)
 */
export async function claimPlotAndBuild(district, i, j, type) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('claim_plot_and_build', {
        p_district: district,
        p_i: i,
        p_j: j,
        p_type: type
    });
}

/**
 * 5. Bekerja di Bangunan (Wajib Auth)
 */
export async function workAtBuilding(buildingId) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('work_at_building', { p_building_id: buildingId });
}

/**
 * 5b. Panen sawah / kebun_sayur milik sendiri (Desa Have-Not, 15 ₳ tiap 24 jam; jam server now())
 */
export async function harvestBuilding(buildingId) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('harvest_building', { p_building_id: buildingId });
}

/**
 * 5c. Pilih tanaman untuk sawah milik sendiri (tanam ulang -> jeda panen mulai dari awal).
 */
export async function setCrop(buildingId, crop) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('set_crop', { p_building_id: buildingId, p_crop: crop });
}

/**
 * 5d. Sawah gratis untuk petani baru (sekali seumur akun, dekat rumah; server menolak jika sudah punya).
 */
export async function claimStarterSawah(district, i, j, crop) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('claim_starter_sawah', { p_district: district, p_i: i, p_j: j, p_crop: crop });
}

/**
 * 6. Mengajukan Usulan Fasilitas Publik (Wajib Auth)
 */
export async function submitProposal(title, buildingType, district, i, j) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('submit_proposal', {
        p_title: title,
        p_building_type: buildingType,
        p_district: district,
        p_i: i,
        p_j: j
    });
}

/**
 * 7. Memberi Suara pada Usulan (Wajib Auth)
 */
export async function voteProposal(proposalId, vote) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('vote_proposal', {
        p_proposal_id: proposalId,
        p_vote: vote
    });
}

// subscribeRealtime dipindah ke ./realtime.js (dimuat lazy dari main.js) agar tidak di bundel awal.

/**
 * 8. Mengirim Pesan Chat Kota (Wajib Auth)
 */
export async function sendChat(message) {
    const supabase = await getAuthedSupabase();
    if (!supabase) {
        return offlineResult();
    }
    return await supabase.rpc('send_chat', { p_message: message });
}

