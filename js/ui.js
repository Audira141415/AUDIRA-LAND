/* AUDIRA LAND · UI: HUD, pencarian warga, kartu warga & bangunan, feed kedatangan. */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  let cardRes = null, cardTimer = 0;

  function residentCard(res) {
    const now = Date.now();
    const c = AL.career(res, now);
    const home = res.home >= 0 ? AL.lots[res.home] : null;
    const pl = c.place;
    cardRes = res;
    $('card').innerHTML = `
      <button class="close" aria-label="Tutup">×</button>
      <div class="who">
        <canvas class="portrait" width="128" height="128"></canvas>
        <div>
          <p class="u">@${esc(res.u)}</p>
          <p class="title">${esc(c.title)} <span class="lv">Lv ${c.lvl}</span></p>
          <p class="since">Warga sejak ${AL.fmtDate(res.joined)} · ${AL.fmtDur(now - res.joined)}</p>
        </div>
      </div>
      <dl>
        <div><dt>Rumah</dt><dd>${home ? esc(home.name) + '<br><small>' + esc(home.street) + ' No. ' + home.num + '</small>' : '<em>Antre rusun</em>'}</dd></div>
        <div><dt>Kerja</dt><dd>${esc(pl.name)}<br><small>${esc(AL.LABEL[pl.kind] || 'Pelabuhan')}</small></dd></div>
        <div><dt>Gaji</dt><dd>${AL.fmtKoin(c.pay)}<small> / hari</small></dd></div>
        <div><dt>Total gaji</dt><dd class="saldo" id="saldo">${AL.fmtKoin(c.saldo)}</dd></div>
      </dl>
      <div class="acts">
        ${home ? '<button class="btn" data-go="home">Lihat rumah</button>' : ''}
        ${pl.lot >= 0 ? '<button class="btn ghost" data-go="work">Lihat kantor</button>' : ''}
      </div>`;
    AL.drawPortrait($('card').querySelector('.portrait').getContext('2d'), res.look, 128);
    openCard();
    $('card').querySelector('[data-go="home"]')?.addEventListener('click', () => focusLot(res.home));
    $('card').querySelector('[data-go="work"]')?.addEventListener('click', () => focusLot(pl.lot));
    clearInterval(cardTimer);
    cardTimer = setInterval(() => {
      const el = $('saldo');
      if (!el || cardRes !== res) return clearInterval(cardTimer);
      el.textContent = AL.fmtKoin(AL.career(res, Date.now()).saldo);
    }, 1000);
  }

  const CAP_HINT = {
    house: 'Rumah dibangun saat warga pertama pindah ke kavling ini.', villa: 'Villa dibangun saat warga pertama pindah ke sini.',
    rusun: 'Apartemen dibangun saat warga pertama pindah ke sini.', gubuk: 'Rumah bambu dibangun saat warga pertama pindah ke sini.',
    field: 'Sawah digarap saat petani pertama mulai bekerja di sini.', kebun: 'Kebun ditanami saat pekebun pertama mulai bekerja di sini.',
  };
  function lotCard(lot) {
    cardRes = null; clearInterval(cardTimer);
    const people = (lot.residents.length ? lot.residents : lot.workers).slice(-6).reverse().map(i => AL.residents[i]);
    const isHome = lot.residents.length > 0;
    $('card').innerHTML = `
      <button class="close" aria-label="Tutup">×</button>
      ${AL.isBuilt && !AL.isBuilt(lot)
        ? `<p class="kicker">Tanah kosong · ${lot.district === 'kampung' ? 'Kampung' : 'Kota'}</p>
           <h2>Rencana ${esc((AL.LABEL[lot.type] || 'bangunan').toLowerCase())}</h2>
           <p class="since">${CAP_HINT[lot.type] || 'Bangunan berdiri saat warga pertama bekerja di sini.'}</p>`
        : `<p class="kicker">${esc(AL.LABEL[lot.type])}</p>
      <h2>${esc(lot.name)}</h2>`}
      <p class="since">${esc(lot.street)} No. ${lot.num}</p>
      <div class="chips">
        ${lot.residents.length ? `<span>${lot.residents.length} penghuni</span>` : ''}
        ${lot.workers.length ? `<span>${lot.workers.length} pekerja</span>` : ''}
      </div>
      ${people.length ? `<p class="sub">${isHome ? 'Penghuni' : 'Pekerja'}</p><ul class="people">${people.map(r => `<li><button data-u="${esc(r.u)}"><canvas width="56" height="56"></canvas>@${esc(r.u)}</button></li>`).join('')}</ul>` : '<p class="since">Belum ada warga di sini.</p>'}
      ${lot.type === 'park' ? '<div class="acts"><a class="btn" href="/taman.html">Masuk Taman</a></div>' : ''}
      ${AL.partyBox ? AL.partyBox(lot) : ''}
      ${AL.sponsorBox ? AL.sponsorBox(AL.sponsorAt(lot)) : ''}`;
    if (AL.bindSponsorBox) AL.bindSponsorBox($('card'));
    $('card').querySelectorAll('.people button').forEach((b, k) => {
      AL.drawPortrait(b.querySelector('canvas').getContext('2d'), people[k].look, 56);
      b.addEventListener('click', () => residentCard(people[k]));
    });
    AL.focus = { lot: lot.i };
    openCard();
  }

  function openCard() {
    const c = $('card');
    c.hidden = false;
    c.querySelector('.close').addEventListener('click', closeCard);
  }
  function closeCard() { $('card').hidden = true; cardRes = null; AL.focus = null; clearInterval(cardTimer); }
  function focusLot(i) {
    const lot = AL.lots[i];
    if (!lot) return;
    AL.focus = { lot: i };
    AL.flyTo(lot.x + 1, lot.y + 1, 0, 1.7);
  }
  function showResident(res) {
    residentCard(res);
    if (res.home >= 0) focusLot(res.home);
  }
  AL.showResident = showResident;

  // kartu papan reklame sponsor
  function sponsorCard(o) {
    cardRes = null; clearInterval(cardTimer);
    const slot = AL.slotById('papan:' + o.x + ',' + o.y);
    $('card').innerHTML = `
      <button class="close" aria-label="Tutup">×</button>
      <p class="kicker">Papan reklame</p>
      <p class="since">${esc(slot ? slot.label.replace('Papan reklame · ', '') : '')}</p>
      ${AL.sponsorBox(o.sp)}`;
    AL.bindSponsorBox($('card'));
    AL.focus = null;
    openCard();
  }

  // ---------- pencarian ----------
  let hits = [];
  function search(q) {
    q = q.trim().toLowerCase().replace(/^@/, '');
    if (!q) return [];
    const exact = AL.byName.get(q);
    const out = exact ? [exact] : [];
    for (const r of AL.residents) {
      if (out.length >= 8) break;
      if (r !== exact && r.u.toLowerCase().includes(q)) out.push(r);
    }
    return out;
  }
  function renderSugg() {
    const ul = $('sugg');
    if (!hits.length) { ul.hidden = !$('q').value.trim(); ul.innerHTML = ul.hidden ? '' : '<li class="none">Warga tidak ditemukan</li>'; return; }
    ul.hidden = false;
    ul.innerHTML = hits.map((r, k) => `<li><button type="button" data-k="${k}"><canvas width="48" height="48"></canvas><span>@${esc(r.u)}</span><small>${esc(AL.career(r, Date.now()).title)}</small></button></li>`).join('');
    ul.querySelectorAll('button').forEach((b, k) => {
      AL.drawPortrait(b.querySelector('canvas').getContext('2d'), hits[k].look, 48);
      b.addEventListener('click', () => pick(hits[k]));
    });
  }
  function pick(r) { $('sugg').hidden = true; $('q').blur(); showResident(r); }

  // ---------- feed & HUD ----------
  const feed = [];
  AL.onArrive = function (res) {
    feed.unshift(res);
    if (feed.length > 5) feed.pop();
    $('feedList').innerHTML = feed.map((r, k) => `<li><button data-k="${k}">@${esc(r.u)}</button></li>`).join('');
    $('feedList').querySelectorAll('button').forEach((b, k) => b.addEventListener('click', () => showResident(feed[k])));
    $('feed').classList.add('has');
    $('pop').textContent = AL.fmtInt(AL.residents.length);
  };

  function tickHud() {
    const d = AL.gameDate();
    $('clock').textContent = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    $('pop').textContent = AL.fmtInt(AL.residents.length);
    const f = AL.ferry, left = AL.ferryCountdown();
    // layar sempit: teks pendek supaya pil kapal tidak terpotong
    const short = window.innerWidth < 480;
    let txt;
    if (f.state === 'away') {
      if (left === null) txt = short ? 'Tak ada kapal' : 'Belum ada kapal terjadwal';
      else { const s = Math.ceil(left), t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; txt = short ? `Kapal ${t}` : `Kapal ${t} · ${f.nextCount} warga`; }
    } else if (f.state === 'arriving') txt = short ? 'Kapal mendekat' : `Kapal mendekat · ${f.load.length} warga`;
    else if (f.state === 'docked') txt = short ? `Sandar · ${f.load.length} baru` : `Kapal sandar · ${f.load.length} warga baru`;
    else txt = 'Kapal berangkat';
    $('ferryText').textContent = txt;
    $('ferry').classList.toggle('live', f.state !== 'away');
    $('mode').hidden = !AL.net.demo;
  }

  // ---------- daftar jadi warga / minta keluar ----------
  let leaveMode = false;
  function statusText(r) {
    const jam = t => new Date(t).toLocaleString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    let m;
    if (r.status === 'pending') m = r.created ? 'Pendaftaran diterima. Setelah admin menyetujui, kamu dijadwalkan naik kapal ke AUDIRA LAND.' : 'Kamu sudah terdaftar dan sedang menunggu persetujuan admin.';
    else if (r.status === 'scheduled') m = `Kamu dijadwalkan tiba naik kapal ${jam(r.arriveAt)}.`;
    else if (r.status === 'resident') m = 'Kamu sudah jadi warga AUDIRA LAND.';
    else if (r.status === 'rejected') m = 'Pendaftaran ditolak. Hubungi admin AUDIRA.';
    else if (r.status === 'removed') m = 'Namamu sudah dihapus dari kota.';
    else m = 'Username belum terdaftar.';
    if (r.leaveRequested) m += ' Permintaan keluar sedang diproses admin.';
    return m;
  }
  function setLeaveMode(on) {
    leaveMode = on;
    $('joinTitle').textContent = on ? 'Keluar dari kota' : 'Jadi warga AUDIRA LAND';
    $('joinLead').textContent = on ? 'Admin akan menghapus username-mu dari peta dan pencarian.' : 'Tulis username Instagram-mu. Setelah disetujui, kamu tiba naik kapal dan dapat rumah serta pekerjaan.';
    $('consentRow').hidden = on;
    $('joinSubmit').textContent = on ? 'Kirim permintaan' : 'Daftar';
    $('toggleLeave').textContent = on ? 'Kembali ke pendaftaran' : 'Minta keluar dari kota';
    $('joinMsg').hidden = true;
  }
  async function submitJoin(e) {
    e.preventDefault();
    const u = $('ig').value, msg = $('joinMsg');
    msg.hidden = false; msg.className = 'msg'; msg.textContent = 'Mengirim…';
    $('joinSubmit').disabled = true;
    try {
      if (AL.net.demo) throw new Error('Mode demo: server belum jalan, pendaftaran tidak disimpan.');
      if (leaveMode) {
        const r = await AL.net.keluar(u);
        msg.textContent = r.ok ? 'Permintaan keluar terkirim. Admin akan menghapus namamu dari peta.' : statusText(r);
      } else {
        const r = await AL.net.daftar(u, $('consent').checked);
        msg.textContent = statusText(r);
        const res = AL.byName.get(r.username);
        if (res) { msg.innerHTML = esc(statusText(r)) + ' <button type="button" class="link" id="seeMe">Lihat kartuku</button>'; $('seeMe').onclick = () => { $('joinSheet').close(); showResident(res); }; }
      }
      msg.classList.add('ok');
    } catch (err) {
      msg.textContent = err.message; msg.classList.add('err');
    } finally { $('joinSubmit').disabled = false; }
  }

  AL.ui = {
    init() {
      AL._t0 = performance.now() / 1000;
      $('pop').textContent = AL.fmtInt(AL.residents.length);
      $('q').addEventListener('input', () => { hits = search($('q').value); renderSugg(); });
      $('search').addEventListener('submit', e => { e.preventDefault(); hits = search($('q').value); if (hits[0]) pick(hits[0]); else renderSugg(); });
      $('q').addEventListener('keydown', e => { if (e.key === 'Escape') { $('sugg').hidden = true; $('q').blur(); } });
      $('zin').addEventListener('click', () => AL.zoomBy(1.3));
      $('zout').addEventListener('click', () => AL.zoomBy(1 / 1.3));
      $('speed').addEventListener('click', () => {
        AL.clock.fast = !AL.clock.fast;
        $('speed').setAttribute('aria-pressed', AL.clock.fast);
      });
      $('ferry').addEventListener('click', () => { if (AL.dock) AL.flyTo(AL.dock.x + 1, AL.dock.yEnd, 0, 1.4); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
      AL.onTap = (sx, sy) => {
        $('sugg').hidden = true;
        const o = AL.hitTest(sx, sy);
        if (o && o.type) lotCard(o);
        else if (o && o.kind === 'papan') sponsorCard(o);
        else if (o && o.kind === 'tugu' && AL.landmarkCard) {
          cardRes = null; clearInterval(cardTimer); AL.focus = null;
          $('card').innerHTML = AL.landmarkCard(); openCard();
        }
        else if (o && o.kind === 'mercusuar') { closeCard(); }
        else closeCard();
      };
      // feed awal: 5 warga terbaru
      AL.residents.slice().sort((a, b) => a.joined - b.joined).slice(-5).forEach(r => AL.onArrive(r));
      $('join').addEventListener('click', () => { setLeaveMode(false); $('joinSheet').showModal(); $('ig').focus(); });
      $('joinClose').addEventListener('click', () => $('joinSheet').close());
      $('toggleLeave').addEventListener('click', () => setLeaveMode(!leaveMode));
      $('joinForm').addEventListener('submit', submitJoin);
      $('ig').addEventListener('input', () => { $('ig').value = $('ig').value.replace(/^@+/, ''); });
      tickHud();
      setInterval(tickHud, 500);
      // jumlah orang di Taman
      const tamanCount = async () => {
        if (AL.net.demo) return;
        try {
          const r = await fetch('/api/taman', { signal: AbortSignal.timeout(5000) });
          const { online } = await r.json();
          $('tamanOnline').hidden = !online;
          $('tamanOnline').textContent = online + ' online';
        } catch (e) { $('tamanOnline').hidden = true; }
      };
      tamanCount();
      setInterval(tamanCount, 30000);
    },
  };
})(window.AL);
