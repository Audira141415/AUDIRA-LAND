// AUDIRA LAND · Lomba & Event kota.
// Jenis lomba:
//   kerja:<game>  peringkat otomatis = skor terbaik tiap warga di mini-game itu selama lomba berjalan
//                 (dari tabel kerja_rounds milik server/kerja.mjs; hanya warga yang masih warga)
//   bebas         tanpa papan otomatis (foto, kuis di Instagram, dsb.); admin menulis pemenangnya
// Admin menetapkan pemenang sekali (opsional + koin). Pemenang dapat kabar di Koran › Untukmu.
// Saat lomba dimulai, pengumuman Koran dibuat sekali.
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, max) : '');
const USER_RE = /^[a-z0-9._]{1,30}$/;
const MAX_KOIN = 100000;
const PAPAN = 20;
const fmtWib = ms => {
  const d = new Date(ms + 7 * 3600e3);
  const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getUTCMonth()];
  return `${d.getUTCDate()} ${bln} ${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')} WIB`;
};
const fmtInt = n => Math.floor(n).toLocaleString('id-ID');

export function createLomba(db, { ekonomi, kabarku, kabar, kerja } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lomba (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      descr      TEXT NOT NULL DEFAULT '',
      prize      TEXT NOT NULL DEFAULT '',
      kind       TEXT NOT NULL,              -- kerja:<game> | bebas
      start_at   INTEGER NOT NULL,           -- ms epoch
      end_at     INTEGER NOT NULL,
      winners    TEXT NOT NULL DEFAULT '[]', -- JSON [{rank, u, note, koin, score?}]
      winners_at INTEGER,                    -- diisi saat pemenang ditetapkan (sekali)
      announced  INTEGER NOT NULL DEFAULT 0, -- 1 = pengumuman mulai sudah dibuat
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lomba_time ON lomba(start_at, end_at);
  `);
  const GAMES = (kerja && kerja.GAMES) || {};
  const q = {
    get: db.prepare('SELECT * FROM lomba WHERE id = ?'),
    jalan: db.prepare('SELECT * FROM lomba WHERE start_at <= ? AND end_at > ? ORDER BY end_at ASC LIMIT 20'),
    akan: db.prepare('SELECT * FROM lomba WHERE start_at > ? ORDER BY start_at ASC LIMIT 20'),
    selesai: db.prepare('SELECT * FROM lomba WHERE end_at <= ? ORDER BY end_at DESC LIMIT 15'),
    semua: db.prepare('SELECT * FROM lomba ORDER BY start_at DESC LIMIT 200'),
    buat: db.prepare('INSERT INTO lomba (title, descr, prize, kind, start_at, end_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    ubah: db.prepare('UPDATE lomba SET title=?, descr=?, prize=?, kind=?, start_at=?, end_at=? WHERE id=?'),
    hapus: db.prepare('DELETE FROM lomba WHERE id = ?'),
    belumUmum: db.prepare('SELECT * FROM lomba WHERE start_at <= ? AND announced = 0 LIMIT 20'),
    tandai: db.prepare('UPDATE lomba SET announced = 1 WHERE id = ? AND announced = 0'),
    pemenang: db.prepare('UPDATE lomba SET winners = ?, winners_at = ? WHERE id = ? AND winners_at IS NULL'),
    warga: db.prepare("SELECT 1 FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
  };
  // tabel kerja_rounds milik modul lain: siapkan saat pertama dipakai
  let qBoard = null;
  function board(game, from, to, now = Date.now()) {
    if (!qBoard) {
      // skor terbaik tiap warga; seri = yang lebih dulu mencapainya
      qBoard = db.prepare(`SELECT username AS u, score, MIN(ended_at) AS t FROM (
          SELECT k.username, k.score, k.ended_at, MAX(k.score) OVER (PARTITION BY k.username) AS best
          FROM kerja_rounds k
          JOIN residents r ON r.username = k.username AND r.status = 'approved' AND r.arrive_at <= ?
          WHERE k.game = ? AND k.started_at >= ? AND k.started_at < ? AND k.ended_at IS NOT NULL AND k.score > 0
        ) WHERE score = best GROUP BY username ORDER BY score DESC, t ASC`);
    }
    try { return qBoard.all(now, game, from, to).map((r, i) => ({ rank: i + 1, u: r.u, score: r.score })); }
    catch (e) { if (/no such table/.test(e.message)) return []; throw e; }
  }
  const gameOf = kind => (kind.startsWith('kerja:') ? kind.slice(6) : null);
  const kindLabel = kind => { const g = gameOf(kind); return g ? `Mini-game ${GAMES[g] ? GAMES[g].name : g}` : 'Lomba bebas'; };

  function pub(l, now, { top = PAPAN } = {}) {
    const g = gameOf(l.kind);
    const out = {
      id: l.id, title: l.title, descr: l.descr, prize: l.prize, kind: l.kind, kindLabel: kindLabel(l.kind),
      start_at: l.start_at, end_at: l.end_at,
      status: now < l.start_at ? 'akan' : now < l.end_at ? 'jalan' : 'selesai',
      winners: JSON.parse(l.winners || '[]').map(w => ({ rank: w.rank, u: w.u, note: w.note || '', koin: w.koin || 0, score: w.score ?? null })),
    };
    if (g) {
      out.game = g;
      out.unit = GAMES[g] ? GAMES[g].unit : '';
      if (out.status !== 'akan' && top > 0) {
        const list = board(g, l.start_at, l.end_at, now);
        out.papan = list.slice(0, top);
        out.peserta = list.length;
      }
    }
    return out;
  }

  function umumkanMulai(now = Date.now()) {
    for (const l of q.belumUmum.all(now)) {
      if (!q.tandai.run(l.id).changes) continue;
      if (!kabar || l.end_at <= now) continue; // dibuat setelah lomba lewat: tidak perlu diumumkan
      const g = gameOf(l.kind);
      const body = [
        l.descr,
        g ? `Cara ikut: main mini-game ${GAMES[g] ? GAMES[g].name : g} di menu Kerja. Skor terbaikmu selama lomba yang dihitung.` : '',
        l.prize ? `Hadiah: ${l.prize}` : '',
        `Berakhir ${fmtWib(l.end_at)}. Lihat papan & detail di halaman Event (menu Lomba).`,
      ].filter(Boolean).join('\n');
      try { kabar.simpanPost({ kind: 'pengumuman', title: ('Lomba dimulai: ' + l.title).slice(0, 80), body }); }
      catch (e) { console.error('[lomba] pengumuman gagal', e.message); }
    }
  }
  try { umumkanMulai(); } catch (e) { console.error('[lomba] umumkan gagal', e); }
  setInterval(() => { try { umumkanMulai(); } catch (e) { console.error('[lomba] umumkan gagal', e); } }, 60e3).unref();

  const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });
  function clean(b, now) {
    const title = str(b.title, 80), descr = str(b.descr, 600), prize = str(b.prize, 120), kind = str(b.kind, 30);
    const start = Math.floor(+b.start_at), end = Math.floor(+b.end_at);
    if (!title) throw bad('Judul lomba wajib diisi');
    if (kind !== 'bebas' && !(gameOf(kind) && GAMES[gameOf(kind)])) throw bad('Jenis lomba tidak dikenal');
    if (!(start > 0 && end > 0)) throw bad('Waktu mulai dan selesai wajib diisi');
    if (end <= start + 10 * 60e3) throw bad('Lomba minimal 10 menit');
    if (end - start > 92 * 86400e3) throw bad('Lomba maksimal 92 hari');
    if (end > now + 400 * 86400e3) throw bad('Waktu selesai terlalu jauh');
    return { title, descr, prize, kind, start, end };
  }

  function simpan(b, now = Date.now()) {
    const s = clean(b, now), id = Math.floor(+b.id) || 0;
    if (id) {
      const lama = q.get.get(id);
      if (!lama) throw bad('Lomba tidak ditemukan', 404);
      if (lama.winners_at) throw bad('Pemenang sudah ditetapkan, lomba tidak bisa diubah lagi');
      if (lama.start_at <= now && s.kind !== lama.kind) throw bad('Jenis lomba tidak bisa diganti setelah lomba dimulai');
      q.ubah.run(s.title, s.descr, s.prize, s.kind, s.start, s.end, id);
      // dijadwal ulang ke masa depan sebelum diumumkan: pengumuman tetap menunggu waktu mulai yang baru
      if (s.start > now && lama.announced) db.prepare('UPDATE lomba SET announced = 0 WHERE id = ?').run(id);
      umumkanMulai(now);
      return { id };
    }
    const r = q.buat.run(s.title, s.descr, s.prize, s.kind, s.start, s.end, now);
    umumkanMulai(now);
    return { id: Number(r.lastInsertRowid) };
  }

  // admin menetapkan pemenang (sekali). winners: [{u, note?, koin?}] urut juara 1, 2, ...
  function tetapkan(b, now = Date.now()) {
    const l = q.get.get(Math.floor(+b.id) || 0);
    if (!l) throw bad('Lomba tidak ditemukan', 404);
    if (l.winners_at) throw bad('Pemenang lomba ini sudah ditetapkan');
    if (now < l.start_at) throw bad('Lomba belum dimulai');
    const g = gameOf(l.kind);
    if (g && now < l.end_at) throw bad('Tunggu lomba selesai dulu supaya papan final');
    const raw = Array.isArray(b.winners) ? b.winners.slice(0, 10) : [];
    if (!raw.length) throw bad('Isi minimal satu pemenang');
    const skor = g ? new Map(board(g, l.start_at, l.end_at, now).map(r => [r.u, r.score])) : null;
    const seen = new Set();
    const winners = raw.map((w, i) => {
      const u = str(w && w.u, 31).replace(/^@+/, '').toLowerCase();
      if (!USER_RE.test(u)) throw bad(`Username juara ${i + 1} tidak valid`);
      if (seen.has(u)) throw bad(`@${u} tercantum dua kali`);
      seen.add(u);
      if (!q.warga.get(u, now)) throw bad(`@${u} bukan warga yang sudah tiba`);
      const koin = Math.floor(+(w.koin || 0));
      if (!(koin >= 0 && koin <= MAX_KOIN)) throw bad(`Koin juara ${i + 1} harus 0–${fmtInt(MAX_KOIN)}`);
      return { rank: i + 1, u, note: str(w.note, 80), koin, score: skor ? (skor.get(u) ?? 0) : null };
    });
    // tandai dulu (sekali saja), baru bayar koin di luar transaksi ini
    if (!q.pemenang.run(JSON.stringify(winners), now, l.id).changes) throw bad('Pemenang lomba ini sudah ditetapkan');
    let dibayar = 0;
    for (const w of winners) {
      if (w.koin > 0 && ekonomi) {
        try { ekonomi.kredit(w.u, w.koin, 'lomba', `Juara ${w.rank} ${l.title}`, String(l.id)); dibayar++; }
        catch (e) { console.error('[lomba] kredit gagal', w.u, e.message); }
      }
      if (kabarku) {
        try {
          kabarku.tambah(w.u, 'lomba', `Selamat! Kamu juara ${w.rank} lomba “${l.title}”${w.koin > 0 ? `. Hadiah ${fmtInt(w.koin)} koin masuk dompet` : ''}${w.note ? ` (${w.note})` : ''}.`, 'lomba:' + l.id, 0, { icon: '🏁', link: '/event.html' });
        } catch (e) { console.error('[lomba] kabarku gagal', e.message); }
      }
    }
    if (kabar && b.umumkan !== false) {
      const baris = winners.map(w => `${w.rank}. @${w.u}${w.score != null ? ` (${w.score}${g && GAMES[g] ? ' ' + GAMES[g].unit : ''})` : ''}${w.note ? ` · ${w.note}` : ''}`);
      try { kabar.simpanPost({ kind: 'pengumuman', title: ('Pemenang lomba: ' + l.title).slice(0, 80), body: baris.join('\n') + (l.prize ? `\nHadiah: ${l.prize}` : '') + '\nSelamat untuk para juara! Lihat semua lomba di halaman Event.' }); }
      catch (e) { console.error('[lomba] pengumuman pemenang gagal', e.message); }
    }
    return { ok: true, winners, dibayar };
  }

  // cache papan publik singkat supaya halaman Event ramai tidak menghitung ulang tiap permintaan
  let cache = null;

  return {
    simpan, tetapkan, board, umumkanMulai,
    async route(req, res, url, ctx) {
      const p = url.pathname, m = req.method;
      if (p === '/api/lomba') {
        if (m !== 'GET') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
        const now = Date.now();
        if (!cache || now - cache.t > 10e3) {
          umumkanMulai(now);
          cache = {
            t: now,
            body: {
              now,
              jalan: q.jalan.all(now, now).map(l => pub(l, now)),
              akan: q.akan.all(now).map(l => pub(l, now)),
              selesai: q.selesai.all(now).map(l => pub(l, now, { top: JSON.parse(l.winners || '[]').length ? 0 : 3 })),
            },
          };
        }
        return ctx.send(res, 200, { ...cache.body, now }, { 'Cache-Control': 'public, max-age=10' }), true;
      }

      if (!p.startsWith('/api/admin/lomba')) return false;
      if (!ctx.isAdmin()) return ctx.send(res, 401, { error: 'Token admin salah' }), true;
      const a = p.slice('/api/admin/lomba'.length), now = Date.now();
      if (a === '' && m === 'GET') {
        return ctx.send(res, 200, {
          now,
          games: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { name: g.name, unit: g.unit }])),
          lomba: q.semua.all().map(l => ({ ...pub(l, now, { top: 10 }), announced: !!l.announced, winners_at: l.winners_at })),
        }), true;
      }
      if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
      const b = await ctx.readJson(req, 8192);
      cache = null;
      if (a === '') return ctx.send(res, 200, simpan(b, now)), true;
      if (a === '/pemenang') return ctx.send(res, 200, tetapkan(b, now)), true;
      if (a === '/hapus') {
        const l = q.get.get(Math.floor(+b.id) || 0);
        if (!l) throw ctx.bad('Lomba tidak ditemukan', 404);
        return ctx.send(res, 200, { changed: q.hapus.run(l.id).changes }), true;
      }
      return ctx.send(res, 404, { error: 'Tidak ditemukan' }), true;
    },
  };
}
