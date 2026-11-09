/* AUDIRA LAND · penggambar cetak biru di peta.
   js/cetak.js memvalidasi & memasang lot.cetak = { nama, jenis, g, top, v }. File ini menggambar primitifnya
   (urutan daftar = urutan gambar, jadi yang di belakang ditulis dulu) dan menganggap kavling itu sudah berdiri.
   Tidak dimuat di server (server hanya memakai validator di js/cetak.js). */
(function (AL) {
  'use strict';
  if (!AL || !AL.drawObject || !AL.Painter) return;

  const baseBuilt = AL.isBuilt;
  AL.isBuilt = l => !!(l && l.cetak) || baseBuilt(l);

  function limas(p, x, y, w, d, z, r, c) {
    const cx = x + w / 2, cy = y + d / 2, t = [cx, cy, z + r];
    p.poly([[x, y, z], [x + w, y, z], t], AL.shade(c, 0.86));
    p.poly([[x, y, z], [x, y + d, z], t], AL.shade(c, 0.95));
    p.poly([[x, y + d, z], [x + w, y + d, z], t], c);
    p.poly([[x + w, y, z], [x + w, y + d, z], t], AL.shade(c, 0.74));
  }
  function kubah(p, cx, cy, r, z0, c) {
    // tumpukan cincin makin kecil: cukup bulat di semua zoom tanpa kode gradien khusus
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI / 2, a1 = (i + 1) / N * Math.PI / 2;
      const rr = r * Math.cos(a0), z = z0 + r * 1.1 * Math.sin(a0), h = r * 1.1 * (Math.sin(a1) - Math.sin(a0));
      p.cyl(cx, cy, Math.max(0.01, rr), z, h + 0.004, AL.shade(c, 0.94 + i * 0.025));
    }
  }

  function gambar(p, lot) {
    const g = lot.cetak.g;
    for (let i = 0; i < g.length; i++) {
      const it = g[i];
      switch (it[0]) {
        case 'kotak': p.box(it[1], it[2], it[3], it[4], it[7] || 0, it[5], it[6]); break;
        case 'jendela': p.windows(it[1], it[2], it[3], it[4], it[7] || 0, it[5], { glass: it[6], seed: lot.i * 31 + i }); break;
        case 'atap':
          if (it[8] === 'y') p.roofY(it[1], it[2], it[3], it[4], it[5], it[6], it[7], AL.shade(it[7], 1.15));
          else p.roofX(it[1], it[2], it[3], it[4], it[5], it[6], it[7], AL.shade(it[7], 1.15));
          break;
        case 'limas': limas(p, it[1], it[2], it[3], it[4], it[5], it[6], it[7]); break;
        case 'kubah': kubah(p, it[1], it[2], it[3], it[4], it[5]); break;
        case 'tiang': p.cyl(it[1], it[2], it[3], it[4], it[5], it[6]); break;
        case 'bidang': { const [, x, y, w, d, c, z] = it; p.poly([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], c); break; }
        case 'pohon': p.tree(it[1], it[2], it[3], lot.i + i); break;
        case 'teks': p.textY(it[5], it[1], it[2], it[3] + it[4], it[4], p.col(it[6])); break;
      }
    }
    return Math.max(0.3, lot.cetak.top);
  }

  const baseDraw = AL.drawObject;
  AL.drawObject = function (p, o) { return o && o.type && o.cetak ? gambar(p, o) : baseDraw(p, o); };
})(window.AL);
