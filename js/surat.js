/* AUDIRA LAND · Surat & Teman di peta: surat antar teman, permintaan pertemanan, blokir, laporkan.
   Sesi warga sama dengan Dompet/Taman (username + kode KTW, disimpan di perangkat).
   API global: AL.surat.buka(u), AL.surat.tambahTeman(u). */
(function (AL) {
  'use strict';
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  const esc = AL.esc;
  const MAKS = 300;
  const ALASAN = { spam: 'Spam', kasar: 'Kata kasar', mengganggu: 'Mengganggu', lainnya: 'Lainnya' };
  let tab = 'surat', ring = { surat: 0, minta: 0 }, pollTimer = 0, threadTimer = 0;
  let thread = null;   // { u, pesan:[], lebih, teman, ... } percakapan yang sedang dibuka
  let after = null;    // aksi tertunda setelah masuk: { buka: u } / { teman: u }
  const el = {};

  const sesi = () => { try { return { token: localStorage.getItem(TK) || '', user: localStorage.getItem(UK) || '' }; } catch (e) { return { token: '', user: '' }; } };
  const fmtWaktu = t => {
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const nama = raw => String(raw || '').trim().replace(/^@+/, '').toLowerCase();

  async function api(path, body) {
    const { token } = sesi();
    if (!token) { const e = new Error('Masuk sebagai warga dulu.'); e.login = true; throw e; }
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) {
      try { localStorage.removeItem(TK); localStorage.removeItem(UK); } catch (e) { /* abaikan */ }
      const e = new Error(j.error || 'Sesi berakhir, masuk lagi.'); e.login = true; throw e;
    }
    if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
    return j;
  }

  // ---------- kerangka ----------
  function mount() {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'surat-btn';
    btn.setAttribute('aria-label', 'Surat & teman'); btn.title = 'Surat & teman';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4.5 7.5 7.5 6 7.5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg><span class="dot" hidden></span>';
    const tools = document.querySelector('.tools');
    const dompet = tools.querySelector('.dompet-btn');
    if (dompet) tools.insertBefore(btn, dompet.nextSibling); else tools.insertBefore(btn, tools.firstChild);

    const dlg = document.createElement('dialog');
    dlg.className = 'sheet surat-sheet'; dlg.setAttribute('aria-labelledby', 'srTitle');
    dlg.innerHTML = `<div class="sr-in">
      <button class="close" type="button" aria-label="Tutup">×</button>
      <p class="kicker">Surat warga</p>
      <h2 id="srTitle">Surat</h2>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-tab="surat" aria-selected="true">Surat<span class="dot" hidden></span></button>
        <button type="button" role="tab" data-tab="teman" aria-selected="false">Teman</button>
        <button type="button" role="tab" data-tab="minta" aria-selected="false">Permintaan<span class="dot" hidden></span></button>
      </div>
      <div class="sr-body"></div>
      <p class="msg" hidden aria-live="polite"></p>
    </div>`;
    document.body.appendChild(dlg);
    Object.assign(el, {
      btn, dlg, dot: btn.querySelector('.dot'),
      body: dlg.querySelector('.sr-body'), msg: dlg.querySelector('.msg'),
      tabs: dlg.querySelector('.tabs'), title: dlg.querySelector('#srTitle'), kicker: dlg.querySelector('.kicker'),
      dotSurat: dlg.querySelector('[data-tab="surat"] .dot'), dotMinta: dlg.querySelector('[data-tab="minta"] .dot'),
    });
    btn.addEventListener('click', () => open());
    dlg.querySelector('.close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { stopThread(); ringkas(); });
    el.tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; say(''); render(); } });
    // satu pendengar klik untuk seluruh isi dialog
    el.body.addEventListener('click', onClick);
    el.body.addEventListener('submit', onSubmit);
  }
  function say(text, kind) {
    el.msg.hidden = !text; el.msg.textContent = text || '';
    el.msg.className = 'msg' + (kind ? ' ' + kind : '');
  }
  function fail(e) {
    if (e.login) { renderLogin(); say(e.message === 'Masuk sebagai warga dulu.' ? '' : e.message, 'err'); return; }
    say(e.message, 'err');
  }
  function setDots() {
    el.dot.hidden = !(ring.surat || ring.minta);
    el.dotSurat.hidden = !ring.surat;
    el.dotMinta.hidden = !ring.minta;
    el.btn.setAttribute('aria-label', 'Surat & teman' + (ring.surat || ring.minta ? ` (${ring.surat + ring.minta} baru)` : ''));
  }
  async function ringkas() {
    if (!sesi().token || document.hidden) return;
    try { ring = await api('/api/surat/ringkas'); setDots(); } catch (e) { if (e.login) { ring = { surat: 0, minta: 0 }; setDots(); } }
  }

  function open(opts) {
    say('');
    stopThread();
    if (!el.dlg.open) el.dlg.showModal();
    if (opts && opts.tab) tab = opts.tab;
    if (!sesi().token) { after = opts && opts.after || null; return renderLogin(); }
    render();
  }
  function frame(title, kicker) {
    el.tabs.hidden = false;
    el.title.textContent = title;
    el.kicker.textContent = kicker || 'Surat warga';
    el.tabs.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  }
  function render() {
    stopThread();
    const me = sesi().user;
    frame('@' + me);
    if (tab === 'teman') renderTeman();
    else if (tab === 'minta') renderMinta();
    else renderDaftar();
  }

  // ---------- masuk ----------
  function renderLogin() {
    stopThread();
    el.tabs.hidden = true;
    el.kicker.textContent = 'Surat warga';
    el.title.textContent = 'Masuk sebagai warga';
    el.body.innerHTML = `<form class="sr-login" data-form="login" novalidate>
      <p class="lead">Surat dan teman khusus warga kota. Masuk dengan username Instagram dan kode KTW 8 huruf dari admin AUDIRA. Sesinya sama dengan Dompet dan Taman.</p>
      <label class="field"><span>@</span><input name="u" required maxlength="31" placeholder="username_instagram" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>KTW</span><input name="k" required maxlength="8" placeholder="8 huruf" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"></label>
      <button class="btn" type="submit">Masuk</button>
    </form>`;
  }
  async function login(f) {
    say('Memeriksa…');
    try {
      const r = await fetch('/api/masuk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: nama(f.u.value), kode: f.k.value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal masuk');
      try { localStorage.setItem(TK, j.token); localStorage.setItem(UK, j.username); } catch (er) { throw new Error('Perangkat ini tidak bisa menyimpan sesi.'); }
      if (AL.koran) AL.koran.loadKu();
      say('');
      startPoll();
      const a = after; after = null;
      if (a && a.buka) return bukaThread(a.buka);
      if (a && a.teman) { tab = 'teman'; await minta(a.teman); return render(); }   // render tidak menghapus pesan hasil minta
      render();
    } catch (er) { say(er.message, 'err'); }
  }

  // ---------- portret kecil ----------
  function avatar(u) { return `<canvas class="sr-av" width="80" height="80" data-av="${esc(u)}" aria-hidden="true"></canvas>`; }
  function drawAvatars() {
    if (!AL.drawPortrait) return;
    el.body.querySelectorAll('canvas[data-av]').forEach(cv => {
      const u = cv.dataset.av, r = AL.byName && AL.byName.get(u);
      const look = r ? r.look : (AL.mkLook ? AL.mkLook(AL.hash32(u)) : null);
      if (look) try { AL.drawPortrait(cv.getContext('2d'), look, 80); } catch (e) { /* abaikan */ }
    });
  }

  // ---------- tab Surat: daftar percakapan ----------
  async function renderDaftar() {
    el.body.innerHTML = '<p class="sr-sub">Memuat surat…</p>';
    let d;
    try { d = await api('/api/surat/percakapan'); } catch (e) { el.body.innerHTML = ''; return fail(e); }
    if (tab !== 'surat' || thread) return;
    ring.surat = d.percakapan.reduce((n, c) => n + c.unread, 0); setDots();
    el.body.innerHTML = d.percakapan.length ? `<ul class="sr-list">${d.percakapan.map(c => `
      <li><button type="button" class="sr-row${c.unread ? ' baru' : ''}" data-buka="${esc(c.u)}">
        ${avatar(c.u)}
        <span class="sr-mid"><b>@${esc(c.u)}</b><small>${c.dariKu ? 'Kamu: ' : ''}${esc(c.isi)}</small></span>
        <span class="sr-end"><small>${fmtWaktu(c.t)}</small>${c.unread ? `<span class="sr-n" aria-label="${c.unread} belum dibaca">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</span>
      </button></li>`).join('')}</ul>`
      : '<div class="sr-empty"><p>Belum ada surat.</p><p class="sr-sub">Surat hanya bisa dikirim ke teman. Tambah teman di tab Teman, atau ketuk warga di peta.</p><button type="button" class="btn ghost sm" data-ke-tab="teman">Cari teman</button></div>';
    drawAvatars();
  }

  // ---------- percakapan ----------
  function stopThread() { clearInterval(threadTimer); threadTimer = 0; thread = null; }
  async function bukaThread(u) {
    u = nama(u);
    stopThread();
    tab = 'surat';
    frame('@' + u, 'Surat dengan');
    el.body.innerHTML = '<p class="sr-sub">Membuka surat…</p>';
    let d;
    try { d = await api('/api/surat/percakapan?u=' + encodeURIComponent(u)); } catch (e) { el.body.innerHTML = '<button type="button" class="link sr-back" data-ke-tab="surat">‹ Semua surat</button>'; return fail(e); }
    thread = d;
    renderThread(true);
    ringkas();
    // surat baru dari lawan bicara: periksa tiap 10 dtk selama percakapan terbuka
    threadTimer = setInterval(segarkanThread, 10000);
  }
  async function segarkanThread() {
    if (!thread || document.hidden || !el.dlg.open) return;
    const u = thread.u;
    try {
      const d = await api('/api/surat/percakapan?u=' + encodeURIComponent(u));
      if (!thread || thread.u !== u) return;
      const ada = new Set(thread.pesan.map(p => p.id));
      const baru = d.pesan.filter(p => !ada.has(p.id));
      // perbarui status dibaca surat milikku
      const baca = new Map(d.pesan.map(p => [p.id, p.dibaca]));
      let ubah = baru.length > 0 || d.teman !== thread.teman;
      thread.pesan.forEach(p => { if (baca.has(p.id) && baca.get(p.id) !== p.dibaca) { p.dibaca = baca.get(p.id); ubah = true; } });
      Object.assign(thread, { teman: d.teman, kuBlokir: d.kuBlokir, mintaKeluar: d.mintaKeluar, mintaMasuk: d.mintaMasuk });
      if (baru.length) thread.pesan = thread.pesan.concat(baru);
      if (ubah) renderThread(baru.length > 0, true);
    } catch (e) { /* coba lagi nanti */ }
  }
  function bubbles(list) {
    let hari = '';
    return list.map(p => {
      const h = new Date(p.t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
      const sep = h !== hari ? `<li class="sr-day"><span>${esc(h)}</span></li>` : '';
      hari = h;
      return sep + `<li class="sr-b ${p.ku ? 'ku' : 'dia'}"><p>${esc(p.isi)}</p><small>${fmtWaktu(p.t)}${p.ku ? (p.dibaca ? ' · dibaca' : ' · terkirim') : ''}</small></li>`;
    }).join('');
  }
  function renderThread(keBawah, keepDraft) {
    const t = thread; if (!t) return;
    const draft = keepDraft && el.body.querySelector('textarea[name="isi"]');
    const draftVal = draft ? draft.value : '';
    const hadFocus = draft && document.activeElement === draft;
    const listEl = el.body.querySelector('.sr-thread');
    const scrollDariBawah = listEl ? listEl.scrollHeight - listEl.scrollTop : 0;
    let tulis;
    if (t.kuBlokir) tulis = `<div class="sr-note">Kamu memblokir @${esc(t.u)}. <button type="button" class="link" data-unblok="${esc(t.u)}">Buka blokir</button></div>`;
    else if (t.teman) tulis = `<form class="sr-tulis" data-form="kirim" novalidate>
        <label class="sr-ta"><span class="sr-hidden">Tulis surat untuk @${esc(t.u)}</span><textarea name="isi" rows="2" maxlength="${MAKS}" placeholder="Tulis surat…" required></textarea></label>
        <div class="sr-tulis-bar"><small class="sr-count">0/${MAKS}</small><button class="btn sm" type="submit">Kirim</button></div>
      </form>`;
    else if (t.mintaMasuk) tulis = `<div class="sr-note">@${esc(t.u)} ingin berteman denganmu. <button type="button" class="btn sm" data-terima="${esc(t.u)}">Terima</button></div>`;
    else if (t.mintaKeluar) tulis = `<div class="sr-note">Permintaan pertemanan ke @${esc(t.u)} sudah terkirim. Surat bisa dikirim setelah dia menerima.</div>`;
    else tulis = `<div class="sr-note">Surat hanya bisa dikirim antar teman. <button type="button" class="btn sm" data-minta="${esc(t.u)}">Tambah teman</button></div>`;
    el.body.innerHTML = `
      <div class="sr-head"><button type="button" class="link sr-back" data-ke-tab="surat">‹ Semua surat</button>
        <span class="sr-acts"><button type="button" class="link" data-lapor="${esc(t.u)}">Laporkan</button>${t.kuBlokir ? '' : `<button type="button" class="link" data-blok="${esc(t.u)}">Blokir</button>`}</span></div>
      <ol class="sr-thread" aria-live="polite">
        ${t.lebih ? '<li class="sr-more"><button type="button" class="btn ghost sm" data-lama="1">Muat surat lama</button></li>' : ''}
        ${t.pesan.length ? bubbles(t.pesan) : `<li class="sr-day"><span>Belum ada surat dengan @${esc(t.u)}</span></li>`}
      </ol>
      ${tulis}`;
    const ol = el.body.querySelector('.sr-thread');
    if (keBawah || !listEl) ol.scrollTop = ol.scrollHeight;
    else ol.scrollTop = ol.scrollHeight - scrollDariBawah;
    const ta = el.body.querySelector('textarea[name="isi"]');
    if (ta) {
      const cnt = el.body.querySelector('.sr-count');
      const upd = () => { cnt.textContent = ta.value.length + '/' + MAKS; };
      ta.addEventListener('input', upd);
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ta.form.requestSubmit(); } });
      if (draftVal) { ta.value = draftVal; upd(); }
      if (hadFocus) ta.focus();
    }
  }
  async function muatLama() {
    const t = thread; if (!t || !t.pesan.length) return;
    try {
      const d = await api('/api/surat/percakapan?u=' + encodeURIComponent(t.u) + '&sebelum=' + t.pesan[0].id);
      if (thread !== t) return;
      t.pesan = d.pesan.concat(t.pesan); t.lebih = d.lebih;
      renderThread(false, true);
    } catch (e) { fail(e); }
  }
  async function kirim(f) {
    const t = thread, isi = f.isi.value.trim();
    if (!t || !isi) return;
    const btn = f.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const r = await api('/api/surat/kirim', { to: t.u, text: isi });
      if (thread !== t) return;
      t.pesan.push(r.pesan);
      f.isi.value = '';
      say('');
      renderThread(true, true);
      const ta = el.body.querySelector('textarea[name="isi"]'); if (ta) ta.focus();
    } catch (e) { fail(e); } finally { btn.disabled = false; }
  }

  // ---------- tab Teman ----------
  async function renderTeman() {
    el.body.innerHTML = '<p class="sr-sub">Memuat teman…</p>';
    let d;
    try { d = await api('/api/surat/teman'); } catch (e) { el.body.innerHTML = ''; return fail(e); }
    if (tab !== 'teman' || thread) return;
    el.body.innerHTML = `
      <form class="sr-add" data-form="minta" novalidate>
        <label class="field"><span>@</span><input name="to" required maxlength="31" placeholder="username warga" autocapitalize="off" spellcheck="false"></label>
        <button class="btn" type="submit">Ajak berteman</button>
      </form>
      <p class="sr-sub">${d.teman.length} dari ${d.maks} teman · sisa ${d.mintaSisa} permintaan hari ini.</p>
      ${d.teman.length ? `<ul class="sr-list">${d.teman.map(f => `
        <li class="sr-row">${avatar(f.u)}
          <span class="sr-mid"><b>@${esc(f.u)}</b><small>Berteman sejak ${new Date(f.t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</small></span>
          <span class="sr-btns"><button type="button" class="btn sm" data-buka="${esc(f.u)}">Surat</button><button type="button" class="btn ghost sm" data-hapus="${esc(f.u)}" aria-label="Hapus teman @${esc(f.u)}">Hapus</button></span>
        </li>`).join('')}</ul>` : '<div class="sr-empty"><p>Belum punya teman.</p><p class="sr-sub">Tulis username warga di atas, atau ketuk warga di peta lalu pilih “Tambah teman”.</p></div>'}
      ${d.blokir.length ? `<h3 class="sub">Diblokir</h3><ul class="sr-list">${d.blokir.map(b => `
        <li class="sr-row"><span class="sr-mid"><b>@${esc(b.u)}</b><small>Tidak bisa mengirim permintaan atau surat padamu</small></span>
          <span class="sr-btns"><button type="button" class="btn ghost sm" data-unblok="${esc(b.u)}">Buka blokir</button></span></li>`).join('')}</ul>` : ''}`;
    el.body.querySelector('[name="to"]').addEventListener('input', e => { e.target.value = e.target.value.replace(/^@+/, ''); });
    drawAvatars();
  }
  async function minta(u) {
    u = nama(u);
    if (!u) return say('Tulis username warga dulu.', 'err');
    try {
      const r = await api('/api/surat/minta', { to: u });
      say(r.status === 'teman' ? `Kamu dan @${u} sekarang berteman.` : `Permintaan pertemanan terkirim ke @${u}.`, 'ok');
      return r;
    } catch (e) { fail(e); }
  }

  // ---------- tab Permintaan ----------
  async function renderMinta() {
    el.body.innerHTML = '<p class="sr-sub">Memuat permintaan…</p>';
    let d;
    try { d = await api('/api/surat/teman'); } catch (e) { el.body.innerHTML = ''; return fail(e); }
    if (tab !== 'minta' || thread) return;
    ring.minta = d.masuk.length; setDots();
    el.body.innerHTML = `
      <h3 class="sub">Masuk</h3>
      ${d.masuk.length ? `<ul class="sr-list">${d.masuk.map(m => `
        <li class="sr-row">${avatar(m.u)}
          <span class="sr-mid"><b>@${esc(m.u)}</b><small>${fmtWaktu(m.t)}</small></span>
          <span class="sr-btns"><button type="button" class="btn sm" data-terima="${esc(m.u)}">Terima</button><button type="button" class="btn ghost sm" data-tolak="${esc(m.u)}">Tolak</button><button type="button" class="link sr-x" data-blok="${esc(m.u)}">Blokir</button></span>
        </li>`).join('')}</ul>` : '<p class="sr-sub">Tidak ada permintaan baru.</p>'}
      <h3 class="sub">Terkirim</h3>
      ${d.keluar.length ? `<ul class="sr-list">${d.keluar.map(m => `
        <li class="sr-row">${avatar(m.u)}
          <span class="sr-mid"><b>@${esc(m.u)}</b><small>Menunggu jawaban · ${fmtWaktu(m.t)}</small></span>
          <span class="sr-btns"><button type="button" class="btn ghost sm" data-batal="${esc(m.u)}">Batalkan</button></span>
        </li>`).join('')}</ul>` : '<p class="sr-sub">Belum ada permintaan yang kamu kirim.</p>'}`;
    drawAvatars();
  }

  // ---------- laporkan ----------
  function renderLapor(u) {
    stopThread();
    frame('Laporkan @' + u, 'Surat warga');
    el.body.innerHTML = `<form class="sr-lapor" data-form="lapor" data-u="${esc(u)}" novalidate>
      <p class="lead">Laporan dibaca admin AUDIRA beserta 10 surat terakhir dari @${esc(u)} untukmu. @${esc(u)} tidak diberi tahu.</p>
      <fieldset class="sr-alasan"><legend>Alasan</legend>
        ${Object.entries(ALASAN).map(([k, v], i) => `<label><input type="radio" name="alasan" value="${k}"${i ? '' : ' checked'}> ${v}</label>`).join('')}
      </fieldset>
      <label class="sr-ta"><span>Catatan (opsional)</span><textarea name="catatan" rows="2" maxlength="200" placeholder="Ceritakan singkat apa yang terjadi"></textarea></label>
      <label class="sr-cek"><input type="checkbox" name="blok" checked> Blokir @${esc(u)} juga</label>
      <div class="sr-btns"><button class="btn" type="submit">Kirim laporan</button><button class="btn ghost" type="button" data-buka="${esc(u)}">Batal</button></div>
    </form>`;
  }
  async function lapor(f) {
    const u = f.dataset.u;
    try {
      await api('/api/surat/laporkan', { u, alasan: f.alasan.value, catatan: f.catatan.value });
      if (f.blok.checked) await api('/api/surat/blokir', { u, on: true });
      tab = 'surat'; render();
      say(`Terima kasih. Laporan tentang @${u} sudah dikirim ke admin.`, 'ok');
    } catch (e) { fail(e); }
  }

  // ---------- tindakan ----------
  async function onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.type === 'submit') return;
    const d = b.dataset;
    if (d.keTab) { tab = d.keTab; say(''); return render(); }
    if (d.buka) { say(''); return bukaThread(d.buka); }
    if (d.lama) return muatLama();
    if (d.lapor) { say(''); return renderLapor(d.lapor); }
    b.disabled = true;
    try {
      if (d.minta) {
        const r = await minta(d.minta);
        if (r && thread) {
          Object.assign(thread, r.status === 'teman' ? { teman: true } : { mintaKeluar: true });
          renderThread(false, true);
        }
      } else if (d.terima) {
        await api('/api/surat/terima', { from: d.terima });
        say(`Kamu dan @${d.terima} sekarang berteman.`, 'ok');
        if (thread) { thread.teman = true; thread.mintaMasuk = false; renderThread(false, true); } else renderMinta();
        ringkas();
      } else if (d.tolak) {
        await api('/api/surat/tolak', { from: d.tolak });
        say(`Permintaan @${d.tolak} ditolak.`); renderMinta(); ringkas();
      } else if (d.batal) {
        await api('/api/surat/batal', { to: d.batal });
        say(`Permintaan ke @${d.batal} dibatalkan.`); renderMinta();
      } else if (d.hapus) {
        if (!confirm(`Hapus @${d.hapus} dari teman? Kalian tidak bisa saling kirim surat sampai berteman lagi.`)) return;
        await api('/api/surat/hapus-teman', { u: d.hapus });
        say(`@${d.hapus} dihapus dari teman.`); renderTeman();
      } else if (d.blok) {
        if (!confirm(`Blokir @${d.blok}? Pertemanan dan permintaan kalian dihapus, dan dia tidak bisa mengirim permintaan atau surat padamu.`)) return;
        await api('/api/surat/blokir', { u: d.blok, on: true });
        say(`@${d.blok} diblokir.`, 'ok');
        if (thread) { thread.kuBlokir = true; thread.teman = false; renderThread(false); } else render();
        ringkas();
      } else if (d.unblok) {
        await api('/api/surat/blokir', { u: d.unblok, on: false });
        say(`Blokir @${d.unblok} dibuka. Kalian perlu berteman lagi untuk berkirim surat.`, 'ok');
        if (thread) { thread.kuBlokir = false; renderThread(false); } else renderTeman();
      }
    } catch (er) { fail(er); } finally { b.disabled = false; }
  }
  async function onSubmit(e) {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const k = f.dataset.form;
    if (k === 'login') return login(f);
    if (k === 'kirim') return kirim(f);
    if (k === 'lapor') return lapor(f);
    if (k === 'minta') { const r = await minta(f.to.value); if (r) { f.to.value = ''; renderTeman(); } }
  }

  // ---------- polling titik merah ----------
  function startPoll() {
    clearInterval(pollTimer);
    ringkas();
    pollTimer = setInterval(ringkas, 30000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && el.btn) ringkas(); });

  // ---------- API global (dipakai kartu warga di peta) ----------
  AL.surat = {
    buka(u) {
      if (!el.dlg) return;
      u = nama(u);
      if (!u) return open({ tab: 'surat' });
      if (!sesi().token) return open({ after: { buka: u } });
      open(); bukaThread(u);
    },
    async tambahTeman(u) {
      if (!el.dlg) return;
      u = nama(u);
      if (!sesi().token) return open({ tab: 'teman', after: { teman: u } });
      tab = 'teman';
      say('');
      stopThread();
      if (!el.dlg.open) el.dlg.showModal();
      await minta(u);
      render();
    },
    segarkan: ringkas,
  };

  AL.onBoot.push(() => {
    if (!document.querySelector('.tools') || el.btn) return;
    mount();
    startPoll();
  });
})(window.AL);
