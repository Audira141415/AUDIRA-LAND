/* AUDIRA LAND · Tugu Dua Tepi: landmark AUDIRA di tengah sungai pemisah Kampung Nyiur & Kota Cakrawala.
   Tiang kiri bambu beranyam daun kelapa (kampung), tiang kanan kaca & baja (kota),
   keduanya menopang lambang AUDIRA emas di puncak: satu pulau, dua tepi, satu warga.
   Dimuat setelah world.js & render.js, sebelum main.js (masuk ke AL.statics). */
(function (AL) {
  'use strict';
  if (!AL.riverX || !AL.statics) return;

  // ---------- letak: di sungai, sedikit di utara jembatan tengah ----------
  const ty = 28, tx = Math.round(AL.riverX(ty + 1) - 1);
  const TUGU = { id: 'tugu-dua-tepi', kind: 'tugu', x: tx, y: ty, name: 'Tugu Dua Tepi AUDIRA', hmax: 6.4 };
  AL.statics.push(TUGU);
  AL.HMAX.tugu = 6.4;
  AL.tugu = TUGU;

  const BAMBOO = ['#c9b07e', '#b89b6e', '#d1bb8c'];
  const WEAVE = ['#d6c18f', '#b6995f'];

  function bambooPole(p, x, y, z0, h, col) {
    p.cyl(x, y, 0.065, z0, h, col);
    for (let z = z0 + 0.45; z < z0 + h - 0.1; z += 0.55) p.cyl(x, y, 0.072, z, 0.04, AL.shade(col, 0.78)); // ruas
  }
  // anyaman daun kelapa di bidang +y (menghadap kiri-bawah) antara x0..x1, z0..z1
  function weave(p, x0, x1, yF, z0, z1) {
    const n = 6, m = 9, dx = (x1 - x0) / n, dz = (z1 - z0) / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const x = x0 + i * dx, z = z0 + j * dz;
      p.poly([[x, yF, z], [x + dx, yF, z], [x + dx, yF, z + dz], [x, yF, z + dz]], WEAVE[(i + j) % 2]);
    }
  }
  // lambang AUDIRA (segitiga emas + segitiga navy + ombak), selalu menghadap kamera
  function emblem(c, x, y, R, glow) {
    if (glow > 0) {
      const g = c.createRadialGradient(x, y, 0, x, y, R * 3);
      g.addColorStop(0, `rgba(255,214,120,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,214,120,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, R * 3, 0, 7); c.fill();
    }
    c.fillStyle = '#14324a'; c.beginPath(); c.arc(x, y, R * 1.12, 0, 7); c.fill();
    c.fillStyle = '#ffd166';
    c.beginPath(); c.moveTo(x, y - R * 0.8); c.lineTo(x + R * 0.74, y + R * 0.6); c.lineTo(x - R * 0.74, y + R * 0.6); c.closePath(); c.fill();
    c.fillStyle = '#14324a';
    c.beginPath(); c.moveTo(x, y - R * 0.22); c.lineTo(x + R * 0.36, y + R * 0.46); c.lineTo(x - R * 0.36, y + R * 0.46); c.closePath(); c.fill();
    c.strokeStyle = '#7fcbd8'; c.lineWidth = Math.max(1, R * 0.12); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - R * 0.85, y + R * 0.78);
    c.quadraticCurveTo(x - R * 0.4, y + R * 0.6, x, y + R * 0.78); c.quadraticCurveTo(x + R * 0.4, y + R * 0.96, x + R * 0.85, y + R * 0.74);
    c.stroke();
  }

  function drawTugu(p) {
    const n = p.n;
    // fondasi batu bertingkat di tengah sungai
    p.cyl(1, 1, 0.98, 0, 0.1, '#bfb6a4');
    p.box(0.3, 0.3, 1.4, 1.4, 0.1, 0.3, '#d8cfbd');
    p.box(0.42, 0.42, 1.16, 1.16, 0.4, 0.12, '#cfc6b4');
    p.textY('SATU PULAU', 0.42, 1.7, 0.36, 0.11, '#14324a');
    // Dua tiang sejajar kedalaman: kampung di kiri layar (x kecil, y besar), kota di kanan (x besar, y kecil).
    // tiang kampung: 5 bambu terikat + anyaman daun kelapa
    const zb = 0.52, hb = 3.7, bx = 0.55, by = 1.45;
    [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13], [0, 0]].forEach(([ox, oy], i) =>
      bambooPole(p, bx + ox, by + oy, zb, hb + (i === 4 ? 0.35 : (i % 2) * 0.12), BAMBOO[i % 3]));
    weave(p, bx - 0.2, bx + 0.2, by + 0.21, zb + 0.45, zb + 2.5);
    for (const z of [zb + 0.3, zb + 2.62, zb + 3.4]) p.box(bx - 0.21, by - 0.21, 0.42, 0.42, z, 0.08, '#8a6c4c'); // ikatan tali ijuk
    // tiang kota: menara kaca & baja
    const zc = 0.52, hc = 4.1, cx = 1.45, cy = 0.55;
    p.box(cx - 0.22, cy - 0.22, 0.44, 0.44, zc, hc, '#7fa8c9', { win: true, seed: 11, glass: '#a9c8dc', fh: 0.26, gap: 0.14, ww: 0.1 });
    p.box(cx - 0.24, cy - 0.24, 0.48, 0.48, zc, 0.06, '#8d969f');
    p.box(cx - 0.24, cy - 0.24, 0.48, 0.48, zc + hc, 0.07, '#8d969f');
    // lengkung penyatu: separuh bambu, separuh baja, bertemu di lambang
    const top = 5.25, ctr = p.P(1, 1, top - 0.25);
    const arc = (x, y, z, col, w) => {
      const a = p.P(x, y, z);
      p.c.strokeStyle = p.col(col); p.c.lineWidth = Math.max(2, w * p.s); p.c.lineCap = 'round';
      p.c.beginPath(); p.c.moveTo(a[0], a[1]);
      p.c.quadraticCurveTo((a[0] + ctr[0]) / 2, ctr[1] - 4 * p.s, ctr[0], ctr[1]); p.c.stroke();
    };
    arc(bx, by, zb + hb + 0.3, '#8a6c4c', 9); arc(bx, by, zb + hb + 0.3, '#d1bb8c', 4);
    arc(cx, cy, zc + hc + 0.07, '#5d6670', 9); arc(cx, cy, zc + hc + 0.07, '#c9d2da', 4);
    // lambang di puncak + papan nama di bawahnya
    const q = p.P(1, 1, top + 0.1);
    emblem(p.c, q[0], q[1], 19 * p.s, n ? 1 : 0);
    const fs = Math.max(6, 8 * p.s), tw = fs * 4.2;
    p.c.fillStyle = '#14324a';
    p.c.beginPath(); p.c.roundRect(q[0] - tw / 2, q[1] + 24 * p.s, tw, fs * 1.5, fs * 0.4); p.c.fill();
    p.c.fillStyle = '#ffd166';
    p.c.font = `800 ${fs}px "Plus Jakarta Sans", system-ui, sans-serif`;
    p.c.textAlign = 'center'; p.c.textBaseline = 'middle';
    p.c.fillText('AUDIRA', q[0], q[1] + 24 * p.s + fs * 0.78);
    // pelita bambu — hangat
    const l = p.P(bx - 0.05, by + 0.32, 1.25);
    p.c.fillStyle = p.col('#8a6c4c'); p.c.fillRect(l[0] - 2 * p.s, l[1] - 6 * p.s, 4 * p.s, 6 * p.s);
    p.c.fillStyle = n ? '#ffd27a' : '#e9c98a'; p.c.beginPath(); p.c.arc(l[0], l[1] - 8 * p.s, 2.4 * p.s, 0, 7); p.c.fill();
    return 5.6;
  }

  // efek tiap bingkai: kilau lambang siang, cahaya malam, riak air di kaki tugu
  AL.drawLandmarks = function (ctx, toScr, z, t, vw, vh, night) {
    // malam: huruf kota bercahaya putih hangat, huruf kampung diterangi pelita kecil
    if (night > 0.1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const l of LETTERS) {
        const kota = l.style === 'kota';
        const [lx, ly] = toScr(l.x + 0.5, l.y + 0.7, kota ? 1.3 : 0.15);
        const R = (kota ? 46 : 22) * z;
        if (lx < -R || lx > vw + R || ly < -R || ly > vh + R) continue;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
        g.addColorStop(0, kota ? `rgba(255,240,200,${0.3 * night})` : `rgba(255,180,100,${0.45 * night})`);
        g.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    const [sx, sy] = toScr(TUGU.x + 1, TUGU.y + 1, 0);
    if (sx < -300 || sx > vw + 300 || sy < -400 || sy > vh + 200) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.35 + k / 3) % 1;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.ellipse(sx, sy, (60 + ph * 50) * z, (30 + ph * 25) * z, 0, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const [ex, ey] = toScr(TUGU.x + 1, TUGU.y + 1, 5.35);
    if (night > 0.1) {
      ctx.globalCompositeOperation = 'lighter';
      // sorot dua warna ke langit: hangat (kampung) & sejuk (kota)
      for (const [dx, col] of [[-1, '255,200,120'], [1, '150,200,230']]) {
        const g = ctx.createLinearGradient(ex, ey, ex + dx * 40 * z, ey - 260 * z);
        g.addColorStop(0, `rgba(${col},${0.35 * night})`); g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(ex - 4 * z, ey); ctx.lineTo(ex + 4 * z, ey);
        ctx.lineTo(ex + dx * 60 * z + 18 * z, ey - 260 * z); ctx.lineTo(ex + dx * 60 * z - 18 * z, ey - 260 * z); ctx.closePath(); ctx.fill();
      }
    } else {
      // kilau berputar di lambang
      const a = t * 1.5;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(ex + Math.cos(a) * 12 * z, ey + Math.sin(a) * 10 * z, 1.6 * z, 0, 7); ctx.fill();
    }
    ctx.restore();
  };

  // ---------- huruf raksasa ala bukit kota: "CITY HAVE" (Kota) & "CITY HAVE NOT" (Kampung) ----------
  // Satu huruf = satu objek petak supaya urutan kedalaman benar. Baris dicari otomatis: petak rumput/pasir kosong berderet.
  const SIGNS = [
    { text: 'CITY HAVE', district: 'kota', style: 'kota', north: true },
    { text: 'CITY HAVE NOT', district: 'kampung', style: 'kampung', north: false },
  ];
  const LETTERS = [];
  AL.HMAX.huruf = 2.8;
  (function placeSigns() {
    const { W, H, T } = AL;
    const occ = new Set(AL.statics.filter(o => o.kind !== 'tree' && o.kind !== 'palm').map(o => o.x + ',' + o.y));
    // bukan di lereng gunung / tanah calon sawah (AL.lembah dari js/world.js)
    const free = (x, y) => { const t = AL.tileAt(x, y); return (t === T.GRASS || t === T.SAND) && !occ.has(x + ',' + y) && !(AL.lembah && AL.lembah[y * W + x]); };
    for (const s of SIGNS) {
      const len = s.text.length, c = AL.CENTER[s.district];
      let best = null;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x + len < W; x++) {
        let ok = true;
        for (let i = 0; i < len && ok; i++) if (!free(x + i, y) || AL.district(x + i, y) !== s.district) ok = false;
        if (!ok) continue;
        const d = Math.hypot(x + len / 2 - c.x, y - c.y) + (s.north && y > c.y ? 100 : 0);
        if (!best || d < best.d) best = { x, y, d };
      }
      if (!best) continue;
      s.x = best.x; s.y = best.y;
      for (let i = 0; i < len; i++) {
        occ.add((best.x + i) + ',' + best.y);
        if (s.text[i] === ' ') continue;
        LETTERS.push({ id: `huruf:${s.style}:${s.text[i]}`, kind: 'huruf', ch: s.text[i], style: s.style, x: best.x + i, y: best.y, sign: s });
      }
    }
    // pohon/nyiur yang tertimpa huruf disingkirkan
    const taken = new Set(LETTERS.map(l => l.x + ',' + l.y));
    for (let i = AL.statics.length - 1; i >= 0; i--) {
      const o = AL.statics[i];
      if ((o.kind === 'tree' || o.kind === 'palm') && taken.has(o.x + ',' + o.y)) AL.statics.splice(i, 1);
    }
    LETTERS.forEach(l => AL.statics.push(l));
  })();
  AL.citySigns = SIGNS;

  // huruf diekstrusi: lapisan belakang digeser ke -y, muka depan di bidang +y
  const VS = 2.1; // huruf dipanjangkan ke atas: ramping & menjulang seperti huruf di bukit
  function letterFace(p, ch, yF, z, size, fill, stroke) {
    const c = p.c, o = p.P(0, yF, z), s = p.s;
    const w = size * 0.7, x0 = 0.5 - w / 2;
    const q = p.P(x0, yF, z);
    c.save();
    c.setTransform(c.getTransform().multiply(new DOMMatrix([AL.TW / 2 * s / 100, AL.TH / 2 * s / 100, 0, AL.TH * s / 100 * VS, q[0], q[1]])));
    c.font = `900 ${Math.round(size * 100)}px "Plus Jakarta Sans", system-ui, sans-serif`;
    c.textBaseline = 'top';
    c.fillStyle = fill; c.fillText(ch, 0, 0);
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 3.5; c.strokeText(ch, 0, 0); }
    c.restore();
    return o;
  }
  function drawHuruf(p, o) {
    const size = 1.2, top = 0.1 + size * VS * 0.95;
    if (o.style === 'kota') {
      // kaki beton + huruf putih mengilap berpunggung baja
      p.box(0.08, 0.4, 0.84, 0.28, 0, 0.1, '#cfc6b4');
      for (let k = 6; k >= 1; k--) letterFace(p, o.ch, 0.62 - k * 0.025, top, size, p.n ? '#4b5562' : '#8d969f');
      letterFace(p, o.ch, 0.62, top, size, p.n ? '#fff6dc' : '#f7f4ee', p.n ? '#ffe8b0' : '#d8dde2');
    } else {
      // tiang bambu + huruf anyaman daun kelapa diikat ijuk
      p.cyl(0.3, 0.45, 0.04, 0, top - 0.1, '#b89b6e');
      p.cyl(0.7, 0.45, 0.04, 0, top - 0.1, '#b89b6e');
      for (let k = 5; k >= 1; k--) letterFace(p, o.ch, 0.62 - k * 0.025, top, size, p.n ? '#4a3a2a' : '#8a6c4c');
      letterFace(p, o.ch, 0.62, top, size, p.n ? '#9a8566' : '#d1bb8c', p.n ? '#5e4630' : '#8a6c4c');
      for (const zz of [0.7, top - 0.6]) { p.box(0.27, 0.6, 0.06, 0.05, zz, 0.06, '#5e4630'); p.box(0.67, 0.6, 0.06, 0.05, zz, 0.06, '#5e4630'); } // ikatan ijuk
    }
    return top;
  }

  const baseDraw = AL.drawObject;
  AL.drawObject = function (p, o) {
    if (o.kind === 'tugu') return drawTugu(p);
    if (o.kind === 'huruf') return drawHuruf(p, o);
    return baseDraw(p, o);
  };

  // kartu landmark
  AL.landmarkCard = function () {
    const n = { kampung: 0, kota: 0 };
    for (const r of AL.residents) if (r.home >= 0) n[AL.lots[r.home].district]++;
    return `
      <button class="close" aria-label="Tutup">×</button>
      <p class="kicker">Landmark AUDIRA</p>
      <h2>Tugu Dua Tepi</h2>
      <p class="since">Berdiri di tengah sungai yang memisahkan ${AL.esc(AL.DISTRICT.kampung)} dan ${AL.esc(AL.DISTRICT.kota)}.</p>
      <p class="tugu-text">Tiang kiri dari bambu beranyam daun kelapa mewakili kampung. Tiang kanan dari kaca dan baja mewakili kota. Keduanya menopang lambang AUDIRA di puncak: satu pulau, dua tepi, satu warga.</p>
      <div class="chips"><span>${AL.esc(AL.DISTRICT.kampung)}: ${n.kampung.toLocaleString('id-ID')} warga</span><span>${AL.esc(AL.DISTRICT.kota)}: ${n.kota.toLocaleString('id-ID')} warga</span></div>`;
  };
})(window.AL);
