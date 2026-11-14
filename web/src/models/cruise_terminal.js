/* global THREE */
/**
 * AUDIRA-LAND: Terminal Kapal Pesiar AUDIRA (landmark penumpang statis).
 *
 * Untuk penumpang yang datang ke pulau kita naik kapal pesiar. Berada di pesisir selatan-BARAT
 * (pusat X -250, Z -430), memakai laut selatan yang sudah ada (y = -0.25) — terpisah dari
 * Pelabuhan kargo (x 80..460). Isi: gedung terminal kaca modern, dermaga penumpang panjang,
 * jembatan boarding (gangway), kapal pesiar putih bertingkat (bukan kargo), plaza + drop-off,
 * menara navigasi dengan radar berputar, tiang bendera, gerbang + papan "TERMINAL KAPAL PESIAR".
 * Dimuat lazy (import dinamis di main.js) agar bundel awal kecil (anggaran JS gzip <= 160 KB).
 *
 * Kinerja (anggaran draw <= 100 @390px): seluruh struktur (termasuk kapal) dilebur bakeStatic
 * -> ~2-3 draw lambert. Air basin 1 (material air bersama). Papan 1 atlas. Lampu 1 atlas Basic.
 * Beacon + radar: mesh kecil animasi. Zero-Submerging: dermaga/gedung bertumpu di darat
 * (y >= pasir); lambung kapal duduk di permukaan air (dasar = y air, dek di atas).
 *
 * API: new CruiseTerminal(scene) -> .update(dt), .setNight(isNight),
 *      .attachCameraPreset(cam), .focusCamera()
 */

import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { makeWaterMaterial } from '../core/water.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

// Pusat terminal (dunia). Bagian dibangun di koordinat lokal (x = sepanjang pantai, +z = darat, -z = laut).
const CX = -250, CZ = -430;
const SEA_Y = -0.25;          // sama dengan laut fishing.js / harbor.js
const QUAY_TOP = 0.9;         // puncak dermaga

const COL = {
    sand: 0xE3CF9A, quay: 0xCFC7B6, quayDark: 0x9A9183, plaza: 0x8C9AA6, plazaLine: 0xF4EEE2,
    bollard: 0x2B2622, fender: 0x1F1C1A, steel: 0x8D96A0, steelDark: 0x4C545E,
    // gedung terminal
    wall: 0xF4F1E9, wallBlue: 0x2C6E8F, glass: 0x7FB3C8, glassDark: 0x35617A,
    roof: 0xDDE4E8, canopy: 0xC8553D, tower: 0xEDE7DB, radar: 0x4C545E,
    // kapal pesiar
    hull: 0x14365C, hullDeep: 0x0C2440, super: 0xF6F4EE, superShade: 0xD9D6CC,
    balcony: 0x9FC3D6, funnel: 0x1E4E79, funnelCap: 0xC8553D, boat: 0xE9A91E,
    light: 0xFFE08A, gold: 0xE9A91E, red: 0xC8553D, white: 0xF4EEE2
};
// warna bendera jajar (bunting)
const FLAG = [0xC8553D, 0x2C6E8F, 0xE9A91E, 0x3E8E4B, 0xF4EEE2];

export class CruiseTerminal {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'cruiseTerminal';
        this.base = new THREE.Group();
        this.base.position.set(CX, 0, CZ);
        this.staticGroup = new THREE.Group();
        this.base.add(this.staticGroup);

        this.matCache = new Map();
        this.lampMat = new THREE.MeshBasicMaterial({ color: lin(0xFFE08A) });
        this.beaconMat = new THREE.MeshBasicMaterial({ color: lin(0xC8553D) });
        [this.lampMat, this.beaconMat].forEach(protectMaterial);
        this.lampGeos = [];
        this.flagGeos = [];
        this.signMat = new THREE.MeshBasicMaterial({ map: this.makeSignTexture() });
        this.signGeos = [];
        this.water = makeWaterMaterial({ color: 0x2F6FB5, repeatU: 10, repeatV: 6, flow: 0.004, drift: 0.006 });
        this.time = 0;

        this.buildBasin();
        this.buildQuay();
        this.buildPlaza();
        this.buildTerminalBuilding();
        this.buildTower();
        this.buildGangway();
        this.buildCruiseShip(-6, -40);
        this.buildGate();
        this.buildFlags();

        const baked = bakeStatic(this.staticGroup, { chunkSize: 90 });
        this.staticGroup.add(baked);
        this.root.add(this.base);
        this.buildLamps();
        this.buildFlagMesh();
        this.buildSigns();
        this.buildBeacon();
        this.buildRadar();

        scene.add(this.root);
    }

    mat(hex) {
        if (!this.matCache.has(hex)) this.matCache.set(hex, new THREE.MeshLambertMaterial({ color: lin(hex) }));
        return this.matCache.get(hex);
    }
    box(w, h, d, hex, x, y0, z, { ry = 0, cast = false } = {}) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(hex));
        m.position.set(x, y0 + h / 2, z); m.rotation.y = ry;
        m.castShadow = cast; m.receiveShadow = true;
        this.staticGroup.add(m); return m;
    }
    cyl(rt, rb, h, seg, hex, x, y0, z, { ry = 0, rx = 0, rz = 0, cast = false } = {}) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.mat(hex));
        m.position.set(x, y0 + h / 2, z); m.rotation.set(rx, ry, rz);
        m.castShadow = cast; m.receiveShadow = true;
        this.staticGroup.add(m); return m;
    }

    buildBasin() {
        const g = new THREE.PlaneGeometry(260, 150).rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, this.water);
        m.position.set(CX, SEA_Y, CZ - 45);
        m.name = 'cruise_water';
        m.receiveShadow = true;
        this.root.add(m);
    }

    buildQuay() {
        // Dermaga penumpang memanjang sepanjang pantai (x), tepi air di z lokal 0, darat +z.
        this.box(190, 1.2, 22, COL.quay, 0, -0.3, 11, { cast: true });
        this.box(190, 0.08, 21, COL.quayDark, 0, 0.9, 11);
        // Fender tepi air
        this.box(190, 0.5, 0.6, COL.fender, 0, 0.1, 0.2);
        // Bollard + tiang lampu + pagar tepi air
        for (let x = -88; x <= 88; x += 11) this.cyl(0.4, 0.5, 0.9, 8, COL.bollard, x, QUAY_TOP, 1.4, { cast: true });
        for (let x = -84; x <= 84; x += 12) {
            this.cyl(0.12, 0.16, 5.4, 6, COL.steelDark, x, QUAY_TOP, 3.4, { cast: true });
            this.lampGeos.push({ x, y: QUAY_TOP + 5.4, z: 3.4 });
        }
        // Pagar pengaman tepi air (rel tipis)
        this.box(184, 0.12, 0.12, COL.steel, 0, QUAY_TOP + 1.1, 2.4);
        for (let x = -88; x <= 88; x += 5.5) this.cyl(0.06, 0.06, 1.1, 5, COL.steel, x, QUAY_TOP, 2.4);
    }

    buildPlaza() {
        // Plaza + drop-off taksi/bus wisata di belakang dermaga (z lokal 22..56)
        this.box(190, 0.2, 40, COL.plaza, 0, 0.2, 40, {});
        // Marka drop-off
        for (let x = -80; x <= 80; x += 16) this.box(0.4, 0.02, 34, COL.plazaLine, x, 0.2, 40);
        this.box(150, 0.02, 0.5, COL.gold, 0, 0.21, 26);   // garis tepi drop-off
        // Pot tanaman di plaza
        for (const x of [-60, -20, 20, 60]) {
            this.cyl(1.2, 1.4, 1.2, 8, COL.quayDark, x, 0.2, 30);
            this.cyl(1.9, 1.5, 2.4, 6, 0x3E8E4B, x, 1.4, 30, { cast: true });   // semak
        }
    }

    buildTerminalBuilding() {
        // Gedung terminal penumpang kaca modern, memanjang di tepi darat (z lokal ~64)
        const bz = 64;
        // Dasar + lantai 1 (dinding putih)
        this.box(120, 7.5, 24, COL.wall, 0, 0.2, bz, { cast: true });
        // Pita kaca lantai 1 (fasad laut)
        this.box(116, 4.6, 0.4, COL.glass, 0, 1.6, bz - 11.9);
        for (let x = -56; x <= 56; x += 8) this.box(0.4, 4.6, 0.5, COL.wallBlue, x, 1.6, bz - 11.9);  // mullion
        // Lantai 2 (set-back, pita biru + kaca)
        this.box(104, 5.5, 20, COL.wallBlue, 0, 7.7, bz, { cast: true });
        this.box(100, 3.4, 0.4, COL.glassDark, 0, 8.7, bz - 10.1);
        for (let x = -48; x <= 48; x += 8) this.box(0.4, 3.4, 0.5, COL.wall, x, 8.7, bz - 10.1);
        // Atap melengkung (ditiru: beberapa balok makin tinggi ke tengah)
        this.box(124, 0.6, 26, COL.roof, 0, 13.2, bz, { cast: true });
        this.box(70, 1.2, 22, COL.roof, 0, 13.6, bz, { cast: true });
        this.box(34, 1.2, 20, COL.roof, 0, 14.4, bz, { cast: true });
        // Kanopi masuk (sisi laut) + tiang
        this.box(40, 0.5, 8, COL.canopy, 0, 5.4, bz - 16, { cast: true });
        for (const dx of [-17, 0, 17]) this.cyl(0.3, 0.35, 5.4, 6, COL.steelDark, dx, 0.2, bz - 19.5, { cast: true });
        // Pintu masuk kaca
        for (const dx of [-12, 0, 12]) this.box(6, 4.2, 0.3, COL.glassDark, dx, 0.2, bz - 11.95);
        // Papan nama gedung
        this.box(40, 1.8, 0.3, COL.wallBlue, 0, 10.6, bz - 10.0);
        this.lampGeos.push({ x: -20, y: 5.6, z: bz - 16, r: 0.3 }, { x: 0, y: 5.6, z: bz - 16, r: 0.3 }, { x: 20, y: 5.6, z: bz - 16, r: 0.3 });
    }

    buildTower() {
        // Menara navigasi/kontrol pelabuhan penumpang di ujung timur gedung
        const tx = 70, tz = 66;
        this.cyl(2.4, 3.0, 20, 10, COL.tower, tx, 0.2, tz, { cast: true });
        this.cyl(4.2, 3.2, 3.0, 10, COL.wallBlue, tx, 20.2, tz, { cast: true });   // ruang kontrol
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4)                           // kaca melingkar
            this.box(2.2, 2.0, 0.3, COL.glass, tx + Math.sin(a) * 4.0, 20.7, tz + Math.cos(a) * 4.0, { ry: a });
        this.cyl(4.4, 4.4, 0.4, 10, COL.steelDark, tx, 23.2, tz);
        // Tiang radar di atas (titik animasi)
        this.cyl(0.18, 0.18, 2.6, 6, COL.steelDark, tx, 23.6, tz, { cast: true });
        this.radarPos = { x: CX + tx, y: 25.8, z: CZ + tz };
        this.beaconPos = { x: CX + tx, y: 26.6, z: CZ + tz };
    }

    buildGangway() {
        // Jembatan boarding penumpang (gangway) dari gedung/dermaga menuju lambung kapal.
        const gx = -6;
        // Kaki penopang di dermaga
        this.cyl(0.4, 0.5, 6.5, 6, COL.steelDark, gx - 7, QUAY_TOP, 6, { cast: true });
        this.cyl(0.4, 0.5, 6.5, 6, COL.steelDark, gx + 7, QUAY_TOP, 6, { cast: true });
        this.box(16, 0.8, 2.0, COL.wallBlue, gx, 6.5, 6, { cast: true });    // kabin atas
        // Lengan ke kapal (menjulur ke -z, sedikit turun ke dek)
        const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 22), this.mat(COL.wall));
        arm.position.set(gx, 6.2, -5); arm.rotation.x = 0.06;
        arm.castShadow = true; arm.receiveShadow = true;
        this.staticGroup.add(arm);
        // Pita kaca di lengan
        this.box(0.2, 0.9, 20, COL.glass, gx - 1.7, 5.9, -5);
        this.box(0.2, 0.9, 20, COL.glass, gx + 1.7, 5.9, -5);
    }

    /** Kapal pesiar putih bertingkat: lambung biru laut dalam, superstruktur putih, balkon,
     *  2 cerobong, sekoci, haluan meruncing. Duduk di permukaan air. */
    buildCruiseShip(cx, cz) {
        const L = 96, W = 16, hullH = 6.0;
        const deck0 = SEA_Y + hullH;                  // dek utama di atas lambung
        // lambung
        this.box(L, hullH, W, COL.hull, cx, SEA_Y, cz, { cast: true });
        this.box(L - 2, 1.0, W + 0.2, COL.hullDeep, cx, SEA_Y, cz);        // garis air
        this.box(L - 4, 0.3, W + 0.3, COL.gold, cx, SEA_Y + hullH - 0.6, cz);  // list emas
        // haluan meruncing (depan = -x)
        this.cyl(hullH / 1.3, 0.5, W, 6, COL.hull, cx - L / 2, SEA_Y + hullH / 2, cz, { rx: Math.PI / 2, ry: Math.PI / 2, cast: true });
        // Superstruktur bertingkat (makin ke atas makin pendek -> siluet kapal pesiar)
        const tiers = [
            { w: L - 10, h: 3.0, d: W - 1 },
            { w: L - 18, h: 3.0, d: W - 2 },
            { w: L - 28, h: 3.0, d: W - 3 },
            { w: L - 40, h: 3.0, d: W - 5 }
        ];
        let y = deck0;
        for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i];
            this.box(t.w, t.h, t.d, i % 2 ? COL.superShade : COL.super, cx, y, cz, { cast: true });
            // baris jendela/balkon di tiap sisi
            for (const sz of [-1, 1]) {
                this.box(t.w - 4, 1.4, 0.3, COL.balcony, cx, y + 0.8, cz + sz * (t.d / 2 - 0.1));
                for (let wx = -t.w / 2 + 4; wx <= t.w / 2 - 4; wx += 3) this.box(0.3, 1.4, 0.4, COL.glassDark, cx + wx, y + 0.8, cz + sz * (t.d / 2 - 0.1));
            }
            y += t.h;
        }
        // Dek teratas: kolam/area terbuka + pagar
        this.box(L - 40, 0.4, W - 5, COL.balcony, cx, y, cz);
        this.box(10, 0.3, 6, 0x2F8FD0, cx - 6, y + 0.4, cz);   // kolam renang
        // Sekoci penyelamat di sisi (deck0 + 1)
        for (let bx = -L / 2 + 16; bx <= L / 2 - 24; bx += 10) {
            for (const sz of [-1, 1]) this.box(4, 1.2, 1.6, COL.boat, cx + bx, deck0 + 3.0, cz + sz * (W / 2 - 0.4), { cast: true });
        }
        // 2 cerobong di buritan (+x)
        for (const fx of [L / 2 - 26, L / 2 - 18]) {
            this.box(4.5, 6.0, 5.0, COL.funnel, cx + fx, y + 0.4, cz, { cast: true });
            this.box(4.8, 1.2, 5.3, COL.funnelCap, cx + fx, y + 6.4, cz);
        }
        // Tiang haluan + lampu navigasi
        this.cyl(0.2, 0.2, 7, 6, COL.steelDark, cx - L / 2 + 10, y, cz, { cast: true });
        this.lampGeos.push({ x: cx, y: y + 2, z: cz, r: 0.34 }, { x: cx - L / 2 + 10, y: y + 7, z: cz, r: 0.26 });
    }

    buildGate() {
        // Gerbang terminal + papan nama di sisi darat (z lokal ~88)
        for (const dx of [-26, 26]) this.box(3, 11, 3, COL.wallBlue, dx, 0.2, 88, { cast: true });
        this.box(58, 2.6, 2.2, COL.wall, 0, 10, 88, { cast: true });
        this.signGeos.push({ x: 0, y: 7.8, z: 86.8, ry: 0 });
    }

    buildFlags() {
        // Tiang bendera di plaza (bendera dibuat sebagai atlas terpisah untuk warna cerah)
        for (const x of [-80, -40, 0, 40, 80]) {
            this.cyl(0.14, 0.18, 9, 6, COL.steel, x, 0.2, 58, { cast: true });
            this.flagGeos.push({ x, y: 8.2, z: 58, c: FLAG[(x / 40 + 2 + 5) % FLAG.length] });
        }
    }

    makeSignTexture() {
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 160;
        const x = c.getContext('2d');
        x.fillStyle = '#0C2440'; x.fillRect(0, 0, 1024, 160);
        x.strokeStyle = '#E9A91E'; x.lineWidth = 10; x.strokeRect(8, 8, 1008, 144);
        x.fillStyle = '#FBE7B0'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 60px Georgia, serif';
        x.fillText('🚢  TERMINAL KAPAL PESIAR AUDIRA', 512, 60);
        x.font = 'bold 30px Georgia, serif'; x.fillStyle = '#FFFFFF';
        x.fillText('AUDIRA CRUISE TERMINAL · Selamat Datang di Pulau · audira.my.id', 512, 120);
        const t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
        return t;
    }

    buildSigns() {
        const geos = [];
        for (const s of this.signGeos) {
            const nx = Math.sin(s.ry), nz = Math.cos(s.ry);
            for (const side of [-1, 1]) {
                const pg = new THREE.PlaneGeometry(52, 5.2);
                if (side < 0) pg.rotateY(Math.PI);
                pg.rotateY(s.ry);
                pg.translate(CX + s.x - nx * side * 0.1, s.y, CZ + s.z - nz * side * 0.1);
                geos.push(pg);
            }
        }
        if (!geos.length) return;
        const m = new THREE.Mesh(mergeUV(geos), this.signMat);
        m.name = 'cruise_sign'; m.userData.detail = 340;
        this.root.add(m);
    }

    buildLamps() {
        if (!this.lampGeos.length) return;
        const geos = this.lampGeos.map(l => {
            const g = new THREE.SphereGeometry(l.r || 0.24, 6, 5);
            g.translate(CX + l.x, l.y, CZ + l.z);
            return g;
        });
        this.lampMesh = new THREE.Mesh(mergeUV(geos), this.lampMat);
        this.lampMesh.name = 'cruise_lamps';
        this.root.add(this.lampMesh);
    }

    buildFlagMesh() {
        // Bendera cerah (satu mesh vertex-color Basic), tak terpengaruh malam.
        if (!this.flagGeos.length) return;
        const geos = [];
        for (const f of this.flagGeos) {
            const g = new THREE.PlaneGeometry(2.6, 1.6);
            g.translate(CX + f.x + 1.3, f.y, CZ + f.z);
            const col = lin(f.c);
            const colors = [];
            for (let i = 0; i < g.attributes.position.count; i++) colors.push(col.r, col.g, col.b);
            g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geos.push(g);
        }
        const m = new THREE.Mesh(mergeUVColor(geos), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        m.name = 'cruise_flags';
        this.root.add(m);
    }

    buildBeacon() {
        if (!this.beaconPos) return;
        const g = new THREE.SphereGeometry(0.7, 8, 6);
        g.translate(this.beaconPos.x, this.beaconPos.y, this.beaconPos.z);
        this.beacon = new THREE.Mesh(g, this.beaconMat);
        this.beacon.name = 'cruise_beacon';
        this.root.add(this.beacon);
    }

    buildRadar() {
        if (!this.radarPos) return;
        this.radar = new THREE.Group();
        this.radar.position.set(this.radarPos.x, this.radarPos.y, this.radarPos.z);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.3, 0.5), this.mat(COL.radar));
        this.radar.add(bar);
        this.root.add(this.radar);
    }

    update(dt) {
        this.time += dt || 0;
        if (this.beacon) {
            const on = (this.time % 2.0) < 0.5;
            this.beaconMat.color.copy(lin(on ? 0xFF6F5A : 0x6A241C));   // merah navigasi berkedip
        }
        if (this.radar) this.radar.rotation.y = this.time * 0.9;
    }

    setNight(isNight) {
        this.lampMat.color.copy(lin(isNight ? 0xFFE08A : 0xBFC6CC));
    }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 560);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-cruise')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-cruise';
            btn.title = 'Fokus ke Terminal Kapal Pesiar AUDIRA (pesisir selatan-barat)';
            btn.textContent = '🚢 Terminal Pesiar';
            group.insertBefore(btn, group.firstChild);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-cruise)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(CX, 0, CZ - 10);
        const a = 20 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 40 * Math.PI / 180;
        cam.distanceDesired = 240;
    }
}

/** Gabung geometri ber-UV/posisi jadi satu BufferGeometry (1 draw). */
function mergeUV(geos) {
    const pos = [], uv = [], nrm = [], idx = [];
    let base = 0;
    for (const g0 of geos) {
        const g = g0.index ? g0.toNonIndexed() : g0;
        const p = g.attributes.position;
        let n = g.attributes.normal;
        if (!n) { g.computeVertexNormals(); n = g.attributes.normal; }
        const u = g.attributes.uv;
        for (let i = 0; i < p.count; i++) {
            pos.push(p.getX(i), p.getY(i), p.getZ(i));
            nrm.push(n.getX(i), n.getY(i), n.getZ(i));
            uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
        }
        for (let i = 0; i < p.count; i += 3) idx.push(base + i, base + i + 1, base + i + 2);
        base += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx);
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
}

/** Sama seperti mergeUV tetapi membawa atribut warna vertex (untuk bendera). */
function mergeUVColor(geos) {
    const pos = [], nrm = [], col = [], idx = [];
    let base = 0;
    for (const g0 of geos) {
        const g = g0.index ? g0.toNonIndexed() : g0;
        const p = g.attributes.position;
        let n = g.attributes.normal;
        if (!n) { g.computeVertexNormals(); n = g.attributes.normal; }
        const c = g.attributes.color;
        for (let i = 0; i < p.count; i++) {
            pos.push(p.getX(i), p.getY(i), p.getZ(i));
            nrm.push(n.getX(i), n.getY(i), n.getZ(i));
            col.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
        }
        for (let i = 0; i < p.count; i += 3) idx.push(base + i, base + i + 1, base + i + 2);
        base += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setIndex(idx);
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
}
