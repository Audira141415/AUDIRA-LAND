/* AUDIRA LAND · Mini-game kerja: Nelayan (Pancing Teluk), Petani (Panen Kilat), Kurir (Sortir Paket).
   Ronde 30 detik, deterministik dari seed server. Tanpa login = Latihan (tanpa koin). */
(function (AL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = AL.esc;
  const TK = 'audira-taman-token', UK = 'audira-taman-user';
  const W = 360, H = 520, DUR = 30;
  let token = '', user = '';
  try { token = localStorage.getItem(TK) || ''; user = localStorage.getItem(UK) || ''; } catch (e) { /* abaikan */ }
  const fmt = n => Math.floor(n).toLocaleString('id-ID');

  // warna (art bible bag. 4): benda dunia ≤45% saturasi; koral hanya "kamu"/aksi; emas pudar untuk benda
  const C = {
    ink: '#14324a', paper: '#fffaf0', salem: '#d9967c', tealDim: '#5f9e98', blueDim: '#6a74ad',
    gold: '#c9b07e', sky: '#cfe0e3', sea1: '#8fbcc6', sea2: '#5f8fa0', wood: '#a88a68', shoe: '#6b5a4a',
    paddy: '#b9c79a', sprout: '#8fb27a', ripe: '#d1b77f', wilt: '#9a8466', mud: '#8c7a5e', you: '#ff7a59',
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

  // ================= GAME =================
  function nelayan(rng) {
    const g = { score: 0, hint: 'Ketuk saat kail di atas ikan. Ikan emas +3, sepatu tidak dihitung.' };
    const fish = [];
    // jadwal ikan: tiap ±0,45 dtk, arah & kedalaman acak (seed)
    for (let t = 0.2; t < DUR; t += 0.35 + rng() * 0.25) {
      const r = rng(), dir = rng() < 0.5 ? 1 : -1;
      fish.push({ t0: t, dir, y: 170 + rng() * 300, v: 55 + rng() * 70, kind: r < 0.08 ? 'emas' : r < 0.25 ? 'sepatu' : 'ikan', gone: false });
    }
    let line = null; // {x, y, phase: 'down'|'up', catch}
    const hookX = t => W / 2 + Math.sin(t * 1.7) * 140;
    const fx = (f, t) => (f.dir > 0 ? -30 + (t - f.t0) * f.v : W + 30 - (t - f.t0) * f.v);
    g.update = (dt, t) => {
      if (!line) return;
      if (line.phase === 'down') {
        line.y += 560 * dt;
        for (const f of fish) {
          if (f.gone || t < f.t0) continue;
          const x = fx(f, t);
          if (Math.abs(x - line.x) < 20 && Math.abs(f.y - line.y) < 13) { line.catch = f; f.gone = true; line.phase = 'up'; break; }
        }
        if (line.y > H - 20) line.phase = 'up';
      } else {
        line.y -= 720 * dt;
        if (line.y <= 110) {
          if (line.catch) g.score += line.catch.kind === 'emas' ? 3 : line.catch.kind === 'ikan' ? 1 : 0;
          line = null;
        }
      }
    };
    g.tap = (x, y, t) => { if (!line) line = { x: hookX(t), y: 110, phase: 'down', catch: null }; };
    g.draw = (c, t) => {
      c.fillStyle = C.sky; c.fillRect(0, 0, W, 110);
      const gr = c.createLinearGradient(0, 110, 0, H); gr.addColorStop(0, C.sea1); gr.addColorStop(1, C.sea2);
      c.fillStyle = gr; c.fillRect(0, 110, W, H - 110);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const y = 140 + i * 60, o = (t * 20 + i * 37) % 60; c.beginPath(); c.moveTo(o - 60, y); c.quadraticCurveTo(o - 30, y - 6, o, y); c.stroke(); }
      // dermaga + kamu
      c.fillStyle = C.wood; c.fillRect(0, 96, W, 14);
      c.fillStyle = C.ink; c.fillRect(W / 2 - 2, 40, 4, 58);
      c.fillStyle = C.you; c.beginPath(); c.arc(W / 2, 36, 9, 0, 7); c.fill();
      // ikan
      for (const f of fish) {
        if (f.gone || t < f.t0) continue;
        const x = fx(f, t); if (x < -40 || x > W + 40) continue;
        c.save(); c.translate(x, f.y); c.scale(f.dir, 1);
        if (f.kind === 'sepatu') {
          c.fillStyle = C.shoe; c.beginPath(); c.roundRect(-14, -6, 22, 10, 3); c.fill(); c.fillRect(-14, -14, 9, 10);
        } else {
          c.fillStyle = f.kind === 'emas' ? C.gold : C.salem;
          c.beginPath(); c.ellipse(0, 0, 16, 8, 0, 0, 7); c.fill();
          c.beginPath(); c.moveTo(-14, 0); c.lineTo(-24, -7); c.lineTo(-24, 7); c.closePath(); c.fill();
          c.fillStyle = C.ink; c.beginPath(); c.arc(8, -2, 1.8, 0, 7); c.fill();
          if (f.kind === 'emas') { c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(-4, -5, 3, 3); }
        }
        c.restore();
      }
      // tali & kail
      const hx = line ? line.x : hookX(t), hy = line ? line.y : 110 + Math.abs(Math.cos(t * 1.7)) * 10;
      c.strokeStyle = C.ink; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(W / 2, 40); c.lineTo(hx, hy); c.stroke();
      c.strokeStyle = C.ink; c.lineWidth = 2.5; c.beginPath(); c.arc(hx, hy + 4, 5, 0, Math.PI); c.stroke();
      if (line && line.catch) { c.fillStyle = line.catch.kind === 'emas' ? C.gold : line.catch.kind === 'sepatu' ? C.shoe : C.salem; c.beginPath(); c.ellipse(hx, hy + 14, 7, 12, 0, 0, 7); c.fill(); }
    };
    return g;
  }

  function petani(rng) {
    const g = { score: 0, hint: 'Ketuk padi yang sudah kuning. Padi hijau jangan diinjak (−1).' };
    const N = 4, size = 78, ox = (W - N * size) / 2 - 2, oy = 130;
    // tiap petak: daftar fase berurutan (kosong → tumbuh → matang 1,2 dtk → layu) dari seed
    const tiles = [];
    for (let i = 0; i < N * N; i++) {
      const seq = []; let t = rng() * 2;
      while (t < DUR + 5) {
        const grow = 2.5 + rng() * 2, ripe = 1.2, wilt = 0.6, empty = 1 + rng();
        seq.push({ g0: t, r0: t + grow, w0: t + grow + ripe, e0: t + grow + ripe + wilt });
        t += grow + ripe + wilt + empty;
      }
      tiles.push({ seq, done: new Set(), flash: 0, flashCol: '' });
    }
    const state = (tile, t) => {
      for (let k = 0; k < tile.seq.length; k++) {
        const s = tile.seq[k];
        if (t < s.g0) return { st: 'kosong' };
        if (t < s.e0) {
          if (tile.done.has(k)) return { st: 'kosong' };
          return { st: t < s.r0 ? 'tumbuh' : t < s.w0 ? 'matang' : 'layu', k, p: (t - s.g0) / (s.r0 - s.g0) };
        }
      }
      return { st: 'kosong' };
    };
    g.update = () => {};
    g.tap = (x, y, t) => {
      const cx = Math.floor((x - ox) / size), cy = Math.floor((y - oy) / size);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      const tile = tiles[cy * N + cx], s = state(tile, t);
      if (s.st === 'matang') { g.score += 1; tile.done.add(s.k); tile.flash = t; tile.flashCol = C.gold; }
      else if (s.st === 'tumbuh') { g.score -= 1; tile.done.add(s.k); tile.flash = t; tile.flashCol = C.wilt; }
    };
    g.draw = (c, t) => {
      c.fillStyle = '#e6dcc4'; c.fillRect(0, 0, W, H);
      c.fillStyle = C.mud; c.beginPath(); c.roundRect(ox - 8, oy - 8, N * size + 16, N * size + 16, 14); c.fill();
      for (let i = 0; i < N * N; i++) {
        const x = ox + (i % N) * size, y = oy + Math.floor(i / N) * size, tile = tiles[i], s = state(tile, t);
        c.fillStyle = C.paddy; c.beginPath(); c.roundRect(x + 3, y + 3, size - 6, size - 6, 10); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1;
        for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x + 8, y + k * size / 4); c.lineTo(x + size - 8, y + k * size / 4); c.stroke(); }
        if (s.st !== 'kosong') {
          const h = s.st === 'tumbuh' ? 12 + s.p * 26 : 38, col = s.st === 'tumbuh' ? C.sprout : s.st === 'matang' ? C.ripe : C.wilt;
          c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round';
          for (let k = -2; k <= 2; k++) {
            const bx = x + size / 2 + k * 9, by = y + size - 14, lean = s.st === 'layu' ? 10 : s.st === 'matang' ? 4 : 0;
            c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx, by - h * 0.6, bx + lean, by - h); c.stroke();
            if (s.st === 'matang') { c.fillStyle = C.ripe; c.beginPath(); c.ellipse(bx + lean, by - h, 3.5, 6, 0.3, 0, 7); c.fill(); }
          }
        }
        if (t - tile.flash < 0.35) { c.globalAlpha = 1 - (t - tile.flash) / 0.35; c.fillStyle = tile.flashCol; c.beginPath(); c.roundRect(x + 3, y + 3, size - 6, size - 6, 10); c.fill(); c.globalAlpha = 1; }
      }
    };
    return g;
  }

  function kurir(rng) {
    const g = { score: 0, hint: 'Ketuk gerobak yang warnanya sama dengan paket paling bawah.', carts: true };
    const COLS = [{ col: C.salem, name: 'Salem' }, { col: C.tealDim, name: 'Hijau laut' }, { col: C.blueDim, name: 'Biru' }];
    g.COLS = COLS;
    const boxes = [];
    for (let t = 0.3, gap = 1.1; t < DUR; t += gap, gap = Math.max(0.45, gap * 0.965)) boxes.push({ t0: t, c: Math.floor(rng() * 3), done: false, fb: 0, ok: false });
    const yOf = (b, t) => 60 + (t - b.t0) * (150 + b.t0 * 4);
    let fx = [];
    g.update = (dt, t) => {
      for (const b of boxes) if (!b.done && t >= b.t0 && yOf(b, t) > 440) { b.done = true; fx.push({ t, text: 'Lewat', x: W / 2, col: C.wilt }); }
      fx = fx.filter(f => t - f.t < 0.8);
    };
    g.pick = (ci, t) => {
      const b = boxes.find(x => !x.done && t >= x.t0);
      if (!b) return;
      b.done = true;
      const ok = b.c === ci;
      g.score += ok ? 1 : -1;
      fx.push({ t, text: ok ? '+1' : '−1', x: 60 + ci * 120, col: ok ? C.tealDim : C.wilt });
    };
    g.tap = (x, y, t) => { if (y > 440) g.pick(Math.min(2, Math.floor(x / 120)), t); };
    g.draw = (c, t) => {
      c.fillStyle = '#e8dfcc'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#d6cbb2'; c.fillRect(W / 2 - 46, 0, 92, 440);
      c.strokeStyle = 'rgba(20,50,74,.15)'; c.lineWidth = 2;
      for (let y = (t * 120) % 30; y < 440; y += 30) { c.beginPath(); c.moveTo(W / 2 - 46, y); c.lineTo(W / 2 + 46, y); c.stroke(); }
      const live = boxes.filter(b => !b.done && t >= b.t0);
      live.forEach((b, i) => {
        const y = yOf(b, t);
        c.fillStyle = COLS[b.c].col; c.beginPath(); c.roundRect(W / 2 - 30, y - 24, 60, 48, 6); c.fill();
        c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(W / 2 - 4, y - 24, 8, 48);
        if (i === 0) { c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.roundRect(W / 2 - 34, y - 28, 68, 56, 8); c.stroke(); }
      });
      // gerobak
      COLS.forEach((k, i) => {
        const x = i * 120 + 12;
        c.fillStyle = k.col; c.beginPath(); c.roundRect(x, 452, 96, 48, 10); c.fill();
        c.fillStyle = C.ink; c.beginPath(); c.arc(x + 22, 504, 7, 0, 7); c.arc(x + 74, 504, 7, 0, 7); c.fill();
      });
      for (const f of fx) { c.globalAlpha = 1 - (t - f.t) / 0.8; c.fillStyle = f.col; c.font = '800 22px "Plus Jakarta Sans", system-ui'; c.textAlign = 'center'; c.fillText(f.text, f.x, 430 - (t - f.t) * 40); c.globalAlpha = 1; }
    };
    return g;
  }
  const MAKERS = { nelayan, petani, kurir };
  const UNIT = { nelayan: 'ikan', petani: 'ikat padi', kurir: 'paket' };

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
    const meta = { nelayan: ['Nelayan', 'Pancing Teluk', 'Jatuhkan kail ke ikan yang lewat.'], petani: ['Petani', 'Panen Kilat', 'Petik padi tepat saat menguning.'], kurir: ['Kurir Pasar', 'Sortir Paket', 'Masukkan paket ke gerobak yang cocok.'] };
    $('cards').innerHTML = Object.keys(MAKERS).map(k => {
      const s = status && status.games[k];
      return `<button type="button" class="kj-card" data-game="${k}">
        <canvas width="240" height="160" data-ico="${k}" aria-hidden="true"></canvas>
        <span class="kj-role">${meta[k][0]}${s && s.bonus ? '<em>Bonus profesi ×1,5</em>' : ''}</span>
        <b>${meta[k][1]}</b>
        <small>${meta[k][2]}</small>
        <small class="kj-best">${s ? `Rekor hari ini: ${s.best} ${UNIT[k]}` : 'Mode latihan'}</small>
      </button>`;
    }).join('');
    $('cards').querySelectorAll('canvas[data-ico]').forEach(drawIcon);
    try {
      const { kota } = await fetch('/api/kerja/kota').then(r => r.json());
      $('kota').innerHTML = Object.values(kota).map(v => `<li><b>${fmt(v.total)}</b> ${esc(v.unit)}<small>${esc(v.name)} · ${v.orang} warga</small></li>`).join('');
    } catch (e) { $('kota').innerHTML = '<li><small>Belum tersedia</small></li>'; }
  }
  function drawIcon(c) {
    const g = MAKERS[c.dataset.ico](AL.rng(7)), x = c.getContext('2d');
    x.save(); x.scale(240 / W, 160 / (H * 0.45)); x.translate(0, -H * 0.2);
    g.draw(x, 6); x.restore();
  }

  function show(id) { ['home', 'play', 'end'].forEach(s => { $(s).hidden = s !== id; }); }

  async function start(game) {
    let round = null, seed;
    if (token) {
      try { const r = await api('/api/kerja/mulai', { game }); round = r.round; seed = r.seed; }
      catch (e) { alert(e.message); return; }
    } else seed = Math.floor(Math.random() * 2 ** 31);
    const g = MAKERS[game](AL.rng(seed));
    if (run) { run.over = true; clearTimeout(run.timer); }
    run = { game, g, round, t0: performance.now() + 3000, over: false };
    // cadangan: ronde tetap selesai walau tab disembunyikan (requestAnimationFrame berhenti)
    run.timer = setTimeout(finish, 3000 + DUR * 1000 + 150);
    $('hudGame').textContent = { nelayan: 'Pancing Teluk', petani: 'Panen Kilat', kurir: 'Sortir Paket' }[game];
    $('hint').textContent = g.hint;
    $('carts').hidden = !g.carts;
    if (g.carts) {
      $('carts').innerHTML = g.COLS.map((k, i) => `<button type="button" data-cart="${i}" aria-label="Gerobak ${k.name}"><span></span>${k.name}</button>`).join('');
      $('carts').querySelectorAll('[data-cart]').forEach((b, i) => {
        b.querySelector('span').style.background = g.COLS[i].col;
        b.addEventListener('pointerdown', e => { e.preventDefault(); const t = now(); if (t >= 0 && t < DUR) g.pick(i, t); });
      });
    }
    show('play');
    requestAnimationFrame(loop);
  }
  const now = () => (performance.now() - run.t0) / 1000;
  let last = 0;
  function loop(ts) {
    if (!run || run.over) return;
    const t = now(), dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    ctx.clearRect(0, 0, W, H);
    if (t < 0) {
      run.g.draw(ctx, 0);
      ctx.fillStyle = 'rgba(20,50,74,.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = C.paper; ctx.font = '800 72px "Plus Jakarta Sans", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.ceil(-t), W / 2, H / 2);
      $('hudTime').textContent = DUR;
    } else {
      run.g.update(dt, Math.min(t, DUR));
      run.g.draw(ctx, Math.min(t, DUR));
      $('hudTime').textContent = Math.max(0, Math.ceil(DUR - t));
      if (t >= DUR) return finish();
    }
    $('hudScore').textContent = run.g.score;
    requestAnimationFrame(loop);
  }
  cv.addEventListener('pointerdown', e => {
    if (!run || run.over) return;
    const t = now(); if (t < 0 || t >= DUR) return;
    const r = cv.getBoundingClientRect();
    run.g.tap((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height, t);
  });

  async function finish() {
    if (!run || run.over) return;
    run.over = true;
    clearTimeout(run.timer);
    const score = Math.max(0, run.g.score), game = run.game;
    $('endScore').textContent = score; $('endUnit').textContent = UNIT[game];
    $('endKoin').textContent = ''; $('endNote').textContent = '';
    show('end');
    if (!run.round) { $('endKicker').textContent = 'Latihan selesai'; $('endNote').textContent = 'Masuk sebagai warga supaya hasil kerjamu dibayar koin.'; return; }
    $('endKicker').textContent = 'Ronde selesai';
    $('endKoin').textContent = 'Menghitung upah…';
    try {
      const r = await api('/api/kerja/selesai', { round: run.round, score });
      $('endKoin').innerHTML = r.koin > 0 ? `+<b>${fmt(r.koin)}</b> koin masuk dompet` : 'Belum ada koin dari ronde ini';
      $('endNote').textContent = [r.bonus ? 'Termasuk bonus profesi ×1,5.' : '', r.terpotong ? `Upah dipotong: batas koin kerja hari ini tercapai (sisa ${fmt(r.sisaHariIni)}).` : `Sisa batas hari ini ${fmt(r.sisaHariIni)} koin.`].filter(Boolean).join(' ');
    } catch (e) { $('endKoin').textContent = ''; $('endNote').textContent = e.message; }
  }

  $('cards').addEventListener('click', e => { const b = e.target.closest('[data-game]'); if (b) start(b.dataset.game); });
  $('again').addEventListener('click', () => start(run.game));
  $('toHome').addEventListener('click', () => { show('home'); loadHome(); });
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
