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

  // warga kecil berjalan di peta. (x,y)= titik kaki di layar, k = skala (zoom)
  AL.drawWalker = function (c, x, y, k, L, t, night) {
    const nt = night * 0.5;
    const col = h => (nt > 0 ? AL.mix(h, AL.NIGHT, nt) : h);
    if (k < 0.45) { circle(c, x, y - 3, 2, col(L.shirt)); return; }
    const s = k * 0.9, bob = Math.abs(Math.sin(t * 9)) * 0.8 * s, sw = Math.sin(t * 9) * 1.4 * s;
    c.fillStyle = 'rgba(20,40,60,.22)';
    c.beginPath(); c.ellipse(x, y, 4 * s, 1.6 * s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = col(L.pants);
    c.fillRect(x - 2.2 * s + sw * 0.3, y - 5 * s, 1.8 * s, 5 * s);
    c.fillRect(x + 0.4 * s - sw * 0.3, y - 5 * s, 1.8 * s, 5 * s);
    c.fillStyle = col(L.shirt);
    c.beginPath(); c.roundRect(x - 3 * s, y - 11.5 * s - bob, 6 * s, 7 * s, 2 * s); c.fill();
    const hx = x, hy = y - 14.5 * s - bob;
    if (L.hijab) { circle(c, hx, hy + 0.4 * s, 3.4 * s, col(L.hijab)); circle(c, hx + 0.6 * s, hy + 0.5 * s, 2.1 * s, col(L.skin)); }
    else { circle(c, hx, hy, 2.9 * s, col(L.skin)); c.fillStyle = col(L.hair); c.beginPath(); c.arc(hx, hy - 0.4 * s, 3 * s, Math.PI, 0); c.fill(); }
  };
})(window.AL);
