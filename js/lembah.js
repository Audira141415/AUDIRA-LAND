/* AUDIRA LAND · Gunung Lembayung & Lembah Padi di barat Kampung Nyiur (City Have Not).
   Bentuk dari js/world.js (AL.lembah, AL.gunungH, AL.PEAKS). File ini menggambar:
   - gunung bertingkat (undak-undak isometrik) dengan hutan di lereng dan kabut di puncak,
   - tanah calon sawah: tanah dibersihkan, pematang, patok, dan papan "CALON SAWAH",
   - kartu info saat gunung/lembah diketuk.
   Digambar di lapisan tanah (sebelum bangunan): semua yang ada di depan gunung tetap menimpanya. */
(function (AL) {
  'use strict';
  if (!AL || !AL.lembah || !AL.buildGround) return;
  const { W, H, TW, TH } = AL;
  const L = AL.lembah, GH = AL.gunungH;
  const hAt = (x, y) => (x >= 0 && y >= 0 && x < W && y < H && L[y * W + x] === 1 ? GH[y * W + x] : 0);

  // warna lereng menurut ketinggian (≤45% saturasi, art bible)
  const tone = h => (h < 1 ? '#97bf7f' : h < 2.2 ? '#86b26f' : h < 3.5 ? '#719d60' : h < 4.6 ? '#6c8a62' : h < 5.4 ? '#87907f' : '#a3a69a');

  let G = null; // data gunung & sawah (dibuat sekali, koordinat dunia)
  function build() {
    const cols = [], soil = new Path2D(), dikes = new Path2D(), stakes = [];
    let nSawah = 0, sign = null, bestSign = 1e9;
    const S = AL.SAWAH, mid = { x: (S.x0 + S.x1) / 2 - 2, y: (S.y0 + S.y1) / 2 };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = L[y * W + x];
      if (m === 1) cols.push({ x, y, h: GH[y * W + x], k: x + y });
      else if (m === 2) {
        nSawah++;
        const a = AL.toWorld(x, y), b = AL.toWorld(x + 1, y), c = AL.toWorld(x + 1, y + 1), d = AL.toWorld(x, y + 1);
        soil.moveTo(a.x, a.y); soil.lineTo(b.x, b.y); soil.lineTo(c.x, c.y); soil.lineTo(d.x, d.y); soil.closePath();
        // pematang tiap 3 petak (calon petak sawah) + patok di sudutnya
        if (y % 3 === 0) { dikes.moveTo(a.x, a.y); dikes.lineTo(b.x, b.y); }
        if (x % 3 === 0) { dikes.moveTo(a.x, a.y); dikes.lineTo(d.x, d.y); }
        if (x % 3 === 0 && y % 3 === 0) stakes.push(a);
        const dd = Math.hypot(x - mid.x, y - mid.y);
        if (dd < bestSign) { bestSign = dd; sign = { x, y }; }
      }
    }
    cols.sort((p, q) => p.k - q.k || p.x - q.x);
    for (const c of cols) {
      c.hy = hAt(c.x, c.y + 1); c.hx = hAt(c.x + 1, c.y);
      c.col = tone(c.h);
      const r = AL.ihash(c.x, c.y, 71);
      c.tree = c.h > 0.6 && c.h < 4.7 && r < 0.55 ? { u: 0.25 + AL.ihash(c.x, c.y, 72) * 0.5, v: 0.25 + AL.ihash(c.x, c.y, 73) * 0.5, s: 0.75 + r * 0.6, kind: c.h > 2.6 ? 1 : 0 } : null;
      const w = AL.toWorld(c.x + 0.5, c.y + 0.5, c.h);
      c.wx = w.x; c.wy = w.y;
    }
    G = { cols, soil, dikes, stakes, nSawah, sign, nGunung: cols.length };
    AL.lembahInfo = { nSawah, nGunung: cols.length };
  }

  const baseBuild = AL.buildGround;
  AL.buildGround = function () { baseBuild.apply(this, arguments); build(); };

  function poly(ctx, pts, color) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function pohon(ctx, x, y, s, kind, v) {
    // kind 0 = pohon bulat (lereng bawah), 1 = cemara gunung (lereng atas)
    ctx.fillStyle = 'rgba(25,45,70,.18)';
    ctx.beginPath(); ctx.ellipse(x + 3 * s, y + 1, 6 * s, 2.4 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6e5236'; ctx.fillRect(x - 0.9 * s, y - 5 * s, 1.8 * s, 5 * s);
    if (kind) {
      const g = v < 0.5 ? ['#4d7a4b', '#5d8b57'] : ['#557f50', '#66935d'];
      ctx.fillStyle = g[0]; ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 4 * s); ctx.lineTo(x + 6 * s, y - 4 * s); ctx.lineTo(x, y - 15 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = g[1]; ctx.beginPath(); ctx.moveTo(x - 4.5 * s, y - 10 * s); ctx.lineTo(x + 4.5 * s, y - 10 * s); ctx.lineTo(x, y - 19 * s); ctx.closePath(); ctx.fill();
    } else {
      const g = v < 0.5 ? ['#5a924d', '#73a95d'] : ['#679a4f', '#82b465'];
      ctx.fillStyle = g[0]; ctx.beginPath(); ctx.arc(x, y - 9 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = g[1]; ctx.beginPath(); ctx.arc(x - 2 * s, y - 11 * s, 3.6 * s, 0, Math.PI * 2); ctx.fill();
    }
  }

  function gambar(ctx, cam, vw, vh, dpr, t) {
    if (!G) return;
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
    const wx0 = cam.x - vw / 2 / z - TW, wx1 = cam.x + vw / 2 / z + TW, wy0 = cam.y - vh / 2 / z - TH * 8, wy1 = cam.y + vh / 2 / z + TH * 2;

    // tanah calon sawah: tanah gembur, pematang, patok bambu
    ctx.fillStyle = '#c7ad80'; ctx.fill(G.soil);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(126,152,86,.85)'; ctx.lineWidth = 2.4; ctx.stroke(G.dikes);
    ctx.strokeStyle = 'rgba(255,248,230,.35)'; ctx.lineWidth = 0.8; ctx.stroke(G.dikes);
    if (z > 0.5) {
      ctx.strokeStyle = '#9b7b4d'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const p of G.stakes) { if (p.x < wx0 || p.x > wx1 || p.y < wy0 || p.y > wy1) continue; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 7); }
      ctx.stroke();
    }

    // gunung: kolom per petak, belakang ke depan; sisi depan turun sampai tinggi tetangga
    const hl = 'rgba(255,255,255,.22)';
    for (const c of G.cols) {
      if (c.wx < wx0 || c.wx > wx1 || c.wy < wy0 - c.h * TH || c.wy > wy1 + c.h * TH) continue;
      const { x, y, h } = c;
      const a = AL.toWorld(x, y, h), b = AL.toWorld(x + 1, y, h), cc = AL.toWorld(x + 1, y + 1, h), d = AL.toWorld(x, y + 1, h);
      if (h > c.hy) poly(ctx, [d, cc, AL.toWorld(x + 1, y + 1, c.hy), AL.toWorld(x, y + 1, c.hy)], AL.shade(c.col, 0.84));
      if (h > c.hx) poly(ctx, [b, cc, AL.toWorld(x + 1, y + 1, c.hx), AL.toWorld(x + 1, y, c.hx)], AL.shade(c.col, 0.68));
      poly(ctx, [a, b, cc, d], c.col);
      if (z > 0.45 && (h > c.hy || h > c.hx)) {
        ctx.strokeStyle = hl; ctx.lineWidth = 1;
        ctx.beginPath();
        if (h > c.hy) { ctx.moveTo(d.x, d.y); ctx.lineTo(cc.x, cc.y); }
        if (h > c.hx) { ctx.moveTo(cc.x, cc.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
      }
      if (c.tree && z > 0.38) {
        const p = AL.toWorld(x + c.tree.u, y + c.tree.v, h);
        pohon(ctx, p.x, p.y, c.tree.s, c.tree.kind, c.tree.u);
      }
    }

    // papan "CALON SAWAH" di tengah lembah
    if (G.sign && z > 0.4) {
      const p = AL.toWorld(G.sign.x + 0.5, G.sign.y + 0.5);
      ctx.fillStyle = 'rgba(25,45,70,.2)'; ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 1, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5a38'; ctx.fillRect(p.x - 20, p.y - 24, 2.4, 24); ctx.fillRect(p.x + 19, p.y - 24, 2.4, 24);
      ctx.fillStyle = '#efe6d2'; ctx.strokeStyle = '#7a5a38'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(p.x - 32, p.y - 41, 66, 21, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#14324a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 7.5px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillText('CALON SAWAH', p.x + 1, p.y - 33.5);
      ctx.font = '700 5.5px "Plus Jakarta Sans", system-ui, sans-serif'; ctx.fillStyle = '#4a6275'; ctx.fillText('Lembah Padi', p.x + 1, p.y - 25.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // kabut tipis yang bergeser pelan di sekitar puncak
    const night = AL.nightFactor ? AL.nightFactor() : 0;
    for (let k = 0; k < AL.PEAKS.length - 1; k++) {
      const pk = AL.PEAKS[k], p = AL.toWorld(pk.x + 0.5, pk.y + 0.5, pk.h * 0.78);
      for (let j = 0; j < 3; j++) {
        const dx = Math.sin(t * 0.07 + k * 2 + j * 2.1) * 26 + (j - 1) * 30, dy = j * 7 - 6;
        const g = ctx.createRadialGradient(p.x + dx, p.y + dy, 0, p.x + dx, p.y + dy, 46);
        const a = (0.32 - 0.18 * night) * (j === 1 ? 1 : 0.7);
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x + dx, p.y + dy, 46, 16, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const baseDraw = AL.drawGround;
  AL.drawGround = function (ctx, cam, vw, vh, dpr, t) {
    baseDraw.apply(this, arguments);
    gambar(ctx, cam, vw, vh, dpr, t);
  };

  // ---------- kartu info: ketuk gunung atau lembah ----------
  // titik layar -> petak gunung/lembah (cek beberapa ketinggian, yang paling depan menang)
  AL.lembahAt = function (sx, sy, cam, vw, vh) {
    const z = cam.zoom, wx = (sx - vw / 2) / z + cam.x, wy = (sy - vh / 2) / z + cam.y;
    for (let k = 20; k >= 0; k--) {
      const hh = k * 0.35, p = AL.toTile(wx, wy + hh * TH), x = Math.floor(p.tx), y = Math.floor(p.ty);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const m = L[y * W + x];
      if (m === 1 && Math.abs(GH[y * W + x] - hh) < 0.18) return 1;
      if (m === 2 && k === 0) return 2;
    }
    return 0;
  };
  AL.lembahCard = function (m) {
    const n = AL.lembahInfo || { nSawah: 0 };
    const pk = AL.PEAKS;
    return `
      <button class="close" aria-label="Tutup">×</button>
      <p class="kicker">Alam ${AL.esc(AL.DISTRICT.kampung)}</p>
      <h2>${m === 2 ? 'Lembah Padi' : 'Gunung Lembayung'}</h2>
      <p class="since">${m === 2
        ? 'Tanah kosong luas di kaki Gunung Lembayung, sudah dibersihkan dan dibagi pematang. Nanti digarap jadi sawah untuk petani kampung.'
        : 'Dua puncak yang menjaga barat kampung: Puncak Lembayung di utara dan Puncak Sari di selatan. Di antaranya terbentang Lembah Padi.'}</p>
      <div class="chips"><span>Calon sawah: ${n.nSawah.toLocaleString('id-ID')} petak</span><span>Puncak Lembayung · ${(pk[0].h * 150).toLocaleString('id-ID')} m</span><span>Puncak Sari · ${(pk[1].h * 150).toLocaleString('id-ID')} m</span></div>`;
  };
})(window.AL);
