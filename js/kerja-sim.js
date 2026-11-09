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
  // teks melayang (+1/−1) bergaris krem supaya terbaca di latar apa pun
  function popText(c, text, x, y, col, a) {
    c.globalAlpha = Math.max(0, a); c.font = '800 22px "Plus Jakarta Sans", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = C.paper; c.strokeText(text, x, y);
    c.fillStyle = col; c.fillText(text, x, y); c.globalAlpha = 1;
  }

  // ---------- Koki · Dapur Warung ----------
  // Pesanan datang terjadwal (seed). Satu pesanan aktif di loket; ketuk bahan sesuai urutan di nota.
  // Skor maks = 2 × jumlah pesanan terjadwal (tetap, tidak tergantung seed).
  const ING = [
    { id: 'nasi', name: 'Nasi' }, { id: 'ayam', name: 'Ayam' }, { id: 'telur', name: 'Telur' },
    { id: 'tempe', name: 'Tempe' }, { id: 'sambal', name: 'Sambal' }, { id: 'esteh', name: 'Es teh' },
  ];
  const BIN = { x0: 12, y0: 334, w: 108, h: 84, gap: 6 };
  const binAt = (x, y) => {
    const cx = Math.floor((x - BIN.x0) / (BIN.w + BIN.gap)), cy = Math.floor((y - BIN.y0) / (BIN.h + BIN.gap));
    if (cx < 0 || cx > 2 || cy < 0 || cy > 1) return -1;
    const lx = x - BIN.x0 - cx * (BIN.w + BIN.gap), ly = y - BIN.y0 - cy * (BIN.h + BIN.gap);
    return lx <= BIN.w && ly <= BIN.h ? cy * 3 + cx : -1;
  };
  function drawIng(c, id, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    if (id === 'nasi') {
      c.fillStyle = C.gold; c.beginPath(); c.moveTo(-16, 2); c.lineTo(16, 2); c.lineTo(11, 13); c.lineTo(-11, 13); c.closePath(); c.fill();
      c.fillStyle = '#f7f3ea'; c.beginPath(); c.ellipse(0, 2, 15, 12, 0, Math.PI, 0); c.fill();
      c.strokeStyle = 'rgba(20,50,74,.25)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, 2, 15, 12, 0, Math.PI, 0); c.stroke();
    } else if (id === 'ayam') {
      c.fillStyle = '#b98046'; c.beginPath(); c.ellipse(-3, 0, 13, 10, -0.5, 0, 7); c.fill();
      c.fillStyle = '#f2e8d4'; c.fillRect(6, 4, 9, 4); c.beginPath(); c.arc(16, 4, 3, 0, 7); c.arc(16, 9, 3, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-7, -4, 4, 2.5, -0.5, 0, 7); c.fill();
    } else if (id === 'telur') {
      c.fillStyle = '#f7f3ea'; c.beginPath(); c.moveTo(-15, 2); c.bezierCurveTo(-16, -12, 4, -14, 14, -6); c.bezierCurveTo(19, 4, 6, 12, -4, 10); c.bezierCurveTo(-12, 9, -14, 6, -15, 2); c.fill();
      c.fillStyle = '#e3b85c'; c.beginPath(); c.arc(0, -1, 6, 0, 7); c.fill();
    } else if (id === 'tempe') {
      c.fillStyle = '#cdb38a'; c.beginPath(); c.roundRect(-15, -9, 30, 18, 3); c.fill();
      c.fillStyle = '#a88a68';
      for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(-10 + (i % 4) * 7 + (i > 3 ? 3 : 0), i > 3 ? 4 : -3, 1.6, 0, 7); c.fill(); }
    } else if (id === 'sambal') {
      c.fillStyle = C.ink; c.beginPath(); c.ellipse(0, 4, 15, 9, 0, 0, Math.PI); c.fill();
      c.fillStyle = '#b5654f'; c.beginPath(); c.ellipse(0, 3, 14, 5, 0, 0, 7); c.fill();
      c.fillStyle = '#8fb27a'; c.beginPath(); c.ellipse(9, -2, 5, 2, -0.6, 0, 7); c.fill();
    } else {
      c.fillStyle = 'rgba(255,255,255,.65)'; c.beginPath(); c.moveTo(-10, -14); c.lineTo(10, -14); c.lineTo(7, 14); c.lineTo(-7, 14); c.closePath(); c.fill();
      c.fillStyle = '#c08a4f'; c.beginPath(); c.moveTo(-9, -6); c.lineTo(9, -6); c.lineTo(7, 13); c.lineTo(-7, 13); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(-6, -4, 5, 5); c.fillRect(1, 0, 5, 5);
      c.strokeStyle = C.tealDim; c.lineWidth = 2; c.beginPath(); c.moveTo(3, -6); c.lineTo(7, -19); c.stroke();
    }
    c.restore();
  }

  function koki(rng) {
    const g = { score: 0, hint: 'Ketuk bahan sesuai urutan di nota. Cepat +2, selesai +1, salah bahan −1.' };
    const orders = [];
    for (let t = 0.6, gap = 2; t < DUR - 1; t += gap, gap = Math.max(0.85, gap * 0.95)) {
      const items = ['nasi'], lauk = ['ayam', 'telur', 'tempe'];
      const a = Math.floor(rng() * 3); items.push(lauk[a]);
      if (rng() < 0.25) items.push(lauk[(a + 1 + Math.floor(rng() * 2)) % 3]);
      if (rng() < 0.55) items.push('sambal');
      if (items.length < 4 && rng() < 0.4) items.push('esteh');
      orders.push({ t0: t, items, look: Math.floor(rng() * 4) });
    }
    g.orders = orders.length;
    g.want = () => (cur ? cur.o.items[cur.i] : null); // untuk uji/bot
    let qi = 0, cur = null, nextAt = 0, fx = [], flash = { i: -1, t: -9, ok: true };
    g.update = (dt, t) => {
      if (cur && t > cur.ts + cur.lim) { fx.push({ t, text: 'Kelamaan', col: C.wilt }); cur = null; nextAt = t + 0.35; }
      if (!cur && qi < orders.length && orders[qi].t0 <= t && t >= nextAt) {
        const o = orders[qi++], n = o.items.length;
        cur = { o, ts: t, i: 0, lim: (2.2 + 1.1 * n) * (1 - 0.25 * t / DUR) };
      }
      fx = fx.filter(f => t - f.t < 0.9);
    };
    g.tap = (x, y, t) => {
      const b = binAt(x, y);
      if (b < 0 || !cur) return;
      const ok = ING[b].id === cur.o.items[cur.i];
      flash = { i: b, t, ok };
      if (!ok) { g.score -= 1; fx.push({ t, text: '−1 salah', col: C.wilt }); return; }
      cur.i++;
      if (cur.i === cur.o.items.length) {
        const cepat = t - cur.ts <= cur.lim * 0.5;
        g.score += cepat ? 2 : 1;
        fx.push({ t, text: cepat ? '+2 cepat!' : '+1', col: C.tealDim });
        cur = null; nextAt = t + 0.35;
      }
    };
    const person = (c, x, y, look, s) => {
      const shirt = [C.salem, C.tealDim, C.blueDim, C.gold][look], skin = ['#e0b48c', '#c99a72', '#ad7f5b', '#e8c39e'][look];
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = shirt; c.beginPath(); c.roundRect(-18, 0, 36, 44, 12); c.fill();
      c.fillStyle = skin; c.beginPath(); c.arc(0, -14, 14, 0, 7); c.fill();
      c.fillStyle = C.ink;
      if (look % 2) { c.beginPath(); c.arc(0, -17, 14.5, Math.PI, 0); c.fill(); } else { c.fillRect(-14, -29, 28, 8); }
      c.beginPath(); c.arc(-5, -12, 1.8, 0, 7); c.arc(5, -12, 1.8, 0, 7); c.fill();
      c.restore();
    };
    g.draw = (c, t) => {
      c.fillStyle = '#efe2c8'; c.fillRect(0, 0, W, H);
      // tenda warung bergaris
      for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? C.paper : C.salem; c.fillRect(i * 40, 0, 40, 34); c.beginPath(); c.arc(i * 40 + 20, 34, 20, 0, Math.PI); c.fill(); }
      c.fillStyle = C.ink; c.font = '800 13px "Plus Jakarta Sans", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = C.paper; c.beginPath(); c.roundRect(W / 2 - 62, 60, 124, 22, 11); c.fill();
      c.fillStyle = C.ink; c.fillText('WARUNG AUDIRA', W / 2, 71);
      // antrean pembeli (yang belum dilayani)
      let qn = 0;
      for (let k = qi; k < orders.length && orders[k].t0 <= t && qn < 4; k++, qn++) person(c, W - 34 - qn * 26, 128, orders[k].look, 0.55);
      // pembeli aktif + nota
      if (cur) {
        person(c, 54, 128, cur.o.look, 1);
        const n = cur.o.items.length, nw = 52 * n + 16, nx = Math.min(W - nw - 8, 100);
        c.fillStyle = C.paper; c.beginPath(); c.roundRect(nx, 96, nw, 74, 12); c.fill();
        c.strokeStyle = 'rgba(20,50,74,.2)'; c.lineWidth = 1.5; c.stroke();
        cur.o.items.forEach((id, i) => {
          const ix = nx + 34 + i * 52;
          c.globalAlpha = i < cur.i ? 0.3 : 1; drawIng(c, id, ix, 124, 0.95); c.globalAlpha = 1;
          if (i < cur.i) { c.strokeStyle = C.tealDim; c.lineWidth = 3.5; c.beginPath(); c.moveTo(ix - 8, 124); c.lineTo(ix - 2, 131); c.lineTo(ix + 10, 115); c.stroke(); }
          if (i === cur.i) { c.strokeStyle = C.you; c.lineWidth = 2.5; c.beginPath(); c.roundRect(ix - 23, 102, 46, 42, 9); c.stroke(); }
        });
        const p = Math.max(0, 1 - (t - cur.ts) / cur.lim);
        c.fillStyle = 'rgba(20,50,74,.12)'; c.beginPath(); c.roundRect(nx + 10, 152, nw - 20, 8, 4); c.fill();
        c.fillStyle = p > 0.5 ? C.tealDim : p > 0.25 ? C.gold : C.wilt; c.beginPath(); c.roundRect(nx + 10, 152, Math.max(8, (nw - 20) * p), 8, 4); c.fill();
      } else if (qi >= orders.length) {
        c.fillStyle = C.ink; c.font = '700 15px "Plus Jakarta Sans", system-ui'; c.fillText('Warung tutup sebentar lagi…', W / 2, 130);
      }
      // meja saji + piring
      c.fillStyle = C.wood; c.fillRect(0, 186, W, 18);
      c.fillStyle = '#d9cdb2'; c.fillRect(0, 204, W, 120);
      c.fillStyle = C.paper; c.beginPath(); c.ellipse(W / 2, 262, 110, 42, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(20,50,74,.15)'; c.lineWidth = 2; c.beginPath(); c.ellipse(W / 2, 262, 88, 32, 0, 0, 7); c.stroke();
      if (cur) cur.o.items.slice(0, cur.i).forEach((id, i) => drawIng(c, id, W / 2 - (cur.i - 1) * 24 + i * 48, 258, 1.2));
      // laci bahan
      ING.forEach((b, i) => {
        const x = BIN.x0 + (i % 3) * (BIN.w + BIN.gap), y = BIN.y0 + Math.floor(i / 3) * (BIN.h + BIN.gap);
        c.fillStyle = '#f6efe0'; c.beginPath(); c.roundRect(x, y, BIN.w, BIN.h, 14); c.fill();
        c.strokeStyle = 'rgba(20,50,74,.18)'; c.lineWidth = 1.5; c.stroke();
        drawIng(c, b.id, x + BIN.w / 2, y + 34, 1.3);
        c.fillStyle = C.ink; c.font = '700 13px "Plus Jakarta Sans", system-ui'; c.fillText(b.name, x + BIN.w / 2, y + BIN.h - 13);
        if (flash.i === i && t - flash.t < 0.3) { c.globalAlpha = 0.45 * (1 - (t - flash.t) / 0.3); c.fillStyle = flash.ok ? C.tealDim : C.wilt; c.beginPath(); c.roundRect(x, y, BIN.w, BIN.h, 14); c.fill(); c.globalAlpha = 1; }
      });
      for (const f of fx) popText(c, f.text, W / 2, 232 - (t - f.t) * 30, f.col, 1 - (t - f.t) / 0.9);
    };
    return g;
  }

  // ---------- Polisi · Razia Helm ----------
  // Motor lewat di 3 lajur, makin lama makin cepat & rapat. Ketuk pengendara/pembonceng tanpa helm.
  // Skor maks = jumlah motor melanggar ≤ jumlah motor terjadwal (tetap).
  const LANES = [{ y: 214, dir: 1 }, { y: 292, dir: -1 }, { y: 370, dir: 1 }];
  function polisi(rng) {
    const g = { score: 0, hint: 'Ketuk motor yang pengendaranya TANPA helm (+1). Yang pakai helm jangan (−1).' };
    const PAL = [C.salem, C.tealDim, C.blueDim, C.gold, '#8a8f99'];
    const motors = [];
    for (let t = 0.4, gap = 0.95; t < DUR - 0.5; t += gap, gap = Math.max(0.4, gap * 0.972)) {
      const lane = Math.floor(rng() * 3), v = (95 + t * 4.5) * (0.92 + rng() * 0.2);
      const helm = rng() >= 0.42, pas = rng() < 0.22, pasHelm = pas ? rng() >= 0.35 : true;
      motors.push({ t0: t, lane, v, helm, pas, pasHelm, viol: !helm || !pasHelm, body: PAL[Math.floor(rng() * 5)], hc: PAL[Math.floor(rng() * 5)], skin: Math.floor(rng() * 3), done: '', dt: 0 });
    }
    g.motors = motors.length;
    // untuk uji/bot: motor di layar {x, y, viol}
    g.live = t => motors.filter(m => !m.done && t >= m.t0).map(m => ({ x: mx(m, t), y: LANES[m.lane].y, viol: m.viol })).filter(m => m.x > 0 && m.x < W);
    const mx = (m, t) => (LANES[m.lane].dir > 0 ? -50 + (t - m.t0) * m.v : W + 50 - (t - m.t0) * m.v);
    let fx = [];
    g.update = (dt, t) => {
      for (const m of motors) {
        if (m.done || t < m.t0 || !m.viol) continue;
        const x = mx(m, t);
        if (x < -60 || x > W + 60) { m.done = 'lolos'; m.dt = t; fx.push({ t, text: 'Lolos', x: LANES[m.lane].dir > 0 ? W - 40 : 40, y: LANES[m.lane].y - 40, col: C.wilt }); }
      }
      fx = fx.filter(f => t - f.t < 0.8);
    };
    g.tap = (x, y, t) => {
      let best = null, bd = 1e9;
      for (const m of motors) {
        if (m.done || t < m.t0) continue;
        const L = LANES[m.lane], d = Math.abs(mx(m, t) - x);
        if (d < 36 && y >= L.y - 66 && y <= L.y + 18 && d < bd) { best = m; bd = d; }
      }
      if (!best) return;
      best.dt = t;
      if (best.viol) { best.done = 'tilang'; g.score += 1; fx.push({ t, text: '+1', x, y: y - 10, col: C.tealDim }); }
      else { best.done = 'salah'; g.score -= 1; fx.push({ t, text: '−1', x, y: y - 10, col: C.wilt }); }
    };
    const SKIN = ['#e0b48c', '#c99a72', '#ad7f5b'];
    const rider = (c, x, y, helm, hc, skin, shirt) => {
      c.fillStyle = shirt; c.beginPath(); c.roundRect(x - 8, y - 30, 16, 24, 6); c.fill();
      c.fillStyle = SKIN[skin]; c.beginPath(); c.arc(x, y - 40, 9, 0, 7); c.fill();
      if (helm) {
        c.fillStyle = hc; c.beginPath(); c.arc(x, y - 42, 12, Math.PI * 0.95, Math.PI * 0.05 + Math.PI * 2); c.closePath(); c.fill();
        c.fillStyle = 'rgba(20,50,74,.75)'; c.fillRect(x - 3, y - 44, 15, 4);
        c.strokeStyle = C.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y - 42, 12, Math.PI, 0); c.stroke();
      } else {
        c.fillStyle = C.ink; c.beginPath(); c.arc(x, y - 43, 9.5, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        c.fillRect(x - 9, y - 47, 6, 9);
      }
    };
    g.draw = (c, t) => {
      // trotoar & toko
      c.fillStyle = '#e9dfc4'; c.fillRect(0, 0, W, 170);
      for (let i = 0; i < 4; i++) {
        const x = 8 + i * 90; c.fillStyle = [C.salem, C.tealDim, C.gold, C.blueDim][i]; c.globalAlpha = 0.55; c.fillRect(x, 40, 80, 100); c.globalAlpha = 1;
        c.fillStyle = '#fff6df'; c.fillRect(x + 10, 62, 24, 30); c.fillRect(x + 46, 62, 24, 30);
      }
      c.fillStyle = C.paper; c.beginPath(); c.roundRect(W / 2 - 78, 10, 156, 24, 12); c.fill();
      c.fillStyle = C.ink; c.font = '800 13px "Plus Jakarta Sans", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RAZIA HELM · POLSEK AUDIRA', W / 2, 22);
      c.fillStyle = '#d6cbb2'; c.fillRect(0, 140, W, 30);
      // jalan
      c.fillStyle = '#9a968c'; c.fillRect(0, 170, W, 236);
      c.strokeStyle = 'rgba(255,250,240,.7)'; c.lineWidth = 3; c.setLineDash([22, 18]);
      const off = (t * 60) % 40;
      for (const yy of [253, 331]) { c.beginPath(); c.moveTo(-off, yy); c.lineTo(W + 40, yy); c.stroke(); }
      c.setLineDash([]);
      // motor
      for (const m of motors) {
        if (t < m.t0) continue;
        const x = mx(m, t); if (x < -70 || x > W + 70) continue;
        if (m.done === 'tilang' && t - m.dt > 0.9) continue;
        const L = LANES[m.lane], y = L.y;
        c.save(); c.translate(x, 0);
        if (m.done === 'tilang') c.globalAlpha = 1 - Math.max(0, t - m.dt - 0.5) / 0.4;
        c.scale(L.dir, 1);
        c.fillStyle = 'rgba(20,50,74,.18)'; c.beginPath(); c.ellipse(0, y + 12, 32, 5, 0, 0, 7); c.fill();
        c.fillStyle = C.ink; c.beginPath(); c.arc(-20, y + 4, 9, 0, 7); c.arc(20, y + 4, 9, 0, 7); c.fill();
        c.fillStyle = '#d9d4c8'; c.beginPath(); c.arc(-20, y + 4, 3.5, 0, 7); c.arc(20, y + 4, 3.5, 0, 7); c.fill();
        c.fillStyle = m.body; c.beginPath(); c.roundRect(-24, y - 12, 44, 14, 6); c.fill();
        c.fillRect(14, y - 22, 6, 12);
        if (m.pas) rider(c, -12, y - 2, m.pasHelm, PAL[(PAL.indexOf(m.hc) + 2) % 5], (m.skin + 1) % 3, PAL[(PAL.indexOf(m.body) + 3) % 5]);
        rider(c, 4, y - 2, m.helm, m.hc, m.skin, PAL[(PAL.indexOf(m.body) + 1) % 5]);
        c.restore();
        if (m.done === 'tilang' || m.done === 'salah') {
          c.fillStyle = m.done === 'tilang' ? C.paper : C.wilt; c.beginPath(); c.roundRect(x - 26, y - 82, 52, 18, 9); c.fill();
          c.fillStyle = m.done === 'tilang' ? C.ink : C.paper; c.font = '800 11px "Plus Jakarta Sans", system-ui'; c.fillText(m.done === 'tilang' ? 'TILANG' : 'Pakai helm', x, y - 73);
        }
      }
      // trotoar bawah + pos polisi + kamu
      c.fillStyle = '#d6cbb2'; c.fillRect(0, 406, W, 22);
      c.fillStyle = '#e9dfc4'; c.fillRect(0, 428, W, 92);
      c.fillStyle = C.blueDim; c.beginPath(); c.roundRect(20, 440, 92, 64, 8); c.fill();
      c.fillStyle = C.paper; c.fillRect(32, 452, 68, 22); c.fillStyle = C.ink; c.font = '800 12px "Plus Jakarta Sans", system-ui'; c.fillText('POS', 66, 464);
      const px = W / 2 + 40, py = 486;
      c.fillStyle = C.blueDim; c.beginPath(); c.roundRect(px - 11, py - 18, 22, 32, 7); c.fill();
      c.fillStyle = '#e0b48c'; c.beginPath(); c.arc(px, py - 27, 10, 0, 7); c.fill();
      c.fillStyle = C.you; c.beginPath(); c.roundRect(px - 12, py - 40, 24, 8, 3); c.fill(); c.fillRect(px - 8, py - 35, 18, 4);
      c.strokeStyle = C.you; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(px + 10, py - 12); c.lineTo(px + 22, py - 26 + Math.abs(((t * 2) % 2) - 1) * 6); c.stroke();
      c.fillStyle = C.ink; c.font = '700 12px "Plus Jakarta Sans", system-ui'; c.fillText('kamu', px, py + 24);
      for (const f of fx) popText(c, f.text, Math.max(30, Math.min(W - 30, f.x)), f.y - (t - f.t) * 40, f.col, 1 - (t - f.t) / 0.8);
    };
    return g;
  }

  const MAKERS = { nelayan, petani, kurir, koki, polisi };
  const UNIT = { nelayan: 'ikan', petani: 'ikat padi', kurir: 'paket', koki: 'poin', polisi: 'tilang' };

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
