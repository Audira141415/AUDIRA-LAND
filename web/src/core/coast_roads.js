/**
 * AUDIRA-LAND: Jalan akses pesisir selatan (spek: docs/SPEC_TRAVEL_SYSTEM.md)
 *
 * Menyambung jalan arteri tepi selatan kota (z -176) ke gerbang darat:
 *  - Barat: x -268, di antara Taman Hiburan (x <= -296) & slab Stadion (x >= -258), ke gerbang
 *    Terminal Pesiar (z -342, celah x -274..-226).
 *  - Timur: x 264, di celah sawah selatan (x <= 258) & sawah timur berundak (x >= 270), ke gerbang
 *    Pelabuhan (z -340, celah x 241..299).
 * Sawah, pohon, dan satwa menghindari koridor ini lewat onCoastRoad() (rural_scenery.js, wildlife.js).
 * Geometri: 1 mesh vertex color (aspal + garis tepi + marka putus-putus) = 1 draw call.
 */

export const COAST_ROAD_W = 7;
export const COAST_ROADS = {
    pesiar: [[-268, -172], [-268, -334]],
    pelabuhan: [[262, -172], [264, -190], [264, -322], [268, -334]]
};

/** true bila (x, z) berada di koridor jalan pesisir (+ margin meter). */
export function onCoastRoad(x, z, margin = 0) {
    const half = COAST_ROAD_W / 2 + margin;
    for (const pts of Object.values(COAST_ROADS)) {
        for (let n = 1; n < pts.length; n++) {
            const [ax, az] = pts[n - 1], [bx, bz] = pts[n];
            const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
            if (Math.hypot(x - (ax + t * dx), z - (az + t * dz)) < half) return true;
        }
    }
    return false;
}

const Y = 0.06;   // di atas tanah (y 0) & pasir (y -0.02): zero-submerging, tanpa z-fighting

/** Bangun jalan pesisir sebagai 1 mesh dan tambahkan ke scene. */
export function buildCoastRoads(scene) {
    const pos = [], col = [];
    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const ASPAL = lin(0x4A4C52), TEPI = lin(0xE9E6DD), MARKA = lin(0xF4F1E8), BAHU = lin(0xB9A57E);
    // persegi panjang datar dari a ke b, lebar w, digeser lateral `off`, tinggi y
    const quad = (ax, az, bx, bz, w, off, y, c) => {
        const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
        const p = (x, z, s) => [x + nx * (off + s * w / 2), y, z + nz * (off + s * w / 2)];
        const v = [p(ax, az, -1), p(bx, bz, -1), p(bx, bz, 1), p(ax, az, -1), p(bx, bz, 1), p(ax, az, 1)];
        for (const q of v) { pos.push(...q); col.push(c.r, c.g, c.b); }   // arah hadap dirapikan di akhir
    };
    const disc = (x, z, r, y, c) => {
        const N = 10;
        for (let i = 0; i < N; i++) {
            const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
            pos.push(x, y, z, x + Math.cos(a1) * r, y, z + Math.sin(a1) * r, x + Math.cos(a0) * r, y, z + Math.sin(a0) * r);
            for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
        }
    };
    const W = COAST_ROAD_W;
    for (const pts of Object.values(COAST_ROADS)) {
        for (let n = 1; n < pts.length; n++) {
            const [ax, az] = pts[n - 1], [bx, bz] = pts[n];
            quad(ax, az, bx, bz, W + 2, 0, Y - 0.01, BAHU);           // bahu jalan tanah
            quad(ax, az, bx, bz, W, 0, Y, ASPAL);                     // aspal
            for (const s of [-1, 1]) quad(ax, az, bx, bz, 0.22, s * (W / 2 - 0.45), Y + 0.005, TEPI);
            // marka tengah putus-putus 3 m / celah 3 m
            const L = Math.hypot(bx - ax, bz - az);
            for (let d = 1.5; d + 3 <= L; d += 6) {
                const t0 = d / L, t1 = (d + 3) / L;
                quad(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, 0.2, 0, Y + 0.005, MARKA);
            }
            // sambungan belokan
            if (n > 1) { disc(ax, az, W / 2 + 1, Y - 0.01, BAHU); disc(ax, az, W / 2, Y + 0.001, ASPAL); }
        }
    }
    // Pastikan semua segitiga menghadap atas (normal +Y), apa pun arah ruasnya
    for (let i = 0; i < pos.length; i += 9) {
        const ux = pos[i + 3] - pos[i], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vz = pos[i + 8] - pos[i + 2];
        if (uz * vx - ux * vz < 0) {   // komponen Y dari (u × v) negatif -> tukar 2 titik
            // (warna 3 titik satu segitiga selalu sama, jadi cukup tukar posisinya)
            for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = 'coast_roads';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    return mesh;
}
