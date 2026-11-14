/**
 * AUDIRA-LAND: Animasi proyek pembangunan (dimuat lazy, hanya saat ada proyek 'proyek').
 *
 * - Rumah tumbuh: model rumah asli dari kit Desa × Profesi dipotong bidang klip yang naik sesuai
 *   progres (fondasi -> rangka -> dinding -> atap). Bagian yang belum jadi = bayangan cetak biru.
 * - Pekerja: tukang palu, tukang dorong gerobak bata, beban derek naik-turun.
 * - Debu tiap ketukan palu + suara "tok" bila kamera dekat; confetti + nada selebrasi saat selesai.
 * - Pil HUD "Rumahmu 62% · 01:54" untuk rumah milik pemain; diketuk = kamera ke rumah.
 *
 * Anggaran: pekerja/gerobak/beban = 4 InstancedMesh bersama (bukan per proyek), debu 1 Points,
 * rumah tumbuh +2 draw call per proyek. Semua hanya untuk proyek dalam RANGE meter dari kamera.
 */

// Dependensi disuntik lewat konstruktor (deps), bukan diimpor: chunk lazy ini tidak mengimpor modul
// bundel utama, jadi esbuild tidak memecah bundel awal menjadi chunk bersama (menambah ukuran awal).
let createHomeKitMesh, loadHomeKit, pfMaterial, playerState, preloadPolyfork, pfGeo, riverMaxX;

// ---------------------------------------------------------------------------
// Properti Polyfork Construction Site kit (CC BY 4.0, kredit di docs/CREDITS_POLYFORK.md).
// Spek: docs/SPEC_PROYEK_KIT_KONSTRUKSI.md. Have = mesin modern, Have-Not = tenaga tangan.
// Posisi diukur dari tepi kavling: [id, tepi 'L'|'R', jarak dari tepi kiri/kanan, jarak dari tepi
// depan (+Z), yaw, skala]. Kavling 1×1 = 7,2 m; rumah tumbuh di belakang (z < 1,0 lokal).
// ---------------------------------------------------------------------------
const EXCAVATOR = 'mini-excavator-cbe1ae';
const EXC_SCALE = 0.85;
const KIT_PROPS = {
    have: [
        ['portable-toilet-a3f1a2', 'R', 0.45, 0.6, -Math.PI / 2, 0.75],
        ['site-safety-sign-board-5408d5', 'R', 2.4, 0.3, 0, 0.55],
        ['site-traffic-cone-d3ce94', 'L', 3.0, 0.3, 0, 1],
        ['site-traffic-cone-d3ce94', 'L', 3.6, 0.3, 0.4, 1]
    ],
    haveNot: [
        ['cement-mixer-on-a-8fb979', 'L', 0.9, 1.75, 0, 1],
        ['spoil-heap-9aaa11', 'L', 1.1, 0.65, 0, 0.33],
        ['material-pallet-6af263', 'L', 2.6, 0.5, 0.1, 0.8],
        ['builder-s-dumpy-bag-89fd1b', 'R', 0.5, 0.5, 0, 0.8],
        ['builder-s-dumpy-bag-89fd1b', 'R', 2.2, 0.45, 0.5, 0.75]
    ]
};
const KIT_IDS = [EXCAVATOR, ...new Set([...KIT_PROPS.have, ...KIT_PROPS.haveNot].map(p => p[0]))];

const RANGE = 120;          // proyek lebih jauh: tanpa animasi
const SOUND_RANGE = 45;     // ketukan palu terdengar dalam jarak ini
const MAX_PROJECTS = 6;     // instance pekerja dialokasikan untuk sekian proyek terdekat
const WORKERS_PER = 3;
const DUST_MAX = 90;
const CONFETTI_MAX = 160;

const PHASES = [
    [0.2, '🧱 Fondasi'],
    [0.5, '🪵 Rangka'],
    [0.8, '🏠 Dinding'],
    [1.01, '⛩️ Atap']
];
export const phaseOf = p => PHASES.find(([t]) => p < t)[1];

// ---------------------------------------------------------------------------
// Geometri sederhana ber-warna vertex (digabung jadi satu geometri per InstancedMesh)
// ---------------------------------------------------------------------------
function colored(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(hex).convertSRGBToLinear();
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
}
function part(geo, hex, x, y, z, rx = 0) {
    const g = colored(geo, hex);
    const m = new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z);
    g.applyMatrix4(m);
    return g;
}
function merge(parts) {
    const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const g of parts) {
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        col.set(g.attributes.color.array, o * 3);
        o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
}

/** Gabung geometri Polyfork (position, normal, color, index) yang sudah diberi matriks dunia. */
function mergeIndexed(parts) {
    let nv = 0, ni = 0;
    for (const [g] of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const nm = new THREE.Matrix3(), p = new THREE.Vector3();
    let vo = 0, io = 0;
    for (const [g, m] of parts) {
        const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, n = P.count;
        nm.getNormalMatrix(m);
        for (let i = 0; i < n; i++) {
            p.fromBufferAttribute(P, i).applyMatrix4(m);
            pos[(vo + i) * 3] = p.x; pos[(vo + i) * 3 + 1] = p.y; pos[(vo + i) * 3 + 2] = p.z;
            if (N) {
                p.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
                nor[(vo + i) * 3] = p.x; nor[(vo + i) * 3 + 1] = p.y; nor[(vo + i) * 3 + 2] = p.z;
            }
            const c = (vo + i) * 3;
            if (C) { col[c] = C.getX(i); col[c + 1] = C.getY(i); col[c + 2] = C.getZ(i); }
            else col[c] = col[c + 1] = col[c + 2] = 1;
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
        else for (let i = 0; i < n; i++) idx[io++] = i + vo;
        vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
}

const SKIN = 0xC68A5E, VEST = 0xF97316, PANTS = 0x334155, HAT = 0xFACC15, WOOD = 0x8B5A2B, BRICK = 0xB4532A, IRON = 0x64748B;

function workerGeo() {
    return merge([
        part(new THREE.BoxGeometry(0.16, 0.7, 0.18), PANTS, -0.1, 0.35, 0),
        part(new THREE.BoxGeometry(0.16, 0.7, 0.18), PANTS, 0.1, 0.35, 0),
        part(new THREE.BoxGeometry(0.46, 0.62, 0.26), VEST, 0, 1.0, 0),
        part(new THREE.BoxGeometry(0.12, 0.55, 0.14), VEST, -0.3, 1.02, 0),   // lengan kiri diam
        part(new THREE.SphereGeometry(0.17, 8, 6), SKIN, 0, 1.47, 0),
        part(new THREE.CylinderGeometry(0.06, 0.3, 0.14, 8), HAT, 0, 1.62, 0)  // helm/caping
    ]);
}
// Lengan kanan + palu, pivot di bahu (0,0,0); diputar di sumbu X lokal
function armGeo() {
    return merge([
        part(new THREE.BoxGeometry(0.12, 0.5, 0.14), VEST, 0, -0.25, 0),
        part(new THREE.BoxGeometry(0.04, 0.04, 0.36), WOOD, 0, -0.5, 0.16),
        part(new THREE.BoxGeometry(0.1, 0.1, 0.18), IRON, 0, -0.5, 0.36)
    ]);
}
function cartGeo() {
    const parts = [
        part(new THREE.BoxGeometry(0.6, 0.25, 0.9), IRON, 0, 0.45, 0),
        part(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 10).rotateZ(Math.PI / 2), 0x1F2937, 0, 0.18, 0.5),
        part(new THREE.BoxGeometry(0.04, 0.04, 0.8), WOOD, -0.22, 0.55, -0.7),
        part(new THREE.BoxGeometry(0.04, 0.04, 0.8), WOOD, 0.22, 0.55, -0.7)
    ];
    for (let i = 0; i < 4; i++) parts.push(part(new THREE.BoxGeometry(0.22, 0.1, 0.11), BRICK, -0.12 + (i % 2) * 0.24, 0.63, -0.15 + (i >> 1) * 0.3));
    return merge(parts);
}
function loadGeo() {
    const parts = [part(new THREE.BoxGeometry(1.0, 0.12, 1.0), WOOD, 0, 0, 0)];
    for (let i = 0; i < 6; i++) parts.push(part(new THREE.BoxGeometry(0.3, 0.14, 0.45), BRICK, -0.33 + (i % 3) * 0.33, 0.13, -0.22 + (i >= 3 ? 0.45 : 0)));
    parts.push(part(new THREE.BoxGeometry(0.03, 2.0, 0.03), 0x111827, 0, 1.1, 0)); // tali derek
    return merge(parts);
}

// ---------------------------------------------------------------------------

export class ConstructionFX {
    /**
     * @param {object} o
     * @param {THREE.Scene} o.scene
     * @param {object} o.buildingLoader   BuildingLoader (loadedBuildings: id -> { data, mesh })
     * @param {THREE.WebGLRenderer} o.renderer
     * @param {object} o.camera           CameraController (recenter, distanceDesired, camera)
     * @param {() => boolean} [o.isMuted]
     * @param {object} o.deps  { createHomeKitMesh, loadHomeKit, pfMaterial, playerState }
     */
    constructor({ scene, buildingLoader, renderer, camera, isMuted, deps }) {
        ({ createHomeKitMesh, loadHomeKit, pfMaterial, playerState, preloadPolyfork, pfGeo, riverMaxX } = deps);
        this.scene = scene;
        this.loader = buildingLoader;
        this.cam = camera;
        this.isMuted = isMuted || (() => false);
        this.projects = new Map();     // id -> record
        this.time = 0;
        renderer.localClippingEnabled = true;

        const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
        const im = (geo, count) => {
            const m = new THREE.InstancedMesh(geo, mat, count);
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;  // instance tersebar di beberapa kavling; jumlahnya kecil
            m.castShadow = true;
            m.count = 0;
            m.name = 'construction_fx';
            scene.add(m);
            return m;
        };
        const n = MAX_PROJECTS * WORKERS_PER;
        this.workers = im(workerGeo(), n);
        this.arms = im(armGeo(), n);
        this.carts = im(cartGeo(), MAX_PROJECTS);
        this.loads = im(loadGeo(), MAX_PROJECTS);

        // Properti kit konstruksi: dimuat lazy; sebelum siap proyek tampil seperti biasa
        this.kitMat = new THREE.MeshLambertMaterial({ vertexColors: true });
        // Model tiba satu per satu (juga sesudah batas tunggu preload); updateKit memeriksa jumlah
        // model termuat dan menyusun ulang bila bertambah, jadi model yang terlambat tetap muncul.
        this.kitReady = !!(preloadPolyfork && pfGeo);
        this.kitLoaded = -1;
        this.kitKey = '';
        this.kitStatic = null;          // 1 Mesh lebur semua properti statis proyek dekat
        this.excavators = null;         // 1 InstancedMesh (Desa Have), dibuat begitu modelnya tiba
        this.makeIM = im;
        if (this.kitReady) {
            preloadPolyfork(KIT_IDS, 20000).catch(e => console.warn('[Konstruksi] kit Polyfork gagal dimuat:', e));
        }

        this.dust = this.makePoints(DUST_MAX, 0xD6C7A8, 0.55, false);
        this.dustLife = new Float32Array(DUST_MAX);
        this.dustVel = new Float32Array(DUST_MAX * 3);
        this.dustNext = 0;

        this.confetti = this.makePoints(CONFETTI_MAX, 0xffffff, 0.45, true);
        this.confettiVel = new Float32Array(CONFETTI_MAX * 3);
        this.confettiT = 0;

        this.tmpM = new THREE.Matrix4();
        this.tmpQ = new THREE.Quaternion();
        this.tmpV = new THREE.Vector3();
        this.tmpS = new THREE.Vector3(1, 1, 1);
        this.tmpE = new THREE.Euler();

        this.mountPill();
    }

    makePoints(count, hex, size, vertexColors) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3).fill(-1000), 3));
        if (vertexColors) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        const mat = new THREE.PointsMaterial({ color: hex, size, vertexColors, transparent: true, opacity: 0.85, depthWrite: false });
        const p = new THREE.Points(geo, mat);
        p.frustumCulled = false;
        p.visible = false;
        this.scene.add(p);
        return p;
    }

    // ---------------------------------------------------------------- proyek
    progressOf(d) {
        const s = new Date(d.build_started_at).getTime();
        const f = new Date(d.build_finished_at).getTime();
        if (!isFinite(s) || !isFinite(f) || f <= s) return 0;
        return Math.min(1, Math.max(0, (Date.now() - s) / (f - s)));
    }

    attach(id, item) {
        const rec = { id, item, house: null, ghost: null, minY: 0, maxY: 1, loading: false, swingPhase: Math.random() * 6, lastHit: 0 };
        this.projects.set(id, rec);
        if (item.data.pf_house) this.buildHouse(rec);
        return rec;
    }

    buildHouse(rec) {
        const d = rec.item.data;
        const kit = createHomeKitMesh(d);
        if (!kit) {
            if (!rec.loading) {
                rec.loading = true;
                loadHomeKit(d).then(ok => { rec.loading = false; if (ok && this.projects.get(rec.id) === rec) this.buildHouse(rec); });
            }
            return;
        }
        // Hanya rumah: kendaraan baru muncul saat rumah selesai (bangunan jadi memuat kit utuh)
        const houseMesh = kit.children[kit.children.length - 1];
        kit.children.filter(c => c !== houseMesh).forEach(c => kit.remove(c));

        const src = rec.item.mesh;
        kit.position.copy(src.position);
        kit.rotation.copy(src.rotation);
        kit.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(kit);
        rec.minY = box.min.y;
        rec.maxY = box.max.y;

        rec.cutBelow = new THREE.Plane(new THREE.Vector3(0, -1, 0), rec.minY);
        rec.cutAbove = new THREE.Plane(new THREE.Vector3(0, 1, 0), -rec.minY);
        const solid = pfMaterial().clone();
        solid.clippingPlanes = [rec.cutBelow];
        solid.clipShadows = true;
        houseMesh.material = solid;

        const ghost = new THREE.Mesh(houseMesh.geometry, new THREE.MeshBasicMaterial({
            color: 0x60A5FA, transparent: true, opacity: 0.22, depthWrite: false, clippingPlanes: [rec.cutAbove]
        }));
        ghost.position.copy(houseMesh.position);
        ghost.rotation.copy(houseMesh.rotation);
        ghost.scale.copy(houseMesh.scale);
        ghost.castShadow = false;
        kit.add(ghost);

        kit.name = `construction_house_${rec.id}`;
        this.scene.add(kit);
        rec.house = kit;
        rec.ghost = ghost;
    }

    detach(rec) {
        if (rec.house) {
            this.scene.remove(rec.house);
            rec.house.traverse(o => { if (o.material && o.material !== pfMaterial()) o.material.dispose(); });
        }
        this.projects.delete(rec.id);
    }

    // ---------------------------------------------------------------- frame
    update(dt) {
        this.time += dt;
        const camPos = this.cam.camera.position;
        const target = this.cam.target;

        // 1. Sinkron daftar proyek (proyek selesai / digusur -> dilepas)
        const live = [];
        this.loader.loadedBuildings.forEach((item, id) => {
            if (item.data.stage !== 'proyek' || !item.mesh) return;
            const dx = item.mesh.position.x - target.x, dz = item.mesh.position.z - target.z;
            live.push({ id, item, dist: Math.hypot(dx, dz) });
        });
        const liveIds = new Set(live.map(l => l.id));
        for (const rec of [...this.projects.values()]) {
            if (!liveIds.has(rec.id) || this.loader.loadedBuildings.get(rec.id)?.mesh !== rec.item.mesh) this.detach(rec);
        }
        live.sort((a, b) => a.dist - b.dist);
        const near = live.filter(l => l.dist < RANGE).slice(0, MAX_PROJECTS);

        // 2. Animasi tiap proyek dekat
        let wi = 0, ci = 0;
        for (const { id, item } of near) {
            const rec = this.projects.get(id) || this.attach(id, item);
            const p = this.progressOf(item.data);
            if (rec.house) {
                const cut = rec.minY + (rec.maxY - rec.minY) * p;
                rec.cutBelow.constant = cut;
                rec.cutAbove.constant = -cut;
                rec.house.visible = true;
            }
            const m = item.mesh.matrixWorld;
            ci = this.animateCrew(rec, item, m, p, wi, ci, camPos);
            wi += WORKERS_PER;
        }
        // Proyek jauh: rumah tumbuh tetap disembunyikan (tak perlu digambar)
        const nearIds = new Set(near.map(n => n.id));
        this.projects.forEach(rec => { if (rec.house && !nearIds.has(rec.id)) rec.house.visible = false; });

        this.updateKit(near);

        this.workers.count = this.arms.count = wi;
        this.carts.count = this.loads.count = ci;
        for (const m of [this.workers, this.arms, this.carts, this.loads]) {
            m.visible = m.count > 0;
            m.instanceMatrix.needsUpdate = true;
        }

        this.updateDust(dt);
        this.updateConfetti(dt);
        this.updatePill();
    }

    // ---------------------------------------------------------------- kit konstruksi
    isHaveNot(item) {
        const d = item.data;
        if (d.is_have !== undefined && d.is_have !== null) return !d.is_have;
        return item.mesh.position.x > (riverMaxX ?? 16);
    }

    /**
     * Zero-Submerging: dasar properti = puncak alas pasir perancah + micro-lift 0,02 m.
     * building_loader: kota = kotak tebal 0,08 di y 0,04 (puncak 0,08); desa (x > RIVER_MAX_X) = pad organik y 0,03.
     */
    padTop(item) {
        return item.mesh.position.x > (riverMaxX ?? 16) ? 0.05 : 0.10;
    }

    /** Ukuran setengah kavling (lokal) sama dengan perancah building_loader. */
    lotHalf(d) {
        return [((d.width || 1) * 8.0 - 0.8) / 2, ((d.height || 1) * 8.0 - 0.8) / 2];
    }

    /** Lebur properti statis proyek dekat jadi 1 Mesh (hanya saat daftar berubah) + ayun excavator. */
    updateKit(near) {
        if (!this.kitReady) return;
        if (this.kitLoaded < KIT_IDS.length) {
            const n = KIT_IDS.filter(id => pfGeo(id)).length;
            if (n !== this.kitLoaded) { this.kitLoaded = n; this.kitKey = ''; }
            if (!this.excavators && pfGeo(EXCAVATOR)) {
                this.excavators = this.makeIM(pfGeo(EXCAVATOR), MAX_PROJECTS);
                this.excavators.material = this.kitMat;
                this.excavators.receiveShadow = true;
            }
        }
        // Diurutkan per id: pergeseran urutan jarak antarproyek tidak memicu susun ulang (patah frame)
        const key = near.map(n => `${n.id}@${n.item.mesh.uuid}`).sort().join(',') + `#${this.kitLoaded}`;
        if (key !== this.kitKey) {
            this.kitKey = key;
            this.rebuildKit(near);
        }
        if (!this.excavators) return;
        let ei = 0;
        for (const { id, item } of near) {
            if (this.isHaveNot(item)) continue;
            const [hw, hd] = this.lotHalf(item.data);
            const rec = this.projects.get(id);
            const t = this.time + (rec ? rec.swingPhase : 0);
            // Menghadap rumah (-Z), lengan berayun kiri-kanan seperti menggali fondasi
            const yaw = Math.PI + Math.sin(t * 0.6) * 0.45;
            this.tmpS.setScalar(EXC_SCALE);
            this.setLocal(this.excavators, ei++, item.mesh.matrixWorld, -hw + 1.05, this.padTop(item), hd - 1.4, yaw);
            this.tmpS.setScalar(1);
        }
        this.excavators.count = ei;
        this.excavators.visible = ei > 0;
        this.excavators.instanceMatrix.needsUpdate = true;
    }

    rebuildKit(near) {
        if (this.kitStatic) {
            this.scene.remove(this.kitStatic);
            this.kitStatic.geometry.dispose();
            this.kitStatic = null;
        }
        const parts = [];
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        for (const { item } of near) {
            const [hw, hd] = this.lotHalf(item.data);
            const y0 = this.padTop(item);
            item.mesh.updateMatrixWorld(true);
            for (const [id, edge, dx, dz, yaw, sc] of KIT_PROPS[this.isHaveNot(item) ? 'haveNot' : 'have']) {
                const g = pfGeo(id);
                if (!g) continue;
                v.set(edge === 'L' ? -hw + dx : hw - dx, y0, hd - dz);
                q.setFromAxisAngle(up, yaw);
                s.setScalar(sc);
                m.compose(v, q, s).premultiply(item.mesh.matrixWorld);
                parts.push([g, m.clone()]);
            }
        }
        if (!parts.length) return;
        const geo = mergeIndexed(parts);
        const mesh = new THREE.Mesh(geo, this.kitMat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.name = 'construction_kit';
        this.scene.add(mesh);
        this.kitStatic = mesh;
    }

    /** Matriks instance dari posisi/yaw lokal kavling (koordinat grup perancah). */
    setLocal(mesh, index, lotMatrix, x, y, z, yaw, pitch = 0) {
        this.tmpE.set(pitch, yaw, 0, 'YXZ');
        this.tmpQ.setFromEuler(this.tmpE);
        this.tmpV.set(x, y, z);
        this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
        this.tmpM.premultiply(lotMatrix);
        mesh.setMatrixAt(index, this.tmpM);
    }

    animateCrew(rec, item, lotM, p, wi, ci, camPos) {
        const t = this.time + rec.swingPhase;
        const w = (item.data.width || 1) * 8.0 - 0.8;
        const d = (item.data.height || 1) * 8.0 - 0.8;
        const hx = w / 2 - 0.5, hz = d / 2 - 0.5;

        // Tukang palu 1: depan-kiri, menghadap rumah (yaw 0 = menghadap +Z; rumah di -Z)
        const hammerers = [[-hx * 0.55, hz * 0.15, Math.PI, 0], [hx * 0.7, -hz * 0.2, -Math.PI / 2, 1.7]];
        hammerers.forEach(([x, z, yaw, off], k) => {
            const swing = Math.sin((t + off) * 7.0);
            this.setLocal(this.workers, wi + k, lotM, x, 0, z, yaw);
            // bahu kanan: x lokal +0.3, y 1.28; diputar ke depan/belakang
            const sx = Math.cos(yaw) * 0.3, sz = -Math.sin(yaw) * 0.3;
            this.setLocal(this.arms, wi + k, lotM, x + sx, 1.28, z + sz, yaw, -0.6 + swing * 0.9);
            // Ketukan = palu di posisi terbawah
            if (swing < -0.97 && t - (rec['hit' + k] || 0) > 0.3) {
                rec['hit' + k] = t;
                const fx = x + Math.sin(yaw) * 0.6, fz = z + Math.cos(yaw) * 0.6;
                this.tmpV.set(fx, 0.3, fz).applyMatrix4(lotM);
                this.spawnDust(this.tmpV, 3);
                if (k === 0 && this.tmpV.distanceTo(camPos) < SOUND_RANGE) this.tok();
            }
        });

        // Tukang gerobak: bolak-balik di depan rumah (z 1,6 dari tepi depan 3,6 m pada kavling 1×1),
        // jauh dari tiang derek (sudut kanan depan) dan excavator/molen (sudut kiri depan)
        const cyc = (t * 0.18) % 2;
        const u = cyc < 1 ? cyc : 2 - cyc;            // 0..1..0
        const e = u * u * (3 - 2 * u);
        const cx = (w / 2 - 1.5) - e * 2.6;
        const cz = d / 2 - 2.0;
        const dir = cyc < 1 ? -Math.PI / 2 : Math.PI / 2;
        const bob = Math.abs(Math.sin(t * 9)) * 0.04;
        this.setLocal(this.workers, wi + 2, lotM, cx - Math.sin(dir) * 0.9, bob, cz, dir);
        this.setLocal(this.arms, wi + 2, lotM, cx - Math.sin(dir) * 0.9 + Math.cos(dir) * 0.3, 1.28 + bob, cz - Math.sin(dir) * 0.3, dir, -0.9);
        this.setLocal(this.carts, ci, lotM, cx, 0, cz, dir);

        // Beban derek: naik ke puncak rumah yang sedang tumbuh, lalu turun lagi
        const top = Math.max(2, (rec.maxY - rec.minY) * p + 1.5);
        const lc = (t * 0.12) % 1;
        // Dasar beban tetap di atas kepala pekerja gerobak (tinggi 1,7 m) yang lewat di bawahnya
        const ly = 1.9 + (lc < 0.5 ? lc * 2 : (1 - lc) * 2) * (top - 1.7);
        // x di bawah lengan derek, di antara jalur gerobak dan properti tepi depan
        this.setLocal(this.loads, ci, lotM, w / 2 - 3.2, ly, d / 2 - 1.2, t * 0.3);
        return ci + 1;
    }

    // ---------------------------------------------------------------- debu
    spawnDust(at, n) {
        const pos = this.dust.geometry.attributes.position.array;
        for (let i = 0; i < n; i++) {
            const k = this.dustNext;
            this.dustNext = (this.dustNext + 1) % DUST_MAX;
            pos[k * 3] = at.x; pos[k * 3 + 1] = at.y; pos[k * 3 + 2] = at.z;
            this.dustVel[k * 3] = (Math.random() - 0.5) * 1.2;
            this.dustVel[k * 3 + 1] = 0.6 + Math.random() * 0.7;
            this.dustVel[k * 3 + 2] = (Math.random() - 0.5) * 1.2;
            this.dustLife[k] = 0.9 + Math.random() * 0.5;
        }
        this.dust.visible = true;
    }
    updateDust(dt) {
        if (!this.dust.visible) return;
        const pos = this.dust.geometry.attributes.position.array;
        let alive = 0;
        for (let k = 0; k < DUST_MAX; k++) {
            if (this.dustLife[k] <= 0) continue;
            this.dustLife[k] -= dt;
            if (this.dustLife[k] <= 0) { pos[k * 3 + 1] = -1000; continue; }
            alive++;
            pos[k * 3] += this.dustVel[k * 3] * dt;
            pos[k * 3 + 1] += this.dustVel[k * 3 + 1] * dt;
            pos[k * 3 + 2] += this.dustVel[k * 3 + 2] * dt;
            this.dustVel[k * 3 + 1] *= 0.96;
        }
        this.dust.geometry.attributes.position.needsUpdate = true;
        this.dust.visible = alive > 0;
    }

    // ---------------------------------------------------------------- selesai
    /** Confetti + nada selebrasi + kamera mendekat ke rumah yang baru jadi. */
    celebrate(x, z) {
        const pos = this.confetti.geometry.attributes.position.array;
        const col = this.confetti.geometry.attributes.color.array;
        const palette = [0xC8553D, 0xE9A91E, 0x7FA062, 0x60A5FA, 0xF472B6, 0xFFFFFF].map(h => new THREE.Color(h));
        for (let k = 0; k < CONFETTI_MAX; k++) {
            pos[k * 3] = x + (Math.random() - 0.5) * 2;
            pos[k * 3 + 1] = 3 + Math.random() * 2;
            pos[k * 3 + 2] = z + (Math.random() - 0.5) * 2;
            const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
            this.confettiVel[k * 3] = Math.cos(a) * s;
            this.confettiVel[k * 3 + 1] = 6 + Math.random() * 6;
            this.confettiVel[k * 3 + 2] = Math.sin(a) * s;
            const c = palette[k % palette.length];
            col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        }
        this.confetti.geometry.attributes.position.needsUpdate = true;
        this.confetti.geometry.attributes.color.needsUpdate = true;
        this.confetti.visible = true;
        this.confettiT = 4;
        this.cam.recenter(x, z);
        this.cam.distanceDesired = Math.max(this.cam.minDistance || 4, 26);
        this.chime();
    }
    updateConfetti(dt) {
        if (!this.confetti.visible) return;
        this.confettiT -= dt;
        if (this.confettiT <= 0) { this.confetti.visible = false; return; }
        const pos = this.confetti.geometry.attributes.position.array;
        for (let k = 0; k < CONFETTI_MAX; k++) {
            const v = this.confettiVel;
            v[k * 3 + 1] -= 9 * dt;
            v[k * 3] *= 0.985; v[k * 3 + 2] *= 0.985;
            if (v[k * 3 + 1] < -2.2) v[k * 3 + 1] = -2.2;   // melayang turun seperti kertas
            pos[k * 3] += v[k * 3] * dt + Math.sin(this.confettiT * 8 + k) * 0.02;
            pos[k * 3 + 1] = Math.max(0.25, pos[k * 3 + 1] + v[k * 3 + 1] * dt);
            pos[k * 3 + 2] += v[k * 3 + 2] * dt;
        }
        this.confetti.geometry.attributes.position.needsUpdate = true;
        this.confetti.material.opacity = Math.min(0.95, this.confettiT);
    }

    // ---------------------------------------------------------------- suara
    audio() {
        if (this.isMuted()) return null;
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }
    tone(freq, start, dur, gain, type = 'sine') {
        const ctx = this.audio();
        if (!ctx) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, ctx.currentTime + start);
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur + 0.02);
    }
    tok() { this.tone(820 + Math.random() * 120, 0, 0.06, 0.05, 'triangle'); }
    chime() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.12, 0.5, 0.08)); }

    // ---------------------------------------------------------------- pil HUD
    mountPill() {
        const el = document.createElement('button');
        el.className = 'construction-pill';
        el.type = 'button';
        el.hidden = true;
        el.addEventListener('click', () => {
            const item = this.loader.loadedBuildings.get(playerState.state.homeId);
            if (!item) return;
            this.cam.recenter(item.data.worldX, item.data.worldZ);
            this.cam.distanceDesired = Math.max(this.cam.minDistance || 4, 30);
        });
        document.body.appendChild(el);
        this.pill = el;
        this.pillText = '';
    }
    updatePill() {
        const item = this.loader.loadedBuildings.get(playerState.state.homeId);
        // Disembunyikan saat kartu kavling terbuka (posisinya sama-sama di atas footer)
        const card = document.getElementById('hud-plot-card');
        const show = !!(item && item.data.stage === 'proyek') && !(card && card.style.display !== 'none');
        this.pill.hidden = !show;
        if (!show) return;
        // Tepat di atas footer HUD (tombol jam & kamera); tinggi footer berbeda HP vs desktop
        const footer = document.querySelector('.hud-footer');
        if (footer) {
            const top = footer.getBoundingClientRect().top;
            this.pill.style.bottom = `${Math.max(16, window.innerHeight - top + 8)}px`;
        }
        const d = item.data;
        const p = this.progressOf(d);
        const left = Math.max(0, Math.ceil((new Date(d.build_finished_at).getTime() - Date.now()) / 1000));
        const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
        const pct = Math.floor(p * 100);
        const text = `🏗️ Rumahmu ${pct}% · ${phaseOf(p)} · ${mm}:${ss}`;
        if (text !== this.pillText) {
            this.pillText = text;
            this.pill.textContent = text;
            this.pill.style.setProperty('--p', pct + '%');
            this.pill.setAttribute('aria-label', `Rumahmu sedang dibangun, ${pct} persen, sisa ${mm} menit ${ss} detik. Ketuk untuk melihat.`);
        }
    }
}
