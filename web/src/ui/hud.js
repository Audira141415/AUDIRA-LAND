/**
 * AUDIRA-LAND: Antarmuka HUD Pengguna (Heads-Up Display)
 * Menerapkan gaya "Tinta Hangat" Neo-Brutalisme yang Rapi, Bersih, dan Tanpa Tumpang-Tindih.
 * Mendukung Peran Ganda: Super Admin (Otoritas Tata Kota & Kas) vs Warga Biasa (Gotong Royong).
 */

import { playerState } from '../core/player_state.js';
import { professionsForWorkplace, PROFESSION_BONUS_RATE } from '../core/professions.js';
import { claimFeeFor, identityOf, isGotongRoyong, villageIdOf } from '../core/village_identity.js';
import { CROPS, getCrop, cropOf } from '../core/crops.js';

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

        this.container.innerHTML = `
            <!-- 1. Header Bar Atas: Rapi, Satu Baris Fleksibel, Tanpa Tumpukan Mengambang -->
            <header class="hud-header">
                <!-- Profil Warga / Admin Aktif -->
                <div class="hud-profile-pill" id="hud-profile-btn" title="Klik untuk lihat KTP Digital & Detail Akun">
                    <div class="profile-avatar" id="hud-avatar" style="background-color: ${p.avatarColor || '#5B3A24'};">
                        ${p.avatarDataUrl
                            ? `<img class="profile-avatar-img" src="${p.avatarDataUrl}" alt="Foto profil" />`
                            : (p.username ? p.username.charAt(0).toUpperCase() : 'W')}
                    </div>
                    <div class="profile-meta">
                        <div class="profile-top-line">
                            <span class="profile-name" id="hud-username">${p.username || 'Tamu Netizen'}</span>
                            <span class="hud-role-tag ${isSuper ? 'tag-super' : 'tag-warga'}" id="hud-role-tag">
                                ${isSuper ? '👑 Super Admin' : (p.isRegistered ? '👤 Warga' : '👀 Tamu')}
                            </span>
                        </div>
                        <span class="profile-profession" id="hud-profession">${p.profession || 'Warga'}</span>
                    </div>
                </div>

                <!-- Satu-satunya entri Daftar/Masuk warga (auto-sembunyi bila sudah terdaftar) -->
                <button class="hud-ig-btn" id="btn-hud-ig-register" style="${p.isRegistered ? 'display: none;' : ''}" title="Daftar warga baru via Instagram @audira.id, atau masuk kembali dengan @username">
                    <span class="ig-icon">📸</span>
                    <span class="ig-text">Daftar / Masuk</span>
                </button>

                <!-- Panel Warga (profil, saldo, rumah, kerja, voting) - hanya untuk warga terdaftar -->
                <button class="hud-role-switch-btn" id="btn-open-citizen-panel" style="${p.isRegistered ? '' : 'display: none;'}" title="Panel Warga: profil, saldo, rumah, kerja, voting">
                    🏠 Panel Warga
                </button>

                <!-- Tombol Buka Dashboard Super Admin (Hanya Aktif saat Role Super Admin) -->
                <button class="hud-admin-panel-btn" id="btn-open-admin-panel" style="${isSuper ? 'display: inline-flex;' : 'display: none;'}" title="Buka Dashboard Otoritas Walikota & Tata Kota">
                    ⚙️ Panel Admin
                </button>

                <!-- Statistik Kota: Warga, Kas Kota ₳, Kepuasan 85%, Status Desa -->
                <div class="hud-stats-group">
                    <div class="hud-stat-pill" title="Populasi Warga Terdaftar">
                        <span class="stat-icon">👥</span>
                        <span class="stat-val" id="hud-pop-count">0</span>
                    </div>
                    <div class="hud-stat-pill" id="hud-treasury-badge" style="${p.isRegistered ? '' : 'display: none;'}" title="Kas Perbendaharaan Kota AUDIRA LAND">
                        <span class="stat-icon">💰</span>
                        <span class="stat-val" id="hud-treasury-amount">${treasury.toLocaleString('id-ID')} ₳</span>
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
        `;

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

        // Panel Warga (chunk lazy)
        document.getElementById('btn-open-citizen-panel')?.addEventListener('click', () => {
            if (this.callbacks.onOpenCitizenPanel) this.callbacks.onOpenCitizenPanel();
        });

        // Klik Tombol Status Desa (HAVE vs HAVE-NOT)
        document.getElementById('btn-open-village-status')?.addEventListener('click', () => {
            if (this.callbacks.onOpenVillageStatus) {
                this.callbacks.onOpenVillageStatus();
            }
        });

        // Satu-satunya entri Daftar/Masuk warga (topbar)
        document.getElementById('btn-hud-ig-register')?.addEventListener('click', () => {
            if (this.callbacks.onOpenProfile) {
                this.callbacks.onOpenProfile();
            }
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

    /** Jumlah warga terdaftar (server bila tersambung, kalau tidak dari daftar warga lokal). */
    setPopulation(n) {
        const el = document.getElementById('hud-pop-count');
        if (el) el.textContent = Math.max(0, n | 0).toLocaleString('id-ID');
    }

    updatePlayerUI(state) {
        const nameEl = document.getElementById('hud-username');
        const profEl = document.getElementById('hud-profession');
        const avatarEl = document.getElementById('hud-avatar');
        const roleTagEl = document.getElementById('hud-role-tag');
        const citizenBtn = document.getElementById('btn-open-citizen-panel');
        const adminBtn = document.getElementById('btn-open-admin-panel');
        const registerBtn = document.getElementById('btn-hud-ig-register');

        const isSuper = playerState.isSuperAdmin();

        if (nameEl) nameEl.textContent = state.username || 'Tamu Netizen';
        if (profEl) profEl.textContent = state.profession || 'Warga';
        if (avatarEl) {
            avatarEl.style.backgroundColor = state.avatarColor || '#5B3A24';
            if (state.avatarDataUrl) {
                avatarEl.innerHTML = `<img class="profile-avatar-img" src="${state.avatarDataUrl}" alt="Foto profil" />`;
            } else {
                avatarEl.textContent = state.username ? state.username.charAt(0).toUpperCase() : 'W';
            }
        }

        if (roleTagEl) {
            roleTagEl.className = `hud-role-tag ${isSuper ? 'tag-super' : 'tag-warga'}`;
            roleTagEl.textContent = isSuper ? '👑 Super Admin' : (state.isRegistered ? '👤 Warga' : '👀 Tamu');
        }

        if (citizenBtn) citizenBtn.style.display = state.isRegistered ? '' : 'none';

        if (adminBtn) {
            adminBtn.style.display = isSuper ? 'inline-flex' : 'none';
        }

        // Tombol Daftar/Masuk hanya untuk tamu; sembunyikan begitu terdaftar
        if (registerBtn) registerBtn.style.display = state.isRegistered ? 'none' : '';

        // Pill koin/kas kota: fitur warga terdaftar, sembunyi dari tamu global
        const treasuryBadge = document.getElementById('hud-treasury-badge');
        if (treasuryBadge) treasuryBadge.style.display = state.isRegistered ? '' : 'none';
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
    esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /** Kartu profil (E-KTP) pemilik rumah; muncul saat rumah diklik lalu tombol profil ditekan. */
    /**
     * Blok "Profil Rumah" di kartu kavling: pemilik (IG), profesi, desa, rumah, kendaraan, dan
     * progres pembangunan bila masih proyek. Data warga lain ditebak dari model kit rumahnya.
     */
    houseProfileHtml(building) {
        const pr = playerState.getCitizenProfile(building);
        const ig = pr.igUsername ? this.esc(pr.igUsername) : null;
        const initial = this.esc(pr.username.replace(/^@/, '').charAt(0).toUpperCase()) || 'W';
        const row = (k, v) => (v ? `<div class="hp-row"><span>${k}</span><b>${this.esc(v)}</b></div>` : '');
        let progress = '';
        if (building.stage === 'proyek') {
            const s = new Date(building.build_started_at).getTime(), f = new Date(building.build_finished_at).getTime();
            if (isFinite(s) && isFinite(f) && f > s) {
                const p = Math.min(1, Math.max(0, (Date.now() - s) / (f - s)));
                const left = Math.max(0, Math.ceil((f - Date.now()) / 60000));
                progress = `<div class="hp-progress" role="progressbar" aria-valuenow="${Math.round(p * 100)}" aria-valuemin="0" aria-valuemax="100">
                    <div class="hp-bar"><i style="width:${Math.round(p * 100)}%"></i></div>
                    <span>${p >= 1 ? 'Hampir jadi' : `${Math.round(p * 100)}% · sisa ±${left} menit`}</span></div>`;
            }
        }
        return `
            <div class="house-profile">
                <div class="hp-head">
                    <span class="hp-avatar" style="background:${this.esc(pr.avatarColor)}">${pr.avatarDataUrl
                        ? `<img class="hp-avatar-img" src="${pr.avatarDataUrl}" alt="Foto ${this.esc(pr.username)}" />`
                        : initial}</span>
                    <div class="hp-id">
                        <b>${this.esc(pr.username)}</b>${pr.isMe ? ' <span class="hp-me">Kamu</span>' : ''}
                        ${ig ? `<a href="https://instagram.com/${encodeURIComponent(pr.igUsername)}" target="_blank" rel="noopener noreferrer">📷 instagram.com/${ig}</a>` : ''}
                    </div>
                </div>
                ${row('💼 Profesi', pr.profession)}
                ${row('🏘️ Desa', pr.villageTitle)}
                ${row('🏠 Rumah', pr.houseLabel)}
                ${row('🚗 Kendaraan', pr.vehicleLabel)}
                ${row('🪪 NIK', pr.nik !== '—' ? pr.nik : null)}
                ${progress}
            </div>`;
    }

    showOwnerProfile(building) {
        const pr = playerState.getCitizenProfile(building);
        let overlay = document.getElementById('owner-profile-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'owner-profile-overlay';
            overlay.className = 'modal-backdrop';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', 'Profil Warga');
            document.body.appendChild(overlay);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target.closest('#btn-owner-profile-close')) {
                    overlay.classList.remove('active');
                }
            });
        }
        const initial = this.esc(pr.username.replace(/^@/, '').charAt(0).toUpperCase()) || 'W';
        const since = pr.createdAt ? new Date(pr.createdAt).toLocaleDateString('id-ID') : '—';
        overlay.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <div class="modal-title-wrap">
                        <span class="modal-icon" aria-hidden="true">🪪</span>
                        <div>
                            <h2 class="modal-title">${pr.isMe ? 'Profilku' : 'Profil Pemilik Rumah'}</h2>
                            <p class="modal-subtitle">${this.esc(pr.houseTitle)}</p>
                        </div>
                    </div>
                    <button class="modal-close" id="btn-owner-profile-close" aria-label="Tutup">✕</button>
                </div>
                <div class="ktp-card-wrap">
                    <div class="ktp-card">
                        <div class="ktp-header-strip">
                            <div class="ktp-emblem">🇮🇩</div>
                            <div class="ktp-gov-title">
                                <h3>REPUBLIK KOTA AUDIRA LAND</h3>
                                <h4>KARTU TANDA WARGA ELEKTRONIK (E-KTP)</h4>
                            </div>
                            <div class="ktp-hologram">★ RESMI ★</div>
                        </div>
                        <div class="ktp-content-body">
                            <div class="ktp-photo-col">
                                <div class="ktp-avatar-box" style="background-color: ${this.esc(pr.avatarColor)};">
                                    ${pr.avatarDataUrl
                                        ? `<img class="ktp-avatar-img" src="${pr.avatarDataUrl}" alt="Foto ${this.esc(pr.username)}" />`
                                        : `<span class="avatar-letter">${initial}</span>`}
                                </div>
                                <div class="ktp-signature">
                                    <span>Agus Dwi R</span>
                                    <small>Walikota</small>
                                </div>
                            </div>
                            <div class="ktp-details-col">
                                <div class="ktp-field-row"><span class="ktp-label">NIK</span><span class="ktp-val bold">${this.esc(pr.nik)}</span></div>
                                <div class="ktp-field-row"><span class="ktp-label">NAMA</span><span class="ktp-val bold">${pr.igUsername ? `<a class="ktp-ig-link" href="https://www.instagram.com/${encodeURIComponent(pr.igUsername)}/" target="_blank" rel="noopener noreferrer">${this.esc(pr.username)} ↗</a>` : this.esc(pr.username)}</span></div>
                                <div class="ktp-field-row"><span class="ktp-label">PROFESI</span><span class="ktp-val">${this.esc(pr.profession)}</span></div>
                                <div class="ktp-field-row"><span class="ktp-label">WILAYAH</span><span class="ktp-val">${this.esc(pr.villageTitle.toUpperCase())} (${pr.villageId === 'have' ? 'BARAT' : 'TIMUR'})</span></div>
                                <div class="ktp-field-row"><span class="ktp-label">RUMAH</span><span class="ktp-val">${this.esc(pr.houseTitle)}</span></div>
                                ${pr.vehicleLabel ? `<div class="ktp-field-row"><span class="ktp-label">KENDARAAN</span><span class="ktp-val">${this.esc(pr.vehicleLabel)}</span></div>` : ''}
                                ${pr.isMe && pr.coins !== null ? `<div class="ktp-field-row"><span class="ktp-label">SALDO</span><span class="ktp-val gold">${pr.coins} ₳</span></div>` : ''}
                            </div>
                        </div>
                        <div class="ktp-footer-strip">
                            <span>BERLAKU: SEUMUR HIDUP</span>
                            <span>TERDAFTAR: ${since}</span>
                        </div>
                    </div>
                </div>
            </div>`;
        overlay.classList.add('active');
    }

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
        // Bangunan muncul dari warga (bukan dibuat pengelola): kotak hanya untuk kavling berisi bangunan
        if (isSuper && building) {
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
                        ` : ''}
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

            // Pemilik: owner_id (id lokal atau id akun server, lihat playerState.isMyId); data lama tanpa owner_id pakai nama
            const isOwner = building.owner_id
                ? playerState.isMyId(building.owner_id)
                : playerState.state.username === building.owner_name;

            // A. Bangunan Masih dalam Tahap Konstruksi (Proyek)
            if (building.stage === 'proyek') {
                iconEl.textContent = '🏗️';
                const pr = playerState.getCitizenProfile(building);
                titleEl.textContent = `${building.title || pr.houseTitle || 'Proyek Konstruksi'} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;
                bodyEl.innerHTML = `
                    <div class="building-card-meta">
                        <span class="owner-pill">🏗️ Kavling Milik Warga · Sedang Dibangun</span>
                    </div>
                    ${building.is_public ? '' : this.houseProfileHtml(building)}
                    <p class="plot-card-desc">Rumah sedang dibangun. Hitung mundurnya juga tampil di papan proyek 3D di lokasi.</p>
                    <div class="plot-card-actions">
                        <button class="btn-action" disabled>⏳ Sedang Dibangun</button>
                        ${building.is_public ? '' : '<button class="btn-action" id="btn-owner-profile">🪪 Lihat Profil Pemilik</button>'}
                    </div>
                    ${adminActionBoxHtml}
                `;
                document.getElementById('btn-owner-profile')?.addEventListener('click', () => this.showOwnerProfile(building));
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
                        </div>
                        ${this.houseProfileHtml(building)}
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
                        ${this.harvestBoxHtml(building)}
                        ${this.rentBoxHtml(building)}
                        <div class="plot-card-actions">
                            <button class="btn-action success pulse" id="btn-rest-home">🛌 Istirahat di Rumah (Pulihkan Tenaga)</button>
                            <button class="btn-action" id="btn-owner-profile">🪪 Lihat Profilku</button>
                        </div>
                        ${adminActionBoxHtml}
                    `;
                    document.getElementById('btn-owner-profile')?.addEventListener('click', () => this.showOwnerProfile(building));

                    document.getElementById('btn-collect-rent')?.addEventListener('click', () => {
                        const res = playerState.collectRent(building);
                        if (res.success) {
                            this.playMelodicCoinSound();
                            this.showToast('🏪 Sewa Diterima', `Kamu menerima sewa +${res.amount} ₳ dari ${building.title || 'usahamu'}.`, '🪙');
                        } else {
                            this.showToast('🏪 Belum Bisa Ambil Sewa', res.message, '⏳');
                        }
                        this.showPlotCard(plotInfo, building);
                    });

                    document.getElementById('btn-harvest')?.addEventListener('click', async () => {
                        const res = await playerState.harvest(building);
                        if (res.success) {
                            this.playMelodicCoinSound();
                            const h = getCrop(cropOf(building)).hours;
                            this.showToast('🌾 Panen Berhasil', `Kamu memanen ${building.title || 'kebunmu'} dan memperoleh +${res.amount} ₳. Panen lagi ${h} jam lagi.`, '🌾');
                        } else {
                            this.showToast('🌾 Belum Bisa Panen', res.message, '⏳');
                        }
                        this.showPlotCard(plotInfo, building);
                    });

                    document.querySelectorAll('.crop-chip').forEach(chip => {
                        chip.addEventListener('click', async () => {
                            const res = await playerState.setCrop(building, chip.getAttribute('data-crop'));
                            if (res.success) {
                                const c = getCrop(res.crop);
                                this.showToast('🌱 Ditanam', `Sawahmu kini ditanami ${c.icon} ${c.name}. Panen ${c.amount} ₳ tiap ${c.hours} jam.`, '🌱');
                                if (window.game?.buildingLoader) window.game.buildingLoader.refreshBuildingMesh?.(building.id, res.crop);
                            } else {
                                this.showToast('🌱 Gagal Menanam', res.message, '⚠️');
                            }
                            this.showPlotCard(plotInfo, building);
                        });
                    });

                    document.getElementById('btn-rest-home')?.addEventListener('click', () => {
                        playerState.resetCooldownForDev();
                        this.playMelodicCoinSound();
                        this.showToast('🏡 Beristirahat Nyaman', `Kamu beristirahat di ${building.title || 'rumahmu'}. Stamina telah pulih dan siap kembali beraktivitas!`, '✨');
                        this.showPlotCard(plotInfo, building);
                    });
                } else {
                    // Gotong royong: warga Have-Not boleh bekerja di bangunan tetangga se-desa (+10 ₳)
                    const gotong = playerState.state.isRegistered && isGotongRoyong({
                        playerVillage: playerState.getVillageId(), playerId: playerState.myIdFor(building),
                        playerName: playerState.state.username, building
                    });
                    bodyEl.innerHTML = `
                        <div class="status-badge have">✅ STATUS: HAVE (SUDAH ADA)</div>
                        <div class="building-card-meta">
                            <span class="owner-pill private">🏠 Rumah Warga</span>
                        </div>
                        ${this.houseProfileHtml(building)}
                        <p class="plot-card-desc">Kediaman pribadi milik sesama warga.</p>
                        ${gotong ? this.workBoxHtml(building, '🤝 Bantu Tetangga') : ''}
                        <div class="plot-card-actions">
                            <button class="btn-action" id="btn-visit-neighbor">👋 Bertamu & Silaturahmi</button>
                            <button class="btn-action" id="btn-owner-profile">🪪 Lihat Profil Pemilik</button>
                        </div>
                        ${adminActionBoxHtml}
                    `;
                    if (gotong) this.bindWorkButtons(plotInfo, building);

                    document.getElementById('btn-owner-profile')?.addEventListener('click', () => this.showOwnerProfile(building));

                    document.getElementById('btn-visit-neighbor')?.addEventListener('click', () => {
                        this.showToast('👋 Silaturahmi Antar-Warga', `Kamu berkunjung ke rumah ${building.owner_name}. Mempererat tali persaudaraan antarwarga!`, '🤝');
                    });
                }
            }
            // C. Fasilitas Publik Kota (Civic Infrastructure)
            else {
                iconEl.textContent = meta.icon || '🏛️';
                titleEl.textContent = `${meta.title} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;

                bodyEl.innerHTML = `
                    <div class="status-badge have">✅ STATUS: HAVE (SUDAH ADA)</div>
                    <div class="building-card-meta">
                        <span class="owner-pill public">🏛️ Fasilitas Publik</span>
                        <span class="owner-name">Pengelola: <b>${building.owner_name || 'Pemerintah Kota'}</b></span>
                    </div>
                    <p class="plot-card-desc">${meta.desc}</p>
                    ${this.workBoxHtml(building, meta.jobTitle)}
                    ${adminActionBoxHtml}
                `;
                this.bindWorkButtons(plotInfo, building);
            }
        }
        // KASUS 1B: RUANG PUBLIK (jalan, taman, sungai) — tidak bisa diklaim
        else if (plotInfo.isLot === false || plotInfo.isOpenSpace || plotInfo.isRiver) {
            const kind = plotInfo.isRiver ? { icon: '🌊', name: 'Sungai', desc: 'Aliran sungai pemisah Desa Have dan Desa Have-Not.' }
                : plotInfo.isMonument ? { icon: '🔠', name: 'Tulisan Nama Desa', desc: 'Huruf raksasa penanda Desa Have dan Desa Have-Not.' }
                : plotInfo.isOpenSpace ? { icon: '🌳', name: 'Taman Kota', desc: 'Ruang terbuka hijau milik bersama warga.' }
                : { icon: '🛣️', name: 'Jalan Umum', desc: 'Jalan milik kota untuk lalu lintas warga.' };
            iconEl.textContent = kind.icon;
            titleEl.textContent = `${kind.name} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;
            bodyEl.innerHTML = `
                <div class="building-card-meta">
                    <span class="owner-pill">🏛️ Ruang Publik</span>
                    <span class="owner-name">Status: <b>Tidak bisa diklaim</b></span>
                </div>
                <p class="plot-card-desc">${kind.desc} Pilih kavling kosong di samping jalan untuk membangun.</p>
            `;
        }
        // KASUS 2: KAVLING KOSONG (KLAIM PROPERTI)
        else {
            iconEl.textContent = '📍';
            titleEl.textContent = `Distrik ${plotInfo.district.name} [${plotInfo.tileI}, ${plotInfo.tileJ}]`;

            const isReg = playerState.state.isRegistered;
            const lotRule = identityOf(villageIdOf(plotInfo));
            const lotFee = claimFeeFor(plotInfo);

            bodyEl.innerHTML = `
                <div class="status-badge havenot">🚧 STATUS: HAVE-NOT (BELUM DIBANGUN)</div>
                <div class="building-card-meta">
                    <span class="owner-pill" style="background: #E8F5E9; color: #2E7D32; border: 1px solid #81C784;">🟢 Kavling Kosong Siap Bangun</span>
                    <span class="owner-name">Status: <b>Tersedia</b></span>
                </div>
                <p class="plot-card-desc">Petak tanah kosong di ${plotInfo.district.name} siap didirikan hunian. Rumah hanya akan berdiri jika ada warga yang mendaftar dan membangunnya.</p>
                <div class="village-rule-line">${lotRule.rules.claim}</div>
                <div class="plot-cost-box">
                    <span>Biaya Klaim Kavling (${lotRule.title}):</span>
                    <span class="cost-tag highlight">${lotFee} ₳ + bangunan</span>
                </div>
                <div class="plot-card-actions">
                    <button class="btn-action primary pulse" id="btn-claim-plot">
                        ${isReg ? `🏗️ Klaim Kavling & Bangun (${lotFee} ₳ + bangunan)` : '📜 Daftar KTP untuk Miliki Kavling'}
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

    /** Kartu petak sawah hiasan desa. owner = bangunan sawah warga (type 'sawah') di titik itu, atau null. */
    showSawahCard(petak, owner = null) {
        this.currentPlot = null;
        this.currentBuilding = owner;
        const card = document.getElementById('hud-plot-card');
        const iconEl = document.getElementById('plot-icon');
        const titleEl = document.getElementById('plot-title');
        const bodyEl = document.getElementById('plot-card-body');
        if (!card || !bodyEl) return;

        iconEl.textContent = petak.icon || '🌾';
        titleEl.textContent = 'Petak Sawah Desa';

        if (owner) {
            const isOwner = owner.owner_id
                ? playerState.isMyId(owner.owner_id)
                : playerState.state.username === owner.owner_name;
            bodyEl.innerHTML = `
                <div class="status-badge have">✅ STATUS: DIGARAP WARGA</div>
                <div class="building-card-meta">
                    <span class="owner-pill private">🌾 Sawah Garapan</span>
                    <span class="owner-name">Pemilik: <b>${this.esc(owner.owner_name || 'Warga')}</b></span>
                </div>
                <p class="plot-card-desc">Petak sawah yang digarap ${isOwner ? '<b>olehmu</b>' : 'oleh ' + this.esc(owner.owner_name || 'warga')}. Fase tanam: <b>${this.esc(petak.phase)}</b>${petak.ripe ? ' — 🌾 siap panen' : ''}.</p>
                <div class="plot-card-actions">
                    <button class="btn-action" id="btn-sawah-owner-profile">🪪 Lihat Profil ${isOwner ? 'Milikku' : 'Pemilik'}</button>
                </div>
            `;
            document.getElementById('btn-sawah-owner-profile')?.addEventListener('click', () => this.showOwnerProfile(owner));
        } else {
            bodyEl.innerHTML = `
                <div class="status-badge havenot">🌾 SAWAH UMUM DESA</div>
                <div class="building-card-meta">
                    <span class="owner-pill">🌾 Sawah Komunal</span>
                    <span class="owner-name">Status: <b>Belum ada pemilik</b></span>
                </div>
                <p class="plot-card-desc">Hamparan sawah bersama warga desa. Fase tanam: <b>${this.esc(petak.phase)}</b>${petak.ripe ? ' — 🌾 siap panen' : ''}. Belum ada warga yang menggarap petak ini.</p>
            `;
        }

        card.style.display = 'block';
    }

    /** Kotak peluang kerja + tombol (fasilitas publik & gotong royong). Aturan dari village_identity.js. */
    workBoxHtml(building, jobTitle) {
        const canWorkRes = playerState.canWork(building);
        const wage = playerState.wageAt(building);
        const rule = identityOf(wage.village);
        const bonusProfs = professionsForWorkplace(building.type);

        let actionButtonHtml = '';
        if (!playerState.state.isRegistered) {
            actionButtonHtml = `<button class="btn-action primary" id="btn-work-auth">📜 Daftar KTP untuk Bekerja</button>`;
        } else if (!canWorkRes.allowed) {
            if (canWorkRes.reason === 'cooldown') {
                actionButtonHtml = `
                    <button class="btn-action" id="btn-work-building" disabled>⏳ Istirahat (${canWorkRes.timeString})</button>
                    <button class="btn-dev-reset" id="btn-dev-reset-cooldown" title="Reset Jeda Kerja (Khusus Pengujian Dev)">⚡ Reset Jeda</button>
                `;
            } else if (canWorkRes.reason === 'daily_cap') {
                actionButtonHtml = `<button class="btn-action" disabled>🔒 Batas Harian Penuh (300/300 ₳)</button>`;
            }
        } else {
            actionButtonHtml = `<button class="btn-action success pulse" id="btn-work-building">💼 Bekerja di Sini (+${canWorkRes.potentialReward} ₳)</button>`;
        }

        return `
            <div class="village-rule-line">${rule.rules.work}</div>
            <div class="work-opportunity-box">
                <div class="work-header">
                    <span class="work-title">💼 ${jobTitle}</span>
                    <span class="work-reward">+${wage.net} ₳${wage.matched ? ' ⭐' : ''}</span>
                </div>
                ${wage.matched
                    ? `<div class="work-bonus match">⭐ Bonus profesi ${wage.profession.icon} ${wage.profession.title}: +${wage.bonus} ₳</div>`
                    : (bonusProfs.length ? `<div class="work-bonus">Bonus +${Math.round(wage.base * PROFESSION_BONUS_RATE)} ₳ untuk: ${bonusProfs.map(p => p.icon + ' ' + p.title).join(', ')}</div>` : '')}
                ${wage.gotongRoyong ? `<div class="work-bonus match">🤝 Bantu tetangga: +${wage.gotongRoyong} ₳</div>` : ''}
                <div class="work-details">
                    <span>💰 Upah dasar ${rule.title}: <b>${wage.base} ₳</b></span>
                    ${wage.tax ? `<span>🏛️ Pajak kota 10%: <b>−${wage.tax} ₳ ke Kas Kota</b></span>` : ''}
                    <span>⏳ Durasi Shift: <b>Seketika (Jeda 10 Menit)</b></span>
                    <span>📈 Cap Harian: <b>${playerState.state.todayEarnedCoins} / 300 ₳</b></span>
                </div>
            </div>
            <div class="plot-card-actions">
                ${actionButtonHtml}
            </div>
        `;
    }

    bindWorkButtons(plotInfo, building) {
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

    /** Kotak panen untuk sawah / kebun_sayur milik sendiri di Desa Have-Not. */
    rentBoxHtml(building) {
        const st = playerState.getRentStatus(building);
        if (!st.eligible) return '';
        return `
            <div class="village-rule-line">🏪 Sewa usaha: ${st.perHour} ₳/jam (maks ${st.cap} ₳)</div>
            <div class="plot-card-actions">
                <button class="btn-action ${st.ready ? 'success pulse' : ''}" id="btn-collect-rent" ${st.ready ? '' : 'disabled'}>
                    ${st.ready ? `🏪 Kumpulkan Sewa (+${st.amount} ₳)` : `⏳ Sewa terkumpul ${st.amount} ₳ (min 10)`}
                </button>
            </div>
        `;
    }

    harvestBoxHtml(building) {
        const st = playerState.getHarvestStatus(building);
        if (!st.eligible) return '';
        const hours = Math.ceil(st.remainingMs / 3600000);
        const cur = getCrop(cropOf(building));
        const totalH = getCrop(cropOf(building)).hours;
        return `
            ${this.cropPickerHtml(building)}
            <div class="village-rule-line">${cur.icon} Tanam ${cur.name}: panen ${st.amount} ₳ tiap ${totalH} jam</div>
            <div class="plot-card-actions">
                <button class="btn-action ${st.ready ? 'success pulse' : ''}" id="btn-harvest" ${st.ready ? '' : 'disabled'}>
                    ${st.ready ? `🌾 Panen Sekarang (+${st.amount} ₳)` : `⏳ Panen lagi ±${hours} jam`}
                </button>
            </div>
        `;
    }

    /** Pilihan tanaman untuk sawah milik sendiri (chip per tanaman; klik = tanam ulang). */
    cropPickerHtml(building) {
        if (!building || building.type !== 'sawah') return '';
        const active = cropOf(building);
        const chips = CROPS.map(c => `
            <button class="crop-chip ${c.id === active ? 'active' : ''}" data-crop="${c.id}"
                title="Panen ${c.amount} ₳ tiap ${c.hours} jam">
                <span class="crop-ic">${c.icon}</span>
                <span class="crop-nm">${c.name}</span>
                <span class="crop-yl">${c.amount}₳/${c.hours}j</span>
            </button>
        `).join('');
        return `
            <div class="village-rule-line">🧑‍🌾 Pilih tanaman sawahmu (tanam ulang mulai hitung dari awal):</div>
            <div class="crop-picker">${chips}</div>
        `;
    }

    updateWorkCardTimers() {
        if (!this.currentBuilding || this.currentBuilding.stage !== 'selesai') return;

        const btn = document.getElementById('btn-work-building');
        if (!btn || !btn.disabled) return;

        const canWorkRes = playerState.canWork(this.currentBuilding);
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
                    `Kamu memperoleh +${res.reward} ₳${res.matched ? ` (termasuk bonus profesi +${res.bonus} ₳)` : ''}` +
                    (res.gotongRoyong ? ` (bantu tetangga +${res.gotongRoyong} ₳)` : '') +
                    (res.taxAmount ? `. Pajak kota ${res.taxAmount} ₳ telah disetor ke Kas Kota!` : '.'),
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
