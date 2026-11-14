const fs = require('fs');
const path = require('path');

// 1. UPDATE HUD.JS
const hudPath = path.resolve(__dirname, '../web/src/ui/hud.js');
let hudContent = fs.readFileSync(hudPath, 'utf8');

// Sisipkan tombol IG di header
if (!hudContent.includes('btn-hud-ig-register')) {
    const targetHeaderBtn = `                <!-- Tombol Cepat Pengganti Role (Super Admin vs Warga Biasa) -->`;
    const igButtonHtml = `                <!-- Tombol Pendaftaran Warga Resmi via Instagram @audira.id -->
                <button class="hud-ig-btn" id="btn-hud-ig-register" title="Daftar Warga Resmi via Instagram @audira.id & Dapatkan Rumah Pekarangan">
                    <span class="ig-icon">📸</span>
                    <span class="ig-text">Daftar Warga IG</span>
                </button>

                <!-- Tombol Cepat Pengganti Role (Super Admin vs Warga Biasa) -->`;

    if (hudContent.includes(targetHeaderBtn)) {
        hudContent = hudContent.replace(targetHeaderBtn, igButtonHtml);
        console.log('[HUD] Berhasil menyematkan tombol IG di Header!');
    }
}

// Hubungkan event click tombol IG
if (!hudContent.includes("btnIG.onclick = () =>")) {
    const targetBinding = `        const btnToggleRole = document.getElementById('btn-quick-toggle-role');`;
    const igBinding = `        const btnIG = document.getElementById('btn-hud-ig-register');
        if (btnIG) {
            btnIG.onclick = () => {
                if (window.game && window.game.authModal) {
                    window.game.authModal.show('instagram');
                }
            };
        }

        const btnToggleRole = document.getElementById('btn-quick-toggle-role');`;

    if (hudContent.includes(targetBinding)) {
        hudContent = hudContent.replace(targetBinding, igBinding);
        console.log('[HUD] Berhasil menghubungkan event click tombol IG!');
    }
}

// Update tombol di guest card juga
if (hudContent.includes('<button class="btn-guest-login" id="btn-guest-login">Masuk</button>')) {
    hudContent = hudContent.replace(
        '<button class="btn-guest-login" id="btn-guest-login">Masuk</button>',
        '<button class="btn-guest-login" id="btn-guest-login">📸 Daftar Warga IG</button>'
    );
}

fs.writeFileSync(hudPath, hudContent, 'utf8');

// 2. APPEND STYLES TO STYLES.CSS
const cssPath = path.resolve(__dirname, '../web/src/ui/styles.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

const igStyles = `
/* ==========================================================================
   INSTAGRAM CITIZEN INTEGRATION & DIGITAL E-KTP STYLES
   ========================================================================== */

/* Tombol Header Instagram */
.hud-ig-btn {
    background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
    color: #FFFFFF !important;
    border: 2px solid #2B2117;
    border-radius: 8px;
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 900;
    cursor: pointer;
    box-shadow: 2px 2px 0px #2B2117;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    letter-spacing: 0.3px;
    transition: transform 0.1s, box-shadow 0.1s;
}

.hud-ig-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0px #2B2117;
}

.hud-ig-btn:active {
    transform: translate(1px, 1px);
    box-shadow: 1px 1px 0px #2B2117;
}

.hud-ig-btn .ig-icon {
    font-size: 15px;
}

/* Tab Bar di Modal Auth */
.auth-tabs-row {
    display: flex;
    gap: 8px;
    padding: 10px 18px 0;
    background: #FDFBF7;
    border-bottom: 2px solid #2B2117;
}

.auth-tab-btn {
    padding: 9px 16px;
    font-size: 13px;
    font-weight: 800;
    color: #4B5563;
    background: #E5E7EB;
    border: 2px solid #2B2117;
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    cursor: pointer;
    transition: all 0.15s;
}

.auth-tab-btn.active {
    background: #FFFFFF;
    color: #111827;
    border-bottom: 2px solid #FFFFFF;
    margin-bottom: -2px;
}

/* Instagram Hero Banner */
.ig-hero-banner {
    background: linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 100%);
    border: 2px solid #B45309;
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 16px;
    box-shadow: 2px 2px 0px #B45309;
}

.ig-badge-pill {
    display: inline-block;
    background: #B45309;
    color: #FFFFFF;
    font-size: 10.5px;
    font-weight: 900;
    padding: 3px 10px;
    border-radius: 20px;
    margin-bottom: 8px;
    letter-spacing: 0.5px;
}

.ig-hero-title {
    font-size: 16px;
    font-weight: 900;
    color: #78350F;
    margin: 0 0 6px 0;
}

.ig-hero-desc {
    font-size: 13px;
    line-height: 1.5;
    color: #451A03;
    margin: 0;
}

/* Steps Form */
.ig-form-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.ig-step-box {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: #FFFFFF;
    border: 2px solid #2B2117;
    border-radius: 8px;
    padding: 12px 14px;
    box-shadow: 2px 2px 0px #2B2117;
}

.step-num {
    background: #D97706;
    color: #FFFFFF;
    font-size: 13px;
    font-weight: 900;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 2px solid #2B2117;
}

.step-content {
    flex: 1;
}

.step-title {
    font-size: 13px;
    font-weight: 800;
    color: #1F2937;
    margin-bottom: 8px;
    display: block;
}

.ig-follow-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
    color: #FFFFFF !important;
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 800;
    padding: 8px 16px;
    border: 2px solid #2B2117;
    border-radius: 6px;
    box-shadow: 2px 2px 0px #2B2117;
    transition: transform 0.1s;
}

.ig-follow-action-btn:hover {
    transform: translate(-1px, -1px);
}

.ig-input-wrap {
    display: flex;
    align-items: center;
    border: 2px solid #2B2117;
    border-radius: 6px;
    background: #F9FAFB;
    overflow: hidden;
}

.ig-at-symbol {
    font-weight: 900;
    color: #6B7280;
    padding: 8px 12px;
    background: #E5E7EB;
    border-right: 2px solid #2B2117;
    font-size: 14px;
}

.ig-input-field {
    flex: 1;
    border: none;
    padding: 9px 12px;
    font-size: 14px;
    font-weight: 800;
    color: #111827;
    background: transparent;
    outline: none;
}

.ig-input-hint {
    font-size: 11px;
    color: #6B7280;
    margin-top: 4px;
    display: block;
}

.ig-verify-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 700;
    color: #374151;
    background: #F3F4F6;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1.5px solid #D1D5DB;
}

.btn-submit-ig-register {
    background: #F59E0B;
    color: #1F2937;
    font-size: 14px;
    font-weight: 900;
    padding: 12px 18px;
    border: 2.5px solid #2B2117;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 3px 3px 0px #2B2117;
    transition: all 0.1s;
    text-align: center;
}

.btn-submit-ig-register:hover {
    background: #FBBF24;
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0px #2B2117;
}

.btn-submit-ig-register:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0px #2B2117;
}

/* ==========================================================================
   E-KTP DIGITAL CARD STYLING (OTENTIK INDONESIA)
   ========================================================================== */
.ktp-card-wrap {
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
}

.ktp-card {
    width: 100%;
    max-width: 480px;
    background: linear-gradient(135deg, #CFE2FE 0%, #BAE6FD 50%, #E0F2FE 100%);
    border: 2.5px solid #1E293B;
    border-radius: 12px;
    box-shadow: 4px 4px 0px #1E293B;
    padding: 14px 16px;
    position: relative;
    overflow: hidden;
    font-family: "Segoe UI", Arial, sans-serif;
}

.ktp-header-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #1E3A8A;
    padding-bottom: 8px;
    margin-bottom: 12px;
}

.ktp-emblem {
    font-size: 24px;
}

.ktp-gov-title {
    text-align: center;
}

.ktp-gov-title h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #1E3A8A;
}

.ktp-gov-title h4 {
    margin: 2px 0 0 0;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #1E40AF;
}

.ktp-hologram {
    background: linear-gradient(45deg, #FDE047, #F43F5E, #38BDF8);
    color: #1E293B;
    font-size: 8.5px;
    font-weight: 900;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #1E293B;
}

.ktp-content-body {
    display: flex;
    gap: 14px;
}

.ktp-photo-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100px;
    flex-shrink: 0;
}

.ktp-avatar-box {
    width: 90px;
    height: 110px;
    border: 2px solid #1E293B;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 2px 2px 0px #1E293B;
    background: #C8553D;
}

.avatar-letter {
    font-size: 38px;
    font-weight: 900;
    color: #FFFFFF;
}

.ktp-signature {
    margin-top: 6px;
    text-align: center;
    border-top: 1px dashed #1E293B;
    width: 100%;
    padding-top: 4px;
}

.ktp-signature span {
    font-size: 10.5px;
    font-weight: 800;
    font-style: italic;
    color: #1E293B;
    display: block;
}

.ktp-signature small {
    font-size: 9px;
    color: #4B5563;
    display: block;
}

.ktp-details-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.ktp-field-row {
    display: flex;
    font-size: 11.5px;
    line-height: 1.3;
}

.ktp-label {
    width: 82px;
    font-weight: 800;
    color: #1E3A8A;
    flex-shrink: 0;
}

.ktp-val {
    color: #0F172A;
    font-weight: 600;
}

.ktp-val.bold {
    font-weight: 900;
}

.ktp-val.gold {
    color: #B45309;
    font-weight: 900;
}

.ktp-footer-strip {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid #93C5FD;
    font-size: 9.5px;
    font-weight: 800;
    color: #1E3A8A;
}

.ktp-actions-row {
    display: flex;
    gap: 10px;
    width: 100%;
}

.btn-ktp-action {
    flex: 1;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 900;
    border: 2px solid #2B2117;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 2px 2px 0px #2B2117;
    transition: transform 0.1s;
}

.btn-ktp-action.primary {
    background: #15803D;
    color: #FFFFFF;
}

.btn-ktp-action.primary:hover {
    background: #166534;
    transform: translate(-1px, -1px);
}

.btn-ktp-action.secondary {
    background: #E5E7EB;
    color: #1F2937;
}

.btn-ktp-action.secondary:hover {
    background: #D1D5DB;
    transform: translate(-1px, -1px);
}
`;

if (!cssContent.includes('.hud-ig-btn')) {
    cssContent += '\n' + igStyles;
    fs.writeFileSync(cssPath, cssContent, 'utf8');
    console.log('[CSS] Berhasil menambahkan styles Instagram dan E-KTP!');
}

