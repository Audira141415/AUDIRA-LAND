/* Pesta rumah: judul, tema, hitung mundur, tombol tutup untuk tuan rumah, layar "pesta selesai". */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const ROOM = window.ROOM;
  let user = '', token = '';
  try { user = localStorage.getItem('audira-taman-user') || ''; token = localStorage.getItem('audira-taman-token') || ''; } catch (e) { /* abaikan */ }

  function ended(msg) {
    $('ended').hidden = false;
    $('endedMsg').textContent = msg || 'Pesta ini sudah selesai atau tidak ada.';
  }
  ROOM.ready.then(() => {
    const p = ROOM.party;
    $('ptHost').textContent = '@' + (ROOM.host || '…');
    if (!p) return ended();
    $('ptTheme').textContent = (ROOM.tema[p.theme] || p.theme);
    document.title = `Pesta @${p.host} · AUDIRA LAND`;
    const tick = () => {
      const left = Math.max(0, p.ends - (Date.now() + ROOM.skew));
      const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      $('ptLeft').textContent = `sisa ${m}:${String(s).padStart(2, '0')}`;
    };
    tick(); setInterval(tick, 1000);
    if (token && user === p.host) {
      $('ptClose').hidden = false;
      $('ptClose').addEventListener('click', async () => {
        if (!confirm('Tutup pestamu sekarang? Semua tamu akan dipulangkan.')) return;
        const r = await fetch('/api/pesta/tutup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Gagal menutup pesta'); }
      });
    }
  });
  // pesan fatal dari server (pesta selesai / ditutup) → tampilkan layar selesai
  const obs = new MutationObserver(() => {
    const c = $('conn').textContent, t = $('toast').textContent;
    if (/selesai|menutup pesta|ditutup admin|tidak ada/i.test(t) && !$('toast').hidden) ended(t);
    else if (/Muat ulang/.test(c) && /selesai|tidak ada/i.test(t)) ended(t);
  });
  obs.observe($('toast'), { childList: true, characterData: true, subtree: true, attributes: true });
})(window.AL);
