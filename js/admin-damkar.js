/* AUDIRA LAND · admin: kebakaran kota (picu sekarang, padamkan paksa, riwayat). */
(function () {
  'use strict';
  (window.ADMIN_MODS = window.ADMIN_MODS || []).push(function (A) {
    const sec = document.createElement('section');
    sec.className = 'panel';
    sec.innerHTML = `
      <div class="row"><h2>Kebakaran kota</h2>
        <div class="row">
          <button class="btn ghost" type="button" data-act="muat">Muat ulang</button>
          <button class="btn danger" type="button" data-act="batal" hidden>Batalkan api</button>
          <button class="btn" type="button" data-act="picu">Picu kebakaran sekarang</button>
        </div>
      </div>
      <p class="hint" data-el="info"></p>
      <label class="hint">Kavling (opsional, nomor indeks; kosong = acak dari bangunan yang berdiri)
        <input type="number" min="0" step="1" data-el="lot" placeholder="acak"></label>
      <ul class="list" data-el="list"></ul>`;
    A.root().appendChild(sec);
    const $ = s => sec.querySelector(s);
    const STATUS = { aktif: '🔥 menyala', padam: '🚒 padam', hangus: '💨 hangus', batal: '✖ dibatalkan' };

    async function muat() {
      try {
        const d = await A.call('damkar');
        const j = d.jadwal;
        $('[data-el="info"]').textContent = (j.everyMin ? `Jadwal: tiap ${j.everyMin} menit, ${j.jam}` + (j.next ? ` · berikutnya ±${A.fmt(j.next)}` : '') : 'Jadwal otomatis mati (DAMKAR_EVERY_MIN=0)')
          + ` · ${d.kandidat} bangunan bisa terbakar` + (d.aktif ? ` · SEDANG MENYALA: ${d.aktif.name} (${d.aktif.total}/${d.aktif.target})` : '');
        $('[data-act="batal"]').hidden = !d.aktif;
        $('[data-act="picu"]').disabled = !!d.aktif;
        $('[data-el="list"]').innerHTML = d.riwayat.length ? d.riwayat.map(r => `<li><b>${A.esc(r.name)}</b> <span>${STATUS[r.status] || A.esc(r.status)}</span>
          <small>${A.fmt(r.started_at)} · ${r.source === 'admin' ? 'admin' : 'jadwal'} · kavling ${r.lot} · siraman ${r.total}/${r.target || '–'} · ${r.helpers} penolong</small></li>`).join('')
          : '<li class="empty">Belum pernah ada kebakaran.</li>';
      } catch (e) { A.toast(e.message, true); }
    }
    $('[data-act="muat"]').addEventListener('click', muat);
    $('[data-act="picu"]').addEventListener('click', async () => {
      const v = $('[data-el="lot"]').value.trim();
      try {
        const r = await A.call('damkar/picu', v === '' ? {} : { lot: Math.floor(+v) });
        A.toast(`Api menyala di ${r.name} (kavling ${r.lot}).`);
      } catch (e) { A.toast(e.message, true); }
      muat();
    });
    $('[data-act="batal"]').addEventListener('click', async () => {
      if (!confirm('Batalkan kebakaran yang sedang berlangsung? Tidak ada hadiah dan tidak ada bekas gosong.')) return;
      try { await A.call('damkar/batal', {}); A.toast('Kebakaran dibatalkan.'); } catch (e) { A.toast(e.message, true); }
      muat();
    });
    muat();
    setInterval(() => { if (!document.hidden) muat(); }, 15000);
  });
})();
