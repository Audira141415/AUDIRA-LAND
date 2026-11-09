// AUDIRA LAND · Balai Warga: data publik untuk Kartu Tanda Warga (KTW) dan Buku Warga.
// Rumah, kerja, jabatan, dan level dihitung di klien (js/world.js). Modul ini hanya mengirim yang
// tersimpan di server: lencana yang dimiliki, berapa kali juara kerja, dan rekor skor per pekerjaan.
import { normUsername } from './db.mjs';

const TTL = 60e3;          // cache jawaban per warga (sama dengan Cache-Control)
const CACHE_MAX = 500;

export function createBalai(db, { lencana } = {}) {
  // tabel milik modul lain (residents, kerja_juara, kerja_rounds): siapkan saat pertama dipakai
  // (tiap query disiapkan sendiri-sendiri: tabel kerja yang belum ada tidak menggagalkan query residents)
  const SQL = {
    res: "SELECT seq, arrive_at FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?",
    juara: 'SELECT rank, COUNT(*) AS n FROM kerja_juara WHERE username = ? GROUP BY rank',
    rekor: 'SELECT game, MAX(score) AS best FROM kerja_rounds WHERE username = ? AND ended_at IS NOT NULL AND score > 0 GROUP BY game',
    top: `SELECT k.username AS u,
        SUM(k.rank = 1) AS emas, SUM(k.rank = 2) AS perak, SUM(k.rank = 3) AS perunggu, COUNT(*) AS total
      FROM kerja_juara k
      JOIN residents r ON r.username = k.username AND r.status = 'approved' AND r.arrive_at <= ?
      WHERE k.rank BETWEEN 1 AND 3
      GROUP BY k.username
      ORDER BY emas DESC, perak DESC, perunggu DESC, total DESC, MIN(k.week) ASC
      LIMIT 50`,
  };
  const prepared = {};
  const Q = name => prepared[name] || (prepared[name] = db.prepare(SQL[name]));

  // tabel kerja belum ada (modul kerja belum pernah jalan) = belum ada data, bukan error
  const safe = (fn, dflt) => { try { return fn(); } catch (e) { if (/no such table/i.test(e.message)) return dflt; throw e; } };

  const cache = new Map();   // username -> { at, body }
  let topCache = null;       // { at, body }

  function warga(u, now = Date.now()) {
    const hit = cache.get(u);
    if (hit && now - hit.at < TTL) return hit.body;
    const r = Q('res').get(u, now);
    if (!r) return null;

    let list = [], pakai = null;
    if (lencana && lencana.daftar) {
      try {
        const d = lencana.daftar(u);
        pakai = d.pakai || null;
        list = d.list.filter(b => b.punya).map(b => ({ id: b.id, icon: b.icon, name: b.name }));
        if (pakai && !list.some(b => b.id === pakai)) pakai = null;
      } catch (e) { /* tabel modul lain belum ada: tampilkan tanpa lencana */ }
    }

    const juara = { emas: 0, perak: 0, perunggu: 0 };
    for (const j of safe(() => Q('juara').all(u), [])) {
      if (j.rank === 1) juara.emas = j.n; else if (j.rank === 2) juara.perak = j.n; else if (j.rank === 3) juara.perunggu = j.n;
    }
    const rekor = {};
    for (const x of safe(() => Q('rekor').all(u), [])) rekor[x.game] = x.best;

    const body = { username: u, seq: r.seq, lencana: list, pakai, juara, rekor };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(u, { at: now, body });
    return body;
  }

  function juaraTop(now = Date.now()) {
    if (topCache && now - topCache.at < TTL) return topCache.body;
    const list = safe(() => Q('top').all(now), []).map(x => ({ u: x.u, emas: x.emas, perak: x.perak, perunggu: x.perunggu }));
    topCache = { at: now, body: { list } };
    return topCache.body;
  }

  const PUB = { 'Cache-Control': 'public, max-age=60' };

  return {
    warga,
    juaraTop,
    async route(req, res, url, ctx) {
      const p = url.pathname;
      if (p !== '/api/balai/warga' && p !== '/api/balai/juara') return false;
      if (req.method !== 'GET') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
      if (ctx.limited('balai', 120, 60e3)) return ctx.send(res, 429, { error: 'Terlalu cepat. Tunggu sebentar.' }), true;

      if (p === '/api/balai/juara') return ctx.send(res, 200, juaraTop(), PUB), true;

      const u = normUsername(url.searchParams.get('u') || '');
      if (!u) return ctx.send(res, 400, { error: 'Username tidak valid' }), true;
      const body = warga(u);
      if (!body) return ctx.send(res, 404, { error: 'Bukan warga AUDIRA LAND' }, { 'Cache-Control': 'public, max-age=30' }), true;
      return ctx.send(res, 200, body, PUB), true;
    },
  };
}
