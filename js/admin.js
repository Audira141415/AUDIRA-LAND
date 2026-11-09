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
  // modul admin tambahan (js/admin-*.js) memakai ini; mereka mendaftar di window.ADMIN_MODS = [fn(api)] dan
  // dipanggil sekali setelah admin masuk. Tiap modul menambah <section class="panel"> sendiri ke #adminExtra.
  window.ADMIN = { call, esc, fmt, toast: (t, err) => toast(t, err), root: () => $('adminExtra') };

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
    // panel modul fitur: satu yang gagal tidak menghalangi yang lain
    const res = await Promise.allSettled([loadLomba(), loadVoting(), loadCorong(), loadCetak(), loadLapor()]);
    res.forEach(r => { if (r.status === 'rejected') { console.error(r.reason); toast(r.reason.message, true); } });
  }

  // ---------- waktu WIB (input datetime-local dibaca sebagai WIB, bukan zona peramban) ----------
  const WIB = 7 * 3600e3;
  const fmtW = ms => new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';
  const toInp = ms => new Date(ms + WIB).toISOString().slice(0, 16);
  const fromInp = v => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - WIB : 0;
  };
  const nextHour = (h = 0) => Math.ceil(Date.now() / 3600e3) * 3600e3 + h * 3600e3;
  // jam tertentu (WIB) beberapa hari dari sekarang
  const atWib = (days, hour) => Math.floor((Date.now() + WIB) / 86400e3) * 86400e3 - WIB + days * 86400e3 + hour * 3600e3;
  const num = n => (+n || 0).toLocaleString('id-ID');

  // ---------- Lomba & Event ----------
  let lb = { games: {}, lomba: [] };
  const LB_TAG = { akan: ['terjadwal', 'akan datang'], jalan: ['aktif', 'berjalan'], selesai: ['selesai', 'selesai'] };
  const bisaJuara = l => !l.winners_at && (l.game ? l.status === 'selesai' : l.status !== 'akan');
  async function loadLomba() {
    lb = await call('lomba');
    const sel = $('lbKind'), keep = sel.value;
    sel.innerHTML = '<option value="bebas">Lomba bebas (pemenang ditulis admin)</option>' +
      Object.entries(lb.games).map(([k, g]) => `<option value="kerja:${esc(k)}">Mini-game ${esc(g.name)} (papan otomatis, ${esc(g.unit)})</option>`).join('');
    if (keep) sel.value = keep;
    if (!$('lbStart').value) { $('lbStart').value = toInp(nextHour(1)); $('lbEnd').value = toInp(nextHour(1 + 7 * 24)); }
    $('lbList').innerHTML = lb.lomba.length ? lb.lomba.map(l => {
      const [cls, txt] = LB_TAG[l.status] || ['', l.status];
      const unit = l.unit ? ' ' + esc(l.unit) : '';
      const papan = l.papan && l.papan.length ? ' · Papan: ' + l.papan.slice(0, 3).map(r => `${r.rank}. @${esc(r.u)} (${num(r.score)}${unit})`).join(', ') : '';
      const juara = l.winners.length ? ' · Juara: ' + l.winners.map(w => `${w.rank}. @${esc(w.u)}${w.koin ? ' +' + num(w.koin) + ' koin' : ''}`).join(', ') : '';
      return `<li class="stack"><span class="tag ${cls}">${txt}</span><b>${esc(l.title)}</b>
        <small>${esc(l.kindLabel)} · ${fmtW(l.start_at)} s/d ${fmtW(l.end_at)}${l.peserta != null ? ' · ' + l.peserta + ' peserta' : ''}${papan}${juara}${l.prize ? ' · Hadiah: ' + esc(l.prize) : ''}</small>
        <span class="acts">${l.winners_at ? '' : `<button class="btn ghost sm" type="button" data-lb-edit="${l.id}">Edit</button>`}
        ${bisaJuara(l) ? `<button class="btn sm" type="button" data-lb-win="${l.id}">Tetapkan pemenang</button>` : ''}
        <button class="btn danger sm" type="button" data-lb-del="${l.id}">Hapus</button></span></li>`;
    }).join('') : '<li class="empty">Belum ada lomba.</li>';
  }
  function resetLb() {
    $('lbForm').reset(); $('lbId').value = '';
    $('lbStart').value = toInp(nextHour(1)); $('lbEnd').value = toInp(nextHour(1 + 7 * 24));
    $('lbSave').textContent = 'Buat lomba'; $('lbCancel').hidden = true;
  }
  $('lbCancel').addEventListener('click', resetLb);
  $('lbForm').addEventListener('submit', async e => {
    e.preventDefault();
    const editing = !!$('lbId').value;
    const body = {
      id: $('lbId').value ? +$('lbId').value : undefined, title: $('lbTitle').value, kind: $('lbKind').value,
      start_at: fromInp($('lbStart').value), end_at: fromInp($('lbEnd').value), prize: $('lbPrize').value, descr: $('lbDescr').value,
    };
    if (body.start_at <= Date.now() && !confirm('Waktu mulai sudah lewat: lomba langsung berjalan dan pengumuman Koran dibuat sekarang. Lanjut?')) return;
    try { await call('lomba', body); resetLb(); await loadLomba(); toast(editing ? 'Lomba diperbarui' : 'Lomba dibuat'); }
    catch (er) { toast(er.message, true); }
  });
  let lbWinId = 0;
  function winRow(u = '') {
    if ($('lbWinRows').children.length >= 10) return toast('Maksimal 10 juara', true);
    const d = document.createElement('div');
    d.className = 'win-row';
    d.innerHTML = `<span class="rank"></span><input class="w-u" maxlength="31" placeholder="username" value="${esc(u)}">
      <input class="w-k" type="number" min="0" max="100000" step="1" placeholder="koin (0)">
      <input class="w-n" maxlength="80" placeholder="catatan (opsional)">
      <button class="btn ghost sm" type="button" data-w-del>Hapus</button>`;
    $('lbWinRows').appendChild(d);
    renumWin();
  }
  const renumWin = () => [...$('lbWinRows').children].forEach((r, i) => { r.querySelector('.rank').textContent = 'Juara ' + (i + 1); });
  function closeWin() { lbWinId = 0; $('lbWin').hidden = true; $('lbWinRows').innerHTML = ''; }
  $('lbWinAdd').addEventListener('click', () => winRow());
  $('lbWinCancel').addEventListener('click', closeWin);
  $('lbWinRows').addEventListener('click', e => {
    if (!e.target.closest('[data-w-del]')) return;
    e.target.closest('.win-row').remove(); renumWin();
  });
  $('lbWinSave').addEventListener('click', async () => {
    const winners = [...$('lbWinRows').children].map(r => ({
      u: r.querySelector('.w-u').value.trim().replace(/^@+/, ''), koin: Math.floor(+r.querySelector('.w-k').value || 0), note: r.querySelector('.w-n').value.trim(),
    })).filter(w => w.u);
    if (!winners.length) return toast('Isi minimal satu pemenang', true);
    const koin = winners.reduce((a, w) => a + w.koin, 0);
    if (!confirm(`Tetapkan ${winners.length} pemenang${koin ? ` dan bayar total ${num(koin)} koin` : ''}? Tidak bisa diubah lagi.`)) return;
    try {
      const r = await call('lomba/pemenang', { id: lbWinId, winners, umumkan: $('lbWinAnn').checked });
      closeWin(); await loadLomba();
      toast(`Pemenang ditetapkan${r.dibayar ? `, koin dibayar ke ${r.dibayar} juara` : ''}`);
    } catch (er) { toast(er.message, true); }
  });
  $('lbList').addEventListener('click', async e => {
    const ed = e.target.closest('[data-lb-edit]'), win = e.target.closest('[data-lb-win]'), del = e.target.closest('[data-lb-del]');
    if (ed) {
      const l = lb.lomba.find(x => x.id === +ed.dataset.lbEdit);
      if (!l) return;
      $('lbId').value = l.id; $('lbTitle').value = l.title; $('lbKind').value = l.kind; $('lbPrize').value = l.prize; $('lbDescr').value = l.descr;
      $('lbStart').value = toInp(l.start_at); $('lbEnd').value = toInp(l.end_at);
      $('lbSave').textContent = 'Simpan perubahan'; $('lbCancel').hidden = false; $('lbTitle').focus();
    } else if (win) {
      const l = lb.lomba.find(x => x.id === +win.dataset.lbWin);
      if (!l) return;
      closeWin(); lbWinId = l.id;
      $('lbWinTitle').textContent = 'Pemenang: ' + l.title;
      const top = (l.papan || []).slice(0, 3);
      if (top.length) top.forEach(r => winRow(r.u)); else winRow();
      $('lbWin').hidden = false;
      $('lbWin').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (del) {
      const l = lb.lomba.find(x => x.id === +del.dataset.lbDel);
      if (!l || !confirm(`Hapus lomba "${l.title}"? Pengumuman di Koran (jika ada) tidak ikut terhapus.`)) return;
      try { await call('lomba/hapus', { id: l.id }); if (lbWinId === l.id) closeWin(); await loadLomba(); toast('Lomba dihapus'); }
      catch (er) { toast(er.message, true); }
    }
  });

  // ---------- Voting ----------
  async function loadVoting() {
    const d = await call('voting');
    if (!$('vtEnd').value) $('vtEnd').value = toInp(atWib(3, 20));
    $('vtList').innerHTML = d.polls.length ? d.polls.map(p => `
      <li><span class="tag ${p.done ? 'selesai' : 'aktif'}">${p.done ? 'selesai' : 'berjalan'}</span><b>${esc(p.question)}</b>
      <small>${p.done ? 'Selesai' : 'Sampai'} ${fmtW(p.ends_at)} · ${num(p.total)} suara${p.done && p.announced ? ' · sudah diumumkan' : ''}</small>
      <span class="acts">${p.done ? '' : `<button class="btn ghost sm" type="button" data-vt-close="${p.id}">Tutup sekarang</button>`}
      <button class="btn danger sm" type="button" data-vt-del="${p.id}">Hapus</button></span>
      <div class="bars">${p.options.map((o, i) => `<div class="bar"><span>${esc(o)}</span><progress max="100" value="${p.pct[i]}"></progress><em>${num(p.counts[i])} · ${p.pct[i]}%</em></div>`).join('')}</div></li>`).join('')
      : '<li class="empty">Belum ada polling.</li>';
  }
  $('vtForm').addEventListener('submit', async e => {
    e.preventDefault();
    const options = $('vtOpts').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 6) return toast('Pilihan harus 2–6 baris', true);
    try {
      await call('voting', { question: $('vtQ').value, options, ends_at: fromInp($('vtEnd').value) });
      $('vtForm').reset(); $('vtEnd').value = toInp(atWib(3, 20));
      await loadVoting(); toast('Polling dibuat');
    } catch (er) { toast(er.message, true); }
  });
  $('vtList').addEventListener('click', async e => {
    const cl = e.target.closest('[data-vt-close]'), del = e.target.closest('[data-vt-del]');
    try {
      if (cl && confirm('Tutup polling sekarang? Hasilnya langsung diumumkan di Koran.')) { await call('voting/tutup', { id: +cl.dataset.vtClose }); await loadVoting(); toast('Polling ditutup'); }
      else if (del && confirm('Hapus polling ini beserta semua suaranya? Pengumuman Koran (jika ada) tidak ikut terhapus.')) { await call('voting/hapus', { id: +del.dataset.vtDel }); await loadVoting(); toast('Polling dihapus'); }
    } catch (er) { toast(er.message, true); }
  });

  // ---------- Corong Kota ----------
  const CR_TXT = { menunggu: 'menunggu', antre: 'antre', tayang: 'tayang', selesai: 'selesai', ditolak: 'ditolak', batal: 'batal' };
  const crWho = r => (r.source === 'admin' ? 'Admin' : '@' + esc(r.username));
  async function loadCorong() {
    const d = await call('corong');
    const link = d.saweria ? `<a href="${esc(d.saweria)}" target="_blank" rel="noopener noreferrer">Buka Saweria</a>` : 'SAWERIA_URL belum diatur di server/.env.';
    $('crInfo').innerHTML = `Siaran tampil ${d.durasi} detik di atas peta dan Taman. ${d.harga ? 'Harga: ' + esc(d.harga) + '. ' : ''}Cocokkan nama/kode donasi dengan Saweria sebelum menyetujui. ${link}`;
    const nMenunggu = d.aktif.filter(r => r.status === 'menunggu').length;
    $('crCount').textContent = nMenunggu;
    $('crCountNav').textContent = nMenunggu; $('crCountNav').hidden = !nMenunggu;
    $('crList').innerHTML = d.aktif.length ? d.aktif.map(r => {
      const sisa = r.status === 'tayang' ? ` · ${Math.max(0, Math.ceil((r.end_at - d.now) / 1000))} dtk lagi` : '';
      const acts = r.status === 'menunggu'
        ? `<button class="btn sm" type="button" data-cr="setujui" data-id="${r.id}">Setujui</button><button class="btn danger sm" type="button" data-cr="tolak" data-id="${r.id}">Tolak</button>`
        : r.status === 'antre' ? `<button class="btn ghost sm" type="button" data-cr="batal" data-id="${r.id}">Batalkan</button>`
        : `<button class="btn danger sm" type="button" data-cr="henti" data-id="${r.id}">Hentikan</button>`;
      return `<li><span class="tag ${r.status}">${CR_TXT[r.status] || esc(r.status)}</span><b>${crWho(r)}</b>
        <small>“${esc(r.text)}”${r.donor ? ` · donasi: <b>${esc(r.donor)}</b>` : ''} · ${fmtW(r.created_at)}${sisa}</small>
        <span class="acts">${acts}</span></li>`;
    }).join('') : '<li class="empty">Tidak ada pengajuan, antrean, atau siaran berjalan.</li>';
    $('crHist').innerHTML = d.riwayat.length ? d.riwayat.map(r => `
      <li><span class="tag ${r.status}">${CR_TXT[r.status] || esc(r.status)}</span><b>${crWho(r)}</b>
      <small>“${esc(r.text)}”${r.donor ? ' · donasi: ' + esc(r.donor) : ''} · ${fmtW(r.start_at || r.created_at)}${r.note ? ' · ' + esc(r.note) : ''}</small></li>`).join('')
      : '<li class="empty">Belum ada riwayat.</li>';
  }
  $('crReload').addEventListener('click', () => loadCorong().catch(er => toast(er.message, true)));
  $('crForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await call('corong/siar', { text: $('crText').value }); $('crText').value = ''; await loadCorong(); toast('Siaran masuk paling depan antrean'); }
    catch (er) { toast(er.message, true); }
  });
  $('crList').addEventListener('click', async e => {
    const b = e.target.closest('[data-cr]');
    if (!b) return;
    const id = +b.dataset.id, act = b.dataset.cr;
    let body = { id };
    if (act === 'tolak') {
      const note = prompt('Alasan menolak (dilihat warga, opsional):', 'Donasi tidak ditemukan');
      if (note === null) return;
      body.note = note;
    } else if (act === 'batal') {
      const note = prompt('Alasan membatalkan (opsional):', 'Dibatalkan admin');
      if (note === null) return;
      body.note = note;
    } else if (act === 'henti' && !confirm('Hentikan siaran yang sedang tayang?')) return;
    try {
      await call('corong/' + (act === 'henti' ? 'batal' : act), body);
      await loadCorong();
      toast({ setujui: 'Masuk antrean siaran', tolak: 'Pengajuan ditolak', batal: 'Dibatalkan', henti: 'Siaran dihentikan' }[act]);
    } catch (er) { toast(er.message, true); }
  });
  // antrean maju sendiri tiap 30 dtk: segarkan panel selama halaman admin terbuka
  setInterval(() => { if (token && !$('app').hidden && !document.hidden) loadCorong().catch(() => {}); }, 15e3);

  // ---------- Cetak Biru ----------
  let ct = { cetak: [] };
  const CT_CONTOH = [
    ['bidang', 0, 0, 2, 2, '#d9cfb8'],
    ['kotak', 0.3, 0.3, 1.4, 1.2, 1.4, '#e8d9b5'],
    ['jendela', 0.3, 0.3, 1.4, 1.2, 1.4, '#86b6dc'],
    ['atap', 0.25, 0.25, 1.5, 1.3, 1.4, 0.6, '#c0573e', 'x'],
    ['teks', 0.5, 1.5, 0.25, 0.16, 'BALAI WARGA', '#14324a'],
    ['pohon', 1.75, 1.75, 0.5],
  ];
  const ctJson = g => '[\n' + g.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n]';
  const lotOf = n => (Number.isInteger(n) && n >= 0 && AL.lots ? AL.lots[n] : null);
  function lotText(l) {
    if (!l) return '';
    const jenis = (AL.LABEL && AL.LABEL[l.type]) || l.type;
    const distrik = (AL.DISTRICT && AL.DISTRICT[l.district]) || l.district;
    return `${l.name ? l.name + ' · ' : ''}${jenis} · ${distrik} · ${l.street} No. ${l.num} · petak (${l.x}, ${l.y})`;
  }
  function showLot() {
    const raw = $('ctLot').value, n = raw === '' ? -1 : +raw, l = lotOf(n);
    const ada = l && ct.cetak.find(c => c.lot === l.id);
    $('ctLotInfo').textContent = raw === '' ? `Isi nomor kavling (0–${AL.lots ? AL.lots.length - 1 : '?'}).`
      : !l ? 'Kavling tidak ada di peta.'
      : lotText(l) + (ada ? ` · sudah punya cetak biru "${ada.nama}" (akan diganti)` : '');
  }
  function cekCetak() {
    const t = $('ctG').value.trim(), box = $('ctCheck');
    if (!t) { box.hidden = true; return null; }
    const v = AL.cetakValidasi(t);
    box.hidden = false;
    box.className = 'msg full' + (v.ok ? '' : ' err');
    box.textContent = v.ok ? `Valid: ${v.g.length} primitif, puncak setinggi ${v.top} petak.` : v.error;
    return v.ok ? v : null;
  }
  async function loadCetak() {
    ct = await call('cetak');
    if (AL.lots) $('ctLot').max = AL.lots.length - 1;
    $('ctList').innerHTML = ct.cetak.length ? ct.cetak.map(c => `
      <li><b>${esc(c.nama)}</b>${c.jenis ? `<span class="tag">${esc(c.jenis)}</span>` : ''}
      <small>${esc(c.lot)}${c.kavling ? ' · ' + esc(lotText(lotOf(+c.lot.slice(3))) || c.kavling.type) : ''} · ${c.g.length} primitif · ${fmtW(c.updated_at)}</small>
      <span class="acts"><button class="btn ghost sm" type="button" data-ct-edit="${esc(c.lot)}">Edit</button>
      <button class="btn danger sm" type="button" data-ct-del="${esc(c.lot)}">Hapus</button></span></li>`).join('')
      : '<li class="empty">Belum ada cetak biru. Semua kavling memakai bangunan biasa.</li>';
    showLot();
  }
  let ctT = 0;
  $('ctG').addEventListener('input', () => { clearTimeout(ctT); ctT = setTimeout(cekCetak, 250); });
  $('ctLot').addEventListener('input', showLot);
  $('ctContoh').addEventListener('click', () => {
    if ($('ctG').value.trim() && !confirm('Ganti isi primitif dengan contoh?')) return;
    $('ctG').value = ctJson(CT_CONTOH); cekCetak();
  });
  $('ctReset').addEventListener('click', () => { $('ctForm').reset(); $('ctCheck').hidden = true; showLot(); });
  $('ctForm').addEventListener('submit', async e => {
    e.preventDefault();
    const l = lotOf(+$('ctLot').value);
    if (!l) return toast('Kavling tidak ada di peta', true);
    const v = cekCetak();
    if (!v) return toast('Perbaiki primitif dulu', true);
    const ada = ct.cetak.find(c => c.lot === l.id);
    if (ada && !confirm(`${l.id} sudah punya cetak biru "${ada.nama}". Ganti?`)) return;
    try {
      const r = await call('cetak', { lot: l.id, nama: $('ctNama').value, jenis: $('ctJenis').value, g: v.g });
      await loadCetak(); toast(`Cetak biru ${r.lot} disimpan (${r.n} primitif)`);
    } catch (er) { toast(er.message, true); }
  });
  $('ctList').addEventListener('click', async e => {
    const ed = e.target.closest('[data-ct-edit]'), del = e.target.closest('[data-ct-del]');
    if (ed) {
      const c = ct.cetak.find(x => x.lot === ed.dataset.ctEdit);
      if (!c) return;
      $('ctLot').value = c.lot.slice(3); $('ctNama').value = c.nama; $('ctJenis').value = c.jenis; $('ctG').value = ctJson(c.g);
      showLot(); cekCetak(); $('ctNama').focus();
    } else if (del && confirm(`Hapus cetak biru ${del.dataset.ctDel}? Kavling kembali ke bangunan biasa.`)) {
      try { await call('cetak/hapus', { lot: del.dataset.ctDel }); await loadCetak(); toast('Cetak biru dihapus'); }
      catch (er) { toast(er.message, true); }
    }
  });

  // ---------- Laporan warga (Surat) ----------
  const ALASAN = { spam: 'spam', kasar: 'kasar', mengganggu: 'mengganggu', lainnya: 'lainnya' };
  async function loadLapor() {
    const st = $('lpStatus').value;
    const d = await call('surat/laporan?status=' + st);
    if (st === 'baru') { $('lpCount').textContent = d.laporan.length; $('lpCountNav').textContent = d.laporan.length; $('lpCountNav').hidden = !d.laporan.length; }
    $('lpList').innerHTML = d.laporan.length ? d.laporan.map(r => `
      <li><span class="tag ${r.alasan === 'kasar' ? 'pengumuman' : ''}">${ALASAN[r.alasan] || esc(r.alasan)}</span><b>@${esc(r.target)}</b>
      <small>dilaporkan @${esc(r.pelapor)} · ${fmtW(r.created_at)}${r.catatan ? ' · “' + esc(r.catatan) + '”' : ''}</small>
      <span class="acts"><button class="btn ghost sm" type="button" data-lp="bisukan" data-u="${esc(r.target)}">Bisukan</button>
      <button class="btn danger sm" type="button" data-lp="hapus-semua" data-u="${esc(r.target)}">Hapus semua suratnya</button>
      ${r.status === 'baru' ? `<button class="btn sm" type="button" data-lp="selesai" data-id="${r.id}">Tandai selesai</button>` : ''}</span>
      <div class="bukti">${r.bukti.length ? r.bukti.map(b => `<p><small>${fmtW(b.t)}</small><span>${esc(b.isi)}</span>
        <button class="btn ghost sm" type="button" data-lp="hapus-pesan" data-id="${b.id}">Hapus surat</button></p>`).join('')
        : `<p class="empty">Tidak ada surat dari @${esc(r.target)} ke pelapor.</p>`}</div></li>`).join('')
      : `<li class="empty">${st === 'baru' ? 'Tidak ada laporan baru.' : 'Belum ada laporan selesai.'}</li>`;
  }
  $('lpStatus').addEventListener('change', () => loadLapor().catch(er => toast(er.message, true)));
  $('lpList').addEventListener('click', async e => {
    const b = e.target.closest('[data-lp]');
    if (!b) return;
    const u = b.dataset.u, id = +b.dataset.id;
    try {
      if (b.dataset.lp === 'bisukan') {
        if (!confirm(`Bisukan @${u}? Tidak bisa ngobrol di Taman/Pesta dan menulis pesan stiker. Buka lagi lewat Cari warga.`)) return;
        await call('bisukan', { usernames: [u], on: true }); toast(`@${u} dibisukan`);
      } else if (b.dataset.lp === 'hapus-semua') {
        if (!confirm(`Hapus SEMUA surat yang pernah dikirim @${u} ke siapa pun? Tidak bisa dibatalkan.`)) return;
        const r = await call('surat/hapus-pesan', { dari: u }); toast(`${r.changed} surat dihapus`);
      } else if (b.dataset.lp === 'hapus-pesan') {
        if (!confirm('Hapus surat ini dari kotak surat kedua warga?')) return;
        const r = await call('surat/hapus-pesan', { id });
        b.disabled = true; b.textContent = r.changed ? 'Terhapus' : 'Sudah tidak ada';
        toast(r.changed ? 'Surat dihapus' : 'Surat sudah tidak ada');
      } else if (b.dataset.lp === 'selesai') {
        await call('surat/laporan-selesai', { id }); await loadLapor(); toast('Laporan ditandai selesai');
      }
    } catch (er) { toast(er.message, true); }
  });

  // ---------- Stiker rumah ----------
  let stHost = '';
  async function loadStiker() {
    if (!stHost) return;
    const r = await fetch('/api/rumah?u=' + encodeURIComponent(stHost), { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
    $('stList').innerHTML = j.stiker.length ? j.stiker.map(s => `
      <li><span class="emo">${esc(s.e)}</span><b>@${esc(s.guest)}</b>
      <small>ID ${s.id} · ${fmtW(s.t)}${s.msg ? ' · “' + esc(s.msg) + '”' : ''}</small>
      <button class="btn danger sm" type="button" data-st-del="${s.id}">Hapus</button></li>`).join('')
      : `<li class="empty">Rumah @${esc(stHost)} belum punya stiker.</li>`;
  }
  async function hapusStiker(id) {
    const r = await call('rumah/stiker/hapus', { id });
    toast(r.ok ? `Stiker ${id} dihapus` : `Stiker ${id} tidak ditemukan`, !r.ok);
    if (r.ok && stHost) await loadStiker();
  }
  $('stForm').addEventListener('submit', async e => {
    e.preventDefault();
    stHost = $('stHost').value.trim().replace(/^@+/, '').toLowerCase();
    try { await loadStiker(); } catch (er) { $('stList').innerHTML = ''; toast(er.message, true); }
  });
  $('stDelForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = Math.floor(+$('stId').value);
    if (!(id > 0) || !confirm(`Hapus stiker ID ${id}?`)) return;
    try { await hapusStiker(id); $('stId').value = ''; } catch (er) { toast(er.message, true); }
  });
  $('stList').addEventListener('click', async e => {
    const b = e.target.closest('[data-st-del]');
    if (!b || !confirm('Hapus stiker ini?')) return;
    try { await hapusStiker(+b.dataset.stDel); } catch (er) { toast(er.message, true); }
  });

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
      startMods();
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

  let modsOn = false;
  function startMods() {
    if (modsOn) return;
    modsOn = true;
    for (const f of window.ADMIN_MODS || []) { try { f(window.ADMIN); } catch (e) { console.error(e); } }
  }
  // modul admin dimuat setelah file ini: tunggu semua skrip selesai sebelum masuk otomatis
  window.addEventListener('DOMContentLoaded', () => {
    if (token) refresh().then(() => { $('login').hidden = true; $('app').hidden = false; startMods(); }).catch(() => logout());
  });
})();
