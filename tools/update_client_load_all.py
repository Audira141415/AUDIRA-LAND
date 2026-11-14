import os

CLIENT_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "src", "api", "client.js")

with open(CLIENT_PATH, "r", encoding="utf-8") as f:
    code = f.read()

# Replace getCitySnapshot and getDistrictBuildings fallback to fetch the full 549 live buildings
old_snapshot_func = """export async function getCitySnapshot() {
    const supabase = await getSupabase();
    if (!supabase) {
        return { data: OFFLINE_SNAPSHOT, error: null };
    }

    try {
        const { data, error } = await supabase.rpc('get_city_snapshot');
        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.warn('[API] RPC get_city_snapshot fallback ke offline:', err.message);
        return { data: OFFLINE_SNAPSHOT, error: err };
    }
}"""

new_snapshot_func = """export async function getCitySnapshot() {
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
}"""

old_bld_func = """export async function getDistrictBuildings(districtKey) {
    const supabase = await getSupabase();
    if (!supabase) {
        if (districtKey === 'k12') {
            return { data: OFFLINE_BUILDINGS_K12, error: null };
        }
        return { data: [], error: null };
    }

    try {
        const { data, error } = await supabase.rpc('get_buildings', { p_district: districtKey });
        if (error) throw error;
        return { data, error: null };
    } catch (err) {
        console.warn(`[API] RPC get_buildings(${districtKey}) error:`, err.message);
        return { data: districtKey === 'k12' ? OFFLINE_BUILDINGS_K12 : [], error: err };
    }
}"""

new_bld_func = """export async function getDistrictBuildings(districtKey) {
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
        return { data, error: null };
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
}"""

if old_snapshot_func in code:
    code = code.replace(old_snapshot_func, new_snapshot_func)
    print("Replaced getCitySnapshot successfully!")
else:
    print("Warning: old_snapshot_func not found!")

if old_bld_func in code:
    code = code.replace(old_bld_func, new_bld_func)
    print("Replaced getDistrictBuildings successfully!")
else:
    print("Warning: old_bld_func not found!")

with open(CLIENT_PATH, "w", encoding="utf-8") as f:
    f.write(code)

print("Saved updated client.js!")

