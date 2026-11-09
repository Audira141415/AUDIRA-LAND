// AUDIRA LAND · Pesta Rumah: warga KTW membuka pesta 60 menit di rumahnya.
// Tiap pesta = satu room realtime sendiri (mesin yang sama dengan Taman, peta pesta-map.json).
import { createTaman } from './taman.mjs';

export const TEMA = {
  santai: 'Nongkrong santai',
  pesta: 'Pesta dansa',
  karaoke: 'Karaoke',
  ultah: 'Ulang tahun',
};
const DURASI_MS = 60 * 60e3;
const JEDA_MS = 6 * 3600e3;   // satu warga boleh buka pesta lagi 6 jam setelah pesta terakhirnya dimulai
const MAKS_AKTIF = 20;
const CAP_TAMU = 30;
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });

export function createPesta(db, { store, map, itemsOf }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS parties (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      host       TEXT NOT NULL,
      theme      TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ends_at    INTEGER NOT NULL,
      ended_at   INTEGER                    -- diisi saat ditutup lebih awal atau waktunya habis
    );
    CREATE INDEX IF NOT EXISTS idx_parties_host ON parties(host, started_at);
  `);
  const rooms = new Map(); // host -> room realtime
  const aktifQ = db.prepare('SELECT p.host, p.theme, p.started_at, p.ends_at, r.seq FROM parties p JOIN residents r ON r.username = p.host WHERE p.ended_at IS NULL AND p.ends_at > ? ORDER BY p.started_at DESC');

  function roomFor(host) {
    let r = rooms.get(host);
    if (!r) { r = createTaman({ store, map, cap: CAP_TAMU, label: 'Pesta ini', itemsOf }); rooms.set(host, r); }
    return r;
  }
  function selesai(host, msg) {
    db.prepare('UPDATE parties SET ended_at = ? WHERE host = ? AND ended_at IS NULL').run(Date.now(), host);
    const r = rooms.get(host);
    if (r) { r.close(msg); rooms.delete(host); }
  }
  // pesta yang waktunya habis ditutup otomatis
  setInterval(() => {
    const now = Date.now();
    for (const row of db.prepare('SELECT host FROM parties WHERE ended_at IS NULL AND ends_at <= ?').all(now)) {
      selesai(row.host, 'Pesta sudah selesai. Terima kasih sudah datang!');
    }
  }, 10000).unref();

  return {
    TEMA,
    aktif() {
      return aktifQ.all(Date.now()).map(p => ({
        host: p.host, theme: p.theme, seq: p.seq, started: p.started_at, ends: p.ends_at,
        guests: rooms.get(p.host)?.count() || 0,
      }));
    },
    buka(token, theme) {
      const sess = store.session(String(token || ''));
      if (!sess) throw bad('Masuk sebagai warga dulu (kode KTW di Taman).', 401);
      if (!TEMA[theme]) throw bad('Pilih tema pesta');
      const now = Date.now(), host = sess.username;
      if (aktifQ.all(now).some(p => p.host === host)) throw bad('Pestamu masih berlangsung.');
      if (aktifQ.all(now).length >= MAKS_AKTIF) throw bad('Kota sedang ramai pesta. Coba lagi nanti.');
      const last = db.prepare('SELECT started_at FROM parties WHERE host = ? ORDER BY started_at DESC LIMIT 1').get(host);
      if (last && now - last.started_at < JEDA_MS) {
        const menit = Math.ceil((JEDA_MS - (now - last.started_at)) / 60000);
        throw bad(`Kamu bisa buka pesta lagi ${menit >= 60 ? Math.ceil(menit / 60) + ' jam' : menit + ' menit'} lagi.`);
      }
      db.prepare('INSERT INTO parties (host, theme, started_at, ends_at) VALUES (?, ?, ?, ?)').run(host, theme, now, now + DURASI_MS);
      roomFor(host);
      return { host, theme, ends: now + DURASI_MS };
    },
    tutup(token) {
      const sess = store.session(String(token || ''));
      if (!sess) throw bad('Masuk sebagai warga dulu.', 401);
      if (!aktifQ.all(Date.now()).some(p => p.host === sess.username)) throw bad('Kamu tidak sedang berpesta.');
      selesai(sess.username, 'Tuan rumah menutup pesta. Terima kasih sudah datang!');
      return { ok: true };
    },
    // koneksi WS ke /ws/taman?room=pesta:<host>
    room(host) {
      if (!aktifQ.all(Date.now()).some(p => p.host === host)) return null;
      return roomFor(host);
    },
    kick(names) { for (const r of rooms.values()) r.kick(names); },
    mute(names, on) { for (const r of rooms.values()) r.mute(names, on); },
    setItems(name, items) { for (const r of rooms.values()) r.setItems(name, items); },
    // admin hapus warga: pestanya ikut ditutup
    hapusHost(names) { for (const h of names) if (rooms.has(h) || aktifQ.all(Date.now()).some(p => p.host === h)) selesai(h, 'Pesta ditutup admin.'); },
  };
}
