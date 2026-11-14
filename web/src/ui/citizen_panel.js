/**
 * AUDIRA-LAND: Panel Warga (chunk lazy).
 * Profil/KTP, saldo, rumah & progres pembangunan, pekerjaan & bonus profesi, voting kota.
 *
 * Aturan bundel: TIDAK mengimpor modul bundel utama. Dependensi disuntikkan main.js:
 *   { playerState, getProfession(id), bonusRate, getMyHome(), getBuildingMeta(type),
 *     getSnapshot(), vote(id, yes), onOpenKTP(), onGoHome(), onRegister(), toast(title, msg, icon) }
 */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('id-ID');
const mmss = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const TABS = [
    ['profil', '🪪 Profil'],
    ['rumah', '🏡 Rumah'],
    ['kerja', '💼 Kerja'],
    ['voting', '🗳️ Voting'],
    ['distrik', '🗺️ Distrik'],
];

// Jenis fasilitas publik yang boleh diusulkan warga untuk divoting.
const PROPOSAL_TYPES = [
    ['ibadah', '🕌 Tempat Ibadah'],
    ['sekolah', '🏫 Sekolah'],
    ['rs', '🏥 Rumah Sakit'],
    ['pasar', '🧺 Pasar Rakyat'],
    ['taman_surya', '⛲ Taman Kota'],
    ['pos_ronda', '🚨 Pos Ronda'],
];

export class CitizenPanel {
    constructor(opts = {}) {
        this.o = opts;
        this.tab = 'profil';
        this.proposals = null;
        this.voteErr = '';
        this.timer = 0;

        let el = document.getElementById('citizen-panel-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'citizen-panel-overlay';
            el.className = 'modal-backdrop pnl';
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            el.setAttribute('aria-label', 'Panel Warga');
            document.body.appendChild(el);
        }
        this.el = el;
        el.addEventListener('click', (e) => this.onClick(e));
        opts.playerState?.onChange(() => { if (this.isOpen()) this.render(); });
    }

    isOpen() {
        return this.el.classList.contains('active');
    }

    show(tab) {
        if (tab) this.tab = tab;
        this.el.classList.add('active');
        this.render();
        if (this.tab === 'voting') this.loadVoting();
        clearInterval(this.timer);
        // Progres rumah & jeda kerja berjalan live selama panel terbuka
        this.timer = setInterval(() => {
            if (!this.isOpen()) { clearInterval(this.timer); return; }
            // Hanya blok angka live yang diganti, tombol tidak ikut dirender ulang (tap di HP tidak hilang)
            const live = this.el.querySelector('.pnl-live');
            if (live) live.innerHTML = this.liveHTML(this.o.playerState.state);
        }, 1000);
    }

    hide() {
        this.el.classList.remove('active');
        clearInterval(this.timer);
    }

    async loadVoting() {
        this.proposals = null;
        this.render();
        try {
            const res = await this.o.getSnapshot();
            this.proposals = (res && res.data && res.data.active_proposals) || [];
        } catch (e) {
            this.proposals = [];
            this.voteErr = 'Gagal memuat usulan.';
        }
        if (this.isOpen()) this.render();
    }

    async onClick(e) {
        if (e.target === this.el) { this.hide(); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const { act, tab, id } = b.dataset;
        if (act === 'close') this.hide();
        else if (act === 'tab') {
            this.tab = tab;
            this.render();
            if (tab === 'voting') this.loadVoting();
        } else if (act === 'ktp') { this.hide(); this.o.onOpenKTP?.(); }
        else if (act === 'home') { this.hide(); this.o.onGoHome?.(); }
        else if (act === 'register') { this.hide(); this.o.onRegister?.(); }
        else if (act === 'vote') {
            b.disabled = true;
            try {
                const res = await this.o.vote(id, b.dataset.yes === '1');
                const d = res && res.data;
                if (res && res.error) throw new Error(res.error.message || 'Gagal mengirim suara.');
                if (d && d.success === false) throw new Error(d.error || 'Suara ditolak server.');
                this.voteErr = '';
                this.o.toast?.('🗳️ Suara Terkirim', 'Terima kasih sudah ikut menentukan kota!', '🗳️');
            } catch (err) {
                this.voteErr = err.message;
            }
            this.loadVoting();
        } else if (act === 'propose') {
            const title = (this.el.querySelector('#pnl-prop-title')?.value || '').trim();
            const type = this.el.querySelector('#pnl-prop-type')?.value || PROPOSAL_TYPES[0][0];
            if (!title) { this.voteErr = 'Tulis judul usulan dulu.'; this.render(); return; }
            b.disabled = true;
            try {
                const res = await this.o.propose?.(title, type);
                if (res && res.error) throw new Error(res.error);
                this.voteErr = '';
                this.o.toast?.('🗳️ Usulan Terkirim', 'Usulanmu masuk daftar voting warga kota.', '🗳️');
            } catch (err) {
                this.voteErr = err.message || 'Gagal mengirim usulan.';
            }
            this.loadVoting();
        } else if (act === 'unlock') {
            b.disabled = true;
            const res = this.o.unlockDistrict?.(id, Number(b.dataset.cost) || 0);
            if (res && res.success) {
                this.o.toast?.('🗺️ Distrik Dibuka', `Distrik ${id} kini terbuka untuk dibangun warga.`, '🎉');
            } else {
                this.o.toast?.('🗺️ Belum Bisa Dibuka', (res && res.message) || 'Kas Kota belum cukup.', '⏳');
            }
            this.render();
        }
    }

    render() {
        const p = this.o.playerState.state;
        const head = `
            <div class="modal-header">
                <div class="modal-title-wrap">
                    <span class="modal-icon" aria-hidden="true">🏠</span>
                    <div>
                        <h2 class="modal-title">Panel Warga</h2>
                        <p class="modal-subtitle">${p.isRegistered ? esc(p.username) : 'Tamu kota'}</p>
                    </div>
                </div>
                <button class="modal-close pnl-close" data-act="close" aria-label="Tutup">✕</button>
            </div>`;
        let body;
        if (!p.isRegistered) {
            body = `<div class="pnl-body">
                <p class="pnl-note">Kamu masih tamu. Daftar lewat Instagram untuk dapat KTP, rumah, dan pekerjaan.</p>
                <button class="pnl-btn pnl-primary" data-act="register">📸 Masuk dengan Instagram</button>
            </div>`;
        } else {
            body = `
                <div class="pnl-saldo"><span>Saldo</span><b>${num(p.coins)} ₳</b></div>
                <nav class="admin-tab-nav" role="tablist">
                    ${TABS.map(([k, t]) => `<button class="admin-tab-btn ${this.tab === k ? 'active' : ''}" role="tab" aria-selected="${this.tab === k}" data-act="tab" data-tab="${k}">${t}</button>`).join('')}
                </nav>
                <div class="pnl-body">${this.renderTab(p)}</div>`;
        }
        this.el.innerHTML = `<div class="modal-card">${head}${body}</div>`;
    }

    /** Bagian yang berubah tiap detik: progres rumah / jeda kerja. */
    liveHTML(p) {
        if (this.tab === 'kerja') {
            const cd = this.o.playerState.getWorkCooldownRemaining();
            return `<b>${cd > 0 ? `⏳ Istirahat ${mmss(cd)}` : '✅ Siap bekerja'}</b><small>Ketuk bangunan di peta lalu pilih "Bekerja".</small>`;
        }
        const h = this.o.getMyHome?.();
        if (!h) return '';
        const start = new Date(h.build_started_at || 0).getTime();
        const end = new Date(h.build_finished_at || 0).getTime();
        const done = h.stage === 'selesai' || (end && Date.now() >= end);
        const pct = done ? 100 : Math.max(0, Math.min(99, Math.round(((Date.now() - start) / Math.max(1, end - start)) * 100)));
        return `
            <div class="pnl-progress" role="progressbar" aria-label="Progres pembangunan rumah" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
                <span style="width:${pct}%"></span>
            </div>
            <p class="pnl-note"><b>${done ? '✅ Rumah sudah jadi' : `🚧 Dibangun ${pct}% · sisa ${mmss(end - Date.now())}`}</b></p>`;
    }

    renderTab(p) {
        const prof = this.o.getProfession?.(p.professionId) || null;
        switch (this.tab) {
            case 'rumah': {
                const h = this.o.getMyHome?.();
                if (!h) return '<p class="pnl-note">Rumahmu belum terlihat di peta. Muat ulang halaman bila baru mendaftar.</p>';
                return `
                    <h3 class="pnl-h">${esc(h.title || p.houseLabel || 'Rumahku')}</h3>
                    <p class="pnl-note">${p.village === 'have' ? 'Desa Have' : 'Desa Have-Not'} · kavling [${h.grid_i}, ${h.grid_j}]${p.vehicleLabel ? ` · kendaraan: ${esc(p.vehicleLabel)}` : ''}</p>
                    <div class="pnl-live">${this.liveHTML(p)}</div>
                    <button class="pnl-btn pnl-primary" data-act="home">📍 Ke rumahku</button>`;
            }
            case 'kerja': {
                const places = prof ? prof.workplaces.map((t) => esc((this.o.getBuildingMeta?.(t) || {}).title || t)).join(', ') : '-';
                return `
                    <h3 class="pnl-h">${prof ? `${prof.icon} ${esc(prof.title)}` : esc(p.profession)}</h3>
                    ${prof ? `<p class="pnl-note">${esc(prof.desc)}</p>` : ''}
                    <ul class="pnl-list">
                        <li class="pnl-row"><div class="pnl-row-main"><b>Bonus profesi +${Math.round((this.o.bonusRate || 0) * 100)}%</b><small>di: ${places}</small></div></li>
                        <li class="pnl-row"><div class="pnl-row-main"><b>Hari ini ${num(p.todayEarnedCoins)} / 300 ₳</b><small>Total kerja: ${num(p.totalWorked)} kali</small></div></li>
                        <li class="pnl-row"><div class="pnl-row-main pnl-live">${this.liveHTML(p)}</div></li>
                    </ul>`;
            }
            case 'distrik': {
                const list = this.o.getDistricts?.() || [];
                if (!list.length) return '<p class="pnl-note">Data distrik belum siap.</p>';
                return `<p class="pnl-note">Buka distrik baru secara gotong royong memakai Kas Kota. Kas sekarang: <b>${num(this.o.playerState.cityTreasury)} ₳</b>.</p>
                    <ul class="pnl-list">${list.map((d) => `
                        <li class="pnl-row">
                            <div class="pnl-row-main"><b>${d.unlocked ? '🗺️' : '🔒'} ${esc(d.name)}</b><small>${esc(d.key)} · Ring ${d.ring}${d.unlocked ? ' · terbuka' : ` · butuh ${num(d.cost)} ₳`}</small></div>
                            ${d.unlocked ? '<span class="pnl-badge">✅ Terbuka</span>' : `<div class="pnl-row-act"><button class="pnl-btn pnl-primary" data-act="unlock" data-id="${esc(d.key)}" data-cost="${d.cost}" ${this.o.playerState.cityTreasury < d.cost ? 'disabled' : ''}>🔓 Buka (${num(d.cost)} ₳)</button></div>`}
                        </li>`).join('')}</ul>`;
            }
            case 'voting': {
                const err = this.voteErr ? `<p class="pnl-err" role="alert">${esc(this.voteErr)}</p>` : '';
                const form = `
                    <div class="pnl-propose">
                        <h3 class="pnl-h">✍️ Ajukan Usulan Fasilitas</h3>
                        <input id="pnl-prop-title" class="pnl-input" type="text" maxlength="60" placeholder="Judul usulan, misal: Musholla Blok B" />
                        <select id="pnl-prop-type" class="pnl-input">${PROPOSAL_TYPES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
                        <button class="pnl-btn pnl-primary" data-act="propose">📨 Kirim Usulan</button>
                    </div>`;
                if (!this.proposals) return `${err}${form}<p class="pnl-note">⏳ Memuat usulan…</p>`;
                if (!this.proposals.length) return `${err}${form}<p class="pnl-note">Belum ada usulan yang sedang divoting. Jadilah yang pertama mengusulkan!</p>`;
                return err + form + `<ul class="pnl-list">${this.proposals.map((q) => `
                    <li class="pnl-row">
                        <div class="pnl-row-main"><b>${esc(q.title)}</b><small>👍 ${q.votes_yes} · 👎 ${q.votes_no} · butuh ${q.quorum} setuju</small></div>
                        <div class="pnl-row-act">
                            <button class="pnl-btn pnl-primary" data-act="vote" data-yes="1" data-id="${esc(q.id)}">👍 Setuju</button>
                            <button class="pnl-btn" data-act="vote" data-yes="0" data-id="${esc(q.id)}">👎 Tolak</button>
                        </div>
                    </li>`).join('')}</ul>`;
            }
            default: {
                const initial = esc(String(p.username || 'W').replace(/^@/, '').charAt(0).toUpperCase()) || 'W';
                const avatar = `<div class="pnl-avatar" style="background:${esc(p.avatarColor || '#5B3A24')}">${p.avatarDataUrl
                    ? `<img class="pnl-avatar-img" src="${p.avatarDataUrl}" alt="Foto ${esc(p.username)}" />`
                    : initial}</div>`;
                return `
                    <div class="pnl-profil-head">${avatar}</div>
                    <ul class="pnl-list">
                        <li class="pnl-row"><div class="pnl-row-main"><b>${esc(p.username)}</b><small>NIK ${esc(p.nik || '-')}</small></div></li>
                        <li class="pnl-row"><div class="pnl-row-main"><b>${p.village === 'have' ? '🏙️ Desa Have' : '🌾 Desa Have-Not'}</b><small>${prof ? `${prof.icon} ${esc(prof.title)}` : esc(p.profession)}</small></div></li>
                        <li class="pnl-row"><div class="pnl-row-main"><b>Warga sejak</b><small>${p.createdAt ? new Date(p.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</small></div></li>
                    </ul>
                    <button class="pnl-btn pnl-primary" data-act="ktp">🪪 Lihat KTP lengkap</button>`;
            }
        }
    }
}
