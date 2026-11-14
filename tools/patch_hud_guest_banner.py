import re

path = 'F:/AUDIRA-INTEGRASI-BLEDER-ROBLOX/AUDIRA-LAND/web/src/ui/hud.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace header in renderHUD
old_header_pattern = re.compile(r'<!-- 1\. Header Bar Atas -->\s*<header class="hud-header">.*?</header>', re.DOTALL)

new_header = '''<!-- 1. Header Bar Atas (Otentik Republik Netizenia v2 + Warm Ink) -->
            <header class="hud-header">
                <!-- Profil Warga Aktif -->
                <div class="hud-profile-pill" id="hud-profile-btn" title="Klik untuk lihat KTP Digital">
                    <div class="profile-avatar" id="hud-avatar" style="background-color: ${p.avatarColor};">
                        ${p.username ? p.username.charAt(0).toUpperCase() : 'W'}
                    </div>
                    <div class="profile-meta">
                        <span class="profile-name" id="hud-username">${p.username || 'Tamu Netizen'}</span>
                        <span class="profile-profession" id="hud-profession">${p.profession || 'Warga'}</span>
                    </div>
                </div>

                <!-- Statistik Kota: Warga, Kas Kota 5.380 ₳, Kepuasan 85% -->
                <div class="hud-stats-group">
                    <div class="hud-stat-pill" title="Populasi Warga Terdaftar">
                        <span class="stat-icon">👥</span>
                        <span class="stat-val" id="hud-pop-count">1.603</span>
                    </div>
                    <div class="hud-stat-pill" id="hud-treasury-badge" title="Kas Perbendaharaan Kota Gotong Royong">
                        <span class="stat-icon">💰</span>
                        <span class="stat-val" id="hud-treasury-amount">${(treasury || 5380).toLocaleString('id-ID')} ₳</span>
                    </div>
                    <div class="hud-stat-pill kepuasan-pill" title="Tingkat Kepuasan Kota">
                        <span class="stat-icon">😊</span>
                        <span class="stat-val">85%</span>
                    </div>
                </div>

                <!-- Jam Real-Time WIB -->
                <div class="hud-clock-badge" id="hud-clock">
                    <span id="hud-clock-text">☀️ 12:00 WIB</span>
                </div>
            </header>

            <!-- Floating Live Shouts & Announcements (Sesuai Screenshot Netizenia) -->
            <div class="hud-floating-shouts" id="hud-shouts">
                <div class="shout-bubble activity-bubble" id="shout-activity">
                    <span class="activity-icon">🌾</span>
                    <span class="shout-text" id="shout-activity-text">Artha15 mulai bekerja di Kebun Negara.</span>
                </div>
                <div class="shout-bubble donation-bubble" id="shout-donation">
                    <span class="heart-icon">💖</span>
                    <span class="shout-text" id="shout-donation-text">Donatur terbaru: Fahrulpaslim · Rp0 · "Hidup yg Damai ya para warga"</span>
                </div>
            </div>

            <!-- Welcome / Guest Floating Card (Sesuai Screenshot Netizenia) -->
            <div class="hud-guest-card" id="hud-guest-card">
                <div class="guest-card-text">
                    Kamu sedang melihat kota. <b>Masuk</b> untuk punya rumah, kerja, dan ikut voting.
                </div>
                <button class="btn-guest-login" id="btn-guest-login">Masuk</button>
                <button class="btn-guest-close" id="btn-guest-close" title="Tutup">✕</button>
            </div>'''

content = old_header_pattern.sub(new_header, content, count=1)

# Bind events for guest login and close button
old_bind = 'this.bindEvents() {'
new_bind = '''this.bindEvents() {
        // Event Masuk Guest Card
        const guestLogin = document.getElementById('btn-guest-login');
        if (guestLogin) {
            guestLogin.addEventListener('click', () => {
                if (this.callbacks.onOpenProfile) this.callbacks.onOpenProfile();
            });
        }
        const guestClose = document.getElementById('btn-guest-close');
        if (guestClose) {
            guestClose.addEventListener('click', () => {
                const card = document.getElementById('hud-guest-card');
                if (card) card.style.display = 'none';
            });
        }
'''

content = content.replace(old_bind, new_bind)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated hud.js!")

