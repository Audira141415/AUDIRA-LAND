/**
 * AUDIRA-LAND: WebGL Engine & Telemetri Performa Mobile
 *
 * - Resolusi adaptif: pixel ratio turun otomatis bila FPS < 50 dan naik lagi bila stabil 60,
 *   dalam batas [0.75, maks perangkat] (maks 1.5 di HP, 2.0 di desktop).
 * - Ukuran kanvas dicek tiap frame (murah) sehingga rotasi HP, panel yang awalnya 0px,
 *   atau keyboard virtual tidak lagi membuat gambar gepeng; kamera ikut diperbarui.
 * - Bayangan lembut PCFSoft + tone mapping ACES untuk cahaya yang lebih natural.
 */

const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

export class CityRenderer {
    constructor(canvas) {
        this.canvas = canvas;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });

        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.86;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Batas resolusi adaptif
        this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2.0);
        this.minPixelRatio = Math.min(0.75, this.maxPixelRatio);
        this.pixelRatio = Math.min(this.maxPixelRatio, isCoarse ? 1.25 : 1.5);
        this.renderer.setPixelRatio(this.pixelRatio);

        // Telemetri Performa
        this.fps = 60;
        this.drawCalls = 0;
        this.triangles = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.goodStreak = 0;

        this.width = 0;
        this.height = 0;
        this.onResize = null;
        this.checkSize();
    }

    /** Sinkronkan ukuran buffer dengan ukuran tampilan kanvas. */
    checkSize() {
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        if (w === 0 || h === 0) return false;
        if (w !== this.width || h !== this.height) {
            this.width = w;
            this.height = h;
            this.renderer.setSize(w, h, false);
            if (this.onResize) this.onResize(w, h);
        }
        return true;
    }

    resize() {
        this.checkSize();
    }

    render(scene, camera) {
        if (!this.checkSize()) return;
        this.renderer.render(scene, camera);

        this.drawCalls = this.renderer.info.render.calls;
        this.triangles = this.renderer.info.render.triangles;

        const now = performance.now();
        // Tab disembunyikan / jeda panjang: jangan dianggap FPS rendah
        if (this.lastFrame && now - this.lastFrame > 250) {
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
        this.lastFrame = now;
        this.frameCount++;
        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = now;
            this.adaptResolution();
        }
    }

    adaptResolution() {
        let next = this.pixelRatio;
        if (this.fps < 50) {
            next = Math.max(this.minPixelRatio, this.pixelRatio - 0.15);
            this.goodStreak = 0;
        } else if (this.fps >= 58) {
            this.goodStreak++;
            if (this.goodStreak >= 4) {
                next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
                this.goodStreak = 0;
            }
        }
        if (Math.abs(next - this.pixelRatio) > 0.01) {
            this.pixelRatio = next;
            this.renderer.setPixelRatio(next);
            this.renderer.setSize(this.width, this.height, false);
        }
    }

    getTelemetry() {
        return {
            fps: this.fps,
            drawCalls: this.drawCalls,
            triangles: this.triangles,
            pixelRatio: this.pixelRatio
        };
    }
}
