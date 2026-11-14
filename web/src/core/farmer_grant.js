/**
 * AUDIRA-LAND: Sawah gratis petani baru (dimuat lazy saat registrasi, bukan di bundel awal).
 * Cari petak Have-Not kosong terdekat rumah, beri 1 sawah 'selesai' (default padi),
 * catat ke server (claim_starter_sawah; 1x seumur akun) bila online.
 */
import { GRID_CONFIG } from './constants.js';
import { isHaveNotTile } from './village_rules.js';
import { playerState } from './player_state.js';
import { DEFAULT_CROP } from './crops.js';
import { claimStarterSawah, syncRpc } from '../api/client.js';

export async function grantFarmerSawah(game, citizen, home) {
    try {
        const plots = (game.grid?.plots || []).filter(p =>
            p.isLot !== false && !p.isOpenSpace && !p.isRiver &&
            isHaveNotTile(p.gridI) &&
            !game.buildingLoader.getBuildingAt(p.districtKey, p.gridI, p.gridJ));
        if (!plots.length) return;
        plots.sort((a, b) =>
            Math.hypot(a.gridI - home.grid_i, a.gridJ - home.grid_j) -
            Math.hypot(b.gridI - home.grid_i, b.gridJ - home.grid_j));
        const lot = plots[0];
        const T = GRID_CONFIG.TILE_SIZE, HALF = GRID_CONFIG.HALF_TILES;
        const worldX = (lot.gridI - HALF) * T + T / 2;
        const worldZ = (lot.gridJ - HALF) * T + T / 2;

        // Server dulu (bila online): sawah gratis sekali seumur akun -> pakai id server bila ada
        let id = 'sawah-ig-' + (citizen.igUsername || citizen.id);
        const rpc = await syncRpc(() => claimStarterSawah(lot.districtKey, lot.gridI, lot.gridJ, DEFAULT_CROP));
        if (rpc.status === 'ok' && rpc.data && rpc.data.building_id) id = rpc.data.building_id;
        else if (rpc.status === 'failed') console.warn('[Petani] sawah server ditolak:', rpc.message);

        const now = Date.now();
        const sawah = {
            id,
            district_key: lot.districtKey,
            grid_i: lot.gridI,
            grid_j: lot.gridJ,
            width: 1,
            height: 1,
            type: 'sawah',
            title: `Sawah ${citizen.username}`,
            crop: DEFAULT_CROP,
            stage: 'selesai',
            owner_id: citizen.id,
            owner_name: citizen.username,
            owner_color: citizen.avatarColor,
            is_public: false,
            zone: 'DESA',
            worldX,
            worldZ,
            build_hours_total: 0,
            build_started_at: new Date(now).toISOString(),
            build_finished_at: new Date(now).toISOString()
        };
        game.buildingLoader.addBuilding(sawah);
        game.saveUserBuildingLocally(sawah);
        playerState.addClaimedPlot(`${lot.districtKey}_${lot.gridI}_${lot.gridJ}`);
        game.hud.showToast('🌾 Sawah Gratis Petani', 'Kamu dapat 1 kotak sawah dekat rumah. Buka petaknya untuk memilih tanaman (padi, jagung, cabai, dll).', '🌾');
    } catch (e) {
        console.warn('[Petani] gagal memberi sawah:', e);
    }
}
