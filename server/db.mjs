// AUDIRA LAND · database warga (SQLite bawaan Node, tanpa dependensi).
// Skema sama dengan Cloudflare D1, jadi bisa dipindah tanpa ubah SQL.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS residents (
      username   TEXT PRIMARY KEY,          -- username Instagram, huruf kecil
      seq        INTEGER UNIQUE,            -- urutan jadi warga; menentukan rumah & kerja di klien. NULL sampai disetujui
      status     TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | removed
      source     TEXT NOT NULL,             -- daftar | import | demo
      ferry      INTEGER NOT NULL DEFAULT 1,-- 1 = tiba naik kapal, 0 = langsung jadi warga
      arrive_at  INTEGER,                   -- ms epoch, waktu kapal sandar
      created_at INTEGER NOT NULL,
      leave_req  INTEGER NOT NULL DEFAULT 0 -- 1 = minta keluar dari kota
    );
    CREATE INDEX IF NOT EXISTS idx_res_status ON residents(status, arrive_at);
    CREATE INDEX IF NOT EXISTS idx_res_seq ON residents(seq);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,           -- sha256 token sesi taman; token asli hanya di perangkat warga
      username   TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(username);
  `);
  // migrasi kolom baru (aman dijalankan berulang)
  const cols = new Set(db.prepare('PRAGMA table_info(residents)').all().map(c => c.name));
  if (!cols.has('claim_hash')) db.exec('ALTER TABLE residents ADD COLUMN claim_hash TEXT');   // sha256 kode KTW
  if (!cols.has('muted')) db.exec('ALTER TABLE residents ADD COLUMN muted INTEGER NOT NULL DEFAULT 0');
  return db;
}

// username Instagram: 1–30 karakter huruf/angka/titik/garis bawah, tanpa titik di awal/akhir atau ganda
const IG_RE = /^(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/;
export function normUsername(raw) {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().replace(/^@+/, '').toLowerCase();
  return IG_RE.test(u) ? u : null;
}

const sha = s => createHash('sha256').update(s).digest('hex');

export function createStore(db, { ferryEveryMs, ferryCap, leadMs = 30000 }) {
  const q = {
    get: db.prepare('SELECT * FROM residents WHERE username = ?'),
    insert: db.prepare('INSERT INTO residents (username, status, source, ferry, created_at) VALUES (?, ?, ?, ?, ?)'),
    repend: db.prepare("UPDATE residents SET status = 'pending', seq = NULL, arrive_at = NULL, leave_req = 0, source = ? WHERE username = ?"),
    maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM residents'),
    slotCount: db.prepare("SELECT COUNT(*) AS c FROM residents WHERE status = 'approved' AND ferry = 1 AND arrive_at = ?"),
    approve: db.prepare("UPDATE residents SET status = 'approved', seq = ?, arrive_at = ?, ferry = ? WHERE username = ?"),
    setStatus: db.prepare('UPDATE residents SET status = ?, leave_req = 0 WHERE username = ?'),
    leave: db.prepare("UPDATE residents SET leave_req = 1 WHERE username = ? AND status IN ('approved', 'pending')"),
    city: db.prepare("SELECT seq, username, arrive_at, ferry FROM residents WHERE status = 'approved' ORDER BY seq"),
    pending: db.prepare("SELECT username, source, created_at FROM residents WHERE status = 'pending' ORDER BY created_at LIMIT ?"),
    leaving: db.prepare('SELECT username, status, seq FROM residents WHERE leave_req = 1 ORDER BY username'),
    counts: db.prepare('SELECT status, COUNT(*) AS c FROM residents GROUP BY status'),
    find: db.prepare("SELECT username, seq, status, source, ferry, arrive_at, created_at, leave_req, muted, claim_hash IS NOT NULL AS has_code FROM residents WHERE username LIKE ? ESCAPE '\\' ORDER BY username LIMIT 30"),
  };

  const tx = fn => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  // jadwal kapal: slot tetap tiap ferryEveryMs, maks ferryCap warga per kapal
  function nextSlot(taken) {
    let t = Math.ceil((Date.now() + leadMs) / ferryEveryMs) * ferryEveryMs;
    for (;;) {
      const c = q.slotCount.get(t).c + (taken.get(t) || 0);
      if (c < ferryCap) { taken.set(t, (taken.get(t) || 0) + 1); return t; }
      t += ferryEveryMs;
    }
  }

  function publicStatus(row) {
    if (!row) return { status: 'none' };
    if (row.status === 'approved') {
      const arrived = row.arrive_at <= Date.now();
      return { status: arrived ? 'resident' : 'scheduled', arriveAt: row.arrive_at, seq: row.seq, leaveRequested: !!row.leave_req };
    }
    return { status: row.status, leaveRequested: !!row.leave_req };
  }

  return {
    status: u => publicStatus(q.get.get(u)),

    register(u) {
      const row = q.get.get(u);
      if (!row) { q.insert.run(u, 'pending', 'daftar', 1, Date.now()); return { created: true, ...publicStatus(q.get.get(u)) }; }
      if (row.status === 'removed') { q.repend.run('daftar', u); return { created: true, ...publicStatus(q.get.get(u)) }; }
      return { created: false, ...publicStatus(row) };
    },

    requestLeave(u) {
      const r = q.leave.run(u);
      return { ok: r.changes > 0, ...publicStatus(q.get.get(u)) };
    },

    // setujui pendaftar: beri nomor urut & kursi kapal (atau langsung jadi warga)
    approve(usernames, { instant = false } = {}) {
      return tx(() => {
        let seq = q.maxSeq.get().m;
        const taken = new Map(), out = [];
        for (const u of usernames) {
          const row = q.get.get(u);
          if (!row || row.status !== 'pending') continue;
          const at = instant ? Date.now() - 1000 : nextSlot(taken);
          q.approve.run(++seq, at, instant ? 0 : 1, u);
          out.push({ username: u, seq, arriveAt: at });
        }
        return out;
      });
    },

    // impor massal (mis. dari daftar pendaftar formulir lain): langsung disetujui
    importUsers(usernames, { instant = false, source = 'import' } = {}) {
      return tx(() => {
        let seq = q.maxSeq.get().m, added = 0, skipped = 0;
        const taken = new Map();
        for (const u of usernames) {
          const row = q.get.get(u);
          if (row && row.status !== 'removed') { skipped++; continue; }
          if (row) q.repend.run(source, u); else q.insert.run(u, 'pending', source, 1, Date.now());
          const at = instant ? Date.now() - 1000 : nextSlot(taken);
          q.approve.run(++seq, at, instant ? 0 : 1, u);
          added++;
        }
        return { added, skipped };
      });
    },

    // ---------- kode KTW & sesi taman ----------
    issueCode(u) {
      const row = q.get.get(u);
      if (!row || row.status !== 'approved') return null;
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += A[randomInt(A.length)];
      db.prepare('UPDATE residents SET claim_hash = ? WHERE username = ?').run(sha(code), u);
      return code;
    },
    login(u, code) {
      const row = q.get.get(u);
      if (!row || row.status !== 'approved' || !row.claim_hash || row.arrive_at > Date.now()) return null;
      const a = Buffer.from(row.claim_hash), b = Buffer.from(sha(String(code).trim().toUpperCase()));
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions (token_hash, username, created_at) VALUES (?, ?, ?)').run(sha(token), u, Date.now());
      return token;
    },
    session(token) {
      if (typeof token !== 'string' || token.length > 100) return null;
      return db.prepare(`SELECT s.username, r.muted FROM sessions s JOIN residents r ON r.username = s.username
        WHERE s.token_hash = ? AND r.status = 'approved' AND r.arrive_at <= ?`).get(sha(token), Date.now()) || null;
    },
    logout: token => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(String(token))).changes,
    setMuted: (us, on) => tx(() => us.reduce((n, u) => n + db.prepare('UPDATE residents SET muted = ? WHERE username = ?').run(on ? 1 : 0, u).changes, 0)),

    reject: us => tx(() => us.reduce((n, u) => n + q.setStatus.run('rejected', u).changes, 0)),
    remove: us => tx(() => us.reduce((n, u) => {
      db.prepare('DELETE FROM sessions WHERE username = ?').run(u);
      db.prepare('UPDATE residents SET claim_hash = NULL WHERE username = ?').run(u);
      return n + q.setStatus.run('removed', u).changes;
    }, 0)),
    keep: us => tx(() => us.reduce((n, u) => n + db.prepare('UPDATE residents SET leave_req = 0 WHERE username = ?').run(u).changes, 0)),

    city() {
      const now = Date.now(), residents = [], queue = [];
      for (const r of q.city.all()) {
        const row = [r.seq, r.username, r.arrive_at, r.ferry];
        (r.arrive_at <= now ? residents : queue).push(row);
      }
      return { v: 1, now, every: ferryEveryMs, cap: ferryCap, residents, queue };
    },

    pending: (limit = 200) => q.pending.all(limit),
    leaving: () => q.leaving.all(),
    counts() {
      const out = { pending: 0, approved: 0, rejected: 0, removed: 0 };
      for (const r of q.counts.all()) out[r.status] = r.c;
      return out;
    },
    find: s => q.find.all('%' + s.replace(/[\\%_]/g, m => '\\' + m) + '%'),
  };
}
