// AUDIRA LAND · Radio AUDIRA FM 99,1.
// Rotasi = lagu unggahan admin (MP3 milik sendiri / bebas royalti) + lagu generatif (disintesis di peramban).
// Semua pendengar mendengar bagian yang sama karena posisi dihitung dari jam server sejak `epoch`.
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const MAX_BYTES = 20 * 1024 * 1024;
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').trim().slice(0, max) : '');
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });

// MP3: tag ID3 di awal, atau langsung frame sync 0xFFE
const isMp3 = b => b.length > 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));

export function createRadio(db, mediaDir) {
  mkdirSync(mediaDir, { recursive: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      file       TEXT NOT NULL UNIQUE,        -- nama file acak di server/data/media
      title      TEXT NOT NULL,
      artist     TEXT NOT NULL DEFAULT '',
      duration   REAL NOT NULL,               -- detik, diukur peramban admin saat unggah
      enabled    INTEGER NOT NULL DEFAULT 1,
      license    TEXT NOT NULL DEFAULT '',    -- catatan lisensi dari admin
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `);
  const getS = (k, d) => { const r = db.prepare('SELECT v FROM settings WHERE k = ?').get(k); return r ? JSON.parse(r.v) : d; };
  const setS = (k, v) => db.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v));
  if (getS('radio.epoch', null) === null) setS('radio.epoch', Date.UTC(2026, 10, 1));

  function cfg() {
    return {
      epoch: getS('radio.epoch', Date.UTC(2026, 10, 1)),
      gen: getS('radio.gen', 6),          // jumlah lagu generatif per putaran
      songLen: 150,                       // detik per lagu generatif
      announcer: getS('radio.announcer', true),
      every: getS('radio.every', 4),      // menit minimal antar siaran penyiar
    };
  }

  return {
    publik() {
      const tracks = db.prepare('SELECT id, title, artist, duration, file FROM tracks WHERE enabled = 1 ORDER BY id').all()
        .map(t => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, src: '/media/' + t.file }));
      return { ...cfg(), tracks, now: Date.now() };
    },
    semua: () => ({ ...cfg(), tracks: db.prepare('SELECT * FROM tracks ORDER BY id').all() }),
    atur(b) {
      const gen = Math.round(+b.gen), every = Math.round(+b.every);
      if (!(gen >= 0 && gen <= 30)) throw bad('Jumlah lagu generatif 0–30');
      if (!(every >= 1 && every <= 60)) throw bad('Jeda penyiar 1–60 menit');
      setS('radio.gen', gen); setS('radio.every', every); setS('radio.announcer', !!b.announcer);
      // ubah rotasi → mulai putaran baru sekarang supaya semua pendengar tetap sinkron
      setS('radio.epoch', Date.now());
      return cfg();
    },
    unggah(buf, meta) {
      if (buf.length > MAX_BYTES) throw bad('File maks 20 MB', 413);
      if (!isMp3(buf)) throw bad('File bukan MP3');
      const title = str(meta.title, 60), artist = str(meta.artist, 60), license = str(meta.license, 120), duration = +meta.duration;
      if (!title) throw bad('Judul lagu wajib diisi');
      if (!license) throw bad('Isi catatan lisensi (mis. milik sendiri, CC0, beli lisensi dari …)');
      if (!(duration >= 10 && duration <= 1800)) throw bad('Durasi lagu tidak terbaca (10 dtk–30 mnt)');
      const file = randomBytes(9).toString('base64url') + '.mp3';
      writeFileSync(join(mediaDir, file), buf);
      const r = db.prepare('INSERT INTO tracks (file, title, artist, duration, license, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(file, title, artist, duration, license, Date.now());
      setS('radio.epoch', Date.now());
      return { id: Number(r.lastInsertRowid) };
    },
    ubah(b) {
      const r = db.prepare('UPDATE tracks SET enabled = ? WHERE id = ?').run(b.enabled ? 1 : 0, +b.id);
      if (!r.changes) throw bad('Lagu tidak ditemukan');
      setS('radio.epoch', Date.now());
      return { ok: true };
    },
    hapus(id) {
      const t = db.prepare('SELECT file FROM tracks WHERE id = ?').get(+id);
      if (!t) return 0;
      db.prepare('DELETE FROM tracks WHERE id = ?').run(+id);
      const f = join(mediaDir, t.file);
      if (existsSync(f)) unlinkSync(f);
      setS('radio.epoch', Date.now());
      return 1;
    },
  };
}
