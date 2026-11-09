/* AUDIRA LAND · admin: setujui/tolak pendaftar, impor massal, permintaan keluar, hapus warga. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'audira-admin-token';
  let token = '';
  try { token = sessionStorage.getItem(KEY) || ''; } catch (e) { /* penyimpanan diblokir */ }

  async function call(path, body) {
    const r = await fetch('/api/admin/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { logout(); throw new Error(j.error || 'Token salah'); }
    if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
    return j;
  }
  const fmt = ms => new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function logout() {
    token = '';
    try { sessionStorage.removeItem(KEY); } catch (e) { /* abaikan */ }
    $('app').hidden = true; $('login').hidden = false;
  }

  async function refresh() {
    const d = await call('ringkas');
    const c = d.counts;
    $('stats').innerHTML = [
      ['Warga & antre', c.approved], ['Menunggu', c.pending], ['Ditolak', c.rejected], ['Dihapus', c.removed],
      ['Kapal', 'tiap ' + Math.round(d.ferryEveryS / 60 * 10) / 10 + ' mnt · ' + d.ferryCap + ' kursi'],
    ].map(([k, v]) => `<div><span>${k}</span><strong>${typeof v === 'number' ? v.toLocaleString('id-ID') : v}</strong></div>`).join('');
    $('pendCount').textContent = d.pending.length;
    $('pending').innerHTML = d.pending.length ? d.pending.map(p => `
      <li><label><input type="checkbox" value="${esc(p.username)}"> <b>@${esc(p.username)}</b></label>
      <small>${esc(p.source)} · ${fmt(p.created_at)}</small>
      <a href="https://www.instagram.com/${encodeURIComponent(p.username)}/" target="_blank" rel="noopener noreferrer">Cek profil</a></li>`).join('')
      : '<li class="empty">Tidak ada pendaftar baru.</li>';
    $('leaveCount').textContent = d.leaving.length;
    $('leaving').innerHTML = d.leaving.length ? d.leaving.map(p => `
      <li><b>@${esc(p.username)}</b><small>${esc(p.status)}${p.seq ? ' · #' + p.seq : ''}</small>
      <span class="acts"><button class="btn danger sm" data-act="hapus" data-u="${esc(p.username)}">Hapus dari kota</button>
      <button class="btn ghost sm" data-act="pertahankan" data-u="${esc(p.username)}">Abaikan</button></span></li>`).join('')
      : '<li class="empty">Tidak ada permintaan.</li>';
    await loadKabar();
    await loadSponsor();
    await loadRadio();
  }

  // ---------- Radio ----------
  const durTxt = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  async function loadRadio() {
    const d = await call('radio');
    $('rGen').value = d.gen; $('rEvery').value = d.every; $('rAnn').checked = !!d.announcer;
    $('tracks').innerHTML = d.tracks.length ? d.tracks.map(t => `
      <li><span class="tag ${t.enabled ? 'aktif' : 'selesai'}">${t.enabled ? 'diputar' : 'nonaktif'}</span><b>${esc(t.title)}</b>
      <small>${esc(t.artist || '—')} · ${durTxt(t.duration)} · ${esc(t.license)}</small>
      <span class="acts"><button class="btn ghost sm" data-tog="${t.id}" data-on="${t.enabled ? 0 : 1}">${t.enabled ? 'Nonaktifkan' : 'Aktifkan'}</button>
      <button class="btn danger sm" data-del-track="${t.id}">Hapus</button></span></li>`).join('')
      : '<li class="empty">Belum ada lagu unggahan. Radio memutar lagu generatif.</li>';
  }
  $('radioForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await call('radio/atur', { gen: +$('rGen').value, every: +$('rEvery').value, announcer: $('rAnn').checked }); await loadRadio(); toast('Pengaturan radio disimpan'); }
    catch (er) { toast(er.message, true); }
  });
  $('uploadForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = $('uFile').files[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast('File maks 20 MB', true);
    $('uBtn').disabled = true; $('uInfo').textContent = 'Membaca durasi…';
    try {
      const buf = await f.arrayBuffer();
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const audio = await new AC(1, 44100, 44100).decodeAudioData(buf.slice(0));
      $('uInfo').textContent = 'Mengunggah…';
      const qs = new URLSearchParams({ title: $('uTitle').value, artist: $('uArtist').value, license: $('uLicense').value, duration: audio.duration.toFixed(2) });
      const r = await fetch('/api/admin/radio/unggah?' + qs, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'audio/mpeg' }, body: buf });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal unggah (' + r.status + ')');
      $('uploadForm').reset(); $('uInfo').textContent = '';
      await loadRadio(); toast('Lagu masuk putaran radio');
    } catch (er) { $('uInfo').textContent = ''; toast(er.name === 'EncodingError' ? 'File tidak bisa dibaca sebagai audio' : er.message, true); }
    finally { $('uBtn').disabled = false; }
  });
  $('tracks').addEventListener('click', async e => {
    const tog = e.target.closest('[data-tog]'), del = e.target.closest('[data-del-track]');
    try {
      if (tog) { await call('radio/ubah', { id: +tog.dataset.tog, enabled: tog.dataset.on === '1' }); await loadRadio(); }
      else if (del && confirm('Hapus lagu ini dari radio? File di server ikut dihapus.')) { await call('radio/hapus', { id: +del.dataset.delTrack }); await loadRadio(); toast('Lagu dihapus'); }
    } catch (er) { toast(er.message, true); }
  });

  // ---------- Slot Sponsor ----------
  let spData = { sponsors: [], today: '' };
  const KIND = { papan: 'Papan reklame', holo: 'Hologram', toko: 'Toko bermerek' };
  const dayStr = off => new Date(Date.now() + 7 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
  const spStatus = s => (s.start_date > spData.today ? 'terjadwal' : s.end_date < spData.today ? 'selesai' : 'aktif');
  function fillSlots() {
    const sel = $('spSlot'), keep = sel.value;
    const used = new Map();
    spData.sponsors.filter(s => s.end_date >= spData.today).forEach(s => used.set(s.slot, s));
    sel.innerHTML = '<option value="">— pilih slot —</option>' + ['papan', 'holo', 'toko'].map(k => `<optgroup label="${KIND[k]}">` +
      AL.sponsorSlots().filter(s => s.kind === k).map(s => {
        const u = used.get(s.id);
        return `<option value="${s.id}">${esc(s.label.split(' · ')[1] || s.label)}${u ? ` — dipakai ${esc(u.name)} s/d ${u.end_date}` : ''}</option>`;
      }).join('') + '</optgroup>').join('');
    sel.value = keep;
  }
  async function loadSponsor() {
    spData = await call('sponsor');
    fillSlots();
    $('sponsors').innerHTML = spData.sponsors.length ? spData.sponsors.map(s => {
      const slot = AL.slotById(s.slot), st = spStatus(s), ctr = s.views ? (s.clicks / s.views * 100).toFixed(1) + '%' : '–';
      return `<li><span class="tag ${st}">${st}</span><b>${esc(s.name)}</b>
        <small>${esc(slot ? slot.label : s.slot)} · ${s.start_date} s/d ${s.end_date}
        <span class="stats-inline">· ${s.views} tayang · ${s.clicks} klik · CTR ${ctr}</span>${s.note ? ' · ' + esc(s.note) : ''}</small>
        <span class="acts"><button class="btn ghost sm" data-edit-sp="${s.id}">Edit</button>
        <button class="btn danger sm" data-del-sp="${s.id}">Hapus</button></span></li>`;
    }).join('') : '<li class="empty">Belum ada sponsor.</li>';
    if (!$('spStart').value) { $('spStart').value = dayStr(0); $('spEnd').value = dayStr(30); }
    drawSpPreview();
  }
  function spForm() {
    return { id: $('spId').value || undefined, slot: $('spSlot').value, name: $('spName').value.trim(), tagline: $('spTagline').value.trim(), c1: $('spC1').value, c2: $('spC2').value, link: $('spLink').value, start_date: $('spStart').value, end_date: $('spEnd').value, note: $('spNote').value };
  }
  function drawSpPreview() {
    const cv = $('spCanvas'), c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    const slot = AL.slotById($('spSlot').value);
    const f = spForm(), sp = { name: f.name || 'Nama Merek', tagline: f.tagline, c1: f.c1, c2: f.c2 };
    if (!slot) { $('spCaption').textContent = 'Pilih slot untuk melihat pratinjau'; return; }
    $('spCaption').textContent = slot.label;
    const tile = (p, x, y, col) => p.poly([[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], col, true);
    if (slot.kind === 'papan') {
      const p = new AL.Painter(c, 1.6, 160, 100, false);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) tile(p, a, b, '#a6d47f');
      if (slot.face === 'y') for (let a = -1; a <= 1; a++) tile(p, a, 1, '#8e959f');
      else for (let b = -1; b <= 1; b++) tile(p, 1, b, '#8e959f');
      AL.drawBillboard(p, sp, slot.face);
    } else if (slot.kind === 'toko') {
      const p = new AL.Painter(c, 1.2, 160, 70, false);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) tile(p, a, b, '#ddd6c8');
      for (let a = 0; a < 2; a++) tile(p, a, 2, '#8e959f');
      AL.drawBrandShop(p, sp);
    } else {
      const p = new AL.Painter(c, 0.5, 160, 200, false);
      p.box(0.3, 0.3, 1.4, 1.4, 0, 6, '#2f4a6b', { win: true, seed: 3, glass: '#86b6dc', fh: 0.28, gap: 0.2, ww: 0.15 });
      const top = p.P(1, 1, 6.1);
      AL.drawHoloPanel(c, sp, top[0], top[1], 1, 0);
    }
  }
  ['spSlot', 'spName', 'spTagline', 'spC1', 'spC2'].forEach(id => $(id).addEventListener('input', drawSpPreview));
  function resetSp() {
    $('spForm').reset(); $('spId').value = '';
    $('spStart').value = dayStr(0); $('spEnd').value = dayStr(30);
    $('spSave').textContent = 'Pasang sponsor'; $('spCancel').hidden = true;
    drawSpPreview();
  }
  $('spCancel').addEventListener('click', resetSp);
  $('spForm').addEventListener('submit', async e => {
    e.preventDefault();
    const editing = !!$('spId').value;
    try { await call('sponsor', spForm()); resetSp(); await loadSponsor(); toast(editing ? 'Sponsor diperbarui' : 'Sponsor terpasang'); }
    catch (er) { toast(er.message, true); }
  });
  $('spPreviewLink').addEventListener('click', () => {
    const f = spForm();
    if (!f.slot || !f.name) return toast('Isi slot dan nama merek dulu', true);
    const url = location.origin + '/?pratinjau=' + AL.encodePreview(f);
    navigator.clipboard.writeText(url).then(() => toast('Tautan pratinjau disalin. Kirim ke calon mitra.'), () => toast('Gagal menyalin', true));
  });
  $('sponsors').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-sp]'), del = e.target.closest('[data-del-sp]');
    if (ed) {
      const s = spData.sponsors.find(x => x.id === +ed.dataset.editSp);
      $('spId').value = s.id; $('spSlot').value = s.slot; $('spName').value = s.name; $('spTagline').value = s.tagline;
      $('spC1').value = s.c1; $('spC2').value = s.c2; $('spLink').value = s.link; $('spStart').value = s.start_date; $('spEnd').value = s.end_date; $('spNote').value = s.note;
      $('spSave').textContent = 'Simpan perubahan'; $('spCancel').hidden = false; drawSpPreview(); $('spName').focus();
    } else if (del && confirm('Hapus sponsor ini dari kota?')) {
      try { await call('sponsor/hapus', { id: +del.dataset.delSp }); await loadSponsor(); toast('Sponsor dihapus'); } catch (er) { toast(er.message, true); }
    }
  });

  // ---------- Kabar & Kalender ----------
  let kab = { posts: [], events: [] };
  const fmtTgl = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  async function loadKabar() {
    kab = await call('kabar');
    $('posts').innerHTML = kab.posts.length ? kab.posts.map(p => `
      <li><span class="tag ${p.kind}">${p.kind}</span>${p.pinned ? '<span class="tag pin">disematkan</span>' : ''}
      <b>${esc(p.title)}</b><small>${fmt(p.created_at)}</small>
      <span class="acts"><button class="btn ghost sm" data-edit-post="${p.id}">Edit</button>
      <button class="btn danger sm" data-del-post="${p.id}">Hapus</button></span></li>`).join('')
      : '<li class="empty">Belum ada kabar.</li>';
    $('events').innerHTML = kab.events.length ? kab.events.map(e => `
      <li><b>${esc(e.title)}</b><small>${fmtTgl(e.date)}${e.time ? ' · ' + e.time : ''}${e.place ? ' · ' + esc(e.place) : ''}${e.date < kab.today ? ' · sudah lewat' : ''}</small>
      <span class="acts"><button class="btn ghost sm" data-edit-event="${e.id}">Edit</button>
      <button class="btn danger sm" data-del-event="${e.id}">Hapus</button></span></li>`).join('')
      : '<li class="empty">Belum ada acara.</li>';
  }
  function resetPost() {
    $('postForm').reset(); $('postId').value = '';
    $('postSave').textContent = 'Terbitkan'; $('postCancel').hidden = true;
  }
  function resetEvent() {
    $('eventForm').reset(); $('eventId').value = '';
    $('eventSave').textContent = 'Tambah acara'; $('eventCancel').hidden = true;
  }
  $('postForm').addEventListener('submit', async e => {
    e.preventDefault();
    const editing = !!$('postId').value;
    try {
      await call('kabar', { id: $('postId').value || undefined, kind: $('postKind').value, title: $('postTitle').value, body: $('postBody').value, link: $('postLink').value, pinned: $('postPinned').checked });
      resetPost(); await loadKabar(); toast(editing ? 'Kabar diperbarui' : 'Kabar terbit');
    } catch (er) { toast(er.message, true); }
  });
  $('eventForm').addEventListener('submit', async e => {
    e.preventDefault();
    const editing = !!$('eventId').value;
    try {
      await call('acara', { id: $('eventId').value || undefined, title: $('eventTitle').value, date: $('eventDate').value, time: $('eventTime').value, place: $('eventPlace').value, note: $('eventNote').value });
      resetEvent(); await loadKabar(); toast(editing ? 'Acara diperbarui' : 'Acara ditambahkan');
    } catch (er) { toast(er.message, true); }
  });
  $('postCancel').addEventListener('click', resetPost);
  $('eventCancel').addEventListener('click', resetEvent);
  $('posts').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-post]'), del = e.target.closest('[data-del-post]');
    if (ed) {
      const p = kab.posts.find(x => x.id === +ed.dataset.editPost);
      $('postId').value = p.id; $('postKind').value = p.kind; $('postTitle').value = p.title; $('postBody').value = p.body;
      $('postLink').value = p.link; $('postPinned').checked = !!p.pinned;
      $('postSave').textContent = 'Simpan perubahan'; $('postCancel').hidden = false; $('postTitle').focus();
    } else if (del && confirm('Hapus kabar ini?')) {
      try { await call('kabar/hapus', { id: +del.dataset.delPost }); await loadKabar(); toast('Kabar dihapus'); } catch (er) { toast(er.message, true); }
    }
  });
  $('events').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit-event]'), del = e.target.closest('[data-del-event]');
    if (ed) {
      const v = kab.events.find(x => x.id === +ed.dataset.editEvent);
      $('eventId').value = v.id; $('eventTitle').value = v.title; $('eventDate').value = v.date; $('eventTime').value = v.time;
      $('eventPlace').value = v.place; $('eventNote').value = v.note;
      $('eventSave').textContent = 'Simpan perubahan'; $('eventCancel').hidden = false; $('eventTitle').focus();
    } else if (del && confirm('Hapus acara ini?')) {
      try { await call('acara/hapus', { id: +del.dataset.delEvent }); await loadKabar(); toast('Acara dihapus'); } catch (er) { toast(er.message, true); }
    }
  });
  const checked = () => [...$('pending').querySelectorAll('input:checked')].map(i => i.value);

  async function act(path, body, okMsg) {
    try { const r = await call(path, body); await refresh(); if (okMsg) toast(okMsg(r)); }
    catch (e) { toast(e.message, true); }
  }
  function toast(t, err) {
    const el = document.createElement('div');
    el.className = 'toast' + (err ? ' err' : '');
    el.textContent = t;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  $('login').addEventListener('submit', async e => {
    e.preventDefault();
    token = $('token').value.trim();
    try {
      await refresh();
      try { sessionStorage.setItem(KEY, token); } catch (er) { /* abaikan */ }
      $('login').hidden = true; $('app').hidden = false; $('loginErr').hidden = true;
    } catch (er) { $('loginErr').hidden = false; $('loginErr').textContent = er.message; }
  });
  $('selAll').addEventListener('click', () => {
    const boxes = [...$('pending').querySelectorAll('input')];
    const all = boxes.every(b => b.checked);
    boxes.forEach(b => { b.checked = !all; });
  });
  $('approve').addEventListener('click', () => {
    const us = checked();
    if (!us.length) return toast('Pilih pendaftar dulu', true);
    act('setujui', { usernames: us, instant: $('instant').checked }, r => {
      const n = r.approved.length;
      if (!n) return 'Tidak ada yang disetujui';
      return $('instant').checked ? `${n} warga baru` : `${n} warga dijadwalkan, kapal pertama ${fmt(r.approved[0].arriveAt)}`;
    });
  });
  $('reject').addEventListener('click', () => {
    const us = checked();
    if (!us.length) return toast('Pilih pendaftar dulu', true);
    if (!confirm(`Tolak ${us.length} pendaftar?`)) return;
    act('tolak', { usernames: us }, r => `${r.changed} ditolak`);
  });
  $('leaving').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'hapus' && !confirm(`Hapus @${b.dataset.u} dari kota? Namanya hilang dari peta dan pencarian.`)) return;
    act(b.dataset.act, { usernames: [b.dataset.u] }, r => (b.dataset.act === 'hapus' ? 'Dihapus' : 'Diabaikan'));
  });
  $('importBtn').addEventListener('click', async () => {
    const text = $('importText').value;
    if (!text.trim()) return;
    try {
      const r = await call('impor', { text, instant: $('importInstant').checked });
      $('importMsg').hidden = false;
      $('importMsg').textContent = `Ditambahkan ${r.added}, dilewati ${r.skipped} (sudah ada)` + (r.invalid.length ? `, tidak valid ${r.invalid.length}: ${r.invalid.slice(0, 5).join(', ')}` : '') + '.';
      $('importText').value = '';
      refresh();
    } catch (e) { toast(e.message, true); }
  });
  let findT = 0;
  $('findQ').addEventListener('input', () => {
    clearTimeout(findT);
    findT = setTimeout(async () => {
      const q = $('findQ').value.trim().replace(/^@/, '');
      if (!q) { $('found').innerHTML = ''; return; }
      try {
        const { rows } = await call('cari?q=' + encodeURIComponent(q));
        $('found').innerHTML = rows.length ? rows.map(r => `
          <li><b>@${esc(r.username)}</b><small>${esc(r.status)}${r.seq ? ' · #' + r.seq : ''}${r.arrive_at ? ' · tiba ' + fmt(r.arrive_at) : ''}${r.has_code ? ' · punya KTW' : ''}${r.muted ? ' · dibisukan' : ''}</small>
          <span class="acts">
          ${r.status === 'approved' ? `<button class="btn ghost sm" data-act="kode" data-u="${esc(r.username)}">${r.has_code ? 'Buat ulang kode KTW' : 'Buat kode KTW'}</button>
          <button class="btn ghost sm" data-act="bisukan" data-on="${r.muted ? 0 : 1}" data-u="${esc(r.username)}">${r.muted ? 'Buka bisu' : 'Bisukan'}</button>
          <button class="btn ghost sm" data-act="koin" data-u="${esc(r.username)}">Beri koin</button>` : ''}
          ${r.status === 'approved' || r.status === 'pending' ? `<button class="btn danger sm" data-act="hapus" data-u="${esc(r.username)}">Hapus</button>` : ''}
          </span></li>`).join('')
          : '<li class="empty">Tidak ditemukan.</li>';
      } catch (e) { toast(e.message, true); }
    }, 250);
  });
  const reFind = () => $('findQ').dispatchEvent(new Event('input'));
  $('found').addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const u = b.dataset.u;
    if (b.dataset.act === 'hapus') {
      if (!confirm(`Hapus @${u} dari kota?`)) return;
      return act('hapus', { usernames: [u] }, () => 'Dihapus').then(reFind);
    }
    if (b.dataset.act === 'koin') {
      const jml = prompt(`Beri berapa koin ke @${u}? (minus untuk koreksi, maks 100.000)`, '500');
      if (jml === null) return;
      const note = prompt('Catatan (tampil di riwayat dompet warga):', 'Hadiah lomba') || '';
      return act('koin', { usernames: [u], amount: +jml, note }, r => (r.changed ? `@${u} menerima ${(+jml).toLocaleString('id-ID')} koin` : 'Warga belum tiba di kota'));
    }
    if (b.dataset.act === 'bisukan') {
      const on = b.dataset.on === '1';
      return act('bisukan', { usernames: [u], on }, () => (on ? `@${u} dibisukan` : `@${u} bisa ngobrol lagi`)).then(reFind);
    }
    if (b.dataset.act === 'kode') {
      if (b.textContent.includes('ulang') && !confirm(`Buat kode baru untuk @${u}? Kode lama tidak berlaku lagi.`)) return;
      try {
        const r = await call('kode', { usernames: [u] });
        showCode(r.username, r.kode);
        reFind();
      } catch (er) { toast(er.message, true); }
    }
  });
  // kode KTW hanya tampil sekali: server menyimpan hash-nya saja
  function showCode(u, kode) {
    const box = $('codeBox');
    box.hidden = false;
    box.innerHTML = `<p>Kode KTW <b>@${esc(u)}</b> (tampil sekali, kirim lewat DM):</p>
      <p class="code">${esc(kode)}</p>
      <div class="acts"><button class="btn sm" type="button" id="copyCode">Salin pesan DM</button>
      <button class="btn ghost sm" type="button" id="closeCode">Tutup</button></div>`;
    const dm = `Halo @${u}! Kode KTW AUDIRA LAND kamu: ${kode}. Masuk di ${location.origin}/taman.html pakai username Instagram + kode ini. Jangan bagikan ke orang lain.`;
    $('copyCode').onclick = () => navigator.clipboard.writeText(dm).then(() => toast('Pesan DM disalin'), () => toast('Gagal menyalin, salin manual', true));
    $('closeCode').onclick = () => { box.hidden = true; box.innerHTML = ''; };
  }

  if (token) refresh().then(() => { $('login').hidden = true; $('app').hidden = false; }).catch(() => logout());
})();
