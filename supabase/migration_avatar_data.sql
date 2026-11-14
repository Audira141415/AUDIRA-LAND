-- ============================================================================
-- MIGRASI: Foto profil warga lintas-perangkat (players.avatar_data)
-- Tempel SELURUH isi file INI ke Supabase SQL Editor lalu Run.
-- Idempoten: aman dijalankan berulang. JANGAN tempel file .py.
-- ============================================================================

-- 1. Kolom foto profil (data URL WebP/JPEG ≤30 KB → ±40 KB base64)
alter table public.players add column if not exists avatar_data text;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'players_avatar_data_check') then
        alter table public.players add constraint players_avatar_data_check
            check (avatar_data is null or length(avatar_data) <= 60000);
    end if;
end $$;

-- 2. register_player: param ke-5 p_avatar_data (drop signature lama dulu)
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

    if v_player.village is not null then
        update public.players pl set
            house_model = k.house_model, house_label = k.house_label,
            vehicle_model = k.vehicle_model, vehicle_label = k.vehicle_label
        from public.home_kits k
        where pl.id = v_uid and k.village = v_player.village and k.profession = v_player.profession;
        select * into v_player from public.players where id = v_uid;
    end if;

    insert into public.news (category, message)
    values ('warga', v_clean_name || ' resmi menjadi warga AUDIRA-LAND dengan profesi ' || p_profession || '!');

    delete from public.rpc_cache where key = 'city_snapshot';

    return jsonb_build_object('success', true, 'player', row_to_json(v_player));
end;
$$;

grant execute on function public.register_player(text, text, text, text, text) to authenticated;

-- 3. get_buildings: kembalikan avatar_data pemilik (foto warga lain tampil lintas-perangkat)
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
            'owner_id', b.owner_id,
            'owner_name', p.username,
            'owner_color', p.avatar_color,
            'avatar_data', p.avatar_data,
            'build_hours_total', b.build_hours_total,
            'build_started_at', b.build_started_at,
            'build_finished_at', b.build_finished_at,
            'is_public', b.is_public,
            'pf_house', b.pf_house,
            'pf_vehicle', b.pf_vehicle,
            'vehicle_len', b.vehicle_len,
            'crop', b.crop
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

-- Bersihkan cache lama agar avatar_data langsung terbawa
delete from public.rpc_cache where key like 'dist_bld_%';
