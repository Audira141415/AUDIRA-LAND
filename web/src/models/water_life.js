/**
 * AUDIRA-LAND: Kehidupan perairan yang bergerak (dipakai oleh RuralScenery).
 *  - WaterfallFX : tirai air terjun bertekstur jatuh + buih & percikan di kolam (2 draw call,
 *                  ter-cull bila di luar layar).
 *  - Anglers     : pemancing duduk di dingklik dengan joran + senar (1 InstancedMesh ber-vertex-color,
 *                  1 draw call untuk semua). Sesekali joran disentak (badan condong ke belakang).
 * Animasi berjalan lewat onWaterTick (core/water.js) -> tidak perlu menyentuh main.js.
 */

import { makeWaterfallMaterial, onWaterTick } from '../core/water.js';

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

/** Gabung beberapa geometri berwarna jadi satu BufferGeometry ber-vertex-color (non-indexed). */
export function mergeColored(parts) {
    const pos = [], nrm = [], col = [];
    for (const { geo, hex } of parts) {
        const g = geo.index ? geo.toNonIndexed() : geo;
        const c = lin(hex);
        const p = g.attributes.position.array, n = g.attributes.normal.array;
        for (let i = 0; i < p.length; i += 3) {
            pos.push(p[i], p[i + 1], p[i + 2]);
            nrm.push(n[i], n[i + 1], n[i + 2]);
            col.push(c.r, c.g, c.b);
        }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
}

// =====================================================================
// Air terjun
// =====================================================================
export class WaterfallFX {
    /**
     * @param o.lipX, o.topY, o.z   bibir tebing (tempat air mulai jatuh), menghadap -X
     * @param o.width                lebar tirai
     * @param o.poolY                permukaan kolam
     * @param o.outward              seberapa jauh air melengkung keluar (m) sampai bawah
     */
    constructor(scene, o) {
        const H = o.topY - o.poolY;
        const W = o.width;
        const out = o.outward ?? 1.1;

        // --- Tirai: bidang melengkung keluar (parabola), menghadap barat ---
        const geo = new THREE.PlaneGeometry(W, H, 4, 12);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const t = Math.min(1, Math.max(0, (H / 2 - p.getY(i)) / H));   // 0 atas -> 1 bawah
            const bulge = Math.pow(t, 0.6) * out;
            // Tirai sedikit melebar ke bawah + tepi tidak rata
            p.setX(i, p.getX(i) * (1 + t * 0.18));
            p.setZ(i, bulge + Math.sin(i * 1.7) * 0.06 * t);
        }
        geo.computeVertexNormals();
        geo.rotateY(-Math.PI / 2);                       // +Z bidang -> -X dunia
        geo.translate(0, o.poolY + H / 2, 0);
        this.curtain = new THREE.Mesh(geo, makeWaterfallMaterial(1.5, Math.max(2, H / 7)));
        this.curtain.position.set(o.lipX, 0, o.z);
        this.curtain.name = 'waterfall_curtain';
        this.curtain.renderOrder = 2;
        scene.add(this.curtain);

        // --- Buih + percikan: satu InstancedMesh di titik jatuh ---
        this.impact = new THREE.Vector3(o.lipX - out, o.poolY, o.z);
        const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
        puffGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 16);
        const puffMat = new THREE.MeshLambertMaterial({
            color: lin(0xF4FAFC), emissive: lin(0x3A4A50), transparent: true, opacity: 0.88, depthWrite: false
        });
        const r = rng(9911);
        this.foam = [];      // buih mengambang di titik jatuh
        this.drift = [];     // buih yang hanyut ke anak kali
        this.drops = [];     // percikan balistik
        for (let i = 0; i < 20; i++) {
            const a = r() * Math.PI * 2, d = Math.sqrt(r());
            this.foam.push({ x: -d * 1.4 + 0.2, z: (r() - 0.5) * W * 1.1, s: 0.9 + r() * 0.9, ph: r() * 6.28, a });
        }
        for (let i = 0; i < 10; i++) this.drift.push({ u: r(), z: (r() - 0.5) * 4, s: 0.4 + r() * 0.4, ph: r() * 6.28 });
        for (let i = 0; i < 34; i++) this.drops.push(this.spawnDrop(r, W, r() * 1.2));
        this.rand = r;
        this.width = W;
        this.poolRadius = o.poolRadius ?? 6;
        const n = this.foam.length + this.drift.length + this.drops.length;
        this.fx = new THREE.InstancedMesh(puffGeo, puffMat, n);
        this.fx.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.fx.position.copy(this.impact);
        this.fx.renderOrder = 3;
        this.fx.name = 'waterfall_foam';
        scene.add(this.fx);

        this.dummy = new THREE.Object3D();
        onWaterTick((dt, t) => this.update(dt, t));
        this.update(0, 0);
    }

    spawnDrop(r, W, age = 0) {
        const a = Math.PI * (0.55 + r() * 0.9);          // ke arah barat (menjauhi tebing) dan samping
        const sp = 1.2 + r() * 2.2;
        return {
            x: 0, y: 0.1, z: (r() - 0.5) * W, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.6 * (r() < 0.5 ? -1 : 1),
            vy: 2.2 + r() * 2.6, age, life: 0.9 + r() * 0.7, s: 0.12 + r() * 0.16
        };
    }

    update(dt, t) {
        if (!this.curtain.visible) return;
        const d = this.dummy;
        let k = 0;
        // Buih bergolak: membesar-mengecil, sedikit naik-turun
        for (const f of this.foam) {
            const pulse = 1 + Math.sin(t * 3.1 + f.ph) * 0.22;
            d.position.set(f.x + Math.sin(t * 0.7 + f.ph) * 0.15, 0.05 + Math.abs(Math.sin(t * 2.3 + f.ph)) * 0.12, f.z);
            d.rotation.set(f.ph, t * 0.4 + f.a, 0);
            d.scale.set(f.s * pulse * 1.3, f.s * pulse * 0.45, f.s * pulse * 1.3);
            d.updateMatrix();
            this.fx.setMatrixAt(k++, d.matrix);
        }
        // Buih hanyut ke barat (ke anak kali), memudar dengan mengecil
        for (const f of this.drift) {
            f.u += dt * 0.07;
            if (f.u > 1) { f.u -= 1; f.z = (this.rand() - 0.5) * 4; }
            const s = f.s * Math.sin(f.u * Math.PI);
            d.position.set(-1.5 - f.u * (this.poolRadius + 2), 0.06, f.z + Math.sin(t * 0.9 + f.ph) * 0.4);
            d.rotation.set(0, f.ph, 0);
            d.scale.set(s * 1.6, s * 0.3, s * 1.2);
            d.updateMatrix();
            this.fx.setMatrixAt(k++, d.matrix);
        }
        // Percikan: lempar-jatuh, lahir ulang di titik jatuh
        for (let i = 0; i < this.drops.length; i++) {
            let p = this.drops[i];
            p.age += dt;
            if (p.age > p.life || p.y < 0) { p = this.drops[i] = this.spawnDrop(this.rand, this.width); }
            p.vy -= 9.8 * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            const s = p.s * (1 - p.age / p.life * 0.6);
            d.position.set(p.x, Math.max(0.05, p.y), p.z);
            d.rotation.set(0, 0, 0);
            d.scale.set(s, s, s);
            d.updateMatrix();
            this.fx.setMatrixAt(k++, d.matrix);
        }
        this.fx.instanceMatrix.needsUpdate = true;
    }
}

// =====================================================================
// Pemancing
// =====================================================================
const SKIN = 0xA8754F, PANTS = 0x3B4A5E, WOOD = 0x8C6A45;
const SHIRTS = [0x2F6F8F, 0x8A3B2E, 0x4E7A3A, 0xC9A23A];

/** Satu pemancing duduk di dingklik menghadap +Z; alas (kaki & dingklik) di y = 0. */
function anglerGeometry(shirt) {
    const box = (w, h, d, x, y, z, hex) => ({ geo: new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex });
    const parts = [
        box(0.42, 0.3, 0.36, 0, 0.15, -0.1, WOOD),                 // dingklik
        box(0.36, 0.15, 0.44, 0, 0.375, 0.1, PANTS),               // paha
        box(0.13, 0.3, 0.13, -0.1, 0.15, 0.28, PANTS),             // betis
        box(0.13, 0.3, 0.13, 0.1, 0.15, 0.28, PANTS),
        box(0.13, 0.06, 0.2, -0.1, 0.03, 0.34, SKIN),              // kaki
        box(0.13, 0.06, 0.2, 0.1, 0.03, 0.34, SKIN),
        box(0.4, 0.52, 0.24, 0, 0.71, -0.06, shirt),               // badan
        box(0.1, 0.1, 0.36, -0.2, 0.8, 0.12, shirt),               // lengan ke depan
        box(0.1, 0.1, 0.36, 0.2, 0.8, 0.12, shirt),
        box(0.12, 0.1, 0.1, 0, 0.8, 0.32, SKIN),                   // tangan menggenggam joran
        { geo: new THREE.SphereGeometry(0.13, 7, 5).translate(0, 1.1, -0.04), hex: SKIN },
        { geo: new THREE.ConeGeometry(0.34, 0.16, 8).translate(0, 1.26, -0.04), hex: 0xD8B46A }, // caping
        { geo: new THREE.CylinderGeometry(0.15, 0.12, 0.24, 7).translate(0.38, 0.12, -0.05), hex: 0x3D6E8C } // ember
    ];
    // Joran: dari tangan condong ke depan-atas (1,0 rad dari tegak), panjang 3,2 m
    const rod = new THREE.CylinderGeometry(0.016, 0.03, 3.2, 4);
    rod.rotateX(1.0);
    rod.translate(0, 0.8 + 1.6 * Math.cos(1.0), 0.32 + 1.6 * Math.sin(1.0));
    parts.push({ geo: rod, hex: 0x6B4A2A });
    const tipY = 0.8 + 3.2 * Math.cos(1.0), tipZ = 0.32 + 3.2 * Math.sin(1.0);
    // Senar tegak dari ujung joran sampai sedikit di bawah air (tempat duduk 0–0,6 m di atas air)
    const lineLen = tipY + 0.7;
    parts.push(box(0.012, lineLen, 0.012, 0, tipY - lineLen / 2, tipZ, 0xE8E8E8));
    return mergeColored(parts);
}

export class Anglers {
    /**
     * @param spots [{x, y, z, yaw, waterY}] yaw = arah hadap (ke air). y = permukaan duduk.
     */
    constructor(scene, spots) {
        this.spots = spots;
        const r = rng(5150);
        // Satu geometri untuk semua (1 draw call). instanceColor mewarnai seluruh tubuh, jadi baju
        // dasarnya krem dan tiap orang hanya diberi tint ringan agar kulit tetap wajar.
        const geo = anglerGeometry(0xD8D2C4);
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;   // tersebar luas; 1 draw call
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.name = 'anglers';
        const c = new THREE.Color();
        spots.forEach((s, i) => {
            s.phase = r() * 6.28;
            s.nextStrike = 4 + r() * 18;
            s.strike = 0;
            // Tint ringan per orang (baju krem -> kebiruan/kemerahan/kehijauan), kulit tetap wajar
            const tint = SHIRTS[i % SHIRTS.length];
            c.copy(lin(tint)).lerp(new THREE.Color(1, 1, 1), 0.72);
            this.mesh.setColorAt(i, c);
        });
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        scene.add(this.mesh);
        this.dummy = new THREE.Object3D();
        onWaterTick((dt, t) => this.update(dt, t));
        this.update(0, 0);
    }

    update(dt, t) {
        const d = this.dummy;
        for (let i = 0; i < this.spots.length; i++) {
            const s = this.spots[i];
            s.nextStrike -= dt;
            if (s.nextStrike < 0) { s.strike = 1; s.nextStrike = 8 + ((i * 7919) % 17); }
            s.strike = Math.max(0, s.strike - dt * 1.4);
            // Sentakan: condong ke belakang cepat lalu kembali; diam: napas & joran bergoyang tipis
            const jerk = Math.sin(s.strike * Math.PI) * 0.09;
            const idle = Math.sin(t * 1.3 + s.phase) * 0.012;
            d.position.set(s.x, s.y, s.z);
            d.rotation.set(-jerk + idle, s.yaw + Math.sin(t * 0.21 + s.phase) * 0.05, 0, 'YXZ');
            d.updateMatrix();
            this.mesh.setMatrixAt(i, d.matrix);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
