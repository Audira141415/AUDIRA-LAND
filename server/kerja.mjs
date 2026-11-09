// AUDIRA LAND · Mini-game kerja: Nelayan, Petani, Kurir. Ronde 30 detik, hasilnya jadi koin + "hasil kota hari ini".
// Anti-curang dasar: ronde dibuka server (seed + waktu mulai), skor dicek terhadap batas wajar, durasi minimal,
// satu ronde aktif per warga, dan batas koin harian dari kerja.
import { randomBytes, randomInt } from 'node:crypto';

export const GAMES = {
  nelayan: { name: 'Nelayan', unit: 'ikan', rate: 6, max: 40, jobs: ['pelabuhan'] },
  petani: { name: 'Petani', unit: 'ikat padi', rate: 3, max: 90, jobs: ['field', 'park', 'kebun'] },
  kurir: { name: 'Kurir Pasar', unit: 'paket', rate: 3.5, max: 80, jobs: ['pasar', 'shop', 'mall', 'warung', 'kantorpos'] },
};
const DURASI_S = 30;
const KOIN_HARIAN = 400;      // batas koin dari kerja per warga per hari (WIB)
const RONDE_HARIAN = 25;
const BONUS = 1.5;            // main sesuai pekerjaan sendiri
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });
const startOfDayWib = (t = Date.now()) => Math.floor((t + 7 * 3600e3) / 86400e3) * 86400e3 - 7 * 3600e3;

export function createKerja(db, { world, ekonomi }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kerja_rounds (
      id         TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      game       TEXT NOT NULL,
      seed       INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at   INTEGER,
      score      INTEGER,
      koin       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_kerja_user ON kerja_rounds(username, started_at);
    CREATE INDEX IF NOT EXISTS idx_kerja_day ON kerja_rounds(started_at);
  `);
  const q = {
    res: db.prepare("SELECT seq, arrive_at FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    hariIni: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(koin), 0) AS koin FROM kerja_rounds WHERE username = ? AND started_at >= ?'),
    best: db.prepare('SELECT game, MAX(score) AS best FROM kerja_rounds WHERE username = ? AND started_at >= ? AND ended_at IS NOT NULL GROUP BY game'),
    get: db.prepare('SELECT * FROM kerja_rounds WHERE id = ?'),
    buka: db.prepare('INSERT INTO kerja_rounds (id, username, game, seed, started_at) VALUES (?, ?, ?, ?, ?)'),
    tutupLama: db.prepare('UPDATE kerja_rounds SET ended_at = ?, score = 0, koin = 0 WHERE username = ? AND ended_at IS NULL'),
    selesai: db.prepare('UPDATE kerja_rounds SET ended_at = ?, score = ?, koin = ? WHERE id = ?'),
    kota: db.prepare('SELECT game, COALESCE(SUM(score), 0) AS total, COUNT(DISTINCT username) AS orang FROM kerja_rounds WHERE started_at >= ? AND ended_at IS NOT NULL GROUP BY game'),
  };
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  function jobKind(u) {
    const r = q.res.get(u, Date.now());
    if (!r) throw bad('Kamu belum jadi warga yang tiba di kota.', 403);
    return world.career(u, r.seq, r.arrive_at).kind;
  }
  const mult = (game, kind) => (GAMES[game].jobs.includes(kind) ? BONUS : 1);

  return {
    GAMES,
    status(u) {
      const kind = jobKind(u), day = startOfDayWib();
      const h = q.hariIni.get(u, day);
      const best = Object.fromEntries(q.best.all(u, day).map(r => [r.game, r.best]));
      return {
        koinHariIni: h.koin, batas: KOIN_HARIAN, ronde: h.n, rondeMaks: RONDE_HARIAN,
        games: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { name: g.name, unit: g.unit, rate: g.rate, bonus: mult(k, kind) > 1, best: best[k] || 0 }])),
      };
    },
    mulai(u, game) {
      if (!GAMES[game]) throw bad('Pekerjaan tidak dikenal');
      jobKind(u);
      return tx(() => {
        const now = Date.now();
        if (q.hariIni.get(u, startOfDayWib(now)).n >= RONDE_HARIAN) throw bad('Sudah cukup kerja hari ini. Istirahat dulu, besok lagi!');
        q.tutupLama.run(now, u); // ronde yang ditinggal dianggap batal
        const id = randomBytes(12).toString('base64url'), seed = randomInt(1, 2 ** 31);
        q.buka.run(id, u, game, seed, now);
        return { round: id, seed, durasi: DURASI_S };
      });
    },
    selesai(u, round, score) {
      return tx(() => {
        const r = q.get.get(String(round || ''));
        if (!r || r.username !== u) throw bad('Ronde tidak ditemukan');
        if (r.ended_at) throw bad('Ronde ini sudah selesai');
        const now = Date.now(), elapsed = now - r.started_at;
        if (elapsed < (DURASI_S - 1.5) * 1000) throw bad('Ronde belum selesai');
        if (elapsed > 180e3) { q.selesai.run(now, 0, 0, r.id); throw bad('Ronde kedaluwarsa'); }
        const g = GAMES[r.game];
        score = Math.floor(+score);
        if (!(score >= 0 && score <= g.max)) { q.selesai.run(now, 0, 0, r.id); throw bad('Skor tidak wajar, ronde dibatalkan'); }
        const m = mult(r.game, jobKind(u));
        const sudah = q.hariIni.get(u, startOfDayWib(now)).koin;
        const raw = Math.floor(score * g.rate * m);
        const koin = Math.max(0, Math.min(raw, KOIN_HARIAN - sudah));
        q.selesai.run(now, score, koin, r.id);
        if (koin > 0) ekonomi.kredit(u, koin, 'kerja', `${g.name}: ${score} ${g.unit}${m > 1 ? ' (bonus profesi)' : ''}`, r.game);
        return { score, koin, terpotong: koin < raw, bonus: m > 1, sisaHariIni: Math.max(0, KOIN_HARIAN - sudah - koin) };
      });
    },
    // hasil kerja seluruh kota hari ini
    kota() {
      const rows = Object.fromEntries(q.kota.all(startOfDayWib()).map(r => [r.game, r]));
      return Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { name: g.name, unit: g.unit, total: rows[k]?.total || 0, orang: rows[k]?.orang || 0 }]));
    },
  };
}
