/* AUDIRA LAND · Koran: kabar kota & kalender acara dari /api/kabar. Titik merah = ada kabar baru. */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  const SEEN = 'audira-kabar-terakhir', KU_SEEN = 'audira-untukmu-terakhir', TK = 'audira-taman-token';
  let data = null, ku = null;
  const token = () => { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };
  const kuSeen = () => { try { return +(localStorage.getItem(KU_SEEN) || 0); } catch (e) { return 0; } };
  const kuTop = () => (ku && ku.items.length ? ku.items[0].t : 0);
  const kuBaru = () => kuTop() > kuSeen();
  function dots() {
    const top = data ? data.posts.reduce((m, p) => Math.max(m, p.id), 0) : 0;
    $('kuDot').hidden = !kuBaru();
    $('koranDot').hidden = $('koranSheet').open || !(top > seenId() || kuBaru());
  }

  const seenId = () => { try { return +(localStorage.getItem(SEEN) || 0); } catch (e) { return 0; } };
  const markSeen = () => {
    const top = data && data.posts.reduce((m, p) => Math.max(m, p.id), 0);
    if (top) { try { localStorage.setItem(SEEN, String(top)); } catch (e) { /* abaikan */ } }
    dots();
  };
  const markKuSeen = () => { const t = kuTop(); if (t) { try { localStorage.setItem(KU_SEEN, String(t)); } catch (e) { /* abaikan */ } } dots(); };
  const lalu = ms => {
    const d = Date.now() - ms, m = Math.floor(d / 60e3), h = Math.floor(m / 60), hr = Math.floor(h / 24);
    return m < 1 ? 'baru saja' : m < 60 ? m + ' menit lalu' : h < 24 ? h + ' jam lalu' : hr === 1 ? 'kemarin' : hr + ' hari lalu';
  };
  function renderKu() {
    if (!token()) { $('paneKu').innerHTML = '<p class="empty">Masuk sebagai warga (kode KTW) lewat tombol dompet supaya kabar tentang dirimu muncul di sini: naik jabatan, tetangga baru, kiriman koin, dan posisimu di papan peringkat.</p>'; return; }
    if (!ku) { $('paneKu').innerHTML = '<p class="empty">Memuat kabarmu…</p>'; return; }
    const seen = kuSeen();
    $('paneKu').innerHTML = ku.items.length ? '<ul class="ku-list">' + ku.items.map(k => `
      <li class="${k.t > seen ? 'new' : ''}"><span class="ku-ic" aria-hidden="true">${esc(k.icon)}</span>
        <div><p>${esc(k.text)}</p><small>${lalu(k.t)}${k.link ? ` · <a href="${esc(k.link)}">Lihat</a>` : ''}${k.cari ? ` · <button type="button" class="link" data-cari="${esc(k.cari)}">Cari di peta</button>` : ''}</small></div></li>`).join('') + '</ul>'
      : '<p class="empty">Belum ada kabar untukmu dalam 14 hari terakhir. Main di Kerja atau mampir ke Taman!</p>';
  }
  async function loadKu() {
    const t = token();
    if (!t || (AL.net && AL.net.demo)) { ku = null; dots(); return; }
    try {
      const r = await fetch('/api/kabarku', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (r.status === 401) { ku = null; dots(); return; }
      if (!r.ok) throw new Error(r.status);
      ku = await r.json();
      dots();
      if ($('koranSheet').open && !$('paneKu').hidden) { renderKu(); markKuSeen(); }
    } catch (e) { /* tetap pakai data lama */ }
  }
  const tgl = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  const waktu = ms => new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const paras = s => s.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

  function render() {
    if (!data) {
      $('paneKabar').innerHTML = '<p class="empty">Kabar kota belum tersedia. Server belum tersambung.</p>';
      $('paneAcara').innerHTML = '';
      return;
    }
    const seen = seenId();
    $('paneKabar').innerHTML = data.posts.length ? data.posts.map(p => `
      <article class="post${p.pinned ? ' pinned' : ''}">
        <p class="meta">${p.pinned ? '<span class="tag pin">Disematkan</span>' : ''}<span class="tag ${p.kind}">${p.kind === 'pengumuman' ? 'Pengumuman' : 'Berita'}</span>${p.id > seen ? '<span class="tag new">Baru</span>' : ''}<time>${waktu(p.created_at)}</time></p>
        <h3>${esc(p.title)}</h3>
        ${p.body ? paras(p.body) : ''}
        ${p.link ? `<a class="more" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">Buka tautan</a>` : ''}
      </article>`).join('') : '<p class="empty">Belum ada kabar. Cek lagi nanti.</p>';

    $('paneAcara').innerHTML = data.events.length ? '<ol class="agenda">' + data.events.map(e => `
      <li class="${e.date === data.today ? 'today' : ''}">
        <div class="day"><b>${+e.date.slice(8)}</b><span>${new Date(e.date + 'T00:00:00').toLocaleDateString('id-ID', { month: 'short' })}</span></div>
        <div><p class="when">${e.date === data.today ? 'Hari ini' : tgl(e.date)}${e.time ? ' · ' + e.time + ' WIB' : ''}</p>
        <h3>${esc(e.title)}</h3>
        ${e.place ? `<p class="place">${esc(e.place)}</p>` : ''}
        ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}</div>
      </li>`).join('') + '</ol>' : '<p class="empty">Belum ada acara terjadwal.</p>';
  }

  async function load() {
    if (AL.net && AL.net.demo) return;
    try {
      // ember 30 detik: cache CDN/peramban boleh, tapi kabar baru muncul paling lambat 30 detik
      const r = await fetch('/api/kabar?b=' + Math.floor(Date.now() / 30000), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      dots();
      if ($('koranSheet').open) render();
    } catch (e) { /* tetap pakai data lama */ }
  }

  function tab(which) {
    $('tabKabar').setAttribute('aria-selected', which === 'kabar');
    $('tabAcara').setAttribute('aria-selected', which === 'acara');
    $('tabKu').setAttribute('aria-selected', which === 'ku');
    $('paneKabar').hidden = which !== 'kabar';
    $('paneAcara').hidden = which !== 'acara';
    $('paneKu').hidden = which !== 'ku';
    if (which === 'ku') { renderKu(); markKuSeen(); loadKu(); }
  }

  $('koranBtn').addEventListener('click', () => {
    render();
    // ada kabar pribadi baru dan kabar kota sudah terbaca: langsung buka Untukmu
    const top = data ? data.posts.reduce((m, p) => Math.max(m, p.id), 0) : 0;
    tab(kuBaru() && !(top > seenId()) ? 'ku' : 'kabar');
    $('koranSheet').showModal();
    markSeen();
  });
  $('koranClose').addEventListener('click', () => $('koranSheet').close());
  $('koranSheet').addEventListener('click', e => { if (e.target === $('koranSheet')) $('koranSheet').close(); });
  $('tabKabar').addEventListener('click', () => tab('kabar'));
  $('tabAcara').addEventListener('click', () => tab('acara'));
  $('tabKu').addEventListener('click', () => tab('ku'));
  $('paneKu').addEventListener('click', e => {
    const b = e.target.closest('[data-cari]');
    if (!b) return;
    $('koranSheet').close();
    $('q').value = b.dataset.cari;
    $('search').requestSubmit();
  });

  AL.koran = { load, loadKu };
  setTimeout(() => { load(); loadKu(); }, 1500);
  setInterval(load, 60000);
  setInterval(loadKu, 120000);
})(window.AL);
