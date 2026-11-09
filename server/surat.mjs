// AUDIRA LAND · Surat (pesan antar warga) & Teman.
// Surat hanya bisa dikirim antar teman, jadi orang asing tidak bisa menyepam.
// Warga bisa memblokir (tak bisa minta berteman / kirim surat) dan melaporkan; laporan dibaca admin.
import { normUsername } from './db.mjs';

const MAKS_TEMAN = 200, MAKS_MINTA_HARIAN = 20, MAKS_SURAT_HARIAN = 200;
const JEDA_SURAT = 2000, PANJANG = 300, HALAMAN = 50;
const ALASAN = ['spam', 'kasar', 'mengganggu', 'lainnya'];
const BAD = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'jancok', 'goblok', 'tolol', 'bajingan', 'keparat', 'asu', 'babi'];
const BAD_RE = new RegExp('\\b(' + BAD.join('|') + ')\\b', 'gi');
const startOfDayWib = (t = Date.now()) => { const d = Math.floor((t + 7 * 3600e3) / 86400e3); return d * 86400e3 - 7 * 3600e3; };

// aturan sama dengan cleanText di taman.mjs, tapi batas 300 huruf dan baris baru boleh (maks 2 berturut)
export function bersihkanSurat(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PANJANG)
    .replace(/(https?:\/\/|www\.)\S+/gi, '[tautan]')
    .replace(BAD_RE, m => m[0] + '*'.repeat(m.length - 1));
}

export function createSurat(db, { kabarku } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teman (
      username   TEXT NOT NULL,
      teman      TEXT NOT NULL,             -- disimpan dua arah (a,b) dan (b,a)
      created_at INTEGER NOT NULL,
      PRIMARY KEY (username, teman)
    );
    CREATE TABLE IF NOT EXISTS teman_minta (
      dari       TEXT NOT NULL,
      ke         TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (dari, ke)
    );
    CREATE INDEX IF NOT EXISTS idx_tminta_ke ON teman_minta(ke, created_at);
    CREATE TABLE IF NOT EXISTS teman_kuota (username TEXT NOT NULL, hari INTEGER NOT NULL, minta INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (username, hari));
    CREATE TABLE IF NOT EXISTS blokir (
      username   TEXT NOT NULL,
      target     TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (username, target)
    );
    CREATE TABLE IF NOT EXISTS surat (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dari       TEXT NOT NULL,
      ke         TEXT NOT NULL,
      isi        TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_surat_dari ON surat(dari, ke, id);
    CREATE INDEX IF NOT EXISTS idx_surat_ke ON surat(ke, dari, id);
    CREATE INDEX IF NOT EXISTS idx_surat_unread ON surat(ke, read_at);
    CREATE TABLE IF NOT EXISTS surat_laporan (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      pelapor    TEXT NOT NULL,
      target     TEXT NOT NULL,
      alasan     TEXT NOT NULL,
      catatan    TEXT NOT NULL DEFAULT '',
      bukti      TEXT NOT NULL DEFAULT '[]', -- JSON: surat terakhir dari target ke pelapor saat dilaporkan
      status     TEXT NOT NULL DEFAULT 'baru', -- baru | selesai
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lapor_status ON surat_laporan(status, created_at);
  `);
  const OK = "status = 'approved' AND arrive_at <= ?";
  const q = {
    warga: db.prepare(`SELECT 1 FROM residents WHERE username = ? AND ${OK}`),
    isTeman: db.prepare('SELECT 1 FROM teman WHERE username = ? AND teman = ?'),
    nTeman: db.prepare('SELECT COUNT(*) AS c FROM teman WHERE username = ?'),
    addTeman: db.prepare('INSERT OR IGNORE INTO teman (username, teman, created_at) VALUES (?, ?, ?)'),
    delTeman: db.prepare('DELETE FROM teman WHERE (username = ? AND teman = ?) OR (username = ? AND teman = ?)'),
    teman: db.prepare("SELECT t.teman AS u, t.created_at AS t FROM teman t JOIN residents r ON r.username = t.teman AND r.status = 'approved' AND r.arrive_at <= ? WHERE t.username = ? ORDER BY t.teman"),
    minta: db.prepare('SELECT 1 FROM teman_minta WHERE dari = ? AND ke = ?'),
    addMinta: db.prepare('INSERT OR IGNORE INTO teman_minta (dari, ke, created_at) VALUES (?, ?, ?)'),
    delMinta: db.prepare('DELETE FROM teman_minta WHERE dari = ? AND ke = ?'),
    masuk: db.prepare(`SELECT m.dari AS u, m.created_at AS t FROM teman_minta m JOIN residents r ON r.username = m.dari AND r.status = 'approved' AND r.arrive_at <= ? WHERE m.ke = ? ORDER BY m.created_at DESC LIMIT 100`),
    keluar: db.prepare(`SELECT m.ke AS u, m.created_at AS t FROM teman_minta m JOIN residents r ON r.username = m.ke AND r.status = 'approved' AND r.arrive_at <= ? WHERE m.dari = ? ORDER BY m.created_at DESC LIMIT 100`),
    nMasuk: db.prepare(`SELECT COUNT(*) AS c FROM teman_minta m JOIN residents r ON r.username = m.dari AND r.status = 'approved' AND r.arrive_at <= ? WHERE m.ke = ?`),
    kuota: db.prepare('SELECT minta FROM teman_kuota WHERE username = ? AND hari = ?'),
    kuotaAdd: db.prepare('INSERT INTO teman_kuota (username, hari, minta) VALUES (?, ?, 1) ON CONFLICT(username, hari) DO UPDATE SET minta = minta + 1'),
    kuotaBersih: db.prepare('DELETE FROM teman_kuota WHERE hari < ?'),
    blok: db.prepare('SELECT 1 FROM blokir WHERE (username = ? AND target = ?) OR (username = ? AND target = ?) LIMIT 1'),
    blokOleh: db.prepare('SELECT 1 FROM blokir WHERE username = ? AND target = ?'),
    addBlok: db.prepare('INSERT OR IGNORE INTO blokir (username, target, created_at) VALUES (?, ?, ?)'),
    delBlok: db.prepare('DELETE FROM blokir WHERE username = ? AND target = ?'),
    blokList: db.prepare('SELECT target AS u, created_at AS t FROM blokir WHERE username = ? ORDER BY created_at DESC LIMIT 200'),
    kirim: db.prepare('INSERT INTO surat (dari, ke, isi, created_at) VALUES (?, ?, ?, ?)'),
    nHariIni: db.prepare('SELECT COUNT(*) AS c FROM surat WHERE dari = ? AND created_at >= ?'),
    terakhir: db.prepare('SELECT created_at FROM surat WHERE dari = ? ORDER BY id DESC LIMIT 1'),
    unread: db.prepare(`SELECT COUNT(*) AS c FROM surat s JOIN residents r ON r.username = s.dari AND r.status = 'approved' WHERE s.ke = ? AND s.read_at IS NULL`),
    // percakapan: surat terbaru per lawan bicara + jumlah belum dibaca
    convo: db.prepare(`
      SELECT c.p AS u, c.mid, c.unread, s.isi, s.dari, s.created_at AS t
      FROM (
        SELECT CASE WHEN dari = ?1 THEN ke ELSE dari END AS p, MAX(id) AS mid,
               SUM(CASE WHEN ke = ?1 AND read_at IS NULL THEN 1 ELSE 0 END) AS unread
        FROM surat WHERE dari = ?1 OR ke = ?1 GROUP BY p
      ) c
      JOIN surat s ON s.id = c.mid
      JOIN residents r ON r.username = c.p AND r.status = 'approved'
      ORDER BY c.mid DESC LIMIT 100`),
    thread: db.prepare(`SELECT id, dari, isi, created_at AS t, read_at FROM surat
      WHERE ((dari = ?1 AND ke = ?2) OR (dari = ?2 AND ke = ?1)) AND id < ?3 ORDER BY id DESC LIMIT ${HALAMAN + 1}`),
    baca: db.prepare('UPDATE surat SET read_at = ? WHERE ke = ? AND dari = ? AND read_at IS NULL'),
    bukti: db.prepare('SELECT id, isi, created_at AS t FROM surat WHERE dari = ? AND ke = ? ORDER BY id DESC LIMIT 10'),
    lapor: db.prepare('INSERT INTO surat_laporan (pelapor, target, alasan, catatan, bukti, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    laporDobel: db.prepare("SELECT 1 FROM surat_laporan WHERE pelapor = ? AND target = ? AND status = 'baru' AND created_at >= ? LIMIT 1"),
    laporan: db.prepare('SELECT * FROM surat_laporan WHERE status = ? ORDER BY id DESC LIMIT 200'),
    laporSelesai: db.prepare("UPDATE surat_laporan SET status = 'selesai' WHERE id = ?"),
    hapusPesan: db.prepare('DELETE FROM surat WHERE id = ?'),
    hapusDari: db.prepare('DELETE FROM surat WHERE dari = ?'),
  };
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const lastSend = new Map();   // pengirim -> waktu surat terakhir (jeda 2 dtk, di memori)
  setInterval(() => {
    const now = Date.now();
    for (const [k, t] of lastSend) if (now - t > 60e3) lastSend.delete(k);
    q.kuotaBersih.run(startOfDayWib(now) - 2 * 86400e3);
  }, 3600e3).unref();
  const kabar = (...a) => { try { kabarku && kabarku.tambah(...a); } catch (e) { console.error('[surat] kabar gagal', e.message); } };

  return {
    bersihkanSurat,
    async route(req, res, url, ctx) {
      const p = url.pathname, m = req.method;
      const B = ctx.bad;

      // ----- admin -----
      if (p.startsWith('/api/admin/surat/')) {
        if (!ctx.isAdmin()) return ctx.send(res, 401, { error: 'Token admin salah' }), true;
        const a = p.slice('/api/admin/surat/'.length);
        if (a === 'laporan' && m === 'GET') {
          const st = url.searchParams.get('status') === 'selesai' ? 'selesai' : 'baru';
          const rows = q.laporan.all(st).map(r => ({ ...r, bukti: JSON.parse(r.bukti || '[]') }));
          return ctx.send(res, 200, { laporan: rows }), true;
        }
        if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
        const body = await ctx.readJson(req, 4096);
        if (a === 'hapus-pesan') {
          // { id } satu surat, atau { dari: username } semua surat dari warga itu
          if (body.dari) { const u = normUsername(body.dari); if (!u) throw B('Username tidak valid'); return ctx.send(res, 200, { changed: q.hapusDari.run(u).changes }), true; }
          return ctx.send(res, 200, { changed: q.hapusPesan.run(Math.floor(+body.id) || 0).changes }), true;
        }
        if (a === 'laporan-selesai') return ctx.send(res, 200, { changed: q.laporSelesai.run(Math.floor(+body.id) || 0).changes }), true;
        return ctx.send(res, 404, { error: 'Tidak ditemukan' }), true;
      }

      if (!p.startsWith('/api/surat/') && p !== '/api/surat') return false;
      const me = ctx.user();
      if (!me) return ctx.send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW).' }), true;
      const now = Date.now();
      if (!q.warga.get(me, now)) throw B('Kamu belum jadi warga yang tiba di kota.', 403);
      const a = p.slice('/api/surat/'.length);
      const target = raw => {
        const u = normUsername(raw);
        if (!u) throw B('Username tidak valid');
        if (u === me) throw B('Itu username kamu sendiri.');
        if (!q.warga.get(u, now)) throw B(`@${u} belum jadi warga kota.`, 404);
        return u;
      };

      if (m === 'GET') {
        if (ctx.limited('surat-get', 120, 60e3)) throw B('Terlalu cepat. Tunggu sebentar.', 429);
        if (a === 'ringkas') return ctx.send(res, 200, { surat: q.unread.get(me).c, minta: q.nMasuk.get(now, me).c }, { 'Cache-Control': 'no-store' }), true;
        if (a === 'teman') {
          return ctx.send(res, 200, {
            teman: q.teman.all(now, me), masuk: q.masuk.all(now, me), keluar: q.keluar.all(now, me),
            blokir: q.blokList.all(me), maks: MAKS_TEMAN,
            mintaSisa: Math.max(0, MAKS_MINTA_HARIAN - (q.kuota.get(me, startOfDayWib(now))?.minta || 0)),
          }, { 'Cache-Control': 'no-store' }), true;
        }
        if (a === 'percakapan') {
          const who = url.searchParams.get('u');
          if (!who) {
            const list = q.convo.all(me).map(c => ({ u: c.u, unread: c.unread, t: c.t, dariKu: c.dari === me, isi: c.isi.slice(0, 80) }));
            return ctx.send(res, 200, { percakapan: list }, { 'Cache-Control': 'no-store' }), true;
          }
          const u = target(who);
          const sebelum = Math.floor(+url.searchParams.get('sebelum')) || Number.MAX_SAFE_INTEGER;
          const rows = q.thread.all(me, u, sebelum);
          const lebih = rows.length > HALAMAN;
          if (lebih) rows.pop();
          if (sebelum === Number.MAX_SAFE_INTEGER) q.baca.run(now, me, u);
          return ctx.send(res, 200, {
            u, lebih,
            teman: !!q.isTeman.get(me, u),
            kuBlokir: !!q.blokOleh.get(me, u),
            mintaKeluar: !!q.minta.get(me, u), mintaMasuk: !!q.minta.get(u, me),
            pesan: rows.reverse().map(r => ({ id: r.id, ku: r.dari === me, isi: r.isi, t: r.t, dibaca: r.dari === me ? !!r.read_at : true })),
          }, { 'Cache-Control': 'no-store' }), true;
        }
        return ctx.send(res, 404, { error: 'Tidak ditemukan' }), true;
      }

      if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
      if (ctx.limited('surat', 60, 60e3)) throw B('Terlalu cepat. Tunggu sebentar.', 429);
      const body = await ctx.readJson(req, 4096);

      if (a === 'kirim') {
        const u = target(body.to);
        if (!q.isTeman.get(me, u)) throw B(`Surat hanya bisa dikirim ke teman. Ajak @${u} berteman dulu.`, 403);
        if (q.blok.get(me, u, u, me)) throw B('Tidak bisa mengirim surat ke warga ini.', 403);
        const isi = bersihkanSurat(body.text);
        if (!isi) throw B('Suratnya masih kosong.');
        const last = Math.max(lastSend.get(me) || 0, q.terakhir.get(me)?.created_at || 0);
        if (now - last < JEDA_SURAT) throw B('Pelan-pelan, tunggu sebentar.', 429);
        if (q.nHariIni.get(me, startOfDayWib(now)).c >= MAKS_SURAT_HARIAN) throw B(`Batas ${MAKS_SURAT_HARIAN} surat per hari sudah tercapai. Lanjut besok, ya.`, 429);
        lastSend.set(me, now);
        const id = Number(q.kirim.run(me, u, isi, now).lastInsertRowid);
        return ctx.send(res, 200, { pesan: { id, ku: true, isi, t: now, dibaca: false } }), true;
      }

      if (a === 'minta') {
        const u = target(body.to);
        if (q.blok.get(me, u, u, me)) throw B('Tidak bisa berteman dengan warga ini.', 403);
        if (q.isTeman.get(me, u)) throw B(`Kamu dan @${u} sudah berteman.`);
        if (q.minta.get(me, u)) throw B(`Permintaan ke @${u} sudah terkirim. Tunggu jawabannya.`);
        // dia sudah lebih dulu minta berteman denganku → langsung jadi teman
        if (q.minta.get(u, me)) return ctx.send(res, 200, terima(me, u, now)), true;
        if (q.nTeman.get(me).c >= MAKS_TEMAN) throw B(`Temanmu sudah ${MAKS_TEMAN}, batas maksimal.`);
        const hari = startOfDayWib(now);
        if ((q.kuota.get(me, hari)?.minta || 0) >= MAKS_MINTA_HARIAN) throw B(`Batas ${MAKS_MINTA_HARIAN} permintaan per hari sudah tercapai.`, 429);
        tx(() => { q.addMinta.run(me, u, now); q.kuotaAdd.run(me, hari); });
        kabar(u, 'teman', `@${me} ingin berteman denganmu`, 'teman|' + me, 0, { icon: '🤝' });
        return ctx.send(res, 200, { status: 'terkirim', u }), true;
      }
      if (a === 'terima') {
        const u = target(body.from);
        if (!q.minta.get(u, me)) throw B('Permintaan itu sudah tidak ada.', 404);
        return ctx.send(res, 200, terima(me, u, now)), true;
      }
      if (a === 'tolak') {
        const u = normUsername(body.from); if (!u) throw B('Username tidak valid');
        return ctx.send(res, 200, { changed: q.delMinta.run(u, me).changes }), true;
      }
      if (a === 'batal') {
        const u = normUsername(body.to); if (!u) throw B('Username tidak valid');
        return ctx.send(res, 200, { changed: q.delMinta.run(me, u).changes }), true;
      }
      if (a === 'hapus-teman') {
        const u = normUsername(body.u); if (!u) throw B('Username tidak valid');
        return ctx.send(res, 200, { changed: q.delTeman.run(me, u, u, me).changes ? 1 : 0 }), true;
      }
      if (a === 'blokir') {
        const u = normUsername(body.u); if (!u) throw B('Username tidak valid');
        if (u === me) throw B('Itu username kamu sendiri.');
        if (body.on === false) return ctx.send(res, 200, { blokir: false, changed: q.delBlok.run(me, u).changes }), true;
        if (q.blokList.all(me).length >= 200) throw B('Daftar blokirmu sudah penuh (200).');
        tx(() => {
          q.addBlok.run(me, u, now);
          q.delTeman.run(me, u, u, me);
          q.delMinta.run(me, u); q.delMinta.run(u, me);
        });
        return ctx.send(res, 200, { blokir: true }), true;
      }
      if (a === 'laporkan') {
        const u = normUsername(body.u); if (!u) throw B('Username tidak valid');
        if (u === me) throw B('Itu username kamu sendiri.');
        const alasan = ALASAN.includes(body.alasan) ? body.alasan : 'lainnya';
        if (q.laporDobel.get(me, u, now - 86400e3)) throw B(`Laporanmu tentang @${u} sudah kami terima. Admin akan memeriksanya.`);
        const bukti = q.bukti.all(u, me).reverse();
        q.lapor.run(me, u, alasan, bersihkanSurat(body.catatan).slice(0, 200), JSON.stringify(bukti), now);
        return ctx.send(res, 200, { ok: true }), true;
      }
      return ctx.send(res, 404, { error: 'Tidak ditemukan' }), true;
    },
  };

  // me menerima permintaan dari u
  function terima(me, u, now) {
    if (q.nTeman.get(me).c >= MAKS_TEMAN) throw Object.assign(new Error(`Temanmu sudah ${MAKS_TEMAN}, batas maksimal.`), { code: 400 });
    if (q.nTeman.get(u).c >= MAKS_TEMAN) throw Object.assign(new Error(`Teman @${u} sudah penuh.`), { code: 400 });
    tx(() => {
      q.addTeman.run(me, u, now); q.addTeman.run(u, me, now);
      q.delMinta.run(u, me); q.delMinta.run(me, u);
    });
    kabar(u, 'teman', `@${me} menerima permintaan pertemananmu`, 'teman-ok|' + me, 0, { icon: '🤝' });
    return { status: 'teman', u };
  }
}
