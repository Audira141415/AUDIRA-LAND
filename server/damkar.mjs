// AUDIRA LAND · Event kebakaran bersama.
// Server menyalakan api di satu kavling yang sudah berdiri (terjadwal 08.00–22.00 WIB, atau dipicu admin).
// Warga KTW menekan "Siram"; klien mengirim jumlah siraman tiap ±2 dtk, server membatasi 8 siraman/dtk per warga.
// Padam sebelum 3 menit: penolong dapat koin (sebanding kontribusi, maks 120; pegawai damkar ×2) + kabar.
// Gagal: kavling hangus 2 jam lalu pulih. Pilihan kavling & jam jadwal deterministik dari waktu.
const WIB = 7 * 3600e3;
const DUR_MS = 3 * 60e3;          // lama kebakaran
const HANGUS_MS = 2 * 3600e3;     // bekas gosong bila gagal
const RATE = 8;                   // siraman maks per detik per warga
const JENDELA_MS = 4000;          // jeda kiriman terlama yang dihitung (klien kirim tiap ±2 dtk)
const AWAL_MS = 30e3;             // penolong unik di 30 dtk pertama menentukan target
const TARGET_DASAR = 150, TARGET_PER = 80, TARGET_MAKS = 4000; // ±5 ketuk/dtk manusia: 1 orang ±45 dtk, 5 orang ±22 dtk
const KOIN_MAKS = 120;
const JAM_MULAI = 8, JAM_SELESAI = 22;
// jenis kavling yang bisa terbakar (bukan taman, sawah, kebun, atau pos damkar sendiri)
const TIDAK = new Set(['park', 'field', 'kebun', 'damkar']);

const mix = n => { n = Math.imul((n ^ (n >>> 16)) >>> 0, 0x45d9f3b); n = Math.imul((n ^ (n >>> 16)) >>> 0, 0x45d9f3b); return (n ^ (n >>> 16)) >>> 0; };
const jamWib = t => new Date(t + WIB).getUTCHours();
const koinUntuk = n => Math.min(KOIN_MAKS, Math.max(5, Math.round(n * 0.6)));

export function createDamkar(db, { world, ekonomi, kabarku, kabar = null, cfg = {} } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS damkar (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      lot        INTEGER NOT NULL,
      name       TEXT NOT NULL,
      source     TEXT NOT NULL,               -- jadwal | admin
      status     TEXT NOT NULL DEFAULT 'aktif', -- aktif | padam | hangus | batal
      started_at INTEGER NOT NULL,
      ends_at    INTEGER NOT NULL,
      done_at    INTEGER,
      until      INTEGER,                     -- hangus sampai (ms)
      target     INTEGER NOT NULL DEFAULT 0,  -- target akhir (diisi saat selesai)
      total      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_damkar_status ON damkar(status, started_at);
    CREATE TABLE IF NOT EXISTS damkar_siram (
      fire_id  INTEGER NOT NULL,
      username TEXT NOT NULL,
      n        INTEGER NOT NULL DEFAULT 0,
      first_at INTEGER NOT NULL,
      last_at  INTEGER NOT NULL,
      koin     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (fire_id, username)
    );
  `);
  const { AL } = world;
  // cfg boleh fungsi env server.mjs (cfg('DAMKAR_EVERY_MIN')) atau objek { everyMin, durMs } (uji)
  const fromFn = typeof cfg === 'function' ? cfg('DAMKAR_EVERY_MIN') : undefined;
  const rawEvery = typeof cfg === 'function' ? fromFn : (cfg.everyMin ?? process.env.DAMKAR_EVERY_MIN);
  const everyMin = Math.max(0, Number(rawEvery ?? 180) || 0); // 0 = jadwal mati
  const everyMs = everyMin * 60e3;
  const durMs = (typeof cfg === 'object' && +cfg.durMs) || DUR_MS;

  const q = {
    aktif: db.prepare("SELECT * FROM damkar WHERE status = 'aktif' ORDER BY id DESC LIMIT 1"),
    byId: db.prepare('SELECT * FROM damkar WHERE id = ?'),
    mulai: db.prepare('INSERT INTO damkar (lot, name, source, started_at, ends_at) VALUES (?, ?, ?, ?, ?)'),
    selesai: db.prepare('UPDATE damkar SET status = ?, done_at = ?, until = ?, target = ? WHERE id = ? AND status = \'aktif\''),
    tambahTotal: db.prepare('UPDATE damkar SET total = total + ? WHERE id = ?'),
    jadwalAda: db.prepare("SELECT 1 FROM damkar WHERE source = 'jadwal' AND started_at >= ? LIMIT 1"),
    hangus: db.prepare("SELECT id, lot, name, until FROM damkar WHERE status = 'hangus' AND until > ?"),
    terakhir: db.prepare("SELECT * FROM damkar WHERE status IN ('padam', 'hangus') AND done_at >= ? ORDER BY done_at DESC LIMIT 1"),
    riwayat: db.prepare('SELECT d.*, (SELECT COUNT(*) FROM damkar_siram s WHERE s.fire_id = d.id) AS helpers FROM damkar d ORDER BY d.id DESC LIMIT 40'),
    siram: db.prepare('SELECT * FROM damkar_siram WHERE fire_id = ? AND username = ?'),
    siramBaru: db.prepare('INSERT INTO damkar_siram (fire_id, username, n, first_at, last_at) VALUES (?, ?, ?, ?, ?)'),
    siramTambah: db.prepare('UPDATE damkar_siram SET n = n + ?, last_at = ? WHERE fire_id = ? AND username = ?'),
    penolong: db.prepare('SELECT username, n FROM damkar_siram WHERE fire_id = ? AND n > 0'),
    jmlPenolong: db.prepare('SELECT COUNT(*) AS c FROM damkar_siram WHERE fire_id = ? AND n > 0'),
    awal: db.prepare('SELECT COUNT(*) AS c FROM damkar_siram WHERE fire_id = ? AND first_at <= ?'),
    setKoin: db.prepare('UPDATE damkar_siram SET koin = ? WHERE fire_id = ? AND username = ?'),
    warga: db.prepare("SELECT seq, arrive_at FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    seqs: db.prepare("SELECT seq FROM residents WHERE status = 'approved' AND arrive_at <= ? AND seq IS NOT NULL"),
  };

  // ---------- kavling yang sudah berdiri (sama dengan aturan klien: rumah & tempat kerja warga + kantor pemerintah) ----------
  let cache = { t: 0, list: [] };
  function berdiri(now = Date.now()) {
    if (now - cache.t < 60e3) return cache.list;
    const set = new Set();
    AL.lots.forEach(l => { if (l.fixed) set.add(l.i); });
    for (const { seq } of q.seqs.all(now)) {
      const h = AL.homeForSeq(seq);
      if (h >= 0) set.add(h);
      const pl = AL.places[AL.jobForSeq(seq)];
      if (pl && pl.lot >= 0) set.add(pl.lot);
    }
    const list = [...set].filter(i => AL.lots[i] && !TIDAK.has(AL.lots[i].type)).sort((a, b) => a - b);
    cache = { t: now, list };
    return list;
  }
  const namaLot = l => l.name || AL.LABEL[l.type] || 'Bangunan';
  const alamat = l => `${l.street} No. ${l.num}`;

  function pilihLot(seed, now) {
    const gosong = new Set(q.hangus.all(now).map(r => r.lot));
    const list = berdiri(now).filter(i => !gosong.has(i));
    return list.length ? list[mix(seed) % list.length] : -1;
  }

  function targetOf(f) {
    if (f.status !== 'aktif' && f.target) return f.target;
    const n = q.awal.get(f.id, f.started_at + AWAL_MS).c;
    return Math.min(TARGET_MAKS, TARGET_DASAR + TARGET_PER * n);
  }

  function nyalakan(lotIdx, source, now = Date.now()) {
    const l = AL.lots[lotIdx];
    if (!l) throw Object.assign(new Error('Kavling tidak ditemukan'), { code: 400 });
    const r = q.mulai.run(lotIdx, namaLot(l), source, now, now + durMs);
    return q.byId.get(Number(r.lastInsertRowid));
  }

  function isPegawai(u, now) {
    const r = q.warga.get(u, now);
    if (!r) return false;
    try { return world.career(u, r.seq, r.arrive_at, now).kind === 'damkar'; } catch { return false; }
  }

  // tutup kebakaran: 'padam' (berhasil) atau 'hangus' (waktu habis). Koin & kabar dikirim di luar transaksi.
  function tutup(f, status, now) {
    const target = targetOf(f);
    const until = status === 'hangus' ? f.ends_at + HANGUS_MS : null;
    if (!q.selesai.run(status, now, until, target, f.id).changes) return; // sudah ditutup proses lain
    const penolong = q.penolong.all(f.id);
    const l = AL.lots[f.lot] || {};
    const tempat = `${f.name}${l.street ? ` (${alamat(l)})` : ''}`;
    if (status === 'padam') {
      for (const p of penolong) {
        let koin = koinUntuk(p.n);
        const dobel = isPegawai(p.username, now);
        if (dobel) koin *= 2;
        q.setKoin.run(koin, f.id, p.username);
        try { ekonomi?.kredit(p.username, koin, 'damkar', `Bantu padamkan ${f.name}`.slice(0, 60), 'damkar:' + f.id); } catch (e) { console.error('[damkar] kredit', e.message); }
        try {
          kabarku?.tambah(p.username, 'damkar', `Api di ${tempat} padam! Kamu menyiram ${p.n}× dan dapat ${koin} koin${dobel ? ' (bonus petugas damkar ×2)' : ''}.`, 'damkar:' + f.id, 0, { icon: '🚒', link: '/' });
        } catch (e) { console.error('[damkar] kabar', e.message); }
      }
      try { kabar?.simpanPost({ kind: 'berita', title: `Kebakaran di ${f.name} berhasil dipadamkan`.slice(0, 80), body: `${penolong.length} warga bergotong royong menyiram ${f.total} kali dan api padam dalam ${Math.max(1, Math.round((now - f.started_at) / 1000))} detik. Terima kasih, warga AUDIRA LAND!` }); } catch (e) { console.error('[damkar] koran', e.message); }
    } else {
      for (const p of penolong) {
        try { kabarku?.tambah(p.username, 'damkar', `Api di ${tempat} tidak sempat padam. Terima kasih sudah menyiram ${p.n}×. Bangunan pulih dalam 2 jam.`, 'damkar:' + f.id, 0, { icon: '🔥', link: '/' }); } catch (e) { console.error('[damkar] kabar', e.message); }
      }
      try { kabar?.simpanPost({ kind: 'berita', title: `${f.name} hangus terbakar`.slice(0, 80), body: `Api di ${tempat} tidak sempat dipadamkan (${penolong.length} warga ikut menyiram). Bangunan dibangun ulang dalam 2 jam. Lain kali, ayo lebih banyak yang membantu!` }); } catch (e) { console.error('[damkar] koran', e.message); }
    }
  }

  // jadwal: satu kebakaran per slot `everyMs` (WIB), di menit acak-tetap dalam paruh pertama slot, hanya 08–22 WIB
  function slotInfo(now) {
    if (!everyMs) return null;
    const slot = Math.floor((now + WIB) / everyMs);
    const start = slot * everyMs - WIB;
    const at = start + (mix(slot + 7) % Math.max(1, Math.floor(everyMs / 2)));
    return { slot, start, at };
  }
  function nextJadwal(now) {
    if (!everyMs) return null;
    for (let k = 0, t = now; k < 200; k++, t += everyMs) {
      const s = slotInfo(t);
      if (s.at < now) continue;
      const h = jamWib(s.at);
      if (h >= JAM_MULAI && h < JAM_SELESAI) return s.at;
    }
    return null;
  }

  function tick(now = Date.now()) {
    let f = q.aktif.get();
    if (f) {
      if (f.total >= targetOf(f)) tutup(f, 'padam', now);
      else if (now >= f.ends_at) tutup(f, 'hangus', now);
      else return f;
    }
    const s = slotInfo(now);
    if (s && now >= s.at && now < s.at + durMs) {
      const h = jamWib(now);
      if (h >= JAM_MULAI && h < JAM_SELESAI && !q.jadwalAda.get(s.start)) {
        const lot = pilihLot(s.slot, now);
        if (lot >= 0) return nyalakan(lot, 'jadwal', now);
      }
    }
    return null;
  }
  const timer = setInterval(() => { try { tick(); } catch (e) { console.error('[damkar]', e.message); } }, 5000);
  timer.unref?.();

  function publik(u, now = Date.now()) {
    const f = tick(now);
    const out = { now, aktif: null, hangus: q.hangus.all(now).map(r => ({ lot: r.lot, until: r.until })), selesai: null };
    if (f) {
      const mine = u ? q.siram.get(f.id, u) : null;
      out.aktif = { id: f.id, lot: f.lot, name: f.name, startedAt: f.started_at, endsAt: f.ends_at, total: f.total, target: targetOf(f), helpers: q.jmlPenolong.get(f.id).c, mine: mine ? mine.n : 0 };
    }
    const d = q.terakhir.get(now - 10 * 60e3);
    if (d && !f) {
      const mine = u ? q.siram.get(d.id, u) : null;
      out.selesai = { id: d.id, lot: d.lot, name: d.name, status: d.status, doneAt: d.done_at, total: d.total, target: d.target, helpers: q.jmlPenolong.get(d.id).c, mine: mine ? mine.n : 0, koin: mine ? mine.koin : 0 };
    }
    return out;
  }

  function siram(u, id, n, now = Date.now()) {
    const f = tick(now);
    if (!f || f.id !== id) return { ok: false, status: 'selesai', ...publik(u, now) };
    if (!q.warga.get(u, now)) throw Object.assign(new Error('Hanya warga yang sudah tiba yang bisa menyiram.'), { code: 403 });
    n = Math.max(0, Math.min(64, Math.floor(+n || 0)));
    const row = q.siram.get(f.id, u);
    // batas laju: 8/dtk sejak kiriman terakhir (jendela maks 4 dtk); kiriman pertama dihitung sejak api menyala
    const dt = Math.min(JENDELA_MS, Math.max(0, now - (row ? row.last_at : Math.max(f.started_at, now - JENDELA_MS))));
    const boleh = Math.ceil((RATE * dt) / 1000);
    const masuk = Math.min(n, boleh);
    db.exec('BEGIN');
    try {
      if (row) q.siramTambah.run(masuk, now, f.id, u);
      else q.siramBaru.run(f.id, u, masuk, now, now);
      if (masuk) q.tambahTotal.run(masuk, f.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const g = q.byId.get(f.id);
    if (g.total >= targetOf(g)) tutup(g, 'padam', now);
    return { ok: true, accepted: masuk, ...publik(u, now) };
  }

  function picu(lot, now = Date.now()) {
    if (tick(now)) throw Object.assign(new Error('Masih ada kebakaran yang berlangsung.'), { code: 409 });
    const i = Number.isInteger(lot) && lot >= 0 ? lot : pilihLot(mix(Math.floor(now / 1000)), now);
    if (i < 0) throw Object.assign(new Error('Belum ada bangunan berdiri yang bisa dipakai.'), { code: 400 });
    if (!AL.lots[i] || TIDAK.has(AL.lots[i].type)) throw Object.assign(new Error('Kavling itu bukan bangunan.'), { code: 400 });
    return nyalakan(i, 'admin', now);
  }

  return {
    tick, publik, siram,
    picu,
    async route(req, res, url, ctx) {
      const p = url.pathname, m = req.method;
      if (p === '/api/damkar' && m === 'GET') {
        return ctx.send(res, 200, publik(ctx.user()), { 'Cache-Control': 'no-store' }), true;
      }
      if (p === '/api/damkar/siram' && m === 'POST') {
        const u = ctx.user();
        if (!u) return ctx.send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW).' }), true;
        if (ctx.limited('damkar-siram:' + u, 60, 60e3)) return ctx.send(res, 429, { error: 'Terlalu cepat. Tunggu sebentar.' }), true;
        const b = await ctx.readJson(req, 512);
        return ctx.send(res, 200, siram(u, Math.floor(+b.id || 0), b.n)), true;
      }
      if (p.startsWith('/api/admin/damkar')) {
        if (!ctx.isAdmin()) return ctx.send(res, 401, { error: 'Token admin salah' }), true;
        const a = p.slice('/api/admin/damkar'.length);
        const now = Date.now();
        if (a === '' && m === 'GET') {
          const f = tick(now);
          return ctx.send(res, 200, {
            now, aktif: f ? { ...f, target: targetOf(f) } : null,
            riwayat: q.riwayat.all().map(r => ({ ...r, target: r.status === 'aktif' ? targetOf(r) : r.target })),
            jadwal: { everyMin, jam: `${String(JAM_MULAI).padStart(2, '0')}.00–${JAM_SELESAI}.00 WIB`, next: nextJadwal(now) },
            kandidat: berdiri(now).length,
          }), true;
        }
        if (m !== 'POST') return ctx.send(res, 405, { error: 'Metode tidak didukung' }), true;
        const b = await ctx.readJson(req, 512);
        if (a === '/picu') {
          const f = picu(b.lot === undefined || b.lot === null || b.lot === '' ? -1 : Math.floor(+b.lot), now);
          return ctx.send(res, 200, { ok: true, id: f.id, lot: f.lot, name: f.name }), true;
        }
        if (a === '/batal') {
          const f = q.aktif.get();
          if (!f) throw ctx.bad('Tidak ada kebakaran aktif', 400);
          q.selesai.run('batal', now, null, targetOf(f), f.id);
          return ctx.send(res, 200, { ok: true, id: f.id }), true;
        }
        return ctx.send(res, 404, { error: 'Tidak ditemukan' }), true;
      }
      return false;
    },
  };
}
