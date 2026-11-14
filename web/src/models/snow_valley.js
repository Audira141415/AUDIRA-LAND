/* global THREE */
/**
 * AUDIRA-LAND: Lembah pinus + barisan gunung es di cakrawala UTARA (di belakang batas tanah z ≈ 290).
 *
 *  - Medan heightfield low-poly (flat shaded, vertex color, ikut kabut scene/cuaca):
 *    lembah landai berumput di depan, danau beku di tengah lembah, lalu barisan puncak bersalju.
 *    Warna per segitiga dari tinggi + kemiringan: rumput lembah -> padang alpine -> batu -> salju.
 *  - Hutan pinus: satu InstancedMesh (geometri ber-vertex-color: batang + 3 tingkat daun + topi salju),
 *    tersebar di lantai lembah & lereng bawah, makin tinggi makin tertutup salju (instanceColor).
 * Total 2 draw call. Zero-Submerging: pangkal batang tepat di permukaan medan (+0,02).
 */

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

function rng(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

const Z0 = 286;                       // tepi tanah kota/sawah (utara)
const X0 = -620, X1 = 660, Z1 = 980;  // batas medan
const NX = 72, NZ = 40;               // sel grid medan

// Puncak bersalju (x, z, tinggi, jari-jari)
const PEAKS = [
    [-500, 620, 115, 130], [-310, 680, 160, 150], [-110, 730, 190, 165], [70, 670, 150, 135],
    [250, 720, 175, 160], [440, 650, 140, 140], [590, 600, 105, 120], [-10, 820, 150, 180]
];
// Danau beku di lantai lembah
const LAKE = { x: 40, z: 440, rx: 80, rz: 34, y: 2.2 };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Tinggi medan (m) di (x, z). 0 di tepi tanah kota. */
export function snowValleyHeight(x, z) {
    const d = z - Z0;
    if (d <= 0) return 0;
    // Lantai lembah berbukit landai, naik pelan ke kaki gunung
    let h = smooth(0, 60, d) * (3 + 2.2 * Math.sin(x / 47) + 1.6 * Math.sin(x / 19 + z / 31) + 1.2 * Math.cos(z / 23));
    h += smooth(120, 420, d) * 30;
    // Lereng samping lembah (bahu kiri-kanan) agar terasa seperti lembah
    h += smooth(280, 600, Math.abs(x - 30)) * smooth(20, 160, d) * 45;
    // Puncak: kerucut berpunggung (ridge noise) - ambil yang tertinggi
    for (const [px, pz, ph, pr] of PEAKS) {
        const dx = x - px, dz = (z - pz) * 1.15;
        const r = Math.hypot(dx, dz) / pr;
        if (r >= 1.6) continue;
        const ang = Math.atan2(dz, dx);
        const ridge = 1 + 0.18 * Math.sin(ang * 5 + px) + 0.08 * Math.sin(ang * 11 + pz);
        const k = Math.max(0, 1 - r / (1.6 * ridge));
        h = Math.max(h, ph * Math.pow(k, 1.35) * smooth(130, 320, d));
    }
    // Danau beku: lantai rata
    const ld = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    if (ld < 1.35) h = THREE.MathUtils.lerp(LAKE.y, h, smooth(1.0, 1.35, ld));
    return h;
}

export class SnowValley {
    constructor(scene) {
        this.group = new THREE.Group();
        this.group.name = 'snow_valley';
        this.buildTerrain();
        this.buildPines();
        scene.add(this.group);
    }

    buildTerrain() {
        const haze = lin(0xB4C6D4);
        const C = {
            grass: lin(0x5C8A3E), grass2: lin(0x4E7D38), alpine: lin(0x6E8A55),
            rock: lin(0x7A7F87), rockD: lin(0x5F646C), snow: lin(0xDCE6EF), snowB: lin(0xB4C4D4), ice: lin(0xBFE0EE)
        };
        const H = snowValleyHeight;
        const P = [];
        for (let j = 0; j <= NZ; j++) {
            const row = [];
            for (let i = 0; i <= NX; i++) {
                // Sel lebih rapat di depan (lembah), renggang di belakang
                const tz = j / NZ;
                const z = Z0 + (Z1 - Z0) * tz * tz * 0.55 + (Z1 - Z0) * tz * 0.45;
                const x = X0 + (X1 - X0) * (i / NX);
                row.push([x, H(x, z), z]);
            }
            P.push(row);
        }
        const R = rng(31);
        const pos = [], col = [];
        const tmp = new THREE.Color();
        const tri = (a, b, c) => {
            pos.push(...a, ...b, ...c);
            const y = (a[1] + b[1] + c[1]) / 3;
            const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
            // kemiringan: beda tinggi / jarak horizontal
            const span = Math.max(1, Math.hypot(b[0] - a[0], b[2] - a[2]), Math.hypot(c[0] - a[0], c[2] - a[2]));
            const slope = (Math.max(a[1], b[1], c[1]) - Math.min(a[1], b[1], c[1])) / span;
            const snowLine = 72 + 12 * Math.sin(cx / 37) + (R() - 0.5) * 10;
            const ld = Math.hypot((cx - LAKE.x) / LAKE.rx, (cz - LAKE.z) / LAKE.rz);
            if (ld < 1.0 && y < LAKE.y + 0.4) tmp.copy(C.ice);
            else if (y > snowLine) tmp.copy(slope > 1.25 ? C.snowB : C.snow);
            else if (y > snowLine - 22) tmp.copy(slope > 0.7 ? C.rockD : C.rock);
            else if (y > 30) tmp.copy(slope > 0.9 ? C.rock : C.alpine);
            else tmp.copy(R() < 0.5 ? C.grass : C.grass2);
            const dist = Math.hypot(cx, cz);
            tmp.lerp(haze, Math.min(0.25, Math.max(0, (dist - 400) / 900))); // kabut scene menambah sisanya
            for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
        };
        for (let j = 0; j < NZ; j++) {
            for (let i = 0; i < NX; i++) {
                const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i], d = P[j + 1][i + 1];
                if ((i + j) & 1) { tri(a, c, b); tri(b, c, d); } else { tri(a, c, d); tri(a, d, b); }
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.computeVertexNormals(); // non-indexed -> flat shaded
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
        mesh.name = 'snow_valley_terrain';
        mesh.receiveShadow = true;
        mesh.userData.noBatch = true;
        this.group.add(mesh);
    }

    buildPines() {
        // Geometri pinus satuan (tinggi ±1): batang + 3 tingkat daun + topi salju, ber-vertex-color
        const parts = [
            [new THREE.CylinderGeometry(0.05, 0.07, 0.25, 5).translate(0, 0.125, 0), 0x5B3A24],
            [new THREE.ConeGeometry(0.34, 0.42, 7).translate(0, 0.38, 0), 0x2F5A34],
            [new THREE.ConeGeometry(0.27, 0.36, 7).translate(0, 0.6, 0), 0x356338],
            [new THREE.ConeGeometry(0.19, 0.3, 7).translate(0, 0.8, 0), 0x3B6B3C],
            [new THREE.ConeGeometry(0.11, 0.16, 7).translate(0, 0.93, 0), 0xEEF4F8]
        ];
        const pos = [], nrm = [], col = [];
        for (const [g0, hex] of parts) {
            const g = g0.toNonIndexed();
            const c = lin(hex);
            const p = g.attributes.position.array, n = g.attributes.normal.array;
            for (let i = 0; i < p.length; i += 3) {
                pos.push(p[i], p[i + 1], p[i + 2]);
                nrm.push(n[i], n[i + 1], n[i + 2]);
                col.push(c.r, c.g, c.b);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

        // Sebar pinus: lantai lembah & lereng bawah (di bawah garis salju), hindari danau
        const R = rng(77);
        const spots = [];
        for (let tries = 0; tries < 9000 && spots.length < 900; tries++) {
            const x = X0 + 30 + R() * (X1 - X0 - 60);
            const z = Z0 + 14 + Math.pow(R(), 1.3) * 420;
            const y = snowValleyHeight(x, z);
            if (y > 70) continue;
            const ld = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
            if (ld < 1.25) continue;
            // kemiringan lokal
            const s = Math.abs(snowValleyHeight(x + 3, z) - snowValleyHeight(x - 3, z)) + Math.abs(snowValleyHeight(x, z + 3) - snowValleyHeight(x, z - 3));
            if (s > 7) continue;
            // kerapatan: rumpun hutan (noise) agar ada padang terbuka di lembah
            const clump = Math.sin(x / 41) * Math.cos(z / 29) + 0.6 * Math.sin((x + z) / 17);
            if (clump < -0.35 && R() < 0.85) continue;
            spots.push([x, y, z]);
        }

        const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
        inst.name = 'snow_valley_pines';
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const c = new THREE.Color();
        const snowy = lin(0xE8F0F5), green = new THREE.Color(1, 1, 1);
        spots.forEach(([x, y, z], k) => {
            const hgt = 7 + R() * 9;
            sc.set(hgt * (0.85 + R() * 0.3), hgt, hgt * (0.85 + R() * 0.3));
            q.setFromAxisAngle(up, R() * Math.PI * 2);
            p.set(x, y + 0.02, z);
            m.compose(p, q, sc);
            inst.setMatrixAt(k, m);
            // Makin tinggi makin tertutup salju; sedikit variasi gelap-terang
            const t = Math.min(1, Math.max(0, (y - 25) / 45));
            c.copy(green).multiplyScalar(0.82 + R() * 0.3).lerp(snowy, t * 0.75);
            inst.setColorAt(k, c);
        });
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.castShadow = false;
        inst.receiveShadow = false;
        // Bounding untuk culling (InstancedMesh r128 memakai bounding geometri satuan)
        inst.frustumCulled = false;
        this.group.add(inst);
        this.pineCount = spots.length;
    }
}
