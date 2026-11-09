// AUDIRA LAND · server lokal: file statis + API warga. Tanpa dependensi npm.
// Jalankan: node server/server.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, statSync, createReadStream, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { openDb, createStore, normUsername } from './db.mjs';
import { acceptUpgrade } from './ws.mjs';
import { createTaman } from './taman.mjs';
import { createPesta } from './pesta.mjs';
import { createEkonomi } from './ekonomi.mjs';
import { loadWorld } from './world-node.mjs';
import { createKerja } from './kerja.mjs';
import { loadKerjaSim } from './kerja-sim-node.mjs';
import { createKabar } from './kabar.mjs';
import { createSponsor } from './sponsor.mjs';
import { createRadio } from './radio.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// ---------- konfigurasi (.env sederhana) ----------
const ENV_FILE = join(HERE, '.env');
const env = {};
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const cfg = k => process.env[k] ?? env[k];
if (!cfg('ADMIN_TOKEN')) {
  env.ADMIN_TOKEN = randomBytes(24).toString('base64url');
  writeFileSync(ENV_FILE, (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') + '\n' : '') + 'ADMIN_TOKEN=' + env.ADMIN_TOKEN + '\n');
  console.log('[audira] ADMIN_TOKEN baru dibuat dan disimpan di server/.env');
}
const PORT = +(cfg('PORT') || 5173);
const HOST = cfg('HOST') || '127.0.0.1';
const FERRY_EVERY_S = Math.max(30, +(cfg('FERRY_EVERY_S') || 300));
const FERRY_CAP = Math.max(1, +(cfg('FERRY_CAP') || 12));
const ADMIN_TOKEN = Buffer.from(cfg('ADMIN_TOKEN'));
// di belakang reverse proxy (Caddy/Nginx): pakai IP asli dari X-Forwarded-For untuk batas permintaan
const TRUST_PROXY = cfg('TRUST_PROXY') === '1';
const BACKUP_KEEP = Math.max(1, +(cfg('BACKUP_KEEP') || 14));

const db = openDb(join(HERE, 'data', 'audira.db'));
const store = createStore(db, { ferryEveryMs: FERRY_EVERY_S * 1000, ferryCap: FERRY_CAP });
const kabar = createKabar(db);
const sponsor = createSponsor(db);
const MEDIA_DIR = join(HERE, 'data', 'media');
const radio = createRadio(db, MEDIA_DIR);
const world = loadWorld(ROOT);

// ---------- kunci peta: rumah, kerja & gaji warga diturunkan dari js/world.js ----------
// Kalau peta/rumus berubah setelah ada warga, rumah & saldo semua warga ikut bergeser. Server menolak jalan
// kecuali IZINKAN_UBAH_PETA=1 (atau belum ada warga sama sekali).
{
  db.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
  const fp = world.fingerprint(), lama = db.prepare("SELECT v FROM meta WHERE k = 'peta'").get()?.v;
  const simpan = () => db.prepare("INSERT INTO meta (k, v) VALUES ('peta', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(fp);
  if (!lama || lama === fp || store.maxSeq() === 0) simpan();
  else if (cfg('IZINKAN_UBAH_PETA') === '1') { simpan(); console.warn('[audira] PERINGATAN: peta berubah setelah ada warga (IZINKAN_UBAH_PETA=1). Rumah, kerja & gaji warga ikut bergeser.'); }
  else {
    console.error('[audira] js/world.js berubah setelah ada warga. Ini akan memindah rumah, kerja, dan saldo semua warga.\n' +
      '  - Kembalikan perubahan peta, atau\n  - jalankan sekali dengan IZINKAN_UBAH_PETA=1 kalau memang disengaja, atau\n  - npm run seed:hapus bila masih data contoh.');
    process.exit(1);
  }
}
const ekonomi = createEkonomi(db, { world });
const kerja = createKerja(db, { world, ekonomi, sim: loadKerjaSim(ROOT), kabar });
const taman = createTaman({ store, map: JSON.parse(readFileSync(join(ROOT, 'js', 'taman-map.json'), 'utf8')), itemsOf: ekonomi.itemsOf });
const pesta = createPesta(db, { store, itemsOf: ekonomi.itemsOf, map: JSON.parse(readFileSync(join(ROOT, 'js', 'pesta-map.json'), 'utf8')) });

// ---------- helper ----------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function send(res, code, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(code, { ...SECURITY_HEADERS, 'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}
async function readJson(req, limit = 1 << 20) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('terlalu besar'), { code: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('JSON tidak valid'), { code: 400 }); }
}
async function readRaw(req, limit) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('File terlalu besar'), { code: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}
function isAdmin(req) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return false;
  const got = Buffer.from(m[1]);
  return got.length === ADMIN_TOKEN.length && timingSafeEqual(got, ADMIN_TOKEN);
}
function clientIp(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (xf.length) return xf[xf.length - 1];
  }
  return req.socket.remoteAddress || '?';
}
// batas permintaan per IP: maks n dalam jendela ms
const hits = new Map();
function limited(ip, key, n, ms) {
  const k = key + '|' + ip, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < ms);
  arr.push(now); hits.set(k, arr);
  return arr.length > n;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

function usernamesFrom(body) {
  const list = Array.isArray(body.usernames) ? body.usernames : typeof body.text === 'string' ? body.text.split(/[\s,;]+/) : [];
  const ok = [], bad = [];
  for (const raw of list.slice(0, 20000)) { if (!raw) continue; const u = normUsername(String(raw)); if (u) ok.push(u); else bad.push(String(raw).slice(0, 40)); }
  return { ok: [...new Set(ok)], bad };
}

// ---------- API ----------
async function api(req, res, url) {
  const ip = clientIp(req);
  const p = url.pathname, m = req.method;

  if (p === '/api/city' && m === 'GET') {
    const after = Math.max(0, Math.floor(+url.searchParams.get('after') || 0));
    return send(res, 200, { ...store.city(after), looks: ekonomi.looks(), juara: kerja.juaraLalu() }, { 'Cache-Control': 'public, max-age=10' });
  }

  // ----- dompet warga (header Authorization: Bearer <token sesi KTW>) -----
  if (p === '/api/butik' && m === 'GET') return send(res, 200, { items: ekonomi.ITEMS }, { 'Cache-Control': 'public, max-age=300' });
  if (p === '/api/kerja/kota' && m === 'GET') return send(res, 200, { kota: kerja.kota() }, { 'Cache-Control': 'public, max-age=20' });
  if (p === '/api/kerja/peringkat' && m === 'GET') return send(res, 200, kerja.peringkat(url.searchParams.get('p')), { 'Cache-Control': 'public, max-age=15' });
  if (p.startsWith('/api/kerja')) {
    const mt = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    const sess = mt ? store.session(mt[1]) : null;
    if (!sess) return send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW) supaya kerja dibayar.' });
    const a = p.slice('/api/kerja'.length);
    if (a === '' && m === 'GET') return send(res, 200, kerja.status(sess.username), { 'Cache-Control': 'no-store' });
    if (m !== 'POST') return send(res, 405, { error: 'Metode tidak didukung' });
    if (limited(ip, 'kerja', 40, 600e3)) return send(res, 429, { error: 'Terlalu cepat. Tunggu sebentar.' });
    const body = await readJson(req, 16384);
    if (a === '/mulai') return send(res, 200, kerja.mulai(sess.username, String(body.game || '')));
    if (a === '/selesai') return send(res, 200, kerja.selesai(sess.username, body.round, body.ev));
    return send(res, 404, { error: 'Tidak ditemukan' });
  }
  if (p.startsWith('/api/dompet')) {
    const mt = (req.headers.authorization || '').match(/^Bearer (.+)$/);
    const sess = mt ? store.session(mt[1]) : null;
    if (!sess) return send(res, 401, { error: 'Masuk sebagai warga dulu (kode KTW).' });
    const u = sess.username, a = p.slice('/api/dompet'.length);
    if (a === '' && m === 'GET') return send(res, 200, ekonomi.dompet(u), { 'Cache-Control': 'no-store' });
    if (m !== 'POST') return send(res, 405, { error: 'Metode tidak didukung' });
    if (limited(ip, 'dompet', 30, 60e3)) return send(res, 429, { error: 'Terlalu cepat. Tunggu sebentar.' });
    const body = await readJson(req, 4096);
    const lookChanged = r => { taman.setItems(u, r.items); pesta.setItems(u, r.items); return r; };
    if (a === '/absen') return send(res, 200, ekonomi.absen(u));
    if (a === '/beli') return send(res, 200, lookChanged(ekonomi.beli(u, String(body.item || ''))));
    if (a === '/pakai') return send(res, 200, lookChanged(ekonomi.pakai(u, String(body.slot || ''), body.item ? String(body.item) : null)));
    if (a === '/kirim') {
      const to = normUsername(body.to);
      if (!to) return send(res, 400, { error: 'Username penerima tidak valid' });
      return send(res, 200, ekonomi.kirim(u, to, body.amount, body.note));
    }
    return send(res, 404, { error: 'Tidak ditemukan' });
  }
  if (p === '/api/warga' && m === 'GET') {
    const u = normUsername(url.searchParams.get('u') || '');
    if (!u) return send(res, 400, { error: 'Username tidak valid' });
    return send(res, 200, { username: u, ...store.status(u) }, { 'Cache-Control': 'no-store' });
  }
  if (p === '/api/daftar' && m === 'POST') {
    if (limited(ip, 'daftar', 8, 600e3)) return send(res, 429, { error: 'Terlalu sering. Coba lagi 10 menit lagi.' });
    const body = await readJson(req, 4096);
    const u = normUsername(body.username);
    if (!u) return send(res, 400, { error: 'Username Instagram tidak valid' });
    if (body.setuju !== true) return send(res, 400, { error: 'Centang persetujuan dulu' });
    return send(res, 200, { username: u, ...store.register(u) });
  }
  if (p === '/api/radio' && m === 'GET') return send(res, 200, radio.publik(), { 'Cache-Control': 'no-store' });
  if (p === '/api/sponsor' && m === 'GET') return send(res, 200, sponsor.publik(), { 'Cache-Control': 'public, max-age=30' });
  if (p === '/api/sponsor/lihat' && m === 'POST') {
    const body = await readJson(req, 256);
    // satu tayangan per IP per sponsor per jam
    if (!limited(ip, 'lihat:' + (+body.id || 0), 1, 3600e3)) sponsor.lihat(body.id);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/sponsor/klik' && m === 'GET') {
    const id = +(url.searchParams.get('id') || 0);
    const link = sponsor.klik(id, !limited(ip, 'klik:' + id, 1, 3600e3));
    if (!link) return send(res, 404, 'Tautan sponsor tidak tersedia');
    res.writeHead(302, { ...SECURITY_HEADERS, Location: link, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    return res.end();
  }
  if (p === '/api/kabar' && m === 'GET') return send(res, 200, kabar.publik(), { 'Cache-Control': 'public, max-age=30' });
  if (p === '/api/pesta' && m === 'GET') return send(res, 200, { parties: pesta.aktif(), tema: pesta.TEMA, now: Date.now() }, { 'Cache-Control': 'no-store' });
  if (p === '/api/pesta/buka' && m === 'POST') {
    if (limited(ip, 'pesta', 10, 600e3)) return send(res, 429, { error: 'Terlalu sering. Coba lagi nanti.' });
    const body = await readJson(req, 4096);
    return send(res, 200, pesta.buka(body.token, body.theme));
  }
  if (p === '/api/pesta/tutup' && m === 'POST') {
    const body = await readJson(req, 4096);
    return send(res, 200, pesta.tutup(body.token));
  }
  if (p === '/api/taman' && m === 'GET') return send(res, 200, { online: taman.count() }, { 'Cache-Control': 'no-store' });
  if (p === '/api/masuk' && m === 'POST') {
    if (limited(ip, 'masuk', 10, 600e3)) return send(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi 10 menit lagi.' });
    const body = await readJson(req, 4096);
    const u = normUsername(body.username);
    const token = u && typeof body.kode === 'string' ? store.login(u, body.kode) : null;
    if (!token) return send(res, 401, { error: 'Username atau kode KTW salah.' });
    return send(res, 200, { username: u, token });
  }
  if (p === '/api/sesi/hapus' && m === 'POST') {
    const body = await readJson(req, 4096);
    store.logout(body.token || '');
    return send(res, 200, { ok: true });
  }
  if (p === '/api/keluar' && m === 'POST') {
    if (limited(ip, 'keluar', 5, 600e3)) return send(res, 429, { error: 'Terlalu sering. Coba lagi 10 menit lagi.' });
    const body = await readJson(req, 4096);
    const u = normUsername(body.username);
    if (!u) return send(res, 400, { error: 'Username Instagram tidak valid' });
    return send(res, 200, { username: u, ...store.requestLeave(u) });
  }

  // ----- admin -----
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) {
      limited(ip, 'admin-fail', 1000, 600e3);
      return send(res, 401, { error: 'Token admin salah' });
    }
    const a = p.slice('/api/admin/'.length);
    if (a === 'ringkas' && m === 'GET') return send(res, 200, { counts: store.counts(), pending: store.pending(500), leaving: store.leaving(), ferryEveryS: FERRY_EVERY_S, ferryCap: FERRY_CAP });
    if (a === 'cari' && m === 'GET') return send(res, 200, { rows: store.find((url.searchParams.get('q') || '').toLowerCase().slice(0, 40)) });
    if (a === 'kabar' && m === 'GET') return send(res, 200, kabar.semua());
    if (a === 'sponsor' && m === 'GET') return send(res, 200, sponsor.semua());
    if (a === 'radio' && m === 'GET') return send(res, 200, radio.semua());
    if (m !== 'POST') return send(res, 405, { error: 'Metode tidak didukung' });
    if (a === 'radio/unggah') {
      const sp = url.searchParams;
      const buf = await readRaw(req, 20 * 1024 * 1024 + 1);
      return send(res, 200, radio.unggah(buf, { title: sp.get('title'), artist: sp.get('artist'), duration: sp.get('duration'), license: sp.get('license') }));
    }
    const body = await readJson(req);
    if (a === 'kabar') return send(res, 200, kabar.simpanPost(body));
    if (a === 'kabar/hapus') return send(res, 200, { changed: kabar.hapusPost(body.id) });
    if (a === 'acara') return send(res, 200, kabar.simpanAcara(body));
    if (a === 'sponsor') return send(res, 200, sponsor.simpan(body));
    if (a === 'radio/atur') return send(res, 200, radio.atur(body));
    if (a === 'radio/ubah') return send(res, 200, radio.ubah(body));
    if (a === 'radio/hapus') return send(res, 200, { changed: radio.hapus(body.id) });
    if (a === 'sponsor/hapus') return send(res, 200, { changed: sponsor.hapus(body.id) });
    if (a === 'acara/hapus') return send(res, 200, { changed: kabar.hapusAcara(body.id) });
    const { ok, bad } = usernamesFrom(body);
    if (a === 'setujui') return send(res, 200, { approved: store.approve(ok, { instant: !!body.instant }), invalid: bad });
    if (a === 'tolak') return send(res, 200, { changed: store.reject(ok) });
    if (a === 'hapus') { taman.kick(ok); pesta.kick(ok); pesta.hapusHost(ok); return send(res, 200, { changed: store.remove(ok) }); }
    if (a === 'kode') { const kode = ok[0] ? store.issueCode(ok[0]) : null; return kode ? send(res, 200, { username: ok[0], kode }) : send(res, 400, { error: 'Hanya warga yang sudah disetujui yang bisa dapat kode KTW' }); }
    if (a === 'koin') return send(res, 200, ekonomi.beri(ok, body.amount, body.note));
    if (a === 'bisukan') { taman.mute(ok, !!body.on); pesta.mute(ok, !!body.on); return send(res, 200, { changed: store.setMuted(ok, !!body.on) }); }
    if (a === 'pertahankan') return send(res, 200, { changed: store.keep(ok) });
    if (a === 'impor') return send(res, 200, { ...store.importUsers(ok, { instant: !!body.instant }), invalid: bad });
  }
  return send(res, 404, { error: 'Tidak ditemukan' });
}

// ---------- file statis (hanya folder publik) ----------
const PUBLIC = ['index.html', 'admin.html', 'taman.html', 'pesta.html', 'kerja.html', 'css', 'js', 'assets'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  if (rel === 'admin') rel = 'admin.html';
  if (rel === 'taman') rel = 'taman.html';
  if (rel === 'pesta') rel = 'pesta.html';
  if (rel === 'kerja') rel = 'kerja.html';
  const top = rel.split('/')[0];
  const file = resolve(ROOT, rel);
  if (!PUBLIC.includes(top) || !file.startsWith(ROOT + sep)) return send(res, 404, 'Tidak ditemukan');
  let st;
  try { st = statSync(file); } catch { return send(res, 404, 'Tidak ditemukan'); }
  if (!st.isFile()) return send(res, 404, 'Tidak ditemukan');
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

// lagu radio: dukung Range supaya pemutar bisa lompat ke posisi siaran yang sedang berjalan
function serveMedia(req, res, url) {
  const name = url.pathname.slice('/media/'.length);
  if (!/^[A-Za-z0-9_-]{12}\.mp3$/.test(name)) return send(res, 404, 'Tidak ditemukan');
  const file = join(MEDIA_DIR, name);
  let st;
  try { st = statSync(file); } catch { return send(res, 404, 'Tidak ditemukan'); }
  const base = { ...SECURITY_HEADERS, 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
  const m = (req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : st.size - +m[2], end = m[1] && m[2] ? +m[2] : st.size - 1;
    end = Math.min(end, st.size - 1);
    if (start < 0 || start > end) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Metode tidak didukung');
    if (url.pathname.startsWith('/media/')) return serveMedia(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    if (!e.code || typeof e.code !== 'number') console.error(e);
    send(res, typeof e.code === 'number' ? e.code : 500, { error: typeof e.code === 'number' ? e.message : 'Kesalahan server' });
  }
});
// WebSocket taman: hanya dari halaman situs ini sendiri (cegah pembajakan lintas situs)
server.on('upgrade', (req, socket) => {
  socket.on('error', () => {});
  const url = new URL(req.url, 'http://x');
  let originOk = false;
  try { originOk = new URL(req.headers.origin).host === req.headers.host; } catch { /* tanpa origin */ }
  if (url.pathname !== '/ws/taman' || !originOk) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const conn = acceptUpgrade(req, socket, { maxPayload: 2048 });
  if (!conn) return;
  const roomName = url.searchParams.get('room') || 'taman';
  if (roomName === 'taman') return taman.handle(conn);
  const host = roomName.startsWith('pesta:') ? normUsername(roomName.slice(6)) : null;
  const room = host && pesta.room(host);
  if (room) return room.handle(conn);
  conn.send(JSON.stringify({ t: 'err', m: 'Pesta ini sudah selesai atau tidak ada.', fatal: 1 }));
  conn.close(4002);
});
// ---------- cadangan database harian (VACUUM INTO, aman saat server jalan) ----------
const BACKUP_DIR = join(HERE, 'data', 'backup');
function backup() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const file = join(BACKUP_DIR, `audira-${day}.db`);
  if (existsSync(file)) return null;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = readdirSync(BACKUP_DIR).filter(f => /^audira-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -BACKUP_KEEP);
  for (const f of old) rmSync(join(BACKUP_DIR, f), { force: true });
  console.log('[audira] cadangan database:', file);
  return file;
}
try { backup(); } catch (e) { console.error('[audira] cadangan gagal', e.message); }
setInterval(() => { try { backup(); } catch (e) { console.error('[audira] cadangan gagal', e.message); } }, 3600e3).unref();

// berhenti rapi (systemd/Docker kirim SIGTERM): tutup koneksi lalu database
function stop(sig) {
  console.log(`[audira] ${sig}: berhenti…`);
  server.close();
  setTimeout(() => { try { db.close(); } catch { /* sudah tertutup */ } process.exit(0); }, 500).unref();
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log(`[audira] AUDIRA LAND jalan di http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}  (admin: /admin)  kapal tiap ${FERRY_EVERY_S} dtk, maks ${FERRY_CAP} warga`);
});
