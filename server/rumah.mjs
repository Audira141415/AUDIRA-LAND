// AUDIRA LAND · Rumahku: ruang dalam rumah warga, perabot, ketuk pintu, dan stiker tamu.
// Rumah warga diturunkan dari nomor urut (seq) lewat js/world.js, jadi server tidak menyimpan alamat.
import { cleanText } from './taman.mjs';
import { normUsername } from './db.mjs';

// katalog perabot: slot tetap, satu perabot per slot. Gambar dibuat kode di js/rumah.js.
export const PERABOT = {
  'kasur':       { slot: 'lantai-kiri',   name: 'Kasur Kapuk',       price: 1500 },
  'sofa':        { slot: 'lantai-kiri',   name: 'Sofa Empuk',        price: 4500 },
  'meja':        { slot: 'lantai-kanan',  name: 'Meja Kayu Jati',    price: 800 },
  'akuarium':    { slot: 'lantai-kanan',  name: 'Akuarium Terumbu',  price: 8000 },
  'lemari':      { slot: 'sudut',         name: 'Lemari Dua Pintu',  price: 2200 },
  'rak-buku':    { slot: 'sudut',         name: 'Rak Buku',          price: 1800 },
  'karpet':      { slot: 'tengah',        name: 'Karpet Tenun',      price: 700 },
  'lukisan':     { slot: 'dinding-kiri',  name: 'Lukisan Pantai',    price: 1200 },
  'radio-tua':   { slot: 'dinding-kiri',  name: 'Radio Tua',         price: 950 },
  'tv':          { slot: 'dinding-kanan', name: 'TV Layar Datar',    price: 5500 },
  'lampu':       { slot: 'langit',        name: 'Lampu Gantung',     price: 900 },
  'kipas':       { slot: 'langit',        name: 'Kipas Angin Plafon', price: 1300 },
  'tanaman':     { slot: 'depan',         name: 'Tanaman Monstera',  price: 300 },
  'kursi-rotan': { slot: 'depan',         name: 'Kursi Rotan',       price: 600 },
};
export const SLOTS = {
  'lantai-kiri': 'Lantai kiri', 'lantai-kanan': 'Lantai kanan', 'sudut': 'Sudut', 'tengah': 'Tengah',
  'dinding-kiri': 'Dinding kiri', 'dinding-kanan': 'Dinding kanan', 'langit': 'Langit-langit', 'depan': 'Depan',
};
// stiker tamu (id -> emoji)
export const STIKER = {
  kembang: '🌺', kelapa: '🥥', ikan: '🐟', perahu: '⛵', nyiur: '🌴', bakso: '🍜',
  kopi: '☕', pesta: '🎉', hati: '💛', bulan: '🌙', bintang: '⭐', penyu: '🐢',
};
const STIKER_TAMPIL = 24, STIKER_SIMPAN = 60;
const KETUK_JEDA = 10 * 60e3;          // ketukan dari tamu yang sama ke rumah yang sama dihitung maks 1 per 10 menit
const HARI = 86400e3;
const hariWib = (t = Date.now()) => Math.floor((t + 7 * 3600e3) / HARI);

export function createRumah(db, { ekonomi, kabarku, world }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rumah_punya (
      username   TEXT NOT NULL,
      item       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (username, item)
    );
    CREATE TABLE IF NOT EXISTS rumah_pasang (
      username TEXT NOT NULL,
      slot     TEXT NOT NULL,
      item     TEXT NOT NULL,
      PRIMARY KEY (username, slot)
    );
    CREATE TABLE IF NOT EXISTS rumah_ketuk (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      host       TEXT NOT NULL,
      guest      TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rketuk_host ON rumah_ketuk(host, guest, created_at);
    CREATE TABLE IF NOT EXISTS rumah_stiker (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      host       TEXT NOT NULL,
      guest      TEXT NOT NULL,
      stiker     TEXT NOT NULL,
      msg        TEXT NOT NULL DEFAULT '',
      day        INTEGER NOT NULL,          -- hari WIB (ms/86400000), untuk batas 1 stiker per tamu per hari
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rstiker_harian ON rumah_stiker(host, guest, day);
    CREATE INDEX IF NOT EXISTS idx_rstiker_host ON rumah_stiker(host, id);
  `);
  const q = {
    res: db.prepare("SELECT username, seq, arrive_at, muted FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    punya: db.prepare('SELECT item FROM rumah_punya WHERE username = ?'),
    owns: db.prepare('SELECT 1 FROM rumah_punya WHERE username = ? AND item = ?'),
    buy: db.prepare('INSERT OR IGNORE INTO rumah_punya (username, item, created_at) VALUES (?, ?, ?)'),
    pasang: db.prepare('SELECT slot, item FROM rumah_pasang WHERE username = ?'),
    equip: db.prepare('INSERT INTO rumah_pasang (username, slot, item) VALUES (?, ?, ?) ON CONFLICT(username, slot) DO UPDATE SET item = excluded.item'),
    unequip: db.prepare('DELETE FROM rumah_pasang WHERE username = ? AND slot = ?'),
    ketukN: db.prepare('SELECT COUNT(*) AS n FROM rumah_ketuk WHERE host = ?'),
    ketukBaru: db.prepare('SELECT 1 FROM rumah_ketuk WHERE host = ? AND guest = ? AND created_at >= ? LIMIT 1'),
    ketuk: db.prepare('INSERT INTO rumah_ketuk (host, guest, created_at) VALUES (?, ?, ?)'),
    stiker: db.prepare('SELECT id, guest, stiker, msg, created_at FROM rumah_stiker WHERE host = ? ORDER BY id DESC LIMIT ?'),
    stikerHariIni: db.prepare('SELECT 1 FROM rumah_stiker WHERE host = ? AND guest = ? AND day = ? LIMIT 1'),
    tempel: db.prepare('INSERT INTO rumah_stiker (host, guest, stiker, msg, day, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    pangkas: db.prepare('DELETE FROM rumah_stiker WHERE host = ? AND id NOT IN (SELECT id FROM rumah_stiker WHERE host = ? ORDER BY id DESC LIMIT ?)'),
    hapus: db.prepare('DELETE FROM rumah_stiker WHERE id = ? AND host = ?'),
    hapusAdmin: db.prepare('DELETE FROM rumah_stiker WHERE id = ?'),
  };
  const { AL } = world;

  // warga yang sudah tiba + rumahnya (null = antre rusun)
  function wargaRumah(u, now = Date.now()) {
    const r = u ? q.res.get(u, now) : null;
    if (!r) return null;
    const hi = AL.homeForSeq(r.seq), l = hi >= 0 ? AL.lots[hi] : null;
    const home = l ? {
      i: hi, name: l.name, street: l.street, num: l.num, type: l.type, label: AL.LABEL[l.type] || 'Rumah',
      district: l.district, districtName: AL.DISTRICT[l.district],
    } : null;
    return { u: r.username, seq: r.seq, arriveAt: r.arrive_at, muted: !!r.muted, home };
  }
  const pasangOf = u => Object.fromEntries(q.pasang.all(u).map(e => [e.slot, e.item]));
  const needLogin = (res, ctx) => (ctx.send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW).' }), true);

  function lihat(host, viewer) {
    const now = Date.now(), h = wargaRumah(host, now);
    if (!h) return null;
    const out = {
      u: h.u, seq: h.seq, arriveAt: h.arriveAt, home: h.home, now,
      items: ekonomi.itemsOf ? ekonomi.itemsOf(h.u) : '',
      pasang: pasangOf(h.u),
      ketuk: q.ketukN.get(h.u).n,
      stiker: q.stiker.all(h.u, STIKER_TAMPIL).map(s => ({ id: s.id, guest: s.guest, s: s.stiker, e: STIKER[s.stiker] || '⭐', msg: s.msg, t: s.created_at })),
      aku: null,
    };
    if (viewer) {
      const me = wargaRumah(viewer, now);
      out.aku = {
        u: viewer, warga: !!me, pemilik: viewer === h.u,
        stikerHariIni: viewer !== h.u && !!q.stikerHariIni.get(h.u, viewer, hariWib(now)),
      };
    }
    return out;
  }

  function hostOrThrow(ctx, raw) {
    const host = normUsername(String(raw || ''));
    const h = host && wargaRumah(host);
    if (!h) throw ctx.bad('Warga ini belum tiba di kota.', 404);
    if (!h.home) throw ctx.bad(`@${h.u} masih antre rusun, belum punya rumah.`, 400);
    return h;
  }
  function pemilikOrThrow(ctx, u) {
    const me = wargaRumah(u);
    if (!me) throw ctx.bad('Kamu belum jadi warga yang tiba di kota.', 403);
    if (!me.home) throw ctx.bad('Kamu masih antre rusun. Perabot bisa dipasang setelah dapat rumah.', 400);
    return me;
  }

  return {
    PERABOT, SLOTS, STIKER,
    lihat,
    async route(req, res, url, ctx) {
      const p = url.pathname, m = req.method;
      if (!p.startsWith('/api/rumah') && !p.startsWith('/api/admin/rumah/')) return false;

      // ---------- publik ----------
      if (p === '/api/rumah' && m === 'GET') {
        if (ctx.limited('rumah-get', 120, 60e3)) return ctx.send(res, 429, { error: 'Terlalu cepat. Tunggu sebentar.' }), true;
        const host = normUsername(url.searchParams.get('u') || '');
        if (!host) throw ctx.bad('Username tidak valid', 400);
        const d = lihat(host, ctx.user());
        if (!d) return ctx.send(res, 404, { error: 'Warga ini belum tiba di kota.' }), true;
        return ctx.send(res, 200, d, { 'Cache-Control': 'no-store' }), true;
      }

      // ---------- admin: hapus stiker yang tidak pantas ----------
      if (p === '/api/admin/rumah/stiker/hapus' && m === 'POST') {
        if (!ctx.isAdmin()) return ctx.send(res, 401, { error: 'Khusus admin' }), true;
        const b = await ctx.readJson(req, 1024);
        return ctx.send(res, 200, { ok: q.hapusAdmin.run(Math.floor(+b.id) || 0).changes > 0 }), true;
      }

      // ---------- warga ----------
      const u = ctx.user();
      if (p === '/api/rumah/katalog' && m === 'GET') {
        if (!u) return needLogin(res, ctx);
        const me = wargaRumah(u);
        if (!me) throw ctx.bad('Kamu belum jadi warga yang tiba di kota.', 403);
        let saldo = 0;
        try { saldo = ekonomi.saldo(u); } catch { saldo = 0; }
        return ctx.send(res, 200, {
          items: PERABOT, slots: SLOTS, punya: q.punya.all(u).map(r => r.item), pasang: pasangOf(u), saldo, rumah: !!me.home,
        }, { 'Cache-Control': 'no-store' }), true;
      }
      if (m !== 'POST' || !['/api/rumah/beli', '/api/rumah/pasang', '/api/rumah/ketuk', '/api/rumah/stiker', '/api/rumah/stiker/hapus'].includes(p)) return false;
      if (!u) return needLogin(res, ctx);
      if (ctx.limited('rumah-post', 30, 60e3)) return ctx.send(res, 429, { error: 'Terlalu cepat. Tunggu sebentar.' }), true;
      const b = await ctx.readJson(req, 4096);

      if (p === '/api/rumah/beli') {
        const id = String(b.item || ''), it = Object.hasOwn(PERABOT, id) ? PERABOT[id] : null;
        if (!it) throw ctx.bad('Perabot tidak ada di katalog');
        pemilikOrThrow(ctx, u);
        if (q.owns.get(u, id)) throw ctx.bad('Kamu sudah punya perabot ini');
        ekonomi.debit(u, it.price, 'perabot', it.name, id);   // membuka transaksi sendiri, error bila koin kurang
        if (!q.buy.run(u, id, Date.now()).changes) {
          // dibeli dua kali bersamaan: kembalikan koinnya
          ekonomi.kredit(u, it.price, 'perabot', 'Batal beli ' + it.name, id);
          throw ctx.bad('Kamu sudah punya perabot ini');
        }
        q.equip.run(u, it.slot, id);
        let saldo = 0;
        try { saldo = ekonomi.saldo(u); } catch { saldo = 0; }
        return ctx.send(res, 200, { ok: true, item: id, pasang: pasangOf(u), punya: q.punya.all(u).map(r => r.item), saldo }), true;
      }

      if (p === '/api/rumah/pasang') {
        const slot = String(b.slot || '');
        if (!Object.hasOwn(SLOTS, slot)) throw ctx.bad('Slot tidak dikenal');
        pemilikOrThrow(ctx, u);
        const id = b.item ? String(b.item) : '';
        if (!id) q.unequip.run(u, slot);
        else {
          const it = Object.hasOwn(PERABOT, id) ? PERABOT[id] : null;
          if (!it || it.slot !== slot) throw ctx.bad('Perabot tidak cocok untuk slot ini');
          if (!q.owns.get(u, id)) throw ctx.bad('Beli dulu perabotnya');
          q.equip.run(u, slot, id);
        }
        return ctx.send(res, 200, { ok: true, pasang: pasangOf(u) }), true;
      }

      if (p === '/api/rumah/ketuk') {
        if (ctx.limited('rumah-ketuk', 12, 600e3)) return ctx.send(res, 429, { error: 'Sudah banyak mengetuk. Coba lagi nanti.' }), true;
        const h = hostOrThrow(ctx, b.u);
        if (h.u === u) throw ctx.bad('Ini rumahmu sendiri. Masuk saja!');
        if (!wargaRumah(u)) throw ctx.bad('Kamu belum jadi warga yang tiba di kota.', 403);
        const now = Date.now();
        if (q.ketukBaru.get(h.u, u, now - KETUK_JEDA)) {
          return ctx.send(res, 200, { ok: true, baru: false, ketuk: q.ketukN.get(h.u).n, pesan: 'Kamu baru saja mengetuk. Tuan rumah sudah diberi tahu.' }), true;
        }
        q.ketuk.run(h.u, u, now);
        kabarku.tambah(h.u, 'ketuk', `@${u} mengetuk pintu rumahmu`, 'ketuk|' + u, 6 * 3600e3, { icon: '🚪', link: '/rumah.html?u=' + h.u });
        return ctx.send(res, 200, { ok: true, baru: true, ketuk: q.ketukN.get(h.u).n }), true;
      }

      if (p === '/api/rumah/stiker') {
        if (ctx.limited('rumah-stiker', 12, 600e3)) return ctx.send(res, 429, { error: 'Terlalu sering. Coba lagi nanti.' }), true;
        const h = hostOrThrow(ctx, b.u);
        if (h.u === u) throw ctx.bad('Stiker hanya untuk rumah warga lain.');
        const me = wargaRumah(u);
        if (!me) throw ctx.bad('Kamu belum jadi warga yang tiba di kota.', 403);
        const s = String(b.s || '');
        if (!Object.hasOwn(STIKER, s)) throw ctx.bad('Stiker tidak dikenal');
        let msg = cleanText(b.msg).slice(0, 40).trim();
        if (msg && me.muted) throw ctx.bad('Kamu sedang dibisukan admin. Tempel stiker tanpa pesan, ya.', 403);
        const now = Date.now(), day = hariWib(now);
        if (q.stikerHariIni.get(h.u, u, day)) throw ctx.bad('Kamu sudah menempel stiker di sini hari ini. Datang lagi besok!');
        let id;
        try { id = Number(q.tempel.run(h.u, u, s, msg, day, now).lastInsertRowid); }
        catch { throw ctx.bad('Kamu sudah menempel stiker di sini hari ini. Datang lagi besok!'); }
        q.pangkas.run(h.u, h.u, STIKER_SIMPAN);
        kabarku.tambah(h.u, 'stiker', `@${u} menempel stiker ${STIKER[s]} di rumahmu${msg ? `: “${msg}”` : ''}`, 'stiker|' + u, 0, { icon: '🏷️', link: '/rumah.html?u=' + h.u });
        return ctx.send(res, 200, { ok: true, stiker: { id, guest: u, s, e: STIKER[s], msg, t: now } }), true;
      }

      if (p === '/api/rumah/stiker/hapus') {
        const id = Math.floor(+b.id) || 0;
        if (!q.hapus.run(id, u).changes) throw ctx.bad('Stiker tidak ditemukan di rumahmu', 404);
        return ctx.send(res, 200, { ok: true }), true;
      }
      return false;
    },
  };
}
