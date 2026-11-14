/* global THREE */
/**
 * AUDIRA-LAND: Terminal Bis Kota (aset dunia statis). Spesifikasi: docs/SPEC_BUS_TERMINAL_AIRPORT.md
 *
 * Beberapa terminal bis kecil di pita terbuka tepi distrik pusat, menempel jalan arteri (Z = ±176),
 * tidak menabrak lot/jalan/sungai (titik di luar grid lot aktif = tanah terbuka, tak pernah jadi lot).
 * Dimuat lazy (import dinamis di main.js) agar bundel awal kecil (anggaran JS gzip <= 160 KB).
 *
 * Kinerja (anggaran draw <= 100 @390px): seluruh struktur dilebur bakeStatic -> ~2 draw (lambert + sign
 * atlas). Lampu 1 mesh Basic (protected, siang/malam). Bis parkir: 1 InstancedMesh (city-bus) untuk
 * SEMUA terminal. Zero-Submerging: dasar tiap terminal = permukaan di (x,z) + micro-lift; bis dasar y=0.
 *
 * API: new BusTerminals(scene) -> .setNight(isNight), .attachCameraPreset(cam), .focusCamera()
 */

import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { getSurfaceIndex } from '../core/surface_index.js';
import { GRID_CONFIG } from '../core/constants.js';
import { isOpenSpace } from '../core/road_network.js';
import { pfGeo, pfLiveMaterial, preloadPolyfork } from './polyfork_library.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
const LIFT = GRID_CONFIG.MICRO_LIFT || 0.02;
const BUS_ID = 'city-bus-49fd97';

const COL = {
    apron: 0x3C3E44, kerb: 0x9E978C, bay: 0xF2C230, mark: 0xFFF9EE,
    platform: 0xC9BBA0, platformTop: 0xE3D6BC, post: 0x8D96A0, postDark: 0x4C545E,
    roof: 0x2F6FB5, roofEdge: 0xE9A91E, bench: 0x7A4E2C, benchLeg: 0x4C545E,
    signPost: 0x4C545E
};

/** y permukaan di (x,z) + micro-lift (di luar area aktif -> tanah dasar 0). */
function groundY(x, z) {
    const idx = getSurfaceIndex();
    return (idx ? idx.at(x, z).y : 0) + LIFT;
}
function surfaceKind(x, z) {
    const idx = getSurfaceIndex();
    return idx ? idx.at(x, z).kind : 'ground';
}

export class BusTerminals {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'bus_terminals';
        this.staticGroup = new THREE.Group();

        this.matCache = new Map();
        this.lampMat = new THREE.MeshBasicMaterial({ color: lin(0xC9C2B4) });
        protectMaterial(this.lampMat);
        this.lampGeos = [];
        this.signMat = new THREE.MeshBasicMaterial({ map: this.makeSignTexture() });
        this.signGeos = [];
        this.busPlacements = [];   // {x,z,ry} dunia

        // Titik tetap: pita terbuka tepi distrik pusat (dekat arteri Z = +-176). face: arah hadap (world ry).
        const spots = [
            { x: -130, z: 190, ry: Math.PI },   // utara-barat (Have), hadap selatan ke kota
            { x: -40, z: 190, ry: Math.PI },    // utara-tengah (dekat jembatan)
            { x: -130, z: -198, ry: 0 },        // selatan-barat (Have)
            { x: -40, z: -198, ry: 0 }          // selatan-tengah (dekat jembatan)
        ];
        for (const extra of this.findOpenSpaceSpots(spots, 1)) spots.push(extra);

        for (const s of spots) this.buildTerminal(s.x, s.z, s.ry);

        const baked = bakeStatic(this.staticGroup, { chunkSize: 0 });
        this.staticGroup.add(baked);
        this.root.add(this.staticGroup);
        this.buildLamps();
        this.buildSigns();
        this.buildBuses();

        scene.add(this.root);
    }

    mat(hex) {
        if (!this.matCache.has(hex)) this.matCache.set(hex, new THREE.MeshLambertMaterial({ color: lin(hex) }));
        return this.matCache.get(hex);
    }

    /** Cari sampai `max` tile isOpenSpace KERING (bukan kolam) Have-Not, jarak >= 110 m dari spot lain. */
    findOpenSpaceSpots(existing, max) {
        const C = GRID_CONFIG, T = C.TILE_SIZE, HALF = C.HALF_TILES;
        const out = [];
        const pts = [...existing];
        const far = (x, z) => pts.every(p => Math.hypot(p.x - x, p.z - z) >= 110);
        // Have-Not = timur sungai (i > RIVER_TILE_MAX_I)
        for (let i = C.RIVER_TILE_MAX_I + 3; i <= C.ACTIVE_MAX_I - 2 && out.length < max; i += 2) {
            for (let j = C.ACTIVE_MIN_J + 2; j <= C.ACTIVE_MAX_J - 2 && out.length < max; j += 2) {
                if (!isOpenSpace(i, j)) continue;
                const x = (i - HALF) * T + T / 2, z = (j - HALF) * T + T / 2;
                if (surfaceKind(x, z) === 'water' || !far(x, z)) continue;
                const spot = { x, z, ry: Math.PI / 2 };
                out.push(spot); pts.push(spot);
            }
        }
        return out;
    }

    /** Satu terminal: apron + marka teluk + peron beratap + bangku + papan + lampu + 1-2 bis. */
    buildTerminal(wx, wz, ry) {
        const g = new THREE.Group();
        g.position.set(wx, groundY(wx, wz), wz);
        g.rotation.y = ry;
        this.staticGroup.add(g);
        const cos = Math.cos(ry), sin = Math.sin(ry);
        const toWorld = (lx, lz) => [wx + lx * cos + lz * sin, wz - lx * sin + lz * cos];

        const box = (w, h, d, hex, x, y0, z, cast = false) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(hex));
            m.position.set(x, y0 + h / 2, z); m.castShadow = cast; m.receiveShadow = true;
            g.add(m); return m;
        };
        const cyl = (r, h, hex, x, y0, z, cast = false) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), this.mat(hex));
            m.position.set(x, y0 + h / 2, z); m.castShadow = cast; m.receiveShadow = true;
            g.add(m); return m;
        };

        // Apron aspal (20 x 12) + kerb tepi
        box(20, 0.16, 12, COL.apron, 0, 0, 0);
        box(20.6, 0.22, 0.4, COL.kerb, 0, 0, -6.1);
        box(20.6, 0.22, 0.4, COL.kerb, 0, 0, 6.1);
        // Teluk bis (marka kuning) di sisi depan (+Z)
        for (const bx of [-5, 6]) {
            box(6.2, 0.02, 0.3, COL.bay, bx, 0.16, 5.4);
            box(0.3, 0.02, 3.0, COL.bay, bx - 3, 0.16, 4.0);
            box(0.3, 0.02, 3.0, COL.bay, bx + 3, 0.16, 4.0);
        }
        // Garis jalur tengah
        for (let x = -8; x <= 8; x += 3) box(1.4, 0.02, 0.18, COL.mark, x, 0.16, 0.5);

        // Peron beratap di belakang (-Z): platform + 6 tiang + atap
        box(16, 0.26, 3.4, COL.platform, 0, 0.16, -3.4);
        box(15.4, 0.04, 2.9, COL.platformTop, 0, 0.42, -3.4);
        for (const px of [-7, -3.5, 0, 3.5, 7]) {
            cyl(0.14, 3.2, COL.post, px, 0.42, -4.4, true);
        }
        box(16.6, 0.3, 4.4, COL.roof, 0, 3.6, -4.0, true);
        box(16.8, 0.16, 0.3, COL.roofEdge, 0, 3.55, -1.85);
        // Bangku di peron
        for (const bx of [-5.5, 0, 5.5]) {
            box(2.6, 0.1, 0.5, COL.bench, bx, 0.86, -3.4);
            box(2.6, 0.5, 0.08, COL.bench, bx, 0.9, -3.9);
            for (const dx of [-1.1, 1.1]) box(0.1, 0.44, 0.44, COL.benchLeg, bx + dx, 0.42, -3.4);
        }

        // Papan nama di 2 tiang depan (atlas tekstur -> dibangun di buildSigns, world coords)
        for (const px of [-7.5, 7.5]) cyl(0.12, 4.0, COL.signPost, px, 0.16, 5.6, true);
        const [sx, sz] = toWorld(0, 5.6);
        this.signGeos.push({ x: sx, y: groundY(wx, wz) + 3.4, z: sz, ry });

        // Lampu di 2 sudut depan (world)
        for (const lx of [-9, 9]) {
            cyl(0.1, 3.4, COL.postDark, lx, 0.16, 5.4, true);
            const [hx, hz] = toWorld(lx, 5.4);
            this.lampGeos.push({ x: hx, y: groundY(wx, wz) + 3.7, z: hz });
        }

        // 1-2 bis parkir di teluk depan (world); bis panjang +Z lokal -> putar agar sejajar kerb (sumbu X lokal).
        // y = puncak apron (dasar grup + 0.16) + micro-lift -> roda bis di atas apron (Zero-Submerging).
        const apronTopY = groundY(wx, wz) + 0.16 + LIFT;
        for (const bx of [-5, 6]) {
            const [px, pz] = toWorld(bx, 3.2);
            this.busPlacements.push({ x: px, z: pz, y: apronTopY, ry: ry + Math.PI / 2 });
        }
    }

    makeSignTexture() {
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 128;
        const x = c.getContext('2d');
        x.fillStyle = '#123A6B'; x.fillRect(0, 0, 1024, 128);
        x.strokeStyle = '#E9A91E'; x.lineWidth = 8; x.strokeRect(6, 6, 1012, 116);
        x.fillStyle = '#FBE7B0'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 60px Georgia, serif';
        x.fillText('🚌  TERMINAL BIS AUDIRA', 512, 66);
        const t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
        return t;
    }

    buildSigns() {
        const geos = [];
        for (const s of this.signGeos) {
            // offset normal (arah hadap) agar dua bidang saling membelakangi
            const nx = Math.sin(s.ry), nz = Math.cos(s.ry);
            for (const side of [-1, 1]) {
                const pg = new THREE.PlaneGeometry(12, 1.5);
                if (side < 0) pg.rotateY(Math.PI);       // sisi belakang
                pg.rotateY(s.ry);
                pg.translate(s.x + nx * side * 0.06, s.y, s.z + nz * side * 0.06);
                geos.push(pg);
            }
        }
        if (!geos.length) return;
        const merged = mergePlanes(geos);
        const m = new THREE.Mesh(merged, this.signMat);
        m.name = 'bus_terminal_signs';
        m.userData.detail = 180;
        this.root.add(m);
    }

    buildLamps() {
        if (!this.lampGeos.length) return;
        const geos = this.lampGeos.map(l => {
            const sg = new THREE.SphereGeometry(0.26, 8, 6);
            sg.translate(l.x, l.y, l.z);
            return sg;
        });
        const merged = mergePlanes(geos);
        this.lampMesh = new THREE.Mesh(merged, this.lampMat);
        this.lampMesh.name = 'bus_terminal_lamps';
        this.root.add(this.lampMesh);
    }

    async buildBuses() {
        if (!this.busPlacements.length) return;
        if (!pfGeo(BUS_ID)) await preloadPolyfork([BUS_ID]).catch(() => {});
        const geo = pfGeo(BUS_ID);
        if (!geo) return;   // glb gagal: tak ada bis (struktur tetap tampil)
        const im = new THREE.InstancedMesh(geo, pfLiveMaterial(), this.busPlacements.length);
        im.name = 'bus_terminal_buses';
        im.castShadow = true; im.receiveShadow = true;
        const d = new THREE.Object3D();
        this.busPlacements.forEach((p, k) => {
            d.position.set(p.x, p.y != null ? p.y : groundY(p.x, p.z), p.z);
            d.rotation.set(0, p.ry, 0);
            d.scale.setScalar(1);
            d.updateMatrix();
            im.setMatrixAt(k, d.matrix);
        });
        im.instanceMatrix.needsUpdate = true;
        this.root.add(im);
    }

    setNight(isNight) {
        this.lampMat.color.copy(lin(isNight ? 0xFFE08A : 0xC9C2B4));
    }

    update() { /* statis */ }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 320);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-bus')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-bus';
            btn.title = 'Fokus ke Terminal Bis Kota (dekat jalan arteri)';
            btn.textContent = '🚌 Terminal Bis';
            group.insertBefore(btn, group.firstChild);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-bus)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(-130, 0, 190);   // terminal utara-barat
        const a = 20 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 42 * Math.PI / 180;
        cam.distanceDesired = 110;
    }
}

/** Gabung beberapa PlaneGeometry/geometri ber-UV menjadi satu BufferGeometry (1 draw). */
function mergePlanes(geos) {
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
