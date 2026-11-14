/**
 * AUDIRA-LAND: Landing / Gerbang Kota
 * Markup statis ada di index.html (#landing) agar tampil instan sebelum bundel 3D selesai dimuat.
 * Modul ini mengaktifkan tombolnya setelah kota siap:
 *  - Tamu      : "Masuk dengan Instagram" -> wizard AuthModal (Instagram -> Desa -> Profesi -> rumah 5 menit).
 *  - Warga lama: "Lanjut sebagai @username" -> langsung ke rumahnya.
 *  - "Lihat-lihat kota dulu" -> mode tamu (kartu tamu HUD tetap menawarkan pendaftaran).
 *  - "Masuk Pengelola" (atau buka URL dengan #admin) -> panel pengelola kota (login email+password,
 *    hak walikota dicek server). Pintu ini terpisah dari jalur warga.
 */

export function mountLanding({ authModal, camera, playerState, citizenCount = 0, onAdmin }) {
    const root = document.getElementById('landing');
    if (!root) return;

    const btnEnter = root.querySelector('#landing-enter');
    const btnLook = root.querySelector('#landing-look');
    const pill = root.querySelector('#landing-pill');
    const p = playerState.state;

    const hide = () => {
        root.classList.add('is-hidden');
        root.setAttribute('aria-hidden', 'true');
        setTimeout(() => { root.style.display = 'none'; }, 400);
    };

    if (pill) {
        pill.textContent = citizenCount > 0
            ? `🏘️ ${citizenCount.toLocaleString('id-ID')} warga sudah tinggal di sini`
            : '🎉 Kota baru dibuka · jadilah warga pertama';
    }

    if (p.isRegistered) {
        btnEnter.textContent = `🏡 Lanjut sebagai @${String(p.username || '').replace(/^@/, '')}`;
        btnEnter.onclick = () => {
            hide();
            const lot = p.assignedLot;
            if (lot && camera) camera.recenter(lot.worldX, lot.worldZ);
        };
    } else {
        btnEnter.textContent = '📸 Daftar Warga (Instagram)';
        btnEnter.onclick = () => {
            hide();
            authModal.show('instagram');
        };

        // Warga lama yang datanya masih ada di perangkat ini: tawarkan masuk kembali dengan @username
        const known = (typeof playerState.knownUsernames === 'function') ? playerState.knownUsernames() : [];
        if (known.length && !root.querySelector('#landing-login')) {
            const actions = root.querySelector('.landing-actions') || btnEnter.parentElement;
            const link = document.createElement('button');
            link.id = 'landing-login';
            link.className = 'landing-btn landing-btn-ghost';
            link.textContent = '🔑 Sudah warga? Masuk dengan @username';
            link.onclick = () => { hide(); authModal.show('login'); };
            actions.appendChild(link);
        }
    }
    btnLook.onclick = hide;

    const openAdmin = () => { hide(); if (onAdmin) onAdmin(); };
    const linkAdmin = root.querySelector('#landing-admin');
    if (linkAdmin) linkAdmin.onclick = (e) => { e.preventDefault(); openAdmin(); };
    if (location.hash === '#admin') { openAdmin(); return; }

    btnEnter.disabled = false;
    btnLook.disabled = false;
    btnEnter.focus({ preventScroll: true });
}
