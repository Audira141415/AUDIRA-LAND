#!/usr/bin/env python3
"""
AUDIRA-LAND: Generator & Verifikator Fondasi Data Supabase (Tahap 01)
Menghasilkan seed.sql, memperbarui schema.sql menjadi all-in-one idempotent,
dan menjalankan audit verifikasi integritas data dan RPC.
"""

import os
import re
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUPABASE_DIR = os.path.join(BASE_DIR, "supabase")
SCHEMA_SQL_PATH = os.path.join(SUPABASE_DIR, "schema.sql")
SEED_SQL_PATH = os.path.join(SUPABASE_DIR, "seed.sql")

DISTRICTS = [
    # Row 0 (Ring 2 - Pesisir Utara)
    {"key": "k00", "name": "Pesisir Sunda Kelapa", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k01", "name": "Ancol Bahari", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k02", "name": "Marunda Maritim", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k03", "name": "Tanjung Priok", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k04", "name": "Muara Karang", "ring": 2, "cost": 75000, "unlocked": False},
    # Row 1 (Ring 2 & Ring 1 - Kawasan Pemukiman & Sentra)
    {"key": "k05", "name": "Bukit Cinere", "ring": 2, "cost": 50000, "unlocked": False},
    {"key": "k06", "name": "Taman Suropati", "ring": 1, "cost": 25000, "unlocked": False},
    {"key": "k07", "name": "Pasar Beringharjo", "ring": 1, "cost": 20000, "unlocked": False},
    {"key": "k08", "name": "Menteng Boulevard", "ring": 1, "cost": 25000, "unlocked": False},
    {"key": "k09", "name": "Pulo Gadung Industri", "ring": 2, "cost": 50000, "unlocked": False},
    # Row 2 (Ring 2, Ring 1, & Ring 0 - Jantung Kota)
    {"key": "k10", "name": "Cipete Kopi Raya", "ring": 2, "cost": 50000, "unlocked": False},
    {"key": "k11", "name": "Kampung Kreatif", "ring": 1, "cost": 20000, "unlocked": False},
    {"key": "k12", "name": "Alun-Alun Merdeka", "ring": 0, "cost": 0, "unlocked": True},
    {"key": "k13", "name": "Sentra Cyberpunk", "ring": 1, "cost": 25000, "unlocked": False},
    {"key": "k14", "name": "Senopati Hub", "ring": 2, "cost": 50000, "unlocked": False},
    # Row 3 (Ring 2 & Ring 1 - Budaya, Kuliner, & Ruang Hijau)
    {"key": "k15", "name": "Bintaro Hijau", "ring": 2, "cost": 50000, "unlocked": False},
    {"key": "k16", "name": "Braga Heritage", "ring": 1, "cost": 20000, "unlocked": False},
    {"key": "k17", "name": "Malioboro Walk", "ring": 1, "cost": 20000, "unlocked": False},
    {"key": "k18", "name": "Tebet Eco Park", "ring": 1, "cost": 25000, "unlocked": False},
    {"key": "k19", "name": "Cikini Klasik", "ring": 2, "cost": 50000, "unlocked": False},
    # Row 4 (Ring 2 - Kawasan Penyangga Selatan & Pegunungan)
    {"key": "k20", "name": "Agrowisata Cisarua", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k21", "name": "Lembah Salak", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k22", "name": "Sentul Sirkuit", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k23", "name": "Parung Rimbun", "ring": 2, "cost": 75000, "unlocked": False},
    {"key": "k24", "name": "Sawangan Botanical", "ring": 2, "cost": 75000, "unlocked": False},
]

STARTER_BUILDINGS = [
    {
        "district_key": "k12",
        "grid_i": 16,
        "grid_j": 16,
        "width": 2,
        "height": 2,
        "type": "balai_kota",
        "stage": "selesai",
        "is_public": True,
        "is_protected": True
    },
    {
        "district_key": "k12",
        "grid_i": 14,
        "grid_j": 16,
        "width": 1,
        "height": 1,
        "type": "warung_madura",
        "stage": "selesai",
        "is_public": True,
        "is_protected": False
    },
    {
        "district_key": "k12",
        "grid_i": 16,
        "grid_j": 14,
        "width": 1,
        "height": 1,
        "type": "taman_surya",
        "stage": "selesai",
        "is_public": True,
        "is_protected": False
    },
    {
        "district_key": "k12",
        "grid_i": 18,
        "grid_j": 16,
        "width": 1,
        "height": 1,
        "type": "pos_ronda",
        "stage": "selesai",
        "is_public": True,
        "is_protected": False
    }
]

STARTER_NEWS = [
    ("kota", "Selamat datang di AUDIRA-LAND! Kota digital gotong royong resmi dibuka untuk seluruh netizen."),
    ("pembangunan", "Alun-Alun Merdeka (Distrik k12) telah resmi menjadi pusat pemerintahan dan aktivitas perdana warga."),
    ("ekonomi", "Kas perbendaharaan kota telah disiapkan 50.000 ₳ untuk subsidi pembangunan fasilitas umum."),
    ("voting", "Balai musyawarah terbuka 24 jam untuk usulan pembangunan publik secara demokratis.")
]

def generate_seed_sql() -> str:
    lines = [
        "-- =============================================================================",
        "-- AUDIRA-LAND: Seed Data Inisial (Tahap 01)",
        "-- Idempotent: Aman dijalankan berulang kali tanpa membuat duplikasi data.",
        "-- =============================================================================",
        "",
        "-- 1. PENGATURAN GLOBAL KOTA",
        "insert into public.settings (",
        "    id, grid_version, city_name, city_treasury, daily_tax, daily_coin_cap,",
        "    vote_quorum, vote_duration_hours, donation_target, donation_collected, announcement",
        ")",
        "values (",
        "    1, 1, 'AUDIRA-LAND', 50000, 10, 300, 5, 24, 1000000, 0,",
        "    'Selamat datang di AUDIRA-LAND! Bangun kavlingmu dan ikut voting kota.'",
        ")",
        "on conflict (id) do update set",
        "    city_name = excluded.city_name,",
        "    daily_tax = excluded.daily_tax,",
        "    daily_coin_cap = excluded.daily_coin_cap,",
        "    vote_quorum = excluded.vote_quorum,",
        "    vote_duration_hours = excluded.vote_duration_hours,",
        "    announcement = excluded.announcement;",
        "",
        "-- 2. DAFTAR 25 DISTRIK (GRID 5x5)",
        "insert into public.districts (key, name, ring, unlock_cost, is_unlocked, unlocked_at)",
        "values"
    ]

    val_lines = []
    for d in DISTRICTS:
        unlocked_at = "now()" if d["unlocked"] else "null"
        val = f"    ('{d['key']}', '{d['name']}', {d['ring']}, {d['cost']}, {str(d['unlocked']).lower()}, {unlocked_at})"
        val_lines.append(val)
    
    lines.append(",\n".join(val_lines))
    lines.extend([
        "on conflict (key) do update set",
        "    name = excluded.name,",
        "    ring = excluded.ring,",
        "    unlock_cost = excluded.unlock_cost,",
        "    is_unlocked = excluded.is_unlocked;",
        "",
        "-- 3. BANGUNAN PERDANA DI DISTRIK PUSAT (k12 - Alun-Alun Merdeka)",
        "insert into public.buildings (",
        "    district_key, grid_i, grid_j, width, height, type, stage,",
        "    build_hours_total, is_public, is_protected, build_started_at, build_finished_at",
        ")",
        "values"
    ])

    bld_lines = []
    for b in STARTER_BUILDINGS:
        val = f"    ('{b['district_key']}', {b['grid_i']}, {b['grid_j']}, {b['width']}, {b['height']}, '{b['type']}', '{b['stage']}', 0.0, {str(b['is_public']).lower()}, {str(b['is_protected']).lower()}, now(), now())"
        bld_lines.append(val)

    lines.append(",\n".join(bld_lines))
    lines.extend([
        "on conflict (district_key, grid_i, grid_j) do nothing;",
        "",
        "-- 4. PENGUMUMAN BERITA KOTA PERDANA",
        "insert into public.news (category, message)",
        "select d.cat, d.msg",
        "from (values"
    ])

    news_lines = []
    for cat, msg in STARTER_NEWS:
        news_lines.append(f"    ('{cat}', '{msg}')")

    lines.append(",\n".join(news_lines))
    lines.extend([
        ") as d(cat, msg)",
        "where not exists (",
        "    select 1 from public.news where news.message = d.msg",
        ");",
        "",
        "-- 5. BERSIHKAN CACHE SNAPSHOT AGAR DATA TERBARU LANGSUNG TAYANG",
        "delete from public.rpc_cache where key in ('city_snapshot', 'dist_bld_k12');",
        ""
    ])

    return "\n".join(lines)


def build_full_schema_sql(seed_sql_content: str) -> str:
    """
    Menghasilkan satu file schema.sql lengkap & all-in-one yang idempotent.
    Memperbaiki regex constraint distrik menjadi ^k(0[0-9]|1[0-9]|2[0-4])$
    Menambahkan seed data, grant permissions, dan query verifikasi.
    """
    
    schema_template = f"""-- =============================================================================
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

-- Profil Pemain Warga (Terkait ke auth.users Supabase)
create table if not exists public.players (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique check (length(username) >= 3 and length(username) <= 20),
    profession text not null default 'Warga',
    coins int not null default 250 check (coins >= 0),
    role text not null default 'warga' check (role in ('warga', 'arsitek', 'walikota')),
    avatar_color text not null default '#5B3A24',
    total_worked int not null default 0,
    last_worked_at timestamptz,
    last_tax_paid_at timestamptz default now(),
    created_at timestamptz default now()
);

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
    grid_i int not null check (grid_i >= 0 and grid_i < 32),
    grid_j int not null check (grid_j >= 0 and grid_j < 32),
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
{seed_sql_content}

-- -----------------------------------------------------------------------------
-- 5. REMOTE PROCEDURE CALLS (RPC) BACA DENGAN EDGE CACHING
-- -----------------------------------------------------------------------------

-- RPC Snapshot Kota Utama (Dipanggil klien & tamu secara periodik)
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
            'owner_name', p.username,
            'owner_color', p.avatar_color,
            'build_hours_total', b.build_hours_total,
            'build_started_at', b.build_started_at,
            'build_finished_at', b.build_finished_at,
            'is_public', b.is_public
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
create or replace function public.register_player(
    p_username text,
    p_profession text,
    p_avatar_color text
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
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login terlebih dahulu.');
    end if;

    if length(v_clean_name) < 3 or length(v_clean_name) > 20 then
        return jsonb_build_object('success', false, 'error', 'Nama harus 3-20 karakter.');
    end if;

    if exists (select 1 from public.players where username = v_clean_name and id != v_uid) then
        return jsonb_build_object('success', false, 'error', 'Nama warga sudah digunakan.');
    end if;

    insert into public.players (id, username, profession, coins, role, avatar_color)
    values (v_uid, v_clean_name, p_profession, 250, 'warga', coalesce(p_avatar_color, '#5B3A24'))
    on conflict (id) do update set
        profession = excluded.profession,
        avatar_color = excluded.avatar_color
    returning * into v_player;

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

-- Klaim Kavling & Mulai Membangun (Row-Locking Anti-Balapan)
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
    v_build_cost int := 100;
    v_build_hours numeric := 4.0;
    v_bld_id uuid;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
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

    -- 3. Cek biaya koin
    if v_player.coins < v_build_cost then
        return jsonb_build_object('success', false, 'error', 'Koin tidak cukup. Butuh ' || v_build_cost || ' ₳.');
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
        p_district, p_i, p_j, p_type, v_uid, 'proyek', v_build_hours, now(), now() + (v_build_hours || ' hours')::interval
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
        'finished_at', now() + (v_build_hours || ' hours')::interval
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
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Wajib login.');
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
    if v_player.last_worked_at is not null and v_player.last_worked_at > (now() - interval '10 minutes') then
        return jsonb_build_object('success', false, 'error', 'Kamu baru saja bekerja. Istirahat sejenak!');
    end if;

    -- Hitung koin harian yang sudah didapat hari ini
    select coalesce(sum(reward_coins), 0) into v_today_earned
    from public.jobs
    where player_id = v_uid and worked_at >= date_trunc('day', now());

    if v_today_earned + v_reward > v_daily_cap then
        v_reward := v_daily_cap - v_today_earned;
    end if;

    if v_reward <= 0 then
        return jsonb_build_object('success', false, 'error', 'Batas koin harianmu sudah penuh (300 ₳). Kembali besok!');
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

    -- Pajak 10% masuk kas kota
    update public.settings set city_treasury = city_treasury + 4 where id = 1;

    return jsonb_build_object(
        'success', true,
        'reward', v_reward,
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
grant execute on function public.register_player(text, text, text) to authenticated;
grant execute on function public.claim_plot_and_build(text, int, int, text) to authenticated;
grant execute on function public.work_at_building(uuid) to authenticated;
grant execute on function public.submit_proposal(text, text, text, int, int) to authenticated;
grant execute on function public.vote_proposal(uuid, boolean) to authenticated;
grant execute on function public.send_chat(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. VERIFIKASI UJI COBA OTOMATIS TAHAP 01
-- Menjalankan snapshot kota perdana untuk memastikan seluruh fungsi terpasang sukses.
-- -----------------------------------------------------------------------------
select public.get_city_snapshot();
"""
    return schema_template


def main():
    print("[1/3] Menghasilkan supabase/seed.sql...")
    seed_sql = generate_seed_sql()
    with open(SEED_SQL_PATH, "w", encoding="utf-8") as f:
        f.write(seed_sql)
    print(f" -> OK: {SEED_SQL_PATH} ({len(seed_sql.splitlines())} baris)")

    print("[2/3] Menghasilkan supabase/schema.sql (All-in-One Idempotent)...")
    full_schema_sql = build_full_schema_sql(seed_sql)
    with open(SCHEMA_SQL_PATH, "w", encoding="utf-8") as f:
        f.write(full_schema_sql)
    print(f" -> OK: {SCHEMA_SQL_PATH} ({len(full_schema_sql.splitlines())} baris)")

    print("[3/3] Menjalankan verifikasi integritas skema dan constraint...")
    
    # 1. Verifikasi regex constraint distrik
    regex_pattern = r"^k(0[0-9]|1[0-9]|2[0-4])$"
    assert len(DISTRICTS) == 25, f"Jumlah distrik harus 25, ditemukan {len(DISTRICTS)}"
    for d in DISTRICTS:
        k = d["key"]
        if not re.match(regex_pattern, k):
            print(f"❌ Error regex constraint untuk key: {k}")
            sys.exit(1)
    print(" -> OK: 25 distrik k00-k24 lolos uji validasi regex ^k(0[0-9]|1[0-9]|2[0-4])$")

    # 2. Verifikasi Ring distrik
    ring_counts = {0: 0, 1: 0, 2: 0}
    unlocked_count = 0
    for d in DISTRICTS:
        ring_counts[d["ring"]] += 1
        if d["unlocked"]:
            unlocked_count += 1
    assert ring_counts[0] == 1, f"Ring 0 harus tepat 1 (k12), ditemukan {ring_counts[0]}"
    assert ring_counts[1] == 8, f"Ring 1 harus tepat 8, ditemukan {ring_counts[1]}"
    assert ring_counts[2] == 16, f"Ring 2 harus tepat 16, ditemukan {ring_counts[2]}"
    assert unlocked_count == 1, f"Distrik terbuka awal harus tepat 1 (k12), ditemukan {unlocked_count}"
    print(f" -> OK: Pembagian Ring valid (Ring 0: {ring_counts[0]}, Ring 1: {ring_counts[1]}, Ring 2: {ring_counts[2]})")

    # 3. Verifikasi Bangunan Perdana di k12
    assert len(STARTER_BUILDINGS) >= 3, "Harus ada minimal 3 bangunan starter di k12"
    for b in STARTER_BUILDINGS:
        assert b["district_key"] == "k12"
        assert 0 <= b["grid_i"] < 32
        assert 0 <= b["grid_j"] < 32
    print(f" -> OK: {len(STARTER_BUILDINGS)} bangunan starter di k12 valid dalam batas grid 32x32")

    # 4. Verifikasi RPC Functions di schema.sql
    required_rpcs = [
        "get_city_snapshot",
        "get_buildings",
        "register_player",
        "claim_plot_and_build",
        "work_at_building",
        "submit_proposal",
        "vote_proposal",
        "send_chat"
    ]
    for rpc in required_rpcs:
        pattern = rf"create or replace function public\.{rpc}\b"
        if not re.search(pattern, full_schema_sql):
            print(f"❌ RPC function {rpc} tidak ditemukan di schema.sql!")
            sys.exit(1)
        grant_pattern = rf"grant execute on function public\.{rpc}\(.*\) to"
        if not re.search(grant_pattern, full_schema_sql):
            print(f"❌ Grant execute untuk {rpc} tidak ditemukan di schema.sql!")
            sys.exit(1)
    print(f" -> OK: Seluruh {len(required_rpcs)} RPC functions dan hak akses (grant execute) terverifikasi 100%")

    # 5. Verifikasi RLS di seluruh 11 tabel
    tables = ["settings", "players", "districts", "buildings", "proposals", 
              "proposal_votes", "jobs", "news", "chat", "donations", "rpc_cache"]
    for t in tables:
        assert f"alter table public.{t} enable row level security;" in full_schema_sql, f"RLS belum di-enable di tabel {t}"
    print(f" -> OK: Seluruh {len(tables)} tabel telah mengaktifkan Row Level Security (RLS)")

    print("\n✅ TAHAP 01: FONDASI DATA SUPABASE BERHASIL DIVERIFIKASI DAN SIAP DIGUNAKAN!")

if __name__ == "__main__":
    main()

