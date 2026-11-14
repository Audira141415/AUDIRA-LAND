/* global THREE */
/**
 * AUDIRA-LAND: Alun-Alun Gotong Royong — alun-alun megah di atas sungai perbatasan Have / Have-Not.
 *
 * Tepi sungai kedua desa sudah penuh kavling warga, jadi alun-alun dibangun DI ATAS sungai
 * (x -16..16), di antara jembatan z -84 dan jembatan landmark z 4, diapit huruf raksasa
 * "DESA HAVE" / "DESA HAVE-NOT" (z -39..-1). Sungai tetap mengalir membelah alun-alun:
 *  - Dua pelataran batu (barat = sisi Have, timur = sisi Have-Not) bertumpu pada pilar di air,
 *    dipisah alur sungai terbuka 8 m di tengah, disambung 3 jembatan lengkung kecil.
 *  - Pulau bundar di tengah alur (z -41) dengan TUGU GOTONG ROYONG ~28 m (undakan, tiang bersabuk
 *    emas, cawan + mahkota api emas) dikelilingi kolam & air mancur melingkar.
 *  - Pendopo joglo kembar (z -60) dan beringin kembar berpagar bundar (z -22), khas alun-alun Jawa.
 *  - Barisan palem raja + umbul-umbul di tepi luar, bangku, pot pohon peneduh, lampu taman.
 *  - Gapura candi bentar 13 m di kedua ujung + balok bertuliskan "ALUN-ALUN GOTONG ROYONG".
 * Draw call: 1 mesh statis (vertex color) + 1 lampu (Basic) + 1 papan nama + 1 pancaran air.
 * Penanda `bridge_z_<z>` di kedua ujung agar perahu nelayan tidak menembus pelataran.
 */
import { mergeColored } from './water_life.js';
import { onWaterTick } from '../core/water.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

export const ALUN = { z0: -74, z1: -8, xIn: 4, xOut: 16.4, top: 0.45 };

const COL = {
    deck: 0xA8987E, pave: 0xE3D6BC, paveD: 0xCDBB98, kerb: 0xA9452F, gold: 0xD9A527,
    stone: 0xD9CCB4, terracotta: 0xA9452F, brick: 0x8E3B27, pier: 0x6B6458,
    trunk: 0x5A3B26, leaf: 0x2F5F2C, leaf2: 0x3C7034, grass: 0x5E9446,
    wood: 0x8A5A35, water: 0x4BA3C7, white: 0xF4EEE2
};
const FLAG = [0xD7263D, 0xF4EEE2, 0xF2B134, 0x1B998B, 0x2E86AB];

export class AlunAlun {
    constructor(scene) {
        const A = ALUN;
        const parts = [], lamps = [];
        const rnd = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
        const box = (sx, sy, sz, x, y, z, hex, ry = 0) => {
            const g = new THREE.BoxGeometry(sx, sy, sz);
            if (ry) g.rotateY(ry);
            parts.push({ geo: g.translate(x, y, z), hex });
        };
        const cyl = (r0, r1, h, x, y, z, hex, seg = 10) =>
            parts.push({ geo: new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), hex });
        const ico = (r, x, y, z, hex) => parts.push({ geo: new THREE.IcosahedronGeometry(r, 0).translate(x, y, z), hex });
        const T = A.top;
        const len = A.z1 - A.z0, zc = (A.z0 + A.z1) / 2;
        const sides = [-1, 1];

        for (const s of sides) {
            const xi = s * A.xIn, xo = s * A.xOut, xm = (xi + xo) / 2, w = Math.abs(xo - xi);
            // ---- Pelataran: badan + paving catur + kerb ----
            box(w, 0.5, len, xm, T - 0.25, zc, COL.deck);
            box(w - 0.6, 0.03, len - 0.6, xm, T + 0.015, zc, COL.pave);
            for (let z = A.z0 + 1.3; z < A.z1 - 1; z += 2) {
                for (let x = Math.min(xi, xo) + 1.3; x < Math.max(xi, xo) - 1; x += 2) {
                    if ((Math.round((x + 40) / 2) + Math.round((z + 100) / 2)) % 2) box(1.9, 0.02, 1.9, x, T + 0.035, z, COL.paveD);
                }
            }
            box(0.3, 0.22, len, xi + s * 0.15, T + 0.11, zc, COL.kerb);           // kerb tepi alur
            for (const z of [A.z0 + 0.15, A.z1 - 0.15]) box(w, 0.22, 0.3, xm, T + 0.11, z, COL.kerb);
            // Pilar di air
            for (let z = A.z0 + 4; z < A.z1 - 2; z += 9) for (const x of [xi + s * 2.5, xo - s * 3.5]) cyl(0.55, 0.65, 0.9, x, -0.25, z, COL.pier, 8);

            // ---- Pagar balustrade di tepi alur (terputus di jembatan kecil) ----
            const gaps = [-60, -22];
            for (let z = A.z0 + 0.6; z < A.z1 - 0.5; z += 0.9) {
                if (gaps.some(g => Math.abs(z - g) < 2) || Math.abs(z + 41) < 8.6) continue;
                cyl(0.06, 0.08, 0.7, xi + s * 0.25, T + 0.35, z, COL.stone, 6);
            }
            for (const [a, b] of [[A.z0 + 0.4, -62], [-58, -49.5], [-32.5, -24], [-20, A.z1 - 0.4]]) {
                box(0.18, 0.1, b - a, xi + s * 0.25, T + 0.75, (a + b) / 2, COL.gold);
            }

            // ---- Beringin kembar berpagar bundar ----
            const bx = s * 10.2, bz = -22;
            cyl(3.3, 3.4, 0.55, bx, T + 0.27, bz, COL.stone, 18);
            cyl(3.0, 3.0, 0.58, bx, T + 0.3, bz, COL.grass, 18);
            for (let k = 0; k < 16; k++) {
                const a = (k / 16) * Math.PI * 2;
                cyl(0.07, 0.07, 1.0, bx + Math.cos(a) * 3.3, T + 1.0, bz + Math.sin(a) * 3.3, COL.terracotta, 5);
            }
            cyl(0.6, 0.9, 5.2, bx, T + 3.1, bz, COL.trunk, 8);
            for (let k = 0; k < 7; k++) {                                        // akar gantung
                const a = (k / 7) * Math.PI * 2 + 0.3;
                cyl(0.06, 0.08, 3.6, bx + Math.cos(a) * 1.9, T + 2.4, bz + Math.sin(a) * 1.9, COL.trunk, 4);
            }
            for (let k = 0; k < 11; k++) {
                const a = (k / 11) * Math.PI * 2;
                const r = k === 0 ? 0 : 2.4 + rnd() * 0.9;
                ico(2.0 + rnd() * 0.8, bx + Math.cos(a) * r, T + 6.6 + rnd() * 1.4, bz + Math.sin(a) * r * 0.9, k % 2 ? COL.leaf : COL.leaf2);
            }
            ico(2.4, bx, T + 8.4, bz, COL.leaf2);

            // ---- Pendopo joglo (z -60) ----
            {
                const px = s * 10.2, pz = -60;
                box(9.4, 0.7, 9.4, px, T + 0.35, pz, COL.stone);
                box(8.6, 0.05, 8.6, px, T + 0.72, pz, COL.paveD);
                box(1.0, 0.35, 3.0, px - s * 5.1, T + 0.17, pz, COL.stone);   // anak tangga
                for (const ix of [-3.6, -1.2, 1.2, 3.6]) {
                    for (const iz of [-3.6, -1.2, 1.2, 3.6]) {
                        const inner = Math.abs(ix) < 2 && Math.abs(iz) < 2;     // saka guru lebih tinggi
                        const h = inner ? 5.6 : 3.6;
                        box(0.5, 0.3, 0.5, px + ix, T + 0.85, pz + iz, COL.stone);
                        cyl(0.17, 0.2, h, px + ix, T + 0.7 + h / 2, pz + iz, COL.wood, 8);
                        box(0.42, 0.18, 0.42, px + ix, T + 0.7 + h, pz + iz, COL.gold);
                    }
                }
                // atap: emper landai + brunjung curam + mustaka emas
                parts.push({ geo: new THREE.ConeGeometry(7.6, 2.2, 4).rotateY(Math.PI / 4).translate(px, T + 5.4, pz), hex: COL.terracotta });
                parts.push({ geo: new THREE.ConeGeometry(3.4, 4.2, 4).rotateY(Math.PI / 4).translate(px, T + 8.1, pz), hex: COL.terracotta });
                box(5.0, 0.2, 0.2, px, T + 6.3, pz + 2.45, COL.gold);
                box(5.0, 0.2, 0.2, px, T + 6.3, pz - 2.45, COL.gold);
                cyl(0.12, 0.3, 1.2, px, T + 10.6, pz, COL.gold, 8);
                ico(0.35, px, T + 11.4, pz, COL.gold);
            }

            // ---- Bangku & pot peneduh ----
            for (const z of [-68, -52, -30, -14]) {
                for (const x of [s * 6.2, s * 14.2]) {
                    box(0.5, 0.08, 2.0, x, T + 0.45, z, COL.wood);
                    for (const dz of [-0.8, 0.8]) box(0.4, 0.42, 0.12, x, T + 0.21, z + dz, COL.brick);
                }
            }
            for (const z of [-50, -32]) {
                const x = s * 14;
                cyl(0.9, 0.7, 0.8, x, T + 0.4, z, COL.terracotta, 10);
                cyl(0.14, 0.18, 2.2, x, T + 1.5, z, COL.trunk, 6);
                ico(1.5, x, T + 3.2, z, COL.leaf2);
            }

            // ---- Palem raja menjulang di tepi luar ----
            for (let z = A.z0 + 6; z < A.z1 - 3; z += 6) {
                const x = xo - s * 1.4, h = 11 + (Math.abs(z * 7) % 3);
                cyl(0.55, 0.65, 0.5, x, T + 0.25, z, COL.stone, 8);
                cyl(0.2, 0.3, h, x, T + h / 2, z, 0x9C9488, 7);
                cyl(0.24, 0.22, 1.2, x, T + h - 0.2, z, 0x5E8C3A, 7);              // pelepah hijau
                for (let k = 0; k < 7; k++) {
                    const a = (k / 7) * Math.PI * 2 + z;
                    const g = new THREE.BoxGeometry(3.4, 0.06, 0.55);
                    g.translate(1.6, 0, 0).rotateZ(-0.42).rotateY(a);
                    parts.push({ geo: g.translate(x, T + h + 0.4, z), hex: k % 2 ? COL.leaf2 : 0x4C8A3A });
                }
            }

            // ---- Umbul-umbul di tepi luar ----
            let f = 0;
            for (let z = A.z0 + 3; z < A.z1 - 2; z += 6) {
                const x = xo - s * 0.5;
                cyl(0.06, 0.08, 7, x, T + 3.5, z, COL.white, 5);
                box(0.05, 3.2, 0.7, x, T + 4.9, z + 0.4, FLAG[f++ % FLAG.length]);
            }

            // ---- Lampu taman ----
            for (let z = A.z0 + 2; z < A.z1 - 1; z += 8) {
                for (const x of [xi + s * 1.3, xo - s * 1.6]) {
                    cyl(0.08, 0.12, 3.2, x, T + 1.6, z, COL.terracotta, 6);
                    cyl(0.32, 0.05, 0.25, x, T + 3.55, z, COL.gold, 8);
                    lamps.push({ geo: new THREE.SphereGeometry(0.24, 8, 6).translate(x, T + 3.35, z), hex: 0xFFE3A3 });
                }
            }

            // ---- Gapura candi di kedua ujung (2 menara per pelataran per ujung) ----
            for (const gz of [A.z0 + 0.8, A.z1 - 0.8]) {
                for (const gx of [s * 5.4, s * 15.2]) {
                    box(2.6, 1.2, 2.6, gx, T + 0.6, gz, COL.stone);
                    box(2.0, 9.0, 2.0, gx, T + 5.7, gz, COL.terracotta);
                    for (const h of [2.6, 5.2, 7.8, 10.2]) box(2.3, 0.35, 2.3, gx, T + h, gz, COL.gold);
                    box(1.7, 1.2, 1.7, gx, T + 11.0, gz, COL.terracotta);
                    box(1.3, 1.0, 1.3, gx, T + 12.1, gz, COL.brick);
                    box(0.9, 0.8, 0.9, gx, T + 13.0, gz, COL.terracotta);
                    ico(0.55, gx, T + 13.8, gz, COL.gold);
                }
            }
        }

        // ---- Balok gapura melintang seluruh alun-alun (di atas alur sungai) ----
        for (const gz of [A.z0 + 0.8, A.z1 - 0.8]) {
            box(31.6, 2.0, 1.2, 0, T + 10.6, gz, COL.brick);
            box(31.8, 0.3, 1.3, 0, T + 11.75, gz, COL.gold);
            box(31.8, 0.3, 1.3, 0, T + 9.45, gz, COL.gold);
        }

        // ---- Jembatan lengkung kecil di atas alur (3 buah) ----
        for (const bz of [-60, -22]) {
            const segs = 7, span = A.xIn * 2 + 0.6;
            for (let k = 0; k < segs; k++) {
                const t0 = k / segs, t1 = (k + 1) / segs;
                const x0 = -span / 2 + span * t0, x1 = -span / 2 + span * t1;
                const y0 = T + Math.sin(t0 * Math.PI) * 0.9, y1 = T + Math.sin(t1 * Math.PI) * 0.9;
                const g = new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.05, 0.22, 3.0);
                g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
                parts.push({ geo: g.translate((x0 + x1) / 2, (y0 + y1) / 2 - 0.05, bz), hex: COL.stone });
                for (const dz of [-1.45, 1.45]) {
                    const r = new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0) + 0.05, 0.1, 0.12);
                    r.rotateZ(Math.atan2(y1 - y0, x1 - x0));
                    parts.push({ geo: r.translate((x0 + x1) / 2, (y0 + y1) / 2 + 0.75, bz + dz), hex: COL.gold });
                    parts.push({ geo: new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5).translate(x0, y0 + 0.4, bz + dz), hex: COL.stone });
                }
            }
        }

        // ---- Pulau bundar + TUGU GOTONG ROYONG di tengah alur (z -41) ----
        {
            const cz = -41, R = 8.5;
            cyl(R, R, 0.5, 0, T - 0.25, cz, COL.deck, 32);
            cyl(R - 0.3, R - 0.3, 0.03, 0, T + 0.015, cz, COL.pave, 32);
            for (let k = 0; k < 8; k++) {                                        // pilar pulau
                const a = (k / 8) * Math.PI * 2;
                cyl(0.6, 0.7, 0.9, Math.cos(a) * (R - 1.5), -0.25, cz + Math.sin(a) * (R - 1.5), COL.pier, 8);
            }
            for (let k = 0; k < 64; k++) {                                       // pagar keliling, terbuka ke pelataran
                const a = (k / 64) * Math.PI * 2;
                if (Math.abs(Math.cos(a)) > 0.88) continue;
                cyl(0.06, 0.08, 0.7, Math.cos(a) * (R - 0.2), T + 0.35, cz + Math.sin(a) * (R - 0.2), COL.stone, 6);
            }
            cyl(6.0, 6.0, 0.5, 0, T + 0.25, cz, COL.stone, 32);                  // kolam melingkar
            cyl(5.6, 5.6, 0.52, 0, T + 0.27, cz, COL.water, 32);
            for (let k = 0; k < 8; k++) {                                        // 8 nosel
                const a = (k / 8) * Math.PI * 2;
                cyl(0.18, 0.25, 0.7, Math.cos(a) * 5.2, T + 0.6, cz + Math.sin(a) * 5.2, COL.gold, 8);
            }
            cyl(3.6, 3.8, 0.8, 0, T + 0.4, cz, COL.stone, 8);                    // undakan
            cyl(2.9, 3.1, 0.8, 0, T + 1.2, cz, COL.deck, 8);
            box(3.4, 3.6, 3.4, 0, T + 3.4, cz, COL.white);
            box(3.7, 0.4, 3.7, 0, T + 5.3, cz, COL.gold);
            box(3.7, 0.4, 3.7, 0, T + 1.75, cz, COL.gold);
            for (const [dx, dz] of [[1.72, 0], [-1.72, 0], [0, 1.72], [0, -1.72]]) {   // relief terakota
                box(dz ? 2.2 : 0.06, 2.2, dz ? 0.06 : 2.2, dx, T + 3.4, cz + dz, COL.terracotta);
            }
            parts.push({ geo: new THREE.CylinderGeometry(0.85, 1.35, 17, 4).rotateY(Math.PI / 4).translate(0, T + 14.0, cz), hex: COL.white });
            for (const h of [8.5, 13, 17.5, 21.5]) {
                const r = 1.35 - ((h - 5.5) / 17) * 0.5;
                parts.push({ geo: new THREE.CylinderGeometry(r + 0.12, r + 0.14, 0.4, 4).rotateY(Math.PI / 4).translate(0, T + h, cz), hex: COL.gold });
            }
            cyl(2.0, 0.7, 1.1, 0, T + 23.0, cz, COL.gold, 12);                   // cawan
            cyl(2.05, 2.05, 0.15, 0, T + 23.6, cz, COL.terracotta, 12);
            parts.push({ geo: new THREE.ConeGeometry(1.1, 3.4, 7).translate(0, T + 25.3, cz), hex: 0xF2B134 });   // api emas
            parts.push({ geo: new THREE.ConeGeometry(0.6, 2.0, 6).translate(0.5, T + 24.9, cz + 0.3), hex: 0xE8892B });
            parts.push({ geo: new THREE.ConeGeometry(0.5, 1.8, 6).translate(-0.45, T + 24.8, cz - 0.35), hex: 0xE8892B });
            for (let k = 0; k < 8; k++) {                                        // lampu pulau
                const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
                const x = Math.cos(a) * (R - 1.0), z = cz + Math.sin(a) * (R - 1.0);
                cyl(0.08, 0.12, 3.2, x, T + 1.6, z, COL.terracotta, 6);
                cyl(0.32, 0.05, 0.25, x, T + 3.55, z, COL.gold, 8);
                lamps.push({ geo: new THREE.SphereGeometry(0.24, 8, 6).translate(x, T + 3.35, z), hex: 0xFFE3A3 });
            }
        }

        this.group = new THREE.Group();
        this.group.name = 'alun_alun';
        const mesh = new THREE.Mesh(mergeColored(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
        mesh.name = 'alun_alun_static';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        const lampMesh = new THREE.Mesh(mergeColored(lamps), new THREE.MeshBasicMaterial({ vertexColors: true }));
        lampMesh.name = 'alun_alun_lamps';
        this.group.add(lampMesh);

        this.buildSign(T);
        this.buildJets(T);

        // Penanda z untuk perahu (pelataran menutup sungai dari z0 sampai z1)
        for (const z of [A.z0, A.z1]) {
            const tag = new THREE.Object3D();
            tag.name = `bridge_z_${z}`;
            tag.position.set(0, T, z);
            this.group.add(tag);
        }
        scene.add(this.group);
    }

    buildSign(T) {
        const c = document.createElement('canvas');
        c.width = 1024; c.height = 96;
        const x = c.getContext('2d');
        x.fillStyle = '#7E3121'; x.fillRect(0, 0, 1024, 96);
        x.strokeStyle = '#E9B83A'; x.lineWidth = 6; x.strokeRect(6, 6, 1012, 84);
        x.fillStyle = '#FBE7B0'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 54px Georgia, serif';
        x.fillText('ALUN-ALUN AUDIRA LAND', 512, 50);
        const tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const geos = [];
        for (const gz of [ALUN.z0 + 0.8, ALUN.z1 - 0.8]) {
            for (const s of [-1, 1]) {
                const g = new THREE.PlaneGeometry(26, 2.4);
                if (s > 0) g.rotateY(Math.PI);
                geos.push(g.translate(0, T + 10.6, gz + s * 0.62));
            }
        }
        // gabung 4 bidang (geometri sama atribut) -> 1 mesh
        const pos = [], uv = [], nrm = [];
        for (const g0 of geos) {
            const g = g0.toNonIndexed();
            pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); nrm.push(...g.attributes.normal.array);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const m = new THREE.Mesh(geo, mat);
        m.name = 'alun_alun_sign';
        this.group.add(m);
    }

    buildJets(T) {
        // Pancaran air mancur: tetesan beranimasi (parabola) -> 1 InstancedMesh
        const PER = 9, NOZ = 8, cz = -41;
        const n = NOZ * PER;
        const mat = new THREE.MeshLambertMaterial({ color: lin(0xCFEAF5), emissive: lin(0x274A57), transparent: true, opacity: 0.85 });
        const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.15, 0), mat, n);
        inst.name = 'alun_alun_jets';
        inst.frustumCulled = false;
        const drops = [];
        for (let k = 0; k < NOZ; k++) {
            const a = (k / NOZ) * Math.PI * 2;
            for (let j = 0; j < PER; j++) drops.push({ cx: Math.cos(a) * 5.2, cz: cz + Math.sin(a) * 5.2, a: a + Math.PI, ph: j / PER, r: 2.4 });
        }
        const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
        const y0 = T + 0.95;
        const update = (dt, time) => {
            drops.forEach((d, k) => {
                const t = (time * 0.8 + d.ph) % 1;                 // 0..1 lintasan
                const rr = d.r * t;
                p.set(d.cx + Math.cos(d.a) * rr, y0 + 4.2 * t - 4.0 * t * t, d.cz + Math.sin(d.a) * rr);
                sc.setScalar(1 - t * 0.4);
                m.compose(p, q, sc);
                inst.setMatrixAt(k, m);
            });
            inst.instanceMatrix.needsUpdate = true;
        };
        update(0, 0);
        onWaterTick(update);
        this.group.add(inst);
    }
}
