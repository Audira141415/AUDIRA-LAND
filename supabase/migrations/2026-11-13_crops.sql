-- =============================================================================
-- AUDIRA-LAND migrasi: Tanaman Sawah + Sawah Gratis Petani (2026-11-13)
-- Aman dijalankan di DB live: hanya 'add column if not exists' & 'create or replace'
-- (tidak menghapus/menimpa data). Jalankan di Supabase SQL Editor pada proyek AUDIRA-LAND.
-- =============================================================================

-- 1. Kolom baru
alter table public.buildings add column if not exists crop text;                 -- tanaman sawah (crops.js)
alter table public.players   add column if not exists got_starter_sawah boolean not null default false; -- sawah gratis 1x/akun

-- 2. Serialisasi bangunan ikut kirim 'crop' (agar pilihan tanaman tampil setelah reload)
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

-- 3. Panen: hasil & jeda mengikuti tanaman sawah (kebun_sayur tetap 15 ₳ / 24 jam)
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

    select * into v_building from public.buildings where id = p_building_id for update;
    if v_building.id is null or v_building.owner_id is distinct from v_uid then
        return jsonb_build_object('success', false, 'error', 'Hanya pemilik yang bisa memanen.');
    end if;
    if v_building.type not in ('sawah', 'kebun_sayur') or v_building.stage <> 'selesai'
       or public.village_of_plot(v_building.district_key, v_building.grid_i) <> 'have_not' then
        return jsonb_build_object('success', false, 'error', 'Panen hanya untuk sawah / kebun sayur di Desa Have-Not.');
    end if;

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

-- 4. Pilih tanaman sawah milik sendiri (tanam ulang -> jeda panen mulai dari awal)
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
    update public.buildings set crop = p_crop, last_harvest_at = now() where id = p_building_id;
    delete from public.rpc_cache where key in ('city_snapshot', 'dist_bld_' || v_building.district_key);
    return jsonb_build_object('success', true, 'crop', p_crop, 'next_at', now() + interval '12 hours');
end;
$$;

-- 5. Sawah gratis petani baru: 1x seumur akun, tanpa biaya, langsung 'selesai'
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

-- 6. Hak akses RPC baru
grant execute on function public.set_crop(uuid, text) to authenticated;
grant execute on function public.claim_starter_sawah(text, int, int, text) to authenticated;

-- 7. Verifikasi cepat (opsional): ketiga fungsi harus muncul
-- select proname from pg_proc where proname in ('set_crop','claim_starter_sawah','harvest_building');
