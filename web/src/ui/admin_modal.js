/**
 * AUDIRA-LAND: Panel Pengelola Kota "Ultimate" (Super Admin / walikota) - chunk lazy.
 * Spesifikasi: docs/SPEC_ADMIN_ULTIMATE.md
 *
 * Keamanan: login = Supabase Auth email + password (REST GoTrue, terpisah dari login anonim warga),
 * dan SEMUA hak ditentukan server: RPC admin_* (supabase/admin_panel.sql) menolak (HTTP 403) akun
 * yang bukan players.role = 'walikota'. Panel ini hanya tampilan; tidak ada flag admin di localStorage.
 *
 * Aturan bundel: modul ini TIDAK mengimpor modul bundel utama (player_state, client, dll.).
 * Semua dependensi disuntikkan lewat constructor oleh main.js:
 *   { config:{url,anonKey}, playerState, onAdminChange(isAdmin, api), onWorldChanged(kind, data),
 *     onNavigateEmptyLot(), onFlyTo(building), toast(title, msg, icon) }
 * CSS khusus panel disuntik dari modul ini (tidak membebani styles.css bundel awal).
 */

const SESSION_KEY = 'audira_land_admin_session';
const REFRESH_MS = 30000;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('id-ID');
const dec = (n) => String(n).replace('.', ',');
const when = (t) => (t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
const ago = (t) => {
    if (!t) return '-';
    const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return `${m} mnt lalu`;
    if (m < 1440) return `${Math.round(m / 60)} jam lalu`;
    return `${Math.round(m / 1440)} hari lalu`;
};

/**
 * Klien admin mini: GoTrue password grant + PostgREST RPC lewat fetch.
 * Sengaja tidak memakai createClient kedua agar sesi anonim warga (supabase-js) tidak tertimpa.
 * Token disimpan di sessionStorage (hilang saat tab ditutup).
 */
export function createAdminApi({ url, anonKey }) {
    const read = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } };
    let s = read();
    const save = (v) => {
        s = v;
        try { v ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)) : sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    };
    async function grant(type, body) {
        const r = await fetch(`${url}/auth/v1/token?grant_type=${type}`, {
            method: 'POST',
            headers: { apikey: anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            const msg = j.error_description || j.msg || j.message || `HTTP ${r.status}`;
            throw new Error(/invalid login/i.test(msg) ? 'Email atau password salah.' : msg);
        }
        save({ at: j.access_token, rt: j.refresh_token, exp: Date.now() + ((j.expires_in || 3600) - 60) * 1000, email: j.user && j.user.email });
    }
    async function token() {
        if (!s) throw new Error('Belum masuk sebagai pengelola.');
        if (Date.now() > s.exp) {
            try { await grant('refresh_token', { refresh_token: s.rt }); }
            catch (e) { save(null); throw new Error('Sesi pengelola berakhir. Masuk lagi.'); }
        }
        return s.at;
    }
    return {
        get signedIn() { return !!s; },
        get email() { return s && s.email; },
        login: (email, password) => grant('password', { email, password }),
        async logout() {
            if (s) fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${s.at}` } }).catch(() => {});
            save(null);
        },
        async rpc(fn, args = {}) {
            const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
                method: 'POST',
                headers: { apikey: anonKey, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(args),
            });
            const j = await r.json().catch(() => null);
            if (!r.ok) {
                const e = new Error(r.status === 403 ? 'Akses ditolak server: akun ini bukan pengelola kota.'
                    : r.status === 401 ? 'Sesi pengelola tidak sah atau kedaluwarsa. Masuk lagi.'
                    : r.status === 404 ? 'Fungsi server belum terpasang. Jalankan supabase/schema.sql lalu admin_panel.sql di SQL Editor.'
                    : (j && j.message) || `HTTP ${r.status}`);
                e.status = r.status;
                throw e;
            }
            return j;
        },
    };
}

// ---------------------------------------------------------------------------------------------
// Data statis panel
// ---------------------------------------------------------------------------------------------
const TABS = [
    ['dasbor', '📊', 'Dasbor'],
    ['dunia', '🎛️', 'Kendali Dunia'],
    ['ekonomi', '💰', 'Ekonomi'],
    ['kota', '🏗️', 'Tata Kota'],
    ['aset', '🧩', 'Aset'],
    ['distrik', '🗺️', 'Distrik'],
    ['warga', '👥', 'Warga'],
    ['voting', '🗳️', 'Voting'],
    ['siaran', '📢', 'Siaran'],
    ['log', '📜', 'Log'],
];

const WEATHER = [['bebas', '🙋', 'Bebas'], ['auto', '⛅', 'Otomatis'], ['cerah', '☀️', 'Cerah'], ['hujan', '🌧️', 'Hujan'], ['salju', '❄️', 'Salju']];
const TIMES = [['bebas', '🙋', 'Bebas'], ['auto', '🕰️', 'Jam nyata'], ['siklus', '🔁', 'Siklus'], ['fajar', '🌅', 'Fajar'], ['siang', '🌞', 'Siang'], ['senja', '🌇', 'Senja'], ['malam', '🌙', 'Malam']];
const EVENTS = [['none', '—', 'Tidak ada'], ['festival', '🎉', 'Festival'], ['kerja_bakti', '🧹', 'Kerja bakti'], ['pasar_malam', '🏮', 'Pasar malam'], ['libur', '🏖️', 'Hari libur'], ['darurat', '🚨', 'Siaga darurat']];
const LOCKS = [
    ['chat_locked', '💬', 'Kunci chat kota'],
    ['build_frozen', '🏗️', 'Bekukan pembangunan'],
    ['work_frozen', '💼', 'Liburkan kerja'],
    ['vote_frozen', '🗳️', 'Tutup voting'],
];
const NORMAL = {
    weather: 'bebas', time: 'bebas', traffic: 1, crowd: -1, event: 'none', event_title: '', wage_mult: 1, cooldown_min: 10,
    maintenance: false, chat_locked: false, build_frozen: false, work_frozen: false, vote_frozen: false,
};
const SCENARIOS = [
    ['normal', '♻️', 'Normal', 'Semua kendali kembali bawaan', NORMAL],
    ['festival', '🎆', 'Festival Malam', 'Malam cerah, kota penuh, upah ×1,5',
        { event: 'festival', event_title: 'Festival Malam AUDIRA', time: 'malam', weather: 'cerah', crowd: 1, traffic: 0.6, wage_mult: 1.5 }],
    ['badai', '⛈️', 'Badai', 'Hujan, jalan sepi, kerja diliburkan',
        { event: 'darurat', event_title: 'Siaga Badai', weather: 'hujan', time: 'senja', traffic: 0.3, crowd: 0.15, work_frozen: true }],
    ['bakti', '🧹', 'Kerja Bakti', 'Pagi ramai, upah ×2, jeda 5 mnt',
        { event: 'kerja_bakti', event_title: 'Kerja Bakti Massal', weather: 'cerah', time: 'fajar', crowd: 0.9, wage_mult: 2, cooldown_min: 5 }],
    ['salju', '☃️', 'Festival Salju', 'Salju turun, warga keluar rumah',
        { event: 'festival', event_title: 'Festival Salju', weather: 'salju', time: 'siang', crowd: 0.8, traffic: 0.7 }],
    ['libur', '🏖️', 'Libur Nasional', 'Siang cerah, kerja libur',
        { event: 'libur', event_title: 'Libur Nasional', weather: 'cerah', time: 'siang', crowd: 1, traffic: 0.5, work_frozen: true }],
    ['rawat', '🛠️', 'Perawatan', 'Semua aksi warga dijeda server',
        { maintenance: true, maintenance_msg: 'Kota sedang diperbarui. Kembali 15 menit lagi.' }],
];
const NEWS_CAT = [['kota', '🏙️ Kota'], ['pengumuman', '📢 Pengumuman'], ['acara', '🎪 Acara'], ['ekonomi', '💰 Ekonomi'], ['warga', '👥 Warga'], ['voting', '🗳️ Voting']];
const STAGE = { sketsa: ['📝', 'Sketsa'], proyek: ['🚧', 'Proyek'], selesai: ['✅', 'Selesai'] };
const PROP_STATUS = { voting: ['🗳️', 'Voting'], disetujui: ['✅', 'Disetujui'], ditolak: ['❌', 'Ditolak'], dibangun: ['🏛️', 'Dibangun'] };
const AUDIT = {
    kendali_dunia: '🎛️ Kendali dunia', kas: '💰 Kas kota', aturan_ekonomi: '📐 Aturan ekonomi', bansos: '🎁 Bansos',
    pengumuman: '📢 Pengumuman', kabar: '📰 Kabar kota', hapus_kabar: '🗑️ Hapus kabar', hapus_chat: '🗑️ Hapus chat',
    bersihkan_chat: '🧽 Bersihkan chat', percepat: '⚡ Percepat proyek', percepat_semua: '⚡ Selesaikan semua',
    gusur: '🚧 Gusur', ubah_bangunan: '✏️ Ubah bangunan', dirikan_publik: '🏛️ Dirikan fasilitas', distrik: '🗺️ Distrik',
    tempat_aset: '🧩 Tempatkan aset', hapus_aset: '🗑️ Hapus aset',
    saldo: '🪙 Saldo warga', atur_warga: '👤 Atur warga', keluarkan_warga: '⛔ Keluarkan warga',
    voting_approve: '✅ Sahkan usulan', voting_reject: '❌ Tolak usulan', voting_extend: '⏳ Perpanjang voting', voting_delete: '🗑️ Hapus usulan',
};
const VILLAGE = { have: 'Desa Have', have_not: 'Desa Have-Not' };

// Palet Aset: kategori + sumber manifest (docs/SPEC_ADMIN_ASSET_PALETTE.md)
const ASSET_CATS = [['pohon', '🌳', 'Pohon'], ['bangunan', '🏠', 'Bangunan'], ['ternak', '🐄', 'Ternak'], ['kendaraan', '🚗', 'Kendaraan']];
const TREE_RE = /tree|plant|bush|palm|bamboo|shrub|flower|grove|sapling|hedge|fern|blossom|magnolia|ginkgo|oak|birch|cherry|fir|orchard|sunflower/;
/** Turunkan kategori palet dari entri manifest (type + regex pohon). null = tidak dipakai di palet. */
function assetCat(id, m) {
    if (m.type === 'building') return 'bangunan';
    if (m.type === 'animal') return 'ternak';
    if (m.type === 'vehicle') return 'kendaraan';
    if (m.type === 'prop' && TREE_RE.test(`${id} ${m.title}`.toLowerCase())) return 'pohon';
    return null;
}

const CSS = `
.adm .modal-card.admin-modal-card{max-width:980px;width:min(980px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
.adm .adm-shell{display:flex;flex:1 1 auto;min-height:0}
.adm .adm-side{flex:0 0 190px;border-right:2px solid var(--ink,#2B1D14);padding:10px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;background:rgba(233,169,30,.08)}
.adm .adm-side button{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 12px;border:2px solid transparent;border-radius:12px;background:none;font:800 14px/1.2 inherit;color:inherit;text-align:left;cursor:pointer}
.adm .adm-side button.active{background:var(--gold,#E9A91E);border-color:var(--ink,#2B1D14);box-shadow:2px 2px 0 var(--ink,#2B1D14)}
.adm .adm-side .adm-badge{margin-left:auto;font-size:12px;padding:1px 7px;border-radius:999px;background:#C8553D;color:#fff}
.adm .adm-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.adm .pnl-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain}
.adm .pnl-body>*{flex-shrink:0}
.adm .adm-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 16px;border-bottom:2px solid var(--ink,#2B1D14);font-size:13px}
.adm .adm-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border:2px solid var(--ink,#2B1D14);border-radius:999px;background:#FFF9EC;font-weight:800;font-size:12px;white-space:nowrap}
.adm .adm-pill.warn{background:#FDE68A}.adm .adm-pill.bad{background:#FEE2E2;color:#7F1D1D}.adm .adm-pill.ok{background:#DCFCE7;color:#14532D}
.adm .adm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.adm .adm-kpi{border:2px solid var(--ink,#2B1D14);border-radius:14px;padding:10px;background:#FFF9EC;box-shadow:2px 2px 0 var(--ink,#2B1D14);min-width:0}
.adm .adm-kpi small{display:block;font-size:12px;color:#6B5442;font-weight:700}
.adm .adm-kpi b{display:block;font-size:20px;line-height:1.2;overflow-wrap:anywhere}
.adm .adm-kpi i{font-style:normal;font-size:12px;color:#6B5442}
.adm .adm-chart{display:flex;align-items:flex-end;gap:3px;height:110px;padding:8px;border:2px solid var(--ink,#2B1D14);border-radius:14px;background:#FFF9EC}
.adm .adm-chart span{flex:1 1 0;min-width:4px;background:var(--gold,#E9A91E);border:1px solid var(--ink,#2B1D14);border-radius:4px 4px 0 0}
.adm .adm-chart span.z{background:transparent;border-color:rgba(43,29,20,.25)}
.adm .adm-axis{display:flex;justify-content:space-between;font-size:12px;color:#6B5442}
.adm .adm-split{display:flex;height:22px;border:2px solid var(--ink,#2B1D14);border-radius:999px;overflow:hidden;font-size:12px;font-weight:800}
.adm .adm-split span{display:flex;align-items:center;justify-content:center;min-width:0;white-space:nowrap;overflow:hidden}
.adm .adm-card{border:2px solid var(--ink,#2B1D14);border-radius:14px;padding:12px;background:#FFFDF7;display:flex;flex-direction:column;gap:10px}
.adm .adm-card h4{font-size:14px;font-weight:900;margin:0}
.adm .adm-seg{display:flex;flex-wrap:wrap;gap:6px}
.adm .adm-seg button{min-height:44px;padding:6px 12px;border:2px solid var(--ink,#2B1D14);border-radius:12px;background:#FFF9EC;font:800 13px/1.2 inherit;color:inherit;cursor:pointer}
.adm .adm-seg button.on{background:var(--gold,#E9A91E);box-shadow:2px 2px 0 var(--ink,#2B1D14)}
.adm .adm-range{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:800}
.adm .adm-range input{flex:1 1 auto;min-height:44px;accent-color:#C8553D}
.adm .adm-range output{min-width:64px;text-align:right}
.adm .adm-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:4px 0;font-size:14px;font-weight:800;cursor:pointer}
.adm .adm-toggle input{width:52px;height:30px;appearance:none;-webkit-appearance:none;border:2px solid var(--ink,#2B1D14);border-radius:999px;background:#E7DCCB;position:relative;cursor:pointer;flex:0 0 auto}
.adm .adm-toggle input::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid var(--ink,#2B1D14);transition:left .15s}
.adm .adm-toggle input:checked{background:#C8553D}.adm .adm-toggle input:checked::after{left:25px}
.adm .adm-scen{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.adm .adm-scen button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:64px;padding:10px;border:2px solid var(--ink,#2B1D14);border-radius:14px;background:#FFF9EC;box-shadow:2px 2px 0 var(--ink,#2B1D14);font:inherit;color:inherit;text-align:left;cursor:pointer}
.adm .adm-scen button b{font-size:14px}.adm .adm-scen button small{font-size:12px;color:#6B5442}
.adm .adm-scen button:active{transform:translate(2px,2px);box-shadow:none}
.adm .adm-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.adm .adm-tools .pnl-input{flex:1 1 160px;min-width:0}
.adm .adm-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}
.adm .adm-chips button{flex:0 0 auto;min-height:44px;padding:4px 12px;border:2px solid var(--ink,#2B1D14);border-radius:999px;background:#FFF9EC;font:800 13px/1 inherit;color:inherit;cursor:pointer}
.adm .adm-chips button.on{background:var(--ink,#2B1D14);color:#FFF9EC}
.adm details.adm-more{width:100%}
.adm details.adm-more>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;min-height:44px;padding:4px 12px;border:2px solid var(--ink,#2B1D14);border-radius:12px;background:#FFF9EC;font-weight:800;font-size:13px}
.adm details.adm-more>summary::-webkit-details-marker{display:none}
.adm details.adm-more[open]>summary{background:var(--gold,#E9A91E)}
.adm .adm-more-body{display:flex;flex-direction:column;gap:8px;margin-top:8px;padding:10px;border:2px dashed rgba(43,29,20,.35);border-radius:12px}
.adm .adm-inline{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.adm .adm-inline .pnl-input{flex:1 1 120px;min-width:0}
.adm .adm-bar{height:10px;border:2px solid var(--ink,#2B1D14);border-radius:999px;background:#FFF9EC;overflow:hidden}
.adm .adm-bar span{display:block;height:100%;background:#7FB069}
.adm .adm-dist{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.adm .adm-dist .adm-card{gap:6px;padding:10px}
.adm .adm-dist .adm-card.locked{background:#F3EDE2}
.adm .adm-page{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;font-weight:800}
.adm .adm-log li{font-size:13px}
.adm .adm-log code{font-size:12px;background:#F3EDE2;padding:1px 5px;border-radius:6px;overflow-wrap:anywhere}
.adm .adm-live{font-size:12px;color:#6B5442;margin-left:auto}
.adm .pnl-foot{flex-wrap:wrap}
@media (max-width:760px){
 .adm .modal-card.admin-modal-card{width:100vw;max-width:100vw;max-height:94vh}
 .adm .adm-shell{flex-direction:column}
 .adm .adm-side{flex:0 0 auto;flex-direction:row;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:2px solid var(--ink,#2B1D14);padding:8px}
 .adm .adm-side button{flex:0 0 auto;padding:6px 10px;font-size:13px}
 .adm .adm-side .adm-badge{margin-left:2px}
 .adm .adm-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
 .adm .adm-kpi b{font-size:17px}
 .adm .adm-top{padding:6px 12px}
 .adm .pnl-body{padding:12px}
}`;

function injectCss() {
    if (document.getElementById('adm-css')) return;
    const st = document.createElement('style');
    st.id = 'adm-css';
    st.textContent = CSS;
    document.head.appendChild(st);
}

const seg = (key, opts, cur) => `<div class="adm-seg" role="group">${opts.map(([v, i, t]) =>
    `<button type="button" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}" data-act="ctl" data-key="${key}" data-val="${v}">${i} ${t}</button>`).join('')}</div>`;
const toggle = (name, label, on, extra = '') =>
    `<label class="adm-toggle"><span>${label}</span><input type="checkbox" role="switch" data-ctl="${name}" ${on ? 'checked' : ''} ${extra}></label>`;
const empty = (t) => `<p class="pnl-note">${t}</p>`;

export class AdminModal {
    constructor(opts = {}) {
        this.o = opts;
        this.api = opts.api || createAdminApi(opts.config);
        this.tab = 'dasbor';
        this.view = 'login';   // login | busy | panel
        this.err = '';
        this.data = null;
        this.who = null;
        this.pq = { q: '', village: '', sort: 'baru' };              // filter warga
        this.bq = { q: '', filter: 'semua', offset: 0, res: null };   // daftar bangunan
        this.aq = { cat: 'pohon', q: '', sel: null, rot: 0, scale: 1 }; // palet aset
        this.manifest = null;   // {id: entri} dari manifest polyfork (lazy, admin-only)
        this.placements = null; // daftar placement dari server (list_placements)
        injectCss();

        let el = document.getElementById('admin-modal-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'admin-modal-overlay';
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            el.setAttribute('aria-label', 'Panel Pengelola Kota');
            document.body.appendChild(el);
        }
        el.className = 'modal-backdrop admin-modal-backdrop pnl adm';
        this.el = el;
        el.addEventListener('click', (e) => this.onClick(e));
        el.addEventListener('submit', (e) => this.onSubmit(e));
        el.addEventListener('change', (e) => this.onChange(e));
        el.addEventListener('input', (e) => this.onInput(e));
        el.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hide(); });
    }

    // -----------------------------------------------------------------------------------------
    // Siklus hidup
    // -----------------------------------------------------------------------------------------
    /** Dipanggil main.js saat load bila sesi pengelola masih ada di tab ini. */
    async restore() {
        if (this.api.signedIn) await this.verify(false);
    }

    async show() {
        this.el.classList.add('active');
        this.startAuto();
        if (this.api.signedIn) {
            if (this.view !== 'panel') await this.verify(true);
            else { this.render(); this.refresh(); }
        } else {
            this.view = 'login';
            this.render();
            this.el.querySelector('input[name=email]')?.focus();
        }
    }

    hide() {
        this.el.classList.remove('active');
        clearInterval(this.timer);
        this.timer = null;
    }

    isOpen() {
        return this.el.classList.contains('active');
    }

    /** Muat ulang ringkasan tiap 30 dtk selama panel terbuka dan pengelola tidak sedang mengetik. */
    startAuto() {
        clearInterval(this.timer);
        this.timer = setInterval(() => {
            if (!this.isOpen() || this.view !== 'panel' || this.busy || document.hidden) return;
            const a = document.activeElement;
            if (a && this.el.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
            if (this.el.querySelector('details[open]')) return;
            this.refresh();
        }, REFRESH_MS);
    }

    async verify(showPanel) {
        this.view = 'busy';
        if (showPanel) this.render();
        try {
            const who = await this.api.rpc('admin_whoami');
            if (!who || !who.is_admin) {
                await this.api.logout();
                this.who = null;
                this.view = 'login';
                this.err = 'Akun ini bukan pengelola kota. Akses ditolak.';
                this.o.onAdminChange?.(false, null);
            } else {
                this.who = who;
                this.err = '';
                this.o.onAdminChange?.(true, this.api);
                await this.refresh(false);
            }
        } catch (e) {
            if (e.status === 401 || e.status === 403 || /Sesi|Belum/.test(e.message)) await this.api.logout();
            this.view = 'login';
            this.err = e.message;
            this.o.onAdminChange?.(false, null);
        }
        if (this.isOpen()) this.render();
    }

    async refresh(rerender = true) {
        try {
            this.data = await this.api.rpc('admin_overview');
            this.view = 'panel';
            this.syncWorld();
            if (this.tab === 'kota') await this.loadBuildings(false);
        } catch (e) {
            this.err = e.message;
            if (e.status === 403 || e.status === 401) {
                await this.logout(false);
                return;
            }
        }
        if (rerender && this.isOpen()) this.render();
    }

    /** Samakan layar pengelola dengan server: kas + kendali kota langsung terlihat di peta. */
    syncWorld() {
        const d = this.data;
        if (!d) return;
        this.o.playerState?.setCityTreasury?.(Number(d.treasury) || 0);
        this.o.onWorldChanged?.('controls', { controls: d.controls || {}, settings: d.settings || {} });
    }

    async loadBuildings(rerender = true) {
        const q = this.bq;
        try {
            q.res = await this.api.rpc('admin_list_buildings', { p_query: q.q, p_filter: q.filter, p_limit: 20, p_offset: q.offset });
        } catch (e) {
            this.err = e.message;
        }
        if (rerender && this.isOpen()) this.render();
    }

    /** Muat manifest aset (sekali) + daftar placement dari server. */
    async loadAssets(rerender = true) {
        try {
            if (!this.manifest) {
                const r = await fetch('public/models/polyfork/manifest.json');
                if (!r.ok) throw new Error(`manifest HTTP ${r.status}`);
                this.manifest = (await r.json()).models || {};
            }
            this.placements = (await this.api.rpc('list_placements')) || [];
        } catch (e) {
            this.err = e.message;
        }
        if (rerender && this.isOpen()) this.render();
    }

    /** Tempatkan aset terpilih di (x, z) dunia -> RPC + render live. */
    placeAsset(x, z) {
        const id = this.aq.sel;
        if (!id) { this.err = 'Pilih aset dulu dari daftar.'; this.render(); return; }
        const rot = ((Number(this.aq.rot) || 0) * Math.PI) / 180;
        const scale = Number(this.aq.scale) || 1;
        this.act('admin_place_asset',
            { p_asset_id: id, p_category: this.aq.cat, p_world_x: x, p_world_z: z, p_rot_y: rot, p_scale: scale },
            'Aset ditempatkan di kota.',
            (r) => {
                const row = r && r.placement;
                if (!row) return;
                this.placements = [row, ...(this.placements || [])];
                this.o.onWorldChanged?.('placement', { action: 'add', row });
            });
    }

    async logout(toast = true) {
        await this.api.logout();
        this.who = null;
        this.data = null;
        this.view = 'login';
        this.o.onAdminChange?.(false, null);
        if (toast) this.o.toast?.('👋 Keluar', 'Kamu keluar dari panel pengelola.', '🏛️');
        if (this.isOpen()) this.render();
    }

    /** Jalankan RPC aksi, tampilkan hasil, lalu muat ulang ringkasan. */
    async act(fn, args, okMsg, after) {
        if (this.busy) return null;
        this.busy = true;
        this.el.querySelector('.pnl-body')?.setAttribute('aria-busy', 'true');
        let res = null;
        try {
            res = await this.api.rpc(fn, args);
            if (res && res.success === false) throw new Error(res.error || 'Ditolak server.');
            if (after) after(res);
            if (okMsg) this.o.toast?.('✅ Berhasil', typeof okMsg === 'function' ? okMsg(res) : okMsg, '🏛️');
            this.err = '';
        } catch (e) {
            this.err = e.message;
            res = null;
            if (e.status === 403 || e.status === 401) { this.busy = false; await this.logout(false); return null; }
        }
        this.busy = false;
        await this.refresh();
        return res;
    }

    /** Ubah kendali dunia (sebagian kunci) dan terapkan seketika di layar pengelola. */
    setControls(patch, msg) {
        if (this.data) this.data.controls = { ...(this.data.controls || {}), ...patch };   // tampilan optimis
        this.render();
        return this.act('admin_set_controls', { p_controls: patch }, msg || 'Kendali kota diperbarui untuk semua warga.');
    }

    // -----------------------------------------------------------------------------------------
    // Event
    // -----------------------------------------------------------------------------------------
    onSubmit(e) {
        e.preventDefault();
        const f = e.target;
        const v = (n) => (f.elements[n] ? String(f.elements[n].value).trim() : '');
        const int = (n) => (v(n) === '' ? null : parseInt(v(n), 10));
        const id = f.dataset.id;
        switch (f.dataset.form) {
            case 'login': {
                const email = v('email');
                const password = f.elements.password.value;
                if (!email || !password) { this.err = 'Isi email dan password.'; this.render(); return; }
                this.view = 'busy';
                this.err = '';
                this.render();
                this.api.login(email, password)
                    .then(() => this.verify(true))
                    .catch((err) => { this.view = 'login'; this.err = err.message; this.render(); });
                return;
            }
            case 'kas': {
                const amt = int('amount') * (v('dir') === 'minus' ? -1 : 1);
                this.act('admin_treasury', { p_delta: amt, p_reason: v('reason') }, `Kas kota ${amt > 0 ? '+' : ''}${num(amt)} ₳.`);
                return;
            }
            case 'aturan':
                this.act('admin_set_economy', { p_daily_cap: int('cap'), p_quorum: int('quorum'), p_vote_hours: int('hours'), p_city_name: v('city') },
                    'Aturan kota disimpan.', () => this.o.onWorldChanged?.('snapshot'));
                return;
            case 'upah':
                this.setControls({ wage_mult: Number(v('wage')), cooldown_min: int('cooldown') }, 'Upah & jeda kerja berlaku untuk semua warga.');
                return;
            case 'bansos': {
                const amount = int('amount');
                const vil = v('village') || null;
                const n = vil ? (this.data.stats[vil] || 0) : this.data.stats.players;
                if (!confirm(`Bagikan ${num(amount)} ₳ ke ±${num(n)} warga ${vil ? VILLAGE[vil] : 'semua desa'}? Total ±${num(amount * n)} ₳ diambil dari kas kota.`)) return;
                this.act('admin_grant_all', { p_amount: amount, p_village: vil, p_reason: v('reason') },
                    (r) => `${num(r.count)} warga menerima ${num(amount)} ₳ (total ${num(r.total)} ₳).`);
                return;
            }
            case 'umum':
                this.act('admin_announce', { p_message: v('message') }, 'Pengumuman tayang di kabar kota.', () => {
                    this.o.playerState?.addNews?.('pengumuman', `📢 ${v('message')}`);
                });
                return;
            case 'kabar':
                this.act('admin_post_news', { p_category: v('cat'), p_message: v('message') }, 'Kabar kota terkirim.', () => {
                    this.o.playerState?.addNews?.(v('cat'), v('message'));
                });
                return;
            case 'event':
                this.setControls({ event: v('event'), event_title: v('title') }, v('event') === 'none' ? 'Acara kota diakhiri.' : 'Acara kota dimulai!');
                return;
            case 'rawat':
                this.setControls({ maintenance_msg: v('msg') }, 'Pesan perawatan disimpan.');
                return;
            case 'coins':
                this.act('admin_set_coins', { p_player: id, p_coins: int('coins') }, 'Saldo warga diperbarui.');
                return;
            case 'peran':
                this.act('admin_set_player', { p_player: id, p_role: v('role') }, 'Peran warga diperbarui.');
                return;
            case 'bisu':
                this.act('admin_set_player', { p_player: id, p_mute_minutes: int('mins') }, int('mins') ? 'Warga dibisukan dari chat.' : 'Bisukan dibuka.');
                return;
            case 'bld':
                // Pemilik: centang "milik Pemkot" = '' (publik), isi @username = pindah, kosong = tetap
                this.act('admin_update_building', {
                    p_building_id: id,
                    p_type: v('type') || null,
                    p_owner: f.elements.public.checked ? '' : (v('owner') || null),
                }, 'Bangunan diperbarui. Peta warga berubah setelah muat ulang.');
                return;
            case 'distrik':
                this.act('admin_set_district', { p_key: id, p_name: v('name'), p_unlock_cost: int('cost') }, 'Distrik diperbarui.');
                return;
            case 'bsearch':
                this.bq.q = v('q');
                this.bq.offset = 0;
                this.loadBuildings();
                return;
            case 'aset': {
                const x = Number(v('x')), z = Number(v('z'));
                if (!Number.isFinite(x) || !Number.isFinite(z)) { this.err = 'Isi koordinat X dan Z.'; this.render(); return; }
                this.placeAsset(x, z);
                return;
            }
        }
    }

    onChange(e) {
        const t = e.target;
        const ctl = t.dataset.ctl;
        if (ctl && t.type === 'checkbox') {
            if (ctl === 'maintenance' && t.checked && !confirm('Aktifkan mode perawatan? Semua aksi warga (kerja, bangun, chat, voting) ditolak server sampai dimatikan.')) {
                t.checked = false;
                return;
            }
            this.setControls({ [ctl]: t.checked });
        } else if (ctl === 'traffic' || ctl === 'crowd') {
            this.setControls({ [ctl]: Number(t.value) });
        } else if (t.dataset.pq) {
            this.pq[t.dataset.pq] = t.value;
            this.render();
        } else if (t.dataset.ban) {
            const on = t.checked;
            if (!confirm(on ? 'Bekukan akun ini? Warga tidak bisa kerja, bangun, chat, atau voting.' : 'Aktifkan kembali akun ini?')) { t.checked = !on; return; }
            this.act('admin_set_player', { p_player: t.dataset.ban, p_banned: on }, on ? 'Akun warga dibekukan.' : 'Akun warga aktif kembali.');
        } else if (t.dataset.unlock) {
            this.act('admin_set_district', { p_key: t.dataset.unlock, p_unlocked: t.checked }, t.checked ? 'Distrik dibuka.' : 'Distrik dikunci.');
        } else if (t.dataset.aq) {
            this.aq[t.dataset.aq] = t.value;   // rot / scale: tidak perlu render ulang
        }
    }

    onInput(e) {
        const t = e.target;
        if (t.dataset.out) {
            const o = this.el.querySelector(`output[data-for="${t.dataset.out}"]`);
            if (o) o.textContent = this.rangeLabel(t.dataset.out, Number(t.value));
        }
        if (t.dataset.pq === 'q') {
            this.pq.q = t.value;
            clearTimeout(this.typing);
            this.typing = setTimeout(() => this.render(), 250);
        }
        if (t.dataset.aq === 'q') {
            this.aq.q = t.value;
            clearTimeout(this.typing);
            this.typing = setTimeout(() => this.render(), 250);
        }
    }

    rangeLabel(key, v) {
        if (key === 'traffic') return v === 0 ? '⛔ Ditutup' : `×${dec(v)}`;
        if (key === 'crowd') return v < 0 ? 'Otomatis' : `${Math.round(v * 100)}%`;
        if (key === 'wage') return `×${dec(v)}`;
        return String(v);
    }

    onClick(e) {
        if (e.target === this.el) { this.hide(); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const { act, id, tab } = b.dataset;
        const row = id && this.findRow(id);
        switch (act) {
            case 'close': this.hide(); break;
            case 'tab':
                this.tab = tab;
                this.err = '';
                this.render();
                this.el.querySelector('.pnl-body')?.scrollTo(0, 0);
                if (tab === 'kota' && !this.bq.res) this.loadBuildings();
                if (tab === 'aset' && (!this.manifest || !this.placements)) this.loadAssets();
                break;
            case 'logout': this.logout(); break;
            case 'refresh': this.refresh(); break;
            case 'ctl': this.setControls({ [b.dataset.key]: b.dataset.val }); break;
            case 'crowd-auto': this.setControls({ crowd: -1 }); break;
            case 'scenario': {
                const s = SCENARIOS.find((x) => x[0] === b.dataset.key);
                if (!s) break;
                if (s[0] === 'rawat' && !confirm('Aktifkan mode perawatan? Semua aksi warga ditolak server sampai dimatikan.')) break;
                const patch = s[0] === 'normal' ? { ...NORMAL } : { ...NORMAL, ...s[4] };
                this.setControls(patch, `Skenario "${s[2]}" berjalan di seluruh kota.`);
                break;
            }
            case 'finish':
                this.act('admin_finish_building', { p_building_id: id }, 'Proyek diselesaikan.', () => this.o.onWorldChanged?.('finish', { id }));
                break;
            case 'finish-all':
                if (!confirm('Selesaikan SEMUA proyek yang sedang berjalan?')) return;
                this.act('admin_finish_all', {}, (r) => `${num(r.count)} proyek selesai.`, () => this.o.onWorldChanged?.('finishAll'));
                break;
            case 'demolish':
                if (!confirm('Gusur bangunan ini? Bangunan dihapus dari server dan tidak bisa dibatalkan.')) return;
                this.act('admin_demolish', { p_building_id: id }, 'Bangunan digusur.', () => this.o.onWorldChanged?.('demolish', { id }));
                break;
            case 'protect':
                this.act('admin_update_building', { p_building_id: id, p_protect: b.dataset.on === '1' }, b.dataset.on === '1' ? 'Bangunan dilindungi dari gusur.' : 'Perlindungan dibuka.');
                break;
            case 'fly':
                if (row) { this.hide(); this.o.onFlyTo?.(row); }
                break;
            case 'bfilter':
                this.bq.filter = b.dataset.key;
                this.bq.offset = 0;
                this.loadBuildings();
                break;
            case 'bpage':
                this.bq.offset = Math.max(0, this.bq.offset + Number(b.dataset.step) * 20);
                this.loadBuildings();
                break;
            case 'empty-lot':
                this.hide();
                this.o.onNavigateEmptyLot?.();
                break;
            case 'acat':
                this.aq.cat = b.dataset.key;
                this.aq.sel = null;
                this.render();
                break;
            case 'asel':
                this.aq.sel = this.aq.sel === b.dataset.key ? null : b.dataset.key;
                this.render();
                break;
            case 'aplace': {
                const t = this.o.getCameraTarget?.() || { x: 0, z: 0 };
                this.placeAsset(t.x, t.z);
                break;
            }
            case 'aremove':
                this.act('admin_remove_asset', { p_id: id }, 'Aset dihapus dari kota.', () => {
                    if (this.placements) this.placements = this.placements.filter((p) => p.id !== id);
                    this.o.onWorldChanged?.('placement', { action: 'remove', id });
                });
                break;
            case 'del-chat': this.act('admin_delete_chat', { p_id: Number(id) }, 'Pesan dihapus.'); break;
            case 'clear-chat':
                if (!confirm('Hapus SEMUA pesan chat kota? Tidak bisa dibatalkan.')) return;
                this.act('admin_clear_chat', {}, (r) => `${num(r.count)} pesan dihapus.`);
                break;
            case 'del-news': this.act('admin_delete_news', { p_id: Number(id) }, 'Kabar dihapus.'); break;
            case 'cooldown': this.act('admin_set_player', { p_player: id, p_reset_cooldown: true }, 'Jeda kerja warga direset.'); break;
            case 'kick':
                if (!confirm('Keluarkan warga ini? Akun dan rumahnya dihapus dari server dan tidak bisa dibatalkan.')) return;
                this.act('admin_remove_player', { p_player: id }, 'Warga dikeluarkan.');
                break;
            case 'prop': {
                const a = b.dataset.key;
                const label = { approve: 'Sahkan usulan ini dan bangun fasilitasnya?', reject: 'Tolak usulan ini?', delete: 'Hapus usulan ini? Tidak bisa dibatalkan.' }[a];
                if (label && !confirm(label)) return;
                this.act('admin_proposal', { p_id: id, p_action: a },
                    { approve: 'Usulan disahkan.', reject: 'Usulan ditolak.', extend: 'Voting diperpanjang 24 jam.', delete: 'Usulan dihapus.' }[a],
                    () => { if (a === 'approve') this.o.onWorldChanged?.('snapshot'); });
                break;
            }
        }
    }

    findRow(id) {
        const d = this.data || {};
        const lists = [d.projects, d.players, (this.bq.res && this.bq.res.rows)];
        for (const l of lists) for (const r of l || []) if (String(r.id) === String(id)) return r;
        return null;
    }

    // -----------------------------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------------------------
    render() {
        // Pertahankan posisi gulir & fokus input (render ulang = innerHTML baru)
        const body = this.el.querySelector('.pnl-body');
        const scroll = body ? body.scrollTop : 0;
        const a = document.activeElement;
        const focusKey = a && this.el.contains(a) && (a.dataset.pq || a.dataset.aq || a.name)
            ? (a.dataset.pq ? `[data-pq="${a.dataset.pq}"]` : a.dataset.aq ? `[data-aq="${a.dataset.aq}"]` : `[name="${a.name}"]`) : null;
        const caret = focusKey && typeof a.selectionStart === 'number' ? a.selectionStart : null;

        const d = this.data;
        const head = `
            <div class="modal-header admin-modal-header">
                <div class="modal-title-wrap">
                    <span class="modal-icon" aria-hidden="true">🏛️</span>
                    <div>
                        <h2 class="modal-title">Pusat Kendali Kota</h2>
                        <p class="modal-subtitle">${this.who ? `Walikota <b>${esc(this.who.username || this.who.email)}</b>${d && d.settings ? ` · ${esc(d.settings.city_name)}` : ''}` : 'Khusus walikota AUDIRA-LAND'}</p>
                    </div>
                </div>
                <button class="modal-close pnl-close" data-act="close" aria-label="Tutup">✕</button>
            </div>`;
        const err = this.err ? `<p class="pnl-err" role="alert">${esc(this.err)}</p>` : '';
        let html;
        if (this.view === 'busy') {
            html = `${head}<div class="pnl-body"><p class="pnl-note">⏳ Memeriksa hak akses di server…</p></div>`;
        } else if (this.view === 'login' || !d) {
            html = `${head}
                <div class="pnl-body">
                ${err}
                <form class="pnl-form" data-form="login" autocomplete="on">
                    <label class="pnl-label">Email pengelola
                        <input class="pnl-input" name="email" type="email" inputmode="email" autocomplete="username" required>
                    </label>
                    <label class="pnl-label">Password
                        <input class="pnl-input" name="password" type="password" autocomplete="current-password" required>
                    </label>
                    <button class="pnl-btn pnl-primary" type="submit">🔐 Masuk Pengelola</button>
                </form>
                <p class="pnl-note">Hak pengelola diperiksa server (Supabase). Warga biasa masuk lewat tombol Instagram di gerbang kota.</p>
                </div>`;
        } else {
            const badge = { kota: d.stats.projects, voting: d.stats.voting };
            html = `${head}
                ${this.renderTop(d)}
                <div class="adm-shell">
                    <nav class="adm-side" role="tablist" aria-label="Menu panel">
                        ${TABS.map(([k, i, t]) => `<button role="tab" class="${this.tab === k ? 'active' : ''}" aria-selected="${this.tab === k}" data-act="tab" data-tab="${k}"><span aria-hidden="true">${i}</span>${t}${badge[k] ? `<span class="adm-badge">${num(badge[k])}</span>` : ''}</button>`).join('')}
                    </nav>
                    <div class="adm-main">
                        <div class="pnl-body" role="tabpanel">${err}${this.renderTab(d)}</div>
                        <div class="pnl-foot">
                            <span class="adm-live">Diperbarui ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · otomatis 30 dtk</span>
                            <button class="pnl-btn" data-act="refresh">🔄 Muat ulang</button>
                            <button class="pnl-btn" data-act="logout">🚪 Keluar</button>
                        </div>
                    </div>
                </div>`;
        }
        this.el.innerHTML = `<div class="modal-card admin-modal-card">${html}</div>`;

        const nb = this.el.querySelector('.pnl-body');
        if (nb && scroll) nb.scrollTop = scroll;
        if (focusKey) {
            const f = this.el.querySelector(focusKey);
            if (f) { f.focus(); if (caret !== null && f.setSelectionRange) try { f.setSelectionRange(caret, caret); } catch (e) {} }
        }
    }

    /** Baris status: kas + kendali yang sedang aktif (sekilas lihat kondisi kota). */
    renderTop(d) {
        const c = d.controls || {};
        const pills = [`<span class="adm-pill">🏛️ ${num(d.treasury)} ₳</span>`];
        if (c.maintenance) pills.push('<span class="adm-pill bad">🛠️ Perawatan</span>');
        const ev = EVENTS.find((x) => x[0] === c.event && x[0] !== 'none');
        if (ev) pills.push(`<span class="adm-pill warn">${ev[1]} ${esc(c.event_title || ev[2])}</span>`);
        const w = WEATHER.find((x) => x[0] === c.weather && x[0] !== 'bebas');
        if (w) pills.push(`<span class="adm-pill">${w[1]} ${w[2]}</span>`);
        const t = TIMES.find((x) => x[0] === c.time && x[0] !== 'bebas');
        if (t) pills.push(`<span class="adm-pill">${t[1]} ${t[2]}</span>`);
        if (c.traffic === 0) pills.push('<span class="adm-pill bad">⛔ Jalan ditutup</span>');
        if (typeof c.wage_mult === 'number' && c.wage_mult !== 1) pills.push(`<span class="adm-pill ok">💼 Upah ×${dec(c.wage_mult)}</span>`);
        for (const [k, i, l] of LOCKS) if (c[k]) pills.push(`<span class="adm-pill bad">${i} ${l}</span>`);
        if (pills.length === 1) pills.push('<span class="adm-pill ok">✅ Kota normal</span>');
        return `<div class="adm-top" aria-label="Status kota">${pills.join('')}</div>`;
    }

    renderTab(d) {
        switch (this.tab) {
            case 'dunia': return this.tabDunia(d);
            case 'ekonomi': return this.tabEkonomi(d);
            case 'kota': return this.tabKota(d);
            case 'aset': return this.tabAset(d);
            case 'distrik': return this.tabDistrik(d);
            case 'warga': return this.tabWarga(d);
            case 'voting': return this.tabVoting(d);
            case 'siaran': return this.tabSiaran(d);
            case 'log': return this.tabLog(d);
            default: return this.tabDasbor(d);
        }
    }

    tabDasbor(d) {
        const s = d.stats;
        const kpi = (icon, label, val, sub = '') => `<div class="adm-kpi"><small>${icon} ${label}</small><b>${val}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
        const jobs = Array.isArray(d.jobs_by_hour) ? d.jobs_by_hour : [];
        const max = Math.max(1, ...jobs);
        const bars = jobs.map((n, i) => `<span class="${n ? '' : 'z'}" style="height:${Math.max(4, Math.round((n / max) * 100))}%" title="${23 - i} jam lalu: ${n} kerja"></span>`).join('');
        const tot = Math.max(1, (s.have || 0) + (s.have_not || 0));
        const hp = Math.round(((s.have || 0) / tot) * 100);
        const audit = (d.audit || []).slice(0, 6).map((a) => `<li class="pnl-row"><div class="pnl-row-main"><b>${AUDIT[a.action] || esc(a.action)}</b><small>${esc(a.admin_name || '-')} · ${ago(a.created_at)}</small></div></li>`).join('');
        return `
            <div class="adm-kpis">
                ${kpi('🏛️', 'Kas kota', `${num(d.treasury)} ₳`)}
                ${kpi('👥', 'Warga', num(s.players), `${num(s.active_24h)} aktif 24 jam`)}
                ${kpi('🏠', 'Bangunan', num(s.buildings), `${num(s.public)} publik · ${num(s.protected)} dilindungi`)}
                ${kpi('🚧', 'Proyek berjalan', num(s.projects))}
                ${kpi('💼', 'Kerja 24 jam', num(s.jobs_24h), `${num(s.wages_24h)} ₳ upah`)}
                ${kpi('🪙', 'Koin beredar', `${num(s.coins_total)} ₳`)}
                ${kpi('💬', 'Chat 24 jam', num(s.chat_24h))}
                ${kpi('🗳️', 'Voting aktif', num(s.voting), s.banned ? `${num(s.banned)} akun beku` : '')}
            </div>
            <h3 class="pnl-h">Aktivitas kerja 24 jam terakhir</h3>
            <div class="adm-chart" role="img" aria-label="Grafik kerja per jam, puncak ${max} kerja">${bars}</div>
            <div class="adm-axis"><span>24 jam lalu</span><span>12 jam lalu</span><span>sekarang</span></div>
            <h3 class="pnl-h">Komposisi warga</h3>
            <div class="adm-split" aria-label="Desa Have ${s.have || 0}, Desa Have-Not ${s.have_not || 0}">
                <span style="width:${hp}%;background:#E9A91E">${hp >= 18 ? `Have ${num(s.have)}` : ''}</span>
                <span style="width:${100 - hp}%;background:#7FB069">${100 - hp >= 18 ? `Have-Not ${num(s.have_not)}` : ''}</span>
            </div>
            <div class="pnl-actions">
                <button class="pnl-btn pnl-primary" data-act="tab" data-tab="dunia">🎛️ Kendali dunia</button>
                <button class="pnl-btn" data-act="finish-all" ${s.projects ? '' : 'disabled'}>⚡ Selesaikan ${num(s.projects)} proyek</button>
                <button class="pnl-btn" data-act="empty-lot">📍 Cari kavling kosong</button>
            </div>
            <h3 class="pnl-h">Aksi pengelola terbaru</h3>
            ${audit ? `<ul class="pnl-list">${audit}</ul>` : empty('Belum ada aksi tercatat.')}`;
    }

    tabDunia(d) {
        const c = { ...NORMAL, ...(d.controls || {}) };
        const crowdAuto = !(typeof c.crowd === 'number' && c.crowd >= 0);
        return `
            <div class="adm-card">
                <h4>⚡ Skenario sekali ketuk</h4>
                <div class="adm-scen">${SCENARIOS.map(([k, i, t, sub]) => `<button type="button" data-act="scenario" data-key="${k}"><b>${i} ${t}</b><small>${sub}</small></button>`).join('')}</div>
                <p class="pnl-note">Semua kendali tampil di layar setiap warga dalam ±45 detik. "Bebas" = warga memilih sendiri.</p>
            </div>
            <div class="adm-card"><h4>🌦️ Cuaca kota</h4>${seg('weather', WEATHER, c.weather)}</div>
            <div class="adm-card"><h4>🕰️ Waktu kota</h4>${seg('time', TIMES, c.time)}</div>
            <div class="adm-card">
                <h4>🚗 Lalu lintas & keramaian</h4>
                <label class="adm-range">Lalu lintas
                    <input type="range" min="0" max="2" step="0.25" value="${c.traffic}" data-ctl="traffic" data-out="traffic" aria-label="Kecepatan lalu lintas">
                    <output data-for="traffic">${this.rangeLabel('traffic', c.traffic)}</output>
                </label>
                <label class="adm-range">Keramaian
                    <input type="range" min="0" max="1" step="0.05" value="${crowdAuto ? 0.5 : c.crowd}" data-ctl="crowd" data-out="crowd" aria-label="Keramaian warga">
                    <output data-for="crowd">${crowdAuto ? 'Otomatis' : this.rangeLabel('crowd', c.crowd)}</output>
                </label>
                <div class="pnl-actions"><button class="pnl-btn" data-act="crowd-auto" ${crowdAuto ? 'disabled' : ''}>👥 Keramaian ikut jumlah warga</button></div>
            </div>
            <div class="adm-card">
                <h4>🎪 Acara kota</h4>
                <form class="adm-inline" data-form="event">
                    <select class="pnl-input" name="event" aria-label="Jenis acara">${EVENTS.map(([v, i, t]) => `<option value="${v}" ${c.event === v ? 'selected' : ''}>${i} ${t}</option>`).join('')}</select>
                    <input class="pnl-input" name="title" maxlength="60" placeholder="Judul spanduk" value="${esc(c.event_title)}" aria-label="Judul spanduk acara">
                    <button class="pnl-btn pnl-primary" type="submit">🎪 Terapkan</button>
                </form>
            </div>
            <div class="adm-card">
                <h4>🔐 Kunci fitur warga</h4>
                ${LOCKS.map(([k, i, l]) => toggle(k, `${i} ${l}`, c[k])).join('')}
            </div>
            <div class="adm-card">
                <h4>🛠️ Mode perawatan</h4>
                ${toggle('maintenance', '🛠️ Jeda semua aksi warga', c.maintenance)}
                <form class="adm-inline" data-form="rawat">
                    <input class="pnl-input" name="msg" maxlength="120" placeholder="Pesan untuk warga" value="${esc(c.maintenance_msg || '')}" aria-label="Pesan perawatan">
                    <button class="pnl-btn" type="submit">💾 Simpan pesan</button>
                </form>
            </div>`;
    }

    tabEkonomi(d) {
        const c = { ...NORMAL, ...(d.controls || {}) };
        const st = d.settings || {};
        return `
            <div class="adm-card">
                <h4>💰 Kas kota · ${num(d.treasury)} ₳</h4>
                <form class="pnl-form" data-form="kas">
                    <div class="pnl-grid">
                        <label class="pnl-label">Jumlah ₳<input class="pnl-input" name="amount" type="number" min="1" max="10000000" inputmode="numeric" required></label>
                        <label class="pnl-label">Arah<select class="pnl-input" name="dir"><option value="plus">➕ Tambah</option><option value="minus">➖ Pakai</option></select></label>
                    </div>
                    <label class="pnl-label">Keperluan<input class="pnl-input" name="reason" maxlength="80" placeholder="Subsidi fasilitas publik"></label>
                    <button class="pnl-btn pnl-primary" type="submit">💰 Catat ke kas kota</button>
                </form>
            </div>
            <div class="adm-card">
                <h4>💼 Upah & jeda kerja</h4>
                <form class="pnl-form" data-form="upah">
                    <label class="adm-range">Pengali upah
                        <input type="range" name="wage" min="0.5" max="3" step="0.25" value="${c.wage_mult}" data-out="wage" aria-label="Pengali upah">
                        <output data-for="wage">×${dec(c.wage_mult)}</output>
                    </label>
                    <label class="pnl-label">Jeda antar kerja (menit, 0–120)<input class="pnl-input" name="cooldown" type="number" min="0" max="120" inputmode="numeric" value="${c.cooldown_min}" required></label>
                    <button class="pnl-btn pnl-primary" type="submit">💼 Berlakukan</button>
                </form>
            </div>
            <div class="adm-card">
                <h4>📐 Aturan kota</h4>
                <form class="pnl-form" data-form="aturan">
                    <div class="pnl-grid">
                        <label class="pnl-label">Batas koin harian<input class="pnl-input" name="cap" type="number" min="50" max="100000" inputmode="numeric" value="${st.daily_coin_cap ?? ''}"></label>
                        <label class="pnl-label">Kuorum voting<input class="pnl-input" name="quorum" type="number" min="1" max="1000" inputmode="numeric" value="${st.vote_quorum ?? ''}"></label>
                        <label class="pnl-label">Durasi voting (jam)<input class="pnl-input" name="hours" type="number" min="1" max="336" inputmode="numeric" value="${st.vote_duration_hours ?? ''}"></label>
                        <label class="pnl-label">Nama kota<input class="pnl-input" name="city" maxlength="40" value="${esc(st.city_name || '')}"></label>
                    </div>
                    <button class="pnl-btn pnl-primary" type="submit">📐 Simpan aturan</button>
                </form>
            </div>
            <div class="adm-card">
                <h4>🎁 Bansos merata (dari kas kota)</h4>
                <form class="pnl-form" data-form="bansos">
                    <div class="pnl-grid">
                        <label class="pnl-label">₳ per warga<input class="pnl-input" name="amount" type="number" min="1" max="100000" inputmode="numeric" required></label>
                        <label class="pnl-label">Penerima<select class="pnl-input" name="village"><option value="">Semua desa (${num(d.stats.players)})</option><option value="have">Desa Have (${num(d.stats.have)})</option><option value="have_not">Desa Have-Not (${num(d.stats.have_not)})</option></select></label>
                    </div>
                    <label class="pnl-label">Nama program<input class="pnl-input" name="reason" maxlength="60" placeholder="Bantuan sosial"></label>
                    <button class="pnl-btn pnl-primary" type="submit">🎁 Bagikan</button>
                </form>
            </div>`;
    }

    buildingRow(b) {
        const [si, sl] = STAGE[b.stage] || ['•', b.stage];
        return `
            <li class="pnl-row">
                <div class="pnl-row-main">
                    <b>${esc(b.type)}${b.is_protected ? ' 🛡️' : ''}${b.is_public ? ' 🏛️' : ''}</b>
                    <small>${si} ${sl} · ${esc(b.district_key)} [${b.grid_i}, ${b.grid_j}] · ${b.owner_name ? `@${esc(String(b.owner_name).replace(/^@/, ''))}` : 'Pemkot'}${b.stage !== 'selesai' && b.build_finished_at ? ` · selesai ${when(b.build_finished_at)}` : ''}</small>
                </div>
                <div class="pnl-row-act">
                    <button class="pnl-btn" data-act="fly" data-id="${esc(b.id)}" aria-label="Lihat di peta">📍</button>
                    ${b.stage !== 'selesai' ? `<button class="pnl-btn" data-act="finish" data-id="${esc(b.id)}">⚡ Percepat</button>` : ''}
                    <button class="pnl-btn" data-act="protect" data-id="${esc(b.id)}" data-on="${b.is_protected ? '0' : '1'}">${b.is_protected ? '🔓 Buka' : '🛡️ Lindungi'}</button>
                    <button class="pnl-btn pnl-danger" data-act="demolish" data-id="${esc(b.id)}" ${b.is_protected ? 'disabled title="Buka perlindungan dulu"' : ''}>🚧 Gusur</button>
                    <details class="adm-more"><summary>✏️ Ubah</summary>
                        <form class="adm-more-body" data-form="bld" data-id="${esc(b.id)}">
                            <label class="pnl-label">Jenis bangunan<input class="pnl-input" name="type" maxlength="40" placeholder="${esc(b.type)}" pattern="[a-z0-9_]{2,40}"></label>
                            <label class="pnl-label">Pemilik baru (@username)<input class="pnl-input" name="owner" maxlength="31" placeholder="kosongkan = tetap"></label>
                            ${toggle('', '🏛️ Jadikan milik Pemkot (publik)', false, 'name="public"')}
                            <button class="pnl-btn pnl-primary" type="submit">💾 Simpan</button>
                        </form>
                    </details>
                </div>
            </li>`;
    }

    tabKota(d) {
        const q = this.bq;
        const res = q.res;
        const filters = [['semua', 'Semua'], ['proyek', '🚧 Proyek'], ['selesai', '✅ Selesai'], ['publik', '🏛️ Publik'], ['pribadi', '🏠 Pribadi'], ['lindung', '🛡️ Dilindungi']];
        const list = !res ? empty('⏳ Memuat daftar bangunan…')
            : res.rows.length ? `<ul class="pnl-list">${res.rows.map((b) => this.buildingRow(b)).join('')}</ul>` : empty('Tidak ada bangunan yang cocok.');
        const pages = res ? `
            <div class="adm-page">
                <button class="pnl-btn" data-act="bpage" data-step="-1" ${q.offset ? '' : 'disabled'}>◀ Sebelumnya</button>
                <span>${res.total ? `${num(q.offset + 1)}–${num(Math.min(q.offset + 20, res.total))} dari ${num(res.total)}` : '0'}</span>
                <button class="pnl-btn" data-act="bpage" data-step="1" ${q.offset + 20 < res.total ? '' : 'disabled'}>Berikutnya ▶</button>
            </div>` : '';
        return `
            <div class="pnl-actions">
                <button class="pnl-btn pnl-primary" data-act="finish-all" ${d.stats.projects ? '' : 'disabled'}>⚡ Selesaikan semua proyek (${num(d.stats.projects)})</button>
                <button class="pnl-btn" data-act="empty-lot">📍 Cari kavling kosong</button>
            </div>
            <h3 class="pnl-h">Semua bangunan</h3>
            <form class="adm-tools" data-form="bsearch" role="search">
                <input class="pnl-input" name="q" type="search" value="${esc(q.q)}" placeholder="Cari jenis, @pemilik, atau distrik" aria-label="Cari bangunan">
                <button class="pnl-btn" type="submit">🔎 Cari</button>
            </form>
            <div class="adm-chips" role="group" aria-label="Filter bangunan">${filters.map(([k, t]) => `<button type="button" class="${q.filter === k ? 'on' : ''}" aria-pressed="${q.filter === k}" data-act="bfilter" data-key="${k}">${t}</button>`).join('')}</div>
            ${list}${pages}`;
    }

    tabAset(d) {
        const m = this.manifest;
        if (!m) return empty('⏳ Memuat daftar aset…');
        const cat = this.aq.cat;
        const needle = this.aq.q.trim().toLowerCase();
        const items = Object.entries(m)
            .filter(([id, e]) => assetCat(id, e) === cat)
            .filter(([id, e]) => !needle || `${id} ${e.title}`.toLowerCase().includes(needle))
            .sort((a, b) => a[1].title.localeCompare(b[1].title));
        const sel = this.aq.sel;
        const chips = ASSET_CATS.map(([k, i, t]) => `<button type="button" class="${cat === k ? 'on' : ''}" aria-pressed="${cat === k}" data-act="acat" data-key="${k}">${i} ${t}</button>`).join('');
        const sz = (a) => a.map((n) => dec(Math.round(n * 10) / 10)).join('×');
        const list = items.length
            ? `<ul class="pnl-list">${items.map(([id, e]) => `
                <li class="pnl-row">
                    <div class="pnl-row-main"><b>${esc(e.title)}${sel === id ? ' ✅' : ''}</b><small>${num(e.triangles)} tri · ${sz(e.size)} m</small></div>
                    <div class="pnl-row-act"><button class="pnl-btn ${sel === id ? 'pnl-primary' : ''}" data-act="asel" data-key="${esc(id)}">${sel === id ? '✅ Terpilih' : 'Pilih'}</button></div>
                </li>`).join('')}</ul>`
            : empty('Tidak ada aset yang cocok.');
        const selEntry = sel && m[sel];
        const rotOpt = [0, 90, 180, 270].map((r) => `<option value="${r}" ${Number(this.aq.rot) === r ? 'selected' : ''}>${r}°</option>`).join('');
        const scaleOpt = [['0.5', '0,5×'], ['1', '1×'], ['1.5', '1,5×'], ['2', '2×']].map(([v, t]) => `<option value="${v}" ${String(this.aq.scale) === v ? 'selected' : ''}>${t}</option>`).join('');
        const placeCard = selEntry ? `
            <div class="adm-card">
                <h4>📍 Tempatkan: ${esc(selEntry.title)}</h4>
                <div class="adm-inline">
                    <label class="pnl-label">Rotasi<select class="pnl-input" data-aq="rot">${rotOpt}</select></label>
                    <label class="pnl-label">Skala<select class="pnl-input" data-aq="scale">${scaleOpt}</select></label>
                </div>
                <div class="pnl-actions"><button class="pnl-btn pnl-primary" data-act="aplace">📍 Tempat di tengah layar</button></div>
                <form class="adm-inline" data-form="aset">
                    <label class="pnl-label">X<input class="pnl-input" name="x" type="number" step="1" inputmode="numeric" placeholder="koordinat X"></label>
                    <label class="pnl-label">Z<input class="pnl-input" name="z" type="number" step="1" inputmode="numeric" placeholder="koordinat Z"></label>
                    <button class="pnl-btn" type="submit">📌 Tempat di koordinat</button>
                </form>
            </div>` : empty('Pilih aset dari daftar untuk menempatkannya.');
        const pls = this.placements || [];
        const plist = pls.length
            ? `<ul class="pnl-list">${pls.map((p) => `
                <li class="pnl-row">
                    <div class="pnl-row-main"><b>${esc((m[p.asset_id] && m[p.asset_id].title) || p.asset_id)}</b><small>${esc(p.category)} · [${Math.round(p.world_x)}, ${Math.round(p.world_z)}]${p.placed_name ? ` · ${esc(p.placed_name)}` : ''}</small></div>
                    <div class="pnl-row-act"><button class="pnl-btn pnl-danger" data-act="aremove" data-id="${esc(p.id)}" aria-label="Hapus aset">🗑️</button></div>
                </li>`).join('')}</ul>`
            : empty('Belum ada aset yang ditempatkan admin.');
        return `
            <p class="pnl-note">Pilih aset dari daftar lalu tempatkan di kota. Tersimpan di server & tampil untuk semua warga (lapisan terpisah, tak menumpuk ke bangunan).</p>
            <div class="adm-chips" role="group" aria-label="Kategori aset">${chips}</div>
            <div class="adm-tools"><input class="pnl-input" type="search" data-aq="q" value="${esc(this.aq.q)}" placeholder="Cari nama aset" aria-label="Cari aset"></div>
            <h3 class="pnl-h">${ASSET_CATS.find((c) => c[0] === cat)[2]} (${num(items.length)})</h3>
            ${list}
            ${placeCard}
            <h3 class="pnl-h">Aset terpasang (${num(pls.length)})</h3>
            ${plist}`;
    }

    tabDistrik(d) {
        const ds = d.districts || [];
        if (!ds.length) return empty('Data distrik belum ada di server.');
        const open = ds.filter((x) => x.is_unlocked).length;
        return `
            <p class="pnl-note">${num(open)} dari ${num(ds.length)} distrik terbuka. Ring 0 = pusat kota (k12).</p>
            <div class="adm-dist">${ds.map((x) => `
                <div class="adm-card ${x.is_unlocked ? '' : 'locked'}">
                    <h4>${x.is_unlocked ? '🗺️' : '🔒'} ${esc(x.name)}</h4>
                    <small class="pnl-note">${esc(x.key)} · ring ${x.ring} · ${num(x.buildings)} bangunan · buka ${num(x.unlock_cost)} ₳</small>
                    ${toggle('', 'Terbuka untuk warga', x.is_unlocked, `data-unlock="${esc(x.key)}"`)}
                    <details class="adm-more"><summary>✏️ Ubah</summary>
                        <form class="adm-more-body" data-form="distrik" data-id="${esc(x.key)}">
                            <label class="pnl-label">Nama<input class="pnl-input" name="name" maxlength="40" value="${esc(x.name)}"></label>
                            <label class="pnl-label">Biaya buka ₳<input class="pnl-input" name="cost" type="number" min="0" inputmode="numeric" value="${Number(x.unlock_cost) || 0}"></label>
                            <button class="pnl-btn pnl-primary" type="submit">💾 Simpan</button>
                        </form>
                    </details>
                </div>`).join('')}
            </div>`;
    }

    tabWarga(d) {
        const q = this.pq;
        const needle = q.q.trim().toLowerCase().replace(/^@/, '');
        let ps = (d.players || []).filter((p) => (!needle || String(p.username).toLowerCase().replace(/^@/, '').includes(needle) || String(p.profession).toLowerCase().includes(needle))
            && (!q.village || p.village === q.village || (q.village === 'beku' && p.banned)));
        const by = { koin: (a, b) => b.coins - a.coins, kerja: (a, b) => (b.total_worked || 0) - (a.total_worked || 0), aktif: (a, b) => new Date(b.last_worked_at || 0) - new Date(a.last_worked_at || 0) }[q.sort];
        if (by) ps = [...ps].sort(by);
        const muted = (p) => p.muted_until && new Date(p.muted_until) > new Date();
        const rows = ps.slice(0, 80).map((p) => {
            const admin = p.role === 'walikota';
            return `
            <li class="pnl-row">
                <div class="pnl-row-main">
                    <b>@${esc(String(p.username).replace(/^@/, ''))}${admin ? ' 👑' : p.role === 'arsitek' ? ' 📐' : ''}${p.banned ? ' 🔒' : ''}${muted(p) ? ' 🔇' : ''}</b>
                    <small>${esc(p.profession)} · ${VILLAGE[p.village] || '-'} · 🪙 ${num(p.coins)} ₳ · 💼 ${num(p.total_worked)}× · 🏠 ${num(p.buildings)} · kerja ${ago(p.last_worked_at)}</small>
                </div>
                ${admin ? '' : `
                <details class="adm-more"><summary>⚙️ Kelola</summary>
                    <div class="adm-more-body">
                        <form class="adm-inline" data-form="coins" data-id="${esc(p.id)}">
                            <input class="pnl-input pnl-num" name="coins" type="number" min="0" inputmode="numeric" value="${Number(p.coins) || 0}" aria-label="Saldo">
                            <button class="pnl-btn" type="submit">💾 Saldo</button>
                        </form>
                        <form class="adm-inline" data-form="peran" data-id="${esc(p.id)}">
                            <select class="pnl-input" name="role" aria-label="Peran"><option value="warga" ${p.role === 'warga' ? 'selected' : ''}>👤 Warga</option><option value="arsitek" ${p.role === 'arsitek' ? 'selected' : ''}>📐 Arsitek</option></select>
                            <button class="pnl-btn" type="submit">💾 Peran</button>
                        </form>
                        <form class="adm-inline" data-form="bisu" data-id="${esc(p.id)}">
                            <select class="pnl-input" name="mins" aria-label="Bisukan chat"><option value="0">🔊 Tidak dibisukan</option><option value="15">🔇 15 menit</option><option value="60">🔇 1 jam</option><option value="1440">🔇 1 hari</option><option value="10080">🔇 7 hari</option></select>
                            <button class="pnl-btn" type="submit">💾 Chat</button>
                        </form>
                        ${toggle('', '🔒 Bekukan akun', p.banned, `data-ban="${esc(p.id)}"`)}
                        <div class="pnl-actions">
                            <button class="pnl-btn" data-act="cooldown" data-id="${esc(p.id)}">⏱️ Reset jeda kerja</button>
                            <button class="pnl-btn pnl-danger" data-act="kick" data-id="${esc(p.id)}">⛔ Keluarkan</button>
                        </div>
                    </div>
                </details>`}
            </li>`;
        }).join('');
        return `
            <div class="adm-tools">
                <input class="pnl-input" type="search" data-pq="q" value="${esc(q.q)}" placeholder="Cari @username atau profesi" aria-label="Cari warga">
                <select class="pnl-input" data-pq="village" aria-label="Filter desa"><option value="">Semua desa</option><option value="have" ${q.village === 'have' ? 'selected' : ''}>Desa Have</option><option value="have_not" ${q.village === 'have_not' ? 'selected' : ''}>Desa Have-Not</option><option value="beku" ${q.village === 'beku' ? 'selected' : ''}>🔒 Dibekukan</option></select>
                <select class="pnl-input" data-pq="sort" aria-label="Urutkan"><option value="baru">Terbaru</option><option value="koin" ${q.sort === 'koin' ? 'selected' : ''}>Koin terbanyak</option><option value="kerja" ${q.sort === 'kerja' ? 'selected' : ''}>Paling rajin</option><option value="aktif" ${q.sort === 'aktif' ? 'selected' : ''}>Terakhir aktif</option></select>
            </div>
            <h3 class="pnl-h">Warga (${num(ps.length)}${ps.length > 80 ? ', 80 ditampilkan' : ''})</h3>
            ${rows ? `<ul class="pnl-list">${rows}</ul>` : empty('Tidak ada warga yang cocok.')}`;
    }

    tabVoting(d) {
        const ps = d.proposals || [];
        const rows = ps.map((p) => {
            const [si, sl] = PROP_STATUS[p.status] || ['•', p.status];
            const pct = Math.min(100, Math.round((p.votes_yes / Math.max(1, p.quorum)) * 100));
            const live = p.status === 'voting';
            return `
            <li class="pnl-row">
                <div class="pnl-row-main">
                    <b>${esc(p.title)}</b>
                    <small>${si} ${sl} · ${esc(p.building_type)} · ${esc(p.district_key)} [${p.grid_i}, ${p.grid_j}]${p.proposer_name ? ` · oleh ${esc(p.proposer_name)}` : ''}</small>
                    <small>👍 ${num(p.votes_yes)} · 👎 ${num(p.votes_no)} · kuorum ${num(p.quorum)}${live ? ` · tutup ${when(p.expires_at)}` : ''}</small>
                    <div class="adm-bar" aria-label="${pct}% menuju kuorum"><span style="width:${pct}%"></span></div>
                </div>
                <div class="pnl-row-act">
                    ${live ? `<button class="pnl-btn pnl-primary" data-act="prop" data-key="approve" data-id="${esc(p.id)}">✅ Sahkan</button>
                    <button class="pnl-btn" data-act="prop" data-key="reject" data-id="${esc(p.id)}">❌ Tolak</button>
                    <button class="pnl-btn" data-act="prop" data-key="extend" data-id="${esc(p.id)}">⏳ +24 jam</button>` : ''}
                    <button class="pnl-btn pnl-danger" data-act="prop" data-key="delete" data-id="${esc(p.id)}" aria-label="Hapus usulan">🗑️</button>
                </div>
            </li>`;
        }).join('');
        return `
            <p class="pnl-note">Sahkan = fasilitas langsung dibangun di kavling usulan. Kuorum & durasi voting diatur di tab Ekonomi.</p>
            ${rows ? `<ul class="pnl-list">${rows}</ul>` : empty('Belum ada usulan warga.')}`;
    }

    tabSiaran(d) {
        const c = d.controls || {};
        const news = (d.news || []).map((n) => `
            <li class="pnl-row">
                <div class="pnl-row-main"><b>${esc(n.message)}</b><small>${esc(n.category)} · ${ago(n.created_at)}</small></div>
                <div class="pnl-row-act"><button class="pnl-btn pnl-danger" data-act="del-news" data-id="${Number(n.id)}" aria-label="Hapus kabar">🗑️</button></div>
            </li>`).join('');
        const chat = (d.chat || []).map((m) => `
            <li class="pnl-row">
                <div class="pnl-row-main"><b>${esc(m.player_name)}</b><small>${esc(m.message)} · ${ago(m.created_at)}</small></div>
                <div class="pnl-row-act"><button class="pnl-btn pnl-danger" data-act="del-chat" data-id="${Number(m.id)}" aria-label="Hapus pesan">🗑️</button></div>
            </li>`).join('');
        return `
            <div class="adm-card">
                <h4>📢 Pengumuman resmi</h4>
                <p class="pnl-note">Saat ini: <b>${esc(d.announcement || '-')}</b></p>
                <form class="pnl-form" data-form="umum">
                    <label class="pnl-label">Pengumuman baru (3–200 karakter)<textarea class="pnl-input" name="message" rows="2" maxlength="200" minlength="3" required></textarea></label>
                    <button class="pnl-btn pnl-primary" type="submit">📢 Siarkan</button>
                </form>
            </div>
            <div class="adm-card">
                <h4>📰 Kirim kabar kota</h4>
                <form class="pnl-form" data-form="kabar">
                    <div class="adm-inline">
                        <select class="pnl-input" name="cat" aria-label="Kategori">${NEWS_CAT.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
                    </div>
                    <textarea class="pnl-input" name="message" rows="2" maxlength="200" minlength="3" required aria-label="Isi kabar"></textarea>
                    <button class="pnl-btn pnl-primary" type="submit">📰 Kirim ke ticker</button>
                </form>
            </div>
            <h3 class="pnl-h">Kabar terbaru (${num((d.news || []).length)})</h3>
            ${news ? `<ul class="pnl-list">${news}</ul>` : empty('Belum ada kabar.')}
            <div class="adm-card">
                <h4>💬 Moderasi chat</h4>
                ${toggle('chat_locked', '💬 Kunci chat kota', c.chat_locked)}
                <div class="pnl-actions"><button class="pnl-btn pnl-danger" data-act="clear-chat" ${(d.chat || []).length ? '' : 'disabled'}>🧽 Bersihkan semua chat</button></div>
            </div>
            ${chat ? `<ul class="pnl-list">${chat}</ul>` : empty('Belum ada chat.')}`;
    }

    tabLog(d) {
        const fmt = (det) => {
            if (!det || typeof det !== 'object') return '';
            return Object.entries(det).filter(([, v]) => v !== null && v !== '' && v !== false)
                .slice(0, 6).map(([k, v]) => `<code>${esc(k)}: ${esc(typeof v === 'object' ? JSON.stringify(v) : v).slice(0, 80)}</code>`).join(' ');
        };
        const rows = (d.audit || []).map((a) => `
            <li class="pnl-row">
                <div class="pnl-row-main"><b>${AUDIT[a.action] || esc(a.action)}</b><small>${esc(a.admin_name || '-')} · ${when(a.created_at)}</small><div>${fmt(a.detail)}</div></div>
            </li>`).join('');
        return `
            <p class="pnl-note">100 aksi pengelola terakhir, dicatat server (tidak bisa diubah dari panel).</p>
            ${rows ? `<ul class="pnl-list adm-log">${rows}</ul>` : empty('Belum ada aksi tercatat.')}`;
    }
}
