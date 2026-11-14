-- =============================================================================
-- AUDIRA-LAND: Hapus akun UJI (@tani_rilis, @petani_uji) dari DB produksi.
-- PERINGATAN: DELETE permanen, tidak bisa di-undo. Jalankan di Supabase SQL Editor.
-- Langkah: (1) jalankan blok PREVIEW dulu, pastikan hanya 2 akun uji yang muncul;
--          (2) baru jalankan blok DELETE.
-- =============================================================================

-- ---- PREVIEW (aman, hanya SELECT) -------------------------------------------
select id, username, profession, coins
from public.players
where username in ('@tani_rilis', '@petani_uji');

select id, type, district_key, grid_i, grid_j, owner_id
from public.buildings
where owner_id in (select id from public.players where username in ('@tani_rilis', '@petani_uji'));

-- ---- DELETE (permanen) ------------------------------------------------------
do $$
declare
    v_ids uuid[];
begin
    select array_agg(id) into v_ids
    from public.players
    where username in ('@tani_rilis', '@petani_uji');

    if v_ids is null then
        raise notice 'Tidak ada akun uji. Tidak ada yang dihapus.';
        return;
    end if;

    -- Baris turunan (abaikan bila tabel/kolomnya tidak ada di skemamu)
    begin delete from public.proposal_votes where voter_id = any(v_ids); exception when undefined_table or undefined_column then null; end;
    begin delete from public.proposals     where owner_id = any(v_ids); exception when undefined_table or undefined_column then null; end;
    begin delete from public.chat          where sender_id = any(v_ids); exception when undefined_table or undefined_column then null; end;

    delete from public.buildings where owner_id = any(v_ids);
    delete from public.players   where id = any(v_ids);

    delete from public.rpc_cache where key = 'city_snapshot' or key like 'dist_bld_%';
    raise notice 'Hapus % akun uji beserta bangunannya.', array_length(v_ids, 1);
end $$;
