/* AUDIRA LAND · cetak biru: bangunan khusus per kavling dari daftar primitif JSON (tanpa kode dieksekusi).
   Validator di file ini juga dipakai server (server/cetak.mjs memuatnya lewat vm), jadi aturannya satu sumber.

   Format: daftar primitif, koordinat lokal kavling 2×2 (x, y: 0..2), tinggi z dalam petak (0..12).
     ["kotak",   x, y, w, d, h, "#warna", z0?]        balok
     ["jendela", x, y, w, d, h, "#kaca",  z0?]        jendela di dua sisi depan balok yang sama ukurannya
     ["atap",    x, y, w, d, z0, tinggi, "#warna", "x"|"y"?]   atap pelana (bubungan sepanjang x / y)
     ["limas",   x, y, w, d, z0, tinggi, "#warna"]    atap limas / puncak menara
     ["kubah",   cx, cy, r, z0, "#warna"]             kubah setengah bola
     ["tiang",   cx, cy, r, z0, h, "#warna"]          silinder (tiang, menara bulat, tangki)
     ["bidang",  x, y, w, d, "#warna", z0?]           permukaan datar (lantai, kolam, jalan setapak)
     ["pohon",   x, y, ukuran]                        pohon hias (ukuran 0.3..1.5)
     ["teks",    x, y, z0, ukuran, "TEKS", "#warna"]  tulisan di bidang depan (+y), maks 16 huruf
*/
(function (AL) {
  'use strict';
  const MAX_G = 120, ZMAX = 12, EPS = 1e-6;
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

  function validasi(input) {
    let g = input;
    if (typeof g === 'string') {
      try { g = JSON.parse(g); } catch (e) { return { ok: false, error: 'JSON tidak valid: ' + String(e.message || e).slice(0, 80) }; }
    }
    if (g && !Array.isArray(g) && Array.isArray(g.g)) g = g.g;
    if (!Array.isArray(g)) return { ok: false, error: 'Cetak biru harus berupa daftar (array) primitif' };
    if (!g.length) return { ok: false, error: 'Cetak biru kosong' };
    if (g.length > MAX_G) return { ok: false, error: 'Maksimal ' + MAX_G + ' primitif (ada ' + g.length + ')' };
    const out = [];
    let top = 0;
    for (let i = 0; i < g.length; i++) {
      const it = g[i], at = 'Primitif #' + (i + 1);
      if (!Array.isArray(it) || typeof it[0] !== 'string') return { ok: false, error: at + ': harus berupa ["jenis", ...angka]' };
      const kind = it[0];
      const fail = m => ({ ok: false, error: at + ' (' + kind + '): ' + m });
      const num = (k, name, lo, hi, def) => {
        let v = it[k];
        if (v === undefined && def !== undefined) v = def;
        if (typeof v !== 'number' || !Number.isFinite(v)) throw name + ' harus angka';
        if (v < lo - EPS || v > hi + EPS) throw name + ' harus di antara ' + lo + ' dan ' + hi;
        return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
      };
      const col = k => {
        const v = it[k];
        if (typeof v !== 'string' || !HEX.test(v)) throw 'warna harus hex, mis. "#e8d9b5"';
        const s = v.slice(1).toLowerCase();
        return '#' + (s.length === 3 ? s.split('').map(c => c + c).join('') : s);
      };
      const rect = () => {
        const x = num(1, 'x', 0, 2), y = num(2, 'y', 0, 2), w = num(3, 'lebar (w)', 0.02, 2), d = num(4, 'dalam (d)', 0.02, 2);
        if (x + w > 2 + EPS) throw 'x + w melebihi batas kavling (maks 2)';
        if (y + d > 2 + EPS) throw 'y + d melebihi batas kavling (maks 2)';
        return [x, y, w, d];
      };
      const len = n => { if (it.length > n) throw 'terlalu banyak nilai (maks ' + (n - 1) + ')'; };
      let p;
      try {
        if (kind === 'kotak' || kind === 'jendela') {
          len(8);
          const [x, y, w, d] = rect(), h = num(5, 'tinggi (h)', 0.02, ZMAX), c = col(6), z0 = num(7, 'z0', 0, ZMAX, 0);
          if (z0 + h > ZMAX + EPS) throw 'z0 + h melebihi ' + ZMAX;
          p = [kind, x, y, w, d, h, c, z0]; top = Math.max(top, z0 + h);
        } else if (kind === 'atap' || kind === 'limas') {
          len(kind === 'atap' ? 9 : 8);
          const [x, y, w, d] = rect(), z0 = num(5, 'z0', 0, ZMAX), r = num(6, 'tinggi', 0.02, 4), c = col(7);
          if (z0 + r > ZMAX + EPS) throw 'z0 + tinggi melebihi ' + ZMAX;
          p = [kind, x, y, w, d, z0, r, c];
          if (kind === 'atap') {
            const a = it[8] === undefined ? 'x' : it[8];
            if (a !== 'x' && a !== 'y') throw 'arah bubungan harus "x" atau "y"';
            p.push(a);
          }
          top = Math.max(top, z0 + r);
        } else if (kind === 'kubah') {
          len(6);
          const cx = num(1, 'cx', 0, 2), cy = num(2, 'cy', 0, 2), r = num(3, 'jari-jari (r)', 0.03, 1), z0 = num(4, 'z0', 0, ZMAX), c = col(5);
          if (cx - r < -EPS || cx + r > 2 + EPS || cy - r < -EPS || cy + r > 2 + EPS) throw 'kubah keluar dari kavling';
          if (z0 + r * 1.1 > ZMAX + EPS) throw 'puncak kubah melebihi ' + ZMAX;
          p = [kind, cx, cy, r, z0, c]; top = Math.max(top, z0 + r * 1.1);
        } else if (kind === 'tiang') {
          len(7);
          const cx = num(1, 'cx', 0, 2), cy = num(2, 'cy', 0, 2), r = num(3, 'jari-jari (r)', 0.01, 1), z0 = num(4, 'z0', 0, ZMAX), h = num(5, 'tinggi (h)', 0.02, ZMAX), c = col(6);
          if (cx - r < -EPS || cx + r > 2 + EPS || cy - r < -EPS || cy + r > 2 + EPS) throw 'tiang keluar dari kavling';
          if (z0 + h > ZMAX + EPS) throw 'z0 + h melebihi ' + ZMAX;
          p = [kind, cx, cy, r, z0, h, c]; top = Math.max(top, z0 + h);
        } else if (kind === 'bidang') {
          len(7);
          const [x, y, w, d] = rect(), c = col(5), z0 = num(6, 'z0', 0, ZMAX, 0);
          p = [kind, x, y, w, d, c, z0]; top = Math.max(top, z0);
        } else if (kind === 'pohon') {
          len(4);
          p = [kind, num(1, 'x', 0.1, 1.9), num(2, 'y', 0.1, 1.9), num(3, 'ukuran', 0.3, 1.5)];
          top = Math.max(top, p[3] * 1.3);
        } else if (kind === 'teks') {
          len(7);
          const x = num(1, 'x', 0, 2), y = num(2, 'y', 0, 2), z0 = num(3, 'z0', 0, ZMAX), u = num(4, 'ukuran', 0.05, 0.4);
          if (typeof it[5] !== 'string') throw 'teks harus berupa tulisan';
          const t = it[5].replace(/[^A-Za-z0-9 .,'&!?:()\-]/g, '').trim().slice(0, 16);
          if (!t) throw 'teks kosong (huruf, angka, spasi, dan .,\'&!?:()- saja)';
          p = [kind, x, y, z0, u, t, col(6)]; top = Math.max(top, z0 + u);
        } else {
          return { ok: false, error: at + ': jenis "' + String(kind).slice(0, 20) + '" tidak dikenal (kotak, jendela, atap, limas, kubah, tiang, bidang, pohon, teks)' };
        }
      } catch (m) {
        if (typeof m !== 'string') throw m;
        return fail(m);
      }
      out.push(p);
    }
    return { ok: true, g: out, top: Math.round(top * 1000) / 1000 };
  }
  AL.cetakValidasi = validasi;
  AL.CETAK_MAX = MAX_G;

  // ---------- klien peta: muat cetak biru dan pasang ke kavling ----------
  const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n) : '');
  AL.applyCetak = function (data) {
    if (!AL.lots) return 0;
    const seen = new Set();
    let n = 0;
    for (const id of Object.keys(data || {})) {
      const m = /^lot(\d{1,4})$/.exec(id), lot = m && AL.lots[+m[1]];
      if (!lot) continue;
      const rec = data[id], v = validasi(rec && rec.g);
      if (!v.ok) { console.warn('[cetak] ' + id + ': ' + v.error); continue; }
      const ver = AL.hash32(JSON.stringify(v.g)).toString(36);
      seen.add(lot.i);
      if (!lot.cetak || lot.cetak.v !== ver) n++;
      lot.cetak = { nama: str(rec.nama, 40), jenis: str(rec.jenis, 24), g: v.g, top: v.top, v: ver };
      lot.hmax = Math.max(AL.HMAX[lot.type] || 1.2, v.top + 0.3);
    }
    for (const lot of AL.lots) {
      if (lot.cetak && !seen.has(lot.i)) { delete lot.cetak; lot.hmax = AL.HMAX[lot.type]; n++; }
    }
    return n;
  };

  async function muat() {
    try {
      const r = await fetch('/api/cetak', { signal: AbortSignal.timeout(8000) });
      if (r.ok) AL.applyCetak(await r.json());
    } catch (e) { /* server tidak terjangkau: biarkan bangunan biasa */ }
  }
  if (AL.onBoot && typeof document !== 'undefined' && document.getElementById('map')) {
    AL.onBoot.push(() => { muat(); setInterval(muat, 180000); });
  }
})(window.AL);
