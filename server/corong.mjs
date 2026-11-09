// AUDIRA LAND · Corong Kota: pesan siaran berbayar yang tampil 30 detik sebagai banner di atas peta & Taman.
// Alur: warga KTW berdonasi lewat Saweria (tautan dari env SAWERIA_URL) lalu mengajukan pesan + kode/nama donasi.
// Admin mencocokkan donasi lalu Setujui → masuk antrean. Siaran berjalan satu per satu, 30 detik masing-masing.
// Admin juga bisa siaran langsung gratis (masuk paling depan antrean).
// Antrean maju saat ada yang membuka GET /api/corong (klien online polling tiap 15 dtk), jadi pesan tidak
// "habis" tayang saat kota sepi.
import { cleanText } from './taman.mjs';

const DURASI = 30e3;
const MAKS_HURUF = 100;
const MAKS_MENUNGGU = 3;   // pengajuan menunggu per warga
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const pesan = raw => cleanText(raw).slice(0, MAKS_HURUF).trim();
function httpsLink(v) {
  const s = str(v || '', 300);
  if (!s) return '';
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

export function createCorong(db, { cfg = () => undefined } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS corong (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT NOT NULL,             -- pengaju; 'admin' untuk siaran admin
      text        TEXT NOT NULL,
      donor       TEXT NOT NULL DEFAULT '',  -- kode/nama donasi Saweria dari warga
      source      TEXT NOT NULL,             -- warga | admin
      status      TEXT NOT NULL,             -- menunggu | antre | tayang | selesai | ditolak | batal
      prio        INTEGER NOT NULL DEFAULT 0,-- 1 = siaran admin (paling depan)
      note        TEXT NOT NULL DEFAULT '',  -- alasan tolak / catatan admin
      created_at  INTEGER NOT NULL,
      approved_at INTEGER,
      start_at    INTEGER,
      end_at      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_corong_status ON corong(status, prio, approved_at);
    CREATE INDEX IF NOT EXISTS idx_corong_user ON corong(username, created_at);
  `);
  const q = {
    warga: db.prepare("SELECT 1 FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    get: db.prepare('SELECT * FROM corong WHERE id = ?'),
    tayang: db.prepare("SELECT * FROM corong WHERE status = 'tayang' ORDER BY start_at LIMIT 1"),
    selesaikan: db.prepare("UPDATE corong SET status = 'selesai' WHERE status = 'tayang' AND end_at <= ?"),
    berikut: db.prepare("SELECT * FROM corong WHERE status = 'antre' ORDER BY prio DESC, approved_at ASC, id ASC LIMIT 1"),
    mulai: db.prepare("UPDATE corong SET status = 'tayang', start_at = ?, end_at = ? WHERE id = ? AND status = 'antre'"),
    nAntre: db.prepare("SELECT COUNT(*) AS n FROM corong WHERE status = 'antre'"),
    ajukan: db.prepare("INSERT INTO corong (username, text, donor, source, status, created_at) VALUES (?, ?, ?, 'warga', 'menunggu', ?)"),
    siar: db.prepare("INSERT INTO corong (username, text, source, status, prio, created_at, approved_at) VALUES ('admin', ?, 'admin', 'antre', 1, ?, ?)"),
    menungguKu: db.prepare("SELECT COUNT(*) AS n FROM corong WHERE username = ? AND status = 'menunggu'"),
    milikKu: db.prepare('SELECT id, text, donor, status, note, created_at, start_at FROM corong WHERE username = ? ORDER BY id DESC LIMIT 10'),
    riwayat: db.prepare("SELECT id, username, source, text, start_at FROM corong WHERE status IN ('tayang', 'selesai') ORDER BY start_at DESC LIMIT 20"),
    setujui: db.prepare("UPDATE corong SET status = 'antre', approved_at = ? WHERE id = ? AND status = 'menunggu'"),
    tolak: db.prepare("UPDATE corong SET status = 'ditolak', note = ? WHERE id = ? AND status = 'menunggu'"),
    batal: db.prepare("UPDATE corong SET status = 'batal', note = ? WHERE id = ? AND status = 'antre'"),
    henti: db.prepare("UPDATE corong SET status = 'selesai', end_at = ? WHERE id = ? AND status = 'tayang'"),
    adminDaftar: db.prepare("SELECT * FROM corong WHERE status IN ('menunggu', 'antre', 'tayang') ORDER BY CASE status WHEN 'tayang' THEN 0 WHEN 'antre' THEN 1 ELSE 2 END, prio DESC, COALESCE(approved_at, created_at), id"),
    adminRiwayat: db.prepare("SELECT * FROM corong WHERE status IN ('selesai', 'ditolak', 'batal') ORDER BY id DESC LIMIT 60"),
  };

  // majukan antrean: selesaikan yang lewat 30 dtk, tayangkan berikutnya
  function tick(now = Date.now()) {
    q.selesaikan.run(now);
    let cur = q.tayang.get();
    if (!cur) {
      const nx = q.berikut.get();
      if (nx && q.mulai.run(now, now + DURASI, nx.id).changes) cur = q.get.get(nx.id);
    }
    return cur || null;
  }
  const saweria = () => httpsLink(cfg('SAWERIA_URL'));
  const harga = () => str(cfg('CORONG_HARGA') || '', 60);

  // jawaban publik di-cache 5 dtk di memori, tapi dibuang begitu siaran yang sedang tayang habis
  let cache = null;
  function publik(now = Date.now()) {
    if (cache && now - cache.t < 5e3 && (!cache.body.on || cache.body.on.end_at > now)) return cache.body;
    const cur = tick(now);
    const body = {
      now,
      on: cur ? { id: cur.id, text: cur.text, u: cur.source === 'admin' ? '' : cur.username, admin: cur.source === 'admin', start_at: cur.start_at, end_at: cur.end_at } : null,
      antre: q.nAntre.get().n,
    };
    cache = { t: now, body };
    return body;
  }
  const bust = () => { cache = null; };

  return {
    tick, publik,
    async route(req, res, url, ctx) {
      const p = url.pathname, m = req.method;
      if (p === '/api/corong' && m === 'GET') {
        const now = Date.now(), body = publik(now);
        return ctx.send(res, 200, { ...body, now }, { 'Cache-Control': 'public, max-age=5' }), true;
      }
      if (p === '/api/corong/riwayat' && m === 'GET') {
        return ctx.send(res, 200, {
          riwayat: q.riwayat.all().map(r => ({ id: r.id, u: r.source === 'admin' ? '' : r.username, admin: r.source === 'admin', text: r.text, t: r.start_at })),
          saweria: saweria(), harga: harga(), durasi: DURASI / 1000, maks: MAKS_HURUF,
        }, { 'Cache-Control': 'public, max-age=20' }), true;
      }
      if (p === '/api/corong/aku' && m === 'GET') {
        const u = ctx.user();
        if (!u) return ctx.send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW).' }), true;
        return ctx.send(res, 200, { user: u, list: q.milikKu.all(u), saweria: saweria(), harga: harga() }, { 'Cache-Control': 'no-store' }), true;
      }
      if (p === '/api/corong/ajukan') {
        if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
        const u = ctx.user();
        if (!u) return ctx.send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW).' }), true;
        if (ctx.limited('corong', 6, 3600e3)) return ctx.send(res, 429, { error: 'Terlalu sering mengajukan. Coba lagi nanti.' }), true;
        const b = await ctx.readJson(req, 2048);
        const now = Date.now();
        if (!q.warga.get(u, now)) throw ctx.bad('Hanya warga yang sudah tiba di kota yang bisa siaran.', 403);
        const text = pesan(b.text);
        const donor = str(b.donor, 60);
        if (text.length < 3) throw ctx.bad('Tulis pesanmu dulu (minimal 3 huruf).');
        if (!donor) throw ctx.bad('Isi kode atau nama donasi Saweria supaya admin bisa mencocokkan.');
        if (q.menungguKu.get(u).n >= MAKS_MENUNGGU) throw ctx.bad(`Kamu masih punya ${MAKS_MENUNGGU} pengajuan yang menunggu. Tunggu dicek admin dulu.`);
        const r = q.ajukan.run(u, text, donor, now);
        return ctx.send(res, 200, { id: Number(r.lastInsertRowid), text, status: 'menunggu' }), true;
      }

      if (!p.startsWith('/api/admin/corong')) return false;
      if (!ctx.isAdmin()) return ctx.send(res, 401, { error: 'Token admin salah' }), true;
      const a = p.slice('/api/admin/corong'.length), now = Date.now();
      if (a === '' && m === 'GET') {
        tick(now);
        return ctx.send(res, 200, { now, aktif: q.adminDaftar.all(), riwayat: q.adminRiwayat.all(), saweria: saweria(), harga: harga(), durasi: DURASI / 1000 }), true;
      }
      if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
      const b = await ctx.readJson(req, 2048);
      const id = Math.floor(+b.id) || 0;
      bust();
      if (a === '/setujui') {
        if (!q.setujui.run(now, id).changes) throw ctx.bad('Pengajuan tidak ditemukan atau sudah diproses');
        return ctx.send(res, 200, { ok: true, antre: q.nAntre.get().n }), true;
      }
      if (a === '/tolak') {
        if (!q.tolak.run(str(b.note, 120), id).changes) throw ctx.bad('Pengajuan tidak ditemukan atau sudah diproses');
        return ctx.send(res, 200, { ok: true }), true;
      }
      if (a === '/siar') {
        // admin tidak disensor kata kasar (tetap dibersihkan karakter kontrol & tautan lewat cleanText)
        const text = pesan(b.text);
        if (text.length < 3) throw ctx.bad('Tulis pesan siaran dulu (minimal 3 huruf).');
        const r = q.siar.run(text, now, now);
        tick(now);
        return ctx.send(res, 200, { id: Number(r.lastInsertRowid) }), true;
      }
      if (a === '/batal') {
        // batalkan dari antrean, atau hentikan yang sedang tayang
        const ch = q.batal.run(str(b.note, 120) || 'Dibatalkan admin', id).changes || q.henti.run(now, id).changes;
        if (!ch) throw ctx.bad('Siaran tidak ada di antrean');
        tick(now);
        return ctx.send(res, 200, { ok: true }), true;
      }
      return ctx.send(res, 404, { error: 'Tidak ditemukan' }), true;
    },
  };
}
