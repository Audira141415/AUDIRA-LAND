const fs = require('fs');
const path = require('path');

// =========================================================================
// 1. UPDATE PLAYER_STATE.JS
// =========================================================================
const playerStatePath = path.resolve(__dirname, '../web/src/core/player_state.js');
let psContent = fs.readFileSync(playerStatePath, 'utf8');

const igMethod = `
    /**
     * Mendaftarkan Warga Resmi via Instagram (@audira.id)
     * Mengalokasikan kavling otomatis di Desa Have-Not dengan pekarangan luas
     */
    async registerViaInstagram({ igUsername, profession, avatarColor }) {
        const clean = (igUsername || '').replace(/^@/, '').trim();
        if (!clean) throw new Error('Username Instagram wajib diisi!');

        // Alokasikan kavling desa have-not (timur sungai: i >= 112, j >= 88)
        const igCount = this.citizensList.filter(c => c.isInstagramCitizen).length;
        const col = igCount % 7;
        const row = Math.floor(igCount / 7);
        const lotI = 112 + col * 4;
        const lotJ = 88 + row * 4;

        const T = 8.0;
        const HALF = 108;
        const posX = (lotI - HALF) * T + (2 * T) / 2;
        const posZ = (lotJ - HALF) * T + (2 * T) / 2;

        const newCitizen = {
            isRegistered: true,
            id: 'ig-' + clean.toLowerCase() + '-' + Date.now().toString(36),
            username: '@' + clean,
            igUsername: clean,
            isInstagramCitizen: true,
            nik: \`AUDIRA-IG-2026-\${Math.floor(1000 + Math.random() * 9000)}\`,
            profession: profession || 'Petani Sayur Organik',
            coins: 500, // Bonus warga baru Instagram: 500 ₳!
            role: 'warga',
            avatarColor: avatarColor || '#C8553D',
            claimedPlots: [\`plot_k12_\${lotI}_\${lotJ}\`],
            totalWorked: 0,
            lastWorkedAt: null,
            todayEarnedCoins: 0,
            todayDate: this.getTodayDateString(),
            createdAt: new Date().toISOString(),
            assignedLot: {
                gridI: lotI,
                gridJ: lotJ,
                worldX: posX,
                worldZ: posZ
            }
        };

        // Buat data bangunan rumah pekarangan
        const homeData = {
            id: \`warga-ig-\${clean.toLowerCase()}\`,
            type: 'rumah_limas',
            title: \`Pekarangan Asri @\${clean}\`,
            owner: \`@\${clean}\`,
            stage: 'selesai',
            progress: 1.0,
            width: 2,
            height: 2,
            desc: \`Hunian otentik pedesaan warga resmi Instagram @\${clean} dengan pekarangan cabai, saung bambu, dan sumur timba.\`,
            grid_i: lotI,
            grid_j: lotJ,
            worldX: posX,
            worldZ: posZ,
            is_have: false,
            zone: 'DESA_HAVENOT_TIMUR',
            status_label: 'Warga Resmi Instagram',
            is_village_compound: true,
            has_crane: false,
            yard_features: {
                has_garden_beds: true,
                has_bamboo_fence: true,
                has_fruit_trees: true,
                has_water_well: true,
                has_chicken_coop: true,
                has_bamboo_gazebo: true
            }
        };

        this.state = newCitizen;
        this.saveState();

        // Tambah ke riwayat berita kota
        this.addNews('warga', \`🎉 Warga Baru Instagram! Selamat datang @\${clean} di Desa Have-Not! Rumah & pekarangan berkebun telah resmi didirikan.\`);

        try {
            await registerPlayer(this.state.username, this.state.profession, this.state.avatarColor);
        } catch (err) {}

        return { citizen: newCitizen, home: homeData };
    }
`;

if (!psContent.includes('registerViaInstagram')) {
    psContent = psContent.replace('    async registerNewCitizen(username, profession, avatarColor) {', igMethod + '\n    async registerNewCitizen(username, profession, avatarColor) {');
    fs.writeFileSync(playerStatePath, psContent, 'utf8');
    console.log('[PlayerState] Berhasil menambahkan registerViaInstagram!');
}

// =========================================================================
// 2. UPDATE MAIN.JS (Wire Instagram Flow & Camera Recenter)
// =========================================================================
const mainPath = path.resolve(__dirname, '../web/src/main.js');
let mainContent = fs.readFileSync(mainPath, 'utf8');

// Ensure updateCatalogLighting is imported
if (!mainContent.includes('updateCatalogLighting')) {
    mainContent = mainContent.replace(
        "import { BuildingLoader } from './models/building_loader.js';",
        "import { BuildingLoader } from './models/building_loader.js';\nimport { updateCatalogLighting } from './models/netizenia_catalog.js';"
    );
}

// Wire lighting time listener
if (!mainContent.includes('this.lighting.onTimeChange')) {
    const wireLighting = `
        // Hubungkan mode pencahayaan Siang/Malam ke seluruh gedung & lampu kota
        this.lighting.onTimeChange(({ isNight }) => {
            if (this.buildingLoader) this.buildingLoader.updateLighting(isNight);
            updateCatalogLighting(isNight);
        });
`;
    mainContent = mainContent.replace(
        "        // 5. Grid Deterministik 5x5 Distrik",
        wireLighting + "\n        // 5. Grid Deterministik 5x5 Distrik"
    );
}

// Wire Instagram callback on authModal
const targetAuthModal = `        this.authModal = new AuthModal({
            onRegistered: (profile) => {
                console.log(\`[Warga] Selamat bergabung, \${profile.username} (\${profile.profession})!\`);
                this.hud.updatePlayerUI(playerState.state);
            }
        });`;

const replacementAuthModal = `        this.authModal = new AuthModal({
            onRegistered: (profile) => {
                console.log(\`[Warga] Selamat bergabung, \${profile.username} (\${profile.profession})!\`);
                this.hud.updatePlayerUI(playerState.state);
            },
            onInstagramRegistered: ({ citizen, home }) => {
                console.log(\`[IG Warga] Berhasil mendaftar via Instagram: @\${citizen.igUsername}\`);
                this.hud.updatePlayerUI(citizen);

                // Tambahkan rumah pekarangan ke dunia 3D
                if (home) {
                    this.buildingLoader.addBuilding(home);
                    this.saveUserBuildingLocally(home);

                    // Kamera meluncur mulus ke pekarangan warga baru
                    setTimeout(() => {
                        this.camera.recenter(home.worldX, home.worldZ);
                        this.hud.showToast(
                            '🏡 Rumah Pekarangan Siap!',
                            \`Selamat @\${citizen.igUsername}! Rumah dan kebun Anda telah berdiri asri di Desa Have-Not [X: \${home.worldX}m, Z: \${home.worldZ}m].\`,
                            '🎉'
                        );
                    }, 400);
                }
            }
        });`;

if (mainContent.includes(targetAuthModal)) {
    mainContent = mainContent.replace(targetAuthModal, replacementAuthModal);
    console.log('[Main] Berhasil menghubungkan onInstagramRegistered ke AuthModal!');
}

fs.writeFileSync(mainPath, mainContent, 'utf8');
console.log('[Main] Selesai memperbarui main.js!');

