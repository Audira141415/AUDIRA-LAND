const fs = require('fs');
const path = require('path');

const loaderPath = path.resolve(__dirname, '../web/src/models/building_loader.js');
let content = fs.readFileSync(loaderPath, 'utf8');

// 1. Update createMaterials() with solid materials and rich village tokens
const targetMaterials = `            packageGreen: new THREE.MeshLambertMaterial({ color: 0x43A047 }),
            glass: new THREE.MeshLambertMaterial({ color: 0xB2EBF2, transparent: true, opacity: 0.65 }),

            // Tinta Outline
            ink: new THREE.MeshBasicMaterial({ color: PALETTE.INK })
        };`;

const replacementMaterials = `            packageGreen: new THREE.MeshLambertMaterial({ color: 0x43A047, depthWrite: true }),
            // Kaca & Jendela 100% Solid (Anti Tembus Pandang / Zero Ghosting)
            glass: new THREE.MeshLambertMaterial({
                color: 0x475569,
                emissive: 0x000000,
                transparent: false,
                opacity: 1.0,
                depthWrite: true,
                depthTest: true
            }),
            windowGlow: new THREE.MeshLambertMaterial({
                color: 0x475569,
                emissive: 0x000000,
                transparent: false,
                opacity: 1.0,
                depthWrite: true
            }),
            lanternGlow: new THREE.MeshBasicMaterial({ color: 0xFEF08A }),

            // Pekarangan Pedesaan Khas Nusantara
            soilLoam: new THREE.MeshLambertMaterial({ color: 0x452B1E, roughness: 0.95 }),
            stonePath: new THREE.MeshLambertMaterial({ color: 0x94A3B8, roughness: 0.85 }),
            cropGreen: new THREE.MeshLambertMaterial({ color: 0x4ADE80, roughness: 0.8 }),
            chiliRed: new THREE.MeshLambertMaterial({ color: 0xEF4444, roughness: 0.3 }),
            cornYellow: new THREE.MeshLambertMaterial({ color: 0xFACC15, roughness: 0.4 }),
            eggplantPurple: new THREE.MeshLambertMaterial({ color: 0x7E22CE, roughness: 0.4 }),

            // Tinta Outline
            ink: new THREE.MeshBasicMaterial({ color: PALETTE.INK })
        };`;

if (content.includes(targetMaterials)) {
    content = content.replace(targetMaterials, replacementMaterials);
    console.log('[Loader] Berhasil memperbarui createMaterials menjadi solid & berpekarangan!');
}

// 2. Update routing in addBuilding
const targetAddBuildingRoute = `        if (data.stage === 'proyek' || data.stage === 'bangun') {
            const res = this.createConstructionScaffoldMesh(data);
            mesh = res.group;
            billboardObj = res;
        } else if (data.stage === 'sketsa') {
            mesh = this.createSketsaMesh(data);
        } else {
            mesh = this.createBuildingMeshByType(data.type, data);
        }`;

const replacementAddBuildingRoute = `        // 1. Desa Have-Not Selalu Memiliki Suasana Pedesaan Asri & Pekarangan Berkebun
        if (data.is_village_compound || data.is_have === false) {
            mesh = this.createRuralVillageCompoundMesh(data);
        } else if (data.stage === 'proyek' || data.stage === 'bangun') {
            const res = this.createConstructionScaffoldMesh(data);
            mesh = res.group;
            billboardObj = res;
        } else if (data.stage === 'sketsa') {
            mesh = this.createSketsaMesh(data);
        } else {
            mesh = this.createBuildingMeshByType(data.type, data);
        }`;

if (content.includes(targetAddBuildingRoute)) {
    content = content.replace(targetAddBuildingRoute, replacementAddBuildingRoute);
    console.log('[Loader] Berhasil memperbarui routing addBuilding untuk Desa Have-Not!');
}

// 3. Update routing in createBuildingMeshByType
const targetMeshByType = `    createBuildingMeshByType(type, data = {}) {
        // 1. Heritage Craftsman Models (Otentik Nusantara Bertingkat)`;

const replacementMeshByType = `    createBuildingMeshByType(type, data = {}) {
        // 0. Prioritaskan Pekarangan Desa Have-Not jika data adalah kawasan pedesaan
        if (data.is_village_compound || data.is_have === false) {
            return this.createRuralVillageCompoundMesh(data);
        }

        // 1. Heritage Craftsman Models (Otentik Nusantara Bertingkat)`;

if (content.includes(targetMeshByType)) {
    content = content.replace(targetMeshByType, replacementMeshByType);
    console.log('[Loader] Berhasil memperbarui createBuildingMeshByType!');
}

// 4. Update createConstructionScaffoldMesh agar derek tower crane HANYA muncul jika data.has_crane === true
const targetCraneCondition = `        // 4. Derek Tower Crane Kuning Khas Proyek Konstruksi Netizenia v2 (Dioptimalkan)
        const craneDarkMat = new THREE.MeshLambertMaterial({ color: 0x334155, roughness: 0.6 });
        const craneYellowMat = new THREE.MeshLambertMaterial({ color: 0xF1C40F, roughness: 0.4 });

        // Komponen Kuning Derek (Mast + Jib digabung)
        const craneMast = new THREE.Mesh(new THREE.BoxGeometry(0.55, 13.5, 0.55), craneYellowMat);
        craneMast.position.set(w / 2 - 1.2, 6.75, d / 2 - 1.2);
        craneMast.castShadow = true;
        group.add(craneMast);

        const craneJib = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.45, 0.45), craneYellowMat);
        craneJib.position.set(w / 2 - 5.5, 14.2, d / 2 - 1.2);
        craneJib.castShadow = true;
        group.add(craneJib);

        // Komponen Gelap Derek (Kabin + Counterweight)
        const craneCab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), craneDarkMat);
        craneCab.position.set(w / 2 - 1.2, 13.6, d / 2 - 1.2);
        group.add(craneCab);

        const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), craneDarkMat);
        counterWeight.position.set(w / 2 + 1.8, 14.1, d / 2 - 1.2);
        group.add(counterWeight);`;

const replacementCraneCondition = `        // 4. Derek Tower Crane HANYA untuk Proyek Berat Vital (Bukan Rumah Tinggal Biasa!)
        if (data.has_crane === true) {
            const craneDarkMat = new THREE.MeshLambertMaterial({ color: 0x334155, roughness: 0.6 });
            const craneYellowMat = new THREE.MeshLambertMaterial({ color: 0xF1C40F, roughness: 0.4 });

            const craneMast = new THREE.Mesh(new THREE.BoxGeometry(0.55, 13.5, 0.55), craneYellowMat);
            craneMast.position.set(w / 2 - 1.2, 6.75, d / 2 - 1.2);
            craneMast.castShadow = true;
            group.add(craneMast);

            const craneJib = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.45, 0.45), craneYellowMat);
            craneJib.position.set(w / 2 - 5.5, 14.2, d / 2 - 1.2);
            craneJib.castShadow = true;
            group.add(craneJib);

            const craneCab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), craneDarkMat);
            craneCab.position.set(w / 2 - 1.2, 13.6, d / 2 - 1.2);
            group.add(craneCab);

            const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.1), craneDarkMat);
            counterWeight.position.set(w / 2 + 1.8, 14.1, d / 2 - 1.2);
            group.add(counterWeight);
        }`;

if (content.includes(targetCraneCondition)) {
    content = content.replace(targetCraneCondition, replacementCraneCondition);
    console.log('[Loader] Berhasil membatasi tower crane hanya untuk has_crane: true!');
}

// 5. Tambahkan method createRuralVillageCompoundMesh dan updateLighting
const ruralMethods = `
    /**
     * Membangun Model Kawasan Pedesaan Luas (16m x 16m) Desa Have-Not
     * Dilengkapi Pekarangan Berkebun (Cabai, Jagung, Terong, Sawi), Pagar Bambu Betek,
     * Pohon Pisang & Kelapa, Sumur Timba Batu Kali, Saung Bambu, dan Rumah Hunian Asri.
     * Bebas dari Crane Konstruksi Raksasa sesuai instruksi pengguna!
     */
    createRuralVillageCompoundMesh(data) {
        const group = new THREE.Group();
        group.name = \`rural_village_\${data.id}\`;

        const w = (data.width || 2) * 8.0 - 0.8; // 15.2m
        const d = (data.height || 2) * 8.0 - 0.8; // 15.2m
        const halfW = w / 2;
        const halfD = d / 2;

        // 1. Alas Tanah Humus Subur & Rumput Pekarangan Asri (Zero Submerging Y >= 0.08)
        const soilBase = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), this.materials.soilLoam);
        soilBase.position.y = 0.04;
        soilBase.receiveShadow = true;
        group.add(soilBase);

        const lawnPad = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.05, d - 0.4), this.materials.grass);
        lawnPad.position.y = 0.08;
        lawnPad.receiveShadow = true;
        group.add(lawnPad);

        // 2. Jalan Setapak Batu Kali (Flagstone Pathway) dari Depan ke Rumah & Kebun
        const pathMat = this.materials.stonePath;
        const mainPath = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, halfD + 1.5), pathMat);
        mainPath.position.set(0, 0.11, halfD / 2);
        mainPath.receiveShadow = true;
        group.add(mainPath);

        const sidePath = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.03, 1.0), pathMat);
        sidePath.position.set(-3.2, 0.11, 1.5);
        sidePath.receiveShadow = true;
        group.add(sidePath);

        // 3. Pagar Betek Bambu Belah Mengelilingi Pekarangan dengan Gerbang Depan
        const fenceMat = this.materials.bamboo;
        const fenceDarkMat = this.materials.bambooDark;

        // Pagar Belakang (Z = -halfD)
        const backFence = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.65, 0.08), fenceMat);
        backFence.position.set(0, 0.42, -halfD + 0.1);
        backFence.castShadow = true;
        group.add(backFence);

        // Pagar Sisi Kiri (X = -halfW) & Sisi Kanan (X = halfW)
        const leftFence = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, d - 0.6), fenceMat);
        leftFence.position.set(-halfW + 0.1, 0.42, 0);
        leftFence.castShadow = true;
        group.add(leftFence);

        const rightFence = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, d - 0.6), fenceMat);
        rightFence.position.set(halfW - 0.1, 0.42, 0);
        rightFence.castShadow = true;
        group.add(rightFence);

        // Pagar Depan (Kiri & Kanan Pintu Gerbang Masuk)
        const frontFenceLeft = new THREE.Mesh(new THREE.BoxGeometry(halfW - 1.2, 0.65, 0.08), fenceMat);
        frontFenceLeft.position.set(-(halfW / 2 + 0.6), 0.42, halfD - 0.1);
        frontFenceLeft.castShadow = true;
        group.add(frontFenceLeft);

        const frontFenceRight = new THREE.Mesh(new THREE.BoxGeometry(halfW - 1.2, 0.65, 0.08), fenceMat);
        frontFenceRight.position.set(halfW / 2 + 0.6, 0.42, halfD - 0.1);
        frontFenceRight.castShadow = true;
        group.add(frontFenceRight);

        // Tiang Gerbang Bambu Depan (Pintu Regol)
        [-1.1, 1.1].forEach(gx => {
            const gatePost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.8, 6), fenceDarkMat);
            gatePost.position.set(gx, 0.98, halfD - 0.1);
            gatePost.castShadow = true;
            group.add(gatePost);

            // Lentera Batok Kelapa di Tiang Gerbang
            const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), this.materials.lanternGlow);
            lantern.position.set(gx, 1.85, halfD - 0.1);
            group.add(lantern);
        });

        // 4. PEKARANGAN BERKEBUN: 3-4 Bedeng Tanaman Sayuran Subur
        const bedMat = this.materials.teak;
        const cropMat = this.materials.cropGreen;
        const chiliMat = this.materials.chiliRed;
        const cornMat = this.materials.cornYellow;
        const eggplantMat = this.materials.eggplantPurple;

        // Bedeng 1: Kebun Cabai Rawit (Sisi Kiri Depan)
        const bed1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 1.6), bedMat);
        bed1.position.set(-3.6, 0.19, 3.8);
        bed1.receiveShadow = true;
        group.add(bed1);

        const bed1Soil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.4), this.materials.soilLoam);
        bed1Soil.position.set(-3.6, 0.25, 3.8);
        group.add(bed1Soil);

        // Tanaman Cabai Rawit (6 Tanaman Rimbun + Cabai Merah)
        for (let ci = 0; ci < 6; ci++) {
            const cx = -4.8 + (ci % 3) * 1.2;
            const cz = 3.4 + Math.floor(ci / 3) * 0.8;
            const chiliBush = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), cropMat);
            chiliBush.position.set(cx, 0.44, cz);
            chiliBush.castShadow = true;
            group.add(chiliBush);

            const chiliFruit = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), chiliMat);
            chiliFruit.rotation.x = Math.PI;
            chiliFruit.position.set(cx + 0.1, 0.48, cz);
            group.add(chiliFruit);
        }

        // Bedeng 2: Kebun Jagung Manis (Sisi Kiri Tengah)
        const bed2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 1.6), bedMat);
        bed2.position.set(-3.6, 0.19, 0.8);
        bed2.receiveShadow = true;
        group.add(bed2);

        const bed2Soil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.4), this.materials.soilLoam);
        bed2Soil.position.set(-3.6, 0.25, 0.8);
        group.add(bed2Soil);

        // Batang & Daun Jagung
        for (let jg = 0; jg < 6; jg++) {
            const jx = -4.8 + (jg % 3) * 1.2;
            const jz = 0.4 + Math.floor(jg / 3) * 0.8;
            const cornStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 5), cropMat);
            cornStalk.position.set(jx, 0.95, jz);
            cornStalk.castShadow = true;
            group.add(cornStalk);

            const cornCob = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 6), cornMat);
            cornCob.position.set(jx + 0.08, 0.9, jz);
            group.add(cornCob);
        }

        // Bedeng 3: Kebun Terong & Tomat (Sisi Kiri Belakang)
        const bed3 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 1.6), bedMat);
        bed3.position.set(-3.6, 0.19, -2.2);
        bed3.receiveShadow = true;
        group.add(bed3);

        const bed3Soil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.4), this.materials.soilLoam);
        bed3Soil.position.set(-3.6, 0.25, -2.2);
        group.add(bed3Soil);

        for (let ti = 0; ti < 6; ti++) {
            const tx = -4.8 + (ti % 3) * 1.2;
            const tz = -2.6 + Math.floor(ti / 3) * 0.8;
            const bush = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 6), cropMat);
            bush.position.set(tx, 0.46, tz);
            bush.castShadow = true;
            group.add(bush);

            const eggFruit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 5), eggplantMat);
            eggFruit.position.set(tx, 0.38, tz + 0.12);
            group.add(eggFruit);
        }

        // 5. SUMUR TIMBA BATU KALI ALAMI (Sisi Depan Kanan)
        const wellGroup = new THREE.Group();
        wellGroup.position.set(4.2, 0.1, 3.8);

        // Dinding Lingkar Sumur Batu Kali
        const wellWall = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.75, 10, 1, true), this.materials.stone);
        wellWall.position.y = 0.45;
        wellWall.castShadow = true;
        wellGroup.add(wellWall);

        // Air Sumur Dalam
        const wellWater = new THREE.Mesh(new THREE.CircleGeometry(0.78, 10).rotateX(-Math.PI / 2), this.materials.water);
        wellWater.position.y = 0.25;
        wellGroup.add(wellWater);

        // Tiang Katrol Kayu & Atap Perlindung Sumur
        const wellPost1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.8, 6), this.materials.teakDark);
        wellPost1.position.set(-0.7, 0.95, 0);
        wellGroup.add(wellPost1);

        const wellPost2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.8, 6), this.materials.teakDark);
        wellPost2.position.set(0.7, 0.95, 0);
        wellGroup.add(wellPost2);

        const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.7, 4), this.materials.thatchIjuk);
        wellRoof.rotation.y = Math.PI / 4;
        wellRoof.position.set(0, 1.95, 0);
        wellRoof.castShadow = true;
        wellGroup.add(wellRoof);

        // Timba Ember Kayu
        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.25, 6), this.materials.teakLight);
        bucket.position.set(0, 1.2, 0);
        wellGroup.add(bucket);

        group.add(wellGroup);

        // 6. SAUNG BAMBU SANTAI / BALE BENGONG (Sisi Kanan Tengah)
        const saungGroup = new THREE.Group();
        saungGroup.position.set(4.2, 0.1, 0.2);

        // Panggung Lantai Bambu
        const saungFloor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.6), this.materials.bamboo);
        saungFloor.position.y = 0.48;
        saungFloor.receiveShadow = true;
        saungGroup.add(saungFloor);

        // 4 Tiang Panggung Bambu
        [-1.0, 1.0].forEach(sx => {
            [-1.0, 1.0].forEach(sz => {
                const sPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.9, 6), this.materials.bambooDark);
                sPost.position.set(sx, 1.0, sz);
                sPost.castShadow = true;
                saungGroup.add(sPost);
            });
        });

        // Atap Ijuk Aren Hitam Bertingkat
        const saungRoof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), this.materials.thatchIjuk);
        saungRoof.rotation.y = Math.PI / 4;
        saungRoof.position.set(0, 2.45, 0);
        saungRoof.castShadow = true;
        saungGroup.add(saungRoof);

        group.add(saungGroup);

        // 7. POHON PISANG RAJA & POHON KELAPA DI PEKARANGAN
        // Pohon Pisang Raja
        const bananaGroup = new THREE.Group();
        bananaGroup.position.set(-5.2, 0.1, -4.8);

        const bTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6), this.materials.leafDark);
        bTrunk.position.y = 1.2;
        bananaGroup.add(bTrunk);

        // 5 Pelepah Daun Pisang Melengkung Lebar
        for (let pi = 0; pi < 5; pi++) {
            const rotY = (pi / 5) * Math.PI * 2;
            const bLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.5), this.materials.cropGreen);
            bLeaf.position.set(Math.cos(rotY) * 0.9, 2.3, Math.sin(rotY) * 0.9);
            bLeaf.rotation.y = rotY;
            bLeaf.rotation.z = 0.35;
            bananaGroup.add(bLeaf);
        }
        group.add(bananaGroup);

        // Pohon Kelapa Gading di Sudut Kanan Belakang
        const palmGroup = new THREE.Group();
        palmGroup.position.set(5.2, 0.1, -4.8);

        const pTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 5.2, 7), this.materials.teakWarm);
        pTrunk.position.y = 2.6;
        palmGroup.add(pTrunk);

        const palmFronds = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.0, 6), this.materials.leafGreen);
        palmFronds.position.y = 5.3;
        palmFronds.castShadow = true;
        palmGroup.add(palmFronds);

        group.add(palmGroup);

        // 8. RUMAH HUNIAN UTAMA OTENTIK PEDESAAN NUSANTARA (Belakang Tengah)
        // Posisi X = 0.5, Z = -2.8 (Memberikan ruang pekarangan depan yang sangat luas)
        const houseGroup = new THREE.Group();
        houseGroup.position.set(0.6, 0.1, -2.6);

        // Fondasi Umpak Batu Rumah
        const houseBase = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 4.4), this.materials.creamDark);
        houseBase.position.y = 0.15;
        houseBase.receiveShadow = true;
        houseGroup.add(houseBase);

        // Dinding Rumah Papan Kayu & Plester Krem Solid (100% Solid, Tanpa Tembus Pandang)
        const houseWalls = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.2, 3.8), this.materials.cream);
        houseWalls.position.y = 1.35;
        houseWalls.castShadow = true;
        houseWalls.receiveShadow = true;
        houseGroup.add(houseWalls);

        // Kusen Pintu Kayu Jati
        const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.1), this.materials.teakDark);
        doorFrame.position.set(0, 1.1, 1.95);
        houseGroup.add(doorFrame);

        // Jendela Depan (Kaca Tint Solid di Siang Hari, Emissive Hangat di Malam Hari)
        [-1.4, 1.4].forEach(wx => {
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.1), this.materials.windowGlow);
            win.position.set(wx, 1.4, 1.95);
            houseGroup.add(win);
        });

        // Atap Limasan Jawa Genteng Terakota Wuwungan
        const roofLimasan = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.8, 4), this.materials.terracotta);
        roofLimasan.rotation.y = Math.PI / 4;
        roofLimasan.scale.set(1.4, 1, 1.1);
        roofLimasan.position.set(0, 3.2, 0);
        roofLimasan.castShadow = true;
        houseGroup.add(roofLimasan);

        // Wuwungan Puncak Atap
        const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 0.25), this.materials.terracottaDark);
        ridgeBeam.position.set(0, 4.05, 0);
        houseGroup.add(ridgeBeam);

        // Teras Emperan Depan dengan Bangku Kayu Santai
        const porchBench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.4), this.materials.teakLight);
        porchBench.position.set(1.4, 0.45, 2.1);
        houseGroup.add(porchBench);

        group.add(houseGroup);

        // 9. PAPAN NAMA KAVLING RUMAH & WARGA DI DEPAN GERBANG
        const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6), this.materials.teakDark);
        signPost.position.set(1.6, 0.6, halfD - 0.2);
        group.add(signPost);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const sctx = canvas.getContext('2d');
        sctx.fillStyle = '#78350F';
        sctx.fillRect(0, 0, 512, 128);
        sctx.strokeStyle = '#FDE047';
        sctx.lineWidth = 6;
        sctx.strokeRect(6, 6, 500, 116);

        sctx.fillStyle = '#FFFFFF';
        sctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        sctx.textAlign = 'center';
        sctx.fillText(data.title || '🏡 Pekarangan Warga Gotong Royong', 256, 52);

        sctx.fillStyle = '#FDE68A';
        sctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        sctx.fillText(data.owner ? \`Pemilik: @\${data.owner.replace(/^@/, '')}\` : 'Kavling Desa Have-Not Asri', 256, 95);

        const sTex = new THREE.CanvasTexture(canvas);
        const sPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), new THREE.MeshBasicMaterial({ map: sTex }));
        sPlane.position.set(1.6, 1.0, halfD - 0.16);
        group.add(sPlane);

        return group;
    }

    /**
     * Memperbarui mode pencahayaan siang/malam pada lampu dan jendela seluruh bangunan
     */
    updateLighting(isNight) {
        if (!this.materials) return;

        // Lampu jendela bangunan heritage
        if (this.materials.windowGlow) {
            if (isNight) {
                this.materials.windowGlow.color.setHex(0xFFE082);
                this.materials.windowGlow.emissive.setHex(0xFFA000);
                this.materials.windowGlow.emissiveIntensity = 1.2;
            } else {
                this.materials.windowGlow.color.setHex(0x475569);
                this.materials.windowGlow.emissive.setHex(0x000000);
                this.materials.windowGlow.emissiveIntensity = 0.0;
            }
        }

        // Lentera gapura dan sumur
        if (this.materials.lanternGlow) {
            if (isNight) {
                this.materials.lanternGlow.color.setHex(0xFEF08A);
            } else {
                this.materials.lanternGlow.color.setHex(0x94A3B8);
            }
        }
    }
`;

// Sisipkan method baru sebelum destroy
if (!content.includes('createRuralVillageCompoundMesh(data)')) {
    const searchTarget = '    demolishBuilding(id) {';
    if (content.includes(searchTarget)) {
        content = content.replace(searchTarget, ruralMethods + '\n    demolishBuilding(id) {');
        console.log('[Loader] Berhasil menyematkan createRuralVillageCompoundMesh dan updateLighting!');
    } else {
        console.error('[Loader] Target demolishBuilding tidak ditemukan!');
    }
}

fs.writeFileSync(loaderPath, content, 'utf8');
console.log('[Loader] Selesai memperbarui building_loader.js!');

