/* global THREE */
/**
 * AUDIRA-LAND: Bandara AUDIRA (landmark megah statis). Spesifikasi: docs/SPEC_BUS_TERMINAL_AIRPORT.md
 *
 * Lokasi: pita terbuka utara-barat kota (X -285..10, Z 182..284) — barat teras sawah utara, selatan
 * snow valley, utara kota. Runway timur-barat, taxiway, apron, terminal penumpang megah, menara ATC
 * dengan beacon berkedip, 2 pesawat parkir (prosedural). Dimuat lazy (import dinamis di main.js) agar
 * bundel awal kecil (anggaran JS gzip <= 160 KB).
 *
 * Kinerja (anggaran draw <= 100 @390px): seluruh struktur (termasuk pesawat) dilebur bakeStatic ->
 * ~1-2 draw lambert. Papan nama 1 atlas (1 draw). Lampu tepi + jendela menyala 1 mesh Basic (protected).
 * Beacon ATC 1 mesh Basic kecil (berkedip). Zero-Submerging: semua objek bertumpu pada slab tarmac
 * (dasar y = permukaan tanah + micro-lift, puncak slab ~0.25).
 *
 * API: new Airport(scene) -> .update(dt), .setNight(isNight), .attachCameraPreset(cam), .focusCamera()
 */

import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { getSurfaceIndex } from '../core/surface_index.js';
import { GRID_CONFIG } from '../core/constants.js';
import { pfGeo, pfScaleTo, pfMaterial, pfLiveMaterial } from './polyfork_library.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
const LIFT = GRID_CONFIG.MICRO_LIFT || 0.02;

// Model pesawat Polyfork (CC BY 4.0, kredit docs/CREDITS_POLYFORK.md). Dimuat lazy sebelum
// Airport dibuat (main.js: preloadPolyfork). Bila belum siap -> fallback mesh prosedural.
const PLANE_ID = 'narrow-body-airliner-619183';   // dasar y=0 (roda), pusat XZ=0, hidung +Z

// Pusat bandara (dunia). Semua bagian dibangun di koordinat lokal relatif ke pusat ini.
const CX = -135, CZ = 233;
const S = 0.25;   // puncak slab tarmac (dasar objek)

const COL = {
    grass: 0x5E9446, tarmac: 0x3A3C42, apron: 0x44464D, runway: 0x2E3035,
    mark: 0xF4EEE2, bay: 0xF2C230, kerb: 0x9E978C,
    wall: 0xE9E3D6, wallDark: 0xBFA98A, glass: 0x2C6E8F, glassDark: 0x1E4E66,
    roof: 0x8D96A0, roofEdge: 0xE9A91E, steel: 0x8D96A0, steelDark: 0x4C545E,
    towerBody: 0xD6CBBF, towerCab: 0x2C6E8F, red: 0xC8553D,
    planeBody: 0xF2EEE6, planeTail: 0x1F5FA8, planeWing: 0xD6CBBF, planeEngine: 0x4C545E, planeTrim: 0xE9A91E
};

function groundY(x, z) {
    const idx = getSurfaceIndex();
    return (idx ? idx.at(x, z).y : 0) + LIFT;
}

export class Airport {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'airport';
        this.base = new THREE.Group();
        this.base.position.set(CX, groundY(CX, CZ), CZ);
        this.staticGroup = new THREE.Group();
        this.base.add(this.staticGroup);

        this.matCache = new Map();
        this.lampMat = new THREE.MeshBasicMaterial({ color: lin(0xFFE08A) });
        this.beaconMat = new THREE.MeshBasicMaterial({ color: lin(0xC8553D) });
        [this.lampMat, this.beaconMat].forEach(protectMaterial);
        this.lampGeos = [];
        this.signMat = new THREE.MeshBasicMaterial({ map: this.makeSignTexture() });
        this.signGeos = [];
        this.time = 0;

        this.buildGround();
        this.buildRunway();
        this.buildTaxiwayApron();
        this.buildTerminal();
        this.buildTower();
        this.buildPlane(70, 22, 0);          // lokal: apron, dekat terminal
        this.buildPlane(18, 22, 0.5);
        this.buildWindsock(-120, 18);

        const baked = bakeStatic(this.staticGroup, { chunkSize: 60 });
        this.staticGroup.add(baked);
        this.root.add(this.base);
        this.buildLamps();
        this.buildSigns();
        this.buildBeacon();
        this.buildFlyer();

        scene.add(this.root);
    }

    mat(hex) {
        if (!this.matCache.has(hex)) this.matCache.set(hex, new THREE.MeshLambertMaterial({ color: lin(hex) }));
        return this.matCache.get(hex);
    }
    // Primitif lokal (dasar di y0 lokal; slab = 0..S)
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

    buildGround() {
        // Slab rumput lapangan udara (puncak y = S) menutupi seluruh area, lalu tarmac di atasnya.
        this.box(300, S, 112, COL.grass, -20, 0, 0);
    }

    buildRunway() {
        // Runway timur-barat (sepanjang X lokal), z lokal = -27, panjang 270, lebar 18.
        const z = -27, L = 270, W = 18;
        this.box(L, 0.04, W, COL.runway, 0, S, z);
        // Marka tengah putus-putus
        for (let x = -L / 2 + 8; x <= L / 2 - 8; x += 14) this.box(7, 0.02, 0.8, COL.mark, x, S + 0.04, z);
        // Threshold piano keys + nomor di kedua ujung
        for (const s of [-1, 1]) {
            const ex = s * (L / 2 - 2);
            for (let k = -3; k <= 3; k++) this.box(4.5, 0.02, 1.4, COL.mark, ex - s * 3, S + 0.04, z + k * 2.3);
            // tepi runway
        }
        for (const s of [-1, 1]) {
            this.box(L, 0.05, 0.5, COL.mark, 0, S + 0.03, z + s * (W / 2 - 0.5));
        }
        // Lampu tepi runway (world via base) — kumpulkan untuk 1 mesh Basic
        for (let x = -L / 2 + 6; x <= L / 2 - 6; x += 18) {
            for (const s of [-1, 1]) this.lampGeos.push({ x, y: S + 0.35, z: z + s * (W / 2 + 0.6), r: 0.22 });
        }
    }

    buildTaxiwayApron() {
        // Taxiway sejajar (z lokal -3) menghubungkan runway ke apron
        this.box(240, 0.04, 8, COL.tarmac, 0, S, -3);
        for (let x = -110; x <= 110; x += 10) this.box(5, 0.02, 0.4, COL.bay, x, S + 0.04, -3);
        // Penghubung runway<->taxiway
        for (const x of [-90, 0, 90]) this.box(8, 0.04, 22, COL.tarmac, x, S, -15);
        // Apron besar di depan terminal (z lokal 4..46)
        this.box(250, 0.05, 44, COL.apron, 0, S, 25);
        // Marka parkir pesawat
        for (const x of [70, 18]) {
            this.box(0.4, 0.02, 30, COL.bay, x - 16, S + 0.05, 22);
            this.box(0.4, 0.02, 30, COL.bay, x + 16, S + 0.05, 22);
            this.box(32, 0.02, 0.4, COL.bay, x, S + 0.05, 8);
        }
    }

    buildTerminal() {
        // Terminal penumpang megah di utara apron (z lokal ~ 44), fasad kaca menghadap -Z (apron).
        const tz = 46, tx = 30, W = 150, D = 22, H = 9;
        this.box(W, 0.4, D, COL.wallDark, tx, S, tz);                 // plinth
        this.box(W, H, D, COL.wall, tx, S + 0.4, tz, { cast: true }); // badan
        // Fasad kaca bergaris (menghadap apron -Z)
        for (let x = tx - W / 2 + 4; x <= tx + W / 2 - 4; x += 5) {
            this.box(3.6, H - 2, 0.3, COL.glass, x, S + 1.2, tz - D / 2 - 0.02);
        }
        this.box(W, 1.2, 0.5, COL.glassDark, tx, S + 0.6, tz - D / 2 - 0.02);
        // Atap gelombang (beberapa lengkung) + lis emas
        for (let x = tx - W / 2 + 10; x <= tx + W / 2 - 10; x += 20) {
            this.cyl(3.2, 3.2, 20, 12, COL.roof, x, S + H, tz, { rx: Math.PI / 2, cast: true });
        }
        this.box(W + 2, 0.5, D + 2, COL.roofEdge, tx, S + H + 0.2, tz);
        // Kanopi keberangkatan menjulur ke apron
        this.box(W, 0.4, 7, COL.roof, tx, S + 4.4, tz - D / 2 - 4, { cast: true });
        for (let x = tx - W / 2 + 8; x <= tx + W / 2 - 8; x += 24) this.cyl(0.2, 0.2, 4.4, 8, COL.steelDark, x, S, tz - D / 2 - 7, { cast: true });
        // Jetbridge ke arah pesawat
        for (const px of [70, 18]) {
            this.box(2.2, 2.4, 10, COL.wallDark, px, S + 1.6, tz - D / 2 - 7, { cast: true });
            this.box(2.2, 2.4, 4, COL.glass, px, S + 1.6, tz - D / 2 - 12);
        }
        // Jendela menyala (malam) di fasad: kumpul 1 mesh Basic
        for (let x = tx - W / 2 + 6; x <= tx + W / 2 - 6; x += 10) this.lampGeos.push({ x, y: S + 3.5, z: tz - D / 2 - 0.1, r: 0.5, win: true });
        // Papan nama besar di atap + logo in-scene (anti-reupload)
        this.signGeos.push({ x: tx, y: S + H + 2.4, z: tz - D / 2 - 0.1, ry: 0 });
    }

    buildTower() {
        // Menara ATC di sisi barat terminal
        const x = -60, z = 42, H = 22;
        this.cyl(1.6, 2.2, H, 10, COL.towerBody, x, S, z, { cast: true });
        this.cyl(3.2, 2.6, 2.4, 12, COL.towerCab, x, S + H, z, { cast: true });     // kabin kaca
        this.cyl(3.4, 3.4, 0.4, 12, COL.roofEdge, x, S + H + 2.4, z);
        this.cyl(3.0, 3.0, 0.3, 12, COL.glassDark, x, S + H + 0.2, z);
        this.beaconPos = { x: x + CX, y: groundY(CX, CZ) + S + H + 3.1, z: z + CZ };
        // tiang antena
        this.cyl(0.08, 0.08, 3.0, 6, COL.steelDark, x, S + H + 2.8, z);
    }

    /** Pesawat parkir di apron menghadap -Z. GLB Polyfork bila siap, selain itu prosedural. */
    buildPlane(x, z, seedTilt = 0) {
        const g = pfGeo(PLANE_ID);
        if (g) {
            // GLB: dasar y=0 (roda) -> taruh di puncak slab (S). Hidung +Z -> putar PI agar ke -Z.
            const m = new THREE.Mesh(g, pfMaterial());
            m.scale.setScalar(pfScaleTo(PLANE_ID, 'z', 36));   // panjang ~36 m
            m.position.set(x, S, z);
            m.rotation.y = Math.PI + seedTilt * 0.04;
            m.castShadow = true; m.receiveShadow = true;
            this.staticGroup.add(m);                            // ikut bakeStatic -> 0 draw tambahan
            return;
        }
        this.buildPlaneProc(x, z, seedTilt);
    }

    /** Pesawat prosedural (hidung +X), parkir di apron menghadap -Z. baseLocal (x,z). */
    buildPlaneProc(x, z, seedTilt = 0) {
        const bodyY = S + 2.4;          // sumbu badan di atas roda
        const L = 34, R = 1.8;
        const ry = Math.PI / 2;         // hidung menghadap -Z (ke taxiway/runway) ; putar badan X->Z
        // badan (silinder sepanjang X lokal, lalu diputar ry agar sepanjang Z)
        this.cyl(R, R, L, 12, COL.planeBody, x, bodyY, z, { rz: Math.PI / 2, ry, cast: true });
        // hidung + ekor kerucut
        this.cyl(0.2, R, 3.2, 12, COL.planeBody, x - Math.sin(ry) * (L / 2 + 1.2), bodyY, z - Math.cos(ry) * (L / 2 + 1.2), { rz: Math.PI / 2, ry });
        // sayap (rentang ~30) melintang
        this.box(2.2, 0.5, 30, COL.planeWing, x, bodyY - 0.2, z, { ry, cast: true });
        // stabilizer horizontal
        this.box(1.4, 0.4, 11, COL.planeWing, x + Math.sin(ry) * (L / 2 - 3), bodyY + 0.4, z + Math.cos(ry) * (L / 2 - 3), { ry });
        // sirip ekor vertikal
        this.box(3.6, 4.6, 0.5, COL.planeTail, x + Math.sin(ry) * (L / 2 - 2), bodyY + 2.6, z + Math.cos(ry) * (L / 2 - 2), { ry, cast: true });
        // mesin di bawah sayap
        for (const s of [-1, 1]) {
            const ex = x + Math.cos(ry) * 0, ez = z;
            this.cyl(0.9, 0.9, 3.0, 10, COL.planeEngine, x - s * 0 + Math.cos(ry) * 0, bodyY - 1.4, z + s * 9, { rz: Math.PI / 2, ry });
        }
        // garis trim + jendela
        this.box(0.9, 0.5, L - 2, COL.planeTrim, x, bodyY + 0.4, z, { ry });
        // roda pendukung (dasar menyentuh slab -> Zero-Submerging)
        for (const [dx, dz] of [[0, 10], [0, -6], [0, -6.6]]) {
            this.cyl(0.5, 0.5, 0.4, 8, COL.steelDark, x + dx, S + 0.2, z + dz, { rz: Math.PI / 2 });
            this.cyl(0.12, 0.12, 2.0, 6, COL.steelDark, x + dx, S + 0.2, z + dz);
        }
    }

    buildWindsock(x, z) {
        this.cyl(0.08, 0.1, 5.0, 6, COL.steelDark, x, S, z, { cast: true });
        for (let k = 0; k < 4; k++) {
            this.cyl(0.5 - k * 0.08, 0.42 - k * 0.08, 0.7, 8, k % 2 ? COL.mark : COL.red, x + 0.6 + k * 0.7, S + 4.8, z, { rz: Math.PI / 2 });
        }
    }

    makeSignTexture() {
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 160;
        const x = c.getContext('2d');
        x.fillStyle = '#123A6B'; x.fillRect(0, 0, 1024, 160);
        x.strokeStyle = '#E9A91E'; x.lineWidth = 10; x.strokeRect(8, 8, 1008, 144);
        x.fillStyle = '#FBE7B0'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 76px Georgia, serif';
        x.fillText('✈  BANDARA  AUDIRA', 512, 68);
        x.font = 'bold 34px Georgia, serif'; x.fillStyle = '#FFFFFF';
        x.fillText('AUDIRA INTERNATIONAL · audira.my.id', 512, 122);
        const t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
        return t;
    }

    buildSigns() {
        const geos = [];
        for (const s of this.signGeos) {
            const nx = Math.sin(s.ry), nz = Math.cos(s.ry);
            for (const side of [-1, 1]) {
                const pg = new THREE.PlaneGeometry(44, 6.9);
                if (side < 0) pg.rotateY(Math.PI);
                pg.rotateY(s.ry);
                pg.translate(CX + s.x - nx * side * 0.1, s.y + groundY(CX, CZ), CZ + s.z - nz * side * 0.1);
                geos.push(pg);
            }
        }
        if (!geos.length) return;
        const m = new THREE.Mesh(mergeUV(geos), this.signMat);
        m.name = 'airport_sign'; m.userData.detail = 320;
        this.root.add(m);
    }

    buildLamps() {
        if (!this.lampGeos.length) return;
        const geos = this.lampGeos.map(l => {
            const g = l.win ? new THREE.BoxGeometry(5, 2.4, 0.2) : new THREE.SphereGeometry(l.r || 0.22, 6, 5);
            g.translate(CX + l.x, groundY(CX, CZ) + l.y, CZ + l.z);
            return g;
        });
        this.lampMesh = new THREE.Mesh(mergeUV(geos), this.lampMat);
        this.lampMesh.name = 'airport_lamps';
        this.root.add(this.lampMesh);
    }

    buildBeacon() {
        if (!this.beaconPos) return;
        const g = new THREE.SphereGeometry(0.6, 8, 6);
        g.translate(this.beaconPos.x, this.beaconPos.y, this.beaconPos.z);
        this.beacon = new THREE.Mesh(g, this.beaconMat);
        this.beacon.name = 'airport_beacon';
        this.root.add(this.beacon);
    }

    /** Pesawat yang TERBANG berputar di atas bandara (tidak dilebur; digerakkan di update). */
    buildFlyer() {
        const glb = pfGeo(PLANE_ID);
        if (glb) {
            // 1 mesh GLB (vertex color via pfLiveMaterial). Hidung +Z -> heading pakai atan2(vx, vz).
            const m = new THREE.Mesh(glb, pfLiveMaterial());
            m.scale.setScalar(pfScaleTo(PLANE_ID, 'z', 34));
            m.castShadow = true;
            this.flyer = new THREE.Group();
            this.flyer.name = 'airport_flyer';
            this.flyer.add(m);
            this.flyerNoseZ = true;
            this.flyT = 0;
            this.root.add(this.flyer);
            return;
        }
        this.flyerNoseZ = false;
        const g = new THREE.Group();
        g.name = 'airport_flyer';
        const m = (geo, hex) => { const o = new THREE.Mesh(geo, this.mat(hex)); o.castShadow = true; return o; };
        const L = 30, R = 1.6;
        // badan (hidung +X): silinder sumbu Y -> putar ke X
        const body = m(new THREE.CylinderGeometry(R, R, L, 12), COL.planeBody); body.rotation.z = Math.PI / 2; g.add(body);
        const nose = m(new THREE.CylinderGeometry(0.2, R, 3, 12), COL.planeBody); nose.rotation.z = Math.PI / 2; nose.position.x = L / 2 + 1.3; g.add(nose);
        const tailCone = m(new THREE.CylinderGeometry(R, 0.3, 3, 12), COL.planeBody); tailCone.rotation.z = Math.PI / 2; tailCone.position.x = -L / 2 - 1.3; g.add(tailCone);
        const wing = m(new THREE.BoxGeometry(6, 0.5, 30), COL.planeWing); wing.position.set(1, -0.4, 0); g.add(wing);
        const hstab = m(new THREE.BoxGeometry(3.4, 0.4, 12), COL.planeWing); hstab.position.set(-L / 2 + 2, 0.4, 0); g.add(hstab);
        const fin = m(new THREE.BoxGeometry(3.6, 4.8, 0.5), COL.planeTail); fin.position.set(-L / 2 + 2, 2.8, 0); g.add(fin);
        for (const s of [-1, 1]) {
            const eng = m(new THREE.CylinderGeometry(0.9, 0.9, 3.2, 10), COL.planeEngine); eng.rotation.z = Math.PI / 2; eng.position.set(1.5, -1.5, s * 9); g.add(eng);
        }
        const trim = m(new THREE.BoxGeometry(L - 2, 0.6, 0.5), COL.planeTrim); trim.position.set(0, 0.5, 0); g.add(trim);
        // Lebur bagian pesawat -> 1 mesh (hemat draw); dibungkus grup luar yang digerakkan.
        const baked = bakeStatic(g, { relativeTo: g, mergeShadow: true });
        this.flyer = new THREE.Group();
        this.flyer.name = 'airport_flyer';
        for (const c of [...baked.children]) this.flyer.add(c);
        this.flyT = 0;
        this.root.add(this.flyer);
    }

    update(dt) {
        this.time += dt || 0;
        if (this.beacon) {
            const on = (this.time % 1.6) < 0.4;
            this.beaconMat.color.copy(lin(on ? 0xFF5A3C : 0x5A221A));
        }
        if (this.flyer) {
            this.flyT += (dt || 0) * 0.14;                    // laju putar
            const a = this.flyT, rx = 235, rz = 120;
            const x = CX + rx * Math.cos(a), z = (CZ - 27) + rz * Math.sin(a);   // berpusat di runway (dunia)
            const y = groundY(CX, CZ) + 46 + Math.sin(a * 2) * 16;        // naik-turun lembut (seperti lepas landas/mendarat)
            // arah kecepatan (turunan elips)
            const vx = -rx * Math.sin(a), vz = rz * Math.cos(a);
            this.flyer.position.set(x, y, z);
            // GLB hidung +Z: atan2(vx, vz). Prosedural hidung +X: atan2(-vz, vx).
            this.flyer.rotation.y = this.flyerNoseZ ? Math.atan2(vx, vz) : Math.atan2(-vz, vx);
            this.flyer.rotation.z = -0.35;                    // miring saat belok (bank)
        }
    }

    setNight(isNight) {
        this.lampMat.color.copy(lin(isNight ? 0xFFE08A : 0xBFC6CC));
        this.night = isNight;
    }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 420);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-airport')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-airport';
            btn.title = 'Fokus ke Bandara AUDIRA (tepi utara-barat kota)';
            btn.textContent = '✈ Bandara';
            group.insertBefore(btn, group.firstChild);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-airport)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(CX, 0, CZ);
        const a = 200 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 40 * Math.PI / 180;
        cam.distanceDesired = 230;
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
