/**
 * AUDIRA-LAND: Cuaca & Langit (2026-11-13)
 *
 * - Awan low-poly (1 InstancedMesh, 1 draw call) melayang pelan, warna ikut langit
 *   siang/senja/malam (Lambert + emissive warna horizon).
 * - Hujan tropis: garis hujan di sekitar fokus kamera (1 LineSegments, gerak di shader,
 *   0 kerja CPU per tetes), langit & cahaya meredup lewat `lighting.setOvercast()`,
 *   genangan berkilau di jalan (1 InstancedMesh Phong).
 * - Malam: bintang (1 Points, hanya tampil malam & langit cerah); bulan digambar di
 *   shader kubah langit (0 draw call tambahan).
 * - Kabut pagi tipis di atas sawah 05:00–07:30 WIB (1 InstancedMesh).
 * - Musim salju (mode paksa, atau sesekali muncul di siklus otomatis sebagai
 *   kejutan langka): serpih salju (1 Points), langit putih kelabu, salju menumpuk di
 *   jalan (instance genangan dipakai ulang berwarna putih).
 * - Siklus cuaca acak deterministik per slot 5 menit waktu nyata (±6 jam game pada
 *   siklus siang-malam 24 menit; sama di semua perangkat) + mode paksa
 *   Cerah/Hujan/Salju lewat tombol cuaca (localStorage).
 *
 * Semua objek `userData.noBatch` agar tidak dilebur bakeStatic. Objek yang tak terlihat
 * di-set `visible = false` sehingga tidak memakan draw call.
 */

import { GRID_CONFIG, wx, EAST_DX } from './constants.js';
import { roadRuns, roadWidth, roadAt, isRoadTile, isRiverTile } from './road_network.js';

const RAIN_SLOT_MIN = 5;       // panjang satu slot cuaca (menit nyata ≈ 6 jam game)
const RAIN_CHANCE = 0.22;      // peluang hujan per slot
const SNOW_CHANCE = 0.05;      // peluang salju per slot di mode auto (kejutan langka)
const FADE_PER_SEC = 1 / 14;   // hujan datang/reda ±14 dtk
const MODES = ['auto', 'cerah', 'hujan', 'salju'];
const MODE_ICON = { auto: '⛅', cerah: '☀️', hujan: '🌧️', salju: '❄️' };
const MODE_LABEL = { auto: 'Cuaca otomatis', cerah: 'Cuaca: cerah', hujan: 'Cuaca: hujan', salju: 'Cuaca: musim salju' };
const LS_KEY = 'audira_weather_mode';

function hash01(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
}

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

/** Satu awan = beberapa ikosahedron gepeng berdasar rata (low-poly). */
function makeCloudGeometry() {
    const blobs = [
        [0, 0.35, 0, 1.0], [0.95, 0.15, 0.1, 0.72], [-0.9, 0.12, -0.05, 0.68],
        [0.35, 0.55, -0.35, 0.6], [-0.4, 0.4, 0.38, 0.55]
    ];
    const pos = [];
    for (const [x, y, z, r] of blobs) {
        const g = new THREE.IcosahedronGeometry(r, 0);
        const p = g.attributes.position.array;
        for (let i = 0; i < p.length; i += 3) {
            pos.push(p[i] + x, Math.max(0, p[i + 1] * 0.62 + y), p[i + 2] * 0.85 + z);
        }
        g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals(); // non-indexed -> normal datar (faceted)
    return geo;
}

function makeSoftTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

export class WeatherSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {CityLighting} lighting
     */
    constructor(scene, lighting) {
        this.scene = scene;
        this.lighting = lighting;
        this.time = 0;
        this.rain = 0;          // 0..1 intensitas hujan saat ini (sudah dihaluskan)
        this.rainTarget = 0;
        this.mode = 'auto';
        try {
            const m = localStorage.getItem(LS_KEY);
            if (MODES.includes(m)) this.mode = m;
        } catch (e) { /* storage diblokir: pakai auto */ }
        this.rainTarget = this.computeRainTarget();
        this.rain = this.rainTarget;   // saat load langsung pada kondisi sekarang
        this.snowTarget = this.computeSnowTarget();
        this.snow = this.snowTarget;
        this._overcastSent = -1;
        this._tmpM = new THREE.Matrix4();
        this._tmpQ = new THREE.Quaternion();
        this._tmpS = new THREE.Vector3();
        this._tmpP = new THREE.Vector3();
        this._cWhite = lin(0xFFFFFF);
        this._cGrey = lin(0x8E959E);
        this._c = new THREE.Color();
        this._cSnow = lin(0xF2F5F8);

        this.buildClouds();
        this.buildRain();
        this.buildPuddles();
        this.buildSnow();
        this.buildStars();
        this.buildMist();
        this.listeners = new Set();
    }

    // ------------------------------------------------------------------ awan
    buildClouds() {
        const N = 90;
        const mat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF }); // normal non-indexed sudah datar (faceted)
        mat.emissive = new THREE.Color(0x000000);
        const mesh = new THREE.InstancedMesh(makeCloudGeometry(), mat, N);
        mesh.name = 'weather_clouds';
        mesh.frustumCulled = false;
        mesh.userData.noBatch = true;
        const r = mulberry32(9001);
        this.clouds = [];
        for (let i = 0; i < N; i++) {
            this.clouds.push({
                x: (r() - 0.5) * 1100,
                z: (r() - 0.5) * 1100,
                // Rendah agar terlihat di cakrawala (awan 150 m+ tertelan kabut jarak jauh)
                y: 60 + r() * 45,
                s: 18 + r() * 26,
                sy: 0.8 + r() * 0.5,
                rot: r() * Math.PI * 2,
                speed: 0.6 + r() * 0.6,
                rainOnly: i >= 56    // awan tambahan muncul saat mendung
            });
        }
        this.cloudMesh = mesh;
        // Kamera diambil dari render pertama (tanpa mengubah tanda tangan update() di main.js)
        mesh.onBeforeRender = (renderer, scene, camera) => { this.cam = camera; };
        this._frustum = new THREE.Frustum();
        this._pv = new THREE.Matrix4();
        this._sphere = new THREE.Sphere();
        this.scene.add(mesh);
    }

    updateClouds(dt, focus) {
        const windX = 2.2 + this.rain * 3.0;   // m/dtk, angin tenggara -> barat laut
        const windZ = -0.9;
        const W = 1100, H = W / 2;
        const cover = Math.max(this.rain, this.snow);
        const shown = cover > 0.15 ? this.clouds.length : 56;
        const m = this._tmpM, q = this._tmpQ, s = this._tmpS, p = this._tmpP;
        const up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
        let k = 0;
        for (let i = 0; i < shown; i++) {
            const c = this.clouds[i];
            c.x += windX * c.speed * dt;
            c.z += windZ * c.speed * dt;
            // Bungkus relatif terhadap fokus kamera -> selalu ada awan di sekitar pemain
            const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
            const rx = ((c.x - fx + H) % W + W) % W - H;
            const rz = ((c.z - fz + H) % W + W) % W - H;
            // Lingkar kosong di atas fokus: awan tidak menutupi kota saat kamera zoom jauh
            const ring = smooth(45, 95, Math.hypot(rx, rz));
            const grow = (c.rainOnly ? Math.min(1, (cover - 0.15) * 2) : 1) * ring;
            if (grow < 0.02) continue;
            p.set(fx + rx, c.y - cover * 12, fz + rz);
            q.setFromAxisAngle(up, c.rot);
            s.set(c.s * grow, c.s * c.sy * grow * (1 + this.rain * 0.4), c.s * 0.75 * grow);
            m.compose(p, q, s);
            this.cloudMesh.setMatrixAt(k++, m);
        }
        this.cloudMesh.count = k;
        // Culling manual: InstancedMesh r128 tidak tahu sebaran instance, jadi draw call
        // hanya dipakai bila minimal satu awan masuk frustum kamera.
        let anyIn = k > 0;
        if (anyIn && this.cam) {
            const cam = this.cam;
            cam.updateMatrixWorld();
            this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
            this._frustum.setFromProjectionMatrix(this._pv);
            anyIn = false;
            for (let i = 0; i < k && !anyIn; i++) {
                this.cloudMesh.getMatrixAt(i, m);
                this._sphere.center.setFromMatrixPosition(m);
                this._sphere.radius = this.clouds[i].s * 1.6;
                anyIn = this._frustum.intersectsSphere(this._sphere);
            }
            if (!anyIn) this._cloudProbe = (this._cloudProbe || 0) + 1;
        }
        // Sesekali tetap tampil agar onBeforeRender memperbarui kamera
        this.cloudMesh.visible = anyIn || (this._cloudProbe % 30 === 0);
        this.cloudMesh.instanceMatrix.needsUpdate = true;

        // Warna: putih cerah -> abu saat hujan; emissive = horizon (senja jingga, malam biru gelap)
        const mat = this.cloudMesh.material;
        mat.color.copy(this._cWhite).lerp(this._cGrey, this.rain * 0.85 + this.snow * 0.35);
        const hor = this.lighting.sky.material.uniforms.horizonColor.value;
        mat.emissive.copy(hor).multiplyScalar(0.42 * (1 - this.rain * 0.4));
    }

    // ----------------------------------------------------------------- hujan
    buildRain() {
        const N = 2600;
        const pos = new Float32Array(N * 2 * 3);
        const end = new Float32Array(N * 2);
        const r = mulberry32(4242);
        for (let i = 0; i < N; i++) {
            const x = r(), y = r(), z = r();
            for (let k = 0; k < 2; k++) {
                const o = (i * 2 + k);
                pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
                end[o] = k;
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uCenter: { value: new THREE.Vector3() },
                uSize: { value: 120 },
                uHeight: { value: 70 },
                uLen: { value: 1 },
                uWind: { value: new THREE.Vector2(3.0, -1.2) },
                uOpacity: { value: 0 },
                uColor: { value: lin(0xC9D6E3) }
            },
            vertexShader: `
                attribute float aEnd;
                uniform float uTime, uSize, uHeight, uLen;
                uniform vec3 uCenter; uniform vec2 uWind;
                varying float vA;
                void main() {
                    vec3 s = position;
                    float speed = 24.0 + fract(s.x * 37.13 + s.z * 11.7) * 12.0;
                    float y = mod(s.y * uHeight - uTime * speed, uHeight);
                    vec3 p;
                    p.x = uCenter.x + (fract(s.x - uCenter.x / uSize) - 0.5) * uSize;
                    p.z = uCenter.z + (fract(s.z - uCenter.z / uSize) - 0.5) * uSize;
                    p.y = uCenter.y + y;
                    p.xz += uWind * (y / speed);       // tetes miring terbawa angin
                    vec3 vel = vec3(uWind.x, -speed, uWind.y);
                    p -= vel * 0.04 * uLen * aEnd;     // ekor garis ke arah datang
                    vA = (1.0 - aEnd * 0.75) * smoothstep(0.0, 3.0, y) * (1.0 - smoothstep(uHeight * 0.8, uHeight, y));
                    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
                }`,
            fragmentShader: `
                uniform vec3 uColor; uniform float uOpacity;
                varying float vA;
                void main() { gl_FragColor = vec4(uColor, uOpacity * vA); }`,
            transparent: true,
            depthWrite: false,
            fog: false
        });
        const lines = new THREE.LineSegments(geo, mat);
        lines.name = 'weather_rain';
        lines.frustumCulled = false;
        lines.userData.noBatch = true;
        lines.renderOrder = 5;
        lines.visible = false;
        this.rainLines = lines;
        this.scene.add(lines);
    }

    updateRain(focus, distance) {
        const u = this.rainLines.material.uniforms;
        u.uTime.value = this.time % 1000;
        const d = distance || 76;
        u.uSize.value = Math.min(220, Math.max(50, d * 1.3));
        u.uHeight.value = Math.min(120, Math.max(30, d * 0.8));
        u.uLen.value = Math.min(3, Math.max(0.8, d / 60));
        if (focus) u.uCenter.value.set(focus.x, 0, focus.z);
        const night = this.lighting.isNight() ? 0.55 : 1;
        u.uOpacity.value = this.rain * 0.72 * night;
        this.rainLines.visible = this.rain > 0.02;
    }

    // -------------------------------------------------------------- genangan
    buildPuddles() {
        const r = mulberry32(777);
        const T = GRID_CONFIG.TILE_SIZE;
        const spots = [];
        // Genangan di jalur lalu lintas ruas jalan (peta jalan organik road_network.js),
        // bukan di simpang, bukan di sungai/jembatan, hindari median arteri.
        const runs = roadRuns();
        const all = [...runs.v.map(v => ({ v })), ...runs.h.map(h => ({ h }))];
        const laneOffset = cls => {
            const half = roadWidth(cls) / 2;
            return cls === 3
                ? (1.4 + r() * Math.max(0.2, half - 2.4)) * (r() < 0.5 ? -1 : 1)
                : (r() - 0.5) * Math.max(0.4, half * 2 - 1.6);
        };
        let guard = 0;
        while (all.length && spots.length < 420 && guard++ < 20000) {
            const run = all[Math.floor(r() * all.length)];
            if (run.v) {
                const { i, j0, j1, cls } = run.v;
                if (j1 - j0 < 2) continue;
                const j = j0 + 1 + Math.floor(r() * (j1 - j0 - 1));
                if (isRiverTile(i) || roadAt(i, j) !== cls || isRoadTile(i - 1, j) || isRoadTile(i + 1, j)) continue;
                spots.push({ x: wx(i) + T / 2 + laneOffset(cls), z: wx(j) + r() * T });
            } else {
                const { j, i0, i1, cls } = run.h;
                if (i1 - i0 < 2) continue;
                const i = i0 + 1 + Math.floor(r() * (i1 - i0 - 1));
                if (isRiverTile(i) || roadAt(i, j) !== cls || isRoadTile(i, j - 1) || isRoadTile(i, j + 1)) continue;
                spots.push({ x: wx(i) + r() * T, z: wx(j) + T / 2 + laneOffset(cls) });
            }
        }
        const geo = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
        const mat = new THREE.MeshPhongMaterial({
            color: lin(0x3A4652), specular: 0xFFFFFF, shininess: 140,
            transparent: true, opacity: 0, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        });
        const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
        const m = this._tmpM, q = this._tmpQ, s = this._tmpS, p = this._tmpP;
        const up = new THREE.Vector3(0, 1, 0);
        spots.forEach((sp, i) => {
            // Permukaan aspal y 0,05 (marka 0,055); genangan sedikit di atasnya, tidak ambles
            p.set(sp.x, 0.062, sp.z);
            q.setFromAxisAngle(up, r() * Math.PI);
            const a = 0.7 + r() * 1.5;
            s.set(a * (1.2 + r() * 0.9), 1, a);
            m.compose(p, q, s);
            mesh.setMatrixAt(i, m);
        });
        mesh.name = 'weather_puddles';
        mesh.receiveShadow = true;
        mesh.userData.noBatch = true;
        mesh.visible = false;
        mesh.renderOrder = 1;
        this.puddles = mesh;
        this.wet = this.rain;   // genangan mengering lebih lambat dari hujan reda
        this.scene.add(mesh);
    }

    updatePuddles(dt) {
        // Basah naik cepat saat hujan, kering ±60 dtk setelah reda
        const target = this.rain > 0.3 || this.snow > 0.3 ? 1 : 0;
        const rate = target > this.wet ? dt / 10 : dt / 60;
        this.wet += Math.max(-rate, Math.min(rate, target - this.wet));
        const mat = this.puddles.material;
        if (this.snow > this.rain) {
            // Musim salju: instance genangan jadi tumpukan salju putih doff
            mat.opacity = this.wet * 0.92;
            mat.color.copy(this._cSnow);
            mat.shininess = 8;
            mat.specular.setScalar(0.08);
            mat.emissive.setScalar(0.22 * (this.lighting.isNight() ? 0.3 : 1));
        } else {
            mat.opacity = this.wet * 0.72;
            // Kilau memantulkan langit: warna genangan = horizon digelapkan
            const hor = this.lighting.sky.material.uniforms.horizonColor.value;
            mat.color.copy(hor).multiplyScalar(0.25);
            // Pantulan langit mendung: emissive = horizon, terbaca sebagai air mengilap di aspal gelap
            mat.emissive.copy(hor).lerp(this.lighting.sky.material.uniforms.topColor.value, 0.3).multiplyScalar(0.55);
            mat.shininess = 140;
            mat.specular.setScalar(1);
        }
        this.puddles.visible = this.wet > 0.02;
    }

    // ----------------------------------------------------------------- salju
    buildSnow() {
        const N = 2200;
        const r = mulberry32(2112);
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N * 3; i++) pos[i] = r();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uCenter: { value: new THREE.Vector3() },
                uSize: { value: 120 },
                uHeight: { value: 70 },
                uOpacity: { value: 0 },
                uPx: { value: Math.min(2, window.devicePixelRatio || 1) }
            },
            vertexShader: `
                uniform float uTime, uSize, uHeight, uPx;
                uniform vec3 uCenter;
                varying float vA;
                void main() {
                    vec3 s = position;
                    float speed = 1.6 + fract(s.x * 53.7 + s.z * 17.3) * 1.6;
                    float y = mod(s.y * uHeight - uTime * speed, uHeight);
                    vec3 p;
                    p.x = uCenter.x + (fract(s.x - uCenter.x / uSize) - 0.5) * uSize;
                    p.z = uCenter.z + (fract(s.z - uCenter.z / uSize) - 0.5) * uSize;
                    p.y = uCenter.y + y;
                    float ph = s.x * 40.0 + s.z * 23.0;
                    p.x += sin(uTime * 0.9 + ph) * 0.8;   // serpih melayang
                    p.z += cos(uTime * 0.7 + ph * 1.3) * 0.8;
                    vec4 mv = viewMatrix * vec4(p, 1.0);
                    gl_Position = projectionMatrix * mv;
                    float sz = (0.6 + fract(ph) * 0.8) * uPx * 220.0 / max(1.0, -mv.z);
                    gl_PointSize = clamp(sz, 1.0, 9.0);
                    vA = smoothstep(0.0, 2.0, y) * (1.0 - smoothstep(uHeight * 0.8, uHeight, y));
                }`,
            fragmentShader: `
                uniform float uOpacity;
                varying float vA;
                void main() {
                    float a = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5));
                    gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a * vA * uOpacity);
                }`,
            transparent: true,
            depthWrite: false,
            fog: false
        });
        const pts = new THREE.Points(geo, mat);
        pts.name = 'weather_snow';
        pts.frustumCulled = false;
        pts.userData.noBatch = true;
        pts.renderOrder = 5;
        pts.visible = false;
        this.snowPts = pts;
        this.scene.add(pts);
    }

    updateSnow(focus, distance) {
        const u = this.snowPts.material.uniforms;
        u.uTime.value = this.time % 1000;
        const d = distance || 76;
        u.uSize.value = Math.min(200, Math.max(50, d * 1.2));
        u.uHeight.value = Math.min(110, Math.max(30, d * 0.75));
        if (focus) u.uCenter.value.set(focus.x, 0, focus.z);
        u.uOpacity.value = this.snow * (this.lighting.isNight() ? 0.6 : 0.95);
        this.snowPts.visible = this.snow > 0.02;
    }

    // ---------------------------------------------------------------- bintang
    buildStars() {
        const N = 2400;
        const r = mulberry32(31337);
        const pos = new Float32Array(N * 3);
        const extra = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) {
            // Belahan atas, dipadatkan ke cakrawala
            const y = 0.005 + Math.pow(r(), 2.6) * 0.995;   // lebih rapat dekat cakrawala (bagian langit yang tampak)
            const a = r() * Math.PI * 2;
            const rr = Math.sqrt(1 - y * y);
            pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * rr;
            extra[i * 2] = 1.8 + Math.pow(r(), 3) * 3.2;   // ukuran (sebagian kecil terang)
            extra[i * 2 + 1] = r() * 6.283;               // fase kelip
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aExtra', new THREE.BufferAttribute(extra, 2));
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: Math.min(2, window.devicePixelRatio || 1) } },
            vertexShader: `
                attribute vec2 aExtra;
                uniform float uTime, uScale;
                varying float vA;
                void main() {
                    vec3 p = cameraPosition + position * 450.0;
                    vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
                    gl_Position = vec4(c.xy, c.w * 0.99995, c.w);   // tepat di depan bidang jauh (z = w terpotong untuk titik)
                    gl_PointSize = aExtra.x * uScale;
                    vA = (0.65 + 0.35 * sin(uTime * (1.3 + aExtra.y * 0.4) + aExtra.y * 7.0))
                        * smoothstep(0.0, 0.07, position.y);   // pudar tipis tepat di cakrawala
                }`,
            fragmentShader: `
                uniform float uOpacity;
                varying float vA;
                void main() {
                    vec2 d = gl_PointCoord - 0.5;
                    float a = 1.0 - smoothstep(0.22, 0.5, length(d));
                    gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * 1.4, a * vA * uOpacity);
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        });
        const pts = new THREE.Points(geo, mat);
        pts.name = 'weather_stars';
        pts.frustumCulled = false;
        pts.renderOrder = -9;   // tepat setelah kubah langit (-10)
        pts.userData.noBatch = true;
        pts.visible = false;
        this.stars = pts;
        this.scene.add(pts);
    }

    /** 0 siang .. 1 malam pekat (dari jam tampilan, halus di senja/fajar). */
    nightFactor() {
        const h = this.lighting.currentHourWIB;
        const eve = smooth(18.0, 19.2, h);
        const morn = 1 - smooth(4.6, 5.6, h);
        return h >= 12 ? eve : morn;
    }

    updateStars(night) {
        const u = this.stars.material.uniforms;
        u.uTime.value = this.time % 1000;
        u.uOpacity.value = night * (1 - Math.max(this.rain, this.snow));
        this.stars.visible = u.uOpacity.value > 0.02 && this.skyOnScreen();
    }

    // ------------------------------------------------------------ kabut pagi
    buildMist() {
        const r = mulberry32(555);
        const tex = makeSoftTexture();
        const mat = new THREE.MeshBasicMaterial({
            map: tex, color: lin(0xF4F1EA), transparent: true, opacity: 0,
            depthWrite: false, fog: true
        });
        const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        // Area sawah: timur (X 206..334) dan pita utara/selatan (|Z| > 186)
        const spots = [];
        // Desa Have-Not: kabut pagi tipis juga di dalam kampung (timur sungai), Have tanpa kabut -> timur lebih tebal
        while (spots.length < 12) spots.push({ x: 40 + r() * 160, z: (r() - 0.5) * 320 });
        while (spots.length < 58) {
            const pick = r();
            let x, z;
            if (pick < 0.6) { x = 210 + EAST_DX + r() * 120; z = (r() - 0.5) * 580; }
            else { x = 30 + r() * (180 + EAST_DX); z = (r() < 0.5 ? 1 : -1) * (192 + r() * 100); }
            spots.push({ x, z });
        }
        // Puncak undakan sawah (salinan rumus terraceTop di rural_scenery.js) + 1,4 m
        const top = x => (x < 268 + EAST_DX ? 0.32 : 0.32 + (Math.floor((x - 268 - EAST_DX) / 13) + 1) * 0.85);
        const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
        const m = this._tmpM, q = this._tmpQ, s = this._tmpS, p = this._tmpP;
        const up = new THREE.Vector3(0, 1, 0);
        this.mistSpots = spots.map((sp, i) => {
            const size = 38 + r() * 40;
            const y = top(sp.x + size * 0.5) + 1.4 + r() * 1.6;
            return { x: sp.x, y, z: sp.z, size, rot: r() * Math.PI, ph: r() * 6.28 };
        });
        this.mistSpots.forEach((sp, i) => {
            p.set(sp.x, sp.y, sp.z);
            q.setFromAxisAngle(up, sp.rot);
            s.set(sp.size, 1, sp.size * 0.6);
            m.compose(p, q, s);
            mesh.setMatrixAt(i, m);
        });
        mesh.name = 'weather_mist';
        mesh.frustumCulled = false;
        mesh.userData.noBatch = true;
        mesh.renderOrder = 4;
        mesh.visible = false;
        this.mist = mesh;
        this.scene.add(mesh);
    }

    updateMist(dt) {
        const h = this.lighting.currentHourWIB;
        // Naik 05:00, pekat 05:40–06:40, hilang 07:30
        const f = smooth(5.0, 5.7, h) * (1 - smooth(6.6, 7.5, h));
        const mat = this.mist.material;
        mat.opacity = f * (0.42 + this.rain * 0.2) * (1 - this.snow);
        this.mist.visible = mat.opacity > 0.01;
    }

    // ----------------------------------------------------------- siklus cuaca
    computeRainTarget() {
        if (this.mode === 'cerah' || this.mode === 'salju') return 0;
        if (this.mode === 'hujan') return 1;
        const slot = this.weatherSlot();
        if (this.autoSnow(slot)) return 0;
        if (hash01(slot) >= RAIN_CHANCE) return 0;
        return 0.65 + hash01(slot + 0.5) * 0.35;   // hujan gerimis s/d deras
    }

    weatherSlot() { return Math.floor(Date.now() / 60000 / RAIN_SLOT_MIN); }

    /** Slot salju otomatis (langka, tidak bertumpuk dengan hujan). */
    autoSnow(slot) { return hash01(slot + 0.25) < SNOW_CHANCE; }

    computeSnowTarget() {
        if (this.mode === 'salju') return 1;
        if (this.mode !== 'auto') return 0;
        return this.autoSnow(this.weatherSlot()) ? 1 : 0;
    }

    setMode(mode) {
        if (!MODES.includes(mode) || this.forced) return;   // cuaca dikunci Pemkot
        this.mode = mode;
        try { localStorage.setItem(LS_KEY, mode); } catch (e) { /* abaikan */ }
        this.rainTarget = this.computeRainTarget();
        this.snowTarget = this.computeSnowTarget();
        this.updateButton();
    }

    /** Kendali Pemkot: paksa cuaca untuk semua warga. null/'bebas' = kembali ke pilihan pemain. */
    force(mode) {
        if (MODES.includes(mode)) {
            if (this.forced === mode) return;
            this.forced = mode;
            this.mode = mode;
        } else {
            if (!this.forced) return;
            this.forced = null;
            let m = 'auto';
            try { m = localStorage.getItem(LS_KEY) || 'auto'; } catch (e) { /* abaikan */ }
            this.mode = MODES.includes(m) ? m : 'auto';
        }
        this.rainTarget = this.computeRainTarget();
        this.snowTarget = this.computeSnowTarget();
        this.updateButton();
    }

    cycleMode() {
        this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]);
        return this.mode;
    }

    isRaining() { return this.rain > 0.3; }

    /** Callback dipanggil saat status hujan berubah (true/false). */
    onRainChange(cb) { if (typeof cb === 'function') this.listeners.add(cb); }

    /** Tombol cuaca di deret kontrol kamera HUD (dibuat dari sini; file UI tidak disentuh). */
    mountButton(bar) {
        if (!bar || this.button) return;
        const btn = document.createElement('button');
        btn.className = 'hud-btn hud-weather-btn';
        btn.type = 'button';
        btn.addEventListener('click', () => this.cycleMode());
        this.button = btn;
        this.updateButton();
        bar.appendChild(btn);
    }

    updateButton() {
        if (!this.button) return;
        const label = MODE_LABEL[this.mode] + (this.forced ? ' (diatur Pemkot)' : '');
        this.button.textContent = MODE_ICON[this.mode];
        this.button.title = label;
        this.button.setAttribute('aria-label', label);
        this.button.classList.toggle('ctl-locked', !!this.forced);
    }

    /** Dipanggil tiap frame dari animate() setelah lighting.update(). */
    /** true bila tepi atas layar memandang ke atas cakrawala (langit tampak). */
    skyOnScreen() {
        if (!this.cam) return true;
        const v = this._tmpP.set(0, 1, 0.5).unproject(this.cam).sub(this.cam.position);
        return v.y > -0.02 * v.length();
    }

    update(dt, focus, distance) {
        this.time += dt;
        this._slotTimer = (this._slotTimer || 0) + dt;
        if (this._slotTimer >= 5) {
            this._slotTimer = 0;
            this.rainTarget = this.computeRainTarget();
            this.snowTarget = this.computeSnowTarget();
        }
        const step = FADE_PER_SEC * dt;
        const wasRaining = this.isRaining();
        this.rain += Math.max(-step, Math.min(step, this.rainTarget - this.rain));
        if (this.isRaining() !== wasRaining) {
            for (const cb of this.listeners) { try { cb(this.isRaining()); } catch (e) { console.error(e); } }
        }

        this.snow += Math.max(-step, Math.min(step, this.snowTarget - this.snow));

        // Mendung: langit & cahaya meredup (hanya kirim bila berubah)
        const overcast = Math.round(Math.max(this.rain, this.snow * 0.6) * 200) / 200;
        const snowSky = Math.round(this.snow * 200) / 200;
        if ((overcast !== this._overcastSent || snowSky !== this._snowSent) && this.lighting.setOvercast) {
            this._overcastSent = overcast;
            this._snowSent = snowSky;
            this.lighting.setOvercast(overcast, snowSky);
        }

        this.updateClouds(dt, focus);
        this.updateRain(focus, distance);
        this.updateSnow(focus, distance);
        this.updatePuddles(dt);
        this.updateStars(this.nightFactor());
        this.updateMist(dt);
    }
}
