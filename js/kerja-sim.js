/* AUDIRA LAND · Simulasi mini-game kerja (logika + gambar). Dipakai peramban (js/kerja.js) dan server
   (server/kerja-sim-node.mjs) supaya skor bisa diputar ulang di server dari seed + daftar ketukan.
   Langkah tetap 1/60 dtk: ketukan dicatat pada nomor langkah, jadi hasilnya sama persis di kedua sisi. */
window.AL = window.AL || {};
(function (AL) {
  'use strict';
  const W = 360, H = 520, DUR = 30, HZ = 60, STEP = 1 / HZ, N = DUR * HZ;
  const MAX_EV = 360;   // ketukan maks per ronde (±12 per detik)

  // warna (art bible bag. 4): benda dunia ≤45% saturasi; koral hanya "kamu"/aksi; emas pudar untuk benda
  const C = {
    ink: '#14324a', paper: '#fffaf0', salem: '#d9967c', tealDim: '#5f9e98', blueDim: '#6a74ad',
    gold: '#c9b07e', sky: '#cfe0e3', sea1: '#8fbcc6', sea2: '#5f8fa0', wood: '#a88a68', shoe: '#6b5a4a',
    paddy: '#b9c79a', sprout: '#8fb27a', ripe: '#d1b77f', wilt: '#9a8466', mud: '#8c7a5e', you: '#ff7a59',
  };

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

  // Ronde: k = langkah yang sudah dijalankan. Ketukan diterapkan pada waktu k*STEP lalu dicatat [k, x, y]
  // (kurir lewat tombol gerobak: [k, -1, gerobak]).
  function ronde(game, seed) {
    const g = MAKERS[game](AL.rng(seed));
    const r = { g, k: 0, ev: [] };
    r.t = () => r.k * STEP;
    r.done = () => r.k >= N;
    r.advance = () => { if (r.k < N) { g.update(STEP, (r.k + 1) * STEP); r.k++; } };
    r.until = k => { while (r.k < Math.min(k, N)) r.advance(); };
    r.input = (x, y) => {
      if (r.k >= N || r.ev.length >= MAX_EV) return false;
      x = Math.round(x); y = Math.round(y);
      if (x !== -1) { x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H, y)); }
      const e = [r.k, x, y];
      if (x === -1) { if (!g.pick || y < 0 || y > 2) return false; g.pick(y, r.t()); }
      else g.tap(x, y, r.t());
      r.ev.push(e);
      return true;
    };
    r.score = () => Math.max(0, g.score);
    return r;
  }

  // Putar ulang di server. null = daftar ketukan tidak sah.
  function replay(game, seed, ev) {
    if (!MAKERS[game] || !Array.isArray(ev) || ev.length > MAX_EV) return null;
    const r = ronde(game, seed);
    let prev = 0;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (!Array.isArray(e) || e.length !== 3 || !e.every(Number.isInteger)) return null;
      const [k, x, y] = e;
      if (k < prev || k >= N || x < -1 || x > W || y < -1 || y > H) return null;
      // manusia tidak mengetuk >15 kali dalam 1 detik
      if (i >= 15 && k - ev[i - 15][0] < HZ) return null;
      prev = k;
      r.until(k);
      if (!r.input(x, y)) return null;
    }
    r.until(N);
    return { score: r.score(), taps: ev.length };
  }

  AL.kerjaSim = { W, H, DUR, HZ, STEP, N, MAX_EV, MAKERS, UNIT, C, ronde, replay };
})(window.AL);
