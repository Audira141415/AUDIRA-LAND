-- Migrasi 2026-11-13: satu login anonim = satu warga (register_player menolak uid_taken).
-- Idempoten. Salinan fungsi register_player dari schema.sql; jalankan di Supabase SQL Editor.
create or replace function public.register_player(
    p_username text,
    p_profession text,
    p_avatar_color text,
    p_village text default null
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

    if length(v_clean_name) < 2 or length(v_clean_name) > 31 then
        return jsonb_build_object('success', false, 'error', 'Nama harus 2-31 karakter.');
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

    insert into public.players (id, username, profession, village, coins, role, avatar_color)
    values (v_uid, v_clean_name, p_profession, p_village, 250, 'warga', coalesce(p_avatar_color, '#5B3A24'))
    on conflict (id) do update set
        profession = excluded.profession,
        village = coalesce(excluded.village, public.players.village),
        avatar_color = excluded.avatar_color
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
grant execute on function public.register_player(text, text, text, text) to authenticated;
