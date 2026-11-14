/**
 * AUDIRA-LAND: Mode Jalan (Avatar Tokoh 3D) — GDD §4 Mode B
 * Tokoh low-poly berjalan di jalanan kota; kamera third-person mengikuti.
 * Input gabungan: joystick layar (TouchControls) + WASD (camera.keysDown).
 * Emote memunculkan balon emoji di atas kepala tokoh.
 */

import { GRID_CONFIG } from './constants.js';

const SKIN = 0xE8B98C;
const WALK_SPEED = 3.4;   // m/detik
const RUN_SPEED = 6.6;
const AVATAR_RADIUS = 0.4;        // jari-jari tabrakan tokoh (m)
const FOOTPRINT_INSET = 0.6;      // kecilkan footprint supaya gang antar bangunan tetap bisa dilewati
// Tipe lahan terbuka: boleh diinjak, tidak menghalangi tokoh.
const WALKABLE_TYPES = new Set(['taman', 'taman_surya', 'sawah', 'lapangan', 'kebun', 'kebun_sayur', 'waduk', 'pkl']);

function box(w, h, d, color, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0 }));
    m.castShadow = true;
    return m;
}

export class WalkMode {
    constructor(scene, camera, playerState, buildingLoader = null) {
        this.scene = scene;
        this.camera = camera;
        this.playerState = playerState;
        this.buildingLoader = buildingLoader;
        this.colliders = [];        // {x, z, hw, hd} AABB footprint bangunan
        this._colliderCount = -1;   // rebuild cache saat jumlah bangunan berubah
        this.active = false;
        this.input = { x: 0, y: 0, run: false };
        this.pos = new THREE.Vector3(0, 0, 0);
        this.facing = 0;
        this.walkPhase = 0;
        this.emoteSprite = null;
        this.emoteUntil = 0;
        this.build();
    }

    build() {
        const g = new THREE.Group();
        const shirt = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.playerState.state.avatarColor || '#5B3A24'), roughness: 0.75 });
        const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.85 });

        // Kaki (dua, bisa diayun saat jalan)
        this.legL = box(0.22, 0.7, 0.24, 0x3A3A44);
        this.legR = box(0.22, 0.7, 0.24, 0x3A3A44);
        this.legL.position.set(-0.16, 0.35, 0);
        this.legR.position.set(0.16, 0.35, 0);
        // Badan
        const body = box(0.6, 0.72, 0.34, null, shirt);
        body.position.set(0, 1.06, 0);
        // Lengan
        const armL = box(0.17, 0.62, 0.2, null, skin);
        const armR = box(0.17, 0.62, 0.2, null, skin);
        armL.position.set(-0.4, 1.08, 0);
        armR.position.set(0.4, 1.08, 0);
        // Kepala + wajah sederhana
        const head = box(0.42, 0.42, 0.42, null, skin);
        head.position.set(0, 1.64, 0);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1A1A1A });
        const eyeL = box(0.07, 0.07, 0.04, null, eyeMat); eyeL.position.set(-0.1, 1.68, 0.22);
        const eyeR = box(0.07, 0.07, 0.04, null, eyeMat); eyeR.position.set(0.1, 1.68, 0.22);

        g.add(this.legL, this.legR, body, armL, armR, head, eyeL, eyeR);
        g.visible = false;
        this.group = g;
        this.scene.add(g);
    }

    /** Warnai ulang baju bila avatarColor warga berubah. */
    refreshColor() {
        const shirt = this.group.children[2];
        if (shirt && shirt.material) shirt.material.color.set(this.playerState.state.avatarColor || '#5B3A24');
    }

    isActive() { return this.active; }

    enter() {
        // Spawn di rumah warga bila ada, kalau tidak di fokus kamera sekarang
        const lot = this.playerState.state.assignedLot;
        if (lot) this.pos.set(lot.worldX, 0, lot.worldZ);
        else this.pos.set(this.camera.target.x, 0, this.camera.target.z);
        // Jangan spawn di dalam bangunan (mis. rumah sendiri): geser ke titik bebas terdekat.
        this.rebuildColliders();
        this.findFreeSpawn();
        this.refreshColor();
        this.group.position.copy(this.pos);
        this.group.visible = true;
        this.active = true;
        this.camera.walkActive = true;
        // Kamera third-person: lebih dekat & rendah
        this._prev = { dist: this.camera.distanceDesired, elev: this.camera.elevationDesired };
        this.camera.distanceDesired = 11.0;
        this.camera.elevationDesired = 24 * (Math.PI / 180);
    }

    exit() {
        this.active = false;
        this.group.visible = false;
        this.camera.walkActive = false;
        if (this._prev) {
            this.camera.distanceDesired = this._prev.dist;
            this.camera.elevationDesired = this._prev.elev;
        }
        this.clearEmote();
    }

    toggle() { this.active ? this.exit() : this.enter(); return this.active; }

    /** Vektor joystick layar (x kanan, y bawah), -1..1, + lari. */
    setInput(x, y, run) { this.input.x = x; this.input.y = y; this.input.run = !!run; }

    emote(key) {
        const EMO = { wave: '👋', dance: '🕺', sit: '🪑', cheer: '🙌', love: '❤️' };
        const emoji = EMO[key] || key || '👋';
        this.clearEmote();
        const cv = document.createElement('canvas');
        cv.width = cv.height = 128;
        const ctx = cv.getContext('2d');
        ctx.font = '96px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 64, 70);
        const tex = new THREE.CanvasTexture(cv);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        spr.scale.set(1.1, 1.1, 1.1);
        spr.position.set(0, 2.5, 0);
        this.group.add(spr);
        this.emoteSprite = spr;
        this.emoteUntil = performance.now() + 2200;
    }

    clearEmote() {
        if (this.emoteSprite) {
            this.group.remove(this.emoteSprite);
            if (this.emoteSprite.material.map) this.emoteSprite.material.map.dispose();
            this.emoteSprite.material.dispose();
            this.emoteSprite = null;
        }
    }

    /** Bangun ulang daftar AABB footprint bangunan (dipanggil saat jumlah bangunan berubah). */
    rebuildColliders() {
        const T = GRID_CONFIG.TILE_SIZE;
        const out = [];
        if (this.buildingLoader) {
            for (const item of this.buildingLoader.loadedBuildings.values()) {
                const d = item.data;
                if (!d || WALKABLE_TYPES.has(d.type)) continue;
                if (d.worldX === undefined || d.worldZ === undefined) continue;
                const hw = Math.max(0.2, (d.width || 1) * T / 2 - FOOTPRINT_INSET);
                const hd = Math.max(0.2, (d.height || 1) * T / 2 - FOOTPRINT_INSET);
                out.push({ x: d.worldX, z: d.worldZ, hw, hd });
            }
        }
        this.colliders = out;
        this._colliderCount = this.buildingLoader ? this.buildingLoader.loadedBuildings.size : 0;
    }

    /** Bila posisi spawn menembus bangunan, cari titik bebas terdekat (spiral keluar). */
    findFreeSpawn() {
        if (!this.blocked(this.pos.x, this.pos.z)) return;
        const lim = this.camera.maxPan;
        for (let r = 1.0; r <= 14.0; r += 1.0) {
            for (let a = 0; a < 16; a++) {
                const ang = (a / 16) * Math.PI * 2;
                const x = Math.max(-lim, Math.min(lim, this.pos.x + Math.cos(ang) * r));
                const z = Math.max(-lim, Math.min(lim, this.pos.z + Math.sin(ang) * r));
                if (!this.blocked(x, z)) { this.pos.set(x, 0, z); return; }
            }
        }
    }

    /** True bila titik (x,z) + jari-jari tokoh menembus footprint bangunan mana pun. */
    blocked(x, z) {
        const R = AVATAR_RADIUS;
        for (const c of this.colliders) {
            if (Math.abs(x - c.x) < c.hw + R && Math.abs(z - c.z) < c.hd + R) return true;
        }
        return false;
    }

    update(dt) {
        if (!this.active) return;
        // Segarkan cache tabrakan bila bangunan bertambah/berkurang (polling/konstruksi selesai).
        if (this.buildingLoader && this.buildingLoader.loadedBuildings.size !== this._colliderCount) {
            this.rebuildColliders();
        }

        // Gabungkan joystick + WASD (arah layar). y layar ke bawah = maju.
        let ix = this.input.x;
        let iy = this.input.y;
        const k = this.camera.keysDown || {};
        if (k['KeyW'] || k['ArrowUp']) iy -= 1;
        if (k['KeyS'] || k['ArrowDown']) iy += 1;
        if (k['KeyD'] || k['ArrowRight']) ix += 1;
        if (k['KeyA'] || k['ArrowLeft']) ix -= 1;
        const run = this.input.run || !!k['ShiftLeft'] || !!k['ShiftRight'];

        const mag = Math.hypot(ix, iy);
        if (mag > 0.08) {
            const nx = ix / Math.max(1, mag);
            const ny = iy / Math.max(1, mag);
            // Konversi arah layar -> dunia memakai azimuth kamera (maju = menjauh dari kamera)
            const sin = Math.sin(this.camera.azimuthAngle);
            const cos = Math.cos(this.camera.azimuthAngle);
            // maju layar (ny<0) = arah (-sin,-cos); kanan layar (nx>0) = (cos,-sin)
            const worldX = (-sin) * (-ny) + (cos) * (nx);
            const worldZ = (-cos) * (-ny) + (-sin) * (nx);
            const len = Math.hypot(worldX, worldZ) || 1;
            const dirX = worldX / len, dirZ = worldZ / len;
            const speed = (run ? RUN_SPEED : WALK_SPEED) * Math.min(1, mag);
            const lim = this.camera.maxPan;
            // Gerak per sumbu + cek tabrakan: tokoh menyusur dinding, tidak menembus bangunan.
            const nextX = Math.max(-lim, Math.min(lim, this.pos.x + dirX * speed * dt));
            if (!this.blocked(nextX, this.pos.z)) this.pos.x = nextX;
            const nextZ = Math.max(-lim, Math.min(lim, this.pos.z + dirZ * speed * dt));
            if (!this.blocked(this.pos.x, nextZ)) this.pos.z = nextZ;
            this.facing = Math.atan2(dirX, dirZ);
            this.walkPhase += dt * speed * 2.2;
        } else {
            this.walkPhase *= Math.max(0, 1 - dt * 8);
        }

        // Terapkan posisi & hadap
        this.group.position.set(this.pos.x, 0, this.pos.z);
        this.group.rotation.y = this.facing;
        // Ayun kaki
        const swing = Math.sin(this.walkPhase) * 0.5;
        this.legL.rotation.x = swing;
        this.legR.rotation.x = -swing;

        // Kamera mengikuti tokoh (lerp ditangani camera.update)
        this.camera.targetDesired.set(this.pos.x, 0.8, this.pos.z);

        // Hapus emote setelah waktunya
        if (this.emoteSprite && performance.now() > this.emoteUntil) this.clearEmote();
    }
}
