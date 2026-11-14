/**
 * AUDIRA-LAND: Material air bersama (sungai, saluran, kali).
 * Tekstur riak prosedural (canvas, 0 KB) yang digeser pelan setiap frame -> air terlihat
 * MENGALIR, tidak lagi seperti pelat aspal. Phong + specular memberi kilau matahari/bulan.
 */

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
const animated = [];

function rippleTexture() {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#a9c4cc';
    g.fillRect(0, 0, s, s);
    // Pola riak: garis bergelombang terang/gelap tipis (tileable)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 70; k++) {
        const y0 = rnd() * s, len = 30 + rnd() * 90, x0 = rnd() * s;
        const light = rnd() < 0.55;
        g.strokeStyle = light ? 'rgba(255,255,255,0.75)' : 'rgba(70,110,125,0.35)';
        g.lineWidth = light ? 1.4 + rnd() * 1.6 : 1 + rnd();
        g.beginPath();
        for (let t = 0; t <= len; t += 4) {
            const x = (x0 + t) % s;
            const y = y0 + Math.sin((x0 + t) * 0.09) * 2.2;
            if (t === 0 || x < 4) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.encoding = THREE.sRGBEncoding; // warna kanvas = sRGB (tanpa ini air tampak pucat)
    return tex;
}

/**
 * @param {object} o  color (sRGB hex), repeatU/V (ulangan tekstur per mesh),
 *                    flow (kecepatan alir sepanjang V), axis 'v' (default)
 */
export function makeWaterMaterial(o = {}) {
    const map = rippleTexture();
    map.repeat.set(o.repeatU || 4, o.repeatV || 30);
    const mat = new THREE.MeshPhongMaterial({
        color: lin(o.color || 0x3F92B4),
        specular: lin(0x7E9CA6),
        shininess: 140,
        map
    });
    animated.push({ map, flow: o.flow ?? 0.05, drift: o.drift ?? 0.008 });
    return mat;
}

/**
 * Daftarkan animasi perairan lain (air terjun, buih, pemancing) agar ikut berjalan di loop
 * yang sama tanpa menyentuh main.js. fn(dt, waktuDetik).
 */
const tickers = [];
let waterTime = 0;
export function onWaterTick(fn) { tickers.push(fn); }

/** Panggil tiap frame: menggeser riak searah arus + menjalankan animasi perairan terdaftar. */
export function updateWater(dt) {
    waterTime += dt;
    for (const a of animated) {
        a.map.offset.y -= a.flow * dt;
        a.map.offset.x += Math.sin(performance.now() * 0.0004) * a.drift * dt;
    }
    for (const f of tickers) f(dt, waterTime);
}

/** Tekstur tirai air terjun: guratan vertikal putih-kebiruan, tileable arah V. */
function fallTexture() {
    const w = 128, h = 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(196,226,236,0.62)';
    g.fillRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 150; k++) {
        const x = rnd() * w, y0 = rnd() * h, len = 40 + rnd() * 160;
        const light = rnd() < 0.7;
        g.strokeStyle = light ? `rgba(255,255,255,${0.45 + rnd() * 0.5})` : `rgba(90,140,160,${0.25 + rnd() * 0.25})`;
        g.lineWidth = 1 + rnd() * (light ? 3 : 2);
        // Gambar dua kali (y dan y-h) agar guratan menyambung saat tekstur berulang
        for (const off of [0, -h, h]) {
            g.beginPath();
            g.moveTo(x, y0 + off);
            g.lineTo(x + Math.sin(k) * 2, y0 + len + off);
            g.stroke();
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

/**
 * Material tirai air terjun (transparan, dua sisi). Tekstur bergerak ke BAWAH tiap frame.
 * @param {number} speed  kecepatan jatuh (ulangan tekstur per detik)
 */
export function makeWaterfallMaterial(speed = 1.4, repeatV = 3) {
    const map = fallTexture();
    map.repeat.set(1, repeatV);
    const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        emissive: lin(0x23343A),
        map,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    animated.push({ map, flow: -speed, drift: 0 });
    return mat;
}
