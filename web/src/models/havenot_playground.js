/**
 * AUDIRA-LAND: Taman Bermain Warga Desa Have-Not (sisi timur, hasil gotong royong)
 *
 * Kawasan ORIGINAL di LUAR peta aktif, selatan Desa Have-Not, tepat di selatan sawah
 * (sawah selatan berakhir di Z -300). Area X 18..90, Z -361..-303, pusat (54, -332).
 * Dihubungkan ke ujung jalan arteri tepi selatan kota (Z -176) oleh jalan setapak tanah di
 * jalur sempit X ≈ 20,5 antara tanggul sungai (X 16) dan sawah (X 24).
 *
 * Kesan sederhana & swadaya: ayunan kayu, perosotan papan, jungkat-jungkit bambu, bak pasir
 * berbingkai papan, tangga majemuk (monkey bar) bambu, komidi putar kecil (berputar), saung
 * beratap ijuk, bangku kayu, pagar bambu, pohon rindang & pisang, lampu bohlam di tiang bambu.
 * Bergerak: 16 anak + 2 ibu (InstancedMesh badan + kaki): berayun, jungkat-jungkit, duduk di
 * komidi putar + 1 pendorong, meluncur di perosotan (siklus naik tangga), bermain pasir,
 * bergelantungan, kejar-kejaran.
 *
 * Draw call: statis dilebur bakeStatic (relatif ke root, mergeShadow). Detail kecil disembunyikan
 * bila kamera > 360 m. Zero-Submerging: semua objek di atas slab (puncak y = S) + 0,02.
 *
 * API: new HaveNotPlayground(scene) -> .update(dt), .setNight(isNight), .attachCameraPreset(cam), .focusCamera()
 */

import { bakeStatic, protectMaterial } from '../core/static_batcher.js';
import { PALETTE } from '../core/constants.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

const PC = { x: 54, z: -332 };            // pusat taman (dunia)
const S = 0.10;                            // puncak slab taman
const G = S + 0.02;                        // micro-lift
const HW = 36, HD = 29;                    // setengah lebar (x) & dalam (z) lokal
const PATH_X = 20.5 - PC.x;                // jalan setapak (lokal)
const GATE = { x0: -35, x1: -29 };         // celah pagar utara (lokal)
const SWING = { x: -6, z: 20, h: 3.0, L: 2.42 };
const SLIDE = { x: 16, z: 18, h: 1.8, x0: 16.8, x1: 21.6, yEnd: 0.32 };
const SEESAWS = [{ x: 28, z: 5 }, { x: 28, z: -4 }];
const SAND = { x: -22, z: -14, w: 8, d: 7 };
const BARS = { x0: -7, x1: -1, z: -17, h: 2.1 };
const MERRY = { x: 12, z: -12, r: 2.2 };

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

/** Material figur: vertex color putih -> instanceColor (baju), sisanya warna vertex. */
function figureMaterial(key) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `
vColor = vec3(1.0);
#ifdef USE_COLOR
    vColor = color;
#endif
#ifdef USE_INSTANCING_COLOR
    if (vColor.r > 0.995 && vColor.g > 0.995 && vColor.b > 0.995) vColor = instanceColor.xyz;
#endif`);
    };
    m.customProgramCacheKey = () => 'audira_playground_fig_' + key;
    return m;
}

const lerp = (a, b, t) => a + (b - a) * t;

export class HaveNotPlayground {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.root.name = 'havenot_playground';
        this.root.position.set(PC.x, 0, PC.z);
        this.staticGroup = new THREE.Group();
        this.staticGroup.name = 'havenot_playground_static';
        this.root.add(this.staticGroup);
        this.time = 0;
        this.isNight = false;
        this.far = false;
        this.r = rng(0x9A71C3);

        const L = hex => new THREE.MeshLambertMaterial({ color: lin(hex) });
        const M = this.M = {
            ground: new THREE.MeshLambertMaterial({ color: PALETTE.GROUND_BASE }),
            lawn: L(0x74A04A), dirt: L(0xA88A62), dirtDark: L(0x8A6E4C), sand: L(0xE6D29A),
            bamboo: L(PALETTE.BAMBOO), bambooPole: L(PALETTE.BAMBOO_POLE), wood: L(0x7A4E2C),
            woodLight: L(0xA9784A), woodDark: L(0x4E3220), ijuk: L(PALETTE.THATCH_IJUK),
            paintBlue: L(0x3E7CB8), paintRed: L(0xB8432F), paintYellow: L(0xE0B030), paintGreen: L(0x3E8E4B),
            rope: L(0xC8B07A), trunk: L(PALETTE.TREE_TRUNK), leaf: L(0x4F8A3A), leafLight: L(0x77AE4A),
            leafDark: L(0x3F6E34), banana: L(0x6BA83A), stone: L(0x8C877C), tin: L(0x9AA3AD)
        };
        M.bulb = new THREE.MeshBasicMaterial({ color: lin(0xD8D0C0) });
        protectMaterial(M.bulb);
        M.sign = new THREE.MeshBasicMaterial({ map: this.makeSignTexture() });
        this.lampHeads = [];

        this.buildGround();
        this.buildFence();
        this.buildGazebo();
        this.buildSwingFrame();
        this.buildSlide();
        this.buildSeesawBases();
        this.buildSandpit();
        this.buildMonkeyBars();
        this.buildBenches();
        this.buildTrees();
        this.buildLamps();

        this.root.updateMatrixWorld(true);
        const baked = bakeStatic(this.staticGroup, { relativeTo: this.root, mergeShadow: true });
        this.staticGroup.add(baked);
        this.farHide = [];
        baked.traverse(o => { if (o.isMesh && o.material === M.sign) this.farHide.push(o); });

        // Bagian bergerak: semua InstancedMesh ber-vcMat WAJIB setColorAt (jebakan r128)
        this.vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.buildMerryGoRound();
        this.buildSwingsAndSeesaws();
        this.buildChildren();
        this.buildGlow();
        this.setupCulling();

        scene.add(this.root);
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
    beam(a, b, t, mat, parent, cast = true) {
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const len = dir.length();
        const m = new THREE.Mesh(new THREE.CylinderGeometry(t, t, len, 6), mat);
        m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        m.castShadow = cast;
        m.receiveShadow = true;
        (parent || this.staticGroup).add(m);
        return m;
    }

    makeSignTexture() {
        // Baris atas (0..128): papan gerbang. Bawah (128..256): papan gotong royong.
        return canvasTex(512, 256, (g, w) => {
            g.fillStyle = '#6B4524'; g.fillRect(0, 0, w, 128);
            for (let y = 0; y < 128; y += 21) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, y, w, 2); }
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillStyle = '#FFF3C4'; g.font = 'bold 46px "Comic Sans MS", sans-serif';
            g.fillText('TAMAN BERMAIN', w / 2, 44);
            g.fillStyle = '#FFD25A'; g.font = 'bold 30px "Comic Sans MS", sans-serif';
            g.fillText('Warga Have-Not', w / 2, 96);
            g.fillStyle = '#F2EAD8'; g.fillRect(0, 128, w, 128);
            g.strokeStyle = '#6B4524'; g.lineWidth = 8; g.strokeRect(4, 132, w - 8, 120);
            g.fillStyle = '#3A2A1A'; g.font = 'bold 32px "Comic Sans MS", sans-serif';
            g.fillText('Dibangun Warga Desa', w / 2, 172);
            g.fillStyle = '#B8432F'; g.font = 'bold 26px "Comic Sans MS", sans-serif';
            g.fillText('oleh Warga Desa · AUDIRA', w / 2, 216);
        });
    }
    signPlane(w, h, top) {
        const g = new THREE.PlaneGeometry(w, h);
        const v0 = top ? 0.5 : 0, v1 = top ? 1 : 0.5;
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
        return g;
    }

    // ------------------------------------------------------------------ tanah, pagar, jalan
    buildGround() {
        const M = this.M;
        // Tanah pengisi di luar tanah kota (berhenti di Z -296) untuk X -20..280 (sisi timur tanah stadion)
        const g = new THREE.PlaneGeometry(300, 124);
        g.rotateX(-Math.PI / 2);
        this.add(g, M.ground, 130 - PC.x, -0.06, -358 - PC.z);
        // Slab rumput taman
        this.block(2 * HW + 2, 0.16, 2 * HD + 2, M.lawn, 0, S - 0.16, 0);
        // Bekas tanah terinjak di bawah permainan
        const worn = [[SWING.x, SWING.z, 11, 5], [MERRY.x, MERRY.z, 7, 7], [SLIDE.x + 3, SLIDE.z, 10, 3.5],
            [28, 0.5, 6, 13], [BARS.x0 + 3, BARS.z, 8, 3], [-14, 4, 30, 3], [0, 4, 60, 2.4]];
        for (const [x, z, w, d] of worn) this.block(w, 0.01, d, M.dirt, x, S, z);
        // Jalan setapak tanah dari tepi kota (Z dunia -176) ke gerbang
        const z0 = HD + 0.5, z1 = -176 - PC.z;
        this.block(2.6, 0.08, z1 - z0, M.dirt, PATH_X, -0.03, (z0 + z1) / 2);
        for (let z = z0 + 3; z < z1 - 2; z += 6.5) this.block(0.5, 0.04, 0.4, M.stone, PATH_X + 1.6, 0.05, z);
        // Batu loncatan di dalam gerbang
        for (let k = 0; k < 5; k++) this.cyl(0.45, 0.5, 0.04, 8, M.stone, -32 + k * 0.6, S, HD - 2 - k * 2.2);
    }

    buildFence() {
        const M = this.M;
        const inX = HW - 0.4, inZ = HD - 0.4;
        const post = (x, z) => this.cyl(0.06, 0.07, 1.0, 6, M.bambooPole, x, S, z);
        const rail = (x0, z0, x1, z1) => {
            for (const y of [0.45, 0.85]) this.beam([x0, S + y, z0], [x1, S + y, z1], 0.035, M.bamboo, null, false);
        };
        // Sisi selatan, barat, timur
        for (let x = -inX; x <= inX + 0.01; x += 2.5) post(x, -inZ);
        for (let z = -inZ; z <= inZ + 0.01; z += 2.5) { post(-inX, z); post(inX, z); }
        rail(-inX, -inZ, inX, -inZ); rail(-inX, -inZ, -inX, inZ); rail(inX, -inZ, inX, inZ);
        // Sisi utara dengan celah gerbang
        for (let x = GATE.x1; x <= inX + 0.01; x += 2.5) post(x, inZ);
        rail(GATE.x1, inZ, inX, inZ);
        // Gerbang bambu + papan nama
        for (const x of [GATE.x0, GATE.x1]) this.cyl(0.11, 0.13, 3.2, 6, M.bambooPole, x, S, inZ, { cast: true });
        this.beam([GATE.x0 - 0.4, S + 3.0, inZ], [GATE.x1 + 0.4, S + 3.0, inZ], 0.09, M.bambooPole);
        this.block(4.4, 1.1, 0.08, M.woodDark, (GATE.x0 + GATE.x1) / 2, S + 1.75, inZ);
        this.add(this.signPlane(4.2, 1.05, true), M.sign, (GATE.x0 + GATE.x1) / 2, S + 2.3, inZ + 0.05);
        // Papan gotong royong (di dalam, dekat saung)
        const bx = -30, bz = 12;
        for (const dx of [-0.9, 0.9]) this.block(0.1, 1.6, 0.1, M.woodDark, bx + dx, S, bz);
        this.block(2.1, 1.0, 0.06, M.woodDark, bx, S + 0.9, bz);
        this.add(this.signPlane(2.0, 0.5 * 2.0 * 0.5, false), M.sign, bx, S + 1.4, bz + 0.04);
    }

    buildGazebo() {
        const M = this.M;
        const x = -24, z = 18, w = 5;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            this.block(0.3, 0.12, 0.3, M.stone, x + sx * 2.2, S, z + sz * 2.2);
            this.cyl(0.09, 0.1, 2.9, 6, M.bambooPole, x + sx * 2.2, S + 0.12, z + sz * 2.2, { cast: true });
        }
        // Lantai panggung bambu di atas balok
        for (const sz of [-1.5, 0, 1.5]) this.block(w - 0.4, 0.18, 0.18, M.woodDark, x, S + 0.12, z + sz);
        this.block(w - 0.4, 0.1, w - 0.4, M.bamboo, x, S + 0.3, z);
        // Atap ijuk limas
        const roof = new THREE.CylinderGeometry(0.2, 4.4, 2.0, 4);
        roof.rotateY(Math.PI / 4);
        this.add(roof, M.ijuk, x, S + 3.02 + 1.0, z, { cast: true });
        this.block(0.4, 0.3, 0.4, M.woodDark, x, S + 5.02, z);
        // Tikar & kendi air di lantai
        this.block(2.0, 0.02, 1.4, M.paintRed, x - 0.5, S + 0.4, z + 0.3);
        this.cyl(0.18, 0.12, 0.35, 8, M.dirtDark, x + 1.4, S + 0.4, z - 1.2);
    }

    buildSwingFrame() {
        const M = this.M;
        const { x, z, h } = SWING;
        for (const ex of [-5, 5]) {
            for (const dz of [-1.2, 1.2]) this.beam([x + ex, S, z + dz], [x + ex, S + h, z], 0.1, M.wood);
            this.beam([x + ex, S + 1.0, z - 0.8], [x + ex, S + 1.0, z + 0.8], 0.05, M.woodDark, null, false);
        }
        this.beam([x - 5.3, S + h, z], [x + 5.3, S + h, z], 0.13, M.woodDark);
    }

    buildSlide() {
        const M = this.M;
        const { x, z, h, x0, x1, yEnd } = SLIDE;
        for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) {
            this.block(0.14, h + 1.0, 0.14, M.wood, x + dx, S, z + dz, { cast: true });
        }
        this.block(1.8, 0.12, 1.8, M.woodLight, x, S + h - 0.12, z);
        // Pagar platform
        for (const dz of [-0.8, 0.8]) this.block(1.6, 0.08, 0.06, M.woodDark, x, S + h + 0.75, z + dz);
        // Tangga di sisi barat
        for (const dz of [-0.4, 0.4]) this.beam([x - 2.0, S, z + dz], [x - 0.85, S + h, z + dz], 0.05, M.woodDark);
        for (let k = 1; k <= 5; k++) {
            const t = k / 6;
            this.block(0.12, 0.05, 0.8, M.wood, lerp(x - 2.0, x - 0.85, t), S + h * t, z);
        }
        // Luncuran papan dicat biru (bekas seng) + tepi
        const len = Math.hypot(x1 - x0, h - yEnd);
        const ang = Math.atan2(h - yEnd, x1 - x0);
        const cx = (x0 + x1) / 2, cy = S + (h + yEnd) / 2;
        this.add(new THREE.BoxGeometry(len, 0.06, 0.7), M.paintBlue, cx, cy, z, { rz: -ang, cast: true });
        for (const dz of [-0.37, 0.37]) this.add(new THREE.BoxGeometry(len, 0.18, 0.05), M.tin, cx, cy + 0.08, z + dz, { rz: -ang });
        // Kaki penyangga luncuran
        this.block(0.1, cy - S - 0.05, 0.6, M.wood, cx, S, z);
        this.block(0.1, yEnd - 0.03, 0.6, M.wood, x1 - 0.2, S, z);
    }

    buildSeesawBases() {
        const M = this.M;
        for (const s of SEESAWS) {
            // Tumpuan kayu segitiga + gelondong bambu poros
            for (const dz of [-0.3, 0.3]) {
                this.beam([s.x - 0.35, S, s.z + dz], [s.x, S + 0.5, s.z + dz], 0.06, M.woodDark);
                this.beam([s.x + 0.35, S, s.z + dz], [s.x, S + 0.5, s.z + dz], 0.06, M.woodDark);
            }
            this.add(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), M.bambooPole, s.x, S + 0.5, s.z, { rx: Math.PI / 2 });
            // Ban bekas penahan di bawah ujung (berdiri di tanah)
            for (const dx of [-2.35, 2.35]) this.add(new THREE.TorusGeometry(0.22, 0.08, 6, 10), M.woodDark, s.x + dx, S + 0.08, s.z, { rx: Math.PI / 2 });
        }
    }

    buildSandpit() {
        const M = this.M;
        const { x, z, w, d } = SAND;
        this.block(w, 0.2, d, M.sand, x, S, z);
        for (const s of [-1, 1]) {
            this.block(w + 0.3, 0.32, 0.15, M.wood, x, S, z + s * (d / 2 + 0.07));
            this.block(0.15, 0.32, d, M.wood, x + s * (w / 2 + 0.07), S, z);
        }
        // Gundukan pasir, ember & sekop
        this.add(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.sand, x + 1.8, S + 0.2, z - 1.2);
        this.staticGroup.children[this.staticGroup.children.length - 1].scale.set(1.2, 0.45, 1.0);
        this.cyl(0.16, 0.12, 0.25, 8, M.paintRed, x - 2.2, S + 0.2, z + 1.5);
        this.cyl(0.16, 0.12, 0.25, 8, M.paintYellow, x + 0.4, S + 0.2, z + 2.2);
        this.block(0.12, 0.03, 0.5, M.paintGreen, x - 1.5, S + 0.2, z + 1.8, { ry: 0.6 });
    }

    buildMonkeyBars() {
        const M = this.M;
        const { x0, x1, z, h } = BARS;
        for (const x of [x0, x1]) for (const dz of [-0.5, 0.5]) this.cyl(0.07, 0.08, h, 6, M.bambooPole, x, S, z + dz, { cast: true });
        for (const dz of [-0.5, 0.5]) this.beam([x0, S + h, z + dz], [x1, S + h, z + dz], 0.06, M.bambooPole);
        for (let x = x0 + 0.5; x < x1 - 0.2; x += 0.5) this.beam([x, S + h, z - 0.5], [x, S + h, z + 0.5], 0.035, M.bamboo, null, false);
        // Tangga kecil di ujung barat
        for (let k = 1; k <= 3; k++) this.beam([x0, S + k * 0.5, z - 0.5], [x0, S + k * 0.5, z + 0.5], 0.035, M.bamboo, null, false);
    }

    buildBenches() {
        const M = this.M;
        this.benches = [[-30, 3, Math.PI / 2], [-30, -6, Math.PI / 2], [4, 9, 0], [22, -24, 0], [-10, 24, Math.PI]];
        for (const [x, z, ry] of this.benches) {
            const g = new THREE.Group();
            g.position.set(x, 0, z);
            g.rotation.y = ry;
            this.staticGroup.add(g);
            for (const dx of [-0.8, 0.8]) this.block(0.12, 0.43, 0.4, M.woodDark, dx, S, 0, {}, g);
            this.block(2.0, 0.06, 0.45, M.woodLight, 0, S + 0.43, 0, {}, g);
            this.block(2.0, 0.3, 0.05, M.woodLight, 0, S + 0.6, -0.22, {}, g);
            for (const dx of [-0.8, 0.8]) this.block(0.06, 0.4, 0.06, M.woodDark, dx, S + 0.45, -0.22, {}, g);
        }
    }

    buildTrees() {
        const M = this.M;
        const trees = [[-33, -26, 1.1], [-12, -26, 0.9], [8, -26, 1.2], [30, -26, 1.0], [33, -12, 0.95], [33, 14, 1.1],
            [30, 26, 0.9], [4, 26, 1.0], [-20, 26, 0.85], [-33, -14, 0.9], [-16, 9, 1.25]];
        for (const [x, z, s] of trees) {
            this.cyl(0.22 * s, 0.32 * s, 3.0 * s, 6, M.trunk, x, S, z, { cast: true });
            this.add(new THREE.IcosahedronGeometry(2.4 * s, 0), M.leaf, x, S + 3.0 * s + 1.5 * s, z, { cast: true });
            this.add(new THREE.IcosahedronGeometry(1.6 * s, 0), M.leafLight, x + 0.8 * s, S + 3.0 * s + 2.6 * s, z - 0.4 * s, { cast: true });
        }
        // Rumpun pisang di tepi
        for (const [x, z] of [[34, 4], [-34, 20], [20, 27], [-34, -2]]) {
            this.cyl(0.12, 0.16, 2.0, 6, M.banana, x, S, z);
            for (let k = 0; k < 5; k++) {
                const a = k * 1.26;
                this.add(new THREE.BoxGeometry(0.4, 0.04, 1.8), k % 2 ? M.banana : M.leafDark,
                    x + Math.sin(a) * 0.8, S + 2.2, z + Math.cos(a) * 0.8, { ry: a, rx: 0.5 });
            }
        }
        // Semak kecil
        for (const [x, z] of [[-26, -26], [18, -26], [33, 0], [-2, 27]]) {
            this.add(new THREE.SphereGeometry(0.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.leafDark, x, S, z);
        }
    }

    buildLamps() {
        const M = this.M;
        for (const [x, z] of [[-28, 24], [-6, 26], [24, 10], [-12, -6], [20, -22]]) {
            this.cyl(0.07, 0.09, 3.6, 6, M.bambooPole, x, S, z);
            this.block(0.6, 0.06, 0.06, M.bambooPole, x + 0.25, S + 3.5, z);
            this.cyl(0.25, 0.08, 0.14, 8, M.tin, x + 0.5, S + 3.3, z);
            this.add(new THREE.SphereGeometry(0.12, 8, 6), M.bulb, x + 0.5, S + 3.2, z);
            this.lampHeads.push([x + 0.5, S + 3.15, z]);
        }
    }

    // ------------------------------------------------------------------ bergerak
    buildMerryGoRound() {
        const M = this.M;
        const rot = new THREE.Group();
        rot.position.set(MERRY.x, 0, MERRY.z);
        this.root.add(rot);
        this.merryRot = rot;
        const tmp = new THREE.Group();
        rot.add(tmp);
        this.cyl(0.2, 0.28, 0.25, 8, M.woodDark, 0, S, 0, {}, tmp);
        this.cyl(MERRY.r, MERRY.r, 0.08, 16, M.woodLight, 0, S + 0.27, 0, {}, tmp);
        // Papan berwarna (cat sisa) diselang-seling
        for (let k = 0; k < 4; k++) {
            this.add(new THREE.CylinderGeometry(MERRY.r + 0.01, MERRY.r + 0.01, 0.02, 4, 1, false, k * Math.PI / 2, Math.PI / 4),
                [M.paintRed, M.paintYellow, M.paintBlue, M.paintGreen][k], 0, S + 0.36, 0, {}, tmp);
        }
        this.cyl(0.07, 0.07, 1.0, 6, M.tin, 0, S + 0.35, 0, {}, tmp);
        for (let k = 0; k < 4; k++) {
            const a = k * Math.PI / 2 + Math.PI / 4;
            this.beam([Math.cos(a) * 1.7, S + 0.35, Math.sin(a) * 1.7], [Math.cos(a) * 1.7, S + 1.0, Math.sin(a) * 1.7], 0.035, M.tin, tmp, false);
            this.beam([0, S + 1.0, 0], [Math.cos(a) * 1.7, S + 1.0, Math.sin(a) * 1.7], 0.035, M.tin, tmp, false);
        }
        rot.updateMatrixWorld(true);
        const baked = bakeStatic(tmp, { relativeTo: rot, mergeShadow: true });
        rot.remove(tmp);
        rot.add(baked);
    }

    buildSwingsAndSeesaws() {
        const c = new THREE.Color();
        const swingGeo = mergeParts([
            { geo: new THREE.BoxGeometry(0.03, SWING.L, 0.03), c: 0xC8B07A, x: -0.28, y: -SWING.L / 2 },
            { geo: new THREE.BoxGeometry(0.03, SWING.L, 0.03), c: 0xC8B07A, x: 0.28, y: -SWING.L / 2 },
            { geo: new THREE.BoxGeometry(0.7, 0.06, 0.3), c: 0xFFFFFF, y: -SWING.L - 0.03 }
        ]);
        this.swings = [-3.3, 0, 3.3].map((dx, k) => ({ x: SWING.x + dx, z: SWING.z, ph: k * 2.1, amp: [0.55, 0.12, 0.42][k] }));
        this.swingMesh = new THREE.InstancedMesh(swingGeo, this.vcMat, this.swings.length);
        this.swingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        [0x7A4E2C, 0xA9784A, 0x8A5A34].forEach((h, k) => this.swingMesh.setColorAt(k, c.copy(lin(h))));
        this.swingMesh.instanceColor.needsUpdate = true;
        this.swingMesh.castShadow = true;
        this.root.add(this.swingMesh);

        const ssGeo = mergeParts([
            { geo: new THREE.BoxGeometry(4.0, 0.08, 0.36), c: 0xBFA06A },
            { geo: new THREE.BoxGeometry(0.06, 0.4, 0.5), c: 0x8E7548, x: 1.55, y: 0.2 },
            { geo: new THREE.BoxGeometry(0.06, 0.4, 0.5), c: 0x8E7548, x: -1.55, y: 0.2 }
        ]);
        this.seesawMesh = new THREE.InstancedMesh(ssGeo, this.vcMat, SEESAWS.length);
        this.seesawMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        SEESAWS.forEach((s, k) => this.seesawMesh.setColorAt(k, c.setRGB(1, 1, 1)));
        this.seesawMesh.instanceColor.needsUpdate = true;
        this.seesawMesh.castShadow = true;
        this.root.add(this.seesawMesh);
    }

    buildChildren() {
        const r = this.r;
        const kids = [];
        const K = (role, o = {}) => kids.push({ role, scale: 1, ...o });
        K('swing', { idx: 0 }); K('swing', { idx: 2 });
        for (let s = 0; s < 2; s++) { K('seesaw', { idx: s, end: 1 }); K('seesaw', { idx: s, end: -1 }); }
        for (let k = 0; k < 3; k++) K('merry', { a: k * 2.094 });
        K('pusher');
        K('slide', { off: 0 });
        K('sand', { x: SAND.x - 1.8, z: SAND.z + 0.6, ry: 0.9 }); K('sand', { x: SAND.x + 0.4, z: SAND.z - 1.6, ry: -2.2 });
        K('bars');
        K('chase', { off: 0 }); K('chase', { off: -0.7 });
        K('mom', { bench: 0, scale: 1.55 }); K('mom', { bench: 4, scale: 1.55 });
        kids.forEach(k => { k.phase = r() * 6; });
        this.kids = kids;
        const N = kids.length;

        const body = mergeParts([
            { geo: new THREE.BoxGeometry(0.34, 0.42, 0.2), c: 0xFFFFFF, y: 0.22 },
            { geo: new THREE.BoxGeometry(0.09, 0.36, 0.1), c: 0xFFFFFF, x: 0.22, y: 0.22 },
            { geo: new THREE.BoxGeometry(0.09, 0.36, 0.1), c: 0xFFFFFF, x: -0.22, y: 0.22 },
            { geo: new THREE.BoxGeometry(0.34, 0.14, 0.22), c: 0x2B3550, y: 0.0 },
            { geo: new THREE.BoxGeometry(0.24, 0.24, 0.24), c: 0xB97A55, y: 0.56 },
            { geo: new THREE.BoxGeometry(0.26, 0.07, 0.26), c: 0x1C1612, y: 0.71 }
        ]);
        this.bodyMat = figureMaterial('kid');
        this.kBody = new THREE.InstancedMesh(body, this.bodyMat, N);
        const leg = new THREE.BoxGeometry(0.12, 0.48, 0.13);
        leg.translate(0, -0.24, 0);
        this.legMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        this.kLegs = new THREE.InstancedMesh(leg, this.legMat, N * 2);
        const SHIRT = [0xE63946, 0xFFC93C, 0x2F9E8F, 0x3E7CB8, 0xFF7EB6, 0x9B5DE5, 0xFF8C42, 0x6CC04A, 0xF4F1DE];
        const SKIN = [0xB97A55, 0xA86B48, 0xC98E66];
        const c = new THREE.Color();
        kids.forEach((k, i) => {
            const shirt = k.role === 'mom' ? (i % 2 ? 0x7A4E8E : 0x2F7A6A) : SHIRT[i % SHIRT.length];
            this.kBody.setColorAt(i, c.copy(lin(shirt)).multiplyScalar(0.999));
            const skin = lin(SKIN[i % SKIN.length]);
            this.kLegs.setColorAt(2 * i, skin);
            this.kLegs.setColorAt(2 * i + 1, skin);
        });
        this.kBody.instanceColor.needsUpdate = true;
        this.kLegs.instanceColor.needsUpdate = true;
        for (const m of [this.kBody, this.kLegs]) {
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.root.add(m);
        }
        this.kBody.castShadow = true;
    }

    buildGlow() {
        const tex = canvasTex(64, 64, (g, s) => {
            const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
            r.addColorStop(0, 'rgba(255,255,255,1)');
            r.addColorStop(0.25, 'rgba(255,225,160,0.7)');
            r.addColorStop(1, 'rgba(255,180,90,0)');
            g.fillStyle = r; g.fillRect(0, 0, s, s);
        });
        const pos = [];
        for (const [x, y, z] of this.lampHeads) pos.push(x, y, z);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        this.glowMat = new THREE.PointsMaterial({
            map: tex, color: 0xFFC97A, size: 3.6, sizeAttenuation: true,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.glow = new THREE.Points(geo, this.glowMat);
        this.glow.visible = false;
        this.root.add(this.glow);
    }

    setupCulling() {
        const cull = (mesh, x, y, z, r) => {
            mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), r);
            mesh.frustumCulled = true;
        };
        cull(this.swingMesh, SWING.x, 2, SWING.z, 7);
        cull(this.seesawMesh, 28, 1, 0.5, 8);
        cull(this.kBody, 0, 1, 0, 42);
        cull(this.kLegs, 0, 1, 0, 42);
        this.detailMeshes = [this.swingMesh, this.seesawMesh, this.kBody, this.kLegs, ...this.farHide];
    }

    setNight(isNight) {
        this.isNight = !!isNight;
        this.M.bulb.color.copy(lin(isNight ? 0xFFE6A8 : 0xD8D0C0));
        this.glow.visible = this.isNight;
    }

    attachCameraPreset(cityCamera) {
        if (!cityCamera) return;
        this.cityCamera = cityCamera;
        cityCamera.maxPan = Math.max(cityCamera.maxPan || 0, 380);
        let tries = 0;
        const tryAttach = () => {
            const group = document.querySelector('#hud-cam-presets .zone-nav-group');
            if (!group) { if (++tries < 40) setTimeout(tryAttach, 500); return; }
            if (group.querySelector('.btn-zone-playground')) return;
            const btn = document.createElement('button');
            btn.className = 'btn-view btn-zone-playground';
            btn.title = 'Fokus ke Taman Bermain Warga (selatan Desa Have-Not)';
            btn.textContent = '🛝 Taman Anak';
            group.appendChild(btn);
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.focusCamera();
            });
            document.querySelectorAll('.btn-view:not(.btn-zone-playground)').forEach(b =>
                b.addEventListener('click', () => btn.classList.remove('active')));
        };
        tryAttach();
    }

    /** Kamera dari utara-timur laut (sisi sawah), menghadap selatan. */
    focusCamera() {
        const cam = this.cityCamera;
        if (!cam) return;
        cam.targetDesired.set(PC.x, 0, PC.z + 1);
        const a = 28 * Math.PI / 180;
        cam.azimuthDesired = cam.nearestAngle ? cam.nearestAngle(a) : a;
        cam.elevationDesired = 34 * Math.PI / 180;
        cam.distanceDesired = 72;
    }

    // ------------------------------------------------------------------ update
    update(dt) {
        this.time += dt;
        const t = this.time;
        const camPos = this.cityCamera && this.cityCamera.camera && this.cityCamera.camera.position;
        // LOD bertingkat: anak, ayunan & jungkat-jungkit (kecil) hilang > 220 m, papan nama > 360 m
        const dist = camPos ? Math.hypot(camPos.x - PC.x, camPos.z - PC.z) : 0;
        const lod = dist > 360 ? 2 : dist > 220 ? 1 : 0;
        if (lod !== this.lod) {
            this.lod = lod;
            this.far = lod >= 1;
            for (const m of this.detailMeshes) m.visible = lod < 1;
            for (const m of this.farHide) m.visible = lod < 2;
        }
        const ma = t * 0.9;
        this.merryRot.rotation.y = ma;
        if (this.far) return;

        const d = this._d || (this._d = new THREE.Object3D());
        const set = (mesh, idx, x, y, z, rx, ry, rz = 0, s = 1) => {
            d.position.set(x, y, z);
            d.rotation.set(rx, ry, rz, 'YXZ');
            d.scale.set(s, s, s);
            d.updateMatrix();
            mesh.setMatrixAt(idx, d.matrix);
        };
        // Ayunan
        const swAng = this.swings.map(s => Math.sin(t * 1.85 + s.ph) * s.amp);
        this.swings.forEach((s, k) => set(this.swingMesh, k, s.x, G + SWING.h, s.z, swAng[k], 0));
        this.swingMesh.instanceMatrix.needsUpdate = true;
        // Jungkat-jungkit (miring pada sumbu z)
        const maxTilt = Math.asin(0.42 / 2.0);
        const ssTilt = SEESAWS.map((s, k) => Math.max(-1, Math.min(1, Math.sin(t * 1.3 + k * 2.4) * 1.5)) * maxTilt);
        SEESAWS.forEach((s, k) => set(this.seesawMesh, k, s.x, G + 0.5, s.z, 0, 0, ssTilt[k]));
        this.seesawMesh.instanceMatrix.needsUpdate = true;

        // Anak-anak: tiap peran menghasilkan pose {x, y(pinggul), z, ry, rx badan, kaki kiri/kanan, rz}
        const o = this._o || (this._o = {});
        this.kids.forEach((k, i) => {
            const s = k.scale;
            let x = 0, y = G + 0.48 * s, z = 0, ry = 0, rx = 0, rz = 0, lL = 0, lR = 0;
            const walk = (spd) => { const sw = Math.sin((t + k.phase) * spd) * 0.6; lL = sw; lR = -sw; y += Math.abs(sw) * 0.04; };
            switch (k.role) {
                case 'swing': {
                    const sw = this.swings[k.idx], a = swAng[k.idx], Lh = SWING.L - 0.06;
                    x = sw.x; y = G + SWING.h - Lh * Math.cos(a); z = SWING.z - Lh * Math.sin(a);
                    rx = a; ry = 0; lL = lR = a - 1.35;   // menghadap +z, ikut miring tali
                    break;
                }
                case 'seesaw': {
                    const sv = SEESAWS[k.idx], tl = ssTilt[k.idx], e = k.end * 1.75;
                    x = sv.x + e * Math.cos(tl); y = G + 0.5 + e * Math.sin(tl) + 0.06; z = sv.z;
                    ry = k.end > 0 ? -Math.PI / 2 : Math.PI / 2;
                    lL = lR = -1.1;
                    break;
                }
                case 'merry': {
                    const a = k.a - ma;
                    x = MERRY.x + Math.cos(a) * 1.5; z = MERRY.z + Math.sin(a) * 1.5; y = G + 0.38 + 0.02;
                    ry = Math.atan2(Math.cos(a), Math.sin(a));   // menghadap keluar
                    lL = lR = -1.4;
                    break;
                }
                case 'pusher': {
                    const a = -ma - 0.6;
                    x = MERRY.x + Math.cos(a) * 2.75; z = MERRY.z + Math.sin(a) * 2.75;
                    // arah lari = garis singgung (sudut berkurang)
                    ry = Math.atan2(Math.sin(a), -Math.cos(a));
                    rx = 0.25; walk(9);
                    break;
                }
                case 'slide': this.slidePose(t + k.off, o); x = o.x; y = o.y; z = o.z; ry = o.ry; rx = o.rx; lL = o.lL; lR = o.lR;
                    if (o.walk) walk(8);
                    break;
                case 'sand':
                    x = k.x; z = k.z; y = G + 0.2 + 0.04; ry = k.ry; lL = lR = -1.45;
                    rx = 0.25 + Math.max(0, Math.sin((t + k.phase) * 2.5)) * 0.3;
                    break;
                case 'bars': {
                    const u = (Math.sin(t * 0.35) + 1) / 2;
                    x = lerp(BARS.x0 + 0.5, BARS.x1 - 0.5, u); z = BARS.z;
                    y = G + BARS.h - 0.72; ry = Math.cos(t * 0.35) > 0 ? Math.PI / 2 : -Math.PI / 2;
                    rz = Math.sin(t * 3.0) * 0.12;
                    lL = Math.sin(t * 3) * 0.3; lR = -lL;
                    break;
                }
                case 'chase': {
                    const a = t * 0.55 + k.off;
                    x = -2 + Math.cos(a) * 6; z = 3 + Math.sin(a) * 4;
                    ry = Math.atan2(-Math.sin(a) * 6, Math.cos(a) * 4);
                    rx = 0.2; walk(10);
                    break;
                }
                case 'mom': {
                    const [bx, bz, bry] = this.benches[k.bench];
                    x = bx; z = bz; y = G + 0.47; ry = bry; lL = lR = -1.45;
                    break;
                }
            }
            set(this.kBody, i, x, y, z, rx, ry, rz, s);
            const cx = Math.cos(ry) * 0.09 * s, cz = -Math.sin(ry) * 0.09 * s;
            set(this.kLegs, 2 * i, x - cx, y, z - cz, lL, ry, 0, s);
            set(this.kLegs, 2 * i + 1, x + cx, y, z + cz, lR, ry, 0, s);
        });
        this.kBody.instanceMatrix.needsUpdate = true;
        this.kLegs.instanceMatrix.needsUpdate = true;
    }

    /** Siklus perosotan 10 dtk: jalan ke tangga, naik, duduk, meluncur, kembali. */
    slidePose(t, o) {
        const T = 10, u = ((t % T) + T) % T;
        const { x, z, h, x0, x1, yEnd } = SLIDE;
        o.rx = 0; o.walk = false; o.lL = o.lR = 0;
        const hipStand = 0.48;
        if (u < 3) {                      // jalan dari ujung luncuran memutar ke kaki tangga
            const pts = [[x1 + 0.8, z], [x1 + 0.8, z - 2.2], [x - 2.6, z - 2.2], [x - 2.6, z]];
            const seg = Math.min(2, Math.floor(u)), f = u - seg;
            const a = pts[seg], b = pts[seg + 1];
            o.x = lerp(a[0], b[0], f); o.z = lerp(a[1], b[1], f); o.y = G + hipStand;
            o.ry = Math.atan2(b[0] - a[0], b[1] - a[1]); o.walk = true;
        } else if (u < 5) {               // naik tangga
            const f = (u - 3) / 2;
            o.x = lerp(x - 2.3, x - 0.6, f); o.z = z; o.y = G + hipStand + h * f; o.ry = Math.PI / 2;
            const sw = Math.sin(u * 8) * 0.5; o.lL = sw; o.lR = -sw;
        } else if (u < 5.8) {             // duduk di puncak
            o.x = lerp(x - 0.4, x0 - 0.1, (u - 5) / 0.8); o.z = z; o.y = G + h + 0.06; o.ry = Math.PI / 2;
            o.lL = o.lR = -1.4;
        } else if (u < 7.2) {             // meluncur
            const f = (u - 5.8) / 1.4, e = f * f;
            o.x = lerp(x0, x1 - 0.1, e); o.z = z;
            o.y = G + lerp(h, yEnd, e) + 0.1; o.ry = Math.PI / 2;
            o.lL = o.lR = -1.4; o.rx = -0.25;
        } else {                          // berdiri & bersorak di ujung, lalu jalan
            const f = (u - 7.2) / 2.8;
            o.x = lerp(x1 + 0.1, x1 + 0.8, f); o.z = z; o.y = G + hipStand + Math.abs(Math.sin(u * 6)) * 0.08 * (1 - f);
            o.ry = Math.PI / 2;
        }
    }
}
