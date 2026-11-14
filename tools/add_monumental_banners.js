const fs = require('fs');
const path = require('path');

const gridPath = path.resolve(__dirname, '../web/src/core/grid.js');
let content = fs.readFileSync(gridPath, 'utf8');

const bannerMethods = `
    /**
     * Membangun Banner Monumental Raksasa untuk Kota Have (Barat) dan Kota Have-Not (Timur)
     * Tampak megah di cakrawala kota dengan tipografi tajam, tiang truss kokoh, mahkota atap, dan lampu sorot.
     */
    buildMonumentalCityBanners(riverMinX, riverMaxX) {
        const bannersGroup = new THREE.Group();
        bannersGroup.name = 'monumental_city_banners';

        // -------------------------------------------------------------
        // A. MONUMEN RAKSASA BARAT: KOTA DESA HAVE (X = -21.5m, Z = 0)
        // Arsitektur: Granit hitam-emas, tiang truss emas megah, mahkota Tajuk Joglo
        // -------------------------------------------------------------
        const westMonument = this.createGiantCityMonument({
            posX: riverMinX - 5.5,
            posZ: 0,
            rotationY: Math.PI / 2,
            isHave: true,
            themeColor: '#064E3B',
            accentColor: '#F59E0B',
            headerText: '★ KOTA METROPOLITAN MANDIRI ★',
            mainTitle: '🌟 KOTA DESA HAVE (BARAT) 🌟',
            subtitle: 'Pusat Kota Modern • Bisnis & Hunian Terpadu',
            badgeText: 'WILAYAH RESMI AUDIRA LAND • SEJAHTERA & MANDIRI',
            roofType: 'joglo'
        });
        bannersGroup.add(westMonument);

        // -------------------------------------------------------------
        // B. MONUMEN RAKSASA TIMUR: KOTA DESA HAVE-NOT (X = +21.5m, Z = 0)
        // Arsitektur: Batu kali terakota, tiang bambu/kayu ulin rimbun, mahkota Saung Ijuk
        // -------------------------------------------------------------
        const eastMonument = this.createGiantCityMonument({
            posX: riverMaxX + 5.5,
            posZ: 0,
            rotationY: -Math.PI / 2,
            isHave: false,
            themeColor: '#78350F',
            accentColor: '#FBBF24',
            headerText: '★ KAWASAN GOTONG ROYONG & KAVLING WARGA ★',
            mainTitle: '🚜 KOTA DESA HAVE-NOT (TIMUR) 🚜',
            subtitle: 'Suasana Pedesaan Asri • Pekarangan Berkebun • Siap Dibangun',
            badgeText: 'LUMBUNG PANGAN & KELUARGA GOTONG ROYONG AUDIRA',
            roofType: 'saung'
        });
        bannersGroup.add(eastMonument);

        // -------------------------------------------------------------
        // C. OVERHEAD GANTRY BANNERS PADA JEMBATAN UTARA (Z = -60) & SELATAN (Z = +60)
        // -------------------------------------------------------------
        [-60, 60].forEach(zCoord => {
            const gantryWest = this.createOverheadGantryBanner({
                posX: riverMinX - 1.8,
                posZ: zCoord,
                rotationY: Math.PI / 2,
                title: '🌟 GERBANG KOTA DESA HAVE (BARAT)',
                sub: 'Wilayah Modern Nusantara Mandiri',
                bgHex: '#064E3B',
                borderHex: '#F59E0B'
            });
            bannersGroup.add(gantryWest);

            const gantryEast = this.createOverheadGantryBanner({
                posX: riverMaxX + 1.8,
                posZ: zCoord,
                rotationY: -Math.PI / 2,
                title: '🚜 GERBANG KOTA DESA HAVE-NOT (TIMUR)',
                sub: 'Kawasan Pedesaan & Pekarangan Gotong Royong',
                bgHex: '#78350F',
                borderHex: '#FBBF24'
            });
            bannersGroup.add(gantryEast);
        });

        this.group.add(bannersGroup);
    }

    /**
     * Membuat 1 set Monumen Reklame Raksasa 3D (Lebar 18m, Tinggi 14m)
     */
    createGiantCityMonument({ posX, posZ, rotationY, isHave, themeColor, accentColor, headerText, mainTitle, subtitle, badgeText, roofType }) {
        const monGroup = new THREE.Group();
        monGroup.position.set(posX, 0.20, posZ);
        monGroup.rotation.y = rotationY;

        const plinthMat = new THREE.MeshLambertMaterial({ color: isHave ? 0x1E293B : 0x451A03, roughness: 0.8 });
        const goldTrimMat = new THREE.MeshLambertMaterial({ color: isHave ? 0xD97706 : 0xB45309, roughness: 0.3 });
        const trussMat = new THREE.MeshLambertMaterial({ color: isHave ? 0xF59E0B : 0x78350F, roughness: 0.5 });
        const lanternGlowMat = new THREE.MeshBasicMaterial({ color: isHave ? 0xFEF08A : 0xFDE68A });
        const grassMat = new THREE.MeshLambertMaterial({ color: isHave ? 0x15803D : 0x65A30D, roughness: 0.9 });

        // 1. Fondasi Podium Bertingkat (19m x 0.8m x 4m)
        const plinthBase = new THREE.Mesh(new THREE.BoxGeometry(19.0, 0.5, 4.0), plinthMat);
        plinthBase.position.y = 0.25;
        plinthBase.receiveShadow = true;
        monGroup.add(plinthBase);

        const plinthTop = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.3, 3.4), goldTrimMat);
        plinthTop.position.y = 0.65;
        plinthTop.receiveShadow = true;
        monGroup.add(plinthTop);

        // Taman Bunga Hias di Depan Podium
        const planter = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.2, 1.0), grassMat);
        planter.position.set(0, 0.8, 1.4);
        monGroup.add(planter);

        // 2. Empat Tiang Pylon Raksasa Baja / Kayu Ulin (Tinggi 13.5m)
        const pylonPositions = [-8.0, -3.0, 3.0, 8.0];
        pylonPositions.forEach(px => {
            const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 13.5, 8), trussMat);
            pylon.position.set(px, 7.4, 0);
            pylon.castShadow = true;
            monGroup.add(pylon);

            [4.0, 8.0, 12.0].forEach(cy => {
                const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.22, 8), goldTrimMat);
                ring.position.set(px, cy, 0);
                monGroup.add(ring);
            });

            const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 6), goldTrimMat);
            flagPole.position.set(px, 15.0, 0);
            monGroup.add(flagPole);

            const flagMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.05),
                new THREE.MeshLambertMaterial({ color: isHave ? 0xDC2626 : 0xD97706 })
            );
            flagMesh.position.set(px + 0.85, 15.6, 0);
            monGroup.add(flagMesh);
        });

        // Silang Penguat (Truss Bracing Diagonal)
        [-5.5, 0, 5.5].forEach(cx => {
            const cross1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.2, 6), trussMat);
            cross1.rotation.z = Math.PI / 4;
            cross1.position.set(cx, 8.5, 0);
            monGroup.add(cross1);

            const cross2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.2, 6), trussMat);
            cross2.rotation.z = -Math.PI / 4;
            cross2.position.set(cx, 8.5, 0);
            monGroup.add(cross2);
        });

        // 3. Papan Billboard Raksasa Dual-Sided (Lebar 17.5m, Tinggi 5.2m)
        const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(17.6, 5.4, 0.6), goldTrimMat);
        boardFrame.position.set(0, 9.6, 0);
        boardFrame.castShadow = true;
        monGroup.add(boardFrame);

        // Kanvas Teks Resolusi Tinggi 1024x320
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 320;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 1024, 320);
        grad.addColorStop(0, themeColor);
        grad.addColorStop(1, isHave ? '#065F46' : '#9A3412');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1024, 320);

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 14;
        ctx.strokeRect(10, 10, 1004, 300);

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.strokeRect(22, 22, 980, 276);

        ctx.fillStyle = accentColor;
        ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(headerText, 512, 58);

        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 48px "Segoe UI", Arial, sans-serif';
        ctx.fillText(mainTitle, 512, 136);

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '600 24px "Segoe UI", Arial, sans-serif';
        ctx.fillText(subtitle, 512, 202);

        ctx.fillStyle = accentColor;
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.fillText(badgeText, 512, 264);

        const bannerTex = new THREE.CanvasTexture(canvas);
        const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });

        const frontPlane = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 5.0), bannerMat);
        frontPlane.position.set(0, 9.6, 0.32);
        monGroup.add(frontPlane);

        const backPlane = new THREE.Mesh(new THREE.PlaneGeometry(17.2, 5.0), bannerMat);
        backPlane.rotation.y = Math.PI;
        backPlane.position.set(0, 9.6, -0.32);
        monGroup.add(backPlane);

        // 4. Mahkota Atap Nusantara di Atas Billboard (Y = 13.0m - 15.5m)
        if (roofType === 'joglo') {
            const roofBase = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.4, 2.2), goldTrimMat);
            roofBase.position.set(0, 12.5, 0);
            monGroup.add(roofBase);

            const roofTier1 = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.2, 4),
                new THREE.MeshLambertMaterial({ color: 0x991B1B, roughness: 0.6 })
            );
            roofTier1.rotation.y = Math.PI / 4;
            roofTier1.position.set(0, 13.6, 0);
            roofTier1.scale.set(1.8, 1, 0.6);
            monGroup.add(roofTier1);

            const mustaka = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.6, 1.4, 8),
                new THREE.MeshBasicMaterial({ color: 0xFDE047 })
            );
            mustaka.position.set(0, 15.2, 0);
            monGroup.add(mustaka);
        } else {
            const roofBase = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.4, 2.2), trussMat);
            roofBase.position.set(0, 12.5, 0);
            monGroup.add(roofBase);

            const roofThatch = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.0, 4),
                new THREE.MeshLambertMaterial({ color: 0x2A2016, roughness: 0.95 })
            );
            roofThatch.rotation.y = Math.PI / 4;
            roofThatch.position.set(0, 13.5, 0);
            roofThatch.scale.set(1.9, 1, 0.6);
            monGroup.add(roofThatch);

            const grainSymbol = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lanternGlowMat);
            grainSymbol.position.set(0, 14.8, 0);
            monGroup.add(grainSymbol);
        }

        // 5. Lampu Sorot LED Raksasa (Spotlights) Menyinari Spanduk
        [-6.0, -2.0, 2.0, 6.0].forEach(lx => {
            const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.4, 8), plinthMat);
            lampHousing.rotation.x = Math.PI / 5;
            lampHousing.position.set(lx, 6.7, 1.1);
            monGroup.add(lampHousing);

            const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lanternGlowMat);
            lampBulb.position.set(lx, 6.8, 1.2);
            monGroup.add(lampBulb);

            const lampBack = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lanternGlowMat);
            lampBack.position.set(lx, 6.8, -1.2);
            monGroup.add(lampBack);
        });

        return monGroup;
    }

    /**
     * Gapura Lengkung Melintang di Atas Jalan (Overhead Highway Gantry)
     */
    createOverheadGantryBanner({ posX, posZ, rotationY, title, sub, bgHex, borderHex }) {
        const gantry = new THREE.Group();
        gantry.position.set(posX, 0.20, posZ);
        gantry.rotation.y = rotationY;

        const steelMat = new THREE.MeshLambertMaterial({ color: 0x334155, roughness: 0.6 });
        const roadSpan = 14.0;

        [-roadSpan / 2, roadSpan / 2].forEach(px => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 6.5, 8), steelMat);
            leg.position.set(px, 3.25, 0);
            leg.castShadow = true;
            gantry.add(leg);
        });

        const beam = new THREE.Mesh(new THREE.BoxGeometry(roadSpan + 1.2, 1.5, 0.4),
            new THREE.MeshLambertMaterial({ color: 0x1E293B })
        );
        beam.position.set(0, 5.8, 0);
        beam.castShadow = true;
        gantry.add(beam);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = bgHex;
        ctx.fillRect(0, 0, 512, 128);

        ctx.strokeStyle = borderHex;
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, 500, 116);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title, 256, 52);

        ctx.fillStyle = borderHex;
        ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
        ctx.fillText(sub, 256, 95);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshBasicMaterial({ map: tex });

        const front = new THREE.Mesh(new THREE.PlaneGeometry(roadSpan - 0.4, 1.35), mat);
        front.position.set(0, 5.8, 0.22);
        gantry.add(front);

        const back = new THREE.Mesh(new THREE.PlaneGeometry(roadSpan - 0.4, 1.35), mat);
        back.rotation.y = Math.PI;
        back.position.set(0, 5.8, -0.22);
        gantry.add(back);

        return gantry;
    }
`;

const targetMethod = '    plantCityTrees(minI, maxI, minJ, maxJ, T, riverMinX, riverMaxX) {';
if (!content.includes('createGiantCityMonument(')) {
    content = content.replace(targetMethod, bannerMethods + '\n' + targetMethod);
    fs.writeFileSync(gridPath, content, 'utf8');
    console.log('[Fix] Sukses menyisipkan method createGiantCityMonument dan buildMonumentalCityBanners!');
} else {
    console.log('[Fix] Method sudah ada.');
}
