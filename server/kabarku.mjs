// AUDIRA LAND · Kabar untukmu: kejadian pribadi seorang warga (14 hari terakhir).
// Sebagian disimpan (mis. "disalip di papan peringkat"), sebagian dihitung ulang tiap diminta
// dari data yang sudah ada: buku besar koin, rumus jabatan, dan penghuni rumah yang sama.
const HARI = 86400e3, JENDELA = 14 * HARI, MAKS = 30;

export function createKabarku(db, { world }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notif (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL,
      kind       TEXT NOT NULL,             -- disalip | ...
      text       TEXT NOT NULL,
      ref        TEXT NOT NULL DEFAULT '',  -- kunci untuk mencegah kabar kembar (mis. game|pelaku)
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notif(username, created_at);
  `);
  const { AL } = world;
  // nomor urut warga yang serumah: kavling rumah -> [seq]
  const serumah = new Map();
  for (let seq = 1; seq <= AL.homeCapacity; seq++) {
    const h = AL.homeForSeq(seq);
    if (h >= 0) { if (!serumah.has(h)) serumah.set(h, []); serumah.get(h).push(seq); }
  }
  const q = {
    res: db.prepare("SELECT seq, arrive_at FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    notif: db.prepare('SELECT kind, text, created_at FROM notif WHERE username = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 50'),
    ada: db.prepare('SELECT 1 FROM notif WHERE username = ? AND kind = ? AND ref = ? AND created_at >= ? LIMIT 1'),
    tambah: db.prepare('INSERT INTO notif (username, kind, text, ref, created_at) VALUES (?, ?, ?, ?, ?)'),
    bersih: db.prepare('DELETE FROM notif WHERE created_at < ?'),
    koin: db.prepare("SELECT amount, kind, note, ref, created_at FROM ledger WHERE username = ? AND kind IN ('terima', 'hadiah', 'juara') AND created_at >= ? ORDER BY id DESC LIMIT 30"),
    bySeq: db.prepare("SELECT username, arrive_at FROM residents WHERE seq = ? AND status = 'approved'"),
  };
  setInterval(() => q.bersih.run(Date.now() - 30 * HARI), 6 * 3600e3).unref();

  const fmt = n => Math.floor(n).toLocaleString('id-ID');

  return {
    // simpan kabar; ref + jeda mencegah kabar sama berulang (mis. disalip orang yang sama berkali-kali)
    tambah(u, kind, text, ref = '', jedaMs = 0) {
      const now = Date.now();
      if (jedaMs && ref && q.ada.get(u, kind, ref, now - jedaMs)) return false;
      q.tambah.run(u, kind, String(text).slice(0, 160), ref, now);
      return true;
    },
    feed(u) {
      const now = Date.now(), dari = now - JENDELA, out = [];
      const r = q.res.get(u, now);
      if (!r) return { items: [], now };

      for (const n of q.notif.all(u, dari)) out.push({ t: n.created_at, kind: n.kind, icon: n.kind === 'disalip' ? '🏃' : '📣', text: n.text, link: n.kind === 'disalip' ? '/kerja.html#peringkat' : '' });

      for (const l of q.koin.all(u, dari)) {
        if (l.kind === 'terima') out.push({ t: l.created_at, kind: 'koin', icon: '💌', text: `@${l.ref} mengirimimu ${fmt(l.amount)} koin${l.note ? `: “${l.note}”` : ''}` });
        else if (l.kind === 'juara') out.push({ t: l.created_at, kind: 'juara', icon: '🏆', text: `${l.note}. Hadiah ${fmt(l.amount)} koin masuk dompet.`, link: '/kerja.html#peringkat' });
        else out.push({ t: l.created_at, kind: 'hadiah', icon: '🎁', text: `${l.amount < 0 ? 'Koreksi' : 'Hadiah'} dari admin: ${fmt(l.amount)} koin${l.note ? ` (${l.note})` : ''}` });
      }

      // naik level & jabatan: lvl = 1 + floor(sqrt(hari * 1,6)) -> Lv L tercapai di hari (L-1)^2 / 1,6
      for (let L = 2; L <= 30; L++) {
        const t = r.arrive_at + ((L - 1) ** 2 / 1.6) * HARI;
        if (t > now) break;
        if (t < dari) continue;
        const c = world.career(u, r.seq, r.arrive_at, t + 1000);
        const naikJabatan = (L - 1) % 5 === 0;
        out.push({ t, kind: naikJabatan ? 'jabatan' : 'level', icon: naikJabatan ? '🎖️' : '⬆️', text: naikJabatan ? `Naik jabatan jadi ${c.title} di ${c.place} (Lv ${L})` : `Naik ke Lv ${L}. Gaji sekarang ${fmt(c.pay)} koin/hari.` });
      }

      // penghuni baru di rumah yang sama
      const home = AL.homeForSeq(r.seq);
      for (const s of home >= 0 ? serumah.get(home) || [] : []) {
        if (s === r.seq) continue;
        const o = q.bySeq.get(s);
        if (o && o.arrive_at >= Math.max(dari, r.arrive_at) && o.arrive_at <= now) {
          out.push({ t: o.arrive_at, kind: 'tetangga', icon: '🧳', text: `@${o.username} pindah ke rumahmu, ${AL.lots[home].name}. Sapa di Taman!`, cari: o.username });
        }
      }

      // hari pertama di kota
      if (r.arrive_at >= dari) out.push({ t: r.arrive_at, kind: 'tiba', icon: '⛴️', text: 'Kamu tiba di AUDIRA LAND naik kapal. Selamat datang!' });

      out.sort((a, b) => b.t - a.t);
      return { items: out.slice(0, MAKS), now };
    },
  };
}
