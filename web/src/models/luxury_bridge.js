/**
 * AUDIRA-LAND: Jembatan AUDIRA LAND (landmark penghubung Desa Have <-> Have-Not)
 *
 * Jembatan kabel (cable-stayed) mewah melintasi sungai 32 m:
 *  - Geladak 12 m: jalur kendaraan aspal di tengah + promenade batu krem di kedua sisi.
 *  - Dua menara pilon kembar (gaya gapura: kaki terakota, sabuk emas, mahkota/mustaka emas)
 *    di kedua tepi sungai, dihubungkan balok bertuliskan nama jembatan.
 *  - Kabel kipas emas dari puncak pilon ke tepi geladak.
 *  - Pagar balustrade krem dengan pegangan emas, lampu hias tiap 4 m yang menyala saat malam,
 *    dan lampu sorot hangat di kaki pilon.
 *  - Pilar beton lengkung di air.
 * Semua primitif biasa -> dilebur bersama grid oleh bakeStatic (sedikit draw call).
 * Zero-Submerging: seluruh bagian berdiri di atas geladak/tanggul; hanya pilar air yang bertumpu di dasar sungai.
 */

import { protectMaterial } from '../core/static_batcher.js';

const lin = hex => new THREE.Color(hex).convertSRGBToLinear();

export function buildLuxuryBridge(group, posZ, riverMinX, riverMaxX, opts = {}) {
    const g = new THREE.Group();
    g.name = `luxury_bridge_z_${posZ}`;

    const M = {
        asphalt: new THREE.MeshLambertMaterial({ color: lin(0x3A3C42) }),
        stone: new THREE.MeshLambertMaterial({ color: lin(0xD9CCB4) }),
        stoneDark: new THREE.MeshLambertMaterial({ color: lin(0xA8987E) }),
        terracotta: new THREE.MeshLambertMaterial({ color: lin(0xA9452F) }),
        gold: new THREE.MeshLambertMaterial({ color: lin(0xD9A527) }),
        cable: new THREE.MeshLambertMaterial({ color: lin(0xE2C26A) }),
        white: new THREE.MeshBasicMaterial({ color: lin(0xF4EEE2) }),
        lamp: opts.lampMat || new THREE.MeshBasicMaterial({ color: 0xB8B2A6 })
    };
    protectMaterial(M.lamp); // menyala malam via setNight
    const add = (geo, mat, x, y, z, opts = {}) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (opts.rx) m.rotation.x = opts.rx;
        if (opts.ry) m.rotation.y = opts.ry;
        if (opts.rz) m.rotation.z = opts.rz;
        m.castShadow = opts.cast !== false;
        m.receiveShadow = true;
        g.add(m);
        return m;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    const cx = (riverMinX + riverMaxX) / 2;
    const L = riverMaxX - riverMinX + 4;        // 36 m, bertumpu di tanggul
    const roadW = opts.roadW || 5.6;            // jalur aspal (arteri lebih lebar)
    const W = roadW + 6.4;                      // lebar total (12 m untuk jalur 5,6 m)
    const walkW = (W - roadW) / 2 - 0.3;
    const deckTop = 0.36;

    // ---- Geladak ----
    add(box(L, 0.5, W), M.stoneDark, cx, deckTop - 0.25 - 0.02, posZ);                 // badan geladak
    add(box(L, 0.04, roadW), M.asphalt, cx, deckTop + 0.0, posZ, { cast: false });     // aspal
    for (const s of [-1, 1]) {
        const zc = posZ + s * (roadW / 2 + walkW / 2);
        add(box(L, 0.18, walkW), M.stone, cx, deckTop + 0.07, zc, { cast: false });    // promenade (lebih tinggi = trotoar)
        add(box(L, 0.2, 0.18), M.gold, cx, deckTop + 0.08, posZ + s * roadW / 2, { cast: false }); // kerb emas
    }
    // Marka tengah putus-putus
    for (let x = riverMinX; x < riverMaxX; x += 3) {
        add(box(1.6, 0.01, 0.15), M.white, x + 0.8, deckTop + 0.03, posZ, { cast: false });
    }
    // Lengkung hias di sisi geladak (fascia bergelombang)
    for (const s of [-1, 1]) {
        for (let k = 0; k < 8; k++) {
            const x = riverMinX + 2 + k * ((L - 8) / 7);
            const arch = new THREE.TorusGeometry(1.6, 0.12, 6, 14, Math.PI);
            add(arch, M.gold, x, deckTop - 0.5, posZ + s * (W / 2 + 0.05), { cast: false, rx: Math.PI });
        }
    }

    // ---- Pilar air (bertumpu di dasar sungai) ----
    for (const px of [cx - 7, cx + 7]) {
        for (const s of [-1, 1]) {
            add(new THREE.CylinderGeometry(0.75, 0.95, 0.9, 10), M.stoneDark, px, -0.2, posZ + s * 3.6);
        }
    }

    // ---- Balustrade + lampu hias ----
    const lampHeads = [];
    for (const s of [-1, 1]) {
        const zr = posZ + s * (W / 2 - 0.2);
        add(box(L, 0.12, 0.22), M.gold, cx, deckTop + 1.05, zr);                     // pegangan emas
        add(box(L, 0.1, 0.16), M.stone, cx, deckTop + 0.3, zr, { cast: false });      // ambang bawah
        for (let x = riverMinX - 1.5; x <= riverMaxX + 1.5; x += 0.8) {
            add(new THREE.CylinderGeometry(0.06, 0.08, 0.72, 6), M.stone, x, deckTop + 0.66, zr, { cast: false }); // baluster
        }
        for (let x = riverMinX; x <= riverMaxX + 0.01; x += 4) {
            add(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 8), M.terracotta, x, deckTop + 1.6, zr);   // tiang lampu
            add(new THREE.SphereGeometry(0.26, 10, 8), M.lamp, x, deckTop + 3.35, zr, { cast: false }); // bola lampu
            add(new THREE.ConeGeometry(0.3, 0.3, 8), M.gold, x, deckTop + 3.7, zr);                   // tudung emas
            lampHeads.push([x, deckTop + 3.35, zr]);
        }
    }

    // ---- Menara pilon kembar (di kedua tepi sungai) ----
    const pylonH = 22;
    const pylonX = [riverMinX + 2.2, riverMaxX - 2.2];
    for (const px of pylonX) {
        for (const s of [-1, 1]) {
            const pz = posZ + s * (W / 2 + 0.9);
            add(box(1.6, 1.6, 1.6), M.stoneDark, px, deckTop + 0.2, pz);                           // umpak (bertumpu di dasar sungai)
            add(box(1.1, pylonH, 1.1), M.terracotta, px, deckTop + 1.0 + pylonH / 2, pz);           // badan
            for (const h of [6, 12, 18]) add(box(1.3, 0.35, 1.3), M.gold, px, deckTop + 1.0 + h, pz); // sabuk emas
            // Mahkota/mustaka: tumpang bertingkat + bola emas
            add(box(1.6, 0.5, 1.6), M.gold, px, deckTop + 1.25 + pylonH, pz);
            add(new THREE.ConeGeometry(0.95, 1.6, 4), M.terracotta, px, deckTop + 2.3 + pylonH, pz, { ry: Math.PI / 4 });
            add(new THREE.SphereGeometry(0.32, 10, 8), M.gold, px, deckTop + 3.3 + pylonH, pz);
        }
        // Balok penghubung atas (gapura) + balok tengah
        add(box(1.0, 1.4, W + 1.8), M.terracotta, px, deckTop + 1.0 + pylonH - 2.2, posZ);
        add(box(1.06, 0.25, W + 1.9), M.gold, px, deckTop + 1.0 + pylonH - 1.4, posZ);
        add(box(0.9, 0.9, W + 1.8), M.terracotta, px, deckTop + 9.0, posZ);
    }

    // ---- Kabel kipas: dari puncak pilon ke tepi geladak ke arah tengah sungai ----
    const up = new THREE.Vector3(0, 1, 0);
    const cableGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 5);
    const addCable = (a, b) => {
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        const m = new THREE.Mesh(cableGeo, M.cable);
        m.scale.set(1, len, 1);
        m.position.copy(a).addScaledVector(dir, 0.5);
        m.quaternion.setFromUnitVectors(up, dir.normalize());
        m.castShadow = true;
        g.add(m);
    };
    for (const px of pylonX) {
        const toward = Math.sign(cx - px);
        for (const s of [-1, 1]) {
            const pz = posZ + s * (W / 2 + 0.9);
            for (let k = 0; k < 5; k++) {
                const anchorX = px + toward * (2.5 + k * 2.6);
                const topY = deckTop + 1.0 + pylonH - 3.0 - k * 1.3;
                addCable(new THREE.Vector3(px, topY, pz), new THREE.Vector3(anchorX, deckTop + 1.1, posZ + s * (W / 2 - 0.2)));
                // Kabel balik ke daratan (penyeimbang)
                if (k < 3) addCable(new THREE.Vector3(px, topY, pz), new THREE.Vector3(px - toward * (2.0 + k * 1.2), deckTop + 1.1, posZ + s * (W / 2 - 0.2)));
            }
        }
    }

    // ---- Papan nama di balok atas (dua sisi) ----
    if (opts.sign !== false) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const x2 = c.getContext('2d');
    x2.fillStyle = '#7E3121'; x2.fillRect(0, 0, 512, 96);
    x2.strokeStyle = '#E9B83A'; x2.lineWidth = 6; x2.strokeRect(6, 6, 500, 84);
    x2.fillStyle = '#FBE7B0'; x2.textAlign = 'center';
    // maxWidth 480: teks dipadatkan agar tidak terpotong bingkai papan
    x2.font = 'bold 40px Georgia, serif'; x2.fillText('JEMBATAN AUDIRA LAND', 256, 50, 480);
    x2.font = 'bold 20px Georgia, serif'; x2.fillText('DESA HAVE  ⇄  DESA HAVE-NOT', 256, 80, 480);
    const tex = new THREE.CanvasTexture(c);
    const signMat = new THREE.MeshBasicMaterial({ map: tex });
    for (const px of pylonX) {
        for (const s of [-1, 1]) {
            const plane = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, (W - 1) * 96 / 512), signMat);
            plane.position.set(px + s * 0.53, deckTop + 1.0 + pylonH - 2.2, posZ);
            plane.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
            g.add(plane);
        }
    }
    }

    // ---- Cahaya malam: halo lampu & sorot pilon (Points additive, 1 draw call) ----
    if (opts.glowPts) {
        // Mode set: titik cahaya dikumpulkan pemanggil -> satu Points untuk semua jembatan
        lampHeads.forEach(p => opts.glowPts.push(...p));
        for (const px of pylonX) for (const s of [-1, 1]) for (const h of [4, 10, 16, 22]) opts.glowPts.push(px, deckTop + 1 + h, posZ + s * (W / 2 + 0.9));
        group.add(g);
        return { setNight() {} };
    }
    const glowC = document.createElement('canvas');
    glowC.width = glowC.height = 64;
    const gg = glowC.getContext('2d');
    const rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,240,200,1)');
    rg.addColorStop(0.3, 'rgba(255,200,120,0.55)');
    rg.addColorStop(1, 'rgba(255,170,80,0)');
    gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
    const pts = [];
    lampHeads.forEach(p => pts.push(...p));
    for (const px of pylonX) for (const s of [-1, 1]) for (const h of [4, 10, 16, 22]) pts.push(px, deckTop + 1 + h, posZ + s * (W / 2 + 0.9));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const glow = new THREE.Points(geo, new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(glowC), size: 3.2, sizeAttenuation: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glow.visible = false;
    glow.renderOrder = 4;
    glow.userData.noBatch = true;
    g.add(glow);

    group.add(g);
    return {
        setNight(isNight) {
            M.lamp.color.setHex(isNight ? 0xFFE6A8 : 0xB8B2A6);
            glow.visible = isNight;
        }
    };
}

/**
 * Jembatan gaya Gotong Royong di SEMUA penyeberangan sungai.
 * @param crossings [{ z, w, landmark?, span? }] - z tengah jalan, w lebar jalan, span selisih z ujung
 *                  barat/timur (gang yang berselisih 1 petak). Entri berjarak < 10 m digabung jadi
 *                  satu jembatan lebar (mis. arteri dua lajur).
 * Lampu memakai satu material bersama (protected) dan cahaya malam satu Points -> draw call tetap kecil;
 * primitif lain dilebur bakeStatic bersama grid. Papan nama hanya di jembatan landmark.
 * Tiap ujung jalan diberi penanda `bridge_z_<z>` agar perahu nelayan menghindar.
 */
export function buildBridgeSet(group, crossings, riverMinX, riverMaxX) {
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xB8B2A6 });
    protectMaterial(lampMat);
    const glowPts = [];
    const list = crossings.map(c => ({ ...c, z0: c.z - (c.span || 0) / 2 - c.w / 2, z1: c.z + (c.span || 0) / 2 + c.w / 2 }))
        .sort((a, b) => a.z - b.z);
    const groups = [];
    for (const c of list) {
        const last = groups[groups.length - 1];
        if (last && c.z - last[last.length - 1].z < 10) last.push(c); else groups.push([c]);
    }
    let landmarkZ;
    for (const gr of groups) {
        const z0 = Math.min(...gr.map(c => c.z0)), z1 = Math.max(...gr.map(c => c.z1));
        const isGang = gr.every(c => c.span !== undefined);
        const landmark = gr.some(c => c.landmark);
        const posZ = Math.round(((z0 + z1) / 2) * 100) / 100;
        const roadW = isGang ? 5.6 : Math.max(5.6, z1 - z0);
        buildLuxuryBridge(group, posZ, riverMinX, riverMaxX, { roadW, sign: landmark, lampMat, glowPts });
        if (landmark) landmarkZ = posZ;
        for (const c of gr) {
            for (const z of new Set([c.z - (c.span || 0) / 2, c.z + (c.span || 0) / 2])) {
                const tag = new THREE.Object3D();
                tag.name = `bridge_z_${Math.round(z)}`;
                tag.position.set((riverMinX + riverMaxX) / 2, 0.3, z);
                group.add(tag);
            }
        }
    }

    const glowC = document.createElement('canvas');
    glowC.width = glowC.height = 64;
    const gg = glowC.getContext('2d');
    const rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,240,200,1)');
    rg.addColorStop(0.3, 'rgba(255,200,120,0.55)');
    rg.addColorStop(1, 'rgba(255,170,80,0)');
    gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
    const glow = new THREE.Points(geo, new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(glowC), size: 3.2, sizeAttenuation: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glow.name = 'bridge_glow';
    glow.visible = false;
    glow.renderOrder = 4;
    glow.userData.noBatch = true;
    group.add(glow);

    return {
        landmarkZ,
        setNight(isNight) {
            lampMat.color.setHex(isNight ? 0xFFE6A8 : 0xB8B2A6);
            glow.visible = isNight;
        }
    };
}
