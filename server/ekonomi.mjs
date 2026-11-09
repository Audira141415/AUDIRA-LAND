// AUDIRA LAND · Dompet & ekonomi warga KTW.
// Saldo = gaji yang sudah terkumpul (rumus sama dengan peta, dihitung ulang tiap saat) + buku besar (absen, belanja, kiriman, hadiah).
// Koin hanya bernilai di dalam game: tidak bisa dibeli dengan uang dan tidak bisa dicairkan.

export const ITEMS = {
  'kupluk':          { slot: 'kepala', name: 'Kupluk Rajut', price: 450 },
  'topi-pantai':     { slot: 'kepala', name: 'Topi Pantai', price: 600 },
  'topi-kapten':     { slot: 'kepala', name: 'Topi Kapten Feri', price: 2500 },
  'mahkota':         { slot: 'kepala', name: 'Mahkota Pulau', price: 6000 },
  'kacamata-bulat':  { slot: 'mata', name: 'Kacamata Bulat', price: 500 },
  'kacamata-hitam':  { slot: 'mata', name: 'Kacamata Hitam', price: 700 },
  'kalung-kerang':   { slot: 'leher', name: 'Kalung Kerang', price: 900 },
  'syal-batik':      { slot: 'leher', name: 'Syal Batik', price: 1200 },
  'aura-ombak':      { slot: 'aura', name: 'Aura Ombak', price: 8000 },
  'aura-bintang':    { slot: 'aura', name: 'Aura Bintang', price: 12000 },
};
const SLOTS = ['kepala', 'mata', 'leher', 'aura'];
const ABSEN = 50;               // koin per hari (+5 per level)
const KIRIM_MIN = 10, KIRIM_MAKS_HARIAN = 5000;
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });
const startOfDayWib = (t = Date.now()) => { const d = Math.floor((t + 7 * 3600e3) / 86400e3); return d * 86400e3 - 7 * 3600e3; };
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, '').trim().slice(0, max) : '');

export function createEkonomi(db, { world }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL,
      amount     INTEGER NOT NULL,          -- koin, + masuk / - keluar
      kind       TEXT NOT NULL,             -- absen | beli | kirim | terima | hadiah
      note       TEXT NOT NULL DEFAULT '',
      ref        TEXT NOT NULL DEFAULT '',  -- lawan transaksi / id barang
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(username, created_at);
    CREATE TABLE IF NOT EXISTS inventory (username TEXT NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (username, item));
    CREATE TABLE IF NOT EXISTS equipped (username TEXT NOT NULL, slot TEXT NOT NULL, item TEXT NOT NULL, PRIMARY KEY (username, slot));
  `);
  const q = {
    res: db.prepare("SELECT username, seq, arrive_at FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    sum: db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM ledger WHERE username = ?'),
    add: db.prepare('INSERT INTO ledger (username, amount, kind, note, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    hist: db.prepare('SELECT amount, kind, note, ref, created_at FROM ledger WHERE username = ? ORDER BY id DESC LIMIT 20'),
    absenHariIni: db.prepare("SELECT 1 FROM ledger WHERE username = ? AND kind = 'absen' AND created_at >= ? LIMIT 1"),
    kirimHariIni: db.prepare("SELECT COALESCE(-SUM(amount), 0) AS s FROM ledger WHERE username = ? AND kind = 'kirim' AND created_at >= ?"),
    inv: db.prepare('SELECT item FROM inventory WHERE username = ?'),
    owns: db.prepare('SELECT 1 FROM inventory WHERE username = ? AND item = ?'),
    buy: db.prepare('INSERT INTO inventory (username, item, created_at) VALUES (?, ?, ?)'),
    eq: db.prepare('SELECT slot, item FROM equipped WHERE username = ?'),
    equip: db.prepare('INSERT INTO equipped (username, slot, item) VALUES (?, ?, ?) ON CONFLICT(username, slot) DO UPDATE SET item = excluded.item'),
    unequip: db.prepare('DELETE FROM equipped WHERE username = ? AND slot = ?'),
    allEq: db.prepare("SELECT e.username, e.slot, e.item FROM equipped e JOIN residents r ON r.username = e.username AND r.status = 'approved'"),
  };
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  function warga(u, now = Date.now()) {
    const r = q.res.get(u, now);
    if (!r) throw bad('Kamu belum jadi warga yang tiba di kota.', 403);
    return r;
  }
  function saldo(u, now = Date.now()) {
    const r = warga(u, now);
    const c = world.career(u, r.seq, r.arrive_at, now);
    return { c, balance: Math.floor(c.accrued) + q.sum.get(u).s };
  }
  const itemsOf = u => {
    const map = Object.fromEntries(q.eq.all(u).map(e => [e.slot, e.item]));
    return SLOTS.map(s => map[s]).filter(Boolean).join(',');
  };

  return {
    ITEMS,
    itemsOf,
    // semua warga yang memakai aksesori: { username: "kupluk,syal-batik" }
    looks() {
      const out = {};
      for (const e of q.allEq.all()) (out[e.username] ||= []).push(e.item);
      for (const k in out) out[k] = out[k].join(',');
      return out;
    },
    dompet(u) {
      const now = Date.now(), { c, balance } = saldo(u, now);
      return {
        username: u, balance, now,
        perHari: Math.round(c.pay), perDetik: c.pay / 86400,
        lvl: c.lvl, title: c.title, place: c.place, gajiTotal: Math.floor(c.accrued),
        absenHariIni: !!q.absenHariIni.get(u, startOfDayWib(now)),
        absenKoin: ABSEN + c.lvl * 5,
        kirimSisa: Math.max(0, KIRIM_MAKS_HARIAN - q.kirimHariIni.get(u, startOfDayWib(now)).s),
        riwayat: q.hist.all(u),
        punya: q.inv.all(u).map(r => r.item),
        pakai: Object.fromEntries(q.eq.all(u).map(e => [e.slot, e.item])),
      };
    },
    absen(u) {
      return tx(() => {
        const now = Date.now(), { c } = saldo(u, now);
        if (q.absenHariIni.get(u, startOfDayWib(now))) throw bad('Kamu sudah absen hari ini. Datang lagi besok!');
        const koin = ABSEN + c.lvl * 5;
        q.add.run(u, koin, 'absen', `Absen harian Lv ${c.lvl}`, '', now);
        return { koin };
      });
    },
    beli(u, item) {
      const it = ITEMS[item];
      if (!it) throw bad('Barang tidak ada di butik');
      return tx(() => {
        if (q.owns.get(u, item)) throw bad('Kamu sudah punya barang ini');
        const { balance } = saldo(u);
        if (balance < it.price) throw bad(`Koinmu kurang ${(it.price - balance).toLocaleString('id-ID')}`);
        const now = Date.now();
        q.add.run(u, -it.price, 'beli', it.name, item, now);
        q.buy.run(u, item, now);
        q.equip.run(u, it.slot, item);
        return { item, items: itemsOf(u) };
      });
    },
    pakai(u, slot, item) {
      if (!SLOTS.includes(slot)) throw bad('Slot tidak dikenal');
      warga(u);
      if (!item) { q.unequip.run(u, slot); return { items: itemsOf(u) }; }
      const it = ITEMS[item];
      if (!it || it.slot !== slot) throw bad('Barang tidak cocok untuk slot ini');
      if (!q.owns.get(u, item)) throw bad('Beli dulu barangnya di butik');
      q.equip.run(u, slot, item);
      return { items: itemsOf(u) };
    },
    kirim(from, to, amount, note) {
      amount = Math.floor(+amount);
      if (!(amount >= KIRIM_MIN)) throw bad(`Minimal kirim ${KIRIM_MIN} koin`);
      if (from === to) throw bad('Tidak bisa kirim ke diri sendiri');
      const catatan = str(note, 60);
      return tx(() => {
        const now = Date.now();
        try { warga(to, now); } catch { throw bad('Penerima bukan warga yang sudah tiba'); }
        const sudah = q.kirimHariIni.get(from, startOfDayWib(now)).s;
        if (sudah + amount > KIRIM_MAKS_HARIAN) throw bad(`Batas kirim harian ${KIRIM_MAKS_HARIAN.toLocaleString('id-ID')} koin (sisa ${Math.max(0, KIRIM_MAKS_HARIAN - sudah).toLocaleString('id-ID')})`);
        const { balance } = saldo(from, now);
        if (balance < amount) throw bad('Koinmu tidak cukup');
        q.add.run(from, -amount, 'kirim', catatan, to, now);
        q.add.run(to, amount, 'terima', catatan, from, now);
        return { ok: true, amount, to };
      });
    },
    // dipakai modul lain (mis. mini-game kerja) untuk menambah koin ke buku besar
    kredit(u, amount, kind, note, ref = '') {
      q.add.run(u, Math.floor(amount), kind, String(note).slice(0, 60), ref, Date.now());
    },
    // admin: hadiah lomba / koreksi
    beri(us, amount, note) {
      amount = Math.floor(+amount);
      if (!amount || Math.abs(amount) > 100000) throw bad('Jumlah 1–100.000 (boleh minus untuk koreksi)');
      const catatan = str(note, 60) || 'Hadiah dari admin';
      return tx(() => {
        let n = 0;
        for (const u of us) { try { warga(u); } catch { continue; } q.add.run(u, amount, 'hadiah', catatan, 'admin', Date.now()); n++; }
        return { changed: n };
      });
    },
  };
}
