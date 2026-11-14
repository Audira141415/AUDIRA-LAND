/**
 * AUDIRA-LAND: Modal Pendaftaran & Kartu Tanda Warga (KTP Digital)
 * Mendukung Registrasi Otomatis via Instagram (@audira.id)
 * Pengguna yang memasukkan username IG dan follow @audira.id otomatis menjadi Warga Resmi,
 * mendapatkan KTP Elektronik, dan sebidang kavling rumah luas 16m x 16m berpekarangan di Desa Have-Not.
 */

import { playerState } from '../core/player_state.js';
import { VILLAGES, HOUSE_BUILD_MS, getVillage, getProfession, cleanIgUsername, professionsForVillage, professionAllowedIn } from '../core/professions.js';
import { homeKitFor, homeThumb } from '../core/home_catalog.js';

export class AuthModal {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.activeTab = 'instagram'; // 'instagram' | 'login' | 'ktp'
        this.loginName = '';
        this.selectedColor = '#C8553D';
        this.modalEl = null;

        // Wizard pendaftaran: 1 Instagram -> 2 Desa -> 3 Profesi -> 4 Konfirmasi
        this.step = 1;
        this.draft = { ig: '', village: null, professionId: null, avatarDataUrl: null };
        this.stepLabels = ['Instagram', 'Desa', 'Profesi', 'Konfirmasi'];

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
        this.activeTab = tab;
        if (tab === 'instagram') {
            this.step = 1;
            this.draft = { ig: '', village: null, professionId: null, avatarDataUrl: null };
        }
        if (tab === 'login') this.loginName = '';
        this.render();
        this.modalEl.classList.add('active', 'visible');
        this.modalEl.style.display = 'flex';
    }

    hide() {
        this.modalEl.classList.remove('active', 'visible');
        this.modalEl.style.display = 'none';
    }

    render() {
        const p = playerState.state;
        const isReg = p.isRegistered;
        const icon = this.activeTab === 'instagram' ? '📸' : (this.activeTab === 'login' ? '🔑' : '🪪');
        const title = this.activeTab === 'instagram' ? 'Integrasi Warga Resmi via Instagram'
            : (this.activeTab === 'login' ? 'Masuk Kembali dengan @username'
            : (isReg ? 'Kartu Tanda Warga (KTP Digital)' : 'Pendaftaran Warga'));
        let body;
        if (this.activeTab === 'instagram') body = this.renderInstagramTab();
        else if (this.activeTab === 'login') body = this.renderLoginTab();
        else body = this.renderKTPTab();

        this.modalEl.innerHTML = `
            <div class="modal-card auth-modal-card">
                <!-- Modal Header -->
                <div class="modal-header">
                    <div class="modal-title-wrap">
                        <span class="modal-icon">${icon}</span>
                        <div>
                            <h2 class="modal-title">${title}</h2>
                            <p class="modal-subtitle">AUDIRA LAND • Desa Have & Desa Have-Not</p>
                        </div>
                    </div>
                    <button class="modal-close" id="btn-auth-close">✕</button>
                </div>

                <!-- Tab Navigation Bar -->
                <div class="auth-tabs-row">
                    <button class="auth-tab-btn ${this.activeTab === 'instagram' ? 'active' : ''}" id="tab-btn-ig">
                        📸 Daftar via Instagram @audira.id
                    </button>
                    <button class="auth-tab-btn ${this.activeTab === 'login' ? 'active' : ''}" id="tab-btn-login">
                        🔑 Masuk dengan @username
                    </button>
                    ${isReg ? `
                        <button class="auth-tab-btn ${this.activeTab === 'ktp' ? 'active' : ''}" id="tab-btn-ktp">
                            🪪 KTP Digital Saya
                        </button>
                    ` : ''}
                </div>

                <div class="modal-body auth-modal-body">
                    ${body}
                </div>
            </div>
        `;

        this.bindDynamicEvents();
    }

    renderLoginTab() {
        const known = playerState.knownUsernames();
        const list = known.length
            ? `<div class="login-known">
                   <div class="login-known-title">Warga di perangkat ini:</div>
                   <div class="login-known-chips">
                       ${known.map(u => `<button type="button" class="login-chip" data-login-user="${this.escape(u)}">@${this.escape(u)}</button>`).join('')}
                   </div>
               </div>`
            : `<p class="login-empty">Belum ada warga tersimpan di perangkat ini. Daftar dulu lewat tab <b>Daftar via Instagram</b>.</p>`;

        return `
            <div class="ig-form-card">
                <div class="ig-step-box">
                    <div class="step-num">🔑</div>
                    <div class="step-content">
                        <label class="step-title" for="input-login-username">Masuk kembali sebagai:</label>
                        <div class="ig-input-wrap">
                            <span class="ig-at-symbol">@</span>
                            <input type="text" id="input-login-username" class="ig-input-field"
                                   placeholder="username_kamu" autocomplete="off" autocapitalize="off" spellcheck="false"
                                   value="${this.escape(this.loginName)}" maxlength="31" />
                        </div>
                        <span class="ig-input-hint" id="login-input-hint">Username warga yang sudah pernah daftar di HP/browser ini.</span>
                    </div>
                </div>
                ${list}
                <div class="onb-nav">
                    <span></span>
                    <button type="button" class="onb-btn primary" id="btn-submit-login">🔑 Masuk</button>
                </div>
            </div>
        `;
    }

    renderInstagramTab() {
        const d = this.draft;
        const stepper = `
            <ol class="onb-stepper" aria-label="Langkah pendaftaran">
                ${this.stepLabels.map((label, idx) => {
                    const n = idx + 1;
                    const cls = n === this.step ? 'current' : (n < this.step ? 'done' : '');
                    return `<li class="onb-step ${cls}"><span class="onb-step-num">${n < this.step ? '✓' : n}</span><span class="onb-step-label">${label}</span></li>`;
                }).join('')}
            </ol>`;

        let body = '';
        if (this.step === 1) {
            body = `
                <div class="ig-step-box">
                    <div class="step-num">1</div>
                    <div class="step-content">
                        <div class="step-title">Follow akun resmi Instagram:</div>
                        <a href="https://www.instagram.com/audira.id/" target="_blank" rel="noopener noreferrer" class="ig-follow-action-btn">
                            <span class="ig-cam-icon">📸</span>
                            <span>Buka & Follow @audira.id</span>
                            <span class="ext-icon">↗</span>
                        </a>
                    </div>
                </div>
                <div class="ig-step-box">
                    <div class="step-num">2</div>
                    <div class="step-content">
                        <label class="step-title" for="input-ig-username">Username Instagram kamu:</label>
                        <div class="ig-input-wrap">
                            <span class="ig-at-symbol">@</span>
                            <input type="text" id="input-ig-username" class="ig-input-field"
                                   placeholder="username_kamu" autocomplete="off" autocapitalize="off" spellcheck="false"
                                   value="${this.escape(d.ig)}" maxlength="31" />
                        </div>
                        <span class="ig-input-hint" id="ig-input-hint">Huruf, angka, titik, atau garis bawah.</span>
                    </div>
                </div>
                <div class="ig-step-box">
                    <div class="step-num">3</div>
                    <div class="step-content">
                        <div class="step-title">Foto profil <span class="ig-optional">(opsional)</span></div>
                        <div class="avatar-pick-row">
                            <span class="avatar-pick-preview" id="avatar-pick-preview">${d.avatarDataUrl
                                ? `<img src="${d.avatarDataUrl}" alt="Pratinjau foto profil" />`
                                : (d.ig ? this.escape(d.ig.charAt(0).toUpperCase()) : '👤')}</span>
                            <div class="avatar-pick-actions">
                                <label class="avatar-pick-btn" for="input-avatar-file">📷 ${d.avatarDataUrl ? 'Ganti foto' : 'Pilih foto'}</label>
                                <input type="file" id="input-avatar-file" accept="image/*" hidden />
                                ${d.avatarDataUrl ? '<button type="button" class="avatar-pick-clear" id="btn-avatar-clear">Hapus</button>' : ''}
                            </div>
                        </div>
                        <span class="ig-input-hint" id="avatar-input-hint">Fotomu sendiri. Dipotong kotak & diperkecil otomatis. Dilewati = pakai inisial.</span>
                    </div>
                </div>`;
        } else if (this.step === 2) {
            body = `
                <div class="onb-question">Kamu mau tinggal di mana?</div>
                <div class="village-grid">
                    ${VILLAGES.map(v => `
                        <button type="button" class="village-card village-${v.id} ${d.village === v.id ? 'selected' : ''}" data-village="${v.id}" aria-pressed="${d.village === v.id}">
                            <span class="village-icon">${v.icon}</span>
                            <span class="village-title">${v.title}</span>
                            <span class="village-tagline">${v.tagline}</span>
                            <span class="village-desc">${v.desc}</span>
                            <span class="village-house">🏠 Rumah & kendaraan sesuai profesimu</span>
                        </button>
                    `).join('')}
                </div>`;
        } else if (this.step === 3) {
            body = `
                <div class="onb-question">Pilih profesimu di ${getVillage(d.village)?.title || 'desamu'}:</div>
                <div class="profession-grid">
                    ${professionsForVillage(d.village).map(prof => {
                        const k = homeKitFor(d.village, prof.id);
                        return `
                        <button type="button" class="profession-card ${prof.id === d.professionId ? 'selected' : ''}" data-prof="${prof.id}" aria-pressed="${prof.id === d.professionId}">
                            <div class="prof-icon">${prof.icon}</div>
                            <div class="prof-info">
                                <div class="prof-title">${prof.title}</div>
                                <div class="prof-desc">${prof.desc}</div>
                                ${k ? `<div class="prof-kit">🏠 ${k.houseLabel} · 🚗 ${k.vehicleLabel}</div>` : ''}
                            </div>
                        </button>`;
                    }).join('')}
                </div>
                ${this.renderKitPreview(d.village, d.professionId)}`;
        } else {
            const v = getVillage(d.village);
            const prof = getProfession(d.professionId);
            const mins = Math.round(HOUSE_BUILD_MS / 60000);
            const kit = v && prof ? homeKitFor(v.id, prof.id) : null;
            body = `
                ${this.renderKitPreview(d.village, d.professionId)}
                <div class="onb-summary">
                    <div class="onb-summary-row"><span>Username</span><b>@${this.escape(d.ig)}</b></div>
                    <div class="onb-summary-row"><span>Tempat tinggal</span><b>${v ? `${v.icon} ${v.title}` : '-'}</b></div>
                    <div class="onb-summary-row"><span>Profesi</span><b>${prof ? `${prof.icon} ${prof.title}` : '-'}</b></div>
                    <div class="onb-summary-row"><span>Rumah</span><b>${kit ? kit.houseLabel : (v ? v.houseLabel : '-')}, dibangun ${mins} menit</b></div>
                    <div class="onb-summary-row"><span>Kendaraan</span><b>${kit ? kit.vehicleLabel : '-'}</b></div>
                    <div class="onb-summary-row"><span>Modal awal</span><b class="gold">500 ₳</b></div>
                </div>
                <div class="ig-verify-row">
                    <input type="checkbox" id="check-ig-follow-verified" checked />
                    <label for="check-ig-follow-verified">
                        Saya sudah follow <strong>@audira.id</strong> dan siap tinggal di AUDIRA LAND.
                    </label>
                </div>`;
        }

        const canNext = this.isStepValid(this.step);
        const nav = `
            <div class="onb-nav">
                ${this.step > 1 ? '<button type="button" class="onb-btn secondary" id="btn-onb-back">← Kembali</button>' : '<span></span>'}
                ${this.step < 4
                    ? `<button type="button" class="onb-btn primary" id="btn-onb-next" ${canNext ? '' : 'disabled'}>Lanjut →</button>`
                    : '<button type="button" class="btn-submit-ig-register" id="btn-submit-ig-register"><span>🌟 TERBITKAN KTP & BANGUN RUMAH</span></button>'}
            </div>`;

        return `
            ${this.step === 1 ? `
            <div class="ig-hero-banner">
                <div class="ig-badge-pill">★ DAFTAR WARGA VIA INSTAGRAM ★</div>
                <h3 class="ig-hero-title">Jadi warga resmi & dapat rumah gratis!</h3>
                <p class="ig-hero-desc">Isi username, pilih desa dan profesi, lalu rumahmu mulai dibangun.</p>
                <button type="button" class="ig-login-link" id="link-to-login">Sudah pernah daftar? 🔑 Masuk dengan @username</button>
            </div>` : ''}
            <div class="ig-form-card">
                ${stepper}
                ${body}
                ${nav}
            </div>
        `;
    }

    isStepValid(step) {
        const d = this.draft;
        if (step === 1) return !!cleanIgUsername(d.ig);
        if (step === 2) return !!getVillage(d.village);
        if (step === 3) return professionAllowedIn(d.professionId, d.village);
        return this.isStepValid(1) && this.isStepValid(2) && this.isStepValid(3);
    }

    /** Kartu pratinjau rumah + kendaraan untuk desa & profesi terpilih (kosong bila belum lengkap). */
    renderKitPreview(villageId, professionId) {
        const k = homeKitFor(villageId, professionId);
        if (!k) return '';
        const v = getVillage(villageId);
        const cell = (id, label, tag) => `
            <figure class="kit-item">
                <img src="${homeThumb(id)}" alt="${label}" width="80" height="80" loading="lazy" />
                <figcaption><small>${tag}</small>${label}</figcaption>
            </figure>`;
        return `
            <div class="kit-preview" aria-live="polite">
                <div class="kit-preview-title">Kamu akan dapat di ${v ? v.title : ''}:</div>
                <div class="kit-preview-row">
                    ${cell(k.house, k.houseLabel, '🏠 Rumah')}
                    ${cell(k.vehicle, k.vehicleLabel, '🚗 Kendaraan')}
                </div>
            </div>`;
    }

    escape(str) {
        return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    renderKTPTab() {
        const p = playerState.state;
        const nik = p.nik || ('AUDIRA-2026-' + (p.id ? p.id.substring(0, 5).toUpperCase() : '8899'));
        const vil = getVillage(p.village) || getVillage('have_not');
        const prof = getProfession(p.professionId);
        const lotInfo = p.assignedLot ? `Kavling [${p.assignedLot.gridI}, ${p.assignedLot.gridJ}] - ${vil.title}` : vil.title;

        return `
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
                            <div class="ktp-avatar-box" style="background-color: ${p.avatarColor || '#C8553D'};">
                                ${p.avatarDataUrl
                                    ? `<img class="ktp-avatar-img" src="${p.avatarDataUrl}" alt="Foto ${this.escape(p.username || 'warga')}" />`
                                    : `<span class="avatar-letter">${p.username ? this.escape(p.username.replace(/^@/, '').charAt(0).toUpperCase()) : 'W'}</span>`}
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
                                <span class="ktp-val bold">${nik}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">NAMA</span>
                                <span class="ktp-val bold">${this.escape(p.username || 'Warga')} ${p.isInstagramCitizen ? '✓ (IG)' : ''}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">PROFESI</span>
                                <span class="ktp-val">${prof ? `${prof.icon} ${prof.title}` : this.escape(p.profession || 'Warga')}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">WILAYAH</span>
                                <span class="ktp-val">${vil.title.toUpperCase()} (${vil.id === 'have' ? 'BARAT' : 'TIMUR'})</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">ALAMAT</span>
                                <span class="ktp-val">${lotInfo}</span>
                            </div>
                            <div class="ktp-field-row">
                                <span class="ktp-label">RUMAH</span>
                                <span class="ktp-val" id="ktp-home-status">${this.homeStatusText(p)}</span>
                            </div>
                            ${p.vehicleLabel ? `
                            <div class="ktp-field-row">
                                <span class="ktp-label">KENDARAAN</span>
                                <span class="ktp-val">${this.escape(p.vehicleLabel)}</span>
                            </div>` : ''}
                            <div class="ktp-field-row">
                                <span class="ktp-label">SALDO AWAL</span>
                                <span class="ktp-val gold">${p.coins || 500} ₳</span>
                            </div>
                        </div>
                    </div>

                    <div class="ktp-footer-strip">
                        <span>BERLAKU: SEUMUR HIDUP</span>
                        <span>TERDAFTAR: ${new Date(p.createdAt || Date.now()).toLocaleDateString('id-ID')}</span>
                    </div>
                </div>

                <!-- Action Button untuk Lihat Rumah di Peta -->
                <div class="ktp-actions-row">
                    <button class="btn-ktp-action primary" id="btn-goto-my-home">
                        🏡 Lihat Rumah Saya di Peta
                    </button>
                    <button class="btn-ktp-action secondary" id="btn-switch-to-ig-register">
                        📸 Daftarkan Akun IG Lain
                    </button>
                </div>
            </div>
        `;
    }

    goStep(n) {
        this.step = Math.min(4, Math.max(1, n));
        this.render();
    }

    /** Proses file foto profil (crop+resize+kompres) lewat chunk lazy, lalu simpan di draft. */
    async processAvatarFile(file) {
        if (!file) return;
        const hint = this.modalEl.querySelector('#avatar-input-hint');
        const prev = this.modalEl.querySelector('#avatar-pick-preview');
        if (hint) { hint.classList.remove('error'); hint.textContent = '⏳ Memproses foto…'; }
        if (prev) prev.innerHTML = '⏳';
        try {
            const { fileToAvatarDataUrl } = await import('./avatar_util.js');
            this.draft.avatarDataUrl = await fileToAvatarDataUrl(file);
            this.render();
        } catch (err) {
            this.draft.avatarDataUrl = null;
            this.render();
            const h = this.modalEl.querySelector('#avatar-input-hint');
            if (h) { h.classList.add('error'); h.textContent = err.message || 'Gagal memproses foto.'; }
        }
    }

    homeStatusText(p) {
        if (!p.homeId) return 'Belum ada';
        const b = window.game && window.game.buildingLoader && window.game.buildingLoader.loadedBuildings.get(p.homeId);
        if (b && b.data.stage === 'proyek') {
            const left = Math.max(0, new Date(b.data.build_finished_at).getTime() - Date.now());
            const sec = Math.ceil(left / 1000);
            return `🏗️ Dibangun, sisa ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        }
        return '🏡 Sudah jadi';
    }

    /** Masuk kembali sebagai warga lokal berdasarkan @username yang diketik/dipilih. */
    doLogin() {
        const hint = this.modalEl.querySelector('#login-input-hint');
        const res = playerState.loginByUsername(this.loginName);
        if (!res.success) {
            if (hint) { hint.classList.add('error'); hint.textContent = res.message; }
            return;
        }
        this.activeTab = 'ktp';
        this.render();
        if (this.callbacks && this.callbacks.onLogin) this.callbacks.onLogin(res.citizen);
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

        const tabLogin = this.modalEl.querySelector('#tab-btn-login');
        if (tabLogin) tabLogin.onclick = () => { this.activeTab = 'login'; this.render(); };

        const linkToLogin = this.modalEl.querySelector('#link-to-login');
        if (linkToLogin) linkToLogin.onclick = () => { this.activeTab = 'login'; this.render(); };

        // Tab Masuk: input + chip saran + submit
        const inputLogin = this.modalEl.querySelector('#input-login-username');
        if (inputLogin) {
            inputLogin.oninput = () => { this.loginName = inputLogin.value.trim().replace(/^@+/, ''); };
            inputLogin.onkeydown = (e) => { if (e.key === 'Enter') this.doLogin(); };
        }
        this.modalEl.querySelectorAll('[data-login-user]').forEach(chip => {
            chip.onclick = () => { this.loginName = chip.getAttribute('data-login-user'); this.doLogin(); };
        });
        const btnLogin = this.modalEl.querySelector('#btn-submit-login');
        if (btnLogin) btnLogin.onclick = () => this.doLogin();

        // Langkah 1: username IG (validasi langsung)
        const inputIG = this.modalEl.querySelector('#input-ig-username');
        if (inputIG) {
            const hint = this.modalEl.querySelector('#ig-input-hint');
            const update = () => {
                this.draft.ig = inputIG.value.trim().replace(/^@+/, '');
                const ok = !!cleanIgUsername(this.draft.ig);
                const next = this.modalEl.querySelector('#btn-onb-next');
                if (next) next.disabled = !ok;
                if (hint) {
                    hint.classList.toggle('error', !!this.draft.ig && !ok);
                    hint.textContent = (!this.draft.ig || ok)
                        ? 'Huruf, angka, titik, atau garis bawah.'
                        : 'Username hanya boleh huruf, angka, titik, atau garis bawah (maks 30).';
                }
            };
            inputIG.oninput = update;
            inputIG.onkeydown = (e) => { if (e.key === 'Enter' && this.isStepValid(1)) this.goStep(2); };
        }

        // Langkah 1: foto profil opsional (pemrosesan berat dimuat lazy)
        const inputAvatar = this.modalEl.querySelector('#input-avatar-file');
        if (inputAvatar) {
            inputAvatar.onchange = () => this.processAvatarFile(inputAvatar.files && inputAvatar.files[0]);
        }
        const btnAvatarClear = this.modalEl.querySelector('#btn-avatar-clear');
        if (btnAvatarClear) btnAvatarClear.onclick = () => { this.draft.avatarDataUrl = null; this.render(); };

        // Langkah 2: pilih desa
        this.modalEl.querySelectorAll('.village-card').forEach(card => {
            card.onclick = () => {
                this.draft.village = card.getAttribute('data-village');
                // Profesi tiap desa berbeda: pilihan lama dari desa lain dibatalkan
                if (!professionAllowedIn(this.draft.professionId, this.draft.village)) this.draft.professionId = null;
                this.render();
            };
        });

        // Langkah 3: pilih profesi
        this.modalEl.querySelectorAll('.profession-card').forEach(card => {
            card.onclick = () => {
                this.draft.professionId = card.getAttribute('data-prof');
                this.render();
            };
        });

        const btnBack = this.modalEl.querySelector('#btn-onb-back');
        if (btnBack) btnBack.onclick = () => this.goStep(this.step - 1);
        const btnNext = this.modalEl.querySelector('#btn-onb-next');
        if (btnNext) btnNext.onclick = () => { if (this.isStepValid(this.step)) this.goStep(this.step + 1); };

        // Langkah 4: terbitkan KTP & mulai bangun rumah
        const btnSubmitIG = this.modalEl.querySelector('#btn-submit-ig-register');
        if (btnSubmitIG) {
            btnSubmitIG.onclick = async () => {
                const check = this.modalEl.querySelector('#check-ig-follow-verified');
                if (check && !check.checked) {
                    alert('Centang dulu konfirmasi follow @audira.id.');
                    return;
                }
                if (!this.isStepValid(4)) return;

                btnSubmitIG.disabled = true;
                btnSubmitIG.innerHTML = '<span>⏳ Menerbitkan KTP...</span>';

                try {
                    const result = await playerState.registerViaInstagram({
                        igUsername: this.draft.ig,
                        village: this.draft.village,
                        professionId: this.draft.professionId,
                        avatarColor: this.selectedColor,
                        avatarDataUrl: this.draft.avatarDataUrl,
                        findLot: this.callbacks.findHomeLot
                    });

                    if (this.callbacks && this.callbacks.onInstagramRegistered) {
                        this.callbacks.onInstagramRegistered(result);
                    }

                    this.activeTab = 'ktp';
                    this.render();
                } catch (err) {
                    alert('Pendaftaran gagal: ' + err.message);
                    btnSubmitIG.disabled = false;
                    btnSubmitIG.innerHTML = '<span>🌟 TERBITKAN KTP & BANGUN RUMAH</span>';
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
                this.show('instagram');
            };
        }
    }
}
