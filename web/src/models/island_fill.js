/**
 * AUDIRA-LAND: ISI AREA KOSONG PULAU (2026-11-14) — hutan, kebun pohon & kampung rumah.
 *
 * Sumber ruang kosong: FREE_MASK, grid 16 m (144 x 100 sel) di X -860.., Z -440.., hasil raycast sekali
 * terhadap seluruh konten lama (kota, taman budaya, lembah salju, pegunungan, bandara, stadion, dll.),
 * lalu dierosi 1 sel agar ada jarak bebas. Kode sel: 0 terisi, 1 daratan pulau (y -0,12),
 * 2 tanah datar rural (y -0,03), 3 tepi terrain kota (y 0). Bila tata letak lama berubah, ulangi scan.
 * Tambahan saringan di sini: di dalam daratan (inset 25 m), >= 38 m dari rel, bebas jalan akses stasiun.
 *
 * Isi:
 *  - Kampung: 3 di ujung jalan akses stasiun darat + 9 tersebar. Rumah limasan (dinding, plint, atap
 *    piramida, pintu, jendela) berjajar menghadap jalan desa, satu mushola berkubah per kampung.
 *  - Pohon: kerapatan dari value-noise (hutan lebat ↔ padang), jenis rindang / cemara (utara) / pisang.
 *
 * Semua mesh polos -> ikut bakeStatic island_railway.js per chunk 600 m: 0 draw call tambahan per chunk,
 * frustum culling tetap jalan. Tanpa bayangan (anggaran HP). Zero-Submerging: alas di permukaan sel + 0,02.
 */

const FREE_MASK = '1t.01e.21j.113.01e.21j.113.01e.2a.06.213.113.01e.26.0d.210.1p.07.19.01c.25.0f.2z.1o.02e.2y.1n.02g.2x.1n.02h.2w.1n.02h.2w.1n.02h.2w.1m.0h.38.0d.32.01e.2w.1l.0i.38.0d.32.01e.2w.1l.0i.38.0d.32.01e.2w.1l.0i.38.0d.32.01e.2w.1m.0h.38.01t.2w.1m.0h.36.01u.2x.1m.02h.2x.1m.02g.2y.1m.02f.2z.1m.0y.31.01e.211.1l.02e.211.1l.02e.211.1k.0q.34.01m.210.1k.0q.32.01q.2y.1k.02j.2x.1l.02j.2w.1l.02k.2v.1l.0s.31.01s.2u.1l.02l.2u.1l.02l.2u.1l.02l.2u.1m.02k.2u.1m.0o.34.01s.2u.1m.02k.2u.1m.02k.2u.1m.02k.2u.1n.0n.33.01s.2v.1m.02j.2v.1m.02i.2w.1m.0h.35.01v.2x.1n.0g.35.01t.2z.1n.0g.35.01r.211.1n.0g.35.011.31.0l.215.1m.0h.35.01m.216.1l.02d.212.1k.02e.212.1k.02e.212.1j.02f.212.1j.02f.212.1j.02f.212.1k.02e.212.1k.02e.212.1l.02d.212.1n.02b.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.212.1o.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.11q.02a.1rr.1dl.';
const CELL = 16, GX0 = -860, GZ0 = -440, NX = 144, NZ = 100;
const SURF = { 1: -0.12, 2: -0.03, 3: 0.0 };

const MAX_TREES = 6000;

const C = {
    trunk: 0x6B4E33, leafA: 0x4F8A3A, leafB: 0x6AA548, leafC: 0x3E7A34, pine: 0x2F5E3A, pine2: 0x3F6E45,
    banana: 0x7DB04B, road: 0xB09A74, plinth: 0x9E978C, door: 0x54331C, win: 0x2C3E4A,
    walls: [0xF4EEE2, 0xEAD9B8, 0xD9C6A0, 0xCFE0D6, 0xF2D7C4, 0xE6E0F0, 0xC9B79C],
    roofs: [0xA33822, 0xC8553D, 0x8E3B28, 0x4C545E, 0x2C6E8F, 0x6B4A3A],
    floor: 0x5E8E3E, floor2: 0x649440, sawah: [0x8DBF4E, 0x7DB043, 0xA9C25A], ladang: [0x9C7A52, 0x8A6A45],
    mosque: 0xF4F1EA, dome: 0x2E8B57, gold: 0xE9A91E
};

function decodeMask() {
    const out = new Uint8Array(NX * NZ);
    let k = 0;
    for (const tok of FREE_MASK.split('.')) {
        if (!tok) continue;
        const v = +tok[0], n = parseInt(tok.slice(1), 36);
        out.fill(v, k, k + n);
        k += n;
    }
    return out;
}

function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Jarak bertanda ke persegi panjang membulat (negatif = di dalam). */
function sdRound(x, z, x0, x1, z0, z1, r) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const qx = Math.abs(x - cx) - ((x1 - x0) / 2 - r), qz = Math.abs(z - cz) - ((z1 - z0) / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

/** Value-noise halus 2D (kisi 7 sel) untuk kerapatan hutan. */
function makeNoise(rnd, step) {
    const W = Math.ceil(NX / step) + 2, H = Math.ceil(NZ / step) + 2;
    const v = Float32Array.from({ length: W * H }, rnd);
    const s = t => t * t * (3 - 2 * t);
    return (i, j) => {
        const fx = i / step, fz = j / step, x = Math.floor(fx), z = Math.floor(fz);
        const tx = s(fx - x), tz = s(fz - z);
        const a = v[z * W + x], b = v[z * W + x + 1], c = v[(z + 1) * W + x], d = v[(z + 1) * W + x + 1];
        return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    };
}

/**
 * @param rail  instance IslandRailway (memakai rail.add(geo, hex), rail.stations, konstanta loop)
 * @param RAIL  batas loop rel {x0,x1,z0,z1,r}; ISLAND batas daratan {x0,x1,z0,z1,r}
 */
export function fillIsland(rail, RAIL, ISLAND) {
    const mask = decodeMask();
    const used = new Uint8Array(NX * NZ);
    const rnd = mulberry(0x15A7D);
    const cellX = i => GX0 + (i + 0.5) * CELL, cellZ = j => GZ0 + (j + 0.5) * CELL;

    // Jalan akses stasiun darat (lokal stasiun: u 18..100 dari rel, |t| < 14) tidak boleh terisi
    const stations = rail.stations.filter(st => st.y < 1);
    const onAccess = (x, z) => stations.some(st => {
        const dx = x - st.x, dz = z - st.z;
        const u = dx * st.N.x + dz * st.N.z, t = dx * st.N.z - dz * st.N.x;
        return u > -5 && u < 100 && Math.abs(t) < 14;
    });
    const okXZ = (x, z) => z > ISLAND.z0 + 20
        && sdRound(x, z, ISLAND.x0, ISLAND.x1, ISLAND.z0 - 400, ISLAND.z1, ISLAND.r) < -25
        && Math.abs(sdRound(x, z, RAIL.x0, RAIL.x1, RAIL.z0, RAIL.z1, RAIL.r)) > 38
        && !onAccess(x, z);
    const cellOf = (x, z) => {
        const i = Math.floor((x - GX0) / CELL), j = Math.floor((z - GZ0) / CELL);
        return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i;
    };
    const free = (x, z) => { const k = cellOf(x, z); return k >= 0 && mask[k] > 0 && !used[k] && okXZ(x, z); };
    const surf = (x, z) => SURF[mask[cellOf(x, z)]] ?? -0.12;

    // ---- geometri bersama ----
    const G = {
        box: new THREE.BoxGeometry(1, 1, 1),
        roof: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0),
        trunk: new THREE.CylinderGeometry(0.16, 0.26, 1, 5, 1, true).translate(0, 0.5, 0),
        crown: new THREE.IcosahedronGeometry(1, 0),
        cone: new THREE.ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0),
        dome: new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
        plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    };
    const put = (geo, hex, x, y, z, sx, sy, sz, ry = 0) => {
        const m = rail.add(geo, hex);
        m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry;
        return m;
    };
    // Kotak dengan sumbu lokal (along = arah jalan, across = tegak lurus), alas di y0
    const boxR = (x, z, ry, w, h, d, y0, hex) => put(G.box, hex, x, y0 + h / 2, z, w, h, d, ry);

    // ------------------------------------------------------------------ Kampung
    const villages = [];
    for (const st of stations) villages.push({ x: st.x + st.N.x * 120, z: st.z + st.N.z * 120, a: Math.atan2(st.N.x, st.N.z), big: true });
    for (let tries = 0; villages.length < 12 && tries < 4000; tries++) {
        const k = Math.floor(rnd() * NX * NZ);
        if (!mask[k]) continue;
        const x = cellX(k % NX), z = cellZ((k / NX) | 0);
        if (!okXZ(x, z) || villages.some(v => Math.hypot(v.x - x, v.z - z) < 300)) continue;
        // Butuh lingkungan cukup lapang (>= 20 dari 25 sel di sekitar kosong)
        let n = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (free(x + di * CELL, z + dj * CELL)) n++;
        if (n < 20) continue;
        villages.push({ x, z, a: Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.3, big: false });
    }

    let houses = 0;
    const house = (x, z, ry, y0) => {
        const w = 6.2 + rnd() * 2.4, d = 5.6 + rnd() * 1.8, h = 2.9 + rnd() * 0.8;
        const wall = C.walls[Math.floor(rnd() * C.walls.length)], roof = C.roofs[Math.floor(rnd() * C.roofs.length)];
        boxR(x, z, ry, w + 0.6, 0.35, d + 0.6, y0, C.plinth);
        boxR(x, z, ry, w, h, d, y0 + 0.35, wall);
        const rh = 1.9 + rnd() * 0.9;
        put(G.roof, roof, x, y0 + 0.35 + h, z, w + 1.2, rh, d + 1.2, ry);   // piramida alas 1x1 -> tritisan 0,6 m
        // Muka depan menghadap +Z lokal (ke jalan): pintu + 2 jendela
        const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
        const fd = d / 2 + 0.03;
        boxR(x + fx * fd, z + fz * fd, ry, 1.1, 2.1, 0.08, y0 + 0.35, C.door);
        for (const s of [-1, 1]) boxR(x + fx * fd + rx * s * w * 0.3, z + fz * fd + rz * s * w * 0.3, ry, 1.2, 0.9, 0.08, y0 + 1.6, C.win);
        houses++;
    };
    const claim = (x, z) => { const k = cellOf(x, z); if (k >= 0) used[k] = 1; };
    const pts = [];                                          // titik rumah/mushola (jarak min. 12 m)
    const freeH = (x, z, r = 12) => {
        const k = cellOf(x, z);
        return k >= 0 && mask[k] > 0 && okXZ(x, z) && !pts.some(p => Math.hypot(p[0] - x, p[1] - z) < r);
    };

    for (const v of villages) {
        const ca = Math.cos(v.a), sa = Math.sin(v.a);
        const L = (lx, lz) => [v.x + lx * ca + lz * sa, v.z - lx * sa + lz * ca];   // lokal -> dunia (ry = v.a)
        const R = v.big ? 6 : 4;
        const placed = [];
        // Jalan utama (lz = 0) & jalan silang (lx = 0); rumah di kedua sisi, menghadap jalan
        for (let k = -R; k <= R; k++) {
            if (k === 0) continue;
            for (const side of [-1, 1]) {
                const spots = [[k * 15, side * 11, side < 0 ? 0 : Math.PI]];
                if (Math.abs(k) >= 2) spots.push([side * 11, k * 15, side < 0 ? Math.PI / 2 : -Math.PI / 2]);
                for (const [lx, lz, face] of spots) {
                    const [x, z] = L(lx, lz);
                    if (!freeH(x, z) || rnd() < 0.12) continue;
                    claim(x, z); pts.push([x, z]);
                    house(x, z, v.a + face, surf(x, z) + 0.02);
                    placed.push([lx, lz]);
                }
            }
        }
        if (placed.length < 3) continue;
        // Jalan desa hanya di depan rumah yang berdiri (tak menembus area lain)
        for (const [lx, lz] of placed) {
            const onMain = Math.abs(lz) === 11;
            const [x, z] = onMain ? L(lx, 0) : L(0, lz);
            boxR(x, z, v.a + (onMain ? 0 : Math.PI / 2), 16, 0.05, 4.2, surf(x, z) + 0.02, C.road);
            claim(x, z);
        }
        const [cx, cz] = L(0, 0);
        boxR(cx, cz, v.a, 9, 0.05, 9, surf(cx, cz) + 0.02, C.road);   // simpang
        // Mushola di pojok simpang (bila sel bebas)
        const [mx, mz] = L(-26, -26);
        if (freeH(mx, mz, 14)) {
            claim(mx, mz); pts.push([mx, mz]);
            const y0 = surf(mx, mz) + 0.02;
            boxR(mx, mz, v.a, 9, 0.4, 9, y0, C.plinth);
            boxR(mx, mz, v.a, 8, 4.2, 8, y0 + 0.4, C.mosque);
            put(G.dome, C.dome, mx, y0 + 4.6, mz, 3.4, 3.0, 3.4);
            put(G.cone, C.gold, mx, y0 + 7.5, mz, 0.25, 1.2, 0.25);
            const [nx, nz] = L(-26 + 5.5, -26 + 5.5);
            put(G.cyl, C.mosque, nx, y0 + 5.5, nz, 1.1, 11, 1.1);
            put(G.cone, C.dome, nx, y0 + 11, nz, 0.8, 1.6, 0.8);
        }
    }

    // ------------------------------------------------------------------ Sawah & ladang sekeliling kampung
    for (const v of villages) {
        const R0 = v.big ? 115 : 85, R1 = R0 + 90;
        for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
            const k = j * NX + i, x = cellX(i), z = cellZ(j);
            const d = Math.hypot(x - v.x, z - v.z);
            if (d < R0 || d > R1 || !mask[k] || used[k] || !okXZ(x, z) || rnd() < 0.25) continue;
            used[k] = 1;
            const y0 = SURF[mask[k]] + 0.03, sawah = rnd() < 0.65;
            const cols = sawah ? C.sawah : C.ladang;
            // Petak 14 m dibelah 2 alur warna (pematang terlihat sebagai celah rumput 2 m)
            for (const s of [-1, 1]) put(G.plane, cols[Math.floor(rnd() * cols.length)], x + s * 3.5 * Math.cos(v.a), y0, z - s * 3.5 * Math.sin(v.a), 6.6, 1, 14, v.a);
        }
    }

    // ------------------------------------------------------------------ Pohon
    const noise = makeNoise(rnd, 7);
    let trees = 0;
    const tree = (x, z, y0, north) => {
        const r = rnd();
        if (north && r < 0.55) {                       // cemara bertingkat
            const h = 7 + rnd() * 5;
            put(G.trunk, C.trunk, x, y0, z, 1, h * 0.35, 1);
            put(G.cone, rnd() < 0.5 ? C.pine : C.pine2, x, y0 + h * 0.25, z, 2.4, h * 0.55, 2.4);
            put(G.cone, C.pine2, x, y0 + h * 0.55, z, 1.7, h * 0.45, 1.7);
        } else if (r < 0.12) {                         // pisang
            const h = 3 + rnd() * 1.5;
            put(G.trunk, C.leafC, x, y0, z, 0.8, h, 0.8);
            for (let f = 0; f < 4; f++) put(G.box, C.banana, x, y0 + h, z, 0.7, 0.08, 3.2, f * Math.PI / 4 + rnd());
        } else {                                       // pohon rindang
            const h = 3.5 + rnd() * 3, cr = 2.4 + rnd() * 1.8;
            put(G.trunk, C.trunk, x, y0, z, 1.1, h, 1.1);
            const leaf = r < 0.5 ? C.leafA : r < 0.8 ? C.leafB : C.leafC;
            put(G.crown, leaf, x, y0 + h + cr * 0.55, z, cr, cr * 0.85, cr, rnd() * 6);
            if (rnd() < 0.2) put(G.crown, C.leafB, x + (rnd() - 0.5) * 2, y0 + h + cr * 0.2, z + (rnd() - 0.5) * 2, cr * 0.7, cr * 0.6, cr * 0.7);
        }
        trees++;
    };
    const order = [];
    for (let k = 0; k < NX * NZ; k++) if (mask[k] && !used[k]) order.push(k);
    // Acak urutan agar batas MAX_TREES tersebar rata ke seluruh pulau
    for (let a = order.length - 1; a > 0; a--) { const b = Math.floor(rnd() * (a + 1)); [order[a], order[b]] = [order[b], order[a]]; }
    for (const k of order) {
        if (trees >= MAX_TREES) break;
        const i = k % NX, j = (k / NX) | 0, x0 = cellX(i), z0 = cellZ(j);
        if (!okXZ(x0, z0)) continue;
        const dens = noise(i, j);
        const y0 = SURF[mask[k]];
        // Hutan bergerombol: lantai hutan gelap + pohon rapat; padang di luar hutan hanya pohon tunggal
        if (dens > 0.5) put(G.plane, dens > 0.6 ? C.floor : C.floor2, x0, y0 + 0.03, z0, CELL, 1, CELL);
        const n = dens > 0.6 ? 4 : dens > 0.5 ? 3 : dens > 0.42 ? 1 : (rnd() < 0.06 ? 1 : 0);
        for (let t = 0; t < n; t++) {
            const x = x0 + (rnd() - 0.5) * (CELL - 3), z = z0 + (rnd() - 0.5) * (CELL - 3);
            if (!okXZ(x, z)) continue;
            tree(x, z, y0 + 0.02, z > 650);
        }
    }
    return { houses, trees, villages: villages.length };
}
