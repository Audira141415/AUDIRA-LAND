/**
 * AUDIRA-LAND: Stadion Cakrawala AUDIRA (stadion sepak bola Desa Have, sisi barat)
 *
 * Kawasan ORIGINAL di LUAR peta aktif, selatan Desa Have (kota berakhir di Z -176). Tidak menutup
 * kavling/jalan. Pintu masuk = ujung selatan jalan arteri kolom x = -168 (plaza di Z -176..-200).
 * Pusat lapangan (-168, -262). Lapangan 105 x 68 m membujur sumbu X.
 *
 * Isi: lapangan bergaris (kanvas), 2 gawang, tribun berundak keliling (mangkuk 12 trap, sudut
 * tertutup), atap kanopi di 4 sisi, 4 menara lampu sorot (menyala malam), papan skor (skor &
 * menit berjalan), plaza + tugu bola emas, loket, tiang bendera, lampu plaza.
 * Bergerak: ±4.700 penonton (InstancedMesh, bobbing + ombak penonton di shader), 22 pemain +
 * wasit (InstancedMesh badan + kaki), bola dengan fisika sederhana (umpan, tembakan, gol).
 * Nama tim fiktif (SURYA vs SAMUDRA); tanpa merek/klub nyata.
 *
 * Draw call: statis dilebur bakeStatic (relatif ke root, mergeShadow). Detail kecil disembunyikan
 * bila kamera > 360 m. Zero-Submerging: semua objek berdiri di atas slab (puncak y = S) + 0,02.
 *
 * API: new HaveStadium(scene) -> .update(dt), .setNight(isNight), .attachCameraPreset(cam), .focusCamera()
 */

import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { PALETTE } from '../core/constants.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

const C = { x: -168, z: -262 };          // pusat lapangan (dunia)
const S = 0.10;                           // puncak slab stadion
const G = S + 0.02;                       // micro-lift Zero-Submerging
const HX = 52.5, HZ = 34;                 // setengah panjang/lebar lapangan
const IX = 61.5, IZ = 41;                 // tepi dalam tribun
const NT = 12, TD = 1.45, TR = 0.8, BW = 1.6;
const OX = IX + NT * TD, OZ = IZ + NT * TD;   // tepi luar trap (78.9 / 58.4)
const tierH = k => BW + TR * (k + 1);
const GOAL_W = 3.66, GOAL_H = 2.44;
const TEAM_NAMES = ['SURYA', 'SAMUDRA'];

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

function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    t.userData = { canvas: c };
    return t;
}

const _mm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
function mergeParts(parts) {
    const pos = [], nor = [], col = [];
    const c = new THREE.Color();
    for (const p of parts) {
        const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
        _mm.compose(_p.set(p.x || 0, p.y || 0, p.z || 0),
            _q.setFromEuler(_e.set(p.rx || 0, p.ry || 0, p.rz || 0)), _s.set(1, 1, 1));
        g.applyMatrix4(_mm);
        c.copy(lin(p.c));
        const pa = g.attributes.position, na = g.attributes.normal;
        for (let i = 0; i < pa.count; i++) {
            pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
            nor.push(na.getX(i), na.getY(i), na.getZ(i));
            col.push(c.r, c.g, c.b);
        }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
}

/**
 * Material figur instanced: bagian ber-vertex-color PUTIH diganti instanceColor (baju/kostum),
 * bagian lain (kulit, rambut, celana) tetap warna vertex. Opsional: bobbing + ombak penonton di shader.
 * Material milik sendiri (bukan material lebur bersama) -> aman dari jebakan instanceColor r128.
 */
function figureMaterial(key, opts = {}) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    const u = m.userData.uniforms = {
        uTime: { value: 0 }, uAmp: { value: opts.bob || 0 }, uWave: { value: opts.wave || 0 }
    };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        let vs = sh.vertexShader.replace('#include <color_vertex>', `
vColor = vec3(1.0);
#ifdef USE_COLOR
    vColor = color;
#endif
#ifdef USE_INSTANCING_COLOR
    if (vColor.r > 0.995 && vColor.g > 0.995 && vColor.b > 0.995) vColor = instanceColor.xyz;
#endif`);
        if (opts.bob) {
            vs = 'uniform float uTime;\nuniform float uAmp;\nuniform float uWave;\n' + vs.replace('#include <begin_vertex>', `
#include <begin_vertex>
#ifdef USE_INSTANCING
    vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
    float ph = ip.x * 0.91 + ip.y * 0.57;
    transformed.y += uAmp * max(0.0, sin(uTime * 2.4 + ph));
    float ang = atan(ip.y, ip.x);
    transformed.y += uWave * smoothstep(0.86, 1.0, cos(ang - uTime * 0.45));
#endif`);
        }
        sh.vertexShader = vs;
    };
    m.customProgramCacheKey = () => 'audira_stadium_fig_' + key;
    return m;
}

export class HaveStadium {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'have_stadium';
        this.root.position.set(C.x, 0, C.z);
        this.staticGroup = new THREE.Group();
        this.staticGroup.name = 'have_stadium_static';
        this.root.add(this.staticGroup);
        this.time = 0;
        this.isNight = false;
        this.far = false;
        this.r = rng(0x5A7D10);
        this.score = [0, 0];
        this.minute = -1;

        const L = hex => new THREE.MeshLambertMaterial({ color: lin(hex) });
        const M = this.M = {
            ground: new THREE.MeshLambertMaterial({ color: PALETTE.GROUND_BASE }),
            slab: L(0xBDB7AC), pave: L(0xD9CCB4), paveDark: L(0xA8987E), grassEdge: L(0x3F7F34),
            concrete: L(0xB8B4AC), concreteDark: L(0x8C8880), cream: L(0xEFE6D2), gold: L(0xD9A527),
            glass: L(0x5C7F9A), white: L(0xF2F2EE), roof: L(0xE6E8EA), steel: L(0x9AA3AD),
            steelDark: L(0x4C545E), asphalt: L(0x36383E), blue: L(0x1F5FA8), seatBlue: L(0x2A6FC0),
            seatWhite: L(0xE8ECF0), seatGold: L(0xE0B030), red: L(0xC0392B), orange: L(0xF08A24),
            green: L(0x2E8B57), trunk: L(0x5E4630), leaf: L(0x4F8A3A), leafLight: L(0x77AE4A),
            black: L(0x222428), bench: L(0x2B4C7E)
        };
        // Material yang berubah siang/malam -> tidak boleh dilebur ke material bersama
        M.lamp = new THREE.MeshBasicMaterial({ color: lin(0xCFCFC8) });
        protectMaterial(M.lamp);
        this.atlas = this.makeAtlas();
        M.atlas = new THREE.MeshBasicMaterial({ map: this.atlas });
        this.lampHeads = [];
        this.plazaLamps = [];

        this.buildGround();
        this.buildPitch();
        this.buildGoals();
        this.buildStands();
        this.buildRoofs();
        this.buildFacade();
        this.buildFloodlights();
        this.buildScoreboard();
        this.buildPlaza();

        this.root.updateMatrixWorld(true);
        const baked = bakeStatic(this.staticGroup, { relativeTo: this.root, mergeShadow: true });
        this.staticGroup.add(baked);
        // Mesh lebur yang kecil/berteks -> ikut LOD jauh
        this.farHide = [];
        baked.traverse(o => { if (o.isMesh && o.material === M.atlas) this.farHide.push(o); });

        this.buildCrowd();
        this.buildPlayers();
        this.buildGlow();
        this.setupCulling();

        scene.add(this.root);
        this.drawScoreboard(0);
        this.update(0);
    }

    // ------------------------------------------------------------------ helper statis
    add(geo, mat, x, y, z, o = {}, parent = this.staticGroup) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (o.rx || o.ry || o.rz) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
        m.castShadow = o.cast === true;
        m.receiveShadow = true;
        parent.add(m);
        return m;
    }
    block(w, h, d, mat, x, y0, z, o = {}, parent) {
        return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y0 + h / 2, z, o, parent);
    }
    cyl(rt, rb, h, seg, mat, x, y0, z, o = {}, parent) {
        return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y0 + h / 2, z, o, parent);
    }
    beam(a, b, t, mat, parent) {
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const len = dir.length();
        const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), mat);
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        m.castShadow = true;
        m.receiveShadow = true;
        (parent || this.staticGroup).add(m);
        return m;
    }
    /** Cincin persegi (4 balok) dari offset dalam (ax,az) ke luar (bx,bz), dasar y0, tinggi h. */
    ring(ax, az, bx, bz, y0, h, mat, cast = false) {
        for (const s of [-1, 1]) {
            this.block(2 * bx, h, bz - az, mat, 0, y0, s * (az + bz) / 2, { cast });
            this.block(bx - ax, h, 2 * az, mat, s * (ax + bx) / 2, y0, 0, { cast });
        }
    }

    // ------------------------------------------------------------------ atlas kanvas
    makeAtlas() {
        // Baris atas (0..160): papan nama fasad. Bawah (160..512): papan skor (digambar ulang).
        return canvasTex(1024, 512, (g, w) => {
            g.fillStyle = '#123A6B'; g.fillRect(0, 0, w, 160);
            g.strokeStyle = '#E8B33A'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, 148);
            g.fillStyle = '#F6D77A'; g.font = 'bold 62px Georgia, serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('STADION CAKRAWALA', w / 2, 62);
            g.fillStyle = '#FFFFFF'; g.font = 'bold 34px Georgia, serif';
            g.fillText('— AUDIRA · DESA HAVE —', w / 2, 120);
        });
    }
    drawScoreboard(minute) {
        const c = this.atlas.userData.canvas, g = c.getContext('2d');
        const w = c.width, y0 = 160, h = 352;
        g.fillStyle = '#0B0F16'; g.fillRect(0, y0, w, h);
        g.strokeStyle = '#3A4658'; g.lineWidth = 10; g.strokeRect(5, y0 + 5, w - 10, h - 10);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#9FD3FF'; g.font = 'bold 36px monospace';
        g.fillText('STADION CAKRAWALA AUDIRA', w / 2, y0 + 44);
        g.font = 'bold 54px monospace';
        g.fillStyle = '#FFB03A'; g.fillText(TEAM_NAMES[0], w * 0.24, y0 + 130);
        g.fillStyle = '#5FB4FF'; g.fillText(TEAM_NAMES[1], w * 0.76, y0 + 130);
        g.fillStyle = '#FFFFFF'; g.font = 'bold 120px monospace';
        g.fillText(`${this.score[0]} - ${this.score[1]}`, w / 2, y0 + 210);
        g.fillStyle = '#7CFF7C'; g.font = 'bold 48px monospace';
        g.fillText(`${String(minute).padStart(2, '0')}'`, w / 2, y0 + 305);
        this.atlas.needsUpdate = true;
    }
    atlasPlane(w, h, top) {
        const g = new THREE.PlaneGeometry(w, h);
        const v0 = top ? 1 - 160 / 512 : 0, v1 = top ? 1 : 1 - 160 / 512;
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
        return g;
    }

    // ------------------------------------------------------------------ tanah & lapangan
    buildGround() {
        const M = this.M;
        // Tanah pengisi di luar tanah kota (tanah kota berhenti di Z -296); tidak menindih tanah taman budaya (X < -290)
        const g = new THREE.PlaneGeometry(268, 140);
        g.rotateX(-Math.PI / 2);
        this.add(g, M.ground, -154 - C.x, -0.07, -360 - C.z);
        // Slab stadion + plaza (puncak y = S): Z dunia -330..-176.5
        this.block(180, 0.16, 154.5, M.slab, 0, S - 0.16, (-68 + 86.5) / 2);
    }

    buildPitch() {
        const M = this.M;
        // Rumput tepi (di luar garis) sampai kaki tribun
        this.block(2 * IX, 0.03, 2 * IZ, M.grassEdge, 0, S, 0);
        // Lapangan bergaris dari kanvas (1 draw call). Malam: emissive menyala (lampu sorot).
        const PW = 112, PD = 75;
        const tex = canvasTex(1600, Math.round(1600 * PD / PW), (g, w, h) => {
            const k = w / PW;                         // px per meter
            const X = m => (m + PW / 2) * k, Z = m => (m + PD / 2) * k;
            for (let i = 0; i < 16; i++) {           // garis potong rumput
                g.fillStyle = i % 2 ? '#3E8E3A' : '#4A9C44';
                g.fillRect(X(-PW / 2 + i * PW / 16), 0, PW / 16 * k + 1, h);
            }
            g.strokeStyle = '#F4F4EE'; g.lineWidth = Math.max(3, 0.14 * k);
            const rect = (x0, z0, x1, z1) => g.strokeRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
            rect(-HX, -HZ, HX, HZ);
            g.beginPath(); g.moveTo(X(0), Z(-HZ)); g.lineTo(X(0), Z(HZ)); g.stroke();
            g.beginPath(); g.arc(X(0), Z(0), 9.15 * k, 0, Math.PI * 2); g.stroke();
            for (const s of [-1, 1]) {
                const gx = s * HX;
                rect(Math.min(gx, gx - s * 16.5), -20.16, Math.max(gx, gx - s * 16.5), 20.16);
                rect(Math.min(gx, gx - s * 5.5), -9.16, Math.max(gx, gx - s * 5.5), 9.16);
                const px = gx - s * 11;
                g.fillStyle = '#F4F4EE';
                g.beginPath(); g.arc(X(px), Z(0), 0.25 * k, 0, Math.PI * 2); g.fill();
                // busur D di luar kotak penalti
                const a = Math.acos(5.5 / 9.15);
                g.beginPath();
                if (s > 0) g.arc(X(px), Z(0), 9.15 * k, Math.PI - a, Math.PI + a);
                else g.arc(X(px), Z(0), 9.15 * k, -a, a);
                g.stroke();
                for (const sz of [-1, 1]) {             // busur pojok
                    g.beginPath();
                    g.arc(X(gx), Z(sz * HZ), 1 * k, 0, Math.PI * 2);
                    g.stroke();
                }
            }
            g.fillStyle = '#F4F4EE';
            g.beginPath(); g.arc(X(0), Z(0), 0.25 * k, 0, Math.PI * 2); g.fill();
        });
        this.pitchMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x000000, emissiveMap: tex });
        protectMaterial(this.pitchMat);
        const geo = new THREE.PlaneGeometry(PW, PD);
        geo.rotateX(-Math.PI / 2);
        const pitch = new THREE.Mesh(geo, this.pitchMat);
        pitch.position.set(0, S + 0.04, 0);
        pitch.receiveShadow = true;
        pitch.userData.noBatch = true;
        this.root.add(pitch);
        this.pitch = pitch;
    }

    buildGoals() {
        const M = this.M;
        for (const s of [-1, 1]) {
            const x = s * HX, back = s * (HX + 2.0);
            for (const z of [-GOAL_W, GOAL_W]) {
                this.block(0.12, GOAL_H, 0.12, M.white, x, G, z, { cast: true });
                this.block(0.06, GOAL_H * 0.6, 0.06, M.white, back, G, z);
                this.beam([x, G + GOAL_H, z], [back, G + GOAL_H * 0.6, z], 0.05, M.white);
                this.block(2.0, 0.05, 0.05, M.white, (x + back) / 2, G, z);
            }
            this.block(0.12, 0.12, 2 * GOAL_W + 0.12, M.white, x, G + GOAL_H, 0, { cast: true });
            this.block(0.05, 0.05, 2 * GOAL_W, M.white, back, G + GOAL_H * 0.6 - 0.05, 0);
            // jaring: kisi tipis
            for (let k = -3; k <= 3; k++) this.beam([x, G + GOAL_H, k * GOAL_W / 3.5], [back, G, k * GOAL_W / 3.5], 0.02, M.white);
            for (let y = 0.4; y < GOAL_H; y += 0.5) {
                const t = y / GOAL_H, bx = x + (back - x) * (1 - t);
                this.block(0.02, 0.02, 2 * GOAL_W, M.white, bx, G + y, 0);
            }
        }
        // Bangku cadangan (sisi utara, menghadap lapangan)
        for (const x of [-12, 12]) {
            this.block(8, 0.5, 1.6, M.concreteDark, x, S, HZ + 4.2);
            this.block(8, 0.1, 1.8, M.glass, x, S + 2.2, HZ + 4.0);
            for (const dx of [-3.9, 3.9]) this.block(0.1, 2.1, 0.1, M.steel, x + dx, S + 0.1, HZ + 4.9);
            this.block(8, 1.6, 0.12, M.glass, x, S + 0.5, HZ + 4.95);
        }
    }

    // ------------------------------------------------------------------ tribun
    seatMat(k) {
        return k < 6 ? this.M.seatBlue : k < 9 ? this.M.seatWhite : this.M.seatGold;
    }
    isAisle(along, step, half) {
        const m = ((along + half) % step + step) % step;
        return Math.min(m, step - m) < 0.75;
    }
    buildStands() {
        const M = this.M;
        // Dinding papan iklan polos di depan tribun (warna AUDIRA, tanpa merek)
        this.ring(IX - 0.25, IZ - 0.25, IX, IZ, S, 1.1, M.blue);
        for (let k = 0; k < NT; k++) {
            const ax = IX + k * TD, az = IZ + k * TD, bx = ax + TD, bz = az + TD;
            const h = tierH(k);
            this.ring(ax, az, bx, bz, S, h, k % 2 ? M.concrete : M.concreteDark, k === NT - 1);
            this.ring(ax + 0.7, az + 0.7, bx, bz, S + h, 0.3, this.seatMat(k));
            // Tangga lorong (abu-abu) menembus baris kursi
            for (let x = -54; x <= 54.01; x += 12) for (const s of [-1, 1]) {
                this.block(1.2, 0.32, TD, M.concrete, x, S + h, s * (az + bz) / 2);
            }
            for (let z = -36; z <= 36.01; z += 12) for (const s of [-1, 1]) {
                this.block(TD, 0.32, 1.2, M.concrete, s * (ax + bx) / 2, S + h, z);
            }
        }
        // Dinding belakang tribun (parapet) setinggi 15 m
        this.ring(OX, OZ, OX + 0.6, OZ + 0.6, S, 15, M.cream, true);
    }

    buildRoofs() {
        const M = this.M;
        const yB = 21.0, yF = 19.0;
        // Sisi panjang (±z): kolom di belakang dinding, rangka kantilever ke tepi depan
        for (const s of [-1, 1]) {
            const zb = s * (OZ + 1.2), zf = s * (IZ + 2), depth = Math.abs(zb - zf);
            const slope = Math.atan2(yB - yF, depth);
            this.add(new THREE.BoxGeometry(2 * IX + 2, 0.4, depth + 0.6), M.roof, 0, (yB + yF) / 2, (zb + zf) / 2,
                { rx: s * slope, cast: true });
            this.block(2 * IX + 2, 0.9, 0.3, M.gold, 0, yF - 0.6, zf);
            for (let x = -60; x <= 60.01; x += 12) {
                this.block(0.8, yB + 1.5 - S, 0.8, M.steel, x, S, zb, { cast: true });
                this.beam([x, yB + 1.5, zb], [x, yF + 0.2, zf], 0.35, M.steelDark);
            }
        }
        // Sisi pendek (±x)
        for (const s of [-1, 1]) {
            const xb = s * (OX + 1.2), xf = s * (IX + 2), depth = Math.abs(xb - xf);
            const slope = Math.atan2(yB - yF, depth);
            this.add(new THREE.BoxGeometry(depth + 0.6, 0.4, 2 * IZ + 2), M.roof, (xb + xf) / 2, (yB + yF) / 2, 0,
                { rz: -s * slope, cast: true });
            this.block(0.3, 0.9, 2 * IZ + 2, M.gold, xf, yF - 0.6, 0);
            for (let z = -36; z <= 36.01; z += 12) {
                this.block(0.8, yB + 1.5 - S, 0.8, M.steel, xb, S, z, { cast: true });
                this.beam([xb, yB + 1.5, z], [xf, yF + 0.2, z], 0.35, M.steelDark);
            }
        }
    }

    buildFacade() {
        const M = this.M;
        const ax = OX + 0.6, az = OZ + 0.6;
        // Pita kaca & sabuk emas di sisi luar dinding belakang
        this.ring(ax, az, ax + 0.15, az + 0.15, S + 3.5, 6.5, M.glass);
        this.ring(ax, az, ax + 0.2, az + 0.2, S + 13.2, 0.8, M.gold);
        // Pintu masuk (gelap) di sisi utara (menghadap plaza kota)
        for (const x of [-40, -20, 20, 40]) this.block(5, 3.2, 0.3, M.black, x, S, az + 0.15);
        this.block(14, 4.2, 0.3, M.black, 0, S, az + 0.15);
        this.block(16, 0.6, 1.2, M.gold, 0, S + 4.2, az + 0.6);
        // Papan nama di atas gerbang utama (atlas baris atas)
        this.add(this.atlasPlane(24, 3.75, true), M.atlas, 0, S + 7.4, az + 0.3);
    }

    buildFloodlights() {
        const M = this.M;
        const H = 46;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const x = sx * (OX + 6), z = sz * (OZ + 6);
            this.block(3.2, 0.6, 3.2, M.concreteDark, x, S, z);
            this.cyl(0.55, 1.2, H - 0.6, 8, M.steel, x, S + 0.6, z, { cast: true });
            for (let y = 8; y < H - 4; y += 8) this.cyl(1.25 - y * 0.014, 1.25 - y * 0.014, 0.3, 8, M.steelDark, x, S + y, z);
            // Kepala lampu: menghadap pusat, miring ke bawah
            const head = new THREE.Group();
            head.position.set(x, S + H, z);
            head.rotation.set(0, Math.atan2(-x, -z), 0, 'YXZ');
            head.rotateX(0.45);
            this.staticGroup.add(head);
            this.add(new THREE.BoxGeometry(9, 5.4, 0.5), M.steelDark, 0, 0, 0, { cast: true }, head);
            for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
                const lx = -3.4 + c * 1.7, ly = -1.7 + r * 1.7;
                this.add(new THREE.BoxGeometry(1.4, 1.4, 0.2), M.lamp, lx, ly, 0.32, {}, head);
            }
            head.updateMatrix();
            const p = new THREE.Vector3(0, 0, 1.2).applyMatrix4(head.matrix);
            this.lampHeads.push([p.x, p.y, p.z]);
            this.beam([x, S + H - 2, z], [x, S + H - 0.5, z], 0.6, M.steel);
        }
    }

    buildScoreboard() {
        const M = this.M;
        // Di atas dinding belakang tribun selatan, menghadap utara (ke lapangan)
        const z = -(OZ + 0.3), w = 26, h = 26 * 352 / 1024;
        for (const x of [-10, 10]) this.block(0.8, 15 + h + 1 - 15, 0.8, M.steelDark, x, S + 15, z - 0.6);
        this.block(w + 1.2, h + 1.2, 0.6, M.black, 0, S + 15.4, z - 0.2);
        this.add(this.atlasPlane(w, h, false), M.atlas, 0, S + 16 + h / 2, z + 0.12);
    }

    buildPlaza() {
        const M = this.M;
        const z0 = OZ + 0.8, z1 = 86.5;          // plaza utara (lokal)
        this.block(120, 0.02, z1 - z0, M.pave, 0, S, (z0 + z1) / 2);
        // Jalan akses dari ujung jalan arteri kota (x = -168) ke gerbang
        this.block(10, 0.03, z1 - z0, M.asphalt, 0, S + 0.02, (z0 + z1) / 2);
        for (let z = z0 + 2; z < z1 - 1; z += 4) this.block(0.18, 0.01, 2, M.white, 0, S + 0.05, z);
        // Tugu bola emas
        this.cyl(2.6, 3.0, 1.2, 16, M.paveDark, -22, S, 72);
        this.cyl(1.0, 1.3, 3.2, 12, M.cream, -22, S + 1.2, 72);
        this.add(new THREE.SphereGeometry(1.8, 16, 12), M.gold, -22, S + 4.4 + 1.8, 72, { cast: true });
        // Loket tiket
        for (const x of [22, 34]) {
            this.block(6, 3, 4, M.cream, x, S, 72, { cast: true });
            this.block(6.8, 0.4, 4.8, M.blue, x, S + 3, 72);
            this.block(4, 1.2, 0.1, M.glass, x, S + 1.3, 70);
        }
        // Tiang bendera (warna tim fiktif + AUDIRA)
        const flagMats = [M.orange, M.blue, M.gold, M.white];
        [-46, -38, 38, 46].forEach((x, k) => {
            this.cyl(0.08, 0.1, 12, 6, M.steel, x, S, 80);
            this.block(0.05, 1.6, 2.6, flagMats[k], x, S + 10.2, 80 + 1.35);
        });
        // Lampu plaza + pohon + bangku
        for (const x of [-56, -30, 30, 56]) for (const z of [64, 82]) {
            this.cyl(0.1, 0.14, 6, 6, M.steelDark, x, S, z);
            this.block(0.6, 0.3, 0.6, M.lamp, x, S + 6, z);
            this.plazaLamps.push([x, S + 6.2, z]);
        }
        for (const x of [-50, -36, -8, 8, 46, 58]) {
            const z = x === -8 || x === 8 ? 84 : 76;
            this.cyl(0.25, 0.35, 2.6, 6, M.trunk, x, S, z, { cast: true });
            this.add(new THREE.IcosahedronGeometry(2.2, 0), x % 3 ? M.leaf : M.leafLight, x, S + 4.2, z, { cast: true });
        }
        for (const x of [-14, 14]) this.block(3, 0.45, 0.6, M.bench, x, S, 66);
    }

    // ------------------------------------------------------------------ penonton
    buildCrowd() {
        const r = this.r;
        const pts = [];
        for (let k = 0; k < NT; k++) {
            const ox = IX + k * TD + 1.07, oz = IZ + k * TD + 1.07, y = S + tierH(k) + 0.3;
            for (let x = -ox; x <= ox; x += 0.75) for (const s of [-1, 1]) {
                if (this.isAisle(x, 12, 0) || r() > 0.62) continue;
                pts.push([x, y, s * oz, s > 0 ? Math.PI : 0]);
            }
            for (let z = -oz + 0.75; z <= oz - 0.75; z += 0.75) for (const s of [-1, 1]) {
                if (this.isAisle(z, 12, 0) || r() > 0.62) continue;
                pts.push([s * ox, y, z, s > 0 ? -Math.PI / 2 : Math.PI / 2]);
            }
        }
        const geo = mergeParts([
            { geo: new THREE.BoxGeometry(0.42, 0.55, 0.3), c: 0xFFFFFF, y: 0.275 },
            { geo: new THREE.BoxGeometry(0.24, 0.24, 0.24), c: 0xC98E66, y: 0.68 }
        ]);
        this.crowdMat = figureMaterial('crowd', { bob: 0.07, wave: 0.38 });
        const mesh = new THREE.InstancedMesh(geo, this.crowdMat, pts.length);
        const d = new THREE.Object3D(), c = new THREE.Color();
        const SH = [0xF5A623, 0xF08A24, 0xFFD23F, 0x2F80ED, 0x1F5FA8, 0x5FB4FF, 0xFFFFFF, 0xE63946, 0x2E8B57, 0x9B5DE5];
        pts.forEach(([x, y, z, ry], i) => {
            d.position.set(x, y, z);
            d.rotation.set(0, ry, 0);
            d.updateMatrix();
            mesh.setMatrixAt(i, d.matrix);
            // tribun barat = pendukung SURYA (oranye), timur = SAMUDRA (biru), lainnya campur
            let hex;
            const roll = r();
            if (x < -IX + 2 && roll < 0.7) hex = SH[Math.floor(r() * 3)];
            else if (x > IX - 2 && roll < 0.7) hex = SH[3 + Math.floor(r() * 3)];
            else hex = SH[Math.floor(r() * SH.length)];
            mesh.setColorAt(i, c.copy(lin(hex)).multiplyScalar(0.999));
        });
        mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.root.add(mesh);
        this.crowd = mesh;
        this.crowdCount = pts.length;
    }

    // ------------------------------------------------------------------ pemain & bola
    buildPlayers() {
        const F = [[-50, 0, 'gk'], [-36, -22], [-36, -8], [-36, 8], [-36, 22], [-18, -22], [-18, -8], [-18, 8], [-18, 22], [-5, -7], [-5, 7]];
        this.players = [];
        for (let team = 0; team < 2; team++) {
            const dir = team === 0 ? 1 : -1;
            F.forEach(([hx, hz, role], i) => {
                this.players.push({
                    team, gk: role === 'gk', home: { x: hx * dir, z: hz * dir },
                    x: hx * dir * 0.9, z: hz * dir, vx: 0, vz: 0, ry: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
                    phase: this.r() * 6, speed: 0, i
                });
            });
        }
        this.referee = { team: 2, ref: true, x: 0, z: 12, vx: 0, vz: 0, ry: 0, phase: 0, speed: 0 };
        this.all = [...this.players, this.referee];
        this.ball = { x: 0, z: 0, y: 0.22, vx: 0, vz: 0, vy: 0 };
        this.kickCd = 0;
        this.goalPause = 0;
        this.possessionTeam = 0;

        const N = this.all.length;
        const body = mergeParts([
            { geo: new THREE.BoxGeometry(0.5, 0.62, 0.28), c: 0xFFFFFF, y: 0.36 },
            { geo: new THREE.BoxGeometry(0.12, 0.55, 0.14), c: 0xFFFFFF, x: 0.32, y: 0.36 },
            { geo: new THREE.BoxGeometry(0.12, 0.55, 0.14), c: 0xFFFFFF, x: -0.32, y: 0.36 },
            { geo: new THREE.BoxGeometry(0.5, 0.24, 0.3), c: 0x1C1E24, y: -0.02 },
            { geo: new THREE.BoxGeometry(0.26, 0.28, 0.26), c: 0xC98E66, y: 0.84 },
            { geo: new THREE.BoxGeometry(0.28, 0.08, 0.28), c: 0x241A14, y: 1.0 }
        ]);
        this.bodyMat = figureMaterial('player');
        this.pBody = new THREE.InstancedMesh(body, this.bodyMat, N);
        const leg = new THREE.BoxGeometry(0.17, 0.92, 0.18);
        leg.translate(0, -0.46, 0);
        this.legMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.pLegs = new THREE.InstancedMesh(leg, this.legMat, N * 2);
        const KIT = [0xF5A623, 0x2F80ED, 0x222222], GK = [0x2E8B57, 0x9B5DE5], SOCK = [0xFFFFFF, 0x1F3F8A, 0x111111];
        const c = new THREE.Color();
        this.all.forEach((p, k) => {
            const kit = p.ref ? KIT[2] : p.gk ? GK[p.team] : KIT[p.team];
            this.pBody.setColorAt(k, c.copy(lin(kit)).multiplyScalar(0.999));
            const sock = lin(SOCK[p.team]);
            this.pLegs.setColorAt(2 * k, sock);
            this.pLegs.setColorAt(2 * k + 1, sock);
        });
        this.pBody.instanceColor.needsUpdate = true;
        this.pLegs.instanceColor.needsUpdate = true;
        for (const m of [this.pBody, this.pLegs]) {
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.castShadow = true;
            this.root.add(m);
        }
        this.pLegs.castShadow = false;

        this.ballMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.ballMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 1), this.ballMat, 1);
        this.ballMesh.setColorAt(0, c.setRGB(1, 1, 1));
        this.ballMesh.instanceColor.needsUpdate = true;
        this.ballMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.ballMesh.castShadow = true;
        this.root.add(this.ballMesh);
    }

    // ------------------------------------------------------------------ cahaya malam
    buildGlow() {
        const tex = canvasTex(64, 64, (g, s) => {
            const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            r.addColorStop(0, 'rgba(255,255,255,1)');
            r.addColorStop(0.3, 'rgba(235,245,255,0.6)');
            r.addColorStop(1, 'rgba(200,220,255,0)');
            g.fillStyle = r; g.fillRect(0, 0, s, s);
        });
        const pos = [];
        for (const [x, y, z] of this.lampHeads) pos.push(x, y, z);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        this.glowMat = new THREE.PointsMaterial({
            map: tex, color: 0xF4F8FF, size: 26, sizeAttenuation: true,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.glow = new THREE.Points(geo, this.glowMat);
        this.glow.visible = false;
        this.root.add(this.glow);

        const p2 = [];
        for (const [x, y, z] of this.plazaLamps) p2.push(x, y, z);
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
        this.plazaGlowMat = new THREE.PointsMaterial({
            map: tex, color: 0xFFD08A, size: 4.5, sizeAttenuation: true,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        // Satu Points untuk semua (hemat): gabungkan lampu plaza ke geometri sorot tidak bisa (ukuran beda)
        this.plazaGlow = new THREE.Points(g2, this.plazaGlowMat);
        this.plazaGlow.visible = false;
        this.root.add(this.plazaGlow);
    }

    setupCulling() {
        const cull = (mesh, x, y, z, r) => {
            mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), r);
            mesh.frustumCulled = true;
        };
        cull(this.crowd, 0, 7, 0, 100);
        cull(this.pBody, 0, 1, 0, 66);
        cull(this.pLegs, 0, 1, 0, 66);
        cull(this.ballMesh, 0, 2, 0, 66);
        this.detailMeshes = [this.crowd, this.pBody, this.pLegs, this.ballMesh, this.plazaGlow, ...this.farHide];
    }

    // ------------------------------------------------------------------ siang / malam
    setNight(isNight) {
        this.isNight = !!isNight;
        this.M.lamp.color.copy(lin(isNight ? 0xFFFFF4 : 0xCFCFC8));
        this.pitchMat.emissive.setRGB(isNight ? 0.5 : 0, isNight ? 0.52 : 0, isNight ? 0.5 : 0);
        this.glow.visible = this.isNight;
        this.plazaGlow.visible = this.isNight && !this.far;
    }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 380);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-stadium')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-stadium';
            btn.title = 'Fokus ke Stadion Cakrawala AUDIRA (selatan Desa Have)';
            btn.textContent = '🏟️ Stadion';
            const have = group.querySelector('.btn-zone-have');
            group.insertBefore(btn, have ? have.nextSibling : group.firstChild);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-stadium)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    /** Kamera dari utara (sisi kota), menghadap selatan ke lapangan. */
    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(C.x, 0, C.z - 10);
        const a = 22 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 36 * Math.PI / 180;
        cam.distanceDesired = 200;
    }

    // ------------------------------------------------------------------ simulasi
    simulate(dt) {
        const b = this.ball, P = this.players;
        this.kickCd -= dt;
        if (this.goalPause > 0) {
            this.goalPause -= dt;
            b.vx *= 0.9; b.vz *= 0.9;
            if (this.goalPause <= 0) { b.x = 0; b.z = 0; b.y = 0.22; b.vx = b.vz = b.vy = 0; this.kickCd = 1.2; }
        }
        // Bola
        b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
        if (b.y > 0.22) b.vy -= 9.8 * dt;
        else {
            b.y = 0.22;
            b.vy = Math.abs(b.vy) > 1.2 ? -b.vy * 0.45 : 0;
            const f = Math.exp(-1.1 * dt);
            b.vx *= f; b.vz *= f;
        }
        if (this.goalPause <= 0) {
            if (Math.abs(b.x) > HX) {
                if (Math.abs(b.z) < GOAL_W && b.y < GOAL_H) {
                    const scorer = b.x > 0 ? 0 : 1;
                    this.score[scorer]++;
                    this.goalPause = 3;
                    b.x = Math.sign(b.x) * (HX + 1.2); b.vx = 0; b.vz *= 0.2;
                    this.drawScoreboard(Math.max(0, this.minute));
                } else {   // tendangan gawang
                    b.x = Math.sign(b.x) * (HX - 5.5); b.z = (this.r() - 0.5) * 10; b.y = 0.22;
                    b.vx = b.vz = b.vy = 0;
                }
            } else if (Math.abs(b.z) > HZ) {   // lemparan ke dalam
                b.z = Math.sign(b.z) * (HZ - 0.6); b.y = 0.22;
                b.vx = b.vz = b.vy = 0;
            }
        }
        // Pengejar: pemain lapangan terdekat tiap tim
        const chaser = [null, null], cd = [1e9, 1e9];
        for (const p of P) {
            if (p.gk) continue;
            const d2 = (p.x - b.x) ** 2 + (p.z - b.z) ** 2;
            if (d2 < cd[p.team]) { cd[p.team] = d2; chaser[p.team] = p; }
        }
        for (const p of P) {
            const dir = p.team === 0 ? 1 : -1;
            let tx, tz, vmax;
            if (p.gk) {
                tx = -dir * (HX - 1.5) + dir * Math.max(0, 6 - Math.abs(b.x + dir * HX) * 0.12);
                tz = Math.max(-3, Math.min(3, b.z * 0.25));
                vmax = 4.5;
                if (this.goalPause <= 0 && Math.hypot(p.x - b.x, p.z - b.z) < 1.4 && b.y < 2 && this.kickCd <= 0) {
                    this.kick(p, dir * 24, (this.r() - 0.5) * 20, 8);
                }
            } else if (p === chaser[p.team] && this.goalPause <= 0) {
                tx = b.x + b.vx * 0.3; tz = b.z + b.vz * 0.3; vmax = 7;
                if (Math.hypot(p.x - b.x, p.z - b.z) < 1.0 && b.y < 0.7 && this.kickCd <= 0) this.decideKick(p, dir);
            } else {
                tx = p.home.x * 0.72 + b.x * 0.5;
                tz = p.home.z * 0.85 + b.z * 0.3;
                vmax = 4.2;
            }
            tx = Math.max(-HX - 1, Math.min(HX + 1, tx));
            tz = Math.max(-HZ - 1, Math.min(HZ + 1, tz));
            this.steer(p, tx, tz, vmax, dt);
        }
        // Wasit mengikuti bola dari samping
        this.steer(this.referee, b.x - 8, b.z + (b.z > 0 ? -10 : 10), 5, dt);
        // Pemisahan sederhana agar tidak saling menembus
        const A = this.all;
        for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
            const dx = A[j].x - A[i].x, dz = A[j].z - A[i].z, d2 = dx * dx + dz * dz;
            if (d2 < 0.81 && d2 > 1e-6) {
                const d = Math.sqrt(d2), push = (0.9 - d) * 0.5;
                A[i].x -= dx / d * push; A[i].z -= dz / d * push;
                A[j].x += dx / d * push; A[j].z += dz / d * push;
            }
        }
    }
    steer(p, tx, tz, vmax, dt) {
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        const want = d > 0.4 ? Math.min(vmax, d * 1.6) : 0;
        const wvx = d > 1e-4 ? dx / d * want : 0, wvz = d > 1e-4 ? dz / d * want : 0;
        const k = Math.min(1, dt * 4);
        p.vx += (wvx - p.vx) * k; p.vz += (wvz - p.vz) * k;
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.speed = Math.hypot(p.vx, p.vz);
        const face = p.speed > 0.5 ? Math.atan2(p.vx, p.vz) : Math.atan2(this.ball.x - p.x, this.ball.z - p.z);
        let da = face - p.ry;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        p.ry += da * Math.min(1, dt * 8);
        p.phase += dt * (2 + p.speed * 1.9);
    }
    decideKick(p, dir) {
        const goalX = dir * HX, distGoal = Math.abs(goalX - p.x);
        const r = this.r;
        if (distGoal < 28 && r() < 0.6) {
            const aimZ = (r() - 0.5) * 2 * (GOAL_W + 2.5);
            const dx = goalX - p.x, dz = aimZ - p.z, d = Math.hypot(dx, dz);
            this.kick(p, dx / d * 23, dz / d * 23, r() < 0.4 ? 3.5 : 1.2);
            return;
        }
        const mates = this.players.filter(q => q.team === p.team && q !== p && !q.gk && (q.x - p.x) * dir > -6);
        if (mates.length && r() < 0.75) {
            const q = mates[Math.floor(r() * mates.length)];
            const lead = 2.5;
            const dx = q.x + dir * lead - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
            const sp = Math.max(8, Math.min(21, d * 0.9 + 5));
            this.kick(p, dx / d * sp, dz / d * sp, d > 26 ? 6 : 0.5);
        } else {   // giring maju
            this.kick(p, dir * 6.5, (r() - 0.5) * 4, 0);
        }
    }
    kick(p, vx, vz, vy) {
        const b = this.ball;
        b.vx = vx; b.vz = vz; b.vy = vy;
        b.y = Math.max(b.y, 0.12);
        this.kickCd = 0.35;
        this.possessionTeam = p.team;
    }

    update(dt) {
        this.time += dt;
        const t = this.time;
        const camPos = this.cityCamera && this.cityCamera.camera && this.cityCamera.camera.position;
        // LOD bertingkat: pemain & bola hilang > 210 m (hanya beberapa piksel), penonton > 300 m,
        // sisa detail (papan, lampu plaza) > 360 m. Stadion besar -> kota tidak ketambahan draw call.
        const dist = camPos ? Math.hypot(camPos.x - C.x, camPos.z - C.z) : 0;
        const lod = dist > 360 ? 3 : dist > 300 ? 2 : dist > 210 ? 1 : 0;
        if (lod !== this.lod) {
            this.lod = lod;
            this.far = lod >= 3;
            for (const m of this.detailMeshes) m.visible = !this.far;
            this.crowd.visible = lod < 2;
            this.pBody.visible = this.pLegs.visible = this.ballMesh.visible = lod < 1;
            this.plazaGlow.visible = this.isNight && !this.far;
        }
        this.crowdMat.userData.uniforms.uTime.value = t;
        if (this.far) return;

        this.simulate(Math.min(dt, 0.05));
        if (lod >= 1) return;
        const minute = Math.floor(t / 8) % 90 + 1;
        if (minute !== this.minute) { this.minute = minute; if (dt > 0) this.drawScoreboard(minute); }

        const d = this._d || (this._d = new THREE.Object3D());
        const set = (mesh, idx, x, y, z, rx, ry) => {
            d.position.set(x, y, z);
            d.rotation.set(rx, ry, 0, 'YXZ');
            d.updateMatrix();
            mesh.setMatrixAt(idx, d.matrix);
        };
        this.all.forEach((p, k) => {
            const run = Math.min(1, p.speed / 5);
            const sw = Math.sin(p.phase) * 0.7 * run;
            const hip = G + 0.92 + Math.abs(Math.sin(p.phase)) * 0.06 * run;
            set(this.pBody, k, p.x, hip, p.z, 0.18 * run, p.ry);
            const cx = Math.cos(p.ry) * 0.12, cz = -Math.sin(p.ry) * 0.12;
            set(this.pLegs, 2 * k, p.x - cx, hip, p.z - cz, sw, p.ry);
            set(this.pLegs, 2 * k + 1, p.x + cx, hip, p.z + cz, -sw, p.ry);
        });
        this.pBody.instanceMatrix.needsUpdate = true;
        this.pLegs.instanceMatrix.needsUpdate = true;
        const b = this.ball;
        set(this.ballMesh, 0, b.x, G + b.y, b.z, b.x * 1.3, b.z * 0.9);
        this.ballMesh.instanceMatrix.needsUpdate = true;
    }
}
