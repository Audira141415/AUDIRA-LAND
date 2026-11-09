// AUDIRA LAND · isi data contoh untuk uji coba lokal.
//   node server/seed.mjs              → 1.000 warga contoh (langsung jadi warga)
//   node server/seed.mjs --n 300      → jumlah lain
//   node server/seed.mjs --antre 20   → tambah 20 warga contoh yang datang naik kapal berikutnya
//   node server/seed.mjs --hapus      → hapus semua data contoh (source = 'demo')
// Data contoh ditandai source='demo' supaya tidak tercampur dengan warga asli.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { openDb, createStore } from './db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const envTxt = existsSync(join(HERE, '.env')) ? readFileSync(join(HERE, '.env'), 'utf8') : '';
const envNum = (k, d) => +(process.env[k] || (envTxt.match(new RegExp('^' + k + '=(\\d+)', 'm')) || [])[1] || d);

const db = openDb(join(HERE, 'data', 'audira.db'));
const store = createStore(db, { ferryEveryMs: Math.max(30, envNum('FERRY_EVERY_S', 300)) * 1000, ferryCap: envNum('FERRY_CAP', 12) });

if (args.includes('--hapus')) {
  const r = db.prepare("DELETE FROM residents WHERE source = 'demo'").run();
  console.log(`Dihapus ${r.changes} warga contoh.`);
  process.exit(0);
}

// generator nama mirip username Instagram (acak terkendali)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SA = ['ra', 'di', 'an', 'sa', 'tri', 'bu', 'na', 'ri', 'ka', 'lu', 'ma', 'ya', 'fe', 'gi', 'ze', 'ar', 'in', 'do', 'wi', 'ta', 'ne', 'yu', 'fa', 'al', 'de', 'li'];
const SB = ['ka', 'ni', 'yo', 'ra', 'sti', 'la', 'ma', 'tu', 'ri', 'nda', 'sa', 'fi', 'na', 'ta', 'dy', 'yu', 'ko', 'rin'];
const SUF = ['', '', '', '_', '.', '_id', '.official', 'xx', 'zz', '.jkt', '.sby', '_art', '.dev', '_99', '.mlg', '.bdg'];
const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];
const base = db.prepare('SELECT COUNT(*) AS c FROM residents').get().c;
function name(i) {
  const r = rng(i * 2654435761 + 17);
  let s = pick(SA, r) + pick(SB, r) + (r() < 0.5 ? pick(SB, r) : '');
  if (r() < 0.3) s += (r() < 0.5 ? '_' : '.') + pick(SA, r) + pick(SB, r);
  s += pick(SUF, r);
  if (r() < 0.35) s += Math.floor(r() * 99);
  return s.replace(/\.$/, '') || 'warga' + i;
}

const antre = +arg('--antre', 0);
const n = antre ? 0 : +arg('--n', 1000);
const names = [];
const exists = db.prepare('SELECT 1 FROM residents WHERE username = ?');
const seen = new Set();
for (let i = base; names.length < (antre || n); i++) {
  const u = name(i);
  if (!seen.has(u) && !exists.get(u)) { seen.add(u); names.push(u); }
}

if (antre) {
  const r = store.importUsers(names, { source: 'demo' });
  console.log(`Antre kapal: ${r.added} warga contoh (lewati ${r.skipped}).`);
} else {
  // warga lama: tanggal tiba disebar sejak 1 Sep 2026, makin rapat mendekati hari ini
  const r = store.importUsers(names, { instant: true, source: 'demo' });
  const EPOCH = Date.UTC(2026, 8, 1), now = Date.now();
  const rows = db.prepare("SELECT username FROM residents WHERE source = 'demo' AND ferry = 0 ORDER BY seq").all();
  const upd = db.prepare('UPDATE residents SET arrive_at = ? WHERE username = ?');
  db.exec('BEGIN');
  rows.forEach((row, k) => upd.run(Math.round(EPOCH + (now - EPOCH - 3600e3) * Math.pow((k + 1) / rows.length, 0.6)), row.username));
  db.exec('COMMIT');
  console.log(`Warga contoh: ${r.added} ditambahkan (lewati ${r.skipped}).`);
}
