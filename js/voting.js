/* AUDIRA LAND · Voting warga di peta: tombol 🗳️ di kolom .tools (titik merah bila ada polling aktif
   yang belum kamu pilih) dan dialog berisi polling aktif + riwayat. Hasil terlihat setelah memilih
   atau setelah polling selesai. Pilihan boleh diganti sampai polling selesai. */
(function (AL) {
  'use strict';
  if (!AL) return;
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  const esc = AL.esc;
  const getTok = () => { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };
  let data = null, offset = 0, refreshT = 0, busy = false;
  const el = {};

  function sisa(ms) {
    if (ms <= 0) return 'selesai';
    const m = Math.floor(ms / 60e3), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return `${d} hari ${h % 24} jam lagi`;
    if (h >= 1) return `${h} jam ${m % 60} menit lagi`;
    return `${Math.max(1, m)} menit lagi`;
  }
  const tgl = t => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  async function load() {
    const tok = getTok();
    const r = await fetch('/api/voting', { cache: 'no-store', headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Gagal memuat voting');
    data = j; offset = j.now - Date.now();
    // titik merah: ada polling aktif yang belum kamu pilih
    el.dot.hidden = !j.aktif.some(p => p.mine === null);
    return j;
  }

  function mount() {
    const tools = document.querySelector('.tools');
    if (!tools || el.btn) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'voting-btn';
    btn.setAttribute('aria-label', 'Voting warga'); btn.title = 'Voting warga';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 13h16v7H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 13V4.5h8V13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m9.8 8.6 1.6 1.6 3-3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 16.5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="dot" hidden></span>';
    const koran = tools.querySelector('.koran-btn');
    tools.insertBefore(btn, koran ? koran.nextSibling : tools.firstChild);
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet kota-sheet voting-sheet';
    dlg.setAttribute('aria-labelledby', 'vtTitle');
    dlg.innerHTML = `<div class="kt-in">
      <button class="close" type="button" aria-label="Tutup">×</button>
      <p class="kicker">Suara warga</p>
      <h2 id="vtTitle">Voting kota</h2>
      <div class="kt-body"></div>
      <p class="msg" hidden aria-live="polite"></p>
      <button type="button" class="kt-corong" data-corong-open>
        <span aria-hidden="true">📣</span><span><b>Corong Kota</b><small>Siarkan pesanmu 30 detik ke semua yang online</small></span><span aria-hidden="true">›</span>
      </button>
    </div>`;
    document.body.appendChild(dlg);
    Object.assign(el, { btn, dlg, dot: btn.querySelector('.dot'), body: dlg.querySelector('.kt-body'), msg: dlg.querySelector('.msg') });
    btn.addEventListener('click', open);
    dlg.querySelector('.close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    // tombol Corong menutup dialog ini dulu supaya dua dialog tidak bertumpuk
    dlg.querySelector('.kt-corong').addEventListener('click', () => dlg.close());
    if (!AL.corong) dlg.querySelector('.kt-corong').hidden = true;
    el.body.addEventListener('click', onPick);
    load().catch(() => {});
    // cek ulang tiap 5 menit (polling baru / selesai)
    refreshT = setInterval(() => { if (!document.hidden && !dlg.open) load().catch(() => {}); }, 300e3);
  }
  function say(text, kind) {
    el.msg.hidden = !text; el.msg.textContent = text || '';
    el.msg.className = 'msg' + (kind ? ' ' + kind : '');
  }
  async function open() {
    say('');
    el.dlg.showModal();
    if (!data) el.body.innerHTML = '<p class="kt-empty">Memuat…</p>';
    else render();
    try { await load(); render(); } catch (e) { say(e.message, 'err'); }
  }

  function pollHtml(p) {
    const now = Date.now() + offset;
    const show = !!p.counts;
    const max = show ? Math.max(...p.counts) : 0;
    const canVote = !p.done;
    const rows = p.options.map((o, i) => {
      const mine = p.mine === i, top = show && p.done && p.total > 0 && p.counts[i] === max;
      const inner = show
        ? `<span class="vt-fill" data-w="${p.pct[i]}"></span><span class="vt-o">${mine ? '<i class="vt-mine" aria-label="pilihanmu">✓</i>' : ''}${esc(o)}</span><span class="vt-n">${p.pct[i].toLocaleString('id-ID')}% <small>${p.counts[i]}</small></span>`
        : `<span class="vt-o">${esc(o)}</span>`;
      const cls = 'vt-opt' + (mine ? ' mine' : '') + (top ? ' top' : '') + (show ? ' res' : '');
      return canVote
        ? `<button type="button" class="${cls}" data-poll="${p.id}" data-i="${i}" aria-pressed="${mine}">${inner}</button>`
        : `<div class="${cls}">${inner}</div>`;
    }).join('');
    const meta = p.done
      ? `Selesai ${esc(tgl(p.ends_at))} · ${p.total} suara`
      : `Berakhir ${esc(sisa(p.ends_at - now))} · ${show ? p.total + ' suara' : 'hasil tampil setelah kamu memilih'}`;
    const hint = !p.done && p.mine !== null ? '<p class="vt-hint">Pilihanmu tersimpan. Ketuk pilihan lain untuk mengganti sebelum polling selesai.</p>' : '';
    return `<article class="vt-poll${p.done ? ' done' : ''}"><h3>${esc(p.question)}</h3><p class="vt-meta">${meta}</p><div class="vt-opts">${rows}</div>${hint}</article>`;
  }

  function render() {
    if (!data) return;
    const tok = getTok();
    const login = !tok && data.aktif.length
      ? '<p class="kt-note">Untuk memilih, masuk sebagai warga lewat tombol Dompet (username + kode KTW).</p>' : '';
    el.body.innerHTML = `${login}
      ${data.aktif.length ? data.aktif.map(pollHtml).join('') : '<p class="kt-empty">Belum ada polling yang berjalan. Nanti admin mengumumkan polling baru di Koran.</p>'}
      ${data.riwayat.length ? `<details class="vt-old"><summary>Riwayat polling (${data.riwayat.length})</summary>${data.riwayat.map(pollHtml).join('')}</details>` : ''}`;
    // lebar bilah diatur lewat JS (CSP melarang atribut style)
    el.body.querySelectorAll('.vt-fill').forEach(f => { f.style.transform = `scaleX(${Math.max(0, Math.min(100, +f.dataset.w)) / 100})`; });
  }

  async function onPick(e) {
    const b = e.target.closest('.vt-opt[data-poll]');
    if (!b || busy) return;
    const tok = getTok();
    if (!tok) return say('Masuk sebagai warga dulu lewat tombol Dompet (username + kode KTW).', 'err');
    const id = +b.dataset.poll, choice = +b.dataset.i;
    const p = data.aktif.find(x => x.id === id);
    if (p && p.mine === choice) return;
    busy = true; say('Menyimpan pilihan…');
    try {
      const r = await fetch('/api/voting/pilih', { method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, choice }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) {
        try { localStorage.removeItem(TK); localStorage.removeItem(UK); } catch (er) { /* abaikan */ }
        throw new Error('Sesi berakhir. Masuk lagi lewat tombol Dompet.');
      }
      if (!r.ok) throw new Error(j.error || 'Gagal memilih');
      const i = data.aktif.findIndex(x => x.id === id);
      if (i >= 0) data.aktif[i] = j;
      el.dot.hidden = !data.aktif.some(x => x.mine === null);
      render();
      say(p && p.mine !== null ? 'Pilihanmu sudah diganti.' : 'Terima kasih, suaramu tercatat!', 'ok');
    } catch (er) { say(er.message, 'err'); }
    busy = false;
  }

  AL.onBoot = AL.onBoot || [];
  AL.onBoot.push(mount);
  AL.voting = { open: () => { mount(); return open(); }, reload: () => load().then(render) };
})(window.AL);
