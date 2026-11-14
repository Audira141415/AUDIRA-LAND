# AUDIRA-LAND — Data Model & Supabase RPC Specifications

> **Prinsip Utama Keamanan**: Browser tidak pernah menulis tabel database secara langsung! Seluruh mutasi data dilewatkan melalui fungsi PostgreSQL berstatus `SECURITY DEFINER` yang terisolasi dengan Row Level Security (RLS).

---

## 1. Skema Tabel PostgreSQL

```sql
-- 1. Pengaturan Global (Single Row)
create table if not exists public.settings (
    id int primary key default 1 check (id = 1),
    grid_version int not null default 1,
    daily_tax int not null default 10,
    daily_coin_cap int not null default 300,
    vote_quorum int not null default 5,
    vote_duration_hours int not null default 24,
    city_treasury bigint not null default 10000,
    created_at timestamptz default now()
);

-- 2. Profil Pemain Warga
create table if not exists public.players (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique,
    profession text not null default 'Warga',
    coins int not null default 250,
    role text not null default 'warga', -- 'warga', 'arsitek', 'walikota'
    avatar_color text not null default '#5B3A24',
    last_active timestamptz default now(),
    created_at timestamptz default now()
);

-- 3. Status 25 Distrik (k00 - k24)
create table if not exists public.districts (
    key text primary key, -- 'k00' .. 'k24'
    name text not null,
    ring int not null,
    unlock_cost bigint not null,
    is_unlocked boolean not null default false,
    unlocked_at timestamptz
);

-- 4. Bangunan & Kavling
create table if not exists public.buildings (
    id uuid primary key default gen_random_uuid(),
    district_key text not null references public.districts(key),
    grid_i int not null,
    grid_j int not null,
    width int not null default 1,
    height int not null default 1,
    type text not null, -- 'rumah_limas', 'warung_madura', 'ruko_modern', dsb.
    owner_id uuid references public.players(id),
    stage text not null default 'sketsa', -- 'sketsa', 'proyek', 'selesai'
    build_hours_total numeric not null default 4.0,
    build_started_at timestamptz default now(),
    build_finished_at timestamptz,
    is_protected boolean not null default false,
    created_at timestamptz default now(),
    constraint uq_district_plot unique (district_key, grid_i, grid_j)
);

-- 5. Usulan & Voting Bangunan Publik
create table if not exists public.proposals (
    id uuid primary key default gen_random_uuid(),
    building_type text not null,
    district_key text not null references public.districts(key),
    grid_i int not null,
    grid_j int not null,
    proposer_id uuid references public.players(id),
    votes_yes int not null default 0,
    votes_no int not null default 0,
    status text not null default 'voting', -- 'voting', 'disetujui', 'ditolak'
    expires_at timestamptz not null,
    created_at timestamptz default now()
);

-- 6. Suara Pemain (1 Pemain = 1 Suara per Proposal)
create table if not exists public.proposal_votes (
    proposal_id uuid references public.proposals(id) on delete cascade,
    player_id uuid references public.players(id) on delete cascade,
    vote boolean not null, -- true: setuju, false: tolak
    created_at timestamptz default now(),
    primary key (proposal_id, player_id)
);

-- 7. Log Pekerjaan Harian
create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    player_id uuid references public.players(id),
    building_id uuid references public.buildings(id),
    reward_coins int not null,
    worked_at timestamptz default now()
);

-- 8. Ticker Berita Kota & Chat
create table if not exists public.news (
    id bigint generated always as identity primary key,
    category text not null default 'kota',
    message text not null,
    created_at timestamptz default now()
);

create table if not exists public.chat (
    id bigint generated always as identity primary key,
    player_id uuid references public.players(id),
    player_name text not null,
    message text not null,
    created_at timestamptz default now()
);
```

---

## 2. Remote Procedure Calls (RPC) Kunci

### A. RPC Baca (Public Cacheable):
1. **`get_city_snapshot()`**:
   - Mengambil data kas kota, pajak, daftar distrik terbuka, statistik penduduk, 10 berita terkini, dan 20 chat terbaru.
   - Di-cache di layer CDN / edge selama 5 detik untuk tamu non-login.
2. **`get_buildings(p_district text)`**:
   - Mengambil seluruh daftar bangunan di satu distrik tertentu. Di-cache 15 detik per distrik.
3. **`get_npcs()`**:
   - Mengambil posisi dan rute jalan NPC (di-cache 60 detik).

### B. RPC Aksi (Khusus Pemain Login dengan Row-Locking):
1. **`claim_plot_and_build(p_district text, p_i int, p_j int, p_type text)`**:
   - Validasi `auth.uid()`.
   - Mengunci baris kavling dengan `FOR UPDATE`.
   - Cek apakah kavling masih kosong dan berada di distrik terbuka.
   - Cek saldo koin pemain, potong saldo, catat ke tabel `buildings` dengan status `'proyek'`.
   - Masukkan notifikasi ke tabel `news` ("*Warga X mulai membangun Warung Kopi di Blok B*").
2. **`work_at_building(p_building_id uuid)`**:
   - Cek batas perolehan koin harian (`daily_coin_cap`).
   - Berikan gaji koin ke pemain dan setoran pajak ke kas kota.
3. **`vote_proposal(p_proposal_id uuid, p_vote boolean)`**:
   - Memastikan 1 pemain hanya bisa memilih 1 kali.
   - Menghitung ambang kuorum setuju. Jika kuorum tercapai, ubah status menjadi `'disetujui'` dan jadwalkan konstruksi otomatis.

