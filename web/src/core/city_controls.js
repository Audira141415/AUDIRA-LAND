/**
 * AUDIRA-LAND: Kendali Kota dari Panel Pengelola (settings.city_controls di snapshot server).
 * Diterapkan di layar SEMUA warga: cuaca & waktu dikunci, kecepatan lalu lintas, keramaian,
 * spanduk acara / mode perawatan, dan aturan kerja (jeda, batas harian, pengali upah).
 * Server tetap penentu aturan (city_block di schema.sql); modul ini hanya menyamakan tampilan.
 * Spesifikasi: docs/SPEC_ADMIN_ULTIMATE.md
 */

export const CITY_EVENTS = {
    festival: { icon: '🎉', label: 'Festival Kota', color: '#E9A91E' },
    kerja_bakti: { icon: '🧹', label: 'Kerja Bakti', color: '#7FB069' },
    pasar_malam: { icon: '🏮', label: 'Pasar Malam', color: '#F28C6B' },
    libur: { icon: '🏖️', label: 'Hari Libur Kota', color: '#7CC3E8' },
    darurat: { icon: '🚨', label: 'Siaga Darurat', color: '#F87171' },
};

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Taruh spanduk tepat di bawah deretan tombol HUD atas (tinggi HUD beda di HP & desktop). */
function placeBanner(el) {
    let bottom = 96;
    for (const b of document.querySelectorAll('.btn-view, .btn-preset, .hud-header')) {
        const r = b.getBoundingClientRect();
        if (r.height && r.top < window.innerHeight * 0.4) bottom = Math.max(bottom, r.bottom);
    }
    el.style.top = `${Math.round(bottom + 8)}px`;
    if (!el._placed) {
        el._placed = true;
        window.addEventListener('resize', () => { if (!el.hidden) placeBanner(el); });
    }
}

function banner(ctl) {
    let el = document.getElementById('city-ctl-banner');
    const ev = CITY_EVENTS[ctl.event];
    const maint = ctl.maintenance === true;
    if (!maint && !ev) { if (el) el.hidden = true; return; }
    if (!el) {
        const st = document.createElement('style');
        st.textContent = `#city-ctl-banner{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 104px);
z-index:40;max-width:min(92vw,520px);padding:6px 14px;border:2px solid #2B1D14;border-radius:999px;box-shadow:3px 3px 0 #2B1D14;
font:800 13px/1.3 system-ui,sans-serif;color:#2B1D14;pointer-events:none;text-align:center;overflow-wrap:anywhere}
.ctl-locked{opacity:.55}`;
        document.head.appendChild(st);
        el = document.createElement('div');
        el.id = 'city-ctl-banner';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
    }
    el.hidden = false;
    placeBanner(el);
    el.style.background = maint ? '#FDE68A' : ev.color;
    el.textContent = maint
        ? `🛠️ ${ctl.maintenance_msg || 'Kota sedang dalam perawatan. Aksi warga dijeda sebentar.'}`
        : `${ev.icon} ${ctl.event_title || ev.label}${num(ctl.wage_mult, 1) !== 1 ? ` · Upah ×${String(ctl.wage_mult).replace('.', ',')}` : ''}`;
}

/**
 * @param {object} game     AudiraLandGame (weather, lighting, playerState dipakai bila ada)
 * @param {object} ctl      settings.city_controls
 * @param {object} settings baris settings (opsional: daily_coin_cap)
 */
export function applyCityControls(game, ctl, settings) {
    ctl = ctl && typeof ctl === 'object' ? ctl : {};
    game.cityControls = ctl;
    if (game.weather) game.weather.force(ctl.weather && ctl.weather !== 'bebas' ? ctl.weather : null);
    if (game.lighting && game.lighting.force) game.lighting.force(ctl.time && ctl.time !== 'bebas' ? ctl.time : null);
    game.trafficMult = Math.min(2, Math.max(0, num(ctl.traffic, 1)));
    const c = num(ctl.crowd, -1);
    game.crowdOverride = c >= 0 ? Math.min(1, c) : null;
    const ps = game.playerState;
    if (ps && ps.rules) {
        ps.rules.cooldownMin = Math.max(0, Math.round(num(ctl.cooldown_min, 10)));
        ps.rules.wageMult = Math.min(3, Math.max(0.5, num(ctl.wage_mult, 1)));
        if (settings && settings.daily_coin_cap) ps.rules.dailyCap = Number(settings.daily_coin_cap) || 300;
    }
    banner(ctl);
}
