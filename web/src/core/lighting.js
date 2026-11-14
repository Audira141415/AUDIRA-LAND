/**
 * AUDIRA-LAND: Sistem Pencahayaan Siang-Malam Berbasis Waktu Nyata WIB (UTC+7)
 *
 * - Interpolasi KONTINU antar keyframe jam (tidak lagi lompat 4 fase): warna langit,
 *   kabut, hemisphere, intensitas & warna matahari bergeser halus sepanjang hari.
 * - Matahari bergerak di busur nyata timur -> barat (terbit ±06:00, terbenam ±18:00).
 * - Preset (Fajar/Siang/Senja/Malam) ditransisikan halus ±1,5 dtk, bukan dipotong.
 * - Kubah langit gradien + halo matahari (1 draw call) menggantikan latar warna datar.
 * - Shadow frustum mengikuti fokus kamera & menyesuaikan zoom: bayangan tajam di dekat,
 *   tetap menutup kota saat zoom jauh. Posisi di-snap ke texel agar bayangan tidak berkedip.
 */

import { PALETTE } from './constants.js';
import { VILLAGE_IDENTITY } from './village_identity.js';

// Keyframe per jam WIB. Warna hex, intensitas linear.
const KEYS = [
    { h: 0.0,  sky: 0x0B1222, hor: 0x1A2438, hemi: 0x2F4066, ground: 0x0D121C, hemiI: 0.42, sun: 0x7F97C2, sunI: 0.30 },
    { h: 4.8,  sky: 0x101A30, hor: 0x2A3350, hemi: 0x384B6E, ground: 0x101520, hemiI: 0.45, sun: 0x8197BD, sunI: 0.30 },
    { h: 5.6,  sky: 0x5E7FB0, hor: 0xF6B48F, hemi: 0xFFD9C4, ground: 0x3E3A30, hemiI: 0.62, sun: 0xFF9A66, sunI: 0.75 },
    { h: 6.6,  sky: 0x8DB9E8, hor: 0xFCE3CC, hemi: 0xFFEBDD, ground: 0x4D6B3A, hemiI: 0.55, sun: 0xFFC48F, sunI: 1.45 },
    { h: 9.0,  sky: 0x6FAEE8, hor: 0xDCEDFA, hemi: 0xFFF8EE, ground: PALETTE.GROUND_BASE, hemiI: 0.58, sun: 0xFFF4E0, sunI: 1.75 },
    { h: 15.0, sky: 0x6FAEE8, hor: 0xDCEDFA, hemi: 0xFFF8EE, ground: PALETTE.GROUND_BASE, hemiI: 0.58, sun: 0xFFF1DC, sunI: 1.75 },
    { h: 17.0, sky: 0x7BA6D6, hor: 0xF7C99A, hemi: 0xFFE2C8, ground: 0x4A5A34, hemiI: 0.52, sun: 0xFFAE66, sunI: 1.45 },
    { h: 18.1, sky: 0x4A5F8F, hor: 0xF08A5A, hemi: 0xF0B89A, ground: 0x3B2C24, hemiI: 0.58, sun: 0xFF7F45, sunI: 0.70 },
    { h: 19.0, sky: 0x18233D, hor: 0x3A3550, hemi: 0x41507A, ground: 0x121722, hemiI: 0.46, sun: 0x8197BD, sunI: 0.32 },
    { h: 24.0, sky: 0x0B1222, hor: 0x1A2438, hemi: 0x2F4066, ground: 0x0D121C, hemiI: 0.42, sun: 0x7F97C2, sunI: 0.30 }
];

const PRESET_HOURS = { fajar: 5.9, siang: 12.0, senja: 17.6, malam: 21.0 };

// Mode 'siklus': jam game berjalan sendiri, 1 hari game = CYCLE_MINUTES menit nyata.
// Malam game sengaja dipercepat 2x (19:30–04:30) agar siang tetap dominan.
export const CYCLE_MINUTES = 24;
const CYCLE_KEY = 'audira_time_mode';

const _ca = new THREE.Color();
const _cb = new THREE.Color();

function lerpHex(out, a, b, t) {
    _ca.setHex(a);
    _cb.setHex(b);
    return out.copy(_ca).lerp(_cb, t);
}

function fmtHour(h) {
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} WIB`;
}

const isCoarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

export class CityLighting {
    constructor(scene) {
        this.scene = scene;

        // Default: siklus siang-malam otomatis (dipercepat). Pilihan terakhir pemain diingat.
        this.mode = 'siklus';
        try {
            const m = localStorage.getItem(CYCLE_KEY);
            if (m === 'siklus' || m === 'auto' || PRESET_HOURS[m] !== undefined) this.mode = m;
        } catch (e) { /* storage diblokir */ }
        this.cycleHour = this.getRealTimeWIB().hoursDecimal;  // siklus mulai dari jam nyata
        this._cycleApplied = -1;
        this.currentPhaseName = 'Siang';
        this.currentHourWIB = 12.0;
        this.displayHour = null;   // jam yang sedang ditampilkan (bisa sedang transisi)
        this.targetHour = 12.0;
        this.timeDisplayString = '12:00 WIB';
        this._lastNight = null;
        this.overcast = 0;          // 0 cerah .. 1 hujan pekat (diatur weather.js)
        this.snowSky = 0;           // 0..1 musim salju: langit & pantulan tanah memutih
        this._grey = new THREE.Color();

        // 1. Cahaya Hemisphere (Langit Tropis & Pantulan Rumput Segar)
        this.hemiLight = new THREE.HemisphereLight(0xFFF8EE, PALETTE.GROUND_BASE, 0.85);
        this.hemiLight.position.set(0, 80, 0);
        this.scene.add(this.hemiLight);

        // 2. Matahari/Bulan direksional dengan bayangan yang mengikuti kamera
        this.sunLight = new THREE.DirectionalLight(0xFFFAF0, 1.35);
        this.sunLight.castShadow = true;
        const size = isCoarse ? 1024 : 2048;
        this.sunLight.shadow.mapSize.set(size, size);
        this.sunLight.shadow.camera.near = 1;
        this.sunLight.shadow.camera.far = 600;
        this.sunLight.shadow.bias = -0.0005;
        this.sunLight.shadow.normalBias = 0.04;
        this.shadowHalf = 0;
        this.setShadowExtent(60);
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);
        this.sunDir = new THREE.Vector3(0.4, 0.8, 0.4).normalize();
        this.focus = new THREE.Vector3();

        // 3. Kabut atmosferik (warna = horizon langit agar menyatu mulus)
        this.fog = new THREE.Fog(PALETTE.FOG_DAY, 320, 1000);
        this.scene.fog = this.fog;
        this.scene.background = new THREE.Color(PALETTE.SKY_DAY);

        // 4. Kubah langit gradien + halo matahari
        this.sky = this.createSkyDome();
        this.scene.add(this.sky);

        this.timeListeners = new Set();
        this.updateTime();
        this.displayHour = this.targetHour;
        this.applyLightingForHour(this.displayHour);
    }

    createSkyDome() {
        const geo = new THREE.SphereGeometry(500, 32, 16);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x6FAEE8) },
                horizonColor: { value: new THREE.Color(0xDCEDFA) },
                sunColor: { value: new THREE.Color(0xFFF3E0) },
                sunDir: { value: new THREE.Vector3(0, 1, 0) },
                sunStrength: { value: 1.0 },
                moonDir: { value: new THREE.Vector3(0, 1, 0) },
                moonStrength: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vDir = normalize(position);
                    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    gl_Position = p.xyww; // selalu di bidang jauh
                }`,
            fragmentShader: `
                uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor;
                uniform vec3 sunDir; uniform float sunStrength;
                uniform vec3 moonDir; uniform float moonStrength;
                varying vec3 vDir;
                void main() {
                    vec3 dir = normalize(vDir);
                    float h = clamp(dir.y, 0.0, 1.0);
                    vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
                    float d = max(dot(dir, normalize(sunDir)), 0.0);
                    col += sunColor * (pow(d, 900.0) * 1.6 + pow(d, 24.0) * 0.28) * sunStrength;
                    // Bulan (weather.js): piringan ±1,7 derajat + halo lembut, 0 draw call tambahan
                    if (moonStrength > 0.001) {
                        float md = dot(dir, normalize(moonDir));
                        float disc = smoothstep(0.99950, 0.99962, md);
                        float limb = 0.82 + 0.18 * smoothstep(0.99950, 0.99985, md);
                        col = mix(col, vec3(0.93, 0.92, 0.86) * limb, disc * moonStrength);
                        col += vec3(0.55, 0.62, 0.78) * (pow(max(md, 0.0), 260.0) * 0.22 + pow(max(md, 0.0), 18.0) * 0.05) * moonStrength;
                    }
                    gl_FragColor = vec4(col, 1.0);
                }`,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'sky_dome';
        mesh.renderOrder = -10;
        mesh.frustumCulled = false;
        mesh.userData.noBatch = true;
        mesh.onBeforeRender = (renderer, scene, camera) => {
            mesh.position.copy(camera.position);
            mesh.updateMatrixWorld();
        };
        return mesh;
    }

    setShadowExtent(half) {
        if (Math.abs(half - this.shadowHalf) < 4) return;
        this.shadowHalf = half;
        const cam = this.sunLight.shadow.camera;
        cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
        cam.updateProjectionMatrix();
    }

    getRealTimeWIB() {
        const now = new Date();
        const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
        const wibDate = new Date(utcMs + (3600000 * 7));
        return {
            date: wibDate,
            hoursDecimal: wibDate.getHours() + wibDate.getMinutes() / 60 + wibDate.getSeconds() / 3600
        };
    }

    /** Dipanggil tiap 1 dtk (mode auto) atau saat preset berubah: menentukan jam tujuan. */
    updateTime() {
        this.targetHour = this.mode === 'auto'
            ? this.getRealTimeWIB().hoursDecimal
            : this.mode === 'siklus'
                ? this.cycleHour
                : (PRESET_HOURS[this.mode] ?? 12.0);
    }

    /** Jam game per detik nyata; malam (19:30–04:30) 2x lebih cepat. */
    cycleRate(h) {
        const base = 24 / (CYCLE_MINUTES * 60);
        return (h >= 19.5 || h < 4.5) ? base * 2 : base;
    }

    /**
     * Dipanggil tiap frame. Menggeser jam tampilan ke jam tujuan (jalur terpendek
     * melingkar 24 jam), lalu memindahkan shadow frustum ke fokus kamera.
     */
    update(dt, focus, viewDistance) {
        if (this.displayHour === null) this.displayHour = this.targetHour;
        if (this.mode === 'siklus') {
            this.cycleHour = (this.cycleHour + this.cycleRate(this.cycleHour) * Math.min(dt, 0.25)) % 24;
            this.targetHour = this.cycleHour;
            // Sudah sampai di jam siklus: ikuti langsung, terapkan tiap ±0,6 dtk nyata (hemat CPU)
            const d = Math.abs(this.targetHour - this.displayHour);
            if (Math.min(d, 24 - d) < 0.05) {
                if (Math.abs(this.cycleHour - this._cycleApplied) > 0.01) {
                    this._cycleApplied = this.cycleHour;
                    this.displayHour = this.cycleHour;
                    this.applyLightingForHour(this.displayHour);
                }
                this.targetHour = this.displayHour;
            }
        }
        let diff = this.targetHour - this.displayHour;
        if (diff > 12) diff -= 24;
        if (diff < -12) diff += 24;
        if (Math.abs(diff) > 0.0005) {
            // Transisi besar (preset) ±1,5 dtk; pergeseran kecil (jam nyata) langsung halus
            const k = 1 - Math.exp(-dt * 3.0);
            this.displayHour = (this.displayHour + diff * k + 24) % 24;
            this.applyLightingForHour(this.displayHour);
        }

        // Campuran nada desa mengikuti fokus kamera (0 = Have, 1 = Have-Not), transisi ±1,5 dtk
        if (focus && this._hemiBase) {
            const e = Math.min(1, Math.max(0, (focus.x + 16) / 32));
            const goal = e * e * (3 - 2 * e);
            const mix = (this.villageMix ?? goal) + (goal - (this.villageMix ?? goal)) * (1 - Math.exp(-dt * 2.0));
            if (Math.abs(mix - (this.villageMix ?? -1)) > 0.002) { this.villageMix = mix; this.applyVillageTint(); }
        }

        if (focus) {
            const half = Math.min(190, Math.max(36, (viewDistance || 60) * 1.05));
            this.setShadowExtent(Math.round(half / 4) * 4);
            // Snap ke ukuran texel agar tepi bayangan tidak "merayap" saat kamera bergeser
            const texel = (this.shadowHalf * 2) / this.sunLight.shadow.mapSize.x;
            this.focus.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
            this.sunLight.target.position.copy(this.focus);
            this.sunLight.position.copy(this.focus).addScaledVector(this.sunDir, 260);
            this.sunLight.target.updateMatrixWorld();
        }
    }

    applyLightingForHour(hour) {
        let i = 0;
        while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
        const a = KEYS[i];
        const b = KEYS[i + 1];
        const t = Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h)));
        const s = t * t * (3 - 2 * t); // smoothstep

        const skyU = this.sky.material.uniforms;
        lerpHex(skyU.topColor.value, a.sky, b.sky, s);
        lerpHex(skyU.horizonColor.value, a.hor, b.hor, s);
        this.fog.color.copy(skyU.horizonColor.value);
        this.scene.background.copy(skyU.horizonColor.value);

        lerpHex(this.hemiLight.color, a.hemi, b.hemi, s);
        lerpHex(this.hemiLight.groundColor, a.ground, b.ground, s);
        this.hemiLight.intensity = a.hemiI + (b.hemiI - a.hemiI) * s;
        lerpHex(this.sunLight.color, a.sun, b.sun, s);
        this.sunLight.intensity = a.sunI + (b.sunI - a.sunI) * s;

        // Busur matahari 06:00 (timur) -> 12:00 (zenit miring utara, khas tropis) -> 18:00 (barat)
        const isDay = hour >= 5.8 && hour < 18.3;
        if (isDay) {
            const p = (hour - 6.0) / 12.0;            // 0..1 sepanjang siang
            const ang = Math.PI * Math.min(1, Math.max(0, p));
            // 18° saat terbit/terbenam (bayangan panjang, tanah tetap terang) s/d 60° tengah hari
            const elev = (18 + 42 * Math.sin(ang)) * Math.PI / 180;
            // timur(+X) -> barat(-X), condong ke -Z: dari sudut kamera default bayangan
            // jatuh ke samping-depan sehingga terbaca jelas (bukan tersembunyi di balik gedung)
            this.sunDir.set(Math.cos(ang) * Math.cos(elev) + 0.25, Math.sin(elev), -0.4).normalize();
            skyU.sunStrength.value = 1.0;
        } else {
            // Bulan: arah tetap, cahaya biru lembut
            this.sunDir.set(-0.45, 0.78, 0.38).normalize();
            skyU.sunStrength.value = 0.25;
        }
        skyU.sunDir.value.copy(this.sunDir);
        skyU.sunColor.value.copy(this.sunLight.color);

        // Bulan: busur timur -> barat sepanjang malam, elevasi rendah 2,6–4° (tepi atas layar di elevasi kamera minimum ±5°; kamera game hanya melihat langit dekat cakrawala)
        const ss = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
        const nightAmt = hour >= 12 ? ss(18.2, 19.3, hour) : 1 - ss(4.8, 5.8, hour);
        const np = Math.min(1, Math.max(0, (((hour - 18.5) + 24) % 24) / 11.5));
        const mAng = Math.PI * np;
        const mElev = (2.6 + 1.4 * Math.sin(mAng)) * Math.PI / 180;
        const mh = Math.hypot(Math.cos(mAng), 0.55);   // arah datar timur->barat, condong ke +Z
        skyU.moonDir.value.set(Math.cos(mAng) / mh * Math.cos(mElev), Math.sin(mElev), 0.55 / mh * Math.cos(mElev));

        // Mendung/hujan: langit & kabut ke abu-abu, matahari meredup, jarak pandang memendek
        const oc = this.overcast;
        skyU.moonStrength.value = nightAmt * (1 - oc);
        if (oc > 0) {
            for (const c of [skyU.topColor.value, skyU.horizonColor.value]) {
                const l = (c.r * 0.3 + c.g * 0.59 + c.b * 0.11) * 0.82;
                this._grey.setRGB(l, l * 1.02, l * 1.07);
                c.lerp(this._grey, oc * 0.78);
            }
            this.fog.color.copy(skyU.horizonColor.value);
            this.scene.background.copy(skyU.horizonColor.value);
            this.sunLight.intensity *= 1 - 0.72 * oc;
            this.hemiLight.intensity *= 1 - 0.18 * oc;
            skyU.sunStrength.value *= 1 - oc;
        }
        const sn = this.snowSky;
        if (sn > 0) {
            // Salju: langit putih kelabu, pantulan tanah terang (hamparan salju)
            const day = 1 - nightAmt * 0.8;
            this._grey.setRGB(0.70 * day, 0.74 * day, 0.80 * day);
            skyU.horizonColor.value.lerp(this._grey, sn * 0.6);
            this._grey.setRGB(0.55 * day, 0.60 * day, 0.68 * day);
            skyU.topColor.value.lerp(this._grey, sn * 0.5);
            this.fog.color.copy(skyU.horizonColor.value);
            this.scene.background.copy(skyU.horizonColor.value);
            this._grey.setRGB(0.85 * day, 0.88 * day, 0.92 * day);
            this.hemiLight.groundColor.lerp(this._grey, sn * 0.7);
            this.hemiLight.intensity *= 1 + 0.25 * sn;
        }
        this.fog.near = 320 - 210 * oc;
        this.fog.far = 1000 - 420 * oc;

        // Nada desa (village_identity.js): simpan warna dasar jam ini, lalu beri tint desa fokus kamera
        this._hemiBase = (this._hemiBase || new THREE.Color()).copy(this.hemiLight.color);
        this._sunBase = (this._sunBase || new THREE.Color()).copy(this.sunLight.color);
        this._hemiIBase = this.hemiLight.intensity;
        this.applyVillageTint();

        this.currentHourWIB = hour;
        this.currentPhaseName = hour >= 5.0 && hour < 6.5 ? 'Fajar'
            : hour >= 6.5 && hour < 16.5 ? 'Siang'
            : hour >= 16.5 && hour < 18.5 ? 'Senja' : 'Malam';
        this.timeDisplayString = this.mode === 'auto'
            ? fmtHour(this.getRealTimeWIB().hoursDecimal)
            : this.mode === 'siklus'
                ? fmtHour(this.cycleHour).replace('WIB', '· Siklus')
                : fmtHour(this.targetHour);

        const night = this.isNight();
        if (night !== this._lastNight) {
            this._lastNight = night;
            this.notifyTimeChange(this.timeDisplayString);
        }
    }

    /** Dipanggil weather.js saat intensitas mendung (0..1) / salju (0..1) berubah. */
    /**
     * Desa Have: sedikit lebih dingin & terang (lampu kota). Desa Have-Not: lebih hangat.
     * Diterapkan di atas warna jam ini (_hemiBase/_sunBase dari applyLightingForHour).
     */
    applyVillageTint() {
        if (!this._hemiBase) return;
        const k = this.villageMix ?? 0;
        const tint = (this._tint || (this._tint = new THREE.Color()))
            .setHex(VILLAGE_IDENTITY.have.palette.hemiTint)
            .lerp(this._tmpTint || (this._tmpTint = new THREE.Color(VILLAGE_IDENTITY.have_not.palette.hemiTint)), k);
        this.hemiLight.color.copy(this._hemiBase).multiply(tint);
        const half = (this._halfTint || (this._halfTint = new THREE.Color())).setRGB(1, 1, 1).lerp(tint, 0.5);
        this.sunLight.color.copy(this._sunBase).multiply(half);
        this.hemiLight.intensity = this._hemiIBase * (1 + 0.06 * (1 - k));
    }

    setOvercast(v, snow = 0) {
        this.overcast = Math.min(1, Math.max(0, v));
        this.snowSky = Math.min(1, Math.max(0, snow));
        this.applyLightingForHour(this.displayHour ?? this.targetHour);
    }

    isNight() {
        // Lampu menyala mulai senja akhir hingga fajar awal
        const h = this.currentHourWIB;
        return h >= 17.8 || h < 5.9;
    }

    onTimeChange(cb) {
        if (typeof cb === 'function') {
            this.timeListeners.add(cb);
            cb({
                phase: this.currentPhaseName,
                isNight: this.isNight(),
                hour: this.currentHourWIB
            });
        }
    }

    notifyTimeChange(timeStr) {
        if (!this.timeListeners) return;
        const info = {
            phase: this.currentPhaseName,
            isNight: this.isNight(),
            hour: this.currentHourWIB,
            timeStr
        };
        for (const cb of this.timeListeners) {
            try { cb(info); } catch (e) { console.error(e); }
        }
    }

    setPreset(preset) {
        if (this.forced) { this.syncTimeButtons(); return; }   // waktu dikunci Pemkot
        this.mode = preset;
        try { localStorage.setItem(CYCLE_KEY, preset); } catch (e) { /* abaikan */ }
        this.updateTime();
        this.syncTimeButtons();
    }

    /**
     * Kendali Pemkot (Panel Pengelola): paksa mode waktu untuk semua warga.
     * null = lepas kunci, kembali ke pilihan pemain yang tersimpan.
     */
    force(mode) {
        const ok = mode === 'siklus' || mode === 'auto' || PRESET_HOURS[mode] !== undefined;
        if (ok) {
            if (this.forced === mode) return;
            this.forced = mode;
            this.mode = mode;
        } else {
            if (!this.forced) return;
            this.forced = null;
            let m = 'siklus';
            try { m = localStorage.getItem(CYCLE_KEY) || 'siklus'; } catch (e) { /* abaikan */ }
            this.mode = (m === 'siklus' || m === 'auto' || PRESET_HOURS[m] !== undefined) ? m : 'siklus';
        }
        this.updateTime();
        this.syncTimeButtons();
        if (this._timeBar) this._timeBar.classList.toggle('ctl-locked', !!this.forced);
    }

    /**
     * Menambah tombol "🔁 Siklus" ke bar waktu HUD (hud.js milik sesi lain, jadi
     * disisipkan dari sini) dan menyamakan tombol aktif dengan mode tersimpan.
     */
    mountCycleButton(bar) {
        if (!bar || bar.querySelector('[data-time="siklus"]')) return;
        const btn = document.createElement('button');
        btn.className = 'btn-time';
        btn.dataset.time = 'siklus';
        btn.textContent = '🔁 Siklus';
        btn.title = `Siang-malam otomatis (1 hari = ${CYCLE_MINUTES} menit)`;
        bar.insertBefore(btn, bar.firstChild);
        btn.addEventListener('click', () => this.setPreset('siklus'));
        // Tombol lain dipasang hud.js; kita hanya ikut menyamakan status aktif
        bar.addEventListener('click', () => setTimeout(() => this.syncTimeButtons(), 0));
        this._timeBar = bar;
        this.syncTimeButtons();
    }

    syncTimeButtons() {
        if (!this._timeBar) return;
        for (const b of this._timeBar.querySelectorAll('.btn-time')) {
            b.classList.toggle('active', b.dataset.time === this.mode);
        }
    }
}
