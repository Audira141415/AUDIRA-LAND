-- =============================================================================
-- AUDIRA-LAND: Fondasi Database PostgreSQL (Tahap 01 - All-in-One Idempotent)
-- Mengadopsi Pola Arsitektur Republik Netizenia v2 (Zero-Server-Cost)
-- Aman dijalankan ulang di SQL Editor Supabase kapan saja tanpa merusak data!
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABEL INTI SISTEM
-- -----------------------------------------------------------------------------

-- Pengaturan Global Kota (Hanya 1 baris, id = 1)
create table if not exists public.settings (
    id int primary key default 1 check (id = 1),
    grid_version int not null default 1,
    city_name text not null default 'AUDIRA-LAND',
    city_treasury bigint not null default 50000,
    daily_tax int not null default 10,
    daily_coin_cap int not null default 300,
    vote_quorum int not null default 5,
    vote_duration_hours int not null default 24,
    donation_target bigint not null default 1000000,
    donation_collected bigint not null default 0,
    announcement text default 'Selamat datang di AUDIRA-LAND! Bangun kavlingmu dan ikut voting kota.',
    updated_at timestamptz default now()
);

-- Kendali dunia dari Panel Pengelola (cuaca, waktu, acara, kunci fitur). Lihat docs/SPEC_ADMIN_ULTIMATE.md.
alter table public.settings add column if not exists city_controls jsonb not null default '{}'::jsonb;

-- Profil Pemain Warga (Terkait ke auth.users Supabase)
create table if not exists public.players (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique check (length(username) >= 2 and length(username) <= 31),
    profession text not null default 'Warga',
    village text check (village in ('have', 'have_not')),
    coins int not null default 250 check (coins >= 0),
    role text not null default 'warga' check (role in ('warga', 'arsitek', 'walikota')),
    avatar_color text not null default '#5B3A24',
    avatar_data text check (avatar_data is null or length(avatar_data) <= 60000),  -- data URL foto profil unggahan warga (≤30 KB → ±40 KB base64); null = pakai inisial
    total_worked int not null default 0,
    last_worked_at timestamptz,
    last_tax_paid_at timestamptz default now(),
    created_at timestamptz default now()
);

-- Migrasi idempoten untuk database lama: desa tempat tinggal + username IG ('@' + 30 karakter)
alter table public.players add column if not exists village text;
do $$
begin
    alter table public.players drop constraint if exists players_username_check;
    alter table public.players add constraint players_username_check
        check (length(username) >= 2 and length(username) <= 31);
    if not exists (select 1 from pg_constraint where conname = 'players_village_check') then
        alter table public.players add constraint players_village_check
            check (village in ('have', 'have_not'));
    end if;
end $$;

-- Foto profil unggahan warga (data URL WebP/JPEG ≤30 KB), agar tampil lintas-perangkat.
alter table public.players add column if not exists avatar_data text;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'players_avatar_data_check') then
        alter table public.players add constraint players_avatar_data_check
            check (avatar_data is null or length(avatar_data) <= 60000);
    end if;
end $$;

-- Moderasi pengelola: bisukan chat sampai waktu tertentu, bekukan akun.
alter table public.players add column if not exists muted_until timestamptz;
alter table public.players add column if not exists banned boolean not null default false;

-- Rumah & kendaraan warga per desa × profesi (sama dengan web/src/core/home_catalog.js).
-- Model = id Polyfork di web/public/models/polyfork/<id>.glb. Server memakai tabel ini, bukan kiriman klien.
create table if not exists public.home_kits (
    village text not null check (village in ('have', 'have_not')),
    profession text not null,
    house_model text not null,
    house_label text not null,
    vehicle_model text not null,
    vehicle_label text not null,
    vehicle_len numeric not null check (vehicle_len > 0 and vehicle_len <= 6),
    primary key (village, profession)
);
-- Profesi berbeda per desa (Have: layanan kota, Have-Not: pekerjaan desa); kombinasi lama dibuang.
delete from public.home_kits where (village, profession) not in (
    ('have','dokter'),('have','perawat'),('have','polisi'),('have','pemadam'),('have','guru'),
    ('have','pedagang'),('have','koki'),('have','programmer'),('have','seniman'),
    ('have_not','petani'),('have_not','nelayan'),('have_not','kuli'),('have_not','peternak'),
    ('have_not','pedagang_keliling'),('have_not','ojek'),('have_not','pengrajin'),('have_not','buruh'));
insert into public.home_kits (village, profession, house_model, house_label, vehicle_model, vehicle_label, vehicle_len) values
    ('have', 'dokter', 'two-storey-family-house-c63c4a', 'Rumah Dokter 2 Lantai', 'ambulance-van-29919a', 'Ambulans', 4.8),
    ('have', 'perawat', 'split-level-house-40fe1a', 'Rumah Split-Level', 'motorcycle-and-sidecar-7d39b8', 'Motor Sespan', 2.4),
    ('have', 'polisi', 'colonial-house-d6f8fd', 'Rumah Dinas Polisi', 'police-cruiser-a2d25e', 'Mobil Patroli', 4.4),
    ('have', 'pemadam', 'brownstone-row-house-1b84fd', 'Rumah Bata Pemadam', 'fire-engine-7d476b', 'Mobil Damkar', 5.6),
    ('have', 'guru', 'two-story-house-40f6dc', 'Rumah Guru', 'family-minivan-924de0', 'Mobil Keluarga', 4.5),
    ('have', 'pedagang', 'three-storey-shophouse-2f6378', 'Ruko 3 Lantai', 'boxy-delivery-van-a3ceae', 'Van Barang', 4.6),
    ('have', 'koki', 'corner-restaurant-unit-d85304', 'Rumah Makan', 'food-truck-3c4e0e', 'Food Truck', 5.0),
    ('have', 'programmer', 'cast-iron-loft-b04b5a', 'Loft Kota', 'wheeled-city-coupe-5c381e', 'Mobil Kota', 4.0),
    ('have', 'seniman', 'gantry-loft-8da389', 'Loft Studio Seni', 'skate-team-tour-van-fb3c89', 'Van Seniman', 4.8),
    ('have_not', 'petani', 'thatched-cottage-0e63f5', 'Pondok Tani Jerami', 'ox-cart-9c857f', 'Gerobak Sapi', 4.2),
    ('have_not', 'nelayan', 'fisherman-shack-ea9b2b', 'Gubuk Nelayan', 'wooden-rowboat-916981', 'Perahu Dayung', 3.6),
    ('have_not', 'kuli', 'site-cabin-e9ee10', 'Bedeng Kuli', 'wooden-hand-cart-3ae5b5', 'Gerobak Dorong', 2.0),
    ('have_not', 'peternak', 'log-cabin-4fac3b', 'Rumah Kayu Peternak', 'three-wheeled-delivery-mini-744094', 'Motor Angkut Pakan', 3.2),
    ('have_not', 'pedagang_keliling', 'open-front-teahouse-c7dd18', 'Warung Rumahan', 'elote-cart-a8fb49', 'Gerobak Jajanan', 2.2),
    ('have_not', 'ojek', 'crossing-keeper-s-cottage-de49a4', 'Rumah Petak', 'touring-motorcycle-3b1ad3', 'Motor Ojek', 2.3),
    ('have_not', 'pengrajin', 'plate-cottage-9b52be', 'Pondok Pengrajin', 'flower-bicycle-284d0e', 'Sepeda Keranjang', 1.9),
    ('have_not', 'buruh', 'porch-front-cottage-620c29', 'Rumah Kontrakan', 'city-bicycle-5b67d1', 'Sepeda Ontel', 1.8)
on conflict (village, profession) do update set
    house_model = excluded.house_model, house_label = excluded.house_label,
    vehicle_model = excluded.vehicle_model, vehicle_label = excluded.vehicle_label,
    vehicle_len = excluded.vehicle_len;

alter table public.home_kits enable row level security;
drop policy if exists "home_kits dibaca semua" on public.home_kits;
create policy "home_kits dibaca semua" on public.home_kits for select using (true);

-- Kit yang didapat warga (diisi register_player dari home_kits)
alter table public.players add column if not exists house_model text;
alter table public.players add column if not exists house_label text;
alter table public.players add column if not exists vehicle_model text;
alter table public.players add column if not exists vehicle_label text;

-- Distrik Kota (Grid 5x5: k00 s/d k24, total 25 distrik)
create table if not exists public.districts (
    key text primary key check (key ~ '^k(0[0-9]|1[0-9]|2[0-4])$'),
    name text not null,
    ring int not null check (ring in (0, 1, 2)),
    unlock_cost bigint not null default 25000,
    is_unlocked boolean not null default false,
    unlocked_at timestamptz,
    created_at timestamptz default now()
);

-- Bangunan & Kavling Deterministik
create table if not exists public.buildings (
    id uuid primary key default gen_random_uuid(),
    district_key text not null references public.districts(key),
    grid_i int not null check (grid_i >= 0 and grid_i < 216),   -- kolom global klien (0..215)
    grid_j int not null check (grid_j >= 0 and grid_j < 216),
    width int not null default 1 check (width >= 1 and width <= 4),
    height int not null default 1 check (height >= 1 and height <= 4),
    type text not null,
    owner_id uuid references public.players(id) on delete set null,
    stage text not null default 'sketsa' check (stage in ('sketsa', 'proyek', 'selesai')),
    build_hours_total numeric not null default 4.0,
    build_started_at timestamptz default now(),
    build_finished_at timestamptz,
    acceleration_count int not null default 0,
    is_public boolean not null default false,
    is_protected boolean not null default false,
    created_at timestamptz default now(),
    constraint uq_building_plot unique (district_key, grid_i, grid_j)
);

-- Rumah awal warga: model rumah & kendaraan dari home_kits (register_home)
alter table public.buildings add column if not exists pf_house text;
alter table public.buildings add column if not exists pf_vehicle text;
alter table public.buildings add column if not exists vehicle_len numeric;
create unique index if not exists uq_buildings_one_home_per_owner
    on public.buildings (owner_id) where pf_house is not null;

-- Usulan Bangunan Publik (Gotong Royong & Demokrasi)
create table if not exists public.proposals (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    building_type text not null,
    district_key text not null references public.districts(key),
    grid_i int not null,
    grid_j int not null,
    proposer_id uuid references public.players(id),
    votes_yes int not null default 0,
    votes_no int not null default 0,
    quorum int not null default 5,
    status text not null default 'voting' check (status in ('voting', 'disetujui', 'ditolak', 'dibangun')),
    expires_at timestamptz not null default (now() + interval '24 hours'),
    created_at timestamptz default now()
);

-- Suara Voting Pemain (1 Suara per Pemain per Usulan)
create table if not exists public.proposal_votes (
    proposal_id uuid references public.proposals(id) on delete cascade,
    player_id uuid references public.players(id) on delete cascade,
    vote boolean not null,
    created_at timestamptz default now(),
    primary key (proposal_id, player_id)
);

-- Log Riwayat Kerja Pemain
create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    player_id uuid references public.players(id) on delete cascade,
    building_id uuid references public.buildings(id) on delete set null,
    reward_coins int not null,
    worked_at timestamptz default now()
);

-- Ticker Berita Kota Otomatis
create table if not exists public.news (
    id bigint generated always as identity primary key,
    category text not null default 'kota',
    message text not null,
    created_at timestamptz default now()
);

-- Live Chat Kota Antar Warga
create table if not exists public.chat (
    id bigint generated always as identity primary key,
    player_id uuid references public.players(id) on delete set null,
    player_name text not null,
    message text not null,
    created_at timestamptz default now()
);

-- Donasi Sukarela Pembangunan
create table if not exists public.donations (
    id bigint generated always as identity primary key,
    donor_name text not null,
    amount bigint not null,
    message text,
    created_at timestamptz default now()
);

-- Cache Server-Side untuk Snapshot dan Respons RPC Publik
create table if not exists public.rpc_cache (
    key text primary key,
    data jsonb not null,
    expires_at timestamptz not null
);

-- -----------------------------------------------------------------------------
-- 2. INDEKS KINERJA TINGGI
-- -----------------------------------------------------------------------------
create index if not exists idx_buildings_district on public.buildings(district_key);
create index if not exists idx_buildings_owner on public.buildings(owner_id);
create index if not exists idx_news_created on public.news(created_at desc);
create index if not exists idx_chat_created on public.chat(created_at desc);
create index if not exists idx_proposals_status on public.proposals(status, expires_at);
create index if not exists idx_jobs_player_worked on public.jobs(player_id, worked_at);
create index if not exists idx_rpc_cache_expires on public.rpc_cache(expires_at);

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) - ARSITEKTUR ZERO TRUST
-- Prinsip: Klien HANYA membaca via SELECT. Menulis tabel langsung 100% DITOLAK!
-- Seluruh mutasi WAJIB melalui fungsi PostgreSQL SECURITY DEFINER berstatus terisolasi.
-- -----------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.players enable row level security;
alter table public.districts enable row level security;
alter table public.buildings enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_votes enable row level security;
alter table public.jobs enable row level security;
alter table public.news enable row level security;
alter table public.chat enable row level security;
alter table public.donations enable row level security;
alter table public.rpc_cache enable row level security;

-- Drop policy lama jika ada untuk idempotensi sempurna
drop policy if exists "settings_read" on public.settings;
drop policy if exists "players_read" on public.players;
drop policy if exists "districts_read" on public.districts;
drop policy if exists "buildings_read" on public.buildings;
drop policy if exists "proposals_read" on public.proposals;
drop policy if exists "news_read" on public.news;
drop policy if exists "chat_read" on public.chat;
drop policy if exists "donations_read" on public.donations;

-- Hak Baca Publik Terbatas (Hanya SELECT)
create policy "settings_read" on public.settings for select using (true);
create policy "players_read" on public.players for select using (true);
create policy "districts_read" on public.districts for select using (true);
create policy "buildings_read" on public.buildings for select using (true);
create policy "proposals_read" on public.proposals for select using (true);
create policy "news_read" on public.news for select using (true);
create policy "chat_read" on public.chat for select using (true);
create policy "donations_read" on public.donations for select using (true);

-- -----------------------------------------------------------------------------
-- 4. SEED DATA INISIAL KOTA (Dijalankan Idempotent)
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- 5. REMOTE PROCEDURE CALLS (RPC) BACA DENGAN EDGE CACHING
-- -----------------------------------------------------------------------------

-- RPC Snapshot Kota Utama (Dipanggil klien & tamu secara periodik)
-- -----------------------------------------------------------------------------
-- KENDALI KOTA (diatur Panel Pengelola lewat settings.city_controls)
-- city_ctl(kunci)   : nilai teks satu kendali (null bila tidak diatur).
-- city_block(jenis) : alasan penolakan aksi warga, atau null bila boleh.
--   jenis = register | build | work | vote | chat
-- -----------------------------------------------------------------------------
create or replace function public.city_ctl(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select city_controls ->> p_key from public.settings where id = 1;
$$;

create or replace function public.city_block(p_kind text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    c jsonb;
    v_banned boolean;
    v_muted timestamptz;
begin
    select coalesce(city_controls, '{}'::jsonb) into c from public.settings where id = 1;
    c := coalesce(c, '{}'::jsonb);
    if c ->> 'maintenance' = 'true' then
        return coalesce(nullif(c ->> 'maintenance_msg', ''), 'Kota sedang dalam perawatan. Coba lagi sebentar lagi.');
    end if;
    if p_kind = 'build' and c ->> 'build_frozen' = 'true' then
        return 'Pembangunan sedang dibekukan Pemkot.';
    end if;
    if p_kind = 'work' and c ->> 'work_frozen' = 'true' then
        return 'Kegiatan kerja sedang diliburkan Pemkot.';
    end if;
    if p_kind = 'vote' and c ->> 'vote_frozen' = 'true' then
        return 'Voting kota sedang ditutup Pemkot.';
    end if;
    if p_kind = 'chat' and c ->> 'chat_locked' = 'true' then
        return 'Chat kota sedang dikunci Pemkot.';
    end if;
    select banned, muted_until into v_banned, v_muted from public.players where id = auth.uid();
    if coalesce(v_banned, false) then
        return 'Akunmu sedang dibekukan pengelola kota.';
    end if;
    if p_kind = 'chat' and v_muted is not null and v_muted > now() then
        return 'Kamu dibisukan sampai ' || to_char(v_muted at time zone 'Asia/Jakarta', 'DD/MM HH24:MI') || ' WIB.';
    end if;
    return null;
end;
$$;

create or replace function public.get_city_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cache jsonb;
    v_result jsonb;
    v_pop int;
    v_bld_count int;
begin
    -- 1. Cek cache bila masih berlaku
    select data into v_cache from public.rpc_cache 
    where key = 'city_snapshot' and expires_at > now();
    
    if v_cache is not null then
        return v_cache;
    end if;

    -- 2. Hitung statistik dasar
    select count(*) into v_pop from public.players;
    select count(*) into v_bld_count from public.buildings where stage = 'selesai';

    -- 3. Bangun payload snapshot
    select jsonb_build_object(
        'server_time', now(),
        'settings', (select row_to_json(s) from public.settings s where id = 1),
        'stats', jsonb_build_object(
            'population', v_pop,
            'completed_buildings', v_bld_count,
            'satisfaction_score', 82
        ),
        'districts', (
            select jsonb_agg(row_to_json(d)) 
            from (select key, name, ring, unlock_cost, is_unlocked from public.districts order by key) d
        ),
        'news', (
            select coalesce(jsonb_agg(row_to_json(n)), '[]'::jsonb)
            from (select id, category, message, created_at from public.news order by id desc limit 15) n
        ),
        'chat', (
            select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb)
            from (select id, player_name, message, created_at from public.chat order by id desc limit 25) c
        ),
        'active_proposals', (
            select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb)
            from (
                select id, title, building_type, district_key, grid_i, grid_j, votes_yes, votes_no, quorum, expires_at 
                from public.proposals 
                where status = 'voting' and expires_at > now() 
                order by created_at desc
            ) p
        )
    ) into v_result;

    -- 4. Simpan ke cache selama 5 detik
    insert into public.rpc_cache(key, data, expires_at)
    values ('city_snapshot', v_result, now() + interval '5 seconds')
    on conflict (key) do update set data = v_result, expires_at = now() + interval '5 seconds';

    return v_result;
end;
$$;

-- RPC Mengambil Bangunan per Distrik (Dipanggil saat kamera mendekati distrik)
create or replace function public.get_buildings(p_district text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cache jsonb;
    v_result jsonb;
    v_cache_key text := 'dist_bld_' || p_district;
begin
    select data into v_cache from public.rpc_cache where key = v_cache_key and expires_at > now();
    if v_cache is not null then
        return v_cache;
    end if;

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', b.id,
            'district_key', b.district_key,
            'grid_i', b.grid_i,
            'grid_j', b.grid_j,
            'width', b.width,
            'height', b.height,
            'type', b.type,
            'stage', b.stage,
            'owner_id', b.owner_id,          -- dipakai klien untuk cek "milik sendiri" & gotong royong
            'owner_name', p.username,
            'owner_color', p.avatar_color,
            'avatar_data', p.avatar_data,    -- foto profil pemilik (null = inisial)
            'build_hours_total', b.build_hours_total,
            'build_started_at', b.build_started_at,
            'build_finished_at', b.build_finished_at,
            'is_public', b.is_public,
            'pf_house', b.pf_house,          -- rumah warga kit desa × profesi (home_kits)
            'pf_vehicle', b.pf_vehicle,
            'vehicle_len', b.vehicle_len,
            'crop', b.crop                   -- tanaman sawah (crops.js)
        )
    ), '[]'::jsonb)
    into v_result
    from public.buildings b
    left join public.players p on b.owner_id = p.id
    where b.district_key = p_district;

    insert into public.rpc_cache(key, data, expires_at)
    values (v_cache_key, v_result, now() + interval '15 seconds')
    on conflict (key) do update set data = v_result, expires_at = now() + interval '15 seconds';

    return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC AKSI PEMAIN (SECURITY DEFINER + ROW LOCKING)
-- -----------------------------------------------------------------------------

-- Pendaftaran Warga Baru
-- p_village (opsional): 'have' | 'have_not'. Bila diisi, p_profession wajib id profesi resmi
-- (sama dengan web/src/core/professions.js).
drop function if exists public.register_player(text, text, text);
drop function if exists public.register_player(text, text, text, text);
create or replace function public.register_player(
    p_username text,
    p_profession text,
    p_avatar_color text,
    p_village text default null,
    p_avatar_data text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_clean_name text := trim(p_username);
    v_player public.players%rowtype;
    -- Profesi per desa (sama dengan PROFESSIONS.village di web/src/core/professions.js)
    v_professions text[] := case p_village
        when 'have' then array['dokter','perawat','polisi','pemadam','guru','pedagang','koki','programmer','seniman']
        when 'have_not' then array['petani','nelayan','kuli','peternak','pedagang_keliling','ojek','pengrajin','buruh']
        else array[]::text[] end;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login terlebih dahulu.');
    end if;
    if public.city_block('register') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('register'));
    end if;

    if length(v_clean_name) < 2 or length(v_clean_name) > 31 then
        return jsonb_build_object('success', false, 'error', 'Nama harus 2-31 karakter.');
    end if;

    -- Foto profil (opsional): tolak bila bukan data URL gambar atau terlalu besar (batas kolom 60 KB).
    if p_avatar_data is not null then
        if p_avatar_data !~ '^data:image/' or length(p_avatar_data) > 60000 then
            return jsonb_build_object('success', false, 'error', 'Foto profil tidak valid atau terlalu besar.');
        end if;
    end if;

    if p_village is not null then
        if p_village not in ('have', 'have_not') then
            return jsonb_build_object('success', false, 'error', 'Desa tidak dikenal.');
        end if;
        if not (p_profession = any (v_professions)) then
            return jsonb_build_object('success', false, 'error', 'Profesi tidak tersedia di desa ini.');
        end if;
    end if;

    -- Satu login (auth.uid()) = satu warga. Login yang sudah terikat ke warga lain tidak boleh
    -- dipakai mendaftarkan username baru (dulu diam-diam menimpa profesi/desa warga pertama).
    select * into v_player from public.players where id = v_uid;
    if v_player.id is not null and v_player.username <> v_clean_name then
        return jsonb_build_object('success', false, 'code', 'uid_taken',
            'error', 'Login ini sudah terdaftar sebagai ' || v_player.username
                || '. Satu login hanya untuk satu warga; muat ulang lalu daftar lagi.');
    end if;

    if exists (select 1 from public.players where username = v_clean_name and id != v_uid) then
        return jsonb_build_object('success', false, 'error', 'Nama warga sudah digunakan.');
    end if;

    insert into public.players (id, username, profession, village, coins, role, avatar_color, avatar_data)
    values (v_uid, v_clean_name, p_profession, p_village, 250, 'warga', coalesce(p_avatar_color, '#5B3A24'), p_avatar_data)
    on conflict (id) do update set
        profession = excluded.profession,
        village = coalesce(excluded.village, public.players.village),
        avatar_color = excluded.avatar_color,
        avatar_data = coalesce(excluded.avatar_data, public.players.avatar_data)
    returning * into v_player;

    -- Rumah & kendaraan ditentukan server dari desa × profesi (tabel home_kits)
    if v_player.village is not null then
        update public.players pl set
            house_model = k.house_model, house_label = k.house_label,
            vehicle_model = k.vehicle_model, vehicle_label = k.vehicle_label
        from public.home_kits k
        where pl.id = v_uid and k.village = v_player.village and k.profession = v_player.profession;
        select * into v_player from public.players where id = v_uid;
    end if;

    -- Kirim pengumuman berita kota
    insert into public.news (category, message)
    values ('warga', v_clean_name || ' resmi menjadi warga AUDIRA-LAND dengan profesi ' || p_profession || '!');

    -- Invalidate cache snapshot
    delete from public.rpc_cache where key = 'city_snapshot';

    return jsonb_build_object(
        'success', true,
        'player', row_to_json(v_player)
    );
end;
$$;

-- Rumah awal warga (docs/SPEC_RUMAH_KENDARAAN_PROFESI.md): gratis, 5 menit jam server.
-- Model rumah & kendaraan diambil dari home_kits menurut desa × profesi pemain, bukan dari klien.
-- Idempoten: warga yang sudah punya rumah awal mendapat rumah yang sama.
create or replace function public.register_home(p_i int, p_j int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_player public.players%rowtype;
    v_kit public.home_kits%rowtype;
    v_bld public.buildings%rowtype;
    v_district text := 'k12';   -- distrik pusat (GRID_CONFIG.CENTER_DISTRICT_KEY)
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if public.city_block('build') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('build'));
    end if;

    select * into v_player from public.players where id = v_uid for update;
    if v_player.id is null or v_player.village is null then
        return jsonb_build_object('success', false, 'error', 'Daftar warga dulu (desa & profesi).');
    end if;

    select * into v_bld from public.buildings where owner_id = v_uid and pf_house is not null limit 1;
    if v_bld.id is not null then
        return jsonb_build_object('success', true, 'existing', true, 'building', row_to_json(v_bld));
    end if;

    select * into v_kit from public.home_kits where village = v_player.village and profession = v_player.profession;
    if v_kit.village is null then
        return jsonb_build_object('success', false, 'error', 'Kit rumah untuk profesi ini belum ada.');
    end if;

    if p_i is null or p_j is null or p_i < 0 or p_i >= 216 or p_j < 0 or p_j >= 216 then
        return jsonb_build_object('success', false, 'error', 'Kavling di luar peta.');
    end if;
    if public.village_of_plot(v_district, p_i) <> v_player.village then
        return jsonb_build_object('success', false, 'error', 'Kavling tidak berada di desa pilihanmu.');
    end if;
    if exists (select 1 from public.buildings where district_key = v_district and grid_i = p_i and grid_j = p_j) then
        return jsonb_build_object('success', false, 'error', 'Kavling ini sudah dipakai.');
    end if;

    insert into public.buildings (
        district_key, grid_i, grid_j, type, owner_id, stage, build_hours_total,
        build_started_at, build_finished_at, pf_house, pf_vehicle, vehicle_len
    )
    values (
        v_district, p_i, p_j, case when v_player.village = 'have' then 'rumah' else 'rumah_limas' end,
        v_uid, 'proyek', 5 / 60.0, now(), now() + interval '5 minutes',
        v_kit.house_model, v_kit.vehicle_model, v_kit.vehicle_len
    )
    returning * into v_bld;

    delete from public.rpc_cache where key in ('city_snapshot', 'dist_bld_' || v_district);

    return jsonb_build_object('success', true, 'existing', false, 'building', row_to_json(v_bld),
        'house_label', v_kit.house_label, 'vehicle_label', v_kit.vehicle_label);
end;
$$;

-- Klaim Kavling & Mulai Membangun (Row-Locking Anti-Balapan)
-- =============================================================================
-- CIRI KHAS DESA (docs/SPEC_CIRI_KHAS_DESA.md, angka sama dengan web/src/core/village_identity.js)
-- =============================================================================
-- Panen sawah / kebun_sayur Desa Have-Not: jam panen terakhir (jam server now())
alter table public.buildings add column if not exists last_harvest_at timestamptz;
-- Tanaman yang ditanam di sawah (web/src/core/crops.js): padi, jagung, tomat, semangka, cabai
alter table public.buildings add column if not exists crop text;
-- Petani: sudah pernah menerima sawah gratis? (1x seumur akun)
alter table public.players add column if not exists got_starter_sawah boolean not null default false;

-- Kolom petak klien kini global (0..215, sungai 106..109); data lama per distrik (0..31).
do $$
begin
    if exists (select 1 from pg_constraint where conname = 'buildings_grid_i_check') then
        alter table public.buildings drop constraint buildings_grid_i_check;
        alter table public.buildings add constraint buildings_grid_i_check check (grid_i >= 0 and grid_i < 216);
    end if;
    if exists (select 1 from pg_constraint where conname = 'buildings_grid_j_check') then
        alter table public.buildings drop constraint buildings_grid_j_check;
        alter table public.buildings add constraint buildings_grid_j_check check (grid_j >= 0 and grid_j < 216);
    end if;
end $$;

-- Desa sebuah petak: 'have' (barat sungai) | 'have_not' (timur sungai).
--  - p_i >= 32: kolom global klien -> have_not bila p_i > 109 (sama dengan isHaveNotTile).
--  - p_i < 32 : koordinat lama per distrik k00..k24 (grid 5x5, k12 di tengah): kolom distrik 0-1 = have,
--               3-4 = have_not, kolom 2 dibelah sungai di tengah (p_i >= 16 = have_not).
create or replace function public.village_of_plot(p_district text, p_i int)
returns text
language sql
immutable
as $$
    select case
        when p_i >= 32 then case when p_i > 109 then 'have_not' else 'have' end
        when (substring(p_district from 2)::int % 5) < 2 then 'have'
        when (substring(p_district from 2)::int % 5) > 2 then 'have_not'
        when p_i >= 16 then 'have_not'
        else 'have'
    end;
$$;

create or replace function public.village_claim_fee(p_village text)
returns int
language sql
immutable
as $$
    select case when p_village = 'have_not' then 60 else 150 end;
$$;

-- Katalog klaim warga: biaya (₳) & durasi bangun (menit). HARUS sama dengan buildingCatalog di
-- web/src/ui/claim_modal.js. Tipe di luar daftar = tidak bisa diklaim warga (cost null).
create or replace function public.building_catalog(p_type text, out cost int, out minutes int)
language sql
immutable
as $$
    select c.cost, c.minutes from (values
        ('rumah', 100, 45), ('rumah_limas', 150, 90), ('rumah2', 250, 120), ('kos', 350, 150),
        ('warung', 120, 60), ('warung_kopi', 100, 45), ('kafe', 200, 90), ('toko', 220, 90),
        ('bengkel', 250, 100), ('ruko', 350, 140), ('kantor', 600, 240),
        ('kebun_sayur', 90, 40), ('sawah', 80, 30), ('taman_surya', 150, 60), ('saung_bambu', 80, 30),
        ('posko', 90, 30), ('pos_ronda', 120, 45), ('ibadah', 300, 120), ('pasar', 400, 160),
        ('pangkalan', 150, 60), ('sekolah', 500, 200), ('rs', 700, 280)
    ) as c(type, cost, minutes)
    where c.type = p_type;
$$;

-- Desa Have-Not hanya boleh bangunan sederhana. HARUS sama dengan HAVE_NOT_ALLOWED di
-- web/src/core/village_rules.js. Batas 1 lantai: tabel buildings tidak punya kolom lantai, jadi
-- bangunan server selalu dirender 1 lantai di Have-Not oleh klien (applyHaveNotRules).
create or replace function public.allowed_in_have_not(p_type text)
returns boolean
language sql
immutable
as $$
    select p_type = any (array[
        'rumah', 'rumah_limas', 'proyek_rumah', 'saung_bambu',
        'warung', 'warung_kopi', 'warung_madura', 'toko', 'bengkel', 'pkl', 'pasar', 'pangkalan',
        'sawah', 'kebun_sayur', 'lahan_material', 'waduk', 'taman', 'taman_surya', 'lapangan',
        'posko', 'pos_ronda', 'polisi', 'ibadah', 'sekolah', 'pln', 'tugu'
    ]);
$$;

-- Bonus profesi: daftar tempat kerja sama dengan PROFESSIONS di web/src/core/professions.js
create or replace function public.profession_matches(p_profession text, p_type text)
returns boolean
language sql
immutable
as $$
    select coalesce(p_type = any (case p_profession
        when 'dokter' then array['rs', 'posko']
        when 'perawat' then array['rs', 'posko']
        when 'polisi' then array['polisi', 'penjara', 'pos_ronda', 'barak']
        when 'pemadam' then array['posko', 'pln', 'pangkalan']
        when 'guru' then array['sekolah', 'lapangan']
        when 'pedagang' then array['pasar', 'toko', 'ruko', 'warung_madura']
        when 'koki' then array['kafe', 'warung', 'warung_kopi', 'warung_madura']
        when 'programmer' then array['kantor', 'bank', 'pln']
        when 'seniman' then array['taman', 'tugu', 'stadion', 'saung_bambu']
        when 'petani' then array['sawah', 'kebun_sayur', 'waduk', 'lahan_material']
        when 'nelayan' then array['waduk', 'pasar']
        when 'kuli' then array['proyek_rumah', 'proyek_gedung', 'lahan_material', 'pabrik']
        when 'peternak' then array['sawah', 'kebun_sayur', 'lapangan', 'pasar']
        when 'pedagang_keliling' then array['pkl', 'pasar', 'warung', 'warung_kopi']
        when 'ojek' then array['pangkalan', 'pasar', 'terminal']
        when 'pengrajin' then array['saung_bambu', 'pasar', 'toko', 'tugu']
        when 'buruh' then array['pabrik', 'lahan_material', 'pln', 'bengkel']
        else array[]::text[] end), false);
$$;

-- Panen sawah / kebun_sayur milik sendiri di Desa Have-Not: 15 ₳ sekali tiap 24 jam (jam server)
create or replace function public.harvest_building(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_building public.buildings%rowtype;
    v_amount int := 15;
    v_hours int := 24;
    v_coins int;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if public.city_block('work') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('work'));
    end if;

    -- Kunci baris bangunan: dua panggilan bersamaan tidak bisa panen dua kali
    select * into v_building from public.buildings where id = p_building_id for update;
    if v_building.id is null or v_building.owner_id is distinct from v_uid then
        return jsonb_build_object('success', false, 'error', 'Hanya pemilik yang bisa memanen.');
    end if;
    if v_building.type not in ('sawah', 'kebun_sayur') or v_building.stage <> 'selesai'
       or public.village_of_plot(v_building.district_key, v_building.grid_i) <> 'have_not' then
        return jsonb_build_object('success', false, 'error', 'Panen hanya untuk sawah / kebun sayur di Desa Have-Not.');
    end if;

    -- Hasil & jeda mengikuti tanaman sawah (web/src/core/crops.js); kebun_sayur tetap 15 ₳ / 24 jam
    if v_building.type = 'sawah' then
        case coalesce(v_building.crop, 'padi')
            when 'jagung'   then v_amount := 9;  v_hours := 12;
            when 'tomat'    then v_amount := 20; v_hours := 30;
            when 'semangka' then v_amount := 26; v_hours := 40;
            when 'cabai'    then v_amount := 34; v_hours := 52;
            else v_amount := 15; v_hours := 24;  -- padi
        end case;
    end if;

    if v_building.last_harvest_at is not null and v_building.last_harvest_at > now() - make_interval(hours => v_hours) then
        return jsonb_build_object('success', false, 'error', 'Belum waktunya panen.',
            'next_at', v_building.last_harvest_at + make_interval(hours => v_hours));
    end if;

    update public.buildings set last_harvest_at = now() where id = p_building_id;
    update public.players set coins = coins + v_amount where id = v_uid returning coins into v_coins;

    return jsonb_build_object('success', true, 'amount', v_amount, 'total_coins', v_coins,
        'next_at', now() + make_interval(hours => v_hours));
end;
$$;

-- Pilih tanaman sawah milik sendiri (tanam ulang -> jeda panen mulai dari awal).
create or replace function public.set_crop(p_building_id uuid, p_crop text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_building public.buildings%rowtype;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if p_crop not in ('padi', 'jagung', 'tomat', 'semangka', 'cabai') then
        return jsonb_build_object('success', false, 'error', 'Tanaman tidak dikenal: ' || coalesce(p_crop, '-'));
    end if;
    select * into v_building from public.buildings where id = p_building_id for update;
    if v_building.id is null or v_building.owner_id is distinct from v_uid then
        return jsonb_build_object('success', false, 'error', 'Hanya pemilik sawah yang bisa menanam.');
    end if;
    if v_building.type <> 'sawah' then
        return jsonb_build_object('success', false, 'error', 'Hanya sawah yang bisa dipilih tanamannya.');
    end if;
    -- Tanam ulang: reset jeda panen agar tanaman baru tumbuh dari awal
    update public.buildings set crop = p_crop, last_harvest_at = now() where id = p_building_id;
    delete from public.rpc_cache where key in ('city_snapshot', 'dist_bld_' || v_building.district_key);
    return jsonb_build_object('success', true, 'crop', p_crop, 'next_at', now() + interval '12 hours');
end;
$$;

-- Sawah gratis untuk petani baru: 1x seumur akun, tanpa biaya, langsung 'selesai'.
create or replace function public.claim_starter_sawah(p_district text, p_i int, p_j int, p_crop text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_player public.players%rowtype;
    v_bld_id uuid;
    v_crop text := coalesce(nullif(p_crop, ''), 'padi');
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if v_crop not in ('padi', 'jagung', 'tomat', 'semangka', 'cabai') then
        v_crop := 'padi';
    end if;
    select * into v_player from public.players where id = v_uid for update;
    if v_player.id is null then
        return jsonb_build_object('success', false, 'error', 'Profil warga belum terdaftar.');
    end if;
    if v_player.profession is distinct from 'petani' then
        return jsonb_build_object('success', false, 'error', 'Sawah gratis hanya untuk petani.');
    end if;
    if v_player.got_starter_sawah then
        return jsonb_build_object('success', false, 'error', 'Sawah gratis sudah pernah diterima.');
    end if;
    if public.village_of_plot(p_district, p_i) <> 'have_not' then
        return jsonb_build_object('success', false, 'error', 'Sawah hanya di Desa Have-Not.');
    end if;
    if exists (select 1 from public.buildings where district_key = p_district and grid_i = p_i and grid_j = p_j) then
        return jsonb_build_object('success', false, 'error', 'Kavling ini sudah dimiliki warga lain!');
    end if;

    insert into public.buildings (
        district_key, grid_i, grid_j, type, crop, owner_id, stage, build_hours_total, build_started_at, build_finished_at
    )
    values (
        p_district, p_i, p_j, 'sawah', v_crop, v_uid, 'selesai', 0, now(), now()
    )
    returning id into v_bld_id;

    update public.players set got_starter_sawah = true where id = v_uid;
    delete from public.rpc_cache where key in ('city_snapshot', 'dist_bld_' || p_district);

    return jsonb_build_object('success', true, 'building_id', v_bld_id, 'crop', v_crop);
end;
$$;

create or replace function public.claim_plot_and_build(
    p_district text,
    p_i int,
    p_j int,
    p_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_player public.players%rowtype;
    v_district public.districts%rowtype;
    v_build_cost int;
    v_build_minutes int;
    v_build_hours numeric;
    v_bld_id uuid;
    v_village text;
    v_claim_fee int;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if public.city_block('build') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('build'));
    end if;

    -- 1. Kunci saldo pemain
    select * into v_player from public.players where id = v_uid for update;
    if v_player.id is null then
        return jsonb_build_object('success', false, 'error', 'Profil warga belum terdaftar.');
    end if;

    -- 2. Cek distrik
    select * into v_district from public.districts where key = p_district;
    if not v_district.is_unlocked then
        return jsonb_build_object('success', false, 'error', 'Distrik ' || v_district.name || ' masih terkunci!');
    end if;

    -- 3. Tipe & aturan desa: hanya tipe katalog; Have-Not hanya bangunan sederhana (village_rules.js)
    select c.cost, c.minutes into v_build_cost, v_build_minutes from public.building_catalog(p_type) c;
    if v_build_cost is null then
        return jsonb_build_object('success', false, 'error', 'Tipe bangunan tidak dikenal: ' || coalesce(p_type, '-'));
    end if;
    v_village := public.village_of_plot(p_district, p_i);
    if v_village = 'have_not' and not public.allowed_in_have_not(p_type) then
        return jsonb_build_object('success', false, 'error', 'Desa Have-Not hanya boleh bangunan sederhana. ' || p_type || ' tidak diizinkan.');
    end if;
    v_build_hours := v_build_minutes / 60.0;

    -- 4. Cek biaya koin: biaya klaim kavling desa (Have 150 / Have-Not 60, village_identity.js) + biaya katalog
    v_claim_fee := public.village_claim_fee(v_village);
    v_build_cost := v_build_cost + v_claim_fee;
    if v_player.coins < v_build_cost then
        return jsonb_build_object('success', false, 'error', 'Koin tidak cukup. Butuh ' || v_build_cost || ' ₳ (klaim kavling ' || v_claim_fee || ' ₳).');
    end if;

    -- 4. Kunci kavling dan periksa apakah kosong
    if exists (select 1 from public.buildings where district_key = p_district and grid_i = p_i and grid_j = p_j) then
        return jsonb_build_object('success', false, 'error', 'Kavling ini sudah dimiliki warga lain!');
    end if;

    -- 5. Potong koin pemain
    update public.players 
    set coins = coins - v_build_cost 
    where id = v_uid;

    -- 6. Masukkan bangunan dengan status 'proyek'
    insert into public.buildings (
        district_key, grid_i, grid_j, type, owner_id, stage, build_hours_total, build_started_at, build_finished_at
    )
    values (
        p_district, p_i, p_j, p_type, v_uid, 'proyek', v_build_hours, now(), now() + make_interval(mins => v_build_minutes)
    )
    returning id into v_bld_id;

    -- 7. Tambah ke ticker berita
    insert into public.news (category, message)
    values ('bangun', v_player.username || ' mulai membangun ' || p_type || ' di ' || v_district.name || '.');

    -- 8. Invalidate cache distrik & snapshot
    delete from public.rpc_cache where key in ('city_snapshot', 'dist_bld_' || p_district);

    return jsonb_build_object(
        'success', true,
        'building_id', v_bld_id,
        'remaining_coins', v_player.coins - v_build_cost,
        'village', v_village,
        'claim_fee', v_claim_fee,
        'finished_at', now() + make_interval(mins => v_build_minutes)
    );
end;
$$;

-- Bekerja di Bangunan (Menghasilkan Koin Harian)
create or replace function public.work_at_building(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_player public.players%rowtype;
    v_building public.buildings%rowtype;
    v_reward int := 35;
    v_today_earned int := 0;
    v_daily_cap int;
    v_village text;
    v_base int;
    v_bonus int := 0;
    v_gotong int := 0;
    v_gross int;
    v_tax int := 0;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if public.city_block('work') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('work'));
    end if;

    select daily_coin_cap into v_daily_cap from public.settings where id = 1;

    -- Kunci pemain
    select * into v_player from public.players where id = v_uid for update;
    if v_player.id is null then
        return jsonb_build_object('success', false, 'error', 'Warga belum terdaftar.');
    end if;

    -- Periksa bangunan
    select * into v_building from public.buildings where id = p_building_id;
    if v_building.id is null or v_building.stage != 'selesai' then
        return jsonb_build_object('success', false, 'error', 'Bangunan belum selesai atau tidak valid.');
    end if;

    -- Cek jeda kerja (minimal 10 menit sekali)
    if v_player.last_worked_at is not null
       and v_player.last_worked_at > (now() - make_interval(mins => coalesce(public.city_ctl('cooldown_min')::int, 10))) then
        return jsonb_build_object('success', false, 'error', 'Kamu baru saja bekerja. Istirahat sejenak!');
    end if;

    -- Hitung koin harian yang sudah didapat hari ini
    select coalesce(sum(reward_coins), 0) into v_today_earned
    from public.jobs
    where player_id = v_uid and worked_at >= date_trunc('day', now());

    -- Aturan desa (village_identity.js): upah dasar desa tempat kerja (Have 42 / Have-Not 35),
    -- bonus profesi +50%, gotong royong +10 (warga Have-Not di bangunan warga lain se-desa),
    -- pajak kota 10% dipotong dari upah di Desa Have dan masuk kas kota.
    v_village := public.village_of_plot(v_building.district_key, v_building.grid_i);
    v_base := case when v_village = 'have' then 42 else 35 end;
    if public.profession_matches(v_player.profession, v_building.type) then
        v_bonus := round(v_base * 0.5);
    end if;
    if v_player.village = 'have_not' and v_village = 'have_not' and not v_building.is_public
       and v_building.owner_id is not null and v_building.owner_id <> v_uid then
        v_gotong := 10;
    end if;
    v_gross := round((v_base + v_bonus + v_gotong) * least(3, greatest(0.5, coalesce(public.city_ctl('wage_mult')::numeric, 1))));
    if v_village = 'have' then
        v_tax := round(v_gross * 0.10);
    end if;
    v_reward := v_gross - v_tax;

    if v_today_earned + v_reward > v_daily_cap then
        v_reward := v_daily_cap - v_today_earned;
        v_tax := case when v_village = 'have' then round(greatest(v_reward, 0) * 0.10) else 0 end;
    end if;

    if v_reward <= 0 then
        return jsonb_build_object('success', false, 'error', 'Batas koin harianmu sudah penuh (' || v_daily_cap || ' ₳). Kembali besok!');
    end if;

    -- Update pemain
    update public.players
    set coins = coins + v_reward,
        total_worked = total_worked + 1,
        last_worked_at = now()
    where id = v_uid;

    -- Catat riwayat kerja
    insert into public.jobs (player_id, building_id, reward_coins)
    values (v_uid, p_building_id, v_reward);

    -- Pajak kota 10% (hanya Desa Have) masuk kas kota
    if v_tax > 0 then
        update public.settings set city_treasury = city_treasury + v_tax where id = 1;
    end if;

    return jsonb_build_object(
        'success', true,
        'reward', v_reward,
        'village', v_village,
        'bonus', v_bonus,
        'gotong_royong', v_gotong,
        'tax', v_tax,
        'total_coins', v_player.coins + v_reward
    );
end;
$$;

-- Mengajukan Usulan Bangunan Publik
create or replace function public.submit_proposal(
    p_title text,
    p_building_type text,
    p_district text,
    p_i int,
    p_j int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_player public.players%rowtype;
    v_quorum int;
    v_prop_id uuid;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if public.city_block('vote') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('vote'));
    end if;

    select * into v_player from public.players where id = v_uid;
    select vote_quorum into v_quorum from public.settings where id = 1;

    -- Cek apakah kavling kosong
    if exists (select 1 from public.buildings where district_key = p_district and grid_i = p_i and grid_j = p_j) then
        return jsonb_build_object('success', false, 'error', 'Kavling tersebut sudah terisi.');
    end if;

    insert into public.proposals (
        title, building_type, district_key, grid_i, grid_j, proposer_id, quorum
    )
    values (
        trim(p_title), p_building_type, p_district, p_i, p_j, v_uid, v_quorum
    )
    returning id into v_prop_id;

    -- Pengusul otomatis memberi suara setuju
    insert into public.proposal_votes (proposal_id, player_id, vote)
    values (v_prop_id, v_uid, true);

    update public.proposals set votes_yes = 1 where id = v_prop_id;

    insert into public.news (category, message)
    values ('voting', v_player.username || ' mengusulkan pembangunan publik: ' || p_title);

    delete from public.rpc_cache where key = 'city_snapshot';

    return jsonb_build_object('success', true, 'proposal_id', v_prop_id);
end;
$$;

-- Voting Usulan Publik (1 Warga = 1 Suara)
create or replace function public.vote_proposal(
    p_proposal_id uuid,
    p_vote boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_prop public.proposals%rowtype;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if public.city_block('vote') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('vote'));
    end if;

    select * into v_prop from public.proposals where id = p_proposal_id for update;
    if v_prop.id is null or v_prop.status != 'voting' or v_prop.expires_at < now() then
        return jsonb_build_object('success', false, 'error', 'Usulan voting sudah ditutup.');
    end if;

    if exists (select 1 from public.proposal_votes where proposal_id = p_proposal_id and player_id = v_uid) then
        return jsonb_build_object('success', false, 'error', 'Kamu sudah memberikan suara untuk usulan ini.');
    end if;

    insert into public.proposal_votes (proposal_id, player_id, vote)
    values (p_proposal_id, v_uid, p_vote);

    if p_vote then
        update public.proposals set votes_yes = votes_yes + 1 where id = p_proposal_id;
        v_prop.votes_yes := v_prop.votes_yes + 1;
    else
        update public.proposals set votes_no = votes_no + 1 where id = p_proposal_id;
        v_prop.votes_no := v_prop.votes_no + 1;
    end if;

    -- Evaluasi Quorum
    if v_prop.votes_yes >= v_prop.quorum then
        update public.proposals set status = 'disetujui' where id = p_proposal_id;

        -- Bangun fasilitas publik otomatis
        insert into public.buildings (
            district_key, grid_i, grid_j, type, stage, build_hours_total, is_public, build_started_at, build_finished_at
        )
        values (
            v_prop.district_key, v_prop.grid_i, v_prop.grid_j, v_prop.building_type, 'selesai', 0, true, now(), now()
        )
        on conflict (district_key, grid_i, grid_j) do nothing;

        insert into public.news (category, message)
        values ('voting', '🎉 Usulan ' || v_prop.title || ' resmi disetujui warga dan dibangun di kota!');
    end if;

    delete from public.rpc_cache where key = 'city_snapshot';

    return jsonb_build_object('success', true, 'votes_yes', v_prop.votes_yes, 'status', v_prop.status);
end;
$$;

-- Mengirim Pesan Chat Kota
create or replace function public.send_chat(p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_player public.players%rowtype;
    v_clean text := trim(p_message);
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
    end if;
    if public.city_block('chat') is not null then
        return jsonb_build_object('success', false, 'code', 'city_locked', 'error', public.city_block('chat'));
    end if;

    if length(v_clean) = 0 or length(v_clean) > 150 then
        return jsonb_build_object('success', false, 'error', 'Pesan chat harus 1-150 karakter.');
    end if;

    select * into v_player from public.players where id = v_uid;

    insert into public.chat (player_id, player_name, message)
    values (v_uid, coalesce(v_player.username, 'Warga'), v_clean);

    delete from public.rpc_cache where key = 'city_snapshot';

    return jsonb_build_object('success', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. HAK AKSES EKSEKUSI RPC (GRANT EXECUTE)
-- -----------------------------------------------------------------------------
-- RPC Publik (Bisa dibaca oleh anon / tamu tanpa login)
grant execute on function public.get_city_snapshot() to anon, authenticated;
grant execute on function public.get_buildings(text) to anon, authenticated;

-- RPC Khusus Pengguna Terotentikasi (Wajib Login)
grant execute on function public.register_player(text, text, text, text, text) to authenticated;
grant execute on function public.register_home(int, int) to authenticated;
grant execute on function public.claim_plot_and_build(text, int, int, text) to authenticated;
grant execute on function public.work_at_building(uuid) to authenticated;
grant execute on function public.harvest_building(uuid) to authenticated;
grant execute on function public.set_crop(uuid, text) to authenticated;
grant execute on function public.claim_starter_sawah(text, int, int, text) to authenticated;
grant execute on function public.submit_proposal(text, text, text, int, int) to authenticated;
grant execute on function public.vote_proposal(uuid, boolean) to authenticated;
grant execute on function public.send_chat(text) to authenticated;

revoke execute on function public.city_ctl(text) from public, anon, authenticated;
revoke execute on function public.city_block(text) from public, anon, authenticated;

-- Panel Pengelola Kota (RPC admin_*, cek players.role = 'walikota' di server): supabase/admin_panel.sql
-- (jalankan SETELAH file ini).

-- -----------------------------------------------------------------------------
-- 7c. SUPABASE REALTIME: publikasikan tabel yang dipantau client (chat push, dll).
-- Idempoten: tabel yang sudah terdaftar di publication `supabase_realtime` dilewati.
-- Hanya SELECT yang diizinkan RLS yang terkirim ke client (kebijakan baca publik berlaku).
-- -----------------------------------------------------------------------------
do $$
declare
    t text;
    tables text[] := array['chat', 'buildings', 'news', 'proposals', 'proposal_votes', 'settings'];
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
    end if;
    foreach t in array tables loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8. VERIFIKASI UJI COBA OTOMATIS TAHAP 01
-- Menjalankan snapshot kota perdana untuk memastikan seluruh fungsi terpasang sukses.
-- -----------------------------------------------------------------------------
select public.get_city_snapshot();
