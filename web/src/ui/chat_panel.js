/**
 * AUDIRA-LAND: Chat Warga Kota (Obrolan Publik)
 * Local-first: pesan disimpan di localStorage + dikirim ke server (send_chat) bila online.
 * Pesan dari snapshot server (get_city_snapshot.chat) digabung lewat mergeServer().
 *
 * Dependensi disuntikkan: { playerState, send(message), onRequireRegistration() }
 */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE = 'audira_land_chat';
const MAX = 60;

export class ChatPanel {
    constructor(opts = {}) {
        this.o = opts;
        this.open = false;
        this.messages = this.load();
        this.mount();
    }

    load() {
        try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { return []; }
    }
    save() {
        try { localStorage.setItem(STORE, JSON.stringify(this.messages.slice(-MAX))); } catch (e) {}
    }

    mount() {
        let el = document.getElementById('chat-widget');
        if (!el) {
            el = document.createElement('div');
            el.id = 'chat-widget';
            document.body.appendChild(el);
        }
        this.el = el;
        this.render();
        el.addEventListener('click', (e) => this.onClick(e));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.id === 'chat-input') { e.preventDefault(); this.sendCurrent(); }
        });
    }

    toggle(force) {
        this.open = force === undefined ? !this.open : force;
        this.render();
        if (this.open) {
            const inp = document.getElementById('chat-input');
            if (inp) inp.focus();
            this.scrollBottom();
        }
    }

    onClick(e) {
        const act = e.target.closest('[data-chat]')?.dataset.chat;
        if (act === 'toggle') this.toggle();
        else if (act === 'close') this.toggle(false);
        else if (act === 'send') this.sendCurrent();
        else if (act === 'register') { this.toggle(false); this.o.onRequireRegistration?.(); }
    }

    async sendCurrent() {
        const p = this.o.playerState.state;
        if (!p.isRegistered) { this.o.onRequireRegistration?.(); return; }
        const inp = document.getElementById('chat-input');
        const text = (inp?.value || '').trim();
        if (!text) return;
        inp.value = '';
        this.push({ name: p.username, message: text.slice(0, 200), at: Date.now(), self: true });
        try { await this.o.send?.(text.slice(0, 200)); } catch (e) { /* offline: pesan tetap tampil lokal */ }
    }

    push(m) {
        this.messages.push(m);
        if (this.messages.length > MAX) this.messages = this.messages.slice(-MAX);
        this.save();
        this.renderList();
        this.scrollBottom();
    }

    /** Gabungkan pesan dari server (snapshot.chat), hindari duplikat sederhana. */
    mergeServer(list) {
        if (!Array.isArray(list) || !list.length) return;
        const seen = new Set(this.messages.map((m) => `${m.name}|${m.message}`));
        let added = false;
        for (const c of list) {
            const name = c.player_name || c.name || 'Warga';
            const message = c.message || '';
            if (!message || seen.has(`${name}|${message}`)) continue;
            this.messages.push({ name, message, at: new Date(c.created_at || Date.now()).getTime() });
            added = true;
        }
        if (added) {
            this.messages.sort((a, b) => a.at - b.at);
            this.messages = this.messages.slice(-MAX);
            this.save();
            if (this.open) { this.renderList(); this.scrollBottom(); }
        }
    }

    scrollBottom() {
        const list = document.getElementById('chat-list');
        if (list) list.scrollTop = list.scrollHeight;
    }

    listHTML() {
        if (!this.messages.length) return '<p class="chat-empty">Belum ada obrolan. Sapa warga lain!</p>';
        return this.messages.map((m) => `
            <div class="chat-msg ${m.self ? 'me' : ''}">
                <span class="chat-name">${esc(m.name)}</span>
                <span class="chat-text">${esc(m.message)}</span>
            </div>`).join('');
    }

    renderList() {
        const list = document.getElementById('chat-list');
        if (list) list.innerHTML = this.listHTML();
    }

    render() {
        const reg = this.o.playerState.state.isRegistered;
        this.el.innerHTML = `
            <button class="chat-fab" data-chat="toggle" title="Obrolan Warga Kota" aria-label="Obrolan Warga">💬<span class="chat-fab-label">Obrolan</span></button>
            <div class="chat-box ${this.open ? 'open' : ''}" role="dialog" aria-label="Obrolan Warga Kota">
                <div class="chat-head">
                    <b>💬 Obrolan Warga Kota</b>
                    <button class="chat-x" data-chat="close" aria-label="Tutup">✕</button>
                </div>
                <div class="chat-list" id="chat-list">${this.listHTML()}</div>
                ${reg ? `
                <div class="chat-input-row">
                    <input id="chat-input" class="chat-input" type="text" maxlength="200" placeholder="Tulis pesan…" />
                    <button class="chat-send" data-chat="send">Kirim</button>
                </div>` : `
                <div class="chat-input-row">
                    <button class="chat-send full" data-chat="register">📸 Daftar dulu untuk ikut mengobrol</button>
                </div>`}
            </div>`;
    }
}
