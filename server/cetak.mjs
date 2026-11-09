// AUDIRA LAND · Cetak biru bangunan: admin mengganti tampilan satu kavling dengan bangunan dari daftar primitif JSON.
// Validator diambil dari js/cetak.js (dijalankan di vm) supaya aturan peramban & server persis sama.
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOT_RE = /^lot\d{1,4}$/;
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').trim().slice(0, max) : '');

function loadValidator() {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  ctx.AL = {};
  vm.runInContext(readFileSync(join(ROOT, 'js', 'cetak.js'), 'utf8'), ctx, { filename: 'cetak.js' });
  const fn = ctx.AL.cetakValidasi;
  // hasil dari realm vm → salin jadi objek biasa
  return g => JSON.parse(JSON.stringify(fn(g)));
}

export function createCetak(db, deps = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cetak (
      lot        TEXT PRIMARY KEY,           -- id kavling dari peta deterministik (lot<n>)
      nama       TEXT NOT NULL,              -- nama bangunan (mis. Masjid Al-Bahri)
      jenis      TEXT NOT NULL DEFAULT '',   -- label jenis (mis. Masjid, Menara Jam)
      g          TEXT NOT NULL,              -- JSON daftar primitif yang sudah divalidasi
      updated_at INTEGER NOT NULL
    );
  `);
  const validasi = loadValidator();
  const lots = deps.world && deps.world.AL && deps.world.AL.lots;
  const q = {
    semua: db.prepare('SELECT lot, nama, jenis, g, updated_at FROM cetak ORDER BY updated_at DESC'),
    simpan: db.prepare(`INSERT INTO cetak (lot, nama, jenis, g, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lot) DO UPDATE SET nama = excluded.nama, jenis = excluded.jenis, g = excluded.g, updated_at = excluded.updated_at`),
    hapus: db.prepare('DELETE FROM cetak WHERE lot = ?'),
  };

  let cache = null; // jawaban publik, dibuat ulang saat ada perubahan
  const publik = () => {
    if (!cache) {
      const out = {};
      for (const r of q.semua.all()) {
        try { out[r.lot] = { nama: r.nama, jenis: r.jenis, g: JSON.parse(r.g) }; } catch { /* baris rusak: lewati */ }
      }
      cache = out;
    }
    return cache;
  };
  const lotInfo = id => {
    if (!lots) return null;
    const l = lots[+id.slice(3)];
    return l ? { type: l.type, name: l.name, x: l.x, y: l.y, district: l.district } : null;
  };

  function clean(b) {
    const lot = str(b.lot, 10), nama = str(b.nama, 40), jenis = str(b.jenis, 24);
    if (!LOT_RE.test(lot)) throw Object.assign(new Error('Pilih kavling dulu (format lot123)'), { code: 400 });
    if (lots && !lots[+lot.slice(3)]) throw Object.assign(new Error('Kavling ' + lot + ' tidak ada di peta'), { code: 400 });
    if (!nama) throw Object.assign(new Error('Nama bangunan wajib diisi'), { code: 400 });
    const v = validasi(b.g);
    if (!v.ok) throw Object.assign(new Error(v.error), { code: 400 });
    return { lot, nama, jenis, g: v.g, top: v.top };
  }

  function simpan(b) {
    const c = clean(b || {});
    q.simpan.run(c.lot, c.nama, c.jenis, JSON.stringify(c.g), Date.now());
    cache = null;
    return { ok: true, lot: c.lot, n: c.g.length, top: c.top };
  }
  function hapus(lot) {
    const n = q.hapus.run(str(lot, 10)).changes;
    cache = null;
    return n;
  }

  return {
    publik,
    validasi,
    simpan,
    hapus,
    async route(req, res, url, ctx) {
      const p = url.pathname, m = req.method;
      if (p === '/api/cetak' && m === 'GET') {
        ctx.send(res, 200, publik(), { 'Cache-Control': 'public, max-age=60' });
        return true;
      }
      if (!p.startsWith('/api/admin/cetak')) return false;
      if (!ctx.isAdmin()) { ctx.send(res, 401, { error: 'Token admin salah' }); return true; }
      if (p === '/api/admin/cetak' && m === 'GET') {
        const list = q.semua.all().map(r => {
          let g = [];
          try { g = JSON.parse(r.g); } catch { /* abaikan */ }
          return { lot: r.lot, nama: r.nama, jenis: r.jenis, g, updated_at: r.updated_at, kavling: lotInfo(r.lot) };
        });
        ctx.send(res, 200, { cetak: list, max: 120 });
        return true;
      }
      if (p === '/api/admin/cetak' && m === 'POST') {
        if (ctx.limited('cetak', 60, 60000)) throw ctx.bad('Terlalu sering, tunggu sebentar', 429);
        const b = await ctx.readJson(req, 16384);
        let r;
        try { r = simpan(b); } catch (e) { throw ctx.bad(e.message, e.code || 400); }
        ctx.send(res, 200, r);
        return true;
      }
      if (p === '/api/admin/cetak/hapus' && m === 'POST') {
        if (ctx.limited('cetak', 60, 60000)) throw ctx.bad('Terlalu sering, tunggu sebentar', 429);
        const b = await ctx.readJson(req, 1024);
        const n = hapus(b.lot);
        if (!n) throw ctx.bad('Cetak biru untuk kavling ini tidak ada', 404);
        ctx.send(res, 200, { ok: true });
        return true;
      }
      return false;
    },
  };
}
