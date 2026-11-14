/**
 * AUDIRA-LAND: Supabase Realtime push (dimuat lazy dari main.js agar tidak membebani bundel awal).
 * Handler dipakai sebagai PEMICU murah, bukan sumber kebenaran — data otoritatif tetap
 * dari get_city_snapshot (debounce). chat INSERT boleh dipakai langsung (payload lengkap).
 *
 * Catatan deploy: tabel wajib masuk publication `supabase_realtime` (lihat schema.sql).
 *
 * @returns {Promise<{channel:any, unsubscribe:()=>void}|null>} null bila Supabase mati / subscribe gagal.
 */
import { getSupabase } from './client.js';

export async function subscribeRealtime({ onChat, onBuilding, onNews, onCity } = {}) {
    const supabase = await getSupabase();
    if (!supabase) return null;
    try {
        const ch = supabase.channel('audira-land-realtime');
        const pc = 'postgres_changes';
        if (onChat) ch.on(pc, { event: 'INSERT', schema: 'public', table: 'chat' }, p => onChat(p.new));
        if (onBuilding) ch.on(pc, { event: '*', schema: 'public', table: 'buildings' }, p => onBuilding(p.new, p.eventType));
        if (onNews) ch.on(pc, { event: 'INSERT', schema: 'public', table: 'news' }, p => onNews(p.new));
        if (onCity) {
            ch.on(pc, { event: '*', schema: 'public', table: 'proposals' }, () => onCity());
            ch.on(pc, { event: '*', schema: 'public', table: 'proposal_votes' }, () => onCity());
            ch.on(pc, { event: 'UPDATE', schema: 'public', table: 'settings' }, () => onCity());
        }
        return await new Promise(resolve => {
            let settled = false;
            const done = v => { if (!settled) { settled = true; resolve(v); } };
            ch.subscribe(status => {
                if (status === 'SUBSCRIBED') done({ channel: ch, unsubscribe: () => supabase.removeChannel(ch) });
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    try { supabase.removeChannel(ch); } catch (e) {}
                    done(null);
                }
            });
            // Jaring pengaman: bila status tak kunjung datang, anggap gagal (tetap polling).
            setTimeout(() => done(null), 10000);
        });
    } catch (err) {
        console.warn('[API] subscribeRealtime gagal, lanjut polling:', err && err.message);
        return null;
    }
}
