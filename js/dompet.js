/* AUDIRA LAND · Dompet warga di peta: saldo berjalan, absen harian, butik aksesori, kirim koin.
   Masuk pakai username + kode KTW (sesi yang sama dengan Taman, disimpan di perangkat). */
(function (AL) {
  'use strict';
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  const esc = AL.esc;
  let token = '', user = '', data = null, items = {}, tab = 'dompet', tickTimer = 0;
  try { token = localStorage.getItem(TK) || ''; user = localStorage.getItem(UK) || ''; } catch (e) { /* abaikan */ }
  const fmt = n => Math.floor(n).toLocaleString('id-ID');
  const SLOT = { kepala: 'Kepala', mata: 'Mata', leher: 'Leher', aura: 'Aura', hewan: 'Hewan pendamping' };
  const KIND = { absen: 'Absen harian', beli: 'Belanja', kirim: 'Kirim ke', terima: 'Dari', hadiah: 'Hadiah', kerja: 'Kerja', juara: 'Hadiah juara', perabot: 'Perabot', lomba: 'Hadiah lomba', damkar: 'Bantu Damkar' };

  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { logout(true); throw new Error(j.error || 'Sesi berakhir, masuk lagi.'); }
    if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
    return j;
  }

  // ---------- kerangka ----------
  const el = {};
  function mount() {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'dompet-btn';
    btn.setAttribute('aria-label', 'Dompet'); btn.title = 'Dompet';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="13.5" r="1.4" fill="currentColor"/></svg><span class="dot" hidden></span>';
    const tools = document.querySelector('.tools');
    tools.insertBefore(btn, tools.firstChild);
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet dompet-sheet'; dlg.setAttribute('aria-labelledby', 'dpTitle');
    dlg.innerHTML = `<div class="dp-in">
      <button class="close" type="button" aria-label="Tutup">×</button>
      <p class="kicker">Dompet warga</p>
      <h2 id="dpTitle">Dompet</h2>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-tab="dompet" aria-selected="true">Saldo</button>
        <button type="button" role="tab" data-tab="butik" aria-selected="false">Butik</button>
        <button type="button" role="tab" data-tab="kirim" aria-selected="false">Kirim</button>
        <button type="button" role="tab" data-tab="lencana" aria-selected="false">Lencana</button>
      </div>
      <div class="dp-body"></div>
      <p class="msg" hidden aria-live="polite"></p>
    </div>`;
    document.body.appendChild(dlg);
    Object.assign(el, { btn, dlg, body: dlg.querySelector('.dp-body'), msg: dlg.querySelector('.msg'), tabs: dlg.querySelector('.tabs'), title: dlg.querySelector('#dpTitle'), dot: btn.querySelector('.dot') });
    btn.addEventListener('click', open);
    dlg.querySelector('.close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => clearInterval(tickTimer));
    el.tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
  }
  function say(text, kind) {
    el.msg.hidden = !text; el.msg.textContent = text || '';
    el.msg.className = 'msg' + (kind ? ' ' + kind : '');
  }
  async function open() {
    say('');
    el.dlg.showModal();
    if (!token) return renderLogin();
    await refresh();
  }
  async function refresh() {
    try {
      if (!Object.keys(items).length) items = (await fetch('/api/butik').then(r => r.json())).items;
      data = await api('/api/dompet');
      data.t0 = Date.now();
      el.dot.hidden = data.absenHariIni;
      setSelfLook(Object.values(data.pakai));
      render();
    } catch (e) { if (token) say(e.message, 'err'); else renderLogin(); }
  }

  // ---------- masuk ----------
  function renderLogin() {
    el.tabs.hidden = true;
    el.title.textContent = 'Masuk sebagai warga';
    el.body.innerHTML = `<form class="dp-login" novalidate>
      <p class="lead">Pakai username Instagram dan kode KTW 8 huruf dari admin AUDIRA. Sesi yang sama dipakai di Taman dan pesta.</p>
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
        token = j.token; user = j.username;
        try { localStorage.setItem(TK, token); localStorage.setItem(UK, user); } catch (er) { /* sesi hanya untuk halaman ini */ }
        if (AL.koran) AL.koran.loadKu();
        say('');
        await refresh();
      } catch (er) { say(er.message, 'err'); }
    });
  }
  function logout(expired) {
    const t = token;
    token = ''; user = ''; data = null;
    try { localStorage.removeItem(TK); localStorage.removeItem(UK); } catch (e) { /* abaikan */ }
    if (!expired && t) fetch('/api/sesi/hapus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }).catch(() => {});
    el.dot.hidden = true;
    if (el.dlg.open) renderLogin();
  }

  // ---------- tampilan ----------
  function lookFor(extra) {
    const r = AL.byName && AL.byName.get(user);
    const base = r ? r.look : AL.mkLook(AL.hash32(user));
    return Object.assign({}, base, { items: extra });
  }
  function setSelfLook(list) {
    const r = AL.byName && AL.byName.get(user);
    if (r) r.look.items = list;
  }
  function render() {
    clearInterval(tickTimer);
    if (!data) return;
    el.tabs.hidden = false;
    el.title.textContent = '@' + user;
    el.tabs.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    if (tab === 'dompet') renderSaldo();
    else if (tab === 'butik') renderButik();
    else if (tab === 'lencana') renderLencana();
    else renderKirim();
  }
  const live = () => data.balance + (Date.now() - data.t0) / 1000 * data.perDetik;
  function renderSaldo() {
    el.body.innerHTML = `
      <div class="dp-card">
        <p class="dp-label">Saldo</p>
        <p class="dp-saldo"><span id="dpSaldo">${fmt(live())}</span> <small>koin</small></p>
        <p class="dp-sub">${esc(data.title)} di ${esc(data.place)} · Lv ${data.lvl} · gaji ${fmt(data.perHari)} koin/hari, masuk tiap detik</p>
      </div>
      <button type="button" class="btn dp-absen" ${data.absenHariIni ? 'disabled' : ''}>${data.absenHariIni ? 'Sudah absen hari ini' : `Absen harian · +${fmt(data.absenKoin)} koin`}</button>
      <h3 class="sub">Riwayat</h3>
      <ul class="dp-hist">${data.riwayat.length ? data.riwayat.map(h => `
        <li><div><b>${esc(KIND[h.kind] || h.kind)}${h.kind === 'kirim' || h.kind === 'terima' ? ' @' + esc(h.ref) : ''}</b><small>${esc(h.note || '')}${h.note ? ' · ' : ''}${new Date(h.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
        <span class="${h.amount < 0 ? 'neg' : 'pos'}">${h.amount < 0 ? '−' : '+'}${fmt(Math.abs(h.amount))}</span></li>`).join('') : '<li class="empty">Belum ada transaksi. Gaji tetap masuk otomatis.</li>'}</ul>
      <p class="dp-note">Koin hanya berlaku di AUDIRA LAND: tidak bisa dibeli dengan uang dan tidak bisa dicairkan. <button type="button" class="link dp-out">Keluar</button></p>`;
    tickTimer = setInterval(() => { const s = document.getElementById('dpSaldo'); if (s) s.textContent = fmt(live()); }, 1000);
    el.body.querySelector('.dp-absen').addEventListener('click', async () => {
      try { const r = await api('/api/dompet/absen', {}); say(`+${fmt(r.koin)} koin. Sampai jumpa besok!`, 'ok'); await refresh(); } catch (e) { say(e.message, 'err'); }
    });
    el.body.querySelector('.dp-out').addEventListener('click', () => logout(false));
  }
  function renderButik() {
    const bal = live();
    el.body.innerHTML = `<p class="dp-sub">Saldo ${fmt(bal)} koin. Aksesori tampil di avatarmu di peta, Taman, dan pesta.</p>` +
      Object.keys(SLOT).map(slot => `<h3 class="sub">${SLOT[slot]}</h3><div class="dp-grid">` +
        Object.entries(items).filter(([, it]) => it.slot === slot).map(([id, it]) => {
          const own = data.punya.includes(id), on = data.pakai[slot] === id;
          const act = on ? `<button type="button" class="btn ghost sm" data-lepas="${slot}">Lepas</button>`
            : own ? `<button type="button" class="btn sm" data-pakai="${id}">Pakai</button>`
              : `<button type="button" class="btn sm" data-beli="${id}" ${bal < it.price ? 'disabled' : ''}>${fmt(it.price)} koin</button>`;
          return `<div class="dp-item${on ? ' on' : ''}"><canvas width="96" height="96" data-prev="${id}" aria-hidden="true"></canvas><b>${esc(it.name)}</b>${on ? '<small>Dipakai</small>' : own ? '<small>Milikmu</small>' : ''}${act}</div>`;
        }).join('') + '</div>').join('');
    el.body.querySelectorAll('canvas[data-prev]').forEach(cv => {
      const id = cv.dataset.prev, cur = Object.values(data.pakai).filter(x => items[x].slot !== items[id].slot);
      AL.drawPortrait(cv.getContext('2d'), lookFor(cur.concat(id)), 96);
    });
    el.body.onclick = async e => {
      const b = e.target.closest('[data-beli],[data-pakai],[data-lepas]');
      if (!b) return;
      try {
        if (b.dataset.beli) {
          const it = items[b.dataset.beli];
          if (!confirm(`Beli ${it.name} seharga ${fmt(it.price)} koin?`)) return;
          await api('/api/dompet/beli', { item: b.dataset.beli }); say(`${it.name} jadi milikmu dan langsung dipakai.`, 'ok');
        } else if (b.dataset.pakai) await api('/api/dompet/pakai', { slot: items[b.dataset.pakai].slot, item: b.dataset.pakai });
        else await api('/api/dompet/pakai', { slot: b.dataset.lepas, item: null });
        await refresh();
      } catch (er) { say(er.message, 'err'); }
    };
  }
  async function renderLencana() {
    el.body.onclick = null;
    el.body.innerHTML = '<p class="dp-sub">Memuat lencana…</p>';
    let d;
    try { d = await api('/api/lencana'); } catch (e) { el.body.innerHTML = ''; say(e.message, 'err'); return; }
    if (tab !== 'lencana') return;
    const n = d.list.filter(b => b.punya).length;
    el.body.innerHTML = `<p class="dp-sub">${n} dari ${d.list.length} lencana. Pilih satu untuk dipakai: tampil di depan namamu di Taman dan pesta, dan di kartu wargamu di peta.</p>
      <ul class="lc-list">${d.list.map(b => `
        <li class="${b.punya ? 'own' : ''}${d.pakai === b.id ? ' on' : ''}">
          <span class="lc-ic" aria-hidden="true">${esc(b.icon)}</span>
          <div><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
            ${b.punya ? '' : `<span class="lc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${b.target}" aria-valuenow="${b.nilai}" aria-label="Kemajuan ${esc(b.name)}"><i data-w="${Math.round(b.nilai / b.target * 100)}"></i></span><small>${fmt(b.nilai)} / ${fmt(b.target)}</small>`}</div>
          ${d.pakai === b.id ? '<button type="button" class="btn ghost sm" data-lc="">Lepas</button>'
            : b.punya ? `<button type="button" class="btn sm" data-lc="${b.id}">Pakai</button>` : '<span class="lc-lock">Terkunci</span>'}
        </li>`).join('')}</ul>`;
    el.body.querySelectorAll('.lc-bar i').forEach(i => { i.style.width = i.dataset.w + '%'; }); // CSP: tanpa atribut style
    el.body.onclick = async e => {
      const b = e.target.closest('[data-lc]');
      if (!b) return;
      try {
        const r = await api('/api/lencana/pakai', { id: b.dataset.lc || null });
        const lc = r.pakai ? d.list.find(x => x.id === r.pakai) : null;
        if (AL.net && AL.net.lencana) { if (lc) AL.net.lencana[user] = [lc.icon, lc.name]; else delete AL.net.lencana[user]; }
        say(lc ? `Lencana ${lc.name} dipakai.` : 'Lencana dilepas.', 'ok');
        renderLencana();
      } catch (er) { say(er.message, 'err'); }
    };
  }
  function renderKirim() {
    el.body.onclick = null;
    el.body.innerHTML = `<form class="dp-kirim" novalidate>
      <p class="dp-sub">Kirim koin ke warga lain. Sisa batas hari ini: ${fmt(data.kirimSisa)} koin. Saldo ${fmt(live())} koin.</p>
      <label class="field"><span>@</span><input name="to" required maxlength="31" placeholder="username penerima" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>Koin</span><input name="amount" type="number" min="10" step="1" required placeholder="min. 10" inputmode="numeric"></label>
      <label class="field"><span>Catatan</span><input name="note" maxlength="60" placeholder="opsional"></label>
      <button class="btn" type="submit">Kirim</button>
    </form>`;
    const f = el.body.querySelector('form');
    f.to.addEventListener('input', () => { f.to.value = f.to.value.replace(/^@+/, ''); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const amt = Math.floor(+f.amount.value);
      if (!confirm(`Kirim ${fmt(amt)} koin ke @${f.to.value}?`)) return;
      try { await api('/api/dompet/kirim', { to: f.to.value, amount: amt, note: f.note.value }); say(`Terkirim ${fmt(amt)} koin ke @${f.to.value}.`, 'ok'); await refresh(); }
      catch (er) { say(er.message, 'err'); }
    });
  }

  AL.dompetInit = function () {
    if (!document.querySelector('.tools')) return;
    mount();
    // titik penanda: ada absen harian yang belum diambil
    if (token) api('/api/dompet').then(d => { el.dot.hidden = d.absenHariIni; }).catch(() => {});
  };
})(window.AL);
