/**
 * Penyeberangan gang di atas sungai utama (dipakai grid.js -> buildBridgeSet di luxury_bridge.js).
 *
 * grid.js hanya membangun jembatan untuk baris arteri/kolektor yang menembus seluruh koridor
 * sungai. Gang (kelas 1) yang berhenti di tepi barat dan timur tidak punya jembatan, sehingga
 * jalannya buntu di tanggul. Modul ini memindai road_network (hanya baca) dan memasang satu
 * jembatan untuk setiap gang yang ujungnya bertemu sungai:
 *  - gang di kedua tepi pada baris yang sama;
 *  - gang tepi barat & timur selisih 1 baris (satu jembatan lebar menaungi keduanya).
 *
 * Semua penyeberangan (jalan grid + gang ini) dibangun bergaya Jembatan Gotong Royong.
 */
import { GRID_CONFIG, wx } from '../core/constants.js';
import { roadAtH, roadNetworkInfo } from '../core/road_network.js';

/** Daftar penyeberangan gang: [{ zW, zE }] (z tengah baris di tepi barat & timur). */
export function alleyCrossings() {
    const { minJ, maxJ } = roadNetworkInfo();
    const rMin = GRID_CONFIG.RIVER_TILE_MIN_I, rMax = GRID_CONFIG.RIVER_TILE_MAX_I;
    const mid = (rMin + rMax) >> 1;
    const W = new Set(), E = new Set();
    for (let j = minJ; j <= maxJ; j++) {
        if (roadAtH(mid, j) > 0) continue;              // sudah ada jembatan grid
        if (roadAtH(rMin - 1, j) > 0) W.add(j);
        if (roadAtH(rMax + 1, j) > 0) E.add(j);
    }
    const out = [];
    for (const j of [...W]) {
        if (E.has(j)) { out.push({ zW: wx(j), zE: wx(j) }); W.delete(j); E.delete(j); }
    }
    for (const j of [...W].sort((a, b) => a - b)) {
        const k = E.has(j - 1) ? j - 1 : (E.has(j + 1) ? j + 1 : null);
        if (k === null) continue;
        out.push({ zW: wx(j), zE: wx(k) });
        W.delete(j); E.delete(k);
    }
    return out;
}
