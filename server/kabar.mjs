// AUDIRA LAND · Kabar Kota (berita & pengumuman) dan Kalender Kota (acara).
const KINDS = ['berita', 'pengumuman'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');
function httpsLink(v) {
  const s = str(v, 300);
  if (!s) return '';
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
const bad = msg => Object.assign(new Error(msg), { code: 400 });

export function createKabar(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      kind       TEXT NOT NULL,               -- berita | pengumuman
      title      TEXT NOT NULL,
      body       TEXT NOT NULL DEFAULT '',
      link       TEXT NOT NULL DEFAULT '',    -- hanya https
      pinned     INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      date       TEXT NOT NULL,               -- YYYY-MM-DD (WIB)
      time       TEXT NOT NULL DEFAULT '',    -- HH:MM atau kosong
      place      TEXT NOT NULL DEFAULT '',
      note       TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  `);

  // tanggal hari ini di WIB (UTC+7), dipakai untuk memilah acara mendatang
  const todayWib = (offsetDays = 0) => new Date(Date.now() + 7 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

  function cleanPost(b) {
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    const title = str(b.title, 80), body = str(b.body, 1500), link = httpsLink(b.link);
    if (!kind) throw bad('Jenis harus berita atau pengumuman');
    if (!title) throw bad('Judul wajib diisi');
    if (link === null) throw bad('Tautan harus diawali https://');
    return { kind, title, body, link, pinned: b.pinned ? 1 : 0 };
  }
  function cleanEvent(b) {
    const title = str(b.title, 80), date = str(b.date, 10), time = str(b.time, 5), place = str(b.place, 60), note = str(b.note, 300);
    if (!title) throw bad('Nama acara wajib diisi');
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw bad('Tanggal tidak valid');
    if (time && !TIME_RE.test(time)) throw bad('Jam harus HH:MM');
    return { title, date, time, place, note };
  }

  return {
    // untuk semua pengunjung: 20 kabar terbaru (sematan dulu) + acara 60 hari ke depan
    publik() {
      return {
        posts: db.prepare('SELECT id, kind, title, body, link, pinned, created_at FROM posts ORDER BY pinned DESC, created_at DESC LIMIT 20').all(),
        events: db.prepare('SELECT id, title, date, time, place, note FROM events WHERE date >= ? AND date <= ? ORDER BY date, time LIMIT 50').all(todayWib(), todayWib(60)),
        today: todayWib(),
      };
    },
    semua() {
      return {
        posts: db.prepare('SELECT * FROM posts ORDER BY pinned DESC, created_at DESC LIMIT 200').all(),
        events: db.prepare('SELECT * FROM events WHERE date >= ? ORDER BY date, time LIMIT 200').all(todayWib(-30)),
        today: todayWib(),
      };
    },
    simpanPost(b) {
      const p = cleanPost(b), now = Date.now();
      if (b.id) {
        const r = db.prepare('UPDATE posts SET kind=?, title=?, body=?, link=?, pinned=?, updated_at=? WHERE id=?').run(p.kind, p.title, p.body, p.link, p.pinned, now, +b.id);
        if (!r.changes) throw bad('Kabar tidak ditemukan');
        return { id: +b.id };
      }
      const r = db.prepare('INSERT INTO posts (kind, title, body, link, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(p.kind, p.title, p.body, p.link, p.pinned, now, now);
      return { id: Number(r.lastInsertRowid) };
    },
    hapusPost: id => db.prepare('DELETE FROM posts WHERE id = ?').run(+id).changes,
    simpanAcara(b) {
      const e = cleanEvent(b);
      if (b.id) {
        const r = db.prepare('UPDATE events SET title=?, date=?, time=?, place=?, note=? WHERE id=?').run(e.title, e.date, e.time, e.place, e.note, +b.id);
        if (!r.changes) throw bad('Acara tidak ditemukan');
        return { id: +b.id };
      }
      const r = db.prepare('INSERT INTO events (title, date, time, place, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(e.title, e.date, e.time, e.place, e.note, Date.now());
      return { id: Number(r.lastInsertRowid) };
    },
    hapusAcara: id => db.prepare('DELETE FROM events WHERE id = ?').run(+id).changes,
  };
}
