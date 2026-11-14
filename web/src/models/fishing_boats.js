/**
 * AUDIRA-LAND: Perahu nelayan (jukung bercadik) di sungai utama & saluran.
 * Semua perahu = 8 InstancedMesh (lambung berwarna, cadik, atap, tiang, nelayan, caping, joran).
 *  - Sungai: tiap celah antar-jembatan diberi 0–2 perahu; bergerak bolak-balik DI DALAM celah
 *    sehingga tidak menembus geladak jembatan. Sebagian berlabuh sambil memancing (berputar pelan).
 *  - Saluran: perahu menyusuri alur berkelok mengikuti arah saluran.
 *  - Tambat: perahu diam di samping dermaga kayu (DOCKS di rural_scenery.js), sebagian tanpa awak.
 * Ayunan ombak (naik-turun, oleng) membuat perahu terasa mengapung.
 */

import { DOCKS } from './rural_scenery.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const HULL_COLORS = [0x2E6FA8, 0x2F8A5B, 0xB8432F, 0xE0A526, 0x6A3E8E];

export class FishingBoats {
    /**
     * @param bridgeZs  posisi z jembatan sungai utama (+ ujung sungai)
     * @param channel   titik saluran [{x, z, half}]
     */
    constructor(scene, bridgeZs, channel) {
        const r = rng(4242);
        this.boats = [];
        const zs = [...new Set(bridgeZs)].sort((a, b) => a - b);
        for (let k = 0; k < zs.length - 1; k++) {
            const z0 = zs[k] + 7.5, z1 = zs[k + 1] - 7.5;
            if (z1 - z0 < 5) continue;
            const n = r() < 0.35 ? 2 : (r() < 0.75 ? 1 : 0);
            for (let i = 0; i < n; i++) {
                this.boats.push({
                    kind: 'river', x: -9 + r() * 18, z0, z1, t: r(), dir: r() < 0.5 ? 1 : -1,
                    speed: 0.6 + r() * 0.6, anchored: r() < 0.4, phase: r() * 6.28,
                    color: HULL_COLORS[Math.floor(r() * HULL_COLORS.length)]
                });
            }
        }
        if (channel && channel.length > 2) {
            this.channel = channel;
            const acc = [0];
            for (let i = 1; i < channel.length; i++) {
                acc.push(acc[i - 1] + Math.hypot(channel[i].x - channel[i - 1].x, channel[i].z - channel[i - 1].z));
            }
            this.chanAcc = acc;
            this.chanLen = acc[acc.length - 1];
            for (let i = 0; i < 6; i++) {
                this.boats.push({
                    kind: 'channel', s: 0.08 + r() * 0.84, dir: r() < 0.5 ? 1 : -1, lateral: (r() - 0.5) * 0.8,
                    speed: 0.8 + r() * 0.7, anchored: r() < 0.3, phase: r() * 6.28,
                    color: HULL_COLORS[Math.floor(r() * HULL_COLORS.length)]
                });
            }
        }

        for (const D of DOCKS) {
            for (const m of D.boats) {
                this.boats.push({
                    kind: 'moored', x: m.x, z: m.z, yaw: m.yaw, waterY: m.waterY, crew: m.crew,
                    phase: r() * 6.28, color: HULL_COLORS[Math.floor(r() * HULL_COLORS.length)]
                });
            }
        }

        const n = Math.max(1, this.boats.length);
        const lam = hex => new THREE.MeshLambertMaterial({ color: lin(hex) });
        const make = (geo, mat) => {
            const m = new THREE.InstancedMesh(geo, mat, n);
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.frustumCulled = false;
            m.castShadow = true;
            m.receiveShadow = true;
            scene.add(m);
            return m;
        };

        // Lambung jukung: ujung depan-belakang meruncing & sedikit naik
        const hullGeo = new THREE.BoxGeometry(1.3, 0.42, 4.6, 1, 1, 6);
        const p = hullGeo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const z = p.getZ(i) / 2.3;
            const taper = 1 - Math.pow(Math.abs(z), 2.2) * 0.85;
            p.setX(i, p.getX(i) * taper);
            if (p.getY(i) > 0) p.setY(i, p.getY(i) + Math.pow(Math.abs(z), 3) * 0.25);
        }
        hullGeo.computeVertexNormals();
        hullGeo.translate(0, 0.21, 0);
        this.hull = make(hullGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
        const c = new THREE.Color();
        this.boats.forEach((b, i) => this.hull.setColorAt(i, c.copy(lin(b.color))));
        if (this.hull.instanceColor) this.hull.instanceColor.needsUpdate = true;

        const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
        this.outrig = make(box(3.6, 0.06, 0.08, 0, 0.42, 0.4), lam(0x6B4E32));        // cadik
        this.canopy = make(box(1.1, 0.06, 1.2, 0, 1.35, -1.2), lam(0x5A4632));        // atap rumbia
        this.posts = make(box(0.9, 0.95, 0.05, 0, 0.88, -1.2), lam(0x6B4E32));        // tiang atap
        this.body = make(box(0.38, 0.55, 0.26, 0, 0.7, 0.6), lam(0x5C4632));          // nelayan
        this.head = make(new THREE.SphereGeometry(0.13, 7, 5).translate(0, 1.1, 0.6), lam(0xA8754F));
        this.hat = make(new THREE.ConeGeometry(0.34, 0.16, 8).translate(0, 1.25, 0.6), lam(0xD8B46A));
        const rod = new THREE.CylinderGeometry(0.018, 0.025, 3.2, 4);
        rod.rotateX(-1.0);
        rod.translate(0.25, 1.6, 1.9);
        this.rod = make(rod, lam(0x8A6A3E));
        this.parts = [this.hull, this.outrig, this.canopy, this.posts, this.body, this.head, this.hat, this.rod];
        this.crewParts = new Set([this.body, this.head, this.hat, this.rod]);
        this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);

        this.dummy = new THREE.Object3D();
        this.time = 0;
        this.update(0);
    }

    channelAt(s) {
        const target = s * this.chanLen;
        let i = 1;
        while (i < this.chanAcc.length - 1 && this.chanAcc[i] < target) i++;
        const a = this.channel[i - 1], b = this.channel[i];
        const f = (target - this.chanAcc[i - 1]) / Math.max(1e-6, this.chanAcc[i] - this.chanAcc[i - 1]);
        const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
        return {
            x: a.x + tx * f, z: a.z + tz * f, half: a.half + (b.half - a.half) * f,
            tx: tx / l, tz: tz / l
        };
    }

    update(dt) {
        this.time += dt;
        const d = this.dummy;
        for (let i = 0; i < this.boats.length; i++) {
            const b = this.boats[i];
            let x, z, yaw, waterY;
            if (b.kind === 'moored') {
                // Tertambat: hanya berayun pelan di tali tambat
                x = b.x;
                z = b.z;
                yaw = b.yaw + Math.sin(this.time * 0.35 + b.phase) * 0.05;
                waterY = b.waterY;
            } else if (b.kind === 'river') {
                if (!b.anchored) {
                    b.t += b.dir * b.speed * dt / Math.max(1, b.z1 - b.z0);
                    if (b.t > 1) { b.t = 1; b.dir = -1; }
                    if (b.t < 0) { b.t = 0; b.dir = 1; }
                }
                x = b.x;
                z = b.z0 + (b.z1 - b.z0) * b.t;
                yaw = b.anchored ? b.phase + Math.sin(this.time * 0.2 + b.phase) * 0.4 : (b.dir > 0 ? 0 : Math.PI);
                waterY = 0.04;
            } else {
                if (!b.anchored) {
                    b.s += b.dir * b.speed * dt / this.chanLen;
                    if (b.s > 0.95) { b.s = 0.95; b.dir = -1; }
                    if (b.s < 0.05) { b.s = 0.05; b.dir = 1; }
                }
                const q = this.channelAt(b.s);
                const off = b.lateral * Math.max(0, q.half - 1.6);
                x = q.x - q.tz * off;
                z = q.z + q.tx * off;
                const heading = Math.atan2(q.tx, q.tz);
                yaw = b.anchored ? heading + Math.sin(this.time * 0.2 + b.phase) * 0.3 : (b.dir > 0 ? heading : heading + Math.PI);
                waterY = 0.045;
            }
            const bob = Math.sin(this.time * 1.6 + b.phase) * 0.04;
            d.position.set(x, waterY - 0.08 + bob, z);
            d.rotation.set(Math.sin(this.time * 0.9 + b.phase) * 0.02, yaw, Math.sin(this.time * 1.1 + b.phase) * 0.035, 'YXZ');
            d.updateMatrix();
            const noCrew = b.kind === 'moored' && !b.crew;
            for (const m of this.parts) m.setMatrixAt(i, noCrew && this.crewParts.has(m) ? this.hidden : d.matrix);
        }
        for (const m of this.parts) m.instanceMatrix.needsUpdate = true;
    }
}
