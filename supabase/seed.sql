-- =============================================================================
-- AUDIRA-LAND: Seed Data Inisial (Tahap 01)
-- Idempotent: Aman dijalankan berulang kali tanpa membuat duplikasi data.
-- =============================================================================

-- 1. PENGATURAN GLOBAL KOTA
insert into public.settings (
    id, grid_version, city_name, city_treasury, daily_tax, daily_coin_cap,
    vote_quorum, vote_duration_hours, donation_target, donation_collected, announcement
)
values (
    1, 1, 'AUDIRA-LAND', 50000, 10, 300, 5, 24, 1000000, 0,
    'Selamat datang di AUDIRA-LAND! Bangun kavlingmu dan ikut voting kota.'
)
on conflict (id) do update set
    city_name = excluded.city_name,
    daily_tax = excluded.daily_tax,
    daily_coin_cap = excluded.daily_coin_cap,
    vote_quorum = excluded.vote_quorum,
    vote_duration_hours = excluded.vote_duration_hours,
    announcement = excluded.announcement;

-- 2. DAFTAR 25 DISTRIK (GRID 5x5)
insert into public.districts (key, name, ring, unlock_cost, is_unlocked, unlocked_at)
values
    ('k00', 'Pesisir Sunda Kelapa', 2, 75000, false, null),
    ('k01', 'Ancol Bahari', 2, 75000, false, null),
    ('k02', 'Marunda Maritim', 2, 75000, false, null),
    ('k03', 'Tanjung Priok', 2, 75000, false, null),
    ('k04', 'Muara Karang', 2, 75000, false, null),
    ('k05', 'Bukit Cinere', 2, 50000, false, null),
    ('k06', 'Taman Suropati', 1, 25000, false, null),
    ('k07', 'Pasar Beringharjo', 1, 20000, false, null),
    ('k08', 'Menteng Boulevard', 1, 25000, false, null),
    ('k09', 'Pulo Gadung Industri', 2, 50000, false, null),
    ('k10', 'Cipete Kopi Raya', 2, 50000, false, null),
    ('k11', 'Kampung Kreatif', 1, 20000, false, null),
    ('k12', 'Alun-Alun Merdeka', 0, 0, true, now()),
    ('k13', 'Sentra Cyberpunk', 1, 25000, false, null),
    ('k14', 'Senopati Hub', 2, 50000, false, null),
    ('k15', 'Bintaro Hijau', 2, 50000, false, null),
    ('k16', 'Braga Heritage', 1, 20000, false, null),
    ('k17', 'Malioboro Walk', 1, 20000, false, null),
    ('k18', 'Tebet Eco Park', 1, 25000, false, null),
    ('k19', 'Cikini Klasik', 2, 50000, false, null),
    ('k20', 'Agrowisata Cisarua', 2, 75000, false, null),
    ('k21', 'Lembah Salak', 2, 75000, false, null),
    ('k22', 'Sentul Sirkuit', 2, 75000, false, null),
    ('k23', 'Parung Rimbun', 2, 75000, false, null),
    ('k24', 'Sawangan Botanical', 2, 75000, false, null)
on conflict (key) do update set
    name = excluded.name,
    ring = excluded.ring,
    unlock_cost = excluded.unlock_cost,
    is_unlocked = excluded.is_unlocked;

-- 3. BANGUNAN PERDANA DI DISTRIK PUSAT (k12 - Alun-Alun Merdeka)
insert into public.buildings (
    district_key, grid_i, grid_j, width, height, type, stage,
    build_hours_total, is_public, is_protected, build_started_at, build_finished_at
)
values
    ('k12', 16, 16, 2, 2, 'balai_kota', 'selesai', 0.0, true, true, now(), now()),
    ('k12', 14, 16, 1, 1, 'warung_madura', 'selesai', 0.0, true, false, now(), now()),
    ('k12', 16, 14, 1, 1, 'taman_surya', 'selesai', 0.0, true, false, now(), now()),
    ('k12', 18, 16, 1, 1, 'pos_ronda', 'selesai', 0.0, true, false, now(), now())
on conflict (district_key, grid_i, grid_j) do nothing;

-- 4. PENGUMUMAN BERITA KOTA PERDANA
insert into public.news (category, message)
select d.cat, d.msg
from (values
    ('kota', 'Selamat datang di AUDIRA-LAND! Kota digital Desa Have & Desa Have-Not resmi dibuka untuk seluruh netizen.'),
    ('pembangunan', 'Alun-Alun Merdeka (Distrik k12) telah resmi menjadi pusat pemerintahan dan aktivitas perdana warga.'),
    ('ekonomi', 'Kas perbendaharaan kota telah disiapkan 50.000 ₳ untuk subsidi pembangunan fasilitas umum.'),
    ('voting', 'Balai musyawarah terbuka 24 jam untuk usulan pembangunan publik secara demokratis.')
) as d(cat, msg)
where not exists (
    select 1 from public.news where news.message = d.msg
);

-- 5. BERSIHKAN CACHE SNAPSHOT AGAR DATA TERBARU LANGSUNG TAYANG
delete from public.rpc_cache where key in ('city_snapshot', 'dist_bld_k12');
