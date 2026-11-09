// AUDIRA LAND · Lencana warga. Didapat otomatis dari kegiatan (lama tinggal, kerja, juara, absen, dll).
// Warga memilih satu lencana untuk dipakai: tampil di depan nama di Taman/pesta dan di kartu warga di peta.
const HARI = 86400e3;
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });

// urutan = urutan tampil. cek(s) -> [nilai sekarang, target]
export const LENCANA = [
  { id: 'juara-emas', icon: '🥇', name: 'Juara Emas', desc: 'Juara 1 papan kerja mingguan', cek: s => [s.juara1, 1] },
  { id: 'podium', icon: '🏅', name: 'Naik Podium', desc: 'Masuk 3 besar papan kerja mingguan', cek: s => [s.podium, 1] },
  { id: 'perintis', icon: '🧭', name: 'Warga Perintis', desc: '100 warga pertama AUDIRA LAND', cek: s => [s.seq <= 100 ? 1 : 0, 1] },
  { id: 'pejabat', icon: '⭐', name: 'Pejabat Tinggi', desc: 'Capai Lv 26 (jabatan tertinggi)', cek: s => [s.lvl, 26] },
  { id: 'sesepuh', icon: '🏛️', name: 'Sesepuh Pulau', desc: 'Tinggal 100 hari di kota', cek: s => [Math.floor(s.days), 100] },
  { id: 'setia', icon: '🏡', name: 'Warga Setia', desc: 'Tinggal 30 hari di kota', cek: s => [Math.floor(s.days), 30] },
  { id: 'pekerja', icon: '⚒️', name: 'Pekerja Keras', desc: 'Selesaikan 50 ronde kerja', cek: s => [s.ronde, 50] },
  { id: 'rajin', icon: '📅', name: 'Rajin Absen', desc: 'Absen harian 7 kali', cek: s => [s.absen, 7] },
  { id: 'dermawan', icon: '🤝', name: 'Dermawan', desc: 'Kirim total 1.000 koin ke warga lain', cek: s => [s.kirim, 1000] },
  { id: 'tuan-rumah', icon: '🎉', name: 'Tuan Rumah', desc: 'Buka 3 pesta rumah', cek: s => [s.pesta, 3] },
  { id: 'kolektor', icon: '🛍️', name: 'Kolektor Butik', desc: 'Punya 5 aksesori', cek: s => [s.barang, 5] },
];
const BY_ID = Object.fromEntries(LENCANA.map(b => [b.id, b]));

export function createLencana(db, { world }) {
  db.exec('CREATE TABLE IF NOT EXISTS lencana_pakai (username TEXT PRIMARY KEY, badge TEXT NOT NULL)');
  // tabel lain dibuat modul masing-masing; siapkan query saat pertama dipakai
  let q = null;
  const Q = () => q || (q = {
    res: db.prepare("SELECT seq, arrive_at FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    juara: db.prepare('SELECT MIN(rank) AS best, COUNT(*) AS n FROM kerja_juara WHERE username = ?'),
    ronde: db.prepare('SELECT COUNT(*) AS n FROM kerja_rounds WHERE username = ? AND ended_at IS NOT NULL AND score > 0'),
    absen: db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE username = ? AND kind = 'absen'"),
    kirim: db.prepare("SELECT COALESCE(-SUM(amount), 0) AS n FROM ledger WHERE username = ? AND kind = 'kirim'"),
    pesta: db.prepare('SELECT COUNT(*) AS n FROM parties WHERE host = ?'),
    barang: db.prepare('SELECT COUNT(*) AS n FROM inventory WHERE username = ?'),
    pakai: db.prepare('SELECT badge FROM lencana_pakai WHERE username = ?'),
    set: db.prepare('INSERT INTO lencana_pakai (username, badge) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET badge = excluded.badge'),
    lepas: db.prepare('DELETE FROM lencana_pakai WHERE username = ?'),
    semua: db.prepare("SELECT p.username, p.badge FROM lencana_pakai p JOIN residents r ON r.username = p.username AND r.status = 'approved'"),
  });

  function statistik(u, now = Date.now()) {
    const r = Q().res.get(u, now);
    if (!r) throw bad('Kamu belum jadi warga yang tiba di kota.', 403);
    const c = world.career(u, r.seq, r.arrive_at, now), j = Q().juara.get(u);
    return {
      seq: r.seq, lvl: c.lvl, days: (now - r.arrive_at) / HARI,
      juara1: j.best === 1 ? 1 : 0, podium: j.n > 0 ? 1 : 0,
      ronde: Q().ronde.get(u).n, absen: Q().absen.get(u).n, kirim: Q().kirim.get(u).n,
      pesta: Q().pesta.get(u).n, barang: Q().barang.get(u).n,
    };
  }
  const punya = (b, s) => { const [v, t] = b.cek(s); return v >= t; };

  return {
    LENCANA,
    // daftar lengkap dengan kemajuan, untuk dompet
    daftar(u) {
      const s = statistik(u), pakai = Q().pakai.get(u)?.badge || null;
      return {
        pakai,
        list: LENCANA.map(b => { const [v, t] = b.cek(s); return { id: b.id, icon: b.icon, name: b.name, desc: b.desc, punya: v >= t, nilai: Math.min(v, t), target: t }; }),
      };
    },
    pakai(u, id) {
      if (!id) { Q().lepas.run(u); return { pakai: null }; }
      const b = BY_ID[id];
      if (!b) throw bad('Lencana tidak dikenal');
      if (!punya(b, statistik(u))) throw bad('Lencana ini belum kamu dapatkan');
      Q().set.run(u, id);
      return { pakai: id };
    },
    // ikon lencana yang dipakai satu warga ('' = tidak ada); dipakai Taman & pesta
    iconOf(u) { const id = Q().pakai.get(u)?.badge; return (id && BY_ID[id]?.icon) || ''; },
    // semua lencana yang dipakai: { username: [ikon, nama] } untuk /api/city
    peta() {
      const out = {};
      for (const r of Q().semua.all()) { const b = BY_ID[r.badge]; if (b) out[r.username] = [b.icon, b.name]; }
      return out;
    },
  };
}
