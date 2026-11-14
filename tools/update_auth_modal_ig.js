const fs = require('fs');
const path = require('path');

const authModalCode = `/**
 * AUDIRA-LAND: Modal Pendaftaran & Kartu Tanda Warga (KTP Digital)
 * Mendukung Registrasi Otomatis via Instagram (@audira.id)
 * Pengguna yang memasukkan username IG dan follow @audira.id otomatis menjadi Warga Resmi,
 * mendapatkan KTP Elektronik, dan sebidang kavling rumah luas 16m x 16m berpekarangan di Desa Have-Not.
 */

import { playerState } from '../core/player_state.js';

export class AuthModal {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.activeTab = 'instagram'; // 'instagram' | 'ktp' | 'manual'
        this.selectedProfession = 'Petani Sayur Organik';
        this.selectedColor = '#C8553D';
        this.modalEl = null;

        this.professions = [
            { id: 'Petani Sayur Organik', icon: '🌾', title: 'Petani Sayur Organik', desc: 'Pengelola pekarangan cabai, jagung manis & sayuran hijau subur' },
            { id: 'Pengrajin Bambu & Ukir', icon: '🎋', title: 'Pengrajin Bambu & Ukir', desc: 'Pembuat saung bambu, pagar betek, dan furnitur kayu jati' },
            { id: 'Juragan Warung Desa', icon: '🏪', title: 'Juragan Warung Desa', desc: 'Penggerak sembako gotong royong dan kopi tubruk rakyat' },
            { id: 'Arsitek Desa Nusantara', icon: '📐', title: 'Arsitek Desa Nusantara', desc: 'Perancang tata ruang rumah panggung & lansekap hijau' },
            { id: 'Pamong Siskamling', icon: '🛡️', title: 'Pamong Siskamling', desc: 'Penjaga pos ronda malam & ketertiban musyawarah balai' },
            { id: 'Seniman Budaya', icon: '🎨', title: 'Seniman Budaya', desc: 'Pencipta mural tradisi dan kerajinan batik nusantara' }
        ];

        this.colors = [
            { hex: '#C8553D', name: 'Merah Bata Terakota' },
            { hex: '#5B3A24', name: 'Cokelat Kayu Jati' },
            { hex: '#E9A91E', name: 'Kuning Emas Nusantara' },
            { hex: '#2E2117', name: 'Tinta Gelap Arsitektur' },
            { hex: '#7FA062', name: 'Hijau Daun Lembah' }
        ];

        this.init();
    }

    init() {
        let modal = document.getElementById('auth-modal-overlay');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'auth-modal-overlay';
            modal.className = 'modal-backdrop';
            document.body.appendChild(modal);
        }
        this.modalEl = modal;
        this.render();
        this.bindEvents();
    }

    show(tab = 'instagram') {
        this.activeTab = playerState.state.isRegistered && tab !== 'instagram' ? 'ktp' : tab;
        this.render();
        this.modalEl.classList.add('visible');
    }

    hide() {
        this.modalEl.classList.remove('visible');
    }

    render() {
        const p = playerState.state;
        const isReg = p.isRegistered;
        const citizensList = playerState.citizensList || [];

        this.modalEl.innerHTML = \`
            <div class="modal-card auth-modal-card">
                <!-- Modal Header -->
                <div class="modal-header">
                    <div class="modal-title-wrap">
                        <span class="modal-icon">\${this.activeTab === 'instagram' ? '📸' : '🪪'}</span>
                        <div>
                            <h2 class="modal-title">
                                \${this.activeTab === 'instagram' ? 'Integrasi Warga Resmi via Instagram' : (isReg ? 'Kartu Tanda Warga (KTP Digital)' : 'Pendaftaran Warga')}
                            </h2>
                            <p class="modal-subtitle">Kota Gotong Royong AUDIRA LAND • Nusantara Presisi 3D</p>
                        </div>
                    </div>
                    <button class="modal-close" id="btn-auth-close">✕</button>
                </div>

                <!-- Tab Navigation Bar -->
                <div class="auth-tabs-row">
                    <button class="auth-tab-btn \${this.activeTab === 'instagram' ? 'active' : ''}" id="tab-btn-ig">
                        📸 Daftar via Instagram @audira.id
                    </button>
                    \${isReg ? \`
                        <button class="auth-tab-btn \${this.activeTab === 'ktp' ? 'active' : ''}" id="tab-btn-ktp">
                            🪪 KTP Digital Saya
                        </button>
                    \` : ''}
                </div>

                <div class="modal-body auth-modal-body">
                    \${this.activeTab === 'instagram' ? this.renderInstagramTab() : this.renderKTPTab()}
                </div>
            </div>
        \`;

        this.bindDynamicEvents();
    }

    renderInstagramTab() {
        const p = playerState.state;
        const isAlreadyIG = p.isRegistered && p.isInstagramCitizen;

        return \`
            <!-- Instagram Hero Banner -->
            <div class="ig-hero-banner">
                <div class="ig-badge-pill">★ FITUR INTEGRASI INSTAGRAM @audira.id ★</div>
                <h3 class="ig-hero-title">Jadilah Warga Resmi & Dapatkan Rumah Pekarangan Gratis!</h3>
                <p class="ig-hero-desc">
                    Cukup <strong>Follow @audira.id</strong> di Instagram dan masukkan username kamu di bawah. 
                    Sistem akan otomatis menerbitkan <strong>KTP Elektronik Digital</strong> dan membangunkan 
                    <strong>1 unit Rumah Pekarangan Luas (16m x 16m)</strong> lengkap dengan kebun sayur di <strong>Desa Have-Not</strong>!
                </p>
            </div>

            <!-- Form Registrasi Instagram -->
            <div class="ig-form-card">
                <!-- Step 1: Link Follow IG -->
                <div class="ig-step-box">
                    <div class="step-num">1</div>
                    <div class="step-content">
                        <div class="step-title">Ikuti (Follow) Akun Resmi Instagram:</div>
                        <a href="https://www.instagram.com/audira.id/" target="_blank" rel="noopener noreferrer" class="ig-follow-action-btn">
                            <span class="ig-cam-icon">📸</span>
                            <span>Buka & Follow @audira.id</span>
                            <span class="ext-icon">↗</span>
                        </a>
                    </div>
                </div>

                <!-- Step 2: Input Username -->
                <div class="ig-step-box">
                    <div class="step-num">2</div>
                    <div class="step-content">
                        <label class="step-title" for="input-ig-username">Masukkan Username Instagram Kamu:</label>
                        <div class="ig-input-wrap">
                            <span class="ig-at-symbol">@</span>
                            <input type="text" id="input-ig-username" class="ig-input-field" 
                                   placeholder="username_instagram_kamu" 
                                   value="\${p.igUsername || ''}" maxlength="30" />
                        </div>
                        <span class="ig-input-hint">Contoh: @agus_dwi_rianto atau @netizen_nusantara</span>
                    </div>
                </div>

                <!-- Step 3: Pilihan Profesi Pedesaan -->
                <div class="ig-step-box">
                    <div class="step-num">3</div>
                    <div class="step-content">
                        <label class="step-title">Pilih Profesi Pengabdian di Desa Have-Not:</label>
                        <div class="profession-grid">
                            \${this.professions.map(prof => \`
                                <div class="profession-card \${prof.id === this.selectedProfession ? 'selected' : ''}" 
                                     data-prof="\${prof.id}">
                                    <div class="prof-icon">\${prof.icon}</div>
                                    <div class="prof-info">
                                        <div class="prof-title">\${prof.title}</div>
                                        <div class="prof-desc">\${prof.desc}</div>
                                    </div>
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                </div>

                <!-- Konfirmasi Checkbox -->
                <div class="ig-verify-row">
                    <input type="checkbox" id="check-ig-follow-verified" checked />
                    <label for="check-ig-follow-verified">
                        Saya sudah mem-follow akun Instagram <strong>@audira.id</strong> dan siap bergotong royong di Kota Audira Land.
                    </label>
                </div>

                <!-- Submit Button -->
                <button type="button" class="btn-submit-ig-register" id="btn-submit-ig-register">
                    <span>🌟 TERBITKAN KTP & KLAIM RUMAH PEKARANGAN 🌟</span>
                </button>
            </div>
        \`;
    }

    renderKTPTab() {
        const p = playerState.state;
        const nik = p.nik || ('AUDIRA-2026-' + (p.id ? p.id.substring(0, 5).toUpperCase() : '8899'));
        const lotInfo = p.assignedLot ? \`Kavling [\${p.assignedLot.gridI}, \${p.assignedLot.gridJ}] - Desa Have-Not\` : 'Desa Have-Not Asri';

        return \`
            <div class="ktp-card-wrap">
                <!-- Desain Kartu Tanda Penduduk Republik Audira Land -->
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
                        <!-- Foto Avatar & QR Mini -->
                        <div class="ktp-photo-col">
                            <div class="ktp-avatar-box" style="background-color: \${p.avatarColor || '#C8553D'};">
                                <span class="avatar-letter">\${p.username ? p.username.charAt(0).toUpperCase() : 'W'}</span>
                            </div>
                            <div class="ktp-signature">
                                <span>Agus Dwi R</span>
                                <small>Walikota</small>
                            </div>
                        </div>

                        <!-- Data Kependudukan -->
                        <div class="ktp-details-col">
                            <div class="ktp-field-row">
                                <span class="ktp-label">NIK</span>
                                <span class="ktp-val bold">\${nik}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">NAMA</span>
                                <span class="ktp-val bold">\${p.username || 'Warga'} \${p.isInstagramCitizen ? '✓ (IG Verified)' : ''}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">PROFESI</span>
                                <span class="ktp-val">\${p.profession || 'Warga'}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">WILAYAH</span>
                                <span class="ktp-val">KOTA DESA HAVE-NOT (TIMUR)</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">ALAMAT</span>
                                <span class="ktp-val">\${lotInfo}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">PEKARANGAN</span>
                                <span class="ktp-val">Kebun Sayur, Saung Bambu & Sumur</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">SALDO AWAL</span>
                                <span class="ktp-val gold">\${p.coins || 500} ₳</span>
                            </div>
                        </div>
                    </div>

                    <div class="ktp-footer-strip">
                        <span>BERLAKU: SEUMUR HIDUP</span>
                        <span>TERDAFTAR: \${new Date(p.createdAt || Date.now()).toLocaleDateString('id-ID')}</span>
                    </div>
                </div>

                <!-- Action Button untuk Lihat Rumah di Peta -->
                <div class="ktp-actions-row">
                    <button class="btn-ktp-action primary" id="btn-goto-my-home">
                        🏡 Lihat Rumah & Kebun Saya di Peta 3D
                    </button>
                    <button class="btn-ktp-action secondary" id="btn-switch-to-ig-register">
                        📸 Daftarkan Akun IG Lain
                    </button>
                </div>
            </div>
        \`;
    }

    bindEvents() {
        this.modalEl.addEventListener('click', (e) => {
            if (e.target === this.modalEl) this.hide();
        });
    }

    bindDynamicEvents() {
        const btnClose = this.modalEl.querySelector('#btn-auth-close');
        if (btnClose) btnClose.onclick = () => this.hide();

        // Switch Tabs
        const tabIG = this.modalEl.querySelector('#tab-btn-ig');
        if (tabIG) tabIG.onclick = () => { this.activeTab = 'instagram'; this.render(); };

        const tabKTP = this.modalEl.querySelector('#tab-btn-ktp');
        if (tabKTP) tabKTP.onclick = () => { this.activeTab = 'ktp'; this.render(); };

        // Pilihan Profesi
        const profCards = this.modalEl.querySelectorAll('.profession-card');
        profCards.forEach(card => {
            card.onclick = () => {
                profCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedProfession = card.getAttribute('data-prof');
            };
        });

        // Submit Form Instagram
        const btnSubmitIG = this.modalEl.querySelector('#btn-submit-ig-register');
        if (btnSubmitIG) {
            btnSubmitIG.onclick = async () => {
                const inputIG = this.modalEl.querySelector('#input-ig-username');
                const rawUsername = inputIG ? inputIG.value.trim() : '';

                if (!rawUsername) {
                    alert('Harap masukkan username Instagram Anda terlebih dahulu!');
                    if (inputIG) inputIG.focus();
                    return;
                }

                btnSubmitIG.disabled = true;
                btnSubmitIG.innerHTML = '<span>⏳ Menerbitkan KTP & Membangun Pekarangan...</span>';

                try {
                    const result = await playerState.registerViaInstagram({
                        igUsername: rawUsername,
                        profession: this.selectedProfession,
                        avatarColor: this.selectedColor
                    });

                    // Callback ke main controller
                    if (this.callbacks && this.callbacks.onInstagramRegistered) {
                        this.callbacks.onInstagramRegistered(result);
                    }

                    // Tampilkan tab KTP
                    this.activeTab = 'ktp';
                    this.render();

                } catch (err) {
                    alert('Terjadi kesalahan saat pendaftaran: ' + err.message);
                    btnSubmitIG.disabled = false;
                    btnSubmitIG.innerHTML = '<span>🌟 TERBITKAN KTP & KLAIM RUMAH PEKARANGAN 🌟</span>';
                }
            };
        }

        // Tombol Lihat Rumah di Peta
        const btnGotoHome = this.modalEl.querySelector('#btn-goto-my-home');
        if (btnGotoHome) {
            btnGotoHome.onclick = () => {
                this.hide();
                const p = playerState.state;
                if (p.assignedLot && window.game && window.game.camera) {
                    window.game.camera.recenter(p.assignedLot.worldX, p.assignedLot.worldZ);
                }
            };
        }

        const btnSwitchOther = this.modalEl.querySelector('#btn-switch-to-ig-register');
        if (btnSwitchOther) {
            btnSwitchOther.onclick = () => {
                this.activeTab = 'instagram';
                this.render();
            };
        }
    }
}
`;

fs.writeFileSync(path.resolve(__dirname, '../web/src/ui/auth_modal.js'), authModalCode, 'utf8');
console.log('[AuthModal] Berhasil memperbarui auth_modal.js dengan alur Instagram!');

