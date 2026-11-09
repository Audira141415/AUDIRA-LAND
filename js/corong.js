/* AUDIRA LAND · Corong Kota: banner siaran 30 detik di atas peta & Taman, plus dialog untuk mengajukan siaran.
   Banner: polling GET /api/corong tiap 15 dtk (berhenti saat tab tersembunyi), ambil ulang tepat saat siaran habis.
   Dialog dibuka dari: ketuk banner, tombol "Corong" di dialog Voting, atau elemen apa pun ber-atribut data-corong-open. */
(function (AL) {
  'use strict';
  if (!AL) return;
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  const esc = AL.esc;
  const POLL_MS = 15000;
  const getTok = () => { try { return localStorage.getItem(TK) || ''; } catch (e) { return ''; } };
  const getUser = () => { try { return localStorage.getItem(UK) || ''; } catch (e) { return ''; } };
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STATUS = {
    menunggu: ['Menunggu dicek admin', ''],
    antre: ['Disetujui, menunggu giliran', 'ok'],
    tayang: ['Sedang tayang', 'on'],
    selesai: ['Sudah tayang', 'done'],
    ditolak: ['Ditolak', 'no'],
    batal: ['Dibatalkan', 'no'],
  };
  const jam = t => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ---------- banner ----------
  let bn = null, cur = null, dismissed = 0, pollT = 0, endT = 0, offset = 0;
  function mountBanner() {
    bn = document.createElement('div');
    bn.className = 'corong-banner';
    bn.hidden = true;
    bn.setAttribute('role', 'status');
    bn.setAttribute('aria-live', 'polite');
    bn.innerHTML = `<button type="button" class="cb-main" aria-label="Corong Kota: buka detail">
        <span class="cb-ic" aria-hidden="true">📣</span>
        <span class="cb-txt"><small class="cb-who"></small><b class="cb-msg"></b></span>
      </button>
      <button type="button" class="cb-x" aria-label="Sembunyikan siaran ini">×</button>
      <span class="cb-bar" aria-hidden="true"><i></i></span>`;
    document.body.appendChild(bn);
    bn.querySelector('.cb-main').addEventListener('click', () => open());
    bn.querySelector('.cb-x').addEventListener('click', () => { if (cur) dismissed = cur.id; hide(); });
  }
  function hide() {
    if (!bn || bn.hidden) { cur = null; return; }
    cur = null;
    bn.classList.remove('in');
    setTimeout(() => { if (!cur) bn.hidden = true; }, reduce ? 0 : 260);
  }
  function show(on) {
    clearTimeout(endT);
    if (!on || on.id === dismissed) return hide();
    const left = on.end_at - (Date.now() + offset);
    if (left <= 300) return hide();
    endT = setTimeout(() => { hide(); poll(); }, left + 400);
    if (cur && cur.id === on.id) return;
    cur = on;
    bn.querySelector('.cb-who').textContent = on.admin ? 'Pengumuman AUDIRA' : '@' + on.u;
    bn.querySelector('.cb-msg').textContent = on.text;
    bn.classList.toggle('admin', !!on.admin);
    const bar = bn.querySelector('.cb-bar i');
    // bilah sisa waktu: lebar awal sesuai sisa, lalu menyusut linear sampai habis
    const total = Math.max(1, on.end_at - on.start_at);
    bar.style.transition = 'none';
    bar.style.transform = `scaleX(${Math.min(1, left / total)})`;
    bn.hidden = false;
    void bn.offsetWidth;
    bar.style.transition = `transform ${left}ms linear`;
    bar.style.transform = 'scaleX(0)';
    requestAnimationFrame(() => bn.classList.add('in'));
  }
  async function poll() {
    clearTimeout(pollT);
    if (document.hidden) return;
    try {
      const r = await fetch('/api/corong', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        offset = j.now - Date.now();
        show(j.on);
      }
    } catch (e) { /* jaringan putus: coba lagi nanti */ }
    pollT = setTimeout(poll, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); else clearTimeout(pollT); });

  // ---------- dialog ----------
  const el = {};
  let info = null;
  function mountSheet() {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet kota-sheet corong-sheet';
    dlg.setAttribute('aria-labelledby', 'crTitle');
    dlg.innerHTML = `<div class="kt-in">
      <button class="close" type="button" aria-label="Tutup">×</button>
      <p class="kicker">Corong Kota</p>
      <h2 id="crTitle">Siarkan pesanmu ke seluruh kota</h2>
      <p class="kt-lead">Pesanmu tampil 30 detik sebagai banner di atas peta dan Taman untuk semua yang sedang online. Siaran berjalan bergiliran.</p>
      <div class="kt-body"></div>
      <p class="msg" hidden aria-live="polite"></p>
      <h3 class="kt-sub">Siaran terakhir</h3>
      <ul class="cr-hist"></ul>
    </div>`;
    document.body.appendChild(dlg);
    Object.assign(el, { dlg, body: dlg.querySelector('.kt-body'), msg: dlg.querySelector('.msg'), hist: dlg.querySelector('.cr-hist') });
    dlg.querySelector('.close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }
  function say(text, kind) {
    el.msg.hidden = !text; el.msg.textContent = text || '';
    el.msg.className = 'msg' + (kind ? ' ' + kind : '');
  }
  async function open() {
    if (!el.dlg) mountSheet();
    say('');
    if (!el.dlg.open) el.dlg.showModal();
    el.body.innerHTML = '<p class="kt-empty">Memuat…</p>';
    try {
      info = await fetch('/api/corong/riwayat', { cache: 'no-store' }).then(r => r.json());
      renderHist();
    } catch (e) { info = info || { riwayat: [], saweria: '', harga: '', maks: 100 }; }
    if (!getTok()) return renderLogin();
    await renderForm();
  }
  function renderHist() {
    const list = (info && info.riwayat) || [];
    el.hist.innerHTML = list.length ? list.map(h => `<li><b>${h.admin ? 'AUDIRA' : '@' + esc(h.u)}</b><span>${esc(h.text)}</span><small>${esc(jam(h.t))}</small></li>`).join('')
      : '<li class="kt-empty">Belum ada siaran. Jadilah yang pertama!</li>';
  }
  function renderLogin() {
    el.body.innerHTML = `<form class="kt-login" novalidate>
      <p class="kt-note">Masuk sebagai warga dulu: username Instagram dan kode KTW 8 huruf dari admin AUDIRA.</p>
      <label class="field"><span>@</span><input name="u" required maxlength="31" placeholder="username_instagram" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>KTW</span><input name="k" required maxlength="8" placeholder="8 huruf" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"></label>
      <button class="btn" type="submit">Masuk</button>
    </form>`;
    const f = el.body.querySelector('form');
    f.u.addEventListener('input', () => { f.u.value = f.u.value.replace(/^@+/, ''); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      say('Memeriksa…');
      try {
        const r = await fetch('/api/masuk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: f.u.value, kode: f.k.value }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Gagal masuk');
        try { localStorage.setItem(TK, j.token); localStorage.setItem(UK, j.username); } catch (er) { /* abaikan */ }
        if (AL.koran && AL.koran.loadKu) AL.koran.loadKu();
        say('');
        await renderForm();
      } catch (er) { say(er.message, 'err'); }
    });
  }
  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + getTok(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) {
      try { localStorage.removeItem(TK); localStorage.removeItem(UK); } catch (e) { /* abaikan */ }
      renderLogin();
      throw new Error(j.error || 'Sesi berakhir, masuk lagi.');
    }
    if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
    return j;
  }
  async function renderForm() {
    let mine;
    try { mine = await api('/api/corong/aku'); } catch (e) { say(e.message, 'err'); return; }
    const maks = (info && info.maks) || 100;
    const saw = mine.saweria || (info && info.saweria) || '';
    const harga = mine.harga || (info && info.harga) || '';
    el.body.innerHTML = `
      <ol class="cr-steps">
        <li><b>Donasi lewat Saweria</b>${harga ? ` <span class="pill cr-harga">${esc(harga)}</span>` : ''}<br>
          ${saw ? `<a class="btn sm cr-saw" href="${esc(saw)}" target="_blank" rel="noopener noreferrer">Buka Saweria ↗</a>` : '<small>Tautan donasi belum dipasang admin. Tanya admin AUDIRA lewat DM Instagram.</small>'}
          <small>Tulis kode unik di pesan donasi (mis. <b>CORONG-${esc(getUser() || mine.user)}</b>) supaya mudah dicocokkan.</small></li>
        <li><b>Tulis pesan & kode donasimu</b></li>
        <li><b>Admin mencocokkan</b>, lalu pesanmu masuk antrean siaran.</li>
      </ol>
      <form class="cr-form" novalidate>
        <label class="kt-area"><span class="sr">Pesan siaran</span>
          <textarea name="t" rows="3" maxlength="${maks}" required placeholder="Selamat ulang tahun @teman! Semoga betah di AUDIRA LAND 🎉"></textarea>
          <small class="cr-count">0/${maks}</small></label>
        <label class="field"><span>Kode/nama donasi</span><input name="d" required maxlength="60" placeholder="CORONG-${esc(getUser() || mine.user)}" autocapitalize="off" spellcheck="false"></label>
        <button class="btn" type="submit">Ajukan siaran</button>
        <p class="kt-note">Pesan disaring otomatis (tautan & kata kasar). Admin bisa menolak pesan yang tidak pantas; donasi untuk pesan yang ditolak dikembalikan sesuai kebijakan admin.</p>
      </form>
      ${mine.list.length ? `<h3 class="kt-sub">Pengajuanmu</h3><ul class="cr-mine">${mine.list.map(x => {
        const s = STATUS[x.status] || [x.status, ''];
        return `<li><span class="cr-st ${s[1]}">${esc(s[0])}</span><span>${esc(x.text)}</span><small>${esc(jam(x.created_at))} · ${esc(x.donor)}${x.note ? ' · ' + esc(x.note) : ''}</small></li>`;
      }).join('')}</ul>` : ''}`;
    const f = el.body.querySelector('.cr-form');
    const cnt = el.body.querySelector('.cr-count');
    f.t.addEventListener('input', () => { cnt.textContent = f.t.value.length + '/' + maks; });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true; say('Mengirim…');
      try {
        await api('/api/corong/ajukan', { text: f.t.value, donor: f.d.value });
        say('Terkirim! Pesanmu tampil setelah admin mencocokkan donasi.', 'ok');
        await renderForm();
        el.msg.hidden = false;
      } catch (er) { say(er.message, 'err'); btn.disabled = false; }
    });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-corong-open]');
    if (t) { e.preventDefault(); open(); }
  });

  function start() { mountBanner(); poll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  AL.corong = { open, poll };
})(window.AL);
