/* AUDIRA LAND · avatar prosedural dari seed. Tanpa file gambar.
   JANGAN ubah urutan undian di mkLook: mengubah tampilan semua warga. Tambah undian baru hanya di belakang. */
(function (AL) {
  'use strict';
  const SKIN = ['#f6d2b8', '#ecbf9c', '#d9a27a', '#b9805a', '#8d5a3b'];
  const HAIR = ['#2b1d16', '#3d2a1e', '#5a3a24', '#1c1c24', '#7a4b2a', '#a8642f'];
  const SHIRT = ['#d9967c', '#5f9e98', '#d8b56a', '#7d86c4', '#cf7f9b', '#6fae86', '#3d6e9e', '#d99a5f', '#9b84c4'];
  const PANTS = ['#2d3a55', '#4a4a52', '#5b4636', '#2f5d62', '#33333b'];
  const HIJAB = ['#e8b6c8', '#9cc9d6', '#c9b6e8', '#f2d49b', '#a9d6a8', '#e9e2d0', '#3d6e9e'];
  const BG = ['#ffe3d3', '#d6f0ef', '#fff0c9', '#e3e6fb', '#fbe0ea', '#dff3e6'];

  AL.mkLook = function (seed) {
    const r = AL.rng(seed);
    const g = r() < 0.5 ? 'p' : 'l';
    return {
      g,
      skin: AL.pick(SKIN, r()),
      hair: AL.pick(HAIR, r()),
      style: Math.floor(r() * 4),
      shirt: AL.pick(SHIRT, r()),
      pants: AL.pick(PANTS, r()),
      hijab: g === 'p' && r() < 0.35 ? AL.pick(HIJAB, r()) : null,
      bg: AL.pick(BG, r()),
      glasses: r() < 0.18,
    };
  };

  function circle(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

  // potret bulat untuk kartu warga
  AL.drawPortrait = function (c, L, S) {
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = L.bg; c.fillRect(0, 0, S, S);
    const cx = S / 2, hy = S * 0.42, R = S * 0.2;
    // bahu & baju
    c.fillStyle = L.shirt;
    c.beginPath(); c.ellipse(cx, S * 1.02, S * 0.4, S * 0.33, 0, Math.PI, 0); c.fill();
    if (L.hijab) {
      c.fillStyle = L.hijab;
      c.beginPath(); c.ellipse(cx, hy + R * 0.25, R * 1.45, R * 1.6, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(cx - R * 1.4, hy + R * 0.6); c.lineTo(cx + R * 1.4, hy + R * 0.6); c.lineTo(cx + R * 1.1, S * 0.86); c.lineTo(cx - R * 1.1, S * 0.86); c.fill();
    } else {
      // leher
      c.fillStyle = AL.shade(L.skin, 0.9);
      c.fillRect(cx - R * 0.35, hy + R * 0.6, R * 0.7, R * 0.9);
      // rambut belakang (panjang untuk sebagian gaya)
      if (L.g === 'p' && L.style !== 3) {
        c.fillStyle = L.hair;
        c.beginPath(); c.ellipse(cx, hy + R * 0.5, R * 1.18, R * 1.5, 0, 0, Math.PI * 2); c.fill();
      }
    }
    circle(c, cx, hy, R, L.skin);
    // rambut depan
    if (!L.hijab) {
      c.fillStyle = L.hair;
      c.beginPath();
      if (L.style === 0) { c.ellipse(cx, hy - R * 0.35, R * 1.05, R * 0.75, 0, Math.PI, 0); }
      else if (L.style === 1) { c.ellipse(cx - R * 0.15, hy - R * 0.4, R * 1.08, R * 0.7, -0.25, Math.PI, 0); }
      else if (L.style === 2) { c.arc(cx, hy - R * 0.1, R * 1.08, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(cx, hy - R * 0.55); }
      else { c.ellipse(cx, hy - R * 0.55, R * 0.95, R * 0.55, 0, Math.PI, 0); }
      c.fill();
      if (L.g === 'l' && L.style === 3) { circle(c, cx, hy - R * 1.05, R * 0.38, L.hair); }
    } else {
      c.fillStyle = AL.shade(L.hijab, 0.85);
      c.beginPath(); c.arc(cx, hy, R * 1.12, Math.PI * 1.05, Math.PI * 1.95); c.lineWidth = R * 0.18; c.strokeStyle = c.fillStyle; c.stroke();
    }
    // wajah
    const ey = hy + R * 0.08;
    circle(c, cx - R * 0.38, ey, R * 0.1, '#2a1f1a');
    circle(c, cx + R * 0.38, ey, R * 0.1, '#2a1f1a');
    c.fillStyle = 'rgba(240,120,110,.35)';
    c.beginPath(); c.ellipse(cx - R * 0.6, ey + R * 0.35, R * 0.18, R * 0.11, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + R * 0.6, ey + R * 0.35, R * 0.18, R * 0.11, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7a3d2e'; c.lineWidth = Math.max(1, R * 0.08); c.lineCap = 'round';
    c.beginPath(); c.arc(cx, ey + R * 0.3, R * 0.25, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    if (L.glasses) {
      c.strokeStyle = '#2b2b33'; c.lineWidth = Math.max(1, R * 0.07);
      c.beginPath(); c.arc(cx - R * 0.38, ey, R * 0.26, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(cx + R * 0.38, ey, R * 0.26, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(cx - R * 0.12, ey); c.lineTo(cx + R * 0.12, ey); c.stroke();
    }
    c.restore();
  };

  // palet pejalan (warna + bayangan + campuran malam) di-cache per objek look; dihitung ulang
  // hanya bila tingkat malam (dibulatkan 1/32) berubah. Menghindari parse hex & string baru tiap bingkai.
  const palCache = new WeakMap();
  function tone(h, f, q) {
    let v = f === 1 ? h : AL.shade(h, f);
    return q > 0 ? AL.mix(v, AL.NIGHT, q / 32) : v;
  }
  function palette(L, nt) {
    const q = Math.round(nt * 32);
    let e = palCache.get(L);
    if (e && e.q === q) return e;
    const skirt = L.g === 'p' && L.style === 1;
    e = {
      q,
      shirt: tone(L.shirt, 1, q), shirtD: tone(L.shirt, 0.84, q), sleeve: tone(L.shirt, 0.9, q),
      pants: tone(L.pants, 1, q), legs: skirt ? tone(L.skin, 0.92, q) : tone(L.pants, 0.94, q),
      shoe: tone('#3a3236', 1, q), skin: tone(L.skin, 1, q), hand: tone(L.skin, 0.95, q),
      hair: tone(L.hair, 1, q), hijab: L.hijab ? tone(L.hijab, 1, q) : null, hijabD: L.hijab ? tone(L.hijab, 0.9, q) : null,
      ink: tone('#2a1f1a', 1, q >> 1), rim: 'rgba(255,214,140,' + (q / 32).toFixed(3) + ')',
    };
    palCache.set(L, e);
    return e;
  }

  // naik-turun badan saat berjalan: paling tinggi saat kaki berpapasan, paling rendah saat kaki terbuka.
  // dipakai juga oleh aksesori.js supaya topi/syal ikut bergerak bersama kepala.
  AL.walkerBob = (t, s) => (t ? (1 - Math.abs(Math.sin(t * 9))) * 0.7 * s : 0);

  // warga kecil berjalan di peta. (x,y)= titik kaki di layar, k = skala (zoom)
  // t = waktu langkah (0 = berdiri diam). Arah hadap opsional dari agen: L._hx (-1/0/1, kiri/kanan layar), L._bk (membelakangi kamera).
  AL.drawWalker = function (c, x, y, k, L, t, night) {
    night = night || 0;
    const C = palette(L, night * 0.5), TAU = Math.PI * 2;
    if (k < 0.45) {
      // jauh: badan + kepala saja, tetap terbaca sebagai orang
      const u = Math.max(1, k * 2.6);
      c.fillStyle = C.shirt; c.fillRect(x - 0.9 * u, y - 3.2 * u, 1.8 * u, 2.6 * u);
      circle(c, x, y - 4 * u, 0.85 * u, C.hijab || C.skin);
      return;
    }
    const s = k * 0.9, moving = !!t, ph = t * 9;
    const sw = moving ? Math.sin(ph) : 0, cw = moving ? Math.cos(ph) : 0;
    const bob = AL.walkerBob(t, s);
    const hxF = L._hx || 0, back = !!L._bk, vd = back ? -1 : 1;
    const detail = k >= 0.8;

    // bayangan kontak lembut (dua lapis saat dekat, tanpa blur)
    c.fillStyle = 'rgba(20,40,60,.14)';
    c.beginPath(); c.ellipse(x + 0.4 * s, y, 4.4 * s, 1.8 * s, 0, 0, TAU); c.fill();
    if (detail) { c.fillStyle = 'rgba(20,40,60,.15)'; c.beginPath(); c.ellipse(x + 0.2 * s, y, 2.7 * s, 1.05 * s, 0, 0, TAU); c.fill(); }

    // kaki: ayun maju-mundur searah jalan, kaki yang mengayun terangkat sedikit
    const skirt = L.g === 'p' && L.style === 1;
    const hipY = y - 5 * s - bob * 0.5;
    const p0 = sw, lift0 = Math.max(0, cw) * 0.9 * s, lift1 = Math.max(0, -cw) * 0.9 * s;
    const swX = hxF ? 1.5 * s * hxF : 0, swY = (hxF ? 0.45 : 0.6) * s * vd;
    const f0x = x - 1.05 * s + p0 * swX, f0y = y - 0.85 * s - lift0 + p0 * swY;
    const f1x = x + 1.05 * s - p0 * swX, f1y = y - 0.85 * s - lift1 - p0 * swY;
    c.lineCap = 'round'; c.lineWidth = 1.75 * s; c.strokeStyle = C.legs;
    c.beginPath(); c.moveTo(x - 1.05 * s, hipY); c.lineTo(f0x, f0y); c.moveTo(x + 1.05 * s, hipY); c.lineTo(f1x, f1y); c.stroke();
    if (detail) {
      const so = hxF * 0.35 * s;
      c.fillStyle = C.shoe; c.beginPath();
      c.ellipse(f0x + so, f0y + 0.55 * s, 1.15 * s, 0.6 * s, 0, 0, TAU); c.moveTo(f1x + so + 1.15 * s, f1y + 0.55 * s);
      c.ellipse(f1x + so, f1y + 0.55 * s, 1.15 * s, 0.6 * s, 0, 0, TAU); c.fill();
    }

    // badan: baju + sisi kanan lebih gelap (cahaya dari kiri atas, sama seperti bangunan)
    const top = y - 11.5 * s - bob;
    const hx = x, hy = y - 14.5 * s - bob, fo = hxF * 0.45 * s;
    const longHair = !L.hijab && L.g === 'p' && L.style !== 3;
    if (longHair && !back) { // menghadap kamera: rambut panjang di belakang bahu
      c.fillStyle = C.hair; c.beginPath(); c.ellipse(hx - fo * 0.6, hy + 1.3 * s, 3.25 * s, 3.9 * s, 0, 0, TAU); c.fill();
    }
    if (skirt) {
      c.fillStyle = C.pants;
      c.beginPath(); c.moveTo(x - 3 * s, top + 4.5 * s); c.lineTo(x + 3 * s, top + 4.5 * s); c.lineTo(x + 3.7 * s, y - 2.6 * s); c.lineTo(x - 3.7 * s, y - 2.6 * s); c.closePath(); c.fill();
    }
    c.fillStyle = C.shirt;
    c.beginPath(); c.roundRect(x - 3 * s, top, 6 * s, 7 * s, 2 * s); c.fill();
    if (detail) { c.fillStyle = C.shirtD; c.beginPath(); c.roundRect(x + 0.9 * s, top, 2.1 * s, 7 * s, [0, 2 * s, 2 * s, 0]); c.fill(); }

    // lengan: ayun berlawanan dengan kaki di sisi yang sama
    if (k >= 0.6) {
      const shY = top + 1.4 * s, aX = hxF ? 1.7 * s * hxF : 0, aD = (hxF ? 0.5 : 0.25) * s, aY = hxF ? 0 : 0.5 * s * vd;
      const l0x = x - 3.1 * s - sw * aX, l0y = shY + 3.9 * s - Math.abs(sw) * aD - sw * aY;
      const l1x = x + 3.1 * s + sw * aX, l1y = shY + 3.9 * s - Math.abs(sw) * aD + sw * aY;
      c.lineWidth = 1.35 * s; c.strokeStyle = C.sleeve;
      c.beginPath(); c.moveTo(x - 2.75 * s, shY); c.lineTo(l0x, l0y); c.moveTo(x + 2.75 * s, shY); c.lineTo(l1x, l1y); c.stroke();
      if (detail) {
        c.fillStyle = C.hand; c.beginPath();
        c.arc(l0x, l0y + 0.2 * s, 0.75 * s, 0, TAU); c.moveTo(l1x + 0.75 * s, l1y + 0.2 * s); c.arc(l1x, l1y + 0.2 * s, 0.75 * s, 0, TAU); c.fill();
      }
    }

    // kepala: siluet dibedakan lewat rambut/hijab; membelakangi = rambut menutup wajah
    if (L.hijab) {
      c.fillStyle = C.hijabD;
      c.beginPath(); c.moveTo(hx - 3.1 * s, hy + 1 * s); c.lineTo(hx + 3.1 * s, hy + 1 * s); c.lineTo(hx + 3.5 * s, top + 2.6 * s); c.lineTo(hx - 3.5 * s, top + 2.6 * s); c.closePath(); c.fill();
      circle(c, hx, hy + 0.3 * s, 3.4 * s, C.hijab);
      if (!back) circle(c, hx + 0.5 * s + fo, hy + 0.5 * s, 2.1 * s, C.skin);
    } else {
      if (back) {
        c.fillStyle = C.hair; c.beginPath();
        if (longHair) { c.ellipse(hx, hy + 1.3 * s, 3.25 * s, 3.9 * s, 0, 0, TAU); c.moveTo(hx + 3 * s, hy); } // rambut terurai di punggung
        c.arc(hx, hy, 3 * s, 0, TAU); c.fill();
      } else {
        circle(c, hx + fo * 0.5, hy, 2.9 * s, C.skin);
        c.fillStyle = C.hair; c.beginPath();
        if (L.style === 1) c.ellipse(hx - fo - 0.3 * s, hy - 0.55 * s, 3.1 * s, 2.2 * s, -0.25, Math.PI, 0);
        else if (L.style === 2 && L.g === 'l') c.ellipse(hx - fo, hy - 0.7 * s, 3.05 * s, 2.5 * s, 0, Math.PI, 0);
        else c.arc(hx - fo, hy - 0.4 * s, 3.05 * s, Math.PI, 0);
        c.fill();
        if (k >= 1.6) { // mata kecil, hanya saat zoom dekat
          const ex = hx + fo * 1.3, ey = hy + 0.6 * s;
          c.fillStyle = C.ink; c.beginPath();
          c.arc(ex - 1.05 * s, ey, 0.36 * s, 0, TAU); c.moveTo(ex + 1.41 * s, ey); c.arc(ex + 1.05 * s, ey, 0.36 * s, 0, TAU); c.fill();
        }
      }
      if (L.g === 'l' && L.style === 3) circle(c, hx - fo * 0.4, hy - 3.1 * s, 1.15 * s, C.hair); // kuncir atas
    }

    // malam: garis tepi hangat tipis supaya siluet tetap terbaca di atas aspal gelap
    if (night > 0.3 && detail) {
      c.strokeStyle = C.rim;
      c.lineWidth = Math.max(0.8, 0.45 * s);
      c.beginPath(); c.arc(hx, hy + (L.hijab ? 0.3 * s : 0), (L.hijab ? 3.4 : 3) * s, -Math.PI * 0.95, -Math.PI * 0.1);
      c.moveTo(x - 3 * s, top + 1.6 * s); c.lineTo(x - 3 * s, top + 5.6 * s); c.stroke();
    }
    c.lineCap = 'butt';
  };
})(window.AL);
