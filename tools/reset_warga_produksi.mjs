/**
 * AUDIRA-LAND: Reset data warga untuk tahap produksi.
 *
 *   node tools/reset_warga_produksi.mjs
 *
 * - Backup data lama ke backups/reset_warga_<tanggal>/ (sekali per tanggal, tidak ditimpa).
 * - live_buildings.json: buang semua bangunan milik warga (owner_kind 'warga') hasil scrape
 *   Netizenia. Sisa: bangunan negara/publik + proyek vital (tanpa pemilik).
 * - city_snapshot.json: kosongkan chat, berita, donasi, usulan, statistik warga, link donasi
 *   milik pihak lain; kas kembali ke kas awal seed (50.000 ₳).
 * - Ditulis ke web/data/ DAN web/public/data/ (dua salinan yang dipakai dev & rilis).
 *
 * Reset localStorage browser dilakukan klien sendiri lewat CITY_DATA_VERSION di web/index.html.
 * Reset database Supabase: supabase/reset_warga_produksi.sql.
 * Idempoten: aman dijalankan berulang.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const DIRS = [path.join(WEB, 'data'), path.join(WEB, 'public', 'data')];
const FILES = ['live_buildings.json', 'city_snapshot.json'];
const START_TREASURY = 50000; // = settings.city_treasury di supabase/schema.sql

const today = new Date().toISOString().slice(0, 10);
const backupDir = path.join(ROOT, 'backups', `reset_warga_${today}`);

// 1. Backup (hanya bila belum ada untuk tanggal ini, agar backup asli tidak tertimpa data hasil reset)
if (!fs.existsSync(backupDir)) {
    for (const dir of DIRS) {
        const rel = path.relative(WEB, dir);
        const dst = path.join(backupDir, rel);
        fs.mkdirSync(dst, { recursive: true });
        for (const f of FILES) {
            const src = path.join(dir, f);
            if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dst, f));
        }
    }
    console.log(`Backup: ${path.relative(ROOT, backupDir)}`);
} else {
    console.log(`Backup ${path.relative(ROOT, backupDir)} sudah ada, tidak ditimpa.`);
}

const nowIso = new Date().toISOString();

// Bangunan mengikuti jumlah warga: hunian & usaha pribadi (ruko, apartemen, kos, toko, PKL) dan
// proyek setengah jadi hasil scrape adalah milik warga Netizenia walau tercatat owner_kind 'negara'.
// Kota awal = fasilitas publik yang sudah jadi + proyek vital kota AUDIRA (id 'vital-*').
const PRIVATE_TYPES = new Set(['ruko', 'apartemen', 'kos', 'toko', 'pkl', 'rumah', 'rumah2', 'kafe', 'warung']);

function cleanBuildings(list) {
    return list.filter((b) => {
        if (String(b.id).startsWith('vital-')) return true;
        if (b.owner_kind === 'warga') return false;
        if (b.stage !== 'jadi') return false;
        return !PRIVATE_TYPES.has(b.type);
    });
}

function cleanSnapshot(s) {
    return {
        ...s,
        kas: START_TREASURY,
        now: nowIso,
        chat: [],
        news: [
            {
                at: nowIso,
                id: 1,
                kind: 'kota',
                text: 'AUDIRA-LAND resmi dibuka! Daftar jadi warga, pilih desa & profesi, rumahmu langsung dibangun.',
                actor: null
            }
        ],
        stats: {
            at: nowIso,
            cov: Object.fromEntries(Object.keys(s.stats?.cov || {}).map((k) => [k, 0])),
            pop: 0,
            npcs: 0,
            happy: 100,
            houses: 0,
            players: 0,
            projects: 0,
            buildings: 0,
            free_lots: s.stats?.free_lots ?? 0,
            building_now: 0
        },
        legacy: [],
        morale: 0,
        donations: [],
        proposals: [],
        district_proposals: [],
        announcements: [],
        saweria_url: '',
        donation_total: 0,
        districts: (s.districts || []).map((d) => ({ ...d, fill_pct: 0 }))
    };
}

for (const dir of DIRS) {
    const bPath = path.join(dir, 'live_buildings.json');
    const sPath = path.join(dir, 'city_snapshot.json');
    const before = JSON.parse(fs.readFileSync(bPath, 'utf8'));
    const after = cleanBuildings(before);
    fs.writeFileSync(bPath, JSON.stringify(after, null, 2));
    const snap = cleanSnapshot(JSON.parse(fs.readFileSync(sPath, 'utf8')));
    fs.writeFileSync(sPath, JSON.stringify(snap, null, 2));
    console.log(`${path.relative(ROOT, dir)}: bangunan ${before.length} -> ${after.length}, snapshot dibersihkan (kas ${START_TREASURY}).`);
}
