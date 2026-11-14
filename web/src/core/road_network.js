/**
 * AUDIRA-LAND: Peta Jalan 2D Organik (sumber tunggal tata jalan kota)
 *
 * Menggantikan rumus periodik 1D lama (roadI/roadJ, PD = 43) yang membuat kota seperti papan catur.
 * Peta dibangkitkan SEKALI (lazy, saat pertama dipakai) dari seed tetap -> hasil identik setiap muat,
 * disimpan sebagai Uint8Array untuk lookup O(1).
 *
 * Kelas jalan: 0 kavling, 1 gang, 2 kolektor, 3 arteri.
 *  - Arteri tetap lurus di tepi distrik (posisi sama dengan rumus lama) + menyeberang sungai.
 *  - Kolektor: jarak bervariasi per wilayah; kolektor horizontal dipilih per lajur (strip) sehingga
 *    bergeser (jog) di persimpangan dengan kolektor vertikal -> pertigaan, bukan grid lurus.
 *  - Gang: blok superblok dibelah rekursif (BSP) -> blok 2x3..3x6 (Have) / 3x4..5x8 (Have-Not),
 *    sebagian gang berhenti sebelum ujung (jalan buntu), cabang gang membentuk pertigaan.
 *  - Sebagian blok menjadi ruang terbuka (taman/lapangan/alun-alun kecil), tidak bisa diklaim.
 *  - Desa Have-Not (timur sungai) lebih jarang jalannya dan bloknya lebih besar (pedesaan).
 *  - Sungai (RIVER_TILE_MIN_I..MAX_I) hanya berisi "jalan" di baris jembatan (BRIDGE_ROWS).
 *  - Pasca-proses: semua petak jalan yang tidak tersambung ke arteri dijadikan kavling,
 *    jadi seluruh jaringan selalu satu komponen (jalan buntu tetap tersambung di satu ujung).
 *
 * Modul ini TIDAK membaca GRID_CONFIG di top-level (hanya di dalam build()), supaya aman bila
 * suatu saat diimpor melingkar dari constants.js.
 */

import { GRID_CONFIG } from './constants.js';

export const ROAD_LOT = 0;
export const ROAD_ALLEY = 1;
export const ROAD_COLLECTOR = 2;
export const ROAD_ARTERIAL = 3;

/** Lebar jalan (meter) per kelas. */
export const roadWidth = cls =>
    cls === 3 ? GRID_CONFIG.ROAD_ARTERIAL_WIDTH :
    cls === 2 ? GRID_CONFIG.ROAD_COLLECTOR_WIDTH :
    cls === 1 ? GRID_CONFIG.ROAD_ALLEY_WIDTH : 0;

// Seed tetap: JANGAN diubah tanpa alasan, posisi kavling & bangunan warga ikut bergeser.
const SEED = 0x20261113;

// Parameter wilayah. Gap = jumlah petak kavling di antara dua jalan sejajar.
const PARAMS = {
    have: {
        vGap: [5, 7],      // jarak kolektor vertikal
        hGap: [6, 9],      // jarak kolektor horizontal
        minDim: 2,         // sisi blok minimum
        maxShort: 3,       // blok "cukup kecil": sisi pendek <= 3 ...
        maxLong: 6,        // ... dan sisi panjang <= 6
        stop: 0.55,        // peluang berhenti membelah bila sudah cukup kecil
        dead: 0.45,        // peluang gang berhenti 1-2 petak sebelum ujung (jalan buntu)
        park: 0.05,        // peluang blok menjadi ruang terbuka
        parkMinArea: 6
    },
    haveNot: {
        vGap: [7, 10],
        hGap: [8, 12],
        minDim: 3,
        maxShort: 5,
        maxLong: 8,
        stop: 0.6,
        dead: 0.55,
        park: 0.14,
        parkMinArea: 9
    }
};

let NET = null;

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashSeed(...nums) {
    let h = 2166136261 >>> 0;
    for (const n of nums) {
        h ^= n >>> 0;
        h = Math.imul(h, 16777619) >>> 0;
        h ^= h >>> 13;
    }
    return h >>> 0;
}

const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

/**
 * Pilih posisi garis jalan di rentang [lo..hi] sehingga setiap celah kavling (termasuk tepi)
 * sebisa mungkin di antara gMin..gMax. Mengembalikan daftar indeks garis (urut).
 */
function placeLines(lo, hi, gMin, gMax, rng) {
    const L = hi - lo + 1;
    if (L <= gMax) return [];
    let k = Math.ceil((L - gMax) / (gMax + 1));
    while (k > 0 && (L - k) / (k + 1) < gMin) k--;
    if (k <= 0) return [];
    const n = k + 1;
    const total = L - k;
    const gaps = new Array(n).fill(Math.floor(total / n));
    let rem = total - gaps[0] * n;
    while (rem > 0) {
        const a = Math.floor(rng() * n);
        if (gaps[a] < gMax || rem > 0 && gaps.every(g => g >= gMax)) { gaps[a]++; rem--; }
    }
    // Acak: geser petak antar celah tanpa melanggar batas -> jarak tidak seragam
    for (let t = 0; t < n * 3; t++) {
        const a = Math.floor(rng() * n), b = Math.floor(rng() * n);
        if (a !== b && gaps[a] > gMin && gaps[b] < gMax) { gaps[a]--; gaps[b]++; }
    }
    const lines = [];
    let pos = lo + gaps[0];
    for (let g = 1; g < n; g++) {
        lines.push(pos);
        pos += 1 + gaps[g];
    }
    return lines;
}

/** Bagi rentang [lo..hi] menjadi sub-rentang yang dipisah oleh `cuts`. */
function splitRange(lo, hi, cuts) {
    const out = [];
    let a = lo;
    for (const c of cuts) {
        if (c - 1 >= a) out.push([a, c - 1]);
        a = c + 1;
    }
    if (hi >= a) out.push([a, hi]);
    return out;
}

function build() {
    const C = GRID_CONFIG;
    const minI = C.ACTIVE_MIN_I, maxI = C.ACTIVE_MAX_I;
    const minJ = C.ACTIVE_MIN_J, maxJ = C.ACTIVE_MAX_J;
    const PD = C.PD || 43;
    const rMin = C.RIVER_TILE_MIN_I, rMax = C.RIVER_TILE_MAX_I;
    const W = maxI - minI + 1, H = maxJ - minJ + 1;

    const hCls = new Uint8Array(W * H);   // kelas jalan yang melintang horizontal (sepanjang i)
    const vCls = new Uint8Array(W * H);   // kelas jalan yang membujur vertikal (sepanjang j)
    const open = new Uint8Array(W * H);   // 1 = ruang terbuka (taman/lapangan)
    const idx = (i, j) => (j - minJ) * W + (i - minI);
    const isRiver = i => i >= rMin && i <= rMax;
    const artCol = i => (i % PD) < 2 && !isRiver(i);
    const artRow = j => (j % PD) < 2;
    const setH = (i, j, c) => { const k = idx(i, j); if (c > hCls[k]) hCls[k] = c; };
    const setV = (i, j, c) => { const k = idx(i, j); if (c > vCls[k]) vCls[k] = c; };

    const center = C.HALF_TILES;          // baris jembatan landmark (z = 4 m, sama seperti dulu)
    const bridgeRows = [center - 11, center, center + 10].filter(j => j > minJ + 2 && j < maxJ - 2 && !artRow(j));

    // 1. Arteri (lurus) — baris arteri menyeberang sungai (jembatan arteri)
    for (let j = minJ; j <= maxJ; j++) if (artRow(j)) for (let i = minI; i <= maxI; i++) setH(i, j, 3);
    for (let i = minI; i <= maxI; i++) if (artCol(i)) for (let j = minJ; j <= maxJ; j++) setV(i, j, 3);
    // 1b. JALAN LINGKAR PULAU (2026-11-14): arteri tepi terluar peta aktif -> satu loop keliling pulau.
    //     Baris tepi utara/selatan menyeberang sungai sebagai jembatan (sama seperti baris arteri lain);
    //     kolom tepi barat/timur di luar koridor sungai, jadi tak menyeberang. Aditif (setH/setV ambil max).
    for (let i = minI; i <= maxI; i++) { setH(i, minJ, 3); setH(i, maxJ, 3); }
    for (let j = minJ; j <= maxJ; j++) { setV(minI, j, 3); setV(maxI, j, 3); }
    // 2. Jembatan kolektor di atas sungai
    for (const j of bridgeRows) for (let i = rMin; i <= rMax; i++) setH(i, j, 2);

    // 3. Wilayah kolom (di antara arteri/sungai) & pita baris (di antara arteri)
    const colRegions = [];
    for (let i = minI; i <= maxI; i++) {
        if (artCol(i) || isRiver(i)) continue;
        const last = colRegions[colRegions.length - 1];
        if (last && last[1] === i - 1) last[1] = i; else colRegions.push([i, i]);
    }
    const bands = [];
    for (let j = minJ; j <= maxJ; j++) {
        if (artRow(j)) continue;
        const last = bands[bands.length - 1];
        if (last && last[1] === j - 1) last[1] = j; else bands.push([j, j]);
    }

    const blocks = [];
    const subdivide = (x0, x1, y0, y1, P, rng, have) => {
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        if (w <= 0 || h <= 0) return;
        const short = Math.min(w, h), long = Math.max(w, h);
        const fits = short <= P.maxShort && long <= P.maxLong;
        const canW = w >= 2 * P.minDim + 1, canH = h >= 2 * P.minDim + 1;
        if ((!canW && !canH) || (fits && rng() < P.stop)) {
            const area = w * h;
            const isPark = area >= P.parkMinArea && short >= 2 && rng() < P.park;
            if (isPark) for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) open[idx(i, j)] = 1;
            blocks.push({ x0, x1, y0, y1, w, h, have, park: isPark });
            return;
        }
        let vertical;   // true = gang membujur vertikal (membelah lebar)
        if (canW && canH) vertical = w === h ? rng() < 0.5 : (w > h ? rng() < 0.85 : rng() < 0.15);
        else vertical = canW;

        const len = vertical ? w : h;
        const s = randInt(rng, P.minDim, len - P.minDim - 1);
        const span = vertical ? h : w;          // panjang gang
        let a = 0, b = span - 1;                // rentang gang (relatif)
        if (span >= 4 && rng() < P.dead) {
            const gap = span >= 7 && rng() < 0.4 ? 2 : 1;
            if (rng() < 0.5) a += gap; else b -= gap;
        }
        if (vertical) {
            const x = x0 + s;
            for (let t = a; t <= b; t++) setV(x, y0 + t, 1);
            subdivide(x0, x - 1, y0, y1, P, rng, have);
            subdivide(x + 1, x1, y0, y1, P, rng, have);
        } else {
            const y = y0 + s;
            for (let t = a; t <= b; t++) setH(x0 + t, y, 1);
            subdivide(x0, x1, y0, y - 1, P, rng, have);
            subdivide(x0, x1, y + 1, y1, P, rng, have);
        }
    };

    // Desa Have-Not (2026-11-13): pola kampung, bukan papan catur. Per pita (di antara arteri):
    //  a) jalan desa utama membujur yang berbelok (bergeser 1-3 kolom tiap 4-8 petak),
    //  b) jalan dusun bercabang ke samping, ikut berkelok naik-turun 1 baris, berhenti di jalan lain/tepi,
    //  c) gang buntu pendek menuju kelompok rumah,
    //  d) ruang terbuka (kebun/kolam/lapangan) berbentuk gumpalan tak beraturan.
    const roadK = (i, j) => { const k = idx(i, j); return hCls[k] > 0 || vCls[k] > 0; };
    const village = (lo, hi, rng) => {
        const W2 = hi - lo + 1;
        const touchesRiver = lo - 1 === rMax;
        for (const [b0, b1] of bands) {
            const nMain = Math.max(1, Math.round(W2 / 11));
            const mains = [];
            for (let m = 0; m < nMain; m++) {
                const cLo = lo + Math.floor(W2 * m / nMain) + 2;
                const cHi = lo + Math.floor(W2 * (m + 1) / nMain) - 3;
                if (cHi < cLo) continue;
                let c = randInt(rng, cLo, cHi), j = b0;
                const path = new Map();
                while (j <= b1) {
                    const jEnd = Math.min(b1, j + randInt(rng, 4, 8) - 1);
                    for (let t = j; t <= jEnd; t++) { setV(c, t, 2); path.set(t, c); }
                    if (jEnd >= b1) break;
                    const nc = Math.max(cLo, Math.min(cHi, c + (rng() < 0.5 ? -1 : 1) * randInt(rng, 1, 3)));
                    if (nc !== c && jEnd + 1 <= b1) {
                        for (let i = Math.min(c, nc); i <= Math.max(c, nc); i++) setH(i, jEnd, 2);
                    }
                    c = nc; j = jEnd + 1;
                }
                mains.push(path);
            }
            // Jembatan kolektor: sambungkan tepi sungai ke jalan desa terdekat pada baris jembatan
            if (touchesRiver && mains.length) {
                for (const jb of bridgeRows.filter(r => r >= b0 && r <= b1)) {
                    const to = mains[0].get(jb);
                    for (let i = lo; i <= to; i++) setH(i, jb, 2);
                }
            }
            // Jalan dusun: cabang berkelok dari jalan desa ke kiri/kanan
            const walk = (x0, row, dir) => {
                let x = x0, r = row, seg = randInt(rng, 3, 6), steps = 0;
                const maxSteps = randInt(rng, 5, W2 + 2);
                while (steps < maxSteps) {
                    x += dir;
                    if (x < lo || x > hi) break;
                    if (roadK(x, r)) break;                                   // bertemu jalan lain: pertigaan
                    if ((r > b0 && hCls[idx(x, r - 1)]) || (r < b1 && hCls[idx(x, r + 1)])) break;
                    setH(x, r, 1);
                    steps++;
                    if (--seg === 0) {
                        seg = randInt(rng, 3, 6);
                        const nr = r + (rng() < 0.5 ? -1 : 1);
                        if (nr > b0 + 1 && nr < b1 - 1 && !roadK(x, nr)) { setV(x, r, 1); setV(x, nr, 1); r = nr; }
                    }
                }
            };
            for (const path of mains) {
                for (let j = b0 + randInt(rng, 2, 5); j <= b1 - 2; j += randInt(rng, 5, 9)) {
                    const c = path.get(j);
                    if (c === undefined || hCls[idx(c, j)]) continue;
                    const dirs = rng() < 0.4 ? [-1, 1] : [rng() < 0.5 ? -1 : 1];
                    for (const d of dirs) walk(c, j, d);
                }
            }
            // Gang buntu pendek (2-3 petak) tegak lurus dari jalan yang ada
            const tries = Math.round(W2 * (b1 - b0 + 1) / 14);
            for (let t = 0; t < tries; t++) {
                const i = randInt(rng, lo, hi), j = randInt(rng, b0 + 1, b1 - 1);
                const k = idx(i, j);
                if (!(hCls[k] || vCls[k])) continue;
                const vert = hCls[k] > 0 && !vCls[k];
                const d = rng() < 0.5 ? -1 : 1, len = randInt(rng, 2, 3);
                const cells = [];
                for (let s = 1; s <= len; s++) {
                    const ci = vert ? i : i + d * s, cj = vert ? j + d * s : j;
                    if (ci < lo || ci > hi || cj <= b0 || cj >= b1 || roadK(ci, cj)) break;
                    const side = vert ? [[ci - 1, cj], [ci + 1, cj]] : [[ci, cj - 1], [ci, cj + 1]];
                    if (side.some(([a, b]) => a >= lo && a <= hi && b >= b0 && b <= b1 && roadK(a, b))) break;
                    cells.push([ci, cj]);
                }
                if (cells.length >= 2) for (const [ci, cj] of cells) (vert ? setV : setH)(ci, cj, 1);
            }
            // Ruang terbuka gumpalan (tumbuh acak dari satu benih, hanya di petak bukan jalan)
            const area = W2 * (b1 - b0 + 1);
            for (let n = Math.round(area / 55); n > 0; n--) {
                const si = randInt(rng, lo + 1, hi - 1), sj = randInt(rng, b0 + 1, b1 - 1);
                if (roadK(si, sj) || open[idx(si, sj)]) continue;
                const blob = [[si, sj]], want = randInt(rng, 4, 11);
                open[idx(si, sj)] = 1;
                for (let g = 0; g < want * 6 && blob.length < want; g++) {
                    const [bi, bj] = blob[Math.floor(rng() * blob.length)];
                    const [di, dj] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
                    const ni = bi + di, nj = bj + dj;
                    if (ni < lo || ni > hi || nj < b0 || nj > b1 || roadK(ni, nj) || open[idx(ni, nj)]) continue;
                    open[idx(ni, nj)] = 1;
                    blob.push([ni, nj]);
                }
                blocks.push({ x0: si, x1: si, y0: sj, y1: sj, w: 1, h: 1, have: false, park: true, blob: blob.length });
            }
        }
    };

    for (const [lo, hi] of colRegions) {
        const have = hi < rMin;
        const P = have ? PARAMS.have : PARAMS.haveNot;
        const rng = mulberry32(hashSeed(SEED, lo, hi));
        if (!have) { village(lo, hi, rng); continue; }
        // Kolektor vertikal (lurus sepanjang pita)
        const vlines = placeLines(lo, hi, P.vGap[0], P.vGap[1], rng);
        for (const v of vlines) for (const [b0, b1] of bands) for (let j = b0; j <= b1; j++) setV(v, j, 2);

        for (const [s0, s1] of splitRange(lo, hi, vlines)) {
            const touchesRiver = s1 + 1 === rMin || s0 - 1 === rMax;
            for (const [b0, b1] of bands) {
                let hlines;
                if (touchesRiver) {
                    // Strip tepi sungai: kolektor wajib di baris jembatan, sisanya bebas
                    const anchors = bridgeRows.filter(j => j >= b0 && j <= b1);
                    hlines = [...anchors];
                    for (const [c0, c1] of splitRange(b0, b1, anchors)) hlines.push(...placeLines(c0, c1, P.hGap[0], P.hGap[1], rng));
                    hlines.sort((x, y) => x - y);
                } else {
                    hlines = placeLines(b0, b1, P.hGap[0], P.hGap[1], rng);
                }
                for (const hRow of hlines) for (let i = s0; i <= s1; i++) setH(i, hRow, 2);
                for (const [y0, y1] of splitRange(b0, b1, hlines)) subdivide(s0, s1, y0, y1, P, rng, have);
            }
        }
    }

    // 4. Pasca-proses konektivitas: BFS dari petak arteri; petak jalan yang tak terjangkau -> kavling
    const isRd = k => hCls[k] > 0 || vCls[k] > 0;
    const seen = new Uint8Array(W * H);
    const queue = [];
    for (let k = 0; k < W * H; k++) if (hCls[k] === 3 || vCls[k] === 3) { seen[k] = 1; queue.push(k); }
    for (let q = 0; q < queue.length; q++) {
        const k = queue[q];
        const i = k % W, j = (k - i) / W;
        const nb = [];
        if (i > 0) nb.push(k - 1);
        if (i < W - 1) nb.push(k + 1);
        if (j > 0) nb.push(k - W);
        if (j < H - 1) nb.push(k + W);
        for (const n of nb) if (!seen[n] && isRd(n)) { seen[n] = 1; queue.push(n); }
    }
    let pruned = 0;
    for (let k = 0; k < W * H; k++) if (isRd(k) && !seen[k]) { hCls[k] = 0; vCls[k] = 0; pruned++; }

    // 5. Tanpa jalan buntu (2026-11-13): setiap ujung jalan harus bertemu jalan lain.
    //    Sambungan dihitung seperti geometri ruas (roadRuns): geser horizontal tersambung bila salah satu
    //    petak punya komponen horizontal, geser vertikal bila salah satu punya komponen vertikal.
    //    Ujung buntu diteruskan lurus sampai menyentuh jalan (maks DEAD_END_REACH petak, tidak menembus
    //    sungai/ruang terbuka, tidak menempel sejajar jalan lain). Bila tidak bisa, petak ujung dijadikan
    //    kavling dan pemangkasan berlanjut sampai ruas itu bertemu persimpangan.
    //    Ujung di tepi area aktif dibiarkan (jalan berlanjut ke luar peta).
    const DEAD_END_REACH = 4;
    const inA = (i, j) => i >= minI && i <= maxI && j >= minJ && j <= maxJ;
    const rdAt = (i, j) => inA(i, j) && isRd(idx(i, j));
    const links = (i, j) => {
        const k = idx(i, j), out = [];
        for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const ni = i + di, nj = j + dj;
            if (!rdAt(ni, nj)) continue;
            const nk = idx(ni, nj);
            if (di ? (hCls[k] || hCls[nk]) : (vCls[k] || vCls[nk])) out.push([di, dj]);
        }
        return out;
    };
    let extended = 0, deadPruned = 0;
    for (let pass = 0, changed = true; changed && pass < 50; pass++) {
        changed = false;
        for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
            const k = idx(i, j);
            if (!isRd(k) || hCls[k] === 3 || vCls[k] === 3 || isRiver(i)) continue;
            const l = links(i, j);
            if (l.length >= 2) continue;
            if (l.length === 1) {
                const di = -l[0][0], dj = -l[0][1];
                if (!inA(i + di, j + dj)) continue;                       // menuju tepi peta: biarkan
                const horiz = di !== 0;
                const cls = Math.max(1, Math.min(2, horiz ? hCls[k] || vCls[k] : vCls[k] || hCls[k]));
                const cells = [];
                let ok = false;
                for (let s = 1; s <= DEAD_END_REACH; s++) {
                    const ci = i + di * s, cj = j + dj * s;
                    if (!inA(ci, cj)) { ok = true; break; }               // tembus ke tepi peta
                    if (isRiver(ci) && !bridgeRows.includes(cj)) break;
                    const ck = idx(ci, cj);
                    if (isRd(ck)) { ok = true; break; }
                    if (open[ck]) break;
                    // jangan menempel sejajar jalan lain (dua jalan berdempet)
                    const side = horiz ? [[ci, cj - 1], [ci, cj + 1]] : [[ci - 1, cj], [ci + 1, cj]];
                    if (side.some(([a, b]) => rdAt(a, b) && (horiz ? hCls[idx(a, b)] : vCls[idx(a, b)]))) break;
                    cells.push(ck);
                }
                if (ok) {
                    (horiz ? setH : setV)(i, j, cls);
                    for (const ck of cells) { if (horiz) hCls[ck] = Math.max(hCls[ck], cls); else vCls[ck] = Math.max(vCls[ck], cls); }
                    extended += cells.length;
                    changed = true;
                    continue;
                }
            }
            hCls[k] = 0; vCls[k] = 0; deadPruned++; changed = true;
        }
    }

    const road = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) road[k] = Math.max(hCls[k], vCls[k]);

    return { minI, maxI, minJ, maxJ, W, H, PD, rMin, rMax, road, hCls, vCls, open, blocks, bridgeRows, pruned, extended, deadPruned, idx, runs: null };
}

const net = () => NET || (NET = build());
const inActive = (n, i, j) => i >= n.minI && i <= n.maxI && j >= n.minJ && j <= n.maxJ;

/** True bila kolom i adalah koridor sungai. */
export const isRiverTile = i => i >= GRID_CONFIG.RIVER_TILE_MIN_I && i <= GRID_CONFIG.RIVER_TILE_MAX_I;

/**
 * Kelas jalan pada petak (i, j): 0 kavling/taman/sungai, 1 gang, 2 kolektor, 3 arteri.
 * Di koridor sungai hanya baris jembatan yang bernilai > 0.
 * Di luar area aktif: hanya arteri lurus lanjutan (rumus distrik lama), selain itu 0.
 */
export function roadAt(i, j) {
    const n = net();
    if (!inActive(n, i, j)) {
        const ai = ((i % n.PD) + n.PD) % n.PD < 2 && !isRiverTile(i);
        const aj = ((j % n.PD) + n.PD) % n.PD < 2;
        return ai || aj ? 3 : 0;
    }
    return n.road[n.idx(i, j)];
}

/** Kelas jalan horizontal (sepanjang sumbu i / X) yang melintasi petak; 0 bila tidak ada. */
export function roadAtH(i, j) {
    const n = net();
    return inActive(n, i, j) ? n.hCls[n.idx(i, j)] : 0;
}

/** Kelas jalan vertikal (sepanjang sumbu j / Z) yang melintasi petak; 0 bila tidak ada. */
export function roadAtV(i, j) {
    const n = net();
    return inActive(n, i, j) ? n.vCls[n.idx(i, j)] : 0;
}

export const isRoadTile = (i, j) => roadAt(i, j) > 0;

/** Ruang terbuka (taman/lapangan) di dalam area aktif: bukan jalan, bukan kavling. */
export function isOpenSpace(i, j) {
    const n = net();
    return inActive(n, i, j) && n.open[n.idx(i, j)] === 1;
}

/** Kavling sah: di area aktif, bukan sungai, bukan jalan, bukan ruang terbuka. */
export function isLotTile(i, j) {
    const n = net();
    if (!inActive(n, i, j) || isRiverTile(i)) return false;
    const k = n.idx(i, j);
    return n.road[k] === 0 && n.open[k] === 0;
}

/** Baris (j) jembatan kolektor di atas sungai (selain baris arteri). */
export const bridgeRows = () => net().bridgeRows.slice();

/** Baris jembatan landmark "Gotong Royong" (pusat kota, z = 4 m). */
export const luxuryBridgeRow = () => GRID_CONFIG.HALF_TILES;

/** Daftar blok hasil pembelahan (untuk statistik/debug). */
export const roadBlocks = () => net().blocks;

/**
 * Ruas jalan lurus untuk geometri, lalu lintas & pejalan kaki.
 * h: { j, i0, i1, cls } ruas horizontal; v: { i, j0, j1, cls } ruas vertikal (petak inklusif).
 * Ujung ruas diperpanjang 1 petak ke persimpangan bila petak itu jalan (pertigaan/perempatan).
 * Ruas horizontal di baris jembatan menembus sungai (renderer memotongnya sendiri).
 */
export function roadRuns() {
    const n = net();
    if (n.runs) return n.runs;
    const h = [], v = [];
    const rd = (i, j) => inActive(n, i, j) && n.road[n.idx(i, j)] > 0;
    for (let j = n.minJ; j <= n.maxJ; j++) {
        let i = n.minI;
        while (i <= n.maxI) {
            if (n.hCls[n.idx(i, j)] === 0) { i++; continue; }
            let e = i, cls = 0;
            while (e <= n.maxI && n.hCls[n.idx(e, j)] > 0) { cls = Math.max(cls, n.hCls[n.idx(e, j)]); e++; }
            let i0 = i, i1 = e - 1;
            if (rd(i0 - 1, j)) i0--;
            if (rd(i1 + 1, j)) i1++;
            if (i1 > i0) h.push({ j, i0, i1, cls });
            i = e;
        }
    }
    for (let i = n.minI; i <= n.maxI; i++) {
        let j = n.minJ;
        while (j <= n.maxJ) {
            if (n.vCls[n.idx(i, j)] === 0) { j++; continue; }
            let e = j, cls = 0;
            while (e <= n.maxJ && n.vCls[n.idx(i, e)] > 0) { cls = Math.max(cls, n.vCls[n.idx(i, e)]); e++; }
            let j0 = j, j1 = e - 1;
            if (rd(i, j0 - 1)) j0--;
            if (rd(i, j1 + 1)) j1++;
            if (j1 > j0) v.push({ i, j0, j1, cls });
            j = e;
        }
    }
    n.runs = { h, v };
    return n.runs;
}

/** Info internal untuk skrip verifikasi. */
export const roadNetworkInfo = () => {
    const n = net();
    return { minI: n.minI, maxI: n.maxI, minJ: n.minJ, maxJ: n.maxJ, pruned: n.pruned, extended: n.extended,
        deadPruned: n.deadPruned, bridgeRows: n.bridgeRows.slice() };
};
