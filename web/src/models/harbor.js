/* global THREE */
/**
 * AUDIRA-LAND: Pelabuhan AUDIRA (landmark megah statis). Spesifikasi: docs/SPEC_BUS_TERMINAL_AIRPORT.md
 *
 * Pelabuhan peti kemas besar di pesisir selatan-timur (pusat X 270, Z -430), memakai laut selatan yang
 * sudah ada (y = -0.25). Isi: dermaga (quay) panjang, 3 crane gantry peti kemas, tumpukan kontainer
 * warna-warni, 2 kapal kargo, gudang, mercusuar (beacon berkedip), gerbang + papan "PELABUHAN AUDIRA".
 * Dimuat lazy (import dinamis di main.js) agar bundel awal kecil (anggaran JS gzip <= 160 KB).
 *
 * Kinerja (anggaran draw <= 100 @390px): seluruh struktur (termasuk kapal & crane) dilebur bakeStatic
 * -> ~2-3 draw lambert. Air basin 1 (material air bersama). Papan 1 atlas. Beacon 1 Basic (berkedip).
 * Zero-Submerging: dermaga/crane/kontainer/gudang bertumpu di darat (y >= pasir); lambung kapal duduk
 * di permukaan air (dasar = y air, dek di atas).
 *
 * API: new Harbor(scene) -> .update(dt), .setNight(isNight), .attachCameraPreset(cam), .focusCamera()
 */

import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { makeWaterMaterial } from '../core/water.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

// Pusat pelabuhan (dunia). Bagian dibangun di koordinat lokal (x = sepanjang pantai, +z = darat, -z = laut).
const HX = 270, HZ = -430;
const SEA_Y = -0.25;          // sama dengan laut fishing.js
const QUAY_TOP = 0.9;         // puncak dermaga

const COL = {
    sand: 0xE3CF9A, quay: 0xBFB6A6, quayDark: 0x9A9183, apron: 0x6B6458,
    bollard: 0x2B2622, fender: 0x1F1C1A, steel: 0x8D96A0, steelDark: 0x4C545E,
    craneLeg: 0xF2C230, craneBeam: 0xE0A91E, craneCab: 0x2C6E8F,
    hull: 0x8E3B28, hullDark: 0x5A2316, deck: 0xC9BBA0, bridge: 0xF2EEE6, funnel: 0xC8553D,
    warehouse: 0xBFC6CC, warehouseRoof: 0x4C545E, wall: 0xE9E3D6,
    light: 0xFFE08A, towerA: 0xF4EEE2, towerB: 0xC8553D, white: 0xF4EEE2, gold: 0xE9A91E
};
// kontainer warna-warni
const CONT = [0xC8553D, 0x2F6FB5, 0x3E8E4B, 0xE9A91E, 0x8D96A0, 0xB8312A, 0x2C6E8F, 0xD9A527];

function groundY() { return 0; }   // pesisir di luar area aktif: tanah dasar 0

export class Harbor {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'harbor';
        this.base = new THREE.Group();
        this.base.position.set(HX, 0, HZ);
        this.staticGroup = new THREE.Group();
        this.base.add(this.staticGroup);

        this.matCache = new Map();
        this.lampMat = new THREE.MeshBasicMaterial({ color: lin(0xFFE08A) });
        this.beaconMat = new THREE.MeshBasicMaterial({ color: lin(0xC8553D) });
        [this.lampMat, this.beaconMat].forEach(protectMaterial);
        this.lampGeos = [];
        this.signMat = new THREE.MeshBasicMaterial({ map: this.makeSignTexture() });
        this.signGeos = [];
        this.water = makeWaterMaterial({ color: 0x2F6FB5, repeatU: 10, repeatV: 6, flow: 0.004, drift: 0.006 });
        this.time = 0;

        this.buildBasin();
        this.buildQuay();
        this.buildYard();
        this.buildWarehouses();
        this.buildCranes();
        this.buildShip(-62, -28, 0);
        this.buildShip(58, -32, 1);
        this.buildBreakwater();
        this.buildGate();

        const baked = bakeStatic(this.staticGroup, { chunkSize: 90 });
        this.staticGroup.add(baked);
        this.root.add(this.base);
        this.buildLamps();
        this.buildSigns();
        this.buildBeacon();

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
        // Basin air pelabuhan (laut selatan), sedikit di bawah dermaga.
        const g = new THREE.PlaneGeometry(300, 150).rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, this.water);
        m.position.set(HX, SEA_Y, HZ - 45);
        m.name = 'harbor_water';
        m.receiveShadow = true;
        this.root.add(m);
    }

    buildQuay() {
        // Dermaga memanjang sepanjang pantai (x), tepi air di z lokal 0, darat +z.
        this.box(240, 1.2, 20, COL.quay, 0, -0.3, 10, { cast: true });
        this.box(240, 0.08, 19, COL.quayDark, 0, 0.9, 10);
        // Fender tepi air + bollard
        this.box(240, 0.5, 0.6, COL.fender, 0, 0.1, 0.2);
        for (let x = -112; x <= 112; x += 12) {
            this.cyl(0.4, 0.5, 0.9, 8, COL.bollard, x, QUAY_TOP, 1.4, { cast: true });
            this.lampGeos.push({ x, y: QUAY_TOP + 5.6, z: 17 });   // lampu tiang gudang/quay (lihat tiang di buildYard)
        }
        // Tiang lampu quay
        for (let x = -108; x <= 108; x += 24) this.cyl(0.14, 0.18, 5.6, 6, COL.steelDark, x, QUAY_TOP, 17, { cast: true });
    }

    buildYard() {
        // Apron peti kemas di belakang dermaga (z lokal 20..72) + tumpukan kontainer warna-warni.
        this.box(240, 0.2, 54, COL.apron, 0, 0, 47, {});
        // Marka jalur
        for (let x = -110; x <= 110; x += 22) this.box(0.4, 0.02, 50, COL.gold, x, 0.2, 47);
        // Tumpukan kontainer (blok 6x2.5x2.6 m), ditumpuk 1-3 tingkat, deterministik
        let seed = 1337;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let gx = -104; gx <= 104; gx += 13) {
            for (let gz = 30; gz <= 66; gz += 7) {
                if (rnd() < 0.22) continue;                 // lorong forklift
                const tiers = 1 + Math.floor(rnd() * 3);
                for (let t = 0; t < tiers; t++) {
                    const c = CONT[(gx + gz + t * 3 + 800) % CONT.length];
                    this.box(12, 2.6, 2.5, c, gx, 0.2 + t * 2.62, gz, { cast: true });
                    this.box(12.05, 0.1, 0.1, 0x1F1C1A, gx, 0.2 + t * 2.62 + 1.3, gz);  // garis pintu
                }
            }
        }
    }

    buildWarehouses() {
        // Gudang besar di tepi darat (z lokal ~70)
        for (const gx of [-70, 0, 70]) {
            this.box(56, 7, 16, COL.warehouse, gx, 0.2, 74, { cast: true });
            this.box(58, 0.5, 17, COL.warehouseRoof, gx, 7.2, 74, { cast: true });
            // pintu rol
            for (const dx of [-18, -6, 6, 18]) this.box(5, 4.4, 0.2, COL.steelDark, gx + dx, 0.2, 66.1);
            this.box(20, 1.6, 0.3, COL.wall, gx, 5, 66.0);   // panel nama
        }
    }

    /** 3 crane gantry peti kemas: kaki portal straddle quay + boom menjulur ke laut. */
    buildCranes() {
        for (const cx of [-78, 2, 82]) {
            const H = 24, legSpan = 16;
            for (const lz of [2, 18]) {                       // dua rangka kaki (sisi air & darat)
                for (const dx of [-legSpan / 2, legSpan / 2]) {
                    this.cyl(0.5, 0.6, H, 6, COL.craneLeg, cx + dx, QUAY_TOP, lz, { cast: true });
                }
                this.box(legSpan + 1.4, 1.0, 1.0, COL.craneBeam, cx, QUAY_TOP + H, lz);   // balok atas
            }
            // rangka penghubung + kabin
            this.box(1.0, 1.0, 18, COL.craneBeam, cx - legSpan / 2, QUAY_TOP + H, 10);
            this.box(1.0, 1.0, 18, COL.craneBeam, cx + legSpan / 2, QUAY_TOP + H, 10);
            this.box(4, 2.4, 3.2, COL.craneCab, cx + legSpan / 2 - 1, QUAY_TOP + H - 3, 10, { cast: true });
            // Boom menjulur ke laut (-z) dan ekor ke darat (+z)
            this.box(2.0, 1.2, 40, COL.craneBeam, cx, QUAY_TOP + H + 1.4, -8, { cast: true });
            // kabel + spreader (kepala angkat) menggantung di atas kapal
            this.cyl(0.08, 0.08, 10, 5, COL.steelDark, cx, QUAY_TOP + H - 9, -22);
            this.box(6, 0.8, 2.6, COL.steelDark, cx, QUAY_TOP + H - 10, -22, { cast: true });
        }
    }

    /** Kapal kargo: lambung di permukaan air, dek, anjungan, cerobong, beberapa kontainer. */
    buildShip(cx, cz, variant) {
        const L = 72, W = 13, hullH = 4.2;
        const topDeck = SEA_Y + hullH;                 // dasar lambung di permukaan air
        // lambung
        this.box(L, hullH, W, COL.hull, cx, SEA_Y, cz, { cast: true });
        this.box(L - 6, 1.0, W, COL.hullDark, cx, SEA_Y + hullH, cz);
        // haluan meruncing
        this.cyl(hullH / 1.4, 0.4, W, 6, COL.hull, cx - L / 2, SEA_Y + hullH / 2, cz, { rx: Math.PI / 2, ry: Math.PI / 2 });
        // kontainer di dek
        for (let x = -L / 2 + 10; x <= L / 2 - 20; x += 13) {
            for (const dz of [-4, 0, 4]) {
                const tiers = 1 + ((x + variant * 5) % 2 === 0 ? 2 : 1);
                for (let t = 0; t < tiers; t++) {
                    this.box(12, 2.5, 2.4, CONT[(x + dz + t + variant * 4 + 400) % CONT.length], cx + x, topDeck + 0.5 + t * 2.52, cz + dz, { cast: true });
                }
            }
        }
        // anjungan + cerobong di buritan (+x)
        this.box(12, 7, W - 1, COL.bridge, cx + L / 2 - 9, topDeck + 0.5, cz, { cast: true });
        for (let y = 1.2; y < 6; y += 1.6) this.box(12.1, 0.12, W - 0.9, COL.craneCab, cx + L / 2 - 9, topDeck + 0.5 + y, cz);  // jendela
        this.cyl(1.4, 1.6, 4.0, 10, COL.funnel, cx + L / 2 - 6, topDeck + 7.5, cz, { cast: true });
        this.box(2.4, 0.3, 2.4, 0x1F1C1A, cx + L / 2 - 6, topDeck + 11.5, cz);
        // tiang haluan + lampu
        this.cyl(0.2, 0.2, 6, 6, COL.steelDark, cx - L / 2 + 8, topDeck, cz, { cast: true });
        this.lampGeos.push({ x: cx, y: topDeck + 13, z: cz, r: 0.3 });
    }

    buildBreakwater() {
        // Lengan pemecah gelombang + mercusuar di ujung timur
        for (let k = 0; k < 10; k++) {
            const x = 120 + k * 7, z = -6 - k * 6;
            this.box(8, 1.6, 8, k % 2 ? COL.quayDark : COL.quay, x, -0.3, z, { ry: 0.3 });
        }
        const lx = 190, lz = -60;
        this.cyl(2.2, 2.8, 0.8, 10, COL.quayDark, lx, 0.5, lz);
        this.cyl(1.3, 1.6, 9, 10, COL.towerA, lx, 1.3, lz, { cast: true });
        for (const y of [3.0, 5.0, 7.0]) this.cyl(1.35, 1.35, 1.0, 10, COL.towerB, lx, 1.3 + y, lz);
        this.cyl(1.5, 1.5, 0.4, 10, COL.steelDark, lx, 10.3, lz);
        this.beaconPos = { x: HX + lx, y: 11.0, z: HZ + lz };   // beacon mercusuar (dunia)
        this.cyl(0, 1.0, 1.2, 8, COL.towerB, lx, 11.0, lz);
    }

    buildGate() {
        // Gerbang pelabuhan + papan nama di sisi darat (z lokal ~90)
        for (const dx of [-30, 30]) this.box(3, 10, 3, COL.quayDark, dx, 0.2, 90, { cast: true });
        this.box(66, 2.4, 2.2, COL.craneBeam, 0, 9, 90, { cast: true });
        this.signGeos.push({ x: 0, y: 7.2, z: 88.8, ry: 0 });
    }

    makeSignTexture() {
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 160;
        const x = c.getContext('2d');
        x.fillStyle = '#123A6B'; x.fillRect(0, 0, 1024, 160);
        x.strokeStyle = '#E9A91E'; x.lineWidth = 10; x.strokeRect(8, 8, 1008, 144);
        x.fillStyle = '#FBE7B0'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 72px Georgia, serif';
        x.fillText('⚓  PELABUHAN  AUDIRA', 512, 66);
        x.font = 'bold 32px Georgia, serif'; x.fillStyle = '#FFFFFF';
        x.fillText('AUDIRA SEAPORT · audira.my.id', 512, 122);
        const t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
        return t;
    }

    buildSigns() {
        const geos = [];
        for (const s of this.signGeos) {
            const nx = Math.sin(s.ry), nz = Math.cos(s.ry);
            for (const side of [-1, 1]) {
                const pg = new THREE.PlaneGeometry(60, 5.6);
                if (side < 0) pg.rotateY(Math.PI);
                pg.rotateY(s.ry);
                pg.translate(HX + s.x - nx * side * 0.1, s.y, HZ + s.z - nz * side * 0.1);
                geos.push(pg);
            }
        }
        if (!geos.length) return;
        const m = new THREE.Mesh(mergeUV(geos), this.signMat);
        m.name = 'harbor_sign'; m.userData.detail = 340;
        this.root.add(m);
    }

    buildLamps() {
        if (!this.lampGeos.length) return;
        const geos = this.lampGeos.map(l => {
            const g = new THREE.SphereGeometry(l.r || 0.24, 6, 5);
            g.translate(HX + l.x, l.y, HZ + l.z);
            return g;
        });
        this.lampMesh = new THREE.Mesh(mergeUV(geos), this.lampMat);
        this.lampMesh.name = 'harbor_lamps';
        this.root.add(this.lampMesh);
    }

    buildBeacon() {
        if (!this.beaconPos) return;
        const g = new THREE.SphereGeometry(0.8, 8, 6);
        g.translate(this.beaconPos.x, this.beaconPos.y, this.beaconPos.z);
        this.beacon = new THREE.Mesh(g, this.beaconMat);
        this.beacon.name = 'harbor_beacon';
        this.root.add(this.beacon);
    }

    update(dt) {
        this.time += dt || 0;
        if (this.beacon) {
            const on = (this.time % 2.0) < 0.5;
            this.beaconMat.color.copy(lin(on ? 0x6FE0A0 : 0x1E5A3A));   // hijau navigasi
        }
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
            if (group.querySelector('.btn-zone-harbor')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-harbor';
            btn.title = 'Fokus ke Pelabuhan AUDIRA (pesisir selatan-timur)';
            btn.textContent = '⚓ Pelabuhan';
            group.insertBefore(btn, group.firstChild);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-harbor)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(HX, 0, HZ - 10);
        const a = 340 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 42 * Math.PI / 180;
        cam.distanceDesired = 260;
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
