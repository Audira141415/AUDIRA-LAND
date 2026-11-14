/**
 * AUDIRA-LAND: Kontroler Kamera 360° Orbit, Pan, Zoom, dan Gesture Sentuh
 * Mendukung rotasi horizontal bebas 360°, elevasi vertikal 15°-85°,
 * zoom dekat (4m) s/d jauh (220m), navigasi keyboard WASD/Panah, dan gesture sentuh mobile.
 */

import { GRID_CONFIG } from './constants.js';

export class CityCamera {
    constructor(canvas, aspect) {
        this.canvas = canvas;
        this.aspect = aspect;

        // 1. Parameter Orbit 360° (Vantage Awal: Melihat Sungai Tengah Membelah Desa Have & Have-Not)
        this.azimuthAngle = 52 * (Math.PI / 180);   // Sudut putar horizontal
        this.elevationAngle = 36 * (Math.PI / 180); // Sudut kemiringan vertikal
        this.distance = 76.0;                       // Jarak pandang awal (tampak sungai 32m & kedua tepi)

        // Batas Zoom: 4 meter (dekat/inspeksi jalanan) s/d 220 meter (seluruh 25 distrik)
        this.minDistance = 4.0;
        this.maxDistance = 450.0;

        // Batas Elevasi Vertikal: 15° (perspektif jalanan) s/d 85° (tampak atas satelit)
        this.minElevation = 15 * (Math.PI / 180);
        this.maxElevation = 85 * (Math.PI / 180);

        this.maxPan = 360.0; // sampai ke sawah di luar kota (Have-Not diperluas ke X 264, sawah s.d. ±398)

        // Titik Fokus Target (Pusat Kota k12 di 0,0,0)
        this.target = new THREE.Vector3(0, 0, 0);
        this.targetDesired = new THREE.Vector3(0, 0, 0);
        this.azimuthDesired = this.azimuthAngle;
        this.elevationDesired = this.elevationAngle;
        this.distanceDesired = this.distance;

        // Mode Drag Klik Kiri: 'pan' (geser) atau 'orbit' (putar 360°)
        this.primaryMode = 'pan';

        // Kamera Perspektif FOV 40° dengan frustum culling optimal
        this.camera = new THREE.PerspectiveCamera(40, aspect, 1.0, 1200.0); // gunung di cakrawala
        this.updateCameraPosition();

        // State Interaksi Pointer & Touch
        this.isPointerDown = false;
        this.pointerButton = 0; // 0: Left, 1: Middle, 2: Right
        this.prevPointer = { x: 0, y: 0 };
        this.dragDistanceTraveled = 0;

        // Gesture Touch Multi-jari
        this.touchStartDist = 0;
        this.touchStartAngle = 0;
        this.touchPrevMid = { x: 0, y: 0 };

        // State Keyboard
        this.keysDown = {};

        // Multi-touch guard & inersia geser (momentum setelah jari dilepas)
        this.activePointers = new Set();
        this.panVelocity = new THREE.Vector2();
        this.lastPanEventTime = 0;

        this.setupEvents();
    }

    /**
     * Menghitung posisi kamera berdasarkan koordinat sferis (azimuth, elevation, distance)
     */
    updateCameraPosition() {
        const cosEl = Math.cos(this.elevationAngle);
        const sinEl = Math.sin(this.elevationAngle);
        const sinAz = Math.sin(this.azimuthAngle);
        const cosAz = Math.cos(this.azimuthAngle);

        const offsetX = this.distance * cosEl * sinAz;
        const offsetY = Math.max(1.0, this.distance * sinEl);
        const offsetZ = this.distance * cosEl * cosAz;

        this.camera.position.set(
            this.target.x + offsetX,
            this.target.y + offsetY,
            this.target.z + offsetZ
        );
        this.camera.lookAt(this.target);
    }

    /**
     * Loop pembaruan tiap frame dengan redaman lerp halus
     */
    update(dt = 0.016) {
        dt = Math.min(Math.max(dt, 0), 0.1);
        // Redaman eksponensial: terasa sama di 30, 60, maupun 120 Hz
        const lerpFactor = 1 - Math.exp(-dt * 11.0);

        // Navigasi Keyboard
        this.handleKeyboard(dt);

        // Inersia geser setelah drag dilepas
        if (!this.isPointerDown && this.panVelocity.lengthSq() > 0.0004) {
            this.targetDesired.x += this.panVelocity.x * dt;
            this.targetDesired.z += this.panVelocity.y * dt;
            this.clampTarget();
            this.panVelocity.multiplyScalar(Math.exp(-dt * 4.5));
        }

        // Lerp Posisi & Rotasi
        this.target.lerp(this.targetDesired, lerpFactor);
        this.azimuthAngle += (this.azimuthDesired - this.azimuthAngle) * lerpFactor;
        this.elevationAngle += (this.elevationDesired - this.elevationAngle) * lerpFactor;
        this.distance += (this.distanceDesired - this.distance) * lerpFactor;

        this.updateCameraPosition();
    }

    /**
     * Setup Event Mouse, Touch, dan Keyboard
     */
    setupEvents() {
        const el = this.canvas;

        // 1. Pointer Down
        el.addEventListener('pointerdown', (e) => {
            if (e.target !== el) return;
            this.activePointers.add(e.pointerId);
            this.panVelocity.set(0, 0);
            if (this.activePointers.size > 1) return; // gesture 2 jari ditangani touch handler
            this.isPointerDown = true;
            this.pointerButton = e.button;
            this.prevPointer = { x: e.clientX, y: e.clientY };
            this.dragDistanceTraveled = 0;
            el.setPointerCapture(e.pointerId);
        });

        // 2. Pointer Move
        el.addEventListener('pointermove', (e) => {
            if (!this.isPointerDown) return;
            if (this.activePointers.size > 1) {
                this.prevPointer = { x: e.clientX, y: e.clientY };
                return;
            }

            const dx = e.clientX - this.prevPointer.x;
            const dy = e.clientY - this.prevPointer.y;
            this.prevPointer = { x: e.clientX, y: e.clientY };
            this.dragDistanceTraveled += Math.hypot(dx, dy);

            // Left Click Drag
            if (this.pointerButton === 0) {
                // Jika Shift ditekan atau mode pan aktif -> otomatis Pan
                if (e.shiftKey || this.primaryMode === 'pan') {
                    this.pan(dx, dy);
                } else {
                    // Default saat mode orbit: Orbit 360° Horizontal & Vertikal
                    this.orbit(dx, dy);
                }
            }
            // Right Click / Middle Click Drag
            else if (this.pointerButton === 2 || this.pointerButton === 1) {
                // Jika mode pan aktif, klik kanan berfungsi sebagai orbit 360°
                if (this.primaryMode === 'pan') {
                    this.orbit(dx, dy);
                } else {
                    this.pan(dx, dy);
                }
            }
        });

        const endPointer = (e) => {
            this.activePointers.delete(e.pointerId);
            // Momentum hanya jika jari masih bergerak saat dilepas
            if (performance.now() - this.lastPanEventTime > 90) this.panVelocity.set(0, 0);
            this.isPointerDown = false;
            if (el.hasPointerCapture(e.pointerId)) {
                el.releasePointerCapture(e.pointerId);
            }
        };
        el.addEventListener('pointerup', endPointer);
        el.addEventListener('pointercancel', endPointer);

        // Mencegah menu konteks klik kanan agar pan klik kanan nyaman
        el.addEventListener('contextmenu', (e) => e.preventDefault());

        // 3. Mouse Wheel Zoom (Proporsional Halus)
        el.addEventListener('wheel', (e) => {
            e.preventDefault();
            // Proporsional terhadap besar scroll: trackpad halus, mouse wheel tetap responsif
            const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
            this.zoomRatio(Math.exp(Math.max(-250, Math.min(250, px)) * 0.0011));
        }, { passive: false });

        // 4. Touch Gestures Mobile (1 jari orbit/pan, 2 jari pinch zoom & pan)
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                this.touchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                this.touchStartAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
                this.touchPrevMid = {
                    x: (t1.clientX + t2.clientX) / 2,
                    y: (t1.clientY + t2.clientY) / 2
                };
            }
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;

                // A. Pinch Zoom
                if (this.touchStartDist > 0 && dist > 0) {
                    // Rasio jarak jari -> zoom yang mengikuti jari secara presisi
                    this.zoomRatio(this.touchStartDist / dist);
                    this.touchStartDist = dist;
                }

                // B. 2-Finger Twist Rotate
                const deltaAngle = angle - this.touchStartAngle;
                if (Math.abs(deltaAngle) < 0.4) {
                    this.rotateAzimuth(deltaAngle * 1.2);
                }
                this.touchStartAngle = angle;

                // C. 2-Finger Pan
                const panDx = midX - this.touchPrevMid.x;
                const panDy = midY - this.touchPrevMid.y;
                this.pan(panDx, panDy);
                this.touchPrevMid = { x: midX, y: midY };
            }
        }, { passive: true });

        // 5. Keyboard Navigation (WASD, Panah, Q/E, R/F)
        window.addEventListener('keydown', (e) => {
            // Abaikan input jika user sedang mengetik di input box chat/form
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            this.keysDown[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keysDown[e.code] = false;
        });
    }

    /**
     * Rotasi Orbit Bebas 360° Horizontal + Elevasi Vertikal
     */
    orbit(dx, dy) {
        const sensitivity = 0.006;
        // Azimuth bebas berputar 360 derajat tanpa henti
        this.azimuthDesired += dx * sensitivity;

        // Elevasi dibatasi 15° s/d 85° agar tidak tembus ke bawah tanah
        this.elevationDesired += dy * sensitivity;
        this.elevationDesired = Math.max(this.minElevation, Math.min(this.maxElevation, this.elevationDesired));
    }

    /**
     * Menggeser Titik Fokus Target Kamera (Pan Geser Peta Kiri-Kanan-Atas-Bawah)
     */
    pan(screenDx, screenDy) {
        // Skala pergeseran sebanding dengan jarak zoom saat ini, responsif & luwes
        const factor = Math.max(0.065, (this.distance / 50.0) * 0.095);
        const sin = Math.sin(this.azimuthAngle);
        const cos = Math.cos(this.azimuthAngle);

        // Transformasi vektor layar ke bidang datar dunia 3D
        const worldDx = (-screenDx * cos + screenDy * sin) * factor;
        const worldDz = (screenDx * sin + screenDy * cos) * factor;

        this.targetDesired.x += worldDx;
        this.targetDesired.z += worldDz;

        // Catat kecepatan untuk inersia
        const now = performance.now();
        const edt = Math.max(8, now - this.lastPanEventTime) / 1000;
        if (now - this.lastPanEventTime < 100) {
            const vx = worldDx / edt, vz = worldDz / edt;
            this.panVelocity.x = this.panVelocity.x * 0.6 + vx * 0.4;
            this.panVelocity.y = this.panVelocity.y * 0.6 + vz * 0.4;
            const max = 6 * Math.max(10, this.distance);
            if (this.panVelocity.length() > max) this.panVelocity.setLength(max);
        }
        this.lastPanEventTime = now;

        this.clampTarget();
    }

    /** Zoom multiplikatif (rasio > 1 menjauh, < 1 mendekat). */
    zoomRatio(r) {
        if (!isFinite(r) || r <= 0) return;
        this.distanceDesired = Math.max(this.minDistance, Math.min(this.maxDistance, this.distanceDesired * r));
    }

    /**
     * Zoom In / Zoom Out Halus Proporsional
     */
    zoom(delta) {
        // Kecepatan zoom menyesuaikan jarak (di dekat bangunan halus, di jauh responsif)
        const speed = Math.max(0.8, this.distanceDesired * 0.08);
        const change = (delta > 0 ? 1 : -1) * speed;

        this.distanceDesired += change;
        this.distanceDesired = Math.max(this.minDistance, Math.min(this.maxDistance, this.distanceDesired));
    }

    /**
     * Putar Azimuth dalam radian
     */
    rotateAzimuth(rad) {
        this.azimuthDesired += rad;
    }

    /**
     * Putar Step 45 derajat (Tombol HUD ⟲ / ⟳)
     */
    rotateStep(clockwise = true) {
        const step = Math.PI / 4; // 45 derajat
        this.azimuthDesired += (clockwise ? step : -step);
    }

    /**
     * Navigasi Keyboard W, A, S, D, Q, E, R, F
     */
    handleKeyboard(dt) {
        const panSpeed = Math.max(16.0, this.distance * 0.8) * dt;
        const sin = Math.sin(this.azimuthAngle);
        const cos = Math.cos(this.azimuthAngle);

        let moveForward = 0;
        let moveRight = 0;

        // Mode Jalan (avatar): WASD menggerakkan tokoh, bukan menggeser kamera.
        if (!this.walkActive) {
            if (this.keysDown['KeyW'] || this.keysDown['ArrowUp']) moveForward += 1;
            if (this.keysDown['KeyS'] || this.keysDown['ArrowDown']) moveForward -= 1;
            if (this.keysDown['KeyD'] || this.keysDown['ArrowRight']) moveRight += 1;
            if (this.keysDown['KeyA'] || this.keysDown['ArrowLeft']) moveRight -= 1;
        }

        if (moveForward !== 0 || moveRight !== 0) {
            // Arah maju kamera pada bidang datar
            const fwdX = -sin;
            const fwdZ = -cos;
            const rgtX = cos;
            const rgtZ = -sin;

            this.targetDesired.x += (fwdX * moveForward + rgtX * moveRight) * panSpeed;
            this.targetDesired.z += (fwdZ * moveForward + rgtZ * moveRight) * panSpeed;
            this.clampTarget();
        }

        // Q / E: Rotasi Putar 360° Halus
        const rotSpeed = 2.2 * dt;
        if (this.keysDown['KeyQ']) this.azimuthDesired -= rotSpeed;
        if (this.keysDown['KeyE']) this.azimuthDesired += rotSpeed;

        // R / F: Zoom Dekat / Jauh via Keyboard
        const zoomStep = 40.0 * dt;
        if (this.keysDown['KeyR']) this.zoom(-zoomStep);
        if (this.keysDown['KeyF']) this.zoom(zoomStep);

        // Home / Space: Reset k12
        if (this.keysDown['Space'] || this.keysDown['Home']) {
            this.recenter(0, 0);
        }
    }

    clampTarget() {
        this.targetDesired.x = Math.max(-this.maxPan, Math.min(this.maxPan, this.targetDesired.x));
        this.targetDesired.z = Math.max(-this.maxPan, Math.min(this.maxPan, this.targetDesired.z));
    }

    /**
     * Beralih antara mode drag primer: 'orbit' (putar 360) atau 'pan' (geser)
     */
    togglePrimaryMode() {
        this.primaryMode = (this.primaryMode === 'orbit') ? 'pan' : 'orbit';
        return this.primaryMode;
    }

    /**
     * Preset Sudut Pandang Cepat
     */
    setPresetView(viewType) {
        switch (viewType) {
            case 'isometric':
                // Sudut arsitektural isometrik 41°
                this.elevationDesired = 41 * (Math.PI / 180);
                this.azimuthDesired = 45 * (Math.PI / 180);
                this.distanceDesired = 45.0;
                break;
            case 'topdown':
                // Tampak atas satelit (82°)
                this.elevationDesired = 82 * (Math.PI / 180);
                this.distanceDesired = 65.0;
                break;
            case 'street':
                // Dekat jalanan (18°), bisa melihat bangunan dari depan
                this.elevationDesired = 18 * (Math.PI / 180);
                this.distanceDesired = 14.0;
                break;
            case 'far':
                // Pandangan seluruh kota (25 distrik)
                this.elevationDesired = 45 * (Math.PI / 180);
                this.distanceDesired = 150.0;
                break;
            case 'have':
                // Fokus ke Desa Have (Sisi Barat)
                this.targetDesired.set(-48, 0, 0);
                this.elevationDesired = 38 * (Math.PI / 180);
                this.distanceDesired = 60.0;
                break;
            case 'havenot':
                // Desa Have-Not (Sisi Timur): menghadap ke timur, sawah & gunung di cakrawala
                this.targetDesired.set(240, 0, 10);
                this.azimuthDesired = this.nearestAngle(-100 * (Math.PI / 180));
                this.elevationDesired = 16 * (Math.PI / 180);
                this.distanceDesired = 70.0;
                break;
            case 'river':
                // Fokus ke Sungai Pemisah & Jembatan Penghubung
                this.targetDesired.set(0, 0, 0);
                this.elevationDesired = 38 * (Math.PI / 180);
                this.distanceDesired = 85.0;
                break;
        }
    }

    /** Sudut setara terdekat dengan azimuth sekarang (agar tidak berputar 1 putaran penuh). */
    nearestAngle(a) {
        const TAU = Math.PI * 2;
        return a + Math.round((this.azimuthDesired - a) / TAU) * TAU;
    }

    /**
     * Reset kamera ke pusat kota k12 (Alun-Alun Merdeka)
     */
    recenter(x = 0, z = 0) {
        this.targetDesired.set(x, 0, z);
        this.distanceDesired = 45.0;
        this.elevationDesired = 41 * (Math.PI / 180);
        this.azimuthDesired = 45 * (Math.PI / 180);
    }

    /**
     * Resize viewport
     */
    resize(width, height) {
        if (!width || !height) return;
        this.aspect = width / height;
        this.camera.aspect = this.aspect;
        this.camera.updateProjectionMatrix();
    }
}
