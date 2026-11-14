/**
 * Cek konektivitas jaringan jalan AUDIRA-LAND seperti yang benar-benar dirender (core/grid.js buildRoadNetwork).
 *
 *   node tools/check_road_connectivity.mjs
 *
 * Aturan sambung (sama dengan geometri ruas dari roadRuns()):
 *  - Geser horizontal A<->B tersambung bila A atau B punya komponen jalan horizontal (hCls),
 *    karena ruas horizontal diperpanjang 1 petak ke petak jalan di ujungnya.
 *  - Geser vertikal A<->B tersambung bila A atau B punya komponen vertikal (vCls).
 *  - Dua jalan sejajar yang hanya bersebelahan (mis. dua ruas horizontal di baris berurutan) TIDAK tersambung.
 *  - Koridor sungai: hanya baris jembatan (dirender sebagai jembatan).
 * Keluaran: jumlah komponen, petak per komponen di luar komponen utama. Exit 1 bila ada yang terputus.
 */
globalThis.window = globalThis.window || {};
const { GRID_CONFIG } = await import('../web/src/core/constants.js');
const RN = await import('../web/src/core/road_network.js');

const { minI, maxI, minJ, maxJ } = RN.roadNetworkInfo();
const W = maxI - minI + 1, H = maxJ - minJ + 1;
const k = (i, j) => (j - minJ) * W + (i - minI);
const h = (i, j) => RN.roadAtH(i, j), v = (i, j) => RN.roadAtV(i, j);
const isRd = (i, j) => RN.roadAt(i, j) > 0;

const comp = new Int32Array(W * H).fill(-1);
const sizes = [];
const sample = [];
for (let j0 = minJ; j0 <= maxJ; j0++) for (let i0 = minI; i0 <= maxI; i0++) {
    if (!isRd(i0, j0) || comp[k(i0, j0)] >= 0) continue;
    const id = sizes.length;
    let n = 0, hasArt = false;
    const q = [[i0, j0]];
    comp[k(i0, j0)] = id;
    while (q.length) {
        const [i, j] = q.pop();
        n++;
        if (RN.roadAt(i, j) === 3) hasArt = true;
        const nb = [];
        if (h(i, j)) { nb.push([i - 1, j], [i + 1, j]); }
        if (v(i, j)) { nb.push([i, j - 1], [i, j + 1]); }
        // Ujung ruas tetangga yang menjorok ke petak ini
        for (const [di, dj, ax] of [[-1, 0, 'h'], [1, 0, 'h'], [0, -1, 'v'], [0, 1, 'v']]) {
            const ni = i + di, nj = j + dj;
            if (ni < minI || ni > maxI || nj < minJ || nj > maxJ) continue;
            if ((ax === 'h' ? h(ni, nj) : v(ni, nj)) > 0) nb.push([ni, nj]);
        }
        for (const [ni, nj] of nb) {
            if (ni < minI || ni > maxI || nj < minJ || nj > maxJ || !isRd(ni, nj)) continue;
            const kk = k(ni, nj);
            if (comp[kk] >= 0) continue;
            comp[kk] = id;
            q.push([ni, nj]);
        }
    }
    sizes.push(n);
    sample.push({ id, i: i0, j: j0, n, hasArt });
}
const main = sizes.indexOf(Math.max(...sizes));
const others = sample.filter(s => s.id !== main);
console.log(`area i ${minI}..${maxI}, j ${minJ}..${maxJ}; komponen jalan: ${sizes.length}; utama: ${sizes[main]} petak`);
for (const s of others.slice(0, 40)) console.log(`  terputus: ${s.n} petak mulai (i=${s.i}, j=${s.j})${s.hasArt ? ' [arteri]' : ''}`);
if (others.length > 40) console.log(`  ... +${others.length - 40} lagi`);
console.log(`petak jalan terputus: ${others.reduce((a, s) => a + s.n, 0)}`);

// Jalan buntu: ujung ruas (1 sambungan) yang tidak mengarah ke tepi peta
const inA = (i, j) => i >= minI && i <= maxI && j >= minJ && j <= maxJ;
const dead = [];
for (let j = minJ; j <= maxJ; j++) for (let i = minI; i <= maxI; i++) {
    if (!isRd(i, j) || RN.roadAt(i, j) === 3 || RN.isRiverTile(i)) continue;
    const l = [];
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ni = i + di, nj = j + dj;
        if (!inA(ni, nj) || !isRd(ni, nj)) continue;
        if (di ? (h(i, j) || h(ni, nj)) : (v(i, j) || v(ni, nj))) l.push([di, dj]);
    }
    if (l.length === 1 && !inA(i - l[0][0], j - l[0][1])) continue;
    if (l.length <= 1) dead.push(`(i=${i}, j=${j})`);
}
const info = RN.roadNetworkInfo();
console.log(`jalan buntu: ${dead.length}${dead.length ? ' -> ' + dead.slice(0, 20).join(' ') : ''}`);
console.log(`disambung: ${info.extended ?? '-'} petak, dipangkas: ${info.deadPruned ?? '-'} petak`);
process.exit(others.length || dead.length ? 1 : 0);
