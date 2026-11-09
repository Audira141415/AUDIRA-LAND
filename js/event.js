/* AUDIRA LAND · halaman Lomba & Event: lomba berlangsung (hitung mundur + papan 20 besar),
   akan datang (hitung mundur ke mulai), selesai (para juara). Data dari GET /api/lomba, diambil ulang tiap 30 dtk. */
(function (AL) {
  'use strict';
  const esc = AL.esc;
  const $ = id => document.getElementById(id);
  let me = '';
  try { me = localStorage.getItem('audira-taman-user') || ''; } catch (e) { /* abaikan */ }
  let data = null, offset = 0, loadT = 0;
  const MEDAL = ['🥇', '🥈', '🥉'];
  const fmt = n => Math.floor(n).toLocaleString('id-ID');
  const tgl = t => new Date(t).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pad = n => String(n).padStart(2, '0');
  function cd(ms) {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return (d ? d + ' hari ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s % 60);
  }
  const now = () => Date.now() + offset;

  function head(l, extra) {
    return `<div class="ev-head">
      <span class="ev-kind">${esc(l.kindLabel)}</span>${extra || ''}
    </div>
    <h3>${esc(l.title)}</h3>
    ${l.descr ? `<p class="ev-desc">${esc(l.descr)}</p>` : ''}
    ${l.prize ? `<p class="ev-prize"><span aria-hidden="true">🎁</span> ${esc(l.prize)}</p>` : ''}`;
  }
  function papanHtml(l, n) {
    const list = (l.papan || []).slice(0, n);
    if (!list.length) return '<p class="ev-empty">Belum ada skor. Jadilah yang pertama!</p>';
    return `<ol class="ev-rank">${list.map(r => `<li class="${r.u === me ? 'me' : ''}${r.rank <= 3 ? ' top' : ''}">
      <span class="ev-pos">${r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}</span>
      <span class="ev-u">@${esc(r.u)}${r.u === me ? ' <em>kamu</em>' : ''}</span>
      <span class="ev-sc">${fmt(r.score)} <small>${esc(l.unit || '')}</small></span></li>`).join('')}</ol>`;
  }

  function jalanHtml(l) {
    const kerja = !!l.game;
    const mine = kerja && me && (l.papan || []).find(r => r.u === me);
    return `<article class="ev-card live">
      ${head(l, '<span class="ev-tag live">Berlangsung</span>')}
      <div class="ev-cd"><small>Berakhir dalam</small><b data-cd="${l.end_at}">${cd(l.end_at - now())}</b><small>${esc(tgl(l.end_at))}</small></div>
      ${kerja ? `
        <div class="ev-board-head"><h4>Papan 20 besar</h4><small>${fmt(l.peserta || 0)} peserta · skor terbaik selama lomba</small></div>
        ${papanHtml(l, 20)}
        ${me && !mine && (l.peserta || 0) >= 20 ? '<p class="ev-note">Kamu belum masuk 20 besar. Ayo kejar!</p>' : ''}
        <a class="btn ev-go" href="/kerja.html">Ikut main sekarang</a>`
        : '<p class="ev-note">Lomba bebas: ikuti petunjuk di atas. Pemenang dipilih admin setelah lomba selesai.</p>'}
    </article>`;
  }
  function akanHtml(l) {
    return `<article class="ev-card">
      ${head(l, '<span class="ev-tag soon">Segera</span>')}
      <div class="ev-cd soon"><small>Mulai dalam</small><b data-cd="${l.start_at}">${cd(l.start_at - now())}</b><small>${esc(tgl(l.start_at))} – ${esc(tgl(l.end_at))}</small></div>
    </article>`;
  }
  function selesaiHtml(l) {
    const w = l.winners || [];
    const body = w.length
      ? `<ol class="ev-win">${w.map(x => `<li class="${x.u === me ? 'me' : ''}"><span class="ev-pos">${x.rank <= 3 ? MEDAL[x.rank - 1] : x.rank}</span>
          <span class="ev-u">@${esc(x.u)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</span>
          <span class="ev-sc">${x.score != null ? fmt(x.score) + ' <small>' + esc(l.unit || '') + '</small>' : ''}${x.koin ? `<small class="ev-koin">+${fmt(x.koin)} koin</small>` : ''}</span></li>`).join('')}</ol>`
      : `<p class="ev-note">Menunggu pengumuman pemenang dari admin.</p>${l.game ? papanHtml(l, 3) : ''}`;
    return `<article class="ev-card done">
      ${head(l, `<span class="ev-tag done">Selesai ${esc(new Date(l.end_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }))}</span>`)}
      ${body}
    </article>`;
  }

  function render() {
    $('jalan').innerHTML = data.jalan.length ? data.jalan.map(jalanHtml).join('') : '<p class="ev-empty">Belum ada lomba yang berjalan. Cek jadwal di bawah, atau main di menu Kerja sambil menunggu.</p>';
    $('akan').innerHTML = data.akan.length ? data.akan.map(akanHtml).join('') : '<p class="ev-empty">Belum ada jadwal lomba baru. Pantau Koran kota.</p>';
    $('selesai').innerHTML = data.selesai.length ? data.selesai.map(selesaiHtml).join('') : '<p class="ev-empty">Belum ada lomba yang selesai.</p>';
  }
  async function load() {
    clearTimeout(loadT);
    try {
      const r = await fetch('/api/lomba', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal memuat lomba');
      data = j; offset = j.now - Date.now();
      render();
      $('foot').textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '. Papan diperbarui otomatis.';
    } catch (e) {
      if (!data) $('jalan').innerHTML = `<p class="ev-empty">${esc(e.message)}. Coba muat ulang halaman.</p>`;
      $('foot').textContent = 'Gagal memperbarui, mencoba lagi…';
    }
    if (!document.hidden) loadT = setTimeout(load, 30000);
  }
  // hitung mundur: saat ada yang habis (mulai/selesai), ambil data baru
  setInterval(() => {
    let lewat = false;
    document.querySelectorAll('[data-cd]').forEach(b => {
      const ms = +b.dataset.cd - now();
      b.textContent = cd(ms);
      if (ms <= 0 && ms > -1500) lewat = true;
    });
    if (lewat) setTimeout(load, 1500);
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); else clearTimeout(loadT); });
  load();
})(window.AL);
