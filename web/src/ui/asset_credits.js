/**
 * AUDIRA-LAND: Kredit Aset 3D (dipakai tab "Kredit Aset" di Dashboard Super Admin).
 * Atribusi model Polyfork dibaca dari web/public/models/polyfork/manifest.json (ditulis oleh
 * tools/polyfork_import.py), jadi kit baru otomatis ikut tanpa mengubah file ini.
 */

const MANIFEST_URL = 'public/models/polyfork/manifest.json';
let cache = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Hanya tautan https ke polyfork.dev yang dirender sebagai link
const safeUrl = u => (/^https:\/\/polyfork\.dev\//.test(u) ? u : null);
const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

export async function loadPolyforkModels() {
    if (!cache) {
        const r = await fetch(MANIFEST_URL);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const man = await r.json();
        cache = Object.values(man.models || {}).sort((a, b) => a.title.localeCompare(b.title, 'id'));
    }
    return cache;
}

export function creditsHTML(models, error = null) {
    const byKit = new Map();
    for (const m of models) {
        if (!byKit.has(m.kit)) byKit.set(m.kit, []);
        byKit.get(m.kit).push(m);
    }
    const lists = [...byKit].map(([kit, items]) => `
        <div class="credits-count">${esc(kit)} · ${items.length} model</div>
        <ul class="credits-list">${items.map(m => {
            const url = safeUrl(m.page);
            return `<li>${url ? ext(esc(url), esc(m.title)) : esc(m.title)} <span class="credits-by">oleh Polyfork · ${m.triangles} segitiga</span></li>`;
        }).join('')}</ul>`).join('');

    return `
        <h3 class="form-box-title">🧩 Kredit Aset 3D Pihak Ketiga</h3>
        <p class="credits-note">
            Model kebun dan peternakan desa berasal dari ${ext('https://polyfork.dev', 'Polyfork')},
            dipakai di bawah lisensi ${ext('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0')}.
            Semua model <b>telah diubah</b>: mesh digabung, didudukkan di permukaan tanah, dan warnanya
            disesuaikan dengan kota. Polyfork tidak membuat atau mendukung AUDIRA-LAND.
            Impor kit baru: <code>python tools/polyfork_import.py &lt;kit-id&gt;</code>.
        </p>
        ${error
            ? `<p class="credits-note">Daftar model belum bisa dimuat (${esc(error)}).</p>`
            : models.length ? lists : '<p class="credits-note">Memuat daftar model…</p>'}
    `;
}
