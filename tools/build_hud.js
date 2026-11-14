import fs from 'fs';

const hudPath = 'F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/src/ui/hud.js';

const content = `/**
 * AUDIRA-LAND: Antarmuka HUD Pengguna (Heads-Up Display)
 * Menerapkan gaya "Tinta Hangat" Neo-Brutalisme yang Rapi, Bersih, dan Tanpa Tumpang-Tindih.
 * Mendukung Peran Ganda: Super Admin (Otoritas Tata Kota & Kas) vs Warga Biasa (Gotong Royong).
 */

import { playerState } from '../core/player_state.js';

export class CityHUD {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.container = document.getElementById('hud-container');
        this.primaryMode = 'orbit';
        this.currentPlot = null;
        this.currentBuilding = null;
        this.newsIndex = 0;
        this.newsRotationTimer = 0;

        this.renderHUD();
        this.bindEvents();

        // Pantau perubahan state pemain & kas kota
        playerState.onChange((state, treasury) => {
            this.updatePlayerUI(state);
            this.updateTreasuryUI(treasury);
        });

        // Pantau perubahan berita kota
        playerState.onNewsChange((news) => {
            this.updateNewsList(news);
        });
    }

    renderHUD() {
        const p = playerState.state;
        const treasury = playerState.cityTreasury || 5380;
        const isSuper = playerState.isSuperAdmin();

        this.container.innerHTML = \`
            <!-- 1. Header Bar Atas: Rapi, Satu Baris Fleksibel, Tanpa Tumpukan Mengambang -->
            <header class="hud-header">
                <!-- Profil Warga / Admin Aktif -->
                <div class="hud-profile-pill" id="hud-profile-btn" title="Klik untuk lihat KTP Digital & Detail Akun">
                    <div class="profile-avatar" id="hud-avatar" style="background-color: \${p.avatarColor || '#5B3A24'};">
                        \${p.username ? p.username.charAt(0).toUpperCase() : 'W'}
                    </div>
                    <div class="profile-meta">
                        <div class="profile-top-line">
                            <span class="profile-name" id="hud-username">\${p.username || 'Tamu Netizen'}</span>
                            <span class="hud-role-tag \${isSuper ? 'tag-super' : 'tag-warga'}" id="hud-role-tag">
                                \${isSuper ? '👑 Super Admin' : (p.isRegistered ? '👤 Warga' : '👀 Tamu')}
                            </span>
                        </div>
                        <span class="profile-profession" id="hud-profession">\${p.profession || 'Warga'}</span>
                    </div>
                </div>

                <!-- Tombol Cepat Pengganti Role (Super Admin vs Warga Biasa) -->
                <button class="hud-role-switch-btn \${isSuper ? 'active-super' : ''}" id="btn-quick-toggle-role" title="Klik untuk beralih instan antara mode Super Admin dan Warga Biasa">
                    \${isSuper ? '🔄 Jadi Warga' : '👑 Jadi Admin'}
                </button>

                <!-- Tombol Buka Dashboard Super Admin (Hanya Aktif saat Role Super Admin) -->
                <button class="hud-admin-panel-btn" id="btn-open-admin-panel" style="\${isSuper ? 'display: inline-flex;' : 'display: none;'}" title="Buka Dashboard Otoritas Walikota & Tata Kota">
                    ⚙️ Panel Admin
                </button>

                <!-- Statistik Kota: Warga, Kas Kota ₳, Kepuasan 85%, Status Desa -->
                <div class="hud-stats-group">
                    <div class="hud-stat-pill" title="Populasi Warga Terdaftar">
                        <span class="stat-icon">👥</span>
                        <span class="stat-val" id="hud-pop-count">1.603</span>
                    </div>
                    <div class="hud-stat-pill" id="hud-treasury-badge" title="Kas Perbendaharaan Kota Gotong Royong">
                        <span class="stat-icon">💰</span>
                        <span class="stat-val" id="hud-treasury-amount">\${treasury.toLocaleString('id-ID')} ₳</span>
                    </div>
                    <div class="hud-stat-pill kepuasan-pill" title="Tingkat Kepuasan Kota">
                        <span class="stat-icon">😊</span>
                        <span class="stat-val">85%</span>
                    </div>
                    <button class="hud-stat-pill btn-village-status" id="btn-open-village-status" title="Buku Inventaris Status Desa: HAVE vs HAVE-NOT">
                        <span class="stat-icon">📊</span>
                        <span class="stat-val">Status Desa</span>
                    </button>
                </div>

                <!-- Jam Real-Time WIB -->
                <div class="hud-clock-badge" id="hud-clock">
                    <span id="hud-clock-text">☀️ 12:00 WIB</span>
                </div>
            </header>

            <!-- 2. Running News Ticker Bar Tunggal (Semua Pengumuman & Donasi Terpusat di Sini) -->
            <div class="hud-ticker-wrap" id="hud-ticker-wrap">
                <div class="hud-ticker-label">📢 KABAR KOTA</div>
                <div class="hud-ticker-content" id="hud-ticker-content">
                    <span class="ticker-text" id="hud-ticker-text">Memuat kabar berita kota...</span>
                </div>
            </div>

            <!-- 3. Panel Presets Kamera (Kiri Atas - Terdokumentasi Rapi, Tidak Menabrak Header) -->
            <div class="hud-cam-presets" id="hud-cam-presets">
                <button class="btn-preset active" id="btn-mode-toggle" title="Klik untuk beralih mode drag">🔄 Drag: Putar 360°</button>
                <div class="preset-group">
                    <button class="btn-view" data-view="isometric" title="Tampak Isometrik 41°">📐 Isometrik</button>
                    <button class="btn-view" data-view="street" title="Tampak Dekat Jalanan">🚶 Jalanan</button>
                    <button class="btn-view" data-view="topdown" title="Tampak Atas Satelit">🗺️ Atas</button>
                    <button class="btn-view" data-view="far" title="Tampak Seluruh 25 Distrik">🌐 Kota</button>
                </div>
                <!-- Navigasi Zona: Have (Kiri) vs Sungai (Tengah) vs Have-Not (Kanan) -->
                <div class="preset-group zone-nav-group">
                    <button class="btn-view btn-zone-have" data-view="have" title="Fokus ke Wilayah Barat: DESA HAVE (Sudah Jadi)">🏡 Have</button>
                    <button class="btn-view btn-zone-river" data-view="river" title="Fokus ke Sungai Pemisah 32m & Jembatan">🌊 Sungai</button>
                    <button class="btn-view btn-zone-havenot" data-view="havenot" title="Fokus ke Wilayah Timur: DESA HAVE-NOT (Proyek & Kavling)">🚧 Have-Not</button>
                </div>
            </div>

            <!-- 4. Telemetri Kinerja (Kanan Atas) -->
            <div class="hud-telemetry" id="hud-telemetry">
                <span id="tel-fps">60 FPS</span>
                <span class="tel-divider">•</span>
                <span id="tel-draws">0 Draws</span>
            </div>

            <!-- 5. Kartu Tamu / Ajakan Bergabung (Kanan Bawah - Tidak Mengganggu Pandangan) -->
            <div class="hud-guest-card" id="hud-guest-card">
                <div class="guest-card-text">
                    Kamu sedang melihat kota. <b>Masuk</b> untuk punya rumah, kerja, dan ikut voting.
                </div>
                <button class="btn-guest-login" id="btn-guest-login">Masuk</button>
                <button class="btn-guest-close" id="btn-guest-close" title="Tutup">✕</button>
            </div>

            <!-- 6. Tooltip Info Kavling & Bangunan (Muncul Saat Kavling/Bangunan Diklik) -->
            <div class="hud-plot-card" id="hud-plot-card" style="display: none;">
                <div class="plot-card-header">
                    <div class="plot-card-title-group">
                        <span class="plot-card-icon" id="plot-icon">📍</span>
                        <span class="plot-card-title" id="plot-title">Kavling k12 [16, 16]</span>
                    </div>
                    <button class="plot-card-close" id="plot-close">✕</button>
                </div>
                <div class="plot-card-body" id="plot-card-body">
                    <!-- Terisi Dinamis via showPlotCard() -->
                </div>
            </div>

            <!-- 7. Wadah Notifikasi Toast Mengambang -->
            <div class="hud-toast-container" id="hud-toast-container"></div>

            <!-- 8. Petunjuk Pintasan Keyboard (Desktop) -->
            <div class="hud-shortcuts-bar">
                <span>⌨️ <b>WASD / Panah</b>: Geser • <b>Q / E</b>: Putar 360° • <b>R / F / Scroll</b>: Zoom • <b>Drag Kiri</b>: Putar • <b>Drag Kanan/Shift</b>: Geser</span>
            </div>

            <!-- 9. Bar Kontrol Bawah (Kamera & Waktu) -->
            <footer class="hud-footer">
                <!-- Kontrol Presets Siang-Malam -->
                <div class="hud-time-controls">
                    <button class="btn-time active" data-time="auto">Auto WIB</button>
                    <button class="btn-time" data-time="fajar">🌅 Fajar</button>
                    <button class="btn-time" data-time="siang">☀️ Siang</button>
                    <button class="btn-time" data-time="senja">🌇 Senja</button>
                    <button class="btn-time" data-time="malam">🌙 Malam</button>
                </div>

                <!-- Kontrol Navigasi Cepat Kamera -->
                <div class="hud-camera-controls">
                    <button class="btn-cam" id="btn-rot-ccw" title="Putar Kiri 45° (Q)">⟲ 45°</button>
                    <button class="btn-cam highlight" id="btn-recenter" title="Fokus Pusat Kota k12 (Space)">🎯 k12</button>
                    <button class="btn-cam" id="btn-rot-cw" title="Putar Kanan 45° (E)">⟳ 45°</button>
                    <button class="btn-cam" id="btn-zoom-in" title="Perbesar (R / Scroll Atas)">➕ Zoom</button>
                    <button class="btn-cam" id="btn-zoom-out" title="Perkecil (F / Scroll Bawah)">➖ Zoom</button>
                </div>
            </footer>
        \`;

        this.cycleNewsTicker();
    }

    bindEvents() {
        // Klik Profil untuk buka KTP Modal
        document.getElementById('hud-profile-btn')?.addEventListener('click', () => {
            if (this.callbacks.onOpenProfile) {
                this.callbacks.onOpenProfile();
            }
        });

        // Buka Panel Super Admin
        document.getElementById('btn-open-admin-panel')?.addEventListener('click', () => {
            if (this.callbacks.onOpenAdminPanel) {
                this.callbacks.onOpenAdminPanel();
            }
        });

        // Beralih Peran Cepat (Super Admin vs Warga Biasa)
        document.getElementById('btn-quick-toggle-role')?.addEventListener('click', () => {
            const newRole = playerState.toggleRole();
            this.updatePlayerUI(playerState.state);
            const isSuper = newRole === 'super_admin';
            this.showToast(
                isSuper ? '👑 Mode Super Admin Aktif' : '👤 Mode Warga Biasa Aktif',
                isSuper ? 'Anda kini memiliki otoritas penuh tata kelola kota, kas APBD, dan pembongkaran.' : 'Anda kini kembali ke mode penjelajah warga biasa gotong royong.',
                isSuper ? '👑' : '👤'
            );
            if (this.callbacks.onRoleChanged) {
                this.callbacks.onRoleChanged(newRole);
            }
            if (this.currentPlot) {
                this.showPlotCard(this.currentPlot, this.currentBuilding);
            }
        });

        // Klik Tombol Status Desa (HAVE vs HAVE-NOT)
        document.getElementById('btn-open-village-status')?.addEventListener('click', () => {
            if (this.callbacks.onOpenVillageStatus) {
                this.callbacks.onOpenVillageStatus();
            }
        });

        // Klik Tombol Masuk pada Guest Card
        document.getElementById('btn-guest-login')?.addEventListener('click', () => {
            if (this.callbacks.onOpenProfile) {
                this.callbacks.onOpenProfile();
            }
        });

        // Tutup Guest Card
        document.getElementById('btn-guest-close')?.addEventListener('click', () => {
            const card = document.getElementById('hud-guest-card');
            if (card) card.style.display = 'none';
        });

        // Toggle Drag Mode: Putar 360° vs Geser Pan
        const modeBtn = document.getElementById('btn-mode-toggle');
        modeBtn?.addEventListener('click', () => {
            if (this.callbacks.onTogglePrimaryMode) {
                const newMode = this.callbacks.onTogglePrimaryMode();
                this.primaryMode = newMode;
                modeBtn.textContent = (newMode === 'orbit') ? '🔄 Drag: Putar 360°' : '✋ Drag: Geser (Pan)';
            }
        });

        // Preset View Angle Buttons
        const viewButtons = document.querySelectorAll('.btn-view');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                viewButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const view = btn.getAttribute('data-view');
                this.callbacks.onSetPresetView && this.callbacks.onSetPresetView(view);
            });
        });

        // Kontrol Kamera Tombol Cepat
        document.getElementById('btn-rot-ccw')?.addEventListener('click', () => {
            this.callbacks.onRotateCamera && this.callbacks.onRotateCamera(false);
        });
        document.getElementById('btn-rot-cw')?.addEventListener('click', () => {
            this.callbacks.onRotateCamera && this.callbacks.onRotateCamera(true);
        });
        document.getElementById('btn-recenter')?.addEventListener('click', () => {
            this.callbacks.onRecenterCamera && this.callbacks.onRecenterCamera();
        });
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
            this.callbacks.onZoomCamera && this.callbacks.onZoomCamera(-12.0);
        });
        document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
            this.callbacks.onZoomCamera && this.callbacks.onZoomCamera(12.0);
        });

        // Kontrol Waktu
        const timeButtons = document.querySelectorAll('.btn-time');
        timeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                timeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const preset = btn.getAttribute('data-time');
                this.callbacks.onSetTimePreset && this.callbacks.onSetTimePreset(preset);
            });
        });

        // Tutup Plot Card
        document.getElementById('plot-close')?.addEventListener('click', () => {
            this.hidePlotCard();
        });
    }

    updatePlayerUI(state) {
        const nameEl = document.getElementById('hud-username');
        const profEl = document.getElementById('hud-profession');
        const avatarEl = document.getElementById('hud-avatar');
        const roleTagEl = document.getElementById('hud-role-tag');
        const roleSwitchBtn = document.getElementById('btn-quick-toggle-role');
        const adminBtn = document.getElementById('btn-open-admin-panel');
        const guestCard = document.getElementById('hud-guest-card');

        const isSuper = playerState.isSuperAdmin();

        if (nameEl) nameEl.textContent = state.username || 'Tamu Netizen';
        if (profEl) profEl.textContent = state.profession || 'Warga';
        if (avatarEl) {
            avatarEl.style.backgroundColor = state.avatarColor || '#5B3A24';
            avatarEl.textContent = state.username ? state.username.charAt(0).toUpperCase() : 'W';
        }

        if (roleTagEl) {
            roleTagEl.className = `hud-role-tag ${isSuper ? 'tag-super' : 'tag-warga'}`;
            roleTagEl.textContent = isSuper ? '👑 Super Admin' : (state.isRegistered ? '👤 Warga' : '👀 Tamu');
        }

        if (roleSwitchBtn) {
            roleSwitchBtn.className = `hud-role-switch-btn ${isSuper ? 'active-super' : ''}`;
            roleSwitchBtn.textContent = isSuper ? '🔄 Jadi Warga' : '👑 Jadi Admin';
        }

        if (adminBtn) {
            adminBtn.style.display = isSuper ? 'inline-flex' : 'none';
        }

        // Jika warga sudah terdaftar, sembunyikan guest card
        if (guestCard) {
            if (state.isRegistered) {
                guestCard.style.display = 'none';
            } else {
                guestCard.style.display = 'flex';
            }
        }
    }

    updateTreasuryUI(treasury) {
        const el = document.getElementById('hud-treasury-amount');
        if (el) {
            el.textContent = `${(treasury || 50000).toLocaleString('id-ID')} ₳`;
            el.classList.remove('pulse');
            void el.offsetWidth;
            el.classList.add('pulse');
        }
    }

    updateClock(text) {
        const el = document.getElementById('hud-clock-text');
        if (el) el.textContent = text;
    }

    updateDistrict(name, key) {
        const el = document.getElementById('hud-district-name');
        if (el) el.textContent = `${name} (${key})`;
    }

    updateTelemetry(telemetry) {
        const fpsEl = document.getElementById('tel-fps');
        const drawsEl = document.getElementById('tel-draws');
        if (fpsEl) fpsEl.textContent = `${telemetry.fps} FPS`;
        if (drawsEl) drawsEl.textContent = `${telemetry.drawCalls} Draws`;
    }

    // =========================================================================
    // RUNNING NEWS TICKER SYSTEM (FASE B)
    // =========================================================================
    updateNewsList(news) {
        this.newsList = news;
        if (news && news.length > 0) {
            this.showNewsItem(news[0].message);
        }
    }

    tickTicker(dt) {
        this.newsRotationTimer += dt;
        if (this.newsRotationTimer >= 5.0) {
            this.newsRotationTimer = 0;
            this.cycleNewsTicker();
        }
    }

    cycleNewsTicker() {
        const list = playerState.newsList;
        if (!list || list.length === 0) return;

        this.newsIndex = (this.newsIndex + 1) % list.length;
        this.showNewsItem(list[this.newsIndex].message);
    }

    showNewsItem(message) {
        const textEl = document.getElementById('hud-ticker-text');
        if (!textEl) return;

        textEl.style.opacity = '0';
        textEl.style.transform = 'translateY(4px)';

        setTimeout(() => {
            textEl.textContent = message;
            textEl.style.opacity = '1';
            textEl.style.transform = 'translateY(0)';
        }, 120);
    }

    // =========================================================================
    // INTERAKSI KAVLING & LOOP BEKERJA + FITUR KONTROL SUPER ADMIN
    // =========================================================================
    showPlotCard(plotInfo, building = null) {
        this.currentPlot = plotInfo;
        this.currentBuilding = building;
        const card = document.getElementById('hud-plot-card');
        const iconEl = document.getElementById('plot-icon');
        const titleEl = document.getElementById('plot-title');
        const bodyEl = document.getElementById('plot-card-body');
        if (!card || !bodyEl) return;

        const isSuper = playerState.isSuperAdmin();

        // Panel Khusus Otoritas Super Admin
        let adminActionBoxHtml = '';
        if (isSuper) {
            adminActionBoxHtml = `
                <div class="admin-plot-action-box">
                    <div class="admin-plot-title">👑 Otoritas Super Admin:</div>
                    <div class="admin-plot-buttons">
                        ${building ? `
                            <button class="btn-admin-plot btn-demolish" id="btn-admin-demolish" title="Gusur bangunan dan kosongkan kavling">
                                🚨 Gusur Bangunan
                            </button>
                            ${building.stage === 'proyek' ? `
                                <button class="btn-admin-plot btn-instant-finish" id="btn-admin-instant-finish" title="Selesaikan proyek seketika">
                                    ⚡ Selesaikan Instan
                                </button>
                            ` : ''}
                        ` : `
                            <button class="btn-admin-plot btn-instant-municipal" id="btn-admin-instant-municipal" title="Bangun fasilitas publik pemkot">
                                🏛️ Bangun Proyek Pemkot
                            </button>
                        `}
                    </div>
                </div>
            `;
        }

        // KASUS 1: BANGUNAN SUDAH BERDIRI (ATAU SEDANG PROYEK)
        if (building) {
            const meta = this.callbacks.getBuildingMeta ? this.callbacks.getBuildingMeta(building.type) : {
                title: building.title || 'Bangunan Kota',
                desc: 'Fasilitas terbangun di kawasan AUDIRA-LAND.',
                icon: '🏢',
                jobTitle: 'Petugas Fasilitas'
            };

            const isOwner = playerState.state.username === building.owner_name;

            // A. Bangunan Masih dalam Tahap Konstruksi (Proyek)
            if (building.stage === 'proyek') {
                iconEl.textContent = '🏗️';
                titleEl.textContent = `${building.title || 'Proyek Konstruksi'} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;
                bodyEl.innerHTML = `
                    <div class="status-badge have">✅ STATUS: HAVE (SUDAH ADA)</div>
                    <div class="building-card-meta">
                        <span class="owner-pill">🏗️ Status: Dalam Pembangunan</span>
                        <span class="owner-name">Pemilik: <b>${building.owner_name || 'Warga'}</b></span>
                    </div>
                    <p class="plot-card-desc">Proyek konstruksi sedang berlangsung dengan perancah bambu dan derek katrol kuning. Sisa waktu hitung mundur tercantum pada papan billboard 3D di lokasi proyek.</p>
                    <div class="plot-card-actions">
                        <button class="btn-action" disabled>⏳ Sedang Dibangun (Jam Nyata)</button>
                    </div>
                    ${adminActionBoxHtml}
                `;
            }
            // B. Rumah Tinggal Pribadi Warga (Properti Swasta)
            else if (!building.is_public) {
                iconEl.textContent = isOwner ? '🏡' : '🏠';
                titleEl.textContent = `${building.title || 'Rumah Warga'} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;

                if (isOwner) {
                    bodyEl.innerHTML = `
                        <div class="status-badge have">✅ STATUS: HAVE (SUDAH ADA)</div>
                        <div class="building-card-meta">
                            <span class="owner-pill private">🏡 Rumah Milik Sendiri</span>
                            <span class="owner-name">Pemilik: <b>${building.owner_name}</b></span>
                        </div>
                        <p class="plot-card-desc">Ini adalah rumah kediaman pribadimu di AUDIRA-LAND. Tempat beristirahat, bersantai, dan memulihkan stamina warga.</p>
                        <div class="work-opportunity-box">
                            <div class="work-header">
                                <span class="work-title">🛌 Istirahat di Rumah</span>
                                <span class="work-reward">Stamina 100%</span>
                            </div>
                            <div class="work-details">
                                <span>✨ Efek: <b>Mereset Jeda Waktu Istirahat (Cooldown)</b></span>
                                <span>🛡️ Status Hunian: <b>Nyaman & Terawat</b></span>
                            </div>
                        </div>
                        <div class="plot-card-actions">
                            <button class="btn-action success pulse" id="btn-rest-home">🛌 Istirahat di Rumah (Pulihkan Tenaga)</button>
                        </div>
                        ${adminActionBoxHtml}
                    `;

                    document.getElementById('btn-rest-home')?.addEventListener('click', () => {
                        playerState.resetCooldownForDev();
                        this.playMelodicCoinSound();
                        this.showToast('🏡 Beristirahat Nyaman', `Kamu beristirahat di ${building.title || 'rumahmu'}. Stamina telah pulih dan siap kembali beraktivitas!`, '✨');
                        this.showPlotCard(plotInfo, building);
                    });
                } else {
                    bodyEl.innerHTML = `
                        <div class="status-badge have">✅ STATUS: HAVE (SUDAH ADA)</div>
                        <div class="building-card-meta">
                            <span class="owner-pill private">🏠 Rumah Warga</span>
                            <span class="owner-name">Pemilik: <b>${building.owner_name}</b></span>
                        </div>
                        <p class="plot-card-desc">Kediaman pribadi milik sesama warga gotong royong (${building.owner_name}).</p>
                        <div class="plot-card-actions">
                            <button class="btn-action" id="btn-visit-neighbor">👋 Bertamu & Silaturahmi</button>
                        </div>
                        ${adminActionBoxHtml}
                    `;

                    document.getElementById('btn-visit-neighbor')?.addEventListener('click', () => {
                        this.showToast('👋 Silaturahmi Antar-Warga', `Kamu berkunjung ke rumah ${building.owner_name}. Mempererat tali persaudaraan gotong royong!`, '🤝');
                    });
                }
            }
            // C. Fasilitas Publik Kota (Civic Infrastructure)
            else {
                iconEl.textContent = meta.icon || '🏛️';
                titleEl.textContent = `${meta.title} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;

                const canWorkRes = playerState.canWork();

                let actionButtonHtml = '';
                if (!playerState.state.isRegistered) {
                    actionButtonHtml = `
                        <button class="btn-action primary" id="btn-work-auth">📜 Daftar KTP untuk Bekerja</button>
                    `;
                } else if (!canWorkRes.allowed) {
                    if (canWorkRes.reason === 'cooldown') {
                        actionButtonHtml = `
                            <button class="btn-action" id="btn-work-building" disabled>⏳ Istirahat (${canWorkRes.timeString})</button>
                            <button class="btn-dev-reset" id="btn-dev-reset-cooldown" title="Reset Jeda Kerja (Khusus Pengujian Dev)">⚡ Reset Jeda</button>
                        `;
                    } else if (canWorkRes.reason === 'daily_cap') {
                        actionButtonHtml = `
                            <button class="btn-action" disabled>🔒 Batas Harian Penuh (300/300 ₳)</button>
                        `;
                    }
                } else {
                    actionButtonHtml = `
                        <button class="btn-action success pulse" id="btn-work-building">💼 Bekerja di Sini (+${canWorkRes.potentialReward} ₳)</button>
                    `;
                }

                bodyEl.innerHTML = `
                    <div class="status-badge have">✅ STATUS: HAVE (SUDAH ADA)</div>
                    <div class="building-card-meta">
                        <span class="owner-pill public">🏛️ Fasilitas Publik</span>
                        <span class="owner-name">Pengelola: <b>${building.owner_name || 'Pemerintah Kota'}</b></span>
                    </div>
                    <p class="plot-card-desc">${meta.desc}</p>
                    
                    <div class="work-opportunity-box">
                        <div class="work-header">
                            <span class="work-title">💼 ${meta.jobTitle}</span>
                            <span class="work-reward">+35 ₳</span>
                        </div>
                        <div class="work-details">
                            <span>🏛️ Pajak Kas Kota: <b>+4 ₳</b></span>
                            <span>⏳ Durasi Shift: <b>Seketika (Jeda 10 Menit)</b></span>
                            <span>📈 Cap Harian: <b>${playerState.state.todayEarnedCoins} / 300 ₳</b></span>
                        </div>
                    </div>

                    <div class="plot-card-actions">
                        ${actionButtonHtml}
                    </div>
                    ${adminActionBoxHtml}
                `;

                document.getElementById('btn-work-building')?.addEventListener('click', () => {
                    this.handleWorkClick(building);
                });

                document.getElementById('btn-work-auth')?.addEventListener('click', () => {
                    this.callbacks.onOpenProfile && this.callbacks.onOpenProfile();
                });

                document.getElementById('btn-dev-reset-cooldown')?.addEventListener('click', () => {
                    playerState.resetCooldownForDev();
                    this.showPlotCard(plotInfo, building);
                    this.showToast('⚡ Jeda Kerja Direset', 'Kamu sekarang bisa langsung bekerja kembali!', '⚡');
                });
            }
        } 
        // KASUS 2: KAVLING KOSONG (KLAIM PROPERTI)
        else {
            iconEl.textContent = '📍';
            titleEl.textContent = `Distrik ${plotInfo.district.name} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;

            const isReg = playerState.state.isRegistered;

            bodyEl.innerHTML = `
                <div class="status-badge havenot">🚧 STATUS: HAVE-NOT (BELUM DIBANGUN)</div>
                <div class="building-card-meta">
                    <span class="owner-pill" style="background: #E8F5E9; color: #2E7D32; border: 1px solid #81C784;">🟢 Kavling Kosong Siap Bangun</span>
                    <span class="owner-name">Status: <b>Tersedia</b></span>
                </div>
                <p class="plot-card-desc">Petak tanah kosong di ${plotInfo.district.name} siap didirikan hunian. Rumah hanya akan berdiri jika ada warga yang mendaftar dan membangunnya.</p>
                <div class="plot-cost-box">
                    <span>Biaya Sertifikat Hak Kavling:</span>
                    <span class="cost-tag highlight">100 ₳</span>
                </div>
                <div class="plot-card-actions">
                    <button class="btn-action primary pulse" id="btn-claim-plot">
                        ${isReg ? '🏗️ Klaim Kavling & Bangun Rumah (100 ₳)' : '📜 Daftar KTP untuk Miliki Kavling'}
                    </button>
                </div>
                ${adminActionBoxHtml}
            `;

            document.getElementById('btn-claim-plot')?.addEventListener('click', () => {
                if (!playerState.state.isRegistered) {
                    if (this.callbacks.onOpenProfile) {
                        this.callbacks.onOpenProfile();
                    }
                } else {
                    if (this.callbacks.onClaimPlot && this.currentPlot) {
                        this.callbacks.onClaimPlot(this.currentPlot);
                    }
                }
            });
        }

        // BIND EVENT AKSI SUPER ADMIN JIKA ELEMEN ADA
        if (isSuper) {
            document.getElementById('btn-admin-demolish')?.addEventListener('click', () => {
                if (confirm('🚨 PERINGATAN SUPER ADMIN:\nApakah Anda yakin ingin menggusur bangunan ini? Kavling akan dikembalikan menjadi tanah kosong.')) {
                    if (this.callbacks.onAdminDemolishBuilding) {
                        this.callbacks.onAdminDemolishBuilding(building);
                    }
                }
            });

            document.getElementById('btn-admin-instant-finish')?.addEventListener('click', () => {
                if (this.callbacks.onAdminFinishBuilding) {
                    this.callbacks.onAdminFinishBuilding(building);
                }
            });

            document.getElementById('btn-admin-instant-municipal')?.addEventListener('click', () => {
                if (this.callbacks.onAdminBuildMunicipal) {
                    this.callbacks.onAdminBuildMunicipal(plotInfo);
                }
            });
        }

        card.style.display = 'block';
    }

    hidePlotCard() {
        const card = document.getElementById('hud-plot-card');
        if (card) card.style.display = 'none';
        this.currentPlot = null;
        this.currentBuilding = null;
        this.callbacks.onDeselectPlot && this.callbacks.onDeselectPlot();
    }

    updateWorkCardTimers() {
        if (!this.currentBuilding || this.currentBuilding.stage !== 'selesai') return;

        const btn = document.getElementById('btn-work-building');
        if (!btn || !btn.disabled) return;

        const canWorkRes = playerState.canWork();
        if (canWorkRes.allowed) {
            this.showPlotCard(this.currentPlot, this.currentBuilding);
        } else if (canWorkRes.reason === 'cooldown') {
            btn.textContent = `⏳ Istirahat (${canWorkRes.timeString})`;
        }
    }

    async handleWorkClick(building) {
        if (this.callbacks.onWorkBuilding) {
            const res = await this.callbacks.onWorkBuilding(building);
            if (res && res.success) {
                this.playMelodicCoinSound();
                this.showToast(
                    '💼 Upah Kerja Diterima!',
                    `Kamu memperoleh +${res.reward} ₳. Pajak kota +${res.taxAmount} ₳ telah disetor ke Kas Kota!`,
                    '🪙'
                );
                this.showPlotCard(this.currentPlot, this.currentBuilding);
            } else if (res && res.message) {
                alert(res.message);
            }
        }
    }

    playMelodicCoinSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(587.33, now);
            osc1.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gain1.gain.setValueAtTime(0.15, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.22);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1174.66, now + 0.08);
            gain2.gain.setValueAtTime(0.12, now + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.35);
        } catch (e) {}
    }

    showToast(title, message, icon = '📢') {
        const toastContainer = document.getElementById('hud-toast-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = 'hud-toast';
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${message}</div>
            </div>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fadeout');
            setTimeout(() => toast.remove(), 250);
        }, 4000);
    }
}
`;

fs.writeFileSync(hudPath, content, 'utf8');
console.log('Successfully wrote updated hud.js');

