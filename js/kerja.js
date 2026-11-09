/* AUDIRA LAND · Mini-game kerja: Nelayan (Pancing Teluk), Petani (Panen Kilat), Kurir (Sortir Paket),
   Koki (Dapur Warung), Polisi (Razia Helm).
   Ronde 30 detik, deterministik dari seed server. Tanpa login = Latihan (tanpa koin). */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  const { W, H, DUR } = AL.kerjaSim;
  let token = '', user = '';
  try { token = localStorage.getItem(TK) || ''; user = localStorage.getItem(UK) || ''; } catch (e) { /* abaikan */ }
  const fmt = n => Math.floor(n).toLocaleString('id-ID');

  const SIM = AL.kerjaSim, { MAKERS, UNIT, C } = SIM;
  // [peran, judul, ajakan]
  const META = {
    nelayan: ['Nelayan', 'Pancing Teluk', 'Jatuhkan kail ke ikan yang lewat.'],
    petani: ['Petani', 'Panen Kilat', 'Petik padi tepat saat menguning.'],
    kurir: ['Kurir Pasar', 'Sortir Paket', 'Masukkan paket ke gerobak yang cocok.'],
    koki: ['Koki Warung', 'Dapur Warung', 'Siapkan pesanan sesuai urutan di nota.'],
    polisi: ['Polisi', 'Razia Helm', 'Tilang pengendara motor tanpa helm.'],
  };

  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { setLogin('', ''); throw new Error(j.error || 'Sesi berakhir, masuk lagi.'); }
    if (!r.ok) throw new Error(j.error || 'Gagal (' + r.status + ')');
    return j;
  }
  function setLogin(t, u) {
    token = t; user = u;
    try { if (t) { localStorage.setItem(TK, t); localStorage.setItem(UK, u); } else { localStorage.removeItem(TK); localStorage.removeItem(UK); } } catch (e) { /* abaikan */ }
  }

  // ================= ALUR =================
  const cv = $('game'), ctx = cv.getContext('2d');
  let status = null, run = null;

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();

  async function loadHome() {
    $('who').innerHTML = token
      ? `<span>@${esc(user)}</span> <button type="button" class="link" id="out">Keluar</button>`
      : '<span>Latihan (tanpa koin)</span> <button type="button" class="btn sm" id="in">Masuk warga</button>';
    $('out')?.addEventListener('click', () => { setLogin('', ''); loadHome(); });
    $('in')?.addEventListener('click', () => { $('loginMsg').hidden = true; $('loginSheet').showModal(); $('lu').focus(); });
    status = null;
    if (token) { try { status = await api('/api/kerja'); } catch (e) { status = null; } }
    $('chip').hidden = !status;
    if (status) $('chip').innerHTML = `Koin dari kerja hari ini <b>${fmt(status.koinHariIni)}</b> / ${fmt(status.batas)} · ronde ${status.ronde}/${status.rondeMaks}`;
    $('cards').innerHTML = Object.keys(MAKERS).map(k => {
      const s = status && status.games[k];
      return `<button type="button" class="kj-card" data-game="${k}">
        <canvas width="240" height="160" data-ico="${k}" aria-hidden="true"></canvas>
        <span class="kj-role">${META[k][0]}${s && s.bonus ? '<em>Bonus profesi ×1,5</em>' : ''}</span>
        <b>${META[k][1]}</b>
        <small>${META[k][2]}</small>
        <small class="kj-best">${s ? `Rekor hari ini: ${s.best} ${UNIT[k]}` : 'Mode latihan'}</small>
        ${s && s.minggu ? `<small class="kj-myrank">#${s.minggu.rank} minggu ini · ${s.minggu.score} ${UNIT[k]}</small>` : ''}
      </button>`;
    }).join('');
    $('cards').querySelectorAll('canvas[data-ico]').forEach(drawIcon);
    try {
      const { kota } = await fetch('/api/kerja/kota').then(r => r.json());
      $('kota').innerHTML = Object.values(kota).map(v => `<li><b>${fmt(v.total)}</b> ${esc(v.unit)}<small>${esc(v.name)} · ${v.orang} warga</small></li>`).join('');
    } catch (e) { $('kota').innerHTML = '<li><small>Belum tersedia</small></li>'; }
    loadBoard();
  }

  // ================= PAPAN PERINGKAT =================
  const board = { p: 'minggu', game: 'nelayan', data: null };
  const MEDAL = ['🥇', '🥈', '🥉'];
  function sisaWaktu(ms) {
    const j = Math.max(0, Math.floor(ms / 3600e3)), h = Math.floor(j / 24);
    return h > 0 ? `${h} hari ${j % 24} jam` : `${j} jam ${Math.max(0, Math.floor(ms / 60e3) % 60)} menit`;
  }
  async function loadBoard() {
    try { board.data = await fetch('/api/kerja/peringkat?p=' + board.p, { cache: 'no-store' }).then(r => r.json()); }
    catch (e) { board.data = null; }
    drawBoard();
  }
  function drawBoard() {
    const d = board.data;
    document.querySelectorAll('#peringkat .kj-seg:not(.kj-seg-game) [data-p]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.p === board.p)));
    if (!d || !d.games) { $('boardList').innerHTML = '<li class="kj-empty">Papan peringkat belum tersedia.</li>'; return; }
    $('boardLead').innerHTML = board.p === 'minggu'
      ? `Juara 1–3 tiap pekerjaan dapat <b>${d.hadiah.map(fmt).join(' / ')}</b> koin. Minggu ditutup dalam <b>${sisaWaktu(d.mingguSelesai - d.now)}</b> (Senin 00.00 WIB).`
      : 'Skor terbaik tiap warga hari ini. Hadiah dihitung dari papan mingguan.';
    $('boardGames').innerHTML = Object.entries(d.games).map(([k, g]) =>
      `<button type="button" role="tab" data-g="${k}" aria-selected="${k === board.game}">${esc(g.name)}<small>${g.peserta} warga</small></button>`).join('');
    // tab pekerjaan bisa digulir: pastikan yang terpilih terlihat tanpa menggulir halaman
    const tabs = $('boardGames'), sel = tabs.querySelector('[aria-selected="true"]');
    if (sel) { const a = sel.getBoundingClientRect(), b = tabs.getBoundingClientRect(); if (a.left < b.left || a.right > b.right) tabs.scrollLeft += a.left - b.left - 8; }
    const g = d.games[board.game] || Object.values(d.games)[0];
    $('boardList').innerHTML = g.top.length
      ? g.top.map(r => `<li class="${r.u === user ? 'me' : ''}"><span class="kj-pos">${MEDAL[r.rank - 1] || r.rank}</span><span class="kj-name">@${esc(r.u)}</span><b>${fmt(r.score)}</b><small>${esc(g.unit)}</small></li>`).join('')
      : `<li class="kj-empty">Belum ada skor ${board.p === 'hari' ? 'hari ini' : 'minggu ini'}. Jadilah yang pertama!</li>`;
    const champ = g.juaraLalu || [];
    $('boardChamp').hidden = !champ.length;
    $('boardChamp').innerHTML = champ.length ? `<b>Juara minggu lalu</b> ${champ.map(c => `<span>${MEDAL[c.rank - 1]} @${esc(c.u)} · ${fmt(c.score)}</span>`).join('')}` : '';
  }
  $('peringkat').addEventListener('click', e => {
    const p = e.target.closest('[data-p]'), g = e.target.closest('[data-g]');
    if (p && p.dataset.p !== board.p) { board.p = p.dataset.p; loadBoard(); }
    if (g) { board.game = g.dataset.g; drawBoard(); }
  });
  // ikon kartu: ronde contoh dijalankan sampai detik 6, lalu dipotong ke bagian yang paling bercerita
  const ICON_Y = { koki: 0.1, polisi: 0.3 };
  function drawIcon(c) {
    const k = c.dataset.ico, r = SIM.ronde(k, 7), x = c.getContext('2d');
    r.until(6 * SIM.HZ);
    x.save(); x.scale(240 / W, 160 / (H * 0.45)); x.translate(0, -H * (ICON_Y[k] ?? 0.2));
    r.g.draw(x, r.t()); x.restore();
  }

  function show(id) { ['home', 'play', 'end'].forEach(s => { $(s).hidden = s !== id; }); }

  async function start(game) {
    let round = null, seed;
    if (token) {
      try { const r = await api('/api/kerja/mulai', { game }); round = r.round; seed = r.seed; }
      catch (e) { alert(e.message); return; }
    } else seed = Math.floor(Math.random() * 2 ** 31);
    const sim = SIM.ronde(game, seed), g = sim.g;
    if (run) { run.over = true; clearTimeout(run.timer); }
    run = { game, sim, g, round, t0: performance.now() + 3000, over: false };
    // cadangan: ronde tetap selesai walau tab disembunyikan (requestAnimationFrame berhenti)
    run.timer = setTimeout(finish, 3000 + DUR * 1000 + 150);
    $('hudGame').textContent = META[game][1];
    $('hint').textContent = g.hint;
    $('carts').hidden = !g.carts;
    if (g.carts) {
      $('carts').innerHTML = g.COLS.map((k, i) => `<button type="button" data-cart="${i}" aria-label="Gerobak ${k.name}"><span></span>${k.name}</button>`).join('');
      $('carts').querySelectorAll('[data-cart]').forEach((b, i) => {
        b.querySelector('span').style.background = g.COLS[i].col;
        b.addEventListener('pointerdown', e => { e.preventDefault(); if (catchUp()) run.sim.input(-1, i); });
      });
    }
    show('play');
    requestAnimationFrame(loop);
  }
  const now = () => (performance.now() - run.t0) / 1000;
  // jalankan simulasi sampai waktu sekarang (langkah tetap 1/60 dtk). false = di luar waktu main.
  function catchUp() {
    if (!run || run.over) return false;
    const t = now();
    if (t < 0) return false;
    run.sim.until(Math.floor(t * SIM.HZ));
    return !run.sim.done();
  }
  function loop() {
    if (!run || run.over) return;
    const t = now();
    ctx.clearRect(0, 0, W, H);
    if (t < 0) {
      run.g.draw(ctx, 0);
      ctx.fillStyle = 'rgba(20,50,74,.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.paper; ctx.font = '800 72px "Plus Jakarta Sans", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(-t), W / 2, H / 2);
      $('hudTime').textContent = DUR;
    } else {
      catchUp();
      run.g.draw(ctx, run.sim.t());
      $('hudTime').textContent = Math.max(0, Math.ceil(DUR - run.sim.t()));
      if (run.sim.done()) return finish();
    }
    $('hudScore').textContent = run.g.score;
    requestAnimationFrame(loop);
  }
  cv.addEventListener('pointerdown', e => {
    if (!catchUp()) return;
    const r = cv.getBoundingClientRect();
    run.sim.input((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height);
  });

  async function finish() {
    if (!run || run.over) return;
    run.over = true;
    clearTimeout(run.timer);
    run.sim.until(SIM.N); // tab tersembunyi: selesaikan sisa langkah
    const score = run.sim.score(), game = run.game;
    $('endScore').textContent = score; $('endUnit').textContent = UNIT[game];
    $('endKoin').textContent = ''; $('endNote').textContent = ''; $('endRank').textContent = '';
    show('end');
    if (!run.round) { $('endKicker').textContent = 'Latihan selesai'; $('endNote').textContent = 'Masuk sebagai warga supaya hasil kerjamu dibayar koin dan masuk papan peringkat.'; return; }
    $('endKicker').textContent = 'Ronde selesai';
    $('endKoin').textContent = 'Memeriksa ronde…';
    try {
      const r = await api('/api/kerja/selesai', { round: run.round, ev: run.sim.ev });
      $('endScore').textContent = r.score;
      $('endKoin').innerHTML = r.koin > 0 ? `+<b>${fmt(r.koin)}</b> koin masuk dompet` : 'Belum ada koin dari ronde ini';
      $('endNote').textContent = [r.bonus ? 'Termasuk bonus profesi ×1,5.' : '', r.terpotong ? `Upah dipotong: batas koin kerja hari ini tercapai (sisa ${fmt(r.sisaHariIni)}).` : `Sisa batas hari ini ${fmt(r.sisaHariIni)} koin.`].filter(Boolean).join(' ');
      if (r.peringkat) $('endRank').innerHTML = (r.rekorBaru ? '<b>Rekor pribadi baru minggu ini!</b> ' : '') + `Peringkat mingguanmu: <b>#${r.peringkat.rank}</b> dari ${r.peringkat.dari} warga`;
    } catch (e) { $('endKoin').textContent = ''; $('endNote').textContent = e.message; }
  }

  $('cards').addEventListener('click', e => { const b = e.target.closest('[data-game]'); if (b) start(b.dataset.game); });
  $('again').addEventListener('click', () => start(run.game));
  $('toHome').addEventListener('click', () => { show('home'); if (run) board.game = run.game; loadHome(); });
  $('loginClose').addEventListener('click', () => $('loginSheet').close());
  $('lu').addEventListener('input', () => { $('lu').value = $('lu').value.replace(/^@+/, ''); });
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('loginMsg'); msg.hidden = false; msg.className = 'msg'; msg.textContent = 'Memeriksa…';
    try {
      const r = await fetch('/api/masuk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('lu').value, kode: $('lk').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Gagal masuk');
      setLogin(j.token, j.username); $('lk').value = '';
      $('loginSheet').close(); loadHome();
    } catch (er) { msg.textContent = er.message; msg.classList.add('err'); }
  });

  AL.kerja = { start, get run() { return run; } };
  loadHome();
})(window.AL);
