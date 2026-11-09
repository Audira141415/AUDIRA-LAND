/* AUDIRA LAND · render: proyeksi isometrik, Painter, resep bangunan, cache sprite, tanah (Path2D vektor). */
(function (AL) {
  'use strict';
  const TW = 64, TH = 32;
  AL.TW = TW; AL.TH = TH;
  AL.toWorld = (tx, ty, z = 0) => ({ x: (tx - ty) * TW / 2, y: (tx + ty) * TH / 2 - z * TH });
  AL.toTile = (wx, wy) => ({ tx: wy / TH + wx / TW, ty: wy / TH - wx / TW });

  // =============== PAINTER: gambar bentuk isometrik dalam satuan petak ===============
  function Painter(ctx, s, ox, oy, night) { this.c = ctx; this.s = s; this.ox = ox; this.oy = oy; this.n = night; }
  AL.Painter = Painter;
  const P = Painter.prototype;
  P.P = function (x, y, z) { return [this.ox + (x - y) * TW / 2 * this.s, this.oy + ((x + y) * TH / 2 - z * TH) * this.s]; };
  P.col = function (c) { return this.n ? AL.mix(c, AL.NIGHT, 0.58) : c; };
  P.poly = function (pts, color, raw) {
    const c = this.c;
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = this.P(pts[i][0], pts[i][1], pts[i][2]);
      if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]);
    }
    c.closePath();
    c.fillStyle = raw ? color : this.col(color);
    c.fill();
  };
  P.box = function (x, y, w, d, z0, h, color, o) {
    o = o || {};
    const t = z0 + h;
    this.poly([[x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, t], [x, y + d, t]], AL.shade(color, 0.9));
    this.poly([[x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, t], [x + w, y, t]], AL.shade(color, 0.74));
    this.poly([[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]], o.top || AL.shade(color, 1.07));
    if (o.win) this.windows(x, y, w, d, z0, h, o);
    // oklusi di kaki dinding (benda yang berdiri di tanah) + garis sorot tepi atas: bentuk lebih tegas tanpa garis hitam
    if (z0 === 0 && h > 0.12 && w > 0.1 && d > 0.1) {
      const ah = Math.min(0.3, h * 0.45), c = this.c;
      for (const f of [[[x, y + d], [x + w, y + d]], [[x + w, y], [x + w, y + d]]]) {
        const a = this.P(f[0][0], f[0][1], 0), b = this.P(f[1][0], f[1][1], 0), a2 = this.P(f[0][0], f[0][1], ah);
        const g = c.createLinearGradient(0, a[1], 0, a2[1]);
        g.addColorStop(0, 'rgba(20,35,55,.22)'); g.addColorStop(1, 'rgba(20,35,55,0)');
        const b2 = this.P(f[1][0], f[1][1], ah);
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(b2[0], b2[1]); c.lineTo(a2[0], a2[1]); c.closePath();
        c.fillStyle = g; c.fill();
      }
    }
    if (this.s >= 0.45 && h > 0.08) {
      const c = this.c, p1 = this.P(x, y + d, t), p2 = this.P(x + w, y + d, t), p3 = this.P(x + w, y, t);
      c.strokeStyle = this.n ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.38)';
      c.lineWidth = Math.max(0.6, 0.9 * this.s); c.lineJoin = 'round';
      c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p3[0], p3[1]); c.stroke();
    }
  };
  P.winQuad = function (pts, f, dayC, rng) {
    const lit = rng() < 0.55;
    if (this.n) this.poly(pts, lit ? '#ffd57e' : '#27304d', true);
    else this.poly(pts, AL.shade(dayC, f), true);
  };
  P.windows = function (x, y, w, d, z0, h, o) {
    const fh = o.fh || 0.34, ww = o.ww || 0.16, gap = o.gap || 0.3, rng = AL.rng(o.seed || 1);
    const floors = Math.max(1, Math.floor((h - 0.12) / fh));
    const dayC = o.glass || '#a9cbe0';
    const nx = Math.max(1, Math.floor((w - 0.1) / gap)), mx = (w - nx * gap) / 2 + (gap - ww) / 2;
    const ny = Math.max(1, Math.floor((d - 0.1) / gap)), my = (d - ny * gap) / 2 + (gap - ww) / 2;
    for (let f = 0; f < floors; f++) {
      if (o.skipGround && f === 0) continue;
      const za = z0 + 0.1 + f * fh, zb = za + fh * 0.55;
      for (let i = 0; i < nx; i++) { const xa = x + mx + i * gap; this.winQuad([[xa, y + d, za], [xa + ww, y + d, za], [xa + ww, y + d, zb], [xa, y + d, zb]], 0.95, dayC, rng); }
      for (let j = 0; j < ny; j++) { const ya = y + my + j * gap; this.winQuad([[x + w, ya, za], [x + w, ya + ww, za], [x + w, ya + ww, zb], [x + w, ya, zb]], 0.78, dayC, rng); }
    }
  };
  // atap pelana, bubungan sepanjang x
  P.roofX = function (x, y, w, d, z, r, color, wall) {
    const e = 0.07, ym = y + d / 2;
    this.poly([[x - e, y - e, z], [x + w + e, y - e, z], [x + w + e, ym, z + r], [x - e, ym, z + r]], AL.shade(color, 0.8));
    this.poly([[x + w, y, z], [x + w, y + d, z], [x + w, ym, z + r]], AL.shade(wall, 0.74));
    this.poly([[x - e, y + d + e, z], [x + w + e, y + d + e, z], [x + w + e, ym, z + r], [x - e, ym, z + r]], color);
  };
  // atap pelana, bubungan sepanjang y
  P.roofY = function (x, y, w, d, z, r, color, wall) {
    const e = 0.07, xm = x + w / 2;
    this.poly([[x - e, y - e, z], [x - e, y + d + e, z], [xm, y + d + e, z + r], [xm, y - e, z + r]], AL.shade(color, 0.92));
    this.poly([[x, y + d, z], [x + w, y + d, z], [xm, y + d, z + r]], AL.shade(wall, 0.9));
    this.poly([[x + w + e, y - e, z], [x + w + e, y + d + e, z], [xm, y + d + e, z + r], [xm, y - e, z + r]], AL.shade(color, 0.72));
  };
  P.cyl = function (cx, cy, r, z0, h, color) {
    const c = this.c, b = this.P(cx, cy, z0), tp = this.P(cx, cy, z0 + h);
    const rx = r * TW / 2 * Math.SQRT2 * this.s, ry = r * TH / 2 * Math.SQRT2 * this.s;
    const g = c.createLinearGradient(b[0] - rx, 0, b[0] + rx, 0);
    g.addColorStop(0, this.col(AL.shade(color, 0.95)));
    g.addColorStop(0.4, this.col(AL.shade(color, 1.06)));
    g.addColorStop(1, this.col(AL.shade(color, 0.68)));
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(b[0], b[1], rx, ry, 0, 0, Math.PI);
    c.lineTo(tp[0] - rx, tp[1]);
    c.ellipse(tp[0], tp[1], rx, ry, 0, Math.PI, Math.PI * 2);
    c.closePath(); c.fill();
    c.fillStyle = this.col(AL.shade(color, 1.1));
    c.beginPath(); c.ellipse(tp[0], tp[1], rx, ry, 0, 0, Math.PI * 2); c.fill();
  };
  P.shadow = function (x, y, w, d, h) {
    const sh = Math.min(1.1, h * 0.42), k = 0.35;
    this.poly([[x + w, y, 0], [x + w + sh, y + sh * k, 0], [x + w + sh, y + d + sh * k, 0], [x + sh, y + d + sh * k, 0], [x, y + d, 0]], 'rgba(25,45,70,0.2)', true);
  };
  P.tree = function (x, y, size, v) {
    const c = this.c, p = this.P(x, y, 0), s = this.s * size;
    const G = [['#4a8f41', '#5aa34c', '#78c060'], ['#3f8346', '#4f9a55', '#6db873'], ['#679637', '#7cae45', '#9bcb5e']][v % 3];
    c.fillStyle = 'rgba(25,45,70,.2)';
    c.beginPath(); c.ellipse(p[0] + 6 * s, p[1] + 1 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = this.col('#7a5534'); c.fillRect(p[0] - 1.6 * s, p[1] - 12 * s, 3.2 * s, 12 * s);
    const blob = (bx, by, r, col) => { c.fillStyle = this.col(col); c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); };
    blob(p[0], p[1] - 18 * s, 11 * s, G[0]);
    blob(p[0] - 4 * s, p[1] - 21 * s, 8 * s, G[1]);
    blob(p[0] + 4 * s, p[1] - 15 * s, 7 * s, G[1]);
    blob(p[0] - 3 * s, p[1] - 24 * s, 4 * s, G[2]);
  };
  P.palm = function (x, y, size, v) {
    const c = this.c, p = this.P(x, y, 0), s = this.s * size, lean = v ? 6 : -5;
    c.fillStyle = 'rgba(25,45,70,.18)';
    c.beginPath(); c.ellipse(p[0] + 8 * s, p[1] + 1 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = this.col('#9a7048'); c.lineWidth = 2.6 * s; c.lineCap = 'round';
    const tx = p[0] + lean * s, ty = p[1] - 28 * s;
    c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(p[0] - lean * 0.2 * s, p[1] - 14 * s, tx, ty); c.stroke();
    c.fillStyle = this.col('#4f9a48');
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.3;
      c.save(); c.translate(tx, ty); c.rotate(a);
      c.beginPath(); c.ellipse(9 * s, 2 * s, 10 * s, 2.6 * s, 0.25, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    c.fillStyle = this.col('#6b4a2a'); c.beginPath(); c.arc(tx, ty + 1.5 * s, 2.2 * s, 0, Math.PI * 2); c.fill();
  };
  // teks di bidang +y (menghadap kiri-bawah)
  P.textY = function (txt, x, yFace, z, sizeU, color) {
    const c = this.c, o = this.P(x, yFace, z), s = this.s;
    c.save();
    c.setTransform(c.getTransform().multiply(new DOMMatrix([TW / 2 * s / 100, TH / 2 * s / 100, 0, TH * s / 100, o[0], o[1]])));
    c.fillStyle = color; c.font = '800 ' + Math.round(sizeU * 100) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    c.textBaseline = 'top';
    c.fillText(txt, 0, 0);
    c.restore();
  };
  // teks di bidang +x (menghadap kanan-bawah), dibaca dari kiri ke kanan
  P.textX = function (txt, xFace, y, z, sizeU, color) {
    const c = this.c, o = this.P(xFace, y, z), s = this.s;
    c.save();
    c.setTransform(c.getTransform().multiply(new DOMMatrix([TW / 2 * s / 100, -TH / 2 * s / 100, 0, TH * s / 100, o[0], o[1]])));
    c.fillStyle = color; c.font = '800 ' + Math.round(sizeU * 100) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    c.textBaseline = 'top';
    c.fillText(txt, 0, 0);
    c.restore();
  };

  // =============== RESEP BANGUNAN (kavling 2×2, koordinat lokal 0..2) ===============
  const WALLS = ['#f4ede1', '#f2d7b6', '#e9e1f2', '#dbeee4', '#e9dfc4', '#f1c9bd', '#d7e7f3'];
  const ROOFS = ['#a9584c', '#3f6f8f', '#6b8f4e', '#8a5a44', '#b98046', '#a15364'];
  const RUSUN = ['#e8dcc8', '#d6e2e9', '#efe0d0', '#dfe8d5', '#ead6d6'];
  const GLASS = ['#7fa8c9', '#8fb9b5', '#9aa6c7', '#6d93b5', '#86b0a6'];
  const SHOPC = ['#e3c68f', '#dda497', '#9fd3c7', '#c5b3e6', '#f5e6a8', '#a8d08d'];
  const HMAX = { house: 1.6, rusun: 4.2, office: 8.8, menara: 12.6, shop: 1.5, park: 1.6, field: 1.2, balai: 2.4, pasar: 1.5, sekolah: 2.4, puskesmas: 1.8, mercusuar: 3.4, tree: 1.5, palm: 1.4, villa: 1.7, gubuk: 1.8, jukung: 0.6, ronda: 1.3, warung: 1.3, kebun: 1.6, mall: 2.1 };

  // ---- bantu: garis 3D & anyaman ----
  function line3(p, a, b, col, w) {
    const A = p.P(a[0], a[1], a[2]), B = p.P(b[0], b[1], b[2]), c = p.c;
    c.strokeStyle = p.col(col); c.lineWidth = Math.max(0.6, (w || 1) * p.s);
    c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.stroke();
  }
  // bilah bambu tegak di bawah, anyaman silang di atas, pada dua sisi yang terlihat
  function anyaman(p, x, y, w, d, z0, h, base) {
    const dark = AL.shade(base, 0.78), zm = z0 + h * 0.45;
    for (let u = 0.06; u < w; u += 0.09) line3(p, [x + u, y + d, z0], [x + u, y + d, zm], dark, 0.8);
    for (let v = 0.06; v < d; v += 0.09) line3(p, [x + w, y + v, z0], [x + w, y + v, zm], dark, 0.8);
    line3(p, [x, y + d, zm], [x + w, y + d, zm], AL.shade(base, 0.7), 1.4);
    line3(p, [x + w, y, zm], [x + w, y + d, zm], AL.shade(base, 0.7), 1.4);
    // anyaman: tiap sel satu garis miring, arah berselang-seling
    const h2 = z0 + h - zm;
    for (let u = 0; u + 0.12 <= w + 1e-6; u += 0.12) for (let v = 0; v + 0.09 <= h2 + 1e-6; v += 0.09) {
      const f = (Math.round(u / 0.12) + Math.round(v / 0.09)) % 2;
      line3(p, [x + u, y + d, zm + v + (f ? 0 : 0.09)], [x + u + 0.12, y + d, zm + v + (f ? 0.09 : 0)], dark, 0.5);
    }
    for (let u = 0; u + 0.12 <= d + 1e-6; u += 0.12) for (let v = 0; v + 0.09 <= h2 + 1e-6; v += 0.09) {
      const f = (Math.round(u / 0.12) + Math.round(v / 0.09)) % 2;
      line3(p, [x + w, y + u, zm + v + (f ? 0 : 0.09)], [x + w, y + u + 0.12, zm + v + (f ? 0.09 : 0)], dark, 0.5);
    }
  }
  // garis susunan daun (rumbia) pada lereng depan atap pelana-x
  function rumbia(p, x, y, w, d, z, r, col) {
    const e = 0.07, y0 = y + d + e, ym = y + d / 2;
    for (let t = 0.18; t < 1; t += 0.18) line3(p, [x - e, y0 + (ym - y0) * t, z + r * t], [x + w + e, y0 + (ym - y0) * t, z + r * t], AL.shade(col, 0.72), 1);
    // rumbai tepi
    for (let u = x - e; u < x + w + e; u += 0.08) line3(p, [u, y0, z], [u + 0.03, y0 + 0.05, z - 0.06], AL.shade(col, 0.8), 0.8);
  }
  AL.HMAX = HMAX;

  function awning(p, x, y, w, z, depth, c1, c2) {
    const n = Math.max(3, Math.round(w / 0.18)), sw = w / n;
    for (let i = 0; i < n; i++) {
      const xa = x + i * sw;
      p.poly([[xa, y, z], [xa + sw, y, z], [xa + sw, y + depth, z - 0.14], [xa, y + depth, z - 0.14]], i % 2 ? c2 : c1);
    }
  }
  function flag(p, x, y, z0, h) {
    const a = p.P(x, y, z0), b = p.P(x, y, z0 + h), c = p.c;
    c.strokeStyle = p.col('#8a8f99'); c.lineWidth = Math.max(1, 1.2 * p.s);
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    p.poly([[x, y, z0 + h], [x + 0.32, y, z0 + h - 0.04], [x + 0.32, y, z0 + h - 0.13], [x, y, z0 + h - 0.09]], '#e2453c');
    p.poly([[x, y, z0 + h - 0.09], [x + 0.32, y, z0 + h - 0.13], [x + 0.32, y, z0 + h - 0.22], [x, y, z0 + h - 0.18]], '#f5f5f5');
  }

  // ---- properti halaman kampung (koordinat kavling 0..2; rumah di x 0.35–1.6, y 0.35–1.35) ----
  const KAIN = ['#c49b8f', '#8fa9a2', '#c9b07e', '#a8a3c0', '#d9967c', '#e9e1d2', '#7d93a8'];
  const PROPS = {
    kandang: p => { // kandang ayam bambu di belakang
      p.box(0.06, 0.06, 0.3, 0.24, 0, 0.18, '#b89c6a');
      for (let u = 0.08; u < 0.36; u += 0.05) line3(p, [u, 0.3, 0], [u, 0.3, 0.18], '#7d6340', 0.6);
      p.roofX(0.04, 0.06, 0.34, 0.24, 0.18, 0.1, '#8f7d4e', '#b89c6a');
    },
    jemuran: (p, r) => { // tali jemuran dengan kain warna-warni di sisi kanan
      p.box(1.74, 0.22, 0.04, 0.04, 0, 0.58, '#7d6340'); p.box(1.74, 1.18, 0.04, 0.04, 0, 0.58, '#7d6340');
      line3(p, [1.76, 0.24, 0.56], [1.76, 1.2, 0.54], '#5b4a33', 0.7);
      let y = 0.3;
      while (y < 1.08) {
        const w = 0.12 + r() * 0.1, c = AL.pick(KAIN, r());
        p.poly([[1.76, y, 0.55], [1.76, y + w, 0.55], [1.76, y + w, 0.3 + r() * 0.08], [1.76, y, 0.32]], c);
        y += w + 0.04;
      }
    },
    sumur: p => { // sumur timba
      p.cyl(0.32, 1.66, 0.16, 0, 0.16, '#a9a397');
      p.poly([[0.21, 1.55, 0.161], [0.43, 1.55, 0.161], [0.43, 1.77, 0.161], [0.21, 1.77, 0.161]], '#46606a', true);
      p.box(0.14, 1.64, 0.03, 0.03, 0, 0.5, '#7d6340'); p.box(0.47, 1.64, 0.03, 0.03, 0, 0.5, '#7d6340');
      line3(p, [0.15, 1.655, 0.48], [0.49, 1.655, 0.48], '#6b5236', 1.4);
      line3(p, [0.32, 1.655, 0.48], [0.32, 1.66, 0.3], '#5b4a33', 0.5);
      p.cyl(0.32, 1.66, 0.04, 0.24, 0.06, '#8a8f99');
    },
    pagar: p => { // pagar bambu depan, celah di pintu masuk
      for (const [a, b] of [[0.05, 0.85], [1.25, 1.95]]) {
        for (let x = a; x <= b; x += 0.1) p.box(x, 1.92, 0.03, 0.03, 0, 0.22 + ((x * 37) % 1) * 0.04, '#b89c6a');
        line3(p, [a, 1.935, 0.16], [b + 0.03, 1.935, 0.16], '#8d7048', 1);
      }
    },
    kayu: p => { // tumpukan kayu bakar
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3 - k; j++) {
        const c = p.P(1.62 + j * 0.08 + k * 0.04, 1.62, 0.04 + k * 0.07), c2 = p.c;
        c2.fillStyle = p.col('#7a5a3a'); c2.beginPath(); c2.arc(c[0], c[1], 3 * p.s, 0, 7); c2.fill();
        c2.fillStyle = p.col('#b0895c'); c2.beginPath(); c2.arc(c[0], c[1], 1.8 * p.s, 0, 7); c2.fill();
      }
    },
    gentong: p => p.cyl(0.22, 1.78, 0.09, 0, 0.15, '#9a6a4a'),
    kelapa: (p, r) => p.palm(1.85, 0.3, 0.6, Math.floor(r() * 2)),
  };
  function kampungProps(r) {
    const out = [];
    if (r() < 0.35) out.push({ back: true, draw: PROPS.kandang });
    const jem = r() < 0.5;
    if (jem) out.push({ draw: p => PROPS.jemuran(p, r) });
    else if (r() < 0.6) out.push({ back: true, draw: p => PROPS.kelapa(p, r) });
    if (r() < 0.32) out.push({ draw: PROPS.sumur });
    else if (r() < 0.5) out.push({ draw: PROPS.gentong });
    if (r() < 0.3) out.push({ draw: PROPS.kayu });
    if (r() < 0.45) out.push({ draw: PROPS.pagar });
    return out;
  }

  const RECIPES = {
    // ===== KAMPUNG NYIUR: bambu & anyaman daun kelapa =====
    // dua bentuk: rumah panggung (tiang + tangga) atau rumah darat dengan teras bambu; halaman diisi properti acak
    gubuk(p, l, r) {
      const bam = AL.pick(['#cdb07a', '#c6a873', '#d2b886'], r()), thatch = AL.pick(['#8f7d4e', '#978452', '#857650'], r());
      const panggung = r() < 0.55;
      const x = 0.35 + r() * 0.1, y = 0.35 + r() * 0.1, w = 1.15, d = 0.9;
      const s = panggung ? 0.32 : 0.06, h = 0.5, rr = panggung ? 0.6 : 0.52;
      const props = kampungProps(r);
      // properti di belakang rumah digambar dulu
      props.filter(k => k.back).forEach(k => k.draw(p));
      p.shadow(x, y, w, d, s + h + rr * 0.5);
      if (panggung) {
        for (const [px, py] of [[x, y], [x + w - 0.07, y], [x, y + d - 0.07], [x + w - 0.07, y + d - 0.07], [x + w / 2, y + d - 0.07]]) p.box(px, py, 0.07, 0.07, 0, s, '#7d6340');
        p.box(x - 0.06, y - 0.06, w + 0.12, d + 0.12, s, 0.05, '#9c7f52');
      } else {
        p.box(x - 0.04, y - 0.04, w + 0.08, d + 0.08, 0, 0.06, '#a99a7c'); // umpak batu
      }
      p.box(x, y, w, d, s + 0.05, h, bam);
      anyaman(p, x, y, w, d, s + 0.05, h, bam);
      p.poly([[x + 0.58, y + d, s + 0.05], [x + 0.8, y + d, s + 0.05], [x + 0.8, y + d, s + 0.47], [x + 0.58, y + d, s + 0.47]], '#4a3a26');
      const rng = AL.rng(l.seed + 2);
      p.winQuad([[x + w, y + 0.3, s + 0.22], [x + w, y + 0.55, s + 0.22], [x + w, y + 0.55, s + 0.42], [x + w, y + 0.3, s + 0.42]], 0.78, '#5b4a33', rng);
      p.winQuad([[x + 0.15, y + d, s + 0.22], [x + 0.4, y + d, s + 0.22], [x + 0.4, y + d, s + 0.42], [x + 0.15, y + d, s + 0.42]], 0.92, '#5b4a33', rng);
      if (panggung) {
        for (const ox of [0.6, 0.78]) line3(p, [x + ox, y + d + 0.32, 0], [x + ox, y + d, s + 0.05], '#7d6340', 1.4);
        for (let k = 1; k < 4; k++) { const t = k / 4; line3(p, [x + 0.6, y + d + 0.32 * (1 - t), s * t], [x + 0.78, y + d + 0.32 * (1 - t), s * t], '#8d7048', 1); }
        p.roofX(x - 0.06, y, w + 0.12, d, s + 0.05 + h, rr, thatch, bam);
        rumbia(p, x - 0.06, y, w + 0.12, d, s + 0.05 + h, rr, thatch);
      } else {
        // teras: lantai bambu, dua tiang, emperan atap rumbia, bale-bale
        p.box(x - 0.04, y + d, w + 0.08, 0.32, 0, 0.08, '#b39667');
        for (let k = 0; k < 7; k++) line3(p, [x + k * 0.18, y + d + 0.32, 0.08], [x + k * 0.18 + 0.02, y + d, 0.08], '#8d7048', 0.6);
        p.box(x + 0.85, y + d + 0.06, 0.28, 0.2, 0.08, 0.14, '#a88a5a');
        p.roofX(x - 0.06, y, w + 0.12, d, s + 0.05 + h, rr, thatch, bam);
        rumbia(p, x - 0.06, y, w + 0.12, d, s + 0.05 + h, rr, thatch);
        for (const px of [x, x + w - 0.06]) p.box(px, y + d + 0.26, 0.06, 0.06, 0, 0.5, '#7d6340');
        p.poly([[x - 0.06, y + d, s + 0.05 + h], [x + w + 0.06, y + d, s + 0.05 + h], [x + w + 0.06, y + d + 0.4, 0.5], [x - 0.06, y + d + 0.4, 0.5]], AL.shade(thatch, 1.05));
        for (let u = x - 0.06; u < x + w + 0.06; u += 0.08) line3(p, [u, y + d + 0.4, 0.5], [u + 0.03, y + d + 0.44, 0.44], AL.shade(thatch, 0.8), 0.8);
      }
      props.filter(k => !k.back).forEach(k => k.draw(p));
      return s + h + rr;
    },
    warung(p, l, r) {
      const bam = '#cdb07a', thatch = AL.pick(['#8f7d4e', '#978452'], r());
      const x = 0.3, y = 0.45, w = 1.4, d = 1.05, ph = 0.78;
      p.shadow(x, y, w, d, ph + 0.4);
      for (const [px, py] of [[x, y], [x + w - 0.07, y], [x, y + d - 0.07], [x + w - 0.07, y + d - 0.07]]) p.box(px, py, 0.07, 0.07, 0, ph, '#7d6340');
      p.box(x + 0.05, y + 0.05, w - 0.1, 0.3, 0, 0.6, bam); // rak belakang
      const goods = ['#c49b74', '#8fa9a2', '#c9b07e', '#a8b39a', '#c79a8f'];
      for (let k = 0; k < 6; k++) p.box(x + 0.12 + k * 0.2, y + 0.2, 0.14, 0.12, 0.6 - (k % 2) * 0.2, 0.12, goods[k % goods.length]);
      p.box(x + 0.05, y + d - 0.32, w - 0.1, 0.25, 0, 0.38, bam);   // meja depan
      anyaman(p, x + 0.05, y + d - 0.32, w - 0.1, 0.25, 0, 0.38, bam);
      for (let k = 0; k < 3; k++) p.cyl(x + 0.3 + k * 0.35, y + d - 0.2, 0.06, 0.38, 0.1, ['#e9e1d2', '#c9b07e', '#d9a99d'][k]);
      p.box(x + 0.15, y + d + 0.15, 0.9, 0.18, 0, 0.18, '#a88a5a');  // bangku bambu
      p.roofX(x - 0.08, y - 0.05, w + 0.16, d + 0.1, ph, 0.32, thatch, bam);
      rumbia(p, x - 0.08, y - 0.05, w + 0.16, d + 0.1, ph, 0.32, thatch);
      return ph + 0.32;
    },
    kebun(p, l, r) {
      const spots = [[0.4, 0.4], [1.5, 0.35], [0.45, 1.5], [1.55, 1.6], [1.0, 1.0]];
      const n = 4 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) p.palm(spots[k][0], spots[k][1], 0.75 + r() * 0.15, k % 2);
      for (let k = 0; k < 5; k++) { const q = p.P(0.9 + r() * 0.5, 1.4 + r() * 0.4, 0.05); p.c.fillStyle = p.col('#7a5a3a'); p.c.beginPath(); p.c.arc(q[0], q[1], 2.2 * p.s, 0, 7); p.c.fill(); }
      return 1.3;
    },
    // ===== KOTA CAKRAWALA: modern =====
    villa(p, l, r) {
      const wall = AL.pick(['#f4f2ee', '#ecebe7', '#e9e4dc'], r()), accent = AL.pick(['#a07a56', '#6f7a83', '#3d4a55'], r());
      const glass = '#5d7f99', lit = p.n ? '#ffd57e' : glass;
      // kolam renang
      p.poly([[1.1, 1.2, 0.01], [1.9, 1.2, 0.01], [1.9, 1.9, 0.01], [1.1, 1.9, 0.01]], '#e8e6e1');
      p.poly([[1.17, 1.27, 0.02], [1.83, 1.27, 0.02], [1.83, 1.83, 0.02], [1.17, 1.83, 0.02]], '#8fc3cf');
      p.shadow(0.15, 0.15, 1.3, 1.0, 1.3);
      p.box(0.15, 0.2, 1.15, 0.95, 0, 0.55, wall);
      p.poly([[0.25, 1.15, 0.06], [1.2, 1.15, 0.06], [1.2, 1.15, 0.48], [0.25, 1.15, 0.48]], lit, true);
      p.poly([[1.3, 0.3, 0.08], [1.3, 0.9, 0.08], [1.3, 0.9, 0.46], [1.3, 0.3, 0.46]], AL.shade(lit, 0.8), true);
      // lantai atas menjorok
      p.box(0.3, 0.1, 1.35, 0.7, 0.55, 0.48, AL.shade(wall, 0.97));
      p.poly([[0.4, 0.8, 0.62], [1.55, 0.8, 0.62], [1.55, 0.8, 0.96], [0.4, 0.8, 0.96]], lit, true);
      p.box(0.25, 0.05, 1.45, 0.8, 1.03, 0.05, accent);
      p.box(0.3, 0.8, 0.06, 0.4, 0.55, 0.04, accent); // pagar balkon
      if (r() < 0.7) p.palm(1.85, 0.3, 0.6, 1);
      return 1.1;
    },
    mall(p, l) {
      p.shadow(0.1, 0.15, 1.8, 1.6, 1.6);
      p.box(0.1, 0.15, 1.8, 1.6, 0, 1.1, '#cfd5da', { win: true, seed: l.seed, glass: '#7d97a8', fh: 0.36, gap: 0.24, ww: 0.2 });
      p.box(0.2, 1.75, 1.6, 0.18, 0.4, 0.05, '#3d4a55'); // kanopi pintu masuk
      p.box(0.25, 0.3, 1.5, 1.3, 1.1, 0.05, '#b9c0c6');
      p.cyl(1.0, 0.95, 0.45, 1.15, 0.28, '#9fb8c4');      // kubah kaca atrium
      p.textY(l.name.toUpperCase().slice(0, 14), 0.2, 1.75, 1.02, 0.15, p.n ? '#ffd57e' : '#14324a');
      return 1.45;
    },
    house(p, l, r) {
      const wall = AL.pick(WALLS, r()), roof = AL.pick(ROOFS, r());
      const w = 1.1 + r() * 0.35, d = 1.0 + r() * 0.3, x = 0.28 + r() * 0.2, y = 0.3 + r() * 0.2, h = 0.55 + r() * 0.2, rr = 0.38 + r() * 0.12;
      const ridgeX = r() < 0.5, hasTree = r() < 0.6;
      p.shadow(x, y, w, d, h + rr * 0.6);
      p.box(x, y, w, d, 0, h, wall);
      const dx = x + w * 0.55;
      p.poly([[dx, y + d, 0], [dx + 0.18, y + d, 0], [dx + 0.18, y + d, 0.34], [dx, y + d, 0.34]], '#6b4a33');
      const rng = AL.rng(l.seed + 9);
      p.winQuad([[x + 0.15, y + d, 0.2], [x + 0.4, y + d, 0.2], [x + 0.4, y + d, 0.42], [x + 0.15, y + d, 0.42]], 0.95, '#a9cbe0', rng);
      p.winQuad([[x + w, y + 0.25, 0.2], [x + w, y + 0.55, 0.2], [x + w, y + 0.55, 0.42], [x + w, y + 0.25, 0.42]], 0.78, '#a9cbe0', rng);
      if (ridgeX) p.roofX(x, y, w, d, h, rr, roof, wall); else p.roofY(x, y, w, d, h, rr, roof, wall);
      if (hasTree) p.tree(1.8, 1.75, 0.55, Math.floor(r() * 3));
      return h + rr;
    },
    rusun(p, l, r) {
      const c = AL.pick(RUSUN, r()), h = 2.2 + r() * 1.4, x = 0.25, y = 0.25, w = 1.5, d = 1.5;
      p.shadow(x, y, w, d, h);
      p.box(x, y, w, d, 0, h, c, { win: true, seed: l.seed, fh: 0.34, gap: 0.3, ww: 0.17 });
      p.box(x + 0.06, y + 0.06, w - 0.12, d - 0.12, h, 0.03, AL.shade(c, 0.82));
      p.cyl(x + 0.45, y + 0.45, 0.16, h + 0.03, 0.3, '#5a8fb0');
      p.box(x + 0.9, y + 0.8, 0.35, 0.3, h + 0.03, 0.22, AL.shade(c, 0.9));
      return h + 0.35;
    },
    office(p, l, r) {
      const c = AL.pick(GLASS, r()), x = 0.35, y = 0.35, w = 1.3, d = 1.3;
      const h = (l.zone === 0 ? 3.6 : 2.2) + r() * 3.2;
      p.shadow(x, y, w, d, h);
      p.box(x, y, w, d, 0, h, c, { win: true, seed: l.seed, glass: AL.shade(c, 1.28), fh: 0.3, gap: 0.22, ww: 0.16 });
      let top = h;
      if (r() < 0.6) {
        const h2 = 0.6 + r() * 0.6;
        p.box(x + 0.2, y + 0.2, w - 0.4, d - 0.4, h, h2, AL.shade(c, 0.95), { win: true, seed: l.seed + 1, glass: AL.shade(c, 1.28), fh: 0.3, gap: 0.22, ww: 0.16 });
        top += h2;
      }
      const a = p.P(x + w / 2, y + d / 2, top), b = p.P(x + w / 2, y + d / 2, top + 0.5);
      p.c.strokeStyle = p.col('#55606e'); p.c.lineWidth = Math.max(1, 1.2 * p.s);
      p.c.beginPath(); p.c.moveTo(a[0], a[1]); p.c.lineTo(b[0], b[1]); p.c.stroke();
      return top;
    },
    menara(p, l) {
      const c = '#2f4a6b', x = 0.3, y = 0.3, w = 1.4, d = 1.4, h = 9.6;
      p.shadow(x, y, w, d, h);
      p.box(x - 0.1, y - 0.1, w + 0.2, d + 0.2, 0, 0.5, '#e9e4da');
      p.box(x, y, w, d, 0.5, h - 0.5, c, { win: true, seed: l.seed, glass: '#86b6dc', fh: 0.28, gap: 0.2, ww: 0.15 });
      p.box(x + 0.12, y + 0.12, w - 0.24, d - 0.24, h, 0.9, '#1f3550');
      p.textY('AUDIRA', x + 0.14, y + d - 0.12, h + 0.8, 0.3, p.n ? '#ffe08a' : '#ffd166');
      const a = p.P(x + w / 2, y + d / 2, h + 0.9), b = p.P(x + w / 2, y + d / 2, h + 2.2);
      p.c.strokeStyle = p.col('#9aa3ad'); p.c.lineWidth = Math.max(1, 1.6 * p.s);
      p.c.beginPath(); p.c.moveTo(a[0], a[1]); p.c.lineTo(b[0], b[1]); p.c.stroke();
      p.c.fillStyle = '#ff5a4a'; p.c.beginPath(); p.c.arc(b[0], b[1], 2.2 * p.s, 0, Math.PI * 2); p.c.fill();
      return h + 0.9;
    },
    shop(p, l, r) {
      const c = AL.pick(SHOPC, r()), x = 0.25, y = 0.35, w = 1.5, d = 1.2, h = 0.78;
      p.shadow(x, y, w, d, h);
      p.box(x, y, w, d, 0, h, c);
      const rng = AL.rng(l.seed + 3);
      p.winQuad([[x + 0.12, y + d, 0.08], [x + 0.85, y + d, 0.08], [x + 0.85, y + d, 0.48], [x + 0.12, y + d, 0.48]], 0.95, '#bfe0ee', rng);
      p.poly([[x + 1.0, y + d, 0], [x + 1.3, y + d, 0], [x + 1.3, y + d, 0.48], [x + 1.0, y + d, 0.48]], '#6b4a33');
      awning(p, x, y + d, w, 0.62, 0.28, '#ffffff', AL.pick(['#c9675e', '#5f9e98', '#d99a5f', '#7d86c4'], r()));
      p.box(x + 0.25, y + d - 0.06, w - 0.5, 0.06, h, 0.3, '#fffaf0');
      return h + 0.3;
    },
    park(p, l, r) {
      p.poly([[0.55, 0.5, 0.01], [1.15, 0.5, 0.01], [1.15, 1.0, 0.01], [0.55, 1.0, 0.01]], '#7fcbd8');
      p.box(1.2, 1.3, 0.45, 0.12, 0, 0.1, '#a0704a');
      const n = 3 + Math.floor(r() * 3);
      const spots = [[0.3, 0.3], [1.6, 0.35], [0.35, 1.6], [1.65, 1.65], [1.0, 1.75], [1.75, 1.05]];
      for (let k = 0; k < n; k++) p.tree(spots[k][0], spots[k][1], 0.7, Math.floor(r() * 3));
      return 1.2;
    },
    field(p, l, r) {
      const x = 1.35, y = 1.35;
      p.box(x, y, 0.4, 0.4, 0, 0.32, '#c9a46a');
      p.roofX(x, y, 0.4, 0.4, 0.32, 0.22, '#d9b45a', '#c9a46a');
      const a = p.P(0.6, 0.9, 0), b = p.P(0.6, 0.9, 0.55), c = p.c;
      c.strokeStyle = p.col('#7a5534'); c.lineWidth = Math.max(1, 1.4 * p.s);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      const m = p.P(0.6, 0.9, 0.42);
      c.beginPath(); c.moveTo(m[0] - 6 * p.s, m[1]); c.lineTo(m[0] + 6 * p.s, m[1]); c.stroke();
      c.fillStyle = p.col('#e3c25b'); c.beginPath(); c.arc(b[0], b[1], 3 * p.s, Math.PI, 0); c.fill();
      return 0.6;
    },
    balai(p) {
      const x = 0.12, y = 0.3, w = 1.76, d = 1.3, h = 0.95, wall = '#f3eee6';
      p.shadow(x, y, w, d, h + 0.5);
      p.box(x - 0.06, y - 0.06, w + 0.12, d + 0.12, 0, 0.08, '#d9d1c3');
      p.box(x, y, w, d, 0.08, h, wall, { win: true, seed: 7, fh: 0.45, gap: 0.32, ww: 0.14, glass: '#8fb4cc' });
      for (let k = 0; k < 6; k++) p.box(x + 0.1 + k * 0.3, y + d + 0.08, 0.08, 0.08, 0.08, h - 0.05, '#ffffff');
      p.box(x, y + d, w, 0.2, h + 0.03, 0.06, '#ffffff');
      p.roofX(x - 0.02, y, w + 0.04, d + 0.2, h + 0.09, 0.42, '#a8483a', wall);
      flag(p, 1.95, 1.95, 0, 1.6);
      return h + 0.5;
    },
    pasar(p, l) {
      if (l && l.district === 'kampung') return RECIPES.pasarBambu(p, l);
      p.box(0.15, 0.2, 1.7, 0.7, 0, 0.5, '#e7d8bd');
      p.roofX(0.15, 0.2, 1.7, 0.7, 0.5, 0.3, '#d06a3a', '#e7d8bd');
      const cols = ['#d8b56a', '#6fae86', '#cf7f9b', '#d9967c', '#5f9e98'];
      for (let k = 0; k < 5; k++) {
        const x = 0.15 + k * 0.34;
        p.box(x, 1.15, 0.28, 0.32, 0, 0.22, '#a0704a');
        p.box(x + 0.02, 1.17, 0.24, 0.28, 0.22, 0.05, cols[k]);
        awning(p, x - 0.02, 1.1, 0.32, 0.52, 0.12, '#ffffff', cols[(k + 2) % 5]);
      }
      return 0.8;
    },
    sekolah(p) {
      const wall = '#f2f0e6';
      p.shadow(0.15, 0.2, 1.7, 0.75, 1.2);
      p.box(0.15, 0.2, 1.7, 0.75, 0, 0.9, wall, { win: true, seed: 3, fh: 0.42, gap: 0.3, ww: 0.16 });
      p.roofX(0.15, 0.2, 1.7, 0.75, 0.9, 0.3, '#b0485e', wall);
      p.box(0.15, 0.95, 0.6, 0.85, 0, 0.9, wall, { win: true, seed: 4, fh: 0.42, gap: 0.3, ww: 0.16 });
      p.roofY(0.15, 0.95, 0.6, 0.85, 0.9, 0.3, '#b0485e', wall);
      p.poly([[0.95, 1.1, 0.01], [1.85, 1.1, 0.01], [1.85, 1.85, 0.01], [0.95, 1.85, 0.01]], '#d9c9a8');
      flag(p, 1.4, 1.5, 0, 1.6);
      return 1.2;
    },
    puskesmas(p) {
      const x = 0.25, y = 0.3, w = 1.5, d = 1.3, h = 0.95, wall = '#fbfbf8';
      p.shadow(x, y, w, d, h);
      p.box(x, y, w, d, 0, h, wall, { win: true, seed: 5, fh: 0.45, gap: 0.3, ww: 0.16, skipGround: false });
      p.poly([[x, y + d, 0.62], [x + w, y + d, 0.62], [x + w, y + d, 0.7], [x, y + d, 0.7]], '#5f9e98');
      p.poly([[x + w, y, 0.62], [x + w, y + d, 0.62], [x + w, y + d, 0.7], [x + w, y, 0.7]], AL.shade('#5f9e98', 0.8));
      const cx = x + w / 2, cy = y + d / 2;
      p.box(cx - 0.18, cy - 0.06, 0.36, 0.12, h, 0.08, '#4caf7a');
      p.box(cx - 0.06, cy - 0.18, 0.12, 0.36, h, 0.08, '#4caf7a');
      return h + 0.1;
    },
    mercusuar(p) {
      p.shadow(0.25, 0.25, 0.5, 0.5, 2.8);
      p.cyl(0.5, 0.5, 0.34, 0, 0.12, '#cfc6b4');
      const bands = ['#e2453c', '#f7f4ee', '#e2453c', '#f7f4ee', '#e2453c'];
      for (let k = 0; k < 5; k++) p.cyl(0.5, 0.5, 0.26 - k * 0.012, 0.12 + k * 0.48, 0.48, bands[k]);
      p.cyl(0.5, 0.5, 0.24, 2.52, 0.06, '#2b2f3a');
      p.cyl(0.5, 0.5, 0.17, 2.58, 0.28, p.n ? '#fff2a8' : '#cfe8f2');
      p.cyl(0.5, 0.5, 0.21, 2.86, 0.1, '#2b2f3a');
      return 3;
    },
  };

  // pasar rakyat: dua baris lapak bambu beratap rumbia, tampah dagangan
  RECIPES.pasarBambu = function (p, l) {
    const r = AL.rng(l.seed + 11), goods = ['#c9b07e', '#8fa9a2', '#c49b74', '#a8b39a', '#c79a8f', '#e9e1d2', '#9a6a4a'];
    for (const row of [0.25, 1.15]) {
      for (let k = 0; k < 3; k++) {
        const x = 0.1 + k * 0.62, y = row, w = 0.52, d = 0.55;
        for (const [px, py] of [[x, y], [x + w - 0.05, y], [x, y + d - 0.05], [x + w - 0.05, y + d - 0.05]]) p.box(px, py, 0.05, 0.05, 0, 0.62, '#7d6340');
        p.box(x + 0.04, y + 0.15, w - 0.08, d - 0.2, 0, 0.3, '#cdb07a');
        for (let j = 0; j < 3; j++) p.cyl(x + 0.12 + j * 0.15, y + 0.35, 0.065, 0.3, 0.03, AL.pick(goods, r()));
        p.roofX(x - 0.04, y - 0.03, w + 0.08, d + 0.06, 0.62, 0.22, '#8f7d4e', '#cdb07a');
        rumbia(p, x - 0.04, y - 0.03, w + 0.08, d + 0.06, 0.62, 0.22, '#8f7d4e');
      }
    }
    p.box(0.75, 0.95, 0.5, 0.12, 0, 0.02, '#a99a7c'); // jalan setapak di tengah
    return 0.9;
  };
  // perahu jukung di pantai kampung (cadik bambu di kedua sisi)
  RECIPES.jukung = function (p, o) {
    const along = o.ax === 'y', hull = AL.pick(['#7d93a8', '#a8584c', '#5f9e98', '#c9b07e'], AL.ihash(o.x, o.y, 4));
    const L = 0.9, Wd = 0.2;
    const bx = along ? 0.4 : 0.05, by = along ? 0.05 : 0.4, w = along ? Wd : L, d = along ? L : Wd;
    p.shadow(bx, by, w, d, 0.2);
    p.box(bx, by, w, d, 0, 0.14, hull);
    p.box(bx + 0.03, by + 0.03, w - 0.06, d - 0.06, 0.14, 0.01, '#5b4a33');
    // cadik
    const o1 = along ? [[bx - 0.28, by + 0.15], [bx - 0.28, by + d - 0.15]] : [[bx + 0.15, by - 0.28], [bx + w - 0.15, by - 0.28]];
    const o2 = along ? [[bx + w + 0.28, by + 0.15], [bx + w + 0.28, by + d - 0.15]] : [[bx + 0.15, by + d + 0.28], [bx + w - 0.15, by + d + 0.28]];
    for (const [a, b] of [o1, o2]) line3(p, [a[0], a[1], 0.05], [b[0], b[1], 0.05], '#d2b886', 1.6);
    for (const t of [0.3, 0.7]) {
      const ax = along ? bx - 0.28 : bx + w * t, ay = along ? by + d * t : by - 0.28;
      const cx2 = along ? bx + w + 0.28 : bx + w * t, cy2 = along ? by + d * t : by + d + 0.28;
      line3(p, [ax, ay, 0.06], [cx2, cy2, 0.16], '#b89c6a', 1);
    }
    return 0.3;
  };
  // pos ronda: gardu bambu beratap rumbia, kentongan tergantung
  RECIPES.ronda = function (p) {
    p.shadow(0.2, 0.2, 0.6, 0.6, 1);
    for (const [px, py] of [[0.2, 0.2], [0.75, 0.2], [0.2, 0.75], [0.75, 0.75]]) p.box(px, py, 0.05, 0.05, 0, 0.7, '#7d6340');
    p.box(0.2, 0.2, 0.6, 0.6, 0.28, 0.05, '#b39667');
    for (let u = 0.24; u < 0.8; u += 0.08) line3(p, [u, 0.8, 0.33], [u, 0.2, 0.33], '#8d7048', 0.5);
    p.roofY(0.14, 0.14, 0.72, 0.72, 0.7, 0.3, '#8f7d4e', '#b39667');
    p.cyl(0.78, 0.8, 0.04, 0.38, 0.22, '#9c7f52'); // kentongan
    return 1.0;
  };

  // ---------- tanah kosong: kavling yang belum dihuni/dipakai kerja. Papan menunjukkan peruntukannya ----------
  const PERUNTUKAN = { house: 'RUMAH', villa: 'VILLA', rusun: 'APARTEMEN', gubuk: 'RUMAH', office: 'KANTOR', mall: 'MAL', shop: 'TOKO', warung: 'WARUNG', park: 'TAMAN', field: 'SAWAH', kebun: 'KEBUN', pasar: 'PASAR', sekolah: 'SEKOLAH', puskesmas: 'PUSKESMAS' };
  AL.PERUNTUKAN = PERUNTUKAN;
  AL.drawEmptyLot = function (p, lot) {
    const kampung = lot.district === 'kampung';
    const soil = kampung ? '#c4ab86' : '#cbc2b0', r = AL.rng(lot.seed + 77);
    p.poly([[0.06, 0.06, 0.005], [1.94, 0.06, 0.005], [1.94, 1.94, 0.005], [0.06, 1.94, 0.005]], soil);
    // kerikil/gumpalan tanah
    for (let k = 0; k < 9; k++) {
      const x = 0.2 + r() * 1.6, y = 0.2 + r() * 1.6;
      p.poly([[x, y, 0.01], [x + 0.08, y, 0.01], [x + 0.08, y + 0.06, 0.01], [x, y + 0.06, 0.01]], AL.shade(soil, 0.86));
    }
    if (lot.type === 'field' || lot.type === 'kebun') {
      for (let k = 1; k < 6; k++) p.poly([[0.15, k / 3 - 0.02, 0.01], [1.85, k / 3 - 0.02, 0.01], [1.85, k / 3 + 0.03, 0.01], [0.15, k / 3 + 0.03, 0.01]], AL.shade(soil, 0.9));
    }
    // patok sudut + tali batas kavling
    const stake = kampung ? '#9a7b55' : '#a7a29a', pts = [[0.12, 0.12], [1.88, 0.12], [1.88, 1.88], [0.12, 1.88]];
    const c = p.c;
    c.strokeStyle = p.col(kampung ? '#b89b6e' : '#d9967c'); c.lineWidth = Math.max(1, 1.1 * p.s);
    c.beginPath();
    pts.concat([pts[0]]).forEach(([x, y], i) => { const q = p.P(x, y, 0.22); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
    c.stroke();
    pts.forEach(([x, y]) => p.box(x - 0.03, y - 0.03, 0.06, 0.06, 0, 0.28, stake));
    // papan peruntukan di depan
    const label = PERUNTUKAN[lot.type] || 'KAVLING';
    p.box(1.06, 1.78, 0.05, 0.05, 0, 0.62, '#8a6c4c'); p.box(1.79, 1.78, 0.05, 0.05, 0, 0.62, '#8a6c4c');
    p.box(1.0, 1.76, 0.9, 0.04, 0.4, 0.34, '#f3ece2');
    p.textY('RENCANA', 1.06, 1.8, 0.71, 0.09, '#4a6275');
    p.textY(label, 1.06, 1.8, 0.6, Math.min(0.15, 0.78 / (label.length * 0.66)), '#14324a');
    return 0.8;
  };

  AL.drawObject = function (p, obj) {
    if (obj.type && !AL.isBuilt(obj)) return AL.drawEmptyLot(p, obj);
    if (obj.kind === 'jukung') return RECIPES.jukung(p, obj);
    if (obj.kind === 'ronda') return RECIPES.ronda(p, obj);
    if (obj.kind === 'tree') { p.tree(0.5, 0.5, 0.8, +obj.id.slice(4)); return 1.2; }
    if (obj.kind === 'palm') { p.palm(0.5, 0.5, 0.8, +obj.id.slice(4)); return 1.2; }
    if (obj.kind === 'mercusuar') return RECIPES.mercusuar(p, obj);
    const r = AL.rng(obj.seed);
    return RECIPES[obj.type](p, obj, r);
  };

  // =============== SPRITE CACHE: bangunan statis digambar sekali per tingkat zoom ===============
  const KSTEP = 1.25;
  AL.tierFor = R => AL.clamp(Math.pow(KSTEP, Math.round(Math.log(R) / Math.log(KSTEP))), 0.3, 4);
  const PAD = 3;
  AL.spriteBox = function (hmax, s) {
    return {
      ox: Math.ceil(2.6 * TW / 2 * s) + PAD,
      oy: Math.ceil((0.2 * TH + hmax * TH) * s) + PAD,
      w: Math.ceil(6.2 * TW / 2 * s) + 2 * PAD,
      h: Math.ceil((6.2 * TH / 2 + hmax * TH) * s) + 2 * PAD,
    };
  };
  const cache = new Map(), lastAny = new Map();
  const MAX = 1800; // peta 112×64: ±380 kavling × versi siang/malam + pohon
  AL.spriteCacheSize = () => cache.size;
  AL.getSprite = function (obj, s, night, budget) {
    // kavling kosong & kavling berbangunan beda sprite: saat warga pertama masuk, sprite baru dibuat
    // cetak biru admin (js/cetak-gambar.js) punya versi sendiri supaya sprite lama tidak terpakai setelah diubah
    const st = obj.type ? (obj.cetak ? 'c' + obj.cetak.v : AL.isBuilt(obj) ? 'b' : 'e') : '';
    const base = obj.id + '|' + st + '|' + (night ? 1 : 0);
    const key = base + '|' + s;
    let e = cache.get(key);
    if (e) { cache.delete(key); cache.set(key, e); return e; }
    if (budget.n <= 0) return lastAny.get(base) || null;
    budget.n--;
    const hm = obj.hmax, b = AL.spriteBox(hm, s);
    const cv = document.createElement('canvas');
    cv.width = b.w; cv.height = b.h;
    const ctx = cv.getContext('2d');
    const top = AL.drawObject(new Painter(ctx, s, b.ox, b.oy, night), obj);
    if (obj.hTop !== undefined && top) obj.hTop = top;
    e = { cv, ox: b.ox, oy: b.oy, s };
    cache.set(key, e);
    lastAny.set(base, e);
    while (cache.size > MAX) cache.delete(cache.keys().next().value);
    return e;
  };

  // =============== TANAH: Path2D per warna dalam koordinat dunia (tajam di semua zoom) ===============
  AL.buildGround = function () {
    const { W, H, T, tiles, lotAt, lots } = AL;
    const paths = new Map();
    // lapisan dari bawah ke atas: tepi pantai dibulatkan dengan gumpal elips di petak tepi, lalu petak penuh di atasnya
    for (const c of ['#6cc0cf', '#7fcbd8', '#dcc48f', '#efdcaa', '#9fc386', '#a3c78a', '#9cc184']) paths.set(c, new Path2D());
    const blob = (col, x, y, k) => {
      const p = paths.get(col), c = AL.toWorld(x + 0.5, y + 0.5);
      p.moveTo(c.x + TW / 2 * k, c.y); p.ellipse(c.x, c.y, TW / 2 * k, TH / 2 * k, 0, 0, Math.PI * 2);
    };
    const add = (col, x, y) => {
      let p = paths.get(col);
      if (!p) { p = new Path2D(); paths.set(col, p); }
      const a = AL.toWorld(x, y), b = AL.toWorld(x + 1, y), c = AL.toWorld(x + 1, y + 1), d = AL.toWorld(x, y + 1);
      p.moveTo(a.x, a.y); p.lineTo(b.x, b.y); p.lineTo(c.x, c.y); p.lineTo(d.x, d.y); p.closePath();
    };
    const LOTG = { house: '#b7dd90', rusun: '#cfd3d6', office: '#c9ced4', menara: '#d5d0c6', shop: '#ddd6c8', park: '#97cf6f', field: '#c3e08c', balai: '#e6dccb', pasar: '#dccfb6', sekolah: '#b7dd90', puskesmas: '#cfd8d6', villa: '#b3cf9b', mall: '#d3d6da', gubuk: '#cdb98f', warung: '#d2bf96', kebun: '#b2c78d' };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x];
      let col = null;
      if (t === T.SHALLOW) col = '#7fcbd8';
      else if (t === T.SAND) col = '#efdcaa';
      else if (t === T.GRASS) col = AL.noise(x / 3, y / 3, 77) > 0.5 ? '#a3c78a' : '#9cc184';
      // jalan: aspal di kota, tanah padat di kampung, kayu di jembatan
      // petak jembatan: sekarang flyover, jadi di bawahnya tetap air sungai
      else if (t === T.ROAD) col = AL.bridges && AL.bridges.has(y * W + x) ? '#7fcbd8' : AL.district && AL.district(x, y) === 'kampung' ? '#bea683' : '#8e959f';
      else if (t === T.DOCK) col = '#b48a5a';
      else if (t === T.LOT) col = LOTG[lots[lotAt[y * W + x]].type] || '#b7dd90';
      if (col) add(col, x, y);
      // tepi: gumpal sedikit lebih besar dari petak supaya garis pantai tidak bergerigi
      const nb = k => AL.tileAt(x - 1, y) === k || AL.tileAt(x + 1, y) === k || AL.tileAt(x, y - 1) === k || AL.tileAt(x, y + 1) === k;
      if (t === T.SHALLOW && nb(T.DEEP)) blob('#7fcbd8', x, y, 1.25);
      else if (t === T.SAND && nb(T.SHALLOW)) { blob('#dcc48f', x, y, 1.42); blob('#efdcaa', x, y, 1.22); }
      else if (t === T.GRASS && nb(T.SAND)) blob('#a3c78a', x, y, 1.2);
    }
    // air dangkal di sisi laut lepas: lingkaran lebih gelap di bawahnya = tepi palung
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] !== T.SHALLOW) continue;
      if (AL.tileAt(x - 1, y) === T.DEEP || AL.tileAt(x + 1, y) === T.DEEP || AL.tileAt(x, y - 1) === T.DEEP || AL.tileAt(x, y + 1) === T.DEEP) blob('#6cc0cf', x, y, 1.6);
    }
    // detail tanah: rumpun rumput, kerikil di jalan tanah, butir pasir (digambar sekali sebagai Path2D)
    // dibagi potongan 16×16 petak: hanya potongan yang terlihat yang digambar (penting saat zoom dekat)
    const CH = 16, chunks = new Map(), TANAH = new Set(['gubuk', 'warung', 'pasar']);
    const chunk = (x, y) => {
      const k = (x >> 4) + ',' + (y >> 4);
      let c = chunks.get(k);
      if (!c) {
        const cx = (x >> 4) * CH, cy = (y >> 4) * CH, l = AL.toWorld(cx, cy + CH), r = AL.toWorld(cx + CH, cy), tp = AL.toWorld(cx, cy), bt = AL.toWorld(cx + CH, cy + CH);
        c = { x0: l.x - TW * 2, x1: r.x + TW * 2, y0: tp.y - TH * 3, y1: bt.y + TH * 2, tuft: new Path2D(), grit: new Path2D(), sandDot: new Path2D(), shore: new Path2D(), patch: new Path2D() };
        chunks.set(k, c);
      }
      return c;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x];
      const { tuft, grit, sandDot, patch } = chunk(x, y);
      // halaman tanah kampung: tambalan rumput + rumpun, supaya tidak satu warna polos
      if (t === T.LOT && TANAH.has(lots[lotAt[y * W + x]].type)) {
        if (AL.ihash(x, y, 50) < 0.55) {
          const c = AL.toWorld(x + 0.25 + AL.ihash(x, y, 51) * 0.5, y + 0.25 + AL.ihash(x, y, 52) * 0.5), r = 6 + AL.ihash(x, y, 53) * 8;
          patch.moveTo(c.x + r, c.y); patch.ellipse(c.x, c.y, r, r * 0.5, 0, 0, Math.PI * 2);
        }
        if (AL.ihash(x, y, 54) < 0.6) { const c = AL.toWorld(x + AL.ihash(x, y, 55), y + AL.ihash(x, y, 56)); tuft.moveTo(c.x - 2, c.y); tuft.lineTo(c.x - 1, c.y - 3); tuft.moveTo(c.x, c.y); tuft.lineTo(c.x + 0.5, c.y - 4); tuft.moveTo(c.x + 2, c.y); tuft.lineTo(c.x + 2.5, c.y - 2.6); }
      }
      if (t === T.GRASS) {
        for (let k = 0; k < 3; k++) {
          if (AL.ihash(x * 3 + k, y, 41) > 0.55) continue;
          const c = AL.toWorld(x + 0.15 + AL.ihash(x, y + k, 42) * 0.7, y + 0.15 + AL.ihash(x + k, y, 43) * 0.7);
          tuft.moveTo(c.x - 2, c.y); tuft.lineTo(c.x - 1, c.y - 3); tuft.moveTo(c.x, c.y); tuft.lineTo(c.x + 0.5, c.y - 4); tuft.moveTo(c.x + 2, c.y); tuft.lineTo(c.x + 2.5, c.y - 2.6);
        }
      } else if (t === T.ROAD && AL.district && AL.district(x, y) === 'kampung' && !(AL.bridges && AL.bridges.has(y * W + x))) {
        for (let k = 0; k < 4; k++) { const c = AL.toWorld(x + AL.ihash(x, y + k, 44), y + AL.ihash(x + k, y, 45)); grit.moveTo(c.x + 1, c.y); grit.arc(c.x, c.y, 1, 0, Math.PI * 2); }
        // rumput liar di pinggir jalan tanah
        if (AL.ihash(x, y, 57) < 0.4) {
          const e = AL.ihash(x, y, 58) < 0.5 ? 0.12 : 0.88, c = AL.toWorld(x + e, y + AL.ihash(x, y, 59)), r = 5 + AL.ihash(x, y, 60) * 6;
          patch.moveTo(c.x + r, c.y); patch.ellipse(c.x, c.y, r, r * 0.5, 0, 0, Math.PI * 2);
        }
      } else if (t === T.SAND) {
        for (let k = 0; k < 3; k++) { const c = AL.toWorld(x + AL.ihash(x, y + k, 46), y + AL.ihash(x + k, y, 47)); sandDot.moveTo(c.x + 0.8, c.y); sandDot.arc(c.x, c.y, 0.8, 0, Math.PI * 2); }
      }
    }
    // garis: marka jalan, pematang sawah, papan dermaga
    const marks = new Path2D(), field = new Path2D(), planks = new Path2D(), foam = new Path2D();
    const isRoad = (x, y) => AL.tileAt(x, y) === T.ROAD;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x];
      if (t === T.ROAD && AL.bridges && AL.bridges.has(y * W + x)) {
        // flyover: tanpa papan kayu di permukaan air
      } else if (t === T.ROAD && AL.district && AL.district(x, y) === 'kampung') {
        // jalan tanah: tanpa marka, jejak roda tipis
        if (AL.ihash(x, y, 31) < 0.5) { const a = AL.toWorld(x + 0.25, y + 0.3), b = AL.toWorld(x + 0.55, y + 0.35); field.moveTo(a.x, a.y); field.lineTo(b.x, b.y); }
      } else if (t === T.ROAD) {
        const hx = isRoad(x - 1, y) || isRoad(x + 1, y), hy = isRoad(x, y - 1) || isRoad(x, y + 1);
        if (hx && !hy) { const a = AL.toWorld(x + 0.2, y + 0.5), b = AL.toWorld(x + 0.8, y + 0.5); marks.moveTo(a.x, a.y); marks.lineTo(b.x, b.y); }
        if (hy && !hx) { const a = AL.toWorld(x + 0.5, y + 0.2), b = AL.toWorld(x + 0.5, y + 0.8); marks.moveTo(a.x, a.y); marks.lineTo(b.x, b.y); }
      } else if (t === T.LOT && lots[lotAt[y * W + x]].type === 'field') {
        for (let k = 1; k < 4; k++) { const a = AL.toWorld(x, y + k / 4), b = AL.toWorld(x + 1, y + k / 4); field.moveTo(a.x, a.y); field.lineTo(b.x, b.y); }
      } else if (t === T.DOCK) {
        for (let k = 1; k < 4; k++) { const a = AL.toWorld(x, y + k / 4), b = AL.toWorld(x + 1, y + k / 4); planks.moveTo(a.x, a.y); planks.lineTo(b.x, b.y); }
      } else if (t === T.SHALLOW) {
        const s = AL.tileAt(x - 1, y) === T.SAND || AL.tileAt(x, y - 1) === T.SAND || AL.tileAt(x + 1, y) === T.SAND || AL.tileAt(x, y + 1) === T.SAND;
        if (s && AL.ihash(x, y, 5) < 0.7) { const a = AL.toWorld(x + 0.2, y + 0.5), b = AL.toWorld(x + 0.75, y + 0.45); foam.moveTo(a.x, a.y); foam.lineTo(b.x, b.y); }
      }
    }
    // gelombang laut (digeser tiap bingkai)
    const waves = new Path2D();
    for (let y = -10; y < H + 10; y++) for (let x = -10; x < W + 10; x++) {
      if (AL.tileAt(x, y) > T.SHALLOW) continue;
      if (AL.ihash(x, y, 11) > 0.12) continue;
      const a = AL.toWorld(x + 0.2, y + 0.5), b = AL.toWorld(x + 0.6, y + 0.3);
      waves.moveTo(a.x, a.y); waves.quadraticCurveTo((a.x + b.x) / 2, a.y - 4, b.x, b.y);
    }
    // lampu jalan di persimpangan
    const lamps = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isRoad(x, y)) continue;
      const n = (isRoad(x + 1, y) ? 1 : 0) + (isRoad(x - 1, y) ? 1 : 0) + (isRoad(x, y + 1) ? 1 : 0) + (isRoad(x, y - 1) ? 1 : 0);
      if (n >= 3) lamps.push(AL.toWorld(x + 0.5, y + 0.5));
    }
    // garis pantai untuk buih yang bergerak: tepi gumpal pasir yang menghadap air
    const glint = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x], shore = chunk(x, y).shore;
      if (t === T.SAND && (AL.tileAt(x - 1, y) === T.SHALLOW || AL.tileAt(x + 1, y) === T.SHALLOW || AL.tileAt(x, y - 1) === T.SHALLOW || AL.tileAt(x, y + 1) === T.SHALLOW)) {
        const c = AL.toWorld(x + 0.5, y + 0.5), k = 1.5;
        shore.moveTo(c.x + TW / 2 * k, c.y); shore.ellipse(c.x, c.y, TW / 2 * k, TH / 2 * k, 0, 0, Math.PI * 2);
      }
      if (t <= T.SHALLOW && AL.ihash(x, y, 48) < 0.05) glint.push([AL.toWorld(x + 0.5, y + 0.5), AL.ihash(x, y, 49) * 6.28]);
    }
    AL.ground = { paths, marks, field, planks, foam, waves, lamps, chunks: [...chunks.values()], glint };
  };

  AL.drawGround = function (ctx, cam, vw, vh, dpr, t) {
    const g = AL.ground, z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
    ctx.save();
    ctx.translate(Math.sin(t * 0.7) * 4, Math.cos(t * 0.5) * 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.stroke(g.waves);
    ctx.restore();
    // potongan detail yang terlihat (koordinat dunia)
    const wx0 = cam.x - vw / 2 / z, wx1 = cam.x + vw / 2 / z, wy0 = cam.y - vh / 2 / z, wy1 = cam.y + vh / 2 / z;
    const vis = g.chunks.filter(c => c.x1 > wx0 && c.x0 < wx1 && c.y1 > wy0 && c.y0 < wy1);
    // buih tepi pantai: cincin putih tipis di bawah pasir, berdenyut pelan seperti ombak yang naik-turun
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.28 + 0.14 * Math.sin(t * 1.3)) + ')';
    ctx.lineWidth = 2.2 + Math.sin(t * 1.3) * 0.8;
    for (const c of vis) ctx.stroke(c.shore);
    for (const [col, p] of g.paths) { ctx.fillStyle = col; ctx.fill(p); }
    ctx.lineCap = 'round';
    if (z > 0.55) {
      ctx.fillStyle = 'rgba(132,168,86,.62)'; for (const c of vis) ctx.fill(c.patch);
      ctx.strokeStyle = 'rgba(66,118,48,.55)'; ctx.lineWidth = 1; for (const c of vis) ctx.stroke(c.tuft);
      ctx.fillStyle = 'rgba(110,85,55,.4)'; for (const c of vis) ctx.fill(c.grit);
      ctx.fillStyle = 'rgba(190,160,100,.35)'; for (const c of vis) ctx.fill(c.sandDot);
    }
    // kilau matahari di air (berkedip pelan, tidak di malam hari)
    const night = AL.nightFactor ? AL.nightFactor() : 0;
    if (night < 0.8 && z > 0.35) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - night)) + ')';
      for (const [p, ph] of g.glint) {
        if (p.x < wx0 || p.x > wx1 || p.y < wy0 || p.y > wy1) continue;
        const a = Math.sin(t * 1.7 + ph);
        if (a < 0.55) continue;
        const r = (a - 0.55) * 5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.8, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.4; ctx.stroke(g.foam);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.1;
    ctx.setLineDash([5, 5]); ctx.stroke(g.marks); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(110,150,60,.55)'; ctx.lineWidth = 1; ctx.stroke(g.field);
    ctx.strokeStyle = 'rgba(80,55,30,.45)'; ctx.lineWidth = 0.8; ctx.stroke(g.planks);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
})(window.AL);
