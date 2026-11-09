// AUDIRA LAND · Mini-game kerja: Nelayan, Petani, Kurir. Ronde 30 detik, hasilnya jadi koin + "hasil kota hari ini".
// Anti-curang: ronde dibuka server (seed + waktu mulai). Klien mengirim daftar ketukan, server memutar ulang
// ronde dengan kode yang sama (js/kerja-sim.js) dan memakai skor hasil putar ulang, bukan skor kiriman klien.
// Ditambah: durasi minimal, satu ronde aktif per warga, batas ketukan per detik, dan batas koin harian.
// Kompetisi: papan peringkat harian & mingguan per pekerjaan; juara 1-3 tiap minggu (Senin-Minggu WIB) dapat koin.
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
export const HADIAH = [1000, 600, 300]; // koin juara 1-3 tiap pekerjaan per minggu
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });
const WIB = 7 * 3600e3, HARI = 86400e3;
const startOfDayWib = (t = Date.now()) => Math.floor((t + WIB) / HARI) * HARI - WIB;
// minggu mulai Senin 00.00 WIB (1 Jan 1970 = Kamis, jadi hari ke-d sudah (d + 3) % 7 hari sejak Senin)
export const startOfWeekWib = (t = Date.now()) => { const d = Math.floor((t + WIB) / HARI); return (d - (d + 3) % 7) * HARI - WIB; };

export function createKerja(db, { world, ekonomi, sim, kabar, kabarku }) {
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
    CREATE INDEX IF NOT EXISTS idx_kerja_board ON kerja_rounds(game, started_at, score);
    CREATE TABLE IF NOT EXISTS kerja_juara (
      week     INTEGER NOT NULL,          -- awal minggu (ms, Senin 00.00 WIB)
      game     TEXT NOT NULL,
      rank     INTEGER NOT NULL,
      username TEXT NOT NULL,
      score    INTEGER NOT NULL,
      koin     INTEGER NOT NULL,
      PRIMARY KEY (week, game, rank)
    );
    CREATE TABLE IF NOT EXISTS kerja_minggu (week INTEGER PRIMARY KEY, done_at INTEGER NOT NULL);
  `);
  const q = {
    res: db.prepare("SELECT seq, arrive_at FROM residents WHERE username = ? AND status = 'approved' AND arrive_at <= ?"),
    hariIni: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(koin), 0) AS koin FROM kerja_rounds WHERE username = ? AND started_at >= ?'),
    best: db.prepare('SELECT game, MAX(score) AS best FROM kerja_rounds WHERE username = ? AND started_at >= ? AND ended_at IS NOT NULL GROUP BY game'),
    get: db.prepare('SELECT * FROM kerja_rounds WHERE id = ?'),
    buka: db.prepare('INSERT INTO kerja_rounds (id, username, game, seed, started_at) VALUES (?, ?, ?, ?, ?)'),
    tutupLama: db.prepare('UPDATE kerja_rounds SET ended_at = ?, score = 0, koin = 0 WHERE username = ? AND ended_at IS NULL'),
    selesai: db.prepare('UPDATE kerja_rounds SET ended_at = ?, score = ?, koin = ? WHERE id = ?'),
    // skor terbaik tiap warga (yang masih warga) dalam periode; seri = yang lebih dulu mencapainya
    board: db.prepare(`SELECT k.username, k.score, k.ended_at FROM kerja_rounds k
      JOIN residents r ON r.username = k.username AND r.status = 'approved'
      WHERE k.game = ? AND k.started_at >= ? AND k.started_at < ? AND k.score > 0
      ORDER BY k.score DESC, k.ended_at ASC`),
    juara: db.prepare('SELECT game, rank, username, score, koin FROM kerja_juara WHERE week = ? ORDER BY game, rank'),
    simpanJuara: db.prepare('INSERT OR IGNORE INTO kerja_juara (week, game, rank, username, score, koin) VALUES (?, ?, ?, ?, ?, ?)'),
    mingguSelesai: db.prepare('SELECT 1 FROM kerja_minggu WHERE week = ?'),
    tandaiMinggu: db.prepare('INSERT INTO kerja_minggu (week, done_at) VALUES (?, ?)'),
    kota: db.prepare('SELECT game, COALESCE(SUM(score), 0) AS total, COUNT(DISTINCT username) AS orang FROM kerja_rounds WHERE started_at >= ? AND ended_at IS NOT NULL GROUP BY game'),
  };
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };

  function jobKind(u) {
    const r = q.res.get(u, Date.now());
    if (!r) throw bad('Kamu belum jadi warga yang tiba di kota.', 403);
    return world.career(u, r.seq, r.arrive_at).kind;
  }
  const mult = (game, kind) => (GAMES[game].jobs.includes(kind) ? BONUS : 1);

  // daftar peringkat lengkap (satu baris per warga, skor terbaiknya)
  function papan(game, from, to = 8.64e15) {
    const seen = new Set(), out = [];
    for (const r of q.board.all(game, from, to)) {
      if (seen.has(r.username)) continue;
      seen.add(r.username);
      out.push({ rank: out.length + 1, u: r.username, score: r.score });
    }
    return out;
  }
  const posisi = (list, u) => { const r = list.find(x => x.u === u); return r ? { rank: r.rank, score: r.score, dari: list.length } : null; };

  // bagikan hadiah minggu yang sudah lewat (sekali per minggu, aman dipanggil berulang)
  function tutupMinggu(now = Date.now()) {
    const week = startOfWeekWib(now) - 7 * HARI;
    if (q.mingguSelesai.get(week)) return null;
    const hasil = tx(() => {
      const out = [];
      for (const game of Object.keys(GAMES)) {
        papan(game, week, week + 7 * HARI).slice(0, HADIAH.length).forEach(r => {
          const koin = HADIAH[r.rank - 1];
          q.simpanJuara.run(week, game, r.rank, r.u, r.score, koin);
          ekonomi.kredit(r.u, koin, 'juara', `Juara ${r.rank} ${GAMES[game].name} (${r.score} ${GAMES[game].unit})`, game);
          out.push({ game, ...r, koin });
        });
      }
      q.tandaiMinggu.run(week, now);
      return out;
    });
    if (hasil.length && kabar) {
      const baris = Object.keys(GAMES).map(g => {
        const j = hasil.filter(h => h.game === g);
        return j.length ? `${GAMES[g].name}: ${j.map(h => `${h.rank}. @${h.u} (${h.score})`).join(', ')}` : '';
      }).filter(Boolean);
      try {
        kabar.simpanPost({ kind: 'pengumuman', title: 'Juara Kerja minggu lalu', body: baris.join('\n') + `\nHadiah ${HADIAH.join(' / ')} koin sudah masuk dompet. Minggu baru dimulai, ayo rebut posisi!` });
      } catch (e) { console.error('[kerja] kabar juara gagal', e.message); }
    }
    return hasil;
  }

  try { tutupMinggu(); } catch (e) { console.error('[kerja] tutup minggu gagal', e); }
  setInterval(() => { try { tutupMinggu(); } catch (e) { console.error('[kerja] tutup minggu gagal', e); } }, 600e3).unref();

  return {
    GAMES,
    status(u) {
      const kind = jobKind(u), day = startOfDayWib();
      const h = q.hariIni.get(u, day);
      const best = Object.fromEntries(q.best.all(u, day).map(r => [r.game, r.best]));
      const week = startOfWeekWib();
      return {
        koinHariIni: h.koin, batas: KOIN_HARIAN, ronde: h.n, rondeMaks: RONDE_HARIAN,
        games: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { name: g.name, unit: g.unit, rate: g.rate, bonus: mult(k, kind) > 1, best: best[k] || 0, minggu: posisi(papan(k, week), u) }])),
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
    selesai(u, round, ev) {
      return tx(() => {
        const r = q.get.get(String(round || ''));
        if (!r || r.username !== u) throw bad('Ronde tidak ditemukan');
        if (r.ended_at) throw bad('Ronde ini sudah selesai');
        const now = Date.now(), elapsed = now - r.started_at;
        if (elapsed < (DURASI_S - 1.5) * 1000) throw bad('Ronde belum selesai');
        if (elapsed > 180e3) { q.selesai.run(now, 0, 0, r.id); throw bad('Ronde kedaluwarsa'); }
        const g = GAMES[r.game];
        // ketukan terakhir tidak boleh "di masa depan" menurut jam server (3 dtk hitung mundur + waktu main)
        const last = Array.isArray(ev) && ev.length ? ev[ev.length - 1] : null;
        const terlalu = Array.isArray(last) && (3 + last[0] / sim.HZ) * 1000 > elapsed + 1500;
        const hasil = terlalu ? null : sim.replay(r.game, r.seed, ev || []);
        if (!hasil || hasil.score > g.max) { q.selesai.run(now, 0, 0, r.id); throw bad('Ronde tidak sah, dibatalkan'); }
        const score = hasil.score, week = startOfWeekWib(now);
        const papanLama = papan(r.game, week), sebelum = posisi(papanLama, u);
        const m = mult(r.game, jobKind(u));
        const sudah = q.hariIni.get(u, startOfDayWib(now)).koin;
        const raw = Math.floor(score * g.rate * m);
        const koin = Math.max(0, Math.min(raw, KOIN_HARIAN - sudah));
        q.selesai.run(now, score, koin, r.id);
        if (koin > 0) ekonomi.kredit(u, koin, 'kerja', `${g.name}: ${score} ${g.unit}${m > 1 ? ' (bonus profesi)' : ''}`, r.game);
        const peringkat = score > 0 ? posisi(papan(r.game, week), u) : null;
        // kabari warga 10 besar yang baru saja tersalip (maks sekali per 6 jam per pelaku per pekerjaan)
        if (kabarku && peringkat) {
          for (const o of papanLama) {
            if (o.u === u || o.rank > 10 || o.rank >= (sebelum ? sebelum.rank : Infinity) || o.score >= score) continue;
            kabarku.tambah(o.u, 'disalip', `@${u} menyalipmu di papan ${g.name} minggu ini (${score} ${g.unit}). Kamu sekarang #${o.rank + 1}. Rebut lagi!`, `${r.game}|${u}`, 6 * 3600e3);
          }
        }
        return { score, koin, terpotong: koin < raw, bonus: m > 1, sisaHariIni: Math.max(0, KOIN_HARIAN - sudah - koin), peringkat, rekorBaru: score > 0 && (!sebelum || score > sebelum.score) };
      });
    },
    // papan peringkat publik: 10 besar per pekerjaan untuk hari ini / minggu ini + juara minggu lalu
    peringkat(periode) {
      const now = Date.now(), week = startOfWeekWib(now);
      const hari = periode === 'hari';
      const juaraLalu = {};
      for (const j of q.juara.all(week - 7 * HARI)) (juaraLalu[j.game] ||= []).push({ rank: j.rank, u: j.username, score: j.score, koin: j.koin });
      return {
        periode: hari ? 'hari' : 'minggu', now, mingguSelesai: week + 7 * HARI, hadiah: HADIAH,
        games: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => {
          const list = papan(k, hari ? startOfDayWib(now) : week);
          return [k, { name: g.name, unit: g.unit, top: list.slice(0, 10), peserta: list.length, juaraLalu: juaraLalu[k] || [] }];
        })),
      };
    },
    // juara minggu lalu per warga (lencana di peta): { username: [[game, rank], ...] }
    juaraLalu() {
      const out = {};
      for (const j of q.juara.all(startOfWeekWib() - 7 * HARI)) (out[j.username] ||= []).push([j.game, j.rank]);
      return out;
    },
    tutupMinggu,
    // hasil kerja seluruh kota hari ini
    kota() {
      const rows = Object.fromEntries(q.kota.all(startOfDayWib()).map(r => [r.game, r]));
      return Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, { name: g.name, unit: g.unit, total: rows[k]?.total || 0, orang: rows[k]?.orang || 0 }]));
    },
  };
}
