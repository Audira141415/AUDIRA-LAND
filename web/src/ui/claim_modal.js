/**
 * AUDIRA-LAND: Modal Klaim Kavling & Pilihan Desain Bangunan Nusantara & Netizenia
 * Menampilkan katalog 36 arsitektur bangunan (Hunian, Usaha, Alam, Fasilitas)
 * Memotong koin hak kavling & material, lalu memulai proyek konstruksi 3D nyata.
 */

import { playerState } from '../core/player_state.js';
import { claimPlotAndBuild, syncRpc } from '../api/client.js';
import { isHaveNotTile, isAllowedInHaveNot } from '../core/village_rules.js';
import { claimFeeFor, identityOf, villageIdOf } from '../core/village_identity.js';

export class ClaimModal {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.selectedType = 'rumah';
        this.activeCategory = 'all';
        this.buildMode = 'instant'; // 'instant' = Siap Huni, 'proyek' = Perancah Konstruksi
        this.currentPlot = null;
        this.modalEl = null;

        // Katalog Lengkap Bangunan (Scraped Netizenia v2 + Authentic Heritage Nusantara)
        this.buildingCatalog = [
            // --- KATEGORI 1: HUNIAN & TEMPAT TINGGAL ---
            {
                id: 'rumah',
                name: 'Rumah Kecil',
                category: 'hunian',
                icon: '🏠',
                cost: 100,
                durationMinutes: 45,
                desc: 'Hunian pertama warga dengan halaman rumput dan cerobong bata asri.',
                reward: '+15 ₳ / kerja'
            },
            {
                id: 'rumah_limas',
                name: 'Rumah Limasan Jawa',
                category: 'hunian',
                icon: '🏡',
                cost: 150,
                durationMinutes: 90,
                desc: 'Hunian tradisional kayu jati beratap limasan wuwungan, serambi luas, dan gentong padasan.',
                reward: '+25 ₳ / kerja'
            },
            {
                id: 'rumah2',
                name: 'Rumah Tingkat Modern',
                category: 'hunian',
                icon: '🏘️',
                cost: 250,
                durationMinutes: 120,
                desc: 'Rumah dua lantai dengan balkon teras, deretan jendela louvre, dan taman depan.',
                reward: '+35 ₳ / kerja'
            },
            {
                id: 'kos',
                name: 'Kos-kosan Mahasiswa',
                category: 'hunian',
                icon: '🏢',
                cost: 350,
                durationMinutes: 150,
                desc: 'Bangunan kos bertingkat untuk akomodasi pendatang dan perantau kota.',
                reward: '+45 ₳ / kerja'
            },

            // --- KATEGORI 2: USAHA & NIAGA 24 JAM ---
            {
                id: 'warung',
                name: 'Warung Madura 24 Jam',
                category: 'usaha',
                icon: '🏪',
                cost: 120,
                durationMinutes: 60,
                desc: 'Warung kelontong ikonik dengan rak bensin Pertamini, sembako, dan terpal merah-putih.',
                reward: '+30 ₳ / kerja'
            },
            {
                id: 'warung_kopi',
                name: 'Warung Kopi Giras',
                category: 'usaha',
                icon: '☕',
                cost: 100,
                durationMinutes: 45,
                desc: 'Pusat cangkrukan santai, seduhan kopi tubruk ceret kuningan, rentengan sachet, dan gorengan.',
                reward: '+25 ₳ / kerja'
            },
            {
                id: 'kafe',
                name: 'Kafe Kopi Modern',
                category: 'usaha',
                icon: '🧋',
                cost: 200,
                durationMinutes: 90,
                desc: 'Kedai kopi estetik beratap kayu dengan area outdoor santai dan barista kopi.',
                reward: '+40 ₳ / kerja'
            },
            {
                id: 'toko',
                name: 'Toko Kelontong',
                category: 'usaha',
                icon: '🛒',
                cost: 220,
                durationMinutes: 90,
                desc: 'Toko penyedia kebutuhan harian warga dengan etalase kaca display.',
                reward: '+38 ₳ / kerja'
            },
            {
                id: 'bengkel',
                name: 'Bengkel Motor & Mobil',
                category: 'usaha',
                icon: '🔧',
                cost: 250,
                durationMinutes: 100,
                desc: 'Bengkel servis kendaraan, ganti oli, dan perbaikan mesin warga desa.',
                reward: '+42 ₳ / kerja'
            },
            {
                id: 'ruko',
                name: 'Ruko Usaha Bertingkat',
                category: 'usaha',
                icon: '🏬',
                cost: 350,
                durationMinutes: 140,
                desc: 'Rumah toko multifungsi: lantai bawah niaga, lantai atas tempat tinggal.',
                reward: '+50 ₳ / kerja'
            },
            {
                id: 'kantor',
                name: 'Gedung Perkantoran',
                category: 'usaha',
                icon: '🏢',
                cost: 600,
                durationMinutes: 240,
                desc: 'Gedung kantor modern kaca bertingkat pusat manajemen bisnis dan start-up.',
                reward: '+80 ₳ / kerja'
            },

            // --- KATEGORI 3: ALAM, PERTANIAN & TAMAN ---
            {
                id: 'kebun_sayur',
                name: 'Kebun Hidroponik Hijau',
                category: 'alam',
                icon: '🥬',
                cost: 90,
                durationMinutes: 40,
                desc: 'Pertanian perkotaan modern dengan pipa PVC A-frame, selada segar, dan peti panen.',
                reward: '+20 ₳ / kerja'
            },
            {
                id: 'sawah',
                name: 'Sawah Padi Terbuka',
                category: 'alam',
                icon: '🌾',
                cost: 80,
                durationMinutes: 30,
                desc: 'Hamparan sawah padi hijau subur dengan pematang tanah dan aliran irigasi.',
                reward: '+18 ₳ / kerja'
            },
            {
                id: 'taman_surya',
                name: 'Taman Surya Tirta',
                category: 'alam',
                icon: '⛲',
                cost: 150,
                durationMinutes: 60,
                desc: 'Taman publik asri dengan kolam air mancur marmer bertingkat, bunga marigold, dan bangku santai.',
                reward: '+25 ₳ / kerja'
            },
            {
                id: 'saung_bambu',
                name: 'Saung Bambu Santai',
                category: 'alam',
                icon: '🎋',
                cost: 80,
                durationMinutes: 30,
                desc: 'Gazebo panggung bambu beratap ijuk aren hitam bertingkat, poci teh, dan angklung angin.',
                reward: '+15 ₳ / kerja'
            },

            // --- KATEGORI 4: FASILITAS UMUM & GOTONG ROYONG ---
            {
                id: 'posko',
                name: 'Posko Tukang Warga',
                category: 'fasilitas',
                icon: '🔨',
                cost: 90,
                durationMinutes: 30,
                desc: 'Posko kumpul tukang warga dan pusat koordinasi perbaikan fasilitas.',
                reward: '+20 ₳ / kerja'
            },
            {
                id: 'pos_ronda',
                name: 'Pos Ronda Siskamling',
                category: 'fasilitas',
                icon: '🚨',
                cost: 120,
                durationMinutes: 45,
                desc: 'Pos keamanan panggung kayu jati dengan kentongan siaga raksasa dan jadwal siskamling.',
                reward: '+25 ₳ / kerja'
            },
            {
                id: 'ibadah',
                name: 'Tempat Ibadah / Musholla',
                category: 'fasilitas',
                icon: '🕌',
                cost: 300,
                durationMinutes: 120,
                desc: 'Rumah ibadah beratap kubah hijau dengan menara adzan dan serambi damai.',
                reward: '+30 ₳ / kerja'
            },
            {
                id: 'pasar',
                name: 'Pasar Rakyat Tradisional',
                category: 'fasilitas',
                icon: '🧺',
                cost: 400,
                durationMinutes: 160,
                desc: 'Pasar rakyat berkanopi warna-warni sentra jual beli hasil tani dan sembako lokal.',
                reward: '+55 ₳ / kerja'
            },
            {
                id: 'pangkalan',
                name: 'Pangkalan Ojek Kota',
                category: 'fasilitas',
                icon: '🛵',
                cost: 150,
                durationMinutes: 60,
                desc: 'Pangkalan transportasi roda dua melayani antar jemput warga ke seluruh distrik.',
                reward: '+30 ₳ / kerja'
            },
            {
                id: 'sekolah',
                name: 'Gedung Sekolah Dasar',
                category: 'fasilitas',
                icon: '🏫',
                cost: 500,
                durationMinutes: 200,
                desc: 'Sekolah dua lantai dengan sayap kelas, lapangan upacara, dan tiang bendera merah putih.',
                reward: '+65 ₳ / kerja'
            },
            {
                id: 'rs',
                name: 'Rumah Sakit & Balai Sehat',
                category: 'fasilitas',
                icon: '🏥',
                cost: 700,
                durationMinutes: 280,
                desc: 'Pusat layanan kesehatan warga dengan fasilitas rawat inap dan lambang palang merah.',
                reward: '+85 ₳ / kerja'
            }
        ];

        this.init();
    }

    init() {
        let modal = document.getElementById('claim-modal-overlay');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'claim-modal-overlay';
            modal.className = 'modal-backdrop';
            document.body.appendChild(modal);
        }
        this.modalEl = modal;
    }

    /** Katalog yang boleh dibangun di petak ini (Have-Not: hanya bangunan sederhana). */
    allowedCatalogFor(plot) {
        if (!plot || !isHaveNotTile(plot.tileI ?? plot.gridI)) return this.buildingCatalog;
        const list = this.buildingCatalog.filter(b => isAllowedInHaveNot(b.id));
        return list.length ? list : this.buildingCatalog.filter(b => b.id === 'rumah_limas');
    }

    render() {
        const plot = this.currentPlot;
        if (!plot) return;

        const coins = playerState.state.coins;
        // Desa Have-Not: hanya bangunan sederhana (aturan village_rules.js)
        const haveNot = isHaveNotTile(plot.tileI ?? plot.gridI);
        const allowedCatalog = this.allowedCatalogFor(plot);
        const chosen = allowedCatalog.find(b => b.id === this.selectedType) || allowedCatalog[0];
        this.selectedType = chosen.id;
        // Biaya total = biaya klaim kavling desa (Have 150 / Have-Not 60) + biaya bangunan
        const villageRule = identityOf(villageIdOf(plot));
        const claimFee = claimFeeFor(plot);
        const totalCost = claimFee + chosen.cost;
        const canAfford = coins >= totalCost;

        // Filter katalog berdasarkan tab kategori
        const filteredCatalog = this.activeCategory === 'all'
            ? allowedCatalog
            : allowedCatalog.filter(b => b.category === this.activeCategory);

        this.modalEl.innerHTML = `
            <div class="modal-card modal-large">
                <div class="modal-header">
                    <div class="modal-title-wrap">
                        <span class="modal-icon">🏗️</span>
                        <div>
                            <h2 class="modal-title">Klaim Kavling & Rancang Bangunan</h2>
                            <p class="modal-subtitle">${plot.district.name} • Petak [${plot.tileI}, ${plot.tileJ}] (Ukuran 2.8 × 2.8m)</p>
                        </div>
                    </div>
                    <button class="modal-close" id="btn-claim-close">✕</button>
                </div>

                <div class="modal-body">
                    <!-- Status Saldo Warga -->
                    <div class="village-rule-line">${villageRule.rules.claim}</div>
                    <div class="claim-cost-bar">
                        <div class="cost-item">
                            <span class="cost-label">Klaim Kavling (${villageRule.title}):</span>
                            <span class="cost-val">${claimFee} ₳</span>
                        </div>
                        <div class="cost-item">
                            <span class="cost-label">Biaya Pembangunan (${chosen.name}):</span>
                            <span class="cost-val">${chosen.cost} ₳</span>
                        </div>
                        <div class="cost-item">
                            <span class="cost-label">Total:</span>
                            <span class="cost-val highlight">${totalCost} ₳</span>
                        </div>
                        <div class="cost-item">
                            <span class="cost-label">Saldo Koin Warga:</span>
                            <span class="cost-val ${canAfford ? 'positive' : 'negative'}">${coins} ₳</span>
                        </div>
                    </div>

                    ${!canAfford ? `
                        <div class="alert-box warning">
                            ⚠️ Saldo koin kamu (${coins} ₳) belum mencukupi untuk kavling + ${chosen.name} (${totalCost} ₳). Pilih tipe yang lebih hemat atau bekerjalah dulu di kota!
                        </div>
                    ` : ''}

                    <!-- Tab Kategori Bangunan -->
                    <div class="category-tabs">
                        <button class="cat-tab ${this.activeCategory === 'all' ? 'active' : ''}" data-cat="all">🌟 Semua (22)</button>
                        <button class="cat-tab ${this.activeCategory === 'hunian' ? 'active' : ''}" data-cat="hunian">🏡 Hunian (4)</button>
                        <button class="cat-tab ${this.activeCategory === 'usaha' ? 'active' : ''}" data-cat="usaha">🏪 Usaha & Niaga (7)</button>
                        <button class="cat-tab ${this.activeCategory === 'alam' ? 'active' : ''}" data-cat="alam">🌾 Kebun & Alam (4)</button>
                        <button class="cat-tab ${this.activeCategory === 'fasilitas' ? 'active' : ''}" data-cat="fasilitas">🏛️ Fasilitas Kota (7)</button>
                    </div>

                    <!-- Pilihan Mode Pembangunan: Siap Huni vs Proyek -->
                    <div class="form-group">
                        <label class="form-label">Metode Pembangunan:</label>
                        <div class="build-mode-selector" style="display: flex; gap: 10px; margin-bottom: 12px;">
                            <button type="button" class="btn-mode-tab ${this.buildMode === 'instant' ? 'active' : ''}" data-mode="instant" style="flex: 1; padding: 10px; border-radius: 8px; border: 2px solid ${this.buildMode === 'instant' ? '#5B3A24' : '#E6E2D8'}; background: ${this.buildMode === 'instant' ? '#FFF9EC' : '#FFF'}; font-weight: bold; cursor: pointer;">
                                ⚡ Siap Huni (Bangun Seketika)
                            </button>
                            <button type="button" class="btn-mode-tab ${this.buildMode === 'proyek' ? 'active' : ''}" data-mode="proyek" style="flex: 1; padding: 10px; border-radius: 8px; border: 2px solid ${this.buildMode === 'proyek' ? '#5B3A24' : '#E6E2D8'}; background: ${this.buildMode === 'proyek' ? '#FFF9EC' : '#FFF'}; font-weight: bold; cursor: pointer;">
                                🏗️ Simulasi Derek & Perancah
                            </button>
                        </div>
                        <span class="form-hint" style="font-size: 12px; color: #78716C;">
                            ${this.buildMode === 'instant' ? '✨ Rumah langsung berdiri lengkap dengan genteng, toren air, antena TV, teras, teralis, dan pagar.' : '⏳ Derek katrol kuning dan perancah bambu dipasang dengan countdown waktu nyata.'}
                        </span>
                    </div>

                    <!-- Pilihan Arsitektur Bangunan -->
                    <div class="form-group">
                        <label class="form-label">Pilih Model Arsitektur Bangunan:</label>
                        ${haveNot ? '<div class="havenot-rule-note">🌾 Desa Have-Not: hanya bangunan sederhana 1 lantai. Gedung tinggi & bangunan mewah hanya di Desa Have.</div>' : ''}
                        <div class="catalog-grid catalog-grid-scroll">
                            ${filteredCatalog.map(b => `
                                <div class="catalog-card ${b.id === this.selectedType ? 'selected' : ''}" data-type="${b.id}" data-cost="${b.cost}">
                                    <div class="bld-icon">${b.icon}</div>
                                    <div class="bld-info">
                                        <div class="bld-name">${b.name}</div>
                                        <div class="bld-desc">${b.desc}</div>
                                        <div class="bld-meta">
                                            <span class="meta-tag cost">💰 ${b.cost} ₳</span>
                                            <span class="meta-tag time">⏳ ${b.durationMinutes}m</span>
                                            <span class="meta-tag reward">${b.reward}</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="btn-primary full-width" id="btn-confirm-claim" ${!canAfford ? 'disabled' : ''}>
                        ${this.buildMode === 'instant' ? `⚡ Klaim & Bangun Rumah Seketika (${totalCost} ₳)` : `🏗️ Klaim & Pasang Perancah Konstruksi (${totalCost} ₳)`}
                    </button>
                </div>
            </div>
        `;
    }

    bindEvents() {
        // Tombol Close
        document.getElementById('btn-claim-close')?.addEventListener('click', () => {
            this.hide();
        });

        // Mode Pembangunan (Siap Huni vs Proyek)
        const modeButtons = this.modalEl.querySelectorAll('.btn-mode-tab');
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.buildMode = btn.getAttribute('data-mode');
                this.render();
                this.bindEvents();
            });
        });

        // Tab Kategori Filter
        const tabs = this.modalEl.querySelectorAll('.cat-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeCategory = tab.getAttribute('data-cat');
                this.render();
                this.bindEvents();
            });
        });

        // Pilih Desain Kartu Bangunan
        const cards = this.modalEl.querySelectorAll('.catalog-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                this.selectedType = card.getAttribute('data-type');
                this.render();
                this.bindEvents();
            });
        });

        // Konfirmasi Klaim
        document.getElementById('btn-confirm-claim')?.addEventListener('click', async () => {
            const plot = this.currentPlot;
            if (!plot) return;

            const allowed = this.allowedCatalogFor(plot);
            const chosen = allowed.find(b => b.id === this.selectedType) || allowed[0];
            const cost = claimFeeFor(plot) + (chosen.cost || 100);

            if (playerState.state.coins < cost) {
                alert(`Koin tidak mencukupi untuk kavling + ${chosen.name} (Butuh ${cost} ₳)!`);
                return;
            }

            // Server dulu: ditolak = batal tanpa memotong koin; diterima = id bangunan & saldo dari server
            const btn = document.getElementById('btn-confirm-claim');
            if (btn) btn.disabled = true;
            const rpc = await syncRpc(() => claimPlotAndBuild(plot.district.key, plot.tileI, plot.tileJ, chosen.id));
            if (btn) btn.disabled = false;
            if (rpc.status === 'failed') {
                alert(`Klaim ditolak server: ${rpc.message}`);
                return;
            }

            // Potong Koin (saldo server bila online)
            const serverCoins = rpc.status === 'ok' && rpc.data ? rpc.data.remaining_coins : null;
            if (serverCoins !== null && serverCoins !== undefined) {
                playerState.state.coins = serverCoins;
                playerState.saveState();
            } else if (!playerState.deductCoins(cost)) {
                alert(`Koin tidak mencukupi untuk kavling + ${chosen.name} (Butuh ${cost} ₳)!`);
                return;
            }

            const durationHours = chosen.durationMinutes / 60.0;
            const now = new Date();
            // Online: jam selesai dari server (now() + durasi katalog); mode "Siap Huni" hanya untuk mode lokal
            const serverFinish = rpc.status === 'ok' && rpc.data && rpc.data.finished_at;
            const finishedAt = serverFinish ? new Date(serverFinish) : new Date(now.getTime() + chosen.durationMinutes * 60000);

            const buildingTitle = chosen.name.includes('Rumah')
                ? `${chosen.name} ${playerState.state.username}`
                : `Rumah ${chosen.name} ${playerState.state.username}`;

            const buildingData = {
                id: (rpc.status === 'ok' && rpc.data && rpc.data.building_id) ||
                    ('bld-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6)),
                district_key: plot.district.key,
                grid_i: plot.tileI,
                grid_j: plot.tileJ,
                width: 1, // Ukuran 1 lot (8x8m)
                height: 1,
                type: chosen.id,
                title: buildingTitle,
                stage: (this.buildMode === 'instant' && !serverFinish) ? 'selesai' : 'proyek',
                owner_id: (rpc.status === 'ok' && playerState.state.serverId) || playerState.state.id,
                owner_name: playerState.state.username,
                owner_color: playerState.state.avatarColor,
                build_hours_total: durationHours,
                build_started_at: now.toISOString(),
                build_finished_at: finishedAt.toISOString(),
                is_public: false,
                worldX: plot.snapX,
                worldZ: plot.snapZ
            };

            // Catat kavling di state pemain
            playerState.addClaimedPlot(`${plot.district.key}_${plot.tileI}_${plot.tileJ}`);

            this.hide();

            if (this.callbacks.onBuildingCreated) {
                this.callbacks.onBuildingCreated(buildingData);
            }
        });
    }

    openForPlot(plot) {
        // Jalan, taman, dan sungai adalah ruang publik: tidak bisa diklaim
        if (!plot || plot.isLot === false || plot.isOpenSpace || plot.isRiver) return;
        // Cek apakah pemain sudah mendaftar KTP
        if (!playerState.state.isRegistered) {
            if (this.callbacks.onRequireRegistration) {
                this.callbacks.onRequireRegistration();
                return;
            }
        }

        this.currentPlot = plot;
        this.render();
        this.bindEvents();
        this.modalEl.classList.add('active');
    }

    hide() {
        this.modalEl.classList.remove('active');
        this.currentPlot = null;
    }
}
