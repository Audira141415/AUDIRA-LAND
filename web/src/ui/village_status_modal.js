/**
 * AUDIRA-LAND: Modal Status Desa (HAVE vs HAVE-NOT)
 * Semua angka dihitung langsung dari dunia yang sedang dimuat (tidak ada angka tertulis tangan):
 * 1. HAVE (Sudah Ada): bangunan berstatus jadi/selesai di peta, dikelompokkan per jenis.
 * 2. HAVE-NOT (Belum Ada): bangunan berstatus proyek/bangun/sketsa + kavling kosong.
 *
 * callbacks: { getBuildings(), countEmptyLots(), getBuildingMeta(type), onNavigateEmptyLot() }
 */

import { playerState } from '../core/player_state.js';

const UNFINISHED = new Set(['proyek', 'bangun', 'sketsa']);
const STAGE_LABEL = { proyek: 'Sedang Dibangun', bangun: 'Sedang Dibangun', sketsa: 'Sketsa Cetak Biru' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class VillageStatusModal {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.activeTab = 'have'; // 'have' | 'havenot'
        this.modalEl = null;
        this.init();
    }

    init() {
        let modal = document.getElementById('village-status-modal-overlay');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'village-status-modal-overlay';
            modal.className = 'modal-backdrop';
            document.body.appendChild(modal);
        }
        this.modalEl = modal;
    }

    // Nama jenis dari katalog bangunan; judul data mentah ("Rs", "Pln") hanya dipakai bila katalog tidak kenal
    typeTitle(type, fallback) {
        const meta = this.callbacks.getBuildingMeta ? this.callbacks.getBuildingMeta(type) : null;
        const t = meta && meta.title;
        return (t && t !== 'Bangunan Warga') ? t : (fallback || type || 'Bangunan');
    }

    titleOf(b) {
        const generic = !b.title || b.title.toLowerCase() === String(b.type || '').toLowerCase();
        return generic ? this.typeTitle(b.type, b.title) : b.title;
    }

    // Nama per unit hanya ditampilkan bila berbeda dari nama jenisnya
    namesOf(g) {
        const head = this.typeTitle(g.type, g.items[0].title);
        const names = [...new Set(g.items.map(b => this.titleOf(b)))].filter(n => n !== head);
        return names.length ? names.map(esc).join(', ') : '';
    }

    iconOf(type) {
        const meta = this.callbacks.getBuildingMeta ? this.callbacks.getBuildingMeta(type) : null;
        return (meta && meta.icon) || '🏠';
    }

    getStats() {
        const buildings = this.callbacks.getBuildings ? this.callbacks.getBuildings() : [];
        const done = buildings.filter(b => !UNFINISHED.has(b.stage));
        const unfinished = buildings.filter(b => UNFINISHED.has(b.stage));
        const construction = unfinished.filter(b => b.stage !== 'sketsa');
        const sketches = unfinished.filter(b => b.stage === 'sketsa');
        const emptyLots = this.callbacks.countEmptyLots ? this.callbacks.countEmptyLots() : 0;

        // Bangunan jadi dikelompokkan per jenis, terbanyak dulu
        const groups = new Map();
        for (const b of done) {
            const key = b.type || 'lainnya';
            if (!groups.has(key)) groups.set(key, { type: key, icon: this.iconOf(key), items: [] });
            groups.get(key).items.push(b);
        }
        const haveGroups = [...groups.values()].sort((a, b) => b.items.length - a.items.length);

        const citizenHomes = done.filter(b => b.owner_kind !== 'negara' && !b.is_public).length;
        const publicCount = done.length - citizenHomes;
        const total = buildings.length;
        const completionRate = total ? Math.round((done.length / total) * 100) : 0;

        return { done, unfinished, construction, sketches, emptyLots, haveGroups, citizenHomes, publicCount, total, completionRate };
    }

    render() {
        const s = this.getStats();
        const treasury = Number.isFinite(playerState.cityTreasury) ? playerState.cityTreasury : null;

        this.modalEl.innerHTML = `
            <div class="modal-card modal-large" style="max-width: 650px;">
                <div class="modal-header">
                    <div class="modal-title-wrap">
                        <span class="modal-icon">📊</span>
                        <div>
                            <h2 class="modal-title">Buku Status Desa: HAVE vs HAVE-NOT</h2>
                            <p class="modal-subtitle">Dihitung langsung dari bangunan yang ada di peta AUDIRA-LAND</p>
                        </div>
                    </div>
                    <button class="modal-close" id="btn-status-close">✕</button>
                </div>

                <div class="modal-body">
                    <div class="status-comparison-bar" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 6px;">
                        <div class="stat-card-have" style="background: #E8F5E9; border: 2px solid #2E7D32; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 11px; font-weight: 800; color: #2E7D32; text-transform: uppercase;">✅ DESA HAVE (SUDAH ADA)</div>
                            <div style="font-size: 22px; font-weight: 900; color: #1B5E20; margin: 4px 0;">${s.done.length} Unit</div>
                            <div style="font-size: 11px; color: #388E3C;">${s.publicCount} Fasilitas Kota + ${s.citizenHomes} Bangunan Warga</div>
                        </div>

                        <div class="stat-card-havenot" style="background: #FFF3E0; border: 2px solid #E65100; border-radius: 8px; padding: 10px;">
                            <div style="font-size: 11px; font-weight: 800; color: #E65100; text-transform: uppercase;">🚧 DESA HAVE-NOT (BELUM JADI)</div>
                            <div style="font-size: 22px; font-weight: 900; color: #BF360C; margin: 4px 0;">${s.unfinished.length} Unit</div>
                            <div style="font-size: 11px; color: #F57C00;">${s.construction.length} Proyek + ${s.sketches.length} Sketsa · ${s.emptyLots.toLocaleString('id-ID')} Kavling Kosong</div>
                        </div>
                    </div>

                    <div class="progress-box" style="background: #FFF9EC; border: 2px solid #2E2117; border-radius: 8px; padding: 10px;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-bottom: 6px;">
                            <span>Bangunan Selesai:</span>
                            <span style="color: #2E7D32;">${s.completionRate}% (${s.done.length} dari ${s.total})</span>
                        </div>
                        <div style="background: #E0D7C6; height: 14px; border-radius: 999px; overflow: hidden; border: 1.5px solid #2E2117;">
                            <div style="background: linear-gradient(90deg, #7FA062, #E9A91E); width: ${s.completionRate}%; height: 100%;"></div>
                        </div>
                    </div>

                    <div class="category-tabs" style="margin-top: 4px;">
                        <button class="cat-tab ${this.activeTab === 'have' ? 'active' : ''}" data-tab="have">
                            ✅ Yang Sudah Ada (${s.done.length})
                        </button>
                        <button class="cat-tab ${this.activeTab === 'havenot' ? 'active' : ''}" data-tab="havenot">
                            🚧 Yang Belum Jadi (${s.unfinished.length})
                        </button>
                    </div>

                    ${this.activeTab === 'have' ? this.renderHave(s) : this.renderHaveNot(s)}
                </div>

                <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 11px; color: #554A3E;">
                        Kas Kota: <b>${treasury === null ? '—' : treasury.toLocaleString('id-ID') + ' ₳'}</b>
                    </div>
                    <button class="btn-primary" id="btn-status-done" style="padding: 8px 16px;">
                        Tutup Buku Desa
                    </button>
                </div>
            </div>
        `;
    }

    renderHave(s) {
        if (!s.haveGroups.length) {
            return `<div class="tab-pane-content" style="font-size: 12px; color: #554A3E; padding: 10px;">Belum ada bangunan jadi di peta.</div>`;
        }
        return `
            <div class="tab-pane-content">
                <div style="font-size: 12px; font-weight: bold; color: #5B3A24; margin-bottom: 8px;">
                    🏛️ ${s.done.length} bangunan berdiri, ${s.haveGroups.length} jenis:
                </div>
                <div class="catalog-grid-scroll" style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                    ${s.haveGroups.map(g => `
                        <div class="item-have-card" style="background: #FFF; border: 1.5px solid #2E2117; border-radius: 8px; padding: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                <div>
                                    <span style="font-size: 18px;">${g.icon}</span>
                                    <b>${esc(this.typeTitle(g.type, g.items[0].title))}</b>
                                </div>
                                <span class="meta-tag cost" style="background: #E8F5E9; color: #2E7D32;">${g.items.length} Unit</span>
                            </div>
                            ${this.namesOf(g) ? `<p style="font-size: 11px; color: #554A3E; margin-top: 4px;">${this.namesOf(g)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderHaveNot(s) {
        return `
            <div class="tab-pane-content">
                <div class="catalog-grid-scroll" style="max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
                    ${s.unfinished.map(b => {
                        const sketch = b.stage === 'sketsa';
                        const pct = Math.round(Math.max(0, Math.min(1, Number(b.progress) || 0)) * 100);
                        return `
                        <div class="item-havenot-card" style="background: #FFF; border: 1.5px solid ${sketch ? '#3B82F6' : '#E65100'}; border-radius: 8px; padding: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                <div>
                                    <span style="font-size: 18px;">${sketch ? '📐' : '🏗️'}</span>
                                    <b>${esc(this.titleOf(b))}</b>
                                </div>
                                <span class="meta-tag cost" style="background: ${sketch ? '#DBEAFE' : '#FFE0B2'}; color: ${sketch ? '#1D4ED8' : '#E65100'};">${STAGE_LABEL[b.stage]}${sketch ? '' : ` · ${pct}%`}</span>
                            </div>
                            ${b.desc ? `<p style="font-size: 11px; color: #6D4C41; margin-top: 4px;">${esc(b.desc)}</p>` : ''}
                        </div>`;
                    }).join('')}

                    <div class="item-havenot-card" style="background: #FFF; border: 1.5px solid #2E7D32; border-radius: 8px; padding: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                            <div>
                                <span style="font-size: 18px;">📍</span>
                                <b>Kavling Kosong</b>
                            </div>
                            <span class="meta-tag cost" style="background: #E8F5E9; color: #2E7D32;">${s.emptyLots.toLocaleString('id-ID')} Kavling</span>
                        </div>
                        <p style="font-size: 11px; color: #1B5E20; margin-top: 4px;">Kavling belum terpakai. Klik kavling kosong untuk mendaftar dan membangun rumah.</p>
                        ${s.emptyLots ? `<button class="btn-action primary" id="btn-quick-claim-nav" style="margin-top: 6px; padding: 6px 12px; font-size: 11px;">🏗️ Pergi ke Kavling Kosong</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents() {
        document.getElementById('btn-status-close')?.addEventListener('click', () => this.hide());
        document.getElementById('btn-status-done')?.addEventListener('click', () => this.hide());

        this.modalEl.querySelectorAll('.cat-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.activeTab = tab.getAttribute('data-tab');
                this.render();
                this.bindEvents();
            });
        });

        document.getElementById('btn-quick-claim-nav')?.addEventListener('click', () => {
            this.hide();
            if (this.callbacks.onNavigateEmptyLot) this.callbacks.onNavigateEmptyLot();
        });
    }

    show() {
        this.render();
        this.bindEvents();
        this.modalEl.classList.add('active');
    }

    hide() {
        this.modalEl.classList.remove('active');
    }
}
