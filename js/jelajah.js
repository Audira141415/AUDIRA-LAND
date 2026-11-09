/* AUDIRA LAND · tombol Jelajah di peta: daftar halaman kota (Lomba, Balai, Rumahku, Pantai, Taman, Kerja). */
(function () {
  'use strict';
  const pill = document.getElementById('jelajahPill'), dlg = document.getElementById('jelajahSheet');
  if (!pill || !dlg) return;
  pill.addEventListener('click', () => dlg.showModal());
  document.getElementById('jelajahClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
