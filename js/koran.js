/* AUDIRA LAND · Koran: kabar kota & kalender acara dari /api/kabar. Titik merah = ada kabar baru. */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  const SEEN = 'audira-kabar-terakhir';
  let data = null;

  const seenId = () => { try { return +(localStorage.getItem(SEEN) || 0); } catch (e) { return 0; } };
  const markSeen = () => {
    const top = data && data.posts.reduce((m, p) => Math.max(m, p.id), 0);
    if (top) { try { localStorage.setItem(SEEN, String(top)); } catch (e) { /* abaikan */ } }
    $('koranDot').hidden = true;
  };
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
      const top = data.posts.reduce((m, p) => Math.max(m, p.id), 0);
      $('koranDot').hidden = !(top > seenId()) || $('koranSheet').open;
      if ($('koranSheet').open) render();
    } catch (e) { /* tetap pakai data lama */ }
  }

  function tab(which) {
    const kabar = which === 'kabar';
    $('tabKabar').setAttribute('aria-selected', kabar);
    $('tabAcara').setAttribute('aria-selected', !kabar);
    $('paneKabar').hidden = !kabar;
    $('paneAcara').hidden = kabar;
  }

  $('koranBtn').addEventListener('click', () => {
    render();
    tab('kabar');
    $('koranSheet').showModal();
    markSeen();
  });
  $('koranClose').addEventListener('click', () => $('koranSheet').close());
  $('koranSheet').addEventListener('click', e => { if (e.target === $('koranSheet')) $('koranSheet').close(); });
  $('tabKabar').addEventListener('click', () => tab('kabar'));
  $('tabAcara').addEventListener('click', () => tab('acara'));

  AL.koran = { load };
  setTimeout(load, 1500);
  setInterval(load, 60000);
})(window.AL);
