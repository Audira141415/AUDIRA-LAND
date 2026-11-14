/**
 * AUDIRA-LAND: Konfigurasi API Supabase & Environment
 * Menggunakan pola zero-server-cost melalui client Supabase JS.
 */

export const SUPABASE_CONFIG = {
    // Ganti dengan Project URL dari Supabase Project Settings -> API
    url: window.SUPABASE_URL || 'https://jfmhtumsoihbnqphrmxa.supabase.co',
    
    // Ganti dengan Anon / Public Key dari Supabase Project Settings -> API
    // Publishable key (pengganti anon key): aman di klien. JANGAN taruh secret/service_role key di sini.
    anonKey: window.SUPABASE_ANON_KEY || 'sb_publishable_6oopQzAC6u36Sut6IE9pgA_nzPsFm3Q',
    
    // Cache TTL di sisi klien
    cacheTTL: {
        snapshot: 5000,    // 5 detik
        district: 15000,   // 15 detik
        npcs: 60000        // 60 detik
    }
};

/**
 * Mengecek apakah konfigurasi Supabase sudah terisi dengan kredensial aktif
 */
export function isSupabaseConfigured() {
    return (
        SUPABASE_CONFIG.url &&
        !SUPABASE_CONFIG.url.includes('YOUR_PROJECT_ID') &&
        SUPABASE_CONFIG.anonKey &&
        !SUPABASE_CONFIG.anonKey.includes('YOUR_ANON_KEY')
    );
}

