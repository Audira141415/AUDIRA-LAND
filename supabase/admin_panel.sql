-- =============================================================================
-- AUDIRA-LAND: Panel Pengelola Kota "Ultimate" (Super Admin / walikota)
-- Idempoten: aman dijalankan berulang di Supabase SQL Editor (SETELAH schema.sql).
-- Spesifikasi: docs/SPEC_ADMIN_ULTIMATE.md
--
-- Model keamanan:
--  * Login pengelola = Supabase Auth email + password (bukan login anonim warga).
--  * Hak pengelola = baris public.players dengan role = 'walikota'. Kolom role tidak bisa diubah
--    dari klien: players hanya punya policy SELECT, dan register_player selalu menulis 'warga'.
--  * Setiap RPC admin_* memanggil public.assert_walikota(): non-pengelola mendapat error 42501
--    (HTTP 403) dari server, apa pun yang dikirim klien.
--  * Setiap aksi pengelola dicatat di public.admin_audit (tanpa policy: hanya fungsi definer).
--  * Panel TIDAK bisa mengangkat walikota baru; itu tetap lewat SQL di bawah.
--
-- Menjadikan sebuah akun pengelola (jalankan sekali, ganti email):
--   1. Dashboard Supabase -> Authentication -> Users -> Add user -> Create new user
--      (isi email + password, centang "Auto Confirm User").
--   2. insert into public.players (id, username, profession, role)
--      select id, 'Walikota AUDIRA', 'Pamong Praja', 'walikota' from auth.users where email = 'EMAIL_ADMIN'
--      on conflict (id) do update set role = 'walikota';
-- Mencabut: update public.players set role = 'warga' where username = 'Walikota AUDIRA';
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Pemeriksaan peran & log audit
-- -----------------------------------------------------------------------------
create or replace function public.is_walikota()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select auth.uid() is not null
       and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
       and exists (select 1 from public.players where id = auth.uid() and role = 'walikota');
$$;

create or replace function public.assert_walikota()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_walikota() then
        raise exception 'Akses ditolak: khusus pengelola kota.' using errcode = '42501';
    end if;
end;
$$;

create table if not exists public.admin_audit (
    id bigint generated always as identity primary key,
    admin_id uuid,
    admin_name text,
    action text not null,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz default now()
);
create index if not exists idx_admin_audit_created on public.admin_audit(created_at desc);
alter table public.admin_audit enable row level security;   -- tanpa policy: klien tidak bisa baca/tulis

create or replace function public.admin_log(p_action text, p_detail jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
    insert into public.admin_audit (admin_id, admin_name, action, detail)
    values (auth.uid(),
            coalesce((select username from public.players where id = auth.uid()), auth.jwt() ->> 'email'),
            p_action, coalesce(p_detail, '{}'::jsonb));
$$;

-- Siapa saya? Dipakai klien setelah login untuk membuka panel (tidak melempar error).
create or replace function public.admin_whoami()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'is_admin', public.is_walikota(),
        'username', (select username from public.players where id = auth.uid()),
        'email', auth.jwt() ->> 'email'
    );
$$;

-- -----------------------------------------------------------------------------
-- 1. Ringkasan panel: KPI, grafik kerja 24 jam, kendali, warga, chat, kabar, voting, distrik, log
-- -----------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_day timestamptz := now() - interval '24 hours';
begin
    perform public.assert_walikota();
    return jsonb_build_object(
        'server_time', now(),
        'treasury', (select city_treasury from public.settings where id = 1),
        'announcement', (select announcement from public.settings where id = 1),
        'controls', (select coalesce(city_controls, '{}'::jsonb) from public.settings where id = 1),
        'settings', (select jsonb_build_object(
                'city_name', city_name, 'daily_coin_cap', daily_coin_cap, 'vote_quorum', vote_quorum,
                'vote_duration_hours', vote_duration_hours)
            from public.settings where id = 1),
        'stats', jsonb_build_object(
            'players', (select count(*) from public.players where role <> 'walikota'),
            'have', (select count(*) from public.players where role <> 'walikota' and village = 'have'),
            'have_not', (select count(*) from public.players where role <> 'walikota' and village = 'have_not'),
            'active_24h', (select count(*) from public.players where last_worked_at > v_day),
            'banned', (select count(*) from public.players where banned),
            'buildings', (select count(*) from public.buildings),
            'public', (select count(*) from public.buildings where is_public),
            'protected', (select count(*) from public.buildings where is_protected),
            'projects', (select count(*) from public.buildings where stage <> 'selesai'),
            'jobs_24h', (select count(*) from public.jobs where worked_at > v_day),
            'wages_24h', (select coalesce(sum(reward_coins), 0) from public.jobs where worked_at > v_day),
            'coins_total', (select coalesce(sum(coins), 0) from public.players where role <> 'walikota'),
            'chat_24h', (select count(*) from public.chat where created_at > v_day),
            'voting', (select count(*) from public.proposals where status = 'voting')
        ),
        -- 24 angka: indeks 0 = 23-24 jam lalu, indeks 23 = jam terakhir
        'jobs_by_hour', (
            select jsonb_agg(coalesce(j.c, 0) order by h.h)
            from generate_series(0, 23) as h(h)
            left join (
                select least(23, floor(extract(epoch from (now() - worked_at)) / 3600)::int) as ago, count(*) as c
                from public.jobs where worked_at > v_day group by 1
            ) j on j.ago = 23 - h.h),
        'projects', coalesce((
            select jsonb_agg(t) from (
                select b.id, b.type, b.district_key, b.grid_i, b.grid_j, b.width, b.height, b.stage,
                       b.build_finished_at, p.username as owner_name
                from public.buildings b left join public.players p on p.id = b.owner_id
                where b.stage <> 'selesai'
                order by b.build_finished_at nulls last
                limit 60
            ) t), '[]'::jsonb),
        'players', coalesce((
            select jsonb_agg(t) from (
                select id, username, profession, village, coins, role, banned, muted_until,
                       total_worked, last_worked_at, created_at,
                       (select count(*) from public.buildings b where b.owner_id = pl.id) as buildings
                from public.players pl
                order by created_at desc
                limit 300
            ) t), '[]'::jsonb),
        'chat', coalesce((
            select jsonb_agg(t) from (
                select id, player_id, player_name, message, created_at from public.chat order by id desc limit 40
            ) t), '[]'::jsonb),
        'news', coalesce((
            select jsonb_agg(t) from (
                select id, category, message, created_at from public.news order by id desc limit 30
            ) t), '[]'::jsonb),
        'proposals', coalesce((
            select jsonb_agg(t) from (
                select pr.id, pr.title, pr.building_type, pr.district_key, pr.grid_i, pr.grid_j,
                       pr.votes_yes, pr.votes_no, pr.quorum, pr.status, pr.expires_at, pr.created_at,
                       p.username as proposer_name
                from public.proposals pr left join public.players p on p.id = pr.proposer_id
                order by (pr.status = 'voting') desc, pr.created_at desc
                limit 40
            ) t), '[]'::jsonb),
        'districts', coalesce((
            select jsonb_agg(t order by t.key) from (
                select d.key, d.name, d.ring, d.unlock_cost, d.is_unlocked, d.unlocked_at,
                       (select count(*) from public.buildings b where b.district_key = d.key) as buildings
                from public.districts d
            ) t), '[]'::jsonb),
        'audit', coalesce((
            select jsonb_agg(t) from (
                select id, admin_name, action, detail, created_at from public.admin_audit order by id desc limit 100
            ) t), '[]'::jsonb)
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Kendali dunia (cuaca, waktu, lalu lintas, keramaian, acara, perawatan, kunci fitur)
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_controls(p_controls jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_old jsonb;
    v_new jsonb;
    k text;
    v jsonb;
    t text;
    n numeric;
begin
    perform public.assert_walikota();
    if p_controls is null or jsonb_typeof(p_controls) <> 'object' then
        return jsonb_build_object('success', false, 'error', 'Format kendali tidak valid.');
    end if;
    select coalesce(city_controls, '{}'::jsonb) into v_old from public.settings where id = 1;
    v_new := coalesce(v_old, '{}'::jsonb);
    for k, v in select * from jsonb_each(p_controls) loop
        t := case when jsonb_typeof(v) = 'string' then v #>> '{}' end;
        n := case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric end;
        if k = 'weather' then
            if t is null or t not in ('bebas', 'auto', 'cerah', 'hujan', 'salju') then
                return jsonb_build_object('success', false, 'error', 'Cuaca tidak dikenal.');
            end if;
        elsif k = 'time' then
            if t is null or t not in ('bebas', 'auto', 'siklus', 'fajar', 'siang', 'senja', 'malam') then
                return jsonb_build_object('success', false, 'error', 'Waktu tidak dikenal.');
            end if;
        elsif k = 'event' then
            if t is null or t not in ('none', 'festival', 'kerja_bakti', 'pasar_malam', 'libur', 'darurat') then
                return jsonb_build_object('success', false, 'error', 'Acara tidak dikenal.');
            end if;
        elsif k = 'event_title' then
            if t is null or length(t) > 60 then
                return jsonb_build_object('success', false, 'error', 'Judul acara maksimal 60 karakter.');
            end if;
        elsif k = 'maintenance_msg' then
            if t is null or length(t) > 120 then
                return jsonb_build_object('success', false, 'error', 'Pesan perawatan maksimal 120 karakter.');
            end if;
        elsif k = 'traffic' then
            if n is null or n < 0 or n > 2 then
                return jsonb_build_object('success', false, 'error', 'Lalu lintas harus 0 sampai 2.');
            end if;
        elsif k = 'crowd' then
            if n is null or n < -1 or n > 1 then
                return jsonb_build_object('success', false, 'error', 'Keramaian harus -1 (otomatis) atau 0 sampai 1.');
            end if;
        elsif k = 'wage_mult' then
            if n is null or n < 0.5 or n > 3 then
                return jsonb_build_object('success', false, 'error', 'Pengali upah harus 0,5 sampai 3.');
            end if;
        elsif k = 'cooldown_min' then
            if n is null or n < 0 or n > 120 or n <> trunc(n) then
                return jsonb_build_object('success', false, 'error', 'Jeda kerja harus bilangan bulat 0 sampai 120 menit.');
            end if;
        elsif k in ('maintenance', 'chat_locked', 'build_frozen', 'work_frozen', 'vote_frozen') then
            if jsonb_typeof(v) <> 'boolean' then
                return jsonb_build_object('success', false, 'error', 'Nilai ' || k || ' harus true/false.');
            end if;
        else
            return jsonb_build_object('success', false, 'error', 'Kendali tidak dikenal: ' || left(k, 30));
        end if;
        v_new := v_new || jsonb_build_object(k, v);
    end loop;

    update public.settings set city_controls = v_new, updated_at = now() where id = 1;

    -- Kabar kota untuk perubahan yang dirasakan warga
    if coalesce(v_new ->> 'event', 'none') <> coalesce(v_old ->> 'event', 'none') then
        insert into public.news (category, message) values ('acara',
            case when coalesce(v_new ->> 'event', 'none') = 'none' then '🏁 Acara kota telah berakhir. Terima kasih, warga!'
                 else '🎪 Pemkot membuka acara: ' || coalesce(nullif(v_new ->> 'event_title', ''), v_new ->> 'event') || '!' end);
    end if;
    if coalesce(v_new ->> 'maintenance', 'false') <> coalesce(v_old ->> 'maintenance', 'false') then
        insert into public.news (category, message) values ('kota',
            case when v_new ->> 'maintenance' = 'true' then '🛠️ Kota memasuki mode perawatan. Aksi warga dijeda sementara.'
                 else '✅ Perawatan kota selesai. Selamat beraktivitas kembali!' end);
    end if;
    if coalesce(v_new ->> 'wage_mult', '1') <> coalesce(v_old ->> 'wage_mult', '1') then
        insert into public.news (category, message) values ('ekonomi',
            '💼 Upah kerja kini ×' || replace(coalesce(v_new ->> 'wage_mult', '1'), '.', ',') || ' dari tarif normal.');
    end if;

    perform public.admin_log('kendali_dunia', p_controls);
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'controls', v_new);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Ekonomi
-- -----------------------------------------------------------------------------
-- Kas kota: tambah/kurangi APBD (tidak bisa di bawah 0).
create or replace function public.admin_treasury(p_delta bigint, p_reason text default 'Alokasi APBD')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_total bigint;
    v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Alokasi APBD'), 80);
begin
    perform public.assert_walikota();
    if p_delta is null or p_delta = 0 or abs(p_delta) > 10000000 then
        return jsonb_build_object('success', false, 'error', 'Jumlah harus 1 sampai 10.000.000 ₳.');
    end if;
    update public.settings set city_treasury = greatest(0, city_treasury + p_delta), updated_at = now()
    where id = 1 returning city_treasury into v_total;
    insert into public.news (category, message)
    values ('ekonomi', '🏛️ Pemkot ' || case when p_delta > 0 then 'menambah' else 'memakai' end
        || ' kas ' || abs(p_delta) || ' ₳ untuk ' || v_reason || '.');
    perform public.admin_log('kas', jsonb_build_object('delta', p_delta, 'reason', v_reason, 'total', v_total));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'treasury', v_total);
end;
$$;

-- Aturan ekonomi & kota (null = tidak diubah).
create or replace function public.admin_set_economy(
    p_daily_cap int default null,
    p_quorum int default null,
    p_vote_hours int default null,
    p_city_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text := nullif(trim(coalesce(p_city_name, '')), '');
begin
    perform public.assert_walikota();
    if p_daily_cap is not null and (p_daily_cap < 50 or p_daily_cap > 100000) then
        return jsonb_build_object('success', false, 'error', 'Batas koin harian 50 sampai 100.000 ₳.');
    end if;
    if p_quorum is not null and (p_quorum < 1 or p_quorum > 1000) then
        return jsonb_build_object('success', false, 'error', 'Kuorum 1 sampai 1.000 suara.');
    end if;
    if p_vote_hours is not null and (p_vote_hours < 1 or p_vote_hours > 336) then
        return jsonb_build_object('success', false, 'error', 'Durasi voting 1 sampai 336 jam.');
    end if;
    if v_name is not null and (length(v_name) < 3 or length(v_name) > 40) then
        return jsonb_build_object('success', false, 'error', 'Nama kota 3 sampai 40 karakter.');
    end if;
    update public.settings set
        daily_coin_cap = coalesce(p_daily_cap, daily_coin_cap),
        vote_quorum = coalesce(p_quorum, vote_quorum),
        vote_duration_hours = coalesce(p_vote_hours, vote_duration_hours),
        city_name = coalesce(v_name, city_name),
        updated_at = now()
    where id = 1;
    perform public.admin_log('aturan_ekonomi', jsonb_build_object(
        'daily_cap', p_daily_cap, 'quorum', p_quorum, 'vote_hours', p_vote_hours, 'city_name', v_name));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

-- Bansos: bagikan koin merata dari kas kota ke warga aktif (bukan pengelola, tidak dibekukan).
create or replace function public.admin_grant_all(p_amount int, p_village text default null, p_reason text default 'Bantuan sosial')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
    v_total bigint;
    v_kas bigint;
    v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Bantuan sosial'), 60);
begin
    perform public.assert_walikota();
    if p_amount is null or p_amount < 1 or p_amount > 100000 then
        return jsonb_build_object('success', false, 'error', 'Jumlah per warga 1 sampai 100.000 ₳.');
    end if;
    if p_village is not null and p_village not in ('have', 'have_not') then
        return jsonb_build_object('success', false, 'error', 'Desa tidak dikenal.');
    end if;
    select count(*) into v_count from public.players
    where role <> 'walikota' and not banned and (p_village is null or village = p_village);
    if v_count = 0 then
        return jsonb_build_object('success', false, 'error', 'Tidak ada warga penerima.');
    end if;
    v_total := v_count::bigint * p_amount;
    select city_treasury into v_kas from public.settings where id = 1 for update;
    if v_kas < v_total then
        return jsonb_build_object('success', false, 'error',
            'Kas kurang: perlu ' || v_total || ' ₳, tersedia ' || v_kas || ' ₳.');
    end if;
    update public.players set coins = least(100000000, coins + p_amount)
    where role <> 'walikota' and not banned and (p_village is null or village = p_village);
    update public.settings set city_treasury = city_treasury - v_total, updated_at = now() where id = 1;
    insert into public.news (category, message) values ('ekonomi',
        '🎁 ' || v_reason || ': ' || v_count || ' warga '
        || case p_village when 'have' then 'Desa Have ' when 'have_not' then 'Desa Have-Not ' else '' end
        || 'menerima ' || p_amount || ' ₳ dari kas kota.');
    perform public.admin_log('bansos', jsonb_build_object('amount', p_amount, 'village', p_village, 'count', v_count, 'total', v_total));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'count', v_count, 'total', v_total, 'treasury', v_kas - v_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Siaran: pengumuman, kabar kota, chat
-- -----------------------------------------------------------------------------
create or replace function public.admin_announce(p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_msg text := trim(coalesce(p_message, ''));
begin
    perform public.assert_walikota();
    if length(v_msg) < 3 or length(v_msg) > 200 then
        return jsonb_build_object('success', false, 'error', 'Pengumuman harus 3-200 karakter.');
    end if;
    update public.settings set announcement = v_msg, updated_at = now() where id = 1;
    insert into public.news (category, message) values ('pengumuman', '📢 ' || v_msg);
    perform public.admin_log('pengumuman', jsonb_build_object('message', v_msg));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_post_news(p_category text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_msg text := trim(coalesce(p_message, ''));
begin
    perform public.assert_walikota();
    if p_category is null or p_category not in ('kota', 'ekonomi', 'warga', 'voting', 'pengumuman', 'acara') then
        return jsonb_build_object('success', false, 'error', 'Kategori kabar tidak dikenal.');
    end if;
    if length(v_msg) < 3 or length(v_msg) > 200 then
        return jsonb_build_object('success', false, 'error', 'Kabar harus 3-200 karakter.');
    end if;
    insert into public.news (category, message) values (p_category, v_msg);
    perform public.admin_log('kabar', jsonb_build_object('category', p_category, 'message', v_msg));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_delete_news(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    perform public.assert_walikota();
    delete from public.news where id = p_id;
    get diagnostics v_count = row_count;
    perform public.admin_log('hapus_kabar', jsonb_build_object('id', p_id));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', v_count > 0, 'error', case when v_count = 0 then 'Kabar tidak ditemukan.' end);
end;
$$;

create or replace function public.admin_delete_chat(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.assert_walikota();
    delete from public.chat where id = p_id;
    perform public.admin_log('hapus_chat', jsonb_build_object('id', p_id));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_clear_chat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    perform public.assert_walikota();
    delete from public.chat where true;
    get diagnostics v_count = row_count;
    perform public.admin_log('bersihkan_chat', jsonb_build_object('count', v_count));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'count', v_count);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Tata kota: bangunan
-- -----------------------------------------------------------------------------
-- Daftar bangunan dengan pencarian, filter, dan halaman.
-- p_filter: semua | proyek | selesai | publik | pribadi | lindung
create or replace function public.admin_list_buildings(
    p_query text default '',
    p_filter text default 'semua',
    p_limit int default 30,
    p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_q text := '%' || lower(trim(coalesce(p_query, ''))) || '%';
    v_lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
    v_off int := greatest(coalesce(p_offset, 0), 0);
    v_total int;
    v_rows jsonb;
begin
    perform public.assert_walikota();
    with f as (
        select b.id, b.type, b.district_key, b.grid_i, b.grid_j, b.width, b.height, b.stage,
               b.is_public, b.is_protected, b.build_finished_at, b.created_at, p.username as owner_name
        from public.buildings b left join public.players p on p.id = b.owner_id
        where (lower(b.type) like v_q or lower(coalesce(p.username, '')) like v_q or lower(b.district_key) like v_q)
          and case coalesce(p_filter, 'semua')
                when 'proyek' then b.stage <> 'selesai'
                when 'selesai' then b.stage = 'selesai'
                when 'publik' then b.is_public
                when 'pribadi' then not b.is_public
                when 'lindung' then b.is_protected
                else true end
    )
    select (select count(*) from f),
           coalesce((select jsonb_agg(x) from (select * from f order by created_at desc limit v_lim offset v_off) x), '[]'::jsonb)
    into v_total, v_rows;
    return jsonb_build_object('total', v_total, 'rows', v_rows, 'limit', v_lim, 'offset', v_off);
end;
$$;

-- Percepat satu proyek (selesai seketika).
create or replace function public.admin_finish_building(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    perform public.assert_walikota();
    update public.buildings set stage = 'selesai', build_finished_at = now()
    where id = p_building_id and stage <> 'selesai';
    get diagnostics v_count = row_count;
    if v_count > 0 then
        perform public.admin_log('percepat', jsonb_build_object('id', p_building_id));
    end if;
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', v_count > 0, 'error', case when v_count = 0 then 'Proyek tidak ditemukan atau sudah selesai.' end);
end;
$$;

-- Percepat semua proyek berjalan.
create or replace function public.admin_finish_all()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    perform public.assert_walikota();
    update public.buildings set stage = 'selesai', build_finished_at = now() where stage <> 'selesai';
    get diagnostics v_count = row_count;
    if v_count > 0 then
        insert into public.news (category, message) values ('kota', '⚡ Pemkot menyelesaikan ' || v_count || ' proyek sekaligus.');
    end if;
    perform public.admin_log('percepat_semua', jsonb_build_object('count', v_count));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'count', v_count);
end;
$$;

-- Gusur bangunan (bangunan dilindungi tidak bisa digusur).
create or replace function public.admin_demolish(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_b public.buildings%rowtype;
begin
    perform public.assert_walikota();
    select * into v_b from public.buildings where id = p_building_id for update;
    if v_b.id is null then
        return jsonb_build_object('success', false, 'error', 'Bangunan tidak ditemukan.');
    end if;
    if v_b.is_protected then
        return jsonb_build_object('success', false, 'error', 'Bangunan dilindungi, tidak bisa digusur. Buka perlindungan dulu.');
    end if;
    delete from public.buildings where id = p_building_id;
    insert into public.news (category, message)
    values ('kota', '🚧 Pemkot menggusur bangunan di ' || v_b.district_key || ' [' || v_b.grid_i || ', ' || v_b.grid_j || '].');
    perform public.admin_log('gusur', jsonb_build_object('id', p_building_id, 'type', v_b.type,
        'district_key', v_b.district_key, 'grid_i', v_b.grid_i, 'grid_j', v_b.grid_j));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'district_key', v_b.district_key, 'grid_i', v_b.grid_i, 'grid_j', v_b.grid_j);
end;
$$;

-- Ubah bangunan: lindungi/buka, ganti jenis, pindah pemilik ('' = milik Pemkot / publik). null = tidak diubah.
create or replace function public.admin_update_building(
    p_building_id uuid,
    p_protect boolean default null,
    p_type text default null,
    p_owner text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_b public.buildings%rowtype;
    v_owner uuid;
    v_owner_name text := nullif(ltrim(trim(coalesce(p_owner, '')), '@'), '');
begin
    perform public.assert_walikota();
    select * into v_b from public.buildings where id = p_building_id for update;
    if v_b.id is null then
        return jsonb_build_object('success', false, 'error', 'Bangunan tidak ditemukan.');
    end if;
    if p_type is not null and p_type !~ '^[a-z0-9_]{2,40}$' then
        return jsonb_build_object('success', false, 'error', 'Jenis bangunan tidak valid (huruf kecil, angka, _).');
    end if;
    if p_owner is not null and v_owner_name is not null then
        select id into v_owner from public.players where lower(username) = lower(v_owner_name) or lower(username) = lower('@' || v_owner_name);
        if v_owner is null then
            return jsonb_build_object('success', false, 'error', 'Warga @' || v_owner_name || ' tidak ditemukan.');
        end if;
    end if;
    update public.buildings set
        is_protected = coalesce(p_protect, is_protected),
        type = coalesce(p_type, type),
        owner_id = case when p_owner is null then owner_id else v_owner end,
        is_public = case when p_owner is null then is_public else v_owner is null end
    where id = p_building_id;
    perform public.admin_log('ubah_bangunan', jsonb_build_object('id', p_building_id,
        'protect', p_protect, 'type', p_type, 'owner', p_owner));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

-- Dirikan fasilitas publik pemkot di kavling kosong.
create or replace function public.admin_build_public(p_district text, p_i int, p_j int, p_type text default 'balai_kota')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    perform public.assert_walikota();
    if p_type is null or p_type !~ '^[a-z0-9_]{2,40}$' then
        return jsonb_build_object('success', false, 'error', 'Jenis bangunan tidak valid.');
    end if;
    if not exists (select 1 from public.districts where key = p_district) then
        return jsonb_build_object('success', false, 'error', 'Distrik tidak dikenal.');
    end if;
    if p_i is null or p_j is null or p_i < 0 or p_i >= 216 or p_j < 0 or p_j >= 216 then
        return jsonb_build_object('success', false, 'error', 'Kavling di luar peta (0-215).');
    end if;
    insert into public.buildings (district_key, grid_i, grid_j, type, stage, build_hours_total,
                                  is_public, build_started_at, build_finished_at)
    values (p_district, p_i, p_j, p_type, 'selesai', 0, true, now(), now())
    on conflict (district_key, grid_i, grid_j) do nothing
    returning id into v_id;
    if v_id is null then
        return jsonb_build_object('success', false, 'error', 'Kavling sudah terisi.');
    end if;
    insert into public.news (category, message)
    values ('kota', '🏛️ Pemkot mendirikan fasilitas publik di ' || p_district || ' [' || p_i || ', ' || p_j || '].');
    perform public.admin_log('dirikan_publik', jsonb_build_object('id', v_id, 'type', p_type,
        'district_key', p_district, 'grid_i', p_i, 'grid_j', p_j));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Distrik
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_district(
    p_key text,
    p_unlocked boolean default null,
    p_name text default null,
    p_unlock_cost bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text := nullif(trim(coalesce(p_name, '')), '');
    v_count int;
begin
    perform public.assert_walikota();
    if v_name is not null and (length(v_name) < 3 or length(v_name) > 40) then
        return jsonb_build_object('success', false, 'error', 'Nama distrik 3 sampai 40 karakter.');
    end if;
    if p_unlock_cost is not null and (p_unlock_cost < 0 or p_unlock_cost > 100000000) then
        return jsonb_build_object('success', false, 'error', 'Biaya buka 0 sampai 100.000.000 ₳.');
    end if;
    update public.districts set
        is_unlocked = coalesce(p_unlocked, is_unlocked),
        unlocked_at = case when p_unlocked is true and not is_unlocked then now()
                           when p_unlocked is false then null else unlocked_at end,
        name = coalesce(v_name, name),
        unlock_cost = coalesce(p_unlock_cost, unlock_cost)
    where key = p_key;
    get diagnostics v_count = row_count;
    if v_count = 0 then
        return jsonb_build_object('success', false, 'error', 'Distrik tidak dikenal.');
    end if;
    if p_unlocked is not null then
        insert into public.news (category, message) values ('kota',
            case when p_unlocked then '🗺️ Distrik ' || coalesce(v_name, p_key) || ' resmi dibuka untuk warga!'
                 else '🔒 Distrik ' || coalesce(v_name, p_key) || ' ditutup sementara oleh Pemkot.' end);
    end if;
    perform public.admin_log('distrik', jsonb_build_object('key', p_key, 'unlocked', p_unlocked,
        'name', v_name, 'unlock_cost', p_unlock_cost));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Warga
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_coins(p_player uuid, p_coins int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    perform public.assert_walikota();
    if p_coins is null or p_coins < 0 or p_coins > 100000000 then
        return jsonb_build_object('success', false, 'error', 'Saldo harus 0 sampai 100.000.000 ₳.');
    end if;
    update public.players set coins = p_coins where id = p_player;
    get diagnostics v_count = row_count;
    if v_count > 0 then
        perform public.admin_log('saldo', jsonb_build_object('player', p_player, 'coins', p_coins));
    end if;
    return jsonb_build_object('success', v_count > 0, 'error', case when v_count = 0 then 'Warga tidak ditemukan.' end);
end;
$$;

-- Atur warga: peran (warga/arsitek), bekukan, bisukan chat (menit; 0 = buka), reset jeda kerja.
-- null = tidak diubah. Pengelola lain tidak bisa diubah dari panel.
create or replace function public.admin_set_player(
    p_player uuid,
    p_role text default null,
    p_banned boolean default null,
    p_mute_minutes int default null,
    p_reset_cooldown boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_p public.players%rowtype;
begin
    perform public.assert_walikota();
    select * into v_p from public.players where id = p_player for update;
    if v_p.id is null then
        return jsonb_build_object('success', false, 'error', 'Warga tidak ditemukan.');
    end if;
    if v_p.role = 'walikota' then
        return jsonb_build_object('success', false, 'error', 'Pengelola tidak bisa diubah dari panel.');
    end if;
    if p_role is not null and p_role not in ('warga', 'arsitek') then
        return jsonb_build_object('success', false, 'error', 'Peran hanya warga atau arsitek.');
    end if;
    if p_mute_minutes is not null and (p_mute_minutes < 0 or p_mute_minutes > 10080) then
        return jsonb_build_object('success', false, 'error', 'Bisukan 0 sampai 10.080 menit (7 hari).');
    end if;
    update public.players set
        role = coalesce(p_role, role),
        banned = coalesce(p_banned, banned),
        muted_until = case when p_mute_minutes is null then muted_until
                           when p_mute_minutes = 0 then null
                           else now() + make_interval(mins => p_mute_minutes) end,
        last_worked_at = case when coalesce(p_reset_cooldown, false) then null else last_worked_at end
    where id = p_player;
    if p_banned is not null and p_banned <> v_p.banned then
        insert into public.news (category, message) values ('warga',
            case when p_banned then '⚠️ Akun warga ' || v_p.username || ' dibekukan pengelola.'
                 else '✅ Akun warga ' || v_p.username || ' diaktifkan kembali.' end);
    end if;
    perform public.admin_log('atur_warga', jsonb_build_object('player', p_player, 'username', v_p.username,
        'role', p_role, 'banned', p_banned, 'mute_minutes', p_mute_minutes, 'reset_cooldown', p_reset_cooldown));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

-- Keluarkan warga (rumah pribadinya ikut dibongkar). Pengelola lain tidak bisa dikeluarkan.
create or replace function public.admin_remove_player(p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_p public.players%rowtype;
begin
    perform public.assert_walikota();
    select * into v_p from public.players where id = p_player for update;
    if v_p.id is null then
        return jsonb_build_object('success', false, 'error', 'Warga tidak ditemukan.');
    end if;
    if v_p.role = 'walikota' then
        return jsonb_build_object('success', false, 'error', 'Pengelola tidak bisa dikeluarkan dari panel.');
    end if;
    delete from public.buildings where owner_id = p_player and not is_public;
    update public.proposals set proposer_id = null where proposer_id = p_player;
    delete from public.players where id = p_player;
    insert into public.news (category, message) values ('warga', '⚠️ Akun warga ' || v_p.username || ' dinonaktifkan pengelola.');
    perform public.admin_log('keluarkan_warga', jsonb_build_object('player', p_player, 'username', v_p.username));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Voting: setujui (+bangun), tolak, perpanjang 24 jam, hapus
-- -----------------------------------------------------------------------------
create or replace function public.admin_proposal(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_p public.proposals%rowtype;
    v_built uuid;
begin
    perform public.assert_walikota();
    select * into v_p from public.proposals where id = p_id for update;
    if v_p.id is null then
        return jsonb_build_object('success', false, 'error', 'Usulan tidak ditemukan.');
    end if;
    if p_action = 'approve' then
        update public.proposals set status = 'disetujui' where id = p_id;
        insert into public.buildings (district_key, grid_i, grid_j, type, stage, build_hours_total,
                                      is_public, build_started_at, build_finished_at)
        values (v_p.district_key, v_p.grid_i, v_p.grid_j, v_p.building_type, 'selesai', 0, true, now(), now())
        on conflict (district_key, grid_i, grid_j) do nothing
        returning id into v_built;
        insert into public.news (category, message)
        values ('voting', '🎉 Pemkot mengesahkan usulan ' || v_p.title || '!');
    elsif p_action = 'reject' then
        update public.proposals set status = 'ditolak' where id = p_id;
        insert into public.news (category, message) values ('voting', '❌ Usulan ' || v_p.title || ' ditolak Pemkot.');
    elsif p_action = 'extend' then
        update public.proposals set status = 'voting', expires_at = greatest(expires_at, now()) + interval '24 hours'
        where id = p_id;
    elsif p_action = 'delete' then
        delete from public.proposals where id = p_id;
    else
        return jsonb_build_object('success', false, 'error', 'Aksi usulan tidak dikenal.');
    end if;
    perform public.admin_log('voting_' || p_action, jsonb_build_object('id', p_id, 'title', v_p.title));
    delete from public.rpc_cache where key = 'city_snapshot';
    return jsonb_build_object('success', true, 'built_id', v_built);
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Hak eksekusi: fungsi baru default-nya bisa dipanggil PUBLIC (termasuk anon). Cabut, lalu beri ke
--    authenticated saja. Pemeriksaan peran tetap di dalam fungsi (assert_walikota).
-- -----------------------------------------------------------------------------
do $$
declare
    f text;
begin
    foreach f in array array[
        'public.is_walikota()', 'public.assert_walikota()', 'public.admin_log(text, jsonb)',
        'public.admin_whoami()', 'public.admin_overview()', 'public.admin_set_controls(jsonb)',
        'public.admin_treasury(bigint, text)', 'public.admin_set_economy(int, int, int, text)',
        'public.admin_grant_all(int, text, text)', 'public.admin_announce(text)',
        'public.admin_post_news(text, text)', 'public.admin_delete_news(bigint)',
        'public.admin_delete_chat(bigint)', 'public.admin_clear_chat()',
        'public.admin_list_buildings(text, text, int, int)', 'public.admin_finish_building(uuid)',
        'public.admin_finish_all()', 'public.admin_demolish(uuid)',
        'public.admin_update_building(uuid, boolean, text, text)',
        'public.admin_build_public(text, int, int, text)',
        'public.admin_set_district(text, boolean, text, bigint)', 'public.admin_set_coins(uuid, int)',
        'public.admin_set_player(uuid, text, boolean, int, boolean)', 'public.admin_remove_player(uuid)',
        'public.admin_proposal(uuid, text)'
    ] loop
        execute 'revoke execute on function ' || f || ' from public, anon';
        if f not in ('public.assert_walikota()', 'public.admin_log(text, jsonb)') then
            execute 'grant execute on function ' || f || ' to authenticated';
        end if;
    end loop;
end $$;
revoke execute on function public.admin_log(text, jsonb) from authenticated;

-- =============================================================================
-- 10. PALET ASET ADMIN — lapisan "custom placements" (docs/SPEC_ADMIN_ASSET_PALETTE.md)
--     Aset dipilih admin dari manifest polyfork lalu ditempatkan di kota. Lapisan ringan,
--     TERPISAH dari tabel buildings. Idempoten: aman di-rerun.
-- =============================================================================
create table if not exists public.admin_placements (
    id uuid primary key default gen_random_uuid(),
    asset_id text not null,
    category text not null,
    world_x double precision not null,
    world_z double precision not null,
    rot_y double precision not null default 0,
    scale double precision not null default 1,
    placed_by uuid,
    placed_name text,
    created_at timestamptz default now()
);
create index if not exists idx_admin_placements_created on public.admin_placements(created_at desc);
alter table public.admin_placements enable row level security;
-- Baca publik (anon warga perlu untuk render dunia). Tulis hanya lewat RPC definer (assert_walikota).
drop policy if exists admin_placements_read on public.admin_placements;
create policy admin_placements_read on public.admin_placements for select using (true);

-- Daftar placement untuk render (publik).
create or replace function public.list_placements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'asset_id', asset_id, 'category', category,
        'world_x', world_x, 'world_z', world_z, 'rot_y', rot_y, 'scale', scale,
        'placed_name', placed_name, 'created_at', created_at
    ) order by created_at), '[]'::jsonb)
    from public.admin_placements;
$$;

-- Tempatkan aset (admin).
create or replace function public.admin_place_asset(
    p_asset_id text,
    p_category text,
    p_world_x double precision,
    p_world_z double precision,
    p_rot_y double precision default 0,
    p_scale double precision default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.admin_placements;
begin
    perform public.assert_walikota();
    if p_asset_id is null or p_asset_id !~ '^[a-z0-9][a-z0-9-]{1,59}$' then
        return jsonb_build_object('success', false, 'error', 'ID aset tidak sah.');
    end if;
    if p_category not in ('pohon', 'bangunan', 'ternak', 'kendaraan') then
        return jsonb_build_object('success', false, 'error', 'Kategori tidak sah.');
    end if;
    if abs(coalesce(p_world_x, 0)) > 2000 or abs(coalesce(p_world_z, 0)) > 2000 then
        return jsonb_build_object('success', false, 'error', 'Koordinat di luar kota.');
    end if;
    insert into public.admin_placements (asset_id, category, world_x, world_z, rot_y, scale, placed_by, placed_name)
    values (p_asset_id, p_category, p_world_x, p_world_z,
            coalesce(p_rot_y, 0), least(greatest(coalesce(p_scale, 1), 0.25), 4),
            auth.uid(), (select username from public.players where id = auth.uid()))
    returning * into v_row;
    perform public.admin_log('tempat_aset', jsonb_build_object(
        'asset_id', v_row.asset_id, 'category', v_row.category,
        'world_x', round(v_row.world_x::numeric, 1), 'world_z', round(v_row.world_z::numeric, 1)));
    return jsonb_build_object('success', true, 'placement', jsonb_build_object(
        'id', v_row.id, 'asset_id', v_row.asset_id, 'category', v_row.category,
        'world_x', v_row.world_x, 'world_z', v_row.world_z, 'rot_y', v_row.rot_y, 'scale', v_row.scale,
        'placed_name', v_row.placed_name, 'created_at', v_row.created_at));
end;
$$;

-- Hapus placement (admin).
create or replace function public.admin_remove_asset(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_row public.admin_placements;
begin
    perform public.assert_walikota();
    delete from public.admin_placements where id = p_id returning * into v_row;
    if v_row.id is null then
        return jsonb_build_object('success', false, 'error', 'Placement tidak ditemukan.');
    end if;
    perform public.admin_log('hapus_aset', jsonb_build_object('asset_id', v_row.asset_id, 'category', v_row.category));
    return jsonb_build_object('success', true, 'id', v_row.id);
end;
$$;

-- Hak eksekusi palet aset: list publik (render), tempat/hapus admin (cek assert_walikota di dalam).
revoke execute on function public.list_placements() from public;
grant execute on function public.list_placements() to anon, authenticated;
revoke execute on function public.admin_place_asset(text, text, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.admin_place_asset(text, text, double precision, double precision, double precision, double precision) to authenticated;
revoke execute on function public.admin_remove_asset(uuid) from public, anon;
grant execute on function public.admin_remove_asset(uuid) to authenticated;
