/* AUDIRA LAND · Pesta rumah di peta kota: balon di atas rumah yang berpesta, daftar pesta, buka/tutup pestaku. */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  let parties = [], tema = {}, skew = 0;
  const auth = () => { try { return { user: localStorage.getItem('audira-taman-user') || '', token: localStorage.getItem('audira-taman-token') || '' }; } catch (e) { return { user: '', token: '' }; } };
  const lotOf = p => { const r = AL.byName.get(p.host); return r && r.home >= 0 ? AL.lots[r.home] : null; };
  const sisa = p => Math.max(0, Math.ceil((p.ends - (Date.now() + skew)) / 60000));

  async function load() {
    try {
      const d = await fetch('/api/pesta', { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then(r => r.json());
      parties = d.parties; tema = d.tema; skew = d.now - Date.now();
    } catch (e) { parties = []; }
    $('pestaCount').textContent = parties.length;
    $('pestaCount').hidden = !parties.length;
    if ($('pestaSheet').open) render();
  }

  // balon di atas rumah tuan rumah
  AL.drawParties = function (ctx, toScreen, z, t, vw, vh) {
    const cols = ['#d9967c', '#ffd166', '#5f9e98', '#cf7f9b'];
    parties.forEach((p, i) => {
      const lot = lotOf(p);
      if (!lot) return;
      const [sx, sy] = toScreen(lot.x + 1, lot.y + 1, (lot.hTop || 1.2) + 0.2);
      if (sx < -60 || sx > vw + 60 || sy < -100 || sy > vh + 60) return;
      const r = Math.max(5, 9 * z);
      for (let k = 0; k < 3; k++) {
        const bx = sx + (k - 1) * r * 1.3, by = sy - r * 3.2 - (k === 1 ? r * 0.9 : 0) + Math.sin(t * 1.6 + k + i) * r * 0.3;
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, by + r); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.fillStyle = cols[(k + i) % cols.length];
        ctx.beginPath(); ctx.ellipse(bx, by, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.beginPath(); ctx.ellipse(bx - r * 0.28, by - r * 0.35, r * 0.18, r * 0.28, -0.4, 0, Math.PI * 2); ctx.fill();
      }
    });
  };

  // kotak pesta di kartu rumah
  AL.partyBox = function (lot) {
    const p = parties.find(x => lotOf(x) === lot);
    if (!p) return '';
    return `<div class="party-box"><p class="kicker">Sedang berpesta</p>
      <p class="brand">@${esc(p.host)} · ${esc(tema[p.theme] || p.theme)}</p>
      <p class="tag-line">${p.guests} tamu · sisa ${sisa(p)} menit</p>
      <a class="btn" href="/pesta.html?h=${encodeURIComponent(p.host)}">Datang ke pesta</a></div>`;
  };

  function render() {
    const { user, token } = auth();
    const mine = parties.find(p => p.host === user);
    $('pestaList').innerHTML = parties.length ? parties.map(p => `
      <li><div><b>@${esc(p.host)}</b><small>${esc(tema[p.theme] || p.theme)} · ${p.guests} tamu · sisa ${sisa(p)} menit</small></div>
      <span class="acts">${lotOf(p) ? `<button type="button" class="btn ghost sm" data-fly="${esc(p.host)}">Lihat rumah</button>` : ''}
      <a class="btn sm" href="/pesta.html?h=${encodeURIComponent(p.host)}">Datang</a></span></li>`).join('')
      : '<li class="empty">Belum ada pesta. Jadilah yang pertama!</li>';
    let html;
    if (!token) html = '<p class="hint">Mau bikin pesta di rumahmu? Masuk dulu sebagai warga di <a href="/taman.html">Taman</a> pakai kode KTW dari admin.</p>';
    else if (mine) html = `<p class="hint">Pestamu sedang berlangsung, sisa ${sisa(mine)} menit.</p><div class="acts"><a class="btn" href="/pesta.html?h=${encodeURIComponent(user)}">Masuk pestaku</a><button type="button" class="btn ghost" id="pestaTutup">Tutup pestaku</button></div>`;
    else html = `<p class="hint">Buka pesta 60 menit di rumahmu, @${esc(user)}. Semua orang bisa datang; warga KTW bisa ngobrol.</p>
      <div class="tema-pick" role="radiogroup" aria-label="Tema pesta">${Object.entries(tema).map(([k, v], i) => `<label><input type="radio" name="tema" value="${k}" ${i === 0 ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>
      <button type="button" class="btn" id="pestaBuka">Buka pesta di rumahku</button>`;
    $('pestaMine').innerHTML = html;
    $('pestaMsg').hidden = true;
    $('pestaBuka')?.addEventListener('click', () => act('/api/pesta/buka', { token, theme: document.querySelector('input[name=tema]:checked').value }, r => { location.href = '/pesta.html?h=' + encodeURIComponent(r.host); }));
    $('pestaTutup')?.addEventListener('click', () => { if (confirm('Tutup pestamu sekarang? Semua tamu dipulangkan.')) act('/api/pesta/tutup', { token }, () => load()); });
  }
  async function act(url, body, done) {
    const msg = $('pestaMsg');
    msg.hidden = false; msg.className = 'msg'; msg.textContent = 'Memproses…';
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
      msg.hidden = true; done(j);
    } catch (e) { msg.textContent = e.message; msg.classList.add('err'); }
  }

  AL.pestaInit = function () {
    $('pestaPill').hidden = false;
    $('pestaPill').addEventListener('click', () => { render(); $('pestaSheet').showModal(); load(); });
    $('pestaClose').addEventListener('click', () => $('pestaSheet').close());
    $('pestaList').addEventListener('click', e => {
      const b = e.target.closest('[data-fly]');
      if (!b) return;
      const lot = lotOf(parties.find(p => p.host === b.dataset.fly));
      $('pestaSheet').close();
      if (lot) { AL.focus = { lot: lot.i }; AL.flyTo(lot.x + 1, lot.y + 1, 0, 1.8); }
    });
    load();
    setInterval(load, 30000);
  };
})(window.AL);
