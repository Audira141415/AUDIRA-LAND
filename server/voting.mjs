// AUDIRA LAND · Voting warga. Admin membuat polling (2–6 pilihan, tanggal selesai).
// Warga KTW memilih satu kali dan boleh ganti pilihan sampai polling selesai.
// Hasil hanya terlihat oleh yang sudah memilih, atau oleh semua orang setelah polling selesai.
// Saat selesai, hasilnya otomatis diumumkan di Koran (kabar.simpanPost).
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const MIN_DUR = 5 * 60e3, MAX_DUR = 90 * 86400e3;
const fmtWib = ms => new Date(ms + 7 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' WIB';

export function createVoting(db, { kabar } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS polls (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      question   TEXT NOT NULL,
      options    TEXT NOT NULL,              -- JSON array teks pilihan
      ends_at    INTEGER NOT NULL,           -- ms epoch
      announced  INTEGER NOT NULL DEFAULT 0, -- 1 = hasil sudah diumumkan di Koran
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_polls_end ON polls(ends_at);
    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id    INTEGER NOT NULL,
      username   TEXT NOT NULL,
      choice     INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (poll_id, username)
    );
  `);
  const q = {
    warga: db.prepare("SELECT 1 FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    get: db.prepare('SELECT * FROM polls WHERE id = ?'),
    aktif: db.prepare('SELECT * FROM polls WHERE ends_at > ? ORDER BY ends_at ASC LIMIT 20'),
    riwayat: db.prepare('SELECT * FROM polls WHERE ends_at <= ? ORDER BY ends_at DESC LIMIT 20'),
    semua: db.prepare('SELECT * FROM polls ORDER BY ends_at DESC LIMIT 200'),
    // hanya suara warga yang masih warga
    hitung: db.prepare(`SELECT v.choice, COUNT(*) AS n FROM poll_votes v
      JOIN residents r ON r.username = v.username AND r.status = 'approved'
      WHERE v.poll_id = ? GROUP BY v.choice`),
    mine: db.prepare('SELECT choice FROM poll_votes WHERE poll_id = ? AND username = ?'),
    pilih: db.prepare(`INSERT INTO poll_votes (poll_id, username, choice, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(poll_id, username) DO UPDATE SET choice = excluded.choice, updated_at = excluded.updated_at`),
    buat: db.prepare('INSERT INTO polls (question, options, ends_at, created_at) VALUES (?, ?, ?, ?)'),
    tutup: db.prepare('UPDATE polls SET ends_at = ? WHERE id = ? AND ends_at > ?'),
    hapus: db.prepare('DELETE FROM polls WHERE id = ?'),
    hapusSuara: db.prepare('DELETE FROM poll_votes WHERE poll_id = ?'),
    belumUmum: db.prepare('SELECT * FROM polls WHERE ends_at <= ? AND announced = 0 LIMIT 20'),
    tandai: db.prepare('UPDATE polls SET announced = 1 WHERE id = ? AND announced = 0'),
  };

  function hasil(p) {
    const opts = JSON.parse(p.options);
    const counts = opts.map(() => 0);
    for (const r of q.hitung.all(p.id)) if (r.choice >= 0 && r.choice < counts.length) counts[r.choice] = r.n;
    const total = counts.reduce((a, b) => a + b, 0);
    return { opts, counts, total, pct: counts.map(n => (total ? Math.round(n / total * 1000) / 10 : 0)) };
  }
  // bentuk publik satu polling; counts disembunyikan sampai warga memilih atau polling selesai
  function pub(p, u, now) {
    const h = hasil(p), done = p.ends_at <= now;
    const m = u ? q.mine.get(p.id, u) : null;
    const mine = m ? m.choice : null;
    const show = done || mine !== null;
    return {
      id: p.id, question: p.question, options: h.opts, ends_at: p.ends_at, done, mine,
      total: h.total,
      counts: show ? h.counts : null, pct: show ? h.pct : null,
    };
  }

  // umumkan polling yang baru selesai (aman dipanggil berulang: ditandai dulu, baru diposting)
  function umumkan(now = Date.now()) {
    for (const p of q.belumUmum.all(now)) {
      if (!q.tandai.run(p.id).changes) continue;
      if (!kabar) continue;
      const h = hasil(p);
      const urut = h.opts.map((o, i) => ({ o, n: h.counts[i], pct: h.pct[i] })).sort((a, b) => b.n - a.n);
      const menang = h.total ? urut.filter(x => x.n === urut[0].n).map(x => x.o) : [];
      const body = h.total
        ? `${menang.length > 1 ? 'Hasil seri: ' + menang.join(' & ') : 'Pilihan terbanyak: ' + menang[0]}.\n` +
          urut.map(x => `• ${x.o}: ${x.pct}% (${x.n} suara)`).join('\n') +
          `\nTotal ${h.total} warga memilih. Terima kasih sudah ikut menentukan arah kota!`
        : 'Belum ada warga yang memilih di polling ini.';
      try { kabar.simpanPost({ kind: 'pengumuman', title: ('Hasil voting: ' + p.question).slice(0, 80), body }); }
      catch (e) { console.error('[voting] pengumuman gagal', e.message); }
    }
  }
  try { umumkan(); } catch (e) { console.error('[voting] umumkan gagal', e); }
  setInterval(() => { try { umumkan(); } catch (e) { console.error('[voting] umumkan gagal', e); } }, 60e3).unref();

  function buat(b, now = Date.now()) {
    const question = str(b.question, 140);
    const options = (Array.isArray(b.options) ? b.options : []).map(o => str(o, 60)).filter(Boolean);
    const ends = Math.floor(+b.ends_at);
    if (!question) throw Object.assign(new Error('Pertanyaan wajib diisi'), { code: 400 });
    if (options.length < 2 || options.length > 6) throw Object.assign(new Error('Pilihan harus 2–6'), { code: 400 });
    if (new Set(options.map(o => o.toLowerCase())).size !== options.length) throw Object.assign(new Error('Ada pilihan yang sama'), { code: 400 });
    if (!(ends >= now + MIN_DUR && ends <= now + MAX_DUR)) throw Object.assign(new Error('Waktu selesai minimal 5 menit dan maksimal 90 hari dari sekarang'), { code: 400 });
    const r = q.buat.run(question, JSON.stringify(options), ends, now);
    return { id: Number(r.lastInsertRowid) };
  }

  return {
    umumkan,
    buat,
    async route(req, res, url, ctx) {
      const p = url.pathname, m = req.method;
      if (p === '/api/voting' && m === 'GET') {
        const now = Date.now(), u = ctx.user();
        umumkan(now);
        return ctx.send(res, 200, {
          now, user: u,
          aktif: q.aktif.all(now).map(x => pub(x, u, now)),
          riwayat: q.riwayat.all(now).map(x => pub(x, u, now)),
        }, { 'Cache-Control': 'no-store' }), true;
      }
      if (p === '/api/voting/pilih') {
        if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
        const u = ctx.user();
        if (!u) return ctx.send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW).' }), true;
        if (ctx.limited('voting', 20, 60e3)) return ctx.send(res, 429, { error: 'Terlalu cepat. Tunggu sebentar.' }), true;
        const b = await ctx.readJson(req, 512);
        const now = Date.now();
        if (!q.warga.get(u, now)) throw ctx.bad('Hanya warga yang sudah tiba di kota yang bisa memilih.', 403);
        const poll = q.get.get(Math.floor(+b.id) || 0);
        if (!poll) throw ctx.bad('Polling tidak ditemukan', 404);
        if (poll.ends_at <= now) throw ctx.bad('Polling ini sudah selesai.');
        const choice = Math.floor(+b.choice);
        if (!(choice >= 0 && choice < JSON.parse(poll.options).length)) throw ctx.bad('Pilihan tidak valid');
        q.pilih.run(poll.id, u, choice, now);
        return ctx.send(res, 200, pub(poll, u, now)), true;
      }

      if (!p.startsWith('/api/admin/voting')) return false;
      if (!ctx.isAdmin()) return ctx.send(res, 401, { error: 'Token admin salah' }), true;
      const a = p.slice('/api/admin/voting'.length);
      const now = Date.now();
      if (a === '' && m === 'GET') {
        umumkan(now);
        return ctx.send(res, 200, {
          now,
          polls: q.semua.all().map(x => { const h = hasil(x); return { id: x.id, question: x.question, options: h.opts, counts: h.counts, pct: h.pct, total: h.total, ends_at: x.ends_at, done: x.ends_at <= now, announced: !!x.announced, created_at: x.created_at }; }),
        }), true;
      }
      if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
      const b = await ctx.readJson(req, 4096);
      if (a === '') return ctx.send(res, 200, buat(b, now)), true;
      if (a === '/tutup') {
        const ch = q.tutup.run(now, Math.floor(+b.id) || 0, now).changes;
        if (!ch) throw ctx.bad('Polling tidak ditemukan atau sudah selesai');
        umumkan(now);
        return ctx.send(res, 200, { ok: true }), true;
      }
      if (a === '/hapus') {
        const id = Math.floor(+b.id) || 0;
        db.exec('BEGIN');
        try { q.hapusSuara.run(id); const ch = q.hapus.run(id).changes; db.exec('COMMIT'); return ctx.send(res, 200, { changed: ch }), true; }
        catch (e) { db.exec('ROLLBACK'); throw e; }
      }
      return ctx.send(res, 404, { error: 'Tidak ditemukan' }), true;
    },
  };
}
