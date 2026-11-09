// AUDIRA LAND · Slot sponsor: papan reklame, hologram di atas gedung, toko bermerek.
// Slot berupa id dari peta deterministik: papan:x,y · holo:<lot> · toko:<lot>.
const SLOT_RE = /^(papan:\d{1,3},\d{1,3}|holo:\d{1,4}|toko:\d{1,4})$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').trim().slice(0, max) : '');
const bad = msg => Object.assign(new Error(msg), { code: 400 });
function httpsLink(v) {
  const s = str(v, 300);
  if (!s) return '';
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
const todayWib = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export function createSponsor(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sponsors (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slot       TEXT NOT NULL,
      name       TEXT NOT NULL,              -- nama merek (tampil di kota)
      tagline    TEXT NOT NULL DEFAULT '',
      c1         TEXT NOT NULL,              -- warna utama
      c2         TEXT NOT NULL,              -- warna teks/aksen
      link       TEXT NOT NULL DEFAULT '',   -- hanya https; dibuka lewat /api/sponsor/klik supaya terhitung
      start_date TEXT NOT NULL,              -- YYYY-MM-DD WIB
      end_date   TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',   -- catatan internal (kontak mitra, harga). Tidak tampil publik
      views      INTEGER NOT NULL DEFAULT 0, -- kartu mitra dibuka
      clicks     INTEGER NOT NULL DEFAULT 0, -- tombol Kunjungi diklik
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sponsor_slot ON sponsors(slot, start_date, end_date);
  `);

  function clean(b) {
    const slot = str(b.slot, 20), name = str(b.name, 24), tagline = str(b.tagline, 40);
    const c1 = str(b.c1, 7), c2 = str(b.c2, 7), link = httpsLink(b.link);
    const start = str(b.start_date, 10), end = str(b.end_date, 10), note = str(b.note, 300);
    if (!SLOT_RE.test(slot)) throw bad('Pilih slot dulu');
    if (!name) throw bad('Nama merek wajib diisi');
    if (!COLOR_RE.test(c1) || !COLOR_RE.test(c2)) throw bad('Warna harus format #rrggbb');
    if (link === null) throw bad('Tautan harus diawali https://');
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) throw bad('Tanggal tidak valid');
    if (end < start) throw bad('Tanggal selesai sebelum tanggal mulai');
    return { slot, name, tagline, c1: c1.toLowerCase(), c2: c2.toLowerCase(), link, start, end, note };
  }

  const q = {
    aktif: db.prepare("SELECT id, slot, name, tagline, c1, c2, link <> '' AS hasLink FROM sponsors WHERE start_date <= ? AND end_date >= ? ORDER BY id"),
    semua: db.prepare('SELECT * FROM sponsors ORDER BY end_date DESC, id DESC LIMIT 300'),
    bentrok: db.prepare('SELECT id, name, start_date, end_date FROM sponsors WHERE slot = ? AND id <> ? AND NOT (end_date < ? OR start_date > ?) LIMIT 1'),
    get: db.prepare('SELECT * FROM sponsors WHERE id = ?'),
  };

  return {
    publik() { const t = todayWib(); return { sponsors: q.aktif.all(t, t), today: t }; },
    semua: () => ({ sponsors: q.semua.all(), today: todayWib() }),
    simpan(b) {
      const s = clean(b), id = b.id ? +b.id : 0;
      const hit = q.bentrok.get(s.slot, id, s.start, s.end);
      if (hit) throw bad(`Slot ini sudah dipakai ${hit.name} (${hit.start_date} s/d ${hit.end_date})`);
      if (id) {
        const r = db.prepare('UPDATE sponsors SET slot=?, name=?, tagline=?, c1=?, c2=?, link=?, start_date=?, end_date=?, note=? WHERE id=?')
          .run(s.slot, s.name, s.tagline, s.c1, s.c2, s.link, s.start, s.end, s.note, id);
        if (!r.changes) throw bad('Sponsor tidak ditemukan');
        return { id };
      }
      const r = db.prepare('INSERT INTO sponsors (slot, name, tagline, c1, c2, link, start_date, end_date, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(s.slot, s.name, s.tagline, s.c1, s.c2, s.link, s.start, s.end, s.note, Date.now());
      return { id: Number(r.lastInsertRowid) };
    },
    hapus: id => db.prepare('DELETE FROM sponsors WHERE id = ?').run(+id).changes,
    // hanya dihitung bila sponsor sedang tayang
    lihat(id) {
      const t = todayWib();
      return db.prepare('UPDATE sponsors SET views = views + 1 WHERE id = ? AND start_date <= ? AND end_date >= ?').run(+id, t, t).changes;
    },
    klik(id, count) {
      const row = q.get.get(+id), t = todayWib();
      if (!row || !row.link || row.start_date > t || row.end_date < t) return null;
      if (count) db.prepare('UPDATE sponsors SET clicks = clicks + 1 WHERE id = ?').run(row.id);
      return row.link;
    },
  };
}
