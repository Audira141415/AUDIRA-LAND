/**
 * AUDIRA-LAND: Penata Kota (City Layout Planner)
 *
 * Data bangunan hasil scraping tidak selaras dengan peta jalan AUDIRA-LAND
 * (peta jalan 2D organik di road_network.js: gang, kolektor, arteri, taman, sungai di tengah),
 * sehingga sebagian bangunan berdiri di atas jalan, taman, atau sungai.
 *
 * Planner ini:
 *  1. Mempertahankan bangunan yang seluruh tapaknya sudah di kavling sah.
 *  2. Memindahkan sisanya ke kavling kosong terdekat di SISI SUNGAI YANG SAMA
 *     (Desa Have tetap di barat, Have-Not tetap di timur). Deterministik: hasil sama
 *     setiap muat, jadi posisi yang dilihat warga tidak berubah-ubah.
 *  3. Menghadapkan setiap bangunan ke jalan terbesar di sisinya (arteri > kolektor > gang),
 *     sehingga fasad berjajar rapi menghadap jalan.
 */

import { GRID_CONFIG } from './constants.js';
import { isAllowedInHaveNot, HAVE_NOT_MAX_FLOORS } from './village_rules.js';
import { roadAt, isLotTile } from './road_network.js';

const T = GRID_CONFIG.TILE_SIZE;
const HALF = GRID_CONFIG.HALF_TILES;
const MIN_I = GRID_CONFIG.ACTIVE_MIN_I, MAX_I = GRID_CONFIG.ACTIVE_MAX_I;
const MIN_J = GRID_CONFIG.ACTIVE_MIN_J, MAX_J = GRID_CONFIG.ACTIVE_MAX_J;
const RIVER_MIN = GRID_CONFIG.RIVER_TILE_MIN_I, RIVER_MAX = GRID_CONFIG.RIVER_TILE_MAX_I;

// Kelas jalan untuk arah hadap: sungai (termasuk geladak jembatan) tidak dihitung sebagai jalan
const roadFace = (i, j) => (isRiver(i) ? 0 : roadAt(i, j));
const isRiver = i => i >= RIVER_MIN && i <= RIVER_MAX;
const side = i => (i < RIVER_MIN ? -1 : 1);

// Tulisan huruf raksasa nama desa (grid.js createGiantLetters): 38 m sejajar sungai,
// pusat Z = -20 m (petak j 103-107), kolom i 105 (Have) dan 110 (Have-Not). Bebas jalan.
export const MONUMENT_Z = -20;
const MONUMENT_TILES = [];
for (const i of [105, 110]) for (let j = 103; j <= 107; j++) MONUMENT_TILES.push([i, j]);
const MONUMENT_SET = new Set(MONUMENT_TILES.map(([i, j]) => i + ',' + j));
export const isMonumentTile = (i, j) => MONUMENT_SET.has(i + ',' + j);

export class CityLayout {
    constructor() {
        this.occ = new Map(); // "i,j" -> building id
        for (const [i, j] of MONUMENT_TILES) this.occ.set(i + ',' + j, '__monumen__');
    }

    static footprint(d) {
        const w = d.width || 1, h = d.height || 1;
        let gi = d.grid_i, gj = d.grid_j;
        if ((gi === undefined || gj === undefined) && d.worldX !== undefined && d.worldZ !== undefined) {
            gi = Math.round((d.worldX - (w * T) / 2) / T + HALF);
            gj = Math.round((d.worldZ - (h * T) / 2) / T + HALF);
        }
        if (gi === undefined) gi = 108;
        if (gj === undefined) gj = 108;
        return { gi, gj, w, h };
    }

    tileFree(i, j, id) {
        if (i < MIN_I || i > MAX_I || j < MIN_J || j > MAX_J) return false;
        if (!isLotTile(i, j)) return false;   // jalan, taman/ruang terbuka, atau sungai
        const o = this.occ.get(i + ',' + j);
        return !o || o === id;
    }

    fits(gi, gj, w, h, id) {
        for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) {
            if (!this.tileFree(gi + a, gj + b, id)) return false;
        }
        return true;
    }

    occupy(id, gi, gj, w, h) {
        for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) this.occ.set((gi + a) + ',' + (gj + b), id);
    }

    release(id) {
        for (const [k, v] of this.occ) if (v === id) this.occ.delete(k);
    }

    /** Cari tapak kosong terdekat (cincin Chebyshev melebar) di sisi sungai yang sama. */
    findNearest(gi, gj, w, h, id, preferSide) {
        for (let r = 1; r <= 60; r++) {
            let best = null, bestD = Infinity;
            for (let di = -r; di <= r; di++) {
                for (let dj = -r; dj <= r; dj++) {
                    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
                    const ci = gi + di, cj = gj + dj;
                    if (side(ci) !== preferSide || side(ci + w - 1) !== preferSide) continue;
                    if (!this.fits(ci, cj, w, h, id)) continue;
                    const d = di * di + dj * dj;
                    if (d < bestD) { bestD = d; best = [ci, cj]; }
                }
            }
            if (best) return best;
        }
        return null;
    }

    /** Hadap ke jalan dengan kelas tertinggi yang bersebelahan dengan tapak. */
    static facingFor(gi, gj, w, h, current) {
        let south = 0, north = 0, east = 0, west = 0;
        for (let a = 0; a < w; a++) {
            south = Math.max(south, roadFace(gi + a, gj + h));
            north = Math.max(north, roadFace(gi + a, gj - 1));
        }
        for (let b = 0; b < h; b++) {
            east = Math.max(east, roadFace(gi + w, gj + b));
            west = Math.max(west, roadFace(gi - 1, gj + b));
        }
        // Urutan saat seri: Selatan, Utara, Timur, Barat
        const opts = [[south, 0], [north, 2], [east, 1], [west, 3]];
        const allowed = w === h ? opts : opts.filter(o => o[1] === 0 || o[1] === 2);
        let best = null;
        for (const o of allowed) if (o[0] > 0 && (!best || o[0] > best[0])) best = o;
        return best ? best[1] : (current ?? 0);
    }

    static apply(d, gi, gj, w, h) {
        d.grid_i = gi;
        d.grid_j = gj;
        d.worldX = (gi - HALF) * T + (w * T) / 2;
        d.worldZ = (gj - HALF) * T + (h * T) / 2;
        d.facing = CityLayout.facingFor(gi, gj, w, h, d.facing);
    }

    /**
     * Menata daftar bangunan. Mengubah salinan data; urutan input = prioritas
     * (bangunan warga sebaiknya di depan agar kavlingnya tidak diambil).
     */
    place(list) {
        const out = [];
        const pending = [];
        let moved = 0, dropped = 0;

        for (const src of list) {
            const d = { ...src };
            const { gi, gj, w, h } = CityLayout.footprint(d);
            if (this.fits(gi, gj, w, h, d.id)) {
                this.occupy(d.id, gi, gj, w, h);
                CityLayout.apply(d, gi, gj, w, h);
                out.push(d);
            } else {
                pending.push({ d, gi, gj, w, h });
            }
        }
        // Yang besar dulu agar tetap mendapat tempat
        pending.sort((a, b) => (b.w * b.h) - (a.w * a.h));
        for (const p of pending) {
            const pref = isRiver(p.gi) ? (p.gi + p.w / 2 < (RIVER_MIN + RIVER_MAX + 1) / 2 ? -1 : 1) : side(p.gi);
            // Sisi sendiri penuh -> seberang sungai (Have penuh, Have-Not masih lowong)
            // Kecuali bangunan mewah/tinggi: tidak boleh menyeberang ke Desa Have-Not (village_rules.js)
            const mayCross = pref === 1 || isAllowedInHaveNot(p.d.type);
            const spot = this.findNearest(p.gi, p.gj, p.w, p.h, p.d.id, pref)
                || (mayCross ? this.findNearest(p.gi, p.gj, p.w, p.h, p.d.id, -pref) : null);
            if (spot && side(spot[0]) === 1) p.d.floors = Math.min(p.d.floors || 1, HAVE_NOT_MAX_FLOORS);
            if (!spot) { dropped++; continue; }
            this.occupy(p.d.id, spot[0], spot[1], p.w, p.h);
            CityLayout.apply(p.d, spot[0], spot[1], p.w, p.h);
            out.push(p.d);
            moved++;
        }
        if (moved || dropped) console.log(`[Tata Kota] ${moved} bangunan dipindah ke kavling sah, ${dropped} tidak muat.`);
        return out;
    }
}
