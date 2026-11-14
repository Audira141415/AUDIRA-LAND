/* global THREE */
/**
 * AUDIRA-LAND: Kota Si Kaya & Si Miskin (Have vs Have-Not) — pengisi kavling kosong yang realistis.
 *
 * Semua kavling yang belum diklaim warga diisi bangunan latar sehingga kesenjangan terlihat nyata:
 *  - Desa Have (barat sungai): CBD menara kaca 50–150 m di tepi sungai & pusat kota, gedung kantor/apartemen
 *    menengah di cincin berikutnya, lalu vila modern berpagar tembok dengan kolam renang, rumput dipangkas,
 *    carport, dan mobil sport di pinggiran barat.
 *  - Desa Have-Not (timur sungai): kampung padat 3–6 gubuk per kavling, gang tikus 30–50 cm, atap seng
 *    karatan / terpal biru ditindih ban bekas, dinding bata telanjang / plester kusam berlumut / triplek,
 *    jemuran, drum air biru, toren, gerobak, motor bebek, antena TV, tiang listrik dengan kabel semrawut,
 *    tumpukan sampah. Semua 1 lantai (village_rules.js).
 *
 * Bangunan latar TIDAK menempati layout: kavling tetap bisa diklaim. Saat bangunan warga berdiri di kavling,
 * bangunan latar di sana "digusur" (vertex dikolapskan), dan muncul lagi bila bangunan dibongkar.
 * occupy/release milik CityLayout dibungkus (berantai dengan CityTrees).
 *
 * Kinerja: 1 atlas kanvas 2048² (diffuse + emissive malam), 1 MeshLambertMaterial, 2 mesh gabungan
 * (Have, Have-Not) = 2 draw call + 2 bayangan, ditambah 4 mesh perabot kampung per kuadran (tanpa bayangan,
 * userData.detail = 170 -> disembunyikan updateDetailLOD bila kamera jauh). Raycast dimatikan (klik kavling memakai bidang y = 0).
 * Zero-Submerging: alas setiap bangunan = permukaan tertinggi tapak (SurfaceIndex) + 0,02 m.
 *
 * API: new InequalityCity(scene, layout) -> .setNight(b), .update(dt), .covers(i, j), .stats
 */

import { GRID_CONFIG, wx } from '../core/constants.js';
import { isLotTile } from '../core/road_network.js';
import { CityLayout, isMonumentTile } from '../core/city_layout.js';
import { getSurfaceIndex } from '../core/surface_index.js';

const T = GRID_CONFIG.TILE_SIZE;
const ATLAS = 2048, CELL = 256;
const LIFT = 0.02;

// ---------------------------------------------------------------------------------------------
// Acak deterministik
// ---------------------------------------------------------------------------------------------
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const hash = (i, j, k = 0) => rng((i * 73856093) ^ (j * 19349663) ^ (k * 83492791))();

// ---------------------------------------------------------------------------------------------
// Atlas: region = sel 256 px (kolom, baris, lebar, tinggi). RW/RH = ukuran dunia satu region (m).
// tile: true -> muka besar dipecah agar tekstur berulang dengan kepadatan tetap.
// ---------------------------------------------------------------------------------------------
const R = {
    glassA:    { c: 0, r: 0, w: 2, h: 4, RW: 16, RH: 28.8, tile: true },
    glassB:    { c: 2, r: 0, w: 2, h: 4, RW: 16, RH: 28.8, tile: true },
    office:    { c: 4, r: 0, w: 2, h: 4, RW: 14, RH: 28.8, tile: true },
    apart:     { c: 6, r: 0, w: 2, h: 4, RW: 14, RH: 28.8, tile: true },
    villaF:    { c: 0, r: 4, w: 2, h: 1, RW: 10, RH: 6.6 },
    villaS:    { c: 2, r: 4, w: 1, h: 1, RW: 6, RH: 6.6, tile: true },
    gravel:    { c: 3, r: 4, w: 1, h: 1, RW: 8, RH: 8, tile: true },
    pool:      { c: 4, r: 4, w: 1, h: 1, RW: 8, RH: 4 },
    lawn:      { c: 5, r: 4, w: 1, h: 1, RW: 6, RH: 6, tile: true },
    paving:    { c: 6, r: 4, w: 1, h: 1, RW: 4, RH: 4, tile: true },
    hedge:     { c: 7, r: 4, w: 1, h: 1, RW: 3, RH: 1.6, tile: true },
    zincRust:  { c: 0, r: 5, w: 1, h: 1, RW: 4.4, RH: 4.4, tile: true },
    zincGrey:  { c: 1, r: 5, w: 1, h: 1, RW: 4.4, RH: 4.4, tile: true },
    brick:     { c: 2, r: 5, w: 1, h: 1, RW: 3.9, RH: 3, tile: true },
    plasterB:  { c: 3, r: 5, w: 1, h: 1, RW: 3.9, RH: 3, tile: true },
    plasterG:  { c: 4, r: 5, w: 1, h: 1, RW: 3.9, RH: 3, tile: true },
    plasterP:  { c: 5, r: 5, w: 1, h: 1, RW: 3.9, RH: 3, tile: true },
    plywood:   { c: 6, r: 5, w: 1, h: 1, RW: 3.9, RH: 3, tile: true },
    tarp:      { c: 7, r: 5, w: 1, h: 1, RW: 4.4, RH: 4.4, tile: true },
    frontP:    { c: 0, r: 6, w: 1, h: 1, RW: 3.4, RH: 2.7 },
    frontB:    { c: 1, r: 6, w: 1, h: 1, RW: 3.4, RH: 2.7 },
    frontW:    { c: 2, r: 6, w: 1, h: 1, RW: 3.4, RH: 2.7 },
    dirt:      { c: 3, r: 6, w: 1, h: 1, RW: 4, RH: 4, tile: true },
    solar:     { c: 5, r: 6, w: 1, h: 1, RW: 6, RH: 6 },
    lobby:     { c: 6, r: 6, w: 1, h: 1, RW: 8, RH: 5, tile: true },
    stone:     { c: 7, r: 6, w: 1, h: 1, RW: 3, RH: 1.8, tile: true },
};
const PAL_CELL = { c: 4, r: 6 };   // palet warna solid 8x8 sel @32 px
const COL = {
    tire: 0, pole: 1, wire: 2, drum: 3, toren: 4, woodD: 5, woodL: 6, rust: 7,
    carRed: 8, carYellow: 9, carBlack: 10, carWhite: 11, carSilver: 12, carBlue: 13, carGlass: 14, chrome: 15,
    cloth0: 16,                  // 16..23 pakaian
    stoneG: 24, concrete: 25, concreteD: 26, trashD: 27, trashM: 28, plasticG: 29, headlight: 30, white: 31,
    mech: 32, padDark: 33, beacon: 34, gold: 35, umbrella: 36, sunbed: 37, palm: 38, grassD: 39,
};
const PAL_HEX = [
    '#1b1b1d', '#6b6e70', '#151515', '#1f5fbf', '#e0802a', '#5a3d26', '#9b7650', '#7c4424',
    '#a8101a', '#e8b10f', '#101114', '#e9ecef', '#a9b0b6', '#1d3f8f', '#141a20', '#d0d4d8',
    '#d83a3a', '#f2c94c', '#2d9cdb', '#27ae60', '#f2f2f2', '#9b51e0', '#eb6aa0', '#333f5c',
    '#8a877f', '#b9b4ab', '#6f6c66', '#3a3530', '#6a5f4a', '#3c8d4f', '#fff6d8', '#f4f4f2',
    '#9a9c9e', '#2c2f33', '#ff3b30', '#c9a24a', '#f7f5ef', '#b48a5c', '#3f7a3a', '#406d2f',
];
const PAL_GLOW = { 30: '#fff2c4', 34: '#ff2a1a' };

// ---------------------------------------------------------------------------------------------
// Lukisan atlas
// ---------------------------------------------------------------------------------------------
function rect(reg) { return { x: reg.c * CELL, y: reg.r * CELL, w: reg.w * CELL, h: reg.h * CELL }; }

function noise(ctx, r, amp, seed, mono = true) {
    const img = ctx.getImageData(r.x, r.y, r.w, r.h), d = img.data, rnd = rng(seed);
    for (let k = 0; k < d.length; k += 4) {
        const n = (rnd() - 0.5) * amp;
        d[k] += n; d[k + 1] += mono ? n : (rnd() - 0.5) * amp; d[k + 2] += mono ? n : (rnd() - 0.5) * amp;
    }
    ctx.putImageData(img, r.x, r.y);
}

function blotches(ctx, r, n, colors, rMin, rMax, alpha, seed) {
    const rnd = rng(seed);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    for (let k = 0; k < n; k++) {
        const x = r.x + rnd() * r.w, y = r.y + rnd() * r.h, rr = rMin + rnd() * (rMax - rMin);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        const c = colors[Math.floor(rnd() * colors.length)];
        g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha * (0.5 + rnd() * 0.5);
        ctx.fillStyle = g;
        ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    ctx.restore();
}

function streaks(ctx, r, n, color, alpha, seed) {
    const rnd = rng(seed);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    for (let k = 0; k < n; k++) {
        const x = r.x + rnd() * r.w, y = r.y + rnd() * r.h * 0.6, len = r.h * (0.15 + rnd() * 0.5);
        const g = ctx.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = alpha * (0.4 + rnd() * 0.6);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 1 + rnd() * 3, len);
    }
    ctx.restore();
}

function vgrad(ctx, r, stops) {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    stops.forEach(([t, c]) => g.addColorStop(t, c));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** Dinding kaca menara: 4 bay x 8 lantai. e = konteks emissive. */
function paintCurtain(ctx, e, reg, look, seed) {
    const r = rect(reg), rnd = rng(seed);
    const bays = 4, floors = 8, bw = r.w / bays, fh = r.h / floors;
    vgrad(ctx, r, look.sky);
    // pantulan awan / gedung seberang: pita diagonal terang & gelap
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    for (let k = 0; k < 14; k++) {
        const x = r.x + rnd() * r.w * 1.6 - r.w * 0.3, wdt = 20 + rnd() * 90;
        ctx.globalAlpha = 0.05 + rnd() * 0.09;
        ctx.fillStyle = rnd() < 0.6 ? '#ffffff' : '#0b1418';
        ctx.beginPath();
        ctx.moveTo(x, r.y); ctx.lineTo(x + wdt, r.y); ctx.lineTo(x + wdt - r.h * 0.35, r.y + r.h); ctx.lineTo(x - r.h * 0.35, r.y + r.h);
        ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // variasi panel + kusen
    for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
            for (let s = 0; s < 2; s++) {
                const x = r.x + b * bw + s * bw / 2, y = r.y + f * fh;
                ctx.globalAlpha = rnd() * 0.12;
                ctx.fillStyle = rnd() < 0.5 ? '#ffffff' : '#000000';
                ctx.fillRect(x, y, bw / 2, fh);
                // emissive: jendela menyala (lampu kantor / apartemen)
                const lit = rnd();
                if (lit < look.lit) {
                    const warm = rnd() < look.warm;
                    e.globalAlpha = 0.45 + rnd() * 0.55;
                    e.fillStyle = warm ? '#ffcf8a' : '#dcecff';
                    const blind = rnd() < 0.3 ? fh * (0.2 + rnd() * 0.5) : 0;
                    e.fillRect(x + 1, y + fh * 0.18 + blind, bw / 2 - 2, fh * 0.82 - blind - 1);
                }
            }
        }
    }
    ctx.globalAlpha = 1; e.globalAlpha = 1;
    // spandrel lantai + mullion
    ctx.fillStyle = look.frame;
    for (let f = 0; f < floors; f++) ctx.fillRect(r.x, r.y + f * fh, r.w, fh * 0.16);
    for (let b = 0; b <= bays; b++) ctx.fillRect(r.x + b * bw - 3, r.y, 6, r.h);
    ctx.globalAlpha = 0.6;
    for (let b = 0; b < bays; b++) ctx.fillRect(r.x + b * bw + bw / 2 - 1, r.y, 2, r.h);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff';
    for (let f = 0; f < floors; f++) ctx.fillRect(r.x, r.y + f * fh + fh * 0.16, r.w, 2);
    ctx.globalAlpha = 1;
}

/** Fasad beton dengan jendela berlubang (kantor) atau balkon (apartemen). */
function paintPunched(ctx, e, reg, kind, seed) {
    const r = rect(reg), rnd = rng(seed);
    const bays = 4, floors = 8, bw = r.w / bays, fh = r.h / floors;
    ctx.fillStyle = kind === 'office' ? '#cfcac1' : '#e4dccf';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    noise(ctx, r, 14, seed + 1);
    streaks(ctx, r, 60, 'rgba(60,55,50,0.9)', 0.12, seed + 2);
    for (let f = 0; f < floors; f++) {
        for (let b = 0; b < bays; b++) {
            const x0 = r.x + b * bw, y0 = r.y + f * fh;
            const wx0 = x0 + bw * (kind === 'office' ? 0.12 : 0.18), ww = bw * (kind === 'office' ? 0.76 : 0.64);
            const wy0 = y0 + fh * 0.22, wh = fh * (kind === 'office' ? 0.56 : 0.5);
            const g = ctx.createLinearGradient(0, wy0, 0, wy0 + wh);
            g.addColorStop(0, '#7f97a6'); g.addColorStop(1, '#2a3740');
            ctx.fillStyle = g; ctx.fillRect(wx0, wy0, ww, wh);
            ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(wx0, wy0, ww * 0.35, wh);
            ctx.fillStyle = '#3a3d40'; ctx.fillRect(wx0 + ww / 2 - 1, wy0, 2, wh);
            if (rnd() < 0.62) {
                e.globalAlpha = 0.5 + rnd() * 0.5;
                e.fillStyle = rnd() < 0.7 ? '#ffd39a' : '#e2eeff';
                e.fillRect(wx0 + 2, wy0 + 2, ww - 4, wh - 4);
                e.globalAlpha = 1;
            }
            if (kind === 'apart') {
                // pelat balkon + pagar kaca + unit AC
                ctx.fillStyle = '#f3efe8'; ctx.fillRect(x0 + bw * 0.08, y0 + fh * 0.74, bw * 0.84, fh * 0.07);
                ctx.fillStyle = 'rgba(160,190,200,0.55)'; ctx.fillRect(x0 + bw * 0.08, y0 + fh * 0.58, bw * 0.84, fh * 0.16);
                ctx.fillStyle = '#9a9a96'; ctx.fillRect(x0 + bw * 0.08, y0 + fh * 0.58, bw * 0.84, 2);
                if (rnd() < 0.5) { ctx.fillStyle = '#d6d6d2'; ctx.fillRect(x0 + bw * 0.75, y0 + fh * 0.64, bw * 0.12, fh * 0.09); }
            } else {
                ctx.fillStyle = '#b3ada3'; ctx.fillRect(wx0 - 2, wy0 + wh, ww + 4, 4);
            }
        }
    }
}

function paintAtlas() {
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = ATLAS; return c; };
    const cv = mk(), ev = mk();
    const ctx = cv.getContext('2d'), e = ev.getContext('2d');
    ctx.fillStyle = '#888'; ctx.fillRect(0, 0, ATLAS, ATLAS);
    e.fillStyle = '#000'; e.fillRect(0, 0, ATLAS, ATLAS);

    // --- Have: menara & gedung ---
    paintCurtain(ctx, e, R.glassA, { sky: [[0, '#cfe3ee'], [0.35, '#7fa9c0'], [0.7, '#3f6a82'], [1, '#22404f']], frame: '#1c2830', lit: 0.55, warm: 0.45 }, 11);
    paintCurtain(ctx, e, R.glassB, { sky: [[0, '#b9b2a6'], [0.4, '#6e655a'], [0.75, '#3a332d'], [1, '#1b1714']], frame: '#141210', lit: 0.5, warm: 0.7 }, 12);
    paintPunched(ctx, e, R.office, 'office', 13);
    paintPunched(ctx, e, R.apart, 'apart', 14);

    // Lobi kaca lantai dasar
    {
        const r = rect(R.lobby);
        vgrad(ctx, r, [[0, '#2a3238'], [0.12, '#2a3238'], [0.13, '#a9c3cf'], [1, '#3d5662']]);
        ctx.fillStyle = '#20262a';
        for (let k = 0; k <= 6; k++) ctx.fillRect(r.x + k * r.w / 6 - 2, r.y, 4, r.h);
        e.fillStyle = '#ffe2b0'; e.globalAlpha = 0.85; e.fillRect(r.x, r.y + r.h * 0.14, r.w, r.h * 0.86); e.globalAlpha = 1;
        e.fillStyle = '#000'; for (let k = 0; k <= 6; k++) e.fillRect(r.x + k * r.w / 6 - 2, r.y, 4, r.h);
    }

    // Vila: fasad depan 2 lantai (kaca setinggi plafon + kisi kayu)
    {
        const r = rect(R.villaF);
        ctx.fillStyle = '#f2f0eb'; ctx.fillRect(r.x, r.y, r.w, r.h);
        noise(ctx, r, 8, 21);
        // lantai bawah: kaca geser
        const g = ctx.createLinearGradient(0, r.y + r.h * 0.55, 0, r.y + r.h);
        g.addColorStop(0, '#9fb9c4'); g.addColorStop(1, '#2f424b');
        ctx.fillStyle = g; ctx.fillRect(r.x + r.w * 0.05, r.y + r.h * 0.56, r.w * 0.62, r.h * 0.42);
        ctx.fillStyle = '#2a2a2a';
        for (let k = 0; k <= 4; k++) ctx.fillRect(r.x + r.w * 0.05 + k * r.w * 0.155 - 1, r.y + r.h * 0.56, 3, r.h * 0.42);
        // kisi kayu vertikal
        for (let k = 0; k < 22; k++) {
            ctx.fillStyle = k % 2 ? '#8d5f3a' : '#a7744a';
            ctx.fillRect(r.x + r.w * 0.72 + k * 6, r.y + r.h * 0.08, 5, r.h * 0.9);
        }
        // lantai atas: jendela pita
        const g2 = ctx.createLinearGradient(0, r.y + r.h * 0.12, 0, r.y + r.h * 0.4);
        g2.addColorStop(0, '#b8cfd8'); g2.addColorStop(1, '#3a4f59');
        ctx.fillStyle = g2; ctx.fillRect(r.x + r.w * 0.1, r.y + r.h * 0.12, r.w * 0.55, r.h * 0.28);
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(r.x, r.y + r.h * 0.47, r.w, 5);
        e.fillStyle = '#ffd59c';
        e.globalAlpha = 0.95; e.fillRect(r.x + r.w * 0.05, r.y + r.h * 0.56, r.w * 0.62, r.h * 0.42);
        e.globalAlpha = 0.7; e.fillRect(r.x + r.w * 0.1, r.y + r.h * 0.12, r.w * 0.55, r.h * 0.28);
        e.globalAlpha = 1;
    }
    {
        const r = rect(R.villaS);
        ctx.fillStyle = '#eceae4'; ctx.fillRect(r.x, r.y, r.w, r.h);
        noise(ctx, r, 8, 22);
        ctx.fillStyle = '#34444c'; ctx.fillRect(r.x + r.w * 0.4, r.y + r.h * 0.12, r.w * 0.12, r.h * 0.7);
        for (let k = 0; k < 10; k++) { ctx.fillStyle = k % 2 ? '#8d5f3a' : '#a7744a'; ctx.fillRect(r.x + r.w * 0.68 + k * 6, r.y, 5, r.h); }
        e.fillStyle = '#ffd59c'; e.globalAlpha = 0.6; e.fillRect(r.x + r.w * 0.4, r.y + r.h * 0.12, r.w * 0.12, r.h * 0.7); e.globalAlpha = 1;
    }
    { const r = rect(R.gravel); ctx.fillStyle = '#8f8e89'; ctx.fillRect(r.x, r.y, r.w, r.h); noise(ctx, r, 40, 23); }
    {
        const r = rect(R.solar);
        ctx.fillStyle = '#e6e4df'; ctx.fillRect(r.x, r.y, r.w, r.h); noise(ctx, r, 10, 24);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
            const x = r.x + 18 + a * 78, y = r.y + 30 + b * 105;
            ctx.fillStyle = '#1d2b4d'; ctx.fillRect(x, y, 70, 92);
            ctx.strokeStyle = '#5a6f9a'; ctx.lineWidth = 1;
            for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * 17.5, y); ctx.lineTo(x + k * 17.5, y + 92); ctx.stroke(); }
            for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x, y + k * 15.3); ctx.lineTo(x + 70, y + k * 15.3); ctx.stroke(); }
        }
    }
    {
        const r = rect(R.pool);
        ctx.fillStyle = '#e9f2f3'; ctx.fillRect(r.x, r.y, r.w, r.h);
        const ix = r.x + 14, iy = r.y + 14, iw = r.w - 28, ih = r.h - 28;
        const g = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
        g.addColorStop(0, '#5fd3e0'); g.addColorStop(1, '#1d8fb3');
        ctx.fillStyle = g; ctx.fillRect(ix, iy, iw, ih);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        const rnd = rng(25);
        for (let k = 0; k < 26; k++) {
            ctx.beginPath();
            let x = ix + rnd() * iw, y = iy + rnd() * ih;
            ctx.moveTo(x, y);
            for (let s = 0; s < 4; s++) { x += (rnd() - 0.3) * 30; y += (rnd() - 0.5) * 20; ctx.lineTo(Math.min(ix + iw, Math.max(ix, x)), Math.min(iy + ih, Math.max(iy, y))); }
            ctx.stroke();
        }
        e.fillStyle = '#2bbfe8'; e.globalAlpha = 0.75; e.fillRect(ix, iy, iw, ih); e.globalAlpha = 1;
    }
    {
        const r = rect(R.lawn);
        for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#5d9a3c' : '#6aa847'; ctx.fillRect(r.x + k * r.w / 8, r.y, r.w / 8, r.h); }
        noise(ctx, r, 18, 26, false);
    }
    {
        const r = rect(R.paving);
        ctx.fillStyle = '#d8d3c9'; ctx.fillRect(r.x, r.y, r.w, r.h); noise(ctx, r, 12, 27);
        ctx.fillStyle = '#b5ad9f';
        for (let k = 0; k <= 4; k++) { ctx.fillRect(r.x + k * r.w / 4 - 1, r.y, 2, r.h); ctx.fillRect(r.x, r.y + k * r.h / 4 - 1, r.w, 2); }
    }
    {
        const r = rect(R.hedge);
        ctx.fillStyle = '#2f5a28'; ctx.fillRect(r.x, r.y, r.w, r.h);
        blotches(ctx, r, 220, ['#47803a', '#244a20', '#5b9446'], 6, 16, 0.7, 28);
    }
    {
        const r = rect(R.stone);
        const rnd = rng(29);
        for (let y = 0; y < r.h; y += 21) {
            let x = -rnd() * 60;
            while (x < r.w) {
                const w = 40 + rnd() * 70, v = Math.floor(80 + rnd() * 40);
                ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
                ctx.fillRect(r.x + Math.max(0, x), r.y + y, Math.min(w, r.w - Math.max(0, x)) - 2, 19);
                x += w;
            }
        }
        noise(ctx, r, 16, 30);
    }

    // --- Have-Not: bahan bangunan murah ---
    const zinc = (reg, base, rustAmt, seed) => {
        const r = rect(reg), rnd = rng(seed);
        // lembaran seng: 3 baris x 2 kolom dengan tingkat karat berbeda
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 2; sx++) {
            const x = r.x + sx * r.w / 2, y = r.y + sy * r.h / 3, w = r.w / 2, h = r.h / 3;
            const v = rnd() * 30 - 15;
            ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
            ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 150})`;
            ctx.fillRect(x, y, w, h);
        }
        // gelombang
        for (let x = 0; x < r.w; x += 8) {
            const g = ctx.createLinearGradient(r.x + x, 0, r.x + x + 8, 0);
            g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
            ctx.fillStyle = g; ctx.fillRect(r.x + x, r.y, 8, r.h);
        }
        blotches(ctx, r, Math.round(90 * rustAmt), ['#8b4a22', '#a5582a', '#5e2f16', '#b06a33'], 5, 26, 0.85, seed + 1);
        streaks(ctx, r, Math.round(80 * rustAmt), 'rgba(110,52,22,1)', 0.5, seed + 2);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (let sy = 1; sy < 3; sy++) ctx.fillRect(r.x, r.y + sy * r.h / 3 - 1, r.w, 3);
        ctx.fillRect(r.x + r.w / 2 - 1, r.y, 2, r.h);
        noise(ctx, r, 18, seed + 3);
    };
    zinc(R.zincRust, '#8d857b', 1, 31);
    zinc(R.zincGrey, '#a8adb1', 0.25, 32);
    {
        const r = rect(R.brick), rnd = rng(33);
        ctx.fillStyle = '#a99c8a'; ctx.fillRect(r.x, r.y, r.w, r.h);
        const bh = 16, bw = 38;
        for (let y = 0, row = 0; y < r.h; y += bh, row++) {
            for (let x = (row % 2) * -bw / 2; x < r.w; x += bw) {
                const v = rnd();
                ctx.fillStyle = `rgb(${150 + v * 50 | 0},${70 + v * 25 | 0},${45 + v * 15 | 0})`;
                ctx.fillRect(r.x + Math.max(0, x) + 1, r.y + y + 1, Math.min(bw - 3, r.w - Math.max(0, x) - 1), bh - 3);
            }
        }
        blotches(ctx, r, 10, ['#bdb2a1', '#9d968a'], 15, 45, 0.8, 34);   // tambalan semen
        noise(ctx, r, 20, 35);
        vgrad(ctx, { x: r.x, y: r.y + r.h * 0.75, w: r.w, h: r.h * 0.25 }, [[0, 'rgba(40,50,30,0)'], [1, 'rgba(40,50,30,0.45)']]);
    }
    const plaster = (reg, base, seed) => {
        const r = rect(reg);
        ctx.fillStyle = base; ctx.fillRect(r.x, r.y, r.w, r.h);
        noise(ctx, r, 22, seed);
        blotches(ctx, r, 9, ['#b05a3a', '#9c8d7c'], 10, 30, 0.75, seed + 1);     // plester mengelupas
        streaks(ctx, r, 70, 'rgba(50,45,35,1)', 0.25, seed + 2);
        const g = ctx.createLinearGradient(0, r.y + r.h * 0.55, 0, r.y + r.h);
        g.addColorStop(0, 'rgba(45,60,30,0)'); g.addColorStop(1, 'rgba(45,60,30,0.6)');   // lumut lembap
        ctx.fillStyle = g; ctx.fillRect(r.x, r.y + r.h * 0.55, r.w, r.h * 0.45);
    };
    plaster(R.plasterB, '#8fa6ad', 36);
    plaster(R.plasterG, '#9fae8a', 39);
    plaster(R.plasterP, '#c9a39a', 42);
    {
        const r = rect(R.plywood), rnd = rng(45);
        ctx.fillStyle = '#a98657'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(80,50,25,0.35)';
        for (let k = 0; k < 60; k++) {
            ctx.lineWidth = 1 + rnd() * 2;
            ctx.beginPath(); const y = r.y + rnd() * r.h;
            ctx.moveTo(r.x, y); ctx.bezierCurveTo(r.x + r.w * 0.3, y + (rnd() - 0.5) * 20, r.x + r.w * 0.7, y + (rnd() - 0.5) * 20, r.x + r.w, y + (rnd() - 0.5) * 10);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(30,20,10,0.6)'; ctx.fillRect(r.x + r.w / 2 - 2, r.y, 4, r.h);
        blotches(ctx, r, 18, ['#4a3a28', '#6b5a43'], 10, 40, 0.5, 46);
        vgrad(ctx, { x: r.x, y: r.y + r.h * 0.6, w: r.w, h: r.h * 0.4 }, [[0, 'rgba(20,15,10,0)'], [1, 'rgba(20,15,10,0.55)']]);
        noise(ctx, r, 14, 47);
    }
    {
        const r = rect(R.tarp), rnd = rng(48);
        ctx.fillStyle = '#2d62b5'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        for (let k = 0; k < 18; k++) {
            ctx.globalAlpha = 0.1 + rnd() * 0.15; ctx.fillStyle = rnd() < 0.5 ? '#ffffff' : '#000000';
            const x = r.x + rnd() * r.w; ctx.beginPath();
            ctx.moveTo(x, r.y); ctx.lineTo(x + 14, r.y); ctx.lineTo(x + 50, r.y + r.h); ctx.lineTo(x + 36, r.y + r.h); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = 1;
        blotches(ctx, r, 20, ['#3b3a32', '#585345'], 8, 30, 0.45, 49);
        noise(ctx, r, 12, 50);
    }
    // muka depan gubuk: dinding + pintu + jendela berteralis
    const front = (reg, wallReg, door, lit, seed) => {
        const r = rect(reg), w = rect(wallReg);
        ctx.drawImage(cv, w.x, w.y, w.w, w.h, r.x, r.y, r.w, r.h);
        const dx = r.x + r.w * 0.12, dy = r.y + r.h * 0.22, dw = r.w * 0.26, dh = r.h * 0.78;
        ctx.fillStyle = door; ctx.fillRect(dx, dy, dw, dh);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(dx + dw * 0.1, dy + dh * 0.08, dw * 0.8, dh * 0.38); ctx.fillRect(dx + dw * 0.1, dy + dh * 0.54, dw * 0.8, dh * 0.38);
        ctx.fillStyle = '#d8c48a'; ctx.fillRect(dx + dw * 0.8, dy + dh * 0.5, 4, 4);
        const wx0 = r.x + r.w * 0.52, wy0 = r.y + r.h * 0.3, ww = r.w * 0.34, wh = r.h * 0.3;
        ctx.fillStyle = '#5b4632'; ctx.fillRect(wx0 - 4, wy0 - 4, ww + 8, wh + 8);
        ctx.fillStyle = '#16191b'; ctx.fillRect(wx0, wy0, ww, wh);
        ctx.fillStyle = 'rgba(200,190,170,0.25)'; ctx.fillRect(wx0, wy0, ww * 0.5, wh);     // gorden lusuh
        ctx.fillStyle = '#2b2b2b'; for (let k = 1; k < 6; k++) ctx.fillRect(wx0 + k * ww / 6 - 1, wy0, 2, wh);
        if (lit) {
            e.fillStyle = '#ffab4a'; e.globalAlpha = 0.75; e.fillRect(wx0, wy0, ww, wh);
            e.globalAlpha = 0.35; e.fillRect(dx + dw * 0.1, dy + dh * 0.08, dw * 0.8, 3);
            e.globalAlpha = 1; e.fillStyle = '#000'; for (let k = 1; k < 6; k++) e.fillRect(wx0 + k * ww / 6 - 1, wy0, 2, wh);
        }
        noise(ctx, r, 8, seed);
    };
    front(R.frontP, R.plasterB, '#2f6f6a', true, 51);
    front(R.frontB, R.brick, '#6b4a2e', true, 52);
    front(R.frontW, R.plywood, '#4b3a2a', false, 53);
    {
        const r = rect(R.dirt);
        ctx.fillStyle = '#7a634a'; ctx.fillRect(r.x, r.y, r.w, r.h);
        blotches(ctx, r, 40, ['#5d4a36', '#8d7659', '#4c4a3e'], 10, 40, 0.6, 54);
        noise(ctx, r, 26, 55);
    }
    // palet solid
    PAL_HEX.forEach((hex, k) => {
        const x = PAL_CELL.c * CELL + (k % 8) * 32, y = PAL_CELL.r * CELL + Math.floor(k / 8) * 32;
        ctx.fillStyle = hex; ctx.fillRect(x, y, 32, 32);
        if (PAL_GLOW[k]) { e.fillStyle = PAL_GLOW[k]; e.fillRect(x, y, 32, 32); }
    });
    return { cv, ev };
}

// ---------------------------------------------------------------------------------------------
// Penyusun geometri (non-indexed; frame lokal = pusat tapak + rotasi hadap)
// ---------------------------------------------------------------------------------------------
const INSET = 3 / ATLAS;

class Builder {
    constructor() { this.p = []; this.n = []; this.uv = []; this.frame(0, 0, 0, 0); }
    get count() { return this.p.length / 3; }
    frame(ox, oy, oz, rot) { this.ox = ox; this.oy = oy; this.oz = oz; this.cs = Math.cos(rot); this.sn = Math.sin(rot); }
    w(lx, ly, lz) { return [this.ox + lx * this.cs + lz * this.sn, this.oy + ly, this.oz - lx * this.sn + lz * this.cs]; }

    /** UV atlas untuk region (atau warna solid) pada koordinat region s,t ∈ [0,1] (t = 0 bawah). */
    static uvOf(mat, s, t) {
        if (typeof mat === 'number') {
            const u = (PAL_CELL.c * CELL + (mat % 8) * 32 + 16) / ATLAS, v = 1 - (PAL_CELL.r * CELL + Math.floor(mat / 8) * 32 + 16) / ATLAS;
            return [u, v];
        }
        const r = R[mat];
        const u0 = r.c * CELL / ATLAS + INSET, u1 = (r.c + r.w) * CELL / ATLAS - INSET;
        const vTop = 1 - r.r * CELL / ATLAS - INSET, vBot = 1 - (r.r + r.h) * CELL / ATLAS + INSET;
        return [u0 + (u1 - u0) * s, vBot + (vTop - vBot) * t];
    }

    /** Segitiga dunia dengan UV. Arah hadap dipastikan searah `hint` (dunia). */
    tri3(a, b, c, ua, ub, uc, hint) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; nx = -nx; ny = -ny; nz = -nz; }
        for (const [p, uv] of [[a, ua], [b, ub], [c, uc]]) { this.p.push(p[0], p[1], p[2]); this.n.push(nx, ny, nz); this.uv.push(uv[0], uv[1]); }
    }

    /** Quad lokal BL,BR,TR,TL (berlawanan jarum jam dari luar). mat region -> dipecah sesuai RW/RH. */
    quad(bl, br, tr, tl, mat, hintLocal, sizeW = 1, sizeH = 1) {
        const hint = [hintLocal[0] * this.cs + hintLocal[2] * this.sn, hintLocal[1], -hintLocal[0] * this.sn + hintLocal[2] * this.cs];
        const reg = typeof mat === 'string' ? R[mat] : null;
        let nx = 1, ny = 1, su = 1, sv = 1;
        if (reg && reg.tile) {
            nx = Math.max(1, Math.ceil(sizeW / reg.RW - 0.08)); ny = Math.max(1, Math.ceil(sizeH / reg.RH - 0.08));
            su = sizeW / (nx * reg.RW); sv = sizeH / (ny * reg.RH);
            su = Math.min(1, su); sv = Math.min(1, sv);
        } else if (reg) {
            su = Math.min(1, sizeW / reg.RW); sv = Math.min(1, sizeH / reg.RH);
        }
        const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const P = (s, t) => lerp(lerp(bl, br, s), lerp(tl, tr, s), t);
        for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
            const s0 = a / nx, s1 = (a + 1) / nx, t0 = b / ny, t1 = (b + 1) / ny;
            const q = [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)].map(p => this.w(p[0], p[1], p[2]));
            // sub-quad terakhir pada sumbu yang tidak penuh memakai bagian region
            const uvs = [[0, 0], [su, 0], [su, sv], [0, sv]].map(([s, t]) => Builder.uvOf(mat, s, t));
            this.tri3(q[0], q[1], q[2], uvs[0], uvs[1], uvs[2], hint);
            this.tri3(q[0], q[2], q[3], uvs[0], uvs[2], uvs[3], hint);
        }
    }

    /**
     * Kotak lokal: pusat (cx, cz), alas y0, ukuran w (x) d (z) h.
     * m: { pz, nz, px, nx, top, bot } -> region / warna; side = default semua sisi.
     */
    box(cx, y0, cz, w, h, d, m) {
        const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
        const side = m.side;
        const f = (k) => (m[k] !== undefined ? m[k] : side);
        if (f('pz') !== null && f('pz') !== undefined) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], f('pz'), [0, 0, 1], w, h);
        if (f('nz') !== null && f('nz') !== undefined) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], f('nz'), [0, 0, -1], w, h);
        if (f('px') !== null && f('px') !== undefined) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], f('px'), [1, 0, 0], d, h);
        if (f('nx') !== null && f('nx') !== undefined) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], f('nx'), [-1, 0, 0], d, h);
        if (m.top !== null && m.top !== undefined) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], m.top, [0, 1, 0], w, d);
        if (m.bot !== null && m.bot !== undefined) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], m.bot, [0, -1, 0], w, d);
    }

    /** Pelat miring (atap pelana tunggal): turun ke arah -z lokal; yLo di z0, yHi di z1. */
    slope(x0, x1, z0, z1, yLo, yHi, th, top, edge) {
        const run = Math.hypot(z1 - z0, yHi - yLo);
        this.quad([x0, yLo + th, z0], [x1, yLo + th, z0], [x1, yHi + th, z1], [x0, yHi + th, z1], top, [0, 1, 0], x1 - x0, run);
        this.quad([x1, yLo, z0], [x0, yLo, z0], [x0, yLo + th, z0], [x1, yLo + th, z0], edge, [0, 0, -1]);
        this.quad([x0, yHi, z1], [x1, yHi, z1], [x1, yHi + th, z1], [x0, yHi + th, z1], edge, [0, 0, 1]);
    }

    /** Silinder low-poly warna solid. axis 'y' (tegak) atau 'x' (rebah, roda). */
    cyl(cx, cy, cz, r, h, seg, col, axis = 'y') {
        const pt = (a, t) => {
            const c = Math.cos(a) * r, s = Math.sin(a) * r;
            return axis === 'y' ? [cx + c, cy + t, cz + s] : [cx + t - h / 2, cy + s, cz + c];
        };
        const up = axis === 'y' ? [0, 1, 0] : [1, 0, 0];
        const uv = Builder.uvOf(col, 0, 0);
        const W = p => this.w(p[0], p[1], p[2]);
        const wd = v => [v[0] * this.cs + v[2] * this.sn, v[1], -v[0] * this.sn + v[2] * this.cs];
        const lo = axis === 'y' ? 0 : 0, hi = h;
        const cTop = axis === 'y' ? [cx, cy + hi, cz] : [cx + h / 2, cy, cz], cBot = axis === 'y' ? [cx, cy + lo, cz] : [cx - h / 2, cy, cz];
        for (let k = 0; k < seg; k++) {
            const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
            const b0 = pt(a0, lo), b1 = pt(a1, lo), t0 = pt(a1, hi), t1 = pt(a0, hi);
            const mid = (a0 + a1) / 2;
            const out = axis === 'y' ? [Math.cos(mid), 0, Math.sin(mid)] : [0, Math.sin(mid), Math.cos(mid)];
            this.tri3(W(b0), W(b1), W(t0), uv, uv, uv, wd(out));
            this.tri3(W(b0), W(t0), W(t1), uv, uv, uv, wd(out));
            this.tri3(W(cTop), W(t1), W(t0), uv, uv, uv, wd(up));
            if (axis !== 'y') this.tri3(W(cBot), W(b0), W(b1), uv, uv, uv, wd(up.map(v => -v)));
        }
    }

    /** Batang tipis antara dua titik lokal (kabel, tali jemuran, tiang miring). */
    beam(a, b, t, col) {
        const A = this.w(...a), B = this.w(...b);
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        const L = Math.hypot(...d) || 1;
        const dir = d.map(v => v / L);
        let ref = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const u = [dir[1] * ref[2] - dir[2] * ref[1], dir[2] * ref[0] - dir[0] * ref[2], dir[0] * ref[1] - dir[1] * ref[0]];
        const ul = Math.hypot(...u); u.forEach((v, k) => (u[k] = v / ul * t / 2));
        const v2 = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
        const uv = Builder.uvOf(col, 0, 0);
        const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
        const k1 = [-u[0] * 0.5 + v2[0] * 0.87, -u[1] * 0.5 + v2[1] * 0.87, -u[2] * 0.5 + v2[2] * 0.87];
        const k2 = [-u[0] * 0.5 - v2[0] * 0.87, -u[1] * 0.5 - v2[1] * 0.87, -u[2] * 0.5 - v2[2] * 0.87];
        const sides = [[u, k1], [k1, k2], [k2, u]];
        for (const [s0, s1] of sides) {
            const p0 = add(A, s0), p1 = add(A, s1), p2 = add(B, s1), p3 = add(B, s0);
            const out = add(s0, s1);
            this.tri3(p0, p1, p2, uv, uv, uv, out);
            this.tri3(p0, p2, p3, uv, uv, uv, out);
        }
    }

    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
        g.computeBoundingSphere();
        g.computeBoundingBox();
        return g;
    }
}

const ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];   // facing 0 S(+z), 1 E(+x), 2 N(-z), 3 W(-x)

// ---------------------------------------------------------------------------------------------
// Desa Have
// ---------------------------------------------------------------------------------------------
function tower(B, rnd, H, glass) {
    const pod = 3 + Math.floor(rnd() * 2);       // lantai podium
    const podH = pod * 4.2;
    B.box(0, 0, 0, 14.6, 5, 14.6, { side: 'lobby', top: null });
    B.box(0, 5, 0, 14.6, podH - 5, 14.6, { side: 'office', top: 'gravel' });
    const sw = 10.5 + rnd() * 2.2, sd = 10.5 + rnd() * 2.2;
    const setback = rnd() < 0.45;
    const h1 = setback ? H * (0.62 + rnd() * 0.12) : H;
    B.box(0, podH, 0, sw, h1 - podH, sd, { side: glass, top: 'gravel' });
    let topY = h1, tw = sw, td = sd;
    if (setback) {
        tw = sw * 0.72; td = sd * 0.72;
        B.box(0, h1, 0, tw, H - h1, td, { side: glass, top: 'gravel' });
        topY = H;
    }
    // mahkota mekanikal + helipad / antena
    B.box(0, topY, 0, tw * 0.55, 3.2, td * 0.55, { side: COL.mech, top: COL.concreteD });
    if (H > 105) {
        B.cyl(0, topY + 3.2, 0, 0.35, 14 + rnd() * 10, 5, COL.chrome);
        B.box(0, topY + 3.2 + 14, 0, 0.5, 0.5, 0.5, { side: COL.beacon, top: COL.beacon });
    } else if (rnd() < 0.5) {
        B.box(tw * 0.18, topY, td * 0.18, tw * 0.35, 0.25, td * 0.35, { side: COL.padDark, top: COL.padDark });
    }
}

function midrise(B, rnd, floors) {
    const H = floors * 3.6, mat = rnd() < 0.5 ? 'office' : 'apart';
    const w = 6.6, d = 6.6;
    B.box(0, 0, 0, w, 3.8, d, { side: 'lobby', top: null });
    B.box(0, 3.8, 0, w, H - 3.8, d, { side: mat, top: 'gravel' });
    B.box(-1.2, H, -1, 2.2, 1.6, 2, { side: COL.mech, top: COL.concreteD });
    B.cyl(1.6, H, 1.4, 0.7, 1.8, 7, COL.concrete);    // tangki air atap
}

function condo(B, rnd, H) {
    B.box(0, 0, 0, 14.6, 4.2, 14.6, { side: 'lobby', top: 'paving' });
    const glass = rnd() < 0.5 ? 'apart' : 'glassA';
    B.box(-3.4, 4.2, 0, 6.4, H - 4.2, 12, { side: glass, top: 'gravel' });
    B.box(3.8, 4.2, -2.6, 5.4, H * 0.78 - 4.2, 6.6, { side: glass, top: 'gravel' });
    // kolam renang atap podium
    B.box(3.8, 4.2, 4.2, 5.6, 0.06, 4.4, { side: COL.white, top: 'pool' });
    B.box(-3.4, H, 0, 3, 2.6, 4, { side: COL.mech, top: COL.concreteD });
}

function sportsCar(B, x, z, rot, col) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const save = { ox: B.ox, oy: B.oy, oz: B.oz, cs: B.cs, sn: B.sn };
    // komposisi frame: lokal mobil -> lokal tapak -> dunia
    const wxp = save.ox + x * save.cs + z * save.sn, wzp = save.oz - x * save.sn + z * save.cs;
    const rr = Math.atan2(save.sn, save.cs) + rot;
    B.frame(wxp, save.oy, wzp, rr);
    B.box(0, 0.28, 0, 1.9, 0.5, 4.4, { side: col, top: col });
    B.box(0, 0.78, -0.25, 1.55, 0.42, 1.9, { side: COL.carGlass, top: col });
    B.box(-0.6, 0.55, 2.2, 0.35, 0.12, 0.02, { side: COL.headlight });
    B.box(0.6, 0.55, 2.2, 0.35, 0.12, 0.02, { side: COL.headlight });
    for (const [wx2, wz2] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) B.cyl(wx2, 0.32, wz2, 0.32, 0.26, 8, COL.tire, 'x');
    B.ox = save.ox; B.oy = save.oy; B.oz = save.oz; B.cs = save.cs; B.sn = save.sn;
    void cs; void sn;
}

const CAR_COLS = [COL.carRed, COL.carYellow, COL.carBlack, COL.carWhite, COL.carSilver, COL.carBlue];

/** Vila 16x16: tembok keliling + gerbang menghadap jalan (+z lokal), rumah 2 lantai, kolam, mobil. */
function villa(B, rnd) {
    const S = 7.7;
    B.box(0, 0, 0, 15.4, 0.08, 15.4, { side: COL.stoneG, top: 'lawn' });
    // tembok batu alam (celah gerbang 4 m di depan)
    const wh = 1.9, t = 0.3;
    B.box(0, 0, -S + t / 2, 15.4, wh, t, { side: 'stone', top: COL.concreteD });
    B.box(-S + t / 2, 0, 0, t, wh, 15.4, { side: 'stone', top: COL.concreteD });
    B.box(S - t / 2, 0, 0, t, wh, 15.4, { side: 'stone', top: COL.concreteD });
    B.box(-4.85, 0, S - t / 2, 5.7, wh, t, { side: 'stone', top: COL.concreteD });
    B.box(4.85, 0, S - t / 2, 5.7, wh, t, { side: 'stone', top: COL.concreteD });
    B.box(0, 0, S - t / 2, 4, 1.6, 0.08, { side: COL.carBlack });          // gerbang besi hitam
    // pagar tanaman dalam
    B.box(-S + 0.9, 0.08, -2, 0.7, 1.4, 9, { side: 'hedge', top: 'hedge' });
    // jalan masuk & carport
    B.box(0, 0.08, 4.8, 4, 0.04, 5.6, { side: COL.stoneG, top: 'paving' });
    // rumah: lantai dasar kaca + lantai atas kantilever
    const flip = rnd() < 0.5 ? -1 : 1;
    B.box(flip * 1.2, 0.08, -0.6, 10, 3.4, 6.4, { pz: 'villaF', side: 'villaS', top: COL.white });
    B.box(flip * -0.2, 3.48, -0.2, 11.2, 3.2, 6, { pz: 'villaF', side: 'villaS', top: 'solar' });
    B.box(flip * -0.2, 6.68, -0.2, 11.4, 0.22, 6.2, { side: COL.white, top: 'gravel' });   // lis atap
    // kolam renang + dek di belakang
    B.box(flip * 1.5, 0.08, -5.4, 9.5, 0.08, 3.6, { side: COL.stoneG, top: 'paving' });
    B.box(flip * 1.5, 0.16, -5.4, 7, 0.04, 2.6, { side: COL.white, top: 'pool' });
    for (let k = 0; k < 3; k++) B.box(flip * (-4.2) + k * 0.9, 0.16, -5.6, 0.6, 0.35, 1.8, { side: COL.sunbed, top: COL.umbrella });
    B.cyl(flip * 5.8, 0.16, -4.6, 0.05, 2.3, 4, COL.pole);
    B.cyl(flip * 5.8, 2.3, -4.6, 1.3, 0.12, 8, COL.umbrella);
    // mobil sport di carport + kadang mobil kedua
    sportsCar(B, -0.9, 4.9, 0, CAR_COLS[Math.floor(rnd() * CAR_COLS.length)]);
    if (rnd() < 0.55) sportsCar(B, 1.2, 4.6, 0.05, CAR_COLS[Math.floor(rnd() * CAR_COLS.length)]);
}

/** Rumah modern 1 petak (townhouse) dengan kolam mini & mobil. */
function townhouse(B, rnd) {
    B.box(0, 0, 0, 7.6, 0.08, 7.6, { side: COL.stoneG, top: 'lawn' });
    B.box(0, 0, -3.65, 7.6, 1.8, 0.3, { side: 'stone', top: COL.concreteD });
    B.box(-1, 0.08, -1, 5.4, 3.3, 4.2, { pz: 'villaF', side: 'villaS', top: COL.white });
    B.box(-0.6, 3.38, -1.1, 6, 3, 4, { pz: 'villaF', side: 'villaS', top: 'solar' });
    B.box(2.4, 0.08, 2.4, 2.2, 0.04, 2.6, { side: COL.stoneG, top: 'paving' });
    if (rnd() < 0.5) B.box(-2.2, 0.12, 2.5, 2.6, 0.04, 1.4, { side: COL.white, top: 'pool' });
    sportsCar(B, 2.3, 2.3, 0, CAR_COLS[Math.floor(rnd() * CAR_COLS.length)]);
}

// ---------------------------------------------------------------------------------------------
// Desa Have-Not
// ---------------------------------------------------------------------------------------------
const WALLS = ['brick', 'plasterB', 'plasterG', 'plasterP', 'plywood', 'brick', 'plywood'];
const FRONT_OF = { brick: 'frontB', plasterB: 'frontP', plasterG: 'frontP', plasterP: 'frontP', plywood: 'frontW' };

/** Gubuk: dinding w x d x h, atap seng pelana tunggal miring ke arah acak, ban penindih, antena. */
function shack(B, P, rnd, cx, cz, w, d, h, frontSide) {
    const wall = WALLS[Math.floor(rnd() * WALLS.length)];
    const m = { side: wall, top: null };
    m[frontSide] = FRONT_OF[wall];
    B.box(cx, 0, cz, w, h, d, m);
    // atap: miring searah z lokal, ditinggikan di sisi belakang
    const roofMat = rnd() < 0.62 ? 'zincRust' : rnd() < 0.7 ? 'zincGrey' : 'tarp';
    const ov = 0.25 + rnd() * 0.2, rise = 0.45 + rnd() * 0.35;
    const flipZ = rnd() < 0.5;
    const z0 = flipZ ? cz + d / 2 + ov : cz - d / 2 - ov, z1 = flipZ ? cz - d / 2 - ov : cz + d / 2 + ov;
    const x0 = cx - w / 2 - ov * 0.6, x1 = cx + w / 2 + ov * 0.6;
    const yLo = h - 0.05, yHi = h + rise;
    B.slope(x0, x1, Math.min(z0, z1), Math.max(z0, z1), flipZ ? yHi : yLo, flipZ ? yLo : yHi, 0.05, roofMat, COL.rust);
    // segitiga tebeng: isi celah di bawah atap miring (sisi x)
    if (rise > 0.1) {
        const zl = flipZ ? cz + d / 2 : cz - d / 2, zh = flipZ ? cz - d / 2 : cz + d / 2;
        const yh = h + rise * (d / (d + 2 * ov)) + rise * ov / (d + 2 * ov);
        for (const sx of [-1, 1]) {
            const x = cx + sx * w / 2;
            const a = B.w(x, h, zl), b = B.w(x, h, zh), c = B.w(x, yh, zh);
            const uv = Builder.uvOf(COL.woodD, 0, 0);
            const hint = [sx * B.cs, 0, -sx * B.sn];
            B.tri3(a, b, c, uv, uv, uv, hint);
        }
        // tebeng belakang (muka z tinggi)
        B.box(cx, h, zh, w, rise * 0.85, 0.04, { side: COL.woodD, top: null });
    }
    // terpal biru menambal sebagian atap
    if (roofMat !== 'tarp' && rnd() < 0.15) {
        const tw = w * (0.35 + rnd() * 0.3), tx = cx + (rnd() - 0.5) * (w - tw);
        const lo = Math.min(z0, z1), hi = Math.max(z0, z1), span = (hi - lo) * (0.4 + rnd() * 0.3), tz = lo + rnd() * (hi - lo - span);
        const yAt = z => (flipZ ? yHi + (yLo - yHi) * (z - lo) / (hi - lo) : yLo + (yHi - yLo) * (z - lo) / (hi - lo)) + 0.06;
        B.slope(tx - tw / 2, tx + tw / 2, tz, tz + span, yAt(tz), yAt(tz + span), 0.02, 'tarp', COL.drum);
    }
    // ban bekas penindih atap
    const tires = rnd() < 0.22 ? 1 : 0;
    const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    for (let k = 0; k < tires; k++) {
        const tz = lo + 0.4 + rnd() * (hi - lo - 0.8), tx = x0 + 0.4 + rnd() * (x1 - x0 - 0.8);
        const y = (flipZ ? yHi + (yLo - yHi) * (tz - lo) / (hi - lo) : yLo + (yHi - yLo) * (tz - lo) / (hi - lo)) + 0.05;
        P.cyl(tx, y, tz, 0.28, 0.15, 6, COL.tire);
    }
    // antena TV bambu
    if (rnd() < 0.3) {
        const ax = cx + (rnd() - 0.5) * w * 0.6, az = cz + (rnd() - 0.5) * d * 0.6;
        P.beam([ax, yHi, az], [ax + 0.1, yHi + 3.2, az], 0.06, COL.woodL);
        for (let k = 0; k < 3; k++) P.beam([ax - 0.6 + k * 0.1, yHi + 2.6 + k * 0.25, az], [ax + 0.7 - k * 0.1, yHi + 2.6 + k * 0.25, az], 0.03, COL.pole);
    }
    return { roofY: yHi, wall };
}

function laundry(B, rnd, x0, z0, x1, z1) {
    const h = 1.9;
    B.beam([x0, 0, z0], [x0, h, z0], 0.07, COL.woodD);
    B.beam([x1, 0, z1], [x1, h, z1], 0.07, COL.woodD);
    B.beam([x0, h - 0.05, z0], [x1, h - 0.05, z1], 0.015, COL.wire);
    const n = 3 + Math.floor(rnd() * 4), L = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k < n; k++) {
        const t = (k + 0.5 + (rnd() - 0.5) * 0.4) / n;
        const cx = x0 + (x1 - x0) * t, cz = z0 + (z1 - z0) * t;
        const cw = 0.35 + rnd() * 0.3, ch = 0.45 + rnd() * 0.45;
        const col = COL.cloth0 + Math.floor(rnd() * 8);
        // kain tipis sejajar tali
        const dx = Math.sin(ang) * cw / 2, dz = Math.cos(ang) * cw / 2;
        const top = h - 0.06, bot = top - ch;
        const uv = Builder.uvOf(col, 0, 0);
        const a = B.w(cx - dx, bot, cz - dz), b = B.w(cx + dx, bot, cz + dz), c = B.w(cx + dx, top, cz + dz), d = B.w(cx - dx, top, cz - dz);
        const nx = Math.cos(ang), nz = -Math.sin(ang);
        const hn = [nx * B.cs + nz * B.sn, 0, -nx * B.sn + nz * B.cs];
        B.tri3(a, b, c, uv, uv, uv, hn); B.tri3(a, c, d, uv, uv, uv, hn);
        const hb = hn.map(v => -v);
        B.tri3(a, b, c, uv, uv, uv, hb); B.tri3(a, c, d, uv, uv, uv, hb);
        void L;
    }
}

function gerobak(B, x, z) {
    B.box(x, 0.45, z, 1.4, 0.75, 0.7, { side: COL.woodL, top: COL.woodD });
    B.box(x, 1.2, z, 1.5, 0.05, 0.8, { side: 'tarp', top: 'tarp' });
    for (const s of [-1, 1]) B.beam([x + s * 0.7, 1.2, z + 0.35], [x + s * 0.7, 0.45, z + 0.35], 0.04, COL.woodD);
    B.cyl(x - 0.2, 0.3, z, 0.3, 0.9, 8, COL.tire, 'x');
    B.beam([x + 0.7, 0.75, z - 0.2], [x + 1.3, 0.6, z - 0.2], 0.05, COL.woodD);
    B.beam([x + 0.7, 0.75, z + 0.2], [x + 1.3, 0.6, z + 0.2], 0.05, COL.woodD);
}

function motor(B, rnd, x, z) {
    const col = [COL.carRed, COL.carBlack, COL.carBlue, COL.carSilver][Math.floor(rnd() * 4)];
    B.box(x, 0.35, z, 0.3, 0.45, 1.2, { side: col, top: col });
    B.box(x, 0.8, z - 0.15, 0.28, 0.1, 0.6, { side: COL.tire, top: COL.tire });
    B.beam([x, 0.8, z + 0.45], [x, 1.05, z + 0.55], 0.05, COL.pole);
    B.beam([x - 0.3, 1.05, z + 0.55], [x + 0.3, 1.05, z + 0.55], 0.04, COL.pole);
    B.cyl(x, 0.3, z + 0.55, 0.3, 0.1, 8, COL.tire, 'x');
    B.cyl(x, 0.3, z - 0.55, 0.3, 0.1, 8, COL.tire, 'x');
}

function trash(B, rnd, x, z) {
    const n = 4 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
        const s = 0.25 + rnd() * 0.35;
        B.box(x + (rnd() - 0.5) * 1.2, 0, z + (rnd() - 0.5) * 0.9, s, s * (0.6 + rnd()), s * (0.8 + rnd() * 0.5),
            { side: [COL.trashD, COL.trashM, COL.plasticG, COL.white, COL.cloth0 + 2][Math.floor(rnd() * 5)], top: COL.trashM });
    }
}

/** Kavling kampung padat 8x8: 3–6 gubuk berdesakan + perabot gang + kabel semrawut. */
function slumLot(B, P, rnd) {
    const H = 3.75;
    const split = -0.6 + rnd() * 1.2;
    const cols = [[-H, split], [split, H]];
    const roofs = [];
    let yardDone = false;
    for (const [xa, xb] of cols) {
        const rows = rnd() < 0.45 ? 3 : 2;
        let z = -H;
        for (let r = 0; r < rows; r++) {
            const zb = r === rows - 1 ? H : z + (2 * H) / rows + (rnd() - 0.5) * 0.8;
            const gap = 0.25 + rnd() * 0.3;
            const w = xb - xa - gap, d = zb - z - gap;
            const cx = (xa + xb) / 2 + (rnd() - 0.5) * 0.15, cz = (z + zb) / 2;
            if (!yardDone && rnd() < 0.16 && w > 2 && d > 1.8) {
                // halaman sempit: jemuran + drum + toren / gerobak
                yardDone = true;
                laundry(P, rnd, cx - w / 2 + 0.2, cz - d / 2 + 0.3, cx + w / 2 - 0.2, cz + d / 2 - 0.3);
                P.cyl(cx + w / 2 - 0.5, 0, cz - d / 2 + 0.5, 0.3, 0.88, 7, COL.drum);
                if (rnd() < 0.5) gerobak(P, cx - 0.2, cz + d / 2 - 0.6); else trash(P, rnd, cx, cz + d / 4);
            } else if (w > 1.6 && d > 1.6) {
                const h = 2.2 + rnd() * 0.6;
                const front = r === rows - 1 ? 'pz' : (r === 0 ? 'nz' : (rnd() < 0.5 ? 'px' : 'nx'));
                const s = shack(B, P, rnd, cx, cz, w, d, h, front);
                roofs.push({ x: cx, z: cz, y: s.roofY, w, d });
            }
            z = zb;
        }
    }
    // tiang listrik kayu di sudut depan + kabel semrawut ke atap
    const px = (rnd() < 0.5 ? -1 : 1) * 3.75, pz = 3.75;
    if (rnd() < 0.7) {
        P.beam([px, 0, pz], [px + (rnd() - 0.5) * 0.3, 6.5, pz], 0.16, COL.woodD);
        P.beam([px - 0.7, 6.0, pz], [px + 0.7, 6.0, pz], 0.08, COL.woodD);
        for (const rf of roofs) {
            if (rnd() < 0.4) P.beam([px + (rnd() - 0.5) * 1.2, 5.9 - rnd() * 0.4, pz], [rf.x + (rnd() - 0.5) * rf.w * 0.5, rf.y + 0.1, rf.z], 0.025, COL.wire);
        }
        for (let k = 0; k < 2; k++) P.beam([px - 0.6 + k * 1.2, 6.0, pz], [px - 0.6 + k * 0.6 + (rnd() - 0.5) * 4, 5.4 + rnd() * 0.5, pz + 8], 0.025, COL.wire);
    }
    // perabot gang depan
    if (rnd() < 0.45) motor(P, rnd, -2 + rnd() * 4, 3.4);
    if (rnd() < 0.35) P.cyl(2.8 * (rnd() < 0.5 ? -1 : 1), 0, 3.3, 0.3, 0.88, 7, COL.drum);
    if (rnd() < 0.25) trash(P, rnd, (rnd() - 0.5) * 5, 3.2);
    // toren oranye di atas tiang besi
    if (roofs.length && rnd() < 0.16) {
        const rf = roofs[Math.floor(rnd() * roofs.length)];
        P.cyl(rf.x, rf.y + 0.1, rf.z, 0.55, 1.1, 8, COL.toren);
    }
}

// ---------------------------------------------------------------------------------------------
// Modul utama
// ---------------------------------------------------------------------------------------------
export class InequalityCity {
    constructor(scene, layout) {
        this.scene = scene;
        this.layout = layout;
        this.groups = [];             // { tiles:[key], segs:[{ mesh, s, e }], hidden }
        this.tileGroup = new Map();   // "i,j" -> group
        this.dirty = false;
        this.timer = 0;
        this.night = false;
        this.stats = { towers: 0, midrise: 0, condo: 0, villas: 0, townhouses: 0, slumLots: 0 };

        const t0 = performance.now();
        const { cv, ev } = paintAtlas();
        const mkTex = (c, srgb) => {
            const t = new THREE.CanvasTexture(c);
            if (srgb) t.encoding = THREE.sRGBEncoding;
            t.anisotropy = 8;
            return t;
        };
        this.material = new THREE.MeshLambertMaterial({
            map: mkTex(cv, true), emissiveMap: mkTex(ev, true), emissive: 0xffffff, emissiveIntensity: 0,
        });
        this.material.name = 'inequality_atlas';

        this.build();
        this.watchLayout();
        this.refresh(true);
        console.log(`[Kota Kaya-Miskin] ${JSON.stringify(this.stats)} · ${Math.round(performance.now() - t0)} ms`);
    }

    /** True bila petak ini ditempati bangunan latar (dipakai CityTrees agar pohon tidak menembus gubuk). */
    covers(i, j) { return this.tileGroup.has(i + ',' + j); }

    occupied(i, j) { const o = this.layout && this.layout.occ && this.layout.occ.get(i + ',' + j); return !!o && o !== '__monumen__'; }

    freeLot(i, j) {
        return i >= GRID_CONFIG.ACTIVE_MIN_I && i <= GRID_CONFIG.ACTIVE_MAX_I && j >= GRID_CONFIG.ACTIVE_MIN_J && j <= GRID_CONFIG.ACTIVE_MAX_J
            && isLotTile(i, j) && !isMonumentTile(i, j) && !this.occupied(i, j);
    }

    /** Alas tapak: permukaan tertinggi di 9 titik tapak (Zero-Submerging) + micro-lift. */
    baseY(gi, gj, w, h) {
        const S = getSurfaceIndex();
        if (!S) return LIFT;
        let y = 0;
        const x0 = wx(gi), z0 = wx(gj), W = w * T, D = h * T;
        for (const a of [0.08, 0.5, 0.92]) for (const b of [0.08, 0.5, 0.92]) {
            const s = S.at(x0 + W * a, z0 + D * b);
            if (s.kind !== 'water' && s.kind !== 'road') y = Math.max(y, s.y);
        }
        return y + LIFT;
    }

    build() {
        const RMIN = GRID_CONFIG.RIVER_TILE_MIN_I, RMAX = GRID_CONFIG.RIVER_TILE_MAX_I;
        const { ACTIVE_MIN_I: I0, ACTIVE_MAX_I: I1, ACTIVE_MIN_J: J0, ACTIVE_MAX_J: J1 } = GRID_CONFIG;
        const used = new Set();
        const have = new Builder(), hn = new Builder();
        const props = [new Builder(), new Builder(), new Builder(), new Builder()];   // perabot kampung per kuadran (LOD)
        const chunkOf = (i, j) => (i <= 125 ? 0 : 1) + (j <= 107 ? 0 : 2);
        const can = (i, j) => this.freeLot(i, j) && !used.has(i + ',' + j);
        const can2 = (i, j, side) => {
            if (side < 0 && i + 1 >= RMIN) return false;
            return can(i, j) && can(i + 1, j) && can(i, j + 1) && can(i + 1, j + 1);
        };
        const begin = (B, gi, gj, w, h, P = null) => {
            const cx = wx(gi) + (w * T) / 2, cz = wx(gj) + (h * T) / 2;
            const face = CityLayout.facingFor(gi, gj, w, h, 0);
            const y = this.baseY(gi, gj, w, h);
            B.frame(cx, y, cz, ROT[face]);
            if (P) P.frame(cx, y, cz, ROT[face]);
            return B.count;
        };
        const commit = (mesh, B, s, gi, gj, w, h, extra = null) => {
            const tiles = [];
            for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) { const k = (gi + a) + ',' + (gj + b); tiles.push(k); used.add(k); }
            const segs = [{ mesh, s, e: B.count }];
            if (extra) segs.push(extra);
            const g = { tiles, segs, hidden: false };
            this.groups.push(g);
            for (const k of tiles) this.tileGroup.set(k, g);
        };

        // --- Desa Have: zona prestise (dekat sungai & pusat kota = CBD) ---
        for (let j = J0; j <= J1; j++) {
            for (let i = I0; i < RMIN; i++) {
                if (!can(i, j)) continue;
                const x = wx(i) + 4, z = wx(j) + 4;
                const p = Math.max(0, Math.min(1, 1 - (-16 - x) / 270));
                const q = Math.max(0, 1 - Math.abs(z) / 180);
                const n = hash(i >> 1, j >> 1, 7);
                const prestige = 0.58 * p + 0.42 * q + (n - 0.5) * 0.22;
                const rnd = rng((i * 92821) ^ (j * 68917) ^ 0xC0FFEE);
                if (rnd() < 0.05) continue;           // kavling kosong (dijual)
                if (prestige > 0.72 && can2(i, j, -1)) {
                    const s = begin(have, i, j, 2, 2);
                    const H = Math.min(165, 60 + (prestige - 0.72) / 0.28 * 100 + rnd() * 30);
                    tower(have, rnd, H, rnd() < 0.6 ? 'glassA' : 'glassB');
                    commit('have', have, s, i, j, 2, 2); this.stats.towers++;
                } else if (prestige > 0.58) {
                    if (rnd() < 0.3 && can2(i, j, -1)) {
                        const s = begin(have, i, j, 2, 2);
                        condo(have, rnd, 42 + rnd() * 40);
                        commit('have', have, s, i, j, 2, 2); this.stats.condo++;
                    } else {
                        const s = begin(have, i, j, 1, 1);
                        midrise(have, rnd, 5 + Math.floor(rnd() * 8 + (prestige - 0.58) * 30));
                        commit('have', have, s, i, j, 1, 1); this.stats.midrise++;
                    }
                } else if (rnd() < 0.75 && can2(i, j, -1)) {
                    const s = begin(have, i, j, 2, 2);
                    villa(have, rnd);
                    commit('have', have, s, i, j, 2, 2); this.stats.villas++;
                } else {
                    const s = begin(have, i, j, 1, 1);
                    townhouse(have, rnd);
                    commit('have', have, s, i, j, 1, 1); this.stats.townhouses++;
                }
            }
        }

        // --- Desa Have-Not: kampung padat ---
        for (let j = J0; j <= J1; j++) {
            for (let i = RMAX + 1; i <= I1; i++) {
                if (!can(i, j)) continue;
                const rnd = rng((i * 40503) ^ (j * 2654435761) ^ 0xBADA55);
                if (rnd() < 0.07) continue;            // kebun / lahan kosong (pohon CityTrees tetap tampil)
                const c = chunkOf(i, j), P = props[c];
                const s = begin(hn, i, j, 1, 1, P), ps = P.count;
                slumLot(hn, P, rnd);
                commit('hn', hn, s, i, j, 1, 1, { mesh: 'hnp' + c, s: ps, e: P.count }); this.stats.slumLots++;
            }
        }

        this.meshes = {};
        const list = [['have', have], ['hn', hn], ...props.map((P, k) => ['hnp' + k, P])];
        for (const [key, B] of list) {
            if (!B.count) continue;
            const geo = B.geometry();
            const mesh = new THREE.Mesh(geo, this.material);
            const isProp = key.startsWith('hnp');
            mesh.name = key === 'have' ? 'desa_have_skyline' : isProp ? 'desa_havenot_perabot_' + key.slice(3) : 'desa_havenot_kampung';
            mesh.castShadow = !isProp;
            if (isProp) mesh.userData.detail = 170;      // updateDetailLOD (main.js): sembunyi bila kamera jauh
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            mesh.raycast = () => {};
            mesh.userData.noBatch = true;
            this.scene.add(mesh);
            this.meshes[key] = { mesh, orig: geo.attributes.position.array.slice() };
        }
        this.stats.tris = Math.round(list.reduce((a, [, B]) => a + B.count, 0) / 3);
        this.stats.propTris = Math.round(props.reduce((a, B) => a + B.count, 0) / 3);
    }

    /** Bungkus occupy/release (berantai dengan pembungkus lain, mis. CityTrees). */
    watchLayout() {
        const L = this.layout;
        if (!L || L.__inequalityWatched) return;
        L.__inequalityWatched = true;
        for (const fn of ['occupy', 'release']) {
            const orig = L[fn].bind(L);
            L[fn] = (...args) => { const r = orig(...args); this.dirty = true; return r; };
        }
    }

    /** Gusur bangunan latar di kavling yang kini ditempati warga; kembalikan bila kavling kosong lagi. */
    refresh(force = false) {
        const touched = new Set();
        for (const g of this.groups) {
            const hide = g.tiles.some(k => { const [i, j] = k.split(',').map(Number); return this.occupied(i, j); });
            if (hide === g.hidden && !force) continue;
            if (hide === g.hidden) continue;
            g.hidden = hide;
            for (const sg of g.segs) {
                if (sg.e <= sg.s || !this.meshes[sg.mesh]) continue;
                const { mesh, orig } = this.meshes[sg.mesh];
                const arr = mesh.geometry.attributes.position.array;
                if (hide) arr.fill(0, sg.s * 3, sg.e * 3);
                else arr.set(orig.subarray(sg.s * 3, sg.e * 3), sg.s * 3);
                touched.add(sg.mesh);
            }
        }
        for (const k of touched) this.meshes[k].mesh.geometry.attributes.position.needsUpdate = true;
        return touched.size;
    }

    setNight(isNight) {
        this.night = !!isNight;
        this.material.emissiveIntensity = isNight ? 1.0 : 0;
    }

    update(dt) {
        this.timer += dt;
        if (this.dirty && this.timer >= 0.5) { this.timer = 0; this.dirty = false; this.refresh(); }
    }
}
