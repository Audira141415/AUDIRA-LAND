/**
 * AUDIRA-LAND: Brankas sesi per warga (chunk lazy, dimuat saat RPC tulis pertama).
 * Satu login anonim Supabase = satu warga = satu auth.uid(). supabase-js hanya menyimpan SATU sesi
 * per browser, jadi token tiap warga yang sudah terdaftar disimpan di sini (key = auth.uid()) agar
 * "Lanjut sebagai @username" bisa kembali ke login warga itu.
 * Batasan: brankas ada di localStorage browser ini saja (hapus data situs = login warga hilang).
 * Warga yang didaftarkan sebelum brankas ada (2026-11-13) dan sesinya sudah tertimpa warga lain
 * tidak bisa dipulihkan; aksi tulisnya ditolak server.
 */
const AUTH_VAULT_KEY = 'audira_land_auth_vault';

function vaultRead() {
    try { return JSON.parse(localStorage.getItem(AUTH_VAULT_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function vaultPut(session) {
    if (!session || !session.user || !session.refresh_token) return;
    try {
        const v = vaultRead();
        v[session.user.id] = { access_token: session.access_token, refresh_token: session.refresh_token };
        localStorage.setItem(AUTH_VAULT_KEY, JSON.stringify(v));
    } catch (e) {}
}

let listening = false;
function listen(supabase) {
    if (listening) return;
    listening = true;
    // Refresh token berotasi: simpan versi terbaru untuk warga yang ada di brankas
    supabase.auth.onAuthStateChange((_event, session) => {
        if (session && session.user && vaultRead()[session.user.id]) vaultPut(session);
    });
}

/** Simpan sesi saat ini sebagai milik warga yang baru terdaftar (atau login yang ternyata sudah terikat). */
export async function bindCurrentSession(supabase) {
    listen(supabase);
    const { data } = await supabase.auth.getSession();
    vaultPut(data && data.session);
}

/**
 * Cocokkan sesi Supabase dengan warga aktif `citizen = { uid, known }`:
 *  - sesi saat ini milik warga aktif → pakai.
 *  - warga aktif punya token di brankas → setSession (kembali ke login warga itu).
 *  - sesi saat ini belum terikat warga mana pun → pakai (warga baru mendaftar di sini).
 *  - sesi saat ini milik warga lain → simpan ke brankas, lalu login anonim baru.
 * Sengaja TIDAK memanggil signOut(): logout mencabut refresh token di server sehingga warga
 * sebelumnya tidak bisa dilanjutkan; signInAnonymously/setSession cukup mengganti sesi lokal.
 * Gagal (fitur mati / offline) → null.
 */
export async function matchSession(supabase, citizen) {
    listen(supabase);
    const { uid, known } = citizen;
    const { data } = await supabase.auth.getSession();
    const s = data && data.session;
    const sUid = s && s.user && s.user.id;
    if (s && uid && sUid === uid) { vaultPut(s); return s; }
    const bound = s && (known.includes(sUid) || !!vaultRead()[sUid]);
    if (bound) vaultPut(s);   // sesi warga lain: simpan token terbarunya sebelum diganti
    const saved = uid && vaultRead()[uid];
    if (saved) {
        const { data: set, error } = await supabase.auth.setSession(saved);
        if (!error && set && set.session) { vaultPut(set.session); return set.session; }
        console.warn('[API] Sesi warga tersimpan tidak bisa dipulihkan:', error && error.message);
    }
    if (s && !bound) return s;
    const { data: signed, error } = await supabase.auth.signInAnonymously();
    if (error) {
        console.warn('[API] Login anonim gagal:', error.message);
        return null;
    }
    return signed.session;
}
